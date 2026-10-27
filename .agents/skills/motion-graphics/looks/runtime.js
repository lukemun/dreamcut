// Shared runtime for motion-graphic looks. Each look file registers itself with
// `DreamcutMotion.register(id, make)`. DreamCut supplies each graphic's looks.js: this runtime,
// kit.js and the one look the graphic uses (src/lib/hyperframes/look-bundle.ts).
// Deterministic: no clocks, no network fonts, no unseeded randomness.
(function () {
  const GRAIN = (opacity) =>
    "url(\"data:image/svg+xml," +
    encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='4' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 " +
        opacity +
        " 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>",
    ) +
    "\")";
  const SMUDGE =
    "url(\"data:image/svg+xml," +
    encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600'><filter id='s'><feTurbulence type='fractalNoise' baseFrequency='0.0125' numOctaves='3' seed='9' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.09 0'/></filter><rect width='100%' height='100%' filter='url(#s)'/></svg>",
    ) +
    "\")";

  const LOOKS = {};

  function hexA(hex, alpha) {
    const n = parseInt(String(hex).slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }

  // Seeded generator for texture passes: the same seed always gives the same sequence.
  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let x = Math.imul(a ^ (a >>> 15), a | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  function register(id, make) {
    LOOKS[id] = make({ grain: GRAIN, smudge: SMUDGE, hexA, rng });
  }

  // Read the look, accent, backdrop and canvas; paint the backdrop and expose CSS variables.
  function setup(c, root) {
    // A palette (Original, Light, Dark, Mono) overrides the look's own tokens; Original is the look as drawn.
    const base = LOOKS[c.look] || LOOKS.paper;
    const look = { ...base, ...((base.palettes && base.palettes[c.palette]) || {}), texture: Math.max(0, Math.min(100, c.texture ?? 100)) / 100 };
    const accent = c.own_accent ? c.accent : look.accent;
    const W = Number(root.dataset.width) || 1920;
    const H = Number(root.dataset.height) || 1080;
    const vars = {
      "--bg": look.bg, "--panel": look.panel, "--ink": look.ink, "--muted": look.muted, "--accent": accent,
      "--on-accent": look.onAccent, "--rule": look.rule, "--track": look.track, "--display": look.display,
      "--display-weight": look.displayWeight, "--display-tracking": look.displayTracking, "--body": look.body,
      "--body-weight": look.bodyWeight, "--figures": look.figures, "--radius": look.radius + "px",
      "--accent-soft": hexA(accent, 0.16),
      "--panel-filter": look.panelFilter || "none", "--panel-edge": look.panelEdge || "transparent",
      "--display-style": look.displayStyle || "normal", "--display-case": look.displayCase === "uppercase" ? "uppercase" : "none",
    };
    for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, String(value));
    // A look may add its own type styling (outlined letters, layered shadows), scoped to this composition.
    if (look.css) { const style = document.createElement("style"); style.textContent = look.css(accent, look); root.appendChild(style); }
    root.style.width = W + "px";
    root.style.height = H + "px";
    const backdrop = document.createElement("div");
    backdrop.style.cssText = "position:absolute;inset:0;";
    if (c.backdrop) backdrop.style.background = look.backdrop(accent, look.texture, look);
    root.insertBefore(backdrop, root.firstChild);
    // A look's texture pass: a canvas under the content (or over it), redrawn from time alone.
    let paint = null;
    if (c.backdrop && look.paint) {
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      canvas.style.cssText = `position:absolute;inset:0;pointer-events:none;opacity:${look.texture};` + (look.paintOver ? "z-index:5;" : "");
      if (look.paintOver) root.appendChild(canvas);
      else backdrop.after(canvas);
      paint = { canvas, ctx: canvas.getContext("2d") };
      look.paint(paint.ctx, W, H, 0, accent, look);
    }
    // Over footage the type needs separation; on the look's own backdrop it may carry the look's own glow.
    const separation = c.backdrop ? (look.textShadow ? look.textShadow(accent) : "none") : (look.motion === "focus" || look.motion === "type" || look.motion === "write" || look.motion === "glow"
      ? "0 2px 18px rgba(0,0,0,0.55)" : "0 1px 14px rgba(255,255,255,0.55)");
    root.style.setProperty("--separation", separation);
    // The render copy is already sized from `shape`; layout follows the same choice.
    const shape = c.shape || (H > W * 1.15 ? "tall" : W > H * 1.15 ? "wide" : "square");
    const tall = shape === "tall";
    const wide = shape === "wide";
    return { look, accent, W, H, shape, tall, wide, square: shape === "square", u: Math.min(W, H) / 1080, paint };
  }

  // Run the look's texture pass across the whole timeline. Call once, after the timeline is built.
  // `from` is the graphic's own time at the timeline's start, for a layer that shows part of it.
  function finish(tl, S, from = 0) {
    if (!S.paint) return;
    const length = tl.duration();
    const state = { t: from };
    const draw = () => S.look.paint(S.paint.ctx, S.W, S.H, state.t, S.accent, S.look);
    tl.fromTo(state, { t: from }, { t: from + length, duration: length, ease: "none", immediateRender: true, onUpdate: draw }, 0);
  }

  // The look's way of arriving. `at` and `duration` are seconds on the template's timeline.
  function enter(tl, targets, at, duration, look, options = {}) {
    const els = gsap.utils.toArray(targets);
    if (!els.length) return;
    const stagger = options.stagger || 0;
    const u = options.u || 1;
    switch (look.motion) {
      case "focus":
        tl.fromTo(els, { opacity: 0, scale: 0.94, filter: "blur(14px)" },
          { opacity: 1, scale: 1, filter: "blur(0px)", duration, ease: "expo.out", stagger, immediateRender: true }, at);
        break;
      case "wipe":
        tl.fromTo(els, { opacity: 1, x: -36 * u, clipPath: "inset(0% 100% 0% 0%)" },
          { x: 0, clipPath: "inset(0% 0% 0% 0%)", duration, ease: "power4.out", stagger, immediateRender: true }, at);
        break;
      case "type": {
        for (let i = 0; i < els.length; i++) {
          const chars = Math.max(4, Math.min(40, (els[i].textContent || "").length));
          tl.fromTo(els[i], { opacity: 1, clipPath: "inset(0% 100% 0% 0%)" },
            { clipPath: "inset(0% 0% 0% 0%)", duration, ease: `steps(${chars})`, immediateRender: true }, at + i * stagger);
        }
        break;
      }
      case "write":
        tl.fromTo(els, { opacity: 1, rotation: -0.6, clipPath: "inset(-10% 100% -10% -2%)" },
          { rotation: 0, clipPath: "inset(-10% -2% -10% -2%)", duration: duration * 1.15, ease: "power1.inOut", stagger, immediateRender: true }, at);
        break;
      case "stroke":
        // Outlines draw on left to right, then the fill floods in behind them.
        for (let i = 0; i < els.length; i++) {
          const el = els[i];
          const t0 = at + i * stagger;
          const outline = Math.max(1, 1.6 * u) + "px";
          // The fill starts as a faint wash of the text's own colour, not fully clear, so the
          // drawn outline still reads first and the text never counts as unpainted mid-entrance.
          const solid = getComputedStyle(el).color;
          const parts = solid.match(/[\d.]+/g) || ["0", "0", "0"];
          const faint = `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, 0.08)`;
          tl.fromTo(el, { opacity: 1, clipPath: "inset(-10% 100% -10% -2%)", webkitTextStroke: `${outline} currentColor`, webkitTextFillColor: faint },
            { clipPath: "inset(-10% -2% -10% -2%)", duration: duration * 0.8, ease: "power1.inOut", immediateRender: true }, t0);
          tl.to(el, { webkitTextFillColor: solid, duration: duration * 0.45, ease: "power1.out" }, t0 + duration * 0.6);
          // Back to the inherited fill once settled, so a later colour change (a highlight) shows.
          tl.set(el, { webkitTextStroke: "0px currentColor", webkitTextFillColor: "" }, t0 + duration * 1.05);
        }
        break;
      case "glow":
        // Tubes strike: a dim flicker, a short dark, then full brightness.
        for (let i = 0; i < els.length; i++) {
          const t0 = at + i * stagger;
          tl.fromTo(els[i], { opacity: 0, filter: "brightness(2.4)" }, { opacity: 0.55, duration: duration * 0.12, ease: "none", immediateRender: true }, t0);
          tl.to(els[i], { opacity: 0.08, duration: duration * 0.1, ease: "none" }, t0 + duration * 0.14);
          tl.to(els[i], { opacity: 1, filter: "brightness(1)", duration: duration * 0.5, ease: "power2.out" }, t0 + duration * 0.3);
        }
        break;
      default:
        tl.fromTo(els, { opacity: 0, y: 30 * u }, { opacity: 1, y: 0, duration, ease: "power3.out", stagger, immediateRender: true }, at);
    }
    // A reveal mask is released once revealed, so badges and shadows outside the box show.
    if (look.motion === "wipe" || look.motion === "type" || look.motion === "write" || look.motion === "stroke") {
      tl.set(els, { clipPath: "none" }, at + duration * 1.15 + stagger * (els.length - 1) + 0.01);
    }
  }

  // The look's way of leaving a scene. Looks without their own change keep the arrival's counterpart.
  function exit(tl, targets, at, duration, look, u = 1) {
    const els = gsap.utils.toArray(targets);
    if (!els.length || duration <= 0) return;
    const changes = {
      fade: { scale: 0.97 },
      grid: { x: 60 * u, clipPath: "inset(0% 0% 0% 100%)" },
      scan: { scaleY: 0.02, filter: "brightness(2)", transformOrigin: "50% 62%" },
      frost: { scale: 1.02, filter: "blur(18px)" },
    };
    const move = changes[look.change] || (look.motion === "wipe" ? { x: 40 * u } : look.motion === "focus" ? { scale: 1.03, filter: "blur(10px)" } : { y: -18 * u });
    // A filter tween needs a matching start, or "none" reads as brightness(0) and the scene flashes black.
    if (move.filter && move.filter.startsWith("brightness")) tl.fromTo(els, { filter: "brightness(1)" }, { opacity: 0, ...move, duration, ease: "power2.in" }, at);
    else tl.to(els, { opacity: 0, ...move, duration, ease: "power2.in" }, at);
  }

  // Shrink a block's type until it fits its box. Measured once at build time, so every frame agrees.
  function fit(el, maxPx, minPx, box) {
    let size = maxPx;
    el.style.fontSize = size + "px";
    while (size > minPx && (el.scrollWidth > box.width + 1 || (box.height && el.scrollHeight > box.height + 1))) {
      size = Math.max(minPx, size * 0.94);
      el.style.fontSize = size + "px";
    }
    return size;
  }

  function formatNumber(value, decimals, prefix, suffix) {
    const fixed = Math.abs(value).toFixed(Math.max(0, Math.min(3, Math.round(decimals || 0))));
    const [whole, fraction] = fixed.split(".");
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (value < 0 ? "-" : "") + (prefix || "") + grouped + (fraction ? "." + fraction : "") + (suffix || "");
  }

  // Count a number up on the timeline; seeking to any frame shows that frame's value.
  function count(tl, el, to, at, duration, format, ease = "power2.out") {
    const state = { v: 0 };
    el.textContent = format(0);
    tl.fromTo(state, { v: 0 }, { v: to, duration, ease, immediateRender: true,
      onUpdate: () => { el.textContent = format(state.v); } }, at);
  }

  window.DreamcutMotion = { LOOKS, register, setup, finish, enter, exit, fit, formatNumber, count, hexA, rng };
})();
