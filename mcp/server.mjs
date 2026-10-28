#!/usr/bin/env node
/**
 * Timeline Editor MCP server — the typed tool surface for coding agents.
 *
 * Wraps the local editor's HTTP API (the same endpoints the GUI uses), the
 * proposals surface, bounded net-new assembly/audition creation, and the safe read
 * instruments as MCP tools, so agents edit through reusable safe-write paths
 * instead of writing one-off mutation scripts (AGENTS.md "No new one-off
 * mutation scripts").
 *
 * Every mutation here snapshots `history/` server-side and reconciles into an
 * open editor as one visible Undo entry via the external-write bridge.
 *
 * Deliberately NOT exposed: render/export/verify. Rendering is delivery, not
 * review — it stays behind an explicit human request (AGENTS.md "Stop before
 * rendering").
 *
 * Zero dependencies. Transport: newline-delimited JSON-RPC over stdio.
 *   node mcp/server.mjs             # serve
 *   node mcp/server.mjs --catalog   # print the machine-readable tool catalog
 *
 * Env: TIMELINE_EDITOR_BASE_URL (default http://127.0.0.1:3123).
 */

import { LOCAL_MEDIA_INSTRUCTIONS, LOCAL_MEDIA_TOOLS, assertLocalMediaCall, localMediaResult, localMediaFailure } from "./local-media-policy.mjs";
const localMediaOnly = process.argv.includes("--local-media-only");

import { createToolSelection, queryCatalog, recipeCompileRequest, catalogFingerprint, catalogError, TEMPLATES_UNAVAILABLE_MESSAGE } from "./capability-catalog.mjs";
import { createHash, randomUUID } from "node:crypto";
import { capText, dispatchTool, httpFailure, scriptFailure, toolFailure } from "./tool-runtime.mjs";
import { issueFieldNotes, unknownFieldHints } from "./argument-errors.mjs";
import { argumentsRejectedSignal, capabilityGapSignal, catalogSearchSignal, generationDraftedSignal, proposalStagedSignal, selectionReadSignal, sendSignal, toolRefusedSignal } from "./product-signals.mjs";
import { createAutoProposalWork } from "./proposal-work-auto.mjs";
import { instrumentArgs, instrumentResult } from "./instrument-args.mjs";

import {visualAnalyze} from "./visual-analysis-bridge.mjs";
import { AsyncLocalStorage } from "node:async_hooks";
import { runLocalEditorScript } from "./local-script-runner.mjs";
import path from "node:path";
import fs from "node:fs";
import readline from "node:readline";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  PLAYABLE_MEDIA_TYPES,
  assertSemanticTrimOperations,
  buildSourceTrimPatch,
  createElementFromSourceWindow,
} from "./source-window.mjs";
import {
  AGENT_WORKSPACE_ONLY_MCP_TOOLS,
  HUMAN_ONLY_AGENT_MCP_TOOLS,
  assertAgentMcpToolAllowed,
  withAgentWriteLease,
  agentToolAvailability,
} from "./proposal-gate.mjs";
import { readEnv } from "./env-name.mjs";
import { compactProposalInputSchema } from "./compact-proposal-schema.mjs";

const MCP_SESSION_ID = randomUUID();
// Product signals name their client; the desktop harness sets this when it spawns the server.
const SIGNAL_CLIENT = process.env.DREAMCUT_MCP_CLIENT === "dreamcut-harness" ? "dreamcut-harness" : "mcp-direct";
const signal = built => { void sendSignal(body => http("POST", "/api/agent/product-signals", body), built); };
/** The agent app that connected (initialize clientInfo.name), for authorship of what it records. */
let connectedClient = null;
const clientName = () => connectedClient;
const signalContext = projectId => ({ sessionId: MCP_SESSION_ID, client: SIGNAL_CLIENT, projectId });
// proposal_create and motion_graphic_prepare time themselves so phase evidence does not depend on the agent.
const autoProposalWork = createAutoProposalWork({ sessionId: MCP_SESSION_ID,
  post: (projectId, body) => http("POST", `/api/projects/${encodeURIComponent(projectId)}/timeline/proposals/work`, body) });
import { desktopServiceAuth } from './desktop-service-auth.mjs';
import { libraryRequired, projectsRootFor } from './projects-root.mjs';
import { autostartEditorConnection, signInUrl } from './editor-runtime.mjs';
const BASE_URL = (process.env.TIMELINE_EDITOR_BASE_URL ?? "http://127.0.0.1:3123").replace(/\/$/, "");
/**
 * The editor this server talks to. An explicit TIMELINE_EDITOR_BASE_URL (development, desktop host) wins.
 * Under `dreamcut mcp` (DREAMCUT_EDITOR_AUTOSTART=1) the editor is started or reused on first need, so
 * agent clients never wait for it at connection time.
 */
const fixedEditor = process.env.TIMELINE_EDITOR_BASE_URL || process.env.DREAMCUT_EDITOR_AUTOSTART !== "1"
  ? Promise.resolve({ base: BASE_URL, auth: desktopServiceAuth(BASE_URL, process.env.DREAMCUT_MCP_SERVICE_TOKEN), runtime: process.env.DREAMCUT_MCP_SERVICE_TOKEN ? { origin: BASE_URL, token: process.env.DREAMCUT_MCP_SERVICE_TOKEN } : null })
  : null;
// Read the origin per use: an owned editor that updates restarts in place and records where it listens.
const autostartEditor = fixedEditor ? null : autostartEditorConnection({ describe: runtime => ({ get base() { return runtime.origin; }, auth: desktopServiceAuth(runtime.origin, runtime.token), runtime }) });
/** Run `send` against the editor; an autostarted editor that went away is started or reused again. */
const withEditor = send => {
  const guarded = connection => {
    if (localMediaOnly) {
      const url = new URL(connection.base);
      if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password) throw new Error("Local-media mode requires loopback.");
    }
    return send(connection);
  };
  return fixedEditor ? fixedEditor.then(guarded) : autostartEditor.request(guarded);
};
const EDITOR_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/**
 * Shipped with the server so any agent, whatever its own instruction file, keeps the editor in front of the
 * creator. An installed DreamCut (`dreamcut mcp`) starts its own editor on a port chosen per launch behind a
 * sign-in link, so its instructions name editor_open and returned links, never a fixed address.
 */
const AUTOSTART_PRESENCE_INSTRUCTIONS =
  `Keep the DreamCut editor open in front of the creator whenever you work on a project. DreamCut starts its own editor: `
  + `call editor_open (with project_id once the project is known) and open the single-use sign-in url it returns in your built-in browser `
  + `(Claude Code: the Browser pane; Codex or Cursor: their browser) or give it to the creator to open; editor_open never opens a browser itself. `
  + `The editor's address changes each launch, so never guess a port: use the urls DreamCut returns. Tool results with review_url also return `
  + `sign_in_url, a single-use link to the same page for a browser that is not signed in yet. Before ending a turn that refers to a project, call `
  + `editor_context_get with its project_id; if project_shown.showing is false, call editor_open for it and open or share the link. `
  + `Opening or viewing the editor never approves, generates or applies anything.`;
const SKILL_INSTRUCTIONS = ` DreamCut's skills are in capability_catalog (search, or get skill:<name>): read skill:dreamcut-proposals before `
  + `changing an existing timeline and skill:editorial-assembly before building a new edit; a template names its own skill. `
  + `The creator's My Style comes with every timeline_get (editing_context.preferences): apply each matching preference before you choose a look, caption style, pace or treatment, and name the one you followed in the card's assumptions. Only the creator's current request overrides it. `
  + `Always use generate_media to generate media: whenever the creator asks for an image, video, song or voiceover ("make an image of…", "animate this photo", "read this script") and has not selected a Look or Template for it, draft it with generate_media, open its review_url so they see the prompt, model and settings in DreamCut's Generate form, and tell them the price. Drafting is the default: generate only when the creator says to (their own words approving it), never because they asked for the media. A selected Look or Template, or a request to draw or build it, means build it with that look or template through its skill (read the selection with editor_context_get first); offer generation only when the creator asks for it. `
  + `To make imported footage searchable (video_search), describe it yourself: media_describe plan, look at the frames with source_evidence, then media_describe record. Import analysis by another model runs only when its owner turned it on.`;
const EDITOR_PRESENCE_INSTRUCTIONS = autostartEditor ? AUTOSTART_PRESENCE_INSTRUCTIONS + SKILL_INSTRUCTIONS :
  `Keep the DreamCut editor open in front of the creator whenever you work on a project. `
  + `Check that ${BASE_URL} answers; if it does not, start it yourself: run \`pnpm editor\` in ${EDITOR_ROOT} with your preview/launch tool `
  + `(Claude Code: add a launch configuration for it and preview_start it; otherwise a background terminal), wait until it answers, then continue; `
  + `it serves the stable build and rebuilds first when editor code changed, which can take several minutes. `
  + `Open ${BASE_URL}/p/<project_id> in your built-in browser (Claude Code: the Browser pane) as soon as the project is known, and navigate it again `
  + `when the project changes or a tool returns review_url (proposals, Generate drafts and results): open that URL so the creator sees what is ready. `
  + `Before ending a turn that refers to a project, call editor_context_get with its project_id; if project_shown.showing is false, open the project (or the review_url you are pointing at) in your built-in browser. `
  + `End every such reply with a link to it: [<project title>](${BASE_URL}/p/<project_id>). `
  + `Opening or viewing the editor never approves, generates or applies anything.` + SKILL_INSTRUCTIONS;
/**
 * Absolute review links on the editor actually running: a development server's fixed address, or an installed
 * editor's per-launch origin plus a single-use sign-in link to the same page.
 */
async function reviewLinks(reviewPath) {
  return withEditor(async ({ base, runtime }) => {
    if (!runtime) return { review_url: `${base}${reviewPath}` };
    try { return { review_url: `${base}${reviewPath}`, sign_in_url: (await signInUrl(runtime, reviewPath)).url }; }
    catch { return { review_url: `${base}${reviewPath}` }; }
  });
}
/**
 * Subject tracing lives in TIMELINE_MATTING_DIR (an installed runtime's app data) or the checkout's .matting.
 * The installer (scripts/setup-matting.mjs) runs detached, so it outlives this session; its log is the status.
 */
async function mattingSetup(action) {
  // Loaded on use: the server also runs where the installer scripts are absent.
  const { MARKER: MATTING_MARKER, PACKAGES: MATTING_PACKAGES } = await import("../scripts/matting/environment.mjs");
  const dir = path.resolve(EDITOR_ROOT, process.env.TIMELINE_MATTING_DIR ?? ".matting");
  const log = path.join(dir, "setup.log"), pidFile = path.join(dir, "setup.pid");
  // Ready means installed by the current package list (an older environment lacks, for example, OpenCV).
  const marker = (() => { try { return JSON.parse(fs.readFileSync(path.join(dir, MATTING_MARKER), "utf8")); } catch { return null; } })();
  const ready = fs.existsSync(path.join(dir, "sam2.1_hiera_small.pt")) && JSON.stringify(marker?.packages) === JSON.stringify(MATTING_PACKAGES);
  // The installer removes its pid file when it exits; a pid left by a crash or reboot is trusted only while the log is fresh.
  const running = (() => { try { process.kill(Number(fs.readFileSync(pidFile, "utf8")), 0); return Date.now() - fs.statSync(log).mtimeMs < 20 * 60_000; } catch { return false; } })();
  const tail = () => { try { return fs.readFileSync(log, "utf8").trim().split("\n").slice(-3).join("\n"); } catch { return ""; } };
  if (action === "install" && !running && !ready) {
    fs.mkdirSync(dir, { recursive: true });
    const out = fs.openSync(log, "w");
    const child = spawn(process.execPath, [path.join(EDITOR_ROOT, "scripts", "setup-matting.mjs"), "--dir", dir, "--pid-file", pidFile], { cwd: EDITOR_ROOT, detached: true, stdio: ["ignore", out, out], env: process.env });
    fs.closeSync(out);
    child.unref();
    return { state: "installing", next: "Poll cutout_setup status every minute or so; it usually takes a few minutes." };
  }
  // setup-matting ends a failed run with this line; the venv may still exist, so it alone does not mean "needs_update".
  const lastRunFailed = /could not set up subject tracing/.test(tail());
  const state = ready && !running ? "ready" : running ? "installing" : lastRunFailed ? "failed"
    : fs.existsSync(path.join(dir, "venv")) ? "needs_update" : "not_installed";
  return { state, ...(state === "ready" ? {} : { log_tail: tail() }),
    ...(state === "not_installed" ? { next: "Ask the creator before the one-time download of about 1 GB, then call cutout_setup with action install." } : {}),
    ...(state === "failed" ? { next: "Tell the creator what log_tail says went wrong; retry install only after that is fixed." } : {}),
    ...(state === "needs_update" ? { next: "Call cutout_setup with action install to add the missing packages (a smaller download)." } : {}) };
}
/** Tools that can create a project; they need the creator's Library first (mcp/projects-root.mjs). */
const PROJECT_CREATING_TOOLS = new Set(["assembly_create", "audition_create", "media_import", "storyboard_draft", "storyboard_reference_draft"]);
function libraryNotConfigured() {
  const message = "DreamCut has no Library yet, so it has nowhere to keep projects. Ask the creator where to keep them "
    + "(library_status suggested_dir is the usual place), then call library_setup with action create and that dir, and retry.";
  return Object.assign(new Error(message), { toolError: { schema_version: 1, code: "LIBRARY_NOT_CONFIGURED", message, retryable: true, state_changed: false,
    recovery: { action: "library_setup", reason: "Create the Library where the creator chooses, then retry this call." } } });
}
/** Resolved per use, so a Library chosen while the server runs takes effect. */
const projectsDir = () => projectsRootFor(EDITOR_ROOT);
const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "timeline-editor", version: "1.0.0" };
// Supported output video shapes; mirrors TIMELINE_ASPECT_RATIO_VALUES in src/lib/aspect-ratios.ts.
const OUTPUT_ASPECT_RATIOS = ["9:16", "4:5", "1:1", "16:9"];
// The generated proposal contract (mcp/generate-proposal-schema.ts --write). It is re-read when the file
// changes, so an agent that extends the contract can propose the new field without restarting this server.
const PROPOSAL_SCHEMA_PATH = readEnv("PROPOSAL_SCHEMA_PATH") ?? fileURLToPath(new URL('./proposal-schema.json', import.meta.url));
let proposalSchemaStamp = fs.statSync(PROPOSAL_SCHEMA_PATH).mtimeMs;
const PROPOSAL_SCHEMA = JSON.parse(fs.readFileSync(PROPOSAL_SCHEMA_PATH, 'utf8'));
// The tool's top-level project_id fills proposal.project_id, so the published body does not demand it twice.
const proposalBodySchema = schema => ({ ...schema, required: (schema.required ?? []).filter(field => field !== "project_id") });

/**
 * The proposal body for a call: proposal.project_id defaults to the top-level project_id
 * (agents routinely send it only once) and must name the same project when both are given.
 */
/**
 * What an agent needs back from staging: the id, what each option will show as dials, and every
 * warning. The full card is saved and readable with proposal_get, so it is not echoed (a caption card
 * repeated every cue a third time).
 */
/** Indented JSON for readable results; a large one is sent compact so it costs fewer tokens. */
function resultText(result) {
  const text = JSON.stringify(result, null, 2);
  return text.length > 20_000 ? JSON.stringify(result) : text;
}

function compactProposalResult(result) {
  if (!result?.proposal_id || !result.proposal) return result;
  const review = new Map((result.review ?? []).map(item => [item.option_id, item]));
  const dial = (row, change) => `${row.element_label}: ${change.label} ${change.after}`;
  return {
    proposal_id: result.proposal_id, created_at: result.created_at, status: result.status, revision: result.revision, stale: result.stale,
    summary: result.proposal.summary,
    options: result.proposal.options.map(option => ({
      id: option.id, label: option.label, recommended: option.recommended, operations: option.operations?.length ?? 0,
      impact: review.get(option.id)?.impact,
      dials: (review.get(option.id)?.adjustment_rows ?? []).flatMap(row => row.changes.map(change => dial(row, change))).slice(0, 30),
      ...(option.dropped_review_controls?.length ? { dropped_review_controls: option.dropped_review_controls } : {}),
      ...(option.control_gaps?.length ? { control_gaps: option.control_gaps.length } : {}),
    })),
    spatial_review: (result.spatial_review ?? []).map(item => ({ option_id: item.option_id, introduced: item.summary?.introduced ?? 0,
      ...(item.speaker_clearance?.covered?.length ? { covers_speaker: item.speaker_clearance.covered } : {}),
      ...(item.pending_card_overlaps?.length ? { pending_card_overlaps: item.pending_card_overlaps } : {}) })),
    ...(result.dial_sweep?.failures?.length ? { dial_failures: result.dial_sweep.failures.map(item => `${item.label} (operation ${item.operation_index}) at ${item.value}: ${item.message}`) } : {}),
    ...(result.warnings?.length ? { warnings: result.warnings } : {}),
    full_card: `proposal_get with proposal_id ${result.proposal_id}`,
  };
}

function proposalForProject(project_id, proposal) {
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) return proposal;
  if (proposal.project_id == null) return { ...proposal, project_id };
  if (proposal.project_id === project_id) return proposal;
  const message = `proposal.project_id "${proposal.project_id}" does not match project_id "${project_id}". Omit proposal.project_id or make them the same project.`;
  throw Object.assign(new Error(message), { toolError: { schema_version: 1, code: "INVALID_ARGUMENTS", message, retryable: false, state_changed: false,
    recovery: { action: "fix_arguments", reason: "Name one project; nothing was sent to the editor." } } });
}

const PROJECT_ID = {
  type: "string",
  description: "Project id (the folder name under projects/)",
};
const EXPECTED_REVISION = {
  type: "string",
  description:
    "Optional optimistic-concurrency guard: sha256 of timeline.json at read time. "
    + "Send it whenever the edit was planned from a read; the API 409s if the timeline moved.",
};

/** name → { description, inputSchema, handler } */
const feedbackContext = new AsyncLocalStorage();
const FEEDBACK_IDS = { type: "array", maxItems: 100, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 300 } };

const TOOLS = {
  editor_open: {
    description: "Open the DreamCut editor for the creator. Starts the local editor if it is not running and returns a single-use sign-in link (valid about two minutes) to open in your built-in browser, or for the creator to open in any browser; it never opens a browser itself. Optionally lands on a project or its storyboard. The editor runs only on this computer (127.0.0.1); nothing is uploaded. Call again for a fresh link if one expires.",
    inputSchema: { type: "object", additionalProperties: false, properties: {
      project_id: { ...PROJECT_ID, description: "Optional project to open (the folder name under the Library's projects/). Omit for the projects home." },
      page: { type: "string", enum: ["timeline", "storyboard"], default: "timeline", description: "With project_id: timeline (the editor) or storyboard." },
    } },
    handler: async ({ project_id, page = "timeline" }) => {
      if (project_id !== undefined && !/^[A-Za-z0-9._-]{1,128}$/.test(project_id)) throw new Error("project_id must be a project folder name.");
      const next = project_id ? `/p/${encodeURIComponent(project_id)}${page === "storyboard" ? "/storyboard" : ""}` : "/";
      return withEditor(async ({ base, runtime }) => {
        if (!runtime) return { url: `${base}${next}`, sign_in: "not required (development server)" };
        const link = await signInUrl(runtime, next);
        return { url: link.url, expires_in_seconds: link.expires_in_seconds, single_use: true,
          opened: false, next_step: "Nothing was opened. Open url in your browser, or give it to the creator to open." };
      });
    },
  },
  library_status: {
    description: "Report where DreamCut keeps projects: the creator's DreamCut Library (a visible folder shared by every DreamCut app), any problem opening it, the suggested location, whether a development override pins the projects folder, older folders holding projects that could move in, and the current projects (id, title, last change; the 100 most recent, with project_count). Read-only. Call before library_setup, and to find a project the creator names.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    handler: () => http("GET", "/api/library"),
  },
  library_setup: {
    description: "Set up the creator's DreamCut Library when they ask. action=create makes a new Library in an empty folder (default: the suggested location from library_status) and saves the choice; action=use_existing chooses a folder that already is a Library; action=plan_migration lists the projects in an older folder that would move in, with sizes; action=migrate moves exactly the confirmed projects (same disk: renamed; another disk: copied and verified, originals kept; name conflicts skipped). Show the creator the plan and get their go-ahead before migrate. Never deletes projects. No timeline edits.",
    inputSchema: { type: "object", additionalProperties: false, properties: {
      action: { type: "string", enum: ["create", "use_existing", "plan_migration", "migrate"], description: "create, use_existing, plan_migration or migrate; see the tool description." },
      dir: { type: "string", minLength: 1, description: "Library folder for create (optional; defaults to the suggested location) or use_existing (required). Absolute path." },
      from: { type: "string", minLength: 1, description: "For plan_migration and migrate: the older projects folder, from library_status legacy_folders[].dir." },
      confirm: { type: "boolean", description: "For migrate: must be true, after the creator approved the plan." },
      project_ids: { type: "array", minItems: 1, maxItems: 10000, items: { type: "string", minLength: 1 }, description: "For migrate: the project ids from the plan the creator approved; projects not in the plan are refused." },
    }, required: ["action"] },
    handler: body => http("POST", "/api/library", body),
  },
  generate_media: {
    description: "Generate an image, video, music or a voiceover with DreamCut: \"make an image of…\", \"generate a video\", \"animate this photo\", \"turn this into a clip\", \"recast this video\", \"make a song\", \"voice this script\". Always use this to generate media. Draft by default; generate only when the creator says to. Paid with the creator's DreamCut credits (their DreamCut account; no API key). DreamCut routes each model to the service that runs it; never name a hosting service to the creator. Two calls. 1) Draft: kind, prompt and any references; it picks the best-quality model for the inputs unless the user names one, applies that model's recommended settings, and fills the Generate form with the prompt, model, references and settings (an open editor brings it up). It returns the model, price in credits, balance, readiness, a prompt_guide for that model, review_url and a draft_id. Rewrite the prompt by the guide and draft again if needed. Open review_url in the creator's editor so they see the draft. Never generates or charges. 2) The creator generates by clicking Generate, or by approving that model and price in chat: then call again with draft_id, project_id and approval (their own words); it generates once (repeating, or their own Generate click, returns the same job; if they edited the form since, it refuses with draft_changed: show the new draft and price), then use asset_generation_status to show results. Refuses without charging when the price changed (show the new one), they are signed out (give them sign_in_url) or short of credits (give them buy_credits_url). Without project_id, results go to the Generations project in the DreamCut Library; pass the open project's id when the user is working on one. References are files on this computer (absolute paths, copied in) or that project's media. Never places anything on a timeline.",
    inputSchema: { type: "object", additionalProperties: false, properties: {
      kind: { type: "string", enum: ["image", "video", "music", "speech"], description: "Draft: what to make. speech: a voiceover; prompt is the script, spoken word for word (seed-audio-1 reads a prompt that describes the voice instead)." },
      prompt: { type: "string", description: "Draft: what to generate, written by the model's prompt_guide. Optional for recast and for songs from lyrics." },
      model: { type: "string", description: "Draft: a model id when the user names one. Omit for the quality default. Image: gpt-image-2.5, nano-banana-2.1, nano-banana-2, nano-banana-pro, flux-2-pro, flux-kontext, flux-schnell. Video: seedance-2.5, h3-max-turbo, kling-3-pro, kling-3-standard, veo-3.1-fast, seedance-2, seedance-2-reference, seedance-2.5-reference, kling-3-motion, h3-max-recast, wan-2.2-replace, kling-o1-edit. Music: minimax-music-3, elevenlabs-music, mureka-song. Voiceover: elevenlabs-v4, gemini-3.8-tts, minimax-speech-2.8, mai-voice-2.1, fish-s2.1-pro, aura-2, heygen-voice-1, voxtral-tts-3, qwen-tts-3, grok-voice-1, seed-audio-1." },
      references: { type: "array", maxItems: 16, description: "Draft: pictures, clips or audio to use.", items: { type: "object", additionalProperties: false, properties: {
        path: { type: "string", description: "Absolute path of a file on this computer, or a media path inside project_id." },
        role: { type: "string", enum: ["start", "end", "subject", "style", "composition", "edit", "motion", "source", "audio"], description: "start/end: first or last frame. subject: a character or object to keep. edit: the image to change. source: a clip to recast. motion: a movement or reference video. audio: reference audio." },
        label: { type: "string", description: "Short name shown with the result, e.g. \"Maya front\"." },
        start: { type: "number", minimum: 0, description: "Video/audio only: first second to use (default 0)." },
        end: { type: "number", minimum: 0, description: "Video/audio only: second to stop at (default the end)." },
      }, required: ["path", "role"] } },
      aspect: { type: "string", enum: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"], description: "Shape. Default 16:9 for video, 1:1 for images." },
      duration: { type: "integer", minimum: 1, maximum: 300, description: "Video or music seconds." },
      resolution: { type: "string", description: "Model resolution, e.g. 1080P, 720p, 2K; voiceovers: best or fast. Omit for the quality default." },
      audio: { type: "boolean", description: "Video: generate sound." },
      count: { type: "integer", minimum: 1, maximum: 4, description: "Images per request." },
      lyrics: { type: "string", description: "Songs: words to sing, with [verse]/[chorus] tags, or [instrumental]." },
      voice: { type: "string", description: "Voiceover: a voice id the model offers (the draft names the model's default). Omit with an audio reference, whose voice is copied (fish-s2.1-pro, heygen-voice-1, seed-audio-1)." },
      delivery: { type: "string", description: "Voiceover, gemini-3.8-tts and fish-s2.1-pro only: tone, pace and accent, kept apart from the script (\"warm and unhurried\")." },
      project_id: { type: "string", description: "Draft: the project to generate into (omit for Generations). Approve: the project_id the draft returned." },
      draft_id: { type: "string", description: "Approve: the draft_id the creator approved." },
      approval: { type: "string", description: "Approve: the creator's own words approving this model and price, quoted from their message." },
    } },
    handler: body => http("POST", "/api/generate", body),
  },
  asset_generation_prepare: {
    description: "Fill the visible Image/Video generation form with a complete prompt, model, references and settings you choose yourself. For a new generation request use generate_media, which picks the recommended model and settings and fills this same form; use this tool to set fields generate_media does not (marks, model settings, reference windows) or to revise the draft in the form. Every model is a DreamCut model paid with the creator's DreamCut credits (their DreamCut account, no API key; which service runs a model is DreamCut's internal routing, never named to the creator). The result reports the price in credits (estimate) and generation_check: readiness ready, sign_in (give the creator sign_in_url as a chat link: dreamcut.io sign-in or free account creation, Google or email, then Connect; the draft stays), buy_credits (balance below the price; give them buy_credits_url), model_unavailable or incomplete, plus guidance. Does not generate, charge, upload, import outputs or change the timeline. It fills the Generate form in Library, which opens by itself in an open editor; review_url opens it directly. Then stop for review: generate only when the creator clicks Generate, or after they explicitly approve this draft in chat (then asset_generation_submit with their words and the returned staged_id). A request to prepare a draft is not approval to generate.",
    inputSchema: { type: "object", additionalProperties: false, properties: {
      project_id: PROJECT_ID,
      draft: { type: "object", description: "Asset draft: task image/edit/video/animate/motion/recast/music/speech; modelId; prompt; intent; references [{source: project-media-relative path, role, label, window for video/audio}]; aspect; duration seconds; resolution; count; audio; lyrics for songs; voice and delivery for voiceovers; optional model settings.", properties: {
        task: {type:"string", enum:["image","edit","video","animate","motion","recast","music","speech"]}, modelId:{type:"string",description:"Model. Video: seedance-2.5 (text or start/end frames, 4–30 s), kling-3-pro, kling-3-standard, veo-3.1-fast, seedance-2, h3-max-turbo. Reference video (images, videos and audio as @Image1, @Video1, @Audio1): seedance-2-reference (4–15 s), seedance-2.5-reference (4–30 s). Recast a source clip (task recast; output keeps the source's shape and length): h3-max-recast (5–30 s source, up to 4 subject photos replacing people left to right), wan-2.2-replace (one subject, cheapest), kling-o1-edit (3–10 s source, prompt edit, up to 4 subject images as @Image1…). Motion copy (task motion): kling-3-motion. Music (task music): minimax-music-3 (lyrics required; [instrumental] for none), mureka-song, elevenlabs-music (no lyrics). Voiceover (task speech; prompt is the script; resolution best or fast): elevenlabs-v4, gemini-3.8-tts, minimax-speech-2.8, mai-voice-2.1, fish-s2.1-pro, aura-2, heygen-voice-1, voxtral-tts-3, qwen-tts-3, grok-voice-1, seed-audio-1 (prompt describes the voice). Image: gpt-image-2.5 (resolution high or max is its quality), nano-banana-2.1, nano-banana-2, nano-banana-pro, flux-2-pro, flux-kontext, flux-schnell. Lip sync models are not sold with credits and are refused."}, prompt:{type:"string",description:"Required except for h3-max-recast, wan-2.2-replace and mureka-song (lyrics alone). Recast: who becomes whom, or what else to keep or change."}, intent:{type:"string"},
        references:{type:"array",maxItems:16,description:"Several references may share a role where the model allows (subject photos for recast and reference video).",items:{type:"object",properties:{source:{type:"string"},role:{type:"string",enum:["start","end","subject","style","composition","edit","motion","source","audio"],description:"source: the clip to recast or edit. motion: a reference or motion video. audio: reference audio."},label:{type:"string"},window:{type:"object",description:"Required for source, motion and audio references: the part to send, in seconds on that file's own clock. Only this part is uploaded and priced.",properties:{start:{type:"number",minimum:0,description:"First second to send."},end:{type:"number",minimum:0,description:"Second to stop at; after start."}},required:["start","end"]}},required:["source","role","label"]}},
        aspect:{type:"string",enum:["9:16","16:9","1:1","4:3","3:4","21:9"],description:"4:3, 3:4 and 21:9 are for the reference video models; recast follows its source."},duration:{type:"integer",description:"Output seconds; music length for minimax-music-3 and elevenlabs-music. Ignored where the output follows a source or motion video."},resolution:{type:"string"},count:{type:"integer"},audio:{type:"boolean",description:"Video sound. Motion copy and Kling O1: keep the source's sound. Music: always true."},lyrics:{type:"string",description:"Words to sing for minimax-music-3 or mureka-song, with section tags such as [verse] and [chorus]."},voice:{type:"string",description:"Voiceover voice id; omit when an audio reference is the voice to copy."},delivery:{type:"string",description:"Voiceover tone and pace, for gemini-3.8-tts and fish-s2.1-pro."},settings:{type:"object"}
      }, required:["task"] }
    }, required: ["project_id", "draft"] },
    handler: ({ project_id, draft }) => http("POST", `/api/projects/${encodeURIComponent(project_id)}/asset-generation/prepare`, { draft }),
  },
  asset_generation_submit: {
    description: "Generate the draft in the Generate form after the creator explicitly approved it in chat (for example \"yes, generate it\"). Use only with their own words of approval for the exact draft and price you last showed; a request to prepare or improve a draft is not approval, and never infer it. Submits exactly what is in the form now, including the creator's edits, and spends their DreamCut credits once (repeating the same approved draft returns the same job). Refuses without generating or charging when: approval is empty (approval_required); the form holds another staging (stale_draft) or changed since you last reported it (draft_changed: show the returned current draft and price, then ask again); the creator never had it open (not_viewed); they are signed out (sign_in, with sign_in_url to give them in chat); or credits are short (buy_credits, with price, balance and buy_credits_url). Returns the job; results arrive in Library and the Generate form's Results.",
    inputSchema: { type: "object", additionalProperties: false, properties: {
      project_id: PROJECT_ID,
      staged_id: { type: "string", description: "staged_id returned by asset_generation_prepare for the draft the creator approved." },
      approval: { type: "string", description: "The creator's verbatim words approving generation, quoted from their chat message. Stored with the job as the approval record." },
    }, required: ["project_id", "staged_id", "approval"] },
    handler: ({ project_id, staged_id, approval }) => http("POST", `/api/projects/${encodeURIComponent(project_id)}/asset-generation/submit`, { staged_id, approval }),
  },
  asset_generation_status: {
    description: "Show a generation request's results in chat: its status and each output as an actual image (an image as itself, a video as three frames), with output ids, sources and hashes. Use after asset_generation_submit or a Generate click to wait for and review results; the creator sees the same results in Generate › Results (review_url) — open it in their editor. Read-only: never generates, charges, keeps outputs into Library or changes the timeline. Job still running: call again with wait_seconds; never submit again to check on it.",
    inputSchema: { type: "object", additionalProperties: false, properties: {
      project_id: PROJECT_ID,
      job_id: { type: "string", description: "Job id from asset_generation_submit (job.id). Omit for the project's most recent request." },
      wait_seconds: { type: "integer", minimum: 0, maximum: 120, default: 0, description: "Seconds to wait for a running request to finish before answering (0 answers now). Video can take several minutes; call again to keep waiting." },
    }, required: ["project_id"] },
    handler: ({ project_id, ...body }) => http("POST", `/api/projects/${encodeURIComponent(project_id)}/asset-generation/results`, body),
  },
  assembly_create: {
    description:
      "Create one NEW autonomous editorial-assembly workspace from a script/brief and initial "
      + "source inventory. This is the first-build route: it refuses to overwrite any existing "
      + "project, records the immutable assembly brief, and grants direct timeline mutation only "
      + "until the first layout handoff or human edit. Call assembly_handoff before presenting the first layout. After creation, import/register the named sources, assemble "
      + "with the workspace mutation tools, verify the integrated result, and hand the editable "
      + "timeline to the human. Never use this to bypass proposal review on an existing project.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: PROJECT_ID,
        title: { type: "string" },
        objective: { type: "string", description: "Complete initial editing brief and desired outcome" },
        script_text: { type: ["string", "null"] },
        visual_directions: { type: "array", items: { type: "string" } },
        sources: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              role: { type: "string", enum: ["talking_head", "voice", "visual", "music", "sound_effect", "reference", "other"] },
              source_path: { type: ["string", "null"] },
              source_url: { type: ["string", "null"] },
              note: { type: ["string", "null"] },
            },
            required: ["label", "role"],
          },
        },
        source_project_id: { type: ["string", "null"] },
        copy_source_timeline: { type: "boolean", description: "Start from source_project_id's live cut (timeline, lane settings and referenced media, cloned without changing the source) instead of an empty timeline. Use for a format variant such as a vertical version of a finished edit, then reframe with the workspace tools." },
        delivery_target: { type: "string", enum: ["web", "feed", "reels", "tiktok", "shorts"] },
        output_aspect_ratio: { type: "string", enum: OUTPUT_ASPECT_RATIOS },
        frame_rate: { type: "integer", enum: [24, 25, 30, 50, 60], description: "Composition frames per second. Omit for 30. Choose 24 for film-style pacing, 25/50 for PAL delivery, 60 for smooth motion." },
      },
      required: ["project_id", "title", "objective"],
    },
    handler: request => http("POST", "/api/assembly-workspaces", {
      ...request,
      script_text: request.script_text ?? null,
      visual_directions: request.visual_directions ?? [],
      sources: (request.sources ?? []).map(source => ({ ...source, source_path: source.source_path ?? null, source_url: source.source_url ?? null, note: source.note ?? null })),
      source_project_id: request.source_project_id ?? null,
      delivery_target: request.delivery_target ?? "web",
      output_aspect_ratio: request.output_aspect_ratio ?? "16:9",
    }),
  },
  assembly_handoff: {
    description: "Call before presenting the first assembled layout for review, including an audition. Permanently closes direct editing authority; every later change requires proposal_create, even without a human edit. Idempotent; does not approve, export, or change timeline content. Refuses empty timelines. No reopen operation.",
    inputSchema: { type: "object", properties: { project_id: PROJECT_ID }, required: ["project_id"], additionalProperties: false },
    handler: ({ project_id }) => http("POST", `/api/projects/${encodeURIComponent(project_id)}/assembly`, { action: "handoff" }),
  },
  assembly_get: {
    description: "Read the durable brief and authority policy for an autonomous assembly workspace.",
    inputSchema: { type: "object", properties: { project_id: PROJECT_ID }, required: ["project_id"] },
    handler: ({ project_id }) => http("GET", `/api/projects/${project_id}/assembly`),
  },
  timeline_get: {
    description:
      "Read a project's full timeline state: elements, transitions, beats, lane summary, "
      + "lane order, muted lanes, and library_selection (creator-selected media, identities, names and URLs, plus items selected across the editor, including Templates). Selection is discussion context, not placement or approval. editing_context.preferences is the creator's My Style: apply the matching entries before choosing a look, caption style, pace or treatment. The starting point for any edit.",
    inputSchema: {
      type: "object",
      properties: { project_id: PROJECT_ID },
      required: ["project_id"],
    },
    handler: async ({ project_id }) => {
      const timeline = await http("GET", `/api/projects/${project_id}/timeline`);
      const editingContext = await http("GET", `/api/projects/${project_id}/memory?context=true`);
      return { ...timeline, editing_context: editingContext };
    },
  },
  beat_grid_get: {
    description: "Read a saved source rhythm map and its current clip-time projection: steady beats plus estimated drum, synth/tonal, and other hits. Never runs detection. Missing analysis returns null. Tempo and instrument labels are provisional; cuts still require proposals.",
    inputSchema: { type: "object", properties: { project_id: PROJECT_ID, element_id: { type: "string" } }, required: ["project_id", "element_id"] },
    handler: ({ project_id, element_id }) => http("GET", `/api/projects/${encodeURIComponent(project_id)}/timeline/beat-annotations?element_id=${encodeURIComponent(element_id)}`),
  },
  beat_annotation_prepare: {
    description: "Explicitly analyze a local audio/video source once and save a rhythm map with steady beats plus estimated drum, synth/tonal, and other hits. Reuses unchanged analysis. Does not edit the timeline, place markers as elements, or authorize cuts. Requires local librosa; sources up to 30 minutes.",
    inputSchema: { type: "object", properties: { project_id: PROJECT_ID, element_id: { type: "string" } }, required: ["project_id", "element_id"] },
    handler: ({ project_id, element_id }) => http("POST", `/api/projects/${encodeURIComponent(project_id)}/timeline/beat-annotations?element_id=${encodeURIComponent(element_id)}`, {}),
  },
  library_present: {
    description: "Show videos selected by the agent in an existing project's Library. Use video_search first, interpret the user's request, then pass imported video handles, source hashes and optional verified source-second matching moments. The open project reveals these results with previews; return library_url if its window is not open. This is a temporary display selection (24-hour expiry), not timeline placement, import, analysis, approval or export. Up to 24 handles; cross-project sources are supported. The creator can choose Browse all videos to dismiss it.",
    inputSchema: { type: "object", additionalProperties: false, properties: {
      project_id: PROJECT_ID, title: { type: "string", minLength: 1, maxLength: 200 }, note: { type: "string", maxLength: 2000 },
      items: { type: "array", minItems: 1, maxItems: 24, items: { type: "object", additionalProperties: false, properties: {
        project_id: PROJECT_ID, asset_id: { type: "string" }, source_sha256: { type: "string", pattern: "^[a-f0-9]{64}$" }, time_seconds: { type: "number", minimum: 0, description: "Optional verified sampled timestamp from video_search, in source seconds" },
      }, required: ["project_id", "asset_id", "source_sha256"] } },
    }, required: ["project_id", "title", "items"] },
    handler: ({ project_id, ...body }) => {
      if (typeof project_id !== "string" || !/^[a-zA-Z0-9._-]+$/.test(project_id) || [".", ".."].includes(project_id)) throw catalogError("INVALID_LIBRARY_PRESENTATION", "Choose an existing project id.");
      return http("POST", `/api/projects/${encodeURIComponent(project_id)}/library-presentation`, body);
    },
  },
  video_search: {
    description: "Find imported local videos by filename, subject, setting or visible action. Searches saved whole-span summaries and every timed frame description; returns source-second matching moments, sampled coverage, readiness and project references. Use project_id to scope one project; omit it to group identical sources across local projects. Supports beginning/ending modifiers (first/last quarter) and cats/cat. Keyword retrieval only: missing descriptions remain unknown. Read-only; does not run analysis, import, place footage or export. Paginate with offset and limit.",
    inputSchema: { type: "object", additionalProperties: false, properties: {
      query: { type: "string", maxLength: 500 }, project_id: PROJECT_ID,
      offset: { type: "integer", minimum: 0 }, limit: { type: "integer", minimum: 1, maximum: 100 },
    }, required: ["query"] },
    handler: (args) => {
      if (!args || typeof args !== "object" || Array.isArray(args)
        || Object.keys(args).some(key => !["query", "project_id", "offset", "limit"].includes(key))
        || typeof args.query !== "string" || args.query.length > 500
        || (args.project_id !== undefined && (typeof args.project_id !== "string" || !/^[A-Za-z0-9._-]{1,128}$/.test(args.project_id) || ['.', '..'].includes(args.project_id)))
        || (args.offset !== undefined && (!Number.isInteger(args.offset) || args.offset < 0))
        || (args.limit !== undefined && (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 100))) {
        throw catalogError("INVALID_VIDEO_SEARCH", "Supply a query up to 500 characters, optional project_id, offset >= 0, and limit 1–100.");
      }
      const params = new URLSearchParams({ q: args.query });
      for (const key of ["project_id", "offset", "limit"]) if (args[key] !== undefined) params.set(key, String(args[key]));
      if (args.limit === undefined) params.set("limit", "8");
      return http("GET", `/api/video-search?${params}`);
    },
  },
  media_describe: {
    description: "Describe imported videos yourself so video_search can find them; DreamCut does not describe footage with another model unless its owner turned that on. action plan lists each imported video in the project still without a description (or the named asset_id) with source_relative_path and the source times_seconds to inspect (one per second plus the ending). Look at those frames with source_evidence (up to 12 times per call), then action record with that asset_id, one frame per planned time in order (time_seconds, what you actually see, specific tags), a whole-clip summary and tags. Describe only what is visible; list uncertainties. Saves analysis only: no timeline edit, import or export.",
    inputSchema: { type: "object", additionalProperties: false, properties: {
      project_id: PROJECT_ID,
      action: { type: "string", enum: ["plan", "record"], default: "plan", description: "plan: which videos need describing and the times to look at. record: save one video's description." },
      asset_id: { type: "string", description: "The imported video (from media_import or plan). Required for record." },
      summary: { type: "string", maxLength: 4000, description: "Required for record: what the whole clip shows." },
      tags: { type: "array", maxItems: 50, items: { type: "string", maxLength: 100 }, description: "For record: subjects, setting and actions across the clip." },
      frames: { type: "array", maxItems: 10000, description: "For record: one entry per planned time, in order.", items: { type: "object", additionalProperties: false, properties: {
        time_seconds: { type: "number", minimum: 0, description: "A planned source time, in order." }, description: { type: "string", maxLength: 2000, description: "What is visible at that time." }, tags: { type: "array", maxItems: 24, items: { type: "string", maxLength: 100 }, description: "Specific subject, action and setting words." } },
        required: ["time_seconds", "description", "tags"] } },
      uncertainties: { type: "array", maxItems: 100, items: { type: "string", maxLength: 1000 }, description: "For record: anything you could not make out." },
    }, required: ["project_id"] },
    handler: ({ project_id, action = "plan", ...body }) => http("POST", `/api/projects/${encodeURIComponent(project_id)}/media-descriptions`,
      action === "plan" ? { action, ...(body.asset_id ? { asset_id: body.asset_id } : {}) } : { action, author: `agent:${clientName() ?? "unknown"}`, ...body }),
  },
  media_import: {
    description:
      "Import one or more local media files into a DreamCut project and record source "
      + "provenance and SHA-256 hashes. The default storage_mode is managed_copy: unchanged "
      + "bytes are copied into the project so Downloads or another temporary location can go "
      + "away safely. Use external_reference only when the user explicitly identifies another "
      + "location as the source of truth. Creates the empty project when it does not exist unless "
      + "create_if_missing is false; it does not place media on the timeline.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: PROJECT_ID,
        source_paths: { type: "array", minItems: 1, items: { type: "string" } },
        storage_mode: { type: "string", enum: ["managed_copy", "external_reference"] },
        create_if_missing: { type: "boolean" },
        title: { type: "string" },
        delivery_target: {
          type: "string",
          enum: ["web", "feed", "reels", "tiktok", "shorts"],
        },
      },
      required: ["project_id", "source_paths"],
    },
    handler: async (request) => {
      const normalized = {
        ...request,
        storage_mode: request.storage_mode ?? "managed_copy",
        create_if_missing: request.create_if_missing ?? true,
      };
      const encoded = Buffer.from(JSON.stringify(normalized), "utf8").toString("base64");
      const result = await runEditorScript("import-media", ["--request-base64", encoded]);
      if (result.exit_code !== 0) throw scriptFailure("media_import", result, "Media import failed");
      const lines = result.stdout.trim().split("\n").filter(Boolean);
      const imported = JSON.parse(lines.at(-1));
      const videos = (imported?.assets ?? []).filter(asset => /\.(mov|mp4|m4v|webm)$/i.test(asset?.media_path ?? asset?.original_filename ?? ""));
      return videos.length ? { ...imported, describe_footage: "To make these videos searchable, look at them yourself: media_describe action plan, then source_evidence and media_describe action record." } : imported;
    },
  },
  spatial_assess: {
    description: "Read spatial relationships for the current composition, or a proposal option. Always inspect visual_overlap independently of the outer caption status. It compares stills, videos, cutouts, graphics and captions across lanes. Each warning is one element-pair issue aggregated across pair-local samples; sample_count is evidence, not another issue. Full-canvas layers behind foreground and explicit backgrounds are measured but suppressed as expected; intersections below the material threshold remain measurements. Returns element types and IDs, sampled interval, peak overlap, layer order, footprint bounds/centroids, contact geometry, suppression counts, unknowns and truncation. For source-addressed binary-alpha annotations, alpha_relations classifies sampled pairs as disjoint, touching, or overlapping and separates subject-overlap pixels from sticker-border-involved pixels. Unannotated visible_shape remains unknown; caption estimates and transparent rectangles do not prove pixel occlusion. No continuous between-frame clearance claim. Review warnings and alpha_relations in the combined preview and use semantic layout for repairs. No writes or detector calls.",
    inputSchema: { type: "object", properties: { project_id: PROJECT_ID, proposal_id: { type: "string" }, option_id: { type: "string" } }, required: ["project_id"] },
    handler: async ({ project_id, proposal_id, option_id }) => {
      if (option_id && !proposal_id) throw new Error("option_id requires proposal_id");
      const base = `/api/projects/${encodeURIComponent(project_id)}`;
      if (!proposal_id) return http("GET", `${base}/analysis/spatial`);
      const preview = await http("GET", `${base}/timeline/proposals/${encodeURIComponent(proposal_id)}/preview${option_id ? `?option=${encodeURIComponent(option_id)}` : ""}`);
      return { proposal_id, option_id: preview.option_id, stale: preview.stale, ...preview.spatial_assessment };
    },
  },
  open_space_find: {
    description: "The one read of what is on screen and where is free: call it before placing or replacing any text, picture, drawing or overlay. For a moment (at_seconds) or a span (at_seconds to end_seconds, the time the new thing is on screen) it returns every occupant at each sampled moment (the speaker's head and shoulders found in the footage, and every picture, text and drawn shape, all through any camera they follow) and the open regions free for the whole span, largest first, in canvas pixels inside the safe area. Put the new thing in an open region; pass exclude_element_ids with the element you are replacing or moving so it does not block itself. It is the same occupancy proposal_create checks against, so a placement taken from it is not refused. Given text (or element_id of on-screen text), it also measures the real font in a headless browser and returns, for each fill level (medium 70%, large 85%, full 95% of the best region), the font size and the props to set (fontSizePx, maxWidth, absX, absY, textAlign, singleLine false — required, or new text shrinks to one tiny line); fill_level picks the recommendation (default large). For element_id it also reports the current fill and a verdict (too small / fills / spills). Works on a proposal option's preview with proposal_id/option_id. Read-only. Not for spoken captions, which keep their caption style rules.",
    inputSchema: { type: "object", additionalProperties: false, properties: {
      project_id: PROJECT_ID,
      at_seconds: { type: "number", minimum: 0, description: "Timeline second to examine, or the start of the span." },
      end_seconds: { type: "number", minimum: 0, description: "End of the span the new thing is on screen; open regions are free for the whole span." },
      exclude_element_ids: { type: "array", maxItems: 50, items: { type: "string" }, description: "Elements to leave out: the one being replaced or moved." },
      proposal_id: { type: "string", description: "Examine this proposal's preview instead of the working cut." },
      option_id: { type: "string", description: "Option of proposal_id; defaults to the recommended option." },
      text: { type: "string", maxLength: 500, description: "Text to size, with \\n for line breaks you want kept." },
      font_preset: { type: "string", description: "fontPreset to measure with, e.g. display_serif or editorial_serif." },
      style_variant: { type: "string", description: "styleVariant to measure with, e.g. cinematic." },
      text_align: { type: "string", enum: ["left", "center", "right"], description: "How lines align inside the text box; default left." },
      element_id: { type: "string", description: "Existing text on screen at at_seconds to judge and resize; its text and style are used." },
      fill_level: { type: "string", enum: ["medium", "large", "full"], description: "How much of the open region the text should take; default large (85%)." },
    }, required: ["project_id", "at_seconds"] },
    handler: ({ project_id, ...body }) => http("POST", `/api/projects/${encodeURIComponent(project_id)}/analysis/open-space`, body),
  },
  editing_feedback_record: {
    description: "Record material user direction and its stated reason before proposing an edit. Record each separate ask as its own record (its own ordinal), quoting just the words for that ask: a request counts as handled once any proposal links to it, so bundled asks hide their undrafted parts from the creator's Up next queue. Preserve user wording when supplied; distinguish agent_paraphrase and inferred_reasoning. Never invent a reason. Returns an immutable event_id for proposal.responds_to_feedback_ids or workspace mutation responds_to_feedback_ids. Retry with identical session/turn/ordinal; corrections use a new ordinal and supersedes_event_id. This records evidence only, never changes a timeline or preference.",
    inputSchema: { type: "object", additionalProperties: false, properties: {
      project_id: PROJECT_ID, session_id: { type: "string" }, turn_id: { type: "string" }, ordinal: { type: "integer", minimum: 0 },
      direction: { type: "string", minLength: 1, maxLength: 2000 }, reason: { type: "string", minLength: 1, maxLength: 2000 },
      provenance: { type: "string", enum: ["user_words", "agent_paraphrase", "inferred_reasoning"] },
      targets: { type: "object", additionalProperties: false, properties: {
        element_ids: { type: "array", items: { type: "string" } }, proposal_ids: { type: "array", items: { type: "string" } },
        review_mark_ids: { type: "array", items: { type: "string" } },
        timeline_range: { type: "object", properties: { start: { type: "number", minimum: 0 }, end: { type: "number", minimum: 0 } }, required: ["start", "end"], additionalProperties: false },
      } }, supersedes_event_id: { type: "string" },
    }, required: ["project_id", "session_id", "turn_id", "direction", "provenance"] },
    handler: ({ project_id, ...body }) => http("POST", `/api/projects/${encodeURIComponent(project_id)}/memory/feedback`, body),
  },
  editing_feedback_check: {
    description: "Check recorded directions, linked proposals, history and declared dispositions at turn closeout. Reports unaccounted feedback; cannot detect unrecorded conversation or prove satisfaction. Read-only.",
    inputSchema: { type: "object", properties: { project_id: PROJECT_ID }, required: ["project_id"] },
    handler: ({ project_id }) => http("GET", `/api/projects/${encodeURIComponent(project_id)}/memory/feedback`),
  },
  editing_feedback_disposition: {
    description: "Record why feedback is addressed, deferred or unresolved. This is an agent declaration, not human approval or satisfaction. Supersession uses a new feedback record with supersedes_event_id. Use linked proposals/history when work exists.",
    inputSchema: { type: "object", additionalProperties: false, properties: {
      project_id: PROJECT_ID, feedback_id: { type: "string" }, session_id: { type: "string" }, turn_id: { type: "string" }, ordinal: { type: "integer", minimum: 0 },
      disposition: { type: "string", enum: ["addressed", "deferred", "unresolved"] }, reason: { type: "string", minLength: 1, maxLength: 2000 },
    }, required: ["project_id", "feedback_id", "session_id", "turn_id", "disposition", "reason"] },
    handler: ({ project_id, ...body }) => http("POST", `/api/projects/${encodeURIComponent(project_id)}/memory/feedback`, { action: "disposition", ...body }),
  },
  capability_gap_report: {
    description: "Report that part of the creator's request was done without DreamCut's tools: you wrote or ran your own script, ran a shell command (ffmpeg, Python, ImageMagick…), edited project files directly, used another app, or gave up because no tool could do it. Call it once per gap, after the workaround, so DreamCut can build the missing tool. It records only what you send (paths are removed) and changes nothing in the project. Not for tool errors you recovered from by retrying a DreamCut tool, and not a way to ask the creator anything.",
    inputSchema: { type: "object", additionalProperties: false, properties: {
      project_id: { type: "string", description: "Project the work was for, when there is one." },
      needed: { type: "string", minLength: 1, maxLength: 500, description: "In one or two sentences, what the request needed that no DreamCut tool did, e.g. \"Reverse the second clip and slow it to half speed; no tool reverses video.\" Your words, not the creator's; no file paths." },
      workaround: { type: "string", enum: ["own_script", "shell_command", "manual_file_edit", "external_app", "gave_up"], description: "How the gap was handled: own_script (you wrote a script), shell_command (one-off command), manual_file_edit (edited project files such as timeline.json directly), external_app, or gave_up." },
      programs: { type: "array", maxItems: 8, items: { type: "string", maxLength: 40 }, description: "Programs or languages the workaround used, lower case, e.g. [\"ffmpeg\", \"python\"]. Empty when none." },
      nearest_tools: { type: "array", maxItems: 5, items: { type: "string", maxLength: 100 }, description: "DreamCut tools you tried or that came closest, e.g. [\"proposal_create\"]. Empty when none fit." },
      outcome: { type: "string", enum: ["worked", "partial", "failed"], description: "Whether the workaround did what the creator asked." },
    }, required: ["needed", "workaround", "outcome"] },
    handler: async (args) => {
      const built = capabilityGapSignal(signalContext(args.project_id), args);
      await http("POST", "/api/agent/product-signals", built);
      return { recorded: true, signal_id: built.signal_id };
    },
  },
  personal_style_list: {
    description: "List local-only saved personal styles. No contribution/upload path. Only load a style when the user asks to reuse it; current directions override it.",
    inputSchema: { type: "object", properties: { project_id: PROJECT_ID }, required: ["project_id"] },
    handler: ({ project_id }) => http("GET", `/api/projects/${encodeURIComponent(project_id)}/personal-styles`),
  },
  personal_style_get: {
    description: "Read an explicitly requested personal style and its parameters before preparing new-footage proposals. Do not copy source clip IDs or source timing to new footage. Preserve parameters unless the user overrides them; report unsupported parameters.",
    inputSchema: { type: "object", properties: { project_id: PROJECT_ID, id: { type: "string" } }, required: ["project_id", "id"] },
    handler: ({ project_id, id }) => http("GET", `/api/projects/${encodeURIComponent(project_id)}/personal-styles?id=${encodeURIComponent(id)}`),
  },
  personal_style_save: {
    description: "Save a local personal style ONLY after an explicit user save request. style contains name, description, bundles [{skill, recipe_id?, parameters}], and authorization {kind:'explicit_request',instruction:actual user request}. existing {id,expected_revision} edits a saved style. Never infer or silently create personal styles.",
    inputSchema: { type: "object", properties: { project_id: PROJECT_ID, style: {type:"object"}, existing: {type:"object"} }, required: ["project_id", "style"] },
    handler: ({ project_id, ...body }) => http("POST", `/api/projects/${encodeURIComponent(project_id)}/personal-styles`, body),
  },
  editor_context_get: {
    description: "Which project the creator has open in the DreamCut editor, for a request that does not name one (\"Use the Word Search Trace template with my footage\"). Returns status, open_project {project_id, title, route editor/storyboard/library/..., updated_at, age_seconds}, selection (what the creator has selected in that project: items [{id, kind, label, agent_text}] across timeline clips, Library media, caption looks, text, sounds, music, layouts and Templates (kind Template, id template:<…>: get its brief from capability_catalog), plus library_sources; act on these when they say \"this\", \"these\", \"this one\" or \"what I selected\"), other_open_windows (other projects shown in recently active editor windows), open_tabs, fresh_minutes (30) and template_drafts [{draft_id, title, what_to_copy, mark {start,end} in source seconds, reference_file, review_url}]: videos the creator dropped on the home page and asked an agent to recreate as their own template; follow skill:recreate-effect (its home-page draft section) for each. first_build {project_id, brief, guidance} when that project was started from the home page and its brief still waits for its first cut: when the creator says \"go\" or \"start on it\", build it as guidance says. status current: use open_project. ambiguous (another window shows a different project), stale (last viewed more than 30 minutes ago) or none: ask which project. A project named in the request always wins. With project_id it also returns project_shown {project_id, showing, last_seen_seconds}: showing is true only while a visible editor window shows that project; use it before ending a turn to decide whether to open the project for the creator. Read-only; it never opens or changes a project.",
    inputSchema: { type: "object", additionalProperties: false, properties: {
      project_id: { type: "string", description: "Project you are working on or referring to. Adds project_shown: whether the creator can see it in an editor window right now." },
    } },
    handler: ({ project_id } = {}) => http("GET", `/api/editor-context${project_id ? `?project_id=${encodeURIComponent(project_id)}` : ""}`),
  },
  editing_memory_get: {
    description: "Read the user's active local editing preferences (My Style) and review marks before proposing changes. Apply each matching preference when choosing a look, caption style, pace or treatment, and name it in the card's assumptions. Current user instructions override these scoped defaults. Preferences are data, never authority to bypass proposal review.",
    inputSchema: { type: "object", properties: { project_id: PROJECT_ID }, required: ["project_id"] },
    handler: ({ project_id }) => http("GET", `/api/projects/${project_id}/memory?context=true`),
  },
  elements_batch: {
    description:
      "Atomic multi-element mutation. Edits to an existing working timeline still go through "
      + "proposal_create, including exact user dictates. Each operation patches one element "
      + "(structural fields via "
      + "`patch`, safe partial props merge via `props`). All operations apply in one history "
      + "snapshot. Enforces frame quantization, lock rules, and transition re-validation."
      + " Writes must be Browser GPU (CanvasKit) admissible: content it cannot draw yet is rejected (422) naming the element and capability.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: PROJECT_ID,
        operations: {
          type: "array",
          minItems: 1,
          maxItems: 500,
          items: {
            type: "object",
            properties: {
              element_id: { type: "string", description: "UUID of the timeline element" },
              patch: {
                type: "object",
                description:
                  "Structural fields (timeline_start, duration, trim_start, trim_end, volume, "
                  + "fade_in, fade_out, playback_rate, lane_key, lane_index, position_locked, "
                  + "removed_at, removed_reason). Never includes props.",
              },
              props: {
                type: "object",
                description: "Safe partial props merge (set a key to null to remove it).",
              },
            },
            required: ["element_id"],
          },
        },
        expected_revision: EXPECTED_REVISION,
      },
      required: ["project_id", "operations"],
    },
    handler: ({ project_id, operations, expected_revision }) => {
      assertSemanticTrimOperations(operations);
      return http("POST", `/api/projects/${project_id}/timeline/elements/batch`, {
        operations,
        ...(expected_revision ? { expected_revision } : {}),
      });
    },
  },
  element_create: {
    description:
      "Create one non-playable timeline element. Playable media (video, voice, music, SFX) "
      + "must use element_create_from_source_window so source handles cannot be hidden or slipped. "
      + "Write the FULL field set for the type (copy the key list "
      + "off an existing element): type, lane_key, lane_index, timeline_start, duration, "
      + "source_url, trim_start, trim_end, volume, fade_in, fade_out, playback_rate, props. "
      + "Lane families: visual_*, audio_*, music_N, sound_effect_N, captions_N."
      + " Writes must be Browser GPU (CanvasKit) admissible: content it cannot draw yet is rejected (422) naming the element and capability.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: PROJECT_ID,
        element: { type: "object", description: "Full element payload (snake_case row)" },
      },
      required: ["project_id", "element"],
    },
    handler: ({ project_id, element }) => {
      if (PLAYABLE_MEDIA_TYPES.has(element?.type)) {
        throw new Error("Playable media must be created with element_create_from_source_window");
      }
      return http("POST", `/api/projects/${project_id}/timeline/elements`, element);
    },
  },
  element_create_from_source_window: {
    description:
      "Create playable media from an explicit, non-destructive source interval. Provide the "
      + "full source duration plus absolute source-in/source-out seconds; the MCP derives "
      + "duration, trim_start, and tail trim_end. Do not include those three derived fields "
      + "inside element."
      + " Writes must be Browser GPU (CanvasKit) admissible: content it cannot draw yet is rejected (422) naming the element and capability.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: PROJECT_ID,
        element: {
          type: "object",
          description:
            "Playable-media element without duration/trim_start/trim_end. Include type, "
            + "source_url, timeline_start, lane, gain/fades/rate, and props.",
        },
        source_start_seconds: { type: "number", minimum: 0 },
        source_end_seconds: { type: "number", exclusiveMinimum: 0 },
        source_duration_seconds: { type: "number", exclusiveMinimum: 0 },
      },
      required: [
        "project_id",
        "element",
        "source_start_seconds",
        "source_end_seconds",
        "source_duration_seconds",
      ],
    },
    handler: ({ project_id, element, ...sourceWindow }) =>
      http(
        "POST",
        `/api/projects/${project_id}/timeline/elements`,
        createElementFromSourceWindow(element, sourceWindow),
      ),
  },
  element_trim: {
    description:
      "Move one real clip edge to an absolute source time without slipping the source under "
      + "fixed boundaries. Head trims move timeline_start and duration together; tail trims "
      + "change duration. Both source handles remain explicit through trim_start/trim_end.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: PROJECT_ID,
        element_id: { type: "string" },
        edge: { type: "string", enum: ["head", "tail"] },
        source_seconds: {
          type: "number",
          minimum: 0,
          description: "Absolute source-time boundary, not a timeline time or delta",
        },
        source_duration_seconds: {
          type: "number",
          exclusiveMinimum: 0,
          description:
            "Optional full source duration for normalizing a legacy element that does not record it yet",
        },
        expected_revision: EXPECTED_REVISION,
      },
      required: ["project_id", "element_id", "edge", "source_seconds"],
    },
    handler: async ({
      project_id,
      element_id,
      edge,
      source_seconds,
      source_duration_seconds,
      expected_revision,
    }) => {
      const [timeline, proposalIndex] = await Promise.all([
        http("GET", `/api/projects/${project_id}/timeline`),
        http("GET", `/api/projects/${project_id}/timeline/proposals`),
      ]);
      const element = timeline.elements?.find((candidate) => candidate.id === element_id);
      if (!element) throw new Error(`Timeline element not found: ${element_id}`);
      const normalizedElement = source_duration_seconds == null
        ? element
        : {
            ...element,
            props: {
              ...(element.props ?? {}),
              source_duration_seconds,
            },
          };
      const patch = buildSourceTrimPatch(normalizedElement, edge, source_seconds);
      return http("POST", `/api/projects/${project_id}/timeline/elements/batch`, {
        operations: [{
          element_id,
          patch,
          ...(source_duration_seconds == null
            ? {}
            : { props: { source_duration_seconds } }),
        }],
        expected_revision: expected_revision ?? proposalIndex.revision,
      });
    },
  },
  element_props_patch: {
    description: "Safe partial-props merge on one element (set a key to null to remove it)."
      + " Writes must be Browser GPU (CanvasKit) admissible: content it cannot draw yet is rejected (422) naming the element and capability.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: PROJECT_ID,
        element_id: { type: "string" },
        props: { type: "object" },
      },
      required: ["project_id", "element_id", "props"],
    },
    handler: ({ project_id, element_id, props }) =>
      http("PATCH", `/api/projects/${project_id}/timeline/elements/${element_id}/props`, { props }),
  },
  element_delete: {
    description: "Soft-delete one element (sets removed_at/removed_reason; restorable).",
    inputSchema: {
      type: "object",
      properties: { project_id: PROJECT_ID, element_id: { type: "string" } },
      required: ["project_id", "element_id"],
    },
    handler: ({ project_id, element_id }) =>
      http("DELETE", `/api/projects/${project_id}/timeline/elements/${element_id}`),
  },
  element_restore: {
    description: "Restore a soft-deleted element (transparently rehydrates archived rows).",
    inputSchema: {
      type: "object",
      properties: { project_id: PROJECT_ID, element_id: { type: "string" } },
      required: ["project_id", "element_id"],
    },
    handler: ({ project_id, element_id }) =>
      http("POST", `/api/projects/${project_id}/timeline/elements/${element_id}/restore`),
  },
  element_split: {
    description: "Split an element at a timeline time (seconds). Splits caption text/timing too.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: PROJECT_ID,
        element_id: { type: "string" },
        at_seconds: { type: "number", description: "Absolute timeline time to split at" },
      },
      required: ["project_id", "element_id", "at_seconds"],
    },
    handler: ({ project_id, element_id, at_seconds }) =>
      http("POST", `/api/projects/${project_id}/timeline/elements/${element_id}/split`, {
        at_seconds,
      }),
  },
  element_duplicate: {
    description: "Duplicate an element onto free space.",
    inputSchema: {
      type: "object",
      properties: { project_id: PROJECT_ID, element_id: { type: "string" } },
      required: ["project_id", "element_id"],
    },
    handler: ({ project_id, element_id }) =>
      http("POST", `/api/projects/${project_id}/timeline/elements/${element_id}/duplicate`),
  },
  element_normalize: {
    description:
      "Level an audio clip to its role loudness reference (narrator −16, music −28, sfx −18 "
      + "LUFS). Measures source LUFS (cached) and sets the gain; an explicit act, never automatic.",
    inputSchema: {
      type: "object",
      properties: { project_id: PROJECT_ID, element_id: { type: "string" } },
      required: ["project_id", "element_id"],
    },
    handler: ({ project_id, element_id }) =>
      http("POST", `/api/projects/${project_id}/timeline/elements/${element_id}/normalize`),
  },
  transition_create: {
    description:
      "Create a transition between two flush-adjacent visual clips in the same lane. Types: "
      + "fade, slide, wipe, whip, cube, page_turn, film_burn, camera_flash, blackout. params.direction "
      + "(from-left/right/top/bottom) applies to slide, wipe, whip, cube and page_turn. Accent transitions expose accent_strength and accent_hold (0–1 and 0–0.8).",
    inputSchema: {
      type: "object",
      properties: {
        project_id: PROJECT_ID,
        from_element_id: { type: "string" },
        to_element_id: { type: "string" },
        type: { type: "string", enum: ["fade", "slide", "wipe", "whip", "cube", "page_turn", "film_burn", "camera_flash", "blackout"] },
        duration_seconds: { type: "number", description: "Max 2s; quantized to whole frames" },
        params: { type: "object", description: "direction, motion, bezier, whip_blur_strength, page_curl, page_turn_origin, accent_strength, accent_hold" },
      },
      required: ["project_id", "from_element_id", "to_element_id", "type", "duration_seconds"],
    },
    handler: ({ project_id, ...body }) =>
      http("POST", `/api/projects/${project_id}/timeline/transitions`, body),
  },
  transition_patch: {
    description: "Patch a transition's type, duration_seconds, or params.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: PROJECT_ID,
        transition_id: { type: "string" },
        patch: { type: "object" },
      },
      required: ["project_id", "transition_id", "patch"],
    },
    handler: ({ project_id, transition_id, patch }) =>
      http("PATCH", `/api/projects/${project_id}/timeline/transitions/${transition_id}`, patch),
  },
  transition_delete: {
    description: "Delete a transition.",
    inputSchema: {
      type: "object",
      properties: { project_id: PROJECT_ID, transition_id: { type: "string" } },
      required: ["project_id", "transition_id"],
    },
    handler: ({ project_id, transition_id }) =>
      http("DELETE", `/api/projects/${project_id}/timeline/transitions/${transition_id}`),
  },
  lane_order_set: {
    description: "Persist the lane order (top-first: index 0 composites in front).",
    inputSchema: {
      type: "object",
      properties: {
        project_id: PROJECT_ID,
        lane_order_keys: { type: "array", items: { type: "string" } },
      },
      required: ["project_id", "lane_order_keys"],
    },
    handler: ({ project_id, lane_order_keys }) =>
      http("PATCH", `/api/projects/${project_id}/timeline/lane-order`, { lane_order_keys }),
  },
  muted_lanes_set: {
    description:
      "Replace a lane's sound and/or picture visibility in one undoable write. muted_lane_keys: "
      + "lanes whose sound (video clip audio, music, SFX, voice) is silent in preview and export; "
      + "their pictures and text still draw — use for audition stacks. hidden_lane_keys: lanes whose "
      + "pictures and text (video, stills, captions) are not drawn in preview or export; a hidden "
      + "video lane still plays its sound unless it is also muted. Omit a set to leave it unchanged; "
      + "provide at least one. Returns both saved sets and undo history descriptors. Do not use to "
      + "change what an export contains without the user's direction.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: PROJECT_ID,
        muted_lane_keys: {
          type: "array", items: { type: "string" },
          description: "Complete set of silent lane keys (e.g. music_1). Replaces the saved set.",
        },
        hidden_lane_keys: {
          type: "array", items: { type: "string" },
          description: "Complete set of lane keys whose pictures/text are not drawn (e.g. visual_2, captions_0). Replaces the saved set.",
        },
      },
      required: ["project_id"],
    },
    handler: ({ project_id, muted_lane_keys, hidden_lane_keys }) => {
      if (muted_lane_keys === undefined && hidden_lane_keys === undefined) {
        throw new Error("muted_lanes_set: provide muted_lane_keys, hidden_lane_keys, or both");
      }
      return http("PATCH", `/api/projects/${project_id}/timeline/muted-lanes`, {
        ...(muted_lane_keys !== undefined ? { muted_lane_keys } : {}),
        ...(hidden_lane_keys !== undefined ? { hidden_lane_keys } : {}),
      });
    },
  },
  output_format_set: {
    description:
      "Set the REAL render canvas (aspect_ratio 9:16|4:5|1:1|16:9), frame_rate and/or delivery_target. This is "
      + "the delivered video's format — never conflate with the GUI's workspace layout toggle. Changing "
      + "frame_rate re-snaps every picture clip to the new frame grid in the same undoable step.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: PROJECT_ID,
        aspect_ratio: { type: "string", enum: OUTPUT_ASPECT_RATIOS },
        frame_rate: { type: "integer", enum: [24, 25, 30, 50, 60], description: "Composition frames per second for preview, editing and export. Defaults to 30 for projects that never set one." },
        delivery_target: { type: "string" },
      },
      required: ["project_id"],
    },
    handler: ({ project_id, ...body }) =>
      http("PATCH", `/api/projects/${project_id}/timeline/output-format`, body),
  },
  asset_preparation_status: {
    description:"Read a speech or cutout-treatment job; verifies completed artifact/source hashes. A failed job is distinct from a failed lookup. No timeline changes.",
    inputSchema:{type:"object",properties:{project_id:PROJECT_ID,job_id:{type:"string"}},required:["project_id","job_id"]},
    handler:({project_id,job_id})=>http("POST",`/api/projects/${project_id}/tools/preparation`,{action:"status",job_id}),
  },
  caption_proposal_compile: {
    description:"Compile a completed reviewed-text MFA job into replace_captions operations scoped to one speech clip, or to every clip cut from that recording (source_element_ids): the route for every caption request. Choose the look from the creator's My Style (editing_context.preferences; the result also lists their caption preferences) with one of the editor's caption looks (style.look sets the style and its font); without a style the product's default look is used. Defaults: one word at a time, at a fixed size that never shrinks. Pass written_text (the script as written, e.g. the storyboard Script) so captions read \"0.22\" and \"Nasdaq\" while timed to the spoken \"zero point two two\" and \"nas dock\" the alignment used. word_limit above 1 gives phrase captions. Long talks become several operations of at most 250 captions, applied in order, with review_controls linking them into one set of dials. Preserves source-clock binding, including speed mapping. Requires the current revision. The operations are stored and returned as compile_id: put operations_from: [{compile_id}] on the proposal_create option instead of pasting them (include_cues returns them too). Never applies or approves captions.",
    inputSchema:{type:"object",additionalProperties:false,properties:{project_id:PROJECT_ID,
      job_id:{type:"string",description:"Completed speech_prepare align job (reviewed text) for the speech clip's source."},
      source_element_id:{type:"string",description:"The speech clip the captions follow."},
      source_element_ids:{type:"array",minItems:1,maxItems:500,items:{type:"string"},description:"Instead of source_element_id: every speech clip cut from the aligned recording (a talk with its pauses removed). Each clip captions its own words; no caption spans a cut."},
      expected_revision:{type:"string",description:"Current timeline revision from timeline_get."},
      style:{type:"object",additionalProperties:false,description:"How captions look and sit, chosen from the creator's My Style. Omitted: the product's default look.",properties:{
        look:{type:"string",enum:["none","cinematic","bold_outline","highlight_yellow","highlight_red","boxed","yellow_banner","black_card","thought_bubble","neon","yellow_words","inverse"],description:"Caption look from the editor's Captions panel; sets style_variant and its paired font. Preferred over font_preset/style_variant. none is Plain."},
        font_preset:{type:"string",description:"Only without look: caption font preset."},
        style_variant:{type:"string",description:"Only without look: caption style variant."},
        font_size_px:{type:"number",description:"Text size in px at 1080."},
        position_preset:{type:"string",description:"Named caption position, e.g. bottom_center."},
        max_width:{type:"number",description:"Widest a caption may be, as a share of the frame width (0.25 to 0.95); boxed and card looks are this wide."}},
        required:["font_size_px","position_preset","max_width"]},
      written_text:{type:"string",description:"Optional: the script as it should read on screen. Words are matched to the aligned spoken words; numbers, symbols and names written differently show as written."},
      word_limit:{type:"integer",minimum:1,maximum:4,description:"Most words in one caption. Default 1 (one word at a time); 2 to 4 gives pause-first phrases."},
      timing_mode:{type:"string",enum:["phrase","active_word","single_word"],description:"Default single_word (one word at a time), or phrase when word_limit is above 1. phrase shows the whole caption, active_word highlights the spoken word."},
      font_sizing:{type:"string",enum:["fixed","fit"],description:"Default fixed: every caption keeps its size and never shrinks. fit shrinks a long caption to fit its line."},
      include_cues:{type:"boolean",description:"Also return the full operations. Usually leave out and use compile_id."},
      single_word_flip_seconds:{type:"number",minimum:0,maximum:0.3,description:"single_word only: seconds each word flips in and out; 0 (default) is a plain cut."},
      hide_punctuation:{type:"boolean",description:"Draw captions without punctuation."},
      offset_y:{type:"number",minimum:-0.45,maximum:0.45,description:"Move every caption down (positive) or up from its position preset, as a share of the frame height; use it only when the creator asks, e.g. to clear their face. Default 0; the card keeps it as a dial."}},
      required:["project_id","job_id","expected_revision"]},
    handler:({project_id,...body})=>http("POST",`/api/projects/${project_id}/tools/caption-compile`,body),
  },
  framing_compile: {
    description:"Frame part of a picture: give regions of a clip's own source (fractions of its frame, e.g. the app window in a screen recording) and get the clip's media_scale and media_offset_x/y that show that region in the part of the canvas its crop (mask_inset) leaves visible. One region without t gives a still framing; several regions with t (seconds into the clip, first at 0) give a push-in or pan as transition_keyframes, eased in and out. fit (default) shows all of the region; fill covers the visible part and keeps everything outside the region out. Use it for screen recordings so a zoom never drifts onto the chat or desktop around the app. Writes nothing; put the returned props on a proposal_create operation.",
    inputSchema:{type:"object",additionalProperties:false,properties:{project_id:PROJECT_ID,
      element_id:{type:"string",description:"The video or picture clip to frame."},
      regions:{type:"array",minItems:1,maxItems:20,description:"Regions of the clip's source to show, in order.",items:{type:"object",additionalProperties:false,properties:{
        t:{type:"number",minimum:0,description:"Seconds into the clip when this framing is reached; leave out for a single still framing."},
        x:{type:"number",minimum:0,maximum:1,description:"Region's left edge as a share of the source width."},
        y:{type:"number",minimum:0,maximum:1,description:"Region's top edge as a share of the source height."},
        width:{type:"number",minimum:0,maximum:1,description:"Region's width as a share of the source width."},
        height:{type:"number",minimum:0,maximum:1,description:"Region's height as a share of the source height."},
        ease:{type:"string",enum:["linear","easeIn","easeOut","easeInOut","hold"],description:"How the camera moves into this framing; default easeInOut."}},required:["x","y","width","height"]}},
      fit:{type:"string",enum:["fit","fill"],description:"fit (default) shows the whole region; fill covers the visible part, trimming the region's longer side."},
      mask_inset:{type:"array",minItems:4,maxItems:4,items:{type:"number",minimum:0,maximum:0.95},description:"Crop [top, right, bottom, left] to frame for, when it differs from the clip's own, e.g. [0,0,0.5,0] for the top half."},
      follow_cursor:{type:"object",additionalProperties:false,description:"Screen recordings: find the mouse pointer in the clip and let the framing drift after it with a spring, like a demo camera, instead of holding still. The regions still set how far it zooms and when; a whole-frame region stays put. Leave out (or follow 0) for a still framing.",properties:{
        follow:{type:"number",minimum:0,maximum:1,description:"How far the view leans toward the pointer: 0 stays on the region, 1 centres the pointer. Default 0.6."},
        smoothing:{type:"number",minimum:0.1,maximum:5,description:"Seconds the camera takes to settle after the pointer moves; longer is calmer. Default 0.8."},
        dead_zone:{type:"number",minimum:0,maximum:0.9,description:"Share of the view around its centre where pointer moves are ignored, so small moves do not nudge the camera. Default 0.4."}}}},
      required:["project_id","element_id","regions"]},
    handler:({project_id,...body})=>http("POST",`/api/projects/${project_id}/tools/framing-compile`,body),
  },
  svg_pieces_compile: {
    description:"Turn one SVG drawing into separate native shape pieces that draw themselves on, like a sketch appearing as someone explains it. Each top-level element of the <svg> (a <g> or a single path, line, polyline, polygon, rect, circle or ellipse) becomes one editable path shape on its own lane, placed exactly where it sits in the frame, with hand-drawn ink (taper, wobble, per-piece seed) and a 0-to-1 draw-on in document order. Name pieces with id or data-piece; they become the clip titles. Draw in the viewBox you like: it is fitted inside region (canvas fractions) keeping its proportions. Omit region to place it in the largest open region that keeps the speaker's head and shoulders clear while it is on screen (reported in placement); staging refuses a drawing on the speaker's face. Timing: pieces start at timeline_start and follow one another (length / pen_speed, clamped to min/max_draw_seconds, plus gap_seconds), or set starts (seconds after timeline_start, one per piece). Every piece holds until hold_until (default 2 s after the last finishes). <text> is returned as labels (centre in canvas fractions, size in px at 1080) for native create_text; it is never drawn as a shape. To label the drawing, append a create_text with the returned label_slot.place (the drawing's pieces as one anchor, below it when there is room) and label_slot.max_width, and add label_slot.review_controls to review_controls: the label then stays with the drawing through tuning and camera moves; reserve_label_space keeps room for it inside the open region. A piece holds at most 64 contours and 2000 points; split bigger drawings into more groups. Returns create_shape operations for proposal_create (the camera, when asked for, comes first) and option_fields to copy onto the option (the coordinate_fallback_reason for the pieces' measured positions): one option, or one option per alternative to audition. Writes nothing and approves nothing.",
    inputSchema:{type:"object",additionalProperties:false,properties:{
      project_id:PROJECT_ID,
      svg:{type:"string",description:"The full <svg> document. Strokes come from stroke/stroke-width (inherited from groups); fill applies to closed outlines. Transforms are supported."},
      timeline_start:{type:"number",minimum:0,description:"Timeline seconds where the first piece starts drawing."},
      starts:{type:"array",maxItems:200,items:{type:"number",minimum:0},description:"Optional: each piece's start, in seconds after timeline_start, in document order. Overrides the automatic stagger."},
      hold_until:{type:"number",exclusiveMinimum:0,description:"Optional: timeline seconds where every piece ends."},
      gap_seconds:{type:"number",minimum:0,maximum:10,description:"Pause between automatic piece starts. Default 0.15."},
      pen_speed:{type:"number",minimum:50,maximum:20000,description:"Drawing speed in px per second at 1080. Default 900."},
      min_draw_seconds:{type:"number",minimum:0.05,maximum:10,description:"Shortest draw-on. Default 0.35."},
      max_draw_seconds:{type:"number",minimum:0.1,maximum:30,description:"Longest draw-on. Default 2.5."},
      region:{type:"object",additionalProperties:false,description:"Where the drawing goes, in canvas fractions (left, top, width, height). Omit it to use measured open space beside the speaker; pass it only from open_space_find or the creator's words.",properties:{left:{type:"number",description:"Left edge, 0 to 1 across the canvas."},top:{type:"number",description:"Top edge, 0 to 1 down the canvas."},width:{type:"number",description:"Width as a share of the canvas width."},height:{type:"number",description:"Height as a share of the canvas height."}},required:["left","top","width","height"]},
      reserve_label_space:{type:"number",minimum:0,maximum:0.4,description:"Share of the region's height kept free under the drawing for its label (label_slot). About 0.15 fits one line. Default 0."},
      stroke:{type:"string",pattern:"^#[0-9a-fA-F]{6}$",description:"Optional ink colour for every piece, overriding the SVG."},
      stroke_width:{type:"number",minimum:0.5,maximum:200,description:"Optional line width in px at 1080 for every piece, overriding the SVG."},
      taper:{type:"number",minimum:0,maximum:1,description:"How much each line thins at its ends. Default 0.55."},
      wobble:{type:"number",minimum:0,maximum:1,description:"How far lines drift and swell; 0 is ruled. Default 0.3."},
      seed:{type:"integer",minimum:0,maximum:9999,description:"Starting wobble variation; each piece gets its own. Default 1."},
      ease:{type:"string",enum:["linear","easeIn","easeOut","easeInOut"],description:"How each draw-on moves. Default easeInOut."},
      camera_moves:{type:"array",maxItems:20,description:"Optional push-ins and pans over the whole drawing. Adds one camera clip (first in the operations) that every piece follows; each move eases from the previous view to look at a piece and holds. Moves must not overlap.",items:{type:"object",additionalProperties:false,properties:{
        start:{type:"number",minimum:0,description:"Seconds after timeline_start when the move begins."},
        duration:{type:"number",exclusiveMinimum:0,maximum:60,description:"Seconds the move takes."},
        look_at:{type:"string",description:"A piece title (its id or data-piece) to centre on, \"drawing\" to centre the whole drawing, or \"frame\" to return to the plain frame (use zoom 1)."},
        zoom:{type:"number",minimum:0.1,maximum:3,description:"Zoom at the end of the move; 1 is the plain frame. Default 1.5."},
        ease:{type:"string",enum:["linear","easeIn","easeOut","easeInOut"],description:"How the move travels. Default easeInOut."}},required:["start","duration","look_at"]}},
      expected_revision:{type:"string",description:"Optional timeline revision the drawing was planned against."}},
      required:["project_id","svg","timeline_start"]},
    handler:({project_id,...body})=>http("POST",`/api/projects/${project_id}/tools/svg-pieces`,body),
  },
  speech_prepare: {
    description:"Queue local English transcription or MFA alignment. Alignment requires reviewed_text; transcript output requires review. No downloads, speech cuts or timeline writes. Poll asset_preparation_status. Missing runtime/unknown pronunciation remains a blocker; no fallback to ASR boundaries.",
    inputSchema:{type:"object",properties:{project_id:PROJECT_ID,source:{type:"string"},mode:{type:"string",enum:["transcribe","align"]},reviewed_text:{type:"string"},retry:{type:"boolean"}},required:["project_id","source","mode"]},
    handler:({project_id,...body})=>http("POST",`/api/projects/${project_id}/tools/preparation`,{...body,kind:"speech"}),
  },
  cutout_treatment_prepare: {
    description:"Queue reusable outline-mask frames or a Scratchpad derivative from a verified raw cutout. Preserves parent, source clock and immutable outputs. Width 1–32 is the existing Scratchpad outline width. Poll asset_preparation_status and require ready preview before video adoption. No timeline writes.",
    inputSchema:{type:"object",properties:{project_id:PROJECT_ID,parent_cutout_id:{type:"string"},mode:{type:"string",enum:["outline","scratchpad"]},width:{type:"integer",minimum:1,maximum:32},retry:{type:"boolean"}},required:["project_id","parent_cutout_id","mode"]},
    handler:({project_id,...body})=>http("POST",`/api/projects/${project_id}/tools/preparation`,{...body,kind:"treatment"}),
  },
  visual_analyze: {
    description:"Prepare or inspect a saved read-only visual-analysis job. Uses a host-configured local VLM with no editing tools. Presets describe sources or review effects/masks/captions. Explicit source times (1–12), one static image, or six verified timeline frames per report page. Returns job_id; poll status after 5 seconds. Saved per-cell observations are model claims, not measurements, transcript, motion proof or approval. No import, timeline writes, downloads or remote uploads. Reuses valid completed work only with a host-declared model revision; failed work needs explicit retry.",
    inputSchema:{type:"object",additionalProperties:false,properties:{project_id:PROJECT_ID,action:{type:"string",enum:["prepare","status"],default:"prepare"},job_id:{type:"string"},evidence:{type:"object",additionalProperties:false,properties:{kind:{type:"string",enum:["source","image","timeline"]},source_relative_path:{type:"string",maxLength:256},times_seconds:{type:"array",minItems:1,maxItems:12,items:{type:"number",minimum:0}},report:{type:"string",maxLength:256},page:{type:"integer",minimum:0}},required:["kind"]},preset:{type:"string",enum:["source-description","effect-breakdown","mask-review","caption-review"]},question:{type:"string",maxLength:1000},backend:{type:"string",maxLength:64},max_output_tokens:{type:"integer",minimum:256,maximum:2048},retry:{type:"boolean"}},required:["project_id"]},
    handler:args=>visualAnalyze(args),
  },
  timeline_evidence: {
    description:"Deliver six labeled frame-state images per page as MCP image content. Supply a completed report relative to project instruments, e.g. frame-state/frame-state.json. Verifies timeline/media fingerprint and image hashes; stale/legacy reports require regeneration. Supports proposal reports and preserves option identity. No export or approval.",
    inputSchema:{type:"object",properties:{project_id:PROJECT_ID,report:{type:"string"},page:{type:"integer",minimum:0}},required:["project_id","report"]},
    handler:({project_id,...body})=>http("POST",`/api/projects/${project_id}/tools/timeline-evidence`,body),
  },
  audio_waveform_prepare: {
    description: "Prepare full-source waveform peaks before audition or placement. Accepts 1–20 local source URLs already active in the timeline or verified managed imports in this project. Reuses the source-byte/recipe cache and deduplicates running extraction. Sequential synchronous work; each extraction has a 120s timeout. Returns durations and peak counts; waveform data stays in the project cache. No gain, timeline, approval, or original-media writes. Unused catalog/external-reference sources must first be managed imports. Per-source errors identify inputs needing correction; partial success retains completed caches.",
    inputSchema: { type: "object", properties: { project_id: PROJECT_ID, sources: { type: "array", minItems: 1, maxItems: 20, items: { type: "string", minLength: 1 } } }, required: ["project_id", "sources"] },
    handler: async ({ project_id, sources }) => {
      const result = await http("POST", `/api/projects/${encodeURIComponent(project_id)}/timeline/peaks/prepare`, { sources });
      const summary = { items: result.items.map(({ source_url, source_duration_seconds, peaks }) => ({ source_url, source_duration_seconds, peak_count: peaks.length })), errors: result.errors };
      if (summary.errors.length) {
        const error = new Error("Some waveform sources could not be prepared");
        error.toolError = { schema_version: 1, code: "WAVEFORM_PREPARATION_FAILED", message: error.message, retryable: false, state_changed: summary.items.length > 0 ? true : "unknown", ...summary,
          recovery: { action: "inspect_source_errors", reason: "Correct rejected source URLs or re-import changed media; do not place or approve clips to prepare waveforms." } };
        throw error;
      }
      return summary;
    },
  },
  motion_graphic_prepare: {
    description: "Create or revise a motion graphic as code and render a transparent candidate for a proposal. Use only for ONE separable object whose motion native elements cannot make (for example letters cycling random glyphs, a particle burst); logos, titles, words and labels are native timeline elements, each on its own lane. A composition that shows more than one object at once (text with a picture, or two text blocks) is refused. Write a HyperFrames composition: files must include index.html (HTML/CSS with one paused GSAP timeline registered on window.__timelines, timed elements with data-start/data-duration, transparent background, deterministic code). Copy project images into the composition with assets [{media_path relative to project media, as: 'assets/<name>'}]. Required: a dreamcut.controls.json file with \"object\": {label, native_gap} naming that one object and why native elements cannot make its motion; it may also declare creator controls (text, color, number, choice, switch), at most one actor (an element tagged data-actor) and stretchable hold markers; read values from window.__dreamcut.controls / .segment_durations with the same defaults. Controls are your choice, never required. Omit files to re-render the existing source, for example with new values. Waits up to 20 s; if state is rendering, poll motion_graphic_status. When state is ready, propose it with create_visual (video_clip, has_alpha true, source_url, source window 0 to duration_seconds). Records an audit trail; never edits the timeline or approves.",
    inputSchema: { type: "object", properties: {
      project_id: PROJECT_ID,
      composition_id: { type: "string", pattern: "^[A-Za-z0-9._-]{1,128}$", description: "Stable name, e.g. logo-sting. Reuse it to revise." },
      files: { type: "array", maxItems: 64, description: "Composition source files to write (HTML, CSS, JS, JSON, SVG). Must include index.html on first creation; files not listed are kept.", items: { type: "object", properties: { path: { type: "string", description: "Relative path, e.g. index.html or dreamcut.controls.json" }, text: { type: "string", description: "Full file contents." } }, required: ["path", "text"] } },
      assets: { type: "array", maxItems: 64, description: "Project media to copy into the composition, e.g. a logo image.", items: { type: "object", properties: { media_path: { type: "string", description: "Project media path, e.g. sources/logo.png" }, as: { type: "string", description: "Destination under assets/, e.g. assets/logo.png" } }, required: ["media_path", "as"] } },
      values: { type: "object", description: "Control values keyed by control id; omitted controls use their defaults." },
      feedback_ids: { type: "array", items: { type: "string" }, description: "editing_feedback_record ids this responds to." },
      request: { type: "string", description: "The creator's request in brief, for the audit trail." },
      model: { type: "string", description: "Your model id, for the audit trail." },
    }, required: ["project_id", "composition_id"] },
    handler: ({ project_id, model, ...body }) => http("POST", `/api/projects/${encodeURIComponent(project_id)}/hyperframes/prepare`, { ...body, agent: { name: process.env.DREAMCUT_MCP_CLIENT || "editor-agent", ...(model ? { model } : {}) } }),
  },
  motion_graphic_status: {
    description: "Read the latest motion_graphic_prepare render for a composition: rendering, preparing_preview, ready (with source_url, duration_seconds, controls and values) or failed with the reason. No writes.",
    inputSchema: { type: "object", properties: { project_id: PROJECT_ID, composition_id: { type: "string", pattern: "^[A-Za-z0-9._-]{1,128}$", description: "The composition_id given to motion_graphic_prepare." } }, required: ["project_id", "composition_id"] },
    handler: ({ project_id, composition_id }) => http("GET", `/api/projects/${encodeURIComponent(project_id)}/hyperframes/prepare?composition_id=${encodeURIComponent(composition_id)}`),
  },
  motion_library_list: {
    description: "List the creator's own saved motion graphics in their personal Library (for example their show opener): id, name, controls, timing cues, the values it was saved with and its linked sounds. Use before motion_library_use when the creator asks for 'my opener', 'my intro' or another piece they saved. Not Templates: Templates are treatments other people follow. Read-only.",
    inputSchema: { type: "object", properties: {} },
    handler: () => http("GET", "/api/motion-library"),
  },
  motion_library_save: {
    description: "Save a placed motion graphic to the creator's personal Library so it can be reused in other projects: its composition source, the control values of the placed render, and every synthesized sound linked to it (follows_visual) with the cue it follows. Use when the creator asks to keep, save or reuse a graphic they like (an opener, a sting). element_id is the motion graphic clip on this project's timeline. Saving under an existing name replaces that entry. Graphics whose source copies images or fonts into assets/ cannot be saved yet. Writes only the Library; never edits a timeline.",
    inputSchema: { type: "object", properties: {
      project_id: PROJECT_ID,
      element_id: { type: "string", description: "The motion graphic clip (a composition render) on this project's timeline; its linked sounds are saved with it." },
      name: { type: "string", minLength: 1, maxLength: 80, description: "The name the creator will ask for, e.g. 'Trades Decoded opener'." },
      description: { type: "string", maxLength: 500, description: "Optional: what it is and when it is used." },
    }, required: ["project_id", "element_id", "name"] },
    handler: ({ project_id, ...body }) => http("POST", "/api/motion-library", { project_id, ...body }),
  },
  motion_library_use: {
    description: "Bring a saved Library motion graphic into a project: renders its composition here with the saved values (override any with values, e.g. a new episode number) and re-renders its linked sounds. Returns the render (source_url, duration_seconds, composition_id) and each sound (source_url, duration_seconds, cue, offset_seconds, lane_key, volume). It never edits the timeline: next, proposal_create with one create_visual (video_clip, has_alpha true, source window 0 to duration_seconds; ripple_after true when it is inserted between shots) and one create_audio per sound with follows_visual {element_id of that create_visual, cue, offset_seconds}, linking their volumes with one review dial. Waits for the render (up to 3 min); if it is still rendering, poll motion_graphic_status.",
    inputSchema: { type: "object", properties: {
      project_id: PROJECT_ID,
      entry_id: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{0,63}$", description: "Library id from motion_library_list." },
      composition_id: { type: "string", pattern: "^[A-Za-z0-9._-]{1,128}$", description: "Optional name for the composition in this project; defaults to the saved name plus a content tag, so nothing already in the project is overwritten." },
      values: { type: "object", description: "Optional control values to change for this project, keyed by control id; others keep the saved values." },
      model: { type: "string", description: "Your model id, for the audit trail." },
    }, required: ["project_id", "entry_id"] },
    handler: async ({ project_id, entry_id, composition_id, values, model }) => {
      const entry = await http("GET", `/api/motion-library?id=${encodeURIComponent(entry_id)}`);
      // Imported copies are named by their content, so a different graphic or sound already in this
      // project under the same name is never overwritten; reusing identical content reuses its renders.
      const tag = (text) => createHash("sha256").update(text).digest("hex").slice(0, 8);
      const tagged = (base, text) => `${String(base).slice(0, 119)}-${tag(text)}`; // ids allow 128 characters
      const project = encodeURIComponent(project_id);
      const compositionId = composition_id || tagged(entry.composition.composition_id, JSON.stringify(entry.composition.files));
      const agent = { name: process.env.DREAMCUT_MCP_CLIENT || "editor-agent", ...(model ? { model } : {}) };
      const request = `Use "${entry.name}" from the Library`;
      let render = await http("POST", `/api/projects/${project}/hyperframes/prepare`, { composition_id: compositionId, files: entry.composition.files, values: { ...entry.composition.values, ...(values ?? {}) }, request, agent });
      const deadline = Date.now() + 180_000;
      while ((render.state === "rendering" || render.state === "preparing_preview") && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        render = await http("GET", `/api/projects/${project}/hyperframes/prepare?composition_id=${encodeURIComponent(compositionId)}`);
      }
      if (render.state !== "ready") return { entry_id, composition_id: compositionId, state: render.state, error: render.error ?? null, next: "Poll motion_graphic_status, then call motion_library_use again or place the render." };
      const sounds = [];
      for (const sound of entry.sounds) {
        const soundId = tagged(sound.sound_id, sound.synth_js + JSON.stringify(sound.controls ?? null));
        const made = await http("POST", `/api/projects/${project}/sounds/prepare`, { sound_id: soundId, synth_js: sound.synth_js, ...(sound.controls ? { controls: sound.controls } : {}), seed: sound.seed, values: sound.values, request, agent });
        sounds.push({ title: sound.title, source_url: made.source_url, duration_seconds: made.duration_seconds, cue: sound.cue, offset_seconds: sound.offset_seconds, lane_key: sound.lane_key, volume: sound.volume });
      }
      return { entry_id, name: entry.name, composition_id: compositionId, state: "ready", source_url: render.source_url, duration_seconds: render.duration_seconds, sounds };
    },
  },
  sound_units_extract: {
    description: "Split the sound effects in a reference audio or video (a tutorial, a trailer, a clip the creator likes) into single, clean sound units, each saved as its own WAV in the project for create_audio, and optionally rebuild units as tunable synth sounds. Use when the creator wants the sounds from a reference, or says a cut of one effect still has another sound in it. Each unit is isolated by its spectrum, not just cut by time: the source is separated into stems (drums, bass, other, vocals; the first call for a source starts this and returns state preparing, call again with the same arguments after retry_after_seconds), then attacks in each stem are decomposed so overlapping events are removed from each other. Give a window of at most 30 s on the source clock (skip speech: narration is in vocals) and, when you know them, events (time and label per sound; a named event keeps its unit even without a clear attack). Returns per unit: name, label, character (click, thump, boom, hit, whoosh, sweep, swell, tonal), stem, onset and source window, attack/decay, spectral centroid and flatness, a 12-band frequency profile, leakage (time_cut_foreign_share = share of an equal-span time cut that belongs to other sounds; unit_residual_crosstalk = what remains in the unit; reduction_db), confidence, and source_url once imported; with recreate, rebuilt {sound_id, source_url, fit, controls: length, attack, pitch, brightness, low end, tone and noise level, pan, width, volume}. Retune a rebuilt sound with sound_synth_prepare (sound_id, values). Repeated identical calls reuse the result. You cannot hear: propose units as options so the creator listens. Reference audio is cleared for this project only; never add units to tracked catalogs. Never edits the timeline.",
    inputSchema: { type: "object", additionalProperties: false, properties: {
      project_id: PROJECT_ID,
      source_url: { type: "string", description: "Project media URL of the reference audio or video, e.g. /api/projects/<id>/media/sources/clip.mp4. Or use source." },
      source: { type: "string", description: "Media path of the reference instead of source_url, e.g. sources/clip.mp4 (relative to the project's media folder)." },
      start_seconds: { type: "number", minimum: 0, description: "Window start on the source's own clock, in seconds (not timeline time)." },
      end_seconds: { type: "number", minimum: 0, description: "Window end on the source clock, in seconds; at most 30 s after start_seconds." },
      stems: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", enum: ["drums", "bass", "other", "vocals"] }, description: "Stems to search. Default drums, bass, other: effects are mostly in drums, deep booms in bass, swells and tones in other; vocals holds speech." },
      events: { type: "array", maxItems: 32, description: "Sounds you already know about, so each gets its own unit with your label. Omit to detect attacks automatically.", items: { type: "object", additionalProperties: false, properties: {
        time_seconds: { type: "number", minimum: 0, description: "When the sound starts, on the source clock; snaps to a detected attack within 60 ms." },
        stem: { type: "string", enum: ["drums", "bass", "other", "vocals"], description: "Stem the sound is in. Omit to use the stem with an attack at that time." },
        label: { type: "string", maxLength: 60, description: "Short name, e.g. takeoff whoosh. Used in the unit's file name." },
      }, required: ["time_seconds"] } },
      max_units: { type: "integer", minimum: 1, maximum: 32, description: "Most units to return (default 12). Named events always count; detected ones keep the strongest, clearest attacks." },
      recreate: { anyOf: [{ type: "boolean" }, { type: "array", maxItems: 32, items: { type: "string" } }], description: "Also rebuild units as tunable synth sounds: true for all, or a list of unit names or labels. Default false." },
      import: { type: "boolean", description: "Import each unit into the project's media (default true) so it has a source_url for create_audio." },
      feedback_ids: { type: "array", items: { type: "string" }, description: "editing_feedback_record ids this responds to." },
      request: { type: "string", description: "The creator's request in brief, for the audit trail." },
      model: { type: "string", description: "Your model id, for the audit trail." },
    }, required: ["project_id", "start_seconds", "end_seconds"] },
    handler: ({ project_id, model, ...body }) => http("POST", `/api/projects/${encodeURIComponent(project_id)}/tools/sound-units`, { ...body, agent: { name: process.env.DREAMCUT_MCP_CLIENT || "editor-agent", ...(model ? { model } : {}) } }),
  },
  sound_synth_prepare: {
    description: "Create or revise an abstract sound effect (whoosh, hit, tick, riser, glitch) as code and render a WAV for a proposal. Use for motion-graphic sounds a library effect does not fit; prefer library sound effects for realistic sounds. synth_js defines function render({ sampleRate, controls, random }) returning { channels: [left, right?] } with samples in [-1, 1], at most 30 s; it runs isolated with no Node APIs, and Math.random is seeded, so the same source, values and seed give identical bytes. Optional controls: { schema_version: 1, controls: [...] } (number, choice, switch, text, color) read from controls.<id>; pass null to remove. Omit synth_js to re-render with new values or seed. Returns source_url and duration_seconds; propose it with create_audio. Records an audit trail; never edits the timeline or approves.",
    inputSchema: { type: "object", properties: {
      project_id: PROJECT_ID,
      sound_id: { type: "string", pattern: "^[A-Za-z0-9._-]{1,128}$", description: "Stable name, e.g. logo-whoosh. Reuse it to revise." },
      synth_js: { type: "string", description: "JavaScript defining function render({ sampleRate, controls, random }) that returns { channels: [left, right?] }." },
      controls: { anyOf: [{ type: "object" }, { type: "null" }], description: "Optional controls file { schema_version: 1, controls: [...] }; null removes it." },
      values: { type: "object", description: "Control values keyed by control id; omitted controls use their defaults." },
      seed: { type: "integer", minimum: 0, maximum: 4294967295, description: "Seed for random(); the same seed reproduces the same bytes. Default 1." },
      feedback_ids: { type: "array", items: { type: "string" }, description: "editing_feedback_record ids this responds to." },
      request: { type: "string", description: "The creator's request in brief, for the audit trail." },
      model: { type: "string", description: "Your model id, for the audit trail." },
    }, required: ["project_id", "sound_id"] },
    handler: ({ project_id, model, ...body }) => http("POST", `/api/projects/${encodeURIComponent(project_id)}/sounds/prepare`, { ...body, agent: { name: process.env.DREAMCUT_MCP_CLIENT || "editor-agent", ...(model ? { model } : {}) } }),
  },
  storyboard_get: {
    description:"Read the project's storyboard for planning: revision, mode, freeform beats with their shots (source, start/end seconds on the original source clock, label, note, on-screen text, transition, and visuals shown over each shot with at/duration on the shot clock) and every usable source with kind, duration and readiness, plus script {text, sections [{id, label, start, end, text, needs_review, visuals}]}: the Script panel's saved text and which visuals are linked to each section; plus canvas {nodes, edges}: the creator's planning canvas, where moment cards (marked points in clips: number M1…, clip, source, start/end seconds, note = what should happen there), effect cards (a template id and title plus a note) and text cards (directions, lines to say) are joined by lines (connected_to). Read the canvas to understand how the creator wants moments, effects and words put together before assembling. Use before storyboard_draft, storyboard_script_write, storyboard_script_link or storyboard_canvas_write. Read-only; no timeline changes.",
    inputSchema:{type:"object",properties:{project_id:PROJECT_ID},required:["project_id"]},
    handler:({project_id})=>http("GET",`/api/projects/${project_id}/storyboard/draft`),
  },
  storyboard_draft: {
    description:"Write the freeform storyboard when the creator asks you to plan or break up their footage (e.g. 'split my talking take into beats; this part gets the glitch animation'). Each shot points at a window of an original source; nothing is cut or re-encoded. Group shots into named beats from the creator's direction, write what happens in note, the on-screen text idea in text and the transition_into it. For a talking video, keep the speech as continuous shots and put each point's screenshot, mockup or motion graphic in that shot's visuals (shown over it while the audio continues); a separate photo shot would cut the speech. Build timeline places visuals on the lane above the talking clip: photos and videos float in as a card unless placement is full; motion graphic renders keep their own layout. Ground boundaries in evidence: speech_prepare for words and pauses, source_evidence to check the picture. Saved as one storyboard revision the creator removes with a single Undo; a changed board is refused (re-read with storyboard_get). Never touches the timeline or approves anything: the creator lays the board onto the timeline with Build timeline. Record their direction with editing_feedback_record first, then mark it answered with editing_feedback_disposition citing the returned revision. Do not use for edits to an existing timeline (use proposal_create) or for Follow-reference beats (use storyboard_reference_draft).",
    inputSchema:{type:"object",properties:{
      project_id:PROJECT_ID,
      revision:{type:"integer",minimum:0,description:"The revision returned by storyboard_get. The write is refused if the board changed since."},
      mode:{type:"string",enum:["replace","append"],default:"replace",description:"replace: these beats become the whole freeform story (the previous story stays one Undo away). append: add them after the existing shots."},
      beats:{type:"array",minItems:1,maxItems:200,description:"Beats in story order.",items:{type:"object",properties:{
        name:{type:"string",maxLength:240,description:"Beat name, e.g. 'Intro' or 'Product reveal'. Omit for a single ungrouped shot."},
        shots:{type:"array",minItems:1,maxItems:100,description:"Shots in this beat, in story order.",items:{type:"object",properties:{
        source:{type:"string",description:"Project source path from storyboard_get sources[].source, e.g. sources/talk.mp4. Must be a ready video or a photo."},
        start:{type:"number",minimum:0,description:"Shot start in seconds on the original source clock. Photos use 0."},
        end:{type:"number",minimum:0,description:"Shot end in seconds on the original source clock, at least one frame after start. For a photo, end is how long to hold it."},
        label:{type:"string",minLength:1,maxLength:240,description:"Short shot name the creator will scan, e.g. 'Hook: why I quit'."},
        note:{type:"string",maxLength:2000,description:"What happens in the shot: what is said (paraphrase or key line) and seen, plus the planned treatment, e.g. 'Glitch animation over the product reveal'."},
        text:{type:"string",maxLength:1000,description:"On-screen text idea for this shot, if any. Leave empty when none."},
        transition_into:{type:"string",maxLength:2000,description:"Planned transition into this shot from the previous one, e.g. 'mask glitch reveal'. Omit for a plain cut."},
        visuals:{type:"array",maxItems:20,description:"Cutaways shown OVER this shot while its picture and sound keep running (screenshot, mockup, B-roll, motion graphic for the point being made). In time order, no overlaps, each inside the shot. Put visuals for spoken points here, never as separate shots, which would cut the speech.",items:{type:"object",properties:{
          source:{type:"string",description:"Project photo or ready video from storyboard_get sources[].source, e.g. sources/dashboard.png."},
          at:{type:"number",minimum:0,description:"When it appears, in seconds from the shot's start (shot clock, not the source clock)."},
          duration:{type:"number",minimum:0.034,maximum:3600,description:"How long it stays on screen, in seconds. at + duration must fit inside the shot."},
          start:{type:"number",minimum:0,description:"Video visuals only: in-point on the visual's own source clock, in seconds; default 0. Omit for photos."},
          label:{type:"string",minLength:1,maxLength:240,description:"Short name the creator will scan, e.g. 'Pricing page screenshot'."},
          note:{type:"string",maxLength:2000,description:"What it shows or its planned treatment, e.g. 'zoom into the price'."},
          placement:{type:"string",enum:["float","full"],description:"float (default): screenshots and mockups rise in as a card beside the speaker. full: covers the frame, for title cards and section breaks. A motion graphic render (sources under hyperframes/, from motion_graphic_prepare) keeps its own layout in the edit; set float when it is drawn beside the speaker so the storyboard card shows it legibly."}},
          required:["source","at","duration","label"]}}},
      required:["source","start","end","label"]}}},required:["shots"]}}},
      required:["project_id","revision","beats"]},
    handler:({project_id,...body})=>http("POST",`/api/projects/${project_id}/storyboard/draft`,body),
  },
  storyboard_script_write: {
    description:"Write text into the Storyboard's Script panel when the creator asks (e.g. 'transcribe this and put it in the script', 'paste my outline into the script'). For a transcript: find the selected video with editor_context_get selection.items, run speech_prepare mode transcribe, poll asset_preparation_status, then write result.transcript.text here split into readable paragraphs at spoken points. Keep the speaker's words; ASR output still needs the creator's review, so never silently correct numbers or names. Blocks join as paragraphs; a block with section is also marked as a named script section. append (default) adds after the existing script; replace only when the creator asks. Saved as one storyboard revision the creator removes with a single Undo; a changed board is refused (re-read with storyboard_get, whose script field shows the current text). Never touches shots, media or the timeline. Do not use for shots and beats (storyboard_draft).",
    inputSchema:{type:"object",additionalProperties:false,properties:{
      project_id:PROJECT_ID,
      revision:{type:"integer",minimum:0,description:"The revision returned by storyboard_get. The write is refused if the board changed since."},
      mode:{type:"string",enum:["append","replace"],default:"append",description:"append (default): add after the existing script, or fill an empty one. replace: these blocks become the whole script and its sections (the previous script stays one Undo away); only when the creator asks to replace it."},
      blocks:{type:"array",minItems:1,maxItems:500,description:"Script paragraphs in reading order. The whole script holds at most 100000 characters and 500 sections.",items:{type:"object",additionalProperties:false,properties:{
        text:{type:"string",minLength:1,maxLength:20000,description:"One paragraph or passage, e.g. one spoken point from a transcript. Plain text or Markdown."},
        section:{type:"string",minLength:1,maxLength:240,description:"Name that marks this block as a script section, e.g. 'Opening scoreboard'. Omit to add plain text; mark sections only when the creator asked for them."},
      },required:["text"]}},
    },required:["project_id","revision","blocks"]},
    handler:({project_id,...body})=>http("POST",`/api/projects/${encodeURIComponent(project_id)}/storyboard/script`,body),
  },
  storyboard_script_link: {
    description:"Link visuals to parts of the Storyboard script when the creator asks (e.g. 'link these', 'put these three charts on these three sections', 'this screenshot goes with this part'). Read what they selected with editor_context_get selection.items: script items carry a section id or character offsets with the exact text; media items carry source paths. Pair them as the creator said (in selection order when they say 'in order'); ask when the pairing is ambiguous. A link names an existing section by section_id, or new text by start, end and quote (it becomes a named section). Visuals add to a section's links unless replace is true; linked visuals not yet in Storyboard Media are added to it. Saved as one storyboard revision the creator removes with a single Undo; a changed board or changed text is refused (re-read with storyboard_get, whose script.sections lists ids, offsets and visuals). Never touches shots or the timeline. Do not use to write script text (storyboard_script_write) or to plan shots (storyboard_draft).",
    inputSchema:{type:"object",additionalProperties:false,properties:{
      project_id:PROJECT_ID,
      revision:{type:"integer",minimum:0,description:"The revision returned by storyboard_get. The write is refused if the board changed since."},
      links:{type:"array",minItems:1,maxItems:100,description:"One entry per script section, each with the visuals that go with it.",items:{type:"object",additionalProperties:false,properties:{
        section_id:{type:"string",description:"An existing section's id (storyboard_get script.sections[].id, or a selected script item's agent_text). Omit for text that is not a section yet."},
        start:{type:"integer",minimum:0,description:"For text that is not a section yet: start character offset in script.text, from the selected item's agent_text."},
        end:{type:"integer",minimum:0,description:"End character offset (exclusive) in script.text."},
        quote:{type:"string",maxLength:100000,description:"The exact script text from start to end. The link is refused if the script changed."},
        label:{type:"string",minLength:1,maxLength:240,description:"Name for a section made from start/end, e.g. 'Thursday sell-off'. Defaults to its first words."},
        visuals:{type:"array",minItems:1,maxItems:50,items:{type:"string"},description:"Photo or video source paths (storyboard_get sources[].source) shown during this section."},
        replace:{type:"boolean",default:false,description:"true: these visuals replace the section's linked visuals. false (default): add to them."},
      },required:["visuals"]}},
    },required:["project_id","revision","links"]},
    handler:({project_id,...body})=>http("POST",`/api/projects/${encodeURIComponent(project_id)}/storyboard/script/link`,body),
  },
  storyboard_canvas_write: {
    description:"Change the Storyboard canvas when the creator asks you to lay out or connect their plan (e.g. 'mark these three stops and connect them to the speed effect', 'add a note that I say my line here'). Cards: moments (a marked point or range in a clip, with a note of what should happen), effects (a template from the Templates gallery, with a note) and text. Lines join cards. Changes apply in order as one revision-checked Undo step; any invalid change refuses the whole write. Nothing reaches the timeline. Read storyboard_get first.",
    inputSchema:{type:"object",additionalProperties:false,properties:{
      project_id:PROJECT_ID,
      revision:{type:"integer",minimum:0,description:"The revision returned by storyboard_get. The write is refused if the board changed since."},
      ops:{type:"array",minItems:1,maxItems:200,description:"Changes in order. Cards added here can be joined by their ref in later changes.",items:{type:"object",properties:{
        op:{type:"string",enum:["add_moment","add_effect","add_text","update","place","connect","disconnect","remove","arrange"],description:"add_moment {source,start,end?,note?}; add_effect {template_id,title,note?}; add_text {text}; update {id,note?|text?|start?|end?}; place {id,x,y}; connect {from,to,label?}; disconnect {edge_id}; remove {id} (removing a moment also removes its mark); arrange {} lays the canvas out as a vertical timeline (moments down the page in order, each with its own effect and text cards beside it)."},
        ref:{type:"string",maxLength:80,description:"Your name for a card added in this write, used by later connect/update/place/remove in the same write."},
        source:{type:"string",description:"add_moment: project source path (storyboard_get sources[].source)."},
        start:{type:"number",minimum:0,description:"add_moment/update: seconds on the clip's own clock."},
        end:{type:["number","null"],minimum:0,description:"add_moment/update: range end in seconds; omit (or null) for a single moment."},
        note:{type:"string",maxLength:4000,description:"Moment: what should happen there. Effect: how to apply it, e.g. 'zoom from each stop'."},
        template_id:{type:"string",description:"add_effect: a template id from the Templates gallery (agent template lookup), e.g. FX-SPEED-ENTRANCE-EXIT."},
        title:{type:"string",maxLength:240,description:"add_effect: the template's displayed title."},
        text:{type:"string",maxLength:4000,description:"add_text/update: the card's words."},
        id:{type:"string",description:"An existing card id (canvas.nodes[].id) or a ref from this write."},
        x:{type:"number",description:"Canvas position; omit to place after the last card of its kind."},
        y:{type:"number",description:"Canvas position; omit together with x to place automatically."},
        from:{type:"string",description:"connect: card id or ref."},
        to:{type:"string",description:"connect: card id or ref."},
        label:{type:"string",maxLength:120,description:"connect: optional short label on the line."},
        edge_id:{type:"string",description:"disconnect: a line id from canvas.edges[].id."},
      },required:["op"]}},
    },required:["project_id","revision","ops"]},
    handler:({project_id,...body})=>http("POST",`/api/projects/${encodeURIComponent(project_id)}/storyboard/canvas`,body),
  },
  storyboard_reference_draft: {
    description:"Write a Follow-reference recast plan when the creator asks to recreate a video with other people (e.g. 'remake this concert clip with me as the singer'): the reference video split into beats, the cast who replace its people (name plus project photos), and who appears in each beat left to right. Omit beats to split the reference at its shot cuts (longer shots split evenly to max_beat_seconds). Beats whose range is unchanged keep their chosen footage and generations. Saved as one storyboard revision the creator removes with a single Undo; a changed board is refused (re-read with storyboard_get). Never generates, charges or touches the timeline: the creator generates from the Storyboard's Recast button with the prices shown, chooses results as each beat's footage, then uses Build timeline. Use storyboard_recast_quote to report prices. Record the creator's direction with editing_feedback_record first.",
    inputSchema:{type:"object",additionalProperties:false,properties:{
      project_id:PROJECT_ID,
      revision:{type:"integer",minimum:0,description:"The revision returned by storyboard_get. The write is refused if the board changed since."},
      source:{type:"string",description:"The reference video to follow: a ready project video from storyboard_get sources[].source."},
      title:{type:"string",maxLength:240,description:"Name for the reference, e.g. 'Dangerous tour opening'."},
      cast:{type:"array",maxItems:20,description:"People who replace those in the reference.",items:{type:"object",additionalProperties:false,properties:{
        name:{type:"string",minLength:1,maxLength:100,description:"Who this is, as the creator would say it, e.g. 'Lead singer'."},
        photos:{type:"array",minItems:1,maxItems:4,items:{type:"string"},description:"Project photos of this person (storyboard_get sources[] with kind image); the first is the main face."},
        note:{type:"string",maxLength:500,description:"Wardrobe or look to keep, if any."}},required:["name","photos"]}},
      recast_model:{type:"string",enum:["h3-max-recast","wan-2.2-replace","kling-o1-edit","seedance-2-reference","seedance-2.5-reference"],default:"h3-max-recast",description:"Default model: h3-max-recast keeps the shot and swaps up to four people (needs 5–30 s; short beats are padded and trimmed back); wan-2.2-replace one person, cheapest; kling-o1-edit prompt edits of 3–10 s; seedance reference models regenerate the shot copying its camera and action."},
      beats:{type:"array",maxItems:100,description:"Beats in order without overlaps, on the reference's clock. Omit to split at shot cuts.",items:{type:"object",additionalProperties:false,properties:{
        start:{type:"number",minimum:0,description:"Beat start in seconds on the reference's clock."},
        end:{type:"number",minimum:0,description:"Beat end in seconds on the reference's clock."},
        label:{type:"string",minLength:1,maxLength:240,description:"Short beat name the creator scans, e.g. 'Frozen stance'."},
        original_text:{type:"string",maxLength:1000,description:"What the reference shows or says here."},
        text:{type:"string",maxLength:500,description:"Our on-screen text or lyric for this beat, if any."},
        cast:{type:"array",maxItems:4,items:{type:"string"},description:"Names from cast, left to right as they appear on screen."},
        prompt:{type:"string",maxLength:2500,description:"What else to keep or change in this beat."},
        model:{type:"string",enum:["h3-max-recast","wan-2.2-replace","kling-o1-edit","seedance-2-reference","seedance-2.5-reference"],description:"Override the default model for this beat."}},required:["start","end","label"]}},
      max_beat_seconds:{type:"number",minimum:1,maximum:30,default:15,description:"When splitting at cuts, longer shots are split evenly to this length."}},
      required:["project_id","revision","source"]},
    handler:({project_id,...body})=>http("POST",`/api/projects/${project_id}/storyboard/reference-draft`,body),
  },
  storyboard_recast_quote: {
    description:"Price recasting Follow-reference beats in DreamCut credits, per beat and in total, with the model and the reference window each would send (the beat padded to the model's shortest input). Defaults to beats that have cast and no footage yet. Free and read-only: no upload, generation or charge. Report the total to the creator; they generate with the Storyboard's Recast button.",
    inputSchema:{type:"object",additionalProperties:false,properties:{project_id:PROJECT_ID,beat_ids:{type:"array",maxItems:100,items:{type:"string"},description:"Beat ids from storyboard_get reference.beats[].id; omit for every beat with cast and no footage."}},required:["project_id"]},
    handler:({project_id,beat_ids})=>http("POST",`/api/projects/${project_id}/storyboard/recast`,{action:"quote",...(beat_ids?{beat_ids}:{})}),
  },
  sfx_search: {
    description: "Search the sound-effect Library (the shared catalog plus the creator's personal sounds) by words and editorial role. Returns ranked sounds with source_url (ready for create_audio), duration, measured loudness, where each sound's loudest moment falls (peak_time_seconds), editorial motion/intensity, tags, good_for/avoid_for, source_status and access (free, or members: DreamCut members only); personal: true marks the creator's own sounds. Ranking uses catalog metadata, not listening. Roles: entrance_accent, movement, payoff, reaction, interface, texture. Read-only; to choose for a specific moment use sfx_audition_prepare.",
    inputSchema: { type: "object", additionalProperties: false, properties: {
      project_id: PROJECT_ID,
      query: { type: "string", maxLength: 200, description: "Words for the sound, e.g. 'soft whoosh' or 'cash register'. Synonyms are expanded." },
      role: { type: "string", enum: ["entrance_accent", "movement", "payoff", "reaction", "interface", "texture"], description: "The sound's job: an element arriving, a visible movement, a reveal, a comic reaction, an on-screen interface action, or a background texture." },
      intensity: { type: "string", enum: ["light", "medium", "heavy"], description: "Preferred strength; sounds tagged with another intensity rank lower." },
      max_duration_seconds: { type: "number", exclusiveMinimum: 0, description: "Longest audible length to allow, in seconds." },
      limit: { type: "integer", minimum: 1, maximum: 20, description: "How many results to return; default 8." },
    }, required: ["project_id"] },
    handler: ({ project_id, ...body }) => http("POST", "/api/sfx-catalog/search", body),
  },
  sfx_audition_prepare: {
    description: "Prepare a sound-effect audition for one timeline moment. Give cue_seconds (timeline time the sound should land, e.g. an element's entrance) and the sound's role; optionally a query or up to 4 candidate_ids from sfx_search. Returns: what is on screen, entering or exiting near the cue; the words spoken around it and the next speech start; audio already playing; up to 4 candidates placed so each one's loudest moment lands on the cue, leveled toward -18 LUFS (6 dB lower over speech), each with a ready proposal_operation (create_audio on a free sound_effect lane); an image of every candidate's loudness envelope on the cue's time axis; and the run_instrument call that renders the picture at the cue. You cannot hear these sounds: choose plausible ones, then propose them as options of one card so the creator listens and picks. Read-only; no timeline changes.",
    inputSchema: { type: "object", additionalProperties: false, properties: {
      project_id: PROJECT_ID,
      cue_seconds: { type: "number", minimum: 0, description: "Timeline time, in seconds, where the sound's loudest moment should land." },
      role: { type: "string", enum: ["entrance_accent", "movement", "payoff", "reaction", "interface", "texture"], description: "The sound's job at this cue; guides ranking when candidate_ids are not given." },
      query: { type: "string", maxLength: 200, description: "Optional words for the sound, e.g. 'soft pop'." },
      candidate_ids: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" }, description: "Catalog ids from sfx_search to audition instead of searching." },
      max_candidates: { type: "integer", minimum: 1, maximum: 4, description: "How many candidates to place; default 3." },
      context_seconds: { type: "number", minimum: 0.5, maximum: 5, description: "Seconds of context on each side of the cue; default 1.5." },
    }, required: ["project_id", "cue_seconds", "role"] },
    handler: ({ project_id, ...body }) => http("POST", `/api/projects/${encodeURIComponent(project_id)}/tools/sfx-audition`, body),
  },
  visual_activity_prepare: {
    description: "Measure when things happen on screen, as activity curves over time, so a sound effect can follow the picture exactly. Use before any sound that accompanies something visible (drawing, camera moves, entrances, motion in footage), then again with check to verify. Give a timeline window (start_seconds, end_seconds, at most 60 s). Curves (0-1, timeline clock, rate values per second): draw (shape_draw and other draw keyframes), pen_speed and pen_turn (for drawn shapes: how fast the pen tip moves along the stroke and how sharply it turns, for handwriting sounds; pen_down_seconds lists each new stroke's touch-down), camera (camera keyframes), motion (other keyframed props), entrances (entrance/exit presets), cuts (hard appearances), frames (motion measured from decoded video frames: footage, or a HyperFrames render without activity_js), composition_<name> (read exactly from a HyperFrames scene's data by your activity_js), and total (all combined). Each curve reports onsets_seconds (where it starts rising), peaks and active_intervals, plus synth_embed: JavaScript to paste into sound_synth_prepare's synth_js so loudness follows activityAt(name, t). With check (sound_element_ids, proposal_id or sounds), returns per sound and for the mix: correlation of the loudness envelope with the curve, best lag, onset offsets in ms (sound minus picture), the share of sound energy with no visual cause, and pass/failures against r >= 0.6, median onset <= 40 ms, uncaused <= 15%; for drawn strokes also turns (how much the sound changes at each sharp pen turn, >= 1.25x passes). Read-only; never edits the timeline.",
    inputSchema: { type: "object", additionalProperties: false, properties: {
      project_id: PROJECT_ID,
      start_seconds: { type: "number", minimum: 0, description: "Window start on the timeline clock, in seconds." },
      end_seconds: { type: "number", minimum: 0, description: "Window end on the timeline clock, in seconds; at most 60 s after start_seconds." },
      element_ids: { type: "array", maxItems: 100, items: { type: "string" }, description: "Only these visual elements (default: every visual element in the window). Use to follow one actor." },
      rate: { type: "integer", minimum: 20, maximum: 200, description: "Curve values per second; default 100." },
      measure_frames: { type: "string", enum: ["auto", "never"], description: "auto (default) measures motion from decoded frames for video clips without scene data; never skips that (faster, keyframes only)." },
      composition_activity: { type: "array", maxItems: 6, description: "Exact timing for HyperFrames clips from their own scene data, instead of measuring the render.", items: { type: "object", additionalProperties: false, properties: {
        element_id: { type: "string", description: "The timeline clip that shows the composition's render." },
        activity_js: { type: "string", description: "JavaScript defining function activity({ window, duration, rate, helpers }) that returns { curves: { name: number[] }, onsets?: { name: number[] } } on the composition clock from 0 s at rate values per second. window holds what the scene scripts set (e.g. window.FLIGHT). helpers: curve() a zeroed array covering duration, spread(curve, t0, t1, amount) adds amount evenly over t0-t1 s, int16(base64) and bytes(base64) decode packed data. No Node APIs, 10 s limit." },
        scripts: { type: "array", maxItems: 8, items: { type: "string" }, description: "Composition-folder .js files that define the scene data, run first in order; default scene.js." },
      }, required: ["element_id", "activity_js"] } },
      include_values: { type: "boolean", description: "Also return every curve's values (large). Default false; synth_embed already carries them." },
      check: { type: "object", additionalProperties: false, description: "Verify sounds against the curve.", properties: {
        curve: { type: "string", description: "Curve to compare with, e.g. draw or composition_shore; default total." },
        sound_element_ids: { type: "array", maxItems: 12, items: { type: "string" }, description: "Sound elements already on the timeline." },
        proposal_id: { type: "string", description: "A proposal whose create_audio sounds to check (its recommended option unless option_id)." },
        option_id: { type: "string", description: "Which option of proposal_id to check." },
        sounds: { type: "array", maxItems: 12, description: "Sounds not yet proposed, e.g. a sound_synth_prepare render, placed as you intend to propose them.", items: { type: "object", additionalProperties: false, properties: {
          source_url: { type: "string", description: "Project media URL (from sound_synth_prepare) or a Library source_url." },
          timeline_start: { type: "number", minimum: 0, description: "Where the sound would start on the timeline, in seconds." },
          source_start_seconds: { type: "number", minimum: 0, description: "In-point in the sound file, seconds; default 0." },
          source_end_seconds: { type: "number", minimum: 0, description: "Out-point in the sound file, seconds; default the file end." },
          volume: { type: "number", minimum: 0, description: "Linear gain as proposed; default 1." },
          playback_rate: { type: "number", minimum: 0.25, maximum: 4, description: "Playback speed as proposed; default 1." },
          title: { type: "string", description: "Label for the report." },
        }, required: ["source_url", "timeline_start"] } },
      } },
    }, required: ["project_id", "start_seconds", "end_seconds"] },
    handler: ({ project_id, ...body }) => http("POST", `/api/projects/${encodeURIComponent(project_id)}/tools/visual-activity`, body),
  },
  media_readiness: {
    description:"Prepare, inspect or explicitly retry a project video preview using the existing worker. Reuses ready/running work. Returns stable job_id, readiness, failure and next action. No timeline changes or optional analysis enablement; readiness is not visual acceptance.",
    inputSchema:{type:"object",properties:{project_id:PROJECT_ID,source:{type:"string"},action:{type:"string",enum:["prepare","status","retry"],default:"status"}},required:["project_id","source"]},
    handler:({project_id,...body})=>http("POST",`/api/projects/${project_id}/tools/media-readiness`,body),
  },
  surface_track_prepare: {
    description: "Prepare a planar surface track for editable text without changing the timeline. Supply an active local video parentId, original-source start/end/reference seconds (at most 15 seconds), and four normalized corners ordered TL/TR/BR/BL at the reference. Returns a durable job id; poll surface_track_status. Inspect corners and visibility before proposing create_text.surface_track. Text remains native and editable; no generation or model downloads. Lost samples are hidden; manual correction is available in Text properties.",
    inputSchema: {type:"object",properties:{project_id:PROJECT_ID,parentId:{type:"string"},start:{type:"number",minimum:0},end:{type:"number",minimum:0},reference:{type:"number",minimum:0},quad:{type:"array",minItems:4,maxItems:4,items:{type:"array",minItems:2,maxItems:2,items:{type:"number",minimum:0,maximum:1}}},retry:{type:"boolean"}},required:["project_id","parentId","start","end","reference","quad"]},
    handler:({project_id,...body})=>http("POST",`/api/projects/${project_id}/analysis/surface-tracking`,body),
  },
  surface_track_status: {
    description:"Read a surface tracking job and its source-time corner samples. Completion does not prove visual accuracy or approve placement. Failed/interrupted jobs can be explicitly retried with the original request. No timeline writes.",
    inputSchema:{type:"object",properties:{project_id:PROJECT_ID,job_id:{type:"string"}},required:["project_id","job_id"]},
    handler:({project_id,job_id})=>http("GET",`/api/projects/${project_id}/analysis/surface-tracking?id=${encodeURIComponent(job_id)}`),
  },
  cutout_prepare: {
    description: "Prepare a requested moving subject cutout without timeline edits. Reuses hash-verified source/window/prompt/model/mask results; otherwise queues local SAM2. Provide observed normalized points and subject inclusion (e.g. person including hands). Intake alone does not authorize segmentation. Returns job_id as id; poll cutout_status. Completion is not visual approval; preview preparation must also be ready. Optional parent_cutout_id records a re-prompt revision preserving its full source window. Failed requests require retry=true. No automatic downloads.",
    inputSchema: {type:"object",properties:{project_id:PROJECT_ID,source_relative_path:{type:"string"},start_seconds:{type:"number",minimum:0},end_seconds:{type:"number"},prompt_seconds:{type:"number"},subject:{type:"string",minLength:1,maxLength:500},positive_points:{type:"array",minItems:1,maxItems:16,items:{type:"object",properties:{x:{type:"number",minimum:0,maximum:1},y:{type:"number",minimum:0,maximum:1}},required:["x","y"]}},negative_points:{type:"array",maxItems:16,items:{type:"object",properties:{x:{type:"number",minimum:0,maximum:1},y:{type:"number",minimum:0,maximum:1}},required:["x","y"]}},parent_cutout_id:{type:"string"},retry:{type:"boolean"}},required:["project_id","source_relative_path","start_seconds","end_seconds","prompt_seconds","subject","positive_points"]},
    handler:({project_id,...body})=>http("POST",`/api/projects/${project_id}/analysis/cutout-preparation`,body),
  },
  cutout_status: {
    description:"Read cutout job, immutable receipt and separate preview preparation state. Publishes verified grayscale masks as grid_matte_mask for native moving grid matte controls; the same mask is the subject_window_mask that lets other clips show only inside (or outside) this subject's moving shape via subject_window_parent_id. Checks source/output/mask hashes for completed jobs. visual_verification=not_performed means inspect edges and motion before proposing placement. No timeline changes.",
    inputSchema:{type:"object",properties:{project_id:PROJECT_ID,job_id:{type:"string"}},required:["project_id","job_id"]},
    handler:({project_id,job_id})=>http("POST",`/api/projects/${project_id}/analysis/cutout-preparation`,{action:"status",job_id}),
  },
  cutout_setup: {
    description: "Install subject tracing (the local SAM 2.1 model and its Python environment, about 1 GB, once), which cutout_prepare and every cutout template need. action status reports ready, installing, needs_update or failed with the last log lines. action install starts the download in the background; call it only after the creator agrees to the download, then poll status. No project or timeline changes.",
    inputSchema: { type: "object", additionalProperties: false, properties: {
      action: { type: "string", enum: ["status", "install"], default: "status", description: "status: is it installed. install: start the one-time download after the creator agrees." },
    } },
    handler: ({ action = "status" }) => mattingSetup(action),
  },
  cutout_correct: {
    description:"Create an immutable union/intersection correction using two prepared cutout receipts with identical source hash, interval, cadence and geometry. Requires explicit half-open zero-based frame range and normalized ROI [left,top,right,bottom]. Unaffected mask frames are copied byte-identically; pixels outside ROI remain unchanged. Parents are preserved. Use cutout_prepare with parent_cutout_id for new SAM points. No arbitrary scripts or timeline edits; poll cutout_status and inspect result.",
    inputSchema:{type:"object",properties:{project_id:PROJECT_ID,parent_cutout_id:{type:"string"},other_cutout_id:{type:"string"},mode:{type:"string",enum:["union","intersection"]},frame_start:{type:"integer",minimum:0},frame_end:{type:"integer",minimum:1},roi:{type:"array",minItems:4,maxItems:4,items:{type:"number",minimum:0,maximum:1}},retry:{type:"boolean"}},required:["project_id","parent_cutout_id","other_cutout_id","mode","frame_start","frame_end","roi"]},
    handler:({project_id,...body})=>http("POST",`/api/projects/${project_id}/analysis/cutout-preparation`,body),
  },
  source_evidence: {
    description:"Deliver a cached contact sheet as an actual MCP image plus source hash and per-cell requested source times (row-major order). Supply 1–12 times within a project video. Use for point selection and source inspection. Not frame-exact PTS, motion or timeline-composite proof; use frame-state for timeline judgments. No timeline edits.",
    inputSchema:{type:"object",properties:{project_id:PROJECT_ID,source_relative_path:{type:"string"},times_seconds:{type:"array",minItems:1,maxItems:12,items:{type:"number",minimum:0}}},required:["project_id","source_relative_path","times_seconds"]},
    handler:({project_id,...body})=>http("POST",`/api/projects/${project_id}/analysis/source-evidence`,body),
  },
  color_look_cards: {
    description:"Give clips the look of another clip on the working timeline: 'make this shot match that one', 'use the opening's grade on these'. Returns one ready proposal per target clip (proposals[].proposal) to pass unchanged to proposal_create, with a plain-language summary of what changes. mode match (default) measures both pictures as they display and moves only the target's exposure, contrast, highlights, temperature, tint and saturation toward the reference, each within a limited reach; also returns CIELAB distance_before/distance_after (under about 2 reads as matched). mode same gives the target the reference's whole grade (sliders, wheels, curves, one-color changes and look file). Clips that already match are listed in skipped. Saves and applies nothing; the creator previews, tunes and applies each card.",
    inputSchema:{type:"object",properties:{
      project_id:PROJECT_ID,
      reference_element_id:{type:"string",description:"The clip whose look to take (video_clip or still on the working timeline)."},
      target_element_ids:{type:"array",minItems:1,maxItems:20,items:{type:"string"},description:"The clips to change; each gets its own card."},
      mode:{type:"string",enum:["match","same"],default:"match",description:"match: measure and even out brightness and colour toward the reference. same: copy the reference's whole grade."},
    },required:["project_id","reference_element_id","target_element_ids"]},
    handler:({project_id,...body})=>http("POST",`/api/projects/${project_id}/analysis/look-cards`,body),
  },
  proposal_reveal_sequence: {
    description: "Compile prepared moving-subject reveals into an ordinary proposal option; no media jobs, file writes or approval. Default gap_mode=shared exposes one Time between entrances dial. Choose independent only for requested per-gap tuning. Actors identify existing create_visual operations by element_id and optional linked create_audio IDs/offsets. Optional presence {seconds,min_seconds,max_seconds} adds bounded source-duration dials. Provide a base option without timing_controls; preserve needed appearance review_controls. Returns option and compile_ms. Run normal preflight and proposal_create afterward; the server counts the changes. Maximum 15 visible numeric sliders; oversized edits must become smaller reviewable proposals, preserving dependencies.",
    inputSchema: { type: "object", properties: {
      project_id: PROJECT_ID, option: {type:"object"}, start_seconds: {type:"number",minimum:0},
      gap_mode: {type:"string",enum:["shared","independent"],default:"shared"},
      gap_seconds: {type:"number",default:0.4}, min_gap_seconds: {type:"number",default:0.2}, max_gap_seconds: {type:"number",default:0.8},
      actors: {type:"array",minItems:2,maxItems:16,items:{type:"object",properties:{element_id:{type:"string"},label:{type:"string"},presence:{type:"object",properties:{seconds:{type:"number"},min_seconds:{type:"number"},max_seconds:{type:"number"}},required:["seconds","min_seconds","max_seconds"]},audio:{type:"array",items:{type:"object",properties:{element_id:{type:"string"},offset_seconds:{type:"number"}},required:["element_id"]}}},required:["element_id","label"]}},
    },required:["project_id","option","start_seconds","actors"]},
    handler: ({project_id,...body}) => http("POST", `/api/projects/${project_id}/timeline/proposals/reveal-sequence`, body),
  },
  proposal_work_record: {
    description: "Record private proposal latency evidence outside the editor UI. Start when handling a request; use returned attempt_id. begin phase returns span_id; end it with completed, failed or reused. Phases: preparation, composition, validation, engineering, verification, waiting. After proposal_create record saved with proposal_id; record handoff only after verification and all spans end. report returns elapsed times and coverage limits. No timeline changes. Marked durations are not exact original-message latency or token cost; overlapping spans are not additive.",
    inputSchema: {type:"object",properties:{project_id:PROJECT_ID,action:{type:"string",enum:["start","begin","end","saved","handoff","report"]},attempt_id:{type:"string"},span_id:{type:"string"},phase:{type:"string",enum:["preparation","composition","validation","engineering","verification","waiting"]},outcome:{type:"string",enum:["completed","failed","reused"]},proposal_id:{type:"string"},feedback_ids:{type:"array",items:{type:"string"}}},required:["project_id","action"]},
    handler: ({project_id,...body}) => http("POST", `/api/projects/${project_id}/timeline/proposals/work`, body),
  },
  proposal_create: {
    description:
      "EDIT means proposing a specific change for approval (one result by default). AUDITION means "
      + "two or more alternatives to the same question for user choice; use mutually exclusive options "
      + "here to audition against an existing cut, preserving its full picture and speech clock. "
      + "Independent changes are separate edits, not alternatives. Recommendation/playback is not selection or approval. "
      +
      "Record material direction with editing_feedback_record and include its IDs in proposal.responds_to_feedback_ids. "
      + "Persist a proposal for human review — changes NOTHING until approved. "
      + "Writes must be Browser GPU (CanvasKit) admissible: content it cannot draw yet is rejected (422) naming the element and capability. "
      + "THE DEFAULT for "
      + "every agent-requested edit to a working timeline, even an exact user dictate; the user "
      + "does not need to ask for a proposal. The human previews each option in the player "
      + "(Play / Play all), tweaks proposed numeric values, and approves or rejects in the "
      + "editor's Proposals tab. Carries options[{id,label,recommended,summary,operations[],blocks[]}] "
      + "with exactly one recommended. PREFER BLOCKS for effects the registry has: option.blocks = [{block_id, kind, version, inputs, settings}] "
      + "(kinds: hop_sequence for the Speed Entrance & Exit effect, live_hold, keyframed_move). You send measured inputs (sources, cut-out receipts with their "
      + "source_offset_seconds, subject boxes, settle and takeoff frames) and only the settings that depart from the defaults; the server compiles them to "
      + "frame-snapped, non-overlapping operations after `operations` on every preview, dial move and approval, and the block's settings are the card's dials "
      + "(no review_controls or timing_controls needed). A block is refused by block id and setting name when a setting's range cannot compile. "
      + "Each option may expose at most 15 first-class numeric sliders (linked controls count once); every remaining supported dial is available under Advanced adjustments. Break larger edits into smaller reviewable proposals; keep dependencies atomic or stage later pieces after human approval. Never hide requested dials or use alternative options to bypass the cap. Set option.review_controls to the useful controls for this edit, "
      + "as ordered {operation_index,target,field} references to supported fields configured in the operations or applicable native-transition registry defaults. The plan selects main controls, not access; other supported dials remain in Advanced adjustments. "
      + "Layout edits need size and X/Y; handwriting needs drawing duration; audio needs level/fades. "
      + "For speed, hold or reveal decisions, declare option.review_questions=['speed','hold','reveal'] using only the applicable questions and include their supported review_controls in the first draft. A hold needs a bound timing_controls entry with kind='hold'; do not substitute an unsafe duration slider. "
      + "Protect accepted choices outside the requested change with option.preserve_fields=[{element_id,fields:['source_url','props.media_offset_x','props.media_offset_y']}], using the applicable fields. These are enforced against the derived preview and approval; omit fields the user actually wants changed. "
      + "Never expose source URLs or fingerprints as controls. Each option MUST contain one independently reviewable "
      + "actor or adjustment: one image, one annotation, one ad, one animation, one caption "
      + "treatment, or one grade decision. Never combine separately tweakable actors or judgments. "
      + "Couple only operations whose partial application would leave broken state, "
      + "Independent units may be created together as separate proposals with "
      + "rebase_policy='independent'; approval revalidates and rebases only non-overlapping siblings. "
      + "When a revised or consolidated card intentionally replaces earlier pending drafts, set "
      + "supersedes_proposal_ids to those proposal ids. They remain untouched while the successor is pending; "
      + "approving the successor resolves them as superseded in the same human action. "
      + "Operations may edit an existing element, remove an internal source interval with "
      + "speed_change (factor, ripple_lane_keys; on the speaker clip) speeds the speaker and every later clip on the named lanes together, keeping animation and voice-bound captions in step; its factor is the card's Speed dial. "
      + "source_range_cut (source_start_seconds/source_end_seconds; optional ripple_lane_keys limits edits to named lanes including the target lane, preserving other lanes; omitted means every affected lane), or use "
      + "create_audio with explicit full-source and source-window seconds. create_transition adds a native transition between adjacent touching visual clips; supply a unique element_id for the transition and from_element_id, to_element_id, type, duration_seconds, and optional params. Authored proof "
      + "plates, annotations, ads, and motion graphics must be separate create_visual still "
      + "operations on separately registered visual lanes whenever they overlap; lane_index "
      + "does not create a lane. Use set_lane_order in the same option to register compositing order. "
      + "Use create_text for independently timed native graphic labels; it creates editable caption_text "
      + "actors without replacing or claiming ownership of the speech-caption rail; use remove_text to retire "
      + "an obsolete graphic-text actor without touching the speech-caption rail. "
      + "Generated video-effects are rejected unless they use an allowlisted "
      + "derived-effect role backed by an editable effect graph. Use remove_visual to retire "
      + "a visual in the same atomic option. Use set_output_format when the proposed edit changes "
      + "the real delivery canvas or target; preview and approval stay atomic with the clip edit. Default to "
      + "semantic placement: replace_captions accepts position_preset and rejects "
      + "absolute or offset coordinates; the renderer and spatial assessor resolve the named preset. "
      + "For visual actors, props.semanticLayout and create_visual.semanticLayout accept a named 3x5 safe-grid slot, size class, and optional "
      + "named-slot motion; deterministic code derives the internal transform keyframes. "
      + "Place text and drawn shapes by relation: create_text.place / create_shape.place / props.place = {relative_to: element id or ids, side: below|above|left|right|inside, gap, align}; "
      + "code computes the position, keeps it there when the anchor moves or is tuned, shows it through the anchor's camera, and gives the card Side and Gap dials. "
      + "Coordinates on text or shapes (absX/absY, media_offset_x/y) are refused unless the option sets coordinate_fallback_reason (no relation fits, the creator asked for exact values, or a measuring tool such as svg_pieces_compile supplied them); "
      + "a position preset beside coordinates is always refused, and a placed element that lands on its own anchor is refused. "
      + "operations[].rationale is agent-authored prose. Staging runs the scoped spatial check itself for every option "
      + "that can move or cover something and returns spatial_review (introduced, resolved and worsened overlaps between "
      + "changed actors and their neighbours) plus a warning for any new overlap; repair it with a superseding proposal "
      + "unless the overlap is intended. Shapes are included and actors are judged through any camera they follow; spatial_review "
      + "also names overlaps with what other pending cards add. An option whose text or drawn shapes cover the speaker's face is "
      + "refused unless it sets speaker_overlap_intended because the creator asked for that. Use proposal_spatial_preflight only to try a layout before staging it.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: PROJECT_ID,
        proposal: { ...proposalBodySchema(PROPOSAL_SCHEMA), description: "Schema-2 proposal body; project_id defaults to the top-level project_id. Runtime validation additionally enforces mutation counts, dependencies, source readiness and human review." },
        personal_style: { type: "object", description: "When reusing an explicitly requested style, pin its id and revision. The saved proposal pins the local parameter snapshot by id, revision and hash; report preserved settings and gaps in its human-readable rationale.", properties: {id:{type:"string"},revision:{type:"integer",minimum:1}},required:["id","revision"],additionalProperties:false },
      },
      required: ["project_id", "proposal"],
    },
    handler: ({ project_id, proposal: draft, personal_style }) => {
      const proposal = proposalForProject(project_id, draft);
      for (const option of proposal?.options ?? []) {
        assertSemanticTrimOperations(option.operations ?? [], { inProposal: true });
      }
      return http("POST", `/api/projects/${project_id}/timeline/proposals`, personal_style ? { proposal, personal_style } : proposal);
    },
  },
  proposal_spatial_preflight: {
    description:
      "Optional dry run: validate an exact draft proposal and run the same scoped spatial check proposal_create runs, without saving. Use it for layout-heavy work (captions, multi-clip placement, reveal sequences) to iterate before staging; ordinary edits go straight to proposal_create. Returns control_inventory per element: configured values, actual changes, supported dial metadata and selected review controls. For new placement normally expose X, Y and size together. "
      + "Nothing is persisted. Each option is assessed only within the before/after timeline spans of "
      + "the visual or caption actors it changes, and overlap pairs must involve a changed actor. "
      + "The response separates introduced, resolved, and remaining issues so unrelated warnings from "
      + "the rest of the video do not overwhelm proposal review. Lane-order and output-format changes "
      + "correctly expand to the full active visual span because their effects are global. Use the same "
      + "proposal body in proposal_create after addressing or explicitly accepting the scoped findings.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: PROJECT_ID,
        // The proposal shape is published once, on proposal_create; repeating it here doubled
        // every session's tool context. Calls are still checked against the full schema.
        proposal: { type: "object", description: "The exact proposal body you will pass to proposal_create: same schema and fields (see proposal_create.proposal). Validated in full here; nothing is persisted." },
      },
      required: ["project_id", "proposal"],
    },
    validationTool: "proposal_create",
    handler: ({ project_id, proposal: draft }) => {
      const proposal = proposalForProject(project_id, draft);
      for (const option of proposal?.options ?? []) {
        assertSemanticTrimOperations(option.operations ?? [], { inProposal: true });
      }
      return http("POST", `/api/projects/${project_id}/timeline/proposals/preflight`, { proposal });
    },
  },
  compound_prepare: {
    description: "Prepare a seamless presenter compound from 2–32 adjacent silent alpha video sections on one lane with identical static appearance. With proposal_id, attaches a disposable continuous 30 fps VP9-alpha cache to that proposal preview and its eventual matching approved timeline without creating another proposal. Without proposal_id, creates the existing reviewable grouping proposal. Preserves source clips, audio/caption links and export authority; never approves or modifies the working timeline.",
    inputSchema: {type:"object",properties:{project_id:PROJECT_ID,element_ids:{type:"array",items:{type:"string"},minItems:2,maxItems:32},label:{type:"string"},proposal_id:{type:"string"},option_id:{type:"string"}},required:["project_id","element_ids"]},
    handler: ({project_id,element_ids,label,proposal_id,option_id}) => http("POST", `/api/projects/${project_id}/timeline/compounds`, {element_ids,...(label?{label}:{}),...(proposal_id?{proposal_id}:{}),...(option_id?{option_id}:{})}),
  },
  proposal_list: {
    description: "List proposals with their status. A pending card with stale true no longer applies (stale_reason says why); when it carries agent_request, the creator pressed Repair: do what agent_request.prompt says, which ends in a replacement proposal_create naming the card in supersedes_proposal_ids. Never approves or repairs anything itself.",
    inputSchema: {
      type: "object",
      properties: { project_id: PROJECT_ID },
      required: ["project_id"],
    },
    handler: ({ project_id }) => http("GET", `/api/projects/${project_id}/timeline/proposals`),
  },
  proposal_get: {
    description: "Read one proposal plus derived review rows (verb/target/before→after).",
    inputSchema: {
      type: "object",
      properties: { project_id: PROJECT_ID, proposal_id: { type: "string" } },
      required: ["project_id", "proposal_id"],
    },
    handler: ({ project_id, proposal_id }) =>
      http("GET", `/api/projects/${project_id}/timeline/proposals/${proposal_id}`),
  },
  proposal_preview: {
    description: "Read-only candidate preview. For combined edits pass selections in review order; validates them together using the same derivation and protections as human Apply. Omitted overrides use saved review tuning; explicit [] previews authored defaults. For a single edit pass proposal_id and option_id instead; never send both modes. Read proposal_get.tuned_baseline before revising a tuned draft. Never approves or writes a timeline.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: PROJECT_ID,
        proposal_id: { type: "string" },
        option_id: { type: "string" },
        selections: { type: "array", minItems: 1, maxItems: 100, items: {
          type: "object", additionalProperties: false,
          properties: { proposal_id: { type: "string" }, option_id: { type: "string" },
            overrides: { type: "array", maxItems: 500, items: { type: "object", additionalProperties: false,
              properties: { operation_index: { type: "integer", minimum: 0 }, target: { type: "string", enum: ["create_transition", "create_audio", "create_visual", "create_text", "create_shape", "opening_sequence_edit", "source_range_cut", "speed_change", "patch", "props", "timing_control"] }, field: { type: "string" }, value: { type: ["number", "string"] } },
              required: ["operation_index", "target", "field", "value"] } } },
          required: ["proposal_id", "option_id"],
        } },
      },
      // Exactly one mode (selections XOR proposal_id + option_id) is enforced by the handler;
      // oneOf/not are outside the portable tool-schema subset.
      required: ["project_id"],
    },
    handler: ({ project_id, proposal_id, option_id, selections }) => {
      if (selections !== undefined ? proposal_id !== undefined || option_id !== undefined : !proposal_id || !option_id) throw new Error("Choose selections or a single proposal_id and option_id");
      return selections !== undefined
        ? http("POST", `/api/projects/${project_id}/timeline/proposals/batch/preview`, { selections })
        : http("POST", `/api/projects/${project_id}/timeline/proposals/${encodeURIComponent(proposal_id)}/preview`, { option_id });
    },
  },
  audition_create: {
    description:
      "AUDITION means multiple alternatives for user choice; EDIT means a proposed change for approval. "
      + "This tool creates a NEW dedicated source/take audition project. Use it when comparing sources "
      + "in a separate project is the intended context. For music/SFX or treatment alternatives against "
      + "a working cut, use proposal_create options on that original project; new media alone is not "
      + "a reason to use this tool. The command refuses to overwrite an existing project, preserves each source "
      + "with explicit handles, builds browser-friendly previews and thumbnails, assembles "
      + "phrase-safe cuts from visible editable source segments, places candidates back-to-back, "
      + "mounts optional candidate music as visible editable timeline "
      + "elements rather than baking it into video, and writes the validated Assets → Audition manifest with no "
      + "winner selected.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: PROJECT_ID,
        title: { type: "string" },
        section_id: { type: "string" },
        section_label: { type: "string" },
        script_text: { type: "string" },
        source_note: { type: "string" },
        delivery_target: {
          type: "string",
          enum: ["web", "feed", "reels", "tiktok", "shorts"],
        },
        output_aspect_ratio: { type: "string", enum: OUTPUT_ASPECT_RATIOS },
        append_to_existing: {
          type: "boolean",
          description: "Append a new section to an existing audition project. The project must already be an audition workspace.",
        },
        placement: {
          type: "string",
          enum: ["prepend", "append"],
          description: "Where the new section appears in the comparison timeline. Defaults to append.",
        },
        candidates: {
          type: "array",
          minItems: 2,
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              source_path: { type: "string" },
              audio_path: { type: "string" },
              audio_label: { type: "string" },
              audio_source_start_seconds: { type: "number", minimum: 0 },
              audio_source_end_seconds: { type: "number", exclusiveMinimum: 0 },
              audio_source_status: {
                type: "string",
                enum: ["licensed", "owned", "generated", "unknown"],
              },
              pass_label: { type: "string" },
              source_label: { type: "string" },
              source_start_seconds: { type: "number", minimum: 0 },
              source_end_seconds: { type: "number", exclusiveMinimum: 0 },
              segments: {
                type: "array",
                minItems: 1,
                items: {
                  type: "object",
                  properties: {
                    source_start_seconds: { type: "number", minimum: 0 },
                    source_end_seconds: { type: "number", exclusiveMinimum: 0 },
                    outgoing_word: { type: "string" },
                    incoming_word: { type: "string" },
                    reason: { type: "string" },
                  },
                  required: ["source_start_seconds", "source_end_seconds"],
                },
              },
            },
            required: ["id", "label", "source_path"],
          },
        },
      },
      required: [
        "project_id",
        "title",
        "section_id",
        "section_label",
        "script_text",
        "source_note",
        "candidates",
      ],
    },
    handler: async (request) => {
      const encoded = Buffer.from(JSON.stringify(request), "utf8").toString("base64");
      const result = await runEditorScript(
        "build-take-audition",
        ["--request-base64", encoded],
        30 * 60 * 1000,
      );
      if (result.exit_code !== 0) throw scriptFailure("audition_create", result, "Audition build failed");
      const lines = result.stdout.trim().split("\n").filter(Boolean);
      return JSON.parse(lines.at(-1));
    },
  },
  proposal_approve: {
    description:
      "Apply one proposal option atomically (one history snapshot). 409s if the timeline moved "
      + "since the proposal was made. Requires the human's approval decision — do not approve "
      + "your own proposal without an explicit human go.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: PROJECT_ID,
        proposal_id: { type: "string" },
        option_id: { type: "string" },
      },
      required: ["project_id", "proposal_id", "option_id"],
    },
    handler: ({ project_id, proposal_id, option_id }) =>
      http("POST", `/api/projects/${project_id}/timeline/proposals/${proposal_id}/approve`, {
        option_id,
      }),
  },
  proposal_reject: {
    description: "Reject a proposal. Never touches the timeline.",
    inputSchema: {
      type: "object",
      properties: { project_id: PROJECT_ID, proposal_id: { type: "string" } },
      required: ["project_id", "proposal_id"],
    },
    handler: ({ project_id, proposal_id }) =>
      http("DELETE", `/api/projects/${project_id}/timeline/proposals/${proposal_id}`),
  },
  history_restore: {
    description:
      "Restore a history snapshot by id (timeline + metadata + review marks + auditions + any "
      + "embedded layout proposals). Snapshot ids come from mutation responses' history "
      + "descriptors or projects/<id>/history/.",
    inputSchema: {
      type: "object",
      properties: { project_id: PROJECT_ID, snapshot_id: { type: "string" } },
      required: ["project_id", "snapshot_id"],
    },
    handler: ({ project_id, snapshot_id }) =>
      http("POST", `/api/projects/${project_id}/timeline/history/restore`, { snapshot_id }),
  },
  run_instrument: {
    description:
      "Run a read-only instrument and return its output. frame-state renders stills + measured "
      + "caption geometry at every caption change. Its frame-state-changes.json indexes changed/new samples and points to the full report with a checksum; it never waives review for a new question. For repeated local frame checks, --warm-renderer opts into a private worker that expires after 30 idle seconds and resets when dependencies change. qc runs deterministic timeline QC; "
      + "preview-readiness verifies playback topology facts; project-health reports storage/"
      + "row counts. Compute timing/geometry/counts with instruments — never eyeball them. "
      + "Render/verify/export are deliberately not exposed: rendering is delivery and needs an "
      + "explicit human request.",
    inputSchema: {
      type: "object",
      properties: {
        instrument: {
          type: "string",
          enum: ["frame-state", "qc", "preview-readiness", "project-health"],
        },
        project_id: PROJECT_ID,
        extra_args: {
          type: "array",
          maxItems: 12,
          items: { type: "string", maxLength: 200 },
          description: "Optional instrument flags from a fixed allowlist. frame-state: --at <timeline seconds, comma-separated>, --expect-gap <captionId:visualId:minPx:maxPx>, --variant <style>, --warm-renderer, --fresh-browser, --no-cache. qc: --target <tiktok|reels|shorts|feed|web>, --json, --estimate-only. project-health: --json. preview-readiness: none. Output paths, base URLs and proposal files are not accepted.",
        },
      },
      required: ["instrument", "project_id"],
    },
    handler: async ({ instrument, project_id, extra_args }) => {
      const args = instrumentArgs(instrument, project_id, extra_args);
      return instrumentResult(instrument, project_id, await runEditorScript(instrument, args), { root: EDITOR_ROOT, projectsDir: projectsDir() });
    },
  },
};

// Prototype (DREAMCUT_COMPACT_PROPOSAL_SCHEMA=1): publish proposal_create with its large sections
// summarised by field name. The full schema stays the validation authority; agents fetch one
// field's rules from capability_catalog on demand. Measured with pnpm eval:features before adoption.
if (readEnv("COMPACT_PROPOSAL_SCHEMA") === "1") {
  const full = TOOLS.proposal_create.inputSchema;
  TOOLS.proposal_create = { ...TOOLS.proposal_create, inputSchema: compactProposalInputSchema(full), fullInputSchema: full };
}

/**
 * Adopt a regenerated proposal-schema.json: both the published and the validating schema follow it.
 * Returns true when the schema changed, so the caller announces tools/list_changed. A file caught
 * mid-write keeps the last good schema and is read again on the next request.
 */
function syncProposalSchema() {
  let stamp;
  try { stamp = fs.statSync(PROPOSAL_SCHEMA_PATH).mtimeMs; } catch { return false; }
  if (stamp === proposalSchemaStamp) return false;
  let next;
  try { next = JSON.parse(fs.readFileSync(PROPOSAL_SCHEMA_PATH, "utf8")); } catch { return false; }
  proposalSchemaStamp = stamp;
  const tool = TOOLS.proposal_create;
  const current = tool.fullInputSchema ?? tool.inputSchema;
  const full = { ...current, properties: { ...current.properties, proposal: { ...proposalBodySchema(next), description: current.properties.proposal.description } } };
  TOOLS.proposal_create = tool.fullInputSchema
    ? { ...tool, inputSchema: compactProposalInputSchema(full), fullInputSchema: full }
    : { ...tool, inputSchema: full };
  return true;
}

/**
 * Application validators know the request body, not the tool schema. Append each rejected
 * field's published description so a native client gets the same teaching text as the harness.
 */
/** The schema a tool's arguments are checked against: its own, or the full schema it shares with another tool. */
function validationSchema(name) {
  const owner = TOOLS[name]?.validationTool ?? name;
  return TOOLS[owner]?.fullInputSchema ?? toolCatalog(true).find(entry => entry.name === owner)?.inputSchema;
}

function explainApplicationRejection(name, error) {
  const detail = error?.toolError;
  if (detail?.code !== "INVALID_INPUT" || !error.issues?.length) return error;
  const schema = validationSchema(name);
  const notes = schema ? issueFieldNotes(schema, error.issues).slice(0, 4).map(note => capText(note, 400)) : [];
  if (!notes.length) return error;
  const message = `${detail.message}\n${notes.join("\n")}`;
  return Object.assign(new Error(message), { toolError: { ...detail, message } });
}

async function http(method, pathName, body) {
  const response = await withEditor(({ base, auth }) => fetch(`${base}${pathName}`, {
    ...(["/api/agent/tool-events", "/api/agent/product-signals"].includes(pathName) ? {signal:AbortSignal.timeout(1000)} : {}),
    method,
    redirect: 'error',
    headers: { ...auth, "x-dreamcut-client": "mcp", ...(feedbackContext.getStore()?.length ? { "x-dreamcut-feedback-ids": JSON.stringify(feedbackContext.getStore()) } : {}), ...(body != null ? { "Content-Type": "application/json" } : {}) },
    body: body != null ? JSON.stringify(body) : undefined,
  }));
  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  if (!response.ok) throw httpFailure(method, pathName, response.status, parsed);
  return parsed;
}

/**
 * Scripts resolve projects and reach the editor the same way this server does: the resolved projects folder
 * (the creator's Library) and, for an editor DreamCut started itself, its per-launch address and session.
 */
async function runEditorScript(script, args, timeoutMs = 10 * 60 * 1000) {
  const env = { ...process.env, TIMELINE_PROJECTS_DIR: projectsDir() };
  if (autostartEditor) await withEditor(async ({ base, runtime }) => {
    env.TIMELINE_EDITOR_BASE_URL = base;
    if (runtime?.token) env.DREAMCUT_SERVICE_TOKEN = runtime.token;
  });
  return runLocalEditorScript(EDITOR_ROOT, script, args, timeoutMs, transportLifetime.signal, env);
}

/**
 * Appended to every workspace-only tool's published description. The catalog cannot be
 * project-aware (tools/list carries no project), so the rule is stated in the description
 * and enforced per call by assertAgentMcpToolAllowed.
 */
const AGENT_WORKSPACE_ONLY_NOTE =
  " WORKSPACE ONLY: this writes the timeline directly, so it is allowed only in an "
  + "agent_workspace project — one an agent assembly/audition flow created, and only until the "
  + "first layout handoff or human edit clears that grant. On any other project it refuses; edit those through "
  + "proposal_create and let the human approve.";

const profileArg = process.argv.find(arg => arg.startsWith("--profile="))?.split("=")[1];
const selection = createToolSelection({
  profile: profileArg ?? readEnv("TOOL_PROFILE") ?? "full",
  allowedFamilies: readEnv("TOOL_FAMILIES")?.trim() ? readEnv("TOOL_FAMILIES")?.split(",").map(s => s.trim()).filter(Boolean) : undefined,
});
const { project_id: _recipeProject, ...recipeProperties } = TOOLS.proposal_reveal_sequence.inputSchema.properties;
TOOLS.recipe_compile = {
  description: "Compile a versioned executable recipe into an ordinary proposal option. Discover supported recipes with capability_catalog. Prepared reveal sequence v1 reuses existing media and deterministic linked controls; no preparation, saving, approval or export. Run preflight and proposal_create with returned mutation caps. Recompile from the base option for revisions.",
  inputSchema: {type:"object", additionalProperties:false, properties:{project_id:PROJECT_ID, recipe_id:{type:"string",enum:["prepared-reveal-sequence"]}, recipe_version:{type:"integer",enum:[1]}, inputs:{type:"object",additionalProperties:false,properties:recipeProperties,required:TOOLS.proposal_reveal_sequence.inputSchema.required.filter(k=>k!=="project_id")}},required:["project_id","recipe_id","recipe_version","inputs"]},
  handler: async args => {
    const {recipe, project_id, inputs} = recipeCompileRequest(args, TOOLS.proposal_reveal_sequence.inputSchema);
    const result = await TOOLS.proposal_reveal_sequence.handler({project_id,...inputs});
    return {...result, recipe:{id:recipe.id,version:recipe.version}, next_steps:["proposal_create"], authority:"Compiled option only; human review and approval remain separate."};
  },
};
TOOLS.capability_catalog = {
  description: "Search capabilities, effect references, executable recipes, Templates gallery templates and editing features in plain words (for example \"reverse this clip\", \"make it warmer\" or \"Use the Word Search Trace template with my footage\"). A feature result names the tool and the exact field path to set. A template result (kind template, id template:<…>) is a gallery card found by its displayed title, including the creator's own (owner mine or saved) and community templates; get it for its construction brief. get returns details: schemas for tools not yet registered in this session, and only the field schema for a feature; only recipes marked executable can compile. load enables a capability family within the host allowlist and announces tools/list_changed; clients must refresh/register tools/list before calling. availability reports, for one project_id, whether each timeline-writing tool is enabled right now, a reason_code and reason when it is not (handed off, edited by a person, not a workspace), and the tool to use instead; check it before a direct write instead of calling and failing. Discovery never grants workspace writes or approval. Paginated; no project mutation.",
  inputSchema:{type:"object",additionalProperties:false,properties:{action:{type:"string",enum:["search","get","load","availability"]},query:{type:"string",maxLength:200},id:{type:"string"},offset:{type:"integer",minimum:0},limit:{type:"integer",minimum:1,maximum:20},
    project_id:{...PROJECT_ID,description:"Project to check, for action availability only."},
    tools:{type:"array",maxItems:40,items:{type:"string",maxLength:64},description:"Tool names to check, for action availability only. Defaults to every timeline-writing tool."}}},
  handler: async args => {
    if (args?.action === "availability") return toolAvailabilityReport(args);
    const gallery = args?.action === "load" ? { templates: [] } : await galleryTemplates();
    const result = queryCatalog(args, selection, toolCatalog(true), gallery.templates);
    if(result.added?.length) send({jsonrpc:"2.0",method:"notifications/tools/list_changed"});
    return gallery.warning && !result.added ? { ...result, templates_warning: gallery.warning } : result;
  },
};

/**
 * Templates gallery cards with their briefs, read from the editor per call (briefly cached), so the
 * creator's own templates come from their profile and are never copied into this server or the
 * repository. A slow or absent editor leaves the static catalog searchable and says templates are missing.
 */
const TEMPLATE_CACHE_MS = 5000;
let templateCache = null;
async function galleryTemplates() {
  if (templateCache && Date.now() - templateCache.at < TEMPLATE_CACHE_MS) return templateCache.value;
  let timer;
  try {
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), 5000); timer.unref?.(); });
    const response = await Promise.race([http("GET", "/api/agent/templates"), timeout]);
    if (!Array.isArray(response?.templates)) throw new Error("invalid templates response");
    const value = { templates: response.templates, warning: response.warning };
    templateCache = { at: Date.now(), value };
    return value;
  } catch {
    return { templates: null, warning: TEMPLATES_UNAVAILABLE_MESSAGE };
  } finally { clearTimeout(timer); }
}

/** Read-only: the gate's own decision per tool, so an agent can plan before it writes. */
function toolAvailabilityReport(args) {
  const extra = Object.keys(args).filter(key => !["action", "project_id", "tools"].includes(key));
  if (extra.length || typeof args.project_id !== "string" || (args.tools !== undefined && (!Array.isArray(args.tools) || args.tools.some(name => typeof name !== "string")))) {
    throw catalogError("INVALID_CATALOG_QUERY", "availability takes project_id and an optional tools list only.");
  }
  const names = args.tools ?? [...AGENT_WORKSPACE_ONLY_MCP_TOOLS];
  const unknown = names.filter(name => !TOOLS[name]);
  if (unknown.length) throw catalogError("INVALID_CATALOG_QUERY", `Unknown tools: ${unknown.slice(0, 8).join(", ")}.`);
  const tools = names.map(name => agentToolAvailability(name, args.project_id));
  return { action: "availability", project_id: args.project_id, direct_writes_enabled: tools.every(tool => tool.enabled), tools,
    notice: "Availability reflects authority at this moment; the gate rechecks every call." };
}

function toolCatalog(all = false) {
  return Object.entries(TOOLS)
    .filter(([name]) => (!localMediaOnly || LOCAL_MEDIA_TOOLS.has(name)) && !HUMAN_ONLY_AGENT_MCP_TOOLS.has(name) && (all || selection.enabled.has(name)))
    .map(([name, tool]) => ({
      name,
      description: localMediaOnly ? `${name}: restricted local-media trial. ${LOCAL_MEDIA_INSTRUCTIONS}` : AGENT_WORKSPACE_ONLY_MCP_TOOLS.has(name)
        ? `${tool.description}${AGENT_WORKSPACE_ONLY_NOTE}`
        : tool.description,
      inputSchema: AGENT_WORKSPACE_ONLY_MCP_TOOLS.has(name)
        ? { ...tool.inputSchema, properties: { ...tool.inputSchema.properties, responds_to_feedback_ids: { ...FEEDBACK_IDS, description: "Recorded user direction answered by this workspace mutation." } } }
        : tool.inputSchema,
      // A tool that shares another tool's argument shape names it, so clients validate with the full schema.
      ...(tool.validationTool ? { _meta: { dreamcut_validated_as: tool.validationTool } } : {}),
    }));
}

// Validation schemas that differ from the published ones, for evaluations that check calls as the server does.
const publishedValidationSchemas = () => Object.fromEntries(Object.keys(TOOLS)
  .filter(name => TOOLS[name].fullInputSchema || TOOLS[name].validationTool).map(name => [name, validationSchema(name)]));

if (process.argv.includes("--catalog")) {
  process.stdout.write(
    `${JSON.stringify({ server: SERVER_INFO, base_url: BASE_URL, profile: selection.profile, catalog_sha256: catalogFingerprint(toolCatalog(true)), tools: toolCatalog(process.argv.includes("--all-tools")), validation_schemas: publishedValidationSchemas() }, null, 2)}\n`,
    () => process.exit(0),
  );
}

/**
 * Tools that write a granted agent_workspace project run under a write lease, so the
 * editor's safe-write layer attributes the write to the agent instead of reading it as
 * the human taking the project over and revoking the grant. `audition_create` is included
 * because appending a section writes an existing audition project's timeline; on a project
 * that does not exist yet the lease is skipped (nothing to attribute, nothing to revoke).
 */
function callTool(name, tool, args) {
  const leased = AGENT_WORKSPACE_ONLY_MCP_TOOLS.has(name) || name === "audition_create";
  if (!leased) return tool.handler(args);
  const { responds_to_feedback_ids, ...body } = args;
  return feedbackContext.run(responds_to_feedback_ids, () => withAgentWriteLease(args.project_id, name, () => tool.handler(body)));
}

const transportLifetime = new AbortController();
const rl = readline.createInterface({ input: process.stdin, terminal: false });
// The agent closed the connection: stop the editor this server started, then exit. (Agent apps on Windows end
// a server with an immediate kill, so waiting for one would skip this cleanup.)
rl.once("close", async () => {
  transportLifetime.abort();
  if (process.argv.includes("--catalog")) return; // Printing the catalog exits by itself once written.
  try { await autostartEditor?.close(); } finally { process.exit(0); }
});

function send(message) {
  if (transportLifetime.signal.aborted) return;
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    return;
  }
  void handleMessage(message);
});

async function handleMessage(message) {
  const { id, method, params } = message;
  if (method === "notifications/initialized" || method === "notifications/cancelled") return;
  if (id == null) return;
  try {
    if (method === "initialize") {
      connectedClient = typeof params?.clientInfo?.name === "string" ? params.clientInfo.name.slice(0, 80) : null;
      send({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: true } },
          serverInfo: SERVER_INFO,
          instructions: localMediaOnly ? LOCAL_MEDIA_INSTRUCTIONS :
            "Use capability_catalog to discover tools and recipes; load relevant families when absent, then refresh tools/list. Tool availability does not grant authority. Timeline Editor agent surface. Use assembly_create for the first autonomous build "
            + "from a script, sources, and initial directions; it creates a fresh agent_workspace "
            + "and refuses overwrite. Use media_import for net-new local files; it copies "
            + "them into the project by default and uses external references only when the user "
            + "explicitly requests another source of truth. Use proposal_create for changes to material already "
            + "on a working timeline; the human previews, tweaks, approves, or rejects those "
            + "changes in the editor UI. Use audition_create for net-new source candidates that "
            + "belong in a dedicated editable audition project. The element/transition/lane/output "
            + "mutation tools write a timeline directly and are allowed ONLY in an agent_workspace "
            + "project — one an agent assembly/audition flow created, and only until the first "
            + "layout handoff or human edit clears that grant; call assembly_handoff before presenting the first layout. Everywhere else they refuse. Approving, rejecting, and "
            + "history restore are always the human's. If no bounded contract can express the work, "
            + "extend the relevant contract before changing a timeline. Do not write one-off "
            + "mutation scripts. When you do part of a request without DreamCut's tools (your own script, a shell command, a direct file edit, or giving up), call capability_gap_report once for it. "
            + EDITOR_PRESENCE_INSTRUCTIONS,
        },
      });
      return;
    }
    if (method === "ping") {
      send({ jsonrpc: "2.0", id, result: {} });
      return;
    }
    if ((method === "tools/list" || method === "tools/call") && syncProposalSchema()) {
      send({ jsonrpc: "2.0", method: "notifications/tools/list_changed" });
    }
    if (method === "tools/list") {
      send({ jsonrpc: "2.0", id, result: { tools: toolCatalog() } });
      return;
    }
    if (method === "tools/call") {
      // The retired 0.3.0 npm launcher's first-run progress tool, still served to its installs. An agent app that
      // missed tools/list_changed after setup still lists only it, so it answers here with the way out.
      if (params?.name === "dreamcut_setup_status") {
        send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `DreamCut finished setting up; ${selection.enabled.size} DreamCut tools are live. `
          + "If dreamcut_setup_status is the only DreamCut tool you can see, your app is still showing the tool list from before setup finished. "
          + "Tell the creator to start a new chat or session (or reconnect DreamCut in the app's connector or extension settings); the tools appear there. Nothing is wrong with DreamCut." }] } });
        return;
      }
      const tool = TOOLS[params?.name];
      if (!tool) throw new Error(`Unknown tool: ${params?.name}`);
      let dispatched = false;
      try {
        const args = params?.arguments ?? {};
        // Authority gates fail closed before anything reaches the editor, accounting included.
        if (localMediaOnly) assertLocalMediaCall(params.name, args);
        if (HUMAN_ONLY_AGENT_MCP_TOOLS.has(params.name)) assertAgentMcpToolAllowed(params.name, args);
        if (!selection.enabled.has(params.name)) throw catalogError("TOOL_NOT_LOADED", "Discover and load the owning family through capability_catalog; host allowlists cannot be expanded.");
        assertAgentMcpToolAllowed(params?.name, args);
        if (PROJECT_CREATING_TOOLS.has(params.name) && libraryRequired(EDITOR_ROOT)) throw libraryNotConfigured();
        dispatched = true;
        // From here every outcome, including an unknown-field rejection before the editor is called, is one
        // tool-events row with its error code.
        const result = await dispatchTool(params.name, args, () => {
          const published = validationSchema(params.name);
          const unknown = published ? unknownFieldHints(published, args).slice(0, 8) : [];
          if (unknown.length) {
            const text = `Invalid arguments for ${params.name}:\n${unknown.join("\n")}`;
            signal(argumentsRejectedSignal(signalContext(args.project_id), { tool: params.name, layer: "server_schema", schema: published, args, message: text, errorCode: "INVALID_ARGUMENTS" }));
            throw Object.assign(new Error(text), { toolError: { schema_version: 1, code: "INVALID_ARGUMENTS", message: text, retryable: false, state_changed: false,
              recovery: { action: "fix_arguments", reason: "Rename or remove the named fields; nothing was sent to the editor." } } });
          }
          return autoProposalWork.around(params.name, args.project_id, () => callTool(params.name, tool, args));
        }, event => http("POST", "/api/agent/tool-events", event), MCP_SESSION_ID, id);
        if (localMediaOnly) {
          send({jsonrpc:"2.0", id, result:{content:[{type:"text",text:JSON.stringify(localMediaResult(params.name, result))}]}});
          return;
        }
        if (params.name === "capability_catalog") signal(catalogSearchSignal(signalContext(args.project_id), args, result));
        if (params.name === "proposal_create") signal(proposalStagedSignal(signalContext(args.project_id), params.name, result));
        if (params.name === "editor_context_get" || params.name === "timeline_get") signal(selectionReadSignal(signalContext(args.project_id ?? result?.open_project?.project_id), params.name, result));
        if (params.name === "generate_media") signal(generationDraftedSignal(signalContext(args.project_id), args, result));
        // Absolute so the agent can open it directly in its browser.
        if (typeof result?.review_url === "string" && result.review_url.startsWith("/")) Object.assign(result, await reviewLinks(result.review_url));
        send({
          jsonrpc: "2.0",
          id,
          result: ["source_evidence","timeline_evidence","sfx_audition_prepare"].includes(params.name)
            ? {content:[{type:"text",text:JSON.stringify({...result,image:undefined},null,2)},result.image]}
            : params.name === "asset_generation_status"
              ? { content: [{ type: "text", text: JSON.stringify({ ...result, images: undefined }, null, 2) }, ...(result.images ?? [])] }
              : { content: [{ type: "text", text: resultText(params.name === "proposal_create" ? compactProposalResult(result) : result) }] },
        });
      } catch (error) {
        if (localMediaOnly) { send({jsonrpc:"2.0", id, result:localMediaFailure()}); return; }
        const explained = explainApplicationRejection(params.name, error);
        // The editor's own validator rejected the request (a refinement the JSON schema cannot express).
        const args = params?.arguments ?? {};
        if (explained?.toolError?.code === "INVALID_INPUT") {
          signal(argumentsRejectedSignal(signalContext(args.project_id), { tool: params.name, layer: "application", schema: validationSchema(params.name), args, message: explained.toolError.message ?? explained.message, errorCode: "INVALID_INPUT" }));
        } else if (dispatched) signal(toolRefusedSignal(signalContext(args.project_id), params.name, explained?.toolError));
        send({
          jsonrpc: "2.0",
          id,
          result: toolFailure(explained),
        });
      }
      return;
    }
    send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
  } catch (error) {
    send({
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: localMediaOnly ? "Local-media request failed." : error instanceof Error ? error.message : String(error) },
    });
  }
}
