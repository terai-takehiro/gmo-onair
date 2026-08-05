import type { Config } from 'tailwindcss';
import dadsPlugin from '@digital-go-jp/tailwind-theme-plugin';

/**
 * GMO ONAiR v2.0 — Shared Tailwind Preset
 *
 * Each client app extends this via:
 *   export default { presets: [preset], content: [...] }
 *
 * Token source: shared/src/client/tokens.css (DADS primitives + GMO Blue)
 */
const preset = {
  darkMode: ['class'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      fontFamily: {
        sans: ['"Noto Sans JP"', '-apple-system', '"Hiragino Sans"', 'sans-serif'],
        serif: ['"Noto Sans JP"', '-apple-system', '"Hiragino Sans"', 'sans-serif'],
        mono: ['"Noto Sans JP"', '-apple-system', '"Hiragino Sans"', 'sans-serif'],
        number: ['"Roboto Condensed"', '"Noto Sans JP"', 'sans-serif'],
      },
      colors: {
        /* GMO Blue scale — matches --color-gmo-blue-* from tokens.css */
        'gmo-blue': {
          50:   '#eaf4fb',
          100:  '#cfe4f4',
          200:  '#a6ceeb',
          300:  '#78b4df',
          400:  '#4a98d2',
          500:  '#1e7cc4',
          600:  '#0068b8',
          700:  '#005bac',
          800:  '#004d91',
          900:  '#003f77',
          950:  '#00315d',
        },

        /* shadcn/ui semantic slots — HSL indirect through CSS variables */
        border: 'rgb(var(--border) / <alpha-value>)',
        input: 'rgb(var(--input) / <alpha-value>)',
        ring: 'rgb(var(--ring) / <alpha-value>)',
        background: 'rgb(var(--background) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',

        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          foreground: 'rgb(var(--primary-foreground) / <alpha-value>)',
          50:   '#eaf4fb',
          100:  '#cfe4f4',
          200:  '#a6ceeb',
          300:  '#78b4df',
          400:  '#4a98d2',
          500:  '#1e7cc4',
          600:  '#0068b8',
          700:  '#005bac',
          800:  '#004d91',
          900:  '#003f77',
          950:  '#00315d',
        },
        secondary: {
          DEFAULT: 'rgb(var(--secondary) / <alpha-value>)',
          foreground: 'rgb(var(--secondary-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'rgb(var(--destructive) / <alpha-value>)',
          foreground: 'rgb(var(--destructive-foreground) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'rgb(var(--success) / <alpha-value>)',
          foreground: 'rgb(var(--success-foreground) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--warning) / <alpha-value>)',
          foreground: 'rgb(var(--warning-foreground) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--info) / <alpha-value>)',
          foreground: 'rgb(var(--info-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'rgb(var(--muted) / <alpha-value>)',
          foreground: 'rgb(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          foreground: 'rgb(var(--accent-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'rgb(var(--popover) / <alpha-value>)',
          foreground: 'rgb(var(--popover-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'rgb(var(--card) / <alpha-value>)',
          foreground: 'rgb(var(--card-foreground) / <alpha-value>)',
        },
        sidebar: {
          DEFAULT: 'rgb(var(--sidebar-background) / <alpha-value>)',
          foreground: 'rgb(var(--sidebar-foreground) / <alpha-value>)',
          primary: 'rgb(var(--sidebar-primary) / <alpha-value>)',
          'primary-foreground': 'rgb(var(--sidebar-primary-foreground) / <alpha-value>)',
          accent: 'rgb(var(--sidebar-accent) / <alpha-value>)',
          'accent-foreground': 'rgb(var(--sidebar-accent-foreground) / <alpha-value>)',
          border: 'rgb(var(--sidebar-border) / <alpha-value>)',
          ring: 'rgb(var(--sidebar-ring) / <alpha-value>)',
        },
        chart: {
          '1': 'rgb(var(--chart-1) / <alpha-value>)',
          '2': 'rgb(var(--chart-2) / <alpha-value>)',
          '3': 'rgb(var(--chart-3) / <alpha-value>)',
          '4': 'rgb(var(--chart-4) / <alpha-value>)',
          '5': 'rgb(var(--chart-5) / <alpha-value>)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      /* DADS Fibonacci spacing — already covered by Tailwind's default 4px scale;
       * tokens.css provides CSS variables for explicit use. */
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  /* DADS plugin injects blue/light-blue/cyan/green/yellow/orange/red/... scales
   * as primitive color utilities (e.g. bg-blue-900, text-red-700). */
  plugins: [dadsPlugin],
} satisfies Partial<Config>;

export default preset;
