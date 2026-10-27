import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { runBackgroundCommand as run } from "./background-worker";
import { projectDir, projectMediaDir } from "./paths";
import { readTimeline, type TimelineFile, readProjectFrameRate } from "./store";
import { writeJsonFileAtomic } from "./atomic-json";
import {
  compoundAppearance,
  compoundMemberProxySignature,
  compoundMemberSignature,
  compoundProxyComparableSignature,
  type CompoundPreviewReceipt,
} from "../timeline/compound-preview";
const sha = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const COMPOUND_PROXY_MAX_EDGE = 640;
const verifiedCompoundMedia = new Map<string, { size: number; mtimeMs: number; sha256: string }>();

function verifiedSha(file: string) {
  const stat = fs.statSync(file);
  const cached = verifiedCompoundMedia.get(file);
  if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) return cached.sha256;
  const sha256 = sha(file);
  verifiedCompoundMedia.set(file, { size: stat.size, mtimeMs: stat.mtimeMs, sha256 });
  return sha256;
}

export function assertCompoundPreviewForTimeline(project: string, receipt: CompoundPreviewReceipt, timeline: TimelineFile) {
  if (!/^[a-f0-9-]{36}$/.test(receipt.id)) throw new Error("Invalid compound receipt id");
  const recorded = JSON.parse(fs.readFileSync(path.join(projectDir(project), "analysis/compounds", `${receipt.id}.json`), "utf8"));
  if (JSON.stringify(recorded) !== JSON.stringify(receipt)) throw new Error("Compound preview differs from its preparation receipt");
  const expected = `/api/projects/${project}/media/compounds/${receipt.id}.webm`;
  if (receipt.source_url !== expected || verifiedSha(path.join(projectMediaDir(project), "compounds", `${receipt.id}.webm`)) !== receipt.sha256) throw new Error("Compound preview media changed");
  const members = receipt.members.map(m => timeline.elements.find(e => e.id === m.id && !e.removed_at));
  const sharedAppearance = members[0]
    ? members.every(member => member && compoundAppearance(member) === compoundAppearance(members[0]!))
    : false;
  if (!sharedAppearance || !receipt.members.every((m, index) => {
    const e = members[index];
    return e && compoundMemberProxySignature(e) === compoundProxyComparableSignature(m.signature);
  })) throw new Error("Compound members changed; prepare the preview again");
}

export function assertCompoundPreview(project: string, receipt: CompoundPreviewReceipt) {
  assertCompoundPreviewForTimeline(project, receipt, readTimeline(project));
}

/** Bounded media preparation only. Does not mutate a timeline. */
export async function prepareCompoundPreviewForTimeline(project: string, timeline: TimelineFile, ids: string[]): Promise<CompoundPreviewReceipt> {
  if (ids.length < 2 || ids.length > 32 || new Set(ids).size !== ids.length) throw new Error("Select 2–32 distinct presenter sections");
  const members = ids.map(id => timeline.elements.find(e => e.id === id && !e.removed_at));
  if (members.some(e => !e)) throw new Error("A selected section is missing");
  const ordered = members.filter(e => e != null).sort((a,b) => a.timeline_start - b.timeline_start);
  const first = ordered[0]!;
  for (const [i,e] of ordered.entries()) {
    if (e.type !== "video_clip" || !e.props?.speech_sync_binding || !e.props?.has_alpha || e.volume !== 0 || !Number.isFinite(e.playback_rate) || e.playback_rate <= 0 || e.fade_in || e.fade_out || e.props?.volume_envelope || e.props?.keyframes || e.props?.speed_steps || e.props?.playback_reverse || e.props?.animationIn && e.props.animationIn !== "none" || e.props?.animationOut && e.props.animationOut !== "none") throw new Error("Seamless presenter compounds require silent alpha sections with constant positive speed and no per-section animations");
    if (e.lane_key !== first.lane_key || compoundAppearance(e) !== compoundAppearance(first)) throw new Error("Presenter sections must share one lane and appearance");
    if (timeline.transitions.some(t => t.from_element_id === e.id || t.to_element_id === e.id)) throw new Error("Break transitions before preparing a seamless presenter compound");
    if (i && Math.abs(e.timeline_start - (ordered[i-1]!.timeline_start + ordered[i-1]!.duration)) > .001) throw new Error("Presenter sections must be adjacent, without gaps or overlaps");
  }
  const id = randomUUID();
  const directory = path.join(projectMediaDir(project), "compounds");
  fs.mkdirSync(directory, {recursive:true});
  const output = path.join(directory, `${id}.webm`);
  const args = ["-v", "error", "-n"];
  for (const e of ordered) {
    const url = e.props!.preview_source_url;
    const prefix = `/api/projects/${project}/media/`;
    if (typeof url !== "string" || !url.startsWith(prefix)) throw new Error("Prepare local lightweight alpha previews first");
    const file = path.resolve(projectMediaDir(project), url.slice(prefix.length));
    if (!file.startsWith(`${projectMediaDir(project)}${path.sep}`)) throw new Error("Invalid preview path");
    args.push("-c:v", "libvpx-vp9", "-i", file);
  }
  const fps = readProjectFrameRate(project);
  const scale = `scale=w='trunc(iw*min(1,${COMPOUND_PROXY_MAX_EDGE}/max(iw,ih))/2)*2':h='trunc(ih*min(1,${COMPOUND_PROXY_MAX_EDGE}/max(iw,ih))/2)*2':flags=lanczos`;
  const filters = ordered.map((e,i) => {
    const sourceEnd = e.trim_start + e.duration * e.playback_rate;
    const outputFrames = Math.round(e.duration * fps);
    // Retiming onto the project frame clock can round the last sample down by one frame.
    // Pad one source frame, then trim to the timeline-authoritative frame count.
    return `[${i}:v]fps=${fps},trim=start_frame=${Math.round(e.trim_start*fps)}:end_frame=${Math.round(sourceEnd*fps)},setpts=(PTS-STARTPTS)/${e.playback_rate},fps=${fps},tpad=stop_mode=clone:stop_duration=${1/fps},trim=end_frame=${outputFrames},setpts=PTS-STARTPTS,${scale},format=yuva420p[v${i}]`;
  });
  filters.push(`${ordered.map((_,i)=>`[v${i}]`).join("")}concat=n=${ordered.length}:v=1:a=0[out]`);
  args.push("-filter_complex", filters.join(";"), "-map", "[out]", "-r", String(fps), "-c:v", "libvpx-vp9", "-crf", "18", "-b:v", "0", "-g", String(fps), "-auto-alt-ref", "0", "-row-mt", "1", "-cpu-used", "5", "-threads", "4", "-an", output);
  await run("ffmpeg", args, {timeout:180000, maxBuffer:2_000_000});
  const {stdout} = await run("ffprobe", ["-v","error","-count_frames","-select_streams","v:0","-show_entries","stream=width,height,nb_read_frames:stream_tags=alpha_mode:format=duration","-of","json",output]);
  const facts = JSON.parse(stdout);
  const frames = ordered.reduce((n,e)=>n+Math.round(e.duration*fps),0);
  const tags = facts.streams[0]?.tags;
  const width = Number(facts.streams[0]?.width);
  const height = Number(facts.streams[0]?.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || Math.max(width,height) > COMPOUND_PROXY_MAX_EDGE
    || Number(facts.streams[0]?.nb_read_frames) !== frames || (tags?.ALPHA_MODE ?? tags?.alpha_mode) !== "1"
    || Math.abs(Number(facts.format.duration)-frames/fps)>.002) throw new Error("Compound preview dimensions, frame count, or alpha validation failed");
  const decoded = await run("ffmpeg", ["-hide_banner", "-nostats", "-v", "info", "-c:v", "libvpx-vp9", "-i", output,
    "-vf", "alphaextract,blackdetect=d=0.001:pix_th=0.01:pic_th=0.999", "-an", "-f", "null", "-"], {timeout:180000,maxBuffer:2_000_000});
  if (/black_start:/.test(decoded.stderr)) throw new Error("Compound preview contains empty alpha frames; review the source sections");
  const receipt: CompoundPreviewReceipt = {id, source_url:`/api/projects/${project}/media/compounds/${id}.webm`,sha256:sha(output),duration:frames/fps,frame_count:frames,
    width,height,proxy_profile:"presenter-alpha-640-edge-v1",members:ordered.map(e=>({id:e.id,signature:compoundMemberSignature(e)}))};
  const receiptDir = path.join(projectDir(project), "analysis/compounds");
  fs.mkdirSync(receiptDir,{recursive:true});
  writeJsonFileAtomic(path.join(receiptDir,`${id}.json`),receipt);
  assertCompoundPreviewForTimeline(project,receipt,timeline);
  return receipt;
}

export async function prepareCompoundPreview(project: string, ids: string[]): Promise<CompoundPreviewReceipt> {
  return prepareCompoundPreviewForTimeline(project, readTimeline(project), ids);
}

type PreparedCompoundLink = {
  schema_version: 1;
  proposal_id: string;
  option_id: string;
  prepared_at: string;
  receipt: CompoundPreviewReceipt;
};

function preparedCompoundLinksDir(project: string) {
  return path.join(projectDir(project), "analysis", "proposal-compounds");
}

/**
 * Bind a disposable compound cache to one proposal preview. The receipt is
 * signature-checked again on every hydration, so the same cache can safely
 * continue serving the approved timeline without becoming render authority.
 */
export function savePreparedCompoundLink(project: string, proposalId: string, optionId: string, receipt: CompoundPreviewReceipt) {
  const directory = preparedCompoundLinksDir(project);
  fs.mkdirSync(directory, { recursive: true });
  const key = createHash("sha256").update(`${proposalId}:${optionId}`).digest("hex");
  const link: PreparedCompoundLink = {
    schema_version: 1,
    proposal_id: proposalId,
    option_id: optionId,
    prepared_at: new Date().toISOString(),
    receipt,
  };
  writeJsonFileAtomic(path.join(directory, `${key}.json`), link);
  return link;
}

/** Attach only runtime props. Timeline persistence strips these keys. */
export function hydratePreparedCompoundPreviews(project: string, timeline: TimelineFile): TimelineFile {
  const directory = preparedCompoundLinksDir(project);
  let names: string[];
  try {
    names = fs.readdirSync(directory).filter(name => name.endsWith(".json")).sort().reverse();
  } catch {
    return timeline;
  }
  const used = new Set<string>();
  const receipts: CompoundPreviewReceipt[] = [];
  for (const name of names) {
    try {
      const link = JSON.parse(fs.readFileSync(path.join(directory, name), "utf8")) as PreparedCompoundLink;
      if (link.schema_version !== 1 || !link.receipt?.members?.length
        || link.receipt.members.some(member => used.has(member.id))) continue;
      assertCompoundPreviewForTimeline(project, link.receipt, timeline);
      receipts.push(link.receipt);
      link.receipt.members.forEach(member => used.add(member.id));
    } catch {
      // A stale or incomplete disposable cache is ignored; original members
      // remain the preview fallback and export authority.
    }
  }
  if (!receipts.length) return timeline;
  const byMember = new Map(receipts.flatMap(receipt => receipt.members.map(member => [member.id, receipt] as const)));
  return {
    ...timeline,
    elements: timeline.elements.map(element => {
      const receipt = byMember.get(element.id);
      if (!receipt) return element;
      return {
        ...element,
        props: {
          ...(element.props ?? {}),
          runtime_compound_clip_id: receipt.id,
          runtime_compound_preview: receipt,
        },
      };
    }),
  };
}
