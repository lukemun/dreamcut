/**
 * One-line failure report for helper scripts that MCP tools run. The tool wrapper reads the
 * `dreamcut_script_error` line (mcp/tool-runtime.mjs scriptFailure) instead of a stack trace,
 * so a model sees a typed code and the cause without local paths or node_modules frames.
 */
export type ScriptRecovery = { action: string; reason: string };

export class ScriptError extends Error {
  constructor(readonly code: string, message: string, readonly recovery?: ScriptRecovery, readonly retryable = false) {
    super(message);
  }
}

/** Print a readable line plus the machine-readable report; set a failing exit code. */
export function reportScriptFailure(error: unknown, fallbackCode = "SCRIPT_FAILED"): void {
  const typed = error instanceof ScriptError ? error : null;
  const message = error instanceof Error ? error.message : String(error);
  if (process.env.DREAMCUT_SCRIPT_DEBUG && error instanceof Error) process.stderr.write(`${error.stack}\n`);
  else process.stderr.write(`Error: ${message}\n`);
  process.stderr.write(`${JSON.stringify({ dreamcut_script_error: {
    code: typed?.code ?? fallbackCode,
    message,
    retryable: typed?.retryable ?? false,
    ...(typed?.recovery ? { recovery: typed.recovery } : {}),
  } })}\n`);
  process.exitCode = 1;
}

/** Route uncaught failures through the report for scripts with top-level work. */
export function installScriptFailureReporter(fallbackCode = "SCRIPT_FAILED"): void {
  const fail = (error: unknown) => { reportScriptFailure(error, fallbackCode); process.exit(1); };
  process.once("uncaughtException", fail);
  process.once("unhandledRejection", fail);
}
