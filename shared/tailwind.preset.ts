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
        /* 刷新の書体 = LINE Seed JP (Google Fonts・400/700/800)。
         * 配信されていないウェイト (300/500/600) は使わない。詳細は tokens.css */
        sans: ['"LINE Seed JP"', '"Noto Sans JP"', '-apple-system', '"Hiragino Sans"', 'sans-serif'],
        serif: ['"LINE Seed JP"', '"Noto Sans JP"', '-apple-system', '"Hiragino Sans"', 'sans-serif'],
        mono: ['"LINE Seed JP"', '"Noto Sans JP"', '-apple-system', '"Hiragino Sans"', 'sans-serif'],
        /* 数字も本文と同じ書体 (見出しと数字で書体が変わらないようにする) */
        number: ['"LINE Seed JP"', '"Noto Sans JP"', 'sans-serif'],
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
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        divider: 'hsl(var(--divider))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',

        /* AI が作ったもの・AI に投げるものだけに使う */
        ai: {
          DEFAULT: 'hsl(var(--ai))',
          foreground: 'hsl(var(--ai-foreground))',
          surface: 'hsl(var(--ai-surface))',
          border: 'hsl(var(--ai-border))',
        },

        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
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
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
          surface: 'hsl(var(--destructive-surface))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
          surface: 'hsl(var(--success-surface))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
          surface: 'hsl(var(--warning-surface))',
          strong: 'hsl(var(--warning-strong))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
      },
      /* 刷新の角丸 = 11–16px。カード 14px (rounded-lg) / ボタンと入力 11px (rounded-control) */
      borderRadius: {
        xl: 'calc(var(--radius) + 2px)',   /* 16px — 大きな面 (シェル・モーダル) */
        lg: 'var(--radius)',               /* 14px — カード */
        md: 'calc(var(--radius) - 2px)',   /* 12px */
        sm: 'calc(var(--radius) - 4px)',   /* 10px */
        control: '0.6875rem',              /* 11px — ボタン・入力 */
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
