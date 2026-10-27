// Silkscreen: a poster shop pulling a grid-portrait edition. Every scene is a full-bleed flat ink
// field (pink, sunflower, cyan, tangerine, violet) pulled through its own screen, with a drifting grid
// of the same original character, "Dot", repeated in other colourways underneath. Each colour is its
// own plate: knocked out of the stock, printed a few pixels out of register, overprinted by multiplying
// (so cyan over yellow makes green). Cream label plates sit on offset shadow plates. Colourways flip
// tile by tile behind a squeegee, and a squeegee carries each scene change across the sheet, dragging
// an ink band and streaks. Frames are pure functions of time; the only noise is seeded.
window.DreamcutMotion.register("silkscreen", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const mod = (n, m) => ((n % m) + m) % m;
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const DISPLAY = "'Avenir Next Condensed', 'Futura Condensed', 'Arial Narrow', Impact, 'Arial Black', sans-serif";
  const LABEL = "'Avenir Next Condensed', 'Arial Narrow', 'Roboto Condensed', Arial, sans-serif";
  const fmt = (v, target, d) => {
    const dec = Math.abs((Number(target) || 0) % 1) > 0.001 ? 1 : 0;
    return window.DreamcutMotion.formatNumber(v, dec, (d && d.prefix) || "", (d && d.suffix) || "");
  };
  const stagger = (p, i, n, spread = 0.55) => eo((p - (i / Math.max(1, n)) * spread) / (1 - spread));

  // ---- plates --------------------------------------------------------------------------------------
  const INKS = { paper: "#f1e9d6", c: "#12b4e0", m: "#f0287a", y: "#ffd51a", o: "#ff7a1a", v: "#7a3fd1", k: "#1c1a2e", cream: "#f8f1de", onCream: "#1c1a2e", blend: "multiply" };
  const OFFS = { c: [-1.0, 0.7], m: [1.1, -0.6], y: [0.3, 1.1], o: [-0.7, -0.9], v: [0.9, 0.8], k: [0.6, 0.5] };
  const KEYS = ["c", "m", "y", "o", "v", "k"];
  // Scene grounds: each scene is its own full-bleed ink.
  const GROUND = { title: "m", chart: "y", object: "c", people: "o", process: "v", compare: "m", closing: "y" };
  const SECOND = { title: "y", chart: "m", object: "y", people: "m", process: "y", compare: "c", closing: "m" };

  function frame(S, info) {
    const inks = S.look.inks || INKS, tex = S.look.texture ?? 1, t = info.t, u = S.u;
    const reg = 0.35 + 0.65 * tex, step = Math.floor(t * 6), offs = {};
    for (const k of KEYS) {
      const [a, b] = OFFS[k];
      const amt = (4.2 + 2.2 * Math.sin(t * 0.9 + a * 3) + (hash(step * 7 + k.charCodeAt(0)) - 0.5) * 1.3) * u * reg;
      offs[k] = [a * amt, b * amt];
    }
    return { S, u, W: S.W, H: S.H, tall: S.tall, t, info, tex, offs, m: null,
      ink: { c: inks.c, m: S.accent, y: inks.y, o: inks.o, v: inks.v, k: inks.k }, paper: inks.paper, cream: inks.cream, onCream: inks.onCream,
      blend: inks.blend || "multiply", dark: inks.blend === "screen" };
  }
  const blendOf = (F, k) => (F.dark && k === "k" ? "source-over" : F.blend);
  function fillP(g, F, k, path, a = 1, still = false) {
    g.save();
    if (!still) { const o = F.offs[k]; g.translate(o[0], o[1]); }
    if (F.m) g.transform(F.m[0], F.m[1], F.m[2], F.m[3], F.m[4], F.m[5]);
    g.globalCompositeOperation = blendOf(F, k); g.globalAlpha *= a; g.fillStyle = F.ink[k]; g.fill(path);
    g.restore();
  }
  function strokeP(g, F, k, path, w, a = 1) {
    g.save();
    const o = F.offs[k]; g.translate(o[0], o[1]);
    if (F.m) g.transform(F.m[0], F.m[1], F.m[2], F.m[3], F.m[4], F.m[5]);
    g.globalCompositeOperation = blendOf(F, k); g.globalAlpha *= a; g.strokeStyle = F.ink[k]; g.lineWidth = w; g.lineCap = "round"; g.lineJoin = "round";
    g.stroke(path);
    g.restore();
  }
  // A colour is knocked out of the stock first, so overprint stays clean except where the plates drift.
  function knock(g, F, path) {
    g.save();
    if (F.m) g.transform(F.m[0], F.m[1], F.m[2], F.m[3], F.m[4], F.m[5]);
    g.fillStyle = F.paper; g.fill(path);
    g.restore();
  }
  function part(g, F, path, spec) { knock(g, F, path); fillP(g, F, spec[0], path, spec[1]); }
  function flat(g, color, path, a = 1) { g.save(); g.globalAlpha *= a; g.fillStyle = color; g.fill(path); g.restore(); }

  const rrP = (x, y, w, h, r) => { const p = new Path2D(); w = Math.max(1e-4, w); h = Math.max(1e-4, h); p.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2))); return p; };
  const rectP = (x, y, w, h) => { const p = new Path2D(); p.rect(x, y, Math.max(1e-4, w), Math.max(1e-4, h)); return p; };
  const circP = (x, y, r) => { const p = new Path2D(); p.arc(x, y, Math.max(1e-4, r), 0, TAU); return p; };
  const polyP = (pts, close = true) => { const p = new Path2D(); pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); if (close) p.closePath(); return p; };
  function starP(cx, cy, ro, ri, n, rot = 0) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) { const a = rot + (i * Math.PI) / n - Math.PI / 2, r = i % 2 ? ri : ro; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    return polyP(pts);
  }

  function txt(g, F, str, x, y, size, o = {}) {
    g.save();
    const fam = o.font === "fig" ? DISPLAY : LABEL;
    let s = o.raw ? String(str) : String(str).toUpperCase(), px = size;
    g.font = `${o.weight || 800} ${px}px ${fam}`;
    g.textAlign = o.align || "left"; g.textBaseline = o.base || "alphabetic";
    if (o.maxW) { const w = g.measureText(s).width; if (w > o.maxW) { px = size * (o.maxW / w); g.font = `${o.weight || 800} ${px}px ${fam}`; } }
    if (o.rot) { g.translate(x, y); g.rotate(o.rot); x = 0; y = 0; }
    if (o.shadow) { g.fillStyle = o.shadow; g.fillText(s, x + 3.5 * F.u, y + 4 * F.u); }
    g.fillStyle = o.color || F.onCream; g.fillText(s, x, y);
    g.restore();
    return px;
  }
  function measure(g, F, str, size, font) {
    g.save(); g.font = `800 ${size}px ${font === "fig" ? DISPLAY : LABEL}`;
    const w = g.measureText(String(str).toUpperCase()).width; g.restore(); return w;
  }
  // A cream label plate on an offset shadow plate, with its text.
  function plate(g, F, x, y, w, h, o = {}) {
    const u = F.u, sh = o.shadow || "k", r = (o.r ?? 6) * u;
    g.save();
    if (o.rot) { g.translate(x + w / 2, y + h / 2); g.rotate(o.rot); g.translate(-(x + w / 2), -(y + h / 2)); }
    g.save(); g.translate(9 * u, 9 * u); fillP(g, F, sh, rrP(x, y, w, h, r), o.shadowA ?? 1); g.restore();
    const body = rrP(x, y, w, h, r);
    flat(g, o.fill || F.cream, body);
    if (o.tint) fillP(g, F, o.tint, body, o.tintA ?? 0.35);
    strokeP(g, F, "k", rrP(x, y, w, h, r), (o.line ?? 4) * u);
    g.restore();
  }
  function pill(g, F, str, x, y, size, o = {}) {
    const u = F.u, px = size * u, pad = px * 0.5;
    let w = measure(g, F, str, px) + pad * 2;
    if (o.maxW && w > o.maxW) w = o.maxW;
    const h = px * 1.36, X = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x, Y = y - h / 2;
    plate(g, F, X, Y, w, h, o);
    g.save();
    if (o.rot) { g.translate(X + w / 2, Y + h / 2); g.rotate(o.rot); g.translate(-(X + w / 2), -(Y + h / 2)); }
    txt(g, F, str, X + w / 2, Y + h / 2 + px * 0.03, px, { align: "center", base: "middle", maxW: w - pad * 1.2, color: o.color });
    g.restore();
    return { x: X, y: Y, w, h };
  }

  // ---- texture tiles -------------------------------------------------------------------------------
  let HELP = null;
  const helper = () => HELP || (HELP = document.createElement("canvas").getContext("2d"));
  const SPECK = {};
  function speckPat(color) {
    if (SPECK[color]) return SPECK[color];
    const r = rng(41), c = document.createElement("canvas");
    c.width = c.height = 400;
    const g = c.getContext("2d");
    g.fillStyle = color;
    for (let i = 0; i < 700; i++) { g.globalAlpha = 0.3 + r() * 0.5; g.beginPath(); g.arc(r() * 400, r() * 400, 0.4 + r() * 1.7, 0, TAU); g.fill(); }
    // Gummy clumps where the squeegee skipped.
    for (let i = 0; i < 26; i++) { g.globalAlpha = 0.5; const x = r() * 400, y = r() * 400; for (let k = 0; k < 14; k++) { g.beginPath(); g.arc(x + (r() - 0.5) * 22, y + (r() - 0.5) * 22, 0.6 + r() * 2.2, 0, TAU); g.fill(); } }
    g.globalAlpha = 0.16;
    for (let i = 0; i < 22; i++) g.fillRect(r() * 100, r() * 400, 120 + r() * 280, 0.6 + r() * 1.8);
    return (SPECK[color] = helper().createPattern(c, "repeat"));
  }
  let MESH = null;
  function meshPat() {
    if (MESH) return MESH;
    const c = document.createElement("canvas");
    c.width = c.height = 7;
    const g = c.getContext("2d");
    g.strokeStyle = "rgba(0,0,0,0.5)"; g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(0, 7); g.lineTo(7, 0); g.moveTo(-3.5, 3.5); g.lineTo(3.5, -3.5); g.moveTo(3.5, 10.5); g.lineTo(10.5, 3.5); g.stroke();
    g.beginPath(); g.moveTo(0, 0); g.lineTo(7, 7); g.moveTo(-3.5, 3.5); g.lineTo(3.5, 10.5); g.moveTo(3.5, -3.5); g.lineTo(10.5, 3.5); g.stroke();
    return (MESH = helper().createPattern(c, "repeat"));
  }

  // ---- motifs behind characters --------------------------------------------------------------------
  function motif(g, F, x, y, w, h, spec, t, seed) {
    if (!spec || !spec[0]) return;
    const [type, key, a] = spec, u = F.u, path = new Path2D(), dir = seed % 2 ? 1 : -1;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    if (type === "rays") {
      const cx = x + w / 2, cy = y + h * 0.58, R = Math.hypot(w, h), n = 14, a0 = t * 0.22 * dir + seed;
      for (let i = 0; i < n; i++) { const a1 = a0 + (i * TAU) / n, a2 = a1 + TAU / n / 2; path.moveTo(cx, cy); path.lineTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R); path.lineTo(cx + Math.cos(a2) * R, cy + Math.sin(a2) * R); path.closePath(); }
    } else if (type === "stripes") {
      const step = 34 * u, off = ((t * 18 * u * dir) % step + step) % step;
      for (let X = x - h - step; X < x + w + step; X += step) { const sx = X + off; path.moveTo(sx, y + h); path.lineTo(sx + h, y); path.lineTo(sx + h + step * 0.45, y); path.lineTo(sx + step * 0.45, y + h); path.closePath(); }
    } else if (type === "dots") {
      const step = 30 * u, ox = ((t * 10 * u * dir) % step + step) % step;
      for (let X = x - step; X < x + w + step; X += step) for (let Y = y - step; Y < y + h + step; Y += step) { const px = X + ox + (Math.round((Y - y) / step) % 2 ? step / 2 : 0), py = Y + ox * 0.5; path.moveTo(px + 8.5 * u, py); path.arc(px, py, 8.5 * u, 0, TAU); }
    } else if (type === "rings") {
      const cx = x + w / 2, cy = y + h * 0.55, step = 38 * u, ph = (t * 20 * u * dir) % step;
      for (let r = step + ph; r < Math.hypot(w, h); r += step) { path.moveTo(cx + r, cy); path.arc(cx, cy, r, 0, TAU); }
      g.lineWidth = 12 * u; g.strokeStyle = F.ink[key]; g.globalCompositeOperation = blendOf(F, key); g.globalAlpha *= a; g.stroke(path);
      g.restore(); return;
    }
    g.translate(F.offs[key][0], F.offs[key][1]); g.globalCompositeOperation = blendOf(F, key); g.globalAlpha *= a; g.fillStyle = F.ink[key]; g.fill(path);
    g.restore();
  }

  // ---- Dot, the character ---------------------------------------------------------------------------
  // Colourways: [key, alpha] per plate. bg, motif, skin, hair, shirt, lens, cup.
  const CW = [
    { bg: ["y", 1], motif: ["rays", "o", 0.55], skin: ["o", 0.42], hair: ["k", 1], shirt: ["m", 1], lens: ["c", 1], cup: ["v", 1] },
    { bg: ["c", 1], motif: ["rays", "y", 0.7], skin: ["y", 0.95], hair: ["m", 1], shirt: ["v", 1], lens: ["k", 0.9], cup: ["o", 1] },
    { bg: ["m", 1], motif: ["dots", "y", 0.8], skin: ["y", 0.55], hair: ["k", 1], shirt: ["c", 1], lens: ["y", 1], cup: ["c", 1] },
    { bg: ["o", 1], motif: ["stripes", "y", 0.8], skin: ["m", 0.38], hair: ["v", 1], shirt: ["k", 0.88], lens: ["c", 1], cup: ["m", 1] },
    { bg: ["v", 1], motif: ["rings", "m", 0.8], skin: ["y", 0.9], hair: ["c", 1], shirt: ["m", 1], lens: ["o", 1], cup: ["y", 1] },
    { bg: ["y", 0.45], motif: ["stripes", "c", 0.7], skin: ["c", 0.4], hair: ["k", 1], shirt: ["o", 1], lens: ["m", 1], cup: ["v", 1] },
    { bg: ["c", 0.6], motif: ["dots", "m", 0.9], skin: ["o", 0.55], hair: ["y", 1], shirt: ["y", 1], lens: ["k", 0.9], cup: ["m", 1] },
    { bg: ["m", 0.7], motif: ["rays", "c", 0.6], skin: ["y", 0.7], hair: ["v", 1], shirt: ["y", 1], lens: ["k", 0.85], cup: ["o", 1] },
  ];
  let U = null;
  function units() {
    if (U) return U;
    const hair = polyP([[-0.32, 0.04], [-0.36, -0.2], [-0.27, -0.42], [-0.1, -0.5], [0.08, -0.5], [0.26, -0.42], [0.36, -0.2], [0.32, 0.04], [0.27, -0.12], [0.17, -0.2], [0.07, -0.13], [-0.04, -0.22], [-0.15, -0.14], [-0.26, -0.2], [-0.3, -0.06]]);
    const head = new Path2D(); head.ellipse(0, 0, 0.3, 0.36, 0, 0, TAU);
    const band = new Path2D(); band.moveTo(-0.33, -0.02); band.bezierCurveTo(-0.36, -0.64, 0.36, -0.64, 0.33, -0.02);
    const boom = new Path2D(); boom.moveTo(-0.34, 0.15); boom.bezierCurveTo(-0.34, 0.31, -0.22, 0.35, -0.12, 0.27);
    const shirt = new Path2D(); shirt.moveTo(-0.72, 1.1); shirt.lineTo(-0.72, 0.72); shirt.bezierCurveTo(-0.68, 0.53, -0.4, 0.47, -0.15, 0.42); shirt.lineTo(0.15, 0.42); shirt.bezierCurveTo(0.4, 0.47, 0.68, 0.53, 0.72, 0.72); shirt.lineTo(0.72, 1.1); shirt.closePath();
    const collar = new Path2D(); collar.moveTo(-0.15, 0.42); collar.lineTo(0, 0.6); collar.lineTo(0.15, 0.42);
    const brow = new Path2D(); brow.moveTo(-0.27, -0.1); brow.lineTo(-0.05, -0.1); brow.moveTo(0.05, -0.1); brow.lineTo(0.27, -0.1);
    const bridge = new Path2D(); bridge.moveTo(-0.04, 0.0); bridge.quadraticCurveTo(0, -0.04, 0.04, 0.0);
    const nose = new Path2D(); nose.moveTo(0, 0.1); nose.lineTo(-0.02, 0.15); nose.lineTo(0.02, 0.15);
    U = { hair, head, band, boom, shirt, collar, brow, bridge, nose, neck: rrP(-0.11, 0.2, 0.22, 0.26, 0.04), earL: circP(-0.3, 0.03, 0.075), earR: circP(0.3, 0.03, 0.075),
      lensL: rrP(-0.275, -0.075, 0.235, 0.16, 0.05), lensR: rrP(0.04, -0.075, 0.235, 0.16, 0.05), cheekL: circP(-0.2, 0.17, 0.055), cheekR: circP(0.2, 0.17, 0.055),
      cupL: rrP(-0.41, -0.05, 0.105, 0.21, 0.045), cupR: rrP(0.305, -0.05, 0.105, 0.21, 0.045), tag: starP(0.33, 0.74, 0.1, 0.045, 5) };
    return U;
  }
  // o: mood -1..1, talk 0..1, seed, t. Draws centred on (cx, cy) with head height ~0.72 * s.
  function portrait(g, F, cx, cy, s, cw, o = {}) {
    const P = units(), t = F.t, seed = o.seed || 0, mood = o.mood ?? 0.6;
    F.m = [s, 0, 0, s, cx, cy];
    part(g, F, P.shirt, cw.shirt);
    part(g, F, P.neck, cw.skin);
    part(g, F, P.earL, cw.skin); part(g, F, P.earR, cw.skin);
    part(g, F, P.head, cw.skin);
    fillP(g, F, "m", P.cheekL, cw.skin[0] === "m" ? 0 : 0.6); fillP(g, F, "m", P.cheekR, cw.skin[0] === "m" ? 0 : 0.6);
    part(g, F, P.hair, cw.hair);
    // Tuft: three spikes that flutter.
    const w = Math.sin(t * 2.3 + seed) * 0.03, tuft = polyP([[-0.1, -0.46], [-0.13 + w, -0.66], [-0.02, -0.5], [0.03 + w, -0.72], [0.08, -0.5], [0.16 + w, -0.63], [0.14, -0.45]]);
    part(g, F, tuft, cw.hair);
    // Lenses knocked out of the face.
    part(g, F, P.lensL, cw.lens); part(g, F, P.lensR, cw.lens);
    const blinkPhase = mod(t + seed * 1.7, 3.1), blink = blinkPhase < 0.2 ? Math.sin((blinkPhase / 0.2) * Math.PI) : 0;
    const gaze = Math.sin(t * 0.9 + seed * 2.1) * 0.035;
    for (const ex of [-0.1575, 0.1575]) {
      const eye = new Path2D(); eye.ellipse(ex + gaze, 0.005, 0.029, Math.max(0.004, 0.034 * (1 - blink)), 0, 0, TAU);
      fillP(g, F, "k", eye, 1);
    }
    // Headset over the hair.
    part(g, F, P.cupL, cw.cup); part(g, F, P.cupR, cw.cup);
    strokeP(g, F, "k", P.band, 0.03);
    strokeP(g, F, "k", P.boom, 0.022);
    fillP(g, F, "m", circP(-0.12, 0.27, 0.036), 1);
    // Face line work.
    strokeP(g, F, "k", P.head, 0.016);
    strokeP(g, F, "k", P.shirt, 0.018); strokeP(g, F, "k", P.collar, 0.018);
    strokeP(g, F, "k", P.lensL, 0.02); strokeP(g, F, "k", P.lensR, 0.02); strokeP(g, F, "k", P.bridge, 0.02);
    strokeP(g, F, "k", P.cupL, 0.014); strokeP(g, F, "k", P.cupR, 0.014);
    strokeP(g, F, "k", P.nose, 0.014);
    // Brows lift with the mood and with talking.
    const lift = (o.talk ? Math.sin(t * 6 + seed) * 0.012 : 0) - mood * 0.01;
    const brow = new Path2D(); brow.moveTo(-0.27, -0.12 + lift); brow.lineTo(-0.05, -0.12 - lift * 1.4); brow.moveTo(0.05, -0.12 - lift * 1.4); brow.lineTo(0.27, -0.12 + lift);
    strokeP(g, F, "k", brow, 0.02);
    // Mouth: a smile or frown, opening when Dot talks.
    const open = o.talk ? (0.5 + 0.5 * Math.sin(t * 10 + seed * 3)) * o.talk : 0, bend = clamp(mood, -1, 1) * 0.1;
    const mouth = new Path2D();
    if (open > 0.08) {
      const my = 0.235 + bend * 0.4, mh = 0.018 + open * 0.06, mw = 0.075 - open * 0.012;
      mouth.ellipse(0, my + mh * 0.4, mw, mh, 0, 0, TAU);
      fillP(g, F, "k", mouth, 1);
      const tg = new Path2D(); tg.ellipse(0, my + mh * 0.4 + mh * 0.45, mw * 0.55, mh * 0.5, 0, 0, TAU); fillP(g, F, "m", tg, 1);
    } else {
      mouth.moveTo(-0.1, 0.225); mouth.quadraticCurveTo(0, 0.225 + bend * 2, 0.1, 0.225);
      strokeP(g, F, "k", mouth, 0.024);
    }
    // Star tag on the collar.
    part(g, F, P.tag, ["y", 1]); strokeP(g, F, "k", P.tag, 0.014);
    F.m = null;
  }

  // ---- tiles: a framed portrait whose colourway flips behind a squeegee ----------------------------
  function body(g, F, x, y, w, h, cw, idx, o) {
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    const bg = rectP(x, y, w, h);
    knock(g, F, bg); fillP(g, F, cw.bg[0], bg, cw.bg[1]);
    motif(g, F, x, y, w, h, cw.motif, F.t, idx + (o.seed || 0));
    const s = Math.min(h * 0.55, w * 0.7);
    portrait(g, F, x + w / 2 + Math.sin(F.t * 1.3 + idx) * w * 0.012, y + 0.445 * h + Math.sin(F.t * 2.1 + idx * 1.7) * h * 0.01, s, cw, { mood: o.mood, talk: o.talk, seed: idx * 1.37 + (o.seed || 0) });
    g.restore();
  }
  function tile(g, F, x, y, w, h, idx, o = {}) {
    const u = F.u, per = o.period || 2.8, tt = F.t / per + (o.phase || 0) + idx * 0.37, k = Math.floor(tt), fr = tt - k, f = o.fixed !== undefined ? 1 : clamp(fr / 0.17);
    const pick = (n) => (o.fixed !== undefined ? CW[o.fixed % CW.length] : CW[mod(idx * 3 + n + (o.shift || 0), CW.length)]);
    g.save();
    if (o.alpha !== undefined) g.globalAlpha *= o.alpha;
    if (o.shadow !== false) { g.save(); g.translate(10 * u, 10 * u); fillP(g, F, o.shadow || "k", rectP(x, y, w, h), 0.92); g.restore(); }
    if (f < 1) {
      const front = x + w * eio(f);
      g.save(); g.beginPath(); g.rect(front, y, x + w - front, h); g.clip(); body(g, F, x, y, w, h, pick(k - 1), idx, o); g.restore();
      g.save(); g.beginPath(); g.rect(x, y, front - x, h); g.clip(); body(g, F, x, y, w, h, pick(k), idx, o); g.restore();
      g.fillStyle = F.cream; g.fillRect(front - 7 * u, y, 14 * u, h);
      g.fillStyle = F.ink.k; g.fillRect(front - 2 * u, y, 4 * u, h);
    } else body(g, F, x, y, w, h, pick(k), idx, o);
    strokeP(g, F, "k", rectP(x, y, w, h), (o.line || 6) * u);
    g.restore();
  }
  // A reveal that runs left to right with a ragged, streaky front.
  function streakClip(g, F, x, y, w, h, q, seed) {
    const p = new Path2D(), rows = Math.max(1, Math.ceil(h / (15 * F.u))), rh = h / rows;
    for (let r = 0; r < rows; r++) { const edge = clamp(q * 1.22 - 0.22 * hash(seed + r * 3.1)); if (edge > 0) p.rect(x - 2, y + r * rh, w * edge + 2, rh + 0.6); }
    g.clip(p);
  }

  // ---- layout helpers ------------------------------------------------------------------------------
  const lineCache = {};
  function headLines(id) {
    if (lineCache[id]) return lineCache[id];
    const el = document.getElementById(id), root = document.getElementById("root");
    if (!el || !root || !el.firstChild) return (lineCache[id] = []);
    let ox = 0, oy = 0;
    for (let n = el; n && n !== root; n = n.offsetParent) { ox += n.offsetLeft; oy += n.offsetTop; }
    const scale = root.getBoundingClientRect().width / (Number(root.dataset.width) || 1920) || 1;
    const er = el.getBoundingClientRect(), range = document.createRange();
    range.selectNodeContents(el);
    const out = [];
    for (const r of range.getClientRects()) {
      const ln = { x: ox + (r.left - er.left) / scale, y: oy + (r.top - er.top) / scale, w: r.width / scale, h: r.height / scale };
      if (ln.w > 1 && !out.some((o) => Math.abs(o.y - ln.y) < 2)) out.push(ln);
    }
    return (lineCache[id] = out);
  }
  function headRect(F, id) {
    const lines = headLines(id);
    if (!lines.length) return null;
    const pad = 22 * F.u, x0 = Math.min(...lines.map((l) => l.x)), x1 = Math.max(...lines.map((l) => l.x + l.w)), y0 = Math.min(...lines.map((l) => l.y)), y1 = Math.max(...lines.map((l) => l.y + l.h));
    return { x: x0 - pad, y: y0 - pad * 0.55, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 1.1 };
  }
  function area(F, id, box) {
    const r = headRect(F, `${id}-title`);
    const top = r ? clamp(r.y + r.h + (F.tall ? 50 : 38) * F.u, F.H * 0.2, box.y + 40 * F.u) : box.y;
    const bottom = F.H - (F.tall ? 120 : 84) * F.u;
    return { x: box.x, y: top, w: box.w, h: bottom - top };
  }
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  let planCache = null;
  function controls() {
    if (window.__dreamcut && window.__dreamcut.controls) return window.__dreamcut.controls;
    try { if (typeof dc !== "undefined" && dc && dc.controls) return dc.controls; } catch (e) { /* not on this page */ }
    return null;
  }
  function plan() {
    if (planCache) return planCache;
    const c = controls();
    if (!c) return null;
    let t = 0;
    const shown = [];
    for (const id of ORDER) { const hold = Number(c[`${id}_hold`]) || 0; if (hold > 0) shown.push({ id, start: t, hold }); t += hold; }
    return (planCache = { shown, change: Number(c.change) || 0.45, e: Number(c.entrance) || 0.7 });
  }
  let DOM_READY = false;
  function prepDom(F) {
    if (DOM_READY) return;
    DOM_READY = true;
    const k = document.getElementById("kicker");
    if (k) { k.style.fontSize = 44 * F.u + "px"; k.style.marginBottom = 30 * F.u + "px"; }
  }

  // ---- the world: a full-bleed ink field with a drifting grid of Dot ----------------------------------
  function world(g, F, sceneId) {
    const { W, H, u, t, tall } = F, key = GROUND[sceneId] || "m", key2 = SECOND[sceneId] || "y";
    g.save();
    g.globalCompositeOperation = "source-over"; g.fillStyle = F.paper; g.fillRect(0, 0, W, H);
    fillP(g, F, key, rectP(-30 * u, -30 * u, W + 60 * u, H + 60 * u), 1);
    // A second ink flooding in huge soft shapes, drifting.
    for (let i = 0; i < 3; i++) {
      const cx = W * (0.15 + 0.35 * i) + Math.sin(t * 0.17 + i * 2) * 140 * u, cy = H * (0.2 + 0.3 * i) + Math.cos(t * 0.13 + i) * 100 * u, r = (260 + 90 * i) * u;
      fillP(g, F, key2, circP(cx, cy, r), 0.34);
    }
    // The grid of Dots: a camera drift across an endless contact sheet.
    const ts = (tall ? W * 0.34 : H * 0.34), gap = ts * 0.1, cell = ts + gap, dir = sceneId.length % 2 ? 1 : -1;
    const sx = t * 24 * u * dir, sy = t * 14 * u;
    const c0 = Math.floor(sx / cell) - 1, r0 = Math.floor(sy / cell) - 1;
    for (let cy = r0; cy < r0 + H / cell + 3; cy++) for (let cx = c0; cx < c0 + W / cell + 3; cx++) {
      const x = cx * cell - sx, y = cy * cell - sy, id = cx * 31 + cy * 17 + sceneId.length;
      const pulse = 0.17 + 0.1 * Math.sin(t * 0.9 + cx * 0.8 + cy * 0.6);
      tile(g, F, x, y, ts * 0.82, ts, id, { fixed: mod(id, CW.length), alpha: pulse, shadow: false, line: 3, mood: 0.7, seed: id });
    }
    // Squeegee drags: long streaks of stock showing through the ink.
    const r = rng(77 + sceneId.length * 13);
    g.fillStyle = F.paper;
    for (let i = 0; i < 46; i++) {
      const y = r() * H, len = (160 + r() * 620) * u, x0 = r() * (W + len) - len + ((t * (30 + r() * 60) * u) % (W + len)), th = (0.8 + r() * 2.6) * u;
      g.globalAlpha = 0.1 + r() * 0.2; g.fillRect(((x0 % (W + len)) + (W + len)) % (W + len) - len, y, len, th);
    }
    g.globalAlpha = 1;
    // Registration targets and the colour bar printed in the margin, on every plate.
    const o = 40 * u, s = 17 * u;
    for (const [x, y] of [[o, o], [W - o, o], [o, H - o], [W - o, H - o]]) {
      const cross = new Path2D(); cross.moveTo(x - s * 1.6, y); cross.lineTo(x + s * 1.6, y); cross.moveTo(x, y - s * 1.6); cross.lineTo(x, y + s * 1.6); cross.moveTo(x + s, y); cross.arc(x, y, s, 0, TAU);
      for (const k of ["k", "c", "m"]) strokeP(g, F, k, cross, 2.2 * u, 0.9);
    }
    const by = H - 38 * u, bs = 26 * u;
    ["c", "m", "y", "o", "v", "k"].forEach((k, i) => {
      const x = W * 0.5 - bs * 6 + i * bs * 1.1, wob = 0.75 + 0.25 * Math.sin(t * 3 + i);
      fillP(g, F, k, rectP(x, by - bs / 2, bs, bs), wob);
    });
    for (let i = 0; i < 8; i++) fillP(g, F, "k", rectP(W * 0.5 + bs * 1.4 + i * bs * 0.8, by - bs / 2, bs * 0.7, bs), (i + 1) / 8);
    // Periodic squeegee pass across the whole sheet.
    const per = 4.4, ph = mod(t, per);
    if (ph < 1.5) {
      const q = eio(ph / 1.5), fx = -0.3 * W + (1.6 * W) * q, rr = rng(500 + Math.floor(t / per));
      for (let i = 0; i < 30; i++) {
        const y = rr() * H, len = (120 + rr() * 560) * u, th = (1.2 + rr() * 4) * u;
        g.globalAlpha = 0.25 * (1 - Math.abs(q - 0.5) * 1.2); g.fillStyle = rr() < 0.5 ? F.paper : F.ink.k;
        g.fillRect(fx - len, y, len, th);
      }
      g.globalAlpha = 1;
    }
    g.restore();
  }

  // ---- slabs, sweeps and the squeegee --------------------------------------------------------------
  function slab(g, F, id, local, hold, hasNext, key, delay = 0) {
    const r = headRect(F, id), pl = plan();
    if (!r) return;
    const e = pl ? pl.e : 0.7, ch = pl ? pl.change : 0.45, u = F.u, side = (F.tall ? 90 : 140) * u, ew = F.W - side * 2;
    const q = 1 - Math.pow(1 - clamp((local - delay) / e), 4);
    const out = hasNext ? Math.pow(clamp((local - (hold - ch)) / ch), 2) : 0;
    const left = Math.max(r.x - 20 * u, side + ew * out - 24 * u), right = side + ew * q + 24 * u;
    if (right <= left) return;
    g.save(); g.beginPath(); g.rect(left, r.y - 30 * u, Math.min(right, r.x + r.w + 60 * u) - left, r.h + 80 * u); g.clip();
    g.save(); g.translate(12 * u, 12 * u); fillP(g, F, "k", rectP(r.x, r.y, r.w, r.h), 1); g.restore();
    const b = rectP(r.x, r.y, r.w, r.h);
    flat(g, F.cream, b);
    fillP(g, F, key, rectP(r.x, r.y + r.h * 0.74, r.w, r.h * 0.26), 0.9);
    strokeP(g, F, "k", rectP(r.x, r.y, r.w, r.h), 4.5 * u);
    g.restore();
  }
  const sweepX = (F, q) => -0.08 * F.W + 1.16 * F.W * eio(q);
  function squeegee(g, F, q, key) {
    const { W, H, u } = F, x = sweepX(F, q);
    g.save();
    // Ink dragged ahead of the blade, ragged in streaks.
    const rows = Math.ceil(H / (22 * u));
    for (let r = 0; r < rows; r++) {
      const len = (50 + hash(r * 3.3 + Math.floor(q * 9)) * 190 + Math.sin(F.t * 5 + r) * 18) * u;
      g.fillStyle = F.ink[key]; g.fillRect(x - len, r * 22 * u, len + 2, 22 * u + 1);
    }
    g.fillStyle = F.cream; g.fillRect(x - 5 * u, 0, 10 * u, H);
    g.fillStyle = F.ink.k; g.fillRect(x - 1 * u, 0, 30 * u, H);
    g.fillStyle = F.cream; g.fillRect(x + 11 * u, 0, 3 * u, H);
    g.restore();
  }
  function clipSide(g, F, q, leaving) {
    const x = sweepX(F, q);
    g.beginPath();
    if (leaving) g.rect(x, 0, F.W - x + 2, F.H); else g.rect(-2, 0, x + 2, F.H);
    g.clip();
  }
  function hasNextAt(t) {
    const pl = plan();
    if (!pl) return true;
    const i = pl.shown.findIndex((s) => t >= s.start && t < s.start + s.hold + 0.001);
    return i >= 0 && i < pl.shown.length - 1;
  }

  function run(id, draw) {
    return (ctx, S, box, p, d, info) => {
      const F = frame(S, info), leaving = info.exit !== undefined, A = area(F, id, box), local = info.local;
      const build = leaving ? 1 : 0.4 + 0.6 * eo(local / Math.max(1, info.hold * 0.42));
      let q = null;
      if (leaving) q = info.exit; else if (local < info.change) q = local / info.change;
      ctx.save();
      if (q !== null) clipSide(ctx, F, q, leaving);
      if (leaving) world(ctx, F, id);
      draw(ctx, F, A, build, d, info.t);
      slab(ctx, F, `${id}-title`, local, info.hold, hasNextAt(info.t), SECOND[id]);
      ctx.restore();
      if (q !== null) squeegee(ctx, F, q, SECOND[id]);
    };
  }

  // ---- small drawn things --------------------------------------------------------------------------
  function sparkle(g, F, x, y, r, k, a = 1, rot = 0) {
    fillP(g, F, k, starP(x, y, r, r * 0.3, 4, rot), a);
  }
  function seal(g, F, x, y, r, str, o = {}) {
    const u = F.u, pts = [], n = 16;
    for (let i = 0; i < n * 2; i++) { const a = (i * Math.PI) / n + (o.rot || 0), rr = i % 2 ? r * 0.82 : r; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
    const sh = polyP(pts); g.save(); g.translate(8 * u, 8 * u); fillP(g, F, "k", sh, 1); g.restore();
    flat(g, F.cream, polyP(pts)); fillP(g, F, o.key || "m", polyP(pts), 0.95); strokeP(g, F, "k", polyP(pts), 4 * u);
    txt(g, F, str, x, y + r * 0.04, r * 0.52, { align: "center", base: "middle", maxW: r * 1.5, font: "fig", color: o.color || F.cream, rot: o.tilt, shadow: F.ink.k });
  }
  function arrow(g, F, x0, y, x1, prog, key, nudge = 0) {
    const u = F.u, len = (x1 - x0) * prog, s = 40 * u, xe = x0 + len + nudge;
    if (len < 8 * u) return;
    const shaft = polyP([[x0, y - 13 * u], [Math.max(x0, xe - s * 0.5), y - 13 * u], [Math.max(x0, xe - s * 0.5), y - 30 * u], [xe, y], [Math.max(x0, xe - s * 0.5), y + 30 * u], [Math.max(x0, xe - s * 0.5), y + 13 * u], [x0, y + 13 * u]]);
    g.save(); g.translate(7 * u, 7 * u); fillP(g, F, "k", shaft, 1); g.restore();
    flat(g, F.cream, shaft); fillP(g, F, key, shaft, 1); strokeP(g, F, "k", shaft, 4 * u);
  }

  // ---- title and closing ---------------------------------------------------------------------------
  function freeRegion(F, ids) {
    const { W, H, u, tall } = F, side = (tall ? 90 : 140) * u;
    const rs = ids.map((id) => headRect(F, id)).filter(Boolean);
    if (!rs.length) return { x: W * 0.55, y: H * 0.14, w: W * 0.4, h: H * 0.72 };
    const right = Math.max(...rs.map((r) => r.x + r.w)), top = Math.min(...rs.map((r) => r.y)), bottom = Math.max(...rs.map((r) => r.y + r.h));
    const rw = W - side * 0.4 - right - 50 * u;
    if (!tall && rw > W * 0.28) return { x: right + 50 * u, y: H * 0.1, w: rw, h: H * 0.8 };
    const above = { x: side * 0.6, y: 90 * u, w: W - side * 1.2, h: top - 140 * u }, below = { x: side * 0.6, y: bottom + 54 * u, w: W - side * 1.2, h: H - 110 * u - (bottom + 54 * u) };
    return below.h >= above.h ? below : above;
  }
  // Fit a grid of portrait tiles into a region.
  function gridFor(R, F, maxN = 6) {
    let best = null;
    for (let cols = 1; cols <= 4; cols++) for (let rows = 1; rows <= 3; rows++) {
      if (cols * rows > maxN) continue;
      const gap = 26 * F.u, tw = (R.w - gap * (cols - 1)) / cols, th = (R.h - gap * (rows - 1)) / rows, size = Math.min(tw / 0.82, th);
      const score = size * (1 + 0.04 * cols * rows);
      if (!best || score > best.score) best = { cols, rows, gap, size, score };
    }
    const tw = best.size * 0.82, th = best.size, gw = best.cols * tw + (best.cols - 1) * best.gap, gh = best.rows * th + (best.rows - 1) * best.gap;
    return { ...best, tw, th, x0: R.x + (R.w - gw) / 2, y0: R.y + (R.h - gh) / 2 };
  }
  function statementArt(g, F, id, local, hold, hasNext) {
    const { u, t } = F, R = freeRegion(F, id === "title" ? ["kicker", "title"] : ["closing"]);
    const grid = R.w > 150 * u && R.h > 150 * u ? gridFor(R, F, id === "title" ? 6 : 4) : null;
    if (grid) {
      const n = grid.cols * grid.rows;
      for (let i = 0; i < n; i++) {
        const cx = i % grid.cols, cy = Math.floor(i / grid.cols), q = stagger(local / 1.0, i, n, 0.6) * 0.75 + 0.25 * eo(local / 0.5);
        const x = grid.x0 + cx * (grid.tw + grid.gap), y = grid.y0 + cy * (grid.th + grid.gap) + Math.sin(t * 1.6 + i * 0.9) * 7 * u;
        g.save();
        const mid = id === "closing" && i === 0 ? 1.0 : 1;
        g.translate(x + grid.tw / 2, y + grid.th / 2); g.rotate(Math.sin(t * 1.1 + i * 1.9) * 0.025 * mid); g.translate(-(x + grid.tw / 2), -(y + grid.th / 2));
        g.beginPath(); g.rect(x - 14 * u, y - 14 * u, (grid.tw + 28 * u) * q + 2, grid.th + 40 * u); g.clip();
        tile(g, F, x, y, grid.tw, grid.th, i + (id === "closing" ? 5 : 0), { period: id === "closing" ? 1.8 : 2.6, phase: id === "closing" ? 0 : i * 0.18, talk: i === 0 ? 0.9 : 0, mood: 0.8 });
        g.restore();
      }
      const sx = grid.x0 + grid.cols * (grid.tw + grid.gap) - grid.gap - 20 * u, sy = grid.y0 + 8 * u;
      const sq = back(seg(local, 0.5, 1.1));
      if (sq > 0 && grid.cols * grid.rows > 1) seal(g, F, sx, sy, 78 * u * sq, id === "title" ? "Hi!" : "OK!", { rot: t * 0.5, tilt: Math.sin(t * 1.4) * 0.12, key: id === "title" ? "v" : "m" });
    }
    // Sparkles keep twinkling around the art.
    const r = rng(id === "title" ? 31 : 53);
    for (let i = 0; i < 9; i++) {
      const px = R.x + r() * R.w, py = R.y + r() * R.h, ph = r() * TAU, tw = 0.5 + 0.5 * Math.sin(t * 2.4 + ph);
      sparkle(g, F, px, py, (14 + 20 * tw) * u, ["y", "c", "m", "o"][i % 4], 0.6 * tw + 0.3, t * 0.6 + ph);
    }
    // A checkmark stamps down on the closing grid.
    if (id === "closing" && grid) {
      const k = seg(local, 0.8, 1.5);
      if (k > 0) {
        const cx = grid.x0 + (grid.cols * grid.tw + (grid.cols - 1) * grid.gap) / 2, cy = grid.y0 + (grid.rows * grid.th + (grid.rows - 1) * grid.gap) / 2, s = Math.min(grid.tw, grid.th) * 0.9;
        const chk = new Path2D(); chk.moveTo(cx - s * 0.32, cy); chk.lineTo(cx - s * 0.08, cy + s * 0.26); chk.lineTo(cx + s * 0.38, cy - s * 0.3);
        g.save(); g.translate(cx, cy); g.scale(1 + 0.08 * Math.sin(t * 3), 1 + 0.08 * Math.sin(t * 3)); g.translate(-cx, -cy);
        g.setLineDash([s * 1.6, s * 4]); g.lineDashOffset = -s * 1.6 * (1 - eo(k));
        strokeP(g, F, "k", chk, 38 * u * 0.7 + 18 * u); g.setLineDash([]);
        g.setLineDash([s * 1.6, s * 4]); g.lineDashOffset = -s * 1.6 * (1 - eo(k));
        g.translate(-8 * u, -6 * u); strokeP(g, F, "y", chk, 26 * u * 0.9 + 6 * u);
        g.restore();
      }
    }
  }

  function statement(ctx, F, id, local, hold, hasNext, exitQ) {
    ctx.save();
    if (exitQ !== undefined) { clipSide(ctx, F, exitQ, true); world(ctx, F, id); }
    statementArt(ctx, F, id, exitQ !== undefined ? hold + 0.5 : local, hold, hasNext);
    if (id === "title") {
      // The title's headline sits on its own plate, with the kicker stamped above it.
      slab(ctx, F, "title", exitQ !== undefined ? hold : local, hold, hasNext, "y", 0.12);
    } else slab(ctx, F, "closing", exitQ !== undefined ? hold : local, hold, false, "m");
    ctx.restore();
  }

  // ---- chart ---------------------------------------------------------------------------------------
  function chartScene(g, F, A, b, d, t) {
    const { u, tall } = F, n = d.values.length, max = Math.max(...d.values, 1);
    const base = A.y + A.h - 92 * u, topY = A.y + (tall ? 130 : 120) * u, maxH = base - topY;
    const gap = A.w * 0.05, bw = (A.w - gap * (n + 1)) / n;
    // Gridlines crawl.
    for (let i = 1; i <= 4; i++) {
      const y = base - (maxH * i) / 4, ln = new Path2D(); ln.moveTo(A.x, y); ln.lineTo(A.x + A.w, y);
      g.save(); g.setLineDash([22 * u, 16 * u]); g.lineDashOffset = -t * 40 * u; strokeP(g, F, "k", ln, 3 * u, 0.4); g.restore();
    }
    const ln = new Path2D(); ln.moveTo(A.x - 10 * u, base); ln.lineTo(A.x + A.w + 10 * u, base);
    strokeP(g, F, "k", ln, 9 * u);
    const keys = ["c", "v", "o", "c"];
    d.values.forEach((value, i) => {
      const q = stagger(b, i, n), hot = i === d.highlight, h = Math.max(2, maxH * (value / max) * q * (1 + 0.012 * Math.sin(t * 2.2 + i))), x = A.x + gap + i * (bw + gap), y = base - h;
      const bar = rectP(x, y, bw, h), key = hot ? "m" : keys[i % keys.length];
      g.save(); g.translate(14 * u, 0); fillP(g, F, "k", rectP(x, y + 14 * u, bw, h - 14 * u), 0.92); g.restore();
      knock(g, F, bar); fillP(g, F, key, bar, 1);
      // A second plate crawls up the bar in stripes, overprinting.
      g.save(); g.beginPath(); g.rect(x, y, bw, h); g.clip();
      const step = 36 * u, off = mod(t * 26 * u + i * 9, step), stripes = new Path2D();
      for (let yy = y - bw - step; yy < base + step; yy += step) { stripes.moveTo(x - 4, yy + off + bw * 0.5); stripes.lineTo(x + bw + 4, yy + off); stripes.lineTo(x + bw + 4, yy + off + step * 0.42); stripes.lineTo(x - 4, yy + off + bw * 0.5 + step * 0.42); stripes.closePath(); }
      fillP(g, F, hot ? "y" : "m", stripes, hot ? 0.9 : 0.7);
      if (hot && h > bw * 1.15) tile(g, F, x + bw * 0.08, y + 18 * u, bw * 0.84, Math.min(bw * 0.84 * 1.22, h - 34 * u), 9, { shadow: false, talk: 0.6, period: 2.2, line: 5 });
      g.restore();
      strokeP(g, F, "k", rectP(x, y, bw, h), 6 * u);
      if (q > 0.04) {
        const sz = Math.min(104 * u, bw * 0.5);
        const nw = Math.max(bw * 0.8, measure(g, F, fmt(value, value, d), sz, "fig") + 30 * u), ny = y - sz * 0.78 - 28 * u;
        plate(g, F, x + bw / 2 - nw / 2, ny, nw, sz * 1.18, { shadow: "k", tint: hot ? "m" : null, tintA: 0.3 });
        txt(g, F, fmt(value * q, value, d), x + bw / 2, ny + sz * 0.59, sz, { align: "center", base: "middle", font: "fig", maxW: nw - 16 * u, color: hot ? F.ink.m : F.onCream });
        pill(g, F, d.labels[i] || "", x + bw / 2, base + 52 * u, 44, { align: "center", maxW: bw + gap * 0.8, rot: (i % 2 ? 1 : -1) * 0.02 });
      }
    });
    // Sparkles rise from the highlighted bar.
    const hi = clamp(d.highlight, 0, n - 1), hx = A.x + gap + hi * (bw + gap) + bw / 2, hh = maxH * (d.values[hi] / max);
    for (let i = 0; i < 7; i++) {
      const ph = mod(t * 0.45 + i / 7, 1), px = hx + Math.sin(i * 2.4 + t * 1.5) * bw * 0.6, py = base - hh - 60 * u - ph * 170 * u;
      sparkle(g, F, px, py, (11 + 12 * (1 - ph)) * u, ["y", "c", "o", "m"][i % 4], Math.sin(ph * Math.PI) * 0.95, t + i);
    }
  }

  // ---- object (a laptop or phone with callouts) ------------------------------------------------------
  function objectScene(g, F, A, b, d, t) {
    const { u } = F, phone = d.kind === "phone";
    const stack = F.tall && !phone;
    const w = phone ? Math.min(A.w * 0.3, A.h * 0.46) : stack ? A.w * 0.9 : Math.min(A.w * 0.6, A.h * 1.28), h = phone ? w * 1.95 : w * 0.64;
    const x = A.x + (phone ? A.w * 0.12 : stack ? (A.w - w) / 2 : A.w * 0.03), y = stack ? A.y + 20 * u : A.y + (A.h - h - (phone ? 0 : h * 0.14)) / 2, q = eo(b * 1.3);
    // Rays burst out behind the device.
    g.save(); g.beginPath(); g.rect(A.x - 30 * u, A.y - 10 * u, A.w + 60 * u, A.h + 20 * u); g.clip();
    motif(g, F, x - w * 0.4, y - h * 0.3, w * 1.8, h * 1.7, ["rays", "y", 0.55], t, 3);
    g.restore();
    g.save(); g.globalAlpha *= clamp(q * 2.4);
    g.save(); g.translate(16 * u, 16 * u); fillP(g, F, "k", rrP(x, y, w, h, (phone ? 40 : 18) * u), 1); g.restore();
    const bodyP = rrP(x, y, w, h, (phone ? 40 : 18) * u);
    flat(g, F.cream, bodyP); fillP(g, F, "v", bodyP, 0.85); strokeP(g, F, "k", rrP(x, y, w, h, (phone ? 40 : 18) * u), 6 * u);
    const pad = (phone ? 20 : 24) * u, sx = x + pad, sy = y + pad, sw = w - pad * 2, sh = h - pad * 2;
    const scr = rrP(sx, sy, sw, sh, 8 * u);
    flat(g, F.cream, scr);
    const pv = phone ? { x: sx + sw * 0.08, y: sy + sh * 0.05, w: sw * 0.84, h: sh * 0.42 } : { x: sx + sw * 0.04, y: sy + sh * 0.07, w: sw * 0.4, h: sh * 0.56 };
    tile(g, F, pv.x, pv.y, pv.w, pv.h, 4, { period: 2.0, talk: 0.8, shadow: false, line: 4 });
    // Timeline tracks to the right of (or under) the preview, with a playhead running over them.
    const tx = phone ? sx + sw * 0.06 : pv.x + pv.w + sw * 0.05, tw = phone ? sw * 0.88 : sx + sw - tx - sw * 0.04, ty = phone ? pv.y + pv.h + sh * 0.05 : sy + sh * 0.09, th = phone ? sh * 0.24 : sh * 0.5;
    const rows = 3, rh = th / (rows * 1.5);
    const clips = [["c", [[0, 0.34], [0.38, 0.22], [0.64, 0.34]]], ["m", [[0.06, 0.3], [0.4, 0.4], [0.84, 0.14]]], ["y", [[0, 0.5], [0.54, 0.4]]]];
    clips.forEach(([key, list], r) => {
      list.forEach(([cx0, cw], i) => {
        const show = clamp((q - 0.15 - i * 0.1 - r * 0.05) * 3.2);
        if (show <= 0) return;
        const bx = tx + tw * cx0, by = ty + r * rh * 1.5, wob = 1 + 0.03 * Math.sin(t * 2 + r * 2 + i);
        fillP(g, F, key, rrP(bx, by, tw * cw * show * wob, rh, 5 * u), 1);
        strokeP(g, F, "k", rrP(bx, by, tw * cw * show * wob, rh, 5 * u), 3 * u);
      });
    });
    const phx = tx + tw * mod(t * 0.28, 1), phl = new Path2D(); phl.moveTo(phx, ty - 10 * u); phl.lineTo(phx, ty + th);
    strokeP(g, F, "k", phl, 6 * u); fillP(g, F, "m", polyP([[phx - 11 * u, ty - 12 * u], [phx + 11 * u, ty - 12 * u], [phx, ty + 6 * u]]), 1);
    // A waveform strip along the bottom of the screen, breathing with the music.
    const wy0 = phone ? ty + th + sh * 0.05 : pv.y + pv.h + sh * 0.08, wy1 = sy + sh - sh * 0.06, wc = (wy0 + wy1) / 2, wn = phone ? 16 : 40, wx0 = sx + sw * 0.04, wstep = (sw * 0.92) / wn, wp = new Path2D();
    for (let i = 0; i < wn; i++) { const amp = (0.25 + 0.75 * Math.abs(Math.sin(i * 1.7 + t * 4.2) * Math.cos(i * 0.6 - t * 1.9))) * (wy1 - wy0) * 0.5; wp.rect(wx0 + i * wstep + wstep * 0.15, wc - amp, wstep * 0.7, amp * 2); }
    fillP(g, F, "o", wp, 1); strokeP(g, F, "k", wp, 2 * u, 0.7);
    const wh = new Path2D(); wh.moveTo(phx, wy0 - 6 * u); wh.lineTo(phx, wy1 + 6 * u); strokeP(g, F, "k", wh, 5 * u);
    strokeP(g, F, "k", scr, 4 * u);
    if (!phone) {
      const base = polyP([[x - w * 0.07, y + h + h * 0.07], [x + w * 1.07, y + h + h * 0.07], [x + w, y + h], [x, y + h]]);
      g.save(); g.translate(10 * u, 10 * u); fillP(g, F, "k", base, 1); g.restore();
      flat(g, F.cream, base); fillP(g, F, "o", base, 0.9); strokeP(g, F, "k", base, 5 * u);
    }
    g.restore();
    // Callouts: numbered leaders from three parts of the device to labels on the right.
    const anchors = [[pv.x + pv.w * 0.72, pv.y + pv.h * 0.3], [tx + tw * 0.5, ty + rh * 1.5 + rh * 0.5], [tx + tw * 0.2, ty + 2 * rh * 1.5 + rh * 0.5]];
    const labelX = stack ? A.x + 20 * u : A.x + A.w * (phone ? 0.58 : 0.7), stackY = y + h * 1.14 + 90 * u, stackStep = Math.max(110 * u, (A.y + A.h - stackY - 40 * u) / 2);
    d.callouts.forEach((label, i) => {
      const c = stagger(b, i, d.callouts.length, 0.5);
      if (c <= 0 || !label) return;
      const [ax, ay] = anchors[i], ly = (stack ? stackY + i * stackStep : A.y + A.h * (0.17 + i * 0.3)) + Math.sin(t * 1.5 + i) * 5 * u;
      const leader = new Path2D(); leader.moveTo(ax, ay);
      const mx = ax + (labelX - ax) * 0.5; leader.lineTo(mx, ay + (ly - ay) * 0.1 * c); leader.lineTo(ax + (labelX - 20 * u - ax) * c, ay + (ly - ay) * c);
      if (!stack) { g.save(); g.setLineDash([20 * u, 12 * u]); g.lineDashOffset = -t * 36 * u; strokeP(g, F, "k", leader, 5 * u); g.restore(); }
      const dot = circP(ax, ay, (stack ? 24 : 11 + 2 * Math.sin(t * 4 + i)) * u);
      flat(g, F.cream, dot); fillP(g, F, "m", dot, 1); strokeP(g, F, "k", dot, 4 * u);
      if (stack) txt(g, F, String(i + 1), ax, ay + 2 * u, 30 * u, { align: "center", base: "middle", font: "fig", color: F.cream });
      if (c > 0.8) {
        const P = pill(g, F, label, labelX + 58 * u, ly, 46, { shadow: "k", tint: i === 1 ? "m" : "y", tintA: 0.4, maxW: stack ? A.w * 0.8 : A.x + A.w - labelX - 48 * u });
        const bx = P.x - 8 * u, bd = circP(bx, P.y + P.h / 2, 26 * u);
        flat(g, F.cream, bd); fillP(g, F, "v", bd, 1); strokeP(g, F, "k", bd, 4 * u);
        txt(g, F, String(i + 1), bx, P.y + P.h / 2 + 2 * u, 36 * u, { align: "center", base: "middle", font: "fig", color: F.cream });
      }
    });
    // Orbiting sparkles.
    for (let i = 0; i < 6; i++) {
      const a = t * 0.6 + (i * TAU) / 6, px = x + w / 2 + Math.cos(a) * w * 0.62, py = y + h / 2 + Math.sin(a) * h * 0.78;
      sparkle(g, F, px, py, (12 + 10 * Math.sin(t * 3 + i)) * u, ["y", "c", "m"][i % 3], 0.9, a);
    }
  }

  // ---- people (a contact sheet of portraits) ----------------------------------------------------------
  function peopleScene(g, F, A, b, d, t) {
    const { u, tall } = F, n = Math.max(2, Math.min(6, Math.round(d.count))), hot = Math.min(n - 1, d.highlight);
    const cols = tall ? 2 : n, rows = tall ? Math.ceil(n / 2) : 1, gap = 34 * u;
    const labelH = 74 * u, tw0 = (A.w - gap * (cols - 1)) / cols, th0 = (A.h - gap * (rows - 1) - labelH * rows - 20 * u) / rows;
    const tw = Math.min(tw0, th0 * 0.82), th = Math.min(th0, tw / 0.82);
    const gw = cols * tw + (cols - 1) * gap, gh = rows * (th + labelH) + (rows - 1) * gap, x0 = A.x + (A.w - gw) / 2, y0 = A.y + (A.h - gh) / 2;
    for (let i = 0; i < n; i++) {
      const q = stagger(b, i, n, 0.55), cx = i % cols, cy = Math.floor(i / cols);
      if (q <= 0) continue;
      const lift = i === hot ? -22 * u + Math.sin(t * 3) * 6 * u : Math.sin(t * 1.8 + i) * 5 * u, x = x0 + cx * (tw + gap), y = y0 + cy * (th + labelH + gap) + lift + (1 - q) * 70 * u;
      g.save(); g.globalAlpha *= clamp(q * 2.2);
      g.translate(x + tw / 2, y + th / 2); g.rotate(Math.sin(t * 1.2 + i * 2) * 0.025 + (i === hot ? 0.02 : 0)); g.translate(-(x + tw / 2), -(y + th / 2));
      tile(g, F, x, y, tw, th, i * 2 + 1, { period: 2.5, phase: i * 0.31, talk: i === hot ? 0.9 : 0, mood: i === hot ? 1 : 0.5, shadow: i === hot ? "m" : "k", line: i === hot ? 8 : 6 });
      const label = d.badges[i % d.badges.length];
      if (label && q > 0.5) pill(g, F, label, x + tw / 2, y + th + labelH * 0.5 + 6 * u, 44, { align: "center", maxW: tw + 20 * u, tint: i === hot ? "m" : null, tintA: 0.45, color: i === hot ? F.onCream : F.onCream });
      if (i === hot) { seal(g, F, x + tw - 8 * u, y + 6 * u, 54 * u, "★", { rot: t * 0.8, key: "v", tilt: 0 }); }
      g.restore();
    }
    for (let i = 0; i < 8; i++) {
      const ph = mod(t * 0.3 + i / 8, 1), px = A.x + A.w * (0.06 + 0.88 * hash(i * 5.7)), py = A.y + A.h * (1.02 - ph * 1.1);
      sparkle(g, F, px, py, (10 + 8 * Math.sin(t * 3 + i)) * u, ["y", "c", "m", "v"][i % 4], Math.sin(ph * Math.PI) * 0.8, t * 1.4 + i);
    }
  }

  // ---- process (screens in a row, a squeegee of ink running through) ----------------------------------
  function icon(g, F, kind, cx, cy, s, t) {
    const u = F.u;
    if (kind === "file") {
      const pts = [[cx - s * 0.32, cy - s * 0.42], [cx + s * 0.1, cy - s * 0.42], [cx + s * 0.32, cy - s * 0.2], [cx + s * 0.32, cy + s * 0.42], [cx - s * 0.32, cy + s * 0.42]];
      g.save(); g.translate(8 * u, 8 * u); fillP(g, F, "k", polyP(pts), 1); g.restore();
      flat(g, F.cream, polyP(pts)); fillP(g, F, "c", polyP(pts), 0.5); strokeP(g, F, "k", polyP(pts), 5 * u);
      const fold = polyP([[cx + s * 0.1, cy - s * 0.42], [cx + s * 0.1, cy - s * 0.2], [cx + s * 0.32, cy - s * 0.2]]); fillP(g, F, "m", fold, 1); strokeP(g, F, "k", fold, 4 * u);
      for (let i = 0; i < 4; i++) { const wob = 0.82 + 0.18 * Math.sin(t * 2.4 + i * 1.3), ln = new Path2D(); ln.moveTo(cx - s * 0.2, cy - s * 0.04 + i * s * 0.12); ln.lineTo(cx - s * 0.2 + s * 0.4 * wob * (i === 3 ? 0.6 : 1), cy - s * 0.04 + i * s * 0.12); strokeP(g, F, "k", ln, 6 * u); }
    } else if (kind === "spark") {
      const big = starP(cx, cy, s * 0.46, s * 0.19, 8, t * 0.5);
      g.save(); g.translate(8 * u, 8 * u); fillP(g, F, "k", big, 1); g.restore();
      flat(g, F.cream, big); fillP(g, F, "y", big, 1); strokeP(g, F, "k", big, 5 * u);
      sparkle(g, F, cx + s * 0.4, cy - s * 0.38, s * 0.14 * (1 + 0.3 * Math.sin(t * 4)), "m", 1, -t);
      sparkle(g, F, cx - s * 0.42, cy + s * 0.34, s * 0.1 * (1 + 0.3 * Math.sin(t * 4 + 2)), "c", 1, t);
    } else if (kind === "eye") {
      const eye = new Path2D(); eye.moveTo(cx - s * 0.46, cy); eye.quadraticCurveTo(cx, cy - s * 0.5, cx + s * 0.46, cy); eye.quadraticCurveTo(cx, cy + s * 0.5, cx - s * 0.46, cy);
      g.save(); g.translate(8 * u, 8 * u); fillP(g, F, "k", eye, 1); g.restore();
      flat(g, F.cream, eye);
      g.save(); g.clip(eye); const px = cx + Math.sin(t * 1.3) * s * 0.14, py = cy + Math.cos(t * 0.9) * s * 0.04;
      fillP(g, F, "c", circP(px, py, s * 0.25), 1); fillP(g, F, "k", circP(px, py, s * 0.11), 1); flat(g, F.cream, circP(px + s * 0.05, py - s * 0.06, s * 0.04)); g.restore();
      strokeP(g, F, "k", eye, 5 * u);
    } else {
      const disc = circP(cx, cy, s * 0.42 * (1 + 0.02 * Math.sin(t * 3)));
      g.save(); g.translate(8 * u, 8 * u); fillP(g, F, "k", disc, 1); g.restore();
      flat(g, F.cream, disc); fillP(g, F, "y", disc, 1); strokeP(g, F, "k", disc, 5 * u);
      const chk = new Path2D(); chk.moveTo(cx - s * 0.22, cy + s * 0.01); chk.lineTo(cx - s * 0.06, cy + s * 0.18); chk.lineTo(cx + s * 0.24, cy - s * 0.17);
      strokeP(g, F, "k", chk, 15 * u);
    }
  }
  function processScene(g, F, A, b, d, t) {
    const { u, tall } = F, n = d.steps.length, kinds = ["file", "spark", "eye", "check"];
    const gapA = tall ? 96 * u : 120 * u;
    const cw = tall ? Math.min(A.w * 0.92, A.h * 0.62) : (A.w - gapA * (n - 1)) / n, ch = tall ? (A.h - gapA * (n - 1)) / n : Math.min(A.h * 0.96, cw * 1.12);
    const active = Math.floor(t / 1.25) % n;
    const x0 = tall ? A.x + (A.w - cw) / 2 : A.x, y0 = tall ? A.y : A.y + (A.h - ch) / 2;
    const pos = (i) => [tall ? x0 : x0 + i * (cw + gapA), tall ? y0 + i * (ch + gapA) : y0];
    for (let i = 0; i < n; i++) {
      const q = stagger(b, i, n, 0.6), [x, y0i] = pos(i);
      if (q <= 0) continue;
      const act = i === active, y = y0i + (1 - q) * 80 * u + (act ? -14 * u : Math.sin(t * 1.7 + i) * 4 * u);
      g.save(); g.globalAlpha *= clamp(q * 2.2);
      const key = ["c", "y", "o", "m"][i % 4];
      g.save(); g.translate(14 * u, 14 * u); fillP(g, F, act ? "m" : "k", rectP(x, y, cw, ch), 1); g.restore();
      flat(g, F.cream, rectP(x, y, cw, ch));
      g.save(); g.beginPath(); g.rect(x, y, cw, ch); g.clip();
      fillP(g, F, key, rectP(x, y, cw, ch * 0.72), 1);
      motif(g, F, x, y, cw, ch * 0.72, [["rays", "stripes", "dots"][i % 3], i % 2 ? "m" : "y", 0.6], t, i);
      g.restore();
      strokeP(g, F, "k", rectP(x, y + ch * 0.72, cw, 1), 4 * u);
      icon(g, F, kinds[i === n - 1 ? 3 : i % 3], x + cw * 0.5, y + ch * 0.37, Math.min(cw, ch) * 0.52, t);
      // Step number and Dot peeking from the corner.
      txt(g, F, String(i + 1).padStart(2, "0"), x + 22 * u, y + 100 * u, 100 * u, { font: "fig", color: F.cream, shadow: F.ink.k });
      tile(g, F, x + cw - 150 * u, y + 22 * u, 120 * u, 148 * u, i + 11, { shadow: false, talk: act ? 0.9 : 0, period: 2.1, line: 4 });
      txt(g, F, d.steps[i], x + cw / 2, y + ch * 0.86, 56 * u, { align: "center", base: "middle", maxW: cw - 40 * u });
      strokeP(g, F, "k", rectP(x, y, cw, ch), 6 * u);
      g.restore();
      if (i < n - 1) {
        const a = stagger(b, i + 0.6, n, 0.6);
        if (tall) {
          const ax = x + cw / 2, ay0 = y0i + ch + 14 * u, ay1 = y0i + ch + gapA - 14 * u, len = (ay1 - ay0) * a;
          if (len > 10 * u) { const s = 36 * u, ar = polyP([[ax - 14 * u, ay0], [ax + 14 * u, ay0], [ax + 14 * u, ay0 + len - s * 0.5], [ax + 30 * u, ay0 + len - s * 0.5], [ax, ay0 + len + s * 0.4], [ax - 30 * u, ay0 + len - s * 0.5], [ax - 14 * u, ay0 + len - s * 0.5]]); flat(g, F.cream, ar); fillP(g, F, "m", ar, 1); strokeP(g, F, "k", ar, 4 * u); }
        } else arrow(g, F, x + cw + 16 * u, y0i + ch * 0.4, x + cw + gapA - 16 * u, a, "m", Math.sin(t * 4 + i) * 6 * u * a);
      }
    }
    // A blob of ink travels along the path, step to step, forever.
    const ph = mod(t * 0.4, 1) * (n - 1), i0 = Math.min(n - 2, Math.floor(ph)), f = ph - i0, [ax, ay] = pos(i0), [bx, by] = pos(i0 + 1);
    const px = lerp(tall ? ax + cw / 2 : ax + cw * 0.5, tall ? bx + cw / 2 : bx + cw * 0.5, f), py = lerp(tall ? ay + ch * 0.5 : ay + ch * 0.4, tall ? by + ch * 0.5 : by + ch * 0.4, f) - Math.sin(f * Math.PI) * 60 * u;
    const blob = circP(px, py, 22 * u);
    flat(g, F.cream, blob); fillP(g, F, "o", blob, 1); strokeP(g, F, "k", blob, 5 * u);
  }

  // ---- compare (a sad print and a happy one) ---------------------------------------------------------
  function compareScene(g, F, A, b, d, t) {
    const { u, tall } = F, gap = (tall ? 70 : 150) * u;
    const cw = tall ? A.w : (A.w - gap) / 2, ch = tall ? (A.h - gap) / 2 : A.h * 0.96;
    const vals = [d.leftValue, d.rightValue], mx = Math.max(vals[0], vals[1], 1);
    [[d.left, "c", vals[0]], [d.right, "m", vals[1]]].forEach(([label, key, value], i) => {
      const q = stagger(b, i, 2, 0.4);
      if (q <= 0) return;
      const x = tall ? A.x : A.x + i * (cw + gap), y = (tall ? A.y + i * (ch + gap) : A.y + (A.h - ch) / 2) + (1 - q) * 70 * u + Math.sin(t * 1.6 + i * 2) * 5 * u;
      g.save(); g.globalAlpha *= clamp(q * 2.2);
      g.save(); g.translate(14 * u, 14 * u); fillP(g, F, "k", rectP(x, y, cw, ch), 1); g.restore();
      flat(g, F.cream, rectP(x, y, cw, ch));
      g.save(); g.beginPath(); g.rect(x, y, cw, ch); g.clip();
      fillP(g, F, key, rectP(x, y, cw, ch), 0.92);
      motif(g, F, x, y, cw, ch, [i ? "rays" : "stripes", i ? "y" : "v", 0.5], t, i);
      g.restore();
      const dw = Math.min(cw * 0.42, ch * 0.8 * 0.82), dh = dw / 0.82, dx = x + cw - dw - 28 * u, dy = tall ? y + 28 * u : y + ch * 0.12;
      tile(g, F, dx, dy, dw, dh, i ? 2 : 5, { fixed: i ? 2 : 1, mood: i ? 1 : -1, talk: i ? 0.9 : 0, shadow: "k", line: 6 });
      pill(g, F, label, x + 30 * u, y + 66 * u, 50, { maxW: cw - dw - 90 * u, shadow: "k" });
      const sz = Math.min(tall ? 140 : 190, ch * 0.3 / u) * u;
      txt(g, F, fmt(value * q, value, d), x + 30 * u, y + ch * 0.6, sz, { font: "fig", color: F.cream, shadow: F.ink.k, maxW: cw - dw - 70 * u });
      const mx0 = x + 30 * u, my = y + ch - 78 * u, mw = cw - 60 * u, mh = 34 * u;
      flat(g, F.cream, rrP(mx0, my, mw, mh, mh / 2)); strokeP(g, F, "k", rrP(mx0, my, mw, mh, mh / 2), 4 * u);
      const fillW = Math.max(mh, mw * (value / mx) * q);
      g.save(); g.beginPath(); g.roundRect(mx0, my, fillW, mh, mh / 2); g.clip();
      fillP(g, F, i ? "m" : "v", rectP(mx0, my, fillW, mh), 1);
      const st = new Path2D(), step = 30 * u, off = mod(t * 40 * u, step);
      for (let X = mx0 - step; X < mx0 + fillW + step; X += step) { st.moveTo(X + off, my + mh); st.lineTo(X + off + mh, my); st.lineTo(X + off + mh + step * 0.4, my); st.lineTo(X + off + step * 0.4, my + mh); st.closePath(); }
      fillP(g, F, "y", st, 0.9); g.restore();
      strokeP(g, F, "k", rrP(mx0, my, mw, mh, mh / 2), 4 * u);
      strokeP(g, F, "k", rectP(x, y, cw, ch), 6 * u);
      if (i === 1 && vals[0] > 0) {
        const sk = back(seg(q, 0.6, 0.95));
        if (sk > 0) {
          const pct = Math.round(((vals[1] - vals[0]) / vals[0]) * 100);
          seal(g, F, tall ? x + cw * 0.27 : dx + dw / 2, y + ch * 0.78, (tall ? 72 : 84) * u * sk, `${pct >= 0 ? "+" : "−"}${Math.abs(pct)}%`, { rot: t * 0.45, tilt: Math.sin(t * 1.3) * 0.1, key: "v", color: F.cream });
        }
      }
      g.restore();
    });
    const ak = back(seg(b, 0.45, 0.7));
    if (ak > 0) {
      const nud = Math.sin(t * 3.4) * 9 * u;
      if (tall) { const ax = A.x + A.w / 2, ay = A.y + ch + gap / 2, s = 38 * u * ak; flat(g, F.cream, polyP([[ax - s, ay - s * 0.9 + nud], [ax + s, ay - s * 0.9 + nud], [ax, ay + s * 0.8 + nud]])); fillP(g, F, "y", polyP([[ax - s, ay - s * 0.9 + nud], [ax + s, ay - s * 0.9 + nud], [ax, ay + s * 0.8 + nud]]), 1); strokeP(g, F, "k", polyP([[ax - s, ay - s * 0.9 + nud], [ax + s, ay - s * 0.9 + nud], [ax, ay + s * 0.8 + nud]]), 5 * u); }
      else arrow(g, F, A.x + cw + 16 * u, A.y + A.h / 2, A.x + cw + gap - 16 * u, ak, "y", nud);
    }
  }

  // ---- registration ----------------------------------------------------------------------------------
  let CUR = { index: 0, next: null, scene: null };
  const lookDef = {
    bg: "#f1e9d6", panel: "rgba(248,241,222,0.9)", ink: "#1c1a2e", muted: "#5b5878", accent: "#f0287a", onAccent: "#f8f1de",
    rule: "rgba(28,26,46,0.8)", track: "rgba(28,26,46,0.14)",
    display: DISPLAY, displayWeight: 800, displayCase: "uppercase", displayTracking: "0.005em",
    body: LABEL, bodyWeight: 800, figures: DISPLAY, radius: 8,
    motion: "wipe", change: "grid",
    kit: { line: 4, fill: "solid", panel: "outline" },
    panelEdge: "rgba(28,26,46,0.85)",
    inks: INKS,
    keepArt: true,
    overlap: true,
    palettes: {
      // Bright: process colours on white stock. Night: screen-blended inks on black stock. Mono: greys on cream.
      light: { bg: "#fbf8ef", ink: "#14213d", accent: "#e8175d", inks: { paper: "#fbf8ef", c: "#00a8d4", m: "#e8175d", y: "#ffcb05", o: "#ff6b1a", v: "#6a3fd1", k: "#14213d", cream: "#fffdf6", onCream: "#14213d", blend: "multiply" }, backdrop: () => "#fbf8ef" },
      dark: { bg: "#15122a", ink: "#15122a", muted: "#b9b6d8", accent: "#ff4f9a", onAccent: "#15122a",
        inks: { paper: "#15122a", c: "#2fc8ff", m: "#ff4f9a", y: "#ffe14d", o: "#ff8a3d", v: "#8d64ff", k: "#0a0818", cream: "#f2ebd8", onCream: "#15122a", blend: "screen" }, backdrop: () => "#15122a" },
      mono: { bg: "#ece8dd", ink: "#1f1f1f", muted: "#5a5853", accent: "#4a4a4f", onAccent: "#ece8dd", rule: "rgba(31,31,31,0.7)",
        inks: { paper: "#ece8dd", c: "#8d8d92", m: "#4a4a4f", y: "#cfcbc0", o: "#a9a59b", v: "#6f6c70", k: "#1d1d1d", cream: "#f6f3ea", onCream: "#1d1d1d", blend: "multiply" }, backdrop: () => "#ece8dd" },
    },
    textShadow: (accent) => `0.035em 0.04em 0 ${hexA(accent, 0.9)}`,
    backdrop: (accent, tex, look) => (look.inks || INKS).paper,
    css: (accent, look) => {
      const inks = look.inks || INKS;
      return `#root .display { color: ${inks.onCream}; text-shadow: 0.035em 0.04em 0 ${hexA(accent, 0.9)}; }
      #root .kicker { align-self: flex-start; display: inline-block; background: ${accent}; color: ${inks.cream}; text-shadow: none; letter-spacing: 0.14em; font-weight: 800; border: 0.1em solid ${inks.k}; padding: 0.28em 0.8em 0.2em; rotate: -2deg; box-shadow: 0.16em 0.16em 0 ${inks.k}; }`;
    },
    // The texture pass sits over everything: stock showing through the ink, the screen mesh, all boiling with the frame.
    paintOver: true,
    paint: (ctx, W, H, t, accent, look) => {
      ctx.clearRect(0, 0, W, H);
      const step = Math.floor(t * 8), pat = speckPat((look.inks || INKS).paper), ox = Math.floor(hash(step * 3 + 91) * 400), oy = Math.floor(hash(step * 5 + 37) * 400);
      pat.setTransform(new DOMMatrix([1, 0, 0, 1, ox, oy]));
      ctx.globalAlpha = 0.5; ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H);
      const mesh = meshPat(); mesh.setTransform(new DOMMatrix([1, 0, 0, 1, step % 7, (step * 3) % 7]));
      ctx.globalAlpha = 0.07; ctx.fillStyle = mesh; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    },
    stage(ctx, S, info) {
      CUR = { index: info.index, next: info.next, scene: info.scene };
      const F = frame(S, info);
      prepDom(F);
      const pl = plan();
      const sceneId = info.scene || (pl && pl.shown.length ? pl.shown[pl.shown.length - 1].id : "closing");
      if (S.paint) world(ctx, F, sceneId);
      // A statement scene has no drawer, so its art (and the outgoing statement's) is drawn here.
      if (pl && info.index > 0 && info.local < info.change) {
        const prev = pl.shown[info.index - 1];
        if (prev && (prev.id === "title" || prev.id === "closing")) {
          const q = clamp(info.local / Math.max(0.01, info.change));
          statement(ctx, F, prev.id, prev.hold + info.local, prev.hold, true, q);
          if (info.scene === "closing") squeegee(ctx, F, q, SECOND[prev.id]);
        }
      }
      if (info.scene === "title" || info.scene === "closing") {
        const entering = info.index > 0 && info.local < info.change;
        ctx.save();
        if (entering) clipSide(ctx, F, clamp(info.local / Math.max(0.01, info.change)), false);
        statement(ctx, F, info.scene, info.local, info.hold, Boolean(info.next));
        ctx.restore();
      }
    },
    scenes: { chart: run("chart", chartScene), object: run("object", objectScene), people: run("people", peopleScene), process: run("process", processScene), compare: run("compare", compareScene) },
  };
  return lookDef;
});
