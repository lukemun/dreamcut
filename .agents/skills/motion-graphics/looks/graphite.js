// Graphite: a sketchbook page worked in soft pencil. Faint construction lines (circles, axes, guide boxes)
// go down first, darker contours follow, then hatching that breaks over the paper tooth. Every line boils
// a few times a second like redrawn pencil, smudges and eraser crumbs collect on the page, and a scene
// change is an eraser scrubbing the old drawing away while the next one is already being drawn. All
// drawings are original. Frames are pure functions of time (seeded hashes only).
window.DreamcutMotion.register("graphite", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const inout = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const c = 1.70158; return 1 + (c + 1) * Math.pow(v - 1, 3) + c * Math.pow(v - 1, 2); };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const hash = (a, b = 0, c = 0) => {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1103515245);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const fmt = (v, d, pre, suf) => window.DreamcutMotion.formatNumber(v, d, pre, suf);
  const HAND = "'Noteworthy', 'Bradley Hand', 'Marker Felt', 'Chalkboard SE', 'Segoe Print', 'Comic Sans MS', cursive";
  const rgbOf = (hex) => { const n = parseInt(String(hex).slice(1), 16); return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`; };

  // ---- paths that can be drawn part-way -------------------------------------------------------------
  class Pth {
    constructor(ox = 0, oy = 0, s = 1) { this.s = []; this.c = null; this.ox = ox; this.oy = oy; this.k = s; this.r = null; this.rs = 0; this.n = -1; this.bb = null; }
    _m(x, y) { this.c = [x, y]; this.s.push(this.c); return this; }
    _l(x, y) { if (!this.c) return this._m(x, y); this.c.push(x, y); return this; }
    M(x, y) { return this._m(this.ox + x * this.k, this.oy + y * this.k); }
    L(x, y) { return this._l(this.ox + x * this.k, this.oy + y * this.k); }
    Q(cx, cy, x, y) {
      const c = this.c, x0 = c[c.length - 2], y0 = c[c.length - 1];
      const X1 = this.ox + cx * this.k, Y1 = this.oy + cy * this.k, X = this.ox + x * this.k, Y = this.oy + y * this.k;
      const n = Math.max(6, Math.ceil(Math.hypot(X - x0, Y - y0) / 10));
      for (let i = 1; i <= n; i++) { const t = i / n, m = 1 - t; this._l(m * m * x0 + 2 * m * t * X1 + t * t * X, m * m * y0 + 2 * m * t * Y1 + t * t * Y); }
      return this;
    }
    C(ax, ay, bx, by, x, y) {
      const c = this.c, x0 = c[c.length - 2], y0 = c[c.length - 1];
      const A = this.ox + ax * this.k, B = this.oy + ay * this.k, A2 = this.ox + bx * this.k, B2 = this.oy + by * this.k, X = this.ox + x * this.k, Y = this.oy + y * this.k;
      const n = Math.max(8, Math.ceil(Math.hypot(X - x0, Y - y0) / 9));
      for (let i = 1; i <= n; i++) {
        const t = i / n, m = 1 - t;
        this._l(m * m * m * x0 + 3 * m * m * t * A + 3 * m * t * t * A2 + t * t * t * X, m * m * m * y0 + 3 * m * m * t * B + 3 * m * t * t * B2 + t * t * t * Y);
      }
      return this;
    }
    Z() { if (this.c && this.c.length > 2) this.c.push(this.c[0], this.c[1]); return this; }
    E(cx, cy, rx, ry, a0, a1, move, rot = 0) {
      const X = this.ox + cx * this.k, Y = this.oy + cy * this.k, RX = rx * this.k, RY = ry * this.k;
      const steps = Math.max(8, Math.ceil((Math.abs(a1 - a0) * Math.max(RX, RY)) / 6));
      const cr = Math.cos(rot), sr = Math.sin(rot);
      for (let i = 0; i <= steps; i++) {
        const a = a0 + ((a1 - a0) * i) / steps, ex = Math.cos(a) * RX, ey = Math.sin(a) * RY;
        const x = X + ex * cr - ey * sr, y = Y + ex * sr + ey * cr;
        if (i === 0 && (move || !this.c)) this._m(x, y); else this._l(x, y);
      }
      return this;
    }
    A(cx, cy, r, a0, a1, move) { return this.E(cx, cy, r, r, a0, a1, move); }
    O(cx, cy, r, a0 = -Math.PI / 2) { return this.E(cx, cy, r, r, a0, a0 + TAU, true); }
    OV(cx, cy, rx, ry, rot = 0, a0 = -Math.PI / 2) { return this.E(cx, cy, rx, ry, a0, a0 + TAU, true, rot); }
    R(x, y, w, h) { return this.M(x, y).L(x + w, y).L(x + w, y + h).L(x, y + h).Z(); }
    RR(x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      this.M(x + r, y).L(x + w - r, y).A(x + w - r, y + r, r, -Math.PI / 2, 0).L(x + w, y + h - r).A(x + w - r, y + h - r, r, 0, Math.PI / 2);
      return this.L(x + r, y + h).A(x + r, y + h - r, r, Math.PI / 2, Math.PI).L(x, y + r).A(x + r, y + r, r, Math.PI, Math.PI * 1.5).Z();
    }
    poly(pts, close) { pts.forEach(([x, y], i) => (i ? this.L(x, y) : this.M(x, y))); return close ? this.Z() : this; }
    trace(g) { for (const s of this.s) { g.moveTo(s[0], s[1]); for (let i = 2; i < s.length; i += 2) g.lineTo(s[i], s[i + 1]); } }
    res(step) {
      if (this.r && this.rs === step) return this.r;
      const out = [];
      for (const s of this.s) {
        const o = [s[0], s[1]];
        for (let i = 2; i < s.length; i += 2) {
          const x0 = s[i - 2], y0 = s[i - 1], x1 = s[i], y1 = s[i + 1], d = Math.hypot(x1 - x0, y1 - y0), n = Math.floor(d / step);
          for (let j = 1; j <= n; j++) { const k = j / (n + 1); o.push(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k); }
          o.push(x1, y1);
        }
        out.push(o);
      }
      this.r = out; this.rs = step;
      return out;
    }
    len() {
      if (this.n >= 0) return this.n;
      let n = 0;
      for (const s of this.s) for (let i = 2; i < s.length; i += 2) n += Math.hypot(s[i] - s[i - 2], s[i + 1] - s[i - 1]);
      return (this.n = n);
    }
    // The point a fraction q along the whole path, with its heading.
    at(q) {
      let left = this.len() * clamp(q), last = null;
      for (const s of this.s) for (let i = 2; i < s.length; i += 2) {
        const dx = s[i] - s[i - 2], dy = s[i + 1] - s[i - 1], d = Math.hypot(dx, dy);
        last = [s[i], s[i + 1], Math.atan2(dy, dx)];
        if (d >= left) { const k = d ? left / d : 0; return [s[i - 2] + dx * k, s[i - 1] + dy * k, last[2]]; }
        left -= d;
      }
      return last || [0, 0, 0];
    }
    bbox() {
      if (this.bb) return this.bb;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const s of this.s) for (let i = 0; i < s.length; i += 2) { x0 = Math.min(x0, s[i]); x1 = Math.max(x1, s[i]); y0 = Math.min(y0, s[i + 1]); y1 = Math.max(y1, s[i + 1]); }
      return (this.bb = [x0, y0, x1, y1]);
    }
  }
  const sub = (ox, oy, s = 1) => new Pth(ox, oy, s);

  // ---- the pencil's marks ---------------------------------------------------------------------------
  // A contour: two passes a hair apart that boil a few times a second. q draws the first part of the path.
  function ink(F, P, o = {}) {
    const q = o.q === undefined ? 1 : o.q;
    if (q <= 0) return;
    const g = F.g, u = F.u, w = (o.w ?? 2.4) * u, a = o.a ?? 0.88, seed = (o.seed | 0) + 1, amp = (o.amp ?? 1) * u;
    const col = o.col || F.gr, passes = o.passes ?? 2;
    const segs = P.res(14 * u), total = P.len();
    g.lineCap = "round"; g.lineJoin = "round";
    g.setLineDash(o.dash ? o.dash.map((v) => v * u) : []);
    g.lineDashOffset = o.off ? o.off * u : 0;
    // Graphite pressure: the line darkens and thickens where the hand leans in, and lifts at its ends.
    const pr = o.dash ? 0 : (o.pressure ?? 1);
    for (let pass = 0; pass < passes; pass++) {
      const ph = hash(seed, F.fi, pass) * TAU, ph2 = hash(seed * 7, F.fi, pass + 3) * TAU;
      const baseA = a * (pass ? 0.5 : 1), baseW = w * (pass ? 0.62 : 1);
      let left = total * q, idx = 0, done = false, chunk = 0;
      let lx = 0, ly = 0, open = false;
      const begin = (x, y) => { g.beginPath(); g.moveTo(x, y); open = true; chunk = 0; };
      const end = (k) => {
        if (!open) return;
        const n = 0.5 + 0.5 * Math.sin(k * 0.13 + seed * 1.3 + pass) * Math.cos(k * 0.05 + seed);
        const m = pr === 0 ? 1 : 1 - pr * 0.42 + pr * 0.42 * n * 2;
        g.strokeStyle = `rgba(${col},${Math.min(1, baseA * (0.62 + 0.38 * m))})`;
        g.lineWidth = baseW * (0.68 + 0.32 * m);
        g.stroke(); open = false;
      };
      for (const s of segs) {
        let px = 0, py = 0, first = true;
        for (let i = 0; i < s.length; i += 2, idx++) {
          const x = s[i] + amp * (Math.sin(idx * 0.9 + ph) + 0.6 * Math.sin(idx * 0.37 + ph2) + 1.3 * Math.sin(idx * 0.11 + seed + pass * 2));
          const y = s[i + 1] + amp * (Math.cos(idx * 0.8 + ph2) + 0.6 * Math.sin(idx * 0.41 + ph) + 1.3 * Math.cos(idx * 0.13 + seed * 1.7 + pass * 2));
          if (first) { end(idx); begin(x, y); first = false; }
          else {
            const d = Math.hypot(s[i] - s[i - 2], s[i + 1] - s[i - 1]);
            if (d > left) { const k = d ? left / d : 0; g.lineTo(px + (x - px) * k, py + (y - py) * k); done = true; break; }
            left -= d;
            g.lineTo(x, y);
            if (++chunk >= 5 && pr > 0) { end(idx); begin(x, y); }
          }
          px = x; py = y;
        }
        if (done) break;
      }
      end(idx);
    }
    g.setLineDash([]); g.lineDashOffset = 0;
  }
  // A construction line: long, light, drawn first and left under the contour.
  function guide(F, x1, y1, x2, y2, q, a = 0.2, o = {}) {
    if (q <= 0) return;
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, e = (o.over ?? 14) * F.u;
    ink(F, sub().M(x1 - (dx / L) * e, y1 - (dy / L) * e).L(x2 + (dx / L) * e, y2 + (dy / L) * e), { q, a, w: o.w ?? 1.1, passes: 1, seed: o.seed ?? 3, amp: 0.7, dash: o.dash });
  }
  function guideCircle(F, cx, cy, r, q, a = 0.2, seed = 5) {
    if (q <= 0) return;
    ink(F, sub().O(cx, cy, r * 1.03).O(cx + r * 0.04, cy - r * 0.03, r * 0.97), { q, a, w: 1, passes: 1, seed, amp: 0.8 });
  }
  // Parallel hatching clipped to a closed path. Lines appear one after another as q runs.
  function hatchFill(F, P, o) {
    const q = o.q ?? 1;
    if (q <= 0) return;
    const g = F.g, u = F.u, b = P.bbox(), step = (o.step ?? 8) * u;
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, R = Math.hypot(b[2] - b[0], b[3] - b[1]) / 2 + 4 * u;
    const ang = o.ang ?? 0.8, ca = Math.cos(ang), sa = Math.sin(ang), n = Math.ceil((2 * R) / step), m = Math.ceil(n * q);
    const seed = (o.seed | 0) + 11;
    g.save();
    g.beginPath(); P.trace(g); g.clip();
    g.lineWidth = (o.w ?? 1.15) * u; g.lineCap = "round";
    // Three pressures of stroke, so the hatching reads as hand-laid graphite rather than ruled lines.
    for (let b = 0; b < 3; b++) {
      g.strokeStyle = `rgba(${o.col || F.gr},${(o.a ?? 0.45) * [0.62, 0.9, 1.18][b]})`;
      g.beginPath();
      for (let i = 0; i < m; i++) {
        if (o.skip && hash(seed, i) < o.skip) continue;
        if (Math.floor(hash(seed, i, 5) * 3) !== b) continue;
        const off = -R + (i + hash(seed, i, F.fi) * 0.5) * step, e1 = R * (1 + (hash(seed, i, 9) - 0.5) * 0.04);
        const px = cx - sa * off, py = cy + ca * off, bow = (hash(seed, i, 7) - 0.5) * step * 0.9;
        g.moveTo(px - ca * e1, py - sa * e1); g.quadraticCurveTo(px - sa * bow, py + ca * bow, px + ca * e1, py + sa * e1);
      }
      g.stroke();
    }
    g.restore();
  }
  // Smudged graphite tone: a soft gradient rubbed into a closed shape, darkest on the side away from the light.
  function tone(F, P, a, o = {}) {
    if (a <= 0.003) return;
    const g = F.g, b = P.bbox(), ang = o.ang ?? 0.7, cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, r = Math.hypot(b[2] - b[0], b[3] - b[1]) / 2;
    const dx = Math.cos(ang) * r, dy = Math.sin(ang) * r, col = o.col || F.gr;
    const gr = g.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
    gr.addColorStop(0, `rgba(${col},${a * 0.12})`); gr.addColorStop(0.55, `rgba(${col},${a * 0.5})`); gr.addColorStop(1, `rgba(${col},${a})`);
    g.save(); g.beginPath(); P.trace(g); g.clip();
    g.fillStyle = gr; g.fillRect(b[0] - 2, b[1] - 2, b[2] - b[0] + 4, b[3] - b[1] + 4);
    // A thumb-rubbed bloom near the dark edge.
    const sx = cx + dx * 0.55, sy = cy + dy * 0.55, rg = g.createRadialGradient(sx, sy, 0, sx, sy, r * 0.8);
    rg.addColorStop(0, `rgba(${col},${a * 0.45})`); rg.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = rg; g.fillRect(b[0] - 2, b[1] - 2, b[2] - b[0] + 4, b[3] - b[1] + 4);
    g.restore();
  }
  // A soft graphite cast shadow on the desk line, falling away to the lower right.
  function cast(F, x, y, w, a) {
    if (a <= 0.003) return;
    const g = F.g, h = w * 0.16;
    g.save(); g.translate(x + w * 0.1, y + h * 0.25); g.scale(1, h / w);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, w);
    gr.addColorStop(0, `rgba(${F.gr},${a})`); gr.addColorStop(0.5, `rgba(${F.gr},${a * 0.55})`); gr.addColorStop(1, `rgba(${F.gr},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, w, 0, TAU); g.fill(); g.restore();
  }
  // A closed shape: outline first, then hatching (and a coloured-pencil tint) filling in behind it.
  function shape(F, P, o = {}) {
    const q = o.q ?? 1;
    if (q <= 0) return;
    const filled = o.hatch || o.tint, bb = P.bbox(), big = Math.hypot(bb[2] - bb[0], bb[3] - bb[1]) > 70 * F.u;
    // The loose construction pass that was laid in first and never erased.
    if (big && o.ghost !== false) {
      const g = F.g, gx = (hash(o.seed | 0, 1) - 0.5) * 7 * F.u, gy = (hash(o.seed | 0, 2) - 0.5) * 7 * F.u;
      g.save(); g.translate(gx, gy);
      ink(F, P, { q: span(q, 0, 0.45), a: 0.16, w: 1.1, passes: 1, amp: 1.8, seed: (o.seed | 0) + 97, col: o.col, pressure: 0 });
      g.restore();
    }
    ink(F, P, { w: o.w ?? 2.4, a: o.a ?? 0.9, q: span(q, 0, filled ? 0.62 : 1), seed: o.seed, col: o.col, amp: o.amp, passes: o.passes });
    const hq = span(q, 0.35, 1);
    if (hq <= 0) return;
    if (o.hatch && o.tone !== false) tone(F, P, (o.hatch.a ?? 0.4) * 0.42 * hq, { ang: o.hatch.toneAng });
    if (o.tint) tone(F, P, (o.tint.a ?? 0.5) * 0.3 * hq, { col: o.tint.col || F.accRGB });
    if (o.tint) hatchFill(F, P, { q: hq, step: o.tint.step ?? 6, ang: o.tint.ang ?? -0.9, col: o.tint.col || F.accRGB, a: o.tint.a ?? 0.5, w: o.tint.w ?? 1.7, seed: (o.seed | 0) + 5 });
    if (o.hatch) hatchFill(F, P, { q: hq, step: o.hatch.step ?? 9, ang: o.hatch.ang ?? 0.8, col: o.hatch.col || o.col || F.gr, a: o.hatch.a ?? 0.4, w: o.hatch.w ?? 1.1, seed: (o.seed | 0) + 9, skip: o.hatch.skip });
    if (o.hatch && o.hatch.cross) hatchFill(F, P, { q: span(hq, 0.4, 1), step: o.hatch.step ?? 9, ang: (o.hatch.ang ?? 0.8) + 1.4, col: o.hatch.col || o.col || F.gr, a: (o.hatch.a ?? 0.4) * 0.9, w: o.hatch.w ?? 1.1, seed: (o.seed | 0) + 13 });
  }
  // Handwriting that appears letter by letter as q runs.
  function say(F, s, x, y, size, o = {}) {
    s = String(s ?? "");
    const q = o.q ?? 1;
    if (!s || q <= 0) return 0;
    const g = F.g;
    g.font = `${o.weight || 700} ${size}px ${HAND}`;
    let w = g.measureText(s).width;
    if (o.maxW && w > o.maxW) { size = Math.max(o.min || size * 0.7, (size * o.maxW) / w); g.font = `${o.weight || 700} ${size}px ${HAND}`; w = g.measureText(s).width; }
    const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    g.textAlign = "left"; g.textBaseline = o.base || "alphabetic";
    const txt = q >= 1 ? s : s.slice(0, Math.ceil(s.length * q));
    g.save();
    g.fillStyle = o.color || F.ink(0.92);
    g.fillText(txt, x0, y);
    g.globalAlpha *= 0.35; g.fillText(txt, x0 + 0.9 * F.u, y + 0.7 * F.u);
    g.restore();
    return w;
  }
  function smudge(F, x, y, r, a) {
    const g = F.g, gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${F.gr},${a})`); gr.addColorStop(1, `rgba(${F.gr},0)`);
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // A four-point glint, scaled by k.
  function glint(F, x, y, r, k, col) {
    if (k <= 0.02) return;
    const R = r * k;
    ink(F, sub().M(x - R, y).L(x + R, y).M(x, y - R).L(x, y + R), { w: 1.8, a: 0.9, col: col || F.accRGB, passes: 1, amp: 0.3, seed: 8 });
  }
  const knock = (F, P) => { const g = F.g; g.save(); g.globalCompositeOperation = "destination-out"; g.fillStyle = "#000"; g.beginPath(); P.trace(g); g.fill(); g.restore(); };
  const tint = (F, P, a, col) => { const g = F.g; g.save(); g.fillStyle = `rgba(${col || F.gr},${a})`; g.beginPath(); P.trace(g); g.fill(); g.restore(); };

  // ---- small reusable drawings -----------------------------------------------------------------------
  // A pencil lying anywhere: tip at (x, y), body running away along `ang`, eraser at the far end.
  function pencil(F, x, y, L, ang, q, seed, o = {}) {
    if (q <= 0) return;
    const g = F.g, u = F.u, r = (o.r ?? 17) * u;
    g.save(); g.translate(x, y); g.rotate(ang);
    const cone = r * 3.4, tipL = r * 1.1;
    const body = sub().M(cone, -r).L(L * 0.9, -r).L(L * 0.9, r).L(cone, r).Z();
    const wood = sub().M(0, 0).L(cone, -r).Q(cone - r * 0.5, -r * 0.2, cone - r * 0.2, 0).Q(cone - r * 0.5, r * 0.2, cone, r).Z();
    const lead = sub().M(0, 0).L(tipL, -r * 0.32).L(tipL, r * 0.32).Z();
    const ferrule = sub().R(L * 0.9, -r, r * 1.9, r * 2);
    const rub = sub().RR(L * 0.9 + r * 1.9, -r * 0.88, r * 2.6, r * 1.76, r * 0.6);
    shape(F, body, { q: span(q, 0, 0.7), seed, w: 2.2, hatch: o.tint ? null : { step: 7, ang: 1.0, a: 0.28 }, tint: o.tint ? { step: 6, ang: 1.0, a: 0.5 } : null });
    ink(F, sub().M(cone, -r * 0.33).L(L * 0.9, -r * 0.33).M(cone, r * 0.33).L(L * 0.9, r * 0.33), { q: span(q, 0.2, 0.8), seed: seed + 2, w: 1.4, a: 0.7, passes: 1 });
    shape(F, wood, { q: span(q, 0.1, 0.8), seed: seed + 3, w: 2, hatch: { step: 6, ang: -0.7, a: 0.28 } });
    shape(F, lead, { q: span(q, 0.3, 0.9), seed: seed + 4, w: 2, hatch: { step: 2.6, ang: 0.4, a: 0.8 } });
    shape(F, ferrule, { q: span(q, 0.3, 0.9), seed: seed + 5, w: 2, hatch: { step: 4.5, ang: 0.6, a: 0.45 } });
    ink(F, sub().M(L * 0.9 + r * 0.6, -r).L(L * 0.9 + r * 0.6, r).M(L * 0.9 + r * 1.2, -r).L(L * 0.9 + r * 1.2, r), { q: span(q, 0.5, 1), seed: seed + 6, w: 1.4, a: 0.7, passes: 1 });
    shape(F, rub, { q: span(q, 0.5, 1), seed: seed + 7, w: 2, tint: { step: 5, ang: 0.9, a: 0.6 } });
    g.restore();
  }
  function bird(F, x, y, s, flap, seed) {
    const w = s * (0.9 + 0.1 * Math.abs(flap)), lift = flap * s * 0.55;
    ink(F, sub().M(x - w, y - lift).Q(x - w * 0.45, y - lift * 1.4 - s * 0.2, x, y).Q(x + w * 0.45, y - lift * 1.4 - s * 0.2, x + w, y - lift), { w: 2.2, a: 0.8, passes: 1, amp: 0.5, seed });
  }
  function steam(F, x, y, h, T, n = 3, seed = 1) {
    for (let k = 0; k < n; k++) {
      const ph = (T * 0.5 + k / n) % 1, xx = x + (k - (n - 1) / 2) * h * 0.2, hh = h * 0.7;
      const P = sub().M(xx, y - ph * h * 0.3);
      for (let j = 1; j <= 6; j++) P.L(xx + Math.sin(j * 1.3 + T * 2.2 + k) * h * 0.05 * j * 0.5, y - ph * h * 0.3 - (hh * j) / 6);
      ink(F, P, { w: 2, a: 0.5 * Math.sin(ph * Math.PI), passes: 1, amp: 0.4, seed: seed + k });
    }
  }
  function mug(F, x, y, w, h, q, T, seed, hot) {
    const body = sub().M(x, y - h).L(x, y - h * 0.12).Q(x, y, x + w * 0.14, y).L(x + w * 0.86, y).Q(x + w, y, x + w, y - h * 0.12).L(x + w, y - h).Z();
    cast(F, x + w / 2, y, w * 0.9, 0.28 * q);
    shape(F, body, { q, seed, w: 2.4, hatch: { step: 7, ang: 0.9, a: 0.3, toneAng: 0 }, tint: hot ? { a: 0.35, step: 8 } : null });
    ink(F, sub().M(x + w, y - h * 0.78).C(x + w * 1.38, y - h * 0.8, x + w * 1.38, y - h * 0.24, x + w, y - h * 0.28), { q: span(q, 0.4, 1), seed: seed + 1, w: 2.4 });
    ink(F, sub().OV(x + w / 2, y - h, w / 2, h * 0.1), { q: span(q, 0, 0.6), seed: seed + 2, w: 2 });
    if (q > 0.8) steam(F, x + w / 2, y - h * 1.15, h * 0.9, T, 3, seed + 5);
  }
  // A crumpled ball of paper: a ragged polygon with creases and a shaded side.
  function crumple(F, cx, cy, r, q, seed, wob) {
    const n = 9, pts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU + hash(seed, i) * 0.4, rr = r * (0.78 + hash(seed, i + 20) * 0.34); pts.push([cx + Math.cos(a + wob) * rr, cy + Math.sin(a + wob) * rr]); }
    const P = sub().poly(pts, true);
    shape(F, P, { q, seed, w: 2.1, hatch: { step: 6, ang: 0.7, a: 0.3, skip: 0.2 } });
    ink(F, sub().poly([pts[0], [cx + r * 0.1, cy - r * 0.05], pts[3]]).poly([[cx + r * 0.1, cy - r * 0.05], pts[6]]).poly([pts[1], [cx - r * 0.15, cy + r * 0.2], pts[7]]), { q: span(q, 0.3, 1), seed: seed + 4, w: 1.3, a: 0.6, passes: 1, amp: 0.4 });
  }
  function note(F, x, y, w, h, q, seed, check) {
    const P = sub().M(x, y).L(x + w, y).L(x + w, y + h * 0.78).L(x + w * 0.82, y + h).L(x, y + h).Z();
    shape(F, P, { q, seed, w: 2.1, hatch: { step: 12, ang: -0.6, a: 0.12 } });
    ink(F, sub().M(x + w * 0.82, y + h).L(x + w * 0.84, y + h * 0.8).L(x + w, y + h * 0.78), { q: span(q, 0.5, 1), seed: seed + 1, w: 1.5, a: 0.7, passes: 1 });
    for (let k = 0; k < 3; k++) ink(F, sub().M(x + w * 0.14, y + h * (0.28 + k * 0.17)).L(x + w * (check && k === 2 ? 0.45 : 0.74 - k * 0.1), y + h * (0.28 + k * 0.17)), { q: span(q, 0.4 + k * 0.1, 1), seed: seed + 3 + k, w: 1.6, a: 0.6, passes: 1 });
  }
  function checkMark(F, cx, cy, s, q, seed, col) {
    ink(F, sub().M(cx - s * 0.42, cy + s * 0.02).L(cx - s * 0.12, cy + s * 0.34).L(cx + s * 0.48, cy - s * 0.36), { q, w: 6, a: 0.95, col: col || F.accRGB, seed, amp: 1.2 });
  }
  function plane(F, x, y, s, ang, q, seed) {
    const g = F.g;
    g.save(); g.translate(x, y); g.rotate(ang);
    const wing = sub().M(s, 0).L(-s * 0.7, -s * 0.5).L(-s * 0.35, 0).L(-s * 0.7, s * 0.5).Z();
    shape(F, wing, { q, seed, w: 2.2, hatch: { step: 6, ang: 0.9, a: 0.25 } });
    ink(F, sub().M(s, 0).L(-s * 0.35, 0).M(-s * 0.35, 0).L(-s * 0.2, s * 0.22), { q, seed: seed + 1, w: 1.6, a: 0.7, passes: 1 });
    g.restore();
  }
  function gear(F, cx, cy, r, teeth, q, ang, seed, tinted) {
    const P = sub();
    const n = teeth * 4;
    for (let i = 0; i <= n; i++) {
      const a = ang + (i / n) * TAU, k = i % 4, rr = k === 1 || k === 2 ? r : r * 0.8;
      (i ? P.L : P.M).call(P, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    shape(F, P, { q, seed, w: 2.2, hatch: tinted ? null : { step: 7, ang: 0.8, a: 0.3 }, tint: tinted ? { step: 6, a: 0.45 } : null });
    ink(F, sub().O(cx, cy, r * 0.34), { q: span(q, 0.4, 1), seed: seed + 1, w: 2, passes: 1 });
  }
  function spiral(F, cx, cy, r0, r1, turns, q, seed, sq = 1) {
    const P = sub(), n = Math.ceil(turns * 22);
    for (let i = 0; i <= n; i++) { const k = i / n, a = k * turns * TAU, r = lerp(r0, r1, k); (i ? P.L : P.M).call(P, cx + Math.cos(a) * r, cy + Math.sin(a) * r * sq); }
    ink(F, P, { q, seed, w: 1.9, a: 0.75, passes: 1, amp: 0.5 });
  }

  // ---- a sketchbook page ----------------------------------------------------------------------------
  let layer = null, tiles = null, tileKey = "";
  function makeTiles(T, u, W, H) {
    const mk = (n) => { const c = document.createElement("canvas"); c.width = n; c.height = n; return c; };
    const tooth = mk(256), tg = tooth.getContext("2d"), r = rng(31);
    tg.fillStyle = "#000";
    for (let i = 0; i < 1900; i++) {
      tg.globalAlpha = 0.25 + r() * 0.7;
      const x = r() * 256, y = r() * 256, rw = (0.5 + r() * 1.3) * u * (r() < 0.25 ? 2.6 : 1);
      tg.beginPath(); tg.ellipse(x, y, rw, (0.5 + r() * 0.9) * u, r() * 0.8, 0, TAU); tg.fill();
      if (x < 6 || y < 6) { tg.beginPath(); tg.ellipse(x + 256, y + 256, rw, rw, 0, 0, TAU); tg.fill(); }
    }
    const fibre = mk(320), fg = fibre.getContext("2d"), r2 = rng(77);
    for (let i = 0; i < 1100; i++) {
      const light = r2() < 0.35;
      fg.strokeStyle = light ? `rgba(255,255,250,${0.1 + r2() * 0.22})` : `rgba(${T.fibre},${0.04 + r2() * 0.1})`;
      fg.lineWidth = (0.6 + r2() * 0.8) * u;
      const x = r2() * 320, y = r2() * 320, a = r2() * TAU, l = (2 + r2() * 9) * u;
      fg.beginPath(); fg.moveTo(x, y); fg.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); fg.stroke();
    }
    return { tooth, fibre };
  }
  function bindingWidth(F) { return (F.tall ? 66 : 92) * F.u; }
  function paper(ctx, F) {
    const { W, H, u, T } = F, tex = F.tex;
    ctx.save();
    ctx.fillStyle = T.paper; ctx.fillRect(0, 0, W, H);
    const r = rng(12);
    for (let i = 0; i < 9; i++) {
      const x = r() * W, y = r() * H, rad = (0.2 + r() * 0.35) * Math.max(W, H), dark = r() < 0.5, gr = ctx.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, dark ? `rgba(${T.fibre},${0.05 * tex})` : `rgba(255,255,250,${0.1 * tex})`); gr.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }
    if (tex > 0) { ctx.globalAlpha = tex; ctx.fillStyle = ctx.createPattern(tiles.fibre, "repeat"); ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    const v = ctx.createRadialGradient(W * 0.46, H * 0.44, Math.min(W, H) * 0.35, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.62);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, `rgba(${T.fibre},${T.vig * (0.4 + 0.6 * tex)})`);
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    // The binding: a gutter shadow, punched holes and wire coils.
    const bw = bindingWidth(F), sh = ctx.createLinearGradient(0, 0, bw * 1.7, 0);
    sh.addColorStop(0, `rgba(0,0,0,${T.gutter})`); sh.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sh; ctx.fillRect(0, 0, bw * 1.7, H);
    const pitch = 74 * u, n = Math.ceil(H / pitch) + 1, y0 = (H - (n - 1) * pitch) / 2;
    for (let i = 0; i < n; i++) {
      const y = y0 + i * pitch, hx = bw * 0.62;
      ctx.fillStyle = `rgba(0,0,0,${T.hole})`; ctx.beginPath(); ctx.ellipse(hx, y, 11 * u, 9 * u, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.filter = `blur(${3 * u}px)`; ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 6 * u;
      ctx.beginPath(); ctx.ellipse(hx + 8 * u, y + 8 * u, bw * 0.5, 15 * u, -0.28, -1.3, 1.5); ctx.stroke(); ctx.restore();
      ctx.strokeStyle = T.coil; ctx.lineWidth = 5.5 * u; ctx.lineCap = "round";
      ctx.beginPath(); ctx.ellipse(hx - 4 * u, y, bw * 0.55, 15 * u, -0.28, -1.5, 1.7); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 1.6 * u;
      ctx.beginPath(); ctx.ellipse(hx - 4 * u, y - 1.5 * u, bw * 0.55, 15 * u, -0.28, -1.3, 0.3); ctx.stroke();
    }
    ctx.restore();
  }
  // Marks that belong to one page: thumb smudges, a ring, eraser crumbs and the page number.
  function pageMarks(F, idx, local, id) {
    const { W, H, u } = F, q = span(local, 0, 0.5);
    const r = (n) => hash(idx * 31 + 7, n);
    smudge(F, W * (0.55 + r(1) * 0.35), H * (0.82 + r(2) * 0.12), 120 * u * (0.7 + r(3)), 0.07 * F.tex);
    smudge(F, W * (0.1 + r(4) * 0.3) + bindingWidth(F), H * (0.7 + r(5) * 0.25), 90 * u, 0.06 * F.tex);
    for (let k = 0; k < 16; k++) {
      const x = W * (0.2 + hash(idx, k) * 0.7), y = H - (22 + hash(idx, k + 40) * 44) * u, a = hash(idx, k + 80) * TAU;
      if (hash(idx, k + 120) < q) ink(F, sub().M(x, y).L(x + Math.cos(a) * 6 * u, y + Math.sin(a) * 6 * u), { w: 3, a: 0.5, passes: 1, amp: 0, seed: k });
    }
    if (id !== "title" && id !== "closing") say(F, "p. " + (idx + 12), W - 70 * u, H - 28 * u, 42 * u, { align: "right", q: span(local, 0.3, 1), color: F.ink(0.5), weight: 600 });
  }

  // ---- layout helpers -------------------------------------------------------------------------------
  const HEADS = { title: ["kicker", "title"], chart: ["chart-title"], object: ["object-title"], people: ["people-title"], process: ["process-title"], compare: ["compare-title"], closing: ["closing"] };
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
      const line = { x: ox + (r.left - er.left) / scale, y: oy + (r.top - er.top) / scale, w: r.width / scale, h: r.height / scale };
      if (line.w > 1 && !out.some((o) => Math.abs(o.y - line.y) < 2)) out.push(line);
    }
    return (lineCache[id] = out);
  }
  const headBox = (ids) => {
    const lines = [].concat(...ids.map(headLines));
    if (!lines.length) return null;
    return { x: Math.min(...lines.map((l) => l.x)), y: Math.min(...lines.map((l) => l.y)), r: Math.max(...lines.map((l) => l.x + l.w)), b: Math.max(...lines.map((l) => l.y + l.h)) };
  };
  // The drawing area for a scene: from just under its measured headline to the foot of the frame.
  function areaOf(F, id) {
    const { W, H, u, tall } = F, side = (tall ? 90 : 140) * u, hb = headBox(HEADS[id] || []);
    const top = hb ? Math.max(hb.b + (tall ? 50 : 36) * u, H * 0.17) : (tall ? H * 0.3 : H * 0.34);
    return { x: side, y: top, w: W - side * 2, h: H - (tall ? 110 : 92) * u - top };
  }

  const DEFAULT_HOLDS = { title: 2.4, chart: 3.4, object: 3.6, people: 3.2, process: 3.6, compare: 3.2, closing: 2.4 };
  let planCache = null;
  function planOf() {
    if (planCache) return planCache;
    const c = (window.__dreamcut && window.__dreamcut.controls) || {};
    const shown = [];
    let at = 0;
    for (const id of ["title", "chart", "object", "people", "process", "compare", "closing"]) {
      const h = Number(c[id + "_hold"] ?? DEFAULT_HOLDS[id]) || 0;
      if (h > 0) shown.push({ id, start: at, hold: h, i: shown.length });
      at += Math.max(0, h);
    }
    return (planCache = { shown });
  }

  function frameOf(S, info) {
    const { W, H, u, look } = S;
    if (!layer || layer.width !== W || layer.height !== H) { layer = document.createElement("canvas"); layer.width = W; layer.height = H; }
    const T = look.tone, key = `${W}x${H}:${T.paper}`;
    if (!tiles || tileKey !== key) { tiles = makeTiles(T, u, W, H); tileKey = key; }
    const g = layer.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.setLineDash([]);
    const acc = rgbOf(S.accent);
    return {
      S, W, H, u, tall: S.tall, wide: S.wide, T, g, t: info.t, fi: Math.floor(info.t * 8), tex: look.texture, change: info.change || 0.45,
      gr: T.ink, stain: T.stain, accRGB: acc,
      ink: (a) => `rgba(${T.ink},${a})`, acc: (a) => hexA(S.accent, a),
    };
  }
  // Composite the pencil layer onto the page with the paper's tooth breaking the lines.
  function flush(ctx, F, clip) {
    const g = F.g;
    if (F.tex > 0) {
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "destination-out";
      g.globalAlpha = 0.5 * F.tex; g.fillStyle = g.createPattern(tiles.tooth, "repeat"); g.fillRect(0, 0, F.W, F.H); g.restore();
    }
    ctx.save();
    if (clip) clip(ctx);
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, F.W, F.H);
  }

  // ---- the eraser: scene changes -----------------------------------------------------------------------
  const edgeX = (F, y, k) => lerp(-0.1 * F.H - 40 * F.u, F.W + 0.1 * F.H + 40 * F.u, 0.5 - 0.5 * Math.cos(Math.PI * clamp(k))) + (y - F.H / 2) * 0.2 + Math.sin(y * 0.05) * 10 * F.u + Math.sin(y * 0.17) * 4 * F.u;
  function clipSide(F, k, side) {
    return (ctx) => {
      ctx.beginPath();
      const step = 24 * F.u;
      for (let y = -24 * F.u, i = 0; y <= F.H + 24 * F.u + step; y += step, i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, edgeX(F, y, k), y);
      const far = side === "right" ? F.W * 2 : -F.W;
      ctx.lineTo(far, F.H + 60 * F.u); ctx.lineTo(far, -60 * F.u); ctx.closePath(); ctx.clip();
    };
  }
  // The eraser block scrubbing up and down along the edge, with its smear of graphite.
  function eraserSprite(F, k) {
    if (k <= 0 || k >= 1) return;
    const { H, u, g } = F, zig = 0.5 + 0.5 * Math.sin(k * TAU * 2.6 - 1.4), yE = H * (0.14 + 0.72 * zig);
    for (let i = 0; i < 16; i++) { const y = (i + 0.5) * (H / 16); smudge(F, edgeX(F, y, k) - 16 * u, y, 62 * u, 0.1 * F.tex + 0.03); }
    const ex = edgeX(F, yE, k), w = 250 * u, h = 118 * u;
    g.save(); g.translate(ex - w * 0.5 + 6 * u, yE); g.rotate(-0.16 + Math.sin(k * 90) * 0.03);
    const body = sub().RR(-w / 2, -h / 2, w, h, 16 * u / F.u * F.u);
    g.fillStyle = F.T.paper; g.beginPath(); body.trace(g); g.fill();
    const pink = sub().RR(-w * 0.1, -h / 2, w * 0.6, h, 16 * u);
    g.fillStyle = F.acc(0.28); g.beginPath(); pink.trace(g); g.fill();
    ink(F, body, { w: 3, a: 0.9, seed: 61 });
    ink(F, sub().M(-w * 0.1, -h / 2).L(-w * 0.1, h / 2).M(-w * 0.18, -h / 2).L(-w * 0.18, h / 2), { w: 2, a: 0.7, passes: 1, seed: 62 });
    hatchFill(F, pink, { q: 1, step: 7, ang: 1.0, col: F.accRGB, a: 0.5, w: 1.6, seed: 63 });
    ink(F, sub().M(-w * 0.45, -h * 0.2).L(-w * 0.3, -h * 0.2).M(-w * 0.45, h * 0.12).L(-w * 0.32, h * 0.12), { w: 2, a: 0.6, passes: 1, seed: 64 });
    g.restore();
  }
  // Rubbings fall from the edge and settle off the bottom of the page.
  function crumbs(F, local, k) {
    const { W, H, u } = F;
    for (let i = 0; i < 34; i++) {
      const ks = hash(i, 71) * 0.92, y0 = H * (0.04 + hash(i, 72) * 0.92);
      const tau = local - ks * F.change;
      if (tau < 0 || tau > 1.6) continue;
      const x = edgeX(F, y0, ks) - 20 * u * hash(i, 73) - 60 * u * tau * hash(i, 74);
      const y = y0 + (380 * u * tau * tau + 40 * u * tau) * (0.6 + hash(i, 75));
      const a = 0.7 * (1 - span(tau, 1.0, 1.6)), ang = hash(i, 76) * TAU + tau * (3 + hash(i, 77) * 6);
      ink(F, sub().M(x, y).L(x + Math.cos(ang) * (4 + hash(i, 78) * 6) * u, y + Math.sin(ang) * (4 + hash(i, 78) * 6) * u), { w: 3.4, a, passes: 1, amp: 0, seed: i });
    }
  }

  // ---- chart: a row of standing pencils, each one as tall as its figure ------------------------------------
  function pencilBar(F, cx, base, bw, H, q, seed, hot, T, idx) {
    const u = F.u, tipH = bw * 1.05, y0 = base - H, yb = y0 + tipH, L = cx - bw / 2, R = cx + bw / 2, f1 = L + bw * 0.28, f2 = R - bw * 0.28;
    const outline = sub().M(L, base).L(L, yb).L(cx, y0).L(R, yb).L(R, base);
    ink(F, outline, { q: span(q, 0, 0.55), seed, w: 2.6 });
    const scallop = sub().M(L, yb);
    for (let k = 0; k < 3; k++) scallop.Q(L + bw * (k + 0.5) / 3, yb - tipH * 0.16, L + (bw * (k + 1)) / 3, yb);
    ink(F, scallop, { q: span(q, 0.15, 0.6), seed: seed + 1, w: 2.2 });
    ink(F, sub().M(f1, yb).L(f1, base).M(f2, yb).L(f2, base), { q: span(q, 0.2, 0.65), seed: seed + 2, w: 1.8, a: 0.75 });
    const hq = span(q, 0.4, 1);
    if (hq > 0) {
      const lf = sub().poly([[L, yb], [f1, yb], [f1, base], [L, base]], true), rf = sub().poly([[f2, yb], [R, yb], [R, base], [f2, base]], true), cf = sub().poly([[f1, yb], [f2, yb], [f2, base], [f1, base]], true);
      const cone = sub().poly([[L, yb], [cx, y0], [R, yb]], true), lead = sub().poly([[cx, y0], [cx - bw * 0.15, y0 + tipH * 0.34], [cx + bw * 0.15, y0 + tipH * 0.34]], true);
      if (hot) { hatchFill(F, cf, { q: hq, step: 6, ang: 0.9, col: F.accRGB, a: 0.5, w: 1.7, seed: seed + 3 }); hatchFill(F, lf, { q: hq, step: 4, ang: 0.9, col: F.accRGB, a: 0.7, w: 1.7, seed: seed + 4 }); hatchFill(F, rf, { q: hq, step: 5, ang: 0.9, col: F.accRGB, a: 0.6, w: 1.7, seed: seed + 5 }); }
      else { hatchFill(F, lf, { q: hq, step: 4.5, ang: 0.9, a: 0.5, seed: seed + 3 }); hatchFill(F, rf, { q: hq, step: 8, ang: 0.9, a: 0.4, seed: seed + 4 }); hatchFill(F, cf, { q: hq, step: 14, ang: 0.9, a: 0.18, seed: seed + 5 }); }
      // Rubbed tone: the round barrel turns away from the light on its right side.
      const barrel = sub().poly([[L, yb], [R, yb], [R, base], [L, base]], true);
      tone(F, barrel, (hot ? 0.3 : 0.4) * hq, { ang: 0.12, col: hot ? F.accRGB : F.gr });
      tone(F, rf, 0.3 * hq, { ang: 0 });
      tone(F, cone, 0.32 * hq, { ang: 0.4 });
      hatchFill(F, cone, { q: hq, step: 7, ang: -0.8, a: 0.3, seed: seed + 6 });
      hatchFill(F, lead, { q: hq, step: 2.4, ang: 0.4, a: 0.85, w: 1.3, seed: seed + 7 });
      ink(F, sub().poly([[cx, y0], [cx - bw * 0.15, y0 + tipH * 0.34], [cx + bw * 0.15, y0 + tipH * 0.34]], true), { q: hq, seed: seed + 8, w: 2 });
      // A little shadow where the pencil stands.
      cast(F, cx + bw * 0.5, base - 2 * u, bw * 1.3, 0.3 * hq);
      glint(F, cx + bw * 0.05, y0 + tipH * 0.15, 20 * u, Math.max(0, Math.sin(T * 3.1 + idx * 1.7)) ** 3 * hq, hot ? F.accRGB : F.gr);
    }
  }
  function drawChart(F, a, p, d, T) {
    const { u, tall } = F, n = d.values.length, maxv = Math.max(...d.values, 1);
    const rightW = tall ? 0 : 330 * u, x0 = a.x + 20 * u, cw = a.w - rightW - 40 * u;
    const base = a.y + a.h - (tall ? 100 : 86) * u, top = a.y + (tall ? 200 : 190) * u, Hf = base - top;
    const slot = cw / n, bw = Math.min(slot * 0.5, 150 * u);
    // Guide lines first: levels, a baseline and a centre line through every pencil.
    for (let k = 1; k <= 4; k++) {
      const y = base - (Hf * k) / 4, q = span(p, 0.02 * k, 0.3 + 0.02 * k);
      ink(F, sub().M(x0 - 18 * u, y).L(x0 + cw, y), { q, a: 0.2, w: 1.2, passes: 1, amp: 0.6, seed: 20 + k, dash: [16, 11], off: -T * 14 });
    }
    ink(F, sub().M(x0 - 26 * u, base).L(x0 + cw + 20 * u, base), { q: span(p, 0, 0.3), w: 3.2, a: 0.9, seed: 31 });
    ink(F, sub().M(x0 - 26 * u, base + 12 * u).L(x0 + cw * 0.9, base + 12 * u), { q: span(p, 0.05, 0.35), w: 1.2, a: 0.3, passes: 1, seed: 32 });
    const tips = [];
    d.values.forEach((v, i) => {
      const cx = x0 + slot * (i + 0.5), s0 = 0.08 + i * 0.12, qi = span(p, s0, s0 + 0.5), hot = i === d.highlight;
      const H = Hf * (0.2 + 0.8 * (v / maxv)) * ease(qi), apex = base - H;
      guide(F, cx, base + 14 * u, cx, base - Hf - 30 * u, span(p, s0 - 0.04, s0 + 0.2), 0.22, { seed: 40 + i });
      guide(F, cx - bw * 0.8, apex, cx + bw * 0.8, apex, span(p, s0, s0 + 0.2), 0.2, { seed: 50 + i });
      pencilBar(F, cx, base, bw, H, qi, 100 + i * 17, hot, T, i);
      tips.push([cx, apex]);
      if (qi > 0.05) {
        const size = (hot ? 100 : 76) * u, txt = fmt(v * ease(qi), 0, d.prefix, d.suffix);
        const wv = say(F, txt, cx, apex - 24 * u, size, { align: "center", color: hot ? F.acc(1) : F.ink(0.95), q: span(qi, 0.2, 0.7), maxW: slot * 0.96, min: 50 * u });
        if (hot && qi > 0.55) {
          const hw = Math.max(wv * 0.62, 90 * u), ccx = cx, ccy = apex - 24 * u - size * 0.34, k = span(qi, 0.55, 1);
          ink(F, sub().OV(ccx, ccy, hw, size * 0.72, -0.04, Math.PI * 0.9).OV(ccx + 4 * u, ccy - 3 * u, hw * 0.97, size * 0.7, -0.03, Math.PI * 0.95), { q: k, col: F.accRGB, w: 3.4, a: 0.9, seed: 70 + i });
          for (let r = 0; r < 3; r++) {
            const ang = -Math.PI / 2 + (r - 1) * 0.75, pulse = 0.5 + 0.5 * Math.sin(T * 4 - r * 0.7), r0 = hw * 0.98 + 12 * u, r1 = r0 + (14 + 16 * pulse) * u;
            ink(F, sub().M(ccx + Math.cos(ang) * r0 * 0.96, ccy + Math.sin(ang) * size * 0.78 + 4 * u).L(ccx + Math.cos(ang) * r1, ccy + Math.sin(ang) * (size * 0.72 + (r1 - r0)) ), { q: k, col: F.accRGB, w: 3, a: 0.85, passes: 1, seed: 80 + r });
          }
        }
        say(F, d.labels[i] || "", cx, base + 66 * u, 48 * u, { align: "center", color: hot ? F.acc(1) : F.ink(0.85), q: span(qi, 0.3, 0.8), maxW: slot * 0.96, min: 42 * u });
        if (hot) ink(F, sub().M(cx - slot * 0.3, base + 80 * u).Q(cx, base + 90 * u, cx + slot * 0.3, base + 78 * u), { q: span(qi, 0.6, 1), col: F.accRGB, w: 3.2, a: 0.9, seed: 90 });
      }
    });
    // A dashed run through the tips: it marches forward, and a bead travels along it.
    if (n > 1) {
      const rise = (tall ? 150 : 150) * u, pts = tips.map(([x, y]) => [x, Math.max(a.y + 30 * u, y - rise)]);
      const tr = sub().M(pts[0][0] - slot * 0.25, pts[0][1] + 24 * u);
      pts.forEach(([x, y], i) => { const [px, py] = i ? pts[i - 1] : [pts[0][0] - slot * 0.25, pts[0][1] + 24 * u]; tr.Q((px + x) / 2, py * 0.35 + y * 0.65 - 24 * u, x, y); });
      const tq = span(p, 0.7, 1);
      ink(F, tr, { q: tq, w: 2.6, a: 0.75, seed: 95, dash: [20, 14], off: -T * 46, passes: 1 });
      if (tq > 0.97) {
        const [ex, ey, ang] = tr.at(1), g = F.g;
        ink(F, sub().M(ex - Math.cos(ang - 0.5) * 30 * u, ey - Math.sin(ang - 0.5) * 30 * u).L(ex, ey).L(ex - Math.cos(ang + 0.5) * 30 * u, ey - Math.sin(ang + 0.5) * 30 * u), { w: 3.2, a: 0.85, seed: 96 });
        const [bx, by] = tr.at((T * 0.32) % 1);
        g.save(); g.fillStyle = F.acc(0.9); g.beginPath(); g.arc(bx, by, 9 * u, 0, TAU); g.fill(); g.restore();
        ink(F, sub().O(bx, by, 17 * u + 4 * u * Math.sin(T * 6)), { w: 1.6, a: 0.5, col: F.accRGB, passes: 1, seed: 97 });
      }
    }
    if (!tall) {
      const xr = a.x + a.w - 310 * u, nq = span(p, 0.45, 0.95), sway = Math.sin(T * 1.9) * 0.03;
      // A sticky note with the standout figure.
      const hot = Math.min(Math.max(0, d.highlight), n - 1), g = F.g, nw = 270 * u, nh = 290 * u, ncx = xr + 155 * u, ncy = a.y + a.h * 0.32;
      g.save(); g.translate(ncx, ncy); g.rotate(-0.06 + sway);
      note(F, -nw / 2, -nh / 2, nw, nh, nq, 120, false);
      hatchFill(F, sub().R(-nw / 2, -nh / 2, nw, nh * 0.2), { q: nq, step: 6, ang: -0.9, col: F.accRGB, a: 0.45, w: 1.6, seed: 121 });
      if (nq > 0.4) {
        say(F, d.labels[hot] || "", 0, -nh * 0.1, 50 * u, { align: "center", q: span(nq, 0.4, 0.8), maxW: nw * 0.86, min: 42 * u });
        say(F, fmt(d.values[hot] * ease(nq), 0, d.prefix, d.suffix), 0, nh * 0.26, 112 * u, { align: "center", color: F.acc(1), q: span(nq, 0.5, 0.9), maxW: nw * 0.86, min: 70 * u });
      }
      ink(F, sub().M(-nw * 0.2, -nh / 2 - 14 * u).L(nw * 0.2, -nh / 2 + 6 * u).L(nw * 0.2 + 8 * u, -nh / 2 - 22 * u).Z(), { q: nq, w: 1.6, a: 0.6, seed: 122, passes: 1 });
      g.restore();
      // A spare pencil lying on the desk line, rocking a little, with shavings curling off its fresh tip.
      const lx = xr + 20 * u, ly = base - 20 * u, qs = span(p, 0.45, 0.95), rock = Math.sin(T * 1.7) * 0.03;
      cast(F, lx + 140 * u, base - 2 * u, 170 * u, 0.26 * qs);
      pencil(F, lx, ly, 250 * u, rock, qs, 130, { r: 15 });
      if (qs > 0.8) for (let k = 0; k < 3; k++) {
        const ph = (T * 0.35 + k / 3) % 1, x = lx - 30 * u - ph * 70 * u - k * 8 * u, y = ly - 30 * u + ph * 26 * u, al = Math.sin(ph * Math.PI);
        const cur = sub(), rot = ph * TAU + k * 2;
        for (let i = 0; i <= 28; i++) { const t2 = i / 28, aa = t2 * 2.4 * TAU, r = (2 + 12 * t2) * u; (i ? cur.L : cur.M).call(cur, x + Math.cos(aa + rot) * r, y + Math.sin(aa + rot) * r * 0.55); }
        ink(F, cur, { w: 2, a: 0.75 * al, passes: 1, amp: 0.3, seed: 140 + k });
      }
    }
  }

  // ---- chart, second construction: a pie drawn with a drafting compass ------------------------------------------
  function compass(F, cx, cy, px, py, q, seed) {
    if (q <= 0) return;
    const u = F.u, mx = (cx + px) / 2, my = (cy + py) / 2, d = Math.hypot(px - cx, py - cy) || 1;
    const hx = mx, hy = Math.min(cy, py) - d * 0.5 - 40 * u, lw = 22 * u;
    const leg = (x1, y1, x2, y2, s2) => {
      const ang = Math.atan2(y2 - y1, x2 - x1), nx = -Math.sin(ang), ny = Math.cos(ang);
      const P = sub().poly([[x1 + nx * lw * 0.5, y1 + ny * lw * 0.5], [x2 + nx * lw * 0.16, y2 + ny * lw * 0.16], [x2 - nx * lw * 0.16, y2 - ny * lw * 0.16], [x1 - nx * lw * 0.5, y1 - ny * lw * 0.5]], true);
      shape(F, P, { q, seed: s2, w: 2.4, hatch: { step: 5, ang: 0.9, a: 0.34 } });
    };
    // Needle leg to the centre, pencil leg to the rim.
    leg(hx, hy, cx, cy - 14 * u, seed);
    ink(F, sub().M(cx, cy - 16 * u).L(cx, cy), { q, w: 2.4, a: 0.9, seed: seed + 1, passes: 1 });
    leg(hx, hy, px, py - 30 * u, seed + 2);
    const tip = sub().poly([[px - 9 * u, py - 32 * u], [px + 9 * u, py - 32 * u], [px, py]], true);
    shape(F, tip, { q, seed: seed + 3, w: 2, hatch: { step: 2.6, ang: 0.4, a: 0.8 }, ghost: false });
    const knob = sub().RR(hx - 13 * u, hy - 58 * u, 26 * u, 44 * u, 8 * u), hinge = sub().O(hx, hy, 17 * u);
    shape(F, knob, { q, seed: seed + 4, w: 2.4, hatch: { step: 4, ang: 0.3, a: 0.5 }, ghost: false });
    shape(F, hinge, { q, seed: seed + 5, w: 2.6, tint: { step: 4.5, a: 0.6 }, ghost: false });
  }
  function drawPie(F, a, p, d, T) {
    const { u, tall } = F, g = F.g, n = d.values.length, tot = d.values.reduce((x, y) => x + Math.max(0, y), 0) || 1, hot = Math.min(n - 1, Math.max(0, d.highlight));
    const R = tall ? Math.min(a.w * 0.26, a.h * 0.22) : Math.min(a.h * 0.4, a.w * 0.22);
    const cx = tall ? a.x + a.w / 2 : a.x + a.w * 0.37, cy = tall ? a.y + R + 130 * u : a.y + a.h * 0.53;
    // Construction: crosshairs and a light guide circle before anything firm.
    guide(F, cx - R * 1.25, cy, cx + R * 1.25, cy, span(p, 0, 0.18), 0.2, { seed: 1500, dash: [22, 8, 4, 8] });
    guide(F, cx, cy - R * 1.25, cx, cy + R * 1.25, span(p, 0.02, 0.2), 0.2, { seed: 1501, dash: [22, 8, 4, 8] });
    guideCircle(F, cx, cy, R * 1.08, span(p, 0, 0.25), 0.16, 1502);
    // The compass swings once round to draw the rim, then keeps idly re-tracing it.
    const draw = ease(span(p, 0, 0.32)), ang0 = -Math.PI / 2, phi = draw < 1 ? ang0 + draw * TAU : ang0 + TAU + (T - 0) * 0.55;
    const rim = sub().O(cx, cy, R, ang0).O(cx + 2 * u, cy - 1 * u, R * 0.995, ang0);
    ink(F, rim, { q: draw, w: 3, a: 0.9, seed: 1503 });
    if (draw >= 1) ink(F, sub().A(cx, cy, R * 1.006, phi - 0.9, phi, true), { w: 1.4, a: 0.35, passes: 1, seed: 1504 });
    // Slices: each hatched to its own value of grey; the highlighted one is red and eased out of the pie.
    let at = ang0;
    const mids = [];
    d.values.forEach((v, i) => {
      const sw = (Math.max(0, v) / tot) * TAU, m = at + sw / 2, isHot = i === hot, qi = span(p, 0.18 + i * 0.06, 0.55 + i * 0.06);
      const pop = isHot ? (16 + 7 * Math.sin(T * 2.2)) * u * ease(span(qi, 0.5, 1)) : 0, ox = Math.cos(m) * pop, oy = Math.sin(m) * pop;
      const P = sub().M(cx + ox, cy + oy).E(cx + ox, cy + oy, R, R, at, at + sw).Z();
      if (qi > 0) {
        if (isHot && qi > 0.3) { g.save(); g.globalAlpha *= span(qi, 0.3, 0.6); g.fillStyle = F.T.paper; g.beginPath(); P.trace(g); g.fill(); g.restore(); }
        const steps = [5, 8, 12, 16, 20];
        shape(F, P, { q: qi, seed: 1510 + i * 7, w: isHot ? 3 : 2.4, col: isHot ? F.accRGB : F.gr, ghost: false,
          hatch: isHot ? null : { step: steps[i % steps.length], ang: 0.4 + i * 0.5, a: 0.42, toneAng: m },
          tint: isHot ? { step: 5, ang: m + 1.2, a: 0.55 } : null });
        if (isHot && qi > 0.9) cast(F, cx + ox + Math.cos(m) * R * 0.5, cy + oy + Math.sin(m) * R * 0.5 + 12 * u, R * 0.35, 0.12);
      }
      mids.push([m, pop, qi]);
      at += sw;
    });
    compass(F, cx, cy, cx + Math.cos(phi) * R, cy + Math.sin(phi) * R, span(p, 0, 0.12) > 0 ? Math.min(1, span(p, 0, 0.12) * 1.5) : 0, 1530);
    // Labels outside each slice on marching leaders.
    mids.forEach(([m, pop, qi], i) => {
      const lq = span(qi, 0.4, 1);
      if (lq <= 0) return;
      const isHot = i === hot, r0 = R * 0.82 + pop, r1 = R + 44 * u + pop, ex = cx + Math.cos(m) * r1, ey = cy + Math.sin(m) * r1, right = Math.cos(m) >= 0;
      ink(F, sub().M(cx + Math.cos(m) * r0, cy + Math.sin(m) * r0).L(ex, ey).L(ex + (right ? 30 : -30) * u, ey), { q: lq, w: 2, a: 0.75, col: isHot ? F.accRGB : F.gr, dash: [9, 7], off: -T * 22, passes: 1, seed: 1540 + i });
      const tx = ex + (right ? 40 : -40) * u, al = right ? "left" : "right", col = isHot ? F.acc(1) : F.ink(0.92);
      say(F, fmt(d.values[i] * ease(lq), 0, d.prefix, d.suffix), tx, ey - 2 * u, isHot ? 74 * u : 62 * u, { align: al, color: col, q: span(lq, 0, 0.5) });
      say(F, d.labels[i] || "", tx, ey + 48 * u, 44 * u, { align: al, color: col, q: span(lq, 0.3, 1), maxW: 260 * u, min: 42 * u });
    });
    // An index card with the standout share, clipped to the page.
    const cq = span(p, 0.5, 0.95), cw = tall ? a.w * 0.62 : 330 * u, chh = 330 * u;
    const kx = tall ? a.x + a.w / 2 : a.x + a.w - cw / 2 - 10 * u, ky = tall ? cy + R + 230 * u + chh / 2 : a.y + a.h * 0.45;
    if (cq > 0) {
      g.save(); g.translate(kx, ky); g.rotate(0.04 + Math.sin(T * 1.6) * 0.015);
      const card = sub().R(-cw / 2, -chh / 2, cw, chh);
      cast(F, 0, chh / 2 - 6 * u, cw * 0.55, 0.2 * cq);
      g.save(); g.fillStyle = F.T.paper; g.globalAlpha = cq; g.beginPath(); card.trace(g); g.fill(); g.restore();
      shape(F, card, { q: cq, seed: 1560, w: 2.4, hatch: { step: 16, ang: -0.4, a: 0.08 } });
      ink(F, sub().M(-cw / 2, -chh / 2 + 70 * u).L(cw / 2, -chh / 2 + 70 * u), { q: span(cq, 0.2, 0.7), w: 2, col: F.accRGB, a: 0.7, passes: 1, seed: 1561 });
      for (let k = 1; k < 4; k++) ink(F, sub().M(-cw / 2 + 8 * u, -chh / 2 + 70 * u + k * 64 * u).L(cw / 2 - 8 * u, -chh / 2 + 70 * u + k * 64 * u), { q: span(cq, 0.2, 0.8), w: 1.2, a: 0.22, passes: 1, seed: 1562 + k, pressure: 0 });
      // A paperclip over the top edge.
      ink(F, sub().M(cw * 0.22, -chh / 2 + 60 * u).L(cw * 0.22, -chh / 2 - 26 * u).A(cw * 0.22 + 14 * u, -chh / 2 - 26 * u, 14 * u, Math.PI, TAU).L(cw * 0.22 + 28 * u, -chh / 2 + 44 * u).A(cw * 0.22 + 18 * u, -chh / 2 + 44 * u, 10 * u, 0, Math.PI).L(cw * 0.22 + 8 * u, -chh / 2 - 8 * u), { q: span(cq, 0.4, 1), w: 2.6, a: 0.85, seed: 1567 });
      say(F, d.labels[hot] || "", 0, -chh / 2 + 54 * u, 50 * u, { align: "center", q: span(cq, 0.3, 0.7), maxW: cw * 0.8, min: 42 * u });
      say(F, fmt(d.values[hot] * ease(cq), 0, d.prefix, d.suffix), 0, -chh / 2 + 190 * u, 120 * u, { align: "center", color: F.acc(1), q: span(cq, 0.4, 0.8), min: 96 * u });
      say(F, Math.round((d.values[hot] / tot) * 100 * ease(cq)) + "%", 0, chh / 2 - 40 * u, 64 * u, { align: "center", color: F.ink(0.8), q: span(cq, 0.55, 1) });
      g.restore();
    }
    // A pencil and a rubber resting below the card, the rubber wearing down a crumb at a time.
    {
      const pq = span(p, 0.4, 0.9), by = tall ? ky + chh / 2 + 200 * u : a.y + a.h - 20 * u, px = tall ? kx - 200 * u : kx - cw / 2 - 10 * u;
      cast(F, px + 150 * u, by + 4 * u, 170 * u, 0.24 * pq);
      pencil(F, px, by - 14 * u, 250 * u, -0.05 + Math.sin(T * 1.4) * 0.02, pq, 1570, { r: 14, tint: true });
      const rx = kx + cw * 0.1, ry = by - 90 * u, rub = sub().RR(rx, ry, 120 * u, 56 * u, 10 * u);
      cast(F, rx + 60 * u, ry + 56 * u, 80 * u, 0.24 * pq);
      shape(F, rub, { q: pq, seed: 1575, w: 2.4, hatch: { step: 6, ang: 0.6, a: 0.25 } });
      ink(F, sub().M(rx + 40 * u, ry).L(rx + 40 * u, ry + 56 * u), { q: span(pq, 0.5, 1), w: 1.6, a: 0.6, passes: 1, seed: 1576 });
      for (let k = 0; k < 4; k++) { const ph = (T * 0.5 + k / 4) % 1, x = rx - 14 * u - ph * 40 * u - k * 6 * u, y = ry + 50 * u - Math.sin(ph * Math.PI) * 18 * u; if (pq > 0.9) ink(F, sub().M(x, y).L(x + 7 * u, y + 2 * u), { w: 3.2, a: 0.6 * (1 - ph), passes: 1, amp: 0, seed: 1577 + k }); }
    }
  }

  // ---- object: a device with a moving timeline and numbered parts ----------------------------------------------
  function drawObject(F, a, p, d, T) {
    const { u, tall } = F, phone = d.kind === "phone", g = F.g;
    const DW = phone ? 260 : 640, DH = phone ? 520 : 426;
    const bw = tall ? a.w : a.w * 0.6, bh = tall ? a.h * 0.56 : a.h * 0.9;
    const sc = Math.min(bw / (DW + 80), bh / (DH + 30)), ox = a.x + (bw - DW * sc) / 2 + (tall ? 0 : 20 * u), oy = a.y + (bh - DH * sc) / 2 + (tall ? 0 : 6 * u);
    const D = () => sub(ox, oy, sc), SW = (x) => ox + x * sc, SH = (y) => oy + y * sc;
    const S = phone ? { x: 12, y: 14, w: 236, h: 492 } : { x: 20, y: 22, w: 600, h: 356 };
    const deskY = SH(DH) + 6 * u;
    // Construction: a bounding box, centre lines and a perspective fan under the desk line.
    guide(F, SW(0), SH(0), SW(DW), SH(0), span(p, 0, 0.2), 0.2, { seed: 201 });
    guide(F, SW(DW / 2), SH(-30), SW(DW / 2), SH(DH + 30), span(p, 0.02, 0.24), 0.2, { seed: 202, dash: [22, 8, 4, 8] });
    guide(F, SW(-60), SH(DH * 0.5), SW(DW + 60), SH(DH * 0.5), span(p, 0.04, 0.26), 0.2, { seed: 203, dash: [22, 8, 4, 8] });
    for (let k = -3; k <= 3; k++) guide(F, a.x + a.w * 0.3 + k * 130 * u, deskY, a.x + a.w * 0.3 + k * 330 * u, a.y + a.h, span(p, 0.05, 0.4), 0.12, { seed: 210 + k, over: 0 });
    ink(F, sub().M(a.x - 20 * u, deskY).L(a.x + a.w + 20 * u, deskY), { q: span(p, 0, 0.3), w: 3, a: 0.85, seed: 220 });
    // Device body.
    const lid = phone ? D().RR(0, 0, 260, 520, 36) : D().RR(0, 0, 640, 400, 14);
    const scr = phone ? D().RR(S.x, S.y, S.w, S.h, 26) : D().RR(S.x, S.y, S.w, S.h, 4);
    const bq = span(p, 0.02, 0.42);
    shape(F, lid, { q: bq, seed: 230, w: 3.2, hatch: { step: 8, ang: 0.8, a: 0.34 } });
    if (bq > 0.5) knock(F, scr);
    ink(F, scr, { q: span(p, 0.15, 0.5), seed: 231, w: 2 });
    if (!phone) {
      const baseP = D().poly([[-20, 400], [660, 400], [652, 426], [-12, 426]], true);
      shape(F, baseP, { q: span(p, 0.18, 0.5), seed: 232, w: 3, hatch: { step: 6, ang: 0.8, a: 0.4 } });
      ink(F, D().poly([[270, 426], [282, 418], [358, 418], [370, 426]]).O(320, 11, 4), { q: span(p, 0.3, 0.55), seed: 233, w: 1.8 });
    } else ink(F, D().RR(104, 24, 52, 14, 7), { q: span(p, 0.25, 0.5), seed: 233, w: 2 });
    cast(F, SW(DW / 2), deskY - 4 * u, DW * sc * 0.62, 0.32 * span(p, 0.1, 0.5));
    if (!phone) tone(F, D().poly([[0, 0], [640, 0], [640, 400], [0, 400]], true), 0.1 * span(p, 0.2, 0.6), { ang: 0.9 });
    // Screen content: a sketched preview, three sliders and a timeline under a moving playhead.
    const cq = span(p, 0.34, 0.8);
    const pv = phone ? { x: S.x + 18, y: S.y + 34, w: S.w - 36, h: 220 } : { x: S.x + 24, y: S.y + 22, w: 360, h: 200 };
    if (cq > 0) {
      const frame = D().R(pv.x, pv.y, pv.w, pv.h);
      shape(F, frame, { q: span(cq, 0, 0.5), seed: 240, w: 2, tint: { step: 9, ang: -0.9, a: 0.16 } });
      const sunX = pv.x + pv.w * 0.74, sunY = pv.y + pv.h * 0.3;
      ink(F, D().O(sunX, sunY, 24), { q: span(cq, 0.2, 0.6), seed: 241, w: 2, col: F.accRGB });
      for (let k = 0; k < 8; k++) { const ang = (k / 8) * TAU + T * 0.7, r0 = 32 + 3 * Math.sin(T * 4 + k), r1 = r0 + 12 + 6 * Math.sin(T * 3 + k * 2); ink(F, D().M(sunX + Math.cos(ang) * r0, sunY + Math.sin(ang) * r0).L(sunX + Math.cos(ang) * r1, sunY + Math.sin(ang) * r1), { q: span(cq, 0.3, 0.7), seed: 242 + k, w: 1.8, a: 0.8, passes: 1, col: F.accRGB }); }
      const hills = D().poly([[pv.x, pv.y + pv.h * 0.78], [pv.x + pv.w * 0.2, pv.y + pv.h * 0.5], [pv.x + pv.w * 0.36, pv.y + pv.h * 0.7], [pv.x + pv.w * 0.52, pv.y + pv.h * 0.4], [pv.x + pv.w * 0.78, pv.y + pv.h * 0.74], [pv.x + pv.w, pv.y + pv.h * 0.6]]);
      ink(F, hills, { q: span(cq, 0.25, 0.65), seed: 250, w: 2.2 });
      hatchFill(F, D().poly([[pv.x, pv.y + pv.h], [pv.x, pv.y + pv.h * 0.78], [pv.x + pv.w * 0.2, pv.y + pv.h * 0.5], [pv.x + pv.w * 0.36, pv.y + pv.h * 0.7], [pv.x + pv.w * 0.52, pv.y + pv.h * 0.4], [pv.x + pv.w * 0.78, pv.y + pv.h * 0.74], [pv.x + pv.w, pv.y + pv.h * 0.6], [pv.x + pv.w, pv.y + pv.h]], true), { q: span(cq, 0.4, 1), step: 6, ang: 0.9, a: 0.4, seed: 251 });
      const bx = pv.x + ((T * 40) % (pv.w + 60)) - 30;
      bird(F, SW(bx), SH(pv.y + pv.h * 0.2 + Math.sin(T * 2) * 8), 9 * u * sc * 2, Math.sin(T * 9), 260);
      if (!phone) {
        for (let r = 0; r < 3; r++) {
          const y = S.y + 46 + r * 52, x1 = S.x + 410, x2 = S.x + 576, kn = 0.5 + 0.38 * Math.sin(T * 1.2 + r * 2.1);
          ink(F, D().M(x1, y).L(x2, y), { q: span(cq, 0.3 + r * 0.08, 0.7), seed: 270 + r, w: 2, a: 0.8, passes: 1 });
          ink(F, D().M(x1, y - 20).L(x1 + 50 + r * 12, y - 20), { q: span(cq, 0.3 + r * 0.08, 0.7), seed: 275 + r, w: 1.5, a: 0.5, passes: 1 });
          if (cq > 0.5) { const kx = lerp(x1, x2, kn); shape(F, D().O(kx, y, 11), { q: 1, seed: 280 + r, w: 2, tint: r === 1 ? { step: 5, a: 0.6 } : null }); ink(F, D().M(x1, y).L(kx, y), { w: 4.5, a: 0.6, passes: 1, seed: 290 + r, col: r === 1 ? F.accRGB : F.gr }); }
        }
      }
    }
    // Timeline.
    const tq = span(p, 0.5, 0.92), ty0 = phone ? S.y + 290 : S.y + 244, th = phone ? 36 : 26, tgap = phone ? 14 : 10;
    const clips = [[[0.07, 0.28], [0.4, 0.2]], [[0.04, 0.18], [0.25, 0.34], [0.65, 0.28]], [[0.04, 0.43], [0.5, 0.46]]];
    if (tq > 0) {
      const ph = (T * 0.2) % 1, plx = S.x + S.w * (0.05 + 0.9 * ph);
      clips.forEach((row, ti) => row.forEach(([cx0, cw0], ci) => {
        const q = span(tq, ti * 0.12 + ci * 0.1, ti * 0.12 + ci * 0.1 + 0.4);
        if (q <= 0) return;
        const x = S.x + S.w * cx0, w = S.w * cw0, y = ty0 + ti * (th + tgap), hotClip = ti === 0 && ci === 1, under = plx > x && plx < x + w;
        const c = D().RR(x, y, w * q, th, 4);
        shape(F, c, { q: 1, seed: 300 + ti * 10 + ci, w: 1.9, tint: hotClip ? { step: 5, a: 0.55 } : null, hatch: hotClip ? null : { step: under ? 5 : 8, ang: 0.8, a: under ? 0.45 : 0.28 } });
        if (hotClip && q > 0.9) ink(F, D().RR(x - 5, y - 5, w + 10, th + 10, 7), { w: 2, a: 0.9, col: F.accRGB, dash: [10, 8], off: -T * 30, seed: 330, passes: 1 });
      }));
      ink(F, D().M(plx, ty0 - 12).L(plx, ty0 + 3 * (th + tgap) - tgap + 8), { w: 2.6, a: 0.9, col: F.accRGB, seed: 340, passes: 1 });
      ink(F, D().poly([[plx - 9, ty0 - 22], [plx + 9, ty0 - 22], [plx, ty0 - 8]], true), { w: 2, a: 0.9, col: F.accRGB, seed: 341, passes: 1 });
      // A cursor wandering to the proposed clip and clicking it.
      const wp = [[S.x + S.w * 0.2, ty0 + th * 1.8], [S.x + S.w * 0.5, ty0 + th * 0.6], [S.x + S.w * 0.5, ty0 + th * 0.6], [S.x + S.w * 0.82, ty0 + th * 2.4]];
      const cyc = (T * 0.33) % 1, seg = Math.min(2, Math.floor(cyc * 3)), k = inout(cyc * 3 - seg), cx2 = lerp(wp[seg][0], wp[seg + 1][0], k), cy2 = lerp(wp[seg][1], wp[seg + 1][1], k);
      const cur = [[0, 0], [0, 24], [6, 18], [11, 29], [15, 27], [10, 16], [18, 16]];
      g.save(); g.translate(SW(cx2), SH(cy2)); g.scale(sc * 1.5, sc * 1.5);
      shape(F, sub().poly(cur, true), { q: 1, seed: 350, w: 2 / (sc * 1.5), amp: 0.2, hatch: null });
      g.fillStyle = F.T.paper; g.beginPath(); sub().poly(cur, true).trace(g); g.fill();
      ink(F, sub().poly(cur, true), { w: 2 / (sc * 1.5), seed: 351, amp: 0.2, passes: 1 });
      g.restore();
      const click = span(cyc * 3 - 1, 0.1, 0.5);
      if (cyc > 0.34 && cyc < 0.66) ink(F, D().O(wp[1][0], wp[1][1], 8 + 26 * click), { w: 2, a: 0.8 * (1 - click), col: F.accRGB, seed: 352, passes: 1 });
    }
    // Numbered parts: a ring on each, a leader to its label.
    const anchors = phone
      ? [[pv.x + pv.w * 0.7, pv.y + pv.h * 0.35], [S.x + S.w * 0.5, ty0 + th * 0.5], [S.x + S.w * 0.3, ty0 + 2.5 * th + 2 * tgap]]
      : [[pv.x + pv.w * 0.5, pv.y + pv.h * 0.45], [S.x + S.w * 0.4, ty0 + th * 0.5], [S.x + S.w * 0.28, ty0 + 2.5 * th + 2 * tgap]];
    const labelX = a.x + a.w * 0.7, rowH = Math.min(150 * u, (a.y + a.h - (SH(DH) + 60 * u)) / 3);
    d.callouts.forEach((label, i) => {
      const c = span(p, 0.4 + i * 0.09, 0.66 + i * 0.09);
      if (c <= 0 || !label) return;
      const ax = SW(anchors[i][0]), ay = SH(anchors[i][1]), pulse = 1 + 0.12 * Math.sin(T * 3.5 + i * 2);
      ink(F, sub().OV(ax, ay, 26 * u * pulse, 20 * u * pulse, -0.2).OV(ax + 3 * u, ay - 2 * u, 24 * u * pulse, 19 * u * pulse, -0.15), { q: span(c, 0, 0.35), w: 3, col: F.accRGB, a: 0.9, seed: 360 + i });
      if (tall) {
        const by = SH(DH) + 70 * u + i * rowH + rowH * 0.4;
        g.save(); g.fillStyle = F.acc(0.9); g.beginPath(); g.arc(ax + 30 * u, ay - 28 * u, 0.1, 0, TAU); g.restore();
        const bxc = a.x + 44 * u;
        ink(F, sub().O(bxc, by, 30 * u), { q: span(c, 0.3, 0.7), w: 3, col: F.accRGB, seed: 365 + i });
        say(F, String(i + 1), bxc, by + 13 * u, 40 * u, { align: "center", color: F.acc(1), q: span(c, 0.5, 0.8) });
        say(F, label, bxc + 56 * u, by + 15 * u, 50 * u, { q: span(c, 0.45, 1), maxW: a.w - 120 * u, min: 42 * u });
        ink(F, sub().M(ax, ay + 26 * u).Q(ax + (bxc - ax) * 0.3, by - 10 * u, bxc + 22 * u, by - 36 * u), { q: span(c, 0.2, 0.7), w: 2, col: F.accRGB, a: 0.7, seed: 370 + i, dash: [10, 9], off: -T * 20, passes: 1 });
      } else {
        const ly = a.y + a.h * (0.14 + i * 0.27);
        ink(F, sub().M(ax + 26 * u, ay).Q(ax + (labelX - ax) * 0.5, ay - 10 * u + (ly - ay) * 0.9, labelX - 38 * u, ly), { q: span(c, 0.1, 0.65), w: 2.2, col: F.accRGB, a: 0.85, seed: 370 + i, dash: [14, 8], off: -T * 22 });
        ink(F, sub().O(labelX, ly, 28 * u), { q: span(c, 0.5, 0.85), w: 3, col: F.accRGB, seed: 365 + i });
        say(F, String(i + 1), labelX, ly + 12 * u, 38 * u, { align: "center", color: F.acc(1), q: span(c, 0.6, 0.9) });
        say(F, label, labelX + 46 * u, ly + 14 * u, 50 * u, { q: span(c, 0.55, 1), maxW: a.x + a.w - labelX - 46 * u, min: 42 * u });
        ink(F, sub().M(labelX + 40 * u, ly + 34 * u).Q(labelX + 160 * u, ly + 44 * u, labelX + 300 * u, ly + 32 * u), { q: span(c, 0.7, 1), w: 1.5, a: 0.4, passes: 1, seed: 380 + i });
      }
    });
    // A mug on the desk with steam.
    if (!tall) mug(F, SW(DW) + 70 * u, deskY, 84 * u, 96 * u, span(p, 0.3, 0.7), T, 400, false);
    else mug(F, a.x + a.w - 150 * u, deskY, 84 * u, 96 * u, span(p, 0.3, 0.7), T, 400, false);
    note(F, tall ? a.x + 20 * u : SW(-90), deskY - 74 * u, 70 * u, 74 * u, span(p, 0.35, 0.75), 410, true);
  }

  // ---- people: figures behind a long review table -----------------------------------------------------------
  function limb(F, x1, y1, x2, y2, w, q, seed, hot) {
    const ang = Math.atan2(y2 - y1, x2 - x1), r = w / 2, P = sub();
    P.A(x2, y2, r, ang - Math.PI / 2, ang + Math.PI / 2, true).A(x1, y1, r, ang + Math.PI / 2, ang + Math.PI * 1.5).Z();
    shape(F, P, { q, seed, w: 2.2, hatch: hot ? null : { step: 6, ang: 0.8, a: 0.3 }, tint: hot ? { step: 5, a: 0.5 } : null });
  }
  function person(F, cx, yT, s, i, hot, T, q, blinkNow, seed) {
    const g = F.g, u = F.u, bw = s * 0.5, rx = s * 0.15, ry = s * 0.17, bob = Math.sin(T * 2.1 + i * 1.3) * 2.5 * u;
    const torso = sub().M(cx - bw / 2, yT).L(cx - bw / 2, yT - s * 0.36).Q(cx - bw / 2, yT - s * 0.5, cx - bw * 0.28, yT - s * 0.52 + bob * 0.3).L(cx - bw * 0.1, yT - s * 0.54 + bob * 0.4).L(cx + bw * 0.1, yT - s * 0.54 + bob * 0.4).L(cx + bw * 0.28, yT - s * 0.52 + bob * 0.3).Q(cx + bw / 2, yT - s * 0.5, cx + bw / 2, yT - s * 0.36).L(cx + bw / 2, yT).Z();
    shape(F, torso, { q: span(q, 0, 0.7), seed, w: 2.6, hatch: hot ? null : { step: 7, ang: 0.8, a: 0.34 }, tint: hot ? { step: 5, a: 0.5 } : null });
    if (i % 3 === 0) for (let k = 0; k < 4; k++) ink(F, sub().M(cx - bw / 2, yT - s * (0.08 + k * 0.1)).L(cx + bw / 2, yT - s * (0.08 + k * 0.1)), { q: span(q, 0.5, 1), w: 1.7, a: 0.55, passes: 1, seed: seed + k });
    if (i % 3 === 2) ink(F, sub().R(cx + bw * 0.1, yT - s * 0.28, bw * 0.24, s * 0.12), { q: span(q, 0.5, 1), w: 1.8, a: 0.7, seed: seed + 6 });
    ink(F, sub().M(cx - bw * 0.1, yT - s * 0.54 + bob * 0.4).L(cx, yT - s * 0.43).L(cx + bw * 0.1, yT - s * 0.54 + bob * 0.4), { q: span(q, 0.4, 1), w: 2, a: 0.8, seed: seed + 7, passes: 1 });
    // Head, on a neck, nodding and tilting.
    const hy = yT - s * 0.73 + bob, tilt = Math.sin(T * 1.3 + i * 2) * 0.05 + (hot ? Math.sin(T * 2.5) * 0.03 : 0);
    ink(F, sub().M(cx - rx * 0.4, hy + ry * 0.9).L(cx - rx * 0.4, yT - s * 0.54 + bob * 0.4).M(cx + rx * 0.4, hy + ry * 0.9).L(cx + rx * 0.4, yT - s * 0.54 + bob * 0.4), { q: span(q, 0.3, 0.9), w: 2, a: 0.8, passes: 1, seed: seed + 8 });
    g.save(); g.translate(cx, hy + ry * 0.9); g.rotate(tilt); g.translate(0, -ry * 0.9);
    const head = sub().OV(0, 0, rx, ry);
    shape(F, head, { q: span(q, 0.1, 0.8), seed: seed + 10, w: 2.6, hatch: { step: 12, ang: 0.9, a: 0.14 } });
    const type = i % 5, hq = span(q, 0.4, 1);
    const hairHatch = (P, k = 1) => hatchFill(F, P, { q: hq, step: 3.4, ang: 1.1, a: 0.7 * k, w: 1.3, seed: seed + 30 });
    if (type === 0) {
      const cap = sub().E(0, 0, rx * 1.06, ry * 1.06, Math.PI * 1.02, Math.PI * 1.98, true).L(rx * 0.9, -ry * 0.55).Q(0, -ry * 0.8, -rx * 0.9, -ry * 0.55).Z();
      shape(F, cap, { q: hq, seed: seed + 11, w: 2.2 }); hairHatch(cap);
      const bun = sub().O(0, -ry * 1.28, rx * 0.4); shape(F, bun, { q: hq, seed: seed + 12, w: 2.2 }); hairHatch(bun);
    } else if (type === 1) {
      for (let k = 0; k < 8; k++) { const ang = Math.PI * (1.05 + k * 0.13), c = sub().O(Math.cos(ang) * rx * 1.02, Math.sin(ang) * ry * 1.02, rx * 0.3); shape(F, c, { q: hq, seed: seed + 12 + k, w: 2 }); hairHatch(c, 0.8); }
    } else if (type === 2) {
      const bob2 = sub().M(-rx * 1.06, ry * 0.85).L(-rx * 1.1, -ry * 0.1).E(0, 0, rx * 1.1, ry * 1.1, Math.PI, Math.PI * 2).L(rx * 1.06, ry * 0.85).L(rx * 0.8, ry * 0.85).L(rx * 0.84, -ry * 0.2).Q(0, -ry * 0.9, -rx * 0.84, -ry * 0.2).L(-rx * 0.8, ry * 0.85).Z();
      shape(F, bob2, { q: hq, seed: seed + 11, w: 2.2 }); hairHatch(bob2);
    } else if (type === 3) {
      const dome = sub().E(0, -ry * 0.1, rx * 1.1, ry * 0.95, Math.PI, Math.PI * 2, true).L(rx * 1.7, -ry * 0.12).L(rx * 1.7, -ry * 0.02).L(-rx * 1.1, -ry * 0.02).Z();
      shape(F, dome, { q: hq, seed: seed + 11, w: 2.2, tint: hot ? { a: 0.5, step: 5 } : null }); if (!hot) hairHatch(dome, 0.6);
    } else {
      const sp = sub().M(-rx * 1.04, -ry * 0.2);
      for (let k = 0; k <= 7; k++) { const ang = Math.PI * (1 + k / 7), rr = k % 2 ? 1.5 : 1.06; sp.L(Math.cos(ang) * rx * rr * 1.02, Math.sin(ang) * ry * rr); }
      sp.L(rx * 1.04, -ry * 0.2).Q(0, -ry * 0.6, -rx * 1.04, -ry * 0.2).Z();
      shape(F, sp, { q: hq, seed: seed + 11, w: 2.2 }); hairHatch(sp);
    }
    if (q > 0.55) {
      const bl = blinkNow ? 0.12 : 1, ex = rx * 0.42, ey = -ry * 0.02;
      for (const sx of [-1, 1]) {
        if (bl < 1) ink(F, sub().M(sx * ex - 7 * u, ey).L(sx * ex + 7 * u, ey), { w: 2.6, a: 0.9, passes: 1, seed: seed + 20 + sx });
        else { g.save(); g.fillStyle = F.ink(0.9); g.beginPath(); g.ellipse(sx * ex, ey, 5 * u, 6.5 * u, 0, 0, TAU); g.fill(); g.restore(); }
      }
      if (i % 2 === 1) ink(F, sub().O(-ex, ey, rx * 0.3).O(ex, ey, rx * 0.3).M(-ex + rx * 0.3, ey).L(ex - rx * 0.3, ey), { w: 2, a: 0.8, passes: 1, seed: seed + 24 });
      ink(F, sub().M(0, ry * 0.08).L(-rx * 0.06, ry * 0.3).L(rx * 0.08, ry * 0.32), { w: 1.8, a: 0.6, passes: 1, seed: seed + 25 });
      const smile = hot ? 0.34 : 0.2 + 0.05 * Math.sin(T * 1.7 + i);
      ink(F, sub().M(-rx * 0.38, ry * 0.5).Q(0, ry * (0.5 + smile * 1.6), rx * 0.38, ry * 0.5), { w: 2.4, a: 0.85, passes: 1, seed: seed + 26 });
    }
    g.restore();
    return { hy, ry };
  }
  // Seats past the named badges get their own roles, never a repeat of one already at the table.
  const SPARE_ROLES = ["Client", "Producer", "Reviewer", "Writer", "Sound"];
  function roleOf(badges, i) {
    const named = badges.filter(Boolean);
    if (i < named.length) return named[i];
    const spare = SPARE_ROLES.filter((r) => !named.some((n) => n.toLowerCase() === r.toLowerCase()));
    return spare[(i - named.length) % spare.length];
  }
  function drawPeople(F, a, p, d, T) {
    const { u, tall } = F, g = F.g, n = Math.max(2, Math.min(6, Math.round(d.count))), rows = tall && n > 2 ? 2 : 1, hotI = Math.min(n - 1, d.highlight);
    for (let row = 0; row < rows; row++) {
      const idxs = [];
      for (let i = 0; i < n; i++) if (rows === 1 || i % 2 === row) idxs.push(i);
      const ra = { x: a.x, y: a.y + (row * a.h) / rows, w: a.w, h: a.h / rows };
      const yT = ra.y + ra.h - (tall ? 118 : 150) * u, slot = ra.w / idxs.length;
      const s = Math.min((yT - ra.y - 112 * u) / 0.92, slot * 1.12, 440 * u), x0 = ra.x + 10 * u, x1 = ra.x + ra.w - 10 * u;
      const tq = span(p, 0.04 + row * 0.1, 0.4 + row * 0.1);
      guide(F, x0 - 30 * u, yT - s * 0.9, x1 + 30 * u, yT - s * 0.9, span(p, 0, 0.25), 0.18, { seed: 500 + row, dash: [24, 10] });
      guide(F, x0 - 30 * u, yT - s * 0.5, x1 + 30 * u, yT - s * 0.5, span(p, 0.02, 0.27), 0.14, { seed: 505 + row, dash: [24, 10] });
      // The people.
      idxs.forEach((i, k) => {
        const cx = ra.x + slot * (k + 0.5), s0 = 0.05 + i * 0.06, q = span(p, s0, s0 + 0.42), hot = i === hotI, sz = s * (hot ? 1.06 : 1);
        guide(F, cx, yT + 10 * u, cx, yT - sz * 1.0, span(p, s0 - 0.05, s0 + 0.2), 0.2, { seed: 510 + i });
        if (q <= 0) return;
        const blink = (T * 0.42 + hash(i, 3)) % 1 < 0.045;
        g.save(); g.translate(0, (1 - ease(q)) * sz * 0.22);
        const hd = person(F, cx, yT, sz, i, hot, T, q, blink, 520 + i * 40);
        g.restore();
        // Name badge above the head.
        const label = roleOf(d.badges, i), bq = span(q, 0.55, 1);
        if (label && bq > 0) {
          g.font = `700 ${46 * u}px ${HAND}`;
          const lw = Math.min(slot * 0.96, Math.max(170 * u, g.measureText(label).width + 60 * u)), by = hd.hy - hd.ry - 104 * u + (1 - ease(bq)) * 20 * u, sw = Math.sin(T * 2 + i) * 0.025;
          g.save(); g.translate(cx, by + 36 * u); g.rotate(sw);
          const bd = sub().RR(-lw / 2, -36 * u, lw, 72 * u, 14 * u);
          ink(F, sub().M(-14 * u, 36 * u).L(0, 54 * u).L(14 * u, 36 * u), { q: span(bq, 0.5, 1), w: 2.2, col: hot ? F.accRGB : F.gr, seed: 530 + i, passes: 1 });
          g.fillStyle = F.T.paper; g.beginPath(); bd.trace(g); g.fill();
          shape(F, bd, { q: bq, seed: 540 + i, w: 2.6, col: hot ? F.accRGB : F.gr, tint: hot ? { step: 8, a: 0.25 } : null });
          say(F, label, 0, 15 * u, 46 * u, { align: "center", q: span(bq, 0.3, 1), color: hot ? F.acc(1) : F.ink(0.95), maxW: lw - 24 * u, min: 42 * u });
          g.restore();
        }
      });
      // The table, drawn over their waists.
      if (tq > 0) {
        const top = sub().poly([[x0, yT], [x1, yT], [x1 + 26 * u, yT + 40 * u], [x0 - 26 * u, yT + 40 * u]], true);
        const face = sub().R(x0 - 26 * u, yT + 40 * u, x1 - x0 + 52 * u, 52 * u);
        g.save(); g.fillStyle = F.T.paper; g.beginPath(); top.trace(g); g.fill(); face.trace(g); g.fill(); g.restore();
        shape(F, top, { q: tq, seed: 560 + row, w: 2.8, hatch: { step: 12, ang: 0.15, a: 0.2 } });
        shape(F, face, { q: span(tq, 0.2, 1), seed: 565 + row, w: 2.8, hatch: { step: 5.5, ang: 0.9, a: 0.4 } });
        ink(F, sub().M(x0, yT + 92 * u).L(x0, ra.y + ra.h - 14 * u).M(x1, yT + 92 * u).L(x1, ra.y + ra.h - 14 * u), { q: span(tq, 0.3, 1), w: 3, seed: 570 + row });
        cast(F, (x0 + x1) / 2, ra.y + ra.h - 14 * u, (x1 - x0) * 0.55, 0.22 * tq);
        // Things on the table, and hands resting beside them.
        idxs.forEach((i, k) => {
          const cx = ra.x + slot * (k + 0.5), iq = span(p, 0.4 + k * 0.06, 0.75 + k * 0.06), gx = cx + slot * 0.5;
          if (k < idxs.length - 1 || idxs.length < 3) {
            if (i % 2 === 0) note(F, gx - 36 * u, yT + 34 * u - 62 * u, 72 * u, 62 * u, iq, 580 + i, i === hotI);
            else mug(F, gx - 36 * u, yT + 34 * u, 70 * u, 80 * u, iq, T, 590 + i, i === hotI);
          }
        });
      }
      // Arms: resting on the table, and one waving.
      idxs.forEach((i, k) => {
        const cx = ra.x + slot * (k + 0.5), s0 = 0.05 + i * 0.06, q = span(p, s0 + 0.2, s0 + 0.5), hot = i === hotI, sz = s * (hot ? 1.06 : 1), bw = sz * 0.5, lw = sz * 0.085;
        if (q <= 0) return;
        const sh = yT - sz * 0.45;
        limb(F, cx - bw / 2 + 5 * u, sh, cx - bw * 0.64, yT - sz * 0.2, lw, q, 640 + i * 9, hot);
        limb(F, cx - bw * 0.64, yT - sz * 0.2, cx - bw * 0.34, yT + 26 * u, lw, q, 641 + i * 9, hot);
        shape(F, sub().O(cx - bw * 0.31, yT + 30 * u, sz * 0.04), { q, seed: 642 + i * 9, w: 2.2 });
        const ex = cx + bw * 0.66, ey = hot ? yT - sz * 0.5 : yT - sz * 0.2;
        limb(F, cx + bw / 2 - 5 * u, sh, ex, ey, lw, q, 643 + i * 9, hot);
        if (hot) {
          const wv = 0.35 + 0.45 * Math.sin(T * 6.5), hx = ex + Math.sin(wv) * sz * 0.34, hy = ey - Math.cos(wv) * sz * 0.34;
          limb(F, ex, ey, hx, hy, lw, q, 644 + i * 9, true);
          shape(F, sub().O(hx + Math.sin(wv) * sz * 0.04, hy - Math.cos(wv) * sz * 0.04, sz * 0.045), { q, seed: 645 + i * 9, w: 2.2 });
        } else {
          limb(F, ex, ey, cx + bw * 0.36, yT + 26 * u, lw, q, 644 + i * 9, false);
          shape(F, sub().O(cx + bw * 0.33, yT + 30 * u, sz * 0.04), { q, seed: 645 + i * 9, w: 2.2 });
        }
      });
      // Little marks floating up between people.
      if (p > 0.55) for (let k = 0; k < idxs.length - 1; k++) {
        const ph = (T * 0.33 + hash(k, row, 5)) % 1, gx = ra.x + slot * (k + 1) + Math.sin(ph * 7 + k) * 14 * u, gy = yT - 40 * u - ph * s * 0.62, al = Math.sin(ph * Math.PI);
        if (al <= 0.05) continue;
        const kind = (k + row) % 3;
        g.save(); g.globalAlpha *= al;
        if (kind === 0) ink(F, sub().M(gx, gy + 14 * u).C(gx - 30 * u, gy - 10 * u, gx - 6 * u, gy - 26 * u, gx, gy - 8 * u).C(gx + 6 * u, gy - 26 * u, gx + 30 * u, gy - 10 * u, gx, gy + 14 * u), { w: 2.6, col: F.accRGB, passes: 1, seed: 600 + k });
        else if (kind === 1) glint(F, gx, gy, 18 * u, 1, F.accRGB);
        else checkMark(F, gx, gy, 34 * u, 1, 610 + k, F.accRGB);
        g.restore();
      }
    }
  }

  // ---- process: stations along a winding path, with a bead rolling through ----------------------------------------
  function iconRead(F, cx, cy, s, q, T, seed) {
    const u = F.u, w = s * 1.0, h = s * 0.46, x = cx - w / 2, y = cy - h / 2 + s * 0.06;
    const strip = sub().RR(x, y, w, h, 8 * u);
    shape(F, strip, { q: span(q, 0, 0.6), seed, w: 2.8, hatch: { step: 6, ang: 0.8, a: 0.3 } });
    const fr = sub();
    for (let k = 0; k < 3; k++) fr.R(x + w * (0.06 + k * 0.31), y + h * 0.22, w * 0.27, h * 0.56);
    knock(F, fr);
    ink(F, fr, { q: span(q, 0.3, 0.9), seed: seed + 1, w: 2, a: 0.85 });
    for (let k = 0; k < 9; k++) {
      const hq = span(q, 0.1 + k * 0.03, 0.6);
      ink(F, sub().R(x + w * (0.03 + k * 0.105), y + h * 0.04, w * 0.05, h * 0.1).R(x + w * (0.03 + k * 0.105), y + h * 0.86, w * 0.05, h * 0.1), { q: hq, seed: seed + 2 + k, w: 1.4, a: 0.7, passes: 1 });
    }
    const fx = (k) => x + w * (0.06 + k * 0.31), fw = w * 0.27, fy = y + h * 0.22, fh = h * 0.56;
    ink(F, sub().poly([[fx(0) + fw * 0.34, fy + fh * 0.25], [fx(0) + fw * 0.72, fy + fh * 0.5], [fx(0) + fw * 0.34, fy + fh * 0.78]], true), { q: span(q, 0.5, 1), seed: seed + 20, w: 2, col: F.accRGB, passes: 1 });
    ink(F, sub().O(fx(1) + fw * 0.5, fy + fh * 0.4, fh * 0.22), { q: span(q, 0.55, 1), seed: seed + 21, w: 2, passes: 1 });
    ink(F, sub().poly([[fx(2) + fw * 0.08, fy + fh * 0.85], [fx(2) + fw * 0.4, fy + fh * 0.3], [fx(2) + fw * 0.6, fy + fh * 0.6], [fx(2) + fw * 0.76, fy + fh * 0.42], [fx(2) + fw * 0.92, fy + fh * 0.85]]), { q: span(q, 0.6, 1), seed: seed + 22, w: 2, passes: 1 });
    // A magnifier sweeping along the strip.
    const mx = cx + s * 0.28 * Math.sin(T * 1.5), my = cy + s * 0.04 + s * 0.05 * Math.sin(T * 2.9 + 1), mr = s * 0.2, mq = span(q, 0.5, 1);
    if (mq > 0) {
      const lens = sub().O(mx, my, mr);
      g_fillPaper(F, lens, 0.55);
      ink(F, lens, { q: mq, seed: seed + 30, w: 3.2 });
      ink(F, sub().M(mx + mr * 0.7, my + mr * 0.7).L(mx + mr * 1.7, my + mr * 1.7), { q: mq, seed: seed + 31, w: 6, a: 0.85, passes: 1 });
      ink(F, sub().A(mx, my, mr * 0.72, Math.PI * 1.05, Math.PI * 1.4, true), { q: mq, seed: seed + 32, w: 2, a: 0.6, passes: 1 });
    }
  }
  function g_fillPaper(F, P, a) { const g = F.g; g.save(); g.fillStyle = F.T.paper; g.globalAlpha = a; g.beginPath(); P.trace(g); g.fill(); g.restore(); }
  function iconDraft(F, cx, cy, s, q, T, seed) {
    const u = F.u, w = s * 0.92, h = s * 0.66, x = cx - w / 2, y = cy - h / 2;
    const card = sub().RR(x, y, w, h, 12 * u);
    shape(F, card, { q: span(q, 0, 0.6), seed, w: 2.8, hatch: { step: 14, ang: -0.5, a: 0.12 } });
    for (let r = 0; r < 3; r++) {
      const ry = y + h * (0.24 + r * 0.26), x1 = x + w * 0.1, x2 = x + w * 0.9, kn = 0.5 + 0.34 * Math.sin(T * 1.4 + r * 2.2), kx = lerp(x1, x2, kn), rq = span(q, 0.3 + r * 0.1, 0.8);
      ink(F, sub().M(x1, ry).L(x2, ry), { q: rq, seed: seed + 1 + r, w: 2.2, a: 0.8, passes: 1 });
      if (rq > 0.9) { ink(F, sub().M(x1, ry).L(kx, ry), { w: 5, a: 0.55, passes: 1, seed: seed + 5 + r, col: r === 1 ? F.accRGB : F.gr }); shape(F, sub().O(kx, ry, 13 * u), { q: 1, seed: seed + 8 + r, w: 2.4, tint: r === 1 ? { step: 4.5, a: 0.7 } : null }); }
    }
    // Sparkles and a pencil tracing a loop above the card.
    for (let k = 0; k < 3; k++) glint(F, x + w * (0.1 + k * 0.42), y - s * (0.1 + (k % 2) * 0.12), 16 * u, Math.max(0, Math.sin(T * 3 + k * 2.1)) ** 2 * span(q, 0.6, 1), F.accRGB);
    const lq = span(q, 0.55, 1);
    if (lq > 0) {
      const ang = T * 3.2, tx = x + w * 0.82 + Math.cos(ang) * s * 0.07, ty = y + h * 0.9 + Math.sin(ang * 1.3) * s * 0.04;
      pencil(F, tx, ty, s * 0.62, -0.95, lq, seed + 40, { r: 9 });
    }
  }
  function iconApprove(F, cx, cy, s, q, T, seed) {
    const u = F.u, w = s * 0.66, h = s * 0.84, x = cx - w / 2, y = cy - h / 2 + s * 0.12;
    const sheet = sub().M(x, y).L(x + w * 0.78, y).L(x + w, y + h * 0.2).L(x + w, y + h).L(x, y + h).Z();
    shape(F, sheet, { q: span(q, 0, 0.6), seed, w: 2.8, hatch: { step: 14, ang: -0.5, a: 0.12 } });
    ink(F, sub().M(x + w * 0.78, y).L(x + w * 0.8, y + h * 0.18).L(x + w, y + h * 0.2), { q: span(q, 0.2, 0.7), seed: seed + 1, w: 2, passes: 1 });
    for (let k = 0; k < 3; k++) ink(F, sub().M(x + w * 0.14, y + h * (0.62 + k * 0.1)).L(x + w * (0.8 - k * 0.12), y + h * (0.62 + k * 0.1)), { q: span(q, 0.4 + k * 0.08, 0.9), seed: seed + 2 + k, w: 2, a: 0.6, passes: 1 });
    const ck = span(q, 0.5, 0.95);
    checkMark(F, cx, y + h * 0.36, s * 0.46, ck, seed + 9, F.accRGB);
    for (let r = 0; r < 2; r++) {
      const ph = (T * 0.55 + r * 0.5) % 1;
      if (ck > 0.99) ink(F, sub().O(cx, y + h * 0.36, s * (0.26 + 0.24 * ph)), { w: 2.4, a: 0.7 * (1 - ph), col: F.accRGB, passes: 1, seed: seed + 12 + r });
    }
    // A stamp dropping onto the page again and again.
    const dip = 0.5 + 0.5 * Math.sin(T * 2.4), sy = y - s * 0.34 - s * 0.14 * (1 - dip) * 1.2, sx = x + w * 1.06, sq = span(q, 0.55, 1);
    if (sq > 0) {
      const knob = sub().O(sx, sy - s * 0.2, s * 0.09), stem = sub().R(sx - s * 0.035, sy - s * 0.12, s * 0.07, s * 0.14), pad = sub().RR(sx - s * 0.14, sy + s * 0.02, s * 0.28, s * 0.07, 6 * u);
      shape(F, knob, { q: sq, seed: seed + 20, w: 2.4, hatch: { step: 5, a: 0.4 } }); shape(F, stem, { q: sq, seed: seed + 21, w: 2.2 });
      shape(F, pad, { q: sq, seed: seed + 22, w: 2.4, tint: { step: 4, a: 0.7 } });
    }
  }
  function drawProcess(F, a, p, d, T) {
    const { u, tall } = F, g = F.g, n = d.steps.length;
    const s = tall ? Math.min(a.w * 0.44, (a.h / n) * 0.56) : Math.min((a.w / n) * 0.62, a.h * 0.46, 380 * u);
    const pts = d.steps.map((_, i) => tall ? [a.x + a.w * (i % 2 ? 0.66 : 0.34), a.y + a.h * (0.15 + (0.66 * i) / Math.max(1, n - 1))] : [a.x + a.w * (0.14 + (0.72 * i) / Math.max(1, n - 1)), a.y + a.h * (i % 2 ? 0.5 : 0.38)]);
    const first = pts[0], last = pts[n - 1];
    const ring = [tall ? [a.x + a.w * 0.1, a.y + 20 * u] : [a.x - 10 * u, first[1] + 120 * u], ...pts, tall ? [a.x + a.w * 0.5, a.y + a.h] : [a.x + a.w + 10 * u, last[1] + 120 * u]];
    const road = (dy) => {
      const P = sub().M(ring[0][0], ring[0][1] + dy);
      for (let i = 1; i < ring.length - 1 + 0; i++) {
        const p0 = ring[Math.max(0, i - 2)], p1 = ring[i - 1], p2 = ring[i], p3 = ring[Math.min(ring.length - 1, i + 1)];
        P.C(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + dy + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] + dy - (p3[1] - p1[1]) / 6, p2[0], p2[1] + dy);
      }
      const p0 = ring[ring.length - 3], p1 = ring[ring.length - 2], p2 = ring[ring.length - 1];
      P.C(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + dy + (p2[1] - p0[1]) / 6, p2[0] - (p2[0] - p1[0]) / 6, p2[1] + dy - (p2[1] - p1[1]) / 6, p2[0], p2[1] + dy);
      return P;
    };
    const pq = span(p, 0, 0.55);
    const mainRoad = road(0);
    ink(F, mainRoad, { q: pq, w: 3.4, a: 0.8, seed: 700, dash: [26, 16], off: -T * 30 });
    ink(F, road(s * 0.1), { q: span(p, 0.05, 0.6), w: 2, a: 0.35, seed: 701, dash: [14, 18], off: T * 20, passes: 1 });
    // Pebbles and tufts along the way.
    for (let k = 0; k < 16; k++) {
      const [px, py] = mainRoad.at(hash(k, 4)), side = hash(k, 5) < 0.5 ? -1 : 1, off = (s * 0.3 + hash(k, 6) * s * 0.3) * side;
      if (span(p, 0.1, 0.6) * 1 < hash(k, 7)) continue;
      if (k % 2) ink(F, sub().OV(px, py + off, (6 + hash(k, 8) * 6) * u, 5 * u), { w: 2, a: 0.5, passes: 1, seed: 710 + k });
      else ink(F, sub().M(px - 8 * u, py + off).L(px - 3 * u, py + off - 16 * u).M(px, py + off).L(px, py + off - 20 * u).M(px + 8 * u, py + off).L(px + 3 * u, py + off - 15 * u), { w: 2, a: 0.55, passes: 1, seed: 710 + k, amp: 0.5 });
    }
    // Low hills across the foot of the page, swaying grass on them.
    const hy = a.y + a.h - 30 * u, hp = sub().M(a.x - 20 * u, hy);
    for (let k = 0; k < 8; k++) hp.Q(a.x + (a.w * (k + 0.5)) / 8, hy - (k % 2 ? 26 : 56) * u, a.x + 20 * u + (a.w * (k + 1)) / 8, hy);
    ink(F, hp, { q: span(p, 0.05, 0.5), w: 2.8, a: 0.7, seed: 705 });
    ink(F, sub().M(a.x, hy + 16 * u).Q(a.x + a.w / 2, hy - 20 * u, a.x + a.w, hy + 16 * u), { q: span(p, 0.1, 0.55), w: 1.4, a: 0.35, passes: 1, seed: 706 });
    for (let k = 0; k < 22; k++) {
      const gx = a.x + (a.w * (k + hash(k, 3))) / 22, gy = hy - (k % 2 ? 6 : 14) * u, sway = Math.sin(T * 2 + k) * 5 * u;
      if (span(p, 0.1, 0.6) < hash(k, 8)) continue;
      ink(F, sub().M(gx - 6 * u, gy).Q(gx - 4 * u + sway * 0.4, gy - 12 * u, gx - 2 * u + sway, gy - 24 * u).M(gx, gy).Q(gx + sway * 0.4, gy - 14 * u, gx + sway * 1.2, gy - 30 * u).M(gx + 6 * u, gy).Q(gx + 5 * u + sway * 0.4, gy - 11 * u, gx + 3 * u + sway, gy - 22 * u), { w: 2, a: 0.55, passes: 1, amp: 0.3, seed: 710 + k });
    }
    const kinds = d.steps.map((_, i) => (i === n - 1 ? iconApprove : i === 0 ? iconRead : iconDraft));
    d.steps.forEach((step, i) => {
      const [cx, cy] = pts[i], q = span(p, 0.04 + i * 0.12, 0.04 + i * 0.12 + 0.48), isLast = i === n - 1;
      if (q <= 0) return;
      knock(F, sub().O(cx, cy, s * 0.6));
      guideCircle(F, cx, cy, s * 0.58, span(q, 0, 0.4), 0.15, 720 + i);
      g.save(); g.translate(cx, cy + Math.sin(T * 2 + i * 1.7) * 3 * u); g.translate(-cx, -cy);
      kinds[i](F, cx, cy, s, q, T, 730 + i * 50);
      g.restore();
      // A big circled numeral.
      const nx = cx - s * 0.58, ny = cy - s * 0.5, nq = span(q, 0.3, 0.8);
      ink(F, sub().O(nx, ny, 58 * u).O(nx + 3 * u, ny + 2 * u, 55 * u), { q: nq, w: 3, col: isLast ? F.accRGB : F.gr, seed: 760 + i });
      say(F, String(i + 1), nx, ny + 33 * u, 100 * u, { align: "center", q: span(nq, 0.5, 1), color: isLast ? F.acc(1) : F.ink(0.92) });
      const lq = span(q, 0.5, 1);
      say(F, step, cx, cy + s * 0.5 + 92 * u, 54 * u, { align: "center", q: lq, maxW: tall ? a.w * 0.8 : (a.w / n) * 0.92, min: 42 * u, color: isLast ? F.acc(1) : F.ink(0.95) });
      ink(F, sub().M(cx - s * 0.4, cy + s * 0.5 + 112 * u).Q(cx, cy + s * 0.5 + 124 * u, cx + s * 0.4, cy + s * 0.5 + 110 * u), { q: span(lq, 0.5, 1), w: 2.6, a: 0.8, col: isLast ? F.accRGB : F.gr, seed: 770 + i, passes: 1 });
    });
    // The bead: it rolls forward along the path, hopping, with a trail.
    if (pq > 0.2) {
      const f = ((T * 0.13) % 1) * pq;
      for (let j = 7; j >= 0; j--) {
        const [tx, ty] = mainRoad.at(Math.max(0, f - j * 0.011)), al = 0.55 * (1 - j / 8);
        g.save(); g.fillStyle = F.acc(al); g.beginPath(); g.arc(tx, ty - s * 0.03 - 4 * u, (5 + (8 - j) * 1.3) * u, 0, TAU); g.fill(); g.restore();
      }
      const [bx, by] = mainRoad.at(f), hop = Math.abs(Math.sin(f * 90)) * 14 * u;
      g.save(); g.fillStyle = F.acc(0.9); g.beginPath(); g.arc(bx, by - 22 * u - hop, 17 * u, 0, TAU); g.fill(); g.restore();
      ink(F, sub().O(bx, by - 22 * u - hop, 17 * u), { w: 2.4, seed: 780 });
      glint(F, bx - 6 * u, by - 30 * u - hop, 6 * u, 1, "255,255,255");
      smudge(F, bx, by + 2 * u, 22 * u, 0.2);
    }
  }

  // ---- compare: a balance with crumpled attempts against a neat stack --------------------------------------------
  function drawCompare(F, a, p, d, T) {
    const { u, tall } = F, g = F.g, lv = d.leftValue, rv = d.rightValue, mx = Math.max(lv, rv, 1);
    const cx = a.x + a.w / 2, hl = tall ? a.w * 0.38 : Math.min(a.w * 0.27, 470 * u), pivotY = a.y + a.h * (tall ? 0.16 : 0.36), strLen = tall ? a.h * 0.24 : a.h * 0.27;
    const ground = a.y + a.h * (tall ? 0.7 : 0.97), pw = tall ? a.w * 0.34 : Math.min(a.w * 0.19, 340 * u);
    const tt = Math.max(0, T - 0.45);
    const theta = clamp((lv - rv) / mx, -1, 1) * 0.14 * (1 - Math.exp(-3.2 * tt) * Math.cos(tt * 9)) * (T > 0.45 ? 1 : 0) + 0.011 * Math.sin(T * 1.9);
    const sn = Math.sin(theta), cs = Math.cos(theta);
    const L = [cx - hl * cs, pivotY + hl * sn], R = [cx + hl * cs, pivotY - hl * sn];
    // Stand.
    const sq = span(p, 0, 0.35);
    ink(F, sub().M(cx - 11 * u, pivotY).L(cx - 14 * u, ground - 40 * u).M(cx + 11 * u, pivotY).L(cx + 14 * u, ground - 40 * u), { q: sq, w: 3, seed: 800 });
    const foot = sub().poly([[cx - 190 * u, ground], [cx + 190 * u, ground], [cx + 100 * u, ground - 42 * u], [cx - 100 * u, ground - 42 * u]], true);
    cast(F, cx, ground, 230 * u, 0.3 * span(p, 0.05, 0.4));
    shape(F, foot, { q: span(p, 0.05, 0.4), seed: 801, w: 3, hatch: { step: 6, ang: 0.8, a: 0.38 } });
    ink(F, sub().M(a.x, ground).L(a.x + a.w, ground), { q: span(p, 0, 0.3), w: 3, a: 0.85, seed: 802 });
    guide(F, cx, pivotY - 60 * u, cx, ground, span(p, 0, 0.25), 0.2, { seed: 803, dash: [20, 8, 4, 8] });
    guide(F, cx - hl * 1.1, pivotY, cx + hl * 1.1, pivotY, span(p, 0.02, 0.28), 0.2, { seed: 804, dash: [20, 8, 4, 8] });
    // Beam, pivot and strings.
    const beam = sub().poly([[L[0], L[1] - 11 * u], [R[0], R[1] - 11 * u], [R[0], R[1] + 11 * u], [L[0], L[1] + 11 * u]], true);
    shape(F, beam, { q: span(p, 0.08, 0.45), seed: 805, w: 3, hatch: { step: 5, ang: 0.8, a: 0.5 } });
    shape(F, sub().O(cx, pivotY, 20 * u), { q: span(p, 0.1, 0.45), seed: 806, w: 3, tint: { step: 4, a: 0.6 } });
    const ends = [[L, lv, 0], [R, rv, 1]];
    ends.forEach(([E, v, side]) => {
      const q = span(p, 0.2 + side * 0.1, 0.55 + side * 0.1), py = E[1] + strLen, ex = E[0];
      ink(F, sub().M(ex, E[1]).L(ex - pw * 0.52, py).M(ex, E[1]).L(ex + pw * 0.52, py), { q, w: 2, a: 0.75, seed: 810 + side, passes: 1 });
      shape(F, sub().O(ex, E[1], 11 * u), { q, seed: 812 + side, w: 2.4, tint: { step: 5, a: 0.5 } });
      const pan = sub().M(ex - pw * 0.55, py).L(ex + pw * 0.55, py).Q(ex + pw * 0.4, py + 40 * u, ex, py + 44 * u).Q(ex - pw * 0.4, py + 40 * u, ex - pw * 0.55, py).Z();
      shape(F, pan, { q: span(q, 0.2, 1), seed: 814 + side, w: 3, hatch: { step: 5, ang: 0.9, a: 0.45 } });
      if (side === 0) {
        const nb = Math.min(15, Math.max(0, Math.round(v))), rb = pw * 0.082, caps = [5, 4, 3, 2, 1];
        let placed = 0;
        for (let r = 0; r < caps.length && placed < nb; r++) for (let c = 0; c < caps[r] && placed < nb; c++, placed++) {
          const bq = span(p, 0.35 + placed * 0.025, 0.7 + placed * 0.025), hop = 7 * u * Math.max(0, Math.sin(T * 3.1 + placed * 1.9)) ** 6;
          if (bq <= 0) continue;
          crumple(F, ex + (c - (caps[r] - 1) / 2) * rb * 2.1, py - rb - r * rb * 1.65 - hop, rb, bq, 830 + placed, Math.sin(T * 1.6 + placed) * 0.12 * (placed % 3 === 0));
        }
      } else {
        const nc = Math.min(10, Math.max(1, Math.round(v)));
        for (let c = 0; c < nc; c++) {
          const cq = span(p, 0.4 + c * 0.04, 0.75 + c * 0.04), ch = 20 * u, y = py - (c + 1) * ch * 1.06, jx = (hash(c, 9) - 0.5) * 10 * u;
          if (cq <= 0) continue;
          const card = sub().RR(ex - pw * 0.34 + jx, y, pw * 0.68, ch, 5 * u);
          g.save(); g.fillStyle = F.T.paper; g.beginPath(); card.trace(g); g.fill(); g.restore();
          shape(F, card, { q: cq, seed: 860 + c, w: 2.2, hatch: { step: 7, ang: 0.3, a: 0.18 }, tint: c === nc - 1 ? { step: 6, a: 0.35 } : null });
          if (c === nc - 1) checkMark(F, ex + jx, y + ch * 0.5 - 2 * u, ch * 1.5, span(cq, 0.4, 1), 880, F.accRGB);
        }
      }
    });
    // The two figures, large.
    // Wide: each count rides above its own beam end, label under the figure, clear of the pans and props.
    const nums = [[d.left, lv, tall ? a.x + a.w * 0.26 : L[0], 0], [d.right, rv, tall ? a.x + a.w * 0.74 : R[0], 1]];
    nums.forEach(([label, v, x, side]) => {
      const q = span(p, 0.3 + side * 0.1, 0.75 + side * 0.1), E = side ? R : L;
      const y = tall ? a.y + a.h * 0.855 : E[1] - 110 * u, ly = tall ? y + 66 * u : E[1] - 40 * u;
      if (q <= 0) return;
      const col = side ? F.acc(1) : F.ink(0.95), colRGB = side ? F.accRGB : F.gr, w = say(F, fmt(v * ease(q), 0, d.prefix, d.suffix), x, y, 150 * u, { align: "center", color: col, q: span(q, 0, 0.6), maxW: tall ? a.w * 0.44 : 300 * u, min: 96 * u });
      if (!tall) { g.save(); g.fillStyle = F.T.paper; g.globalAlpha = 0.85 * span(q, 0.3, 0.6); g.beginPath(); g.ellipse(x, ly - 16 * u, 130 * u, 30 * u, 0, 0, TAU); g.fill(); g.restore(); }
      say(F, label, x, ly, 52 * u, { align: "center", color: col, q: span(q, 0.3, 0.8), maxW: tall ? a.w * 0.44 : 300 * u, min: 42 * u });
      if (side) ink(F, sub().OV(x, y - 52 * u, Math.max(w * 0.62, 80 * u), 74 * u, -0.03, Math.PI * 0.9).OV(x + 4 * u, y - 55 * u, Math.max(w * 0.6, 78 * u), 72 * u, -0.02, Math.PI * 0.95), { q: span(q, 0.5, 1), w: 3.4, col: colRGB, seed: 890 });
    });
    // Left: a wastepaper bin that attempts keep landing in. Right: a cup of sharpened pencils.
    if (!tall) {
      const bx = a.x + 90 * u, bh = 150 * u, bwid = 150 * u, bq = span(p, 0.3, 0.75), by = ground;
      cast(F, bx, by, bwid * 0.8, 0.28 * bq);
      const bin = sub().poly([[bx - bwid / 2, by - bh], [bx + bwid / 2, by - bh], [bx + bwid * 0.4, by], [bx - bwid * 0.4, by]], true);
      shape(F, bin, { q: bq, seed: 900, w: 2.8, hatch: { step: 7, ang: 1.2, a: 0.3 } });
      for (let k = 1; k < 5; k++) ink(F, sub().M(bx - bwid / 2 + (bwid * k) / 5 + (k - 2.5) * 3 * u, by - bh + 8 * u).L(bx - bwid * 0.4 + (bwid * 0.8 * k) / 5, by - 6 * u), { q: span(bq, 0.3, 1), w: 1.6, a: 0.5, passes: 1, seed: 905 + k });
      ink(F, sub().OV(bx, by - bh, bwid / 2, 16 * u), { q: bq, seed: 910, w: 2.6 });
      if (bq > 0.9) {
        const ph = (T * 0.5) % 1, fx = bx + Math.sin(ph * 7) * 12 * u, fy = lerp(by - bh - 300 * u, by - bh + 6 * u, ph * ph);
        if (ph < 0.92) crumple(F, fx, fy, 24 * u, 1, 915, ph * 9);
        const sq = span(ph, 0.92, 1);
        if (ph > 0.9) ink(F, sub().M(bx - 40 * u, by - bh - 24 * u).L(bx - 52 * u, by - bh - 44 * u).M(bx + 6 * u, by - bh - 26 * u).L(bx + 8 * u, by - bh - 52 * u).M(bx + 44 * u, by - bh - 22 * u).L(bx + 58 * u, by - bh - 42 * u), { w: 2.2, a: 0.7 * (1 - sq), passes: 1, seed: 916 });
      }
      const cxp = a.x + a.w - 70 * u, ch = 150 * u, cw2 = 130 * u, cq2 = span(p, 0.4, 0.85);
      cast(F, cxp, by, cw2 * 0.8, 0.28 * cq2);
      for (let k = 0; k < 3; k++) {
        const px = cxp + (k - 1) * 32 * u, top = by - ch - (70 + (k === 1 ? 50 : k * 12)) * u;
        pencil(F, px, top, 120 * u, Math.PI / 2 + (k - 1) * 0.12, span(cq2, 0.2, 1), 920 + k * 20, { r: 11, tint: k === 1 });
      }
      const cup = sub().poly([[cxp - cw2 / 2, by - ch], [cxp + cw2 / 2, by - ch], [cxp + cw2 * 0.45, by], [cxp - cw2 * 0.45, by]], true);
      g.save(); g.fillStyle = F.T.paper; g.globalAlpha = 0.95 * cq2; g.beginPath(); cup.trace(g); g.fill(); g.restore();
      shape(F, cup, { q: cq2, seed: 940, w: 2.8, hatch: { step: 6, ang: 0.8, a: 0.34 } });
      ink(F, sub().OV(cxp, by - ch, cw2 / 2, 14 * u), { q: cq2, seed: 941, w: 2.6 });
    }
    // A paper plane crossing the page above it all.
    if (p > 0.4 && tall) {
      const f = (T * 0.16) % 1, x = a.x - 140 * u + f * (a.w + 280 * u), y = a.y + 16 * u + 26 * u * Math.sin(T * 2.2), ang = Math.cos(T * 2.2) * 0.2;
      const tr = sub();
      for (let j = 0; j <= 12; j++) { const ff = Math.max(0, f - j * 0.013); tr.L(a.x - 140 * u + ff * (a.w + 280 * u) - 40 * u, a.y + 16 * u + 26 * u * Math.sin((T - j * 0.082) * 2.2) + 6 * u); }
      ink(F, tr, { w: 2, a: 0.4, dash: [10, 10], passes: 1, seed: 895, off: -T * 20 });
      plane(F, x, y, 30 * u, ang, 1, 896);
    }
  }

  // ---- title and closing: the page the words sit on --------------------------------------------------------------
  // A pencil writes a wavy underline below the headline, then keeps doodling beside it.
  function underline(F, ids, local, t0, color) {
    const { W, H, u, tall } = F, hb = headBox(ids) || { x: W * 0.25, r: W * 0.75, b: H * 0.58 };
    const x1 = Math.max(hb.x, bindingWidth(F) + 90 * u), x2 = Math.min(hb.r, W - 320 * u), y = Math.min(hb.b + 34 * u, H - 330 * u);
    const P = sub().M(x1, y);
    const n = Math.max(6, Math.round((x2 - x1) / (62 * u)));
    for (let i = 1; i <= n; i++) P.Q(x1 + ((i - 0.5) / n) * (x2 - x1), y + (i % 2 ? -14 : 14) * u, x1 + (i / n) * (x2 - x1), y);
    const q = ease(span(local, t0, t0 + 1.5));
    ink(F, P, { q, w: 4.2, a: 0.9, col: color, seed: 900 });
    ink(F, sub().M(x1 + 20 * u, y + 20 * u).L(x1 + (x2 - x1) * 0.8, y + 22 * u), { q: span(q, 0.3, 1), w: 2, a: 0.4, passes: 1, seed: 901 });
    let [tx, ty] = P.at(q);
    if (q >= 1) { const k = local - (t0 + 1.5), r = 10 * u + 26 * u * (0.5 + 0.5 * Math.sin(k * 2)); tx = x2 + Math.cos(k * 5) * r; ty = y + Math.sin(k * 5) * r * 0.6; spiral(F, x2 + 70 * u, y + 6 * u, 3 * u, 22 * u, 2, (k * 0.45) % 1, 902); }
    // Before it writes, the pencil swoops in from the corner laying a light guide stroke.
    if (q <= 0) { const k = ease(span(local, 0, t0)); tx = lerp(x2 + 260 * u, x1, k); ty = lerp(y + 180 * u, y, k) + Math.sin(k * 9) * 10 * u; ink(F, sub().M(x2 + 260 * u, y + 180 * u).L(x1, y + 10 * u), { q: k, w: 1.2, a: 0.22, passes: 1, seed: 905, pressure: 0 }); }
    pencil(F, tx, ty, (tall ? 300 : 360) * u, 0.95, span(local, 0, Math.max(0.3, t0)), 910, { r: 15 });
  }
  function viewfinder(F, q, T) {
    const { W, H, u } = F, x0 = bindingWidth(F) + 56 * u, x1 = W - 56 * u, y0 = 56 * u, y1 = H - 56 * u, arm = 84 * u;
    for (const [x, y, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]])
      ink(F, sub().M(x + sx * arm, y).L(x, y).L(x, y + sy * arm), { q: ease(q), w: 4, a: 0.85, seed: 920 + sx + sy * 2 });
    for (let k = 1; k <= 2; k++) {
      ink(F, sub().M(x0 + ((x1 - x0) * k) / 3, y0 + 10 * u).L(x0 + ((x1 - x0) * k) / 3, y1 - 10 * u), { q: ease(q), w: 1.2, a: 0.17, passes: 1, seed: 930 + k, dash: [18, 12], off: -T * 10 });
      ink(F, sub().M(x0 + 10 * u, y0 + ((y1 - y0) * k) / 3).L(x1 - 10 * u, y0 + ((y1 - y0) * k) / 3), { q: ease(q), w: 1.2, a: 0.17, passes: 1, seed: 935 + k, dash: [18, 12], off: T * 10 });
    }
    // A REC dot blinking in the corner.
    const rx = x0 + 40 * u, ry = y0 + 40 * u;
    if (q > 0.7) { ink(F, sub().O(rx, ry, 11 * u), { w: 2.6, col: F.accRGB, seed: 940, passes: 1 }); if (Math.floor(T * 1.6) % 2 === 0) { const g = F.g; g.save(); g.fillStyle = F.acc(0.85); g.beginPath(); g.arc(rx, ry, 8 * u, 0, TAU); g.fill(); g.restore(); } }
  }
  function thumbs(F, q, T) {
    const { W, u, tall } = F, fw = (tall ? 150 : 200) * u, fh = fw * 0.66, gap = 26 * u, n = tall ? 2 : 3, y = (tall ? 120 : 100) * u, x0 = W - 90 * u - n * fw - (n - 1) * gap;
    const cur = Math.floor(T * 0.9) % n;
    for (let k = 0; k < n; k++) {
      const x = x0 + k * (fw + gap), fq = span(q, k * 0.18, 0.5 + k * 0.18), fr = sub().R(x, y, fw, fh);
      shape(F, fr, { q: fq, seed: 950 + k, w: 2.6, tint: k === cur ? { step: 9, a: 0.22 } : null });
      if (fq > 0.6) {
        if (k % 3 === 0) { ink(F, sub().O(x + fw * 0.7, y + fh * 0.32, fh * 0.14), { w: 2.2, col: F.accRGB, passes: 1, seed: 960 }); for (let r = 0; r < 8; r++) { const aa = (r / 8) * TAU + T * 0.8; ink(F, sub().M(x + fw * 0.7 + Math.cos(aa) * fh * 0.2, y + fh * 0.32 + Math.sin(aa) * fh * 0.2).L(x + fw * 0.7 + Math.cos(aa) * fh * 0.3, y + fh * 0.32 + Math.sin(aa) * fh * 0.3), { w: 1.8, col: F.accRGB, passes: 1, seed: 961 + r }); } ink(F, sub().poly([[x, y + fh * 0.85], [x + fw * 0.3, y + fh * 0.5], [x + fw * 0.55, y + fh * 0.75], [x + fw, y + fh * 0.55]]), { w: 2.2, passes: 1, seed: 970 }); }
        else if (k % 3 === 1) { ink(F, sub().poly([[x + fw * 0.06, y + fh * 0.9], [x + fw * 0.3, y + fh * 0.3], [x + fw * 0.5, y + fh * 0.65], [x + fw * 0.68, y + fh * 0.42], [x + fw * 0.94, y + fh * 0.9]]), { w: 2.2, passes: 1, seed: 971 }); bird(F, x + fw * ((T * 0.3) % 1), y + fh * 0.2 + Math.sin(T * 2) * 5 * u, 11 * u, Math.sin(T * 10), 972); }
        else { ink(F, sub().OV(x + fw / 2, y + fh * 0.5, fh * 0.3, fh * 0.34), { w: 2.2, passes: 1, seed: 973 }); const bl = (T * 0.5) % 1 < 0.06; for (const sx of [-1, 1]) ink(F, sub().M(x + fw / 2 + sx * fh * 0.12 - 5 * u, y + fh * 0.44).L(x + fw / 2 + sx * fh * 0.12 + 5 * u, y + fh * (bl ? 0.44 : 0.44 + Math.sin(T * 5) * 0.01)), { w: bl ? 2 : 3.4, passes: 1, seed: 974 + sx }); ink(F, sub().M(x + fw / 2 - fh * 0.12, y + fh * 0.62).Q(x + fw / 2, y + fh * 0.72, x + fw / 2 + fh * 0.12, y + fh * 0.62), { w: 2, passes: 1, seed: 976 }); }
      }
      say(F, String(k + 1), x + fw / 2, y + fh + 46 * u, 42 * u, { align: "center", q: span(fq, 0.5, 1), color: k === cur ? F.acc(1) : F.ink(0.6) });
      if (k === cur && fq > 0.9) ink(F, sub().R(x - 8 * u, y - 8 * u, fw + 16 * u, fh + 16 * u), { w: 2.4, col: F.accRGB, dash: [12, 9], off: -T * 36, passes: 1, seed: 980 });
    }
  }
  function clapper(F, x, y, sc, q, T) {
    const g = F.g, u = F.u * sc, w = 270 * u, h = 170 * u, m = (T % 3.2) / 3.2, open = m < 0.7 ? Math.sin((m / 0.7) * Math.PI * 0.5) : Math.max(0, 1 - (m - 0.7) / 0.06);
    const board = sub().R(x, y, w, h), lines = sub();
    shape(F, board, { q: span(q, 0, 0.6), seed: 990, w: 3, hatch: { step: 12, ang: 0.8, a: 0.14 } });
    for (let k = 1; k < 4; k++) lines.M(x, y + (h * k) / 4).L(x + w, y + (h * k) / 4);
    ink(F, lines, { q: span(q, 0.3, 1), w: 1.6, a: 0.5, passes: 1, seed: 991 });
    say(F, "take 3", x + w * 0.06, y + h * 0.9, 46 * F.u, { q: span(q, 0.5, 1), color: F.ink(0.85) });
    g.save(); g.translate(x, y); g.rotate(-0.5 * open);
    const arm = sub().R(0, -44 * u, w, 40 * u);
    if (q > 0.2) { g.save(); g.globalAlpha *= span(q, 0.2, 0.5); g.fillStyle = F.T.paper; g.beginPath(); arm.trace(g); g.fill(); g.restore(); }
    shape(F, arm, { q: span(q, 0.2, 0.9), seed: 995, w: 3 });
    for (let k = 0; k < 5; k++) hatchFill(F, sub().poly([[w * (k * 0.2), -44 * u], [w * (k * 0.2 + 0.1), -44 * u], [w * (k * 0.2 + 0.05), -4 * u], [w * (k * 0.2 - 0.05), -4 * u]], true), { q: span(q, 0.5, 1), step: 3.6, ang: 1.2, a: 0.7, w: 1.4, seed: 996 + k });
    g.restore();
    ink(F, sub().O(x, y - 2 * u, 7 * u), { q: span(q, 0.4, 1), seed: 997, w: 2.4, passes: 1 });
  }
  function scissors(F, x, y, sc, q, T) {
    const g = F.g, u = F.u * sc, open = 0.16 + 0.2 * (0.5 + 0.5 * Math.sin(T * 3.2));
    g.save(); g.translate(x, y);
    for (const s of [-1, 1]) {
      g.save(); g.rotate(s * open);
      const blade = sub().poly([[0, -6 * u], [200 * u, -1 * u], [0, 6 * u]], true);
      shape(F, blade, { q: span(q, 0, 0.7), seed: 1000 + s, w: 2.4, hatch: { step: 4, ang: 0.4, a: 0.35 } });
      ink(F, sub().M(0, 0).L(-90 * u, 0), { q: span(q, 0.2, 0.8), seed: 1004 + s, w: 7, a: 0.85, passes: 1 });
      ink(F, sub().OV(-120 * u, s * 14 * u, 34 * u, 24 * u), { q: span(q, 0.3, 1), seed: 1006 + s, w: 4.2, col: s > 0 ? F.accRGB : F.gr });
      g.restore();
    }
    ink(F, sub().O(0, 0, 6 * u), { q: span(q, 0.3, 1), seed: 1010, w: 2.4, passes: 1 });
    g.restore();
    ink(F, sub().M(x + 220 * u, y).L(x + 640 * u, y), { q: span(q, 0.5, 1), w: 2.2, a: 0.55, dash: [16, 12], off: -T * 40, passes: 1, seed: 1011 });
    say(F, "cut here", x + 430 * u, y - 18 * F.u, 42 * F.u, { align: "center", q: span(q, 0.7, 1), color: F.ink(0.5), weight: 600 });
  }
  function titleArt(F, local) {
    const { W, H, u, tall } = F, q = span(local, 0, 0.6), T = local, bw = bindingWidth(F);
    viewfinder(F, q, T);
    thumbs(F, span(local, -0.25, 1.1), T);
    clapper(F, bw + (tall ? 110 : 130) * u, H - (tall ? 300 : 250) * u, tall ? 0.8 : 1, span(local, 0.05, 1.3), T);
    if (!tall) scissors(F, W * 0.46, H - 150 * u, 0.9, span(local, 0.2, 1.5), T);
    else scissors(F, W - 560 * u, H - 470 * u, 0.7, span(local, 0.2, 1.5), T);
    underline(F, ["kicker", "title"], local, 0.4, F.accRGB);
    for (let k = 0; k < 3; k++) { const bx = bw + 160 * u + ((T * 0.05 + k * 0.33) % 1) * (W - bw - 300 * u), by = 180 * u + 30 * u * Math.sin(T * 0.9 + k * 2) + k * 24 * u; if (span(local, 1, 2) > 0 && by < H * 0.3) bird(F, bx, by, 15 * u, Math.sin(T * 9 + k), 1020 + k); }
  }
  function closingArt(F, local) {
    const { W, H, u, tall } = F, T = local, bw = bindingWidth(F), g = F.g;
    // A stamp landing at the lower left, with rings spreading from it.
    const sx = bw + (tall ? 190 : 270) * u, sy = H - (tall ? 330 : 220) * u, r = (tall ? 120 : 130) * u, sq = back(span(local, 0.3, 1.0));
    g.save(); g.translate(sx, sy); g.scale(0.6 + 0.4 * sq, 0.6 + 0.4 * sq); g.translate(-sx, -sy);
    ink(F, sub().O(sx, sy, r).O(sx + 3 * u, sy + 2 * u, r * 0.96), { q: span(local, 0.3, 1.0), w: 6, col: F.accRGB, seed: 1100 });
    ink(F, sub().O(sx, sy, r * 0.8), { q: span(local, 0.4, 1.1), w: 2.4, col: F.accRGB, a: 0.7, seed: 1101, passes: 1 });
    hatchFill(F, sub().O(sx, sy, r * 0.96), { q: span(local, 0.6, 1.4), step: 8, ang: -0.9, col: F.accRGB, a: 0.14, w: 2, seed: 1102 });
    checkMark(F, sx, sy, r * 0.9, span(local, 0.7, 1.2), 1103, F.accRGB);
    g.restore();
    if (local > 1.1) for (let k = 0; k < 2; k++) { const ph = ((T - 1.1) * 0.5 + k * 0.5) % 1; ink(F, sub().O(sx, sy, r * (1 + 0.7 * ph)), { w: 3, a: 0.6 * (1 - ph), col: F.accRGB, passes: 1, seed: 1104 + k }); }
    // A paper plane looping across the top with a dashed trail.
    const pos = (tt) => { const f = (tt * 0.11) % 1; return [bw + 100 * u + f * (W - bw - 200 * u), 130 * u + 70 * u * Math.sin(tt * 1.3) + 26 * u * Math.sin(tt * 3.1)]; };
    if (local > 0.3) {
      const tr = sub();
      for (let j = 16; j >= 0; j--) { const [x, y] = pos(T - j * 0.07); (j === 16 ? tr.M : tr.L).call(tr, x, y); }
      ink(F, tr, { w: 2.2, a: 0.45, dash: [10, 11], off: -T * 30, passes: 1, seed: 1110 });
      const [x, y] = pos(T), [x2, y2] = pos(T + 0.05);
      plane(F, x, y, 34 * u, Math.atan2(y2 - y, x2 - x), span(local, 0.3, 0.9), 1111);
    }
    // A mug steaming near the bottom, and confetti drifting in the margins.
    mug(F, W * (tall ? 0.7 : 0.62), H - 70 * u, 92 * u, 104 * u, span(local, 0.5, 1.4), T, 1120, true);
    for (let k = 0; k < 14; k++) {
      const x = bw + 90 * u + hash(k, 1) * (W - bw - 180 * u), baseY = hash(k, 2) < 0.5 ? (60 + hash(k, 3) * 150) * u : H - (130 + hash(k, 4) * 170) * u;
      const y = baseY + Math.sin(T * 0.9 + k * 1.7) * 14 * u, ang = T * (0.7 + hash(k, 5)) + k, cq = span(local, 0.6 + hash(k, 6) * 0.8, 1.6);
      if (cq <= 0 || (tall && hash(k, 2) >= 0.5 && Math.abs(x - sx) < 160 * u)) continue;
      const col = k % 3 === 0 ? F.accRGB : F.gr, c = 12 * u;
      if (k % 4 === 0) glint(F, x, y, 20 * u, Math.abs(Math.sin(T * 2 + k)) * cq, col);
      else if (k % 4 === 1) ink(F, sub().poly([[x + Math.cos(ang) * c, y + Math.sin(ang) * c], [x + Math.cos(ang + 2.1) * c, y + Math.sin(ang + 2.1) * c], [x + Math.cos(ang + 4.2) * c, y + Math.sin(ang + 4.2) * c]], true), { q: cq, w: 2.4, col, passes: 1, seed: 1130 + k });
      else if (k % 4 === 2) spiral(F, x, y, 2 * u, 15 * u, 1.6, cq, 1130 + k);
      else ink(F, sub().M(x - 16 * u, y).Q(x - 8 * u, y - 14 * u, x, y).Q(x + 8 * u, y + 14 * u, x + 16 * u, y), { q: cq, w: 2.6, col, passes: 1, seed: 1130 + k });
    }
    underline(F, ["closing"], local, 0.4, F.accRGB);
  }


  // A small moving drawing for the empty corner beside a short headline.
  function cornerDoodle(F, id, local, idx) {
    const { W, u, tall } = F, hb = headBox(HEADS[id] || []);
    if (tall || !hb || hb.r > W - 560 * u) return;
    const cx = W - 250 * u, cy = 150 * u, q = span(local, 0.2, 1.4), T = local, kind = idx % 5, s = 62 * u;
    if (kind === 0) {
      const bulb = sub().O(cx, cy - 10 * u, s * 0.62);
      shape(F, bulb, { q, seed: 1200, w: 2.6, tint: { step: 7, a: 0.2 + 0.15 * Math.sin(T * 4) } });
      ink(F, sub().M(cx - s * 0.25, cy + s * 0.55).L(cx + s * 0.25, cy + s * 0.55).M(cx - s * 0.22, cy + s * 0.72).L(cx + s * 0.22, cy + s * 0.72).M(cx - s * 0.12, cy + s * 0.88).L(cx + s * 0.12, cy + s * 0.88), { q: span(q, 0.4, 1), w: 2.4, seed: 1201 });
      const fil = sub().M(cx - s * 0.14, cy + s * 0.5).L(cx - s * 0.14, cy + s * 0.02);
      for (let k = 0; k <= 24; k++) { const t2 = k / 24, aa = t2 * 3 * TAU; fil.L(cx - s * 0.14 + t2 * s * 0.28, cy - s * 0.02 + Math.sin(aa) * s * 0.06); }
      fil.L(cx + s * 0.14, cy + s * 0.5);
      ink(F, fil, { q: span(q, 0.5, 1), w: 2, col: F.accRGB, seed: 1202, passes: 1 });
      for (let k = 0; k < 9; k++) { const a = -Math.PI * (0.05 + k * 0.1125) - 0.2, pul = 0.5 + 0.5 * Math.sin(T * 4 + k * 1.3), r0 = s * 0.85, r1 = r0 + s * (0.22 + 0.3 * pul); ink(F, sub().M(cx + Math.cos(a) * r0, cy - 10 * u + Math.sin(a) * r0).L(cx + Math.cos(a) * r1, cy - 10 * u + Math.sin(a) * r1), { q: span(q, 0.6, 1), w: 2.4, a: 0.8, col: F.accRGB, passes: 1, seed: 1210 + k }); }
    } else if (kind === 1) {
      gear(F, cx - s * 0.5, cy, s * 0.72, 10, q, T * 0.8, 1220, true);
      gear(F, cx + s * 0.78, cy - s * 0.3, s * 0.5, 7, q, -T * 0.8 * (10 / 7) + 0.3, 1230, false);
    } else if (kind === 2) {
      for (let k = 0; k < 5; k++) { const f = (T * 0.09 + k * 0.17) % 1; bird(F, cx - 220 * u + f * 440 * u, cy + (k % 3 - 1) * 42 * u + Math.sin(T * 1.7 + k) * 10 * u, (14 + (k % 2) * 4) * u, Math.sin(T * 8 + k * 1.3), 1240 + k); }
    } else if (kind === 3) {
      const r = s * 0.9;
      ink(F, sub().O(cx, cy, r).O(cx + 2 * u, cy + 1 * u, r * 0.96), { q, w: 3, seed: 1250 });
      for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU - Math.PI / 2; ink(F, sub().M(cx + Math.cos(a) * r * 0.82, cy + Math.sin(a) * r * 0.82).L(cx + Math.cos(a) * r * (k % 3 ? 0.92 : 0.72), cy + Math.sin(a) * r * (k % 3 ? 0.92 : 0.72)), { q: span(q, 0.3, 1), w: 2, passes: 1, seed: 1251 + k }); }
      const ma = T * 0.9 - Math.PI / 2, ha = T * 0.075 - Math.PI / 2;
      ink(F, sub().M(cx, cy).L(cx + Math.cos(ma) * r * 0.78, cy + Math.sin(ma) * r * 0.78), { q: span(q, 0.5, 1), w: 3, col: F.accRGB, passes: 1, seed: 1270 });
      ink(F, sub().M(cx, cy).L(cx + Math.cos(ha) * r * 0.5, cy + Math.sin(ha) * r * 0.5), { q: span(q, 0.5, 1), w: 4.4, passes: 1, seed: 1271 });
    } else {
      const sun = sub().O(cx - s * 0.2, cy, s * 0.48);
      shape(F, sun, { q, seed: 1280, w: 2.6, tint: { step: 7, a: 0.35 } });
      for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU + T * 0.6, r0 = s * 0.62, r1 = r0 + s * (0.18 + 0.1 * Math.sin(T * 3 + k)); ink(F, sub().M(cx - s * 0.2 + Math.cos(a) * r0, cy + Math.sin(a) * r0).L(cx - s * 0.2 + Math.cos(a) * r1, cy + Math.sin(a) * r1), { q: span(q, 0.4, 1), w: 2.4, col: F.accRGB, passes: 1, seed: 1281 + k }); }
      const dx = Math.sin(T * 0.5) * s * 0.4, cl = sub().M(cx + s * 0.3 + dx, cy + s * 0.7).Q(cx + s * 0.15 + dx, cy + s * 0.7, cx + s * 0.22 + dx, cy + s * 0.45).Q(cx + s * 0.35 + dx, cy + s * 0.2, cx + s * 0.6 + dx, cy + s * 0.4).Q(cx + s * 0.85 + dx, cy + s * 0.25, cx + s * 1.0 + dx, cy + s * 0.55).Q(cx + s * 1.2 + dx, cy + s * 0.58, cx + s * 1.1 + dx, cy + s * 0.7).Z();
      shape(F, cl, { q: span(q, 0.3, 1), seed: 1292, w: 2.4, hatch: { step: 8, a: 0.2 } });
    }
  }

  // ---- pages ----------------------------------------------------------------------------------------------------------
  const DRAW = { chart: (F, a, p, d, T, idx) => (idx % 2 ? drawChart : drawPie)(F, a, p, d, T), object: drawObject, people: drawPeople, process: drawProcess, compare: drawCompare };
  function renderPage(F, id, d, p, local, idx) {
    pageMarks(F, idx, local, id);
    if (id === "title") titleArt(F, local);
    else if (id === "closing") closingArt(F, local);
    else if (DRAW[id]) { cornerDoodle(F, id, local, idx); DRAW[id](F, areaOf(F, id), p, d, local, idx); }
  }
  // Draw one scene's page into the pencil layer and put it on the sheet. While the eraser runs, the old
  // page is kept to its right of the edge and the new one to its left.
  function runPage(ctx, S, info, id, d, p, outgoing) {
    const plan = planOf(), me = plan.shown.find((s) => s.id === id);
    if (!me) return;
    const F = frameOf(S, info), prev = plan.shown[me.i - 1], change = F.change;
    let k = 0, side = null;
    if (outgoing !== undefined) { k = outgoing; side = "right"; }
    else if (prev && info.local < change) { k = clamp(info.local / Math.max(0.01, change)); side = "left"; }
    // The page starts drawing the moment the eraser starts, front-loaded so several parts go down at once.
    const pp = outgoing !== undefined ? 1 : 1 - Math.pow(1 - clamp(info.local / Math.max(0.8, me.hold * 0.48)), 1.6);
    renderPage(F, id, d, pp, info.local, me.i);
    if (prev && outgoing === undefined && info.local < change + 1.8) { if (side === "left") eraserSprite(F, k); crumbs(F, info.local, k); }
    flush(ctx, F, side ? clipSide(F, k, side) : null);
  }
  // Headlines leave with the drawing: the eraser edge clips the outgoing scene's words to the right of it and
  // the incoming scene's words to the left, instead of the words fading ahead of the eraser.
  function eraseWords(S, info) {
    const plan = planOf(), root = document.getElementById("root");
    if (!root || !info.scene) return;
    const F = { W: S.W, H: S.H, u: S.u }, k = root.offsetWidth / S.W || 1, cur = plan.shown[info.index], prev = plan.shown[info.index - 1];
    const crossing = prev && info.local < info.change, e = crossing ? clamp(info.local / Math.max(0.01, info.change)) : 1;
    for (const sc of plan.shown) {
      const el = document.getElementById(sc.id + "-scene");
      if (!el) continue;
      el.classList.add("gr-own");
      const isCur = cur && sc.id === cur.id, isPrev = crossing && sc.id === prev.id;
      el.classList.toggle("gr-hide", !isCur && !isPrev);
      if (!crossing || (!isCur && !isPrev)) { el.style.clipPath = ""; continue; }
      const oy = el.offsetTop, pts = [], step = 40 * S.u;
      for (let y = -40 * S.u; y <= S.H + 40 * S.u + step; y += step) pts.push(`${(edgeX(F, y, e) * k).toFixed(1)}px ${((y - oy / k) * k).toFixed(1)}px`);
      const far = isPrev ? S.W * 2 * k : -S.W * k, y0 = (-60 * S.u - oy / k) * k, y1 = (S.H + 60 * S.u - oy / k) * k;
      el.style.clipPath = `polygon(${pts.join(",")},${far.toFixed(1)}px ${y1.toFixed(1)}px,${far.toFixed(1)}px ${y0.toFixed(1)}px)`;
    }
  }
  const scene = (id) => (ctx, S, box, p, d, info) => runPage(ctx, S, info, id, d, p, info.exit);

  // ---- tokens ---------------------------------------------------------------------------------------------------------
  const TONE = { paper: "#eee6d2", fibre: "120,98,62", stain: "130,92,44", ink: "40,42,48", vig: 0.3, gutter: 0.24, hole: 0.55, coil: "#3a3c42" };
  const halo = (paper) => () => `0 0 3px ${paper}, 0 0 14px ${paper}, 0 0 30px ${paper}`;
  return {
    bg: "#eee6d2", panel: "rgba(40,42,48,0.05)", ink: "#2b2d33", muted: "#6d6a62", accent: "#d4472b", onAccent: "#fbf6ea",
    rule: "rgba(43,45,51,0.7)", track: "rgba(43,45,51,0.1)", panelEdge: "rgba(43,45,51,0.55)",
    display: HAND, displayWeight: 700, displayCase: "none", displayTracking: "0.01em", body: HAND, bodyWeight: 700, figures: HAND,
    radius: 10, motion: "write", change: "fade", kit: { line: 2.6, fill: "none", panel: "outline", hatch: true },
    tone: TONE, keepArt: true, overlap: true,
    palettes: {
      // Cartridge: clean white paper. Silverpoint: pale lines on a dark toned sheet. Plain: graphite only.
      light: { bg: "#f8f6f0", ink: "#26282d", muted: "#707073", accent: "#cf4026", backdrop: () => "#f8f6f0", textShadow: halo("#f8f6f0"),
        tone: { ...TONE, paper: "#f8f6f0", fibre: "130,126,110", stain: "140,110,70", ink: "36,38,42", vig: 0.14, gutter: 0.2 } },
      dark: { bg: "#2a2c31", panel: "rgba(235,232,222,0.06)", ink: "#ebe8de", muted: "#a09e96", accent: "#ff946a", onAccent: "#2a2c31", rule: "rgba(235,232,222,0.6)", track: "rgba(235,232,222,0.12)", panelEdge: "rgba(235,232,222,0.55)",
        backdrop: () => "#2a2c31", textShadow: halo("#2a2c31"),
        tone: { ...TONE, paper: "#2a2c31", fibre: "255,255,255", stain: "255,255,255", ink: "232,229,218", vig: 0.5, gutter: 0.5, hole: 0.85, coil: "#a3a5ab" } },
      mono: { bg: "#efede6", ink: "#2b2b2b", muted: "#74726c", accent: "#2b2b2b", onAccent: "#efede6", backdrop: () => "#efede6", textShadow: halo("#efede6"),
        tone: { ...TONE, paper: "#efede6", fibre: "110,108,98", stain: "110,100,80", ink: "42,42,42", vig: 0.22 } },
    },
    textShadow: halo("#eee6d2"),
    backdrop: (accent, tex, look) => look.bg,
    css: (accent, look) => `
      .display { font-family: ${HAND}; font-weight: 700; text-transform: none; letter-spacing: 0.01em; line-height: 1.1; text-wrap: balance;
        color: ${look.ink}; text-shadow: 0.9px 0.7px 0 ${hexA(look.ink, 0.38)}, ${look.textShadow ? look.textShadow(accent) : "none"}; }
      .kicker { font-family: ${HAND}; font-weight: 700; text-transform: none; letter-spacing: 0.04em; color: ${accent}; font-size: 46px !important; text-shadow: ${look.textShadow ? look.textShadow(accent) : "none"}; }
      .statement { text-align: center; }
      .gr-own { opacity: 1 !important; transform: none !important; }
      .gr-hide { visibility: hidden !important; }
    `,
    paint: (ctx, W, H) => { ctx.clearRect(0, 0, W, H); },
    stage(ctx, S, info) {
      const F = frameOf(S, info);
      eraseWords(S, info);
      if (S.paint) paper(ctx, F);
      if (info.scene === "title" || info.scene === "closing") runPage(ctx, S, info, info.scene, null, 1);
      else if (info.scene && info.index > 0) {
        const prev = planOf().shown[info.index - 1];
        if (prev && (prev.id === "title" || prev.id === "closing") && info.local < info.change) runPage(ctx, S, { ...info, local: prev.hold + info.local, hold: prev.hold }, prev.id, null, 1, clamp(info.local / Math.max(0.01, info.change)));
      }
    },
    scenes: { chart: scene("chart"), object: scene("object"), people: scene("people"), process: scene("process"), compare: scene("compare") },
  };
});
