# リアルタイム多言語同時通訳配信システム

プレスカンファレンス・国際イベント向けに、登壇者の音声をリアルタイムで複数言語に翻訳し、字幕＋合成音声として vMix に取り込み可能なURLを生成するクラウドベースのシステム。

詳細な要件は `docs/REQUIREMENTS.md`、アーキテクチャは `docs/ARCHITECTURE.md` を参照。

---

## ディレクトリ構成

```
interpretation/
├── README.md                # このファイル
├── terraform/               # GCP リソースの IaC (Phase 0)
│   ├── versions.tf          # プロバイダ・Terraform バージョン
│   ├── variables.tf         # 入力変数定義
│   ├── main.tf              # プロバイダ初期化
│   ├── apis.tf              # GCP API 有効化
│   ├── network.tf           # VPC / Serverless VPC Connector
│   ├── iam.tf               # サービスアカウント・IAM
│   ├── secrets.tf           # Secret Manager
│   ├── memorystore.tf       # Redis (Pub/Sub 用)
│   ├── cloud_sql.tf         # PostgreSQL (履歴・用語辞書)
│   ├── cloud_run.tf         # バックエンド・フロントエンドのデプロイ
│   ├── outputs.tf           # 出力値
│   ├── backend.tf           # GCS リモートステート
│   └── terraform.tfvars.example
└── docs/
    ├── REQUIREMENTS.md      # 要件定義書 v1.0
    ├── ARCHITECTURE.md      # アーキテクチャ詳細
    ├── DEPLOYMENT.md        # GCP セットアップ・デプロイ手順
    └── COMPLIANCE.md        # データ処理ポリシー (クライアント説明用)
```

---

## Phase 0: 検証フェーズ

### 目的
技術選定の前提を実機で検証する。本フェーズでは GCP プロジェクトと基盤 IaC を整備し、各 API (Speech-to-Text V2, Vertex AI Gemini, Cloud TTS) を有効化する。

### Phase 0 タスクリスト

- [ ] GCP プロジェクト作成 (手動。`docs/DEPLOYMENT.md` 参照)
- [ ] Terraform リモートステート用 GCS バケット作成
- [ ] Terraform で API 有効化 (Speech-to-Text V2, Vertex AI, TTS, Cloud Run, Memorystore, Cloud SQL, Secret Manager)
- [ ] Vertex AI キャッシング無効化 (cacheConfig API)
- [ ] サービスアカウント・IAM 設定
- [ ] STT (Chirp 3) 日本語登壇音声サンプル精度検証
- [ ] Gemini 2.5 Flash 翻訳品質検証 (用語辞書あり/なし)
- [ ] TTS 音質比較 (Chirp 3 HD vs Gemini 3.1 Flash TTS / 各ターゲット言語)
- [ ] エンドツーエンドレイテンシ実測 (1言語パイプライン)

完了基準: 技術選定が確定し、Phase 1 の見積もりが固まる。

---

## クイックスタート (Phase 0)

詳細は `docs/DEPLOYMENT.md` を参照。

```bash
# 1. GCP プロジェクト作成 (gcloud)
gcloud projects create <PROJECT_ID> --name="GMO Interpretation"
gcloud config set project <PROJECT_ID>
gcloud beta billing projects link <PROJECT_ID> --billing-account=<BILLING_ACCOUNT>

# 2. Terraform ステート用 GCS バケット作成
gsutil mb -l asia-northeast1 gs://<PROJECT_ID>-tfstate
gsutil versioning set on gs://<PROJECT_ID>-tfstate

# 3. Terraform 適用
cd terraform
cp terraform.tfvars.example terraform.tfvars
# terraform.tfvars を編集
terraform init
terraform plan
terraform apply
```

---

## 関連ドキュメント

- 要件定義書: `docs/REQUIREMENTS.md`
- データ処理ポリシー: `docs/COMPLIANCE.md`
- 親プロジェクト (GMO ONAiR) ルートの `CLAUDE.md`
