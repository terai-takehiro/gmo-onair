**GPMダッシュボード（`/gpm/dashboard`）をカードとして組み直した**（マルチエージェント監査
`docs/v4-native-ui-audit-2026-08-20.md` の続き）。KPI帯（`KpiStrip.tsx`）はモバイルで5枚が
単純に縦積みになるだけで、「動いているプロジェクト」の行も `w-24`/`w-28` の固定幅spanを
横並びさせるだけのミニ表のままだった。KPI帯はスマホだけ**横スワイプできるウィジェットの
レール**（`client-v4/rail.ts`）に差し替え（`MobileKpiRail.tsx`）、「動いているプロジェクト」
「止まっているプロジェクト」「未確認事項」の3枚は案件一覧（`projectList/ProjectCards.tsx`）
と同じ考え方でカード化した（`MobileDashboardCards.tsx`）。**行を縮めたのではなく組み直した**
— PCの行が持つ情報（工程名・担当・進捗バー・期限・未確認件数）はどれも削っていない。
数字の意味・並び・危険色の判定はPC/スマホで1本化した（`KpiStrip.tsx` の `kpiCells()` を
両方が読む。書き写すと片方だけ直した日に同じ画面で数字の意味が食い違うため）。
`useIsMobile()` は `GpmDashboardPage.tsx` の最上部で1回だけ呼び、部品ごと入れ替えている。
検証: `npx tsc -b client` / `npm run lint` / `npm run test`（1141件）OK。
⚠️ ブラウザ自動化ツールが無く、375px幅での実ブラウザ確認は未実施。
