**決算取込のCLI版 (`server/scripts/import-kessan-dev.mjs`) が `--commit` で必ず失敗していたのを直した**（利用者指摘）。
2026年10月の事業再編で migration 285/286 により `projects`/`revenues`/`purchases`/`sga_expenses` の `entity_code` 列が
NOT NULL になったが、Web UI 側の本体 (`kessan-import.service.ts`) はこれに追従した一方、CLI版はこの列を書いておらず、
`--commit` を付けるとどのスコープでも `entity_code` の NOT NULL 制約違反で必ず失敗していた（検証用DBで再現確認済み）。
本体側の `CURRENT_ENTITY_CODE`（`server/src/shared/constants/entity-default.ts`。CLIは `.mjs` のまま直接 node 実行する
ため `.ts` を import できず、コンテナに存在するビルド成果物 `server/dist/...` から import する）を4表すべての
INSERT に追加した。あわせて本体側と突き合わせて見つかった2件の乖離も直した:
①`projects` への INSERT が migration 184 で削除済みの `notes` 列をまだ指定していた（`kessan_marker` 列に直した）、
②`ensureProject()` が事前照合フェーズで「未登録」とキャッシュした案件を早期returnしてしまい、`--create-masters` を
付けても案件を新規作成できていなかった（キャッシュのtruthy判定に直した。本体側は既にこの形で直っている）。
検証: 検証用Postgres (`scripts/dev-verify/up.sh`。migration 301まで適用済み) に対して `--scope=all --create-masters
--commit` を実行し、新規案件・固定原価案件・売上・仕入・販管費のいずれも `entity_code='GSS'` で正しく投入され、
以前の失敗が再現しないことを確認した。
