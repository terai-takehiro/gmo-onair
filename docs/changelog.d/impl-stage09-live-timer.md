**視聴者数の集計をサーバー側に移し、運用画面を閉じても本番中の数字が止まらないようにした。**
これまでは運用画面を開いているブラウザが `setInterval` で取りに行っていたため、本番中に画面を閉じると
`liveops_snapshots` に記録が増えなくなり、会場モニターと OBS が読む表示画面
（`/live/display/:timerId`）の数字が最後の記録のまま固まっていた。「計測」を明示的に始めて
終える単位にし、サーバーが案件ごとに1本の `setInterval` を張って取得間隔ごとに回す形にした。
⚠️ **YouTube の割り当ては1日 10,000 ユニットで、取得間隔10秒だと1案件で約8,640使う**ため、
**同時に計測できるのは1案件**とし、画面で断るだけでなく部分ユニーク索引
（`liveops_single_measurement`）で構造的に担保した（開始時の `UPDATE...WHERE NOT EXISTS` が
すり抜けても一意違反で2本目の COMMIT が落ち、409 に変換する）。押し忘れによる浪費は
**開始日の23:59（JST）の自動停止**で止め（`liveops_programs.measure_until`）、24時間を超える
番組は終了時刻を手入力して延ばせるようにした（`PATCH /liveops/measure/:programId`）。
計測に使う鍵は**組織共通の1本**（`liveops_org_settings`）にし、**人の鍵にはフォールバックしない**
（個人ごとの鍵は接続テスト専用に用途を絞った）。サーバー側の失敗が誰にも見えなくなるため、
取得の記録を `liveops_poll_log` に残すようにした（YouTube だけは呼ぶたび毎回・他は10サイクルに
1回・失敗は毎回。`units` 列で消費数を正しく数える — Zoom は meeting/webinar で2回呼ぶため
行数と消費数は一致しない）。
⚠️ **`/live/display/:timerId` の URL・無認証・API 契約・Socket 契約は1文字も変えていない**
（書き手がブラウザからサーバーに変わるだけで、表示画面は `liveops_snapshots` の最新1件を
読み続ける）。運用画面（`DashboardPage.tsx`）はサーバーの計測状態を15秒ごとに読むだけにし、
ブラウザから YouTube 等を直接取りに行く経路（`useViewer.ts`）は削除した（サーバーと二重に
取りに行って割り当てを倍消費する事故を防ぐため）。

⚠️ 実装設計書（09-live-timer-impl.md）の当初案から3点是正した:
`main_timer_id` / `liveops_poll_log.program_id` は `liveops_programs.id`/`liveops_timers.id` が
UUID のため TEXT ではなく UUID で FK を張った。取得間隔は1人1行の `liveops_settings` ではなく
新設の `liveops_org_settings` に一本化した。API のエラー文言はキーの断片を伏せてから
`liveops_poll_log.message` に保存するようにした（`key=***` に置換）。

検証: `npm run typecheck:all` / `npm run lint` / `npm run test` OK。`npm run verify:up` は
ポート競合のため未実施（migration の DDL は目視で確認）。本番・検証環境への実デプロイ確認は
このセッションの範囲外。
