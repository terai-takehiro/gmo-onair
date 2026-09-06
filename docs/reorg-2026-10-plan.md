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
2. **案件番号は `GJV-0001` / `GSS-0001` / `GMO-0001`（決定）。回コードは末尾に `-001`（`GJV-0001-001`）、請求キーはさらに税枝番（`GJV-0001-001-1`）。**
   売上・仕入は必ず回に紐づけ、番号の形を「案件番号 → 回コード → 請求キー」の1本に統一する（§4.3）。
   **旧番号は消さない**。改番しても履歴に残り、検索・URL・MCP のどれからも旧番号で引ける
3. **帳簿の行（売上・仕入・販管費・見積）は「書いた時の計上会社」を自分で持つ。** 既存の行は全部
   GSS（＝社名変更した同じ法人）に帰属させる。案件を改番・移管しても過去の行は動かない
4. **9月中に P0＋P1**（会社マスター・発行者情報・新採番・改番ツール・通知）を入れて `preparing` にする。
   コンテンツスタジオは既存法人で見積を出してよいので、**10月以降の受注は最初から新番号・GJV 名義で出す**（先取り・§5）。
   財務の2社タブと社内取引（P2）・GMO のコスト画面（P3）は行ごとに会社を持つ設計のおかげで**10月中の後追い投入が安全**

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

2026-09-06 に確認できたこと（§9 の ✅）: 番号は `GJV-0001`・回コードは末尾 `-001`、**2社間の社内取引は発生する**
（GJV が受けた案件を GSS のスタジオ・人員で作る → ONAiR に載せる・§4.12）、GLS-B は**走っているもの全部**を GMO へ、
GMO のコスト管理は最小案（稟議・固定資産は本体の別システム）、**コンテンツスタジオは 2026-01 設立の既存法人で
切替前に GJV 名義の見積を出してよい**、請求書番号は発行者ごとに分ける。

同日の2回目で決まったこと: **社内取引の金額は手入力（見積の原価行の合計を初期値）で、GSS → GJV の請求書 PDF も
ONAiR から発行する**（§9-M）。**売上・仕入は必ず回に紐づける**（§9-N）。

⚠️ まだ決まっていないこと（提案どおりで進める前提）: 旧社名の併記（§9-E）、連結（§9-F）、名前とドメイン（§9-H）、
グループ本体の事業担当のアカウント（§9-I）、完了済み GLS-B（§9-L）。

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
| 取引先「GMOサムライコンテンツスタジオ」 | **2行**（名寄せ先は確定済み） | 「インテリジェンス」`GLS-A023`・「紹介動画撮影」`GLS-B006` とも `customer_id` は `3d099e40…`（「GMOサムライコンテンツスタジオ株式会社」・作成 4/20・案件2件が現に参照）。もう1行 `ff64b0e1…`（「GMOサムライコンテンツスタジオ」・決算取込が 6/15 に自動作成・**参照 0 件**）はこちらへ吸収して削除 |

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
| 各社の呼び名 | コンテンツスタジオ／サムライスタジオ／**グループ本体** | 12文字以内。正式名は初出で1度だけ。「（コスト）」は付けない —— `legal_entities.short_name`（migration 280 で seed 済み）が既に「グループ本体」で、設定「会社と切替」画面もこれを表示している。実装（2026-09-06・案件一覧/詳細/台帳の計上会社表示）でこの食い違いが見つかり、**既に出ている値に合わせた**（同じ概念が画面によって違う文字列で出るのを避ける） |
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

**発行者情報の入れ方（決定・2026-09-06）**: マイグレーションにハードコードせず、**設定画面（§4.8/§13 の
「会社と切替」・`system_admin` のみ編集可）から GJV・GSS とも入力・変更できる**ようにする。

- **GSS**（今の会社）は `pdf.service.ts` の `COMPANY` 定数が持つ**今の本物の値**（住所・登録番号）を
  そのまま初期値としてマイグレーションで流し込む——値を消して打ち直させない。**そのうえで同じ画面から
  変更できる**（振込先・ロゴは今どこにも無いので空欄から）
- **GJV** は既存の値を持たないので**空欄で作成**。**GJV 名義で見積・請求書を1通でも出す前に**、
  この画面で住所・登録番号（・分けるなら振込先）を入れておく必要がある
- **ガード**: PDF 生成時に発行者情報が不足（住所または登録番号が空）なら、その計上会社の見積・請求書は
  **発行を止め**「発行者情報が未設定です。設定 ＞ 会社と切替 で入力してください」と画面に出す
  （`kind='cost_center'` の GMO は請求書を出さないので対象外）。**状態遷移（`preparing`/`cutover`）自体は
  発行者情報の有無を条件にしない**——先取り（§5）で GJV の案件番号を採ることは発行者情報が無くても進められる

### 4.3 案件番号 — 形式・採番・履歴

**形式（決定・2026-09-06）**: `{prefix}{4桁通し}` ＝ `GJV-0001` / `GSS-0001` / `GMO-0001`。3段で1本に揃える:

| 段 | 形 | 出る場所 |
|---|---|---|
| 案件番号 | `GJV-0001` | 案件一覧・詳細・BOX フォルダ名・カレンダーの題名・検索 |
| 回コード | `GJV-0001-001`（GMO の月次ユニットは `GMO-0001-2610`） | 回・Qシート（連携キー）・見積書の件名コード |
| 請求キー | `GJV-0001-001-1`（末尾は税枝番） | 売上・仕入の行・請求書／検収書 PDF の名前 |

- **A/B の1字は無くす**（会社の prefix が意味を持つ。旧 A は GJV か GSS、旧 B は GMO）
- **年は入れない・リセットしない**（いまの GLS と同じ運用。回コードの区切りがぶれない）
- 4桁: 旧番号は5か月で A が 024 まで進み、旧形式の通し（GLS161）を合わせると3桁は10年持たない
- 採番は既存の `generateSequenceNumber` の `ON CONFLICT` 経路をそのまま使う。`seq_name` を会社ごとに分ける
- 回コード `{番号}-NNN`・請求キー `{回コード}-{税枝番}` の**規則は変えない**（[design/v4/regular-series.md](design/v4/regular-series.md) §8）
- **統一の中身（決定・§9-N）: 売上・仕入は必ず回に紐づける。** 理由: いまは回を持たない売上だけ別経路で
  `{番号}-{通し3桁}-{税枝番}` を作っており（`project.service.ts:2637-2653`）、回コードと**同じ形で別の数え方**をしている。
  回 `001` の売上 `GLS-A001-001-1` と、回なしで採った2件目 `GLS-A001-002-1` は、次に作る回 `002` の請求キーと衝突しうる。
  1本にすれば請求キーは常に回コードから導け、帳票・取込・照合の規則が1つになる。運用の決めごと:
  - **A（GJV／GSS）**: 受注（`a_won`）で回が無ければ**第1回を1件だけ自動で作る**（レギュラー・単発とも。
    [design/v4/regular-series.md](design/v4/regular-series.md) §5 を全 A に広げる）。売上・仕入の登録は回を選ぶ
    （1つしか無ければ自動で選ぶ・聞かない）。見積→売上は `estimate_episodes` の回に付く（未指定なら第1回）
  - **GMO**: 回＝月次ユニット（`GMO-0001-2610`）。仕入の登録時に計上月のユニットが無ければ自動で作る
  - **例外**: 疑似案件 `FIXED-COGS` と販管費は回を持たない（今までどおり日付ベースの請求キー）
  - **過去は書き換えない**: 回を持たない既存の売上・仕入行はそのまま。新しい登録から規則を効かせる

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

- **実施日**（決定）＝ `event_start`（＝`project_dates` の最小日＝初日）。無ければ回の最小 `recording_date`、
  無ければスタジオ予約の最小開始日。**どれも無い案件は「判定できない」として一覧に出し、人が決める**
- **B は実施日で切らない**（決定）。**切替時点で完了・失注でない B はすべて GMO へ**。完了済みの4件は GSS の履歴として
  `GLS-B` のまま残す（§9-L）
- **先取り**（決定）: コンテンツスタジオは 2026-01 設立の既存法人なので、**切替日より前でも「実施日 ≥ 切替日」のグループ外の案件は
  最初から GJV の番号を採り、見積書も GJV 名義で出す**（§5 の `preparing`）。9月に受注する10月以降の案件が
  「GLS で採って改番」の二度手間にならない
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
- 請求書番号は発行者ごとの系列 `INV-{code}-{暦年}-NNNN`（決定）。**発行済みの `INV-2026-…` は変えない**。
  GSS の新系列は `INV-GSS-2026-0001` から始める（旧系列の続き番号にはしない。発行者名が変わるので系列も切る）
- **2社間の社内取引**（GSS → GJV の売上と GJV の仕入）も同じ表の行として持つ。両側の対応は §4.12
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
| 売上の登録口（`registerable-projects` から除外＋サーバー 409 `NO_REVENUE_ENTITY`）・請求書／検収書の発行・入金・締め・営業見通し（パイプライン） | **仕入（発注・支払）**・**予算と実績**（案件ごとの見積積算＝予算案として `estimates` を流用、`submit_to='self'` 固定）・月次のコスト集計（仕入の行を月で集計）・BOX の「原価・発注」 |
| GPM 詳細の「見積・請求」タブ | 「**予算と実績**」タブに差し替え（同じ部品の売上側を隠す） |
| 財務ダッシュボードの損益フロー | コスト側だけの構成（予算 vs 実績・月次推移・案件別内訳） |

- **過去の B の売上は消さない**（GSS の帳簿に残る）。閉じるのは**新しい登録**だけ
- 月次ユニット `/episodes/month` は GMO でも使える（コストを月で切る単位として自然）
- **範囲は最小案で確定**（2026-09-06）: **仕入（発注・支払・支払予定）＋案件ごとの予算対実績＋月次のコスト集計**。
  稟議・固定資産（資本的支出）はグループ本体の別システムで管理するので **ONAiR では持たない**
- **予算**＝その案件の受理済み（`accepted`）の最新版の見積合計（GPM の「個別見積」を予算案として流用・表は増やさない）。
  **実績**＝確定した仕入の合計。**残**＝予算−実績。月次は仕入の `recognition_date` で切る

### 4.8 改番の手順（通知 → 手動）と移行センター

設定 ＞ **「10月の切替（計上会社と案件番号）」**（`system_admin`・PC 専用）:

1. **会社マスター**の編集（4.2）と**切替日**・**状態**（§5）
2. **改番の対象一覧**: 発番済みで「実施日 ≥ 切替日」または「B で進行中」の案件。列＝現在の番号・実施日・
   お客様・グループ内外・**導出された計上会社**・売上／請求の状態・**止める理由**（発行済み請求書あり など）

   ⚠️ **導出規則どおりに機械で決めきれない例**（ご確認の実例・2026-09-06）: 「インテリジェンス」`GLS-A023`
   （客先 GMOサムライコンテンツスタジオ株式会社）は、**9月まではサムライスタジオ（GSS）がコンテンツスタジオ
   （GJV）へ請求する客先の仕事**（導出規則どおり＝客先がグループ内 → GSS で正しい）だが、
   **10月以降はコンテンツスタジオ自身が制作する**予定（現時点）——つまり計上会社が GSS から GJV へ
   **変わる**。導出規則は「客先の `is_gmo_group`」しか見ないため、この切り替わりを規則だけでは検出できない。
   **対象一覧には「客先＝自社行（GJV／GSS）になり得る取引先」を含む案件を目立たせ**（客先名に
   「サムライコンテンツスタジオ」「サムライスタジオ」を含む・または `intake_channel='group'`）、
   **人が§4.4の上書き（理由必須）で GJV に直す**運用にする。同じ客先の案件が今後も出ることを見込み、
   移行センターには「この客先はうちが計上会社そのものかもしれません」という注記だけ出す
   （自動で書き換えはしない——GSS が実際にコンテンツスタジオへ請求する取引がこの先も残り得るため）
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
| `comp-self-gms` | 名前を「自社（GMOサムライスタジオ）」に、`legal_entity_code='GSS'`。GJV の自社行 `comp-self-gjv` を追加。**取引先「GMOサムライコンテンツスタジオ」2行の名寄せ**（`3d099e40…` に統合・§2.6）を同じマイグレーションで先に行う |
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
-- 社内取引の結び目（§4.12）
CREATE TABLE intercompany_links (
  id TEXT PRIMARY KEY,
  revenue_id  TEXT NOT NULL UNIQUE REFERENCES revenues(id),
  purchase_id TEXT NOT NULL UNIQUE REFERENCES purchases(id),
  created_at TIMESTAMPTZ NOT NULL, created_by TEXT
);
-- 会社ごとの設定（PK の付け替え）
-- monthly_budgets / monthly_actual_overrides: PK (entity_code, year_month)
-- money_rules: CHECK (id='default') を外し id = entity_code
-- companies: legal_entity_code TEXT REFERENCES legal_entities(code)
-- sequences: seq_name 'project_GJV' 'project_GSS' 'project_GMO' / 'invoice_GJV_2026' …
```

DEFAULT 'GSS' は埋め戻しのためだけに置き、**埋め戻し後に DROP DEFAULT**（新しい行で黙って GSS に
落ちないように。書く側が必ず決める）。

### 4.12 2社間の社内取引（決定: 発生する → ONAiR に載せる）

GJV が受けたグループ外の案件を GSS のスタジオ・人員・機材で作るとき、**GSS → GJV の売上（社内）と GJV の仕入（社内）**が
法人ごとの帳簿に要る。載せないと GJV は売上だけ・GSS は費用だけの損益になる。

**考え方: 社内取引は「同じ案件に付く、会社の違う2行」。写しの案件は作らない。**

| 側 | 行 | 計上会社 | 相手先 |
|---|---|---|---|
| 売り手 | `revenues`（社内売上） | GSS | `companies` の自社行「GMOサムライコンテンツスタジオ」（`legal_entity_code='GJV'`） |
| 買い手 | `purchases`（社内仕入） | GJV | `companies` の自社行「GMOサムライスタジオ」（`legal_entity_code='GSS'`） |

- 2行は **`intercompany_links(revenue_id UNIQUE, purchase_id UNIQUE)`** で1対1に結ぶ。**片方だけ直せない**
  （金額・計上日・回の変更は結び目の口 `PUT /intercompany/:id` からだけ。単独の PUT／DELETE は 409 `INTERCOMPANY_LINKED`）。
  削除も両側同時。**売り手側が請求書を発行済みなら両方とも直せない**（既存の請求後ガードに乗る）
- **入口は買い手の案件の仕入タブ**「サムライスタジオへ社内発注」1つ。金額を入れると GSS 側の売上行が同時にできる
  （回を選べば両側が同じ回に付く。回は必ずある・§4.3）
- **GSS 側の請求・検収・入金は通常の流れ**（決定・§9-M）。締め画面に「社内」の印を付けて分けて見せ、
  **請求書 PDF も ONAiR から発行する**（別法人なので適格請求書。発行者は GSS・宛先は GJV の自社行）
- **案件の粗利は2通り**: 「案件全体（社内取引を除く）」＝外部売上−外部仕入 が営業の見る数字（いまの粗利と同じ意味）。
  「会社別」＝ GJV: 外部売上−外部仕入−社内仕入 ／ GSS: 社内売上−GSS の仕入。案件詳細の収支サマリーは前者を既定にし、
  切替で後者を出す（数字は同じ API から・2か所で数えない）
- **財務ダッシュボード（会社別）は社内取引を含む**（各社の帳簿としては本物の売上・仕入）。連結を作るときは
  `intercompany_links` に結ばれた両側を除けば相殺になる（§9-F・第1段では作らない）
- 営業見通し（パイプライン）は外部の売上・仕入だけを数える（社内行は除外。GJV と GSS の合計が二重にならない）
- MCP: `create_intercompany_purchase`（confirm 2段階）を1本。`list_revenues` / `list_purchases` の出力に `intercompany: true` を足す
- **値決め**（決定・§9-M）: **金額は手入力**。初期値に、その案件の最新の見積の原価行（`estimate_items.cost`）の合計を出す。
  料金表のグループ内価格は使わない（社内取引は原価の付け替えであって販売ではない）

---

## 5. 旧⇄新の共存と切替（モード設計）

`org_transition.state` の4状態。**戻せるのは `cutover` → `preparing` まで**（追加のみのマイグレーションなので
データは壊れない。発番済みの新番号はそのまま有効）。

| 状態 | 誰が変える | 画面・振る舞い |
|---|---|---|
| `off`（今日） | — | 何も変わらない。マスター表・列は存在するが使われない |
| `preparing`（先取り） | `system_admin`（検証環境で先に） | 移行センターが開く。会社マスター・切替日を入れる。**新規発番は導出規則どおり**（実施日 ≥ 切替日のグループ外 → `GJV-`、グループ内 → `GSS-`、実施日が切替日より前 → 従来の `GLS-A`）。GJV の案件は見積書も GJV 名義。**A の改番と通知が動く**（発番済みで実施日 ≥ 切替日のもの）。財務のセグメントが出る（GJV はほぼ空）。B は一覧に出るが改番は切替日以降 |
| `cutover` | `system_admin`（切替日の朝に手で。日付の前には切り替えられない） | **`GLS-` の新規発番を完全に閉じる**。**走っている B を GMO へ改番**（通知→手動）。GSS の帳票は `renamed_on` 以降なので新社名。GMO のコスト画面が実際に使われ始める |
| `done` | 残件 0 で自動提案・人が確定 | 通知ジョブを止める。旧方式で採る経路のコードを次のリリースで消す |

- **検証環境（dev.gmo-onair.jp）は 9月中に `cutover` で動かす**。本番は P0＋P1 が入り次第 `preparing` にして、
  10月以降の受注を最初から新番号・GJV 名義で出す。切替前に、会社の導出が違う案件を直せる
  （案件一覧・詳細に「計上会社: コンテンツスタジオ（GJV）」を出す。帳簿はまだ GSS のまま）
- **切替の日にやること**は移行センターの中に手順として出す（①状態を `cutover` に ②通知を送る
  ③改番 ④請求書番号の系列を確認）。Slack・口頭に頼らない

---

## 6. 段階と PR の並び（10/1 まで 3週間半・現実的な線）

「お金と自動処理に触るものを先に、画面を後に」（regular-series.md §10 と同じ順序の付け方）。

| 段 | 中身 | 10/1 に要るか | 目安 |
|---|---|---|---|
| **P0 土台** | `legal_entities` / `org_transition` / `project_numbers` / 各表の `entity_code`（DEFAULT 'GSS' で埋め戻し）・会社マスター画面・切替状態・PDF とメールの発行者差し替え・取引先の名寄せと自社行 | **要る（9月中旬）** | 3〜4 PR |
| **P1 番号** ⚠️ **一部実装済み（2026-09-06）** | prefix 採番・`resolveEntity`・先取り（`preparing` で導出規則どおりに採る）・受注時の第1回自動作成（売上は必ず回に）・改番 API＋MCP・追随（回コード／Qシート／BOX／未請求の請求キー）・旧番号での検索と `:ownerKey`・取込の正規表現・通知ジョブ・移行センターの対象一覧 | **要る（9月下旬・`preparing` へ）** | 5〜6 PR |
| **P2 財務の2社＋社内取引** | 8画面のセグメント（URL）・集計／締め／Excel／MCP の `entity_code`・月次予算と `money_rules` の会社化・請求書番号の系列・**社内取引**（`intercompany_links`・仕入タブの入口・案件の粗利2通り） | 10月中旬まで（最初の GJV 案件の請求が10月下旬） | 5 PR |
| **P3 GMO コスト（最小案）** | `kind='cost_center'` の閉じ方・「予算と実績」タブ・コスト側ダッシュボード | 10月中 | 2〜3 PR |
| **P4 仕上げ** | `done` 状態・旧経路の削除・`entity_scope` 権限・連結（要るなら）・文書と用語の更新（`CLAUDE.md` の公理・`wording.md`・`guide/words.md`・`mcp-server.md`） | 後 | 2〜3 PR |

- P0 と P1 は直列（P1 は P0 の表に依存）。P2 と P3 は P1 のあと**並行できる**
- 各 PR は `docs/changelog.d/` に1つ・PR 後は `pr-watch`（既存の決めごと）
- **自動テスト**: 採番・改番・導出を `shared/tests/` に足す（いま採番の直接のテストは 0 本）。
  最低: 導出規則の表・prefix 採番の一意性・改番の追随範囲（請求済みの請求キーが動かない）・旧番号検索

> **P1 実装結果（マルチエージェント・2026-09-06）**: `resolveEntity`／新方式の採番
> （`generateProjectNumber`）／改番（`renumberProject`・`RenumberPreview`／`RenumberResult`）を
> `server/src/contexts/sales/services/entity-resolution.service.ts` に実装し、`issueGls`／
> `peekGls`（発番・プレビュー）と `changeStage` の受注時第1回自動生成（単発 A への拡大は
> `org_transition.state !== 'off'` のときだけ）に配線した。改番の `HTTPルート`
> （`GET /:id/renumber-preview`・`POST /:id/renumber`）と MCP ツール `renumber_project`
> （`issue_gls` と同じ confirm 2段階）も実装し、ついでに `issue_gls` の説明文に残っていた
> 「発番で口頭決定に自動昇格する」という**2026-09-02 に撤去済みの挙動の記述**を削除した。
> `project_numbers` を見る旧番号解決を `:ownerKey`（`device-settings-owner.ts`）・グラフィックスの
> 案件検索・案件一覧の検索・全体検索・決算取込／X-point 取込の照合に配線し、
> `kessan-import.service.ts` のトークン正規表現を `GJV-`/`GSS-`/`GMO-` にも広げた
> （副産物として、新形式トークンでも起きていたであろう3文字決め打ちスライスのバグ
> `parseGls` を同時に直した）。案件一覧・詳細・台帳に計上会社バッジ／列を追加した。
> 検証: `server`/`client` の型チェック、`shared` の Vitest 2004件、検証DBを作り直しての
> migration 001b〜283 通し適用、実データに近いスモークテスト（`resolveEntity` の分岐・
> 改番の履歴と請求キーの発行済みガード・旧番号での検索・受注時の回自動生成の
> off/preparing差異と冪等性を実際にDBへ通して確認）。
>
> **まだのもの（次段）**: 通知ジョブ・移行センターの画面（対象一覧はまだ専用の一覧化なし）・
> `create_studio_booking` の番号指定・`client-techops` の旧番号検索・
> 財務系 MCP ツールへの `entity_code` フィルタ（`list_revenues`/`list_purchases`/`list_sga`/
> `get_monthly_pl`/`get_monthly_budget`/`upsert_monthly_budget` と `finance/list-query.ts`。
> 本来 P2「財務の2社」の仕事なので、P1 の「先出し」一覧からは外してよいと判断した）。

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
| 社内取引の片側だけが直る・消える | GJV の仕入と GSS の売上がずれ、2社の帳簿が合わない | `intercompany_links` で1対1に結び、単独の更新・削除を 409 で止める（§4.12） |
| 期限（10/1）に P2/P3 が間に合わない | 10月の帳簿を2社に分けて入れられない | 行の `entity_code` を P0 で入れておけば、後から画面が来ても**入力時に会社を選ぶ最小 UI**（台帳ダイアログの1欄）で凌げる |
| `DEFAULT 'GSS'` が残る | 新しい行が黙って GSS に落ちる | 埋め戻し直後に DROP DEFAULT・`droppedColumns.test.ts` に相当する検査を足す |

---

## 9. ユーザー判断が要る分岐点（壁打ち）

> ✅＝2026-09-06 に決定（本文に反映済み）。未決の項目は **[提案]** が私の推し。決まったら本文の「候補」を確定に書き換える。

- **A. 番号の形式** ✅ `GJV-0001`。回があるものは末尾に回コード `GJV-0001-001`。GMO も `GMO-0001`（ハイフンで統一）
- **B. 請求書番号** ✅ 発行者ごとの系列 `INV-GJV-2026-0001` / `INV-GSS-2026-0001`
- **C. 「実施日」の定義** ✅ 初日（`event_start`）→ 回の初回 → 予約の初日。**B は実施日で切らず、走っているものは全部 GMO へ**
- **D. 切替日をまたぐグループ外の案件**（今日 0 件）: (a) 既存の「回の付け替え」で手作業・ツールは作らない **[提案]** ／ (b) 分割ツールを作る
- **E. 社名変更前の帳票の再発行**: (a) 新社名＋「（旧 GMOグローバルスタジオ株式会社）」を併記 **[提案]** ／ (b) 発行当時の社名のまま ／ (c) 新社名のみ
- **F. 連結（2社合算）の見方**: (a) 第1段では作らない **[提案]** ／ (b) 4つ目のセグメント「2社合算」（`intercompany_links` の両側を除いて相殺・注記付き）
- **G. GMO の「コスト管理」の範囲** ✅ 最小案（仕入＋案件ごとの予算対実績＋月次のコスト集計）。稟議・固定資産はグループ本体の別システム
- **H. 名前とドメイン**: 「GMO ONAiR」と `gmo-onair.jp` は変えない前提でよいか **[提案: 据え置き]**。ログイン画面・マニュアルの社名は「GMOサムライスタジオ」に
- **I. グループ本体の事業担当**: ONAiR のアカウントを持って GMO 案件を見るか。**いまの前提: 持たない**（GMO 案件の仕入・予算はスタジオ側の PM が入れる）。
  持つなら第2段で**会社で見える範囲を分ける権限**（`entity_scope`）が要る
- **J. 2社間の社内取引** ✅ 発生する → ONAiR に載せる（§4.12）
- **K. コンテンツスタジオ** ✅ 2026-01 設立の既存法人。**切替前に GJV 名義の見積を出してよい** → 先取り（§4.4・§5）。
  補足（ご確認）: 9月まではサムライスタジオ（GSS）からコンテンツスタジオ（GJV）へ請求書を出す取引が実在する
  （「インテリジェンス」「紹介動画撮影」）。10月以降はコンテンツスタジオ自身が制作する予定（現時点）——
  この2件は導出規則では検出できない「客先＝将来の自社」ケースとして§4.8で個別に扱う
- **L. GLS-B の完了済み4件**: 移管しない（GSS の履歴のまま `GLS-B` で残す）でよいか **[提案: 残す]**
- **M. 社内取引の値決めと請求** ✅ 金額は手入力（見積の原価行の合計を初期値）。GSS → GJV の請求書 PDF は ONAiR から発行し、同じ締めの流れに乗せる
- **N. 「統一」のやり方** ✅ 売上・仕入を必ず回に紐づける。単発の案件も受注時に第1回を自動で作る（§4.3）

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
- 稟議・固定資産（資本的支出）の管理（グループ本体の別システム・§9-G）
- 社内取引のための「写しの案件」（同じ案件に会社の違う2行を付ける・§4.12）

---

## 13. P0 の実装計画（土台・9月中旬）— 決めごとに依存しない部分 **✅ 実装済み（2026-09-06）**

**目標: 会社という次元と発行者情報を入れ、状態 `off` のあいだは既存の振る舞いを1ミリも変えない。**
マイグレーションは **280 番から**（2026-09-06 時点の最新は 279）。すべて追加のみ。

> **実装結果（マルチエージェント・2026-09-06）**: 0a〜0d とも実装し、
> `claude/2026-oct-system-migration-hu4a58` ブランチに commit 済み（PR は未作成）。
> 計画からの差分:
> - マイグレーションは **280（0a）／281（entity_code 列・NULL 可のまま追加）／
>   282（0b: 全 INSERT の配線後に NOT NULL 化）／283（0c: notification_templates の件名）**
>   の4本になった。281 は「列を足すだけ」に留め、NOT NULL 化は配線を終えた282で分離した
>   （`DEFAULT` は一度も持たせていない——282 が来るまでは列がただ NULL 可なだけで、
>   `entityCodeInserts.test.ts` を先に green にしてから締めた）
> - `entityCodeInserts.test.ts` は元の計画（`droppedColumns.test.ts` 方式）どおり実装し、
>   これにより計画の一覧に無かった書き込み口を2つ発見・配線した
>   （`finance/services/doc-handoff.service.ts` の受け取った書類→台帳引き渡し）
> - 0c の「GPM の『自社（…）』・マニュアル・案件作成のメール下書き」は**意図して対象外**にした
>   （静的な文字列の書き換えだけでは`renamed_on`が空のあいだ何も変わらず、ライブ化するには
>   クライアント側のデータ取得を新設する必要があり、P0 の behavior-neutral という目的に対して
>   過剰だった。**切替（cutover）の作業と一緒に直す**）。`notification_templates` の4行は
>   実際には一度もプログラムから読まれておらず（`template()`/`fill()` の呼び出しは
>   `dg_comment`/`dg_new`/`dg_reply` の3件だけ）、`{発行会社}` は他のトークンと同じ
>   「人が手で埋める例示」として置き換えただけで新しい描画コードは足していない
> - `bank_account` は JSONB の自由形式（サーバー側にスキーマなし）。クライアント実装が
>   `bank_name`/`branch_name`/`account_number`/`account_holder` のキーを決めた——
>   ほかに読む場所がまだ無いので今は無害だが、社内取引（P2・§4.12）で読む側を作るときは
>   この4キーに合わせること
> - 検証: `server`/`client` の型チェック、`shared` の Vitest 2004件、検証 DB を作り直して
>   移行 001b〜283 を通しで適用（264ファイル）、`check-migration-numbers`/`check-mobile-declared`/
>   `check-links`/`check-md-links`/`check-shared-wiring` すべて green

| PR | 中身 | マイグレーション | 主に触る場所 |
|---|---|---|---|
| **0a** `feat(server): 計上会社マスターと切替状態の表を足した` | 取引先「GMOサムライコンテンツスタジオ」2行の名寄せ（`ff64b0e1…` を `3d099e40…` へ吸収）。`legal_entities` に GJV／GSS／GMO の3行——**GSS は `pdf.service.ts` の `COMPANY` 定数の値（住所・登録番号）をそのまま初期値に**、`former_name`＝GMOグローバルスタジオ株式会社・`renamed_on`＝切替日。**GJV は発行者情報が空欄**（設定画面から後で入れる）。`org_transition` を `off` の1行、`companies.legal_entity_code`（`comp-self-gms` → GSS、GJV の自社行 `comp-self-gjv` を追加。名前の書き換えは切替時）。`GET/PUT /legal-entities`（発行者情報の編集含む・`system_admin`）・`GET/PUT /org-transition`（`cutover` は `cutover_date` 以降だけ・`done` は残件 0 だけ）。`migrate.ts` の起動時チェックに「3行と1行がある」を足す | 280 | `server/src/contexts/platform/{services,routes}/legal-entity.*`・`shared/db/migrate.ts` |
| **0b** `feat(server): 帳簿の行と案件に計上会社の列を足した` | `projects.entity_code/entity_source/entity_note`・`project_numbers`（既存の `gls_number` を `scheme='gls'`・`GSS` で流し込む）・`revenues/purchases/sga_expenses/estimates.entity_code`（`NOT NULL DEFAULT 'GSS'` で埋め戻し）・`finance_docs.entity_code`（NULL 可）・`monthly_budgets/monthly_actual_overrides/money_rules.entity_code`（**列だけ**。PK の付け替えと複数行化は P2）。サーバーの **INSERT を全部 `entity_code` 明示**にして（案件の `entity_code ?? 'GSS'`）、`shared/tests/entityCodeInserts.test.ts`（`droppedColumns.test.ts` と同じ走査で `INSERT INTO revenues|purchases|sga_expenses|estimates` に列があるか）が通ったら **同じ PR で `DROP DEFAULT`** | 281 | `sales/services/{project,estimate}.service.ts`・`finance/routes/*`・`platform/services/{kessan,xpoint}-import*`・`mcp/tools/{finance,budget}.tools.ts`・`gpm/*` |
| **0c** `feat(server,client): 帳票とメールの発行者を計上会社マスターから読むようにした` | `pdf.service.ts` の `COMPANY` 定数を `PdfRevenueData.issuer` に置き換え、呼び出し側（`revenues.routes.ts:68`・`estimate-pdf.service.ts`）が行の `entity_code` から引く。名前は `nameAsOf(entity, 発行日)`（`renamed_on` より前なら旧社名・以後は新社名＋「（旧 …）」の併記＝§9-E の提案どおり）。`notification_templates` の初期4行の件名を `【{発行会社}】` に（手で直した行＝`updated_at` が初期値でない行は触らない）・送信時に変数を解決。機材レンタルの文面・GPM の「自社（…）」・マニュアル・案件作成のメール下書きをマスター読みに | 282 | `shared/services/pdf.service.ts`・`sales/services/estimate-pdf.service.ts`・`platform/services/notification*`・`qsheet/services/rental.service.ts`・`client/src/contexts/gpm/pages/projectForm/BasicStep.tsx` ほか |
| **0d** `feat(client): 設定に「会社と切替」の画面を足した` | 設定トップ「ルール」に新カード（`/settings/reorg`・PC 専用・`CLIENT_PC_ONLY` に登録）。**会社ごとに（GJV・GSS の2枚。GMO は請求書を出さないので発行者情報欄は無し）**発行者情報の編集フォーム（住所1/2・適格請求書発行事業者登録番号・振込先・ロゴ）、切替日、状態ボタン（P0 で押せるのは `off → preparing` だけ。`cutover` は P1 で活性化）。**GSS は最初から値が入った状態で開く**（0a で流し込み済み）・**GJV は空欄から入力**。`system_admin` 以外は読むだけ | — | `client/src/contexts/platform/pages/reorg/`・`pages/settings/hubCards.ts`・`App.tsx`・`pcOnlyScreens.ts` |

**受け入れ条件（`off` のまま）**: 全画面の見た目と API の応答が変わらない（`entity_code` が増えるだけ）／
PDF の発行者ブロックの文字列が今と同一（切替日前なので旧社名・GSS の値は 0a で移した `COMPANY` 定数と一致）／
`npm run typecheck`・`npm run test`・`npm run lint`／
検証 DB（`npm run verify:up`）に 280〜282 を適用して起動時チェックが通る／`entityCodeInserts` が green。

**コードの外でやる作業（P0 と並行）**:
- **GJV の発行者情報**（住所・適格請求書発行事業者登録番号・振込先・ロゴの有無）を、0d の画面から
  `system_admin` に入力していただく（このセッションでは値を預からない・チャットでは受け取らない）。
  **GJV 名義で最初の見積・請求書を出す前まで**に間に合えばよい（§9-K の先取り運用）
- 名寄せ先の ID（`3d099e40…`）は実データで確認済みなので、この2点は判断待ちではなく**0a に実装として含める**

**P1 の先出し（`preparing` に入るために要るもの・9月下旬）**: prefix 採番（`generateProjectNumber(entity)`・
`sequences.seq_name = project_{code}`）／`resolveEntity`／受注時の第1回自動作成／改番 API＋MCP と追随／
`project_numbers` 経由の旧番号検索／通知ジョブ／移行センターの対象一覧／案件一覧・詳細の「計上会社」表示。
詳細は §6。

---

## 12. 更新履歴

- 2026-09-06: 初版（設計下書き）。実測は 5 本の並列調査＋本番データの MCP 読み取り（書き込みなし）。
- 2026-09-06（同日・2回目）: 分岐点 A/B/C/G/J/K の回答を決定に反映。社内取引（§4.12）・番号3段の統一（§4.3）・
  先取りの状態設計（§5 `preparing`）・GMO の最小案（§4.7）を追記。新しい分岐点 M/N を追加。
- 2026-09-06（同日・3回目）: M/N を決定に反映。P0 の実装計画（§13）を追加。
- 2026-09-06（同日・4回目）: 発行者情報は設定画面から入力（GSS は今の値を初期値に・GJV は空欄）に確定。
  取引先「GMOサムライコンテンツスタジオ」2行の名寄せ先を実データで確認（`3d099e40…` に統合）。
  「インテリジェンス」「紹介動画撮影」＝導出規則で検出できない「客先＝将来の自社」ケースを§4.8に追記。
- 2026-09-06（同日・5回目）: **P0（§13・0a〜0d）をマルチエージェントで実装した。** 基盤（migration
  280・281スキーマ・legal-entity/org-transition サービスとAPI）は直接実装し、残る3本
  （entity_code配線とNOT NULL化・PDF/通知の発行者切替・設定画面）を並列worktreeで実装、
  マージして検証（型チェック・Vitest・検証DB作り直しでの移行通し適用・各種lint）まで実施。
- 2026-09-06（同日・6回目）: **P1（§6）の主要部分をマルチエージェントで実装した。**
  核（`resolveEntity`・新方式の採番・改番・受注時の回自動生成の拡大）は直接実装し、
  残る3本（改番API/MCP・旧番号での検索と取込正規表現の拡張・案件一覧/詳細/台帳の
  計上会社表示）を並列worktreeで実装、マージして検証（型チェック・Vitest・検証DB
  作り直しでの移行通し適用・4系統を通しで動かす統合スモークテスト）まで実施。
  詳細と残作業は§6の実装結果を参照。
  実装結果と計画からの差分は§13の追記を参照。
