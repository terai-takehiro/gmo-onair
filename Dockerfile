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
COPY client-interactive/package.json client-interactive/
COPY client-techsheet/package.json client-techsheet/
COPY server/package.json server/
COPY shared/package.json shared/
RUN npm install --workspaces --include-workspace-root

# 2. Copy ALL source (invalidates cache when any source changes)
COPY shared/ shared/
COPY client/ client/
COPY client-equipment/ client-equipment/
COPY client-qsheet/ client-qsheet/
COPY client-interactive/ client-interactive/
COPY client-techsheet/ client-techsheet/
COPY server/ server/

# 3. Build in order
RUN npm run build --workspace=shared 2>/dev/null || true
RUN npm run build --workspace=client
RUN npm run build --workspace=client-equipment
RUN npm run build --workspace=client-qsheet
RUN npm run build --workspace=client-interactive
RUN npm run build --workspace=client-techsheet
RUN npm run build --workspace=server

# ── Stage 2: Production ──────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# Server dependencies only
COPY server/package.json server/
RUN cd server && npm install --omit=dev

# Server build output + migrations
COPY --from=builder /app/server/dist server/dist
COPY server/src/shared/db/migrations server/dist/shared/db/migrations

# Japanese fonts for PDF
COPY server/fonts server/fonts

# Client build outputs
COPY --from=builder /app/client/dist client/dist
COPY --from=builder /app/client-equipment/dist client-equipment/dist
COPY --from=builder /app/client-qsheet/dist client-qsheet/dist
COPY --from=builder /app/client-interactive/dist client-interactive/dist
COPY --from=builder /app/client-techsheet/dist client-techsheet/dist

# Runtime
RUN mkdir -p /app/uploads/qsheet
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server/dist/index.js"]
