# DEPLOYMENT — GCP セットアップとデプロイ手順

Phase 0 のインフラ構築手順。ローカル CLI から GCP プロジェクトを作成し、Terraform でリソースを apply するまでをカバーする。

---

## 0. 前提

- `gcloud` CLI (>= 470.0.0) が認証済み
- `terraform` CLI (>= 1.7.0)
- 利用可能な GCP 請求アカウント (`gcloud beta billing accounts list` で `ACCOUNT_ID` を確認)
- (組織を使う場合) Organization ID

---

## 1. 環境変数の準備

```bash
export PROJECT_ID="gmo-interpretation-dev"
export BILLING_ACCOUNT="XXXXXX-XXXXXX-XXXXXX"
export ORGANIZATION_ID="000000000000"   # 個人アカウントなら省略可
export REGION="asia-northeast1"
```

---

## 2. プロジェクトと tfstate バケットの作成

ブートストラップスクリプトを実行する。これは Terraform が自前で扱えない「プロジェクト作成」「課金紐付け」「state バケット作成」を一括で行う。

```bash
cd interpretation
./scripts/bootstrap-gcp.sh
```

成功すると以下が完了している:

- GCP プロジェクト `${PROJECT_ID}` 作成
- 請求アカウント紐付け
- GCS バケット `gs://${PROJECT_ID}-tfstate`（バージョニング + uniform bucket-level access 有効）
- `gcloud config set project ${PROJECT_ID}`

---

## 3. Terraform 初期化と apply

```bash
cd interpretation/terraform
cp terraform.tfvars.example terraform.tfvars
# terraform.tfvars を編集（project_id, environment などを設定）

terraform init \
  -backend-config="bucket=${PROJECT_ID}-tfstate" \
  -backend-config="prefix=interpretation/dev"

terraform plan
terraform apply
```

Phase 0 で provision されるリソース:

| 種別 | リソース | 用途 |
|---|---|---|
| API | Speech-to-Text V2 / TTS / Vertex AI / Cloud Run / Cloud SQL / Memorystore / Secret Manager / VPC Access ほか | サービス有効化 |
| Network | VPC / Subnet / Serverless VPC Connector / Private Service Access | Cloud Run → Memorystore / Cloud SQL の private 接続 |
| Service Accounts | backend / frontend / cicd | 最小権限で IAM 設定 |
| Secret Manager | DB password / JWT secret / Auth keys 等のコンテナ | 値は手動投入 |
| Memorystore Redis | Pub/Sub fanout 用 1GB BASIC | 言語別ファンアウト |
| Cloud SQL PostgreSQL 16 | セッション履歴 / 用語辞書 / ユーザー | private IP のみ |
| Artifact Registry | Docker repository | コンテナイメージ |
| Cloud Run (placeholder) | backend / frontend | hello world イメージで起動。Phase 1+ で実コンテナに差し替え |

> **注意**: `terraform apply` 中に `db-app-password` シークレットの値が無いと Cloud SQL ユーザー作成が失敗する。先に「4. シークレット投入」を済ませてから apply する、または `cloud_sql.tf` の `google_sql_user.app` を一時コメントアウトして 2 段階で apply する。

---

## 4. シークレット投入

Terraform はシークレットの "コンテナ" だけを作る。値は別途投入する。

```bash
# DB パスワード（強いランダム値を生成）
DB_PASSWORD=$(openssl rand -base64 32)
echo -n "${DB_PASSWORD}" | \
  gcloud secrets versions add interp-dev-db-app-password --data-file=-

# JWT シークレット
echo -n "$(openssl rand -hex 32)" | \
  gcloud secrets versions add interp-dev-auth-jwt-secret --data-file=-

# セッションシークレット
echo -n "$(openssl rand -hex 32)" | \
  gcloud secrets versions add interp-dev-auth-session-secret --data-file=-
```

Supabase Auth を使う場合は `supabase-anon-key` と `supabase-service-key` も投入。使わないなら空のままで OK（参照されない）。

---

## 5. Vertex AI キャッシング無効化

学習除外と同等の保護のため、プロジェクトレベルでキャッシングを切る。

```bash
PROJECT_ID=${PROJECT_ID} ./scripts/disable-vertex-cache.sh
```

レスポンスに `"disableCache": true` が含まれていれば成功。

> このスクリプトは冪等。プロジェクトを作り直したら毎回実行する。

---

## 6. 動作確認 (Phase 0 検証用)

```bash
# Speech-to-Text v2: Recognizer が一覧できるか
gcloud speech recognizers list --location=${REGION}

# Vertex AI: モデル一覧（Gemini 2.5 Flash が使えるリージョン）
gcloud ai models list --region=${REGION}

# TTS: 音声一覧
gcloud beta ml speech voices list --filter="languageCodes:ja-JP"

# Cloud Run のプレースホルダにアクセス
terraform -chdir=terraform output backend_service_url
```

---

## 7. Phase 0 検証タスク（次のステップ）

1. 日本語登壇音声サンプルで STT (Chirp 3) の精度測定
2. Gemini 2.5 Flash の翻訳品質確認（用語辞書あり/なし）
3. Chirp 3 HD と Gemini 3.1 Flash TTS の音質比較（タイ語・ベトナム語）
4. 1 言語パイプラインのレイテンシ実測

これらはローカルからプロトタイプスクリプトを実行する形で進める（Phase 1 以前なので Cloud Run へのデプロイは不要）。

---

## 8. 環境ごとの運用

`environment` 変数で `dev` / `stg` / `prod` を切り替える。それぞれ別プロジェクト推奨。

```bash
# dev
terraform workspace new dev   # または別ディレクトリで管理
terraform apply -var="environment=dev" -var="project_id=gmo-interpretation-dev"

# prod
terraform apply -var="environment=prod" -var="project_id=gmo-interpretation-prod"
```

`prod` では:
- Cloud SQL `availability_type = "REGIONAL"` (HA)
- `deletion_protection = true`
- Memorystore は将来 `STANDARD_HA` 推奨

---

## 9. 破棄

```bash
terraform destroy
```

prod は `deletion_protection` が掛かっているので、先に DB の保護を解除する必要がある。

---

## 10. CI/CD (GitHub Actions)

`.github/workflows/interpretation-backend.yml` と
`.github/workflows/interpretation-operator-ui.yml` が、`interpretation/`
配下の変更を検知して Cloud Run へ自動デプロイする。Workload Identity
Federation 経由なのでサービスアカウントキーは発行不要。

### 10.1 一度だけ行うブートストラップ

1. `terraform apply` 後、以下の Terraform 出力を取得する:

   ```bash
   terraform output -raw wif_provider_resource
   terraform output -raw wif_service_account_email
   terraform output -raw backend_service_account
   terraform output -raw frontend_service_account
   ```

2. GitHub リポジトリの **Settings → Secrets and variables → Actions →
   Variables** に以下を登録 (Repository variables):

   | Variable 名 | 値 |
   |---|---|
   | `GCP_PROJECT_ID` | プロジェクト ID |
   | `GCP_WIF_PROVIDER` | `wif_provider_resource` の値 |
   | `GCP_CICD_SERVICE_ACCOUNT` | `wif_service_account_email` の値 |
   | `GCP_BACKEND_RUNTIME_SA` | `backend_service_account` の値 |
   | `GCP_FRONTEND_RUNTIME_SA` | `frontend_service_account` の値 |
   | `PUBLIC_API_BASE_URL` | バックエンド Cloud Run の公開 URL |
   | `PUBLIC_WS_BASE_URL` | 同上 (`wss://...`) |

3. Secret Manager に runtime シークレットの実値を投入:

   ```bash
   # DATABASE_URL (Cloud SQL private IP は terraform output から取得)
   PG_HOST=$(terraform output -raw cloud_sql_private_ip)
   PG_PASS=$(gcloud secrets versions access latest --secret=interp-dev-db-app-password)
   echo -n "postgresql+asyncpg://interpretation_app:${PG_PASS}@${PG_HOST}:5432/interpretation" \
     | gcloud secrets versions add interp-dev-db-url --data-file=-

   # REDIS_URL
   REDIS_HOST=$(terraform output -raw redis_host)
   REDIS_PORT=$(terraform output -raw redis_port)
   REDIS_AUTH=$(gcloud redis instances get-auth-string interp-dev-redis \
     --region=asia-northeast1 --format='value(authString)')
   echo -n "redis://default:${REDIS_AUTH}@${REDIS_HOST}:${REDIS_PORT}/0" \
     | gcloud secrets versions add interp-dev-redis-url --data-file=-
   ```

### 10.2 デプロイのトリガ

- `dev` ブランチへ push (`interpretation/backend/**` 変更) → dev 環境へデプロイ
- `main` ブランチへ push → prod 環境へデプロイ
- Pull request では lint + typecheck のみ実行 (デプロイなし)
- `workflow_dispatch` で手動実行も可能 (target=dev/prod 選択)

### 10.3 デプロイステップ

backend ワークフローは:

1. `ruff check` + `mypy`
2. `docker build` + Artifact Registry push
3. **Alembic マイグレーション**を Cloud Run Jobs として実行 (`alembic upgrade head`)
4. Cloud Run service に新リビジョンをロールアウト

`operator-ui` ワークフローは Next.js standalone ビルド + Cloud Run デプロイ。

> **注意**: 初回デプロイ時は Cloud Run Job が存在しないので
> `gcloud run jobs deploy` で新規作成、2 回目以降は同コマンドが冪等に
> イメージを更新する (`||` で update へフォールバック)。

---

## 11. トラブルシュート

| 症状 | 原因 | 対処 |
|---|---|---|
| `Error 403: Cloud Resource Manager API has not been used` | プロジェクト作成直後の伝搬遅延 | 数分待って再実行 |
| `google_sql_user.app: ... password is empty` | secret version 未投入 | 「4. シークレット投入」を実施 |
| `private services access already exists` | 別プロジェクトで `psa-range` を使い回している | 既存の peering を確認 |
| `vpc connector ... INVALID_ARGUMENT` | サブネットの CIDR と connector の CIDR が衝突 | `network.tf` の CIDR を変更 |
