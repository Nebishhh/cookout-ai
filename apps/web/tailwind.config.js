/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      fontFamily: {
        serif: ['Calistoga', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        canvas: {
          DEFAULT: 'hsl(var(--canvas))',
          light: 'hsl(var(--canvas-light))',
          dark: 'hsl(var(--canvas-dark))',
        },
        paper: {
          DEFAULT: 'hsl(var(--paper))',
          pure: 'hsl(var(--paper-pure))',
          dark: 'hsl(var(--paper-dark))',
        },
        ink: {
          DEFAULT: 'hsl(var(--ink))',
          muted: 'hsl(var(--ink-muted))',
          subtle: 'hsl(var(--ink-subtle))',
        },
        clay: {
          DEFAULT: 'hsl(var(--clay))',
          hover: 'hsl(var(--clay-hover))',
          light: 'hsl(var(--clay-light))',
          border: 'hsl(var(--clay-border))',
        },
        olive: {
          DEFAULT: 'hsl(var(--olive))',
          hover: 'hsl(var(--olive-hover))',
          light: 'hsl(var(--olive-light))',
          border: 'hsl(var(--olive-border))',
        },
        stone: {
          DEFAULT: 'hsl(var(--stone))',
          light: 'hsl(var(--stone-light))',
          dark: 'hsl(var(--stone-dark))',
        },
        border: 'hsl(var(--stone))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--clay))',
        background: 'hsl(var(--canvas))',
        foreground: 'hsl(var(--ink))',
        primary: {
          DEFAULT: 'hsl(var(--clay))',
          foreground: '#FFFFFF',
        },
        secondary: {
          DEFAULT: 'hsl(var(--paper))',
          foreground: 'hsl(var(--ink))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--clay-hover))',
          foreground: '#FFFFFF',
        },
        muted: {
          DEFAULT: 'hsl(var(--paper))',
          foreground: 'hsl(var(--ink-muted))',
        },
        accent: {
          DEFAULT: 'hsl(var(--clay-light))',
          foreground: 'hsl(var(--clay-hover))',
        },
        card: {
          DEFAULT: 'hsl(var(--paper))',
          foreground: 'hsl(var(--ink))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        pill: '999px',
      },
      boxShadow: {
        // warm, soft, double-layered — tinted toward ink instead of neutral black,
        // structure matches the real double-layer values found in the Phase 0 reference audit
        'warm-sm': '0 1px 2px 0 hsl(var(--ink) / 0.06), 0 1px 1px -1px hsl(var(--ink) / 0.08)',
        warm: '0 1px 3px 0 hsl(var(--ink) / 0.08), 0 1px 2px -1px hsl(var(--ink) / 0.08)',
        'warm-md': '0 4px 8px -2px hsl(var(--ink) / 0.10), 0 2px 4px -2px hsl(var(--ink) / 0.08)',
        'warm-lg': '0 12px 20px -4px hsl(var(--ink) / 0.14), 0 4px 8px -4px hsl(var(--ink) / 0.10)',
        'warm-xl':
          '0 20px 32px -8px hsl(var(--ink) / 0.18), 0 8px 16px -8px hsl(var(--ink) / 0.12)',
      },
      keyframes: {
        'stagger-in': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'stagger-in': 'stagger-in 300ms cubic-bezier(0.16, 1, 0.3, 1) both',
      },
      transitionTimingFunction: {
        // motion.dev's own primary-CTA curve — reserved for signature moments
        signature: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
