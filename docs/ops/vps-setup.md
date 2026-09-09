# VPS の構築と運用（本番＋検証の同居）

**最終確認: 2026-09-08（v4.6.10）。** 一次情報は `docker-compose.yml`・`.github/workflows/deploy.yml`・
`nginx/gmo-onair.conf`・`deploy/init-db.sh`・`.env.example`・`scripts/setup-backup-cron.sh`。
デプロイの仕組み（GHCR・キャッシュ・戻し方）は [../deploy-pipeline.md](../deploy-pipeline.md)。

**通常のデプロイは GitHub Actions が行う。VPS で手作業するのは、初回構築・`.env` の更新・障害の調査・DB の復元だけ。**
`git pull` してビルドする運用は無い（worktree は `deploy.yml` が `git checkout --force --detach` で動かすので、手で触った変更は次のデプロイで消える）。

## 1. 前提（リポジトリの外で用意するもの）

以下はリポジトリから裏を取れないので、要点だけ書く。

| 項目 | 内容 |
| --- | --- |
| VPS | CoNoHa VPS 1台（Ubuntu）。本番と検証の両方がこの1台で動く |
| Docker | Docker Engine ＋ Compose プラグイン（`docker compose` が使えること）。checkout のパスは `/root/` 固定（SSH ユーザーは secret `VPS_USER`） |
| DNS | `gmo-onair.jp` / `www.gmo-onair.jp` / `dev.gmo-onair.jp` の A レコードを VPS の IP へ |
| TLS 証明書 | Let's Encrypt。ホスト側の `/etc/letsencrypt/live/gmo-onair.jp/`（本番・検証で同じ証明書）と ACME 用の `/var/www/certbot` を nginx コンテナへ読み取り専用でマウントする |
| GitHub 側 | secrets `VPS_HOST` / `VPS_USER` / `VPS_SSH_KEY`（デプロイ用の SSH 鍵）。設定の全体は [github-repo-settings.md](github-repo-settings.md) |

> ⚠️ 要確認: 証明書の取得・更新（certbot）の手順と、更新後に nginx コンテナへ反映する仕組み（reload の hook）はリポジトリに無い。
> VPS 側に何があるかを確認して、ここに1行足すこと。

## 2. ディレクトリ配置

| 場所 | 中身 |
| --- | --- |
| `/root/gmo-onair` | 本番用の checkout。**`.env` はここだけ**に置く。本番デプロイだけが `git checkout --force --detach <sha>` で動かす |
| `/root/gmo-onair-dev` | 検証用の checkout。検証デプロイだけが動かす。compose ファイルと `nginx/` をここから読むが、`.env` は `--env-file /root/gmo-onair/.env` で本番側を読む |
| `/etc/letsencrypt`・`/var/www/certbot` | ホスト側。nginx コンテナへ `:ro` でマウント |
| `/var/log/gmo-onair-backup.log` | DB バックアップ cron のログ |
| Docker ボリューム（プロジェクト `gmo-onair`） | `pgdata`（PostgreSQL）・`uploads_prod` / `uploads_dev`（アップロード画像）・`rental_scraper_data` / `rental_scraper_prod_data`（スクレイパーのステージング SQLite） |

2つの checkout は**同じ compose プロジェクト名 `gmo-onair`** を使う。これで `db` / `nginx` / ネットワーク / ボリュームを1セットで共有する。
コンテナ名は `gmo-onair-<サービス>-1`。

## 3. 初回構築

```bash
# 1) 本番用 checkout と、検証用の worktree
git clone https://github.com/terai-takehiro/gmo-onair.git /root/gmo-onair
git -C /root/gmo-onair worktree add --detach /root/gmo-onair-dev origin/main

# 2) .env（本番側にだけ置く）
cd /root/gmo-onair && cp .env.example .env && vim .env

# 3) 初回だけ GHCR から手で pull（以降は deploy.yml が一時トークンで行う）
docker login ghcr.io            # read:packages を持つ PAT。終わったら docker logout
docker compose -p gmo-onair pull app_prod app_dev
docker compose -p gmo-onair up -d
docker logout ghcr.io

# 4) DB バックアップ cron（app_prod が起動してから）
sudo bash /root/gmo-onair/scripts/setup-backup-cron.sh
```

- `deploy.yml` が両方の checkout に求めるのは「`origin` を持つ git リポジトリで `fetch` と detached `checkout` ができる」ことだけ。worktree でも別 clone でも動く。
- `db` の初回起動時に `deploy/init-db.sh` が `onair_prod` と `onair_dev` を UTF-8（`C.UTF-8`）で作る。**`pgdata` が既にあるクラスタでは走らない**ので、そのときは `psql` で同じ2つを作る。
- スキーマは作らなくてよい。アプリが起動時に `server/src/shared/db/migrations/` を順に流す（`_migrations` に記録。前方向のみ）。
- GHCR の `:dev` / `:prod` タグは、それぞれ一度 `main` へのマージ・Release の公開が走った後に存在する。無ければ `docker compose -p gmo-onair build app_prod` でその場でビルドできる（`app_dev` の `build.context` は `/root/gmo-onair-dev` 固定）。
- `up -d` は `rental_scraper_dev` / `rental_scraper_prod` を `rental-scraper/` からその場でビルドする（GHCR には積んでいない）。

> ⚠️ 要確認: 実際の VPS が worktree なのか別 clone なのか、初回にどの順で起動したか（証明書が無い状態では nginx が起動しない）はリポジトリに記録が無い。

### `.env` の項目（値は書かない）

`.env.example` が項目名と作り方（`openssl rand -hex 32` など）を持つ。**`docker-compose.yml` の `environment:` は許可リスト**なので、
そこに無い変数は `.env` に書いてもコンテナに届かない（`scripts/check-env-passthrough.mjs` が `npm run lint` で照合する）。

| 区分 | 項目 | 効き方 |
| --- | --- | --- |
| 無いと起動しない | `DB_PASSWORD` `JWT_SECRET`（32文字以上）`JWT_SECRET_DEV` | `JWT_SECRET_DEV` は compose の `:?` で必須。本番と検証で別の値にする |
| 本番で実質必須 | `ENCRYPTION_KEY`（64桁 hex）`ADMIN_EMAIL` | 前者は無いと暗号化を使う機能（カレンダー連携のトークン等）が本番でエラーになる。後者は本番起動時に `system_admin` を作る（`SKIP_SEED=true` のため他のシードは走らない） |
| バックアップに必要 | `BOX_CONFIG_JSON` `BOX_PROJECT_PARENT_FOLDER_ID_INTERNAL` | [db-backup-restore.md](db-backup-restore.md) |
| 任意 | SMTP / Twilio / CoNoHa API / BOX の各フォルダ / MCP / AI モデル / Google・Microsoft カレンダー / Slack / `RENTAL_CRON_HOUR` `RENTAL_CRON_HOUR_PROD` / `DB_POOL_MAX` 等 | `.env.example` と `docker-compose.yml` のコメントが正 |
| 検証だけ変える | `*_DEV`（`MCP_API_KEY_DEV` `OPENAI_API_KEY_DEV` `BOX_*_DEV` など） | 無ければ本番の値に落ちるもの（`${X_DEV:-${X:-}}`）と、落ちないもの（`MCP_API_KEY_DEV` `QSHEET_AI_REVIEW_OWNER_USER_ID_DEV` `JWT_SECRET_DEV`）がある。`docker-compose.yml` の `app_dev` を見る |

`.env` を書き換えたら `up -d <サービス>` で入れ直す（`restart` では反映されない。環境変数はコンテナ作成時に固定される）。

## 4. compose のサービス

| サービス | イメージ | ポート（ホスト→コンテナ） | DB | 主な環境変数 | ボリューム |
| --- | --- | --- | --- | --- | --- |
| `db` | `postgres:16-alpine` | `127.0.0.1:5432→5432` | — | `POSTGRES_PASSWORD=${DB_PASSWORD}`・`POSTGRES_INITDB_ARGS=--encoding=UTF8 --locale=C.UTF-8` | `pgdata`、`./deploy/init-db.sh` |
| `app_prod` | `ghcr.io/terai-takehiro/gmo-onair:prod`（`APP_IMAGE_PROD` で差し替え可） | `127.0.0.1:3000→3000` | `onair_prod` | `NODE_ENV=production`・`SKIP_SEED=true`・`CLIENT_URL=https://gmo-onair.jp`・`ALLOWED_ORIGINS`（www と interactive を含む）・`COOKIE_DOMAIN=.gmo-onair.jp` | `uploads_prod:/app/uploads` |
| `app_dev` | `…:dev`（`APP_IMAGE_DEV`） | `127.0.0.1:3001→3000` | `onair_dev` | `NODE_ENV=development`・`AUTH_MODE=password`・`SKIP_RENTAL_SEED=true`・`CLIENT_URL=https://dev.gmo-onair.jp` | `uploads_dev:/app/uploads` |
| `rental_scraper_dev` | `./rental-scraper` をその場でビルド | なし | `onair_dev` | `RENTAL_RUN_ON_STARTUP=true`・`RENTAL_CRON_HOUR`（既定 5）・`RENTAL_SQLITE_PATH=/data/rental_items.db` | `rental_scraper_data:/data` |
| `rental_scraper_prod` | 同上 | なし | `onair_prod` | `RENTAL_CRON_HOUR_PROD`（既定 4。検証とわざとずらす） | `rental_scraper_prod_data:/data` |
| `nginx` | `nginx:alpine` | `80→80` `443→443` | — | — | `./nginx/gmo-onair.conf`→`/etc/nginx/conf.d/default.conf`、`/etc/letsencrypt`、`/var/www/certbot`（すべて `:ro`） |

- `db` は本番・検証・スクレイパー2本で共有する。接続プールは `DB_POOL_MAX`（既定 20）/ `DB_CONNECTION_TIMEOUT_MS`（10秒）/ `DB_STATEMENT_TIMEOUT_MS`（60秒）で外から絞れる（`server/src/shared/db/connection.ts`）。
- `app_dev` はシードデータ（`SKIP_SEED` 未設定）を起動時に入れる。レンタル機材のダミーだけは `SKIP_RENTAL_SEED=true` で止め、スクレイパーの実データを見る。
- `app_dev` は `AUTH_MODE=password`（本番と同じ Email/Password 認証）。

> ⚠️ 要確認: ルート `CLAUDE.md` の環境分離ポリシーは検証の認証を「mockAuth（ユーザーカード選択式）」と書いているが、`docker-compose.yml` の `app_dev` は `AUTH_MODE: password`。`mock` になるのは `AUTH_MODE` 未指定のローカル開発だけ（`server/src/config.ts`）。

## 5. nginx

`nginx/` には3ファイルあるが、**使われているのは `gmo-onair.conf` だけ**（`docker-compose.yml` が `conf.d/default.conf` にマウント）。

| ファイル | 状態 |
| --- | --- |
| `gmo-onair.conf` | **現役。** 80 番は ACME チャレンジ（`/.well-known/acme-challenge/` → `/var/www/certbot`）以外を 301 で https へ。443 番は `gmo-onair.jp` / `www` → `app_prod:3000`、`dev.gmo-onair.jp` → `app_dev:3000`（Docker の内部 DNS `127.0.0.11` で名前解決。コンテナ内ポートはどちらも 3000） |
| `dev.conf`・`onair.conf` | どこからも参照されていない（compose・deploy.yml とも）。単一アプリを `127.0.0.1:3001` / `app:3000` に流していた頃のもの |

> ⚠️ 要確認: `nginx/dev.conf` と `nginx/onair.conf` は未使用。消してよいかは人の判断。

`gmo-onair.conf` の決めごと（変えるときは理由をファイルのコメントで読む）:

| 項目 | 値 |
| --- | --- |
| レート制限 | `/api/` に `30r/s`・`burst=50`。超過は **429**（`limit_req_status`。上流が落ちたときの 503 と区別するため） |
| タイムアウト | `/api/` は `proxy_read_timeout 65s`（アプリの `statement_timeout` 60秒より少し長くして、アプリが自分で時間切れを返せるようにする） |
| Socket.IO | `/socket.io/` は Upgrade を通し 86400 秒 |
| 検索避け | 本番・検証とも `X-Robots-Tag: noindex…` と `robots.txt` で `Disallow: /` |
| 本番だけ | HSTS。検証だけ `X-Environment: development` ヘッダー |
| 上限 | `client_max_body_size 50M` |

**設定変更の反映は検証デプロイでしか起きない**（`deploy.yml` の staging ジョブが checkout 前後の `nginx/*.conf` の md5 を比べ、変わったときだけ nginx を作り直す。production ジョブは nginx に触らない）。
本番に効かせたい nginx の変更は `main` にマージするだけでよい。手で作り直すときは `docker compose -p gmo-onair up -d --no-deps --force-recreate nginx`。どの checkout の `nginx/gmo-onair.conf` がマウントされるかは使った compose ファイル（`-f`）で決まり、デプロイは検証側（`/root/gmo-onair-dev`）のものを使っている。

証明書は ホスト側 `/etc/letsencrypt` を読むだけなので、更新後は `docker compose -p gmo-onair exec nginx nginx -s reload` で読み直す。

## 6. 日常運用

`/root/gmo-onair` で実行する前提（compose がそこの `.env` を読む）。検証側のサービスも同じプロジェクトなので、ここから `app_dev` を指定できる。

| やりたいこと | コマンド |
| --- | --- |
| 稼働確認 | `curl -sk https://gmo-onair.jp/health`・`curl -sk https://dev.gmo-onair.jp/health`（VPS 上なら `curl -s http://localhost:3000/health` / `:3001`）。`{"status":"ok",…}` が返る |
| いま出ている版 | `cd /root/gmo-onair && git log --oneline -1`（本番）・`cd /root/gmo-onair-dev && git log --oneline -1`（検証）。**detached HEAD が正常**。本番の版は GitHub の Releases の一番上とも一致する |
| コンテナの状態 | `docker compose -p gmo-onair ps` |
| ログ | `docker compose -p gmo-onair logs -f app_prod`（`app_dev` / `nginx` / `db` / `rental_scraper_prod` も同じ） |
| 再起動 | `docker compose -p gmo-onair restart app_prod` |
| `.env` を変えた後 | `docker compose -p gmo-onair up -d app_prod`（検証は `docker compose -p gmo-onair --env-file /root/gmo-onair/.env -f /root/gmo-onair-dev/docker-compose.yml up -d app_dev`） |
| DB に入る | `docker compose -p gmo-onair exec db psql -U postgres -d onair_prod`（検証は `onair_dev`） |
| 特定のイメージに戻す | [../deploy-pipeline.md の「戻し方」](../deploy-pipeline.md#6-戻し方ロールバック)。**DB を伴う変更は同時に DB も戻す** |
| 検証を現行に戻す（Preview の後） | Actions → Deploy → Run workflow → `main` / `staging` |
| 502 のとき | Deploy ジョブのログ末尾に nginx / `app_dev` の診断（ps・ログ・名前解決・`/health`）が全部出る。まずそこを見る |

やってはいけないこと:

- `docker compose down -v`（`pgdata` ごと消える。本番と検証の DB は同じボリューム）
- checkout を手で `git pull` / 編集する（次のデプロイの `checkout --force` で消える。直すなら PR）
- `.env` を `/root/gmo-onair-dev` に別に置く（検証の compose は本番側の `.env` を読む決めごと。2つあると片方が古くなる）

## 7. バックアップとスクレイパー

| 仕組み | 要点 | 詳細 |
| --- | --- | --- |
| DB バックアップ | ホストの cron が3時間ごとに `docker exec` で `app_prod` / `app_dev` の中の `backup-db-to-box.mjs` を回し、BOX へ上げる。登録は `sudo bash /root/gmo-onair/scripts/setup-backup-cron.sh`（本番 `0 */3`・検証 `30 */3`） | [db-backup-restore.md](db-backup-restore.md) |
| レンタル機材スクレイパー | `rental_scraper_dev` / `rental_scraper_prod` が常駐し、起動直後と毎日 1回（検証 5時・本番 4時）クロールして `qsheet_rental_items` へ同期する。デプロイのたびに VPS 上でビルドされ、落ちてもアプリのデプロイは成功扱い（Actions の warning に出る） | [../../rental-scraper/README.md](../../rental-scraper/README.md) |

## 関連

- [../deploy-pipeline.md](../deploy-pipeline.md) — デプロイの中身（ジョブ・タグ・キャッシュ・戻し方）
- [../branching.md](../branching.md) — PR・リリースの手順
- [github-repo-settings.md](github-repo-settings.md) — GitHub 側の設定（secrets・環境・分岐保護）
- [../guide/environments.md](../guide/environments.md) — 本番と検証の違い（エンジニアでない人向け）
