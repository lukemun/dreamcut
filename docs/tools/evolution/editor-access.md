# Open the local editor from a coding agent — evolution

Capability: `editor-access`. Registry: [registry.json](../registry.json). Design:
[local web app contract](../../architecture/web-desktop-library-contract.md).

## Purpose and boundary

Let a creator working in Claude Code or Codex see and use the DreamCut editor: the agent starts the local
editor (or reuses the running one) and gets a browser link for its built-in browser or any browser. The
editor binds 127.0.0.1 only and refuses requests without the per-launch session, with a foreign Host or
Origin, or marked cross-site. The link carries a single-use code that expires in about two minutes and is
exchanged for an HttpOnly, SameSite=Strict cookie, so a link that lands in a transcript grants nothing once
used. No project, timeline or file changes.

## 2026-10-11 — initial tool

- **Observation:** DreamCut launches as a local web app driven from agent apps; the desktop shell set the
  session cookie through Electron, which other browsers lack.
- **Existing owners:** `desktop/service.mjs` already served the editor on a random loopback port behind
  `authorizeRequest` (Host, Origin, Sec-Fetch-Site and session-cookie checks).
- **Decision:** reuse that service. Add a sign-in route, a code-minting route for authorized callers and a
  health route (`desktop/service-policy.mjs`). Add `mcp/editor-runtime.mjs` to start or reuse the service
  through a per-user runtime file (mode 600), the `dreamcut` command (`bin/dreamcut.mjs`: `dreamcut`,
  `dreamcut mcp`, `dreamcut status`) and the `editor_open` tool. The MCP server under `dreamcut mcp`
  connects to the editor lazily on first need, so agent clients never wait for it when connecting.
  In-editor agent access: excluded, because it already runs inside the editor.
- **Verification:** `desktop/service-signin.test.mjs` covers single-use and expired codes, safe redirects,
  sign-in followed by cookie use, and refusal of DNS-rebound Host (raw requests, since fetch drops a custom
  Host), cross-site and foreign-Origin requests. A live run from a checkout started the editor in 3 s on a
  random port, reused it from a second caller, refused unauthenticated requests, signed a client in once,
  served the Library API and home page, refused the reused link, and removed the runtime file on stop.
- **Model evidence (2026-10-11, `editor-open-storyboard`, simulated tools):** Codex gpt-6.1-sol 3/3,
  Claude Opus 5.5 3/3 after one correction. The feature eval runs with the in-editor agent's project-bound
  instructions, so a first version naming another project ("trip") failed 0/3: models correctly declined
  to leave the session's project. The case now asks about the current project, and the eval offers a
  coding-agent-only capability's tools for its own case. **Gap:** the eval has no coding-agent instruction
  surface; add one before evaluating cross-project coding-agent requests.
## 2026-10-11 — packaged runtime

- **Decision:** the `dreamcut` npm launcher downloads a checksum-verified, per-platform runtime archive
  (design: [distribution](../../architecture/web-desktop-library-contract.md#distribution-decided-2026-10-11)).
  Until a Library is chosen, the packaged runtime keeps projects in app data rather than inside the
  install. `dreamcut mcp` exits normally on SIGTERM/SIGINT so its editor's record is cleared.
- **Verification:** `packaging/verify-web-runtime.mjs` passed 15/15 on macOS arm64 from fresh app data and
  the packed launcher: tampered download refused; install in 7 s; MCP answers in 55 ms; production
  editor up in about 1 s; Library created; single-use sign-in; unsigned and reused requests refused;
  nothing written inside the install; editor process and record gone after the agent disconnects.
  Failures found and fixed on the way: the crash watchdog (forked by URL) was missing from the runtime;
  the verifier blocked its own download server; signal termination skipped cleanup.
- **Acceptance for next change:** run the same check inside the Claude and Codex apps once the runtime
  is published; build and check the Windows runtime on Windows.

## 2026-10-11 — self-updating runtime

- **Observation:** shipping editor changes must reach creators without a reinstall or a new npm release.
  A hosted interface was weighed and rejected: it needs the browser's local-network prompt (unverified in
  the agent apps' built-in browsers), creates version skew against every installed local helper, and fails
  offline (design: [distribution](../../architecture/web-desktop-library-contract.md#distribution-decided-2026-10-11)).
- **Decision:** split the runtime into a base layer (`node_modules`, identified by contents and Node ABI)
  and a per-version app layer. The launcher reads `latest.json`, starts the newest installed version at
  once and installs newer ones in the background. `mcp/runtime-updates.mjs` lets the running service
  offer the update (`/__dreamcut/update`, session-only); applying it restarts the service from the new
  version on the same port with the same token, refused while an owned worker runs. The editor shows
  **Update** in the workspace bar (`src/app/UpdateButton.tsx`) only when an update is ready.
- **Verification:** `desktop/runtime-updates.test.mjs` (version order, incomplete or out-of-tree installs
  never offered, resolved-path roots, launcher name parity). `packaging/verify-web-runtime.mjs` 23/23 on
  macOS arm64: a version published while the editor ran installed in 2 s without re-downloading the base,
  was offered, and applied in about 1 s on the same address with the browser still signed in; the agent's
  next tool call worked. In the Claude app's built-in browser, Update appeared, one click reloaded the page
  as the new version, and the button disappeared. Failures found and fixed: macOS temp paths resolve
  through `/private`, which hid the update until paths were compared resolved; `dreamcut --no-open`
  treated the flag as a command.
- **Limits:** the app layer is 141 MiB compressed (base 134 MiB): `src` 45, effect references 41, the
  editor build 38 and `public` 17. A third, rarely-changing asset layer would cut ordinary updates to about
  40 MiB. The agent's MCP server keeps its starting code until the agent restarts it, so tool contracts
  must stay compatible across adjacent versions. Windows junctions and `tar` extraction are unverified.

## 2026-10-11 — plugins for Claude Code and Codex

- **Observation:** creators install DreamCut into their agent app, which starts the MCP server with each
  session and gives up after about 30 s (Claude Code) or 10 s (Codex); the first runtime download takes
  minutes.
- **Decision:** the `dreamcut` npm package is the plugin for both apps (both manifests, MCP entries and
  the `edit-video` and `open` skills), installed through one marketplace file. With no runtime yet,
  `dreamcut mcp` answers at once with `dreamcut_setup_status`, downloads in the background, then hands
  the connection to the real server and sends `tools/list_changed`. Downloads retry dropped connections;
  extraction no longer blocks the launcher.
- **Verification:** `desktop/launcher-bootstrap.test.mjs` (immediate answers, hand-over with one replayed
  `initialize`, requests queued during the hand-over, failure reporting). `claude plugin validate --strict`
  passes for the plugin and both marketplaces. A headless Claude Code session with fresh app data saw
  only the setup tool, reported progress, and gained the full tools when setup finished; its
  `library_status` call worked. The first such run failed at 48% with `ECONNRESET`: the server dropped
  the idle keep-alive connection while the blocking extraction ran, which the retry and asynchronous
  extraction fixed. Codex installed the plugin from the same marketplace and registered
  `npx -y dreamcut@<version> mcp`.
- **Limits:** the Codex session itself is untested (its MCP command needs the package on npm, and a
  scratch Codex home has no login); Codex's handling of `tools/list_changed` is unknown, so the
  instructions install the runtime first.

## 2026-10-14 — reconnect after the editor goes away

- **Observation (code review):** under `dreamcut mcp` the MCP server kept its first editor connection for
  its whole life. A reused editor stops when its owning process exits, and an owned one stops after a
  crash or a failed post-update restart; every later tool call then failed until the agent app restarted
  the server.
- **Decision:** `autostartEditorConnection` (`mcp/editor-runtime.mjs`) drops the connection when an owned
  editor's `stopped` settles, or when a request to a reused editor fails at the transport, so the next call
  starts or reuses an editor. Any editor may be restarting in place after an update, and starting another
  then would run two editors on one projects folder, so a refused request first waits a second and retries
  the same editor; an owned editor keeps its connection until it stops. A restart slower than that wait can
  still lead a reused connection to start its own editor. A refused connection (nothing reached the editor) is retried once; any other transport failure
  is reported without retrying, since a non-idempotent request may have arrived. HTTP error statuses keep
  the connection. An explicit `TIMELINE_EDITOR_BASE_URL` is unchanged.
- **Verification:** `mcp/editor-connection.test.mjs` (reused editor closes → request retried on a new one;
  owned editor stops → forgotten; owned or reused editor restarting → same editor retried, none started; dropped-after-send → one attempt, then reconnect; HTTP 500 and failed
  start). Not run live against an exiting `dreamcut` owner.

## 2026-10-28 — updates for GitHub installs

- **Observation:** creators now install by cloning the public repository (2026-10-27) and had no update
  path besides remembering `git pull && pnpm install`; the launcher's runtime updates no longer apply.
- **Existing owners:** `editor_open` is the first call of a DreamCut session; the editor service already
  restarts in place on the same port and session when an update is applied (`/__dreamcut/update`, the
  editor's Update button); `pnpm editor` rebuilds by itself when code changes.
- **Decision:** `mcp/install-updates.mjs` checks (fetch of the default branch, 15 s bound, commit subjects)
  and fast-forwards (`merge --ff-only` to the checked commit, `pnpm install --frozen-lockfile` when the
  lockfile changed, moving back if that fails). It refuses, changing nothing, a copy with tracked changes,
  local commits or another branch, a fork, and a non-git install; a development checkout (`core.hooksPath`
  in its own config, `git config dreamcut.updates off`, `DREAMCUT_UPDATES=off`, CI) is never fetched. The MCP
  server starts the check at `initialize` and `editor_open` returns `dreamcut_update` when there is something
  to tell the creator; the new `dreamcut_update` tool (check / apply) applies only after the creator agreed,
  then asks the editor to restart. The service names a git install's commit in its version, so code pulled
  while it runs is offered as an update (and its Update button restarts it). `dreamcut` prints the notice
  beside its link, `dreamcut update` applies it, `pnpm editor` logs it. In-editor agent access: excluded
  with the capability. The agent's own MCP server keeps its code until a new chat.
- **Verification:** `mcp/install-updates.test.mjs` (local bare upstream behind the public URL via
  `url.insteadOf`: behind → changes listed, fast-forwarded, reinstall only on lockfile change, failed
  reinstall moved back; dirty, local commit and other branch refused with files and HEAD unchanged;
  hooks, config, env and CI opt-outs make no fetch; offline, fork and non-git reported).
  Live run on a disposable clone of the public repository (origin the public URL, fetches redirected to a
  local copy carrying this change plus two newer commits, one touching the lockfile): `dreamcut` printed
  the two commit subjects beside its link; over the clone's `dreamcut mcp`, `editor_open` returned
  `dreamcut_update` and `apply` fast-forwarded, ran the real `pnpm install` and restarted the editor on the
  same port (new process, version `+<new commit>`, Library API answering). `dreamcut update` then refused a
  tracked edit, a local commit, another branch and `core.hooksPath`, each with HEAD and files unchanged.
- **Limits:** not run inside the Claude or Codex apps (the tool flow was driven over stdio); `pnpm editor`
  on a git install relies on its existing rebuild-on-change and was not rerun; Windows is unverified.
