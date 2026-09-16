# ===== Stage 1: Build Web =====
FROM node:20-bullseye-slim AS web-builder
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm install --legacy-peer-deps --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ===== Stage 2: Build Server (TypeScript) =====
FROM node:20-bullseye-slim AS server-builder
WORKDIR /server
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY server/package.json server/package-lock.json* ./
RUN npm install --legacy-peer-deps --no-audit --no-fund
COPY server/ ./
RUN npm run build

# ===== Stage 3: Runtime (Debian glibc) =====
FROM node:20-bullseye-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends tini wget && rm -rf /var/lib/apt/lists/*

# 直接装 better-sqlite3 prebuilt (debian glibc 100% 兼容)
COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund --legacy-peer-deps

COPY --from=server-builder /server/dist ./dist
COPY --from=web-builder /web/dist ./public

RUN mkdir -p /app/data
ENV DB_PATH=/app/data/agri.db \
    PUBLIC_DIR=/app/public \
    NODE_ENV=production \
    PORT=3000

EXPOSE 3000
VOLUME ["/app/data"]

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "echo \"PUBLIC_DIR=$PUBLIC_DIR DB_PATH=$DB_PATH\"; ls /app/dist/index.js /app/public/index.html; node dist/index.js"]
