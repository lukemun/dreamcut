import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describeValidationIssue, trimValidatorPatterns } from "./argument-errors.mjs";
import { projectsRootFor } from "./projects-root.mjs";

const EDITOR_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** Passthrough text (stderr, logs, upstream messages) never exceeds this in a tool result. */
export const MAX_PASSTHROUGH_CHARS = 2000;

function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/** Local roots rewritten to portable forms, most specific first. */
function redactionRoots() {
  let projects;
  try { projects = projectsRootFor(EDITOR_ROOT); } catch { projects = path.join(EDITOR_ROOT, "projects"); } // Redaction must never throw.
  return [[projects, "projects"], [EDITOR_ROOT, "<repo>"], [os.homedir(), "~"]]
    .filter(([root]) => root && root !== path.parse(root).root)
    .sort((a, b) => b[0].length - a[0].length);
}

/** Rewrite absolute local paths to project-, repo- or home-relative forms and drop stack frames. */
export function redactLocalText(text) {
  let out = String(text ?? "")
    .split("\n").filter(line => !/^\s+at\s/.test(line) && !/^\s*Node\.js v\d/.test(line)).join("\n");
  for (const [root, label] of redactionRoots()) {
    out = out.replace(new RegExp(`(?:file://)?${escapeRegExp(root)}`, "g"), label);
  }
  return out.trim();
}

/** Bounded tail-preserving passthrough; the tail usually holds the cause. */
export function capText(text, max = MAX_PASSTHROUGH_CHARS) {
  const value = String(text ?? "");
  return value.length <= max ? value : `…[${value.length - max} earlier chars omitted]\n${value.slice(-max)}`;
}

const RETRY_LATER = { action: "retry_later", reason: "Transient condition; retry the same call shortly. Do not change inputs." };
const INSPECT = { action: "inspect_failure", reason: "Inspect the error and current state before changing inputs or retrying; do not bypass approval." };

/** Transient conditions recognisable from untyped text: busy queues, timeouts, an unreachable editor. */
export function transientFailure(message) {
  const text = String(message ?? "");
  if (/\bbusy\b|retry shortly|try again (?:later|shortly)|too many requests/i.test(text)) return { code: "BUSY", retryable: true, recovery: RETRY_LATER };
  if (/timed out|\btimeout\b|ETIMEDOUT|ECONNRESET|socket hang up/i.test(text)) return { code: "TIMEOUT", retryable: true, recovery: { action: "retry_later", reason: "The operation timed out; check status before retrying so running work is not duplicated." } };
  if (/ECONNREFUSED|fetch failed|editor is not reachable/i.test(text)) return { code: "EDITOR_UNAVAILABLE", retryable: true, recovery: { action: "start_editor", reason: "The local editor is not reachable. Start it yourself: run `pnpm editor` in the DreamCut folder (the one containing this MCP server) with your preview/launch tool, wait until it answers, open the project in your built-in browser, then retry." } };
  return null;
}

function typed(code, message, extra = {}) {
  return { schema_version: 1, code, message, retryable: false, state_changed: false, recovery: INSPECT, ...extra };
}

/**
 * A failed editor HTTP response as an Error carrying a typed payload. Application-typed
 * `tool_error` wins; otherwise status and validator issues select a conservative code.
 */
export function httpFailure(method, pathName, status, parsed) {
  const upstream = parsed && typeof parsed.error === "string" ? parsed.error : `HTTP ${status}`;
  let issues = Array.isArray(parsed?.issues) ? parsed.issues : null;
  // Some routes return a thrown ZodError's message, which is the issue list as JSON.
  if (!issues && /^\s*\[/.test(upstream)) {
    try { const list = JSON.parse(upstream); if (Array.isArray(list) && list.every(item => item && Array.isArray(item.path))) issues = list; } catch { /* plain text */ }
  }
  const reason = issues?.length
    ? `${issues.length === 1 ? "Invalid field" : `${issues.length} invalid fields`}: ${issues.slice(0, 8).map(describeValidationIssue).join("; ")}${issues.length > 8 ? `; …${issues.length - 8} more` : ""}`
    : capText(trimValidatorPatterns(redactLocalText(upstream)), 600);
  const message = `${method} ${pathName.split("?")[0]} failed (${status}): ${reason}`;
  if (parsed?.tool_error && typeof parsed.tool_error.code === "string") {
    return Object.assign(new Error(message), { toolError: parsed.tool_error, issues });
  }
  const transient = transientFailure(upstream) ?? (status === 429 || status === 503
    ? { code: "BUSY", retryable: true, recovery: RETRY_LATER }
    : status === 504 ? { code: "TIMEOUT", retryable: true, recovery: RETRY_LATER } : null);
  const detail = transient ? typed(transient.code, message, { retryable: true, recovery: transient.recovery })
    : issues?.length || status === 400 || status === 422 ? typed("INVALID_INPUT", message, { ...(issues?.length ? { issues: issues.slice(0, 20).map(describeValidationIssue) } : {}), recovery: { action: "fix_arguments", reason: "Correct the named fields; retrying unchanged input fails the same way." } })
    : status === 404 ? typed("NOT_FOUND", message, { recovery: { action: "check_ids", reason: "Re-read current ids (timeline_get, proposal_list) before retrying." } })
    : status === 409 ? typed("CONFLICT", message, { recovery: { action: "refresh_state", reason: "Current state changed or a prerequisite is missing; re-read it before changing inputs. Do not retry unchanged." } })
    : status === 401 || status === 403 ? typed("NOT_AUTHORIZED", message, { recovery: { action: "stop", reason: "This action is outside the agent's authority; ask the human." } })
    : typed("TOOL_FAILED", message, { state_changed: "unknown", diagnostic_id: randomUUID() });
  return Object.assign(new Error(message), { toolError: detail, issues });
}

/**
 * A failed local helper script. Scripts print one `{"dreamcut_script_error":{code,message,recovery}}`
 * line on failure; anything else is reduced to its last error line, redacted and capped.
 */
export function scriptFailure(name, result, fallback = `${name} failed`) {
  const lines = `${result?.stderr ?? ""}\n${result?.stdout ?? ""}`.split("\n").map(line => line.trim()).filter(Boolean);
  for (const line of [...lines].reverse()) {
    if (!line.startsWith("{")) continue;
    try {
      const reported = JSON.parse(line).dreamcut_script_error;
      if (reported && typeof reported.code === "string") {
        const message = capText(redactLocalText(reported.message ?? fallback), 600);
        const transient = transientFailure(message);
        return Object.assign(new Error(message), { toolError: typed(reported.code, message, {
          retryable: Boolean(reported.retryable ?? transient?.retryable ?? false),
          state_changed: reported.state_changed ?? false, exit_code: result?.exit_code,
          recovery: reported.recovery ?? transient?.recovery ?? INSPECT }) });
      }
    } catch { /* not a report line */ }
  }
  const errorLine = [...lines].reverse().find(line => /^(?:[A-Za-z]*Error|error)\b[:\s]/.test(line) && !/^\s*at\s/.test(line));
  const cause = errorLine ? errorLine.replace(/^[A-Za-z]*Error:\s*/, "") : fallback;
  const message = capText(redactLocalText(`${fallback}: ${cause}`), 600);
  const transient = transientFailure(cause);
  return Object.assign(new Error(message), { toolError: typed(transient?.code ?? "SCRIPT_FAILED", message, {
    retryable: transient?.retryable ?? false, state_changed: "unknown", exit_code: result?.exit_code,
    diagnostic_id: randomUUID(), recovery: transient?.recovery ?? INSPECT }) });
}

/** Expected application failures retain typed recovery; unknown ones never invent retries. */
export function toolFailure(error, diagnosticId = randomUUID()) {
  const detail=error?.toolError;
  let structuredContent;
  if (detail && typeof detail.code==="string") structuredContent=detail;
  else {
    const message=capText(redactLocalText(error instanceof Error?error.message:"Tool failed"));
    const transient=transientFailure(message);
    structuredContent={
      schema_version:1, code:transient?.code??"TOOL_FAILED", message,
      retryable:transient?.retryable??false, state_changed:"unknown", diagnostic_id:diagnosticId,
      recovery:transient?.recovery??INSPECT,
    };
  }
  return {isError:true,structuredContent,content:[{type:"text",text:structuredContent.message},{type:"text",text:JSON.stringify(structuredContent)}]};
}

/** One dispatch is one event, independent of provider telemetry or nested shell text. */
export async function dispatchTool(name,args,invoke,record,sessionId,requestId) {
  const callId=randomUUID(),start=Date.now();
  let result,error;
  try {result=await invoke();return result;} catch(e){error=e;throw e;}
  finally {
    try {await record({schema_version:1,event:"dreamcut.tool_dispatch",call_id:callId,request_id:String(requestId),session_id:sessionId,
      tool:name,contract_version:1,project_id:typeof args.project_id==="string"?args.project_id:undefined,
      started_at:new Date(start).toISOString(),finished_at:new Date().toISOString(),duration_ms:Date.now()-start,
      success:!error,job_state:result?.state,job_id:result?.job_id??result?.id,reused:result?.reused,
      error_code:error?.toolError?.code??(error?"TOOL_FAILED":undefined)});} catch { /* Accounting failure cannot repeat an edit. */ }
  }
}
