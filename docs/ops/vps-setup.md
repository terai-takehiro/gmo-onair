# GMO ONAiR - CoNoHa VPS デプロイ手順

## 全体の流れ

```
Step 1: CoNoHa VPSを契約・作成
Step 2: VPSに接続して初期設定
Step 3: Docker と Docker Compose をインストール
Step 4: アプリをデプロイ
Step 5: Nginx を設定
Step 6: (任意) ドメイン + SSL 設定
```

所要時間の目安: 約30〜60分

---

## Step 1: CoNoHa VPSを契約・作成

### 1-1. CoNoHa にログイン
- https://manage.conoha.jp にアクセス
- アカウントがなければ新規作成

### 1-2. VPSを追加
- 「サーバー追加」をクリック
- 以下のスペックを選択:

| 項目 | 推奨値 |
|------|--------|
| リージョン | 東京 |
| メモリ | **2GB** (月額 1,848円程度) |
| イメージ | **Ubuntu 24.04** |
| rootパスワード | 安全なパスワードを設定(メモしておく) |
| SSH Key | あれば登録(なくてもOK) |

### 1-3. IPアドレスを確認
- サーバーが作成されたら、一覧画面に表示される**IPアドレス**をメモ
- 例: `163.44.xxx.xxx`

---

## Step 2: VPSに接続して初期設定

### 2-1. SSH接続

**Mac/Linux の場合（ターミナルから）:**
```bash
ssh root@あなたのIPアドレス
```
初回は `yes` と入力して接続を許可。rootパスワードを入力。

**Windowsの場合:**
- PowerShellで同じコマンド、または [Tera Term](https://teratermproject.github.io/) を使用

### 2-2. システムを最新に更新
```bash
apt update && apt upgrade -y
```
途中で質問が出たらEnterでOK。2〜3分かかります。

---

## Step 3: Docker と Docker Compose をインストール

### 3-1. Docker インストール
```bash
curl -fsSL https://get.docker.com | sh
```

### 3-2. Docker を自動起動に設定
```bash
systemctl enable docker
systemctl start docker
```

### 3-3. Docker Compose インストール
```bash
apt install -y docker-compose-plugin
```

### 3-4. インストール確認
```bash
docker --version
docker compose version
```
両方ともバージョンが表示されればOK。

---

## Step 4: アプリをデプロイ

### 4-1. リポジトリをクローン
```bash
cd /opt
git clone https://github.com/terai-takehiro/gmo-onair.git
cd gmo-onair
```

> もしプライベートリポジトリの場合:
> ```bash
> # GitHub Personal Access Token を使う
> git clone https://あなたのトークン@github.com/terai-takehiro/gmo-onair.git
> ```

### 4-2. 環境変数を設定
```bash
cp .env.example .env
nano .env
```

以下のように編集:
```
# PostgreSQL のパスワード（必ず変更！）
DATABASE_URL=postgresql://postgres:ここに安全なパスワード@db:5432/onair_db
DB_PASSWORD=ここに安全なパスワード

# Server
PORT=3000
NODE_ENV=production
```

**保存方法**: `Ctrl + O` → Enter → `Ctrl + X`

> パスワードの例: `gmo-onair-2026-Xk9mP` のような英数字+記号の組み合わせ

### 4-3. Docker Compose で起動
```bash
docker compose up -d --build
```

初回は**5〜10分**かかります（Node.js依存関係のインストール + ビルド）。

### 4-4. 起動確認
```bash
# コンテナの状態を確認
docker compose ps
```

以下のように表示されればOK:
```
NAME              STATUS
gmo-onair-db-1   Up (healthy)
gmo-onair-app-1  Up
```

```bash
# アプリの動作確認
curl http://localhost:3000/health
```

`{"status":"ok","name":"GMO ONAiR API"}` と表示されれば成功！

### トラブルシューティング

**起動しない場合:**
```bash
# ログを確認
docker compose logs app
docker compose logs db
```

**再ビルドしたい場合:**
```bash
docker compose down
docker compose up -d --build
```

---

## Step 5: Nginx を設定

### 5-1. Nginx インストール
```bash
apt install -y nginx
```

### 5-2. 設定ファイルを配置
```bash
cp /opt/gmo-onair/nginx/onair.conf /etc/nginx/sites-available/onair
ln -s /etc/nginx/sites-available/onair /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
```

### 5-3. 設定を確認して再起動
```bash
nginx -t
systemctl restart nginx
```

### 5-4. ブラウザで確認
- `http://あなたのIPアドレス` にアクセス
- GMO ONAiRのダッシュボードが表示されれば完了！

---

## Step 6: (任意) ドメイン + SSL 設定

ドメインがある場合、HTTPS化できます。

### 6-1. DNSを設定
ドメイン管理画面（お名前.com, ムームードメインなど）で:
- **Aレコード**: `onair.あなたのドメイン` → VPSのIPアドレス

DNS反映に最大24時間（通常は数分〜1時間）かかります。

### 6-2. Nginx設定のドメイン名を変更
```bash
nano /etc/nginx/sites-available/onair
```

`server_name _;` の `_` をドメインに変更:
```
server_name onair.あなたのドメイン;
```

### 6-3. SSL証明書を取得 (Let's Encrypt)
```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d onair.あなたのドメイン
```

メールアドレスを聞かれたら入力、利用規約に `Y`、HTTPSリダイレクトを聞かれたら `2` (リダイレクトする)。

### 6-4. 確認
- `https://onair.あなたのドメイン` にアクセス
- 鍵マークが表示され、GMO ONAiRが表示されれば完了！

### 6-5. SSL自動更新の確認
```bash
certbot renew --dry-run
```

---

## 日常運用コマンド

```bash
# アプリの場所に移動
cd /opt/gmo-onair

# ログを見る
docker compose logs -f app      # アプリのログ (Ctrl+Cで終了)
docker compose logs -f db       # DBのログ

# アプリを再起動
docker compose restart app

# コードを更新してデプロイ
git pull origin main
docker compose up -d --build

# アプリを停止
docker compose down

# アプリを停止（DBデータも消す場合 ※注意）
docker compose down -v
```

---

## 将来: Qシートアプリも同じVPSに追加

```bash
cd /opt
git clone https://github.com/terai-takehiro/GMO-Qsheet-Editor.git
cd GMO-Qsheet-Editor
# .env を設定して docker compose up -d
# Nginx に qsheet.example.com の設定を追加
```

---

## 構成図

```
インターネット
    │
    ▼
[CoNoHa VPS]
    │
    ├── Nginx (:80/:443)
    │     └── proxy_pass → localhost:3000
    │
    └── Docker Compose
          ├── app (GMO ONAiR Express + React) :3000
          └── db  (PostgreSQL 16) :5432
                └── Volume: pgdata (永続化)
```
