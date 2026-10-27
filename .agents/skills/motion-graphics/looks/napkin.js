// Napkin: a marker sketch on an embossed paper napkin lying on a worn wooden table. One felt-tip marker
// draws everything, one stroke or letter at a time, its nib always on the line it is making; it lifts
// between strokes and leaves the frame to swap colours. Headlines are hand-lettered by the same pen. Lines
// feather into the tissue, a coffee cup steams in the corner, and each scene arrives on a fresh napkin
// slid over the last, the old sketch showing faintly through the tissue. All drawings are original.
// Frames are pure functions of time: seeded noise only, no clocks.
window.DreamcutMotion.register("napkin", ({ rng, hexA }) => {
  const M = window.DreamcutMotion;
  const TAU = Math.PI * 2, PI = Math.PI;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const inout = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const HAND = "'Marker Felt', 'Chalkboard SE', 'Noteworthy', 'Segoe Print', 'Comic Sans MS', cursive";
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  const HEADS = { title: "title", chart: "chart-title", object: "object-title", people: "people-title", process: "process-title", compare: "compare-title", closing: "closing" };

  // Deterministic noise in [-1, 1] from three integers.
  function hsh(a, b = 0, c = 0) {
    let h = (Math.floor(a * 131) * 374761393) ^ (Math.floor(b) * 668265263) ^ (Math.floor(c) * 2147483629);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return ((h >>> 0) / 4294967296) * 2 - 1;
  }

  // ---- paths that can be drawn part-way -------------------------------------------------------------
  class Pth {
    constructor(ox = 0, oy = 0, k = 1, rot = 0) { this.s = []; this.c = null; this.ox = ox; this.oy = oy; this.k = k; this.ca = Math.cos(rot); this.sa = Math.sin(rot); this.d = null; this.n = -1; }
    _p(x, y) { return [this.ox + (x * this.ca - y * this.sa) * this.k, this.oy + (x * this.sa + y * this.ca) * this.k]; }
    _m(x, y) { this.c = [x, y]; this.s.push(this.c); this.d = null; return this; }
    _l(x, y) { if (!this.c) return this._m(x, y); this.c.push(x, y); this.d = null; return this; }
    M(x, y) { const p = this._p(x, y); return this._m(p[0], p[1]); }
    L(x, y) { const p = this._p(x, y); return this._l(p[0], p[1]); }
    Z() { if (this.c && this.c.length > 2) this.c.push(this.c[0], this.c[1]); this.d = null; return this; }
    Q(cx, cy, x, y) {
      const a = this.c ? [this.c[this.c.length - 2], this.c[this.c.length - 1]] : null;
      const c = this._p(cx, cy), e = this._p(x, y);
      if (!a) return this._m(e[0], e[1]);
      for (let i = 1; i <= 14; i++) { const t = i / 14, m = 1 - t; this._l(m * m * a[0] + 2 * m * t * c[0] + t * t * e[0], m * m * a[1] + 2 * m * t * c[1] + t * t * e[1]); }
      return this;
    }
    C(c1x, c1y, c2x, c2y, x, y) {
      const a = this.c ? [this.c[this.c.length - 2], this.c[this.c.length - 1]] : null;
      const c1 = this._p(c1x, c1y), c2 = this._p(c2x, c2y), e = this._p(x, y);
      if (!a) return this._m(e[0], e[1]);
      for (let i = 1; i <= 18; i++) {
        const t = i / 18, m = 1 - t;
        this._l(m * m * m * a[0] + 3 * m * m * t * c1[0] + 3 * m * t * t * c2[0] + t * t * t * e[0], m * m * m * a[1] + 3 * m * m * t * c1[1] + 3 * m * t * t * c2[1] + t * t * t * e[1]);
      }
      return this;
    }
    E(cx, cy, rx, ry, a0, a1, move) {
      const steps = Math.max(8, Math.ceil((Math.abs(a1 - a0) * Math.max(rx, ry) * this.k) / 7));
      for (let i = 0; i <= steps; i++) {
        const a = a0 + ((a1 - a0) * i) / steps, p = this._p(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
        if (i === 0 && (move || !this.c)) this._m(p[0], p[1]); else this._l(p[0], p[1]);
      }
      return this;
    }
    A(cx, cy, r, a0, a1, move) { return this.E(cx, cy, r, r, a0, a1, move); }
    O(cx, cy, r, a0 = -PI / 2) { return this.E(cx, cy, r, r, a0, a0 + TAU, true); }
    R(x, y, w, h) { return this.M(x, y).L(x + w, y).L(x + w, y + h).L(x, y + h).Z(); }
    RR(x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      this.M(x + r, y).L(x + w - r, y).A(x + w - r, y + r, r, -PI / 2, 0).L(x + w, y + h - r).A(x + w - r, y + h - r, r, 0, PI / 2);
      return this.L(x + r, y + h).A(x + r, y + h - r, r, PI / 2, PI).L(x, y + r).A(x + r, y + r, r, PI, PI * 1.5);
    }
    poly(pts, close) { pts.forEach(([x, y], i) => (i ? this.L(x, y) : this.M(x, y))); return close ? this.Z() : this; }
    // The same strokes, with no segment longer than ~13px, so wobble can bend straight lines.
    dense() {
      if (this.d) return this.d;
      this.d = this.s.map((s) => {
        const out = [s[0], s[1]];
        for (let i = 2; i < s.length; i += 2) {
          const x0 = s[i - 2], y0 = s[i - 1], dx = s[i] - x0, dy = s[i + 1] - y0, n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 13));
          for (let k = 1; k <= n; k++) out.push(x0 + (dx * k) / n, y0 + (dy * k) / n);
        }
        return out;
      });
      this.n = -1;
      return this.d;
    }
    len() {
      if (this.n >= 0) return this.n;
      let n = 0;
      for (const s of this.dense()) for (let i = 2; i < s.length; i += 2) n += Math.hypot(s[i] - s[i - 2], s[i + 1] - s[i - 1]);
      return (this.n = n);
    }
    pts() { const s = this.dense()[0] || []; const out = []; for (let i = 0; i < s.length; i += 2) out.push([s[i], s[i + 1]]); return out; }
    at(q) { // Point a fraction q along the first stroke.
      const s = this.dense()[0]; let total = 0;
      for (let i = 2; i < s.length; i += 2) total += Math.hypot(s[i] - s[i - 2], s[i + 1] - s[i - 1]);
      let left = total * clamp(q);
      for (let i = 2; i < s.length; i += 2) {
        const d = Math.hypot(s[i] - s[i - 2], s[i + 1] - s[i - 1]);
        if (d >= left) { const k = d ? left / d : 0; return { x: s[i - 2] + (s[i] - s[i - 2]) * k, y: s[i - 1] + (s[i + 1] - s[i - 1]) * k, a: Math.atan2(s[i + 1] - s[i - 1], s[i] - s[i - 2]) }; }
        left -= d;
      }
      return { x: s[s.length - 2], y: s[s.length - 1], a: 0 };
    }
  }
  // Smooth curve through points (quadratics between midpoints).
  function through(pts) {
    const P = new Pth();
    if (pts.length < 2) return P;
    P.M(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) P.Q(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
    const l = pts[pts.length - 1];
    return P.L(l[0], l[1]);
  }


  // ---- one pen, one stroke at a time ----------------------------------------------------------------
  // Every drawn element claims a slot on the scene's pen clock with step(): it starts only when the one
  // before it has finished, after a short lift-and-move (or, when the ink colour changes, a trip off the
  // edge of the frame to swap markers). The returned 0..1 is that element's progress.
  function mkSq(local, first, scale, col) { return { local, cur: 0, first, scale, k: -1, col, gap: null, endPt: null, fx: 0, fm: 0 }; }
  function step(F, dur, col, firm) {
    const s = F.sq;
    col = col || F.ink;
    const swap = s.col !== col;
    const gap = s.k < 0 ? s.first : (swap ? 0.32 : 0.05) * s.scale;
    const t0 = s.cur + gap, t1 = t0 + Math.max(0.01, dur * (firm ? Math.max(0.8, s.scale) : s.scale));
    s.k++; F.si = s.k;
    if (s.local >= s.cur && s.local < t0 && gap > 0) s.gap = { next: s.k, frac: (s.local - s.cur) / gap, from: s.col, to: col, end: s.endPt, start: null, first: s.k === 0 };
    if (firm) s.fm += dur; else s.fx += dur + (s.k > 0 ? (swap ? 0.32 : 0.05) : 0);
    s.col = col; s.cur = t1;
    return clamp((s.local - t0) / (t1 - t0));
  }
  const textDur = (s) => Math.max(0.14, String(s ?? "").length * 0.026);
  // Note where the pen must travel to (first point of the next element) and where it last lifted.
  function trackStart(F, x, y, quiet) {
    const s = F.sq;
    if (!s || quiet || !s.gap || s.gap.start || F.si !== s.gap.next) return;
    s.gap.start = { x, y };
  }
  function trackEnd(F, x, y, quiet) { if (F.sq && !quiet) F.sq.endPt = { x, y }; }

  // ---- the marker -----------------------------------------------------------------------------------
  // Stroke a path with a wandering felt-tip line. A fraction q of the path is drawn; the head of an
  // unfinished stroke is where the marker's nib sits. Every point wobbles slowly with its place along the
  // line and shivers once per boil frame, so line-work boils the way a hand-drawn cartoon does.
  function ink(F, P, q = 1, o = {}) {
    const sd = o.seed ?? (F.n++ * 7.31 + 1);
    const polys = P.dense();
    if (polys[0] && polys[0].length >= 2) trackStart(F, polys[0][0], polys[0][1], o.quiet);
    if (q <= 0) return;
    const { g, u } = F, amp = o.amp ?? 1, w = (o.w ?? 4.4) * u;
    let left = P.len() * Math.min(1, q), s = 0, done = false, last = null, lastAng = 0;
    g.save();
    g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = o.col || F.ink; g.lineWidth = w; g.globalAlpha = o.alpha ?? 1;
    if (o.dash) { g.setLineDash(o.dash.map((v) => v * u)); g.lineDashOffset = (o.flow || 0) * u; }
    for (const pl of polys) {
      if (pl.length < 4) continue;
      g.beginPath();
      let px = 0, py = 0;
      for (let i = 0; i < pl.length; i += 2) {
        let x = pl[i], y = pl[i + 1], stop = false;
        if (i > 0) {
          const dx = x - px, dy = y - py, d = Math.hypot(dx, dy);
          if (d >= left) { const k = d ? left / d : 0; x = px + dx * k; y = py + dy * k; s += left; left = 0; stop = true; }
          else { left -= d; s += d; }
          lastAng = Math.atan2(dy, dx);
        }
        px = pl[i]; py = pl[i + 1];
        const j = i >> 1;
        const X = x + ((Math.sin(s * 0.019 + sd * 1.3) + 0.7 * Math.sin(s * 0.047 + sd * 2.9)) * 1.5 + hsh(sd, j, F.boil) * 0.85) * u * amp;
        const Y = y + ((Math.sin(s * 0.016 + sd * 2.1 + 1.7) + 0.7 * Math.sin(s * 0.051 + sd * 0.7)) * 1.5 + hsh(sd + 7, j, F.boil) * 0.85) * u * amp;
        if (i === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
        last = [X, Y];
        if (stop) { done = true; break; }
      }
      g.stroke();
      if (done) break;
    }
    g.restore();
    if (q < 1 && last && !o.quiet) F.tip = { x: last[0], y: last[1], col: o.col || F.ink, a: lastAng };
    if (q >= 1 && last) trackEnd(F, last[0], last[1], o.quiet);
  }
  // Marker scribble that fills a closed shape: back-and-forth rows cut to the outline, so the nib
  // never leaves the shape it is filling.
  function scrib(F, shape, q, o = {}) {
    const { g, u } = F, pts = Array.isArray(shape) ? shape : shape.pts();
    if (pts.length < 3) return;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const st = (o.step ?? 12) * u, ang = o.ang ?? -0.85, dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2 + st;
    const Pz = new Pth();
    let k = 0, any = false;
    for (let off = -R; off <= R; off += st) {
      const px = cx + nx * off, py = cy + ny * off, hits = [];
      for (let i = 0; i < pts.length; i++) {
        const A = pts[i], B = pts[(i + 1) % pts.length], ex = B[0] - A[0], ey = B[1] - A[1], den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-9) continue;
        const wx = A[0] - px, wy = A[1] - py, sv = (wx * ey - wy * ex) / den, v = (wx * dy - wy * dx) / den;
        if (v >= 0 && v <= 1) hits.push(sv);
      }
      if (hits.length < 2) continue;
      let a = Math.min(...hits) + st * 0.15, b = Math.max(...hits) - st * 0.15;
      if (b <= a) continue;
      if (k % 2) [a, b] = [b, a];
      if (!any) Pz.M(px + dx * a, py + dy * a); else Pz.L(px + dx * a, py + dy * a);
      Pz.L(px + dx * b, py + dy * b);
      any = true; k++;
    }
    if (!any) return;
    g.save();
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.clip();
    ink(F, Pz, q, { col: o.col, w: o.w ?? 4, alpha: o.alpha ?? 0.6, seed: o.seed, amp: 0.7, quiet: o.quiet });
    g.restore();
  }

  // ---- hand lettering -------------------------------------------------------------------------------
  // Felt-marker letters written one at a time: each glyph leans, swells and drifts off the line by its own
  // seeded amount, boils with the line-work, and carries uneven ink: dense where the nib landed, thinner
  // where it dragged, with a small pool where each word ends. The glyph being written is revealed behind
  // the nib, which rides across it.
  function letters(F, gl, size, q, o = {}) {
    if (!gl.length) return;
    trackStart(F, gl[0].x, gl[0].y, o.quiet);
    if (q <= 0) return;
    const { g, u } = F, col = o.col || F.ink, seed = o.seed || 1, n = gl.length;
    const pos = clamp(q) * n, full = Math.floor(pos), frac = pos - full;
    g.save();
    g.font = `${o.weight || 400} ${size}px ${HAND}`; g.textBaseline = "middle"; g.textAlign = "left"; g.lineJoin = "round"; g.lineCap = "round";
    g.globalAlpha = o.alpha ?? 1;
    let tip = null, endPt = null;
    for (let i = 0; i < n && i <= full; i++) {
      const G = gl[i], part = i === full ? frac : 1;
      if (part <= 0) break;
      if (G.ch === " ") continue;
      const sd = seed * 31 + i * 7;
      const rot = hsh(sd, 1, 7) * 0.11 + Math.sin(i * 0.7 + seed) * 0.03;
      const sc = 1 + hsh(sd, 2, 7) * 0.09, sq = 1 + hsh(sd, 5, 7) * 0.07;
      const dy = hsh(sd, 3, 7) * size * 0.035 + Math.sin(i * 0.31 + seed * 1.3) * size * 0.04;
      const dx = hsh(sd, 4, 7) * size * 0.012;
      const jx = hsh(sd, F.boil, 9) * 0.7 * u, jy = hsh(sd + 3, F.boil, 9) * 0.7 * u;
      const cx = G.x + G.w / 2 + dx + jx, cy = G.y + dy + jy;
      g.save();
      g.translate(cx, cy); g.rotate(rot); g.scale(sc * sq, sc);
      if (part < 1) { g.beginPath(); g.rect(-G.w / 2 - size * 0.12, -size, (G.w + size * 0.24) * part, size * 2); g.clip(); }
      const px = hsh(sd, 6, 7) * G.w * 0.4, py = (hsh(sd, 8, 7) > 0 ? -0.28 : 0.22) * size;
      const gr = g.createRadialGradient(px, py, 0, px, py, size * 0.8);
      gr.addColorStop(0, hexA(col, 1)); gr.addColorStop(0.4, hexA(col, 0.9)); gr.addColorStop(1, hexA(col, 0.68));
      g.fillStyle = gr; g.fillText(G.ch, -G.w / 2, 0);
      g.strokeStyle = hexA(col, 0.62); g.lineWidth = size * 0.04; g.strokeText(G.ch, -G.w / 2, 0);
      // A pool of ink where the marker rested at the end of a word.
      const wordEnd = i === n - 1 || gl[i + 1].ch === " ";
      if (wordEnd && part >= 1) {
        g.fillStyle = hexA(col, 0.55); g.beginPath();
        g.ellipse(G.w / 2 - size * 0.04, size * (0.12 + hsh(sd, 9, 7) * 0.1), size * 0.028, size * 0.022, 0.4, 0, TAU); g.fill();
      }
      g.restore();
      if (part < 1) tip = { x: G.x + G.w * part, y: G.y + Math.sin(part * TAU * 1.5) * size * 0.2 };
      endPt = { x: cx + G.w / 2, y: cy + size * 0.1 };
    }
    g.restore();
    if (tip && !o.quiet) F.tip = { x: tip.x, y: tip.y, col, a: 0 };
    if (q >= 1 && endPt) trackEnd(F, endPt.x, endPt.y, o.quiet);
  }
  const glyphCache = new Map();
  // Handwriting at a point, laid out with the hand font. y is the baseline. Returns the full width.
  function say(F, s, x, y, size, o = {}) {
    s = String(s ?? "");
    if (!s) return 0;
    const { g } = F;
    const font = (z) => `${o.weight || 400} ${z}px ${HAND}`;
    const key = s + "|" + size + "|" + (o.maxW || 0) + "|" + (o.min || 0);
    let L = glyphCache.get(key);
    if (!L) {
      g.save();
      let sz = size;
      g.font = font(sz);
      let w = g.measureText(s).width;
      if (o.maxW && w > o.maxW) { sz = Math.max(o.min || size * 0.8, (size * o.maxW) / w); g.font = font(sz); w = g.measureText(s).width; }
      const xs = [];
      for (let i = 0; i <= s.length; i++) xs.push(g.measureText(s.slice(0, i)).width);
      g.restore();
      L = { sz, w, xs };
      glyphCache.set(key, L);
    }
    const x0 = o.align === "center" ? x - L.w / 2 : o.align === "right" ? x - L.w : x;
    const gl = [];
    for (let i = 0; i < s.length; i++) gl.push({ ch: s[i], x: x0 + L.xs[i], y: y - L.sz * 0.33, w: L.xs[i + 1] - L.xs[i] });
    letters(F, gl, L.sz, o.q ?? 1, { col: o.col, seed: o.seed ?? (s.length * 3 + Math.round(x)), quiet: o.quiet, alpha: o.alpha });
    return L.w;
  }
  // Write a label as its own pen step.
  function write(F, s, x, y, size, o = {}) { const q = step(F, textDur(s), o.col, true); return say(F, s, x, y, size, { ...o, q }); }
  function measure(F, s, size, weight = 400) { F.g.save(); F.g.font = `${weight} ${size}px ${HAND}`; const w = F.g.measureText(String(s ?? "")).width; F.g.restore(); return w; }

  // ---- small drawings -------------------------------------------------------------------------------
  function star(F, cx, cy, r, q, o = {}) {
    const P = new Pth(cx, cy, 1, o.rot || 0);
    for (let i = 0; i <= 10; i++) { const a = -PI / 2 + (i * PI) / 5, rr = i % 2 ? r * 0.42 : r; if (i) P.L(Math.cos(a) * rr, Math.sin(a) * rr); else P.M(Math.cos(a) * rr, Math.sin(a) * rr); }
    ink(F, P, q, { col: o.col, w: o.w ?? 3.6, seed: o.seed });
  }
  function sparkle(F, cx, cy, r, q, o = {}) {
    const P = new Pth(cx, cy, 1, o.rot || 0);
    P.M(0, -r).Q(r * 0.12, -r * 0.12, r, 0).Q(r * 0.12, r * 0.12, 0, r).Q(-r * 0.12, r * 0.12, -r, 0).Q(-r * 0.12, -r * 0.12, 0, -r);
    ink(F, P, q, { col: o.col, w: o.w ?? 3.4, seed: o.seed });
  }
  function twinkle(F, cx, cy, r, t, ph, q, o = {}) {
    const k = 0.55 + 0.45 * Math.sin(t * 3.2 + ph);
    sparkle(F, cx, cy, r * k, q, { ...o, rot: Math.sin(t + ph) * 0.2 });
  }
  function spiral(F, cx, cy, r, turns, q, o = {}) {
    const P = new Pth();
    const n = Math.round(turns * 24);
    for (let i = 0; i <= n; i++) { const a = (i / 24) * TAU + (o.rot || 0), rr = (r * i) / n; if (i) P.L(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); else P.M(cx, cy); }
    ink(F, P, q, { col: o.col, w: o.w ?? 3.4, seed: o.seed });
  }
  function sun(F, cx, cy, r, q, t, o = {}) {
    ink(F, new Pth().O(cx, cy, r), span(q, 0, 0.5), { col: o.col, w: 4, seed: o.seed });
    const P = new Pth();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + t * 0.25, l = r * (0.42 + 0.14 * Math.sin(t * 2.6 + i * 1.7));
      P.M(cx + Math.cos(a) * r * 1.35, cy + Math.sin(a) * r * 1.35).L(cx + Math.cos(a) * (r * 1.35 + l), cy + Math.sin(a) * (r * 1.35 + l));
    }
    ink(F, P, span(q, 0.3, 1), { col: o.col, w: 3.6, seed: (o.seed || 3) + 1 });
  }
  function cloud(F, cx, cy, w, q, o = {}) {
    const h = w * 0.34, P = new Pth(cx, cy, 1);
    P.M(-w * 0.5, h * 0.5).A(-w * 0.34, h * 0.12, h * 0.38, PI * 0.5, PI * 1.5).A(-w * 0.06, -h * 0.22, h * 0.52, PI * 1.05, PI * 1.95).A(w * 0.26, -h * 0.05, h * 0.42, PI * 1.45, PI * 2.5).L(w * 0.5, h * 0.5).L(-w * 0.5, h * 0.5);
    ink(F, P, q, { col: o.col, w: o.w ?? 3.8, seed: o.seed });
  }
  function heart(F, cx, cy, s, q, o = {}) {
    const P = new Pth();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * TAU, x = 16 * Math.pow(Math.sin(a), 3), y = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a));
      if (i) P.L(cx + x * s, cy + y * s - s * 3); else P.M(cx + x * s, cy + y * s - s * 3);
    }
    if (o.fill) scrib(F, P, span(q, 0.4, 1), { col: o.fill, step: 7, w: 4, alpha: 0.8 });
    ink(F, P, span(q, 0, 0.7), { col: o.col, w: o.w ?? 3.8, seed: o.seed });
  }
  function arrowTo(F, x1, y1, x2, y2, bend, q, o = {}) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, L = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / L, ny = (x2 - x1) / L;
    const cx = mx + nx * bend, cy = my + ny * bend;
    const P = new Pth().M(x1, y1).Q(cx, cy, x2, y2);
    const a = Math.atan2(y2 - cy, x2 - cx), hs = (o.head ?? 26) * F.u;
    P.M(x2 - Math.cos(a - 0.5) * hs, y2 - Math.sin(a - 0.5) * hs).L(x2, y2).L(x2 - Math.cos(a + 0.5) * hs, y2 - Math.sin(a + 0.5) * hs);
    ink(F, P, q, { col: o.col, w: o.w ?? 4.2, seed: o.seed, dash: o.dash, flow: o.flow });
    return { x: lerp(lerp(x1, cx, 0.5), lerp(cx, x2, 0.5), 0.5), y: lerp(lerp(y1, cy, 0.5), lerp(cy, y2, 0.5), 0.5) };
  }
  function bezPoint(x1, y1, cx, cy, x2, y2, t) { const m = 1 - t; return [m * m * x1 + 2 * m * t * cx + t * t * x2, m * m * y1 + 2 * m * t * cy + t * t * y2]; }
  function tick(F, cx, cy, s, q, o = {}) {
    ink(F, new Pth().M(cx - s * 0.55, cy + s * 0.02).L(cx - s * 0.15, cy + s * 0.45).L(cx + s * 0.6, cy - s * 0.5), q, { col: o.col, w: o.w ?? 6, seed: o.seed });
  }
  function loop(F, cx, cy, rx, ry, q, o = {}) { // a hand-drawn ring that overshoots its start
    const P = new Pth(), turns = 1.18;
    for (let i = 0; i <= 56; i++) { const a = -2.2 + (i / 56) * TAU * turns, k = 1 + 0.07 * (i / 56) * 2; if (i) P.L(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k); else P.M(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry); }
    ink(F, P, q, { col: o.col, w: o.w ?? 4.6, seed: o.seed });
  }
  function squiggle(F, x1, x2, y, amp, q, o = {}) {
    const P = new Pth(), n = Math.max(3, Math.round((x2 - x1) / (46 * F.u)));
    P.M(x1, y);
    for (let i = 0; i < n; i++) P.Q(x1 + ((x2 - x1) * (i + 0.5)) / n, y + (i % 2 ? amp : -amp), x1 + ((x2 - x1) * (i + 1)) / n, y);
    ink(F, P, q, { col: o.col, w: o.w ?? 4.6, seed: o.seed });
  }
  function rays(F, cx, cy, r0, r1, n, q, t, o = {}) {
    const P = new Pth();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU - PI / 2 + (o.spin ? t * o.spin : 0), k = 0.55 + 0.45 * Math.sin(t * 4 + i * 1.9);
      P.M(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0).L(cx + Math.cos(a) * lerp(r0, r1, k), cy + Math.sin(a) * lerp(r0, r1, k));
    }
    ink(F, P, q, { col: o.col, w: o.w ?? 3.8, seed: o.seed, quiet: true });
  }
  function bulb(F, cx, cy, s, q, t, o = {}) {
    const P = new Pth(cx, cy, s / 100);
    P.A(0, -18, 40, PI * 0.78, PI * 2.22, true).Q(26, 26, 16, 38).L(-16, 38).Q(-26, 26, -33, 10);
    P.M(-16, 48).L(16, 48).M(-12, 58).L(12, 58).M(-6, 68).L(6, 68);
    ink(F, P, q, { col: o.col, w: 4.2, seed: o.seed });
    const fil = new Pth(cx, cy, s / 100).M(-10, 38).L(-10, 6).Q(-6, -10, 0, 4).Q(6, -10, 10, 6).L(10, 38);
    ink(F, fil, span(q, 0.5, 1), { col: o.acc, w: 3.8, seed: (o.seed || 1) + 2 });
    if (q > 0.85) rays(F, cx, cy - s * 0.18, s * 0.5, s * (0.74 + 0.1 * Math.sin(t * 3)), 9, 1, t, { col: o.acc, w: 3.6, seed: (o.seed || 1) + 4 });
  }
  function pencil(F, cx, cy, s, q, o = {}) {
    const P = new Pth(cx, cy, s / 100, -0.7);
    P.R(-62, -11, 100, 22).M(38, -11).L(68, 0).L(38, 11).M(-40, -11).L(-40, 11).M(-62, -11).Q(-72, 0, -62, 11);
    ink(F, P, q, { col: o.col, w: 4, seed: o.seed });
    scrib(F, new Pth(cx, cy, s / 100, -0.7).M(38, -11).L(68, 0).L(38, 11).Z(), span(q, 0.5, 1), { col: o.acc, step: 6, w: 3.4, alpha: 0.85, ang: 0.4 });
  }
  function plane(F, cx, cy, s, ang, q, o = {}) {
    const P = new Pth(cx, cy, s / 100, ang);
    P.M(-60, -8).L(64, 0).L(-60, 22).L(-34, 4).Z().M(-34, 4).L(64, 0).M(-34, 4).L(-26, 24).L(-12, 10);
    ink(F, P, q, { col: o.col, w: 4, seed: o.seed, alpha: o.alpha });
  }
  function burst(F, cx, cy, r, q, t, o = {}) {
    const P = new Pth(), n = 14;
    for (let i = 0; i <= n * 2; i++) { const a = -PI / 2 + (i / (n * 2)) * TAU, rr = i % 2 ? r * 0.62 : r * (0.96 + 0.06 * Math.sin(t * 5 + i)); if (i) P.L(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); else P.M(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    if (o.fill) scrib(F, P, span(q, 0.3, 1), { col: o.fill, step: 7, w: 4, alpha: 0.85 });
    ink(F, P, q, { col: o.col, w: o.w ?? 4, seed: o.seed });
  }
  function bird(F, cx, cy, s, t, ph, q, o = {}) {
    const flap = Math.sin(t * 5 + ph) * 0.45;
    ink(F, new Pth(cx, cy, 1).M(-s, -s * 0.2 * (1 + flap)).Q(-s * 0.4, -s * (0.8 + flap), 0, 0).Q(s * 0.4, -s * (0.8 + flap), s, -s * 0.2 * (1 + flap)), q, { col: o.col, w: 3.6, seed: o.seed });
  }
  function mug(F, cx, cy, s, q, t, o = {}) { // a side-on mug with steam curls
    const P = new Pth(cx, cy, s / 100);
    P.M(-40, -34).L(-36, 34).Q(-34, 44, -22, 44).L(22, 44).Q(34, 44, 36, 34).L(40, -34).Z().M(40, -16).Q(66, -16, 62, 8).Q(58, 28, 38, 26);
    ink(F, P, q, { col: o.col, w: 4.2, seed: o.seed });
    scrib(F, new Pth(cx, cy, s / 100).M(-37, -4).L(-35, 32).L(35, 32).L(37, -4).Z(), span(q, 0.4, 1), { col: o.acc, step: 7, w: 3.6, alpha: 0.7 });
    for (let k = 0; k < 3; k++) {
      const ph = (t * 0.5 + k / 3) % 1, x = (k - 1) * 22, sw = Math.sin(t * 3 + k * 2) * 6;
      ink(F, new Pth(cx, cy, s / 100).M(x, -46).Q(x + 12 + sw, -70 - ph * 14, x - 4, -92 - ph * 18).Q(x - 14 - sw, -112 - ph * 12, x + 4, -128), q * (0.35 + 0.65 * Math.sin(ph * PI)), { col: o.col, w: 3, seed: (o.seed || 2) + k, quiet: true, alpha: 0.8 });
    }
  }
  function plant(F, cx, base, s, q, t, o = {}) {
    const P = new Pth(cx, base, s / 100);
    P.M(-26, -44).L(-20, 0).L(20, 0).L(26, -44).Z();
    ink(F, P, q, { col: o.col, w: 4, seed: o.seed });
    scrib(F, new Pth(cx, base, s / 100).M(-25, -40).L(-20, -2).L(20, -2).L(25, -40).Z(), span(q, 0.3, 1), { col: o.acc, step: 8, w: 3.4, alpha: 0.7 });
    for (let k = 0; k < 4; k++) {
      const a = -PI / 2 + (k - 1.5) * 0.52 + Math.sin(t * 1.6 + k) * 0.07, L = 70 + (k % 2) * 28;
      const L1 = new Pth(cx, base, s / 100);
      const ex = Math.cos(a) * L, ey = -44 + Math.sin(a) * L;
      L1.M(0, -44).Q(Math.cos(a - 0.4) * L * 0.6, -44 + Math.sin(a - 0.4) * L * 0.6, ex, ey).Q(Math.cos(a + 0.5) * L * 0.62, -44 + Math.sin(a + 0.5) * L * 0.62, 0, -44);
      ink(F, L1, q, { col: o.green, w: 3.8, seed: (o.seed || 1) + k });
      scrib(F, L1, span(q, 0.5, 1), { col: o.green, step: 7, w: 3, alpha: 0.6, ang: a + 1 });
    }
  }
  function frown(F, cx, cy, r, q, t, o = {}) { face(F, cx, cy, r, q, t, -1, o); }
  function face(F, cx, cy, r, q, t, mood, o = {}) {
    ink(F, new Pth().O(cx, cy, r), q, { col: o.col, w: 4.2, seed: o.seed });
    const blink = (t * 0.8 + (o.ph || 0)) % 3.6 > 3.45;
    const e = new Pth();
    if (blink) e.M(cx - r * 0.5, cy - r * 0.2).L(cx - r * 0.2, cy - r * 0.2).M(cx + r * 0.2, cy - r * 0.2).L(cx + r * 0.5, cy - r * 0.2);
    else e.O(cx - r * 0.36, cy - r * 0.2, r * 0.07).O(cx + r * 0.36, cy - r * 0.2, r * 0.07);
    ink(F, e, span(q, 0.3, 1), { col: o.col, w: 5, seed: (o.seed || 1) + 1 });
    const m = new Pth().M(cx - r * 0.45, cy + r * (mood > 0 ? 0.2 : 0.55)).Q(cx, cy + r * (mood > 0 ? 0.78 : 0.1), cx + r * 0.45, cy + r * (mood > 0 ? 0.2 : 0.55));
    ink(F, m, span(q, 0.5, 1), { col: o.col, w: 4.4, seed: (o.seed || 1) + 2 });
    if (mood < 0) ink(F, new Pth().M(cx - r * 0.74, cy - r * 0.55).L(cx - r * 0.3, cy - r * 0.42).M(cx + r * 0.74, cy - r * 0.55).L(cx + r * 0.3, cy - r * 0.42), span(q, 0.5, 1), { col: o.col, w: 4, seed: (o.seed || 1) + 3 });
  }
  function tangle(F, cx, cy, r, q, t, o = {}) { // a ball of scribble, turning
    const P = new Pth(), n = 120;
    for (let i = 0; i <= n; i++) {
      const a = i * 2.47 + t * 0.9, k = 0.35 + 0.65 * Math.abs(Math.sin(i * 0.37)), x = cx + Math.cos(a) * r * k, y = cy + Math.sin(a * 0.93 + i * 0.05) * r * k;
      if (i) P.L(x, y); else P.M(x, y);
    }
    ink(F, P, q, { col: o.col, w: 2.6, seed: o.seed, amp: 1.2, alpha: 0.8 });
  }
  function check(F, cx, cy, r, q, t, o = {}) {
    ink(F, new Pth().O(cx, cy, r), span(q, 0, 0.55), { col: o.col, w: 5, seed: o.seed });
    tick(F, cx, cy, r * 0.95, span(q, 0.45, 1), { col: o.acc, w: 8, seed: (o.seed || 1) + 1 });
  }
  // Short dash trail used for travelling dots and marching arrows.
  function dot(F, x, y, r, col) {
    const { g } = F;
    g.save(); g.fillStyle = col; g.globalAlpha = 0.95; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.restore();
  }

  // ---- the napkin and the table ---------------------------------------------------------------------
  const TONE = {
    wood: "#6a4526", woodLite: "#8a6034", woodDark: "#3b2411", woodSeam: "#1d1007",
    tissue: "#f6f1e4", tissueLite: "#fffcf3", tissueDark: "#e2d8c0", crease: "74,56,28", ring: "112,70,34",
    ink: "#1d2236", blue: "#2a5cb8", green: "#2e8b57", hi: "#ffd93f", blend: "multiply",
    cup: "#fbf8f1", cupShade: "#d9d2c4", coffee: "#4a2a14", coffeeLite: "#7a4b25", steam: "255,255,255", shadow: "30,16,4", pen: "#f0ece2", penShade: "#bdb5a2",
  };
  let baseCache = null, baseKey = "", toothCache = null, layer = null, layerP = null;

  function makeBase(F) {
    const { W, H, u, T } = F, tex = F.tex;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d"), R = rng(50);
    // Table: planks running across, grain, seams, a knot.
    g.fillStyle = T.wood; g.fillRect(0, 0, W, H);
    const plank = 236 * u;
    for (let y0 = -70 * u, k = 0; y0 < H; y0 += plank, k++) {
      const gr = g.createLinearGradient(0, y0, 0, y0 + plank);
      gr.addColorStop(0, T.woodLite); gr.addColorStop(0.5, T.wood); gr.addColorStop(1, T.woodDark);
      g.globalAlpha = 0.55 + 0.3 * R(); g.fillStyle = gr; g.fillRect(0, y0, W, plank); g.globalAlpha = 1;
      for (let i = 0; i < 46; i++) {
        const yy = y0 + R() * plank, amp = (2 + R() * 7) * u, ph = R() * 9, f = 0.002 + R() * 0.004;
        g.strokeStyle = R() > 0.45 ? `rgba(20,8,0,${0.05 + R() * 0.12 * tex})` : `rgba(255,214,150,${0.03 + R() * 0.07 * tex})`;
        g.lineWidth = (0.8 + R() * 2) * u; g.beginPath();
        for (let x = -10; x <= W + 10; x += 24) { const y = yy + Math.sin(x * f + ph) * amp; if (x < 0) g.moveTo(x, y); else g.lineTo(x, y); }
        g.stroke();
      }
      g.fillStyle = T.woodSeam; g.fillRect(0, y0 + plank - 3 * u, W, 4 * u);
      g.fillStyle = "rgba(255,230,180,0.14)"; g.fillRect(0, y0 + plank + 1 * u, W, 2 * u);
      for (let i = 0; i < 3; i++) { const bx = (0.12 + i * 0.37 + R() * 0.1 + (k % 2) * 0.17) * W; g.fillStyle = T.woodSeam; g.fillRect(bx, y0 + plank - 3 * u, 2 * u, 4 * u); }
    }
    const kx = W * 0.07, ky = H * 0.42;
    for (let i = 0; i < 6; i++) { g.strokeStyle = `rgba(20,8,0,${0.18 - i * 0.02})`; g.lineWidth = 2 * u; g.beginPath(); g.ellipse(kx, ky, (10 + i * 7) * u, (6 + i * 4) * u, 0.1, 0, TAU); g.stroke(); }
    // A second napkin underneath, turned a little, so its corners peek out.
    const m = (F.tall ? 36 : 44) * u, mt = (F.tall ? 34 : 38) * u;
    const nx = m, ny = mt, nw = W - m * 2, nh = H - mt * 2;
    g.save(); g.translate(W / 2, H / 2); g.rotate(0.016); g.translate(-W / 2, -H / 2);
    g.shadowColor = `rgba(${T.shadow},0.45)`; g.shadowBlur = 26 * u; g.shadowOffsetY = 8 * u;
    g.fillStyle = T.tissueDark; g.fillRect(nx - 8 * u, ny + 10 * u, nw + 12 * u, nh + 4 * u);
    g.restore();
    // The top napkin.
    g.save();
    g.shadowColor = `rgba(${T.shadow},0.55)`; g.shadowBlur = 34 * u; g.shadowOffsetY = 12 * u; g.shadowOffsetX = 4 * u;
    g.fillStyle = T.tissue; g.fillRect(nx, ny, nw, nh);
    g.restore();
    g.save();
    g.beginPath(); g.rect(nx, ny, nw, nh); g.clip();
    const sheen = g.createLinearGradient(nx, ny, nx + nw, ny + nh);
    sheen.addColorStop(0, T.tissueLite); sheen.addColorStop(0.5, T.tissue); sheen.addColorStop(1, T.tissueDark);
    g.fillStyle = sheen; g.fillRect(nx, ny, nw, nh);
    // Crumple: soft light and shadow blotches, then crisp wrinkle lines.
    for (let i = 0; i < 70; i++) {
      const x = nx + R() * nw, y = ny + R() * nh, r = (60 + R() * 170) * u, dark = R() > 0.5;
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, dark ? `rgba(${T.crease},${0.07 * tex})` : `rgba(255,255,250,${0.25 * tex})`); rg.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 90; i++) {
      const x = nx + R() * nw, y = ny + R() * nh, a = (R() < 0.5 ? 0.7 : -0.7) + (R() - 0.5) * 1.1, len = (90 + R() * 360) * u;
      const pts = []; for (let k = 0; k <= 6; k++) pts.push([x + Math.cos(a) * len * (k / 6) + (R() - 0.5) * 22 * u, y + Math.sin(a) * len * (k / 6) + (R() - 0.5) * 22 * u]);
      g.lineCap = "round"; g.lineJoin = "round";
      g.strokeStyle = `rgba(${T.crease},${0.08 * tex})`; g.lineWidth = 2.4 * u; g.beginPath(); pts.forEach(([px, py], k) => (k ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
      g.strokeStyle = `rgba(255,255,250,${0.3 * tex})`; g.lineWidth = 1.7 * u; g.beginPath(); pts.forEach(([px, py], k) => (k ? g.lineTo(px + 2.2 * u, py + 2 * u) : g.moveTo(px + 2.2 * u, py + 2 * u))); g.stroke();
    }
    // Tissue grain.
    for (let i = 0; i < Math.round(W * H * 0.0042); i++) {
      g.fillStyle = R() > 0.5 ? `rgba(${T.crease},${(0.03 + R() * 0.07) * tex})` : `rgba(255,255,255,${(0.1 + R() * 0.2) * tex})`;
      g.fillRect(nx + R() * nw, ny + R() * nh, (1 + R() * 2) * u, (1 + R() * 2) * u);
    }
    // Embossed diamond lattice across the whole sheet.
    const sp = 34 * u;
    for (let y = ny + sp / 2, row = 0; y < ny + nh; y += sp / 2, row++) for (let x = nx + (row % 2 ? sp / 2 : 0); x < nx + nw; x += sp) {
      g.fillStyle = `rgba(255,255,250,${0.3 * tex})`; g.fillRect(x - 1.5 * u, y - 1.5 * u, 3 * u, 3 * u);
      g.fillStyle = `rgba(${T.crease},${0.06 * tex})`; g.fillRect(x + 0.5 * u, y + 0.5 * u, 2.4 * u, 2.4 * u);
    }
    // Folds: a quarter-fold cross and a softer fold off to one side.
    const fold = (x1, y1, x2, y2, wd, a) => {
      const hz = Math.abs(y2 - y1) < Math.abs(x2 - x1);
      const gr = hz ? g.createLinearGradient(0, y1 - wd, 0, y1 + wd) : g.createLinearGradient(x1 - wd, 0, x1 + wd, 0);
      gr.addColorStop(0, "rgba(255,255,250,0)"); gr.addColorStop(0.38, `rgba(255,255,250,${0.34 * a * tex})`); gr.addColorStop(0.5, `rgba(${T.crease},${0.22 * a * tex})`); gr.addColorStop(0.62, `rgba(${T.crease},${0.07 * a * tex})`); gr.addColorStop(1, "rgba(255,255,250,0)");
      g.fillStyle = gr;
      if (hz) g.fillRect(x1, y1 - wd, x2 - x1, wd * 2); else g.fillRect(x1 - wd, y1, wd * 2, y2 - y1);
    };
    fold(nx + nw * 0.5, ny, nx + nw * 0.5, ny + nh, 20 * u, 1);
    fold(nx, ny + nh * 0.5, nx + nw, ny + nh * 0.5, 20 * u, 1);
    fold(nx + nw * 0.24, ny, nx + nw * 0.24, ny + nh, 14 * u, 0.55);
    fold(nx, ny + nh * 0.78, nx + nw, ny + nh * 0.78, 12 * u, 0.4);
    // Coffee rings.
    const ring = (cx, cy, r, a0, a1, wd, al) => {
      g.strokeStyle = `rgba(${T.ring},${al * tex})`; g.lineWidth = wd; g.beginPath(); g.ellipse(cx, cy, r, r * 0.96, 0.3, a0, a1); g.stroke();
      g.strokeStyle = `rgba(${T.ring},${al * 0.45 * tex})`; g.lineWidth = wd * 2.6; g.beginPath(); g.ellipse(cx, cy, r - wd, r * 0.96 - wd, 0.3, a0 + 0.2, a1 - 0.3); g.stroke();
      const f = g.createRadialGradient(cx, cy, r * 0.2, cx, cy, r); f.addColorStop(0, "rgba(0,0,0,0)"); f.addColorStop(1, `rgba(${T.ring},${al * 0.14 * tex})`); g.fillStyle = f; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
    };
    ring(nx + nw * 0.1, ny + nh * 0.9, 96 * u, 0.2, 5.6, 6 * u, 0.3);
    ring(nx + nw * 0.135, ny + nh * 0.93, 88 * u, 1.4, 6.0, 4 * u, 0.2);
    ring(nx + nw * 0.93, ny + nh * 0.42, 70 * u, 0.6, 5.2, 4.4 * u, 0.2);
    // Embossed border: two rules with a row of small diamonds between, and corner flourishes.
    const bd = (inset, a) => { g.strokeStyle = `rgba(${T.crease},${0.2 * a * tex})`; g.lineWidth = 2 * u; g.strokeRect(nx + inset, ny + inset, nw - inset * 2, nh - inset * 2); g.strokeStyle = `rgba(255,255,250,${0.65 * a * tex})`; g.lineWidth = 2 * u; g.strokeRect(nx + inset - 2 * u, ny + inset - 2 * u, nw - inset * 2, nh - inset * 2); };
    bd(14 * u, 1); bd(34 * u, 0.8);
    const dia = (x, y, s) => { g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s, y); g.lineTo(x, y + s); g.lineTo(x - s, y); g.closePath(); g.fillStyle = `rgba(255,255,250,${0.6 * tex})`; g.fill(); g.strokeStyle = `rgba(${T.crease},${0.2 * tex})`; g.lineWidth = 1.4 * u; g.stroke(); };
    const sd = 30 * u;
    for (let x = nx + 60 * u; x < nx + nw - 50 * u; x += sd) { dia(x, ny + 24 * u, 6 * u); dia(x, ny + nh - 24 * u, 6 * u); }
    for (let y = ny + 60 * u; y < ny + nh - 50 * u; y += sd) { dia(nx + 24 * u, y, 6 * u); dia(nx + nw - 24 * u, y, 6 * u); }
    for (const [cx, cy] of [[nx, ny], [nx + nw, ny], [nx, ny + nh], [nx + nw, ny + nh]]) {
      const sx = cx < W / 2 ? 1 : -1, sy = cy < H / 2 ? 1 : -1;
      g.strokeStyle = `rgba(${T.crease},${0.22 * tex})`; g.lineWidth = 2 * u;
      for (let k = 1; k <= 3; k++) { g.beginPath(); g.arc(cx + sx * 24 * u, cy + sy * 24 * u, (10 + k * 9) * u, sx > 0 ? (sy > 0 ? PI : PI * 0.5) : (sy > 0 ? PI * 1.5 : 0), sx > 0 ? (sy > 0 ? PI * 1.5 : PI) : (sy > 0 ? TAU : PI * 0.5)); g.stroke(); }
    }
    g.restore();
    // The napkin edge catches the light.
    g.strokeStyle = `rgba(255,255,250,${0.7 * tex})`; g.lineWidth = 2 * u; g.strokeRect(nx + 1 * u, ny + 1 * u, nw - 2 * u, nh - 2 * u);
    return cv;
  }

  function drawCup(ctx, F) {
    const { W, u, t, T } = F;
    const cx = W - 96 * u, cy = 26 * u, R = 172 * u;
    ctx.save();
    // Shadow on the napkin, then the saucer.
    ctx.shadowColor = `rgba(${T.shadow},0.5)`; ctx.shadowBlur = 26 * u; ctx.shadowOffsetX = 10 * u; ctx.shadowOffsetY = 16 * u;
    ctx.fillStyle = T.cup; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    ctx.shadowColor = "transparent";
    const sg = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
    sg.addColorStop(0, "rgba(255,255,255,0.55)"); sg.addColorStop(0.7, "rgba(255,255,255,0)"); sg.addColorStop(1, `rgba(${T.shadow},0.2)`);
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    ctx.strokeStyle = T.cupShade; ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.arc(cx, cy, R * 0.82, 0, TAU); ctx.stroke();
    // A spoon on the saucer.
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(2.35);
    ctx.fillStyle = "#cfd2d6"; ctx.strokeStyle = "#8d9197"; ctx.lineWidth = 2 * u;
    ctx.beginPath(); ctx.moveTo(R * 0.52, -6 * u); ctx.lineTo(R * 0.96, -3 * u); ctx.lineTo(R * 0.96, 3 * u); ctx.lineTo(R * 0.52, 6 * u); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(R * 0.44, 0, 24 * u, 15 * u, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
    // Cup: handle, rim, coffee with a slowly stirring swirl.
    ctx.strokeStyle = T.cup; ctx.lineWidth = 20 * u; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(cx - R * 0.62, cy + R * 0.2, 36 * u, 1.9, 4.3, false); ctx.stroke();
    ctx.strokeStyle = T.cupShade; ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.arc(cx - R * 0.62, cy + R * 0.2, 46 * u, 1.9, 4.3, false); ctx.stroke();
    const cr = R * 0.6;
    ctx.fillStyle = T.cup; ctx.shadowColor = `rgba(${T.shadow},0.35)`; ctx.shadowBlur = 12 * u; ctx.beginPath(); ctx.arc(cx, cy, cr, 0, TAU); ctx.fill(); ctx.shadowColor = "transparent";
    ctx.strokeStyle = T.cupShade; ctx.lineWidth = 3 * u; ctx.stroke();
    const cg = ctx.createRadialGradient(cx - cr * 0.2, cy - cr * 0.2, 4 * u, cx, cy, cr * 0.86);
    cg.addColorStop(0, T.coffeeLite); cg.addColorStop(1, T.coffee);
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, cr * 0.86, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.9);
    ctx.strokeStyle = "rgba(255,226,180,0.4)"; ctx.lineWidth = 6 * u; ctx.lineCap = "round"; ctx.beginPath();
    for (let i = 0; i <= 60; i++) { const a = (i / 60) * TAU * 1.5, r = (i / 60) * cr * 0.7; if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.moveTo(0, 0); }
    ctx.stroke(); ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.beginPath(); ctx.ellipse(cx - cr * 0.34, cy - cr * 0.42, cr * 0.2, cr * 0.08, -0.6, 0, TAU); ctx.fill();
    ctx.restore();
    // Steam drifting off the cup toward the middle of the napkin.
    ctx.save(); ctx.filter = `blur(${7 * u}px)`; ctx.lineCap = "round";
    for (let k = 0; k < 4; k++) {
      const ph = (t * 0.2 + k / 4) % 1, al = Math.sin(ph * PI) * 0.4;
      ctx.strokeStyle = `rgba(${T.steam},${al})`; ctx.lineWidth = (20 + ph * 22) * u; ctx.beginPath();
      for (let i = 0; i <= 14; i++) { const s = i / 14, x = cx - 40 * u - (ph * 230 + s * 170) * u + Math.sin(s * 5 + k * 2 + t) * 30 * u, y = cy + 34 * u + (ph * 120 + s * 90) * u + Math.cos(s * 4 + k + t * 0.8) * 20 * u; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke();
    }
    ctx.restore();
  }

  // The marker itself, held from the upper right. Down on the paper its nib sits on the stroke; lifted, it
  // floats a little higher with a softer, wider shadow. The barrel's bands and cap carry its ink colour.
  function drawPen(ctx, F, st) {
    const { u, t, T } = F;
    const lift = clamp(st.lift);
    const x = st.x + hsh(1, 1, F.boil) * 0.6 * u * (1 - lift), y = st.y + hsh(2, 2, F.boil) * 0.6 * u * (1 - lift), col = st.col;
    const ang = -0.62 + Math.sin(t * 0.7) * 0.012 + lift * 0.05;
    ctx.save();
    ctx.translate(x + lift * 16 * u, y - lift * 30 * u);
    ctx.rotate(ang);
    const L = 430 * u, wd = 54 * u;
    ctx.save(); ctx.globalAlpha = 0.28 - lift * 0.1; ctx.filter = `blur(${(9 + lift * 10) * u}px)`; ctx.fillStyle = `rgb(${T.shadow})`;
    ctx.translate((20 + lift * 16) * u, (26 + lift * 26) * u);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(80 * u, -wd * 0.34); ctx.lineTo(L, -wd * 0.5); ctx.lineTo(L, wd * 0.5); ctx.lineTo(80 * u, wd * 0.34); ctx.closePath(); ctx.fill();
    ctx.restore();
    const body = ctx.createLinearGradient(0, -wd / 2, 0, wd / 2);
    body.addColorStop(0, T.penShade); body.addColorStop(0.25, T.pen); body.addColorStop(0.55, "#ffffff"); body.addColorStop(1, T.penShade);
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.moveTo(86 * u, -wd * 0.36); ctx.lineTo(L - 18 * u, -wd / 2); ctx.arcTo(L, -wd / 2, L, 0, 18 * u); ctx.arcTo(L, wd / 2, L - 18 * u, wd / 2, 18 * u); ctx.lineTo(86 * u, wd * 0.36); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.22)"; ctx.lineWidth = 2 * u; ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(40 * u, -wd * 0.3); ctx.lineTo(86 * u, -wd * 0.36); ctx.lineTo(86 * u, wd * 0.36); ctx.lineTo(40 * u, wd * 0.3); ctx.closePath(); ctx.fill();
    ctx.fillRect(190 * u, -wd * 0.5, 100 * u, wd);
    ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.fillRect(204 * u, -wd * 0.5, 12 * u, wd); ctx.fillRect(264 * u, -wd * 0.5, 12 * u, wd);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(L - 60 * u, -wd / 2); ctx.lineTo(L - 18 * u, -wd / 2); ctx.arcTo(L, -wd / 2, L, 0, 18 * u); ctx.arcTo(L, wd / 2, L - 18 * u, wd / 2, 18 * u); ctx.lineTo(L - 60 * u, wd / 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#26242a";
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(40 * u, -wd * 0.3); ctx.lineTo(40 * u, wd * 0.3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(16 * u, -wd * 0.12); ctx.lineTo(16 * u, wd * 0.12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.fillRect(100 * u, -wd * 0.3, L - 190 * u, wd * 0.1);
    ctx.restore();
  }
  // Where the pen is this frame: on the active stroke, travelling lifted between strokes (via the frame's
  // edge when it swaps colour), or hovering at rest once the scene is drawn.
  function penState(F) {
    const s = F.sq, u = F.u;
    const hover = { x: F.rest.x + Math.sin(F.t * 0.9) * 26 * u, y: F.rest.y + Math.cos(F.t * 1.3) * 12 * u };
    const tray = { x: F.W + 140 * u, y: F.H * 0.66 };
    if (F.tip) return { x: F.tip.x, y: F.tip.y, col: F.tip.col, lift: 0 };
    if (!s) return { ...hover, col: F.ink, lift: 1 };
    if (s.gap) {
      const G = s.gap, a = G.end || (G.first ? hover : null) || hover, b = G.start || a, k = clamp(G.frac);
      if (G.from !== G.to) {
        if (k < 0.5) { const e = inout(k * 2); return { x: lerp(a.x, tray.x, e), y: lerp(a.y, tray.y, e), col: G.from, lift: 1 }; }
        const e = inout(k * 2 - 1); return { x: lerp(tray.x, b.x, e), y: lerp(tray.y, b.y, e), col: G.to, lift: 1 - span(k, 0.85, 1) };
      }
      const e = inout(k);
      return { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e), col: G.to, lift: Math.sin(PI * k) * 0.9 };
    }
    const e = s.endPt || hover;
    if (s.local >= s.cur) { const k = inout((s.local - s.cur) / 0.35); return { x: lerp(e.x, hover.x, k), y: lerp(e.y, hover.y, k), col: s.col, lift: k }; }
    return { x: e.x, y: e.y, col: s.col, lift: 0.4 };
  }

  // ---- layout helpers -------------------------------------------------------------------------------
  function controls() {
    if (window.__dreamcut && window.__dreamcut.controls) return window.__dreamcut.controls;
    try { if (typeof dc !== "undefined" && dc && dc.controls) return dc.controls; } catch (e) { /* not on this page */ }
    return null;
  }
  let planCache = null, planKey = "";
  function planOf(F) {
    const c = controls();
    if (!c) return null;
    const key = `${F.W}x${F.H}`;
    if (planCache && planKey === key) return planCache;
    let t = 0;
    const shown = [];
    for (const id of ORDER) { const hold = Number(c[`${id}_hold`]) || 0; if (hold > 0) shown.push({ id, start: t, hold }); t += hold; }
    if (!shown.length) return null;
    const data = {
      chart: { labels: [c.bar_1_label, c.bar_2_label, c.bar_3_label, c.bar_4_label], values: [c.bar_1, c.bar_2, c.bar_3, c.bar_4], suffix: c.chart_suffix, prefix: "", highlight: Number(c.highlight) - 1 },
      object: { kind: c.device, callouts: [c.callout_1, c.callout_2, c.callout_3] },
      people: { count: c.people_count, badges: [c.badge_1, c.badge_2, c.badge_3], highlight: 1 },
      process: { steps: [c.step_1, c.step_2, c.step_3] },
      compare: { left: c.before_label, leftValue: c.before_value, right: c.after_label, rightValue: c.after_value, suffix: c.compare_suffix, prefix: "" },
    };
    planKey = key;
    return (planCache = { shown, data, change: Number(c.change) || 0.45, length: t });
  }
  // Headline glyph positions, read once from the template's own (hidden) headline so the hand-lettered
  // copy lands exactly where the layout put it.
  const headCache = {};
  function headGlyphs(id) {
    const root = document.getElementById("root"), el = document.getElementById(id);
    const key = id + (root ? root.dataset.width + "x" + root.dataset.height : "");
    if (headCache[key]) return headCache[key];
    if (!el || !root || !el.firstChild || el.firstChild.nodeType !== 3) return null;
    const node = el.firstChild, text = node.textContent || "";
    if (!text.trim()) return null;
    const saved = el.style.transform;
    el.style.transform = "none";
    let ox = 0, oy = 0;
    for (let n = el; n && n !== root; n = n.offsetParent) { ox += n.offsetLeft; oy += n.offsetTop; }
    const er = el.getBoundingClientRect(), sc = er.width / (el.offsetWidth || 1) || 1, range = document.createRange();
    const glyphs = [];
    for (let i = 0; i < text.length; i++) {
      range.setStart(node, i); range.setEnd(node, i + 1);
      const r = range.getBoundingClientRect();
      glyphs.push({ ch: text[i], x: ox + (r.left - er.left) / sc, y: oy + (r.top - er.top + r.height / 2) / sc, w: r.width / sc, h: r.height / sc, top: oy + (r.top - er.top) / sc });
    }
    el.style.transform = saved;
    const size = parseFloat(getComputedStyle(el).fontSize) || 72;
    const lines = [];
    for (const G of glyphs) {
      if (G.w <= 0.5 || G.ch === " ") continue;
      let L = lines.find((l) => Math.abs(l.cy - G.y) < size * 0.4);
      if (!L) { L = { cy: G.y, x: G.x, y: G.top, r: G.x + G.w, b: G.top + G.h }; lines.push(L); }
      L.x = Math.min(L.x, G.x); L.r = Math.max(L.r, G.x + G.w); L.y = Math.min(L.y, G.top); L.b = Math.max(L.b, G.top + G.h);
    }
    lines.sort((a, b) => a.cy - b.cy);
    // Spaces that wrap to a line end can measure off-line; drop them from the written sequence.
    const out = glyphs.filter((G, i) => G.ch !== " " || (i > 0 && i < glyphs.length - 1 && Math.abs(glyphs[i - 1].y - glyphs[i + 1].y) < size * 0.4));
    return (headCache[key] = { text, glyphs: out, size, lines: lines.map((l) => ({ x: l.x, y: l.y, w: l.r - l.x, h: l.b - l.y })) });
  }
  function textBlock(F, id) {
    const hg = headGlyphs(HEADS[id]), ls = hg ? hg.lines : [];
    if (!ls.length) return { x: F.W * 0.1, y: F.H * 0.4, w: F.W * 0.8, h: F.H * 0.2, right: F.W * 0.9, bottom: F.H * 0.6, last: null, lines: [] };
    const x = Math.min(...ls.map((l) => l.x)), y = Math.min(...ls.map((l) => l.y)), right = Math.max(...ls.map((l) => l.x + l.w)), bottom = Math.max(...ls.map((l) => l.y + l.h));
    return { x, y, w: right - x, h: bottom - y, right, bottom, last: ls[ls.length - 1], lines: ls };
  }
  // The headline, written by the pen.
  function headline(F, id) {
    const hg = headGlyphs(HEADS[id]);
    if (!hg) return;
    const q = step(F, textDur(hg.text) * 0.9, F.ink, true);
    if (F.S.paint) letters(F, hg.glyphs, hg.size, q, { col: F.ink, seed: 11 + id.length * 7 });
  }
  // Free paper beside or beneath a headline.
  function zoneOf(F, id) {
    const { u, W } = F, tb = textBlock(F, id), b = F.box;
    const cupX = W - 340 * u;
    const rightX = tb.right + 80 * u, rightW = cupX - rightX;
    if (!F.tall && rightW > 260 * u) return { x: rightX, y: 60 * u, w: rightW, h: Math.max(110 * u, Math.min(b.y - 70 * u, tb.bottom + 40 * u) - 60 * u) };
    const y0 = tb.bottom + 24 * u, h = b.y - y0 - 6 * u;
    if (h > 90 * u) return { x: b.x + b.w * 0.55, y: y0, w: b.w * 0.45, h };
    return null;
  }
  // Marker underline beneath a headline's last line.
  function headMarks(F, id, q, o = {}) {
    const tb = textBlock(F, id), L = tb.last;
    if (!L) return;
    const { u } = F, y = L.y + L.h * 0.97 + 4 * u;
    squiggle(F, L.x, L.x + Math.min(L.w * 0.86, 900 * u), y, 4 * u, span(q, 0, o.double ? 0.6 : 1), { col: F.acc, w: 5.2, seed: 90 });
    if (o.double) squiggle(F, L.x + 24 * u, L.x + Math.min(L.w * 0.62, 700 * u), y + 15 * u, 3 * u, span(q, 0.6, 1), { col: F.acc, w: 3.8, seed: 91 });
  }

  // ---- supporting sketches ---------------------------------------------------------------------------
  function gauge(F, cx, cy, r, q, t, o = {}) { // a dial whose needle keeps nudging once drawn
    const P = new Pth().M(cx - r * 1.15, cy).L(cx + r * 1.15, cy).A(cx, cy, r, PI, TAU, true);
    for (let i = 0; i <= 6; i++) { const a = PI + (i / 6) * PI; P.M(cx + Math.cos(a) * r * 0.76, cy + Math.sin(a) * r * 0.76).L(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92); }
    ink(F, P, span(q, 0, 0.75), { col: o.col, w: 4.2, seed: o.seed });
    const a = PI * 1.2 + PI * 0.62 * (0.5 + 0.5 * Math.sin(t * 1.4)) ;
    ink(F, new Pth().O(cx, cy, r * 0.09).M(cx, cy).L(cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72), span(q, 0.75, 1), { col: o.col, w: 5, seed: (o.seed || 1) + 1 });
  }
  function magnifier(F, cx, cy, r, q, t, o = {}) { // a lens that drifts over the page
    const x = cx + Math.sin(t * 0.8) * r * 0.25, y = cy + Math.cos(t * 1.1) * r * 0.12;
    const P = new Pth().O(x, y, r).M(x + r * 0.72, y + r * 0.72).L(x + r * 1.55, y + r * 1.55).M(x + r * 0.95, y + r * 0.82).L(x + r * 1.65, y + r * 1.48);
    ink(F, P, span(q, 0, 0.8), { col: o.col, w: 4.6, seed: o.seed });
    ink(F, new Pth().A(x, y, r * 0.66, PI * 1.1, PI * 1.5, true), span(q, 0.8, 1), { col: o.col, w: 3.6, seed: (o.seed || 1) + 1 });
  }
  function bubble(F, x, y, w, h, flip, q, t, o = {}) { // a speech bubble whose dots keep pulsing
    const P = new Pth().RR(x, y, w, h, h * 0.45);
    const tx = flip ? x + w * 0.72 : x + w * 0.28;
    P.M(tx - 12 * F.u, y + h - 2 * F.u).L(tx + (flip ? 18 : -18) * F.u, y + h + 26 * F.u).L(tx + 12 * F.u, y + h - 2 * F.u);
    ink(F, P, q, { col: o.col, w: 4.2, seed: o.seed });
    if (q >= 1) for (let i = 0; i < 3; i++) dot(F, x + w * (0.3 + i * 0.2), y + h * 0.5 - Math.max(0, Math.sin(t * 5 - i * 0.9)) * 6 * F.u, 6.5 * F.u, o.col || F.ink);
  }
  function agent(F, cx, cy, s, q, t, o = {}) { // an original helper: a box-headed bot with a pencil
    const bob = Math.sin(t * 2.1) * 3 * F.u, k = s / 100;
    const Pn = () => new Pth(cx, cy + bob, k);
    ink(F, Pn().RR(-34, -40, 68, 54, 16).M(0, -40).L(0, -54).O(0, -61, 7), span(q, 0, 0.4), { col: o.col, w: 4.6, seed: o.seed });
    const blink = (t * 0.7) % 3.4 > 3.25, e = Pn();
    if (blink) e.M(-18, -16).L(-8, -16).M(8, -16).L(18, -16); else e.O(-13, -16, 4).O(13, -16, 4);
    e.M(-11, -1).Q(0, 7, 11, -1);
    ink(F, e, span(q, 0.4, 0.6), { col: o.col, w: 4.4, seed: (o.seed || 1) + 1 });
    const w = Math.sin(t * 9) * 0.18, hx = 50, hy = 14;
    const arm = Pn().RR(-26, 20, 52, 38, 10).M(-26, 32).Q(-40, 36, -38, 50).M(26, 30).Q(42, 32, hx, hy);
    ink(F, arm, span(q, 0.6, 0.85), { col: o.col, w: 4.4, seed: (o.seed || 1) + 2 });
    const px = cx + hx * k, py = cy + bob + hy * k, a = -2.3 + w;
    const pen = new Pth().M(px, py).L(px + Math.cos(a) * 40 * k, py + Math.sin(a) * 40 * k).M(px + Math.cos(a + 0.3) * 6 * k, py + Math.sin(a + 0.3) * 6 * k).L(px + Math.cos(a) * 46 * k + Math.cos(a + 1.57) * 5 * k, py + Math.sin(a) * 46 * k + Math.sin(a + 1.57) * 5 * k);
    ink(F, pen, span(q, 0.85, 1), { col: o.col, w: 4.4, seed: (o.seed || 1) + 3 });
    if (q >= 1) dot(F, cx, cy + bob - 61 * k, (3 + 2 * Math.max(0, Math.sin(t * 4))) * F.u, o.acc || F.acc);
  }
  function draftCard(F, x, y, w, h, q, t, o = {}) { // a proposal card with lines of draft
    ink(F, new Pth().RR(x, y, w, h, 12 * F.u), span(q, 0, 0.45), { col: o.col, w: 4.4, seed: o.seed });
    for (let k = 0; k < 3; k++) {
      const P = new Pth(), lw = w * (0.72 - k * 0.16), ly = y + h * (0.3 + k * 0.22), n = Math.max(4, Math.round(lw / (13 * F.u)));
      P.M(x + w * 0.14, ly);
      for (let i = 1; i <= n; i++) P.L(x + w * 0.14 + (lw * i) / n, ly + (i % 2 ? -1 : 1) * (3 + 3 * hsh(i, k, 4)) * F.u);
      ink(F, P, span(q, 0.45 + k * 0.18, 0.63 + k * 0.18), { col: o.col, w: 3, alpha: 0.8, seed: (o.seed || 1) + 1 + k, amp: 0.5 });
    }
  }

  // ---- scenes ---------------------------------------------------------------------------------------
  const DRAW = {};
  const num = (v, d) => M.formatNumber(Number(v) || 0, Math.abs((Number(v) || 0) % 1) > 0.001 ? 1 : 0, (d && d.prefix) || "", (d && d.suffix) || "");

  // Chart: hand-ruled axes, bars outlined and labelled in navy, then filled in blue, a marching trend arrow,
  // and finally the key bar coloured and its figure circled in red. A dial by the headline keeps ticking.
  DRAW.chart = (F, b, d) => {
    const { u, t } = F;
    const vals = (d.values || []).map((v) => Math.max(0, Number(v) || 0)), n = Math.max(1, vals.length), max = Math.max(...vals, 1);
    const hi = d.highlight >= 0 && d.highlight < n ? d.highlight : -1;
    const ax = b.x + 100 * u, base = b.y + b.h - 72 * u, top = b.y + 12 * u, right = b.x + b.w - 20 * u;
    const slot = (right - ax - 40 * u) / n, bw = Math.min(slot * 0.5, 210 * u), Hh = base - top - 150 * u;
    const qa = step(F, 0.3);
    ink(F, new Pth().M(ax, base + 8 * u).L(ax, top).M(ax - 16 * u, top + 30 * u).L(ax, top).L(ax + 16 * u, top + 30 * u), span(qa, 0, 0.45), { w: 5, seed: 1 });
    ink(F, new Pth().M(ax - 10 * u, base).L(right, base).M(right - 30 * u, base - 16 * u).L(right, base).L(right - 30 * u, base + 16 * u), span(qa, 0.45, 1), { w: 5, seed: 2 });
    const G = new Pth();
    for (let k = 1; k <= 4; k++) { const y = base - (Hh * k) / 4; G.M(ax - 12 * u, y).L(right, y); }
    ink(F, G, step(F, 0.22), { w: 2.6, alpha: 0.32, dash: [16, 14], seed: 60 });
    const bars = vals.map((v, i) => {
      const cx = ax + 30 * u + slot * (i + 0.5), x = cx - bw / 2, h = Math.max(34 * u, (v / max) * Hh), ty = base - h, isHot = i === hi;
      const wob = (k) => hsh(i, k, 3) * 4 * u;
      const poly = [[x, base], [x + wob(1), ty], [x + bw, ty + wob(2)], [x + bw + wob(3), base]];
      const size = (isHot ? 104 : 66) * u;
      return { i, cx, x, ty, poly, isHot, size, vy: ty - 24 * u, n: num(v, d), bar: new Pth().M(x, base).L(x + wob(1), ty).L(x + bw, ty + wob(2)).L(x + bw + wob(3), base) };
    });
    for (const B of bars) {
      ink(F, B.bar, step(F, 0.14), { w: 5.4, seed: 110 + B.i });
      write(F, d.labels[B.i] || "", B.cx, base + 66 * u, 46 * u, { align: "center", maxW: slot * 0.96, min: 42 * u, seed: 120 + B.i });
      if (!B.isHot) write(F, B.n, B.cx, B.vy, B.size, { align: "center", seed: 125 + B.i });
    }
    const z = zoneOf(F, "chart");
    if (z) { const r = Math.min(z.h * 0.55, 64 * u); gauge(F, z.x + r * 1.4, z.y + z.h * 0.5 + r * 0.45, r, step(F, 0.3), t, { seed: 150 }); }
    for (const B of bars) if (!B.isHot) scrib(F, B.poly, step(F, 0.16, F.blue), { col: F.blue, step: 12, w: 4.2, alpha: 0.55, ang: -0.8 + B.i * 0.16, seed: 100 + B.i });
    const tops = bars.map((B, i) => [B.cx, Math.max(top + 24 * u, B.vy - B.size - 30 * u) - Math.sin(i * 1.2) * 6 * u]);
    if (tops.length > 1) {
      const T1 = through(tops), e = tops[tops.length - 1], a0 = tops[tops.length - 2], ang = Math.atan2(e[1] - a0[1], e[0] - a0[0]), hs = 28 * u;
      T1.M(e[0] - Math.cos(ang - 0.5) * hs, e[1] - Math.sin(ang - 0.5) * hs).L(e[0], e[1]).L(e[0] - Math.cos(ang + 0.5) * hs, e[1] - Math.sin(ang + 0.5) * hs);
      const rq = step(F, 0.32, F.blue);
      ink(F, T1, rq, { col: F.blue, w: 4.6, dash: [18, 13], flow: -t * 34, seed: 130 });
      if (rq >= 1) { const pt = through(tops).at((t * 0.2) % 1); dot(F, pt.x, pt.y, 9 * u, F.blue); }
    }
    const H0 = bars.find((B) => B.isHot);
    if (H0) {
      scrib(F, H0.poly, step(F, 0.24, F.acc), { col: F.acc, step: 7, w: 6, alpha: 0.82, ang: -0.6, seed: 105 });
      const tw = say(F, H0.n, H0.cx, H0.vy, H0.size, { align: "center", col: F.acc, q: step(F, textDur(H0.n) + 0.06, F.acc), seed: 128 });
      const ql = step(F, 0.26, F.acc);
      loop(F, H0.cx, H0.vy - H0.size * 0.36, tw / 2 + 40 * u, H0.size * 0.62, ql, { col: F.acc, w: 5, seed: 140 });
      if (ql >= 1) rays(F, H0.cx, H0.vy - H0.size * 0.36, tw / 2 + 52 * u, tw / 2 + 92 * u, 9, 1, t, { col: F.acc, w: 4, seed: 141 });
    }
    headMarks(F, "chart", step(F, 0.2, F.acc));
  };

  // Object: a laptop (or phone) sketched in navy with a tiny edit on screen and numbered callouts; the clips
  // are coloured in blue, then the proposed clip and the running playhead in red.
  DRAW.object = (F, b, d) => {
    const { u, t, tall } = F, phone = d.kind === "phone";
    const lw = phone ? Math.min(b.w * (tall ? 0.46 : 0.24), b.h * (tall ? 0.34 : 0.5)) : tall ? Math.min(b.w * 0.92, b.h * 0.48 / 0.68) : Math.min(b.w * 0.56, b.h * 1.28);
    const lh = phone ? lw * 1.95 : lw * 0.62;
    const x = phone ? (tall ? b.x + b.w * 0.5 - lw / 2 : b.x + b.w * 0.12) : tall ? b.x + (b.w - lw) / 2 : b.x + 30 * u;
    const y = tall ? b.y + 30 * u : b.y + (b.h - lh - (phone ? 0 : lw * 0.08)) / 2;
    const pad = (phone ? 18 : 24) * u, sx = x + pad, sy = y + pad, sw = lw - pad * 2, sh = lh - pad * 2;
    ink(F, new Pth().RR(x, y, lw, lh, (phone ? 40 : 18) * u), step(F, 0.26), { w: 5.4, seed: 201 });
    ink(F, new Pth().RR(sx, sy, sw, sh, 8 * u), step(F, 0.16), { w: 3.6, seed: 202, alpha: 0.85 });
    if (phone) ink(F, new Pth().M(x + lw * 0.4, y + pad * 0.5).L(x + lw * 0.6, y + pad * 0.5), step(F, 0.06), { w: 4, seed: 203 });
    else ink(F, new Pth().M(x, y + lh).L(x - lw * 0.07, y + lh + lh * 0.06).L(x + lw * 1.07, y + lh + lh * 0.06).L(x + lw, y + lh).M(x + lw * 0.42, y + lh + lh * 0.005).L(x + lw * 0.58, y + lh + lh * 0.005), step(F, 0.16), { w: 5, seed: 204 });
    const pv = { x: sx + sw * 0.07, y: sy + sh * 0.08, w: sw * 0.86, h: sh * 0.44 };
    ink(F, new Pth().RR(pv.x, pv.y, pv.w, pv.h, 6 * u), step(F, 0.14), { w: 4.2, seed: 206 });
    const sunX = pv.x + pv.w * 0.74, sunY = pv.y + pv.h * 0.32;
    sun(F, sunX, sunY, Math.min(pv.h, pv.w) * 0.1, step(F, 0.14), t, { seed: 207 });
    const hills = through([[pv.x + 6 * u, pv.y + pv.h - 6 * u], [pv.x + pv.w * 0.25, pv.y + pv.h * 0.55], [pv.x + pv.w * 0.5, pv.y + pv.h - 6 * u], [pv.x + pv.w * 0.72, pv.y + pv.h * 0.42], [pv.x + pv.w - 6 * u, pv.y + pv.h - 6 * u]]);
    ink(F, hills, step(F, 0.14), { w: 4, seed: 208 });
    cloud(F, pv.x + pv.w * (0.22 + 0.2 * ((Math.sin(t * 0.5) + 1) / 2)), pv.y + pv.h * 0.26, pv.w * 0.18, step(F, 0.1), { w: 3.2, seed: 210 });
    const tx0 = sx + sw * 0.07, tw = sw * 0.86, th = sh * 0.08, clips = [];
    const lay = [[[0, 0.34], [0.38, 0.28], [0.7, 0.3]], [[0.08, 0.26], [0.36, 0.4], [0.8, 0.2]], [[0, 0.18], [0.22, 0.3], [0.58, 0.42]]];
    lay.forEach((row, k) => row.forEach(([c0, cw], i) => { const ty = sy + sh * (0.6 + k * 0.125), rx = tx0 + tw * c0, rw = tw * cw * 0.96; clips.push({ k, i, rx, ty, rw, hot: k === 1 && i === 1 }); }));
    const qc = step(F, 0.36);
    clips.forEach((C, j) => ink(F, new Pth().RR(C.rx, C.ty, C.rw, th, 4 * u), span(qc, j / clips.length, (j + 1) / clips.length), { w: 3.2, seed: 230 + j }));
    const hotC = clips.find((C) => C.hot);
    const anchors = [[pv.x + pv.w * 0.8, pv.y + pv.h * 0.7], [hotC.rx + hotC.rw * 0.5, hotC.ty + th * 0.5], [clips[6].rx + clips[6].rw * 0.3, clips[6].ty + th * 0.5]];
    const labels = d.callouts || [];
    const spots = [];
    labels.forEach((label, i) => {
      const lx = tall ? b.x + 110 * u : x + lw + 150 * u, ly = tall ? y + lh + 150 * u + i * 150 * u : b.y + b.h * (0.19 + i * 0.3);
      const [ax, ay] = anchors[i];
      const qa = step(F, 0.16);
      arrowTo(F, tall ? lx + 24 * u : lx - 18 * u, tall ? ly - 40 * u : ly - 8 * u, ax, ay, (tall ? 40 : -50 + i * 30) * u, qa, { w: 3.8, head: 0.01, seed: 250 + i });
      if (qa >= 1) dot(F, ax, ay, (7 + Math.sin(t * 4 + i) * 1.5) * u, F.ink);
      const qn = step(F, 0.12);
      ink(F, new Pth().O(lx + 24 * u, ly - 8 * u, 30 * u), span(qn, 0, 0.7), { w: 4.4, seed: 260 + i });
      say(F, String(i + 1), lx + 24 * u, ly + 6 * u, 42 * u, { align: "center", q: span(qn, 0.7, 1), seed: 265 + i });
      write(F, label, lx + 72 * u, ly + 6 * u, 48 * u, { maxW: b.x + b.w - (lx + 72 * u), min: 42 * u, seed: 270 + i });
      spots.push([lx + 24 * u, ly - 8 * u]);
    });
    const z = zoneOf(F, "object");
    if (z) { const r = Math.min(z.h * 0.3, 44 * u); magnifier(F, z.x + r * 1.6, z.y + z.h * 0.42, r, step(F, 0.24), t, { seed: 280 }); }
    const qf = step(F, 0.4, F.blue), cold = clips.filter((C) => !C.hot);
    cold.forEach((C, j) => scrib(F, [[C.rx, C.ty], [C.rx + C.rw, C.ty], [C.rx + C.rw, C.ty + th], [C.rx, C.ty + th]], span(qf, j / cold.length, (j + 1) / cold.length), { col: F.blue, step: 6, w: 3.4, alpha: 0.5, ang: 0.6, seed: 220 + j }));
    scrib(F, [[hotC.rx, hotC.ty], [hotC.rx + hotC.rw, hotC.ty], [hotC.rx + hotC.rw, hotC.ty + th], [hotC.rx, hotC.ty + th]], step(F, 0.16, F.acc), { col: F.acc, step: 6, w: 3.6, alpha: 0.88, ang: 0.6, seed: 229 });
    const qp = step(F, 0.14, F.acc), ph = tx0 + tw * (0.06 + 0.88 * ((t * 0.11) % 1));
    ink(F, new Pth().M(ph, sy + sh * 0.56).L(ph, sy + sh * 0.97), qp, { col: F.acc, w: 4, seed: 240 });
    if (qp >= 1) dot(F, ph, sy + sh * 0.56, 7 * u, F.acc);
    if (spots[1]) loop(F, spots[1][0], spots[1][1], 46 * u, 42 * u, step(F, 0.2, F.acc), { col: F.acc, w: 4.4, seed: 285 });
    headMarks(F, "object", step(F, 0.2, F.acc));
  };

  // People: a row of small marker characters outlined in navy, labelled, then coloured in; the highlighted
  // one is filled red and waves. Speech bubbles by the headline keep chattering.
  function person(F, cx, base, H0, i, hot, q, t) {
    const k = H0 / 100, u = F.u, bob = Math.sin(t * 2.2 + i * 1.4) * 1.6 * u;
    const Pn = () => new Pth(cx, base - Math.max(0, bob), k);
    ink(F, Pn().M(-8, -30).L(-9, -3).L(-17, -1).M(8, -30).L(9, -3).L(17, -1), span(q, 0, 0.2), { w: 4.6, seed: 300 + i });
    ink(F, Pn().M(-15, -61).Q(0, -67, 15, -61).L(23, -27).Q(0, -22, -23, -27).Z(), span(q, 0.2, 0.45), { w: 4.8, seed: 320 + i });
    const arms = Pn().M(-15, -58).Q(-29, -46, -25, -33);
    let hand = null;
    if (hot) {
      const a = -1.15 + 0.5 * Math.sin(t * 5.5), ex = 15 + Math.cos(a) * 16, ey = -58 + Math.sin(a) * 16, a2 = a - 0.55 + 0.35 * Math.sin(t * 5.5 + 1), hx = ex + Math.cos(a2) * 15, hy = ey + Math.sin(a2) * 15;
      arms.M(15, -58).L(ex, ey).L(hx, hy); hand = [hx, hy];
    } else arms.M(15, -58).Q(29, -46, 25, -33);
    ink(F, arms, span(q, 0.45, 0.6), { w: 4.6, seed: 330 + i });
    if (hand) ink(F, Pn().O(hand[0], hand[1], 3.4), span(q, 0.6, 0.62), { w: 4, seed: 335 });
    ink(F, Pn().O(0, -78, 15), span(q, 0.62, 0.78), { w: 4.8, seed: 340 + i });
    const blink = (t * 0.9 + i * 1.3) % 4 > 3.85, eyes = Pn();
    if (blink) eyes.M(-8, -80).L(-3, -80).M(3, -80).L(8, -80); else eyes.O(-5.5, -80, 1.1).O(5.5, -80, 1.1);
    eyes.M(-5, -72).Q(0, hot ? -66 : -69, 5, -72);
    ink(F, eyes, span(q, 0.78, 0.88), { w: 4.6, seed: 350 + i });
    const hair = Pn(), v = i % 6;
    if (v === 0) hair.M(-14, -86).L(-10, -99).L(-5, -91).L(0, -102).L(5, -91).L(10, -99).L(14, -86);
    else if (v === 1) hair.O(0, -97, 7.5).M(-15, -81).Q(-4, -97, 15, -83);
    else if (v === 2) hair.A(-10, -91, 6, PI, TAU, true).A(0, -94, 6.5, PI, TAU, true).A(10, -91, 6, PI, TAU, true);
    else if (v === 3) hair.A(0, -82, 16, PI, TAU, true).Z().M(-16, -82).L(26, -82).Q(26, -87, 14, -88);
    else if (v === 4) hair.M(-16, -74).Q(-19, -98, 0, -96).Q(19, -98, 16, -74);
    else hair.O(-6.5, -79, 5.5).O(6.5, -79, 5.5).M(-1, -79).L(1, -79);
    ink(F, hair, span(q, 0.88, 1), { w: 4.4, seed: 370 + i });
    return { top: base - 108 * k, tunic: Pn().M(-15, -61).Q(0, -67, 15, -61).L(23, -27).Q(0, -22, -23, -27).Z() };
  }
  DRAW.people = (F, b, d) => {
    const { u, t, tall } = F;
    const n = Math.max(2, Math.min(6, Math.round(Number(d.count) || 4))), two = tall && n > 3, cols = two ? Math.ceil(n / 2) : n, rows = two ? 2 : 1;
    const sw = b.w / cols, rh = b.h / rows, H0 = Math.min(rh * (two ? 0.54 : 0.53), sw * 1.25);
    const hot = Math.min(n - 1, d.highlight || 1);
    const qg = step(F, 0.26);
    for (let row = 0; row < rows; row++) {
      const base = b.y + rh * row + rh * 0.9, x0 = b.x, x1 = b.x + b.w, Gp = through([[x0, base], [lerp(x0, x1, 0.3), base - 3 * u], [lerp(x0, x1, 0.65), base + 2 * u], [x1, base - 2 * u]]);
      for (let g2 = 0; g2 < 9; g2++) {
        const gx = x0 + ((g2 + 0.5) / 9) * (x1 - x0) + hsh(g2, row, 1) * 18 * u, sway = Math.sin(t * 2 + g2 * 1.3) * 5 * u;
        Gp.M(gx - 8 * u, base).L(gx - 11 * u + sway, base - 24 * u).M(gx, base).L(gx + sway, base - 30 * u).M(gx + 8 * u, base).L(gx + 11 * u + sway, base - 22 * u);
      }
      ink(F, Gp, span(qg, row / rows, (row + 1) / rows), { w: 4.4, seed: 390 + row });
    }
    const ppl = [];
    for (let i = 0; i < n; i++) {
      const row = two ? (i < cols ? 0 : 1) : 0, ci = two ? (i < cols ? i : i - cols) : i;
      const rowCols = two ? (row === 0 ? cols : n - cols) : n, offset = two && row === 1 ? (cols - rowCols) * sw * 0.5 : 0;
      const cx = b.x + offset + sw * (ci + 0.5), base = b.y + rh * row + rh * 0.9, isHot = i === hot;
      const info = person(F, cx, base, H0 * (isHot ? 1.07 : 1), i, isHot, step(F, 0.3), t);
      const label = d.badges[i % d.badges.length];
      let badge = null;
      if (label) {
        const size = 46 * u, bwid = measure(F, label, size) + 46 * u, bh = 70 * u, raise = n >= 4 && !two ? (i % 2) * 78 * u : 0;
        const bx = clamp(cx - bwid / 2, b.x - 30 * u, b.x + b.w - bwid + 30 * u), by = info.top - 54 * u - bh - raise;
        ink(F, new Pth().RR(bx, by, bwid, bh, 24 * u).M(cx - 14 * u, by + bh).L(cx, by + bh + 26 * u).L(cx + 14 * u, by + bh), step(F, 0.14), { w: 4.4, seed: 410 + i });
        write(F, label, bx + bwid / 2, by + bh / 2 + size * 0.34, size, { align: "center", seed: 420 + i });
        badge = { x: bx + bwid / 2, y: by + bh / 2, w: bwid, h: bh };
      }
      ppl.push({ i, cx, base, isHot, info, badge });
    }
    const z = zoneOf(F, "people");
    if (z) {
      const bwd = Math.min(z.w * 0.36, 150 * u), bht = Math.min(z.h * 0.42, 66 * u), qb = step(F, 0.3);
      bubble(F, z.x + 10 * u, z.y + z.h * 0.18, bwd, bht, false, span(qb, 0, 0.5), t, { seed: 440 });
      bubble(F, z.x + bwd * 1.25, z.y + z.h * 0.18 + bht * 0.9, bwd * 0.9, bht, true, span(qb, 0.5, 1), t, { seed: 441 });
    }
    for (const P of ppl) if (!P.isHot) scrib(F, P.info.tunic, step(F, 0.14, F.blue), { col: F.blue, step: 9, w: 4, alpha: 0.6, ang: -0.9 + P.i * 0.35, seed: 310 + P.i });
    const Hp = ppl.find((P) => P.isHot);
    if (Hp) {
      scrib(F, Hp.info.tunic, step(F, 0.16, F.acc), { col: F.acc, step: 6, w: 5, alpha: 0.9, ang: -0.6, seed: 316 });
      if (Hp.badge) loop(F, Hp.badge.x, Hp.badge.y, Hp.badge.w * 0.62, Hp.badge.h * 0.85, step(F, 0.22, F.acc), { col: F.acc, w: 4.4, seed: 430 });
      const qh = step(F, 0.16, F.acc), hs = 2.4 * u * (0.85 + 0.15 * Math.sin(t * 4));
      heart(F, Hp.cx + H0 * 0.56, Hp.base - H0 * (0.95 + 0.05 * Math.sin(t * 3)), hs, qh, { col: F.acc, fill: F.acc, w: 3.4, seed: 431 });
    }
    headMarks(F, "people", step(F, 0.2, F.acc));
  };

  // Process: numbered step cards drawn in navy with their icons and labels; then red arrows join them,
  // the last card is shaded and ticked, and a token keeps riding the arrows. A road by the headline ends in a flag.
  function icon(F, kind, cx, cy, s, q, t, col) {
    if (kind === 0) { // a page with lines
      const w = s * 0.7, h = s * 0.9;
      ink(F, new Pth().M(cx - w / 2, cy - h / 2).L(cx + w * 0.15, cy - h / 2).L(cx + w / 2, cy - h * 0.2).L(cx + w / 2, cy + h / 2).L(cx - w / 2, cy + h / 2).Z().M(cx + w * 0.15, cy - h / 2).L(cx + w * 0.15, cy - h * 0.2).L(cx + w / 2, cy - h * 0.2), span(q, 0, 0.6), { col, w: 5, seed: 530 });
      const on = Math.floor(t * 1.4) % 3;
      for (let k = 0; k < 3; k++) ink(F, new Pth().M(cx - w * 0.3, cy - h * 0.02 + k * h * 0.2).L(cx + w * (k === 1 ? 0.2 : 0.3), cy - h * 0.02 + k * h * 0.2), span(q, 0.6 + k * 0.13, 0.73 + k * 0.13), { col, w: q >= 1 && k === on ? 7 : 4, seed: 531 + k });
    } else if (kind === 1) { // a pencil sketching a squiggle
      ink(F, new Pth(cx, cy, s / 100, -0.7).R(-40, -10, 70, 20).M(30, -10).L(52, 0).L(30, 10).M(-28, -10).L(-28, 10), span(q, 0, 0.6), { col, w: 4.6, seed: 536 });
      squiggle(F, cx - s * 0.42, cx + s * 0.1, cy + s * 0.42 + Math.sin(t * 3) * 2 * F.u, 6 * F.u, span(q, 0.6, 1), { col, w: 3.8, seed: 537 });
    } else if (kind === 2) { // an eye that looks around
      const w = s * 0.62;
      ink(F, new Pth().M(cx - w, cy).Q(cx, cy - s * 0.62, cx + w, cy).Q(cx, cy + s * 0.62, cx - w, cy), span(q, 0, 0.6), { col, w: 5, seed: 538 });
      const px = cx + Math.sin(t * 1.3) * s * 0.14, py = cy + Math.cos(t * 0.9) * s * 0.04;
      ink(F, new Pth().O(px, py, s * 0.2), span(q, 0.6, 1), { col, w: 5, seed: 539 });
    } else check(F, cx, cy, s * 0.46, q, t, { col, acc: col, seed: 540 });
  }
  DRAW.process = (F, b, d) => {
    const { u, t, tall } = F, n = d.steps.length;
    const gap = (tall ? 96 : 130) * u;
    const cw = tall ? b.w * 0.96 : (b.w - gap * (n - 1)) / n;
    const ch = tall ? (b.h * 0.9 - gap * (n - 1)) / n : Math.min(b.h * 0.72, cw * 1.0);
    const y0 = tall ? b.y : b.y + (b.h * 0.84 - ch) / 2;
    const cards = [];
    for (let i = 0; i < n; i++) {
      const x = tall ? b.x + (b.w - cw) / 2 : b.x + i * (cw + gap), y = tall ? y0 + i * (ch + gap) : y0, last = i === n - 1;
      cards.push({ x, y });
      ink(F, new Pth().RR(x, y, cw, ch, 30 * u), step(F, 0.2), { w: 5.2, seed: 500 + i });
      const qn = step(F, 0.1);
      ink(F, new Pth().O(x + 48 * u, y + 48 * u, 28 * u), span(qn, 0, 0.7), { w: 4.4, seed: 520 + i });
      say(F, String(i + 1), x + 48 * u, y + 62 * u, 42 * u, { align: "center", q: span(qn, 0.7, 1), seed: 525 + i });
      const sz = tall ? ch * 0.5 : ch * 0.36, icx = tall ? x + cw * 0.2 : x + cw / 2, icy = tall ? y + ch * 0.52 : y + ch * 0.46;
      cards[i].ic = [icx, icy, sz];
      if (!last) icon(F, i % 3, icx, icy, sz, step(F, 0.22), t, F.ink);
      const lx = tall ? x + cw * 0.38 : x + cw / 2, ly = tall ? y + ch * 0.58 : y + ch * 0.9;
      write(F, d.steps[i], lx, ly, 52 * u, { align: tall ? "left" : "center", maxW: tall ? cw * 0.58 : cw - 36 * u, min: 42 * u, seed: 545 + i });
    }
    let bar = null;
    if (!tall) {
      const bx = b.x, bwid = b.w, by = b.y + b.h - 54 * u, bh = 38 * u;
      const Pb = new Pth().RR(bx, by, bwid, bh, bh / 2);
      for (let i = 0; i < n; i++) Pb.M(cards[i].x + cw / 2, by - 8 * u).L(cards[i].x + cw / 2, by + bh + 8 * u);
      const qb = step(F, 0.22);
      ink(F, Pb, qb, { w: 4.6, seed: 560 });
      bar = { bx, bwid, by, bh, qb };
    }
    const z = zoneOf(F, "process");
    let flagAt = null;
    if (z) {
      const fx = z.x + Math.min(z.w * 0.7, 420 * u), cy = z.y + z.h * 0.62, pts = [];
      for (let i = 0; i <= 12; i++) pts.push([lerp(z.x + 10 * u, fx, i / 12), cy + Math.sin(i * 0.9) * z.h * 0.12]);
      const road = through(pts), fh = Math.min(z.h * 0.75, 90 * u), qr = step(F, 0.3);
      ink(F, road, span(qr, 0, 0.7), { w: 4, dash: [4, 16], flow: -t * 28, seed: 1300 });
      ink(F, new Pth().M(fx, cy).L(fx, cy - fh), span(qr, 0.7, 1), { w: 4.4, seed: 1301 });
      flagAt = [fx, cy, fh];
    }
    const arcs = [];
    for (let i = 0; i < n - 1; i++) {
      const A = cards[i], B = cards[i + 1];
      const x1 = tall ? A.x + cw / 2 : A.x + cw + 12 * u, y1 = tall ? A.y + ch + 10 * u : A.y + ch / 2, x2 = tall ? B.x + cw / 2 : B.x - 12 * u, y2 = tall ? B.y - 10 * u : B.y + ch / 2;
      const bend = (tall ? 30 : -34) * u * (i % 2 ? -1 : 1), mx = (x1 + x2) / 2, my = (y1 + y2) / 2, L = Math.hypot(x2 - x1, y2 - y1) || 1;
      arcs.push([x1, y1, mx + (-(y2 - y1) / L) * bend, my + ((x2 - x1) / L) * bend, x2, y2]);
      arrowTo(F, x1, y1, x2, y2, bend, step(F, 0.18, F.acc), { col: F.acc, w: 5, dash: [16, 11], flow: -t * 36, seed: 540 + i });
    }
    const L = cards[n - 1];
    scrib(F, new Pth().RR(L.x + 8 * u, L.y + 8 * u, cw - 16 * u, ch - 16 * u, 24 * u), step(F, 0.24, F.acc), { col: F.acc, step: 20, w: 3, alpha: 0.2, ang: 0.7, seed: 510 });
    const qk = step(F, 0.24, F.acc);
    icon(F, 3, L.ic[0], L.ic[1], L.ic[2], qk, t, F.acc);
    if (flagAt) {
      const [fx, cy, fh] = flagAt, s = fh, swv = Math.sin(t * 3.2) * s * 0.06;
      const P = new Pth().M(fx, cy - s).Q(fx + s * 0.4, cy - s - s * 0.12 + swv, fx + s * 0.7, cy - s * 0.86 + swv).Q(fx + s * 0.4, cy - s * 0.68 - swv, fx, cy - s * 0.62);
      const qf = step(F, 0.16, F.acc);
      ink(F, P, span(qf, 0, 0.5), { col: F.acc, w: 3.8, seed: 1302 });
      scrib(F, P, span(qf, 0.5, 1), { col: F.acc, step: 6, w: 3.6, alpha: 0.85, seed: 1303 });
    }
    if (qk >= 1 && arcs.length) {
      const tp = ((t * 0.28) % 1) * arcs.length, j = Math.min(arcs.length - 1, Math.floor(tp)), pt = bezPoint(...arcs[j], tp - j);
      dot(F, pt[0], pt[1], 12 * u, F.acc); ink(F, new Pth().O(pt[0], pt[1], 22 * u + Math.sin(t * 8) * 3 * u), 1, { col: F.acc, w: 3, seed: 550, quiet: true });
    }
    if (bar && bar.qb >= 1) { const frac = clamp(0.04 + ((t * 0.28) % 1) * 0.96); scrib(F, [[bar.bx + 4 * u, bar.by + 4 * u], [bar.bx + bar.bwid * frac, bar.by + 4 * u], [bar.bx + bar.bwid * frac, bar.by + bar.bh - 4 * u], [bar.bx + 4 * u, bar.by + bar.bh - 4 * u]], 1, { col: F.blue, step: 7, w: 3.6, alpha: 0.6, ang: 0.8, seed: 561, quiet: true }); }
    headMarks(F, "process", step(F, 0.2, F.acc));
  };

  // Compare: the left panel drawn in navy (a tangle and a frown), then the right panel in red (a tick and a
  // smile, its meter well ahead), joined by a marching arrow.
  DRAW.compare = (F, b, d) => {
    const { u, t, tall } = F;
    const gap = (tall ? 120 : 150) * u, pw = tall ? b.w : (b.w - gap) / 2, ph = tall ? (b.h - gap) / 2 : b.h * 0.94;
    const maxV = Math.max(Number(d.leftValue) || 0, Number(d.rightValue) || 0, 1);
    const panels = [[d.left, Number(d.leftValue) || 0, F.ink], [d.right, Number(d.rightValue) || 0, F.acc]];
    panels.forEach(([label, value, col], i) => {
      const x = tall ? b.x : b.x + i * (pw + gap), y = tall ? b.y + i * (ph + gap) : b.y + (b.h - ph) / 2;
      if (i === 1) {
        const ax1 = tall ? b.x + b.w / 2 : b.x + pw + 22 * u, ay1 = tall ? b.y + ph + 14 * u : b.y + b.h / 2, ax2 = tall ? ax1 : b.x + pw + gap - 22 * u, ay2 = tall ? b.y + ph + gap - 14 * u : ay1;
        arrowTo(F, ax1, ay1, ax2, ay2, (tall ? 24 : -26) * u, step(F, 0.16, F.acc), { col: F.acc, w: 5.4, dash: [16, 11], flow: -t * 38, seed: 650 });
      }
      const qp = step(F, 0.22, col);
      ink(F, new Pth().RR(x, y, pw, ph, 34 * u), qp, { col, w: 5.4, seed: 600 + i });
      ink(F, new Pth().RR(x + 12 * u, y + 12 * u, pw - 24 * u, ph - 24 * u, 26 * u), qp, { col, w: 2.6, alpha: 0.35, seed: 602 + i, quiet: true });
      write(F, label, x + 38 * u, y + 82 * u, 54 * u, { col, maxW: pw * 0.6, min: 44 * u, seed: 605 + i });
      face(F, x + pw - 88 * u, y + 88 * u, 44 * u, step(F, 0.18, col), t, i ? 1 : -1, { col, seed: 615 + i, ph: i * 1.7 });
      const size = Math.min(180 * u, ph * 0.4), ny = y + ph * 0.64, s = num(value, d);
      write(F, s, x + 40 * u, ny, size, { col, seed: 620 + i });
      const mx = x + 38 * u, my = y + ph - 84 * u, mw = pw - 76 * u, mh = 38 * u, fr = clamp(value / maxV);
      ink(F, new Pth().RR(mx, my, mw, mh, mh / 2), step(F, 0.12, col), { col, w: 4.6, seed: 630 + i });
      if (fr > 0.01) scrib(F, [[mx + 4 * u, my + 4 * u], [mx + 4 * u + (mw - 8 * u) * fr, my + 4 * u], [mx + 4 * u + (mw - 8 * u) * fr, my + mh - 4 * u], [mx + 4 * u, my + mh - 4 * u]], step(F, 0.14, col), { col, step: 7, w: 3.6, alpha: 0.78, ang: 0.8, seed: 635 + i });
      const dcx = x + pw * 0.8, dcy = y + ph * 0.5, dr = Math.min(ph * 0.17, 100 * u);
      if (i === 0) tangle(F, dcx, dcy, dr, step(F, 0.24), t, { col: F.ink, seed: 640 });
      else {
        const qc = step(F, 0.24, F.acc);
        check(F, dcx, dcy, dr * 0.82, qc, t, { col: F.acc, acc: F.acc, seed: 645 });
        if (qc >= 1) {
          rays(F, dcx, dcy, dr * 1.0, dr * 1.45, 10, 1, t, { col: F.acc, w: 3.8, seed: 648, spin: 0.2 });
          twinkle(F, dcx + dr * 1.05, dcy - dr * 0.8, 22 * u, t, 0, 1, { col: F.acc, seed: 646, quiet: true });
        }
      }
    });
    headMarks(F, "compare", step(F, 0.2, F.acc));
  };

  // ---- title and closing ----------------------------------------------------------------------------
  function bands(F, id) {
    const { u, W, H } = F, tb = textBlock(F, id);
    return { tb, top: { y0: 58 * u, y1: tb.y - 26 * u, x0: 150 * u, x1: W - 380 * u }, bot: { y0: tb.bottom + 40 * u, y1: H - 90 * u, x0: 170 * u, x1: W - 170 * u } };
  }
  // Title: the headline, then the idea in three sketches: a helper bot drafts a card, an arrow carries it
  // down to a person, and a big red tick says they decide.
  function titleArt(F) {
    const { u, t, W, tall } = F;
    headline(F, "title");
    const B = bands(F, "title"), tb = B.tb, th = B.top.y1 - B.top.y0, bh = B.bot.y1 - B.bot.y0;
    let card = null;
    if (th > 150 * u) {
      const s = Math.min(th * 0.62, tall ? 300 * u : 240 * u), cy = (B.top.y0 + B.top.y1) / 2 + s * 0.08;
      const ax = tall ? W * 0.32 : lerp(B.top.x0, B.top.x1, 0.58);
      agent(F, ax, cy, s, step(F, 0.42), t, { seed: 700 });
      const cw = s * 0.95, chh = s * 0.66, cx0 = ax + s * 0.72, cy0 = cy - chh * 0.55 + Math.sin(t * 1.6) * 2 * u;
      draftCard(F, cx0, cy0, cw, chh, step(F, 0.3), t, { seed: 710 });
      card = { x: cx0 + cw, y: cy0 + chh * 0.6, bx: cx0 + cw * 0.5, by: cy0 + chh };
    }
    let you = null;
    if (bh > 140 * u) {
      const H0 = Math.min(bh * 0.86, tall ? 360 * u : 250 * u), base = B.bot.y0 + bh * 0.5 + H0 * 0.45;
      const px = tall ? W * 0.32 : lerp(B.bot.x0, B.bot.x1, 0.42);
      if (card) {
        const ex = px + H0 * 0.32, ey = base - H0 * 1.05;
        const cxp = tall ? W * 0.82 : Math.max(card.x + 120 * u, tb.lines.length > 1 ? Math.min(W - 230 * u, tb.lines[0].x + tb.lines[0].w + 120 * u) : card.x + 160 * u), cyp = (card.y + ey) / 2;
        const P = new Pth().M(card.x + 10 * u, card.y).Q(cxp, cyp, ex, ey);
        const a = Math.atan2(ey - cyp, ex - cxp), hs = 26 * u;
        P.M(ex - Math.cos(a - 0.5) * hs, ey - Math.sin(a - 0.5) * hs).L(ex, ey).L(ex - Math.cos(a + 0.5) * hs, ey - Math.sin(a + 0.5) * hs);
        ink(F, P, step(F, 0.28), { w: 4.4, dash: [14, 10], flow: -t * 34, seed: 740 });
      }
      person(F, px, base, H0, 4, true, step(F, 0.34), t);
      you = { x: px, base, H0 };
      const r = Math.min(bh * 0.4, tall ? 170 * u : 135 * u), kx = tall ? W * 0.72 : lerp(B.bot.x0, B.bot.x1, 0.8), ky = base - H0 * 0.5;
      const qc = step(F, 0.32, F.acc);
      check(F, kx, ky, r, qc, t, { col: F.acc, acc: F.acc, seed: 800 });
      if (qc >= 1) rays(F, kx, ky, r * 1.15, r * 1.5, 11, 1, t, { col: F.acc, w: 4, seed: 801, spin: 0.15 });
    }
    void you;
    headMarks(F, "title", step(F, 0.24, F.acc), { double: true });
  }
  // Closing: the headline, then the payoff: a big red OK stamp, an arrow carrying the approved clip down
  // into its empty slot on a timeline, and the pen circling the stamp.
  function closingArt(F) {
    const { u, t, W, H, tall } = F;
    headline(F, "closing");
    const B = bands(F, "closing"), tb = B.tb, L0 = tb.lines[0], Ll = tb.last;
    let r, sx, sy;
    if (tall || !L0) { r = Math.min(W * 0.26, 260 * u); sx = W / 2; sy = tb.bottom + 60 * u + r; }
    else {
      r = Math.min(175 * u, (H - 100 * u - (L0.y + L0.h)) / 2.75);
      sx = Math.min(W - 230 * u - r * 0.3, Math.max(Ll.x + Ll.w + r + 110 * u, W * 0.68));
      sy = Math.max(Ll.y + Ll.h * 0.5, L0.y + L0.h + r * 1.42);
    }
    // The timeline strip with an empty slot.
    const tx = tall ? 120 * u : 170 * u, tw = tall ? W - 240 * u : Math.max(300 * u, sx - r - 110 * u - tx), tyy = tall ? Math.min(H - 220 * u, sy + r + 150 * u) : Math.max(tb.bottom + 90 * u, H - 200 * u), thh = 64 * u;
    const slot = { x: tx + tw * 0.56, w: tw * 0.24 };
    const Pt = new Pth().M(tx, tyy - 16 * u).L(tx + tw, tyy - 16 * u).M(tx, tyy + thh + 16 * u).L(tx + tw, tyy + thh + 16 * u);
    for (const [c0, c1] of [[0, 0.24], [0.27, 0.53], [0.83, 1]]) Pt.RR(tx + tw * c0, tyy, tw * (c1 - c0), thh, 8 * u);
    ink(F, Pt, step(F, 0.34), { w: 4.2, seed: 820 });
    ink(F, new Pth().RR(slot.x, tyy, slot.w, thh, 8 * u), step(F, 0.12), { w: 3.2, dash: [10, 10], alpha: 0.7, seed: 821 });
    const pulse = 1 + 0.025 * Math.sin(t * 3.4);
    const rot = -0.14, qs = step(F, 0.34, F.acc);
    const ring = new Pth(sx, sy, pulse, rot).O(0, 0, r).O(0, 0, r * 0.82, -PI / 2 + 0.3);
    ink(F, ring, qs, { col: F.acc, w: 7, seed: 830 });
    say(F, "OK", sx, sy + r * 0.24, r * 0.78, { align: "center", col: F.acc, q: step(F, 0.22, F.acc), seed: 831 });
    const qa = step(F, 0.26, F.acc);
    arrowTo(F, sx - r * 0.85, sy + r * 0.6, slot.x + slot.w * 0.6, tyy - 26 * u, tall ? -60 * u : 70 * u, qa, { col: F.acc, w: 4.6, dash: [14, 10], flow: -t * 34, seed: 832 });
    const qf = step(F, 0.22, F.acc), drop = (1 - ease(qf)) * -18 * u;
    scrib(F, [[slot.x + 4 * u, tyy + 4 * u + drop], [slot.x + slot.w - 4 * u, tyy + 4 * u + drop], [slot.x + slot.w - 4 * u, tyy + thh - 4 * u + drop], [slot.x + 4 * u, tyy + thh - 4 * u + drop]], qf, { col: F.acc, step: 7, w: 4, alpha: 0.85, ang: 0.7, seed: 833 });
    const ql = step(F, 0.3, F.acc);
    loop(F, sx, sy, r * 1.22, r * 1.18, ql, { col: F.acc, w: 4.6, seed: 834 });
    if (ql >= 1) {
      rays(F, sx, sy, r * 1.3, r * 1.5, 12, 1, t, { col: F.acc, w: 4, seed: 835, spin: 0.12 });
      tick(F, slot.x + slot.w * 0.5, tyy - 56 * u + Math.sin(t * 3) * 4 * u, 34 * u, 1, { col: F.acc, w: 5, seed: 836 });
    }
    headMarks(F, "closing", step(F, 0.24, F.acc), { double: true });
  }

  // ---- composing a frame ----------------------------------------------------------------------------
  function body(F, st) {
    if (st.id === "title") return titleArt(F);
    if (st.id === "closing") return closingArt(F);
    headline(F, st.id);
    DRAW[st.id](F, F.box, F.plan.data[st.id]);
  }
  const TOTAL = {};
  let dummy = null;
  // The pen clock is stretched or squeezed so every scene finishes drawing a beat before its hold ends.
  function sceneArt(F, st, local, first, prevCol) {
    F.n = 0;
    const key = st.id + ":" + F.W + "x" + F.H;
    if (!(key in TOTAL)) {
      if (!dummy) { dummy = document.createElement("canvas"); dummy.width = dummy.height = 1; }
      const g0 = F.g, tip = F.tip;
      F.g = dummy.getContext("2d"); F.sq = mkSq(-1, 0, 1, F.ink);
      body(F, st);
      TOTAL[key] = { fx: F.sq.fx, fm: F.sq.fm };
      F.g = g0; F.tip = tip;
    }
    const avail = Math.max(0.6, st.hold - first - 0.5);
    const T0 = TOTAL[key];
    let sc = avail / Math.max(0.1, T0.fx + T0.fm);
    if (sc < 0.8) sc = (avail - 0.8 * T0.fm) / Math.max(0.1, T0.fx);
    F.sq = mkSq(local, first, clamp(sc, 0.35, 1.5), prevCol);
    body(F, st);
  }
  function freshLayer(F, lay) {
    const g = lay.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.setLineDash([]); g.clearRect(0, 0, F.W, F.H);
    F.g = g;
  }
  function sheetTransform(ctx, F, k) {
    const N = F.nap, off = (1 - k) * F.W * 1.08, rot = (1 - k) * 0.05, dy = -(1 - k) * 34 * F.u, cx = N.x + N.w / 2, cy = N.y + N.h / 2;
    ctx.translate(cx + off, cy + dy); ctx.rotate(rot); ctx.translate(-cx, -cy);
  }
  // A fresh napkin slid over the old one: soft shadow ahead of it, its leading edge lifted into the light.
  function drawSheet(ctx, F, k) {
    const N = F.nap, u = F.u, T = F.T;
    ctx.save();
    sheetTransform(ctx, F, k);
    ctx.shadowColor = `rgba(${T.shadow},0.4)`; ctx.shadowBlur = 46 * u; ctx.shadowOffsetX = -14 * u; ctx.shadowOffsetY = 10 * u;
    ctx.fillStyle = T.tissue; ctx.fillRect(N.x, N.y, N.w, N.h);
    ctx.shadowColor = "transparent";
    if (baseCache) ctx.drawImage(baseCache, N.x, N.y, N.w, N.h, N.x, N.y, N.w, N.h);
    const lift = Math.sin(PI * clamp(k * 1.1)) * 0.8 + 0.2;
    const gr = ctx.createLinearGradient(N.x, 0, N.x + 90 * u, 0);
    gr.addColorStop(0, `rgba(255,255,250,${0.55 * lift})`); gr.addColorStop(0.45, `rgba(${T.crease},${0.1 * lift})`); gr.addColorStop(1, "rgba(255,255,250,0)");
    ctx.fillStyle = gr; ctx.fillRect(N.x, N.y, 90 * u, N.h);
    ctx.restore();
  }
  function artOf(ctx, F) {
    const P = F.plan, t = F.t;
    let idx = 0;
    for (let i = 0; i < P.shown.length; i++) if (t >= P.shown[i].start) idx = i;
    const cur = P.shown[idx], local = Math.max(0, t - cur.start), prev = P.shown[idx - 1], ch = Math.max(0.2, P.change), tail = 0.75;
    let prevCol = F.ink;
    if (prev && local < ch + tail) {
      freshLayer(F, layerP);
      const pf = idx - 1 === 0 ? 0 : ch;
      sceneArt(F, prev, prev.hold + local, pf, F.ink);
      prevCol = F.sq.col; F.tip = null; bite(F, layerP);
    }
    freshLayer(F, layer);
    sceneArt(F, cur, local, idx === 0 ? 0 : ch, prevCol);
    bite(F, layer);
    if (prev && local < ch) {
      const k = inout(local / ch);
      composite(ctx, F, layerP, 1);
      drawSheet(ctx, F, k);
      ctx.save(); sheetTransform(ctx, F, k); ctx.beginPath(); ctx.rect(F.nap.x, F.nap.y, F.nap.w, F.nap.h); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clip();
      ctx.beginPath(); ctx.rect(0, F.box.y - 30 * F.u, F.W, F.H); ctx.clip(); composite(ctx, F, layerP, 0.075);
      ctx.restore(); ctx.save(); sheetTransform(ctx, F, k); ctx.beginPath(); ctx.rect(F.nap.x, F.nap.y, F.nap.w, F.nap.h); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clip(); composite(ctx, F, layer, 1);
      ctx.restore();
    } else {
      // Thin tissue: the last idea shows faintly through the new napkin for a moment.
      if (prev && local < ch + tail) { ctx.save(); ctx.beginPath(); ctx.rect(0, F.box.y - 30 * F.u, F.W, F.H); ctx.clip(); composite(ctx, F, layerP, 0.075 * (1 - ease((local - ch) / tail))); ctx.restore(); }
      composite(ctx, F, layer, 1);
    }
  }

  function makeFrame(ctx, S, info) {
    const { W, H, u } = S, T = S.look.tone;
    for (const lay of ["layer", "layerP"]) {
      const cv = lay === "layer" ? layer : layerP;
      if (!cv || cv.width !== W || cv.height !== H) { const c = document.createElement("canvas"); c.width = W; c.height = H; if (lay === "layer") layer = c; else layerP = c; }
    }
    const side = (S.tall ? 90 : 140) * u, m = (S.tall ? 36 : 44) * u, mt = (S.tall ? 34 : 38) * u;
    const F = {
      S, W, H, u, tall: S.tall, T, t: info.t, g: layer.getContext("2d"), n: 0, tip: null, tex: S.look.texture, boil: Math.floor(info.t * 10), sq: null, si: -1,
      ink: T.ink, blue: T.blue, green: T.green, hi: T.hi, acc: S.accent,
      nap: { x: m, y: mt, w: W - m * 2, h: H - mt * 2 },
      box: S.tall ? { x: side, y: H * 0.3, w: W - side * 2, h: H * 0.6 } : { x: side, y: H * 0.34, w: W - side * 2, h: H * 0.58 },
    };
    F.rest = { x: F.box.x + F.box.w - 40 * u, y: Math.min(H - 60 * u, F.box.y + F.box.h + 30 * u) };
    F.plan = planOf(F);
    return F;
  }
  function tooth() {
    if (toothCache) return toothCache;
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 256;
    const g = cv.getContext("2d"), R = rng(77);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(0,0,0,${0.35 + R() * 0.6})`; g.fillRect(R() * 256, R() * 256, 1 + R() * 2.2, 1 + R() * 1.6); }
    return (toothCache = cv);
  }
  function bite(F, lay) {
    if (!F.S.paint) return;
    const g = lay.getContext("2d");
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "destination-out"; g.globalAlpha = 0.5 * F.tex; g.fillStyle = g.createPattern(tooth(), "repeat"); g.fillRect(0, 0, F.W, F.H); g.restore();
  }
  // Ink soaks into the tissue: dry-brush gaps, a wide soft bleed, a tight feather, then the line itself.
  function composite(ctx, F, lay, alpha) {
    const { u, S } = F;
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalCompositeOperation = S.paint ? F.T.blend : "source-over";
    ctx.globalAlpha = 0.3 * alpha; ctx.filter = `blur(${7 * u}px)`; ctx.drawImage(lay, 0, 0);
    ctx.globalAlpha = 0.55 * alpha; ctx.filter = `blur(${2.4 * u}px)`; ctx.drawImage(lay, 0, 0);
    ctx.filter = "none"; ctx.globalAlpha = 0.95 * alpha; ctx.drawImage(lay, 0, 0);
    ctx.restore();
  }

  const ALL_HEADS = ["kicker", "title", "chart-title", "object-title", "people-title", "process-title", "compare-title", "closing"];
  const halo = (rgb) => () => `0 0 3px rgba(${rgb},0.4), 0 0 12px rgba(${rgb},0.14)`;

  return {
    bg: "#f6f1e4", panel: "rgba(29,34,54,0.05)", ink: "#1d2236", muted: "#5a5f78", accent: "#e0452b", onAccent: "#fffcf3",
    rule: "rgba(29,34,54,0.75)", track: "rgba(29,34,54,0.1)",
    display: HAND, displayWeight: 400, displayCase: "none", displayTracking: "0.005em",
    body: HAND, bodyWeight: 400, figures: HAND, radius: 20, motion: "write", change: "fade",
    kit: { line: 4.5, fill: "hatch", panel: "outline", hatch: true },
    panelEdge: "rgba(29,34,54,0.7)",
    tone: TONE,
    keepArt: true,
    overlap: false,
    palettes: {
      // Fresh white napkin on pale oak, a night-diner navy napkin with gel pens, and plain grey graphite.
      light: { bg: "#fbfaf5", ink: "#20243a", accent: "#d9432a", textShadow: halo("32,36,58"),
        tone: { ...TONE, wood: "#b58f5a", woodLite: "#cfae7c", woodDark: "#8a6a3c", woodSeam: "#5a4023", tissue: "#fbfaf5", tissueLite: "#ffffff", tissueDark: "#ebe6d8", ink: "#20243a", blue: "#2c63c4", green: "#2f9460" } },
      dark: { bg: "#262c3f", panel: "rgba(255,255,255,0.05)", ink: "#f2ecdd", muted: "#aeb4c8", accent: "#ff7a5a", onAccent: "#1a1e2c", rule: "rgba(242,236,221,0.75)", track: "rgba(242,236,221,0.12)", panelEdge: "rgba(242,236,221,0.6)", textShadow: halo("242,236,221"),
        tone: { ...TONE, wood: "#2a1a10", woodLite: "#3d2818", woodDark: "#150b05", woodSeam: "#0a0502", tissue: "#2a3045", tissueLite: "#363d56", tissueDark: "#1d2234", crease: "10,12,24", ring: "10,8,20", ink: "#f2ecdd", blue: "#8dbcff", green: "#7fe0a6", hi: "#ffd93f", blend: "source-over", shadow: "0,0,0" } },
      mono: { bg: "#eeeeea", ink: "#202020", muted: "#666666", accent: "#202020", onAccent: "#eeeeea", rule: "rgba(32,32,32,0.7)", panelEdge: "rgba(32,32,32,0.6)", textShadow: halo("32,32,32"),
        tone: { ...TONE, wood: "#5d5d59", woodLite: "#7a7a75", woodDark: "#3a3a37", woodSeam: "#1e1e1c", tissue: "#eeeeea", tissueLite: "#fbfbf8", tissueDark: "#d8d8d2", crease: "60,60,56", ring: "90,90,84", ink: "#202020", blue: "#4a4a4a", green: "#6a6a6a", hi: "#d4d4cc", cup: "#f4f4f0", cupShade: "#cfcfc8", coffee: "#2e2e2e", coffeeLite: "#5a5a5a" } },
    },
    textShadow: halo("29,34,54"),
    css: (accent, look) => `
      .kicker { font-family: ${HAND}; text-transform: none !important; letter-spacing: 0.03em !important; font-weight: 700; }
    `,
    backdrop: (accent, texture, look) => (look.tone || TONE).wood,
    // The napkin and table are painted by the stage; this only marks the backdrop as switched on.
    paint: (ctx, W, H) => { ctx.clearRect(0, 0, W, H); },
    stage(ctx, S, info) {
      const F = makeFrame(ctx, S, info);
      const { W, H } = F;
      // On the napkin every headline is hand-lettered by the pen, so the template's typeset copy only
      // provides the layout; over footage (no backdrop) the typeset copy stays.
      if (S.paint) for (const id of ALL_HEADS) { const el = document.getElementById(id); if (el && el.style.visibility !== "hidden") el.style.visibility = "hidden"; }
      if (S.paint) {
        const key = `${W}x${H}:${F.T.tissue}:${F.T.wood}:${F.tex.toFixed(2)}`;
        if (!baseCache || baseKey !== key) { baseCache = makeBase(F); baseKey = key; }
        ctx.drawImage(baseCache, 0, 0);
      }
      if (F.plan) artOf(ctx, F);
      if (S.paint) {
        // A window's light drifting slowly over the table.
        ctx.save(); ctx.globalCompositeOperation = "soft-light"; ctx.globalAlpha = 0.34 * F.tex;
        const lx = W * (0.5 + 0.38 * Math.sin(info.t * 0.32)), ly = H * (0.45 + 0.12 * Math.cos(info.t * 0.27));
        const gr = ctx.createRadialGradient(lx, ly, 0, lx, ly, Math.hypot(W, H) * 0.5);
        gr.addColorStop(0, "rgba(255,248,225,0.95)"); gr.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H); ctx.restore();
        drawCup(ctx, F);
      }
      drawPen(ctx, F, penState(F));
    },
    scenes: { chart: () => {}, object: () => {}, people: () => {}, process: () => {}, compare: () => {} },
  };
});
