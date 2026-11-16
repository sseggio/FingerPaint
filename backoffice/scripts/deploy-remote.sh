#!/usr/bin/env bash
# Runs ON THE VPS, called over SSH by .github/workflows/backoffice-deploy.yml (see README.md,
# « Déploiement automatique depuis GitHub »). Layout under <path> (relative to $HOME or absolute):
#   releases/<sha>/   one extracted archive per deployed commit (the 3 most recent are kept)
#   current           symlink to the live release (switched atomically)
#   shared/.env       DOMAIN, ADMIN_PASSWORD_HASH, SESSION_SECRET (chmod 600, created once)
#   shared/backups/   target of scripts/backup.sh (kept across releases)
#
#   deploy-remote.sh preflight <path>
#   deploy-remote.sh activate  <path> <sha> <domain> <rotate:true|false>   (stdin: password hash)
#   deploy-remote.sh diagnose  <path>
#
# The data lives in Docker named volumes of the fixed compose project "pixeljoy-catalog"
# (pixeljoy-catalog_catalog-data, ...): they do not depend on the release folder.
set -euo pipefail

PROJECT=pixeljoy-catalog
KEEP_RELEASES=3
INSTALL_HINT='see backoffice/README.md, section "Déploiement automatique depuis GitHub" (curl -fsSL https://get.docker.com | sudo sh)'

die() { echo "::error::$*"; exit 1; }
warn() { echo "::warning::$*"; }

cmd=${1:-}
path=${2:-}
case "$path" in
  "" | *[!A-Za-z0-9._/-]* | *..* | -*) die "invalid deploy path" ;;
esac
cd "$HOME"
mkdir -p "$path"
cd "$path"
base=$(pwd -P)
shared="$base/shared"
env_file="$shared/.env"

compose() {
  local dir=$1
  shift
  docker compose -p "$PROJECT" --project-directory "$dir" -f "$dir/docker-compose.yml" --env-file "$env_file" "$@"
}

preflight() {
  command -v docker >/dev/null 2>&1 || die "docker is not installed on the VPS: $INSTALL_HINT"
  docker compose version >/dev/null 2>&1 || die "the 'docker compose' plugin (v2) is missing on the VPS: $INSTALL_HINT"
  docker info >/dev/null 2>&1 ||
    die "user $(id -un) cannot talk to the Docker daemon (is it running? is $(id -un) in the 'docker' group? sudo usermod -aG docker $(id -un))"
  command -v tar >/dev/null 2>&1 || die "tar is not installed on the VPS"

  # Ports 80/443: fine when they are held by our own Caddy container, suspicious otherwise.
  local ours=""
  ours=$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=caddy" 2>/dev/null || true)
  local port busy
  for port in 80 443; do
    busy=""
    if command -v ss >/dev/null 2>&1; then
      busy=$(ss -Hltn "sport = :$port" 2>/dev/null || true)
    elif command -v netstat >/dev/null 2>&1; then
      busy=$(netstat -ltn 2>/dev/null | awk -v p=":$port" '$4 ~ p"$"' || true)
    else
      warn "neither ss nor netstat is available: cannot check whether port $port is free"
      continue
    fi
    if [ -n "$busy" ] && [ -z "$ours" ]; then
      warn "port $port is already in use on the VPS by another program (not the PixelJoy Caddy container). Caddy will fail to start until it is freed (sudo ss -ltnp 'sport = :$port' shows which program)."
    fi
  done
  echo "preflight: docker $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo '?'), $(docker compose version --short 2>/dev/null || echo 'compose ?')"
}

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

# Writes stdin to $1 atomically with mode 600.
write_private() {
  local target=$1 tmp
  tmp=$(mktemp "$target.XXXXXX")
  chmod 600 "$tmp"
  cat >"$tmp"
  mv -f "$tmp" "$target"
}

setup_env() {
  local domain=$1 rotate=$2 hash=$3
  mkdir -p "$shared/backups"
  chmod 700 "$shared"
  if [ ! -f "$env_file" ]; then
    printf '%s\n' \
      '# Created by the GitHub "Backoffice deploy" workflow. Never commit this file.' \
      "DOMAIN=$domain" \
      "ADMIN_PASSWORD_HASH=$hash" \
      "SESSION_SECRET=$(random_secret)" | write_private "$env_file"
    echo "env: created $env_file (DOMAIN, ADMIN_PASSWORD_HASH, SESSION_SECRET)"
    return
  fi
  chmod 600 "$env_file"
  if [ "$rotate" = "true" ]; then
    HASH="$hash" awk '
      /^ADMIN_PASSWORD_HASH=/ { print "ADMIN_PASSWORD_HASH=" ENVIRON["HASH"]; done = 1; next }
      { print }
      END { if (!done) print "ADMIN_PASSWORD_HASH=" ENVIRON["HASH"] }
    ' "$env_file" | write_private "$env_file"
    echo "env: ADMIN_PASSWORD_HASH replaced (other values kept)"
  else
    echo "env: $env_file already exists, left unchanged"
  fi
  local current_domain
  current_domain=$(sed -n 's/^DOMAIN=//p' "$env_file" | tail -n 1)
  if [ "$current_domain" != "$domain" ]; then
    warn "DOMAIN in $env_file is '$current_domain' but the workflow input is '$domain': the server keeps '$current_domain' (edit shared/.env on the VPS to change it) and the smoke test checks '$domain'."
  fi
}

activate() {
  local sha=$1 domain=$2 rotate=$3 hash
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || die "invalid commit sha"
  [[ "$domain" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$ ]] || die "invalid domain"
  [[ "$rotate" =~ ^(true|false)$ ]] || die "invalid rotate flag"
  IFS= read -r hash || true
  [[ "$hash" =~ ^scrypt:[0-9]+:[0-9]+:[0-9]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$ ]] || die "invalid ADMIN_PASSWORD_HASH received"

  local release="$base/releases/$sha"
  [ -f "$release/backoffice/docker-compose.yml" ] || die "release $sha was not uploaded"
  touch "$release" # the most recently deployed releases are the ones kept

  preflight
  setup_env "$domain" "$rotate" "$hash"
  unset hash

  # Shared files inside the release (manual `docker compose` / backup.sh in current/backoffice work).
  ln -sfn ../../../shared/.env "$release/backoffice/.env"
  rm -rf "$release/backoffice/backups"
  ln -sfn ../../../shared/backups "$release/backoffice/backups"

  # Build before switching: a failed build leaves the live release untouched.
  echo "build: release $sha"
  compose "$release/backoffice" build

  ln -sfn "releases/$sha" "$base/current.tmp"
  mv -Tf "$base/current.tmp" "$base/current"
  echo "switch: current -> releases/$sha"

  # Physical path of current/backoffice: the Caddyfile bind mount then points into this release,
  # so Caddy is recreated with the new Caddyfile and never keeps a file from a pruned release.
  local live
  live="$(readlink -f "$base/current")/backoffice"
  compose "$live" up -d --build --remove-orphans
  docker image prune -f >/dev/null || true
  compose "$live" ps

  # Keep the most recent releases (and always the live one).
  local keep
  keep=$(basename "$(readlink -f "$base/current")")
  # shellcheck disable=SC2012 # release names are commit shas
  ls -1dt "$base"/releases/*/ 2>/dev/null | tail -n +$((KEEP_RELEASES + 1)) | while read -r dir; do
    dir=${dir%/}
    [ "$(basename "$dir")" = "$keep" ] && continue
    rm -rf "$dir"
    echo "prune: removed $(basename "$dir")"
  done
}

diagnose() {
  [ -L "$base/current" ] || { echo "no current release"; return 0; }
  local live
  live="$(readlink -f "$base/current")/backoffice"
  echo "current -> $(readlink "$base/current")"
  compose "$live" ps -a || true
  # Server and Caddy logs contain no secret (no access log, configuration values are never printed).
  compose "$live" logs --no-color --tail=100 || true
}

case "$cmd" in
  preflight) preflight ;;
  activate) activate "${3:-}" "${4:-}" "${5:-}" ;;
  diagnose) diagnose ;;
  *) die "usage: deploy-remote.sh preflight|activate|diagnose <path> ..." ;;
esac
