import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { writeCompositionSource } from "./hyperframes-candidates";

function withProject(run: (projectId: string, root: string) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hf-candidates-"));
  const previous = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    fs.mkdirSync(path.join(root, "demo", "media"), { recursive: true });
    run("demo", root);
  } finally {
    if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const controls = (template?: string) => JSON.stringify({ schema_version: 1, ...(template ? { template } : {}), controls: [] });

test("a looks template never stores looks.js: one sent is dropped and an old copy is removed", () => {
  withProject((projectId, root) => {
    const dir = path.join(root, projectId, "hyperframes", "explainer");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "looks.js"), "// stale copy from before looks were supplied");
    writeCompositionSource(projectId, "explainer", {
      files: [
        { path: "dreamcut.controls.json", text: controls("illustrated-explainer") },
        { path: "index.html", text: "<script src=\"looks.js\"></script>" },
        { path: "looks.js", text: "// sent by an agent" },
      ],
    });
    assert.equal(fs.existsSync(path.join(dir, "looks.js")), false);
    assert.equal(fs.existsSync(path.join(dir, "index.html")), true);
  });
});

test("a composition that is not a looks template keeps its own looks.js", () => {
  withProject((projectId, root) => {
    writeCompositionSource(projectId, "sting", {
      files: [
        { path: "dreamcut.controls.json", text: controls() },
        { path: "looks.js", text: "// its own code" },
      ],
    });
    assert.equal(fs.readFileSync(path.join(root, projectId, "hyperframes", "sting", "looks.js"), "utf8"), "// its own code");
  });
});
