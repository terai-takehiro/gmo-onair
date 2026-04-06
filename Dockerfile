# Multi-stage build for GMO ONAiR
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
COPY client/package.json client/
COPY client-equipment/package.json client-equipment/
COPY client-qsheet/package.json client-qsheet/
COPY server/package.json server/

RUN npm install --workspaces --include-workspace-root

# Copy source
COPY client/ client/
COPY client-equipment/ client-equipment/
COPY client-qsheet/ client-qsheet/
COPY server/ server/

# Build all clients (Vite) and server (TypeScript)
RUN npm run build --workspace=client
RUN npm run build --workspace=client-equipment
RUN npm run build --workspace=client-qsheet
RUN npm run build --workspace=server

# Production image
FROM node:20-alpine AS production

WORKDIR /app

# Copy server dependencies
COPY server/package.json server/
RUN cd server && npm install --omit=dev

# Copy built server
COPY --from=builder /app/server/dist server/dist
COPY server/src/shared/db/migrations server/dist/shared/db/migrations

# Copy built clients to serve as static files
COPY --from=builder /app/client/dist client/dist
COPY --from=builder /app/client-equipment/dist client-equipment/dist
COPY --from=builder /app/client-qsheet/dist client-qsheet/dist

# Upload directory for qsheet images
RUN mkdir -p /app/uploads/qsheet

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server/dist/index.js"]
