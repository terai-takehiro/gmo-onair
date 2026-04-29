import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#005bac",
          dark: "#004482",
          light: "#1d72c2",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["'Noto Serif JP'", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
