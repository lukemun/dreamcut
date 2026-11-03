const text = (value: unknown) => typeof value === "string" && value.length > 0 ? value : "unknown";

/** Provider translation boundary. Count one terminal log per inference; never infer
 * usage from text or infer the provider from a model identifier. */
export function normalizeModelEvent(attrs: Record<string, unknown>, eventName?: unknown) {
  const supported = (value: unknown) => typeof value === "string" && (value.startsWith("codex.") || value === "gen_ai.client.inference.operation.details");
  const name = supported(eventName) ? eventName : attrs["event.name"];
  const codex = typeof name === "string" && name.startsWith("codex.");
  const standard = name === "gen_ai.client.inference.operation.details";
  if (!codex && !standard) return null;
  const completed=codex&&name === "codex.sse_event"&&attrs["event.kind"] === "response.completed";
  const hasUsage=attrs.input_token_count!==undefined||attrs.output_token_count!==undefined;
  return {
    provider: text(attrs["gen_ai.provider.name"]),
    runtime: codex ? "codex" : "gen_ai",
    conversation: text(codex ? attrs["conversation.id"] : attrs["gen_ai.conversation.id"]),
    model: text(codex ? attrs.model : attrs["gen_ai.response.model"] ?? attrs["gen_ai.request.model"]),
    response: standard || completed&&hasUsage,
    unmeteredCompletion:completed&&!hasUsage,
    tool: name === "codex.tool_result",
    // Logs written before the DreamCut rename carry openedit.error.
    error: [attrs["dreamcut.error"], attrs["openedit.error"]].some(flag => flag === true || flag === "true") || attrs["error.type"] != null,
    input: codex ? attrs.input_token_count : attrs["gen_ai.usage.input_tokens"],
    output: codex ? attrs.output_token_count : attrs["gen_ai.usage.output_tokens"],
    cached: codex ? attrs.cached_token_count : attrs["gen_ai.usage.cache_read.input_tokens"],
    reasoning: codex ? attrs.reasoning_token_count : attrs["gen_ai.usage.reasoning.output_tokens"],
  };
}
