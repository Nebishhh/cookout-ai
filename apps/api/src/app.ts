import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import {
  DOMAIN_PACKAGE_NAME,
  scaleRecipe,
  consolidateShoppingList,
  InvalidRecipeError,
} from '@cookout-ai/domain';
import { prisma } from './prisma.js';
import {
  validateAndCreateDomainRecipe,
  toDomainRecipe,
  toRecipeJSON,
  type CreateRecipeInput,
} from './recipeMapper.js';
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
 * - No update or delete endpoints yet (PATCH/DELETE /api/recipes/:id) — deliberately deferred.
 */

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

// Central error handling middleware
app.use(errorHandler);
