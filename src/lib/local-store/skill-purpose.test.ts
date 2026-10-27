import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { coreSkills, skillsDirectory } from "./editing-memory";

test("every shipped skill exposes a purpose from one canonical evolution log", () => {
  const skills = coreSkills();
  assert.ok(skills.length > 0);
  for (const skill of skills) {
    assert.ok(skill.purpose, `${skill.name} needs a purpose`);
    assert.ok(skill.evolution.includes(skill.purpose!));
    assert.notEqual(skill.purpose, skill.description);
    const files = fs.readdirSync(path.join(skillsDirectory(), skill.name));
    assert.ok(files.includes("evolution.md"));
    assert.equal(files.includes(`${skill.name}.evolution.md`), false);
    assert.equal(files.includes("EVOLUTION.md"), false);
  }
});
