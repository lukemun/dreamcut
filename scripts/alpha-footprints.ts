import { readTimeline } from '../src/lib/local-store/store';
import { preprocessProjectAlphaFootprints } from '../src/lib/media-analysis/alpha-footprint';
import { assessProjectSpatial } from '../src/lib/local-store/spatial-assessment';
import { projectDir } from '../src/lib/local-store/paths';
import { writeJsonFileAtomic } from '../src/lib/local-store/atomic-json';
import path from 'node:path';

async function main() {
  const projectId = process.argv[2];
  if (!projectId) throw new Error('Usage: pnpm alpha-footprints <project-id> [--after <seconds>]');
  const afterIndex = process.argv.indexOf('--after');
  const after = afterIndex >= 0 ? Number(process.argv[afterIndex + 1]) : 0;
  if (!Number.isFinite(after) || after < 0) throw new Error('--after must be a non-negative number');
  const prefix = `/api/projects/${encodeURIComponent(projectId)}/media/`;
  const timeline=readTimeline(projectId);
  const selectedElements=timeline.elements.filter(element => !element.removed_at
    && (element.type === 'still' || element.type === 'video_clip') && element.timeline_start + element.duration > after
    && (element.props?.has_alpha === true || element.props?.sticker_outline === true));
  const paths = selectedElements.flatMap(element => element.source_url?.startsWith(prefix) ? [decodeURIComponent(element.source_url.slice(prefix.length).split('?')[0]!)] : []);
  const index = await preprocessProjectAlphaFootprints(projectId, paths);
  const assessment=assessProjectSpatial(projectId,timeline);
  const selectedIds=new Set(selectedElements.map(element=>element.id));
  const labels=Object.fromEntries(timeline.elements.map(element=>[element.id,String(element.props?.label??element.props?.title??element.type)]));
  const verification={schema_version:1,recipe_version:index.recipe_version,project_id:projectId,created_at:new Date().toISOString(),after_seconds:after,
    spatial_snapshot_id:assessment.snapshot_id,visual_overlap_version:assessment.visual_overlap.version,
    selected_elements:selectedElements.map(element=>({id:element.id,label:labels[element.id],timeline_start:element.timeline_start,duration:element.duration})),
    alpha_relations:assessment.visual_overlap.alpha_relations.filter(relation=>relation.element_ids.some(id=>selectedIds.has(id))),
    unknowns:assessment.visual_overlap.unknowns.filter(item=>selectedIds.has(item.element_id)),
    suppressed_transparent_overlaps:assessment.visual_overlap.suppressed_transparent_overlaps,
    examined_alpha_samples:assessment.visual_overlap.examined_alpha_samples};
  writeJsonFileAtomic(path.join(projectDir(projectId),'instruments','alpha-footprints','verification.json'),verification);
  console.log(JSON.stringify({ project_id: projectId, selected: paths.length,
    annotations: index.entries.filter(entry => paths.includes(entry.relative_path)).map(entry => ({ path: entry.relative_path,
      revision: entry.revision_id, dimensions: [entry.width,entry.height], frames: entry.frame_count })),
    verification:{relations:verification.alpha_relations.length,unknowns:verification.unknowns.length,snapshot_id:verification.spatial_snapshot_id} }, null, 2));
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
