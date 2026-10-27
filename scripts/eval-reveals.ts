import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { revealEvalCases, revealEvalPacket, gradeRevealOption, REVEAL_EVAL_VERSION } from "../src/lib/agent/reveal-sequence-eval";

const [command, id, file] = process.argv.slice(2);
try {
  if (command === "compare-catalogs" && id) {
    const packet = revealEvalPacket(id);
    const variants = ["full", "editing"].map(profile => {
      const catalog = JSON.parse(execFileSync(process.execPath, ["mcp/server.mjs", "--catalog", `--profile=${profile}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: {...process.env, DREAMCUT_TOOL_FAMILIES: ""} }));
      return { profile, catalog_sha256: catalog.catalog_sha256, tool_count: catalog.tools.length, schema_utf8_bytes: Buffer.byteLength(JSON.stringify(catalog.tools)), tools: catalog.tools };
    });
    console.log(JSON.stringify({ comparison_version: 1, packet, variants,
      execution: "Comparison packet only; does not launch a model or mutate a project. For MCP clients, editing loads families through capability_catalog and tools/list_changed. Static tool runners must select/register their tool set before starting; returning a schema as text does not register it.",
      authority: "Same isolated synthetic case in both arms. Only read-only catalog discovery and proposal compilation are permitted; reject other calls and count them as selection failures. No source preparation, timeline/proposal persistence, approval, network or shell. This tests selection among distractors, not full production authority.",
      record: ["model/settings and harness version", "fixture and catalog hashes", "actual supplied tool schemas, including loads", "all attempted calls and failures", "elapsed time", "provider token usage or unknown", "final option and grade", "quality unreviewed: synthetic fixture has no playable media"],
      acceptance: "Grade each saved option with eval:reveals grade. Preserve failed/timed-out trials. Compare matched repeated runs; bytes are not measured tokens and catalog reduction is not agent speedup. Do not expose grader/reference answers to the model.",
    }, null, 2));
  }
  else if (command === "list") console.log(JSON.stringify({ suite: REVEAL_EVAL_VERSION, cases: revealEvalCases }, null, 2));
  else if (command === "packet" && id) console.log(JSON.stringify(revealEvalPacket(id), null, 2));
  else if (command === "grade" && id && file) {
    const result = gradeRevealOption(id, JSON.parse(fs.readFileSync(file, "utf8")));
    console.log(JSON.stringify(result, null, 2));
    if (!result.pass) process.exitCode = 1;
  } else throw new Error("Usage: pnpm eval:reveals list | compare-catalogs <case> | packet <case> | grade <case> <option.json>");
} catch (error) { console.error(String(error)); process.exitCode = 1; }
