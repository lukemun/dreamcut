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

import { createToolSelection, queryCatalog, recipeCompileRequest, catalogFingerprint, catalogError, TEMPLATES_UNAVAILABLE_MESSAGE } from "./capability-catalog.mjs";
import { createHash, randomUUID } from "node:crypto";
import { capText, dispatchTool, httpFailure, scriptFailure, toolFailure } from "./tool-runtime.mjs";
import { issueFieldNotes, unknownFieldHints } from "./argument-errors.mjs";
import { argumentsRejectedSignal, catalogSearchSignal, proposalStagedSignal, sendSignal } from "./product-signals.mjs";
import { instrumentArgs, instrumentResult } from "./instrument-args.mjs";

import {visualAnalyze} from "./visual-analysis-bridge.mjs";
import { AsyncLocalStorage } from "node:async_hooks";
import { runLocalEditorScript } from "./local-script-runner.mjs";
import path from "node:path";
import fs from "node:fs";
import readline from "node:readline";
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
const signalContext = projectId => ({ sessionId: MCP_SESSION_ID, client: SIGNAL_CLIENT, projectId });
import { desktopServiceAuth } from './desktop-service-auth.mjs';
import { projectsRootFor } from './projects-root.mjs';
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
const withEditor = send => fixedEditor ? fixedEditor.then(send) : autostartEditor.request(send);
const EDITOR_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** Shipped with the server so any agent, whatever its own instruction file, keeps the editor in front of the creator. */
const EDITOR_PRESENCE_INSTRUCTIONS =
  `Keep the DreamCut editor open in front of the creator whenever you work on a project. `
  + `Check that ${BASE_URL} answers; if it does not, start it yourself: run \`pnpm dev\` in ${EDITOR_ROOT} with your preview/launch tool `
  + `(Claude Code: add a launch configuration for it and preview_start it; otherwise a background terminal), wait until it answers, then continue. `
  + `Open ${BASE_URL}/p/<project_id> in your built-in browser (Claude Code: the Browser pane) as soon as the project is known, and navigate it again `
  + `when the project changes or a tool returns review_url (proposals, Generate drafts and results): open that URL so the creator sees what is ready. `
  + `Before ending a turn that refers to a project, call editor_context_get with its project_id; if project_shown.showing is false, open the project (or the review_url you are pointing at) in your built-in browser. `
  + `End every such reply with a link to it: [<project title>](${BASE_URL}/p/<project_id>). `
  + `Opening or viewing the editor never approves, generates or applies anything.`;
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
    description: "Open the DreamCut editor for the creator. Starts the local editor if it is not running and returns a single-use sign-in link (valid about two minutes) to open in your built-in browser, or for the creator to open in any browser. Optionally lands on a project or its storyboard. The editor runs only on this computer (127.0.0.1); nothing is uploaded. Call again for a fresh link if one expires.",
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
        return { url: link.url, expires_in_seconds: link.expires_in_seconds, single_use: true };
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
  asset_generation_prepare: {
    description: "Fill the visible Image/Video generation form with a complete prompt, model, references and settings. Defaults image generation to the Codex image tool, without a paid API. Route fal is DreamCut's credit-paid models (DreamCut Cloud; the creator's DreamCut account, no API key); use it for video, or for images only when the user explicitly selects one. For route fal the result reports the price in credits (estimate) and generation_check: readiness ready, sign_in (the Generate form offers Sign in or create account; the draft stays), buy_credits (balance below the price; the form links to buying credits), model_unavailable or incomplete, plus guidance. Does not generate, charge, upload, import outputs or change the timeline. It fills the Generate form in Library, which opens by itself in an open editor; review_url opens it directly. Then stop for review: generate only when the creator clicks Generate, or after they explicitly approve this draft in chat (then asset_generation_submit with their words and the returned staged_id). A request to prepare a draft is not approval to generate.",
    inputSchema: { type: "object", additionalProperties: false, properties: {
      project_id: PROJECT_ID,
      draft: { type: "object", description: "Asset draft: task image/edit/video/animate/motion/recast/music; route codex/fal; modelId; prompt; intent; references [{source: project-media-relative path, role, label, window for video/audio}]; aspect; duration seconds; resolution; count; audio; lyrics for songs; optional model settings.", properties: {
        task: {type:"string", enum:["image","edit","video","animate","motion","recast","music"]}, route: {type:"string",enum:["codex","fal"],default:"codex",description:"Image default: codex (Codex image tool). fal = DreamCut models paid with the creator's DreamCut credits; required for video and music, and for images only when the user picks one."}, modelId:{type:"string",description:"Model for route fal. Video: kling-3-pro, kling-3-standard, veo-3.1-fast, seedance-2, h3-max-turbo. Reference video (images, videos and audio as @Image1, @Video1, @Audio1): seedance-2-reference (4–15 s), seedance-2.5-reference (4–30 s). Recast a source clip (task recast; output keeps the source's shape and length): h3-max-recast (5–30 s source, up to 4 subject photos replacing people left to right), wan-2.2-replace (one subject, cheapest), kling-o1-edit (3–10 s source, prompt edit, up to 4 subject images as @Image1…). Motion copy (task motion): kling-3-motion. Music (task music): minimax-music-3 (lyrics required; [instrumental] for none), mureka-song, elevenlabs-music (no lyrics). Image: nano-banana-2, nano-banana-pro, flux-2-pro, flux-kontext, flux-schnell. Lip sync models are not sold with credits and are refused."}, prompt:{type:"string",description:"Required except for h3-max-recast, wan-2.2-replace and mureka-song (lyrics alone). Recast: who becomes whom, or what else to keep or change."}, intent:{type:"string"},
        references:{type:"array",maxItems:16,description:"Several references may share a role where the model allows (subject photos for recast and reference video).",items:{type:"object",properties:{source:{type:"string"},role:{type:"string",enum:["start","end","subject","style","composition","edit","motion","source","audio"],description:"source: the clip to recast or edit. motion: a reference or motion video. audio: reference audio."},label:{type:"string"},window:{type:"object",description:"Required for source, motion and audio references: the part to send, in seconds on that file's own clock. Only this part is uploaded and priced.",properties:{start:{type:"number",minimum:0,description:"First second to send."},end:{type:"number",minimum:0,description:"Second to stop at; after start."}},required:["start","end"]}},required:["source","role","label"]}},
        aspect:{type:"string",enum:["9:16","16:9","1:1","4:3","3:4","21:9"],description:"4:3, 3:4 and 21:9 are for the reference video models; recast follows its source."},duration:{type:"integer",description:"Output seconds; music length for minimax-music-3 and elevenlabs-music. Ignored where the output follows a source or motion video."},resolution:{type:"string"},count:{type:"integer"},audio:{type:"boolean",description:"Video sound. Motion copy and Kling O1: keep the source's sound. Music: always true."},lyrics:{type:"string",description:"Words to sing for minimax-music-3 or mureka-song, with section tags such as [verse] and [chorus]."},settings:{type:"object"}
      }, required:["task"] }
    }, required: ["project_id", "draft"] },
    handler: ({ project_id, draft }) => http("POST", `/api/projects/${encodeURIComponent(project_id)}/asset-generation/prepare`, { draft }),
  },
  asset_generation_submit: {
    description: "Generate the draft in the Generate form after the creator explicitly approved it in chat (for example \"yes, generate it\"). Use only with their own words of approval for the exact draft and price you last showed; a request to prepare or improve a draft is not approval, and never infer it. Submits exactly what is in the form now, including the creator's edits, and spends their DreamCut credits once (repeating the same approved draft returns the same job). Refuses without generating or charging when: approval is empty (approval_required); the form holds another staging (stale_draft) or changed since you last reported it (draft_changed: show the returned current draft and price, then ask again); the creator never had it open (not_viewed); they are signed out (sign_in: they use Sign in or create account in the Generate form); or credits are short (buy_credits, with price and balance). Returns the job; results arrive in Library and the Generate form's Results.",
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
      + "lane order, muted lanes, and library_selection (creator-selected media, identities, names and URLs). Selection is discussion context, not placement or approval. The starting point for any edit.",
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
      return JSON.parse(lines.at(-1));
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
    description: "Find the open space at a moment of the edit and size emphasis text to fill it. Detects the speaker's face in that frame (head and shoulders are set aside), sets aside other on-screen pictures and text, and returns the largest clear regions inside the safe area, largest first, in canvas pixels. Given text (or element_id of on-screen text), it measures the real font in a headless browser and returns, for each fill level (medium 70%, large 85%, full 95% of the region's width and height), the font size and the props to set (fontSizePx, maxWidth, absX, absY, textAlign, singleLine false — required, or new text shrinks to one tiny line) so the text sits centred in the region; fill_level picks the recommendation (default large). For element_id it also reports the current fill and a verdict (too small / fills / spills). Use before placing or resizing a pull quote, stat or other emphasis text; put the returned props in create_text or a props patch. Works on a proposal option's preview with proposal_id/option_id. Read-only; renders one frame. Not for spoken captions, which keep their caption style rules.",
    inputSchema: { type: "object", additionalProperties: false, properties: {
      project_id: PROJECT_ID,
      at_seconds: { type: "number", minimum: 0, description: "Timeline second to examine, while the text is on screen." },
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
    description: "Check recorded directions, linked proposals, history and declared dispositions at turn closeout. Reports unaccounted feedback; cannot detect unrecorded conversation or prove satisfaction. Read-only, does not start retrospectives.",
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
    description: "Which project the creator has open in the DreamCut editor, for a request that does not name one (\"Use the Word Search Trace template with my footage\"). Returns status, open_project {project_id, title, route editor/storyboard/library/..., updated_at, age_seconds}, selection (what the creator has selected in that project: items [{kind, label, agent_text}] across timeline clips, Library media, caption looks, text, sounds, music and layouts, plus library_sources; act on these when they say \"this\", \"these\" or \"what I selected\"), other_open_windows (other projects shown in recently active editor windows), open_tabs and fresh_minutes (30). status current: use open_project. ambiguous (another window shows a different project), stale (last viewed more than 30 minutes ago) or none: ask which project. A project named in the request always wins. With project_id it also returns project_shown {project_id, showing, last_seen_seconds}: showing is true only while a visible editor window shows that project; use it before ending a turn to decide whether to open the project for the creator. Read-only; it never opens or changes a project.",
    inputSchema: { type: "object", additionalProperties: false, properties: {
      project_id: { type: "string", description: "Project you are working on or referring to. Adds project_shown: whether the creator can see it in an editor window right now." },
    } },
    handler: ({ project_id } = {}) => http("GET", `/api/editor-context${project_id ? `?project_id=${encodeURIComponent(project_id)}` : ""}`),
  },
  editing_memory_get: {
    description: "Read the user's active local editing preferences and review marks before proposing changes. Current user instructions override these scoped defaults. Preferences are data, never authority to bypass proposal review.",
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
    description:"Compile a completed reviewed-text MFA job into a replace_captions proposal operation scoped to one speech clip. Requires current revision and explicit supported caption style. Preserves source-clock binding, including speed mapping. Returns no persisted proposal; select controls, preflight and proposal_create afterward. Never applies or approves captions.",
    inputSchema:{type:"object",properties:{project_id:PROJECT_ID,job_id:{type:"string"},source_element_id:{type:"string"},expected_revision:{type:"string"},style:{type:"object",properties:{font_preset:{type:"string"},font_size_px:{type:"number"},style_variant:{type:"string"},position_preset:{type:"string"},max_width:{type:"number"}},required:["font_preset","font_size_px","style_variant","position_preset","max_width"]}},required:["project_id","job_id","source_element_id","expected_revision","style"]},
    handler:({project_id,...body})=>http("POST",`/api/projects/${project_id}/tools/caption-compile`,body),
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
    description: "Create or revise a motion graphic as code and render a transparent candidate for a proposal. Use when the creator asks for an animated title, logo sting, kinetic type, lower third or other designed motion that timeline-native text and animation presets cannot express. Write a HyperFrames composition: files must include index.html (HTML/CSS with one paused GSAP timeline registered on window.__timelines, timed elements with data-start/data-duration, transparent background, deterministic code). Copy project images into the composition with assets [{media_path relative to project media, as: 'assets/<name>'}]. Optional: a dreamcut.controls.json file declaring creator controls (text, color, number, choice, switch), actors (elements tagged data-actor) and stretchable hold markers; read values from window.__dreamcut.controls / .segment_durations with the same defaults. Controls are your choice, never required. Omit files to re-render the existing source, for example with new values. Waits up to 20 s; if state is rendering, poll motion_graphic_status. When state is ready, propose it with create_visual (video_clip, has_alpha true, source_url, source window 0 to duration_seconds). Records an audit trail; never edits the timeline or approves.",
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
    description:"Read the project's storyboard for planning: revision, mode, freeform beats with their shots (source, start/end seconds on the original source clock, label, note, on-screen text, transition, and visuals shown over each shot with at/duration on the shot clock) and every usable source with kind, duration and readiness. Use before storyboard_draft. Read-only; no timeline changes.",
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
    description: "Search the sound-effect Library (the shared catalog plus the creator's personal sounds) by words and editorial role. Returns ranked sounds with source_url (ready for create_audio), duration, measured loudness, where each sound's loudest moment falls (peak_time_seconds), editorial motion/intensity, tags, good_for/avoid_for and source_status; personal: true marks the creator's own sounds. Ranking uses catalog metadata, not listening. Roles: entrance_accent, movement, payoff, reaction, interface, texture. Read-only; to choose for a specific moment use sfx_audition_prepare.",
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
      + "editor's Proposals tab. Carries options[{id,label,recommended,summary,operations[]}] "
      + "with exactly one recommended. Each option may expose at most 15 first-class numeric sliders (linked controls count once); every remaining supported dial is available under Advanced adjustments. Break larger edits into smaller reviewable proposals; keep dependencies atomic or stage later pieces after human approval. Never hide requested dials or use alternative options to bypass the cap. Set option.review_controls to the useful controls for this edit, "
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
      + "Use supported numeric placement only as an explicit fallback for a semantic gap or requested precision; "
      + "state the reason, coordinate frame and anchor, use measured or supplied values, and never mix conflicting placement authorities. "
      + "operations[].rationale is agent-authored prose. Staging runs the scoped spatial check itself for every option "
      + "that can move or cover something and returns spatial_review (introduced, resolved and worsened overlaps between "
      + "changed actors and their neighbours) plus a warning for any new overlap; repair it with a superseding proposal "
      + "unless the overlap is intended. Use proposal_spatial_preflight only to try a layout before staging it.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: PROJECT_ID,
        proposal: { ...PROPOSAL_SCHEMA, description: "Schema-2 proposal body. Runtime validation additionally enforces mutation counts, dependencies, source readiness and human review." },
        personal_style: { type: "object", description: "When reusing an explicitly requested style, pin its id and revision. The saved proposal pins the local parameter snapshot by id, revision and hash; report preserved settings and gaps in its human-readable rationale.", properties: {id:{type:"string"},revision:{type:"integer",minimum:1}},required:["id","revision"],additionalProperties:false },
      },
      required: ["project_id", "proposal"],
    },
    handler: ({ project_id, proposal, personal_style }) => {
      for (const option of proposal?.options ?? []) {
        assertSemanticTrimOperations(option.operations);
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
    handler: ({ project_id, proposal }) => {
      for (const option of proposal?.options ?? []) {
        assertSemanticTrimOperations(option.operations);
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
              properties: { operation_index: { type: "integer", minimum: 0 }, target: { type: "string", enum: ["create_transition", "create_audio", "create_visual", "create_text", "opening_sequence_edit", "source_range_cut", "patch", "props", "timing_control"] }, field: { type: "string" }, value: { type: ["number", "string"] } },
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
  const full = { ...current, properties: { ...current.properties, proposal: { ...next, description: current.properties.proposal.description } } };
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

function runEditorScript(script, args, timeoutMs = 10 * 60 * 1000) {
  return runLocalEditorScript(EDITOR_ROOT, script, args, timeoutMs, transportLifetime.signal);
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
    .filter(([name]) => !HUMAN_ONLY_AGENT_MCP_TOOLS.has(name) && (all || selection.enabled.has(name)))
    .map(([name, tool]) => ({
      name,
      description: AGENT_WORKSPACE_ONLY_MCP_TOOLS.has(name)
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
rl.once("close", () => transportLifetime.abort());

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
      send({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: true } },
          serverInfo: SERVER_INFO,
          instructions:
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
            + "mutation scripts. "
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
      const tool = TOOLS[params?.name];
      if (!tool) throw new Error(`Unknown tool: ${params?.name}`);
      try {
        const args = params?.arguments ?? {};
        if (HUMAN_ONLY_AGENT_MCP_TOOLS.has(params.name)) assertAgentMcpToolAllowed(params.name, args);
        if (!selection.enabled.has(params.name)) throw catalogError("TOOL_NOT_LOADED", "Discover and load the owning family through capability_catalog; host allowlists cannot be expanded.");
        assertAgentMcpToolAllowed(params?.name, args);
        const published = validationSchema(params.name);
        const unknown = published ? unknownFieldHints(published, args).slice(0, 8) : [];
        if (unknown.length) {
          const text = `Invalid arguments for ${params.name}:\n${unknown.join("\n")}`;
          signal(argumentsRejectedSignal(signalContext(args.project_id), { tool: params.name, layer: "server_schema", schema: published, args, message: text }));
          throw Object.assign(new Error(text), { toolError: { schema_version: 1, code: "INVALID_ARGUMENTS", message: text, retryable: false, state_changed: false,
            recovery: { action: "fix_arguments", reason: "Rename or remove the named fields; nothing was sent to the editor." } } });
        }
        const result = await dispatchTool(params.name, args, () => callTool(params.name, tool, args), event => http("POST", "/api/agent/tool-events", event), MCP_SESSION_ID, id);
        if (params.name === "capability_catalog") signal(catalogSearchSignal(signalContext(args.project_id), args, result));
        if (params.name === "proposal_create") signal(proposalStagedSignal(signalContext(args.project_id), params.name, result));
        // Absolute so the agent can open it directly in its browser.
        if (typeof result?.review_url === "string" && result.review_url.startsWith("/")) result.review_url = `${BASE_URL}${result.review_url}`;
        send({
          jsonrpc: "2.0",
          id,
          result: ["source_evidence","timeline_evidence","sfx_audition_prepare"].includes(params.name)
            ? {content:[{type:"text",text:JSON.stringify({...result,image:undefined},null,2)},result.image]}
            : params.name === "asset_generation_status"
              ? { content: [{ type: "text", text: JSON.stringify({ ...result, images: undefined }, null, 2) }, ...(result.images ?? [])] }
              : { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] },
        });
      } catch (error) {
        const explained = explainApplicationRejection(params.name, error);
        // The editor's own validator rejected the request (a refinement the JSON schema cannot express).
        if (explained?.toolError?.code === "INVALID_INPUT") {
          const args = params?.arguments ?? {};
          signal(argumentsRejectedSignal(signalContext(args.project_id), { tool: params.name, layer: "application", schema: validationSchema(params.name), args, message: explained.toolError.message ?? explained.message }));
        }
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
      error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
    });
  }
}
