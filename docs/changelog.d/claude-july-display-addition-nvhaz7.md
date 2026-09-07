**ウィークリー活動報告に「次の週を作る」ボタンを追加した**。

ウィークリー活動報告（`/daily/weekly`）は AI の自動下書きが前提の設計だが、週の箱（レコード）
を新しく作る自動生成トリガーは未実装のまま残っており、手動で作る入口も画面のどこにも無かった。
API (`POST /dailyops/reports/ensure`) と `useEnsureReport`（`client-daily/src/lib/reportsApi.ts`）
自体は既に用意されていたため、検証環境では週の箱が増えないまま止まっていた（7月の週が最新
のまま止まっていた）。

週のリスト（PC は `WeekRail`・スマホは `WeekPickerSheet`）の上に「次の週を作る」ボタンを追加
した。押すと、一覧の先頭（サーバーが `period_key` の新しい順で返すので最新週）の翌週の開始日
を計算し、`POST /dailyops/reports/ensure` を呼んで箱を作成、できた週へ遷移する。箱を作るだけの
操作で既存の「先週ぶんを作成」相当のボタンにも確認ダイアログが無いため、こちらにも確認ダイア
ログは付けていない。ボタンは編集権限がある人（`canEdit`）にだけ出し、閲覧のみの人には出さない。

`WeekRail`/`WeekPickerSheet` 側の実装は別作業（`onAddNextWeek?: () => void` /
`addingNextWeek?: boolean` の2 props を追加）。呼び出し側の `WeeklyDetailPage.tsx` で
`useEnsureReport()` を使い、翌週の開始日を求める `nextWeekStart()` をこのファイル内に閉じて
実装した（`lib/types.ts` の共通ヘルパーには足していない — 過去に同種のヘルパーを呼び手0件で
削除した経緯があるため）。

検証: `npx tsc -b client-daily`、`npx eslint client-daily/src/pages/WeeklyDetailPage.tsx` とも
エラーなし。`WeeklyDetailPage.tsx` は398行で1ファイル400行の上限内。
