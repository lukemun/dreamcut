import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readLibraryAnnotations } from "./library-annotations";

test("library annotations are optional and validate project ownership", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-library-annotations-"));
  const previous = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    fs.mkdirSync(path.join(root, "memes"), { recursive: true });
    assert.equal(readLibraryAnnotations("memes"), null);
    fs.writeFileSync(path.join(root, "memes", "library-annotations.json"), JSON.stringify({
      schema_version: 1,
      project_id: "memes",
      researched_at: "2026-09-16T00:00:00.000Z",
      method: "Reviewed the source template and recorded bounded editorial guidance.",
      assets: {
        "sources/example.jpg": {
          display_name: "Example",
          meaning: "A compact reaction template.",
          use_cases: ["Reacting to a surprising result"],
          tone: ["surprised"],
          template_structure: "Set up the event, then reveal the reaction.",
          cultural_context: "A locally reviewed template.",
          avoid_when: [],
          tags: ["reaction"],
          confidence: "medium",
          sources: [{ label: "Template page", url: "https://example.com/template", kind: "template_page" }],
        },
      },
    }));
    assert.equal(readLibraryAnnotations("memes")?.assets["sources/example.jpg"]?.display_name, "Example");
    const mismatched = JSON.parse(fs.readFileSync(path.join(root, "memes", "library-annotations.json"), "utf8"));
    mismatched.project_id = "other";
    fs.writeFileSync(path.join(root, "memes", "library-annotations.json"), JSON.stringify(mismatched));
    assert.throws(() => readLibraryAnnotations("memes"), /belong to other/);
  } finally {
    if (previous == null) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previous;
  }
});
