// Clay: a stop-motion plasticine diorama. A smeared clay sky, a coiled clay sun, puffed clouds and
// three ranges of rolled hills (the far ones softly out of focus) frame a front field where each scene
// is a station: stacked clay pancakes for a chart, a chunky clay laptop with toothpick tags, little
// gumdrop folk holding placards, floating clay islands with a hopping guide, and two bowls filling
// with pebbles. A dolly glides the set from station to station; characters, props and edges move on
// twelves like hand-animated stop motion. Every frame is a pure function of time: seeded noise only.
window.DreamcutMotion.register("clay", ({ grain, rng }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const pop = (v) => { v = clamp(v); const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const stag = (p, i, n, spread = 0.5) => clamp((p - (i / Math.max(1, n)) * spread) / (1 - spread));
  const mod = (a, n) => ((a % n) + n) % n;
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return x - Math.floor(x); };
  const ROUND = "'Arial Rounded MT Bold', 'Nunito', 'Varela Round', 'Quicksand', 'Trebuchet MS', Verdana, sans-serif";

  // ---- colour ------------------------------------------------------------------------------------
  function rgb(v) {
    if (Array.isArray(v)) return v;
    const s = String(v || "");
    if (s[0] === "#") {
      const h = s.length === 4 ? s.slice(1).split("").map((c) => c + c).join("") : s.slice(1, 7);
      const n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const m = s.match(/rgba?\(([^)]+)\)/);
    return m ? m[1].split(",").slice(0, 3).map(Number) : [200, 200, 200];
  }
  const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const WARM_DARK = [44, 20, 32];
  const shade = (c, k) => (k >= 0 ? mix(rgb(c), [255, 250, 240], k) : mix(rgb(c), WARM_DARK, -k));
  const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;

  // The set's clay colours. Palettes replace this object whole.
  const BASE = {
    skyTop: "#eaa996", skyBot: "#fde2be", cloud: "#fff3e3", sun: "#f5a43a", far: "#e3b48b", mid: "#a6c27c", front: "#73a259",
    leaf: "#5c9a47", ink: "#46263a", label: "#fff4df", slab: "#fff0d8", tagInk: "#46263a", post: "#b07a4f", device: "#b9a1dd",
    screen: "#2d3557", soil: "#b9774f", shadow: "#3b1d2a", night: false,
    clays: ["#f4a3b5", "#7db4dc", "#f5c552", "#b79bdc", "#86c9a5", "#f39a62"],
  };
  const PALETTES = {
    light: { ...BASE, skyTop: "#cfe6ef", skyBot: "#fbf4e3", cloud: "#ffffff", sun: "#f7b538", far: "#e4d4ab", mid: "#b9d79f", front: "#88bf78", leaf: "#64a650",
      ink: "#2d3341", tagInk: "#2d3341", label: "#fffaf0", slab: "#fffaf0", device: "#9cc3e6", screen: "#2c3750", soil: "#c98b5e", shadow: "#27303e",
      clays: ["#f6a8bb", "#86bfe6", "#f7cd5c", "#bfa5e4", "#8fd1ad", "#f6a26c"] },
    dark: { ...BASE, skyTop: "#121833", skyBot: "#3a3266", cloud: "#4b4878", sun: "#f2e3bd", far: "#393962", mid: "#2c4a58", front: "#2c5e4d", leaf: "#3d7c56",
      ink: "#fff1dc", tagInk: "#fff1dc", label: "#fff1dc", slab: "#43325a", post: "#8a5f45", device: "#7a69a9", screen: "#121829", soil: "#7a4a3a", shadow: "#04050e", night: true,
      clays: ["#e98aa0", "#6ea7d6", "#f0bd4f", "#a68ad0", "#79bf9a", "#ef8f5a"] },
    mono: { ...BASE, skyTop: "#b9b6b1", skyBot: "#e6e3de", cloud: "#f5f3ef", sun: "#f3f1ec", far: "#b0ada7", mid: "#9a9792", front: "#7e7b76", leaf: "#6c6964",
      ink: "#292826", tagInk: "#292826", label: "#f7f5f1", slab: "#f2f0eb", post: "#6b6864", device: "#cfccc7", screen: "#393836", soil: "#8d8a85", shadow: "#1c1b19",
      clays: ["#d8d5d0", "#a3a09b", "#ebe8e3", "#8b8883", "#c3c0bb", "#75726d"] },
  };

  function theme(S) {
    const P = S.look.clay || BASE;
    const C = {};
    for (const k of Object.keys(P)) C[k] = Array.isArray(P[k]) ? P[k].map(rgb) : typeof P[k] === "string" ? rgb(P[k]) : P[k];
    C.acc = rgb(S.accent);
    C.onAcc = lum(C.acc) > 165 ? [44, 22, 32] : [255, 246, 232];
    return C;
  }

  // ---- canvases, noise ---------------------------------------------------------------------------
  const canvas = (w, h) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
  let SPECK = null;
  function speckleCanvas() {
    if (SPECK) return SPECK;
    const c = canvas(256, 256), g = c.getContext("2d"), r = rng(77);
    for (let i = 0; i < 1100; i++) {
      const x = r() * 256, y = r() * 256, s = 0.5 + r() * 1.5;
      g.fillStyle = r() < 0.55 ? `rgba(40,18,22,${0.1 + r() * 0.16})` : `rgba(255,250,235,${0.08 + r() * 0.14})`;
      for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) { g.beginPath(); g.arc(x + dx, y + dy, s, 0, TAU); g.fill(); }
    }
    g.lineWidth = 0.8;
    for (let i = 0; i < 46; i++) {
      const x = r() * 256, y = r() * 256, a = r() * TAU, l = 4 + r() * 12;
      g.strokeStyle = `rgba(40,18,22,${0.06 + r() * 0.08})`;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    return (SPECK = c);
  }
  function pattern(ctx) { if (!ctx.__clayPat) ctx.__clayPat = ctx.createPattern(speckleCanvas(), "repeat"); return ctx.__clayPat; }
  let MC = null;
  const mctx = () => (MC || (MC = canvas(8, 8).getContext("2d")));
  function textW(s, size, weight = 800) { const c = mctx(); c.font = `${weight} ${size}px ${ROUND}`; return c.measureText(String(s)).width; }

  // Stop-motion boil: a value in -1..1 that changes twelve times a second.
  const bo = (F, s) => (hash(s * 3.17 + F.step * 17.31) - 0.5) * 2;

  // ---- paths --------------------------------------------------------------------------------------
  function closed(ctx, pts, fresh = true) {
    const n = pts.length;
    if (fresh) ctx.beginPath();
    ctx.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
    for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
    ctx.closePath();
  }
  function open(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    if (pts.length === 2) { ctx.lineTo(pts[1][0], pts[1][1]); return; }
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1], last = i === pts.length - 2;
      ctx.quadraticCurveTo(p[0], p[1], last ? q[0] : (p[0] + q[0]) / 2, last ? q[1] : (p[1] + q[1]) / 2);
    }
  }
  function lumpPts(F, cx, cy, rx, ry, seed = 1, wob = 0.06, n = 14) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const r = 1.05 + wob * ((hash(seed * 7.1 + i * 1.37) - 0.5) * 2) + wob * 0.3 * bo(F, seed + i * 0.71);
      pts.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]);
    }
    return pts;
  }
  function lump(ctx, F, cx, cy, rx, ry, seed = 1, wob = 0.06, fresh = true) {
    closed(ctx, lumpPts(F, cx, cy, rx, ry, seed, wob), fresh);
    return { x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2 };
  }
  function slabPts(F, x, y, w, h, r, seed = 1, j = 1) {
    const u = F.u;
    r = Math.max(1, Math.min(r, w / 2, h / 2));
    const pts = [];
    const corner = (cx, cy, a0) => { for (let k = 0; k < 3; k++) { const a = a0 + (k / 2) * (Math.PI / 2); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
    const edge = (x1, y1, x2, y2) => { const m = Math.max(0, Math.floor(Math.hypot(x2 - x1, y2 - y1) / (110 * u))); for (let k = 1; k <= m; k++) { const f = k / (m + 1); pts.push([x1 + (x2 - x1) * f, y1 + (y2 - y1) * f]); } };
    corner(x + w - r, y + r, -Math.PI / 2); edge(x + w, y + r, x + w, y + h - r);
    corner(x + w - r, y + h - r, 0); edge(x + w - r, y + h, x + r, y + h);
    corner(x + r, y + h - r, Math.PI / 2); edge(x, y + h - r, x, y + r);
    corner(x + r, y + r, Math.PI); edge(x + r, y, x + w - r, y);
    const amp = Math.min(3.2 * u, Math.min(w, h) * 0.03) * j;
    return pts.map((p, i) => [p[0] + amp * ((hash(seed * 5.3 + i * 2.1) - 0.5) * 2 + 0.35 * bo(F, seed + i * 1.3)), p[1] + amp * ((hash(seed * 9.7 + i * 1.7) - 0.5) * 2 + 0.35 * bo(F, seed + i * 2.9))]);
  }
  function slab(ctx, F, x, y, w, h, r, seed = 1, j = 1) { closed(ctx, slabPts(F, x, y, w, h, r, seed, j)); return { x, y, w, h }; }
  function qpts(a, c, b, n = 16) { const out = []; for (let i = 0; i <= n; i++) { const t = i / n, m = 1 - t; out.push([m * m * a[0] + 2 * m * t * c[0] + t * t * b[0], m * m * a[1] + 2 * m * t * c[1] + t * t * b[1]]); } return out; }
  function cut(pts, f) {
    if (!pts || f <= 0) return null;
    if (f >= 1) return pts;
    const L = [0];
    for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const target = L[L.length - 1] * f, out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      if (L[i] >= target) { const k = (target - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]); out.push([lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k)]); break; }
      out.push(pts[i]);
    }
    return out.length >= 2 ? out : null;
  }

  // ---- the medium ---------------------------------------------------------------------------------
  // Fill the current path as a piece of plasticine: lifted shadow, soft key light from the top left,
  // a darker core toward the bottom right, speckle, a thumbprint, a matte highlight and a soft rim.
  function clay(ctx, F, col, b, o = {}) {
    const u = F.u, c = rgb(col);
    const lift = o.lift ?? 10;
    ctx.save();
    if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    if (lift > 0) {
      ctx.shadowColor = rgba(F.C.shadow, 0.3 * (o.sa ?? 1));
      ctx.shadowBlur = lift * 1.5 * u; ctx.shadowOffsetX = lift * 0.45 * u; ctx.shadowOffsetY = lift * 0.75 * u;
    }
    ctx.fillStyle = rgba(c); ctx.fill();
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.clip();
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(Math.max(1, b.w) / 2, Math.max(1, b.h) / 2);
    let g = ctx.createRadialGradient(-0.42, -0.52, 0, -0.42, -0.52, 1.3);
    g.addColorStop(0, rgba(shade(c, 0.42), 0.75)); g.addColorStop(0.5, rgba(shade(c, 0.15), 0.18)); g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g; ctx.fillRect(-1.2, -1.2, 2.4, 2.4);
    g = ctx.createRadialGradient(-0.22, -0.3, 0.25, 0, 0, 1.12);
    g.addColorStop(0, rgba(c, 0)); g.addColorStop(0.68, rgba(shade(c, -0.22), 0.16)); g.addColorStop(1, rgba(shade(c, -0.52), 0.62));
    ctx.fillStyle = g; ctx.fillRect(-1.2, -1.2, 2.4, 2.4);
    if (o.spec !== 0) {
      g = ctx.createRadialGradient(-0.4, -0.5, 0, -0.4, -0.5, 0.42);
      g.addColorStop(0, `rgba(255,255,250,${0.32 * (o.spec ?? 1)})`); g.addColorStop(1, "rgba(255,255,250,0)");
      ctx.fillStyle = g; ctx.fillRect(-1.2, -1.2, 2.4, 2.4);
    }
    ctx.restore();
    if (F.tex > 0) {
      ctx.save();
      ctx.globalAlpha *= F.tex * 0.55 * (o.speck ?? 1);
      const s = o.seed || 1;
      ctx.translate(-mod(s * 37, 256), -mod(s * 53, 256));
      ctx.fillStyle = pattern(ctx);
      ctx.fillRect(b.x - 4, b.y - 4, b.w + 268, b.h + 268);
      ctx.restore();
      if (o.thumb) thumb(ctx, F, b.x + b.w * (0.3 + hash(s) * 0.4), b.y + b.h * (0.3 + hash(s + 1) * 0.35), Math.min(b.w, b.h) * 0.22, s, 1);
      if (o.score) score(ctx, F, b, s, o.score);
    }
    ctx.restore();
    if (o.edge !== 0) { ctx.save(); ctx.lineWidth = (o.edgeW ?? 1.5) * u; ctx.strokeStyle = rgba(shade(c, -0.5), 0.42); ctx.stroke(); ctx.restore(); }
  }
  // A thumbprint pressed into the surface: paired light and dark arcs.
  function thumb(ctx, F, cx, cy, r, seed, a = 1) {
    if (r < 4) return;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(hash(seed) * TAU);
    ctx.lineWidth = Math.max(0.8, r * 0.06);
    for (let k = 0; k < 5; k++) {
      const rr = r * (0.25 + k * 0.17), a0 = hash(seed + k) * TAU, span = 2 + hash(seed + k * 2) * 2.4;
      ctx.beginPath(); ctx.ellipse(0, 0, rr, rr * 0.72, 0, a0, a0 + span); ctx.strokeStyle = `rgba(255,250,240,${0.09 * a * F.tex})`; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(r * 0.04, r * 0.05, rr, rr * 0.72, 0, a0, a0 + span); ctx.strokeStyle = rgba(F.C.shadow, 0.07 * a * F.tex); ctx.stroke();
    }
    ctx.restore();
  }
  // Short incised tool marks: a dark groove with a lit lower lip.
  function score(ctx, F, b, seed, n) {
    const u = F.u;
    ctx.save(); ctx.lineCap = "round";
    for (let i = 0; i < n; i++) {
      const x = b.x + b.w * (0.18 + hash(seed + i * 3.1) * 0.64), y = b.y + b.h * (0.2 + hash(seed + i * 4.7) * 0.6);
      const a = (hash(seed + i * 9.2) - 0.5) * 1.2, l = Math.min(b.w, b.h) * (0.1 + hash(seed + i) * 0.12);
      const dx = Math.cos(a) * l / 2, dy = Math.sin(a) * l / 2;
      ctx.lineWidth = 2.2 * u; ctx.strokeStyle = rgba(F.C.shadow, 0.26 * F.tex);
      ctx.beginPath(); ctx.moveTo(x - dx, y - dy); ctx.lineTo(x + dx, y + dy); ctx.stroke();
      ctx.lineWidth = 1.4 * u; ctx.strokeStyle = `rgba(255,250,240,${0.32 * F.tex})`;
      ctx.beginPath(); ctx.moveTo(x - dx, y - dy + 2 * u); ctx.lineTo(x + dx, y + dy + 2 * u); ctx.stroke();
    }
    ctx.restore();
  }
  // A rolled coil of clay along a path: shadowed underside, body, lit crest and a soft streak.
  function tube(ctx, F, pts, w, col, o = {}) {
    if (!pts || pts.length < 2 || w <= 0) return;
    const c = rgb(col), u = F.u;
    const path = () => (o.closed ? closed(ctx, pts) : open(ctx, pts));
    ctx.save();
    if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    path();
    if (o.lift !== 0) {
      ctx.shadowColor = rgba(F.C.shadow, 0.28 * (o.sa ?? 1)); ctx.shadowBlur = w * 0.8 + 4 * u;
      ctx.shadowOffsetX = w * 0.22 + 2 * u; ctx.shadowOffsetY = w * 0.36 + 3 * u;
    }
    ctx.strokeStyle = rgba(shade(c, -0.34)); ctx.lineWidth = w; ctx.stroke();
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    const layer = (dx, dy, color, lw) => { ctx.save(); ctx.translate(dx, dy); path(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke(); ctx.restore(); };
    layer(-w * 0.05, -w * 0.08, rgba(c), w * 0.74);
    layer(-w * 0.12, -w * 0.17, rgba(shade(c, 0.3), 0.75), w * 0.36);
    layer(-w * 0.16, -w * 0.22, `rgba(255,255,250,${0.3 * (o.spec ?? 1)})`, w * 0.11);
    if (o.speck && F.tex > 0) {
      ctx.save(); ctx.globalAlpha *= F.tex * 0.6 * o.speck; path(); ctx.strokeStyle = pattern(ctx); ctx.lineWidth = w * 0.9; ctx.stroke(); ctx.restore();
    }
    ctx.restore();
  }
  // A surface pressed down into the clay: a soft shadow under its upper-left lip and a lit lower edge.
  function recess(ctx, F, R, r, seed, depth = 1) {
    const u = F.u;
    ctx.save();
    slab(ctx, F, R.x, R.y, R.w, R.h, r, seed, 0.4); ctx.clip();
    const edge = (dx, dy, color, lw, blur) => { ctx.save(); ctx.filter = `blur(${blur.toFixed(1)}px)`; ctx.translate(dx, dy); slab(ctx, F, R.x, R.y, R.w, R.h, r, seed, 0.4); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke(); ctx.restore(); };
    edge(7 * u * depth, 10 * u * depth, rgba(F.C.shadow, 0.5), 22 * u * depth, 6 * u);
    edge(-4 * u * depth, -5 * u * depth, "rgba(255,250,240,0.22)", 8 * u, 2 * u);
    if (F.tex > 0) { ctx.globalAlpha = F.tex * 0.3; ctx.translate(-mod(seed * 31, 256), 0); ctx.fillStyle = pattern(ctx); ctx.fillRect(R.x, R.y, R.w + 256, R.h); }
    ctx.restore();
  }
  function contact(ctx, F, cx, cy, rx, ry, a = 0.35) {
    if (rx <= 0 || ry <= 0) return;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(rx, ry);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, rgba(F.C.shadow, a)); g.addColorStop(0.6, rgba(F.C.shadow, a * 0.45)); g.addColorStop(1, rgba(F.C.shadow, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // Clay letters for labels and numbers: the same pressed type as the headlines, in one colour.
  function ctext(ctx, F, s, x, y, size, col, o = {}) {
    s = String(s ?? "");
    if (!s.trim()) return 0;
    const u = F.u;
    let total = typeW(s, size);
    if (o.maxW && total > o.maxW) { size = Math.max(o.min ?? 42 * u, size * o.maxW / total); total = typeW(s, size); }
    const align = o.align || "center";
    const x0 = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
    clayType(ctx, F, s, x0, y, size, { align: "left", cols: o.cols || [col], seed: o.seed ?? 7, alpha: o.alpha, ripple: o.ripple ?? false, time: o.time, gap: o.gap, contact: o.contact });
    return total;
  }
  const fmt = (v, d) => window.DreamcutMotion.formatNumber(Math.round(v), 0, d.prefix || "", d.suffix || "");

  // ---- pressed clay type ---------------------------------------------------------------------------
  // Each glyph is a rolled piece of plasticine: rounded strokes, a dark rolled underside, a lit upper
  // lip, speckle and a thumbprint. Built once per glyph, size and colour, then stamped every frame.
  const GLYPH = {};
  let GLYPHN = 0, SCR = null;
  function scratch(w, h) {
    if (!SCR || SCR.width < w || SCR.height < h) SCR = canvas(Math.max(w, SCR ? SCR.width : 0), Math.max(h, SCR ? SCR.height : 0));
    const g = SCR.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "source-over"; g.filter = "none"; g.globalAlpha = 1;
    g.clearRect(0, 0, SCR.width, SCR.height);
    return g;
  }
  const TRACK = 0.05;
  const typeW = (s, size) => textW(s, size) + Math.max(0, String(s).length - 1) * size * TRACK;
  function glyph(F, ch, size, col, seed) {
    const sz = Math.max(8, Math.round(size)), v = mod(Math.round(seed), 5);
    const key = ch + "|" + sz + "|" + col.map((x) => x | 0).join(",") + "|" + F.tex.toFixed(2) + "|" + v;
    if (GLYPH[key]) return GLYPH[key];
    if (++GLYPHN > 1200) { for (const k of Object.keys(GLYPH)) delete GLYPH[k]; GLYPHN = 1; }
    const font = `800 ${sz}px ${ROUND}`;
    const m = mctx(); m.font = font;
    const adv = m.measureText(ch).width;
    const pad = Math.ceil(sz * 0.22), w = Math.ceil(adv + pad * 2), h = Math.ceil(sz * 1.45);
    const cx = w / 2, cy = h / 2, lw = sz * 0.03, a = sz * 0.026;
    const ink = (g, color, dx = 0, dy = 0) => {
      g.font = font; g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round"; g.lineCap = "round"; g.lineWidth = lw;
      g.fillStyle = g.strokeStyle = color; g.fillText(ch, cx + dx, cy + dy); g.strokeText(ch, cx + dx, cy + dy);
    };
    const c = canvas(w, h), g = c.getContext("2d");
    ink(g, rgba(col));
    const rim = (color, dx, dy, blur) => {
      const s = scratch(w, h); ink(s, color); s.globalCompositeOperation = "destination-out"; ink(s, "#000", dx, dy);
      g.save(); g.globalCompositeOperation = "source-atop"; g.filter = `blur(${blur.toFixed(1)}px)`; g.drawImage(SCR, 0, 0); g.restore();
    };
    rim(rgba(shade(col, -0.5), 0.95), -a, -a * 1.35, sz * 0.022);
    rim(rgba(shade(col, 0.55), 0.85), a * 0.8, a, sz * 0.016);
    g.save(); g.globalCompositeOperation = "source-atop";
    const rg = g.createRadialGradient(cx - sz * 0.16, cy - sz * 0.24, 0, cx - sz * 0.16, cy - sz * 0.24, sz * 0.6);
    rg.addColorStop(0, "rgba(255,255,250,0.26)"); rg.addColorStop(1, "rgba(255,255,250,0)");
    g.fillStyle = rg; g.fillRect(0, 0, w, h);
    const lg = g.createLinearGradient(0, cy - sz * 0.4, 0, cy + sz * 0.45);
    lg.addColorStop(0, "rgba(0,0,0,0)"); lg.addColorStop(1, rgba(shade(col, -0.5), 0.32));
    g.fillStyle = lg; g.fillRect(0, 0, w, h);
    if (F.tex > 0) {
      g.globalAlpha = F.tex * 0.7; g.translate(-mod(v * 41 + sz, 256), -mod(v * 67, 256)); g.fillStyle = pattern(g); g.fillRect(0, 0, w + 256, h + 256);
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
      thumb(g, F, cx + (hash(v + sz) - 0.5) * sz * 0.25, cy + (hash(v + 3) - 0.5) * sz * 0.2, sz * 0.3, v * 7 + 3, 1.1);
    }
    g.restore();
    const E = canvas(w, h); ink(E.getContext("2d"), rgba(shade(col, -0.58)));
    return (GLYPH[key] = { c, E, w, h, adv });
  }
  // Set a line of clay letters. Each drops in on its own beat, squashes on impact and settles; through
  // the hold the letters boil on twelves and a small hop ripples along the word.
  function clayType(ctx, F, s, x, y, size, o = {}) {
    s = String(s ?? "");
    if (!s.trim()) return 0;
    const u = F.u, sz = Math.round(size), font = `800 ${sz}px ${ROUND}`;
    const m = mctx(); m.font = font;
    const tr = sz * TRACK, total = m.measureText(s).width + (s.length - 1) * tr;
    const x0 = o.align === "left" ? x : x - total / 2;
    const cols = o.cols || [F.C.ink], seed = o.seed || 1, time = o.time ?? 99, gap = o.gap ?? 0.03;
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === " ") continue;
      const k = (o.idx0 || 0) + n++;
      const age = time - k * gap;
      if (age <= 0) continue;
      const gx = x0 + m.measureText(s.slice(0, i)).width + i * tr + m.measureText(ch).width / 2;
      const fallT = 0.17, fy = age < fallT ? -Math.pow(1 - age / fallT, 2) * sz * 1.2 : 0;
      const land = seg(age, fallT, fallT + 0.3);
      let sx = 1, sy = 1;
      if (age < fallT) { sy = 1.1; sx = 0.92; } else if (land < 1) { const wv = Math.sin(land * Math.PI * 2) * (1 - land); sy = 1 - 0.32 * wv; sx = 1 + 0.24 * wv; }
      const rip = o.ripple === false ? 0 : Math.pow(Math.max(0, Math.sin(F.ts * 2.2 - k * 0.34 + seed)), 16);
      const hop = rip * sz * 0.08;
      const tilt = (hash(seed + k * 3.3) - 0.5) * 0.1 + bo(F, seed + k) * 0.02 + rip * 0.06 * (k % 2 ? 1 : -1);
      const dy = (hash(seed * 2 + k * 5.1) - 0.5) * sz * 0.05;
      const col = rgb(cols[mod(Math.floor(k * 1.6 + hash(seed) * 5), cols.length)]);
      const G = glyph(F, ch, sz, col, seed + k);
      const foot = y + dy + sz * 0.38, air = clamp(-fy / (sz * 1.2) + hop / sz);
      if (o.contact !== false) contact(ctx, F, gx + sz * 0.03, foot + sz * 0.04, G.adv * 0.55 * (1 - air * 0.4), sz * 0.08, 0.34 * (1 - air * 0.7) * (o.alpha ?? 1));
      ctx.save();
      if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
      ctx.translate(gx, foot + fy - hop); ctx.rotate(tilt); ctx.scale(sx, sy); ctx.translate(0, -sz * 0.38);
      const ext = Math.max(2 * u, sz * 0.07);
      ctx.shadowColor = rgba(F.C.shadow, 0.32); ctx.shadowBlur = sz * 0.1; ctx.shadowOffsetX = sz * 0.03; ctx.shadowOffsetY = sz * 0.06;
      ctx.drawImage(G.E, -G.w / 2, -G.h / 2 + ext);
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      ctx.drawImage(G.E, -G.w / 2, -G.h / 2 + ext * 0.5);
      ctx.drawImage(G.c, -G.w / 2, -G.h / 2);
      ctx.restore();
    }
    return total;
  }
  function wrap(s, size, maxW) {
    const words = String(s || "").trim().split(/\s+/).filter(Boolean), lines = [];
    let line = "";
    for (const w of words) { const nx = line ? line + " " + w : w; if (line && typeW(nx, size) > maxW) { lines.push(line); line = w; } else line = nx; }
    if (line) lines.push(line);
    return lines;
  }
  function fitType(s, size, min, maxW, maxLines) {
    let sz = size, L = wrap(s, sz, maxW);
    const widest = () => Math.max(1, ...L.map((l) => typeW(l, sz)));
    while ((L.length > maxLines || widest() > maxW) && sz > min) { sz = Math.max(min, sz * 0.95); L = wrap(s, sz, maxW); }
    return { size: sz, lines: L, w: widest() };
  }
  // Letter colours: deep clays on a pale slab, bright clays on a dark one.
  function typeCols(F, on) {
    const C = F.C, dark = lum(rgb(on)) < 130;
    return dark ? [C.ink, shade(C.clays[2], 0.1), shade(C.clays[0], 0.1), shade(C.clays[4], 0.1), C.ink]
      : [C.ink, shade(C.acc, -0.08), shade(C.clays[1], -0.38), shade(C.clays[3], -0.34), C.ink, shade(C.clays[4], -0.42)];
  }

  // ---- characters and props -----------------------------------------------------------------------
  // A gumdrop clay person: one rounded body with the face pressed into it, stubby feet, a hat or tuft
  // that differs per person, rolled arms and dot eyes that blink.
  function lumpling(ctx, F, cx, base, h, o = {}) {
    const u = F.u, C = F.C, col = rgb(o.col || C.clays[0]), k = o.k || 0, seed = 31 + k * 13 + (o.seed || 0);
    const w = h * 0.68, sq = o.sq ?? 1, sx = 1 + (1 - sq) * 0.7, lift = o.lift || 0, ts = F.ts;
    contact(ctx, F, cx, base + 2 * u, w * 0.62 * (1 - Math.min(0.5, lift / h)), h * 0.06, 0.4 * (1 - Math.min(0.6, lift / h)));
    ctx.save();
    if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    ctx.translate(cx, base - lift); ctx.scale(sx, sq);
    for (const s of [-1, 1]) { const b = lump(ctx, F, s * w * 0.21, -h * 0.03, w * 0.17, h * 0.05, seed + s * 3, 0.08); clay(ctx, F, shade(col, -0.18), b, { lift: 3, spec: 0.5, seed: seed + s }); }
    if (o.behind) o.behind(ctx, { w, h });
    const B = [[-0.5, -0.06], [-0.28, -0.02], [0, -0.01], [0.28, -0.02], [0.5, -0.06], [0.53, -0.25], [0.48, -0.47], [0.38, -0.69], [0.22, -0.87], [0, -0.95], [-0.22, -0.87], [-0.38, -0.69], [-0.48, -0.47], [-0.53, -0.25]];
    closed(ctx, B.map(([px, py], i) => [px * w + w * 0.012 * ((hash(seed + i) - 0.5) * 2 + 0.45 * bo(F, seed + i)), py * h + h * 0.008 * bo(F, seed + i * 3)]));
    clay(ctx, F, col, { x: -w * 0.53, y: -h * 0.95, w: w * 1.06, h: h * 0.95 }, { lift: 12, thumb: true, seed, score: o.score ?? 0 });
    hat(ctx, F, k, w, h, seed);
    // Face.
    const ey = -h * 0.62, blink = o.blink, look = (o.look || 0) * w * 0.035, lookY = (o.lookY || 0) * w * 0.03;
    for (const s of [-1, 1]) {
      const ex = s * w * 0.16;
      if (blink) { tube(ctx, F, [[ex - w * 0.07, ey], [ex, ey + w * 0.035], [ex + w * 0.07, ey]], w * 0.035, shade(col, -0.65), { lift: 0, spec: 0 }); continue; }
      let b = lump(ctx, F, ex, ey, w * 0.095, w * 0.11, seed + s * 7, 0.05); clay(ctx, F, [255, 250, 240], b, { lift: 2, spec: 0.7, speck: 0.4, seed: seed + 2 });
      b = lump(ctx, F, ex + look, ey + w * 0.015 + lookY, w * 0.052, w * 0.058, seed + s * 11, 0.05); clay(ctx, F, [36, 22, 30], b, { lift: 0, spec: 0, edge: 0, speck: 0 });
      ctx.beginPath(); ctx.arc(ex + look - w * 0.018, ey - w * 0.008 + lookY, w * 0.016, 0, TAU); ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fill();
    }
    for (const s of [-1, 1]) { const b = lump(ctx, F, s * w * 0.27, -h * 0.53, w * 0.075, w * 0.05, seed + s * 13, 0.08); clay(ctx, F, shade([240, 120, 130], 0.15), b, { lift: 0, alpha: 0.55, spec: 0, edge: 0, speck: 0.3 }); }
    if (o.open) { const b = lump(ctx, F, 0, -h * 0.495, w * 0.075, w * 0.06 + w * 0.02 * Math.abs(Math.sin(ts * 9)), seed + 19, 0.08); clay(ctx, F, [70, 26, 36], b, { lift: 0, spec: 0, speck: 0 }); }
    else tube(ctx, F, [[-w * 0.1, -h * 0.51], [0, -h * 0.465], [w * 0.1, -h * 0.51]], w * 0.034, shade(col, -0.62), { lift: 0, spec: 0.4 });
    if (o.between) o.between(ctx, { w, h });
    // Arms: angle measured from straight up, outward positive.
    const L = h * 0.34;
    const at = (s, a) => [s * w * 0.4 + s * Math.sin(a) * L, -h * 0.45 - Math.cos(a) * L];
    const arm = (s, hand) => {
      const sh = [s * w * 0.4, -h * 0.45];
      const el = [(sh[0] + hand[0]) / 2 + s * w * 0.07, (sh[1] + hand[1]) / 2 + h * 0.025];
      tube(ctx, F, [sh, el, hand], w * 0.13, col, { lift: 4 });
      const b = lump(ctx, F, hand[0], hand[1], w * 0.085, w * 0.08, seed + s * 5, 0.08);
      clay(ctx, F, shade(col, 0.04), b, { lift: 3, seed: seed + 9 });
    };
    const mode = o.arms || "down", sway = Math.sin(ts * 2.4 + seed) * 0.08;
    const hands = {
      down: [at(-1, Math.PI - 0.38 + sway), at(1, Math.PI - 0.38 - sway)],
      wave: [at(-1, Math.PI - 0.38 + sway), at(1, 0.55 + 0.42 * Math.sin(ts * 10 + seed))],
      cheer: [at(-1, 0.48 + 0.22 * Math.sin(ts * 12 + 1)), at(1, 0.48 + 0.22 * Math.sin(ts * 12))],
      point: [at(-(o.dir || 1), Math.PI - 0.38 + sway), at(o.dir || 1, 1.25 + 0.1 * Math.sin(ts * 5))],
      hold: o.hands || [at(-1, Math.PI - 0.38), at(1, Math.PI - 0.38)],
    }[mode];
    const order = mode === "point" ? [-(o.dir || 1), o.dir || 1] : [-1, 1];
    for (const s of order) arm(s, hands[s === -1 ? 0 : 1]);
    ctx.restore();
  }
  function hat(ctx, F, k, w, h, seed) {
    const C = F.C, hc = C.clays[(k + 2) % C.clays.length], hair = shade(C.clays[(k + 3) % C.clays.length], -0.5);
    let b;
    switch (k % 6) {
      case 0: // A sprout.
        tube(ctx, F, [[0, -h * 0.91], [w * 0.03, -h * 1.0], [0, -h * 1.06]], w * 0.05, C.leaf, { lift: 2 });
        for (const s of [-1, 1]) {
          ctx.save(); ctx.translate(s * w * 0.11, -h * 1.06); ctx.rotate(-s * 0.55 + bo(F, seed + s) * 0.04);
          b = lump(ctx, F, 0, 0, w * 0.15, w * 0.065, seed + s * 2, 0.06); clay(ctx, F, C.leaf, b, { lift: 3, seed });
          ctx.restore();
        }
        break;
      case 1: // A knitted beanie with a pompom.
        b = lump(ctx, F, 0, -h * 0.87, w * 0.36, h * 0.12, seed + 1, 0.05); clay(ctx, F, hc, b, { lift: 4, seed, score: 2 });
        tube(ctx, F, [[-w * 0.38, -h * 0.79], [0, -h * 0.77], [w * 0.38, -h * 0.79]], h * 0.06, shade(hc, -0.08), { lift: 2 });
        b = lump(ctx, F, w * 0.03, -h * 1.0, w * 0.1, w * 0.1, seed + 2, 0.12); clay(ctx, F, C.slab, b, { lift: 3, seed: seed + 3 });
        break;
      case 2: // A bun.
        b = lump(ctx, F, w * 0.04, -h * 0.99, w * 0.16, w * 0.15, seed + 3, 0.06); clay(ctx, F, hair, b, { lift: 3, seed, thumb: true });
        tube(ctx, F, [[-w * 0.3, -h * 0.8], [-w * 0.1, -h * 0.9], [w * 0.2, -h * 0.86]], w * 0.06, hair, { lift: 1 });
        break;
      case 3: // A cap with a brim.
        b = lump(ctx, F, 0, -h * 0.86, w * 0.38, h * 0.11, seed + 4, 0.05); clay(ctx, F, hc, b, { lift: 4, seed });
        b = lump(ctx, F, w * 0.34, -h * 0.81, w * 0.24, h * 0.035, seed + 5, 0.05); clay(ctx, F, shade(hc, -0.12), b, { lift: 3, seed });
        b = lump(ctx, F, 0, -h * 0.96, w * 0.05, w * 0.04, seed + 6, 0.05); clay(ctx, F, shade(hc, -0.2), b, { lift: 1, seed });
        break;
      case 4: // Curls.
        for (let i = 0; i < 3; i++) { b = lump(ctx, F, (i - 1) * w * 0.19, -h * (i === 1 ? 0.95 : 0.89), w * 0.12, w * 0.11, seed + i * 4, 0.1); clay(ctx, F, hair, b, { lift: 3, seed: seed + i, thumb: true }); }
        break;
      default: { // A bobbing antenna.
        const tip = [w * 0.08 + bo(F, seed) * w * 0.012, -h * 1.12];
        tube(ctx, F, [[0, -h * 0.92], [w * 0.02, -h * 1.02], tip], w * 0.035, shade(hc, -0.2), { lift: 1 });
        b = lump(ctx, F, tip[0], tip[1], w * 0.07, w * 0.07, seed + 8, 0.06); clay(ctx, F, C.acc, b, { lift: 3, seed });
      }
    }
  }
  function coilSun(ctx, F, x, y, r, col, rot) {
    const u = F.u;
    // Rays: teardrops of clay that breathe on twelves.
    for (let i = 0; i < 11; i++) {
      const a = rot * 0.4 + (i / 11) * TAU, d = r * (1.36 + 0.05 * Math.sin(F.ts * 3 + i));
      ctx.save(); ctx.translate(x + Math.cos(a) * d, y + Math.sin(a) * d); ctx.rotate(a);
      const b = lump(ctx, F, 0, 0, r * 0.17, r * 0.075, 60 + i, 0.08); clay(ctx, F, shade(col, 0.06), b, { lift: 4, seed: 60 + i });
      ctx.restore();
    }
    const b = lump(ctx, F, x, y, r * 1.02, r * 1.02, 5, 0.025);
    clay(ctx, F, shade(col, -0.06), b, { lift: 10, seed: 5, spec: 0.5 });
    const pts = [];
    for (let i = 0; i <= 90; i++) { const f = i / 90, a = rot + f * 3.1 * TAU, rr = r * 0.1 + r * 0.8 * f; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
    tube(ctx, F, pts, r * 0.17, col, { lift: 0 });
    if (F.C.night) for (let i = 0; i < 3; i++) { const cb = lump(ctx, F, x + r * [0.3, -0.35, 0.05][i], y + r * [-0.25, 0.2, 0.45][i], r * 0.12, r * 0.1, 70 + i, 0.1); clay(ctx, F, shade(col, -0.18), cb, { lift: 0, alpha: 0.6, spec: 0 }); }
    void u;
  }
  function cloud(ctx, F, x, y, s, seed) {
    const P = [[-0.58, 0.12, 0.4, 0.3], [-0.2, -0.14, 0.5, 0.42], [0.25, -0.06, 0.46, 0.38], [0.62, 0.14, 0.34, 0.26], [0.02, 0.16, 0.6, 0.3]];
    ctx.beginPath();
    P.forEach(([px, py, rx, ry], i) => lump(ctx, F, x + px * s, y + py * s, rx * s, ry * s, seed + i, 0.05, false));
    clay(ctx, F, F.C.cloud, { x: x - 1.0 * s, y: y - 0.6 * s, w: 2 * s, h: 1.05 * s }, { lift: 9, sa: 0.45, seed, speck: 0.6 });
  }
  function windmill(ctx, F, x, y, s, rot) {
    const C = F.C, u = F.u;
    closed(ctx, [[x - 0.22 * s, y], [x + 0.22 * s, y], [x + 0.13 * s, y - 1.05 * s], [x - 0.13 * s, y - 1.05 * s]]);
    clay(ctx, F, shade(C.slab, -0.06), { x: x - 0.22 * s, y: y - 1.05 * s, w: 0.44 * s, h: 1.05 * s }, { lift: 5, seed: 81 });
    let b = lump(ctx, F, x, y - 0.24 * s, 0.07 * s, 0.11 * s, 82, 0.06); clay(ctx, F, shade(C.post, -0.3), b, { lift: 0 });
    b = lump(ctx, F, x, y - 1.08 * s, 0.2 * s, 0.13 * s, 83, 0.06); clay(ctx, F, C.clays[0], b, { lift: 3, seed: 83 });
    ctx.save(); ctx.translate(x, y - 1.06 * s); ctx.rotate(rot);
    for (let i = 0; i < 4; i++) {
      ctx.save(); ctx.rotate((i * TAU) / 4);
      tube(ctx, F, [[0, 0], [0, -0.72 * s]], 0.05 * s, C.post, { lift: 2 });
      slab(ctx, F, 0.02 * s, -0.7 * s, 0.17 * s, 0.48 * s, 0.04 * s, 84 + i, 0.4); clay(ctx, F, C.slab, { x: 0.02 * s, y: -0.7 * s, w: 0.17 * s, h: 0.48 * s }, { lift: 2, seed: 84 + i, speck: 0.5 });
      ctx.restore();
    }
    b = lump(ctx, F, 0, 0, 0.07 * s, 0.07 * s, 89, 0.05); clay(ctx, F, C.acc, b, { lift: 2 });
    ctx.restore();
    void u;
  }
  function flower(ctx, F, x, y, h, col, seed) {
    const u = F.u, sway = Math.sin(F.ts * 1.7 + seed * 1.3) * 0.08 + bo(F, seed) * 0.01;
    const hx = x + Math.sin(sway) * h, hy = y - Math.cos(sway) * h;
    tube(ctx, F, [[x, y], [x + Math.sin(sway) * h * 0.4 + 4 * u, y - h * 0.5], [hx, hy]], 9 * u, F.C.leaf, { lift: 3 });
    ctx.save(); ctx.translate(x + Math.sin(sway) * h * 0.35, y - h * 0.38); ctx.rotate(-0.7 + sway);
    let b = lump(ctx, F, h * 0.12, 0, h * 0.14, h * 0.055, seed + 1, 0.06); clay(ctx, F, F.C.leaf, b, { lift: 2, seed });
    ctx.restore();
    const r = h * 0.17;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + sway * 2;
      b = lump(ctx, F, hx + Math.cos(a) * r, hy + Math.sin(a) * r, r * 0.72, r * 0.6, seed + 10 + i, 0.08); clay(ctx, F, col, b, { lift: 3, seed: seed + i, speck: 0.6 });
    }
    b = lump(ctx, F, hx, hy, r * 0.62, r * 0.6, seed + 20, 0.06); clay(ctx, F, F.C.clays[2], b, { lift: 2, seed, score: 0 });
  }
  function butterfly(ctx, F, x, y, s, col, phase) {
    const flap = 0.22 + 0.78 * Math.abs(Math.sin((F.ts + phase) * 9));
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(x, y); ctx.scale(side * flap, 1);
      let b = lump(ctx, F, s * 0.55, -s * 0.32, s * 0.55, s * 0.45, 90 + side, 0.06); clay(ctx, F, col, b, { lift: 4, seed: 91 });
      b = lump(ctx, F, s * 0.42, s * 0.34, s * 0.36, s * 0.32, 92 + side, 0.06); clay(ctx, F, shade(col, -0.1), b, { lift: 3, seed: 93 });
      b = lump(ctx, F, s * 0.62, -s * 0.36, s * 0.16, s * 0.14, 94, 0.08); clay(ctx, F, F.C.slab, b, { lift: 0, spec: 0, speck: 0.4 });
      ctx.restore();
    }
    tube(ctx, F, [[x, y - s * 0.45], [x, y + s * 0.5]], s * 0.2, shade(col, -0.55), { lift: 2 });
  }
  function confetti(ctx, F, n, seedBase, age) {
    const { W, H, u, C } = F;
    for (let i = 0; i < n; i++) {
      const s = seedBase + i * 1.618;
      const a = clamp((age - hash(s + 3) * 0.5) * 3);
      if (a <= 0) continue;
      const sp = (110 + hash(s + 1) * 150) * u;
      const y = mod(hash(s + 2) * H * 1.3 + F.ts * sp, H * 1.3) - H * 0.15;
      const x = hash(s) * W + Math.sin(F.ts * 2.2 + s) * 22 * u;
      const col = i % 5 === 0 ? C.acc : C.clays[i % C.clays.length];
      ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y); ctx.rotate(F.ts * (1 + hash(s + 4) * 3) + s);
      if (i % 3 === 0) tube(ctx, F, [[-12 * u, 0], [-4 * u, -6 * u], [4 * u, 6 * u], [12 * u, 0]], 8 * u, col, { lift: 3 });
      else { const b = lump(ctx, F, 0, 0, 12 * u, 7 * u, s, 0.1); clay(ctx, F, col, b, { lift: 4, seed: i, speck: 0.5 }); }
      ctx.restore();
    }
  }
  function sparkle(ctx, F, x, y, r, col, seed) {
    const q = 0.55 + 0.45 * Math.sin(F.ts * 5 + seed * 2);
    ctx.save(); ctx.translate(x, y); ctx.rotate(seed + F.ts * 0.6); ctx.scale(q, q);
    const pts = [];
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU, rr = i % 2 ? r * 0.36 : r; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
    closed(ctx, pts);
    clay(ctx, F, col, { x: -r, y: -r, w: r * 2, h: r * 2 }, { lift: 4, seed, speck: 0.5 });
    ctx.restore();
  }
  // A flat clay tag with a pressed hole (where a string or leader ties on) and words.
  function tagCard(ctx, F, x, y, label, o = {}) {
    const u = F.u, C = F.C, size = o.size || 44 * u, h = o.h || 86 * u;
    const lead = o.lead || 0;
    const maxText = (o.maxW || 1e5) - lead - 84 * u;
    let tw = typeW(label, size);
    const fs = tw > maxText ? Math.max(42 * u, size * maxText / tw) : size;
    tw = typeW(label, fs);
    const w = lead + tw + 84 * u;
    const col = o.col || C.slab;
    slab(ctx, F, x, y, w, h, Math.min(26 * u, h / 2), o.seed || 7, 0.7);
    clay(ctx, F, col, { x, y, w, h }, { lift: o.lift ?? 10, seed: o.seed || 7, thumb: true });
    const hb = lump(ctx, F, x + 24 * u, y + h / 2, 9 * u, 9 * u, (o.seed || 7) + 2, 0.08);
    clay(ctx, F, shade(col, -0.45), hb, { lift: 0, spec: 0, speck: 0 });
    if (o.badge !== undefined) {
      const bb = lump(ctx, F, x + 46 * u + lead / 2 - 4 * u, y + h / 2, lead / 2 - 6 * u, lead / 2 - 6 * u, (o.seed || 7) + 4, 0.05);
      clay(ctx, F, C.acc, bb, { lift: 4, seed: (o.seed || 7) + 4 });
      ctext(ctx, F, o.badge, x + 46 * u + lead / 2 - 4 * u, y + h / 2 + 2 * u, 42 * u, C.onAcc, { seed: 3 });
    }
    ctext(ctx, F, label, x + 46 * u + lead + tw / 2, y + h / 2 + 2 * u, fs, o.ink || C.tagInk, { seed: o.seed || 7 });
    return { w, h, hole: [x + 24 * u, y + h / 2] };
  }

  // ---- the set ------------------------------------------------------------------------------------
  function ridge(x, P, base, amp, fs, seed) {
    const ws = [0.55, 0.3, 0.18, 0.09];
    let y = base;
    for (let i = 0; i < fs.length; i++) y += amp * ws[i] * Math.sin((TAU * fs[i] * x) / P + hash(seed + i) * TAU);
    return y;
  }
  const BAKED = {};
  function baked(F, name) {
    const key = [name, F.W, F.H, JSON.stringify(F.S.look.clay || BASE), F.tex.toFixed(2)].join("|");
    if (BAKED[key]) return BAKED[key];
    for (const k of Object.keys(BAKED)) if (k.startsWith(name + "|")) delete BAKED[k];
    return (BAKED[key] = name === "sky" ? bakeSky(F) : bakeHill(F, name));
  }
  function finishBake(c, m, w, h, blur) {
    const out = canvas(w, h), o = out.getContext("2d");
    if (blur > 0) o.filter = `blur(${blur.toFixed(1)}px)`;
    o.drawImage(c, -m, 0);
    return out;
  }
  function bakeSky(F) {
    const { W, H, u, C } = F, F0 = { ...F, step: 0 };
    const Hs = Math.ceil(H * 0.84), m = Math.ceil(8 * u) + 4;
    const c = canvas(W + 2 * m, Hs), g = c.getContext("2d");
    g.translate(m, 0);
    const lg = g.createLinearGradient(0, 0, 0, Hs);
    lg.addColorStop(0, rgba(C.skyTop)); lg.addColorStop(0.7, rgba(C.skyBot)); lg.addColorStop(1, rgba(C.skyBot));
    g.fillStyle = lg; g.fillRect(-m, 0, W + 2 * m, Hs);
    const r = rng(101);
    g.lineCap = "round";
    // Thumb-smeared plasticine: short curved swipes, some lighter, some darker than the base.
    for (let i = 0; i < 720; i++) {
      const x = r() * W, y = r() * Hs, len = (40 + r() * 120) * u, wd = (8 + r() * 22) * u, a = (r() - 0.5) * 0.6, bend = (r() - 0.5) * 0.7;
      const base = mix(C.skyTop, C.skyBot, clamp(y / (Hs * 0.7)));
      const col = shade(base, r() < 0.5 ? 0.2 : -0.08);
      g.strokeStyle = rgba(col, (0.05 + r() * 0.08) * (0.35 + 0.65 * F.tex)); g.lineWidth = wd;
      for (const dx of [-W, 0, W]) {
        const xx = x + dx;
        if (xx < -m - len || xx > W + m + len) continue;
        g.beginPath(); g.moveTo(xx - (Math.cos(a) * len) / 2, y - (Math.sin(a) * len) / 2);
        g.quadraticCurveTo(xx, y - bend * len * 0.3, xx + (Math.cos(a) * len) / 2, y + (Math.sin(a) * len) / 2); g.stroke();
      }
    }
    for (let i = 0; i < 26; i++) { const x = r() * W, y = r() * Hs * 0.8; for (const dx of [-W, 0, W]) thumb(g, F0, x + dx, y, (20 + r() * 30) * u, i * 7 + 3, 0.5); }
    if (C.night) for (let i = 0; i < 80; i++) {
      const x = r() * W, y = r() * Hs * 0.55, s = (1.4 + r() * 2.6) * u;
      for (const dx of [-W, 0, W]) { g.beginPath(); g.arc(x + dx, y, s, 0, TAU); g.fillStyle = `rgba(255,240,210,${0.35 + r() * 0.5})`; g.fill(); }
    }
    g.globalAlpha = F.tex * 0.3; g.fillStyle = pattern(g); g.fillRect(-m, 0, W + 2 * m, Hs); g.globalAlpha = 1;
    return { canvas: finishBake(c, m, W, Hs, 1.6 * u), top: 0, P: W };
  }
  function hillSpec(F, name) {
    const { H, u, C, tall, G0 } = F;
    if (name === "far") return { base: H * (tall ? 0.6 : 0.565), amp: 46 * u, fs: [2, 3, 5, 8], seed: 11, col: C.far, blur: 3.2 * u, decor: 50 * u };
    if (name === "mid") return { base: H * (tall ? 0.705 : 0.685), amp: 30 * u, fs: [1, 3, 4, 7], seed: 23, col: C.mid, blur: 1.4 * u, decor: 160 * u };
    return { base: G0, amp: 7 * u, fs: [2, 5, 9, 13], seed: 37, col: C.front, blur: 0, decor: 40 * u };
  }
  function bakeHill(F, name) {
    const { W, H, u, C } = F, F0 = { ...F, step: 0 };
    const S = hillSpec(F, name), P = 2 * W;
    const ry = (x) => ridge(x, P, S.base, S.amp, S.fs, S.seed);
    const m = S.blur ? Math.ceil(S.blur * 4) + 6 : 0;
    const top = Math.max(0, Math.floor(S.base - S.amp * 1.2 - S.decor - 20 * u));
    const c = canvas(P + 2 * m, H - top), g = c.getContext("2d");
    g.translate(m, -top);
    const col = S.col;
    const body = () => { g.beginPath(); g.moveTo(-m - 4, H + 4); for (let x = -m - 4; x <= P + m + 8; x += 6 * u) g.lineTo(x, ry(x)); g.lineTo(P + m + 8, H + 4); g.closePath(); };
    body();
    g.fillStyle = rgba(col); g.fill();
    g.save(); body(); g.clip();
    const lg = g.createLinearGradient(0, S.base - S.amp, 0, H);
    lg.addColorStop(0, rgba(shade(col, 0.12))); lg.addColorStop(0.3, rgba(col, 0)); lg.addColorStop(1, rgba(shade(col, -0.3), 0.85));
    g.fillStyle = lg; g.fillRect(-m, top, P + 2 * m, H - top);
    const r = rng(S.seed * 7 + 1);
    // Smears and thumbprints pressed into the hillside.
    g.lineCap = "round";
    for (let i = 0; i < (name === "front" ? 260 : 140); i++) {
      const x = r() * P, y0 = ry(x), y = y0 + 16 * u + r() * (H - y0), len = (30 + r() * 90) * u, a = (r() - 0.5) * 0.5;
      g.strokeStyle = rgba(shade(col, r() < 0.5 ? 0.16 : -0.14), 0.07 + r() * 0.07); g.lineWidth = (6 + r() * 14) * u;
      for (const dx of [-P, 0, P]) { g.beginPath(); g.moveTo(x + dx - Math.cos(a) * len / 2, y - Math.sin(a) * len / 2); g.quadraticCurveTo(x + dx, y - 8 * u, x + dx + Math.cos(a) * len / 2, y + Math.sin(a) * len / 2); g.stroke(); }
    }
    for (let i = 0; i < (name === "front" ? 30 : 16); i++) { const x = r() * P, y = ry(x) + 30 * u + r() * (H - ry(x) - 30 * u); for (const dx of [-P, 0, P]) thumb(g, F0, x + dx, y, (16 + r() * 26) * u, S.seed + i * 5, 1); }
    if (name === "front") {
      for (let i = 0; i < 70; i++) {
        const x = r() * P, y = ry(x) + 40 * u + r() * (H - ry(x)), l = (10 + r() * 24) * u, a = (r() - 0.5) * 1.4;
        for (const dx of [-P, 0, P]) score(g, F0, { x: x + dx - l, y: y - l, w: l * 2, h: l * 2 }, S.seed + i * 13, 1);
      }
      for (let i = 0; i < 34; i++) {
        const x = r() * P, y = ry(x) + 70 * u + r() * (H - ry(x) - 60 * u), rx = (6 + r() * 14) * u, pc = mix(col, C.clays[i % C.clays.length], 0.35);
        for (const dx of [-P, 0, P]) { const b = lump(g, F0, x + dx, y, rx, rx * 0.7, S.seed + i, 0.1); clay(g, F0, pc, b, { lift: 3, seed: i, speck: 0.6 }); }
      }
    }
    g.globalAlpha = F.tex * 0.5; g.fillStyle = pattern(g); g.fillRect(-m, top, P + 2 * m, H - top); g.globalAlpha = 1;
    g.restore();
    // The rolled lip along the top edge.
    g.save(); body(); g.clip();
    const lip = (dy, w, color, blur) => { g.save(); g.filter = blur ? `blur(${blur}px)` : "none"; g.beginPath(); for (let x = -m - 4; x <= P + m + 8; x += 6 * u) (x === -m - 4 ? g.moveTo : g.lineTo).call(g, x, ry(x) + dy); g.strokeStyle = color; g.lineWidth = w; g.stroke(); g.restore(); };
    lip(5 * u, 10 * u, rgba(shade(col, 0.32), 0.7), 2 * u);
    lip(20 * u, 10 * u, rgba(shade(col, -0.35), 0.22), 5 * u);
    g.restore();
    // What grows on it.
    const at = (x, fn) => { for (const dx of [-P, 0, P]) { const xx = x + dx; if (xx > -m - 200 * u && xx < P + m + 200 * u) fn(xx, ry(x)); } };
    if (name === "far") {
      for (let i = 0; i < 16; i++) {
        const x = r() * P, h = (36 + r() * 34) * u, tc = mix(C.mid, C.far, 0.35);
        at(x, (xx, y) => { tube(g, F0, [[xx, y + 6 * u], [xx, y - h * 0.5]], 5 * u, shade(C.post, 0.1), { lift: 0 }); const b = lump(g, F0, xx, y - h * 0.72, h * 0.3, h * 0.36, i + 3, 0.07); clay(g, F0, tc, b, { lift: 3, seed: i, speck: 0.5 }); });
      }
    } else if (name === "mid") {
      const mills = [P * 0.27, P * 0.78];
      for (let i = 0; i < 12; i++) {
        const x = r() * P;
        if (mills.some((mx) => Math.abs(mx - x) < 140 * u)) continue;
        const s = (30 + r() * 26) * u, bc = shade(C.mid, -0.18);
        at(x, (xx, y) => { g.beginPath(); for (let k = 0; k < 3; k++) lump(g, F0, xx + (k - 1) * s * 0.8, y - s * (k === 1 ? 0.62 : 0.4), s * 0.62, s * 0.55, i * 3 + k, 0.08, false); clay(g, F0, bc, { x: xx - s * 1.4, y: y - s * 1.2, w: s * 2.8, h: s * 1.2 }, { lift: 4, seed: i, speck: 0.6 }); });
      }
      for (let i = 0; i < 8; i++) {
        const x = r() * P;
        if (mills.some((mx) => Math.abs(mx - x) < 160 * u)) continue;
        const h = (90 + r() * 60) * u;
        at(x, (xx, y) => {
          tube(g, F0, [[xx, y + 8 * u], [xx + 3 * u, y - h * 0.4], [xx, y - h * 0.62]], 10 * u, C.post, { lift: 3 });
          g.beginPath(); lump(g, F0, xx, y - h * 0.78, h * 0.26, h * 0.24, i * 5, 0.07, false); lump(g, F0, xx - h * 0.12, y - h * 0.62, h * 0.2, h * 0.17, i * 5 + 1, 0.07, false); lump(g, F0, xx + h * 0.14, y - h * 0.64, h * 0.2, h * 0.17, i * 5 + 2, 0.07, false);
          clay(g, F0, C.leaf, { x: xx - h * 0.34, y: y - h * 1.02, w: h * 0.68, h: h * 0.56 }, { lift: 6, seed: i * 5, thumb: true });
        });
      }
    } else {
      // Clay grass blades along the lip.
      for (let x = 0; x < P; x += 34 * u) {
        const xx0 = x + (r() - 0.5) * 20 * u;
        for (let k = 0; k < 3; k++) {
          const h = (14 + r() * 22) * u, a = (k - 1) * 0.35 + (r() - 0.5) * 0.3, bc = shade(col, r() < 0.5 ? 0.18 : -0.12);
          at(xx0, (xx, y) => { g.save(); g.translate(xx + (k - 1) * 6 * u, y + 6 * u); g.rotate(a); const b = lump(g, F0, 0, -h / 2, h * 0.16, h / 2, k + x, 0.08); clay(g, F0, bc, b, { lift: 2, seed: k, speck: 0.4 }); g.restore(); });
        }
      }
    }
    return { canvas: finishBake(c, m, P, H - top, S.blur), top, P, ry };
  }
  function drawBaked(ctx, F, L, par, jit) {
    const off = mod(F.cam * par, L.P);
    const dy = bo(F, jit) * 0.8 * F.u;
    for (let x = -off; x < F.W; x += L.P) ctx.drawImage(L.canvas, Math.round(x), L.top + dy);
  }

  function world(ctx, F) {
    const { W, H, u, C, cam, tall } = F;
    const sky = baked(F, "sky");
    drawBaked(ctx, F, sky, 0.04, 1);
    if (C.night) for (let i = 0; i < 14; i++) {
      const x = mod(hash(i + 400) * W - cam * 0.04, W), y = hash(i + 410) * H * 0.42, tw = 0.5 + 0.5 * Math.sin(F.ts * (2 + hash(i) * 3) + i);
      ctx.beginPath(); ctx.arc(x, y, (2.5 + tw * 2.5) * u, 0, TAU); ctx.fillStyle = `rgba(255,236,190,${0.4 + tw * 0.5})`; ctx.fill();
    }
    coilSun(ctx, F, W * (tall ? 0.83 : 0.9) - cam * 0.012, H * (tall ? 0.205 : 0.12), (tall ? 82 : 100) * u, C.sun, F.ts * 0.22);
    for (let i = 0; i < 5; i++) {
      const span = W + 760 * u;
      const x = mod(hash(i + 20) * span + F.t * (9 + i * 5) * u - cam * 0.1, span) - 380 * u;
      const y = H * (tall ? 0.06 + hash(i + 30) * 0.24 : 0.08 + hash(i + 30) * 0.3);
      cloud(ctx, F, x, y, (80 + hash(i + 40) * 70) * u, 200 + i * 9);
    }
    const far = baked(F, "far");
    drawBaked(ctx, F, far, 0.22, 2);
    const mid = baked(F, "mid");
    drawBaked(ctx, F, mid, 0.5, 3);
    const off = mod(cam * 0.5, mid.P);
    // The windmills duck down behind the hill while the chart station is in view, so no data label
    // ever sits over scenery.
    let sink = 0;
    if (F.plan) {
      const kc = F.plan.shown.findIndex((s) => s.id === "chart");
      if (kc >= 0) sink = eio(clamp(1.3 - (Math.abs(kc * W - cam) / W) * 1.7));
    }
    if (sink < 1) {
      ctx.save(); ctx.filter = `blur(${(1.1 * u).toFixed(1)}px)`;
      const ws = (tall ? 96 : 108) * u;
      for (const wx of [mid.P * 0.27, mid.P * 0.78]) for (const k of [-1, 0, 1]) {
        const sx = wx - off + k * mid.P;
        if (sx < -200 * u || sx > W + 200 * u) continue;
        const gy = mid.ry(wx) + 6 * u;
        ctx.save();
        if (sink > 0) { ctx.beginPath(); ctx.rect(sx - ws * 1.2, 0, ws * 2.4, gy + 4 * u); ctx.clip(); }
        windmill(ctx, F, sx, gy + sink * ws * 1.9, ws, F.ts * 0.9 + wx);
        ctx.restore();
      }
      ctx.restore();
    }
    const front = baked(F, "front");
    drawBaked(ctx, F, front, 1, 4);
    // Flowers at the seams between stations, framing each one at rest.
    for (let k = Math.floor((cam - W) / W); k <= Math.ceil((cam + 2 * W) / W); k++) {
      const sx = k * W - cam;
      if (sx < -W * 0.2 || sx > W * 1.2) continue;
      flower(ctx, F, sx + 58 * u, F.G0 + 4 * u, (tall ? 120 : 130) * u, C.clays[mod(k * 2, 6)], 300 + k * 7);
      flower(ctx, F, sx - 54 * u, F.G0 + 6 * u, (tall ? 96 : 104) * u, C.clays[mod(k * 2 + 3, 6)], 320 + k * 7);
    }
    // Two butterflies loop over the field, flapping on twelves (the stations carry their own on the stage).
    if (!F.plan) for (let i = 0; i < 2; i++) {
      const bx = W * (0.25 + 0.5 * i) + Math.sin(F.ts * 0.45 + i * 3) * W * 0.2 - mod(cam * 0.15, W * 0.3) * 0;
      const by = H * (tall ? 0.215 : 0.29) + Math.sin(F.ts * 1.3 + i * 2) * 34 * u + Math.sin(F.ts * 3.1 + i) * 8 * u;
      butterfly(ctx, F, bx, by, (tall ? 24 : 26) * u, i ? C.clays[3] : C.acc, i * 0.37);
    }
    if (C.night) for (let i = 0; i < 12; i++) {
      const x = mod(hash(i + 500) * W + Math.sin(F.ts * 0.7 + i) * 60 * u, W), y = F.G0 - 30 * u - hash(i + 510) * H * 0.25 + Math.sin(F.ts * 1.1 + i * 2) * 20 * u;
      const a = 0.4 + 0.6 * Math.abs(Math.sin(F.ts * 1.7 + i));
      const g = ctx.createRadialGradient(x, y, 0, x, y, 16 * u);
      g.addColorStop(0, `rgba(255,236,160,${a})`); g.addColorStop(1, "rgba(255,236,160,0)");
      ctx.fillStyle = g; ctx.fillRect(x - 16 * u, y - 16 * u, 32 * u, 32 * u);
    }
  }
  // Out-of-focus pebbles in the very front, a vignette and the slight exposure flicker of stop motion.
  function finishPass(ctx, F) {
    const { W, H, u, C, cam } = F;
    ctx.save();
    ctx.filter = `blur(${(9 * u).toFixed(1)}px)`;
    for (let i = 0; i < 3; i++) {
      const span = W * 2.4, sx = mod(W * (0.04 + i * 0.83) - cam * 1.3, span) - W * 0.35;
      if (sx < -300 * u || sx > W + 300 * u) continue;
      const b = lump(ctx, F, sx, H + 70 * u, (130 + i * 30) * u, 110 * u, 700 + i, 0.06);
      clay(ctx, F, shade(C.front, -0.25 + i * 0.1), b, { lift: 0, speck: 0, spec: 0.6 });
    }
    ctx.restore();
    const v = ctx.createRadialGradient(W / 2, H * 0.46, Math.min(W, H) * 0.35, W / 2, H * 0.5, Math.hypot(W, H) * 0.62);
    v.addColorStop(0, rgba(C.shadow, 0)); v.addColorStop(1, rgba(C.shadow, 0.34));
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    const fl = bo(F, 999) * 0.022 * F.tex;
    ctx.fillStyle = fl > 0 ? `rgba(255,246,230,${fl})` : `rgba(30,14,20,${-fl})`;
    ctx.fillRect(0, 0, W, H);
  }

  // ---- plan and camera -----------------------------------------------------------------------------
  const DEF = {
    kicker: "How DreamCut works", title: "Your agent drafts. You decide.",
    chart_title: "Edits reviewed this week", bar_1_label: "Mon", bar_2_label: "Tue", bar_3_label: "Wed", bar_4_label: "Thu",
    bar_1: 12, bar_2: 19, bar_3: 27, bar_4: 41, chart_suffix: "", highlight: "4",
    device: "laptop", callout_1: "Live preview", callout_2: "The proposed clip", callout_3: "Your original track",
    people_count: 4, badge_1: "Editor", badge_2: "Producer", badge_3: "Client",
    step_1: "Read the cut", step_2: "Draft the change", step_3: "You approve",
    before_label: "Re-prompts", before_value: 9, after_label: "Dial changes", after_value: 2, compare_suffix: "",
    object_title: "Every change lands as a card", people_title: "The whole team can review",
    process_title: "From idea to applied edit", compare_title: "Tune instead of re-prompting", closing: "Nothing lands without your OK.",
    title_hold: 2.4, chart_hold: 3.4, object_hold: 3.6, people_hold: 3.2, process_hold: 3.6, compare_hold: 3.2, closing_hold: 2.4, change: 0.45,
  };
  let PLAN = null;
  function getPlan() {
    const c = Object.assign({}, DEF, (window.__dreamcut && window.__dreamcut.controls) || {});
    const key = JSON.stringify(c);
    if (PLAN && PLAN.key === key) return PLAN;
    const order = ["title", "chart", "object", "people", "process", "compare", "closing"];
    let s = 0;
    const shown = [];
    for (const id of order) { const hold = Number(c[id + "_hold"]) || 0; if (hold > 0) shown.push({ id, start: s, hold }); s += hold; }
    const data = {
      chart: { labels: [c.bar_1_label, c.bar_2_label, c.bar_3_label, c.bar_4_label], values: [c.bar_1, c.bar_2, c.bar_3, c.bar_4].map((v) => Number(v) || 0), suffix: c.chart_suffix, prefix: "", highlight: Number(c.highlight) - 1 },
      object: { kind: c.device, callouts: [c.callout_1, c.callout_2, c.callout_3] },
      people: { count: Number(c.people_count) || 4, badges: [c.badge_1, c.badge_2, c.badge_3], highlight: 1 },
      process: { steps: [c.step_1, c.step_2, c.step_3] },
      compare: { left: c.before_label, leftValue: Number(c.before_value) || 0, right: c.after_label, rightValue: Number(c.after_value) || 0, suffix: c.compare_suffix, prefix: "" },
      title: { text: c.title, kicker: c.kicker }, closing: { text: c.closing },
    };
    for (const id of ["chart", "object", "people", "process", "compare"]) data[id].head = c[id + "_title"];
    return (PLAN = { key, shown, data, length: s, change: Number(c.change) || 0.45 });
  }
  // The dolly rests on a station through its hold and glides one frame-width to the next across each change.
  function camAt(plan, t, W) {
    let x = 0;
    const g0 = clamp(plan.change, 0.3, 0.6), g1 = 0.3;
    for (let k = 1; k < plan.shown.length; k++) { const b = plan.shown[k].start; x += W * eio(seg(t, b - g0, b + g1)); }
    return x;
  }
  function frame(S, t, cam, plan) {
    const u = S.u, W = S.W, H = S.H, tall = S.tall;
    const side = (tall ? 90 : 140) * u;
    const box = tall ? { x: side, y: H * 0.22, w: W - side * 2, h: H * 0.68 } : { x: side, y: H * 0.28, w: W - side * 2, h: H * 0.64 };
    const G0 = H * (tall ? 0.85 : 0.82);
    const step = Math.floor(t * 12 + 1e-6);
    return { S, u, W, H, tall, t, step, ts: step / 12, C: theme(S), tex: S.look.texture ?? 1, side, box, G0, base: G0 + 14 * u, plan, cam };
  }

  // ---- the sky line: bunting and hanging signs -------------------------------------------------------
  function buntY(F, x) { const { W, u, tall } = F; const f = clamp(x / W, -0.1, 1.1); return (tall ? 24 : 12) * u + (tall ? 40 : 42) * u * 4 * f * (1 - f); }
  // A string of clay pennants across the top of each station, fluttering on twelves.
  function bunting(ctx, F, k) {
    const { W, u, C } = F;
    const pts = [];
    for (let i = 0; i <= 24; i++) { const x = -40 * u + ((W + 80 * u) * i) / 24; pts.push([x, buntY(F, x)]); }
    const n = Math.max(6, Math.round(W / (104 * u)));
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) * W) / n, y = buntY(F, x) + 2 * u;
      const a = Math.sin(F.ts * 2.4 + i * 0.9 + k * 1.7) * 0.13 + bo(F, 850 + i) * 0.02;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      const pw = 30 * u, ph = 64 * u;
      closed(ctx, [[-pw, -3 * u], [0, -7 * u], [pw, -3 * u], [pw * 0.5, ph * 0.5], [0, ph], [-pw * 0.5, ph * 0.5]]);
      clay(ctx, F, C.clays[mod(i * 2 + k, C.clays.length)], { x: -pw, y: 0, w: pw * 2, h: ph }, { lift: 6, seed: 860 + i, thumb: i % 2 === 0 });
      ctx.restore();
    }
    tube(ctx, F, pts, 7 * u, shade(C.post, 0.15), { lift: 4, speck: 0.6 });
  }
  // Where a station's headline hangs: a clay plank on two cords from the bunting line.
  function headLayout(F, text) {
    if (!String(text || "").trim()) return null;
    const { u, W, H, tall, side } = F;
    const padX = 56 * u, padY = 24 * u, maxW = W - side * 2 - padX * 2 + (tall ? 70 * u : 0);
    let T = fitType(text, (tall ? 84 : 90) * u, 66 * u, maxW, tall ? 2 : 1);
    if (T.lines.length > (tall ? 2 : 1)) T = fitType(text, (tall ? 76 : 80) * u, 66 * u, maxW, tall ? 3 : 2);
    const lh = T.size * 1.12, w = T.w + padX * 2, h = lh * T.lines.length + padY * 2;
    return { ...T, lh, w, h, x: (W - w) / 2, y: (tall ? 0.07 : 0.115) * H, padY };
  }
  function headSign(ctx, F, st, L) {
    const { u, C } = F;
    const hl = st.since;
    if (!L || hl <= 0) return;
    const drop = eo(seg(hl, 0, 0.4));
    const offY = -(1 - drop) * (L.y + L.h + 80 * u);
    const swing = Math.sin(hl * 6.2) * 0.05 * Math.exp(-hl * 2.2) + Math.sin(F.ts * 1.2 + st.k) * 0.007;
    const px = L.x + L.w / 2, py = buntY(F, px);
    ctx.save(); ctx.translate(px, py + offY); ctx.rotate(swing); ctx.translate(-px, -py);
    for (const f of [0.12, 0.88]) {
      const rx = L.x + L.w * f;
      tube(ctx, F, [[rx, buntY(F, rx) - offY - 4 * u], [rx + bo(F, 870 + f * 9) * 0.6 * u, L.y + 16 * u]], 7 * u, shade(C.post, 0.15), { lift: 3 });
    }
    const sb = slab(ctx, F, L.x, L.y, L.w, L.h, Math.min(36 * u, L.h / 2), 880 + st.k, 0.8);
    clay(ctx, F, C.slab, sb, { lift: 16, thumb: true, seed: 880 + st.k, score: 3 });
    const ins = 11 * u;
    tube(ctx, F, slabPts(F, L.x + ins, L.y + ins, L.w - ins * 2, L.h - ins * 2, Math.min(26 * u, L.h / 2 - ins), 881 + st.k, 0.5), 8 * u, shade(C.clays[mod(st.k * 2 + 1, 6)], -0.05), { closed: true, lift: 2 });
    for (const f of [0.12, 0.88]) { const b = lump(ctx, F, L.x + L.w * f, L.y + 16 * u, 12 * u, 12 * u, 890 + f * 10, 0.08); clay(ctx, F, C.post, b, { lift: 3, seed: 890 }); }
    const cols = typeCols(F, C.slab);
    const n = L.lines.join("").replace(/\s/g, "").length, gap = Math.min(0.032, 0.6 / Math.max(1, n));
    let idx = 0;
    L.lines.forEach((line, j) => {
      clayType(ctx, F, line, L.x + L.w / 2, L.y + L.padY + L.lh * (j + 0.5), L.size, { cols, seed: 900 + st.k * 37 + j * 11, time: hl - 0.02, gap, idx0: idx });
      idx += line.replace(/\s/g, "").length;
    });
    ctx.restore();
  }

  // ---- statement stations (title, closing) ---------------------------------------------------------
  function statementStation(ctx, F, st) {
    const { u, C, W, H, base, tall, side } = F;
    const closing = st.id === "closing", d = st.d;
    bunting(ctx, F, st.k);
    const padX = 64 * u, padY = 50 * u;
    const maxW = tall ? W - side * 2 - padX * 2 + 60 * u : Math.min(W - side * 2 - padX * 2, W * 0.58);
    const T = fitType(d.text || "", (tall ? 116 : 132) * u, 66 * u, maxW, tall ? 4 : 2);
    const lh = T.size * 1.08;
    const kick = closing ? "" : String(d.kicker || "").trim().toUpperCase();
    const card = { w: T.w + padX * 2, h: lh * T.lines.length + padY * 2 };
    card.x = tall ? (W - card.w) / 2 : side - padX * 0.4;
    card.y = clamp(H * (tall ? 0.4 : 0.53) - card.h / 2, H * (tall ? 0.2 : 0.25), base - card.h - 70 * u);
    const local = Math.max(0, st.since), here = st.since > 0;
    const cardR = card.x + card.w, below = base - (card.y + card.h);
    const room = W - cardR - side * 0.4;
    if (closing) confetti(ctx, F, 26, 900, here ? local : 0);
    // Butterflies loop through the open sky beside the board, flapping on twelves.
    for (let i = 0; i < 2; i++) {
      const bx = (tall ? W * (0.3 + 0.4 * i) : lerp(cardR + 60 * u, W - side * 0.6, 0.25 + 0.5 * i)) + Math.sin(F.ts * 0.5 + i * 3) * (tall ? W * 0.15 : 90 * u);
      const by = (tall ? H * 0.15 : H * 0.3) + Math.sin(F.ts * 1.3 + i * 2) * 34 * u + Math.sin(F.ts * 3.1 + i) * 8 * u;
      butterfly(ctx, F, bx, by, (tall ? 26 : 30) * u, i ? C.clays[3] : C.acc, i * 0.37);
    }
    // A small friend peeks out from behind the sign.
    const peekH = clamp(below + 150 * u, 170 * u, 250 * u);
    const peekX = room > 330 * u ? card.x + 120 * u : cardR - 120 * u;
    lumpling(ctx, F, peekX, base, peekH, { col: C.clays[closing ? 4 : 1], k: closing ? 4 : 0, arms: closing ? "cheer" : "down", look: closing ? 0 : 0.7, lookY: -0.8, blink: mod(F.ts + 0.4, 3.1) < 0.12, open: closing });
    // The board is pressed down onto its posts by hand: it drops, squashes, wobbles out and keeps a slow sway.
    if (here) {
      const fallT = 0.28;
      const dropY = local < fallT ? -Math.pow(1 - local / fallT, 2) * (card.y + card.h + 140 * u) : 0;
      const pr = seg(local, fallT, fallT + 0.8), wv = local >= fallT && pr < 1 ? Math.sin(pr * Math.PI * 3) * (1 - pr) : 0;
      const bsy = 1 - 0.16 * wv, bsx = 1 + 0.12 * wv, sway = Math.sin(F.ts * 1.3 + st.k) * 0.007;
      const cx = card.x + card.w / 2, by = card.y + card.h;
      if (below > 20 * u) for (const f of [0.16, 0.84]) {
        const px = card.x + card.w * f;
        contact(ctx, F, px, base + 4 * u, 34 * u, 9 * u, 0.4);
        tube(ctx, F, [[px, by - 30 * u + Math.max(0, wv) * 8 * u], [px + bo(F, f * 10) * u, base + 6 * u]], 30 * u, C.post, { lift: 6 });
      }
      ctx.save();
      ctx.translate(cx, by + dropY); ctx.rotate(sway); ctx.scale(bsx, bsy); ctx.translate(-cx, -by);
      slab(ctx, F, card.x, card.y, card.w, card.h, 40 * u, closing ? 91 : 17, 0.8);
      clay(ctx, F, C.slab, card, { lift: 18, thumb: true, seed: closing ? 91 : 17, score: 3 });
      const ins = 17 * u;
      tube(ctx, F, slabPts(F, card.x + ins, card.y + ins, card.w - ins * 2, card.h - ins * 2, 26 * u, 5, 0.6), 15 * u, closing ? C.clays[4] : C.acc, { closed: true, lift: 3 });
      [[card.x + ins, card.y + ins], [cardR - ins, card.y + ins], [card.x + ins, card.y + card.h - ins], [cardR - ins, card.y + card.h - ins]].forEach(([x, y], i) => {
        const b = lump(ctx, F, x, y, 15 * u, 15 * u, 40 + i, 0.08); clay(ctx, F, C.clays[(i + 2) % 6], b, { lift: 4, seed: 40 + i });
      });
      const cols = typeCols(F, C.slab), n = T.lines.join("").replace(/\s/g, "").length, gap = Math.min(0.04, 0.75 / Math.max(1, n));
      let idx = 0;
      T.lines.forEach((line, j) => {
        clayType(ctx, F, line, card.x + padX, card.y + padY + lh * (j + 0.5), T.size, { align: "left", cols, seed: (closing ? 500 : 300) + j * 13, time: local + 0.1, gap, idx0: idx });
        idx += line.replace(/\s/g, "").length;
      });
      // The kicker: a clay luggage tag tied to the board's corner, swinging in after the board lands.
      if (kick) {
        const kq = pop(seg(local, 0.32, 0.62));
        if (kq > 0) {
          const kx = card.x + 34 * u, ky = card.y - 66 * u, kh = 96 * u;
          const hole = [kx + 24 * u, ky + kh / 2];
          const pin = [card.x + 30 * u, card.y + 26 * u];
          const ka = -0.045 + 0.14 * Math.sin((local - 0.32) * 7) * Math.exp(-Math.max(0, local - 0.32) * 2.4) + Math.sin(F.ts * 1.6) * 0.012;
          tube(ctx, F, [pin, [lerp(pin[0], hole[0], 0.5) - 8 * u, lerp(pin[1], hole[1], 0.5)], hole], 6 * u, C.post, { lift: 2 });
          ctx.save();
          ctx.translate(hole[0], hole[1]); ctx.rotate(ka); ctx.scale(kq, kq); ctx.translate(-hole[0], -hole[1]);
          tagCard(ctx, F, kx, ky, kick, { size: 52 * u, h: kh, col: C.acc, ink: C.onAcc, maxW: Math.max(card.w - 40 * u, W - kx - side * 0.5), seed: 33 });
          ctx.restore();
          const b = lump(ctx, F, pin[0], pin[1], 13 * u, 13 * u, 34, 0.08); clay(ctx, F, C.clays[2], b, { lift: 4, seed: 34 });
        }
      }
      ctx.restore();
    }
    // A bigger character beside the sign, or below it in a tall frame.
    if (room > 330 * u) {
      const h = Math.min(440 * u, base - card.y - 20 * u, room * 1.1);
      const x = cardR + room / 2 + 10 * u;
      if (closing) {
        const ph = mod(F.ts, 1.2) / 1.2, hop = ph < 0.35 ? Math.sin((ph / 0.35) * Math.PI) * h * 0.14 : 0;
        lumpling(ctx, F, x - h * 0.3, base, h * 0.82, { col: C.clays[2], k: 2, arms: "cheer", open: true, lift: hop, sq: ph >= 0.35 && ph < 0.45 ? 0.9 : 1, look: -0.5 });
        const ph2 = mod(F.ts + 0.6, 1.2) / 1.2, hop2 = ph2 < 0.35 ? Math.sin((ph2 / 0.35) * Math.PI) * h * 0.12 : 0;
        lumpling(ctx, F, x + h * 0.32, base, h * 0.7, { col: C.acc, k: 5, arms: "cheer", open: true, lift: hop2, sq: ph2 >= 0.35 && ph2 < 0.45 ? 0.9 : 1, look: -0.8 });
      } else {
        lumpling(ctx, F, x, base, h, { col: C.clays[5], k: 1, arms: "wave", look: -0.6, blink: mod(F.ts, 2.7) < 0.12 });
      }
    } else if (below > 240 * u) {
      const h = Math.min(below + 60 * u, 360 * u);
      const ph = mod(F.ts, 1.3) / 1.3, hop = closing && ph < 0.35 ? Math.sin((ph / 0.35) * Math.PI) * h * 0.12 : 0;
      lumpling(ctx, F, W - side - h * 0.45, base, h, { col: closing ? C.acc : C.clays[5], k: closing ? 5 : 1, arms: closing ? "cheer" : "wave", look: -0.6, open: closing, lift: hop, blink: mod(F.ts, 2.7) < 0.12 });
      if (closing || tall) lumpling(ctx, F, side + h * 0.32, base, h * 0.78, { col: C.clays[2], k: 2, arms: closing ? "cheer" : "down", look: 0.6, open: closing, blink: mod(F.ts + 1.1, 2.9) < 0.12 });
    }
    // The closing earns a rosette on the sign's corner.
    if (closing && here) {
      const rq = pop(seg(local, 0.35, 0.8));
      if (rq > 0) rosette(ctx, F, cardR - 40 * u, card.y + 6 * u, 66 * u * rq, seg(local, 0.6, 1), Math.sin(F.ts * 1.4) * 0.06);
    }
  }
  function rosette(ctx, F, x, y, rr, check, rot) {
    const C = F.C;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    for (const s of [-1, 1]) { slab(ctx, F, s * rr * 0.32 - rr * 0.2, rr * 0.3, rr * 0.4, rr * 1.2, rr * 0.1, 50 + s, 0.5); clay(ctx, F, shade(C.acc, -0.1), { x: s * rr * 0.32 - rr * 0.2, y: rr * 0.3, w: rr * 0.4, h: rr * 1.2 }, { lift: 5, seed: 50 }); }
    ctx.beginPath();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + F.ts * 0.3; lump(ctx, F, Math.cos(a) * rr * 0.78, Math.sin(a) * rr * 0.78, rr * 0.3, rr * 0.3, 60 + i, 0.06, false); }
    clay(ctx, F, C.acc, { x: -rr * 1.1, y: -rr * 1.1, w: rr * 2.2, h: rr * 2.2 }, { lift: 8, seed: 61 });
    const b = lump(ctx, F, 0, 0, rr * 0.7, rr * 0.7, 72, 0.04); clay(ctx, F, C.slab, b, { lift: 4, seed: 72, thumb: true });
    tube(ctx, F, cut([[-rr * 0.32, 0], [-rr * 0.08, rr * 0.24], [rr * 0.36, -rr * 0.26]], check), rr * 0.17, C.clays[4], { lift: 2 });
    ctx.restore();
  }

  // ---- chart: stacked clay pancakes -----------------------------------------------------------------
  function chartStation(ctx, F, st) {
    const { u, C, box: A, base, tall } = F, d = st.d;
    const n = d.values.length, max = Math.max(...d.values.map((v) => Math.abs(v)), 1);
    const slot = A.w / n, sw = Math.min(slot * 0.56, 230 * u);
    const topLimit = A.y + (tall ? 150 : 130) * u;
    const floor = base - 16 * u, avail = floor - topLimit;
    const discH = clamp(avail / 7, 34 * u, 64 * u);
    const hues = [1, 2, 3, 4, 0, 5];
    for (let i = 0; i < n; i++) {
      const x = A.x + slot * (i + 0.5), hot = i === d.highlight;
      const col = hot ? C.acc : C.clays[hues[i % hues.length]];
      const Ht = Math.max(discH * 0.6, avail * Math.max(0, d.values[i]) / max);
      const nd = Math.max(1, Math.round(Ht / discH)), dh = Ht / nd;
      const q = st.gone ? 1 : stag(st.p, i, n, 0.42);
      const landed = q * Math.max(0, nd - 1);
      contact(ctx, F, x, base, sw * 0.8, 14 * u, 0.4);
      const tray = slab(ctx, F, x - sw * 0.66, base - 22 * u, sw * 1.32, 30 * u, 14 * u, 300 + i, 0.6);
      clay(ctx, F, shade(C.slab, -0.1), tray, { lift: 5, seed: 300 + i });
      // Discs are pinched off just under the count and dropped onto the stack, so nothing falls
      // through the number; the number above the settled stack counts each disc as it lands.
      const finalTop = floor - nd * dh;
      const landedR = st.gone ? 1e6 : Math.max(0, ((st.pr - (i / n) * 0.42) / 0.58) * Math.max(0, nd - 1));
      let topY = floor - dh;
      for (let j = 0; j < nd; j++) {
        const f = j === 0 ? 1 : clamp(landed - (j - 1));
        if (f <= 0) break;
        const g = clamp(landedR - j);
        const fallMax = (nd - 1 - j) * dh + dh * 0.25;
        const fall = Math.pow(1 - f, 2) * fallMax;
        const born = j === 0 ? 1 : eo(seg(f, 0, 0.3));
        let sq = f < 1 ? 1.06 : j > 0 && g < 1 ? 1 - 0.22 * Math.sin(g * Math.PI) * (1 - g * 0.5) : 1;
        const rip = Math.pow(Math.max(0, Math.sin(F.ts * 2.2 - j * 0.45 - i * 0.8)), 10) * 0.07;
        sq *= 1 - rip;
        const y = floor - (j + 1) * dh - fall;
        const wob = (hash(i * 31 + j * 7) - 0.5) * sw * 0.09 + bo(F, i * 13 + j) * 0.6 * u;
        const dhh = dh * sq * born, wid = sw * (1 + (1 - sq) * 0.6) * born;
        if (wid < 2) continue;
        const b = slab(ctx, F, x - wid / 2 + wob, y + dh - dhh, wid, dhh * 1.04, Math.min(dhh * 0.48, 22 * u), 500 + i * 40 + j, 0.8);
        clay(ctx, F, shade(col, j % 2 ? 0.08 : -0.03), b, { lift: 7, seed: 500 + i * 40 + j, thumb: j % 3 === 1, score: j % 4 === 2 ? 1 : 0 });
        if (f >= 1) topY = Math.min(topY, y + dh - dhh);
      }
      // The flag on the highlighted stack, planted once it is built.
      if (hot) {
        const fq = st.gone ? 1 : eo(seg(q, 0.88, 1));
        if (fq > 0) {
          const px = x + sw * 0.3, py = topY + 6 * u, top = py - 150 * u * fq;
          tube(ctx, F, [[px, py], [px, top]], 9 * u, C.post, { lift: 4 });
          if (fq > 0.6) {
            const fl = (k) => Math.sin(F.ts * 8 - k * 1.4) * 7 * u * k;
            closed(ctx, [[px + 4 * u, top + 2 * u], [px + 50 * u, top + 10 * u + fl(1)], [px + 96 * u, top + 26 * u + fl(2)], [px + 50 * u, top + 44 * u + fl(1)], [px + 4 * u, top + 54 * u]]);
            clay(ctx, F, C.clays[2], { x: px, y: top, w: 96 * u, h: 56 * u }, { lift: 5, seed: 77 });
          }
          const b = lump(ctx, F, px, top, 10 * u, 10 * u, 78, 0.06); clay(ctx, F, C.acc, b, { lift: 3 });
        }
      }
      if (st.p > 0 || st.gone) {
        const size = hot ? 104 * u : 66 * u;
        const down = Math.min(nd, 1 + Math.floor(landedR + 1e-6));
        const e = clamp((landedR - (down - 1)) * 5), wv = down > 1 && e < 1 ? Math.sin(e * Math.PI) * (1 - e * 0.4) : 0;
        const lx = x - (hot ? sw * 0.08 : 0), ly = finalTop - (hot ? 78 : 50) * u;
        ctx.save(); ctx.translate(lx, ly + size * 0.38); ctx.scale(1 + 0.2 * wv, 1 - 0.24 * wv); ctx.translate(-lx, -(ly + size * 0.38));
        ctext(ctx, F, fmt((d.values[i] * down) / nd, d), lx, ly, size, hot ? C.acc : C.ink, { seed: 40 + i, maxW: slot * 0.9, min: size * 0.7, ripple: hot && q >= 1 });
        ctx.restore();
      }
      // Each day sits on a little pressed plaque so the label reads against the grass.
      const lab = d.labels[i] || "";
      if (lab.trim()) {
        let ls = 44 * u, lw = typeW(lab, ls);
        if (lw > slot * 0.8) { ls = Math.max(42 * u, ls * slot * 0.8 / lw); lw = typeW(lab, ls); }
        const pw = lw + 52 * u, ph = 70 * u, py = base + 62 * u - ph / 2 + Math.sin(F.ts * 1.6 + i * 1.3) * 1.5 * u;
        const pb = slab(ctx, F, x - pw / 2, py, pw, ph, 24 * u, 90 + i, 0.7);
        clay(ctx, F, hot ? shade(C.acc, 0.55) : C.slab, pb, { lift: 8, seed: 90 + i, thumb: i % 2 === 0 });
        ctext(ctx, F, lab, x, py + ph / 2 + 2 * u, ls, C.tagInk, { seed: 60 + i });
      }
      // A friend beside the winning stack, waving it on.
      if (hot && !tall) {
        const roomR = (i === n - 1 ? A.x + A.w + F.side * 0.6 - x : slot / 2) - sw * 0.66;
        if (roomR > 80 * u) {
          const h = Math.min(180 * u, roomR * 1.9);
          lumpling(ctx, F, x + sw * 0.66 + roomR * 0.5, base, h, { col: C.clays[5], k: 3, arms: q >= 1 ? "cheer" : "wave", open: q >= 1, look: -0.8, lookY: -0.8, blink: mod(F.ts + 0.9, 2.6) < 0.12 });
        }
      }
    }
  }

  // ---- object: a clay laptop or phone with toothpick tags ---------------------------------------------
  function miniWorld(ctx, F, R, local) {
    const { u, C } = F;
    ctx.save();
    slab(ctx, F, R.x, R.y, R.w, R.h, 10 * u, 120, 0.4); ctx.clip();
    const g = ctx.createLinearGradient(0, R.y, 0, R.y + R.h);
    g.addColorStop(0, rgba(C.skyTop)); g.addColorStop(1, rgba(C.skyBot));
    ctx.fillStyle = g; ctx.fillRect(R.x, R.y, R.w, R.h);
    coilSun(ctx, F, R.x + R.w * 0.78, R.y + R.h * 0.34, R.h * 0.16, C.sun, F.ts * 0.6);
    let b = lump(ctx, F, R.x + R.w * 0.25, R.y + R.h * 1.02, R.w * 0.42, R.h * 0.36, 121, 0.04); clay(ctx, F, C.mid, b, { lift: 0, seed: 121 });
    b = lump(ctx, F, R.x + R.w * 0.8, R.y + R.h * 1.1, R.w * 0.45, R.h * 0.34, 122, 0.04); clay(ctx, F, C.front, b, { lift: 0, seed: 122 });
    const ph = mod(F.ts, 0.9) / 0.9, hop = Math.sin(ph * Math.PI) * R.h * 0.16;
    for (let i = 0; i < 2; i++) cloud(ctx, F, R.x + R.w * mod(0.2 + i * 0.45 + F.ts * 0.03, 1.2) - R.w * 0.1, R.y + R.h * (0.2 + i * 0.12), R.h * 0.16, 130 + i * 5);
    lumpling(ctx, F, R.x + R.w * (0.3 + 0.25 * Math.sin(F.ts * 0.8)), R.y + R.h * 0.86, R.h * 0.42, { col: C.clays[2], k: 0, arms: "cheer", lift: hop, sq: ph < 0.1 ? 0.88 : 1 });
    if (F.tex > 0) { ctx.globalAlpha = F.tex * 0.35; ctx.fillStyle = pattern(ctx); ctx.fillRect(R.x, R.y, R.w, R.h); ctx.globalAlpha = 1; }
    ctx.restore();
    recess(ctx, F, R, 10 * u, 120, 0.8);
    tube(ctx, F, slabPts(F, R.x - 3 * u, R.y - 3 * u, R.w + 6 * u, R.h + 6 * u, 12 * u, 124, 0.5), 10 * u, shade(C.screen, 0.35), { closed: true, lift: 3, speck: 0.8 });
    void local;
  }
  function screenTracks(ctx, F, R, p, tallAnchors) {
    const { u, C } = F;
    const th = R.h * 0.16, gap = R.h * 0.14;
    const rows = [[[0, 0.27], [0.32, 0.3, true], [0.67, 0.31]], [[0.05, 0.4], [0.5, 0.44]], [[0, 0.22], [0.26, 0.36], [0.66, 0.24]]];
    const centers = [];
    let idx = 0;
    rows.forEach((clips, r) => {
      const y = R.y + th / 2 + r * (th + gap);
      // A groove pressed into the screen clay: dark trough, shadowed upper lip, lit lower lip.
      tube(ctx, F, [[R.x, y], [R.x + R.w, y]], th * 1.3, shade(C.screen, -0.35), { lift: 0, spec: 0 });
      tube(ctx, F, [[R.x + 4 * u, y - th * 0.5], [R.x + R.w - 4 * u, y - th * 0.5]], 4 * u, shade(C.screen, -0.6), { lift: 0, spec: 0, alpha: 0.6 });
      tube(ctx, F, [[R.x + 4 * u, y + th * 0.62], [R.x + R.w - 4 * u, y + th * 0.62]], 4 * u, shade(C.screen, 0.4), { lift: 0, spec: 0.3, alpha: 0.7 });
      clips.forEach(([a, len, hot], ci) => {
        const cq = ci === 0 ? 1 : eo(seg(p, 0.05 + idx * 0.06, 0.35 + idx * 0.06));
        idx++;
        const x1 = R.x + a * R.w + th / 2, x2 = R.x + (a + len) * R.w - th / 2;
        const cc = hot ? C.acc : C.clays[(r * 2 + ci) % 6];
        if (cq > 0) {
          const xe = lerp(x1, x2, cq), bob = hot ? Math.sin(F.ts * 3) * 1.5 * u : 0;
          tube(ctx, F, [[x1, y + bob], [xe, y + bob]], th * 1.05, cc, { lift: 5, speck: 1 });
          for (const ex of [x1, xe]) { const cb = lump(ctx, F, ex, y + bob, th * 0.36, th * 0.4, 141 + r * 7 + ci, 0.1); clay(ctx, F, shade(cc, -0.12), cb, { lift: 2, seed: 141 + ci, speck: 0.6 }); }
          if (xe - x1 > th * 2) score(ctx, F, { x: x1, y: y - th / 2 + bob, w: xe - x1, h: th }, 150 + r * 5 + ci, 2);
        }
        centers.push([(x1 + x2) / 2, y, r, ci]);
      });
    });
    const px = R.x + R.w * mod(F.ts * 0.2 + 0.12, 1) + bo(F, 142) * 0.8 * u;
    contact(ctx, F, px + 6 * u, R.y + R.h * 0.5, 14 * u, R.h * 0.5, 0.25);
    tube(ctx, F, [[px, R.y - th * 0.6], [px, R.y + R.h]], 12 * u, C.acc, { lift: 6, speck: 1 });
    closed(ctx, [[px - 22 * u, R.y - th * 1.25], [px + 22 * u, R.y - th * 1.25], [px + 20 * u, R.y - th * 0.7], [px, R.y - th * 0.25], [px - 20 * u, R.y - th * 0.7]]);
    clay(ctx, F, C.acc, { x: px - 22 * u, y: R.y - th * 1.25, w: 44 * u, h: th }, { lift: 5, seed: 140, thumb: true });
    const pick = (r, ci) => centers.find((c) => c[2] === r && c[3] === ci);
    return tallAnchors ? [pick(0, 1), pick(2, 2)] : [pick(0, 1), pick(2, 1)];
  }
  function objectStation(ctx, F, st) {
    const { u, C, box: A, base, tall } = F, d = st.d, phone = d.kind === "phone";
    const p = st.gone ? 1 : st.p;
    const tagH = 86 * u, tagGap = 26 * u;
    const devTopLimit = tall ? A.y + 10 * u + 3 * tagH + 2 * tagGap + 60 * u : A.y + 20 * u;
    const availH = base - devTopLimit;
    let anchors, devTop;
    if (!phone) {
      const lw = Math.min(tall ? A.w * 0.96 : A.w * 0.54, availH / 0.68);
      const lidH = lw * 0.6, deckH = lw * 0.08;
      const x0 = tall ? A.x + (A.w - lw) / 2 : A.x + A.w * 0.02;
      const top = base - deckH - lidH;
      devTop = top;
      contact(ctx, F, x0 + lw / 2, base, lw * 0.62, 20 * u, 0.42);
      closed(ctx, [[x0 - lw * 0.07, base], [x0 + lw * 0.5, base + 3 * u], [x0 + lw * 1.07, base], [x0 + lw * 1.0, base - deckH], [x0 + lw * 0.5, base - deckH - 2 * u], [x0, base - deckH]]);
      clay(ctx, F, shade(C.device, -0.1), { x: x0 - lw * 0.07, y: base - deckH, w: lw * 1.14, h: deckH }, { lift: 10, seed: 150, score: 2 });
      for (let k = 0; k < 13; k++) {
        const b = lump(ctx, F, x0 + lw * (0.06 + k * 0.073), base - deckH * 0.45, lw * 0.026, deckH * 0.18, 160 + k, 0.1);
        clay(ctx, F, shade(C.device, -0.22), b, { lift: 2, seed: 160 + k, spec: 0.5 });
      }
      slab(ctx, F, x0, top, lw, lidH, 30 * u, 151, 0.8);
      clay(ctx, F, C.device, { x: x0, y: top, w: lw, h: lidH }, { lift: 14, seed: 151, thumb: true, score: 2 });
      const bz = 26 * u;
      slab(ctx, F, x0 + bz, top + bz, lw - bz * 2, lidH - bz * 2, 16 * u, 152, 0.5);
      clay(ctx, F, C.screen, { x: x0 + bz, y: top + bz, w: lw - bz * 2, h: lidH - bz * 2 }, { lift: 0, seed: 152, spec: 0.4, speck: 0.9, thumb: true });
      recess(ctx, F, { x: x0 + bz, y: top + bz, w: lw - bz * 2, h: lidH - bz * 2 }, 16 * u, 152, 1.2);
      tube(ctx, F, slabPts(F, x0 + bz - 5 * u, top + bz - 5 * u, lw - bz * 2 + 10 * u, lidH - bz * 2 + 10 * u, 20 * u, 154, 0.5), 13 * u, shade(C.device, 0.12), { closed: true, lift: 3, speck: 0.8 });
      const cam = lump(ctx, F, x0 + lw / 2, top + bz / 2, 6 * u, 6 * u, 153, 0.05); clay(ctx, F, shade(C.device, -0.4), cam, { lift: 0, spec: 0 });
      const I = { x: x0 + bz + 18 * u, y: top + bz + 16 * u, w: lw - bz * 2 - 36 * u, h: lidH - bz * 2 - 32 * u };
      const pv = { x: I.x, y: I.y, w: I.w, h: I.h * 0.5 };
      miniWorld(ctx, F, pv, st.local);
      const tr = screenTracks(ctx, F, { x: I.x, y: pv.y + pv.h + I.h * 0.1, w: I.w, h: I.h * 0.38 }, p, tall);
      anchors = [[pv.x + pv.w * (tall ? 0.22 : 0.62), pv.y + pv.h * 0.42], [tr[0][0], tr[0][1]], [tr[1][0], tr[1][1]]];
    } else {
      const ph = Math.min(availH * 0.97, 760 * u), pw = ph * 0.52;
      const x0 = tall ? A.x + (A.w - pw) / 2 : A.x + A.w * 0.13;
      const top = base - ph;
      devTop = top;
      contact(ctx, F, x0 + pw / 2, base, pw * 0.75, 18 * u, 0.42);
      closed(ctx, [[x0 + pw * 0.15, base], [x0 + pw * 0.85, base], [x0 + pw * 0.7, base - ph * 0.2], [x0 + pw * 0.3, base - ph * 0.2]]);
      clay(ctx, F, shade(C.post, 0.1), { x: x0 + pw * 0.15, y: base - ph * 0.2, w: pw * 0.7, h: ph * 0.2 }, { lift: 8, seed: 170 });
      slab(ctx, F, x0, top, pw, ph - 10 * u, 48 * u, 171, 0.8);
      clay(ctx, F, C.device, { x: x0, y: top, w: pw, h: ph - 10 * u }, { lift: 14, seed: 171, thumb: true, score: 2 });
      const bz = 20 * u;
      slab(ctx, F, x0 + bz, top + bz * 2, pw - bz * 2, ph - 10 * u - bz * 4, 30 * u, 172, 0.5);
      clay(ctx, F, C.screen, { x: x0 + bz, y: top + bz * 2, w: pw - bz * 2, h: ph - 10 * u - bz * 4 }, { lift: 0, seed: 172, spec: 0.4, speck: 0.9, thumb: true });
      recess(ctx, F, { x: x0 + bz, y: top + bz * 2, w: pw - bz * 2, h: ph - 10 * u - bz * 4 }, 30 * u, 172, 1.2);
      tube(ctx, F, slabPts(F, x0 + bz - 5 * u, top + bz * 2 - 5 * u, pw - bz * 2 + 10 * u, ph - 10 * u - bz * 4 + 10 * u, 34 * u, 174, 0.5), 12 * u, shade(C.device, 0.12), { closed: true, lift: 3, speck: 0.8 });
      const sp = lump(ctx, F, x0 + pw / 2, top + bz, 22 * u, 5 * u, 173, 0.05); clay(ctx, F, shade(C.device, -0.4), sp, { lift: 0, spec: 0 });
      const I = { x: x0 + bz + 14 * u, y: top + bz * 2 + 16 * u, w: pw - bz * 2 - 28 * u, h: ph - 10 * u - bz * 4 - 32 * u };
      const pv = { x: I.x, y: I.y, w: I.w, h: I.h * 0.42 };
      miniWorld(ctx, F, pv, st.local);
      const tr = screenTracks(ctx, F, { x: I.x, y: pv.y + pv.h + I.h * 0.1, w: I.w, h: I.h * 0.32 }, p, tall);
      anchors = [[pv.x + pv.w * (tall ? 0.25 : 0.7), pv.y + pv.h * 0.4], [tr[0][0], tr[0][1]], [tr[1][0], tr[1][1]]];
    }
    // Tags: on the right in a wide frame; stacked above the device, stepping right, in a tall one.
    const tags = d.callouts.map((label, i) => {
      if (!label) return null;
      const x = tall ? A.x + 30 * u + i * 100 * u : A.x + A.w * 0.64;
      const y = tall ? A.y + 10 * u + i * (tagH + tagGap) : A.y + 40 * u + i * ((base - A.y - 40 * u - tagH - 20 * u) / 2);
      const maxW = tall ? A.x + A.w - x : A.x + A.w + F.side * 0.5 - x;
      return { label, x, y, maxW, i };
    });
    tags.forEach((tg) => {
      if (!tg) return;
      const c = st.gone ? 1 : stag(p, tg.i, 3, 0.5);
      const grow = seg(c, 0, 0.6), show = pop(seg(c, 0.45, 1));
      const [ax, ay] = anchors[tg.i];
      const hole = [tg.x + 24 * u, tg.y + tagH / 2];
      const pts = tall ? qpts([ax, ay], [hole[0], devTop - 30 * u], hole, 18) : qpts([ax, ay], [lerp(ax, hole[0], 0.55), lerp(ay, hole[1], 0.1) - 40 * u], hole, 18);
      if (grow > 0) {
        const b = lump(ctx, F, ax, ay, 14 * u * (0.8 + 0.2 * Math.sin(F.ts * 4 + tg.i)), 14 * u, 180 + tg.i, 0.06);
        clay(ctx, F, C.acc, b, { lift: 4, seed: 180 });
        tube(ctx, F, cut(pts, eo(grow)), 9 * u, C.acc, { lift: 4 });
      }
      if (show > 0) {
        ctx.save();
        ctx.translate(hole[0], hole[1]);
        ctx.rotate(Math.sin(F.ts * 1.7 + tg.i * 1.3) * 0.025 + bo(F, 190 + tg.i) * 0.004);
        ctx.scale(show, show);
        ctx.translate(-hole[0], -hole[1]);
        tagCard(ctx, F, tg.x, tg.y, tg.label, { maxW: tg.maxW, seed: 190 + tg.i * 3 });
        ctx.restore();
      }
    });
  }

  // ---- people: gumdrop folk holding placards -------------------------------------------------------
  function peopleStation(ctx, F, st) {
    const { u, C, box: A, base, tall } = F, d = st.d;
    const n = clamp(Math.round(d.count), 2, 6), hi = Math.min(n - 1, d.highlight);
    const p = st.gone ? 1 : st.p;
    const twoRows = tall && n > 3;
    const front = twoRows ? Math.floor(n / 2) : n, back = n - front;
    const spots = [];
    if (twoRows) {
      const sb = A.w / back, sf = A.w / front;
      const hb = Math.min(A.h * 0.3, sb * 0.95), hf = Math.min(A.h * 0.36, sf * 0.95);
      for (let k = 0; k < back; k++) spots.push({ i: k, x: A.x + sb * (k + 0.5), base: base - A.h * 0.44, h: hb, slot: sb });
      for (let k = 0; k < front; k++) spots.push({ i: back + k, x: A.x + sf * (k + 0.5), base, h: hf, slot: sf });
    } else {
      const s = A.w / n, h = Math.min((base - A.y) * 0.7, s * 1.05, 470 * u);
      for (let k = 0; k < n; k++) spots.push({ i: k, x: A.x + s * (k + 0.5), base, h, slot: s });
    }
    const hotX = spots[hi].x;
    spots.forEach((sp) => {
      const { i, x, h } = sp;
      const hot = i === hi, w = h * 0.68;
      const q = st.gone ? 1 : stag(p, i, n, 0.55);
      const label = d.badges[i % d.badges.length] || "";
      let lift = 0, sq = 1 + 0.02 * Math.sin(F.ts * 3 + i * 1.7);
      if (hot && q >= 1) {
        const ph = mod(F.ts - 0.2, 1.7) / 1.7;
        if (ph < 0.3) { lift = Math.sin((ph / 0.3) * Math.PI) * h * 0.14; sq *= 1.04; }
        else if (ph < 0.4) sq *= 1 - 0.1 * Math.sin(((ph - 0.3) / 0.1) * Math.PI);
      }
      const fs = 46 * u, sh = 86 * u;
      const tw = typeW(label, fs);
      const sw = Math.min(sp.slot * 0.94, Math.max(w * 1.15, tw + 64 * u));
      const sy = -h * 0.34;
      // Each sign is lifted up from behind its owner, then brought down in front and caught with a
      // squash: staggered across the crew so they arrive one after another.
      const sT = st.gone ? 9 : st.local - (0.2 + i * 0.22);
      const up = -h * 1.2 - sh / 2;
      let signY = null, behind = false, ssx = 1, ssy = 1, arms = "down";
      if (sT > 0) {
        if (sT < 0.3) { const r = eo(sT / 0.3); signY = lerp(-h * 0.55, up, r); behind = true; ssx = ssy = lerp(0.55, 1, r); arms = "cheer"; }
        else if (sT < 0.52) { const r = seg(sT, 0.3, 0.52); signY = lerp(up, sy, r * r); arms = "cheer"; ssy = 1.06; ssx = 0.96; }
        else { signY = sy; arms = "hold"; const r = seg(sT, 0.52, 0.9); const wv = r < 1 ? Math.sin(r * Math.PI * 2) * (1 - r) : 0; ssy = 1 - 0.22 * wv; ssx = 1 + 0.16 * wv; }
      }
      const sign = (c2) => {
        c2.save();
        c2.translate(0, signY + sh / 2); c2.scale(ssx, ssy); c2.rotate(Math.sin(F.ts * 1.6 + i) * 0.014); c2.translate(0, -sh / 2);
        const b = slab(c2, F, -sw / 2, 0, sw, sh, 22 * u, 400 + i, 0.7);
        clay(c2, F, hot ? C.acc : C.slab, b, { lift: 8, seed: 400 + i, thumb: true });
        ctext(c2, F, label, 0, sh / 2 + 2 * u, fs, hot ? C.onAcc : C.tagInk, { maxW: sw - 36 * u, seed: 410 + i, ripple: hot });
        c2.restore();
      };
      lumpling(ctx, F, x, sp.base, h, {
        col: hot ? C.acc : C.clays[[1, 2, 3, 4, 5, 0][i % 6]], k: [1, 3, 0, 4, 2, 5][i % 6], seed: i * 3, lift, sq,
        arms, blink: mod(F.ts + i * 0.77, 2.9) < 0.12,
        look: hot ? (Math.floor(F.ts / 1.5) % 2 ? 0.7 : -0.7) : clamp((hotX - x) / (A.w * 0.3), -1, 1), open: (hot && q >= 1 && lift > 0) || (sT > 0 && sT < 0.6),
        hands: signY === null ? undefined : [[-sw / 2 + 12 * u, signY + sh * 0.35], [sw / 2 - 12 * u, signY + sh * 0.35]],
        behind: (c2) => { if (signY !== null && behind) sign(c2); },
        between: (c2) => { if (signY !== null && !behind) sign(c2); },
      });
    });
  }

  // ---- process: floating clay islands and a hopping guide ------------------------------------------
  function island(ctx, F, x, y, w, seed) {
    const { u, C } = F;
    const pts = [[x - w * 0.5, y + 6 * u], [x - w * 0.25, y + 12 * u], [x + w * 0.25, y + 12 * u], [x + w * 0.5, y + 6 * u], [x + w * 0.38, y + w * 0.13], [x + w * 0.17, y + w * 0.27], [x + w * 0.02, y + w * 0.34], [x - w * 0.15, y + w * 0.25], [x - w * 0.37, y + w * 0.14]]
      .map((p, i) => [p[0] + (hash(seed + i) - 0.5) * 8 * u + bo(F, seed + i) * 1.2 * u, p[1] + (hash(seed + i * 2) - 0.5) * 8 * u]);
    for (let k = 0; k < 3; k++) {
      const rx = x + w * (-0.18 + k * 0.17), sw = Math.sin(F.ts * 2 + k + seed) * 6 * u;
      tube(ctx, F, [[rx, y + w * 0.16], [rx + sw * 0.5, y + w * 0.3], [rx + sw, y + w * (0.38 + k * 0.03)]], 7 * u, shade(C.soil, -0.25), { lift: 2 });
    }
    closed(ctx, pts);
    clay(ctx, F, C.soil, { x: x - w * 0.5, y, w, h: w * 0.34 }, { lift: 14, seed, thumb: true, score: 3 });
    const b = slab(ctx, F, x - w * 0.53, y - 20 * u, w * 1.06, 46 * u, 23 * u, seed + 5, 0.8);
    clay(ctx, F, C.front, b, { lift: 6, seed: seed + 5 });
    for (let k = 0; k < 7; k++) {
      const gx = x - w * 0.45 + k * w * 0.15, gh = (14 + hash(seed + k) * 12) * u;
      ctx.save(); ctx.translate(gx, y - 16 * u); ctx.rotate((hash(seed + k * 3) - 0.5) * 0.7 + bo(F, seed + k) * 0.03);
      const gb = lump(ctx, F, 0, -gh / 2, gh * 0.18, gh / 2, seed + k, 0.08); clay(ctx, F, shade(C.front, k % 2 ? 0.16 : -0.1), gb, { lift: 2, seed: k });
      ctx.restore();
    }
  }
  function stepIcon(ctx, F, k, x, base, s, live) {
    const { u, C } = F;
    if (k === 0) { // A page with lines that lifts at the corner.
      ctx.save(); ctx.translate(x, base); ctx.rotate(-0.08 + Math.sin(F.ts * 2) * 0.03);
      const w = s * 0.62, h = s * 0.8;
      const b = slab(ctx, F, -w / 2, -h, w, h, 12 * u, 600, 0.6); clay(ctx, F, C.slab, b, { lift: 9, seed: 600, thumb: true });
      for (let r = 0; r < 4; r++) tube(ctx, F, [[-w * 0.32, -h * (0.78 - r * 0.17)], [w * (r === 3 ? 0.05 : 0.3), -h * (0.78 - r * 0.17)]], 8 * u, r === 0 ? C.acc : shade(C.tagInk, 0.35), { lift: 0 });
      const lf = 0.5 + 0.5 * Math.sin(F.ts * 2.4);
      closed(ctx, [[w / 2, -h * 0.22 - lf * 10 * u], [w / 2, 0], [w / 2 - w * 0.26, 0]]);
      clay(ctx, F, shade(C.slab, -0.12), { x: w * 0.24, y: -h * 0.26, w: w * 0.26, h: h * 0.26 }, { lift: 3, seed: 601 });
      ctx.restore();
    } else if (k === 1) { // A pencil writing a growing squiggle.
      const w = s * 0.7, h = s * 0.42;
      const b = slab(ctx, F, x - w / 2, base - h, w, h, 10 * u, 610, 0.6); clay(ctx, F, C.slab, b, { lift: 8, seed: 610 });
      const f = mod(F.ts * 0.45, 1);
      const sq = []; for (let i = 0; i <= 24; i++) { const t = i / 24; sq.push([x - w * 0.36 + t * w * 0.72, base - h * 0.5 + Math.sin(t * 14) * h * 0.22]); }
      const part = cut(sq, f);
      if (part) tube(ctx, F, part, 7 * u, C.acc, { lift: 0 });
      const tip = part ? part[part.length - 1] : sq[0];
      ctx.save(); ctx.translate(tip[0], tip[1]); ctx.rotate(-0.75 + Math.sin(F.ts * 14) * 0.05);
      tube(ctx, F, [[0, -s * 0.16], [0, -s * 0.72]], s * 0.15, C.clays[2], { lift: 6 });
      closed(ctx, [[-s * 0.075, -s * 0.16], [s * 0.075, -s * 0.16], [0, -s * 0.01]]);
      clay(ctx, F, shade(C.post, 0.35), { x: -s * 0.075, y: -s * 0.16, w: s * 0.15, h: s * 0.15 }, { lift: 2, seed: 612 });
      const e = lump(ctx, F, 0, -s * 0.76, s * 0.08, s * 0.06, 613, 0.06); clay(ctx, F, C.clays[0], e, { lift: 3, seed: 613 });
      ctx.restore();
    } else { // A badge that waits as an empty ring until the guide arrives, then takes its check.
      const r = s * 0.36, cy = base - r - 4 * u;
      const pul = live > 0 ? 1 + 0.06 * Math.sin(F.ts * 6) : 1;
      ctx.save(); ctx.translate(x, cy); ctx.scale(pul, pul);
      const b = lump(ctx, F, 0, 0, r, r, 620, 0.04); clay(ctx, F, live > 0 ? C.clays[4] : shade(C.slab, -0.05), b, { lift: 10, seed: 620, thumb: true });
      tube(ctx, F, [[-r * 0.7, 0], [0, -r * 0.7], [r * 0.7, 0], [0, r * 0.7]], r * 0.12, shade(live > 0 ? C.clays[4] : C.slab, -0.15), { closed: true, lift: 0 });
      const ck = cut([[-r * 0.42, 0], [-r * 0.1, r * 0.32], [r * 0.46, -r * 0.34]], live);
      if (ck) tube(ctx, F, ck, r * 0.2, C.slab, { lift: 3 });
      ctx.restore();
      if (live >= 1) for (let i = 0; i < 4; i++) { const a = F.ts * 0.8 + (i * TAU) / 4; sparkle(ctx, F, x + Math.cos(a) * r * 1.55, cy + Math.sin(a) * r * 1.3, 13 * u, C.clays[2], i + 7); }
    }
  }
  function processStation(ctx, F, st) {
    const { u, C, box: A, base, tall } = F, d = st.d;
    const p = st.gone ? 1 : st.p;
    const iw = tall ? Math.min(A.w * 0.46, 400 * u) : Math.min(A.w * 0.27, 460 * u);
    const isl = [0, 1, 2].map((k) => {
      const x = tall ? A.x + A.w * (k === 1 ? 0.7 : 0.3) : A.x + A.w * (0.17 + k * 0.33);
      const narrow = A.w < 1300 * u;
      const y0 = tall ? A.y + 170 * u + (k * (base - A.y - 440 * u)) / 2 : base - (base - A.y) * (narrow ? 0.42 + k * 0.2 : 0.5 + k * 0.1);
      return { x, y: y0 + Math.sin(F.ts * 1.5 + k * 2.1) * 7 * u };
    });
    const hopAt = (k) => 0.14 + k * 0.36;
    const arrived = st.gone ? 1 : seg(p, hopAt(1) + 0.18, hopAt(1) + 0.3);
    // Hanging tags first (behind the islands), on two strings.
    isl.forEach((I, k) => {
      const label = d.steps[k] || "";
      const lead = 64 * u;
      const tw = typeW(label, 44 * u), maxW = (tall ? A.w * 0.56 : A.w * 0.31);
      const w = Math.min(maxW, lead + tw + 84 * u), h = 84 * u;
      const ty = I.y + iw * 0.36 + 14 * u;
      const swing = Math.sin(F.ts * 1.6 + k * 1.9) * 0.03;
      ctx.save();
      ctx.translate(I.x, I.y + iw * 0.14); ctx.rotate(swing); ctx.translate(-I.x, -(I.y + iw * 0.14));
      for (const s of [-1, 1]) tube(ctx, F, [[I.x + s * w * 0.3, I.y + iw * 0.12], [I.x + s * w * 0.3, ty + 10 * u]], 4 * u, shade(C.post, -0.1), { lift: 2 });
      tagCard(ctx, F, I.x - w / 2, ty, label, { maxW, lead, badge: String(k + 1), seed: 640 + k * 3, h });
      ctx.restore();
    });
    // Bead trails arching from island to island, laid ahead of the guide.
    for (let k = 0; k < 2; k++) {
      const a = isl[k], b = isl[k + 1];
      const s0 = [a.x + iw * 0.44, a.y - 34 * u], e0 = [b.x - iw * 0.44, b.y - 40 * u];
      if (tall && k === 1) { s0[0] = a.x - iw * 0.44; e0[0] = b.x + iw * 0.44; }
      const ctrl = [(s0[0] + e0[0]) / 2, Math.min(s0[1], e0[1]) - (tall ? 90 : 130) * u];
      const g = st.gone ? 1 : seg(p, 0.02 + k * 0.36, 0.3 + k * 0.36);
      const pts = qpts(s0, ctrl, e0, 60);
      const L = [0];
      for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const total = L[L.length - 1], stepL = 36 * u;
      let j = 0;
      for (let dd = 0; dd <= total * g; dd += stepL) {
        while (j < L.length - 1 && L[j + 1] < dd) j++;
        const f = (dd - L[j]) / Math.max(1e-6, (L[j + 1] ?? L[j]) - L[j]);
        const pt = [lerp(pts[j][0], (pts[j + 1] || pts[j])[0], f), lerp(pts[j][1], (pts[j + 1] || pts[j])[1], f)];
        const bb = lump(ctx, F, pt[0], pt[1], 9 * u, 9 * u, 660 + dd, 0.08); clay(ctx, F, C.acc, bb, { lift: 4, seed: 661, speck: 0.4 });
      }
      if (g >= 1) {
        const pe = pts[pts.length - 1], pb = pts[pts.length - 4], ang = Math.atan2(pe[1] - pb[1], pe[0] - pb[0]);
        ctx.save(); ctx.translate(pe[0], pe[1]); ctx.rotate(ang);
        closed(ctx, [[14 * u, 0], [-12 * u, -15 * u], [-6 * u, 0], [-12 * u, 15 * u]]);
        clay(ctx, F, C.acc, { x: -12 * u, y: -15 * u, w: 26 * u, h: 30 * u }, { lift: 4, seed: 662 });
        ctx.restore();
      }
    }
    isl.forEach((I, k) => {
      island(ctx, F, I.x, I.y, iw, 680 + k * 9);
      stepIcon(ctx, F, k, I.x - iw * 0.12, I.y - 16 * u, iw * (tall ? 0.5 : 0.5), k === 2 ? arrived : 1);
    });
    // The guide hops from island to island as the steps build.
    const hh = (tall ? 112 : 124) * u;
    const stand = (k) => [isl[k].x + iw * 0.27, isl[k].y - 14 * u];
    let pos = stand(0), lift = 0, sq = 1 + 0.02 * Math.sin(F.ts * 3), arms = "wave", open = false;
    for (let k = 0; k < 2; k++) {
      const a = hopAt(k), f = seg(p, a, a + 0.18);
      if (p >= a) {
        const s0 = stand(k), s1 = stand(k + 1);
        pos = [lerp(s0[0], s1[0], eio(f)), lerp(s0[1], s1[1], f)];
        lift = Math.sin(f * Math.PI) * (110 * u + Math.abs(s1[1] - s0[1]) * 0.35);
        if (f > 0 && f < 1) { sq = 1.07; arms = "cheer"; }
        const land = seg(p, a + 0.18, a + 0.25);
        if (land > 0 && land < 1) sq = 1 - 0.15 * Math.sin(land * Math.PI);
      }
    }
    if (st.gone || p >= hopAt(1) + 0.25) {
      const ph = mod(F.ts, 1.3) / 1.3;
      lift = ph < 0.3 ? Math.sin((ph / 0.3) * Math.PI) * 26 * u : 0;
      sq = ph >= 0.3 && ph < 0.38 ? 0.9 : 1;
      arms = "cheer"; open = true;
    }
    lumpling(ctx, F, pos[0], pos[1], hh, { col: C.clays[1], k: 0, seed: 5, lift, sq, arms, open, look: -0.4, blink: mod(F.ts + 0.3, 2.8) < 0.12 });
  }

  // ---- compare: two bowls filling with pebbles ------------------------------------------------------
  function compareStation(ctx, F, st) {
    const { u, C, box: A, base, tall } = F, d = st.d;
    const p = st.gone ? 1 : st.p;
    const maxV = Math.max(Math.abs(d.leftValue), Math.abs(d.rightValue), 1);
    const sides = [{ label: d.left, v: Math.max(0, d.leftValue), col: C.clays[1], hot: false }, { label: d.right, v: Math.max(0, d.rightValue), col: C.acc, hot: true }];
    const bw = Math.min(A.w * (tall ? 0.44 : 0.3), 500 * u), bh = bw * 0.38;
    sides.forEach((sd, s) => {
      const cx = A.x + A.w * (s ? 0.73 : 0.27);
      const q = st.gone ? 1 : stag(p, s, 2, 0.35);
      const labelY = A.y + (tall ? 70 : 44) * u, numY = labelY + (tall ? 150 : 120) * u;
      ctext(ctx, F, sd.label, cx, labelY, 52 * u, C.ink, { maxW: A.w * 0.44, seed: 700 + s });
      ctext(ctx, F, fmt(sd.v * q, d), cx, numY, 128 * u, sd.hot ? C.acc : C.ink, { seed: 710 + s, maxW: A.w * 0.44, min: 96 * u, ripple: q >= 1 });
      if (sd.hot && q >= 1) for (let i = 0; i < 3; i++) sparkle(ctx, F, cx + (i - 1) * 120 * u + Math.sin(i * 2.3) * 30 * u, numY - 70 * u + (i % 2) * 120 * u, 15 * u, C.clays[2], i * 3 + 1);
      const rimY = base - bh;
      contact(ctx, F, cx, base, bw * 0.62, 18 * u, 0.42);
      // The back of the bowl's mouth.
      let b = lump(ctx, F, cx, rimY, bw * 0.48, bh * 0.22, 720 + s, 0.03); clay(ctx, F, shade(C.soil, -0.4), b, { lift: 0, spec: 0, seed: 720 });
      // Pebbles, bottom rows first, dropping in as the value counts.
      const rb = bw * 0.075, c0 = Math.max(3, Math.floor((bw * 0.84) / (2 * rb)));
      const m = sd.v > 0 ? Math.max(1, Math.round((sd.v / maxV) * 12)) : 0;
      const pos = [];
      for (let r = 0, left = m; left > 0; r++) {
        const cnt = Math.min(left, Math.max(1, c0 - r));
        for (let k = 0; k < cnt; k++) pos.push([cx + (k - (cnt - 1) / 2) * rb * 2.02 + (hash(s * 50 + r * 9 + k) - 0.5) * rb * 0.3, rimY + rb * 0.35 - r * rb * 1.72]);
        left -= cnt;
      }
      const mq = q * m;
      // The closing beat: once both counts are in, a clay seal is stamped onto the winning bowl and
      // its pebbles jump with the impact.
      const doneT = st.gone ? 9 : st.local - 0.22 - Math.max(0.9, st.hold * 0.62);
      const bump = sd.hot && doneT > 0.16 && doneT < 0.5 ? Math.sin(seg(doneT, 0.16, 0.5) * Math.PI) : 0;
      pos.forEach(([px, py], j) => {
        const f = clamp(mq - j);
        if (f <= 0) return;
        const fall = Math.pow(1 - f, 2) * 260 * u;
        const jig = (j === pos.length - 1 ? Math.sin(F.ts * 6 + s) * 2 * u : 0) - bump * (14 + hash(j) * 16) * u;
        const pb = lump(ctx, F, px + bo(F, j + s * 40) * 0.8 * u, py - fall + jig, rb, rb * 0.92, 730 + j + s * 40, 0.08);
        clay(ctx, F, shade(sd.col, (hash(j + s * 7) - 0.5) * 0.24), pb, { lift: 6, seed: 730 + j, thumb: j % 4 === 0 });
      });
      // The bowl's front and its rolled rim.
      const front = [];
      for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI; front.push([cx + Math.cos(a) * bw * 0.5, rimY + Math.sin(a) * bh]); }
      closed(ctx, front.map((pt, i) => [pt[0] + bo(F, 740 + i + s * 20) * 0.8 * u, pt[1]]));
      clay(ctx, F, C.soil, { x: cx - bw / 2, y: rimY - bh * 0.1, w: bw, h: bh * 1.1 }, { lift: 12, seed: 740 + s, thumb: true, score: 3 });
      const rim = [];
      for (let i = 0; i <= 20; i++) { const a = (i / 20) * Math.PI; rim.push([cx + Math.cos(a) * bw * 0.5, rimY + Math.sin(a) * bh * 0.22]); }
      tube(ctx, F, rim, bh * 0.17, shade(C.soil, 0.12), { lift: 2 });
      for (let i = 0; i < 2; i++) tube(ctx, F, qpts([cx - bw * 0.42, rimY + bh * (0.42 + i * 0.25)], [cx, rimY + bh * (0.62 + i * 0.3)], [cx + bw * 0.42, rimY + bh * (0.42 + i * 0.25)], 12), 6 * u, shade(C.soil, -0.12), { lift: 0, spec: 0.4 });
      // A groove in the ground filling to the value.
      const gw = bw * 1.1, gx = cx - gw / 2, gy = base + 44 * u, gh = 32 * u;
      b = slab(ctx, F, gx, gy, gw, gh, gh / 2, 750 + s, 0.5); clay(ctx, F, shade(C.front, -0.35), b, { lift: 0, spec: 0, seed: 750 });
      const fillW = (gw - gh) * (sd.v / maxV) * eo(q);
      if (fillW > 1) tube(ctx, F, [[gx + gh / 2, gy + gh / 2], [gx + gh / 2 + fillW, gy + gh / 2]], gh * 0.72, sd.col, { lift: 2 });
      if (sd.hot && doneT > 0) {
        const rr = Math.min(bh * 0.6, 92 * u), rx = cx + bw * 0.27, ry = rimY + bh * 0.52;
        const sc = doneT < 0.16 ? lerp(2.4, 1, eio(doneT / 0.16)) : 1;
        const r2 = seg(doneT, 0.16, 0.7), wv = doneT >= 0.16 && r2 < 1 ? Math.sin(r2 * Math.PI * 2) * (1 - r2) : 0;
        if (doneT > 0.16 && doneT < 0.8) for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TAU + 0.3, dd = eo(seg(doneT, 0.16, 0.8)) * rr * 1.5, sz = rr * 0.14 * (1 - seg(doneT, 0.4, 0.8));
          if (sz > 1) { const pb = lump(ctx, F, rx + Math.cos(a) * (rr * 0.9 + dd), ry + Math.sin(a) * (rr * 0.7 + dd * 0.6), sz, sz * 0.85, 760 + k, 0.1); clay(ctx, F, shade(C.soil, 0.15), pb, { lift: 3, seed: 760 + k }); }
        }
        ctx.save();
        ctx.globalAlpha *= clamp(doneT / 0.08);
        ctx.translate(rx, ry); ctx.scale(sc * (1 + 0.16 * wv), sc * (1 - 0.2 * wv)); ctx.translate(-rx, -ry);
        rosette(ctx, F, rx, ry, rr, seg(doneT, 0.3, 0.65), -0.12 + Math.sin(F.ts * 1.5) * 0.05);
        ctx.restore();
        if (doneT > 0.7) for (let k = 0; k < 3; k++) { const a = F.ts * 1.1 + (k * TAU) / 3; sparkle(ctx, F, rx + Math.cos(a) * rr * 1.5, ry + Math.sin(a) * rr * 1.2, 14 * u, C.clays[2], k + 20); }
      }
    });
    if (!tall && A.w * 0.46 - bw > 250 * u) {
      const x = A.x + A.w * 0.5, h = 220 * u;
      const doneT = st.gone ? 9 : st.local - 0.22 - Math.max(0.9, st.hold * 0.62);
      const ph = mod(Math.max(0, doneT - 0.2), 0.9) / 0.9, cheer = doneT > 0.2;
      const hop = cheer && ph < 0.35 ? Math.sin((ph / 0.35) * Math.PI) * h * 0.16 : 0;
      lumpling(ctx, F, x, base, h, { col: C.clays[3], k: 4, arms: cheer ? "cheer" : "point", dir: 1, look: 0.9, lookY: cheer ? -0.4 : 0, blink: mod(F.ts + 0.5, 2.6) < 0.12, lift: hop, sq: cheer && ph >= 0.35 && ph < 0.45 ? 0.88 : 1 + 0.02 * Math.sin(F.ts * 3), open: cheer || (p >= 1 && mod(F.ts, 2) < 1) });
    }
  }

  const DRAW = { title: statementStation, closing: statementStation, chart: chartStation, object: objectStation, people: peopleStation, process: processStation, compare: compareStation };
  function stations(ctx, F) {
    const P = F.plan;
    P.shown.forEach((st, k) => {
      const ox = k * F.W - F.cam;
      if (ox < -F.W * 1.05 || ox > F.W * 1.05) return;
      const local = F.t - st.start;
      const p = clamp((local - 0.12) / Math.max(0.9, st.hold * 0.62));
      const S2 = { id: st.id, k, local, hold: st.hold, p: local < 0 ? 0 : p, pr: (local - 0.12) / Math.max(0.9, st.hold * 0.62), since: k === 0 ? local : local + clamp(P.change, 0.3, 0.6), last: k === P.shown.length - 1, d: P.data[st.id] || {}, pending: local < 0, gone: local > st.hold };
      ctx.save();
      ctx.translate(ox, 0);
      if (st.id === "title" || st.id === "closing") DRAW[st.id](ctx, F, S2);
      else {
        // Every scene station hangs its headline on a clay plank from the bunting, and its drawing
        // fills the frame below the plank.
        const L = headLayout(F, S2.d.head);
        let Fs = F;
        if (L) { const y = Math.max(F.box.y, L.y + L.h + 26 * F.u); Fs = { ...F, box: { ...F.box, y, h: F.box.y + F.box.h - y } }; }
        bunting(ctx, F, k);
        DRAW[st.id](ctx, Fs, S2);
        headSign(ctx, F, S2, L);
      }
      ctx.restore();
    });
  }
  const noop = () => {};

  return {
    bg: BASE.skyBot, panel: BASE.slab, ink: BASE.ink, muted: "#7a5a68", accent: "#e8553f", onAccent: "#fff6e8",
    rule: "rgba(70,38,58,0.35)", track: "rgba(70,38,58,0.12)",
    display: ROUND, displayWeight: 800, displayTracking: "0.01em", displayCase: "none",
    body: ROUND, bodyWeight: 700, figures: ROUND, radius: 26,
    motion: "rise", change: "fade",
    kit: { line: 4, fill: "solid", panel: "fill" },
    clay: BASE,
    palettes: {
      // Light: a pale morning set. Dark: the set at night under a clay moon with fireflies. Mono: unpainted grey modelling clay.
      light: { bg: PALETTES.light.skyBot, panel: PALETTES.light.slab, ink: PALETTES.light.ink, muted: "#5d6474", accent: "#ef5f45", onAccent: "#ffffff", rule: "rgba(45,51,65,0.3)", track: "rgba(45,51,65,0.1)", clay: PALETTES.light },
      dark: { bg: PALETTES.dark.skyTop, panel: PALETTES.dark.slab, ink: PALETTES.dark.ink, muted: "rgba(255,241,220,0.72)", accent: "#ffb347", onAccent: "#2c1620", rule: "rgba(255,241,220,0.35)", track: "rgba(255,241,220,0.12)", clay: PALETTES.dark },
      mono: { bg: PALETTES.mono.skyBot, panel: PALETTES.mono.slab, ink: PALETTES.mono.ink, muted: "#5f5d5a", accent: "#2f2d2b", onAccent: "#ffffff", rule: "rgba(41,40,38,0.3)", track: "rgba(41,40,38,0.1)", clay: PALETTES.mono },
    },
    textShadow: () => "none",
    backdrop: (accent, texture, look) => { const P = (look && look.clay) || BASE; return `linear-gradient(180deg, ${P.skyTop} 0%, ${P.skyBot} 62%, ${P.front} 82%)`; },
    // Headlines become pressed clay letters: a speckled gradient fill, a thick extruded underside and a soft cast shadow.
    css: (accent, look) => {
      const P = look.clay || BASE, ink = rgb(P.ink), light = lum(ink) > 150, sh = rgb(P.shadow), acc = rgb(accent);
      const top = rgba(shade(ink, light ? 0.3 : 0.34)), mid = rgba(ink), bot = rgba(shade(ink, light ? -0.16 : -0.28));
      const ext = rgba(shade(ink, light ? -0.5 : -0.6)), onAcc = lum(acc) > 165 ? "#2c1620" : "#fff6e8", tex = look.texture ?? 1;
      return `#root:has(> canvas#art) .scene > .display, #root:has(> canvas#art) .scene > .kicker { visibility: hidden !important; }
      #root .display { font-family: ${ROUND}; font-weight: 800; color: ${mid}; text-shadow: none !important;
        background-image: ${grain(0.38 * tex)}, linear-gradient(180deg, ${top} 0%, ${mid} 50%, ${bot} 100%);
        background-size: 240px 240px, 100% 1.04em; background-repeat: repeat;
        -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
        filter: drop-shadow(0 0.05em 0 ${ext}) drop-shadow(0.03em 0.11em 0.07em ${rgba(sh, 0.4)}); padding-bottom: 0.08em; }
      #title-scene .kicker { align-self: flex-start; font-family: ${ROUND}; font-weight: 800; font-size: 42px !important; letter-spacing: 0.08em; color: ${onAcc}; text-shadow: none;
        background: ${accent}; padding: 0.3em 0.95em 0.42em; border-radius: 999px;
        box-shadow: inset 0 -0.2em 0 ${rgba(shade(acc, -0.35))}, inset 0.08em 0.14em 0 ${rgba(shade(acc, 0.4), 0.8)}, 0.05em 0.25em 0.45em ${rgba(sh, 0.35)}; }`;
    },
    // Templates without the illustrated stage get the clay set itself on the texture canvas, drifting slowly.
    paint: (ctx, W, H, t, accent, look) => {
      ctx.clearRect(0, 0, W, H);
      if (document.getElementById("art")) return;
      const S = { W, H, u: Math.min(W, H) / 1080, tall: H > W * 1.15, look, accent };
      const F = frame(S, t, t * 14 * S.u, null);
      world(ctx, F);
      finishPass(ctx, F);
    },
    keepArt: true,
    overlap: true,
    stage(ctx, S, info) {
      const plan = getPlan();
      const F = frame(S, info.t, camAt(plan, info.t, S.W), plan);
      // The last station ends on a slow camera push-in, so the final hold keeps moving.
      const last = plan.shown[plan.shown.length - 1];
      const z = last ? 1 + 0.075 * eio(seg(info.t, last.start + Math.min(last.hold * 0.5, 1.6), plan.length)) : 1;
      ctx.save();
      if (z > 1) { ctx.translate(S.W / 2, S.H * 0.58); ctx.scale(z, z); ctx.translate(-S.W / 2, -S.H * 0.58); }
      if (S.paint) world(ctx, F);
      stations(ctx, F);
      ctx.restore();
      if (S.paint) finishPass(ctx, F);
    },
    scenes: { title: noop, chart: noop, object: noop, people: noop, process: noop, compare: noop, closing: noop },
  };
});
