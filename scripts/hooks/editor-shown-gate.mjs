#!/usr/bin/env node
// Claude Code Stop hook: a reply that links a DreamCut project must not end until the editor was
// put in front of the creator during that turn. Opening a tab in a hidden browser pane does not
// count; the editor's own `project_shown` can be fooled by the agent's hidden tab.
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const PROJECT_LINK = /127\.0\.0\.1:3123\/p\/[A-Za-z0-9_-]+/;
// Calls that make the editor visible to the creator.
const SHOWS_EDITOR = new Set([
  "mcp__ccd_view__show_pane",
  "mcp__timeline-editor__editor_open",
  "mcp__Claude_Browser__preview_start",
]);

function readInput() {
  try { return JSON.parse(fs.readFileSync(0, "utf8") || "{}"); } catch { return {}; }
}

function entries(transcriptPath) {
  try {
    return fs.readFileSync(transcriptPath, "utf8").split("\n").flatMap(line => {
      if (!line.trim()) return [];
      try { return [JSON.parse(line)]; } catch { return []; }
    });
  } catch { return []; }
}

const blocks = entry => {
  const content = entry?.message?.content;
  return typeof content === "string" ? [{ type: "text", text: content }] : Array.isArray(content) ? content : [];
};

// The turn starts at the creator's latest own message (not a tool result or injected skill text).
// A background task's notification or a subagent's hand-back arrives as a user entry too; its
// origin says it was not the creator, so it does not start a new turn.
const isPrompt = entry => entry.type === "user" && !entry.isMeta
  && (!entry.origin?.kind || entry.origin.kind === "human")
  && blocks(entry).some(b => b.type === "text");

export function judge(transcript, finalText) {
  const start = transcript.findLastIndex(isPrompt);
  const turn = transcript.slice(start + 1).filter(e => e.type === "assistant");
  const text = finalText ?? turn.flatMap(blocks).filter(b => b.type === "text").map(b => b.text).join("\n");
  if (!PROJECT_LINK.test(text)) return null;
  const shown = turn.flatMap(blocks).some(b => b.type === "tool_use" && SHOWS_EDITOR.has(b.name));
  if (shown) return null;
  const link = text.match(PROJECT_LINK)[0];
  return `This reply links ${link}, but the editor was not shown to the creator this turn. `
    + `Show it first: call mcp__ccd_view__show_pane with pane "preview" (or editor_open) after navigating the built-in browser to http://${link}, then finish the reply.`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = readInput();
  // One reminder per stop; never loop.
  if (input.stop_hook_active || !input.transcript_path) process.exit(0);
  const reason = judge(entries(input.transcript_path), typeof input.last_assistant_message === "string" ? input.last_assistant_message : undefined);
  if (reason) process.stdout.write(JSON.stringify({ decision: "block", reason }));
}
