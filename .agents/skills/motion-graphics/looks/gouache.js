// Gouache: a travelling poster painted in flat, matte colour. A coastal world sits under every scene
// in receding layers (snow peaks, pine ridges, a sea, a lighthouse headland, meadow, foreground
// bluff) whose edges are dragged dry, so the bristle marks show the colour below. The camera pans
// along the coast between scenes and the sky turns through dawn, day, gold, dusk and night as it goes.
// Every drawing is built from flat shapes with dry-brush edges: crate towers on a quay, a desk with a
// laptop showing a little painted landscape, folk on a stage, a trail with stations, two mountains
// whose height is the number. Everything keeps moving while it holds: flags flap, a lighthouse beam
// sweeps, gulls cross, boats bob, smoke curls, grass sways, figures breathe and blink. All motifs
// are original. Frames are pure functions of time; texture is seeded.
window.DreamcutMotion.register("gouache", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };
  const back = (v) => { v = clamp(v); const c = 1.9; return 1 + (c + 1) * Math.pow(v - 1, 3) + c * Math.pow(v - 1, 2); };
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const frac = (v) => v - Math.floor(v);
  const mod = (v, m) => ((v % m) + m) % m;
  const hash = (a, b = 0) => {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  // Periodic value noise: x in lattice units, P cells to the period.
  const pn = (x, P, s) => {
    const i = Math.floor(x), f = x - i;
    const a = hash(mod(i, P), s), b = hash(mod(i + 1, P), s);
    return a + (b - a) * f * f * (3 - 2 * f);
  };
  const LAB = "'DIN Condensed', 'Avenir Next Condensed', 'Roboto Condensed', 'Arial Narrow', Impact, sans-serif";
  const HEX = /^#[0-9a-f]{6}$/i;
  const rgbOf = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, k) => { const A = rgbOf(a), B = rgbOf(b); return "#" + A.map((v, i) => Math.round(lerp(v, B[i], k)).toString(16).padStart(2, "0")).join(""); };
  const lumOf = (h) => { const [r, g, b] = rgbOf(h); return (r * 0.3 + g * 0.59 + b * 0.11) / 255; };
  const al = (hex, a) => hexA(hex, a);
  const mapHex = (o, fn) => Array.isArray(o) ? o.map((v) => mapHex(v, fn)) : o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, mapHex(v, fn)])) : (typeof o === "string" && HEX.test(o)) ? fn(o) : o;

  // ---- colour: six flat pigments, plus the sky's five moods ------------------------------------------
  const LIGHT = {
    id: "light", paper: "#f3e7c9", ink: "#1d3547", band: "#1d3547", onBand: "#f6ecd2", card: "#f8efd6", cardInk: "#1d3547",
    cream: "#f3e7c9", snow: "#fbf3df", teal: "#2f8b92", deep: "#1f5f6a", sage: "#a9c8b4", ochre: "#eab04a", sun: "#f6d36e",
    verm: "#d8532f", rose: "#eb9f8a", plum: "#5b3a58", moss: "#6f9a78", wood: "#9b6a43", pine: "#17505a",
    far: "#86aeb0", mid: "#3f8f93", near: "#6f9a78", head: "#24495a", fore: "#14283a", sea: ["#2f8b92", "#3d9ca1", "#5db3b0"],
    skin: ["#e3a57a", "#b9764f", "#f0c39a", "#8a5a3e"],
    moods: [
      { a: "#efb08f", b: "#f4cb9f", c: "#f8e3b8", sun: "#d8532f" },
      { a: "#79bcc0", b: "#a6d4cf", c: "#dcebd0", sun: "#f6d36e" },
      { a: "#e8a947", b: "#f1c46d", c: "#f7de9c", sun: "#d8532f" },
      { a: "#8f5f80", b: "#cf7d7a", c: "#efae88", sun: "#f6d36e" },
      { a: "#244a62", b: "#3b7186", c: "#6ea2a8", sun: "#f3e7c9" },
    ],
  };
  const DARK = { ...mapHex(LIGHT, (h) => mix(h, "#0a1520", 0.5)), id: "dark", paper: "#0f1b27", ink: "#f3e7c9", band: "#08121b", onBand: "#f6ecd2",
    card: "#e8dbb6", cardInk: "#142230", cream: "#efe3c4", snow: "#e9e0c8", verm: "#e2663f", ochre: "#f0bb52", sun: "#f3cf6e", rose: "#e8967f", sage: "#7fa591" };
  const sepia = (h) => mix("#26190f", "#f4e8d0", Math.pow(lumOf(h), 0.9));
  const MONO = { ...mapHex(LIGHT, sepia), id: "mono", verm: "#6b2f17", ochre: "#c9a56a", rose: "#c99a80" };

  // ---- paths -------------------------------------------------------------------------------------------
  const poly = (pts) => (g) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); };
  const rrect = (x, y, w, h, r) => (g) => {
    const q = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath(); g.moveTo(x + q, y); g.arcTo(x + w, y, x + w, y + h, q); g.arcTo(x + w, y + h, x, y + h, q); g.arcTo(x, y + h, x, y, q); g.arcTo(x, y, x + w, y, q); g.closePath();
  };
  const circ = (x, y, r) => (g) => { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); };
  const ell = (x, y, rx, ry, rot = 0) => (g) => { g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); };
  const line = (pts) => (g) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); };

  // ---- the dry brush ------------------------------------------------------------------------------------
  let SC = null;
  function scratch(w, h) {
    if (!SC) SC = document.createElement("canvas");
    if (SC.width < w) SC.width = w;
    if (SC.height < h) SC.height = h;
    return SC;
  }
  // Streaky mask: where it is opaque, the paint is dragged away and the colour below shows through.
  let BR = null;
  function bristle() {
    if (BR) return BR;
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d"), r = rng(77);
    g.fillStyle = "#000";
    for (let i = 0; i < 190; i++) {
      const x = r() * 256, y = r() * 256, len = 20 + r() * 150, th = 0.8 + r() * 2.2;
      g.globalAlpha = 0.3 + r() * 0.6;
      g.fillRect(x, y, len, th);
      if (x + len > 256) g.fillRect(x - 256, y, len, th);
    }
    for (let i = 0; i < 520; i++) { g.globalAlpha = 0.4 + r() * 0.6; g.fillRect(r() * 256, r() * 256, 1 + r() * 4, 1 + r() * 2); }
    return (BR = c);
  }
  // Slightly uneven opacity across a flat fill: long light and dark strokes laid over what is there.
  function mottle(g, bb, amt, seed) {
    const r = rng(seed * 7 + 3);
    const n = clamp(Math.round((bb.w * bb.h) / 6000), 5, 70);
    g.save();
    g.globalCompositeOperation = "source-atop";
    for (let k = 0; k < n; k++) {
      const y = bb.y + r() * bb.h, x = bb.x + r() * bb.w * 0.95, len = Math.min(520, bb.w * (0.05 + r() * 0.2)), th = 2.5 + r() * 9;
      const a = (0.035 + r() * 0.07) * amt;
      g.fillStyle = r() < 0.5 ? `rgba(255,246,220,${a})` : `rgba(12,30,44,${a})`;
      g.fillRect(x, y, len, th);
    }
    g.restore();
  }
  function paintBody(g, pathFn, color, o, bb) {
    g.save();
    pathFn(g); g.fillStyle = color; g.fill();
    const ew = o.erode || 0;
    if (ew > 0) {
      g.globalCompositeOperation = "destination-out";
      const pat = g.createPattern(bristle(), "repeat");
      g.lineJoin = "round"; g.lineCap = "round";
      g.strokeStyle = pat; g.lineWidth = ew; (o.edge || pathFn)(g); g.stroke();
      if (pat.setTransform) pat.setTransform(new DOMMatrix().translate(61, 113).scale(0.55, 0.8));
      g.globalAlpha = 0.85; g.lineWidth = ew * 0.5; (o.edge || pathFn)(g); g.stroke();
    }
    g.restore();
    if (o.mottle !== 0) mottle(g, bb, o.mottle ?? 1, o.seed || 1);
  }
  // A flat shape with a dry edge, laid through a shared scratch canvas so the erosion never touches
  // the paint already on the page. `bb` is the shape's box in the current drawing coordinates.
  function gshape(ctx, bb, pathFn, color, o = {}) {
    const pad = (o.erode || 0) / 2 + (o.shadow ? Math.max(Math.abs(o.shadow[0]), Math.abs(o.shadow[1])) : 0) + 4;
    const x = Math.floor(bb.x - pad), y = Math.floor(bb.y - pad), w = Math.ceil(bb.w + pad * 2), h = Math.ceil(bb.h + pad * 2);
    if (w < 2 || h < 2 || w > 6000 || h > 6000) return;
    const sc = scratch(w, h), g = sc.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.clearRect(0, 0, w, h);
    g.setTransform(1, 0, 0, 1, -x, -y);
    if (o.shadow) { g.save(); g.translate(o.shadow[0], o.shadow[1]); pathFn(g); g.fillStyle = o.shadow[2]; g.fill(); g.restore(); }
    paintBody(g, pathFn, color, o, { x, y, w, h });
    if (o.extra) { g.save(); g.globalCompositeOperation = "source-atop"; o.extra(g, { x, y, w, h }); g.restore(); }
    ctx.drawImage(sc, 0, 0, w, h, x, y, w, h);
  }
  function fillPath(ctx, pathFn, color, alpha = 1) { ctx.save(); pathFn(ctx); ctx.globalAlpha *= alpha; ctx.fillStyle = color; ctx.fill(); ctx.restore(); }
  function strokePath(ctx, pathFn, color, width, alpha = 1, cap = "round") {
    ctx.save(); pathFn(ctx); ctx.globalAlpha *= alpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = cap; ctx.lineJoin = "round"; ctx.stroke(); ctx.restore();
  }
  // A dragged brush line: a few bristle strokes laid side by side.
  function brushLine(ctx, pts, width, color, alpha = 1) {
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1] + k * width * 0.3) : ctx.moveTo(p[0], p[1] + k * width * 0.3)));
      ctx.strokeStyle = color; ctx.lineWidth = width * (k === 0 ? 0.5 : 0.36); ctx.globalAlpha = alpha * (k === 0 ? 1 : 0.85); ctx.stroke();
    }
    ctx.restore();
  }
  function txt(ctx, s, x, y, size, { color = "#000", align = "center", base = "middle", weight = 800, alpha = 1 } = {}) {
    ctx.save(); ctx.font = `${weight} ${size}px ${LAB}`; ctx.textAlign = align; ctx.textBaseline = base; ctx.fillStyle = color; ctx.globalAlpha *= alpha;
    ctx.fillText(String(s), x, y); ctx.restore();
  }
  const measure = (ctx, s, size, weight = 800) => { ctx.save(); ctx.font = `${weight} ${size}px ${LAB}`; const w = ctx.measureText(String(s)).width; ctx.restore(); return w; };
  function fitSize(ctx, s, size, maxW, min) { let z = size; while (z > min && measure(ctx, s, z) > maxW) z *= 0.94; return Math.max(min, z); }

  // ---- the plan: which scenes play (read from the template's controls) ------------------------------
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  let planCache = null;
  function controls() {
    if (window.__dreamcut && window.__dreamcut.controls) return window.__dreamcut.controls;
    try { if (typeof dc !== "undefined" && dc && dc.controls) return dc.controls; } catch (e) { /* not on this page */ }
    return null;
  }
  function planOf() {
    if (planCache) return planCache.c ? planCache : null;
    const c = controls();
    if (!c) { planCache = { c: null }; return null; }
    let t = 0;
    const shown = [];
    for (const id of ORDER) { const hold = Number(c[`${id}_hold`]) || 0; if (hold > 0) shown.push({ id, start: t, hold, statement: id === "title" || id === "closing" }); t += hold; }
    const data = {
      chart: { labels: [c.bar_1_label, c.bar_2_label, c.bar_3_label, c.bar_4_label], values: [c.bar_1, c.bar_2, c.bar_3, c.bar_4], suffix: c.chart_suffix, prefix: "", highlight: Number(c.highlight) - 1 },
      object: { kind: c.device, callouts: [c.callout_1, c.callout_2, c.callout_3] },
      people: { count: c.people_count, badges: [c.badge_1, c.badge_2, c.badge_3], highlight: 1 },
      process: { steps: [c.step_1, c.step_2, c.step_3] },
      compare: { left: c.before_label, leftValue: c.before_value, right: c.after_label, rightValue: c.after_value, suffix: c.compare_suffix, prefix: "" },
    };
    return (planCache = { c, shown, length: t, change: Number(c.change) || 0.45, data });
  }
  // The camera rides the coast between scenes: it eases across the last and first `change` seconds either
  // side of a boundary and sits still in between (the world itself keeps drifting).
  function camera(i, n, local, hold, change) {
    const ch = Math.max(0.01, Math.min(change, hold * 0.45));
    if (i > 0 && local < ch) return i - 1 + eio(0.5 + 0.5 * clamp(local / ch));
    if (i < n - 1 && local > hold - ch) return i + eio(0.5 * clamp((local - (hold - ch)) / ch));
    return i;
  }

  // ---- environment ---------------------------------------------------------------------------------------
  function env(S) {
    const key = `${S.W}x${S.H}:${S.look.tone.id}`;
    if (S.__gk === key) return S.__ge;
    const T = S.look.tone, W = S.W, H = S.H, u = S.u;
    S.__gk = key;
    return (S.__ge = { S, T, W, H, u, tall: S.tall, hz: H * (S.tall ? 0.6 : 0.58), bandH: (S.tall ? 430 : 262) * u, bluff: H * 0.905, key });
  }
  function moodAt(T, pos) {
    const n = T.moods.length, i = Math.floor(pos), k = eio(pos - i);
    const A = T.moods[mod(i, n)], B = T.moods[mod(i + 1, n)];
    const night = (mod(i, n) === 4 ? 1 - k : 0) + (mod(i + 1, n) === 4 ? k : 0);
    return { a: mix(A.a, B.a, k), b: mix(A.b, B.b, k), c: mix(A.c, B.c, k), sun: mix(A.sun, B.sun, k), night, pos };
  }

  // ---- cached layers of the world ------------------------------------------------------------------------
  const CACHE = {};
  function getLayer(E, key, period, top, build) {
    const id = `${key}|${E.key}`;
    if (CACHE[id]) return CACHE[id];
    const c = document.createElement("canvas");
    c.width = Math.ceil(period); c.height = Math.max(8, Math.ceil(E.H - top));
    const g = c.getContext("2d");
    g.translate(0, -top);
    const meta = build(g, period, E) || {};
    return (CACHE[id] = { c, period, top, meta });
  }
  function blit(ctx, L, E, offset) {
    const x0 = -mod(offset, L.period);
    for (let x = x0; x < E.W; x += L.period) ctx.drawImage(L.c, x, L.top);
    return x0;
  }
  function pine(g, x, y, h, color) {
    const w = h * 0.42;
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(x, y - h); g.lineTo(x + w * 0.5, y - h * 0.5); g.lineTo(x + w * 0.22, y - h * 0.5);
    g.lineTo(x + w * 0.62, y - h * 0.18); g.lineTo(x + w * 0.2, y - h * 0.18); g.lineTo(x + w * 0.2, y);
    g.lineTo(x - w * 0.2, y); g.lineTo(x - w * 0.2, y - h * 0.18); g.lineTo(x - w * 0.62, y - h * 0.18);
    g.lineTo(x - w * 0.22, y - h * 0.5); g.lineTo(x - w * 0.5, y - h * 0.5); g.closePath(); g.fill();
  }

  function buildFar(g, w, E) {
    const { T, H, hz, u } = E, cells = Math.max(3, Math.round(w / (E.W * 0.36)));
    const amp = (E.tall ? 0.16 : 0.31) * H;
    const hAt = (x) => {
      const s = x / w, a = pn(s * cells, cells, 3), b = pn(s * cells * 2, cells * 2, 5), c = pn(s * cells * 5, cells * 5, 9);
      return clamp((0.2 + 0.8 * Math.pow(1 - Math.abs(2 * a - 1), 1.25)) * 0.82 + (b - 0.5) * 0.2 + (c - 0.5) * 0.06, 0, 1);
    };
    const yAt = (x) => hz + 0.03 * H - amp * hAt(x);
    const pts = []; for (let x = 0; x <= w; x += 5) pts.push([x, yAt(x)]);
    const body = (gg) => { gg.beginPath(); gg.moveTo(0, H); pts.forEach((p) => gg.lineTo(p[0], p[1])); gg.lineTo(w, H); gg.closePath(); };
    const top = (gg) => { gg.beginPath(); pts.forEach((p, i) => (i ? gg.lineTo(p[0], p[1]) : gg.moveTo(p[0], p[1]))); };
    paintBody(g, body, T.far, { erode: 11 * u, edge: top, seed: 4 }, { x: 0, y: hz - amp, w, h: amp + 0.05 * H });
    // Shadow facets on the right of each peak, clipped to the mountain.
    g.save(); body(g); g.clip();
    const peaks = [];
    for (let x = 30; x < w - 30; x += 4) { const y = yAt(x); if (y < yAt(x - 26) && y < yAt(x + 26) && y < yAt(x - 60) && y < yAt(x + 60) && hAt(x) > 0.52) peaks.push([x, y]); }
    for (const [px, py] of peaks) {
      const hw = amp * 0.62;
      g.fillStyle = al(T.ink, 0.17);
      g.beginPath(); g.moveTo(px, py); g.lineTo(px + hw * 1.3, hz + 0.1 * H); g.lineTo(px - hw * 0.08, hz + 0.1 * H); g.lineTo(px - hw * 0.14, py + (hz - py) * 0.45); g.closePath(); g.fill();
      g.fillStyle = al(T.snow, 0.0);
    }
    g.restore();
    // Snow where the ridge climbs above the snow line, with a jagged lower edge.
    const ySnow = hz + 0.03 * H - amp * 0.64;
    let run = [];
    const flush = () => {
      if (run.length > 2) {
        g.beginPath(); run.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
        const x1 = run[run.length - 1][0], x0 = run[0][0], n = Math.max(2, Math.round((x1 - x0) / (26 * u)));
        for (let k = n; k >= 0; k--) { const x = lerp(x0, x1, k / n); g.lineTo(x, ySnow + (k % 2 ? 22 : 4) * u + hash(Math.round(x), 4) * 16 * u); }
        g.closePath(); g.fillStyle = T.snow; g.fill();
        g.fillStyle = al(T.ink, 0.14);
        g.beginPath(); g.moveTo(run[Math.floor(run.length / 2)][0], run[Math.floor(run.length / 2)][1]);
        g.lineTo(x1, run[run.length - 1][1]); g.lineTo(lerp(x0, x1, 0.8), ySnow + 18 * u); g.closePath(); g.fill();
      }
      run = [];
    };
    for (const p of pts) { if (p[1] < ySnow) run.push(p); else flush(); }
    flush();
  }

  function buildMid(g, w, E) {
    const { T, H, hz, u } = E, cells = Math.max(3, Math.round(w / (E.W * 0.45)));
    const amp = (E.tall ? 0.07 : 0.14) * H;
    const yAt = (x) => hz + 0.07 * H - amp * (0.2 + 0.8 * pn((x / w) * cells, cells, 21) * 0.7 + 0.3 * pn((x / w) * cells * 3, cells * 3, 22));
    const pts = []; for (let x = 0; x <= w; x += 5) pts.push([x, yAt(x)]);
    const body = (gg) => { gg.beginPath(); gg.moveTo(0, H); pts.forEach((p) => gg.lineTo(p[0], p[1])); gg.lineTo(w, H); gg.closePath(); };
    const top = (gg) => { gg.beginPath(); pts.forEach((p, i) => (i ? gg.lineTo(p[0], p[1]) : gg.moveTo(p[0], p[1]))); };
    paintBody(g, body, T.mid, { erode: 12 * u, edge: top, seed: 8 }, { x: 0, y: hz - amp, w, h: amp + 0.2 * H });
    // Lighter meadow band along the crest and pine rows in two depths.
    g.save(); body(g); g.clip();
    g.fillStyle = al(T.sage, 0.22);
    g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1] + 30 * u) : g.moveTo(p[0], p[1] + 30 * u))); for (let k = pts.length - 1; k >= 0; k--) g.lineTo(pts[k][0], pts[k][1] + 4 * u); g.closePath(); g.fill();
    g.restore();
    for (let row = 0; row < 2; row++) {
      for (let i = 0, x = hash(row, 5) * 20 * u; x < w; i++, x += (16 + hash(i, row + 31) * 22) * u) {
        if (hash(i, row + 40) < 0.22) continue;
        const h = (34 + hash(i, row + 50) * 40) * u * (row ? 1.2 : 1);
        pine(g, x, yAt(x) + (row ? 46 : 12) * u + hash(i, 60) * 16 * u, h, row ? T.pine : mix(T.pine, T.mid, 0.3));
      }
    }
  }

  function buildHead(g, w, E) {
    const { T, H, hz, u } = E;
    const base = hz + 0.25 * H, crest = hz + 0.045 * H;
    const cx = w * 0.55, hw = 0.2 * w * 0.9;
    const hump = (x, c, half, hgt) => { const s = (x - c) / half; return Math.abs(s) >= 1 ? 0 : Math.pow(1 - s * s, 0.8) * hgt; };
    const pts = [];
    for (let x = cx - hw; x <= cx + hw; x += 5) pts.push([x, base - hump(x, cx, hw, base - crest) + (pn(x / (30 * u), 9999, 11) - 0.5) * 16 * u]);
    const body = (gg) => { gg.beginPath(); gg.moveTo(cx - hw, base); pts.forEach((p) => gg.lineTo(p[0], p[1])); gg.lineTo(cx + hw, base); gg.closePath(); };
    const top = (gg) => { gg.beginPath(); pts.forEach((p, i) => (i ? gg.lineTo(p[0], p[1]) : gg.moveTo(p[0], p[1]))); };
    paintBody(g, body, T.head, { erode: 12 * u, edge: top, seed: 12 }, { x: cx - hw, y: crest - 20, w: hw * 2, h: base - crest + 40 });
    // Islets out at sea.
    for (const [ix, sz, sd] of [[w * 0.14, 150, 3], [w * 0.88, 210, 7], [w * 0.33, 90, 5]]) {
      const ipts = [];
      for (let x = ix - sz * u; x <= ix + sz * u; x += 6) ipts.push([x, base - hump(x, ix, sz * u, 0.065 * H * (sz / 150)) + (hash(Math.round(x), sd) - 0.5) * 6 * u]);
      const ib = (gg) => { gg.beginPath(); gg.moveTo(ix - sz * u, base); ipts.forEach((p) => gg.lineTo(p[0], p[1])); gg.lineTo(ix + sz * u, base); gg.closePath(); };
      paintBody(g, ib, mix(T.head, T.mid, 0.25), { erode: 8 * u, edge: line(ipts), seed: sd }, { x: ix - sz * u, y: base - 0.1 * H, w: sz * 2 * u, h: 0.1 * H });
    }
    // The lighthouse: banded tower, gallery, lantern room, red cap.
    const lx = cx + hw * 0.08, ly = (() => { let best = base; for (const p of pts) if (Math.abs(p[0] - lx) < 6) best = Math.min(best, p[1]); return best; })() + 6 * u;
    const th = 300 * u, bw0 = 84 * u, bw1 = 54 * u;
    const tower = (gg) => { gg.beginPath(); gg.moveTo(lx - bw0 / 2, ly); gg.lineTo(lx - bw1 / 2, ly - th); gg.lineTo(lx + bw1 / 2, ly - th); gg.lineTo(lx + bw0 / 2, ly); gg.closePath(); };
    paintBody(g, tower, T.cream, { erode: 5 * u, seed: 14 }, { x: lx - bw0, y: ly - th, w: bw0 * 2, h: th });
    g.save(); tower(g); g.clip();
    for (let k = 0; k < 4; k++) {
      const y0 = ly - th * (k * 2 + 1) / 8, y1 = ly - th * (k * 2 + 2) / 8;
      g.fillStyle = T.verm; g.fillRect(lx - bw0, y1, bw0 * 2, y0 - y1);
    }
    g.fillStyle = al(T.ink, 0.2); g.fillRect(lx + bw1 * 0.1, ly - th, bw0, th);
    g.restore();
    const lampY = ly - th - 30 * u;
    g.fillStyle = T.ink; g.fillRect(lx - 48 * u, ly - th - 6 * u, 96 * u, 12 * u);
    g.fillStyle = T.ochre; g.fillRect(lx - 24 * u, ly - th - 56 * u, 48 * u, 50 * u);
    g.fillStyle = T.ink; g.fillRect(lx - 28 * u, ly - th - 60 * u, 6 * u, 56 * u); g.fillRect(lx + 22 * u, ly - th - 60 * u, 6 * u, 56 * u);
    g.fillStyle = T.verm; g.beginPath(); g.moveTo(lx - 36 * u, ly - th - 56 * u); g.lineTo(lx, ly - th - 96 * u); g.lineTo(lx + 36 * u, ly - th - 56 * u); g.closePath(); g.fill();
    g.fillStyle = T.ink; g.fillRect(lx - 11 * u, ly - 56 * u, 22 * u, 40 * u);
    // A cottage with a chimney on the shoulder of the headland.
    const kx = cx - hw * 0.42, ky = (() => { let best = base; for (const p of pts) if (Math.abs(p[0] - kx) < 6) best = Math.min(best, p[1]); return best; })() + 4 * u;
    g.fillStyle = T.cream; g.fillRect(kx - 46 * u, ky - 58 * u, 92 * u, 58 * u);
    g.fillStyle = al(T.ink, 0.18); g.fillRect(kx + 8 * u, ky - 58 * u, 38 * u, 58 * u);
    g.fillStyle = T.verm; g.beginPath(); g.moveTo(kx - 60 * u, ky - 56 * u); g.lineTo(kx, ky - 100 * u); g.lineTo(kx + 60 * u, ky - 56 * u); g.closePath(); g.fill();
    g.fillStyle = T.ink; g.fillRect(kx + 24 * u, ky - 112 * u, 16 * u, 34 * u);
    g.fillStyle = T.ochre; g.fillRect(kx - 30 * u, ky - 42 * u, 20 * u, 20 * u);
    g.fillStyle = T.ink; g.fillRect(kx + 4 * u, ky - 38 * u, 18 * u, 38 * u);
    // Pines on the headland.
    for (let i = 0; i < 14; i++) { const x = cx - hw * 0.9 + hash(i, 70) * hw * 1.1; if (Math.abs(x - kx) < 70 * u || Math.abs(x - lx) < 60 * u) continue; const y = (() => { let best = base; for (const p of pts) if (Math.abs(p[0] - x) < 6) best = Math.min(best, p[1]); return best; })(); pine(g, x, y + 14 * u, (46 + hash(i, 71) * 34) * u, T.pine); }
    return { lamp: [lx, lampY], chimney: [kx + 32 * u, ky - 112 * u] };
  }

  function buildNear(g, w, E) {
    const { T, H, hz, u } = E, cells = Math.max(3, Math.round(w / (E.W * 0.5)));
    const amp = (E.tall ? 0.06 : 0.09) * H;
    const yAt = (x) => hz + 0.235 * H - amp * (0.15 + 0.85 * (0.65 * pn((x / w) * cells, cells, 31) + 0.35 * pn((x / w) * cells * 3, cells * 3, 33)));
    const pts = []; for (let x = 0; x <= w; x += 5) pts.push([x, yAt(x)]);
    const body = (gg) => { gg.beginPath(); gg.moveTo(0, H); pts.forEach((p) => gg.lineTo(p[0], p[1])); gg.lineTo(w, H); gg.closePath(); };
    const top = (gg) => { gg.beginPath(); pts.forEach((p, i) => (i ? gg.lineTo(p[0], p[1]) : gg.moveTo(p[0], p[1]))); };
    paintBody(g, body, T.near, { erode: 13 * u, edge: top, seed: 16 }, { x: 0, y: hz, w, h: H - hz });
    g.save(); body(g); g.clip();
    // Furrows: lighter and darker bands that follow the slope.
    for (let k = 0; k < 5; k++) {
      g.fillStyle = k % 2 ? al(T.sage, 0.3) : al(T.deep, 0.18);
      g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1] + (24 + k * 26) * u) : g.moveTo(p[0], p[1] + (24 + k * 26) * u)));
      for (let i = pts.length - 1; i >= 0; i--) g.lineTo(pts[i][0], pts[i][1] + (10 + k * 26) * u); g.closePath(); g.fill();
    }
    g.restore();
    // Round trees and wildflowers.
    for (let i = 0; i < 9; i++) {
      const x = (i + 0.3 + hash(i, 81) * 0.5) * (w / 9), y = yAt(x) + 8 * u, h = (70 + hash(i, 82) * 60) * u;
      g.fillStyle = T.ink; g.fillRect(x - 4 * u, y - h * 0.5, 8 * u, h * 0.55);
      const tc = i % 3 === 0 ? T.pine : i % 3 === 1 ? T.deep : mix(T.deep, T.moss, 0.5);
      g.fillStyle = tc;
      for (const [ox, oy, rr] of [[0, -0.62, 0.3], [-0.2, -0.46, 0.22], [0.2, -0.48, 0.23], [0.02, -0.82, 0.24]]) { g.beginPath(); g.arc(x + ox * h, y + oy * h, rr * h, 0, TAU); g.fill(); }
      g.fillStyle = al(T.moss, 0.5);
      for (const [ox, oy, rr] of [[-0.1, -0.7, 0.13], [0.14, -0.55, 0.09], [-0.22, -0.5, 0.08]]) { g.beginPath(); g.arc(x + ox * h, y + oy * h, rr * h, 0, TAU); g.fill(); }
    }
    const fl = [T.verm, T.ochre, T.rose, T.cream];
    for (let i = 0; i < 150; i++) {
      const x = hash(i, 90) * w, y = yAt(x) + (14 + hash(i, 91) * 110) * u;
      g.fillStyle = fl[i % 4]; g.beginPath(); g.arc(x, y, (2.5 + hash(i, 92) * 3.5) * u, 0, TAU); g.fill();
    }
  }

  function buildFore(g, w, E) {
    const { T, H, u } = E, top0 = E.bluff;
    const yAt = (x) => top0 + (pn((x / w) * 6, 6, 41) - 0.5) * 26 * u + (pn((x / w) * 18, 18, 42) - 0.5) * 8 * u;
    const pts = []; for (let x = 0; x <= w; x += 5) pts.push([x, yAt(x)]);
    const body = (gg) => { gg.beginPath(); gg.moveTo(0, H + 10); pts.forEach((p) => gg.lineTo(p[0], p[1])); gg.lineTo(w, H + 10); gg.closePath(); };
    const top = (gg) => { gg.beginPath(); pts.forEach((p, i) => (i ? gg.lineTo(p[0], p[1]) : gg.moveTo(p[0], p[1]))); };
    paintBody(g, body, T.fore, { erode: 12 * u, edge: top, seed: 18 }, { x: 0, y: top0 - 20, w, h: H - top0 + 30 });
    g.save(); body(g); g.clip();
    g.fillStyle = al(T.teal, 0.22);
    g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1] + 16 * u) : g.moveTo(p[0], p[1] + 16 * u))); for (let i = pts.length - 1; i >= 0; i--) g.lineTo(pts[i][0], pts[i][1] + 4 * u); g.closePath(); g.fill();
    for (let i = 0; i < 12; i++) { g.fillStyle = al(T.cream, 0.1); const x = hash(i, 100) * w; g.beginPath(); g.ellipse(x, top0 + (30 + hash(i, 101) * 80) * u, (30 + hash(i, 102) * 60) * u, (6 + hash(i, 103) * 9) * u, 0, 0, TAU); g.fill(); }
    g.restore();
  }

  // ---- live parts of the world --------------------------------------------------------------------------
  function sky(ctx, E, M, camX, t) {
    const { W, hz, u, T } = E;
    ctx.fillStyle = M.c; ctx.fillRect(0, 0, W, hz + 30 * u);
    const sh = camX * 0.04, bandBottom = (frac0) => (x) => hz * frac0 + Math.sin((x + sh) * 0.0042) * 12 * u + Math.sin((x + sh) * 0.011 + 1.3) * 6 * u;
    const y1 = bandBottom(0.7), y0 = bandBottom(0.4);
    const mkBand = (yf) => ({ body: (g) => { g.beginPath(); g.moveTo(-20, -20); g.lineTo(W + 20, -20); for (let x = W + 20; x >= -20; x -= 12) g.lineTo(x, yf(x)); g.closePath(); }, edge: (g) => { g.beginPath(); for (let x = -20; x <= W + 20; x += 12) (x === -20 ? g.moveTo : g.lineTo).call(g, x, yf(x)); } });
    const b1 = mkBand(y1), b0 = mkBand(y0);
    gshape(ctx, { x: 0, y: 0, w: W, h: hz * 0.78 }, b1.body, M.b, { erode: 13 * u, edge: b1.edge, seed: 3, mottle: 1.0 });
    gshape(ctx, { x: 0, y: 0, w: W, h: hz * 0.5 }, b0.body, M.a, { erode: 14 * u, edge: b0.edge, seed: 5, mottle: 1.0 });
    // Stars come out as the sky goes to night.
    if (M.night > 0.02) {
      for (let i = 0; i < 46; i++) {
        const x = hash(i, 110) * W, y = hash(i, 111) * hz * 0.62, tw = 0.5 + 0.5 * Math.sin(t * (1.4 + hash(i, 112) * 2.4) + i * 2.1), r = (3 + hash(i, 113) * 5) * u * (0.6 + 0.6 * tw);
        ctx.save(); ctx.globalAlpha = M.night * (0.5 + 0.5 * tw); ctx.fillStyle = T.cream;
        ctx.beginPath(); ctx.moveTo(x, y - r * 1.8); ctx.lineTo(x + r * 0.4, y - r * 0.4); ctx.lineTo(x + r * 1.8, y); ctx.lineTo(x + r * 0.4, y + r * 0.4); ctx.lineTo(x, y + r * 1.8); ctx.lineTo(x - r * 0.4, y + r * 0.4); ctx.lineTo(x - r * 1.8, y); ctx.lineTo(x - r * 0.4, y - r * 0.4); ctx.closePath(); ctx.fill(); ctx.restore();
      }
    }
  }
  function sunSystem(ctx, E, M, camX, t) {
    const { W, hz, u, T } = E;
    const heights = [0.74, 0.4, 0.58, 0.76, 0.3], i = Math.floor(M.pos), k = eio(M.pos - i);
    const hy = lerp(heights[mod(i, 5)], heights[mod(i + 1, 5)], k);
    const sx = W * 0.72 - camX * 0.1 + Math.sin(t * 0.2) * 8 * u, sy = hz * hy, R = (E.tall ? 110 : 96) * u * (1 + 0.025 * Math.sin(t * 1.3));
    ctx.save();
    ctx.translate(sx, sy);
    // Rays: slow flat wedges that turn.
    ctx.rotate(t * 0.07);
    ctx.fillStyle = M.sun;
    for (let r = 0; r < 14; r++) {
      const a0 = (r / 14) * TAU, a1 = a0 + TAU / 28, L = R * (4.2 + 1.2 * Math.sin(r * 2.3 + t * 0.6));
      ctx.globalAlpha = 0.13;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a0) * L, Math.sin(a0) * L); ctx.lineTo(Math.cos(a1) * L, Math.sin(a1) * L); ctx.closePath(); ctx.fill();
    }
    ctx.rotate(-t * 0.07);
    ctx.globalAlpha = 1;
    for (let h = 3; h >= 1; h--) { ctx.globalAlpha = 0.17; ctx.fillStyle = M.sun; ctx.beginPath(); ctx.arc(0, 0, R * (1 + h * 0.42 + 0.05 * Math.sin(t * 1.1 + h)), 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
    gshape(ctx, { x: -R, y: -R, w: R * 2, h: R * 2 }, circ(0, 0, R), M.sun, { erode: 9 * u, seed: 9 });
    // A flat crescent shadow turns the disc into a painted sun.
    fillPath(ctx, (g) => { g.beginPath(); g.arc(0, 0, R * 0.9, -0.2, 1.6); g.arc(-R * 0.12, R * 0.04, R * 0.82, 1.6, -0.2, true); g.closePath(); }, mix(M.sun, M.c, 0.5), 0.45);
    ctx.restore();
  }
  function clouds(ctx, E, M, camX, t) {
    const { W, hz, u, T } = E;
    const col = mix(T.snow, M.c, 0.18), shade = mix(col, M.a, 0.28);
    for (let i = 0; i < 6; i++) {
      const sz = (150 + hash(i, 120) * 130) * u, span = W + sz * 3;
      const x = mod(hash(i, 121) * span + t * (10 + hash(i, 122) * 14) * u - camX * (0.14 + i * 0.016), span) - sz * 1.5;
      const y = hz * (0.14 + hash(i, 123) * 0.5) + Math.sin(t * 0.4 + i) * 4 * u;
      if (y < E.bandH * 0.55 && !E.tall) continue;
      const p = (g) => {
        g.beginPath(); g.moveTo(x - sz, y + sz * 0.18);
        g.bezierCurveTo(x - sz * 1.05, y - sz * 0.05, x - sz * 0.7, y - sz * 0.22, x - sz * 0.42, y - sz * 0.12);
        g.bezierCurveTo(x - sz * 0.3, y - sz * 0.42, x + sz * 0.15, y - sz * 0.45, x + sz * 0.28, y - sz * 0.16);
        g.bezierCurveTo(x + sz * 0.55, y - sz * 0.28, x + sz * 0.95, y - sz * 0.08, x + sz * 0.92, y + sz * 0.18);
        g.closePath();
      };
      gshape(ctx, { x: x - sz * 1.1, y: y - sz * 0.5, w: sz * 2.2, h: sz * 0.8 }, p, col, { erode: 9 * u, seed: 20 + i, mottle: 0.6,
        extra: (g) => { g.fillStyle = al(shade, 0.7); g.fillRect(x - sz * 1.2, y + sz * 0.06, sz * 2.4, sz * 0.2); } });
    }
  }
  function haze(ctx, E, y0, y1, color, a) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, al(color, 0)); g.addColorStop(1, al(color, a));
    ctx.fillStyle = g; ctx.fillRect(0, y0, E.W, y1 - y0);
  }
  function sea(ctx, E, M, camX, t, sunX) {
    const { W, hz, u, T, H } = E;
    const top = hz + 0.012 * H, bot = hz + 0.215 * H, hh = bot - top;
    const cols = T.sea.map((c, i) => mix(c, M.c, 0.34 - i * 0.1));
    const bands = [0, 0.3, 0.62, 1];
    for (let b = 0; b < 3; b++) { ctx.fillStyle = cols[b]; ctx.fillRect(0, top + hh * bands[b], W, hh * (bands[b + 1] - bands[b]) + 2); }
    // Dragged streaks drifting along the swell, denser and longer towards the viewer.
    for (let r = 0; r < 16; r++) {
      const f = r / 15, y = top + hh * Math.pow(f, 1.35) + 4 * u, n = 8;
      for (let j = 0; j < n; j++) {
        const sp = (5 + f * 16) * u * (hash(r, 130) < 0.5 ? 1 : -1), x = mod(hash(j, r + 200) * (W + 240) + t * sp - camX * (0.5 + f * 0.1), W + 240) - 120;
        const len = (36 + hash(j, r + 300) * 90) * (0.45 + f) * u, th = (1.8 + f * 4) * u;
        ctx.globalAlpha = 0.32 + 0.1 * Math.sin(t * 1.4 + j + r);
        ctx.fillStyle = (j + r) % 3 ? T.cream : T.ink;
        if ((j + r) % 3 === 0) ctx.globalAlpha *= 0.55;
        ctx.fillRect(x, y + Math.sin(t * 1.2 + x * 0.01) * 1.6 * u, len, th);
      }
    }
    ctx.globalAlpha = 1;
    // The sun's road: dashes that wobble and widen.
    for (let r = 0; r < 9; r++) {
      const f = r / 8, y = top + hh * (0.04 + f * 0.9), w = (46 + f * 120) * u * (1 + 0.22 * Math.sin(t * 1.9 + r * 1.3));
      ctx.globalAlpha = 0.5 * (1 - f * 0.4); ctx.fillStyle = M.sun;
      ctx.fillRect(sunX - w / 2 + Math.sin(t * 0.9 + r) * 8 * u, y, w, (3 + f * 5) * u);
    }
    ctx.globalAlpha = 1;
    // Two sailboats.
    for (let b = 0; b < 2; b++) {
      const row = b ? 0.7 : 0.28, sc = (b ? 1.25 : 0.7) * u * (E.tall ? 1.1 : 1), span = W * 1.7;
      const x = mod((b ? 0.62 : 0.2) * span + t * (b ? 9 : 6) * u - camX * 0.9, span) - W * 0.35;
      const y = top + hh * row + Math.sin(t * 1.4 + b * 2) * 3 * u, rock = Math.sin(t * 1.1 + b) * 0.035;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rock); ctx.scale(sc, sc);
      fillPath(ctx, poly([[-54, 0], [58, 0], [44, 18], [-40, 18]]), T.ink);
      fillPath(ctx, poly([[-54, 0], [-60, -8], [60, -8], [58, 0]]), T.verm);
      fillPath(ctx, poly([[-2, -10], [-2, -118], [-60, -16]]), T.cream);
      fillPath(ctx, poly([[4, -10], [4, -104], [42, -14]]), b ? T.ochre : T.snow);
      fillPath(ctx, poly([[-2, -118], [-2, -126], [18, -122]]), T.verm);
      strokePath(ctx, line([[0, -10], [0, -126]]), T.ink, 3);
      ctx.restore();
      ctx.globalAlpha = 0.35; ctx.fillStyle = T.ink;
      ctx.fillRect(x - 46 * sc, y + 20 * sc, 92 * sc * (1 + 0.1 * Math.sin(t * 2 + b)), 3 * sc);
      ctx.globalAlpha = 1;
    }
  }
  function lighthouseLive(ctx, E, M, L, x0, t) {
    const { u, T } = E, [lx, ly] = L.meta.lamp, [cx0, cy0] = L.meta.chimney;
    for (let x = x0; x < E.W + L.period * 0.1; x += L.period) {
      const sx = x + lx, sy = ly + L.top * 0 + 0;
      if (sx < -E.W * 0.7 || sx > E.W * 1.7) continue;
      const lamp = [sx, sy + 0];
      // The beam sweeps: long when it swings across, a glow when it points at us.
      const a = t * 1.15, c = Math.cos(a), dir = c >= 0 ? 1 : -1, len = Math.abs(c) * E.W * 0.75 + 30 * u;
      ctx.save(); ctx.translate(lamp[0], lamp[1] - 18 * u);
      const bc = M.night > 0.3 ? T.cream : T.sun, bg = ctx.createLinearGradient(0, 0, dir * len, 0);
      bg.addColorStop(0, al(bc, 0.5)); bg.addColorStop(1, al(bc, 0));
      ctx.fillStyle = bg;
      ctx.globalAlpha = (0.55 + 0.5 * M.night) * (0.45 + 0.55 * Math.abs(c));
      ctx.beginPath(); ctx.moveTo(0, -8 * u); ctx.lineTo(dir * len, -len * 0.08 - 34 * u); ctx.lineTo(dir * len, len * 0.1 + 34 * u); ctx.lineTo(0, 8 * u); ctx.closePath(); ctx.fill();
      ctx.fillStyle = bc;
      ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t * 5.2);
      for (let g = 3; g >= 1; g--) { ctx.globalAlpha = 0.16 + (1 - Math.abs(c)) * 0.14; ctx.beginPath(); ctx.arc(0, 0, g * 22 * u, 0, TAU); ctx.fill(); }
      ctx.restore();
      // Chimney smoke curls up and thins.
      for (let k = 0; k < 6; k++) {
        const f = frac(t * 0.28 + k / 6), px = x + cx0 + Math.sin(f * 5 + k) * 14 * u + f * 70 * u, py = cy0 - f * 130 * u, r = (9 + f * 26) * u;
        ctx.globalAlpha = 0.55 * (1 - f); ctx.fillStyle = T.cream; ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
  function grass(ctx, E, M, camX, t) {
    const { W, u, T } = E, y0 = E.bluff + 8 * u, n = E.tall ? 12 : 18;
    for (let i = 0; i < n; i++) {
      const x = mod((i + hash(i, 140) * 0.8) * (W / n) - camX * 1.25, W + 200) - 100;
      for (let b = 0; b < 4; b++) {
        const h = (50 + hash(i * 7 + b, 141) * 70) * u, sw = Math.sin(t * 1.5 + i * 0.9 + b * 0.6 + x * 0.004) * (0.1 + hash(b, 142) * 0.1) + (b - 1.5) * 0.14, wd = (13 + hash(b, 143) * 9) * u;
        const bx = x + (b - 1.5) * 16 * u, tipx = bx + Math.sin(sw) * h, tipy = y0 - Math.cos(sw) * h, bend = Math.sin(sw) * h * 0.5;
        ctx.fillStyle = b % 2 ? mix(T.fore, T.teal, 0.3) : T.fore;
        ctx.beginPath(); ctx.moveTo(bx - wd, y0 + 14 * u); ctx.bezierCurveTo(bx - wd * 0.9 + bend * 0.2, y0 - h * 0.5, bx + bend * 0.8 - wd * 0.2, y0 - h * 0.8, tipx, tipy);
        ctx.bezierCurveTo(bx + bend * 0.8 + wd * 0.8, y0 - h * 0.7, bx + wd * 0.9 + bend * 0.2, y0 - h * 0.4, bx + wd, y0 + 14 * u); ctx.closePath(); ctx.fill();
      }
      if (i % 3 === 1) { const fx = x + 8 * u, fh = (110 + hash(i, 146) * 40) * u, sw = Math.sin(t * 1.3 + i) * 0.08;
        strokePath(ctx, line([[fx, y0 + 10 * u], [fx + Math.sin(sw) * fh, y0 - fh]]), T.fore, 5 * u);
        for (let q = 0; q < 5; q++) { const a = (q / 5) * TAU + t * 0.4; fillPath(ctx, ell(fx + Math.sin(sw) * fh + Math.cos(a) * 15 * u, y0 - fh + Math.sin(a) * 15 * u, 11 * u, 6 * u, a), i % 2 ? T.rose : T.sun); }
        fillPath(ctx, circ(fx + Math.sin(sw) * fh, y0 - fh, 8 * u), T.verm); }
    }
  }
  function gulls(ctx, E, M, camX, t) {
    const { W, hz, u, T } = E;
    for (let i = 0; i < 5; i++) {
      const sp = 38 + hash(i, 150) * 40, span = W + 400 * u, x = mod(hash(i, 151) * span + t * sp * u * (i % 2 ? -1 : 1) - camX * 0.3, span) - 200 * u;
      const y = hz * (0.2 + hash(i, 152) * 0.55) + Math.sin(t * 0.9 + i * 1.7) * 14 * u, s = (0.7 + hash(i, 153) * 0.6) * u * (E.tall ? 1.2 : 1);
      const flap = Math.sin(t * 5.5 + i * 2.2);
      ctx.save(); ctx.translate(x, y); ctx.scale(s * (i % 2 ? -1 : 1), s);
      ctx.strokeStyle = M.night > 0.5 ? T.cream : T.ink; ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(-34, -flap * 12 + 4); ctx.quadraticCurveTo(-16, -22 - flap * 14, 0, 0); ctx.quadraticCurveTo(16, -22 - flap * 14, 34, -flap * 12 + 4); ctx.stroke();
      ctx.restore();
    }
  }
  function motes(ctx, E, M, camX, t) {
    const { W, H, u, T } = E, cols = [T.ochre, T.cream, T.rose, T.verm];
    for (let i = 0; i < 22; i++) {
      const sp = (14 + hash(i, 160) * 22) * u, x = mod(hash(i, 161) * (W + 200) - t * sp * 1.1 - camX * (0.9 + hash(i, 162) * 0.5), W + 200) - 100;
      const y = mod(hash(i, 163) * H + t * sp * 0.7, H), r = (4 + hash(i, 164) * 5) * u, rot = t * (0.8 + hash(i, 165)) + i;
      ctx.save(); ctx.translate(x, y + Math.sin(t * 1.3 + i) * 12 * u); ctx.rotate(rot); ctx.globalAlpha = 0.7; ctx.fillStyle = cols[i % 4];
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.8, r * 0.8 * Math.abs(Math.cos(rot * 0.6) * 0.8 + 0.3), 0, 0, TAU); ctx.fill(); ctx.restore();
    }
  }

  // ---- poster furniture: the headline band, bunting, statement slabs -----------------------------------
  function band(ctx, E, k, t) {
    if (k <= 0.001) return;
    const { W, u, T, bandH } = E, off = -(1 - eo(k)) * (bandH + 70 * u);
    ctx.save(); ctx.translate(0, off);
    const wavy = (y0, ph) => (x) => y0 + Math.sin(x * 0.0061 + ph) * 7 * u + Math.sin(x * 0.017 + ph * 2) * 3 * u;
    const mk = (yf, th) => ({ body: (g) => { g.beginPath(); g.moveTo(-20, yf(-20) - th); g.lineTo(W + 20, yf(W + 20) - th); for (let x = W + 20; x >= -20; x -= 14) g.lineTo(x, yf(x)); g.closePath(); },
      edge: (g) => { g.beginPath(); for (let x = -20; x <= W + 20; x += 14) (x === -20 ? g.moveTo : g.lineTo).call(g, x, yf(x)); } });
    const s2 = mk(wavy(bandH + 24 * u, 2), 16 * u), s1 = mk(wavy(bandH + 12 * u, 1.3), 18 * u), s0 = mk(wavy(bandH, 0.4), bandH + 40 * u);
    gshape(ctx, { x: 0, y: bandH - 8 * u, w: W, h: 50 * u }, s2.body, T.rose, { erode: 9 * u, edge: s2.edge, seed: 31, mottle: 0.8 });
    gshape(ctx, { x: 0, y: bandH - 8 * u, w: W, h: 40 * u }, s1.body, T.ochre, { erode: 10 * u, edge: s1.edge, seed: 32, mottle: 0.8 });
    gshape(ctx, { x: 0, y: -40 * u, w: W, h: bandH + 50 * u }, s0.body, T.band, { erode: 10 * u, edge: s0.edge, seed: 33, mottle: 1.0,
      extra: (g) => { const sx = -W * 0.3 + ((t * 0.16) % 1.7) * W; g.fillStyle = "rgba(255,244,214,0.07)"; g.beginPath(); g.moveTo(sx, -40 * u); g.lineTo(sx + 180 * u, -40 * u); g.lineTo(sx + 60 * u, bandH + 20 * u); g.lineTo(sx - 120 * u, bandH + 20 * u); g.closePath(); g.fill(); } });
    // Painted detail inside the band so it is never a flat block: twinkling stars, a drifting crescent
    // and rows of scalloped swell along its foot.
    ctx.save(); ctx.beginPath(); ctx.rect(0, -60 * u, W, bandH + 4 * u); ctx.clip();
    for (let r = 0; r < 3; r++) {
      const sy = bandH - (14 + r * 26) * u, sp = (r % 2 ? -1 : 1) * (10 + r * 4) * u, sc = (60 + r * 14) * u;
      ctx.strokeStyle = al(T.teal, 0.3 - r * 0.06); ctx.lineWidth = 4 * u; ctx.lineCap = "round"; ctx.beginPath();
      for (let x = -sc + mod(t * sp, sc); x < W + sc; x += sc) { ctx.moveTo(x, sy); ctx.quadraticCurveTo(x + sc * 0.25, sy - 18 * u, x + sc * 0.5, sy); ctx.quadraticCurveTo(x + sc * 0.75, sy + 10 * u, x + sc, sy); }
      ctx.stroke();
    }
    for (let i = 0; i < 26; i++) {
      const x = hash(i, 400) * W, y = hash(i, 401) * (bandH - 70 * u) + 10 * u, tw = 0.5 + 0.5 * Math.sin(t * (1.2 + hash(i, 402) * 2.2) + i * 1.9);
      sparkle(ctx, x, y, (5 + hash(i, 403) * 8) * u * (0.55 + 0.6 * tw), i % 4 === 0 ? T.ochre : T.cream, 0.22 + 0.5 * tw);
    }
    { const mx = W - (E.tall ? 90 : 190) * u + Math.sin(t * 0.5) * 8 * u, my = bandH * (E.tall ? 0.84 : 0.42) + Math.cos(t * 0.6) * 6 * u, R = (E.tall ? 40 : 62) * u;
      fillPath(ctx, circ(mx, my, R * 1.9), T.ochre, 0.07 + 0.04 * Math.sin(t * 1.4));
      fillPath(ctx, (g) => { g.beginPath(); g.arc(mx, my, R, 0, TAU); g.arc(mx + R * 0.45, my - R * 0.15, R * 0.85, 0, TAU, true); g.closePath(); }, T.ochre, 0.75); }
    ctx.restore();
    // Bunting hung under the band, flags swinging.
    const y0 = bandH + 44 * u, spans = 5, perSpan = E.tall ? 3 : 5, cols = [T.verm, T.ochre, T.cream, T.rose, T.teal];
    const sag = 30 * u;
    ctx.strokeStyle = T.ink; ctx.lineWidth = 3 * u; ctx.beginPath();
    for (let s = 0; s < spans; s++) { const xa = (s / spans) * W, xb = ((s + 1) / spans) * W; ctx.moveTo(xa, y0); ctx.quadraticCurveTo((xa + xb) / 2, y0 + sag * 2, xb, y0); }
    ctx.stroke();
    for (let s = 0; s < spans; s++) {
      for (let f = 0; f < perSpan; f++) {
        const q = (f + 0.5) / perSpan, xa = (s / spans) * W, xb = ((s + 1) / spans) * W, x = lerp(xa, xb, q), y = y0 + sag * 2 * (1 - Math.pow(2 * q - 1, 2)) * 0.5 * 1.0;
        const sw = Math.sin(t * 2.3 + s * 1.7 + f * 0.9) * 0.16, size = (E.tall ? 40 : 34) * u;
        ctx.save(); ctx.translate(x, y); ctx.rotate(sw);
        ctx.fillStyle = cols[(s * perSpan + f) % cols.length]; ctx.beginPath(); ctx.moveTo(-size * 0.5, 0); ctx.lineTo(size * 0.5, 0); ctx.lineTo(0, size * 1.1); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }
  let SLAB = null;
  function slabSize(E, id) {
    const key = `${E.key}:${id}`;
    if (SLAB && SLAB.key === key) return SLAB;
    const els = id === "title" ? ["kicker", "title"] : ["closing"];
    let w = 0, h = 0, ok = true;
    for (const e of els) {
      const el = document.getElementById(e);
      if (!el) { ok = false; continue; }
      const r = document.createRange(); r.selectNodeContents(el);
      w = Math.max(w, r.getBoundingClientRect().width / (E.W / (Number(document.getElementById("root").dataset.width) || E.W)));
      h += el.offsetHeight + (e === "kicker" ? 24 * E.u : 0);
    }
    return (SLAB = { key: ok ? key : "", w: Math.max(w, 360 * E.u), h: Math.max(h, 160 * E.u) });
  }
  function slab(ctx, E, M, id, rel, t) {
    const { W, H, u, T } = E, S = slabSize(E, id);
    const pad = (E.tall ? 62 : 74) * u, w = Math.min(W - 40 * u, S.w + pad * 2), h = S.h + pad * 1.7, x = W / 2 - w / 2, y = H / 2 - h / 2;
    const col = id === "title" ? T.band : mix(T.verm, T.band, T.id === "mono" ? 0.1 : 0.04);
    ctx.save(); ctx.translate(-rel * 0.3 * W, 0); ctx.globalAlpha *= rel > 0 ? clamp(1 - rel / 0.5) : clamp((0.5 + rel) * 5);
    const wob = (xx, yy, k) => Math.sin((xx + yy) * 0.012 + k) * 4 * u;
    const body = (g) => { g.beginPath(); g.moveTo(x + 20 * u, y + wob(x, y, 1)); g.lineTo(x + w - 20 * u, y + wob(x + w, y, 2)); g.lineTo(x + w + wob(x, y, 3), y + h - 18 * u); g.lineTo(x + w - 24 * u, y + h + wob(x, y, 4)); g.lineTo(x + 24 * u, y + h + wob(x, y, 5)); g.lineTo(x + wob(x, y, 6), y + 20 * u); g.closePath(); };
    gshape(ctx, { x, y, w, h }, body, col, { erode: 16 * u, shadow: [14 * u, 16 * u, al(T.ink, 0.38)], seed: 41, mottle: 1.5,
      extra: (g) => { const sx = x - w * 0.3 + ((t * 0.18) % 1.8) * w; g.fillStyle = "rgba(255,244,214,0.09)"; g.beginPath(); g.moveTo(sx, y); g.lineTo(sx + 200 * u, y); g.lineTo(sx + 80 * u, y + h); g.lineTo(sx - 120 * u, y + h); g.closePath(); g.fill(); } });
    // A pinstripe frame and stripes along the foot, drawn dry.
    strokePath(ctx, rrect(x + 22 * u, y + 22 * u, w - 44 * u, h - 44 * u, 10 * u), T.cream, 3.5 * u, 0.5);
    gshape(ctx, { x: x + w * 0.18, y: y + h - 22 * u, w: w * 0.64, h: 14 * u }, rrect(x + w * 0.18, y + h - 22 * u, w * 0.64, 12 * u, 3 * u), T.ochre, { erode: 8 * u, seed: 43, mottle: 0.6 });
    gshape(ctx, { x: x + w * 0.3, y: y + h - 6 * u, w: w * 0.4, h: 10 * u }, rrect(x + w * 0.3, y + h - 6 * u, w * 0.4, 8 * u, 3 * u), T.rose, { erode: 7 * u, seed: 44, mottle: 0.6 });
    // The emblem on the top-left corner: a sun badge with turning rays.
    const R = (E.tall ? 58 : 70) * u, ex = x + 10 * u, ey = y + 6 * u;
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(t * 0.35);
    for (let r = 0; r < 12; r++) { const a0 = (r / 12) * TAU, a1 = a0 + TAU / 24; fillPath(ctx, poly([[0, 0], [Math.cos(a0) * R * 1.6, Math.sin(a0) * R * 1.6], [Math.cos(a1) * R * 1.6, Math.sin(a1) * R * 1.6]]), T.ochre, 0.95); }
    ctx.restore();
    gshape(ctx, { x: ex - R, y: ey - R, w: R * 2, h: R * 2 }, circ(ex, ey, R), id === "title" ? T.verm : T.sun, { erode: 7 * u, shadow: [5 * u, 6 * u, al(T.ink, 0.5)], seed: 45 });
    fillPath(ctx, circ(ex, ey, R * 0.55), T.cream, 0.9);
    // Gulls riding the slab's top edge.
    for (let i = 0; i < 2; i++) { const gx = x + w * (i ? 0.84 : 0.62) + Math.sin(t * 0.8 + i * 2) * 30 * u, gy = y - (46 + i * 20) * u + Math.sin(t * 1.3 + i) * 8 * u, fl = Math.sin(t * 5 + i * 2);
      ctx.save(); ctx.translate(gx, gy); ctx.scale(u * 1.1, u * 1.1); ctx.strokeStyle = T.ink; ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-30, -fl * 10 + 4); ctx.quadraticCurveTo(-14, -20 - fl * 12, 0, 0); ctx.quadraticCurveTo(14, -20 - fl * 12, 30, -fl * 10 + 4); ctx.stroke(); ctx.restore(); }
    ctx.restore();
  }

  // ---- the stage: the world and the poster furniture ---------------------------------------------------
  function stage(ctx, S, info) {
    const E = env(S), { T, W, H, u, hz } = E;
    const P = planOf();
    // The kicker is lettered larger than the page sets it, before any slab is measured.
    const kk = document.getElementById("kicker");
    if (kk && !kk.__gc) { kk.__gc = 1; kk.style.setProperty("font-size", Math.round(46 * S.u) + "px", "important"); kk.style.setProperty("margin-bottom", Math.round(18 * S.u) + "px", "important"); }
    let idx = info.index, local = info.local, hold = info.hold;
    const n = P ? P.shown.length : 1;
    let past = false;
    if (idx < 0 && P && P.shown.length && info.t >= P.length - 1e-6) { idx = n - 1; local = P.shown[idx].hold; hold = local; past = true; }
    if (idx < 0) idx = 0;
    const cam = P ? camera(idx, n, local, hold, info.change) : 0;
    const M = moodAt(T, cam), t = info.t;
    const camX = cam * W * 0.5 + t * 16 * u;
    // Atmosphere first, then each layer with its own parallax.
    sky(ctx, E, M, camX, t);
    const sx = W * 0.72 - camX * 0.1;
    sunSystem(ctx, E, M, camX, t);
    clouds(ctx, E, M, camX, t);
    const far = getLayer(E, "far", W * 1.9, hz - 0.34 * H, buildFar);
    blit(ctx, far, E, camX * 0.16);
    haze(ctx, E, hz - 0.3 * H, hz + 0.04 * H, M.c, 0.55);
    const mid = getLayer(E, "mid", W * 1.5, hz - 0.12 * H, buildMid);
    blit(ctx, mid, E, camX * 0.3);
    haze(ctx, E, hz - 0.08 * H, hz + 0.12 * H, M.c, 0.32);
    sea(ctx, E, M, camX, t, sx);
    gulls(ctx, E, M, camX, t);
    const head = getLayer(E, "head", W * 2.4, hz - 0.14 * H, buildHead);
    const hx0 = blit(ctx, head, E, camX * 0.56);
    lighthouseLive(ctx, E, M, head, hx0, t);
    const near = getLayer(E, "near", W * 1.7, hz + 0.1 * H, buildNear);
    blit(ctx, near, E, camX * 0.8);
    const fore = getLayer(E, "fore", W * 1.3, E.bluff - 60 * u, buildFore);
    blit(ctx, fore, E, camX * 1.2);
    grass(ctx, E, M, camX, t);
    motes(ctx, E, M, camX, t);
    // The headline band is present on the drawn scenes and lifts away on title and closing.
    let bandK = 1;
    if (P && P.shown.length) {
      const a = P.shown[clamp(Math.floor(cam), 0, n - 1)], b = P.shown[clamp(Math.floor(cam) + 1, 0, n - 1)];
      bandK = lerp(a.statement ? 0 : 1, b.statement ? 0 : 1, eio(cam - Math.floor(cam)));
    } else bandK = 0;
    band(ctx, E, bandK, t);
    if (P) P.shown.forEach((s, i) => { const rel = cam - i; if (s.statement && Math.abs(rel) < 0.6) slab(ctx, E, M, s.id, rel, t); });
    // Past the last frame the template draws no scene: hold the final one.
    if (past && P && DRAWN[P.shown[idx].id]) SCENES[P.shown[idx].id](ctx, S, null, 1, P.data[P.shown[idx].id], { t, local, hold, change: info.change, past: true });
  }

  // ======================================================================================================
  // Scenes
  // ======================================================================================================
  const DRAWN = { chart: 1, object: 1, people: 1, process: 1, compare: 1 };
  const SCENES = {};

  // The tag: a cream label with a dry edge, scaling in with its words so it is never blank.
  function tag(ctx, E, cx, cy, label, size, k, o = {}) {
    if (k <= 0.01 || !label) return;
    const { T, u } = E, tw = measure(ctx, label, size), w = tw + size * 1.0, h = size * 1.5;
    ctx.save(); ctx.translate(cx, cy); const sc = 0.55 + 0.45 * back(k); ctx.scale(sc, sc); ctx.rotate(o.rot || 0); ctx.globalAlpha *= clamp(k * 3);
    const x = o.left ? 0 : -w / 2;
    gshape(ctx, { x, y: -h / 2, w, h }, rrect(x, -h / 2, w, h, h * 0.16), o.color || T.card, { erode: 8 * u, shadow: [6 * u, 7 * u, al(T.ink, 0.8)], seed: o.seed || 51, mottle: 0.8 });
    txt(ctx, label, x + w / 2, size * 0.04, size, { color: o.ink || T.cardInk });
    ctx.restore();
    return w;
  }
  function burst(ctx, E, x, y, R, t, color, alpha = 0.6, rays = 14) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.5); ctx.fillStyle = color; ctx.globalAlpha *= alpha;
    for (let r = 0; r < rays; r++) { const a0 = (r / rays) * TAU, a1 = a0 + TAU / (rays * 2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a0) * R, Math.sin(a0) * R); ctx.lineTo(Math.cos(a1) * R, Math.sin(a1) * R); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  function sparkle(ctx, x, y, r, color, a = 1) {
    ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.28, y - r * 0.28); ctx.lineTo(x + r, y); ctx.lineTo(x + r * 0.28, y + r * 0.28); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.28, y + r * 0.28); ctx.lineTo(x - r, y); ctx.lineTo(x - r * 0.28, y - r * 0.28); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  // A long plank ledge the scene's props stand on (a quay, a desk, a stage).
  function ledge(ctx, E, x0, x1, y, depth, color, face, seed, lead = 1) {
    const { u, T } = E, w = (x1 - x0) * lead;
    const wob = (xx, k) => Math.sin(xx * 0.011 + k) * 3 * u;
    gshape(ctx, { x: x0, y, w, h: depth }, (g) => { g.beginPath(); g.moveTo(x0, y + wob(x0, 1)); g.lineTo(x0 + w, y + wob(x1, 2)); g.lineTo(x0 + w, y + 34 * u); g.lineTo(x0, y + 34 * u); g.closePath(); }, color, { erode: 8 * u, seed, mottle: 0.9, shadow: [0, 10 * u, al(T.ink, 0.35)] });
    gshape(ctx, { x: x0, y: y + 30 * u, w, h: depth - 30 * u }, (g) => { g.beginPath(); g.moveTo(x0, y + 32 * u); g.lineTo(x0 + w, y + 32 * u); g.lineTo(x0 + w, y + depth); g.lineTo(x0, y + depth); g.closePath(); }, face, { erode: 9 * u, seed: seed + 1, mottle: 1.1 });
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y, w, depth); ctx.clip();
    ctx.strokeStyle = al(T.ink, 0.45); ctx.lineWidth = 3 * u;
    for (let x = x0 + 60 * u; x < x0 + w; x += 96 * u) { ctx.beginPath(); ctx.moveTo(x, y + 2 * u); ctx.lineTo(x, y + 32 * u); ctx.stroke(); }
    ctx.strokeStyle = al(T.cream, 0.14); for (let x = x0 + 30 * u; x < x0 + w; x += 192 * u) { ctx.beginPath(); ctx.moveTo(x, y + 44 * u); ctx.lineTo(x, y + depth); ctx.stroke(); }
    ctx.restore();
  }

  function wrap(id, fn) {
    return (ctx, S, box, p, d, info) => {
      const E = env(S), P = planOf();
      const i = P ? Math.max(0, P.shown.findIndex((s) => s.id === id)) : 0, n = P ? P.shown.length : 1;
      const local = Math.max(0, info.local), cam = camera(i, n, local, info.hold, info.change), rel = cam - i;
      const B = box || { x: (E.tall ? 90 : 140) * E.u, y: E.H * (E.tall ? 0.3 : 0.34), w: E.W - (E.tall ? 180 : 280) * E.u, h: E.H * (E.tall ? 0.6 : 0.58) };
      ctx.save();
      ctx.translate(rel > 0 ? -rel * 2.2 * E.W : -rel * 0.9 * E.W, 0);
      fn(ctx, E, B, d, local, info.t);
      ctx.restore();
    };
  }
  const lp = (L, delay, dur) => eo(seg(L, delay, delay + dur));

  // ---- chart: crate towers on a quay ---------------------------------------------------------------------
  SCENES.chart = wrap("chart", (ctx, E, box, d, L, t) => {
    const { u, T } = E, n = d.values.length, vals = d.values.map((v) => Math.max(0, Number(v) || 0)), max = Math.max(...vals, 1e-6);
    const gy = box.y + box.h - (E.tall ? 136 : 124) * u, slot = box.w / n, bw = Math.min(slot * 0.58, 290 * u);
    const flagFs = 104 * u, maxH = gy - (box.y - 14 * u + flagFs * 1.4 + 52 * u), cu = maxH / 7;
    ledge(ctx, E, box.x - 60 * u, box.x + box.w + 60 * u, gy, 134 * u, T.wood, mix(T.wood, T.ink, 0.55), 61, lp(L, 0, 0.5));
    // Posts at the quay's ends with a rope between them.
    for (const px of [box.x - 36 * u, box.x + box.w + 36 * u]) fillPath(ctx, rrect(px - 14 * u, gy - 40 * u, 28 * u, 46 * u, 9 * u), T.ink);
    const hot = Number.isInteger(d.highlight) && d.highlight >= 0 && d.highlight < n ? d.highlight : -1;
    for (let i = 0; i < n; i++) {
      const cx = box.x + slot * (i + 0.5), bx = cx - bw / 2, Hb = Math.max(14 * u, maxH * (vals[i] / max)), dx = bw * 0.16, dy = bw * 0.13;
      const prog = lp(L, 0.12 + i * 0.15, 0.95), cur = Hb * prog, isHot = i === hot;
      const col = isHot ? T.verm : i % 2 ? mix(T.teal, T.deep, 0.35) : T.teal;
      // The target: dashed outline that marches while the tower builds.
      ctx.save(); ctx.setLineDash([16 * u, 11 * u]); ctx.lineDashOffset = -t * 26 * u; ctx.lineWidth = 4 * u; ctx.strokeStyle = al(T.cream, 0.5 * (1 - prog * 0.6));
      ctx.strokeRect(bx, gy - Hb, bw, Hb); ctx.restore();
      if (cur > 4) {
        const top = gy - cur;
        gshape(ctx, { x: bx + bw, y: top - dy, w: dx, h: cur + dy }, poly([[bx + bw, top], [bx + bw + dx, top - dy], [bx + bw + dx, gy - dy], [bx + bw, gy]]), mix(col, T.ink, 0.38), { erode: 6 * u, seed: 70 + i });
        gshape(ctx, { x: bx, y: top - dy, w: bw + dx, h: dy }, poly([[bx, top], [bx + dx, top - dy], [bx + bw + dx, top - dy], [bx + bw, top]]), mix(col, T.cream, 0.4), { erode: 6 * u, seed: 80 + i });
        gshape(ctx, { x: bx, y: top, w: bw, h: cur }, rrect(bx, top, bw, cur, 4 * u), col, { erode: 10 * u, seed: 90 + i, mottle: 1.2,
          extra: (g, r) => { const sw = bx - bw + frac(t * 0.28 + i * 0.23) * bw * 3.2; g.fillStyle = "rgba(255,244,214,0.16)"; g.beginPath(); g.moveTo(sw, r.y); g.lineTo(sw + bw * 0.28, r.y); g.lineTo(sw - bw * 0.1, r.y + r.h); g.lineTo(sw - bw * 0.38, r.y + r.h); g.closePath(); g.fill(); } });
        // Crate seams and braces.
        ctx.save(); ctx.beginPath(); ctx.rect(bx, top, bw, cur); ctx.clip();
        ctx.strokeStyle = al(T.ink, 0.5); ctx.lineWidth = 4 * u;
        for (let j = 0; j * cu < cur; j++) {
          const y1 = gy - j * cu, y0 = Math.max(top, y1 - cu);
          if (j > 0) { ctx.beginPath(); ctx.moveTo(bx, y1); ctx.lineTo(bx + bw, y1); ctx.stroke(); }
          ctx.globalAlpha = 0.5; ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.moveTo(bx + 8 * u, y1 - 8 * u); ctx.lineTo(bx + bw - 8 * u, y0 + 8 * u); ctx.moveTo(bx + bw - 8 * u, y1 - 8 * u); ctx.lineTo(bx + 8 * u, y0 + 8 * u); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 4 * u;
        }
        ctx.restore();
        // Pole and the flag carrying the number.
        const shown = M_format(vals[i] * prog, d), fs = fitSize(ctx, shown, flagFs, slot * 0.92 - 36 * u, 70 * u), fw = measure(ctx, M_format(vals[i], d), fs) + 34 * u, fh = fs * 1.2;
        const k = seg(prog, 0.15, 0.7);
        if (k > 0) {
          const pt = top - dy * 0.5, ph = fh + 34 * u;
          if (isHot) burst(ctx, E, cx + fw * 0.4, pt - ph + fh * 0.5, 170 * u * eo(k), t, T.ochre, 0.55);
          strokePath(ctx, line([[cx, pt], [cx, pt - ph * k]]), T.ink, 6 * u);
          ctx.save(); ctx.translate(cx, pt - ph * k); ctx.scale(k, k);
          const wv = (q) => Math.sin(t * 4.2 + q * 3.2 + i) * 6 * u * q;
          const fl = (g) => { g.beginPath(); g.moveTo(0, 0); for (let q = 0; q <= 1.001; q += 0.1) g.lineTo(fw * q, wv(q)); for (let q = 1; q >= -0.001; q -= 0.1) g.lineTo(fw * q, fh + wv(q)); g.closePath(); };
          gshape(ctx, { x: 0, y: -10 * u, w: fw + 10 * u, h: fh + 20 * u }, fl, isHot ? T.cream : T.card, { erode: 6 * u, seed: 100 + i, mottle: 0.6, shadow: [5 * u, 6 * u, al(T.ink, 0.7)] });
          txt(ctx, shown, fw / 2, fh * 0.54 + wv(0.5), fs, { color: isHot ? T.verm : T.cardInk });
          ctx.restore();
        }
        if (isHot && prog > 0.8) for (let s = 0; s < 3; s++) sparkle(ctx, cx + (s - 1) * bw * 0.7, gy - cur - (flagFs * 1.9 + s * 28 * u) + Math.sin(t * 2 + s) * 8 * u, (12 + s * 3) * u * (0.6 + 0.4 * Math.sin(t * 3 + s * 2)), T.sun, 0.9);
      }
      // Label painted on the quay's face.
      txt(ctx, d.labels[i] || "", cx, gy + 84 * u, 48 * u, { color: T.cream, alpha: lp(L, 0.1 + i * 0.1, 0.35) });
    }
  });
  function M_format(v, d) { return window.DreamcutMotion.formatNumber(v, 0, d.prefix, d.suffix); }

  // ---- object: a desk, a laptop painting a little landscape, three labelled pins ---------------------------
  function screenArt(ctx, E, rx, ry, rw, rh, L, t, tallScreen) {
    const { u, T } = E, M1 = T.moods[1], M2 = T.moods[3];
    ctx.save(); rrect(rx, ry, rw, rh, 10 * u)(ctx); ctx.clip();
    fillPath(ctx, (g) => { g.beginPath(); g.rect(rx, ry, rw, rh); }, mix(T.paper, T.ink, 0.12));
    const pr = { x: rx + rw * 0.05, y: ry + rh * 0.07, w: rw * 0.9, h: rh * (tallScreen ? 0.46 : 0.5) };
    // The preview: a tiny painted coast whose sun crosses and whose peaks scroll.
    ctx.save(); ctx.beginPath(); ctx.rect(pr.x, pr.y, pr.w, pr.h); ctx.clip();
    const cyc = frac(t * 0.08);
    const sk = mix(M1.a, M2.a, eio(Math.abs(Math.sin(cyc * Math.PI))) * 0.0 + 0.0);
    ctx.fillStyle = M1.b; ctx.fillRect(pr.x, pr.y, pr.w, pr.h);
    ctx.fillStyle = M1.a; ctx.fillRect(pr.x, pr.y, pr.w, pr.h * 0.42);
    burst(ctx, E, pr.x + pr.w * (0.15 + 0.7 * cyc), pr.y + pr.h * (0.62 - 0.4 * Math.sin(cyc * Math.PI)), pr.h * 0.8, t, T.sun, 0.25);
    fillPath(ctx, circ(pr.x + pr.w * (0.15 + 0.7 * cyc), pr.y + pr.h * (0.62 - 0.4 * Math.sin(cyc * Math.PI)), pr.h * 0.1), T.sun);
    const off = frac(t * 0.06) * pr.w * 2;
    for (let k = -1; k < 6; k++) {
      const cx0 = pr.x + k * pr.w * 0.5 - off, hh = pr.h * (0.42 + 0.3 * hash(mod(k, 4), 7));
      fillPath(ctx, poly([[cx0 - pr.w * 0.34, pr.y + pr.h], [cx0, pr.y + pr.h - hh], [cx0 + pr.w * 0.34, pr.y + pr.h]]), T.far);
      fillPath(ctx, poly([[cx0, pr.y + pr.h - hh], [cx0 + pr.w * 0.34, pr.y + pr.h], [cx0 + pr.w * 0.04, pr.y + pr.h]]), al(T.ink, 0.2));
    }
    const off2 = frac(t * 0.13) * pr.w;
    for (let k = -1; k < 4; k++) { const cx0 = pr.x + k * pr.w * 0.5 + pr.w * 0.1 - off2; fillPath(ctx, ell(cx0, pr.y + pr.h, pr.w * 0.34, pr.h * 0.24), k % 2 ? T.mid : T.deep); }
    ctx.restore();
    strokePath(ctx, rrect(pr.x, pr.y, pr.w, pr.h, 6 * u), T.ink, 3 * u, 0.6);
    // Tracks: clips build in, a playhead sweeps.
    const rows = 3, ty0 = pr.y + pr.h + rh * 0.07, th = rh * (tallScreen ? 0.07 : 0.09), gap = rh * 0.035;
    const cols = [T.teal, T.ochre, T.rose, T.verm, T.sage];
    const clips = [[[0.0, 0.3], [0.34, 0.2], [0.58, 0.34]], [[0.08, 0.22], [0.36, 0.38], [0.78, 0.18]], [[0.0, 0.46], [0.5, 0.26], [0.8, 0.16]]];
    for (let r = 0; r < rows; r++) {
      fillPath(ctx, rrect(pr.x, ty0 + r * (th + gap), pr.w, th, 4 * u), al(T.ink, 0.12));
      clips[r].forEach(([a, b], i) => {
        const k = lp(L, 0.25 + r * 0.12 + i * 0.1, 0.4);
        if (k > 0) fillPath(ctx, rrect(pr.x + pr.w * a, ty0 + r * (th + gap), pr.w * b * k, th, 4 * u), cols[(r * 2 + i) % cols.length]);
      });
    }
    const ph = pr.x + pr.w * (0.04 + 0.92 * frac(t * 0.14));
    fillPath(ctx, rrect(ph - 2.5 * u, pr.y, 5 * u, ty0 + rows * (th + gap) - pr.y, 2 * u), T.verm);
    fillPath(ctx, poly([[ph - 9 * u, pr.y - 2 * u], [ph + 9 * u, pr.y - 2 * u], [ph, pr.y + 12 * u]]), T.verm);
    // The pointer.
    const px = pr.x + pr.w * (0.42 + 0.3 * Math.sin(t * 0.8)), py = ty0 + (th + gap) * (0.6 + 0.9 * (0.5 + 0.5 * Math.sin(t * 1.1)));
    fillPath(ctx, poly([[px, py], [px + 8 * u, py + 26 * u], [px + 14 * u, py + 18 * u], [px + 22 * u, py + 26 * u], [px + 27 * u, py + 22 * u], [px + 19 * u, py + 14 * u], [px + 28 * u, py + 8 * u]]), T.ink);
    ctx.restore();
    return { pr, ty0, th, gap };
  }
  SCENES.object = wrap("object", (ctx, E, box, d, L, t) => {
    const { u, T } = E, phone = d.kind === "phone";
    const gy = E.tall ? box.y + box.h * 0.56 : box.y + box.h - 124 * u;
    ledge(ctx, E, box.x - 60 * u, box.x + box.w + 60 * u, gy, E.tall ? 120 * u : 134 * u, T.wood, mix(T.wood, T.ink, 0.55), 111, lp(L, 0, 0.5));
    const dp = back(seg(L, 0.05, 0.7));
    let dw, dh, dx, dy;
    if (phone) { dw = E.tall ? box.w * 0.44 : Math.min(box.w * 0.24, (gy - box.y - 70 * u) / 1.95); dh = dw * 1.95; dx = E.tall ? box.x + box.w * 0.5 - dw / 2 : box.x + box.w * 0.2; dy = gy - dh - 24 * u; }
    else { dw = E.tall ? box.w * 0.86 : Math.min(box.w * 0.54, (gy - box.y - 60 * u) / 0.66); dh = dw * 0.62; dx = E.tall ? box.x + box.w * 0.07 : box.x + box.w * 0.04; dy = gy - dh - 26 * u; }
    ctx.save(); ctx.translate(0, (1 - dp) * 70 * u); ctx.globalAlpha *= clamp(dp * 3);
    const pad = (phone ? 20 : 24) * u, bez = rrect(dx, dy, dw, dh, (phone ? 40 : 18) * u);
    gshape(ctx, { x: dx, y: dy, w: dw, h: dh }, bez, mix(T.ink, T.cream, 0.08), { erode: 9 * u, seed: 120, shadow: [10 * u, 12 * u, al(T.ink, 0.4)], extra: (g, r) => { const sw = r.x - r.w * 0.3 + frac(t * 0.16) * r.w * 1.7; g.fillStyle = "rgba(255,244,214,0.09)"; g.beginPath(); g.moveTo(sw, r.y); g.lineTo(sw + 100 * u, r.y); g.lineTo(sw - 40 * u, r.y + r.h); g.lineTo(sw - 140 * u, r.y + r.h); g.closePath(); g.fill(); } });
    const sc = screenArt(ctx, E, dx + pad, dy + pad, dw - pad * 2, dh - pad * 2, L, t, phone || E.tall && false);
    if (phone) { fillPath(ctx, rrect(dx + dw * 0.5 - 14 * u, gy - 26 * u, 28 * u, 28 * u, 4 * u), mix(T.ink, T.cream, 0.2)); fillPath(ctx, rrect(dx + dw * 0.2, gy - 14 * u, dw * 0.6, 16 * u, 6 * u), mix(T.ink, T.cream, 0.2)); }
    else {
      gshape(ctx, { x: dx - dw * 0.06, y: dy + dh, w: dw * 1.12, h: 26 * u }, poly([[dx - dw * 0.06, gy], [dx + dw * 1.06, gy], [dx + dw * 1.0, dy + dh], [dx, dy + dh]]), mix(T.cream, T.ink, 0.28), { erode: 7 * u, seed: 121, mottle: 0.8 });
      fillPath(ctx, rrect(dx + dw * 0.42, dy + dh + 3 * u, dw * 0.16, 7 * u, 3 * u), al(T.ink, 0.45));
    }
    ctx.restore();
    // Desk props: a mug with steam and a plant that sways.
    const mx = phone ? dx + dw + 140 * u : dx + dw + 66 * u, my = gy;
    if (!E.tall || phone) {
      const pm = lp(L, 0.3, 0.5);
      ctx.save(); ctx.globalAlpha *= pm;
      gshape(ctx, { x: mx - 32 * u, y: my - 66 * u, w: 80 * u, h: 66 * u }, rrect(mx - 32 * u, my - 66 * u, 64 * u, 66 * u, 10 * u), T.cream, { erode: 6 * u, seed: 130, shadow: [6 * u, 6 * u, al(T.ink, 0.6)] });
      strokePath(ctx, (g) => { g.beginPath(); g.arc(mx + 32 * u, my - 36 * u, 16 * u, -1.4, 1.4); }, T.cream, 8 * u);
      fillPath(ctx, rrect(mx - 32 * u, my - 52 * u, 64 * u, 10 * u, 3 * u), T.verm);
      for (let k = 0; k < 3; k++) {
        const f = frac(t * 0.5 + k / 3);
        ctx.globalAlpha = pm * 0.55 * (1 - f); strokePath(ctx, (g) => { g.beginPath(); g.moveTo(mx - 14 * u + k * 14 * u, my - 72 * u); g.bezierCurveTo(mx - 28 * u + k * 14 * u + Math.sin(t * 2 + k) * 8 * u, my - 96 * u - f * 40 * u, mx + 4 * u + k * 14 * u, my - 110 * u - f * 40 * u, mx - 8 * u + k * 14 * u + Math.sin(t * 2.4 + k) * 10 * u, my - 140 * u - f * 40 * u); }, T.cream, 6 * u);
      }
      ctx.restore();
    }
    {
      const qx = E.tall ? box.x + box.w - 70 * u : mx + 120 * u, pm = lp(L, 0.4, 0.5);
      ctx.save(); ctx.globalAlpha *= pm;
      for (let k = 0; k < 5; k++) { const a = -1.5 + k * 0.75 + Math.sin(t * 1.5 + k) * 0.08; ctx.save(); ctx.translate(qx, gy - 56 * u); ctx.rotate(a * 0.55); fillPath(ctx, ell(0, -64 * u, 20 * u, 64 * u), k % 2 ? T.moss : T.pine); ctx.restore(); }
      gshape(ctx, { x: qx - 36 * u, y: gy - 60 * u, w: 72 * u, h: 62 * u }, poly([[qx - 36 * u, gy - 60 * u], [qx + 36 * u, gy - 60 * u], [qx + 26 * u, gy], [qx - 26 * u, gy]]), T.verm, { erode: 5 * u, seed: 131, shadow: [5 * u, 5 * u, al(T.ink, 0.5)] });
      ctx.restore();
    }
    // Pins: brush lines run from the device to their tags.
    const anchors = [[sc.pr.x + sc.pr.w * 0.72, sc.pr.y + sc.pr.h * 0.28], [sc.pr.x + sc.pr.w * 0.5, sc.ty0 + (sc.th + sc.gap) * 1 + sc.th * 0.5], [sc.pr.x + sc.pr.w * 0.2, sc.ty0 + (sc.th + sc.gap) * 2 + sc.th * 0.5]];
    const size = 44 * u;
    d.callouts.forEach((label, i) => {
      if (!label) return;
      const [ax, ay] = anchors[i];
      let bx, by, left = true;
      if (E.tall) { left = false; bx = box.x + box.w * (i === 1 ? 0.62 : 0.36); by = gy + (190 + i * 124) * u; }
      else { bx = box.x + box.w * 0.7; by = box.y + box.h * (0.12 + i * 0.26) + Math.sin(t * 1.5 + i) * 4 * u; }
      const lk = lp(L, 0.55 + i * 0.2, 0.55), tk = lp(L, 0.8 + i * 0.2, 0.4);
      const ex = E.tall ? bx : bx - 12 * u, ey = E.tall ? by - size * 0.78 : by;
      const pts = []; for (let k = 0; k <= 28; k++) { const q = (k / 28) * lk, mxp = (ax + ex) / 2, myp = (ay + ey) / 2 + (E.tall ? 0 : -50 * u); pts.push([(1 - q) * (1 - q) * ax + 2 * (1 - q) * q * mxp + q * q * ex, (1 - q) * (1 - q) * ay + 2 * (1 - q) * q * myp + q * q * ey]); }
      if (lk > 0.02) brushLine(ctx, pts, 9 * u, T.verm);
      const pulse = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7);
      ctx.save(); ctx.globalAlpha *= lp(L, 0.5 + i * 0.2, 0.2);
      fillPath(ctx, circ(ax, ay, (22 + pulse * 10) * u), T.verm, 0.28);
      fillPath(ctx, circ(ax, ay, 12 * u), T.cream); fillPath(ctx, circ(ax, ay, 7.5 * u), T.verm);
      ctx.restore();
      tag(ctx, E, bx, by, label, size, tk, { left, seed: 140 + i, rot: Math.sin(t * 1.2 + i) * 0.012 });
    });
  });

  // ---- people: folk on a stage -----------------------------------------------------------------------------
  function folk(ctx, E, i, s, t, coat, hot, pop) {
    const { u, T } = E, skin = T.skin[i % 4], hairs = [T.ink, T.plum, mix(T.wood, T.ink, 0.4), T.ink, T.verm, mix(T.ink, T.wood, 0.5)];
    const hair = hairs[i % 6], blink = frac((t + i * 0.77) / 3.2) < 0.045, bob = Math.sin(t * 2 + i) * 0.012;
    const hy = -0.76 * s;
    ctx.save(); ctx.scale(1, 1 + bob); ctx.rotate(Math.sin(t * 1.4 + i * 1.3) * 0.018);
    // Shadow, legs, shoes.
    fillPath(ctx, ell(0, 4 * u, s * 0.3, s * 0.045), T.ink, 0.35);
    for (const sx of [-1, 1]) {
      fillPath(ctx, rrect(sx * s * 0.1 - s * 0.055, -s * 0.28, s * 0.11, s * 0.28, s * 0.04), mix(T.ink, T.deep, 0.3));
      fillPath(ctx, ell(sx * s * 0.1 + sx * s * 0.02, -s * 0.012, s * 0.085, s * 0.04), i % 2 ? T.verm : T.ochre);
    }
    // Arms behind the coat.
    const wave = hot ? Math.sin(t * 5) * 0.25 : 0, sway = Math.sin(t * 1.6 + i) * 0.04;
    const armL = [-s * 0.2, -s * 0.6], handL = hot ? [-s * 0.34, -s * 0.37 + sway * s] : [-s * 0.3, -s * 0.38 + sway * s];
    const armR = [s * 0.2, -s * 0.6], handR = hot ? [s * 0.32 + Math.sin(wave) * s * 0.06, -s * 0.9 - Math.cos(wave) * s * 0.04] : [s * 0.28, -s * 0.38 - sway * s];
    for (const [a, h] of [[armL, handL], [armR, handR]]) { strokePath(ctx, line([a, h]), coat, s * 0.1); strokePath(ctx, line([a, h]), al(T.ink, 0.18), s * 0.03); fillPath(ctx, circ(h[0], h[1], s * 0.05), skin); }
    // Coat.
    const body = poly([[-s * 0.2, -s * 0.24], [s * 0.2, -s * 0.24], [s * 0.18, -s * 0.62], [s * 0.1, -s * 0.66], [-s * 0.1, -s * 0.66], [-s * 0.18, -s * 0.62]]);
    gshape(ctx, { x: -s * 0.22, y: -s * 0.68, w: s * 0.44, h: s * 0.46 }, body, coat, { erode: 6 * u, seed: 150 + i, mottle: 1.2 });
    fillPath(ctx, rrect(-s * 0.012, -s * 0.62, s * 0.024, s * 0.38, s * 0.01), al(T.ink, 0.28));
    if (i % 3 === 0) { fillPath(ctx, rrect(-s * 0.18, -s * 0.42, s * 0.36, s * 0.05, s * 0.01), mix(coat, T.cream, 0.5), 0.8); }
    // Neck and head.
    fillPath(ctx, rrect(-s * 0.035, -s * 0.7, s * 0.07, s * 0.07, s * 0.02), mix(skin, T.ink, 0.15));
    // Hair behind.
    if (i % 6 === 2) gshape(ctx, { x: -s * 0.17, y: hy - s * 0.15, w: s * 0.34, h: s * 0.36 }, rrect(-s * 0.16, hy - s * 0.14, s * 0.32, s * 0.34, s * 0.14), hair, { erode: 4 * u, seed: 160 + i, mottle: 0.5 });
    gshape(ctx, { x: -s * 0.13, y: hy - s * 0.13, w: s * 0.26, h: s * 0.26 }, circ(0, hy, s * 0.125), skin, { erode: 4 * u, seed: 170 + i, mottle: 0.6 });
    // Hair or hat in front.
    const hk = i % 6;
    if (hk === 0 || hk === 3) gshape(ctx, { x: -s * 0.14, y: hy - s * 0.15, w: s * 0.28, h: s * 0.14 }, (g) => { g.beginPath(); g.arc(0, hy, s * 0.135, Math.PI * 1.06, Math.PI * 1.94); g.quadraticCurveTo(s * 0.05, hy - s * 0.1, -s * 0.12, hy - s * 0.03); g.closePath(); }, hair, { erode: 4 * u, seed: 180 + i, mottle: 0.4 });
    if (hk === 1) { gshape(ctx, { x: -s * 0.14, y: hy - s * 0.15, w: s * 0.28, h: s * 0.14 }, (g) => { g.beginPath(); g.arc(0, hy, s * 0.135, Math.PI * 1.0, Math.PI * 2.0); g.closePath(); }, hair, { erode: 4 * u, seed: 181, mottle: 0.4 }); fillPath(ctx, circ(s * 0.02, hy - s * 0.175 + Math.sin(t * 2 + i) * s * 0.006, s * 0.06), hair); }
    if (hk === 2) gshape(ctx, { x: -s * 0.14, y: hy - s * 0.15, w: s * 0.28, h: s * 0.12 }, (g) => { g.beginPath(); g.arc(0, hy, s * 0.135, Math.PI * 1.0, Math.PI * 2.0); g.closePath(); }, hair, { erode: 4 * u, seed: 182, mottle: 0.4 });
    if (hk === 4) { fillPath(ctx, (g) => { g.beginPath(); g.arc(0, hy - s * 0.01, s * 0.14, Math.PI, TAU); g.closePath(); }, T.verm); fillPath(ctx, rrect(-s * 0.15, hy - s * 0.035, s * 0.3, s * 0.04, s * 0.02), T.cream); fillPath(ctx, circ(0, hy - s * 0.17 + Math.sin(t * 3 + i) * s * 0.008, s * 0.035), T.cream); }
    if (hk === 5) { for (let c = 0; c < 5; c++) fillPath(ctx, circ(-s * 0.1 + c * s * 0.05, hy - s * 0.115 - Math.abs(c - 2) * -s * 0.006, s * 0.05), hair); }
    // Face: eyes blink, cheeks, a small smile.
    const eh = blink ? s * 0.006 : s * 0.02;
    for (const sx of [-1, 1]) { fillPath(ctx, ell(sx * s * 0.047, hy + s * 0.005, s * 0.015, eh), T.ink); fillPath(ctx, circ(sx * s * 0.075, hy + s * 0.04, s * 0.02), T.rose, 0.6); }
    strokePath(ctx, (g) => { g.beginPath(); g.arc(0, hy + s * 0.032, s * 0.03, 0.15, Math.PI - 0.15); }, T.ink, Math.max(2, s * 0.012));
    if (hk === 5) strokePath(ctx, (g) => { g.beginPath(); g.arc(-s * 0.047, hy + s * 0.005, s * 0.032, 0, TAU); g.moveTo(s * 0.079, hy + s * 0.005); g.arc(s * 0.047, hy + s * 0.005, s * 0.032, 0, TAU); }, T.ink, Math.max(2, s * 0.01));
    ctx.restore();
  }
  SCENES.people = wrap("people", (ctx, E, box, d, L, t) => {
    const { u, T } = E, n = clamp(Math.round(d.count) || 3, 2, 6), slot = box.w / n;
    const base = box.y + box.h - (E.tall ? 150 : 124) * u;
    ledge(ctx, E, box.x - 60 * u, box.x + box.w + 60 * u, base, 134 * u, T.moss, mix(T.moss, T.ink, 0.6), 190, lp(L, 0, 0.5));
    const size = Math.min((base - box.y - 150 * u), slot * 1.45, E.tall ? 520 * u : 400 * u);
    const hotI = Math.min(n - 1, d.highlight ?? 1), coats = [T.teal, T.ochre, T.rose, T.sage, T.plum, T.deep];
    // Strung lights over the stage keep moving.
    const ly = box.y + 6 * u;
    ctx.save(); ctx.globalAlpha *= lp(L, 0.1, 0.5);
    strokePath(ctx, (g) => { g.beginPath(); g.moveTo(box.x - 40 * u, ly); g.quadraticCurveTo(box.x + box.w / 2, ly + 70 * u, box.x + box.w + 40 * u, ly); }, T.ink, 4 * u, 0.8);
    for (let k = 0; k < 11; k++) { const q = (k + 0.5) / 11, x = lerp(box.x - 40 * u, box.x + box.w + 40 * u, q), y = ly + 70 * u * 0.5 * (1 - Math.pow(2 * q - 1, 2)) * 1.0 + 12 * u + Math.sin(t * 2 + k) * 2 * u;
      const on = 0.55 + 0.45 * Math.sin(t * 3 + k * 1.9); fillPath(ctx, circ(x, y, 17 * u), [T.sun, T.rose, T.cream][k % 3], 0.3 * on); fillPath(ctx, circ(x, y, 9 * u), [T.sun, T.rose, T.cream][k % 3], 0.6 + 0.4 * on); }
    ctx.restore();
    for (let i = 0; i < n; i++) {
      const cx = box.x + slot * (i + 0.5), hot = i === hotI, s = size * (hot ? 1.08 : 1);
      const pop = lp(L, 0.12 + i * 0.13, 0.55), k = back(seg(L, 0.12 + i * 0.13, 0.12 + i * 0.13 + 0.55));
      if (hot && pop > 0) { burst(ctx, E, cx, base - s * 0.55, s * 0.9 * pop, t, T.ochre, 0.28, 16); fillPath(ctx, circ(cx, base - s * 0.55, s * 0.6 * pop), T.sun, 0.2); }
      ctx.save(); ctx.translate(cx, base + 4 * u); ctx.scale(1, Math.max(0.01, k)); ctx.globalAlpha *= clamp(pop * 4);
      folk(ctx, E, i, s, t, hot ? T.verm : coats[i % 6], hot, pop);
      ctx.restore();
      const label = d.badges[i % d.badges.length];
      const stagger = slot < 330 * u ? (i % 2) * 74 * u : 0;
      const ty = base - s * 1.0 - 62 * u - stagger + Math.sin(t * 1.7 + i * 1.2) * 5 * u;
      if (label && pop > 0.4) { const kk = lp(L, 0.35 + i * 0.13, 0.4); strokePath(ctx, line([[cx, ty + 28 * u], [cx, base - s * 0.93]]), T.ink, 4 * u, kk * 0.8); tag(ctx, E, cx, ty, label, 44 * u, kk, { color: hot ? T.verm : T.card, ink: hot ? T.cream : T.cardInk, seed: 200 + i, rot: Math.sin(t * 1.3 + i) * 0.015 }); }
      if (hot && pop > 0.9) for (let q = 0; q < 3; q++) sparkle(ctx, cx + (q - 1) * s * 0.42, base - s * (0.95 + q * 0.12), (12 + q * 3) * u * (0.6 + 0.4 * Math.sin(t * 3 + q * 2)), T.sun, 0.9);
    }
  });

  // ---- process: a trail with stations -----------------------------------------------------------------------
  function catmull(pts, per = 14) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let k = 0; k < per; k++) { const q = k / per, q2 = q * q, q3 = q2 * q; out.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * q + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * q2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * q3), 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * q + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * q2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * q3)]); }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  function stationIcon(ctx, E, kind, x, y, R, t, k) {
    const { u, T } = E;
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k); ctx.globalAlpha *= clamp(k * 3);
    if (kind === 0) { // a stack of pages, a bar of light scanning the top one
      for (let p = 2; p >= 0; p--) { ctx.save(); ctx.rotate((p - 1) * 0.1); gshape(ctx, { x: -R * 0.46, y: -R * 1.12, w: R * 0.92, h: R * 1.12 }, rrect(-R * 0.46, -R * 1.12, R * 0.92, R * 1.12, R * 0.05), p === 0 ? T.card : mix(T.card, T.ochre, 0.25 * p), { erode: 5 * u, seed: 210 + p, shadow: [5 * u, 6 * u, al(T.ink, 0.5)] }); ctx.restore(); }
      for (let l = 0; l < 6; l++) fillPath(ctx, rrect(-R * 0.34, -R * 0.98 + l * R * 0.14, R * (l % 3 === 2 ? 0.36 : 0.68), R * 0.045, R * 0.02), T.ink, 0.65);
      const sy = -R * 1.04 + frac(t * 0.5) * R * 0.95; fillPath(ctx, rrect(-R * 0.46, sy, R * 0.92, R * 0.11, R * 0.03), T.ochre, 0.55);
      fillPath(ctx, circ(R * 0.36, -R * 0.2 + Math.sin(t * 2) * R * 0.04, R * 0.2), T.cream, 0.0);
    } else if (kind === 1) { // a camp fire
      for (const sg of [-1, 1]) { ctx.save(); ctx.rotate(sg * 0.35); fillPath(ctx, rrect(-R * 0.5, -R * 0.1, R * 1.0, R * 0.16, R * 0.07), T.wood); ctx.restore(); }
      const fl = (sc, col, ph) => { const w = Math.sin(t * 7 + ph) * R * 0.04, h = R * sc * (1 + 0.09 * Math.sin(t * 9 + ph)); fillPath(ctx, (g) => { g.beginPath(); g.moveTo(-R * 0.3 * sc, -R * 0.05); g.quadraticCurveTo(-R * 0.34 * sc, -h * 0.5, w, -h); g.quadraticCurveTo(R * 0.36 * sc, -h * 0.45, R * 0.3 * sc, -R * 0.05); g.closePath(); }, col); };
      fl(1.1, T.verm, 0); fl(0.78, T.ochre, 1.7); fl(0.45, T.sun, 3.1);
      for (let q = 0; q < 5; q++) { const f = frac(t * 0.7 + q / 5); fillPath(ctx, circ(Math.sin(f * 6 + q * 2) * R * 0.3, -R * (0.5 + f * 1.1), (6 - f * 4) * u), T.sun, 1 - f); }
    } else if (kind === 3) { // a star lantern
      strokePath(ctx, line([[0, 0], [0, -R * 0.5]]), T.ink, 5 * u);
      ctx.save(); ctx.translate(0, -R * 0.9); ctx.rotate(Math.sin(t * 1.6) * 0.08);
      burst(ctx, E, 0, 0, R * 0.9, t, T.sun, 0.6, 10);
      gshape(ctx, { x: -R * 0.4, y: -R * 0.4, w: R * 0.8, h: R * 0.8 }, (g) => { g.beginPath(); for (let a = 0; a < 10; a++) { const rr = a % 2 ? R * 0.17 : R * 0.4, an = -Math.PI / 2 + (a / 10) * TAU; g.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); } g.closePath(); }, T.ochre, { erode: 5 * u, seed: 214, shadow: [5 * u, 5 * u, al(T.ink, 0.5)] });
      ctx.restore();
    } else { // a summit flag with a tick
      strokePath(ctx, line([[0, 0], [0, -R * 1.5]]), T.ink, 7 * u);
      const fw = R * 0.95, fh = R * 0.62, wv = (q) => Math.sin(t * 4 + q * 3) * 6 * u * q;
      burst(ctx, E, fw * 0.5, -R * 1.5 + fh * 0.5, R * 1.05, t, T.ochre, 0.5, 14);
      ctx.save(); ctx.translate(0, -R * 1.5);
      gshape(ctx, { x: 0, y: -10 * u, w: fw + 10 * u, h: fh + 20 * u }, (g) => { g.beginPath(); g.moveTo(0, 0); for (let q = 0; q <= 1.001; q += 0.1) g.lineTo(fw * q, wv(q)); for (let q = 1; q >= -0.001; q -= 0.1) g.lineTo(fw * q, fh + wv(q)); g.closePath(); }, T.card, { erode: 6 * u, seed: 215, shadow: [5 * u, 6 * u, al(T.ink, 0.7)] });
      strokePath(ctx, (g) => { g.beginPath(); g.moveTo(fw * 0.22, fh * 0.52 + wv(0.2)); g.lineTo(fw * 0.42, fh * 0.76 + wv(0.4)); g.lineTo(fw * 0.8, fh * 0.2 + wv(0.8)); }, T.verm, 11 * u);
      ctx.restore();
    }
    ctx.restore();
  }
  SCENES.process = wrap("process", (ctx, E, box, d, L, t) => {
    const { u, T } = E, n = clamp(d.steps.length, 2, 4), kinds = n === 3 ? [0, 1, 2] : n === 2 ? [0, 2] : [0, 1, 3, 2];
    const pos = [];
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      if (E.tall) pos.push({ x: box.x + box.w * (i % 2 ? 0.68 : 0.3), y: box.y + box.h * lerp(0.84, 0.3, f) });
      else pos.push({ x: box.x + box.w * lerp(0.14, 0.86, f), y: box.y + box.h * lerp(0.76, 0.5, f) });
    }
    const mw = E.tall ? 430 * u : Math.min(380 * u, (box.w / n) * 0.86), R = (E.tall ? 150 : 138) * u;
    // The trail through every station, drawn on and walked.
    const way = [[box.x - 50 * u, E.tall ? box.y + box.h * 0.96 : box.y + box.h * 0.9], ...pos.map((p) => [p.x, p.y + 16 * u]), [E.tall ? box.x + box.w * 0.3 : box.x + box.w + 50 * u, E.tall ? box.y + box.h * 0.12 : box.y + box.h * 0.4]];
    const path = catmull(way, 18);
    const tk = lp(L, 0.15, 1.1), cnt = Math.max(2, Math.floor(path.length * tk));
    for (let i = 0; i < n; i++) {
      const p = pos[i], k = lp(L, 0.1 + i * 0.18, 0.5), top = p.y;
      ctx.save(); ctx.globalAlpha *= clamp(k * 3);
      const mound = (g) => { g.beginPath(); g.moveTo(p.x - mw * 0.62, box.y + box.h); g.bezierCurveTo(p.x - mw * 0.5, top + 20 * u, p.x - mw * 0.3, top - 6 * u, p.x, top - 6 * u); g.bezierCurveTo(p.x + mw * 0.3, top - 6 * u, p.x + mw * 0.5, top + 20 * u, p.x + mw * 0.62, box.y + box.h); g.closePath(); };
      ctx.translate(0, (1 - eo(k)) * 40 * u);
      gshape(ctx, { x: p.x - mw * 0.64, y: top - 10 * u, w: mw * 1.28, h: box.y + box.h - top + 20 * u }, mound, i === n - 1 ? T.moss : mix(T.moss, T.deep, 0.25 + 0.2 * (i % 2)), { erode: 12 * u, seed: 220 + i, shadow: [8 * u, 10 * u, al(T.ink, 0.3)], mottle: 1.3 });
      ctx.restore();
    }
    if (cnt > 2) brushLine(ctx, path.slice(0, cnt), 18 * u, T.cream, 0.95);
    if (cnt > 2) { ctx.save(); ctx.setLineDash([22 * u, 24 * u]); ctx.lineDashOffset = -t * 30 * u; ctx.lineWidth = 4 * u; ctx.strokeStyle = al(T.ink, 0.55); ctx.beginPath(); path.slice(0, cnt).forEach((q, i) => (i ? ctx.lineTo(q[0], q[1] + 1 * u) : ctx.moveTo(q[0], q[1] + 1 * u))); ctx.stroke(); ctx.restore(); }
    for (let i = 0; i < n; i++) {
      const p = pos[i], k = lp(L, 0.3 + i * 0.22, 0.55);
      stationIcon(ctx, E, kinds[i], p.x, p.y - 6 * u, R, t, k);
      // Numeral stamp and the step's name.
      const sk = lp(L, 0.28 + i * 0.22, 0.4);
      if (sk > 0) { ctx.save(); ctx.translate(p.x - mw * 0.36, p.y + 38 * u); ctx.scale(sk, sk);
        gshape(ctx, { x: -36 * u, y: -36 * u, w: 72 * u, h: 72 * u }, circ(0, 0, 36 * u), i === n - 1 ? T.verm : T.ochre, { erode: 5 * u, seed: 230 + i, shadow: [4 * u, 5 * u, al(T.ink, 0.6)] });
        txt(ctx, String(i + 1), 0, 2 * u, 54 * u, { color: i === n - 1 ? T.cream : T.ink }); ctx.restore(); }
      const lab = d.steps[i];
      const tx = E.tall ? (i % 2 ? p.x - mw * 0.86 : p.x + mw * 0.86) : p.x, ty = E.tall ? p.y - R * 0.55 : p.y - R * 1.7 - 52 * u;
      const fs = Math.min(46 * u, (E.tall ? box.w * 0.46 : (box.w / n) * 0.9) / Math.max(5, lab.length) * 2.1);
      tag(ctx, E, tx, ty + Math.sin(t * 1.6 + i * 1.4) * 5 * u, lab, Math.max(42 * u, fs), lp(L, 0.45 + i * 0.22, 0.4), { seed: 240 + i, rot: Math.sin(t * 1.2 + i) * 0.012 });
    }
    // A hiker keeps walking the trail once it is laid.
    if (cnt > 20) {
      const s = frac(t * 0.07) * (cnt - 1), a = path[Math.floor(s)], b = path[Math.min(cnt - 1, Math.floor(s) + 1)], bobY = Math.abs(Math.sin(t * 9)) * -5 * u;
      const dir = b[0] >= a[0] ? 1 : -1, hs = 70 * u;
      ctx.save(); ctx.translate(lerp(a[0], b[0], frac(s)), lerp(a[1], b[1], frac(s)) + bobY - 4 * u); ctx.scale(dir, 1);
      fillPath(ctx, ell(0, 4 * u, hs * 0.3, hs * 0.07), T.ink, 0.35);
      const st = Math.sin(t * 9) * hs * 0.14;
      strokePath(ctx, line([[0, -hs * 0.35], [st, 0]]), T.ink, hs * 0.13); strokePath(ctx, line([[0, -hs * 0.35], [-st, 0]]), T.ink, hs * 0.13);
      fillPath(ctx, rrect(-hs * 0.22, -hs * 0.85, hs * 0.44, hs * 0.55, hs * 0.14), T.teal);
      fillPath(ctx, rrect(-hs * 0.36, -hs * 0.82, hs * 0.2, hs * 0.44, hs * 0.08), T.verm);
      fillPath(ctx, circ(hs * 0.02, -hs * 1.02, hs * 0.17), T.skin[0]);
      fillPath(ctx, (g) => { g.beginPath(); g.arc(hs * 0.02, -hs * 1.04, hs * 0.19, Math.PI, TAU); g.closePath(); }, T.ochre);
      strokePath(ctx, line([[hs * 0.18, -hs * 0.6], [hs * 0.34, -hs * 0.1]]), T.wood, hs * 0.06);
      ctx.restore();
    }
  });

  // ---- compare: two mountains, the number is the height --------------------------------------------------
  SCENES.compare = wrap("compare", (ctx, E, box, d, L, t) => {
    const { u, T } = E, vals = [Math.max(0, Number(d.leftValue) || 0), Math.max(0, Number(d.rightValue) || 0)], labels = [d.left, d.right], max = Math.max(...vals, 1e-6);
    const gy = box.y + box.h - (E.tall ? 150 : 124) * u, fs0 = 110 * u;
    const maxH = gy - (box.y - 14 * u + fs0 * 1.35 + 64 * u);
    ledge(ctx, E, box.x - 60 * u, box.x + box.w + 60 * u, gy, 134 * u, mix(T.wood, T.sage, 0.3), mix(T.wood, T.ink, 0.6), 250, lp(L, 0, 0.5));
    // Pines stand along the ledge.
    for (let q = 0; q < 6; q++) {
      const px = box.x + box.w * [0.03, 0.47, 0.52, 0.97, 0.12, 0.88][q], hh = (90 + hash(q, 330) * 60) * u * lp(L, 0.1 + q * 0.06, 0.5);
      if (hh > 4) pine(ctx, px, gy + 4 * u, hh * (q > 3 ? 0.8 : 1), q % 2 ? T.pine : T.deep);
    }
    const marks = [];
    for (let i = 0; i < 2; i++) {
      const cx = box.x + box.w * (i ? 0.74 : 0.26), hot = i === 1, v = vals[i];
      const hgt = Math.max(maxH * 0.2, maxH * (v / max)), prog = lp(L, 0.1 + i * 0.28, 1.0), cur = hgt * prog;
      const bwid = Math.min(box.w * 0.46, Math.max(380 * u, hgt * 1.8)), top = gy - cur;
      marks.push({ cx, top, bwid, cur, prog });
      const col = hot ? mix(T.verm, T.rose, 0.12) : mix(T.teal, T.far, 0.45);
      if (hot && prog > 0.2) burst(ctx, E, cx, top - 10 * u, (hgt * 0.9 + 140 * u) * prog, t, T.ochre, 0.4, 18);
      // Mountain: a jagged slope up to the peak and down.
      const pts = [[cx - bwid / 2, gy]];
      for (let k = 1; k <= 5; k++) pts.push([lerp(cx - bwid / 2, cx - bwid * 0.04, k / 5.5) + (hash(k, 260 + i) - 0.5) * bwid * 0.05, lerp(gy, top, Math.pow(k / 5.5, 0.9)) + (hash(k, 270 + i) - 0.5) * cur * 0.06]);
      pts.push([cx, top]);
      for (let k = 1; k <= 4; k++) pts.push([lerp(cx, cx + bwid / 2, k / 4.5) + (hash(k, 280 + i) - 0.5) * bwid * 0.04, lerp(top, gy, Math.pow(k / 4.5, 1.1)) + (hash(k, 290 + i) - 0.5) * cur * 0.05]);
      pts.push([cx + bwid / 2, gy]);
      if (cur > 6) {
        gshape(ctx, { x: cx - bwid / 2, y: top, w: bwid, h: cur + 2 }, poly(pts), col, { erode: 11 * u, seed: 300 + i, mottle: 1.4, shadow: [10 * u, 12 * u, al(T.ink, 0.3)],
          extra: (g) => {
            g.fillStyle = al(T.ink, 0.22); g.beginPath(); g.moveTo(cx, top - 4); g.lineTo(cx + bwid * 0.52, gy + 4); g.lineTo(cx + bwid * 0.02, gy + 4); g.lineTo(cx - bwid * 0.05, top + cur * 0.5); g.closePath(); g.fill();
            if (cur > 100 * u) { g.fillStyle = T.snow; g.beginPath(); g.moveTo(cx, top - 4); const sn = Math.min(cur * 0.34, 150 * u); const x0 = cx - sn * 0.82, x1 = cx + sn * 0.82; g.lineTo(x1, top + sn * 0.95); for (let z = 0; z <= 6; z++) g.lineTo(lerp(x1, x0, z / 6), top + sn * (z % 2 ? 0.9 : 0.62)); g.closePath(); g.fill(); g.fillStyle = al(T.ink, 0.16); g.beginPath(); g.moveTo(cx, top - 4); g.lineTo(x1, top + sn * 0.95); g.lineTo(cx + sn * 0.1, top + sn * 0.7); g.closePath(); g.fill(); }
          } });
        // A climber works up the slope and starts again.
        if (prog > 0.8) {
          const s = frac(t * 0.11 + i * 0.37), zig = Math.sin(s * 12) * bwid * 0.05, hx = lerp(cx - bwid * 0.3, cx - bwid * 0.04, s) + zig, hy2 = lerp(gy - 8 * u, top + cur * 0.16, Math.pow(s, 0.95)), hsz = 46 * u * (1 - s * 0.35);
          ctx.save(); ctx.translate(hx, hy2); fillPath(ctx, rrect(-hsz * 0.18, -hsz * 0.7, hsz * 0.36, hsz * 0.55, hsz * 0.1), T.ink); fillPath(ctx, circ(0, -hsz * 0.82, hsz * 0.15), T.skin[0]); fillPath(ctx, rrect(-hsz * 0.2, -hsz * 1.0, hsz * 0.4, hsz * 0.1, hsz * 0.04), T.ochre); strokePath(ctx, line([[hsz * 0.24, -hsz * 0.6], [hsz * 0.3, 0]]), T.wood, hsz * 0.06); ctx.restore();
        }
      }
      // Flag with the number.
      const shown = M_format(v * prog, d), fs = fitSize(ctx, shown, fs0, box.w * 0.42, 74 * u), fw = measure(ctx, M_format(v, d), fs) + 40 * u, fh = fs * 1.22, fk = seg(prog, 0.25, 0.8);
      if (fk > 0) {
        const ph = fh + 48 * u;
        strokePath(ctx, line([[cx, top + 6 * u], [cx, top - ph * fk]]), T.ink, 7 * u);
        ctx.save(); ctx.translate(cx, top - ph * fk); ctx.scale(fk, fk);
        const wv = (q) => Math.sin(t * 4 + q * 3.2 + i * 1.7) * 7 * u * q;
        gshape(ctx, { x: 0, y: -10 * u, w: fw + 10 * u, h: fh + 20 * u }, (g) => { g.beginPath(); g.moveTo(0, 0); for (let q = 0; q <= 1.001; q += 0.1) g.lineTo(fw * q, wv(q)); for (let q = 1; q >= -0.001; q -= 0.1) g.lineTo(fw * q, fh + wv(q)); g.closePath(); }, hot ? T.cream : T.card, { erode: 6 * u, seed: 310 + i, mottle: 0.6, shadow: [5 * u, 6 * u, al(T.ink, 0.7)] });
        txt(ctx, shown, fw / 2, fh * 0.54 + wv(0.5), fs, { color: hot ? T.verm : T.cardInk });
        ctx.restore();
      }
      // Birds circle the winner's flag.
      if (hot && prog > 0.7) for (let b = 0; b < 3; b++) { const a = t * 0.9 + b * 2.1, bx = cx + Math.cos(a) * (bwid * 0.42 + b * 20 * u), by = top - fh * 0.9 + Math.sin(a * 1.3) * 60 * u - b * 30 * u, fl = Math.sin(t * 6 + b * 2);
        ctx.save(); ctx.translate(bx, by); ctx.scale(u * 0.9, u * 0.9); ctx.strokeStyle = T.ink; ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-26, -fl * 9 + 3); ctx.quadraticCurveTo(-12, -16 - fl * 10, 0, 0); ctx.quadraticCurveTo(12, -16 - fl * 10, 26, -fl * 9 + 3); ctx.stroke(); ctx.restore(); }
      if (hot && prog > 0.85) for (let s2 = 0; s2 < 3; s2++) sparkle(ctx, cx + (s2 - 1) * bwid * 0.3, top - fh * 1.8 - s2 * 30 * u + Math.sin(t * 2 + s2) * 8 * u, (13 + s2 * 3) * u * (0.6 + 0.4 * Math.sin(t * 3 + s2 * 2)), T.sun, 0.9);
      txt(ctx, labels[i] || "", cx, gy + 84 * u, 50 * u, { color: T.cream, alpha: lp(L, 0.1 + i * 0.1, 0.35) });
    }
    // An arrow arcs from the first mountain to the second.
    const ak = lp(L, 1.0, 0.7);
    if (ak > 0.02 && marks.length === 2) {
      const a = [marks[0].cx + marks[0].bwid * 0.2, marks[0].top + marks[0].cur * 0.3 - 40 * u], b = [marks[1].cx - marks[1].bwid * 0.42, marks[1].top + marks[1].cur * 0.2 - 30 * u];
      const cpx = (a[0] + b[0]) / 2, cpy = Math.min(a[1], b[1]) - 130 * u, pts = [];
      for (let k = 0; k <= 30; k++) { const q = (k / 30) * ak; pts.push([(1 - q) * (1 - q) * a[0] + 2 * (1 - q) * q * cpx + q * q * b[0], (1 - q) * (1 - q) * a[1] + 2 * (1 - q) * q * cpy + q * q * b[1]]); }
      brushLine(ctx, pts, 14 * u, T.cream, 0.95);
      if (ak > 0.95) { const e = pts[pts.length - 1], p0 = pts[pts.length - 3], an = Math.atan2(e[1] - p0[1], e[0] - p0[0]); ctx.save(); ctx.translate(e[0], e[1]); ctx.rotate(an); fillPath(ctx, poly([[0, 0], [-34 * u, -20 * u], [-34 * u, 20 * u]]), T.cream); ctx.restore(); }
      const f = frac(t * 0.6); if (ak > 0.95) sparkle(ctx, ...(() => { const q = f; return [(1 - q) * (1 - q) * a[0] + 2 * (1 - q) * q * cpx + q * q * b[0], (1 - q) * (1 - q) * a[1] + 2 * (1 - q) * q * cpy + q * q * b[1]]; })(), 14 * u, T.sun, 0.9);
    }
  });

  // ---- the look ----------------------------------------------------------------------------------------------
  // The paper tooth: fine speckle and long dry streaks, laid once per canvas and tone.
  function speckleTile(tone) {
    const c = document.createElement("canvas");
    c.width = c.height = 192;
    const g = c.getContext("2d"), img = g.createImageData(192, 192), r = rng(5);
    const dark = tone.id === "dark";
    for (let i = 0; i < 192 * 192; i++) {
      const v = r(), o = i * 4;
      if (v < 0.5) { img.data[o] = 16; img.data[o + 1] = 28; img.data[o + 2] = 40; img.data[o + 3] = Math.round(v * 2 * 34); }
      else { img.data[o] = 255; img.data[o + 1] = 246; img.data[o + 2] = 224; img.data[o + 3] = Math.round((v - 0.5) * 2 * (dark ? 22 : 46)); }
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  const mkTone = (T) => T;
  const AIRY = { ...mapHex(LIGHT, (h) => mix(h, "#fff6e0", 0.22)), id: "light", ink: LIGHT.ink, band: LIGHT.band, onBand: LIGHT.onBand, cardInk: LIGHT.cardInk, ink2: LIGHT.ink, ochre: "#f0bb55", verm: "#df5f3b", fore: "#2a4455", head: "#3a6678", pine: "#2c6b6f", wood: "#b07d52", skin: LIGHT.skin };
  const palette = (T) => ({ tone: T, bg: T.paper, ink: T.ink, muted: mix(T.ink, T.paper, 0.4), accent: T.verm, onAccent: T.cream, panel: T.card, rule: al(T.ink, 0.45), track: al(T.ink, 0.14), panelEdge: al(T.ink, 0.5) });

  return {
    ...palette(LIGHT),
    display: LAB, displayWeight: 800, displayTracking: "0.012em", displayStyle: "normal", displayCase: "uppercase",
    body: LAB, bodyWeight: 700, figures: LAB, radius: 10,
    motion: "wipe", change: "fade",
    kit: { line: 3, fill: "solid", panel: "fill" },
    keepArt: true,
    // Headlines set straight on this look's backdrop, where its ink and accent (meant for panels) do not read.
    displayAccent: { light: "#9c4329" },
    palettes: { light: palette(AIRY), dark: palette(DARK), mono: palette(MONO) },
    textShadow: () => "none",
    backdrop: (accent, texture, look) => look.bg,
    css: (accent, look) => {
      const T = look.tone;
      return `#art ~ .scene .display { color: ${T.onBand} !important; text-shadow: none !important; letter-spacing: 0.014em; text-wrap: balance; }
        #art ~ .scene .kicker { color: ${T.ochre} !important; text-shadow: none !important; font-weight: 800; letter-spacing: 0.16em; }
        #title-scene, #closing-scene { align-items: center; text-align: center; }
        #title-scene .display, #closing-scene .display { width: 100%; }`;
    },
    paintOver: true,
    paint(ctx, W, H, t, accent, look) {
      const key = `${W}x${H}:${look.tone.id}:${look.texture ?? 1}`;
      if (ctx.canvas.__gc === key) return;
      ctx.canvas.__gc = key;
      ctx.clearRect(0, 0, W, H);
      const u = Math.min(W, H) / 1080, r = rng(19);
      ctx.save(); ctx.scale(1.3 * u, 1.3 * u); ctx.fillStyle = ctx.createPattern(speckleTile(look.tone), "repeat"); ctx.fillRect(0, 0, W / (1.3 * u) + 4, H / (1.3 * u) + 4); ctx.restore();
      // Long dry-brush streaks across the whole sheet, in light and dark.
      for (let i = 0; i < 1100; i++) {
        const x = r() * W, y = r() * H, len = (80 + r() * 380) * u, th = (1 + r() * 2.2) * u, a = 0.03 + r() * 0.06;
        ctx.fillStyle = r() < 0.5 ? `rgba(255,246,224,${a})` : `rgba(14,28,40,${a * 0.9})`;
        ctx.fillRect(x, y, len, th);
      }
      // The sheet's edge: a faint darkening where the painting meets the board.
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
      v.addColorStop(0, "rgba(20,30,40,0)"); v.addColorStop(1, "rgba(20,30,40,0.16)");
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    },
    stage,
    scenes: { chart: SCENES.chart, object: SCENES.object, people: SCENES.people, process: SCENES.process, compare: SCENES.compare },
  };
});
