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
# 安装构建工具（better-sqlite3 编译用）
RUN apk add --no-cache python3 make g++
COPY server/package.json server/package-lock.json* ./
RUN npm install --legacy-peer-deps --no-audit --no-fund
COPY server/ ./
RUN npm run build
# 产物：/server/dist

# ===== Stage 3: Runtime (单容器) =====
FROM node:20-alpine AS runtime
WORKDIR /app

# better-sqlite3 运行时也需要 python3（已无，但 alpine prebuilt 应该够）
RUN apk add --no-cache tini

# 只安装 server 运行时依赖
COPY server/package.json server/package-lock.json* ./
RUN npm install --legacy-peer-deps --omit=dev --no-audit --no-fund

# 复制 server 编译产物 + simulatorRunner
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
