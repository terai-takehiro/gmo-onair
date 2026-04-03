# Multi-stage build for GMO ONAiR
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
COPY client/package.json client/
COPY server/package.json server/

RUN npm install --workspaces --include-workspace-root

# Copy source
COPY client/ client/
COPY server/ server/
COPY tsconfig.json ./

# Build client (Vite) and server (TypeScript)
RUN npm run build --workspace=client
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

# Copy built client to serve as static files
COPY --from=builder /app/client/dist client/dist

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server/dist/index.js"]
