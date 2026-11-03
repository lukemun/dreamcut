// Plain-Node twin of src/lib/env-name.ts for mcp/, desktop/ and .mjs scripts.
// DREAMCUT_* variables win; legacy OPENEDIT_* variables remain accepted.
export const ENV_PREFIX = 'DREAMCUT_';
export const LEGACY_ENV_PREFIX = 'OPENEDIT_';

/** Full current variable name, e.g. envName('PROFILE_DIR') -> 'DREAMCUT_PROFILE_DIR'. */
export function envName(name) {
  return `${ENV_PREFIX}${name}`;
}

/**
 * Reads DREAMCUT_<name>, falling back to the legacy OPENEDIT_<name>.
 * @param {string} name
 * @param {Record<string, string | undefined>} [env]
 * @returns {string | undefined}
 */
export function readEnv(name, env = process.env) {
  return env[`${ENV_PREFIX}${name}`] ?? env[`${LEGACY_ENV_PREFIX}${name}`];
}
