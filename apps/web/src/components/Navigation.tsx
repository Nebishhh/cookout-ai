import React from 'react';
import { UtensilsCrossed, ShoppingBag, Flame } from 'lucide-react';
import { Button } from './ui/button';

interface NavigationProps {
  currentTab: 'recipes' | 'shopping-list';
  onTabChange: (tab: 'recipes' | 'shopping-list') => void;
}

export const Navigation: React.FC<NavigationProps> = ({ currentTab, onTabChange }) => {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center space-x-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-orange-500/30 bg-orange-500/10 text-orange-400">
            <Flame className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">CookOut AI</h1>
            <p className="text-xs text-slate-400">Recipe Scaling & Shopping List Builder</p>
          </div>
        </div>

        <nav
          aria-label="Main Navigation"
          className="flex items-center space-x-1 rounded-xl bg-slate-900 p-1 border border-slate-800"
        >
          <Button
            id="nav-tab-recipes"
            type="button"
            variant={currentTab === 'recipes' ? 'default' : 'ghost'}
            onClick={() => onTabChange('recipes')}
            className={`space-x-2 text-sm font-semibold ${
              currentTab === 'recipes'
                ? 'bg-orange-500 text-black shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <UtensilsCrossed className="h-4 w-4" />
            <span>Recipes</span>
          </Button>

          <Button
            id="nav-tab-shopping-list"
            type="button"
            variant={currentTab === 'shopping-list' ? 'default' : 'ghost'}
            onClick={() => onTabChange('shopping-list')}
            className={`space-x-2 text-sm font-semibold ${
              currentTab === 'shopping-list'
                ? 'bg-orange-500 text-black shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <ShoppingBag className="h-4 w-4" />
            <span>Shopping List</span>
          </Button>
        </nav>
      </div>
    </header>
  );
};
