import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'primary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-sand disabled:pointer-events-none disabled:opacity-50';

    const variants = {
      default: 'bg-terracotta text-white shadow-sm hover:bg-terracotta-hover',
      primary: 'bg-terracotta text-white shadow-sm hover:bg-terracotta-hover',
      destructive:
        'bg-terracotta-light text-terracotta-dark border border-terracotta/30 hover:bg-terracotta/20',
      outline: 'border border-stone bg-paper text-ink hover:bg-sand hover:text-ink',
      secondary: 'bg-sand text-ink hover:bg-stone/30',
      ghost: 'text-ink-muted hover:bg-sand hover:text-ink',
    };

    const sizes = {
      default: 'h-10 px-5 py-2.5',
      sm: 'h-8 rounded-lg px-3 text-xs',
      lg: 'h-11 rounded-xl px-8',
      icon: 'h-9 w-9 p-0',
    };

    return (
      <button
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';

export { Button };
