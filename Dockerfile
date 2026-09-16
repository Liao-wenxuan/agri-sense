# ===== Stage 1: Build Web =====
FROM node:20-alpine AS web-builder
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm install --legacy-peer-deps --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ===== Stage 2: Build Server (TypeScript) =====
FROM node:20-alpine AS server-builder
WORKDIR /server
RUN apk add --no-cache python3 make g++
COPY server/package.json server/package-lock.json* ./
RUN npm install --legacy-peer-deps --no-audit --no-fund
COPY server/ ./
RUN npm run build

# ===== Stage 3: Runtime =====
FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache tini python3 make g++ wget

# 装 server 依赖（强制从源码编译 better-sqlite3 避免 ABI 兼容问题）
COPY server/package.json server/package-lock.json* ./
RUN npm_config_build_from_source=true npm install --omit=dev --no-audit --no-fund --legacy-peer-deps

# 复制编译产物 + 静态
COPY --from=server-builder /server/dist ./dist
COPY --from=web-builder /web/dist ./public

# 数据目录
RUN mkdir -p /app/data
ENV DB_PATH=/app/data/agri.db \
    PUBLIC_DIR=/app/public \
    NODE_ENV=production \
    PORT=3000

# 启动前打印关键路径，便于 debug
RUN echo "✓ /app/public/index.html exists: $(test -f /app/public/index.html && echo yes || echo no)"
RUN echo "✓ /app/dist/index.js exists: $(test -f /app/dist/index.js && echo yes || echo no)"

EXPOSE 3000
VOLUME ["/app/data"]

# 启动时先确认文件存在再启动 node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "echo \"PUBLIC_DIR=$PUBLIC_DIR\"; ls -la /app/public/ | head -5; echo \"---\"; ls -la /app/dist/ | head -5; echo \"--- starting node ---\"; node dist/index.js"]
