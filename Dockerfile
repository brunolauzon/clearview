# syntax=docker/dockerfile:1

# The build and deps stages produce only JavaScript, so they always run on the build machine's
# own architecture (--platform=$BUILDPLATFORM). A multi-arch build then needs no emulation
# except for the final stage, which only copies files.

# ---- build: compile the web bundle and the server bundle ----
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
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

# ---- deps: production dependencies for the server only (all pure JavaScript) ----
FROM --platform=$BUILDPLATFORM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev --workspace=server --include-workspace-root=false --no-audit --no-fund \
 && if find node_modules -name '*.node' | grep -q .; then echo "native addon found: deps must be installed per target arch" >&2; exit 1; fi

# ---- runtime ----
FROM node:22-alpine
LABEL org.opencontainers.image.title="clearview" \
      org.opencontainers.image.description="Terminal-style dashboard for an Unraid homelab" \
      org.opencontainers.image.source="https://github.com/brunolauzon/clearview"
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
