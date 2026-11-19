/** Environment configuration, checked at startup (the server refuses to start when invalid). */
import { join, resolve } from 'node:path';

import { parsePasswordHash } from './password';
import type { TrustedEntry } from './trusted-proxies';
import { parseTrustedProxies } from './trusted-proxies';

export interface ServerConfig {
  port: number;
  host: string;
  dataDir: string;
  embeddedPath: string;
  publicDir: string;
  publicUrl: string;
  passwordHash: string;
  sessionSecret: string;
  cookieSecure: boolean;
  /** TRUSTED_PROXIES, parsed (empty = X-Forwarded-For is never read). */
  trustedProxies: TrustedEntry[];
}

export function readConfig(env: NodeJS.ProcessEnv, baseDir: string): ServerConfig {
  const errors: string[] = [];
  const passwordHash = env.ADMIN_PASSWORD_HASH?.trim() ?? '';
  if (!parsePasswordHash(passwordHash)) {
    errors.push('ADMIN_PASSWORD_HASH is missing or invalid (generate it with `npm run hash-password`).');
  }
  const sessionSecret = env.SESSION_SECRET ?? '';
  if (sessionSecret.length < 32) errors.push('SESSION_SECRET must be at least 32 characters (e.g. `openssl rand -hex 32`).');
  const publicUrl = env.PUBLIC_URL ?? (env.DOMAIN ? `https://${env.DOMAIN}` : 'http://localhost:8080');
  try {
    const u = new URL(publicUrl);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('protocol');
  } catch {
    errors.push(`PUBLIC_URL is not a valid http(s) URL: ${publicUrl}`);
  }
  const port = Number(env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push('PORT must be a valid TCP port.');
  let trustedProxies: TrustedEntry[] = [];
  try {
    trustedProxies = parseTrustedProxies(env.TRUSTED_PROXIES);
  } catch (e) {
    errors.push((e as Error).message);
  }
  if (errors.length) throw new Error(`Invalid configuration:\n- ${errors.join('\n- ')}`);
  return {
    port,
    host: env.HOST ?? '0.0.0.0',
    dataDir: resolve(env.DATA_DIR ?? join(baseDir, 'data')),
    embeddedPath: resolve(env.EMBEDDED_PATH ?? join(baseDir, 'generated', 'embedded.json')),
    publicDir: resolve(env.PUBLIC_DIR ?? join(baseDir, 'public', 'admin')),
    publicUrl: publicUrl.replace(/\/+$/, ''),
    passwordHash,
    sessionSecret,
    cookieSecure: env.COOKIE_SECURE !== 'false',
    trustedProxies,
  };
}
