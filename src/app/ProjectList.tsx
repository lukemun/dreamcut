"use client";

import Link from "next/link";
import { Film } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { thumbnailUrl } from "@/lib/media/thumbnail-url";

export type ProjectSummary = {
  id: string;
  title: string;
  /** epoch ms of the project's last edit */
  updatedAt: number;
  versionLabel: string | null;
  cover?: { url: string; video: boolean };
};

/** Coarse recency buckets, newest first. Anything with no usable mtime lands in "Undated". */
const BUCKETS = [
  { key: "today", label: "Today", maxAgeMs: 1 * DAY() },
  { key: "week", label: "Previous 7 days", maxAgeMs: 7 * DAY() },
  { key: "month", label: "Previous 30 days", maxAgeMs: 30 * DAY() },
  { key: "older", label: "Older", maxAgeMs: Infinity },
] as const;

function DAY() {
  return 24 * 60 * 60 * 1000;
}

function relativeTime(updatedAt: number, now: number): string {
  if (!updatedAt) return "no edits yet";
  const diff = now - updatedAt;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} h ago`;
  const days = Math.round(hr / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(updatedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function bucketFor(updatedAt: number, now: number): string {
  if (!updatedAt) return "undated";
  const age = now - updatedAt;
  return BUCKETS.find((b) => age < b.maxAgeMs)?.key ?? "older";
}

export function ProjectList({ projects, showSearch = true, searchQuery, grouped = true, createTile, headerAction, recent = false }: { projects: ProjectSummary[]; showSearch?: boolean; searchQuery?: string; grouped?: boolean; createTile?: ReactNode; headerAction?: ReactNode; recent?: boolean }) {
  const [query, setQuery] = useState("");
  // Stable "now" for this render pass so bucketing and labels agree.
  const now = useMemo(() => Date.now(), []);

  const filtered = useMemo(() => {
    const q = (searchQuery ?? query).trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) => p.title.toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
    );
  }, [projects, query, searchQuery]);

  const groups = useMemo(() => {
    if (!grouped) return [{ key: "all", label: "", items: filtered }];
    const byBucket = new Map<string, ProjectSummary[]>();
    for (const p of filtered) {
      const key = bucketFor(p.updatedAt, now);
      const list = byBucket.get(key) ?? [];
      list.push(p);
      byBucket.set(key, list);
    }
    const ordered = [...BUCKETS.map((b) => ({ key: b.key, label: b.label })), { key: "undated", label: "Undated" }];
    return ordered
      .map((g) => ({ ...g, items: byBucket.get(g.key) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [filtered, now, grouped]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
          {recent ? "Recent projects" : "Projects"}
        </h2>
        <div className="flex items-baseline gap-4"><span className="text-xs text-[var(--color-text-secondary)]">
          {filtered.length === projects.length
            ? `${projects.length}${recent ? " recent" : " total"}`
            : `${filtered.length} of ${projects.length}`}
        </span>{headerAction}</div>
      </div>

      {showSearch && <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filter by name…"
        aria-label="Filter projects"
        className="projects-input"
      />}

      {projects.length === 0 && !createTile ? (
        <p className="text-sm text-[var(--color-text-secondary)]">No projects yet — choose Create project.</p>
      ) : filtered.length === 0 && !createTile ? (
        <p className="text-sm text-[var(--color-text-secondary)]">
          Nothing matches “{(searchQuery ?? query).trim()}”.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <div key={group.key} className="flex flex-col gap-1.5">
              {group.label && <h3 className="projects-group-label">
                {group.label}
              </h3>}
              <ul className="projects-grid">
                {createTile && <li>{createTile}</li>}
                {group.items.map((project) => (
                  <li key={project.id}>
                    <Link
                      href={`/p/${project.id}`}
                      className="projects-card"
                    >
                      <ProjectCover cover={project.cover}/>
                      <div className="projects-card-heading">
                        <span className="projects-card-title" title={project.title}>{project.title}</span>
                        <span className="text-xs text-[var(--color-text-secondary)]">
                          {relativeTime(project.updatedAt, now)}
                        </span>
                        {project.versionLabel ? <span className="projects-version">{project.versionLabel}</span> : null}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ProjectCover({ cover }: { cover?: ProjectSummary["cover"] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className="projects-card-art" data-loading={Boolean(cover && !loaded && !failed) || undefined} aria-hidden="true">
    {/* A quiet placeholder while the cover loads; words here only add noise to the grid. */}
    {cover && !loaded && !failed && <span className="project-preview-loading" />}
    {/* The observer already defers loading; a lazy, zero-opacity image may never load, and a cached one can finish before onLoad attaches. */}
    {cover && visible && !failed ? <img ref={image => { if (image?.complete && image.naturalWidth > 0) setLoaded(true); }} src={thumbnailUrl(cover.url, 640)} alt="" decoding="async" onLoad={() => setLoaded(true)} style={{ opacity: loaded ? 1 : 0 }} onError={() => setFailed(true)}/> : <Film size={28} strokeWidth={1.25}/>}
  </div>;
}
