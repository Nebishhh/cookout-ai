import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ComponentProps<typeof motion.button> {
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'primary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center whitespace-nowrap rounded-pill text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50';

    const variants = {
      default: 'bg-clay text-white shadow-warm hover:bg-clay-hover',
      primary: 'bg-clay text-white shadow-warm hover:bg-clay-hover',
      destructive: 'bg-clay-light text-clay-hover border border-clay-border hover:bg-clay-light/70',
      outline: 'border border-stone bg-paper text-ink hover:bg-canvas hover:text-ink',
      secondary: 'bg-canvas text-ink hover:bg-stone/30',
      ghost: 'text-ink-muted hover:bg-canvas hover:text-ink',
    };

    const sizes = {
      default: 'h-10 px-5 py-2.5',
      sm: 'h-8 px-3 text-xs',
      lg: 'h-11 px-8',
      icon: 'h-9 w-9 p-0',
    };

    return (
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        transition={{ duration: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';

export { Button };
