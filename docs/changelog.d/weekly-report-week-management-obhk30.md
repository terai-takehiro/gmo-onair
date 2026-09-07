ウィークリー活動報告の週を「任意の開始日で追加」「削除」できるようにした。

これまでは「次の週を作る」（最新週の翌週固定）しか無く、最初の1週をいつ・どんな日付で
作ったかに以後ずっと引きずられていた（検証環境では最初に手動で作った週が偶然 7/6 スタート
で、以後7日刻みのままになっていた）。週のリスト（PC は `WeekRail`・スマホは
`WeekPickerSheet`）の上に日付入力を足し、任意の開始日で週を作れるようにした
（サーバーの `normalizeWeekStart` が週内のどの日でも月曜に丸める。バックエンドの
`POST /dailyops/reports/ensure` はもともと任意の `period_key` を受けられたので変更なし）。
各週の行に削除ボタンも足した（`DELETE /dailyops/reports/:id`・`ops_reports.deleted_at` へ
の論理削除。行 `ops_report_items` は物理削除しない）。確定済みの週は既存の
`assertReportOpen` の仕組みに乗せて削除を断り、「確定を解いてから」直すよう案内する。
今開いている週を削除したときは一覧（`/weekly`）へ戻す。
`AiSummaryCard` を `WeeklyDetailPage.tsx` から切り出して1ファイル400行の上限に収めた。
