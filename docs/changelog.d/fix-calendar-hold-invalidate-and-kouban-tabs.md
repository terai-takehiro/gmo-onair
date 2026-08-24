**カレンダー（予約・仮押さえ・香盤）のロジック不具合を3件直した**（多エージェント監査
`docs/reviews/2026-08-24-logic-audit.md` の指摘）。

①**予約を作る・付け替える・消したあと、③仮押さえ一覧と①予定の右レール「仮押さえ」
ウィジェットが古いまま残っていた不具合を直した。** どちらも `holdLogic.ts` の
`HOLD_KEY`（`['studio-holds']`）で `/studios/bookings?status=tentative` を読んでいるが、
予約を書き換える6か所が呼ぶ `invalidateBookingQueries`（`bookingQueries.ts`）の
`BOOKING_AFFECTED_KEYS` にはこの鍵が入っておらず、拠点の略称保存で一度直った
「project-studio-bookings を落とし忘れる」と同型の invalidate 漏れが別の鍵で再発していた。
`BOOKING_AFFECTED_KEYS` に `holdLogic.ts` の `HOLD_KEY` をそのまま import して足し、
`shared/tests/bookingInvalidation.test.ts` にも対象を追加した。

②**営業時間外の予約に付く「印」（`out_of_hours`）と、そのための注意が画面のどこにも
出ていなかった不具合を直した。** `studio-booking.service.ts`/`studio.routes.ts` は予約の
作成・更新のたびに営業時間外かを判定して DB に印を保存しているが（サーバーは意図的に
「止めない」設計）、返り値の `hours_check` を画面側が一度も見ていなかったため、時間外の
予約を入れても利用者は何も気づけなかった。`StudioBookingDialog` の保存成功時に
`hours_check.outside` を見て、v4 の決めごとどおり `notifyWarning`（流れて消えない帯）で
理由を出すようにした。あとから拾う一覧（`GET /business-hours/out-of-hours/list`）は
今回は対象外（工数が大きいため、保存時の警告のみ実装）。

③**香盤ビュー（`KoubanView.tsx`）で、拠点タブ判定が用賀/渋谷/青山のみをハードコードして
おり、それ以外の拠点（例: 設定画面の入力例のままの拠点名）に実部屋があると、部屋を
持たない外現場の予約がどのタブからも見えなくなっていた不具合を直した。**「その他」タブの
表示分岐が `filteredRooms.length === 0` のときだけ外現場予約リストを描画しており、その他
タブに割り当たる拠点に実部屋が1つでもあると、外現場予約のリストがまるごと部屋グリッドに
押し出されて出なくなっていた。「その他」タブは外現場予約リストと部屋グリッドを**常に
両方**出すよう表示分岐を作り直した（拠点タブそのものの動的生成は対象外・最小限の変更）。

検証: `npx tsc -b client server`・`npm run test`（110ファイル/1462件）・`npm run lint` を確認済み。
実ブラウザでの動作確認・実DBでの確認はこのセッションから行っていない。
