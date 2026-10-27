import assert from "node:assert/strict";
import test from "node:test";

import { coreSkills } from "@/lib/local-store/editing-memory";

test("the public skill catalog is backed by shipped skills and complete examples", () => {
  const skills = coreSkills();
  const names = new Set(skills.map(skill => skill.name));
  const catalogSkills = skills.filter(skill => skill.catalog !== null);
  // Learning and review skills are DreamCut team tools kept outside the editor.
  for (const name of ["learning-review", "agent-workflow-review", "editing-retrospective", "skill-review", "style-recipe-review", "personal-style-review", "tool-candidate-review", "editing-eval-curation"]) {
    assert.ok(!names.has(name), `${name} must not ship with the editor`);
  }

  for (const required of ["caption-craft", "cut-pacing", "timeline-auditions", "visual-timing", "beat-aligned-cuts", "audio-balance", "sound-design", "music-direction", "music-audition", "voice-file"]) {
    assert.ok(catalogSkills.some(skill => skill.name === required), `${required} must be discoverable in Guide`);
  }
  assert.equal(new Set(catalogSkills.map(skill => skill.catalog!.skill)).size, catalogSkills.length);

  for (const skill of catalogSkills) {
    assert.ok(names.has(skill.catalog!.skill));
    assert.equal(skill.catalog!.skill, skill.name);
    assert.match(skill.catalog!.prompt, /^Use\s+/i);
    assert.ok(skill.catalog!.use_cases.length >= 1);
    assert.ok(skill.catalog!.example.timeline.length >= 1);
  }

  const auditions = catalogSkills.find(skill => skill.name === "timeline-auditions")!;
  assert.equal(auditions.catalog!.title, "Compare takes and alternate edits");
  assert.match(auditions.description, /cut and show multiple playable/i);
  assert.match(auditions.catalog!.prompt, /Use Timeline auditions to cut and show me/i);
});
