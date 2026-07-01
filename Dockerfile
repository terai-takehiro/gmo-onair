# ============================================
# GMO ONAiR — Multi-stage Docker Build
# ============================================

# ── Stage 1: Builder ──────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# 1. Install dependencies (cached unless package*.json change)
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY client-equipment/package.json client-equipment/
COPY client-qsheet/package.json client-qsheet/
COPY client-techsheet/package.json client-techsheet/
COPY client-live/package.json client-live/
COPY client-awards/package.json client-awards/
COPY server/package.json server/
COPY shared/package.json shared/
RUN npm install --workspaces --include-workspace-root

# 2. Copy ALL source (invalidates cache when any source changes)
COPY shared/ shared/
COPY client/ client/
COPY client-equipment/ client-equipment/
COPY client-qsheet/ client-qsheet/
COPY client-techsheet/ client-techsheet/
COPY client-live/ client-live/
COPY client-awards/ client-awards/
COPY server/ server/
# CLAUDE.md 「現在のバージョン」節 + それをパースする scripts/ (client の prebuild が参照)
COPY CLAUDE.md ./
COPY scripts/ scripts/

# 3. Build in order
RUN npm run build --workspace=shared 2>/dev/null || true
RUN npm run build --workspace=client
RUN npm run build --workspace=client-equipment
RUN npm run build --workspace=client-qsheet
RUN npm run build --workspace=client-techsheet
RUN npm run build --workspace=client-live
RUN npm run build --workspace=client-awards
RUN npm run build --workspace=server

# ── Stage 2: Production ──────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# pg_dump を使う DB バックアップスクリプト (server/scripts/backup-db-to-box.mjs) のため
# postgresql-client をインストール (Postgres 16 のクライアントツール一式: pg_dump 等)
RUN apk add --no-cache postgresql16-client

# Server dependencies only
COPY server/package.json server/
RUN cd server && npm install --omit=dev

# Server build output + migrations
COPY --from=builder /app/server/dist server/dist
COPY server/src/shared/db/migrations server/dist/shared/db/migrations

# DB バックアップスクリプト (cron から docker exec 経由で呼ばれる)
COPY server/scripts server/scripts

# Japanese fonts for PDF
COPY server/fonts server/fonts

# Client build outputs
COPY --from=builder /app/client/dist client/dist
COPY --from=builder /app/client-equipment/dist client-equipment/dist
COPY --from=builder /app/client-qsheet/dist client-qsheet/dist
COPY --from=builder /app/client-techsheet/dist client-techsheet/dist
COPY --from=builder /app/client-live/dist client-live/dist
COPY --from=builder /app/client-awards/dist client-awards/dist

# Runtime
RUN mkdir -p /app/uploads/qsheet /app/uploads/awards
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server/dist/index.js"]
