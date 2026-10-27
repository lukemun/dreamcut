// DreamCut environment variables use the DREAMCUT_ prefix. Variables from the
// OpenEdit era (OPENEDIT_*) remain accepted so existing shells, .env files and
// launch scripts keep working. mcp/env-name.mjs is the plain-Node twin.
export const ENV_PREFIX = "DREAMCUT_";
export const LEGACY_ENV_PREFIX = "OPENEDIT_";

type EnvSource = Record<string, string | undefined>;

/** Full current variable name, e.g. envName("PROFILE_DIR") -> "DREAMCUT_PROFILE_DIR". */
export function envName(name: string): string {
  return `${ENV_PREFIX}${name}`;
}

/** Reads DREAMCUT_<name>, falling back to the legacy OPENEDIT_<name>. */
export function readEnv(name: string, env: EnvSource = process.env): string | undefined {
  return env[`${ENV_PREFIX}${name}`] ?? env[`${LEGACY_ENV_PREFIX}${name}`];
}
