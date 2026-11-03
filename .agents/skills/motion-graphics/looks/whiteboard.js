// Whiteboard: a glossy dry-erase board drawn live with chisel markers. Every line is a wobbly,
// streaky marker stroke laid down by a visible marker; boxes are traced twice, areas are scribble
// filled, and each scene is scrubbed away by a felt eraser that leaves a faint ghost while the next
// drawing starts. The board carries old erased marks, specks and a slow gloss sheen. All drawings
// are original. Frames are pure functions of time: seeded noise only, no clocks.
window.DreamcutMotion.register("whiteboard", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const inout = (v) => { v = clamp(v); return v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2; };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const nz = (s, x) => Math.sin(x * 1.7 + s * 12.9898) * 0.5 + Math.sin(x * 0.63 + s * 4.1414) * 0.35 + Math.sin(x * 3.1 + s * 7.77) * 0.15;
  const HAND = "'Noteworthy', 'Segoe Print', 'Bradley Hand', 'Marker Felt', 'Comic Sans MS', cursive";
  const HEADS = { title: ["kicker", "title"], chart: ["chart-title"], object: ["object-title"], people: ["people-title"], process: ["process-title"], compare: ["compare-title"], closing: ["closing"] };

  // ---- hand-drawn geometry -------------------------------------------------------------------------
  // Control points become a dense polyline with a slow hand wobble and a slight bow on long runs.
  function wob(ctrl, seed, u, amp = 1.3) {
    const out = [];
    let dist = 0;
    for (let i = 0; i < ctrl.length - 1; i++) {
      const [x1, y1] = ctrl[i], [x2, y2] = ctrl[i + 1];
      const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 0.0001, nx = -dy / d, ny = dx / d;
      const n = Math.max(1, Math.ceil(d / (9 * u)));
      const bow = d > 40 * u ? (hash(seed * 7.3 + i) - 0.5) * Math.min(d * 0.02, 10 * u) : 0;
      for (let j = i === 0 ? 0 : 1; j <= n; j++) {
        const k = j / n, s = dist + k * d, off = amp * u * nz(seed, s / (55 * u)) + bow * Math.sin(Math.PI * k);
        out.push(x1 + dx * k + nx * off, y1 + dy * k + ny * off);
      }
      dist += d;
    }
    return out;
  }
  // A rounded box traced from part-way along its top edge, overshooting its own start like a quick hand.
  function boxPts(x, y, w, h, r, start = 0.1, u = 1) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    const P = [[x + Math.max(r, w * start), y]];
    const arc = (cx, cy, a0) => { for (let i = 0; i <= 4; i++) { const a = a0 + (i / 4) * Math.PI / 2; P.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
    P.push([x + w - r, y]); arc(x + w - r, y + r, -Math.PI / 2);
    P.push([x + w, y + h - r]); arc(x + w - r, y + h - r, 0);
    P.push([x + r, y + h]); arc(x + r, y + h - r, Math.PI / 2);
    P.push([x, y + r]); arc(x + r, y + r, Math.PI);
    P.push([x + Math.max(r, w * start) + Math.min(w * 0.08, 40 * u), y + 3 * u]);
    return P;
  }
  // An ellipse that does not quite close on itself, the way a marker loop is drawn.
  function elPts(cx, cy, rx, ry, a0 = -2.3, sweep = TAU + 0.45) {
    const n = Math.max(18, Math.ceil((Math.abs(sweep) * Math.max(rx, ry)) / 9)), P = [];
    for (let i = 0; i <= n; i++) {
      const k = i / n, a = a0 + sweep * k, rr = 0.98 + 0.06 * k;
      P.push([cx + Math.cos(a) * rx * rr, cy + Math.sin(a) * ry * rr]);
    }
    return P;
  }
  // A smooth curve through points (Catmull-Rom).
  function cvPts(pts, seg = 12) {
    if (pts.length < 3) return pts;
    const P = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let j = i === 0 ? 0 : 1; j <= seg; j++) {
        const t = j / seg, t2 = t * t, t3 = t2 * t;
        P.push([
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
        ]);
      }
    }
    return P;
  }
  function pointAt(pts, k) {
    let L = 0;
    for (let i = 2; i < pts.length; i += 2) L += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
    let left = L * clamp(k);
    for (let i = 2; i < pts.length; i += 2) {
      const d = Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
      if (d >= left) { const f = d ? left / d : 0; return [lerp(pts[i - 2], pts[i], f), lerp(pts[i - 1], pts[i + 1], f), Math.atan2(pts[i + 1] - pts[i - 1], pts[i] - pts[i - 2])]; }
      left -= d;
    }
    const n = pts.length;
    return [pts[n - 2], pts[n - 1], 0];
  }

  // ---- lettering -----------------------------------------------------------------------------------
  let meas = null;
  function mctx() { if (!meas) meas = document.createElement("canvas").getContext("2d"); return meas; }
  const fontOf = (size) => `700 ${size}px ${HAND}`;
  function measure(s, size) { const g = mctx(); g.font = fontOf(size); return g.measureText(String(s)).width; }
  function fitSize(s, size, maxW, min) {
    if (!maxW) return size;
    const w = measure(s, size);
    return w > maxW ? Math.max(min || size * 0.7, (size * maxW) / w) : size;
  }
  const fmt = (v, d) => window.DreamcutMotion.formatNumber(Number(v) || 0, Math.abs((Number(v) || 0) % 1) > 0.001 ? 1 : 0, (d && d.prefix) || "", (d && d.suffix) || "");

  // ---- marker ink ----------------------------------------------------------------------------------
  // Strokes the first k of a polyline as a chisel marker: a solid core, dry streaks along the
  // stroke where the felt skipped, and a small pool of ink where the tip first touched.
  function ink(g, F, it, k) {
    const pts = it.pts;
    if (!it.cum) {
      it.cum = [0];
      for (let i = 2; i < pts.length; i += 2) it.cum.push(it.cum[it.cum.length - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]));
    }
    const cum = it.cum, L = cum[cum.length - 1] * k, P = [pts[0], pts[1]];
    for (let i = 1; i < cum.length; i++) {
      if (cum[i] <= L) { P.push(pts[i * 2], pts[i * 2 + 1]); continue; }
      const seg = cum[i] - cum[i - 1], f = seg ? (L - cum[i - 1]) / seg : 0;
      P.push(lerp(pts[i * 2 - 2], pts[i * 2], f), lerp(pts[i * 2 - 1], pts[i * 2 + 1], f));
      break;
    }
    const o = it.o, w = it.w;
    g.save();
    g.globalAlpha *= o.alpha ?? 0.94;
    g.lineCap = "round"; g.lineJoin = "round";
    g.strokeStyle = it.col; g.lineWidth = w;
    if (o.dash) { g.setLineDash(o.dash); g.lineDashOffset = o.dashOff || 0; }
    g.beginPath(); g.moveTo(P[0], P[1]);
    for (let i = 2; i < P.length; i += 2) g.lineTo(P[i], P[i + 1]);
    g.stroke();
    g.setLineDash([]);
    if (!o.dash && !o.noStreak && w > 3.2 * F.u && F.streak && P.length > 4) {
      g.strokeStyle = F.streak; g.lineWidth = Math.max(1, w * 0.11);
      for (const s of [-0.27, 0.19]) {
        g.beginPath();
        for (let i = 0; i < P.length; i += 2) {
          const a = Math.max(0, i - 2), b = Math.min(P.length - 2, i + 2), dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], d = Math.hypot(dx, dy) || 1;
          const x = P[i] - (dy / d) * s * w, y = P[i + 1] + (dx / d) * s * w;
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.stroke();
      }
    }
    if (!o.dash && !o.noPool && w > 3.2 * F.u) {
      g.globalAlpha *= 0.5; g.fillStyle = it.col;
      g.beginPath(); g.arc(P[0], P[1], w * 0.62, 0, TAU); g.fill();
    }
    g.restore();
    const n = P.length;
    return [P[n - 2], P[n - 1]];
  }
  // Hand lettering, prepared once per string: each glyph sits on a wobbling baseline with its own
  // slight tilt and size, the felt bleeds a little at the edges, and dry streaks run through the ink.
  const artCache = new Map();
  function glyphArt(F, s, size, col) {
    const key = `${s}|${size.toFixed(1)}|${col}|${F.tex}`;
    if (artCache.has(key)) return artCache.get(key);
    const m = mctx(); m.font = fontOf(size);
    const pad = size * 0.3, w = m.measureText(s).width, base = size * 1.3;
    const c = document.createElement("canvas"); c.width = Math.ceil(w + pad * 2); c.height = Math.ceil(size * 2);
    const g = c.getContext("2d");
    g.font = fontOf(size); g.textBaseline = "alphabetic"; g.fillStyle = g.strokeStyle = col; g.lineJoin = "round";
    let sd = 0;
    for (let i = 0; i < s.length; i++) sd += s.charCodeAt(i) * (i + 1);
    sd = (sd % 997) + 1;
    const glyphs = [];
    for (let i = 0; i < s.length; i++) {
      const ch = s[i], x = pad + m.measureText(s.slice(0, i)).width, cw = m.measureText(ch).width;
      if (ch.trim()) {
        const dy = nz(sd, i * 0.85) * size * 0.04, r = (hash(sd + i * 3.1) - 0.5) * 0.1, sc = 0.95 + hash(sd + i * 5.7) * 0.09;
        g.save(); g.translate(x + cw / 2, base + dy); g.rotate(r); g.scale(sc, sc * (0.97 + hash(sd + i * 1.3) * 0.06));
        g.globalAlpha = 0.95; g.fillText(ch, -cw / 2, 0);
        g.globalAlpha = 0.4; g.lineWidth = Math.max(1, size * 0.03); g.strokeText(ch, -cw / 2, 0);
        g.restore();
      }
      glyphs.push({ x0: x - size * 0.05, x1: x + cw + size * 0.05, ch });
    }
    // Dry streaks where the felt skipped, running the way marker strokes go.
    if (F.tex > 0) {
      const r = rng(sd * 13 + Math.round(size));
      g.globalCompositeOperation = "destination-out"; g.lineCap = "round";
      const n = Math.ceil(w / (size * 0.045));
      for (let k = 0; k < n; k++) {
        const x = pad + r() * w, y = base - size * (0.05 + r() * 0.75), len = size * (0.12 + r() * 0.32);
        const ang = [-1.3, -1.15, -0.15, 0.55][Math.floor(r() * 4)] + (r() - 0.5) * 0.3;
        g.globalAlpha = (0.18 + r() * 0.3) * F.tex; g.lineWidth = Math.max(1, size * (0.01 + r() * 0.016));
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); g.stroke();
      }
    }
    const art = { c, glyphs, pad, base };
    if (artCache.size > 240) artCache.delete(artCache.keys().next().value);
    artCache.set(key, art);
    return art;
  }
  // Lettering is laid down glyph by glyph under the marker tip, which bobs through each letter.
  function write(g, F, it, k) {
    const { y, size, x0 } = it, A = glyphArt(F, it.s, size, it.col), n = A.glyphs.length;
    const pos = clamp(k) * n, i = Math.min(n - 1, Math.floor(pos)), frac = k >= 1 ? 1 : pos - i, gl = A.glyphs[i];
    const rx = k >= 1 ? A.c.width : gl.x0 + (gl.x1 - gl.x0) * frac;
    const dx = x0 - A.pad, dy = y - A.base;
    if (rx >= 1) {
      g.save(); g.globalAlpha *= it.o.alpha ?? 1;
      g.drawImage(A.c, 0, 0, rx, A.c.height, dx, dy, rx, A.c.height);
      g.restore();
    }
    return [dx + Math.min(rx, gl.x1), y - size * (0.22 + 0.34 * Math.abs(Math.sin(frac * Math.PI * 1.5 + i * 0.7)))];
  }
  // Scribble fill: a tight zigzag hatched back and forth across an area, clipped to its shape.
  function zig(bb, step, ang) {
    const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx, cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
    const corners = [[bb.x, bb.y], [bb.x + bb.w, bb.y], [bb.x, bb.y + bb.h], [bb.x + bb.w, bb.y + bb.h]].map(([x, y]) => [(x - cx) * nx + (y - cy) * ny, (x - cx) * dx + (y - cy) * dy]);
    const n0 = Math.min(...corners.map((c) => c[0])), n1 = Math.max(...corners.map((c) => c[0]));
    const d0 = Math.min(...corners.map((c) => c[1])) - step, d1 = Math.max(...corners.map((c) => c[1])) + step;
    const P = [];
    let flip = false;
    for (let s = n0 + step * 0.5; s <= n1; s += step) {
      const a = flip ? d1 : d0, b = flip ? d0 : d1;
      P.push([cx + nx * s + dx * a, cy + ny * s + dy * a], [cx + nx * s + dx * b, cy + ny * s + dy * b]);
      flip = !flip;
    }
    return P;
  }

  // ---- a drawing in sequence -------------------------------------------------------------------------
  // Items are added with a window [a, b] in the drawing's progress q; run() draws them and works out
  // where the marker is: on the active stroke, gliding between strokes, or arriving and leaving.
  class Sk {
    constructor(F, q, map, local, seed) { this.F = F; this.q = q; this.map = map; this.local = local; this.seed = seed; this.it = []; this.off = 0; this.span = 1; this.lateAt = 0.88; }
    // Windows given by a drawer are placed inside the part of the drawing this Sk gives it; a late
    // item (a closing beat) instead takes its window inside the last stretch, after everything else.
    w2(a, b, o) { return o && o.late ? [this.lateAt + a * (1 - this.lateAt), this.lateAt + b * (1 - this.lateAt)] : [this.off + a * this.span, this.off + b * this.span]; }
    s(ctrl, col, w, a, b, o = {}) {
      [a, b] = this.w2(a, b, o);
      const u = this.F.u, pts = o.raw ? ctrl.flat() : wob(ctrl, this.seed + this.it.length * 1.37, u, o.amp ?? 1.3);
      this.it.push({ k: "s", pts, col, w, a, b, o });
      return this;
    }
    box(x, y, w, h, r, col, lw, a, b, o = {}) {
      const u = this.F.u, m = a + (b - a) * 0.62;
      this.s(boxPts(x, y, w, h, r, 0.1, u), col, lw, a, m, o);
      this.s(boxPts(x + 2 * u, y - 2 * u, w - 1 * u, h + 2 * u, r, 0.22, u), col, lw * 0.62, a + (b - a) * 0.5, b, { ...o, alpha: (o.alpha ?? 0.94) * 0.75, amp: 2 });
      return this;
    }
    arrow(ctrl, col, w, a, b, o = {}) {
      const u = this.F.u, pts = ctrl.length > 2 ? cvPts(ctrl) : ctrl, m = a + (b - a) * 0.78;
      this.s(pts, col, w, a, m, o);
      const [x2, y2] = pts[pts.length - 1], [x1, y1] = pts[Math.max(0, pts.length - 3)], ang = Math.atan2(y2 - y1, x2 - x1), h = o.head || 26 * u;
      this.s([[x2 - Math.cos(ang - 0.5) * h, y2 - Math.sin(ang - 0.5) * h], [x2, y2], [x2 - Math.cos(ang + 0.5) * h, y2 - Math.sin(ang + 0.5) * h]], col, w, m, b, { ...o, dash: null, amp: 0.6 });
      return this;
    }
    text(s, x, y, size, col, a, b, o = {}) {
      s = String(s ?? "");
      if (!s) return this;
      size = fitSize(s, size, o.maxW, o.min);
      const w = measure(s, size), x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
      [a, b] = this.w2(a, b, o);
      this.it.push({ k: "t", s, x, y, size, w, x0, col, a, b, o });
      return this;
    }
    fill(bb, col, a, b, o = {}) {
      [a, b] = this.w2(a, b, o);
      const u = this.F.u, pts = wob(zig(bb, o.step || 12 * u, o.ang ?? -0.62), this.seed + this.it.length * 2.1, u, 0.8);
      this.it.push({ k: "s", pts, col, w: o.w || 5 * u, a, b, o: { late: o.late, alpha: o.alpha ?? 0.4, noStreak: true, noPool: true, clip: o.clip || ((g) => g.rect(bb.x, bb.y, bb.w, bb.h)) } });
      return this;
    }
    follow(fn, col, a, b) { [a, b] = this.w2(a, b); this.it.push({ k: "f", fn, col, a, b, o: {} }); return this; }
    start(it) { return it.k === "s" ? [it.pts[0], it.pts[1]] : it.k === "t" ? [it.x0, it.y - it.size * 0.32] : it.fn(0); }
    // One marker draws everything: items run one after another in the order they start, each taking
    // time in proportion to how much ink it lays down (letters count for more than their length), and
    // the whole sequence fills the drawing's span.
    schedule() {
      const main = this.it.filter((it) => !it.o.late), late = this.it.filter((it) => it.o.late);
      this.group(main, main.length ? Math.min(...main.map((it) => it.a)) : 0, this.lateAt);
      this.group(late, this.lateAt, 1);
    }
    group(list, a0, end0) {
      const its = list.map((it, i) => ({ it, i })).sort((p, r) => p.it.a - r.it.a || p.i - r.i);
      if (!its.length) return;
      const u = this.F.u, gap = 70 * u;
      let cur = 0;
      for (const { it } of its) {
        let w;
        if (it.k === "t") w = it.s.length * 210 * u * (it.o.pace || 1);
        else if (it.k === "s") {
          let L = 0;
          for (let i = 2; i < it.pts.length; i += 2) L += Math.hypot(it.pts[i] - it.pts[i - 2], it.pts[i + 1] - it.pts[i - 1]);
          w = it.o.w8 != null ? it.o.w8 * u : L * (it.o.clip ? 0.16 : it.o.dash ? 0.5 : 1) * (it.o.pace || 1) + 20 * u;
        } else w = 300 * u;
        it.s0 = cur; it.s1 = cur + w; cur = it.s1 + gap;
      }
      const sc = (end0 - a0) / Math.max(1e-6, cur - gap);
      for (const { it } of its) { it.a = a0 + it.s0 * sc; it.b = a0 + it.s1 * sc; }
    }
    run(g) {
      if (!this.sched) { this.schedule(); this.sched = true; }
      const F = this.F, q = this.q;
      let act = null, prev = null, next = null;
      for (const it of this.it) {
        const k = span(q, it.a, it.b);
        if (k <= 0) { if (!next || it.a < next.a) next = it; continue; }
        let tip;
        if (it.k === "s") {
          if (it.o.clip) { g.save(); g.beginPath(); it.o.clip(g); g.clip(); tip = ink(g, F, it, k); g.restore(); } else tip = ink(g, F, it, k);
        } else if (it.k === "t") tip = write(g, F, it, k);
        else tip = it.fn(k);
        if (k < 1) { if (!act || it.a >= act.it.a) act = { it, tip }; } else if (!prev || it.b >= prev.it.b) prev = { it, tip };
      }
      const off = (p) => [Math.max(p[0] + 420 * F.u, F.W * 0.75), F.H + 360 * F.u];
      if (act) return { x: act.tip[0], y: act.tip[1], col: act.it.col, lift: 0 };
      if (prev && next) {
        const m = span(q, prev.it.b, next.a), s = this.start(next), e = inout(m);
        return { x: lerp(prev.tip[0], s[0], e), y: lerp(prev.tip[1], s[1], e), col: m > 0.5 ? next.col : prev.it.col, lift: Math.sin(Math.PI * m) };
      }
      if (next) {
        const s = this.start(next), at = this.map(next.a), m = (this.local - (at - 0.45)) / 0.45;
        if (m <= 0) return null;
        const o = off(s), e = ease(m);
        return { x: lerp(o[0], s[0], e), y: lerp(o[1], s[1], e), col: next.col, lift: 1 - e };
      }
      if (prev) {
        // Done drawing: the marker stays at the board, hovering and drifting beside the last mark.
        const at = this.map(prev.it.b), m = clamp((this.local - at) / 0.5), e = inout(m), L = this.local, u = F.u;
        const rx = clamp(prev.tip[0] + 60 * u, 60 * u, F.W - 320 * u) + Math.sin(L * 1.3) * 34 * u + Math.sin(L * 3.3) * 8 * u;
        const ry = clamp(prev.tip[1] + 40 * u, 60 * u, F.H - 280 * u) + Math.sin(L * 1.9 + 1) * 20 * u;
        return { x: lerp(prev.tip[0], rx, e), y: lerp(prev.tip[1], ry, e), col: prev.it.col, lift: 0.55 * e + 0.15 * e * Math.sin(L * 2.6) };
      }
      return null;
    }
  }

  // ---- the marker and the eraser ----------------------------------------------------------------------
  function drawPen(g, F, P) {
    if (!P) return;
    const u = F.u, ang = 0.98, lift = P.lift || 0;
    g.save();
    // Soft shadow on the board, further away while the marker is lifted.
    g.save();
    g.translate(P.x + (16 + lift * 26) * u, P.y + (24 + lift * 30) * u); g.rotate(ang);
    g.filter = `blur(${(7 + lift * 6) * u}px)`;
    g.fillStyle = `rgba(20,28,40,${0.2 - lift * 0.06})`;
    g.beginPath(); g.moveTo(20 * u, -6 * u); g.lineTo(250 * u, -19 * u); g.lineTo(250 * u, 19 * u); g.lineTo(20 * u, 6 * u); g.closePath(); g.fill();
    g.restore();
    g.translate(P.x - lift * 4 * u, P.y - lift * 8 * u); g.rotate(ang);
    const R = 17 * u;
    const cyl = (x0, x1, r, c0, c1, c2) => {
      const gr = g.createLinearGradient(0, -r, 0, r);
      gr.addColorStop(0, c1); gr.addColorStop(0.28, c0); gr.addColorStop(0.62, c1); gr.addColorStop(1, c2);
      g.fillStyle = gr; g.fillRect(x0, -r, x1 - x0, r * 2);
    };
    // Chisel tip in the ink colour, then the cone, collar, barrel and the coloured end cap.
    g.fillStyle = P.col;
    g.beginPath(); g.moveTo(-2 * u, -2.5 * u); g.lineTo(13 * u, -6 * u); g.lineTo(13 * u, 6 * u); g.lineTo(2 * u, 4.5 * u); g.closePath(); g.fill();
    const cone = g.createLinearGradient(0, -R, 0, R);
    cone.addColorStop(0, "#d9dde2"); cone.addColorStop(0.3, "#ffffff"); cone.addColorStop(1, "#9ea6b0");
    g.fillStyle = cone;
    g.beginPath(); g.moveTo(12 * u, -7 * u); g.lineTo(44 * u, -R); g.lineTo(44 * u, R); g.lineTo(12 * u, 7 * u); g.closePath(); g.fill();
    cyl(44 * u, 62 * u, R + 1 * u, "#8f98a3", "#c4cad1", "#5d6670");
    cyl(62 * u, 196 * u, R, "#ffffff", "#e3e7eb", "#a7afb8");
    g.save(); g.globalAlpha = 0.9; cyl(104 * u, 150 * u, R + 0.5 * u, P.col, P.col, "rgba(0,0,0,0.35)"); g.restore();
    g.fillStyle = "rgba(255,255,255,0.5)"; g.fillRect(110 * u, -R * 0.55, 34 * u, R * 0.22);
    cyl(196 * u, 246 * u, R + 2 * u, P.col, P.col, "rgba(0,0,0,0.4)");
    g.fillStyle = "rgba(255,255,255,0.28)"; g.fillRect(198 * u, -R * 0.75, 46 * u, R * 0.3);
    g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(196 * u, -R - 2 * u, 3 * u, R * 2 + 4 * u);
    g.restore();
  }
  // A felt eraser, long side across its travel; a faint smear trails it so a fast swipe still reads.
  function drawEraser(g, F, x, y, tilt, len, dir = 0) {
    const u = F.u, w = len, h = w * 0.34;
    const body = (alpha, ox, oy) => {
      g.save(); g.globalAlpha *= alpha; g.translate(x + ox, y + oy); g.rotate(tilt);
      // Felt pad, then the moulded handle with a finger groove and a highlight.
      g.fillStyle = "#4a4d52"; g.fillRect(-w / 2, h * 0.12, w, h * 0.38);
      g.fillStyle = "rgba(255,255,255,0.08)";
      for (let i = 0; i < 9; i++) g.fillRect(-w / 2, h * (0.16 + i * 0.037), w, 1 * u);
      const gr = g.createLinearGradient(0, -h / 2, 0, h * 0.14);
      gr.addColorStop(0, F.K.eraserLite); gr.addColorStop(0.55, F.K.eraser); gr.addColorStop(1, F.K.eraserDark);
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(-w / 2, h * 0.14); g.lineTo(-w / 2 + 12 * u, -h / 2); g.lineTo(w / 2 - 12 * u, -h / 2); g.lineTo(w / 2, h * 0.14); g.closePath(); g.fill();
      g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(-w * 0.32, -h * 0.2, w * 0.64, h * 0.12);
      g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(-w / 2 + 14 * u, -h / 2 + 4 * u, w - 28 * u, 3 * u);
      g.restore();
    };
    g.save();
    g.save(); g.translate(x + 18 * u, y + 26 * u); g.rotate(tilt); g.filter = `blur(${10 * u}px)`; g.fillStyle = "rgba(20,28,40,0.24)";
    g.fillRect(-w / 2, -h / 2, w, h); g.restore();
    const bx = -Math.cos(dir), by = -Math.sin(dir);
    body(0.12, bx * 70 * u, by * 70 * u); body(0.22, bx * 36 * u, by * 36 * u); body(1, 0, 0);
    g.restore();
  }
  // One continuous swipe: the eraser sweeps across the board in wide bands, left to right, then back,
  // scrubbing a little up and down as it goes. Only what lies under its path is cleared, and a faint
  // ghost of the ink survives.
  function swipePath(F, R) {
    const u = F.u, passes = F.tall ? 4 : 2, band = R.h / passes, len = band / 0.9, thick = len * 0.34, P = [];
    for (let i = 0; i < passes; i++) {
      const y = R.y + band * (i + 0.5), l2r = i % 2 === 0, xa = l2r ? R.x - thick * 0.6 : R.x + R.w + thick * 0.6, xb = l2r ? R.x + R.w + thick * 0.6 : R.x - thick * 0.6;
      const n = Math.ceil(Math.abs(xb - xa) / (12 * u));
      for (let j = 0; j <= n; j++) { const k = j / n, x = lerp(xa, xb, k); P.push(x, y + Math.sin(k * TAU * 3.5 + i) * band * 0.07); }
    }
    return { P, len, thick };
  }
  function erase(lg, F, R, e) {
    const { P, len, thick } = swipePath(F, R);
    let L = 0;
    for (let i = 2; i < P.length; i += 2) L += Math.hypot(P[i] - P[i - 2], P[i + 1] - P[i - 1]);
    let left = L * e, hx = P[0], hy = P[1], dir = 0;
    lg.save();
    lg.globalCompositeOperation = "destination-out";
    lg.lineCap = "butt"; lg.lineJoin = "round";
    lg.beginPath(); lg.moveTo(P[0], P[1]);
    for (let i = 2; i < P.length; i += 2) {
      const d = Math.hypot(P[i] - P[i - 2], P[i + 1] - P[i - 1]);
      dir = Math.atan2(P[i + 1] - P[i - 1], P[i] - P[i - 2]);
      if (d >= left) { const f = d ? left / d : 0; hx = lerp(P[i - 2], P[i], f); hy = lerp(P[i - 1], P[i + 1], f); lg.lineTo(hx, hy); break; }
      left -= d; hx = P[i]; hy = P[i + 1]; lg.lineTo(hx, hy);
    }
    lg.globalAlpha = 0.6; lg.lineWidth = len * 1.12; lg.stroke();
    lg.globalAlpha = 0.93; lg.lineWidth = len * 1.0; lg.stroke();
    // The pad itself, under the eraser right now.
    lg.translate(hx, hy); lg.rotate(dir);
    lg.globalAlpha = 0.9; lg.fillRect(-thick * 0.5, -len * 0.44, thick * 0.5, len * 0.88);
    lg.restore();
    return { x: hx, y: hy, tilt: Math.PI / 2 + dir + Math.sin(e * 30) * 0.03, len, dir };
  }

  // ---- the board -----------------------------------------------------------------------------------
  let boardCache = null, boardKey = "";
  function boardCanvas(F) {
    const { W, H, u, K, tex } = F, key = `${W}x${H}:${K.board}:${tex}`;
    if (boardCache && boardKey === key) return boardCache;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d"), r = rng(404);
    const gr = g.createLinearGradient(0, 0, W * 0.4, H);
    gr.addColorStop(0, K.boardLite); gr.addColorStop(0.55, K.board); gr.addColorStop(1, K.boardDark);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // Uneven melamine: broad soft blotches, a few cloudy eraser smears and fine specks.
    for (let i = 0; i < 46; i++) {
      const x = r() * W, y = r() * H, rad = (160 + r() * 420) * u, dark = r() < 0.5;
      const rg = g.createRadialGradient(x, y, 0, x, y, rad);
      rg.addColorStop(0, dark ? `rgba(${K.smudgeRGB},${0.022 * tex})` : `rgba(255,255,255,${0.05 * tex})`); rg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = rg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    g.lineCap = "round";
    for (let i = 0; i < 9; i++) {
      const x = r() * W, y = r() * H, len = (260 + r() * 520) * u, a = (r() - 0.5) * 0.5;
      g.strokeStyle = `rgba(${K.smudgeRGB},${(0.01 + r() * 0.014) * tex})`; g.lineWidth = (60 + r() * 70) * u;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 1; k <= 6; k++) g.lineTo(x + Math.cos(a) * len * (k / 6), y + Math.sin(a) * len * (k / 6) + Math.sin(k * 1.7 + i) * 22 * u);
      g.stroke();
    }
    // Ghosts of earlier sessions, half wiped: words, boxes, arrows and tallies.
    const words = ["v3 final?", "trim 0:12", "B-roll", "fix audio", "cut 4 → 3", "intro hook", "colour pass", "export Fri", "music cue", "swap shots"];
    g.save(); g.filter = `blur(${2.4 * u}px)`;
    for (let i = 0; i < 26; i++) {
      const x = r() * W, y = r() * H, kind = Math.floor(r() * 4);
      g.save(); g.translate(x, y); g.rotate((r() - 0.5) * 0.18);
      g.globalAlpha = (0.022 + r() * 0.03) * tex;
      g.strokeStyle = g.fillStyle = r() < 0.75 ? K.ghost : K.ghostTint;
      g.lineWidth = 6 * u; g.lineJoin = "round";
      if (kind === 0 || kind === 3) { g.font = fontOf((40 + r() * 46) * u); g.fillText(words[i % words.length], 0, 0); }
      else if (kind === 1) { const w = (120 + r() * 220) * u, h = (70 + r() * 120) * u; g.beginPath(); boxPts(0, 0, w, h, 14 * u, 0.1, u).forEach(([px, py], j) => (j ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke(); }
      else {
        const L = (120 + r() * 220) * u;
        g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(L * 0.5, -40 * u, L, 0); g.moveTo(L - 24 * u, -14 * u); g.lineTo(L, 0); g.lineTo(L - 22 * u, 18 * u); g.stroke();
      }
      g.restore();
    }
    g.restore();
    for (let i = 0; i < 520; i++) {
      g.fillStyle = r() < 0.6 ? `rgba(${K.smudgeRGB},${(0.06 + r() * 0.1) * tex})` : `rgba(255,255,255,${0.3 * tex})`;
      g.fillRect(r() * W, r() * H, (0.8 + r() * 1.6) * u, (0.8 + r() * 1.6) * u);
    }
    // A fixed window reflection, high on the left.
    g.save(); g.filter = `blur(${40 * u}px)`; g.fillStyle = `rgba(255,255,255,${K.reflect * tex})`;
    g.fillRect(W * 0.06, H * 0.05, W * 0.12, H * 0.36); g.fillRect(W * 0.2, H * 0.05, W * 0.12, H * 0.36);
    g.restore();
    // Aluminium frame with moulded corner caps.
    const fw = 15 * u;
    const rail = (x, y, w, h, vert) => {
      const lg = vert ? g.createLinearGradient(x, 0, x + w, 0) : g.createLinearGradient(0, y, 0, y + h);
      lg.addColorStop(0, K.frameLite); lg.addColorStop(0.45, K.frame); lg.addColorStop(0.55, K.frameLite); lg.addColorStop(1, K.frameDark);
      g.fillStyle = lg; g.fillRect(x, y, w, h);
    };
    rail(0, 0, W, fw, false); rail(0, H - fw, W, fw, false); rail(0, 0, fw, H, true); rail(W - fw, 0, fw, H, true);
    g.fillStyle = "rgba(0,0,0,0.12)";
    g.fillRect(fw, fw, W - fw * 2, 2 * u); g.fillRect(fw, fw, 2 * u, H - fw * 2);
    for (const [x, y] of [[0, 0], [W - 34 * u, 0], [0, H - 34 * u], [W - 34 * u, H - 34 * u]]) {
      const cg = g.createLinearGradient(x, y, x + 34 * u, y + 34 * u);
      cg.addColorStop(0, K.capLite); cg.addColorStop(1, K.cap);
      g.fillStyle = cg; g.beginPath(); g.roundRect(x, y, 34 * u, 34 * u, 8 * u); g.fill();
    }
    // The marker ledge along the bottom rail, with spare markers lying in it.
    const tw = Math.min(W * 0.4, 440 * u), tx = W - fw - 50 * u - tw, th = 13 * u, ty = H - fw - th;
    g.save(); g.filter = `blur(${8 * u}px)`; g.fillStyle = "rgba(20,28,40,0.18)"; g.fillRect(tx + 6 * u, ty - 4 * u, tw, th + 8 * u); g.restore();
    const tg = g.createLinearGradient(0, ty, 0, ty + th);
    tg.addColorStop(0, K.frameLite); tg.addColorStop(0.4, K.frame); tg.addColorStop(1, K.frameDark);
    g.fillStyle = tg; g.beginPath(); g.roundRect(tx, ty, tw, th, 5 * u); g.fill();
    g.fillStyle = "rgba(255,255,255,0.45)"; g.fillRect(tx + 6 * u, ty + 2 * u, tw - 12 * u, 2 * u);
    [[K.blue, 0.04, -0.02], [K.ink, 0.36, 0.012], [K.green, 0.68, -0.008]].forEach(([col, at, rot]) => lyingMarker(g, u, tx + tw * at + 14 * u, ty - 1 * u, rot, col));
    boardKey = key;
    return (boardCache = c);
  }
  // A capped marker lying on its side in the ledge.
  function lyingMarker(g, u, x, y, rot, col) {
    const L = 112 * u, R = 8.5 * u;
    g.save(); g.translate(x, y); g.rotate(rot);
    const cyl = (x0, x1, r, c0, c1, c2) => {
      const gr = g.createLinearGradient(0, -r, 0, r);
      gr.addColorStop(0, c1); gr.addColorStop(0.3, c0); gr.addColorStop(0.65, c1); gr.addColorStop(1, c2);
      g.fillStyle = gr; g.fillRect(x0, -r, x1 - x0, r * 2);
    };
    g.save(); g.filter = `blur(${4 * u}px)`; g.fillStyle = "rgba(20,28,40,0.25)"; g.fillRect(4 * u, -R + 6 * u, L, R * 2); g.restore();
    g.fillStyle = "#c4cad1"; g.beginPath(); g.moveTo(0, -R * 0.55); g.lineTo(-L * 0.1, -R * 0.3); g.lineTo(-L * 0.1, R * 0.3); g.lineTo(0, R * 0.55); g.closePath(); g.fill();
    g.fillStyle = col; g.fillRect(-L * 0.13, -R * 0.28, L * 0.04, R * 0.56);
    cyl(0, L * 0.68, R, "#ffffff", "#e3e7eb", "#a1a9b2");
    g.save(); g.globalAlpha = 0.9; cyl(L * 0.22, L * 0.44, R + 0.5 * u, col, col, "rgba(0,0,0,0.35)"); g.restore();
    cyl(L * 0.68, L, R + 2 * u, col, col, "rgba(0,0,0,0.45)");
    g.fillStyle = "rgba(255,255,255,0.3)"; g.fillRect(L * 0.7, -R * 0.75, L * 0.28, R * 0.3);
    g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(L * 0.68, -R - 2 * u, 3 * u, R * 2 + 4 * u);
    g.restore();
  }
  // A sticky note held by a round magnet in the top corner; its free corner lifts in the room's draught.
  // Each scene's note carries its own small doodle, so the corner of the board changes with the topic.
  function sticky(g, F, x, y, s, kind, t, alpha) {
    const { u, K } = F, lift = 0.5 + 0.5 * Math.sin(t * 1.6 + kind) , tilt = -0.05 + 0.012 * Math.sin(t * 0.9 + kind * 2);
    g.save(); g.globalAlpha *= alpha; g.translate(x + s / 2, y + s / 2); g.rotate(tilt); g.translate(-s / 2, -s / 2);
    const c = s * (0.16 + 0.05 * lift);
    g.save(); g.filter = `blur(${(8 + 6 * lift) * u}px)`; g.fillStyle = "rgba(20,28,40,0.22)";
    g.beginPath(); g.moveTo(6 * u, 10 * u); g.lineTo(s + 4 * u, 10 * u); g.lineTo(s + 8 * u + c * 0.3, s - c + 14 * u); g.lineTo(s - c + 10 * u, s + 16 * u + c * 0.3); g.lineTo(8 * u, s + 8 * u); g.closePath(); g.fill(); g.restore();
    const pg = g.createLinearGradient(0, 0, s, s);
    pg.addColorStop(0, K.stickyLite); pg.addColorStop(1, K.sticky);
    g.fillStyle = pg; g.beginPath(); g.moveTo(0, 0); g.lineTo(s, 0); g.lineTo(s, s - c); g.lineTo(s - c, s); g.lineTo(0, s); g.closePath(); g.fill();
    g.fillStyle = K.stickyFold; g.beginPath(); g.moveTo(s, s - c); g.lineTo(s - c * 0.9, s - c * 0.9); g.lineTo(s - c, s); g.closePath(); g.fill();
    g.fillStyle = "rgba(0,0,0,0.05)"; g.fillRect(0, 0, s, s * 0.12);
    // The doodle, in a thin pen.
    g.strokeStyle = K.stickyInk; g.lineWidth = 4 * u; g.lineCap = "round"; g.lineJoin = "round";
    const P = (pts) => { g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px * s, py * s) : g.moveTo(px * s, py * s))); g.stroke(); };
    if (kind === 0) { for (let i = 0; i < 3; i++) { const yy = 0.3 + i * 0.2; P([[0.16, yy], [0.24, yy + 0.06], [0.36, yy - 0.06]]); P([[0.44, yy], [0.84 - i * 0.12, yy]]); } }
    else if (kind === 1) { P([[0.18, 0.78], [0.18, 0.24]]); P([[0.18, 0.78], [0.84, 0.78]]); P([[0.24, 0.66], [0.42, 0.52], [0.56, 0.6], [0.8, 0.3]]); P([[0.7, 0.3], [0.8, 0.3], [0.8, 0.4]]); }
    else if (kind === 2) { g.beginPath(); g.arc(0.5 * s, 0.5 * s, 0.28 * s, 0, TAU); g.stroke(); g.beginPath(); g.arc(0.4 * s, 0.44 * s, 3 * u, 0, TAU); g.arc(0.6 * s, 0.44 * s, 3 * u, 0, TAU); g.stroke(); g.beginPath(); g.arc(0.5 * s, 0.52 * s, 0.14 * s, 0.4, Math.PI - 0.4); g.stroke(); }
    else if (kind === 3) { P([[0.14, 0.5], [0.34, 0.5]]); P([[0.28, 0.44], [0.34, 0.5], [0.28, 0.56]]); P([[0.42, 0.5], [0.6, 0.5]]); P([[0.54, 0.44], [0.6, 0.5], [0.54, 0.56]]); g.beginPath(); g.arc(0.76 * s, 0.5 * s, 0.09 * s, 0, TAU); g.stroke(); }
    else { P([[0.2, 0.3], [0.2, 0.74]]); P([[0.12, 0.42], [0.2, 0.3], [0.28, 0.42]]); P([[0.62, 0.74], [0.62, 0.3]]); P([[0.54, 0.62], [0.62, 0.74], [0.7, 0.62]]); P([[0.36, 0.52], [0.46, 0.52]]); }
    g.restore();
    // The magnet.
    const mx = x + s * 0.5, my = y + 4 * u, mr = 20 * u;
    g.save(); g.globalAlpha *= alpha;
    g.save(); g.filter = `blur(${5 * u}px)`; g.fillStyle = "rgba(20,28,40,0.3)"; g.beginPath(); g.arc(mx + 5 * u, my + 8 * u, mr, 0, TAU); g.fill(); g.restore();
    const mg = g.createRadialGradient(mx - mr * 0.4, my - mr * 0.4, mr * 0.1, mx, my, mr);
    mg.addColorStop(0, "rgba(255,255,255,0.85)"); mg.addColorStop(0.35, K.magnet); mg.addColorStop(1, "rgba(0,0,0,0.45)");
    g.fillStyle = K.magnet; g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
    g.fillStyle = mg; g.fill();
    g.restore();
  }
  function gloss(g, F, t) {
    const { W, H, K, tex } = F;
    if (!tex) return;
    const ph = (t * 0.045 + 0.1) % 1, cx = lerp(-0.5 * W, 1.5 * W, ph);
    const gr = g.createLinearGradient(cx - W * 0.25, 0, cx + W * 0.25, H * 0.5);
    gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.45, `rgba(255,255,255,${K.sheen * tex})`);
    gr.addColorStop(0.5, `rgba(255,255,255,${K.sheen * 1.5 * tex})`); gr.addColorStop(0.56, `rgba(255,255,255,${K.sheen * tex})`); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.save(); g.fillStyle = gr; g.fillRect(0, 0, W, H); g.restore();
  }

  // ---- page layout -----------------------------------------------------------------------------------
  const lineCache = {};
  function headLines(id) {
    if (lineCache[id]) return lineCache[id];
    const el = typeof document !== "undefined" && document.getElementById(id), root = el && document.getElementById("root");
    if (!el || !root || !el.firstChild) return (lineCache[id] = []);
    let ox = 0, oy = 0;
    for (let n = el; n && n !== root; n = n.offsetParent) { ox += n.offsetLeft; oy += n.offsetTop; }
    const scale = root.getBoundingClientRect().width / (Number(root.dataset.width) || 1920) || 1;
    const er = el.getBoundingClientRect(), range = document.createRange();
    const textNode = [...el.childNodes].find((n) => n.nodeType === 3) || el;
    range.selectNodeContents(textNode);
    const out = [];
    for (const r of range.getClientRects()) {
      const line = { x: ox + (r.left - er.left) / scale, y: oy + (r.top - er.top) / scale, w: r.width / scale, h: r.height / scale };
      if (line.w > 1 && !out.some((o) => Math.abs(o.y - line.y) < 2)) out.push(line);
    }
    out.box = { x: ox, y: oy, w: el.offsetWidth, h: el.offsetHeight };
    return (lineCache[id] = out);
  }
  function controls() {
    if (window.__dreamcut && window.__dreamcut.controls) return window.__dreamcut.controls;
    try { if (typeof dc !== "undefined" && dc && dc.controls) return dc.controls; } catch (e) { /* not on this page */ }
    return {};
  }
  function areaOf(F, id) {
    const { W, H, u, tall } = F, side = (tall ? 90 : 140) * u, lines = headLines(`${id}-title`);
    const fallback = tall ? H * 0.3 : H * 0.34;
    const top = lines.length ? Math.min(fallback, Math.max(Math.max(...lines.map((l) => l.y + l.h)) + (tall ? 70 : 56) * u, H * 0.19)) : fallback;
    return { x: side, y: top, w: W - side * 2, h: H - (tall ? 120 : 64) * u - top };
  }
  // Free bands above and below a statement's text, for the doodles that surround it.
  function bandsOf(F, ids) {
    const { H, u } = F;
    const lines = ids.flatMap((id) => headLines(id));
    if (!lines.length) return { above: { y0: 60 * u, y1: H * 0.3 }, below: { y0: H * 0.66, y1: H - 50 * u }, right: F.W * 0.7 };
    const top = Math.min(...lines.map((l) => l.y)), bottom = Math.max(...lines.map((l) => l.y + l.h));
    return { above: { y0: 50 * u, y1: top - 26 * u }, below: { y0: bottom + 46 * u, y1: H - 46 * u }, right: Math.max(...lines.map((l) => l.x + l.w)), lines };
  }

  // ---- scenes ----------------------------------------------------------------------------------------
  function sparks(g, F, x, y, r, n, t, col, a0 = 0) {
    const u = F.u;
    g.save(); g.strokeStyle = col; g.lineCap = "round"; g.lineWidth = 5 * u;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU * 0.5 - 0.6, p = 0.5 + 0.5 * Math.sin(t * 5 + i * 1.9), r0 = r + 6 * u * p, r1 = r0 + (14 + 16 * p) * u;
      g.globalAlpha = 0.55 + 0.4 * p;
      g.beginPath(); g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); g.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); g.stroke();
    }
    g.restore();
  }

  function chart(g, F, A, d, q, t, sk) {
    const { u, tall, K } = F;
    const vals = (d.values || []).map((v) => Math.max(0, Number(v) || 0)), n = Math.max(1, vals.length), mx = Math.max(...vals, 1e-6);
    const hi = d.highlight >= 0 && d.highlight < n ? d.highlight : -1;
    const P = tall ? { x: A.x + 40 * u, y: A.y + 110 * u, w: A.w - 60 * u, h: A.h * 0.46 } : { x: A.x + 40 * u, y: A.y + 90 * u, w: A.w * 0.6, h: A.h - 210 * u };
    const base = P.y + P.h;
    sk.arrow([[P.x, base + 16 * u], [P.x, P.y - 50 * u]], K.ink, 6 * u, 0, 0.1);
    sk.arrow([[P.x - 16 * u, base], [P.x + P.w + 40 * u, base]], K.ink, 6 * u, 0.05, 0.16);
    for (let i = 1; i <= 3; i++) sk.s([[P.x + 14 * u, base - (P.h - 60 * u) * (i / 3)], [P.x + P.w, base - (P.h - 60 * u) * (i / 3)]], K.ink, 3 * u, 0.08 + i * 0.02, 0.18 + i * 0.02, { alpha: 0.22, dash: [12 * u, 16 * u] });
    const slot = (P.w - 30 * u) / n, bw = Math.min(slot * 0.56, 190 * u);
    let hot = null;
    vals.forEach((v, i) => {
      const cx = P.x + 30 * u + slot * (i + 0.5), x = cx - bw / 2, h = Math.max(26 * u, (v / mx) * (P.h - 80 * u)), top = base - h, isHot = i === hi;
      const col = isHot ? K.acc : K.ink, a = 0.14 + i * 0.085, bob = q >= 1 && isHot ? Math.sin(t * 3) * 3 * u : 0;
      sk.s([[x, base], [x, top], [x + bw, top], [x + bw, base]], col, 6.5 * u, a, a + 0.13);
      sk.s([[x + 3 * u, base - 2 * u], [x + 2 * u, top - 3 * u], [x + bw + 2 * u, top - 1 * u], [x + bw + 1 * u, base - 3 * u]], col, 4 * u, a + 0.08, a + 0.2, { alpha: 0.7, amp: 2 });
      sk.fill({ x: x + 5 * u, y: top + 5 * u, w: bw - 10 * u, h: h - 6 * u }, isHot ? K.acc : K.blue, a + 0.12, a + 0.27, { alpha: isHot ? 0.5 : 0.34, step: 13 * u });
      sk.text(fmt(v, d), cx, top - 20 * u + bob, isHot ? 76 * u : 64 * u, col, a + 0.2, a + 0.27, { align: "center", maxW: slot * 1.05, min: 42 * u });
      sk.text(d.labels[i] || "", cx, base + 60 * u, 46 * u, K.ink, a + 0.22, a + 0.3, { align: "center", maxW: slot * 0.96, min: 42 * u });
      if (isHot) hot = { cx, top, v, label: d.labels[i] || "" };
    });
    if (!hot) { sk.run(g); return sk; }
    const R = tall ? { x: A.x, y: base + 130 * u, w: A.w, h: A.y + A.h - base - 130 * u } : { x: A.x + A.w * 0.68, y: A.y + 30 * u, w: A.w * 0.32, h: A.h - 60 * u };
    const cx = R.x + R.w / 2, numSize = fitSize(fmt(hot.v, d), 132 * u, R.w - 140 * u, 96 * u), numW = measure(fmt(hot.v, d), numSize);
    const ny = tall ? R.y + R.h * 0.52 + 30 * u : R.y + 270 * u, ey = ny - numSize * 0.34, rx = numW / 2 + 60 * u, ry = numSize * 0.72;
    sk.text(hot.label, cx, ey - ry - 34 * u, 48 * u, K.ink, 0.5, 0.58, { align: "center", maxW: R.w - 20 * u, min: 42 * u });
    sk.text(fmt(hot.v, d), cx, ny, numSize, K.acc, 0.58, 0.7, { align: "center" });
    sk.s(elPts(cx, ey, rx, ry, -2.5, TAU + 0.5), K.acc, 7 * u, 0.7, 0.8);
    sk.s(elPts(cx + 4 * u, ey - 3 * u, rx * 1.04, ry * 1.06, -2.0, TAU + 0.35), K.acc, 4 * u, 0.76, 0.84, { alpha: 0.7, amp: 2.4 });
    const others = vals.filter((_, i) => i !== hi);
    if (others.length) {
      const mean = others.reduce((s, v) => s + v, 0) / others.length, pct = mean > 0 ? Math.round(((hot.v - mean) / mean) * 100) : 0;
      if (mean > 0) sk.text(`${pct >= 0 ? "+" : "−"}${Math.abs(pct)}% vs the rest`, cx, ey + ry + 66 * u, 46 * u, pct >= 0 ? K.green : K.acc, 0.84, 0.94, { align: "center", maxW: R.w, min: 42 * u });
    }
    const pts = tall
      ? [[hot.cx + 50 * u, base + 92 * u], [lerp(hot.cx, cx - rx, 0.5) + 40 * u, base + 120 * u], [cx - rx - 12 * u, ey - ry * 0.4]]
      : [[hot.cx + 30 * u, hot.top - 96 * u], [lerp(hot.cx, cx - rx, 0.55), Math.max(A.y - 10 * u, Math.min(hot.top, ey) - 150 * u)], [cx - rx - 14 * u, ey - ry * 0.3]];
    sk.arrow(pts, K.blue, 5 * u, 0, 1, { dash: [16 * u, 14 * u], dashOff: -t * 60 * u, late: true });
    sk.run(g);
    if (q >= 0.86) sparks(g, F, cx + rx * 0.72, ey - ry * 0.72, 18 * u, 3, t, K.acc, -0.2);
    return sk;
  }

  // The device's screen: a preview, a proposal card and a small timeline with a running playhead.
  function screen(sk, g, F, S, phone, a, t, q) {
    const { u, K } = F;
    const pv = phone ? { x: S.x + S.w * 0.07, y: S.y + S.h * 0.07, w: S.w * 0.86, h: S.h * 0.36 } : { x: S.x + S.w * 0.04, y: S.y + S.h * 0.07, w: S.w * 0.55, h: S.h * 0.5 };
    const cd = phone ? { x: pv.x, y: S.y + S.h * 0.48, w: pv.w, h: S.h * 0.15 } : { x: S.x + S.w * 0.64, y: pv.y, w: S.w * 0.32, h: pv.h };
    const T = phone ? { x: pv.x, y: S.y + S.h * 0.68, w: pv.w, h: S.h * 0.27 } : { x: pv.x, y: S.y + S.h * 0.65, w: S.w * 0.92, h: S.h * 0.3 };
    sk.box(pv.x, pv.y, pv.w, pv.h, 8 * u, K.ink, 4.5 * u, a, a + 0.08);
    const bob = Math.sin(t * 1.8) * 4 * u, sr = Math.min(pv.w, pv.h) * 0.1;
    sk.s([[pv.x + 4 * u, pv.y + pv.h * 0.82], [pv.x + pv.w * 0.22, pv.y + pv.h * 0.52], [pv.x + pv.w * 0.38, pv.y + pv.h * 0.7], [pv.x + pv.w * 0.6, pv.y + pv.h * 0.4], [pv.x + pv.w - 4 * u, pv.y + pv.h * 0.78]], K.ink, 4 * u, a + 0.06, a + 0.12);
    sk.s(elPts(pv.x + pv.w * 0.8, pv.y + pv.h * 0.26 + bob, sr, sr), K.acc, 4 * u, a + 0.1, a + 0.14);
    const pcx = pv.x + pv.w * 0.48, pcy = pv.y + pv.h * 0.56, ps = Math.min(pv.w, pv.h) * 0.13;
    sk.s([[pcx - ps * 0.6, pcy - ps], [pcx + ps, pcy], [pcx - ps * 0.6, pcy + ps], [pcx - ps * 0.6, pcy - ps]], K.blue, 4.5 * u, a + 0.12, a + 0.16);
    sk.box(cd.x, cd.y, cd.w, cd.h, 8 * u, K.acc, 4.5 * u, a + 0.12, a + 0.2);
    const rows = phone ? 2 : 4;
    for (let i = 0; i < rows; i++) {
      const y = cd.y + cd.h * ((i + 1) / (rows + 1.4)), x2 = cd.x + cd.w * (i % 2 ? 0.62 : 0.8);
      sk.s([[cd.x + cd.w * 0.12, y], [x2, y]], K.ink, 4 * u, a + 0.16 + i * 0.015, a + 0.2 + i * 0.015, { alpha: 0.55, amp: 1.8 });
    }
    const cbx = cd.x + cd.w * (phone ? 0.84 : 0.16), cby = cd.y + cd.h * (phone ? 0.5 : 0.84), cbs = Math.min(cd.h * 0.22, 22 * u);
    sk.s([[cbx - cbs, cby], [cbx - cbs * 0.2, cby + cbs * 0.8], [cbx + cbs * 1.3, cby - cbs * 1.1]], K.green, 5 * u, a + 0.22, a + 0.25);
    // Timeline.
    const tick = [];
    for (let i = 0; i <= 16; i++) { const x = T.x + (T.w * i) / 16; tick.push([[x, T.y], [x, T.y + (i % 4 ? 6 : 12) * u]]); }
    sk.s([[T.x, T.y], [T.x + T.w, T.y]], K.ink, 3.5 * u, a + 0.16, a + 0.2, { alpha: 0.7 });
    tick.forEach((p, i) => sk.s(p, K.ink, 2.5 * u, a + 0.18 + i * 0.002, a + 0.2 + i * 0.002, { alpha: 0.6, raw: true }));
    const lh = T.h / 3.4, gap = lh * 0.22;
    const lanes = [[[0, 0.22], [0.25, 0.3], [0.58, 0.4]], [[0.06, 0.3], [0.42, 0.3, 1]]];
    let hotC = null;
    lanes.forEach((clips, r) => clips.forEach(([s0, w, isHot], i) => {
      const x = T.x + T.w * s0, y = T.y + 16 * u + r * (lh + gap), cw = T.w * w - 5 * u, b0 = a + 0.2 + (r * 3 + i) * 0.025;
      if (isHot) {
        sk.s(boxPts(x, y, cw, lh, 5 * u, 0.1, u), K.acc, 4 * u, b0, b0 + 0.05, { dash: [10 * u, 7 * u] });
        sk.fill({ x: x + 2 * u, y: y + 2 * u, w: cw - 4 * u, h: lh - 4 * u }, K.acc, b0 + 0.04, b0 + 0.09, { alpha: 0.45, step: 9 * u, w: 4 * u });
        hotC = [x + cw / 2, y + lh / 2];
      } else sk.s(boxPts(x, y, cw, lh, 5 * u, 0.1, u), K.ink, 4 * u, b0, b0 + 0.05);
    }));
    const wy = T.y + 16 * u + 2 * (lh + gap) + lh * 0.4, wave = [];
    for (let i = 0; i <= 60; i++) {
      const x = T.x + (T.w * i) / 60, amp = lh * 0.45 * (0.35 + 0.65 * Math.abs(Math.sin(i * 0.37 + 1))) * (0.75 + 0.25 * Math.sin(t * 7 + i * 0.8));
      wave.push([x, wy + (i % 2 ? amp : -amp)]);
    }
    sk.s(wave, K.blue, 3 * u, a + 0.3, a + 0.38, { raw: true, alpha: 0.85, w8: 900 });
    if (q > a + 0.38) {
      const px = T.x + T.w * ((t * 0.09 + 0.15) % 1);
      g.save(); g.strokeStyle = K.acc; g.lineWidth = 4 * u; g.lineCap = "round";
      g.beginPath(); g.moveTo(px, T.y - 10 * u); g.lineTo(px, wy + lh * 0.6); g.stroke();
      g.fillStyle = K.acc; g.beginPath(); g.moveTo(px - 9 * u, T.y - 18 * u); g.lineTo(px + 9 * u, T.y - 18 * u); g.lineTo(px, T.y - 4 * u); g.closePath(); g.fill();
      g.restore();
    }
    return { anchors: [[pcx, pv.y + pv.h * 0.32], hotC || [T.x + T.w / 2, T.y + lh], [T.x + T.w * 0.3, wy]], hot: hotC };
  }
  function object(g, F, A, d, q, t, sk) {
    const { u, tall, K } = F, phone = d.kind === "phone";
    let S, devBottom, L;
    if (!phone) {
      const DR = tall ? { x: A.x, y: A.y + 20 * u, w: A.w, h: A.h * 0.5 } : { x: A.x, y: A.y + 20 * u, w: A.w * 0.58, h: A.h - 40 * u };
      const lw = Math.min(DR.w * (tall ? 0.94 : 1), DR.h / 0.72), lh = lw * 0.62, lx = DR.x + (DR.w - lw) / 2, ly = tall ? DR.y : DR.y + (DR.h - lw * 0.7) / 2;
      sk.box(lx, ly, lw, lh, 20 * u, K.ink, 7 * u, 0, 0.14);
      const bt = ly + lh, bh = lw * 0.055;
      sk.s([[lx - lw * 0.07, bt + bh], [lx + lw * 1.07, bt + bh], [lx + lw, bt + 3 * u], [lx, bt + 3 * u], [lx - lw * 0.07, bt + bh]], K.ink, 6.5 * u, 0.12, 0.22);
      sk.s([[lx + lw * 0.42, bt + bh * 0.45], [lx + lw * 0.58, bt + bh * 0.45]], K.ink, 4 * u, 0.2, 0.23, { alpha: 0.7 });
      S = { x: lx + lw * 0.04, y: ly + lw * 0.035, w: lw * 0.92, h: lh - lw * 0.07 };
      sk.s(boxPts(S.x, S.y, S.w, S.h, 6 * u, 0.1, u), K.ink, 4 * u, 0.1, 0.2, { alpha: 0.75 });
      devBottom = bt + bh; L = { lx, lw };
    } else {
      const ph = tall ? A.h * 0.56 : A.h - 40 * u, pw = ph * 0.5, px = tall ? A.x + (A.w - pw) / 2 : A.x + A.w * 0.29 - pw / 2, py = A.y + 20 * u;
      sk.box(px, py, pw, ph, 46 * u, K.ink, 7 * u, 0, 0.14);
      sk.s([[px + pw * 0.4, py + 26 * u], [px + pw * 0.6, py + 26 * u]], K.ink, 7 * u, 0.12, 0.15);
      S = { x: px + 22 * u, y: py + 50 * u, w: pw - 44 * u, h: ph - 90 * u };
      sk.s(boxPts(S.x, S.y, S.w, S.h, 18 * u, 0.1, u), K.ink, 4 * u, 0.1, 0.2, { alpha: 0.75 });
      devBottom = py + ph; L = { lx: px, lw: pw };
    }
    const sc = screen(sk, g, F, S, phone, 0.2, t, q);
    const labels = d.callouts || [];
    labels.forEach((label, i) => {
      if (!label) return;
      const a = 0.58 + i * 0.12;
      let cx, cy, tx, maxW, pts;
      const [ax, ay] = sc.anchors[i];
      if (!tall) {
        const colx = A.x + A.w * 0.64;
        cx = colx + 44 * u; cy = A.y + A.h * (0.2 + 0.3 * i); tx = colx + 104 * u; maxW = A.x + A.w + 60 * u - tx;
        pts = [[colx - 8 * u, cy], [lerp(colx, ax, 0.5), lerp(cy, ay, 0.35) - 30 * u], [ax + 16 * u, ay - 8 * u]];
      } else {
        cx = A.x + 74 * u; cy = devBottom + 110 * u + i * 132 * u; tx = A.x + 140 * u; maxW = A.x + A.w - tx;
        const ox = A.x - 18 * u - i * 24 * u;
        pts = [[cx - 36 * u, cy], [ox, cy - 50 * u], [ox + 10 * u, devBottom - 60 * u], [ax - 16 * u, ay + 10 * u]];
      }
      sk.arrow(pts, K.blue, 5 * u, a, a + 0.06);
      sk.s(elPts(cx, cy, 42 * u, 42 * u), K.acc, 6 * u, a + 0.05, a + 0.08);
      sk.text(String(i + 1), cx, cy + 20 * u, 58 * u, K.acc, a + 0.07, a + 0.09, { align: "center" });
      sk.text(label, tx, cy + 20 * u, 58 * u, K.ink, a + 0.08, a + 0.12, { maxW, min: 44 * u });
    });
    if (sc.hot) {
      const hx = sc.hot[0] + 22 * u + Math.cos(t * 1.6) * 12 * u, hy = sc.hot[1] + 14 * u + Math.sin(t * 2.3) * 8 * u, s = 30 * u;
      sk.s([[hx, hy], [hx, hy + s], [hx + s * 0.28, hy + s * 0.72], [hx + s * 0.5, hy + s * 1.1], [hx + s * 0.64, hy + s * 1.02], [hx + s * 0.44, hy + s * 0.66], [hx + s * 0.78, hy + s * 0.62], [hx, hy]], K.ink, 4 * u, 0, 1, { amp: 0.4, late: true });
    }
    sk.run(g);
    return sk;
  }

  // Original marker people: round heads with different hair, scribble-filled tops, waving arms.
  function figure(sk, F, cx, ground, FH, i, col, fillCol, isHi, t, a) {
    const u = F.u, bob = Math.sin(t * 2.1 + i * 1.3) * 4 * u, hr = FH * 0.125, hy = ground - FH + hr + bob;
    const neck = hy + hr + FH * 0.03, hip = ground - FH * 0.37 + bob * 0.5, sw = FH * 0.2, hw = FH * 0.15, lw = 6 * u, W = (x, y) => [x, y];
    sk.s(elPts(cx, hy, hr, hr * 1.05, -2 + i, TAU + 0.4), col, lw, a, a + 0.04);
    const v = i % 6;
    if (v === 0) { const P = []; for (let k = 0; k <= 6; k++) P.push(W(cx - hr * 0.9 + (hr * 1.8 * k) / 6, hy - hr * (k % 2 ? 1.35 : 0.95))); sk.s(P, col, lw * 0.8, a + 0.03, a + 0.06); }
    else if (v === 1) sk.s(elPts(cx, hy, hr * 1.12, hr * 1.12, Math.PI * 0.85, Math.PI * 1.3), col, lw * 1.4, a + 0.03, a + 0.06);
    else if (v === 2) { sk.s(elPts(cx, hy - hr * 0.2, hr * 1.02, hr * 0.9, Math.PI, Math.PI), col, lw, a + 0.03, a + 0.05); sk.s([W(cx - hr * 1.05, hy - hr * 0.25), W(cx + hr * 1.7, hy - hr * 0.3)], col, lw, a + 0.05, a + 0.06); }
    else if (v === 3) sk.s(elPts(cx, hy - hr * 1.3, hr * 0.4, hr * 0.36), col, lw, a + 0.03, a + 0.06);
    else if (v === 4) { const P = []; for (let k = 0; k <= 22; k++) { const an = Math.PI * 1.05 + (Math.PI * 0.9 * k) / 22, rr = hr * (1.12 + 0.14 * Math.sin(k * 2.2)); P.push(W(cx + Math.cos(an) * rr, hy + Math.sin(an) * rr)); } sk.s(P, col, lw * 0.9, a + 0.03, a + 0.06); }
    else { sk.s(elPts(cx - hr * 0.38, hy - hr * 0.05, hr * 0.26, hr * 0.22), col, 4 * u, a + 0.03, a + 0.05); sk.s(elPts(cx + hr * 0.38, hy - hr * 0.05, hr * 0.26, hr * 0.22), col, 4 * u, a + 0.04, a + 0.06); }
    if (v !== 5) { sk.s(elPts(cx - hr * 0.36, hy - hr * 0.08, 2.5 * u, 3 * u), col, 6 * u, a + 0.05, a + 0.055, { amp: 0 }); sk.s(elPts(cx + hr * 0.36, hy - hr * 0.08, 2.5 * u, 3 * u), col, 6 * u, a + 0.055, a + 0.06, { amp: 0 }); }
    sk.s(elPts(cx, hy + hr * 0.18, hr * 0.42, hr * 0.32, 0.45, Math.PI - 0.9), col, 4.5 * u, a + 0.06, a + 0.08, { amp: 0.4 });
    const torso = [W(cx - sw * 0.7, neck + 6 * u), W(cx - sw, neck + FH * 0.07), W(cx - hw, hip), W(cx + hw, hip), W(cx + sw, neck + FH * 0.07), W(cx + sw * 0.7, neck + 6 * u), W(cx - sw * 0.72, neck + 7 * u)];
    sk.s(torso, col, lw, a + 0.07, a + 0.12);
    sk.fill({ x: cx - sw, y: neck + 6 * u, w: sw * 2, h: hip - neck - 6 * u }, fillCol, a + 0.11, a + 0.16, { alpha: isHi ? 0.5 : 0.32, step: 11 * u, clip: (g) => { torso.forEach(([x, y], j) => (j ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); } });
    const shY = neck + FH * 0.08;
    sk.s([W(cx - sw * 0.95, shY), W(cx - sw * 1.25, shY + FH * 0.18), W(cx - sw * 1.1, hip + FH * 0.02)], col, lw, a + 0.13, a + 0.16);
    if (isHi) {
      const wv = Math.sin(t * 5) * 0.35, ex = cx + sw * 1.45, ey = shY - FH * 0.04, an = -1.2 + wv;
      sk.s([W(cx + sw * 0.95, shY), W(ex, ey), W(ex + Math.cos(an) * FH * 0.2, ey + Math.sin(an) * FH * 0.2)], col, lw, a + 0.14, a + 0.17);
    } else sk.s([W(cx + sw * 0.95, shY), W(cx + sw * 1.25, shY + FH * 0.18), W(cx + sw * 1.1, hip + FH * 0.02)], col, lw, a + 0.14, a + 0.17);
    sk.s([W(cx - hw * 0.5, hip), W(cx - hw * 0.7, ground), W(cx - hw * 0.7 - 18 * u, ground + 2 * u)], col, lw, a + 0.16, a + 0.19);
    sk.s([W(cx + hw * 0.5, hip), W(cx + hw * 0.7, ground), W(cx + hw * 0.7 + 18 * u, ground + 2 * u)], col, lw, a + 0.17, a + 0.2);
    return { headTop: hy - hr * 1.4, hy, hr };
  }
  function bubble(sk, F, x, y, rx, ry, tx, ty, col, a) {
    const u = F.u;
    sk.s(elPts(x, y, rx, ry, 1.75, TAU - 0.5), col, 5 * u, a, a + 0.05);
    const a1 = 1.75, a2 = 1.75 + TAU - 0.5;
    sk.s([[x + Math.cos(a2) * rx * 1.03, y + Math.sin(a2) * ry * 1.03], [tx, ty], [x + Math.cos(a1) * rx, y + Math.sin(a1) * ry]], col, 5 * u, a + 0.04, a + 0.06, { amp: 0.5 });
  }
  function people(g, F, A, d, q, t, sk) {
    const { u, tall, K } = F, n = Math.max(2, Math.min(6, Math.round(Number(d.count) || 4))), hi = Math.min(n - 1, d.highlight ?? 1);
    const rows = tall && n > 3 ? 2 : 1, per = Math.ceil(n / rows), rowH = A.h / rows, slot = A.w / per;
    const FH = Math.min(rowH * (rows > 1 ? 0.5 : 0.52), slot * 1.3, (tall ? 440 : 400) * u);
    const placed = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / per), c = i % per, inRow = Math.min(per, n - r * per), rs = A.w / inRow;
      const cx = A.x + rs * (c + 0.5), ground = A.y + rowH * (r + 1) - 120 * u, isHi = i === hi;
      const a = 0.02 + (i / n) * 0.36;
      const col = isHi ? K.acc : K.ink, fillCol = isHi ? K.acc : [K.blue, K.green][i % 2];
      sk.s(elPts(cx, ground + 6 * u, FH * 0.26, 7 * u, 0, TAU * 0.9), K.ink, 4 * u, a, a + 0.03, { alpha: 0.28, amp: 0.6 });
      const f = figure(sk, F, cx, ground, FH, i, col, fillCol, isHi, t, a);
      placed.push({ cx, ground, f, isHi, i, rs });
      const label = i < 3 ? (d.badges || [])[i] : "";
      if (label) {
        const size = fitSize(label, 46 * u, rs - 70 * u, 42 * u), w = measure(label, size) + 48 * u;
        sk.box(cx - w / 2, ground + 22 * u, w, 72 * u, 30 * u, col, 4.5 * u, a + 0.2, a + 0.26);
        sk.text(label, cx, ground + 74 * u, size, K.ink, a + 0.24, a + 0.3, { align: "center" });
      }
    }
    const talkers = [placed[0], placed[hi], placed[n - 1]].filter((p, j, arr) => p && arr.indexOf(p) === j);
    talkers.forEach((p, j) => {
      const rx = Math.min(p.rs * 0.32, 100 * u), ry = 58 * u, by = Math.max(A.y + ry + 10 * u, p.f.headTop - ry - 40 * u), bx = p.cx + (p.isHi ? -1 : 1) * rx * 0.7;
      const a = 0.62 + j * 0.1;
      bubble(sk, F, bx, by, rx, ry, p.cx + (p.isHi ? -1 : 1) * p.f.hr * 0.6, p.f.headTop + 6 * u, p.isHi ? K.acc : K.ink, a);
      if (p.isHi) sk.s([[bx - ry * 0.45, by + 2 * u], [bx - ry * 0.1, by + ry * 0.38], [bx + ry * 0.55, by - ry * 0.42]], K.green, 7 * u, a + 0.06, a + 0.09);
      else if (j === 0) p.dots = { bx, by, rx, a: a + 0.06 };
      else sk.text("?", bx, by + 22 * u, 64 * u, K.blue, a + 0.06, a + 0.09, { align: "center" });
    });
    sk.run(g);
    for (const p of talkers) {
      if (!p.dots || q < p.dots.a) continue;
      for (let k = 0; k < 3; k++) {
        const on = 0.35 + 0.65 * clamp(Math.sin(t * 6 - k * 0.9) * 0.5 + 0.5);
        g.save(); g.globalAlpha *= on; g.fillStyle = K.ink; g.beginPath(); g.arc(p.dots.bx + (k - 1) * 26 * u, p.dots.by - 4 * u * on, 7 * u, 0, TAU); g.fill(); g.restore();
      }
    }
    const H = placed[hi];
    if (H && q > 0.5) sparks(g, F, H.cx, H.f.hy, H.f.hr * 1.6, 4, t, K.acc, Math.PI);
    return sk;
  }

  // Step icons, drawn in marker inside each step's box.
  function icon(sk, F, k, x, y, s, col, a, t) {
    const u = F.u, K = F.K;
    if (k === 0) {
      // Reading the cut: a film strip under a magnifying glass that scans along it.
      const w = s * 1.6, h = s * 0.62, fx = x - w / 2, fy = y - h / 2 + s * 0.12;
      sk.box(fx, fy, w, h, 6 * u, K.ink, 5 * u, a, a + 0.05);
      for (let i = 1; i < 4; i++) sk.s([[fx + (w * i) / 4, fy + h * 0.2], [fx + (w * i) / 4, fy + h * 0.8]], K.ink, 4 * u, a + 0.04, a + 0.06);
      const mx = x + Math.sin(t * 1.4) * s * 0.42, my = y - s * 0.22, mr = s * 0.32;
      sk.s(elPts(mx, my, mr, mr), col, 6 * u, a + 0.06, a + 0.09);
      sk.s([[mx + mr * 0.72, my + mr * 0.72], [mx + mr * 1.5, my + mr * 1.5]], col, 9 * u, a + 0.08, a + 0.1);
    } else if (k === 1) {
      // Drafting: a pencil laying down a wavy clip line.
      const P = [];
      for (let i = 0; i <= 10; i++) P.push([x - s * 0.8 + (s * 1.3 * i) / 10, y + s * 0.42 + Math.sin(i * 1.3) * s * 0.1]);
      sk.s(P, K.blue, 5 * u, a, a + 0.05);
      const wig = Math.sin(t * 4) * s * 0.05, px = x + s * 0.5 + wig, py = y + s * 0.42, an = -0.8, L = s * 1.15, wd = s * 0.15;
      const c = Math.cos(an), sn = Math.sin(an), pt = (along, across) => [px + c * along - sn * across, py + sn * along + c * across];
      sk.s([pt(0, 0), pt(wd * 1.6, -wd), pt(L, -wd), pt(L, wd), pt(wd * 1.6, wd), pt(0, 0)], col, 5 * u, a + 0.04, a + 0.08);
      sk.s([pt(wd * 1.6, -wd), pt(wd * 1.6, wd)], col, 4 * u, a + 0.08, a + 0.09);
      sk.s([pt(L * 0.82, -wd), pt(L * 0.82, wd)], col, 4 * u, a + 0.09, a + 0.1);
    } else {
      // Approval: a check inside a loop.
      const r = s * 0.62;
      sk.s(elPts(x, y, r, r * 0.95), col, 6.5 * u, a, a + 0.05);
      sk.s([[x - r * 0.5, y], [x - r * 0.1, y + r * 0.42], [x + r * 0.62, y - r * 0.5]], K.green, 9 * u, a + 0.05, a + 0.09);
    }
  }
  function process(g, F, A, d, q, t, sk) {
    const { u, tall, K } = F, steps = (d.steps || []).slice(0, 3);
    const boxes = [];
    if (!tall) {
      // Three tall step cards across the board, their labels under them, and a return loop below.
      const slot = A.w / 3, bw = Math.min(slot - 110 * u, 500 * u), bh = Math.min(A.h - 330 * u, bw * 1.02), by = A.y + 30 * u;
      for (let i = 0; i < 3; i++) boxes.push({ x: A.x + slot * (i + 0.5) - bw / 2, y: by, w: bw, h: bh, lx: A.x + slot * (i + 0.5), ly: by + bh + 78 * u, la: "center", maxW: slot - 30 * u });
    } else {
      const rowH = A.h / 3, bw = A.w * 0.46, bh = Math.min(rowH - 110 * u, bw * 0.8);
      for (let i = 0; i < 3; i++) boxes.push({ x: A.x + 20 * u, y: A.y + rowH * i + (rowH - bh) / 2 - 20 * u, w: bw, h: bh, lx: A.x + bw + 70 * u, ly: A.y + rowH * i + rowH / 2, la: "left", maxW: A.w - bw - 80 * u });
    }
    const cyc = Math.floor((t * 0.7) % 3);
    const arrows = [];
    boxes.forEach((B, i) => {
      const a = 0.04 + i * 0.26, col = i === 2 ? K.acc : K.ink;
      sk.box(B.x, B.y, B.w, B.h, 24 * u, col, 6.5 * u, a, a + 0.14);
      const nx = B.x + 4 * u, ny = B.y + 4 * u;
      sk.s(elPts(nx, ny, 36 * u, 36 * u), K.acc, 6 * u, a + 0.1, a + 0.14);
      sk.text(String(i + 1), nx, ny + 16 * u, 46 * u, K.acc, a + 0.13, a + 0.15, { align: "center" });
      icon(sk, F, i, B.x + B.w / 2, B.y + B.h / 2 + 6 * u, Math.min(B.w, B.h) * 0.46, i === 2 ? K.acc : K.ink, a + 0.12, t);
      sk.text(steps[i] || "", B.lx, B.ly + (B.la === "left" ? 16 * u : 0), 50 * u, K.ink, a + 0.18, a + 0.24, { align: B.la, maxW: B.maxW, min: 42 * u });
      if (i < 2) {
        const N = boxes[i + 1];
        const pts = !tall
          ? [[B.x + B.w + 14 * u, B.y + B.h * 0.38], [(B.x + B.w + N.x) / 2, B.y + B.h * 0.38 - 50 * u], [N.x - 16 * u, N.y + N.h * 0.38]]
          : [[B.x + B.w * 0.5, B.y + B.h + 12 * u], [B.x + B.w * 0.62, (B.y + B.h + N.y) / 2], [N.x + N.w * 0.5, N.y - 14 * u]];
        sk.arrow(pts, K.blue, 6 * u, a + 0.2, a + 0.27);
        arrows.push({ pts: wob(cvPts(pts), 5 + i, u, 0), a: a + 0.27 });
      }
    });
    // Under the labels, a long dashed loop runs from the last step back to the first: the cycle repeats.
    let loop = null;
    if (!tall) {
      const y0 = boxes[0].ly + 46 * u, yb = Math.min(A.y + A.h - 10 * u, y0 + 120 * u);
      if (yb - y0 > 60 * u) {
        const x3 = boxes[2].lx, x1 = boxes[0].lx;
        const pts = [[x3 + 40 * u, y0], [x3 - 20 * u, yb], [(x1 + x3) / 2, yb + 14 * u], [x1 + 20 * u, yb], [x1 - 40 * u, y0 + 8 * u]];
        sk.arrow(pts, K.blue, 5.5 * u, 0.84, 0.97, { dash: [18 * u, 14 * u], dashOff: -t * 50 * u, head: 30 * u });
        loop = { pts: wob(cvPts(pts), 9, u, 0), cx: (x1 + x3) / 2, y: yb + 14 * u };
      }
    }
    // The last mark: the marker ticks an approve box on the final step.
    const L = boxes[2], tb = 64 * u, tx = L.x + L.w - tb * 0.4, ty = L.y - tb * 0.6;
    sk.s(boxPts(tx, ty, tb, tb, 8 * u, 0.1, u), K.ink, 5.5 * u, 0, 0.5, { late: true });
    sk.s([[tx + tb * 0.18, ty + tb * 0.5], [tx + tb * 0.42, ty + tb * 0.8], [tx + tb * 1.1, ty - tb * 0.2]], K.green, 9 * u, 0.5, 1, { late: true });
    sk.run(g);
    // A dot runs the arrows on a loop, and the steps take turns being underlined.
    if (q >= 0.8) {
      const ph = (t * 0.6) % 2, A0 = arrows[Math.floor(ph)];
      if (A0) { const [x, y] = pointAt(A0.pts, ph % 1); g.save(); g.fillStyle = K.acc; g.beginPath(); g.arc(x, y, 11 * u, 0, TAU); g.fill(); g.restore(); }
      const B = boxes[cyc];
      g.save(); g.strokeStyle = K.acc; g.lineCap = "round"; g.lineWidth = 6 * u; g.globalAlpha = 0.85;
      const k = ((t * 0.7) % 1), w = B.w * 0.6 * ease(k * 2.5);
      g.beginPath();
      const y = B.y + B.h + 22 * u;
      for (let i = 0; i <= 20; i++) { const x = B.x + B.w * 0.2 + (w * i) / 20, yy = y + Math.sin(i * 0.9) * 3 * u; i ? g.lineTo(x, yy) : g.moveTo(x, yy); }
      if (!tall) g.stroke();
      g.restore();
      sparks(g, F, tx + tb * 0.6, ty + tb * 0.3, tb * 0.8, 4, t, K.acc, -1.4);
      if (loop) {
        // A small token rides the return loop, turning as it goes.
        const [x, y] = pointAt(loop.pts, (t * 0.22) % 1), r = 16 * u;
        g.save(); g.strokeStyle = K.blue; g.lineWidth = 5 * u; g.lineCap = "round";
        g.beginPath(); g.arc(x, y, r, t * 4, t * 4 + TAU * 0.8); g.stroke(); g.restore();
      }
    }
    return sk;
  }

  // Tally marks in groups of five, sized to fill their area; a mark stands for more than one when numbers are large.
  function tallyFit(R, count, u) {
    for (let mh = 170 * u; mh > 50 * u; mh -= 8 * u) {
      const sp = mh * 0.2, gw = sp * 4 + mh * 0.42, perRow = Math.max(1, Math.floor((R.w + mh * 0.3) / gw)), rows = Math.ceil(Math.ceil(count / 5) / perRow);
      if (rows * mh + (rows - 1) * mh * 0.3 <= R.h) return { mh, sp, gw, perRow };
    }
    const mh = 50 * u; return { mh, sp: mh * 0.2, gw: mh * 1.22, perRow: Math.max(1, Math.floor(R.w / (mh * 1.22))) };
  }
  function tallies(sk, F, R, count, col, a, b, t, L) {
    const u = F.u, { mh, sp, gw, perRow } = L, groups = Math.ceil(count / 5), lw = Math.max(6, mh * 0.055) * 1;
    let k = 0;
    for (let gi = 0; gi < groups; gi++) {
      const r = Math.floor(gi / perRow), c = gi % perRow, gx = R.x + c * gw, gy = R.y + r * mh * 1.3, inG = Math.min(5, count - gi * 5);
      for (let m = 0; m < inG; m++, k++) {
        const s0 = lerp(a, b, k / Math.max(1, count)), s1 = lerp(a, b, (k + 1) / Math.max(1, count)), sway = Math.sin(t * 2 + k) * 2.5 * u;
        if (m < 4) sk.s([[gx + m * sp + sway, gy], [gx + m * sp + 3 * u, gy + mh]], col, lw * u / u, s0, s1, { amp: 1.8 });
        else sk.s([[gx - mh * 0.12, gy + mh * 0.82], [gx + sp * 3 + mh * 0.14, gy + mh * 0.16]], col, lw, s0, s1, { amp: 1.8 });
      }
    }
  }
  function compare(g, F, A, d, q, t, sk) {
    const { u, tall, K } = F, lv = Math.max(0, Number(d.leftValue) || 0), rv = Math.max(0, Number(d.rightValue) || 0), mx = Math.max(lv, rv, 1);
    const unit = mx > 20 ? Math.ceil(mx / 20) : 1;
    const panels = tall
      ? [{ x: A.x, y: A.y + 10 * u, w: A.w, h: A.h * 0.42 }, { x: A.x, y: A.y + A.h * 0.58, w: A.w, h: A.h * 0.42 - 10 * u }]
      : [{ x: A.x, y: A.y + 10 * u, w: A.w * 0.41, h: A.h - 30 * u }, { x: A.x + A.w * 0.59, y: A.y + 10 * u, w: A.w * 0.41, h: A.h - 30 * u }];
    const items = [[d.left, lv, Math.round(lv / unit), K.ink, K.blue], [d.right, rv, Math.round(rv / unit), K.acc, K.acc]];
    const nums = [];
    // Both tally sets share one mark size, set by the larger count.
    const counts = items.map((it) => it[2]);
    items.forEach(([label, v, c, col, line], i) => {
      const P = panels[i], a = 0.03 + i * 0.4, px = P.x + 44 * u, pw = P.w - 88 * u;
      sk.box(P.x, P.y, P.w, P.h, 26 * u, col, 6 * u, a, a + 0.1);
      const ls = fitSize(label, 54 * u, pw, 42 * u);
      sk.text(label, px, P.y + 84 * u, ls, K.ink, a + 0.07, a + 0.13);
      sk.s([[px, P.y + 104 * u], [px + Math.min(pw, measure(label, ls)), P.y + 106 * u]], line, 6 * u, a + 0.12, a + 0.15);
      const num = fmt(v, d), ns = fitSize(num, 150 * u, pw * 0.42, 96 * u), nw = measure(num, ns);
      const barH = Math.min(84 * u, P.h * 0.14), barY = P.y + P.h - barH - 46 * u, rowTop = P.y + 130 * u, rowH = barY - 40 * u - rowTop;
      const ny = rowTop + rowH / 2 + ns * 0.34;
      sk.text(num, px, ny, ns, col, a + 0.14, a + 0.2);
      nums.push({ x: px, y: ny, w: nw, s: ns });
      const R = { x: px + nw + 70 * u, y: rowTop + 10 * u, w: P.x + P.w - 44 * u - (px + nw + 70 * u), h: rowH - 20 * u };
      const L = tallyFit(R, Math.max(...counts, 1), u), rowsUsed = Math.ceil(Math.ceil(c / 5) / L.perRow), used = rowsUsed * L.mh * 1.3 - L.mh * 0.3;
      if (c > 0) tallies(sk, F, { ...R, y: R.y + Math.max(0, (R.h - used) / 2) }, c, col, a + 0.2, a + 0.32, t, L);
      // Room left beside the tallies holds a dial, turning a little as if someone is still tuning it.
      const usedW = Math.min(Math.ceil(c / 5), L.perRow) * L.gw, fx0 = R.x + (c > 0 ? usedW + 50 * u : 0), fw = R.x + R.w - fx0;
      const fy0 = R.y, fy1 = barY - 30 * u, dr = Math.min(fw / 2 - 30 * u, (fy1 - fy0) / 2 - 34 * u, 150 * u);
      if (dr > 56 * u) {
        const dx = fx0 + fw / 2, dy = (fy0 + fy1) / 2, a0 = Math.PI * 0.75, sweep = Math.PI * 1.5;
        sk.s(elPts(dx, dy, dr, dr * 0.97), col, 6 * u, a + 0.32, a + 0.37);
        for (let k = 0; k <= 8; k++) { const an = a0 + (sweep * k) / 8; sk.s([[dx + Math.cos(an) * dr * 1.12, dy + Math.sin(an) * dr * 1.12], [dx + Math.cos(an) * dr * (k % 4 ? 1.24 : 1.32), dy + Math.sin(an) * dr * (k % 4 ? 1.24 : 1.32)]], K.ink, 4 * u, a + 0.37, a + 0.375, { amp: 0 }); }
        const turn = a0 + sweep * clamp(v / mx * 0.8 + 0.1) + Math.sin(t * 1.7 + i) * 0.35 + Math.sin(t * 4.1) * 0.06;
        sk.s([[dx, dy], [dx + Math.cos(turn) * dr * 0.8, dy + Math.sin(turn) * dr * 0.8]], i ? K.acc : K.blue, 9 * u, a + 0.38, a + 0.4, { amp: 0.3 });
        sk.s(elPts(dx, dy, dr * 0.16, dr * 0.16), K.ink, 5 * u, a + 0.4, a + 0.41);
      }
      // A bar on a shared scale along the foot of the card.
      const bw = Math.max(18 * u, pw * (v / mx));
      sk.s([[px, barY + barH + 8 * u], [px + pw, barY + barH + 8 * u]], K.ink, 3 * u, a + 0.3, a + 0.33, { alpha: 0.35, dash: [10 * u, 12 * u] });
      sk.s([[px, barY + barH], [px, barY], [px + bw, barY], [px + bw, barY + barH], [px - 2 * u, barY + barH]], col, 5.5 * u, a + 0.32, a + 0.37);
      sk.fill({ x: px + 4 * u, y: barY + 4 * u, w: bw - 8 * u, h: barH - 8 * u }, i ? K.acc : K.blue, a + 0.35, a + 0.4, { alpha: 0.42, step: 12 * u });
    });
    if (unit > 1) sk.text(`each mark = ${fmt(unit)}`, panels[1].x + panels[1].w - 44 * u, panels[1].y + 84 * u, 42 * u, K.ink, 0.88, 0.94, { align: "right", alpha: 0.7 });
    const R1 = nums[1];
    sk.s(elPts(R1.x + R1.w / 2, R1.y - R1.s * 0.34, R1.w / 2 + 44 * u, R1.s * 0.66, -2.6, TAU + 0.4), K.acc, 5 * u, 0.76, 0.84, { alpha: 0.85 });
    // The arrow between the two, with the change written beside it.
    const bounce = q >= 1 ? Math.sin(t * 3.2) * 9 * u : 0;
    let pts, lx, ly;
    if (!tall) {
      const x0 = A.x + A.w * 0.425, x1 = A.x + A.w * 0.575, y = A.y + A.h * 0.4;
      pts = [[x0 + bounce, y + 20 * u], [(x0 + x1) / 2 + bounce, y - 36 * u], [x1 + bounce, y + 14 * u]];
      lx = (x0 + x1) / 2; ly = y + 160 * u;
    } else {
      const xx = A.x + A.w * 0.3, y0 = A.y + A.h * 0.44, y1 = A.y + A.h * 0.565;
      pts = [[xx - 16 * u, y0 + bounce], [xx + 26 * u, (y0 + y1) / 2 + bounce], [xx, y1 + bounce]];
      lx = xx + 70 * u; ly = (y0 + y1) / 2 + 22 * u;
    }
    sk.arrow(pts, K.blue, 9 * u, 0.4, 0.47, { head: 36 * u });
    if (lv > 0) {
      const pct = Math.round(((rv - lv) / lv) * 100), s = `${pct >= 0 ? "+" : "−"}${Math.abs(pct)}%`;
      const ps = tall ? 96 * u : fitSize(s, 96 * u, A.w * 0.17, 72 * u);
      sk.text(s, lx, ly + 10 * u, ps, pct >= 0 ? K.green : K.acc, 0.84, 0.9, { align: tall ? "left" : "center" });
      const sw = measure(s, ps), scx = tall ? lx + sw / 2 : lx, scy = ly + 10 * u - ps * 0.36;
      sk.s(elPts(scx, scy, sw / 2 + 26 * u, ps * 0.78, -2.4, TAU + 0.5), K.acc, 6 * u, 0, 0.7, { late: true });
      sk.s([[scx - sw * 0.45, scy + ps * 0.98], [scx + sw * 0.5, scy + ps * 0.94]], K.blue, 5 * u, 0.7, 1, { late: true });
    }
    sk.run(g);
    if (q >= 0.9) sparks(g, F, R1.x + R1.w + 40 * u, R1.y - R1.s * 0.9, 16 * u, 3, t, K.acc, -0.4);
    return sk;
  }
  const DRAW = { chart, object, people, process, compare };

  // ---- statements: the title and the closing line, with doodles around them ------------------------
  function titleIcon(sk, F, k, x, y, s, a, t) {
    const u = F.u, K = F.K;
    if (k === 0) {
      // Film strip with sprockets that creep along.
      const w = s * 1.25, h = s * 0.7, fx = x - w / 2, fy = y - h / 2;
      sk.box(fx, fy, w, h, 6 * u, K.ink, 5.5 * u, a, a + 0.08);
      sk.s([[fx, fy + h * 0.22], [fx + w, fy + h * 0.22]], K.ink, 3.5 * u, a + 0.06, a + 0.09);
      sk.s([[fx, fy + h * 0.78], [fx + w, fy + h * 0.78]], K.ink, 3.5 * u, a + 0.07, a + 0.1);
      const sp = w / 6, off = (t * 26 * u) % sp;
      for (let i = 0; i < 6; i++) {
        let hx = fx + off + sp * i + sp * 0.2;
        if (hx > fx + w - sp * 0.4) hx -= w - sp * 0.1;
        sk.s([[hx, fy + h * 0.08], [hx + sp * 0.3, fy + h * 0.08]], K.ink, 5 * u, a + 0.09, a + 0.1, { amp: 0 });
        sk.s([[hx, fy + h * 0.92], [hx + sp * 0.3, fy + h * 0.92]], K.ink, 5 * u, a + 0.09, a + 0.1, { amp: 0 });
      }
      sk.s([[fx + w * 0.5, fy + h * 0.22], [fx + w * 0.5, fy + h * 0.78]], K.blue, 4 * u, a + 0.1, a + 0.12);
    } else if (k === 1) {
      // Scissors that snip open and shut.
      const o = 0.22 + 0.16 * Math.sin(t * 5), r = s * 0.15, px = x + s * 0.05, py = y, L = s * 0.62;
      [-1, 1].forEach((sg, j) => {
        const c = Math.cos(o), sn = Math.sin(o);
        sk.s([[px - c * L * 0.35, py + sg * sn * L * 0.35], [px + c * L, py - sg * sn * L]], K.acc, 6 * u, a + 0.1 + j * 0.02, a + 0.13 + j * 0.02);
        const hx = px - c * L * 0.62, hy = py + sg * sn * L * 0.62 + sg * r * 0.4;
        sk.s(elPts(hx - r * 0.5, hy, r, r * 0.78), K.ink, 5 * u, a + j * 0.05, a + 0.05 + j * 0.05);
      });
      sk.s([[x - s * 0.62, y + s * 0.42], [x + s * 0.7, y + s * 0.42]], K.ink, 4 * u, a + 0.12, a + 0.15, { dash: [10 * u, 10 * u] });
    } else if (k === 2) {
      // A play button that pulses.
      const w = s * 1.1, h = s * 0.8, p = 1 + 0.08 * Math.sin(t * 4);
      sk.box(x - w / 2, y - h / 2, w, h, 18 * u, K.ink, 5.5 * u, a, a + 0.08);
      const ts = s * 0.22 * p;
      sk.s([[x - ts * 0.7, y - ts], [x + ts, y], [x - ts * 0.7, y + ts], [x - ts * 0.7, y - ts]], K.acc, 6 * u, a + 0.08, a + 0.12);
      sk.fill({ x: x - ts * 0.7, y: y - ts, w: ts * 1.7, h: ts * 2 }, K.acc, a + 0.11, a + 0.14, { alpha: 0.5, step: 7 * u, w: 4 * u, clip: (g) => { g.moveTo(x - ts * 0.7, y - ts); g.lineTo(x + ts, y); g.lineTo(x - ts * 0.7, y + ts); g.closePath(); } });
    } else if (k === 3) {
      // A level meter that bounces.
      for (let i = 0; i < 7; i++) {
        const bx = x - s * 0.6 + (s * 1.2 * i) / 6, hh = s * (0.18 + 0.32 * Math.abs(Math.sin(i * 1.7 + 0.5)) * (0.7 + 0.3 * Math.sin(t * 6 + i)));
        sk.s([[bx, y - hh], [bx, y + hh]], K.blue, 8 * u, a + i * 0.012, a + 0.03 + i * 0.012, { amp: 0.4, w8: s * 0.5 / u });
      }
    } else {
      // A speech bubble with a tick in it.
      bubble(sk, F, x, y - s * 0.06, s * 0.58, s * 0.4, x - s * 0.4, y + s * 0.5, K.ink, a);
      sk.s([[x - s * 0.22, y - s * 0.06], [x - s * 0.04, y + s * 0.12], [x + s * 0.26, y - s * 0.24]], K.green, 7 * u, a + 0.07, a + 0.1);
    }
  }
  function cardDoodle(sk, F, R, a, t, approved) {
    const u = F.u, K = F.K, { x, y, w, h } = R, pad = w * 0.09;
    sk.box(x, y, w, h, 26 * u, K.ink, 6.5 * u, a, a + 0.12);
    const pv = { x: x + pad, y: y + pad, w: w - pad * 2, h: h * 0.42 };
    sk.box(pv.x, pv.y, pv.w, pv.h, 12 * u, K.ink, 4.5 * u, a + 0.1, a + 0.18);
    sk.s([[pv.x + 6 * u, pv.y + pv.h * 0.85], [pv.x + pv.w * 0.3, pv.y + pv.h * 0.5], [pv.x + pv.w * 0.5, pv.y + pv.h * 0.72], [pv.x + pv.w * 0.72, pv.y + pv.h * 0.4], [pv.x + pv.w - 6 * u, pv.y + pv.h * 0.8]], K.blue, 5 * u, a + 0.17, a + 0.23);
    const sr = pv.h * 0.12;
    sk.s(elPts(pv.x + pv.w * 0.2, pv.y + pv.h * 0.3 + Math.sin(t * 1.7) * 4 * u, sr, sr), K.acc, 4.5 * u, a + 0.22, a + 0.25);
    for (let i = 0; i < 3; i++) { const ly = pv.y + pv.h + h * (0.09 + i * 0.075); sk.s([[x + pad, ly], [x + w - pad - (i === 2 ? w * 0.3 : i * w * 0.1), ly]], K.ink, 5 * u, a + 0.25 + i * 0.03, a + 0.28 + i * 0.03, { alpha: 0.55, amp: 2 }); }
    const by = y + h - pad - h * 0.13, bw = (w - pad * 3) / 2, bh = h * 0.13;
    sk.box(x + pad, by, bw, bh, bh / 2, K.green, 5 * u, a + 0.36, a + 0.44);
    const cx = x + pad + bw / 2, cy = by + bh / 2, cs = bh * 0.28;
    sk.s([[cx - cs, cy], [cx - cs * 0.25, cy + cs * 0.75], [cx + cs * 1.1, cy - cs * 0.85]], K.green, 7 * u, a + 0.43, a + 0.47);
    sk.box(x + pad * 2 + bw, by, bw, bh, bh / 2, K.ink, 5 * u, a + 0.44, a + 0.5, { alpha: 0.7 });
    const dx = x + pad * 2 + bw * 1.5;
    sk.s([[dx - cs * 0.8, cy - cs * 0.8], [dx + cs * 0.8, cy + cs * 0.8]], K.ink, 6 * u, a + 0.5, a + 0.52, { alpha: 0.7 });
    sk.s([[dx + cs * 0.8, cy - cs * 0.8], [dx - cs * 0.8, cy + cs * 0.8]], K.ink, 6 * u, a + 0.52, a + 0.54, { alpha: 0.7 });
    if (approved) sk.s(elPts(cx, cy, bw * 0.66, bh * 0.95, -2.4, TAU + 0.5), K.acc, 6 * u, a + 0.56, a + 0.64);
    // A cursor drifting over the approve button.
    const hx = cx + bw * 0.18 + Math.cos(t * 1.5) * 16 * u, hy = cy + bh * 0.1 + Math.sin(t * 2.1) * 10 * u, s = 34 * u;
    sk.s([[hx, hy], [hx, hy + s], [hx + s * 0.28, hy + s * 0.72], [hx + s * 0.5, hy + s * 1.1], [hx + s * 0.64, hy + s * 1.02], [hx + s * 0.44, hy + s * 0.66], [hx + s * 0.78, hy + s * 0.62], [hx, hy]], K.ink, 4.5 * u, a + 0.6, a + 0.66, { amp: 0.4 });
    return { apply: [cx, cy], reject: [dx, cy] };
  }
  // ---- headings: the template's words, re-lettered by the marker -------------------------------------
  // The template lays the words out (its own text is hidden); the marker writes them where they sit.
  const tlCache = {};
  function textLines(id) {
    if (id in tlCache) return tlCache[id];
    const el = typeof document !== "undefined" && document.getElementById(id), lines = headLines(id);
    const s = el ? (el.textContent || "").trim() : "";
    if (!s || !lines.length) return (tlCache[id] = null);
    const size = parseFloat(el.style.fontSize) || parseFloat(getComputedStyle(el).fontSize) || 72;
    const maxW = Math.max(lines.box.w, ...lines.map((l) => l.w)) + 2;
    const out = [];
    let cur = "";
    for (const w of s.split(/\s+/)) { const next = cur ? `${cur} ${w}` : w; if (cur && measure(next, size) > maxW) { out.push(cur); cur = w; } else cur = next; }
    if (cur) out.push(cur);
    const m = mctx(); m.font = fontOf(size);
    const mt = m.measureText("Hg"), asc = mt.fontBoundingBoxAscent || size * 0.9, desc = mt.fontBoundingBoxDescent || size * 0.3;
    const res = out.map((str, i) => {
      const l = lines[Math.min(i, lines.length - 1)], extra = Math.max(0, i - lines.length + 1);
      return { s: str, x: (lines[i] || lines[0]).x, y: l.y + l.h * (asc / (asc + desc)) + extra * size * 1.04, size, w: measure(str, size) };
    });
    return (tlCache[id] = res);
  }
  function heading(sk, F, id, a, b, col, under) {
    const T = textLines(id);
    if (!T) return null;
    const u = F.u, wEnd = under ? a + (b - a) * 0.8 : b, total = T.reduce((n, l) => n + l.s.length, 0) || 1;
    let c0 = 0;
    T.forEach((l) => { const s0 = lerp(a, wEnd, c0 / total); c0 += l.s.length; sk.text(l.s, l.x, l.y, l.size, col, s0, lerp(a, wEnd, c0 / total), { pace: 0.42 }); });
    if (under) {
      const last = T[T.length - 1], uy = last.y + last.size * 0.24, lw = Math.min(last.w, 560 * u);
      sk.s([[last.x - 6 * u, uy], [last.x + lw * 0.55, uy + 5 * u], [last.x + lw + 10 * u, uy - 2 * u]], F.K.blue, 8 * u, wEnd, b);
    }
    return T;
  }

  // ---- statements: the title and the closing line, with drawings around them -------------------------
  // A wall clock whose minute hand keeps sweeping, and a mug with steam curling off it.
  function clockMug(sk, F, x, y, r, a, t) {
    const u = F.u, K = F.K;
    sk.s(elPts(x, y, r, r * 0.97), K.ink, 6.5 * u, a, a + 0.1);
    for (let i = 0; i < 12; i++) {
      const an = (i / 12) * TAU, r0 = r * (i % 3 ? 0.8 : 0.68);
      sk.s([[x + Math.cos(an) * r0, y + Math.sin(an) * r0], [x + Math.cos(an) * r * 0.88, y + Math.sin(an) * r * 0.88]], K.ink, (i % 3 ? 3.5 : 6) * u, a + 0.1, a + 0.11, { amp: 0 });
    }
    sk.s([[x, y], [x + Math.cos(-2.4) * r * 0.42, y + Math.sin(-2.4) * r * 0.42]], K.ink, 8 * u, a + 0.11, a + 0.12, { amp: 0.3 });
    const mn = -Math.PI / 2 + t * 0.8;
    sk.s([[x, y], [x + Math.cos(mn) * r * 0.66, y + Math.sin(mn) * r * 0.66]], K.acc, 5.5 * u, a + 0.12, a + 0.13, { amp: 0.3 });
    const mw = r * 0.95, mh = r * 1.05, mx = x + r * 1.55, my = y + r - mh;
    sk.s([[mx, my], [mx + mw * 0.06, my + mh], [mx + mw * 0.94, my + mh], [mx + mw, my]], K.ink, 6.5 * u, a + 0.14, a + 0.2);
    sk.s(elPts(mx + mw / 2, my, mw / 2, mh * 0.09), K.ink, 4.5 * u, a + 0.2, a + 0.23);
    sk.s(elPts(mx + mw * 0.98, my + mh * 0.48, mw * 0.24, mh * 0.22, -1.45, Math.PI * 0.95), K.ink, 6 * u, a + 0.23, a + 0.26);
    sk.fill({ x: mx + mw * 0.06, y: my + mh * 0.36, w: mw * 0.88, h: mh * 0.26 }, K.acc, a + 0.26, a + 0.3, { alpha: 0.5, step: 10 * u });
    for (let j = 0; j < 3; j++) {
      const xs = mx + mw * (0.25 + 0.25 * j), P = [];
      for (let k = 0; k <= 8; k++) P.push([xs + Math.sin(k * 0.95 - t * 3.2 + j * 1.7) * 11 * u, my - 16 * u - k * r * 0.085]);
      sk.s(P, K.blue, 4 * u, a + 0.3 + j * 0.02, a + 0.32 + j * 0.02, { alpha: 0.6, w8: r * 0.7 / u });
    }
  }
  // Three ticked boxes, each with a scribbled line of notes beside it.
  function checklist(sk, F, R, a, t) {
    const u = F.u, K = F.K, rowH = R.h / 3, bs = Math.min(rowH * 0.5, 70 * u);
    for (let i = 0; i < 3; i++) {
      const y = R.y + rowH * (i + 0.5), x = R.x;
      sk.s(boxPts(x, y - bs / 2, bs, bs, 6 * u, 0.1, u), K.ink, 5 * u, a + i * 0.1, a + i * 0.1 + 0.04);
      const P = [];
      for (let k = 0; k <= 14; k++) P.push([x + bs + 30 * u + (R.w - bs - 40 * u) * (k / 14) * (i === 1 ? 0.75 : 1), y + Math.sin(k * 1.9 + i) * 7 * u]);
      sk.s(P, K.ink, 4.5 * u, a + i * 0.1 + 0.04, a + i * 0.1 + 0.07, { alpha: 0.55 });
      const wig = Math.sin(t * 3 + i) * 2 * u;
      sk.s([[x + bs * 0.18, y + wig], [x + bs * 0.45, y + bs * 0.3 + wig], [x + bs * 1.05, y - bs * 0.55 + wig]], K.green, 7 * u, a + i * 0.1 + 0.07, a + i * 0.1 + 0.09);
    }
  }
  // The closing idea: one card, two choices on it, and both lead to one outcome.
  function decisionFlow(sk, F, band, side, a, t) {
    const { u, K, W } = F, bh = band.y1 - band.y0, cy = band.y0 + bh / 2;
    const ch = Math.min(bh * 0.94, 400 * u), cw = ch / 1.12, card = { x: side, y: cy - ch / 2, w: cw, h: ch };
    const btn = cardDoodle(sk, F, card, a, t, false);
    const ow = Math.min(470 * u, (W - side * 2) * 0.34), oh = Math.min(ch * 0.46, 170 * u), ox = W - side - ow, oy = cy - oh / 2;
    const x0 = card.x + cw + 26 * u, x1 = ox - 22 * u, mid = lerp(x0, x1, 0.5), b = a + 0.7, word = "Decision made";
    const yA = card.y + ch * 0.28, yR = btn.reject[1];
    sk.arrow([[x0, yA], [mid, yA - 26 * u], [x1, cy - oh * 0.2]], K.green, 6.5 * u, b, b + 0.06);
    sk.text("Apply", mid, yA - 52 * u, 50 * u, K.green, b + 0.06, b + 0.09, { align: "center", maxW: x1 - x0, min: 42 * u });
    sk.arrow([[x0, yR], [mid, yR + 22 * u], [x1, cy + oh * 0.2]], K.ink, 6.5 * u, b + 0.1, b + 0.16);
    sk.text("Reject", mid, yR + 84 * u, 50 * u, K.ink, b + 0.16, b + 0.19, { align: "center", maxW: x1 - x0, min: 42 * u });
    const L = { late: true };
    sk.box(ox, oy, ow, oh, 26 * u, K.acc, 7 * u, 0, 0.3, L);
    const rr = oh * 0.3, rx = ox + oh * 0.48;
    sk.s(elPts(rx, cy, rr, rr * 0.95), K.acc, 6 * u, 0.3, 0.45, L);
    sk.s([[rx - rr * 0.5, cy], [rx - rr * 0.1, cy + rr * 0.42], [rx + rr * 0.62, cy - rr * 0.5]], K.green, 8 * u, 0.45, 0.55, L);
    const inside = ow - oh * 0.95, ws = fitSize(word, 50 * u, inside, 42 * u);
    if (measure(word, ws) <= inside + 2 * u) sk.text(word, ox + oh * 0.86, cy + ws * 0.3, ws, K.ink, 0.55, 1, L);
    else sk.text(word, ox + ow / 2, oy + oh + 60 * u, 46 * u, K.ink, 0.55, 1, { ...L, align: "center", maxW: W - side - x0, min: 42 * u });
    return [rx, cy, rr * 1.3];
  }
  function statement(g, F, id, info, span0) {
    const { u, K, W } = F, ids = HEADS[id], B = bandsOf(F, ids), side = (F.tall ? 90 : 140) * u, D = span0.D;
    const q = warp(clamp((info.local - 0.05) / D)), sk = new Sk(F, q, (v) => 0.05 + unwarp(v) * D, info.local, id === "title" ? 31 : 57);
    sk.lateAt = span0.lateAt;
    // Words first: the kicker, the headline, then a double underline.
    let T;
    if (id === "title") {
      const KL = textLines("kicker");
      if (KL) sk.text(KL[0].s, KL[0].x, KL[0].y, Math.max(46 * u, KL[0].size), K.acc, 0, 0.05, { maxW: W - side - KL[0].x, min: 30 * u });
      T = heading(sk, F, "title", 0.05, 0.25, K.ink, false);
    } else T = heading(sk, F, "closing", 0, 0.22, K.ink, false);
    if (T) {
      const last = T[T.length - 1], uy = last.y + last.size * 0.26;
      sk.s([[last.x - 6 * u, uy], [last.x + last.w * 0.55, uy + 6 * u], [last.x + last.w + 8 * u, uy - 2 * u]], K.acc, 9 * u, 0.26, 0.3);
      sk.s([[last.x + last.w * 0.08, uy + 18 * u], [last.x + last.w * 0.92, uy + 20 * u]], K.blue, 5 * u, 0.3, 0.33, { alpha: 0.8 });
    }
    const band = B.below, bh = band.y1 - band.y0, ab = B.above, abH = ab.y1 - ab.y0;
    let spark = null;
    if (id === "title" && bh > 170 * u) {
      // The road to a signed-off cut, as a row of labelled drawings.
      const kinds = F.tall ? [0, 2, 4] : [0, 1, 2, 4], n = kinds.length, gap = (W - side * 2) / n, names = ["Footage", "Rough cut", "Preview", "Sound", "Sign-off"];
      const labH = 70 * u, s = Math.min((bh - labH) * 0.8, gap * 0.56, 260 * u), icy = band.y0 + (bh - labH) / 2;
      kinds.forEach((k, i) => {
        const x = side + gap * (i + 0.5), a = 0.42 + i * (0.5 / n);
        titleIcon(sk, F, k, x, icy, s, a, info.t);
        sk.text(names[k], x, icy + s * 0.56 + 50 * u, 46 * u, K.ink, a + 0.08, a + 0.1, { align: "center", maxW: gap - 20 * u, min: 42 * u });
        if (i < n - 1) sk.arrow([[x + s * 0.74, icy + s * 0.05], [x + gap * 0.5, icy - s * 0.16], [x + gap - s * 0.74, icy + s * 0.05]], K.blue, 5.5 * u, a + 0.1, a + 0.14, { head: 22 * u });
      });
    } else if (id === "closing" && bh > 220 * u) spark = decisionFlow(sk, F, band, side, 0.36, info.t);
    // Beside or above the words: a review card for the title, a ticked checklist for the closing.
    const rx0 = B.right + 90 * u, room = W - side - rx0;
    let CR = null;
    if (!F.tall && room > 220 * u && B.lines) { const w = Math.min(room, 400 * u), h = w * 1.12, mid = (Math.min(...B.lines.map((l) => l.y)) + Math.max(...B.lines.map((l) => l.y + l.h))) / 2; CR = { x: rx0 + (room - w) / 2, y: clamp(mid - h / 2, 60 * u, F.H - 60 * u - h), w, h }; }
    else if (!F.tall && abH > 280 * u) { const h = Math.min(abH - 30 * u, 380 * u), w = h / 1.12; CR = { x: W - side - w, y: ab.y0 + (abH - h) / 2, w, h }; }
    else if (F.tall && abH > 380 * u) { const h = Math.min(abH - 80 * u, 560 * u), w = h * 0.9; CR = { x: (W - w) / 2, y: ab.y0 + (abH - h) / 2 + 20 * u, w, h }; }
    if (CR && id === "title") cardDoodle(sk, F, CR, 0.3, info.t, false);
    else if (CR) { const h = Math.min(CR.h, 330 * u); checklist(sk, F, { x: CR.x, y: CR.y + (CR.h - h) / 2, w: Math.min(CR.w, 380 * u), h }, 0.3, info.t); }
    // The stand-up corner: a clock and a mug, top left, when the space is free.
    if (id === "title" && abH > 200 * u && (!F.tall || !CR)) {
      const r = Math.min(abH * 0.36, 118 * u);
      clockMug(sk, F, side + r + 10 * u, ab.y0 + abH / 2, r, 0.36, info.t);
    }
    return { sk, q, spark };
  }

  // ---- frame plumbing --------------------------------------------------------------------------------
  let stageInfo = null;
  const layers = {};
  function layer(name, W, H) {
    let c = layers[name];
    if (!c || c.width !== W || c.height !== H) { c = layers[name] = document.createElement("canvas"); c.width = W; c.height = H; }
    const g = c.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.filter = "none";
    g.clearRect(0, 0, W, H);
    return g;
  }
  function tokens(S) {
    const look = S.look, T = look.tone, tex = look.texture;
    const K = { ...T, acc: S.accent };
    return { S, W: S.W, H: S.H, u: S.u, tall: S.tall, K, tex, streak: S.paint && tex > 0 ? hexA(T.board, 0.42 * tex + 0.08) : null };
  }
  // The eraser comes in before a scene ends and finishes its swipe just after the next one begins;
  // what little ink it leaves behind fades over the rest of the change.
  const LEAD = 0.62, tailOf = (c) => Math.min(0.42, c * 0.9);
  // The marker works fastest at the start of a drawing, so a new scene fills the board quickly and the
  // finishing details land more slowly; unwarp is the inverse, for where the marker is due next.
  const WARP = 2, warp = (x) => 1 - Math.pow(1 - clamp(x), WARP), unwarp = (v) => 1 - Math.pow(1 - clamp(v), 1 / WARP);
  const scrub = (local, hold, c) => { const k = span(local, hold - LEAD, hold + tailOf(c)); return k * 0.6 + inout(k) * 0.4; };
  const fullR = (F) => ({ x: 30 * F.u, y: 30 * F.u, w: F.W - 60 * F.u, h: F.H - 60 * F.u });
  // How long the marker draws. A scene with another after it finishes before the eraser comes; the last
  // scene draws at the same pace, then saves its closing beat for the final moments.
  function drawSpan(hold, delay, hasNext) {
    const D = Math.max(1.4, hold - LEAD - 0.4 - delay);
    if (hasNext) return { D, lateAt: 0.88 };
    const Dl = Math.max(D, Math.min(6, hold - 0.6 - delay));
    return { D: Dl, lateAt: clamp((D * 0.9) / Dl, 0.5, 0.88) };
  }
  // The erased layer goes down, the marker leaves for the tray, and the eraser rides over the top.
  function wipeOut(ctx, F, g, er, info, pen, exiting, heads) {
    const head = erase(g, F, fullR(F), er);
    // Once the next scene is under way its headline goes where this one was: the old words leave no ghost.
    if (exiting && heads) {
      g.save(); g.globalCompositeOperation = "destination-out"; g.fillStyle = "#000";
      for (const id of heads) for (const l of headLines(id)) g.fillRect(l.x - 40 * F.u, l.y - 30 * F.u, l.w + 120 * F.u, l.h + 70 * F.u);
      g.restore();
    }
    ctx.save(); ctx.globalAlpha *= exiting ? 1 - span(info.local - info.hold, tailOf(info.change || 0.45), info.change || 0.45) : 1; ctx.drawImage(g.canvas, 0, 0); ctx.restore();
    const m = (info.local - (info.hold - LEAD)) / 0.4;
    if (pen && m < 1) { const e = ease(m); drawPen(ctx, F, { ...pen, x: lerp(pen.x, F.W + 340 * F.u, e), y: lerp(pen.y, F.H + 300 * F.u, e), lift: 1 }); }
    if (er < 1) drawEraser(ctx, F, head.x, head.y, head.tilt, head.len, head.dir);
  }
  const seedOf = (id) => ({ chart: 11, object: 23, people: 37, process: 41, compare: 53 })[id] || 7;
  const scene = (id) => (ctx, S, box, p, d, info) => {
    const F = tokens(S), A = areaOf(F, id), c = info.change || 0.45;
    const exiting = info.exit !== undefined;
    const hasNext = exiting || !!(stageInfo && stageInfo.next && stageInfo.scene === id);
    const e = hasNext ? scrub(info.local, info.hold, c) : 0;
    const delay = 0.08, { D, lateAt } = drawSpan(info.hold, delay, hasNext);
    const q = warp(clamp((info.local - delay) / D));
    const sk = new Sk(F, q, (v) => delay + unwarp(v) * D, info.local, seedOf(id));
    sk.lateAt = lateAt;
    // The headline is written first, then the drawing under it.
    heading(sk, F, `${id}-title`, 0, 0.1, F.K.ink, true);
    sk.off = 0.1; sk.span = 0.9;
    const g = e > 0 ? layer(exiting ? "out" : "cur", F.W, F.H) : ctx;
    DRAW[id](g, F, A, d, q, info.t, sk);
    if (e > 0) wipeOut(ctx, F, g, e, info, sk.pen, exiting, [`${id}-title`]);
    else drawPen(ctx, F, sk.pen);
    if (!exiting && S.paint) gloss(ctx, F, info.t);
  };
  // run() draws the strokes and keeps the marker position from the same pass.
  const runOrig = Sk.prototype.run;
  Sk.prototype.run = function (g) { this.pen = runOrig.call(this, g); return this.pen; };

  function statementFrame(ctx, F, id, info, er, exiting) {
    const g = er > 0 ? layer(exiting ? "stageOut" : "stage", F.W, F.H) : ctx;
    const st = statement(g, F, id, info, drawSpan(info.hold, 0.05, !!info.next));
    st.sk.run(g);
    if (st.spark && st.q > 0.92) sparks(g, F, st.spark[0], st.spark[1], st.spark[2], 5, info.t, F.K.acc, Math.PI * 1.1);
    if (er > 0) wipeOut(ctx, F, g, er, info, st.sk.pen, exiting, HEADS[id]);
    else drawPen(ctx, F, st.sk.pen);
  }
  // The scene shown before this one, from the same controls the template reads.
  const NOTE = { chart: 1, object: 3, people: 2, process: 0, compare: 4 };
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  function prevOf(id) {
    const c = controls(), i = ORDER.indexOf(id);
    for (let k = i - 1; k >= 0; k--) { const hold = Number(c[`${ORDER[k]}_hold`]) || 0; if (hold > 0) return { id: ORDER[k], hold }; }
    return null;
  }

  const TONE = {
    board: "#f3f5f6", boardLite: "#fbfcfc", boardDark: "#e2e6e9", smudgeRGB: "92,104,118", ghost: "#7d8996", ghostTint: "#6f86b8",
    frame: "#b9bfc6", frameLite: "#eef0f2", frameDark: "#8a929b", cap: "#5b6168", capLite: "#8b9299",
    ink: "#1f2329", blue: "#2c5bd0", green: "#1e9550", reflect: 0.22, sheen: 0.14,
    eraser: "#2f3a4a", eraserLite: "#56667c", eraserDark: "#1d2530",
    sticky: "#f6d955", stickyLite: "#fbe98e", stickyFold: "#d9b934", stickyInk: "#3a3326", magnet: "#e0352b",
  };
  return {
    bg: "#f3f5f6", panel: "rgba(31,35,41,0.04)", ink: "#1f2329", muted: "#5d6672", accent: "#e0352b", onAccent: "#ffffff",
    rule: "rgba(31,35,41,0.75)", track: "rgba(31,35,41,0.08)",
    display: HAND, displayWeight: 700, displayCase: "none", displayTracking: "0.005em",
    body: HAND, bodyWeight: 700, figures: HAND, radius: 18, motion: "write", change: "fade",
    kit: { line: 5, fill: "hatch", panel: "outline", hatch: true },
    panelEdge: "rgba(31,35,41,0.7)",
    tone: TONE,
    keepArt: true,
    overlap: true,
    palettes: {
      // Warm melamine, a black glass board with bright liquid markers, and plain graphite on grey.
      light: { bg: "#f6f1e6", ink: "#2a251f", muted: "#6e655a", accent: "#d4462a", rule: "rgba(42,37,31,0.75)", panelEdge: "rgba(42,37,31,0.7)", backdrop: () => "#f6f1e6",
        tone: { ...TONE, board: "#f6f1e6", boardLite: "#fcf9f2", boardDark: "#e8dfcd", smudgeRGB: "120,100,70", ghost: "#9a8c78", ghostTint: "#8a7f9e", ink: "#2a251f", blue: "#2b56b3", green: "#2d874a", frame: "#c2b8a8", frameLite: "#f1ece4", frameDark: "#968b7b", eraser: "#5a3d2b", eraserLite: "#8a6248", eraserDark: "#3a271b" } },
      dark: { bg: "#16191d", panel: "rgba(255,255,255,0.05)", ink: "#f3f5f7", muted: "#a9b2bd", accent: "#ff5c8a", onAccent: "#16191d", rule: "rgba(243,245,247,0.75)", track: "rgba(243,245,247,0.1)", panelEdge: "rgba(243,245,247,0.6)", backdrop: () => "#16191d",
        tone: { ...TONE, board: "#16191d", boardLite: "#22272d", boardDark: "#0c0e10", smudgeRGB: "160,175,190", ghost: "#8794a2", ghostTint: "#6d8fc4", ink: "#f3f5f7", blue: "#5cb6ff", green: "#6fe0a0", reflect: 0.06, sheen: 0.05, frame: "#3c4148", frameLite: "#5d636b", frameDark: "#24282d", cap: "#101214", capLite: "#2b2f34", eraser: "#c9ced4", eraserLite: "#eef1f4", eraserDark: "#8c939b", sticky: "#e9c94a", stickyLite: "#f2da72", stickyFold: "#b89a2c", magnet: "#ff5c8a" } },
      mono: { bg: "#f1f1ef", ink: "#1d1d1d", muted: "#666666", accent: "#1d1d1d", rule: "rgba(29,29,29,0.75)", panelEdge: "rgba(29,29,29,0.7)", backdrop: () => "#f1f1ef",
        tone: { ...TONE, board: "#f1f1ef", boardLite: "#fafaf9", boardDark: "#e1e1de", smudgeRGB: "90,90,90", ghost: "#8a8a8a", ghostTint: "#8a8a8a", ink: "#1d1d1d", blue: "#5a5a5a", green: "#3a3a3a", frame: "#bdbdbd", frameLite: "#efefef", frameDark: "#8c8c8c", eraser: "#3a3a3a", eraserLite: "#666666", eraserDark: "#1f1f1f", sticky: "#dcdcd8", stickyLite: "#ececea", stickyFold: "#bdbdb8", stickyInk: "#2a2a2a", magnet: "#3a3a3a" } },
    },
    backdrop: () => "#f3f5f6",
    // The template still lays the words out, but the marker letters them on the board, so its own text is hidden.
    css: () => `#root .kicker { letter-spacing: 0.06em; text-transform: none; } #root .kicker, #root .display { color: transparent !important; text-shadow: none !important; -webkit-text-stroke: 0 transparent !important; }`,
    // The board is drawn by the stage; this pass only marks the backdrop as on.
    paint: (ctx, W, H) => { ctx.clearRect(0, 0, W, H); },
    stage(ctx, S, info) {
      stageInfo = info;
      const F = tokens(S);
      if (S.paint) ctx.drawImage(boardCanvas(F), 0, 0);
      if (S.paint && info.scene in NOTE) {
        // The note for this topic drops onto the corner as the scene starts and lifts away as it ends.
        const u = F.u, sz = (F.tall ? 132 : 172) * u, lines = headLines(`${info.scene}-title`);
        const right = lines.length ? Math.max(...lines.map((l) => l.x + l.w)) : F.W;
        const x = F.W - (F.tall ? 70 : 110) * u - sz, y = (F.tall ? 26 : 38) * u;
        if (F.tall || right < x - 60 * u) {
          const inK = ease(info.local / 0.5), outK = info.next ? inout(span(info.local, info.hold - 0.45, info.hold)) : 0;
          sticky(ctx, F, x, y - (1 - inK) * (sz + 80 * u) - outK * (sz + 80 * u), sz, NOTE[info.scene], info.t, 1);
        }
      }
      const c = info.change || 0.45, prev = prevOf(info.scene);
      // A statement that just ended keeps being swiped off through the start of the next scene.
      if (prev && (prev.id === "title" || prev.id === "closing") && info.local < c && info.scene !== prev.id) {
        const pi = { t: info.t, local: prev.hold + info.local, hold: prev.hold, change: c, next: info.scene };
        statementFrame(ctx, F, prev.id, pi, scrub(pi.local, prev.hold, c), true);
      }
      if (info.scene === "title" || info.scene === "closing") {
        statementFrame(ctx, F, info.scene, info, info.next ? scrub(info.local, info.hold, c) : 0, false);
        if (S.paint) gloss(ctx, F, info.t);
      }
    },
    scenes: { chart: scene("chart"), object: scene("object"), people: scene("people"), process: scene("process"), compare: scene("compare") },
  };
});
