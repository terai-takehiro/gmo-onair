import type { Config } from 'tailwindcss';
import preset from '@gmo-onair/shared/tailwind.preset';

const config: Config = {
  presets: [preset as Config],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '../shared/src/client/**/*.{js,ts,jsx,tsx}',
  ],
};

export default config;
