import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'primary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:pointer-events-none disabled:opacity-50';

    const variants = {
      default: 'bg-orange-500 text-black shadow-sm hover:bg-orange-400',
      primary: 'bg-orange-500 text-black shadow-sm hover:bg-orange-400',
      destructive: 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30',
      outline:
        'border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white',
      secondary: 'bg-slate-800 text-slate-200 hover:bg-slate-700',
      ghost: 'text-slate-400 hover:bg-slate-800/60 hover:text-white',
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
