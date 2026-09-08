# Phase C 詳細設計 — 金額・受注/失注日時・実施日・書く口の一本化（2026-08-27）

> **状態**: 現役の計画（進行中）／判断待ち（各テーマの「ユーザー判断が要る分岐点」）— ✅ の段階は実装済み。🔲 は本番データの監査かユーザー判断を待って着手する
> **最終確認**: 2026-09-08（v4.6.10） — 各表の ✅/🔲 を `project.service.ts`（`createCore`・`recordStageTransition`）・migration・`excel.routes.ts`・`kessan-import.service.ts` で突き合わせ、C-1a の表示だけ訂正した
> **位置づけ**: [project-ledger-simplification-plan.md](project-ledger-simplification-plan.md) Phase C の詳細設計。`event_start`/`event_end` は今も TEXT 列（DATE 化は未実施）。Excel 取込・決算取込は今も `INSERT INTO projects` を直接書く（集約は未実施）。

[docs/project-ledger-simplification-plan.md](project-ledger-simplification-plan.md) の
Phase C（「設計変更・別計画で詳細化」）の詳細版。マルチエージェントで4テーマを並列調査し、
各テーマごとに (1) 現状の書き手・読み手の全リスト (2) 実測で確認した実害
(3) 具体的な変更手順 (4) 影響範囲 (5) ユーザー判断が要る分岐点 (6) 段階案、をまとめた。

**この文書の使い方**: 各テーマの「実装状況」欄を見て、✅ 実装済みの段階と、
🔲 ユーザー判断待ちの段階を区別すること。判断待ちのまま実装しない。

---

## テーマ1: 金額（`expected_amount` ⇔ `estimates` ⇔ `revenues`）

### 用語整理（誤解しやすい点）

「見積」という言葉が指すものが実は3つある:

| 呼び名 | 実体 | 反映先 |
|---|---|---|
| 想定金額 | `projects.expected_amount` | 集計系が唯一SUMする値 |
| 見積シミュレーション | `simulations` テーブル | 確定すると想定金額へ直接反映 |
| 概算見積 | `revenues.status='estimate'` | GLS発番時に自動で confirmed 化。**想定金額に直接書き込む** |
| 見積（見積書） | `estimates` テーブル（版・承認フロー） | 表示（一覧・詳細・台帳）には使うが**想定金額には一切書き戻さない** |

`client/CLAUDE.md`は「見積は`estimates`別テーブル」と明記するが、実装には
**もう一つの「見積」＝`revenues.status='estimate'`（概算見積）が現役で残っている**。

### 実測で確認した実害

1. **表示と集計が構造的に食い違う**: 案件一覧・詳細・台帳は
   「見積があれば見積・無ければ想定」（`estimate_amount`優先）で表示するが、
   **集計系11箇所（営業分析・ダッシュボード・週報・営業評価KPI）は例外なく
   `expected_amount`だけを合計**している。見積書を`accepted`にして確定売上へ変換しても
   `projects.expected_amount`は更新されないため、画面の数字と経営指標の数字が
   **正当な操作だけで食い違う**（`estimate.service.ts`の`convertToRevenue`に
   `UPDATE projects`が無いことをコードで確認済み）。
2. **双方向上書きの非対称なガード**: 案件→売上への書き戻し（`project.service.ts`）には
   変更検知・明細ありの売上を除外するガードがあるが、**売上→案件への上書き
   （`revenues.routes.ts`のPOST/PUT）にはガードが一切ない**。危険度が高い方向が
   無防備。
3. **Excel取込の0上書き**: 想定金額セルが空だと既存値を無条件で0にする
   （「渡さなければ保つ」パターンが無い）。
4. 検証用DBは見積0件のため乖離の実例をSELECTで再現できなかった（実データでの
   確認は不可）。乖離が起きる条件そのものはコードトレースで確定的に示した。

### 段階案と実装状況

| 段階 | 内容 | リスク | 実装状況 |
|---|---|---|---|
| C-1a | 表示バグ是正: ダッシュボード（`dashboard.routes.ts:431/555`）・週報
  （`weekly-stats.service.ts:34`）を他の一覧と同じ「見積優先」表示に揃える | 低 | ✅ 実装済み（2026-08-27。`dashboard.routes.ts`・`weekly-stats.service.ts` に `estimate_amount` 列を追加。この欄だけ「🔲 未着手」のまま残っていたのを、下の「まとめ」と検証の記述に合わせて 2026-09-08 に訂正） |
| C-1b | 集計統一: `EFFECTIVE_AMOUNT_SQL`共有定数を追加し、営業分析7箇所・ダッシュボード
  パイプライン集計・「今月の受注」KPI・週報のSUM/AVGを置き換え | 中（経営指標の数字が変わる） | 🔲 **本番データでの乖離幅を確認してから**（分岐点C） |
| C-1c | 双方向上書きの停止＋通知追加 | 高（業務フロー変更・財務直結） | 🔲 **要ユーザー判断**（分岐点A・B） |
| C-1d | Excel取込の0上書き修正 | 低〜中 | ✅ 実装済み（C-1aと合わせて実施） |

### ユーザー判断が要る分岐点

- **分岐点A**（双方向上書き停止の可否）: (a)両方向停止＋通知 [提案] / (b)売上→案件のみ停止 /
  (c)今回は触らずC-1のみ実施
- **分岐点B**（通知方式）: (a)`notifications`テーブル＋テンプレ [提案] / (b)画面バッジのみ /
  (c)両方
- **分岐点C**（本番データの事前監査）: C-1b適用前に、本番の`expected_amount`と
  `estimate_amount`の乖離件数・乖離額を確認する必要がある。**このセッションからは
  本番DBへアクセスできないため、確認はユーザー側（またはVPS作業）でお願いしたい。**

---

## テーマ2: 受注/失注日時（`won_at`/`lost_at`）

### 実測で確認した実害

1. `projects.stage`を`a_won`/`e_lost`にする書き口は6経路あるが、
   `project_stage_changes`・`won_at`・`lost_at`を正しく3点セットで書くのは
   案件（GLS-A）の`changeStage()`と自動整理ジョブの2経路だけ。
2. **GPMのlost_atが未修正のまま残っている**: Phase Aで`won_at`は直したが、
   GPM経由の見送り（`e_lost`）は`lost_at`/`lost_reason`を一切書かない。
   失注理由分析はGLS-A/B両方を読むため、**GPM経由の見送りは`lost_at`が
   永久にNULLのまま`updated_at`に付け替えられて集計される**（バグ④と同型の穴）。
3. **GPMの新規作成は既定値が`a_won`で、初回ステージの履歴行を書かない**。
   今日GPMプロジェクトを1件作ると`stage='a_won'`なのに`won_at IS NULL`かつ
   履歴0件の行ができる（穴は今日も開き続けている）。
4. `bulkUpdate()`（台帳の一括編集）にサーバー側のガードが無い。画面は`stage`を
   送らないよう自主規制しているだけで、APIを直接叩けば履歴・GLS発番確認を
   経由せずステージだけ動かせる。

### 採用する設計: トリガ型（一点書き込みへの集約）。列は残す

導出案（列を消し読むたびに`project_stage_changes`から計算）も検討したが、
土台（履歴の完全性）がまだ無いため見送り。共有関数`recordStageTransition()`を
新設し、書き口をここに集約する。

### 段階案と実装状況

| 段階 | 内容 | リスク | 実装状況 |
|---|---|---|---|
| PR1 | `recordStageTransition()`共有関数の新設＋`changeStage()`を寄せる＋
  GPM `update()`を寄せる（GPMのlost_at欠落を修正） | 低（新規記録の追加のみ。
  ただしGPM見送りの月次集計が今後正しい月に変わる） | ✅ 実装済み |
| PR2 | GPM新規作成の初回履歴行追加 | 低（新規作成時のみ） | ✅ 実装済み |
| PR3 | `bulkUpdate()`にステージ変更ガード追加 | 低（実害はまだ無いが恒久的に穴を塞ぐ） | ✅ 実装済み |
| （保留） | Excel/決算取込/シードの履歴欠落 | — | テーマ4（書く口の集約）に委ねる |

### ユーザー判断が要る分岐点

- **GPMの過去分の見送り案件をbackfillするか**: (a)しない（migration 164の
  「過去分は埋めない」原則を貫く）[提案] / (b) `lost_at=updated_at`で埋める。
  **🔲 未実装・要判断**
- **GPMのステージ変更ダイアログに失注理由の入力欄を追加するか**: 案件側と機能を
  揃えるなら画面改修が要る。**🔲 未実装・要判断**（最小実装ではlost_atだけ直し、
  理由は空のまま——現時点ではこちらを採用し、理由入力欄は別途）

---

## テーマ3: 実施日（`event_start`/`event_end`）

### 実測で確認した実害

1. **既存の独立バグ**: `excel.routes.ts`のprojects取込だけが`asString()`を
   使っており（同ファイルのepisode取込は正しく`asDate()`を使用）、Excelの
   日付型セルが「45444」のような数値文字列や`"Mon Jun 01 2026..."`のような
   文字列としてサイレントに書き込まれる。TEXT列だからエラーにならず、
   以降の日付範囲フィルタが黙って壊れる。
2. **DATE型化の実機検証**: 型パーサー未設定だと`SELECT`結果のJSON化で
   `"2026-08-20"` → `"2026-08-20T00:00:00.000Z"`に変わる（`started_on`/`ends_on`
   に既に起きている現象で、クライアント側が個別に防御コードを書いている）。
   `NULLIF(...,'')`・`= ''`・`::text`を使うSQLは型化すると実行時エラーになる
   （該当箇所を全数機械的に特定済み、10ファイル）。
3. **`project_dates`の3系統マージ**: `projectContext.service.ts`が予約前の
   「化石データ」（`project_dates`）と現役データ（`studio_bookings`）を無条件で
   UNION ALLしている。予約前に日程を入れ、後からスタジオ予約で別日程に
   変わった案件では、台本作成のプリフィルに化石の日付が混ざりうる
   （コード読解では確認、実データでの再現は不可＝検証用DBに該当データ無し）。

### 段階案と実装状況

| 段階 | 内容 | リスク | 実装状況 |
|---|---|---|---|
| PR-1 | Excel取込バグ修正（`asString`→`asDate`＋dry_runエラー表示） | 低（独立バグ） | ✅ 実装済み。⚠️ 実装時に判明した制約: 共通インポートルーター（`shared/utils/excel-resource.ts`）は
  `errors`配列が1件でもあるとファイル全体をロールバックする設計で、「警告専用チャンネル」が
  無い。そのため日付が読み取れない行が1件でもあると**取込全体が差し戻される**（「保存自体は
  止めない」を完全には満たせていない）。厳密に満たすには共通ルーター側に`warnings`チャンネルを
  追加する改修が要る（別途） |
| PR-2 | 型パーサー設定＋migration（DATE化）＋SQL書き換え全箇所＋サービス層検査＋テスト更新 | 高（全APIのJSON形式・SQL) | 🔲 **本番データの事前監査が必須**（分岐点①） |
| PR-3 | `projectContext.service.ts`の「1系統＋ラベル」化 | 中 | 🔲 **実データでの影響確認後**（分岐点③） |

### ユーザー判断・確認が要る分岐点

- **① 本番データの事前監査（必須）**: migration前に本番`projects`に対して
  以下のSELECTを実行し、不正形式（`YYYY-MM-DD`以外）が無いことを確認する必要がある。
  **このセッションからは本番DBへアクセスできない。**
  ```sql
  SELECT id, event_start, event_end FROM projects
   WHERE (event_start IS NOT NULL AND event_start !~ '^\d{4}-\d{2}-\d{2}$')
      OR (event_end   IS NOT NULL AND event_end   !~ '^\d{4}-\d{2}-\d{2}$');
  ```
- **② PR-1（Excel bugfix）を先行させるかPR-2と同時か**: 提案は先行（実装済み）。
- **③ `project_dates`のマージ変更の実データ影響確認**:
  ```sql
  SELECT pd.project_id FROM project_dates pd
  JOIN studio_bookings sb ON sb.project_id = pd.project_id AND sb.deleted_at IS NULL
  GROUP BY pd.project_id;
  ```
  0件なら実害ゼロ、1件以上あれば影響を受ける案件を特定できる。**本番での確認が要る。**

---

## テーマ4: 書く口の集約（Excel取込・決算取込・投入口 → `project.service.create`）

### 実測で確認した実害・障害

1. **依頼の前提誤りを発見**: 「投入口は既に`create()`を通っているはず」という
   想定に反し、投入口は`create()`のロジックを**手で複製**していた
   （`customer_type`判定が`create()`と違い常に`'external'`固定——**グループ会社
   からの投入がグループ外扱いになる潜在バグ**を実測で確認）。
2. **`create()`は外部トランザクションに参加できない**: `execute`/`queryOne`が
   プール直結のため、Excel取込・決算取込のような「複数行・複数テーブルに
   またがる1つのBEGIN...COMMIT」に単純には挟み込めない。
3. **`create()`の安全弁が2経路の目的そのものとぶつかる**: `create()`は終了系
   ステージへの直接作成を`neta`へ強制ダウングレードするが、決算取込（`a_won`
   直書きが前提）・Excel取込（過去データ移行で`s_completed`/`e_lost`直接指定が
   仕様）は**両方ともこの安全弁と正面衝突する**。
4. **BOXフォルダ自動作成の暴発リスク**（依頼で懸念していた点、実測で確認）:
   単純に`create()`を丸ごと呼ぶと、バッチ取込のたびにBoxへ数十〜数百フォルダが
   自動生成される。**明示的にオフにできる形でなければ集約してはいけない。**
5. **決算取込は`gls_category`をNULLのまま保存**（既存の実害）。GLS-A限定の
   一覧・「今日の営業」カードから決算取込の案件は常に漏れる。

### 3経路の判定

| 経路 | 判定 | 実装状況 |
|---|---|---|
| 投入口（`neta`起票） | **そのまま寄せられる**。挙動不変＋`customer_type`バグ修正の副産物あり | ✅ 実装済み（PR1: `createCore`分割 + PR2: 投入口移行） |
| Excel取込 | オプション引数（`externalCode`・`externalGlsNumber`・`allowTerminalStage`・`skipBoxFolder`・`broadcast_type`/`media_platform`）を5つ足せば寄せられるが「集約」というより「バッチ用モードを足す」に近い | 🔲 **設計判断待ち**（分岐点2） |
| 決算取込 | **独自ロジックが強く、寄せるべきでない**（`stage`直書き・`gls_number`直書き・`gls_category`省略の3点が`create()`の存在意義と矛盾）。推奨は現状維持 | 🔲 **未着手・現状維持を推奨** |

### 段階案と実装状況

| 段階 | 内容 | リスク | 実装状況 |
|---|---|---|---|
| PR1 | `project.service.create()`を`createCore(tx, ...)`＋薄いラッパーに分割。
  `tx?`/`allowTerminalStage?`/`externalCode?`/`externalGlsNumber?`/`skipBoxFolder?`を追加。
  既存呼び出し元（画面・MCP）は無変更 | 低 | ✅ 実装済み |
| PR2 | 投入口を`createCore`呼び出しに置き換え。独自の採番・生INSERT・履歴INSERTを削除。
  `customer_type`判定バグを修正 | 低 | ✅ 実装済み |
| PR3 | Excel取込の集約 | 中（設計判断次第） | 🔲 **未着手・要判断**（分岐点2） |
| （保留） | 決算取込 | — | 🔲 **現状維持を推奨**（分岐点1） |

### ユーザー判断が要る分岐点

- **分岐点1**: 決算取込を寄せるか、現状維持か。**推奨は現状維持**（寄せても実利が
  薄く壊れるリスクの方が大きい）。
- **分岐点2**: Excel取込を寄せるか。寄せる場合、`create()`本体にオプションを足す案と、
  `createCore`を別途exportしてExcel取込が直接呼ぶ案（安全弁を持つ`create()`と
  バッチ用の低レベル関数を名前で分離）のどちらが良いか。**後者を推奨**。
- **分岐点3**: `gls_category`のbackfill（決算取込で作られた過去案件）を今回やるか
  別issueにするか。旧形式GLS番号だけからA/Bを機械判定できない可能性があり、
  **データを見てから決めたい**。

---

## まとめ: 実装済み・未実装の一覧

| テーマ | 実装済み | 未実装（要判断・要本番確認） |
|---|---|---|
| 金額 | Excel取込の0上書き修正、ダッシュボード/週報の表示バグ修正 | 集計統一（本番データ監査後）、双方向上書き停止（分岐点A/B） |
| 受注/失注日時 | `recordStageTransition`共有化・GPMのlost_at修正・GPM初回履歴・bulkUpdateガード | GPM過去分backfill、GPM失注理由入力欄 |
| 実施日 | Excel取込のasDate修正 | DATE型化（本番データ監査必須）、projectContext一本化（実データ確認要） |
| 書く口の集約 | `createCore`分割、投入口の移行 | Excel取込の集約、決算取込（現状維持を推奨） |

**本番DBへのアクセスがこのセッションには無いため**、「本番データの事前監査」を
要する項目（金額の集計統一・実施日のDATE型化）は、監査結果をいただいてから
着手する。それ以外の判断（双方向上書き停止・GPM backfill・Excel取込集約の設計）は
方針さえいただければ実装できる。

**検証（2026-08-27）**: `npm run typecheck:all`・`npm run lint`・`npm run test`
（1522件）緑。migration は無し（列の型・存在は変えない、コードの書き口集約のみ）。
実サーバー（検証用Postgres）で: 案件作成（`createCore`経由）・受注/失注への
ステージ変更（`recordStageTransition`、GLS自動発番込み）・台帳の一括編集での
受注/失注拒否（400）と通常ステージ変更（200）・GPMプロジェクト作成時の初回履歴と
`won_at`・**GPM経由の見送りで`lost_at`/`lost_reason`が書かれること（今回の主要な
バグ修正）**・投入口からグループ会社の案件を起票したとき`customer_type='internal'`
になること（従来は`'external'`固定だったバグの修正）・ダッシュボード
`sales-board`/`ai-inbox`と週報`weekly-stats`への`estimate_amount`列追加（重複行なし）
を確認済み。
