import type { Config } from 'tailwindcss';
import preset from '../shared/tailwind.preset';

/**
 * リアルタイムCG の Tailwind 設定。
 *
 * v2.9.297 まで、このアプリだけが**共通プリセットを継承せず**、色を21個だけ
 * 手で定義していた (他6アプリは `shared/tailwind.preset.ts` を継承)。実害は2つ:
 *
 *  1. `--success` / `--warning` / `--info` / `--divider` / `--row` / `--ai` などの
 *     セマンティック色が**存在しない**ので、共通部品が `bg-success` と書いても
 *     クラスが生成されず**色が付かない**。書体も `font-sans` が既定のままだった。
 *  2. `content` に `../shared/src/client/**` が**入っていなかった**ので、
 *     共通部品 (AppShell・レール・EmptyState・ConfirmHost …) だけが使っている
 *     クラスが **1つも生成されない**。たまたま awards 側の画面でも使われている
 *     クラスだけが効いている状態だったので、**共通部品を足すほど画面が崩れた**。
 *
 * 継承したうえで、このアプリ固有のアニメーションだけを足す。
 */
const config: Config = {
  presets: [preset as Config],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '../shared/src/client/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      keyframes: {
        'switcher-in': {
          '0%': { opacity: '0', transform: 'scale(0.96) translateY(-4px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
      },
      animation: {
        'switcher-in': 'switcher-in 0.15s ease-out',
      },
    },
  },
};

export default config;
