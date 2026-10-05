import { loadTestEnv as loadTestEnvJs } from './env.mjs';

export function loadTestEnv(): Record<string, string> {
  return loadTestEnvJs() as Record<string, string>;
}
