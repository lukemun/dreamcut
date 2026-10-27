// Scope: a vector-display instrument. One phosphor beam writes everything on a dark graticuled
// tube: an original single-stroke lettering, wireframe objects in perspective, signals and
// readouts. Lines bloom, the beam dwells bright at corners and endpoints, a faint retrace shows
// while it writes, and once a drawing is complete the refresh beam keeps running round it. Scene
// changes run the beam back along the outgoing drawing, un-writing it while the next one is written.
// All drawings are original. Frames are pure functions of time; texture uses seeded noise only.
window.DreamcutMotion.register("scope", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const inout = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const frac = (v) => v - Math.floor(v);
  const hash = (n) => frac(Math.sin(n * 127.1 + 311.7) * 43758.5453);
  const FACE = "'Avenir Next Condensed', 'DIN Condensed', 'Roboto Condensed', 'Arial Narrow', sans-serif";

  // ---- colour ---------------------------------------------------------------------------------------
  function rgbOf(hex) {
    const s = String(hex || "#ffffff");
    const h = s.length === 4 ? s.slice(1).split("").map((c) => c + c).join("") : s.slice(1, 7);
    const n = parseInt(h, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const mixRGB = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(",");

  // ---- single-stroke lettering ------------------------------------------------------------------------
  // Each glyph is drawn on an 8 x 12 grid (base-36 digits). "~" smooths an open stroke, "@" a closed one.
  const GLYPH_SRC = {
    A: "0c408c|1878", B: "0c00|~005072745606|~0656888a5c0c", C: "~72503003093c5c7a", D: "0c00|~0040828a4c0c",
    E: "80000c8c|0666", F: "80000c|0666", G: "~72503003093c5c8a|8a8656", H: "000c|808c|0686", I: "2060|404c|2c6c",
    J: "~80896c2c09", K: "000c|8007|348c", L: "000c8c", M: "0c0046808c", N: "0c008c80", O: "@107083897c1c0903",
    P: "0c00|~005082846606", Q: "@107083897c1c0903|598d", R: "0c00|~005082846606|568c", S: "~82503002042666888a6c2c0a",
    T: "0080|404c", U: "~00093c5c8980", V: "004c80", W: "002c466c80", X: "008c|800c", Y: "004680|464c", Z: "00800c8c",
    0: "@205073796c2c0903|6219", 1: "22404c|2c6c", 2: "~02206082840c|0c8c", 3: "~02206082846636|~3666888a6c2c0a",
    4: "6c600888", 5: "801005|~05346487896c2c0a", 6: "~72503003093c5c8987553507", 7: "00803c",
    8: "@2060727456361412|@3656888a6c2c0a08", 9: "~1a3c5c898350300204365684",
    ".": "0b1b1c0c0b", ",": "1a1c0e", "!": "0007|0b0c", "?": "~0220608284664648|4b4c", ":": "0304|0a0b",
    ";": "1314|1a1c0e", "-": "1666", "+": "0666|3339", "%": "0c80|0020220200|6a8a8c6c6a", "/": "0c60",
    "'": "0002", '"': "0002|3032", "(": "~3003093c", ")": "~0033390c", "$": "~82503002042666888a6c2c0a|4d4-",
    "#": "1c40|5c80|0484|0888", "&": "~8c05031030414206082c4c89", "=": "0484|0888", "<": "82068a", ">": "02860a",
    "*": "4248|1573|1375", _: "0c8c", "→": "0686|538659", "Δ": "0c408c0c", "·": "3637",
  };
  const FONT = {};
  function chaikin(pts, closed, n) {
    for (let it = 0; it < n; it++) {
      const out = [], m = pts.length;
      if (!closed) out.push(pts[0]);
      for (let i = 0; i < (closed ? m : m - 1); i++) {
        const a = pts[i], b = pts[(i + 1) % m];
        out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      if (!closed) out.push(pts[m - 1]);
      pts = out;
    }
    return pts;
  }
  for (const [ch, src] of Object.entries(GLYPH_SRC)) {
    const strokes = src.split("|").map((s) => {
      const mode = s[0] === "~" ? 1 : s[0] === "@" ? 2 : 0;
      if (mode) s = s.slice(1);
      let pts = [];
      for (let i = 0; i + 1 < s.length; i += 2) pts.push([s[i] === "-" ? -1 : parseInt(s[i], 36), s[i + 1] === "-" ? -1 : parseInt(s[i + 1], 36)]);
      if (mode) pts = chaikin(pts, mode === 2, 3);
      if (mode === 2) pts.push(pts[0]);
      return pts;
    });
    let mn = Infinity, mx = -Infinity;
    for (const st of strokes) for (const [x] of st) { mn = Math.min(mn, x); mx = Math.max(mx, x); }
    FONT[ch] = { s: strokes.map((st) => st.map(([x, y]) => [x - mn, y])), w: mx - mn };
  }
  const ALIAS = { "–": "-", "—": "-", "’": "'", "‘": "'", "“": '"', "”": '"', "×": "X", "•": "·", "…": ".", "@": "O", "∆": "Δ" };
  function glyph(c) {
    if (FONT[c]) return FONT[c];
    const up = c.toUpperCase();
    if (FONT[up]) return FONT[up];
    const base = up.normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (FONT[base]) return FONT[base];
    return ALIAS[c] ? FONT[ALIAS[c]] : null;
  }
  // Text size is a font size: capitals stand at 0.72 of it, like a set typeface.
  function textW(s, size, o = {}) {
    s = String(s ?? "").toUpperCase();
    const k = (size * 0.72) / 12, tr = o.track ?? 3;
    let w = 0, last = 0;
    for (const c of s) {
      if (c === " ") { w += 6 * k; last = 0; continue; }
      const g = glyph(c);
      const adv = o.mono && /[0-9]/.test(c) ? 8 + tr : g ? g.w + tr : 6;
      w += adv * k; last = tr * k;
    }
    return Math.max(0, w - last);
  }
  const strokeW = (size, u) => clamp(size * 0.062, 1.9 * u, 6.6 * u);
  function fitSize(s, maxW, size, min) { const w = textW(s, size); return w > maxW ? Math.max(min, (size * maxW) / w) : size; }
  // Greedy wrap, shrinking from the start size until the words fit the line budget.
  function layoutText(s, maxW, size, min, maxLines) {
    const words = String(s ?? "").trim().split(/\s+/).filter(Boolean);
    const wrap = (sz) => {
      const lines = [];
      let cur = "";
      for (const w of words) {
        const next = cur ? cur + " " + w : w;
        if (!cur || textW(next, sz) <= maxW) cur = next; else { lines.push(cur); cur = w; }
      }
      if (cur) lines.push(cur);
      return lines;
    };
    for (let sz = size; sz >= min; sz *= 0.95) {
      const lines = wrap(sz);
      if (lines.length <= maxLines && lines.every((l) => textW(l, sz) <= maxW)) return { size: sz, lines };
    }
    const lines = wrap(min);
    const widest = Math.max(1, ...lines.map((l) => textW(l, min)));
    return { size: widest > maxW ? (min * maxW) / widest : min, lines };
  }

  // ---- the display list -------------------------------------------------------------------------------
  // A frame collects strokes into groups. A group is written by the beam in order: q of its total
  // length shows, with the beam spot at the writing point. A finished group keeps a refresh glint.
  function List(S, t) {
    const T = S.look.tone, acc = rgbOf(S.accent);
    return {
      S, t, u: S.u, T, items: [], dots: [], warp: null, fade: 1, erase: 0, tex: S.look.texture,
      col: [T.beam.join(","), acc.join(",")],
      core: [mixRGB(T.beam, T.hot, T.coreMix), mixRGB(acc, T.hot, T.coreMix * 0.8)],
    };
  }
  function plen(p) { let n = 0; for (let i = 2; i < p.length; i += 2) n += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]); return n; }
  function cutPath(p, from, to) {
    const out = [];
    let pos = 0;
    for (let i = 2; i < p.length; i += 2) {
      const x0 = p[i - 2], y0 = p[i - 1], x1 = p[i], y1 = p[i + 1], d = Math.hypot(x1 - x0, y1 - y0);
      const a = pos, b = pos + d;
      pos = b;
      if (b < from || d === 0) continue;
      if (a > to) break;
      const ka = clamp((from - a) / d), kb = clamp((to - a) / d);
      if (!out.length) out.push(x0 + (x1 - x0) * ka, y0 + (y1 - y0) * ka);
      out.push(x0 + (x1 - x0) * kb, y0 + (y1 - y0) * kb);
    }
    return out;
  }
  function group(B, q, o = {}) {
    const G = { B, q: clamp(q) * (1 - B.erase), o, st: [] };
    G.add = (p, opt = {}) => {
      if (!p || p.length < 4) return G;
      if (B.warp) { const w = []; for (let i = 0; i < p.length; i += 2) { const r = B.warp(p[i], p[i + 1]); w.push(r[0], r[1]); } p = w; }
      G.st.push({ p, ch: opt.ch ?? o.ch ?? 0, a: (opt.a ?? o.a ?? 1) * B.fade, w: opt.w ?? o.w ?? 2.4 * B.u });
      return G;
    };
    G.text = (s, x, y, size, opt = {}) => { G.w = addText(G, s, x, y, size, opt); return G; };
    G.end = () => endGroup(G);
    return G;
  }
  function addText(G, s, x, y, size, o = {}) {
    s = String(s ?? "").toUpperCase();
    const cap = size * 0.72, k = cap / 12, tr = o.track ?? 3;
    const w = textW(s, size, o);
    let x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    const lw = o.w ?? strokeW(size, G.B.u);
    for (const c of s) {
      if (c === " ") { x0 += 6 * k; continue; }
      const gl = glyph(c);
      if (!gl) { x0 += 6 * k; continue; }
      const cell = o.mono && /[0-9]/.test(c) ? 8 : gl.w, off = (cell - gl.w) / 2;
      for (const st of gl.s) {
        const p = [];
        for (const [gx, gy] of st) p.push(x0 + (gx + off) * k, y - cap + gy * k);
        G.add(p, { ch: o.ch, a: o.a, w: lw });
      }
      x0 += (cell + tr) * k;
    }
    return w;
  }
  function endGroup(G) {
    const { B, q, o } = G;
    if (q <= 0 || !G.st.length) return;
    let total = 0;
    for (const s of G.st) { s.len = plen(s.p); total += s.len; }
    let left = total * q, prev = null;
    const rtA = 0.09 * B.tex;
    for (const s of G.st) {
      if (left <= 0) break;
      let shown = s;
      if (s.len > left + 1e-3 * B.u) {
        const c = cutPath(s.p, 0, left);
        shown = { ...s, p: c };
        // The spot rides the writing point, and fades out over the last few percent so it never parks on a finished glyph.
        const fadeOut = o.dot === false ? 0 : B.erase > 0 ? 0.8 * (1 - span(B.erase, 0.5, 0.95)) : 1 - span(q, 0.94, 0.995);
        if (c.length >= 2 && fadeOut > 0.02) B.dots.push({ x: c[c.length - 2], y: c[c.length - 1], r: (o.tip || 5.5) * B.u, ch: s.ch, a: Math.min(1, s.a * 1.2) * fadeOut });
      }
      // While writing, the jumps between strokes leave a faint retrace.
      if (q < 1 && prev && rtA > 0 && o.retrace !== false) B.items.push({ p: [prev[0], prev[1], s.p[0], s.p[1]], ch: s.ch, a: rtA * s.a, w: 1.1 * B.u, flat: true });
      B.items.push(shown);
      prev = [s.p[s.p.length - 2], s.p[s.p.length - 1]];
      left -= s.len;
    }
    if (q >= 1 && o.glint !== false && total > 30 * B.u) glint(B, G.st, total, o);
  }
  // The refresh beam: a brighter run that keeps travelling round a finished drawing.
  function glint(B, st, total, o) {
    const period = Math.max(o.period || 1.8, total / ((o.speed || 1300) * B.u));
    const head = frac(B.t / period + (o.seed || 0)) * total;
    const tail = Math.min(total * 0.45, (o.tail || 190) * B.u);
    const pieces = 5;
    for (let k = 0; k < pieces; k++) {
      const a0 = head - tail + (tail * k) / pieces, a1 = head - tail + (tail * (k + 1)) / pieces;
      if (a1 <= 0) continue;
      let pos = 0;
      for (const s of st) {
        const from = Math.max(a0, pos), to = Math.min(a1, pos + s.len);
        if (to > from) {
          const c = cutPath(s.p, from - pos, to - pos);
          if (c.length >= 4) B.items.push({ p: c, ch: s.ch, a: s.a * (0.12 + 0.6 * ((k + 1) / pieces)) * (o.ga ?? 1), w: s.w * 1.25, flat: true });
        }
        pos += s.len;
        if (pos > a1) break;
      }
    }
  }

  // ---- shapes (flat point arrays) -----------------------------------------------------------------------
  const seg = (x1, y1, x2, y2) => [x1, y1, x2, y2];
  const rect = (x, y, w, h) => [x, y, x + w, y, x + w, y + h, x, y + h, x, y];
  function arc(cx, cy, rx, ry, a0, a1, step = 7) {
    const n = Math.max(6, Math.ceil((Math.abs(a1 - a0) * Math.max(rx, ry)) / step)), p = [];
    for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; p.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry); }
    return p;
  }
  const circle = (cx, cy, r) => arc(cx, cy, r, r, -Math.PI / 2, Math.PI * 1.5);
  function rrect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    const p = [];
    const c = (cx, cy, a0) => { for (let i = 0; i <= 6; i++) { const a = a0 + (Math.PI / 2) * (i / 6); p.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } };
    c(x + r, y + r, Math.PI); c(x + w - r, y + r, -Math.PI / 2); c(x + w - r, y + h - r, 0); c(x + r, y + h - r, Math.PI / 2);
    p.push(p[0], p[1]);
    return p;
  }
  function fn(f, n) { const p = []; for (let i = 0; i <= n; i++) { const r = f(i / n); p.push(r[0], r[1]); } return p; }
  function dashed(x1, y1, x2, y2, on, off) {
    const out = [], L = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / (L || 1), uy = (y2 - y1) / (L || 1);
    for (let d = 0; d < L; d += on + off) out.push(seg(x1 + ux * d, y1 + uy * d, x1 + ux * Math.min(L, d + on), y1 + uy * Math.min(L, d + on)));
    return out;
  }
  function arrowHead(x, y, ang, s) { return [x - Math.cos(ang - 0.45) * s, y - Math.sin(ang - 0.45) * s, x, y, x - Math.cos(ang + 0.45) * s, y - Math.sin(ang + 0.45) * s]; }
  // A small perspective camera: yaw about the vertical, pitch toward the viewer.
  function cam3(cx, cy, s, yaw, pitch, f = 4.2) {
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    return (x, y, z) => {
      const X = x * cyw + z * syw, Z0 = -x * syw + z * cyw;
      const Y = y * cp - Z0 * sp, Z = y * sp + Z0 * cp, k = f / (f - Z);
      return [cx + X * s * k, cy - Y * s * k];
    };
  }
  const fmt = (v, d) => window.DreamcutMotion.formatNumber(v, Math.abs((Number(v) || 0) % 1) > 0.001 ? 1 : 0, (d && d.prefix) || "", (d && d.suffix) || "");
  const tally = (target, k, d) => { const dec = Math.abs((Number(target) || 0) % 1) > 0.001 ? 1 : 0; return window.DreamcutMotion.formatNumber(target * k, dec, (d && d.prefix) || "", (d && d.suffix) || ""); };

  // ---- rendering: line-work, dwell spots, beam spots and bloom -------------------------------------------------
  const BUF = {};
  function buf(key, w, h) {
    let c = BUF[key];
    if (!c) c = BUF[key] = document.createElement("canvas");
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return c;
  }
  function render(ctx, B) {
    if (!B.items.length && !B.dots.length) return;
    const { S, T, u, tex } = B, { W, H } = S;
    const L = buf("layer", W, H), g = L.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.filter = "none";
    g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = T.add ? "lighter" : "source-over";
    g.lineCap = "round"; g.lineJoin = "round";
    const flick = 1 - 0.06 * tex * hash(Math.floor(B.t * 30) + 7);
    const jit = 0.5 * u * tex, ph = B.t * 61;
    const X = (x, y) => x + Math.sin(y * 0.043 + ph) * jit, Y = (x, y) => y + Math.sin(x * 0.037 + ph * 1.3) * jit * 0.6;
    const dwell = [];
    for (const s of B.items) {
      const p = s.p;
      g.beginPath();
      for (let i = 0; i < p.length; i += 2) { const x = X(p[i], p[i + 1]), y = Y(p[i], p[i + 1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }
      const lw = s.w * (T.weight || 1);
      g.strokeStyle = `rgba(${B.col[s.ch]},${clamp(s.a * flick * T.line)})`; g.lineWidth = lw; g.stroke();
      g.strokeStyle = `rgba(${B.core[s.ch]},${clamp(s.a * 0.85 * flick)})`; g.lineWidth = Math.max(0.8 * u, lw * 0.4); g.stroke();
      if (s.flat || s.a < 0.25) continue;
      // The beam slows at sharp turns and at its ends, so those points burn brighter.
      const n = p.length;
      dwell.push(p[0], p[1], s.w, s.ch, s.a, p[n - 2], p[n - 1], s.w, s.ch, s.a);
      for (let i = 2; i < n - 2; i += 2) {
        const ax = p[i] - p[i - 2], ay = p[i + 1] - p[i - 1], bx = p[i + 2] - p[i], by = p[i + 3] - p[i + 1];
        const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
        if (la < 0.5 || lb < 0.5) continue;
        if ((ax * bx + ay * by) / (la * lb) < 0.45) dwell.push(p[i], p[i + 1], s.w, s.ch, s.a);
      }
    }
    for (let i = 0; i < dwell.length; i += 5) {
      g.beginPath(); g.arc(X(dwell[i], dwell[i + 1]), Y(dwell[i], dwell[i + 1]), dwell[i + 2] * 0.62, 0, TAU);
      g.fillStyle = `rgba(${B.core[dwell[i + 3]]},${0.42 * dwell[i + 4] * flick})`; g.fill();
    }
    for (const d of B.dots) {
      const gr = g.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r * 2.6);
      gr.addColorStop(0, `rgba(${B.core[d.ch]},${d.a})`); gr.addColorStop(0.3, `rgba(${B.core[d.ch]},${d.a * 0.8})`); gr.addColorStop(1, `rgba(${B.col[d.ch]},0)`);
      g.fillStyle = gr; g.beginPath(); g.arc(d.x, d.y, d.r * 2.6, 0, TAU); g.fill();
    }
    // Bloom: blurred, reduced copies laid back over the frame.
    const base = ctx.globalAlpha;
    const sm = buf("bloomS", W / 8, H / 8), sg = sm.getContext("2d");
    const md = buf("bloomM", W / 3, H / 3), mg = md.getContext("2d");
    sg.globalCompositeOperation = "source-over"; sg.clearRect(0, 0, sm.width, sm.height);
    sg.filter = "blur(2.5px)"; sg.drawImage(L, 0, 0, sm.width, sm.height); sg.filter = "none";
    mg.globalCompositeOperation = "source-over"; mg.clearRect(0, 0, md.width, md.height);
    mg.filter = "blur(1.6px)"; mg.drawImage(L, 0, 0, md.width, md.height); mg.filter = "none";
    ctx.save();
    ctx.globalCompositeOperation = T.add ? "lighter" : "source-over";
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.globalAlpha = base * T.bloom * (0.55 + 0.45 * tex);
    ctx.drawImage(sm, 0, 0, W, H);
    ctx.globalAlpha = base * T.halo;
    ctx.drawImage(md, 0, 0, W, H);
    ctx.globalAlpha = base;
    ctx.drawImage(L, 0, 0);
    ctx.restore();
  }

  // ---- the instrument: bezel, tube face, graticule ---------------------------------------------------------
  const screenOf = (W, H, u) => { const b = 18 * u; return { x: b, y: b, w: W - 2 * b, h: H - 2 * b, r: 58 * u }; };
  function pathRR(g, R) {
    const { x, y, w, h, r } = R;
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function divsOf(R, tall) {
    const div = tall ? R.w / 8 : R.h / 8, cols = Math.floor(R.w / div / 2) * 2, rows = Math.floor(R.h / div / 2) * 2;
    return { div, cols, rows, cx: R.x + R.w / 2, cy: R.y + R.h / 2 };
  }
  let bgCache = null, bgKey = "";
  function background(S) {
    const { W, H, u, tall } = S, T = S.look.tone, tex = S.look.texture;
    const key = `${W}x${H}:${T.glass}:${T.grat}:${tex}`;
    if (bgCache && bgKey === key) return bgCache;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d"), R = screenOf(W, H, u);
    // Housing: a dark enamelled bezel with a soft bevel.
    g.fillStyle = T.bezel; g.fillRect(0, 0, W, H);
    const bev = g.createLinearGradient(0, 0, 0, H);
    bev.addColorStop(0, "rgba(255,255,255,0.07)"); bev.addColorStop(0.5, "rgba(255,255,255,0)"); bev.addColorStop(1, "rgba(0,0,0,0.25)");
    g.fillStyle = bev; g.fillRect(0, 0, W, H);
    for (const [sx, sy] of [[R.x + 14 * u, R.y + 14 * u], [W - R.x - 14 * u, R.y + 14 * u], [R.x + 14 * u, H - R.y - 14 * u], [W - R.x - 14 * u, H - R.y - 14 * u]]) {
      const gr = g.createRadialGradient(sx - 2 * u, sy - 2 * u, 0, sx, sy, 7 * u);
      gr.addColorStop(0, "rgba(190,195,190,0.55)"); gr.addColorStop(1, "rgba(40,42,40,0.6)");
      g.fillStyle = gr; g.beginPath(); g.arc(sx, sy, 6.5 * u, 0, TAU); g.fill();
      g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = 1.4 * u; g.beginPath(); g.moveTo(sx - 4 * u, sy + 2 * u); g.lineTo(sx + 4 * u, sy - 2 * u); g.stroke();
    }
    // Tube face.
    pathRR(g, R);
    const gl = g.createRadialGradient(R.x + R.w * 0.5, R.y + R.h * 0.46, 0, R.x + R.w * 0.5, R.y + R.h * 0.5, Math.hypot(R.w, R.h) * 0.58);
    gl.addColorStop(0, T.glassMid); gl.addColorStop(0.7, T.glass); gl.addColorStop(1, T.glassEdge);
    g.fillStyle = gl; g.fill();
    g.save(); pathRR(g, R); g.clip();
    // Phosphor grain: the coating is never perfectly even.
    if (tex > 0) {
      const r = rng(1616), n = Math.round((W * H) / 900);
      for (let i = 0; i < n; i++) {
        const x = R.x + r() * R.w, y = R.y + r() * R.h, a = r() * 0.05 * tex * T.grain;
        g.fillStyle = `rgba(${T.grat},${a})`; g.fillRect(x, y, 1.6 * u, 1.6 * u);
      }
    }
    // Graticule: etched divisions, centre axes with minor ticks, and rise-time marks.
    const D = divsOf(R, tall), gx0 = D.cx - (D.cols / 2) * D.div, gy0 = D.cy - (D.rows / 2) * D.div;
    g.strokeStyle = `rgba(${T.grat},${T.gratA})`; g.lineWidth = 1.2 * u;
    g.beginPath();
    for (let i = 0; i <= D.cols; i++) { g.moveTo(gx0 + i * D.div, gy0); g.lineTo(gx0 + i * D.div, gy0 + D.rows * D.div); }
    for (let j = 0; j <= D.rows; j++) { g.moveTo(gx0, gy0 + j * D.div); g.lineTo(gx0 + D.cols * D.div, gy0 + j * D.div); }
    g.stroke();
    g.strokeStyle = `rgba(${T.grat},${T.gratA * 1.6})`; g.lineWidth = 1.3 * u;
    g.beginPath();
    for (let i = 0; i <= D.cols * 5; i++) { const x = gx0 + (i * D.div) / 5; g.moveTo(x, D.cy - 6 * u); g.lineTo(x, D.cy + 6 * u); }
    for (let j = 0; j <= D.rows * 5; j++) { const y = gy0 + (j * D.div) / 5; g.moveTo(D.cx - 6 * u, y); g.lineTo(D.cx + 6 * u, y); }
    g.stroke();
    g.setLineDash([3 * u, 5 * u]);
    g.beginPath();
    for (const fr of [0.1, 0.9]) { const y = gy0 + D.rows * D.div * fr; g.moveTo(gx0, y); g.lineTo(gx0 + D.cols * D.div, y); }
    g.stroke(); g.setLineDash([]);
    g.restore();
    // The rubber mask around the tube.
    pathRR(g, R); g.strokeStyle = "rgba(0,0,0,0.85)"; g.lineWidth = 5 * u; g.stroke();
    pathRR(g, { x: R.x - 3 * u, y: R.y - 3 * u, w: R.w + 6 * u, h: R.h + 6 * u, r: R.r + 3 * u }); g.strokeStyle = "rgba(255,255,255,0.08)"; g.lineWidth = 1.2 * u; g.stroke();
    // Engraved plate lettering on the bezel.
    g.font = `600 ${10 * u}px ${FACE}`; g.letterSpacing = 3 * u + "px"; g.fillStyle = "rgba(220,225,220,0.32)"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("DC-16  VECTOR  DISPLAY  ·  X / Y  ·  Z-AXIS", W / 2, H - R.y / 2);
    g.letterSpacing = "0px";
    bgKey = key;
    return (bgCache = c);
  }
  // Over everything: the curved glass catching the room, the tube darkening at its edges, a slow hum bar.
  let overCache = null, overKey = "";
  function overGlass(W, H, look) {
    const T = look.tone, u = Math.min(W, H) / 1080;
    const key = `${W}x${H}:${T.glare}:${T.vignette}`;
    if (overCache && overKey === key) return overCache;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d"), R = screenOf(W, H, u);
    g.save(); pathRR(g, R); g.clip();
    const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.hypot(W, H) * 0.56);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, `rgba(${T.vigRGB},${T.vignette})`);
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    const gl = g.createLinearGradient(R.x, R.y, R.x + R.w * 0.55, R.y + R.h * 0.7);
    gl.addColorStop(0, `rgba(255,255,255,${T.glare})`); gl.addColorStop(0.45, `rgba(255,255,255,${T.glare * 0.25})`); gl.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gl;
    g.beginPath(); g.ellipse(R.x + R.w * 0.22, R.y + R.h * 0.12, R.w * 0.42, R.h * 0.3, -0.25, 0, TAU); g.fill();
    g.strokeStyle = `rgba(255,255,255,${T.glare * 1.4})`; g.lineWidth = 2 * u;
    g.beginPath(); g.moveTo(R.x + R.r, R.y + 7 * u); g.quadraticCurveTo(R.x + R.w * 0.3, R.y + 4 * u, R.x + R.w * 0.55, R.y + 9 * u); g.stroke();
    const lip = 26 * u;
    pathRR(g, R); g.strokeStyle = "rgba(0,0,0,0.5)"; g.lineWidth = lip; g.filter = `blur(${10 * u}px)`; g.stroke(); g.filter = "none";
    g.restore();
    overKey = key;
    return (overCache = c);
  }

  // ---- scene plan (to know which scene a change leaves) ------------------------------------------------------
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  const HEAD = { chart: "chart-title", object: "object-title", people: "people-title", process: "process-title", compare: "compare-title" };
  function controls() {
    if (window.__dreamcut && window.__dreamcut.controls) return window.__dreamcut.controls;
    try { if (typeof dc !== "undefined" && dc && dc.controls) return dc.controls; } catch (e) { /* not on this page */ }
    return null;
  }
  let planCache = null;
  function plan() {
    if (planCache) return planCache;
    const c = controls();
    if (!c) return null;
    let t = 0;
    const shown = [];
    for (const id of ORDER) { const hold = Number(c[`${id}_hold`]) || 0; if (hold > 0) shown.push({ id, start: t, hold }); t += hold; }
    return (planCache = { shown, change: Number(c.change) || 0.45 });
  }
  const words = (id) => { const el = document.getElementById(id); return el ? el.textContent || "" : ""; };
  const layCache = {};
  function lay(key, s, maxW, size, min, lines) {
    const k = `${key}|${s}|${maxW}|${size}`;
    return layCache[k] || (layCache[k] = layoutText(s, maxW, size, min, lines));
  }
  // A leaving drawing is retraced: the beam runs back along every stroke, un-writing it, while the
  // phosphor left behind decays.
  function retrace(B, e) {
    B.erase = inout(clamp(e * 1.3));
    B.fade = 1 - 0.35 * span(e, 0.3, 1);
  }

  // ---- stage furniture: readouts and headlines ------------------------------------------------------------
  function readouts(B, info) {
    const { S, u, t } = B, { W, H, tall } = S, R = screenOf(W, H, u);
    const sz = 25 * u, top = R.y + (tall ? 58 : 46) * u, bot = R.y + R.h - (tall ? 40 : 26) * u, l = R.x + (tall ? 50 : 62) * u, r = R.x + R.w - (tall ? 50 : 62) * u;
    const G = group(B, 1, { a: 0.5, glint: false, retrace: false });
    const fr = Math.floor(t * 30), ss = Math.floor(fr / 30);
    const tc = `${String(Math.floor(ss / 60)).padStart(2, "0")}:${String(ss % 60).padStart(2, "0")}:${String(fr % 30).padStart(2, "0")}`;
    G.text("CH1 2V  CH2 1V", l, top, sz);
    G.text(`TC ${tc}`, r, top, sz, { align: "right", mono: true });
    const P = plan(), n = P ? P.shown.length : 7, i = Math.max(0, info.index) + 1;
    G.text(`SCN ${i}/${n}  ·  50MS/DIV`, l, bot, sz);
    const lvl = (0.4 + 0.03 * Math.sin(t * 2.3)).toFixed(2);
    G.text(`TRIG AUTO +${lvl}V`, r, bot, sz, { align: "right", mono: true });
    G.end();
    // Trigger-level marker riding the left edge of the graticule.
    const D = divsOf(R, tall), x = D.cx - (D.cols / 2) * D.div - 4 * u, y = D.cy - D.div * (0.6 + 0.08 * Math.sin(t * 2.3));
    group(B, 1, { a: 0.6, glint: false, w: 2 * u }).add([x - 16 * u, y - 9 * u, x, y, x - 16 * u, y + 9 * u, x - 16 * u, y - 9 * u]).end();
  }
  function headline(B, id, local, hold) {
    const s = words(HEAD[id]);
    if (!s) return;
    const { S, u } = B, { W, tall } = S, side = (tall ? 90 : 140) * u, top = (tall ? 170 : 104) * u;
    const L = lay(id, s, W - side * 2, tall ? 82 * u : 84 * u, 66 * u, tall ? 3 : 2);
    const cap = L.size * 0.72, lh = cap * 1.6;
    const P = plan(), lead = P && P.shown.length && P.shown[0].id === id ? -0.4 : 0.17;
    const G = group(B, span(local, lead, lead + Math.min(1.2, hold * 0.34)), { w: strokeW(L.size, u), seed: 0.3, tail: 240 });
    let wide = 0;
    L.lines.forEach((ln, i) => { G.text(ln, side, top + cap + i * lh, L.size); wide = Math.max(wide, G.w); });
    G.end();
    // A trace underline with a pulse that keeps running along it.
    const y = top + cap + (L.lines.length - 1) * lh + 30 * u, q = span(local, 0.45, 1.25), x1 = side + Math.max(wide, 300 * u);
    const ph = frac(B.t * 0.35), px = side + (x1 - side) * ph, pw = 46 * u;
    const line = fn((k) => {
      const x = side + (x1 - side) * k, d = (x - px) / pw;
      return [x, y - (Math.abs(d) < 1 ? Math.sin(d * Math.PI) * 14 * u * Math.cos(d * Math.PI / 2) : 0)];
    }, 160);
    group(B, q, { a: 0.75, w: 2 * u, glint: false }).add(line).add(seg(side, y - 9 * u, side, y + 9 * u)).add(seg(x1, y - 9 * u, x1, y + 9 * u)).end();
  }

  // ---- title: a wire reel whose film unspools into a signal ---------------------------------------------------
  function reel(B, cx, cy, R, q, t, toward) {
    const { u } = B, P = cam3(cx, cy, R, 0.62 + 0.12 * Math.sin(t * 0.45), 0.2 + 0.05 * Math.sin(t * 0.3), 5), spin = -t * 0.8;
    const ring = (r, z, n = 64, a0 = 0) => { const p = []; for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * TAU; const v = P(Math.cos(a) * r, Math.sin(a) * r, z); p.push(v[0], v[1]); } return p; };
    const G = group(B, q, { w: 2.6 * u, seed: 0.1, tail: 260 });
    for (const z of [0.2, -0.2]) {
      G.add(ring(1, z, 96));
      G.add(ring(0.95, z, 96), { a: 0.45, w: 1.4 * u });
      G.add(ring(0.17, z, 32));
      G.add(ring(0.08, z, 24), { a: 0.6 });
      for (let k = 0; k < 5; k++) {
        const a = spin + (k / 5) * TAU, hx = Math.cos(a) * 0.56, hy = Math.sin(a) * 0.56, p = [];
        for (let i = 0; i <= 28; i++) { const b = (i / 28) * TAU; const v = P(hx + Math.cos(b) * 0.24, hy + Math.sin(b) * 0.24, z); p.push(v[0], v[1]); }
        G.add(p, { w: 2 * u });
      }
    }
    // Film wound on the hub, and the axle.
    for (let k = 0; k < 4; k++) G.add(ring(0.38 + k * 0.1, 0, 64, spin * 0.5), { a: 0.42, w: 1.3 * u });
    const a1 = P(0, 0, 0.42), a2 = P(0, 0, -0.42);
    G.add(seg(a1[0], a1[1], a2[0], a2[1]), { w: 2 * u });
    for (const a of [0.3, 2.4, 4.2]) { const p1 = P(Math.cos(a) * 1, Math.sin(a) * 1, 0.2), p2 = P(Math.cos(a), Math.sin(a), -0.2); G.add(seg(p1[0], p1[1], p2[0], p2[1]), { a: 0.5, w: 1.3 * u }); }
    G.end();
    // The tail of film leaves the reel and flattens into a running waveform.
    const start = P(0.62, 0.62, 0);
    const ex = toward.x, ey = toward.y, mid = Math.max(0.1, Math.min(0.5, 0.5));
    const fq = span(q, 0.45, 1), half = 18 * u, steps = 140;
    const top = [], botm = [], wave = [], sprockets = [];
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      const x = lerp(start[0], ex, k), yb = lerp(start[1], ey, ease(k * 1.6)) ;
      if (k <= mid) {
        const w = half * (1 - span(k, mid * 0.6, mid));
        top.push(x, yb - w); botm.push(x, yb + w);
        if (i % 6 === 0 && w > 4 * u) sprockets.push(rect(x - 3.5 * u, yb - w * 0.62, 7 * u, 5 * u), rect(x - 3.5 * u, yb + w * 0.62 - 5 * u, 7 * u, 5 * u));
      }
      if (k >= mid * 0.85) {
        const amp = 26 * u * span(k, mid * 0.85, mid + 0.15) * (0.6 + 0.4 * Math.sin(k * 9 + t * 1.3));
        wave.push(x, yb + Math.sin(k * 46 - t * 6) * amp);
      }
    }
    const F = group(B, fq, { w: 2.2 * u, seed: 0.6 });
    F.add(top).add(botm);
    for (const s of sprockets) F.add(s, { a: 0.5, w: 1.3 * u });
    F.end();
    group(B, span(q, 0.65, 1), { ch: 1, w: 2.6 * u, seed: 0.2 }).add(wave).end();
  }
  function titleArt(B, local, hold) {
    const { S, u } = B, { W, H, tall } = S, side = (tall ? 90 : 140) * u;
    const kick = words("kicker"), title = words("title");
    // At the first frame the reel is already partly written, so the screen never starts empty.
    const q = clamp(0.55 + local / 2.2);
    if (tall) reel(B, W * 0.5, H * 0.63, W * 0.3, q, B.t, { x: W - side * 0.6, y: H * 0.86 });
    else reel(B, W * 0.75, H * 0.45, H * 0.25, q, B.t, { x: side * 0.6, y: H * 0.82 });
    const maxW = tall ? W - side * 2 : W * 0.52;
    const L = lay("title", title, maxW, tall ? 112 * u : 118 * u, 72 * u, tall ? 4 : 3);
    const cap = L.size * 0.72, lh = cap * 1.42, ks = 38 * u;
    const blockH = ks * 0.72 + 40 * u + cap + (L.lines.length - 1) * lh;
    const y0 = tall ? H * 0.17 : H * 0.47 - blockH / 2;
    const K = group(B, span(local, -0.45, 0.45), { ch: 1, w: strokeW(ks, u), seed: 0.5 });
    if (kick) K.text(kick, side, y0 + ks * 0.72, ks);
    K.end();
    const G = group(B, span(local, -0.5, Math.min(1.3, hold * 0.55)), { w: strokeW(L.size, u), tail: 280 });
    L.lines.forEach((ln, i) => G.text(ln, side, y0 + ks * 0.72 + 40 * u + cap + i * lh, L.size));
    G.end();
  }

  // ---- closing: the line, over a pulse trace whose beats are ticks ----------------------------------------------
  function closingArt(B, local, hold) {
    const { S, u, t } = B, { W, H, tall } = S, side = (tall ? 90 : 140) * u, R = screenOf(W, H, u);
    const s = words("closing");
    local += 0.3;
    const L = lay("closing", s, W - side * 2, tall ? 108 * u : 112 * u, 70 * u, tall ? 4 : 2);
    const cap = L.size * 0.72, lh = cap * 1.42, n = L.lines.length;
    const yc = tall ? H * 0.3 : H * 0.29, y0 = yc - ((n - 1) * lh) / 2 + cap / 2;
    const G = group(B, span(local, 0.05, 0.05 + Math.min(1.4, hold * 0.6)), { w: strokeW(L.size, u), tail: 300 });
    L.lines.forEach((ln, i) => G.text(ln, W / 2, y0 + i * lh, L.size, { align: "center" }));
    G.end();
    // A seal: two wire rings turning on crossed axes round a tick.
    const y = tall ? H * 0.55 : H * 0.6, cx = W / 2, rs = (tall ? 210 : 175) * u, sq = span(local, 0.2, 1.1);
    const P = cam3(cx, y, rs, t * 0.7, 0.35 + 0.1 * Math.sin(t * 0.5), 5);
    const ring = (f) => { const p = []; for (let i = 0; i <= 90; i++) { const v = f((i / 90) * TAU); p.push(...P(v[0], v[1], v[2])); } return p; };
    const C = group(B, sq, { w: 2.6 * u, seed: 0.35, tail: 220 });
    C.add(ring((a) => [Math.cos(a), Math.sin(a), 0]));
    C.add(ring((a) => [0, Math.sin(a) * 0.86, Math.cos(a) * 0.86]), { a: 0.7 });
    C.add(ring((a) => [Math.cos(a) * 0.72, 0, Math.sin(a) * 0.72]), { a: 0.45, w: 1.5 * u });
    C.end();
    // Ticks round the seal like a dial face, one lit position orbiting.
    const D = group(B, sq, { a: 0.5, w: 1.6 * u, glint: false, retrace: false }), lit = Math.floor(t * 6) % 36;
    for (let k = 0; k < 36; k++) { const a = (k / 36) * TAU, r0 = rs * 1.22, r1 = rs * (k % 3 ? 1.28 : 1.34); D.add(seg(cx + Math.cos(a) * r0, y + Math.sin(a) * r0, cx + Math.cos(a) * r1, y + Math.sin(a) * r1), k === lit ? { ch: 1, a: 1, w: 2.6 * u } : {}); }
    D.end();
    const tick = rs * 0.46, redraw = sq >= 1 ? clamp(frac(t * 0.4) * 1.5) : 0;
    const tq = sq >= 1 ? 1 : span(sq, 0.6, 1);
    const tickP = [cx - tick * 0.62, y + tick * 0.02, cx - tick * 0.16, y + tick * 0.46, cx + tick * 0.7, y - tick * 0.5];
    group(B, tq, { ch: 1, w: 5 * u, tip: 7, seed: 0.8 }).add(tickP).end();
    if (redraw > 0 && redraw < 1) group(B, redraw, { ch: 1, a: 0.6, w: 8 * u, glint: false, tip: 8 }).add(tickP).end();
    // Either side, a second instrument: an X/Y phase figure that locks, and a stack of cards being applied.
    const iy = tall ? H * 0.79 : y, ir = (tall ? 150 : 150) * u;
    const lx = tall ? W * 0.27 : R.x + R.w * 0.17, rx = tall ? W * 0.73 : R.x + R.w * 0.83, iq = span(local, 0.3, 1.2);
    const LW = group(B, iq, { w: 2 * u, a: 0.7, seed: 0.55, glint: false });
    LW.add(circle(lx, iy, ir));
    for (const k of [-1, 1]) LW.add(seg(lx - ir * 0.92, iy + k * ir * 0.45, lx + ir * 0.92, iy + k * ir * 0.45), { a: 0.25, w: 1 * u });
    LW.add(seg(lx - ir, iy, lx + ir, iy), { a: 0.3, w: 1 * u }).add(seg(lx, iy - ir, lx, iy + ir), { a: 0.3, w: 1 * u });
    LW.end();
    const lock = 0.5 + 0.5 * Math.cos(t * 0.9), phase = t * 1.7 * (1 - lock) + 0.6, ratio = lerp(1.5, 1, lock);
    const liss = fn((k) => { const a = k * TAU * 2; return [lx + Math.sin(a * ratio + phase) * ir * 0.78, iy + Math.sin(a) * ir * 0.78]; }, 260);
    group(B, iq, { ch: 1, a: 0.9, w: 2.4 * u, glint: false }).add(liss).end();
    const cw = ir * 1.5, chh = ir * 0.42, cg = ir * 0.2, cy0 = iy - (3 * chh + 2 * cg) / 2, cx0 = rx - cw / 2;
    const step = Math.floor(t / 0.9) % 4;
    for (let k = 0; k < 3; k++) {
      const yy = cy0 + k * (chh + cg), on = k < step;
      const K = group(B, span(iq, k * 0.15, 0.55 + k * 0.15), { ch: on ? 1 : 0, a: on ? 1 : 0.65, w: 2 * u, seed: 0.6 + k * 0.1, glint: false });
      K.add(rrect(cx0, yy, cw, chh, 10 * u));
      for (const f of [0.38, 0.62]) K.add(seg(cx0 + chh * 0.95, yy + chh * f, cx0 + cw - 18 * u - (f > 0.5 ? cw * 0.22 : 0), yy + chh * f), { a: 0.45, w: 1.4 * u });
      K.end();
      const bx = cx0 + chh * 0.5, by = yy + chh / 2, bs = chh * 0.28;
      group(B, iq, { ch: on ? 1 : 0, a: 0.8, w: 1.8 * u, glint: false }).add(rect(bx - bs, by - bs, bs * 2, bs * 2)).end();
      if (k === step - 1) { const pq = clamp(frac(t / 0.9) * 2.2); group(B, pq, { ch: 1, w: 3 * u, glint: false, tip: 4 }).add([bx - bs * 0.7, by, bx - bs * 0.15, by + bs * 0.6, bx + bs * 0.85, by - bs * 0.75]).end(); }
      else if (on) group(B, 1, { ch: 1, w: 3 * u, glint: false }).add([bx - bs * 0.7, by, bx - bs * 0.15, by + bs * 0.6, bx + bs * 0.85, by - bs * 0.75]).end();
    }
    // A monitor sweep along the foot: the beam runs left to right, the trace fades behind it, each beat is a tick.
    const sy = tall ? H * 0.9 : H * 0.865, x0 = R.x + 60 * u, x1 = R.x + R.w - 60 * u, A = (tall ? 80 : 70) * u;
    const beat = tall ? 190 * u : 260 * u, period = 2.6, head = frac(t / period) * 1.2 - 0.1;
    const gapL = tall ? x1 : cx - rs * 0.9, gapR = tall ? x1 : cx + rs * 0.9;
    const yAt = (x) => {
      const k = frac((x - x0) / beat + 0.15), d = k - 0.5;
      if (d < -0.06 || d > 0.14) return sy + Math.sin(x * 0.05 + t * 3) * 2 * u;
      if (d < 0) return sy + ((d + 0.06) / 0.06) * A * 0.35;
      return sy + A * 0.35 - (d / 0.14) * A * 1.25;
    };
    const reveal = span(local, 0.3, 1.2), chunks = 30;
    for (let c = 0; c < chunks; c++) {
      const k0 = c / chunks, k1 = (c + 1) / chunks, km = (k0 + k1) / 2;
      if (km > reveal) break;
      const xa = lerp(x0, x1, k0), xb = lerp(x0, x1, k1);
      if (xb > gapL && xa < gapR && !tall) continue;
      const age = frac(head - km), a = 0.12 + 0.88 * Math.exp(-age * 3.2), p = [];
      for (let i = 0; i <= 18; i++) { const x = lerp(xa, xb, i / 18); p.push(x, yAt(x)); }
      group(B, 1, { ch: 1, a, w: 2.8 * u, glint: false }).add(p).end();
    }
    if (reveal >= 1 && head >= 0 && head <= 1) { const x = lerp(x0, x1, head); if (tall || x < gapL || x > gapR) B.dots.push({ x, y: yAt(x), r: 6 * u, ch: 1, a: 1 }); }
  }
  // ---- chart: scanned columns, a cursor pair and a readout window ------------------------------------------------
  function chart(B, b, p, d) {
    const { S, u, t } = B, tall = S.tall;
    const vals = (d.values || []).map((v) => Math.max(0, Number(v) || 0)), n = Math.max(1, vals.length), max = Math.max(...vals, 1);
    const hi = d.highlight >= 0 && d.highlight < n ? d.highlight : -1;
    const step = (() => { const x = max / 4, e = Math.pow(10, Math.floor(Math.log10(Math.max(x, 1e-6)))), m = x / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e; })();
    const topV = Math.max(step, Math.ceil(max / step) * step);
    const Rw = tall ? { x: b.x, y: b.y - 20 * u, w: b.w, h: 300 * u } : { x: b.x + b.w - 450 * u, y: b.y - 10 * u, w: 450 * u, h: b.h - 50 * u };
    const P = tall ? { x: b.x + 90 * u, y: b.y + 400 * u, w: b.w - 100 * u, h: b.h - 520 * u } : { x: b.x + 100 * u, y: b.y + 80 * u, w: b.w - 450 * u - 170 * u, h: b.h - 190 * u };
    const base = P.y + P.h, slot = P.w / n, bw = Math.min(slot * 0.5, 170 * u), ax = P.x - 40 * u;
    // Axis and scale.
    const A = group(B, span(p, 0, 0.25), { a: 0.85, w: 2 * u, seed: 0.15 });
    A.add([ax, P.y - 30 * u, ax, base, P.x + P.w + 20 * u, base]);
    for (let v = 0, i = 0; v <= topV + 1e-9; v += step / 2, i++) {
      const y = base - (v / topV) * P.h, major = i % 2 === 0;
      A.add(seg(ax - (major ? 16 : 8) * u, y, ax, y), { w: 1.6 * u });
      if (major) A.text(fmt(v), ax - 24 * u, y + 9 * u, 30 * u, { align: "right", a: 0.6 });
    }
    A.end();
    let hot = null;
    const tops = [];
    vals.forEach((v, i) => {
      const cx = P.x + slot * (i + 0.5), x = cx - bw / 2, isHot = i === hi, ch = isHot ? 1 : 0, s0 = 0.08 + i * 0.08;
      const live = p >= 1 ? 1 + 0.012 * Math.sin(t * 3.1 + i * 1.7) : 1;
      const grow = ease(span(p, s0 + 0.08, s0 + 0.42)), h = Math.max(6 * u, (v / topV) * P.h * grow * live), top = base - h;
      tops.push([cx, top]);
      // Outline written first, then a scanned fill that keeps scrolling.
      group(B, span(p, s0, s0 + 0.3), { ch, w: 2.8 * u, seed: i * 0.21 }).add([x, base, x, top, x + bw, top, x + bw, base]).end();
      const F = group(B, span(p, s0 + 0.15, s0 + 0.45), { ch, a: isHot ? 0.5 : 0.32, w: 1.5 * u, glint: false, retrace: false });
      const gap = 13 * u, off = (t * 22 * u) % gap;
      for (let y = base - 4 * u - off; y > top + 4 * u; y -= gap) F.add(seg(x + 6 * u, y, x + bw - 6 * u, y));
      F.end();
      // Peak marker drifting down over each column.
      if (p > 0.6) {
        const k = frac(t * 0.45 + i * 0.29), py = top - 8 * u - (1 - k) * 22 * u;
        group(B, 1, { ch, a: 0.8 * (1 - k * 0.6), w: 2.4 * u, glint: false }).add(seg(x + bw * 0.15, py, x + bw * 0.85, py)).end();
      }
      const vq = span(p, s0 + 0.2, s0 + 0.5);
      const lab = d.labels[i] || "", ls = fitSize(lab, slot * 0.95, 46 * u, 36 * u);
      group(B, span(p, s0 + 0.25, s0 + 0.5), { ch: isHot ? 1 : 0, a: isHot ? 1 : 0.85, seed: i * 0.13 }).text(lab, cx, base + 64 * u, ls, { align: "center" }).end();
      if (isHot) hot = { cx, x, top, v, label: lab };
    });
    // Count-up figures need their own groups so the glint does not chase changing digits.
    vals.forEach((v, i) => {
      const cx = P.x + slot * (i + 0.5), isHot = i === hi, s0 = 0.08 + i * 0.08, vq = span(p, s0 + 0.2, s0 + 0.5);
      if (vq <= 0) return;
      const [, top] = tops[i], vs = isHot ? 64 * u : 54 * u, half = textW(fmt(v, d), vs, { mono: true }) / 2 + 14 * u;
      // Sit the figure above wherever the trend line climbs inside its width.
      let rise = 0;
      for (const j of [i - 1, i + 1]) if (tops[j]) rise = Math.max(rise, ((top - tops[j][1]) * half) / slot);
      const G = group(B, clamp(vq * 2.2), { ch: isHot ? 1 : 0, glint: false });
      G.text(tally(v, inout(vq), d), cx, top - Math.max(46 * u, 6 * u + rise + 26 * u), vs, { align: "center", mono: true });
      G.end();
    });
    // A trace joining the column tops, with a dot running along it.
    if (tops.length > 1) {
      const line = tops.flatMap(([x, y]) => [x, y - 6 * u]);
      group(B, span(p, 0.5, 0.75), { a: 0.4, w: 1.6 * u, glint: false }).add(line).end();
      if (p > 0.75) {
        // A sample marker sweeps the baseline; a tick rises from it to meet each column it passes.
        const x0 = ax, x1 = P.x + P.w + 20 * u, k = frac(t * 0.28), x = lerp(x0, x1, k);
        B.dots.push({ x, y: base, r: 4.5 * u, ch: 0, a: 0.9 });
        group(B, 1, { a: 0.5, w: 1.6 * u, glint: false }).add(seg(Math.max(x0, x - 70 * u), base, x, base)).end();
        tops.forEach(([cx], i) => {
          const dd = Math.abs(x - cx) / (bw * 0.5);
          if (dd < 1) group(B, 1, { ch: i === hi ? 1 : 0, a: 0.8 * (1 - dd), w: 2 * u, glint: false }).add(seg(cx - bw / 2, base - 10 * u, cx + bw / 2, base - 10 * u)).end();
        });
      }
    }
    if (!hot) return;
    // Cursors bracket the highlighted column; the readout window reports it.
    const cq = span(p, 0.55, 0.8);
    const C = group(B, cq, { ch: 1, a: 0.7, w: 1.6 * u, glint: false, retrace: false });
    for (const s of dashed(ax, hot.top, P.x + P.w + 10 * u, hot.top, 14 * u, 9 * u)) C.add(s);
    C.end();
    const blink = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 5));
    group(B, cq, { ch: 1, a: blink, w: 2.2 * u, glint: false }).add(arrowHead(ax + 2 * u, hot.top, 0, 14 * u)).end();
    const rq = span(p, 0.4, 0.68);
    const R = group(B, rq, { w: 2.2 * u, seed: 0.77, glint: false });
    R.add(rrect(Rw.x, Rw.y, Rw.w, Rw.h, 18 * u));
    R.add(seg(Rw.x, Rw.y + 58 * u, Rw.x + Rw.w, Rw.y + 58 * u), { a: 0.6, w: 1.4 * u });
    R.text("CURSOR  ΔY", Rw.x + 26 * u, Rw.y + 40 * u, 28 * u, { a: 0.7 });
    R.text("CH2", Rw.x + Rw.w - 26 * u, Rw.y + 40 * u, 28 * u, { a: 0.7, align: "right", ch: 1 });
    const lx = Rw.x + 34 * u, ly = Rw.y + (tall ? 128 : 136) * u;
    R.text(hot.label, lx, ly, fitSize(hot.label, Rw.w - 70 * u, 48 * u, 40 * u));
    R.end();
    const vq = span(p, 0.6, 1);
    if (vq > 0) {
      const num = tally(hot.v, inout(vq), d), ns = fitSize(fmt(hot.v, d), tall ? Rw.w * 0.55 : Rw.w - 70 * u, 138 * u, 96 * u);
      const N = group(B, clamp(vq * 2.5), { ch: 1, glint: false });
      N.text(num, lx, Rw.y + (tall ? 262 : 280) * u, ns, { mono: true, w: 5 * u });
      N.end();
    }
    const others = vals.filter((_, i) => i !== hi);
    if (others.length) {
      const mean = others.reduce((s, v) => s + v, 0) / others.length, pct = mean > 0 ? Math.round(((hot.v - mean) / mean) * 100) : 0;
      const note = `${pct >= 0 ? "+" : ""}${pct}% VS MEAN`;
      group(B, span(p, 0.8, 1), { a: 0.85, seed: 0.4, glint: false }).text(note, tall ? Rw.x + Rw.w - 30 * u : lx, tall ? Rw.y + 262 * u : Rw.y + 350 * u, 36 * u, { align: tall ? "right" : "left" }).end();
    }
    if (!tall) {
      // A small sweep inside the readout: each column as a pulse, the highlighted one on CH2.
      const sx = Rw.x + 34 * u, sw = Rw.w - 68 * u, sy = Rw.y + Rw.h - 60 * u, sh = Rw.h - 470 * u;
      if (sh > 60 * u) {
        const M = group(B, span(p, 0.65, 0.9), { a: 0.25, w: 1 * u, glint: false, retrace: false });
        for (let k = 0; k <= 4; k++) M.add(seg(sx, sy - (sh * k) / 4, sx + sw, sy - (sh * k) / 4));
        M.end();
        const head = frac(t * 0.4);
        const pts = fn((k) => {
          const i = Math.min(n - 1, Math.floor(k * n)), f = k * n - i, bump = Math.pow(Math.sin(Math.PI * f), 6);
          return [sx + sw * k, sy - (vals[i] / max) * sh * 0.92 * bump];
        }, 160);
        const age = (k) => frac(head - k);
        for (let c = 0; c < 16; c++) {
          const a = 0.15 + 0.85 * Math.exp(-age((c + 0.5) / 16) * 3);
          const part = pts.slice(Math.floor((c * 160) / 16) * 2, (Math.floor(((c + 1) * 160) / 16) + 1) * 2);
          const which = Math.min(n - 1, Math.floor(((c + 0.5) / 16) * n));
          group(B, clamp((span(p, 0.7, 1) * 16 - c) ), { ch: which === hi ? 1 : 0, a, w: 2.2 * u, glint: false, dot: false, retrace: false }).add(part).end();
        }
      }
    }
  }

  // ---- object: a wireframe laptop or phone turning slowly, with callouts --------------------------------------------
  function deviceScreen(B, M, q, t, phone) {
    // M(uu, vv) maps the display face (0..1 across and down) to the frame.
    const { u } = B;
    const R = (u0, v0, u1, v1) => { const a = M(u0, v0), b = M(u1, v0), c = M(u1, v1), d = M(u0, v1); return [a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1], a[0], a[1]]; };
    const lineUV = (pts) => pts.flatMap(([a, b]) => M(a, b));
    const pv = phone ? [0.06, 0.05, 0.94, 0.42] : [0.04, 0.06, 0.6, 0.55];
    const G = group(B, q, { w: 1.8 * u, seed: 0.33 });
    G.add(R(...pv));
    const [pu0, pv0, pu1, pv1] = pv, W_ = pu1 - pu0, H_ = pv1 - pv0;
    G.add(lineUV([[pu0, pv0 + H_ * 0.85], [pu0 + W_ * 0.22, pv0 + H_ * 0.45], [pu0 + W_ * 0.36, pv0 + H_ * 0.64], [pu0 + W_ * 0.55, pv0 + H_ * 0.3], [pu0 + W_ * 0.78, pv0 + H_ * 0.78], [pu1, pv0 + H_ * 0.55]]), { a: 0.7 });
    const sun = [];
    for (let i = 0; i <= 20; i++) { const a = (i / 20) * TAU; sun.push([pu0 + W_ * 0.8 + Math.cos(a) * W_ * 0.06, pv0 + H_ * 0.24 + Math.sin(a) * H_ * 0.09]); }
    G.add(lineUV(sun), { a: 0.7 });
    // Inspector dials beside the preview (laptop) or under it (phone).
    const dials = phone ? [[0.08, 0.47, 0.92], [0.08, 0.51, 0.92]] : [[0.66, 0.14, 0.95], [0.66, 0.26, 0.95], [0.66, 0.38, 0.95], [0.66, 0.5, 0.95]];
    dials.forEach(([a, v, b], i) => {
      G.add(lineUV([[a, v], [b, v]]), { a: 0.6 });
      const k = 0.5 + 0.38 * Math.sin(t * (0.7 + i * 0.23) + i * 1.9), kx = lerp(a, b, k);
      G.add(lineUV([[kx - 0.012, v - 0.025], [kx + 0.012, v - 0.025], [kx + 0.012, v + 0.025], [kx - 0.012, v + 0.025], [kx - 0.012, v - 0.025]]), { ch: i === 1 ? 1 : 0 });
    });
    // Tracks with clips, a waveform and a running playhead.
    const tv = phone ? 0.58 : 0.63, th = phone ? 0.07 : 0.075, gap = phone ? 0.03 : 0.035;
    G.add(lineUV([[0.04, tv], [0.96, tv]]), { a: 0.6 });
    for (let k = 0; k <= 20; k++) { const x = 0.04 + (0.92 * k) / 20; G.add(lineUV([[x, tv], [x, tv - (k % 5 ? 0.012 : 0.024)]]), { a: 0.5, w: 1.2 * u }); }
    const rows = [[[0.04, 0.22], [0.27, 0.25, 1], [0.54, 0.42]], [[0.1, 0.3], [0.44, 0.34]]];
    rows.forEach((clips, r) => clips.forEach(([a, w, hotc]) => {
      const y = tv + 0.02 + r * (th + gap);
      G.add(R(a, y, a + w - 0.01, y + th), { ch: hotc ? 1 : 0, a: hotc ? 1 : 0.8 });
    }));
    const wy = tv + 0.02 + 2 * (th + gap) + th / 2, wave = [];
    for (let i = 0; i <= 90; i++) { const x = 0.04 + (0.92 * i) / 90, a = (Math.sin(i * 0.9) * 0.6 + Math.sin(i * 0.37) * 0.4) * th * 0.45 * (0.4 + 0.6 * Math.abs(Math.sin(i * 0.11))); wave.push([x, wy + (i % 2 ? a : -a)]); }
    G.add(lineUV(wave), { a: 0.75, w: 1.3 * u });
    G.end();
    if (q >= 1) {
      const px = 0.04 + 0.92 * frac(t * 0.12 + 0.3);
      group(B, 1, { ch: 1, w: 2 * u, glint: false }).add(lineUV([[px, tv - 0.03], [px, wy + th * 0.6]])).end();
    }
    return [M((pu0 + pu1) / 2, (pv0 + pv1) / 2), M(0.27 + 0.12, tv + 0.02 + th / 2), M(0.7, wy)];
  }
  function object(B, b, p, d) {
    const { S, u, t } = B, tall = S.tall, phone = d.kind === "phone";
    let anchors;
    const turn = Math.sin(t * 0.5) * 0.12;
    if (!phone) {
      const s = tall ? Math.min(b.w * 0.42, b.h * 0.3) : Math.min(b.h * 0.56, b.w * 0.22);
      const cx = tall ? b.x + b.w * 0.5 : b.x + b.w * 0.3, cy = tall ? b.y + s * 1.35 : b.y + b.h * 0.5 + s * 0.5;
      const P = cam3(cx, cy, s, -0.42 + turn, 0.3, 4.5);
      const E = (pts) => pts.flatMap(([x, y, z]) => P(x, y, z));
      const G = group(B, span(p, 0, 0.4), { w: 2.6 * u, seed: 0.05, tail: 280 });
      const bw = 1, bd = 0.7, bt = 0.06;
      G.add(E([[-bw, bt, -bd], [bw, bt, -bd], [bw, bt, bd], [-bw, bt, bd], [-bw, bt, -bd]]));
      G.add(E([[-bw, 0, bd], [bw, 0, bd], [bw, 0, -bd]]), { a: 0.7 });
      G.add(E([[-bw, 0, bd], [-bw, bt, bd]])).add(E([[bw, 0, bd], [bw, bt, bd]])).add(E([[bw, 0, -bd], [bw, bt, -bd]]));
      const la = (104 * Math.PI) / 180, lh = 1.28, dy = Math.sin(la), dz = Math.cos(la);
      const lid = (x, v) => [x, bt + v * dy, -bd + v * dz];
      G.add(E([lid(-bw, 0), lid(-bw, lh), lid(bw, lh), lid(bw, 0)]));
      G.add(E([lid(-bw + 0.02, 0.02), lid(-bw + 0.02, lh - 0.02), lid(bw - 0.02, lh - 0.02), lid(bw - 0.02, 0.02)]), { a: 0.35, w: 1.2 * u });
      G.end();
      // Keys and trackpad on the deck.
      const K = group(B, span(p, 0.15, 0.5), { a: 0.5, w: 1.3 * u, glint: false, retrace: false });
      for (let r = 0; r < 4; r++) for (let c = 0; c < 12; c++) {
        const x0 = -0.86 + c * 0.145, z0 = -0.62 + r * 0.13;
        K.add(E([[x0, bt, z0], [x0 + 0.12, bt, z0], [x0 + 0.12, bt, z0 + 0.105], [x0, bt, z0 + 0.105], [x0, bt, z0]]));
      }
      K.add(E([[-0.42, bt, -0.1], [0.42, bt, -0.1], [0.42, bt, -0.0], [-0.42, bt, 0], [-0.42, bt, -0.1]]));
      K.add(E([[-0.34, bt, 0.12], [0.34, bt, 0.12], [0.34, bt, 0.58], [-0.34, bt, 0.58], [-0.34, bt, 0.12]]), { a: 0.7 });
      K.end();
      const M = (uu, vv) => P(-0.9 + 1.8 * uu, bt + (lh - 0.08 - (lh - 0.16) * vv) * dy, -bd + (lh - 0.08 - (lh - 0.16) * vv) * dz);
      anchors = deviceScreen(B, M, span(p, 0.3, 0.66), t, false);
    } else {
      const s = tall ? Math.min(b.h * 0.26, b.w * 0.42) : Math.min(b.h * 0.46, b.w * 0.2);
      const cx = tall ? b.x + b.w * 0.5 : b.x + b.w * 0.27, cy = tall ? b.y + s * 2.1 : b.y + b.h * 0.5 + s;
      const P = cam3(cx, cy, s, -0.45 + turn, 0.12, 5);
      const E = (pts) => pts.flatMap(([x, y, z]) => P(x, y, z));
      const hw = 0.5, hh = 2, th = 0.07;
      const face = (z, i) => { const p = []; for (const [x, y] of [[-hw, 0.1], [-hw, hh - 0.1], [-hw + 0.03, hh - 0.03], [-hw + 0.1, hh], [hw - 0.1, hh], [hw - 0.03, hh - 0.03], [hw, hh - 0.1], [hw, 0.1], [hw - 0.03, 0.03], [hw - 0.1, 0], [-hw + 0.1, 0], [-hw + 0.03, 0.03], [-hw, 0.1]]) p.push(...P(x, y, z)); void i; return p; };
      const G = group(B, span(p, 0, 0.4), { w: 2.6 * u, seed: 0.05, tail: 260 });
      G.add(face(th, 0)).add(face(-th, 1), { a: 0.55 });
      for (const [x, y] of [[-hw, 0.1], [hw, 0.1], [-hw, hh - 0.1], [hw, hh - 0.1]]) G.add(E([[x, y, th], [x, y, -th]]), { a: 0.6 });
      G.add(E([[-0.44, 0.08, th], [0.44, 0.08, th], [0.44, 1.92, th], [-0.44, 1.92, th], [-0.44, 0.08, th]]), { a: 0.45, w: 1.4 * u });
      G.add(E([[-0.09, 1.85, th], [0.09, 1.85, th]]), { w: 3 * u });
      G.add(E([[hw, 1.5, 0.02], [hw, 1.3, 0.02]]), { w: 3 * u }).add(E([[hw, 1.15, 0.02], [hw, 1.0, 0.02]]), { w: 3 * u });
      G.end();
      const M = (uu, vv) => P(-0.42 + 0.84 * uu, 1.86 - 1.72 * vv, th);
      anchors = deviceScreen(B, M, span(p, 0.3, 0.66), t, true);
    }
    // Callouts: dot, elbow leader, index and label.
    const labels = d.callouts || [];
    labels.forEach((label, i) => {
      if (!label) return;
      const q = span(p, 0.5 + i * 0.1, 0.74 + i * 0.1);
      if (q <= 0) return;
      const [ax, ay] = anchors[i], ch = i === 1 ? 1 : 0;
      let lx, ly, ls;
      if (tall) { lx = b.x + 70 * u; ly = b.y + b.h - 300 * u + i * 120 * u; ls = fitSize(label, b.w - 90 * u, 50 * u, 40 * u); }
      else { lx = b.x + b.w * 0.6; ly = b.y + 90 * u + i * ((b.h - 140 * u) / 2.2); ls = fitSize(label, b.x + b.w - lx - 10 * u, 50 * u, 40 * u); }
      const G = group(B, q, { ch, seed: 0.2 * i, tail: 160 });
      const ex = lx - 40 * u, ey = ly - 18 * u, gx = b.x + 10 * u + i * 16 * u;
      G.add(circle(ax, ay, 9 * u), { w: 2.2 * u });
      G.add(tall ? [ax - 9 * u, ay, gx, ay, gx, ey, lx - 14 * u, ey] : [ax + 9 * u, ay, ax + (ex - ax) * 0.55, ey, ex, ey], { w: 1.8 * u, a: 0.85 });
      G.text(String(i + 1).padStart(2, "0"), lx, ly - 50 * u, 26 * u, { a: 0.65 });
      G.text(label, lx, ly, ls);
      G.end();
      const pulse = frac(t * 0.8 + i * 0.33);
      if (q >= 1) group(B, 1, { ch, a: (1 - pulse) * 0.7, w: 1.5 * u, glint: false }).add(circle(ax, ay, 9 * u + pulse * 26 * u)).end();
    });
  }

  // ---- people: original line portraits, linked by signals --------------------------------------------------------
  function bust(B, x, base, r, kind, t, hot, q, i) {
    const { u } = B, ch = hot ? 1 : 0;
    const bob = Math.sin(t * 1.4 + i * 2.1) * 0.05 * r, tilt = Math.sin(t * 0.9 + i * 1.3) * 0.06;
    const hx = x + Math.sin(tilt) * r * 0.6, hy = base - 2.95 * r + bob;
    const G = group(B, q, { ch, w: 2.6 * u, seed: i * 0.17, tail: 180 });
    const sh = chaikin([[x - 2.15 * r, base], [x - 2.05 * r, base - 1.0 * r], [x - 1.0 * r, base - 1.5 * r], [x + 1.0 * r, base - 1.5 * r], [x + 2.05 * r, base - 1.0 * r], [x + 2.15 * r, base]], false, 3);
    G.add(sh.flat());
    G.add(seg(x - 0.34 * r, base - 1.5 * r, hx - 0.34 * r, hy + 0.85 * r)).add(seg(x + 0.34 * r, base - 1.5 * r, hx + 0.34 * r, hy + 0.85 * r));
    G.add([x - 0.55 * r, base - 1.48 * r, x, base - 0.9 * r, x + 0.55 * r, base - 1.48 * r], { a: 0.8 });
    G.add(arc(hx, hy, 0.86 * r, 1.0 * r, 0, TAU, 5));
    // Hair or hat, by character.
    const k = kind % 6;
    if (k === 0) G.add(fn((s) => { const a = Math.PI * (1.05 + 0.9 * s); return [hx + Math.cos(a) * 0.95 * r, hy + Math.sin(a) * 1.1 * r + (s > 0.15 && s < 0.85 ? Math.sin(s * 40) * 0.05 * r : 0)]; }, 60));
    if (k === 1) { G.add(circle(hx, hy - 1.25 * r, 0.32 * r)); G.add(arc(hx, hy - 0.05 * r, 0.9 * r, 1.0 * r, Math.PI * 1.08, Math.PI * 1.92)); }
    if (k === 2) G.add(fn((s) => { const a = Math.PI * (0.95 + 1.1 * s), rr = 1.02 * r + Math.abs(Math.sin(s * Math.PI * 9)) * 0.16 * r; return [hx + Math.cos(a) * rr, hy + Math.sin(a) * rr * 1.08]; }, 120));
    if (k === 3) { G.add(arc(hx, hy - 0.25 * r, 0.92 * r, 0.85 * r, Math.PI, TAU)); G.add([hx - 0.92 * r, hy - 0.25 * r, hx + 1.5 * r, hy - 0.22 * r]); }
    if (k === 4) G.add(fn((s) => { const a = Math.PI * (0.55 + 1.9 * s); const rr = s < 0.12 || s > 0.88 ? 1 : 1.05; return [hx + Math.cos(a) * 0.98 * r * rr, hy + Math.sin(a) * 1.12 * r + (s < 0.12 ? (0.12 - s) * 6 * r : s > 0.88 ? (s - 0.88) * 6 * r : 0)]; }, 90));
    if (k === 5) { G.add(arc(hx, hy, 0.95 * r, 1.1 * r, Math.PI * 1.1, Math.PI * 1.95)); G.add([hx - 0.7 * r, hy - 0.75 * r, hx + 0.25 * r, hy - 0.45 * r, hx + 0.9 * r, hy - 0.5 * r]); }
    // Face: eyes that blink, a mouth that talks when this is the speaker.
    const blink = frac(t / 3.3 + i * 0.37) < 0.05;
    for (const sx of [-0.32, 0.32]) {
      if (blink) G.add(seg(hx + sx * r - 0.1 * r, hy - 0.05 * r, hx + sx * r + 0.1 * r, hy - 0.05 * r));
      else G.add(circle(hx + sx * r, hy - 0.05 * r, 0.08 * r));
    }
    if (kind % 3 === 2) { G.add(circle(hx - 0.32 * r, hy - 0.05 * r, 0.22 * r), { a: 0.8 }).add(circle(hx + 0.32 * r, hy - 0.05 * r, 0.22 * r), { a: 0.8 }).add(seg(hx - 0.1 * r, hy - 0.05 * r, hx + 0.1 * r, hy - 0.05 * r), { a: 0.8 }); }
    const talk = hot ? Math.abs(Math.sin(t * 9)) * Math.abs(Math.sin(t * 2.3)) : 0;
    if (talk > 0.15) G.add(arc(hx, hy + 0.42 * r, 0.2 * r, 0.1 * r + talk * 0.12 * r, 0, TAU));
    else G.add(arc(hx, hy + 0.32 * r, 0.26 * r, 0.16 * r, 0.2, Math.PI - 0.2));
    // The speaker wears a headset.
    if (hot) { G.add(arc(hx, hy - 0.1 * r, 1.08 * r, 1.12 * r, Math.PI * 1.05, Math.PI * 1.95)); G.add(rect(hx - 1.18 * r, hy - 0.2 * r, 0.22 * r, 0.42 * r)); G.add([hx - 1.0 * r, hy + 0.2 * r, hx - 0.6 * r, hy + 0.62 * r, hx - 0.28 * r, hy + 0.62 * r]); }
    G.end();
    return { hx, hy, top: hy - 1.2 * r };
  }
  // Under each reviewer: a small trace window where a busy signal settles and a tick is written, again and again.
  function reviewStrip(B, cx, y, w, h, t, hot, q, i) {
    const { u } = B, ch = hot ? 1 : 0, x = cx - w / 2;
    const F = group(B, q, { ch, a: 0.75, w: 1.8 * u, seed: 0.3 + i * 0.13, glint: false });
    F.add(rrect(x, y, w, h, 10 * u));
    F.end();
    const M = group(B, q, { a: 0.16, w: 1 * u, glint: false, retrace: false });
    for (let k = 1; k < 3; k++) M.add(seg(x + 8 * u, y + (h * k) / 3, x + w - 8 * u, y + (h * k) / 3));
    for (let k = 1; k < 6; k++) M.add(seg(x + (w * k) / 6, y + 6 * u, x + (w * k) / 6, y + h - 6 * u));
    M.end();
    if (q < 1) return;
    // Each pass: the trace sweeps left to right, its noise dying away, then the tick is written at the end.
    const period = 2.4, ph = frac(t / period + i * 0.27), sweep = clamp(ph / 0.62), tw = w * 0.26, wx = w - tw - 22 * u;
    const cyy = y + h * 0.55, A = h * 0.32;
    const pts = fn((k) => {
      const calm = 1 - k, xx = x + 12 * u + wx * k;
      return [xx, cyy + A * calm * (0.6 * Math.sin(k * 38 + t * 7 + i) + 0.4 * Math.sin(k * 91 - t * 11))];
    }, 70);
    group(B, sweep, { ch, a: 0.9, w: 2 * u, glint: false, tip: 4 }).add(pts).end();
    const tq = span(ph, 0.62, 0.8), tx = x + w - tw - 8 * u, tk = Math.min(tw, h) * 0.62;
    const tick = [tx + tk * 0.1, cyy - tk * 0.05, tx + tk * 0.42, cyy + tk * 0.3, tx + tk * 1.02, cyy - tk * 0.5];
    const hold = 1 - span(ph, 0.9, 1);
    if (tq > 0) group(B, tq, { ch: 1, a: hold, w: 3 * u, glint: false, tip: 5 }).add(tick).end();
  }
  function people(B, b, p, d) {
    const { S, u, t } = B, tall = S.tall;
    const n = Math.max(2, Math.min(6, Math.round(d.count) || 3)), hiI = Math.min(n - 1, d.highlight ?? 1);
    const cols = tall ? (n <= 3 ? n : Math.ceil(n / 2)) : n, rows = Math.ceil(n / cols);
    const cellH = (b.h - (rows - 1) * 30 * u) / rows, slot = b.w / cols;
    const r = Math.min(slot * 0.215, (cellH - 290 * u) / 4.3);
    const heads = [];
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / cols), inRow = row === rows - 1 ? n - row * cols : cols, col = i - row * cols;
      const x = b.x + (b.w - inRow * slot) / 2 + slot * (col + 0.5), base = b.y + row * (cellH + 30 * u) + cellH - 250 * u;
      const q = span(p, 0.05 + i * 0.08, 0.45 + i * 0.08), hot = i === hiI;
      heads.push({ ...bust(B, x, base, r, i, t, hot, q, i), x, base, hot, q });
      reviewStrip(B, x, base + 128 * u, Math.min(slot * 0.78, 330 * u), 96 * u, t, hot, span(p, 0.4 + i * 0.08, 0.75 + i * 0.08), i);
      const label = (d.badges || [])[i % 3] || "";
      if (!label) continue;
      const ls = fitSize(label, slot * 0.9, 46 * u, 38 * u), lw = textW(label, ls), cap = ls * 0.72;
      const G = group(B, span(p, 0.3 + i * 0.08, 0.6 + i * 0.08), { ch: hot ? 1 : 0, seed: i * 0.11 });
      const by = base + 30 * u;
      G.add([x - lw / 2 - 18 * u, by + 10 * u, x - lw / 2 - 18 * u, by, x - lw / 2 - 6 * u, by], { a: 0.7, w: 1.8 * u });
      G.text(label, x, by + 18 * u + cap, ls, { align: "center" });
      G.add([x + lw / 2 + 6 * u, by + cap + 36 * u, x + lw / 2 + 18 * u, by + cap + 36 * u, x + lw / 2 + 18 * u, by + cap + 26 * u], { a: 0.7, w: 1.8 * u });
      G.end();
    }
    // Signals: arcs from the speaker to everyone else, with pulses riding them.
    const sp = heads[hiI];
    heads.forEach((h, i) => {
      if (i === hiI || h.q < 1 || sp.q < 1) return;
      const lift = (tall ? 120 : 90) * u + Math.abs(h.x - sp.x) * 0.12;
      const a = [sp.hx, sp.top - 10 * u], c = [h.hx, h.top - 10 * u], m = [(a[0] + c[0]) / 2, Math.min(a[1], c[1]) - lift];
      const curve = fn((k) => [(1 - k) * (1 - k) * a[0] + 2 * (1 - k) * k * m[0] + k * k * c[0], (1 - k) * (1 - k) * a[1] + 2 * (1 - k) * k * m[1] + k * k * c[1]], 60);
      const lq = span(p, 0.6, 0.85);
      const L = group(B, lq, { a: 0.35, w: 1.4 * u, glint: false, retrace: false });
      for (let j = 0; j < 60; j += 2) L.add(curve.slice(j * 2, (j + 2) * 2 + 2));
      L.end();
      if (lq >= 1) {
        const k = frac(t * 0.55 + i * 0.23), x = curve[Math.round(k * 60) * 2], y = curve[Math.round(k * 60) * 2 + 1];
        B.dots.push({ x, y, r: 5 * u, ch: 1, a: 0.95 });
        const kk = Math.round(Math.max(0, k - 0.12) * 60);
        group(B, 1, { ch: 1, a: 0.6, w: 2 * u, glint: false }).add(curve.slice(kk * 2, Math.round(k * 60) * 2 + 2)).end();
      }
    });
    if (sp.q >= 1) {
      // Speech rings opening beside the speaker.
      for (let k = 0; k < 3; k++) {
        const f = frac(t * 0.9 + k / 3), rr = r * (1.4 + f * 1.1);
        group(B, 1, { ch: 1, a: (1 - f) * 0.7, w: 2 * u, glint: false }).add(arc(sp.hx, sp.hy, rr, rr, -0.5, 0.5)).end();
      }
    }
  }

  // ---- process: a signal chain of three modules ------------------------------------------------------------
  function process(B, b, p, d) {
    const { S, u, t } = B, tall = S.tall, steps = d.steps || [], n = Math.max(1, steps.length);
    const gap = (tall ? 70 : 100) * u;
    const mw = tall ? b.w : (b.w - gap * (n - 1)) / n, mh = tall ? (b.h - gap * (n - 1)) / n : Math.min(b.h - 20 * u, mw * 1.15);
    const active = p >= 1 ? Math.floor(t * 0.8) % n : -1;
    const boxes = [];
    for (let i = 0; i < n; i++) {
      const x = tall ? b.x : b.x + i * (mw + gap), y = tall ? b.y + i * (mh + gap) : b.y + (b.h - mh) / 2;
      boxes.push({ x, y });
      const q = span(p, 0.05 + i * 0.16, 0.4 + i * 0.16), on = i === active, last = i === n - 1;
      const band = tall ? 96 * u : 120 * u, scr = { x: x + 24 * u, y: y + 62 * u, w: mw - 48 * u, h: mh - 62 * u - band - 10 * u };
      const G = group(B, q, { ch: last ? 1 : 0, a: on ? 1 : 0.85, w: 2.6 * u, seed: i * 0.19 });
      G.add(rrect(x, y, mw, mh, 22 * u));
      G.add(seg(x, y + mh - band, x + mw, y + mh - band), { a: 0.6, w: 1.4 * u });
      G.text(String(i + 1).padStart(2, "0"), x + 26 * u, y + 44 * u, 30 * u, { a: 0.75 });
      G.add(circle(x + mw - 34 * u, y + 33 * u, 9 * u), { a: on ? 1 : 0.4 });
      const lab = steps[i] || "", ls = fitSize(lab, mw - 50 * u, 50 * u, 38 * u);
      G.text(lab, x + mw / 2, y + mh - band / 2 + ls * 0.36, ls, { align: "center" });
      G.end();
      if (on) B.dots.push({ x: x + mw - 34 * u, y: y + 33 * u, r: 6 * u, ch: last ? 1 : 0, a: 0.9 });
      // Each module's screen: a small graticule and its own live signal.
      const iq = span(p, 0.2 + i * 0.16, 0.5 + i * 0.16);
      const M = group(B, iq, { a: 0.18, w: 1 * u, glint: false, retrace: false });
      for (let k = 1; k < 4; k++) M.add(seg(scr.x, scr.y + (scr.h * k) / 4, scr.x + scr.w, scr.y + (scr.h * k) / 4));
      for (let k = 1; k < 6; k++) M.add(seg(scr.x + (scr.w * k) / 6, scr.y, scr.x + (scr.w * k) / 6, scr.y + scr.h));
      M.end();
      const cy = scr.y + scr.h / 2, A = scr.h * 0.36;
      if (i % 3 === 0 && !last) {
        // Raw input: noisy and busy, with a read bracket scanning across it.
        const w = fn((k) => { const x = scr.x + scr.w * k; return [x, cy + A * (0.55 * Math.sin(k * 23 + t * 5) + 0.3 * Math.sin(k * 61 - t * 9) + 0.25 * (hash(Math.floor(k * 90) + Math.floor(t * 12)) - 0.5))]; }, 120);
        group(B, iq, { a: 0.9, w: 2 * u, glint: false }).add(w).end();
        if (iq >= 1) {
          const bx = scr.x + scr.w * (0.1 + 0.8 * (0.5 + 0.5 * Math.sin(t * 1.2))), bw2 = scr.w * 0.14;
          group(B, 1, { ch: 1, a: 0.85, w: 2 * u, glint: false }).add([bx - bw2 / 2 + 10 * u, scr.y + 8 * u, bx - bw2 / 2, scr.y + 8 * u, bx - bw2 / 2, scr.y + scr.h - 8 * u, bx - bw2 / 2 + 10 * u, scr.y + scr.h - 8 * u]).add([bx + bw2 / 2 - 10 * u, scr.y + 8 * u, bx + bw2 / 2, scr.y + 8 * u, bx + bw2 / 2, scr.y + scr.h - 8 * u, bx + bw2 / 2 - 10 * u, scr.y + scr.h - 8 * u]).end();
        }
      } else if (!last) {
        // Shaping: a carrier inside an envelope whose handles keep adjusting.
        const h1 = 0.55 + 0.3 * Math.sin(t * 1.1), h2 = 0.85 + 0.12 * Math.sin(t * 0.8 + 1);
        const env = (k) => A * (k < 0.5 ? lerp(0.15, h2, Math.sin(k * Math.PI)) : lerp(h1 * 0.4, h2, Math.sin(k * Math.PI)));
        const w = fn((k) => [scr.x + scr.w * k, cy + Math.sin(k * 30 - t * 4) * env(k)], 140);
        const E = group(B, iq, { a: 0.5, w: 1.4 * u, glint: false, retrace: false });
        for (let j = 0; j < 40; j += 2) { const k0 = j / 40, k1 = (j + 1) / 40; E.add(seg(scr.x + scr.w * k0, cy - env(k0), scr.x + scr.w * k1, cy - env(k1))); }
        E.end();
        group(B, iq, { a: 0.95, w: 2.2 * u, glint: false }).add(w).end();
        if (iq >= 1) {
          for (const k of [0.25, 0.5, 0.78]) {
            const hx = scr.x + scr.w * k, hy = cy - env(k);
            group(B, 1, { ch: 1, w: 2 * u, glint: false }).add(rect(hx - 8 * u, hy - 8 * u, 16 * u, 16 * u)).end();
          }
        }
      } else {
        // Output: a clean beat, and a tick that is written again and again.
        const w = fn((k) => [scr.x + scr.w * k, cy + scr.h * 0.3 + Math.sin(k * 14 - t * 3) * A * 0.18], 90);
        group(B, iq, { ch: 1, a: 0.7, w: 2 * u, glint: false }).add(w).end();
        const cs = Math.min(scr.w, scr.h) * 0.3, ccx = scr.x + scr.w / 2, ccy = cy - scr.h * 0.06;
        const redraw = iq >= 1 ? clamp(frac(t * 0.45) * 1.6) : iq;
        group(B, redraw, { ch: 1, w: 3.2 * u, glint: false, tip: 6 }).add([ccx - cs * 0.55, ccy, ccx - cs * 0.15, ccy + cs * 0.4, ccx + cs * 0.6, ccy - cs * 0.42]).end();
        group(B, iq, { ch: 1, a: 0.6, w: 1.8 * u }).add(circle(ccx, ccy, cs * 0.85)).end();
      }
    }
    // Wires between modules with packets travelling along them.
    for (let i = 0; i < n - 1; i++) {
      const A0 = boxes[i], wq = span(p, 0.3 + i * 0.16, 0.48 + i * 0.16);
      let x1, y1, x2, y2;
      if (tall) { x1 = x2 = A0.x + mw / 2; y1 = A0.y + mh + 8 * u; y2 = A0.y + mh + gap - 8 * u; }
      else { y1 = y2 = A0.y + mh * 0.42; x1 = A0.x + mw + 8 * u; x2 = A0.x + mw + gap - 8 * u; }
      const ang = Math.atan2(y2 - y1, x2 - x1);
      group(B, wq, { a: 0.8, w: 2.2 * u, glint: false }).add(seg(x1, y1, x2, y2)).add(arrowHead(x2, y2, ang, 16 * u)).end();
      if (wq >= 1) for (let k = 0; k < 2; k++) {
        const f = frac(t * 0.9 + k * 0.5 + i * 0.2), x = lerp(x1, x2, f), y = lerp(y1, y2, f);
        B.dots.push({ x, y, r: 5 * u, ch: 1, a: 0.9 * Math.sin(Math.PI * f) });
      }
    }
  }

  // ---- compare: two channels, each a sweeping trace with its count ------------------------------------------
  function compare(B, b, p, d) {
    const { S, u, t } = B, tall = S.tall;
    const L = Number(d.leftValue) || 0, Rv = Number(d.rightValue) || 0, mx = Math.max(L, Rv, 1);
    const gap = (tall ? 60 : 70) * u;
    const pw = tall ? b.w : (b.w - gap) / 2, ph = tall ? (b.h - gap) / 2 : b.h - 10 * u;
    [[d.left, L, 0], [d.right, Rv, 1]].forEach(([label, value, i]) => {
      const x = tall ? b.x : b.x + i * (pw + gap), y = tall ? b.y + i * (ph + gap) : b.y;
      const q = span(p, 0.02, 0.4), ch = i;
      const G = group(B, q, { ch, w: 2.4 * u, seed: i * 0.4 });
      G.add(rrect(x, y, pw, ph, 20 * u));
      const ls = fitSize(label || "", pw * 0.6, 50 * u, 40 * u);
      G.text(label || "", x + 32 * u, y + 30 * u + ls * 0.72, ls);
      G.text(`CH${i + 1}`, x + pw - 30 * u, y + 30 * u + 26 * 0.72 * u, 26 * u, { align: "right", a: 0.7 });
      G.end();
      const vq = span(p, 0.25 + i * 0.2, 0.6 + i * 0.2);
      const numY = y + (tall ? 210 : 230) * u, ns = Math.min(tall ? 132 * u : 138 * u, fitSize(fmt(value, d), pw * 0.55, 138 * u, 96 * u));
      if (vq > 0) {
        const N = group(B, clamp(vq * 3), { ch, glint: false });
        N.text(tally(value, ease(vq), d), x + 30 * u, numY, ns, { mono: true, w: 5 * u });
        N.end();
      }
      if (i === 1 && L > 0) {
        const pct = Math.round(((Rv - L) / L) * 100);
        group(B, span(p, 0.6, 0.85), { ch: 1, seed: 0.9 }).text(`${pct > 0 ? "+" : ""}${pct}%`, x + pw - 30 * u, numY, 60 * u, { align: "right" }).end();
      }
      // The trace window.
      const win = { x: x + 30 * u, y: numY + 40 * u, w: pw - 60 * u, h: y + ph - 30 * u - (numY + 40 * u) };
      if (win.h < 60 * u) return;
      const wq = span(p, 0.2 + i * 0.2, 0.5 + i * 0.2);
      const M = group(B, wq, { a: 0.2, w: 1 * u, glint: false, retrace: false });
      for (let k = 0; k <= 4; k++) M.add(seg(win.x, win.y + (win.h * k) / 4, win.x + win.w, win.y + (win.h * k) / 4));
      for (let k = 0; k <= 8; k++) M.add(seg(win.x + (win.w * k) / 8, win.y, win.x + (win.w * k) / 8, win.y + win.h));
      M.end();
      const pulses = Math.max(1, Math.min(24, Math.round((value / mx) * Math.min(24, Math.max(L, Rv)))));
      const cy = win.y + win.h * 0.62, A = win.h * 0.5, r = rng(31 + i * 7), amps = Array.from({ length: pulses }, () => 0.55 + r() * 0.45);
      const yAt = (k) => {
        const f = k * pulses, j = Math.min(pulses - 1, Math.floor(f)), g = f - j;
        if (i === 0) { const spike = g > 0.4 && g < 0.6 ? Math.sin(((g - 0.4) / 0.2) * Math.PI) : 0; return cy - spike * A * amps[j] + Math.sin(k * 140 + t * 7) * 3 * u; }
        return cy - Math.pow(Math.sin(Math.PI * g), 4) * A * 0.7 * amps[j];
      };
      const head = frac(t / 2.2 + i * 0.3), chunks = 24;
      for (let c = 0; c < chunks; c++) {
        const k0 = c / chunks, k1 = (c + 1) / chunks;
        if (k0 > wq) break;
        const age = frac(head - (k0 + k1) / 2), a = wq >= 1 ? 0.14 + 0.86 * Math.exp(-age * 3) : 0.85;
        group(B, 1, { ch, a, w: 2.6 * u, glint: false }).add(fn((k) => { const kk = lerp(k0, Math.min(k1, wq), k); return [win.x + win.w * kk, yAt(kk)]; }, 24)).end();
      }
      if (wq >= 1) B.dots.push({ x: win.x + win.w * head, y: yAt(head), r: 5.5 * u, ch, a: 1 });
    });
  }

  const DRAW = { chart, object, people, process, compare };
  const sceneOf = (id) => (ctx, S, box, p, d, info = {}) => {
    const B = List(S, info.t ?? 0);
    const P = plan(), first = !P || !P.shown.length || P.shown[0].id === id;
    // The opening scene is already partly written on its first frame; later ones start as the last is retraced.
    // A later scene starts writing once the beam has retraced half the outgoing drawing, then writes briskly.
    const lag = first ? -0.5 : 0.28 * (info.change || 0.45) - 0.12;
    let pp = clamp(((info.local ?? 0) - lag) / Math.max(0.7, Math.min(1.25, (info.hold || 3) * 0.4)));
    // Front-loaded: the structure lands fast, the detail settles in after.
    if (!first) pp = 1 - Math.pow(1 - pp, 1.7);
    if (info.exit !== undefined) { pp = 1; retrace(B, info.exit); }
    DRAW[id](B, box, pp, d || {}, info);
    render(ctx, B);
  };

  const TONE = {
    add: true, beam: [84, 255, 140], hot: [225, 255, 232], coreMix: 0.52, line: 0.95, bloom: 1.7, halo: 1.0, weight: 1.22,
    bezel: "#121513", glass: "#06110a", glassMid: "#0c1d12", glassEdge: "#020604", grat: "140,210,165", gratA: 0.1, grain: 1,
    glare: 0.05, vignette: 0.55, vigRGB: "0,0,0",
  };
  const glow = (rgb) => () => `0 0 4px rgba(${rgb},0.8), 0 0 18px rgba(${rgb},0.45), 0 0 40px rgba(${rgb},0.25)`;

  return {
    bg: "#06110a", panel: "rgba(96,255,150,0.05)", ink: "#a6ffc4", muted: "#5fbf83", accent: "#ffb547", onAccent: "#06110a",
    rule: "rgba(166,255,196,0.5)", track: "rgba(166,255,196,0.12)",
    display: FACE, displayWeight: 600, displayCase: "uppercase", displayTracking: "0.06em",
    body: FACE, bodyWeight: 500, figures: FACE, radius: 14, motion: "glow", change: "scan",
    kit: { line: 2.4, glow: 14, fill: "none", panel: "outline" },
    panelEdge: "rgba(96,255,150,0.5)",
    tone: TONE,
    keepArt: true,
    overlap: true,
    palettes: {
      // Plotter: a hard copy, deep teal lines on pale stock. Night: a blue-white tube. Mono: white phosphor.
      light: {
        bg: "#e4ece4", panel: "rgba(10,70,60,0.05)", ink: "#0d4a40", muted: "#4e7d72", accent: "#c8452c", onAccent: "#ffffff", rule: "rgba(13,74,64,0.6)", track: "rgba(13,74,64,0.1)", panelEdge: "rgba(13,74,64,0.45)",
        textShadow: () => "none", backdrop: () => "#c9d1c8",
        tone: { ...TONE, add: false, beam: [12, 86, 72], hot: [2, 30, 26], coreMix: 0.5, line: 0.95, bloom: 0.35, halo: 0.25, weight: 1.1, bezel: "#c9d1c8", glass: "#e6eee6", glassMid: "#eef5ee", glassEdge: "#d3ddd3", grat: "20,90,75", gratA: 0.13, grain: 1.4, glare: 0.12, vignette: 0.12, vigRGB: "60,80,70" },
      },
      dark: {
        bg: "#02050c", ink: "#cfe6ff", muted: "#6f8fb5", accent: "#ff8fc6", rule: "rgba(207,230,255,0.5)", track: "rgba(207,230,255,0.1)", panelEdge: "rgba(140,200,255,0.5)",
        textShadow: glow("140,200,255"), backdrop: () => "#0b0d12",
        tone: { ...TONE, beam: [120, 190, 255], hot: [240, 248, 255], bezel: "#0b0d12", glass: "#03060d", glassMid: "#081022", glassEdge: "#010205", grat: "150,180,230", gratA: 0.09, vignette: 0.6 },
      },
      mono: {
        bg: "#060606", panel: "rgba(255,255,255,0.05)", ink: "#f0f0f0", muted: "#9a9a9a", accent: "#ffffff", onAccent: "#060606", rule: "rgba(240,240,240,0.5)", track: "rgba(240,240,240,0.1)", panelEdge: "rgba(240,240,240,0.5)",
        textShadow: glow("230,230,230"), backdrop: () => "#141414",
        tone: { ...TONE, beam: [200, 204, 208], hot: [255, 255, 255], bezel: "#141414", glass: "#070707", glassMid: "#121212", glassEdge: "#020202", grat: "200,200,200", gratA: 0.08 },
      },
    },
    textShadow: glow("96,255,150"),
    backdrop: () => "#121513",
    // In the illustrated explainer every word is written by the beam, so the page's own type stays hidden there.
    css: () => "#root:has(> canvas#art) .scene .display, #root:has(> canvas#art) .scene .kicker { color: transparent !important; -webkit-text-fill-color: transparent !important; -webkit-text-stroke: 0 !important; text-shadow: none !important; }",
    paintOver: true,
    paint: (ctx, W, H, t, accent, look) => {
      ctx.clearRect(0, 0, W, H);
      const T = look.tone, u = Math.min(W, H) / 1080, R = screenOf(W, H, u);
      ctx.drawImage(overGlass(W, H, look), 0, 0);
      // A faint hum bar rolling slowly up the tube.
      ctx.save(); pathRR(ctx, R); ctx.clip();
      const y = R.y + R.h * (1 - frac(t * 0.07)), hb = R.h * 0.18;
      const gr = ctx.createLinearGradient(0, y - hb, 0, y + hb);
      const c = T.add ? "255,255,255" : "0,40,30";
      gr.addColorStop(0, `rgba(${c},0)`); gr.addColorStop(0.5, `rgba(${c},0.025)`); gr.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = gr; ctx.fillRect(R.x, y - hb, R.w, hb * 2);
      ctx.restore();
    },
    stage(ctx, S, info) {
      const B = List(S, info.t);
      if (S.paint) ctx.drawImage(background(S), 0, 0);
      readouts(B, info);
      const P = plan(), prev = P && info.index > 0 ? P.shown[info.index - 1] : null;
      // The leaving headline and title are retraced with their drawing through the change.
      if (prev && info.local < info.change) {
        const e = info.local / Math.max(0.01, info.change);
        const { W, H, tall, u } = S;
        if (HEAD[prev.id]) { retrace(B, e * 2.7); headline(B, prev.id, prev.hold, prev.hold); }
        else if (prev.id === "title") { retrace(B, e); titleArt(B, prev.hold, prev.hold); }
        B.erase = 0; B.fade = 1;
        void W; void H; void tall; void u;
      }
      if (HEAD[info.scene]) headline(B, info.scene, info.local, info.hold);
      else if (info.scene === "title") titleArt(B, info.local, info.hold);
      else if (info.scene === "closing") closingArt(B, info.local, info.hold);
      render(ctx, B);
    },
    scenes: { chart: sceneOf("chart"), object: sceneOf("object"), people: sceneOf("people"), process: sceneOf("process"), compare: sceneOf("compare") },
  };
});
