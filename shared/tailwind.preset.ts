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
      /*
       * 書体は**トークン参照にする**。ここに書体名をベタ書きすると、v4 の書体
       * (LINE Seed JP) に変えたときに**凍結アプリまで変わってしまう**。
       * トークン経由なら v4 対象3アプリだけが `tokens-v4.css` で上書きされ、
       * 凍結アプリは `tokens.css` の Noto Sans JP のまま。
       */
      fontFamily: {
        sans: ['var(--font-sans)'],
        serif: ['var(--font-serif)'],
        mono: ['var(--font-mono-ui)'],
        number: ['var(--font-mono-num)'],
      },
      /*
       * 型スケール — v4 (docs/design/v4/_tokens.md)。
       * **サイズ・行間・ウェイトを1つのクラスに束ねる。** 画面ごとに
       * text-sm + font-semibold のように組み合わせると必ずばらつくため。
       *
       * ウェイトを内包しているので、v4 の画面では font-medium / font-semibold を
       * 書く理由が無くなる (LINE Seed JP は 400/700/800 しか無く、500/600 は
       * 黙って落ちる。T3 で書体を入れるときに効いてくる)。
       */
      fontSize: {
        h1:        ['23px',   { lineHeight: '1.3',  fontWeight: '800' }],
        h2:        ['19px',   { lineHeight: '1.35', fontWeight: '800' }],
        /*
         * カード見出し。**`card` という名前にしてはいけない。**
         * `colors` に `card` (面 白) があるので `text-card` は**色の指定としても
         * 生成され**、同じクラス名で「font-size:15px」と「color:白」の2つの規則が
         * できる。当てた文字が白地に白で消える (まだ誰も使っていないので実害は
         * 出ていなかったが、Phase 2 で必ず踏む)。`check-tokens.mjs` が
         * 色名との衝突を検査して止める。
         */
        cardtitle: ['15px',   { lineHeight: '1.4',  fontWeight: '800' }],
        list:      ['13.5px', { lineHeight: '1.5',  fontWeight: '700' }],
        sub:       ['12.5px', { lineHeight: '1.6',  fontWeight: '400' }],
        'sub-sm':  ['11.5px', { lineHeight: '1.6',  fontWeight: '400' }],
        th:        ['11.5px', { lineHeight: '1.4',  fontWeight: '800' }],
        badge:     ['11px',   { lineHeight: '1.4',  fontWeight: '700' }],
        note:      ['12px',   { lineHeight: '1.75', fontWeight: '400' }],
      },
      /*
       * タップ対象の最小寸法 — v4 (docs/design/v4/_rules.md「3. スマホ」)。
       * **最低 44px** (iOS HIG の基準)。`min-h-tap` / `min-w-tap` で使う。
       * 追加なので既存の画面には影響しない (いま使っている画面は無い)。
       */
      minHeight: { tap: '44px' },
      minWidth: { tap: '44px' },
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
          'surface': 'rgb(var(--destructive-surface) / <alpha-value>)',
          'border': 'rgb(var(--destructive-border) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'rgb(var(--success) / <alpha-value>)',
          foreground: 'rgb(var(--success-foreground) / <alpha-value>)',
          'surface': 'rgb(var(--success-surface) / <alpha-value>)',
          'border': 'rgb(var(--success-border) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--warning) / <alpha-value>)',
          foreground: 'rgb(var(--warning-foreground) / <alpha-value>)',
          'surface': 'rgb(var(--warning-surface) / <alpha-value>)',
          'border': 'rgb(var(--warning-border) / <alpha-value>)',
          'border-strong': 'rgb(var(--warning-border-strong) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--info) / <alpha-value>)',
          foreground: 'rgb(var(--info-foreground) / <alpha-value>)',
          'surface': 'rgb(var(--info-surface) / <alpha-value>)',
          'border': 'rgb(var(--info-border) / <alpha-value>)',
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

        /* ── v4 で足した名前 (T1b)。まだ画面では使っていない ── */

        /* AI・表彰など「特別」を表す系統 */
        ai: {
          DEFAULT: 'rgb(var(--ai) / <alpha-value>)',
          foreground: 'rgb(var(--ai-foreground) / <alpha-value>)',
          surface: 'rgb(var(--ai-surface) / <alpha-value>)',
          border: 'rgb(var(--ai-border) / <alpha-value>)',
        },

        /* 意味を持たない見分けの色。状態の色を流用しないための逃げ道 */
        cat: {
          '1': 'rgb(var(--cat-1) / <alpha-value>)',
          '2': 'rgb(var(--cat-2) / <alpha-value>)',
          '3': 'rgb(var(--cat-3) / <alpha-value>)',
          '4': 'rgb(var(--cat-4) / <alpha-value>)',
          '5': 'rgb(var(--cat-5) / <alpha-value>)',
          '6': 'rgb(var(--cat-6) / <alpha-value>)',
          '7': 'rgb(var(--cat-7) / <alpha-value>)',
          '8': 'rgb(var(--cat-8) / <alpha-value>)',
        },

        /* 文字の薄い段。**読ませる文字には使わない** (白地で 2.61:1)。
           入力欄のヒント文字・押せない状態・アイコンの塗りだけ */
        'fg-disabled': 'rgb(var(--fg-disabled) / <alpha-value>)',

        /* 面と罫の段 */
        'surface-subtle': 'rgb(var(--surface-subtle) / <alpha-value>)',
        'border-subtle': 'rgb(var(--border-subtle) / <alpha-value>)',
        'border-faint': 'rgb(var(--border-faint) / <alpha-value>)',
        'border-disabled': 'rgb(var(--border-disabled) / <alpha-value>)',

        /* プライマリの淡い段 (選択中の行・hover の面・淡い枠) */
        'primary-surface': 'rgb(var(--primary-surface) / <alpha-value>)',
        'primary-surface-weak': 'rgb(var(--primary-surface-weak) / <alpha-value>)',
        'primary-border': 'rgb(var(--primary-border) / <alpha-value>)',
        'primary-border-strong': 'rgb(var(--primary-border-strong) / <alpha-value>)',
      },
      /*
       * 角丸 — v4 の9段 (docs/design/v4/_tokens.md)。
       * モックには11種類あったが、**使われている要素の高さから9段に正規化**した
       * (8px は高さ26〜30px の小コントロールで82回 → 9px に、
       *  11px は高さ40〜44px の入力・大ボタンで74回 → 10px に、13px → 12px)。
       * 段が増えると縦に並べたとき角の丸みが揃わないので **rounded-[Npx] は書かない**。
       *
       * ── ここで足すのは「役割の名前」だけ (T1b) ──────────────────────
       * v4 の段は Tailwind の組み込みの名前 (`rounded` / `rounded-xl` /
       * `rounded-2xl` / `rounded-3xl`) と**そのままぶつかる**。ここで数字の段を
       * 入れると、**書き換えていない画面の角の丸みまで変わる**:
       *   rounded    4px → 7px  (1,455 か所)
       *   rounded-2xl 16px → 14px (7 か所)
       * 実際に一度入れてビルド出力を比べて見つけた。凍結アプリにも効いてしまう。
       * → **数字の段の入れ替えは T2 (見た目を変える回) に回す。**
       *    ここでは衝突しない役割名だけを足す。P1/P2 の共通部品はこちらを使う。
       *
       * lg / md / sm も shadcn/ui の各部品が使っている既存の名前なので触らない。
       */
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',

        /* v4 の役割名 (Tailwind の組み込みと衝突しないもの) */
        'badge-xs': '6px',    /* バッジ小 */
        badge: '7px',         /* バッジ */
        control: '7px',       /* 入力・小バッジ */
        'control-md': '9px',  /* ボタン小 (高さ26〜30px) */
        'control-lg': '10px', /* ボタン・入力 (高さ40〜44px) */
        note: '14px',         /* 注記帯 */
        card: '16px',         /* カード */
        app: '18px',          /* アプリ外枠 */
        chip: '9999px',       /* ピル */
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
