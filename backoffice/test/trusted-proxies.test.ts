import { describe, expect, it } from 'vitest';

import { normalizeAddress, parseDefaultGateway, parseTrustedProxies, TrustedProxies } from '../src/trusted-proxies';

describe('parseTrustedProxies', () => {
  it('accepts IPs, CIDRs, gateway and host names, comma or space separated', () => {
    expect(parseTrustedProxies('172.30.0.2, 10.0.0.0/8 fd00::/8 ::1 gateway caddy')).toEqual([
      { kind: 'ip', address: '172.30.0.2', family: 4 },
      { kind: 'cidr', address: '10.0.0.0', prefix: 8, family: 4 },
      { kind: 'cidr', address: 'fd00::', prefix: 8, family: 6 },
      { kind: 'ip', address: '::1', family: 6 },
      { kind: 'gateway' },
      { kind: 'host', host: 'caddy' },
    ]);
  });

  it('is empty (no proxy trusted) when unset or blank', () => {
    expect(parseTrustedProxies(undefined)).toEqual([]);
    expect(parseTrustedProxies(' , ')).toEqual([]);
    expect(new TrustedProxies([]).empty).toBe(true);
  });

  it('rejects invalid entries', () => {
    expect(() => parseTrustedProxies('172.30.0.2, 10.0.0.0/33, a_b, 1.2.3.4/x')).toThrow(/10\.0\.0\.0\/33, a_b, 1\.2\.3\.4\/x/);
  });
});

describe('TrustedProxies', () => {
  it('matches exact addresses and CIDR blocks only, including IPv4-mapped IPv6 peers', () => {
    const t = new TrustedProxies(parseTrustedProxies('172.30.0.2, 192.168.10.0/24, fd00::/8'));
    expect(t.has('172.30.0.2')).toBe(true);
    expect(t.has('::ffff:172.30.0.2')).toBe(true);
    expect(t.has('192.168.10.77')).toBe(true);
    expect(t.has('fd12::1')).toBe(true);
    for (const a of ['172.30.0.3', '172.30.0.150', '192.168.11.1', '127.0.0.1', '2001:db8::1', '', 'unknown']) {
      expect(t.has(a)).toBe(false);
    }
  });

  it('resolves host names and the gateway on refresh (nothing trusted before, nor on failure)', async () => {
    let caddy = ['172.19.0.3'];
    let fail = false;
    const t = new TrustedProxies(parseTrustedProxies('caddy gateway'), {
      resolve: async (host) => {
        if (fail) throw new Error('ENOTFOUND');
        return host === 'caddy' ? caddy : [];
      },
      gateway: () => '172.18.0.1',
    });
    expect(t.empty).toBe(false);
    expect(t.has('172.19.0.3')).toBe(false);
    await t.refresh();
    expect(t.has('172.19.0.3')).toBe(true);
    expect(t.has('172.18.0.1')).toBe(true);
    caddy = ['172.19.0.4'];
    await t.refresh();
    expect(t.has('172.19.0.3')).toBe(false);
    expect(t.has('172.19.0.4')).toBe(true);
    fail = true;
    await t.refresh();
    expect(t.has('172.19.0.4')).toBe(false);
    expect(t.has('172.18.0.1')).toBe(true);
  });
});

describe('helpers', () => {
  it('normalizes addresses', () => {
    expect(normalizeAddress(' ::FFFF:10.0.0.1 ')).toBe('10.0.0.1');
    expect(normalizeAddress('FD00::1')).toBe('fd00::1');
  });

  it('reads the default gateway from /proc/net/route', () => {
    const route = [
      'Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\tWindow\tIRTT',
      'eth0\t000012AC\t00000000\t0001\t0\t0\t0\t0000FFFF\t0\t0\t0',
      'eth0\t00000000\t010012AC\t0003\t0\t0\t0\t00000000\t0\t0\t0',
    ].join('\n');
    expect(parseDefaultGateway(route)).toBe('172.18.0.1');
    expect(parseDefaultGateway(route.split('\n').slice(0, 2).join('\n'))).toBeUndefined();
  });
});
