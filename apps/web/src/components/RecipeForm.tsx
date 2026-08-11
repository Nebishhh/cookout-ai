import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  X,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
  Info,
  Upload,
  Image as ImageIcon,
  Camera,
} from 'lucide-react';
import type { IngredientInput, RecipeDto } from '../lib/api';
import {
  useCreateRecipe,
  useUpdateRecipe,
  useImportRecipeText,
  useImportRecipeUrl,
  useImportRecipeImage,
} from '../lib/queries';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Select } from './ui/select';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';

const SUPPORTED_UNITS_BY_CATEGORY = [
  { category: 'Mass', units: ['g', 'kg', 'oz', 'lb'] },
  { category: 'Volume', units: ['ml', 'l', 'tsp', 'tbsp', 'cup', 'fl oz'] },
  { category: 'Count', units: ['count', 'clove', 'egg', 'onion'] },
];

interface ImportableIngredient {
  ingredientId: string;
  displayName: string;
  amount: number;
  unit: string;
}

function toIngredientInputs(ingredients: ImportableIngredient[]): IngredientInput[] {
  return ingredients.map((ing) => ({
    ingredientId: ing.ingredientId,
    displayName: ing.displayName,
    amount: ing.amount,
    unit: ing.unit,
  }));
}

interface ImportDraft {
  name: string;
  baseServings: number;
  dietaryTags?: string[];
  ingredients: ImportableIngredient[];
}

/**
 * Maps an AI-parsed import draft (text/URL/image/camera) onto the recipe form's field
 * shape. The single seam for "how a draft becomes form state" — every import mode
 * applies its result through this, rather than repeating the field mapping.
 */
function applyImportDraft(draft: ImportDraft) {
  return {
    name: draft.name,
    baseServings: draft.baseServings,
    dietaryTags: draft.dietaryTags ?? [],
    ingredients: toIngredientInputs(draft.ingredients),
  };
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const IMAGE_CAPTURE_COPY = {
  image: {
    inputId: 'import-image-input',
    capture: undefined as 'environment' | undefined,
    label:
      'Upload an image of a recipe card, cookbook page, or handwritten note (JPEG, PNG, WebP up to 8MB)',
    DropzoneIcon: Upload,
    dropzoneText: 'Drag and drop an image file here, or click to browse',
    importIdleLabel: 'Import from Image',
    importPendingLabel: 'Analyzing Image with AI...',
  },
  camera: {
    inputId: 'import-camera-input',
    capture: 'environment' as 'environment' | undefined,
    label:
      'Take a photo of a recipe card, cookbook page, or handwritten note using your camera (JPEG, PNG, WebP up to 8MB)',
    DropzoneIcon: Camera,
    dropzoneText: 'Tap to open camera & take a picture, or drag and drop a file',
    importIdleLabel: 'Import from Picture',
    importPendingLabel: 'Analyzing Photo with AI...',
  },
} as const;

interface ImageCaptureFieldProps {
  mode: 'image' | 'camera';
  selectedFile: File | null;
  previewUrl: string | null;
  isDragging: boolean;
  isImporting: boolean;
  onDragStateChange: (dragging: boolean) => void;
  onFileSelected: (file: File) => void;
  onRemoveFile: () => void;
  onImport: () => void;
}

/**
 * One seam for both image-upload and camera-capture import modes — they differ only in
 * copy, icon, and the input's `capture` attribute, all resolved from IMAGE_CAPTURE_COPY.
 * The drop-zone, preview, and submit-button behavior live here exactly once.
 */
const ImageCaptureField: React.FC<ImageCaptureFieldProps> = ({
  mode,
  selectedFile,
  previewUrl,
  isDragging,
  isImporting,
  onDragStateChange,
  onFileSelected,
  onRemoveFile,
  onImport,
}) => {
  const copy = IMAGE_CAPTURE_COPY[mode];

  return (
    <>
      <Label htmlFor={copy.inputId} className="text-xs text-ink-muted">
        {copy.label}
      </Label>

      <input
        id={copy.inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture={copy.capture}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileSelected(file);
        }}
      />

      {!selectedFile ? (
        <motion.button
          type="button"
          animate={{ scale: isDragging ? 1.015 : 1 }}
          transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          onDragOver={(e) => {
            e.preventDefault();
            onDragStateChange(true);
          }}
          onDragLeave={() => onDragStateChange(false)}
          onDrop={(e) => {
            e.preventDefault();
            onDragStateChange(false);
            const file = e.dataTransfer.files?.[0];
            if (file) onFileSelected(file);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              document.getElementById(copy.inputId)?.click();
            }
          }}
          onClick={() => document.getElementById(copy.inputId)?.click()}
          className={`w-full flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors cursor-pointer ${
            isDragging
              ? 'border-clay bg-clay-light'
              : 'border-stone bg-canvas hover:border-stone-dark hover:bg-canvas-dark'
          }`}
        >
          <copy.DropzoneIcon className="mb-2 h-8 w-8 text-clay" />
          <p className="text-xs font-medium text-ink">{copy.dropzoneText}</p>
          <p className="mt-1 text-[11px] text-ink-subtle">JPEG, PNG, or WebP (max 8MB)</p>
        </motion.button>
      ) : (
        <div className="flex items-center justify-between rounded-xl border border-stone bg-canvas p-3">
          <div className="flex items-center space-x-3">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Recipe preview"
                className="h-12 w-12 rounded-lg object-cover border border-stone"
              />
            ) : (
              <ImageIcon className="h-8 w-8 text-clay" />
            )}
            <div className="text-left">
              <p className="text-xs font-medium text-ink truncate max-w-[200px] sm:max-w-[300px]">
                {selectedFile.name}
              </p>
              <p className="text-[11px] text-ink-subtle">{formatFileSize(selectedFile.size)}</p>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemoveFile}
            disabled={isImporting}
            className="h-8 px-2 text-xs text-ink-muted hover:text-clay-hover"
          >
            <X className="h-4 w-4" />
            <span>Remove</span>
          </Button>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={onImport}
          disabled={isImporting || !selectedFile}
          className="space-x-2 bg-clay px-4 text-xs font-semibold text-white hover:bg-clay-hover disabled:opacity-50"
        >
          {isImporting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
              <span>{copy.importPendingLabel}</span>
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5 text-white" />
              <span>{copy.importIdleLabel}</span>
            </>
          )}
        </Button>
      </div>
    </>
  );
};

export interface RecipeFormProps {
  recipe?: RecipeDto | null;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const RecipeForm: React.FC<RecipeFormProps> = ({ recipe, onSuccess, onCancel }) => {
  const isEditing = Boolean(recipe);

  const [name, setName] = useState(recipe?.name || '');
  const [baseServings, setBaseServings] = useState<number>(recipe?.baseServings || 4);
  const [dietaryTags, setDietaryTags] = useState<string[]>(recipe?.dietaryTags || []);
  const [ingredients, setIngredients] = useState<IngredientInput[]>(
    recipe
      ? toIngredientInputs(recipe.ingredients)
      : [{ ingredientId: '', displayName: '', amount: 1, unit: 'g' }]
  );

  const [importText, setImportText] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [importMode, setImportMode] = useState<'text' | 'url' | 'image' | 'camera'>('text');
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [showImportSection, setShowImportSection] = useState(false);
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);

  const [validationError, setValidationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const createRecipeMutation = useCreateRecipe();
  const updateRecipeMutation = useUpdateRecipe();
  const importRecipeTextMutation = useImportRecipeText();
  const importRecipeUrlMutation = useImportRecipeUrl();
  const importRecipeImageMutation = useImportRecipeImage();

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  useEffect(() => {
    if (recipe) {
      setName(recipe.name);
      setBaseServings(recipe.baseServings);
      setDietaryTags(recipe.dietaryTags || []);
      setIngredients(toIngredientInputs(recipe.ingredients));
    } else {
      setName('');
      setBaseServings(4);
      setDietaryTags([]);
      setIngredients([{ ingredientId: '', displayName: '', amount: 1, unit: 'g' }]);
    }
    setValidationError(null);
    setSuccessMessage(null);
    setReviewNotice(null);
    setImportText('');
    setImportUrl('');
    setImportMode('text');
    setSelectedImageFile(null);
    setImagePreviewUrl((prevUrl) => {
      if (prevUrl) URL.revokeObjectURL(prevUrl);
      return null;
    });
  }, [recipe]);

  const handleTagToggle = (tag: string) => {
    setDietaryTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const handleAddIngredient = () => {
    setIngredients((prev) => [
      ...prev,
      { ingredientId: '', displayName: '', amount: 1, unit: 'g' },
    ]);
  };

  const handleRemoveIngredient = (index: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  };

  const handleIngredientChange = (
    index: number,
    field: keyof IngredientInput,
    value: string | number
  ) => {
    setIngredients((prev) =>
      prev.map((ing, i) => (i === index ? { ...ing, [field]: value } : ing))
    );
  };

  const handleFileSelection = (file: File) => {
    setValidationError(null);
    setSuccessMessage(null);
    setReviewNotice(null);

    const MAX_SIZE = 8 * 1024 * 1024; // 8MB
    if (file.size > MAX_SIZE) {
      handleRemoveImageFile();
      setValidationError('Selected file exceeds 8MB size limit.');
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      handleRemoveImageFile();
      setValidationError('Invalid file type. Please select a JPEG, PNG, or WebP image.');
      return;
    }

    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    const newPreview = URL.createObjectURL(file);
    setSelectedImageFile(file);
    setImagePreviewUrl(newPreview);
  };

  const handleRemoveImageFile = () => {
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setSelectedImageFile(null);
    setImagePreviewUrl(null);
  };

  const handleImportText = () => {
    setValidationError(null);
    setSuccessMessage(null);
    setReviewNotice(null);

    if (!importText.trim()) {
      setValidationError('Please paste recipe text to import.');
      return;
    }

    importRecipeTextMutation.mutate(importText.trim(), {
      onSuccess: (draft) => {
        const applied = applyImportDraft(draft);
        setName(applied.name);
        setBaseServings(applied.baseServings);
        setDietaryTags(applied.dietaryTags);
        setIngredients(applied.ingredients);
        setImportText('');
        setReviewNotice(
          'Imported via AI — please review all fields, especially dietary tags and ingredient amounts, before saving.'
        );
      },
    });
  };

  const handleImportUrl = () => {
    setValidationError(null);
    setSuccessMessage(null);
    setReviewNotice(null);

    if (!importUrl.trim()) {
      setValidationError('Please enter a recipe URL to import.');
      return;
    }

    importRecipeUrlMutation.mutate(importUrl.trim(), {
      onSuccess: (draft) => {
        const applied = applyImportDraft(draft);
        setName(applied.name);
        setBaseServings(applied.baseServings);
        setDietaryTags(applied.dietaryTags);
        setIngredients(applied.ingredients);
        setImportUrl('');
        setReviewNotice(
          'Imported via AI — please review all fields, especially dietary tags and ingredient amounts, before saving.'
        );
      },
    });
  };

  const handleImportImage = () => {
    setValidationError(null);
    setSuccessMessage(null);
    setReviewNotice(null);

    if (!selectedImageFile) {
      setValidationError('Please select or drop an image file to import.');
      return;
    }

    importRecipeImageMutation.mutate(selectedImageFile, {
      onSuccess: (draft) => {
        const applied = applyImportDraft(draft);
        setName(applied.name);
        setBaseServings(applied.baseServings);
        setDietaryTags(applied.dietaryTags);
        setIngredients(applied.ingredients);
        handleRemoveImageFile();
        setReviewNotice(
          'Imported via AI — please review all fields, especially dietary tags and ingredient amounts, before saving.'
        );
      },
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setSuccessMessage(null);

    if (!name.trim()) {
      setValidationError('Recipe name is required.');
      return;
    }

    if (baseServings <= 0 || !Number.isInteger(baseServings)) {
      setValidationError('Base servings must be a positive integer.');
      return;
    }

    if (ingredients.length === 0) {
      setValidationError('Recipe must have at least one ingredient.');
      return;
    }

    for (let i = 0; i < ingredients.length; i++) {
      const ing = ingredients[i];
      if (!ing.displayName.trim()) {
        setValidationError(`Ingredient #${i + 1} display name is required.`);
        return;
      }
      if (!ing.ingredientId.trim()) {
        setValidationError(`Ingredient #${i + 1} ID is required.`);
        return;
      }
      if (ing.amount < 0 || isNaN(ing.amount)) {
        setValidationError(`Ingredient #${i + 1} amount must be 0 or greater.`);
        return;
      }
    }

    const payload = {
      name: name.trim(),
      baseServings,
      dietaryTags,
      ingredients: ingredients.map((ing) => ({
        ingredientId: ing.ingredientId.trim(),
        displayName: ing.displayName.trim(),
        amount: ing.amount,
        unit: ing.unit,
      })),
    };

    if (isEditing && recipe) {
      updateRecipeMutation.mutate(
        { id: recipe.id, data: payload },
        {
          onSuccess: (updated) => {
            setSuccessMessage(`Recipe "${updated.name}" updated successfully!`);
            if (onSuccess) onSuccess();
          },
        }
      );
    } else {
      createRecipeMutation.mutate(payload, {
        onSuccess: (created) => {
          setSuccessMessage(`Recipe "${created.name}" created successfully!`);
          setName('');
          setBaseServings(4);
          setDietaryTags([]);
          setIngredients([{ ingredientId: '', displayName: '', amount: 1, unit: 'g' }]);
          setReviewNotice(null);
          if (onSuccess) onSuccess();
        },
      });
    }
  };

  const isPending = createRecipeMutation.isPending || updateRecipeMutation.isPending;
  const displayError =
    validationError ||
    (createRecipeMutation.error ? createRecipeMutation.error.message : null) ||
    (updateRecipeMutation.error ? updateRecipeMutation.error.message : null) ||
    (importRecipeTextMutation.error ? importRecipeTextMutation.error.message : null) ||
    (importRecipeUrlMutation.error ? importRecipeUrlMutation.error.message : null) ||
    (importRecipeImageMutation.error ? importRecipeImageMutation.error.message : null);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>{isEditing ? `Edit Recipe: ${recipe?.name}` : 'Create New Recipe'}</CardTitle>
          <CardDescription>
            {isEditing
              ? 'Update ingredient quantities, base servings, or dietary tags for this recipe.'
              : 'Add a new recipe to your collection with ingredients and serving size.'}
          </CardDescription>
        </div>

        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="space-x-1.5 text-ink-muted hover:text-ink"
          >
            <X className="h-4 w-4" />
            <span>Cancel</span>
          </Button>
        )}
      </CardHeader>

      <CardContent>
        {/* AI Import Container */}
        {!isEditing && (
          <div className="mb-6 rounded-2xl border border-clay/30 bg-clay-light/40 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-clay-hover">
                <Sparkles className="h-4 w-4 text-clay" />
                <span className="text-sm font-semibold">Import Recipe with AI</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowImportSection((prev) => !prev)}
                className="space-x-1 text-xs text-clay-hover hover:bg-canvas hover:text-ink"
              >
                <span>{showImportSection ? 'Hide Import Tools' : 'Paste Recipe Text'}</span>
                {showImportSection ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>

            {showImportSection && (
              <div className="mt-3 space-y-3">
                {/* Sub-mode selector tabs */}
                <div className="flex space-x-2 border-b border-stone/60 pb-2">
                  <button
                    type="button"
                    onClick={() => {
                      setImportMode('text');
                      setValidationError(null);
                    }}
                    className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                      importMode === 'text'
                        ? 'border border-clay/30 bg-clay-light text-clay-hover font-semibold'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    Paste Text
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setImportMode('url');
                      setValidationError(null);
                    }}
                    className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                      importMode === 'url'
                        ? 'border border-clay/30 bg-clay-light text-clay-hover font-semibold'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    URL Link
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setImportMode('image');
                      setValidationError(null);
                    }}
                    className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                      importMode === 'image'
                        ? 'border border-clay/30 bg-clay-light text-clay-hover font-semibold'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    Upload Image
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setImportMode('camera');
                      setValidationError(null);
                    }}
                    className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                      importMode === 'camera'
                        ? 'border border-clay/30 bg-clay-light text-clay-hover font-semibold'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    Take Picture
                  </button>
                </div>

                <AnimatePresence>
                  <motion.div
                    key={importMode}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                    className="space-y-3"
                  >
                    {importMode === 'text' && (
                      <>
                        <Label htmlFor="import-text-input" className="text-xs text-ink-muted">
                          Paste unformatted recipe text below (ingredients, servings, instructions)
                        </Label>
                        <textarea
                          id="import-text-input"
                          rows={4}
                          value={importText}
                          onChange={(e) => setImportText(e.target.value)}
                          placeholder="e.g. Grandma's Pancakes&#10;Serves 4&#10;- 2 cups flour&#10;- 2 eggs&#10;- 300 ml milk"
                          className="w-full rounded-xl border border-stone bg-canvas p-3 text-xs text-ink placeholder:text-ink-subtle focus:border-clay focus:outline-none focus:ring-1 focus:ring-clay"
                        />
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            onClick={handleImportText}
                            disabled={importRecipeTextMutation.isPending || !importText.trim()}
                            className="space-x-2 bg-clay px-4 text-xs font-semibold text-white hover:bg-clay-hover disabled:opacity-50"
                          >
                            {importRecipeTextMutation.isPending ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
                                <span>Importing with AI...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="h-3.5 w-3.5 text-white" />
                                <span>Import with AI</span>
                              </>
                            )}
                          </Button>
                        </div>
                      </>
                    )}

                    {importMode === 'url' && (
                      <>
                        <Label htmlFor="import-url-input" className="text-xs text-ink-muted">
                          Enter recipe webpage URL below (e.g. food blog or recipe site)
                        </Label>
                        <Input
                          id="import-url-input"
                          type="url"
                          value={importUrl}
                          onChange={(e) => setImportUrl(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (!importRecipeUrlMutation.isPending && importUrl.trim()) {
                                handleImportUrl();
                              }
                            }
                          }}
                          placeholder="https://example.com/recipes/pancakes"
                        />
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            onClick={handleImportUrl}
                            disabled={importRecipeUrlMutation.isPending || !importUrl.trim()}
                            className="space-x-2 bg-clay px-4 text-xs font-semibold text-white hover:bg-clay-hover disabled:opacity-50"
                          >
                            {importRecipeUrlMutation.isPending ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
                                <span>Importing from URL...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="h-3.5 w-3.5 text-white" />
                                <span>Import from URL</span>
                              </>
                            )}
                          </Button>
                        </div>
                      </>
                    )}

                    {importMode === 'image' && (
                      <ImageCaptureField
                        mode="image"
                        selectedFile={selectedImageFile}
                        previewUrl={imagePreviewUrl}
                        isDragging={isDragging}
                        isImporting={importRecipeImageMutation.isPending}
                        onDragStateChange={setIsDragging}
                        onFileSelected={handleFileSelection}
                        onRemoveFile={handleRemoveImageFile}
                        onImport={handleImportImage}
                      />
                    )}

                    {importMode === 'camera' && (
                      <ImageCaptureField
                        mode="camera"
                        selectedFile={selectedImageFile}
                        previewUrl={imagePreviewUrl}
                        isDragging={isDragging}
                        isImporting={importRecipeImageMutation.isPending}
                        onDragStateChange={setIsDragging}
                        onFileSelected={handleFileSelection}
                        onRemoveFile={handleRemoveImageFile}
                        onImport={handleImportImage}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            )}
          </div>
        )}

        {reviewNotice && (
          <Alert className="mb-6 border-clay/40 bg-clay-light text-clay-hover">
            <Info className="h-4 w-4 text-clay" />
            <AlertDescription className="text-xs">{reviewNotice}</AlertDescription>
          </Alert>
        )}

        {displayError && (
          <Alert className="mb-6 border-clay-border bg-clay-light text-clay-hover">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{displayError}</AlertDescription>
          </Alert>
        )}

        {successMessage && (
          <Alert className="mb-6 border-olive-border bg-olive-light text-olive-hover">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="recipe-name">Recipe Name</Label>
            <Input
              id="recipe-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Grandma's Pancakes"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="base-servings">Base Servings</Label>
            <Input
              id="base-servings"
              type="number"
              min={1}
              step={1}
              value={baseServings}
              onChange={(e) => setBaseServings(parseInt(e.target.value, 10) || 0)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Dietary Tags (Optional)</Label>
            <div className="flex flex-wrap gap-4 pt-1">
              {['Vegetarian', 'Vegan'].map((tag) => (
                <div key={tag} className="flex items-center space-x-2">
                  <Checkbox
                    id={`tag-${tag}`}
                    checked={dietaryTags.includes(tag)}
                    onChange={() => handleTagToggle(tag)}
                  />
                  <Label
                    htmlFor={`tag-${tag}`}
                    className="text-sm font-semibold cursor-pointer text-ink"
                  >
                    {tag}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Ingredients</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddIngredient}
                className="space-x-1 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Ingredient</span>
              </Button>
            </div>

            <div className="space-y-3">
              {ingredients.map((ing, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-center sm:gap-3 rounded-xl border border-stone bg-paper p-3"
                >
                  <div className="sm:col-span-3">
                    <Input
                      aria-label="ID (e.g. flour)"
                      placeholder="ID (e.g. flour)"
                      value={ing.ingredientId}
                      onChange={(e) => handleIngredientChange(idx, 'ingredientId', e.target.value)}
                    />
                  </div>

                  <div className="sm:col-span-4">
                    <Input
                      aria-label="Display Name (e.g. All-Purpose Flour)"
                      placeholder="Display Name (e.g. All-Purpose Flour)"
                      value={ing.displayName}
                      onChange={(e) => handleIngredientChange(idx, 'displayName', e.target.value)}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <Input
                      aria-label="Amount"
                      type="number"
                      min={0}
                      step="any"
                      placeholder="Amount"
                      value={ing.amount}
                      onChange={(e) =>
                        handleIngredientChange(idx, 'amount', parseFloat(e.target.value) || 0)
                      }
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <Select
                      aria-label="Unit"
                      value={ing.unit}
                      onChange={(e) => handleIngredientChange(idx, 'unit', e.target.value)}
                    >
                      {SUPPORTED_UNITS_BY_CATEGORY.map((cat) => (
                        <optgroup key={cat.category} label={cat.category}>
                          {cat.units.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </Select>
                  </div>

                  <div className="sm:col-span-1 flex justify-end">
                    {ingredients.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveIngredient(idx)}
                        className="h-9 w-9 p-0 text-ink-subtle hover:text-clay-hover"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 flex justify-end space-x-3">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : isEditing ? (
                'Save Changes'
              ) : (
                'Create Recipe'
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
