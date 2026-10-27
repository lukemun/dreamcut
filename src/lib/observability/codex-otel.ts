import { readEnv } from "@/lib/env-name";
/** Native Codex OTLP logs; intentionally separate from the editor's Sentry provider. */
export function codexOtelArgs(endpoint = readEnv("CODEX_OTEL_ENDPOINT")): string[] {
  if (!endpoint) return [];
  const url = new URL(endpoint);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    || url.username || url.password || url.search || url.hash || url.pathname !== "/v1/logs") {
    throw new Error("Codex telemetry requires a loopback HTTP /v1/logs endpoint");
  }
  return [
    "-c", 'otel.environment="dreamcut-local"',
    "-c", "otel.log_user_prompt=false",
    "-c", `otel.exporter={otlp-http={endpoint=${JSON.stringify(url.href)},protocol="json"}}`,
    "-c", 'otel.trace_exporter="none"',
    "-c", 'otel.metrics_exporter="none"',
  ];
}
