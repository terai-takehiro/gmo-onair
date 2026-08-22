import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/equipment/',
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
    // 5175 が正 (ルート CLAUDE.md のブロックアプリ一覧)。長く 5174 のままで
    // client-techops と同番だった — dev:all では起動順の競争で片方が別ポートへ
    // 逃げ、どちらがどこに立つか非決定になっていた (R6-c 事後レビューで発見)
    port: 5175,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
