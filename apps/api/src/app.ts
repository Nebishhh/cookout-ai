import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import {
  DOMAIN_PACKAGE_NAME,
  scaleRecipe,
  consolidateShoppingList,
  planEventShoppingList,
  GuestGroup,
  InvalidRecipeError,
  InvalidGuestGroupError,
  DomainError,
} from '@cookout-ai/domain';
import { prisma } from './prisma.js';
import {
  validateAndCreateDomainRecipe,
  toDomainRecipe,
  toRecipeJSON,
  type CreateRecipeInput,
} from './recipeMapper.js';
import { parseRecipeTextWithGemini, parseRecipeTextWithGeminiTimeout } from './geminiClient.js';
import { fetchRecipeHtml, SsrfValidationError, FetchError } from './ssrfGuard.js';
import { extractRecipeText, ExtractionError } from './extractRecipeText.js';
import { errorHandler, NotFoundError } from './middleware/errorHandler.js';

export const app = express();

app.use(cors());
app.use(express.json());

// Health Check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    app: 'CookOut AI Backend API',
    domainPackage: DOMAIN_PACKAGE_NAME,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Open Question / Scope Notes:
 * - No authentication/authorization exists yet — anyone can create or read any recipe.
 */

/**
 * Open Question / Scope Notes for Recipe Import:
 * - No rate limiting or cost controls on this endpoint yet — acceptable for personal-use v1 tool.
 * - URL import and image import are explicitly out of scope for this milestone.
 * - No caching of Gemini responses — each call is a fresh API request.
 * - ZERO database persistence — returns parsed draft data for review.
 */
app.post('/api/recipes/import-text', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { text } = req.body || {};
    if (typeof text !== 'string' || text.trim() === '') {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'Request body must contain a non-empty "text" string.',
      });
    }

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.trim() === '') {
      return res.status(500).json({
        error: 'ServerConfigurationError',
        message: 'Server is not configured for AI recipe import: GEMINI_API_KEY is missing.',
      });
    }

    let rawAiResponse: string;
    try {
      rawAiResponse = await parseRecipeTextWithGemini(text);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to call Gemini API.';
      return res.status(502).json({
        error: 'BadGateway',
        message: `Upstream AI service error: ${errorMessage}`,
      });
    }

    let parsedCandidate: unknown;
    try {
      const sanitizedResponse = rawAiResponse
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      parsedCandidate = JSON.parse(sanitizedResponse);
    } catch {
      return res.status(502).json({
        error: 'BadGateway',
        message: 'Upstream AI service returned invalid JSON response.',
      });
    }

    if (
      parsedCandidate &&
      typeof parsedCandidate === 'object' &&
      'error' in parsedCandidate &&
      (parsedCandidate as { error: string }).error === 'NoRecipeFound'
    ) {
      return res.status(502).json({
        error: 'ExtractionError',
        message:
          (parsedCandidate as { message?: string }).message ||
          'The provided text does not contain explicit recipe ingredients or quantities.',
      });
    }

    // Validate draft structure against domain rules (without persisting)
    let domainRecipe;
    try {
      domainRecipe = validateAndCreateDomainRecipe(parsedCandidate as CreateRecipeInput);
    } catch (err) {
      if (err instanceof DomainError) {
        return res.status(422).json({
          error: err.name,
          message: err.message,
        });
      }
      throw err;
    }

    // Success response: Return plain parsed draft data (no ID, no DB persistence)
    return res.status(200).json({
      name: domainRecipe.name,
      baseServings: domainRecipe.baseServings,
      dietaryTags: domainRecipe.dietaryTags,
      ingredients: domainRecipe.ingredients.map((ing) => ({
        ingredientId: ing.ingredientId,
        displayName: ing.displayName,
        amount: ing.quantity.amount,
        unit: ing.quantity.unit,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Open Questions / Scope Notes for URL Recipe Import:
 * - Basic SSRF protection implemented (http/https protocols, literal localhost check, DNS IP range lookup, manual 5-hop redirect re-validation, 10s timeout, streamed 2MB body limit).
 * - User-Agent spoofing ("CookOutAI-Recipe-Import/1.0") helps with some sites, but sites using advanced bot detection beyond header inspection may still block requests.
 * - Naive HTML-to-text fallback may produce noisy input to Gemini if no schema.org JSON-LD is found.
 * - No caching of fetched pages or parsed results — each call fetches fresh HTML and calls Gemini.
 * - Image import remains out of scope for this milestone.
 * - ZERO database persistence — returns parsed draft data for review.
 */
app.post('/api/recipes/import-url', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { url } = req.body || {};
    if (typeof url !== 'string' || url.trim() === '') {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'Request body must contain a non-empty "url" string.',
      });
    }

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.trim() === '') {
      return res.status(500).json({
        error: 'ServerConfigurationError',
        message: 'Server is not configured for AI recipe import: GEMINI_API_KEY is missing.',
      });
    }

    // Step 1: Fetch HTML (with SSRF, protocol, DNS IP, manual redirect, timeout, size limit, content-type checks)
    let html: string;
    try {
      html = await fetchRecipeHtml(url.trim());
    } catch (err) {
      if (err instanceof SsrfValidationError) {
        return res.status(400).json({
          error: err.name,
          message: err.message,
        });
      }
      if (err instanceof FetchError) {
        return res.status(err.statusCode).json({
          error: err.name,
          message: err.message,
        });
      }
      return res.status(502).json({
        error: 'BadGateway',
        message: `Failed to fetch webpage: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // Step 2: Extract text (JSON-LD priority, HTML-text fallback priority)
    let extractedText: string;
    try {
      const extracted = extractRecipeText(html);
      extractedText = extracted.extractedText;
    } catch (err) {
      if (err instanceof ExtractionError) {
        return res.status(err.statusCode).json({
          error: err.name,
          message: err.message,
        });
      }
      return res.status(502).json({
        error: 'ExtractionError',
        message: `Failed to extract text from webpage: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // Step 3: Call parseRecipeTextWithGeminiTimeout (30s timeout)
    let rawAiResponse: string;
    try {
      rawAiResponse = await parseRecipeTextWithGeminiTimeout(extractedText);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to call Gemini API.';
      return res.status(502).json({
        error: 'BadGateway',
        message: `Upstream AI service error: ${errorMessage}`,
      });
    }

    // Step 4: Parse candidate JSON
    let parsedCandidate: unknown;
    try {
      const sanitizedResponse = rawAiResponse
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      parsedCandidate = JSON.parse(sanitizedResponse);
    } catch {
      return res.status(502).json({
        error: 'BadGateway',
        message: 'Upstream AI service returned invalid JSON response.',
      });
    }

    if (
      parsedCandidate &&
      typeof parsedCandidate === 'object' &&
      'error' in parsedCandidate &&
      (parsedCandidate as { error: string }).error === 'NoRecipeFound'
    ) {
      return res.status(502).json({
        error: 'ExtractionError',
        message:
          (parsedCandidate as { message?: string }).message ||
          'The provided text does not contain explicit recipe ingredients or quantities.',
      });
    }

    // Step 5: Validate draft against domain rules
    let domainRecipe;
    try {
      domainRecipe = validateAndCreateDomainRecipe(parsedCandidate as CreateRecipeInput);
    } catch (err) {
      if (err instanceof DomainError) {
        return res.status(422).json({
          error: err.name,
          message: err.message,
        });
      }
      throw err;
    }

    // Success response: Return plain parsed draft data (no ID, no DB persistence)
    return res.status(200).json({
      name: domainRecipe.name,
      baseServings: domainRecipe.baseServings,
      dietaryTags: domainRecipe.dietaryTags,
      ingredients: domainRecipe.ingredients.map((ing) => ({
        ingredientId: ing.ingredientId,
        displayName: ing.displayName,
        amount: ing.quantity.amount,
        unit: ing.quantity.unit,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/recipes
app.post('/api/recipes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. Construct & validate domain Recipe FIRST before touching Prisma
    const domainRecipe = validateAndCreateDomainRecipe(req.body as CreateRecipeInput);

    // 2. Persist via Prisma
    const createdPrismaRecipe = await prisma.recipe.create({
      data: {
        id: domainRecipe.id,
        name: domainRecipe.name,
        baseServings: domainRecipe.baseServings,
        dietaryTagsJson: JSON.stringify(domainRecipe.dietaryTags),
        ingredients: {
          create: domainRecipe.ingredients.map((ing, idx) => ({
            ingredientId: ing.ingredientId,
            displayName: ing.displayName,
            amount: ing.quantity.amount,
            unit: ing.quantity.unit,
            position: idx,
          })),
        },
      },
      include: {
        ingredients: true,
      },
    });

    // 3. Reconstruct through domain layer on return
    const reconstructedDomainRecipe = toDomainRecipe(createdPrismaRecipe);
    res.status(201).json(toRecipeJSON(reconstructedDomainRecipe));
  } catch (err) {
    next(err);
  }
});

// GET /api/recipes
app.get('/api/recipes', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const prismaRecipes = await prisma.recipe.findMany({
      include: {
        ingredients: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const domainRecipes = prismaRecipes.map((r) => toDomainRecipe(r));
    res.json(domainRecipes.map((r) => toRecipeJSON(r)));
  } catch (err) {
    next(err);
  }
});

// GET /api/recipes/:id
app.get('/api/recipes/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
    const prismaRecipe = await prisma.recipe.findUnique({
      where: { id },
      include: {
        ingredients: true,
      },
    });

    if (!prismaRecipe) {
      throw new NotFoundError(`Recipe with id "${id}" not found.`);
    }

    const domainRecipe = toDomainRecipe(prismaRecipe);
    res.json(toRecipeJSON(domainRecipe));
  } catch (err) {
    next(err);
  }
});

// PUT /api/recipes/:id (Full Replace)
app.put('/api/recipes/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;

    // 1. Check if recipe exists
    const existingRecipe = await prisma.recipe.findUnique({
      where: { id },
    });
    if (!existingRecipe) {
      throw new NotFoundError(`Recipe with id "${id}" not found.`);
    }

    // 2. Validate request body and construct domain Recipe FIRST before modifying DB
    const domainRecipe = validateAndCreateDomainRecipe(req.body as CreateRecipeInput, id);

    // 3. Atomically update recipe and replace full ingredient list inside a transaction
    const updatedPrismaRecipe = await prisma.$transaction(async (tx) => {
      await tx.ingredientLine.deleteMany({
        where: { recipeId: id },
      });

      return await tx.recipe.update({
        where: { id },
        data: {
          name: domainRecipe.name,
          baseServings: domainRecipe.baseServings,
          dietaryTagsJson: JSON.stringify(domainRecipe.dietaryTags),
          ingredients: {
            create: domainRecipe.ingredients.map((ing, idx) => ({
              ingredientId: ing.ingredientId,
              displayName: ing.displayName,
              amount: ing.quantity.amount,
              unit: ing.quantity.unit,
              position: idx,
            })),
          },
        },
        include: {
          ingredients: true,
        },
      });
    });

    // 4. Map back through domain layer and return 200 OK
    const reconstructedDomainRecipe = toDomainRecipe(updatedPrismaRecipe);
    res.json(toRecipeJSON(reconstructedDomainRecipe));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/recipes/:id
app.delete('/api/recipes/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;

    const existingRecipe = await prisma.recipe.findUnique({
      where: { id },
    });
    if (!existingRecipe) {
      throw new NotFoundError(`Recipe with id "${id}" not found.`);
    }

    await prisma.recipe.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /api/shopping-list
app.post('/api/shopping-list', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = req.body;
    if (!Array.isArray(items)) {
      throw new InvalidRecipeError('Request body must be an array of recipe entries.');
    }

    const scaledRecipes = [];

    for (const entry of items) {
      if (!entry || typeof entry !== 'object' || !entry.recipeId) {
        throw new InvalidRecipeError('Each shopping list entry must contain a recipeId.');
      }

      const recipeId = String(entry.recipeId);
      const targetServings = entry.targetServings;

      const prismaRecipe = await prisma.recipe.findUnique({
        where: { id: recipeId },
        include: {
          ingredients: true,
        },
      });

      if (!prismaRecipe) {
        throw new NotFoundError(`Recipe not found: ${recipeId}`);
      }

      // Reconstruct domain Recipe from DB
      const domainRecipe = toDomainRecipe(prismaRecipe);

      // Scale recipe reusing scaleRecipe() from @cookout-ai/domain
      const scaled = scaleRecipe(domainRecipe, targetServings);
      scaledRecipes.push(scaled);
    }

    // Consolidate shopping list reusing consolidateShoppingList() from @cookout-ai/domain
    const consolidatedList = consolidateShoppingList(scaledRecipes);

    res.status(200).json({
      shoppingList: consolidatedList.map((item) => ({
        ingredientId: item.ingredientId,
        displayName: item.displayName,
        quantity: item.quantity.toJSON(),
        sourceRecipeIds: item.sourceRecipeIds,
      })),
      scaledRecipes: scaledRecipes.map((sr) => ({
        sourceRecipeId: sr.sourceRecipeId,
        sourceRecipeName: sr.sourceRecipeName,
        targetServings: sr.targetServings,
        scaleFactor: sr.scaleFactor,
        ingredients: sr.ingredients.map((ing) => ({
          ingredientId: ing.ingredientId,
          displayName: ing.displayName,
          quantity: ing.quantity.toJSON(),
        })),
        dietaryTags: sr.dietaryTags,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Open Question / Scope Notes for Event Planning:
 * - No persistence of event plans (matches the existing shopping-list design precedent — computed fresh on each request).
 * - No pagination or limit on recipeIds array size — acceptable for v1 scope, note as a future concern for large collections.
 */

// POST /api/events/plan
app.post('/api/events/plan', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { recipeIds, guestGroup: guestGroupInput } = req.body || {};

    // 1. Construct domain GuestGroup FIRST — validates inputs before touching DB
    if (!guestGroupInput || typeof guestGroupInput !== 'object') {
      throw new InvalidGuestGroupError('Request body must include a guestGroup object.');
    }
    const guestGroup = new GuestGroup(guestGroupInput);

    // 2. Validate recipeIds array
    if (!Array.isArray(recipeIds) || recipeIds.length === 0) {
      throw new InvalidRecipeError('recipeIds must be a non-empty array of recipe ID strings.');
    }

    // 3. Fetch each recipe in recipeIds from DB via Prisma
    const recipes = [];
    for (const id of recipeIds) {
      if (typeof id !== 'string' || id.trim().length === 0) {
        throw new InvalidRecipeError(`Invalid recipeId in array: ${id}`);
      }

      const prismaRecipe = await prisma.recipe.findUnique({
        where: { id },
        include: {
          ingredients: true,
        },
      });

      if (!prismaRecipe) {
        throw new NotFoundError(`Recipe with id "${id}" not found.`);
      }

      // Reconstruct domain Recipe reusing toDomainRecipe() mapper
      const domainRecipe = toDomainRecipe(prismaRecipe);
      recipes.push(domainRecipe);
    }

    // 4. Call planEventShoppingList() from @cookout-ai/domain
    const eventPlan = planEventShoppingList(recipes, guestGroup);

    // 5. Serialize EventPlan to JSON output
    res.status(200).json({
      guestGroup: {
        totalGuests: eventPlan.guestGroup.totalGuests,
        vegetarianCount: eventPlan.guestGroup.vegetarianCount,
        veganCount: eventPlan.guestGroup.veganCount,
        omnivoreCount: eventPlan.guestGroup.omnivoreCount,
      },
      includedRecipes: eventPlan.includedRecipes.map((item) => ({
        recipeId: item.scaledRecipe.sourceRecipeId,
        recipeName: item.scaledRecipe.sourceRecipeName,
        eligibleServings: item.eligibleServings,
        scaledIngredients: item.scaledRecipe.ingredients.map((ing) => ({
          ingredientId: ing.ingredientId,
          displayName: ing.displayName,
          quantity: ing.quantity.toJSON(),
        })),
      })),
      excludedRecipes: eventPlan.excludedRecipes.map((item) => ({
        recipeId: item.recipe.id,
        recipeName: item.recipe.name,
        reason: item.reason,
      })),
      shoppingList: eventPlan.shoppingList.map((item) => ({
        ingredientId: item.ingredientId,
        displayName: item.displayName,
        quantity: item.quantity.toJSON(),
        sourceRecipeIds: item.sourceRecipeIds,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// Central error handling middleware
app.use(errorHandler);
