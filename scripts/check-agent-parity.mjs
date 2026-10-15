// Enforces that coding agents (shell + MCP) and the in-editor agent (MCP only) share one
// editing surface. See docs/standards/agent-surface-parity.md.
//
//   node scripts/check-agent-parity.mjs          fail on violations, report known gaps
//   node scripts/check-agent-parity.mjs --json   machine-readable report
import fs from "node:fs";
import path from "node:path";

import { editorAgentFamilies, editorAgentTools, registry, validateEditorAgentAccess } from "../mcp/capability-catalog.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

/** Shell commands or repository file paths written as inline code in a skill. */
export const SHELL_OR_FILE_REFERENCE = /`((?:pnpm|npx|node|tsx|python3?|ffmpeg|ffprobe|\.\/\.venv[\w-]*\/bin\/python)\s[^`]*|[^`\s]*(?:scripts\/|sfx-library\/|music-library\/|projects\/)[^`]*)`/g;

export function checkAgentParity({ skillsDir = path.join(root, ".agents/skills"), exemptions = JSON.parse(read("docs/tools/agent-surface-exemptions.json")), source = registry, files = {
  session: read("desktop/editing-session.mjs"),
  harness: read("mcp/harness-mcp.mjs"),
} } = {}) {
  const violations = [];
  const gaps = [];
  const tools = new Set(source.capabilities.flatMap((cap) => cap.tools));

  // 1. The registry declares every capability's editor access.
  for (const problem of validateEditorAgentAccess(source)) violations.push(`registry: ${problem}`);

  // 2. Runtime surfaces derive from the registry instead of keeping their own lists.
  if (/export const EDITING_FAMILIES\s*=\s*\[/.test(files.session) || !files.session.includes("editorAgentFamilies()")) {
    violations.push("desktop/editing-session.mjs must load families with editorAgentFamilies(), not a hand-kept list");
  }
  if (/OPERATOR_TOOLS\s*=\s*new Set\(\[/.test(files.harness) || !files.harness.includes("editorAgentTools()")) {
    violations.push("mcp/harness-mcp.mjs must derive OPERATOR_TOOLS with editorAgentTools(), not a hand-kept list");
  }
  const enabledTools = editorAgentTools(source);
  for (const family of editorAgentFamilies(source)) {
    const cap = source.capabilities.find((entry) => entry.id === family);
    for (const tool of cap.tools) {
      if (!enabledTools.has(tool) && !Object.hasOwn(cap.editor_agent.excluded_tools ?? {}, tool)) violations.push(`registry: ${family} is enabled but ${tool} is not offered`);
    }
  }

  // 3. Editing skills name an MCP tool for every shell or file instruction, or record a gap.
  const codingSkills = exemptions.coding_agent_skills ?? {};
  const usedGaps = new Set();
  for (const skill of fs.readdirSync(skillsDir).sort()) {
    const skillFile = path.join(skillsDir, skill, "SKILL.md");
    if (!fs.existsSync(skillFile)) continue;
    if (Object.hasOwn(codingSkills, skill)) continue;
    const lines = fs.readFileSync(skillFile, "utf8").split("\n");
    lines.forEach((line, index) => {
      const references = [...line.matchAll(SHELL_OR_FILE_REFERENCE)];
      if (references.length === 0) return;
      const namesTool = [...tools].some((tool) => new RegExp(`\\b${tool}\\b`).test(line));
      if (namesTool) return;
      const gapIndex = (exemptions.gaps ?? []).findIndex((gap) => gap.skill === skill && line.includes(gap.line_contains));
      if (gapIndex >= 0) {
        usedGaps.add(gapIndex);
        gaps.push({ ...exemptions.gaps[gapIndex], line: index + 1 });
        return;
      }
      violations.push(`${skill}/SKILL.md:${index + 1}: ${references.map((match) => match[1]).join(", ")} has no MCP equivalent on the line and no recorded gap`);
    });
  }
  (exemptions.gaps ?? []).forEach((gap, index) => {
    if (!usedGaps.has(index)) violations.push(`stale gap: ${gap.skill} no longer contains "${gap.line_contains}"; remove the exemption`);
  });
  for (const skill of Object.keys(codingSkills)) {
    if (!fs.existsSync(path.join(skillsDir, skill, "SKILL.md"))) violations.push(`stale coding-agent skill exemption: ${skill}`);
  }

  // 4. Capabilities without MCP tools are deliberately outside the editor (or host-supplied).
  for (const cap of source.capabilities) {
    if (cap.tools.length === 0 && cap.editor_agent?.access === "enabled") {
      violations.push(`${cap.id}: an enabled capability needs an MCP tool`);
    }
  }
  return { violations, gaps, editor_tools: [...enabledTools].sort() };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = checkAgentParity();
  if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else {
    for (const gap of report.gaps) console.log(`gap  ${gap.skill}:${gap.line}  ${gap.missing}`);
    console.log(`Agent parity: ${report.editor_tools.length} editor-agent tools, ${report.gaps.length} recorded gaps, ${report.violations.length} violations.`);
  }
  if (report.violations.length) {
    console.error(report.violations.map((violation) => `✖ ${violation}`).join("\n"));
    process.exit(1);
  }
}
