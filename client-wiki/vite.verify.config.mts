// 検証専用の一時設定。API を検証サーバー(3999)へ向けるだけ。使い終わったら消す。
import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config';

export default defineConfig((env) =>
  mergeConfig(typeof base === 'function' ? base(env) : base, {
    server: {
      port: 5199,
      strictPort: true,
      proxy: { '/api': { target: 'http://localhost:3999', changeOrigin: true } },
    },
  }),
);
