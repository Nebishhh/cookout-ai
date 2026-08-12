import React from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, RefreshCw, ShoppingBag, Trash2, CheckSquare, Link2 } from 'lucide-react';
import { useShoppingLists, useDeleteShoppingList } from '../lib/queries';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';

export interface SavedShoppingListsProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDeleted?: () => void;
}

export const SavedShoppingLists: React.FC<SavedShoppingListsProps> = ({
  selectedId,
  onSelect,
  onDeleted,
}) => {
  const { data: lists = [], isLoading, isError, error, refetch } = useShoppingLists();
  const deleteListMutation = useDeleteShoppingList();

  const handleDelete = (list: { id: string; name: string }) => {
    if (window.confirm(`Are you sure you want to delete "${list.name}"?`)) {
      deleteListMutation.mutate(list.id, {
        onSuccess: () => {
          if (selectedId === list.id && onDeleted) onDeleted();
        },
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <RefreshCw className="h-6 w-6 animate-spin text-clay" />
        <p className="mt-2 text-xs font-medium text-ink-muted">Loading saved shopping lists...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <Alert className="border-clay/30 bg-clay-light text-clay-hover">
        <AlertCircle className="h-5 w-5 text-clay-hover" />
        <AlertDescription className="text-sm">
          <span className="font-semibold">Failed to load saved shopping lists: </span>
          {error instanceof Error ? error.message : 'Unknown network error.'}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="ml-3 border-clay/30 text-xs text-clay-hover hover:bg-clay/10"
          >
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (lists.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {deleteListMutation.isError && (
        <Alert className="border-clay/30 bg-clay-light text-clay-hover">
          <AlertCircle className="h-5 w-5 text-clay-hover" />
          <AlertDescription className="text-sm">
            <span className="font-semibold">Error Deleting Shopping List: </span>
            {deleteListMutation.error.message}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between border-b border-stone pb-3">
        <h2 className="font-serif text-xl font-bold tracking-tight text-ink">
          Saved Shopping Lists ({lists.length})
        </h2>
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
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {lists.map((list, index) => {
          const isSelected = list.id === selectedId;
          const checkedCount = list.items.filter((item) => item.checked).length;

          return (
            <motion.div
              key={list.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ y: -4 }}
              transition={{
                duration: 0.25,
                ease: [0.16, 1, 0.3, 1],
                delay: Math.min(index * 0.03, 0.3),
              }}
            >
              <Card
                role="button"
                tabIndex={0}
                onClick={() => onSelect(list.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(list.id);
                  }
                }}
                className={`flex h-full cursor-pointer flex-col justify-between p-5 transition-colors ${
                  isSelected
                    ? 'border-clay bg-clay-light/30 shadow-warm-md'
                    : 'border-stone bg-paper hover:border-stone-dark hover:shadow-warm-lg'
                }`}
              >
                <div>
                  <CardHeader className="p-0">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="font-serif text-base text-ink">{list.name}</CardTitle>
                      {list.eventId && (
                        <div className="flex items-center space-x-1 rounded-full bg-canvas border border-stone/60 px-2.5 py-1 text-xs font-semibold text-ink-muted shrink-0">
                          <Link2 className="h-3 w-3 text-clay-hover" />
                          <span>Linked to event</span>
                        </div>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="mt-3 p-0 text-xs text-ink-muted">
                    <div className="flex items-center space-x-1.5">
                      <ShoppingBag className="h-3.5 w-3.5 text-clay-hover" />
                      <span>
                        {list.items.length} item{list.items.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center space-x-1.5">
                      <CheckSquare className="h-3.5 w-3.5 text-clay-hover" />
                      <span>
                        {checkedCount} of {list.items.length} checked
                      </span>
                    </div>
                  </CardContent>
                </div>

                <div className="mt-4 flex items-center justify-end border-t border-stone/40 pt-3 text-xs">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(list);
                    }}
                    disabled={deleteListMutation.isPending}
                    aria-label={`Delete shopping list ${list.name}`}
                    className="h-7 px-2 text-xs text-ink-muted hover:text-clay-hover"
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    <span>Delete</span>
                  </Button>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
