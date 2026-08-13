import type { Request, Response } from 'express';
import { DomainError } from '@cookout-ai/domain';
import { parseAndValidateImageStream, ImageValidationError } from './imageValidator.js';
import { parseRecipeImageWithGeminiTimeout } from './geminiClient.js';
import {
  validateAndCreateDomainRecipe,
  stepsFromInstructions,
  type CreateRecipeInput,
} from './recipeMapper.js';
import { extractRecipeCandidate } from './aiRecipeExtraction.js';

export interface ImportRecipeImageResponseDto {
  name: string;
  baseServings: number;
  dietaryTags: string[];
  ingredients: {
    ingredientId: string;
    displayName: string;
    amount: number;
    unit: string;
  }[];
  instructions: Array<{
    instruction: string;
    duration: { amount: number; unit: string } | null;
    temperature: { amount: number; unit: string } | null;
    notes: string | null;
  }>;
}

export async function handleImportImage(req: Request, res: Response): Promise<void> {
  try {
    const { buffer, mimeType } = await parseAndValidateImageStream(req);

    const extraction = await extractRecipeCandidate((reinforceShape) =>
      parseRecipeImageWithGeminiTimeout(buffer, mimeType, undefined, reinforceShape)
    );

    if (extraction.status === 'invalid-json') {
      res.status(502).json({
        error: 'ExtractionError',
        message: 'Gemini returned malformed or non-JSON response text.',
      });
      return;
    }

    if (extraction.status === 'no-recipe-found') {
      res.status(502).json({
        error: 'ExtractionError',
        message:
          extraction.message ||
          'The provided image does not contain explicit recipe ingredients or quantities.',
      });
      return;
    }

    if (extraction.status === 'malformed-shape') {
      res.status(502).json({
        error: 'ExtractionError',
        message:
          'The AI extraction produced an incomplete recipe draft (missing a name or ingredient list), even after retrying. Try a clearer photo or entering the recipe manually.',
      });
      return;
    }

    // Domain validation via domain layer factory (zero persistence)
    let validDomainRecipe;
    try {
      const candidate = extraction.candidate as unknown as CreateRecipeInput & {
        instructions?: unknown;
      };
      validDomainRecipe = validateAndCreateDomainRecipe({
        ...candidate,
        steps: stepsFromInstructions(candidate.instructions),
      });
    } catch (err) {
      if (
        err instanceof DomainError ||
        (err instanceof Error && (err.name.startsWith('Invalid') || err.name.includes('Domain')))
      ) {
        res.status(422).json({
          error: err.name,
          message: err.message,
        });
        return;
      }
      throw err;
    }

    const responseDto: ImportRecipeImageResponseDto = {
      name: validDomainRecipe.name,
      baseServings: validDomainRecipe.baseServings,
      dietaryTags: [...validDomainRecipe.dietaryTags],
      ingredients: validDomainRecipe.ingredients.map((ing) => ({
        ingredientId: ing.ingredientId,
        displayName: ing.displayName,
        amount: ing.quantity.amount,
        unit: ing.quantity.unit,
      })),
      instructions: validDomainRecipe.steps.map((step) => ({
        instruction: step.instruction,
        duration: step.duration ? { amount: step.duration.amount, unit: step.duration.unit } : null,
        temperature: step.temperature
          ? { amount: step.temperature.amount, unit: step.temperature.unit }
          : null,
        notes: step.notes,
      })),
    };

    res.status(200).json(responseDto);
  } catch (error: unknown) {
    if (error instanceof ImageValidationError) {
      res.status(error.statusCode).json({
        error: error.errorName,
        message: error.message,
      });
      return;
    }

    if (error instanceof Error) {
      if (error.message.includes('GEMINI_API_KEY is not configured')) {
        res.status(500).json({
          error: 'InternalServerError',
          message: error.message,
        });
        return;
      }

      if (
        error.message.includes('timed out') ||
        error.message.includes('Gemini API') ||
        error.message.includes('Empty response')
      ) {
        res.status(502).json({
          error: 'BadGateway',
          message: error.message,
        });
        return;
      }
    }

    res.status(500).json({
      error: 'InternalServerError',
      message: 'An unexpected internal error occurred during image import.',
    });
  }
}
