export type ElementMutation = {
  element_id: string;
  patch?: Record<string, unknown>;
  props?: Record<string, unknown>;
};

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `${init.method ?? "GET"} ${url} failed (${response.status})`);
  return body;
}

/** The only agent-facing props mutation: partial props are merged server-side. */
export function patchElementProps(baseUrl: string, projectId: string, elementId: string, partial: Record<string, unknown>) {
  return requestJson<{ element: unknown }>(`${baseUrl}/api/projects/${encodeURIComponent(projectId)}/timeline/elements/${elementId}/props`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ props: partial }),
  });
}

/** Applies all mutations under one project lock and writes one history snapshot. */
export function batchMutateElements(baseUrl: string, projectId: string, operations: ElementMutation[]) {
  return requestJson<{ elements: unknown[] }>(`${baseUrl}/api/projects/${encodeURIComponent(projectId)}/timeline/elements/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operations }),
  });
}
