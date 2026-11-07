import { execSync } from 'node:child_process';

/** With E2E_RESET=1 the local database is reset and the bootstrap admin recreated before the run. */
export default async function globalSetup() {
  if (process.env.E2E_RESET !== '1') return;
  execSync('pnpm -s supabase db reset', { stdio: 'inherit' });
  execSync('pnpm -s tsx scripts/bootstrap-admin.ts', { stdio: 'inherit' });
}
