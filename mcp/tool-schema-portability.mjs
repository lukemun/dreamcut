/**
 * Portable MCP tool input schemas. One schema must register unchanged with Anthropic
 * (Claude), OpenAI (Codex) and local/open-model runtimes (llama.cpp, Ollama, vLLM
 * grammars). See docs/standards/tool-authoring.md#portable-tool-schemas.
 *
 * The subset is a denylist of constructs at least one supported client rejects or
 * mis-generates; it is not a full JSON Schema dialect. Runtime validation stays
 * authoritative, so the subset may only widen or restate constraints, never invent them.
 */

// Keyword → reason it is outside the portable subset.
const FORBIDDEN_KEYWORDS = {
  $schema: "Dialect markers belong to the MCP envelope, not each tool schema.",
  $ref: "Inline the schema; reference resolution differs between clients and grammar engines.",
  $defs: "Inline the schema; reference resolution differs between clients and grammar engines.",
  definitions: "Inline the schema; reference resolution differs between clients and grammar engines.",
  $id: "Tool schemas are anonymous inline documents.",
  prefixItems: "Use one `items` schema with minItems/maxItems; positional schemas are not portable.",
  additionalItems: "Use one `items` schema with minItems/maxItems; positional schemas are not portable.",
  allOf: "Merge the constraints into one schema; use anyOf for alternatives.",
  oneOf: "Use anyOf; exclusivity is validated at runtime.",
  not: "Express the constraint at runtime.",
  if: "Express conditional constraints at runtime.",
  then: "Express conditional constraints at runtime.",
  else: "Express conditional constraints at runtime.",
  dependentSchemas: "Express conditional constraints at runtime.",
  dependentRequired: "Express conditional constraints at runtime.",
  dependencies: "Express conditional constraints at runtime.",
  patternProperties: "Use additionalProperties with one schema.",
  unevaluatedProperties: "Use additionalProperties.",
  unevaluatedItems: "Use one `items` schema.",
};

// Keywords whose values are maps of property name → schema (keys are data, not keywords).
const SCHEMA_MAPS = new Set(["properties"]);
// Keywords whose values are literal data, not schemas.
const DATA_KEYWORDS = new Set(["enum", "const", "default", "examples", "required"]);

const stable = (value) => JSON.stringify(value, (_, v) => (v && typeof v === "object" && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]))
  : v));

/**
 * Rewrites draft-07 tuple `items: [a, a, …]` into `items: a` with an exact length.
 * Lossless only when every position shares one schema; mixed tuples throw so the
 * owning validator is changed deliberately instead of silently widened.
 */
export function toPortableToolSchema(schema, at = "#") {
  if (Array.isArray(schema)) return schema.map((child, index) => toPortableToolSchema(child, `${at}/${index}`));
  if (!schema || typeof schema !== "object") return schema;
  const copy = {};
  for (const [key, child] of Object.entries(schema)) {
    if (DATA_KEYWORDS.has(key)) copy[key] = child;
    else if (SCHEMA_MAPS.has(key)) copy[key] = Object.fromEntries(Object.entries(child).map(([name, value]) => [name, toPortableToolSchema(value, `${at}/${key}/${name}`)]));
    else copy[key] = toPortableToolSchema(child, `${at}/${key}`);
  }
  if (Array.isArray(copy.items)) {
    const positions = copy.items;
    if (!positions.length || new Set(positions.map(stable)).size !== 1) {
      throw new Error(`${at}: tuple positions differ; portable schemas need one items schema. Restructure the validator (e.g. an object with named fields).`);
    }
    if (copy.additionalItems !== undefined && copy.additionalItems !== false) {
      throw new Error(`${at}: open-ended tuples are not portable.`);
    }
    delete copy.additionalItems;
    copy.items = positions[0];
    copy.minItems = Math.max(copy.minItems ?? 0, positions.length);
    copy.maxItems = Math.min(copy.maxItems ?? positions.length, positions.length);
  }
  return copy;
}

/** Returns `{ path, keyword, reason }` violations; empty means portable. */
export function portableSchemaViolations(schema, at = "#") {
  const violations = [];
  const visit = (node, path) => {
    if (Array.isArray(node)) return node.forEach((child, index) => visit(child, `${path}/${index}`));
    if (!node || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node)) {
      if (Object.hasOwn(FORBIDDEN_KEYWORDS, key)) violations.push({ path: `${path}/${key}`, keyword: key, reason: FORBIDDEN_KEYWORDS[key] });
      if (key === "items" && (Array.isArray(child) || (child !== null && typeof child !== "object" && typeof child !== "boolean"))) {
        violations.push({ path: `${path}/items`, keyword: "items", reason: "items must be one schema (object or boolean), not a tuple array." });
      }
      if (DATA_KEYWORDS.has(key)) continue;
      if (SCHEMA_MAPS.has(key)) for (const [name, value] of Object.entries(child ?? {})) visit(value, `${path}/${key}/${name}`);
      else visit(child, `${path}/${key}`);
    }
  };
  if (schema?.type !== "object") violations.push({ path: at, keyword: "type", reason: "Tool input schemas must have root type \"object\"." });
  visit(schema, at);
  return violations;
}

/** Checks every tool in a tools/list-shaped array; returns violations tagged by tool. */
export function toolCatalogViolations(tools) {
  return tools.flatMap((tool) => portableSchemaViolations(tool.inputSchema, `${tool.name}#`).map((violation) => ({ tool: tool.name, ...violation })));
}
