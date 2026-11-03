import fs from "node:fs";
import path from "node:path";
import type { SkillCatalogEntry } from "./editing-memory";

export type UserSkill = {
  name: string;
  description: string;
  content: string;
  origin: "catalog" | "personal";
  based_on?: string;
  catalog: SkillCatalogEntry | null;
};

/** Origin follows storage ownership, never inclusion in the curated catalog. */
export function readUserSkills(catalog: Omit<UserSkill, "origin">[], profileDirectory: string): UserSkill[] {
  const shared: UserSkill[] = catalog.map(skill => ({ ...skill, origin: "catalog" }));
  const directory = path.join(profileDirectory, "skills");
  if (!fs.existsSync(directory)) return shared;
  const personal = fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (!entry.isDirectory() || !/^[a-z0-9-]{1,64}$/.test(entry.name)) return [];
    const file = path.join(directory, entry.name, "SKILL.md");
    if (!fs.existsSync(file) || !fs.lstatSync(file).isFile()) return [];
    const content = fs.readFileSync(file, "utf8");
    // Optional frontmatter provenance; no same-name inference or catalog override.
    const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ?? "";
    const basedOn = frontmatter.match(/^based_on:\s*([a-z0-9-]{1,64})\s*$/m)?.[1];
    return [{ name: entry.name, description: frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? "Personal editing skill",
      content, origin: "personal" as const, ...(basedOn ? { based_on: basedOn } : {}), catalog: null }];
  });
  return [...shared, ...personal.sort((a, b) => a.name.localeCompare(b.name))];
}
