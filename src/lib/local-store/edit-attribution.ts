import { randomUUID } from "node:crypto";
import { assertFeedbackReferences } from "./editing-feedback";
import { AsyncLocalStorage } from "node:async_hooks";
import { HISTORY_ACTION_HEADER, HISTORY_LABEL_HEADER, parseHistoryAction, sanitizeHistoryLabel, type HistoryAction } from "../timeline/history-label";

export type EditActor = "human" | "agent" | "system" | "unknown";
export type EditAttribution = {
  responds_to_feedback_ids?: string[];
  transaction_id?: string;
  proposal_ids?: string[];
  restores_snapshot_id?: string;
  /** Set when the editor replays an Undo/Redo step; labels saved history only. */
  history_action?: HistoryAction;
  history_label?: string;
  actor: EditActor;
  initiated_by: EditActor;
  attribution_source: "editor_request" | "mcp_request" | "approved_proposal" | "system_operation" | "unknown";
};
const context = new AsyncLocalStorage<EditAttribution>();
const unknown: EditAttribution = { actor: "unknown", initiated_by: "unknown", attribution_source: "unknown" };

/** DreamCut request headers; processes from the OpenEdit era send x-openedit-* and remain accepted. */
export function dreamcutRequestHeader(request: Request, name: "client" | "feedback-ids"): string | null {
  return request.headers.get(`x-dreamcut-${name}`) ?? request.headers.get(`x-openedit-${name}`);
}

/** Provenance, NOT authentication or permission to mutate a project. */
export function requestEditAttribution(request: Request): EditAttribution {
  const client = dreamcutRequestHeader(request, "client");
  if (client === "mcp") {
    return { actor: "agent", initiated_by: "agent", attribution_source: "mcp_request" };
  }
  if (client === "editor") {
    return { actor: "human", initiated_by: "human", attribution_source: "editor_request" };
  }
  // Browser fetch metadata distinguishes editor-origin traffic from opaque CLI
  // writes without treating an overlapping project-wide agent lease as identity.
  if (request.headers.get("sec-fetch-site") === "same-origin") {
    const origin = request.headers.get("origin");
    if (!origin || origin === new URL(request.url).origin) {
      return { actor: "human", initiated_by: "human", attribution_source: "editor_request" };
    }
  }
  return unknown;
}

/** Undo/Redo replay marker sent by the editor. Provenance for labels, never permission. */
export function requestHistoryAction(request: Request): Pick<EditAttribution, "history_action" | "history_label"> {
  const action = parseHistoryAction(request.headers.get(HISTORY_ACTION_HEADER));
  if (!action) return {};
  let label: string | null = null;
  try { label = sanitizeHistoryLabel(decodeURIComponent(request.headers.get(HISTORY_LABEL_HEADER) ?? "")); } catch { label = null; }
  return { history_action: action, ...(label ? { history_label: label } : {}) };
}

export function withEditRequestActor<RequestType extends Request, Args extends unknown[], Result>(handler: (request: RequestType, ...args: Args) => Result) {
  return (request: RequestType, ...args: Args): Result | Response => {
    const header = dreamcutRequestHeader(request, "feedback-ids");
    let ids: string[] | undefined;
    try {
      const projectId = new URL(request.url).pathname.match(/^\/api\/projects\/([^/]+)\//)?.[1];
      ids = header ? assertFeedbackReferences(decodeURIComponent(projectId ?? ""), JSON.parse(header)) : undefined;
    } catch (error) {
      return Response.json({ error: String(error) }, { status: 400 });
    }
    return context.run({ ...requestEditAttribution(request), transaction_id: randomUUID(),
      ...(ids?.length ? { responds_to_feedback_ids: ids } : {}), ...requestHistoryAction(request) }, () => handler(request, ...args));
  };
}

export function currentEditAttribution(operation: string): EditAttribution {
  const source = context.getStore() ?? unknown;
  if (operation.startsWith("editor_agent_")) {
    return { ...source, actor: "agent", initiated_by: source.initiated_by, attribution_source: "approved_proposal" };
  }
  if (operation === "timeline_compaction") {
    return { actor: "system", initiated_by: source.initiated_by, attribution_source: "system_operation" };
  }
  return source;
}

/** Request-scoped causal links; never grants mutation permission. */
export function withFeedbackAttribution<T>(links: Pick<EditAttribution, "responds_to_feedback_ids" | "proposal_ids" | "restores_snapshot_id">, run: () => T): T {
  return context.run({ ...(context.getStore() ?? unknown), transaction_id: context.getStore()?.transaction_id ?? randomUUID(), ...links }, run);
}
