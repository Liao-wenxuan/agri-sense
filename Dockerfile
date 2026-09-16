# ===== Stage 1: Build Web (Vue + Vite) =====
FROM node:20-alpine AS web-builder
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm install --legacy-peer-deps --no-audit --no-fund
COPY web/ ./
RUN npm run build
# 产物：/web/dist

# ===== Stage 2: Build Server (TypeScript) =====
FROM node:20-alpine AS server-builder
WORKDIR /server
# 编译 better-sqlite3 需要 python3 + make + g++
RUN apk add --no-cache python3 make g++
COPY server/package.json server/package-lock.json* ./
RUN npm install --legacy-peer-deps --no-audit --no-fund
COPY server/ ./
RUN npm run build
# 产物：/server/dist

# ===== Stage 3: Runtime (单容器) =====
# 必须在 runtime 重新编译 better-sqlite3（跨 stage COPY 会有 ABI 不兼容）
FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache tini python3 make g++

# 复制 server package.json + lockfile，自己 npm install 编译 native 模块
COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
# 复制 server 编译产物
COPY --from=server-builder /server/dist ./dist
# 复制 web 静态构建产物
COPY --from=web-builder /web/dist ./public

# 数据持久化目录
RUN mkdir -p /app/data
ENV DB_PATH=/app/data/agri.db \
    PUBLIC_DIR=/app/public \
    NODE_ENV=production \
    PORT=3000

EXPOSE 3000
VOLUME ["/app/data"]

# tini 收信号 + node 启动
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
