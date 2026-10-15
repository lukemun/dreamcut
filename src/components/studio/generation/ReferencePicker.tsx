"use client";
import { useEffect, useRef, useState } from "react";
import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MediaGallery } from "@/components/ui/media-gallery";
import { SegmentedControl, SegmentCount } from "@/components/ui/segmented-control";
import { useAssetPages } from "@/components/studio/timeline/useAssetPages";
import { thumbnailUrl } from "@/lib/media/thumbnail-url";
import { libraryReferenceIdentity, type LibraryReferenceAsset } from "@/lib/library/reference-identity";
import styles from "./ReferencePicker.module.css";

type Visual = LibraryReferenceAsset & { slot_id: string; name: string; source_url: string | null; width?: number | null; height?: number | null; library_annotation?: { display_name?: string } | null };
type Inventory = { visuals?: Visual[]; page?: { nextOffset: number | null; total: number; counts: Record<string, number> } };

/**
 * Generate's own Library picker: it opens beside the slot it fills, so the form stays in view.
 * Your media and Catalog use the Library's names; catalog items are copied into the project when picked.
 */
export function ReferencePicker({ projectId, title, kind, onPick, onCancel }: {
  projectId: string; title: string; kind: "stills" | "videos";
  onPick: (reference: { source: string; label: string }) => void; onCancel: () => void;
}) {
  const [source, setSource] = useState<"project" | "catalog">("project");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  const { data, loading, error: loadError, loadMore } = useAssetPages<Inventory>(projectId, kind, search, true, { source });
  const counts = data?.page?.counts;
  const chose = useRef(false);
  // Open on the catalog when this project has nothing of this kind yet.
  useEffect(() => { if (!chose.current && counts && !counts[`${kind}_project`] && counts[`${kind}_catalog`]) setSource("catalog"); }, [counts, kind]);
  const host = useRef<HTMLElement>(null);
  useEffect(() => { host.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); host.current?.querySelector<HTMLElement>("input")?.focus({ preventScroll: true }); }, []);
  const pick = async (asset: Visual) => {
    setBusy(asset.slot_id); setError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/library-selection`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare_reference", source: libraryReferenceIdentity(asset) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not use this reference.");
      onPick({ source: body.source, label: asset.library_annotation?.display_name ?? body.name ?? asset.name });
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };
  const visuals = (data?.visuals ?? []).filter(asset => asset.source_url);
  return <section ref={host} className={styles.picker} aria-label={title} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onCancel(); } }}>
    <div className={styles.head}>
      <h4>{title}</h4>
      <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
    </div>
    <label className={styles.search}>
      <SearchIcon size={15} aria-hidden="true" />
      <input type="search" aria-label={kind === "videos" ? "Search video" : "Search images"} placeholder={kind === "videos" ? "Search video" : "Search images"} value={search} onChange={event => setSearch(event.target.value)} />
    </label>
    <SegmentedControl size="sm" fill role="group" aria-label="Media source">
      {([["project", "Your media"], ["catalog", "Catalog"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={source === value} onClick={() => { chose.current = true; setSource(value); }}>
        <span>{label}</span>{counts?.[`${kind}_${value}`] != null ? <SegmentCount>{counts[`${kind}_${value}`]}</SegmentCount> : null}
      </button>)}
    </SegmentedControl>
    {error || loadError ? <p role="alert" className={styles.note}>{error ?? loadError}</p> : null}
    {loading && !data ? <p role="status" className={styles.note}>Loading…</p> : null}
    {data && !visuals.length ? <p className={styles.note}>{search ? "Nothing matches." : source === "project" ? "No media of your own yet." : "Nothing in the catalog."}</p> : null}
    <MediaGallery targetHeight={96} minCardWidth={84} gap={8}>
      {visuals.map(asset => { const name = asset.library_annotation?.display_name ?? asset.name; return <button key={asset.slot_id} type="button" className={styles.item} disabled={busy !== null} aria-busy={busy === asset.slot_id}
        aria-label={`Use ${name}`} title={name} onClick={() => void pick(asset)}>
        <img data-media-preview src={thumbnailUrl(asset.source_url!, 320)} alt="" loading="lazy" decoding="async" width={asset.width ?? undefined} height={asset.height ?? undefined} />
        <span className={styles.use} aria-hidden="true">{busy === asset.slot_id ? "Adding…" : "Use"}</span>
      </button>; })}
    </MediaGallery>
    {data?.page?.nextOffset != null ? <Button variant="ghost" size="sm" disabled={loading} onClick={loadMore}>{loading ? "Loading…" : "Show more"}</Button> : null}
  </section>;
}
