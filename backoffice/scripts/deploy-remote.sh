#!/usr/bin/env bash
# Runs ON THE VPS, called over SSH by .github/workflows/backoffice-deploy.yml (see README.md,
# « Déploiement automatique depuis GitHub »). Layout under <path> (relative to $HOME or absolute):
#   releases/<sha>/   one extracted archive per deployed commit (the 3 most recent are kept)
#   current           symlink to the live release (switched atomically)
#   shared/.env       DOMAIN, ADMIN_PASSWORD_HASH, SESSION_SECRET (chmod 600, created once)
#   shared/backups/   target of scripts/backup.sh (kept across releases)
#
#   deploy-remote.sh preflight   <path> [proxy] [app_port]
#   deploy-remote.sh activate    <path> <sha> <domain> <rotate:true|false> [proxy] [app_port]
#                                (stdin: password hash)
#   deploy-remote.sh local-check <path> <app_port>    prints the manifest served on 127.0.0.1
#   deploy-remote.sh diagnose    <path> [proxy] [app_port]
#
# proxy (default caddy):
#   caddy  the bundled Caddy container owns ports 80/443 and gets the certificate itself;
#   nginx  the VPS already runs Nginx on 80/443 (other sites, managed by root: this script never
#          touches Nginx nor /etc). No Caddy container; the app is published on
#          127.0.0.1:<app_port> only (docker-compose.nginx.yml) and Nginx proxies to it. An existing
#          Caddy container of the project is removed (its volumes are kept).
# app_port (default 8787): loopback port of the app in nginx mode.
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

proxy=caddy
app_port=8787
# Validates and sets $proxy / $app_port (empty values = defaults).
set_proxy() {
  proxy=${1:-caddy}
  app_port=${2:-8787}
  [[ "$proxy" =~ ^(nginx|caddy)$ ]] || die "invalid proxy mode (nginx or caddy expected)"
  [[ "$app_port" =~ ^[1-9][0-9]{3,4}$ ]] && [ "$app_port" -ge 1024 ] && [ "$app_port" -le 65535 ] ||
    die "invalid app port (1024-65535 expected)"
}

compose() {
  local dir=$1
  shift
  local files=(-f "$dir/docker-compose.yml")
  if [ "$proxy" = nginx ]; then
    [ -f "$dir/docker-compose.nginx.yml" ] || die "this release has no docker-compose.nginx.yml (nginx mode unavailable)"
    files+=(-f "$dir/docker-compose.nginx.yml")
  fi
  APP_PORT=$app_port docker compose -p "$PROJECT" --project-directory "$dir" "${files[@]}" --env-file "$env_file" "$@"
}

# Prints "yes" when something listens on TCP port $1, "no" when nothing does, "?" when unknown.
port_in_use() {
  local busy
  if command -v ss >/dev/null 2>&1; then
    busy=$(ss -Hltn "sport = :$1" 2>/dev/null || true)
  elif command -v netstat >/dev/null 2>&1; then
    busy=$(netstat -ltn 2>/dev/null | awk -v p=":$1" '$4 ~ p"$"' || true)
  else
    echo "?"
    return
  fi
  if [ -n "$busy" ]; then echo yes; else echo no; fi
}

# Containers (any state) of a service of our compose project.
project_containers() {
  docker ps -aq --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=$1" 2>/dev/null || true
}

preflight() {
  command -v docker >/dev/null 2>&1 || die "docker is not installed on the VPS: $INSTALL_HINT"
  docker compose version >/dev/null 2>&1 || die "the 'docker compose' plugin (v2) is missing on the VPS: $INSTALL_HINT"
  docker info >/dev/null 2>&1 ||
    die "user $(id -un) cannot talk to the Docker daemon (is it running? is $(id -un) in the 'docker' group? sudo usermod -aG docker $(id -un))"
  command -v tar >/dev/null 2>&1 || die "tar is not installed on the VPS"

  if [ "$proxy" = nginx ]; then
    preflight_nginx
  else
    preflight_caddy
  fi
  echo "preflight: proxy $proxy, docker $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo '?'), $(docker compose version --short 2>/dev/null || echo 'compose ?')"
}

preflight_caddy() {
  # Ports 80/443: fine when they are held by our own Caddy container, suspicious otherwise.
  local ours=""
  ours=$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=caddy" 2>/dev/null || true)
  local port
  for port in 80 443; do
    case "$(port_in_use "$port")" in
      "?") warn "neither ss nor netstat is available: cannot check whether port $port is free" ;;
      yes)
        [ -z "$ours" ] &&
          warn "port $port is already in use on the VPS by another program (not the PixelJoy Caddy container). Caddy will fail to start until it is freed (sudo ss -ltnp 'sport = :$port' shows which program). If the VPS already runs Nginx, deploy with proxy=nginx (README, « Derrière un Nginx existant »)."
        ;;
    esac
  done
}

preflight_nginx() {
  # 80/443 belong to the host's Nginx: never required to be free in this mode.
  # The loopback app port must be free, or already published by our own app container.
  local ours="" id
  for id in $(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=app" 2>/dev/null || true); do
    if docker port "$id" 8080/tcp 2>/dev/null | grep -Eq "^127\.0\.0\.1:$app_port\$"; then ours=$id; fi
  done
  case "$(port_in_use "$app_port")" in
    "?") warn "neither ss nor netstat is available: cannot check whether port $app_port is free" ;;
    yes)
      [ -n "$ours" ] ||
        die "port $app_port is already used on the VPS by another program (not the PixelJoy app container): choose another app_port (workflow input or APP_PORT variable) and use it in the Nginx proxy_pass, or free it (sudo ss -ltnp 'sport = :$app_port' shows which program)"
      ;;
  esac
  if [ "$(port_in_use 443)" = no ]; then
    warn "nothing listens on port 443: the app will run on 127.0.0.1:$app_port but stays unreachable from the Internet until Nginx is configured (README, « Derrière un Nginx existant »)"
  fi
  if [ -n "$(project_containers caddy)" ]; then
    echo "preflight: a PixelJoy Caddy container exists, it will be removed (volumes kept)"
  fi
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
    sync_proxy_env
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
  sync_proxy_env
  local current_domain
  current_domain=$(sed -n 's/^DOMAIN=//p' "$env_file" | tail -n 1)
  if [ "$current_domain" != "$domain" ]; then
    warn "DOMAIN in $env_file is '$current_domain' but the workflow input is '$domain': the server keeps '$current_domain' (edit shared/.env on the VPS to change it) and the smoke test checks '$domain'."
  fi
}

# Keeps COMPOSE_FILE / APP_PORT in shared/.env in line with the proxy mode, so that manual
# `docker compose ...` commands (and scripts/backup.sh) in current/backoffice use the same files.
# Other lines are kept as they are.
sync_proxy_env() {
  PROXY="$proxy" PORT="$app_port" awk '
    /^(COMPOSE_FILE|APP_PORT)=/ { next }
    { print }
    END {
      if (ENVIRON["PROXY"] == "nginx") {
        print "COMPOSE_FILE=docker-compose.yml:docker-compose.nginx.yml"
        print "APP_PORT=" ENVIRON["PORT"]
      }
    }
  ' "$env_file" | write_private "$env_file"
}

# nginx mode: removes the project's Caddy container(s) left by a previous caddy-mode deployment
# (possibly failing on ports 80/443 held by Nginx). `docker rm` without -v: the named volumes
# (caddy-data, caddy-config, catalog-data) are kept.
remove_caddy() {
  local ids
  ids=$(project_containers caddy)
  [ -n "$ids" ] || return 0
  # shellcheck disable=SC2086 # container ids
  docker rm -f $ids >/dev/null
  echo "cleanup: removed the PixelJoy Caddy container (nginx mode, volumes kept)"
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
  [ "$proxy" = nginx ] && remove_caddy
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
  if [ "$proxy" = nginx ]; then
    echo "local check: http://127.0.0.1:$app_port/catalog/v1/manifest.json"
    fetch_local "$app_port" | head -c 300 || echo "(no answer on 127.0.0.1:$app_port)"
    echo
  fi
  # Server and Caddy logs contain no secret (no access log, configuration values are never printed).
  compose "$live" logs --no-color --tail=100 || true
}

# GET http://127.0.0.1:<port>/catalog/v1/manifest.json (curl, else wget), body on stdout.
fetch_local() {
  local url="http://127.0.0.1:$1/catalog/v1/manifest.json"
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --max-time 10 "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -T 10 -O - "$url"
  else
    die "neither curl nor wget is installed on the VPS (sudo apt install curl)"
  fi
}

case "$cmd" in
  preflight)
    set_proxy "${3:-}" "${4:-}"
    preflight
    ;;
  activate)
    set_proxy "${6:-}" "${7:-}"
    activate "${3:-}" "${4:-}" "${5:-}"
    ;;
  local-check)
    set_proxy nginx "${3:-}"
    fetch_local "$app_port"
    ;;
  diagnose)
    set_proxy "${3:-}" "${4:-}"
    diagnose
    ;;
  *) die "usage: deploy-remote.sh preflight|activate|local-check|diagnose <path> ..." ;;
esac
