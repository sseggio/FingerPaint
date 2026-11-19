#!/usr/bin/env bash
# Run ON THE VPS by .github/workflows/edge-deploy.yml, as the SSH deployment user (docker group, NO
# sudo). Installs/updates the shared Traefik ("edge" stack) of this folder WITHOUT touching anything
# else on the VPS (no Nginx, no /etc, no other project):
#
#   edge-remote.sh activate <base> <sha>   (stdin: one line, the ACME email, may be empty)
#       <base>/releases/<sha>  this folder, already uploaded by the workflow
#       <base>/shared/.env     created on the first run (ACME_EMAIL), kept afterwards
#       <base>/current         symlink switched atomically to releases/<sha>
#       <base>/shared/dynamic  REAL directory mounted by Traefik (EDGE_DYNAMIC_DIR in shared/.env):
#                              the files of releases/<sha>/dynamic are copied into it one by one
#                              (temporary file + rename, in the same directory). Traefik's file
#                              provider watches it and reloads; the running container never depends
#                              on a release directory, so pruning or re-uploading a release is safe.
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

RECREATE_HINT="recreate it (infra/edge/README.md, « Le réseau edge existe déjà sans le bon sous-réseau »)"

ensure_network() {
  local cfg subnet iprange holder
  local fmt='{{range .IPAM.Config}}{{.Subnet}} {{.IPRange}}{{end}}'
  if ! cfg=$(docker network inspect edge --format "$fmt" 2>/dev/null); then
    info "creating the Docker network edge ($EDGE_SUBNET)"
    docker network create --subnet "$EDGE_SUBNET" --gateway "$EDGE_GATEWAY" --ip-range "$EDGE_IP_RANGE" edge >/dev/null ||
      die "could not create the Docker network edge (another network may overlap 172.30.0.0/24: infra/edge/README.md, step 3)"
    cfg=$(docker network inspect edge --format "$fmt")
  fi
  read -r subnet iprange _ <<<"$cfg" || true
  [ "${subnet:-}" = "$EDGE_SUBNET" ] ||
    die "network edge uses subnet '${subnet:-}' instead of $EDGE_SUBNET: $RECREATE_HINT"
  [ "${iprange:-}" = "$EDGE_IP_RANGE" ] ||
    die "network edge has ip-range '${iprange:-none}' instead of $EDGE_IP_RANGE (containers could get 172.30.0.2, Traefik's fixed address): $RECREATE_HINT"
  # 172.30.0.2 must be free or held by this stack's Traefik (edge-traefik-<n>).
  holder=$(docker network inspect edge --format '{{range .Containers}}{{.Name}} {{.IPv4Address}}{{"\n"}}{{end}}' 2>/dev/null |
    awk '$2 ~ /^172\.30\.0\.2\// {print $1}') || holder=""
  if [ -n "$holder" ] && ! [[ "$holder" =~ ^edge-traefik-[0-9]+$ ]]; then
    die "172.30.0.2 (Traefik's fixed address) is held by container '$holder' on network edge: disconnect it (docker network disconnect edge $holder) and reconnect it without a fixed IP (infra/edge/CONTRACT.md: never request an address in 172.30.0.0/25)"
  fi
  info "network edge: $subnet, ip-range $iprange"
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

# EDGE_DYNAMIC_DIR (managed by this script) = absolute path of shared/dynamic, mounted by Traefik.
ensure_dynamic_var() {
  local env="$BASE/shared/.env" line="EDGE_DYNAMIC_DIR=$BASE/shared/dynamic"
  grep -qxF "$line" "$env" && return 0
  (umask 077; { grep -v '^EDGE_DYNAMIC_DIR=' "$env" || true; printf '%s\n' "$line"; } > "$env.tmp")
  mv -f "$env.tmp" "$env"
  info "shared/.env: EDGE_DYNAMIC_DIR set to shared/dynamic"
}

# Copies releases/<sha>/dynamic/* into the stable shared/dynamic, file by file (rename in the same
# directory: Traefik never reads a half-written file; the bind-mounted directory keeps its inode),
# then removes the configuration files that no longer exist in the release.
sync_dynamic() { # $1 = release directory
  local src="$1/dynamic" dst="$BASE/shared/dynamic" f name
  mkdir -p "$dst"
  chmod 755 "$dst"
  for f in "$src"/*; do
    [ -f "$f" ] || continue
    name=${f##*/}
    if [ -f "$dst/$name" ] && cmp -s "$f" "$dst/$name"; then continue; fi
    # Hidden ".tmp" name: ignored by Traefik's file provider (it only loads .yml/.yaml/.toml).
    cp "$f" "$dst/.$name.tmp"
    chmod 644 "$dst/.$name.tmp"
    mv -f "$dst/.$name.tmp" "$dst/$name"
    info "dynamic: $name updated"
  done
  for f in "$dst"/*; do
    [ -f "$f" ] || continue
    name=${f##*/}
    if [ ! -e "$src/$name" ]; then rm -f "$f"; info "dynamic: $name removed"; fi
  done
}

port_busy() { # $1 = TCP port; any listener on any address. ss failure = considered busy.
  local out
  if ! out=$(ss -Hltn "sport = :$1" 2>/dev/null); then
    warn "ss failed while checking port $1: considered busy"
    return 0
  fi
  [ -n "$out" ]
}

traefik_running() {
  [ -n "$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=traefik" --filter status=running)" ]
}

switch_current() { # $1 = sha
  ln -sfn "releases/$1" "$BASE/current.tmp"
  mv -Tf "$BASE/current.tmp" "$BASE/current"
  info "current -> releases/$1"
}

# Release directories mounted by a container of the project (deployments made before shared/dynamic).
releases_in_use() {
  local ids
  ids=$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT") || return 0
  [ -n "$ids" ] || return 0
  # shellcheck disable=SC2086 # one argument per container id
  docker inspect --format '{{range .Mounts}}{{.Source}}{{"\n"}}{{end}}' $ids 2>/dev/null |
    sed -n "s|^$BASE/releases/\([0-9a-f]\{40\}\)\(/.*\)\{0,1\}$|\1|p" || true
}

# Keeps the newest KEEP_RELEASES releases; never removes the current one, the previous one ($1: a
# container created through the <base>/current symlink still uses the directory it resolved to) nor
# one mounted by a container of the project.
prune_releases() {
  local prev=$1 cur keep=0 r used
  cur=$(readlink "$BASE/current" || true)
  cur=${cur#releases/}
  used=$(releases_in_use)
  used+=$'\n'"$prev"
  while IFS= read -r r; do
    [ -n "$r" ] || continue
    keep=$((keep + 1))
    if [ "$r" != "$cur" ] && [ "$keep" -gt "$KEEP_RELEASES" ] && valid_sha "$r" && ! grep -qxF "$r" <<<"$used"; then
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
  ensure_dynamic_var
  # .env next to docker-compose.yml: "cd <base>/current && docker compose up -d" works by hand too.
  ln -sfn ../../shared/.env "$rel/.env"

  compose "$rel" config -q || die "docker compose config failed for the edge stack"
  info "pulling the images (before any switch)"
  compose "$rel" pull --quiet || die "docker compose pull failed"
  # docker-compose.yml changed since the running release: recreate Traefik explicitly.
  local recreate=()
  if [ -f "$BASE/current/docker-compose.yml" ] && ! cmp -s "$BASE/current/docker-compose.yml" "$rel/docker-compose.yml"; then
    recreate=(--force-recreate)
  fi
  sync_dynamic "$rel"
  local prev
  prev=$(readlink "$BASE/current" 2>/dev/null || true)
  prev=${prev#releases/}
  switch_current "$sha"
  prune_releases "$prev"

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
  info "$mode: docker compose up -d --wait ${recreate[*]}"
  compose "$BASE/current" up -d --wait --remove-orphans "${recreate[@]}" || die "docker compose up failed (see the diagnostics step)"
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
