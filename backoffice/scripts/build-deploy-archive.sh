#!/usr/bin/env bash
# Builds the deployment archive (tar.gz) of the back-office: exactly what `docker build -f
# backoffice/Dockerfile .` needs, laid out like the repository root. The list of paths is read from
# the COPY instructions of backoffice/Dockerfile (so the two never drift apart), plus the whole
# backoffice/ folder (compose file, Caddyfile, deployment scripts). Only committed files of the
# given revision are included (git archive): no node_modules, .env, data or backups.
#   backoffice/scripts/build-deploy-archive.sh <out.tar.gz> [revision, default HEAD]
set -euo pipefail

out=${1:?usage: build-deploy-archive.sh <out.tar.gz> [revision]}
rev=${2:-HEAD}
root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
cd "$root"

# COPY sources of the Dockerfile (every argument but the last; `COPY --from=...` copies from a
# build stage, not from the context, and is skipped).
mapfile -t paths < <(
  awk 'toupper($1) == "COPY" && $2 !~ /^--from=/ { for (i = 2; i < NF; i++) if ($i !~ /^--/) print $i }' \
    backoffice/Dockerfile
)
paths+=(backoffice)
mapfile -t paths < <(printf '%s\n' "${paths[@]}" | sed 's#/*$##; s#^\./##' | sort -u)

for p in "${paths[@]}"; do
  case "$p" in
    "" | /* | *..*) echo "build-deploy-archive: refusing COPY source '$p'" >&2; exit 1 ;;
  esac
  if [ -z "$(git ls-tree -r --name-only "$rev" -- "$p" | head -n 1)" ]; then
    echo "build-deploy-archive: '$p' (COPY in backoffice/Dockerfile) is not tracked in $rev" >&2
    exit 1
  fi
done

git archive --format=tar.gz -o "$out" "$rev" -- "${paths[@]}"
echo "build-deploy-archive: wrote $out (${paths[*]})" >&2
