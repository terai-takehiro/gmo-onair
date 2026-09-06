# 2026年10月 事業再編のシステム移行設計 — 社名変更・計上会社の2社化・案件番号の改番（2026-09-06 設計下書き）

> ユーザーのご指示（2026-09-06・原文の要旨）:
> - 2026年10月、GMOグローバルスタジオ株式会社は **GMOサムライスタジオ株式会社** に社名変更する
> - 同時に売上を計上する会社が **2社** になる。**GMOサムライコンテンツスタジオ**＝グループ外の案件の売上、
>   **GMOサムライスタジオ**＝グループ内の案件の売上。サムライスタジオはコンテンツスタジオの 100% 子会社
> - 案件IDは GLS-A / GLS-B をやめ、**2026-10-01 以降に実施されるイベント**（既存案件を含む）は
>   **GJV**（コンテンツスタジオ）／ **GSS**（サムライスタジオ）に変える。すでに GLS が付いているものは
>   安全のため**通知して手動で変更**する
> - GLS-B のプロジェクト案件は **GMOインターネットグループ本体の事業担当へ移管**し **GMO-** で管理する。
>   売上の概念が無い（コストセンター）ので売上管理は廃止し、**コスト管理**の機能が要る
> - 財務管理は1社から2社の管理になる。いまの財務管理は**サムライスタジオが引き継ぐ**。
>   コンテンツスタジオの財務管理を新しく立ち上げ、**2社をタブで切り替える**
> - 10月以降に切り替えるため、**いまのものを生かしつつ新バージョンに切り替えられる設計**にする

この文書は (1) 現状の実測 (2) 設計の骨格と決めごと候補 (3) 旧→新の共存と切替の段取り
(4) ユーザー判断が要る分岐点 をまとめた**設計の正（下書き）**。
各節の「決めごと候補」は §9 の分岐点が決まるまで**候補**であり、**判断待ちのまま実装しない**
（[project-ledger-phase-c-design.md](project-ledger-phase-c-design.md) と同じ運用）。

---

## 0. 結論（先に4行）

1. **コードもデプロイも分けない。「計上会社」という次元をデータに足し、切替は設定（状態＋切替日）で行う。**
   「新システム」は別のアプリではなく、同じアプリの新しい状態
2. **案件番号は `GLS-A001` 形式をやめ、会社ごとの prefix を持つ通し番号 `GJV-0001` / `GSS-0001` / `GMO-0001` にする**（形式は §9-A で確定）。
   **旧番号は消さない**。改番しても履歴に残り、検索・URL・MCP のどれからも旧番号で引ける
3. **帳簿の行（売上・仕入・販管費・見積）は「書いた時の計上会社」を自分で持つ。** 既存の行は全部
   GSS（＝社名変更した同じ法人）に帰属させる。案件を改番・移管しても過去の行は動かない
4. **10/1 に最低限要るのは P0＋P1**（会社マスター・発行者情報・新採番・改番ツール・通知）。
   財務の2社タブ（P2）と GMO のコスト画面（P3）は行ごとに会社を持つ設計のおかげで**10月中の後追い投入が安全**

---

## 1. 業務上の変更（事実の整理）

| 観点 | 〜2026-09-30 | 2026-10-01〜 |
|---|---|---|
| 運営会社 | GMOグローバルスタジオ株式会社（1社） | **GMOサムライスタジオ株式会社**（社名変更・同じ法人）＋ 親会社 **GMOサムライコンテンツスタジオ株式会社** |
| 売上を立てる会社 | グローバルスタジオ | グループ外の案件 → **コンテンツスタジオ（GJV）**／ グループ内の案件 → **サムライスタジオ（GSS）** |
| 案件番号 | `GLS-A###`（スタジオ案件）／ `GLS-B###`（プロジェクト） | `GJV-…`／`GSS-…`（旧A）／ `GMO-…`（旧B） |
| GLS-B（プロジェクト管理） | 自社の事業。売上・仕入・見積・請求あり | **グループ本体の事業担当へ移管。コストセンター**（売上なし・コスト管理のみ） |
| 財務管理 | 1社ぶん | **2社ぶんをタブで切替**。既存データは GSS が引き継ぐ。GJV は新規に立ち上げ |
| 資本関係 | — | コンテンツスタジオ 100% → サムライスタジオ |

⚠️ この表で**まだ書かれていないこと**（§9 で確認）: 番号の桁・年の有無、「実施日」の定義、
2社間の社内取引（GJV が受けた案件を GSS のスタジオ・人員で作る場合の付け替え）、
グループ本体の事業担当が ONAiR を使うのか、連結（2社合算）の見方が要るか。

---

## 2. 診断 — いまのシステムはどうなっているか（実測 2026-09-06）

### 2.1 「自社（法人）」という概念が無い

| 何が | どこに | 状態 |
|---|---|---|
| 見積書・請求書・検収書の発行者 | `server/src/shared/services/pdf.service.ts:5-10` の定数 `COMPANY`（社名・住所・登録番号 T9011001154049） | **1か所にハードコード**。振込先・印影・ロゴは未実装 |
| メール件名 `【GMOグローバルスタジオ】…` | `notification_templates`（migration 177 の初期行 4件）・機材レンタル見積依頼メール `qsheet/services/rental.service.ts:646-673` | 文字列に社名が焼き込み |
| 「自社」の取引先行 | `companies` の `comp-self-gms`「自社（GMOグローバルスタジオ）」（migration 179/200） | GPM の依頼元「自社」に使う |
| 画面ラベル | `client/src/contexts/gpm/pages/projectForm/BasicStep.tsx:12,111`・`client/src/manual/content.tsx:66`・案件作成のメール下書き `projectNew/ask.ts:139` | 文字列 |
| 設定の器 | `money_rules` は `CHECK (id='default')` で**1行に固定**（migration 175）。`system_settings` は存在しない | 会社ごとに持てない |
| スタジオ名 | `studio_locations` は既に「GMOサムライスタジオ用賀／渋谷／青山」（migration 116） | 法人名と独立。触らなくてよい |

**グループ内／外の判定**は取引先マスター `companies.is_gmo_group`（名前に GMO を含むかで自動付与・
`shared/src/utils/gmoGroup.ts`）が正で、案件は保存時に `customer_type = internal | external` を
写し取る（`project.service.ts:200-211`。「当時の姿で数える」ためのスナップショット）。
用途は**料金表の定価／グループ内価格の選択だけ**で、集計・絞り込みの軸にはなっていない。

### 2.2 GLS 番号の実体

- 形式は **`GLS-` + 分類1字（A/B） + 3桁通し**（`GLS-A024`）。年は無い。`sequences` 表の `gls_a` / `gls_b` を
  `ON CONFLICT … RETURNING` で原子的に進める（`shared/services/sequence.service.ts:28-46`）。
  旧データには `GLS001`（ハイフン無し・決算取込）と `GLS149,150,151` のような列挙も残る
- **prefix の抽象化は無い**（`sequences.prefix` 列は書くだけで読まれない）。設定表も無い
- 発番の入口は `issueGls`（`project.service.ts:2005-2108`）。受注（`a_won`）で自動、`b_verbal` から手動可、
  それより前は 400
- **番号を埋め込んだ派生識別子**（改番時にどこまで追随させるかの対象）:

| 派生識別子 | 形 | 作る場所 |
|---|---|---|
| 回コード `episodes.episode_code` | `{番号}-001`（GLS-B の月次ユニットは `{番号}-2607`） | `sequence.service.ts:66-68`・`episodes.routes.ts:232-264` |
| Qシートの `qsheet_documents.episode_code` | 回コードの写し（**制作技術支援との連携キー**） | migration 012 |
| 請求キー `revenues/purchases.billing_key` | `{回コード}-{税枝番}` | `billing-key.service.ts:6-11`・`project.service.ts:2637-2653` |
| 見積 PDF の見積コード／ファイル名 | `{番号}-v2`／`{番号}_{回}_v2_{名前}.pdf` | `estimate-pdf.service.ts:235,259` |
| 請求書・検収書 PDF のファイル名 | `請求書_{請求キー}.pdf` | `revenues.routes.ts:103-116` |
| BOX フォルダ名 | `{番号}_{案件名}`（社内側は `【社内】` 前置） | `box-folder.service.ts:129,174` |
| カレンダー／ICS の題名 | `[{番号}] {案件名}` | `studio.routes.ts:171`・`calendar.routes.ts:21` |
| 機材設定・CG の `:ownerKey` | `projects.id` **または** `gls_number` の両方を受ける | `qsheet/device-settings-owner.ts:53-60` |
| 受け取った書類 `finance_docs.gls_number` | **自由記述**（FK なし。AI が読み取る） | migration 120 |
| 請求書番号 `INV-2026-0001`・Qシート `SB-202608-0001` | **番号を含まない**（暦年の1系列） | migration 163・214 |

- **前例 `PATCH /projects/:id/gls-category`（A↔B の付け替え）**は新番号を採り直し、回コード・Qシートの
  写し・BOX フォルダ名を追随させる（`project.service.ts:2165-2237`）。**請求キー・受領書類・発行済 PDF は
  追随しない**。旧番号の控え `previous_gls_numbers` は migration 242 で**落とされて今は無い**
- 番号を読む正規表現はサーバー側に集中: 決算取込 `kessan-import.service.ts:105`
  `GLS-[A-Z]\d+|GLS\d+(?:,\d+)*`、X-point 取込 `xpoint-parse.service.ts:213`、
  PDF 名の修復 `revenues.routes.ts:112,444` `^GLS\d+$`。画面側に検証用の正規表現は無い
  （表示は `gls_number || code` のフォールバックだけ）
- **採番・改番を直接覆う自動テストは無い**（周辺: `boxLostCleanup` / `bookingDuplicate` / `gpmIntegrity`）

### 2.3 GLS-B ＝ プロジェクト管理（GPM）

- migration 179 で `gpm_projects` は `projects` に畳まれ、**B は `projects.gls_category='B'` の行そのもの**
  （`gpm.service.ts:138` `IS_PROJECT`）。B は2段分類が NULL、`project_type` は `gmo_project|consulting|other`、
  `gpm_kind`（自社構築／グループ受託）・`pm_company`・`started_on/ends_on` を持つ
- **お金の仕組みは A とまったく同じ**（売上・仕入・見積 `submit_to = self|client|pm`・請求・検収・入金）。
  [design/gpm-merge.md](design/gpm-merge.md) 決め⑧「財務・決算・週報・MCP の集計は B を数え続ける」
  決め⑩「自社構築は売上0・仕入ありで粗利がマイナスになるのが正しい」
- **コストセンター（売上の無い案件）という概念は無い。** `customer_type='internal'` は「グループ内」であって
  「売上なし」ではない
- GLS-B 専用の**月次ユニット** `/episodes/month`（回コード `{番号}-YYMM`）がある。移管後も使うかは §9-G

### 2.4 財務は「1社・全体」前提

`company_id` に相当する列はどの表にも無い。行の所属を案件から辿れるものと辿れないものに分かれる:

| 案件から会社を導ける（`project_id` NOT NULL） | 導けない＝会社の列が要る |
|---|---|
| `revenues` `revenue_items` `revenue_allocations` `purchases` `purchase_allocations` `estimates` `estimate_items` `estimate_episodes` `invoice_groups` `project_groups`（按分） | `sga_expenses`（販管費）・`monthly_budgets`（PK が `year_month` だけ）・`monthly_actual_overrides`・`money_rules`（1行固定）・`role_discount_limits`・`project_stage_probabilities`・`finance_docs`・`xpoint_import_files`＋決算取込の設定（環境変数）・`sequences`（GLS と請求書番号の両方）・料金表（拠点別）・`companies`／`partners`・締め（表が無く毎回導出）・固定原価の疑似案件 `FIXED-COGS`（コード定数が4か所） |

- 財務ダッシュボード（`useDashboardData.ts` の6本）・締め（`GET /billing/closing`）・Excel 出入力・
  MCP の `get_monthly_pl` ほかは**すべて全社1本**。`gls_category` や `customer_type` で切る箇所は
  見積一覧（A のみ）と GPM（B のみ）だけで、**損益系の口は今日 B も混ぜて数えている**
- 年度は**暦年**（`invoice-number.service.ts:34` `FISCAL_START_MONTH = 1`。ダッシュボードの期間も暦年直書き）
- 請求書番号は `INV-<暦年>-NNNN` の**1系列**。会社が2つになると発行者ごとに分ける必要がある（§9-B）

### 2.5 「2026-10-01 以降に実施」の判定に使える列

| 列 | 型 | 補足 |
|---|---|---|
| `projects.event_start` / `event_end` | TEXT `YYYY-MM-DD` | 複数日は `project_dates.date` が正で、MIN/MAX を同期 |
| `episodes.recording_date` / `broadcast_date` / `delivery_date` | TEXT | レギュラーの回 |
| `studio_bookings.start_time` | TEXT（ISO） | 先頭10文字が日付 |
| `projects.started_on` / `ends_on` | DATE | **B の工期**。実施日ではない（本番7件とも `event_start` は NULL） |

### 2.6 本番データの規模（MCP `list_projects` / `list_gpm_projects` を読み取り・2026-09-06）

| 対象 | 件数 | 内訳 |
|---|---|---|
| 実施期間が 2026-10-01 以降にかかる案件（失注含む） | **25** | うち GLS 発番済み **9**: `GLS-A008`（COMPASS 10/8・社外）`GLS-A021`（27時間生放送 10/22-24）`GLS-A024`（BLVCKOUT 11/20-23・社外）`GLS-A019`（V face Lab. GALA 11/28・社外）`GLS-A011` `GLS-A012`（定時株主総会 12月・**グループ**）＋ B の `GLS-B005` `B007` `B008`（実施日なし） |
| 上のうち受注済みで**番号が無い** | 1 | 「GMOパートナーズ・カンファレンス 2026_4Q」（10/6・`gls_category` が NULL） |
| 進行中（active タブ） | 12 | A 9件・B 3件 |
| プロジェクト管理（B）全体 | 7 | 依頼元は全部グループ会社。進行中 3（第3本社・渋谷スタジオ・セルリアン）・完了 4 |
| 取引先「GMOサムライコンテンツスタジオ」 | **2行**（名寄せ前） | 「インテリジェンス」`GLS-A023`（レギュラー）と「紹介動画撮影」`GLS-B006` の顧客。**新しい親会社が今は「お客様」として登録されている** |

つまり**手で改番する対象は 10件前後**で、通知→手動の運用は現実的。
一方で「切替日をまたぐ社外案件」（分割が要る唯一のパターン・§4.4）は**今日時点で 0 件**。

### 2.7 前例（構造をそのまま借りる）

- **qsheet → techops 改名**（[reviews/qsheet-techops-migration-plan.md](reviews/qsheet-techops-migration-plan.md)）:
  Phase 分割・旧 URL は**無期限ブリッジ**・**DB オブジェクト名は改名しない**（`permissionModule` も `qsheet` のまま）
- **A↔B 付け替え**（§2.2）: 改番と追随の実装がすでにある。範囲を広げて再利用する
- **`customer_type` のスナップショット**（migration 192 のコメント）: 「マスターを直しても過去の集計が動かない」。
  帳簿の行に計上会社を持たせる根拠と同じ
- **ルート `CLAUDE.md` の公理「GLS番号を中核として全アプリのデータが紐づく」**は、実装上は
  **`projects.id`（UUID）で紐づき、GLS は表示と連携キー（回コード）**。改番しても壊れない土台がある

---

## 3. 設計原則

1. **コードを分岐させない。データに次元を足す。** 別デプロイ・別 DB の「新システム」は作らない。
   利用者・取引先・機材・Qシート・BOX は継続するものであり、切替は**状態**（設定）で表す
2. **番号は識別子ではなく属性。** 主キーは今までどおり `projects.id`。番号は付け替え可能で、
   **付け替えた番号は消さず全部残す**（履歴表）。旧番号での検索・URL・MCP は永久に通す
3. **計上会社は導出できるが、上書きでき、後から黙って導き直さない。** 規則で初期値を出し、人が理由付きで
   変えられ、確定後はマスターが変わっても動かない（`customer_type` と同じ考え方）
4. **切替日はコードに書かない。** `2026-10-01` は設定値。検証環境で先に切り替えて試せる
5. **過去は書き換えない。** 既存の帳簿・発行済 PDF・請求キー・請求書番号はそのまま。新しい発行物だけが
   新しい会社名と番号を使う
6. **売上の無い会社に売上の画面を出さない。** GMO（コストセンター）では売上・請求・入金の UI と登録口を
   閉じる。ただし**表や列は消さない**（過去の B には売上がある）
7. **壊してはいけない契約を守る**（[ia.md](ia.md) の一覧＋§10 の追加）。特に回コードは制作技術支援の連携キー

---

## 4. あるべき姿

### 4.1 用語（候補・[wording.md](wording.md) ルール6「画面の外で通用するか」で判定）

| 概念 | 画面に出す語（候補） | 理由 |
|---|---|---|
| GJV／GSS／GMO の区分 | **計上会社**（副題「売上・費用をどの会社の帳簿に載せるか」） | 会計の標準語・4文字。「会社」だけだと取引先（`companies`）と衝突する |
| 各社の呼び名 | コンテンツスタジオ／サムライスタジオ／**グループ本体（コスト）** | 12文字以内。正式名は初出で1度だけ |
| 案件の番号 | **案件番号**（旧「GLS番号」。説明文「10月から GJV／GSS／GMO で始まる番号。それより前の案件は GLS のまま」） | GLS は特定の社名の略。帳簿・請求に出る語なので**旧番号の表示では GLS を消さない** |
| 旧番号 | **旧番号**（`GLS-A008` のように併記） | 改番後も経理・取引先とのやり取りに残る |

⚠️ 「グループ」は「按分グループ」と「GMOグループ」で既に衝突している
（[reviews/2026-09-05-terminology-review.md](reviews/2026-09-05-terminology-review.md)）。
計上会社の説明では「**グループ内／グループ外のお客様**」と必ず「お客様」を付けて書く。

### 4.2 計上会社マスター `legal_entities`（新設）

| 列 | 例 | 用途 |
|---|---|---|
| `code` PK | `GJV` / `GSS` / `GMO` | 案件番号の prefix と同じ文字列 |
| `name` / `short_name` | GMOサムライコンテンツスタジオ株式会社 ／ コンテンツスタジオ | 帳票・画面 |
| `former_name` / `renamed_on` | GMOグローバルスタジオ株式会社 ／ 2026-10-01（GSS だけ） | 社名変更前の日付の帳票を再発行するときの表記（§9-E） |
| `kind` | `revenue` / `cost_center` | GMO は `cost_center`。売上系の UI・登録口を閉じる判定 |
| `parent_code` | GSS → GJV | 連結の見方を将来足すときの親子（§9-F） |
| `number_prefix` UNIQUE | `GJV-` | 採番。`sequences.seq_name = project_{code}` |
| 発行者情報 | 住所1/2・適格請求書発行事業者登録番号・振込先（JSONB）・ロゴ（BOX/静的ファイルの参照） | `pdf.service.ts` の `COMPANY` 定数を置き換える |
| `active_from` / `sort_order` | 2026-10-01 | 切替前に画面へ出さない |

`companies`（取引先）には `legal_entity_code`（NULL 可）を足し、「自社」の行を各社1つずつ持つ
（GPM の依頼元「自社」・2社間の取引の相手先として使う。既存の `comp-self-gms` は GSS に紐づけ直す）。

### 4.3 案件番号 — 形式・採番・履歴

**形式（候補 a・§9-A で確定）**: `{prefix}{4桁通し}` ＝ `GJV-0001` / `GSS-0001` / `GMO-0001`

- **A/B の1字は無くす**（会社の prefix が意味を持つ。旧 A は GJV か GSS、旧 B は GMO）
- **年は入れない・リセットしない**（いまの GLS と同じ運用。回コード `GJV-0001-001` の区切りがぶれない）
- 4桁: 旧番号は5か月で A が 024 まで進み、旧形式の通し（GLS161）を合わせると3桁は10年持たない
- 採番は既存の `generateSequenceNumber` の `ON CONFLICT` 経路をそのまま使う。`seq_name` を会社ごとに分ける
- 回コード `{番号}-NNN`・請求キー `{回コード}-{税枝番}` の**規則は変えない**（[design/v4/regular-series.md](design/v4/regular-series.md) §8）

**列の扱い（DB の改名はしない・前例どおり）**:

- `projects.gls_number` は**列名を変えずに「現在の案件番号」を持ち続ける**（`GJV-0001` も入る）。
  列名は `qsheet` の `permissionModule` と同じ「内部の名残」として文書に明記する。SQL 文字列 100か所超・
  MCP の出力フィールド名（外部契約）・`droppedColumns.test.ts` を考えると改名の益が無い
- **`project_numbers`（履歴・新設）**: `project_id, number UNIQUE, entity_code, scheme('gls'|'entity'),
  assigned_at, assigned_by, retired_at, reason`。**発番・改番のたびに追記**。旧番号は `retired_at` が入るだけで
  消えない。検索・`:ownerKey`・MCP の番号指定・取込の照合は**この表を通して旧番号でも当たる**
- `projects.legacy_number`（直前の旧番号・表示用の写し）は置かない。**履歴表から導く**（2か所に持たない）

### 4.4 計上会社の導出規則と切替日

```
resolveEntity(project, cutover):
  if 実施日 < cutover（または切替の状態が cutover 前）  → 旧方式のまま（番号 GLS・帳簿は GSS）
  elif gls_category = 'B'                              → GMO
  elif customer.is_gmo_group                           → GSS
  else                                                 → GJV
```

- **実施日** ＝ `event_start`（＝`project_dates` の最小日）。無ければ回の最小 `recording_date`、
  無ければスタジオ予約の最小開始日。**どれも無い案件は「判定できない」として一覧に出し、人が決める**
  （§9-C。B は実施日で切らず、**切替時点で完了・失注でない B はすべて GMO へ**の候補）
- **導出は初期値**。案件作成・受注時に決め、`projects.entity_code`／`entity_source('rule'|'manual')`／
  `entity_note` に保存。**発番後は取引先マスターの `is_gmo_group` が変わっても動かさない**
- **上書きは `sales:manager`**、理由必須、`project_stage_changes` と同じ要領で履歴に残す
- **切替日をまたぐ案件**（例: 9月と11月に回があるレギュラー）:
  - 計上会社が **GSS になるもの（グループ内）は分割不要**。同じ法人なので改番するだけ
  - **GJV になるもの（グループ外）だけ、法人が変わるので 9/30 以前の回と 10/1 以降の回を別案件にする**
    必要がある。今日時点で該当 0 件（§2.6）なので、**専用の分割ツールは作らず**、既存の
    「回を別の案件へ付け替える」（`projectForm/useProjectActions.ts` の relink）で手作業にする（§9-D）

### 4.5 帳簿の行は「書いた時の計上会社」を持つ

`revenues` `purchases` `sga_expenses` `estimates` `finance_docs` に `entity_code`（FK・NOT NULL）を足し、
**書いたときに案件の `entity_code`（販管費・受領書類は画面の会社タブ）を写す**。既存行は全部 `GSS` に埋める。

- 財務の集計・締め・Excel・MCP は**案件ではなく行の `entity_code` で切る**。案件を改番・移管しても
  過去の行は前の会社に残る（原則5）。GLS-B005「GMO渋谷スタジオプロジェクト」の売上 1,222,500 円は
  GMO に移管しても GSS の帳簿に残る
- `monthly_budgets` / `monthly_actual_overrides` の PK を `(entity_code, year_month)` に、
  `money_rules` は `CHECK (id='default')` を外して会社ごとの行に（`default` → GSS、GJV は GSS の写しで初期化）
- 固定原価の疑似案件 `FIXED-COGS` は1つのまま。**行の `entity_code` で会社が決まる**ので案件を増やさない
- 請求書番号は発行者ごとの系列 `INV-{code}-{暦年}-NNNN`（§9-B）。**発行済みの `INV-2026-…` は変えない**
- 按分グループ（`project_groups`）が GJV と GSS の案件をまたぐ場合、按分先の行は各案件の会社で書く
  （行レベルなので自然に分かれる）

### 4.6 財務管理の2社タブ

- **画面全体の切替**として `PeriodBar` の左に置く（`ForecastModeToggle.tsx` の教訓: カードの中に置くと
  カードの設定に見える）。部品は `FilterChips` 系の1本のセグメント（`GJV ／ GSS ／ GMO（コスト）`、
  それぞれ件数付き）。**正は URL の `?entity=`**（`useProjectFilter.ts` と同じ・戻る／共有が効く）。
  既定は GSS（いまの帳簿の引き継ぎ先）
- 8画面すべてが同じ切替に従う（ダッシュボード・請求入金・売上・仕入・販管費・受け取った書類・取り込み・取引先）。
  **取引先マスターは共有**（1つ）で、切替は「その会社との取引額」の集計にだけ効く
- 切替前（状態 `preparing` 以前）は**セグメントを出さない**（1社なので選ぶものが無い）
- **連結（2社合算）**は作らない（§9-F で要否を確認。社内取引の相殺が要るので別の設計）

### 4.7 GMO コストセンター（旧 GLS-B）

`legal_entities.kind = 'cost_center'` の会社では:

| 閉じる | 残す・変える |
|---|---|
| 売上の登録口（`registerable-projects` から除外＋サーバー 409 `NO_REVENUE_ENTITY`）・請求書／検収書の発行・入金・締め・営業見通し（パイプライン） | **仕入（発注・支払）**・**予算と実績**（案件ごとの見積積算＝予算案として `estimates` を流用、`submit_to='self'` 固定）・月次のコスト集計（販管費の器を使うか §9-G）・BOX の「原価・発注」 |
| GPM 詳細の「見積・請求」タブ | 「**予算と実績**」タブに差し替え（同じ部品の売上側を隠す） |
| 財務ダッシュボードの損益フロー | コスト側だけの構成（予算 vs 実績・月次推移・案件別内訳） |

- **過去の B の売上は消さない**（GSS の帳簿に残る）。閉じるのは**新しい登録**だけ
- 月次ユニット `/episodes/month` は GMO でも使える（コストを月で切る単位として自然）
- 「コスト管理」の要件は §9-G で範囲を確定してから画面を切る（最小: 仕入＋予算対実績。拡張: 稟議・固定資産）

### 4.8 改番の手順（通知 → 手動）と移行センター

設定 ＞ **「10月の切替（計上会社と案件番号）」**（`system_admin`・PC 専用）:

1. **会社マスター**の編集（4.2）と**切替日**・**状態**（§5）
2. **改番の対象一覧**: 発番済みで「実施日 ≥ 切替日」または「B で進行中」の案件。列＝現在の番号・実施日・
   お客様・グループ内外・**導出された計上会社**・売上／請求の状態・**止める理由**（発行済み請求書あり など）
3. **通知**: 主担当（`assigned_to`）へ既存の通知基盤（`notifications`＋メール）。「`GLS-A008` は 10/8 実施のため
   コンテンツスタジオ（GJV）の番号へ変更が必要です」＋ボタン。定時実行は **`scheduled_job_runs` ＋
   `notifications` の一意索引の2段**（既存の決めごと）で毎朝、残 0 になるまで
4. **改番（1件ずつ・確認2段階）**: 新番号のプレビュー → 実行。追随するもの＝**回コード・Qシートの写し・
   BOX フォルダ名**（A↔B 付け替えと同じ）＋**未請求の請求キー**（発行済み・入金済みは触らない）。
   `project_numbers` に旧番号を `retired_at` 付きで残す。MCP にも同じ口（`renumber_project`・confirm 2段階）
5. **進捗**: 残件数・完了件数をこの画面とダッシュボードの帯に出す（数字は同じ API を使い回す）

⚠️ **切替日以降は旧方式で新規発番できない**（`issueGls` が状態を見て prefix を選ぶ）。
「GLS を新しく採る」経路は状態 `cutover` で閉じる。

### 4.9 社名・発行者情報の差し替え

| 場所 | 変更 |
|---|---|
| `pdf.service.ts` の `COMPANY` | 行の `entity_code` → `legal_entities` の発行者情報。**行の日付が `renamed_on` より前なら旧社名を併記**（§9-E） |
| `notification_templates` の件名 `【GMOグローバルスタジオ】` | 変数 `{発行会社}` に置き換え（初期行の UPDATE ＋ 変数の追加）。既に手で直した行は触らない |
| 機材レンタル見積依頼メール（`rental.service.ts`） | 差出人の会社＝案件の計上会社（案件が無ければ GSS） |
| GPM の「自社（GMOグローバルスタジオ）」・マニュアル・案件作成のメール下書き | 会社マスターの名前を読む（文字列を消す） |
| `comp-self-gms` | 名前を「自社（GMOサムライスタジオ）」に、`legal_entity_code='GSS'`。GJV の自社行を追加。**取引先「GMOサムライコンテンツスタジオ」2行の名寄せ**が先 |
| 検証環境の種データ（`seed.ts`） | 会社2つ・GMO・切替済みの状態を最初から入れる |
| `looksLikeGmoGroup`（名前に GMO を含む） | 変えない。コンテンツスタジオ・本体・自社はいずれもグループ内で正しい |

プラットフォーム名「GMO ONAiR」とドメイン `gmo-onair.jp` は**変えない前提**（§9-H）。

### 4.10 権限・MCP・検索・BOX

- **権限**: 第1段では会社で見える範囲を分けない（`sales` 区画のまま・切替は絞り込み）。
  グループ本体の事業担当が ONAiR を使うなら `user_permissions` に `entity_scope`（NULL＝全社）を足す第2段（§9-I）
- **MCP**: ツール名は外部契約なので **`issue_gls` の名前は残す**（説明を「案件番号の発番」に）。
  `list_projects` / `list_revenues` / `list_purchases` / `list_sga` / `get_monthly_pl` / `get_monthly_budget` /
  `upsert_monthly_budget` に `entity_code` を足す。出力の `gls_number` フィールド名も残す（値は新番号）。
  `create_project` の `gls_category` は内部の記号として残し、`entity_code` は導出（渡せば上書き・manager）
- **検索**: 案件名／番号の部分一致は `project_numbers` も見る（旧番号で引ける）。`:ownerKey` と
  `create_studio_booking` の番号指定も同じ
- **BOX**: フォルダ名は改番で `{新番号}_{名前}` に付け替え（既存の `renameProjectFolderPair`）。
  失敗しても改番は成立させ、理由を画面に出す（読む口は 200＋`reason` の既存方針）
- **取込の正規表現**: 決算取込・X-point・PDF 名修復の `GLS…` を `GLS…|GJV-…|GSS-…|GMO-…` に広げ、
  照合は `project_numbers` 経由に

### 4.11 データモデル（DDL 案・すべて追加のみ）

```sql
-- 会社
CREATE TABLE legal_entities (
  code TEXT PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),
  name TEXT NOT NULL, short_name TEXT NOT NULL,
  former_name TEXT, renamed_on DATE,
  kind TEXT NOT NULL CHECK (kind IN ('revenue','cost_center')),
  parent_code TEXT REFERENCES legal_entities(code),
  number_prefix TEXT NOT NULL UNIQUE,
  issuer_address1 TEXT, issuer_address2 TEXT, invoice_registration_number TEXT,
  bank_account JSONB, logo_ref TEXT,
  active_from DATE NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0
);
-- 切替の状態（1行）
CREATE TABLE org_transition (
  id TEXT PRIMARY KEY DEFAULT 'default' CHECK (id='default'),
  state TEXT NOT NULL CHECK (state IN ('off','preparing','cutover','done')),
  cutover_date DATE, updated_at TIMESTAMPTZ, updated_by TEXT
);
-- 案件
ALTER TABLE projects ADD COLUMN entity_code TEXT REFERENCES legal_entities(code);   -- 既存行は 'GSS'
ALTER TABLE projects ADD COLUMN entity_source TEXT CHECK (entity_source IN ('rule','manual'));
ALTER TABLE projects ADD COLUMN entity_note TEXT;
CREATE TABLE project_numbers (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
  number TEXT NOT NULL UNIQUE, entity_code TEXT REFERENCES legal_entities(code),
  scheme TEXT NOT NULL CHECK (scheme IN ('gls','entity')),
  assigned_at TIMESTAMPTZ NOT NULL, assigned_by TEXT, retired_at TIMESTAMPTZ, reason TEXT
);   -- 既存の gls_number を全部 scheme='gls' で流し込む
-- 帳簿の行
ALTER TABLE revenues     ADD COLUMN entity_code TEXT NOT NULL DEFAULT 'GSS' REFERENCES legal_entities(code);
ALTER TABLE purchases    ADD COLUMN entity_code TEXT NOT NULL DEFAULT 'GSS' REFERENCES legal_entities(code);
ALTER TABLE sga_expenses ADD COLUMN entity_code TEXT NOT NULL DEFAULT 'GSS' REFERENCES legal_entities(code);
ALTER TABLE estimates    ADD COLUMN entity_code TEXT NOT NULL DEFAULT 'GSS' REFERENCES legal_entities(code);
ALTER TABLE finance_docs ADD COLUMN entity_code TEXT REFERENCES legal_entities(code);
-- 会社ごとの設定（PK の付け替え）
-- monthly_budgets / monthly_actual_overrides: PK (entity_code, year_month)
-- money_rules: CHECK (id='default') を外し id = entity_code
-- companies: legal_entity_code TEXT REFERENCES legal_entities(code)
-- sequences: seq_name 'project_GJV' 'project_GSS' 'project_GMO' / 'invoice_GJV_2026' …
```

DEFAULT 'GSS' は埋め戻しのためだけに置き、**埋め戻し後に DROP DEFAULT**（新しい行で黙って GSS に
落ちないように。書く側が必ず決める）。

---

## 5. 旧⇄新の共存と切替（モード設計）

`org_transition.state` の4状態。**戻せるのは `cutover` → `preparing` まで**（追加のみのマイグレーションなので
データは壊れない。発番済みの新番号はそのまま有効）。

| 状態 | 誰が変える | 画面・振る舞い |
|---|---|---|
| `off`（今日） | — | 何も変わらない。マスター表・列は存在するが使われない |
| `preparing` | `system_admin`（検証環境で先に） | 移行センターが開く。会社マスター・切替日を入れる。案件一覧・詳細に「10月以降: コンテンツスタジオ（GJV）」の**予告バッジ**（導出結果の確認用・帳簿には効かない）。通知はまだ出さない |
| `cutover` | `system_admin`（切替日の朝に手で。日付の前には切り替えられない） | 新規発番は新 prefix。改番の通知と手動改番が動く。財務にセグメント。PDF・メールは新しい発行者。GMO はコストの画面 |
| `done` | 残件 0 で自動提案・人が確定 | 予告バッジ・通知ジョブを止める。旧方式で採る経路のコードを次のリリースで消す |

- **検証環境（dev.gmo-onair.jp）は 9月中に `cutover` で動かす**。本番は `preparing` のまま予告バッジで
  導出結果を目視できる（間違った会社になっている案件を切替前に直せる）
- **切替の日にやること**は移行センターの中に手順として出す（①状態を `cutover` に ②通知を送る
  ③改番 ④請求書番号の系列を確認）。Slack・口頭に頼らない

---

## 6. 段階と PR の並び（10/1 まで 3週間半・現実的な線）

「お金と自動処理に触るものを先に、画面を後に」（regular-series.md §10 と同じ順序の付け方）。

| 段 | 中身 | 10/1 に要るか | 目安 |
|---|---|---|---|
| **P0 土台** | `legal_entities` / `org_transition` / `project_numbers` / 各表の `entity_code`（DEFAULT 'GSS' で埋め戻し）・会社マスター画面・切替状態・PDF とメールの発行者差し替え・取引先の名寄せと自社行 | **要る** | 3〜4 PR |
| **P1 番号** | prefix 採番・`resolveEntity`・案件作成／受注時の保存・改番 API＋MCP・追随（回コード／Qシート／BOX／未請求の請求キー）・旧番号での検索と `:ownerKey`・取込の正規表現・通知ジョブ・移行センターの対象一覧 | **要る** | 4〜5 PR |
| **P2 財務の2社** | 8画面のセグメント（URL）・集計／締め／Excel／MCP の `entity_code`・月次予算と `money_rules` の会社化・請求書番号の系列 | 10月前半でよい（10月分の締めは11月） | 4 PR |
| **P3 GMO コスト** | `kind='cost_center'` の閉じ方・「予算と実績」タブ・コスト側ダッシュボード | 10月中（要件確定 §9-G が先） | 3〜4 PR |
| **P4 仕上げ** | `done` 状態・旧経路の削除・`entity_scope` 権限・連結（要るなら）・文書と用語の更新（`CLAUDE.md` の公理・`wording.md`・`guide/words.md`・`mcp-server.md`） | 後 | 2〜3 PR |

- P0 と P1 は直列（P1 は P0 の表に依存）。P2 と P3 は P1 のあと**並行できる**
- 各 PR は `docs/changelog.d/` に1つ・PR 後は `pr-watch`（既存の決めごと）
- **自動テスト**: 採番・改番・導出を `shared/tests/` に足す（いま採番の直接のテストは 0 本）。
  最低: 導出規則の表・prefix 採番の一意性・改番の追随範囲（請求済みの請求キーが動かない）・旧番号検索

---

## 7. 影響範囲（アプリ × 変更）

| アプリ | 変わるもの | 変わらないもの |
|---|---|---|
| 案件管理 `client/` | 番号の表示・計上会社バッジと絞り込み・案件作成の導出表示と上書き・改番ボタン・見積 PDF の発行者・受注時の採番 | ステージ・タスク・回・按分の仕組み |
| 財務管理 | 8画面のセグメント・集計の軸・請求書番号・Excel・締め | 台帳の列・入力の部品 |
| プロジェクト管理（GPM） | 番号が `GMO-`・「見積・請求」→「予算と実績」・依頼元「自社」の名前・売上系の登録口が閉じる | 工程・未確認事項・議事録・BOX |
| 設定 | 移行センター（新規）・お金のルールが会社ごと・通知の文面の変数 | 拠点・部屋・休日・権限 |
| 制作技術支援 `client-techops/` | 表示の番号が変わる（回コードの追随）・トップの検索が旧番号でも当たる | 連携キー＝回コードの規則・5本の本番 URL・Qシートの中身 |
| 機材管理 / 日常業務 / 計時 | 案件の表示名（JOIN で番号を読むだけ）・週報の集計に会社の内訳（任意） | 貸出・棚卸・セキュリティカード（案件列なし） |
| MCP | パラメータ `entity_code` の追加・`renumber_project` の追加・説明文 | ツール名・出力のフィールド名 |
| 帳票・メール | 発行者ブロック・件名の変数 | 発行済みの PDF・番号 |
| BOX | フォルダ名の付け替え（改番時） | フォルダ構成 |

---

## 8. リスクと軽減策

| リスク | 起きること | 軽減策 |
|---|---|---|
| 会社の導出を間違えたまま発番 | 請求書の発行者が違う（社外に出る） | `preparing` の予告バッジで切替前に目視・上書きは理由必須・発行時に「計上会社」を PDF プレビューに出す |
| 過去の集計が動く | 改番・移管で GSS の実績が減る | 帳簿の行に `entity_code` を持つ（案件から導かない） |
| 旧番号で探せない | 経理・取引先とのやり取り・QR・BOX 名が旧番号 | `project_numbers` 経由で全経路が旧番号を通す・BOX 名は付け替えるが失敗しても改番は成立 |
| 切替日に Claude が自動で切り替える | 想定外の日に発行者が変わる | 状態変更は人の操作だけ。日付ガード。Release と同じ扱いで**Claude は自分の判断で切り替えない** |
| 請求書番号の重複／不連続 | 税務上の説明が要る | 発行者ごとの系列を `sequences` で原子的に・既存系列は凍結して残す |
| 2社間の取引を扱わずに走る | GJV が売上だけ・GSS が費用だけの損益になり、ダッシュボードが嘘になる | §9-J を切替前に決める。扱うなら「自社行への売上／仕入」で既存の仕組みに乗る |
| 期限（10/1）に P2/P3 が間に合わない | 10月の帳簿を2社に分けて入れられない | 行の `entity_code` を P0 で入れておけば、後から画面が来ても**入力時に会社を選ぶ最小 UI**（台帳ダイアログの1欄）で凌げる |
| `DEFAULT 'GSS'` が残る | 新しい行が黙って GSS に落ちる | 埋め戻し直後に DROP DEFAULT・`droppedColumns.test.ts` に相当する検査を足す |

---

## 9. ユーザー判断が要る分岐点（壁打ち）

> 各項目の **[提案]** が私の推し。決まったら本文の「候補」を確定に書き換える。

- **A. 番号の形式**: (a) `GJV-0001`（ハイフン＋4桁通し・年なし）**[提案]** ／ (b) `GJV001`（いまの `GLS-A001` に最も近い3桁）／
  (c) `GJV-2610-001`（年月＋月内通し。v4 モックの `GLS-2607-018` はこの形）。
  回コードは `{番号}-001` のまま。**GMO も `GMO-0001`**（ご指示の「GMO-」に合わせてハイフン付き）で統一してよいか
- **B. 請求書番号**: (a) 発行者ごとに `INV-GJV-2026-0001` / `INV-GSS-2026-0001` **[提案]** ／ (b) 1系列のまま（法人が違う書類に連番が続く）
- **C. 「実施日」の定義**: (a) `event_start`（複数日は初日）→ 回の初回 → 予約の初日 の順に見る **[提案]** ／ (b) 最終日 ／ (c) 売上の計上日。
  **B（プロジェクト）は実施日で切らず、切替時点で進行中のものを全部 GMO へ**でよいか
- **D. 切替日をまたぐグループ外の案件**: 今日 0 件。(a) 既存の「回の付け替え」で手作業・ツールは作らない **[提案]** ／ (b) 分割ツールを作る
- **E. 社名変更前の帳票の再発行**: (a) 新社名＋「（旧 GMOグローバルスタジオ株式会社）」を併記 **[提案]** ／ (b) 発行当時の社名のまま ／ (c) 新社名のみ
- **F. 連結（2社合算）の見方**: (a) 第1段では作らない **[提案]** ／ (b) 4つ目のセグメント「2社合算」（社内取引の相殺なし・注記付き）
- **G. GMO の「コスト管理」の範囲**: (a) 仕入（発注・支払）＋案件ごとの予算対実績＋月次のコスト集計 **[提案・最小]** ／
  (b) (a)＋稟議・承認の流れ ／ (c) (b)＋固定資産（資本的支出）の区分。**月次ユニット（`-YYMM`）は GMO でも使い続けるか**
- **H. 名前とドメイン**: 「GMO ONAiR」と `gmo-onair.jp` は変えない前提でよいか。ログイン画面・マニュアルの社名は「GMOサムライスタジオ」に
- **I. グループ本体の事業担当**: ONAiR のアカウントを持って GMO 案件を見るか。持つなら**会社で見える範囲を分ける権限**（第2段）が要る
- **J. 2社間の社内取引（最重要）**: GJV が受けたグループ外の案件を GSS のスタジオ・人員で作るとき、
  **GSS → GJV の売上（社内）と GJV の仕入**を ONAiR に載せるか。載せないと GJV は売上だけ・GSS は費用だけの損益になる。
  (a) 載せる＝各社の「自社」取引先行への売上／仕入として既存の仕組みで **[提案]** ／ (b) 載せない（会計側で処理・ONAiR は案件の粗利だけ）
- **K. コンテンツスタジオは今すでに存在する法人か**: 取引先に2行ある。**10/1 より前に GJV 名義で見積を出してよいか**
  （出せるなら `cutover` 前でも「10月以降の実施」の見積は GJV の発行者で作る）
- **L. GLS-B の完了済み4件**: 移管しない（GSS の履歴のまま `GLS-B` で残す）でよいか **[提案: 残す]**

---

## 10. 壊してはいけない契約への追加（[ia.md](ia.md) の一覧に足す候補）

- **旧番号は永久に引ける**: `GLS001` / `GLS-A008` / 改番前の番号のどれでも、検索・URL の `:ownerKey`・MCP・取込の照合が通る
- **回コードの規則 `{案件番号}-NNN` と、Qシート側の写し（`qsheet_documents.episode_code`）は改番のたびに同期する**
- **発行済みの PDF・請求書番号・請求キー・帳簿の行の計上会社は改番・移管で動かない**
- **計上会社の切替（`org_transition.state`）は人の操作だけ**。Claude・定時実行・デプロイでは変えない
- MCP: `issue_gls` の名前と `gls_number` フィールド名は残す（値は新番号）

---

## 11. やらないと決めること（候補）

- 別デプロイ・別 DB の「新システム」（§3-1）
- `projects.gls_number` ほか DB オブジェクトの改名（前例どおり・§4.3）
- 発行済み書類・過去の帳簿の書き換え（§3-5）
- 第1段での連結・社内取引の相殺・会社別の権限（§9-F / I / J の結論次第で第2段）
- 完了済み GLS-B の移管（§9-L）

---

## 12. 更新履歴

- 2026-09-06: 初版（設計下書き）。実測は 5 本の並列調査＋本番データの MCP 読み取り（書き込みなし）。
