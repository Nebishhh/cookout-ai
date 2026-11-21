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

  // Below the lg breakpoint (1024px) the header is two rows, and only the tab row stays pinned:
  // the brand row (logo, theme toggle, log-out) scrolls away with the page, so the pinned part is
  // about 8% of a phone screen instead of 16%. A sticky element only sticks inside its parent's
  // box, so <header> and its inner wrapper are `display: contents` below lg; the tab row then
  // sticks against the page itself. From lg up the classes restore one pinned row: brand on the
  // left; tabs, theme toggle and account on the right. The subtitle is hidden from lg to xl, where
  // one row has no room for it.
  return (
    <header className="contents lg:sticky lg:top-0 lg:z-50 lg:block lg:border-b lg:border-stone/60 lg:bg-paper/90 lg:backdrop-blur-md">
      <div className="contents lg:mx-auto lg:flex lg:max-w-7xl lg:items-center lg:gap-x-3 lg:px-8 lg:py-3">
        {/* Brand row: scrolls away below lg; its children join the single row from lg up. */}
        <div className="flex items-center gap-3 bg-paper px-4 pb-2 pt-3 sm:px-6 lg:contents">
          <div className="flex min-w-0 flex-1 items-center gap-3 lg:order-1">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-clay/30 bg-clay-light text-clay-hover">
              <Flame className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-serif text-xl font-bold tracking-tight text-ink">
                CookOut AI
              </h1>
              <p className="hidden text-xs text-ink-muted sm:block lg:hidden xl:block">
                Recipe Scaling & Shopping List Builder
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3 lg:order-3">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-stone bg-canvas text-ink-muted transition-colors hover:bg-paper hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-2 focus-visible:ring-offset-canvas sm:h-9 sm:w-9"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <div className="flex items-center gap-2 border-l border-stone/60 pl-2 sm:pl-3">
              <span
                className="hidden max-w-[10rem] truncate text-xs text-ink-muted sm:inline"
                title={user.isGuest ? 'Guest session' : (user.email ?? undefined)}
              >
                {user.isGuest ? 'Guest' : user.email}
              </span>
              <button
                type="button"
                onClick={onLogout}
                aria-label={user.isGuest ? 'End guest session' : 'Log out'}
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-stone bg-canvas text-ink-muted transition-colors hover:bg-paper hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-2 focus-visible:ring-offset-canvas sm:h-9 sm:w-9"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Tab row: pinned to the top below lg; the middle of the single row from lg up. */}
        <div
          data-testid="tab-row"
          className="sticky top-0 z-50 border-b border-stone/60 bg-paper/90 px-4 pb-3 pt-1 backdrop-blur-md sm:px-6 lg:static lg:order-2 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none"
        >
          <nav
            aria-label="Main Navigation"
            className="grid w-full grid-cols-3 gap-1 rounded-xl border border-stone bg-canvas p-1 lg:flex lg:w-auto"
          >
            {TABS.map(({ id, label, Icon }) => {
              const isActive = currentTab === id;
              return (
                <button
                  key={id}
                  id={`nav-tab-${id}`}
                  type="button"
                  onClick={() => onTabChange(id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative inline-flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 text-xs font-bold transition-colors sm:min-h-0 sm:flex-row sm:gap-2 sm:px-3.5 sm:text-sm ${
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
                  <span className="relative z-10 whitespace-nowrap">{label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
};
