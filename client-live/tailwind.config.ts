import type { Config } from 'tailwindcss';
import preset from '@gmo-onair/shared/tailwind.preset';
// v4 対象アプリだけの上乗せ (凍結アプリには効かせない)。理由は v4 preset の冒頭
import v4Preset from '@gmo-onair/shared/tailwind.v4.preset';

const config: Config = {
  presets: [preset as Config, v4Preset as Config],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '../shared/src/client/**/*.{js,ts,jsx,tsx}',
    // **v4 対象アプリだけが読む場所。** `shared/src/client/**` に v4 の新しい
    // クラス名を書くと、凍結アプリの Tailwind も走査するので**あちらの CSS が増える**
    // (実測: 部品1つで qsheet に4規則・231バイト)。v4 でしか使わない共通部品は
    // `shared/src/client-v4/` に置き、凍結アプリの content には足さない
    '../shared/src/client-v4/**/*.{js,ts,jsx,tsx}',
  ],
};

export default config;
