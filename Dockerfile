# syntax=docker/dockerfile:1

# ---- build: compile the web bundle and the server bundle ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY shared shared
COPY server server
COPY web web
RUN npm run build

# ---- deps: production dependencies for the server only ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --workspace=server --include-workspace-root=false --no-audit --no-fund

# ---- runtime ----
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=7878 \
    WEB_DIR=/app/web \
    CONFIG_PATH=/config/clearview.yaml \
    DISKS_ROOT=/host/mnt
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web
EXPOSE 7878
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/health >/dev/null || exit 1
CMD ["node", "server/dist/index.mjs"]
