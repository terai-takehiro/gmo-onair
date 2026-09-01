**「回を足す」の追加数をテキスト入力にし、"1-2" のような話数の直接指定を受け付けるようにした**（ユーザー依頼「回を足すの『追加する数』は複数の回を登録することもあるのでテキストで入力出来るようにしたい『#1-2』みたいに」）。

これまでは数値ステッパーで「次の話数から連番でN件」しか作れなかった。案件名の慣習表記「#1-2」（同日収録した複数話数）に合わせ、`AddEpisodesDialog` のテキスト欄が①純粋な数字（例 "2"）＝従来どおり件数、②範囲（"1-2"/"#1-2"）＝話数を明示指定、③カンマ区切りの複数レンジ（"1,3,5-8"）＝非連続な話数をまとめて作成、の3通りを読み分ける。実行前に「作成する回: #3、#5〜#8（6件）」のプレビューを必ず出し、明示指定した話数が次の話数とズレているときは警告する（`docs/design/v4/regular-series.md` §7）。

サーバー（`POST /:projectId/episodes/batch`）は新しいテキスト欄 `episodes` を受け、旧 `count`（数）だけの呼び出しにも後方互換で対応する。既存話数との重複はDBのUNIQUE制約任せにせず事前にまとめてチェックし、採番からINSERTまでを1つのトランザクション・行ロックの中で行うようにした（`getNextEpisodeNumberAtomic` をトランザクション対応にし、非アトミックな旧 `getNextEpisodeNumber` は削除）。`episode_orders` は `start_episode`/`end_episode` の2列しか持たないため、非連続レンジは連続する区間ごとに複数レコードへ分けて記録する。パーサー本体（テキスト→話数リスト）は純粋関数として `shared/src/production/episodeSpec.ts` に切り出し、サーバー側は import できないため `server/src/shared/production/episodeSpec.ts` に意図的に複製した（`scripts/check-collab-parity.mjs` の `PAIRS` に追加し一致を検査）。

検証: `npm run typecheck:all` 全ワークスペース緑、`npx tsc -b client` 緑、`npm run test` 1907件緑（このパーサーのユニットテストを27件追加）、`npm run lint` 緑。呼び出し元は `EpisodesPanel.tsx` の1箇所のみであることを確認済み（MCPツールからの利用なし）。
