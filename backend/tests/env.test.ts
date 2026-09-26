import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const TSX = path.join(ROOT, 'node_modules', '.bin', 'tsx');

/**
 * src/config/env.ts throws at import time and pulls in `dotenv/config`, so it
 * cannot be re-evaluated reliably inside one vitest process: dotenv is an
 * externalized CJS dep whose cache survives vi.resetModules(), which makes any
 * in-process attempt order-dependent. A clean child process with
 * DOTENV_CONFIG_PATH pointed at nothing is deterministic instead.
 */
function loadEnvIn(vars: Record<string, string>): { ok: true; env: Record<string, unknown> } | { ok: false; stderr: string } {
  const script = "const { env } = require('./src/config/env'); process.stdout.write(JSON.stringify(env));";
  try {
    const stdout = execFileSync(TSX, ['-e', script], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        DOTENV_CONFIG_PATH: '/nonexistent/.env', // neutralises backend/.env
        ...vars,
      },
    });
    return { ok: true, env: JSON.parse(stdout) };
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    return { ok: false, stderr: e.stderr ?? e.message ?? '' };
  }
}

const DB = 'postgresql://postgres:postgres@localhost:5434/sobres_test?schema=public';
const PROD_OK = {
  NODE_ENV: 'production',
  DATABASE_URL: DB,
  CORS_ORIGIN: 'https://sobres.app',
  PUBLIC_WEB_URL: 'https://sobres.app',
  JWT_SECRET: 'un-secreto-de-produccion',
};

describe('env config', () => {
  it('outside production, CORS_ORIGIN, PUBLIC_WEB_URL and JWT_SECRET fall back to dev defaults', () => {
    const result = loadEnvIn({ NODE_ENV: 'test', DATABASE_URL: DB });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.env.isProduction).toBe(false);
    expect(result.env.corsOrigin).toBe('*');
    expect(result.env.publicWebUrl).toBe('http://localhost:5175');
    expect(result.env.jwtSecret).toBeTruthy();
  });

  it.each([
    ['CORS_ORIGIN'],
    ['PUBLIC_WEB_URL'],
    ['JWT_SECRET'],
  ])('in production, a missing %s is fatal instead of falling back to a dev default', (missing) => {
    const vars = { ...PROD_OK } as Record<string, string>;
    delete vars[missing];

    const result = loadEnvIn(vars);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stderr).toContain(missing);
  });

  it('in production with everything set, the real values are used', () => {
    const result = loadEnvIn(PROD_OK);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.env.isProduction).toBe(true);
    expect(result.env.corsOrigin).toBe('https://sobres.app');
    expect(result.env.publicWebUrl).toBe('https://sobres.app');
    expect(result.env.jwtSecret).toBe('un-secreto-de-produccion');
  });

  it('a missing DATABASE_URL is fatal in any environment', () => {
    const result = loadEnvIn({ NODE_ENV: 'test' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stderr).toContain('DATABASE_URL');
  });
});
