# Claude motion graphics — source records

Retrieved 2026-10-10. Capture scope: attributed short excerpts and section metadata only, not full captures. Live documentation pages are unpinned and undated unless a date is shown. GitHub star counts and push dates were read from the GitHub REST API (`gh api repos/<owner>/<repo>`) on the retrieval date. Findings IDs refer to the [evidence deliverable](../../2026-10-10-claude-motion-graphics-pipelines.md).

Retrieval: vendor pages were fetched directly; X posts were read through the public `api.fxtwitter.com` embed endpoint after `x.com` returned HTTP 403; repository READMEs were read from `raw.githubusercontent.com` at `main`. Rows marked **secondary** are reported by a third party only and were not confirmed at a primary source.

## Records

| ID | Publisher / title / URL | Date | Supported findings | Brief verbatim excerpt |
| --- | --- | --- | --- | --- |
| A01 | Anthropic, [Get started with Claude Motion](https://support.claude.com/en/articles/17454997-get-started-with-claude-motion) | undated (current) | F01–F03 | “Claude Motion doesn't use a video generation model” |
| A02 | Anthropic, [Dashboards and motion](https://claude.com/resources/articles/dashboards-and-motion) | 2026-10-08 | F01, F03 | “writes code that animates your text, charts, shapes, and images” |
| A03 | Anthropic, [Introducing Claude Design](https://www.anthropic.com/news/claude-design-anthropic-labs) | 2026-04-17 | F04 | “export to Canva, PDF, PPTX, or standalone HTML files” |
| A04 | Anthropic, [Claude Opus 5.5](https://www.anthropic.com/claude-opus-5-5) | 2026-09-22 | F05 (absence) | — no mention of video, animation or motion graphics found |
| B01 | Stephan Livera, [X post](https://x.com/stephanlivera/status/2103315922098470926) | 2026-09-25 | F06 | “Opus 5.5 on Max effort” |
| B02 | Thariq (@trq212), quoted in Jonny Burger, [X post](https://x.com/JNYBGR/status/1947746161743564974) | 2025-07-22 | F07 | “every video you see below was vibe coded by Claude Code”; “the AI is using Remotion” |
| B03 | NO1ennn, [X post](https://x.com/N01ennn/status/2108182955671580771) | 2026-10-08 | F08 | repo roundup; not independently fetched (agent capture only) |
| B04 | whaleyxbt, [claude-motion](https://github.com/whaleyxbt/claude-motion) README | 2026 | F09 | “Remotion skills teach your agent the API. This teaches it taste” |
| B05 | AY Automate, [Opus 5.5 motion graphics](https://www.ayautomate.com/resources/claude-opus-5-5-motion-graphics) — **secondary** | data pulled 2026-09-28 | F10 | quotes Charlie Hills: “Every frame is code, After Effects never opened.” |
| B06 | pasqualepillitteri.it and blog.laozhang.ai — **secondary, search-summary only** | 2026 | F11 | — fetch failed; not quoted |
| C01 | Remotion, [Agent Skills](https://www.remotion.dev/docs/ai/skills) | undated | F12 | “useful for AI agents like Claude Code, Codex, Kimi Code or Cursor” |
| C02 | Remotion, [Chrome Headless Shell](https://www.remotion.dev/docs/miscellaneous/chrome-headless-shell); [Encoding](https://www.remotion.dev/docs/encoding) | undated | F13 | “ideal for screenshotting (and therefore Remotion)”; “Backed by FFmpeg” |
| C03 | Remotion, [LICENSE.md](https://raw.githubusercontent.com/remotion-dev/remotion/main/LICENSE.md) | main at retrieval | F14 | “up to 3 employees” |
| C04 | Remotion, [Export to OpenTimelineIO](https://www.remotion.dev/docs/export-opentimeline) | undated | F15 | “It is not possible to deterministically export a Remotion project to the OpenTimelineIO format.” |
| C05 | HeyGen, [hyperframes README](https://github.com/heygen-com/hyperframes) (60,414 stars) | main at retrieval | F16 | “The renderer seeks each frame in headless Chrome and encodes the result with FFmpeg” |
| C06 | HeyGen, [HyperFrames connector](https://claude.com/connectors/hyperframes-heygen) | added 2026-06 | F16 | “turns HTML code into videos” |
| C07 | Motion Canvas, [Rendering](https://motioncanvas.io/docs/rendering) | undated | F17 | “save each frame as an image to `/output`” |
| C08 | Manim Community, [Deep dive](https://docs.manim.community/en/stable/guides/deep_dive.html); [0.19.0 changelog](https://docs.manim.community/en/stable/changelog/0.19.0-changelog.html) | v0.19.0 2025-01-20 | F17 | SceneFileWriter “remains Manim's interface to `libav`” |
| C09 | GreenSock/Webflow, [Standard license](https://gsap.com/standard-license/) | modified 2025-05-30 | F18 | “Commercial usage is covered under the standard license.” |
| D01 | Higgsfield AI, [X post](https://x.com/higgsfield_ai/status/2103839805360820589) (474,542 views at retrieval) | 2026-09-26 | F19 | “You get an editable After Effects project to keep working on.” |
| D02 | docsforadobe, [After Effects Scripting Guide](https://ae-scripting.docsforadobe.dev/introduction/overview/) | repo pushed 2026-09-11 | F20 | “After Effects scripts use the Adobe ExtendScript language” |
| D03 | Dakkshin, [after-effects-mcp](https://github.com/Dakkshin/after-effects-mcp) (724 stars, pushed 2026-04-01) | — | F21 | “via the Model Context Protocol using ExtendScript” |
| D04 | FileFormat.com, [AEP](https://docs.fileformat.com/video/aep); UK National Archives, [PRONOM fmt/796](https://pronom.nationalarchives.gov.uk/fmt/796.xml) | — | F22 | “internal file structure of AEP file is not available publicly” |
| D05 | Adobe, [Photoshop file format spec](https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/) | Nov 2019 | F23 | Resource 1075: “Timeline Information. 4 bytes (descriptor version = 16), Descriptor” |
| D06 | Agamnentzar, [ag-psd](https://github.com/Agamnentzar/ag-psd) (728 stars); [psd-tools](https://github.com/psd-tools/psd-tools) (1,475 stars) | pushed 2026-10 | F23 | “Does not support animations” |
| D07 | Lottie Animation Community, [Lottie spec 1.0](https://lottie.github.io/lottie-spec/1.0/) | v1.0 2024-09-17 | F24 | “a JSON-based format for animated vector graphics” |
| D08 | LottieFiles, [LottieFiles for AE v4](https://releases.lottiefiles.com/log/lottiefiles-for-ae-v4) | 2024-12-18 | F24 | “Lottie to AE is in beta period” |
| D09 | Diffusion Studio, [lottie](https://github.com/diffusionstudio/lottie) (5,564 stars) | pushed 2026-07-25 | F25 | output can be “imported into After Effects for further refinement” |
| D10 | Blackmagic Design forum, [Fusion settings as text](https://forum.blackmagicdesign.com/viewtopic.php?p=641749); samuelgursky, [davinci-resolve-mcp](https://github.com/samuelgursky/davinci-resolve-mcp) (3,460 stars) | — | F26 | `.setting`/`.comp` are plain-text Lua tables (forum; no formal grammar found) |
| D11 | ahujasid, [blender-mcp](https://github.com/ahujasid/blender-mcp) (30,427 stars) | pushed 2026-10-06 | F27 | “allows running arbitrary Python code in Blender” |
| D12 | Rive, [RML](https://rive.app/docs/runtimes/advanced-topic/rml) | undated | F28 | “a text-based representation of a Rive file” |
| D13 | Apple, [FCPXML reference](https://developer.apple.com/documentation/professional-video-applications/fcpxml-reference); DareDev256, [fcpxml-mcp-server](https://github.com/DareDev256/fcpxml-mcp-server) | — | F29 | “not a substitute for a native Final Cut Pro project” |
| D14 | Adobe, [Adobe for creativity connector](https://blog.adobe.com/en/publish/2026/04/28/adobe-for-creativity-connector) | 2026-04-28 | F30 | “pick up where you left off in any of your favorite Adobe apps” |
| D15 | Adobe, [Major expansion news release](https://news.adobe.com/news/2026/06/adobe-unveils-major-expansion) | 2026-06-18 | F30 | “If you can do it in the Project panel or Timeline, AI Assistant can help.” |

## Unresolved retrievals

- `x.com` returned HTTP 403 to direct fetch; recovered via `api.fxtwitter.com` for B01, B02, D01. B03 was not independently re-fetched.
- B06 pages did not load; only search-result summaries were seen. Not used as primary evidence.
- No independent test of the Higgsfield “editable After Effects project” claim (D01) was found.
- `docs.blender.org` returned HTTP 403; no Blender API excerpt recorded.
