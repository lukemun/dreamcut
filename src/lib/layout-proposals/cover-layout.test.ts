import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { projectLayoutProposalHistoryDir, projectLayoutProposalPath } from "@/lib/local-store/paths";
import { createProject, writeJsonFileAtomic } from "@/lib/local-store/store";
import {
  listCoverLayoutProposals,
  readCoverLayoutProposal,
  saveCoverLayoutProposal,
  type CoverLayoutProposal,
} from "@/lib/layout-proposals/cover-layout";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "cover-layout-proposals-"));
process.env.TIMELINE_PROJECTS_DIR = root;

const projectId = "cover-layout-fixture";
const layoutId = "cover-map-v1";

function fixture(): CoverLayoutProposal {
  return {
    schema_version: 1,
    layout_id: layoutId,
    title: "Cover map",
    revision: 0,
    updated_at: "2026-07-24T00:00:00.000Z",
    canvas: { width: 1080, height: 1920 },
    generated_items: [
      {
        id: "cover-a",
        asset_url: "/cover-a.jpg",
        x: 100,
        y: 200,
        width: 60,
        height: 90,
        rotation: 0,
      },
      {
        id: "cover-b",
        asset_url: "/cover-b.jpg",
        x: 300,
        y: 400,
        width: 60,
        height: 90,
        rotation: 0,
      },
    ],
    items: [
      {
        id: "cover-a",
        asset_url: "/cover-a.jpg",
        x: 100,
        y: 200,
        width: 60,
        height: 90,
        rotation: 0,
      },
      {
        id: "cover-b",
        asset_url: "/cover-b.jpg",
        x: 300,
        y: 400,
        width: 60,
        height: 90,
        rotation: 0,
      },
    ],
  };
}

function resetFixture() {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  createProject(projectId, "web");
  writeJsonFileAtomic(projectLayoutProposalPath(projectId, layoutId), fixture());
}

test("layout save creates a revision and preserves the previous map in history", () => {
  resetFixture();
  const current = readCoverLayoutProposal(projectId, layoutId);
  const moved = current.items.map((item) =>
    item.id === "cover-a" ? { ...item, x: 160, y: 260 } : item
  );
  const { proposal: saved, history } = saveCoverLayoutProposal(projectId, layoutId, {
    expected_revision: 0,
    edit_source: "user_ui",
    items: moved,
  });

  assert.equal(saved.revision, 1);
  // The save enters the shared project snapshot stream with distinct before/after ids.
  assert.ok(history.before.id && history.after.id && history.before.id !== history.after.id);
  assert.equal(saved.items[0]?.x, 160);
  assert.deepEqual(saved.adjustment_summary, {
    compared_to: "generated_items",
    based_on_revision: 0,
    last_edit_source: "user_ui",
    changed_item_count: 1,
    changed_item_ids: ["cover-a"],
    changed_property_counts: {
      x: 1,
      y: 1,
      width: 0,
      height: 0,
      rotation: 0,
    },
  });
  assert.ok(fs.existsSync(path.join(
    projectLayoutProposalHistoryDir(projectId, layoutId),
    "000000.json",
  )));
  assert.deepEqual(listCoverLayoutProposals(projectId), [{
    layout_id: layoutId,
    title: "Cover map",
    revision: 1,
    updated_at: saved.updated_at,
    cover_count: 2,
    unique_cover_count: 2,
  }]);
});

test("layout adjustment summary remains cumulative against the generated layout", () => {
  resetFixture();
  const { proposal: first } = saveCoverLayoutProposal(projectId, layoutId, {
    expected_revision: 0,
    edit_source: "user_ui",
    items: fixture().items.map((item) =>
      item.id === "cover-a" ? { ...item, x: 160 } : item
    ),
  });
  const { proposal: second } = saveCoverLayoutProposal(projectId, layoutId, {
    expected_revision: first.revision,
    edit_source: "agent",
    items: first.items.map((item) =>
      item.id === "cover-b" ? { ...item, rotation: 12 } : item
    ),
  });

  assert.deepEqual(second.adjustment_summary, {
    compared_to: "generated_items",
    based_on_revision: 1,
    last_edit_source: "agent",
    changed_item_count: 2,
    changed_item_ids: ["cover-a", "cover-b"],
    changed_property_counts: {
      x: 1,
      y: 0,
      width: 0,
      height: 0,
      rotation: 1,
    },
  });
});

test("layout save rejects stale revisions, missing covers, and out-of-bounds positions", () => {
  resetFixture();
  const current = readCoverLayoutProposal(projectId, layoutId);

  assert.throws(
    () => saveCoverLayoutProposal(projectId, layoutId, {
      expected_revision: 1,
      edit_source: "unspecified",
      items: current.items,
    }),
    /expected revision 1, current 0/,
  );
  assert.throws(
    () => saveCoverLayoutProposal(projectId, layoutId, {
      expected_revision: 0,
      edit_source: "unspecified",
      items: current.items.slice(0, 1),
    }),
    /complete cover set/,
  );
  assert.throws(
    () => saveCoverLayoutProposal(projectId, layoutId, {
      expected_revision: 0,
      edit_source: "unspecified",
      items: current.items.map((item) =>
        item.id === "cover-a" ? { ...item, x: 2000 } : item
      ),
    }),
    /outside the editable canvas bounds/,
  );
});
