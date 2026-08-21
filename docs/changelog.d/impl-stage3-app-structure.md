制作資料 v4 段3（アプリ構造）を実装した。`doc_no`（資料番号）とジャーニーの人のピン
（`production_journey_marks`）の DDL を足し、制作資料の中の道具（進行台本・スケジュール表）を
1か所に登録する `MINI_APPS` レジストリを作った。`/qsheet` の行き先は `routeSwitch.ts` の1行で
切り替えられるようにし（公開URL5本は1文字も変えていない）、案件を選ぶ新しいトップ画面
（`/qsheet/home`）と、案件・資料単位でのジャーニー取得API（枠 `frames[]` は段4まで空配列・
`jsonb_array_length` を `jsonb_typeof` でガードし壊れた台本1件で一覧が500にならないようにした）
を追加した。制作資料の凍結を解き（`apps.ts` の `frozen` を落とす・`check:frozen` の対象から外す）、
`tokens-v4.css` に `.dark` を追加して本番の暗い3画面（進行・ランダウン・プロンプター）の地の色が
壊れないようにした。`check-mobile-declared` / `check-file-size` / `check-ui-tokens` の対象に
`client-qsheet` を登録した。
