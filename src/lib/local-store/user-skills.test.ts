import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readUserSkills } from "./user-skills";

test("personal copies preserve catalog ownership and explicit provenance without overriding originals", () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-user-skills-"));
  try {
    const catalog = [{ name: "caption-craft", description: "Shared", content: "Original instructions", catalog: null }];
    assert.equal(readUserSkills(catalog, profile)[0].origin, "catalog", "uncurated shared skills are still catalog skills");
    const folder = path.join(profile, "skills", "caption-craft");
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, "SKILL.md"), "---\ndescription: My captions\nbased_on: caption-craft\n---\nPersonal instructions");
    const skills = readUserSkills(catalog, profile);
    assert.equal(skills.length, 2);
    assert.equal(skills[0].content, "Original instructions");
    assert.equal(skills[1].origin, "personal");
    assert.equal(skills[1].based_on, "caption-craft");
    assert.equal(skills[1].description, "My captions");
    fs.writeFileSync(path.join(folder, "SKILL.md"), "---\ndescription: Changed\n---\nNo declared source");
    assert.equal(readUserSkills(catalog, profile)[1].based_on, undefined);
    assert.equal(readUserSkills(catalog, profile)[1].description, "Changed");
    fs.symlinkSync(folder, path.join(profile, "skills", "linked-skill"));
    assert.equal(readUserSkills(catalog, profile).length, 2);
    assert.equal(catalog[0].content, "Original instructions");
  } finally { fs.rmSync(profile, { recursive: true, force: true }); }
});
