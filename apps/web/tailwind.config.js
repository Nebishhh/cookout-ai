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
        serif: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        sand: {
          DEFAULT: '#EFE8D8',
          light: '#F5EFE3',
          dark: '#E2D9C5',
        },
        paper: {
          DEFAULT: '#F6F0E4',
          pure: '#FCFAF5',
          dark: '#EBE3D3',
        },
        ink: {
          DEFAULT: '#231F1D',
          muted: '#5C544D',
          subtle: '#8C8278',
        },
        terracotta: {
          DEFAULT: '#B85332',
          hover: '#9E4226',
          dark: '#9E4226',
          light: '#F7EBE7',
          border: '#E8C0B5',
        },
        herb: {
          DEFAULT: '#3F5B44',
          dark: '#24402A',
          hover: '#314735',
          light: '#EAEFEA',
          border: '#B3C7B7',
        },
        stone: {
          DEFAULT: '#C7BEA9',
          light: '#E2DBD0',
          dark: '#ABA18C',
        },
        border: '#C7BEA9',
        input: '#DDD6C7',
        ring: '#B85332',
        background: '#EFE8D8',
        foreground: '#231F1D',
        primary: {
          DEFAULT: '#B85332',
          foreground: '#FFFFFF',
        },
        secondary: {
          DEFAULT: '#F6F0E4',
          foreground: '#231F1D',
        },
        destructive: {
          DEFAULT: '#9E4226',
          foreground: '#FFFFFF',
        },
        muted: {
          DEFAULT: '#F6F0E4',
          foreground: '#5C544D',
        },
        accent: {
          DEFAULT: '#F7EBE7',
          foreground: '#9E4226',
        },
        card: {
          DEFAULT: '#F6F0E4',
          foreground: '#231F1D',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
};
