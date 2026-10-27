# Animated landing sites — source records

Retrieved 2026-10-11 (captures timestamped 2026-10-11T23:4x–23:5xZ). Capture scope: source metadata and short attributed excerpts only, not full captures. Live pages are unpinned and may change after retrieval. Findings IDs refer to the [evidence deliverable](../../2026-10-11-animated-landing-sites.md).

Retrieval methods: static pages via `curl` with a desktop Chrome user agent, converted to text locally and searched for the quoted strings; JavaScript-rendered pages via headless Chrome (`playwright-core` already present in the repository's `node_modules`, Chrome channel, fresh context, 1440×900 viewport, `networkidle` + 4–7 s wait, `document.body.innerText`); GitHub metadata via `gh api repos/<owner>/<repo>`; package metadata via `registry.npmjs.org/<pkg>/latest`; shadcn registry items via each registry's public `{name}.json` endpoint; browser support via `mdn/browser-compat-data` `main` (commit `3b28abed32`, 2026-10-09) and `Fyrd/caniuse` `main` (data `updated` 2026-10-06T00:07:42Z).

## Component and animation collections

| ID | Publisher / title / URL | Date | Brief verbatim excerpt or recorded value |
| --- | --- | --- | --- |
| C01 | 21st Labs, [21st.dev home](https://21st.dev/) (meta description, install snippet) | undated | “12,000+ hand-crafted React and Tailwind CSS components, templates, and shadcn themes”; `npx @21st-dev/cli@latest init --client <cursor\|claude\|codex\|vscode\|devin>` |
| C02 | 21st Labs, [Community components index](https://21st.dev/community/components) (rendered) | live | Category counts read from the rendered sidebar: Heroes 1152, Backgrounds 365, Texts 663, Videos 162, Marquees 113, Scroll Areas 293, Shaders “New”, Gradients “New”, Globes 41 |
| C03 | 21st Labs, [Terms](https://21st.dev/terms) | last updated 2026-07-20 | “view and use the content solely through the official 21st.dev platform”; prohibits redistribution “without providing a clear and visible link back” |
| C04 | 21st Labs, registry endpoint `https://21st.dev/r/<author>/<component>` (e.g. [shadcn/accordion](https://21st.dev/r/shadcn/accordion)) | 2026-10-11 | HTTP 403, body `"error":"Authentication required"` for unauthenticated GET |
| C05 | 21st Labs, [Pricing](https://21st.dev/pricing) (rendered) | live | Builder “$6 per month billed yearly”; “Unlimited component installs”; “Copy & install components — Unlimited” in all three paid columns |
| C06 | serafimcloud, [21st README](https://github.com/serafimcloud/21st) (MIT, 5,487 stars, last push 2025-05-28) | 2025-05-28 | `npx shadcn@latest add "https://21st.dev/r/shadcn/accordion"` |
| C07 | 21st.dev, [Scroll-Locked Video Hero](https://21st.dev/@gughigug/components/scroll-locked-video-hero) (rendered) | published 2026-08-24 | Page shows “License MIT License” and tabs “Copy prompt … CLI” |
| A01 | Aceternity Labs, [Licence](https://ui.aceternity.com/licence) | undated (© 2026) | “You can create unlimited end products for yourself or your clients.”; “You cannot re-distribute the Item as a stock image or its source files” |
| A02 | Aceternity, [Hero Parallax](https://ui.aceternity.com/components/hero-parallax) (rendered) | live | `npx shadcn@latest add @aceternity/hero-parallax` |
| A03 | Aceternity registry JSON `https://ui.aceternity.com/registry/<name>.json` | 2026-10-11 | `dependencies`: hero-parallax, background-beams, container-scroll-animation, text-generate-effect → `["motion"]`; macbook-scroll → `["@tabler/icons-react","motion"]`; 3d-globe → `["three","@react-three/fiber","@react-three/drei"]`; aurora-background, spotlight-new, cloud-shader → none listed |
| A04 | Aceternity, [components index](https://ui.aceternity.com/components) (rendered link list) | live | Component names listed in F05 |
| M01 | Magic UI, [magicuidesign/magicui](https://github.com/magicuidesign/magicui) — [LICENSE.md](https://github.com/magicuidesign/magicui/blob/main/LICENSE.md) MIT; 22,600 stars | push 2026-10-11 | “Animated components and effects you can copy and paste into your apps.” |
| M02 | Magic UI, [Installation](https://magicui.design/docs/installation) | live | “We have the exact same installation process as shadcn/ui”; `pnpm dlx shadcn@latest add @magicui/globe` |
| M03 | Magic UI registry `https://magicui.design/r/<name>.json`; [apps/www/package.json](https://github.com/magicuidesign/magicui/blob/main/apps/www/package.json) | 2026-10-11 | hero-video-dialog → `["motion"]`; globe → `["cobe@^0.6.4","motion"]`; text-reveal → `["motion"]`; video-text → none; site uses `tailwindcss ^4.1.13`, `motion ^12.23.12` |
| R01 | David Haz, [react-bits LICENSE.md](https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md) (48,933 stars; GitHub SPDX `NOASSERTION`) | push 2026-10-11 | “MIT + Commons Clause License Condition v1.0”; “so long as you do not sell, sublicense, or redistribute the components themselves” |
| R02 | react-bits [README](https://github.com/DavidHDev/react-bits) | main | “200+ components”; “4 variants per component — JS-CSS, JS-TW, TS-CSS, TS-TW”; `npx shadcn@latest add @react-bits/BlurText-TS-TW` |
| R03 | React Bits registry `https://reactbits.dev/r/<Name>-TS-TW.json` | 2026-10-11 | SplitText → `gsap@^3.13.0, @gsap/react@^2.1.2`; ScrollReveal → `gsap@^3.13.0`; LiquidEther, Hyperspeed → `three@^0.180.0`; Silk, Aurora, LogoLoop → `[]` |
| R04 | react-bits repository tree `src/ts-tailwind/<Category>/<Name>` | main, 2026-10-11 | Category folders: Animations, Backgrounds, Components, Micro, TextAnimations |
| P01 | ibelick, [motion-primitives](https://github.com/ibelick/motion-primitives) README; [LICENCE.md](https://github.com/ibelick/motion-primitives/blob/main/LICENCE.md) MIT; 6,531 stars | push 2026-09-28 | “built with motion and Tailwind CSS”; “This project is in beta.” |
| P02 | motion-primitives registry `https://motion-primitives.com/c/<name>.json`; repo package.json | 2026-10-11 | text-effect, spotlight, scroll-progress, in-view → `["motion"]`; infinite-slider → `["motion","react-use-measure"]`; repo `tailwindcss ^4.0.0` |
| S01 | shadcn, [Registry docs](https://ui.shadcn.com/docs/registry) | live | “Running your own registry allows you to distribute your custom components” |
| S02 | shadcn, [Registry Directory](https://ui.shadcn.com/docs/directory) and its data file [registries.json](https://ui.shadcn.com/r/registries.json) | checked 2026-10-11T23:27:59Z | 435 entries; `npx shadcn add @<registry>/<component>`; “Community registries are maintained by third-party developers.” Item counts/health: @react-bits 864 healthy, @magicui 250 healthy, @aceternity 294 degraded, @motion-primitives 33 healthy; no `@21st` entry found |

## Animation engines and rendering options

| ID | Publisher / title / URL | Date | Brief verbatim excerpt or recorded value |
| --- | --- | --- | --- |
| E01 | npm, [motion](https://www.npmjs.com/package/motion) latest; [motiondivision/motion](https://github.com/motiondivision/motion) MIT | 2026-10-11 | `motion` 14.1.0, licence MIT; `framer-motion` latest also 14.1.0 |
| E02 | Motion, [Upgrade guide](https://motion.dev/docs/react-upgrade-guide) | live | “uninstall framer-motion and install motion”; “There are no breaking changes in Motion for React in version 14.” |
| E03 | Motion, [Scroll animations](https://motion.dev/docs/react-scroll-animations) | live | “runs scroll-linked animations on the browser's native ScrollTimeline where possible”; “pooled IntersectionObserver” |
| E04 | Motion, [Layout animations](https://motion.dev/docs/react-layout-animations) | live | “Motion (previously Framer Motion)”; “performs all layout animations using the CSS transform property” |
| E05 | Motion, [Accessibility](https://motion.dev/docs/react-accessibility) | live | `reducedMotion` “user” makes components “automatically disable transform and layout animations” |
| G01 | Webflow (Rachel Wolan), [Webflow makes GSAP 100% free](https://webflow.com/blog/gsap-becomes-free) | published 2025-04-30; last updated 2026-06-16 | “in the fall of 2024, Webflow acquired”; “including the previously paid Club plugins” |
| G02 | Webflow, [GSAP Standard License](https://gsap.com/standard-license/) | effective 2025-04-30; modified 2025-05-30 | “Permitted Uses” covers use “on any website, web application, or digital interface”; “Prohibited Uses” covers no-code visual animation builders that compete with Webflow |
| G03 | GreenSock, [GSAP README](https://github.com/greensock/GSAP); npm `gsap` 3.15.0 | main | “the entire GSAP toolset is FREE, even for commercial use”; npm licence field “Standard 'no charge' license” |
| G04 | GSAP, [ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/) | live | “Scrub, pin, snap, or just trigger anything scroll-related” |
| G05 | GSAP, [SplitText](https://gsap.com/docs/v3/Plugins/SplitText/) | live | “automatic screen reader accessibility, masking for reveal effects, responsive re-splitting”; v3.13 rewrite “half the size, 14 new features” |
| G06 | GSAP, [React resources](https://gsap.com/resources/React/); npm `@gsap/react` 2.1.2 | live | `useGSAP()` hook from `@gsap/react`; peer `gsap ^3.12.5`, `react >=17` |
| G07 | GSAP, [gsap.matchMedia()](https://gsap.com/docs/v3/GSAP/gsap.matchMedia()/) | live | example condition `"(prefers-reduced-motion: reduce)"` |
| W01 | MDN, [animation-timeline](https://developer.mozilla.org/en-US/docs/Web/CSS/animation-timeline) | live | “This feature is not Baseline because it does not work in some of the most widely-used browsers.” |
| W02 | MDN [browser-compat-data](https://github.com/mdn/browser-compat-data) `css/properties/animation-timeline.json`, `api/Document.json`, `css/at-rules/view-transition.json`, `css/at-rules/media.json` | commit 3b28abed32, 2026-10-09 | animation-timeline: Chrome 115, Safari 26, Firefox “preview”; `startViewTransition`: Chrome 111, Safari 18, Firefox 144; `@view-transition`: Chrome 126, Safari 18.2, Firefox none; `prefers-reduced-motion`: Chrome 74, Firefox 63, Safari 10.1 |
| W03 | MDN, [View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API) | live | “Starts a new same-document (SPA) view transition” |
| W04 | caniuse, [view-transitions](https://caniuse.com/view-transitions), [cross-document-view-transitions](https://caniuse.com/cross-document-view-transitions), [prefers-reduced-motion](https://caniuse.com/prefers-reduced-motion) (raw JSON from `Fyrd/caniuse`) | data updated 2026-10-06 | global full support 91.75 %, 85.97 % (+1.81 % partial), 96.45 % |
| L01 | darkroom.engineering, [Lenis README](https://github.com/darkroomengineering/lenis) (MIT; npm `lenis` 1.3.26) | push 2026-10-02 | “Runs on native scroll”; `respectReducedMotion` default `true`; limitations: “capped to 60fps on Safari … and 30fps on low power mode” |
| X01 | Paper, [paper-design/shaders](https://github.com/paper-design/shaders) README; [LICENSE](https://github.com/paper-design/shaders/blob/main/LICENSE) Apache-2.0; npm `@paper-design/shaders-react` 0.0.81 | push 2026-10-11 | “Zero-dependency HTML canvas shaders”; “Please pin your dependency – we will ship breaking changes under 0.0.x versioning” |
| X02 | Paper, [shaders.paper.design](https://shaders.paper.design/) (rendered) | live | Shader list in F21 |
| X03 | UNCRN LLC, [Unicorn Studio Terms](https://www.unicorn.studio/terms) (rendered) | effective 2026-10-01 | Free plan: “non-commercial, personal projects only”; “A watermark will be included on all exported content”; Legend: “You may use Unicorn Studio for commercial purposes” |
| X04 | UNCRN LLC, [unicorn.studio](https://www.unicorn.studio/) pricing block (rendered; `/pricing` redirects to login) | live | “49kb”; Free “$0/mo … Up to 8 publishes (with logo)”; Legend “$14/mo Billed yearly or $20 billed monthly … Commercial license” |
| X05 | hiunicornstudio, [unicornstudio.js README](https://github.com/hiunicornstudio/unicornstudio.js) (no licence file in repo; npm `unicornstudio-react` 2.4.0 lists MIT) | push 2026-10-11 | embed via `data-us-project` or self-hosted JSON via `data-us-project-src` |
| X06 | mrdoob, [three.js](https://github.com/mrdoob/three.js) MIT; npm `three` 0.186.1 | 2026-10-11 | licence MIT |
| X07 | pmndrs, [react-three-fiber docs](https://r3f.docs.pmnd.rs/getting-started/introduction); npm `@react-three/fiber` 9.8.1 MIT | live | “React-three-fiber is a React renderer for three.js.”; peer deps `react >=19 <19.4`, `three >=0.156` |

## Performance and accessibility

| ID | Publisher / title / URL | Date | Brief verbatim excerpt |
| --- | --- | --- | --- |
| Q01 | MDN, [prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) | live | “minimize the amount of non-essential motion”; “scaling or panning large objects can be vestibular motion triggers” |
| Q02 | web.dev, [Largest Contentful Paint](https://web.dev/articles/lcp) | updated 2025-09-04 | “A good LCP value is 2.5 seconds or less.”; for `<video>`, “the poster image load time or first frame presentation time” |
| Q03 | web.dev, [Optimize LCP](https://web.dev/articles/optimize-lcp) | live | “your LCP resource should be discoverable from the HTML source” |
| Q04 | web.dev, [Cumulative Layout Shift](https://web.dev/articles/cls) | updated 2023-04-12 | “Good CLS values are 0.1 or less.”; causes include “images or videos with unknown dimensions” |
| Q05 | web.dev, [Optimize CLS](https://web.dev/articles/optimize-cls) | updated 2025-02-07 | “Composited animations using translate can't impact other elements, and so don't count toward CLS.” |
| Q06 | web.dev, [Replace animated GIFs with video](https://web.dev/articles/replace-gifs-with-videos) | updated 2018-11-05 | `<video autoplay loop muted playsinline>` |
| Q07 | Chrome for Developers, [Autoplay policy in Chrome](https://developer.chrome.com/blog/autoplay) | updated 2017-09-13 | “Muted autoplay is always allowed.” |
| Q08 | WebKit, [New video policies for iOS](https://webkit.org/blog/6784/new-video-policies-for-ios/) | 2016-07-25 | “`<video muted>` elements will also be allowed to autoplay without a user gesture.”; autoplay begins “only … when visible on-screen” |
| Q09 | MDN, [Autoplay guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay) | live | media whose audio track is muted is not subject to autoplay blocking |
| Q10 | W3C, [Understanding SC 2.2.2 Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html) | WCAG 2.2 | moving content that “lasts more than five seconds” needs “a mechanism for the user to pause” |
| Q11 | W3C, [Understanding SC 2.3.3 Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) | WCAG 2.2 (AAA) | “Motion animation triggered by interaction can be disabled, unless the animation is essential” |
| Q12 | Vercel, Next.js 16.4.0 bundled docs `site/node_modules/next/dist/docs/01-app/02-guides/videos.md` (local; web equivalent [nextjs.org/docs/app/guides/videos](https://nextjs.org/docs/app/guides/videos)) | next 16.4.0 | “include the `muted` attribute … and the `playsInline` attribute for compatibility with iOS devices”; “A video without dimensions collapses and then pushes the rest of the page down” |

## Reference landing pages (headless Chrome, 1440×900, cookie banners declined)

Each row: requested URL → final URL, capture time (UTC), and the screenshots taken. The screenshots are third-party pages, so they stay in the researcher's local copy and are not committed. `-scrolled.png` was taken after one 1,200 px wheel scroll and 2.5 s wait. Element data come from `document.querySelectorAll` (including open shadow roots) at capture time.

| ID | Requested → final URL | Captured | Screenshots |
| --- | --- | --- | --- |
| L-RW | https://runwayml.com/ → https://runway.com/ | 2026-10-11T23:51:07Z | `runway.png` (local), `runway-scrolled.png` (local) |
| L-DE | https://www.descript.com/ | 2026-10-11T23:51:06Z | `descript.png` (local), `descript-scrolled.png` (local) |
| L-CC | https://www.capcut.com/ | 2026-10-11T23:51:45Z | `capcut.png` (local), `capcut-scrolled.png` (local) |
| L-PK | https://pika.art/ | 2026-10-11T23:51:02Z | `pika.png` (local), `pika-scrolled.png` (local) |
| L-LU | https://lumalabs.ai/ (an earlier request to https://lumalabs.ai/dream-machine redirected to https://lumalabs.ai/app) | 2026-10-11T23:51:07Z | `luma.png` (local), `luma-scrolled.png` (local) |
| L-LI | https://linear.app/ | 2026-10-11T23:51:03Z | `linear.png` (local), `linear-scrolled.png` (local) |
| L-FR | https://www.framer.com/ | 2026-10-11T23:51:11Z | `framer.png` (local), `framer-scrolled.png` (local) |
| L-RI | https://rive.app/ | 2026-10-11T23:51:05Z | `rive.png` (local), `rive-scrolled.png` (local) |

## Unresolved retrievals

- The Claude Browser pane (`mcp__Claude_Browser__*`) returned “Policy check temporarily unavailable” on three consecutive attempts; headless Chrome via `playwright-core` was used instead.
- `https://ui.aceternity.com/docs/installation` returned HTTP 404 to WebFetch; the per-component install command (A02) and registry JSON (A03) were used instead.
- `https://www.unicorn.studio/pricing` redirects to a login page; prices were read from the home-page pricing block (X04).
- Two headless captures (CapCut, Framer) hung after the screenshots were written in the second pass and were terminated; their screenshots and element data were saved before the hang.
- 21st.dev per-component install commands were not visible without signing in; the registry endpoint returned 403 (C04). No account was created.
