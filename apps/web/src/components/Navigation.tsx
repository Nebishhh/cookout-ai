import React from 'react';
import { motion } from 'framer-motion';
import { UtensilsCrossed, ShoppingBag, Flame, Calendar, Sun, Moon, LogOut } from 'lucide-react';
import { useTheme } from '../lib/useTheme';
import type { AuthUserDto } from '../lib/api';

interface NavigationProps {
  currentTab: 'recipes' | 'shopping-list' | 'event-planner';
  onTabChange: (tab: 'recipes' | 'shopping-list' | 'event-planner') => void;
  user: AuthUserDto;
  onLogout: () => void;
}

const TABS = [
  { id: 'recipes', label: 'Recipes', Icon: UtensilsCrossed },
  { id: 'shopping-list', label: 'Shopping List', Icon: ShoppingBag },
  { id: 'event-planner', label: 'Event Planner', Icon: Calendar },
] as const;

const SIGNATURE_TRANSITION = { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const };

export const Navigation: React.FC<NavigationProps> = ({
  currentTab,
  onTabChange,
  user,
  onLogout,
}) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-50 border-b border-stone/60 bg-paper/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center space-x-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-clay/30 bg-clay-light text-clay-hover">
            <Flame className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-serif text-xl font-bold tracking-tight text-ink">CookOut AI</h1>
            <p className="text-xs text-ink-muted">Recipe Scaling & Shopping List Builder</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <nav
            aria-label="Main Navigation"
            className="flex items-center space-x-1 rounded-xl bg-canvas p-1 border border-stone"
          >
            {TABS.map(({ id, label, Icon }) => {
              const isActive = currentTab === id;
              return (
                <button
                  key={id}
                  id={`nav-tab-${id}`}
                  type="button"
                  onClick={() => onTabChange(id)}
                  className={`relative inline-flex items-center justify-center space-x-2 rounded-lg px-3.5 py-1.5 text-sm font-bold transition-colors ${
                    isActive ? 'text-canvas' : 'text-ink-muted hover:text-ink hover:bg-paper/60'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="nav-active-pill"
                      className="absolute inset-0 rounded-lg border border-ink bg-ink shadow-warm-sm"
                      transition={SIGNATURE_TRANSITION}
                    />
                  )}
                  <Icon className="relative z-10 h-4 w-4" />
                  <span className="relative z-10">{label}</span>
                </button>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone bg-canvas text-ink-muted transition-colors hover:bg-paper hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <div className="hidden items-center gap-2 border-l border-stone/60 pl-3 sm:flex">
            <span
              className="max-w-[10rem] truncate text-xs text-ink-muted"
              title={user.isGuest ? 'Guest session' : (user.email ?? undefined)}
            >
              {user.isGuest ? 'Guest' : user.email}
            </span>
            <button
              type="button"
              onClick={onLogout}
              aria-label={user.isGuest ? 'End guest session' : 'Log out'}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone bg-canvas text-ink-muted transition-colors hover:bg-paper hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
