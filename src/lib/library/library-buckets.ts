/** Whose media a Library item is: this project's own files, the creator's personal library, or the shared catalog. */
export type LibraryBucket = "project" | "personal" | "catalog";
export const LIBRARY_BUCKET_ORDER: readonly LibraryBucket[] = ["project", "personal", "catalog"];
/** One vocabulary for every Library surface (shelf, drawer, Library page, reference picker). */
export const LIBRARY_BUCKET_LABELS: Record<LibraryBucket, string> = { project: "This project", personal: "My library", catalog: "Catalog" };

export const bucketOf = (asset: Record<string, unknown>): LibraryBucket =>
  asset.is_personal === true ? "personal" : asset.is_catalog === true ? "catalog" : "project";
export const bucketRank = (bucket: LibraryBucket) => LIBRARY_BUCKET_ORDER.indexOf(bucket);

/** The media kinds every Library surface lists, in the order the initial kind is chosen. */
export type LibraryMediaKind = "stills" | "videos" | "music" | "sfx";
const INITIAL_KIND_ORDER: readonly LibraryMediaKind[] = ["videos", "stills", "music", "sfx"];

type Counts = Record<string, number | undefined> | null | undefined;

/** Open on the first bucket that has something of this kind: This project, then My library, then Catalog. */
export function defaultLibraryBucket(counts: Counts, kind: LibraryMediaKind): LibraryBucket {
  return LIBRARY_BUCKET_ORDER.find(bucket => (counts?.[`${kind}_${bucket}`] ?? 0) > 0) ?? "project";
}

/** Open on the kind this project's own media has (never the personal library's): Video, Images, Music, then Sounds. */
export function initialLibraryKind<F extends string>(counts: Counts, fallback: F, allowed: readonly LibraryMediaKind[] = INITIAL_KIND_ORDER): LibraryMediaKind | F {
  return INITIAL_KIND_ORDER.find(kind => allowed.includes(kind) && (counts?.[`${kind}_project`] ?? 0) > 0) ?? fallback;
}

/** "This project · 3": a bucket's label with its count when known. */
export const bucketLabel = (bucket: LibraryBucket, count: number | null | undefined) =>
  `${LIBRARY_BUCKET_LABELS[bucket]}${count != null ? ` · ${count}` : ""}`;

/** The kind, bucket and search a Library surface last showed for a project, kept for the browser session only. */
export type LibraryView = { kind?: string; bucket?: string; search?: string };
const viewKey = (surface: string, projectId: string) => `dreamcut:library-view:${surface}:${projectId}`;
export function readLibraryView(surface: string, projectId: string): LibraryView | null {
  try {
    const raw = sessionStorage.getItem(viewKey(surface, projectId));
    const value = raw ? JSON.parse(raw) as unknown : null;
    if (!value || typeof value !== "object") return null;
    const view = value as Record<string, unknown>;
    const text = (field: unknown) => typeof field === "string" ? field : undefined;
    return { kind: text(view.kind), bucket: text(view.bucket), search: text(view.search) };
  } catch { return null; }
}
export function writeLibraryView(surface: string, projectId: string, view: LibraryView) {
  try { sessionStorage.setItem(viewKey(surface, projectId), JSON.stringify(view)); } catch { /* Session-only convenience. */ }
}
export const isLibraryBucket = (value: unknown): value is LibraryBucket => value === "project" || value === "personal" || value === "catalog";
