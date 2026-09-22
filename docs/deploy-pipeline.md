# デプロイパイプライン — いまの仕組み

**最終確認: 2026-09-08（v4.6.10）。** 一次情報は `.github/workflows/{ci,deploy,preview}.yml`・`Dockerfile`・
`.dockerignore`・`docker-compose.yml`。手順（PR・リリースの出し方）は [branching.md](branching.md)、
VPS 側の構成と日常運用は [ops/vps-setup.md](ops/vps-setup.md)。

## 1. 入口は3つ＋プレビュー

ビルドは GitHub Actions が行い、イメージを GHCR（`ghcr.io/terai-takehiro/gmo-onair`）に push する。
VPS は pull してコンテナを差し替えるだけで、**VPS 上ではビルドしない**。

| 入口 | 何が起きるか | 出る先 | イメージのタグ |
| --- | --- | --- | --- |
| `main` に push（＝PR のマージ） | `Deploy` が自動で走る | 検証 `https://dev.gmo-onair.jp` | `:dev` `:sha-<sha>` |
| GitHub で Release を**公開**（タグ `vX.Y.Z`） | `Deploy` が自動で走る | 本番 `https://gmo-onair.jp` | `:prod` `:vX.Y.Z` `:sha-<sha>` |
| Actions → Deploy → Run workflow（`target` = `staging` / `production`） | 手動。**実行時に選んだブランチ／タグのコミット**が出る | 選んだ先 | 上と同じ（`:vX.Y.Z` は付かない） |
| Actions → Preview → Run workflow（`ref` を入力） | 検証環境だけに任意のコミットを出す。**検査を通さない・worktree を動かさない** | 検証のみ（本番には出せない） | `:dev` `:sha-<sha>` |

```
main へのマージ ──┐                       ┌─ staging    → VPS: /root/gmo-onair-dev → app_dev
Release の公開 ───┼─ meta ─ ci(checks/build) ─┤
Run workflow ────┘         ↑ ここで止まれば   └─ production → VPS: /root/gmo-onair     → app_prod
                              デプロイは走らない
Preview ─────────── ビルドして :dev を上書き ──── VPS: app_dev だけ作り直す（検査なし）
```

- 本番に出るのは Release を公開したときだけ。**Claude が自分の判断で公開しない**（[CLAUDE.md](../CLAUDE.md) の環境分離ポリシー）。
- タグを push しただけでは動かない（`release: types: [published]` でしか発火しない）。
- `production` 環境に Required reviewers を設定してあれば、Release を公開しても承認待ちで一度止まる（[ops/github-repo-settings.md](ops/github-repo-settings.md)）。
- Preview で出した検証環境は、次に `main` へマージがあれば自然に現行へ戻る（`:dev` が上書きされるため）。戻し方の詳細は [branching.md の「昔の版を検証環境で見る」](branching.md#昔の版を検証環境で見る)。

## 2. ジョブの流れ（deploy.yml）

| ジョブ | 役割 |
| --- | --- |
| `meta` | どこへ（`staging` / `production`）・どのタグを付けて（`dev` / `prod`・Release のときだけ `vX.Y.Z`）・どのコミットを出すかを1か所で決める |
| `ci` | `ci.yml` を `workflow_call` で呼ぶ。**PR で走る検査と完全に同じもの**。`push_image: true` でイメージを GHCR へ push する |
| `staging` / `production` | `needs: [meta, ci]`。VPS へ SSH して pull → 再作成。`ci` が落ちると動かない |

### ci.yml の中身

| ジョブ | やること |
| --- | --- |
| `checks` | `npm ci` → `npm run typecheck:all` → `npm run lint` → `npm test` → `check-collab-parity.mjs` → `npm run check:version` → `npm run check:ui-tokens` → `npm audit --omit=dev --audit-level=high` → `rental-scraper/` の Python 単体テストと `import scheduler` |
| `build` | `docker/build-push-action` で Dockerfile をビルド。PR では `push: false`（本番と同じ経路が通るかだけ見る）。キャッシュは `type=gha`、**書き戻し（`cache-to`）は push するときだけ**（PR のビルドで書き戻すと `main` のキャッシュを押し出す） |

ジョブ名 `checks` / `build` は分岐保護の必須チェック名そのもの。変えるときは
[ops/github-repo-settings.md](ops/github-repo-settings.md) の「変えたときの注意」。

### 排他

- ワークフロー全体: `deploy-<ref>-<target>` で `cancel-in-progress: true`。同じブランチから検証と本番を続けて出しても、一方が他方を止めない（先に本番が検証を打ち切った事故の再発防止）。
- 環境ごと: `deploy-staging` / `deploy-production` で `cancel-in-progress: false`。走っているデプロイは完走する。Preview も `deploy-staging` を使うので、プレビュー中に `main` のデプロイが割り込まず順番待ちになる。

### VPS 上で実行される手順

`staging` と `production` は同じ形で、対象の worktree・サービス名・nginx の扱いだけが違う。

| 手順 | staging（`/root/gmo-onair-dev`） | production（`/root/gmo-onair`） |
| --- | --- | --- |
| 1. checkout | `git fetch origin --prune --tags --force` → `git checkout --force --detach <sha>`。**ブランチではなくコミットを直接指す**（タグからでもブランチからでも同じ1行） | 同じ |
| 2. compose の指定 | `docker compose -p gmo-onair --env-file /root/gmo-onair/.env -f /root/gmo-onair-dev/docker-compose.yml` | `docker compose -p gmo-onair -f /root/gmo-onair/docker-compose.yml` |
| 3. pull | `docker login ghcr.io`（ジョブの一時 `GITHUB_TOKEN`）→ `pull app_dev`。**失敗したときだけ** `build --no-cache app_dev`（VPS 上ビルドにフォールバック） | 同じ（`app_prod`） |
| 4. 再作成 | `up -d --no-deps --force-recreate app_dev` | 同じ（`app_prod`） |
| 5. nginx | checkout の前後で `nginx/*.conf` の md5 を比べ、**変わったときだけ** `up -d --no-deps --force-recreate nginx` | **触らない**。nginx は検証デプロイ側で最新化する（本番側で古いタグの設定を強制すると `main` にしかない変更が消える） |
| 6. スクレイパー | `build rental_scraper_dev` → `up -d --no-deps rental_scraper_dev`。GHCR には積まず VPS 上でビルド。失敗しても `::warning` を出すだけでジョブは落とさない | 同じ（`rental_scraper_prod`） |
| 7. 後片付け | `docker logout ghcr.io` → `docker image prune -f` | 同じ |
| 8. 診断 | `compose ps`・各コンテナのログ・ネットワークと名前解決・`/health`（コンテナ内→nginx 経由→外から `https://dev.gmo-onair.jp/health`）。スクレイパーは `docker inspect` で `running` かつ再起動 0 回かまで見る | ログ・`curl -sf http://localhost:3000/health`・`compose ps`・スクレイパーの生存確認 |

nginx の設定変更を本番に効かせたいときは、`main` にマージして検証デプロイを回す（そこで nginx が作り直される。nginx コンテナは本番・検証の両方を1つで捌いている）。

## 3. イメージとタグ

| タグ | いつ付くか | 用途 |
| --- | --- | --- |
| `:sha-<full commit hash>` | GHCR へ push するビルド全部 | ロールバック時の差し替え元 |
| `:dev` / `:prod` | `meta` が決めた配信チャネル | `docker-compose.yml` の `image:` 既定値 |
| `:vX.Y.Z` | Release 経由のときだけ | 「本番に何が出たか」の記録 |

**`:dev` / `:prod` は配信チャネル名で、ブランチ名ではない。** `dev` ブランチは v4 で廃止した（[branching.md](branching.md)）。
`docker-compose.yml` は `image: ${APP_IMAGE_PROD:-…:prod}` / `${APP_IMAGE_DEV:-…:dev}` で受け、`build:` はローカル開発と GHCR 障害時のフォールバック用に残してある。

`sha-*` タグは GHCR に溜まり続ける。掃除の仕組み（retention ポリシー・定期削除のワークフロー）は**無い**。

## 4. VPS 上の配置

| 場所 | 中身 |
| --- | --- |
| `/root/gmo-onair` | 本番用 worktree。本番デプロイだけが触る。**`.env` はここだけ**（検証の compose も `--env-file` でここを読む） |
| `/root/gmo-onair-dev` | 検証用 worktree。検証デプロイだけが触る |
| compose プロジェクト `gmo-onair` | 両方の worktree が同じプロジェクト名を使い、`db` / `nginx` / ネットワーク / ボリュームを1セットで共有する |

| サービス | イメージ | ポート（ホスト→コンテナ） | 役割 |
| --- | --- | --- | --- |
| `db` | `postgres:16-alpine` | `127.0.0.1:5432` | 1つのインスタンスを DB 名（`onair_prod` / `onair_dev`）で分ける |
| `app_prod` | GHCR `:prod` | `127.0.0.1:3000→3000` | 本番。`NODE_ENV=production`・`SKIP_SEED=true` |
| `app_dev` | GHCR `:dev` | `127.0.0.1:3001→3000` | 検証。`NODE_ENV=development`・`AUTH_MODE=password`・`SKIP_RENTAL_SEED=true` |
| `rental_scraper_dev` / `rental_scraper_prod` | VPS 上で `rental-scraper/` をビルド | なし | レンタル機材のクロール（[rental-scraper/README.md](../rental-scraper/README.md)） |
| `nginx` | `nginx:alpine` | `80` `443` | `nginx/gmo-onair.conf` 1枚で本番・検証両方の `server_name` を捌く |

コンテナ名は `gmo-onair-<サービス>-1`（例: `gmo-onair-app_prod-1`）。詳細は [ops/vps-setup.md](ops/vps-setup.md)。

## 5. ビルドキャッシュの設計（Dockerfile）

```
manifests  package.json ×10 + package-lock.json + vendor/ を COPY し、version を 0.0.0-build に潰す
   ↓ COPY --from=manifests（キャッシュキーはコピー元の内容）
deps       npm ci --workspaces --include-workspace-root（依存が変わらない限りキャッシュヒット）
   ↓
build-client / build-client-equipment / build-client-techops / build-client-live / build-client-daily / build-client-wiki / build-server
           （BuildKit が並列実行。変更のないワークスペースはステージごとスキップ）
   ↓
production node:20-alpine + postgresql16-client。server の dist・migrations・scripts・fonts と各 client の dist だけを集約
```

| 決めごと | 理由（1〜2文） |
| --- | --- |
| `manifests` ステージで `version` を固定値に正規化してから `deps` に渡す | ルート `package.json` の版はリリースごとに上がる。素直に COPY すると依存が1つも変わらなくても `npm ci` のレイヤーが毎回捨てられる。`COPY --from` のキャッシュキーは**コピー元の内容**で決まるので、正規化後が同じなら `deps` 以降が生きる |
| **版を上げるのはルート `package.json` だけ**（`npm run check:version` もルートしか見ない） | `vite.config.ts` がルートの版を `__APP_VERSION__` に埋めるので `build-client` だけが作り直される（表示が変わるので正しい）。`shared/package.json` を触ると `COPY shared/` を持つ**全 build ステージ**が、各クライアントのものを触るとそのステージがキャッシュから外れる。server は自身の版を読まない（`/health` の `version` は `npm_package_version` 由来で、`node server/dist/index.js` 起動では `unknown`） |
| `deps` は `npm install` ではなく `npm ci` | lockfile の解決結果をそのまま入れる。lockfile と `package.json` が食い違っていたらその場で落ちる（`install` は黙って lockfile を書き換えて進むため、イメージの中身が lockfile と違う状態でデプロイされ得た） |
| 型チェックは CI の `checks`（`typecheck:all`）で `build` と**並走**させ、さらに各クライアントの `build`（`tsc -b && vite build`）にも残している | クライアントの tsconfig は `noEmit` なので `tsc -b` はイメージの中身を変えず時間だけ伸ばす（約50秒）。それでもイメージ側にも残すのは、CI の配線がずれても型エラーのまま焼き上がらないようにするため（Dockerfile 冒頭に理由）。`server` の `tsc` は `dist` を出す本体なのでビルドの中に要る |
| `.dockerignore` は `docs` `scripts` `*.md` を除外し、ビルド中に読むものだけ再包含する | `client` の prebuild が `CLAUDE.md`・`docs/version-history.md`・`scripts/generate-*.mjs`・`server/src/contexts/mcp/{tools/,gate.ts}` を、`server` の prebuild が `scripts/check-collab-parity.mjs` を読む。**再包含だけでは足りず、Dockerfile の該当ステージにも `COPY` が要る**（無いと `MODULE_NOT_FOUND` / `ENOENT` で落ちる） |

GHA のキャッシュはリポジトリあたり 10GB（LRU）。押し出されたときはフルビルドになるだけで動作には影響しない。
`client-awards` は廃止（2026-09-06）のためビルドステージが無い。`package.json` はワークスペースとして残っているので `manifests` には入っている。

## 6. 戻し方（ロールバック）

### コードだけ戻す（DB を触らないリリースのとき）

| 方法 | 手順 | 向き |
| --- | --- | --- |
| タグの Deploy を再実行（推奨） | Actions → Deploy → Run workflow → Branch/tag に **1つ前の `vX.Y.Z`** を選び `target: production`。または Releases の該当タグの Deploy 実行を Re-run | git 履歴・イメージ・VPS の checkout が全部そのタグで揃う |
| イメージだけ差し替える（急ぎ） | VPS で `APP_IMAGE_PROD=ghcr.io/terai-takehiro/gmo-onair:sha-<旧コミット> docker compose -p gmo-onair -f /root/gmo-onair/docker-compose.yml up -d --no-deps --force-recreate app_prod`（`/root/gmo-onair` で実行。検証は `APP_IMAGE_DEV` と `--env-file /root/gmo-onair/.env -f /root/gmo-onair-dev/docker-compose.yml`） | イメージだけが古くなり、VPS の checkout とはずれる。恒久的に戻すなら上を使う |

### ⚠️ DB を伴う変更は、コードだけ戻しても動かない

`deploy.yml` は**マイグレーションの逆再生も DB のリストアもしない**。マイグレーションは
`_migrations` テーブルに実行済みとして記録され前方向にしか進まない（`server/src/shared/db/migrate.ts`）。
そのため上の2つの方法はどちらも**コード（イメージ・checkout）しか戻さない**。

| 境目 | 何が起きるか |
| --- | --- |
| v4.1.5（migration `200_customer_fk_to_companies.sql`）以降 → それより前のタグへ | `customer_id` の値そのものが `companies.id` に書き換わっている。古いコードは `customers.id` を期待するので、顧客名が消える・案件作成が壊れる |
| Phase 3-3（migration 206〜208。`208_drop_customers_vendors_tables.sql`）以降 → それより前のタグへ | `customers` / `vendors` テーブル自体が無く、`206_drop_untracked_drift_tables.sql` で消した23の未追跡テーブルも無い（[reviews/db-drift-audit.md](reviews/db-drift-audit.md)）。古いコードがクエリした瞬間に `relation "customers" does not exist` で落ちる |

**これらの境目をまたいで戻すときは、コードを戻すのと同時に DB もその時点のバックアップまで復元する**
（[ops/db-backup-restore.md](ops/db-backup-restore.md)。3時間ごとの自動バックアップ）。コードだけ・DB だけのどちらも単独では正しい状態にならない。
境目より新しいタグ同士の行き来なら、コードだけ戻してよい。一般に、戻したい先の版より後に migration が入っているかを `server/src/shared/db/migrations/` で見てから決める。
古いコードを新しいスキーマの上で動かすと、起動は通っても**古いコードで保存した行は新しい列の値が落ちる**（検証で Preview を使うときも同じ）。

## 7. 認証・フォールバック・ローカル・追加時

| 項目 | 内容 |
| --- | --- |
| GHCR への push | `ci.yml` の `build` ジョブが `GITHUB_TOKEN`（`packages: write`）で行う。追加の secret は不要 |
| GHCR からの pull | deploy ジョブが SSH の環境変数で一時 `GITHUB_TOKEN`（`packages: read`）を渡して `docker login`、終わったら `docker logout`。**VPS に永続的な認証情報は置かない** |
| SSH | secrets `VPS_HOST` / `VPS_USER` / `VPS_SSH_KEY`（[ops/github-repo-settings.md](ops/github-repo-settings.md)） |
| GHCR 障害時 | `compose pull` が失敗すると同じジョブの中で `compose build --no-cache app_xxx`（VPS 上ビルド）に落ちる。`app_dev` の `build.context` は `/root/gmo-onair-dev` 固定 |
| ローカルの compose | `image:` と `build:` を併記しているので `docker compose build` / `up --build` はそのまま動く（ビルド結果がその image 名でタグ付けされる）。`JWT_SECRET_DEV` は `:?` で必須なので `.env` に無いと compose の読み込み自体が止まる |
| ワークスペース（`client-xxx`）を足すとき | `Dockerfile` の3か所を触る: ① `manifests` の `COPY client-xxx/package.json` と正規化リスト `W` ② `build-client-xxx` ステージ ③ `production` の `COPY --from=build-client-xxx`。あわせてルート `package.json` の `workspaces` と `typecheck:all` / `build:all` |
| prebuild にスクリプトを足すとき | `.dockerignore` の `!scripts/…` 再包含と、該当 build ステージの `COPY` の両方 |

## 8. 経緯

- **v2.9.229 以前**は GitHub Actions から VPS へ SSH し、2GB RAM の VPS 上で `docker compose build --no-cache` していた（稼働中のコンテナと CPU・メモリを奪い合い、1行の変更でも毎回フルビルド）。
- **v2.9.230** で GitHub Actions ビルド＋GHCR pull に移行。**v2.9.235** で `manifests` ステージ、**v2.9.238** で版の更新をルートだけに限定、**v2.9.289** で `npm ci` と型チェックの並走化。**v4** で `ci.yml` に検査を一本化し、`dev` ブランチと「dev = 検証 / main = 本番」の運用を廃止した。
- 当時の全文（実測値・変更ファイル・効果の表）は [archive/2026/deploy-pipeline-v2.9-history.md](archive/2026/deploy-pipeline-v2.9-history.md)。
