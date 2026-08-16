import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  DOMAIN_PACKAGE_NAME,
  scaleRecipe,
  consolidateShoppingList,
  subtractPantryStock,
  applyPracticalRounding,
  planEventShoppingList,
  GuestGroup,
  parseGuestGroupText,
  InvalidRecipeError,
  InvalidGuestGroupError,
  InvalidShoppingListError,
  DomainError,
} from '@cookout-ai/domain';
import { prisma } from './prisma.js';
import type { Prisma } from '@prisma/client';
import {
  validateAndCreateDomainRecipe,
  toDomainRecipe,
  toRecipeJSON,
  stepsFromInstructions,
  type CreateRecipeInput,
} from './recipeMapper.js';
import {
  validateAndCreateDomainEvent,
  toDomainEvent,
  toEventSummaryJSON,
  serializeEventPlan,
  type CreateEventInput,
} from './eventMapper.js';
import {
  buildShoppingListLinesFromConsolidated,
  toDomainShoppingList,
  toShoppingListJSON,
} from './shoppingListMapper.js';
import {
  getCategoryOverridesMap,
  setCategoryOverride,
  clearCategoryOverride,
} from './categoryOverrides.js';
import {
  getPantryStockMap,
  listPantryItems,
  setPantryItem,
  clearPantryItem,
} from './pantryStore.js';
import { encodeRecipeCursor, decodeRecipeCursor } from './recipePagination.js';
import {
  parseRecipeTextWithGemini,
  parseRecipeTextWithGeminiTimeout,
  parseGuestGroupWithGeminiTimeout,
  isGeminiRateLimitError,
  GEMINI_RATE_LIMIT_MESSAGE,
} from './geminiClient.js';
import { extractRecipeCandidate } from './aiRecipeExtraction.js';
import { fetchRecipeHtml, SsrfValidationError, FetchError } from './ssrfGuard.js';
import { extractRecipeText, ExtractionError } from './extractRecipeText.js';
import { handleImportImage } from './importImage.js';
import { errorHandler, NotFoundError } from './middleware/errorHandler.js';
import { requireAuth } from './middleware/requireAuth.js';
import { csrfGuard } from './middleware/csrfGuard.js';
import { getAllowedOrigins } from './allowedOrigins.js';
import {
  signup as createUserAccount,
  login as verifyUserCredentials,
  validateSignupInput,
  createSession,
  deleteSession,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  InvalidCredentialsError,
  EmailAlreadyRegisteredError,
} from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();

// A credentialed cookie session requires CORS to echo a specific allowed origin rather
// than the previous blanket `*` — `getAllowedOrigins()` is shared with csrfGuard.ts so
// both layers agree on exactly which origins are trusted (ALLOWED_ORIGINS env var,
// comma-separated; defaults to the Vite dev server's origin).
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || getAllowedOrigins().includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// CSRF defense for cookie-authenticated state-changing requests (on top of the
// SameSite=Lax session cookie set below) — applied to the whole /api surface, including
// /api/auth/login and /api/auth/signup themselves, since login CSRF is a distinct attack.
app.use('/api', csrfGuard);

// Health Check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    app: 'CookOut AI Backend API',
    domainPackage: DOMAIN_PACKAGE_NAME,
    timestamp: new Date().toISOString(),
  });
});

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: SESSION_TTL_MS,
  path: '/',
};

// POST /api/auth/signup — create an account and log in immediately.
app.post('/api/auth/signup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = validateSignupInput(req.body?.email, req.body?.password);
    const user = await createUserAccount(email, password);
    const { rawToken } = await createSession(user.id);
    res.cookie(SESSION_COOKIE_NAME, rawToken, SESSION_COOKIE_OPTIONS);
    res.status(201).json(user);
  } catch (err) {
    if (err instanceof InvalidCredentialsError) {
      return res.status(400).json({ error: err.name, message: err.message });
    }
    if (err instanceof EmailAlreadyRegisteredError) {
      return res.status(409).json({ error: err.name, message: err.message });
    }
    next(err);
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res
        .status(400)
        .json({ error: 'BadRequest', message: 'Email and password are required.' });
    }
    const user = await verifyUserCredentials(email, password);
    const { rawToken } = await createSession(user.id);
    res.cookie(SESSION_COOKIE_NAME, rawToken, SESSION_COOKIE_OPTIONS);
    res.status(200).json(user);
  } catch (err) {
    if (err instanceof InvalidCredentialsError) {
      return res.status(401).json({ error: err.name, message: err.message });
    }
    next(err);
  }
});

// POST /api/auth/logout — idempotent; clears the cookie regardless of session validity.
app.post('/api/auth/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (typeof rawToken === 'string' && rawToken !== '') {
      await deleteSession(rawToken);
    }
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me — how the frontend discovers "am I logged in" on load.
app.get('/api/auth/me', requireAuth, (req: Request, res: Response) => {
  res.json(req.user);
});

// Every route registered from this point on requires a valid session. /api/health and
// /api/auth/* above are the only exemptions (mounted before this line).
app.use('/api', requireAuth);

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

    if (
      process.env.USE_GEMINI_FIXTURES !== 'true' &&
      (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.trim() === '')
    ) {
      return res.status(500).json({
        error: 'ServerConfigurationError',
        message: 'Server is not configured for AI recipe import: GEMINI_API_KEY is missing.',
      });
    }

    let extraction;
    try {
      extraction = await extractRecipeCandidate((reinforceShape) =>
        parseRecipeTextWithGemini(text, reinforceShape)
      );
    } catch (err) {
      if (isGeminiRateLimitError(err)) {
        return res.status(429).json({ error: 'RateLimited', message: GEMINI_RATE_LIMIT_MESSAGE });
      }
      const errorMessage = err instanceof Error ? err.message : 'Failed to call Gemini API.';
      return res.status(502).json({
        error: 'BadGateway',
        message: `Upstream AI service error: ${errorMessage}`,
      });
    }

    if (extraction.status === 'invalid-json') {
      return res.status(502).json({
        error: 'BadGateway',
        message: 'Upstream AI service returned invalid JSON response.',
      });
    }

    if (extraction.status === 'no-recipe-found') {
      return res.status(502).json({
        error: 'ExtractionError',
        message:
          extraction.message ||
          'The provided text does not contain explicit recipe ingredients or quantities.',
      });
    }

    if (extraction.status === 'malformed-shape') {
      return res.status(502).json({
        error: 'ExtractionError',
        message:
          'The AI extraction produced an incomplete recipe draft (missing a name or ingredient list), even after retrying. Try rephrasing the text or entering the recipe manually.',
      });
    }

    // Validate draft structure against domain rules (without persisting)
    let domainRecipe;
    try {
      const candidate = extraction.candidate as unknown as CreateRecipeInput & {
        instructions?: unknown;
      };
      domainRecipe = validateAndCreateDomainRecipe({
        ...candidate,
        steps: stepsFromInstructions(candidate.instructions),
      });
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
      instructions: domainRecipe.steps.map((step) => ({
        instruction: step.instruction,
        duration: step.duration ? { amount: step.duration.amount, unit: step.duration.unit } : null,
        temperature: step.temperature
          ? { amount: step.temperature.amount, unit: step.temperature.unit }
          : null,
        notes: step.notes,
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

    if (
      process.env.USE_GEMINI_FIXTURES !== 'true' &&
      (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.trim() === '')
    ) {
      return res.status(500).json({
        error: 'ServerConfigurationError',
        message: 'Server is not configured for AI recipe import: GEMINI_API_KEY is missing.',
      });
    }

    let extractedText: string;
    if (process.env.USE_GEMINI_FIXTURES === 'true') {
      extractedText = `URL_TEST ${url}`;
    } else {
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
    }

    // Step 3: Call parseRecipeTextWithGeminiTimeout (30s timeout), with a bounded shape-guard retry
    let extraction;
    try {
      extraction = await extractRecipeCandidate((reinforceShape) =>
        parseRecipeTextWithGeminiTimeout(extractedText, undefined, reinforceShape)
      );
    } catch (err) {
      if (isGeminiRateLimitError(err)) {
        return res.status(429).json({ error: 'RateLimited', message: GEMINI_RATE_LIMIT_MESSAGE });
      }
      const errorMessage = err instanceof Error ? err.message : 'Failed to call Gemini API.';
      return res.status(502).json({
        error: 'BadGateway',
        message: `Upstream AI service error: ${errorMessage}`,
      });
    }

    // Step 4: Map extraction outcome to a response
    if (extraction.status === 'invalid-json') {
      return res.status(502).json({
        error: 'BadGateway',
        message: 'Upstream AI service returned invalid JSON response.',
      });
    }

    if (extraction.status === 'no-recipe-found') {
      return res.status(502).json({
        error: 'ExtractionError',
        message:
          extraction.message ||
          'The provided text does not contain explicit recipe ingredients or quantities.',
      });
    }

    if (extraction.status === 'malformed-shape') {
      return res.status(502).json({
        error: 'ExtractionError',
        message:
          'The AI extraction produced an incomplete recipe draft (missing a name or ingredient list), even after retrying. Try rephrasing the text or entering the recipe manually.',
      });
    }

    // Step 5: Validate draft against domain rules
    let domainRecipe;
    try {
      const candidate = extraction.candidate as unknown as CreateRecipeInput & {
        instructions?: unknown;
      };
      domainRecipe = validateAndCreateDomainRecipe({
        ...candidate,
        steps: stepsFromInstructions(candidate.instructions),
      });
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
      instructions: domainRecipe.steps.map((step) => ({
        instruction: step.instruction,
        duration: step.duration ? { amount: step.duration.amount, unit: step.duration.unit } : null,
        temperature: step.temperature
          ? { amount: step.temperature.amount, unit: step.temperature.unit }
          : null,
        notes: step.notes,
      })),
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/recipes/import-image', handleImportImage);

// POST /api/recipes
app.post('/api/recipes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. Construct & validate domain Recipe FIRST before touching Prisma
    const domainRecipe = validateAndCreateDomainRecipe(req.body as CreateRecipeInput);

    // 2. Persist via Prisma
    const createdPrismaRecipe = await prisma.recipe.create({
      data: {
        id: domainRecipe.id,
        userId: req.user!.id,
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
        steps: {
          create: domainRecipe.steps.map((step, idx) => ({
            instruction: step.instruction,
            position: idx,
            durationAmount: step.duration?.amount ?? null,
            durationUnit: step.duration?.unit ?? null,
            temperatureAmount: step.temperature?.amount ?? null,
            temperatureUnit: step.temperature?.unit ?? null,
            notes: step.notes,
          })),
        },
      },
      include: {
        ingredients: true,
        steps: true,
      },
    });

    // 3. Reconstruct through domain layer on return
    const reconstructedDomainRecipe = toDomainRecipe(createdPrismaRecipe);
    res.status(201).json(toRecipeJSON(reconstructedDomainRecipe));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/recipes — dual-shape by design: the paginated shape only activates when `limit`
 * is present in the query string, so the no-params call stays byte-for-byte identical to
 * today's unbounded bare-array response. ShoppingListBuilder/EventPlanner's useRecipes() call
 * this with no params and need the *full* catalog as a selector — only RecipeList opts into
 * pagination (see useRecipesPage() in apps/web/src/lib/queries.ts).
 */
app.get('/api/recipes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit: limitRaw, cursor: cursorRaw, search, tags: tagsRaw } = req.query;

    if (typeof limitRaw !== 'string') {
      const prismaRecipes = await prisma.recipe.findMany({
        where: { userId: req.user!.id },
        include: {
          ingredients: true,
          steps: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      const domainRecipes = prismaRecipes.map((r) => toDomainRecipe(r));
      res.json(domainRecipes.map((r) => toRecipeJSON(r)));
      return;
    }

    const limit = Number(limitRaw);
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new InvalidRecipeError(`Invalid limit: "${limitRaw}". Must be a positive integer.`);
    }

    const andClauses: Prisma.RecipeWhereInput[] = [{ userId: req.user!.id }];

    if (typeof search === 'string' && search.trim().length > 0) {
      andClauses.push({ name: { contains: search.trim() } });
    }

    if (typeof tagsRaw === 'string' && tagsRaw.trim().length > 0) {
      for (const tag of tagsRaw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)) {
        // dietaryTagsJson is a JSON-encoded string column (see prisma/schema.prisma's tradeoff
        // note on Recipe.dietaryTagsJson), so a per-tag substring check stands in for a real
        // array-contains query — safe here since dietary tags are a small controlled enum.
        andClauses.push({ dietaryTagsJson: { contains: `"${tag}"` } });
      }
    }

    if (typeof cursorRaw === 'string' && cursorRaw.trim().length > 0) {
      const cursor = decodeRecipeCursor(cursorRaw);
      andClauses.push({
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      });
    }

    const prismaRecipes = await prisma.recipe.findMany({
      where: andClauses.length > 0 ? { AND: andClauses } : undefined,
      include: {
        ingredients: true,
        steps: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });

    const domainRecipes = prismaRecipes.map((r) => toDomainRecipe(r));
    const items = domainRecipes.map((r) => toRecipeJSON(r));

    const lastRow = prismaRecipes[prismaRecipes.length - 1];
    const nextCursor =
      prismaRecipes.length === limit && lastRow
        ? encodeRecipeCursor({ createdAt: lastRow.createdAt, id: lastRow.id })
        : null;

    res.json({ items, nextCursor });
  } catch (err) {
    next(err);
  }
});

// GET /api/recipes/:id
app.get('/api/recipes/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
    const prismaRecipe = await prisma.recipe.findFirst({
      where: { id, userId: req.user!.id },
      include: {
        ingredients: true,
        steps: true,
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

    // 1. Check if recipe exists AND is owned by the caller — a wrong-owner id 404s exactly
    // like a nonexistent one, so ownership is never leaked via a different status code.
    const existingRecipe = await prisma.recipe.findFirst({
      where: { id, userId: req.user!.id },
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
      await tx.recipeStep.deleteMany({
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
          steps: {
            create: domainRecipe.steps.map((step, idx) => ({
              instruction: step.instruction,
              position: idx,
              durationAmount: step.duration?.amount ?? null,
              durationUnit: step.duration?.unit ?? null,
              temperatureAmount: step.temperature?.amount ?? null,
              temperatureUnit: step.temperature?.unit ?? null,
              notes: step.notes,
            })),
          },
        },
        include: {
          ingredients: true,
          steps: true,
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

    const existingRecipe = await prisma.recipe.findFirst({
      where: { id, userId: req.user!.id },
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

      const prismaRecipe = await prisma.recipe.findFirst({
        where: { id: recipeId, userId: req.user!.id },
        include: {
          ingredients: true,
          steps: true,
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
    const pantryStock = await getPantryStockMap(req.user!.id);
    const afterPantry = subtractPantryStock(consolidatedList, pantryStock);
    const practicallyRounded = applyPracticalRounding(afterPantry);
    const categoryOverrides = await getCategoryOverridesMap(req.user!.id);

    res.status(200).json({
      shoppingList: practicallyRounded.map((item) => ({
        ingredientId: item.ingredientId,
        displayName: item.displayName,
        quantity: item.quantity.toJSON(),
        sourceRecipeIds: item.sourceRecipeIds,
        category: categoryOverrides.get(item.ingredientId) ?? item.category,
        categoryIsOverridden: categoryOverrides.has(item.ingredientId),
        mathematicalQuantity: item.mathematicalQuantity.toJSON(),
        wasRoundedForPurchase: item.wasRoundedForPurchase,
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
 * Open Question / Scope Notes for Guest-Description Quick-Fill:
 * - Regex-first, AI-fallback hybrid: parseGuestGroupText() (packages/domain) runs first, for
 *   free and instantly; Gemini is only called when it returns null (can't confidently determine
 *   totalGuests). A request the heuristic can resolve never requires GEMINI_API_KEY to be
 *   configured at all — a real, testable property of this design, not just an optimization.
 * - No bounded-retry orchestrator on the AI-fallback path — see geminiClient.ts's doc comment
 *   on parseGuestGroupWithGemini for why that's deliberate, not missing.
 * - ZERO database persistence — returns a draft {totalGuests, vegetarianCount, veganCount} for
 *   the client to review and apply to local form state, same convention as every other AI
 *   import route.
 */
const MAX_GUEST_DESCRIPTION_LENGTH = 500;

app.post(
  '/api/events/parse-description',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { description } = req.body || {};
      if (typeof description !== 'string' || description.trim() === '') {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'Request body must contain a non-empty "description" string.',
        });
      }
      if (description.length > MAX_GUEST_DESCRIPTION_LENGTH) {
        return res.status(400).json({
          error: 'BadRequest',
          message: `"description" must be ${MAX_GUEST_DESCRIPTION_LENGTH} characters or fewer.`,
        });
      }

      const heuristicResult = parseGuestGroupText(description);

      let candidate: { totalGuests: number; vegetarianCount?: number; veganCount?: number };
      let source: 'heuristic' | 'ai';

      if (heuristicResult) {
        candidate = heuristicResult;
        source = 'heuristic';
      } else {
        if (
          process.env.USE_GEMINI_FIXTURES !== 'true' &&
          (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.trim() === '')
        ) {
          return res.status(500).json({
            error: 'ServerConfigurationError',
            message:
              'Server is not configured for AI event-description parsing: GEMINI_API_KEY is missing.',
          });
        }

        let rawAiResponse: string;
        try {
          rawAiResponse = await parseGuestGroupWithGeminiTimeout(description);
        } catch (err) {
          if (isGeminiRateLimitError(err)) {
            return res
              .status(429)
              .json({ error: 'RateLimited', message: GEMINI_RATE_LIMIT_MESSAGE });
          }
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
          (parsedCandidate as { error: string }).error === 'AmbiguousGuestCount'
        ) {
          return res.status(502).json({
            error: 'ExtractionError',
            message:
              (parsedCandidate as { message?: string }).message ||
              'The provided description does not clearly state a total guest count.',
          });
        }

        candidate = parsedCandidate as {
          totalGuests: number;
          vegetarianCount?: number;
          veganCount?: number;
        };
        source = 'ai';
      }

      let guestGroup: GuestGroup;
      try {
        guestGroup = new GuestGroup(candidate);
      } catch (err) {
        if (err instanceof DomainError) {
          return res.status(422).json({
            error: err.name,
            message: err.message,
          });
        }
        throw err;
      }

      return res.status(200).json({
        totalGuests: guestGroup.totalGuests,
        vegetarianCount: guestGroup.vegetarianCount,
        veganCount: guestGroup.veganCount,
        source,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Open Question / Scope Notes for Event Planning:
 * - This route remains a stateless preview; see POST /api/events for persistence.
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

      const prismaRecipe = await prisma.recipe.findFirst({
        where: { id, userId: req.user!.id },
        include: {
          ingredients: true,
          steps: true,
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
    const categoryOverrides = await getCategoryOverridesMap(req.user!.id);
    const pantryStock = await getPantryStockMap(req.user!.id);
    res.status(200).json(serializeEventPlan(eventPlan, categoryOverrides, pantryStock));
  } catch (err) {
    next(err);
  }
});

/**
 * Open Question / Scope Notes for persisted Events:
 * - "Recompute live": only name/guestGroup/recipeIds are persisted. GET routes recompute
 *   the plan fresh via planEventShoppingList() on every read — never cached.
 * - A recipeId that no longer resolves to a Recipe is silently dropped from the recomputed
 *   plan (tracked as droppedRecipeIds in the response) rather than 404ing the whole event.
 */

// POST /api/events
app.post('/api/events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const domainEvent = validateAndCreateDomainEvent(req.body as CreateEventInput);

    const createdPrismaEvent = await prisma.event.create({
      data: {
        id: domainEvent.id,
        userId: req.user!.id,
        name: domainEvent.name,
        totalGuests: domainEvent.guestGroup.totalGuests,
        vegetarianCount: domainEvent.guestGroup.vegetarianCount,
        veganCount: domainEvent.guestGroup.veganCount,
        recipeIdsJson: JSON.stringify(domainEvent.recipeIds),
      },
    });

    const reconstructedEvent = toDomainEvent(createdPrismaEvent);

    const recipes = [];
    for (const id of reconstructedEvent.recipeIds) {
      const prismaRecipe = await prisma.recipe.findFirst({
        where: { id, userId: req.user!.id },
        include: { ingredients: true, steps: true },
      });
      if (prismaRecipe) {
        recipes.push(toDomainRecipe(prismaRecipe));
      }
    }

    const eventPlan = planEventShoppingList(recipes, reconstructedEvent.guestGroup);
    const categoryOverrides = await getCategoryOverridesMap(req.user!.id);
    const pantryStock = await getPantryStockMap(req.user!.id);

    res.status(201).json({
      ...toEventSummaryJSON(reconstructedEvent),
      ...serializeEventPlan(eventPlan, categoryOverrides, pantryStock),
      droppedRecipeIds: [],
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/events — summary shape only, no recomputed plan per row
app.get('/api/events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prismaEvents = await prisma.event.findMany({
      where: { userId: req.user!.id },
      include: { shoppingList: { select: { id: true } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json(
      prismaEvents.map((e) => toEventSummaryJSON(toDomainEvent(e), e.shoppingList?.id ?? null))
    );
  } catch (err) {
    next(err);
  }
});

// GET /api/events/:id — recomputes the plan live from current recipe data
app.get('/api/events/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
    const prismaEvent = await prisma.event.findFirst({
      where: { id, userId: req.user!.id },
      include: { shoppingList: { select: { id: true } } },
    });

    if (!prismaEvent) {
      throw new NotFoundError(`Event with id "${id}" not found.`);
    }

    const domainEvent = toDomainEvent(prismaEvent);

    const recipes = [];
    const droppedRecipeIds: string[] = [];
    for (const recipeId of domainEvent.recipeIds) {
      const prismaRecipe = await prisma.recipe.findFirst({
        where: { id: recipeId, userId: req.user!.id },
        include: { ingredients: true, steps: true },
      });
      if (prismaRecipe) {
        recipes.push(toDomainRecipe(prismaRecipe));
      } else {
        droppedRecipeIds.push(recipeId);
      }
    }

    const eventPlan = planEventShoppingList(recipes, domainEvent.guestGroup);
    const categoryOverrides = await getCategoryOverridesMap(req.user!.id);
    const pantryStock = await getPantryStockMap(req.user!.id);

    res.json({
      ...toEventSummaryJSON(domainEvent, prismaEvent.shoppingList?.id ?? null),
      ...serializeEventPlan(eventPlan, categoryOverrides, pantryStock),
      droppedRecipeIds,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/events/:id — single scalar-column update, preserves any linked ShoppingList
app.put('/api/events/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;

    const existingEvent = await prisma.event.findFirst({ where: { id, userId: req.user!.id } });
    if (!existingEvent) {
      throw new NotFoundError(`Event with id "${id}" not found.`);
    }

    const domainEvent = validateAndCreateDomainEvent(req.body as CreateEventInput, id);

    const updatedPrismaEvent = await prisma.event.update({
      where: { id },
      data: {
        name: domainEvent.name,
        totalGuests: domainEvent.guestGroup.totalGuests,
        vegetarianCount: domainEvent.guestGroup.vegetarianCount,
        veganCount: domainEvent.guestGroup.veganCount,
        recipeIdsJson: JSON.stringify(domainEvent.recipeIds),
      },
      include: { shoppingList: { select: { id: true } } },
    });

    const reconstructedEvent = toDomainEvent(updatedPrismaEvent);

    const recipes = [];
    const droppedRecipeIds: string[] = [];
    for (const recipeId of reconstructedEvent.recipeIds) {
      const prismaRecipe = await prisma.recipe.findFirst({
        where: { id: recipeId, userId: req.user!.id },
        include: { ingredients: true, steps: true },
      });
      if (prismaRecipe) {
        recipes.push(toDomainRecipe(prismaRecipe));
      } else {
        droppedRecipeIds.push(recipeId);
      }
    }

    const eventPlan = planEventShoppingList(recipes, reconstructedEvent.guestGroup);
    const categoryOverrides = await getCategoryOverridesMap(req.user!.id);
    const pantryStock = await getPantryStockMap(req.user!.id);

    res.json({
      ...toEventSummaryJSON(reconstructedEvent, updatedPrismaEvent.shoppingList?.id ?? null),
      ...serializeEventPlan(eventPlan, categoryOverrides, pantryStock),
      droppedRecipeIds,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/events/:id
app.delete('/api/events/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;

    const existingEvent = await prisma.event.findFirst({ where: { id, userId: req.user!.id } });
    if (!existingEvent) {
      throw new NotFoundError(`Event with id "${id}" not found.`);
    }

    await prisma.event.delete({ where: { id } });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/**
 * Open Question / Scope Notes for persisted ShoppingLists:
 * - Neither this route nor the event-linked one accepts client-supplied quantities — the
 *   server always re-runs toDomainRecipe -> scaleRecipe -> consolidateShoppingList itself
 *   before persisting, matching the domain layer's "re-enforce invariants regardless of
 *   data source" philosophy.
 * - Regenerating a list (POST here for standalone, PUT for event-linked) is a full
 *   delete-and-recreate — no attempt is made to preserve prior checked state by matching
 *   ingredients across regenerations (a deliberate, reviewed tradeoff, not an oversight).
 */

// POST /api/shopping-lists — standalone, persisted (eventId always null here)
app.post('/api/shopping-lists', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, sourceItems } = req.body || {};

    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new InvalidShoppingListError('Request body must include a non-empty name.');
    }

    if (!Array.isArray(sourceItems)) {
      throw new InvalidRecipeError('sourceItems must be an array of recipe entries.');
    }

    const scaledRecipes = [];
    for (const entry of sourceItems) {
      if (!entry || typeof entry !== 'object' || !entry.recipeId) {
        throw new InvalidRecipeError('Each shopping list entry must contain a recipeId.');
      }

      const recipeId = String(entry.recipeId);
      const targetServings = entry.targetServings;

      const prismaRecipe = await prisma.recipe.findFirst({
        where: { id: recipeId, userId: req.user!.id },
        include: { ingredients: true, steps: true },
      });

      if (!prismaRecipe) {
        throw new NotFoundError(`Recipe not found: ${recipeId}`);
      }

      const domainRecipe = toDomainRecipe(prismaRecipe);
      scaledRecipes.push(scaleRecipe(domainRecipe, targetServings));
    }

    const consolidatedList = consolidateShoppingList(scaledRecipes);
    const pantryStock = await getPantryStockMap(req.user!.id);
    const afterPantry = subtractPantryStock(consolidatedList, pantryStock);
    const practicallyRounded = applyPracticalRounding(afterPantry);
    const domainLines = buildShoppingListLinesFromConsolidated(practicallyRounded);

    const createdPrismaList = await prisma.shoppingList.create({
      data: {
        id: crypto.randomUUID(),
        userId: req.user!.id,
        name: name.trim(),
        eventId: null,
        items: {
          create: domainLines.map((line, idx) => ({
            ingredientId: line.ingredientId,
            displayName: line.displayName,
            amount: line.quantity.amount,
            unit: line.quantity.unit,
            sourceRecipeIdsJson: JSON.stringify(line.sourceRecipeIds),
            checked: line.checked,
            position: idx,
          })),
        },
      },
      include: { items: true },
    });

    const reconstructedList = toDomainShoppingList(createdPrismaList);
    const categoryOverrides = await getCategoryOverridesMap(req.user!.id);
    res.status(201).json(toShoppingListJSON(reconstructedList, categoryOverrides));
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/events/:eventId/shopping-list — idempotent "save/regenerate this event's list".
 * Recomputes the event's live plan (same as GET /api/events/:id), then replaces any existing
 * linked ShoppingList wholesale inside a transaction. PUT (not POST) because repeat calls
 * converge on the same result, matching the @unique constraint on ShoppingList.eventId — a
 * POST implying "always create new" would violate it on a second call.
 */
app.put(
  '/api/events/:eventId/shopping-list',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const eventId = (
        Array.isArray(req.params.eventId) ? req.params.eventId[0] : req.params.eventId
      ) as string;

      const prismaEvent = await prisma.event.findFirst({
        where: { id: eventId, userId: req.user!.id },
      });
      if (!prismaEvent) {
        throw new NotFoundError(`Event with id "${eventId}" not found.`);
      }

      const domainEvent = toDomainEvent(prismaEvent);

      const recipes = [];
      for (const recipeId of domainEvent.recipeIds) {
        const prismaRecipe = await prisma.recipe.findFirst({
          where: { id: recipeId, userId: req.user!.id },
          include: { ingredients: true, steps: true },
        });
        if (prismaRecipe) {
          recipes.push(toDomainRecipe(prismaRecipe));
        }
      }

      const eventPlan = planEventShoppingList(recipes, domainEvent.guestGroup);
      const pantryStock = await getPantryStockMap(req.user!.id);
      const afterPantry = subtractPantryStock(eventPlan.shoppingList, pantryStock);
      const practicallyRounded = applyPracticalRounding(afterPantry);
      const domainLines = buildShoppingListLinesFromConsolidated(practicallyRounded);

      const { name: overrideName } = req.body || {};
      const listName =
        typeof overrideName === 'string' && overrideName.trim().length > 0
          ? overrideName.trim()
          : domainEvent.name;

      const newPrismaList = await prisma.$transaction(async (tx) => {
        // Deleting the ShoppingList row cascades its ShoppingListItem rows automatically
        // (onDelete: Cascade) — full delete-and-recreate discards prior checked state.
        await tx.shoppingList.deleteMany({ where: { eventId } });

        return tx.shoppingList.create({
          data: {
            id: crypto.randomUUID(),
            userId: req.user!.id,
            name: listName,
            eventId,
            items: {
              create: domainLines.map((line, idx) => ({
                ingredientId: line.ingredientId,
                displayName: line.displayName,
                amount: line.quantity.amount,
                unit: line.quantity.unit,
                sourceRecipeIdsJson: JSON.stringify(line.sourceRecipeIds),
                checked: line.checked,
                position: idx,
              })),
            },
          },
          include: { items: true },
        });
      });

      const categoryOverrides = await getCategoryOverridesMap(req.user!.id);
      res
        .status(200)
        .json(toShoppingListJSON(toDomainShoppingList(newPrismaList), categoryOverrides));
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/shopping-lists — plain DB read, safe to include items (no recompute cost)
app.get('/api/shopping-lists', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prismaLists = await prisma.shoppingList.findMany({
      where: { userId: req.user!.id },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });

    const categoryOverrides = await getCategoryOverridesMap(req.user!.id);
    res.json(
      prismaLists.map((l) => toShoppingListJSON(toDomainShoppingList(l), categoryOverrides))
    );
  } catch (err) {
    next(err);
  }
});

// GET /api/shopping-lists/:id
app.get('/api/shopping-lists/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;
    const prismaList = await prisma.shoppingList.findFirst({
      where: { id, userId: req.user!.id },
      include: { items: true },
    });

    if (!prismaList) {
      throw new NotFoundError(`Shopping list with id "${id}" not found.`);
    }

    const categoryOverrides = await getCategoryOverridesMap(req.user!.id);
    res.json(toShoppingListJSON(toDomainShoppingList(prismaList), categoryOverrides));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/shopping-lists/:id — cascades items, no effect on a linked Event
app.delete('/api/shopping-lists/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) as string;

    const existingList = await prisma.shoppingList.findFirst({
      where: { id, userId: req.user!.id },
    });
    if (!existingList) {
      throw new NotFoundError(`Shopping list with id "${id}" not found.`);
    }

    await prisma.shoppingList.delete({ where: { id } });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// PATCH /api/shopping-lists/:listId/items/:itemId — cheap, targeted toggle (fires on every checkbox tap)
app.patch(
  '/api/shopping-lists/:listId/items/:itemId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const listId = (
        Array.isArray(req.params.listId) ? req.params.listId[0] : req.params.listId
      ) as string;
      const itemId = (
        Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId
      ) as string;
      const { checked } = req.body || {};

      if (typeof checked !== 'boolean') {
        throw new InvalidShoppingListError('Request body must include a boolean "checked" field.');
      }

      const existingItem = await prisma.shoppingListItem.findFirst({
        where: { id: itemId, shoppingListId: listId, shoppingList: { userId: req.user!.id } },
      });
      if (!existingItem) {
        throw new NotFoundError(
          `Shopping list item with id "${itemId}" not found in list "${listId}".`
        );
      }

      const updatedItem = await prisma.shoppingListItem.update({
        where: { id: itemId },
        data: { checked },
      });

      res.json({ id: updatedItem.id, checked: updatedItem.checked });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/ingredient-categories/:ingredientId — set (or replace) a manual grocery-category
 * correction for an ingredient, globally by ingredientId (see categoryOverrides.ts). Every
 * route above that emits a shopping-list item's `category` re-reads the overrides table, so
 * this retroactively corrects that ingredient everywhere it appears — past and future lists.
 */
app.put(
  '/api/ingredient-categories/:ingredientId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ingredientId = (
        Array.isArray(req.params.ingredientId)
          ? req.params.ingredientId[0]
          : req.params.ingredientId
      ) as string;
      const { category } = req.body || {};

      const saved = await setCategoryOverride(req.user!.id, ingredientId, category);
      res.status(200).json(saved);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/ingredient-categories/:ingredientId — revert to the keyword heuristic. Idempotent.
app.delete(
  '/api/ingredient-categories/:ingredientId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ingredientId = (
        Array.isArray(req.params.ingredientId)
          ? req.params.ingredientId[0]
          : req.params.ingredientId
      ) as string;

      await clearCategoryOverride(req.user!.id, ingredientId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Pantry endpoints — a per-user, standing on-hand quantity per ingredient (see pantryStore.ts).
 * Read by every shopping-list-producing route via getPantryStockMap() + subtractPantryStock();
 * these three routes are the only place pantry state itself is written.
 */

// GET /api/pantry — list all pantry items, for the pantry-management UI.
app.get('/api/pantry', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await listPantryItems(req.user!.id);
    res.json(
      items.map((item) => ({
        ingredientId: item.ingredientId,
        displayName: item.displayName,
        quantity: item.quantity.toJSON(),
      }))
    );
  } catch (err) {
    next(err);
  }
});

// PUT /api/pantry/:ingredientId — set (or replace) on-hand stock for an ingredient.
app.put('/api/pantry/:ingredientId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ingredientId = (
      Array.isArray(req.params.ingredientId) ? req.params.ingredientId[0] : req.params.ingredientId
    ) as string;
    const { displayName, amount, unit } = req.body || {};

    const saved = await setPantryItem(req.user!.id, ingredientId, displayName, amount, unit);
    res.status(200).json({
      ingredientId: saved.ingredientId,
      displayName: saved.displayName,
      quantity: saved.quantity.toJSON(),
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/pantry/:ingredientId — remove on-hand stock (the ingredient is fully needed again). Idempotent.
app.delete('/api/pantry/:ingredientId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ingredientId = (
      Array.isArray(req.params.ingredientId) ? req.params.ingredientId[0] : req.params.ingredientId
    ) as string;

    await clearPantryItem(req.user!.id, ingredientId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/**
 * Serve the built frontend (apps/web/dist) from the same origin as the API, so
 * VITE_API_BASE_URL can stay unset in production and calls stay same-origin.
 * Gated on NODE_ENV=production AND the dist actually existing, so local dev
 * (separate Vite dev server on :3000) and any misconfigured non-production run
 * are completely unaffected — this never runs during `npm run dev` or in CI.
 * The fallback route's negative lookahead excludes /api/* so it can never shadow
 * an API route or turn an unmatched /api/* request into an HTML response. Hash-based
 * routing (#recipes, #shopping-list, #event-planner) means only `/` needs to resolve
 * to index.html — there's no server-side deep path to reconstruct.
 */
const webDistPath = path.resolve(__dirname, '../../web/dist');
const webIndexHtmlPath = path.join(webDistPath, 'index.html');

if (process.env.NODE_ENV === 'production' && fs.existsSync(webIndexHtmlPath)) {
  app.use(express.static(webDistPath));
  app.get(/^\/(?!api\/).*/, (_req: Request, res: Response) => {
    res.sendFile(webIndexHtmlPath);
  });
}

// Central error handling middleware
app.use(errorHandler);
