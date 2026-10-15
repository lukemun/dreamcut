# Animation libraries, component collections and motion-heavy landing pages — sourced findings

What component collections, animation engines, browser-standard documentation and eight live landing pages of video and creative tools show, as of 2026-10-11. Interpretation lives in a separate application note.

| | |
|---|---|
| **Method** | Direct retrieval of vendor pages, licence files, package registries and shadcn registry JSON; MDN browser-compat-data and caniuse raw data; headless-Chrome capture of eight landing pages with screenshots. Details in [Method, caveats & sources](#method-caveats--sources) and the [source records](raw/2026-10-11-animated-landing-sites/sources.md) |
| **Date** | 2026-10-11 |
| **Sourcing standard** | [research-deliverable skill](../../.agents/skills/research-deliverable/SKILL.md) — every claim cited; nothing unsourced |

## How to read this

Every factual claim links to its source; bracketed IDs refer to rows in the [source records](raw/2026-10-11-animated-landing-sites/sources.md). Quotations are short excerpts. Version numbers, counts and stars were read on the retrieval date and will drift. Landing-page sections report only what was observed in the capture.

## 1. Component and animation collections

### 21st.dev

**F01.** 21st.dev describes itself as “12,000+ hand-crafted React and Tailwind CSS components, templates, and shadcn themes.” Its home page gives an agent-setup command, `npx @21st-dev/cli@latest init --client <cursor|claude|codex|vscode|devin>`. [C01](https://21st.dev/)

**F02.** The rendered component index lists marketing-block categories with counts, including Heroes 1152, Texts 663, Backgrounds 365, Scroll Areas 293, Videos 162, Marquees 113 and Globes 41; Shaders and Gradients are marked “New”. Popular items shown include “Scroll media expansion hero”, “Container Scroll Animation” and “Spline Scene”; the Heroes row includes “Scroll Locked Video Hero” and “Hero Scroll Video Pin Reveal”. [C02](https://21st.dev/community/components)

**F03.** Components are published by individual authors; the example page “Scroll-Locked Video Hero” displays “License MIT License” and a CLI tab. [C07](https://21st.dev/@gughigug/components/scroll-locked-video-hero). The open-source repository's README (last push 2025-05-28) documents installation through the shadcn CLI, e.g. `npx shadcn@latest add "https://21st.dev/r/shadcn/accordion"`. [C06](https://github.com/serafimcloud/21st)

**F04.** On 2026-10-11 an unauthenticated GET to that registry URL returned HTTP 403 with `"error":"Authentication required"`. [C04](https://21st.dev/r/shadcn/accordion). The pricing page lists paid plans from “$6 per month billed yearly” with “Unlimited component installs”. [C05](https://21st.dev/pricing). The shadcn registry directory data contains no `@21st` entry. [S02](https://ui.shadcn.com/r/registries.json)

**F05.** 21st.dev's Terms (last updated 2026-07-20) say users may “view and use the content solely through the official 21st.dev platform,” prohibit copying components elsewhere without “a clear and visible link back” to the component page, and state that author code “remains separately owned or licensed by that author.” [C03](https://21st.dev/terms)

### Aceternity UI

**F06.** Aceternity installs through the shadcn CLI with a namespace, e.g. `npx shadcn@latest add @aceternity/hero-parallax`. [A02](https://ui.aceternity.com/components/hero-parallax). Its registry JSON lists `motion` as the dependency of hero-parallax, background-beams, container-scroll-animation and text-generate-effect; 3d-globe lists `three`, `@react-three/fiber` and `@react-three/drei`; aurora-background, spotlight-new and cloud-shader list none. [A03](https://ui.aceternity.com/registry/hero-parallax.json)

**F07.** Components listed on the index include Hero Parallax, Container Scroll Animation, Macbook Scroll, Sticky Scroll Reveal, Parallax Scroll, Spotlight, Spotlight New, Aurora Background, Background Beams, Wavy Background, Background Gradient Animation, Cloud Shader, Noise Background, Text Generate Effect, Encrypted Text, Layout Text Flip, Text Flipping Board, 3D Card Effect and 3D Globe; block categories include Hero Sections, Shaders, Backgrounds and Text Animations. [A04](https://ui.aceternity.com/components)

**F08.** The Aceternity licence allows “unlimited end products for yourself or your clients” and forbids redistributing “the Item as a stock image or its source files” or selling items or derivatives “on any marketplace.” The page shows no effective date. [A01](https://ui.aceternity.com/licence)

**F09.** The shadcn registry directory records `@aceternity` with 294 items and health status “degraded” (“Sampled registry items are failing validation”) at its 2026-10-11 check. [S02](https://ui.shadcn.com/r/registries.json)

### Magic UI

**F10.** Magic UI is MIT-licensed [M01](https://github.com/magicuidesign/magicui/blob/main/LICENSE.md) and states it has “the exact same installation process as shadcn/ui,” e.g. `pnpm dlx shadcn@latest add @magicui/globe`. [M02](https://magicui.design/docs/installation)

**F11.** Registry files include hero-video-dialog, video-text, text-reveal, text-animate, marquee, scroll-based-velocity, scroll-progress, light-rays, warp-background, retro-grid, flickering-grid, globe, safari, iphone, border-beam and progressive-blur. [M01](https://github.com/magicuidesign/magicui/tree/main/apps/www/registry/magicui). hero-video-dialog and text-reveal depend on `motion`; globe depends on `cobe@^0.6.4` and `motion`; video-text lists none. The project's own site uses `tailwindcss ^4.1.13` and `motion ^12.23.12`. [M03](https://magicui.design/r/hero-video-dialog.json)

### React Bits

**F12.** React Bits' licence is “MIT + Commons Clause License Condition v1.0”: use is permitted, including commercially, “so long as you do not sell, sublicense, or redistribute the components themselves.” GitHub reports the SPDX identifier as `NOASSERTION`. [R01](https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md)

**F13.** The README claims “200+ components” in “4 variants per component — JS-CSS, JS-TW, TS-CSS, TS-TW” and installs through shadcn or jsrepo, e.g. `npx shadcn@latest add @react-bits/BlurText-TS-TW`. [R02](https://github.com/DavidHDev/react-bits). The shadcn directory records `@react-bits` with 864 registry items, status healthy. [S02](https://ui.shadcn.com/r/registries.json)

**F14.** Source folders include TextAnimations (e.g. SplitText, ScrollReveal, ScrollFloat, ScrollVelocity, BlurText, DecryptedText, ShinyText, TextPressure, VariableProximity), Backgrounds (e.g. Aurora, Silk, LiquidEther, Hyperspeed, Iridescence, LightRays, Plasma, Threads, Dither, Grainient), Animations (e.g. LogoLoop, ScrollExpand, GradualBlur, PixelTransition) and Components (e.g. ScrollStack, CircularGallery, MagicBento). [R04](https://github.com/DavidHDev/react-bits/tree/main/src/ts-tailwind)

**F15.** Dependencies vary per component: SplitText requires `gsap@^3.13.0` and `@gsap/react`; ScrollReveal requires `gsap`; LiquidEther and Hyperspeed require `three@^0.180.0`; Silk, Aurora and LogoLoop list no dependencies. [R03](https://reactbits.dev/r/SplitText-TS-TW.json)

### motion-primitives

**F16.** motion-primitives is MIT-licensed, “built with motion and Tailwind CSS,” and states “This project is in beta.” [P01](https://github.com/ibelick/motion-primitives). Its 33 registry items [S02](https://ui.shadcn.com/r/registries.json) include text-effect, text-scramble, text-shimmer, text-morph, infinite-slider, spotlight, scroll-progress, in-view, border-trail, glow-effect, image-comparison, morphing-dialog, transition-panel and tilt; sampled items depend on `motion` (infinite-slider also on `react-use-measure`); the repository uses `tailwindcss ^4.0.0`. [P02](https://motion-primitives.com/c/text-effect.json)

### shadcn registry ecosystem

**F17.** The shadcn CLI can run third-party registries: “Running your own registry allows you to distribute your custom components.” [S01](https://ui.shadcn.com/docs/registry). Directory registries install with `npx shadcn add @<registry>/<component>`, and the page warns that “Community registries are maintained by third-party developers.” The directory data listed 435 registries with per-registry health scores at retrieval. [S02](https://ui.shadcn.com/docs/directory)

## 2. Animation engines and rendering options

### Motion (formerly Framer Motion)

**F18.** The React package is `motion`, imported from `"motion/react"`; the upgrade guide says to “uninstall framer-motion and install motion.” Version 14 has “no breaking changes” for React. [E02](https://motion.dev/docs/react-upgrade-guide). Latest npm release is 14.1.0, MIT. [E01](https://www.npmjs.com/package/motion)

**F19.** Motion distinguishes scroll-triggered (`whileInView`) and scroll-linked (`useScroll`) animation and says it “runs scroll-linked animations on the browser's native ScrollTimeline where possible.” [E03](https://motion.dev/docs/react-scroll-animations). Layout animation uses the `layout` and `layoutId` props and is performed “using the CSS transform property.” [E04](https://motion.dev/docs/react-layout-animations). `MotionConfig reducedMotion="user"` automatically disables transform and layout animations for users with Reduced Motion. [E05](https://motion.dev/docs/react-accessibility)

### GSAP

**F20.** Webflow announced on 2025-04-30 that GSAP is “100% free,” “including the previously paid Club plugins,” and that the standard licence was expanded to commercial use; it says Webflow acquired GSAP “in the fall of 2024.” [G01](https://webflow.com/blog/gsap-becomes-free)

**F21.** The current GSAP Standard License (effective 2025-04-30, modified 2025-05-30) permits use “on any website, web application, or digital interface,” and prohibits use in no-code visual animation tools that compete with Webflow's animation builder. [G02](https://gsap.com/standard-license/). npm `gsap` 3.15.0 declares “Standard 'no charge' license.” [G03](https://github.com/greensock/GSAP)

**F22.** ScrollTrigger can “Scrub, pin, snap, or just trigger anything scroll-related.” [G04](https://gsap.com/docs/v3/Plugins/ScrollTrigger/). SplitText splits text into characters, words and lines, with “automatic screen reader accessibility, masking for reveal effects, responsive re-splitting”; the v3.13 rewrite is described as “half the size, 14 new features.” [G05](https://gsap.com/docs/v3/Plugins/SplitText/). React integration is the `useGSAP()` hook in `@gsap/react`. [G06](https://gsap.com/resources/React/). `gsap.matchMedia()` documents a `(prefers-reduced-motion: reduce)` condition. [G07](https://gsap.com/docs/v3/GSAP/gsap.matchMedia()/)

### Native CSS scroll-driven animations and View Transitions

**F23.** MDN marks `animation-timeline` “not Baseline because it does not work in some of the most widely-used browsers.” [W01](https://developer.mozilla.org/en-US/docs/Web/CSS/animation-timeline). Browser-compat-data records support from Chrome 115 and Safari 26, with Firefox at “preview.” [W02](https://github.com/mdn/browser-compat-data/blob/main/css/properties/animation-timeline.json)

**F24.** Same-document `document.startViewTransition()` is recorded from Chrome 111, Safari 18 and Firefox 144; the cross-document `@view-transition` rule from Chrome 126 and Safari 18.2, with no Firefox support. [W02](https://github.com/mdn/browser-compat-data/blob/main/api/Document.json). caniuse global full-support figures: same-document View Transitions 91.75 %, cross-document 85.97 % (+1.81 % partial). [W04](https://caniuse.com/view-transitions). MDN: [View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API) [W03].

### Lenis

**F25.** Lenis (MIT, npm 1.3.26) “Runs on native scroll,” lists GSAP ScrollTrigger synchronisation, and has `respectReducedMotion` defaulting to `true`. Listed limitations include no CSS scroll-snap support (a separate snap package is provided), “capped to 60fps on Safari … and 30fps on low power mode,” and no smoothing over iframes. [L01](https://github.com/darkroomengineering/lenis)

### WebGL and shader options

**F26.** Paper Shaders (`@paper-design/shaders-react`, 0.0.81) is Apache-2.0, describes itself as “Zero-dependency HTML canvas shaders,” and asks users to pin versions because breaking changes ship “under 0.0.x versioning.” [X01](https://github.com/paper-design/shaders). Shaders listed on its site include mesh gradient, grain gradient, dithering, liquid metal, god rays, smoke ring, waves, metaballs, pulsing border, halftone dots, fluted glass and logo animations. [X02](https://shaders.paper.design/)

**F27.** Unicorn Studio's Terms (effective 2026-10-01) restrict the Free plan to “non-commercial, personal projects only” with a watermark on exported content; the “Legend” plan permits commercial use and watermark removal. [X03](https://www.unicorn.studio/terms). Its home page lists Legend at “$14/mo Billed yearly or $20 billed monthly” and the runtime as “49kb.” [X04](https://www.unicorn.studio/). The embed runtime loads published scenes by ID or self-hosted JSON. [X05](https://github.com/hiunicornstudio/unicornstudio.js)

**F28.** three.js is MIT (npm 0.186.1). [X06](https://github.com/mrdoob/three.js). react-three-fiber (MIT, npm 9.8.1) is “a React renderer for three.js”; its peer dependencies are `react >=19 <19.4` and `three >=0.156`. [X07](https://r3f.docs.pmnd.rs/getting-started/introduction)

## 3. Reference landing pages (observed 2026-10-11, 1440×900, cookie banners declined)

Screenshots are in [raw/2026-10-11-animated-landing-sites/](raw/2026-10-11-animated-landing-sites/sources.md#reference-landing-pages-headless-chrome-14409000-cookie-banners-declined). “Video element” facts come from the DOM at capture; motion between frames was not recorded.

| Site | Hero treatment observed | Type observed | Theme observed | Other observations |
| --- | --- | --- | --- | --- |
| **Runway** ([runwayml.com → runway.com](https://runway.com/)) [L-RW] | Full-width rounded panel (1400×600) with a muted, looping `<video>` from a `blob:` source showing landscape footage; headline and paragraph overlaid bottom-left; promo bar above nav | h1 “Building Real-World Intelligence”, `abcNormal` 40 px / 400, white | White page, dark video panel | Logo strip below hero; screenshot: [runway.png](raw/2026-10-11-animated-landing-sites/runway.png) |
| **Descript** ([descript.com](https://www.descript.com/)) [L-DE] | Centered headline “AI-editing for every kind of video” over a dark plum background; below it a 1312×725 autoplay, muted, looping transparent WebM (`home-hero-transparent.webm`, with poster) of a product window with a chat panel; smaller muted looping clips arranged at the sides | Eyebrow h1 “AI VIDEO EDITOR” in `brett` 18 px, red; large serif headline | Dark plum hero; page body colour `rgb(255,247,250)` | Logo marquee and testimonial cards after scroll; [descript.png](raw/2026-10-11-animated-landing-sites/descript.png) |
| **CapCut** ([capcut.com](https://www.capcut.com/)) [L-CC] | Centered headline with “Photo & Video” in cyan; soft blue/violet gradient glow background; a 1440×900 autoplay/muted/playsinline `<video>` element at the top of the page; a product card and a list of feature labels at differing opacity below | h1 `Inter SemiBold` 72 px / 600 | Light | 16 `<video>` elements on the page, most 528×286, autoplay + muted + loop + playsinline with posters; [capcut.png](raw/2026-10-11-animated-landing-sites/capcut.png) |
| **Pika** ([pika.art](https://pika.art/)) [L-PK] | Full-bleed autoplay, muted, looping video (1432×1214, no poster) of a portrait; uppercase headline overlaid bottom-left; floating pill nav | Extended uppercase display face (`Telka Extended`) | Warm off-white page `rgb(250,248,244)` | Lenis class present on the document; scrolled view shows a section “AN APP FOR EXTENDING FOOTAGE”; [pika.png](raw/2026-10-11-animated-landing-sites/pika.png) |
| **Luma** ([lumalabs.ai](https://lumalabs.ai/)) [L-LU] | Full-viewport (1440×900) muted, looping video behind a centered headline “Luma is your creative partner”, dimmed; a prompt box below the hero | `graphik` 52 px / 500, white | Dark hero over white page | `/dream-machine` redirected to `/app`; scrolled view: large black-on-white mission statement and logo strip; [luma.png](raw/2026-10-11-animated-landing-sites/luma.png) |
| **Linear** ([linear.app](https://linear.app/)) [L-LI] | Left-aligned headline over near-black; below it a product UI composition (issue view and agent panel); no `<video>` or `<canvas>` in the DOM | `Inter Variable` 64 px / 510, letter-spacing −1.408 px | Dark `rgb(8,9,10)` | Scrolled view: logo row, large two-tone statement, line-art “FIG 0.1–0.3” illustrations; [linear.png](raw/2026-10-11-animated-landing-sites/linear.png) |
| **Framer** ([framer.com](https://www.framer.com/)) [L-FR] | Left-aligned headline and two buttons; below, a 1200×673 autoplay/muted/loop/playsinline MP4 with poster showing the product with an agent panel | `GT Walsheim Medium` 54 px / 500, white | Black | Further muted videos later in the page; [framer.png](raw/2026-10-11-animated-landing-sites/framer.png) |
| **Rive** ([rive.app](https://rive.app/)) [L-RI] | Left column of vertically stacked looping muted MP4 tiles labelled by use case (Game UI, Mobile Apps, Film + TV, …); right column headline and a CLI install block | `Orbitron` 40 px / 900, uppercase | Black | Two `<canvas>` elements on the page; [rive.png](raw/2026-10-11-animated-landing-sites/rive.png) |

**F29.** None of the eight pages exposed `window.gsap`, `window.THREE` or a Unicorn Studio embed at capture; only Pika carried a Lenis marker. This reflects global detection only and does not exclude bundled, non-global use. [L-* records](raw/2026-10-11-animated-landing-sites/sources.md#reference-landing-pages-headless-chrome-14409000-cookie-banners-declined)

## 4. Performance and accessibility constraints

**F30.** `prefers-reduced-motion` detects a device setting “to minimize the amount of non-essential motion”; MDN notes “scaling or panning large objects can be vestibular motion triggers.” [Q01](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion). It has 96.45 % global support on caniuse. [W04](https://caniuse.com/prefers-reduced-motion)

**F31.** “A good LCP value is 2.5 seconds or less” at the 75th percentile; for `<video>` the LCP time is “the poster image load time or first frame presentation time,” whichever is earlier. [Q02](https://web.dev/articles/lcp). The LCP resource “should be discoverable from the HTML source.” [Q03](https://web.dev/articles/optimize-lcp)

**F32.** “Good CLS values are 0.1 or less”; causes include “images or videos with unknown dimensions.” [Q04](https://web.dev/articles/cls). “Composited animations using translate can't impact other elements, and so don't count toward CLS.” [Q05](https://web.dev/articles/optimize-cls)

**F33.** Chrome: “Muted autoplay is always allowed.” [Q07](https://developer.chrome.com/blog/autoplay). WebKit on iOS: “`<video muted>` elements will also be allowed to autoplay without a user gesture,” and autoplay videos begin playing only when visible on-screen; `playsinline` is needed for inline playback. [Q08](https://webkit.org/blog/6784/new-video-policies-for-ios/). MDN: media with no audio track or a muted track is not subject to autoplay blocking. [Q09](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay). web.dev's GIF-replacement pattern is `<video autoplay loop muted playsinline>`. [Q06](https://web.dev/articles/replace-gifs-with-videos)

**F34.** WCAG 2.2 SC 2.2.2 (Level A) requires a pause, stop or hide mechanism for moving content that starts automatically and “lasts more than five seconds” alongside other content. [Q10](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html). SC 2.3.3 (AAA) requires that interaction-triggered motion “can be disabled, unless the animation is essential.” [Q11](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)

**F35.** The Next.js 16.4.0 video guide says autoplay needs `muted` and `playsInline` (“for compatibility with iOS devices”), recommends `width`/`height` or CSS `aspect-ratio` because “A video without dimensions collapses and then pushes the rest of the page down,” recommends `poster` especially with `preload="none"`, and recommends `<track>` captions and standard controls. It lists next-video, Cloudinary, Mux, Fastly, ImageKit and Vercel Blob as hosting options. [Q12](https://nextjs.org/docs/app/guides/videos) (read from the repository's bundled `site/node_modules/next/dist/docs/01-app/02-guides/videos.md`)

## Method, caveats & sources

- **Method (reproducible).** See the retrieval methods in the [source records](raw/2026-10-11-animated-landing-sites/sources.md). Licence wording was matched against the downloaded page text, not model summaries. Registry dependencies came from each registry's `{name}.json`. Browser support came from `mdn/browser-compat-data` at commit `3b28abed32` and `Fyrd/caniuse` data updated 2026-10-06. Landing pages were captured with headless Chrome at 1440×900, with non-essential cookies declined where a “Deny/Reject” button existed, then a second screenshot after one 1,200 px scroll.
- **Caveats.** The Claude Browser pane was unavailable (policy-check errors), so headless Chrome substituted. Screenshots show single frames; they cannot establish animation timing, scroll choreography or audio. Library detection checked only globals and a Lenis class. Video sizes and attributes are DOM values at capture and differ by viewport. 21st.dev per-component install commands require sign-in and were not retrieved; no account was created. Aceternity's installation page returned 404; Unicorn Studio's pricing page redirected to login (pricing read from the home page). GSAP's license page also contains an older “no charge” paragraph inside an HTML comment that does not render; only the rendered licence was cited. Search-engine results were not used as evidence.
- **Load-bearing primaries.** [21st.dev Terms](https://21st.dev/terms), [Aceternity licence](https://ui.aceternity.com/licence), [React Bits LICENSE](https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md), [GSAP Standard License](https://gsap.com/standard-license/), [Webflow announcement](https://webflow.com/blog/gsap-becomes-free), [Unicorn Studio Terms](https://www.unicorn.studio/terms), [Motion upgrade guide](https://motion.dev/docs/react-upgrade-guide), [web.dev LCP](https://web.dev/articles/lcp), [WCAG 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html).
