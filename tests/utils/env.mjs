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

  process.env.DATABASE_URL_TEST = merged.DATABASE_URL_TEST;
  process.env.DATABASE_URL = merged.DATABASE_URL_TEST;
  return merged;
}
