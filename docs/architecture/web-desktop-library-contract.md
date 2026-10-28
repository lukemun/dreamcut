# Local web app, agent plugin and library contract

Status: direction decided 2026-10-11; since 2026-10-27 DreamCut installs from its public GitHub repository. This replaced the macOS-first launch plan: DreamCut
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

- **Install from GitHub (2026-10-27).** The README's steps: `git clone`, `pnpm install`, `pnpm bootstrap`,
  then connect the agent with `claude mcp add dreamcut -s user -- node ~/DreamCut/bin/dreamcut.mjs mcp`
  (Codex: `codex mcp add dreamcut -- node ~/DreamCut/bin/dreamcut.mjs mcp`). The agent can run these
  itself when asked to "install DreamCut from https://github.com/lukemun/dreamcut".
- **First run inside an agent app.** On first use the MCP server starts the editor from the checkout
  (`mcp/editor-runtime.mjs`); the first start compiles it, which takes a minute or two.
- **No agent:** `node bin/dreamcut.mjs` starts the editor and opens a sign-in link; `pnpm editor` serves the
  stable build on 3123 for development.
- **Retired 2026-10-27:** the npm package that doubled as the Claude Code and Codex plugin (see
  [Distribution](#distribution-decided-2026-10-11)).

The website's install page (dreamcut.io/install, in the DreamCut Cloud `site/` app) gives each agent its
own install prompt to paste into a session, which the agent runs step by step under its own permission
rules, plus the same steps to run by hand. It does not yet state what DreamCut shares (see Edit data below).

### 3. One local process serves the editor and the tools

The MCP server the agent launches starts the editor server if it isn't running and returns its URL from an
`editor_open` tool, so the agent can open it in its browser. This is today's split (`mcp/server.mjs`
calling the editor over HTTP), from one checkout. Started this way from a checkout, the editor runs in
development mode on a free 127.0.0.1 port behind a per-launch session (`desktop/service.mjs`), so it never
collides with `pnpm editor` (3123) or `pnpm dev` (3129).

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

- **Installed from GitHub (decided 2026-10-27)**, with the steps under
  [Install from GitHub](#2-no-hosted-mcp-install-from-instructions-on-the-website).
- **Updating:** `editor_open` reports commits the install lacks (`dreamcut_update`), and with the creator's OK
  `dreamcut_update` or `node bin/dreamcut.mjs update` fast-forwards, reinstalls changed dependencies and
  restarts the editor in place ([install-updates.mjs](../../mcp/install-updates.mjs)); then a new agent chat.
  Dirty, diverged, off-branch, forked and development copies are never touched. Projects live in the
  Library folder the creator chose, outside the repository, so updates never touch them.
- **Node.js** 22 or 24 (LTS) and Git are prerequisites; Google Chrome for exports. The creator's agent
  installs what is missing (WinGet `Git.Git OpenJS.NodeJS.LTS Google.Chrome` on Windows).
- **Until a Library is chosen**, a checkout keeps projects in its own `projects/` folder. `library_status`
  offers to move them.
- **Releasing** is pushing the public repository after its checks ([releasing](../releasing.md)).
- **Retired 2026-10-27: the npm launcher and runtime feed.** From 2026-10-11 the `dreamcut` npm launcher
  downloaded a prebuilt, self-updating runtime (an app layer per version and a shared dependency layer,
  checksum-verified against a `latest.json` feed on dreamcut.io), and `pnpm release` published it. Both
  stay published at 0.3.0 but are not referenced: don't point anyone at `npx dreamcut`. The packaging code
  was removed from this repository; its history is in git.
- **Edit data** is collected by the existing export sharing (`src/lib/local-store/export-sharing.ts`):
  only from a signed-in account, through the authenticated `/api/v1/evidence` (signed out, nothing is
  sent; the pseudonymous `ingest-export` path was removed 2026-10-27), on by default, turned off in settings. The install
  instructions page must state it accurately.
- **Verification:** `pnpm qa` (`scripts/qa-fresh-clone.mjs`) clones the pushed main into a throwaway
  folder, runs the README's install steps and starts the editor the way a new user's agent does, with its
  own app data and exports folders.

## What changes from today

| Area | Today | Decided direction |
| --- | --- | --- |
| Launch | Signed macOS desktop app first | Local web app from a GitHub checkout, used through Claude Code or Codex, macOS and Windows; desktop later |
| Creator content | `Application Support/DreamCut/projects` | Visible, creator-chosen DreamCut Library; one-time migration |
| Format rules | Inside the Next.js server | `@dreamcut/library`, shared by editor, MCP and desktop |
| Install | Desktop installer | Public GitHub checkout (`pnpm bootstrap`, 2026-10-27); website gives instructions |
| Editor server | Dev server on :3123, no auth | Started by the agent's MCP on a free 127.0.0.1 port, Host/Origin allowlist, per-launch secret |

## Phases

Phases 2 and 3 were built for the npm launcher and plugin and retired with them on 2026-10-27; the GitHub
install replaces both.

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
- Port (settled): the agent-started editor takes a free port each launch and the MCP reports it; `pnpm
  editor` keeps 3123 for development.
