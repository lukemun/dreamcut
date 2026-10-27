# ChatGPT desktop installer

The download at `https://dreamcut.io/downloads/chatgpt/install.sh` registers DreamCut
in the user's personal local plugin marketplace. It is manual distribution, not
OpenAI directory approval. ChatGPT Desktop must support local plugins and the
account/workspace must permit them. Restart ChatGPT, install DreamCut from Plugins,
then enable it in a local chat. Browser-only ChatGPT is not supported.

This first installer supports Apple Silicon macOS, matching the published editor
runtime. It installs a checksum-pinned Node runtime in
`~/Library/Application Support/DreamCut/plugin-runtime`, and an owned plugin in
`~/.codex/plugins/dreamcut-desktop`. It does not require Git, npm login, system Node,
sudo, a source checkout, or changes to OS security settings. It preserves other
marketplace entries and keeps one prior plugin version on reinstall. It does not
automatically grant tool permissions. FFmpeg remains a prerequisite for media
processing and Google Chrome for export; the installer does not install those apps.

The plugin bundles the already-published `dreamcut@0.2.2` launcher. The editor
runtime downloads from Dreamcut.io on first use (about 300 MB). At least 5 GB of free
space is required by setup. Existing launcher disk, checksum and update checks
continue to apply. Project and profile data use DreamCut's normal application data
folder. No project files are modified by setup.

Original footage is processed locally. This full-tool plugin can return transcripts
and selected preview images to ChatGPT. Cloud learning ingestion is disabled for
this plugin process. It is not the restricted local-media-only trial profile.
Explicitly approved generation references remain governed by generation's upload
and approval flow. Do not describe this as preventing every possible media upload.

## Build and release

Run `node --test packaging/chatgpt-installer/setup.test.mjs`,
`bash -n packaging/chatgpt-installer/install.sh`, and
`node packaging/build-chatgpt-installer.mjs`. The builder downloads only the pinned
published npm package, verifies it, and emits an archive, generated checksum-pinned
shell installer and SHA256SUMS under ignored `dist/chatgpt-installer/`.

Publish those files to the existing public Blob prefix `dreamcut/chatgpt/` after
review. The website redirects `/downloads/chatgpt/:file` there. Never replace a
published versioned archive with different bytes: bump the plugin/payload version
for a new release. Publish the archive first, then the installer. Keep the mutable
installer cache short. `?download=1` requests an attachment from Blob.

Verify the public shell download with a disposable `DREAMCUT_INSTALL_HOME`, then
initialize the generated MCP configuration and enumerate tools using only that
folder. Never use a creator project as an installer fixture. Test the actual
ChatGPT Plugins install separately; successful MCP initialization alone does not
prove ChatGPT account availability or UI acceptance.

Rerun the current installer to update the plugin. The editor's existing update
mechanism is separate. To uninstall, remove DreamCut through ChatGPT's Plugins UI,
remove only its `dreamcut-desktop` marketplace entry, and remove its owned plugin
and private `plugin-runtime` folders. Preserve the application data folder's
projects and profiles. Do not restore the entire catalog backup over newer entries.
