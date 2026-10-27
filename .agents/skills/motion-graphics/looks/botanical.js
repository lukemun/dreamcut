// Botanical: a naturalist's plate come alive. Every element is engraved in sepia ink (contour lines,
// hatching that follows the form) and floated over misregistered watercolour tints on foxed cream
// paper. A vine keeps growing round the plate border for the whole film, ferns and grasses sway,
// dandelion seed drifts across, bees and butterflies work the scene, and scenes change when a
// leaf-hung vine sweeps across the plate. Charts are flowering plants, devices are wrapped in ivy,
// people are gardeners, steps are bell jars. All drawings are original; frames are pure functions of time.
window.DreamcutMotion.register("botanical", ({ rng }) => {
  const TAU = Math.PI * 2, PI = Math.PI;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', 'Hoefler Text', Georgia, serif";
  const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  const HOLD0 = { title: 2.4, chart: 3.4, object: 3.6, people: 3.2, process: 3.6, compare: 3.2, closing: 2.4 };
  const CAPTION = { title: "Hortus apertus", chart: "Crescentia", object: "Instrumentum", people: "Hortulani", process: "Germinatio", compare: "Collatio", closing: "Fructus maturus" };
  // The plate's Latin legend, set in italic between each headline and its rule.
  const LEGEND = { chart: "Crescentia hebdomadalis, in flore", object: "Instrumentum hederaceum, apertum", people: "Hortulani consociati", process: "Germinatio sub vitro", compare: "Collatio ante et post" };
  const stmt = (id) => id === "title" || id === "closing";

  // ---- colour --------------------------------------------------------------------------------------
  function parse(s) {
    s = String(s == null ? "" : s);
    if (s[0] === "#") { const h = s.length === 4 ? s.slice(1).split("").map((c) => c + c).join("") : s.slice(1, 7); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (m) return m[1].split(",").slice(0, 3).map(Number);
    if (/^[\d.]+,/.test(s)) return s.split(",").map(Number);
    return [60, 40, 30];
  }
  const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const BLACK = [0, 0, 0];
  const INK = (T, a) => rgba(T.ink, a);

  let THEME = null;
  function theme(S) {
    const L = S.look;
    if (THEME && THEME.L === L && THEME.acc === S.accent && THEME.w === S.W && THEME.h === S.H) return THEME.v;
    const tn = L.tone;
    const c = {};
    for (const k in tn.washes) c[k] = parse(tn.washes[k]);
    const v = {
      u: S.u, w: S.W, h: S.H, tall: S.tall, ink: parse(tn.ink), paper: parse(tn.paper), paperS: tn.paper, rim: parse(tn.rim), fox: parse(tn.fox),
      dark: !!tn.dark, c, acc: parse(S.accent), tex: L.texture == null ? 1 : L.texture, bg: !!S.paint, side: (S.tall ? 90 : 140) * S.u,
    };
    v.hi = mixc(v.paper, [255, 255, 255], v.dark ? 0.07 : 0.4);
    v.petals = [c.rose, c.ochre, c.blue, c.plum, c.clay];
    THEME = { L, acc: S.accent, w: S.W, h: S.H, v };
    return v;
  }

  // ---- frame state shared between the stage and the scene drawers ----------------------------------
  let FR = { idx: 0, prev: null, cur: null, wipe: -1 };
  function plan() {
    const c = (window.__dreamcut && window.__dreamcut.controls) || {};
    return ORDER.filter((id) => Number(c[id + "_hold"] ?? HOLD0[id]) > 0);
  }

  // ---- small drawing helpers ------------------------------------------------------------------------
  function trace(g, pts, q = 1) {
    const n = pts.length / 2;
    g.moveTo(pts[0], pts[1]);
    if (q >= 1) { for (let i = 1; i < n; i++) g.lineTo(pts[2 * i], pts[2 * i + 1]); return; }
    const f = (n - 1) * clamp(q), k = Math.floor(f);
    for (let i = 1; i <= k; i++) g.lineTo(pts[2 * i], pts[2 * i + 1]);
    if (k < n - 1) { const r = f - k; g.lineTo(lerp(pts[2 * k], pts[2 * k + 2], r), lerp(pts[2 * k + 1], pts[2 * k + 3], r)); }
  }
  function line(g, T, pts, w, a, q = 1) {
    if (q <= 0) return;
    g.save(); g.beginPath(); trace(g, pts, q); g.lineWidth = w; g.strokeStyle = INK(T, a); g.lineCap = "round"; g.lineJoin = "round"; g.stroke(); g.restore();
  }
  function bez(p0, p1, p2, p3, n) {
    const o = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = (1 - t) * (1 - t) * (1 - t), b = 3 * (1 - t) * (1 - t) * t, c = 3 * (1 - t) * t * t, d = t * t * t;
      o.push(a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]);
    }
    return o;
  }
  function qbez(p0, p1, p2, n) { return bez(p0, [lerp(p0[0], p1[0], 2 / 3), lerp(p0[1], p1[1], 2 / 3)], [lerp(p2[0], p1[0], 2 / 3), lerp(p2[1], p1[1], 2 / 3)], p2, n); }
  function ptAt(pts, v) {
    const n = pts.length / 2 - 1, f = clamp(v) * n, i = Math.min(n - 1, Math.floor(f)), r = f - i;
    const x0 = pts[2 * i], y0 = pts[2 * i + 1], x1 = pts[2 * i + 2], y1 = pts[2 * i + 3];
    return { x: lerp(x0, x1, r), y: lerp(y0, y1, r), a: Math.atan2(y1 - y0, x1 - x0) };
  }
  function stemPts(x, y, h, lean, sw, n = 16) {
    const o = [];
    for (let i = 0; i <= n; i++) { const v = i / n; o.push(x + (lean * v + sw * v * v) * h, y - h * v); }
    return o;
  }
  function rr(g, x, y, w, h, r) {
    const q = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath(); g.moveTo(x + q, y); g.arcTo(x + w, y, x + w, y + h, q); g.arcTo(x + w, y + h, x, y + h, q); g.arcTo(x, y + h, x, y, q); g.arcTo(x, y, x + w, y, q); g.closePath();
  }
  const sway = (t, seed, amt = 1) => (Math.sin(t * 0.9 + seed * 3.1) * 0.06 + Math.sin(t * 0.41 + seed * 1.3) * 0.035) * amt;

  function txt(g, T, s, x, y, size, o = {}) {
    g.save();
    g.font = `${o.style || "italic"} ${o.weight || 500} ${size}px ${SERIF}`;
    g.textAlign = o.align || "center"; g.textBaseline = o.base || "middle";
    if (o.halo !== false) { g.lineWidth = size * 0.16; g.lineJoin = "round"; g.strokeStyle = rgba(T.paper, 0.85); g.strokeText(s, x, y); }
    g.fillStyle = o.color || INK(T, 0.96);
    g.fillText(s, x, y);
    g.restore();
  }
  function measure(g, s, size, style = "italic", weight = 500) { g.save(); g.font = `${style} ${weight} ${size}px ${SERIF}`; const w = g.measureText(s).width; g.restore(); return w; }

  // ---- the leaf: wash, veins, contour hatching, double outline -----------------------------------------
  function leaf(g, T, x, y, len, wid, ang, col, o = {}) {
    const gr = o.grow == null ? 1 : o.grow;
    if (gr <= 0.02 || len < 2) return;
    const u = T.u, round = o.round || 0, bend = o.bend || 0;
    const nS = o.n || (len > 110 * u ? 20 : 12);
    const pf = (v) => Math.pow(Math.sin(PI * Math.pow(clamp(v), round ? 0.62 : 0.78)), round ? 0.72 : 1);
    g.save(); g.translate(x, y); g.rotate(ang); g.scale(gr, gr);
    if (o.alpha != null) g.globalAlpha *= o.alpha;
    const up = [], lo = [];
    for (let i = 0; i <= nS; i++) { const v = i / nS, hw = wid * pf(v), cy = bend * len * v * v; up.push(v * len, cy - hw); lo.push(v * len, cy + hw); }
    const outline = () => {
      g.beginPath(); g.moveTo(up[0], up[1]);
      for (let i = 1; i <= nS; i++) g.lineTo(up[2 * i], up[2 * i + 1]);
      for (let i = nS; i >= 0; i--) g.lineTo(lo[2 * i], lo[2 * i + 1]);
      g.closePath();
    };
    // Watercolour tint, printed a touch off the line-work.
    g.save(); g.translate(1.7 * u, 1.3 * u); outline();
    if (o.simple) g.fillStyle = rgba(col, 0.6);
    else {
      const gd = g.createLinearGradient(0, -wid, 0, wid + bend * len);
      gd.addColorStop(0, rgba(mixc(col, T.c.cream, 0.55), 0.5)); gd.addColorStop(0.5, rgba(col, 0.62)); gd.addColorStop(1, rgba(mixc(col, BLACK, 0.2), 0.72));
      g.fillStyle = gd;
    }
    g.fill(); g.restore();
    g.lineCap = "round"; g.lineJoin = "round";
    if (!o.simple) {
      const nv = o.veins == null ? 5 : o.veins;
      g.lineWidth = Math.max(0.7, 0.9 * u); g.strokeStyle = INK(T, 0.55); g.beginPath();
      g.moveTo(0, 0); for (let i = 1; i <= 10; i++) { const v = i * 0.094; g.lineTo(v * len, bend * len * v * v); }
      for (let i = 0; i < nv; i++) {
        const v = ((i + 0.7) / (nv + 0.7)) * 0.78 + 0.08, v2 = Math.min(0.97, v + 0.2), hw2 = wid * pf(v2) * 0.9, py = bend * len * v * v, ey = bend * len * v2 * v2;
        g.moveTo(v * len, py); g.quadraticCurveTo(v * len + len * 0.05, py - hw2 * 0.4, v2 * len, ey - hw2);
        g.moveTo(v * len, py); g.quadraticCurveTo(v * len + len * 0.05, py + hw2 * 0.4, v2 * len, ey + hw2);
      }
      g.stroke();
      if (o.hatch !== false && len > 36 * u) {
        const hn = clamp(Math.round(len / (7 * u)), 6, 30);
        g.lineWidth = Math.max(0.6, 0.72 * u); g.strokeStyle = INK(T, 0.4); g.beginPath();
        for (let k = 0; k < hn; k++) {
          const v = 0.05 + (0.9 * k) / hn, hw = wid * pf(v), cy = bend * len * v * v, rv = 0.5 + 0.4 * (((k * 7) % 5) / 5);
          g.moveTo(v * len, cy + hw * 0.22); g.lineTo(v * len + len * 0.05, cy + hw * (0.3 + rv * 0.62));
        }
        g.stroke();
      }
    }
    outline(); g.lineWidth = Math.max(1.1, 1.7 * u); g.strokeStyle = INK(T, 0.92); g.stroke();
    if (!o.simple) { g.save(); g.translate(-0.7 * u, 0.6 * u); outline(); g.lineWidth = 0.7 * u; g.strokeStyle = INK(T, 0.28); g.stroke(); g.restore(); }
    g.restore();
  }

  function berry(g, T, x, y, r, col, o = {}) {
    if (r < 1) return;
    const u = T.u;
    g.save();
    const gd = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    gd.addColorStop(0, rgba(mixc(col, T.c.cream, 0.55), 0.96)); gd.addColorStop(0.6, rgba(col, 0.94)); gd.addColorStop(1, rgba(mixc(col, BLACK, 0.38), 0.97));
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = gd; g.fill();
    g.save(); g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip();
    g.strokeStyle = INK(T, 0.4); g.lineWidth = Math.max(0.6, 0.8 * u);
    for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x - r * 0.45, y - r * 0.45, r * (0.95 + k * 0.17), -0.1, PI / 2 + 0.1); g.stroke(); }
    g.restore();
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.lineWidth = Math.max(1, 1.4 * u); g.strokeStyle = INK(T, 0.92); g.stroke();
    g.beginPath(); g.ellipse(x - r * 0.36, y - r * 0.4, r * 0.2, r * 0.11, -0.7, 0, TAU); g.fillStyle = "rgba(255,255,255,0.82)"; g.fill();
    if (o.calyx) { g.beginPath(); for (let k = 0; k < 4; k++) { const a = -PI / 2 + (k - 1.5) * 0.5; g.moveTo(x, y - r); g.lineTo(x + Math.cos(a) * r * 0.5, y - r + Math.sin(a) * r * 0.5); } g.lineWidth = Math.max(1, 1.2 * u); g.strokeStyle = INK(T, 0.8); g.stroke(); }
    g.restore();
  }

  // Hatching inside a rectangle at a given angle (radians from horizontal). Callers clip to their shape.
  function hatchR(g, T, x0, y0, x1, y1, step, a, ang) {
    if (x1 <= x0 || y1 <= y0 || a <= 0) return;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2 + 2, dx = Math.cos(ang), dy = Math.sin(ang);
    g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip(); g.beginPath();
    for (let d = -R; d <= R; d += step) { const px = cx - dy * d, py = cy + dx * d; g.moveTo(px - dx * R, py - dy * R); g.lineTo(px + dx * R, py + dy * R); }
    g.lineWidth = Math.max(0.6, 0.75 * T.u); g.strokeStyle = INK(T, a); g.lineCap = "round"; g.stroke(); g.restore();
  }

  // A petal as an engraver cuts it: obovate with a notched tip, a wash that pools dark at the base,
  // cross-hatched shadow at the throat and down one side, and fine fanned veins.
  function petal(g, T, x, y, len, wid, ang, col, o = {}) {
    if (len < 2) return;
    const u = T.u, n = 14, simple = o.simple, cup = o.cup || 0;
    const hw = (v) => (v < 0.68 ? wid * Math.pow(Math.sin((PI * 0.5 * v) / 0.68), 0.85) : wid * Math.sqrt(Math.max(0, 1 - Math.pow((v - 0.68) / 0.32, 2))));
    g.save(); g.translate(x, y); g.rotate(ang);
    const build = () => {
      g.beginPath(); g.moveTo(0, 0);
      for (let i = 1; i < n; i++) { const v = i / n; g.lineTo(v * len, -hw(v) * (1 + cup)); }
      g.lineTo(len * 0.955, 0);
      for (let i = n - 1; i >= 1; i--) { const v = i / n; g.lineTo(v * len, hw(v) * (1 - cup)); }
      g.closePath();
    };
    g.save(); g.translate(1.6 * u, 1.2 * u); build();
    const gd = g.createLinearGradient(0, 0, len, 0);
    gd.addColorStop(0, rgba(mixc(col, BLACK, 0.3), 0.9)); gd.addColorStop(0.45, rgba(col, 0.85)); gd.addColorStop(1, rgba(mixc(col, T.c.cream, 0.45), 0.8));
    g.fillStyle = gd; g.fill(); g.restore();
    g.lineCap = "round"; g.lineJoin = "round";
    if (!simple) {
      g.save(); build(); g.clip();
      const st = Math.max(2.6 * u, len * 0.045);
      hatchR(g, T, 0, -wid, len * 0.36, wid, st, 0.45, PI / 2 + 0.3);
      hatchR(g, T, 0, -wid, len * 0.2, wid, st, 0.4, PI / 2 - 0.5);
      hatchR(g, T, len * 0.3, 0, len * 0.92, wid, st * 1.15, 0.32, 0.9);
      g.restore();
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.45, wid * 0.04, len * 0.86, 0);
      for (const j of [-2, -1, 1, 2]) { g.moveTo(len * 0.04, 0); g.quadraticCurveTo(len * 0.45, j * wid * 0.32, len * (0.84 - Math.abs(j) * 0.06), j * wid * 0.42); }
      g.lineWidth = Math.max(0.6, 0.8 * u); g.strokeStyle = INK(T, 0.5); g.stroke();
    } else { g.beginPath(); g.moveTo(0, 0); g.lineTo(len * 0.8, 0); g.lineWidth = Math.max(0.6, 0.7 * u); g.strokeStyle = INK(T, 0.45); g.stroke(); }
    build(); g.lineWidth = Math.max(1, 1.5 * u); g.strokeStyle = INK(T, 0.92); g.stroke();
    if (!simple) { g.save(); g.translate(-0.7 * u, 0.6 * u); build(); g.lineWidth = 0.7 * u; g.strokeStyle = INK(T, 0.26); g.stroke(); g.restore(); }
    g.restore();
  }

  function bloom(g, T, x, y, r, col, o = {}) {
    const open = o.open == null ? 1 : o.open;
    if (open <= 0.03 || r < 3) return;
    const u = T.u, n = o.n || 6, rot = o.rot || 0, pw = o.pw || 0.4, t = o.t || 0, big = r >= 22 * u, jr = rng((o.seed || 5) * 7 + 3);
    if (big) { // watercolour bleeds past the line-work, printed a little off register
      g.save();
      for (let k = 0; k < 3; k++) {
        const ox = x + (jr() - 0.5) * r * 0.35 + 3 * u, oy = y + (jr() - 0.5) * r * 0.35 + 2 * u, rad = r * open * (1.0 + 0.25 * jr());
        const gd = g.createRadialGradient(ox, oy, rad * 0.2, ox, oy, rad);
        gd.addColorStop(0, rgba(col, 0.2)); gd.addColorStop(0.75, rgba(col, 0.12)); gd.addColorStop(1, rgba(col, 0));
        g.fillStyle = gd; g.beginPath(); g.arc(ox, oy, rad, 0, TAU); g.fill();
      }
      g.restore();
    }
    const jit = []; for (let k = 0; k < n * 3; k++) jit.push(jr());
    for (let k = 0; k < n; k++) petal(g, T, x, y, r * open * 0.86 * (0.94 + 0.1 * jit[k]), r * pw * 0.9, rot + ((k + 0.5) * TAU) / n + (jit[k] - 0.5) * 0.1, mixc(col, BLACK, 0.22), { simple: !big, cup: (jit[k] - 0.5) * 0.2 });
    for (let k = 0; k < n; k++) petal(g, T, x, y, r * open * (0.92 + 0.1 * jit[n + k]), r * pw, rot + (k * TAU) / n + (jit[n + k] - 0.5) * 0.12, col, { simple: !big, cup: (jit[n + k] - 0.5) * 0.24 });
    if (big && n >= 6) for (let k = 0; k < n; k++) petal(g, T, x, y, r * open * 0.52 * (0.92 + 0.12 * jit[2 * n + k]), r * pw * 0.62, rot + ((k + 0.5) * TAU) / n, mixc(col, T.c.cream, 0.28), { simple: r < 50 * u });
    const cr = r * 0.22 * open;
    g.save();
    const gd = g.createRadialGradient(x - cr * 0.3, y - cr * 0.3, cr * 0.1, x, y, cr);
    gd.addColorStop(0, rgba(mixc(T.c.ochre, T.c.cream, 0.5), 1)); gd.addColorStop(1, rgba(mixc(T.c.ochre, BLACK, 0.3), 1));
    g.beginPath(); g.arc(x, y, cr, 0, TAU); g.fillStyle = gd; g.fill();
    if (big) { g.save(); g.clip(); hatchR(g, T, x, y - cr * 0.1, x + cr, y + cr, Math.max(2.2 * u, cr * 0.16), 0.45, 0.8); hatchR(g, T, x + cr * 0.3, y + cr * 0.2, x + cr, y + cr, Math.max(2.2 * u, cr * 0.16), 0.4, -0.8); g.restore(); }
    g.beginPath(); g.arc(x, y, cr, 0, TAU); g.lineWidth = Math.max(1, 1.3 * u); g.strokeStyle = INK(T, 0.9); g.stroke();
    const r2 = rng(o.seed || 5);
    g.fillStyle = INK(T, 0.6);
    for (let k = 0; k < 9; k++) { const a = r2() * TAU, d = r2() * cr * 0.8; g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, Math.max(0.7, 0.9 * u), 0, TAU); g.fill(); }
    g.strokeStyle = INK(T, 0.7); g.lineWidth = Math.max(0.7, 0.9 * u);
    for (let k = 0; k < 8; k++) {
      const a = (k * TAU) / 8 + Math.sin(t * 1.4 + k) * 0.05, L = cr * (1.5 + 0.4 * ((k * 3) % 4) / 3);
      g.beginPath(); g.moveTo(x + Math.cos(a) * cr, y + Math.sin(a) * cr); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke();
      g.beginPath(); g.arc(x + Math.cos(a) * L, y + Math.sin(a) * L, Math.max(1, 1.5 * u), 0, TAU); g.fillStyle = rgba(T.c.ochre, 0.95); g.fill(); g.stroke();
    }
    g.restore();
  }

  // A tapering stem: tinted ribbon, outlined, with cross-hatching on the shaded edge.
  function ribbon(g, T, pts, w0, w1, col, q = 1) {
    if (q <= 0) return;
    const n = pts.length / 2 - 1, m = Math.max(1, Math.floor(n * clamp(q))), u = T.u;
    const L = [], R = [];
    for (let i = 0; i <= m; i++) {
      const j0 = Math.max(0, i - 1), j1 = Math.min(n, i + 1);
      const dx = pts[2 * j1] - pts[2 * j0], dy = pts[2 * j1 + 1] - pts[2 * j0 + 1], d = Math.hypot(dx, dy) || 1, w = lerp(w0, w1, i / n) / 2;
      L.push(pts[2 * i] - (dy / d) * w, pts[2 * i + 1] + (dx / d) * w); R.push(pts[2 * i] + (dy / d) * w, pts[2 * i + 1] - (dx / d) * w);
    }
    g.save();
    g.beginPath(); g.moveTo(L[0], L[1]); for (let i = 1; i <= m; i++) g.lineTo(L[2 * i], L[2 * i + 1]); for (let i = m; i >= 0; i--) g.lineTo(R[2 * i], R[2 * i + 1]); g.closePath();
    g.fillStyle = rgba(col, 0.8); g.fill(); g.lineWidth = Math.max(1, 1.5 * u); g.lineJoin = "round"; g.strokeStyle = INK(T, 0.9); g.stroke();
    g.beginPath();
    for (let i = 1; i <= m; i++) { g.moveTo(R[2 * i], R[2 * i + 1]); g.lineTo(R[2 * i] + (L[2 * i] - R[2 * i]) * 0.55, R[2 * i + 1] + (L[2 * i + 1] - R[2 * i + 1]) * 0.55); }
    g.lineWidth = 0.8 * u; g.strokeStyle = INK(T, 0.45); g.stroke();
    g.restore();
  }

  function curl(g, T, x, y, r, dir, ang, q) {
    if (q <= 0) return;
    const pts = [], a0 = ang - (dir * PI) / 2, cx = x - r * Math.cos(a0), cy = y - r * Math.sin(a0);
    for (let i = 0; i <= 22; i++) { const s = i / 22, a = a0 + dir * s * TAU * 1.5, rr2 = r * (1 - s * 0.82); pts.push(cx + rr2 * Math.cos(a), cy + rr2 * Math.sin(a)); }
    line(g, T, pts, Math.max(1, 1.3 * T.u), 0.85, q);
  }

  // A running vine: tinted stem, alternating leaves that unfold as the tip passes, berries or blooms, tendrils.
  function vine(g, T, pts, q, t, o = {}) {
    const n = pts.length / 2 - 1, u = T.u, m = n * clamp(q);
    if (m < 1) return;
    g.save(); g.lineCap = "round"; g.lineJoin = "round";
    const wv = (o.w || 6) * u;
    g.beginPath(); trace(g, pts, q); g.lineWidth = wv + 2.8 * u; g.strokeStyle = INK(T, 0.88); g.stroke();
    g.beginPath(); trace(g, pts, q); g.lineWidth = wv; g.strokeStyle = rgba(T.c.moss, 0.9); g.stroke();
    g.restore();
    const gap = o.gap || 5, sd = o.seed || 0;
    let k = 0;
    for (let i = gap; i <= n; i += gap, k++) {
      if (i > m) break;
      const grow = eo((m - i) / 6), side = k % 2 ? 1 : -1, j0 = Math.max(0, i - 1), j1 = Math.min(n, i + 1);
      const ang = Math.atan2(pts[2 * j1 + 1] - pts[2 * j0 + 1], pts[2 * j1] - pts[2 * j0]);
      const a = ang + side * 0.95 + Math.sin(t * 1.2 + k * 0.9 + sd) * 0.1;
      const sz = (o.size || 40) * u * (0.8 + (0.4 * ((k * 37 + sd) % 10)) / 10);
      leaf(g, T, pts[2 * i], pts[2 * i + 1], sz, sz * 0.36, a, k % 3 === 0 ? T.c.leaf2 : T.c.leaf, { grow, simple: o.simple, veins: 3, bend: side * 0.1, hatch: !o.simple });
      if (o.deco && k % (o.every || 3) === 1 && grow > 0.6) {
        const ba = ang - side * 1.2 + Math.sin(t * 1.1 + k) * 0.08, bx = pts[2 * i] + Math.cos(ba) * sz * 0.55, by = pts[2 * i + 1] + Math.sin(ba) * sz * 0.55;
        if (o.deco === "berry") {
          const col = mixc(T.c.moss, o.berry || T.acc, clamp(o.ripe == null ? 1 : o.ripe));
          for (let c = 0; c < 3; c++) berry(g, T, bx + Math.cos(ba + (c - 1) * 0.9) * sz * 0.2, by + Math.sin(ba + (c - 1) * 0.9) * sz * 0.2 + Math.sin(t * 1.5 + c + k) * u, sz * 0.15, col, { calyx: c === 1 });
        } else bloom(g, T, bx, by, sz * 0.46, T.petals[k % 5], { n: 5, t, seed: k + 2 });
      }
      if (o.curl && k % 4 === 2) curl(g, T, pts[2 * i], pts[2 * i + 1], sz * 0.26, side, ang - side * 0.6, grow);
    }
  }

  // ---- plants ----------------------------------------------------------------------------------------
  function frond(g, T, x, y, len, ang, t, q, seed, col) {
    const u = T.u, n = 18, pts = [x, y];
    let a = ang, px = x, py = y;
    const dir = Math.sin(seed * 12.9) > 0 ? 1 : -1;
    for (let i = 1; i <= n; i++) { a += (dir * 1.0) / n + Math.sin(t * 0.8 + seed + i * 0.2) * 0.004; px += Math.cos(a) * (len / n); py += Math.sin(a) * (len / n); pts.push(px, py); }
    const m = clamp(q);
    line(g, T, pts, Math.max(1.2, 1.7 * u), 0.9, m);
    for (let i = 3; i <= n; i++) {
      const v = i / n;
      if (v > m * 1.02) break;
      const pa = Math.atan2(pts[2 * i + 1] - pts[2 * i - 1], pts[2 * i] - pts[2 * i - 2]), pl = len * 0.27 * (1 - v * 0.82) + 3 * u;
      const wob = Math.sin(t * 1.3 + v * 5 + seed) * 0.07;
      for (const s of [-1, 1]) leaf(g, T, pts[2 * i], pts[2 * i + 1], pl, pl * 0.21, pa + s * (1.15 - v * 0.35) + wob, i % 2 ? col : mixc(col, T.c.leaf2, 0.4), { simple: true, grow: eo((m * 1.02 - v) * 9) });
    }
  }
  function blade(g, T, x, y, h, lean, sw, col, q) {
    const u = T.u, pts = stemPts(x, y, h * q, lean, sw, 10), n = 10, L = [], R = [];
    for (let i = 0; i <= n; i++) { const w = lerp(8 * u, 0.5 * u, Math.pow(i / n, 0.8)); L.push(pts[2 * i] - w / 2, pts[2 * i + 1]); R.push(pts[2 * i] + w / 2, pts[2 * i + 1]); }
    g.save(); g.beginPath(); g.moveTo(L[0], L[1]); for (let i = 1; i <= n; i++) g.lineTo(L[2 * i], L[2 * i + 1]); for (let i = n; i >= 0; i--) g.lineTo(R[2 * i], R[2 * i + 1]); g.closePath();
    g.fillStyle = rgba(col, 0.72); g.fill(); g.lineWidth = Math.max(1, 1.3 * u); g.lineJoin = "round"; g.strokeStyle = INK(T, 0.9); g.stroke();
    g.beginPath(); for (let i = 1; i < n; i += 1) { g.moveTo(R[2 * i], R[2 * i + 1]); g.lineTo(lerp(R[2 * i], pts[2 * i], 0.5), pts[2 * i + 1] + 3 * u); }
    g.lineWidth = 0.7 * u; g.strokeStyle = INK(T, 0.5); g.stroke(); g.restore();
  }

  function spire(g, T, x, y, h, t, q, seed, o = {}) {
    const u = T.u, sw = sway(t, seed), lean = (((seed * 7) % 5) - 2) * 0.025;
    const pts = stemPts(x, y, h, lean, sw, 18), w0 = Math.max(4 * u, h * 0.022);
    ribbon(g, T, pts, w0, w0 * 0.45, T.c.moss, eo(span(q, 0, 0.6)));
    for (let k = 0; k < 3; k++) leaf(g, T, x + (k - 1) * h * 0.012, y, h * 0.3 * (1 - 0.12 * Math.abs(k - 1)), h * 0.07, -PI / 2 + (k - 1) * 0.85 + sw * 0.8, T.c.leaf, { grow: eo(span(q, 0, 0.55)), bend: (k - 1) * 0.12 });
    const col = o.petal || T.c.rose;
    for (let k = 0; k < 8; k++) {
      const v = 0.28 + (0.7 * k) / 8, side = k % 2 ? 1 : -1, p = ptAt(pts, v), len = h * 0.085 * (1 - v * 0.5);
      leaf(g, T, p.x, p.y, len, len * 0.46, PI / 2 - side * 0.6 + sw * 0.5 + Math.sin(t * 1.4 + k) * 0.05, col, { round: 1, veins: 2, n: 12, grow: eo(span(q, 0.3 + v * 0.5, 0.55 + v * 0.5)) });
    }
    return ptAt(pts, 1);
  }
  function daisy(g, T, x, y, h, t, q, seed, o = {}) {
    const u = T.u, sw = sway(t, seed), pts = stemPts(x, y, h, (((seed * 5) % 5) - 2) * 0.03, sw, 14);
    ribbon(g, T, pts, Math.max(4 * u, h * 0.026), Math.max(3 * u, h * 0.016), T.c.moss, eo(span(q, 0, 0.6)));
    for (let k = 0; k < 2; k++) { const p = ptAt(pts, 0.22 + k * 0.2); leaf(g, T, p.x, p.y, h * 0.3, h * 0.065, p.a + (k ? 1 : -1) * 1.0, T.c.leaf, { grow: eo(span(q, 0.15 + k * 0.1, 0.65)), bend: k ? 0.1 : -0.1 }); }
    const tip = ptAt(pts, 1);
    bloom(g, T, tip.x, tip.y, h * 0.2, o.petal || T.c.cream, { n: 11, pw: 0.2, open: eo(span(q, 0.5, 1)), rot: sw * 2 + seed, t, seed });
    return tip;
  }
  function ferns(g, T, x, y, h, t, q, seed) {
    for (let k = 0; k < 5; k++) frond(g, T, x + (k - 2) * h * 0.02, y, h * (0.95 - Math.abs(k - 2) * 0.12), -PI / 2 + (k - 2) * 0.42 + sway(t, seed + k) * 0.6, t, eo(span(q, k * 0.06, 0.8 + k * 0.04)), seed + k, k % 2 ? T.c.leaf2 : T.c.leaf);
  }
  function grass(g, T, x, y, h, t, q, seed) {
    for (let k = 0; k < 7; k++) blade(g, T, x + (k - 3) * h * 0.03, y, h * (0.65 + 0.35 * (((k * 5 + seed) % 7) / 7)), (k - 3) * 0.07, sway(t, seed + k * 0.7) * 1.3, k % 2 ? T.c.leaf2 : T.c.leaf, eo(span(q, k * 0.05, 0.7 + k * 0.05)));
  }
  function sprig(g, T, x, y, h, t, q, seed, o = {}) {
    const u = T.u, sw = sway(t, seed), pts = stemPts(x, y, h, (((seed * 3) % 5) - 2) * 0.04, sw, 16);
    ribbon(g, T, pts, Math.max(3.5 * u, h * 0.02), Math.max(2.5 * u, h * 0.012), T.c.moss, eo(span(q, 0, 0.55)));
    for (let k = 0; k < 5; k++) { const v = 0.15 + k * 0.14, p = ptAt(pts, v), s = k % 2 ? 1 : -1; leaf(g, T, p.x, p.y, h * 0.2 * (1 - v * 0.4), h * 0.06, p.a + s * 0.95 + Math.sin(t * 1.3 + k) * 0.06, T.c.leaf, { grow: eo(span(q, 0.1 + v * 0.4, 0.5 + v * 0.4)), veins: 3 }); }
    const tip = ptAt(pts, 1), col = mixc(T.c.moss, o.berry || T.acc, o.ripe == null ? 1 : o.ripe), gq = eo(span(q, 0.55, 1));
    for (let k = 0; k < 5; k++) { const a = -PI / 2 + (k - 2) * 0.62 + sw * 0.5, d = h * 0.07 * gq * (k % 2 ? 0.8 : 1.15); berry(g, T, tip.x + Math.cos(a) * d + Math.sin(t * 1.6 + k) * u, tip.y + Math.sin(a) * d, h * 0.036 * gq + 1, col, { calyx: k === 2 }); }
    return tip;
  }
  const PLANTS = [spire, daisy, ferns, grass, sprig];
  function plantAt(i, g, T, x, y, h, t, q, seed, o) { return PLANTS[i % PLANTS.length](g, T, x, y, h, t, q, seed, o); }

  // ---- pots, ground, tags, jars ----------------------------------------------------------------------
  function pot(g, T, cx, base, w, h, col) {
    const u = T.u, tw = w * 0.74;
    g.save();
    g.beginPath(); g.moveTo(cx - w / 2, base - h); g.lineTo(cx + w / 2, base - h); g.lineTo(cx + tw / 2, base); g.lineTo(cx - tw / 2, base); g.closePath();
    const gd = g.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
    gd.addColorStop(0, rgba(mixc(col, T.c.cream, 0.45), 0.9)); gd.addColorStop(0.6, rgba(col, 0.9)); gd.addColorStop(1, rgba(mixc(col, BLACK, 0.25), 0.95));
    g.fillStyle = gd; g.fill(); g.lineWidth = Math.max(1.2, 1.8 * u); g.lineJoin = "round"; g.strokeStyle = INK(T, 0.92); g.stroke();
    g.save(); g.clip(); g.strokeStyle = INK(T, 0.38); g.lineWidth = 0.8 * u; g.beginPath();
    for (let k = 0; k < 14; k++) { const xx = cx + w * 0.02 + k * w * 0.034; g.moveTo(xx, base - h * 0.9); g.lineTo(xx - w * 0.04, base); }
    g.stroke(); g.restore();
    rr(g, cx - w * 0.56, base - h - h * 0.2, w * 1.12, h * 0.22, h * 0.05);
    g.fillStyle = rgba(mixc(col, T.c.cream, 0.15), 0.95); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(cx, base - h - h * 0.2, w * 0.5, h * 0.05, 0, 0, TAU); g.fillStyle = rgba(mixc(T.c.clay, BLACK, 0.55), 0.95); g.fill(); g.lineWidth = Math.max(1, 1.2 * u); g.stroke();
    g.restore();
  }
  // An engraved soil section: irregular top edge, rows of hatching and stipple, a few roots.
  function ground(g, T, x0, x1, y, q, seed, t, depth) {
    if (q <= 0) return;
    const u = T.u, xe = x0 + (x1 - x0) * clamp(q), r = rng(seed);
    const top = (x) => y + Math.sin(x / (53 * u) + seed) * 3.5 * u + Math.sin(x / (17 * u) + seed * 2) * 1.6 * u;
    g.save();
    g.beginPath(); g.moveTo(x0, top(x0)); for (let x = x0; x <= xe; x += 8 * u) g.lineTo(x, top(x)); g.lineTo(xe, y + depth); g.lineTo(x0, y + depth); g.closePath();
    g.fillStyle = rgba(T.c.clay, 0.3); g.fill(); g.clip();
    g.strokeStyle = INK(T, 0.5); g.lineWidth = Math.max(0.7, 0.9 * u); g.beginPath();
    for (let row = 0; row < 3; row++) for (let x = x0 + (row % 2) * 4 * u; x < xe; x += 9 * u) { const yy = y + (8 + row * 9) * u + r() * 3 * u; g.moveTo(x, yy); g.lineTo(x + 6 * u, yy + 5 * u); }
    g.stroke(); g.fillStyle = INK(T, 0.5);
    for (let k = 0; k < (xe - x0) / (9 * u); k++) { g.beginPath(); g.arc(x0 + r() * (xe - x0), y + (4 + r() * (depth / u - 6)) * u, Math.max(0.7, (0.7 + r()) * u), 0, TAU); g.fill(); }
    g.restore();
    g.beginPath(); g.moveTo(x0, top(x0)); for (let x = x0; x <= xe; x += 8 * u) g.lineTo(x, top(x)); g.lineWidth = Math.max(1.4, 2.2 * u); g.strokeStyle = INK(T, 0.95); g.lineCap = "round"; g.stroke();
  }
  // A paper luggage tag with notched corners and a loop of string.
  function tag(g, T, cx, cy, w, h, a, rot = 0, hang = 0) {
    if (a <= 0) return;
    const u = T.u, nc = Math.min(h * 0.3, 14 * u);
    g.save(); g.globalAlpha *= a; g.translate(cx, cy); g.rotate(rot);
    if (hang) { g.beginPath(); g.moveTo(-w * 0.18, -h / 2); g.lineTo(0, -h / 2 - hang); g.lineTo(w * 0.18, -h / 2); g.lineWidth = Math.max(1, 1.3 * u); g.strokeStyle = INK(T, 0.8); g.stroke(); }
    g.beginPath(); g.moveTo(-w / 2 + nc, -h / 2); g.lineTo(w / 2 - nc, -h / 2); g.lineTo(w / 2, -h / 2 + nc); g.lineTo(w / 2, h / 2 - nc); g.lineTo(w / 2 - nc, h / 2); g.lineTo(-w / 2 + nc, h / 2); g.lineTo(-w / 2, h / 2 - nc); g.lineTo(-w / 2, -h / 2 + nc); g.closePath();
    g.shadowColor = INK(T, 0.28); g.shadowBlur = 8 * u; g.shadowOffsetY = 3 * u;
    g.fillStyle = rgba(T.hi, 0.97); g.fill(); g.shadowColor = "transparent";
    g.lineWidth = Math.max(1.2, 1.7 * u); g.lineJoin = "round"; g.strokeStyle = INK(T, 0.9); g.stroke();
    g.save(); g.scale(0.93, 0.8); g.beginPath(); g.moveTo(-w / 2 + nc, -h / 2); g.lineTo(w / 2 - nc, -h / 2); g.lineTo(w / 2, -h / 2 + nc); g.lineTo(w / 2, h / 2 - nc); g.lineTo(w / 2 - nc, h / 2); g.lineTo(-w / 2 + nc, h / 2); g.lineTo(-w / 2, h / 2 - nc); g.lineTo(-w / 2, -h / 2 + nc); g.closePath(); g.lineWidth = 0.8 * u; g.strokeStyle = INK(T, 0.35); g.stroke(); g.restore();
    g.restore();
  }
  // A cartouche: an oval ruled twice, for the numbers that matter.
  function cartouche(g, T, cx, cy, w, h, a) {
    if (a <= 0) return;
    const u = T.u;
    g.save(); g.globalAlpha *= a;
    g.beginPath(); g.ellipse(cx, cy, w / 2, h / 2, 0, 0, TAU); g.shadowColor = INK(T, 0.25); g.shadowBlur = 10 * u; g.shadowOffsetY = 4 * u; g.fillStyle = rgba(T.hi, 0.96); g.fill(); g.shadowColor = "transparent";
    g.lineWidth = Math.max(1.4, 2.4 * u); g.strokeStyle = INK(T, 0.92); g.stroke();
    g.beginPath(); g.ellipse(cx, cy, w / 2 - 7 * u, h / 2 - 7 * u, 0, 0, TAU); g.lineWidth = Math.max(0.8, 1 * u); g.strokeStyle = INK(T, 0.5); g.stroke();
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + (s * w) / 2, cy); g.bezierCurveTo(cx + (s * w) / 2 + s * 20 * u, cy - 22 * u, cx + (s * w) / 2 + s * 40 * u, cy - 4 * u, cx + (s * w) / 2 + s * 30 * u, cy + 10 * u); g.lineWidth = Math.max(1, 1.5 * u); g.stroke(); }
    g.restore();
  }
  // A banner with a folded swallow-tail at each end.
  function banner(g, T, cx, cy, w, h, col, a) {
    if (a <= 0) return;
    const u = T.u, f = h * 0.55;
    g.save(); g.globalAlpha *= a; g.lineJoin = "round";
    for (const s of [-1, 1]) {
      const x0 = cx + (s * (w / 2 - f * 0.3)), x1 = cx + s * (w / 2 + f);
      g.beginPath(); g.moveTo(x0, cy - h * 0.35); g.lineTo(x1, cy - h * 0.35); g.lineTo(x1 - s * f * 0.4, cy + h * 0.1); g.lineTo(x1, cy + h * 0.55); g.lineTo(x0, cy + h * 0.55); g.closePath();
      g.fillStyle = rgba(mixc(col, BLACK, 0.2), 0.85); g.fill(); g.lineWidth = Math.max(1.1, 1.5 * u); g.strokeStyle = INK(T, 0.9); g.stroke();
    }
    g.beginPath(); g.rect(cx - w / 2, cy - h / 2, w, h);
    g.shadowColor = INK(T, 0.25); g.shadowBlur = 8 * u; g.shadowOffsetY = 3 * u; g.fillStyle = rgba(mixc(col, T.hi, 0.55), 0.97); g.fill(); g.shadowColor = "transparent";
    g.lineWidth = Math.max(1.3, 1.9 * u); g.strokeStyle = INK(T, 0.92); g.stroke();
    g.save(); g.clip(); g.strokeStyle = INK(T, 0.22); g.lineWidth = 0.8 * u; g.beginPath(); for (let x = cx - w / 2; x < cx + w / 2; x += 6 * u) { g.moveTo(x, cy + h * 0.2); g.lineTo(x - 4 * u, cy + h / 2); } g.stroke(); g.restore();
    g.restore();
  }
  function sparkle(g, T, x, y, r, a) {
    if (a <= 0) return;
    g.save(); g.globalAlpha *= a; g.beginPath();
    g.moveTo(x - r, y); g.lineTo(x + r, y); g.moveTo(x, y - r); g.lineTo(x, y + r);
    g.moveTo(x - r * 0.5, y - r * 0.5); g.lineTo(x + r * 0.5, y + r * 0.5); g.moveTo(x + r * 0.5, y - r * 0.5); g.lineTo(x - r * 0.5, y + r * 0.5);
    g.lineWidth = Math.max(1, 1.5 * T.u); g.lineCap = "round"; g.strokeStyle = INK(T, 0.9); g.stroke(); g.restore();
  }

  // ---- creatures -------------------------------------------------------------------------------------
  function bee(g, T, x, y, s, ang, t) {
    const u = T.u;
    g.save(); g.translate(x, y); g.rotate(ang); g.scale(s, s);
    const fl = Math.sin(t * 52) * 0.5;
    for (const sd of [-1, 1]) {
      g.save(); g.translate(-2, sd * -4); g.rotate(sd * (-0.9 + fl)); g.beginPath(); g.ellipse(7, 0, 13, 5.5, 0, 0, TAU);
      g.fillStyle = "rgba(255,255,255,0.55)"; g.fill(); g.lineWidth = 1.1 / s * u * 1.4; g.strokeStyle = INK(T, 0.8); g.stroke();
      g.beginPath(); g.moveTo(0, 0); g.lineTo(18, 0); g.lineWidth = 0.6 / s * u * 1.4; g.stroke(); g.restore();
    }
    g.beginPath(); g.ellipse(0, 0, 14, 9, 0, 0, TAU); g.fillStyle = rgba(T.c.ochre, 0.98); g.fill();
    g.save(); g.clip(); g.fillStyle = INK(T, 0.88); for (const bx of [-6, 0, 6]) g.fillRect(bx - 1.6, -10, 3.2, 20); g.restore();
    g.lineWidth = 1.5 / s * u * 1.4; g.strokeStyle = INK(T, 0.95); g.beginPath(); g.ellipse(0, 0, 14, 9, 0, 0, TAU); g.stroke();
    g.beginPath(); g.arc(15, -1, 6, 0, TAU); g.fillStyle = INK(T, 0.92); g.fill();
    g.beginPath(); g.moveTo(-14, 0); g.lineTo(-19, 0); g.stroke();
    g.beginPath(); g.moveTo(18, -4); g.quadraticCurveTo(24, -10, 28, -8); g.stroke();
    g.restore();
  }
  function butterfly(g, T, x, y, s, rot, t, col) {
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s);
    const u = T.u, fl = 0.28 + 0.72 * Math.abs(Math.sin(t * 6.5));
    g.save(); g.scale(fl, 1);
    for (const sd of [-1, 1]) {
      leaf(g, T, 0, -2, 46, 21, -PI / 2 + sd * 0.95, col, { round: 1, veins: 4, n: 14 });
      leaf(g, T, 0, 2, 32, 15, PI / 2 - sd * 0.85, mixc(col, T.c.ochre, 0.5), { round: 1, veins: 3, n: 12 });
    }
    g.restore();
    g.beginPath(); g.ellipse(0, 0, 3.4, 17, 0, 0, TAU); g.fillStyle = INK(T, 0.95); g.fill();
    g.beginPath(); g.moveTo(0, -16); g.quadraticCurveTo(-8, -30, -14, -30); g.moveTo(0, -16); g.quadraticCurveTo(8, -30, 14, -30); g.lineWidth = 1.2 * u / s * 1.2; g.strokeStyle = INK(T, 0.9); g.stroke();
    g.restore();
  }
  function fluff(g, T, x, y, s, rot, a) {
    const u = T.u;
    g.save(); g.translate(x, y); g.rotate(rot); g.globalAlpha *= a; g.lineCap = "round";
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(s * 0.1, s * 0.3, 0, s * 0.62); g.lineWidth = Math.max(1, 1.5 * u); g.strokeStyle = INK(T, 0.85); g.stroke();
    g.beginPath();
    for (let k = 0; k < 15; k++) { const an = -PI * 0.95 + (k * PI * 1.9) / 14 - PI / 2 + PI / 2; const ax = Math.cos(an - PI / 2 + PI / 2) * s * 0.5, ay = Math.sin(an) * s * 0.5; g.moveTo(0, 0); g.lineTo(ax, ay - s * 0.05); }
    g.lineWidth = Math.max(0.7, 0.9 * u); g.strokeStyle = INK(T, 0.55); g.stroke();
    g.fillStyle = INK(T, 0.8);
    for (let k = 0; k < 15; k++) { const an = -PI * 0.95 + (k * PI * 1.9) / 14; g.beginPath(); g.arc(Math.cos(an) * s * 0.5, Math.sin(an) * s * 0.5 - s * 0.05, Math.max(1, 1.5 * u), 0, TAU); g.fill(); }
    g.beginPath(); g.arc(0, 0, Math.max(2, 3 * u), 0, TAU); g.fillStyle = rgba(T.c.clay, 0.9); g.fill();
    g.restore();
  }
  // Bee and butterfly work across the scene; fully determined by time.
  function critters(g, T, t, tgt) {
    const { w, h, u } = T;
    const bx = (k) => w * 0.5 + w * 0.34 * Math.sin(t * 0.55 + 1.0) + 70 * u * Math.sin(t * 1.9 + k);
    const by = (k) => h * 0.6 + h * 0.2 * Math.sin(t * 0.83) + 40 * u * Math.cos(t * 2.3 + k);
    const x = bx(0), y = by(0), x2 = bx(0.01), y2 = by(0.01);
    if (tgt) { // visit a given flower for part of every cycle
      const k = (Math.sin(t * 0.7) + 1) / 2, vx = tgt.x + Math.cos(t * 3) * 34 * u, vy = tgt.y - 44 * u + Math.sin(t * 4.1) * 18 * u;
      const mx = lerp(x, vx, k * k), my = lerp(y, vy, k * k);
      bee(g, T, mx, my, 1.7 * u, Math.atan2(my - (lerp(y2, vy, k * k)), mx - lerp(x2, vx, k * k)) + PI + (Math.cos(t * 0.55 + 1) > 0 ? 0 : PI) * 0, t);
    } else bee(g, T, x, y, 1.7 * u, Math.cos(t * 0.55 + 1) > 0 ? 0 : PI, t);
    const bfx = w * (0.15 + 0.7 * ((t * 0.035 + 0.3) % 1)), bfy = h * 0.46 + h * 0.18 * Math.sin(t * 0.9) + 25 * u * Math.sin(t * 3.1);
    butterfly(g, T, bfx, bfy, 0.95 * u, 0.5 + Math.sin(t * 0.9) * 0.3, t, T.acc);
  }

  // ---- paper -----------------------------------------------------------------------------------------
  let PAPER = null, PAPERKEY = "";
  function paperLayer(T) {
    const key = `${T.w}x${T.h}:${T.paperS}:${Math.round(T.tex * 20)}`;
    if (PAPER && PAPERKEY === key) return PAPER;
    const { w: W, h: H, u } = T, c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d"), r = rng(60), tx = T.tex;
    g.fillStyle = T.paperS; g.fillRect(0, 0, W, H);
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    vg.addColorStop(0, rgba(T.rim, 0)); vg.addColorStop(1, rgba(T.rim, 0.7 * (0.35 + 0.65 * tx)));
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    if (tx > 0) {
      g.lineWidth = 0.7; g.strokeStyle = rgba(T.dark ? [255, 255, 255] : T.fox, 0.045 * tx);
      g.beginPath(); for (let x = 0; x < W; x += 13 * u) { g.moveTo(x, 0); g.lineTo(x + 1.5 * Math.sin(x), H); } g.stroke();
      const area = (W * H) / (1920 * 1080), fibers = Math.round(2600 * area * tx);
      for (let i = 0; i < fibers; i++) {
        const x = r() * W, y = r() * H, a = r() * TAU, l = (5 + r() * 22) * u;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.7) * l * 0.5, y + Math.sin(a + 0.7) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
        g.lineWidth = (0.5 + r() * 0.7) * u; g.strokeStyle = rgba(T.dark ? [255, 250, 230] : T.fox, (0.03 + r() * 0.06) * tx); g.stroke();
      }
      for (let i = 0; i < Math.round(46 * area * tx + 6); i++) {
        const x = r() * W, y = r() * H, rad = (10 + r() * 55) * u, gd = g.createRadialGradient(x, y, 0, x, y, rad);
        gd.addColorStop(0, rgba(T.fox, (0.06 + r() * 0.1) * tx)); gd.addColorStop(1, rgba(T.fox, 0));
        g.fillStyle = gd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      for (let i = 0; i < Math.round(800 * area * tx); i++) { g.beginPath(); g.arc(r() * W, r() * H, (0.4 + r() * 1.1) * u, 0, TAU); g.fillStyle = rgba(T.dark ? [255, 250, 230] : T.ink, (0.06 + r() * 0.18) * tx); g.fill(); }
    }
    PAPER = c; PAPERKEY = key;
    return c;
  }

  // ---- the stage: plate, border vine, gutters, drift, statements --------------------------------------
  let PERIM = null, PERIMKEY = "";
  function perim(T) {
    const key = `${T.w}x${T.h}`;
    if (PERIM && PERIMKEY === key) return PERIM;
    const { w: W, h: H, u } = T, m = 62 * u, raw = [[m, H - m], [m, m], [W - m, m], [W - m, H - m], [W * 0.5, H - m]], o = [];
    let s = 0;
    for (let i = 0; i < raw.length - 1; i++) {
      const [x0, y0] = raw[i], [x1, y1] = raw[i + 1], len = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(len / (14 * u));
      for (let k = (i ? 1 : 0); k <= n; k++) {
        const f = k / n, nx = -(y1 - y0) / len, ny = (x1 - x0) / len, wob = Math.sin((s + f * len) / (95 * u)) * 5 * u;
        o.push(x0 + (x1 - x0) * f + nx * wob, y0 + (y1 - y0) * f + ny * wob);
      }
      s += len;
    }
    PERIM = o; PERIMKEY = key;
    return o;
  }
  function plate(g, T) {
    const { w: W, h: H, u } = T, m1 = 28 * u, m2 = 44 * u;
    g.save();
    g.strokeStyle = INK(T, 0.88); g.lineWidth = 3.6 * u; g.strokeRect(m1, m1, W - 2 * m1, H - 2 * m1);
    g.lineWidth = 1.2 * u; g.strokeRect(m2, m2, W - 2 * m2, H - 2 * m2);
    g.beginPath();
    for (let x = m1 + 12 * u, k = 0; x < W - m1; x += 12 * u, k++) { const l = k % 5 === 0 ? 11 * u : 5 * u; g.moveTo(x, m1 + 2 * u); g.lineTo(x, m1 + 2 * u + l); g.moveTo(x, H - m1 - 2 * u); g.lineTo(x, H - m1 - 2 * u - l); }
    for (let y = m1 + 12 * u, k = 0; y < H - m1; y += 12 * u, k++) { const l = k % 5 === 0 ? 11 * u : 5 * u; g.moveTo(m1 + 2 * u, y); g.lineTo(m1 + 2 * u + l, y); g.moveTo(W - m1 - 2 * u, y); g.lineTo(W - m1 - 2 * u - l, y); }
    g.lineWidth = 0.8 * u; g.strokeStyle = INK(T, 0.55); g.stroke();
    g.restore();
  }
  function dapple(g, T, t) {
    const { w: W, h: H, u } = T;
    for (let k = 0; k < 5; k++) {
      const x = W * (0.12 + 0.76 * ((k * 0.37) % 1)) + Math.sin(t * 0.21 + k * 2) * 120 * u, y = H * (0.2 + 0.6 * ((k * 0.53) % 1)) + Math.cos(t * 0.17 + k) * 90 * u, rad = (260 + 90 * (k % 3)) * u;
      const gd = g.createRadialGradient(x, y, 0, x, y, rad), a = (0.05 + 0.025 * Math.sin(t * 0.5 + k)) * (T.dark ? 0.6 : 1);
      gd.addColorStop(0, T.dark ? `rgba(255,248,215,${a})` : INK(T, a)); gd.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }
  function drift(g, T, t, fa = 0.9) {
    const { w: W, h: H, u } = T;
    for (let k = 0; k < 9; k++) {
      const vx = (30 + 16 * (k % 4)) * u, x = ((k * 337 + t * vx + 150 * u) % (W + 300 * u)) - 150 * u, y = H * (0.22 + 0.62 * ((k * 0.381) % 1)) + Math.sin(t * 0.6 + k * 1.7) * 60 * u;
      fluff(g, T, x, y, (24 + (k % 3) * 8) * u, Math.sin(t * 0.8 + k) * 0.5 + 0.2, fa);
    }
    const r = rng(77);
    g.save();
    for (let k = 0; k < 44; k++) {
      const x0 = r() * W, y0 = r() * H, sp = (7 + r() * 16) * u, ph = r() * TAU, y = (((y0 - t * sp) % H) + H) % H, x = x0 + Math.sin(t * 0.5 + ph) * 14 * u, rad = (1.3 + r() * 2.2) * u;
      g.globalAlpha = 0.25 + 0.5 * Math.abs(Math.sin(t * 1.3 + ph));
      g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fillStyle = T.dark ? "rgba(255,240,190,0.9)" : rgba(T.c.ochre, 0.95); g.fill();
    }
    g.restore();
  }
  // The divider under each headline grows outward from its middle.
  function rule(g, T, y, q) {
    if (q <= 0) return;
    const { w: W, u, side } = T, cx = W / 2, hw = (W / 2 - side) * eo(q);
    g.save(); g.lineCap = "round";
    for (const [dy, lw, a] of [[0, 2.4, 0.9], [7, 1, 0.55]]) {
      g.beginPath(); g.moveTo(cx - hw, y + dy * u); g.lineTo(cx - 26 * u, y + dy * u); g.moveTo(cx + 26 * u, y + dy * u); g.lineTo(cx + hw, y + dy * u);
      g.lineWidth = lw * u; g.strokeStyle = INK(T, a); g.stroke();
    }
    if (q > 0.5) {
      const k = eo((q - 0.5) * 2);
      g.beginPath(); g.moveTo(cx, y - 11 * u * k); g.lineTo(cx + 11 * u * k, y + 3 * u); g.lineTo(cx, y + 17 * u * k); g.lineTo(cx - 11 * u * k, y + 3 * u); g.closePath();
      g.fillStyle = rgba(T.acc, 0.85); g.fill(); g.lineWidth = 1.5 * u; g.strokeStyle = INK(T, 0.9); g.stroke();
      for (const s of [-1, 1]) leaf(g, T, cx + s * 16 * u, y + 3 * u, 26 * u, 8 * u, s > 0 ? -0.2 : PI + 0.2, T.c.leaf, { grow: k, simple: true });
    }
    g.restore();
  }
  function wipeX(T, w, y) { return lerp(-0.12 * T.w, 1.12 * T.w, eio(w)) + Math.sin(y / (110 * T.u) + w * 6) * 55 * T.u; }
  function clipSide(g, T, w, side) {
    const st = 40 * T.u;
    g.beginPath();
    if (side === "left") { g.moveTo(-60, -60); for (let y = -60; y <= T.h + 60; y += st) g.lineTo(wipeX(T, w, y), y); g.lineTo(-60, T.h + 60); }
    else { g.moveTo(T.w + 60, -60); for (let y = -60; y <= T.h + 60; y += st) g.lineTo(wipeX(T, w, y), y); g.lineTo(T.w + 60, T.h + 60); }
    g.closePath(); g.clip();
  }
  // The change between scenes: a leaf-hung vine sweeps across the plate.
  function edgeVine(g, T, w, t) {
    const pts = [];
    for (let y = -50 * T.u; y <= T.h + 50 * T.u; y += 30 * T.u) pts.push(wipeX(T, w, y), y);
    vine(g, T, pts, 1, t, { w: 9, gap: 2, size: 120, deco: "bloom", every: 3, curl: true, seed: 3 });
  }

  // The statement scenes (title and closing): a ruled label garlanded with vine, a meadow below, hanging sprigs above.
  function hero(g, T, t, local, kind) {
    const { w: W, h: H, u, tall } = T, closing = kind === "closing";
    const x0 = W * (tall ? 0.07 : 0.075), x1 = W - x0, y0 = H * (tall ? 0.29 : 0.25), y1 = H * (tall ? 0.71 : 0.75);
    const q0 = (i, n) => 0.72 + 0.28 * eo(span(local, (i / n) * 0.7, 0.9 + (i / n) * 0.7));
    // Meadow along the foot.
    const base = H - 66 * u, nm = Math.round(W / (tall ? 150 : 138 * u) * (tall ? 1 : u));
    for (let i = 0; i < nm; i++) {
      const x = (W * (i + 0.5)) / nm, hh = (tall ? 0.15 : 0.2) * H * (0.6 + 0.4 * ((i * 7) % 5) / 4), type = (i * 3 + (closing ? 1 : 0)) % 5;
      plantAt(type, g, T, x, base + (type === 0 ? 0 : 6 * u), hh, t, q0(i, nm), i + 1, { petal: T.petals[(i + (closing ? 2 : 0)) % 5], berry: T.acc, ripe: closing ? eo(span(local, 0.2, 2.4)) : 0.3 });
    }
    ground(g, T, 56 * u, W - 56 * u, base, eo(span(local, 0, 0.8)) * 0 + 1, 14, t, 22 * u);
    // Sprigs hanging from the top rule.
    const nh = Math.round(W / (210 * u)) + (tall ? 1 : 0);
    for (let i = 0; i < nh; i++) {
      const x = (W * (i + 0.5)) / nh;
      g.save(); g.translate(x, 52 * u); g.scale(1, -1);
      plantAt([4, 0, 2, 4, 1][i % 5], g, T, 0, 0, (tall ? 0.1 : 0.16) * H * (0.7 + 0.3 * ((i * 5) % 3) / 2), t, q0(i + 3, nh), i + 9, { petal: T.petals[(i + 1) % 5], berry: T.acc, ripe: closing ? eo(span(local, 0.2, 2.4)) : 0.3 });
      g.restore();
    }
    // The label.
    if (T.bg) {
      g.save(); rr(g, x0, y0, x1 - x0, y1 - y0, 10 * u); g.clip();
      g.globalAlpha = T.dark ? 0.0 : 0.0;
      g.restore();
    }
    g.save();
    if (T.bg) { rr(g, x0, y0, x1 - x0, y1 - y0, 10 * u); g.fillStyle = rgba(T.paper, 0.86); g.shadowColor = INK(T, 0.3); g.shadowBlur = 24 * u; g.shadowOffsetY = 8 * u; g.fill(); g.shadowColor = "transparent"; }
    // A great engraved bloom turns slowly inside the label, with a frond either side.
    g.save(); rr(g, x0, y0, x1 - x0, y1 - y0, 10 * u); g.clip();
    g.globalAlpha = T.dark ? 0.06 : 0.065;
    bloom(g, T, W / 2, H / 2, H * (tall ? 0.34 : 0.62), closing ? T.c.ochre : T.c.rose, { n: 14, pw: 0.26, rot: t * 0.035 + (closing ? 1 : 0), t, seed: 7 });
    g.globalAlpha = T.dark ? 0.2 : 0.26;
    ferns(g, T, x0 + 90 * u, y1 - 6 * u, (y1 - y0) * 0.95, t, 1, closing ? 17 : 16);
    ferns(g, T, x1 - 90 * u, y1 - 6 * u, (y1 - y0) * 0.95, t, 1, closing ? 19 : 18);
    g.restore();
    rr(g, x0, y0, x1 - x0, y1 - y0, 10 * u); g.lineWidth = 3.4 * u; g.strokeStyle = INK(T, 0.9); g.stroke();
    rr(g, x0 + 12 * u, y0 + 12 * u, x1 - x0 - 24 * u, y1 - y0 - 24 * u, 5 * u); g.lineWidth = 1.1 * u; g.strokeStyle = INK(T, 0.55); g.stroke();
    g.restore();
    // Garland round the label, growing clockwise from its top-left corner.
    const gp = [], steps = 12;
    const ring = [[x0 - 6 * u, y0 - 6 * u], [x1 + 6 * u, y0 - 6 * u], [x1 + 6 * u, y1 + 6 * u], [x0 - 6 * u, y1 + 6 * u], [x0 - 6 * u, y0 - 6 * u]];
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = ring[i], [bx, by] = ring[i + 1], len = Math.hypot(bx - ax, by - ay), n = Math.ceil(len / (16 * u));
      for (let k = i ? 1 : 0; k <= n; k++) { const f = k / n, wob = Math.sin((i * 700 + f * len) / (70 * u)) * 7 * u, nx = -(by - ay) / len, ny = (bx - ax) / len; gp.push(ax + (bx - ax) * f + nx * wob, ay + (by - ay) * f + ny * wob); }
    }
    vine(g, T, gp, 0.3 + 0.7 * eo(span(local, 0, 2.2)), t, { w: 7, gap: 4, size: 44, deco: "berry", every: 3, ripe: closing ? eo(span(local, 0.2, 2.4)) : 0.35, berry: T.acc, curl: true, seed: closing ? 5 : 1 });
    // Big blooms at the corners and the middle of the top edge.
    const spots = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [W / 2, y0 - 4 * u]];
    spots.forEach(([bx, by], i) => {
      const r = (i === 4 ? 82 : 64 + (i % 2) * 14) * u * (tall ? 0.9 : 1), open = 0.45 + 0.55 * eo(span(local, 0.1 + i * 0.12, 1.1 + i * 0.12));
      const col = i === 4 ? T.acc : T.petals[(i + (closing ? 1 : 0)) % 5];
      for (const s of [-1, 1]) leaf(g, T, bx, by, r * 1.6, r * 0.42, (by < H / 2 ? 0.6 : -0.6) * s + (bx < W / 2 ? PI : 0) * (bx < W / 2 ? 1 : 0) + (by < H / 2 ? PI / 2 : -PI / 2) * (i === 4 ? 1 : 0), T.c.leaf, { grow: open, bend: 0.12 * s });
      bloom(g, T, bx, by, r * open, col, { n: i === 4 ? 9 : 7, rot: t * 0.07 + i, open: 1, t, seed: i + 3, pw: 0.34 });
    });
  }

  // Faded specimens behind the drawn scenes, kept to the margins and the foot so the drawing reads cleanly.
  function specimens(g, T, t, base) {
    const { w: W, h: H, u } = T;
    g.save(); g.globalAlpha *= T.dark ? 0.1 : 0.12;
    ferns(g, T, W * 0.05, base, H * 0.55, t, 1, 71);
    ferns(g, T, W * 0.95, base, H * 0.55, t, 1, 81);
    g.globalAlpha = (T.dark ? 0.22 : 0.26);
    const nb = Math.round(W / (190 * u));
    for (let i = 0; i < nb; i++) plantAt(i * 2 + 1, g, T, (W * (i + 0.5)) / nb, base, H * (T.tall ? 0.1 : 0.2) * (0.6 + 0.4 * ((i * 5 + 1) % 4) / 3), t, 1, 100 + i, { petal: T.petals[(i + 1) % 5], berry: T.acc, ripe: 0.8 });
    g.restore();
  }
  function tabCap(id) { return `Tab. ${ROMAN[Math.max(0, ORDER.indexOf(id))]} · ${CAPTION[id] || "Hortus"}`; }
  function drawTab(g, T, id) {
    const { w: W, h: H, u } = T, cap = tabCap(id), cw = measure(g, cap, 30 * u) + 44 * u;
    tag(g, T, W / 2, H - 62 * u, cw, 40 * u, 0.96);
    txt(g, T, cap, W / 2, H - 62 * u, 30 * u, { color: INK(T, 0.85), halo: false });
  }
  function withSide(g, T, w, side, fn) { g.save(); clipSide(g, T, w, side); fn(); g.restore(); }

  // Where the headline ends, read from the page once per frame, so the legend and rule sit just below it.
  function headGeo(T, id) {
    const u = T.u;
    let bottom = (T.tall ? 170 + 82 : 96 + 76) * u;
    try {
      const el = document.getElementById(id + "-title"), sc = document.getElementById(id + "-scene");
      if (el && sc && el.offsetHeight > 0) bottom = sc.offsetTop + el.offsetTop + el.offsetHeight;
    } catch (e) { /* no page: keep the default */ }
    return { cap: bottom + 42 * u, rule: bottom + 98 * u };
  }
  // Legend and divider for a drawn scene. Between two drawn scenes they carry straight through (the vine swaps them).
  function header(g, T, id, info, outgoing) {
    const u = T.u, geo = headGeo(T, id), carry = outgoing || (FR.prev && !stmt(FR.prev));
    rule(g, T, geo.rule, carry ? 1 : span(info.local, 0.05, 0.9));
    const lg = LEGEND[id];
    if (!lg) return;
    const a = carry ? 1 : eo(span(info.local, 0.3, 0.8)), x = T.side;
    if (a <= 0) return;
    g.save(); g.globalAlpha *= a;
    const fs = 42 * u, tw = measure(g, lg, fs, "italic", 500);
    leaf(g, T, x + 14 * u, geo.cap + 2 * u, 30 * u, 9 * u, -0.35 + Math.sin(info.t * 1.6) * 0.08, T.c.leaf, { simple: true });
    leaf(g, T, x + 14 * u, geo.cap + 2 * u, 26 * u, 8 * u, 0.45 + Math.sin(info.t * 1.4 + 1) * 0.08, T.c.leaf2, { simple: true });
    txt(g, T, lg, x + 52 * u, geo.cap + (1 - a) * 8 * u, fs, { align: "left", weight: 500, color: INK(T, 0.82), halo: false });
    g.beginPath(); g.moveTo(x + 52 * u, geo.cap + 26 * u); g.lineTo(x + 52 * u + tw * eo(span(info.local, carry ? -1 : 0.5, carry ? 0 : 1.1)), geo.cap + 26 * u);
    g.lineWidth = Math.max(0.8, 1 * u); g.strokeStyle = INK(T, 0.45); g.stroke();
    g.restore();
  }

  // The page's own type follows the plate: headlines ink in slowly, and are clipped to the side of the
  // sweeping vine that they belong to. Everything is set every frame from time alone.
  const INKCOL = {};
  function vineClip(T, sc, w, side) {
    const u = T.u, top = sc.offsetTop, pts = [], edge = side === "left" ? -400 : T.w + 400;
    for (let y = -80 * u; y <= T.h + 80 * u; y += 36 * u) pts.push(`${wipeX(T, w, y).toFixed(1)}px ${(y - top).toFixed(1)}px`);
    return `polygon(${edge}px ${(-80 * u - top).toFixed(1)}px, ${pts.join(", ")}, ${edge}px ${(T.h + 80 * u - top).toFixed(1)}px)`;
  }
  function domSync(S, T, info, prev, wipe, ow) {
    let root;
    try { root = document.getElementById("root"); } catch (e) { return; }
    if (!root || !document.getElementById("title-scene")) return;
    root.setAttribute("data-bt-ink", "1");
    const c = (window.__dreamcut && window.__dreamcut.controls) || {}, e = Number(c.entrance ?? 0.7) || 0.7;
    for (const id of ORDER) {
      const sc = document.getElementById(id + "-scene");
      if (!sc) continue;
      let clip = "none", fade = 1;
      if (id === info.scene) {
        if (wipe >= 0 && prev) clip = vineClip(T, sc, wipe, "left");
        else if (ow > 0) clip = ow >= 1 ? "inset(0 0 100% 0)" : vineClip(T, sc, ow, "right");
        if (info.next) fade = 1 - span(info.local, info.hold - 0.8, info.hold - 0.08);
      }
      sc.style.clipPath = clip; sc.style.webkitClipPath = clip;
      sc.style.filter = fade < 1 ? `opacity(${clamp(fade).toFixed(3)})` : "none";
      const els = id === "title" ? [["kicker", 0], ["title", 0.12]] : id === "closing" ? [["closing", 0]] : [[id + "-title", 0]];
      for (const [eid, st] of els) {
        const el = document.getElementById(eid);
        if (!el) continue;
        const key = eid + "|" + S.look.ink + "|" + S.accent;
        const col = INKCOL[key] || (INKCOL[key] = parse(getComputedStyle(el).color));
        let k = 1, sk = 0;
        if (id === info.scene) { const l = info.local - st; k = eio(span(l, 0.45 * e, 0.45 * e + 0.48)); sk = 1 - span(l, 0.45 * e + 0.42, 0.45 * e + 0.7); }
        el.style.setProperty("--bt-fill", rgba(col, k.toFixed(3)));
        el.style.setProperty("--bt-stroke", sk > 0 ? `${Math.max(1, 1.6 * T.u).toFixed(2)}px ${rgba(col, sk.toFixed(3))}` : "0px rgba(0,0,0,0)");
        // A soft bleed while the ink soaks in.
        el.style.setProperty("--bt-bleed", k > 0 && k < 1 ? `0 0 ${(6 * (1 - k) * T.u).toFixed(1)}px ${rgba(col, (0.35 * Math.sin(PI * k)).toFixed(3))}` : "0 0 0 rgba(0,0,0,0)");
      }
    }
  }

  function stage(ctx, S, info) {
    const T = theme(S), { w: W, h: H, u } = T, t = info.t, shown = plan();
    const cur = info.scene, prev = info.index > 0 ? shown[info.index - 1] || null : null;
    const wipe = info.index > 0 && cur && prev && info.local < info.change ? clamp(info.local / Math.max(0.01, info.change)) : -1;
    // A closing statement that ends the film is cleared by one last sweep before the final half second.
    const ow = cur === "closing" && !info.next && info.hold >= 1.8 ? span(info.local, info.hold - 1.0, info.hold - 0.5) : 0;
    FR = { idx: info.index, cur, prev, wipe };
    domSync(S, T, info, prev, wipe, ow);
    ctx.save();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    if (T.bg) { ctx.drawImage(paperLayer(T), 0, 0); dapple(ctx, T, t); }
    const qn = 0.5 + 0.5 * eo(span(t, 0, 3)), base = H - 62 * u;
    if (!T.tall) {
      spire(ctx, T, 98 * u, base, H * 0.5, t, qn, 31, { petal: T.c.plum });
      daisy(ctx, T, 64 * u, base, H * 0.3, t, qn, 32);
      sprig(ctx, T, W - 100 * u, base, H * 0.46, t, qn, 33, { berry: T.acc, ripe: 0.8 });
      spire(ctx, T, W - 66 * u, base, H * 0.32, t, qn, 34, { petal: T.c.blue });
    }
    const curNS = !!cur && !stmt(cur), prevNS = !!prev && !stmt(prev);
    if (curNS && (wipe < 0 || prevNS)) specimens(ctx, T, t, base);
    else if (curNS) withSide(ctx, T, wipe, "left", () => specimens(ctx, T, t, base));
    else if (wipe >= 0 && prevNS) withSide(ctx, T, wipe, "right", () => specimens(ctx, T, t, base));
    const nsW = curNS ? (wipe < 0 || prevNS ? 1 : wipe) : (wipe >= 0 && prevNS ? 1 - wipe : 0);
    grass(ctx, T, 150 * u, base + 4 * u, 190 * u, t, qn, 41);
    ferns(ctx, T, T.tall ? 150 * u : 230 * u, base + 4 * u, 210 * u, t, qn, 42);
    grass(ctx, T, W - 150 * u, base + 4 * u, 190 * u, t, qn, 43);
    ferns(ctx, T, W - (T.tall ? 150 : 230) * u, base + 4 * u, 210 * u, t, qn, 44);
    plate(ctx, T);
    const vg = clamp(t / Math.max(1, info.length * 0.6));
    vine(ctx, T, perim(T), 0.81 + 0.19 * eo(vg), t, { w: 6, gap: 4, size: 34, deco: "berry", every: 3, berry: T.acc, ripe: 0.2 + 0.8 * clamp(t / Math.max(1, info.length)), seed: 2, curl: true });
    drift(ctx, T, t, lerp(0.9, 0.42, nsW));
    let sweep = -1;
    if (cur && stmt(cur)) {
      if (wipe >= 0) withSide(ctx, T, wipe, "left", () => hero(ctx, T, t, info.local, cur));
      else if (ow > 0) {
        // The end plate: behind the sweep a single specimen grows to full flower in the middle of the page.
        lush(ctx, T, W / 2, H - 120 * u, H * (T.tall ? 0.42 : 0.6), t, 0.35 + 0.65 * eo(span(info.local, info.hold - 1.0, info.hold - 0.15)), 12, T.acc);
        if (ow < 1) { withSide(ctx, T, ow, "right", () => hero(ctx, T, t, info.local, cur)); sweep = ow; }
      }
      else hero(ctx, T, t, info.local, cur);
      critters(ctx, T, t, null);
      if (wipe >= 0 && prev && stmt(prev)) sweep = wipe;
    }
    if (wipe >= 0 && prev && stmt(prev)) withSide(ctx, T, wipe, "right", () => { hero(ctx, T, t, 9, prev); if (!(cur && stmt(cur))) critters(ctx, T, t, null); });
    // Plate numeral and caption on the foot rule; the sweeping vine swaps one for the next.
    if (wipe >= 0 && prev && prev !== cur) { withSide(ctx, T, wipe, "left", () => drawTab(ctx, T, cur)); withSide(ctx, T, wipe, "right", () => drawTab(ctx, T, prev)); }
    else drawTab(ctx, T, cur || "title");
    if (sweep > 0 && sweep < 1) edgeVine(ctx, T, sweep, t);
    ctx.restore();
  }

  // ---- scene drawers ----------------------------------------------------------------------------------
  const M = window.DreamcutMotion;
  const rrPath = (g, x, y, w, h, r) => {
    const q = Math.max(0, Math.min(r, w / 2, h / 2));
    g.moveTo(x + q, y); g.arcTo(x + w, y, x + w, y + h, q); g.arcTo(x + w, y + h, x, y + h, q); g.arcTo(x, y + h, x, y, q); g.arcTo(x, y, x + w, y, q); g.closePath();
  };
  function hatchBox(g, T, x0, y0, x1, y1, step, a, slope = 0.6) {
    g.save(); g.beginPath();
    for (let x = x0 - (y1 - y0) * slope; x < x1; x += step) { g.moveTo(x, y1); g.lineTo(x + (y1 - y0) * slope, y0); }
    g.lineWidth = Math.max(0.6, 0.8 * T.u); g.strokeStyle = INK(T, a); g.stroke(); g.restore();
  }
  function wrap(impl, id) {
    return (g, S, box, p, d, info) => {
      const T = theme(S), outgoing = info.exit !== undefined, w = outgoing ? info.exit : FR.wipe, wiping = w >= 0 && w < 1;
      g.save();
      if (wiping) clipSide(g, T, w, outgoing ? "right" : "left");
      header(g, T, id, info, outgoing);
      const tgt = impl(g, S, T, box, p, d, info);
      critters(g, T, info.t, tgt);
      g.restore();
      if (wiping) edgeVine(g, T, w, info.t);
    };
  }
  // Wood plank desk or shelf edge.
  function desk(g, T, x0, x1, y, q) {
    if (q <= 0) return;
    const u = T.u, xe = x0 + (x1 - x0) * clamp(q);
    g.save();
    g.beginPath(); g.rect(x0, y, xe - x0, 30 * u); g.fillStyle = rgba(T.c.clay, 0.42); g.fill(); g.clip();
    g.strokeStyle = INK(T, 0.4); g.lineWidth = 0.8 * u; g.beginPath();
    for (let k = 0; k < 3; k++) { const yy = y + (7 + k * 8) * u; g.moveTo(x0, yy); for (let x = x0; x < xe; x += 20 * u) g.quadraticCurveTo(x + 10 * u, yy + (k % 2 ? 2 : -2) * u, x + 20 * u, yy); }
    for (let x = x0 + 120 * u; x < xe; x += 190 * u) { g.moveTo(x, y); g.lineTo(x, y + 30 * u); }
    g.stroke(); g.restore();
    g.beginPath(); g.moveTo(x0, y); g.lineTo(xe, y); g.moveTo(x0, y + 30 * u); g.lineTo(xe, y + 30 * u); g.lineWidth = Math.max(1.4, 2.4 * u); g.strokeStyle = INK(T, 0.92); g.stroke();
  }

  // -- chart: each bar is a flowering plant ------------------------------------------------------------
  const chartImpl = (g, S, T, box, p, d, info) => {
    const u = T.u, t = info.t, n = d.values.length, max = Math.max(...d.values, 1), slot = box.w / n;
    const top = box.y - 26 * u, B = box.y + box.h - 96 * u;
    ground(g, T, box.x - 24 * u, box.x + box.w + 24 * u, B, eo(p * 2.2 + 0.25), 11, t, 30 * u);
    const Hmax = Math.max(140 * u, B - top - 215 * u);
    let tgt = null;
    d.values.forEach((value, i) => {
      const q = eo((p - i * 0.09) / 0.72), cx = box.x + slot * (i + 0.5), hot = i === d.highlight;
      const hi = Math.max(70 * u, Hmax * (value / max)), h = lerp(52 * u, hi, q), sw = sway(t, i * 1.7 + 1), lean = i % 2 ? 0.04 : -0.04;
      const pts = stemPts(cx, B, h, lean, sw, 16), w0 = (hot ? 9 : 7) * u;
      ribbon(g, T, pts, w0, w0 * 0.55, T.c.moss, 1);
      for (let k = 0; k < 2; k++) { const v = 0.2 + k * 0.22, pos = ptAt(pts, v); leaf(g, T, pos.x, pos.y, (80 + (h / Hmax) * 60) * u * (hot ? 1.1 : 1), 24 * u, pos.a + (k ? 1 : -1) * 1.0, k ? T.c.leaf2 : T.c.leaf, { grow: eo(span(q, 0.05, 0.55)), bend: k ? 0.1 : -0.1 }); }
      const tip = ptAt(pts, 1), r = (hot ? 84 : 66) * u, open = eo(span(q, 0.4, 1));
      if (hot && open > 0.3) {
        g.save(); g.beginPath();
        for (let k = 0; k < 16; k++) { const a = (k * TAU) / 16 + t * 0.15, r0 = r * 1.22, r1 = r * (1.42 + 0.14 * Math.sin(t * 3 + k * 1.3)); g.moveTo(tip.x + Math.cos(a) * r0, tip.y + Math.sin(a) * r0); g.lineTo(tip.x + Math.cos(a) * r1, tip.y + Math.sin(a) * r1); }
        g.globalAlpha *= open; g.lineWidth = Math.max(1.2, 2 * u); g.lineCap = "round"; g.strokeStyle = rgba(T.acc, 0.9); g.stroke(); g.restore();
      }
      bloom(g, T, tip.x, tip.y, r, hot ? T.acc : T.petals[(i * 2 + 1) % 5], { n: hot ? 9 : 6, open: 0.16 + 0.84 * open, rot: sw * 2 + i, t, seed: i + 4, pw: hot ? 0.34 : 0.4 });
      if (hot) tgt = { x: tip.x, y: tip.y };
      const a = span(q, 0.5, 0.8);
      if (a > 0) {
        const fs = 96 * u, label = M.formatNumber(value * q, 0, d.prefix, d.suffix), wd = clamp(Math.max(190 * u, measure(g, label, fs, "normal", 700) + 70 * u), 0, slot * 1.08);
        const cy = tip.y - r - 66 * u;
        cartouche(g, T, tip.x, cy, wd, 124 * u, a);
        g.save(); g.globalAlpha *= a; txt(g, T, label, tip.x, cy + 5 * u, fs, { style: "normal", weight: 700, color: hot ? rgba(mixc(T.acc, BLACK, T.dark ? 0 : 0.15), 1) : INK(T, 0.96), halo: false }); g.restore();
      }
      const la = eo(span(p, i * 0.05, 0.25 + i * 0.05)), name = d.labels[i] || "";
      if (name && la > 0) {
        const wd = Math.max(150 * u, measure(g, name, 44 * u) + 56 * u);
        g.save(); g.globalAlpha *= la; tag(g, T, cx, B + 54 * u, wd, 64 * u, 1, Math.sin(t * 1.1 + i) * 0.012); txt(g, T, name, cx, B + 54 * u, 44 * u, { halo: false }); g.restore();
      }
    });
    return tgt;
  };

  // -- object: a device grown over with ivy ------------------------------------------------------------
  function screenArt(g, T, sx, sy, sw, sh, q, t) {
    const u = T.u, ph = sh * 0.56;
    g.save(); g.beginPath(); rrPath(g, sx, sy, sw, sh, 8 * u); g.clip();
    const sky = g.createLinearGradient(0, sy, 0, sy + ph);
    sky.addColorStop(0, rgba(mixc(T.c.blue, T.c.cream, 0.55), 0.55)); sky.addColorStop(1, rgba(mixc(T.c.cream, T.paper, 0.4), 0.9));
    g.fillStyle = rgba(T.hi, 1); g.fillRect(sx, sy, sw, sh); g.fillStyle = sky; g.fillRect(sx, sy, sw, ph);
    const sxn = sx + sw * 0.74, syn = sy + ph * 0.34, sr = ph * 0.13;
    g.beginPath(); for (let k = 0; k < 14; k++) { const a = (k * TAU) / 14 + t * 0.35, r1 = sr * (1.35 + 0.15 * Math.sin(t * 2 + k)), r2 = sr * (1.8 + 0.2 * Math.sin(t * 2.4 + k * 2)); g.moveTo(sxn + Math.cos(a) * r1, syn + Math.sin(a) * r1); g.lineTo(sxn + Math.cos(a) * r2, syn + Math.sin(a) * r2); }
    g.lineWidth = Math.max(1, 1.6 * u); g.lineCap = "round"; g.strokeStyle = INK(T, 0.7); g.stroke();
    g.beginPath(); g.arc(sxn, syn, sr, 0, TAU); g.fillStyle = rgba(T.acc, 0.9); g.fill(); g.lineWidth = Math.max(1, 1.6 * u); g.strokeStyle = INK(T, 0.9); g.stroke();
    for (let k = 0; k < 2; k++) { const cx = sx + (((t * (14 + k * 6) * u + k * sw * 0.55) % (sw + 160 * u)) - 80 * u), cy = sy + ph * (0.2 + k * 0.2); g.beginPath(); g.ellipse(cx, cy, 36 * u, 12 * u, 0, 0, TAU); g.ellipse(cx - 16 * u, cy - 8 * u, 18 * u, 11 * u, 0, 0, TAU); g.fillStyle = "rgba(255,255,255,0.75)"; g.fill(); g.lineWidth = Math.max(1, 1.2 * u); g.strokeStyle = INK(T, 0.55); g.stroke(); }
    for (let k = 0; k < 2; k++) {
      const hy = sy + ph * (0.74 + k * 0.1), amp = ph * (0.07 - k * 0.02), pts = [];
      for (let x = sx; x <= sx + sw + 10; x += 10 * u) pts.push(x, hy + Math.sin((x - sx) / (sw * 0.17) + k * 2) * amp);
      g.beginPath(); trace(g, pts, 1); g.lineTo(sx + sw, sy + ph); g.lineTo(sx, sy + ph); g.closePath(); g.fillStyle = rgba(k ? T.c.leaf2 : T.c.leaf, 0.7); g.fill();
      g.beginPath(); trace(g, pts, 1); g.lineWidth = Math.max(1, 1.5 * u); g.strokeStyle = INK(T, 0.85); g.stroke();
      g.beginPath(); for (let i = 0; i < pts.length / 2; i += 2) { g.moveTo(pts[2 * i], pts[2 * i + 1] + 3 * u); g.lineTo(pts[2 * i] - 2 * u, pts[2 * i + 1] + 10 * u); } g.lineWidth = 0.8 * u; g.strokeStyle = INK(T, 0.4); g.stroke();
    }
    const tx = sx + sw * 0.2, ty = sy + ph * 0.86, th = ph * 0.34 + Math.sin(t * 1.2) * 1.2 * u;
    g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + Math.sin(t * 1.2) * 2 * u, ty - th * 0.5); g.lineWidth = 2.2 * u; g.strokeStyle = INK(T, 0.9); g.stroke();
    g.beginPath(); g.arc(tx + Math.sin(t * 1.2) * 3 * u, ty - th * 0.72, th * 0.34, 0, TAU); g.fillStyle = rgba(T.c.moss, 0.85); g.fill(); g.lineWidth = 1.4 * u; g.stroke();
    g.beginPath(); g.moveTo(sx, sy + ph); g.lineTo(sx + sw, sy + ph); g.lineWidth = 1.6 * u; g.strokeStyle = INK(T, 0.8); g.stroke();
    // timeline
    const clips = [[0.06, 0.3], [0.4, 0.22], [0.66, 0.28]], tr = 3, th2 = (sh - ph) * 0.2, gap = (sh - ph) * 0.07, y0 = sy + ph + (sh - ph) * 0.12;
    for (let tk = 0; tk < tr; tk++) clips.forEach(([cx0, cw], i) => {
      const shown = eo(span(q, 0.15 + i * 0.1 + tk * 0.05, 0.55 + i * 0.1 + tk * 0.05));
      if (shown <= 0) return;
      const x = sx + sw * (cx0 + tk * 0.04), y = y0 + tk * (th2 + gap), hot = tk === 0 && i === 1;
      g.beginPath(); rrPath(g, x, y, sw * cw * shown, th2, 4 * u); g.fillStyle = rgba(hot ? T.acc : [T.c.leaf, T.c.blue, T.c.ochre][(tk + i) % 3], 0.78); g.fill();
      g.save(); g.clip(); hatchBox(g, T, x, y, x + sw * cw * shown, y + th2, 7 * u, 0.4); g.restore();
      g.beginPath(); rrPath(g, x, y, sw * cw * shown, th2, 4 * u); g.lineWidth = Math.max(1, 1.4 * u); g.strokeStyle = INK(T, 0.88); g.stroke();
    });
    const px = sx + sw * (0.06 + 0.88 * ((t * 0.17) % 1));
    g.beginPath(); g.moveTo(px, sy + ph); g.lineTo(px, sy + sh); g.lineWidth = 3 * u; g.strokeStyle = rgba(T.acc, 0.95); g.stroke();
    g.beginPath(); g.moveTo(px - 7 * u, sy + ph); g.lineTo(px + 7 * u, sy + ph); g.lineTo(px, sy + ph + 11 * u); g.closePath(); g.fillStyle = rgba(T.acc, 1); g.fill(); g.lineWidth = 1.2 * u; g.strokeStyle = INK(T, 0.9); g.stroke();
    const gl = g.createLinearGradient(sx, sy, sx + sw * 0.6, sy + sh); gl.addColorStop(0, "rgba(255,255,255,0.22)"); gl.addColorStop(0.35, "rgba(255,255,255,0)"); g.fillStyle = gl; g.fillRect(sx, sy, sw, sh);
    g.restore();
    g.beginPath(); rrPath(g, sx, sy, sw, sh, 8 * u); g.lineWidth = Math.max(1.4, 2 * u); g.strokeStyle = INK(T, 0.92); g.stroke();
    return { sun: [sxn, syn], clip: [sx + sw * 0.51, y0 + th2 * 0.5 + 0 * (th2 + gap)], low: [sx + sw * 0.2, y0 + 2 * (th2 + gap) + th2 * 0.5] };
  }
  const objectImpl = (g, S, T, box, p, d, info) => {
    const u = T.u, t = info.t, phone = d.kind === "phone", tall = T.tall, q = eo(p * 1.3);
    const bw = phone ? (tall ? Math.min(box.w * 0.3, 340 * u) : Math.min(box.w * 0.28, box.h * 0.46)) : (tall ? Math.min(box.w * 0.86, 760 * u) : Math.min(box.w * 0.6, box.h * 1.18));
    const bh = phone ? bw * 1.9 : bw * 0.62, baseH = phone ? 0 : bh * 0.1;
    const x = tall ? box.x + (box.w - bw) / 2 : phone ? box.x + box.w * 0.3 - bw / 2 : box.x + box.w * 0.05;
    const deskY = tall ? box.y + 30 * u + bh + baseH : box.y + box.h - 70 * u, ly = deskY - baseH - bh;
    desk(g, T, box.x - 30 * u, box.x + box.w + 30 * u, deskY, eo(p * 2 + 0.3));
    // Pots either side of the device.
    const pw = 96 * u, ph = 84 * u, lpx = x - 70 * u, rpx = x + bw + 70 * u;
    ferns(g, T, lpx, deskY - ph * 1.0, bh * 0.55, t, 0.4 + 0.6 * q, 51);
    pot(g, T, lpx, deskY, pw, ph, T.c.clay);
    const dz = daisy(g, T, rpx, deskY - ph * 1.0, bh * 0.62, t, 0.4 + 0.6 * q, 52, { petal: T.c.cream });
    pot(g, T, rpx, deskY, pw, ph, mixc(T.c.clay, T.c.blue, 0.4));
    let A;
    g.save(); g.globalAlpha *= clamp(p * 3 + 0.35);
    const body = mixc(T.c.blue, T.c.cream, 0.5);
    if (phone) {
      g.beginPath(); rrPath(g, x, ly, bw, bh, 38 * u); const gd = g.createLinearGradient(x, 0, x + bw, 0); gd.addColorStop(0, rgba(mixc(body, T.c.cream, 0.4), 1)); gd.addColorStop(1, rgba(mixc(body, BLACK, 0.2), 1)); g.fillStyle = gd; g.fill(); g.lineWidth = Math.max(1.6, 2.6 * u); g.strokeStyle = INK(T, 0.95); g.stroke();
      const m = bw * 0.06; A = screenArt(g, T, x + m, ly + m * 2.1, bw - m * 2, bh - m * 4, q, t);
      g.beginPath(); rrPath(g, x + bw * 0.36, ly + m * 0.7, bw * 0.28, m * 0.7, m * 0.35); g.fillStyle = INK(T, 0.85); g.fill();
      g.beginPath(); g.moveTo(x + bw * 0.38, ly + bh - m * 0.9); g.lineTo(x + bw * 0.62, ly + bh - m * 0.9); g.lineWidth = 2.4 * u; g.lineCap = "round"; g.strokeStyle = INK(T, 0.7); g.stroke();
    } else {
      const m = bw * 0.035;
      g.beginPath(); rrPath(g, x, ly, bw, bh, 16 * u); const gd = g.createLinearGradient(x, ly, x + bw, ly + bh); gd.addColorStop(0, rgba(mixc(body, T.c.cream, 0.4), 1)); gd.addColorStop(1, rgba(mixc(body, BLACK, 0.18), 1)); g.fillStyle = gd; g.fill();
      g.save(); g.beginPath(); rrPath(g, x, ly, bw, bh, 16 * u); rrPath(g, x + m, ly + m, bw - 2 * m, bh - 2.4 * m, 8 * u); g.clip("evenodd"); hatchBox(g, T, x, ly, x + bw, ly + bh, 8 * u, 0.3); g.restore();
      g.beginPath(); rrPath(g, x, ly, bw, bh, 16 * u); g.lineWidth = Math.max(1.6, 2.6 * u); g.strokeStyle = INK(T, 0.95); g.stroke();
      A = screenArt(g, T, x + m, ly + m, bw - 2 * m, bh - 2.4 * m, q, t);
      const y1 = ly + bh, y2 = deskY;
      g.beginPath(); g.moveTo(x - bw * 0.035, y2); g.lineTo(x + bw * 1.035, y2); g.lineTo(x + bw * 0.995, y1); g.lineTo(x + bw * 0.005, y1); g.closePath();
      const gb = g.createLinearGradient(0, y1, 0, y2); gb.addColorStop(0, rgba(mixc(body, BLACK, 0.12), 1)); gb.addColorStop(1, rgba(mixc(body, T.c.cream, 0.35), 1)); g.fillStyle = gb; g.fill(); g.lineWidth = Math.max(1.6, 2.4 * u); g.lineJoin = "round"; g.strokeStyle = INK(T, 0.95); g.stroke();
      g.lineWidth = Math.max(0.8, 1 * u); g.strokeStyle = INK(T, 0.6);
      for (let r = 0; r < 3; r++) { const f = (r + 0.7) / 3.6, yy = lerp(y1, y2, f), half = bw * (0.46 + 0.02 * f); for (let k = 0; k < 14; k++) { const kx = x + bw / 2 - half + (k + 0.1) * (half * 2) / 14; g.beginPath(); rrPath(g, kx, yy - baseH * 0.12, half * 2 / 14 - 3 * u, baseH * 0.17, 2 * u); g.stroke(); } }
      g.beginPath(); g.moveTo(x + bw * 0.4, y2 - baseH * 0.14); g.lineTo(x + bw * 0.6, y2 - baseH * 0.14); g.stroke();
    }
    g.restore();
    // Ivy up both flanks.
    const vq = eo(span(p, 0.05, 0.95)) * 0.92 + 0.08;
    vine(g, T, bez([x - 52 * u, deskY - 4 * u], [x - 120 * u, deskY - bh * 0.45], [x - 30 * u, deskY - bh * 0.85], [x + bw * (phone ? 0.25 : 0.2), ly - 18 * u], 36), vq, t, { w: 6, gap: 3, size: 42, deco: "bloom", every: 4, curl: true, seed: 6 });
    vine(g, T, bez([x + bw + 50 * u, deskY - 4 * u], [x + bw + 120 * u, deskY - bh * 0.5], [x + bw + 20 * u, deskY - bh * 0.95], [x + bw * (phone ? 0.7 : 0.82), ly - 14 * u], 36), vq, t, { w: 6, gap: 3, size: 40, deco: "berry", every: 3, berry: T.acc, ripe: 0.9, curl: true, seed: 9 });
    // Callouts: a leader from a part of the device to a numbered label.
    const anchors = [A.sun, A.clip, A.low];
    d.callouts.forEach((label, i) => {
      const c = eo(span(p, 0.32 + i * 0.12, 0.7 + i * 0.12));
      if (c <= 0 || !label) return;
      const ly2 = tall ? deskY + 120 * u + i * 118 * u : box.y + box.h * (0.2 + i * 0.27), lx2 = tall ? box.x + 74 * u : box.x + box.w * (phone ? 0.58 : 0.66);
      const [ax, ay] = anchors[i], pts = bez([ax, ay], tall ? [lx2 - 90 * u, ay] : [ax + (lx2 - ax) * 0.5, ay - 60 * u], tall ? [lx2 - 90 * u, ly2] : [lx2 - 140 * u, ly2], [lx2 - 28 * u, ly2], 28);
      line(g, T, pts, Math.max(1.6, 2.4 * u), 0.9, c);
      g.beginPath(); g.arc(ax, ay, 8 * u, 0, TAU); g.fillStyle = rgba(T.acc, 1); g.fill(); g.lineWidth = Math.max(1.2, 1.8 * u); g.strokeStyle = INK(T, 0.95); g.stroke();
      if (c > 0.8) {
        const a = span(c, 0.8, 1);
        g.save(); g.globalAlpha *= a;
        g.beginPath(); g.arc(lx2, ly2, 27 * u, 0, TAU); g.fillStyle = rgba(T.hi, 0.97); g.fill(); g.lineWidth = Math.max(1.4, 2.2 * u); g.strokeStyle = INK(T, 0.95); g.stroke();
        txt(g, T, String(i + 1), lx2, ly2 + 1 * u, 34 * u, { style: "normal", weight: 700, halo: false });
        txt(g, T, label, lx2 + 46 * u, ly2, 46 * u, { align: "left", weight: 600 });
        g.restore();
      }
    });
    return dz;
  };

  // -- people: gardeners under a bunting-hung trellis ----------------------------------------------------
  function gardener(g, T, cx, base, size, o) {
    const u = T.u, s = size / 100, t = o.t, q = o.q, sd = o.seed, X = (x) => cx + x * s, by = base + (1 - q) * size * 0.3 + Math.sin(t * 1.7 + sd) * 0.5 * s;
    const Y = (y) => by + y * s;
    const skin = mixc(T.c.ochre, T.c.cream, 0.6), trou = mixc(T.c.blue, T.c.cream, 0.18), boot = mixc(T.c.clay, BLACK, 0.3), straw = mixc(T.c.ochre, T.c.cream, 0.35);
    const arm = Math.sin(t * 1.7 + sd + 1) * 0.12, LW = Math.max(1.2, 1.7 * u), HS = Math.max(3 * u, 1.15 * s);
    g.save(); g.globalAlpha *= clamp(q * 2);
    g.save(); g.beginPath(); g.ellipse(cx, base, 28 * s, 4 * s, 0, 0, TAU); g.clip(); hatchR(g, T, cx - 30 * s, base - 5 * s, cx + 30 * s, base + 5 * s, HS * 0.8, 0.45, 0.5); g.restore();
    const poly = (a) => { g.beginPath(); g.moveTo(X(a[0]), Y(a[1])); for (let i = 2; i < a.length; i += 2) g.lineTo(X(a[i]), Y(a[i + 1])); g.closePath(); };
    const fs = (col, al = 0.88) => { g.fillStyle = rgba(col, al); g.fill(); g.lineWidth = LW; g.lineJoin = "round"; g.strokeStyle = INK(T, 0.93); g.stroke(); };
    // Engraved form: an off-register wash light-to-dark, hatching down the shadow side, cross-hatch in the deep shade.
    const shade = (build, x0, y0, x1, y1, col, o2 = {}) => {
      const ax = X(x0), ay = Y(y0), bx = X(x1), bY = Y(y1);
      g.save(); g.translate(1.3 * u, 1 * u); build();
      const gd = g.createLinearGradient(ax, 0, bx, 0);
      gd.addColorStop(0, rgba(mixc(col, T.c.cream, 0.5), 0.86)); gd.addColorStop(0.55, rgba(col, 0.86)); gd.addColorStop(1, rgba(mixc(col, BLACK, 0.28), 0.92));
      g.fillStyle = gd; g.fill(); g.restore();
      g.save(); build(); g.clip();
      const ang = o2.ang == null ? 1.1 : o2.ang;
      hatchR(g, T, lerp(ax, bx, o2.from == null ? 0.5 : o2.from), ay, bx, bY, HS, 0.5, ang);
      hatchR(g, T, lerp(ax, bx, o2.deep == null ? 0.78 : o2.deep), ay, bx, bY, HS, 0.42, -ang);
      if (o2.contour) { g.beginPath(); for (let x = ax + HS * 1.5; x < lerp(ax, bx, 0.5); x += HS * 2.2) { g.moveTo(x, ay); g.quadraticCurveTo(x + HS * 0.5, (ay + bY) / 2, x, bY); } g.lineWidth = Math.max(0.5, 0.65 * u); g.strokeStyle = INK(T, 0.36); g.stroke(); }
      g.restore();
      build(); g.lineWidth = LW; g.lineJoin = "round"; g.strokeStyle = INK(T, 0.93); g.stroke();
      g.save(); g.translate(-0.8 * u, 0.6 * u); build(); g.lineWidth = 0.7 * u; g.strokeStyle = INK(T, 0.28); g.stroke(); g.restore();
    };
    const fold = (pts, a = 0.6) => { g.beginPath(); g.moveTo(X(pts[0]), Y(pts[1])); g.quadraticCurveTo(X(pts[2]), Y(pts[3]), X(pts[4]), Y(pts[5])); g.lineWidth = Math.max(0.8, 1 * u); g.strokeStyle = INK(T, a); g.lineCap = "round"; g.stroke(); };
    for (const sx of [-1, 1]) {
      const leg = [sx * 6 - 5.5, -34, sx * 6 + 5.5, -34, sx * 6 + 5, -8, sx * 6 - 5, -8];
      shade(() => poly(leg), sx * 6 - 6, -34, sx * 6 + 6, -8, trou, { from: sx < 0 ? 0.62 : 0.42, contour: true });
      fold([sx * 6 - 4, -21, sx * 6, -19.5, sx * 6 + 4, -21.5], 0.55); fold([sx * 6 - 3, -16, sx * 6 + 1, -15, sx * 6 + 4, -16.5], 0.4);
      const bootP = () => { g.beginPath(); rrPath(g, X(sx * 6 - 7), Y(-9), 14 * s, 9 * s, 3 * s); };
      shade(bootP, sx * 6 - 7, -9, sx * 6 + 7, 0, boot, { from: 0.35, deep: 0.65 });
      g.beginPath(); g.moveTo(X(sx * 6 - 6.5), Y(-1.2)); g.lineTo(X(sx * 6 + 6.5), Y(-1.2)); for (let k = 0; k < 2; k++) { g.moveTo(X(sx * 6 - 2), Y(-7.5 + k * 2.4)); g.lineTo(X(sx * 6 + 2), Y(-6 + k * 2.4)); g.moveTo(X(sx * 6 + 2), Y(-7.5 + k * 2.4)); g.lineTo(X(sx * 6 - 2), Y(-6 + k * 2.4)); }
      g.lineWidth = Math.max(0.8, 1 * u); g.strokeStyle = INK(T, 0.8); g.stroke();
    }
    const shirt = [-15, -62, -8, -66, 8, -66, 15, -62, 13, -30, -13, -30];
    shade(() => poly(shirt), -15, -66, 15, -30, o.col, { from: 0.45 });
    fold([-12, -58, -10, -50, -7, -45]); fold([12, -57, 10, -49, 8, -42]);
    const apron = [-9, -60, 9, -60, 11, -30, -11, -30];
    shade(() => poly(apron), -11, -60, 11, -30, T.c.cream, { from: 0.62, deep: 0.86, contour: true });
    g.save(); poly(apron); g.clip(); const sr = rng(sd * 13 + 1); g.fillStyle = INK(T, 0.35); for (let k = 0; k < 26; k++) { g.beginPath(); g.arc(X(-9 + sr() * 20), Y(-58 + sr() * 27), Math.max(0.5, 0.35 * s), 0, TAU); g.fill(); } g.restore();
    g.beginPath(); g.moveTo(X(-9), Y(-60)); g.lineTo(X(-12), Y(-65.5)); g.moveTo(X(9), Y(-60)); g.lineTo(X(12), Y(-65.5)); g.lineWidth = LW * 0.9; g.strokeStyle = INK(T, 0.9); g.stroke();
    g.beginPath(); rrPath(g, X(-6), Y(-46), 12 * s, 9 * s, 2 * s); g.lineWidth = LW * 0.8; g.stroke();
    g.save(); g.beginPath(); rrPath(g, X(-6), Y(-46), 12 * s, 9 * s, 2 * s); g.clip(); hatchR(g, T, X(-6), Y(-46), X(6), Y(-43), HS * 0.7, 0.4, 0.2); g.restore();
    leaf(g, T, X(-1), Y(-45), 12 * s, 3.4 * s, -PI / 2 - 0.45 + Math.sin(t * 2 + sd) * 0.08, T.c.leaf, { simple: true });
    leaf(g, T, X(1), Y(-45), 11 * s, 3.2 * s, -PI / 2 + 0.5 + Math.sin(t * 2.2 + sd) * 0.08, T.c.leaf2, { simple: true });
    // arms: tinted sleeves with hatching along their undersides
    const hl = [-24 + arm * 30, -40], hr = [24 - arm * 30, -43];
    for (const [sh, h] of [[[-14, -59], hl], [[14, -59], hr]]) {
      const mx = (sh[0] + h[0]) / 2 + (sh[0] < 0 ? -3 : 3), my = (sh[1] + h[1]) / 2 + 3;
      g.lineCap = "round"; g.beginPath(); g.moveTo(X(sh[0]), Y(sh[1])); g.quadraticCurveTo(X(mx), Y(my), X(h[0]), Y(h[1]));
      g.lineWidth = 7.6 * s + LW * 1.4; g.strokeStyle = INK(T, 0.93); g.stroke(); g.lineWidth = 7.6 * s; g.strokeStyle = rgba(mixc(o.col, T.c.cream, 0.3), 1); g.stroke();
      g.beginPath();
      for (let k = 1; k < 9; k++) {
        const v = k / 9, px = (1 - v) * (1 - v) * sh[0] + 2 * (1 - v) * v * mx + v * v * h[0], py = (1 - v) * (1 - v) * sh[1] + 2 * (1 - v) * v * my + v * v * h[1];
        g.moveTo(X(px), Y(py + 0.6)); g.lineTo(X(px + (sh[0] < 0 ? 0.8 : -0.8)), Y(py + 3.6));
      }
      g.lineWidth = Math.max(0.6, 0.8 * u); g.strokeStyle = INK(T, 0.55); g.stroke();
      g.beginPath(); g.arc(X(h[0]), Y(h[1]), 3.4 * s, 0, TAU); fs(skin, 1);
      g.beginPath(); g.arc(X(h[0]), Y(h[1]), 2.2 * s, 0.1, 1.6); g.lineWidth = Math.max(0.6, 0.8 * u); g.strokeStyle = INK(T, 0.5); g.stroke();
    }
    // props
    const kind = o.prop % 4;
    if (kind === 0) {
      g.save(); g.translate(X(hr[0]), Y(hr[1])); g.rotate(-0.35 + Math.sin(t * 1.2 + sd) * 0.08);
      g.beginPath(); rrPath(g, -2 * s, -8 * s, 17 * s, 13 * s, 2 * s); g.fillStyle = rgba(mixc(T.c.blue, T.c.cream, 0.4), 0.95); g.fill();
      g.save(); g.clip(); hatchR(g, T, 7 * s, -8 * s, 15 * s, 5 * s, HS, 0.45, 1.1); g.restore();
      g.beginPath(); rrPath(g, -2 * s, -8 * s, 17 * s, 13 * s, 2 * s); g.lineWidth = LW; g.strokeStyle = INK(T, 0.93); g.stroke();
      g.beginPath(); g.moveTo(15 * s, -2 * s); g.lineTo(26 * s, -12 * s); g.lineWidth = 3 * s; g.stroke(); g.lineWidth = 1.8 * s; g.strokeStyle = rgba(mixc(T.c.blue, T.c.cream, 0.4), 1); g.stroke();
      g.beginPath(); g.arc(1 * s, -8 * s, 8 * s, PI, TAU * 0.98); g.lineWidth = LW; g.strokeStyle = INK(T, 0.93); g.stroke();
      g.restore();
      for (let k = 0; k < 5; k++) { const ph = (t * 1.3 + k * 0.2 + sd) % 1, dx = X(hr[0]) + (24 + ph * 14) * s, dy = Y(hr[1]) - 12 * s + ph * ph * 40 * s; g.beginPath(); g.ellipse(dx, dy, 1.4 * s * u, 2.2 * s * u, 0, 0, TAU); g.fillStyle = rgba(T.c.blue, 0.85 * (1 - ph)); g.fill(); }
    } else if (kind === 1) {
      pot(g, T, X(hl[0] - 2), Y(hl[1] + 5), 11 * s, 9 * s, T.c.clay);
      leaf(g, T, X(hl[0] - 2), Y(hl[1] - 5), 12 * s, 4 * s, -PI / 2 - 0.6 + Math.sin(t * 2) * 0.1, T.c.leaf, { simple: true }); leaf(g, T, X(hl[0] - 2), Y(hl[1] - 5), 12 * s, 4 * s, -PI / 2 + 0.6 + Math.sin(t * 2.3) * 0.1, T.c.leaf2, { simple: true });
      g.beginPath(); g.moveTo(X(hr[0]), Y(hr[1])); g.lineTo(X(hr[0] + 5), Y(hr[1] - 12)); g.lineWidth = 3 * s; g.strokeStyle = INK(T, 0.93); g.stroke();
      const tr = [hr[0] + 4, -56, hr[0] + 10, -56, hr[0] + 13, -66, hr[0] + 7, -80, hr[0] + 1, -66];
      shade(() => poly(tr), hr[0] + 1, -80, hr[0] + 13, -56, mixc(T.c.blue, T.c.cream, 0.3), { from: 0.5 });
    } else if (kind === 2) {
      g.beginPath(); g.moveTo(X(hr[0]), Y(hr[1])); g.lineTo(X(hr[0] + 6), Y(hr[1] - 14)); g.lineWidth = 3.2 * s; g.strokeStyle = INK(T, 0.93); g.stroke();
      const lx = X(hr[0] + 9), ly = Y(hr[1] - 21);
      g.beginPath(); g.arc(lx, ly, 9 * s, 0, TAU); g.fillStyle = rgba(T.c.blue, 0.16); g.fill(); g.lineWidth = 2.6 * s * 0.6 + LW; g.strokeStyle = INK(T, 0.95); g.stroke();
      g.save(); g.beginPath(); g.arc(lx, ly, 8 * s, 0, TAU); g.clip(); leaf(g, T, lx - 5 * s, ly + 3 * s, 14 * s, 5 * s, -0.5 + Math.sin(t * 1.5) * 0.12, T.c.leaf, { veins: 3 }); g.restore();
      g.beginPath(); g.arc(lx, ly, 6 * s, PI * 1.1, PI * 1.5); g.lineWidth = LW; g.strokeStyle = "rgba(255,255,255,0.9)"; g.stroke();
    } else {
      g.beginPath(); rrPath(g, X(hl[0] - 7), Y(hl[1] - 17), 14 * s, 19 * s, 2.5 * s); g.fillStyle = rgba(T.c.blue, 0.2); g.fill(); g.lineWidth = LW; g.strokeStyle = INK(T, 0.93); g.stroke();
      g.beginPath(); rrPath(g, X(hl[0] - 6), Y(hl[1] - 20), 12 * s, 4 * s, 1 * s); g.fillStyle = INK(T, 0.8); g.fill();
      leaf(g, T, X(hl[0]), Y(hl[1] + 1), 12 * s, 3.4 * s, -PI / 2 + Math.sin(t * 1.4) * 0.15, T.c.leaf, { simple: true });
      for (let k = 0; k < 3; k++) { const ph = (t * 0.5 + k / 3 + sd) % 1; g.beginPath(); g.arc(X(hl[0]) + Math.sin(ph * 7 + k) * 3 * s, Y(hl[1] + 1) - ph * 14 * s, 1.2 * s * u * 0.7 + 0.8, 0, TAU); g.strokeStyle = INK(T, 0.7 * (1 - ph)); g.lineWidth = 1; g.stroke(); }
    }
    // head: an engraved face — lidded eyes, a nose line, hatched shade under the brim and down the jaw
    const hy = -76 + Math.sin(t * 1.7 + sd + 0.4) * 0.4;
    g.beginPath(); g.moveTo(X(-3.2), Y(hy + 10)); g.lineTo(X(-3.4), Y(-65)); g.lineTo(X(3.4), Y(-65)); g.lineTo(X(3.2), Y(hy + 10)); fs(skin, 1);
    const headP = () => { g.beginPath(); g.ellipse(X(0), Y(hy), 10.5 * s, 12 * s, 0, 0, TAU); };
    for (const e of [-1, 1]) { g.beginPath(); g.ellipse(X(e * 10.4), Y(hy + 1), 2 * s, 3 * s, 0, 0, TAU); fs(skin, 1); }
    shade(headP, -10.5, hy - 12, 10.5, hy + 12, skin, { from: 0.62, deep: 0.86, ang: 1.25 });
    g.save(); headP(); g.clip(); hatchR(g, T, X(-11), Y(hy - 12), X(11), Y(hy - 6.5), HS * 0.8, 0.5, 0.35); hatchR(g, T, X(-11), Y(hy - 12), X(11), Y(hy - 8), HS * 0.8, 0.45, -0.5); g.restore();
    const hairC = mixc(T.c.clay, BLACK, 0.45 + (sd % 3) * 0.1);
    g.beginPath(); for (const e of [-1, 1]) for (let k = 0; k < 5; k++) { g.moveTo(X(e * (5.5 + k * 1.1)), Y(hy - 10)); g.quadraticCurveTo(X(e * (8 + k * 0.9)), Y(hy - 6), X(e * (8.6 + k * 0.5)), Y(hy - 1 + k * 0.6)); }
    g.lineWidth = Math.max(0.8, 1.1 * u); g.strokeStyle = rgba(hairC, 0.9); g.stroke();
    const blink = (t * 0.8 + sd * 1.3) % 3.5 < 0.12;
    g.strokeStyle = INK(T, 0.95); g.fillStyle = INK(T, 0.95); g.lineCap = "round";
    for (const e of [-4, 4]) {
      g.beginPath(); g.moveTo(X(e - 2.4), Y(hy - 4)); g.quadraticCurveTo(X(e), Y(hy - 5.3), X(e + 2.4), Y(hy - 4.2)); g.lineWidth = LW * 0.8; g.stroke();
      if (blink) { g.beginPath(); g.moveTo(X(e - 1.8), Y(hy + 0.2)); g.quadraticCurveTo(X(e), Y(hy + 1), X(e + 1.8), Y(hy + 0.2)); g.lineWidth = LW * 0.8; g.stroke(); }
      else {
        g.beginPath(); g.moveTo(X(e - 2), Y(hy + 0.4)); g.quadraticCurveTo(X(e), Y(hy - 1.6), X(e + 2), Y(hy + 0.4)); g.lineWidth = LW * 0.75; g.stroke();
        g.beginPath(); g.arc(X(e + 0.3), Y(hy + 0.5), 0.95 * s, 0, TAU); g.fill();
      }
    }
    g.beginPath(); g.moveTo(X(0.4), Y(hy - 1.5)); g.quadraticCurveTo(X(1.8), Y(hy + 3.5), X(0.2), Y(hy + 4.3)); g.lineWidth = LW * 0.75; g.stroke();
    g.beginPath(); g.moveTo(X(-2.6), Y(hy + 6.6)); g.quadraticCurveTo(X(0), Y(hy + 8.2), X(2.6), Y(hy + 6.4)); g.lineWidth = LW * 0.8; g.stroke();
    g.beginPath(); g.moveTo(X(-1), Y(hy + 9)); g.lineTo(X(1), Y(hy + 9)); g.lineWidth = LW * 0.5; g.strokeStyle = INK(T, 0.55); g.stroke();
    const cr2 = rng(sd * 5 + 2); g.fillStyle = rgba(mixc(T.c.rose, BLACK, 0.1), 0.55);
    for (const e of [-1, 1]) for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(X(e * 6 + (cr2() - 0.5) * 3), Y(hy + 3.4 + (cr2() - 0.5) * 2.4), Math.max(0.6, 0.38 * s), 0, TAU); g.fill(); }
    // straw hat, woven and shaded beneath the brim
    g.save(); g.translate(X(0), Y(-85)); g.rotate(Math.sin(t * 1.2 + sd) * 0.04);
    g.beginPath(); g.moveTo(-11 * s, 0); g.bezierCurveTo(-11 * s, -15 * s, 11 * s, -15 * s, 11 * s, 0); g.closePath(); g.fillStyle = rgba(straw, 0.97); g.fill(); g.lineWidth = LW; g.strokeStyle = INK(T, 0.93); g.stroke();
    g.save(); g.clip(); hatchR(g, T, -12 * s, -14 * s, 12 * s, 0, HS * 0.9, 0.3, 0.7); hatchR(g, T, 2 * s, -14 * s, 12 * s, 0, HS * 0.9, 0.35, -0.7); g.restore();
    g.beginPath(); g.ellipse(0, 0, 24 * s, 5.2 * s, 0, 0, TAU); g.fillStyle = rgba(straw, 0.97); g.fill(); g.stroke();
    g.save(); g.beginPath(); g.ellipse(0, 0, 24 * s, 5.2 * s, 0, 0, PI); g.clip(); hatchR(g, T, -24 * s, 0, 24 * s, 5.2 * s, HS * 0.8, 0.45, 1.3); g.restore();
    g.beginPath(); for (let k = 0; k < 3; k++) g.ellipse(0, 0, (20 - k * 4) * s, (4.3 - k * 0.8) * s, 0, PI * 1.05, PI * 1.95); g.lineWidth = Math.max(0.5, 0.6 * u); g.strokeStyle = INK(T, 0.35); g.stroke();
    g.beginPath(); g.moveTo(-11 * s, -1 * s); g.lineTo(11 * s, -1 * s); g.lineTo(11.4 * s, -4.4 * s); g.lineTo(-11.4 * s, -4.4 * s); g.closePath(); g.fillStyle = rgba(o.hot ? T.acc : T.petals[sd % 5], 0.95); g.fill(); g.lineWidth = LW; g.strokeStyle = INK(T, 0.93); g.stroke();
    bloom(g, T, 8 * s, -4 * s, 5.5 * s, T.c.cream, { n: 5, t, seed: sd, pw: 0.45 });
    g.restore();
    if (o.hot) { sparkle(g, T, X(22), Y(-98), (4 + 1.6 * Math.sin(t * 4)) * s, 0.9); sparkle(g, T, X(-24), Y(-90), (3 + 1.2 * Math.sin(t * 4 + 2)) * s, 0.8); }
    g.restore();
  }
  const peopleImpl = (g, S, T, box, p, d, info) => {
    const u = T.u, t = info.t, n = clamp(Math.round(d.count), 2, 6), slot = box.w / n;
    const size = Math.min(box.h * 0.62, slot * (T.tall ? 1.6 : 1.25)), base = box.y + box.h * 0.9;
    ground(g, T, box.x - 20 * u, box.x + box.w + 20 * u, base, eo(p * 2 + 0.25), 21, t, 36 * u);
    // Posts with climbing vine, and a line of leaf pennants between them.
    const pq = 0.15 + 0.85 * eo(span(p, 0, 0.8));
    for (const sx of [-1, 1]) {
      const px = sx < 0 ? box.x - 6 * u : box.x + box.w + 6 * u, pts = stemPts(px, base, base - box.y + 10 * u, 0, 0, 8);
      ribbon(g, T, pts, 14 * u, 11 * u, T.c.clay, eo(span(p, 0, 0.45)) * 0.9 + 0.1);
      vine(g, T, stemPts(px + sx * 4 * u, base, (base - box.y) * 0.95, sx * 0.06, sway(t, 7 + sx) * 0.5, 22).map((v, i) => (i % 2 ? v : v + Math.sin(i * 0.9) * 8 * u)), pq, t, { w: 5, gap: 3, size: 38, deco: "bloom", every: 4, curl: true, seed: sx + 4 });
    }
    const sag = 34 * u, topY = box.y - 6 * u, bun = [];
    for (let k = 0; k <= 30; k++) { const f = k / 30; bun.push(lerp(box.x, box.x + box.w, f), topY + Math.sin(f * PI) * sag); }
    line(g, T, bun, Math.max(1.4, 2 * u), 0.9, eo(span(p, 0, 0.5)) * 0.9 + 0.1);
    const np = Math.round(box.w / (62 * u));
    for (let k = 1; k < np; k++) { const f = k / np, pt = ptAt(bun, f); leaf(g, T, pt.x, pt.y, 44 * u, 13 * u, PI / 2 + Math.sin(t * 2.2 + k * 0.8) * 0.28, k % 3 === 0 ? T.acc : T.petals[k % 5], { round: 1, veins: 2, simple: false, grow: eo(span(p, 0.1 + f * 0.3, 0.45 + f * 0.3)) * 0.85 + 0.15, n: 10 }); }
    // Plants growing in the bed behind and between.
    for (let i = 0; i <= n; i++) { const x = box.x + slot * i; plantAt(i * 2 + 1, g, T, x, base + 4 * u, size * 0.42, t, 0.3 + 0.7 * eo(span(p, 0.05 + i * 0.05, 0.7)), 60 + i, { petal: T.petals[(i + 2) % 5], berry: T.acc, ripe: 0.9 }); }
    const heads = [];
    for (let i = 0; i < n; i++) {
      const q = eo((p - i * 0.07) / 0.6) * 0.8 + 0.2 * eo(span(p, 0, 0.2)), cx = box.x + slot * (i + 0.5), hot = i === Math.min(n - 1, d.highlight), sz = size * (hot ? 1.06 : 1);
      gardener(g, T, cx, base, sz, { q, t, seed: i + 2, col: hot ? T.acc : [T.c.leaf, T.c.blue, T.c.plum, T.c.clay, T.c.moss][i % 5], hot, prop: i });
      heads.push([cx, base - sz * 0.99, hot, i]);
    }
    // Every figure gets its own role: the given badges first, then distinct garden-crew roles.
    const roles = d.badges.filter(Boolean), spare = ["Producer", "Colourist", "Sound", "Reviewer", "Writer", "Assistant"].filter((r) => !roles.includes(r));
    while (roles.length < n) roles.push(spare.shift() || "Crew");
    heads.forEach(([cx, hy, hot, i]) => {
      const label = roles[i], a = eo(span(p, 0.35 + i * 0.07, 0.6 + i * 0.07));
      if (!label || a <= 0) return;
      let fs = 44 * u; const tw = (f) => measure(g, label, f, "italic", 600) + 44 * u;
      if (tw(fs) > slot - 10 * u) fs = Math.max(34 * u, fs * (slot - 10 * u) / tw(fs));
      g.save(); g.globalAlpha *= a;
      const rot = Math.sin(t * 1.4 + i) * 0.035;
      tag(g, T, cx, hy - 56 * u - (1 - a) * 20 * u, tw(fs), 64 * u, 1, rot, 22 * u);
      g.translate(0, 0); txt(g, T, label, cx, hy - 56 * u - (1 - a) * 20 * u, fs, { weight: 600, color: hot ? rgba(mixc(T.acc, BLACK, T.dark ? 0 : 0.2), 1) : INK(T, 0.96), halo: false });
      g.restore();
    });
    return null;
  };

  // -- process: bell jars on turned stands, joined by a travelling vine ------------------------------------
  function jar(g, T, cx, base, jw, jh, q, t, kind, seed, col) {
    const u = T.u, gq = eo(span(q, 0.3, 1)), a = 0.35 + 0.65 * q;
    g.save();
    // stand
    g.beginPath(); g.ellipse(cx, base + 15 * u, jw * 0.64, jw * 0.1, 0, 0, TAU); g.fillStyle = rgba(mixc(T.c.clay, BLACK, 0.2), 0.95); g.fill(); g.lineWidth = Math.max(1.3, 2 * u); g.strokeStyle = INK(T, 0.92); g.stroke();
    g.beginPath(); g.moveTo(cx - jw * 0.64, base + 15 * u); g.lineTo(cx - jw * 0.64, base); g.lineTo(cx + jw * 0.64, base); g.lineTo(cx + jw * 0.64, base + 15 * u); g.fillStyle = rgba(T.c.clay, 0.9); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(cx, base, jw * 0.64, jw * 0.1, 0, 0, TAU); g.fillStyle = rgba(mixc(T.c.clay, T.c.cream, 0.3), 0.95); g.fill(); g.stroke();
    g.save(); g.beginPath(); g.ellipse(cx, base, jw * 0.64, jw * 0.1, 0, 0, TAU); g.clip(); hatchBox(g, T, cx - jw * 0.7, base - jw * 0.12, cx + jw * 0.7, base + jw * 0.12, 6 * u, 0.3); g.restore();
    g.globalAlpha *= a;
    // contents
    const dome = jh * 0.42, side = jh * 0.58;
    g.save(); g.beginPath(); g.moveTo(cx - jw / 2, base - 6 * u); g.lineTo(cx - jw / 2, base - side); g.ellipse(cx, base - side, jw / 2, dome, 0, PI, TAU); g.lineTo(cx + jw / 2, base - 6 * u); g.closePath(); g.clip();
    g.beginPath(); g.ellipse(cx, base - jh * 0.07, jw * 0.42, jh * 0.055, 0, 0, TAU); g.fillStyle = rgba(mixc(T.c.clay, BLACK, 0.45), 0.92); g.fill(); g.lineWidth = Math.max(1.2, 1.8 * u); g.strokeStyle = INK(T, 0.92); g.stroke();
    g.fillStyle = INK(T, 0.5); for (let k = 0; k < 14; k++) { g.beginPath(); g.arc(cx - jw * 0.36 + ((k * 37) % 100) / 100 * jw * 0.72, base - jh * 0.07 + (((k * 53) % 40) - 20) / 20 * jh * 0.03, Math.max(0.8, 1.1 * u), 0, TAU); g.fill(); }
    const sy = base - jh * 0.075;
    if (kind === "seed") {
      leaf(g, T, cx - jw * 0.13, sy - jw * 0.03, jw * 0.26, jw * 0.1, -0.2 + Math.sin(t * 1.3) * 0.03, T.c.ochre, { round: 1, veins: 3, n: 14 });
      const sp = ptAt(stemPts(cx + jw * 0.14, sy, jh * 0.14 * gq, 0.1, sway(t, 3) * 0.6, 6), 1);
      ribbon(g, T, stemPts(cx + jw * 0.14, sy, jh * 0.14 * gq, 0.1, sway(t, 3) * 0.6, 6), 4 * u, 2.5 * u, T.c.moss, 1);
      leaf(g, T, sp.x, sp.y, jw * 0.14 * gq, jw * 0.05, -PI / 2 - 0.9, T.c.leaf2, { simple: true }); leaf(g, T, sp.x, sp.y, jw * 0.14 * gq, jw * 0.05, -PI / 2 + 0.9, T.c.leaf, { simple: true });
    } else if (kind === "sprout") {
      const pts = stemPts(cx, sy, jh * 0.4 * gq, 0.03, sway(t, seed) * 1.2, 12);
      ribbon(g, T, pts, 6 * u, 3.5 * u, T.c.moss, 1);
      const tp = ptAt(pts, 1), lp = ptAt(pts, 0.55);
      leaf(g, T, lp.x, lp.y, jw * 0.3 * gq, jw * 0.1, lp.a - 1.1 + Math.sin(t * 1.8) * 0.08, T.c.leaf, { veins: 4 }); leaf(g, T, lp.x, lp.y, jw * 0.28 * gq, jw * 0.09, lp.a + 1.1 + Math.sin(t * 2.1) * 0.08, T.c.leaf2, { veins: 4 });
      leaf(g, T, tp.x, tp.y, jw * 0.2 * gq, jw * 0.07, tp.a - 0.5 + Math.sin(t * 2.4) * 0.1, T.c.leaf, { simple: true }); leaf(g, T, tp.x, tp.y, jw * 0.2 * gq, jw * 0.07, tp.a + 0.5 + Math.sin(t * 2.2) * 0.1, T.c.leaf2, { simple: true });
    } else {
      const pts = stemPts(cx, sy, jh * 0.52 * gq, 0.02, sway(t, seed) * 0.9, 14);
      ribbon(g, T, pts, 7 * u, 4 * u, T.c.moss, 1);
      for (let k = 0; k < 2; k++) { const lp = ptAt(pts, 0.3 + k * 0.25); leaf(g, T, lp.x, lp.y, jw * 0.3 * gq, jw * 0.1, lp.a + (k ? 1 : -1) * 1.0, k ? T.c.leaf2 : T.c.leaf, { veins: 4, bend: k ? 0.1 : -0.1 }); }
      const tp = ptAt(pts, 1);
      bloom(g, T, tp.x, tp.y, jw * 0.22, col, { n: 8, open: 0.2 + 0.8 * gq, rot: t * 0.15, t, seed: 4, pw: 0.36 });
    }
    for (let k = 0; k < 6; k++) { const ph = (t * 0.22 + k * 0.17 + seed * 0.3) % 1; const mx = cx + Math.sin(ph * TAU + k * 2) * jw * 0.3, my = base - jh * 0.2 - ph * jh * 0.62; g.beginPath(); g.arc(mx, my, Math.max(1.2, 2 * u), 0, TAU); g.fillStyle = rgba(T.c.ochre, 0.9 * Math.sin(ph * PI)); g.fill(); }
    if (kind === "sprout") for (let k = 0; k < 3; k++) sparkle(g, T, cx + Math.cos(k * 2.1 + 0.5) * jw * 0.3, base - jh * (0.4 + 0.15 * k), (5 + 3 * Math.sin(t * 3 + k * 2)) * u, 0.6 + 0.4 * Math.sin(t * 3 + k * 2));
    g.restore();
    // glass
    g.beginPath(); g.moveTo(cx - jw / 2, base - 6 * u); g.lineTo(cx - jw / 2, base - side); g.ellipse(cx, base - side, jw / 2, dome, 0, PI, TAU); g.lineTo(cx + jw / 2, base - 6 * u);
    const gl = g.createLinearGradient(cx - jw / 2, 0, cx + jw / 2, 0); gl.addColorStop(0, rgba(T.c.blue, 0.22)); gl.addColorStop(0.5, rgba(T.c.blue, 0.06)); gl.addColorStop(1, rgba(T.c.blue, 0.2));
    g.fillStyle = gl; g.fill(); g.lineWidth = Math.max(1.5, 2.6 * u); g.lineJoin = "round"; g.strokeStyle = INK(T, 0.93); g.stroke();
    g.beginPath(); g.moveTo(cx - jw * 0.38, base - jh * 0.12); g.lineTo(cx - jw * 0.38, base - side); g.quadraticCurveTo(cx - jw * 0.38, base - side - dome * 0.78, cx - jw * 0.12, base - jh * 0.93);
    g.lineWidth = 6 * u; g.lineCap = "round"; g.strokeStyle = "rgba(255,255,255,0.55)"; g.stroke();
    g.beginPath(); g.moveTo(cx + jw * 0.4, base - jh * 0.2); g.lineTo(cx + jw * 0.4, base - jh * 0.5); g.lineWidth = 3 * u; g.stroke();
    g.beginPath(); g.moveTo(cx, base - side - dome); g.lineTo(cx, base - side - dome - 10 * u); g.lineWidth = 2.2 * u; g.strokeStyle = INK(T, 0.9); g.stroke();
    g.beginPath(); g.arc(cx, base - side - dome - 16 * u, jw * 0.05 + 4 * u, 0, TAU); g.fillStyle = rgba(T.c.ochre, 0.95); g.fill(); g.lineWidth = Math.max(1.3, 2 * u); g.stroke();
    g.restore();
  }
  const processImpl = (g, S, T, box, p, d, info) => {
    const u = T.u, t = info.t, n = d.steps.length, vertical = box.h > box.w, slot = vertical ? box.h / n : box.w / n;
    const jh = vertical ? Math.min(slot * 0.8, box.w * 0.4 * 1.3) : Math.min(box.h * 0.54, slot * 0.9 * 1.25), jw = jh / 1.3;
    const kinds = ["seed", "sprout", "bloom"], jars = [];
    for (let i = 0; i < n; i++) {
      const cx = vertical ? box.x + box.w * 0.28 : box.x + slot * (i + 0.5), base = vertical ? box.y + slot * i + slot * 0.5 + jh * 0.5 : box.y + box.h - 118 * u;
      jars.push({ cx, base });
    }
    jars.forEach(({ cx, base }, i) => {
      const q = eo((p - i * 0.14) / 0.6), kind = i === n - 1 ? "bloom" : i === 0 ? "seed" : "sprout";
      // Numerals and stand lines first so the scene is never bare.
      const num = ROMAN[i] || String(i + 1), ncx = vertical ? box.x + 56 * u : cx, ncy = vertical ? base - jh * 0.5 : base - jh - 84 * u;
      g.save(); g.globalAlpha *= 0.55 + 0.45 * eo(span(p, i * 0.08, 0.3 + i * 0.08));
      g.font = `normal 700 ${112 * u}px ${SERIF}`; g.textAlign = "center"; g.textBaseline = "middle";
      g.lineWidth = 9 * u; g.lineJoin = "round"; g.strokeStyle = rgba(T.paper, 0.9); g.strokeText(num, ncx, ncy);
      g.fillStyle = rgba(mixc(T.acc, BLACK, T.dark ? 0 : 0.32), 1); g.fillText(num, ncx, ncy);
      g.lineWidth = 2 * u; g.strokeStyle = INK(T, 0.95); g.strokeText(num, ncx, ncy);
      g.restore();
      jar(g, T, cx, base, jw, jh, q, t, kind, i + 1, T.acc);
      const label = d.steps[i], la = eo(span(p, 0.1 + i * 0.1, 0.4 + i * 0.1));
      if (label && la > 0) {
        let fs = 44 * u; const bwf = (f) => Math.max(jw * 1.05, measure(g, label, f, "italic", 600) + 70 * u), maxW = vertical ? box.w * 0.55 : slot - 60 * u;
        if (bwf(fs) > maxW) fs = Math.max(34 * u, fs * maxW / bwf(fs));
        const bx = vertical ? box.x + box.w * 0.28 + jw * 0.8 + bwf(fs) / 2 + 30 * u : cx, by = vertical ? base - jh * 0.5 : base + 70 * u;
        g.save(); g.globalAlpha *= la; banner(g, T, bx, by, bwf(fs), 64 * u, i === n - 1 ? T.acc : T.petals[(i + 2) % 5], 1);
        txt(g, T, label, bx, by, fs, { weight: 600, halo: false }); g.restore();
      }
      if (kind === "bloom") {
        const sx = cx + jw * 0.5, sy = base - jh * 0.12, ps = 1 + 0.06 * Math.sin(t * 3), sq = back(span(q, 0.5, 1));
        if (sq > 0) {
          g.save(); g.translate(sx, sy); g.scale(ps * sq, ps * sq);
          g.beginPath(); for (let k = 0; k < 16; k++) { const a = (k * TAU) / 16, r = (k % 2 ? 24 : 29) * u; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fillStyle = rgba(T.acc, 0.96); g.fill(); g.lineWidth = Math.max(1.4, 2.2 * u); g.strokeStyle = INK(T, 0.93); g.stroke();
          g.beginPath(); g.moveTo(-10 * u, 1 * u); g.lineTo(-3 * u, 9 * u); g.lineTo(11 * u, -8 * u); g.lineWidth = Math.max(2.4, 4 * u); g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = rgba(T.dark ? [20, 30, 24] : [255, 250, 235], 1); g.stroke();
          g.restore();
        }
      }
    });
    for (let i = 0; i < n - 1; i++) {
      const a = jars[i], b = jars[i + 1], vq = eo(span(p, 0.2 + i * 0.16, 0.7 + i * 0.16));
      if (vq <= 0) continue;
      const pts = vertical ? qbez([a.cx + jw * 0.4, a.base + 20 * u], [a.cx + jw * 0.4 + 110 * u, (a.base + b.base - jh) / 2], [b.cx + jw * 0.35, b.base - jh * 0.97], 26)
        : qbez([a.cx + jw * 0.36, a.base - jh * 0.8], [(a.cx + b.cx) / 2, a.base - jh * 1.28], [b.cx - jw * 0.4, b.base - jh * 0.78], 26);
      vine(g, T, pts, vq, t, { w: 6, gap: 4, size: 30, curl: i % 2 === 0, seed: i + 2 });
      if (vq > 0.95) {
        const e = ptAt(pts, 1);
        leaf(g, T, e.x, e.y, 62 * u, 20 * u, e.a, T.acc, { grow: eo(span(vq, 0.95, 1)), veins: 3 });
        for (let k = 0; k < 3; k++) { const s = (t * 0.45 + k / 3 + i * 0.2) % 1, pt = ptAt(pts, s); berry(g, T, pt.x, pt.y, 9 * u, T.acc, {}); }
      }
    }
    return null;
  };

  // -- compare: a wilting pot beside a flourishing one ------------------------------------------------------
  function wilted(g, T, cx, base, h, t, q, seed) {
    const u = T.u, potH = h * 0.26, potW = h * 0.36, top = base - potH, sw = sway(t, seed) * 0.5;
    const pts = bez([cx, top], [cx - h * 0.03, top - h * 0.6], [cx + h * 0.2 + sw * h, top - h * 0.82], [cx + h * 0.34, top - h * 0.46], 18);
    const col = mixc(T.c.moss, T.c.ochre, 0.5), lcol = mixc(T.c.leaf, T.c.ochre, 0.6), gq = eo(span(q, 0, 0.7));
    ribbon(g, T, pts, 8 * u, 5 * u, col, gq);
    for (let k = 0; k < 3; k++) { const v = 0.28 + k * 0.2, pt = ptAt(pts, v), s = k % 2 ? 1 : -1; leaf(g, T, pt.x, pt.y, h * 0.24, h * 0.065, PI / 2 - s * 0.35 + (k === 1 ? 0.5 : 0) + Math.sin(t * 1.1 + k) * 0.03, lcol, { grow: eo(span(q, 0.2 + k * 0.1, 0.7)), bend: s * 0.25, veins: 4 }); }
    const tp = ptAt(pts, 1);
    leaf(g, T, tp.x, tp.y, h * 0.13, h * 0.055, PI / 2 + 0.3, mixc(T.c.rose, T.c.clay, 0.5), { round: 1, veins: 2, grow: gq });
    pot(g, T, cx, base, potW, potH, T.c.clay);
    const ph = (t * 0.36 + seed * 0.3) % 1, fx = cx + h * 0.12 + Math.sin(ph * 6) * h * 0.08, fy = top - h * 0.28 + ph * (h * 0.28 + potH);
    leaf(g, T, fx, fy, h * 0.15, h * 0.05, ph * 6 + 0.5, lcol, { simple: true, alpha: 1 - Math.pow(ph, 4) });
  }
  function lush(g, T, cx, base, h, t, q, seed, col) {
    const u = T.u, potH = h * 0.26, potW = h * 0.36, top = base - potH, sw = sway(t, seed);
    const pts = stemPts(cx, top, h * 0.88, 0.02, sw, 16);
    ribbon(g, T, pts, 9 * u, 5 * u, T.c.moss, eo(span(q, 0, 0.6)));
    for (let k = 0; k < 5; k++) { const v = 0.12 + k * 0.14, pt = ptAt(pts, v), s = k % 2 ? 1 : -1; leaf(g, T, pt.x, pt.y, h * (0.34 - k * 0.03), h * 0.08, pt.a + s * 0.95, k % 2 ? T.c.leaf2 : T.c.leaf, { grow: eo(span(q, 0.05 + k * 0.08, 0.6 + k * 0.05)), bend: s * 0.1, veins: 4 }); }
    const top1 = ptAt(pts, 1), sides = [[0.5, -1], [0.7, 1]];
    sides.forEach(([v, s], i) => {
      const pt = ptAt(pts, v), end = [pt.x + s * h * 0.17, pt.y - h * 0.1 + Math.sin(t * 1.2 + i) * 2 * u], br = bez([pt.x, pt.y], [pt.x + s * h * 0.05, pt.y - h * 0.08], [end[0] - s * h * 0.06, end[1] + h * 0.03], end, 8);
      ribbon(g, T, br, 4.5 * u, 3 * u, T.c.moss, eo(span(q, 0.4 + i * 0.1, 0.8)));
      bloom(g, T, end[0], end[1], h * 0.09, T.petals[(i + 3) % 5], { n: 6, open: eo(span(q, 0.6 + i * 0.1, 1)), rot: t * 0.1 + i, t, seed: i + 8 });
    });
    bloom(g, T, top1.x, top1.y, h * 0.14, col, { n: 9, open: 0.15 + 0.85 * eo(span(q, 0.5, 1)), rot: -t * 0.1, t, seed: 3, pw: 0.34 });
    pot(g, T, cx, base, potW, potH, mixc(T.c.clay, T.c.blue, 0.35));
    return top1;
  }
  const compareImpl = (g, S, T, box, p, d, info) => {
    const u = T.u, t = info.t, vertical = box.h > box.w * 1.1, gap = 36 * u;
    const cw = vertical ? box.w : (box.w - gap) / 2, ch = vertical ? (box.h - gap) / 2 : box.h * 0.94;
    const maxv = Math.max(d.leftValue, d.rightValue, 1);
    let tgt = null;
    [[d.left, d.leftValue, false], [d.right, d.rightValue, true]].forEach(([label, value, good], i) => {
      const q = eo((p - i * 0.18) / 0.65), x = vertical ? box.x : box.x + i * (cw + gap), y = vertical ? box.y + i * (ch + gap) : box.y + (box.h - ch) / 2;
      g.save(); g.globalAlpha *= 0.35 + 0.65 * eo(span(p, i * 0.1, 0.3 + i * 0.1));
      if (T.bg) { rr(g, x, y, cw, ch, 12 * u); g.fillStyle = rgba(T.paper, 0.6); g.fill(); }
      rr(g, x, y, cw, ch, 12 * u); g.lineWidth = Math.max(1.8, 3 * u); g.strokeStyle = INK(T, 0.9); g.stroke();
      rr(g, x + 9 * u, y + 9 * u, cw - 18 * u, ch - 18 * u, 6 * u); g.lineWidth = Math.max(0.9, 1.1 * u); g.strokeStyle = INK(T, 0.5); g.stroke();
      g.restore();
      const px = x + cw * 0.2, pbase = y + ch - 40 * u, ph = Math.min(ch * 0.78, cw * 0.4 * 1.9);
      ground(g, T, x + 24 * u, x + cw * 0.4, pbase, 1, 30 + i, t, 16 * u);
      if (good) tgt = lush(g, T, px, pbase, ph, t, q, 5, T.acc); else wilted(g, T, px, pbase, ph, t, q, 4);
      const tx = x + cw * 0.44, a = span(q, 0.1, 0.5);
      g.save(); g.globalAlpha *= a;
      txt(g, T, label, tx, y + 62 * u, 46 * u, { align: "left", weight: 600, color: good ? rgba(mixc(T.acc, BLACK, T.dark ? 0 : 0.2), 1) : INK(T, 0.96) });
      const fs = Math.min(150 * u, ch * 0.3), num = M.formatNumber(value * eo(span(q, 0.15, 1)), 0, d.prefix, d.suffix);
      txt(g, T, num, tx, y + ch * 0.5, fs, { align: "left", style: "normal", weight: 700, color: good ? rgba(mixc(T.acc, BLACK, T.dark ? 0 : 0.2), 1) : INK(T, 0.9) });
      // A tally of ten seedlings: how many stand, in proportion.
      const tw0 = x + cw - 44 * u - tx, on = Math.round((value / maxv) * 10);
      for (let k = 0; k < 10; k++) {
        const kx = tx + (tw0 * (k + 0.5)) / 10, ky = y + ch * 0.72, ka = eo(span(q, 0.3 + k * 0.04, 0.55 + k * 0.04)), isOn = k < on;
        g.save(); g.globalAlpha *= ka;
        if (isOn) { const sw2 = Math.sin(t * 1.8 + k * 0.7 + i) * 0.1; leaf(g, T, kx, ky + 16 * u, 30 * u, 9 * u, -PI / 2 - 0.7 + sw2, good ? T.c.leaf : T.c.leaf2, { simple: true }); leaf(g, T, kx, ky + 16 * u, 30 * u, 9 * u, -PI / 2 + 0.7 + sw2, good ? T.c.leaf2 : T.c.ochre, { simple: true }); g.beginPath(); g.moveTo(kx, ky + 22 * u); g.lineTo(kx, ky + 8 * u); g.lineWidth = 1.8 * u; g.strokeStyle = INK(T, 0.9); g.stroke(); }
        else { g.beginPath(); g.arc(kx, ky + 12 * u, 6 * u, 0, TAU); g.lineWidth = Math.max(1, 1.4 * u); g.strokeStyle = INK(T, 0.5); g.stroke(); }
        g.restore();
      }
      // Measuring rule.
      const mx = tx, my = y + ch - 90 * u, mw = x + cw - 44 * u - tx, mh = 30 * u, fw = mw * clamp(value / maxv) * eo(span(q, 0.2, 1));
      g.beginPath(); rrPath(g, mx, my, mw, mh, 7 * u); g.fillStyle = rgba(T.hi, 0.95); g.fill();
      g.save(); g.beginPath(); rrPath(g, mx, my, fw, mh, 7 * u); g.fillStyle = rgba(good ? T.acc : T.c.moss, 0.7); g.fill(); g.clip(); hatchBox(g, T, mx, my, mx + fw, my + mh, 6 * u, 0.5); g.restore();
      g.beginPath(); for (let k = 1; k < 20; k++) { const xx = mx + (mw * k) / 20; g.moveTo(xx, my + mh); g.lineTo(xx, my + mh - (k % 5 ? 8 : 15) * u); }
      g.lineWidth = Math.max(0.8, 1.1 * u); g.strokeStyle = INK(T, 0.7); g.stroke();
      g.beginPath(); rrPath(g, mx, my, mw, mh, 7 * u); g.lineWidth = Math.max(1.4, 2.2 * u); g.strokeStyle = INK(T, 0.92); g.stroke();
      leaf(g, T, mx + fw, my, 40 * u, 13 * u, -PI / 2 + Math.sin(t * 2 + i) * 0.18, good ? T.c.leaf : T.c.leaf2, { grow: eo(span(q, 0.4, 0.8)), simple: false, veins: 3 });
      g.restore();
    });
    return tgt;
  };

  // ---- the look ---------------------------------------------------------------------------------------
  const TONE = {
    paper: "#eadcbc", rim: "#b99f6e", ink: "54,38,26", fox: "150,100,42", dark: false,
    washes: { leaf: "#7d9b57", leaf2: "#a9b46a", moss: "#5c7a49", rose: "#cd6b7d", ochre: "#dfa544", blue: "#6f9aae", plum: "#8d5b80", clay: "#bb7650", cream: "#f6ecd2" },
  };
  const halo = (paper) => (accent) => `0 0 3px ${paper}, 0 0 12px ${paper}, 0 0 26px ${paper}`;
  return {
    bg: "#eadcbc", panel: "rgba(120,90,50,0.06)", ink: "#36261a", muted: "#7a6446", accent: "#b8404f", onAccent: "#fbf3e0",
    rule: "rgba(54,38,26,0.75)", track: "rgba(54,38,26,0.1)",
    display: SERIF, displayWeight: 600, displayTracking: "0.004em", displayStyle: "normal", body: SERIF, bodyWeight: 500, figures: SERIF,
    radius: 8, motion: "stroke", change: "fade", kit: { line: 2.2, fill: "solid", panel: "outline", dims: false, hatch: true },
    panelEdge: "rgba(54,38,26,0.6)", tone: TONE, keepArt: true, overlap: true,
    palettes: {
      // Plate: cool white stock and graphite-black ink. Night: a glasshouse after dark, gilt line on deep green. Mono: engraver's proof.
      light: { bg: "#f6f2e8", panel: "rgba(60,60,80,0.05)", ink: "#26242e", muted: "#6a6a78", accent: "#c0394d", onAccent: "#ffffff", rule: "rgba(38,36,46,0.75)", track: "rgba(38,36,46,0.08)", panelEdge: "rgba(38,36,46,0.5)",
        textShadow: halo("#f6f2e8"), backdrop: () => "#f6f2e8",
        tone: { paper: "#f6f2e8", rim: "#cfc6b0", ink: "38,36,46", fox: "140,120,80", dark: false, washes: { leaf: "#6f9a63", leaf2: "#9ab872", moss: "#4f7650", rose: "#d4677c", ochre: "#e0ac3f", blue: "#5f93b2", plum: "#8a5f90", clay: "#c2765a", cream: "#fbf6e8" } } },
      dark: { bg: "#17251f", panel: "rgba(240,230,200,0.06)", ink: "#eee2bd", muted: "#b5a67f", accent: "#e8c066", onAccent: "#1a1a14", rule: "rgba(238,226,189,0.8)", track: "rgba(238,226,189,0.1)", panelEdge: "rgba(238,226,189,0.5)",
        textShadow: halo("#17251f"), backdrop: () => "#17251f",
        tone: { paper: "#17251f", rim: "#06100b", ink: "238,226,189", fox: "200,170,100", dark: true, washes: { leaf: "#8fb46a", leaf2: "#bfd07c", moss: "#5f8f5a", rose: "#e57f92", ochre: "#ecbc55", blue: "#80b6cc", plum: "#b57fa8", clay: "#d38c62", cream: "#f3e9c8" } } },
      mono: { bg: "#ecebe5", panel: "rgba(40,40,40,0.05)", ink: "#282828", muted: "#6b6b68", accent: "#3a3a3a", onAccent: "#ecebe5", rule: "rgba(40,40,40,0.7)", track: "rgba(40,40,40,0.08)", panelEdge: "rgba(40,40,40,0.45)",
        textShadow: halo("#ecebe5"), backdrop: () => "#ecebe5",
        tone: { paper: "#ecebe5", rim: "#c4c2b8", ink: "40,40,40", fox: "120,118,108", dark: false, washes: { leaf: "#8d8d88", leaf2: "#a8a8a2", moss: "#6e6e6a", rose: "#7b7b78", ochre: "#b5b4ae", blue: "#9a9c9d", plum: "#686865", clay: "#9c9b97", cream: "#f5f4ef" } } },
    },
    textShadow: halo("#eadcbc"),
    backdrop: () => "#eadcbc",
    paint: (ctx, W, H) => { ctx.clearRect(0, 0, W, H); },
    css: () => `#title-scene, #closing-scene { align-items: center; text-align: center; }
      #root[data-bt-ink] .display, #root[data-bt-ink] .kicker { -webkit-text-fill-color: var(--bt-fill, currentColor) !important; -webkit-text-stroke: var(--bt-stroke, 0px transparent) !important; }
      #root[data-bt-ink] .display { text-shadow: var(--bt-bleed, 0 0 0 transparent), var(--separation) !important; }
      #title-scene .kicker { font-style: italic; text-transform: none; letter-spacing: 0.05em; font-size: 46px !important; font-weight: 600; }`,
    stage,
    scenes: { chart: wrap(chartImpl, "chart"), object: wrap(objectImpl, "object"), people: wrap(peopleImpl, "people"), process: wrap(processImpl, "process"), compare: wrap(compareImpl, "compare") },
  };
});
