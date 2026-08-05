# shared のテスト

**`src/` の外に置いてある。理由がある。**

各アプリの `tailwind.config.ts` の `content` は `../shared/src/client/**` を含むので、
**`src/` の中に置いたテストのクラス名まで CSS として生成される**。
実際に `cn('rounded-md','rounded-card')` というテストを1本書いたところ、
使っていない `rounded-card` / `rounded-badge` / `rounded-control` / `text-h1` の規則が
**凍結4アプリの CSS にも増えた**（ビルド出力の突き合わせで発見）。

`content` の否定パターンで外す手もあるが、`'!../shared/**/*.test.{ts,tsx}'` という
**shared からの相対パスで7アプリすべてに書く**必要があり（`'!**/*.test.*'` では効かない）、
1つ書き忘れるとそのアプリだけ静かに元に戻る。**置き場所を分けるほうが破れない。**

## 何をテストするか

**画面を見ても間違いに気づけない計算だけ**（`docs/v4-plan.md`「自動テストについて」）。
73画面ぶんのテストは書かない。いまあるのは:

| ファイル | 何を固定しているか |
| --- | --- |
| `numbers.test.ts` | 万円の丸め（負の数・`¥-0万` を出さない・0 と未入力の区別） |
| `utils.test.ts` | `cn()` の打ち消し（v4 の型スケール・角丸が組み込みの `text-*` / `rounded-*` を上書きできること） |

実行: `npm test`（ルート）または `npm run test -w shared`
