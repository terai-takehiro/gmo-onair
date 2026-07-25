# ============================================
# GMO ONAiR — Multi-stage Docker Build
# (v2.9.230: ワークスペース別の並列ビルドステージ構成)
#
# 設計:
#   deps        — 全ワークスペースの npm install。package*.json が変わらない限り
#                 レイヤーキャッシュが効き、install (最も重い工程) を丸ごとスキップ。
#   build-*     — 各クライアント / サーバーを独立ステージでビルド。
#                 BuildKit がステージを並列実行し、変更のないワークスペースは
#                 レイヤーキャッシュでビルド自体がスキップされる
#                 (例: client-daily だけ変更 → 他 6 クライアント + server はキャッシュヒット)。
#   production  — サーバー + 各クライアントの dist だけを集約した実行イメージ。
#
# ビルドは GitHub Actions (buildx + キャッシュ) で行い GHCR へ push、
# VPS は pull して起動するだけ (詳細: docs/deploy-pipeline.md)。
# ============================================

# ── Stage: deps (依存インストール) ─────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY client-equipment/package.json client-equipment/
COPY client-qsheet/package.json client-qsheet/
COPY client-techsheet/package.json client-techsheet/
COPY client-live/package.json client-live/
COPY client-awards/package.json client-awards/
COPY client-daily/package.json client-daily/
COPY server/package.json server/
COPY shared/package.json shared/
RUN npm install --workspaces --include-workspace-root

# ── Stage: build-client (案件管理) ─────────────
# client の prebuild (generate-version-history / generate-mcp-tools) だけが
# ワークスペース外のファイルを参照する:
#   - CLAUDE.md                        ← 「現在のバージョン」節をパース
#   - scripts/generate-*.mjs           ← 生成スクリプト本体
#   - server/src/contexts/mcp/tools/   ← registerTool() を走査して MCP ツール一覧を生成
# この 3 つを COPY し忘れると prebuild が ENOENT で落ちるので、
# prebuild に新しい生成スクリプトを足したら参照元もここに追加すること。
FROM deps AS build-client
COPY shared/ shared/
COPY CLAUDE.md ./
COPY scripts/ scripts/
COPY server/src/contexts/mcp/tools/ server/src/contexts/mcp/tools/
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

# ── Stage: build-client-techsheet (技術資料) ──
FROM deps AS build-client-techsheet
COPY shared/ shared/
COPY client-techsheet/ client-techsheet/
RUN npm run build --workspace=client-techsheet

# ── Stage: build-client-live (計時LIVE) ───────
FROM deps AS build-client-live
COPY shared/ shared/
COPY client-live/ client-live/
RUN npm run build --workspace=client-live

# ── Stage: build-client-awards (リアルタイムCG) ─
FROM deps AS build-client-awards
COPY shared/ shared/
COPY client-awards/ client-awards/
RUN npm run build --workspace=client-awards

# ── Stage: build-client-daily (日常業務) ──────
FROM deps AS build-client-daily
COPY shared/ shared/
COPY client-daily/ client-daily/
RUN npm run build --workspace=client-daily

# ── Stage: build-server ───────────────────────
# server は現状 shared workspace を import していないが、将来の参照に備えて
# クライアントと同じく shared/ を含める (並列ビルドなので wall-clock への影響なし)
FROM deps AS build-server
COPY shared/ shared/
COPY server/ server/
RUN npm run build --workspace=server

# ── Stage: production ─────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# pg_dump を使う DB バックアップスクリプト (server/scripts/backup-db-to-box.mjs) のため
# postgresql-client をインストール (Postgres 16 のクライアントツール一式: pg_dump 等)
RUN apk add --no-cache postgresql16-client

# Server dependencies only
COPY server/package.json server/
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
COPY --from=build-client-techsheet /app/client-techsheet/dist client-techsheet/dist
COPY --from=build-client-live /app/client-live/dist client-live/dist
COPY --from=build-client-awards /app/client-awards/dist client-awards/dist
COPY --from=build-client-daily /app/client-daily/dist client-daily/dist

# Runtime
RUN mkdir -p /app/uploads/qsheet /app/uploads/awards
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server/dist/index.js"]
