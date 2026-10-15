import type { StoryboardAsset } from "@/lib/storyboard/model";

/** Membership is independent: project intake never implies catalog promotion or story inclusion.
 * Everything here is project media, so only Catalog and In story are worth a badge. */
export function MediaMembershipBadges({asset, inStory = false}: {asset: StoryboardAsset; inStory?: boolean}) {
  if (!asset.cataloged && !inStory) return null;
  const badge = "rounded bg-[var(--glass-control)] px-1.5 py-0.5 text-[10px] leading-tight text-[var(--ink-secondary)]";
  return <div className="flex flex-wrap gap-1" aria-label="Media membership">
    {asset.cataloged && <span className={badge}>Catalog</span>}
    {inStory && <span className={badge}>In story</span>}
  </div>;
}
