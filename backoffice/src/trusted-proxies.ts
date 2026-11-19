/**
 * TCP peers allowed to set X-Forwarded-For (TRUSTED_PROXIES). Empty list = no proxy is trusted:
 * the client is always the TCP peer. Entries, comma or space separated:
 *   - an IP address (IPv4 or IPv6), e.g. 172.30.0.2 (the shared Traefik on the "edge" network);
 *   - a CIDR block, e.g. 10.0.0.0/8, fd00::/8;
 *   - `gateway`: the container's default gateway (read from /proc/net/route), i.e. the Docker bridge
 *     gateway through which docker-proxy relays the host's Nginx on 127.0.0.1:<port>;
 *   - a host name, e.g. `caddy` (the Caddy service of the compose project), resolved through DNS
 *     and refreshed periodically (until resolved, it matches nothing: safe default).
 */
import { BlockList, isIP } from 'node:net';

export type Resolver = (host: string) => Promise<string[]>;
export type GatewayReader = () => string | undefined;

const HOST_RE = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;

export type TrustedEntry =
  | { kind: 'ip'; address: string; family: 4 | 6 }
  | { kind: 'cidr'; address: string; prefix: number; family: 4 | 6 }
  | { kind: 'gateway' }
  | { kind: 'host'; host: string };

/** Removes the IPv4-mapped IPv6 prefix (::ffff:1.2.3.4 -> 1.2.3.4) and lower-cases. */
export function normalizeAddress(address: string): string {
  const a = address.trim().toLowerCase();
  if (a.startsWith('::ffff:') && isIP(a.slice(7)) === 4) return a.slice(7);
  return a;
}

/** Parses TRUSTED_PROXIES. Throws an Error listing the invalid entries. */
export function parseTrustedProxies(spec: string | undefined): TrustedEntry[] {
  const entries: TrustedEntry[] = [];
  const invalid: string[] = [];
  for (const raw of (spec ?? '').split(/[\s,]+/)) {
    const item = raw.trim().toLowerCase();
    if (!item) continue;
    if (item === 'gateway') {
      entries.push({ kind: 'gateway' });
      continue;
    }
    const slash = item.indexOf('/');
    if (slash >= 0) {
      const address = normalizeAddress(item.slice(0, slash));
      const prefixText = item.slice(slash + 1);
      const family = isIP(address);
      const prefix = Number(prefixText);
      if ((family === 4 || family === 6) && /^\d{1,3}$/.test(prefixText) && prefix <= (family === 4 ? 32 : 128)) {
        entries.push({ kind: 'cidr', address, prefix, family });
      } else invalid.push(raw);
      continue;
    }
    const address = normalizeAddress(item);
    const family = isIP(address);
    if (family === 4 || family === 6) entries.push({ kind: 'ip', address, family });
    else if (HOST_RE.test(item)) entries.push({ kind: 'host', host: item });
    else invalid.push(raw);
  }
  if (invalid.length) throw new Error(`TRUSTED_PROXIES: invalid entries: ${invalid.join(', ')}`);
  return entries;
}

/** Default IPv4 gateway from the content of /proc/net/route (hex, little-endian), if any. */
export function parseDefaultGateway(procNetRoute: string): string | undefined {
  for (const line of procNetRoute.split('\n').slice(1)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 4 || cols[1] !== '00000000' || !/^[0-9a-fA-F]{8}$/.test(cols[2])) continue;
    const n = parseInt(cols[2], 16);
    if (n === 0) continue;
    return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff].join('.');
  }
  return undefined;
}

export class TrustedProxies {
  private list = new BlockList();
  private readonly dynamic: TrustedEntry[];

  constructor(
    private readonly entries: TrustedEntry[],
    private readonly deps: { resolve?: Resolver; gateway?: GatewayReader } = {},
  ) {
    this.dynamic = entries.filter((e) => e.kind === 'host' || e.kind === 'gateway');
    this.list = this.build([]);
  }

  /** True when no proxy is trusted at all (X-Forwarded-For is never read). */
  get empty(): boolean {
    return this.entries.length === 0;
  }

  /** True when `peer` is one of the trusted proxies. */
  has(peer: string): boolean {
    const a = normalizeAddress(peer);
    const family = isIP(a);
    if (family === 0) return false;
    return this.list.check(a, family === 4 ? 'ipv4' : 'ipv6');
  }

  /** Re-resolves host names and the gateway (no-op when there are none). Never throws. */
  async refresh(): Promise<void> {
    if (this.dynamic.length === 0) return;
    const resolved: string[] = [];
    for (const e of this.dynamic) {
      try {
        if (e.kind === 'gateway') {
          const gw = this.deps.gateway?.();
          if (gw) resolved.push(gw);
        } else if (e.kind === 'host' && this.deps.resolve) {
          resolved.push(...(await this.deps.resolve(e.host)));
        }
      } catch {
        // Not resolvable (yet): trusts nothing for this entry.
      }
    }
    this.list = this.build(resolved);
  }

  private build(extra: string[]): BlockList {
    const list = new BlockList();
    for (const e of this.entries) {
      if (e.kind === 'ip') list.addAddress(e.address, e.family === 4 ? 'ipv4' : 'ipv6');
      else if (e.kind === 'cidr') list.addSubnet(e.address, e.prefix, e.family === 4 ? 'ipv4' : 'ipv6');
    }
    for (const raw of extra) {
      const a = normalizeAddress(raw);
      const family = isIP(a);
      if (family === 4 || family === 6) list.addAddress(a, family === 4 ? 'ipv4' : 'ipv6');
    }
    return list;
  }
}
