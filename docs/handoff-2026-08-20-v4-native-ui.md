# 引き継ぎ書 — v4ネイティブUI化（2026-08-20 セッション）

> 対象ブランチ: `claude/v4-ui-site-tree-c9zvz4`（**未マージ・PR未作成**）
> このセッションで66コミット・224ファイルを変更し、すべてpush済み。
> **2026-08-21・下記の`main`重複を検知した後、ユーザー判断で`main`を取り込み、
> 競合はこのブランチの版で解決済み**（コミット`fa19eb9`）。
> 作業ログの正は [docs/v4-native-ui-plan.md](v4-native-ui-plan.md) — この文書は
> **次に着手する人が最初に読む要約**として書いた。

## ✅ 解決済み — `main` との重複作業（2026-08-21・ユーザー判断で解決）

以下は発覚時点の記録。**ユーザーから「こっちのブランチを採用してください」との指示を受け、
`git merge origin/main`でこのブランチの版を採用する形で解決済み**（コミット`fa19eb9`）。
最新の解決内容は `docs/v4-native-ui-plan.md`「mainとの重複作業をマージした」節を参照。

このセッションの作業中、**別のセッションが同種の「PC専用画面をスマホ対応する」作業を
並行で進め、PR #272（`claude/ios-native-mobile-mockups-55iuj1`）として既に `main` へ
マージ済み**であることが分かった（気づいたのはこのブランチの作業が一区切りついた後）。

### 確認した事実

- `git merge-base HEAD origin/main` = `f94ca97`（このブランチと `main` の分岐点）
- 分岐点から `main` は11コミット進んでおり、うち主要なものが PR #272・#273
- PR #272 は次の画面をPC専用から開放している:
  `/budget/purchases` `/budget/revenues` `/budget/sga` `/sales/activity-logs`
  `/sales/billing` `/sales/customers/:id` `/sales/flow-templates` `/sales/pricing`
  `/sales/project-groups` `/sales/project-groups/:id` `/sales/projects/:id/edit`
  `/sales/projects/ledger` `/sales/tasks/gantt`
- このブランチは独立に次の画面を開放している（`docs/v4-native-ui-plan.md` 参照）:
  `/gpm/templates` `/sales/project-groups` `/settings/hours` `/settings/money`
  `/settings/notify` `/settings/sites` `/settings/users` `/studio/rooms`
  `/sales/customers/:id`（顧客360・後述）ほか多数

### 実際に重複・要判断な箇所

1. **`client/src/pcOnlyScreens.ts`** — 両ブランチが編集。`git merge-tree` で機械的な
   コンフリクトマーカーは出ない（テキストレベルでは自動マージ可能）が、
   **`/sales/project-groups` を両方が独立に `CLIENT_MOBILE_OK` へ追加**しており、
   マージ後に重複エントリになっていないか確認が要る
2. **`/sales/customers/:id`（お客様の詳細・顧客360）— 最重要**。
   - **`main`（PR #272）**: 既存の `CustomerDetailPage.tsx` に**最小限のTailwind
     クラス調整だけ**を入れた（コメント曰く「本格的なv4化は別の機会に判断する」）
   - **このブランチ**: `CustomerDetailPage.tsx` を**v4トークンで全面刷新**し、
     `client/src/contexts/sales/pages/customerDetail/` に10ファイル新設
     （PageHeader・Row・FormDialog・カード積み等。コミット `44559bf`）
   - **同じファイルを2つの異なるアプローチで別々に直しており、どちらを採用するかの
     判断が必要。** このブランチの方が今回のユーザー指示（「PC版のみはやめ、
     全画面をmacOS/iOSネイティブ級に」）に忠実だが、`main` に先に入った版と
     マージすると**このファイルは確実にコンフリクトする**
3. **財務台帳3画面（`/budget/purchases` `/budget/revenues` `/budget/sga`）** —
   `main`側が`ledger/LedgerRows.tsx`の共通部品を直してスマホ開放した。このブランチは
   同じ3画面をPC専用のまま据え置いている（監査で「桁比較の表なので妥当」と判断）。
   **矛盾ではないが、`main`側の判断（開放）を採用するかどうかは要確認**
4. **`/sales/tasks/gantt`** — `main`側がガントのスマホ版を作った。このブランチは
   案件詳細⑥のタスクタブで「スマホはリスト表示のみにしガント切替はPC専用にする」と
   **逆方向の判断**をしている（`b17892b`）。同じ「タスクのガント」という機能に対して
   2つの矛盾する設計判断が入っている可能性がある — **要確認**

### 対応済み（2026-08-21）

上記1〜3は完了した。ユーザーに報告のうえ「こっちのブランチを採用してください」との
指示を受け、`git merge origin/main`でこのブランチの版を採用してコンフリクトを解消し
（コミット`fa19eb9`）、typecheck/lint/test/build/check-mobile-declared/check-links を
すべて再検証してpush済み。詳細は `docs/v4-native-ui-plan.md`「mainとの重複作業を
マージした」節を参照。

**残っているのは4のみ**: PRをまだ出していない。出すかどうか・出すタイミングは
ユーザーの指示を待つ（このセッションでは指示されていないため未実施）。

---

## セッションの流れ（要約）

1. ユーザー指示: 「PC=macOSアプリ風・スマホ=iOSアプリ風に全画面を作り直す。PC専用は
   原則廃止。未対応のものをモックアップから。マルチエージェントで並列作業」
2. 対象範囲の確認（凍結4アプリは対象外・据え置き画面は原則作り直す・既存56画面も
   再監査対象、とユーザーが判断）
3. **監査**: 並列7エージェントで既存63画面を「ネイティブ級／レスポンシブ止まり／
   PC専用(要再検証)／PC専用(妥当)」に分類 → `docs/v4-native-ui-audit-2026-08-20.md`
4. **バックログA〜D を11バッチ・のべ約65エージェントで実装**（詳細は
   `docs/v4-native-ui-plan.md`の「バックログ」節）
5. **マルチエージェントでバグ調査**: 発見→独立2名で懐疑的に検証→確認できたものだけ
   修正、の3段構成。3件の実害あるバグを発見・修正
6. 全バッチでtypecheck/lint/test(1144件)/ビルドを独立に再検証してからpush
7. 最後に7アプリ全部のビルド＋凍結4アプリCSS差分チェックで最終確認
   （凍結アプリのズレは今回の変更が原因でないことをバイト単位で再確認済み）
8. **この後で `main` との重複が発覚**（上記）

## 完了した項目

| 項目 | 内容 | 参照コミット |
| --- | --- | --- |
| A. ダイアログの土台統一 | 76箇所の登録・編集ダイアログを共通の下シート部品 `FormDialog` へ移行。`wide`/`onSubmit`/`onInteractOutside` の3つのopt-in機能を土台に追加 | `197d116`〜 |
| B. 旧カレンダー退役 | 旧スタジオカレンダー・旧自分の予定の機能を①予定/設定に吸収し削除 | `341f8d6` |
| C. `responsive_only` 21画面 | 全画面をカード・シート型のネイティブ実装に作り直し（顧客360・GPMプロジェクト詳細を含む） | `461d423`〜`44559bf` |
| D. 残りの機能ギャップ | タスク一覧の新規追加・延期／棚卸し一覧のカード化／入金確認の検索 | `1884269` `761e104` `9af93c7` |
| バグ調査 | 3件のバグを発見・修正（GPM未確認事項の到達不能・メンバー編集の必須チェック漏れ・AI投入確認シートの誤クリック消失） | `724ba02` `b081c3a` `7abf244` |

詳細な経緯・判断理由はすべて `docs/v4-native-ui-plan.md` に時系列で記録済み。

## 検証状態（このブランチ単体）

- `npx tsc -b client client-daily client-equipment server` — エラー0
- `npm run lint` — エラー0（既存の警告59件のみ、無関係）
- `npm run test` — 1144件全通過
- `npm run build:all`（7アプリ＋server） — 成功
- `npm run check:frozen` — 凍結3アプリにズレはあるが、**今回のセッション開始前から
  存在していた既知のズレとバイト数まで完全一致**（原因未調査のまま。実害なさそうと
  判断されているが調査はされていない）

✅ `main` を取り込んだ後（コミット`fa19eb9`）も typecheck/lint/test/
check-mobile-declared/check-links を再実行しすべてOKを確認済み（`npm run
build:all` は実行中）。`check:frozen` は`main`取り込み後まだ再確認していない
— 次に着手する人は念のため回すこと（今回の一連の変更はいずれも凍結4アプリの
CSSに触れない領域のはずだが、`main`側のPR#272の変更内容までは未確認）。

## 残っている作業（急ぎではないもの）

- 純粋な操作感の演出（スワイプアーカイブ・pull-to-refresh・スワイプバック等）
- 案件詳細⑥の残り5タブ（やり取り/見積/書類/当日/ふりかえり）のモバイル専用化
- 機材台帳の親子入れ子（子機材個別の編集導線）
- 凍結アプリCSSの既存ズレの原因調査

## 参照ドキュメント

- [docs/v4-native-ui-plan.md](v4-native-ui-plan.md) — 決定事項・監査結果・バックログの進捗（時系列の正）
- [docs/v4-native-ui-audit-2026-08-20.md](v4-native-ui-audit-2026-08-20.md) — 63画面の監査詳細
- [docs/v4-native-ui-audit-2026-08-20.json](v4-native-ui-audit-2026-08-20.json) — 監査の生データ
- [docs/v4-progress.md](v4-progress.md) — v4化の進捗表（生成物・`node scripts/v4-progress.mjs --write`で作り直す）
- [shared/CLAUDE.md](../shared/CLAUDE.md) — `FormDialog`/`Sheet`の新設propの説明を追記済み

## セッション中に踏んだ運用上の注意点（再発防止）

- **複数エージェントが同じ作業ディレクトリを共有する**ため、各エージェントには
  「作業前に `git status` を確認」「`git add -A` ではなく自分の変更ファイルを
  明示指定」を毎回徹底させた。それでも数回、他エージェントの未コミット変更が
  混入しかけたが、いずれも `git status` で気づき分離できた
- **セッション終盤でローカルの作業ディレクトリの `git log` が一時的に古いコミット
  （`44fa604`）まで巻き戻って見える現象が発生**（原因は不明・コンテナの状態が
  巻き戻った可能性）。**リモート（`origin/claude/v4-ui-site-tree-c9zvz4`）は
  正しく最新（`33f619b`）を保持しており、データは失われていなかった**。
  `git reset --hard origin/claude/v4-ui-site-tree-c9zvz4` で復旧済み。
  次に作業する人も、ローカルの `git log` がリモートと食い違って見えたら
  まず `git fetch` してリモートを正として扱うこと
