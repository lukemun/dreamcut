const DEFAULT_APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "http://localhost:3000";

export function getAppBaseUrl(): string {
  return (process.env.APP_URL?.trim() || DEFAULT_APP_BASE_URL).replace(/\/$/, "");
}

export function buildAppUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${getAppBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/** `version` (the export's job id) gives each export its own address: a <video> kept on
 * one address keeps its first file's index and then seeks into a newer file with it. */
export function buildLatestRenderFileUrl(
  projectId: string,
  options?: { download?: boolean; version?: string | null },
): string {
  const query = new URLSearchParams();
  if (options?.download) query.set("download", "1");
  if (options?.version) query.set("v", options.version);
  const url = `/api/projects/${projectId}/render/latest/file`;
  return query.size ? `${url}?${query}` : url;
}
