/**
 * Simulation of scripts/deploy-remote.sh (run on the VPS by the deploy workflow) with a fake
 * `docker` on PATH, plus `docker compose config` of the three proxy modes and of infra/edge when a
 * Docker CLI is available.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const BACKOFFICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(BACKOFFICE, '..');
const SCRIPT = join(BACKOFFICE, 'scripts', 'deploy-remote.sh');
const SHA = 'a'.repeat(40);
const HASH = 'scrypt:32768:8:1:c2FsdA:aGFzaA';

/**
 * Fake Docker CLI. State = files in $FAKE_STATE: edge (network exists; content = its subnet, empty =
 * 172.30.0.0/24), traefik-ip (Traefik's address on it, default 172.30.0.2), traefik (a Traefik container
 * runs on it), caddy / app (project containers exist), app-port (the app publishes 127.0.0.1:8787),
 * sticky-port (a plain `up` keeps that binding, only --force-recreate drops it). Every call is
 * appended to $FAKE_STATE/log.
 */
const FAKE_DOCKER = `#!/usr/bin/env bash
s=$FAKE_STATE
echo "docker $*" >> "$s/log"
case "$1" in
  info) exit 0 ;;
  version) echo 27.0.0; exit 0 ;;
  image) exit 0 ;;
  network)
    [ "$2" = inspect ] && [ "$3" = edge ] && [ -f "$s/edge" ] || exit 1
    if [ "$4" = --format ]; then
      subnet=$(cat "$s/edge"); echo "\${subnet:-172.30.0.0/24} "
    fi
    exit 0 ;;
  inspect) cat "$s/traefik-ip" 2>/dev/null || echo 172.30.0.2; exit 0 ;;
  ps)
    args="$*"
    case "$args" in
      *network=edge*) [ -f "$s/traefik" ] && echo "trid traefik:v3.7.19" ;;
      *service=caddy*) [ -f "$s/caddy" ] && echo caddyid ;;
      *service=app*) [ -f "$s/app" ] && echo appid ;;
    esac
    exit 0 ;;
  port) [ -f "$s/app-port" ] && echo "127.0.0.1:8787"; exit 0 ;;
  rm) rm -f "$s/caddy"; exit 0 ;;
  compose)
    args="$*"
    case "$args" in
      "compose version"*) echo 2.30.0; exit 0 ;;
      *" up "*)
        touch "$s/app"
        if [[ "$args" == *docker-compose.nginx.yml* ]]; then touch "$s/app-port"
        elif [[ "$args" == *--force-recreate* ]] || [ ! -f "$s/sticky-port" ]; then rm -f "$s/app-port"; fi
        exit 0 ;;
      *" exec "*) echo '{"v":1,"albums":[],"artworks":[]}'; exit 0 ;;
      *) exit 0 ;;
    esac ;;
esac
exit 0
`;

let root: string;
let home: string;
let state: string;
let bin: string;

function run(args: string[], stdin = '') {
  const res = spawnSync('bash', [SCRIPT, ...args], {
    input: stdin,
    encoding: 'utf8',
    env: { PATH: `${bin}:/usr/bin:/bin`, HOME: home, FAKE_STATE: state },
  });
  return { code: res.status, out: `${res.stdout}${res.stderr}` };
}

const log = () => (existsSync(join(state, 'log')) ? readFileSync(join(state, 'log'), 'utf8') : '');
const set = (...names: string[]) => names.forEach((n) => writeFileSync(join(state, n), ''));

function uploadRelease() {
  const dir = join(home, 'pj', 'releases', SHA, 'backoffice');
  mkdirSync(dir, { recursive: true });
  for (const f of ['docker-compose.yml', 'docker-compose.nginx.yml', 'docker-compose.traefik.yml', 'Caddyfile']) {
    copyFileSync(join(BACKOFFICE, f), join(dir, f));
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pj-deploy-'));
  home = join(root, 'home');
  state = join(root, 'state');
  bin = join(root, 'bin');
  for (const d of [home, state, bin]) mkdirSync(d);
  writeFileSync(join(bin, 'docker'), FAKE_DOCKER);
  chmodSync(join(bin, 'docker'), 0o755);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('deploy-remote.sh, traefik mode', () => {
  it('fails with a clear error when the edge network does not exist', () => {
    const { code, out } = run(['preflight', 'pj', 'traefik']);
    expect(code).not.toBe(0);
    expect(out).toMatch(/::error::.*network 'edge' does not exist/);
    expect(out).toMatch(/infra\/edge\/README\.md/);
  });

  it('activate stops before building when the edge network is missing', () => {
    uploadRelease();
    const { code, out } = run(['activate', 'pj', SHA, 'admin.example.com', 'false', 'traefik', ''], `${HASH}\n`);
    expect(code).not.toBe(0);
    expect(out).toMatch(/infra\/edge\/README\.md/);
    expect(log()).not.toMatch(/compose .* (build|up)/);
  });

  it('fails when the edge network does not use the fixed subnet', () => {
    writeFileSync(join(state, 'edge'), '172.18.0.0/16');
    const { code, out } = run(['preflight', 'pj', 'traefik']);
    expect(code).not.toBe(0);
    expect(out).toMatch(/::error::.*uses subnet '172\.18\.0\.0\/16' instead of 172\.30\.0\.0\/24/);
    expect(out).toMatch(/infra\/edge\/README\.md/);
  });

  it('warns when Traefik is not at its fixed address', () => {
    set('edge', 'traefik');
    writeFileSync(join(state, 'traefik-ip'), '172.30.0.140');
    const { code, out } = run(['preflight', 'pj', 'traefik']);
    expect(code).toBe(0);
    expect(out).toMatch(/::warning::the Traefik container on 'edge' has address '172\.30\.0\.140', not 172\.30\.0\.2/);
  });

  it('warns (without failing) when no Traefik runs on the edge network', () => {
    set('edge');
    const { code, out } = run(['preflight', 'pj', 'traefik']);
    expect(code).toBe(0);
    expect(out).toMatch(/::warning::no running Traefik container/);
    expect(out).toMatch(/preflight: proxy traefik/);
  });

  it('switches from nginx mode: Caddy removed without -v, no host port, COMPOSE_FILE updated', () => {
    set('edge', 'traefik', 'caddy', 'app', 'app-port');
    uploadRelease();
    mkdirSync(join(home, 'pj', 'shared'), { recursive: true });
    writeFileSync(
      join(home, 'pj', 'shared', '.env'),
      'DOMAIN=admin.example.com\nADMIN_PASSWORD_HASH=x\nSESSION_SECRET=y\nCOMPOSE_FILE=docker-compose.yml:docker-compose.nginx.yml\nAPP_PORT=8787\n',
    );
    const { code, out } = run(['activate', 'pj', SHA, 'admin.example.com', 'false', 'traefik', '8787'], `${HASH}\n`);
    expect(out).not.toMatch(/::error::/);
    expect(code).toBe(0);
    expect(out).toMatch(/will be recreated without it/);
    const calls = log();
    expect(calls).toMatch(/^docker rm -f caddyid$/m);
    expect(calls).not.toMatch(/docker rm .*-v/);
    expect(calls).toMatch(/compose .*-f \S+\/docker-compose\.traefik\.yml .* up -d --build --remove-orphans/);
    expect(calls).not.toMatch(/docker-compose\.nginx\.yml/);
    expect(calls).not.toMatch(/--force-recreate/);
    expect(existsSync(join(state, 'app-port'))).toBe(false);
    const envFile = readFileSync(join(home, 'pj', 'shared', '.env'), 'utf8');
    expect(envFile).toMatch(/^COMPOSE_FILE=docker-compose\.yml:docker-compose\.traefik\.yml$/m);
    expect(envFile).not.toMatch(/APP_PORT=/);
    expect(envFile).toMatch(/^SESSION_SECRET=y$/m);
  });

  it('force-recreates the app if it still publishes the nginx-mode port after up', () => {
    set('edge', 'traefik', 'app', 'app-port', 'sticky-port');
    uploadRelease();
    const { code, out } = run(['activate', 'pj', SHA, 'admin.example.com', 'false', 'traefik', ''], `${HASH}\n`);
    expect(code).toBe(0);
    expect(out).toMatch(/recreating it without/);
    expect(log()).toMatch(/up -d --force-recreate --no-deps app/);
    expect(existsSync(join(state, 'app-port'))).toBe(false);
  });

  it('local-check reads the manifest inside the app container (no host port)', () => {
    set('edge', 'traefik');
    uploadRelease();
    expect(run(['activate', 'pj', SHA, 'admin.example.com', 'false', 'traefik', ''], `${HASH}\n`).code).toBe(0);
    const { code, out } = run(['local-check', 'pj', '8787', 'traefik']);
    expect(code).toBe(0);
    expect(JSON.parse(out).v).toBe(1);
    expect(log()).toMatch(/compose .*docker-compose\.traefik\.yml .* exec -T app wget .*http:\/\/127\.0\.0\.1:8080\/catalog\/v1\/manifest\.json/);
  });

  it('rejects unknown proxy modes', () => {
    const { code, out } = run(['preflight', 'pj', 'apache']);
    expect(code).not.toBe(0);
    expect(out).toMatch(/invalid proxy mode \(traefik, nginx or caddy expected\)/);
  });

  it('nginx mode still writes APP_PORT and the nginx compose file', () => {
    set('app');
    uploadRelease();
    const { code } = run(['activate', 'pj', SHA, 'admin.example.com', 'false', 'nginx', '8787'], `${HASH}\n`);
    expect(code).toBe(0);
    const envFile = readFileSync(join(home, 'pj', 'shared', '.env'), 'utf8');
    expect(envFile).toMatch(/^COMPOSE_FILE=docker-compose\.yml:docker-compose\.nginx\.yml$/m);
    expect(envFile).toMatch(/^APP_PORT=8787$/m);
  });
});

describe('shell scripts', () => {
  it('parse with bash -n (and pass shellcheck when installed)', () => {
    const scripts = [SCRIPT, join(BACKOFFICE, 'scripts', 'build-deploy-archive.sh'), join(BACKOFFICE, 'scripts', 'backup.sh')];
    const affinyPreflight = join(REPO, 'infra', 'edge', 'examples', 'affiny', 'preflight.sh');
    for (const s of [...scripts, affinyPreflight]) expect(spawnSync('bash', ['-n', s]).status).toBe(0);
    if (spawnSync('shellcheck', ['--version']).status === 0) {
      // backup.sh predates this check (SC2012 info): only the deployment scripts are linted.
      const res = spawnSync('shellcheck', [...scripts.slice(0, 2), affinyPreflight], { encoding: 'utf8' });
      expect(res.stdout).toBe('');
      expect(res.status).toBe(0);
    }
  });
});

describe('Dockerfile', () => {
  it('sets no legacy TRUST_PROXY and trusts no proxy by default (TRUSTED_PROXIES empty)', () => {
    const dockerfile = readFileSync(join(BACKOFFICE, 'Dockerfile'), 'utf8');
    expect(dockerfile).not.toMatch(/TRUST_PROXY\b/);
    expect(dockerfile).toMatch(/^\s*TRUSTED_PROXIES=$/m);
  });
});

const hasCompose = spawnSync('docker', ['compose', 'version'], { encoding: 'utf8' }).status === 0;

interface ComposeService {
  ports?: { published?: string; host_ip?: string }[];
  networks?: Record<string, { ipv4_address?: string } | null>;
  environment?: Record<string, string>;
  healthcheck?: { test?: string[] };
  labels?: Record<string, string>;
  profiles?: string[];
  command?: string[];
  volumes?: { source?: string; target?: string; read_only?: boolean }[];
}
interface ComposeConfig {
  services: Record<string, ComposeService>;
  networks?: Record<string, { name?: string; external?: boolean; internal?: boolean }>;
}

function composeConfig(dir: string, files: string[], env: string): ComposeConfig {
  const envFile = join(root, 'compose.env');
  writeFileSync(envFile, env);
  const res = spawnSync(
    'docker',
    ['compose', '--project-directory', dir, ...files.flatMap((f) => ['-f', join(dir, f)]), '--env-file', envFile, 'config', '--format', 'json'],
    { encoding: 'utf8', env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: root } },
  );
  expect(res.stderr).not.toMatch(/error/i);
  expect(res.status).toBe(0);
  return JSON.parse(res.stdout) as ComposeConfig;
}

describe.skipIf(!hasCompose)('docker compose config', () => {
  const ENV = 'DOMAIN=admin.example.com\nADMIN_PASSWORD_HASH=\nSESSION_SECRET=\n';

  it('caddy mode: Caddy on 80/443, app without host port', () => {
    const c = composeConfig(BACKOFFICE, ['docker-compose.yml'], ENV);
    expect(c.services.app.ports ?? []).toEqual([]);
    expect(c.services.caddy.ports?.map((p) => p.published)).toEqual(['80', '443', '443']);
    expect(c.services.app.environment?.TRUSTED_PROXIES).toBe('caddy');
  });

  it('nginx mode: app on 127.0.0.1:8787 only, Caddy disabled', () => {
    const c = composeConfig(BACKOFFICE, ['docker-compose.yml', 'docker-compose.nginx.yml'], ENV);
    expect(c.services.app.ports).toEqual([expect.objectContaining({ host_ip: '127.0.0.1', published: '8787' })]);
    expect(c.services.app.environment?.TRUSTED_PROXIES).toBe('127.0.0.1, ::1, gateway');
    // Profile "caddy" not enabled: the service is left out of the effective configuration.
    expect(c.services.caddy).toBeUndefined();
  });

  it('traefik mode: app on networks default + external edge, labels, no host port, Caddy disabled', () => {
    const c = composeConfig(BACKOFFICE, ['docker-compose.yml', 'docker-compose.traefik.yml'], ENV);
    const app = c.services.app;
    expect(app.ports ?? []).toEqual([]);
    expect(app.environment?.TRUSTED_PROXIES).toBe('172.30.0.2');
    expect(app.environment?.TRUST_PROXY).toBeUndefined();
    expect(Object.keys(app.networks ?? {}).sort()).toEqual(['default', 'edge']);
    expect(c.networks?.edge).toEqual(expect.objectContaining({ name: 'edge', external: true }));
    expect(app.labels).toEqual(
      expect.objectContaining({
        'traefik.enable': 'true',
        'traefik.docker.network': 'edge',
        'traefik.http.routers.pixeljoy-catalog.rule': 'Host(`admin.example.com`)',
        'traefik.http.routers.pixeljoy-catalog.entrypoints': 'websecure',
        'traefik.http.routers.pixeljoy-catalog.tls.certresolver': 'letsencrypt',
        'traefik.http.services.pixeljoy-catalog.loadbalancer.server.port': '8080',
      }),
    );
    // Profile "caddy" not enabled: the service is left out of the effective configuration.
    expect(c.services.caddy).toBeUndefined();
  });

  it('infra/edge: Traefik behind a read-only socket proxy, no access log, no dashboard', () => {
    const edge = join(REPO, 'infra', 'edge');
    const c = composeConfig(edge, ['docker-compose.yml'], 'ACME_EMAIL=ops@example.com\nACME_CA_SERVER=\n');
    const traefik = c.services.traefik;
    const cmd = traefik.command ?? [];
    expect(cmd).toContain('--providers.docker.exposedByDefault=false');
    expect(cmd).toContain('--providers.docker.endpoint=tcp://socket-proxy:2375');
    expect(cmd).toContain('--certificatesResolvers.letsencrypt.acme.email=ops@example.com');
    expect(cmd).toContain('--certificatesResolvers.letsencrypt.acme.caServer=https://acme-v02.api.letsencrypt.org/directory');
    expect(cmd).toContain('--entryPoints.web.http.redirections.entryPoint.to=websecure');
    expect(cmd).toContain('--entryPoints.websecure.forwardedHeaders.insecure=false');
    expect(cmd).toContain('--global.sendAnonymousUsage=false');
    expect(cmd.some((a) => /accesslog|--api/i.test(a))).toBe(false);
    expect((traefik.volumes ?? []).some((v) => v.source === '/var/run/docker.sock')).toBe(false);
    expect((traefik.ports ?? []).map((p) => p.published).sort()).toEqual(['443', '443', '80']);
    const proxy = c.services['socket-proxy'];
    expect(proxy.volumes).toEqual([expect.objectContaining({ source: '/var/run/docker.sock', read_only: true })]);
    expect(Object.keys(proxy.networks ?? {})).toEqual(['socket']);
    expect(c.networks?.edge).toEqual(expect.objectContaining({ name: 'edge', external: true }));
    expect(c.networks?.socket?.internal).toBe(true);
    // Fixed address trusted by the apps; ping only on the container's loopback.
    expect(traefik.networks?.edge?.ipv4_address).toBe('172.30.0.2');
    expect(cmd).toContain('--entryPoints.ping.address=127.0.0.1:8082');
    expect(cmd).toContain('--ping.entryPoint=ping');
    expect(traefik.healthcheck?.test).toContain('--entryPoints.ping.address=127.0.0.1:8082');
  });

  // Reconstruction of Affiny's pre-production compose (other project of the VPS, separate repo).
  const AFFINY_PREPROD = `services:
  api:
    build: { context: ../.. }
    environment:
      NODE_ENV: production
      GATEWAY_PORT: "3000"
      CORS_ORIGIN: https://admin.\${PREPROD_DOMAIN}
      TRUST_PROXY: "1"
      REDIS_URL: redis://redis:6379
    ports: ["127.0.0.1:13000:3000", "127.0.0.1:13004:3004"]
    depends_on: [redis]
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://localhost:3000/health"]
  redis:
    image: redis:7-alpine
`;

  it('infra/edge/examples/affiny: override drops the host ports and routes api, socket.io and admin', () => {
    const dir = join(root, 'affiny', 'deploy', 'preprod');
    mkdirSync(join(dir, 'backoffice'), { recursive: true });
    writeFileSync(join(dir, 'docker-compose.yml'), AFFINY_PREPROD);
    const example = join(REPO, 'infra', 'edge', 'examples', 'affiny');
    for (const f of ['docker-compose.traefik.yml', 'backoffice-nginx.conf']) copyFileSync(join(example, f), join(dir, f));
    const env = 'PREPROD_DOMAIN=affiny.example.com\n';
    const base = composeConfig(dir, ['docker-compose.yml'], env);
    expect((base.services.api.ports ?? []).map((p) => p.published).sort()).toEqual(['13000', '13004']);

    const c = composeConfig(dir, ['docker-compose.yml', 'docker-compose.traefik.yml'], env);
    const api = c.services.api;
    expect(api.ports ?? []).toEqual([]);
    expect(api.environment?.TRUST_PROXY).toBe('1');
    expect(Object.keys(api.networks ?? {}).sort()).toEqual(['default', 'edge']);
    expect(api.labels).toEqual(
      expect.objectContaining({
        'traefik.enable': 'true',
        'traefik.docker.network': 'edge',
        'traefik.http.routers.affiny-api.rule': 'Host(`api.affiny.example.com`)',
        'traefik.http.routers.affiny-api.middlewares': 'affiny-compress',
        'traefik.http.services.affiny-api.loadbalancer.server.port': '3000',
        'traefik.http.routers.affiny-ws.rule': 'Host(`api.affiny.example.com`) && PathPrefix(`/socket.io/`)',
        'traefik.http.routers.affiny-ws.priority': '100',
        'traefik.http.routers.affiny-ws.service': 'affiny-ws',
        'traefik.http.services.affiny-ws.loadbalancer.server.port': '3004',
      }),
    );
    expect(api.labels?.['traefik.http.routers.affiny-ws.middlewares']).toBeUndefined();

    const bo = c.services.backoffice;
    expect(Object.keys(bo.networks ?? {})).toEqual(['edge']);
    expect(bo.ports ?? []).toEqual([]);
    expect(bo.volumes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: join(dir, 'backoffice'), target: '/srv/backoffice', read_only: true }),
        expect.objectContaining({ source: join(dir, 'backoffice-nginx.conf'), target: '/etc/nginx/nginx.conf', read_only: true }),
      ]),
    );
    expect(bo.labels?.['traefik.http.routers.affiny-admin.rule']).toBe('Host(`admin.affiny.example.com`)');
    expect(bo.labels?.['traefik.http.services.affiny-admin.loadbalancer.server.port']).toBe('8080');
    expect(c.services.redis.networks).toEqual({ default: null });
  });
});
