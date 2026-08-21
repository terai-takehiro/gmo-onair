**フォームダイアログの共通土台 `<FormDialog>` を新設し、カレンダー①予定の残り6ダイアログを載せ替えた**
（`docs/v4-native-ui-plan.md` バックログ A-1・第1バッチ）。`shared/src/client-v4/formDialog.tsx` は
既存の `<Sheet>`（スマホ=下シート・PC=中央ダイアログ）をそのまま土台にした薄いラッパーで、
合成可能なAPI（`Dialog`/`DialogContent`/`DialogHeader`…）は検討のうえ見送った（骨格を props と
子要素の2通りで表現できてしまうため。理由は `formDialog.tsx` 冒頭のコメント参照）。
`PersonalEventDialog`／`PartnerScheduleDialog`／`StudioBookingDetailDialog`／`FilterDialogs.tsx`
の3ダイアログ（部屋/人/レイヤーで絞る）／`StudioBookingDialog`（自前実装の下シートをやめて土台に
集約。ヘッダーにあった「キャンセル/予約する」ボタンは `<Sheet>` の決めごと「主ボタンは下端固定」
に合わせてフッターへ移した）の計6ダイアログを新部品に統一した。見た目・保存先・フォームの中身は
変えていない。残り約54か所（`client`/`client-daily`/`client-equipment`）は
`docs/v4-native-ui-plan.md` に次バッチの対象として列挙した。
検証: `npx tsc -b client` / `npm run lint` / `npm run test`（1142件）/ `npm run build:all` OK。
`npm run check:frozen` は3アプリ（Qシート・技術資料・計時LIVE）でズレを検出したが、
本変更を含まないクリーンな `HEAD` でも同じバイト数のズレが再現したため、
本変更とは無関係な既存のズレと確認した（変更対象は `client/` と `client-v4/` のみで、
凍結4アプリの Tailwind は `client-v4/**` を走査しない）。
