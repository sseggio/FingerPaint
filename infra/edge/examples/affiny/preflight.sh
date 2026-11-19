#!/usr/bin/env bash
# Read-only checks before switching Affiny pre-production to the shared Traefik (MIGRATION.md, B/C).
# Run from /opt/affiny/deploy/preprod, next to docker-compose.yml and docker-compose.traefik.yml:
#   bash preflight.sh                                   (before the switch)
#   EXPECT_DOMAIN=affiny.krafting.be bash preflight.sh  (also checks the value of PREPROD_DOMAIN)
# Run it again right after adding COMPOSE_FILE to .env (MIGRATION.md, C.2): it then also checks the
# plain "docker compose --env-file .env config" used by Affiny's deployments.
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
# 4. .env intact: one PREPROD_DOMAIN line holding a bare domain (a line appended to a .env without a
# final newline would be glued to it: "PREPROD_DOMAIN=a.bCOMPOSE_FILE=...").
[ -z "$(tail -c1 .env)" ] || fail ".env does not end with a newline: fix it before appending anything (echo >> .env)"
count=$(grep -c '^PREPROD_DOMAIN=' .env || true)
[ "$count" = 1 ] || fail ".env must contain exactly one PREPROD_DOMAIN= line (found $count)"
domain=$(sed -n 's/^PREPROD_DOMAIN=//p' .env | tr -d '"'"'"'\r')
echo "$domain" | grep -Eq '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' ||
  fail "PREPROD_DOMAIN='$domain' is not a plain domain name"
if [ -n "${EXPECT_DOMAIN:-}" ] && [ "$domain" != "$EXPECT_DOMAIN" ]; then
  fail "PREPROD_DOMAIN='$domain' instead of '$EXPECT_DOMAIN'"
fi
ok "PREPROD_DOMAIN=$domain"

check_config() { # $1 = label, then the docker compose arguments
  label=$1; shift
  out=$(docker compose "$@" config) || fail "docker compose config failed ($label)"
  if echo "$out" | grep -Eq 'published: "?1300[04]"?'; then
    fail "ports 13000/13004 still published ($label)"
  fi
  echo "$out" | grep -Fq "affiny-api.rule: Host(\`api.$domain\`)" || fail "router affiny-api for api.$domain not found ($label)"
  echo "$out" | grep -Fq "affiny-admin.rule: Host(\`admin.$domain\`)" || fail "router affiny-admin for admin.$domain not found ($label)"
  ok "docker compose config: $label"
}
check_config "base + traefik override" -f docker-compose.yml -f docker-compose.traefik.yml --env-file .env

# 5. COMPOSE_FILE (after the switch): exact value, and the deployment's own command applies the override.
cf=$(grep -c '^COMPOSE_FILE=' .env || true)
if [ "$cf" != 0 ]; then
  [ "$cf" = 1 ] || fail ".env contains $cf COMPOSE_FILE= lines"
  grep -qx 'COMPOSE_FILE=docker-compose.yml:docker-compose.traefik.yml' .env ||
    fail "unexpected COMPOSE_FILE line: $(grep '^COMPOSE_FILE=' .env)"
  check_config "docker compose --env-file .env (Affiny's deployment command)" --env-file .env
else
  echo "INFO: no COMPOSE_FILE in .env yet (added at the switch, MIGRATION.md C.2)"
fi
echo "Ready."
