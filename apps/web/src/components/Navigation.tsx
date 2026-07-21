import React from 'react';
import { UtensilsCrossed, ShoppingBag, Flame } from 'lucide-react';

interface NavigationProps {
  currentTab: 'recipes' | 'shopping-list';
  onTabChange: (tab: 'recipes' | 'shopping-list') => void;
}

export const Navigation: React.FC<NavigationProps> = ({ currentTab, onTabChange }) => {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 shadow-lg shadow-orange-500/20">
            <Flame className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">CookOut AI</h1>
            <p className="text-xs text-slate-400">Smart Recipe Scaling & Shopping</p>
          </div>
        </div>

        <nav
          aria-label="Main Navigation"
          className="flex items-center space-x-1 rounded-xl bg-slate-900/90 p-1.5 border border-slate-800"
        >
          <button
            id="nav-tab-recipes"
            type="button"
            onClick={() => onTabChange('recipes')}
            className={`flex items-center space-x-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              currentTab === 'recipes'
                ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <UtensilsCrossed className="h-4 w-4" />
            <span>Recipes</span>
          </button>

          <button
            id="nav-tab-shopping-list"
            type="button"
            onClick={() => onTabChange('shopping-list')}
            className={`flex items-center space-x-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              currentTab === 'shopping-list'
                ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <ShoppingBag className="h-4 w-4" />
            <span>Shopping List</span>
          </button>
        </nav>
      </div>
    </header>
  );
};
