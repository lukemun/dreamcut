/** Internal build/check helper; the application validator remains authoritative. */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { editorAgentProposalSchema } from "../src/lib/agent/timeline-editor-agent-apply";
import { portableSchemaViolations, toPortableToolSchema } from "./tool-schema-portability.mjs";

const filename = path.resolve("mcp/proposal-schema.json");
const generated = z.toJSONSchema(editorAgentProposalSchema, { target: "draft-07", io: "input", unrepresentable: "any" });
// Embedded in the outer MCP argument schema; avoid a second root dialect marker.
delete generated.$schema;
// Claude rejects draft-07 tuple `items`; normalize to the subset every client accepts.
const schema = toPortableToolSchema(generated);
const violations = portableSchemaViolations(schema);
if (violations.length) throw Error(`Proposal schema is not portable:\n${violations.map((v) => `${v.path}: ${v.reason}`).join("\n")}`);
const text = JSON.stringify(schema, null, 2) + "\n";
if (process.argv.includes("--write")) fs.writeFileSync(filename, text);
else if (fs.readFileSync(filename, "utf8") !== text) throw Error("Proposal tool schema is stale. Run node --import tsx mcp/generate-proposal-schema.ts --write");
else console.log("Proposal tool schema matches the canonical validator (runtime refinements remain server-side).");
