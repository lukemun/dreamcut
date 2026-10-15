// Shared looks for the explainer motion templates. Pass this file as `looks.js` beside each
// template's index.html. One `look` control switches colours, type, backdrop and the way
// things arrive, so no template is duplicated per look. Deterministic: no clocks, no network
// fonts, no unseeded randomness.
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

  const LOOKS = {
    // Warm editorial: cream stock, serif headlines, terracotta, things settle upward.
    paper: {
      bg: "#efe7da", panel: "#f8f3ea", ink: "#2b2520", muted: "#7a6e62", accent: "#c4553a", onAccent: "#fff8ef",
      rule: "rgba(43,37,32,0.16)", track: "rgba(43,37,32,0.08)",
      display: "'Iowan Old Style', Georgia, 'Times New Roman', serif", displayWeight: 600, displayCase: "none", displayTracking: "-0.01em",
      body: "'Avenir Next', Avenir, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif", bodyWeight: 500,
      figures: "'Iowan Old Style', Georgia, serif", radius: 18, motion: "rise",
      backdrop: (accent) => `${GRAIN(0.07)}, radial-gradient(120% 90% at 50% 40%, rgba(255,250,240,0.0) 55%, rgba(120,82,46,0.16) 100%), #efe7da`,
    },
    // Dark keynote: near-black, light heavy sans, a soft glow of the accent, things focus in.
    keynote: {
      bg: "#0d0e12", panel: "#17181e", ink: "#f4f4f6", muted: "#8b8e99", accent: "#7f9cff", onAccent: "#0d0e12",
      rule: "rgba(244,244,246,0.14)", track: "rgba(244,244,246,0.07)",
      display: "'Avenir Next', Avenir, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif", displayWeight: 700, displayCase: "none", displayTracking: "-0.02em",
      body: "'Avenir Next', Avenir, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif", bodyWeight: 500,
      figures: "'Avenir Next', Avenir, 'Segoe UI', Arial, sans-serif", radius: 22, motion: "focus",
      backdrop: (accent) => `radial-gradient(70% 60% at 82% 12%, ${hexA(accent, 0.22)} 0%, rgba(13,14,18,0) 70%), radial-gradient(60% 50% at 10% 100%, ${hexA(accent, 0.10)} 0%, rgba(13,14,18,0) 70%), #0d0e12`,
    },
    // Strict Swiss grid: white, black grotesque set flush left, one red, hard wipes.
    swiss: {
      bg: "#f5f5f2", panel: "#ffffff", ink: "#111111", muted: "#6b6b6b", accent: "#e2231a", onAccent: "#ffffff",
      rule: "rgba(17,17,17,0.9)", track: "rgba(17,17,17,0.07)",
      display: "'Helvetica Neue', Helvetica, Arial, sans-serif", displayWeight: 700, displayCase: "none", displayTracking: "-0.035em",
      body: "'Helvetica Neue', Helvetica, Arial, sans-serif", bodyWeight: 400,
      figures: "'Helvetica Neue', Helvetica, Arial, sans-serif", radius: 0, motion: "wipe",
      backdrop: () => "#f5f5f2",
    },
    // Terminal: black, phosphor mono, a prompt and a cursor, text types on.
    terminal: {
      bg: "#090c0a", panel: "#101511", ink: "#cdf5cf", muted: "#5f8a64", accent: "#4dff8f", onAccent: "#06120a",
      rule: "rgba(77,255,143,0.35)", track: "rgba(205,245,207,0.08)",
      display: "Menlo, Consolas, 'DejaVu Sans Mono', 'Courier New', monospace", displayWeight: 700, displayCase: "none", displayTracking: "-0.01em",
      body: "Menlo, Consolas, 'DejaVu Sans Mono', 'Courier New', monospace", bodyWeight: 400,
      figures: "Menlo, Consolas, 'DejaVu Sans Mono', monospace", radius: 4, motion: "type",
      backdrop: (accent) => `repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0px, rgba(255,255,255,0.025) 2px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 4px), radial-gradient(90% 80% at 50% 45%, ${hexA(accent, 0.07)} 0%, rgba(9,12,10,0) 70%), #090c0a`,
    },
    // Chalkboard: green-black slate, chalk hand, yellow chalk accent, lines write on.
    chalk: {
      bg: "#1e2a25", panel: "#26332d", ink: "#f0eee4", muted: "#a9b3a8", accent: "#f2cf5b", onAccent: "#1e2a25",
      rule: "rgba(240,238,228,0.5)", track: "rgba(240,238,228,0.08)",
      display: "'Chalkboard SE', 'Marker Felt', 'Comic Sans MS', 'Segoe Print', cursive", displayWeight: 700, displayCase: "none", displayTracking: "0em",
      body: "'Chalkboard SE', 'Marker Felt', 'Comic Sans MS', 'Segoe Print', cursive", bodyWeight: 400,
      figures: "'Chalkboard SE', 'Marker Felt', 'Comic Sans MS', cursive", radius: 14, motion: "write",
      backdrop: () => `${SMUDGE}, radial-gradient(110% 90% at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.35) 100%), #1e2a25`,
    },
  };

  function hexA(hex, alpha) {
    const n = parseInt(String(hex).slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }

  // Read the look, accent, backdrop and canvas; paint the backdrop and expose CSS variables.
  function setup(c, root) {
    const look = LOOKS[c.look] || LOOKS.paper;
    const accent = c.own_accent ? c.accent : look.accent;
    const W = Number(root.dataset.width) || 1920;
    const H = Number(root.dataset.height) || 1080;
    const vars = {
      "--bg": look.bg, "--panel": look.panel, "--ink": look.ink, "--muted": look.muted, "--accent": accent,
      "--on-accent": look.onAccent, "--rule": look.rule, "--track": look.track, "--display": look.display,
      "--display-weight": look.displayWeight, "--display-tracking": look.displayTracking, "--body": look.body,
      "--body-weight": look.bodyWeight, "--figures": look.figures, "--radius": look.radius + "px",
      "--accent-soft": hexA(accent, 0.16),
    };
    for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, String(value));
    root.style.width = W + "px";
    root.style.height = H + "px";
    const backdrop = document.createElement("div");
    backdrop.style.cssText = "position:absolute;inset:0;";
    if (c.backdrop) backdrop.style.background = look.backdrop(accent);
    root.insertBefore(backdrop, root.firstChild);
    // Over footage the type needs separation; on the look's own backdrop it does not.
    const separation = c.backdrop ? "none" : (look.motion === "focus" || look.motion === "type" || look.motion === "write"
      ? "0 2px 18px rgba(0,0,0,0.55)" : "0 1px 14px rgba(255,255,255,0.55)");
    root.style.setProperty("--separation", separation);
    // The render copy is already sized from `shape`; layout follows the same choice.
    const shape = c.shape || (H > W * 1.15 ? "tall" : W > H * 1.15 ? "wide" : "square");
    const tall = shape === "tall";
    const wide = shape === "wide";
    return { look, accent, W, H, shape, tall, wide, square: shape === "square", u: Math.min(W, H) / 1080 };
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
      default:
        tl.fromTo(els, { opacity: 0, y: 30 * u }, { opacity: 1, y: 0, duration, ease: "power3.out", stagger, immediateRender: true }, at);
    }
    // A reveal mask is released once revealed, so badges and shadows outside the box show.
    if (look.motion === "wipe" || look.motion === "type" || look.motion === "write") {
      tl.set(els, { clipPath: "none" }, at + duration * 1.15 + stagger * (els.length - 1) + 0.01);
    }
  }

  function exit(tl, targets, at, duration, look, u = 1) {
    const els = gsap.utils.toArray(targets);
    if (!els.length || duration <= 0) return;
    const move = look.motion === "wipe" ? { x: 40 * u } : look.motion === "focus" ? { scale: 1.03, filter: "blur(10px)" } : { y: -18 * u };
    tl.to(els, { opacity: 0, ...move, duration, ease: "power2.in" }, at);
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

  window.DreamcutMotion = { LOOKS, setup, enter, exit, fit, formatNumber, count, hexA };
})();
