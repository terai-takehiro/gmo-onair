# ============================================
# GMO ONAiR — Multi-stage Docker Build
# (v2.9.230: ワークスペース別の並列ビルドステージ構成)
#
# 設計:
#   manifests   — package.json の version を固定値へ正規化するだけの軽量ステージ。
#                 バージョン更新で npm install のキャッシュが飛ぶのを防ぐ (下記参照)。
#   deps        — 全ワークスペースの npm install。依存が変わらない限り
#                 レイヤーキャッシュが効き、install (最も重い工程) を丸ごとスキップ。
#   build-*     — 各クライアント / サーバーを独立ステージでビルド。
#                 BuildKit がステージを並列実行し、変更のないワークスペースは
#                 レイヤーキャッシュでビルド自体がスキップされる
#                 (例: client-daily だけ変更 → 他 6 クライアント + server はキャッシュヒット)。
#   production  — サーバー + 各クライアントの dist だけを集約した実行イメージ。
#
# 型チェックはイメージのビルドに残している (各クライアントの build は `tsc -b && vite build`)。
#   CI の typecheck ジョブでも同じものが走るが、**イメージ側にも残す**のは、
#   CI の配線が変わってもここだけは型エラーのまま焼き上がらないようにするため
#   (ワークフローの設定ずれは実際に起きている)。ビルドは約50秒伸びるが、
#   デプロイの所要時間はイメージの pull が主なので実害は小さい。
#
# ビルドは GitHub Actions (buildx + キャッシュ) で行い GHCR へ push、
# VPS は pull して起動するだけ (詳細: docs/deploy-pipeline.md)。
# ============================================

# ── Stage: manifests (package.json の version 正規化) ──
# Why: このプロジェクトはプッシュのたびに 10 個の package.json のバージョンを上げる運用。
# それをそのまま COPY すると、依存が 1 つも変わっていなくても後続の npm install
# レイヤーのキャッシュが毎回破棄され、install が丸ごと再実行される
# (v2.9.232 の本番ビルド実測 4 分のうち、root install 約 40 秒 + server install 約 29 秒)。
#
# 正規化を COPY の「後」に置いても無意味なことに注意: Docker のレイヤーキャッシュは
# 逐次的で、COPY の時点で既に無効化されるため。そこで正規化専用ステージを置き、
# deps / production は COPY --from=manifests で受け取る。
# COPY --from のキャッシュキーは「コピー元の内容」で決まるので、version だけの変更では
# 正規化後の内容が同一 → deps 以降のレイヤーが無効化されなくなる。
#
# 依存解決に version は使われない: ワークスペース間の参照は npm workspaces の symlink
# (node_modules/@gmo-onair/shared → ../shared) で、どの package.json も相手の
# バージョンを固定参照していないことを確認済み。version を実際に読むのは client の
# __APP_VERSION__ (ルート package.json) と SettingsPage (client/package.json) だけなので、
# build-client ステージで実ファイルを COPY し直して戻す。
FROM node:20-alpine AS manifests
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY client-equipment/package.json client-equipment/
COPY client-qsheet/package.json client-qsheet/
COPY client-live/package.json client-live/
COPY client-awards/package.json client-awards/
COPY client-daily/package.json client-daily/
COPY server/package.json server/
COPY shared/package.json shared/
RUN node -e "const f=require('fs'),W=['package.json','client/package.json','client-equipment/package.json','client-qsheet/package.json','client-live/package.json','client-awards/package.json','client-daily/package.json','server/package.json','shared/package.json'],V='0.0.0-build';for(const p of W){const j=JSON.parse(f.readFileSync(p,'utf8'));j.version=V;f.writeFileSync(p,JSON.stringify(j,null,2)+'\n')}const l=JSON.parse(f.readFileSync('package-lock.json','utf8'));l.version=V;for(const[k,v]of Object.entries(l.packages||{}))if(v&&v.version&&(k===''||W.includes(k+'/package.json')))v.version=V;f.writeFileSync('package-lock.json',JSON.stringify(l,null,2)+'\n')"

# ── Stage: deps (依存インストール) ─────────────
# npm ci を使う (npm install ではなく):
#   - lockfile の解決結果をそのまま入れるので依存ツリーの再計算をしない (実測で速い)
#   - lockfile と package.json が食い違っていたらその場で落ちる。install だと
#     黙って lockfile を書き換えて進むので、**イメージの中身が lockfile と違う**
#     状態でデプロイされ得る (コード健全性ポリシーの「宣言と解決を一致させる」)
FROM node:20-alpine AS deps
WORKDIR /app
COPY --from=manifests /app/ ./
RUN npm ci --workspaces --include-workspace-root

# ── Stage: build-client (案件管理) ─────────────
# client の prebuild (generate-version-history / generate-mcp-tools) だけが
# ワークスペース外のファイルを参照する:
#   - CLAUDE.md                        ← 「現在のバージョン」節をパース (全履歴がここにある)
#   - scripts/generate-*.mjs           ← 生成スクリプト本体
#   - server/src/contexts/mcp/tools/   ← registerTool() を走査して MCP ツール一覧を生成
# この 3 つを COPY し忘れると prebuild が ENOENT で落ちるので、
# prebuild に新しい生成スクリプトを足したら参照元もここに追加すること。
FROM deps AS build-client
# deps は manifests 由来の正規化済み package.json (version=0.0.0-build) を持つため、
# ここでルートの実ファイルを COPY し直してバージョン表示を正しくする。
# vite.config.ts がこれを読んで __APP_VERSION__ に埋め込む (HomePage / SettingsPage の表示)。
#
# v2.9.238 以降、バージョンを更新するのは**ルート package.json だけ**なので、
# バージョン更新のみのプッシュでは build-client だけが再ビルドされ
# (表示バージョンが変わる = 再ビルドが正しい)、他 6 クライアント + server は
# キャッシュに載る。ワークスペース側の package.json を更新するとこの利点が消える。
COPY package.json ./
COPY shared/ shared/
COPY CLAUDE.md ./
# generate-version-history.mjs は CLAUDE.md (最新3件) と docs/version-history.md
# (それ以前の全件) の両方を読んで画面のバージョン履歴を組み立てる。
# CLAUDE.md は毎ターン文脈に載るため履歴を全部抱えると作業が遅くなるので切り出してある。
# この COPY を忘れるとスクリプトは exit 1 で落ちる (fail closed。静かに履歴が
# 最新3件だけになるのを防ぐため)。.dockerignore の "!docs/version-history.md" と対で必要。
COPY docs/version-history.md docs/
COPY scripts/ scripts/
COPY server/src/contexts/mcp/tools/ server/src/contexts/mcp/tools/
# gate.ts は generate-mcp-tools.mjs の権限ゲート検証 (書き込みツールの登録漏れ検出) が読む。
# これを COPY し忘れると検証が実行できず、スクリプトは exit 1 で落ちる (fail closed)。
COPY server/src/contexts/mcp/gate.ts server/src/contexts/mcp/gate.ts
COPY client/ client/
RUN npm run build --workspace=client

# ── Stage: build-client-equipment (機材管理) ──
FROM deps AS build-client-equipment
COPY shared/ shared/
COPY client-equipment/ client-equipment/
RUN npm run build --workspace=client-equipment

# ── Stage: build-client-qsheet (Qシート) ──────
FROM deps AS build-client-qsheet
COPY shared/ shared/
COPY client-qsheet/ client-qsheet/
RUN npm run build --workspace=client-qsheet

# ── Stage: build-client-live (計時LIVE) ───────
FROM deps AS build-client-live
COPY shared/ shared/
COPY client-live/ client-live/
RUN npm run build --workspace=client-live

# リアルタイムCG (client-awards) は廃止済み。ビルドステージを持たない
# (コードは client-awards/ に残す・サーバーが配信しない。詳細は client-awards/CLAUDE.md)

# ── Stage: build-client-daily (日常業務) ──────
FROM deps AS build-client-daily
COPY shared/ shared/
COPY client-daily/ client-daily/
RUN npm run build --workspace=client-daily

# ── Stage: build-server ───────────────────────
# server は現状 shared workspace を import していないが、将来の参照に備えて
# クライアントと同じく shared/ を含める (並列ビルドなので wall-clock への影響なし)
#
# server の prebuild が参照する外部ファイル (このステージに必須):
#   - scripts/check-collab-parity.mjs  ← Yjs 変換層の 2 部 (shared / server) の一致を検証
# 検証対象が shared/ と server/ の両方に跨るため、client ではなく server の prebuild に
# 置いている (build-client には server/src/shared が無く v2.9.231 と同じ事故になる)。
# COPY し忘れると prebuild が MODULE_NOT_FOUND で落ちる (v2.9.249 で実際に踏んだ)。
# server の prebuild にスクリプトを足したら、その本体もここに COPY すること。
FROM deps AS build-server
COPY shared/ shared/
COPY scripts/check-collab-parity.mjs scripts/
COPY server/ server/
RUN npm run build --workspace=server

# ── Stage: production ─────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# pg_dump を使う DB バックアップスクリプト (server/scripts/backup-db-to-box.mjs) のため
# postgresql-client をインストール (Postgres 16 のクライアントツール一式: pg_dump 等)
RUN apk add --no-cache postgresql16-client

# Server dependencies only.
# manifests 由来 (version 正規化済み) を使うことで、バージョン更新だけでは
# この install (実測約 29 秒) のキャッシュが飛ばない。
# サーバーは自身の package.json の version を読まない (/health が version:"unknown" を
# 返すのと一致) ため、正規化しても実害はない。
COPY --from=manifests /app/server/package.json server/
RUN cd server && npm install --omit=dev

# Server build output + migrations
COPY --from=build-server /app/server/dist server/dist
COPY server/src/shared/db/migrations server/dist/shared/db/migrations

# DB バックアップスクリプト (cron から docker exec 経由で呼ばれる)
COPY server/scripts server/scripts

# Japanese fonts for PDF
COPY server/fonts server/fonts

# Client build outputs
COPY --from=build-client /app/client/dist client/dist
COPY --from=build-client-equipment /app/client-equipment/dist client-equipment/dist
COPY --from=build-client-qsheet /app/client-qsheet/dist client-qsheet/dist
COPY --from=build-client-live /app/client-live/dist client-live/dist
COPY --from=build-client-daily /app/client-daily/dist client-daily/dist

# Runtime
RUN mkdir -p /app/uploads/qsheet /app/uploads/awards
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server/dist/index.js"]
