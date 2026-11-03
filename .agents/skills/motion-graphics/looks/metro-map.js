// Metro Map: an enamel wayfinding sheet of an invented city. Every drawing is a route diagram: lines
// locked to 0/45/90 degrees with rounded bends, ringed stations, name plates and numbered roundels.
// Behind each scene the whole map keeps scrolling (parks, a river with ferries, block grids, pale
// background routes with trains); each scene opens as an enlarged inset of that map. Scenes change
// when a long train sweeps across the frame, wiping the old inset away and revealing the next behind
// its tail. Statement scenes sit on a sign plate among bold hero routes. A route strip at the foot
// tracks progress. All shapes, places and names are invented. Frames are pure functions of time.
window.DreamcutMotion.register("metro-map", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const inout = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const fract = (v) => v - Math.floor(v);
  const FONT = "'Avenir Next', 'Helvetica Neue', 'Segoe UI', Arial, sans-serif";
  const hash = (i, j, s = 0) => {
    let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const NAMES = ["Larkspur Quay", "Tern Basin", "Quill Yard", "Moth Lane", "Ember Court", "Fenwick Cross", "Copperline", "Saltmarsh", "Harrow Green", "Pell Mill", "Nettle Row", "Cobalt Wharf", "Ashgrove", "Kestrel Hill", "Wren Market", "Lowe Cut", "Ironbridge", "Dovecote", "Marrow Gate", "Tallow Row"];
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  const STATEMENT = { title: true, closing: true };
  const HEADS = { title: ["kicker", "title"], closing: ["closing"], chart: ["chart-title"], object: ["object-title"], people: ["people-title"], process: ["process-title"], compare: ["compare-title"] };
  const TAGS = { chart: "INSET A · RIDERSHIP", object: "INSET B · CONTROL ROOM", people: "INSET C · PLATFORM", process: "INSET D · THROUGH ROUTE", compare: "INSET E · TWO ROUTES" };

  // ---- routes: polylines of straight runs and 45 degree jogs with rounded bends --------------------
  class Poly {
    constructor(pts, r) {
      const q = [];
      for (const p of pts) if (!q.length || Math.hypot(p[0] - q[q.length - 1][0], p[1] - q[q.length - 1][1]) > 0.5) q.push(p);
      const v = [q[0].slice()];
      for (let i = 1; i < q.length - 1; i++) {
        const a = q[i - 1], b = q[i], c = q[i + 1];
        let d1x = b[0] - a[0], d1y = b[1] - a[1], l1 = Math.hypot(d1x, d1y) || 1; d1x /= l1; d1y /= l1;
        let d2x = c[0] - b[0], d2y = c[1] - b[1], l2 = Math.hypot(d2x, d2y) || 1; d2x /= l2; d2y /= l2;
        const phi = Math.acos(clamp(d1x * d2x + d1y * d2y, -1, 1));
        if (phi < 0.01) { v.push(b.slice()); continue; }
        const tl = Math.min(r * Math.tan(phi / 2), l1 * 0.5, l2 * 0.5);
        const sx = b[0] - d1x * tl, sy = b[1] - d1y * tl, ex = b[0] + d2x * tl, ey = b[1] + d2y * tl;
        for (let k = 0; k <= 8; k++) { const s = k / 8, m = 1 - s; v.push([m * m * sx + 2 * m * s * b[0] + s * s * ex, m * m * sy + 2 * m * s * b[1] + s * s * ey]); }
      }
      if (q.length > 1) v.push(q[q.length - 1].slice());
      this.v = v; this.c = [0];
      for (let i = 1; i < v.length; i++) this.c.push(this.c[i - 1] + Math.hypot(v[i][0] - v[i - 1][0], v[i][1] - v[i - 1][1]));
      this.L = this.c[this.c.length - 1] || 1;
    }
    idx(s) {
      let lo = 0, hi = this.c.length - 2;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (this.c[m] <= s) lo = m; else hi = m - 1; }
      return Math.max(0, lo);
    }
    at(s) {
      s = clamp(s, 0, this.L);
      const i = this.idx(s), a = this.v[i], b = this.v[Math.min(i + 1, this.v.length - 1)], d = (this.c[i + 1] ?? this.c[i]) - this.c[i] || 1, k = clamp((s - this.c[i]) / d);
      return { x: lerp(a[0], b[0], k), y: lerp(a[1], b[1], k), a: Math.atan2(b[1] - a[1], b[0] - a[0]) };
    }
    path(g, s0, s1) {
      s0 = clamp(s0, 0, this.L); s1 = clamp(s1, 0, this.L);
      if (s1 <= s0 + 0.01) return false;
      const p0 = this.at(s0);
      g.moveTo(p0.x, p0.y);
      for (let i = this.idx(s0) + 1; i < this.v.length && this.c[i] < s1; i++) g.lineTo(this.v[i][0], this.v[i][1]);
      const p1 = this.at(s1);
      g.lineTo(p1.x, p1.y);
      return true;
    }
    stroke(g, q0 = 0, q1 = 1) { g.beginPath(); if (this.path(g, q0 * this.L, q1 * this.L)) g.stroke(); }
  }
  // Horizontal run, 45 degree jog, horizontal run (or the vertical equivalent when the move is steeper).
  function dogleg(a, b) {
    const [ax, ay] = a, [bx, by] = b, dx = bx - ax, dy = by - ay, adx = Math.abs(dx), ady = Math.abs(dy), sx = Math.sign(dx) || 1, sy = Math.sign(dy) || 1;
    if (adx >= ady) { const h = (adx - ady) / 2; return [a, [ax + sx * h, ay], [ax + sx * (h + ady), by], b]; }
    const h = (ady - adx) / 2;
    return [a, [ax, ay + sy * h], [bx, ay + sy * (h + adx)], b];
  }
  // A route from a start and a list of moves: h (horizontal), v (vertical), d (45 degrees, n each way).
  function trace(start, ops) {
    const pts = [start.slice()];
    let [x, y] = start;
    for (const [k, a, b, c] of ops) {
      if (k === "h") x += a; else if (k === "v") y += a; else { x += a * b; y += a * c; }
      pts.push([x, y]);
    }
    return pts;
  }
  function offsetPts(pts, d) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const seg = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
      const n1 = i > 0 ? seg(pts[i - 1], pts[i]) : seg(pts[i], pts[i + 1]);
      const n2 = i < pts.length - 1 ? seg(pts[i], pts[i + 1]) : n1;
      let nx = n1[0] + n2[0], ny = n1[1] + n2[1];
      const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      const m = Math.max(0.6, nx * n1[0] + ny * n1[1]);
      out.push([pts[i][0] + (nx * d) / m, pts[i][1] + (ny * d) / m]);
    }
    return out;
  }
  function crossings(routes) {
    const out = [];
    for (let a = 0; a < routes.length; a++) for (let b = a + 1; b < routes.length; b++) {
      const P = routes[a], Q = routes[b];
      for (let i = 0; i < P.length - 1; i++) for (let j = 0; j < Q.length - 1; j++) {
        const [x1, y1] = P[i], [x2, y2] = P[i + 1], [x3, y3] = Q[j], [x4, y4] = Q[j + 1];
        const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(den) < 1e-6) continue;
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den, s = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / den;
        if (t > 0.02 && t < 0.98 && s > 0.02 && s < 0.98) out.push([x1 + t * (x2 - x1), y1 + t * (y2 - y1)]);
      }
    }
    return out;
  }

  // ---- drawing helpers ---------------------------------------------------------------------------
  function rr(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function pen(g, color, w, dash) { g.strokeStyle = color; g.lineWidth = w; g.lineCap = "round"; g.lineJoin = "round"; g.setLineDash(dash || []); }
  function say(g, s, x, y, size, o = {}) {
    s = String(s ?? "");
    if (!s) return 0;
    const font = (z) => `${o.weight || 700} ${z}px ${FONT}`;
    g.font = font(size); g.letterSpacing = (o.track || 0) * size + "px";
    let w = g.measureText(s).width;
    if (o.maxW && w > o.maxW) { size = Math.max(o.min || size * 0.7, (size * o.maxW) / w); g.font = font(size); g.letterSpacing = (o.track || 0) * size + "px"; w = g.measureText(s).width; }
    const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    g.textAlign = "left"; g.textBaseline = o.base || "alphabetic";
    if (o.halo) { g.lineJoin = "round"; g.lineWidth = size * 0.22; g.strokeStyle = o.halo; g.strokeText(s, x0, y); }
    g.fillStyle = o.color; g.fillText(s, x0, y);
    g.letterSpacing = "0px";
    return w;
  }
  function measure(g, s, size, weight = 700) { g.font = `${weight} ${size}px ${FONT}`; return g.measureText(String(s ?? "")).width; }
  const colOf = (F, i) => (i % 6 === 0 ? F.S.accent : F.T.lines[(i - 1 + 60) % F.T.lines.length]);

  // A name plate: white enamel, dark border, a coloured end cap and a stripe along the foot. The plate and its
  // lettering are revealed together, so a plate is never shown without its words.
  function sign(g, F, s, x, y, size, o = {}) {
    const u = F.u, q = o.q ?? 1;
    if (q <= 0 || !s) return null;
    const w = measure(g, s, size, o.weight || 700), pad = size * 0.5, cap = o.color ? size * 0.3 : 0, pw = w + pad * 2 + cap, ph = size * 1.5;
    const px = o.align === "right" ? x - pw : o.align === "center" ? x - pw / 2 : x, py = y - ph / 2;
    g.save();
    // The plate snaps up whole with its lettering, so a word is never shown cut.
    if (q < 1) { const k = 0.72 + 0.28 * ease(q), cx = px + pw / 2, cy = py + ph / 2; g.translate(cx, cy); g.scale(k, k); g.translate(-cx, -cy); g.globalAlpha *= clamp(q * 2.2); }
    g.shadowColor = F.T.shadow; g.shadowBlur = 14 * u; g.shadowOffsetY = 5 * u;
    rr(g, px, py, pw, ph, size * 0.34); g.fillStyle = F.T.plate; g.fill();
    g.shadowColor = "transparent";
    if (o.color) { g.save(); rr(g, px, py, pw, ph, size * 0.34); g.clip(); g.fillStyle = o.color; g.fillRect(px, py, cap, ph); g.fillRect(px, py + ph - size * 0.14, pw, size * 0.14); g.restore(); }
    rr(g, px, py, pw, ph, size * 0.34); pen(g, F.T.ink, 3.4 * u); g.stroke();
    say(g, s, px + cap + pad, y, size, { color: o.textColor || F.T.ink, base: "middle", weight: o.weight || 700 });
    g.restore();
    return { x: px, y: py, w: pw, h: ph };
  }
  function roundel(g, F, x, y, r, color, label, o = {}) {
    const u = F.u;
    g.save();
    if (o.pop != null) { const k = ease(o.pop); g.translate(x, y); g.scale(k, k); g.translate(-x, -y); g.globalAlpha *= clamp(o.pop * 3); }
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = color; g.fill();
    pen(g, F.T.plate, Math.max(2, r * 0.14)); g.stroke();
    pen(g, F.T.ink, 2.4 * u); g.beginPath(); g.arc(x, y, r + Math.max(2, r * 0.14) * 0.5 + 1.2 * u, 0, TAU); g.stroke();
    if (label != null) say(g, label, x, y + r * 0.04, r * 1.1, { color: "#ffffff", align: "center", base: "middle", weight: 800 });
    g.restore();
  }
  // A station: white disc, line-coloured ring, optional second ring for an interchange, and a ripple.
  function station(g, F, x, y, r, col, o = {}) {
    const u = F.u;
    if (o.ripple) {
      const k = fract(F.t * 0.55 + (o.ph || 0));
      g.save(); g.globalAlpha = (1 - k) * 0.55; pen(g, col, 4 * u); g.beginPath(); g.arc(x, y, r * (1.2 + k * 1.7), 0, TAU); g.stroke(); g.restore();
    }
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = o.fill || F.T.plate; g.fill();
    pen(g, o.inter ? F.T.ink : col, Math.max(2.5 * u, r * (o.inter ? 0.3 : 0.38))); g.stroke();
    if (o.inter) { g.beginPath(); g.arc(x, y, r * 0.52, 0, TAU); pen(g, col, Math.max(2 * u, r * 0.16)); g.stroke(); }
  }
  // Cars along a route; the head car leads and carries a lamp.
  function train(g, F, poly, s, col, cars, carLen, h, o = {}) {
    const u = F.u, gap = carLen * 0.1;
    for (let c = cars - 1; c >= 0; c--) {
      const sc = s - c * (carLen + gap);
      if (sc < -carLen * 0.5 || sc > poly.L + carLen * 0.5) continue;
      const pt = poly.at(sc), nx = poly.at(sc + 1);
      const a = sc <= 0 || sc >= poly.L ? pt.a : Math.atan2(nx.y - pt.y, nx.x - pt.x) || pt.a;
      g.save(); g.translate(pt.x, pt.y); g.rotate(a);
      if (o.shadow !== false) { g.shadowColor = F.T.shadow; g.shadowBlur = 8 * u; g.shadowOffsetY = 4 * u; }
      rr(g, -carLen / 2, -h / 2, carLen, h, h * 0.42); g.fillStyle = col; g.fill();
      g.shadowColor = "transparent";
      pen(g, F.T.ink, Math.max(1.5, 2.4 * u)); g.stroke();
      const wn = Math.max(2, Math.round(carLen / (h * 1.1)));
      for (let k = 0; k < wn; k++) {
        const ww = (carLen * 0.8) / wn;
        rr(g, -carLen * 0.4 + k * ww + ww * 0.08, -h * 0.27, ww * 0.84, h * 0.34, h * 0.1); g.fillStyle = "rgba(255,255,255,0.88)"; g.fill();
      }
      if (c === 0) { g.beginPath(); g.arc(carLen / 2 - h * 0.18, h * 0.12, h * 0.1, 0, TAU); g.fillStyle = "#ffe9a0"; g.fill(); }
      g.restore();
    }
  }
  // Marching chevrons along a route: the way the line is running.
  function chevrons(g, F, poly, col, pitch, speed, size, alpha = 1) {
    const u = F.u;
    g.save(); g.globalAlpha *= alpha; pen(g, col, Math.max(2, size * 0.26));
    const off = (F.t * speed) % pitch;
    for (let s = off; s < poly.L; s += pitch) {
      const p = poly.at(s);
      g.save(); g.translate(p.x, p.y); g.rotate(p.a);
      g.beginPath(); g.moveTo(-size * 0.45, -size * 0.5); g.lineTo(size * 0.35, 0); g.lineTo(-size * 0.45, size * 0.5); g.stroke();
      g.restore();
    }
    g.restore();
  }
  // A route line in the map's own style: a paper casing, then the line.
  function routeLine(g, F, poly, col, w, q0 = 0, q1 = 1, casing = true) {
    if (q1 <= q0) return;
    if (casing) { pen(g, F.T.plate, w + 9 * F.u); poly.stroke(g, q0, q1); }
    pen(g, col, w); poly.stroke(g, q0, q1);
  }
  const ticks = (g, F, poly, col, n, r, from = 0.04, to = 0.96, q = 1) => {
    for (let i = 0; i < n; i++) {
      const k = n === 1 ? 0.5 : lerp(from, to, i / (n - 1));
      if (k > q) break;
      const p = poly.at(k * poly.L); station(g, F, p.x, p.y, r, col);
    }
  };

  // ---- tones ---------------------------------------------------------------------------------------
  const TONE = {
    paper: "#f3ecdc", land: "#eee5cf", block: "#e6dbc2", avenue: "#f7f1e3", park: "#c8dbab", tree: "#a9c58b", water: "#bcdbe6", shore: "#8dbccb",
    ink: "#1d2630", inkRGB: "29,38,48", plate: "#fffdf6", inset: "rgba(255,252,243,0.82)", grid: "rgba(29,38,48,0.07)", shadow: "rgba(40,30,10,0.28)",
    screen: "#17283d", screenInk: "#eef3fa", wash: "rgba(255,250,236,0.72)", vignette: 0.16, grain: 0.1,
    lines: ["#1f7fb0", "#2e9d6d", "#f0a51c", "#7d55b8", "#d94a8c", "#1aa5a0"],
  };
  const TONES = {
    light: { ...TONE, paper: "#f6f8fb", land: "#eef2f7", block: "#e2e9f1", avenue: "#fbfcfe", park: "#cfe4c9", tree: "#b0d0a8", water: "#c3dcec", shore: "#92bcd6", plate: "#ffffff", inset: "rgba(255,255,255,0.84)", wash: "rgba(250,252,255,0.72)", screen: "#1b2b44" },
    dark: { ...TONE, paper: "#0f1a2b", land: "#122036", block: "#182a43", avenue: "#0f1a2b", park: "#15402f", tree: "#1d5a40", water: "#0d3550", shore: "#2a6d90",
      ink: "#e6edf7", inkRGB: "230,237,247", plate: "#16263d", inset: "rgba(15,26,43,0.84)", grid: "rgba(230,237,247,0.07)", shadow: "rgba(0,0,0,0.5)", screen: "#0a1220", screenInk: "#eef3fa", wash: "rgba(15,26,43,0.7)", vignette: 0.42, grain: 0.12,
      lines: ["#45b4ee", "#43d39b", "#ffc247", "#a98aff", "#ff6fb0", "#3fe0d6"] },
    mono: { ...TONE, paper: "#efeee8", land: "#e9e8e1", block: "#deddd5", avenue: "#f4f3ee", park: "#d3d6cb", tree: "#b9bdb0", water: "#d5d9dc", shore: "#a6adb2", ink: "#2b2b2a", inkRGB: "43,43,42", plate: "#fbfbf7", inset: "rgba(251,251,247,0.84)", screen: "#2a2a29", wash: "rgba(245,244,238,0.72)",
      lines: ["#4a4a48", "#85857f", "#6a6a66", "#a0a099", "#35352f", "#7a7a74"] },
  };

  // ---- the world behind every scene --------------------------------------------------------------
  let world = null, worldKey = "", grainTile = null, grainKey = "";
  function buildWorld(F) {
    const u = F.u, r = rng(48), x0 = -3000 * u, x1 = 17000 * u;
    const routes = [];
    const fams = [[-0.12, [1, 2]], [0.2, [3]], [0.54, [4, 5]], [0.9, [2]], [1.26, [1, 3]]];
    fams.forEach(([fy, cols], fi) => {
      const base = fy * 1080 * u, pts = [[x0, base]];
      let x = x0, y = base;
      while (x < x1) {
        x += (480 + r() * 760) * u; pts.push([x, y]);
        const dir = y > base + 260 * u ? -1 : y < base - 260 * u ? 1 : r() < 0.5 ? -1 : 1, dd = (140 + r() * 240) * u;
        x += dd; y += dir * dd; pts.push([x, y]);
      }
      cols.forEach((c, j) => routes.push({ pts: offsetPts(pts, (j - (cols.length - 1) / 2) * 25 * u), col: c, fam: fi, raw: pts }));
    });
    routes.forEach((rt, i) => { rt.poly = new Poly(rt.pts, 90 * u); rt.speed = (110 + 70 * hash(i, 1)) * u * (i % 2 ? 1 : -1); rt.off = hash(i, 2) * 4000 * u; });
    // The river: long runs and 45 degree steps.
    const rp = [[x0, 0.4 * 1080 * u]];
    let rx = x0, ry = 0.4 * 1080 * u;
    while (rx < x1) {
      rx += (620 + r() * 900) * u; rp.push([rx, ry]);
      const dir = ry > 0.9 * 1080 * u ? -1 : ry < -0.1 * 1080 * u ? 1 : r() < 0.5 ? -1 : 1, dd = (200 + r() * 260) * u;
      rx += dd; ry += dir * dd; rp.push([rx, ry]);
    }
    return { routes, river: new Poly(rp, 160 * u), names: NAMES };
  }
  function drawWorld(g, F) {
    const { u, W, H, T, cam, t } = F;
    const vx = cam.x, vy = cam.y;
    g.save(); g.translate(-vx, -vy);
    // Ground and city blocks.
    const P = 150 * u;
    for (let i = Math.floor(vx / P) - 1; i < (vx + W) / P + 1; i++) for (let j = Math.floor(vy / P) - 1; j < (vy + H) / P + 1; j++) {
      const h = hash(i, j, 5);
      if (h < 0.1) continue;
      g.fillStyle = h < 0.2 ? T.land : T.block; g.globalAlpha = h < 0.2 ? 1 : 0.55 + 0.45 * hash(i, j, 6);
      rr(g, i * P + 10 * u, j * P + 10 * u, P - 20 * u, P - 20 * u, 16 * u); g.fill();
    }
    g.globalAlpha = 1;
    // Diagonal avenues.
    g.strokeStyle = T.avenue; g.lineWidth = 22 * u; g.lineCap = "butt";
    const AP = 1300 * u;
    for (let k = Math.floor((vx - vy - H) / AP) - 1; k < (vx - vy + W) / AP + 1; k++) {
      const c = k * AP + 240 * u;
      g.beginPath(); g.moveTo(vx - 20, vx - 20 - c + 0 * 0 + vy * 0); g.lineTo(vx + W + 20, vx + W + 20 - c); g.stroke();
    }
    // Parks with trees.
    const CP = 1000 * u;
    for (let ci = Math.floor(vx / CP) - 1; ci < (vx + W) / CP + 1; ci++) for (let cj = Math.floor(vy / CP) - 1; cj < (vy + H) / CP + 1; cj++) {
      if (hash(ci, cj, 3) > 0.52) continue;
      const pw = (260 + 300 * hash(ci, cj, 4)) * u, ph = (200 + 240 * hash(ci, cj, 7)) * u, px = ci * CP + hash(ci, cj, 8) * (CP - pw), py = cj * CP + hash(ci, cj, 9) * (CP - ph), c = 60 * u;
      g.beginPath(); g.moveTo(px + c, py); g.lineTo(px + pw - c, py); g.lineTo(px + pw, py + c); g.lineTo(px + pw, py + ph - c); g.lineTo(px + pw - c, py + ph); g.lineTo(px + c, py + ph); g.lineTo(px, py + ph - c); g.lineTo(px, py + c); g.closePath();
      g.fillStyle = T.park; g.fill();
      g.fillStyle = T.tree;
      for (let a = px + 30 * u; a < px + pw - 20 * u; a += 44 * u) for (let b = py + 30 * u; b < py + ph - 20 * u; b += 44 * u) {
        if (hash(Math.round(a / u), Math.round(b / u), 11) < 0.45) { g.beginPath(); g.arc(a + 8 * u * hash(ci, Math.round(a), 2), b, (7 + 5 * hash(Math.round(a), Math.round(b), 12)) * u, 0, TAU); g.fill(); }
      }
    }
    // River with ferries.
    pen(g, T.shore, 142 * u); world.river.stroke(g);
    pen(g, T.water, 124 * u); world.river.stroke(g);
    g.save(); g.globalAlpha = 0.5; pen(g, T.plate, 3 * u, [26 * u, 36 * u]); g.lineDashOffset = -t * 30 * u;
    world.river.stroke(g);
    g.restore();
    for (let k = -2; k < 14; k++) {
      const s = ((k * 2300 * u + t * 85 * u) % (world.river.L * 0.9)) + 400 * u;
      const pt = world.river.at(s);
      if (pt.x < vx - 200 * u || pt.x > vx + W + 200 * u || pt.y < vy - 200 * u || pt.y > vy + H + 200 * u) continue;
      g.save(); g.translate(pt.x, pt.y); g.rotate(pt.a);
      g.strokeStyle = T.plate; g.globalAlpha = 0.6; g.lineWidth = 3 * u; g.beginPath(); g.moveTo(-90 * u, -12 * u); g.lineTo(-170 * u, -2 * u); g.moveTo(-90 * u, 12 * u); g.lineTo(-170 * u, 2 * u); g.stroke(); g.globalAlpha = 1;
      rr(g, -52 * u, -17 * u, 104 * u, 34 * u, 17 * u); g.fillStyle = T.plate; g.fill(); pen(g, T.ink, 2.5 * u); g.stroke();
      rr(g, -24 * u, -9 * u, 44 * u, 16 * u, 6 * u); g.fillStyle = F.cols[1]; g.fill();
      g.restore();
    }
    // Background routes: pale, with stations and trains that never stop.
    for (const rt of world.routes) {
      const col = F.cols[rt.col];
      g.save(); g.globalAlpha = 0.5;
      pen(g, T.plate, 25 * u); rt.poly.stroke(g);
      g.globalAlpha = 0.62; pen(g, col, 15 * u); rt.poly.stroke(g);
      g.restore();
      // stations
      for (let s = 140 * u; s < rt.poly.L; s += 330 * u) {
        const p = rt.poly.at(s);
        if (p.x < vx - 60 * u || p.x > vx + W + 60 * u || p.y < vy - 60 * u || p.y > vy + H + 60 * u) continue;
        g.save(); g.globalAlpha = 0.8; station(g, F, p.x, p.y, 10 * u, col); g.restore();
      }
      const sp = 2600 * u;
      for (let k = 0; k < rt.poly.L / sp + 1; k++) {
        const s = (((k * sp + rt.off + t * rt.speed) % rt.poly.L) + rt.poly.L) % rt.poly.L, p = rt.poly.at(s);
        if (p.x < vx - 300 * u || p.x > vx + W + 300 * u || p.y < vy - 300 * u || p.y > vy + H + 300 * u) continue;
        g.save(); g.globalAlpha = 0.82;
        train(g, F, rt.poly, rt.speed > 0 ? s : s, col, 3, 54 * u, 20 * u, { shadow: false });
        g.restore();
      }
    }
    // Interchanges where the families cross, and name tags.
    for (let a = 0; a < world.routes.length; a++) {
      const rt = world.routes[a];
      for (let i = 4; i < rt.raw.length; i += 6) {
        const [x, y] = rt.raw[i];
        if (x < vx - 60 * u || x > vx + W + 60 * u || y < vy - 60 * u || y > vy + H + 60 * u) continue;
        g.save(); g.globalAlpha = 0.9; station(g, F, x, y, 17 * u, F.cols[rt.col], { inter: true }); g.restore();
      }
    }
    // Place names fade out as they near a foreground panel, so no name is ever shown cut by a plate.
    const NP = 760 * u, ex = F.exclude || [];
    for (let i = Math.floor(vx / NP) - 1; i < (vx + W) / NP + 1; i++) for (let j = Math.floor(vy / NP) - 1; j < (vy + H) / NP + 1; j++) {
      if (hash(i, j, 21) > 0.62) continue;
      const nm = world.names[Math.floor(hash(i, j, 22) * world.names.length)];
      const nx = i * NP + hash(i, j, 23) * 420 * u, ny = j * NP + 120 * u + hash(i, j, 24) * 380 * u, nw = measure(g, nm, 30 * u, 600) * 1.05;
      const rx = nx - vx - 12 * u, ry = ny - vy - 32 * u, rw = nw + 24 * u, rh = 44 * u;
      let fade = 1;
      for (const p of ex) {
        const dx = Math.max(p.x - (rx + rw), rx - (p.x + p.w), 0), dy = Math.max(p.y - (ry + rh), ry - (p.y + p.h), 0);
        fade = Math.min(fade, clamp(Math.hypot(dx, dy) / (70 * u)));
      }
      if (fade <= 0.01) continue;
      say(g, nm, nx, ny, 30 * u, { color: `rgba(${T.inkRGB},${0.42 * fade})`, halo: hexA(T.paper.length === 7 ? T.paper : "#ffffff", fade), weight: 600, track: 0.04 });
    }
    // Fold creases that travel with the map.
    const tex = F.S.look.texture;
    if (tex > 0) {
      for (let x = Math.floor(vx / (1400 * u)) * 1400 * u; x < vx + W + 10; x += 1400 * u) {
        g.fillStyle = `rgba(255,255,255,${0.16 * tex})`; g.fillRect(x - 3 * u, vy, 3 * u, H);
        g.fillStyle = `rgba(${T.inkRGB},${0.06 * tex})`; g.fillRect(x, vy, 6 * u, H);
      }
      for (let y = Math.floor(vy / (1000 * u)) * 1000 * u; y < vy + H + 10; y += 1000 * u) {
        g.fillStyle = `rgba(255,255,255,${0.16 * tex})`; g.fillRect(vx, y - 3 * u, W, 3 * u);
        g.fillStyle = `rgba(${T.inkRGB},${0.06 * tex})`; g.fillRect(vx, y, W, 6 * u);
      }
    }
    g.restore();
  }
  function grain(g, F) {
    const tex = F.S.look.texture;
    if (tex <= 0) return;
    const key = F.T.inkRGB + F.T.paper;
    if (!grainTile || grainKey !== key) {
      grainTile = document.createElement("canvas"); grainTile.width = grainTile.height = 256; grainKey = key;
      const c = grainTile.getContext("2d"), r = rng(77);
      for (let i = 0; i < 1500; i++) { const dark = r() < 0.55; c.fillStyle = dark ? `rgba(${F.T.inkRGB},${0.05 + r() * 0.1})` : `rgba(255,255,255,${0.08 + r() * 0.16})`; c.fillRect(r() * 256, r() * 256, 1 + r() * 1.6, 1 + r() * 1.6); }
      c.lineWidth = 1;
      for (let i = 0; i < 90; i++) { const x = r() * 256, y = r() * 256, a = r() * TAU, l = 6 + r() * 14; c.strokeStyle = `rgba(${F.T.inkRGB},0.045)`; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); }
    }
    g.save(); g.globalAlpha = tex * (F.T.grain / 0.1) * 0.9;
    g.fillStyle = g.createPattern(grainTile, "repeat");
    g.translate(-(F.t * 7) % 256, -(F.t * 3) % 256);
    g.fillRect(0, 0, F.W + 260, F.H + 260);
    g.restore();
  }

  // ---- plan, camera and layout --------------------------------------------------------------------
  function controls() {
    if (window.__dreamcut && window.__dreamcut.controls) return window.__dreamcut.controls;
    try { if (typeof dc !== "undefined" && dc && dc.controls) return dc.controls; } catch (e) { /* not on this page */ }
    return null;
  }
  function planOf() {
    const c = controls();
    if (!c) return null;
    let t = 0;
    const shown = [];
    for (const id of ORDER) { const hold = Number(c[`${id}_hold`]) || 0; if (hold > 0) shown.push({ id, start: t, hold }); t += hold; }
    return shown.length ? { shown, length: t } : null;
  }
  const boxOf = (F) => {
    const { W, H, u, tall } = F, side = (tall ? 90 : 140) * u;
    return tall ? { x: side, y: H * 0.3, w: W - side * 2, h: H * 0.6 } : { x: side, y: H * 0.34, w: W - side * 2, h: H * 0.58 };
  };
  const insetOf = (F) => { const b = boxOf(F), u = F.u; return { x: b.x - 34 * u, y: b.y - 30 * u, w: b.w + 68 * u, h: b.h + 56 * u }; };
  // The changing train. It enters over the end of the outgoing scene (phase A) and its tail clears the frame
  // during the first `change` seconds of the incoming one (phase B). Everything ahead of its head is the old
  // scene, everything behind its tail is the new one, and nothing of either is drawn in between, so the two
  // scenes never overlap. Each change runs a different way: across, down, back, up (night service starts down).
  const SEQ = { day: ["E", "S", "W", "N"], night: ["S", "E", "N", "W"] };
  const kindOf = (F, idx) => { const s = F.T.paper === TONES.dark.paper ? SEQ.night : SEQ.day; return s[(Math.max(1, idx) - 1) % s.length]; };
  const preOf = (F, hold) => Math.min(Math.max(0.05, F.info.change) * 0.8, hold * 0.3);
  function change(F) {
    const { info } = F, c = Math.max(0.05, info.change);
    let tau = null, idx = 0, phase = null, pre = 0;
    if (F.index > 0 && F.prev && info.local < c) { pre = preOf(F, F.prev.hold); tau = info.local; idx = F.index; phase = "B"; }
    else if (info.next) { pre = preOf(F, info.hold); if (pre > 0.02 && info.local > info.hold - pre) { tau = info.local - info.hold; idx = F.index + 1; phase = "A"; } }
    if (phase == null) return null;
    const kind = kindOf(F, idx), across = kind === "E" || kind === "W", A = across ? F.W : F.H, len = A * (across ? 0.62 : 0.66);
    const k = clamp((tau + pre) / (pre + c)), head = (len + A) * inout(k);
    return { kind, across, phase, idx, A, len, k, head, tail: head - len };
  }
  // When the tail of the train bringing scene `idx` has passed the whole of rect R (seconds into that scene).
  function arrival(F, idx, prevHold, R) {
    const c = Math.max(0.05, F.info.change), pre = preOf(F, prevHold), kind = kindOf(F, idx), across = kind === "E" || kind === "W";
    const A = across ? F.W : F.H, len = A * (across ? 0.62 : 0.66);
    const far = kind === "E" ? R.x + R.w : kind === "W" ? F.W - R.x : kind === "S" ? R.y + R.h : F.H - R.y;
    const goal = clamp((far + len) / (len + A));
    let lo = 0, hi = 1;
    for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (inout(m) < goal) lo = m; else hi = m; }
    return hi * (pre + c) - pre + 0.04;
  }
  // A strip of the frame between two distances along the train's travel.
  function band(g, wp, a0, a1) {
    const { W, H } = frame;
    a0 = Math.max(-20, a0); a1 = Math.min(wp.A + 20, a1);
    if (a1 <= a0) { g.rect(0, 0, 0, 0); return; }
    if (wp.kind === "E") g.rect(a0, 0, a1 - a0, H); else if (wp.kind === "W") g.rect(W - a1, 0, a1 - a0, H);
    else if (wp.kind === "S") g.rect(0, a0, W, a1 - a0); else g.rect(0, H - a1, W, a1 - a0);
  }
  const clipAhead = (g, wp) => { g.beginPath(); band(g, wp, wp.head, 1e6); g.clip(); };
  const clipBehind = (g, wp) => { g.beginPath(); band(g, wp, -1e6, wp.tail); g.clip(); };
  function makeFrame(S, info) {
    const { W, H, u } = S, look = S.look;
    const T = look.tone || TONE;
    const key = `${W}x${H}:${T.paper}`;
    const F = { S, W, H, u, tall: S.tall, T, info: { ...info }, t: info.t, cols: [S.accent, ...T.lines] };
    const plan = planOf();
    F.plan = plan;
    if (plan) {
      let i = info.index;
      if (!(i >= 0)) i = plan.shown.length - 1;
      F.info.index = i;
      F.cur = plan.shown[i];
      F.prev = plan.shown[i - 1] || null;
      if (!info.scene) { F.info.scene = F.cur.id; F.info.local = F.cur.hold; F.info.hold = F.cur.hold; }
      F.info.next = plan.shown[i + 1] ? plan.shown[i + 1].id : null;
    } else {
      F.cur = { id: info.scene || "chart", start: info.t - info.local, hold: info.hold || 3 };
      F.prev = info.index > 0 ? { id: "chart", hold: 3 } : null;
    }
    F.index = Math.max(0, F.info.index);
    if (!world || worldKey !== key) { F.cols = [S.accent, ...T.lines]; world = buildWorld(F); worldKey = key; }
    F.cam = camera(F);
    return F;
  }
  // The map scrolls the way the route runs, with a slow drift and a longer glide into each scene.
  function camera(F) {
    const { u, info } = F, PX = 760 * u, PY = 210 * u, i = F.index;
    const at = (n) => ({ x: n * PX, y: (n % 2) * PY });
    let c = at(i);
    if (i > 0 && info.local < info.change * 1.5) {
      const a = at(i - 1), m = inout(info.local / (info.change * 1.5));
      c = { x: lerp(a.x, c.x, m), y: lerp(a.y, c.y, m) };
    }
    return { x: c.x + F.t * 20 * u, y: c.y + Math.sin(F.t * 0.4) * 16 * u + 30 * u };
  }

  // The page lays out the headline words; the look letters them on its own plates, so a headline is only ever
  // seen inside its plate and on its own side of the train. Words are measured once, untransformed.
  const wordCache = {};
  function wordsOf(id) {
    if (wordCache[id]) return wordCache[id];
    const el = document.getElementById(id), root = document.getElementById("root"), node = el && el.firstChild;
    if (!node || node.nodeType !== 3 || !root) return [];
    const held = [];
    for (let n = el; n && n !== root; n = n.parentElement) { held.push([n, n.style.transform]); n.style.transform = "none"; }
    const rb = root.getBoundingClientRect(), scale = rb.width / (Number(root.dataset.width) || 1920) || 1;
    const cs = getComputedStyle(el), upper = cs.textTransform === "uppercase", txt = node.textContent, out = [], range = document.createRange(), re = /\S+/g;
    let m;
    while ((m = re.exec(txt))) {
      range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
      const r = [...range.getClientRects()].find((q) => q.width > 1);
      if (r) out.push({ s: upper ? m[0].toUpperCase() : m[0], x: (r.left - rb.left) / scale, y: (r.top - rb.top) / scale, w: r.width / scale, h: r.height / scale });
    }
    for (const [n, tr] of held) n.style.transform = tr;
    if (!out.length) return out;
    const size = parseFloat(cs.fontSize) || 72;
    out.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
    out.track = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
    return (wordCache[id] = out);
  }
  function headBox(id) {
    const ls = [].concat(...HEADS[id].map(wordsOf));
    if (!ls.length) return null;
    return { x: Math.min(...ls.map((l) => l.x)), y: Math.min(...ls.map((l) => l.y)), x2: Math.max(...ls.map((l) => l.x + l.w)), y2: Math.max(...ls.map((l) => l.y + l.h)) };
  }
  function headRect(F, id) {
    const b = headBox(id);
    if (!b) return null;
    const u = F.u, stm = STATEMENT[id], px = (stm ? 64 : 36) * u, py = (stm ? 44 : 20) * u;
    return { x: b.x - px, y: b.y - py, w: b.x2 - b.x + px * 2, h: b.y2 - b.y + py * 2 };
  }
  function letter(g, F, id) {
    for (const el of HEADS[id]) {
      const ws = wordsOf(el);
      if (!ws.length) continue;
      g.font = ws.font; g.letterSpacing = ws.track; g.textAlign = "left"; g.textBaseline = "alphabetic";
      g.fillStyle = el === "kicker" ? F.S.accent : F.T.ink;
      for (const w of ws) {
        const mt = g.measureText(w.s), asc = mt.fontBoundingBoxAscent || w.h * 0.8, desc = mt.fontBoundingBoxDescent || w.h * 0.2;
        g.fillText(w.s, w.x, w.y + (w.h - asc - desc) / 2 + asc);
      }
      g.letterSpacing = "0px";
    }
  }
  // The plate behind a headline, lettered as one piece. The opening scene slides its plate open with the words;
  // every later plate arrives whole, uncovered by the passing train.
  function headPlate(g, F, id, local, num, grow, at) {
    const R = headRect(F, id);
    if (!R) return;
    const { u, T } = F, q = grow ? ease(span(local, 0.05, 0.5)) : at != null ? span(local, at, at + 0.2) : 1;
    if (q <= 0) return;
    const { x, y, w, h } = R, col = colOf(F, num + 1);
    g.save();
    if (grow) { g.beginPath(); g.rect(x - 60 * u, y - 80 * u, (w + 120 * u) * q, h + 160 * u); g.clip(); }
    else if (q < 1) { const k = 0.8 + 0.2 * ease(q), cx = x + w / 2, cy = y + h / 2; g.translate(cx, cy); g.scale(k, k); g.translate(-cx, -cy); g.globalAlpha *= clamp(q * 2.5); }
    g.shadowColor = T.shadow; g.shadowBlur = 24 * u; g.shadowOffsetY = 9 * u;
    rr(g, x, y, w, h, 26 * u); g.fillStyle = T.plate; g.fill();
    g.shadowColor = "transparent";
    g.save(); rr(g, x, y, w, h, 26 * u); g.clip(); g.fillStyle = col; g.fillRect(x, y + h - 14 * u, w, 14 * u); g.fillRect(x, y, 22 * u, h); g.restore();
    rr(g, x, y, w, h, 26 * u); pen(g, T.ink, 4 * u); g.stroke();
    letter(g, F, id);
    g.restore();
    if (grow ? q > 0.12 : q > 0) { g.save(); g.globalAlpha *= grow ? clamp((q - 0.12) * 4) : 1; roundel(g, F, x + 4 * u, y + 2 * u, 36 * u, col, String(num + 1), grow ? {} : { pop: clamp(q * 1.4) }); g.restore(); }
  }

  // ---- inset ---------------------------------------------------------------------------------------
  const tagW = (g, F, tag) => measure(g, tag, 26 * F.u, 700) + 44 * F.u + tag.length * 26 * F.u * 0.05;
  function tagRect(g, F, tag) {
    const b = insetOf(F), u = F.u, w = tagW(g, F, tag);
    return { x: b.x + b.w - w - 50 * u, y: b.y - 40 * u, w, h: 40 * u };
  }
  function drawInset(g, F, tag, tagQ = 1) {
    const { u, T, t } = F, b = insetOf(F);
    g.save();
    g.shadowColor = T.shadow; g.shadowBlur = 40 * u; g.shadowOffsetY = 16 * u;
    rr(g, b.x, b.y, b.w, b.h, 38 * u); g.fillStyle = T.inset; g.fill();
    g.shadowColor = "transparent";
    g.save(); rr(g, b.x, b.y, b.w, b.h, 38 * u); g.clip();
    // fine grid that drifts with the map, so the inset is never a flat card
    g.strokeStyle = T.grid; g.lineWidth = 1.6 * u;
    const step = 46 * u, ox = (-F.cam.x * 0.6) % step, oy = (-F.cam.y * 0.6) % step;
    g.beginPath();
    for (let x = b.x + ox; x < b.x + b.w; x += step) { g.moveTo(x, b.y); g.lineTo(x, b.y + b.h); }
    for (let y = b.y + oy; y < b.y + b.h; y += step) { g.moveTo(b.x, y); g.lineTo(b.x + b.w, y); }
    g.stroke();
    // a slow sweep of light, so every hold has something moving in the paper itself
    const sx = b.x + ((t * 120 * u) % (b.w + 600 * u)) - 300 * u;
    const gr = g.createLinearGradient(sx - 160 * u, 0, sx + 160 * u, 0);
    gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.5, `rgba(255,255,255,${0.2 * F.S.look.texture})`); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(b.x, b.y, b.w, b.h);
    g.restore();
    rr(g, b.x, b.y, b.w, b.h, 38 * u); pen(g, T.ink, 5 * u); g.stroke();
    rr(g, b.x + 12 * u, b.y + 12 * u, b.w - 24 * u, b.h - 24 * u, 28 * u); pen(g, `rgba(${T.inkRGB},0.35)`, 1.8 * u); g.stroke();
    // corner tab
    if (tag && tagQ > 0) {
      const w = tagW(g, F, tag), tx = b.x + b.w - w - 50 * u, ty = b.y - 40 * u;
      if (tagQ < 1) { const k = 0.8 + 0.2 * ease(tagQ); g.translate(tx + w / 2, ty + 20 * u); g.scale(k, k); g.translate(-(tx + w / 2), -(ty + 20 * u)); g.globalAlpha *= clamp(tagQ * 2.5); }
      rr(g, tx, ty, w, 40 * u, 12 * u); g.fillStyle = T.ink; g.fill();
      say(g, tag, tx + 22 * u, b.y - 19 * u, 26 * u, { color: T.paper, base: "middle", weight: 700, track: 0.05 });
    }
    g.restore();
  }

  // ---- hero routes for title and closing ------------------------------------------------------------
  let heroKey = "", heroSet = null;
  function heroOf(F) {
    const key = `${F.W}x${F.H}`;
    if (heroSet && heroKey === key) return heroSet;
    const { W, H, u } = F, d = (n) => n * u;
    const specs = [
      [[-0.06 * W, 0.86 * H], [["h", 0.22 * W], ["d", d(110), 1, 1], ["h", 0.32 * W], ["d", d(110), 1, -1], ["h", 0.6 * W]], 0],
      [[-0.06 * W, 0.13 * H], [["h", 0.2 * W], ["d", d(100), 1, -1], ["h", 0.34 * W], ["d", d(100), 1, 1], ["h", 0.6 * W]], 1],
      [[0.07 * W, -0.06 * H], [["v", 0.42 * H], ["d", d(150), 1, 1], ["v", 0.7 * H]], 2],
      [[0.93 * W, -0.06 * H], [["v", 0.34 * H], ["d", d(130), -1, 1], ["v", 0.8 * H]], 3],
      [[-0.06 * W, 0.5 * H], [["h", 0.1 * W], ["d", d(180), 1, -1], ["h", 0.22 * W], ["d", d(180), 1, 1], ["h", 0.9 * W]], 4],
    ];
    const pts = specs.map(([s, o]) => trace(s, o));
    heroSet = { routes: pts.map((p, i) => ({ poly: new Poly(p, 70 * u), col: specs[i][2] })), cross: crossings(pts), terminus: [0.5 * W, (F.tall ? 0.92 : 0.9) * H] };
    heroKey = key;
    return heroSet;
  }
  function drawHero(g, F, id, local, hold, hasNext, clipTo, clipFrom) {
    const { u, W, H, T, t } = F, hs = heroOf(F);
    g.save();
    if (clipTo != null || clipFrom != null) { g.beginPath(); g.rect(clipFrom ?? 0, 0, (clipTo ?? W) - (clipFrom ?? 0), H); g.clip(); }
    const fade = hasNext ? 1 - span(local, hold - F.info.change, hold) * 0 : 1;
    g.globalAlpha = fade;
    hs.routes.forEach((r, i) => {
      const q = id === "title" ? ease(span(local, 0.05 + i * 0.12, 1.5 + i * 0.12)) : ease(span(local, 0, 0.8 + i * 0.05));
      const col = colOf(F, r.col);
      g.save(); g.shadowColor = T.shadow; g.shadowBlur = 12 * u; g.shadowOffsetY = 5 * u;
      routeLine(g, F, r.poly, col, 24 * u, 0, q);
      g.restore();
      g.save(); g.globalAlpha *= 0.85; chevrons(g, F, r.poly, "#ffffff", 150 * u, 60 * u, 12 * u, q); g.restore();
      for (let s = 120 * u; s < r.poly.L * q; s += 330 * u) { const p = r.poly.at(s); station(g, F, p.x, p.y, 12 * u, col); }
      const per = r.poly.L * 0.9;
      if (q > 0.98) for (let k = 0; k < 2; k++) {
        const s = (((t * (170 + i * 18) * u + k * per * 0.5 + i * 400 * u) % (per + 500 * u)) + per + 500 * u) % (per + 500 * u) - 250 * u;
        train(g, F, r.poly, s, col, 4, 76 * u, 28 * u);
      }
    });
    hs.cross.forEach(([x, y], i) => {
      const k = ease(span(local, 0.5 + i * 0.1, 1 + i * 0.1));
      if (k > 0) { g.save(); g.translate(x, y); g.scale(k, k); g.translate(-x, -y); station(g, F, x, y, 22 * u, T.ink, { inter: true, ripple: true, ph: i * 0.23 }); g.restore(); }
    });
    if (id === "closing") {
      const [tx, ty] = hs.terminus, k = ease(span(local, 0.2, 0.9));
      g.save(); g.translate(tx, ty); g.scale(k, k); g.translate(-tx, -ty);
      for (let j = 0; j < 3; j++) { const rk = fract(t * 0.5 + j / 3); g.globalAlpha = (1 - rk) * 0.5 * fade; pen(g, F.S.accent, 5 * u); g.beginPath(); g.arc(tx, ty, 54 * u + rk * 150 * u, 0, TAU); g.stroke(); }
      g.globalAlpha = fade;
      station(g, F, tx, ty, 50 * u, F.S.accent, { inter: true });
      g.restore();
    }
    g.restore();
  }

  // ---- progress strip ---------------------------------------------------------------------------------
  function strip(g, F) {
    const { u, W, H, T, t, info } = F, y = H - (F.tall ? 46 : 34) * u, x0 = W * 0.1, x1 = W * 0.9;
    const n = F.plan ? F.plan.shown.length : 5, len = info.length || (F.plan ? F.plan.length : 15), prog = clamp(t / len);
    const poly = new Poly([[x0, y], [x1, y]], 10);
    g.save();
    pen(g, T.plate, 20 * u); poly.stroke(g);
    pen(g, `rgba(${T.inkRGB},0.22)`, 11 * u); poly.stroke(g);
    pen(g, F.S.accent, 11 * u); poly.stroke(g, 0, prog);
    for (let i = 0; i < n; i++) {
      const x = lerp(x0, x1, n === 1 ? 0 : i / (n - 1)), done = i / Math.max(1, n - 1) <= prog + 0.001;
      station(g, F, x, y, 13 * u, done ? F.S.accent : `rgba(${T.inkRGB},0.5)`, { fill: done ? F.S.accent : T.plate });
    }
    train(g, F, poly, prog * poly.L + 36 * u, F.S.accent, 2, 46 * u, 20 * u, { shadow: false });
    g.restore();
  }

  // ---- the changing train ------------------------------------------------------------------------------
  function drawTrain(g, F, wp) {
    const { u, W, H, tall } = F, ins = insetOf(F);
    const cross = wp.across ? (tall ? H * 0.6 : ins.y + ins.h * 0.5) : W * 0.5;
    const h = wp.across ? Math.min(ins.h * 0.34, 300 * u) : Math.min(W * 0.16, 260 * u);
    bigTrain(g, F, wp, cross, h, colOf(F, wp.idx + 1));
  }
  function bigTrain(g, F, ch, cross, h, col) {
    const { u, T, W, H } = F, y = 0, cars = Math.round(clamp(ch.len / (h * 0.85), 3, 6)), gap = 10 * u, carW = (ch.len - gap * (cars - 1)) / cars;
    g.save();
    // Travel runs along local x in every direction.
    if (ch.kind === "E") g.translate(0, cross);
    else if (ch.kind === "W") { g.translate(W, cross); g.scale(-1, 1); }
    else if (ch.kind === "S") { g.translate(cross, 0); g.rotate(Math.PI / 2); }
    else { g.translate(cross, H); g.rotate(-Math.PI / 2); }
    // The wipe's two edges: a line-coloured rail where the new scene begins, an ink rail where the old one ends.
    for (const [a, c] of [[ch.tail, col], [ch.head, T.ink]]) {
      if (a < -30 || a > ch.A + 30) continue;
      pen(g, T.plate, 20 * u); g.beginPath(); g.moveTo(a, -4000); g.lineTo(a, 4000); g.stroke();
      pen(g, c, 9 * u); g.stroke();
      pen(g, T.plate, 3 * u, [14 * u, 22 * u]); g.lineDashOffset = -F.t * 160 * u; g.stroke(); g.setLineDash([]); g.lineDashOffset = 0;
    }
    // The line it lays: a short run of track fading out behind the tail.
    const tg = g.createLinearGradient(ch.tail - 320 * u, 0, ch.tail, 0);
    tg.addColorStop(0, hexA(col.length === 7 ? col : "#888888", 0)); tg.addColorStop(1, col);
    g.strokeStyle = tg; g.lineWidth = h * 0.22; g.lineCap = "butt"; g.beginPath(); g.moveTo(ch.tail - 320 * u, y); g.lineTo(ch.tail + 20 * u, y); g.stroke();
    // speed streaks behind the tail
    const r = rng(9);
    pen(g, `rgba(${T.inkRGB},0.22)`, 3 * u);
    for (let i = 0; i < 16; i++) { const yy = y - h * 0.5 + r() * h, l = (120 + r() * 360) * u, xs = ch.tail - r() * 120 * u; g.globalAlpha = 0.3 + 0.7 * r(); g.beginPath(); g.moveTo(xs, yy); g.lineTo(xs - l, yy); g.stroke(); }
    g.globalAlpha = 1;
    for (let c = 0; c < cars; c++) {
      const x = ch.tail + c * (carW + gap);
      if (x > ch.A + 20 || x + carW < -20) continue;
      g.save(); g.shadowColor = T.shadow; g.shadowBlur = 24 * u; g.shadowOffsetY = 10 * u;
      rr(g, x, y - h / 2, carW, h, h * 0.3); g.fillStyle = c % 2 ? col : T.plate; g.fill();
      g.restore();
      g.save(); rr(g, x, y - h / 2, carW, h, h * 0.3); g.clip();
      g.fillStyle = col; g.fillRect(x, y + h * 0.12, carW, h * 0.16); g.fillStyle = T.ink; g.fillRect(x, y + h * 0.4, carW, h * 0.1); g.restore();
      rr(g, x, y - h / 2, carW, h, h * 0.3); pen(g, T.ink, 4 * u); g.stroke();
      const wn = 4, ww = (carW - 36 * u) / wn;
      for (let k = 0; k < wn; k++) { rr(g, x + 18 * u + k * ww + 4 * u, y - h * 0.38, ww - 8 * u, h * 0.42, 10 * u); g.fillStyle = T.screen; g.fill(); pen(g, T.ink, 2.5 * u); g.stroke(); g.fillStyle = "rgba(255,255,255,0.22)"; g.fillRect(x + 18 * u + k * ww + 10 * u, y - h * 0.34, 8 * u, h * 0.34); }
      if (c < cars - 1) { g.fillStyle = T.ink; g.fillRect(x + carW, y + h * 0.22, gap, 8 * u); }
    }
    // the head lamp
    const hx = ch.head - 12 * u;
    if (hx > 0 && hx < ch.A + 40) { g.beginPath(); g.arc(hx, y + h * 0.2, 11 * u, 0, TAU); g.fillStyle = "#fff3b8"; g.shadowColor = "#fff3b8"; g.shadowBlur = 30 * u; g.fill(); }
    g.restore();
  }

  // ---- scene drawings -------------------------------------------------------------------------------------
  function drawChart(g, F, box, p, d, info) {
    const { u, T, t } = F, n = d.values.length, max = Math.max(...d.values, 1), slot = box.w / n;
    const baseY = box.y + box.h - 96 * u, maxH = Math.max(120 * u, box.h - 96 * u - 150 * u), bw = Math.min(slot * 0.46, 150 * u);
    // guides, as fare-zone rules, with their scale at the left
    pen(g, `rgba(${T.inkRGB},0.22)`, 2.4 * u, [14 * u, 14 * u]);
    for (const f of [0.25, 0.5, 0.75, 1]) { g.beginPath(); g.moveTo(box.x + 70 * u, baseY - maxH * f); g.lineTo(box.x + box.w, baseY - maxH * f); g.lineDashOffset = -t * 18 * u; g.stroke(); }
    g.setLineDash([]); g.lineDashOffset = 0;
    for (const f of [0.5, 1]) say(g, window.DreamcutMotion.formatNumber(max * f, 0, d.prefix, d.suffix), box.x + 4 * u, baseY - maxH * f + 15 * u, 42 * u, { color: `rgba(${T.inkRGB},0.62)`, halo: T.plate, weight: 700 });
    // a pale express line along the top rule, with a shuttle that never stops
    const top = new Poly([[box.x + 70 * u, baseY - maxH], [box.x + box.w, baseY - maxH]], 10);
    g.save(); g.globalAlpha = 0.5; pen(g, F.T.lines[1], 9 * u); top.stroke(g);
    for (let i = 0; i < n; i++) { const x = box.x + slot * (i + 0.5); station(g, F, x, baseY - maxH, 9 * u, F.T.lines[1]); }
    train(g, F, top, ((t * 150 * u) % (top.L + 400 * u)) - 200 * u, F.T.lines[1], 3, 56 * u, 20 * u, { shadow: false });
    g.restore();
    const base = new Poly([[box.x, baseY], [box.x + box.w, baseY]], 10);
    routeLine(g, F, base, T.ink, 16 * u);
    chevrons(g, F, base, T.plate, 120 * u, 70 * u, 10 * u, 0.9);
    d.values.forEach((v, i) => {
      const x = box.x + slot * (i + 0.5), hot = i === d.highlight, col = hot ? F.S.accent : F.T.lines[i % F.T.lines.length];
      const q = ease(span(p, (i / n) * 0.5, (i / n) * 0.5 + 0.55)), h = maxH * (v / max) * q;
      // ghost of the bar to come
      pen(g, `rgba(${T.inkRGB},0.34)`, 3 * u, [10 * u, 10 * u]); rr(g, x - bw / 2, baseY - maxH * (v / max), bw, maxH * (v / max), bw / 2); g.stroke(); g.setLineDash([]);
      if (h > 2) {
        g.save(); g.shadowColor = T.shadow; g.shadowBlur = 16 * u; g.shadowOffsetY = 6 * u;
        rr(g, x - bw / 2, baseY - h, bw, h, bw / 2); pen(g, T.plate, 11 * u); g.stroke(); g.fillStyle = col; g.fill();
        g.restore();
        rr(g, x - bw / 2, baseY - h, bw, h, bw / 2); pen(g, T.ink, 3.2 * u); g.stroke();
        g.save(); rr(g, x - bw / 2, baseY - h, bw, h, bw / 2); g.clip();
        g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(x - bw * 0.3, baseY - h, bw * 0.14, h);
        // riders climbing the bar
        const cp = 90 * u;
        pen(g, "rgba(255,255,255,0.85)", 7 * u);
        for (let s = (t * 70 * u) % cp; s < h; s += cp) { const yy = baseY - s; g.beginPath(); g.moveTo(x - bw * 0.2, yy + 14 * u); g.lineTo(x, yy - 6 * u); g.lineTo(x + bw * 0.2, yy + 14 * u); g.stroke(); }
        g.restore();
      }
      station(g, F, x, baseY, 24 * u, col, { ripple: hot && p > 0.6, inter: hot });
      if (q > 0.04) say(g, window.DreamcutMotion.formatNumber(v * q, 0, d.prefix, d.suffix), x, baseY - h - 28 * u, Math.min(110 * u, (slot * 0.9) / Math.max(2, String(v).length + (d.suffix || "").length) * 1.6), { color: hot ? F.S.accent : T.ink, halo: T.plate, align: "center", weight: 800 });
      sign(g, F, d.labels[i] || "", x, baseY + 60 * u, 42 * u, { align: "center", color: col, q: 1 });
    });
    const train0 = ((t * 260 * u) % (box.w + 700 * u)) - 450 * u;
    train(g, F, base, train0, T.ink === "#1d2630" ? "#2a3a4d" : T.lines[0], 4, 84 * u, 30 * u);
  }

  function miniMap(g, F, x, y, w, h, p, id) {
    const { u, T, t } = F;
    g.save(); rr(g, x, y, w, h, 10 * u); g.clip();
    g.fillStyle = T.screen; g.fillRect(x, y, w, h);
    g.strokeStyle = "rgba(255,255,255,0.07)"; g.lineWidth = 1.4 * u; g.beginPath();
    for (let i = 1; i < 12; i++) { g.moveTo(x + (w * i) / 12, y); g.lineTo(x + (w * i) / 12, y + h); }
    for (let j = 1; j < 7; j++) { g.moveTo(x, y + (h * j) / 7); g.lineTo(x + w, y + (h * j) / 7); }
    g.stroke();
    const lw = Math.max(5, h * 0.045);
    const lines = [
      [[x - 10, y + h * 0.28], [x + w * 0.34, y + h * 0.28], [x + w * 0.46, y + h * 0.4], [x + w * 0.8, y + h * 0.4], [x + w * 0.92, y + h * 0.22], [x + w + 10, y + h * 0.22]],
      [[x + w * 0.12, y - 10], [x + w * 0.12, y + h * 0.5], [x + w * 0.3, y + h * 0.68], [x + w * 0.86, y + h * 0.68], [x + w + 10, y + h * 0.82]],
      [[x - 10, y + h * 0.86], [x + w * 0.4, y + h * 0.86], [x + w * 0.58, y + h * 0.58], [x + w * 0.58, y - 10]],
    ];
    lines.forEach((pts, i) => {
      const poly = new Poly(pts, h * 0.1), col = colOf(F, i);
      const q = ease(span(p, i * 0.08, 0.45 + i * 0.08));
      pen(g, col, lw); poly.stroke(g, 0, Math.max(q, 0.25));
      for (let s = poly.L * 0.12; s < poly.L; s += poly.L * 0.17) { const pt = poly.at(s); g.beginPath(); g.arc(pt.x, pt.y, lw * 0.9, 0, TAU); g.fillStyle = "#ffffff"; g.fill(); pen(g, col, lw * 0.4); g.stroke(); }
      const s = ((t * (0.16 + i * 0.05) + i * 0.3) % 1) * poly.L, pt = poly.at(s);
      g.beginPath(); g.arc(pt.x, pt.y, lw * 1.4, 0, TAU); g.fillStyle = "#ffffff"; g.shadowColor = col; g.shadowBlur = 8 * u; g.fill(); g.shadowBlur = 0;
    });
    // "you are here"
    const hx = x + w * 0.46, hy = y + h * 0.4, k = fract(t * 0.7);
    g.globalAlpha = 1 - k; pen(g, F.S.accent, 3 * u); g.beginPath(); g.arc(hx, hy, lw * (1.4 + k * 3), 0, TAU); g.stroke(); g.globalAlpha = 1;
    g.beginPath(); g.arc(hx, hy, lw * 1.35, 0, TAU); g.fillStyle = F.S.accent; g.fill();
    g.restore();
  }
  function drawObject(g, F, box, p, d) {
    const { u, T, t } = F, phone = d.kind === "phone", tall = box.h > box.w * 0.9;
    let w, h, x, y;
    if (phone) { w = tall ? box.w * 0.36 : Math.min(box.w * 0.24, box.h * 0.5); h = w * 1.9; } else { w = tall ? box.w * 0.62 : Math.min(box.w * 0.5, box.h * 1.18); h = w * 0.62; }
    x = box.x + box.w * (tall ? 0.04 : 0.03) + (phone && !tall ? box.w * 0.08 : 0);
    y = tall ? box.y + 30 * u : box.y + (box.h - h) / 2 - (phone ? 0 : h * 0.05);
    const pad = (phone ? 20 : 22) * u, sx = x + pad, sy = y + pad, sw = w - pad * 2, sh = h - pad * 2;
    g.save();
    g.shadowColor = T.shadow; g.shadowBlur = 30 * u; g.shadowOffsetY = 14 * u;
    rr(g, x, y, w, h, (phone ? 40 : 20) * u); g.fillStyle = T.plate; g.fill();
    g.shadowColor = "transparent";
    if (!phone) { g.beginPath(); g.moveTo(x - w * 0.06, y + h + h * 0.07); g.lineTo(x + w * 1.06, y + h + h * 0.07); g.lineTo(x + w, y + h - 2 * u); g.lineTo(x, y + h - 2 * u); g.closePath(); g.fillStyle = T.plate; g.shadowColor = T.shadow; g.shadowBlur = 16 * u; g.fill(); g.shadowColor = "transparent"; pen(g, T.ink, 3.4 * u); g.stroke(); }
    rr(g, x, y, w, h, (phone ? 40 : 20) * u); pen(g, T.ink, 4.4 * u); g.stroke();
    g.restore();
    // screen: a live mini map above a timeline
    const mapH = sh * (phone ? 0.5 : 0.56);
    miniMap(g, F, sx, sy, sw, mapH, p, "object");
    g.save(); rr(g, sx, sy + mapH + 8 * u, sw, sh - mapH - 8 * u, 10 * u); g.clip();
    g.fillStyle = T.screen; g.fillRect(sx, sy + mapH + 8 * u, sw, sh - mapH - 8 * u);
    const th = (sh - mapH - 8 * u) / 3.6;
    for (let r = 0; r < 3; r++) {
      const ty = sy + mapH + 8 * u + th * 0.35 + r * th * 1.05;
      [[0.04, 0.3], [0.38, 0.24], [0.66, 0.3]].forEach(([cx, cw], i) => {
        const shown = ease(span(p, 0.15 + i * 0.1 + r * 0.05, 0.55 + i * 0.1 + r * 0.05));
        const wid = sw * cw * Math.max(shown, 0.3);
        rr(g, sx + sw * (cx + r * 0.03), ty, wid, th * 0.78, th * 0.3); g.fillStyle = r === 0 && i === 1 ? F.S.accent : colOf(F, r + i + 1); g.globalAlpha = 0.95; g.fill(); g.globalAlpha = 1;
      });
    }
    const ph = sx + sw * (0.06 + 0.88 * fract(t * 0.16));
    g.fillStyle = "#ffffff"; g.fillRect(ph - 1.5 * u, sy + mapH + 8 * u, 3 * u, sh); g.restore();
    rr(g, sx, sy, sw, sh, 10 * u); pen(g, T.ink, 2.6 * u); g.stroke();
    // callouts: numbered roundels on the device, leaders out to name plates
    const anchors = [[sx + sw * 0.72, sy + mapH * 0.28], [sx + sw * 0.5, sy + mapH + (sh - mapH) * 0.5], [sx + sw * 0.16, sy + mapH + (sh - mapH) * 0.82]];
    const px = tall ? box.x + box.w * 0.5 : box.x + box.w * 0.67, size = 44 * u;
    const rowY = (i) => (tall ? y + h + (phone ? 0 : h * 0.1) + 120 * u + i * Math.min(box.h * 0.17, 150 * u) : box.y + box.h * (0.17 + i * 0.33));
    d.callouts.forEach((label, i) => {
      if (!label) return;
      const [ax, ay] = anchors[i], by = rowY(i), col = colOf(F, i + 1);
      const poly = new Poly(tall ? [[ax, ay], [ax, by], [px, by]] : dogleg([ax, ay], [px, by]), 30 * u);
      const q = ease(span(p, 0.04 + i * 0.09, 0.34 + i * 0.09));
      // the planned route is pencilled in before the line runs along it
      g.save(); g.globalAlpha *= 0.32; pen(g, col, 8 * u, [12 * u, 14 * u]); g.lineDashOffset = -t * 40 * u; poly.stroke(g); g.restore(); g.setLineDash([]);
      g.save(); g.shadowColor = T.shadow; g.shadowBlur = 8 * u; routeLine(g, F, poly, col, 12 * u, 0, q); g.restore();
      roundel(g, F, ax, ay, 21 * u, col, String(i + 1));
      station(g, F, px, by, 13 * u, col, { ripple: q > 0.98, ph: i * 0.3 });
      sign(g, F, label, px + 26 * u, by, size, { color: col, q: ease(span(q, 0.75, 1)) });
      if (q > 0.1) { g.save(); g.globalAlpha = 0.9; chevrons(g, F, poly, "#ffffff", 120 * u, 50 * u, 8 * u, q); g.restore(); }
      if (q > 0.98) { const s = fract(t * 0.3 + i * 0.27) * poly.L, pt = poly.at(s); g.beginPath(); g.arc(pt.x, pt.y, 9 * u, 0, TAU); g.fillStyle = "#ffffff"; g.fill(); pen(g, col, 3 * u); g.stroke(); }
    });
  }

  function person(g, F, cx, base, size, col, i, hot, q) {
    const { u, T, t } = F, k = ease(q);
    const bob = Math.sin(t * 2.4 + i * 1.3) * size * 0.012, sway = Math.sin(t * 1.3 + i) * 0.015;
    g.save(); g.translate(cx, base); g.scale(1, 1); g.rotate(sway); g.translate(0, (1 - k) * size * 0.2 + bob); g.globalAlpha *= clamp(k * 1.6);
    const hr = size * 0.13, legH = size * 0.3, bodyH = size * 0.4, bw = size * 0.36;
    const hipY = -legH, shY = hipY - bodyH, headY = shY - hr * 1.15;
    const ink = T.ink;
    // legs
    pen(g, ink, size * 0.075); g.beginPath(); g.moveTo(-bw * 0.22, hipY); g.lineTo(-bw * 0.24, 0); g.moveTo(bw * 0.22, hipY); g.lineTo(bw * 0.24, 0); g.stroke();
    // accessory behind
    const kind = i % 4;
    if (kind === 0) { rr(g, bw * 0.32, shY + bodyH * 0.1, bw * 0.4, bodyH * 0.7, bw * 0.12); g.fillStyle = ink; g.fill(); }
    // torso
    rr(g, -bw / 2, shY, bw, bodyH, bw * 0.4); g.fillStyle = col; g.fill(); pen(g, ink, size * 0.02); g.stroke();
    // arms
    pen(g, col, size * 0.07);
    g.beginPath(); g.moveTo(-bw / 2 + size * 0.02, shY + size * 0.06);
    g.lineTo(-bw * 0.7, shY + bodyH * 0.75);
    g.stroke();
    g.beginPath(); g.moveTo(bw / 2 - size * 0.02, shY + size * 0.06);
    if (hot) { const a = -1.15 + Math.sin(t * 5) * 0.35; g.lineTo(bw / 2 + Math.cos(a) * size * 0.3, shY + size * 0.06 + Math.sin(a) * size * 0.3); }
    else g.lineTo(bw * 0.7, shY + bodyH * 0.75);
    g.stroke();
    if (kind === 1) { g.fillStyle = T.plate; rr(g, -bw * 0.5, shY - size * 0.01, bw, size * 0.07, size * 0.03); g.fill(); pen(g, ink, size * 0.015); g.stroke(); }
    // head
    g.beginPath(); g.arc(0, headY, hr, 0, TAU); g.fillStyle = col; g.fill(); pen(g, ink, size * 0.02); g.stroke();
    if (kind === 2) { g.beginPath(); g.arc(0, headY, hr * 1.04, Math.PI * 1.05, Math.PI * 1.95); g.closePath(); g.fillStyle = ink; g.fill(); g.fillRect(-hr * 1.05, headY - hr * 0.1, hr * 2.1 + hr * 0.5, hr * 0.12); }
    if (kind === 3) { pen(g, ink, size * 0.03); g.beginPath(); g.arc(0, headY, hr * 1.12, Math.PI * 1.02, Math.PI * 1.98); g.stroke(); g.fillStyle = ink; g.beginPath(); g.arc(-hr * 1.12, headY, hr * 0.28, 0, TAU); g.arc(hr * 1.12, headY, hr * 0.28, 0, TAU); g.fill(); }
    const blink = fract(t / 3.1 + i * 0.37) < 0.04 ? 0.15 : 1;
    g.fillStyle = "#ffffff"; g.beginPath(); g.ellipse(-hr * 0.38 + hr * 0.12, headY, hr * 0.18, hr * 0.2 * blink, 0, 0, TAU); g.ellipse(hr * 0.38 + hr * 0.12, headY, hr * 0.18, hr * 0.2 * blink, 0, 0, TAU); g.fill();
    g.restore();
  }
  function drawPeople(g, F, box, p, d) {
    const { u, T, t } = F, n = Math.max(2, Math.min(6, Math.round(d.count))), slot = box.w / n;
    const size = Math.min(box.h * 0.45, slot * 1.5), base = box.y + box.h * 0.74;
    // tiled wall behind the platform
    g.save(); pen(g, `rgba(${T.inkRGB},0.09)`, 2 * u);
    g.beginPath();
    for (let x = box.x; x <= box.x + box.w + 1; x += 110 * u) { g.moveTo(x, box.y); g.lineTo(x, base); }
    for (let y = box.y; y <= base; y += 70 * u) { g.moveTo(box.x, y); g.lineTo(box.x + box.w, y); }
    g.stroke(); g.restore();
    // a far crowd walking the length of the platform, 
    for (let k = 0; k < 9; k++) {
      const dir = k % 2 ? -1 : 1, sp = (30 + 22 * hash(k, 3)) * u, per = box.w + 200 * u;
      const x = box.x + ((((hash(k, 4) * per + dir * t * sp) % per) + per) % per) - 100 * u, sc = 0.22 + 0.06 * hash(k, 5), y0 = base - 4 * u - hash(k, 6) * 30 * u, bob = Math.abs(Math.sin(t * 5 + k)) * 4 * u;
      g.save(); g.globalAlpha = 0.42; g.translate(x, y0 - bob);
      pen(g, F.cols[1 + (k % 5)], 15 * u * sc * 4); g.beginPath(); g.moveTo(0, -size * sc * 0.35); g.lineTo(0, -size * sc * 0.75); g.stroke();
      g.beginPath(); g.arc(0, -size * sc * 0.95, size * sc * 0.16, 0, TAU); g.fillStyle = F.cols[1 + (k % 5)]; g.fill();
      pen(g, T.ink, 9 * u * sc * 4); g.beginPath(); const sw = Math.sin(t * 5 + k) * size * sc * 0.12; g.moveTo(-sw, 0); g.lineTo(0, -size * sc * 0.35); g.lineTo(sw, 0); g.stroke();
      g.restore();
    }
    // platform edge with marching chevrons, and the track with a train that keeps running
    const edge = new Poly([[box.x, base + 18 * u], [box.x + box.w, base + 18 * u]], 10);
    routeLine(g, F, edge, T.ink, 22 * u);
    chevrons(g, F, edge, F.S.accent, 110 * u, 80 * u, 11 * u);
    const track = new Poly([[box.x, base + 112 * u], [box.x + box.w, base + 112 * u]], 10);
    pen(g, `rgba(${T.inkRGB},0.5)`, 5 * u); track.stroke(g);
    g.save(); pen(g, `rgba(${T.inkRGB},0.3)`, 3 * u, [8 * u, 24 * u]); g.beginPath(); g.moveTo(box.x, base + 140 * u); g.lineTo(box.x + box.w, base + 140 * u); g.lineDashOffset = -t * 60 * u; g.stroke(); g.restore();
    const s0 = ((t * 330 * u) % (box.w + 900 * u)) - 450 * u;
    train(g, F, track, s0, F.S.accent, 5, 150 * u, 52 * u);
    for (let i = 0; i < n; i++) {
      const q = ease(span(p, (i / n) * 0.55, (i / n) * 0.55 + 0.4)), cx = box.x + slot * (i + 0.5), hot = i === Math.min(n - 1, d.highlight), col = hot ? F.S.accent : F.T.lines[i % F.T.lines.length];
      const sz = size * (hot ? 1.06 : 1);
      // a standing mark that is already on the platform before the person arrives
      pen(g, `rgba(${T.inkRGB},0.3)`, 3 * u, [8 * u, 8 * u]); g.beginPath(); g.ellipse(cx, base + 4 * u, sz * 0.26, sz * 0.05, 0, 0, TAU); g.stroke(); g.setLineDash([]);
      person(g, F, cx, base, sz, col, i, hot, q);
      const label = d.badges[i % d.badges.length];
      if (q > 0.55 && label) {
        const tw = measure(g, label, 42 * u) + 50 * u, stag = tw > slot * 0.92 && i % 2 ? 76 * u : 0;
        sign(g, F, label, cx, base - sz * 1.2 - 46 * u - stag, 42 * u, { align: "center", color: col, q: ease(span(q, 0.55, 0.95)) });
      }
    }
  }

  function icon(g, F, kind, cx, cy, s, col, t) {
    const u = F.u;
    g.save(); pen(g, col, Math.max(5 * u, s * 0.11));
    g.beginPath();
    if (kind === "doc") {
      g.moveTo(cx - s * 0.34, cy - s * 0.46); g.lineTo(cx + s * 0.1, cy - s * 0.46); g.lineTo(cx + s * 0.34, cy - s * 0.22); g.lineTo(cx + s * 0.34, cy + s * 0.46); g.lineTo(cx - s * 0.34, cy + s * 0.46); g.closePath();
      g.moveTo(cx - s * 0.18, cy - s * 0.02); g.lineTo(cx + s * 0.18, cy - s * 0.02); g.moveTo(cx - s * 0.18, cy + s * 0.18); g.lineTo(cx + s * 0.18, cy + s * 0.18);
      g.stroke();
    } else if (kind === "cog") {
      const r1 = s * 0.3, r2 = s * 0.42, a0 = t * 0.5;
      for (let k = 0; k < 8; k++) { const a = a0 + (k * TAU) / 8; g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); }
      g.moveTo(cx + r1, cy); g.arc(cx, cy, r1, 0, TAU); g.moveTo(cx + s * 0.1, cy); g.arc(cx, cy, s * 0.1, 0, TAU);
      g.stroke();
    } else {
      g.moveTo(cx, cy - s * 0.48); g.lineTo(cx + s * 0.38, cy - s * 0.3); g.lineTo(cx + s * 0.38, cy + s * 0.06); g.quadraticCurveTo(cx + s * 0.3, cy + s * 0.36, cx, cy + s * 0.5); g.quadraticCurveTo(cx - s * 0.3, cy + s * 0.36, cx - s * 0.38, cy + s * 0.06); g.lineTo(cx - s * 0.38, cy - s * 0.3); g.closePath();
      g.stroke();
      g.beginPath(); g.moveTo(cx - s * 0.17, cy + s * 0.02); g.lineTo(cx - s * 0.03, cy + s * 0.17); g.lineTo(cx + s * 0.2, cy - s * 0.12); g.stroke();
    }
    g.restore();
  }
  function drawProcess(g, F, box, p, d) {
    const { u, T, t } = F, n = d.steps.length, tall = box.h > box.w * 1.1, r = (tall ? 74 : 82) * u;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? 0.5 : i / (n - 1);
      pts.push(tall ? [box.x + box.w * (i % 2 ? 0.68 : 0.3), box.y + box.h * (0.13 + 0.74 * f)] : [box.x + box.w * (0.13 + 0.74 * f), box.y + box.h * (0.4 + (i % 2 ? 0.14 : -0.1)) ]);
    }
    const route = [];
    for (let i = 0; i < n; i++) { if (i === 0) route.push(pts[0]); else route.push(...dogleg(pts[i - 1], pts[i]).slice(1)); }
    const lead = tall ? [pts[0][0], box.y + 6 * u] : [box.x + 4 * u, pts[0][1]], tail = tall ? [pts[n - 1][0], box.y + box.h - 6 * u] : [box.x + box.w - 4 * u, pts[n - 1][1]];
    const poly = new Poly([lead, ...(tall ? [[lead[0], pts[0][1] - 0.01]] : []), ...route, tail], 70 * u);
    // the full route is always drawn faintly; the colour runs along it as the steps arrive
    pen(g, `rgba(${T.inkRGB},0.16)`, 20 * u, [18 * u, 20 * u]); poly.stroke(g);
    g.setLineDash([]);
    const q = ease(span(p, 0, 0.85));
    g.save(); g.shadowColor = T.shadow; g.shadowBlur = 12 * u; g.shadowOffsetY = 5 * u; routeLine(g, F, poly, F.S.accent, 24 * u, 0, q); g.restore();
    chevrons(g, F, poly, "#ffffff", 140 * u, 70 * u, 12 * u, q > 0.02 ? 1 : 0);
    // stations: reached when the colour arrives
    const reach = (i) => {
      const pr = poly.L * q, here = poly.L * ((i + 0.5) / n);
      return clamp((pr - (here - r * 1.4)) / (r * 1.4));
    };
    const kinds = ["doc", "cog", "shield"];
    for (let i = 0; i < n; i++) {
      const [x, y] = pts[i], k = ease(reach(i)), last = i === n - 1, col = last ? F.S.accent : colOf(F, i + 1);
      g.save();
      g.shadowColor = T.shadow; g.shadowBlur = 18 * u; g.shadowOffsetY = 7 * u;
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = T.plate; g.fill(); g.shadowColor = "transparent";
      pen(g, T.ink, 5 * u); g.stroke();
      pen(g, col, 11 * u); g.beginPath(); g.arc(x, y, r - 11 * u, 0, TAU); g.stroke();
      g.restore();
      icon(g, F, kinds[Math.min(i, 2)], x, y, r * 1.0, T.ink, t);
      if (k > 0.5) { const kk = fract(t * 0.45 + i * 0.3); g.save(); g.globalAlpha = (1 - kk) * 0.5; pen(g, col, 4 * u); g.beginPath(); g.arc(x, y, r * (1.1 + kk * 0.9), 0, TAU); g.stroke(); g.restore(); }
      roundel(g, F, x + r * 0.78, y - r * 0.78, 29 * u, col, String(i + 1), { pop: k });
      const lab = d.steps[i];
      if (tall) sign(g, F, lab, x + (i % 2 ? -(r + 34 * u) : r + 34 * u), y, 46 * u, { align: i % 2 ? "right" : "left", color: col, q: ease(span(k, 0.3, 1)) });
      else sign(g, F, lab, x, y + r + 62 * u, 46 * u, { align: "center", color: col, q: ease(span(k, 0.3, 1)) });
    }
    // a train that visits every station and keeps going round
    const lap = poly.L, cyc = 7.5, ph = fract(t / cyc);
    const stops = pts.map((pt) => { let best = 0, bd = 1e9; for (let s = 0; s <= lap; s += 6 * u) { const c = poly.at(s), dd = Math.hypot(c.x - pt[0], c.y - pt[1]); if (dd < bd) { bd = dd; best = s; } } return best; });
    const knots = [0, ...stops, lap];
    const seg = ph * (knots.length - 1), si = Math.min(knots.length - 2, Math.floor(seg)), sk = inout(fract(seg) * 1.15 > 1 ? 1 : fract(seg) * 1.15);
    const s = lerp(knots[si], knots[si + 1], sk);
    train(g, F, poly, s + 80 * u, T.ink, 3, 100 * u, 36 * u);
    // reaching the end: the whole route lights, once the colour has run
  }

  function drawCompare(g, F, box, p, d) {
    const { u, T, t } = F, rows = [[d.left, d.leftValue, "slow"], [d.right, d.rightValue, "fast"]], mx = Math.max(d.leftValue, d.rightValue, 1);
    const rowH = box.h / 2, numSize = Math.min(150 * u, rowH * 0.62);
    rows.forEach(([label, value, kind], i) => {
      const q = ease(span(p, i * 0.22, 0.5 + i * 0.22)), cy = box.y + rowH * (i + 0.5) + (i ? 22 * u : -4 * u), hot = i === 1, col = hot ? F.S.accent : F.T.lines[0];
      const xa = box.x + 70 * u, xb = box.x + box.w - Math.min(360 * u, box.w * 0.3), amp = rowH * 0.3;
      // route: slow route weaves in 45 degree steps; fast route goes straight through
      const path = [[box.x, cy], [xa, cy]];
      if (!hot) {
        const m = 4, run = (xb - xa - m * amp * 0.9) / m;
        let x = xa, y = cy;
        for (let j = 0; j < m; j++) { x += run * 0.5; path.push([x, y]); const dir = j % 2 ? 1 : -1, d2 = amp * 0.9; x += d2; y += dir * d2; path.push([x, y]); x += run * 0.5; path.push([x, y]); }
        path.push([x, cy], [xb, cy]);
      } else path.push([xb, cy]);
      const poly = new Poly(path, 60 * u);
      pen(g, `rgba(${T.inkRGB},0.14)`, 18 * u, [16 * u, 18 * u]); poly.stroke(g);
      g.setLineDash([]);
      g.save(); g.shadowColor = T.shadow; g.shadowBlur = 10 * u; g.shadowOffsetY = 4 * u; routeLine(g, F, poly, col, hot ? 24 * u : 18 * u, 0, Math.max(q, 0.04)); g.restore();
      chevrons(g, F, poly, "#ffffff", 120 * u, (hot ? 130 : 45) * u, 10 * u, q);
      const stops = Math.max(1, Math.min(12, Math.round((value / mx) * 9)));
      ticks(g, F, poly, col, stops + 1, 13 * u, 0.1, 0.96, q);
      sign(g, F, `${stops + 1} stops`, xa + 140 * u, cy + rowH * 0.36, 42 * u, { color: col, q: span(p, 0.12 + i * 0.18, 0.26 + i * 0.18) });
      station(g, F, xa, cy, 22 * u, col, { inter: true });
      station(g, F, xb, cy, 26 * u, col, { inter: true, ripple: hot && q > 0.9 });
      // label and the number at the terminus
      sign(g, F, label, xa, cy - rowH * 0.42, 44 * u, { color: col, q: ease(span(p, i * 0.22, 0.2 + i * 0.22)) });
      const vs = window.DreamcutMotion.formatNumber(value * q, 0, d.prefix, d.suffix);
      say(g, vs, xb + 56 * u, cy + numSize * 0.35, numSize, { color: hot ? F.S.accent : T.ink, halo: T.plate, weight: 800, maxW: box.x + box.w - xb - 56 * u });
      // The train runs in, pulls up one station short of the terminus, dwells, and the next one follows.
      const nT = stops + 1, kStop = nT >= 2 ? lerp(0.1, 0.96, (nT - 2) / Math.max(1, nT - 1)) : 0.5;
      const sEnd = kStop * poly.L - 41 * u, sStart = -260 * u, speed = (hot ? 520 : 200) * u, run = Math.max(0.6, (sEnd - sStart) / speed), cyc = run + 1.3;
      const ph = (((t + i * 0.9) % cyc) + cyc) % cyc, s = ph < run ? lerp(sStart, sEnd, 1 - Math.pow(1 - ph / run, 2)) : sEnd;
      g.save(); g.globalAlpha *= clamp(q * 2) * (1 - span(ph, run + 0.8, cyc));
      train(g, F, poly, s, hot ? F.S.accent : T.ink, 4, 82 * u, 30 * u);
      g.restore();
    });
  }

  const DRAW = { chart: drawChart, object: drawObject, people: drawPeople, process: drawProcess, compare: drawCompare };
  let frame = null;
  const scene = (id) => (ctx, S, box, p, d, info) => {
    const F = frame;
    if (!F || !F.S.paint) return;
    const leaving = info && info.exit !== undefined, wp = F.wipe, ins = insetOf(F);
    ctx.save();
    rr(ctx, ins.x + 3, ins.y + 3, ins.w - 6, ins.h - 6, 36 * F.u); ctx.clip();
    if (wp) { if (leaving || wp.phase === "A") clipAhead(ctx, wp); else clipBehind(ctx, wp); }
    // An inset opens already part-built, so the frame is never empty as the train's tail uncovers it.
    DRAW[id](ctx, F, box, leaving ? 1 : 0.22 + 0.78 * p, d, info);
    ctx.restore();
    // The train is drawn by whichever drawer runs last this frame.
    if (wp && (!leaving || STATEMENT[F.cur.id])) drawTrain(ctx, F, wp);
  };

  const halo = (paper) => () => `0 0 2px ${paper}, 0 0 14px ${paper}, 0 0 30px ${paper}`;

  return {
    bg: "#f3ecdc", panel: "#fffdf6", ink: "#1d2630", muted: "#5a6574", accent: "#e2493b", onAccent: "#ffffff", rule: "rgba(29,38,48,0.7)", track: "rgba(29,38,48,0.1)",
    display: FONT, displayWeight: 800, displayCase: "none", displayTracking: "-0.01em",
    body: FONT, bodyWeight: 600, figures: FONT, radius: 24, motion: "wipe", change: "grid",
    kit: { line: 5, fill: "solid", panel: "fill" },
    panelEdge: "rgba(29,38,48,0.8)",
    tone: TONE, keepArt: true, overlap: true,
    // The page keeps laying out the headlines (for size and wrap); on the look's backdrop the canvas letters them.
    css: () => `#root.mm-type .scene .display, #root.mm-type .scene .kicker { color: transparent !important; text-shadow: none !important; -webkit-text-stroke: 0 !important; }`,
    textShadow: halo("#fffdf6"),
    backdrop: (accent, texture, look) => look.bg,
    paint: (ctx, W, H) => { ctx.clearRect(0, 0, W, H); },
    palettes: {
      light: { bg: "#f6f8fb", panel: "#ffffff", ink: "#1b2735", muted: "#5b6a7c", accent: "#d9453a", rule: "rgba(27,39,53,0.7)", panelEdge: "rgba(27,39,53,0.8)", textShadow: halo("#ffffff"), tone: { ...TONES.light, ink: "#1b2735", inkRGB: "27,39,53" } },
      dark: { bg: "#0f1a2b", panel: "#16263d", ink: "#eaf0f8", muted: "#9db0c7", accent: "#ff7061", onAccent: "#0f1a2b", rule: "rgba(234,240,248,0.7)", track: "rgba(234,240,248,0.12)", panelEdge: "rgba(234,240,248,0.7)", textShadow: halo("#16263d"), tone: TONES.dark },
      mono: { bg: "#efeee8", panel: "#fbfbf7", ink: "#2b2b2a", muted: "#6a6a66", accent: "#2b2b2a", onAccent: "#efeee8", rule: "rgba(43,43,42,0.7)", panelEdge: "rgba(43,43,42,0.8)", textShadow: halo("#fbfbf7"), tone: TONES.mono },
    },
    stage(ctx, S, info) {
      const F = (frame = makeFrame(S, info));
      // On its own backdrop the look letters the headlines itself; over footage the page's type shows.
      const root = document.getElementById("root");
      if (root && root.classList.contains("mm-type") !== Boolean(S.paint)) root.classList.toggle("mm-type", Boolean(S.paint));
      if (!S.paint) return;
      const { W, H, u, T } = F, cur = F.cur, wp = (F.wipe = change(F));
      const id = cur.id, local = F.info.local, hold = F.info.hold;
      const art = (x) => x && !STATEMENT[x];
      // Which scene sits on each side of the train.
      const curS = { id, local, hold, num: F.index };
      const oldS = wp ? (wp.phase === "B" ? { id: F.prev.id, local: F.prev.hold + local, hold: F.prev.hold, num: F.index - 1 } : curS) : null;
      const newS = wp && wp.phase === "B" ? curS : null;
      // Foreground panels, so background names keep clear of them.
      F.exclude = [{ x: 0, y: H - 80 * u, w: W, h: 80 * u }];
      for (const sc of [curS, oldS]) {
        if (!sc) continue;
        const R = headRect(F, sc.id);
        if (R) F.exclude.push(R);
        if (art(sc.id)) { const b = insetOf(F); F.exclude.push({ x: b.x, y: b.y - 44 * u, w: b.w, h: b.h + 44 * u }); }
      }
      ctx.save();
      ctx.fillStyle = T.paper; ctx.fillRect(0, 0, W, H);
      drawWorld(ctx, F);
      grain(ctx, F);
      // a calm wash across the top, where the headline sits
      const wash = ctx.createLinearGradient(0, 0, 0, H * 0.36);
      wash.addColorStop(0, T.wash); wash.addColorStop(1, "rgba(255,255,255,0)");
      ctx.globalAlpha = 0.6; ctx.fillStyle = wash; ctx.fillRect(0, 0, W, H * 0.36); ctx.globalAlpha = 1;
      // Each scene's layer: its inset card or hero routes, then its lettered plate, kept to its own side.
      const layer = (sc, clip) => {
        ctx.save();
        if (clip) clip(ctx, wp);
        // A scene brought in by a train shows its plate and tab only once the tail has passed them, whole.
        const ph = sc.num > 0 && F.plan && F.plan.shown[sc.num - 1] ? F.plan.shown[sc.num - 1].hold : null;
        const at = (R) => (ph != null && R ? arrival(F, sc.num, ph, R) : null);
        if (art(sc.id)) { const tq = at(tagRect(ctx, F, TAGS[sc.id])); drawInset(ctx, F, TAGS[sc.id], tq == null ? 1 : span(sc.local, tq, tq + 0.28)); }
        else drawHero(ctx, F, sc.id, sc.num > 0 ? sc.local + 1.6 : sc.local, sc.hold, false, null, null); // a train brings a built network, never an empty map
        headPlate(ctx, F, sc.id, sc.local, sc.num, sc.num === 0, at(headRect(F, sc.id)));
        ctx.restore();
      };
      if (!wp) layer(curS, null);
      else { layer(oldS, clipAhead); if (newS) layer(newS, clipBehind); }
      strip(ctx, F);
      // The train is drawn by the last drawer of the frame; when no scene drawer follows, that is the stage.
      if (wp && !art(id) && (wp.phase === "A" || !art(F.prev && F.prev.id))) drawTrain(ctx, F, wp);
      // soft corner shading
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.hypot(W, H) * 0.62);
      vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, `rgba(${T.inkRGB},${T.vignette * S.look.texture})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    },
    scenes: { chart: scene("chart"), object: scene("object"), people: scene("people"), process: scene("process"), compare: scene("compare") },
  };
});
