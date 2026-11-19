#!/usr/bin/env bash
# Read-only checks before switching Affiny pre-production to the shared Traefik (MIGRATION.md, B/C).
# Run from /opt/affiny/deploy/preprod, next to docker-compose.yml and docker-compose.traefik.yml:
#   bash preflight.sh
# Changes nothing. Exit code 0 = ready.
set -euo pipefail

fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "OK:   $*"; }

# 1. Docker Compose >= 2.24.4 ("ports: !reset []" in docker-compose.traefik.yml).
version=$(docker compose version --short 2>/dev/null) || fail "docker compose (v2 plugin) not found"
version=${version#v}
major=$(echo "$version" | cut -d. -f1)
minor=$(echo "$version" | cut -d. -f2)
patch=$(echo "$version" | cut -d. -f3 | sed 's/[^0-9].*//')
if [ "$major" -gt 2 ] ||
  { [ "$major" -eq 2 ] && [ "$minor" -gt 24 ]; } ||
  { [ "$major" -eq 2 ] && [ "$minor" -eq 24 ] && [ "${patch:-0}" -ge 4 ]; }; then
  ok "Docker Compose $version"
else
  fail "Docker Compose $version is too old: >= 2.24.4 required (apt install docker-compose-plugin)"
fi

# 2. Shared network "edge" with its fixed subnet (Traefik = 172.30.0.2).
subnet=$(docker network inspect edge --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}' 2>/dev/null) ||
  fail "Docker network 'edge' does not exist (infra/edge/README.md, step 3)"
[ "$subnet" = "172.30.0.0/24" ] || fail "network 'edge' uses subnet '$subnet' instead of 172.30.0.0/24"
ok "network edge ($subnet)"

# 3. Files in place, merged configuration valid, host ports really gone.
for f in docker-compose.yml docker-compose.traefik.yml backoffice-nginx.conf .env; do
  [ -f "$f" ] || fail "$f missing in $(pwd)"
done
[ -d backoffice ] || fail "./backoffice (static build of the back-office) missing in $(pwd)"
[ -f backoffice/index.html ] || echo "WARN: ./backoffice/index.html missing (admin site will answer 404)"
merged=$(docker compose -f docker-compose.yml -f docker-compose.traefik.yml --env-file .env config) ||
  fail "docker compose config failed"
if echo "$merged" | grep -q 'published: "1300[04]"'; then
  fail "ports 13000/13004 still published in the merged configuration"
fi
echo "$merged" | grep -q 'affiny-ws.rule: Host(`api\.' || fail "Traefik labels not found (PREPROD_DOMAIN?)"
ok "docker compose config (base + traefik override)"
echo "Ready."
