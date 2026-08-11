import React from 'react';
import { UtensilsCrossed, ShoppingBag, Flame, Calendar } from 'lucide-react';

interface NavigationProps {
  currentTab: 'recipes' | 'shopping-list' | 'event-planner';
  onTabChange: (tab: 'recipes' | 'shopping-list' | 'event-planner') => void;
}

export const Navigation: React.FC<NavigationProps> = ({ currentTab, onTabChange }) => {
  return (
    <header className="sticky top-0 z-50 border-b border-stone/60 bg-paper/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center space-x-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-terracotta/30 bg-terracotta-light text-terracotta-dark">
            <Flame className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-serif text-xl font-bold tracking-tight text-ink">CookOut AI</h1>
            <p className="text-xs text-ink-muted">Recipe Scaling & Shopping List Builder</p>
          </div>
        </div>

        <nav
          aria-label="Main Navigation"
          className="flex items-center space-x-1 rounded-xl bg-sand p-1 border border-stone"
        >
          <button
            id="nav-tab-recipes"
            type="button"
            onClick={() => onTabChange('recipes')}
            className={`inline-flex items-center justify-center space-x-2 rounded-lg px-3.5 py-1.5 text-sm font-bold transition-all ${
              currentTab === 'recipes'
                ? 'bg-ink text-sand shadow-sm border border-ink'
                : 'text-ink-muted hover:text-ink hover:bg-paper/60'
            }`}
          >
            <UtensilsCrossed className="h-4 w-4" />
            <span>Recipes</span>
          </button>

          <button
            id="nav-tab-shopping-list"
            type="button"
            onClick={() => onTabChange('shopping-list')}
            className={`inline-flex items-center justify-center space-x-2 rounded-lg px-3.5 py-1.5 text-sm font-bold transition-all ${
              currentTab === 'shopping-list'
                ? 'bg-ink text-sand shadow-sm border border-ink'
                : 'text-ink-muted hover:text-ink hover:bg-paper/60'
            }`}
          >
            <ShoppingBag className="h-4 w-4" />
            <span>Shopping List</span>
          </button>

          <button
            id="nav-tab-event-planner"
            type="button"
            onClick={() => onTabChange('event-planner')}
            className={`inline-flex items-center justify-center space-x-2 rounded-lg px-3.5 py-1.5 text-sm font-bold transition-all ${
              currentTab === 'event-planner'
                ? 'bg-ink text-sand shadow-sm border border-ink'
                : 'text-ink-muted hover:text-ink hover:bg-paper/60'
            }`}
          >
            <Calendar className="h-4 w-4" />
            <span>Event Planner</span>
          </button>
        </nav>
      </div>
    </header>
  );
};
