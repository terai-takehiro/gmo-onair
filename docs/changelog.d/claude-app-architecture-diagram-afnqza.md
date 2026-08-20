**全体構成をコードから確認した際に見つかった、意図と画面のズレを2件直した**（構造変更なし）。
①`scripts/check-links.mjs` は `client/src` の中のリンクだけを見ており、`client-daily` /
`client-live` のような**別バンドルから `client` への直接リンクは最初から検査の対象外**
だった。実際に `client-daily` から `client` の `/budget/documents`（受け取った書類の転送
先）と `/sales/tasks/list`（問い合わせカードの行き先）へ直接リンクしている箇所があり、
`client` 側でこのルートを削っても誰も気づけない状態だったため、その2つの行き先だけを
固定して見張る検査（`shared/tests/crossAppLinks.test.ts`）を足した。
②全案件のタスクを横断して見る「タスク一覧」（`/sales/tasks`）は、サーバー側
（`task-dashboard.routes.ts`）が `gls_category='A'`（案件管理）だけを返す設計になって
いる（「GLS-Bが並ぶと案件のタスクが埋もれる」という理由がコードのコメントに明記されて
おり、意図的な設計）。しかし画面の注記は「全案件のタスク」としか書いておらず、
プロジェクト管理（GLS-B）のタスクが含まれないことがどこにも書かれていなかったため、
画面の注記に一言足した。
検証: `npm run typecheck` / `npm run lint` / `npm run test`（1137件）OK。
