import { execFileSync } from 'node:child_process';
import { TEST_DATABASE_URL } from './db-url';

/**
 * Runs once for the whole suite: makes sure `sobres_test` exists and carries the
 * current schema. Independent from the dev server and from the dev database.
 */
export default function setup() {
  try {
    execFileSync('docker', ['exec', 'sobres-db', 'psql', '-U', 'postgres', '-c', 'CREATE DATABASE sobres_test'], {
      stdio: 'pipe',
    });
  } catch {
    // Already exists (or docker unavailable) — migrate deploy below will tell us.
  }

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
