import fs from 'node:fs';
import path from 'node:path';

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const out = {};
  for (const lineRaw of lines) {
    const line = lineRaw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

// Compare host + database name so a differently-formatted copy of the same URL still matches.
function dbIdentity(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return url;
  }
}

export function loadTestEnv() {
  const cwd = process.cwd();
  const envPath = path.join(cwd, '.env');
  const testEnvPath = path.join(cwd, '.env.test');

  const merged = {
    ...parseEnvFile(envPath),
    ...parseEnvFile(testEnvPath),
    ...process.env
  };

  if (!merged.DATABASE_URL_TEST) {
    throw new Error('Missing DATABASE_URL_TEST. Set it in .env.test or environment variables.');
  }

  // Tests truncate every table. Refuse to run if the test URL is the app database from .env.
  const appDbUrl = parseEnvFile(envPath).DATABASE_URL;
  if (appDbUrl && dbIdentity(appDbUrl) === dbIdentity(merged.DATABASE_URL_TEST)) {
    throw new Error('DATABASE_URL_TEST points at the same database as DATABASE_URL in .env. Refusing to run tests against it.');
  }

  process.env.DATABASE_URL_TEST = merged.DATABASE_URL_TEST;
  process.env.DATABASE_URL = merged.DATABASE_URL_TEST;
  return merged;
}
