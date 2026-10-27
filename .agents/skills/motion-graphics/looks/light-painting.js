// Light Painting: a long-exposure night photograph. A tripod looks across dark country at a distant
// town and a road of car trails while star trails wheel overhead. Everything the scenes show is
// drawn in light by a moving wand, lettering included: words are written in single-stroke capitals
// by a travelling light point with a white-hot core, a coloured halo and a trail that cools behind
// it. Bars are filled by the wand sweeping up and down; people are single looping wand figures;
// steps are lit rings. Scene changes are a local shutter streak that smears the old drawing away.
// All geometry is original. Frames are pure functions of time: seeded randomness only.
window.DreamcutMotion.register("light-painting", ({ rng, hexA }) => {
  const M = window.DreamcutMotion;
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const smooth = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const stagger = (p, i, n, sp = 0.55) => ease((p - (i / Math.max(1, n)) * sp) / (1 - sp));
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const strHash = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100003; return h; };
  const FONT = "'Avenir Next', 'Avenir', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
  const NOW = { t: 0, alpha: 1 }; // alpha: the fade of the drawing being painted, which strokes multiply in

  const hex2 = (h) => { const n = parseInt(String(h).slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mixc = (a, b, k) => { const A = hex2(a), B = hex2(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, "0")).join(""); };
  const fmt = (v, d, k = 1) => M.formatNumber(v * k, Math.abs((Number(v) || 0) % 1) > 0.001 ? 1 : 0, (d && d.prefix) || "", (d && d.suffix) || "");

  function T(look, accent) {
    return { light: !!look.lightMode, comp: look.lightMode ? "source-over" : "lighter", hues: look.hues, accent, ink: look.ink, tex: look.texture };
  }
  const hue = (th, i) => th.hues[((i % th.hues.length) + th.hues.length) % th.hues.length];

  // ---- a path that can be drawn part-way, like a stroke the wand has only half finished ------------
  class Trail {
    constructor() { this.p = []; this.c = [0]; }
    get len() { return this.c[this.c.length - 1]; }
    M(x, y) { return this.L(x, y); }
    L(x, y) {
      const n = this.p.length;
      if (n) this.c.push(this.c[this.c.length - 1] + Math.hypot(x - this.p[n - 2], y - this.p[n - 1]));
      this.p.push(x, y);
      return this;
    }
    A(cx, cy, rx, ry, a0, a1) {
      const steps = Math.max(8, Math.ceil((Math.abs(a1 - a0) * Math.max(rx, ry)) / 5));
      for (let i = 0; i <= steps; i++) { const a = a0 + ((a1 - a0) * i) / steps; this.L(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry); }
      return this;
    }
    Q(x0, y0, cx, cy, x1, y1) {
      const steps = Math.max(10, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8));
      for (let i = 0; i <= steps; i++) { const k = i / steps, m = 1 - k; this.L(m * m * x0 + 2 * m * k * cx + k * k * x1, m * m * y0 + 2 * m * k * cy + k * k * y1); }
      return this;
    }
    poly(pts, close) { pts.forEach(([x, y]) => this.L(x, y)); if (close) this.L(pts[0][0], pts[0][1]); return this; }
    // A smooth line through points (Catmull-Rom).
    curve(pts, res = 8) {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[i + 1], d = pts[Math.min(pts.length - 1, i + 2)];
        const steps = Math.max(4, Math.ceil(Math.hypot(c[0] - b[0], c[1] - b[1]) / res));
        for (let s = i ? 1 : 0; s <= steps; s++) {
          const k = s / steps, k2 = k * k, k3 = k2 * k;
          this.L(0.5 * (2 * b[0] + (-a[0] + c[0]) * k + (2 * a[0] - 5 * b[0] + 4 * c[0] - d[0]) * k2 + (-a[0] + 3 * b[0] - 3 * c[0] + d[0]) * k3),
            0.5 * (2 * b[1] + (-a[1] + c[1]) * k + (2 * a[1] - 5 * b[1] + 4 * c[1] - d[1]) * k2 + (-a[1] + 3 * b[1] - 3 * c[1] + d[1]) * k3));
        }
      }
      return this;
    }
    RR(x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      this.L(x + r, y).L(x + w - r, y).A(x + w - r, y + r, r, r, -Math.PI / 2, 0).L(x + w, y + h - r).A(x + w - r, y + h - r, r, r, 0, Math.PI / 2);
      return this.L(x + r, y + h).A(x + r, y + h - r, r, r, Math.PI / 2, Math.PI).L(x, y + r).A(x + r, y + r, r, r, Math.PI, Math.PI * 1.5);
    }
    at(q) {
      const target = this.len * clamp(q), c = this.c, p = this.p;
      for (let i = 1; i < c.length; i++) {
        if (c[i] >= target) {
          const k = (target - c[i - 1]) / (c[i] - c[i - 1] || 1);
          const dx = p[2 * i] - p[2 * i - 2], dy = p[2 * i + 1] - p[2 * i - 1];
          return [p[2 * i - 2] + dx * k, p[2 * i - 1] + dy * k, Math.atan2(dy, dx)];
        }
      }
      const n = p.length;
      return [p[n - 2] || 0, p[n - 1] || 0, 0];
    }
    // Add the stretch from fraction a to b to the current path.
    path(g, a = 0, b = 1) {
      const L = this.len;
      if (L <= 0 || b <= a) return false;
      const s = L * a, e = L * b, c = this.c, p = this.p;
      let started = false;
      for (let i = 1; i < c.length; i++) {
        if (c[i] < s) continue;
        if (c[i - 1] > e) break;
        const x0 = p[2 * i - 2], y0 = p[2 * i - 1], x1 = p[2 * i], y1 = p[2 * i + 1], sl = c[i] - c[i - 1] || 1;
        const ta = clamp((s - c[i - 1]) / sl), tb = clamp((e - c[i - 1]) / sl);
        if (!started) { g.moveTo(x0 + (x1 - x0) * ta, y0 + (y1 - y0) * ta); started = true; }
        g.lineTo(x0 + (x1 - x0) * tb, y0 + (y1 - y0) * tb);
      }
      return started;
    }
  }

  // ---- light ---------------------------------------------------------------------------------------
  // A flare: hot centre, coloured falloff, optional cross spikes.
  function star(g, th, x, y, r, color, a = 1, spike = true) {
    if (a <= 0.01 || r <= 0.5) return;
    g.save();
    g.globalCompositeOperation = th.comp;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    if (th.light) { gr.addColorStop(0, hexA(color, 0.85 * a)); gr.addColorStop(0.4, hexA(color, 0.35 * a)); gr.addColorStop(1, hexA(color, 0)); }
    else { gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.18, hexA(mixc(color, "#ffffff", 0.55), 0.8 * a)); gr.addColorStop(0.5, hexA(color, 0.22 * a)); gr.addColorStop(1, hexA(color, 0)); }
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
    if (spike) {
      const L = r * 2.6, h = Math.max(1.2, r * 0.07);
      const lg = g.createLinearGradient(x - L, 0, x + L, 0);
      lg.addColorStop(0, hexA(color, 0)); lg.addColorStop(0.5, th.light ? hexA(color, 0.7 * a) : `rgba(255,255,255,${0.75 * a})`); lg.addColorStop(1, hexA(color, 0));
      g.fillStyle = lg; g.fillRect(x - L, y - h / 2, L * 2, h);
      const L2 = r * 1.5, vg = g.createLinearGradient(0, y - L2, 0, y + L2);
      vg.addColorStop(0, hexA(color, 0)); vg.addColorStop(0.5, th.light ? hexA(color, 0.55 * a) : `rgba(255,255,255,${0.5 * a})`); vg.addColorStop(1, hexA(color, 0));
      g.fillStyle = vg; g.fillRect(x - h / 2, y - L2, h, L2 * 2);
    }
    g.restore();
  }

  // A stroke of light, drawn up to fraction q. The tip is hot; the finished line is coloured.
  function beam(g, th, tr, q, color, w, o = {}) {
    if (q <= 0 || tr.len <= 0) return;
    const a = o.a ?? 1, from = o.from || 0;
    g.save();
    g.globalCompositeOperation = th.comp;
    g.lineCap = "round"; g.lineJoin = "round";
    const hot = mixc(color, "#ffffff", 0.4);
    const passes = th.light
      ? [[3, 0.1, color], [1.8, 0.3, color], [1.1, 0.95, color], [0.4, 0.9, "#ffffff"]]
      : [[8, 0.05, color], [4.4, 0.1, color], [2.3, 0.26, color], [1.25, 0.8, hot], [0.55, 1, "#ffffff"]];
    for (const [m, al, col] of passes) {
      g.beginPath();
      if (!tr.path(g, from, q)) continue;
      g.strokeStyle = col; g.globalAlpha = (al * a) * NOW.alpha; g.lineWidth = w * m; g.stroke();
    }
    if (q < 1 && o.hot !== false) {
      g.beginPath();
      if (tr.path(g, Math.max(from, q - 0.1), q)) { g.strokeStyle = "#ffffff"; g.globalAlpha = (0.65 * a) * NOW.alpha; g.lineWidth = w * 1.8; g.stroke(); }
    }
    g.restore();
    if (q < 1 && o.head !== false) { const [x, y] = tr.at(q); star(g, th, x, y, w * 6, color, a); }
  }

  // A bright dash that travels along a finished stroke, over and over.
  function flow(g, th, tr, k, len, color, w, a = 1) {
    const head = (((k % 1) + 1) % 1) * (1 + len), tail = head - len;
    if (head <= 0 || tail >= 1) return;
    g.save();
    g.globalCompositeOperation = th.comp; g.lineCap = "round"; g.lineJoin = "round";
    for (const [m, al, col] of [[4.5, 0.22, color], [2.2, 0.6, mixc(color, "#ffffff", 0.5)], [1, 0.95, "#ffffff"]]) {
      g.beginPath();
      if (!tr.path(g, clamp(tail), clamp(head))) continue;
      g.strokeStyle = col; g.globalAlpha = (al * a) * NOW.alpha; g.lineWidth = w * m; g.stroke();
    }
    g.restore();
    if (head < 1) { const [x, y] = tr.at(head); star(g, th, x, y, w * 4.5, color, 0.85 * a, false); }
  }

  // ---- the wand: several strokes laid down one after another by a single moving light ----------------
  // Brightness varies along the stroke (the wand moved unevenly) and flickers a little over time; the
  // freshest part behind the tip is white-hot and cools; once finished, a dim light point retraces it.
  function strokesLen(strokes) { let s = 0; for (const tr of strokes) s += tr.len; return s; }
  function strokesAt(strokes, dist) {
    let acc = 0;
    for (const tr of strokes) { if (acc + tr.len >= dist) return tr.at((dist - acc) / (tr.len || 1)); acc += tr.len; }
    const last = strokes[strokes.length - 1];
    return last ? last.at(1) : [0, 0, 0];
  }
  function strokesRange(g, strokes, d0, d1) {
    let acc = 0, any = false;
    for (const tr of strokes) {
      const L = tr.len;
      if (acc + L > d0 && acc < d1 && L > 0) any = tr.path(g, clamp((d0 - acc) / L), clamp((d1 - acc) / L)) || any;
      acc += L;
      if (acc >= d1) break;
    }
    return any;
  }
  function wand(g, th, strokes, q, color, w, o = {}) {
    if (!strokes.length || q <= 0) return;
    const total = strokesLen(strokes);
    if (total <= 0) return;
    const t = NOW.t, a = o.a ?? 1, seed = o.seed || 1, done = total * clamp(q), LV = 4;
    const chunk = o.chunk || Math.max(14, w * 9), flick = o.flicker ?? 1;
    const buckets = [[], [], [], []];
    let acc = 0, ci = 0;
    for (const tr of strokes) {
      if (acc >= done) break;
      const L = tr.len;
      if (L <= 0) continue;
      const end = Math.min(L, done - acc), n = Math.max(1, Math.ceil(end / chunk));
      for (let k = 0; k < n; k++) {
        const r = hash(seed * 0.37 + ci * 1.13);
        const b = 0.5 + 0.5 * r + 0.18 * flick * Math.sin(t * (1.3 + r * 1.7) + ci * 0.9);
        buckets[clamp(Math.floor(b * LV), 0, LV - 1)].push([tr, (k * end) / n / L, ((k + 1) * end) / n / L]);
        ci++;
      }
      acc += L;
    }
    const col = color, hot = mixc(color, "#ffffff", 0.45);
    const passes = th.light
      ? [[3.2, 0.1, col], [1.7, 0.3, col], [1, 0.95, mixc(col, th.ink, 0.25)], [0.36, 0.7, "#ffffff"]]
      : [[6.5, 0.055, col], [3.2, 0.14, col], [1.6, 0.5, hot], [0.62, 1, "#ffffff"]];
    g.save();
    // Butt ends inside the chunked passes, so neighbouring chunks meet without doubled dots.
    g.globalCompositeOperation = th.comp; g.lineCap = "butt"; g.lineJoin = "round";
    for (const [m, al, pc] of passes) {
      for (let lv = 0; lv < LV; lv++) {
        const list = buckets[lv];
        if (!list.length) continue;
        g.beginPath();
        for (const [tr, s0, s1] of list) tr.path(g, s0, s1);
        g.strokeStyle = pc; g.globalAlpha = (al * a * (0.42 + 0.58 * ((lv + 1) / LV))) * NOW.alpha; g.lineWidth = w * m * (0.8 + 0.2 * (lv / (LV - 1)));
        g.stroke();
      }
    }
    g.lineCap = "round";
    // The fresh trail behind the tip: white-hot, cooling with distance.
    if (q < 1) {
      const hl = Math.min(done, Math.max(w * 26, total * 0.06));
      for (let s = 0; s < 3; s++) {
        g.beginPath();
        if (!strokesRange(g, strokes, done - hl * (1 - s / 3), done)) continue;
        g.strokeStyle = s === 2 ? "#ffffff" : hot; g.globalAlpha = ((0.22 + 0.25 * s) * a) * NOW.alpha; g.lineWidth = w * (2.6 - s * 0.6); g.stroke();
      }
    }
    // Once finished, a light point slowly retraces the drawing.
    if (q >= 1 && o.retrace !== false) {
      const cyc = Math.max(2.2, total / (o.speed || 420)) * 1.5, ph = ((t + (o.phase ?? hash(seed) * 9)) % cyc) / cyc * 1.5;
      if (ph < 1) {
        const hd = total * ph, len = Math.min(total * 0.12, w * 40);
        g.beginPath();
        if (strokesRange(g, strokes, Math.max(0, hd - len), hd)) { g.strokeStyle = th.light ? col : "#ffffff"; g.globalAlpha = (0.55 * a) * NOW.alpha; g.lineWidth = w * 1.5; g.stroke(); }
        g.restore();
        const [x, y] = strokesAt(strokes, hd);
        star(g, th, x, y, w * 5, col, 0.75 * a, false);
        return;
      }
    }
    g.restore();
    if (q < 1 && o.head !== false) { const [x, y] = strokesAt(strokes, done); star(g, th, x, y, Math.max(w * 7, 14), col, a, true); }
  }

  // ---- single-stroke capitals for writing in light ---------------------------------------------------
  // Each glyph: [advance width, strokes]. Coordinates run 0..10 from cap line to baseline; "~" marks a
  // smooth stroke. Lower case is written as capitals, the way a wand writes.
  const GLYPHS = {
    A: [6, "0,10 3,0 6,10;1.2,6.6 4.8,6.6"],
    B: [5.6, "0,10 0,0;~0,0 3.4,0 4.9,1.2 4.9,3.4 3.4,4.8 0,4.8;~0,4.8 3.8,4.8 5.6,6.3 5.6,8.5 3.8,10 0,10"],
    C: [6, "~6,1.6 4.6,0.2 3,0 1,1 0,3.5 0,6.5 1,9 3,10 4.6,9.8 6,8.4"],
    D: [6, "0,10 0,0;~0,0 2.5,0 4.8,1 6,3.5 6,6.5 4.8,9 2.5,10 0,10"],
    E: [5.4, "5.4,0 0,0 0,10 5.4,10;0,4.8 4.2,4.8"],
    F: [5.2, "5.2,0 0,0 0,10;0,4.8 4,4.8"],
    G: [6.2, "~6,1.6 4.5,0.2 3,0 1,1 0,3.5 0,6.5 1,9 3,10 5,9.6 6.2,8 6.2,5.8;6.2,5.8 3.4,5.8"],
    H: [6, "0,0 0,10;6,0 6,10;0,4.9 6,4.9"],
    I: [1, "0.5,0 0.5,10"],
    J: [4.6, "~4.6,0 4.6,7 3.9,9.3 2.3,10 0.7,9.4 0,7.8"],
    K: [5.8, "0,0 0,10;5.6,0 0,6.2;1.9,4.3 5.8,10"],
    L: [5, "0,0 0,10 5,10"],
    M: [7.2, "0,10 0,0 3.6,7.2 7.2,0 7.2,10"],
    N: [6, "0,10 0,0 6,10 6,0"],
    O: [6.6, "~3.3,0 1,0.9 0,3.5 0,6.5 1,9.1 3.3,10 5.6,9.1 6.6,6.5 6.6,3.5 5.6,0.9 3.3,0 2.6,0.1"],
    P: [5.4, "0,10 0,0;~0,0 3.6,0 5.4,1.4 5.4,3.6 3.6,5.2 0,5.2"],
    Q: [6.6, "~3.3,0 1,0.9 0,3.5 0,6.5 1,9.1 3.3,10 5.6,9.1 6.6,6.5 6.6,3.5 5.6,0.9 3.3,0 2.6,0.1;4,7.4 6.8,10.6"],
    R: [5.6, "0,10 0,0;~0,0 3.6,0 5.4,1.4 5.4,3.6 3.6,5.2 0,5.2;2.8,5.2 5.6,10"],
    S: [5.6, "~5.4,1.4 4,0.1 2.4,0.1 0.6,1.2 0.4,3.1 2,4.5 4,5.4 5.6,7 5.4,9 3.6,10 1.6,9.9 0,8.6"],
    T: [6, "0,0 6,0;3,0 3,10"],
    U: [6, "~0,0 0,6.8 0.9,9.2 3,10 5.1,9.2 6,6.8 6,0"],
    V: [6.2, "0,0 3.1,10 6.2,0"],
    W: [8.4, "0,0 2.1,10 4.2,2 6.3,10 8.4,0"],
    X: [6, "0,0 6,10;6,0 0,10"],
    Y: [6, "0,0 3,5 6,0;3,5 3,10"],
    Z: [6, "0,0 6,0 0,10 6,10"],
    0: [5.6, "~2.8,0 0.8,1 0,4 0,6 0.8,9 2.8,10 4.8,9 5.6,6 5.6,4 4.8,1 2.8,0"],
    1: [3, "0.2,2.2 2.6,0 2.6,10"],
    2: [5.6, "~0.2,2.1 1.4,0.4 3,0 4.6,0.6 5.4,2.2 5,4 3.4,5.8 0,10;0,10 5.6,10"],
    3: [5.6, "~0.2,1.3 1.8,0 3.6,0 5,1 5,3 3.6,4.6 2,4.7;~2,4.7 4,4.8 5.6,6.3 5.6,8.4 4,10 2,10 0,8.8"],
    4: [6, "4.6,10 4.6,0 0,7 6,7"],
    5: [5.6, "5.4,0 0.8,0 0.4,4.4;~0.4,4.4 2.4,3.8 4.4,4.2 5.6,5.8 5.6,8.2 4.2,9.8 2.2,10 0,9"],
    6: [5.6, "~5,0.6 3.4,0 1.6,0.6 0.4,2.8 0,5.6 0.4,8.4 2,10 3.8,10 5.4,8.8 5.6,7 4.8,5.4 3,4.8 1.2,5.4 0.2,6.8"],
    7: [5.6, "0,0 5.6,0 2,10"],
    8: [5.6, "~2.8,4.8 1,4 0.6,2.2 1.4,0.6 2.8,0 4.2,0.6 5,2.2 4.6,4 2.8,4.8 0.8,5.8 0,7.8 0.9,9.5 2.8,10 4.7,9.5 5.6,7.8 4.8,5.8 2.8,4.8"],
    9: [5.6, "~5.4,3.2 4.4,4.8 2.6,5 0.8,4.2 0.2,2.4 1,0.6 2.8,0 4.6,0.6 5.4,2.6 5.4,6 4.8,8.6 3.2,10 1.4,9.8 0.4,9"],
    ".": [1, "0.5,9.5 0.5,10"],
    ",": [1.2, "0.9,9.3 0.2,11.4"],
    "'": [1, "0.6,0 0.4,2.8"],
    "’": [1, "0.6,0 0.4,2.8"],
    "\"": [2.4, "0.5,0 0.4,2.8;1.9,0 1.8,2.8"],
    "!": [1, "0.5,0 0.5,7;0.5,9.5 0.5,10"],
    "?": [5, "~0.2,2 1.4,0.3 3,0 4.6,0.6 5,2.4 3.8,4 2.6,5 2.6,7;2.6,9.5 2.6,10"],
    "-": [3.6, "0,5.4 3.6,5.4"],
    "–": [5, "0,5.4 5,5.4"],
    "—": [7, "0,5.4 7,5.4"],
    ":": [1, "0.5,3.2 0.5,3.7;0.5,9.5 0.5,10"],
    ";": [1.2, "0.6,3.2 0.6,3.7;0.9,9.3 0.2,11.4"],
    "/": [4, "0,10.4 4,-0.4"],
    "+": [5, "0,5.2 5,5.2;2.5,2.7 2.5,7.7"],
    "%": [6.4, "0,10 6.4,0;~1.5,0 0.2,1.5 1.5,3 2.8,1.5 1.5,0;~4.9,7 3.6,8.5 4.9,10 6.2,8.5 4.9,7"],
    "$": [5.6, "~5.4,2 4,0.9 2.4,0.9 0.6,1.9 0.6,3.7 2,4.9 4,5.6 5.6,7 5.4,8.6 3.6,9.4 1.6,9.3 0,8.2;2.8,-0.6 2.8,10.6"],
    "&": [6.4, "~6.4,10 1.6,4.2 1.2,2 2.4,0.2 3.8,0.4 4.4,1.8 3.6,3.4 1,5.4 0,7.4 0.8,9.4 2.6,10 4.6,9.2 6,6.6"],
    "#": [6, "2,0 1,10;5,0 4,10;0,3.4 6,3.4;0,6.6 6,6.6"],
    "(": [2.4, "~2.4,-0.6 0.6,2.4 0,5 0.6,7.8 2.4,10.8"],
    ")": [2.4, "~0,-0.6 1.8,2.4 2.4,5 1.8,7.8 0,10.8"],
    "×": [4.6, "0,3 4.6,8;4.6,3 0,8"],
  };
  const GP = {};
  for (const [ch, [w, src]] of Object.entries(GLYPHS)) {
    GP[ch] = { w, strokes: src.split(";").map((s) => { const sm = s[0] === "~"; return { sm, pts: s.replace("~", "").trim().split(/\s+/).map((pr) => pr.split(",").map(Number)) }; }) };
  }
  const TRACK = 2.2, SPACE = 4.4;
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  const charW = (ch) => (ch === " " ? SPACE : GP[ch] ? GP[ch].w + TRACK : SPACE);
  const wordW = (wd) => { let w = 0; for (const ch of wd) w += charW(ch); return Math.max(0, w - TRACK); };

  // Break words into n lines with the longest line as short as possible (so no word sits alone).
  function balance(words, n) {
    const ww = words.map(wordW), m = words.length;
    const lineW = (i, j) => { let s = 0; for (let k = i; k < j; k++) s += ww[k] + (k > i ? SPACE + TRACK : 0); return s; };
    let best = null;
    const rec = (i, left, acc) => {
      if (left === 1) { const w = lineW(i, m), mx = Math.max(acc.max, w); if (!best || mx < best.max - 0.01) best = { max: mx, cuts: [...acc.cuts, m] }; return; }
      for (let j = i + 1; j <= m - left + 1; j++) { const w = lineW(i, j); if (best && w >= best.max) break; rec(j, left - 1, { max: Math.max(acc.max, w), cuts: [...acc.cuts, j] }); }
    };
    rec(0, n, { max: 0, cuts: [] });
    if (!best) return { max: lineW(0, m), lines: [words.join(" ")] };
    const lines = []; let i = 0;
    for (const j of best.cuts) { lines.push(words.slice(i, j).join(" ")); i = j; }
    return { max: best.max, lines };
  }
  function layoutText(s, cap, maxW, maxLines, minCap) {
    const words = norm(s).split(/\s+/).filter(Boolean);
    if (!words.length) return { cap, lines: [] };
    let c = cap;
    for (;;) {
      const unit = c / 10;
      for (let n = 1; n <= Math.min(maxLines, words.length); n++) {
        const b = balance(words, n);
        if (b.max * unit <= maxW || (n === Math.min(maxLines, words.length) && c <= minCap)) return { cap: c, lines: b.lines };
      }
      c = Math.max(minCap, c * 0.94);
    }
  }
  const SCACHE = new Map();
  // Strokes for text laid out at (x, baseline y of the first line). Hand-lean and a little wobble.
  function script(s, x, y, cap, o = {}) {
    const key = [s, x | 0, y | 0, cap.toFixed(1), o.align, o.maxW | 0, o.lines, (o.min || 0).toFixed(1), o.lh].join("|");
    const hit = SCACHE.get(key);
    if (hit) return hit;
    const lay = layoutText(s, cap, o.maxW || 1e9, o.lines || 1, o.min || cap);
    const c = lay.cap, unit = c / 10, lh = c * (o.lh || 1.62), strokes = [], seed = strHash(String(s));
    let wMax = 0;
    lay.lines.forEach((line, li) => {
      const lw = wordW(line) * unit;
      wMax = Math.max(wMax, lw);
      let cx = o.align === "center" ? x - lw / 2 : o.align === "right" ? x - lw : x;
      const by = y + li * lh;
      let ci = 0;
      for (const ch of line) {
        const gl = GP[ch];
        if (gl) {
          const bob = (hash(seed + ci * 3.1) - 0.5) * 0.5;
          gl.strokes.forEach((st, si) => {
            const pts = st.pts.map(([gx, gy], pi) => {
              const jx = (hash(seed + ci * 7.7 + si * 2.3 + pi * 0.71) - 0.5) * 0.28, jy = (hash(seed + ci * 5.3 + si * 1.9 + pi * 1.37) - 0.5) * 0.28;
              return [cx + (gx + (10 - gy) * 0.11 + jx) * unit, by - (10 - gy + bob + jy) * unit];
            });
            const tr = new Trail();
            if (st.sm) tr.curve(pts, Math.max(3, unit * 0.8)); else tr.poly(pts);
            if (tr.len < unit * 0.4) { const [px, py] = pts[pts.length - 1]; tr.L(px + unit * 0.15, py + unit * 0.15); }
            strokes.push(tr);
          });
        }
        cx += charW(ch) * unit; ci++;
      }
    });
    const out = { strokes, w: wMax, cap: c, lines: lay.lines.length, h: c + (lay.lines.length - 1) * lh };
    if (SCACHE.size > 600) SCACHE.clear();
    SCACHE.set(key, out);
    return out;
  }

  // Lettering written in light by a travelling point. `size` is the equivalent type size; the capital
  // height is 0.72 of it. Returns the width written.
  function say(g, th, s, x, y, size, o = {}) {
    s = String(s ?? "");
    const q = o.q ?? 1;
    if (!s.trim() || q <= 0) return 0;
    const cap = size * 0.72, by = o.base === "middle" ? y + cap / 2 : y;
    const sc = script(s, x, by, cap, { align: o.align, maxW: o.maxW, lines: o.lines || 1, min: (o.min || size * 0.8) * 0.72 });
    const w = Math.max(1.6, sc.cap * (o.weight ? 0.085 : 0.072));
    wand(g, th, sc.strokes, q, o.color || th.accent, w, { a: o.a, seed: strHash(s) + (x | 0), speed: o.speed || 520 * (cap / 40), chunk: Math.max(12, sc.cap * 0.5), retrace: o.retrace });
    return sc.w;
  }

  // Sparks that rise from a point and fade.
  function motes(g, th, x, y, t, n, seed, spread, height, color, u, a = 1) {
    const R = rng(seed);
    for (let j = 0; j < n; j++) {
      const r1 = R(), r2 = R(), r3 = R();
      const ph = (t * (0.28 + r3 * 0.25) + r1) % 1;
      const px = x + (r2 - 0.5) * spread + Math.sin(t * 1.9 + j) * 7 * u, py = y - ph * height;
      star(g, th, px, py, (3 + r3 * 4) * u, color, Math.sin(ph * Math.PI) * a, false);
    }
  }

  // ---- layout shared by the world and the scenes ---------------------------------------------------
  const horizon = (W, H) => H * (H > W * 1.15 ? 0.91 : 0.9);
  // Where drawings may stand: above the far skyline, so the town never shows through them.
  const floorY = (S) => horizon(S.W, S.H) - 64 * S.u;
  const HEAD = {};
  function headText(id) { const el = document.getElementById(id); return el ? String(el.textContent || "") : ""; }
  function headingLayout(S, scene) {
    const { W, H, u, tall } = S, side = (tall ? 90 : 140) * u, maxW = W - side * 2;
    const id = scene === "title" ? "title" : scene === "closing" ? "closing" : scene + "-title";
    const text = headText(id), kick = scene === "title" ? headText("kicker") : "";
    const key = scene + "|" + text + "|" + kick + "|" + W + "x" + H;
    if (HEAD[key]) return HEAD[key];
    let out;
    if (scene === "title") {
      const cap = (tall ? 82 : 92) * u, kc = 32 * u, gapK = kick ? kc + 50 * u : 0;
      const probe = script(text, 0, 0, cap, { maxW, lines: 3, min: 50 * u });
      const blockH = gapK + probe.h, top = (H - blockH) / 2;
      const k = kick ? script(kick, side, top + kc, kc, { maxW, lines: 1, min: 30 * u }) : null;
      const m = script(text, side, top + gapK + probe.cap, probe.cap, { maxW, lines: 3, min: probe.cap });
      out = { main: m, kick: k, rect: { x: side, y: top, w: Math.max(m.w, k ? k.w : 0), h: blockH } };
    } else if (scene === "closing") {
      const cap = (tall ? 78 : 84) * u;
      const probe = script(text, 0, 0, cap, { maxW, lines: 3, min: 48 * u, align: "center" });
      const top = H * (tall ? 0.3 : 0.27) - probe.h / 2;
      const m = script(text, W / 2, top + probe.cap, probe.cap, { maxW, lines: 3, min: probe.cap, align: "center" });
      out = { main: m, rect: { x: W / 2 - m.w / 2, y: top, w: m.w, h: m.h } };
    } else {
      const cap = (tall ? 60 : 56) * u, top = (tall ? 170 : 96) * u;
      const m = script(text, side, top + cap, cap, { maxW, lines: 2, min: 48 * u });
      out = { main: m, rect: { x: side, y: top, w: m.w, h: m.h } };
    }
    return (HEAD[key] = out);
  }
  // The area a scene draws into: from under its headline down to the floor.
  function areaFor(S, box, scene) {
    const hl = headingLayout(S, scene), top = text0(hl) ? hl.rect.y + hl.rect.h + 50 * S.u : box.y;
    const y = Math.min(box.y, top), bottom = floorY(S);
    return { x: box.x, y, w: box.w, h: Math.max(200 * S.u, bottom - y) };
  }
  const text0 = (hl) => hl && hl.main && hl.main.strokes.length > 0;

  // ---- the world: sky, star trails, town, road, a few lamps -----------------------------------------
  function paint(g, W, H, t, accent, look) {
    const th = T(look, accent), u = Math.min(W, H) / 1080, tex = look.texture, tall = H > W * 1.15;
    const hz = horizon(W, H);
    g.clearRect(0, 0, W, H);
    const sky = g.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, look.sky[0]); sky.addColorStop(0.62, look.sky[1]); sky.addColorStop(1, look.sky[2]);
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // Long, soft colour in the sky that drifts as the exposure runs.
    g.save(); g.globalCompositeOperation = th.comp;
    for (let k = 0; k < 3; k++) {
      const cx = W * (0.18 + 0.32 * k) + Math.sin(t * 0.17 + k * 2.1) * W * 0.07, cy = H * (0.2 + 0.2 * k) + Math.cos(t * 0.13 + k) * H * 0.04, rx = W * 0.5;
      g.save(); g.translate(cx, cy); g.scale(1, (H * (0.2 + 0.03 * k)) / rx);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
      gr.addColorStop(0, hexA(hue(th, k), th.light ? 0.18 : 0.13)); gr.addColorStop(1, hexA(hue(th, k), 0));
      g.fillStyle = gr; g.fillRect(-rx, -rx, rx * 2, rx * 2); g.restore();
    }
    g.restore();
    // Star trails: every star is an arc about the pole, with its head wheeling on.
    const R = rng(7), pole = [W * 0.76, H * 0.06], nStar = Math.round(170 * (0.4 + 0.6 * tex)), omega = 0.03;
    g.save(); g.globalCompositeOperation = th.comp; g.lineCap = "round";
    for (let i = 0; i < nStar; i++) {
      const r = lerp(0.1, 1.3, R()) * H, a0 = R() * TAU, mag = R(), col = mixc(hue(th, Math.floor(R() * 4)), th.light ? hue(th, 1) : "#ffffff", 0.45), len = lerp(0.07, 0.3, R());
      const head = a0 + omega * t, hx = pole[0] + Math.cos(head) * r, hy = pole[1] + Math.sin(head) * r;
      if (hy > hz || hx < -40 || hx > W + 40 || hy < -40) continue;
      const segs = 4;
      for (let s = 0; s < segs; s++) {
        g.beginPath(); g.arc(pole[0], pole[1], r, head - (len * (s + 1)) / segs, head - (len * s) / segs);
        g.strokeStyle = hexA(col, Math.pow((segs - s) / segs, 1.4) * (0.18 + 0.5 * mag) * (th.light ? 0.7 : 1));
        g.lineWidth = (0.8 + 1.5 * mag) * u; g.stroke();
      }
      if (mag > 0.72) { g.beginPath(); g.arc(hx, hy, (1.2 + mag) * u, 0, TAU); g.fillStyle = hexA(th.light ? hue(th, 1) : "#ffffff", 0.7); g.fill(); }
    }
    // Two meteors that cross the sky on their own cycles.
    for (let m = 0; m < 2; m++) {
      const period = 4.6 + m * 1.7, off = m * 2.3, tt = t + off, cyc = Math.floor(tt / period), f = (tt % period) / 0.9;
      if (f >= 1) continue;
      const Rm = rng(cyc * 31 + m * 7 + 5), sx = W * lerp(0.1, 0.8, Rm()), sy = H * lerp(0.03, 0.3, Rm()), dx = W * 0.22, dy = H * 0.1;
      const hx = sx + dx * f, hy = sy + dy * f, tx = hx - dx * 0.55, ty = hy - dy * 0.55;
      const lg = g.createLinearGradient(tx, ty, hx, hy);
      lg.addColorStop(0, hexA(hue(th, 0), 0)); lg.addColorStop(1, th.light ? hexA(hue(th, 1), 0.9) : "rgba(255,255,255,0.95)");
      g.strokeStyle = lg; g.lineWidth = 2.6 * u * Math.sin(f * Math.PI); g.beginPath(); g.moveTo(tx, ty); g.lineTo(hx, hy); g.stroke();
    }
    g.restore();
    // A few small out-of-focus lamps, kept low and faint.
    const Rb = rng(21), nB = Math.round(9 * (0.4 + 0.6 * tex));
    g.save(); g.globalCompositeOperation = th.comp;
    for (let i = 0; i < nB; i++) {
      const rad = lerp(7, 20, Rb()) * u, speed = (3 + Rb() * 7) * u, x0 = Rb() * (W + rad * 2), by = hz - lerp(0.02, 0.1, Rb()) * H, col = hue(th, Math.floor(Rb() * 4)), ph = Rb() * 6;
      const bx = ((x0 + t * speed) % (W + rad * 2)) - rad, a = (0.07 + 0.06 * Rb()) * (0.7 + 0.3 * Math.sin(t * (0.5 + (i % 5) * 0.2) + ph)) * (th.light ? 1.3 : 1);
      const bgr = g.createRadialGradient(bx, by, rad * 0.2, bx, by, rad);
      bgr.addColorStop(0, hexA(col, a)); bgr.addColorStop(0.85, hexA(col, a * 1.5)); bgr.addColorStop(1, hexA(col, 0));
      g.beginPath(); g.arc(bx, by, rad, 0, TAU); g.fillStyle = bgr; g.fill();
    }
    g.restore();
    const hgl = g.createLinearGradient(0, hz - H * 0.16, 0, hz + 4);
    hgl.addColorStop(0, hexA(th.light ? hue(th, 2) : th.accent, 0)); hgl.addColorStop(1, hexA(th.light ? hue(th, 2) : th.accent, th.light ? 0.24 : 0.18));
    g.save(); g.globalCompositeOperation = th.comp; g.fillStyle = hgl; g.fillRect(0, hz - H * 0.16, W, H * 0.16 + 4); g.restore();
    // The land: a low far town with lit windows, then near dark hills.
    const hill = (amp, ph, k, base) => { g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W + 8; x += 8) g.lineTo(x, base - (Math.sin(x * k + ph) * 0.5 + 0.5) * amp - (Math.sin(x * k * 2.3 + ph * 2) * 0.5 + 0.5) * amp * 0.4); g.lineTo(W, H); g.closePath(); };
    g.fillStyle = look.land[0]; hill(H * 0.018, 1, 0.004, hz); g.fill();
    const Rt = rng(41), townX0 = W * (tall ? 0.02 : 0.3), townX1 = W * 0.98;
    g.fillStyle = look.land[0];
    for (let x = townX0; x < townX1; x += lerp(16, 40, Rt()) * u) {
      const bw = lerp(16, 40, Rt()) * u, bh = (Math.pow(Rt(), 2) * 40 + 8) * u;
      g.fillRect(x, hz - bh, bw, bh + 4 * u);
      for (let wy = hz - bh + 5 * u; wy < hz - 3 * u; wy += 8 * u) for (let wx = x + 4 * u; wx < x + bw - 3 * u; wx += 7 * u) {
        const v = Rt();
        if (v < 0.5) continue;
        const on = 0.5 + 0.5 * Math.sin(t * (0.4 + v) + v * 40);
        g.fillStyle = hexA(v > 0.85 ? hue(th, 0) : th.light ? hue(th, 2) : "#ffcf7a", (0.4 + 0.55 * on) * (th.light ? 0.8 : 1));
        g.fillRect(wx, wy, 3 * u, 3.6 * u);
      }
      g.fillStyle = look.land[0];
    }
    star(g, th, townX0 + (townX1 - townX0) * 0.62, hz - 56 * u, 12 * u, "#ff4d4d", Math.sin(t * 2.4) > 0.3 ? 1 : 0.25, false);
    star(g, th, townX0 + (townX1 - townX0) * 0.27, hz - 46 * u, 10 * u, "#ff4d4d", Math.sin(t * 2.4 + 1.5) > 0.3 ? 1 : 0.25, false);
    g.fillStyle = look.land[1]; hill(H * 0.025, 3, 0.0026, hz + H * 0.045); g.fill();
    // The road, low in the foreground: cars become streaks; white heads one way, red tails the other.
    const road = (off) => {
      const tr = new Trail(), P = [[-0.05 * W, H * 1.01], [W * 0.3, H * 0.985], [W * 0.5, hz + H * 0.05], [W * 0.7, hz + H * 0.03]];
      for (let i = 0; i <= 44; i++) {
        const s = i / 44, m = 1 - s;
        const x = m * m * m * P[0][0] + 3 * m * m * s * P[1][0] + 3 * m * s * s * P[2][0] + s * s * s * P[3][0];
        const y = m * m * m * P[0][1] + 3 * m * m * s * P[1][1] + 3 * m * s * s * P[2][1] + s * s * s * P[3][1];
        tr.L(x, y + off * (1 - s * 0.9) * u);
      }
      return tr;
    };
    const laneA = road(-5), laneB = road(9);
    for (let c = 0; c < 11; c++) {
      const kA = (t * (0.07 + (c % 3) * 0.02) + c / 11) % 1, kB = 1 - ((t * (0.06 + (c % 4) * 0.015) + c / 11 + 0.3) % 1);
      for (const [tr, k, col, dir] of [[laneA, kA, th.light ? hue(th, 0) : "#d8f4ff", 1], [laneB, kB, "#ff3b4e", -1]]) {
        const w = (1 - k * 0.7) * 4.5 * u, tail = 0.2;
        const a0 = dir > 0 ? Math.max(0, k - tail) : k, a1 = dir > 0 ? k : Math.min(1, k + tail);
        g.save(); g.globalCompositeOperation = th.comp; g.lineCap = "round";
        for (const [m, al, cc] of [[7, 0.1, col], [3, 0.35, col], [1, 0.9, mixc(col, "#ffffff", 0.5)]]) {
          g.beginPath(); if (!tr.path(g, a0, a1)) continue;
          g.strokeStyle = cc; g.globalAlpha = al; g.lineWidth = w * m; g.stroke();
        }
        g.restore();
      }
    }
    // Fireflies.
    const Rf = rng(61), nF = Math.round(30 * (0.4 + 0.6 * tex));
    for (let i = 0; i < nF; i++) {
      const fx = Rf() * W + Math.sin(t * (0.3 + Rf()) + i) * 40 * u, fy = lerp(0.3, 0.97, Rf()) * H + Math.cos(t * (0.25 + Rf() * 0.4) + i) * 30 * u, tw = Math.pow(Math.max(0, Math.sin(t * (0.8 + Rf()) + i * 2.3)), 2), col = hue(th, i);
      star(g, th, fx, fy, lerp(5, 11, Rf()) * u, col, 0.15 + 0.6 * tw, false);
    }
    // Vignette and film grain.
    const vg = g.createRadialGradient(W / 2, H * 0.48, Math.min(W, H) * 0.35, W / 2, H * 0.48, Math.max(W, H) * 0.78);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, th.light ? "rgba(70,60,110,0.28)" : "rgba(0,0,0,0.6)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    const Rg = rng(1000 + Math.floor(t * 24)), nG = Math.round(520 * tex);
    g.fillStyle = th.light ? "rgba(40,30,80,0.09)" : "rgba(255,255,255,0.09)";
    for (let i = 0; i < nG; i++) g.fillRect(Rg() * W, Rg() * H, 1.4 * u, 1.4 * u);
  }

  // ---- scene drawers -------------------------------------------------------------------------------
  // The outgoing drawing smears away in the shutter streak; the incoming one is already lit at its start.
  const wrap = (fn, scene) => (g, S, box, p, d, info) => {
    NOW.t = info.t;
    const ex = info.exit || 0, th = T(S.look, S.accent), W = S.W, u = S.u, B = areaFor(S, box, scene);
    const run = (alpha, dx, blur = 0) => { g.save(); g.globalAlpha = (g.globalAlpha ?? 1) * alpha; NOW.alpha = g.globalAlpha; if (blur > 0.3) g.filter = `blur(${blur.toFixed(1)}px)`; g.translate(dx, 0); fn(g, S, B, ex > 0 ? 1 : 0.06 + 0.94 * p, d, info, th); g.restore(); NOW.alpha = 1; };
    if (ex > 0) {
      const fade = Math.pow(1 - ex, 1.6);
      for (let k = 0; k < 2; k++) run(fade * [1, 0.3][k], -(ex * ex * W * 0.04 + k * (ex * W * 0.02 + 3 * u)), k * ex * 10 * u);
    } else run(1, 0);
  };

  // A bar filled the way a wand fills it: sweeping up and down across its width, then a bright cap.
  function barStrokes(cx, base, pw, h, u, seed, t) {
    const n = Math.max(3, Math.round(pw / (22 * u))), dx = pw / n, r = dx / 2, top = base - h, bot = base - 12 * u;
    const tr = new Trail().M(cx - pw / 2 - 3 * u, bot + 10 * u);
    for (let k = 0; k < n; k++) {
      const x = cx - pw / 2 + k * dx, jt = (hash(seed + k * 3.3) - 0.5) * 7 * u, jb = (hash(seed + k * 5.1) - 0.5) * 6 * u;
      if (k % 2 === 0) { tr.L(x, Math.max(top + r, bot - r)); tr.A(x + r, top + r + jt, r, r * (1 + 0.2 * hash(seed + k)), Math.PI, TAU); tr.L(x + dx, Math.max(top + r, bot - r) + jb * 0.3); }
      else { tr.L(x, bot - r); tr.A(x + r, bot - r + jb, r, r, Math.PI, 0); }
    }
    const [ex, ey] = tr.at(1);
    tr.L(ex + 3 * u, ey + (n % 2 ? -12 : 12) * u);
    const wob = Math.sin(t * 1.1 + seed) * 3 * u;
    const capT = new Trail().curve([[cx - pw / 2 - 16 * u, top + 6 * u], [cx - pw / 2, top], [cx + pw / 2, top + wob * 0.3], [cx + pw / 2 + 18 * u, top - 5 * u]], 6 * u);
    return [tr, capT];
  }

  function chart(g, S, box, p, d, info, th) {
    const u = S.u, t = info.t, n = d.values.length, max = Math.max(...d.values, 1);
    const gap = box.w * 0.055, bw = (box.w - gap * (n + 1)) / n, base = box.y + box.h - 70 * u, hmax = base - box.y - 150 * u, w = 3.4 * u;
    // Still water below the baseline.
    const wg = g.createLinearGradient(0, base, 0, base + 70 * u);
    wg.addColorStop(0, hexA(th.accent, th.light ? 0.14 : 0.1)); wg.addColorStop(1, hexA(th.accent, 0));
    g.fillStyle = wg; g.fillRect(box.x - 40 * u, base, box.w + 80 * u, 70 * u);
    wand(g, th, [new Trail().curve([[box.x - 30 * u, base + 4 * u], [box.x + box.w * 0.5, base - 1 * u], [box.x + box.w + 30 * u, base + 2 * u]], 10 * u)], ease(p * 2.4), th.light ? hue(th, 1) : "#ffffff", w * 0.8, { seed: 3, a: 0.85 });
    const tops = d.values.map((value, i) => [box.x + gap + i * (bw + gap) + bw / 2, base - hmax * (value / max)]);
    d.values.forEach((value, i) => {
      const q = stagger(p, i, n, 0.5), hot = i === d.highlight, col = hot ? th.accent : hue(th, i % 2);
      const cx = tops[i][0], pw = Math.min(bw * 0.62, 190 * u), h = hmax * (value / max);
      if (q <= 0) return;
      // A soft glow the strokes throw on the air around them.
      const fq = ease(q * 1.4);
      g.save(); g.globalCompositeOperation = th.comp;
      const fg = g.createLinearGradient(0, base, 0, base - h);
      fg.addColorStop(0, hexA(col, (th.light ? 0.14 : 0.12) * fq)); fg.addColorStop(1, hexA(col, 0));
      g.fillStyle = fg; g.fillRect(cx - pw * 0.7, base - h, pw * 1.4, h);
      // Its reflection shivering on the water.
      const rh = Math.min(h * 0.3, 58 * u);
      for (let j = 0; j < 6; j++) {
        const ry = base + (j + 1) * (rh / 7) + 4 * u, sh = Math.sin(t * 2.2 + j * 1.3 + i) * pw * 0.1;
        g.strokeStyle = hexA(mixc(col, "#ffffff", 0.4), 0.32 * (1 - j / 6) * fq); g.lineWidth = 2 * u;
        g.beginPath(); g.moveTo(cx - pw * 0.45 + sh, ry); g.lineTo(cx + pw * 0.45 + sh, ry); g.stroke();
      }
      g.restore();
      wand(g, th, barStrokes(cx, base, pw, h, u, i * 17 + 5, t), ease(q), col, w * (hot ? 1.15 : 1), { seed: i * 13 + 2, speed: 2600 * u, chunk: 22 * u });
      const qt = span(q, 0.75, 1);
      if (qt > 0) {
        // Sparks where the cap crosses the last upstroke.
        star(g, th, cx + pw / 2, base - h, (hot ? 30 : 22) * u * (1 + 0.15 * Math.sin(t * 3 + i * 2)), col, qt, true);
        star(g, th, cx - pw / 2, base - h, 12 * u * (0.7 + 0.3 * Math.sin(t * 4 + i)), col, qt * 0.8, false);
      }
      const size = (hot ? 112 : 100) * u;
      if (q > 0.45) say(g, th, fmt(value, d, smooth(span(q, 0.45, 1))), cx, base - h - 34 * u, size, { align: "center", color: col, q: span(q, 0.45, 0.8), maxW: bw * 1.15, min: 96 * u, weight: 1 });
      say(g, th, d.labels[i] || "", cx, base + 60 * u, 50 * u, { align: "center", color: hot ? th.accent : hue(th, i % 2 + 2), q: span(q, 0.12, 0.6), maxW: bw * 1.1, min: 44 * u });
      if (q >= 1) motes(g, th, cx, base - h, t + i * 0.37, 5, 90 + i, pw, 90 * u, col, u, 0.8);
    });
    // A line of light joins the tops, high in the frame; the wand keeps re-drawing it.
    if (n > 1) {
      const pts = tops.map(([x, y]) => [x, y - 175 * u]);
      pts.unshift([box.x - 20 * u, pts[0][1] + 60 * u]); pts.push([box.x + box.w + 10 * u, pts[pts.length - 1][1] - 50 * u]);
      const arc = new Trail().curve(pts, 8 * u);
      const qa = ease(span(p, 0.7, 1));
      const redraw = qa >= 1 ? ((t * 0.22) % 1) : 0;
      wand(g, th, [arc], qa, mixc(th.accent, "#ffffff", 0.15), w * 0.85, { seed: 41, a: 0.75, retrace: false });
      if (qa >= 1) {
        flow(g, th, arc, redraw * 1.2, 0.22, th.accent, w * 0.9);
        tops.forEach(([x, y], i) => { const [ax, ay] = arc.at(0.12 + (0.76 * i) / Math.max(1, n - 1)); star(g, th, ax, ay, 9 * u, th.accent, 0.55 + 0.35 * Math.sin(t * 2.6 + i), false); });
        const [ex, ey, ang] = arc.at(1);
        beam(g, th, new Trail().M(ex - Math.cos(ang - 0.5) * 26 * u, ey - Math.sin(ang - 0.5) * 26 * u).L(ex, ey).L(ex - Math.cos(ang + 0.5) * 26 * u, ey - Math.sin(ang + 0.5) * 26 * u), 1, th.accent, w * 0.85, { head: false, a: 0.8 });
      }
    }
  }

  function object(g, S, box, p, d, info, th) {
    const u = S.u, t = info.t, phone = d.kind === "phone", tall = box.h > box.w * 1.05, w1 = 3.6 * u;
    let w, h, x, y;
    if (phone) { w = Math.min(box.w * 0.32, box.h * 0.48); h = w * 1.9; x = box.x + box.w * (tall ? 0.3 : 0.36) - w / 2; y = box.y + (box.h - h) / 2; }
    else if (tall) { w = Math.min(box.w * 0.92, box.h * 0.5); h = w * 0.62; x = box.x + (box.w - w) / 2; y = box.y + box.h * 0.03; }
    else { w = Math.min(box.w * 0.6, box.h * 1.3); h = w * 0.62; x = box.x + box.w * 0.06; y = box.y + (box.h - h - h * 0.12) / 2; }
    const pad = (phone ? 20 : 24) * u, sx = x + pad, sy = y + pad, sw = w - pad * 2, sh = h - pad * 2, rad = (phone ? 38 : 18) * u;
    const c0 = hue(th, 0), c1 = hue(th, 1), c2 = hue(th, 2);
    const q1 = ease(span(p, 0, 0.34)), q2 = ease(span(p, 0.28, 0.62)), q3 = ease(span(p, 0.42, 0.78));
    g.save(); g.globalCompositeOperation = th.comp;
    const sgd = g.createLinearGradient(sx, sy, sx + sw, sy + sh);
    sgd.addColorStop(0, hexA(c0, 0.1 * q1)); sgd.addColorStop(1, hexA(c1, 0.14 * q1));
    g.fillStyle = sgd; g.fillRect(sx, sy, sw, sh);
    g.restore();
    wand(g, th, [new Trail().RR(x, y, w, h, rad)], q1, c0, w1 * 1.1, { seed: 5, speed: 1600 * u });
    if (phone) {
      beam(g, th, new Trail().M(x + w * 0.38, y + pad * 0.5).L(x + w * 0.62, y + pad * 0.5), q1, c1, w1 * 0.7, { head: false });
      beam(g, th, new Trail().M(x + w * 0.4, y + h - pad * 0.45).L(x + w * 0.6, y + h - pad * 0.45), q1, c1, w1 * 0.7, { head: false });
    } else {
      wand(g, th, [new Trail().M(x, y + h).L(x - w * 0.06, y + h + h * 0.07).L(x + w * 1.06, y + h + h * 0.07).L(x + w, y + h)], ease(span(p, 0.12, 0.42)), c1, w1, { seed: 6 });
      beam(g, th, new Trail().M(x + w * 0.42, y + h + h * 0.035).L(x + w * 0.58, y + h + h * 0.035), ease(span(p, 0.3, 0.5)), c2, w1 * 0.6, { head: false });
    }
    // Preview: a lit frame of rolling light.
    const pv = { x: sx + sw * 0.08, y: sy + sh * 0.08, w: sw * 0.84, h: sh * 0.42 };
    if (q2 > 0) {
      g.save(); g.beginPath(); g.rect(pv.x, pv.y, pv.w * q2, pv.h); g.clip();
      g.globalCompositeOperation = th.comp;
      const pg = g.createLinearGradient(pv.x, pv.y, pv.x + pv.w, pv.y + pv.h);
      pg.addColorStop(0, hexA(th.accent, 0.22)); pg.addColorStop(0.5 + 0.2 * Math.sin(t * 0.9), hexA(c1, 0.22)); pg.addColorStop(1, hexA(c0, 0.26));
      g.fillStyle = pg; g.fillRect(pv.x, pv.y, pv.w, pv.h);
      for (let k = 0; k < 4; k++) {
        const wv = new Trail();
        for (let s = 0; s <= 28; s++) { const xx = pv.x + (pv.w * s) / 28; wv.L(xx, pv.y + pv.h * (0.22 + 0.19 * k) + Math.sin(xx * 0.022 / u + t * (1.6 + k * 0.4) + k * 1.7) * pv.h * 0.08); }
        beam(g, th, wv, 1, hue(th, k + 1), w1 * 0.5, { a: 0.8 });
      }
      star(g, th, pv.x + pv.w * (0.2 + 0.6 * ((t * 0.12) % 1)), pv.y + pv.h * 0.3, 20 * u, "#ffffff", 0.8, true);
      g.restore();
      beam(g, th, new Trail().RR(pv.x, pv.y, pv.w, pv.h, 8 * u), q2, th.accent, w1 * 0.7, { head: false });
    }
    // Tracks of clips scribbled in light, then a playhead that keeps scanning.
    const th3 = sh * 0.1, clips = [[0.08, 0.3], [0.4, 0.22], [0.65, 0.27]];
    for (let row = 0; row < 3; row++) {
      const ty = sy + sh * 0.6 + row * (th3 + sh * 0.04);
      clips.forEach(([cx0, cw], i) => {
        const shown = clamp((q3 - 0.15 - i * 0.12 - row * 0.05) * 3.2);
        if (shown <= 0) return;
        const col = row === 0 && i === 1 ? th.accent : hue(th, row + i);
        const bx = sx + sw * (cx0 + row * 0.03), bwid = sw * cw;
        const pts = [], zig = Math.max(3, Math.round(bwid / (30 * u)));
        for (let k = 0; k <= zig; k++) pts.push([bx + (bwid * k) / zig, k % 2 ? ty + th3 : ty]);
        wand(g, th, [new Trail().curve(pts, 5 * u)], shown, col, 2 * u, { seed: row * 9 + i, head: false, retrace: false, a: 0.85 });
      });
    }
    if (q3 > 0.55) {
      const px = sx + sw * (0.06 + 0.88 * ((t * 0.16) % 1)), y0 = sy + sh * 0.56, y1 = sy + sh * 0.98;
      beam(g, th, new Trail().M(px, y0).L(px, y1), 1, "#ffffff", w1 * 0.5, { head: false, a: 0.9 });
      star(g, th, px, y0, 14 * u, th.accent, 0.95, true);
    }
    // Callouts: a leader of light from a part of the device out to its label.
    const anchors = tall && !phone
      ? [[pv.x + pv.w * 0.2, pv.y + pv.h * 0.55], [sx + sw * 0.5, sy + sh * 0.66], [sx + sw * 0.8, sy + sh * 0.9]]
      : [[pv.x + pv.w * 0.7, pv.y + pv.h * 0.3], [sx + sw * 0.52, sy + sh * 0.66], [sx + sw * 0.2, sy + sh * 0.9]];
    const labelX = tall && !phone ? box.x + 24 * u : box.x + box.w * (phone ? (tall ? 0.56 : 0.62) : 0.72);
    d.callouts.forEach((label, i) => {
      const c = stagger(span(p, 0.4, 1), i, 3, 0.5);
      if (c <= 0 || !label) return;
      const [ax, ay] = anchors[i], col = i === 1 ? th.accent : hue(th, i + 1);
      let ly, tr, lw;
      if (tall && !phone) {
        ly = y + h + 150 * u + i * Math.min(190 * u, (box.y + box.h - (y + h) - 180 * u) / 2);
        lw = box.w - 48 * u;
        tr = new Trail().M(ax, ay).L(ax, ly - 50 * u).L(labelX + lw * 0.5, ly - 50 * u);
      } else {
        ly = box.y + box.h * (0.18 + i * 0.3); lw = box.x + box.w - labelX + 40 * u;
        tr = new Trail().M(ax, ay).L(lerp(ax, labelX - 20 * u, 0.5), ly).L(labelX - 20 * u, ly);
      }
      beam(g, th, tr, c, col, w1 * 0.8, { a: 0.95 });
      const pulse = (t * 0.7 + i * 0.3) % 1;
      g.save(); g.globalCompositeOperation = th.comp; g.strokeStyle = hexA(col, 0.6 * (1 - pulse)); g.lineWidth = 2 * u; g.beginPath(); g.arc(ax, ay, (8 + pulse * 28) * u, 0, TAU); g.stroke(); g.restore();
      star(g, th, ax, ay, 16 * u, col, 0.9, false);
      if (c >= 1) flow(g, th, tr, t * 0.55 + i * 0.33, 0.2, col, w1 * 0.8);
      say(g, th, label, labelX, ly, 50 * u, { base: "middle", color: col, q: span(c, 0.4, 1), maxW: lw, min: 44 * u, lines: 2, align: "left" });
    });
  }

  // One continuous wand figure: feet, legs, torso, both arms and a looping head in a single stroke,
  // with small overshoots at the ends. The wand-holder's right arm is raised.
  function figure(cx, base, s, t, i, raised) {
    const sw = Math.sin(t * 0.9 + i * 1.3) * s * 0.025, hipY = base - s * 0.43, neckY = base - s * 0.75, hr = s * 0.105, hcy = neckY - hr * 1.12;
    const handL = [cx - s * 0.25 + sw, base - s * 0.47 + Math.sin(t * 1.3 + i) * s * 0.03];
    const handR = raised ? [cx + s * 0.32, neckY - s * 0.2 + Math.sin(t * 3.1) * s * 0.02] : [cx + s * 0.25 + sw, base - s * 0.48 + Math.cos(t * 1.1 + i) * s * 0.03];
    const pts = [
      [cx - s * 0.23, base + s * 0.03], [cx - s * 0.17, base - s * 0.005], [cx - s * 0.06, hipY + s * 0.12], [cx + sw * 0.4, hipY],
      [cx + s * 0.07, hipY + s * 0.12], [cx + s * 0.18, base - s * 0.005], [cx + s * 0.13, base - s * 0.06], [cx + s * 0.03 + sw * 0.4, hipY - s * 0.02],
      [cx + sw * 0.6, base - s * 0.6], [cx + sw * 0.7, neckY + s * 0.02], [cx - s * 0.12 + sw * 0.7, neckY + s * 0.05], handL,
      [cx - s * 0.1 + sw * 0.7, neckY + s * 0.08], [cx + s * 0.12 + sw * 0.7, neckY + s * 0.05], handR, [cx + s * 0.08 + sw * 0.7, neckY + s * 0.07],
      [cx + sw * 0.8, neckY],
    ];
    const hx = cx + sw * 0.8;
    for (let k = 0; k <= 13; k++) { const a = Math.PI / 2 + (k / 12) * TAU, sp = 1 + Math.max(0, k - 12) * 0.35; pts.push([hx + Math.cos(a) * hr * (1 + 0.04 * Math.sin(k)) * sp, hcy + Math.sin(a) * hr * 1.12 * sp]); }
    return { tr: new Trail().curve(pts, Math.max(4, s * 0.02)), hip: [cx + sw * 0.4, hipY], neck: [cx + sw * 0.7, neckY + s * 0.04], handR, head: [hx, hcy] };
  }
  function ghost(g, th, cx, base, size, col, q, t, i, hot, u) {
    // A pool of light on the ground and a ripple that spreads from it.
    g.save(); g.globalCompositeOperation = th.comp; g.translate(cx, base); g.scale(1, 0.16);
    const pg = g.createRadialGradient(0, 0, 0, 0, 0, size * 0.5);
    pg.addColorStop(0, hexA(col, 0.32 * q)); pg.addColorStop(1, hexA(col, 0));
    g.fillStyle = pg; g.fillRect(-size * 0.5, -size * 0.5, size, size);
    const rp = (t * 0.5 + i * 0.31) % 1;
    g.strokeStyle = hexA(col, 0.45 * (1 - rp) * q); g.lineWidth = (3 * u / 0.16) * 0.4; g.beginPath(); g.ellipse(0, 0, size * (0.15 + 0.45 * rp), size * (0.15 + 0.45 * rp), 0, 0, TAU); g.stroke();
    g.restore();
    // An earlier pass of the same figure lingers faintly, offset, as in a long exposure.
    const echo = figure(cx - size * 0.05 - Math.sin(t * 0.7 + i) * size * 0.03, base, size, t - 0.8, i, hot);
    wand(g, th, [echo.tr], ease(q), col, 2 * u, { seed: i * 7 + 99, a: 0.28, head: false, retrace: false });
    const f = figure(cx, base, size, t, i, hot);
    wand(g, th, [f.tr], ease(q), col, 3.4 * u, { seed: i * 7 + 3, speed: 900 * u, chunk: 18 * u });
    if (q < 0.95) return;
    // Sparks where the stroke crosses itself.
    star(g, th, f.hip[0], f.hip[1], 11 * u * (0.8 + 0.3 * Math.sin(t * 3.3 + i)), col, 0.85, false);
    star(g, th, f.neck[0], f.neck[1], 9 * u * (0.8 + 0.3 * Math.sin(t * 2.7 + i * 2)), col, 0.8, false);
    if (hot) {
      // This one holds the wand: a figure-eight written in the air above the raised hand.
      const [hx, hyy] = f.handR, ptsN = 22;
      for (let k = ptsN; k >= 1; k--) {
        const ff = (tt) => [hx + Math.sin(tt * 3.1) * size * 0.18, hyy - size * 0.14 + Math.sin(tt * 6.2) * size * 0.09];
        const a = ff(t - k * 0.03), b = ff(t - (k - 1) * 0.03), al = Math.pow(1 - k / ptsN, 1.5);
        g.save(); g.globalCompositeOperation = th.comp; g.lineCap = "round";
        g.strokeStyle = hexA(col, 0.5 * al); g.lineWidth = 8 * u * al; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
        g.strokeStyle = hexA("#ffffff", 0.9 * al); g.lineWidth = 2.2 * u * al; g.stroke();
        g.restore();
      }
      star(g, th, hx + Math.sin(t * 3.1) * size * 0.18, hyy - size * 0.14 + Math.sin(t * 6.2) * size * 0.09, 22 * u, col, 1, true);
    } else {
      const a = t * 1.5 + i * 1.7;
      star(g, th, f.head[0] + Math.cos(a) * size * 0.2, f.head[1] - size * 0.06 + Math.sin(a) * size * 0.05, 9 * u, col, 0.85, false);
    }
  }
  function people(g, S, box, p, d, info, th) {
    const u = S.u, t = info.t, tall = box.h > box.w * 1.05, n = Math.max(2, Math.min(6, Math.round(d.count))), slot = box.w / n;
    // Tall frames stand the group in two staggered rows so the figures can be large.
    const base = box.y + box.h - 8 * u, size = tall ? Math.min((box.h - 140 * u) / 1.62, slot * 2.5) : Math.min((box.h - 110 * u) / 1.02, slot * 1.2);
    wand(g, th, [new Trail().curve([[box.x - 20 * u, base + 3 * u], [box.x + box.w * 0.5, base - 2 * u], [box.x + box.w + 20 * u, base + 2 * u]], 10 * u)], ease(p * 2.2), th.light ? hue(th, 1) : "#ffffff", 2.6 * u, { seed: 8, a: 0.7 });
    const base0 = base;
    for (let i = 0; i < n; i++) {
      const q = stagger(p, i, n, 0.5), hot = i === Math.min(n - 1, d.highlight), cx = box.x + slot * (i + 0.5), base = base0 - (tall && i % 2 ? size * 0.58 : 0);
      const col = hot ? th.accent : hue(th, i % 2 === 0 ? 0 : 1);
      if (q > 0) ghost(g, th, cx, base, size * (hot ? 1.04 : 1), col, q, t, i, hot, u);
      // Each figure gets its own role; figures beyond the named roles stay unlabelled.
      const label = d.badges[i], stag = 0;
      if (q > 0.2 && label) {
        const ly = base - size * 1.04 - 30 * u - stag - (hot ? size * 0.08 : 0);
        const wd = say(g, th, label, cx, ly, 50 * u, { align: "center", color: col, q: span(q, 0.3, 0.9), maxW: slot * (stag ? 1.6 : 0.98), min: 44 * u });
        beam(g, th, new Trail().M(cx - wd / 2, ly + 18 * u).L(cx + wd / 2, ly + 18 * u), span(q, 0.6, 1), col, 2 * u, { head: false, a: 0.6 });
      }
    }
  }

  function iconTrails(kind, cx, cy, r) {
    const P = (...pts) => new Trail().poly(pts.map(([x, y]) => [cx + x * r, cy + y * r]));
    if (kind === 0) return [P([-0.55, -0.8], [0.15, -0.8], [0.55, -0.4], [0.55, 0.8], [-0.55, 0.8], [-0.55, -0.8]), P([0.15, -0.8], [0.15, -0.4], [0.55, -0.4]), P([-0.3, 0], [0.3, 0]), P([-0.3, 0.3], [0.15, 0.3])];
    if (kind === 1) { const pts = []; for (let k = 0; k <= 8; k++) { const a = (k * Math.PI) / 4 - Math.PI / 2, rr = k % 2 ? 0.28 : 0.95; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); } return [P(...pts)]; }
    if (kind === 2) { const hx = []; for (let k = 0; k <= 6; k++) { const a = (k * TAU) / 6; hx.push([Math.cos(a) * 0.4, Math.sin(a) * 0.4]); } return [new Trail().A(cx, cy, r * 0.85, r * 0.85, -Math.PI / 2, Math.PI * 1.5), P(...hx), P([0, -0.85], [0, -0.4]), P([0.74, 0.43], [0.35, 0.2]), P([-0.74, 0.43], [-0.35, 0.2])]; }
    return [P([-0.7, 0.05], [-0.22, 0.55], [0.75, -0.55])];
  }
  function process(g, S, box, p, d, info, th) {
    const u = S.u, t = info.t, n = d.steps.length, vertical = box.h > box.w, w = 4 * u;
    const cw = vertical ? box.w : ((box.w - 2 * box.w * 0.08) / n) * 0.8, ch = vertical ? (box.h / n) * 0.68 : Math.min(box.h * 0.72, cw * 1.05);
    const R = vertical ? Math.min(box.w * 0.2, (box.h / n) * 0.27) : Math.min(cw * 0.38, (box.h - 260 * u) * 0.36);
    const rc = [];
    for (let i = 0; i < n; i++) rc.push(vertical ? [box.x + box.w * 0.22, box.y + (box.h / n) * (i + 0.5)] : [box.x + (box.w * 0.08) / 2 + i * (box.w / n) + cw / 2, box.y + box.h * 0.46]);
    for (let i = 0; i < n; i++) {
      const q = stagger(p, i, n, 0.6), last = i === n - 1, col = last ? th.accent : hue(th, i);
      const [cx, cy] = rc[i];
      if (q > 0) {
        g.save(); g.globalCompositeOperation = th.comp;
        const dg = g.createRadialGradient(cx, cy, 0, cx, cy, R * 1.2);
        dg.addColorStop(0, hexA(col, 0.2 * clamp(q * 2))); dg.addColorStop(1, hexA(col, 0));
        g.fillStyle = dg; g.fillRect(cx - R * 1.3, cy - R * 1.3, R * 2.6, R * 2.6);
        g.restore();
        wand(g, th, [new Trail().A(cx, cy, R, R * 0.97, -Math.PI / 2, Math.PI * 1.56)], ease(q * 1.5), col, w * 1.05, { seed: i * 11 + 1, speed: 1400 * u });
        if (q > 0.5) for (let k = 0; k < 10; k++) {
          const a = (k / 10) * TAU + t * 0.5 * (i % 2 ? -1 : 1), rr = R * 1.28;
          star(g, th, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, (k % 3 === 0 ? 9 : 5) * u, col, clamp((q - 0.5) * 3) * (0.5 + 0.4 * Math.sin(t * 2 + k)), false);
        }
        const ic = iconTrails(last ? 3 : i % 3, cx, cy, R * 0.52);
        wand(g, th, ic, ease(span(q, 0.35, 0.95)), col, w * 0.85, { seed: i * 5 + 77, speed: 500 * u });
        const bob = Math.sin(t * 2.2 + i) * 4 * u;
        if (q >= 1) star(g, th, cx + R * 0.1, cy - R * 0.1 + bob, R * 0.5, col, 0.3, false);
        const num = String(i + 1).padStart(2, "0");
        if (vertical) {
          const lx = cx + R * 1.55;
          say(g, th, num, lx, cy - 40 * u, 50 * u, { color: th.accent, q: span(q, 0.4, 0.8) });
          say(g, th, d.steps[i], lx, cy + 44 * u, 56 * u, { color: col, q: span(q, 0.5, 1), maxW: box.x + box.w - lx, min: 44 * u, lines: 2 });
        } else {
          say(g, th, num, cx, cy - R * 1.28 - 26 * u, 50 * u, { align: "center", color: th.accent, q: span(q, 0.4, 0.8) });
          say(g, th, d.steps[i], cx, cy + R * 1.28 + 70 * u, 54 * u, { align: "center", color: col, q: span(q, 0.5, 1), maxW: cw * 1.15, min: 44 * u, lines: 2 });
        }
      }
      if (i < n - 1) {
        const a = stagger(p, i + 0.6, n, 0.6);
        if (a <= 0) continue;
        const [nx, ny] = rc[i + 1];
        const tr = vertical
          ? new Trail().Q(cx, cy + R * 1.3, cx + R * 0.8, (cy + ny) / 2, nx, ny - R * 1.45)
          : new Trail().Q(cx + R * 1.4, cy, (cx + nx) / 2, cy - R * 0.9, nx - R * 1.5, ny);
        beam(g, th, tr, a, th.accent, w * 0.9, { a: 0.95 });
        if (a >= 1) {
          const [ex, ey, ang] = tr.at(1);
          beam(g, th, new Trail().M(ex - Math.cos(ang - 0.5) * 26 * u, ey - Math.sin(ang - 0.5) * 26 * u).L(ex, ey).L(ex - Math.cos(ang + 0.5) * 26 * u, ey - Math.sin(ang + 0.5) * 26 * u), 1, th.accent, w * 0.9, { head: false });
          flow(g, th, tr, t * 0.6 + i * 0.4, 0.22, th.accent, w * 0.9);
        }
      }
    }
  }

  function compare(g, S, box, p, d, info, th) {
    const u = S.u, t = info.t, vertical = box.h > box.w * 1.1, gap = 60 * u, w = 4 * u;
    const cw = vertical ? box.w : (box.w - gap) / 2, ch = vertical ? (box.h - gap) / 2 : box.h, vmax = Math.max(d.leftValue, d.rightValue, 1);
    const cells = [[d.left, d.leftValue, hue(th, 1)], [d.right, d.rightValue, th.accent]], rcs = [];
    cells.forEach(([label, value, col], i) => {
      const q = stagger(p, i, 2, 0.4);
      const x = vertical ? box.x : box.x + i * (cw + gap), y = vertical ? box.y + i * (ch + gap) : box.y;
      const cx = x + cw / 2, cy = y + ch - 96 * u, R = Math.min(cw * 0.41, (cy - y - 30 * u) / 1.3), f = clamp(value / vmax);
      rcs.push([cx, cy, R]);
      if (q <= 0) return;
      g.save(); g.globalCompositeOperation = th.comp;
      const bg = g.createRadialGradient(cx, cy, 0, cx, cy, R * 1.5);
      bg.addColorStop(0, hexA(col, (0.14 + 0.05 * Math.sin(t * 1.6 + i)) * clamp(q * 2))); bg.addColorStop(1, hexA(col, 0));
      g.fillStyle = bg; g.fillRect(cx - R * 1.6, cy - R * 1.6, R * 3.2, R * 1.7); g.restore();
      beam(g, th, new Trail().A(cx, cy, R, R, Math.PI, TAU), ease(q * 1.6), col, w * 0.6, { a: 0.3, hot: false, head: false });
      for (let k = 0; k <= 12; k++) {
        const a = Math.PI + (k / 12) * Math.PI, tq = clamp(q * 2 - k / 12);
        if (tq <= 0) continue;
        const tw = 0.4 + 0.5 * Math.sin(t * 2.4 + k * 1.1 + i * 2);
        beam(g, th, new Trail().M(cx + Math.cos(a) * R * 1.1, cy + Math.sin(a) * R * 1.1).L(cx + Math.cos(a) * R * (k % 3 === 0 ? 1.24 : 1.17), cy + Math.sin(a) * R * (k % 3 === 0 ? 1.24 : 1.17)), 1, col, w * 0.45, { a: tw * tq, head: false, hot: false });
      }
      const qa = ease(span(q, 0.15, 0.92));
      // The value arc, laid down as two overlapping wand passes.
      const arcA = new Trail().A(cx, cy, R, R, Math.PI - 0.04, Math.PI + Math.PI * f + 0.03), arcB = new Trail().A(cx, cy, R * 0.94, R * 0.94, Math.PI + Math.PI * f, Math.PI + 0.02);
      wand(g, th, [arcA, arcB], qa, col, w * 1.3, { seed: i * 19 + 4, speed: 900 * u });
      const ang = Math.PI + Math.PI * f * clamp(qa * 2) + (qa >= 1 ? Math.sin(t * 6 + i) * 0.012 : 0), tipx = cx + Math.cos(ang) * R, tipy = cy + Math.sin(ang) * R;
      beam(g, th, new Trail().M(cx, cy).L(cx + Math.cos(ang) * R * 0.92, cy + Math.sin(ang) * R * 0.92), 1, "#ffffff", w * 0.6, { head: false, a: 0.85 });
      star(g, th, cx, cy, R * 0.1, col, 0.9, false);
      star(g, th, tipx, tipy, R * 0.13 * (1 + 0.15 * Math.sin(t * 5 + i)), col, 1, true);
      if (qa >= 1) for (let j = 0; j < 7; j++) {
        const ph = (t * 1.2 + j / 7 + i * 0.13) % 1, a2 = ang - Math.PI / 2 + (j - 3) * 0.32;
        star(g, th, tipx + Math.cos(a2) * ph * 70 * u, tipy + Math.sin(a2) * ph * 70 * u + ph * ph * 40 * u, (5 + (j % 3) * 2) * u, col, 1 - ph, false);
      }
      const size = Math.max(110 * u, Math.min(160 * u, R * 0.62));
      say(g, th, fmt(value, d, smooth(qa)), cx, cy - R * 0.14, size, { align: "center", color: col, q: span(q, 0.25, 0.6), weight: 1 });
      say(g, th, label, cx, cy + 66 * u, 52 * u, { align: "center", color: i ? th.accent : mixc(col, "#ffffff", 0.3), q: span(q, 0.3, 0.75), maxW: cw * 0.92, min: 44 * u });
    });
    // A long light-trail links the two gauges high in the frame; the wand keeps running along it.
    if (rcs.length === 2 && p > 0.6) {
      const a = ease(span(p, 0.6, 0.95)), [c0x, c0y, R0] = rcs[0], [c1x, c1y, R1] = rcs[1];
      const tr = vertical ? new Trail().Q(box.x + box.w - 30 * u, c0y - R0 * 0.5, box.x + box.w + 10 * u, (c0y + c1y) / 2, box.x + box.w - 30 * u, c1y - R1 * 0.7)
        : new Trail().curve([[c0x - R0 * 0.2, c0y - R0 * 1.35], [c0x + R0 * 0.5, c0y - R0 * 1.62], [(c0x + c1x) / 2, Math.max(box.y + 10 * u, c0y - R0 * 1.75)], [c1x - R1 * 0.5, c1y - R1 * 1.62], [c1x + R1 * 0.05, c1y - R1 * 1.36]], 8 * u);
      wand(g, th, [tr], a, th.accent, w * 0.85, { seed: 61, a: 0.9 });
      if (a >= 1) {
        const [ex, ey, ang] = tr.at(1);
        beam(g, th, new Trail().M(ex - Math.cos(ang - 0.5) * 26 * u, ey - Math.sin(ang - 0.5) * 26 * u).L(ex, ey).L(ex - Math.cos(ang + 0.5) * 26 * u, ey - Math.sin(ang + 0.5) * 26 * u), 1, th.accent, w * 0.85, { head: false });
        flow(g, th, tr, t * 0.5, 0.2, th.accent, w * 0.85);
        flow(g, th, tr, t * 0.5 + 0.5, 0.12, hue(th, 1), w * 0.7, 0.7);
      }
    }
  }

  // ---- headlines, title, closing and the shutter streak (drawn on the stage under the scenes) -------
  function headline(g, S, th, info) {
    const u = S.u, hl = headingLayout(S, info.scene);
    if (!text0(hl)) return;
    const local = info.local, leave = info.next ? smooth((local - (info.hold - info.change)) / Math.max(0.01, info.change)) : 0;
    const a = 1 - leave;
    if (a <= 0.01) return;
    const statement = info.scene === "title" || info.scene === "closing";
    const dur = statement ? Math.min(1.5, info.hold * 0.5) : Math.min(1.25, Math.max(0.8, info.hold * 0.32));
    const t0 = info.scene === "title" && hl.kick ? 0.35 : 0.05;
    if (hl.kick) wand(g, th, hl.kick.strokes, span(local, 0.02, 0.55), hue(th, 0), Math.max(1.8, hl.kick.cap * 0.075), { a, seed: 17, speed: 900 * u, chunk: 14 * u });
    const m = hl.main, w = Math.max(2, m.cap * (statement ? 0.07 : 0.075));
    wand(g, th, m.strokes, span(local, t0, t0 + dur), th.accent, w, { a, seed: strHash(info.scene), speed: 700 * u, chunk: Math.max(14, m.cap * 0.5) });
  }
  // Title ribbons run in bands above and below the words, never through them.
  const cacheR = {};
  function ribbons(S, rect) {
    const key = S.W + "x" + S.H + "|" + (rect ? [rect.y | 0, rect.h | 0].join(",") : "");
    if (cacheR[key]) return cacheR[key];
    const { W, H, u } = S, out = [], pad = 60 * u;
    const top0 = 0.05 * H, top1 = rect ? rect.y - pad : H * 0.3, bot0 = rect ? rect.y + rect.h + pad : H * 0.65, bot1 = floorY(S) - 10 * u;
    const band = (y0, y1, ph, k, dir) => {
      if (y1 - y0 < 40 * u) return null;
      const tr = new Trail(), mid = (y0 + y1) / 2, amp = (y1 - y0) / 2;
      for (let s = 0; s <= 90; s++) { const f = s / 90, x = W * (-0.08 + 1.16 * f); tr.L(dir > 0 ? x : W - x, mid + amp * 0.9 * Math.sin(f * TAU * k + ph) * (0.35 + 0.65 * Math.sin(f * Math.PI))); }
      return tr;
    };
    [band(top0, top1, 0.4, 0.9, 1), band(top0 + 20 * u, top1 - 10 * u, 2.2, 1.3, -1), band(bot0, bot1, 1.3, 1.1, 1), band(bot0 + 10 * u, bot1, 3.4, 0.8, -1)].forEach((tr) => tr && out.push(tr));
    return (cacheR[key] = out);
  }
  function titleArt(g, S, th, info) {
    const u = S.u, t = info.t, hl = headingLayout(S, "title"), rs = ribbons(S, text0(hl) || hl.kick ? hl.rect : null), cols = [hue(th, 0), hue(th, 1), th.accent, hue(th, 2)];
    const leave = clamp((info.local - (info.hold - info.change)) / Math.max(0.01, info.change));
    g.save(); g.globalAlpha = 1 - leave; NOW.alpha = 1 - leave;
    rs.forEach((tr, i) => {
      const q = ease((info.local + 0.35 - 0.1 * i) / 1.4), w = 3.8 * u;
      beam(g, th, tr, q, cols[i], w, { a: 0.8 });
      if (q >= 1) flow(g, th, tr, t * 0.33 + i * 0.25, 0.17, cols[i], w);
    });
    g.restore(); NOW.alpha = 1;
  }
  function closingArt(g, S, th, info) {
    const u = S.u, t = info.t, hl = headingLayout(S, "closing"), cx = S.W / 2, cy = floorY(S) + 20 * u;
    const textBottom = text0(hl) ? hl.rect.y + hl.rect.h + 70 * u : S.H * 0.4;
    const base = Math.max(60 * u, Math.min(S.W * (S.tall ? 0.3 : 0.2), (cy - textBottom) / (1.8 * 0.82)));
    // Concentric arcs rise like a dawn under the words; beads keep orbiting them to the last frame.
    [1, 1.38, 1.8].forEach((m, i) => {
      const rx = base * m * (S.tall ? 1 : 1.6), ry = base * m * 0.82, tr = new Trail().A(cx, cy, rx, ry, Math.PI, TAU);
      const q = ease((info.local - 0.15 * i) / 1.3), col = i === 1 ? th.accent : hue(th, i === 2 ? 1 : 0), w = 3.4 * u;
      wand(g, th, [tr], q, col, w, { a: 0.85, seed: 200 + i, retrace: false });
      if (q >= 1) for (let b = 0; b < 2; b++) flow(g, th, tr, t * (0.26 + i * 0.06) + b * 0.5, 0.14, col, w * 1.1);
    });
    // Rays from the horizon point, turning slowly; they stop short of the words.
    g.save(); g.globalCompositeOperation = th.comp; g.lineCap = "round";
    const lim = cy - textBottom;
    for (let k = 0; k < 26; k++) {
      const a = Math.PI + 0.12 + (k / 25) * (Math.PI - 0.24) + Math.sin(t * 0.25) * 0.03, tw = 0.5 + 0.5 * Math.sin(t * 1.7 + k * 2.1), inn = base * 0.4 * (1 + (k % 2) * 0.12);
      const reach = Math.min(S.W * 0.6, lim / Math.max(0.2, -Math.sin(a))), out = reach * (0.7 + 0.3 * tw) * ease(info.local / 1.2);
      g.strokeStyle = hexA(hue(th, k), 0.1 + 0.16 * tw); g.lineWidth = 2 * u;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * inn, cy + Math.sin(a) * inn); g.lineTo(cx + Math.cos(a) * out, cy + Math.sin(a) * out); g.stroke();
    }
    g.restore();
    star(g, th, cx, cy, base * 0.5 * (1 + 0.06 * Math.sin(t * 2)), th.accent, 0.8, true);
    motes(g, th, cx, cy, t, 14, 133, base * 2.4, lim * 0.9, th.accent, u, 0.85);
  }
  // A local streak of light crossing the frame: additive only, so the black level never lifts.
  function sweep(g, S, th, k, seed) {
    const { W, H, u } = S, x = lerp(-0.3 * W, 1.3 * W, k), y0 = H * (0.42 + 0.1 * Math.sin(seed * 2.1)), cols = [hue(th, 0), hue(th, 1), hue(th, 2), th.accent, hue(th, 3)];
    const env = Math.sin(clamp(k) * Math.PI);
    g.save(); g.globalCompositeOperation = th.comp;
    cols.forEach((col, i) => {
      const len = W * (0.4 + 0.1 * i), yy = y0 + (i - 2) * 18 * u, lag = i * 0.03 * W, th2 = (3 + (i % 3) * 2) * u * env, xx = x - lag;
      const lg = g.createLinearGradient(xx - len, 0, xx, 0);
      lg.addColorStop(0, hexA(col, 0)); lg.addColorStop(0.75, hexA(col, (th.light ? 0.5 : 0.55) * env)); lg.addColorStop(1, th.light ? hexA(col, 0.9 * env) : `rgba(255,255,255,${0.9 * env})`);
      g.fillStyle = lg; g.fillRect(xx - len, yy - th2 / 2, len, th2);
    });
    // A soft additive glow that hugs the streak only.
    const gl = g.createLinearGradient(0, y0 - 120 * u, 0, y0 + 120 * u);
    gl.addColorStop(0, hexA(th.accent, 0)); gl.addColorStop(0.5, hexA(th.accent, 0.1 * env)); gl.addColorStop(1, hexA(th.accent, 0));
    g.fillStyle = gl; g.fillRect(x - W * 0.5, y0 - 120 * u, W * 0.5, 240 * u);
    g.restore();
    star(g, th, x, y0, 60 * u * env, th.accent, env, true);
  }

  return {
    bg: "#04050e", panel: "rgba(255,255,255,0.06)", ink: "#ffffff", muted: "rgba(255,255,255,0.74)", accent: "#ffb347", onAccent: "#04050e",
    rule: "rgba(255,255,255,0.3)", track: "rgba(255,255,255,0.12)",
    display: FONT, displayWeight: 600, displayCase: "none", displayTracking: "0.005em", body: FONT, bodyWeight: 500, figures: FONT,
    radius: 24, motion: "write", change: "frost", kit: { line: 3, glow: 20, fill: "none", panel: "outline" },
    hues: ["#38e1ff", "#c05cff", "#ff4fa3", "#5dffb0"], sky: ["#02030a", "#080a22", "#1b1244"], land: ["#04050d", "#020208"],
    palettes: {
      light: { bg: "#e8ecf8", panel: "rgba(255,255,255,0.6)", ink: "#10142e", muted: "rgba(16,20,46,0.66)", accent: "#e0245e", onAccent: "#ffffff", rule: "rgba(16,20,46,0.28)", track: "rgba(16,20,46,0.08)",
        lightMode: true, hues: ["#1a8fe0", "#7a3cf0", "#e0245e", "#10a37f"], sky: ["#d3dbf2", "#e8ebf8", "#fbe6ee"], land: ["#b9c0d8", "#9aa3c4"], textShadow: () => "0 1px 14px rgba(255,255,255,0.7)" },
      dark: { bg: "#010208", accent: "#ffc766", onAccent: "#010208", hues: ["#2f8bff", "#7a4dff", "#18c2d6", "#d84dff"], sky: ["#010208", "#050718", "#0d0a2c"], land: ["#020309", "#010104"] },
      mono: { accent: "#f4f4f6", onAccent: "#0b0b0d", hues: ["#e6e6ea", "#a5a8b3", "#cfd2da", "#8a8d99"], sky: ["#050506", "#0c0c10", "#17171d"], land: ["#050507", "#020203"], bg: "#050506" },
    },
    textShadow: (accent) => `0 0 6px rgba(255,255,255,0.45), 0 0 24px ${hexA(accent, 0.7)}, 0 0 64px ${hexA(accent, 0.38)}`,
    backdrop: (accent, texture = 1, look) => `linear-gradient(180deg, ${look.sky[0]} 0%, ${look.sky[1]} 62%, ${look.sky[2]} 100%)`,
    // Where this look writes its own lettering in light (the Illustrated Explainer stage), the type
    // stays in the document for layout and reading but is not painted twice.
    css: (accent, look) => `#title-scene .kicker::before { content: ""; display: inline-block; width: 2.4em; height: 0.12em; margin-right: 0.7em; vertical-align: middle; border-radius: 9px;
      background: linear-gradient(90deg, transparent, ${accent}, #ffffff); box-shadow: 0 0 0.7em ${accent}; }
      .kicker { text-shadow: ${look.lightMode ? "none" : `0 0 14px ${hexA(accent, 0.8)}`}; }
      .lp-written .display, .lp-written .kicker { color: transparent !important; text-shadow: none !important; }
      .lp-written .kicker::before { display: none !important; }`,
    paint,
    keepArt: true,
    overlap: true,
    stage(g, S, info) {
      NOW.t = info.t;
      const root = document.getElementById("root");
      if (root && !root.classList.contains("lp-written")) root.classList.add("lp-written");
      const th = T(S.look, S.accent);
      if (S.paint && info.scene === "title") titleArt(g, S, th, info);
      if (S.paint && info.scene === "closing") closingArt(g, S, th, info);
      if (info.scene) headline(g, S, th, info);
      if (!S.paint) return;
      // The shutter streak: it builds in the last moments of a scene and crosses as the next begins.
      const w = Math.max(0.2, info.change);
      let k = -1;
      if (info.next && info.scene && info.local > info.hold - w / 2) k = (info.local - (info.hold - w / 2)) / w;
      else if (info.index > 0 && info.local < w / 2) k = 0.5 + info.local / w;
      if (k >= 0 && k <= 1) sweep(g, S, th, k, info.index + (k > 0.5 ? 0 : 1));
    },
    scenes: { chart: wrap(chart, "chart"), object: wrap(object, "object"), people: wrap(people, "people"), process: wrap(process, "process"), compare: wrap(compare, "compare") },
  };
});
