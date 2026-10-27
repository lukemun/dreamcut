// Every registered MCP tool schema must load in Claude, Codex and local-model clients.
// See docs/standards/tool-authoring.md#portable-tool-schemas.
import { spawnSync } from "node:child_process";
import { toolCatalogViolations } from "../mcp/tool-schema-portability.mjs";

const run = spawnSync(process.execPath, ["mcp/server.mjs", "--catalog", "--all-tools", "--profile=full"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, DREAMCUT_TOOL_FAMILIES: "" } });
if (run.status !== 0) throw Error(`Could not read the tool catalog:\n${run.stderr}`);
const { tools } = JSON.parse(run.stdout);
const violations = toolCatalogViolations(tools);
if (violations.length) {
  console.error(violations.map((v) => `${v.path}: ${v.reason}`).join("\n"));
  throw Error(`${violations.length} non-portable tool schema construct(s) across ${new Set(violations.map((v) => v.tool)).size} tool(s).`);
}
console.log(`All ${tools.length} tool input schemas are within the portable subset.`);
