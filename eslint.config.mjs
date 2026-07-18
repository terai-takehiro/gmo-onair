import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

// GMO ONAiR 共通 ESLint (flat config)。monorepo ルートに置き、各ワークスペースの
// `eslint .` はファイルから上方向に探索してこの config を使う。
//
// 方針: バグに直結するルール (react-hooks/rules-of-hooks 等) は error のまま維持し、
// 既存コードに大量に存在するスタイル/厳格系 (no-explicit-any 等) は段階導入のため
// warn / off にして「lint が通る」状態を確保する。新規コードの明らかな問題は検出できる。
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/public/**',
      '**/*.config.{js,ts,mjs,cjs}',
      'scripts/**',
      'server/scripts/**',
      '**/vite-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // ── 重要 (error 維持): フック規則 (誤った条件付きフック呼び出し等を検出) ──
      // eslint-plugin-react-hooks v7 の recommended は set-state-in-effect / refs-in-render 等の
      // 新しい厳格ルールを多数含み既存コードで大量に error になるため、段階導入としてここでは
      // 展開せず、バグ直結の rules-of-hooks のみ error にする。
      'react-hooks/rules-of-hooks': 'error',
      // ── 段階導入 (warn): 追々是正 ──
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'react-hooks/exhaustive-deps': 'warn',
      'prefer-const': 'warn',
      'no-constant-condition': ['warn', { checkLoops: false }],
      // ── 既存コードの慣習に合わせ off ──
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      'no-empty': 'off',
      'no-case-declarations': 'off',
      'no-useless-escape': 'warn',
      'no-irregular-whitespace': ['warn', { skipStrings: true, skipComments: true, skipTemplates: true, skipJSXText: true }],
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-namespace': 'off',
    },
  },
);
