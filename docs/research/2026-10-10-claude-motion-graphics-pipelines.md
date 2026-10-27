# How motion graphics made with Claude are produced — sourced findings

What Anthropic, framework vendors, tool vendors and the creators of widely shared posts document about how Claude-made motion graphics are produced: rendered video from code, or editable project files for a professional editor. Interpretation lives outside this file.

| | |
|---|---|
| **Method** | Three parallel web-research passes (viral posts and Anthropic products; code-to-video frameworks; editable-file routes), then direct re-fetch of load-bearing primaries by the author; short excerpts in the [source records](raw/claude-motion-graphics/sources.md) |
| **Date** | 2026-10-10 |
| **Sourcing standard** | [research-deliverable skill](../../.agents/skills/research-deliverable/SKILL.md) — every claim cited; nothing unsourced |

## How to read this

Every factual claim links to its source; bracketed IDs refer to rows in the source records. Rows marked secondary in the records were not confirmed at a primary source. Live pages are unpinned and may change after the retrieval date.

## Anthropic's own products

**F01.** Claude Motion builds an animation “from your prompt as code that animates the text, charts, shapes, and images in it” and “doesn't use a video generation model, so it doesn't create realistic footage or people.” [A01](https://support.claude.com/en/articles/17454997-get-started-with-claude-motion). Anthropic announced it on 2026-10-08. [A02](https://claude.com/resources/articles/dashboards-and-motion)

**F02.** Claude Motion is in beta on Team and Enterprise plans, on by default for Team and off by default for Enterprise. Changes are made by asking Claude or by adjusting the animation “yourself in the editor.” [A01](https://support.claude.com/en/articles/17454997-get-started-with-claude-motion)

**F03.** The only documented export is MP4: “click "Export" and choose MP4.” [A01](https://support.claude.com/en/articles/17454997-get-started-with-claude-motion). The announcement names Adobe, Descript, HeyGen, Higgsfield, invideo, Luma AI and Runway as tools for further work. [A02](https://claude.com/resources/articles/dashboards-and-motion). Neither page names the rendering framework or offers a project-file export.

**F04.** Claude Design's launch announcement lists export “to Canva, PDF, PPTX, or standalone HTML files.” [A03](https://www.anthropic.com/news/claude-design-anthropic-labs)

**F05.** The Opus 5.5 announcement page contains no mention of video, animation or motion graphics. [A04](https://www.anthropic.com/claude-opus-5-5)

## What widely shared posts used

**F06.** The 2026-09-25 post that began the Opus 5.5 motion-graphics wave (2.27M views at retrieval) gives only a prompt and “Opus 5.5 on Max effort”; it names no renderer. [B01](https://x.com/stephanlivera/status/2103315922098470926)

**F07.** In July 2025 Thariq (@trq212) posted that “every video you see below was vibe coded by Claude Code”; Remotion's founder replied, “Oh, the AI is using Remotion.” [B02](https://x.com/JNYBGR/status/1947746161743564974)

**F08.** A repo roundup circulating on 2026-10-08 lists heygen-com/hyperframes, remotion-dev/skills, greensock/GSAP, LottieFiles/motion-design-skill and airbnb/lottie-web among its engines. [B03](https://x.com/N01ennn/status/2108182955671580771) (agent capture; not re-fetched)

**F09.** The community `claude-motion` repo positions itself on top of Remotion: “Remotion skills teach your agent the API. This teaches it taste.” [B04](https://github.com/whaleyxbt/claude-motion)

**F10.** Secondary: an aggregator of Opus 5.5 posts lists Claude Code, Higgsfield MCP, After Effects, Blender, Three.js, WebGPU, Playwright, Remotion, SVG and HTML/Canvas as tools named across posts, and quotes Charlie Hills: “Every frame is code, After Effects never opened.” [B05](https://www.ayautomate.com/resources/claude-opus-5-5-motion-graphics)

**F11.** Secondary, search-summary only: two blogs claim Opus 5.5 defaults to hand-written HTML/canvas with a `seek(t)` function captured by Playwright and encoded by FFmpeg when no framework is named. [B06](raw/claude-motion-graphics/sources.md). Not confirmed at a primary source.

## Code-to-video frameworks

**F12.** Remotion publishes official Agent Skills, installed with `npx skills add remotion-dev/skills`, described as “useful for AI agents like Claude Code, Codex, Kimi Code or Cursor.” [C01](https://www.remotion.dev/docs/ai/skills)

**F13.** Remotion captures frames with Chrome Headless Shell, “ideal for screenshotting (and therefore Remotion),” and its encoding is “Backed by FFmpeg.” [C02](https://www.remotion.dev/docs/miscellaneous/chrome-headless-shell), [C02](https://www.remotion.dev/docs/encoding)

**F14.** Remotion's license is free for individuals and for-profit organizations with “up to 3 employees”; others require a Company License. [C03](https://raw.githubusercontent.com/remotion-dev/remotion/main/LICENSE.md)

**F15.** Remotion states “It is not possible to deterministically export a Remotion project to the OpenTimelineIO format”; it offers an agent skill that recreates an `.otio` timeline for DaVinci Resolve or Premiere Pro, prerendering elements OTIO cannot represent. [C04](https://www.remotion.dev/docs/export-opentimeline)

**F16.** HyperFrames (HeyGen, Apache-2.0): “The renderer seeks each frame in headless Chrome and encodes the result with FFmpeg”; its README says of HyperFrames and Remotion, “Both tools render video with headless Chrome and FFmpeg.” [C05](https://github.com/heygen-com/hyperframes). It ships a Claude Code plugin and a Claude connector that “turns HTML code into videos.” [C05](https://github.com/heygen-com/hyperframes), [C06](https://claude.com/connectors/hyperframes-heygen)

**F17.** Motion Canvas renders by playing the animation and saving “each frame as an image to `/output`.” [C07](https://motioncanvas.io/docs/rendering). Manim renders with Cairo or OpenGL and writes video through libav (via PyAV since v0.19.0). [C08](https://docs.manim.community/en/stable/guides/deep_dive.html)

**F18.** GSAP is free for commercial use: “Commercial usage is covered under the standard license.” [C09](https://gsap.com/standard-license/)

## Routes to editable project files

**F19.** Higgsfield (2026-09-26) announced that with its MCP server, Opus 5.5 “Builds and animates compositions” and “Renders the final video,” adding: “You get an editable After Effects project to keep working on.” [D01](https://x.com/higgsfield_ai/status/2103839805360820589). No independent test of this claim was found (see caveats).

**F20.** After Effects is scriptable: “After Effects scripts use the Adobe ExtendScript language, which is an extended form of JavaScript.” [D02](https://ae-scripting.docsforadobe.dev/introduction/overview/)

**F21.** Community MCP servers drive a running After Effects “via the Model Context Protocol using ExtendScript”; the most-starred (724) creates compositions, layers, keyframes and expressions. [D03](https://github.com/Dakkshin/after-effects-mcp)

**F22.** The `.aep` project format is undocumented: its “internal file structure … is not available publicly.” [D04](https://docs.fileformat.com/video/aep)

**F23.** Adobe's PSD specification describes timeline data only as an opaque descriptor (“Timeline Information. 4 bytes (descriptor version = 16), Descriptor”). [D05](https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/). The JavaScript PSD library ag-psd states it “Does not support animations.” [D06](https://github.com/Agamnentzar/ag-psd)

**F24.** Lottie is “a JSON-based format for animated vector graphics” with a published v1.0 spec. [D07](https://lottie.github.io/lottie-spec/1.0/). LottieFiles' After Effects plugin imports Lottie JSON into After Effects; “Lottie to AE is in beta period.” [D08](https://releases.lottiefiles.com/log/lottiefiles-for-ae-v4)

**F25.** A Claude Code skill from Diffusion Studio generates Lottie files that can be “imported into After Effects for further refinement.” [D09](https://github.com/diffusionstudio/lottie)

**F26.** DaVinci Resolve Fusion `.setting` and `.comp` files are plain-text Lua tables, per a Blackmagic forum thread (no formal grammar found), and a community MCP server (3,460 stars) edits Fusion node graphs. [D10](https://forum.blackmagicdesign.com/viewtopic.php?p=641749), [D10](https://github.com/samuelgursky/davinci-resolve-mcp)

**F27.** blender-mcp (30,427 stars) “allows running arbitrary Python code in Blender.” [D11](https://github.com/ahujasid/blender-mcp)

**F28.** Rive RML is “a text-based representation of a Rive file”; its CLI compiles to `.riv` or to a `.rev` file that opens in the Rive Editor. [D12](https://rive.app/docs/runtimes/advanced-topic/rml)

**F29.** Apple describes FCPXML as covering “certain, but not all, aspects of projects” and “not a substitute for a native Final Cut Pro project.” [D13](https://developer.apple.com/documentation/professional-video-applications/fcpxml-reference). A community MCP server lets Claude generate FCPXML timelines. [D13](https://github.com/DareDev256/fcpxml-mcp-server)

**F30.** Adobe's Claude connector (2026-04-28) covers Photoshop, Illustrator, Firefly, Express, Premiere, Lightroom, InDesign and Stock; After Effects is not listed. [D14](https://blog.adobe.com/en/publish/2026/04/28/adobe-for-creativity-connector). Adobe's June 2026 release puts its AI Assistant in public beta in Photoshop and Premiere, with After Effects in private beta. [D15](https://news.adobe.com/news/2026/06/adobe-unveils-major-expansion)

## Method, caveats & sources

- **Method.** Three web-research agents ran in parallel on 2026-10-10 with fixed questions (what the posts use; how frameworks render; editable-file routes). The author then re-fetched A01, A02, B01, B02, C04, C05 and D01 directly. GitHub figures come from `gh api repos/<owner>/<repo>` on the same date.
- **Caveats.** `x.com` blocks direct fetch; posts were read through `api.fxtwitter.com`. B03 and B05 were captured only by a research agent; B06 only as search summaries. The Higgsfield After Effects claim (F19) is a vendor announcement with no independent test located. Claude Motion's renderer is undocumented. The Adobe connector's own developer documentation was not found.
- **Absences searched.** No Anthropic product documents a PSD, `.aep`, JSX, FCPXML or Lottie export from a motion feature (searched Claude Motion help, the Claude Design announcement, the Opus 5.5 page). No creator post was found showing Claude writing an `.aep` without a bridge such as Higgsfield or an ExtendScript MCP server. No layered, animated PSD generated by Claude was found.
- **Full source list:** [raw/claude-motion-graphics/sources.md](raw/claude-motion-graphics/sources.md).
