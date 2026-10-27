# Releasing DreamCut

The editor ships as a small npm launcher (`dreamcut`) that downloads a ready-built runtime from this
website at `https://dreamcut.io/downloads/runtime`. Installed launchers pick up new runtimes from its feed on their
own, so most releases need no new npm version.

## Releasing with one command

Releases happen only when the owner decides to ship. On an Apple Silicon Mac with Node 22 or 24, the
GitHub CLI signed in, an npm login, `BLOB_READ_WRITE_TOKEN` in the environment, and `SENTRY_AUTH_TOKEN`
(a Sentry token that can upload releases; without it the release builds without source maps and Sentry
shows minified stack traces):

1. Bump `version` in `package.json` and add a matching `## <version>` section to `CHANGELOG.md`.
2. Commit and push `main`.
3. Run `pnpm release --dry-run` to build and verify everything and see what would be published, then
   `pnpm release`.

`pnpm release` (`packaging/release.mjs`) refuses uncommitted or unpushed work, a missing changelog section,
a version listed in `packaging/release-hold.json`, and a version that is already a GitHub Release. It then
runs the steps below in order, stopping at the first failure, and publishes the npm launcher only when npm
lacks this version. To hold a version back, list it in `release-hold.json`; remove it when it may ship.

Each computer builds only its own download (native modules differ per platform). After the Mac release,
run `pnpm release --add-platform` on a Windows machine (or a Windows 11 Arm VM with x64 Node installed, for
`win32-x64`) at the same commit; it attaches that platform's download to the existing release and merges it
into the update feed. Computers with no download are directed to the install page; private source is not a public fallback.

## Release checklist

Before `pnpm release`:

- [ ] Work for this version is committed and pushed; `version` and the `CHANGELOG.md` section match.
- [ ] Open a new terminal so `~/.zshrc` is loaded, then confirm the tokens are exported (`env | grep -c
      'BLOB_READ_WRITE_TOKEN\|SENTRY_AUTH_TOKEN'` prints 2), `npm whoami` answers and `gh auth status` is signed in.
- [ ] The dreamcut.io privacy page that describes error and bug reports is deployed (site repo), since every
      release reports errors to Sentry.
- [ ] dreamcut.io serves the membership offer (`curl https://dreamcut.io/api/v1/membership` returns the price and
      benefits) and `/api/v1/me` includes `member`; without them the editor shows no membership offer.

Run `pnpm release --dry-run` and check its log before the real run:

- [ ] `Compiled 19 background jobs` (or the current count) and `Compiled 5 MCP entries` appear, with
      `Prebuilt the GPU preview worker and renderer`.
- [ ] `Dry run: SENTRY_AUTH_TOKEN found; source maps will upload on the real release.` appears (a dry run uploads
      nothing; the real run prints `Uploaded source maps for dreamcut@<version> to Sentry`).
- [ ] No "Source maps would ship" or "DreamCut source would ship" error, and the first-run check ends with every
      check passed (32/32 on macOS, including the shipped FFmpeg; 31 on Windows).
- [ ] `Built dist/media-tools/<platform>` and its `dreamcut-media-source-…tar.gz` appear (macOS), and `latest.json`
      names that archive as `media_source`.

After `pnpm release`:

- [ ] Sentry shows the release `dreamcut@<version>` with source maps (Project Settings → Source Maps).
- [ ] `npx dreamcut@latest` on a clean machine or fresh app-data folder installs the new version and opens a project.
- [ ] From that install, send **Report a bug** once and see it arrive in Sentry with its replay.
- [ ] Signed out, User → My style and User → Settings each show a Sign in prompt.
- [ ] Signed in with an account that has no membership, both show the membership offer ($8 struck through, $5 / month,
      Limited time, the benefits), and **Become a member** opens dreamcut.io/account. A member account shows no offer.

## The steps

1. Build the runtime: `pnpm editor:build`, `node desktop/package.mjs --service-only`, on macOS
   `node packaging/build-ffmpeg.mjs`, then `node packaging/build-web-runtime.mjs`. `build-ffmpeg` builds the
   FFmpeg and ffprobe the runtime ships (`media-tools/`) from pinned source releases in about 10 minutes. That
   build is GPL: the runtime carries its licences and every release publishes its complete corresponding source
   (`dreamcut-media-source-<platform>-<id>.tar.gz`, the feed's `media_source`) beside the downloads. Never ship
   one without the other. `editor:build` also compiles the background jobs into minified
   `workers/*.mjs`, the MCP server in place, and the GPU preview worker and renderer into `prebuilt/`, and
   writes `code-identity.json`. The package carries no DreamCut source: from `src/`, `scripts/` and `mcp/`
   only data and a few runtime helpers ship (`desktop/package-policy.mjs`), and packaging refuses a build
   that would ship source or lacks the compiled parts. It adds the licence notice to every shipped code
   file. It also compiles in the public error-report settings from `packaging/release-telemetry.json`, so every install reports errors and can send Report a bug. With
   `SENTRY_AUTH_TOKEN` set, it makes source maps, uploads them to Sentry under `dreamcut@<version>`
   (`desktop/source-maps.mjs`) and deletes them; packaging refuses any map left behind. None of
   this runs under `pnpm dev`.
2. Pack and check the launcher: `node packaging/pack-launcher.mjs`, then `node packaging/verify-web-runtime.mjs`.
   The check turns off the runtime's background feature setup (`DREAMCUT_FEATURE_SETUP=0`); that setup
   (FFmpeg fallback, captions, voice, cutouts; about 4 GB) is covered by the install check in
   [`.agents/skills/install-check`](../.agents/skills/install-check/SKILL.md).
3. Publish public downloads: `node packaging/upload-runtime.mjs --base-url https://dreamcut.io/downloads/runtime --dry-run`, then without `--dry-run`. The feed is published last and uses Dreamcut.io addresses.
4. Record the private GitHub release: `node packaging/publish-release.mjs --dry-run`, then without `--dry-run`.
5. Publish the launcher when npm lacks this version: `npm publish dist/npm/dreamcut-<version>.tgz`.

Large uploads can fail over some VPNs; disconnect and retry.

## Launcher-only distribution updates

Keep the qualified editor build unchanged when only its installer needs changing. Download and verify
its public `latest.json`, then run `node packaging/pack-launcher.mjs --launcher-version <new-version>
--feed <verified-feed.json>`. Review the package, test a fresh install in disposable app data, then
publish `dist/npm/dreamcut-<new-version>.tgz`. The npm/plugin version changes; the runtime snapshot
keeps its actual version. This does not release a held editor version.

The public feedback form lives at `https://dreamcut.io/feedback` and sends text to Sentry. Before making source private, verify
anonymous downloads and a fresh install through the published npm package. Old pinned/cached launchers
must be replaced with `npx dreamcut@latest`; their GitHub update endpoint cannot redirect after privacy.
