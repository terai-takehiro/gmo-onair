import type { Config } from 'tailwindcss';
import preset from '@gmo-onair/shared/tailwind.preset';
// v4 対象3アプリだけの上乗せ (凍結4アプリには効かせない)。理由は v4 preset の冒頭
import v4Preset from '@gmo-onair/shared/tailwind.v4.preset';

const config: Config = {
  presets: [preset as Config, v4Preset as Config],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '../shared/src/client/**/*.{js,ts,jsx,tsx}',
  ],
};

export default config;
