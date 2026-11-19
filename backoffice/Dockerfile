# syntax=docker/dockerfile:1
# Build context = repository root (the server reuses src/lib/artwork and lists src/content ids):
#   docker build -f backoffice/Dockerfile .      (docker-compose.yml does this for you)

# Base images pinned by digest (updated by Dependabot, see .github/dependabot.yml and README.md).
FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS build
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

FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    TRUSTED_PROXIES=
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
