# GMO ONAiR — CoNoHa VPS デプロイ手順 (新 VPS 構築版)

> 旧 VPS (133.117.74.239) が継ぎ接ぎで負債化したため、**4GB プランで新規 VPS をゼロから立て直す**ための手順書。
> 既存 VPS は廃棄前提なのでデータ移行は BOX の DB バックアップ経由で行う。

---

## 全体フロー

```
Phase 1: CoNoHa で 4GB VPS を新規契約 + 初回ログイン      …  10 分
Phase 2: 1-bootstrap.sh で OS / Docker / UFW を整備       …   5 分
Phase 3: 2-deploy.sh でアプリ起動 (HTTP のみ)             …  10〜15 分
Phase 4: DNS を新 IP に向ける                              …   5 分 (+ 伝播待ち)
Phase 5: 3-issue-cert.sh で HTTPS 化                       …   3 分
Phase 6: 旧 VPS の DB を BOX バックアップから復元 (任意)   …   5 分
Phase 7: 動作確認 + 旧 VPS 解約                            …
```

全体で **30〜45 分** + DNS 伝播待ち。

---

## 前提

- 旧 VPS の DB が **BOX の `00_DB_Backup/prod/` および `dev/`** に 3 時間ごとに自動退避されている前提
  (v2.7.12+ で導入。旧 VPS が立ち上がる場合は念のため手動で 1 回 backup を流しておく)
- 新 VPS でも BOX 連携を使うため `.env` の `BOX_CONFIG_JSON` は引き継ぎ予定の値を準備しておく

---

## Phase 1: CoNoHa で 4GB VPS を作成

1. https://manage.conoha.jp にログイン → **「サーバー追加」**
2. 以下を選択:

   | 項目 | 値 |
   |---|---|
   | リージョン | **東京** |
   | プラン | **4GB** (4 vCPU / 4GB RAM / SSD 100GB / 月額 約 3,608 円) |
   | イメージ | **Ubuntu 24.04** |
   | root パスワード | 安全な値 (パスワードマネージャに保存) |
   | SSH 鍵 | 用意していれば登録 (任意) |
   | ネームタグ | `gmo-onair-prod-v2` など |

3. 作成完了後、サーバー一覧画面で **公開 IPv4 アドレス** をメモ
4. (任意) CoNoHa スケーリング API を使うなら、コントロールパネル → 「API」→「API ユーザー」で API ユーザーを発行 (`.env` の `CONOHA_*` に書く)

### CoNoHa 側 DNS は **まだ触らない** (Phase 4 で切替)

Phase 3 まで完了させて HTTP で動作確認してから DNS を切り替えると、ダウンタイムが最小化できる。

---

## Phase 2: 初期セットアップ (1-bootstrap.sh)

### 2-1. SSH 接続

```bash
ssh root@<新 VPS の IP>
# 初回は yes、続けて root パスワードを入力
```

### 2-2. bootstrap を実行

リポジトリを clone してからスクリプトを叩く 2 段方式:

```bash
cd /root
apt-get update -qq && apt-get install -y -qq git
git clone https://github.com/terai-takehiro/gmo-onair.git
bash /root/gmo-onair/scripts/vps/1-bootstrap.sh
```

> ⚠ `curl | bash` 方式は監査性が低いので避け、必ず clone 後に内容を確認してから実行する。

スクリプトの中身:

- apt update / upgrade
- Ubuntu ロケール (C.UTF-8 + ja_JP.UTF-8) + タイムゾーン (Asia/Tokyo)
- swap 4GB を `/swapfile` に作成 (`vm.swappiness=10`)
- Docker CE + Compose plugin + buildx を Docker 公式 apt repo からインストール
- `/etc/docker/daemon.json` でログを 20MB × 5 にローテーション
- UFW で 22/80/443 のみ許可 (それ以外は deny)
- fail2ban で SSH を 5 回失敗 → 1 時間 ban
- unattended-upgrades (security のみ自動適用、自動再起動は OFF)

完走すると公開 IP・空き容量・swap 状態を最後に出力する。

---

## Phase 3: アプリ展開 (2-deploy.sh)

```bash
bash /root/gmo-onair/scripts/vps/2-deploy.sh
```

スクリプトの中身:

1. `main` を `/root/gmo-onair` に同期
2. `dev` worktree を `/root/gmo-onair-dev` に展開 (compose の `app_dev.build.context` 用)
3. `.env` が無ければランダム値でテンプレートを生成 (DB_PASSWORD / JWT_SECRET / JWT_SECRET_DEV / ENCRYPTION_KEY)
4. `docker compose build --pull && docker compose up -d`
5. `app_prod` (3000) / `app_dev` (3001) の `/health` が応答するまで待機
6. DB バックアップ cron (`scripts/setup-backup-cron.sh`) を仕込む

完走後、**ブラウザ非依存の HTTP 動作確認**は VPS 上で:

```bash
curl -fsS http://127.0.0.1:3000/health
curl -fsS http://127.0.0.1:3001/health
docker compose -f /root/gmo-onair/docker-compose.yml ps
```

### .env の手動補完

`2-deploy.sh` は秘密値の **構造体** を作るだけ。以下は手動で埋める:

```bash
vim /root/gmo-onair/.env
```

| キー | 用途 | 必須? |
|---|---|---|
| `ADMIN_EMAIL` | 起動時に system_admin が自動作成される | 本番では推奨 |
| `BOX_CONFIG_JSON` | BOX 連携 (フォルダ自動作成 + DB バックアップ) | バックアップ復元したいなら必須 |
| `BOX_PROJECT_PARENT_FOLDER_ID` | 社外案件フォルダ ID | 任意 |
| `BOX_PROJECT_PARENT_FOLDER_ID_INTERNAL` | 社内案件フォルダ ID | 任意 |
| `TWILIO_*` | SMS 2FA | 本番のみ |
| `SMTP_*` | メール送信 | 本番のみ |
| `CONOHA_*` | スケーリング API | 任意 |

書き換えたら反映:

```bash
cd /root/gmo-onair && docker compose up -d
```

---

## Phase 4: DNS 切替

CoNoHa DNS (またはお名前.com 等) で A レコードを **新 VPS の IP** に変更:

```
gmo-onair.jp.       A  <新 IP>   TTL 300
www.gmo-onair.jp.   A  <新 IP>   TTL 300
dev.gmo-onair.jp.   A  <新 IP>   TTL 300
```

伝播確認:

```bash
dig +short A gmo-onair.jp     @1.1.1.1
dig +short A dev.gmo-onair.jp @1.1.1.1
```

新 IP が返るまで通常数分〜1 時間 (TTL を 300 にしておけば早い)。

---

## Phase 5: HTTPS 発行 (3-issue-cert.sh)

DNS が新 IP を返すようになってから:

```bash
bash /root/gmo-onair/scripts/vps/3-issue-cert.sh
```

スクリプトの中身:

1. 公開 IP と各ドメインの DNS 解決結果を照合 (不一致なら警告 + 確認プロンプト)
2. certbot を apt install
3. compose の `nginx` だけ stop して host:80 を空ける
4. `certbot certonly --standalone -d gmo-onair.jp -d www.gmo-onair.jp -d dev.gmo-onair.jp` で 3 ドメイン分の cert を 1 回で発行
5. `docker compose up -d nginx` で復帰
6. cron に毎日 03:00 の `certbot renew --deploy-hook 'nginx -s reload'` を登録

確認:

```bash
curl -sk https://gmo-onair.jp/health
curl -sk https://dev.gmo-onair.jp/health
crontab -l | grep certbot
```

---

## Phase 6: 旧 VPS の DB を BOX バックアップから復元 (任意)

旧データを引き継ぐ場合のみ。新規プロジェクトで始めるなら飛ばす。

### 6-1. .env に BOX_CONFIG_JSON が入っていることを確認

```bash
grep -E '^BOX_CONFIG_JSON=' /root/gmo-onair/.env | head -c 80
# → "BOX_CONFIG_JSON='{\"boxAppSettings\":..." のような長い行が出れば OK
```

### 6-2. 復元対象のバックアップを一覧

```bash
docker exec gmo-onair-app_prod-1 \
  node /app/server/scripts/restore-db-from-box.mjs --list
```

`onair_prod_YYYYMMDD_HHMMSS.sql.gz` 形式のファイル名がリストされる。最新を選ぶ。

### 6-3. 本番 DB を復元 (5 層の安全策つき)

```bash
# -it 必須 (対話確認あり)。"yes" を全文タイプするまで実行されない
docker exec -it gmo-onair-app_prod-1 \
  node /app/server/scripts/restore-db-from-box.mjs onair_prod_20260512_030000.sql.gz
```

実行前に自動スナップショット (`/tmp/before-restore_*.sql.gz`) が取得される。
ファイル名チェックで `prod` ファイル → `prod` DB のみ復元可能 (クロス禁止)。

### 6-4. dev DB も同様に

```bash
docker exec gmo-onair-app_dev-1 \
  node /app/server/scripts/restore-db-from-box.mjs --list
docker exec -it gmo-onair-app_dev-1 \
  node /app/server/scripts/restore-db-from-box.mjs onair_dev_20260512_030000.sql.gz
```

### 6-5. 復元後の整合性確認

```bash
docker exec gmo-onair-db-1 psql -U postgres -d onair_prod \
  -c "SELECT COUNT(*) FROM projects;"
docker exec gmo-onair-db-1 psql -U postgres -d onair_prod \
  -c "SELECT MAX(updated_at) FROM projects;"
```

---

## Phase 7: 動作確認 + 旧 VPS 解約

### 7-1. スモークテスト

| チェック | コマンド |
|---|---|
| 本番 HTTPS | `curl -sk https://gmo-onair.jp/health` |
| 本番ログイン画面 | ブラウザで https://gmo-onair.jp → ログイン画面が出る |
| 検証 HTTPS | `curl -sk https://dev.gmo-onair.jp/health` |
| Socket.IO | Qシート OnAir 画面 → ランダウン画面が同期する |
| 機材画像 | uploads_prod volume にデータがあるか `docker volume ls` |
| BOX 連携 | 案件を 1 件新規作成 → BOX に `_OPP-xxxx` フォルダが生える |
| DB バックアップ | `tail -20 /var/log/gmo-onair-backup.log` で次回 3 時間サイクルが回る |

### 7-2. 旧 VPS の解約

すべて OK なら CoNoHa コントロールパネルで旧 VPS を停止 → 解約。

> ⚠ 解約前に **BOX に最新の DB バックアップが上がっていることを必ず確認**:
> `00_DB_Backup/prod/` の最終更新が新 VPS 起動より新しいか目視確認。

---

## 日常運用コマンド

```bash
# 場所
cd /root/gmo-onair

# 状態確認
docker compose ps
docker compose logs -f app_prod
docker compose logs -f app_dev
docker compose logs -f nginx

# 再起動 (コードはそのまま)
docker compose restart app_prod

# main / dev を最新化して再ビルド
cd /root/gmo-onair && git pull origin main && docker compose up -d --build app_prod
cd /root/gmo-onair-dev && git pull origin dev && docker compose -f /root/gmo-onair/docker-compose.yml up -d --build app_dev

# 完全停止
cd /root/gmo-onair && docker compose down

# DB を psql で覗く
docker exec -it gmo-onair-db-1 psql -U postgres -d onair_prod
```

---

## トラブルシューティング

### app_prod が `unhealthy` のまま

```bash
docker compose logs --tail=200 app_prod
# よくある原因:
#   1) .env の DB_PASSWORD と db コンテナの初期化済パスワードが不一致
#      → pgdata volume を消すしかない: docker compose down && docker volume rm gmo-onair_pgdata
#         (※ DB データは完全消失。必ず BOX 復元の前に行う)
#   2) JWT_SECRET / JWT_SECRET_DEV が未設定
#   3) port 3000 が他プロセスに掴まれている: ss -tlnp | grep 3000
```

### certbot が rate limit に当たった

Let's Encrypt は同一ドメインで 5 回/週の発行上限あり。
`/var/log/letsencrypt/letsencrypt.log` を見て理由を確認。
原則 `--dry-run` で事前テストしてから本発行する。

### DNS を切り替えたのに古い IP に飛ぶ

ブラウザ / OS / 中間 DNS のキャッシュ。
`dig +short @1.1.1.1 gmo-onair.jp` で 1.1.1.1 (Cloudflare) が新 IP を返していれば最終的には反映される。
急ぐ場合は端末側の DNS キャッシュをクリア (Mac: `sudo dscacheutil -flushcache`).

### Docker build で OOM

4GB プランでも npm install + tsc + Vite build が重なると稀に OOM する。
解決策:
- swap が効いているか確認: `free -h`
- それでも落ちるなら build キャッシュをクリア: `docker builder prune -af`
- 最終手段: CoNoHa のリサイズで一時的に 8GB プランに上げてビルドだけ通す

---

## 構成図

```
インターネット
    │
    ▼
[CoNoHa VPS 4GB / 東京]
    │
    ├── UFW: 22/80/443 のみ許可
    ├── fail2ban: SSH ブルートフォース対策
    │
    └── Docker Compose
          ├── nginx       :80 / :443         — Let's Encrypt + リバプロ
          │                                    ├─ gmo-onair.jp     → app_prod:3000
          │                                    └─ dev.gmo-onair.jp → app_dev:3000
          ├── app_prod    127.0.0.1:3000     — 本番 Express + 静的配信
          ├── app_dev     127.0.0.1:3001     — 検証 Express + 静的配信
          └── db          127.0.0.1:5432     — PostgreSQL 16
                ├─ onair_prod
                └─ onair_dev
                └─ volume: pgdata (永続化)

cron (host):
  - 0,30 */3 * * *  DB を pg_dump → BOX `00_DB_Backup/{prod|dev}/`
  - 0 3 * * *       certbot renew --deploy-hook 'nginx -s reload'
```

---

## 関連スクリプト早見表

| スクリプト | 役割 | いつ実行? |
|---|---|---|
| `scripts/vps/1-bootstrap.sh` | OS + Docker + UFW + swap | 新 VPS で一度だけ |
| `scripts/vps/2-deploy.sh` | clone + .env + compose up | bootstrap 後・更新時も再実行可 |
| `scripts/vps/3-issue-cert.sh` | Let's Encrypt 発行 | DNS 切替後に一度だけ |
| `scripts/setup-backup-cron.sh` | DB バックアップ cron | `2-deploy.sh` から自動呼出 |
| `server/scripts/backup-db-to-box.mjs` | pg_dump → BOX | cron から自動 |
| `server/scripts/restore-db-from-box.mjs` | BOX → DB 復元 | 移行時 / 災害復旧時 |
| `deploy/init-db.sh` | DB 初回作成 (prod + dev) | compose の db コンテナ初回起動時に自動実行 |
| `deploy/check-db-encoding.sh` | UTF-8 / C.UTF-8 確認 | 移行直後に 1 度 |
