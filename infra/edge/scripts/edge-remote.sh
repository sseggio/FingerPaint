#!/usr/bin/env bash
# Run ON THE VPS by .github/workflows/edge-deploy.yml, as the SSH deployment user (docker group, NO
# sudo). Installs/updates the shared Traefik ("edge" stack) of this folder WITHOUT touching anything
# else on the VPS (no Nginx, no /etc, no other project):
#
#   edge-remote.sh activate <base> <sha>   (stdin: one line, the ACME email, may be empty)
#       <base>/releases/<sha>  this folder, already uploaded by the workflow
#       <base>/shared/.env     created on the first run (ACME_EMAIL), kept afterwards
#       <base>/current         symlink switched atomically to releases/<sha>
#     Checks Docker, the "edge" network (created if missing, fixed subnet 172.30.0.0/24), the
#     compose configuration, pulls the images, then:
#       - Traefik of project "edge" already runs, or ports 80 AND 443 are free: up -d --wait
#       - otherwise (ports still held, e.g. by the host's Nginx): Traefik is NOT started; success
#         with a warning. It starts on the next run, once the other projects have migrated
#         (infra/edge/CONTRACT.md, « Ordre de bascule »).
#     Last line of stdout: EDGE_STATUS=started | EDGE_STATUS=deferred
#   edge-remote.sh diagnose <base>         docker compose ps + last log lines (read-only)
#
# Fixed compose project name "edge" (name: in docker-compose.yml + -p): the acme volume (Let's
# Encrypt certificates) persists across releases. Never "down -v".
set -euo pipefail

PROJECT=edge
EDGE_SUBNET=172.30.0.0/24
EDGE_GATEWAY=172.30.0.1
EDGE_IP_RANGE=172.30.0.128/25
KEEP_RELEASES=5

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo "==> $*"; }
warn() { echo "WARNING: $*" >&2; }

valid_sha() { [[ "$1" =~ ^[0-9a-f]{40}$ ]]; }

resolve_base() { # "~/x" or "x" = relative to $HOME
  local b=${1#\~/}
  [[ "$b" =~ ^/?[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$ ]] && [[ "$b" != *..* ]] || die "invalid base path"
  [[ "$b" == /* ]] || b="$HOME/$b"
  printf '%s' "$b"
}

compose() { # $1 = project directory, then the docker compose arguments
  local dir=$1; shift
  docker compose -p "$PROJECT" --project-directory "$dir" -f "$dir/docker-compose.yml" \
    --env-file "$BASE/shared/.env" "$@"
}

check_docker() {
  command -v docker >/dev/null 2>&1 || die "docker not found on the VPS"
  docker info >/dev/null 2>&1 ||
    die "cannot talk to the Docker daemon: is $(id -un) in the docker group? (no sudo is used)"
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 plugin not found (docker compose)"
  command -v ss >/dev/null 2>&1 || die "ss (iproute2) not found: needed to check ports 80/443"
}

ensure_network() {
  local subnet
  if ! subnet=$(docker network inspect edge --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}' 2>/dev/null); then
    info "creating the Docker network edge ($EDGE_SUBNET)"
    docker network create --subnet "$EDGE_SUBNET" --gateway "$EDGE_GATEWAY" --ip-range "$EDGE_IP_RANGE" edge >/dev/null ||
      die "could not create the Docker network edge (another network may overlap 172.30.0.0/24: infra/edge/README.md, step 3)"
    subnet=$(docker network inspect edge --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}')
  fi
  subnet=${subnet%% *}
  [ "$subnet" = "$EDGE_SUBNET" ] ||
    die "network edge uses subnet '$subnet' instead of $EDGE_SUBNET: recreate it (infra/edge/README.md, « Le réseau edge existe déjà sans le bon sous-réseau »)"
  info "network edge: $subnet"
}

valid_email() { [[ "$1" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,63}$ ]]; }

# shared/.env: created once. Traefik's compose file requires a non-empty ACME_EMAIL
# (${ACME_EMAIL:?}), so the GitHub secret ACME_EMAIL is mandatory on the first run only.
ensure_env() {
  local email=$1 env="$BASE/shared/.env" current
  mkdir -p "$BASE/shared"
  chmod 700 "$BASE/shared"
  if [ -f "$env" ]; then
    chmod 600 "$env"
    current=$(sed -n 's/^ACME_EMAIL=//p' "$env" | tail -n 1)
    if [ -n "$current" ]; then
      info "shared/.env kept (ACME_EMAIL already set)"
      return 0
    fi
    [ -n "$email" ] || die "ACME_EMAIL is empty in $env: set the GitHub secret ACME_EMAIL (Let's Encrypt account email) and run the workflow again"
    valid_email "$email" || die "the ACME_EMAIL secret is not a valid email address"
    local tmp="$env.tmp"
    (umask 077; { grep -v '^ACME_EMAIL=' "$env" || true; printf 'ACME_EMAIL=%s\n' "$email"; } > "$tmp")
    mv -f "$tmp" "$env"
    info "shared/.env: ACME_EMAIL filled in"
    return 0
  fi
  [ -n "$email" ] || die "first run: the GitHub secret ACME_EMAIL is required (email of the Let's Encrypt account; Traefik's configuration refuses an empty ACME_EMAIL). Add it to the repository or to the chosen environment, then run the workflow again"
  valid_email "$email" || die "the ACME_EMAIL secret is not a valid email address"
  (umask 077; printf 'ACME_EMAIL=%s\nACME_CA_SERVER=\n' "$email" > "$env.tmp")
  mv -f "$env.tmp" "$env"
  info "shared/.env created (ACME_EMAIL from the secret, Let's Encrypt production)"
}

port_busy() { # $1 = TCP port; any listener on any address
  [ -n "$(ss -Hltn "sport = :$1" 2>/dev/null)" ]
}

traefik_running() {
  [ -n "$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=traefik" --filter status=running)" ]
}

switch_current() { # $1 = sha
  ln -sfn "releases/$1" "$BASE/current.tmp"
  mv -Tf "$BASE/current.tmp" "$BASE/current"
  info "current -> releases/$1"
}

prune_releases() { # keep the newest KEEP_RELEASES releases, never the current one
  local cur keep=0 r
  cur=$(readlink "$BASE/current" || true)
  cur=${cur#releases/}
  while IFS= read -r r; do
    [ -n "$r" ] || continue
    keep=$((keep + 1))
    if [ "$r" != "$cur" ] && [ "$keep" -gt "$KEEP_RELEASES" ] && valid_sha "$r"; then
      rm -rf "${BASE:?}/releases/$r"
    fi
  done < <(find "$BASE/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %f\n' | sort -rn | cut -d' ' -f2)
}

activate() {
  local sha=$1 email rel
  valid_sha "$sha" || die "invalid sha"
  rel="$BASE/releases/$sha"
  [ -f "$rel/docker-compose.yml" ] && [ -d "$rel/dynamic" ] || die "release $sha not found in $BASE/releases"
  email=""
  IFS= read -r email || true
  email=${email%$'\r'}

  check_docker
  ensure_network
  ensure_env "$email"
  # .env next to docker-compose.yml: "cd <base>/current && docker compose up -d" works by hand too.
  ln -sfn ../../shared/.env "$rel/.env"

  compose "$rel" config -q || die "docker compose config failed for the edge stack"
  info "pulling the images (before any switch)"
  compose "$rel" pull --quiet || die "docker compose pull failed"
  switch_current "$sha"
  prune_releases

  local mode
  if traefik_running; then
    mode="update (Traefik of project $PROJECT already runs)"
  elif ! port_busy 80 && ! port_busy 443; then
    mode="first start (ports 80 and 443 are free)"
  else
    local held=""
    port_busy 80 && held="80"
    port_busy 443 && held="${held:+$held, }443"
    warn "ports 80/443 encore utilisés (Nginx hôte) : Traefik prêt, sera démarré au prochain lancement une fois les autres projets migrés (port(s) occupé(s) : $held ; infra/edge/CONTRACT.md, « Ordre de bascule »)"
    echo "EDGE_STATUS=deferred"
    return 0
  fi
  info "$mode: docker compose up -d --wait"
  compose "$BASE/current" up -d --wait --remove-orphans || die "docker compose up failed (see the diagnostics step)"
  echo "EDGE_STATUS=started"
}

diagnose() {
  set +e
  compose "$BASE/current" ps
  compose "$BASE/current" logs --tail 100 traefik
  ss -Hltn 'sport = :80 or sport = :443'
  return 0
}

[ $# -ge 2 ] || die "usage: edge-remote.sh activate <base> <sha> | diagnose <base>"
cmd=$1
BASE=$(resolve_base "$2")
case "$cmd" in
  activate)
    [ $# -eq 3 ] || die "usage: edge-remote.sh activate <base> <sha>"
    activate "$3"
    ;;
  diagnose) diagnose ;;
  *) die "usage: edge-remote.sh activate <base> <sha> | diagnose <base>" ;;
esac
