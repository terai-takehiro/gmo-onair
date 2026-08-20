**お客様の詳細（顧客360・`/sales/customers/:id`）を v4 に作り直し、スマホにも開放した。** v4のRow/Sheet/PageHeader等のトークンを一切使わず`Card`/`PageTransition`だけで組まれた、v4化未着手の最後の大きい画面だった（`docs/v4-native-ui-audit-2026-08-20.md`）。`PageHeader`・取引実績サマリー（`SummaryTiles.tsx`・警告色は`warning-surface`/`info-surface`トークン）・「やり取りの履歴」・「案件」・「年次売上」の4節に作り直し、PCは`Row`/`RowMain`/`RowSlot`の密な行表示（取引先マスター・案件詳細と同じ部品）、スマホは1件＝1枚のカード積み（`company/CompanyCards.tsx`と同じ考え方で行を縮めるのではなく組み直した・`customerDetail/TimelineCards.tsx`ほか）に出し分けた。インライン展開だった「やり取りを記録」フォームは`<FormDialog>`（PC=中央ダイアログ・スマホ=下シート）に載せ替えた。データの出どころ・API（`GET /customers/:id/overview`・`POST /activity-logs`）は1つも変えていない。

- **`activityLog/`（営業活動記録）の部品を3つ一般化して顧客360と共有した**（写すと画面ごとに次回アクションの片づけ方がずれる）。`ProvenanceChips`/`NextActionInline`の`row`引数を`Pick`にして、顧客360が持つ行（`duration_minutes`等の列を持たない別のSELECT）でも渡せるようにし、`useNextActionActions`に追加の invalidate 鍵を渡せる引数を足した（既存の呼び出しは影響を受けない）。ステージバッジは案件一覧と同じ`projectList/stages.ts`（`STAGE_BADGE_LABEL`/`STAGE_BADGE_TONE`）を読む。
- **`pcOnlyScreens.ts`を更新し`CLIENT_MOBILE_OK`へ移した**（監査が「大規模な2枚（顧客360・GPMプロジェクト詳細）を除く」と保留していた側）。375pxで横はみ出し0px・JSエラー0件を実測（データが多い顧客・0件の顧客の両方・やり取りを記録の送信・次回アクションの完了/延期・案件行のタップ遷移まで確認）。
- ⚠️ `shared/tests/reachPhone.test.ts`の「お客様の画面はPC専用のまま」という前提が崩れたため、探すの行から番号へ直接かけられる決めごと（詳細を開かずに`tel:`へ飛べる）自体は変えず、前提の記述だけ直した。

検証: `npx tsc -b client` / `npm run lint` / `npm run test`（1144件）OK。実Postgres＋実ブラウザ（Playwright・375px/1280px）で確認。
