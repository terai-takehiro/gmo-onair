import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import pkg from '../package.json';

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // shared は npm workspaces が張る symlink でも解決できるが、それは workspaces の
      // 副作用に頼っているだけで、node_modules の状態次第で解決先が変わる。実体を
      // 1つに固定するため明示する (指す先は symlink の実体と同じ ../shared)。
      '@gmo-onair/shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
