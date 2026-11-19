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
  symlinkSync,
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
 * one), edge-iprange (default 172.30.0.128/25), edge-containers ("name ip/24" lines), traefik (a
 * Traefik container of project "edge" runs), mounts (mount sources of the project's containers),
 * pull-fails. Every call is logged.
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
        case "$5" in
          *Containers*) cat "$s/edge-containers" 2>/dev/null; exit 0 ;;
        esac
        subnet=$(cat "$s/edge"); iprange=$(cat "$s/edge-iprange" 2>/dev/null || echo 172.30.0.128/25)
        echo "\${subnet:-172.30.0.0/24} $iprange"; exit 0 ;;
      create) : > "$s/edge"; exit 0 ;;
    esac ;;
  ps) [ -f "$s/traefik" ] && echo trid; exit 0 ;;
  inspect) cat "$s/mounts" 2>/dev/null; exit 0 ;;
  compose)
    args="$*"
    case "$args" in
      "compose version"*) echo "Docker Compose version v2.30.0"; exit 0 ;;
      *" pull"*) [ -f "$s/pull-fails" ] && exit 1; exit 0 ;;
      *" up "*) touch "$s/traefik"; echo "$args" > "$s/up-args"; exit 0 ;;
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
    expect(readFileSync(envFile(), 'utf8')).toBe(`ACME_EMAIL=ops@example.com\nACME_CA_SERVER=\nEDGE_DYNAMIC_DIR=${home}/edge/shared/dynamic\n`);
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
    expect(readFileSync(envFile(), 'utf8')).toBe(`ACME_EMAIL=ops@example.com\nACME_CA_SERVER=\nEDGE_DYNAMIC_DIR=${home}/edge/shared/dynamic\n`);
    expect(r.stdout).toMatch(/EDGE_STATUS=started\s*$/);
  });

  it('fills an empty ACME_EMAIL in an existing shared/.env, or fails clearly without the secret', () => {
    mkdirSync(join(home, 'edge', 'shared'), { recursive: true });
    writeFileSync(envFile(), 'ACME_EMAIL=\nACME_CA_SERVER=\n');
    const bad = run(['activate', '~/edge', SHA], '\n');
    expect(bad.code).not.toBe(0);
    expect(bad.out).toMatch(/ACME_EMAIL is empty/);
    expect(run(['activate', '~/edge', SHA], 'ops@example.com\n').code).toBe(0);
    expect(readFileSync(envFile(), 'utf8')).toBe(`ACME_CA_SERVER=\nACME_EMAIL=ops@example.com\nEDGE_DYNAMIC_DIR=${home}/edge/shared/dynamic\n`);
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

  it('mounts a stable shared/dynamic (EDGE_DYNAMIC_DIR) filled from the release', () => {
    expect(run(['activate', '~/edge', SHA], 'ops@example.com\n').code).toBe(0);
    const dyn = join(home, 'edge', 'shared', 'dynamic');
    expect(readFileSync(envFile(), 'utf8')).toContain(`EDGE_DYNAMIC_DIR=${dyn}\n`);
    expect(lstatSync(dyn).isSymbolicLink()).toBe(false);
    expect(readFileSync(join(dyn, 'middlewares.yml'), 'utf8')).toBe(readFileSync(join(EDGE, 'dynamic', 'middlewares.yml'), 'utf8'));
    const compose = readFileSync(join(EDGE, 'docker-compose.yml'), 'utf8');
    expect(compose).toContain('${EDGE_DYNAMIC_DIR:-./dynamic}:/etc/traefik/dynamic:ro');
    expect(compose).toContain('--providers.file.watch=true');
  });

  it('dynamic/ update applied in place (same directory inode, stale files removed, no temp file left)', () => {
    expect(run(['activate', '~/edge', SHA], 'ops@example.com\n').code).toBe(0);
    const dyn = join(home, 'edge', 'shared', 'dynamic');
    const inode = statSync(dyn).ino;
    writeFileSync(join(dyn, 'old.yml'), 'http: {}\n');
    const next = 'c'.repeat(40);
    const rel = release(next);
    writeFileSync(join(rel, 'dynamic', 'middlewares.yml'), 'http:\n  middlewares: {}\n');
    writeFileSync(join(rel, 'dynamic', 'extra.yml'), 'http: {}\n');
    const r = run(['activate', '~/edge', next], '\n', next);
    expect(r.code).toBe(0);
    expect(statSync(dyn).ino).toBe(inode);
    expect(readFileSync(join(dyn, 'middlewares.yml'), 'utf8')).toBe('http:\n  middlewares: {}\n');
    expect(readdirSync(dyn).sort()).toEqual(['extra.yml', 'middlewares.yml']);
    // docker-compose.yml unchanged: no forced recreation.
    expect(readFileSync(join(state, 'up-args'), 'utf8')).not.toContain('--force-recreate');
  });

  it('docker-compose.yml changed: up -d --wait --force-recreate', () => {
    expect(run(['activate', '~/edge', SHA], 'ops@example.com\n').code).toBe(0);
    const next = 'c'.repeat(40);
    const rel = release(next);
    writeFileSync(join(rel, 'docker-compose.yml'), `${readFileSync(join(rel, 'docker-compose.yml'), 'utf8')}\n# changed\n`);
    expect(run(['activate', '~/edge', next], '\n', next).code).toBe(0);
    expect(readFileSync(join(state, 'up-args'), 'utf8')).toMatch(/up -d --wait --remove-orphans --force-recreate/);
  });

  it('re-run of the same SHA while Traefik runs: release and shared/dynamic kept, no recreation', () => {
    expect(run(['activate', '~/edge', SHA], 'ops@example.com\n').code).toBe(0);
    expect(existsSync(join(state, 'traefik'))).toBe(true);
    const r = run(['activate', '~/edge', SHA], '\n');
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/update/);
    expect(existsSync(join(home, 'edge', 'releases', SHA, 'docker-compose.yml'))).toBe(true);
    expect(readlinkSync(join(home, 'edge', 'current'))).toBe(`releases/${SHA}`);
    expect(existsSync(join(home, 'edge', 'shared', 'dynamic', 'middlewares.yml'))).toBe(true);
    expect(readFileSync(join(state, 'up-args'), 'utf8')).not.toContain('--force-recreate');
  });

  it('prune never removes the current release, the previous one nor one mounted by a running container', () => {
    const shas = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((c) => c.repeat(40));
    shas.forEach((s, i) => {
      const t = new Date(Date.UTC(2026, 0, 10 + i));
      utimesSync(release(s), t, t);
    });
    // Oldest = previous current; second oldest = mounted by the running Traefik (old layout);
    // the new release is given the oldest mtime of all.
    mkdirSync(join(home, 'edge', 'shared'), { recursive: true });
    writeFileSync(envFile(), 'ACME_EMAIL=ops@example.com\n');
    symlinkSync(`releases/${shas[0]}`, join(home, 'edge', 'current'));
    writeFileSync(join(state, 'traefik'), '');
    writeFileSync(join(state, 'mounts'), `${join(home, 'edge', 'releases', shas[1]!, 'dynamic')}\n/var/run/docker.sock\n`);
    const next = 'd'.repeat(40);
    const old = new Date(Date.UTC(2025, 0, 1));
    utimesSync(release(next), old, old);
    const r = run(['activate', '~/edge', next], '\n', next);
    expect(r.code).toBe(0);
    const left = readdirSync(join(home, 'edge', 'releases'));
    for (const keep of [next, shas[0]!, shas[1]!, shas[8]!]) expect(left).toContain(keep);
    expect(left).not.toContain(shas[2]);
  });

  it('edge network with a wrong ip-range, or 172.30.0.2 held by another container: clear error, nothing pulled', () => {
    writeFileSync(join(state, 'edge-iprange'), '');
    let r = run(['activate', '~/edge', SHA], 'ops@example.com\n');
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/ip-range 'none' instead of 172\.30\.0\.128\/25/);
    rmSync(join(state, 'edge-iprange'));
    writeFileSync(join(state, 'edge-containers'), 'other-app-1 172.30.0.2/24\n');
    r = run(['activate', '~/edge', SHA], 'ops@example.com\n');
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/held by container 'other-app-1'/);
    expect(log()).not.toMatch(/ pull| up /);
    writeFileSync(join(state, 'edge-containers'), 'edge-traefik-1 172.30.0.2/24\nother-app-1 172.30.0.130/24\n');
    expect(run(['activate', '~/edge', SHA], 'ops@example.com\n').code).toBe(0);
  });

  it('ss failure: ports considered busy, Traefik not started, warning', () => {
    writeFileSync(join(bin, 'ss'), '#!/usr/bin/env bash\nexit 1\n');
    const r = run(['activate', '~/edge', SHA], 'ops@example.com\n');
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/ss failed while checking port 80: considered busy/);
    expect(r.stdout).toMatch(/EDGE_STATUS=deferred\s*$/);
    expect(log()).not.toMatch(/ up /);
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

describe('edge-deploy.yml upload step (run with a fake ssh)', () => {
  const wf = parse(readFileSync(WORKFLOW, 'utf8')) as Workflow;
  const upload = wf.jobs.deploy!.steps.find((s) => s.name?.startsWith('Upload'))!.run!;
  const headSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).stdout.trim();

  const uploadAs = (remote: string) =>
    spawnSync('bash', ['-e', '-c', upload], {
      cwd: REPO,
      encoding: 'utf8',
      env: { PATH: `${bin}:/usr/bin:/bin`, HOME: home, REMOTE_HOME: remote, EDGE_PATH: 'edge', GITHUB_SHA: headSha, RUNNER_TEMP: root },
    });

  beforeEach(() => {
    // Fake ssh: runs the remote command with bash in the "remote" home.
    writeFileSync(join(bin, 'ssh'), '#!/usr/bin/env bash\nshift\ncd "$REMOTE_HOME"\nexec bash -c "$*"\n');
    chmodSync(join(bin, 'ssh'), 0o755);
  });

  it('uploads without examples/, and never removes the current release on a re-run of the same SHA', () => {
    const remote = join(root, 'remote');
    mkdirSync(remote);
    const run1 = uploadAs(remote);
    expect(run1.status, `${run1.stdout}${run1.stderr}`).toBe(0);
    const rel = join(remote, 'edge', 'releases', headSha);
    expect(existsSync(join(rel, 'docker-compose.yml'))).toBe(true);
    expect(existsSync(join(rel, 'scripts', 'edge-remote.sh'))).toBe(true);
    expect(existsSync(join(rel, 'examples'))).toBe(false);
    // Not current yet: a second upload replaces it.
    writeFileSync(join(rel, 'marker'), '');
    const again = () => uploadAs(remote);
    expect(again().status).toBe(0);
    expect(existsSync(join(rel, 'marker'))).toBe(false);
    // Current: kept as is (same inode, marker still there), no partial left.
    symlinkSync(`releases/${headSha}`, join(remote, 'edge', 'current'));
    writeFileSync(join(rel, 'marker'), '');
    const ino = statSync(rel).ino;
    const r = again();
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('is the current one: kept as is');
    expect(statSync(rel).ino).toBe(ino);
    expect(existsSync(join(rel, 'marker'))).toBe(true);
    expect(existsSync(`${rel}.partial`)).toBe(false);
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
