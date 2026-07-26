import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/qsheet/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        // サーバーの既定ポートは 3001 (server/src/config.ts)。ここだけ 3000 を
        // 指していたため、ローカルで Qシートの画面が API に一切つながらなかった。
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Socket.IO の中継。これが無いと **OnAir とランダウンの同期を
      // ローカルで一度も動かせない** (本番の nginx では通るので、
      // 手元で再現できないまま本番だけで壊れる形になっていた)。
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
