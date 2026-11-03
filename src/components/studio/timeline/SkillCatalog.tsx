"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import Link from "next/link";
import styles from "./EditingMemory.module.css";
import { SegmentedControl, SegmentCount } from "@/components/ui/segmented-control";
import rhythm from "./guide-rhythm.json";
import type { SkillCatalogEntry } from "@/lib/local-store/editing-memory";

export type CatalogSkill = {
  name: string;
  description: string;
  catalog: SkillCatalogEntry;
};

const categoryOrder: Array<SkillCatalogEntry["category"]> = ["Captions & text", "Edit", "Audio", "Visuals", "Start here", "Delivery"];

function BeatTimingExample() {
  const [time, setTime] = useState(0);
  const hits = rhythm.lanes.flatMap(lane => lane.hits);
  return <figure className="guide-skill-video-example">
    <video controls playsInline preload="metadata" src="/guide/effects/contour-first-half.mp4"
      poster="/guide/effects/contour-first-half.jpg" aria-label="Layered contour timed to selected music hits"
      onTimeUpdate={event => setTime(event.currentTarget.currentTime)} />
    <div>
      <svg viewBox="0 0 280 54" role="img" aria-label="Eight selected hits across the opening 6.4 seconds">
        <line x1="8" x2="272" y1="22" y2="22" stroke="var(--ink-muted)" />
        {hits.map((hit, index) => <line key={index} x1={8 + hit / 6.4 * 264} x2={8 + hit / 6.4 * 264} y1="10" y2="34" stroke="var(--chrome-focus-ring)" strokeWidth="3" />)}
        <circle cx={8 + time / 6.4 * 264} cy="22" r="5" fill="var(--ink)" />
        <text x="8" y="51" fill="var(--ink-muted)" fontSize="11">0:00</text>
        <text x="238" y="51" fill="var(--ink-muted)" fontSize="11">0:06.4</text>
      </svg>
      <figcaption>Layered contour · 8 selected hits · opening 6.4 seconds</figcaption>
    </div>
  </figure>;
}

export function SkillCatalog({ skills, showCategoryFilters = true }: { skills: CatalogSkill[]; showCategoryFilters?: boolean }) {
  const [category, setCategory] = useState<"All" | SkillCatalogEntry["category"]>("All");
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const ordered = [...skills].sort((a, b) => categoryOrder.indexOf(a.catalog.category) - categoryOrder.indexOf(b.catalog.category)
    || (a.catalog.order ?? Number.MAX_SAFE_INTEGER) - (b.catalog.order ?? Number.MAX_SAFE_INTEGER)
    || Number(b.catalog.featured) - Number(a.catalog.featured)
    || a.catalog.title.localeCompare(b.catalog.title));

  async function copyPrompt(skill: CatalogSkill) {
    try {
      await navigator.clipboard.writeText(skill.catalog.prompt);
      setCopied(skill.name);
      setCopyError(null);
    } catch {
      setCopyError(skill.name);
    }
  }

  const categories = categoryOrder.filter(value => skills.some(skill => skill.catalog.category === value));
  const categoryLabel = (value: string) => value === "Start here" ? "Full edits" : value === "Edit" ? "Timing & editing" : value;
  return <section className="skill-catalog" aria-label="Editing skills">
    {showCategoryFilters && <SegmentedControl size="sm" wrap className="guide-skill-segments" role="group" aria-label="Filter by skill type">
      {(["All", ...categories] as const).map(value => <button key={value} type="button" aria-pressed={category === value} onClick={() => setCategory(value)}>
        <span>{categoryLabel(value)}</span><SegmentCount>{value === "All" ? skills.length : skills.filter(skill => skill.catalog.category === value).length}</SegmentCount>
      </button>)}
    </SegmentedControl>}
    {categories.filter(value => category === "All" || category === value).map(group => <section key={group} className="guide-skill-group" aria-labelledby={`skill-group-${group.replaceAll(" ", "-")}`}>
    <header className="guide-skill-group-heading"><h2 id={`skill-group-${group.replaceAll(" ", "-")}`}>{categoryLabel(group)}</h2><span>{ordered.filter(skill => skill.catalog.category === group).length} {ordered.filter(skill => skill.catalog.category === group).length === 1 ? "skill" : "skills"}</span></header>
    {ordered.filter(skill => skill.catalog.category === group).map(skill => <article className="guide-skill-row" key={skill.name} aria-labelledby={`skill-${skill.name}`}>
      <div className="guide-skill-summary">
        <div className={styles.skillHeading}><h3 id={`skill-${skill.name}`}>{skill.catalog.title}</h3></div>
        <a className="guide-skill-source" href={`/api/guide/skills/${encodeURIComponent(skill.name)}`} target="_blank" rel="noreferrer" aria-label={`Read ${skill.name} skill instructions`}>
          <code>{skill.name}</code><ExternalLink size={12} aria-hidden="true" />
        </a>
        <p>{skill.catalog.summary ?? skill.description}</p>
        <dl className="guide-skill-metadata">
          {skill.catalog.inputs && <div><dt>Needs</dt><dd>{skill.catalog.inputs.join(" · ")}</dd></div>}
          {skill.catalog.output && <div><dt>Produces</dt><dd>{skill.catalog.output}</dd></div>}
        </dl>
        <details className="guide-skill-prompt">
          <summary>Try this prompt</summary>
          <p>{skill.catalog.prompt}</p>
          <button type="button" aria-label={`Copy ${skill.catalog.title} prompt`} onClick={() => void copyPrompt(skill)}>
            {copied === skill.name ? <Check size={14} /> : <Copy size={14} />}{copied === skill.name ? "Copied" : "Copy prompt"}
          </button>
          {copyError === skill.name && <p role="status">Select the prompt above to copy it.</p>}
        </details>
      </div>
      <div className="guide-skill-example">
        <section className="guide-skill-use-cases" aria-label={`Use ${skill.catalog.title} for`}>
          <h4>Use this for</h4>
          <ul>{skill.catalog.use_cases.map(useCase => <li key={useCase}>{useCase}</li>)}</ul>
        </section>
        {skill.name === "beat-aligned-cuts" && <section className="guide-skill-real-example">
          <p className="memory-eyebrow">Video example</p>
          <BeatTimingExample />
        </section>}
        {skill.catalog.demo && <Link className="guide-skill-demo-link" href={`/p/${skill.catalog.demo.project_id}`}>Open {skill.catalog.demo.label}</Link>}

      </div>
    </article>)}
    </section>)}
  </section>;
}
