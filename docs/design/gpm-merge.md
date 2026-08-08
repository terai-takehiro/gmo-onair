# プロジェクト管理を GLS-B に一本化する — データの持ち方の決め

> **この文書は [`gpm-model.md`](gpm-model.md) の決め①を差し替えます。**
> あちらは「プロジェクト管理は案件ではない」を前提に `gpm_projects` を新設しましたが、
> **その前提が業務側の定義と違っていました**（下記）。決め②〜⑤は生きています。
>
> **実測した数字を根拠に書いてあります。** 推測で決めた箇所には「要確認」と書きます。
> 実測は検証用 Postgres（`npm run verify:up` = migration 001b〜178 を当てた実物）に
> 対して `pg_constraint` / `information_schema` を引いたものです。

---

## 0. 何が変わったのか

業務側の定義はこうです（今回いただいたご指摘）:

| 旧来の呼び方 | v4 のアプリ |
| --- | --- |
| **GLS-A** | **案件管理** |
| **GLS-B** | **プロジェクト管理** |

いまのコードはこの対応を持っていません。実際にはこうなっています:

- **案件管理**（`projects`）が **GLS-A と GLS-B の両方**を持つ。`gls_category` が `'A'`/`'B'` で、
  左メニューに「確定案件（スタジオ）」「確定案件（ビジネス）」が2本並んでいる
- **プロジェクト管理**（`gpm_projects`）は **GLS と無関係の別テーブル**。
  コード上、GPM 側に GLS 番号の概念は 1 か所も無い

`gpm-model.md` の決め①（`projects` に相乗りさせない）の根拠はこうでした:

> 75 か所が「projects にある行はすべて案件だ」という前提で書かれている。
> 混ぜると案件一覧・財務の集計・決算取込・検索・MCP の list_projects・週報が全部これを拾う。

これは **「GPM のプロジェクトは案件ではない」** が前提です。**GPM = GLS-B 案件**なら、
それらが拾うのは汚染ではなく**正しい動作**になります
（GLS-B の売上が決算に入らないほうが誤り）。**前提が消えたので、決め①は差し替えます。**

---

## 決め① 残すテーブルは `projects`。`gpm_projects` を畳む

「1本にまとめる」だけなら向きは2つありますが、**外部キーの数が桁で違います。**

### 実測（検証用 Postgres の `pg_constraint`）

```
projects(id)     を参照する外部キー   30 本   (うち NOT NULL 16 / NULL 可 14)
gpm_projects(id) を参照する外部キー    4 本   (うち NOT NULL  3 / NULL 可  1)
```

**`NOT NULL` の 16 本**（この列に値が入らない行は作れない = 親が消えると成立しない）:

```
revenues / purchases / revenue_allocations / purchase_allocations / invoice_groups
episodes / episode_orders / event_reports
project_dates / project_members / project_minutes / project_stage_changes / project_collab
project_group_members / task_columns / task_dependencies
```

**`NULL` 可の 14 本**（制約が緩いぶん、**エラーにならずに孤児になる**）:

```
estimates / project_tasks / studio_bookings / activity_logs / simulations
qsheet_documents / techsheet_documents / equipment_lendings
liveops_programs / liveops_timers / interactive_events
inview_registrations(promoted_project_id) / misc_inquiries / gpm_projects
```

`gpm_projects(id)` を参照しているのは **`gpm_phases` / `gpm_open_items` / `gpm_members`**
の 3 本（NOT NULL）と、**`estimates.gpm_project_id`** の 1 本（NULL 可）だけです。

> **訂正**: 会話の中で「NOT NULL は 17 本」と申し上げましたが、実測は **16 本**です。
> `project_tasks.project_id` は migration 135（個人タスク）で、
> `estimates.project_id` は migration 173（GPM の見積）で、それぞれ NOT NULL が外れていました。
> migration の本文だけを数えると外れたものを拾えません。

### 決めたこと

**`gpm_projects` の行を `projects` に `gls_category='B'` として取り込み、`gpm_projects` は畳みます。**

- 逆向き（GLS-B を `gpm_projects` へ移す）にすると、**その案件の売上・仕入・請求・見積・回・
  タスク・議事録は 16 本の NOT NULL に弾かれてぶら下がれなくなります**。
  ビジネス案件の**月次請求（月締め）が丸ごと成立しなくなる**のが一番大きい影響です
  （`BusinessProjectView.tsx` の月次請求は `revenues` / `estimates` を案件に結んで数えています）
- 付け替えるのは **4 本だけ**で済みます
- **利用者から見た結果は同じ**です。テーブル名は画面に出ません。
  「プロジェクト管理アプリを開くと GLS-B が並ぶ」「案件管理は GLS-A だけ」は
  どちらの向きでも実現できます

---

## 決め② 列は「足りない 5 つだけ」足す。既にあるものに寄せる

`projects` は **48 列**、`gpm_projects` は **20 列**。突き合わせるとこうなります。

| `gpm_projects` の列 | `projects` の対応 | どうするか |
| --- | --- | --- |
| `id` `name` `notes` | 同名で存在 | **そのまま** |
| `box_url_internal` `box_url_external` | 同名で存在 | **そのまま** |
| `created_by` `updated_by` `created_at` `updated_at` `deleted_at` | 同名で存在 | **そのまま** |
| `customer_id` | `customer_id`（**NOT NULL**） | 決め④ で扱う |
| `pm_user_id` | `assigned_to`（NOT NULL） | **寄せる**（自社側の PM = 社内担当） |
| `template_id` → `gpm_templates` | `flow_template_id` → `flow_templates`（178） | **寄せない**（決め⑥） |
| `project_id` | 自分自身になる | **消える** |
| `kind`（`self_build` / `group_order`） | 対応なし | **足す**（`project_type` は別軸・決め③） |
| `pm_company` | 対応なし | **足す** |
| `started_on` `ends_on`（`date`） | `event_start` `event_end`（**`text`**） | **足す**（型が違う・決め③） |
| `status`（`planning`/`active`/`done`/`onhold`） | `stage`（7 段） | **足さない**（決め③で対応表にする） |

**`projects` に足すのは 5 列**（`gpm_kind` / `pm_company` / `started_on` / `ends_on` と、
決め⑥ の `gpm_template_id`）。20 列のうち 15 列は既にあるものに乗ります。

- **`event_start` / `event_end` に寄せない。** `text` 型で、案件では「本番の日」を指します。
  工事の着工〜完工を同じ列に入れると、カレンダー・週報・工程テンプレートの逆算が
  **工事の日付を本番日として拾います**（`flow-template` の逆算は `event_start` を見ます）
- **`project_type` に `self_build` を足さない。** `project_type` は
  `PROJECT_CATEGORY_B = ['gmo_project', 'consulting', 'other']` という**売り方**の軸で、
  `kind` は**発注元が自社かグループか**という別の軸です。同じ列にすると
  「グループ受託のコンサル」が表せなくなります

---

## 決め③ `status` は `stage` に写さず、**両方持つ**

`projects.stage` は 7 段（`neta` → `d_hold` → `c_proposal` → `b_verbal` → `a_won` →
`s_completed` / `e_lost`）で、**売れるかどうかの段**です。
`gpm_projects.status` は 4 段（`planning` / `active` / `done` / `onhold`）で、
**工事が動いているかの段**です。**同じものではありません。**

| GPM の `status` | 素直に写すなら | 写すと壊れるもの |
| --- | --- | --- |
| `planning` 準備中 | `c_proposal`? | 提案中でもないのに営業ファネルに乗る |
| `active` 進行中 | `a_won` 受注済 | 受注前の自社構築が「受注」に数えられる |
| `done` 完了 | `s_completed` | — |
| `onhold` 保留 | `d_hold` 仮押さえ | 仮押さえはスタジオの枠の話 |

### 決めたこと

- **`stage` は案件としての段**（発注が決まったか）として**そのまま使う**
- **工程が動いているかは `gpm_phases` の状態から導く**（決め④で親を付け替えるので引ける）。
  `status` の列は**移さない**
- 取り込み時の初期値は **`a_won`（受注済）**。**理由**: `gpm_projects` にある行は
  「やると決まって工程を切ったもの」で、ヨミではありません。
  `status='done'` の行だけ `s_completed` にします

> **数えられないものをそれらしく出さない**ため、`planning` / `onhold` の行があった場合は
> 移行時に一覧で出して**人に決めてもらいます**（黙って `a_won` に倒さない）。

---

## 決め④ 子テーブル 3 本は親の列を差し替える。`estimates` は CHECK を外す

```
gpm_phases.gpm_project_id      → project_id  (projects を参照)
gpm_open_items.gpm_project_id  → project_id
gpm_members.gpm_project_id     → project_id
estimates.gpm_project_id       → 値を project_id へ寄せ、列を落とす
```

- **`estimates` の `chk_estimates_owner`**（`(project_id IS NOT NULL) <> (gpm_project_id IS NOT NULL)`）
  は**外します**。行き先が1つになるので排他する相手がいません。
  `estimates.project_id` は migration 173 で NULL 可になっているので、
  **寄せ終わったら NOT NULL に戻します**（戻さないと「どこにも属さない見積」が作れる）
- **`estimates.submit_to`（自社／依頼元／PM会社）は残します。** 案件の見積には無い概念ですが、
  GLS-B では実際に社内見積と PM 会社への見積が別物になります。既存の GLS-A の見積は
  `NULL` のままで構いません（CHECK が `NULL` を許しています）
- **`gpm_members` と `project_members` は統合しません**（決め⑦）

### `customer_id` が NOT NULL であること

`projects.customer_id` は **NOT NULL**、`gpm_projects.customer_id` は**任意**です。
自社構築（`client_name` に「自社（GMOグローバルスタジオ）」と入るもの）には顧客がいません。

**決めたこと**: `customers` に**自社の行を 1 つ作り**、そこに寄せます。
NOT NULL を外すほうは採りません — `customer_id` は
**`projects` を読む 102 か所のほとんどが JOIN していて**、NULL を許すと
内部結合しているところから **GLS-B が黙って消えます**（エラーが出ないので気づけない）。

> **要確認**: 自社構築は**売上を生まない社内の設備投資**です。
> これを GLS-B として番号を採るのか（＝案件として数えるのか）、
> 番号を採らない種類として持つのかは、業務側で決めていただく必要があります。
> 採る場合、財務の集計に**売上 0・仕入あり**の案件が並びます（粗利がマイナスに見える）。

---

## 決め⑤ タスクは二重に出さない。出すのは**プロジェクト管理側だけ**

いま `project_tasks` は `gpm_phase_id`（161 で追加）を持ち、GPM のタスクは
**`project_id` が NULL** のまま `gpm_phase_id` だけで紐づいています。
決め①で親が `projects` になると、**`project_id` が埋まります**。

すると、案件管理のタスク一覧・かんばん・ガント・MCP `list_tasks`・依頼フロー・週報
（migration 137 が数えた **6 つの書き手**）が、**工程のタスクを拾うようになります**。

### 決めたこと

- **拾わせます。** GLS-B 案件のタスクなので、「自分のタスク」「期限超過」に出るのが正しい
- **ただし案件管理の画面には出しません** — 案件管理は GLS-A だけを扱う画面になるので、
  一覧の絞り込みに `gls_category='A'` が入ることで自然に落ちます（決め⑦）
- **`gpm_phase_id` は残します。** どの工程のタスクかは工程表を描くのに要ります

---

## 決め⑥ 標準工程テンプレートは **2 系統のまま**

`v4-plan.md` の決定に「**スタジオ案件（案件管理）とプロジェクト（プロジェクト管理）で
工程がまったく別**になるので、テンプレートは 2 系統必要」とあり、
実装もそうなっています（`flow_templates` 178 / `gpm_templates` 161）。

**テーブルが 1 本になっても、テンプレートは統合しません。**
放送案件の工程（受付 → 提案 → 見積 → 本番 → 請求）と工事の工程
（発注確定 → 設計 → 調達 → 施工 → 検収）は 1 つも重なりません。

- `projects.flow_template_id`（GLS-A 用）と **`projects.gpm_template_id`（GLS-B 用）を並べて持つ**
- どちらか一方しか入らないことは **CHECK で固定**します
  （両方入ると、同じ案件に 2 系統の工程が入って**タスクが 2 組**になります。
  `flow_applied_at` が二度入れを止めているのと同じ理由）

---

## 決め⑦ 権限は `gpm` と `sales` の**両方を見る**

いま `/gpm/*` は `requirePermission('gpm', …)`、`/projects/*` は `sales` です。
テーブルが 1 本になると、**同じ行に 2 つの入口から届く**ことになります。

### 決めたこと

- **サーバーは行の `gls_category` で要求する権限を変える。**
  `A` は `sales`、`B` は `gpm`。**URL ではなく行で決める**
  — URL で決めると `/projects/:id` に GLS-B の id を入れれば `sales` だけで読めてしまう
- **`gpm` だけの人に `sales` の画面を開けさせない。** 逆も同じ
- **集計（財務・決算取込・週報・MCP の金額系）は権限を分けない。**
  いまも `budget` で通っており、GLS-A と GLS-B を区別していません。**ここは変えません**
  — 変えると「決算の売上合計が人によって違う」ことになります
- **`gpm_members`（社外を含む体制）は `project_members` と統合しない。**
  `project_members` は社内の担当者で、`gpm_members` は発注者・PM 会社・業者を含みます。
  同じ表にすると、**取引先の名前が「自分のタスク」の担当候補に出ます**

---

## 決め⑧ 案件管理から GLS-B を外す範囲

**外すもの**（画面から GLS-B が消える）:

| 場所 | いま | どうするか |
| --- | --- | --- |
| 左メニュー「確定案件（ビジネス）」 | `/sales/projects/confirmed/business` | **プロジェクト管理へ移す**（旧 URL は転送） |
| `ConfirmedProjectsPage` の `GLS-B：コンサルティング・その他売上案件` | 案件管理の中 | 同上 |
| 案件フォームの A/B トグル（`BasicSection` / `CategorySwitchDialog`） | 分類を切り替えられる | **A のみに固定**。B へ移すのは「プロジェクト管理へ移す」操作にする |
| 案件一覧・受付・タスク一覧・案件ダッシュボード | A も B も出る | **`gls_category='A'` で絞る** |
| `BusinessProjectView` の月次請求（月締め） | 案件詳細のタブ | **プロジェクト管理の詳細へ移す** |

**外さないもの**（GLS-B を今までどおり拾う）:

```
財務管理の売上・仕入・販管費・損益      決算取込 (kessan)      二重計上の突合
月次サマリ / 請求・入金 (月次の締め)     週報の集計             MCP の金額系ツール
検索 (GET /search)                     BOX のフォルダ構成      GLS 発番 (sequences.gls_b)
```

**理由**: これらは「GLS-B は財務に出る案件である」ことに依存しています
（**売上が 0 でも仕入は出ます**。決め⑩ の自社構築がそれ）。
外すと**決算の数字が変わります**。決め①の根拠がひっくり返ったのは、まさにここです。

**ただし営業の数字（案件管理ダッシュボードの「今月の売上」「見積の返事待ち」）は
GLS-A だけを数えます** — 決め⑩ のとおり、売上 0 の構築案件が混ざると
受注率と平均単価が意味を持たなくなるためです。**財務と営業で数え方が違うこと自体は
既にそうなっています**（財務は確定売上、営業はステージ）。

---

## 決め⑨ GLS 発番はそのまま使う

`sequence.service.ts` は `seq_name = 'gls_b'` / `prefix = 'GLS-B'` を既に持っており、
`GLS-B003` の形で採れます。**プロジェクト管理から発番できるようにするだけ**で、
採番の実装は 1 行も変えません（写すと A と B で採り方がずれます）。

---

## 決め⑩ 自社構築も GLS-B の番号を採る（ご判断）

売上が立たない社内の設備投資でも **GLS-B を採ります**。

- 財務の一覧・決算に**売上 0・仕入あり**の案件が並びます。**粗利がマイナスに見えます**が、
  実際にお金は出ているので**それが正しい姿**です。**隠しません**
- ただし **営業の数字には混ぜません** — 案件管理ダッシュボードの「今月の売上」
  「見積の返事待ち」は GLS-A だけを数えます（決め⑧の「外すもの」に含める）。
  ここに売上 0 の構築案件が混ざると、**受注率と平均単価が意味を持たなくなります**

## 決め⑪ 画面の呼び名は「プロジェクト」。内部の記号（A / B）は変えない（ご判断）

`gls_category` の値は `'A'` / `'B'` のままにします。**画面に出ない記号**なので、
変えても利用者には何も起きず、触る箇所（サーバー 102 か所・画面・MCP・移行）が増えるだけです。

**画面の言葉だけ揃えます**:

| いまの言葉 | これから |
| --- | --- |
| ビジネス案件（GLS-B） | **プロジェクト** |
| 確定案件（ビジネス） | **プロジェクト一覧** |
| スタジオ案件（GLS-A） | **案件**（案件管理の中では言い分ける必要がなくなる） |

`docs/wording.md` に追記し、`check-ui-tokens` の `forbidden-wording` に
「ビジネス案件」を入れて**書き戻りを機械で止めます**。

---

## 決め⑫ `gpm_projects` は空なので、運ばずに畳む（ご確認済み）

**プロジェクト管理でプロジェクトはまだ 1 件も作られていません**（検証環境のみのため）。
手元の実測とも一致します — 検証用 DB は `gpm_projects` **0 行**、
`seed.ts` / `seed-tasks.ts` も GPM の行を 1 つも作りません
（`gpm_templates` の 2 行だけは migration が入れる既定の雛形）。

したがって:

- **`gpm_projects` → `projects` のデータ移行は書きません。** 運ぶ行がありません
- 子テーブル 3 本（`gpm_phases` / `gpm_open_items` / `gpm_members`）も、
  親が 0 行なので**中身も 0 行**です。**列を差し替えるだけ**で済みます
- **`gpm_templates` の 2 行は残します。** 工程の雛形はプロジェクトと無関係に使えます（決め⑥）
- **動くのは「ビジネス案件（GLS-B）」の側**です。すでに `projects` にあるので
  **行は 1 つも動きません**。動くのは**どの画面から見えるか**だけです

> **取り込みの migration が要らなくなったので、`INSERT … SELECT` は書きません。**
> ただし `gpm_projects` を落とすのは**最後の migration に分けます** — 落としてから
> 「やはり残っていた」となったときに戻せるようにするためです。

---

## 進め方（この順でないと途中で壊れる）

1. **migration A**: `projects` に 5 列追加（`gpm_kind` / `pm_company` / `started_on` /
   `ends_on` / `gpm_template_id`）／ 子テーブル 3 本の親を `project_id` に差し替え ／
   `estimates` の排他 CHECK を外して `gpm_project_id` を落とし、`project_id` を NOT NULL に戻す
2. **サーバー**: `contexts/gpm` のサービス 14 か所を `projects`（`gls_category='B'`）へ向ける。
   権限は**行の `gls_category`** で判定する（決め⑦）
3. **案件管理側**: 一覧・受付・タスク・ダッシュボード・営業 KPI に `gls_category='A'` を入れる。
   **1 か所ずつ、入れるたびに件数が変わることを確かめる**（忘れると GLS-B が混ざったまま）
4. **画面の移動**: 確定案件（ビジネス）と月次請求をプロジェクト管理へ。旧 URL は転送
5. **言葉の統一**: 「ビジネス案件」→「プロジェクト」（決め⑪）。
   `docs/wording.md` と `check-ui-tokens` の `forbidden-wording` に入れる
6. **集計は触らない**ことを確かめる（決算・週報・MCP の金額が移行前後で 1 円も動かないこと）
7. **migration B（最後・別 PR でよい）**: `gpm_projects` を落とす。
   **分けるのは、落としてから「やはり要る」となったときに戻せるようにするため**

---

## やらないと決めたこと

| | なぜ |
| --- | --- |
| `gpm_templates` と `flow_templates` の統合 | 工程が 1 つも重ならない（決め⑥）。`v4-plan.md` の決定でもある |
| `gpm_members` と `project_members` の統合 | 社外を含むかどうかが違う（決め⑦） |
| `gpm_open_items` を `project_minutes.open_items` に畳む | `gpm-model.md` 決め④ のまま。議事録の中の持ち帰りと、案件をまたいで数える未確認事項は別物 |
| 財務・決算・週報・MCP の集計に手を入れる | GLS-B は今までどおり売上を持つ。触ると決算の数字が動く |
| `gls_category` を 3 値以上にする | 「案件は A か B」という業務の定義そのもの。増やすと決め⑧ の絞り込みが全部やり直しになる |
