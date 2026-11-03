# Hosted web UI, local coding agent and a shared on-disk library — sourced findings

| | |
| --- | --- |
| Date | 2026-10-11 |
| Method | Official specifications (MCP, WHATWG, WICG, W3C, POSIX, IETF), vendor documentation (Anthropic, OpenAI, Google Chrome, Microsoft, Apple, Mozilla, WebKit, Figma, Obsidian, Dropbox, SQLite) and primary essays, read through targeted web searches and page fetches on the date above. Quotes are short excerpts; section names follow each link. |
| Scope | (1) What MCP and the Claude Code / Codex clients support for a remote server directing a local agent; (2) browser access to a user's local folder and large video; (3) precedents and practices for one versioned on-disk format shared by several writers |
| Source records | No raw captures were retained; each finding below links its source and section. Items that could not be verified are listed at the end. |

## How to read this

This document records what sources say. DreamCut's proposed architecture and decisions live in
[web and desktop library contract](../architecture/web-desktop-library-contract.md), which cites this
document. Specifications quoted here change; the MCP revision cited is the one
`/specification/latest` resolved to on the date above.

## 1. MCP: remote servers directing a local agent

### Transports, state and security

- The current MCP revision is 2026-07-28. Its changelog removes the handshake: "Make MCP stateless:
  remove the `initialize`/`notifications/initialized` handshake." It also removes protocol sessions:
  "Remove protocol-level sessions and the `Mcp-Session-Id` header from the Streamable HTTP transport."
  [MCP changelog 2026-07-28, Major changes](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- Cross-call state moves into tool arguments: "Servers that need cross-call state use explicit,
  server-minted handles passed as ordinary tool arguments". [Same, Major changes #1](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- Streamable HTTP servers "**MUST** validate the `Origin` header on all incoming connections to prevent
  DNS rebinding attacks". Local servers "**SHOULD** bind only to localhost (127.0.0.1) rather than all
  network interfaces (0.0.0.0)." [MCP Streamable HTTP, Security](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
- "Authorization is **OPTIONAL** for MCP implementations." Where used over HTTP, servers "**MUST**
  implement OAuth 2.0 Protected Resource Metadata ([RFC9728])". [MCP Authorization, Protocol Requirements](https://modelcontextprotocol.io/specification/latest/basic/authorization)
- The security best practices page says local HTTP servers should "Require an authorization token" or use
  IPC. It also says servers "**MUST NOT** treat possession of a state handle as authentication."
  [MCP Security Best Practices, Local MCP Server Compromise; State Handle Hijacking](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices)

### Primitives a server can use to steer an agent

- Tools are "designed to be **model-controlled**", and "there **SHOULD** always be a human in the loop with
  the ability to deny tool invocations." [MCP Tools, User Interaction Model](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
- Servers may return `instructions`: "Optional natural-language guidance for LLMs on how to use this
  server effectively". [MCP server/discover, DiscoverResult](https://modelcontextprotocol.io/specification/2026-07-28/server/discover)
- "The Roots feature is deprecated as of protocol version `2026-07-28`". Roots "are informational guidance
  rather than an access-control mechanism. The protocol does not enforce that servers stay within
  roots." [MCP Roots](https://modelcontextprotocol.io/specification/latest/client/roots)
- The changelog's replacement for roots: "pass directories or files via tool parameters, resource URIs,
  or server configuration instead of Roots". [MCP changelog, Deprecated](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- "Sampling is deprecated as of protocol version `2026-07-28`." [MCP architecture, Data layer](https://modelcontextprotocol.io/docs/learn/architecture)
- Elicitation lets servers "direct users to external URLs for sensitive interactions that must *not* pass
  through the MCP client", and servers "**MUST NOT** use form mode elicitation to request sensitive
  information such as passwords, API keys". [MCP Elicitation](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation)

### Claude Code

All from [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp) unless linked otherwise.

- "HTTP servers are the recommended option for connecting to remote MCP servers", for example
  `claude mcp add --transport http notion https://mcp.notion.com/mcp`. (Remote HTTP servers)
- "Use `/mcp` to authenticate with remote servers that require OAuth 2.0 authentication". (Authentication)
- "Claude Code lists each MCP prompt as `/servername:promptname (MCP)`." Resources can be referenced
  "using @ mentions". (Use MCP prompts as commands; Use MCP resources)
- "Only tool names and server instructions load at session start", and Claude Code "truncates each tool
  description and each server's instructions at 2,048 characters." (Scale with MCP tool search)
- Tool output: a warning above 10,000 tokens and a default limit of 25,000 tokens, configurable with
  `MAX_MCP_OUTPUT_TOKENS`. (MCP output limits)
- Revision 2026-07-28 is supported on the "v2 runtime … MCP TypeScript SDK 2.0". (MCP client runtimes)
- Plugins can bundle servers: `mcpServers` is "Loaded together with `.mcp.json`". [Plugins reference, Fields](https://code.claude.com/docs/en/plugins-reference)
- Local file boundary: "Claude Code asks you before its file tools read or write outside the folder where
  it was started". [Claude Code security, Built-in protections](https://code.claude.com/docs/en/security)
- "The sandbox covers shell commands only. Claude's file tools, MCP servers, and hooks run outside it."
  [Claude Code sandboxing](https://code.claude.com/docs/en/sandboxing)
- `acceptEdits` mode "Automatically accepts file edits and common filesystem commands such as `mkdir`,
  `touch`, `mv`, and `cp`" in working directories. [Claude Code permissions, Permission modes](https://code.claude.com/docs/en/permissions)
- Remote Control: "the web interface connects to a Claude Code process running on your local machine.
  All code execution and file access stays local". [Claude Code security, Cloud execution security](https://code.claude.com/docs/en/security)

### Codex CLI

- Codex supports "**Streamable HTTP servers**: Servers that you access at an address." It "reads the MCP
  `instructions` field returned during initialization and uses it as server-wide guidance", and advises
  keeping the first 512 characters self-contained. [Codex MCP, Supported MCP features](https://learn.chatgpt.com/docs/extend/mcp)
- Remote servers are added with `codex mcp add <name> --url <url>` and `codex mcp login <server-name>`;
  stdio servers can run with npx, e.g. `codex mcp add context7 -- npx -y @upstash/context7-mcp`.
  [Codex MCP, Other CLI commands](https://learn.chatgpt.com/docs/extend/mcp)
- "Installed plugins can bundle MCP servers in their plugin manifest." [Codex MCP, Plugin-provided MCP servers](https://learn.chatgpt.com/docs/extend/mcp)
- "`workspace-write`: The agent can read files, edit within the workspace, and run routine local commands
  inside that boundary." [Codex sandboxing, Configure defaults](https://learn.chatgpt.com/docs/sandboxing)
- "By default, the agent runs with network access turned off." [Codex agent approvals and security](https://learn.chatgpt.com/docs/agent-approvals-security)
- "Destructive app/MCP tool calls always require approval when the tool advertises a destructive
  annotation". [Same, Sandbox and approvals](https://learn.chatgpt.com/docs/agent-approvals-security)

### Security guidance on instructions from servers

- "descriptions of tool behavior such as annotations should be considered untrusted, unless obtained
  from a trusted server." "Hosts must obtain explicit user consent before invoking any tool".
  [MCP specification, Key Principles: Tool Safety](https://modelcontextprotocol.io/specification/2026-07-28)
- "Verify you trust each server before connecting it. Servers that fetch external content can expose you
  to prompt injection risk." [Claude Code MCP](https://code.claude.com/docs/en/mcp)
- "Malicious MCP servers may include hidden instructions (prompt injections) designed to make OpenAI
  models behave unexpectedly." [OpenAI MCP connectors guide, Risks and safety](https://developers.openai.com/api/docs/guides/tools-connectors-mcp)

### Precedents

- Figma's desktop server "runs locally at `http://127.0.0.1:3845/mcp`" and is usable "only … via the Figma
  desktop app". [Figma local server installation](https://developers.figma.com/docs/figma-mcp-server/local-server-installation)
- "Figma strongly recommends using the remote MCP server", added with
  `claude mcp add --transport http figma https://mcp.figma.com/mcp` or
  `codex mcp add figma --url https://mcp.figma.com/mcp`. [Figma remote server installation](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation)
- Linear: "Our MCP server uses Streamable HTTP as the primary transport". [Linear MCP](https://linear.app/docs/mcp)
- The official filesystem server runs via npx and "runs with your user account permissions".
  [Connect to local MCP servers](https://modelcontextprotocol.io/docs/develop/connect-local-servers)

## 2. Browser access to the user's folder and media

### File System Access

- Directory pickers are supported in Chrome 86+ and Edge; Firefox and Safari: not supported.
  [MDN browser-compat-data, Window.showDirectoryPicker](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Window.json)
- The picker specification "is not a W3C Standard nor is it on the W3C Standards Track."
  [WICG File System Access, Status](https://wicg.github.io/file-system-access/)
- Mozilla's position is negative: "the protections described in the spec are inadequate".
  [mozilla/standards-positions #154](https://github.com/mozilla/standards-positions/issues/154)
- WebKit opposes write access, not seeing "a way to grant write access to the end user's local file
  system", while "Allowing usage of the new APIs for read access makes sense."
  [WebKit/standards-positions #28](https://github.com/WebKit/standards-positions/issues/28)
- `showDirectoryPicker` needs "Transient user activation" and a secure context.
  [MDN showDirectoryPicker, Security](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker)
- Writes go through a swap file: "This is typically implemented by writing data to a temporary file";
  changes are not reflected "until the stream has been closed". "User agents try to ensure that no partial
  writes happen." [WHATWG File System, §2.3.2](https://fs.spec.whatwg.org/)
- In the default `"siloed"` mode each writer has "its own swap file … The last writer opened has its data
  written"; `"exclusive"` makes a second writer throw `NoModificationAllowedError`.
  [MDN createWritable, mode](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createWritable)
- Handles can be saved "to IndexedDB". Without persistence, "Once a tab is closed, the site loses all
  access." Chrome may block "core operating system folders like Windows, the macOS Library folders".
  [Chrome: File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)
- Persistent permissions: "The new behavior can be observed as of Chrome 122." "Allow on every visit"
  "Allows the app to have indefinite access unless access is revoked"; "Installed apps will automatically
  persist permissions once the user grants access." [Chrome: persistent permissions](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api)
- The origin private file system "is private to the origin of the page" and not matched "one-to-one
  somewhere on the hard disk". [Chrome: File System Access API, OPFS](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)
- VS Code for the Web: "When working with local files, VS Code for the Web loads them through your
  browser's file system access APIs." [VS Code for the Web](https://code.visualstudio.com/docs/setup/vscode-web)

### Detecting changes made by other programs

- FileSystemObserver shipped in Chrome 133, desktop only, after an origin trial from 129 to 134.
  [blink-dev Intent to Ship](https://groups.google.com/a/chromium.org/g/blink-dev/c/6oOaFmia2dc/m/gx0KgpQqBQAJ)
- It reports changes "in the user's local device, or in the Bucket File System".
  [Chrome 133 release notes](https://developer.chrome.com/release-notes/133)
- Observation can be recursive; an `unknown` record means changes were missed and the app should
  re-scan; on Windows a move across directories arrives as disappeared plus appeared.
  [Chrome: FileSystemObserver](https://developer.chrome.com/blog/file-system-observer)
- Reading a `File` whose "snapshot state … does not match the state of the underlying storage" fails with
  `NotReadableError`. [W3C File API](https://w3c.github.io/FileAPI/)

### Large video

- `Blob.slice()` returns a byte range; a `File` "can be read into memory at the time a read operation is
  initiated". [W3C File API, slice](https://w3c.github.io/FileAPI/)
- `URL.createObjectURL` accepts "A Blob (such as a File)", released with `revokeObjectURL()`.
  [MDN createObjectURL](https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static)
- WebCodecs does "not provide a built-in way to read EncodedVideoChunk objects from a video file, or write
  them to a playable video file". [MDN WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API)
- `VideoDecoder`: Chrome 94, Edge, Firefox 130 (not Android), Safari 16.4.
  [MDN browser-compat-data, VideoDecoder](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/VideoDecoder.json)
- The WebCodecs samples demux MP4 with mp4box.js.
  [w3c/webcodecs samples, demuxer_mp4.js](https://github.com/w3c/webcodecs/blob/main/samples/video-decode-display/demuxer_mp4.js)

### A public site calling localhost

- Private Network Access enforcement "is currently on hold due to a number of compatibility problems."
  [Chrome: PNA on hold](https://developer.chrome.com/blog/pna-on-hold)
- "Local Network Access replaces that effort"; "The Local Network Access permission prompt is launching in
  Chrome 142." It covers "any request from the public network to a local network or loopback destination".
  [Chrome: Local Network Access](https://developer.chrome.com/blog/local-network-access)
- Such requests "are only allowed if their client is a secure context and permission is granted by the
  user." [WICG Local Network Access, §3.1](https://wicg.github.io/local-network-access/)
- Edge exposes `LocalNetworkAccessAllowedForUrls` (Edge 140+) and `LoopbackNetworkAllowedForUrls`
  (Edge 146+). [Edge policy: LocalNetworkAccessAllowedForUrls](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-browser-policies/localnetworkaccessallowedforurls)
- Zoom CVE-2019-13450: "any web site can interact with the Zoom web server on localhost port 19421 or
  19424". [CVE-2019-13450](https://cveawg.mitre.org/api/cve/CVE-2019-13450)
- Transmission's DNS-rebinding fix "mitigates this attack by requiring a host whitelist".
  [transmission PR #468](https://github.com/transmission/transmission/pull/468)

### Browsers built into agent apps

- Codex app: "Open the local route, file-backed page, or public page by clicking a URL or navigating
  manually in the browser", with `http://localhost:3000/settings` as the example; "The built-in browser
  uses a browser profile that is separate from your regular browser" and "keeps its own profile and
  browsing history"; "Browser is included with the desktop app and installs automatically." The engine
  is not named. [OpenAI: Browser](https://learn.chatgpt.com/docs/browser.md?surface=app) (fetched via the
  308 redirect from `developers.openai.com/codex/app/browser.md`). A third-party write-up dates the
  feature to April 2026 ([Pasquale Pillitteri](https://pasqualepillitteri.it/en/news/1568/codex-native-browser-openai-april-2026));
  OpenAI's release notes were not checked.
- Claude desktop app built-in browser, measured in DreamCut on 2026-10-11 by evaluating feature checks in
  the page (first-party observation, not vendor documentation): user agent `Claude/2.31226.1
  Chrome/152.0.7977.130`, brand "Chromium 152"; `showDirectoryPicker`, `FileSystemObserver`,
  `createWritable`, `navigator.gpu` and `VideoDecoder` present; `http://localhost:3123` is a secure
  context. Presence was checked; a folder picker was not opened.

## 3. A shared, versioned on-disk format

### Principles and precedents

- Local-first: "Even if the software author goes bust, you can continue running the last released version
  of the software." On folder sync: "Any software on your computer can read and write files in this
  folder", but "if the same file is edited on two different devices, the result is a conflict that needs to
  be merged manually". [Ink & Switch, Local-first software](https://www.inkandswitch.com/essay/local-first/)
- File over app: "Apps are ephemeral, but your files have a chance to last."
  [Steph Ango, File over app](https://stephango.com/file-over-app)
- Obsidian: "A vault is a folder on your local file system, including any subfolders"; it creates "an
  `.obsidian` configuration folder in the root folder of the vault" and "automatically refreshes your vault
  to keep up with any external changes." [Obsidian data storage](https://obsidian.md/help/data-storage)
- Obsidian: "Avoid syncing the same vault across multiple services"; "iCloud Drive on Windows may lead to
  file duplication or corruption." [Obsidian sync notes](https://obsidian.md/help/sync-notes)
- darktable: "Once an image has been imported into darktable, the database entries take precedence over
  the XMP file"; external changes "will be overwritten the next time darktable synchronizes the file."
  [darktable sidecar files](https://docs.darktable.org/usermanual/development/en/overview/sidecar-files/sidecar/)
- Final Cut Pro media and caches: "You can store these files within the library or in external folders."
  [Final Cut Pro, Set storage locations](https://support.apple.com/guide/final-cut-pro/ver7db6ffe77/mac)
- Dropbox: "Final Cut Pro libraries can't be saved or opened in the Dropbox folder"; "New macOS packages
  appear as regular files, but are actually bundles". [Dropbox macOS FAQ](https://help.dropbox.com/en-us/installs/macos-faqs)
- Apple Photos: do not store the library "on a device shared over your network or the internet, including
  over a cloud-based storage service." [Apple support 108345](https://support.apple.com/en-us/108345)

### OpenTimelineIO

- "OpenTimelineIO is an interchange format and API for editorial cut information."
  [OpenTimelineIO README](https://github.com/AcademySoftwareFoundation/OpenTimelineIO)
- Files "are serialized as JSON"; each object has an `"OTIO_SCHEMA"` pair identifying "the OTIO data type
  and version of that type"; metadata is carried along untouched; readers "should guard against
  unexpected top level types and fail gracefully." [OTIO file format specification](https://opentimelineio.readthedocs.io/en/latest/tutorials/otio-file-format-specification.html)
- Upgrades run in order ("call each upgrade function in order"); "a newer version of OpenTimelineIO can
  generate JSON with older schemas", and "Downgrade functions must be called in order with no gaps."
  [OTIO versioning schemas](https://opentimelineio.readthedocs.io/en/latest/tutorials/versioning-schemas.html)

### Schema evolution

- Protocol Buffers: "Changing field numbers for any existing field is not safe"; "Proto3 messages preserve
  unknown fields and include them during parsing and in the serialized output".
  [Protocol Buffers proto3 guide](https://protobuf.dev/programming-guides/proto3/)
- JSON Schema: "By default any additional properties are allowed."
  [JSON Schema, object](https://json-schema.org/understanding-json-schema/reference/object)
- Cambria defines "bidirectional translation functions called lenses", but "Lens evolutions cannot magically
  make two incompatible pieces of software work perfectly together." [Ink & Switch, Cambria](https://www.inkandswitch.com/cambria/)
- Microsoft: "if the version is less than the version the app expects, the app should update the app data
  to the new format and update the version." [Store and retrieve app data, Versioning](https://learn.microsoft.com/en-us/windows/apps/develop/data/store-and-retrieve-app-data)

### Several writers

- POSIX `rename`: the new name "shall remain visible … and refer either to the file referred to by new or
  old". [POSIX rename](https://pubs.opengroup.org/onlinepubs/9799919799/functions/rename.html)
- Windows `ReplaceFile` requires files "on the same volume", documents `REPLACEFILE_WRITE_THROUGH` as "not
  supported", and lists partial-failure states such as "The file to be replaced still exists with a
  different name." It makes no atomicity claim. [ReplaceFileA](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilea)
- Advisory locks: "a process is free to ignore the use of flock()". [flock(2)](https://man.archlinux.org/man/flock.2.en)
  "the close() system call will cancel all POSIX advisory locks on the same file for all threads"
  [SQLite: How to corrupt, §2.2](https://www.sqlite.org/howtocorrupt.html)
- SQLite: exclusive locks "have been known to operate incorrectly for some network filesystems. This has led
  to database corruption." [SQLite over a network](https://www.sqlite.org/useovernet.html)
- HTTP `If-Match` exists "to prevent accidental overwrites when multiple user agents might be acting in
  parallel on the same resource". [RFC 9110 §13.1.1](https://www.rfc-editor.org/rfc/rfc9110.html)
- Apple: "Two different processes acting on the same file might make changes that the other is not
  expecting." [File System Programming Guide, File Coordinators](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileCoordinators/FileCoordinators.html)

### Default locations

- macOS: "Movies—Contains the user's video files"; apps "must not write files to the preceding directories
  unless explicitly directed to do so by the user." Application Support is for "all app data files except
  those associated with the user's documents"; "the system may delete the Caches/ directory".
  [Apple File System Programming Guide, macOS Standard Directories](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileSystemOverview/FileSystemOverview.html)
- Windows Known Folders: `FOLDERID_Videos` defaults to `%USERPROFILE%\Videos`; `FOLDERID_LocalAppData` to
  `%USERPROFILE%\AppData\Local`. [KNOWNFOLDERID](https://learn.microsoft.com/en-us/windows/win32/shell/knownfolderid)
- Windows: "Don't use app data to store user data or anything that users might perceive as valuable and
  irreplaceable"; "Roaming data and settings is no longer supported as of Windows 11".
  [Store and retrieve app data](https://learn.microsoft.com/en-us/windows/apps/develop/data/store-and-retrieve-app-data)

## Unverified, inaccessible or contested

- Codex support for MCP revision 2026-07-28, MCP prompts and MCP resources is not documented on official
  pages; resources appear only in [openai/codex PR #5239](https://github.com/openai/codex/pull/5239).
- Linear's docs mention a Codex `rmcp` feature flag that current OpenAI docs do not list.
- Instruction length guidance differs: Claude Code truncates at 2,048 characters; Codex advises a
  self-contained first 512 characters.
- Whether Chrome splits loopback and local-network permissions (reported for Chrome 145) appears only in
  third-party sources.
- The WHATWG File System standard states atomic replacement is "expected", not required.
- DaVinci Resolve and Lightroom Classic storage guidance could not be fetched from official pages
  (403 or not found); only forum quotations were available.
- Kleppmann's *Designing Data-Intensive Applications* chapter 4 could not be fetched (403).
- Photopea and Squoosh use of File System Access could not be confirmed from official sources.
- iCloud "Optimize Mac Storage" and OneDrive Files On-Demand effects on media files were not checked.
