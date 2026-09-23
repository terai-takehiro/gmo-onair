# GMO ONAiR MCP サーバー (案件管理・カレンダー・財務管理)

> **状態**: 現役の決めごと（**手書き**。生成物ではない）
> **最終確認**: 2026-09-08（v4.6.10） — `server/src/contexts/mcp/tools/*.tools.ts` の `registerTool` を数えて 167 種・25 カテゴリ。「ツール一覧」の見出しの件数と一致
> **位置づけ**: MCP の接続方法・認証・ツール一覧の正（人が読む側）。画面の「MCP コネクタ」が読む `client/public/mcp-tools.json` は `node scripts/generate-mcp-tools.mjs` が同じソースから生成する（この文書は生成しない。ツールを足したら両方直す）。⚠️ 要確認: `mytasks`（個人タスク・依頼・投入。10 種）の表がこの文書に無い — 読み取り5種は「権限ゲート」の節に名前だけ、書き込み5種（`create_task_intake`・`commit_task_intake`・`discard_task_intake`・`create_delegation`・`respond_to_delegation`）はどこにも載っていない。件数 167 には含まれている。

Claude Code などの MCP (Model Context Protocol) クライアントから、ONAiR のデータを直接参照・操作するためのコネクタ。v2.9.171 で追加。

## エンドポイント

```
POST https://<host>/api/v1/mcp      (Streamable HTTP / stateless / JSON 応答)
```

- 本番: `https://gmo-onair.jp/api/v1/mcp`
- 検証: `https://dev.gmo-onair.jp/api/v1/mcp`

nginx の既存 `/api/` プロキシをそのまま通るため、インフラ側の追加設定は不要。

## 認証

**2 方式を併用** (どちらでもアクセス可):

### A. OAuth 2.1 / ONAiR ログイン連携 (v2.9.194+・**claude.ai 組織コネクタ推奨**)

claude.ai の**組織管理カスタムコネクタ**は接続時に必ず OAuth 2.1 + 動的クライアント登録 (DCR) を試みる (「認証なし / APIキー」を宣言できない)。そのため本サーバー自身が OAuth 2.1 認可サーバー兼リソースサーバーになっている。認証は **ONAiR ログイン連携** — 各メンバーが自分の ONAiR アカウントでサインインし、以降の AI 書き込みが**本人名義**で監査ログに残る (共用 `mcp-claude` を脱却)。

- **エンドポイント**:
  - メタデータ (RFC 8414 / 9728): `GET /.well-known/oauth-authorization-server`、`GET /.well-known/oauth-protected-resource/api/v1/mcp`
  - 認可サーバー: `/api/v1/mcp/oauth/{authorize,token,register,revoke}`
- **フロー**: コネクタが `/register` で自己登録 (public client / PKCE S256) → `/authorize` へ誘導 → 未ログインなら ONAiR の `/login?redirect=...` に飛び、ログイン後に認可コードを発行 → `/token` で access (JWT・1時間) + refresh (30日) を取得 → 以降 `Authorization: Bearer <access>` で MCP を呼ぶ。
- **actor**: OAuth トークン経由の書き込みは `created_by` / 監査ログの actor が**実 ONAiR ユーザー id** になる (誰の指示かが確実に残る)。
- アクセストークンは JWT (ステートレス・DB 不要)。署名鍵は `JWT_SECRET` から派生した別鍵 (ONAiR セッション JWT とは分離)。リフレッシュトークンのみ DB (`mcp_oauth_refresh_tokens`) に保持し失効可能。
- OAuth は `MCP_API_KEY` の設定有無に関わらず**常に有効**。

### B. 静的 APIキー (Claude Code CLI / 個人利用)

次の 3 通りのいずれかで送る:

1. `Authorization: Bearer <key>` ヘッダー (推奨・Claude Code 向け)
2. `X-API-Key: <key>` ヘッダー
3. URL クエリ `?key=<key>` (v2.9.172+)

| 環境変数 (VPS の `/root/gmo-onair/.env`) | 適用先 |
|---|---|
| `MCP_API_KEY` | app_prod (gmo-onair.jp) |
| `MCP_API_KEY_DEV` | app_dev (dev.gmo-onair.jp) |

- キー生成: `openssl rand -hex 32`。**キーローテーション**は `.env` を差し替えてコンテナ再起動するだけ (旧キー即失効)。
- 静的キー経由の書き込みは actor が共用 `mcp-claude` になる (誰の指示かは任意引数 `requested_by` で補う)。
- ⚠ このキー 1 本で全ツール (読み取り + 書き込み) が実行可能 (アプリ内の per-user 権限は適用されない)。キーの共有範囲は sales/studio/budget 権限保持者相当に限定すること。

### 認証失敗時

静的キーにも OAuth トークンにも該当しない場合は **401 + `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource/api/v1/mcp"`** を返す。これにより claude.ai は本サーバーの OAuth を発見してサインインに進む。

## Claude Code への登録 (静的キー)

```bash
claude mcp add --transport http onair https://dev.gmo-onair.jp/api/v1/mcp \
  --header "Authorization: Bearer <MCP_API_KEY_DEV>"
```

登録後、Claude Code 内で「今月のスタジオ予約を見せて」「GLS-B005 の収支は？」のように使える。

## claude.ai / Claude アプリの「カスタムコネクタ」への登録

### 組織コネクタ (OAuth・推奨)

設定 → コネクタ → カスタムコネクタを追加 で、**URL だけ**入力する (OAuth Client ID 欄は空のまま):

```
https://gmo-onair.jp/api/v1/mcp
```

接続すると ONAiR ログイン画面が開くので、自分の ONAiR アカウントでサインインする。以降のツール実行は本人名義で監査ログに残る。ログイン済みブラウザなら自動で認可される。

### 個人コネクタ (キー付き URL・OAuth を使わない場合)

OAuth を使わず APIキーで繋ぎたい場合は、URL に `?key=` を付ける (OAuth 欄は空のまま):

```
https://gmo-onair.jp/api/v1/mcp?key=<MCP_API_KEY>
```

URL 自体が秘密情報になるので共有・掲示しないこと。キーをローテーションしたらコネクタ URL も更新する。

## 検証環境のコネクタを別に繋ぐ (2026-09-06)

**検証用の MCP は最初から在ります** (`https://dev.gmo-onair.jp/api/v1/mcp`)。
新しく作る必要はなく、claude.ai / Claude アプリに**2本目のコネクタとして足すだけ**。

⚠️ **足す前に、この版 (2026-09-06 以降) が検証環境にデプロイされていること**を確かめること。
それ以前は**本番も検証も `gmo-onair` と名乗っていた**ので、2本つなぐと
**見分けの付かない同名の口が2つ**並び、**検証のつもりで本番に書けます**。
いまは名乗りで区別する:

| 環境 | MCP の名前 | `instructions` |
|---|---|---|
| 本番 (`NODE_ENV=production`) | `gmo-onair` | 「これは本番環境です。書き込みは実際の業務データに残ります」 |
| 検証 (`NODE_ENV=development`) | **`gmo-onair-dev`** | 「⚠️ これは検証環境です。本番には一切反映されません」 |

判定は `config.isProduction` (= `NODE_ENV`)。`docker-compose.yml` が
`app_prod` に `production` / `app_dev` に `development` を渡している。
`shared/tests/mcpEnvName.test.ts` が名乗りの分岐を固定している
(**同じ名前に戻すと試験が落ちる**)。

### 繋ぎ方

**A. OAuth (推奨・キー不要)**

カスタムコネクタの URL に入れるのはこれだけ (OAuth Client ID 欄は空のまま):

```
https://dev.gmo-onair.jp/api/v1/mcp
```

`app_dev` は `AUTH_MODE: password` なので、本番と同じく ONAiR のログイン画面が開く
(検証 DB の利用者アカウントでサインインする)。**OAuth は `MCP_API_KEY` の設定有無に
関わらず常に有効**なので、キーを探さなくてよい。書き込みの actor も
共用 `mcp-claude` ではなく**本人**になる。

**B. キー付き URL (APIキー方式)**

```
https://dev.gmo-onair.jp/api/v1/mcp?key=<MCP_API_KEY_DEV>
```

⚠️ **`MCP_API_KEY_DEV` は設定されていないことがある。** `.env.example` では
コメントアウトされており、`docker-compose.yml` は `MCP_API_KEY: ${MCP_API_KEY_DEV:-}` と
**未設定なら空**で渡す。空だと `?key=` は一致しようがなく、
**401 (`Unauthorized: sign in via OAuth or present a valid API key`)** になる
(`mcpAuth` は静的キーが無くても OAuth に誘導するため 503 ではなく 401)。

#### キーを調べる・無ければ作る (VPS で)

```bash
# ① .env に入っているか (値は出さない)
grep -c '^MCP_API_KEY_DEV=' /root/gmo-onair/.env

# ② 実際にコンテナへ渡っているか (値は出さない)
docker compose -f /root/gmo-onair/docker-compose.yml exec app_dev \
  sh -c '[ -n "$MCP_API_KEY" ] && echo set || echo unset'

# ③ 値そのものを見る (画面共有・ログに残さないこと)
grep '^MCP_API_KEY_DEV=' /root/gmo-onair/.env

# ④ 無ければ作って追記し、app_dev だけ入れ直す
echo "MCP_API_KEY_DEV=$(openssl rand -hex 32)" >> /root/gmo-onair/.env
docker compose -f /root/gmo-onair/docker-compose.yml up -d app_dev
```

- ⚠️ **本番の `MCP_API_KEY` を検証で使わない** (CLAUDE.md「本番環境の秘密情報を
  検証環境で使わないこと」)。**別のキーにする。**
- ⚠️ **`?key=` を付けた URL 自体が秘密情報**。共有・掲示・コミットしない。
  ローテーションは `.env` を差し替えて `up -d app_dev` するだけ (旧キー即失効)。
  **コネクタ側の URL も更新する。**
- ⚠️ このキー1本で全ツール (読み取り + 書き込み) が実行できる。
  アプリ内の per-user 権限は適用されない。

### 何に使うか

- **AI の書き込みを伴う仕組みを試すとき**は必ずこちら
  (メール自動仕分けの試験実行など。本番に試し打ちを残さない)
- 検証 DB は自由に壊してよい。本番 DB とは**完全分離** (`onair_prod` / `onair_dev`)
- ⚠️ **BOX のフォルダは分けること。** `BOX_MAIL_INTAKE_FOLDER_ID_DEV` を設定しないと
  `BOX_MAIL_INTAKE_FOLDER_ID` (本番と同じフォルダ) に落ちるので、
  **検証で取り込んだ試験用の請求書 PDF が本番のフォルダに混ざる** (DB は分かれていても BOX は分かれない)

## ツール一覧 (167 種 / 25 カテゴリ / v4)

> **この一覧は手で書いています。** 実際に登録されているツールは
> `node scripts/generate-mcp-tools.mjs` が `server/src/contexts/mcp/tools/*.ts` から
> 数え直して `client/public/mcp-tools.json` を作ります（画面の「MCP コネクタ」はそれを読む）。
> **ツールを足したら生成スクリプトを流し、この文書も直してください** —
> v4 の時点で本文は「71 種」のままで、`mytasks` 10 種と `aifeedback` 1 種が丸ごと抜けていました。
> 2026-08 には「90 種」のまま取り残されたこともありました（qsheet→techops Phase 4 の改名で
> production に旧名 `*_qsheet` 系 5 種が二重登録された分が未反映だった）。
>
> 内訳: projects 7（うち `renumber_project` は2026年10月の事業再編で新設。下記参照）/
> gpm 40（読み取り12・書き込み28。2026-08 新設。プロジェクト管理の
> プロジェクト・工程・タスク・未確認事項・体制（並び替え含む）・標準工程テンプレート・
> 見積・議事録・BOXフォルダ。下記参照）/
> customers 4 / activities 4 / tasks 17（タスク10＋かんばん列 7。2026-08 に列 CRUD・
> テンプレート適用と work_state / production_step / episode_id / parent_task_id の
> 細かい編集を追加）/ members 3 / minutes 3 /
> studio 4 / finance 4 / budget 4 / pricing 3 / analytics 3 / users 1 / mytasks 10 /
> opsreports 5 / eventreports 5 / inview 4 / inbox 4 / security-cards 5 / aifeedback 1 / keep 3（定例報告パック。2026-09 新設。下記参照）/
> production 22（読み取り7・書き込み15。新名5種＋旧名 `[非推奨/deprecated]` 5種＋改名対象外3種＋
> スケジュール表の枠 CRUD 3種（2026-08 新設）＋スケジュール表そのもの・列の CRUD 6種
> （2026-08 追加新設。表の新規作成 `create_schedule`/更新 `update_schedule` と、列の
> 追加/更新/削除/並べ替え）。**このカテゴリだけ OAuth actor 専用**。下記参照）/
> equipment 7（読み取り5・書き込み2。2026-08 新設。下記参照）/
> intercompany 1（**2026年10月の事業再編で新設**。社内取引 SCS⇄GSS。下記参照）/
> feedback-tickets 2（**2026-09 新設**。GMO ONAiR 自体への要望・不具合報告。
> `create_feedback_ticket` は OAuth actor 専用。下記参照）
>
> **live（計時・視聴者）向けの MCP ツールはまだ無い。** 廃止決定ではなく、着手対象になった
> ことがない（未検討）。equipment は 2026-08 に新設した。

### 案件管理
| ツール | 種別 | 概要 |
|---|---|---|
| `list_projects` | read | 案件検索・一覧 (search / stage / tab / gls_category / 開催期間 / ページング) |
| `get_project` | read | 案件詳細 + 収支サマリー (売上 / 仕入 / 粗利 / 粗利率) |
| `create_project` | write | ヨミ案件の新規登録 (stage=neta 固定。assigned_to は list_users で解決した users.id 必須)。**idempotency_key を渡すと二重登録を防止** (既存なら再作成せず既存を返す)。message_id / source_channel も保存可 (メール取込用) |
| `update_project` | write | 部分更新 (サーバー側で既存値とマージ — 渡したフィールドだけ変わる) |
| `change_project_stage` | write | ステージ変更。**e_lost (失注) は confirm 2段階**。d_hold で仮押さえ予約を自動作成 |
| `issue_gls` | write | **GLS 発番 (confirm 2段階・取消不可)**。プレビューで昇格ステージ / 見積変換件数 / BOXリネームを提示 |
| `renumber_project` | write | **改番 (confirm 2段階・取消不可・sales の manager 権限)**。発番済み案件を別の計上会社 (SCS/GSS/GMO) の番号系列へ付け替える。回・Qシートの写し・BOXフォルダ名・未請求 (未発行・未入金) の請求キーが追随し、発行済み・入金済みの請求キーは変えない。旧番号は `project_numbers` に履歴として残り、引き続き解決できる。2026年10月の事業再編（[docs/reorg-2026-10-plan.md](reorg-2026-10-plan.md) §4.4/§4.8）で新設 |

> **2026年10月の事業再編**（[docs/reorg-2026-10-plan.md](reorg-2026-10-plan.md)）: `list_projects` / `get_project` の
> 出力に **計上会社** (`entity_code`＝`SCS`/`GSS`/`GMO`。列は常に存在し導出結果を返す) /
> `entity_source`（`rule`=導出のまま／`manual`=人が上書き）/ `entity_note` を追加した。
> **`gls_number` フィールド名はそのまま**（改名していない）——ただし値は改番されると
> 新方式の番号（`SCS-0001` 等）になり得る（§4.3）。**`org_transition.state` は今日時点 `off`**（§5）
> なので、既存案件はすべて `entity_code='GSS'`・`gls_number` も旧方式（`GLS-A024` 等）のまま —
> 今日の時点では列が増えるだけで値は変わらない（休眠中の仕組み）。

### プロジェクト管理 (GPM — GLS-B・2026-08 新設)

HTTP 側 (`/api/v1/internal/gpm/*`) と同じサービス層を呼ぶので、この口から案件 (GLS-A) は
触れない。タスクは案件と同じ `project_tasks` の行で、**ガント用の細かい編集
(start_date / progress / is_milestone / work_state / sort_order) は `create_gpm_task` /
`update_gpm_task` がそのまま受ける**（GPM 画面にガント・かんばんが載った回で整備。
タスク間の依存関係だけは案件タスク側の `add_task_dependency` 等が GLS-B にも使える）。
`create_gpm_project` / `create_gpm_task` は AI 出力を `ai_outputs` に記録し
(kind: `gpm_project_draft` / `gpm_task_draft`・`prompt_version` 任意)、人が画面や MCP から
直すと差分が自動記録される (`gpm-ai-feedback.service`・7日窓)。

| ツール | 種別 | 概要 |
|---|---|---|
| `list_gpm_projects` | read | プロジェクト一覧 (stage / kind / q)。工程の進み・未確認事項の残数・次のタスク・最新見積・健全性 (health) つき |
| `get_gpm_project` | read | 詳細 (工程 + 未確認事項 + 体制) |
| `list_gpm_tasks` | read | タスク横断一覧 (open / done / overdue / all・project_id 絞り込み)。ガント用の start_date / progress / is_milestone つき。private は本人にだけ出る |
| `list_gpm_open_items` | read | 未確認事項の横断一覧 (既定は未解決のみ) |
| `list_gpm_templates` | read | 標準工程テンプレート一覧 (工程・配下タスクの雛形・適用件数つき) |
| `create_gpm_project` | write | プロジェクト作成 (テンプレート展開・開始日から工程に日付付与)。**AI 出力を記録** |
| `update_gpm_project` | write | 部分更新。stage 変更は履歴に残り、a_won で GLS-B 自動発番 (失敗時 gls_error) |
| `delete_gpm_project` | write | **削除 (confirm 2段階・manager)** |
| `create_gpm_phase` / `update_gpm_phase` | write | 工程の追加/部分更新 (日程は started_on / ends_on) |
| `move_gpm_phase` | write | 工程を1つ上/下と入れ替え |
| `delete_gpm_phase` | write | 工程を削除 (配下タスクは消えず「工程なし」に外れる) |
| `create_gpm_task` | write | タスク追加 (工程に付けるのは任意・期限は 18:00・start_date / progress / is_milestone も可)。**AI 出力を記録** |
| `update_gpm_task` | write | タスクの部分更新 (期限 / 開始日 / 進捗% / ◆ / 止まり方 / 並び / 担当 / 工程の付け替え / 完了) |
| `delete_gpm_task` | write | タスク削除 (soft delete) |
| `create_gpm_open_item` / `update_gpm_open_item` | write | 未確認事項の追加/部分更新 (status: waiting/checking/resolved) |
| `delete_gpm_open_item` | write | 未確認事項を削除 |
| `add_gpm_member` / `update_gpm_member` / `remove_gpm_member` | write | 体制 (組織図) のメンバー。社外の人も名前で登録できる (案件の `add_project_member` とは別の表) |
| `reorder_gpm_members` | write | 体制のメンバーの並び順を一括更新 (段=tier の中の位置。2026-08 新設・HTTP側にも対で追加) |
| `create_gpm_template` / `update_gpm_template` | write | 標準工程テンプレートの作成/更新 (⚠️ update の phases は全置換) |
| `delete_gpm_template` | write | **テンプレート削除 (confirm 2段階・manager)**。is_system は消せない |
| `list_gpm_estimates` / `get_gpm_estimate` / `get_gpm_estimate_summary` | read | プロジェクトの見積一覧/詳細/全体サマリー。`estimates` を案件と共用 |
| `create_gpm_estimate` | write | プロジェクトに見積を作る (submit_to=self/client/pm 必須) |
| `update_gpm_estimate_items` | write | 見積の明細を全置換 (下書き版のみ・合計はサーバーが出し直す) |
| `approve_gpm_estimate` | write | 値引き承認待ちの見積を承認 (資格が無ければエラー) |
| `archive_gpm_estimate` / `unarchive_gpm_estimate` | write | 見積の一覧表示/非表示 (状態は変えない) |
| `list_gpm_minutes` / `get_gpm_minutes` | read | プロジェクトの議事録一覧/詳細 (全文は詳細のみ) |
| `update_gpm_minutes` | write | 議事録を直す・確定する (confirm:true で AI 出力との差分を自動記録) |
| `delete_gpm_minutes` | write | 議事録を削除 (manager) |
| `get_gpm_box_folder_preview` / `list_gpm_box_files` | read | BOX フォルダ構成のプレビュー/中身の一覧 |
| `create_gpm_box_folder` | write | BOX フォルダを作る (社内限り・社外共有の2系統・既にあれば409) |

⚠️ **見積 PDF 発行・議事録の音声アップロード・BOX へのファイルアップロードは MCP に持ち込んでいない**
（バイナリ/multipart のため。画面から行う）。

### 顧客・営業活動・タスク・担当者
| ツール | 種別 | 概要 |
|---|---|---|
| `list_customers` / `get_customer` | read | 顧客検索・詳細 (+直近案件10件) |
| `create_customer` | write | 顧客登録 (**重複ガード**: 類似名があれば候補を返して作成しない。`allow_duplicate:true` で強制) |
| `update_customer` | write | 顧客の部分更新 (マージ) |
| `list_activity_logs` | read | 営業活動記録一覧。`upcoming:true` で次回アクション予定 (N日以内・未対応のみ。失注・完了した案件の分は含まない) |
| `list_overdue_actions` | read | 期限超過の次回アクション (対応漏れ) 一覧。定期リマインド→Slack 通知用 (毎朝叩いて「対応漏れ N件」を投稿する運用)。days_overdue / 案件 / 担当者 / 顧客を含む。`total` は **`limit` で頭打ちにならない実数**・`returned` が返した行数 |
| `create_activity_log` / `update_activity_log` | write | 活動記録の登録/更新 (user_id は活動した担当者の users.id 必須)。create は **idempotency_key で二重登録防止** + message_id / source_channel 保存可。同一メールから案件と活動を両方起票するときは key を意図別に分ける (例 `email:<msgid>:project` / `:activity`) |
| `list_tasks` | read | タスク一覧 (案件内 or 進行中案件の横断) |
| `create_task` / `update_task` | write | タスク作成/更新 (completed で完了切替。progress 0-100 / is_milestone ◆ / work_state (todo/doing/waiting) / production_step / episode_id / 子タスク parent_task_id も指定可。GLS-B のタスクにも使える — ガントの細かい編集はこちら) |
| `move_task` | write | タスクをかんばん列へ移動 / 列内の並び替え (column_id + sort_order) |
| `reorder_tasks` | write | 同一案件内のタスク並び順を一括更新 |
| `delete_task` | write | タスク削除 (soft delete・子タスクも一緒に) |
| `bulk_create_tasks` | write | タスク一括作成 (制作/プロジェクトのスケジュール雛形を一気に投入。start/due・担当・列・progress・is_milestone・work_state 等を指定可) |
| `list_task_dependencies` | read | 案件内のタスク依存 (先行→後続) 一覧 |
| `add_task_dependency` | write | タスク依存を追加 (先行 predecessor → 後続 successor。冪等・循環は拒否。ガントの → 線) |
| `remove_task_dependency` | write | タスク依存を削除 |
| `list_task_columns` | read | かんばん列 (セクション) 一覧 — move_task / create_task の column_id をここで解決 |
| `create_task_column` / `update_task_column` | write | かんばん列の追加 / 名前・色の変更 |
| `reorder_task_columns` | write | かんばん列の並び順を一括更新 |
| `delete_task_column` | write | かんばん列を削除 (中のタスクは列なしに移って残る) |
| `list_task_column_templates` | read | かんばん列テンプレート (配信案件用・イベント用など) の一覧 |
| `apply_task_column_template` | write | テンプレートの列一式を案件に追加 (既存の列は保たれる) |
| `list_project_members` | read | 案件の担当メンバー一覧 (複数担当・外部の方含む) |
| `add_project_member` | write | 担当メンバー追加 (登録ユーザーは user_id / 外部の方は member_name+is_external。同ユーザーは冪等) |
| `remove_project_member` | write | 担当メンバーを外す (soft delete) |
| `list_users` | read | ユーザー一覧 — 担当者名 → users.id の解決に使う |

### カレンダー・財務・分析
| ツール | 種別 | 概要 |
|---|---|---|
| `list_studio_rooms` / `list_studio_bookings` | read | 拠点部屋一覧・予約一覧 (上限500件) |
| `get_studio_availability` | read | 空き照会 (部屋ごとの busy 予約 + 終日空き日)。単日照会の境界取りこぼしが無い。「◯日空いてますか」回答用。最大92日 |
| `create_studio_booking` | write | スタジオ予約作成 (既定 status=tentative)。`project_id` の代わりに `gls_number`（現行・改番後の旧番号どちらも可）で指定してよい |
| `get_monthly_summary` | read | 月次/期間の損益サマリー (損益7指標) |
| `list_revenues` / `list_purchases` / `list_sga` | read | 売上/仕入/販管費一覧 |
| `get_sales_funnel` | read | 営業ファネル (ステージ別件数/金額・転換率・滞留・月次推移) |
| `get_lost_reason_analysis` | read | 失注理由分析 (+教訓・学び) |
| `get_sales_performance` | read | 担当者別 目標vs実績 |

> **2026年10月の事業再編**（[docs/reorg-2026-10-plan.md](reorg-2026-10-plan.md) §4.5/§4.6/§4.12）:
> `get_monthly_summary` / `list_revenues` / `list_purchases` / `list_sga` に **`entity_code`**
> (`SCS`/`GSS`/`GMO`) の絞り込みを追加した。**省略時は絞らない＝全社合算**（後方互換。
> 加算できる一覧・集計なので「省略＝1社」ではなく「省略＝全社」に倒した）。
> `list_revenues` / `list_purchases` の出力行には社内取引の印 **`intercompany`**（true/false）も付く
> （GSS⇄SCS の社内売上・社内仕入のペア。次の「社内取引」節を参照）。**`org_transition.state` は
> 今日時点 `off`**（§5）のため、絞り込んでも全件が `GSS`・`intercompany` は常に false（休眠中）。

### 社内取引 (intercompany — SCS⇄GSS・2026年10月の事業再編で新設)

GSS のスタジオ・人員・機材を使って SCS の案件を行うときに発生する、計上会社間の
社内売上・社内仕入のペアを扱う（[docs/reorg-2026-10-plan.md](reorg-2026-10-plan.md) §4.12）。
GSS 側の社内売上 (`revenues`) と SCS 側の社内仕入 (`purchases`) を同じ回に1本ずつ作り
`intercompany_links` で1対1に結ぶ（写しの案件は作らない）。作成後は片方だけを直せない・
消せない（専用の経路以外は 409）。

| ツール | 種別 | 概要 |
|---|---|---|
| `create_intercompany_purchase` | write | **社内取引の作成 (confirm 2段階・取消不可・sales の editor 権限)**。買い手 (SCS) の案件・回・金額を指定すると、GSS 側の社内売上と SCS 側の社内仕入が同時に作られる。プレビューはその案件の直近の見積の原価行の合計を参考金額として提示する |

⚠️ **`org_transition.state` は今日時点 `off`**（§5）のため、社内取引はまだ実運用では発生しない
（休眠中の仕組み）。

### 料金表・見積 (v2.9.193+)
| ツール | 種別 | 概要 |
|---|---|---|
| `list_pricing` | read | 料金表マスタ (カテゴリ別に項目・calc_type・定価/グループ内価格)。見積を組む前に pricing_item_id を調べる。**料金表は場所ごとにある** (v4 大③) — `location_id` か `project_id` を渡さないと全場所の品目が混ざる。`project_id` は案件のスタジオ予約から場所を決め、決められないときは `location_hint.reason` で理由を返す |
| `get_project_simulation` | read | 案件の見積明細 + 合計 |
| `set_project_simulation` | write | 料金表から案件の見積を組んで設定 (既存は全置換)。subtotal は calc_type からサーバー算出、単価は案件の customer_type で自動選択。**既定 status=draft (AI 下書き・未確定)**: expected_amount には反映されず、担当者がアプリの案件画面で「確定する」を押すと最終化される。status=final を明示すると即反映 |

### 日常業務 (dailyops — 週報 / 日報)
| ツール | 種別 | 概要 |
|---|---|---|
| `get_weekly_activity_stats` | read | 週次活動集計 (新規案件 / 活動内訳 / パイプライン / 売上 / 今週・来週イベント / 来週期限の次回アクション)。week_start 省略時=先週月曜、任意日は月曜へ正規化 |
| `submit_ops_report` | write | レポート本体の upsert (kind × period_key で 1 本・再実行は更新)。**items (行) には触れない** — 人間の追記は消えない。published を draft に戻すこともない |
| `add_ops_report_items` | write | レポートへ行を追加 (レポートが無ければ自動作成)。daily_news は URL 重複を自動スキップ (再実行安全) |
| `list_ops_reports` | read | レポート一覧 (メタのみ)。投稿済み確認・欠番チェック用 |
| `get_ops_report` | read | レポート全文 + 行 (人間の追記行も含む — それを踏まえて本文を更新できる) |

kind と運用契約:
- `weekly_activity` (ウィークリー活動報告) — 全社で週 1 本。period_key = 週開始日の月曜。`get_weekly_activity_stats` の結果を文章化して body に、結果そのものを payload の `{stats: ...}` に入れて **status='draft'** で `submit_ops_report`。人間がアプリでトピック行を追記し「確認・確定」で published にする。**画面にも同じことをする「AI下書きを作る」ボタンがある**（`POST /dailyops/reports/:id/draft-ai`・2026-09）— こちらが本来の起動口で、MCP 経由はそれを AI エージェントが代行したいときの経路（`model` 引数を渡すと `ai_outputs` の記録にモデル名が残る）。どちらの経路で作った下書きも「確定」時にサーバーが自動で差分を記録する（会社方針「AIを使い捨てにしない」）。
- `daily_news` (デイリーニュース報告) — 日 1 本。period_key = 日付。Web の業界ニュースを `add_ops_report_items` で行として投稿 (**published** で直接公開・確定操作なし)。行のフィールド: category (LED/照明/映像/音声/配信/コンテンツ/スタジオ/AR/XR/その他)、content (1行要約)、url、ai_related (AI 関連か)、note。採用フラグ (pick 1〜5) は人間がアプリで設定する。
- `mail_intake` (メール取込ログ・v4.5.26) — 日 1 本。period_key = 日付。**メールの仕分けが「何を取り込み、何を落としたか」**を `add_ops_report_items` で行として投稿 (**published** で直接公開)。行のフィールド: category (種別 `kairos3_contact` / `kairos3_download` / `kairos3_inview` / `finance_doc` / `sales_thread` / `inquiry` / `dropped`)、content (「走査N通 / 取込N件 / 落としN件」)、note (落としたものの代表の件名・10本まで)。
  **取り込んだものは各テーブルに残りますが、落とした判断はどこにも残りません。** これが無いと**取りこぼしを後から数えられません** — 実測で Kairos3 の資料ダウンロード通知 21件のうち 17件が未処理のまま1か月誰にも気づかれませんでした ([docs/reviews/2026-09-06-mail-intake-taxonomy.md](reviews/2026-09-06-mail-intake-taxonomy.md))。**中身の全文は入れません**（原文は取り込んだ側の `body_text` にあります）。

### 内覧会 来場予約 (dailyops — inview)
| ツール | 種別 | 概要 |
|---|---|---|
| `register_inview_attendee` | write | Kairos3 の登録通知メールを取り込む。`session_label` に「参加希望の回」をそのまま渡すと日付/時間帯/対象を自動抽出。同 email × 同 session_label は更新 (再取込で重複しない)。同行者・全連絡先フィールド対応 |
| `update_inview_attendee` | write | 来場予約の部分更新 (渡したフィールドだけ変更)。id は register_inview_attendee の返り値 / list_inview_attendees から取得。session_label 変更時は日付/時間帯/対象を再抽出。companions は氏名で既存と突き合わせ受付記録を引き継ぐ |
| `list_inview_attendees` | read | 来場予約一覧 (from/to/upcoming で絞り込み) |
| `list_inview_sessions` | read | 回 (セッション) ごとの 登録件数 / 合計人数 / 来場済み数 集計 |

### 見積/請求・その他問い合わせ (dailyops — inbox)
| ツール | 種別 | 概要 |
|---|---|---|
| `record_finance_doc` | write | メール受信の 見積書/発注書/請求書 を取込 (doc_type / 送付者 / 金額 / 締月 / 支払期日 / message_id で重複ガード)。status=new。承認/却下/仕入・販管費への登録は人がアプリで操作。**v4.5.26 で ひとつづり・当て先・添付 の引数が増えた**（下記） |
| `list_finance_docs` | read | 受領書類を1通ずつ一覧 (status / doc_type / pending) |
| `list_finance_doc_groups` | read | **受領書類を「1つの取引」単位で一覧**（見積書→発注書→請求書のひとつづり）。stage は quote_only / ordered / invoiced / empty。**取り込む前にこれを読むと、同じ取引の続きかどうかが分かる** |
| `record_inquiry` | write | 他カテゴリに属さない**有益メールのみ**登録。**スパム・営業・メルマガ・他ツール対象 (見積請求/内覧会/案件) は呼び出し前に AI が除外する契約**。summary / importance / source / tags / action_needed を付与 |
| `list_inquiries` | read | その他問い合わせの一覧 (importance / **state** / **tag** / unhandled / **desk** / limit)。**返す件数に上限あり**（既定 50・最大 200） |

**v4.5.26: 受領書類は「ひとつづり」になりました**（migration 281・2026-09 のご指示）。

見積書 → 発注書 → 請求書 は1つの取引です。1通ずつ入れると
**「この請求書はどの見積の続きか」が読めず**、経理が毎回メールを探し直すことになります。
`record_finance_doc` に**任意の引数**が増えました（**既存の呼び出しは1つも壊れません**）。

| 引数 | 中身 |
|---|---|
| `group_key` | 同じ取引を束ねる鍵。**書類番号が同じ → `doc:<番号>` ／ 同じスレッドの続き → `thread:<最初の msgid>` ／ どちらでもなければ渡さない**。⚠️ 取引先名だけで束ねると、別件の請求書が混ざる |
| `group_title` | 束の題名（何の取引か） |
| `doc_no` / `revision` | 書類番号 ／ 見積の改定回数（改定された見積は同じ `group_key` で `revision` を増やす） |
| `vendor_name` | 取引先の会社名（署名から。台帳の取引先名になる） |
| `project_hint` | 当て先の手がかり（GLS 番号か案件名）。**AI は案件を決め打たない** — サーバーが探し、確からしさ（high/medium/low）と理由を付ける。**候補が複数あるときは付かない** |
| `expense_kind` | `purchase`（案件の仕入）/ `sga`（販管費）。**決めきれないときは渡さない**（画面に「未定」と出て人が決める） |
| `payment_terms_days` / `processing_month` | 販管費のとき。「30日サイト」なら 30。「翌月末払い」は日数で表せないので渡さない（月によって日数が変わる） |
| `attachments` | メールの添付。**BOX の「受領書類（メール）」フォルダ**に入る。1ファイル 10MB・1通 10個まで、`pdf/png/jpg/jpeg/xlsx/xls/csv/zip` のみ。⚠️ **Gmail コネクタは添付の中身を返さない**（名前と id だけ・実測）ので、通常は `gmail_message_id` ＋ `gmail_attachment_id` を渡し、**サーバーが Gmail API から取りに行く**。手元にバイト列があるときだけ `content_base64`。**添付 id は呼ぶたびに変わる**ので、その場で取った新しいものを渡すこと |

- **請求書の PDF は原本です。必ず渡してください。** 渡さないと ONAiR には金額だけが残り、
  原本はメールボックスの中だけになります
- **入らなかった添付は黙って消えません。** 返り値の `attachments[].stored` が `false` の
  ときは `failure_reason`（`NOT_CONFIGURED` / `UNAVAILABLE` / `TOO_LARGE` / `BAD_TYPE` /
  `NO_GMAIL_ACCESS` / `NO_GMAIL_SCOPE` / `GMAIL_UNAVAILABLE`）が付き、
  画面も「BOX に入っていません」と出します。
  **`NO_GMAIL_SCOPE` は人の作業が要ります** — 設定画面から Google 連携をやり直すと
  `gmail.readonly` が付きます（既に連携済みの人には自動では付きません）
- **見積書も取り込んでください。** 以前は「台帳に入るのは請求書だけ」として画面から
  外していましたが、**外すと「あの見積どうなった」を引く道が無くなります**。
  台帳（仕入・販管費）に入らないのは変わりません（画面がそう言います）
- **添付の中身は監査ログにも教師データにも入れません**（base64 が 1000 文字の切り詰めを
  食い潰し、肝心の 差出人・件名・金額 が消えるため）。残るのはファイル名と種類だけです

**v4 大②: 出どころ・行き先・タグを持つようになりました**（migration 171）。

| 引数 | 中身 |
|---|---|
| `source` | 出どころ `mail` / `slack` / `phone` / `talk`（既定 `mail`）。**旧 `email` は `mail` に読み替えます** |
| `tags` | 後から引くための短い語を1〜3個（8個まで・各24文字まで）。旧 `category` は tags の1つ目として畳まれます |

- **行き先 (`state`) は AI が決めません。** 取り込んだものは必ず「未仕分け」で入り、人が
  ストック / チケット（案件管理のタスクになる）/ 案件の受付へ送る / 見送り のどれかに仕分けます
- その仕分けの結果は `get_ai_feedback_digest`（`kind=inquiry_intake`）の **`inquiry.dropped_rate`
  （見送り率）** として返ってきます。**取り込む前に一度読み、拾いすぎていないかを確かめること**
- AI が入れた行かどうかは `ai_outputs` に記録があるかで判定します。
  **`source` は出どころであって「誰が入れたか」ではありません**（v4 より前は混同していました）。
  **受領書類（`finance_docs`）も同じ判定に揃えました**（migration 247）—
  それまで書類側だけが `source === 'email'` を印にしており、
  手で足したメールの行に嘘の ✨ が付いていました

**ストックには「見直す日」が付きます**（migration 247・`misc_inquiries.stock_review_on`）。

- ⚠️ **ストックは「捨てた」ではありません。** 見直す日（既定は仕分けた日の1か月後）が来ると、
  **未仕分けと同じ扱いで「今日さばくもの」に戻ります**（画面の見出し・ホームのタイル・
  `GET /dailyops/alerts` の3か所とも同じ判定）
- 見直す日が空のストックも机に出ます。「決めていない」を「永久に出さない」と読むと、
  ストックが見送りと同じ行き止まりになるためです
- `list_inquiries` の **`desk=true`** がこの集合（未仕分け ＋ 見直しの日が来たストック）を返します。
  `get_ai_feedback_digest` の見送り率を読むときは、**ストックは見送りに数えていない**ことに注意してください

**v4: メールの中身を「読める形」で渡せるようになりました**（migration 160）。
`record_finance_doc` / `record_inquiry` に**任意の引数**が2つ増えています。

| 引数 | 中身 |
|---|---|
| `details` | メールの中身を**意味の単位に分けた配列**（最大30）。`heading` 小見出し / `text` 段落 / `fields` ラベルと値の組 / `bullets` 箇条書き / `table` 表 / `quote` 本文からの引用 / `note` 注意 / `link` 参考URL |
| `body_text` | メール本文の**全文**（切り詰めない）。要約ではなく原文 |

- **HTML やマークダウンを書かせません。** 取引先の文面がそのまま実行される（XSS）うえ、
  画面の書体・色・余白が AI ごとに変わり、後から検索も集計もできなくなります。
  **AI は「何の情報か」を言い、見せ方はアプリの部品が決めます**
- 形はサーバー (`shared/services/rich-content.ts`) が検査します。
  **知らない種類は捨て**、`javascript:` の URL は落とし、長さに上限があります
- おすすめの組み立て方: ① `fields` に「差出人の所属・要件・希望日・人数・予算・返事の期限」など
  **読み取れた項目だけ**（読み取れなかった項目は入れない＝推測しない）② `bullets` に条件
  ③ `quote` に判断の根拠になる原文をそのまま
- **この2つのツールは `ai_outputs` に引数の全文を残します**（会社方針「AI を使い捨てにしない」の条件1）。
  人が画面で直すと、サーバーが自動で差分を `ai_corrections` に入れます（条件2）

> ⚠️ **本番のメール取込スキルは `/root/.claude/skills/sales-mail-gmoonair/` にあり Git 管理外です。**
> **正はリポジトリの [`.claude/skills/mail-intake/`](../.claude/skills/mail-intake/SKILL.md)**（2026-09 に新設）で、
> 直したら VPS へ写してください。
> ツール側に引数を足しても**スキルが追随しないと1件も埋まりません**。
> このリポジトリからは触れないので、**人が直す必要があります**。
>
> **スキルに入れる変更（3つ）**
> 1. 手順6（`notes` に全部詰める）を `details` ＋ `body_text` を渡す形に直す（migration 160 の分・未対応）
> 2. `record_inquiry` に **`source`** を渡す。メールからの取込なら `mail`。
>    Slack を読ませているなら `slack`（渡さないと全部メール扱いになり、出どころ別の内訳が嘘になる）
> 3. `category`（1つ）をやめて **`tags`（配列）** を渡す。
>    協業 / 取材 / 採用 / 設備 / 営業資料 / 先の話 など短い語を1〜3個。
>    関係する GLS 番号が分かるならそれもタグに入れる
>
> **加えて、取り込む前に `get_ai_feedback_digest`（`kind=inquiry_intake`）を1回読む**手順を
> 冒頭に足してください。見送り率が返るので、**拾いすぎていれば次の実行から絞れます**
> （これが無いと、人が毎朝見送っている労力がどこにも戻りません）。
>
> **直すまでの間も壊れません** — `source` を渡さなければ `mail`、`category` だけでも
> tags の1つ目として入ります。ただし**出どころ別の内訳とタグの引き直しは効きません**。

### スタジオ セキュリティカード (dailyops — security cards)
GMOサムライスタジオ用賀のセキュリティカード 24 枚。カードはセキュリティレベルに応じて解錠できる部屋が異なる。貸出対応者は GMO ONAiR ユーザー。
| ツール | 種別 | 概要 |
|---|---|---|
| `list_security_cards` | read | カード一覧 (レベル・解錠できる部屋 access・貸出状況)。status=available/lent で絞り込み |
| `get_security_card` | read | カード 1 枚の詳細 (解錠できる部屋・現在の貸出・履歴)。card_no (1-24) or card_id |
| `lend_security_card` | write | 貸出。card_no + 貸出先担当者 (borrower_person) 必須。会社/連絡先/目的/貸出日/返却予定日/対応者を記録。貸出中はエラー |
| `return_security_card` | write | 返却。card_no で指定。返却日は既定で今日 |
| `list_security_card_lendings` | read | 貸出履歴 (status=active/returned・card_id・from/to で絞り込み) |

### フィードバックチケット (dailyops — feedback tickets・2026-09 新設)
GMO ONAiR 自体（どれかのブロックアプリ）への要望・不具合報告。起票は `dailyops` を開ける人なら誰でも、対応状況の更新は `dailyops:editor`（画面のみ）。
⚠️ **`create_feedback_ticket` は OAuth actor 専用**（静的APIキーでは 403）。`reporter_id` が `users` への FK のため共用 actor 名義では起票できず、そもそも「誰が報告したか」がそのまま画面に出る記録なので代理起票を避けている。
| ツール | 種別 | 概要 |
|---|---|---|
| `create_feedback_ticket` | write | 起票。title/description/target_app/target_page 必須（category は既定 other）。起票者は今チャットしている ONAiR アカウント本人 |
| `list_feedback_tickets` | read | 一覧。status/target_app/category/search で絞り込み。新しい起票順・上限つき（既定20・最大100） |

### 隔週キープ資料 (v2.9.200+ — イベント報告 / 月次予算・損益 / 議事録)
| ツール | 種別 | 概要 |
|---|---|---|
| `get_event_report` | read | 案件のイベント実施報告 (トピック / 来場者数 / 写真) + 収支サマリー。未作成は found=false |
| `list_event_reports` | read | 実施報告の一覧 (reported_at 範囲・既定 confirmed のみ)。案件情報 + 収支サマリー同梱 — 隔週キープの②ページ生成の主入口 |
| `upsert_event_report` | write | 実施報告の作成/更新 (**渡したフィールドのみマージ更新**)。headline / highlights / 来場者数 / report_status (draft→confirmed で資料掲載) |
| `attach_event_photo` | write | 写真の追加 (実体は Box・box_file_id 参照のみ保持。レポート未作成なら draft を自動作成) |
| `detach_event_photo` | write | 写真の削除 (Box 上の実体は削除しない) |
| `get_monthly_budget` | read | 月次予算 (売上/固定原価/変動原価/販管費/営業利益の目標) を**計上会社別**に取得。`entity_code` (SCS / GSS / GMO・省略時 GSS) |
| `upsert_monthly_budget` | write | 月次予算の登録/更新 (マージ更新。operating_profit 未指定は構成要素から自動計算)。`entity_code` (省略時 GSS)。全体の目標は会社の合計なので全体の値は入れない |
| `upsert_monthly_actual_override` | write | 実績補正 (経理確定値) の登録 — FIXED-COGS 償却の未計上補完・販管費確定値。`entity_code` (省略時 GSS) |
| `get_monthly_pl` | read | **損益ページの単一入口**: 予算 / 補正込み実績 / 対目標差・比・判定 (売上・利益系: 実績≧目標→○、費用系: 実績≦目標→○、目標未登録→"-")。`entity_code` は SCS / GSS / GMO (省略時 GSS) か `all` (会社の合計)。対目標比は目標が赤字の行だけ 100 − (目標 − 実績) ÷ \|目標\| × 100 (9/4 の資料の式) |
| `get_meeting_minutes` | read | 議事録サマリ (決定事項 / 領域別トピック / 次回開催日) |
| `upsert_meeting_minutes` | write | 議事録サマリの登録/更新 (マージ更新) |
| `list_meeting_minutes` | read | 議事録サマリの一覧 (開催日範囲・新しい順) — 前回会議分の取得に使用 |

> **2026年10月の事業再編**（[docs/reorg-2026-10-plan.md](reorg-2026-10-plan.md) §4.5）:
> `get_monthly_budget` / `upsert_monthly_budget` / `upsert_monthly_actual_override` / `get_monthly_pl` に
> **`entity_code`**（`SCS`/`GSS`/`GMO`）を追加した。**こちらは省略時は「今の会社」1社ぶん**
> （`money_rules` と同じ「1行に決まる」設定のため — 上の一覧・集計系ツールの「省略＝全社合算」とは
> 逆の既定なので混同しないこと）。**`org_transition.state` は今日時点 `off`**（§5）のため、
> 「今の会社」は常に `GSS`（休眠中の仕組み）。

### 隔週キープの定例報告パック (dailyops — keep・2026-09 新設)
| ツール | 種別 | 概要 |
|---|---|---|
| `get_keep_report_pack` | read | 会議1回ぶんの数字を1本の JSON (`KeepReportPack`・`shared/src/keepReport/types.ts`) で取得。`meeting_date` (省略時=次回の開催日) / `entity_code` (計上会社の絞り込み: `all`〔省略時〕/ `SCS` / `GSS` / `GMO`。ヨミ表・案件ページ・実施報告に効く。数値報告の表は常に全体＋会社別を持つ) / `segment` (all / internal / external) / `live` (true でいまの数字)。**凍結した版 (週報の確定時点) があればそれ**、無ければいまの数字 (`frozen=false`・`pack.frozen_at=null`)。`meeting_frozen` はその会議日に全体 (all/all) の凍結版があるか (`frozen=false` なのに true なら、その絞り込みの版だけが無く「いまの数字」)。HTTP の `GET /dailyops/keep/pack` と同じ `getPackForMeeting` を通る |
| `list_keep_report_packs` | read | 凍結した版の一覧 (id / 会議日 / 絞り込み / 凍結した時刻と人 / 結んだ週報の id)。中身は含まない。同じ会議日の複数の版は凍結し直したもの (新しい版が先・前の版は消さない)。`limit` / `entity_code` / `segment` で絞れる — 週報の確定は絞り込み 12 通り (計上会社 4 × お客様区分 3) を全部凍結するので、会議日ごとに 1 行ずつ見たいときは `entity_code=all, segment=all` |
| `get_keep_slack_draft` | read | **Slack の定例投稿の下書き** (`text` = 日本語の mrkdwn 文字列)。引数は `get_keep_report_pack` と同じ (`meeting_date` / `entity_code` / `segment` / `live`)。中身: 見出し (会議日) → 前月 着地の 売上高／粗利／営業利益 (目標比と○✕・全体と計上会社別) → 当月 見込 (1行) → ヨミ表の上位8件 (確度順) → 実施報告 (日付・案件名・売上/粗利率) → 内覧会 (組・名・満足度) → 見込に含めた未確定の売上 → 数字の元 (凍結した時刻か「いまの数字」)。金額は千円 (3桁区切り)・絵文字なし。前回の資料 (凍結した版) があれば動いた数字に ＊。HTTP は `GET /dailyops/keep/slack-draft`、画面は「隔週キープの数字」タブの「Slack の文面をコピー」と同じ `getSlackDraftForMeeting` |

パックの中身 (`docs/design/v4/keep-report.md` §5)。**会社の区分は 2026年10月の事業再編の計上会社 `entity_code`** ([reorg-2026-10-plan.md](reorg-2026-10-plan.md) §4.5・`legal_entities.code`): `SCS` = GMOサムライコンテンツスタジオ (グループ外のお客様) / `GSS` = GMOサムライスタジオ (グループ内のお客様・旧 GMOグローバルスタジオ) / `GMO` = GMOインターネットグループ本体 (コストセンター)。着地・見込は財務と同じく**案件ではなく行 (revenues / purchases / sga_expenses) の `entity_code`** で切り、ヨミ表・案件ページの絞り込みは案件の `entity_code` で行う:
- `landing` … **会議の前の月**の着地 (9/4 の会議なら 8月)。`all` / `SCS` / `GSS` (/ `GMO` は数字があるときだけ) の 6行 (売上高・原価〔案件仕入〕・粗利・販管費・償却相当額・営業利益) × 目標/実績/差/比/判定。確定売上 (`status='confirmed'`) だけを数える。`all` の目標は3社の合計 (`get_monthly_pl` の `entity_code=all` と同じ)
- `forecast` … **会議の月**の着地見込 ＝ 着地 ＋ 受注前案件 (失注除く) の `status='estimate'` の売上 × ステージの受注確度。受注前案件の仕入は 100% → 確度に置き換える (二重に数えない)。`unconfirmed[]` はその月の `status='estimate'` の売上 (案件ごとの合計・**見込に確度加味で入っている**・注記の材料)。`unregistered[]` はその月に本番があるのに売上 (確定・見積) が 1 件も無い案件 (金額は最新の見積 → 想定金額。**表の数字には入っていない**・登録し忘れの注意)
- `trend` … 2024-01〜会議の月 (最後の点は進行中)。売上 (グループ内/外部は案件の `customer_type` の当時の値)・案件数 (本番開始日がその月の受注済み以降)・営業日数・稼働日数・稼働率
- `pipeline` … 終わっていない案件 (ネタを含む) のヨミ表。行の `entity_code` は案件の計上会社 (`projects.entity_code`: `SCS` / `GSS` / `GMO`)。`samurai` は `companies.samurai_group` のお客様、`external` はそれ以外の全部 (グループ内も。`segment` で絞る)。見積金額・粗利は最新の見積、次のやることは未対応の次回アクションのうち期限が近いもの、`since_last` は前回の会議日以降の new / updated
- `project_pages` … ヨミ表で「資料」に印 (`projects.keep_pick`) を付けた案件のページ材料。写真は案件 Box の社外フォルダ `08_写真` (BOX につないでいなければ空)、チェック/リハ/本番は `studio_bookings` (setup / rehearsal / performance)、進行表 (Qシート) は段3以降で空
- `event_reports` … 前回の会議日より後・今回の会議日以前に本番を終えた受注済み以降の案件。総括は `event_reports.headline`、箇条書きは KPT の keep (**人が確かめた行だけ**)
- `calendars` … 会議の月と翌月。`days` の鍵は `YYYY-MM-DD`。稼働率 = 利用があった日数 ÷ 営業日数 (`keep_settings` の種別・土曜の設定。既定はメンテナンス以外を数える)
- `inview` … 会議日以前の直近の定期内覧会。組数・人数は受付した人 (誰も受付していない回は申込)、分類は来場者の会社、満足度は手入力 (`PUT /dailyops/keep/inputs/:meeting` の `inview_satisfaction` = `{score}`)
- `minutes` … 前回の会議日の議事録サマリ
- 金額は円の整数・比率は % (小数1桁)・判定と比率はサーバーが計算済み。千円に丸めるのは表示側 (`shared/src/keepReport/calc.ts` の `toThousandYen`)

凍結: 週報 (`weekly_activity`) を確定すると、その週の会議日 (無ければ次の開催日) のパックを 全体／全区分 で凍結し、`ops_reports.payload.keep = { pack_id, meeting_date }` で結ぶ (凍結に失敗しても確定は成功する)。単独で凍結するのは `POST /dailyops/keep/pack/freeze` (body `meeting_date` / `entity_code` / `segment` / `ops_report_id`。知らない `ops_report_id` は 400)。凍結した版は書き換えず、直したいときは元データを直して凍結し直す (前の版は残る)。ただし**同じ会議日・同じ絞り込みを 60 秒以内に凍結し直しても版は増えない** (直前の版の id が返る。確定ボタンの二度押し対策。同時に走った2本は `pg_advisory_xact_lock` で直列)。

Slack の定例投稿 (bot 化の下準備・`docs/design/v4/keep-report.md` §6.2・§10): `get_keep_slack_draft` の `text` は**パックからの決定的な整形で AI の生成ではない**ので `ai_outputs` には記録しない (`get_ai_feedback_digest` にも出ない)。投稿する bot は **この `text` をそのまま投稿し、投稿の id (Slack の `ts`) を `pack_id` と一緒に残す**こと — §10 の条件3 (成果を紐づける) はこの id が無いと反応 (リアクション・返信) を回収できない。人が文面を直して投稿したときは、直した文も一緒に残す (資料の `keep_deck_edits` と同じ「人の直しを差分で残す」・条件2)。

### 制作技術支援 (production — 進行台本・スケジュール表)

⚠️ **このカテゴリだけ静的 API キーを拒否し、OAuth（ONAiR ログイン連携）専用です。** 台本は
「作成者本人／共有先／`system_admin`」の文書単位の秘匿で、共有 actor (`mcp-claude`) には
見てよい範囲を定義できないため。静的キーで呼ぶと全ツール（read も含む）が 403 になります。

**台本（Yjs の `data`）への書き込みは「提案まで」。** `propose_sheet_draft` は `qsheet_ai_proposals`
に1行置くだけで、台本そのものはサーバーから一切書き換えません。取り込み（台本へ反映）は
編集画面の「AIの提案」トレイから人が行います — 取り込みツールは意図的に出していません
（設計: [`docs/design/v4/qsheet-v4-coding/05-mcp.md`](design/v4/qsheet-v4-coding/05-mcp.md)）。

**スケジュール表の枠（`qsheet_schedule_items`）は直接書き込みます**（2026-08 新設）。
`create_schedule_item`/`update_schedule_item`/`delete_schedule_item` は台本と違い提案止まりでは
なく、HTTP 側の `schedule-items.routes.ts` と同じ粒度でその場で作成・更新・削除する — 枠の追加や
時刻調整は台本の内容を作り替えるものではなく、単純な CRUD だと判断したため。他の人の編集と
競合したときは `CONFLICT` エラーになる。

**スケジュール表そのもの（`qsheet_schedules`）と列（`qsheet_schedule_columns`）も同じ理由で
直接書き込みます**（2026-08 追加新設）。それまでは枠（項目）しか MCP から作れず、表と列は
先に画面で作っておく必要があった。`create_schedule`/`update_schedule` は HTTP 側の
`schedules.routes.ts` と、`create_schedule_column`/`update_schedule_column`/
`delete_schedule_column`/`reorder_schedule_columns` は `schedule-columns.routes.ts` と、
それぞれ同じ粒度の CRUD。**表・列・枠の3段が揃ったので、AI が「新しい日のスケジュール表を
1本まるごと（列も含めて）作る」ところまで MCP だけで完結できる。** 削除
（`delete_schedule`）は意図的に出していない — 共有先がいる資料の削除は影響が大きいため、
表そのものの削除は引き続き画面から行う（列の削除 `delete_schedule_column` は中の枠を巻き込む
軽い操作のため対象に含めている）。

⚠️ **qsheet→techops移行 Phase 4（2026-08-22）: ツール名を techops 系の新名へ改名した。**
`get_qsheet`/`find_similar_qsheets`/`create_qsheet`/`propose_qsheet_draft`/
`discard_qsheet_proposal` の5本は、それぞれ `get_sheet`/`find_similar_sheets`/`create_sheet`/
`propose_sheet_draft`/`discard_sheet_proposal` に改名した。**旧名も同じ実装のまま当面は
呼べる**（`[非推奨/deprecated]` の注記付きで登録済み）。新しく連携するときは新名を使うこと。
旧名の撤去時期は未定（`docs/reviews/qsheet-techops-migration-plan.md` §6）。

| ツール | 種別 | 概要 |
|---|---|---|
| `list_production_docs` | read | 進行台本・スケジュール表・技術資料の横断一覧（app=sheet/schedule/tech。運営マニュアル・会場図面は対象外）。project_id/gls_number/date/app/q で絞り込み。見えるもの（台本・スケジュール表は作成者本人／共有先、技術資料は作成者本人／案件メンバー、管理者は全件）だけ。技術資料の date は null（date 絞り込みは作業日で当てる） |
| `get_production_journey` | read | 案件・資料単体の「今どこまで出来ているか」。`tone` は完成度ではなく「触られたか」 |
| `get_sheet`（旧 `get_qsheet`） | read | 台本の中身。既定 outline（ロールと尺だけ）。台詞などの本文は `include_text=true` のときだけ。列（セル）は `blk.<type>#<n>` の参照キーで返る |
| `get_day_schedule` | read | 当日の枠（スケジュール表）。schedule_id か project_id+date |
| `find_similar_sheets`（旧 `find_similar_qsheets`） | read | 似た過去回の骨格（本文は返さない）。共有されている台本だけが対象 |
| `create_sheet`（旧 `create_qsheet`） | write | 空の台本を作る（中身は空）。idempotency_key で二重作成を防止 |
| `propose_sheet_draft`（旧 `propose_qsheet_draft`） | write | `qsheet_ai_proposals` に提案を1件作る。台本は変わらない。kind は script_outline_draft（骨格）/ script_line_draft（既存行の台詞埋め）の2つ |
| `discard_sheet_proposal`（旧 `discard_qsheet_proposal`） | write | 提案を見送ったことを記録する |
| `create_schedule` | write | スケジュール表そのものを新規に作る。作成直後は列・枠が0本（template_id 未指定時） |
| `update_schedule` | write | 既存のスケジュール表を部分更新。他の人の編集と競合すると CONFLICT |
| `create_schedule_column` | write | スケジュール表に列を1つ追加。col_group は venue/prep/ops のいずれか |
| `update_schedule_column` | write | 既存の列を部分更新（col_group 自体は変えられない） |
| `delete_schedule_column` | write | 既存の列を削除（取消不可）。列の中の枠も同時に削除される |
| `reorder_schedule_columns` | write | 列の並び順・所属グループをまとめて変える |
| `create_schedule_item` | write | スケジュール表に枠を1つ追加。column_id は get_day_schedule の columns[].id から選ぶ |
| `update_schedule_item` | write | 既存の枠を部分更新。他の人の編集と競合すると CONFLICT |
| `delete_schedule_item` | write | 既存の枠を削除（取消不可） |

絞り込み・並び替え・書き込みロジックは UI と同一の service 層 (`projectService` / `activityLogService` / `projectTasksService` / `salesAnalyticsService` / `finance/list-query.ts`) を共有しているため、画面と同じ結果・同じ副作用になる。

### 機材管理 (equipment — 2026-08 新設)

台帳検索・詳細・貸出履歴・棚卸し状況の read に加え、貸出・返却の write。台帳そのもの
（機材の新規登録・編集・削除）は対象外 — EQ コード発番・親子設置場所継承など台帳側の作り込みが
深く、まず現場で頻度の高い「この機材どこ？」「貸し出して」「返ってきた」を通す MVP スコープ。
台帳の登録・編集は引き続き画面から行う。

| ツール | 種別 | 概要 |
|---|---|---|
| `list_equipment` | read | 機材台帳を検索する。search は機材ID (eq_code)・型名・製造番号・機材名の部分一致 |
| `get_equipment` | read | 機材1点の詳細（設置場所・保証期限・貸出履歴・メンテナンス履歴・付属品・親機材） |
| `list_equipment_lendings` | read | 貸出記録を一覧（新しい貸出順）。status=lent/planned/returned 等で絞り込み |
| `list_inventory_checks` | read | 棚卸し（実施回）の一覧 |
| `get_inventory_check` | read | 棚卸し1回分の状況（対象機材ごとの found/実際の設置場所/状態） |
| `lend_equipment` | write | 機材を貸し出す。既に貸出中の機材はエラー。planned_out_date を渡すと出庫予定の行になる |
| `return_equipment` | write | 貸出中の機材を返却する（eq_code/equipment_id で指定。貸出記録 id ではない） |

貸出/返却の権限は HTTP 側 (`equipment.routes.ts`) と同じ: `/lendings` 系の登録・出庫・返却は
`equipment` の editor 以上、削除は manager（`requirePermission`）。MCP 側も他カテゴリの
書き込みツールと揃えて `equipment` の editor 以上を要求する（`gate.ts` 参照）。

## confirm 2段階フロー (重要操作)

`issue_gls`・`change_project_stage` (e_lost)・`renumber_project`（改番・2026年10月の事業再編）・
`create_intercompany_purchase`（社内取引の作成・同）は誤操作防止のため 2段階:

1. `confirm` なし (または false) で実行 → **書き込まず** に `{preview: true, effects: [...], warning}` を返す
2. AI がプレビュー内容をユーザーに提示し、明示的な了承を得る
3. `confirm: true` を付けて再実行 → 実行される

ツールの説明文にも「承認なしの confirm: true は禁止」と明記済み。

## 監査ログ (mcp_audit_log)

全ての書き込みツールは成功時に `mcp_audit_log` テーブルへ記録される (tool_name / 引数 / 結果サマリー / requested_by / 日時)。共用キー運用のため、各書き込みツールの任意引数 `requested_by` (指示者名) を AI が聞き取って渡す設計。記録失敗はツールの成否に影響しない (fire-and-forget)。

確認クエリ例:
```sql
SELECT tool_name, requested_by, result_summary, created_at FROM mcp_audit_log ORDER BY created_at DESC LIMIT 50;
```

## 典型フロー (AI への指示例)

- **メール/議事録の取込起票**: 文面を貼って「起票して」→ AI が `list_customers` → (無ければ `create_customer`) → `create_project` → `create_activity_log` (次回アクション付き)
- **GLS 発番**: 「この案件 GLS 発番して」→ AI がプレビュー提示 → 「OK」→ confirm:true で実行
- **朝のダイジェスト**: `get_sales_funnel` + `list_activity_logs(upcoming:true)` + `list_tasks` で本日のサマリーを生成
- **デイリーニュース報告 (毎朝の定期実行)**: Web 検索で業界ニュース (映像制作/配信/スタジオ/LED/照明/AR-XR 等) を収集 → 各記事を 1 行要約 → `add_ops_report_items(kind=daily_news, period_key=今日)` で投稿。再実行しても URL 重複はスキップされる
- **ウィークリー活動報告**: 通常はアプリの「AI下書きを作る」ボタン（`/daily/weekly`）が起動する。AI エージェントが代行するときだけ: `get_weekly_activity_stats` で先週の集計を取得 → 文章化 → `submit_ops_report(kind=weekly_activity, status=draft, payload={stats})` で投稿 → 人間がアプリでトピック追記・確認・確定

## 動作確認 (curl)

```bash
BASE=https://dev.gmo-onair.jp/api/v1/mcp
KEY=<MCP_API_KEY_DEV>
H=(-H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream")

# initialize
curl -s $BASE "${H[@]}" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'

# ツール一覧
curl -s $BASE "${H[@]}" -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# ツール呼び出し
curl -s $BASE "${H[@]}" -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_projects","arguments":{"limit":3}}}'
```

期待される異常系: 静的キーなし/誤り (かつ OAuth トークンなし) → 401 + `WWW-Authenticate`、GET → 405。

### OAuth ダンス (curl)

```bash
BASE=https://dev.gmo-onair.jp
# 1. メタデータ
curl -s $BASE/.well-known/oauth-authorization-server | jq
# 2. DCR (public client)
curl -s -X POST $BASE/api/v1/mcp/oauth/register -H 'Content-Type: application/json' \
  -d '{"client_name":"test","redirect_uris":["http://localhost:9999/cb"]}' | jq
# 3. /authorize はブラウザで開く (ONAiR ログイン cookie が要るため)。code を受け取る
# 4. /token に code + code_verifier (PKCE) を POST して access_token を得る
# 5. Bearer <access_token> で /api/v1/mcp を叩く
```

## 実装構成

```
server/src/contexts/mcp/
├── index.ts        ルート (/api/v1/mcp、stateless Streamable HTTP、actorContext で actor をリクエストスコープ化)
├── auth.ts         認証 二本立て (静的キー timingSafeEqual / OAuth アクセストークン検証)
├── server.ts       McpServer 構築 + ツール登録
├── helpers.ts      ok/runTool/clampLimit/pagination/audit/preview + actorContext/currentActorId
├── oauth/          OAuth 2.1 認可サーバー (v2.9.194+)
│   ├── routes.ts        well-known メタデータ + /authorize(ONAiRログインゲート)・/token・/register・/revoke
│   ├── provider.ts      OAuthServerProvider (code発行/交換・PKCE・JWT access・refresh・失効)
│   ├── store.ts         DCR クライアントストア (public client / PKCE)
│   ├── context.ts       authorizeContext (ALS で /authorize の ONAiR ユーザーを provider へ渡す)
│   └── token-secret.ts  アクセストークン JWT 署名鍵 (JWT_SECRET 派生の別鍵) + TTL
└── tools/
    ├── projects.tools.ts   projectService を再利用。`renumber_project`（2026年10月の事業再編）は
    │                        entity-resolution.service を再利用
    ├── studio.tools.ts     studio-booking.service を再利用
    ├── finance.tools.ts    monthly-summary.service + list-query を再利用
    ├── richContentSchema.ts メールの中身を「読める形」で受け取る引数 (v4・migration 160)
    ├── production.tools.ts  制作技術支援 22 種 (read 7 / write 15・旧名 `*_qsheet` 5種の
    │                        二重登録 + スケジュール表の枠 CRUD 3種 [2026-08 新設] +
    │                        表そのもの・列の CRUD 6種 [2026-08 追加新設] 込み)。
    │                        `production.access.ts` の `requireProductionActor()` を
    │                        全ツールの先頭で呼び、静的キーを拒否 + OAuth actor を実ユーザーへ解決する
    ├── production.access.ts 制作技術支援ツール専用のゲート (段10・05-mcp.md §3-1)
    ├── equipment.tools.ts   機材管理 7 種 (read 5 / write 2。2026-08 新設)。
    │                        itemService/lendingService/inventoryService を再利用
    ├── gpm.tools.ts         プロジェクト管理 40 種 (read 12 / write 28。2026-08 新設)。
    │                        gpm.service (templateService/projectService/phaseService/
    │                        gpmTaskService/openItemService/memberService) と、
    │                        見積 (estimateService)・議事録 (minutes.service)・
    │                        BOX フォルダ (gpm-box-folder.service) を再利用。
    │                        create 系は ai_outputs に記録し、人の修正差分は
    │                        gpm-ai-feedback.service が update の中で自動記録する
    ├── intercompany.tools.ts 社内取引 (SCS⇄GSS) 1 種 (2026年10月の事業再編で新設)。
    │                        finance/services/intercompany.service を再利用
    ├── keep.tools.ts        隔週キープの定例報告パック 3 種 (read。2026-09 新設)。
    │                        dailyops/services/keep-pack-store.service の getPackForMeeting
    │                        (HTTP の GET /dailyops/keep/pack と同じ入口) を再利用
    └── … (customers / activities / tasks / members / minutes / analytics / users /
           mytasks / pricing / budget / opsreports / eventreports / inview / inbox /
           security-cards / aifeedback)
```

### 権限ゲート (gate.ts)

- **静的 APIキー**はフルアクセス運用鍵として素通り
- **OAuth actor** は書き込みツールごとに対応モジュールの権限が要る（`WRITE_TOOL_PERMISSIONS`）。
  `module` は**配列も受ける**（どれか1つを満たせばよい）—
  v4 で `record_finance_doc` を「`dailyops` か `budget`」にした（HTTP 側と揃えた）。
  2026年10月の事業再編では `renumber_project` を `sales` の manager 水準（HTTP 側の改番ルートと
  同じ）、`create_intercompany_purchase` を `sales` の editor 水準（HTTP 側の社内取引作成ルートと
  同じ）で登録した
- **読み取りツールも OAuth actor には対応モジュールの reader 以上を要求する**
  （`READ_TOOL_PERMISSIONS`）。それまでは読み取りが素通りで、権限ゼロの ONAiR アカウントでも
  OAuth を完走すれば `list_projects` / `list_revenues` / `list_inquiries` / `list_equipment`
  などが読めた（v3.2.2 で `GET /search` に対して塞いだのと同じ形の穴が MCP 側に残っていた）。
  module は各 read の対応 HTTP ルートの requirePermission に揃えてある
  （`list_finance_docs` は書き込みと同じく「`dailyops` か `sales`」のどちらかで通る）
- **意図してゲートなしのままの読み取り**: 個人スコープ（`list_my_tasks` / `list_my_delegations` /
  `get_my_task_summary` / `list_task_intakes` / `get_task_intake` — 「自分のタスクを読む」に
  モジュール権限を要求しない設計）と、担当者名 → users.id の解決に全カテゴリが前提として使う
  `list_users`、取込スキルが実行前に必ず読む契約の `get_ai_feedback_digest`
- ⚠️ **`get_ai_feedback_digest` はツール名では素通りだが、`kind` ごとに権限を見る**
  （2026-09・Codex のセキュリティレビュー P1）。digest の `recent_examples` は
  人の修正の before / after を**そのまま**返し、`activity_intake` ではそれが
  **取引先から届いたメールの本文まるごと**になる。ツール名の表はツールの中身を見ないので、
  `kind` の判定は**ツールの中**（`mcp/tools/aifeedback.tools.ts` の `KIND_PERMISSION`）に置く。
  割り当ては**その kind を書く側のツールと同じモジュール**（読める人＝書ける人）なので、
  取込スキルの実行は壊れない。表に無い kind（個人スコープの `task_intake`、
  社内周知の `ops_news_item`）は今までどおり素通り
- **制作技術支援の read 7種**は従来どおり `production.access.ts` の `requireProductionActor()`
  （静的キーの拒否＋文書ごとのアクセス判定〔作成者／共有先／管理者〕）を全ツールの先頭で呼ぶ。
  加えて `gate.ts` の READ 表でも `qsheet` の reader を要求する（書き込みツールと同じ二重の防御）

- スタジオ予約と月次サマリーのロジックは v2.9.171 でルートから service 層へ抽出済み — UI と MCP が同一コードパスを通る。
- 書き込みツールの actor は `currentActorId()` で解決: OAuth 経由なら実 ONAiR ユーザー id、静的キー経由なら共用 `mcp-claude`。
- OAuth 用テーブル: `mcp_oauth_clients` / `mcp_oauth_codes` (単回使用・10分) / `mcp_oauth_refresh_tokens` (30日・失効可) — migration 125。
