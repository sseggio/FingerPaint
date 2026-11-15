import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ORIGIN, PASSWORD, setup, type TestEnv } from './helpers';

// Instrument the real password check to measure how many run at the same time.
const gauge = vi.hoisted(() => ({ current: 0, max: 0, calls: 0 }));
vi.mock('../src/password', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/password')>();
  return {
    ...actual,
    verifyPassword: async (password: string, stored: string) => {
      gauge.calls++;
      gauge.current++;
      gauge.max = Math.max(gauge.max, gauge.current);
      try {
        await new Promise((r) => setTimeout(r, 30));
        return await actual.verifyPassword(password, stored);
      } finally {
        gauge.current--;
      }
    },
  };
});

let env: TestEnv;
beforeEach(async () => {
  env = await setup();
  Object.assign(gauge, { current: 0, max: 0, calls: 0 });
});
afterEach(() => env.cleanup());

function attempt(password: string, ip: string) {
  return env.app.request('/admin/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'X-Forwarded-For': ip },
    body: JSON.stringify({ password }),
  });
}

describe('concurrent login burst', () => {
  it('never exceeds the per-client limit nor 2 password checks in flight', async () => {
    // perClient = 3 in the test setup. Fire waves of parallel requests from one client.
    const statuses: number[] = [];
    for (let wave = 0; wave < 5; wave++) {
      const res = await Promise.all(Array.from({ length: 10 }, () => attempt('wrong', '198.51.100.9')));
      statuses.push(...res.map((r) => r.status));
    }
    expect(statuses.filter((s) => s === 401).length).toBeLessThanOrEqual(3);
    expect(gauge.calls).toBeLessThanOrEqual(3);
    expect(gauge.max).toBeLessThanOrEqual(2);
    expect(statuses.filter((s) => s === 429).length).toBe(50 - statuses.filter((s) => s === 401).length);
    // Still blocked for this client, even with the right password.
    expect((await attempt(PASSWORD, '198.51.100.9')).status).toBe(429);
  });

  it('caps parallel scrypt checks across many clients and the global budget', async () => {
    const res = await Promise.all(Array.from({ length: 40 }, (_, i) => attempt('wrong', `10.1.0.${i}`)));
    expect(gauge.max).toBe(2);
    expect(res.every((r) => r.status === 401 || r.status === 429)).toBe(true);
    // Sequential waves until the global budget (10) is spent: never more than 10 checks overall.
    for (let i = 0; i < 30; i++) await attempt('wrong', `10.2.0.${i}`);
    expect(gauge.calls).toBeLessThanOrEqual(10);
    expect((await attempt(PASSWORD, '10.3.0.1')).status).toBe(429);
  });

  it('refunds the reserved attempt on success', async () => {
    expect((await attempt('wrong', '192.0.2.1')).status).toBe(401);
    expect((await attempt(PASSWORD, '192.0.2.1')).status).toBe(200);
    for (let i = 0; i < 3; i++) expect((await attempt('wrong', '192.0.2.1')).status).toBe(401);
    expect((await attempt('wrong', '192.0.2.1')).status).toBe(429);
  });
});
