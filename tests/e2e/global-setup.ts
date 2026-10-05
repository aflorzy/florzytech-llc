import { execSync } from 'node:child_process';
import { loadTestEnv } from '../utils/env-loader';

async function globalSetup() {
  const env = loadTestEnv();
  const cmdEnv = { ...process.env, DATABASE_URL: env.DATABASE_URL_TEST, DATABASE_URL_TEST: env.DATABASE_URL_TEST };
  execSync('npm run test:db:reset', { stdio: 'inherit', env: cmdEnv });
  execSync('npm run test:db:seed', { stdio: 'inherit', env: cmdEnv });
}

export default globalSetup;
