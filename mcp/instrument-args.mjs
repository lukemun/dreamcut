// run_instrument's bounded argument and result contract. Instruments are read-only reports:
// callers choose sample times and checks, never output locations, base URLs or input files.
import path from "node:path";
import { capText, redactLocalText, transientFailure } from "./tool-runtime.mjs";

const VALUE = /^[^/\\\s]{1,200}$/;
const ALLOWED = Object.freeze({
  "frame-state": {
    switches: ["--warm-renderer", "--fresh-browser", "--no-cache"],
    values: {
      "--at": /^\d+(?:\.\d+)?(?:,\d+(?:\.\d+)?)*$/,
      "--expect-gap": /^[^:/\\\s]+:[^:/\\\s]+:-?\d+(?:\.\d+)?:-?\d+(?:\.\d+)?$/,
      "--variant": /^[A-Za-z0-9_-]{1,64}$/,
    },
  },
  qc: { switches: ["--json", "--estimate-only"], values: { "--target": /^(?:tiktok|reels|shorts|feed|web)$/ } },
  "preview-readiness": { switches: [], values: {} },
  "project-health": { switches: ["--json"], values: {} },
});
const REFUSED = Object.freeze({
  "--out": "reports are written only to the project's instruments folder",
  "--base": "instruments read the configured local editor only",
  "--proposal-file": "measure a saved proposal through proposal_preview or spatial_assess instead of a file path",
  "--option": "proposal options are measured through proposal_preview",
});

function invalid(message) {
  return Object.assign(new Error(message), { toolError: {
    schema_version: 1, code: "INVALID_ARGUMENTS", message, retryable: false, state_changed: false,
    recovery: { action: "fix_arguments", reason: "Use only the listed instrument flags; nothing was run." },
  } });
}

function accepted(instrument) {
  const spec = ALLOWED[instrument];
  const list = [...spec.switches, ...Object.keys(spec.values).map(flag => `${flag} <value>`)];
  return list.length ? list.join(", ") : "none";
}

/** CLI arguments for one instrument run, or a typed INVALID_ARGUMENTS error naming the bad flag. */
export function instrumentArgs(instrument, projectId, extraArgs = []) {
  const spec = ALLOWED[instrument];
  if (!spec) throw invalid(`Unknown instrument "${instrument}"; accepted: ${Object.keys(ALLOWED).join(", ")}`);
  if (typeof projectId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(projectId) || projectId.includes("..")) {
    throw invalid("project_id must be a project folder name (letters, digits, '.', '_' or '-')");
  }
  const extra = extraArgs ?? [];
  if (!Array.isArray(extra) || extra.length > 12 || extra.some(value => typeof value !== "string")) throw invalid("extra_args must be at most 12 strings");
  const out = [projectId];
  for (let index = 0; index < extra.length; index++) {
    const [flag, inline] = extra[index].split(/=(.*)/s, 2);
    if (Object.hasOwn(REFUSED, flag)) throw invalid(`${flag} is not accepted by run_instrument: ${REFUSED[flag]}. Accepted for ${instrument}: ${accepted(instrument)}`);
    if (spec.switches.includes(flag) && inline === undefined) { out.push(flag); continue; }
    if (Object.hasOwn(spec.values, flag)) {
      const value = inline ?? extra[++index];
      if (typeof value !== "string" || !VALUE.test(value) || !spec.values[flag].test(value)) {
        throw invalid(`${flag} needs a valid value${flag === "--at" ? " (timeline seconds, comma-separated, e.g. 1.5,8)" : ""}; got ${JSON.stringify(String(value ?? "").slice(0, 60))}`);
      }
      out.push(flag, value);
      continue;
    }
    throw invalid(`${JSON.stringify(extra[index].slice(0, 60))} is not an accepted ${instrument} flag; accepted: ${accepted(instrument)}`);
  }
  return out;
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { return undefined; }
}

/** frame-state prints its report path; return it relative to the project's instruments folder. */
function frameStateReport(stdout, projectId, { root, projectsDir }) {
  const line = String(stdout).split("\n").map(value => value.trim()).reverse().find(value => value.endsWith("frame-state.json") && !value.startsWith("["));
  if (!line) return undefined;
  const relative = path.relative(path.join(projectsDir, projectId, "instruments"), path.resolve(root, line));
  return relative.startsWith("..") || path.isAbsolute(relative) ? undefined : relative.split(path.sep).join("/");
}

/**
 * Bounded instrument result. A non-zero exit is a typed error; success returns parsed JSON when
 * the instrument printed it, otherwise a capped, redacted output tail, plus frame-state's report.
 */
export function instrumentResult(instrument, projectId, result, dirs) {
  const stdout = String(result?.stdout ?? "").trim();
  const stderr = String(result?.stderr ?? "").trim();
  if (result?.exit_code !== 0) {
    const reported = (instrument === "qc" || instrument === "preview-readiness") && result?.exit_code === 1 && stdout;
    const cause = redactLocalText(stderr).split("\n").reverse().find(Boolean)?.replace(/^[A-Za-z]*Error:\s*/, "");
    const message = reported
      ? `${instrument} found problems (exit 1); read output_tail for the failing checks`
      : capText(`${instrument} failed (exit ${result?.exit_code}): ${cause || "no error text"}`, 600);
    const transient = reported ? null : transientFailure(cause);
    throw Object.assign(new Error(message), { toolError: {
      schema_version: 1, code: reported ? "INSTRUMENT_CHECK_FAILED" : transient?.code ?? "INSTRUMENT_FAILED", message,
      retryable: transient?.retryable ?? false, state_changed: false, exit_code: result?.exit_code,
      output_tail: capText(redactLocalText(stdout)), ...(reported ? {} : { stderr_tail: capText(redactLocalText(stderr), 1000) }),
      recovery: transient?.recovery ?? (reported
        ? { action: "fix_findings", reason: "The instrument ran and reported failing checks; fix them through proposals, then rerun." }
        : { action: "inspect_failure", reason: "Check the project id and flags; rerunning unchanged input fails the same way." }),
    } });
  }
  const json = stdout.startsWith("{") || stdout.startsWith("[") ? parseJson(stdout) : undefined;
  const report_path = instrument === "frame-state" ? frameStateReport(stdout, projectId, dirs) : undefined;
  if (json !== undefined && JSON.stringify(json).length <= 20_000) return { instrument, exit_code: 0, report: json };
  return {
    instrument, exit_code: 0,
    ...(report_path ? { report_path, next: { tool: "timeline_evidence", arguments: { project_id: projectId, report: report_path } } } : {}),
    output: capText(redactLocalText(stdout)),
    ...(json !== undefined ? { output_truncated: true } : {}),
  };
}
