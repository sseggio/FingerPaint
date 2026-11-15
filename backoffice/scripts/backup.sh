#!/bin/sh
# Backs up the catalog (SQLite database + artwork files) into backups/pixeljoy-<date>.tar.gz.
# Run from the backoffice/ folder on the VPS:  ./scripts/backup.sh
# Restore: see README.md (section « Restaurer une sauvegarde »).
set -eu
cd "$(dirname "$0")/.."
mkdir -p backups
STAMP=$(date +%Y%m%d-%H%M%S)
OUT="backups/pixeljoy-$STAMP.tar.gz"
docker compose exec -T app node --disable-warning=ExperimentalWarning dist/backup.mjs /data/backup.sqlite >/dev/null
docker compose exec -T app tar -czf - -C /data backup.sqlite artworks > "$OUT"
docker compose exec -T app rm -f /data/backup.sqlite
echo "Sauvegarde écrite : $OUT"
# Keep the 30 most recent archives.
ls -1t backups/pixeljoy-*.tar.gz 2>/dev/null | tail -n +31 | xargs -r rm -f
