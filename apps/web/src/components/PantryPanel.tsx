import React, { useState } from 'react';
import { AlertCircle, RefreshCw, Package, Trash2, PlusCircle } from 'lucide-react';
import { usePantryItems, useSetPantryItem, useClearPantryItem } from '../lib/queries';
import { formatQuantityAmount } from '../lib/formatQuantity';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select } from './ui/select';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';

const SUPPORTED_UNITS_BY_CATEGORY = [
  { category: 'Mass', units: ['g', 'kg', 'oz', 'lb'] },
  { category: 'Volume', units: ['ml', 'l', 'tsp', 'tbsp', 'cup', 'fl oz'] },
  { category: 'Count', units: ['count', 'clove', 'egg', 'onion'] },
];

/**
 * A global, standing "what I already have" list — not scoped to one shopping-list build.
 * Every shopping-list-producing route (preview, save, event-linked regenerate/plan) reads
 * current pantry stock server-side and subtracts it automatically, so editing here has no
 * separate "apply" step; it's reflected the next time any list is built or an event's
 * saved plan is viewed.
 */
export const PantryPanel: React.FC = () => {
  const { data: items = [], isLoading, isError, error, refetch } = usePantryItems();
  const setPantryItemMutation = useSetPantryItem();
  const clearPantryItemMutation = useClearPantryItem();

  const [ingredientId, setIngredientId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [amount, setAmount] = useState(1);
  const [unit, setUnit] = useState('g');
  const [formError, setFormError] = useState<string | null>(null);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!ingredientId.trim() || !displayName.trim()) {
      setFormError('Ingredient ID and display name are required.');
      return;
    }

    setPantryItemMutation.mutate(
      { ingredientId: ingredientId.trim(), displayName: displayName.trim(), amount, unit },
      {
        onSuccess: () => {
          setIngredientId('');
          setDisplayName('');
          setAmount(1);
        },
        onError: (err) => setFormError(err.message),
      }
    );
  };

  const handleRemove = (id: string) => {
    clearPantryItemMutation.mutate(id);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between border-b border-stone pb-4">
        <div className="flex items-center space-x-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-olive-light text-olive">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="font-serif text-lg font-bold text-ink">Pantry</CardTitle>
            <CardDescription className="text-xs text-ink-muted">
              What you already have on hand — subtracted from every shopping list you build.
            </CardDescription>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="space-x-1.5 border-stone text-ink"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </Button>
      </CardHeader>

      <CardContent className="space-y-5 pt-6">
        {(isError || formError) && (
          <Alert className="border-clay/30 bg-clay-light text-clay-hover">
            <AlertCircle className="h-5 w-5 text-clay-hover" />
            <AlertDescription className="text-sm">
              {formError || (error instanceof Error ? error.message : 'Failed to load pantry.')}
            </AlertDescription>
          </Alert>
        )}

        <form
          onSubmit={handleAdd}
          className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_6rem_7rem_auto] sm:items-end"
        >
          <div>
            <Label htmlFor="pantry-ingredient-id" className="text-xs text-ink-muted">
              Ingredient ID
            </Label>
            <Input
              id="pantry-ingredient-id"
              value={ingredientId}
              onChange={(e) => setIngredientId(e.target.value)}
              placeholder="e.g. flour"
              className="mt-1 h-9 bg-canvas border-stone"
            />
          </div>
          <div>
            <Label htmlFor="pantry-display-name" className="text-xs text-ink-muted">
              Display Name
            </Label>
            <Input
              id="pantry-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Flour"
              className="mt-1 h-9 bg-canvas border-stone"
            />
          </div>
          <div>
            <Label htmlFor="pantry-amount" className="text-xs text-ink-muted">
              Amount
            </Label>
            <Input
              id="pantry-amount"
              type="number"
              min={0}
              step="any"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="mt-1 h-9 bg-canvas border-stone"
            />
          </div>
          <div>
            <Label htmlFor="pantry-unit" className="text-xs text-ink-muted">
              Unit
            </Label>
            <Select
              id="pantry-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="mt-1 h-9 bg-canvas border-stone"
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
          <Button
            type="submit"
            disabled={setPantryItemMutation.isPending}
            className="h-9 space-x-1.5 bg-olive text-white hover:bg-olive-hover disabled:opacity-50"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            <span>{setPantryItemMutation.isPending ? 'Saving...' : 'Add / Update'}</span>
          </Button>
        </form>

        {isLoading ? (
          <div className="flex items-center justify-center py-6 text-ink-muted">
            <RefreshCw className="mr-2 h-5 w-5 animate-spin text-clay" />
            <span className="text-sm font-medium">Loading pantry...</span>
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing on hand yet — add an ingredient above.</p>
        ) : (
          <div className="divide-y divide-stone/60">
            {items.map((item) => (
              <div key={item.ingredientId} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <span className="text-sm font-semibold text-ink">{item.displayName}</span>
                  <span className="ml-2 text-xs text-ink-muted">({item.ingredientId})</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-xl border border-stone/60 bg-canvas px-3 py-1.5 font-mono text-xs font-semibold text-ink-muted">
                    {formatQuantityAmount(
                      item.quantity.amount,
                      item.quantity.unit,
                      item.quantity.category,
                      'display'
                    )}{' '}
                    {item.quantity.unit}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(item.ingredientId)}
                    disabled={clearPantryItemMutation.isPending}
                    aria-label={`Remove ${item.displayName} from pantry`}
                    className="h-8 px-2 text-xs text-ink-muted hover:text-clay-hover"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
