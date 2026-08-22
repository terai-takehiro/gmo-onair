制作資料: 共同編集(collab)中にタイトル・状態・放送日・エピソード紐付けを変えても、一覧の検索に
反映されるようにした（今まではYjs経由の`data`列だけが保存され、`qsheet_documents`の
`title`/`status`/`broadcast_date`/`episode_id`/`episode_code`の列が更新されず、一覧の検索が
編集後のタイトルに当たらなかった）。台本本体（`data`列）は引き続きYjs経由のみで保存し、
メタ列だけを2秒デバウンスの軽量な`PATCH /qsheet/documents/:id/meta`で反映する
（サーバー側は新設のこのエンドポイントだけがこの5列を書き、`data`列には一切触れない）。
