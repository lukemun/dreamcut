import assert from "node:assert/strict";
import test from "node:test";

import { isSafeProjectId, projectDir } from "./paths";

test("safe project ids are single non-dot path segments", () => {
  assert.equal(isSafeProjectId("fixture-project_1.2"), true);
  for (const value of ["", ".", "..", "../escape", "nested/project", "nested\\project"]) {
    assert.equal(isSafeProjectId(value), false, value);
    assert.throws(() => projectDir(value), /Invalid project id/);
  }
});
