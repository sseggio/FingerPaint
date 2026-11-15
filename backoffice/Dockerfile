# syntax=docker/dockerfile:1
# Build context = repository root (the server reuses src/lib/artwork and lists src/content ids):
#   docker build -f backoffice/Dockerfile .      (docker-compose.yml does this for you)

FROM node:22-alpine AS build
WORKDIR /repo/backoffice
COPY backoffice/package.json backoffice/package-lock.json ./
RUN npm ci --no-audit --no-fund
WORKDIR /repo
# Only the pure, shared modules and the embedded content list are needed from the app.
COPY src/lib/artwork src/lib/artwork
COPY src/lib/color.ts src/lib/symbols.ts src/lib/
COPY src/content/albums.json src/content/albums.json
COPY src/content/artworks src/content/artworks
COPY backoffice backoffice
WORKDIR /repo/backoffice
RUN npm run typecheck && npm run gen:embedded && npm run build

FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    TRUST_PROXY=true
WORKDIR /app
# Self-contained bundles: no node_modules at runtime.
COPY --from=build /repo/backoffice/dist ./dist
COPY --from=build /repo/backoffice/generated ./generated
COPY backoffice/public ./public
COPY backoffice/scripts/backup.sh ./scripts/backup.sh
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/server.mjs"]
