**旧スタジオカレンダー・旧自分の予定を①予定・④設定に機能吸収してから退役させた。**
`docs/v4-native-ui-plan.md` バックログBの方針どおり、①旧スタジオカレンダー
（`/studio/studio-calendar`）の香盤ビュー（部屋を縦に並べた「いつ空くか」表）を
①予定の月・週・一覧と並ぶ4つ目の表示切替として吸収し、読むだけだった予約詳細
（`StudioBookingDetailDialog`）の「編集」から既存予約を直せるようにした
（旧画面が持っていた「既存の部屋予約を直す唯一の導線」もこれで無くなった）。
②旧自分の予定（`/studio/my-calendar`）の取込元ごとの色分け（個人予定/Google/
Outlook/ICS購読/共有）は①予定の凡例（`CalSidebarExtras`・スマホは
`FilterDialogs`）へ統合した。外部カレンダー連携の設定は実装を確認したところ
④設定（`CalendarSettingsPage`の「外部カレンダー」タブ）が既に同じ機能を持って
いたため移設は不要だったが、**サーバーのGoogle/Outlook OAuthコールバックが
`/studio/my-calendar`へ直書きでリダイレクトしていた**ため、退役前に④設定へ
張り替え、連携完了時の通知バナーも移設した（張り替えを忘れると「連携したのに
何も起きない」画面になっていた）。両画面を削除し、旧URLは①予定への
`RedirectKeepQuery`にした（`/studio/partners`と同じパターン）。あわせて
`nav.ts`の「そのほか（作り直し前）」・`pcOnlyScreens.ts`の該当エントリを削除し、
`scripts/v4-progress.mjs`から実体の無くなった2行を消し、利用マニュアルの
該当ページを①予定・④設定の実態に合わせて書き直した。
検証: `npx tsc -b client` / `npm run lint` / `npm run test`（1141件）OK。
検証用Postgres + サーバーを実際に起動し、`/studios/bookings`系エンドポイントが
編集フォームに必要な全項目（`project_id`/`location_note`/`notes`等）を返すこと、
`CalendarSettingsPage`が使う外部カレンダー連携系エンドポイントが動くことを確認した。
⚠️ 実ブラウザでのクリック確認（部屋予約の新規作成・編集・パートナー予定・自分の予定・
外部カレンダー設定）はブラウザ自動化ツールが無く未実施。
