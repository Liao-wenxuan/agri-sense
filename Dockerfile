# ===== Stage 1: Build Web (Vue + Vite) =====
FROM node:20-alpine AS web-builder
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm install --legacy-peer-deps --no-audit --no-fund
COPY web/ ./
RUN npm run build
# 产物：/web/dist

# ===== Stage 2: Build Server (TypeScript + better-sqlite3 预编译) =====
FROM node:20-alpine AS server-builder
WORKDIR /server
# 安装 better-sqlite3 编译依赖（python3 + make + g++）
RUN apk add --no-cache python3 make g++
COPY server/package.json server/package-lock.json* ./
RUN npm install --legacy-peer-deps --no-audit --no-fund
COPY server/ ./
RUN npm run build
# 产物：/server/dist + /server/node_modules（含 better-sqlite3 编译好的 .node 文件）

# ===== Stage 3: Runtime (单容器) =====
FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache tini

# 直接 COPY server-builder 阶段已经安装并编译好的 node_modules（避免重复编译）
COPY --from=server-builder /server/node_modules ./node_modules
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
