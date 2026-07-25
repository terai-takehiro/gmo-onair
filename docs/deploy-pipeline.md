# デプロイパイプライン (v2.9.230+)

## 背景 / 課題

v2.9.229 まで、デプロイは GitHub Actions から VPS へ SSH し、**2GB RAM の CoNoHa VPS 上で
`docker compose build --no-cache`** を実行していた。これには 3 つの問題があった:

1. **`--no-cache` による毎回フルビルド** — 9 ワークスペース分の `npm install`(最重量工程) と
   7 クライアント + サーバーのビルドを、1 行の変更でも毎回ゼロから実行
2. **ビルドが VPS 上** — 稼働中の prod/dev/nginx/db コンテナと CPU・メモリを奪い合い、
   ビルドが遅いだけでなくデプロイ中は本番のレスポンスも劣化
3. **7 クライアントの逐次ビルド** — 並列化されず、変更のないアプリも常に再ビルド

結果としてデプロイに時間がかかり、トライ&エラーのサイクルが遅かった。

## 新しい仕組み

```
push (dev/main)
   │
   ├─ [build ジョブ]  GitHub Actions ランナー上で docker buildx ビルド
   │     ・Dockerfile はワークスペース別の並列ステージ構成
   │     ・GHA レイヤーキャッシュ (type=gha, mode=max):
   │         - package*.json が変わらない限り npm install をスキップ
   │         - 変更のないワークスペースの build ステージを丸ごとスキップ
   │     ・ghcr.io/terai-takehiro/gmo-onair:{dev|prod} と :sha-<commit> に push
   │
   └─ [deploy ジョブ]  VPS へ SSH
         ・git worktree 同期 (compose / nginx 設定 / フォールバック用)
         ・docker login ghcr.io (ジョブの一時 GITHUB_TOKEN、追加 secret 不要)
         ・docker compose pull → up -d --force-recreate  (1〜2 分)
         ・pull 失敗時のみ従来どおり VPS 上ビルドにフォールバック
         ・docker image prune -f で旧 dangling イメージを掃除
```

### 変更ファイル

| ファイル | 変更内容 |
|---|---|
| `Dockerfile` | 単一 builder ステージ → `manifests` + `deps` + ワークスペース別 `build-*` ステージ (BuildKit が並列実行・独立キャッシュ) |
| `.github/workflows/deploy.yml` | `build` ジョブ新設 (buildx + GHA cache + GHCR push)。deploy ジョブは pull のみに |
| `docker-compose.yml` | `app_prod` / `app_dev` に `image:` を追加 (`APP_IMAGE_PROD` / `APP_IMAGE_DEV` で上書き可能)。`build:` はフォールバック用に残置 |

### 効果 (期待値)

| 工程 | 旧 | 新 |
|---|---|---|
| npm install | 毎回フル実行 (VPS 上) | 依存変更時のみ (キャッシュヒットで 0 秒) |
| クライアントビルド | 7 本逐次 + 常に全再ビルド | 並列 + 変更のあったアプリのみ |
| VPS 上の処理 | フルビルド + 再作成 | pull + 再作成 (1〜2 分) |
| デプロイ中の本番負荷 | ビルドで CPU/RAM を圧迫 | ほぼゼロ (pull の I/O のみ) |

## バージョン更新でキャッシュが飛ぶ問題 (v2.9.235 で対処)

このプロジェクトはプッシュのたびに 10 個の `package.json` のバージョンを上げる運用のため、
素直に COPY すると **依存が 1 つも変わっていなくても `npm install` のキャッシュが毎回破棄**され、
「変更のないワークスペースはスキップ」という利点がほぼ打ち消されていた
(v2.9.232 の本番ビルド実測 4 分 7 秒。うち root install 約 40 秒 + server install 約 29 秒)。

**注意すべき性質**: Docker のレイヤーキャッシュは逐次的なので、
**正規化を COPY の「後」に置いても効果がない** (COPY の時点で既に無効化される)。

そこで正規化専用の `manifests` ステージを置き、`deps` と `production` は
`COPY --from=manifests` で受け取る。`COPY --from` のキャッシュキーは
**コピー元の内容**で決まるため、バージョンだけの変更では正規化後の内容が同一になり、
後続の install レイヤーが無効化されない。

```
manifests (毎回走るが数秒: 10ファイルをコピーして version を 0.0.0-build に潰すだけ)
   ↓ COPY --from=manifests  ← ここのキャッシュキーが内容ベースになる
deps (npm install — 依存が変わらない限りキャッシュヒット)
   ↓
build-* / production
```

**安全性の根拠**:
- ワークスペース間の参照は npm workspaces の symlink (`node_modules/@gmo-onair/shared → ../shared`) で、
  どの `package.json` も相手のバージョンを固定参照していない → 依存解決に影響しない
- version を実際に読むのは **client の 2 箇所だけ**
  (`vite.config.ts` → `__APP_VERSION__` → HomePage / `SettingsPage.tsx` → `client/package.json`)。
  どちらも `build-client` ステージで実ファイルを COPY し直すので表示は正しいままになる
- サーバーは自身の version を読まない (`/health` が `version:"unknown"` を返すのと一致)

**v2.9.238 で仕上げ**: バージョン更新を**ルート `package.json` だけ**に限定した
(CLAUDE.md のバージョン更新ルールも変更済み)。各ワークスペースの `version` は
どこからも読まれていなかったため実害ゼロで、`SettingsPage` が唯一 `client/package.json` を
import していた箇所を `__APP_VERSION__` (ルート由来・HomePage と同じソース) に統一した。

これにより**バージョン更新のみのプッシュでは `build-client` だけが再ビルドされ**
(表示バージョンが変わるので正しい)、他 6 クライアント + server + 両 install は
キャッシュに載る。

⚠️ **ワークスペースの `package.json` の version を更新すると、この利点が消える**
(全ビルドステージが無効化される)。バージョンはルートだけを上げること。

## 運用メモ

### ロールバック

GHCR にはコミットごとの `sha-<full commit hash>` タグが残る。VPS 上で:

```bash
# 例: dev を特定コミットのイメージに戻す
cd /root/gmo-onair-dev
APP_IMAGE_DEV=ghcr.io/terai-takehiro/gmo-onair:sha-<旧コミットhash> \
  docker compose -p gmo-onair --env-file /root/gmo-onair/.env \
  -f /root/gmo-onair-dev/docker-compose.yml up -d --no-deps --force-recreate app_dev
```

(従来どおり「旧コミットを dev/main に push して再デプロイ」でも戻せる。こちらは
git 履歴とイメージが一致するので恒久的なロールバックにはこちらを推奨。)

### GHCR イメージの認証

- push: build ジョブの `GITHUB_TOKEN` (`packages: write`)
- pull: deploy ジョブが SSH 経由で VPS に一時 `GITHUB_TOKEN` を渡して `docker login`
  (デプロイ完了後に `docker logout`)。**VPS に永続的な認証情報は置かない**。
- パッケージは初回 push 時に自動でリポジトリに紐づき、リポジトリと同じ可視性 (private) になる。

### フォールバック (GHCR 障害時)

deploy スクリプトは `compose pull` が失敗すると自動で従来の
`compose build --no-cache` (VPS 上ビルド) に切り替わる。挙動は v2.9.229 以前と同一。

### ローカル開発

`docker compose build` / `docker compose up --build` は従来どおり動作する
(`image:` と `build:` を併記しているため、ローカルビルドはその image 名でタグ付けされる)。

### 注意点

- **`sha-*` タグは GHCR に蓄積される**。当面は問題ないが、増えてきたら GitHub の
  パッケージ設定で untagged/old バージョンの retention ポリシーを設定するか、
  定期削除の workflow を追加する。
- GHA キャッシュはリポジトリあたり 10GB (LRU で自動削除)。キャッシュが追い出されると
  そのビルドはフルビルドになるが、動作には影響しない。
- 新しいワークスペース (client-xxx) を追加したら、`Dockerfile` に
  `deps` ステージの package.json COPY + `build-client-xxx` ステージ + production の
  `COPY --from=` の 3 箇所を追加すること。
