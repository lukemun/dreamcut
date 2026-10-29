import assert from "node:assert/strict";
import test from "node:test";
import { judge } from "./editor-shown-gate.mjs";

const link = "[Take](http://127.0.0.1:3123/p/speed-hops-take)";
const human = text => ({ type: "user", origin: { kind: "human" }, message: { content: text } });
const call = name => ({ type: "assistant", message: { content: [{ type: "tool_use", name, input: {} }] } });
const say = text => ({ type: "assistant", message: { content: [{ type: "text", text }] } });

test("a reply that links a project without showing the editor this turn is held back", () => {
  const earlier = [human("open it"), call("mcp__ccd_view__show_pane"), say(link)];
  assert.match(judge([...earlier, human("now restage it"), say(link)]), /editor was not shown/);
  assert.equal(judge([human("restage it"), call("mcp__ccd_view__show_pane"), say(link)]), null);
});

test("a background task's notification or a subagent's hand-back does not start a new turn", () => {
  // Session fc68e17d, 2026-10-28 22:53: the editor was shown, then a background wait finished
  // mid-turn and the hook read its notification as the creator's message.
  const notification = {
    type: "user",
    origin: { kind: "task-notification", producer: "session-task" },
    message: { content: "<task-notification>\n<task-id>bqfuzheri</task-id>\n<status>completed</status>\n</task-notification>" },
  };
  const handBack = { type: "user", isMeta: true, origin: { kind: "peer", from: "agent" }, message: { content: "Another Claude session sent a message: …" } };
  for (const injected of [notification, handBack, { ...handBack, isMeta: undefined }]) {
    const turn = [human("restage it"), call("mcp__ccd_view__show_pane"), injected, say(link)];
    assert.equal(judge(turn), null);
  }
});

test("transcripts without an origin still start the turn at the last plain user message", () => {
  const legacy = text => ({ type: "user", message: { content: text } });
  assert.match(judge([legacy("open"), call("mcp__ccd_view__show_pane"), legacy("again"), say(link)]), /editor was not shown/);
});
