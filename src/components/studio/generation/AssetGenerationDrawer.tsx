"use client";
import { GenerationProgress } from "./GenerationProgress";
import { assetGenerationPoll } from "@/components/studio/timeline/shared-poll";
import { MediaGallery } from "@/components/ui/media-gallery";
import { Button } from "@/components/ui/button";

import { SegmentedControl } from "@/components/ui/segmented-control";
import { ReferencePicker } from "./ReferencePicker";
import { ReferenceWindow } from "./ReferenceWindow";
import { ReferencePlayer, ReferenceTrim, ReferenceVideo } from "./ReferenceVideo";
import type { PlayerRef } from "@/lib/frame-runtime/player";

import { Fragment, createRef, useCallback, useEffect, useRef, useState, type ReactElement, type RefObject } from "react";
import { ArrowLeftIcon, CheckIcon, CoinsIcon, CopyIcon, LogInIcon, CrosshairIcon, ImagePlusIcon, InfoIcon, MessageSquarePlusIcon, MoreHorizontalIcon, FilmIcon, FolderOpenIcon, HistoryIcon, LoaderCircleIcon, PlusIcon, SparklesIcon, UploadIcon, XIcon } from "lucide-react";
import { useChatSelection } from "@/components/studio/timeline/useChatSelection";
import { SlideOutDrawer } from "../timeline/SlideOutDrawer";
import { DrawerHeader, DrawerHeaderTab } from "../timeline/DrawerHeader";
import { GenerationPrompt } from "./GenerationPrompt";
import { MarkableMedia, mediaLabel, useRegisterGenerationMarking } from "./MarkableMedia";
import { thumbnailUrl } from "@/lib/media/thumbnail-url";
import { SourceVideoPlayer } from "@/lib/frame-runtime/source-video-player";
import { createPortal } from "react-dom";
import { FrameTagControls } from "../timeline/FrameTagControls";
import { ActionMenu, ActionMenuItem } from "@/components/ui/menu";
import { Input } from "@/components/ui/input";
import { useProjectReviewDock } from "@/components/desktop/ProjectReviewDock";
import { ModelSettings } from "./ModelSettings";
import { ModelPicker, type ModelChoice } from "./ModelPicker";
import { VoicePicker } from "./VoicePicker";
import { CHIP_TRIGGER } from "@/components/ui/select";
import { modelVoices } from "@/lib/generation/voices";
import { OutputChips } from "./OutputChips";
import { generationUploadReference, assetDraftSchema, assetMediaUrl, EMPTY_ASSET_DRAFT, TASK_LABELS, canResumeAssetJob, validateAssetRequest, type AssetDraft, type AssetJob, type GenerationMark, type AssetOutput, type AssetTask, type GenerationAsset, type ReferenceSet } from "@/lib/generation/assets";

import { resultContext } from "@/lib/generation/result-context";
import { ASSET_MODELS, CLOUD_MODELS, MEDIA_ROLES, cloudUnavailableMessage, modelCreditEstimate, modelReferenceLabel, getAssetModel, modelTask, pooledImageRoles, roleLimit, windowLimit, type ReferenceRole } from "@/lib/generation/asset-models";
import type { GenerationCheck } from "@/lib/generation/cloud-readiness";
import { BUY_CREDITS_URL } from "@/lib/cloud/base-url";
import { useCloudAccount } from "@/components/studio/timeline/CloudAccountSettings";
import { getStoredItem } from "@/lib/persisted-key";
import { useKeyboardShortcuts } from "@/components/studio/hooks/useKeyboardShortcuts";
import { bindingMatches } from "@/lib/keyboard-shortcuts";
import { defaultModelId } from "@/lib/generation/model-guides";
import { uploadAssetRequest } from "@/lib/media/upload-library-media";

const defaultImageModel = () => defaultModelId("image", []);

/** A handoff into Generate; `prompt` arrives from Storyboard beats and other pages. */
export type GenerationLaunch = { task?: AssetTask; source?: string; referenceRole?: ReferenceRole; addReference?: boolean; prompt?: string; nonce: number };
type Workspace = { stagedId?: string; draft: AssetDraft; referenceSets: ReferenceSet[]; modelDrafts?: Record<string, AssetDraft> };
type State = { jobs: AssetJob[]; assets: GenerationAsset[]; workspace: Workspace };
const field = "w-full";
// Secondary action: a quiet fill at rest; the edge appears on hover and the focus ring on keyboard focus.
const button = "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-transparent bg-[var(--glass-control)] px-3 py-2 text-xs font-medium text-[var(--ink-secondary)] outline-none hover:border-[var(--edge-outline)] hover:text-[var(--ink)] focus-visible:ring-3 focus-visible:ring-[var(--chrome-focus-ring)]/35 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-[var(--chrome-focus-ring)]/35 disabled:cursor-not-allowed disabled:opacity-40";
const STATUS: Record<AssetJob["status"], string> = { queued: "Queued", submitting: "Sending to DreamCut", running: "Working", saving: "Saving results", ready: "Ready to review", failed: "Needs attention", uncertain: "Not confirmed", canceled: "Canceled" };
const RESULTS_BATCH_SIZE = 5;
const IMAGE_FILES = ".png,.jpg,.jpeg,.webp", VIDEO_FILES = ".mp4,.mov,.webm,.m4v", AUDIO_FILES = ".mp3,.ogg,.wav,.m4a,.aac";
const ALL_FILES = `${IMAGE_FILES},${VIDEO_FILES},${AUDIO_FILES}`;
const CREATE_SECTIONS = [["image", "Image"], ["video", "Video"], ["music", "Music"], ["speech", "Voice"]] as const;
type Section = "image" | "video" | "music" | "speech";
const sectionOf = (task: AssetTask): Section => task === "image" || task === "edit" ? "image" : task === "music" ? "music" : task === "speech" ? "speech" : "video";
const SECTION_KIND = { image: "image", video: "video", music: "audio", speech: "speech" } as const;
const SECTION_OF_KIND = { image: "image", video: "video", audio: "music", speech: "speech" } as const;
const taskOfKind = (kind: CloudModel["kind"]): AssetTask => kind === "image" ? "image" : kind === "audio" ? "music" : kind === "speech" ? "speech" : "video";
/** A script, a song's style and a picture prompt don't carry over: moving between them starts from that model's own last prompt. */
const promptFamily = (kind: CloudModel["kind"]) => kind === "image" || kind === "video" ? "picture" : kind;
/** About a minute of speech, for voiceover prices before there is a script. */
const MINUTE_SCRIPT = "x".repeat(900);
type CloudModel = (typeof CLOUD_MODELS)[number];
/** The job a model does, as the model picker groups them. */
function modelGroup(m: CloudModel) {
  if (m.kind !== "video") return m.kind === "audio" ? "Music" : m.kind === "speech" ? "Voiceover" : "Images";
  if (m.roles.includes("source")) return "Change a video";
  if (m.adapter === "motion") return "Copy movement";
  if (m.adapter === "seedance-ref") return "Build from your images and clips";
  return "Make a video";
}
/** What a model takes besides the prompt, in the words its reference slots use. */
function modelInputs(m: Pick<CloudModel, "id" | "roles" | "kind" | "audio" | "audioRequired" | "adapter" | "speech">) {
  if (m.speech) {
    const voices = modelVoices(m.id).length;
    return [voices ? `${voices} voices` : m.speech.promptVoice ? "Voice from the prompt" : "Its own voice", ...(m.speech.delivery ? ["Delivery"] : []), ...(m.roles.includes("audio") ? ["Copies a voice clip"] : [])];
  }
  const words: Partial<Record<ReferenceRole, string>> = { start: "Start frame", end: "End frame", edit: "Image to edit", subject: "Reference images", style: "Reference images", composition: "Reference images",
    motion: m.adapter === "seedance-ref" ? "Video clips" : "Motion video", source: "Your video", audio: "Audio" };
  const inputs = [...new Set(m.roles.map(role => words[role]).filter((w): w is string => Boolean(w)))];
  if (m.kind === "video" && m.audio && !m.roles.includes("source")) inputs.push(m.audioRequired ? "Sound included" : "Optional sound");
  return inputs.length || m.kind === "audio" ? inputs : ["Prompt only"];
}
/** Reference slots shown before "Add reference": frames, source and motion video, audio. */
const SLOT_ROLES: readonly ReferenceRole[] = ["start", "end", "source", "motion", "edit", "audio"];
type Reference = AssetDraft["references"][number];
/** Puts a reference in a role: replaces slot `index`, else adds while the role has room, else replaces its last. */
function placeReference(references: Reference[], reference: Reference, limit: number, index?: number): Reference[] {
  if (index !== undefined && references[index]?.role === reference.role) return references.map((r, i) => i === index ? reference : r);
  const same = references.flatMap((r, i) => r.role === reference.role ? [i] : []);
  if (same.length < limit) return [...references, reference];
  return references.map((r, i) => i === same.at(-1) ? reference : r);
}
async function jsonRequest(url: string, body?: unknown, method = "POST") {
  const response = await fetch(url, body === undefined ? { cache: "no-store" } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Request failed."); return data;
}
const isImageTask = (task: AssetTask) => task === "image" || task === "edit";
const credits = (n: number) => `${n.toLocaleString()} credit${n === 1 ? "" : "s"}`;
/** The fields that set a DreamCut price; marks and notes do not. */
const priceKey = (d: AssetDraft) => JSON.stringify({ ...d, marks: [], intent: undefined, parentJobId: undefined });
const buyCreditsLink = <a className="font-medium text-[var(--ink)] underline underline-offset-2" href={BUY_CREDITS_URL} target="_blank" rel="noopener noreferrer">Buy credits</a>;

/**
 * The one Generate form. `presentation` places it: "drawer" slides over the page (SlideOutDrawer), "docked" fills a
 * panel its host lays out (Library), and the editor's Library drawer embeds it with `inline`. Draft, price, balance,
 * sign-in/credits gating and staged-draft behaviour are identical in every placement.
 */
export function AssetGenerationDrawer({ projectId, open, onClose, onLibraryChanged, launch, onPickLibrary, inline: embedded = false, presentation = "drawer", inlinePane, onInlinePaneChange, onBack }: {
  /** Drawer only: return to the Library drawer this one replaced. */
  onBack?: () => void;
  projectId: string; open: boolean; onClose: () => void; onLibraryChanged: () => void; launch?: GenerationLaunch; /** Docked and embedded forms: fill a slot from the host's Library grid; `label` names the slot for the host's prompt. */ onPickLibrary?: (role: ReferenceRole, label: string) => void; inline?: boolean; presentation?: "docked" | "drawer"; inlinePane?: "create" | "history"; onInlinePaneChange?: (pane: "create" | "history") => void;
}) {
  const docked = !embedded && presentation === "docked";
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => setPortalReady(true), []);
  // Docked and embedded forms live inside their host's layout; only the drawer manages focus and Escape itself.
  const inline = embedded || docked;
  const base = `/api/projects/${encodeURIComponent(projectId)}/asset-generation`;
  const storageKey = `dreamcut:asset-draft:${projectId}`;
  const [state, setState] = useState<State | null>(null);
  const [workspace, setWorkspace] = useState<Workspace>({ draft: EMPTY_ASSET_DRAFT, referenceSets: [] });
  const [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const [extraReferences, setExtraReferences] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // The slide-out drawer picks references in place, beside the slot, so the form never disappears.
  // Docked (Library page) and embedded forms pick from the Library grid their host shows next to them.
  const pickInPlace = !embedded && presentation === "drawer";
  // The slot being filled from the Library: a role, and which of its references when it holds several.
  const [picking, setPicking] = useState<{ role: ReferenceRole; index?: number } | null>(null);
  const isPicking = (role: ReferenceRole, index?: number) => picking?.role === role && picking.index === index;
  const chooseReference = (role: ReferenceRole, index?: number) => { if (pickInPlace) setPicking(current => current?.role === role && current.index === index ? null : { role, index }); else onPickLibrary?.(role, slotNoun(role)); };
  const [localPane, setLocalPane] = useState<"create" | "history">("create");
  const pane = inlinePane ?? localPane;
  const results = pane === "history";
  const setPane = useCallback((value: "create" | "history") => { setLocalPane(value); if (inline) onInlinePaneChange?.(value); }, [inline, onInlinePaneChange]);
  const [visibleJobs, setVisibleJobs] = useState(RESULTS_BATCH_SIZE);
  const [probe, setProbe] = useState<{ times: number[]; duration: number } | null>(null);
  const drawerBody = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const saveChain = useRef(Promise.resolve());
  const seenStagedId = useRef<string | undefined>(undefined);
  const hasRefreshed = useRef(false);
  const lastLaunch = useRef<number | null>(null);
  const requestIdentity = useRef<{ snapshot: string; id: string } | null>(null);
  const draft = workspace.draft;
  const update = (patch: Partial<AssetDraft>) => setWorkspace(w => ({ ...w, draft: { ...w.draft, ...patch } }));
  // Marks, as in the editor: M marks the active image or video moment; the crosshair
  // arms one point mark on any reference, result or Library image.
  // A launch from another page replaces the draft; keep the replaced one restorable.
  const [replacedDraft, setReplacedDraft] = useState<AssetDraft | null>(null);
  const [pointMode, setPointMode] = useState(false);
  const [selectedMark, setSelectedMark] = useState<string | null>(null);
  const marks = draft.marks ?? [];
  const markNumbers = new Map(marks.map((mark, index) => [mark.id, index + 1]));
  const activeMedia = useRef<{ source: string; element: HTMLElement } | null>(null);
  const addMark = (mark: Omit<GenerationMark, "id" | "note">) => {
    const id = crypto.randomUUID().slice(0, 8);
    setWorkspace(w => ({ ...w, draft: { ...w.draft, marks: [...(w.draft.marks ?? []), { ...mark, id, note: "" }] } }));
    setSelectedMark(id); setPointMode(false);
  };
  const editMarks = (next: GenerationMark[]) => setWorkspace(w => ({ ...w, draft: { ...w.draft, marks: next } }));
  /** M: the active media at its current moment (videos) or as a whole image. */
  const markActive = () => {
    const target = activeMedia.current ?? (() => { const element = document.querySelector<HTMLElement>("[data-mark-source]"); return element ? { source: element.dataset.markSource!, element } : null; })();
    if (!target) { setError("Click an image or video first, then mark it."); return; }
    const video = target.element.querySelector("video");
    addMark({ source: target.source, label: mediaLabel(target.element), ...(video ? { time: Math.round(video.currentTime * 100) / 100 } : {}) });
  };
  const seekMark = (_seconds: number, id?: string) => {
    const mark = marks.find(m => m.id === id); if (!mark) return;
    setSelectedMark(mark.id);
    const element = document.querySelector<HTMLElement>(`[data-mark-source="${CSS.escape(mark.source)}"]`);
    element?.scrollIntoView({ block: "center", behavior: "smooth" });
    const video = element?.querySelector("video");
    if (video && mark.time !== undefined) { video.pause(); video.currentTime = mark.time; }
  };
  const registerMarking = useRegisterGenerationMarking();
  useEffect(() => {
    if (!registerMarking) return;
    registerMarking({ pointMode, marks, numbering: markNumbers, selectedId: selectedMark, addPoint: addMark, select: setSelectedMark,
      setActive: (source, element) => { activeMedia.current = { source, element }; } });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerMarking, pointMode, marks, selectedMark]);
  useEffect(() => () => registerMarking?.(null), [registerMarking]);
  const markKey = useKeyboardShortcuts().mark;
  useEffect(() => {
    if (!inline || !open) return;
    // Capture phase: an open Generate drawer owns the mark key, so the editor underneath does not also add a timeline mark.
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.defaultPrevented || !bindingMatches(event, markKey) || target?.closest("input, textarea, select, [contenteditable=true]")) return;
      event.preventDefault(); markActive();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });
  const assetName = (source: string, label?: string) => label ?? state?.assets.find(a => a.source === source)?.name ?? source.split("/").pop() ?? source;
  const dock = useProjectReviewDock();
  const rolesFor = (d: AssetDraft): readonly ReferenceRole[] => getAssetModel(d).roles;
  /** Next round from a result: its settings, the result as the reference, marks kept. */
  const applyAsReference = (job: AssetJob, output: AssetOutput) => {
    const role = output.kind === "image" ? (["edit", "start", "subject"] as const).find(r => rolesFor(job.request).includes(r)) : undefined;
    setWorkspace(w => ({ ...w, draft: { ...job.request, parentJobId: job.id, marks: w.draft.marks,
      references: role ? [...job.request.references.filter(r => r.role !== role), { source: output.source, role, label: "Previous result" }] : job.request.references } }));
    setPane("create");
  };
  // A result added to chat is a pill in the composer; the agent reads its source and request.
  const resultSelection = useChatSelection("generate-results");
  const toggleResultInChat = (job: AssetJob, output: AssetOutput) => {
    const id = `result:${job.id}/${output.id}`;
    const added = !resultSelection.selectedIds.has(id);
    resultSelection.toggle({ id, kind: output.kind === "video" ? "Video" : output.kind === "audio" ? "Audio" : "Image", label: job.request.route === "fal" ? getAssetModel(job.request).name : "GPT Image",
      agentText: `Generated ${output.kind} result ${output.source} (${job.request.route === "fal" ? getAssetModel(job.request).name : "GPT Image"}; prompt ${JSON.stringify(job.request.prompt.slice(0, 400))}). Inspect it with your visual tools.` });
    if (added) dock?.setTab("chat");
  };
  const pageContextText = [
    "Page: Generate (DreamCut's image, video, music and voiceover generation form). Current draft:",
    `- Model: ${getAssetModel(draft).name}; task ${draft.task}${draft.task === "speech" ? `; quality ${draft.resolution ?? getAssetModel(draft).resolutions[0] ?? "best"}` : `; aspect ${draft.aspect}${isImageTask(draft.task) ? `; ${draft.count} image(s)` : `; ${draft.duration}s`}`}`,
    `- ${draft.task === "speech" ? "Script" : "Prompt"}: ${draft.prompt.trim() ? JSON.stringify(draft.prompt) : "(empty)"}`,
    ...(draft.task === "speech" ? [`- Voice: ${draft.voice ?? "(from the clip or prompt)"}${draft.delivery?.trim() ? `; delivery ${JSON.stringify(draft.delivery)}` : ""}`] : []),
    ...(draft.lyrics?.trim() ? [`- Lyrics: ${JSON.stringify(draft.lyrics)}`] : []),
    ...(draft.references.length ? ["- References:", ...draft.references.map(r => `  - ${modelReferenceLabel(draft, r.role)}: ${assetName(r.source)} (${r.source})${r.window ? `, ${r.window.start}–${r.window.end}s` : ""}`)] : ["- References: none"]),
    ...(marks.length ? ["- Creator's marks (inspect each source with your visual tools; x/y are fractions from the top-left; a time is a video frame):", ...marks.map(m => `  ${markNumbers.get(m.id)}. on ${assetName(m.source, m.label)} (${m.source})${m.x !== undefined && m.y !== undefined ? ` at point x ${Math.round(m.x * 100)}%, y ${Math.round(m.y * 100)}%` : " (whole image)"}${m.time !== undefined ? ` at ${m.time}s of the video` : ""}: ${m.note || "(no note yet)"}`)] : []),
    ...(state?.jobs[0] ? [`- Latest request: ${JSON.stringify(state.jobs[0].request.prompt.slice(0, 600))} → ${STATUS[state.jobs[0].status]}${state.jobs[0].outputs.length ? `; results: ${state.jobs[0].outputs.map(o => o.source).join(", ")}` : ""}`] : []),
    "To change the form, call asset_generation_prepare with the complete revised draft. Keep the selected model and references unless asked; marks are preserved automatically. Explain what you changed. Generate only when the creator clicks Generate, or after they explicitly approve this draft in chat: then call asset_generation_submit with their exact words.",
  ].join("\n");
  const setPageContext = dock?.setPageContext;
  useEffect(() => {
    if (!inline || !setPageContext) return;
    setPageContext({ key: "generate", label: "Generate draft", text: pageContextText, tips: [
      "Press M to mark the image or video moment you're on; the crosshair marks a spot.",
      "Add a note to each mark in Marks, then ask me to update the prompt.",
      "Your draft and marks come with every message.",
    ] });
  }, [inline, setPageContext, pageContextText]);
  useEffect(() => () => { if (inline) setPageContext?.(null); }, [inline, setPageContext]);
  const recentPrompts = [...new Set((state?.jobs ?? []).map(job => job.request.prompt.trim()).filter(Boolean))].slice(0, 8);
  const apply = useCallback((data: State) => { data.jobs = data.jobs.filter(j => j.request.task !== "extract"); setState(data);
    if (data.workspace.stagedId && data.workspace.stagedId !== seenStagedId.current) {
      seenStagedId.current = data.workspace.stagedId;
      setWorkspace(data.workspace);
      if (hasRefreshed.current) setPane("create");
    }
    hasRefreshed.current = true;
    return data; }, [setPane]);
  const refresh = useCallback(async () => apply(await jsonRequest(base) as State), [base, apply]);
  useEffect(() => {
    let active = true;
    void refresh().then(data => {
      if (!active) return;
      let saved = data.workspace;
      try { const local = getStoredItem(localStorage, storageKey); if (local) { const parsed = JSON.parse(local); if (parsed.stagedId === data.workspace.stagedId) saved = { stagedId: parsed.stagedId, draft: assetDraftSchema.parse(parsed.draft), referenceSets: parsed.referenceSets ?? [], modelDrafts: parsed.modelDrafts ?? {} }; } } catch { /* Fall back to server draft. */ }
      if (saved.draft.task === "extract") saved = { ...saved, draft: { ...EMPTY_ASSET_DRAFT, task: "video", route: "fal", modelId: "kling-3-pro", aspect: "16:9" } };
      if (saved.draft.route === "fal") {
        const allowed = getAssetModel(saved.draft).roles;
        saved = { ...saved, draft: { ...saved.draft, references: saved.draft.references.filter(r => allowed.includes(r.role)), prompt: allowed.includes("subject") ? saved.draft.prompt : saved.draft.prompt.replace(/@Element1\b/g, "The person") } };
      }
      setWorkspace(saved); setLoaded(true);
    }).catch(e => setError(e.message));
    return () => { active = false; };
  }, [refresh, storageKey]);
  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(storageKey, JSON.stringify(workspace));
    const timer = setTimeout(() => { saveChain.current = saveChain.current.catch(() => undefined).then(async () => { await jsonRequest(base, workspace, "PUT"); }).catch(e => setError(`Draft save failed: ${e.message}`)); }, 350);
    return () => clearTimeout(timer);
  }, [workspace, loaded, base, storageKey]);
  useEffect(() => {
    if (!open) return;
    // Picks up agent-staged drafts and job progress through the shared, ETag-gated poll
    // (also used by the draft review); a hidden tab waits until it is shown.
    return assetGenerationPoll<State>(projectId).subscribe(data => { apply(structuredClone(data)); }, e => setError((e as Error).message));
  }, [open, apply, projectId]);
  // SlideOutDrawer owns Escape, focus-in and focus return for the drawer presentation.
  useEffect(() => { if (open && !inline) drawerBody.current?.scrollTo({ top: 0 }); }, [open, inline]);
  useEffect(() => { if (!open) drawerBody.current?.querySelectorAll("video").forEach(v => v.pause()); }, [open]);
  useEffect(() => { drawerBody.current?.scrollTo({ top: 0 }); }, [pane]);
  useEffect(() => {
    if (!loaded || !launch || launch.nonce === lastLaunch.current) return;
    lastLaunch.current = launch.nonce;
    if (launch.addReference && launch.source) {
      if (launch.referenceRole) {
        const role = launch.referenceRole, source = launch.source;
        setWorkspace(w => ({ ...w, draft: { ...w.draft, references: placeReference(w.draft.references, { role, source, label: source.split("/").pop()! }, w.draft.route === "fal" ? roleLimit(getAssetModel(w.draft), role) : 1) } }));
      } else {
        const free = pooledImageRoles(workspace.draft)?.find(role => !workspace.draft.references.some(r => r.role === role));
        if (free) setWorkspace(w => ({ ...w, draft: { ...w.draft, references: [...w.draft.references, { role: free, source: launch.source!, label: launch.source!.split("/").pop()! }] } }));
        else setPendingSource(launch.source);
      }
      setPane("create"); return;
    }
    if (!launch.task) { if (launch.prompt) { update({ prompt: launch.prompt }); setPane("create"); } return; }
    const task = launch.task === "extract" ? "video" : launch.task;
    const role = task === "edit" ? "edit" : "start";
    setReplacedDraft(workspace.draft.prompt.trim() || workspace.draft.references.length ? workspace.draft : null);
    setWorkspace(w => ({ ...w, draft: { ...EMPTY_ASSET_DRAFT, prompt: launch.prompt ?? w.draft.prompt, task, route: "fal", modelId: isImageTask(task) ? defaultImageModel() : "kling-3-pro", aspect: "16:9", references: launch.source ? [{ source: launch.source, role, label: launch.source.split("/").pop()! }] : [] } }));
    setPane("create");
  }, [launch, loaded]);
  const source = draft.references.find(r => r.role === "motion")?.source;
  const model = getAssetModel(draft);
  const voices = draft.route === "fal" ? modelVoices(model.id) : [];
  const copyingVoice = draft.task === "speech" && draft.references.some(r => r.role === "audio");
  const supportedRoles: readonly ReferenceRole[] = model.roles;
  const incompatible = draft.references.filter(r => !supportedRoles.includes(r.role));
  /** Image models that read every picture alike: one numbered Images list, filled role by role. */
  const pool = pooledImageRoles(draft);
  const nextPoolRole = pool?.find(role => !draft.references.some(r => r.role === role));
  const limitFor = (role: ReferenceRole) => draft.route === "fal" ? roleLimit(model, role) : 1;
  /** Roles shown as slots up front: frames, videos, audio, and what the model needs or takes several of. */
  const slotRole = (role: ReferenceRole) => SLOT_ROLES.includes(role) || (draft.route === "fal" && (model.required.includes(role) || roleLimit(model, role) > 1));
  // Video and audio references send a time range; its length bounds the range and sets the first one.
  const [lengths, setLengths] = useState<Record<string, number>>({});
  /** One player per video reference, shared by its preview and the trim under it. */
  const players = useRef(new Map<string, RefObject<PlayerRef | null>>());
  const playerFor = (source: string) => { let ref = players.current.get(source); if (!ref) players.current.set(source, ref = createRef<PlayerRef>()); return ref; };
  const askedLengths = useRef(new Set<string>());
  const mediaSources = draft.references.filter(r => MEDIA_ROLES.includes(r.role)).map(r => r.source).join("\n");
  useEffect(() => {
    for (const source of mediaSources ? mediaSources.split("\n") : []) {
      if (askedLengths.current.has(source)) continue;
      askedLengths.current.add(source);
      void fetch(`${base}/source`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source, lengthOnly: true }) })
        .then(async r => { const p = await r.json(); if (!r.ok) throw new Error(p.error); setLengths(l => ({ ...l, [source]: p.duration })); })
        .catch(e => { askedLengths.current.delete(source); setError((e as Error).message); });
    }
  }, [mediaSources, base]);
  useEffect(() => {
    if (draft.route !== "fal" || !draft.references.some(r => MEDIA_ROLES.includes(r.role) && !r.window && lengths[r.source])) return;
    setWorkspace(w => ({ ...w, draft: { ...w.draft, references: w.draft.references.map(r => MEDIA_ROLES.includes(r.role) && !r.window && lengths[r.source]
      ? { ...r, window: { start: 0, end: Math.floor(Math.min(lengths[r.source], windowLimit(w.draft, r.role)) * 100) / 100 } } : r) } }));
  }, [lengths, draft.references, draft.route]);
  useEffect(() => {
    setProbe(null); if (!source) return;
    const controller = new AbortController();
    void fetch(`${base}/source`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source }), signal: controller.signal }).then(async r => { const p = await r.json(); if (!r.ok) throw new Error(p.error); setProbe(p); setWorkspace(w => ({ ...w, draft: { ...w.draft, end: Math.min(w.draft.end, p.times.at(-1) ?? w.draft.end) } })); void refresh(); }).catch(e => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [source, base, refresh]);
  let inputError: string | undefined;
  try { validateAssetRequest(draft); } catch (e) { inputError = (e as Error).message; }
  // DreamCut models: price, sign-in and balance from the Cloud, re-checked when the creator returns to the tab
  // (for example after signing in or buying credits in the browser).
  const cloudAccount = useCloudAccount();
  const requestDraft = draft.route === "fal" ? { ...draft, task: modelTask(draft) } : draft;
  const currentPriceKey = priceKey(requestDraft);
  const unavailableModel = draft.route === "fal" && model.cloud === false;
  const [check, setCheck] = useState<{ key: string; data: GenerationCheck } | null>(null);
  const [recheck, setRecheck] = useState(0);
  useEffect(() => {
    const again = () => { if (document.visibilityState === "visible") setRecheck(n => n + 1); };
    window.addEventListener("focus", again); document.addEventListener("visibilitychange", again);
    return () => { window.removeEventListener("focus", again); document.removeEventListener("visibilitychange", again); };
  }, []);
  const signedIn = cloudAccount.account?.signed_in;
  useEffect(() => {
    if (!open || !loaded || draft.route !== "fal" || unavailableModel || inputError) return;
    const key = currentPriceKey, controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`${base}/quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft: JSON.parse(key) }), signal: controller.signal })
        .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setCheck({ key, data }); })
        .catch(e => { if ((e as Error).name !== "AbortError") setCheck({ key, data: { readiness: "price_unavailable", quote: null, signed_in: Boolean(signedIn), balance: null, message: (e as Error).message, buy_credits_url: BUY_CREDITS_URL } }); });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, loaded, draft.route, unavailableModel, inputError, currentPriceKey, base, signedIn, recheck]);
  const generationCheck = draft.route === "fal" && check?.key === currentPriceKey ? check.data : null;
  // Tell the server the creator has this staged draft in front of them (chat approval requires it).
  const reportedView = useRef<string | null>(null);
  useEffect(() => {
    const stagedId = workspace.stagedId;
    if (!open || !loaded || pane !== "create" || !stagedId || reportedView.current === stagedId) return;
    reportedView.current = stagedId;
    void fetch(`${base}/viewed`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stagedId }) }).catch(() => { reportedView.current = null; });
  }, [open, loaded, pane, workspace.stagedId, base]);
  const price = generationCheck?.quote ?? null;
  /** Every model for this kind of media, priced at the current length where it offers it. */
  const modelChoices: ModelChoice[] = [
    ...CLOUD_MODELS.filter(m => m.kind === SECTION_KIND[sectionOf(draft.task)]).map(m => {
      const current = draft.route === "fal" && m.id === model.id;
      // Voiceovers are priced by the script: this script, or a minute's worth before there is one.
      const script = draft.task === "speech" ? draft.prompt.trim() : "";
      if (m.speech) {
        const estimate = current && price ? price.credits : modelCreditEstimate({ ...EMPTY_ASSET_DRAFT, route: "fal", modelId: m.id, task: "speech", prompt: script || MINUTE_SCRIPT, audio: true, resolution: m.resolutions[0], voice: m.speech.defaultVoice });
        return { id: m.id, name: m.name, description: m.description, inputs: modelInputs(m), price: estimate === null ? "Varies" : `${current && price ? "" : "~"}${credits(estimate)}${script ? "" : " / min"}`, group: modelGroup(m) };
      }
      const estimateDraft: AssetDraft = current ? requestDraft : { ...EMPTY_ASSET_DRAFT, route: "fal", modelId: m.id, task: taskOfKind(m.kind),
        duration: m.durations.includes(draft.duration) ? draft.duration : m.kind === "audio" ? m.durations.find(n => n >= 60) ?? 60 : m.durations.find(n => n >= 5) ?? 5,
        resolution: m.resolutions[0], audio: Boolean(m.audioRequired), aspect: m.aspects[0], count: 1, references: [] };
      const estimate = current && price ? price.credits : modelCreditEstimate(estimateDraft);
      const priceLine = estimate !== null ? `${current && price ? "" : "~"}${credits(estimate)}` : m.roles.includes("source") ? "By video length" : m.adapter === "motion" ? "By motion length" : "Varies";
      return { id: m.id, name: m.name, description: m.description, inputs: modelInputs(m), price: priceLine, group: modelGroup(m) };
    }),
  ];
  const action = async (fn: () => Promise<void>) => { setBusy(true); setError(null); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  // Returning to Image, Video or Music reopens the model last used there, with its draft.
  const sectionModels = useRef<Partial<Record<Section, string>>>({});
  const selectModel = (id: string) => {
    const kind = ASSET_MODELS.find(m => m.id === id)?.kind;
    if (kind) sectionModels.current[SECTION_OF_KIND[kind]] = id;
    const selected = ASSET_MODELS.find(m => m.id === id)!;
    setWorkspace(w => {
      const previous = w.draft, saved = w.modelDrafts?.[id];
      const references = (saved?.references ?? previous.references).filter((r, i, all) => selected.roles.includes(r.role) && all.slice(0, i).filter(x => x.role === r.role).length < roleLimit(selected, r.role));
      const crossing = promptFamily(selected.kind) !== promptFamily(previous.route === "fal" ? getAssetModel(previous).kind : "image");
      const prompt = (saved?.prompt ?? (crossing ? "" : previous.prompt)).replace(/@Element1\b/g, selected.roles.includes("subject") ? "@Element1" : "The person");
      const voices = modelVoices(id), keepVoice = (voice?: string) => voice && voices.some(v => v.id === voice) ? voice : undefined;
      let next: AssetDraft = { ...previous, modelId: id, route: "fal", task: taskOfKind(selected.kind), references, prompt,
        lyrics: selected.lyrics ? saved?.lyrics ?? previous.lyrics : undefined,
        voice: selected.speech ? keepVoice(saved?.voice) ?? keepVoice(previous.voice) ?? selected.speech.defaultVoice : undefined,
        delivery: selected.speech?.delivery ? saved?.delivery ?? previous.delivery : undefined,
        duration: saved?.duration ?? (selected.kind === "audio" ? selected.durations.find(n => n >= 60) ?? 60 : selected.durations.find(n => n >= 5) ?? 5),
        resolution: saved?.resolution ?? selected.resolutions[0],
        settings: saved?.settings,
        aspect: saved?.aspect ?? (selected.aspects.includes(previous.aspect) ? previous.aspect : selected.aspects[0]),
        count: saved?.count ?? 1, audio: selected.audioRequired || (saved?.audio ?? false) };
      next = { ...next, task: modelTask(next) };
      return { ...w, draft: next, modelDrafts: { ...w.modelDrafts, [getAssetModel(previous).id]: previous } };
    });
    drawerBody.current?.scrollTo({ top: 0 });
    setError(null);
  };
  const switchTask = (section: Section) => {
    sectionModels.current[sectionOf(draft.task)] = model.id;
    selectModel(sectionModels.current[section] ?? (section === "image" ? defaultImageModel() : section === "music" ? "minimax-music-3" : section === "speech" ? defaultModelId("speech", []) : "kling-3-pro"));
  };
  const submit = () => action(async () => {
    const snapshot = JSON.stringify(requestDraft);
    if (requestIdentity.current?.snapshot !== snapshot) requestIdentity.current = { snapshot, id: crypto.randomUUID() };
    await jsonRequest(base, { id: requestIdentity.current.id, draft: requestDraft, ...(draft.route === "fal" && price ? { acceptedCredits: price.credits } : {}) });
    requestIdentity.current = null; setPane("history"); setRecheck(n => n + 1);
    await refresh();
  });
  const jobAction = (job: AssetJob, body: unknown) => action(async () => { await jsonRequest(`${base}/${job.id}`, body); await refresh(); onLibraryChanged(); });
  const putReference = (reference: Reference, index?: number) => setWorkspace(w => ({ ...w, draft: { ...w.draft, references: placeReference(w.draft.references, reference, w.draft.route === "fal" ? roleLimit(getAssetModel(w.draft), reference.role) : 1, index) } }));
  const referenceLabel = (role: ReferenceRole) => modelReferenceLabel(draft, role);
  /** What a slot is called where the creator picks for it: just "image" in the Images list. */
  function slotNoun(role: ReferenceRole) { return pool?.includes(role) ? "image" : referenceLabel(role).toLowerCase(); }
  const uploadInput = useRef<HTMLInputElement>(null);
  const uploadSlot = useRef<{ role: ReferenceRole; index?: number } | null>(null);
  /** Opens the file picker for one slot; the chosen file fills that slot. */
  const uploadFor = (role: ReferenceRole, index?: number) => {
    const input = uploadInput.current; if (!input) return;
    uploadSlot.current = { role, index };
    input.accept = role === "audio" ? AUDIO_FILES : role === "motion" || role === "source" ? VIDEO_FILES : IMAGE_FILES;
    input.click();
  };
  /** Library or upload for one slot, as a small menu on the slot's own control. */
  const slotMenu = (role: ReferenceRole, trigger: ReactElement, index?: number) => <ActionMenu align="start" trigger={trigger}>
    <ActionMenuItem icon={<FolderOpenIcon />} onClick={() => chooseReference(role, index)}>From library</ActionMenuItem>
    <ActionMenuItem icon={<UploadIcon />} disabled={busy} onClick={() => uploadFor(role, index)}>Upload</ActionMenuItem>
  </ActionMenu>;
  /** How the prompt names a reference, where the model refers to references by name. */
  const promptToken = (role: ReferenceRole, n: number) => {
    if (draft.route !== "fal") return null;
    if ((model.adapter === "kling" || model.adapter === "motion") && role === "subject") return "@Element1";
    if ((model.adapter === "seedance-ref" || model.adapter === "o1-edit") && role === "subject") return `@Image${n}`;
    if (model.adapter === "seedance-ref" && role === "motion") return `@Video${n}`;
    if (model.adapter === "seedance-ref" && role === "audio") return `@Audio${n}`;
    return null;
  };
  /** One card per reference in a role, plus an empty one while the role has room. */
  const referenceCards = (role: ReferenceRole) => {
    const filled = draft.references.flatMap((reference, index) => reference.role === role ? [{ reference, index }] : []);
    const several = limitFor(role) > 1;
    const slots: { reference?: Reference; index?: number }[] = filled.length < limitFor(role) ? [...filled, {}] : filled;
    return slots.map(({ reference, index }, n) => referenceCard(role, reference, index, `${referenceLabel(role)}${several ? ` ${n + 1}` : ""}`, promptToken(role, n + 1)));
  };
  /** The Images list: each picture numbered as the prompt names it, plus an empty card while there is room. */
  const poolCards = (roles: readonly ReferenceRole[]) => {
    const filled = draft.references.flatMap((reference, index) => roles.includes(reference.role) ? [{ role: reference.role, reference, index }] : []);
    const slots: { role: ReferenceRole; reference?: Reference; index?: number }[] = nextPoolRole ? [...filled, { role: nextPoolRole }] : filled;
    return slots.map(({ role, reference, index }, n) => referenceCard(role, reference, index, `Image ${n + 1}`, null));
  };
  const referenceCard = (role: ReferenceRole, reference: Reference | undefined, index: number | undefined, label: string, token: string | null) => {
      const video = role === "motion" || role === "source";
      // A start frame and a motion video sit side by side at the same height; the motion video's trim runs under both.
      const paired = draft.route === "fal" && draft.references.some(r => r.role === "start") && draft.references.some(r => r.role === "motion" && r.window && lengths[r.source]);
      const pairedMotion = paired && role === "motion" && reference?.window && lengths[reference.source] ? reference.window : null;
      const name = <>{label}{token ? <span className="ml-1.5 text-violet-300">{token}</span> : null}</>;
      const EmptyIcon = role === "audio" ? UploadIcon : video ? FilmIcon : ImagePlusIcon;
      const slot = <button type="button" aria-label={`${reference ? "Replace" : "Add"} the ${label.toLowerCase()}`} aria-pressed={isPicking(role, index)} onClick={role === "audio" ? () => uploadFor(role, index) : undefined} disabled={busy && role === "audio"} className="group/slot flex w-full flex-col gap-2 rounded-xl p-2.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-[var(--chrome-focus-ring)]/35 aria-pressed:ring-2 aria-pressed:ring-[var(--chrome-focus-ring)]">
        {reference ? <>
          <span className="truncate pr-7 text-xs font-medium text-[var(--ink-secondary)]">{name}</span>
          {role === "audio" ? <span className="truncate text-xs text-[var(--ink)]">{reference.label}</span> : video ? (pairedMotion ? null : <span className="flex min-w-0 items-center gap-1.5 text-xs text-[var(--ink)]"><FilmIcon aria-hidden="true" className="size-3.5 shrink-0" /><span className="truncate">{assetName(reference.source, reference.label)}</span></span>) : <MarkableMedia source={reference.source}><img src={thumbnailUrl(assetMediaUrl(projectId, reference.source), 640)} decoding="async" alt={state?.assets.find(a => a.source === reference.source)?.name ?? reference.label} className={paired && role === "start" ? "block h-auto w-full rounded-lg object-contain" : "mx-auto block h-auto max-h-64 w-auto max-w-full rounded-lg object-contain"} /></MarkableMedia>}
        </> : <span className="flex min-h-16 flex-col items-center justify-center gap-1.5 text-center text-xs text-[var(--ink-muted)] group-hover/slot:text-[var(--ink)]"><EmptyIcon aria-hidden="true" className="size-4" /><span>{name}</span></span>}
      </button>;
      const setWindow = (window: { start: number; end: number }) => update({ references: draft.references.map((r, i) => i === index ? { ...r, window: { start: Math.round(window.start * 100) / 100, end: Math.round(window.end * 100) / 100 } } : r) });
      // A video or audio reference carries its time range, which needs the full row (a paired motion video puts it in the row below).
      const card = <div key={`${role}-${index ?? "new"}`} className={`relative min-w-0 rounded-xl border ${reference?.window && draft.route === "fal" && !pairedMotion ? "col-span-2" : ""} ${pairedMotion ? "z-10 -mb-[9px] self-stretch rounded-b-none border-b-0" : ""} ${reference ? "border-[var(--edge-outline)] bg-[var(--glass-control)]" : "border-dashed border-[var(--edge-outline)] hover:bg-[var(--glass-control)]"}`}>
        {/* One control per slot: pick from the Library or upload a file into it. Audio comes only from a file. */}
        {role === "audio" ? slot : slotMenu(role, slot, index)}
        {pairedMotion && reference ? <div className="px-2.5 pb-2.5 [&_[class*=previewFrame]]:!w-full"><ReferencePlayer projectId={projectId} source={reference.source} start={pairedMotion.start} player={playerFor(reference.source)} /></div>
        : reference?.window && draft.route === "fal" && video && lengths[reference.source] ? <ReferenceVideo projectId={projectId} source={reference.source} start={reference.window.start} end={reference.window.end} length={lengths[reference.source]} limit={windowLimit(draft, role)} busy={busy}
          onChange={setWindow} />
        : reference?.window && draft.route === "fal" ? <ReferenceWindow name={label.toLowerCase()} start={reference.window.start} end={reference.window.end} length={lengths[reference.source] ?? null} limit={windowLimit(draft, role)} disabled={busy}
          onChange={setWindow} /> : null}
        {reference ? <button type="button" aria-label={`Remove ${label.toLowerCase()}`} title="Remove" className="absolute right-1.5 top-1.5 rounded-md p-1 text-[var(--ink-muted)] outline-none hover:bg-[var(--chrome-raised)] hover:text-[var(--ink)] focus-visible:ring-3 focus-visible:ring-[var(--chrome-focus-ring)]/35" onClick={() => update({ references: draft.references.filter((_, i) => i !== index) })}><XIcon size={14} /></button> : null}
      </div>;
      if (!pairedMotion || !reference) return card;
      return <Fragment key={`${role}-${index ?? "new"}`}>{card}
        <div className="col-span-2 grid min-w-0 gap-2 rounded-xl rounded-tr-none border border-[var(--edge-outline)] bg-[var(--glass-control)] p-2.5">
          <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-[var(--ink-secondary)]"><FilmIcon aria-hidden="true" className="size-3.5 shrink-0" /><span className="truncate">{assetName(reference.source, reference.label)}</span></span>
          <ReferenceTrim start={pairedMotion.start} end={pairedMotion.end} length={lengths[reference.source]} limit={windowLimit(draft, role)} busy={busy} player={playerFor(reference.source)} onChange={setWindow} />
        </div>
      </Fragment>;
  };
  const upload = (file: File, slot?: { role: ReferenceRole; index?: number } | null) => action(async () => {
    // A slot's own upload fills that slot (if the file kind fits it); otherwise the first open slot for the file kind.
    let target: ReturnType<typeof generationUploadReference>;
    try { target = generationUploadReference(file.name, slot ? [slot.role] : supportedRoles, draft.references); }
    catch (e) { if (!slot) throw e; throw new Error(slot.role === "audio" ? "Choose an audio file for this slot." : slot.role === "motion" || slot.role === "source" ? "Choose a video for this slot." : "Choose an image for this slot."); }
    const { assetType, role } = target;
    const response = await fetch(`/api/projects/${projectId}/uploaded-assets`, { method: "POST", ...uploadAssetRequest(file, assetType) }); const data = await response.json(); if (!response.ok) throw new Error(data.error);
    await refresh(); onLibraryChanged();
    const source = decodeURIComponent(data.asset.source_url.split(`/media/`)[1]);
    putReference({ source, role, label: file.name }, slot?.index);
  });

  // The editor's Marks control, in the chat composer, for this page's marks.
  const marksControl = inline && dock?.marksTarget ? createPortal(<section aria-label="Marks for the agent" className="chat-marks-strip">
    <FrameTagControls busy={busy} onAdd={markActive} onStartPointMark={() => setPointMode(value => !value)} pointMarkActive={pointMode}
      tags={marks.map(mark => ({ id: mark.id, label: `Mark ${markNumbers.get(mark.id)} · ${assetName(mark.source, mark.label)}${mark.x !== undefined ? " · point" : ""}`,
        timeline_seconds: mark.time ?? 0, note: mark.note, points: mark.x !== undefined && mark.y !== undefined ? [{ x: mark.x, y: mark.y }] : [] }))}
      onSeek={seekMark} onRemove={id => editMarks(marks.filter(m => m.id !== id))} onClear={() => editMarks([])}
      onUpdate={(id, patch) => editMarks(marks.map(m => m.id === id ? { ...m, note: patch.note ?? m.note } : m))}
      addLabel="Mark the image or video moment you clicked (M)" pointLabel="Point mark — click a spot on any image or video"
      outlineButtonClassName="border-[var(--edge-outline)] text-[var(--ink)]" ghostButtonClassName="text-[var(--ink)]" />
  </section>, dock.marksTarget) : null;
  const content = <>
    {marksControl}
    <DrawerHeader closeLabel={docked ? "Hide Generate" : "Close generation drawer"} onClose={onClose} closeButtonRef={closeButton} showClose={!embedded}>
      {/* Past generations are a toggle beside the tabs, not a page of their own: the tabs stay, and choosing one
          returns to the form. */}
      {onBack && !inline ? <Button variant="ghost" size="icon-sm" className="shrink-0" aria-label="Back to Library" title="Back to Library" onClick={onBack}><ArrowLeftIcon aria-hidden="true" /></Button> : null}
      <SegmentedControl size="sm" fill role="tablist" aria-label="What to make" className="min-w-0 flex-1">
        {CREATE_SECTIONS.map(([section, label], index) => {
          const current = sectionOf(draft.task) === section;
          const choose = (next: typeof section) => { if (sectionOf(draft.task) !== next) switchTask(next); setPane("create"); };
          return <DrawerHeaderTab key={section} active={current && !results} tabIndex={current ? 0 : -1} id={`generation-tab-${section}`} aria-controls="generation-content" onClick={() => choose(section)}
            onKeyDown={event => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home" ? 0 : event.key === "End" ? CREATE_SECTIONS.length - 1 : (index + (event.key === "ArrowRight" ? 1 : CREATE_SECTIONS.length - 1)) % CREATE_SECTIONS.length;
              document.getElementById(`generation-tab-${CREATE_SECTIONS[next][0]}`)?.focus();
              choose(CREATE_SECTIONS[next][0]);
            }}
          >{label}</DrawerHeaderTab>;
        })}
      </SegmentedControl>
      <Button id="generation-history-open" variant="ghost" size="icon-sm" className={`shrink-0 ${results ? "bg-[var(--chrome-selected-bg)] text-[var(--ink)]" : "text-[var(--ink-secondary)]"}`} aria-label="History" title="History" aria-pressed={results} aria-controls="generation-content"
        onClick={() => setPane(results ? "create" : "history")}><HistoryIcon aria-hidden="true" /></Button>
    </DrawerHeader>
    <div id="generation-content" ref={drawerBody} className="min-h-0 flex-1 overflow-y-auto p-4 pb-10">
      {error ? <div role="alert" className="mb-4 rounded-lg border border-red-400/40 bg-red-400/10 p-3 text-sm">{error}</div> : null}
      {replacedDraft ? <div role="status" className="mb-4 flex items-center gap-2 rounded-lg bg-[var(--glass-control)] p-3 text-xs text-[var(--ink-secondary)]">
        <span className="flex-1">New draft opened</span>
        <Button variant="ghost" size="sm" onClick={() => { setWorkspace(w => ({ ...w, draft: replacedDraft })); setReplacedDraft(null); }}>Restore previous draft</Button>
        <Button variant="ghost" size="icon-xs" aria-label="Dismiss" onClick={() => setReplacedDraft(null)}><XIcon /></Button>
      </div> : null}
      {pane === "create" ? <div className="space-y-5">
        {draft.task === "music" || (draft.task === "speech" && !supportedRoles.length) ? null : <section className="space-y-2">
          <h3 className="text-xs font-medium text-[var(--ink-secondary)]">{draft.task === "extract" ? "Source video" : draft.task === "speech" ? "Copy a voice" : pool ? "Images" : "Images & references"}</h3>
          <input ref={uploadInput} aria-label="Upload reference" type="file" className="sr-only" tabIndex={-1} accept={ALL_FILES} disabled={busy} onChange={e => { const slot = uploadSlot.current; uploadSlot.current = null; e.target.accept = ALL_FILES; if (e.target.files?.[0]) void upload(e.target.files[0], slot); e.target.value = ""; }} />
          {pendingSource ? <div className="space-y-2 rounded-lg bg-[var(--glass-control)] p-3"><p className="text-xs">Use this image as…</p><img src={thumbnailUrl(assetMediaUrl(projectId, pendingSource), 320)} decoding="async" alt="Selected Library image" className="h-24 object-contain" /><div className="flex flex-wrap gap-2">{supportedRoles.filter(r => !MEDIA_ROLES.includes(r)).map(role => <button key={role} className={button} onClick={() => { putReference({ role, source: pendingSource, label: pendingSource.split("/").pop()! }); setPendingSource(null); }}>{referenceLabel(role)}</button>)}<button className={button} onClick={() => setPendingSource(null)}>Cancel</button></div>{!supportedRoles.length ? <p className="text-xs">This model uses a prompt only.</p> : null}</div> : null}
          <div className="grid grid-cols-2 items-start gap-2">{pool ? poolCards(pool) : supportedRoles.filter(role => slotRole(role) || draft.references.some(r => r.role === role)).flatMap(referenceCards)}</div>
          {picking ? <ReferencePicker key={`${picking.role}-${picking.index ?? "new"}`} projectId={projectId} kind={picking.role === "motion" || picking.role === "source" ? "videos" : "stills"} title={`Choose the ${slotNoun(picking.role)}`}
            onCancel={() => setPicking(null)} onPick={reference => { putReference({ role: picking.role, ...reference }, picking.index); setPicking(null); void refresh(); onLibraryChanged(); }} /> : null}
          {!pool && supportedRoles.some(role => !slotRole(role) && !draft.references.some(r => r.role === role)) ? <div><button className={button} aria-expanded={extraReferences} onClick={() => setExtraReferences(v => !v)}><PlusIcon size={14} />Add reference</button>{extraReferences ? <div className="mt-2 flex flex-wrap gap-2">{supportedRoles.filter(role => !slotRole(role) && !draft.references.some(r => r.role === role)).map(role => <Fragment key={role}>{slotMenu(role, <button type="button" className={button} aria-pressed={isPicking(role)}>{referenceLabel(role)}</button>)}</Fragment>)}</div> : null}</div> : null}
          {!supportedRoles.length ? <p className="text-xs text-[var(--ink-muted)]">This model uses a prompt only.</p> : null}
          {incompatible.length ? <div role="alert" className="text-xs text-[var(--proposal-warning)]">Not supported by {model.name}:{[...new Set(incompatible.map(r => r.role))].map(role => <button key={role} className={button} onClick={() => update({ references: draft.references.filter(v => v.role !== role) })}>Remove {referenceLabel(role)}</button>)}</div> : null}
        </section>}
        {recentPrompts.length > 0 ? <div className="-mb-3 flex justify-end">
          <ActionMenu trigger={<Button variant="ghost" size="sm"><HistoryIcon />Recent prompts</Button>}>
            {recentPrompts.map(prompt => <ActionMenuItem key={prompt} onClick={() => update({ prompt })}><span className="line-clamp-2 max-w-80">{prompt}</span></ActionMenuItem>)}
          </ActionMenu>
        </div> : null}
        {/* The model and output settings sit inside the prompt box, so the prompt, its settings and Generate read as one unit. */}
        {/* A voice-designing model reads a prompt; the others speak the script word for word. */}
        <GenerationPrompt value={draft.prompt} onChange={prompt => update({ prompt })} label={draft.task === "music" ? "Style" : draft.task === "speech" && !model.speech?.promptVoice ? "Script" : "Prompt"}
          placeholder={draft.task === "music" ? "Genre, mood, voice and instruments…" : draft.task === "speech" ? model.speech?.promptVoice ? "Who speaks, how, and what they say…" : "What the voice says…" : draft.task === "recast" ? "Who becomes whom, and what else to keep or change…" : isImageTask(draft.task) ? "Describe the picture, its style, and what should stay the same…" : undefined}
          character={draft.route === "fal" && (model.adapter === "kling" || model.adapter === "motion") && draft.references.some(r => r.role === "subject")}
          footer={<OutputChips draft={draft} update={update} moreOpen={advancedOpen} onMoreChange={setAdvancedOpen}
            leading={<div className="flex min-w-0 items-center gap-1">
              {draft.task === "speech" ? voices.length ? <VoicePicker modelId={model.id} voices={voices} value={draft.voice} onChange={voice => update({ voice })} copying={copyingVoice} />
                : <span className={`${CHIP_TRIGGER} pointer-events-none text-[color:var(--ink-secondary)]`}>{copyingVoice ? "Your clip's voice" : model.speech?.promptVoice ? "Voice from the prompt" : "Its own voice"}</span> : null}
              <ModelPicker key={sectionOf(draft.task)} choices={modelChoices} value={model.id} onChange={selectModel} unavailable={unavailableModel ? { name: model.name } : undefined} />
            </div>} />} />
        {draft.route === "fal" && model.speech?.delivery ? <GenerationPrompt id="asset-generation-delivery" label="Delivery" value={draft.delivery ?? ""} onChange={delivery => update({ delivery })} character={false} placeholder="Warm and unhurried, smiling…" /> : null}
        {draft.route === "fal" && model.lyrics ? <GenerationPrompt id="asset-generation-lyrics" label="Lyrics" value={draft.lyrics ?? ""} onChange={lyrics => update({ lyrics })} character={false} placeholder="[verse] … [chorus] …" /> : null}
        {draft.route === "fal" && advancedOpen ? <ModelSettings draft={draft} onChange={settings => update({ settings })} /> : null}
        <div className="space-y-3">
          {unavailableModel ? <p role="alert" className="text-xs text-[var(--proposal-warning)]">{cloudUnavailableMessage(model.name)}</p>
            : inputError && draft.prompt.trim() ? <p className="text-xs text-[var(--ink-muted)]">{inputError}</p> : null}
          {draft.route === "fal" && generationCheck?.readiness === "sign_in" && !cloudAccount.account?.pending
            ? <button type="button" onClick={() => void cloudAccount.act("sign_in")} disabled={cloudAccount.busy} className={primaryAction}><LogInIcon size={16} />Sign in or create account</button>
            : draft.route === "fal" && generationCheck?.readiness === "buy_credits"
              ? <a href={BUY_CREDITS_URL} target="_blank" rel="noopener noreferrer" className={primaryAction}><CoinsIcon size={16} />Buy credits</a>
              : <button type="button" onClick={submit} disabled={!loaded || busy || Boolean(inputError) || incompatible.length > 0 || (draft.route === "fal" && generationCheck?.readiness !== "ready")} className={primaryAction}>{busy ? <LoaderCircleIcon size={16} className="animate-spin" /> : <SparklesIcon size={16} />}Generate</button>}
          {draft.route === "fal" && !unavailableModel && !inputError ? <GenerateAccountLine check={generationCheck} pending={Boolean(cloudAccount.account?.pending)} signInUrl={cloudAccount.signInUrl} accountError={cloudAccount.error} /> : null}
        </div>
      </div> : <div className="space-y-4">
        {!state?.jobs.length ? <div className="rounded-xl border border-dashed border-[var(--edge-outline)] p-10 text-center text-sm text-[var(--ink-muted)]">No results yet</div> : <>
          {state.jobs.slice(0, visibleJobs).map(activeJob => <Fragment key={activeJob.id}>
            {!activeJob.outputs.length ? <div className="space-y-3 rounded-xl border border-[var(--edge-outline)] bg-[var(--glass-control)] p-4">
              <p className="text-sm text-[var(--ink-muted)]">{activeJob.request.route === "fal" ? getAssetModel(activeJob.request).name : "GPT Image"} · {activeJob.request.task === "speech" ? "Voiceover" : `${activeJob.request.duration}s · ${activeJob.request.resolution ?? activeJob.request.aspect}`}{activeJob.quote?.kind === "credits" ? ` · ${credits(activeJob.quote.credits)}` : ""}</p>
              <GenerationProgress job={activeJob} action={
                ["queued", "running", "submitting"].includes(activeJob.status) && !activeJob.cloud?.cancelRefused ? <button disabled={busy || activeJob.cancelRequested} className={button} onClick={() => jobAction(activeJob, { action: "cancel" })}>{activeJob.cancelRequested ? "Cancellation requested" : "Cancel"}</button> : undefined
              } />
              {activeJob.error ? <p role="alert" className="text-sm text-red-400">{activeJob.error}</p> : null}
              <div className="flex items-center gap-3 text-sm">
                {canResumeAssetJob(activeJob) ? <button disabled={busy} className={button} onClick={() => jobAction(activeJob, { action: "resume" })}>{activeJob.status === "uncertain" ? "Check again" : activeJob.cloud?.insufficientCredits ? "Try again" : "Resume same request"}</button> : null}
                {activeJob.cloud?.insufficientCredits && activeJob.status === "failed" ? buyCreditsLink : null}
              </div>
            </div> : null}
          </Fragment>)}
          <MediaGallery targetHeight={260} minCardWidth={180} gap={12}>
            {state.jobs.slice(0, visibleJobs).flatMap(job => job.outputs.map(output => <OutputCard
              key={`${job.id}/${output.id}`} job={job} projectId={projectId} output={output} busy={busy}
              onReuse={() => { setWorkspace(w => ({ ...w, draft: { ...job.request, parentJobId: job.id, marks: w.draft.marks } })); setPane("create"); }}
              onUseAsReference={() => applyAsReference(job, output)}
              inChat={resultSelection.selectedIds.has(`result:${job.id}/${output.id}`)} onToggleChat={resultSelection.sendsToChat ? () => toggleResultInChat(job, output) : undefined}
              onKeep={() => jobAction(job, { action: "keep", outputId: output.id })}
            />))}
          </MediaGallery>
          {visibleJobs < state.jobs.length ? <button type="button" className={`${button} w-full`} onClick={() => setVisibleJobs(count => count + RESULTS_BATCH_SIZE)}>Show more results ({state.jobs.length - visibleJobs} remaining)</button> : null}
        </>}
      </div>}
    </div>
  </>;
  if (docked) return <section aria-label="Generate" data-testid="asset-generation-docked" className="editor-chrome flex min-h-0 min-w-0 flex-1 flex-col">{content}</section>;
  return inline
    ? <section aria-label="Generate assets" aria-hidden={!open} inert={!open} data-testid="asset-generation-inline" className="editor-chrome min-h-0 min-w-0 flex-1 flex-col" style={{ display: open ? "flex" : "none" }}>{content}</section>
    // Portaled to the page so it sits flush under the app header, never inside another drawer's transformed box.
    : portalReady ? createPortal(<SlideOutDrawer open={open} onClose={onClose} label="Create assets" width="min(480px, calc(100vw - 16px))" testId="asset-generation-drawer">{content}</SlideOutDrawer>, document.body) : null;
}

// Disabled reads as a quiet raised control rather than a dimmed blue, so a ready Generate is unmistakable.
const primaryAction = "flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-transparent bg-[var(--proposal-action)] px-4 py-2.5 text-sm font-semibold text-[var(--proposal-action-ink)] outline-none hover:bg-[var(--proposal-action-hover)] focus-visible:ring-3 focus-visible:ring-[var(--chrome-focus-ring)]/35 disabled:cursor-not-allowed disabled:border-[var(--edge-outline)] disabled:bg-[var(--glass-control)] disabled:text-[var(--ink-muted)]";

/** One line above the DreamCut Generate action: what it costs, the balance, or what to do first. */
function GenerateAccountLine({ check, pending, signInUrl, accountError }: { check: GenerationCheck | null; pending: boolean; signInUrl: string | null; accountError: string }) {
  const line = "flex min-h-5 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-[var(--ink-muted)]";
  const cost = (quote: GenerationCheck["quote"]) => <span className="text-[var(--ink-secondary)]">{quote ? `Costs ${credits(quote.credits)}` : "Uses credits"}</span>;
  if (pending) return <p role="status" className={line}><span>Finish signing in in your browser</span>
    {signInUrl ? <a className="font-medium text-[var(--ink)] underline underline-offset-2" href={signInUrl} target="_blank" rel="noopener noreferrer">Open sign-in page</a> : null}</p>;
  if (accountError) return <p role="alert" className={line}>{accountError}</p>;
  // Same line and height while the price loads, so the footer does not jump.
  if (!check) return <p role="status" aria-busy="true" className={line}><span>Costs … credits</span></p>;
  if (check.readiness === "price_unavailable") return <p role="alert" className={line}>Price unavailable · {check.message}</p>;
  if (check.readiness === "sign_in") return <p role="status" className={line}>{cost(check.quote)}</p>;
  if (check.readiness === "buy_credits") return <p role="status" className={line}>{cost(check.quote)}<span className="text-[var(--proposal-warning)]">Balance {credits(check.balance ?? 0)} · not enough</span></p>;
  // The balance in generations like this one, which is what a creator weighs when choosing a model or length.
  const runs = check.quote && check.balance !== null && check.quote.credits > 0 ? Math.floor(check.balance / check.quote.credits) : null;
  return <p role="status" className={line}>{cost(check.quote)}<span className="flex items-center gap-3"><span>{check.balance === null ? "Balance —" : `${credits(check.balance)} left${runs !== null ? ` · enough for ${runs.toLocaleString()} like this` : ""}`}</span>{buyCreditsLink}</span></p>;
}

function ResultVideo({ src, label }: { src: string; label: string }) {
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="flex flex-col items-center gap-3 p-6 text-sm text-[var(--ink-secondary)]">
    <span role="alert">This video could not load.</span>
    <Button variant="outline" size="sm" onClick={() => { setRetry(n => n + 1); setFailed(false); }}>Retry video</Button>
  </div>;
  // The shared transport: drag the scrubber to the frame you want to mark.
  return <SourceVideoPlayer key={retry} src={retry ? `${src}?retry=${retry}` : src} label={label} onError={() => setFailed(true)} />;
}

/** One result: the media, one line of facts, the next actions; details on request. */
function OutputCard({ projectId, output, job, busy, onKeep, onReuse, onUseAsReference, inChat, onToggleChat }: {
  projectId: string; output: AssetOutput; job: AssetJob; busy: boolean; onKeep: () => void; onReuse: () => void;
  onUseAsReference: () => void; inChat: boolean; onToggleChat?: () => void;
}) {
  const context = resultContext(job);
  const [showDetails, setShowDetails] = useState(false);
  const modelName = job.request.route === "fal" ? getAssetModel(job.request).name : "GPT Image";
  return <article className="overflow-hidden rounded-xl border border-[var(--edge-outline)] bg-[var(--glass-control)]">
    {output.kind === "audio" ? <div className="p-3 pb-0"><audio controls preload="metadata" src={assetMediaUrl(projectId, output.source)} aria-label={`${modelName} result`} className="w-full" /></div>
      : <MarkableMedia source={output.source}>{output.kind === "image"
      ? <img data-media-preview src={assetMediaUrl(projectId, output.source)} alt={output.annotation ?? "Generated image"} className="block h-auto w-full bg-black/20 object-contain" />
      : <ResultVideo src={assetMediaUrl(projectId, output.source)} label={`${modelName} result`} />}</MarkableMedia>}
    <div className="space-y-2 p-3">
      <div className="flex min-w-0 items-center gap-2 text-xs text-[var(--ink-muted)]">
        <span className="min-w-0 truncate">{modelName} · {output.kind === "video" ? job.request.task === "recast" ? "Recast video" : `Video ${job.request.duration}s` : output.kind === "audio" ? job.request.task === "speech" ? "Voiceover" : "Song" : "Image"}{output.kind === "audio" ? "" : ` · ${job.request.aspect}`}</span>
        {output.keptSource ? <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[var(--proposal-positive)]"><CheckIcon size={13} />In Library</span> : null}
      </div>
      {/* Fixed-size actions so narrow cards never push controls out of view. */}
      <div className="flex min-w-0 items-center gap-1">
        {!output.keptSource ? <Button variant="ghost" size="sm" className="min-w-0" title="Keep in Library" disabled={busy} onClick={onKeep}><PlusIcon aria-hidden="true" /><span className="truncate">Keep</span></Button> : null}
        <span className="flex-1" />
        {onToggleChat ? <Button variant="ghost" size="icon-sm" aria-pressed={inChat} aria-label={inChat ? "Remove from chat" : "Add to chat"} title={inChat ? "Remove from chat" : "Add to chat"}
          className={inChat ? "bg-[var(--chrome-selected-bg)] text-[var(--ink)]" : undefined} onClick={onToggleChat}><MessageSquarePlusIcon /></Button> : null}
        <ActionMenu trigger={<Button variant="ghost" size="icon-sm" aria-label="More for this result"><MoreHorizontalIcon /></Button>}>
          <ActionMenuItem icon={<ImagePlusIcon />} onClick={onUseAsReference}>Use as reference</ActionMenuItem>
          <ActionMenuItem icon={<CopyIcon />} onClick={onReuse}>Reuse settings</ActionMenuItem>
          <ActionMenuItem icon={<InfoIcon />} onClick={() => setShowDetails(value => !value)}>{showDetails ? "Hide details" : "Show details"}</ActionMenuItem>
        </ActionMenu>
      </div>
      {showDetails ? <>
        <div className="space-y-3 break-words pt-2 text-xs text-[var(--ink-muted)]">
          <p>{modelName} · {STATUS[job.status]}</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            {output.kind === "video" ? <div><dt>Duration</dt><dd className="mt-1 text-[var(--ink)]">{job.request.duration}s requested</dd></div> : null}
            {context.resolution ? <div><dt>Resolution</dt><dd className="mt-1 text-[var(--ink)]">{context.resolution}</dd></div> : null}
            <div><dt>Created</dt><dd className="mt-1 text-[var(--ink)]">{new Date(job.createdAt).toLocaleString()}</dd></div>
            {output.kind === "video" ? <div><dt>Sound</dt><dd className="mt-1 text-[var(--ink)]">{job.request.audio ? "Included" : "Off"}</dd></div> : null}
            {context.rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="mt-1 text-[var(--ink)]">{value}</dd></div>)}
            {job.quote?.kind === "credits" ? <div><dt>Price</dt><dd className="mt-1 text-[var(--ink)]">{credits(job.quote.credits)}</dd></div>
              : job.quote ? <div><dt>Estimated cost</dt><dd className="mt-1 text-[var(--ink)]">${job.quote.usd.toFixed(3)}</dd></div> : null}
          </dl>
          {job.request.prompt.trim() ? <section><h4 className="mb-2 font-medium text-[var(--ink)]">{job.request.task === "music" ? "Style" : job.request.task === "speech" && !getAssetModel(job.request).speech?.promptVoice ? "Script" : "Prompt"}</h4><p className="whitespace-pre-wrap leading-relaxed">{job.request.prompt}</p></section> : null}
          {job.request.lyrics?.trim() ? <section><h4 className="mb-2 font-medium text-[var(--ink)]">Lyrics</h4><p className="whitespace-pre-wrap leading-relaxed">{job.request.lyrics}</p></section> : null}
          {job.references.length ? <section><h4 className="mb-2 font-medium text-[var(--ink)]">References</h4><div className="grid grid-cols-2 gap-3">{job.references.map((r, i) => <a key={`${r.role}-${i}`} href={assetMediaUrl(projectId, r.source)} target="_blank" rel="noreferrer" className="min-w-0 space-y-1">
            <span className="block font-medium">{modelReferenceLabel(job.request, r.role)}</span>
            {r.role === "motion" || r.role === "source" ? <img loading="lazy" decoding="async" src={thumbnailUrl(assetMediaUrl(projectId, r.source), 320, r.window?.start)} alt={r.label} className="block h-auto w-full max-w-24 rounded object-contain" /> : r.role === "audio" ? <audio controls preload="metadata" src={assetMediaUrl(projectId, r.source)} className="w-full" /> : <img loading="lazy" decoding="async" src={thumbnailUrl(assetMediaUrl(projectId, r.source), 320)} alt={r.label} className="block h-auto w-full max-w-24 rounded object-contain" />}
            <span className="block break-words">{r.label}{r.window ? ` · ${r.window.start}–${r.window.end}s` : ""}</span>
          </a>)}</div></section> : null}
          {context.negativePrompt ? <section><h4 className="mb-2 font-medium text-[var(--ink)]">Negative prompt</h4><p className="whitespace-pre-wrap">{context.negativePrompt}</p></section> : null}
        </div>
      </> : null}
      {job.error ? <p role="alert" className="text-sm text-[var(--destructive)]">{job.error}</p> : null}
    </div>
  </article>;
}

