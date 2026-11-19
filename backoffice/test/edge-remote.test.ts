/**
 * Simulation of infra/edge/scripts/edge-remote.sh (run on the VPS by .github/workflows/edge-deploy.yml)
 * with fake `docker` and `ss` on PATH, plus static checks of the workflow (YAML, pinned actions,
 * no expression in scripts, shellcheck of every run block).
 */
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const BACKOFFICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(BACKOFFICE, '..');
const EDGE = join(REPO, 'infra', 'edge');
const WORKFLOW = join(REPO, '.github', 'workflows', 'edge-deploy.yml');
const SHA = 'b'.repeat(40);

/**
 * Fake Docker CLI. State in $FAKE_STATE: edge (network exists; content = subnet, empty = the right
 * one), traefik (a Traefik container of project "edge" runs), pull-fails. Every call is logged.
 */
const FAKE_DOCKER = `#!/usr/bin/env bash
s=$FAKE_STATE
echo "docker $*" >> "$s/log"
case "$1" in
  info) exit 0 ;;
  network)
    case "$2" in
      inspect)
        [ -f "$s/edge" ] || exit 1
        subnet=$(cat "$s/edge"); echo "\${subnet:-172.30.0.0/24}"; exit 0 ;;
      create) : > "$s/edge"; exit 0 ;;
    esac ;;
  ps) [ -f "$s/traefik" ] && echo trid; exit 0 ;;
  compose)
    args="$*"
    case "$args" in
      "compose version"*) echo "Docker Compose version v2.30.0"; exit 0 ;;
      *" pull"*) [ -f "$s/pull-fails" ] && exit 1; exit 0 ;;
      *" up "*) touch "$s/traefik"; exit 0 ;;
      *) exit 0 ;;
    esac ;;
esac
exit 0
`;

/** Fake ss: $FAKE_STATE/ports lists the busy TCP ports (one per line). */
const FAKE_SS = `#!/usr/bin/env bash
s=$FAKE_STATE
echo "ss $*" >> "$s/log"
[ -f "$s/ports" ] || exit 0
while read -r p; do
  [ -n "$p" ] || continue
  case "$*" in *":$p"|*":$p "*) echo "LISTEN 0 511 0.0.0.0:$p 0.0.0.0:*" ;; esac
done < "$s/ports"
exit 0
`;

let root: string;
let home: string;
let state: string;
let bin: string;

function release(sha = SHA): string {
  const dir = join(home, 'edge', 'releases', sha);
  mkdirSync(dir, { recursive: true });
  for (const f of ['docker-compose.yml', 'dynamic', 'scripts', '.env.example']) {
    cpSync(join(EDGE, f), join(dir, f), { recursive: true });
  }
  return dir;
}

function run(args: string[], stdin = '\n', sha = SHA) {
  const script = join(home, 'edge', 'releases', sha, 'scripts', 'edge-remote.sh');
  const res = spawnSync('bash', [script, ...args], {
    input: stdin,
    encoding: 'utf8',
    cwd: home,
    env: { PATH: `${bin}:/usr/bin:/bin`, HOME: home, FAKE_STATE: state },
  });
  return { code: res.status, out: `${res.stdout}${res.stderr}`, stdout: res.stdout };
}

const log = () => (existsSync(join(state, 'log')) ? readFileSync(join(state, 'log'), 'utf8') : '');
const envFile = () => join(home, 'edge', 'shared', '.env');
const busy = (...ports: number[]) => writeFileSync(join(state, 'ports'), ports.map((p) => `${p}\n`).join(''));

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'edge-remote-'));
  home = join(root, 'home');
  state = join(root, 'state');
  bin = join(root, 'bin');
  for (const d of [home, state, bin]) mkdirSync(d, { recursive: true });
  writeFileSync(join(bin, 'docker'), FAKE_DOCKER);
  writeFileSync(join(bin, 'ss'), FAKE_SS);
  chmodSync(join(bin, 'docker'), 0o755);
  chmodSync(join(bin, 'ss'), 0o755);
  writeFileSync(join(state, 'edge'), '');
  release();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('edge-remote.sh activate', () => {
  it('first run without ACME_EMAIL: clear error, nothing created nor started', () => {
    const r = run(['activate', '~/edge', SHA], '\n');
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/secret ACME_EMAIL is required/);
    expect(existsSync(envFile())).toBe(false);
    expect(existsSync(join(home, 'edge', 'current'))).toBe(false);
    expect(log()).not.toMatch(/ pull| up /);
  });

  it('rejects an invalid email', () => {
    const r = run(['activate', '~/edge', SHA], 'not an email\n');
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/not a valid email/);
    expect(existsSync(envFile())).toBe(false);
  });

  it('ports 80/443 held (host Nginx): prepares, pulls, switches current, does NOT start Traefik, succeeds with a warning', () => {
    busy(80, 443);
    const r = run(['activate', '~/edge', SHA], 'ops@example.com\n');
    expect(r.code).toBe(0);
    expect(r.out).toContain('ports 80/443 encore utilisés (Nginx hôte) : Traefik prêt, sera démarré au prochain lancement une fois les autres projets migrés');
    expect(r.stdout.trim().split('\n').pop()).toBe('EDGE_STATUS=deferred');
    expect(log()).toMatch(/docker compose -p edge .* pull/);
    expect(log()).not.toMatch(/ up /);
    expect(readFileSync(envFile(), 'utf8')).toBe('ACME_EMAIL=ops@example.com\nACME_CA_SERVER=\n');
    expect(statSync(envFile()).mode & 0o777).toBe(0o600);
    expect(readlinkSync(join(home, 'edge', 'current'))).toBe(`releases/${SHA}`);
    expect(readlinkSync(join(home, 'edge', 'releases', SHA, '.env'))).toBe('../../shared/.env');
    // The email never appears in the output.
    expect(r.out).not.toContain('ops@example.com');
  });

  it('only one of the two ports held: still deferred', () => {
    busy(443);
    const r = run(['activate', '~/edge', SHA], 'ops@example.com\n');
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/EDGE_STATUS=deferred\s*$/);
    expect(log()).not.toMatch(/ up /);
  });

  it('ports free: docker compose -p edge up -d --wait, EDGE_STATUS=started', () => {
    const r = run(['activate', '~/edge', SHA], 'ops@example.com\n');
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/EDGE_STATUS=started\s*$/);
    expect(log()).toMatch(/docker compose -p edge --project-directory \S+\/edge\/current .*--env-file \S+\/edge\/shared\/\.env up -d --wait/);
    expect(log()).not.toMatch(/down/);
  });

  it('Traefik of project edge already runs (it holds 80/443): updates it', () => {
    writeFileSync(join(state, 'traefik'), '');
    busy(80, 443);
    mkdirSync(join(home, 'edge', 'shared'), { recursive: true });
    writeFileSync(envFile(), 'ACME_EMAIL=ops@example.com\nACME_CA_SERVER=\n');
    const r = run(['activate', '~/edge', SHA], '\n');
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/update/);
    expect(r.stdout).toMatch(/EDGE_STATUS=started\s*$/);
    expect(log()).toMatch(/ up -d --wait/);
  });

  it('keeps an existing shared/.env (secret ignored) and is idempotent', () => {
    expect(run(['activate', '~/edge', SHA], 'ops@example.com\n').code).toBe(0);
    const r = run(['activate', '~/edge', SHA], 'other@example.com\n');
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/shared\/\.env kept/);
    expect(readFileSync(envFile(), 'utf8')).toBe('ACME_EMAIL=ops@example.com\nACME_CA_SERVER=\n');
    expect(r.stdout).toMatch(/EDGE_STATUS=started\s*$/);
  });

  it('fills an empty ACME_EMAIL in an existing shared/.env, or fails clearly without the secret', () => {
    mkdirSync(join(home, 'edge', 'shared'), { recursive: true });
    writeFileSync(envFile(), 'ACME_EMAIL=\nACME_CA_SERVER=\n');
    const bad = run(['activate', '~/edge', SHA], '\n');
    expect(bad.code).not.toBe(0);
    expect(bad.out).toMatch(/ACME_EMAIL is empty/);
    expect(run(['activate', '~/edge', SHA], 'ops@example.com\n').code).toBe(0);
    expect(readFileSync(envFile(), 'utf8')).toBe('ACME_CA_SERVER=\nACME_EMAIL=ops@example.com\n');
  });

  it('creates the edge network with the fixed subnet when missing', () => {
    rmSync(join(state, 'edge'));
    const r = run(['activate', '~/edge', SHA], 'ops@example.com\n');
    expect(r.code).toBe(0);
    expect(log()).toContain('docker network create --subnet 172.30.0.0/24 --gateway 172.30.0.1 --ip-range 172.30.0.128/25 edge');
  });

  it('wrong subnet on the edge network: stops before pull, current not switched', () => {
    writeFileSync(join(state, 'edge'), '10.0.0.0/24');
    const r = run(['activate', '~/edge', SHA], 'ops@example.com\n');
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/instead of 172\.30\.0\.0\/24/);
    expect(log()).not.toMatch(/ pull| up /);
    expect(existsSync(join(home, 'edge', 'current'))).toBe(false);
  });

  it('pull failure: current not switched, nothing started', () => {
    writeFileSync(join(state, 'pull-fails'), '');
    const r = run(['activate', '~/edge', SHA], 'ops@example.com\n');
    expect(r.code).not.toBe(0);
    expect(existsSync(join(home, 'edge', 'current'))).toBe(false);
    expect(log()).not.toMatch(/ up /);
  });

  it('switches current atomically to the new release and keeps 5 releases', () => {
    const shas = ['1', '2', '3', '4', '5', '6', '7'].map((c) => c.repeat(40));
    shas.forEach((s, i) => {
      const dir = release(s);
      const t = new Date(Date.UTC(2026, 0, 1 + i));
      utimesSync(dir, t, t);
    });
    const r = run(['activate', '~/edge', shas[6]!], 'ops@example.com\n', shas[6]);
    expect(r.code).toBe(0);
    expect(lstatSync(join(home, 'edge', 'current')).isSymbolicLink()).toBe(true);
    expect(readlinkSync(join(home, 'edge', 'current'))).toBe(`releases/${shas[6]}`);
    expect(readdirSync(join(home, 'edge', 'releases'))).toHaveLength(5);
    expect(existsSync(join(home, 'edge', 'releases', shas[6]!))).toBe(true);
  });

  it('rejects an invalid sha or base path', () => {
    expect(run(['activate', '~/edge', 'abc']).out).toMatch(/invalid sha/);
    expect(run(['activate', '../x', SHA]).out).toMatch(/invalid base path/);
  });
});

describe('edge-remote.sh shell checks', () => {
  it('parses with bash -n and passes shellcheck', () => {
    const script = join(EDGE, 'scripts', 'edge-remote.sh');
    expect(spawnSync('bash', ['-n', script]).status).toBe(0);
    if (spawnSync('shellcheck', ['--version']).status === 0) {
      const res = spawnSync('shellcheck', [script], { encoding: 'utf8' });
      expect(res.stdout).toBe('');
      expect(res.status).toBe(0);
    }
  });
});

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  env?: Record<string, string>;
}
interface Workflow {
  on: { workflow_dispatch: { inputs: Record<string, { type?: string; options?: string[]; default?: string }> } };
  permissions: Record<string, string>;
  jobs: Record<string, { environment?: string; steps: Step[] }>;
}

describe('edge-deploy.yml', () => {
  const wf = parse(readFileSync(WORKFLOW, 'utf8')) as Workflow;
  const steps = wf.jobs.deploy!.steps;

  it('is manual, read-only, with an environment choice Staging|production (default Staging)', () => {
    expect(Object.keys(wf.on)).toEqual(['workflow_dispatch']);
    expect(wf.permissions).toEqual({ contents: 'read' });
    const env = wf.on.workflow_dispatch.inputs.environment!;
    expect(env.type).toBe('choice');
    expect(env.options).toEqual(['Staging', 'production']);
    expect(env.default).toBe('Staging');
    expect(wf.jobs.deploy!.environment).toBe('${{ inputs.environment }}');
  });

  it('pins actions by SHA and never expands ${{ }} inside scripts', () => {
    for (const s of steps) {
      if (s.uses) expect(s.uses).toMatch(/@[0-9a-f]{40}$/);
      if (s.run) expect(s.run).not.toContain('${{');
    }
  });

  it('checks known_hosts strictly, uploads infra/edge without examples/, cleans the key up', () => {
    const all = steps.map((s) => s.run ?? '').join('\n');
    expect(all).toContain('StrictHostKeyChecking yes');
    expect(all).not.toMatch(/ssh-keyscan/);
    expect(all).toContain(`git archive --format=tar.gz -o "$RUNNER_TEMP/edge.tar.gz" "$GITHUB_SHA:infra/edge" -- . ':(exclude)examples'`);
    const clean = steps.find((s) => s.name === 'Clean up')!;
    expect(clean.if).toBe('always()');
    expect(clean.run).toContain('~/.ssh/deploy_key');
    // Never touches the host's Nginx or uses sudo.
    expect(all).not.toMatch(/sudo|systemctl|nginx/);
  });

  it('every run block passes shellcheck', () => {
    if (spawnSync('shellcheck', ['--version']).status !== 0) return;
    const dir = mkdtempSync(join(tmpdir(), 'edge-wf-'));
    try {
      steps.forEach((s, i) => {
        if (!s.run) return;
        const f = join(dir, `step-${i}.sh`);
        writeFileSync(f, `#!/usr/bin/env bash\nset -e\n${s.run}`);
        const res = spawnSync('shellcheck', ['-s', 'bash', f], { encoding: 'utf8' });
        expect(res.stdout, s.name).toBe('');
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('infra/edge documentation', () => {
  it('CONTRACT.md documents the network, the trusted proxy, the labels and the switch order', () => {
    const c = readFileSync(join(EDGE, 'CONTRACT.md'), 'utf8');
    for (const s of ['172.30.0.0/24', '172.30.0.0/25', '172.30.0.2', 'traefik.docker.network: edge', 'entrypoints: websecure',
      'tls.certresolver: letsencrypt', 'hsts@file', 'security-headers@file', 'Ordre de bascule', 'docker compose -p edge down',
      'sudo systemctl start nginx']) {
      expect(c).toContain(s);
    }
    expect(readFileSync(join(EDGE, 'MIGRATION.md'), 'utf8')).toContain('[CONTRACT.md](CONTRACT.md)');
  });
});
