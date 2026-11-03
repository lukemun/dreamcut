"use client";

import { useState } from "react";
import { SkillCatalog, type CatalogSkill } from "./SkillCatalog";
import { SegmentedControl, SegmentCount } from "@/components/ui/segmented-control";
import type { UserSkill } from "@/lib/local-store/user-skills";
import styles from "./EditingMemory.module.css";

export function UserSkills({ skills }: { skills: UserSkill[] }) {
  const [origin, setOrigin] = useState<"all" | UserSkill["origin"]>("all");
  const visible = skills.filter(skill => origin === "all" || skill.origin === origin);
  const curated = visible.filter((skill): skill is UserSkill & CatalogSkill => skill.catalog !== null);
  const other = visible.filter(skill => !skill.catalog);
  return <section className={styles.directory} aria-label="Skills directory">
    <div className="memory-section-intro"><h2>Skills</h2></div>
    <SegmentedControl size="sm" className="guide-skill-segments" role="group" aria-label="Filter by skill origin">
      {(["all", "personal", "catalog"] as const).map(value => <button key={value} type="button" aria-pressed={origin === value} onClick={() => setOrigin(value)}>
        <span>{value === "all" ? "All" : value === "personal" ? "Personal" : "Catalog"}</span><SegmentCount>{skills.filter(skill => value === "all" || skill.origin === value).length}</SegmentCount>
      </button>)}
    </SegmentedControl>
    {!visible.length && <div className="memory-card"><h3>No personal skills yet</h3></div>}
    {!!curated.length && <SkillCatalog skills={curated} showCategoryFilters={false} />}
    {!!other.length && <section aria-label="Additional skills">
      {other.map(skill => <article className="memory-card" key={`${skill.origin}:${skill.name}`}>
        <div className={styles.skillHeading}><h3>{skill.name}</h3><span className={styles.origin}>{skill.origin === "personal" ? "Personal" : "Catalog"}</span></div>
        <p>{skill.description}</p>
        {skill.based_on && <p>Based on {skills.some(source => source.origin === "catalog" && source.name === skill.based_on)
          ? <a href={`/api/guide/skills/${encodeURIComponent(skill.based_on)}`} target="_blank" rel="noreferrer">{skill.based_on}</a> : skill.based_on}</p>}
        <details><summary>Skill instructions</summary><pre>{skill.content}</pre></details>
      </article>)}
    </section>}
  </section>;
}
