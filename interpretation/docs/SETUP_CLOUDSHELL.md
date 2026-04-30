# Cloud Shell でセットアップ (Windows / 簡単版)

## このドキュメントは何？

GCP のセットアップを **ブラウザだけで** 完結させる手順です。Windows
ユーザーや「ローカルに gcloud / Terraform を入れたくない」人向け。

> ローカルにツールを入れて作業したい方は `DEPLOYMENT.md` を参照。

---

## なぜ Cloud Shell？

- ブラウザだけで使える (Chrome / Edge / Firefox どれでも OK)
- 必要なツールが**全部最初から入っている**
  (gcloud / terraform / git / openssl / docker / cloud-sql-proxy / python など)
- ログインが済んでいる (Google Console と同じアカウント認証が引き継がれる)
- Windows と Mac で操作の違いがゼロ
- 無料 (5GB のホームディレクトリ + ターミナル)

---

## 手順

### 1. Cloud Shell を開く

1. ブラウザで https://console.cloud.google.com/ を開く
2. 右上の **`>_`** アイコンをクリック (Cloud Shell の起動)
3. 画面下部に黒いターミナルが開く。初回は "承認" を押す
4. 30 秒ほどで `username@cloudshell:~$` のようなプロンプトが出れば準備完了

> 💡 **コツ**: Cloud Shell は 1 時間操作しないと切断されますが、続きから再開できます。途中で休んでも大丈夫。

---

### 2. リポジトリを clone

ターミナルで以下を貼り付けて実行:

```bash
git clone https://github.com/terai-takehiro/gmo-onair.git
cd gmo-onair
git checkout claude/gcp-terraform-setup-VVW2w
```

これで現在の PR #20 の中身が手元に来ます。

---

### 3. プロジェクト ID と請求アカウントを決める

請求アカウント ID を確認:

```bash
gcloud beta billing accounts list
```

`XXXXXX-XXXXXX-XXXXXX` の形式の `ACCOUNT_ID` をコピーしておく。

次に環境変数を設定 (この後の手順で何度も使う):

```bash
export PROJECT_ID=gmo-interp-dev-2604        # ← 自分の好きな ID に置換
export BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX   # ← 上で確認した値
```

> 📝 `PROJECT_ID` のルール: 半角英小文字+数字+ハイフン、6〜30 文字、世界で一意。
> ターミナルが切れるとこの環境変数は消えるので、再開時はもう一度 export し直す。

---

### 4. プロジェクト + tfstate バケット作成

```bash
cd ~/gmo-onair/interpretation
./scripts/bootstrap-gcp.sh
```

このスクリプトは:
- GCP プロジェクトを作る
- 課金アカウントを紐づける
- Terraform の保管庫 (GCS バケット) を作る
- `gcloud` のデフォルトプロジェクトを切り替える

成功すると最後に `[bootstrap] DONE.` と表示されます。

---

### 5. Terraform で全リソースを作成

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars

# Cloud Shell 組み込みエディタで開く (ブラウザ上に編集タブが開く)
cloudshell edit terraform.tfvars
```

エディタで `project_id` の値を自分の `$PROJECT_ID` に書き換えて保存
(右上の "保存" or `Ctrl+S`)。タブを閉じてターミナルに戻る。

```bash
terraform init \
  -backend-config="bucket=${PROJECT_ID}-tfstate" \
  -backend-config="prefix=interpretation/dev"

terraform apply
# 確認画面で yes を入力
# 5〜10 分待つ ☕
```

完了すると `Apply complete!` + outputs 一覧が出る。**outputs を全選択
してメモ帳にコピペしておく** (後で GitHub Variables に登録する値が含まれる)。

---

### 6. シークレット (パスワード等) を投入

```bash
# DB アプリユーザー用パスワードを生成 (32 文字ランダム)
DB_PASSWORD=$(openssl rand -base64 32)
echo "DB_PASSWORD=$DB_PASSWORD"   # 念のため表示 (後で 11 番でも使う)

# Secret Manager に登録 (4 種類)
echo -n "$DB_PASSWORD" | \
  gcloud secrets versions add interp-dev-db-app-password --data-file=-

PG_HOST=$(terraform output -raw cloud_sql_private_ip)
echo -n "postgresql+asyncpg://interpretation_app:${DB_PASSWORD}@${PG_HOST}:5432/interpretation" | \
  gcloud secrets versions add interp-dev-db-url --data-file=-

REDIS_HOST=$(terraform output -raw redis_host)
REDIS_PORT=$(terraform output -raw redis_port)
REDIS_AUTH=$(gcloud redis instances get-auth-string interp-dev-redis \
  --region=asia-northeast1 --format='value(authString)')
echo -n "redis://default:${REDIS_AUTH}@${REDIS_HOST}:${REDIS_PORT}/0" | \
  gcloud secrets versions add interp-dev-redis-url --data-file=-

echo -n "$(openssl rand -hex 32)" | \
  gcloud secrets versions add interp-dev-auth-jwt-secret --data-file=-
```

各コマンド成功で `Created version [1]` のような表示が出ればOK。

---

### 7. Vertex AI のキャッシング無効化 (学習除外)

```bash
cd ~/gmo-onair/interpretation
PROJECT_ID=$PROJECT_ID ./scripts/disable-vertex-cache.sh
```

最後に `[disable-vertex-cache] OK: caching disabled` と出れば成功。

---

### 8. DB マイグレーション + admin ユーザー作成

#### 8-1. Cloud SQL Auth Proxy を起動

新しいターミナルタブを開く (Cloud Shell の `+` ボタン):

```bash
cd ~/gmo-onair/interpretation
SQL_INSTANCE=$(cd terraform && terraform output -raw cloud_sql_connection_name)
cloud-sql-proxy "$SQL_INSTANCE" --port 5432
```

このタブはこのまま開いておく (proxy が動いている状態を維持)。

#### 8-2. マイグレーションと admin 作成 (元のタブで)

```bash
cd ~/gmo-onair/interpretation/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'

DATABASE_URL="postgresql+asyncpg://interpretation_app:${DB_PASSWORD}@127.0.0.1:5432/interpretation" \
  alembic upgrade head

# ↓ admin を作成 (メールとパスワードは自分のものに置換)
DATABASE_URL="postgresql+asyncpg://interpretation_app:${DB_PASSWORD}@127.0.0.1:5432/interpretation" \
BOOTSTRAP_PASSWORD='ここに 8 文字以上の強いパスワード' \
python -m scripts.bootstrap_user \
  --email terai@example.com \
  --display-name "寺井 赳博" \
  --role admin
```

成功したら proxy のタブで `Ctrl+C` を押して終了。

---

### 9. GitHub に Repository Variables を登録 (ブラウザ作業)

Terraform の output をもう一度取り出す:

```bash
cd ~/gmo-onair/interpretation/terraform
echo "GCP_WIF_PROVIDER:           $(terraform output -raw wif_provider_resource)"
echo "GCP_CICD_SERVICE_ACCOUNT:   $(terraform output -raw wif_service_account_email)"
echo "GCP_BACKEND_RUNTIME_SA:     $(terraform output -raw backend_service_account)"
echo "GCP_FRONTEND_RUNTIME_SA:    $(terraform output -raw frontend_service_account)"
echo "PUBLIC_API_BASE_URL:        $(terraform output -raw backend_service_url)"
echo "PUBLIC_WS_BASE_URL:         $(terraform output -raw backend_service_url | sed 's|^https|wss|')"
```

ブラウザで以下を開く:

https://github.com/terai-takehiro/gmo-onair/settings/variables/actions

「**New repository variable**」で 7 個登録:

| Name | Value |
|---|---|
| `GCP_PROJECT_ID` | 自分のプロジェクト ID (例: `gmo-interp-dev-2604`) |
| `GCP_WIF_PROVIDER` | 上の echo の `GCP_WIF_PROVIDER` の値 |
| `GCP_CICD_SERVICE_ACCOUNT` | 同 `GCP_CICD_SERVICE_ACCOUNT` |
| `GCP_BACKEND_RUNTIME_SA` | 同 `GCP_BACKEND_RUNTIME_SA` |
| `GCP_FRONTEND_RUNTIME_SA` | 同 `GCP_FRONTEND_RUNTIME_SA` |
| `PUBLIC_API_BASE_URL` | 同 `PUBLIC_API_BASE_URL` |
| `PUBLIC_WS_BASE_URL` | 同 `PUBLIC_WS_BASE_URL` (`https` → `wss`) |

---

### 10. PR を merge してデプロイ

1. ブラウザで PR #20 (https://github.com/terai-takehiro/gmo-onair/pull/20) を開く
2. 右上の "Ready for review" を押して Draft 解除
3. "Squash and merge" でマージ
4. https://github.com/terai-takehiro/gmo-onair/actions で
   "Interpretation / backend" / "Interpretation / operator-ui" の進行を確認
5. 緑の ✓ になればデプロイ完了 (約 10 分)

---

### 11. 動作確認

#### 11-1. ヘルスチェック

```bash
curl $(cd ~/gmo-onair/interpretation/terraform && terraform output -raw backend_service_url)/health
```

`{"status":"ok","environment":"dev"}` が返れば backend OK。

#### 11-2. 操作画面ログイン

ブラウザで:

```
https://interp-dev-frontend-<hash>-an.a.run.app
```

(URL は Terraform output の `frontend_service_url`)

→ ログイン画面が出る → 8-2 で作った admin アカウントでログイン
→ セッション開始 → マイク許可 → 喋る → 別タブで vMix URL を開いて
   字幕＋音声が出ることを確認

これで完成 🎉

---

## Cloud Shell の制約と対処

| 制約 | 対処 |
|---|---|
| 1 時間操作なしで切断 | 戻ったら再度ターミナルを開けば続きから (環境変数 `$PROJECT_ID` 等は再 export 必要) |
| 12 時間連続使用上限 | 一度ログアウト → 再ログインでリセット |
| ホームディレクトリ 5GB 上限 | 通常の作業では超えない。`du -sh ~` で確認 |
| Web プレビューポート 5 個まで | 今回は不要 |

---

## 困ったとき

| 症状 | 確認すること |
|---|---|
| `gcloud beta billing accounts list` で何も出ない | Console で課金アカウントが作成済みか / 自分が請求管理者か |
| `bootstrap-gcp.sh` が "billing not linked" でエラー | 一度 https://console.cloud.google.com/billing で手動紐づけ |
| `terraform apply` が `403 PERMISSION_DENIED` | API 有効化の伝搬待ち。3〜5 分待って再実行 |
| `cloud-sql-proxy` が "connection refused" | Terraform apply 完了後 5〜10 分はインスタンス起動に時間がかかる |
| GitHub Actions の `Auth` ステップで失敗 | Variables 登録漏れ or WIF Provider の値ミス |

---

## 終わったら片付け (オプション)

検証用に作ったプロジェクトを完全に消したい場合:

```bash
# Cloud Shell で
gcloud projects delete $PROJECT_ID
```

30 日以内ならキャンセル可能。それを過ぎると完全削除。
