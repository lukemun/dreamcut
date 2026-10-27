# Local web app, agent plugin and library contract

Status: direction decided 2026-10-11; not implemented. This replaces the macOS-first launch plan: DreamCut
ships first as a local web app that the creator runs from inside Claude Code or Codex, on macOS and Windows.
A desktop app may follow and opens the same Library. Evidence: [hosted web UI, local agent and shared
library findings](../research/2026-10-11-web-ui-local-agent-shared-library.md) (cited as *Findings §n*).
It changes the creator-content location in [desktop data layout](desktop-data-layout.md).

## Goal

A creator installs DreamCut into their coding agent, drops in footage and edits through the agent and the
DreamCut editor. The editor shows in the agent app's built-in browser, or in any browser they prefer.
Footage stays on their machine; DreamCut's servers never receive it. Every project lives in one visible
**DreamCut Library** folder, which a later desktop app opens unchanged.

## Shape

```
 Claude app / Codex app (first class)          or: terminal agent + any browser
 ┌─────────────────────────────────────┐
 │ agent ──stdio MCP──┐                │
 │ built-in browser ──┼── http://127.0.0.1:<port>/ (editor UI)
 └────────────────────┼────────────────┘
                      ▼
          dreamcut (local package: editor server + MCP tools)
                      │ deterministic reads/writes (@dreamcut/library)
                      ▼
          DreamCut Library folder on the creator's disk  ◀── later: desktop app, same package

 dreamcut.com (hosted): landing page, install instructions, docs. No project data, no MCP.
```

## Decisions

### 1. Inside the agent app is first class: a localhost editor in its built-in browser

Both agent desktop apps ship a built-in browser that opens local routes. Codex documents `localhost`
previews with their own browser profile. The Claude app's browser is Chromium 152 with WebGPU, WebCodecs
and the folder APIs (*Findings §2, Browsers built into agent apps*). DreamCut's editor is already a web app
served on localhost, and the GPU renderer already runs in Chromium. So the first-class path is: the agent
starts the local editor and opens its URL in the built-in browser. This is exactly how DreamCut is
developed today.

**Separately, in any browser:** the same `http://127.0.0.1:<port>` URL works in Chrome, Edge, Firefox or
Safari. The Node process does all file work, so the browser needs no folder-access API. What is supported
outside Chromium is whatever the renderer supports there; GPU admission already gates features.

### 2. No hosted MCP; install from instructions on the website

A hosted MCP cannot touch local files (*Findings §1*), and everything DreamCut does is local, so a hosted
server adds a dependency without capability. The website shows install instructions, and the agent does
the rest:

- **One plugin for both apps (built 2026-10-11).** The `dreamcut` npm package is also the plugin: it
  carries `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json`, the MCP entries and two skills
  (`edit-video`, `open`) at its root (`packaging/launcher`). Claude Code starts the MCP server from the
  installed plugin (`node ${CLAUDE_PLUGIN_ROOT}/bin/dreamcut.mjs mcp`); Codex, which prefers its own
  manifest and whose expansion of that variable in MCP commands is unconfirmed, starts the same version
  through `npx -y dreamcut@<version> mcp`. Both apps install from npm through one marketplace file
  (`.claude-plugin/marketplace.json`, which Codex also reads) in a small public repository built by
  `packaging/build-marketplace.mjs`. Fallbacks: `claude mcp add dreamcut -- npx -y dreamcut mcp` and
  `codex mcp add dreamcut -- npx -y dreamcut mcp`.
- **First run inside an agent app.** Agent apps start plugin MCP servers with the session and wait only
  about 30 s (Claude Code) or 10 s (Codex), but the first download is about 275 MB. With no runtime
  installed, `dreamcut mcp` answers at once with one tool, `dreamcut_setup_status`, downloads in the
  background (retrying dropped connections), then starts the real server, replays the agent's
  `initialize` to it and sends `tools/list_changed` (`packaging/launcher/lib/mcp-bootstrap.mjs`).
  Verified in Claude Code: the agent reported progress and the full tools appeared mid-session. Codex's
  handling of `tools/list_changed` is unverified; the instructions run `npx dreamcut install` first so
  the plugin normally starts with the runtime present.
- **No agent:** `npx dreamcut` opens the editor alone.

The website's install page (dreamcut.io/install, the `site/` app; branch `site-install`) offers a
"paste this into your agent" line pointing at `dreamcut.io/install.md`, which the agent follows step by
step, showing each command for approval under its own permission rules. It also states what DreamCut
shares and how to turn it off.

### 3. One local process serves the editor and the tools

The MCP server the agent launches starts the editor server if it isn't running and returns its URL from an
`editor_open` tool, so the agent can open it in its browser. This is today's split (`mcp/server.mjs`
calling the editor over HTTP), packaged as one install. The package ships the built editor (production
build), the MCP server and the media workers.

**Localhost hardening** (*Findings §1, §2: MCP Origin rule; Zoom and Transmission precedents*):
- Bind to 127.0.0.1 only.
- Reject any request whose `Host` or `Origin` is not the editor's own loopback origin, which defeats DNS
  rebinding and drive-by requests from websites.
- Require a per-launch secret that the MCP passes in the URL it opens and the editor exchanges for an
  HttpOnly cookie.
- Make no state change on GET.

### 4. One Library package implements the contract

Extract today's `src/lib/local-store` rules into `@dreamcut/library`: schemas, validation, migrations,
revision checks and path rules, plus a Node file adapter. The editor server, the MCP tools and the later
desktop app all write only through it.

A **contract fixture corpus** guards it in CI. The corpus holds Libraries at each format version, with
unknown fields, interrupted temporary writes and stale revisions. A browser file adapter (File System
Access) stays possible later for a no-install hosted viewer, but no first-class path needs it.

### 5. The Library format

**Location:** a visible folder the creator chooses. It defaults to `~/Movies/DreamCut Library` on macOS
and `%USERPROFILE%\Videos\DreamCut Library` on Windows. User media belongs in user folders, not app data
(*Findings §3, Default locations*). This moves creator content out of `Application Support/DreamCut`.
Profiles, agent sessions and journals stay in app data. Apple asks apps to write to the user's media
folders only when the user directs it, so first run asks the creator to confirm or choose the folder.

**A plain folder, not a macOS package.** Packages break on Dropbox and hide contents (*Findings §3*).

```
DreamCut Library/
  dreamcut-library.json        format marker: format, format_version, min_reader_version, library_id
  projects/<project-id>/       today's project folder
    project.json  timeline.json  storyboard.json  source-manifest.json
    media/sources/…            managed copies (original bytes, hashed)
    history/  proposals/  memory/  renders/
  .dreamcut/derived/           rebuildable proxies, thumbnails, peaks; safe to exclude from sync
```

**Versioning** follows OpenTimelineIO and Protocol Buffers (*Findings §3*):
- Every document keeps its `schema_version`, and the Library has a `format_version`.
- Readers preserve unknown fields.
- Migrations run in order, upgrade only, and keep the previous file.
- An older reader opens a newer Library read-only and says why.
- Each document has a published JSON Schema.

**Concurrent writers:**
- Every authored document carries a revision. Every write checks it, as timeline and storyboard saves
  already do; a stale writer re-reads instead of overwriting.
- No lock files for correctness: they are advisory and unreliable on network and sync folders.
- Writes go to a temporary file, then rename. On Windows, replacement has documented partial-failure
  states, so writes are verified and the previous version stays recoverable.
- Long jobs promote from scratch under the [storage lifecycle](../standards/storage-lifecycle.md).

**Cloud sync:** warn when the Library is inside iCloud Drive, OneDrive or Dropbox. Same-file edits from
two machines surface as revision conflicts, not silent merges.

**Media must live in the Library** for portability between machines and front ends. Managed copy is
already the default. External references remain allowed but are flagged as not portable.

## Distribution (decided 2026-10-11)

- **`dreamcut` on npm is a small launcher** (`packaging/launcher`). On first use (`npx dreamcut install`,
  or any command) it reads the update feed (`latest.json` at the download location; the snapshot packed
  into the launcher if the feed is unreachable), downloads this computer's runtime, verifies each archive's
  size and SHA-256 against the feed, and runs it. A tampered or partial download installs nothing.
- **Two layers per platform** (`packaging/build-web-runtime.mjs`). The *app layer* holds the production
  editor build, the service process, the MCP server and the `dreamcut` command, and is published with
  every version. The *base layer* holds the traced dependencies (`node_modules`, about 500 MB of the
  roughly 850 MB) and is identified by its contents and Node ABI, so it is downloaded again only when
  dependencies change. Installed as `<app data>/DreamCut/runtimes/app/<version>-<platform>`, linking
  `runtimes/base/<id>-<platform>/node_modules` (a junction on Windows). No Electron, no bundled FFmpeg and
  no creator data. Built on each platform from `pnpm editor:build` and
  `node desktop/package.mjs --service-only`.
- **Self-updating (decided 2026-10-11).** Shipping editor changes must not wait for creators to reinstall,
  and the interface stays served from 127.0.0.1 rather than a hosted site (no browser local-network
  prompt, no version skew between a hosted page and local helpers, works offline). The launcher starts
  the newest installed version immediately, checks the feed at start and every 15 minutes while running,
  and installs a newer version in the background. The running editor shows **Update**; applying it
  restarts the editor service from the new version on the same port with the same session token, so open
  pages reload signed in and the agent's MCP connection carries on (`mcp/runtime-updates.mjs`). An
  update waits while an export or analysis worker runs. The launcher keeps the two newest versions plus
  any in use. New versions need no npm release: publishing is uploading the archives and `latest.json`.
  The agent's MCP server process keeps the code it started with until the agent restarts it; tool
  contracts must therefore stay compatible across adjacent versions.
- **Node.js** is a prerequisite. The creator's agent installs it when missing; WinGet
  `OpenJS.NodeJS.LTS` on Windows.
- **Until a Library is chosen**, a packaged runtime keeps projects in `<app data>/DreamCut/projects`, never
  inside the runtime install that an upgrade replaces. `library_status` offers to move them.
- **Order for agents:** `npx dreamcut install`, then `claude mcp add dreamcut -- npx -y dreamcut mcp` or
  `codex mcp add dreamcut -- npx -y dreamcut mcp`. Installing first keeps the large download out of the
  MCP connection, where a client could time out.
- **Download location: Dreamcut.io (2026-10-24).** The source repository is private. Public downloads
  and `latest.json` live at `https://dreamcut.io/downloads/runtime/`, redirected to the existing public
  Vercel Blob store. Both the live feed and the launcher's offline snapshot use these public addresses.
  `packaging/upload-runtime.mjs` verifies archives before publishing the feed and rebases all download
  addresses, including retained platforms. GitHub Releases remain private release records.
  An explicit `DREAMCUT_RUNTIME_BASE_URL` still supports mirrors and disposable verification.
  The launcher can be released independently using `packaging/pack-launcher.mjs --launcher-version
  <version> --feed <verified-feed.json>`; its manifest retains the actual runtime version.
  Launchers published before this migration must be replaced with `npx dreamcut@latest`; they cannot
  discover a new feed after their GitHub endpoint becomes private.
- **Manual publishing (2026-10-23).** Merging into main does not publish an update. Prepare a
  versioned build, verify the supported platforms, then explicitly run
  `pnpm release` to record the release, publish public downloads and publish the launcher when needed.
  `--dry-run` previews publishing without changing GitHub. No release-on-merge workflow is enabled.
  Runtime releases normally need no npm release; changes to the launcher itself (including its
  check interval) require publishing and adopting a new launcher version. Existing launchers keep
  their previous interval until upgraded.
- **Edit data** is collected by the existing export sharing (`src/lib/local-store/export-sharing.ts`):
  only from a signed-in account, through the authenticated `/api/v1/evidence` (signed out, nothing is
  sent; the pseudonymous `ingest-export` path was removed 2026-10-27), on by default, turned off in settings. The install
  instructions page must state it accurately.
- **Verification:** `packaging/verify-web-runtime.mjs` replays a first run from the packed launcher with
  fresh app data and a local stand-in for the download location, then publishes a newer version while
  the editor runs and applies it.

## What changes from today

| Area | Today | Decided direction |
| --- | --- | --- |
| Launch | Signed macOS desktop app first | Local web app via Claude Code / Codex plugin, macOS and Windows; desktop later |
| Creator content | `Application Support/DreamCut/projects` | Visible, creator-chosen DreamCut Library; one-time migration |
| Format rules | Inside the Next.js server | `@dreamcut/library`, shared by editor, MCP and desktop |
| Install | Desktop installer | Agent plugin or `npx dreamcut`; website gives instructions |
| Editor server | Dev server on :3123, no auth | Production build on 127.0.0.1, Host/Origin allowlist, per-launch secret |

## Phases

1. **Library contract.** Write the format spec, JSON Schemas and fixture corpus. Extract
   `@dreamcut/library` and route today's server through it, with no behaviour change. Add the Library
   marker, folder choice and migration from Application Support.
2. **Package.** Publish `dreamcut` with the production editor build, the MCP with an `editor_open` tool
   and auto-start, and the media workers. Add the localhost hardening.
3. **Agent plugins.** A Claude Code marketplace plugin and a Codex plugin (MCP, skills, an open command),
   plus the hosted instructions page. Measure with the existing feature evals inside both apps.
4. **Windows.** Native runtime: process cleanup, `.cmd` discovery, paths, FFmpeg distribution with its
   licensing audit, and the Python workers. Test the full loop in the Codex and Claude apps on Windows.
5. **Desktop app (later).** Wrap the same package and open the same Library.

## Open questions

- Media worker distribution on Windows: Python, Whisper, MFA and SAM2 ship as what? This is the
  largest unknown in phase 4.
- Port: fixed (3123) or chosen per launch with discovery through the MCP.
- Plugin marketplace repository: the website and install instructions assume `lukemun/dreamcut-plugins`;
  creating it (public) and pushing `dist/marketplace/` there is an owner step.
