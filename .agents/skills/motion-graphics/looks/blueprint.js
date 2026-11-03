// Blueprint: one large drafted cyanotype sheet. White line-work bleeds slightly into mottled,
// sun-faded Prussian-blue paper with a zoned border, fold creases and a title block. Every scene
// is a station on the sheet; a drafting camera pans between them, pulling back mid-move so the
// rest of the sheet shows. Construction lines draw first, then the final line-work, hatching,
// dimensions and lettering. All drawings are original. Frames are pure functions of time.
window.DreamcutMotion.register("blueprint", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const inout = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const LETTER = "'Avenir Next Condensed', 'DIN Condensed', 'Roboto Condensed', 'Arial Narrow', sans-serif";

  const PITCH = 1.1;
  const TAGS = { chart: "DETAIL A · SCALE 1:10", object: "VIEW B · SCALE 1:2", people: "ELEVATION C · SCALE 1:20", process: "SECTION D-D · SCALE 1:5", compare: "SECTION E-E · SCALE 1:8" };
  const HEADS = { title: ["kicker", "title"], chart: ["chart-title"], object: ["object-title"], people: ["people-title"], process: ["process-title"], compare: ["compare-title"], closing: ["closing"] };

  // ---- paths that can be drawn part-way ------------------------------------------------------------
  // Coordinates pass through an optional offset and scale, so a design drawn in its own units can be placed anywhere.
  class Pth {
    constructor(ox = 0, oy = 0, s = 1) { this.s = []; this.c = null; this.ox = ox; this.oy = oy; this.k = s; this.n = -1; }
    _m(x, y) { this.c = [x, y]; this.s.push(this.c); return this; }
    _l(x, y) { if (!this.c) return this._m(x, y); this.c.push(x, y); return this; }
    M(x, y) { return this._m(this.ox + x * this.k, this.oy + y * this.k); }
    L(x, y) { return this._l(this.ox + x * this.k, this.oy + y * this.k); }
    Z() { if (this.c && this.c.length > 2) this.c.push(this.c[0], this.c[1]); return this; }
    E(cx, cy, rx, ry, a0, a1, move) {
      const X = this.ox + cx * this.k, Y = this.oy + cy * this.k, RX = rx * this.k, RY = ry * this.k;
      const steps = Math.max(6, Math.ceil((Math.abs(a1 - a0) * Math.max(RX, RY)) / 6));
      for (let i = 0; i <= steps; i++) {
        const a = a0 + ((a1 - a0) * i) / steps, x = X + Math.cos(a) * RX, y = Y + Math.sin(a) * RY;
        if (i === 0 && (move || !this.c)) this._m(x, y); else this._l(x, y);
      }
      return this;
    }
    A(cx, cy, r, a0, a1, move) { return this.E(cx, cy, r, r, a0, a1, move); }
    O(cx, cy, r) { return this.E(cx, cy, r, r, -Math.PI / 2, Math.PI * 1.5, true); }
    R(x, y, w, h) { return this.M(x, y).L(x + w, y).L(x + w, y + h).L(x, y + h).Z(); }
    RR(x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      this.M(x + r, y).L(x + w - r, y).A(x + w - r, y + r, r, -Math.PI / 2, 0).L(x + w, y + h - r).A(x + w - r, y + h - r, r, 0, Math.PI / 2);
      return this.L(x + r, y + h).A(x + r, y + h - r, r, Math.PI / 2, Math.PI).L(x, y + r).A(x + r, y + r, r, Math.PI, Math.PI * 1.5);
    }
    poly(pts, close) { pts.forEach(([x, y], i) => (i ? this.L(x, y) : this.M(x, y))); return close ? this.Z() : this; }
    trace(g) { for (const s of this.s) { g.moveTo(s[0], s[1]); for (let i = 2; i < s.length; i += 2) g.lineTo(s[i], s[i + 1]); } }
    len() {
      if (this.n >= 0) return this.n;
      let n = 0;
      for (const s of this.s) for (let i = 2; i < s.length; i += 2) n += Math.hypot(s[i] - s[i - 2], s[i + 1] - s[i - 1]);
      return (this.n = n);
    }
    // Stroke the first q of the path's length (q = 1 strokes it all).
    draw(g, q = 1) {
      if (q <= 0) return;
      g.beginPath();
      if (q >= 1) { this.trace(g); g.stroke(); return; }
      let left = this.len() * q;
      for (const s of this.s) {
        g.moveTo(s[0], s[1]);
        for (let i = 2; i < s.length; i += 2) {
          const dx = s[i] - s[i - 2], dy = s[i + 1] - s[i - 1], d = Math.hypot(dx, dy);
          if (d >= left) { const k = d ? left / d : 0; g.lineTo(s[i - 2] + dx * k, s[i - 1] + dy * k); g.stroke(); return; }
          left -= d;
          g.lineTo(s[i], s[i + 1]);
        }
      }
      g.stroke();
    }
  }
  const pen = (g, color, w, dash) => { g.strokeStyle = color; g.lineWidth = w; g.setLineDash(dash || []); g.lineCap = "round"; g.lineJoin = "round"; };

  // ---- lettering and drafting marks ----------------------------------------------------------------
  // Draftsman's lettering: condensed capitals that appear letter by letter as q runs.
  function say(g, s, x, y, size, o = {}) {
    s = String(s ?? "");
    if (o.upper !== false) s = s.toUpperCase();
    const q = o.q ?? 1;
    if (!s || q <= 0) return 0;
    g.font = `${o.weight || 600} ${size}px ${LETTER}`;
    g.letterSpacing = (o.track ?? 0.04) * size + "px";
    let w = g.measureText(s).width;
    if (o.maxW && w > o.maxW) {
      size = Math.max(o.min || size * 0.8, (size * o.maxW) / w);
      g.font = `${o.weight || 600} ${size}px ${LETTER}`;
      g.letterSpacing = (o.track ?? 0.04) * size + "px";
      w = g.measureText(s).width;
    }
    const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    g.textAlign = "left";
    g.textBaseline = o.base || "alphabetic";
    g.fillStyle = o.color;
    g.fillText(q >= 1 ? s : s.slice(0, Math.ceil(s.length * q)), x0, y);
    g.letterSpacing = "0px";
    return w;
  }
  function width(g, s, size, weight = 600) {
    g.font = `${weight} ${size}px ${LETTER}`;
    g.letterSpacing = 0.04 * size + "px";
    const w = g.measureText(String(s ?? "").toUpperCase()).width;
    g.letterSpacing = "0px";
    return w;
  }
  function arrow(g, x, y, ang, size, color) {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-size, -size * 0.3); g.lineTo(-size, size * 0.3); g.closePath();
    g.fillStyle = color; g.fill(); g.restore();
  }
  // A dimension: extension lines, a line that grows from its middle, arrowheads, then the figure.
  function dim(g, F, x1, y1, x2, y2, off, label, q, o = {}) {
    if (q <= 0) return;
    const { u } = F, col = o.color || F.ink(0.78), size = o.size || 24 * u;
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = uy, ny = -ux;
    const sg = Math.sign(off) || 1, ax = x1 + nx * off, ay = y1 + ny * off, bx = x2 + nx * off, by = y2 + ny * off;
    pen(g, col, 1.1 * u);
    new Pth().M(x1 + nx * 6 * u * sg, y1 + ny * 6 * u * sg).L(ax + nx * 10 * u * sg, ay + ny * 10 * u * sg)
      .M(x2 + nx * 6 * u * sg, y2 + ny * 6 * u * sg).L(bx + nx * 10 * u * sg, by + ny * 10 * u * sg).draw(g, span(q, 0, 0.35));
    const k = span(q, 0.2, 0.75), mx = (ax + bx) / 2, my = (ay + by) / 2;
    if (k > 0) new Pth().M(mx - (ux * L * k) / 2, my - (uy * L * k) / 2).L(mx + (ux * L * k) / 2, my + (uy * L * k) / 2).draw(g, 1);
    if (k >= 1) { arrow(g, ax, ay, Math.atan2(-uy, -ux), 13 * u, col); arrow(g, bx, by, Math.atan2(uy, ux), 13 * u, col); }
    if (!label) return;
    let ang = Math.atan2(uy, ux);
    if (ang > Math.PI / 2 + 0.01) ang -= Math.PI;
    if (ang < -Math.PI / 2 - 0.01) ang += Math.PI;
    g.save();
    g.translate(mx + nx * sg * size * 0.75, my + ny * sg * size * 0.75);
    g.rotate(ang);
    say(g, label, 0, 0, size, { align: "center", base: "middle", color: o.labelColor || col, q: span(q, 0.6, 1), weight: 500 });
    g.restore();
  }
  // Section hatching inside a closed path, revealed upward or rightward as q runs.
  function hatch(g, clip, x, y, w, h, step, q, color, lw, dir = "right", even) {
    if (q <= 0 || w <= 0 || h <= 0) return;
    g.save();
    g.beginPath(); clip.trace(g); g.clip(even ? "evenodd" : "nonzero");
    g.beginPath();
    if (dir === "up") g.rect(x - 2, y + h * (1 - q) - 2, w + 4, h * q + 4); else g.rect(x - 2, y - 2, w * q + 4, h + 4);
    g.clip();
    pen(g, color, lw);
    g.beginPath();
    for (let k = 0; k < w + h; k += step) { g.moveTo(x + k - h, y + h); g.lineTo(x + k, y); }
    g.stroke();
    g.restore();
  }
  // A revision cloud: scallops around a rectangle, drawn round as q runs.
  function cloud(x, y, w, h, r) {
    const P = new Pth();
    const side = (x1, y1, x2, y2, a0) => {
      const L = Math.hypot(x2 - x1, y2 - y1), n = Math.max(2, Math.round(L / (r * 1.7))), c = L / n;
      for (let i = 0; i < n; i++) {
        const cx = x1 + ((x2 - x1) * (i + 0.5)) / n, cy = y1 + ((y2 - y1) * (i + 0.5)) / n;
        P.A(cx, cy, c / 2 * 1.08, a0 - 0.1, a0 + Math.PI + 0.1);
      }
    };
    side(x, y, x + w, y, Math.PI);
    side(x + w, y, x + w, y + h, -Math.PI / 2);
    side(x + w, y + h, x, y + h, 0);
    side(x, y + h, x, y, Math.PI / 2);
    return P;
  }
  function delta(g, F, x, y, n, q, color) {
    if (q <= 0) return;
    const s = 24 * F.u;
    pen(g, color, 2 * F.u);
    new Pth().poly([[x, y - s], [x + s * 0.95, y + s * 0.62], [x - s * 0.95, y + s * 0.62]], true).draw(g, q);
    say(g, n, x, y + s * 0.18, 24 * F.u, { align: "center", base: "middle", color, q: span(q, 0.6, 1), weight: 700, track: 0 });
  }
  function balloon(g, F, x, y, n, q, color, tx, ty) {
    if (q <= 0) return;
    const r = 25 * F.u;
    pen(g, color, 1.8 * F.u);
    if (tx !== undefined) {
      const a = Math.atan2(ty - y, tx - x);
      new Pth().M(x + Math.cos(a) * r, y + Math.sin(a) * r).L(tx, ty).draw(g, span(q, 0, 0.6));
      if (q > 0.55) { g.beginPath(); g.arc(tx, ty, 4.5 * F.u, 0, TAU); g.fillStyle = color; g.fill(); }
    }
    new Pth().O(x, y, r).draw(g, span(q, 0.3, 0.8));
    say(g, n, x, y + 1 * F.u, 28 * F.u, { align: "center", base: "middle", color, q: span(q, 0.7, 1), weight: 700, track: 0 });
  }
  function centreLine(g, F, x1, y1, x2, y2, q, a = 0.45) {
    pen(g, F.ink(a), 1 * F.u, [26 * F.u, 6 * F.u, 4 * F.u, 6 * F.u]);
    new Pth().M(x1, y1).L(x2, y2).draw(g, q);
    g.setLineDash([]);
  }
  function construct(g, F, x1, y1, x2, y2, q, a = 0.3) {
    pen(g, F.ink(a), 0.9 * F.u);
    new Pth().M(x1, y1).L(x2, y2).draw(g, q);
  }
  function groundLine(g, F, x1, x2, y, q, color) {
    const { u } = F;
    pen(g, color || F.ink(0.95), 2.4 * u);
    new Pth().M(x1, y).L(x2, y).draw(g, q);
    pen(g, F.ink(0.5), 1 * u);
    const P = new Pth();
    for (let x = x1 + 10 * u; x < x2; x += 18 * u) P.M(x, y + 3 * u).L(x - 13 * u, y + 16 * u);
    P.draw(g, span(q, 0.3, 1));
  }
  const fmt = (v, d) => window.DreamcutMotion.formatNumber(v, Math.abs((Number(v) || 0) % 1) > 0.001 ? 1 : 0, (d && d.prefix) || "", (d && d.suffix) || "");
  // A figure counting toward its target keeps the target's own decimals on every frame.
  const tally = (target, k, d) => { const dec = Math.abs((Number(target) || 0) % 1) > 0.001 ? 1 : 0; return window.DreamcutMotion.formatNumber(target * k, dec, (d && d.prefix) || "", (d && d.suffix) || ""); };
  const niceStep = (x) => { const p = Math.pow(10, Math.floor(Math.log10(Math.max(x, 1e-6)))), m = x / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };

  // ---- chart: bar posts bolted to a ground plate, with a scale and a callout readout -----------------
  function chart(g, F, b, p, d) {
    const { u, tall, ink, acc } = F;
    const vals = (d.values || []).map((v) => Math.max(0, Number(v) || 0));
    const n = Math.max(1, vals.length), max = Math.max(...vals, 1);
    const hi = d.highlight >= 0 && d.highlight < n ? d.highlight : -1;
    const stepV = niceStep(max / 5), topV = Math.max(stepV, Math.ceil(max / stepV) * stepV);
    const R = tall ? { x: b.x, y: b.y, w: b.w, h: 290 * u } : { x: b.x + b.w - 420 * u, y: b.y + 20 * u, w: 420 * u, h: b.h - 130 * u };
    const P = tall ? { x: b.x + 110 * u, y: b.y + 420 * u, w: b.w - 110 * u, h: b.h - 520 * u } : { x: b.x + 110 * u, y: b.y + 90 * u, w: b.w - 110 * u - 500 * u, h: b.h - 190 * u };
    const base = P.y + P.h, slot = P.w / n, bw = Math.min(slot * 0.46, 180 * u), rx = P.x - 46 * u;
    // Scale.
    pen(g, ink(0.8), 1.4 * u);
    new Pth().M(rx, base).L(rx, P.y - 30 * u).draw(g, span(p, 0, 0.18));
    for (let v = 0, i = 0; v <= topV + 1e-9; v += stepV / 2, i++) {
      const y = base - (v / topV) * P.h, major = i % 2 === 0, q = span(p, 0.02 + i * 0.012, 0.12 + i * 0.012);
      pen(g, ink(0.8), 1.2 * u);
      new Pth().M(rx, y).L(rx - (major ? 16 : 8) * u, y).draw(g, q);
      if (major) say(g, fmt(v), rx - 22 * u, y, 24 * u, { align: "right", base: "middle", color: ink(0.7), q, weight: 500 });
    }
    groundLine(g, F, rx - 24 * u, P.x + P.w, base, span(p, 0.02, 0.28));
    let hot = null;
    vals.forEach((v, i) => {
      const cx = P.x + slot * (i + 0.5), x = cx - bw / 2, h = Math.max(30 * u, (v / topV) * P.h), top = base - h;
      const isHot = i === hi, col = isHot ? acc(1) : ink(0.95), s0 = 0.06 + i * 0.06;
      pen(g, ink(0.32), 0.9 * u, [10 * u, 7 * u]);
      new Pth().M(rx, top).L(x + bw + 36 * u, top).draw(g, span(p, s0, s0 + 0.2));
      centreLine(g, F, cx, base + 24 * u, cx, top - 30 * u, span(p, s0 + 0.04, s0 + 0.24), 0.4);
      const fq = span(p, s0 + 0.12, s0 + 0.3);
      pen(g, col, 2 * u);
      new Pth().R(x - 18 * u, base - 16 * u, bw + 36 * u, 16 * u).draw(g, fq);
      new Pth().O(x - 9 * u, base - 8 * u, 4 * u).O(x + bw + 9 * u, base - 8 * u, 4 * u).draw(g, fq);
      const outline = [[x, base - 16 * u], [x, top + 12 * u], [x + 12 * u, top], [x + bw - 12 * u, top], [x + bw, top + 12 * u], [x + bw, base - 16 * u]];
      pen(g, col, 2.4 * u);
      new Pth().poly(outline).draw(g, span(p, s0 + 0.14, s0 + 0.42));
      pen(g, col, 1.2 * u);
      new Pth().M(x, top + 12 * u).L(x + bw, top + 12 * u).draw(g, span(p, s0 + 0.34, s0 + 0.44));
      const fill = span(p, s0 + 0.3, s0 + 0.62);
      hatch(g, new Pth().poly(outline, true), x, top, bw, h - 16 * u, (isHot ? 11 : 16) * u, fill, isHot ? acc(0.8) : ink(0.42), 1.1 * u, "up");
      if (fill > 0) say(g, tally(v, ease(fill), d), cx, top - 22 * u, (isHot ? 58 : 50) * u, { align: "center", color: col, weight: 700, track: 0.02 });
      say(g, d.labels[i] || "", cx, base + 66 * u, 42 * u, { align: "center", color: ink(0.92), q: span(p, s0 + 0.3, s0 + 0.55), maxW: slot * 0.96, min: 34 * u });
      if (isHot) hot = { cx, x, top, v, label: d.labels[i] || "" };
    });
    if (!hot) return;
    // The readout: a drafted box with the highlighted figure, joined to its post by a leader.
    const rq = span(p, 0.42, 0.7);
    pen(g, ink(0.9), 2 * u);
    new Pth().R(R.x, R.y, R.w, R.h).draw(g, rq);
    pen(g, ink(0.6), 1.2 * u);
    new Pth().M(R.x, R.y + 50 * u).L(R.x + R.w, R.y + 50 * u).M(R.x + R.w - 110 * u, R.y).L(R.x + R.w - 110 * u, R.y + 50 * u).draw(g, rq);
    say(g, "DETAIL A · READOUT", R.x + 20 * u, R.y + 25 * u, 22 * u, { base: "middle", color: ink(0.75), q: rq, weight: 500 });
    say(g, "1 : 1", R.x + R.w - 55 * u, R.y + 25 * u, 22 * u, { align: "center", base: "middle", color: ink(0.75), q: rq, weight: 500 });
    const vq = span(p, 0.55, 0.85);
    const lx = R.x + 34 * u, ly = R.y + (tall ? 92 : 128) * u, ny = R.y + (tall ? 264 : 290) * u;
    say(g, hot.label, lx, ly, 42 * u, { base: "middle", color: ink(0.95), q: vq, maxW: R.w - 70 * u });
    const nw = say(g, tally(hot.v, ease(vq), d), lx, ny, 132 * u, { q: vq > 0 ? 1 : 0, color: acc(1), weight: 700, track: 0.01, maxW: R.w - (tall ? 260 : 90) * u, min: 96 * u });
    pen(g, acc(0.9), 2 * u);
    cloud(lx - 18 * u, ny - 122 * u, Math.max(nw, 120 * u) + 36 * u, 140 * u, 20 * u).draw(g, span(p, 0.78, 1));
    delta(g, F, lx + Math.max(nw, 120 * u) + 52 * u, ny - 122 * u, "1", span(p, 0.88, 1), acc(1));
    const others = vals.filter((_, i) => i !== hi);
    if (others.length) {
      const mean = others.reduce((s, v) => s + v, 0) / others.length;
      const pct = mean > 0 ? Math.round(((hot.v - mean) / mean) * 100) : 0;
      const note = tall ? `${pct >= 0 ? "+" : ""}${pct}% vs mean` : `${pct >= 0 ? "+" : ""}${pct}% against the mean`;
      say(g, note, tall ? R.x + R.w - 30 * u : lx, tall ? ly : R.y + R.h - 40 * u, 28 * u, { align: tall ? "right" : "left", base: "middle", color: ink(0.8), q: span(p, 0.7, 0.95), weight: 500 });
    }
    if (!tall) {
      const ly0 = R.y + 350 * u, room = R.y + R.h - 90 * u - ly0, rh = Math.min(52 * u, room / Math.max(1, n));
      pen(g, ink(0.5), 1 * u);
      new Pth().M(R.x + 20 * u, ly0 - 26 * u).L(R.x + R.w - 20 * u, ly0 - 26 * u).draw(g, span(p, 0.6, 0.8));
      vals.forEach((v, i) => {
        const y = ly0 + rh * (i + 0.5), q = span(p, 0.62 + i * 0.05, 0.82 + i * 0.05), col = i === hi ? acc(1) : ink(0.85);
        const bx0 = R.x + 130 * u, bwMax = R.w - 250 * u;
        say(g, d.labels[i] || "", R.x + 28 * u, y, 24 * u, { base: "middle", color: col, q, maxW: 96 * u, weight: 600 });
        pen(g, col, 1.4 * u);
        const bar = new Pth().R(bx0, y - 9 * u, Math.max(4 * u, (bwMax * v) / max), 18 * u);
        bar.draw(g, q);
        if (i === hi) hatch(g, bar, bx0, y - 9 * u, (bwMax * v) / max, 18 * u, 7 * u, q, acc(0.8), 1 * u);
        say(g, tally(v, ease(q), d), R.x + R.w - 28 * u, y, 26 * u, { align: "right", base: "middle", color: col, q: q > 0 ? 1 : 0, weight: 700 });
      });
    }
    // Leader from the highlighted post to the readout.
    pen(g, acc(0.95), 1.8 * u);
    const sx = hot.x + bw, sy = hot.top + 6 * u;
    const leader = tall ? new Pth().M(hot.cx, hot.top - 80 * u).L(hot.cx, R.y + R.h) : new Pth().M(sx, sy).L(sx + 40 * u, R.y + 140 * u).L(R.x, R.y + 140 * u);
    leader.draw(g, span(p, 0.6, 0.8));
    if (p > 0.6) { g.beginPath(); g.arc(tall ? hot.cx : sx, tall ? hot.top - 80 * u : sy, 5 * u, 0, TAU); g.fillStyle = acc(1); g.fill(); }
  }

  // ---- object: an orthographic set of a laptop or phone, a detail view and a parts list ------------
  // The device's screen shows a small edit: a preview, clips on tracks and a playhead that runs.
  function deviceScreen(g, F, P, phone, q, t) {
    const { u, ink, acc } = F, k = P.k;
    const sub = () => new Pth(P.ox, P.oy, k);
    const S = phone ? { x: 30, y: 64, w: 200, h: 230, ty: 316, tw: 200 } : { x: 40, y: 40, w: 560, h: 186, ty: 240, tw: 560 };
    pen(g, ink(0.85), 1.5 * u);
    sub().R(S.x, S.y, S.w, S.h).draw(g, span(q, 0, 0.4));
    pen(g, ink(0.6), 1.2 * u);
    const m = S.h / 186;
    sub().poly([[S.x, S.y + 160 * m], [S.x + S.w * 0.2, S.y + 82 * m], [S.x + S.w * 0.34, S.y + 128 * m], [S.x + S.w * 0.5, S.y + 58 * m], [S.x + S.w * 0.72, S.y + 150 * m], [S.x + S.w * 0.86, S.y + 104 * m], [S.x + S.w, S.y + 150 * m]]).draw(g, span(q, 0.15, 0.5));
    sub().O(S.x + S.w * 0.82, S.y + 40 * m, 15).draw(g, span(q, 0.2, 0.5));
    pen(g, ink(0.9), 1.6 * u);
    const pcx = S.x + S.w / 2, pcy = S.y + S.h / 2;
    sub().poly([[pcx - 12, pcy - 16], [pcx + 18, pcy], [pcx - 12, pcy + 16]], true).draw(g, span(q, 0.3, 0.5));
    // Ruler and tracks.
    pen(g, ink(0.6), 1 * u);
    const ruler = sub().M(S.x, S.ty).L(S.x + S.tw, S.ty);
    for (let x = 0; x <= S.tw; x += S.tw / 20) ruler.M(S.x + x, S.ty).L(S.x + x, S.ty - (x % (S.tw / 4) < 1 ? 9 : 5));
    ruler.draw(g, span(q, 0.3, 0.55));
    const th = phone ? 24 : 26, gap = phone ? 10 : 12;
    const rows = [[[0, 0.2], [0.22, 0.27, 1], [0.51, 0.49]], [[0.06, 0.3], [0.4, 0.34]]];
    rows.forEach((clips, r) => clips.forEach(([a, w, isHot], i) => {
      const y = S.ty + 12 + r * (th + gap), x = S.x + S.tw * a, cw = S.tw * w - 4;
      const cq = span(q, 0.4 + (r * 3 + i) * 0.05, 0.6 + (r * 3 + i) * 0.05);
      if (cq <= 0) return;
      const box = sub().R(x, y, cw, th);
      if (isHot) {
        pen(g, acc(1), 2 * u, [8 * u, 5 * u]); box.draw(g, cq); g.setLineDash([]);
        hatch(g, box, P.ox + x * k, P.oy + y * k, cw * k, th * k, 8 * u, cq, acc(0.7), 1 * u);
      } else { pen(g, ink(0.85), 1.4 * u); box.draw(g, cq); }
    }));
    const wy = S.ty + 12 + 2 * (th + gap) + th / 2;
    pen(g, ink(0.75), 1.2 * u);
    const wave = sub();
    for (let i = 0; i <= 120; i++) {
      const x = S.x + (S.tw * i) / 120, a = (Math.sin(i * 0.9) * 0.6 + Math.sin(i * 0.37) * 0.4) * (th * 0.42) * (0.4 + 0.6 * Math.abs(Math.sin(i * 0.11)));
      if (i % 2) wave.L(x, wy + a); else (i ? wave.L(x, wy - a) : wave.M(x, wy));
    }
    wave.draw(g, span(q, 0.55, 0.85));
    if (q > 0.8) {
      const px = S.x + S.tw * ((t * 0.11 + 0.35) % 1);
      pen(g, acc(1), 1.8 * u);
      sub().M(px, S.ty - 8).L(px, wy + th * 0.6).draw(g, 1);
      g.beginPath(); g.moveTo(P.ox + (px - 6) * k, P.oy + (S.ty - 14) * k); g.lineTo(P.ox + (px + 6) * k, P.oy + (S.ty - 14) * k); g.lineTo(P.ox + px * k, P.oy + (S.ty - 4) * k); g.closePath(); g.fillStyle = acc(1); g.fill();
    }
    return [[pcx, S.y + S.h * 0.5 - 30 * m], [S.x + S.tw * 0.355, S.ty + 12 + th / 2], [S.x + S.tw * 0.62, wy]].map(([x, y]) => [P.ox + x * k, P.oy + y * k]);
  }
  function object(g, F, b, p, d) {
    const { u, tall, ink, acc } = F, phone = d.kind === "phone";
    const L = {};
    // Layout: front view, side view, detail circle and a parts list, arranged for the canvas shape.
    if (!phone && !tall) {
      L.s = Math.min(1.05 * u, (b.h - 190 * u) / 426, (b.w - 670 * u) / 1101);
      L.ox = b.x + 80 * u; L.oy = b.y + Math.max(100 * u, (b.h - 426 * L.s - 170 * u) / 2 + 100 * u);
      L.hx = L.ox + 660 * L.s + 70 * u + 121 * L.s; L.hy = L.oy + 400 * L.s;
      L.tx = L.hx + 300 * L.s + 80 * u; L.ty = Math.max(b.y, L.oy - 86 * u); L.tw = b.x + b.w - L.tx;
      L.dr = Math.min(150 * u, (b.y + b.h - L.ty - 360 * u) / 2); L.dx = L.tx + L.tw / 2; L.dy = L.ty + 320 * u + L.dr; L.ss = L.s;
    } else if (!phone) {
      L.s = Math.min((b.w - 90 * u) / 680, 1.0 * u * 1);
      L.ox = b.x + 70 * u; L.oy = b.y + 96 * u;
      L.ss = L.s * 0.66; L.hx = b.x + 60 * u + 121 * L.ss; L.hy = L.oy + 426 * L.s + 70 * u + 400 * L.ss;
      L.dr = 130 * u; L.dx = b.x + b.w - L.dr - 30 * u; L.dy = L.hy - 140 * L.ss;
      L.tx = b.x; L.ty = b.y + b.h - 278 * u; L.tw = b.w;
    } else if (!tall) {
      L.s = Math.min(0.98 * u, (b.h - 120 * u) / 520);
      L.ox = b.x + 70 * u; L.oy = b.y + 96 * u + Math.max(0, (b.h - 120 * u - 520 * L.s) / 2);
      L.sx = L.ox + 260 * L.s + 110 * u;
      L.tx = b.x + b.w - 520 * u; L.ty = Math.max(b.y, L.oy - 86 * u); L.tw = 520 * u;
      L.dr = Math.min(170 * u, (L.tx - (L.sx + 36 * L.s) - 80 * u) / 2); L.dx = L.sx + 36 * L.s + 40 * u + L.dr; L.dy = b.y + b.h * 0.5 + 20 * u;
    } else {
      L.s = Math.min((b.h - 420 * u) / 520, 1.1 * u);
      L.ox = b.x + 80 * u; L.oy = b.y + 90 * u;
      L.sx = L.ox + 260 * L.s + 90 * u;
      L.dr = Math.min(150 * u, (b.x + b.w - (L.sx + 36 * L.s) - 60 * u) / 2); L.dx = b.x + b.w - L.dr - 10 * u; L.dy = L.oy + 260 * L.s;
      L.tx = b.x; L.ty = b.y + b.h - 278 * u; L.tw = b.w;
    }
    const P = new Pth(L.ox, L.oy, L.s), sub = () => new Pth(L.ox, L.oy, L.s);
    const fw = phone ? 260 : 640, fh = phone ? 520 : 426;
    // Construction: centre lines and projection lines first.
    const cq = span(p, 0, 0.3);
    centreLine(g, F, L.ox + (fw / 2) * L.s, L.oy - 30 * u, L.ox + (fw / 2) * L.s, L.oy + fh * L.s + 30 * u, cq);
    centreLine(g, F, L.ox - 30 * u, L.oy + (phone ? fh / 2 : 200) * L.s, L.ox + fw * L.s + 30 * u, L.oy + (phone ? fh / 2 : 200) * L.s, cq);
    if (!tall) {
      const toX = phone ? L.sx + 36 * L.s + 20 * u : L.hx + 320 * L.s;
      (phone ? [0, 520] : [0, 400, 426]).forEach((y, i) => construct(g, F, L.ox + fw * L.s + 14 * u, L.oy + y * L.s, toX, L.oy + y * L.s, span(p, 0.05 + i * 0.04, 0.3 + i * 0.04), 0.28));
    }
    // Front view.
    const oq = span(p, 0.05, 0.38);
    pen(g, ink(0.95), 2.4 * u);
    if (phone) {
      sub().RR(0, 0, 260, 520, 36).draw(g, oq);
      pen(g, ink(0.8), 1.5 * u);
      sub().RR(12, 14, 236, 492, 26).draw(g, span(p, 0.12, 0.4));
      sub().RR(104, 28, 52, 14, 7).draw(g, span(p, 0.2, 0.4));
    } else {
      sub().RR(0, 0, 640, 400, 14).draw(g, oq);
      pen(g, ink(0.8), 1.5 * u);
      sub().RR(20, 22, 600, 356, 4).draw(g, span(p, 0.12, 0.4));
      sub().O(320, 11, 4).draw(g, span(p, 0.2, 0.4));
      pen(g, ink(0.95), 2.4 * u);
      sub().poly([[-20, 400], [660, 400], [652, 426], [-12, 426]], true).draw(g, span(p, 0.18, 0.42));
      pen(g, ink(0.7), 1.3 * u);
      sub().poly([[270, 426], [282, 419], [358, 419], [370, 426]]).R(40, 426, 60, 6).R(540, 426, 60, 6).draw(g, span(p, 0.3, 0.45));
    }
    const anchors = deviceScreen(g, F, P, phone, span(p, 0.28, 0.66), F.t);
    // Side view, projected from the front view.
    const sq = span(p, 0.25, 0.55);
    pen(g, ink(0.95), 2.4 * u);
    if (phone) {
      const ss = tall ? L.s : L.s, S = new Pth(L.sx, L.oy, ss);
      S.RR(0, 0, 36, 520, 14).draw(g, sq);
      pen(g, ink(0.75), 1.4 * u);
      new Pth(L.sx, L.oy, ss).R(36, 120, 5, 60).R(36, 200, 5, 40).R(-5, 150, 5, 70).M(6, 0).L(6, 520).draw(g, span(p, 0.35, 0.55));
      dim(g, F, L.sx, L.oy + 520 * ss, L.sx + 36 * ss, L.oy + 520 * ss, -40 * u, "8", span(p, 0.5, 0.72));
    } else {
      const ss = L.ss, hx = L.hx, hy = L.hy, dx = -0.2588, dy = -0.9659, nx = -0.9659, ny = 0.2588, len = 414, th = 14;
      const S = () => new Pth(hx, hy, ss);
      S().R(0, 0, 300, 26).draw(g, sq);
      S().poly([[0, 0], [dx * len, dy * len], [dx * len + nx * th, dy * len + ny * th], [nx * th, ny * th]], true).draw(g, sq);
      pen(g, ink(0.7), 1.3 * u);
      S().O(-4, 6, 9).R(20, 26, 30, 5).R(250, 26, 30, 5).draw(g, span(p, 0.35, 0.55));
      pen(g, ink(0.65), 1.1 * u);
      S().A(0, 0, 120, -1.8326, 0, true).draw(g, span(p, 0.45, 0.65));
      say(g, "105°", hx + Math.cos(-0.92) * 150 * ss, hy + Math.sin(-0.92) * 150 * ss, 26 * u, { align: "center", base: "middle", color: ink(0.8), q: span(p, 0.55, 0.7), weight: 500 });
      dim(g, F, hx, hy + 26 * ss, hx + 300 * ss, hy + 26 * ss, -40 * u, "235", span(p, 0.5, 0.72));
    }
    // Dimensions on the front view.
    if (phone) {
      dim(g, F, L.ox, L.oy + 520 * L.s, L.ox + 260 * L.s, L.oy + 520 * L.s, -40 * u, "72", span(p, 0.45, 0.7));
      dim(g, F, L.ox, L.oy, L.ox, L.oy + 520 * L.s, -40 * u, "148", span(p, 0.48, 0.72));
    } else {
      dim(g, F, L.ox - 20 * L.s, L.oy + 426 * L.s, L.ox + 660 * L.s, L.oy + 426 * L.s, -42 * u, "340", span(p, 0.45, 0.7));
      dim(g, F, L.ox, L.oy, L.ox, L.oy + 400 * L.s, -42 * u, "220", span(p, 0.48, 0.72));
    }
    // Detail A: the proposed clip, enlarged.
    const [ax, ay] = anchors[1], dq = span(p, 0.62, 0.92);
    pen(g, ink(0.7), 1.2 * u, [7 * u, 5 * u]);
    new Pth().O(ax, ay, 46 * u).draw(g, dq);
    g.setLineDash([]);
    say(g, "A", ax - 58 * u, ay - 44 * u, 26 * u, { align: "center", base: "middle", color: ink(0.85), q: dq, weight: 700 });
    pen(g, ink(0.9), 2 * u);
    new Pth().O(L.dx, L.dy, L.dr).draw(g, dq);
    if (dq > 0.3) {
      g.save();
      g.beginPath(); g.arc(L.dx, L.dy, L.dr - 3 * u, 0, TAU); g.clip();
      const cw = L.dr * 1.25, ch = L.dr * 0.42, cx = L.dx - cw / 2, cy = L.dy - ch * 0.9, k2 = span(dq, 0.3, 1);
      pen(g, ink(0.55), 1.2 * u, [8 * u, 6 * u]);
      new Pth().R(cx - L.dr * 0.3, cy + ch * 1.35, cw * 0.8, ch).draw(g, k2);
      g.setLineDash([]);
      const clipBox = new Pth().R(cx, cy, cw, ch);
      pen(g, acc(1), 2.2 * u);
      clipBox.draw(g, k2);
      hatch(g, clipBox, cx, cy, cw, ch, 11 * u, k2, acc(0.65), 1.1 * u);
      pen(g, acc(1), 3 * u);
      new Pth().M(cx + 12 * u, cy - 6 * u).L(cx - 2 * u, cy - 6 * u).L(cx - 2 * u, cy + ch + 6 * u).L(cx + 12 * u, cy + ch + 6 * u)
        .M(cx + cw - 12 * u, cy - 6 * u).L(cx + cw + 2 * u, cy - 6 * u).L(cx + cw + 2 * u, cy + ch + 6 * u).L(cx + cw - 12 * u, cy + ch + 6 * u).draw(g, k2);
      dim(g, F, cx, cy, cx + cw, cy, 24 * u, "+12 FR", span(dq, 0.5, 1), { color: acc(0.9) });
      g.restore();
    }
    say(g, "DETAIL A  2 : 1", L.dx, L.dy + L.dr + 34 * u, 24 * u, { align: "center", color: ink(0.8), q: span(p, 0.8, 0.95), weight: 500 });
    pen(g, ink(0.55), 1 * u);
    const toward = Math.atan2(L.dy - ay, L.dx - ax);
    new Pth().M(ax + Math.cos(toward) * 46 * u, ay + Math.sin(toward) * 46 * u).L(L.dx - Math.cos(toward) * L.dr, L.dy - Math.sin(toward) * L.dr).draw(g, span(dq, 0, 0.5));
    // Balloons above the front view, with leaders down to the parts they name.
    const top = L.oy - 60 * u, bxs = phone ? [L.ox + 40 * u, L.ox + 140 * L.s, L.ox + 230 * L.s] : [L.ox + 470 * L.s, L.ox + 140 * L.s, L.ox + 600 * L.s];
    anchors.forEach(([x, y], i) => balloon(g, F, bxs[i], top, i + 1, span(p, 0.5 + i * 0.08, 0.72 + i * 0.08), i === 1 ? acc(1) : ink(0.95), x, y));
    // Parts list.
    const tq = span(p, 0.55, 0.8), rh = 78 * u, hh = 44 * u, nc = 76 * u;
    pen(g, ink(0.9), 2 * u);
    new Pth().R(L.tx, L.ty, L.tw, hh + rh * 3).draw(g, tq);
    pen(g, ink(0.6), 1.2 * u);
    const grid = new Pth().M(L.tx + nc, L.ty).L(L.tx + nc, L.ty + hh + rh * 3);
    for (let i = 0; i < 3; i++) grid.M(L.tx, L.ty + hh + rh * i).L(L.tx + L.tw, L.ty + hh + rh * i);
    grid.draw(g, tq);
    say(g, "ITEM", L.tx + nc / 2, L.ty + hh / 2, 20 * u, { align: "center", base: "middle", color: ink(0.7), q: tq, weight: 500 });
    say(g, "DESCRIPTION", L.tx + nc + 18 * u, L.ty + hh / 2, 20 * u, { base: "middle", color: ink(0.7), q: tq, weight: 500 });
    d.callouts.forEach((label, i) => {
      const y = L.ty + hh + rh * (i + 0.5), q = span(p, 0.62 + i * 0.07, 0.82 + i * 0.07), col = i === 1 ? acc(1) : ink(0.95);
      say(g, String(i + 1), L.tx + nc / 2, y, 34 * u, { align: "center", base: "middle", color: col, q, weight: 700 });
      say(g, label || "", L.tx + nc + 18 * u, y + 2 * u, 42 * u, { base: "middle", color: col, q, maxW: L.tw - nc - 34 * u, min: 32 * u });
    });
    pen(g, acc(0.85), 2 * u);
    cloud(L.tx + nc + 6 * u, L.ty + hh + rh + 8 * u, L.tw - nc - 12 * u, rh - 16 * u, 16 * u).draw(g, span(p, 0.86, 1));
  }

  // ---- people: articulated drafting figures in elevation, and a plan of the room -------------------
  function capsule(P, x1, y1, x2, y2, w) {
    const a = Math.atan2(y2 - y1, x2 - x1), r = w / 2;
    P.A(x2, y2, r, a - Math.PI / 2, a + Math.PI / 2, true).A(x1, y1, r, a + Math.PI / 2, a + Math.PI * 1.5).Z();
  }
  const POSES = [
    { l: [0.25, 0.05], r: [-0.25, -0.05] },
    { l: [0.2, 0.0], r: [-1.25, -1.6] },
    { l: [0.9, 1.9], r: [-0.18, -0.05] },
    { l: [0.15, -0.9], r: [-0.15, 0.9] },
    { l: [0.35, 1.3], r: [-0.35, -1.3] },
    { l: [0.1, 0.1], r: [-0.6, -1.95] },
  ];
  function figure(g, F, cx, ground, h, pose, q, color) {
    const { u } = F, P = new Pth(), j = [];
    const head = h * 0.065, sy = ground - h * 0.8, hipY = ground - h * 0.47;
    P.O(cx, ground - h + head, head);
    P.M(cx, ground - h + head * 2).L(cx, sy - h * 0.01);
    P.M(cx - h * 0.13, sy).L(cx + h * 0.13, sy).L(cx + h * 0.085, hipY - h * 0.03).L(cx - h * 0.085, hipY - h * 0.03).Z();
    P.RR(cx - h * 0.1, hipY - h * 0.03, h * 0.2, h * 0.07, h * 0.02);
    const limb = (x, y, a1, a2, l1, l2, w) => {
      const ex = x + Math.sin(a1) * l1, ey = y + Math.cos(a1) * l1, wx = ex + Math.sin(a2) * l2, wy = ey + Math.cos(a2) * l2;
      capsule(P, x, y, ex, ey, w); capsule(P, ex, ey, wx, wy, w * 0.85);
      j.push([x, y], [ex, ey]);
      return [wx, wy];
    };
    limb(cx - h * 0.15, sy + h * 0.02, pose.l[0], pose.l[1], h * 0.17, h * 0.16, h * 0.05);
    limb(cx + h * 0.15, sy + h * 0.02, pose.r[0], pose.r[1], h * 0.17, h * 0.16, h * 0.05);
    const fl = limb(cx - h * 0.055, hipY + h * 0.03, 0.04, 0.0, h * 0.235, h * 0.22, h * 0.065);
    const fr = limb(cx + h * 0.055, hipY + h * 0.03, -0.04, 0.0, h * 0.235, h * 0.22, h * 0.065);
    P.M(fl[0] + h * 0.01, ground - h * 0.01).L(fl[0] - h * 0.07, ground - h * 0.01);
    P.M(fr[0] - h * 0.01, ground - h * 0.01).L(fr[0] + h * 0.07, ground - h * 0.01);
    pen(g, color, 2.2 * u);
    P.draw(g, q);
    if (q > 0.7) {
      pen(g, color, 1.4 * u);
      const J = new Pth();
      for (const [x, y] of j) J.O(x, y, h * 0.018);
      J.draw(g, span(q, 0.7, 1));
    }
  }
  function plan(g, F, R, n, hi, q, t) {
    const { u, ink, acc } = F, wt = 14 * u;
    const room = new Pth().R(R.x, R.y, R.w, R.h), inner = new Pth().R(R.x + wt, R.y + wt, R.w - wt * 2, R.h - wt * 2);
    pen(g, ink(0.95), 2.2 * u);
    room.draw(g, span(q, 0, 0.4)); inner.draw(g, span(q, 0.05, 0.45));
    const walls = new Pth().R(R.x, R.y, R.w, R.h).R(R.x + wt, R.y + wt, R.w - wt * 2, R.h - wt * 2);
    hatch(g, walls, R.x, R.y, R.w, R.h, 9 * u, span(q, 0.3, 0.6), ink(0.55), 1 * u, "right", true);
    // Door: a gap in the bottom wall with its swing.
    const dw = Math.min(90 * u, R.w * 0.22), dx = R.x + R.w - dw - 40 * u, dy = R.y + R.h - wt;
    g.save(); g.globalCompositeOperation = "destination-out"; g.fillRect(dx, dy - 2, dw, wt + 4); g.restore();
    pen(g, ink(0.8), 1.4 * u);
    new Pth().M(dx, dy).L(dx, dy - dw).A(dx, dy, dw, -Math.PI / 2, 0).draw(g, span(q, 0.4, 0.6));
    // Screen on the top wall and a table with the people around it.
    const sw = R.w * 0.4, sx = R.x + (R.w - sw) / 2, sy = R.y + wt + 8 * u;
    pen(g, acc(0.95), 2.4 * u);
    new Pth().R(sx, sy, sw, 10 * u).draw(g, span(q, 0.4, 0.6));
    const tcx = R.x + R.w / 2, tcy = R.y + R.h * 0.58, tw = R.w * 0.42, th = R.h * 0.28;
    pen(g, ink(0.9), 2 * u);
    new Pth().RR(tcx - tw / 2, tcy - th / 2, tw, th, 18 * u).draw(g, span(q, 0.35, 0.6));
    for (let i = 0; i < n; i++) {
      const a = Math.PI * 0.12 + (Math.PI * 1.76 * (i + 0.5)) / n, px = tcx + Math.cos(a) * (tw / 2 + 34 * u), py = tcy + Math.sin(a) * (th / 2 + 34 * u);
      const k = span(q, 0.5 + i * 0.05, 0.7 + i * 0.05), col = i === hi ? acc(1) : ink(0.9);
      if (k <= 0) continue;
      const face = Math.atan2(sy - py, sx + sw / 2 - px);
      g.save(); g.translate(px, py); g.rotate(face + Math.PI / 2);
      pen(g, col, 1.8 * u);
      new Pth().E(0, 0, 26 * u, 12 * u, 0, TAU, true).O(0, 0, 11 * u).draw(g, k);
      g.restore();
      if (k > 0.9) {
        pen(g, i === hi ? acc(0.7) : ink(0.3), 1 * u, [5 * u, 6 * u]);
        new Pth().M(px, py).L(sx + sw / 2, sy + 10 * u).draw(g, span(q, 0.8, 1));
        g.setLineDash([]);
      }
    }
    say(g, "PLAN · REVIEW ROOM", R.x, R.y + R.h + 34 * u, 24 * u, { color: ink(0.8), q: span(q, 0.6, 0.9), weight: 500 });
    // North arrow.
    const nx = R.x + R.w - 22 * u, ny = R.y + R.h + 30 * u;
    pen(g, ink(0.8), 1.4 * u);
    new Pth().O(nx, ny, 16 * u).M(nx, ny + 12 * u).L(nx, ny - 22 * u).draw(g, span(q, 0.6, 0.9));
  }
  function people(g, F, b, p, d) {
    const { u, tall, ink, acc } = F;
    const n = Math.max(2, Math.min(6, Math.round(Number(d.count) || 3)));
    const hi = Math.min(n - 1, d.highlight ?? 1);
    const planR = tall ? { x: b.x + b.w * 0.18, y: b.y + 10 * u, w: b.w * 0.64, h: 300 * u } : { x: b.x + b.w * 0.75, y: b.y + 30 * u, w: b.w * 0.25, h: b.h * 0.66 };
    const area = tall ? { x: b.x, y: b.y + 400 * u, w: b.w, h: b.h - 400 * u } : { x: b.x, y: b.y, w: b.w * 0.7, h: b.h };
    const rows = tall && n > 3 ? 2 : 1, per = Math.ceil(n / rows), rowH = area.h / rows;
    for (let r = 0; r < rows; r++) {
      const ground = area.y + rowH * (r + 1) - 110 * u, count = Math.min(per, n - r * per), slot = area.w / per;
      const h = Math.min(rowH - 200 * u, slot * 1.9);
      groundLine(g, F, area.x, area.x + area.w, ground, span(p, 0.02 + r * 0.1, 0.3 + r * 0.1));
      for (let k = 0; k < count; k++) {
        const i = r * per + k, cx = area.x + slot * (k + 0.5 + (per - count) / 2), isHot = i === hi, col = isHot ? acc(1) : ink(0.95);
        const s0 = 0.08 + i * 0.07;
        centreLine(g, F, cx, ground + 14 * u, cx, ground - h - 50 * u, span(p, s0, s0 + 0.2), 0.32);
        construct(g, F, cx - slot * 0.42, ground - h, cx + slot * 0.42, ground - h, span(p, s0, s0 + 0.18), 0.3);
        figure(g, F, cx, ground, h, POSES[i % POSES.length], span(p, s0 + 0.08, s0 + 0.45), col);
        if (i === 0) dim(g, F, cx - slot * 0.36, ground, cx - slot * 0.36, ground - h, -0.01, "1750", span(p, 0.4, 0.65));
        balloon(g, F, cx + h * 0.2, ground - h - 6 * u, i + 1, span(p, s0 + 0.35, s0 + 0.5), col);
        // Figures beyond the named roles get an open tag, drawn dashed.
        const open = !d.badges[i], label = d.badges[i] || "—";
        const lq = span(p, s0 + 0.38, s0 + 0.6);
        // Long tags wrap onto two lines rather than shrinking past legibility.
        let lines = [label], size = Math.min(42 * u, Math.max(34 * u, (42 * u * slot * 0.9) / Math.max(1, width(g, label, 42 * u) + 40 * u)));
        if (width(g, label, size) + 36 * u > slot * 0.94 && label.includes(" ")) {
          const words = label.split(" ");
          let best = 1, gap = Infinity;
          for (let k = 1; k < words.length; k++) { const d2 = Math.abs(width(g, words.slice(0, k).join(" "), 36 * u) - width(g, words.slice(k).join(" "), 36 * u)); if (d2 < gap) { gap = d2; best = k; } }
          lines = [words.slice(0, best).join(" "), words.slice(best).join(" ")];
          size = Math.max(30 * u, Math.min(38 * u, (38 * (slot * 0.92 - 36 * u)) / Math.max(1, ...lines.map((l) => width(g, l, 38)))));
        }
        const tw = Math.max(...lines.map((l) => width(g, l, size))) + 36 * u, ty = ground + 22 * u, th = size * 1.1 * lines.length + 22 * u;
        pen(g, col, 1.8 * u, open ? [8 * u, 6 * u] : []);
        new Pth().R(cx - tw / 2, ty, tw, th).draw(g, lq);
        g.setLineDash([]);
        lines.forEach((l, li) => say(g, l, cx, ty + 11 * u + size * 1.1 * (li + 0.5) + 2 * u, size, { align: "center", base: "middle", color: col, q: lq }));
        if (isHot) {
          pen(g, acc(0.85), 2 * u);
          cloud(cx - tw / 2 - 14 * u, ty - 12 * u, tw + 28 * u, th + 24 * u, 15 * u).draw(g, span(p, 0.8, 1));
          delta(g, F, cx + tw / 2 + 34 * u, ty - 6 * u, "2", span(p, 0.88, 1), acc(1));
        }
      }
    }
    plan(g, F, planR, n, hi, span(p, 0.3, 0.95), F.t);
  }

  // ---- process: a conveyor through three machines; frames ride the belt and change at each one -----
  function process(g, F, b, p, d) {
    const { u, tall, ink, acc, t } = F;
    // The mechanism is drawn in its own frame, scaled up when the scene has room.
    const k = tall ? clamp((b.w * 0.42 - 40 * u) / (300 * u), 1, 1.25) : clamp(b.h / (640 * u), 1, 1.3), oy = b.y + b.h - 250 * u * k;
    const Lm = ((tall ? b.h : b.w) - 80 * u) / k, R = 30 * u;
    g.save();
    if (tall) { g.translate(b.x + b.w * 0.42, b.y + 40 * u); g.rotate(Math.PI / 2); g.scale(k, -k); } else { g.translate(b.x + 40 * u, oy); g.scale(k, k); }
    const st = [0, 1, 2].map((i) => (Lm * (i + 0.5)) / 3);
    // Belt, pulleys and idlers.
    const bq = span(p, 0, 0.35);
    pen(g, ink(0.95), 2.4 * u);
    new Pth().M(0, 0).L(Lm, 0).A(Lm, R, R, -Math.PI / 2, Math.PI / 2).L(0, 2 * R).A(0, R, R, Math.PI / 2, Math.PI * 1.5).draw(g, bq);
    const spin = t * 2.4;
    for (const x of [0, Lm]) {
      pen(g, ink(0.85), 1.6 * u);
      const P = new Pth().O(x, R, R * 0.62).O(x, R, 5 * u);
      for (let k = 0; k < 5; k++) { const a = spin + (k * TAU) / 5; P.M(x + Math.cos(a) * 5 * u, R + Math.sin(a) * 5 * u).L(x + Math.cos(a) * R * 0.62, R + Math.sin(a) * R * 0.62); }
      P.draw(g, span(p, 0.1, 0.35));
    }
    pen(g, ink(0.6), 1.2 * u);
    const idl = new Pth();
    for (let x = Lm / 8; x < Lm - 10 * u; x += Lm / 8) idl.O(x, R, R * 0.38);
    idl.draw(g, span(p, 0.15, 0.4));
    // Belt texture moves with the belt.
    if (bq >= 1) {
      pen(g, ink(0.45), 1 * u);
      const pitch = 34 * u, off = (t * Lm * 0.11) % pitch, T = new Pth();
      for (let x = off; x < Lm; x += pitch) T.M(x, 3 * u).L(x - 8 * u, 9 * u);
      T.draw(g, 1);
    }
    // Legs (or wall brackets when upright).
    const lq = span(p, 0.1, 0.4);
    if (!tall) {
      for (const f of [0.06, 0.5, 0.94]) {
        const x = Lm * f;
        pen(g, ink(0.9), 2 * u);
        new Pth().M(x - 14 * u, 2 * R).L(x - 14 * u, 2 * R + 92 * u).M(x + 14 * u, 2 * R).L(x + 14 * u, 2 * R + 92 * u).R(x - 30 * u, 2 * R + 92 * u, 60 * u, 10 * u).draw(g, lq);
        pen(g, ink(0.5), 1 * u);
        new Pth().M(x - 14 * u, 2 * R + 10 * u).L(x + 14 * u, 2 * R + 60 * u).M(x + 14 * u, 2 * R + 10 * u).L(x - 14 * u, 2 * R + 60 * u).draw(g, lq);
      }
      groundLine(g, F, -20 * u, Lm + 20 * u, 2 * R + 102 * u, span(p, 0.05, 0.35));
    } else {
      for (const f of [0.06, 0.5, 0.94]) {
        const x = Lm * f;
        pen(g, ink(0.9), 2 * u);
        new Pth().M(x, 2 * R).L(x, 2 * R + 50 * u).M(x - 30 * u, 2 * R + 50 * u).L(x + 30 * u, 2 * R + 50 * u).draw(g, lq);
      }
    }
    // Machines.
    const mq = (i) => span(p, 0.18 + i * 0.12, 0.5 + i * 0.12);
    { // 1: a gantry scanner whose head sweeps.
      const x = st[0], q = mq(0), cx = x + Math.sin(t * 1.7) * 36 * u;
      pen(g, ink(0.95), 2.2 * u);
      new Pth().R(x - 96 * u, -232 * u, 14 * u, 232 * u).R(x + 82 * u, -232 * u, 14 * u, 232 * u).R(x - 110 * u, -252 * u, 220 * u, 22 * u).draw(g, q);
      pen(g, ink(0.85), 1.8 * u);
      new Pth().R(cx - 34 * u, -228 * u, 68 * u, 46 * u).O(cx, -166 * u, 16 * u).O(cx, -166 * u, 7 * u).draw(g, span(q, 0.3, 0.9));
      if (q > 0.8) {
        pen(g, acc(0.7), 1.2 * u, [6 * u, 6 * u]);
        new Pth().M(cx, -150 * u).L(cx - 46 * u, -2 * u).M(cx, -150 * u).L(cx + 46 * u, -2 * u).draw(g, span(q, 0.8, 1));
        g.setLineDash([]);
      }
      hatch(g, new Pth().R(x - 96 * u, -232 * u, 14 * u, 232 * u).R(x + 82 * u, -232 * u, 14 * u, 232 * u), x - 96 * u, -232 * u, 192 * u, 232 * u, 9 * u, span(q, 0.5, 1), ink(0.45), 1 * u, "up");
    }
    { // 2: a two-link drafting arm that traces over the frame below it.
      const x = st[1], q = mq(1), bx = x - 120 * u, by = -60 * u, l1 = 130 * u, l2 = 120 * u;
      const tx = x + Math.sin(t * 2.3) * 34 * u, ty = -44 * u - Math.abs(Math.sin(t * 4.6)) * 10 * u;
      const dx = tx - bx, dy = ty - by, dd = Math.min(l1 + l2 - 1, Math.hypot(dx, dy));
      const a = Math.atan2(dy, dx) - Math.acos(clamp((l1 * l1 + dd * dd - l2 * l2) / (2 * l1 * dd), -1, 1));
      const ex = bx + Math.cos(a) * l1, ey = by + Math.sin(a) * l1;
      pen(g, ink(0.95), 2.2 * u);
      new Pth().R(bx - 30 * u, by, 60 * u, -by).draw(g, q);
      hatch(g, new Pth().R(bx - 30 * u, by, 60 * u, -by), bx - 30 * u, by, 60 * u, -by, 9 * u, span(q, 0.4, 1), ink(0.45), 1 * u, "up");
      const arm = new Pth();
      capsule(arm, bx, by, ex, ey, 26 * u);
      capsule(arm, ex, ey, tx, ty - 22 * u, 20 * u);
      arm.O(bx, by, 9 * u).O(ex, ey, 9 * u).M(tx, ty - 22 * u).L(tx, ty);
      pen(g, ink(0.9), 1.9 * u);
      arm.draw(g, span(q, 0.2, 1));
    }
    { // 3: a stamp press that strikes on a cycle.
      const x = st[2], q = mq(2), cyc = (t * 0.75) % 1, ext = cyc < 0.18 ? Math.sin((cyc / 0.18) * Math.PI) : 0;
      const headY = -150 * u + ext * 108 * u;
      pen(g, ink(0.95), 2.2 * u);
      const frame = new Pth().M(x + 70 * u, 0).L(x + 70 * u, -260 * u).L(x - 40 * u, -260 * u).M(x + 100 * u, 0).L(x + 100 * u, -284 * u).L(x - 40 * u, -284 * u).L(x - 40 * u, -260 * u);
      frame.draw(g, q);
      hatch(g, new Pth().R(x + 70 * u, -284 * u, 30 * u, 284 * u), x + 70 * u, -284 * u, 30 * u, 284 * u, 9 * u, span(q, 0.4, 1), ink(0.45), 1 * u, "up");
      pen(g, ink(0.9), 1.9 * u);
      new Pth().R(x - 30 * u, -258 * u, 60 * u, 70 * u).M(x, -188 * u).L(x, headY - 26 * u).R(x - 40 * u, headY - 26 * u, 80 * u, 26 * u).draw(g, span(q, 0.2, 1));
      if (q > 0.9) {
        pen(g, acc(1), 2.6 * u);
        new Pth().M(x - 12 * u, headY - 14 * u).L(x - 3 * u, headY - 6 * u).L(x + 14 * u, headY - 22 * u).draw(g, 1);
      }
    }
    // Frames ride the belt and change state after each machine.
    if (p > 0.45) {
      const vis = span(p, 0.45, 0.7), pitch = Lm / 4.3, off = (t * Lm * 0.11) % pitch;
      for (let x = off - pitch; x < Lm + pitch; x += pitch) {
        const edge = clamp(Math.min(x, Lm - x) / (60 * u));
        if (edge <= 0) continue;
        const state = x < st[0] ? 0 : x < st[1] ? 1 : x < st[2] ? 2 : 3, fw = 74 * u, fh = 40 * u, fx = x - fw / 2, fy = -fh;
        g.save(); g.globalAlpha *= vis * edge;
        const col = state === 3 ? acc(1) : ink(0.95);
        const box = new Pth().R(fx, fy, fw, fh);
        pen(g, col, 1.8 * u, state === 0 ? [6 * u, 5 * u] : []);
        box.draw(g, 1);
        g.setLineDash([]);
        pen(g, col, 1 * u);
        const holes = new Pth();
        for (let k = 0; k < 5; k++) holes.R(fx + 6 * u + k * 14 * u, fy + 4 * u, 6 * u, 5 * u).R(fx + 6 * u + k * 14 * u, fy + fh - 9 * u, 6 * u, 5 * u);
        holes.draw(g, 1);
        if (state >= 1) new Pth().R(fx + 10 * u, fy + 12 * u, fw - 20 * u, fh - 24 * u).draw(g, 1);
        if (state >= 2) hatch(g, new Pth().R(fx + 10 * u, fy + 12 * u, fw - 20 * u, fh - 24 * u), fx, fy, fw, fh, 6 * u, 1, col, 0.9 * u);
        g.restore();
      }
    }
    g.restore();
    // Step labels with balloons, upright whatever the mechanism's orientation.
    d.steps.forEach((label, i) => {
      const q = span(p, 0.45 + i * 0.1, 0.68 + i * 0.1), col = i === 2 ? acc(1) : ink(0.95);
      if (tall) {
        const y = b.y + 40 * u + st[i] * k, x = b.x + b.w * 0.42 + (2 * R + 50 * u) * k + 20 * u;
        balloon(g, F, x + 26 * u, y, i + 1, q, col);
        say(g, label, x + 70 * u, y + 2 * u, 42 * u, { base: "middle", color: col, q, maxW: b.x + b.w - x - 70 * u, min: 32 * u });
      } else {
        const x = b.x + 40 * u + st[i] * k, y = oy + (2 * R + 150 * u) * k, room = (Lm * k) / 3 - 90 * u;
        const w = width(g, label, 42 * u);
        balloon(g, F, x - Math.min(w, room) / 2 - 16 * u, y - 14 * u, i + 1, q, col);
        say(g, label, x + 20 * u, y, 42 * u, { align: "center", color: col, q, maxW: room, min: 32 * u });
      }
    });
    // Flow arrow over the machines.
    if (!tall) {
      const y = oy - 320 * u * k, q = span(p, 0.6, 0.85), X = (i) => b.x + 40 * u + st[i] * k;
      pen(g, ink(0.55), 1.2 * u, [12 * u, 8 * u]);
      new Pth().M(X(0), y).L(X(2), y).draw(g, q);
      g.setLineDash([]);
      if (q >= 1) arrow(g, X(2), y, 0, 16 * u, ink(0.7));
      say(g, "FLOW", X(1), y - 16 * u, 22 * u, { align: "center", color: ink(0.7), q, weight: 500 });
    }
  }

  // ---- compare: two vessels in section, filled to their values, joined by a valve ------------------
  function tank(g, F, cx, top, bottom, w, level, q, color, t, seed) {
    const { u, ink } = F, wt = 16 * u, dome = w * 0.22;
    const shape = (x0, w0, t0, b0, d0) => new Pth().M(x0 - w0 / 2, t0).L(x0 - w0 / 2, b0 - d0).E(x0, b0 - d0, w0 / 2, d0, Math.PI, 0).L(x0 + w0 / 2, t0);
    const outer = shape(cx, w, top, bottom, dome), inner = shape(cx, w - wt * 2, top, bottom - wt, dome - wt * 0.6);
    pen(g, color, 2.4 * u);
    outer.draw(g, span(q, 0, 0.4)); inner.draw(g, span(q, 0.08, 0.45));
    const walls = shape(cx, w, top, bottom, dome).Z();
    const hole = shape(cx, w - wt * 2, top, bottom - wt, dome - wt * 0.6).Z();
    walls.s.push(...hole.s);
    hatch(g, walls, cx - w / 2, top, w, bottom - top, 9 * u, span(q, 0.3, 0.6), ink(0.5), 1 * u, "up", true);
    // Flange, lid and bolts.
    pen(g, color, 2 * u);
    new Pth().R(cx - w / 2 - 22 * u, top - 18 * u, w + 44 * u, 18 * u).M(cx - w / 2 + 6 * u, top - 18 * u).E(cx, top - 18 * u, w / 2 - 6 * u, w * 0.16, Math.PI, TAU).draw(g, span(q, 0.25, 0.55));
    pen(g, ink(0.7), 1.2 * u);
    const bolts = new Pth();
    for (let k = 0; k < 6; k++) { const x = cx - w / 2 - 12 * u + (k * (w + 24 * u)) / 5; bolts.M(x, top - 24 * u).L(x, top + 6 * u); }
    bolts.draw(g, span(q, 0.4, 0.6));
    centreLine(g, F, cx, top - w * 0.24, cx, bottom + 24 * u, span(q, 0, 0.3), 0.35);
    // Liquid in section: horizontal water dashes under a moving surface.
    const innerTop = top, innerBottom = bottom - wt, H = innerBottom - innerTop, ly = innerBottom - H * level;
    if (level > 0.002) {
      g.save();
      g.beginPath(); hole.trace(g); g.clip();
      g.beginPath(); g.rect(cx - w, ly - 10 * u, w * 2, bottom - ly + 20 * u); g.clip();
      pen(g, color, 1.1 * u);
      const r = rng(seed), W2 = new Pth();
      for (let y = ly + 16 * u; y < innerBottom; y += 15 * u) {
        let x = cx - w / 2 + wt + r() * 20 * u;
        while (x < cx + w / 2 - wt) { const len = (16 + r() * 34) * u; W2.M(x, y).L(Math.min(x + len, cx + w / 2), y); x += len + (10 + r() * 16) * u; }
      }
      W2.draw(g, 1);
      pen(g, color, 2 * u);
      const surf = new Pth();
      for (let i = 0; i <= 40; i++) { const x = cx - w / 2 + (w * i) / 40; const y = ly + Math.sin(i * 0.7 + t * 3.2) * 2.6 * u; i ? surf.L(x, y) : surf.M(x, y); }
      surf.draw(g, 1);
      g.restore();
      // Water-level mark.
      const mx = cx + w * 0.22, my = ly - 6 * u;
      pen(g, color, 1.6 * u);
      new Pth().poly([[mx - 12 * u, my - 18 * u], [mx + 12 * u, my - 18 * u], [mx, my]], true).M(mx - 14 * u, my + 10 * u).L(mx + 14 * u, my + 10 * u).M(mx - 8 * u, my + 17 * u).L(mx + 8 * u, my + 17 * u).draw(g, 1);
    }
    return { ly, innerBottom };
  }
  function compare(g, F, b, p, d) {
    const { u, tall, ink, acc, t } = F;
    const a = Math.max(0, Number(d.leftValue) || 0), c = Math.max(0, Number(d.rightValue) || 0), max = Math.max(a, c, 1);
    const fill = ease(span(p, 0.35, 0.85));
    const tw = tall ? 250 * u : 270 * u;
    const top = b.y + (tall ? 70 : 60) * u, bottom = tall ? b.y + b.h - 340 * u : b.y + b.h - 40 * u;
    const xs = tall ? [b.x + b.w * 0.26, b.x + b.w * 0.74] : [b.x + 380 * u + tw / 2, b.x + b.w - 380 * u - tw / 2];
    const rows = [[d.left, a, ink(0.95)], [d.right, c, acc(1)]];
    const res = rows.map(([, v, col], i) => tank(g, F, xs[i], top, bottom, tw, (v / max) * 0.84 * fill, span(p, i * 0.08, 0.6 + i * 0.08), col, t, 11 + i));
    rows.forEach(([label, v, col], i) => {
      const q = span(p, 0.4 + i * 0.1, 0.7 + i * 0.1), x = xs[i];
      // Gauge beside the vessel.
      const gx = i === 0 ? x - tw / 2 - 46 * u : x + tw / 2 + 46 * u, inner = res[i].innerBottom, H = inner - top;
      pen(g, ink(0.75), 1.3 * u);
      const G = new Pth().M(gx, inner).L(gx, top);
      for (let k = 0; k <= 10; k++) { const y = inner - (H * 0.84 * k) / 10, l = (k % 5 === 0 ? 16 : 8) * u * (i === 0 ? -1 : 1); G.M(gx, y).L(gx + l, y); }
      G.draw(g, span(p, 0.2, 0.5));
      if (fill > 0) {
        pen(g, col, 1.4 * u);
        new Pth().M(gx, res[i].ly).L(x + (i === 0 ? -1 : 1) * (tw / 2 - 16 * u), res[i].ly).draw(g, 1);
        arrow(g, gx, res[i].ly, i === 0 ? 0 : Math.PI, 12 * u, col);
      }
      const num = tally(v, fill, d);
      if (tall) {
        say(g, label, x, bottom + 80 * u, 42 * u, { align: "center", color: ink(0.92), q, maxW: b.w * 0.46, min: 32 * u });
        say(g, num, x, bottom + 220 * u, 132 * u, { align: "center", color: col, weight: 700, track: 0.01, q: span(q, 0, 0.4), maxW: b.w * 0.46, min: 96 * u });
      } else {
        const nx = i === 0 ? b.x : b.x + b.w;
        say(g, label, nx, b.y + b.h * 0.42, 42 * u, { align: i === 0 ? "left" : "right", color: ink(0.92), q, maxW: 330 * u, min: 32 * u });
        say(g, num, nx, b.y + b.h * 0.42 + 150 * u, 140 * u, { align: i === 0 ? "left" : "right", color: col, weight: 700, track: 0.01, q: span(q, 0, 0.4), maxW: 340 * u, min: 96 * u });
        pen(g, ink(0.5), 1 * u);
        new Pth().M(nx + (i === 0 ? 0 : -330 * u), b.y + b.h * 0.42 + 180 * u).L(nx + (i === 0 ? 330 * u : 0), b.y + b.h * 0.42 + 180 * u).draw(g, q);
      }
    });
    // Pipe and valve between the vessels.
    const py = bottom - tw * 0.24 - 30 * u, x1 = xs[0] + tw / 2, x2 = xs[1] - tw / 2, mx = (x1 + x2) / 2, pq = span(p, 0.3, 0.6);
    pen(g, ink(0.9), 2 * u);
    new Pth().M(x1, py - 14 * u).L(mx - 34 * u, py - 14 * u).M(x1, py + 14 * u).L(mx - 34 * u, py + 14 * u).M(mx + 34 * u, py - 14 * u).L(x2, py - 14 * u).M(mx + 34 * u, py + 14 * u).L(x2, py + 14 * u).draw(g, pq);
    pen(g, ink(0.95), 2.2 * u);
    new Pth().poly([[mx - 34 * u, py - 26 * u], [mx + 34 * u, py + 26 * u], [mx + 34 * u, py - 26 * u], [mx - 34 * u, py + 26 * u]], true).M(mx, py).L(mx, py - 70 * u).M(mx - 30 * u, py - 70 * u).L(mx + 30 * u, py - 70 * u).draw(g, span(p, 0.4, 0.65));
    if (p > 0.65) {
      const k = (t * 0.6) % 1;
      pen(g, acc(0.9), 2 * u);
      new Pth().M(lerp(x1 + 10 * u, mx - 70 * u, k), py).L(lerp(x1 + 10 * u, mx - 70 * u, k) + 30 * u, py).draw(g, 1);
      arrow(g, lerp(x1 + 10 * u, mx - 70 * u, k) + 40 * u, py, 0, 14 * u, acc(0.9));
    }
    // The difference, clouded in the accent.
    const diff = c - a, label = `Δ ${diff >= 0 ? "+" : "−"}${tally(Math.abs(diff), fill, d)}`, dq = span(p, 0.75, 1);
    const dy = tall ? top + 120 * u : top + 90 * u, dw = width(g, label, 64 * u, 700);
    say(g, label, mx, dy, 64 * u, { align: "center", base: "middle", color: acc(1), weight: 700, q: dq });
    pen(g, acc(0.85), 2 * u);
    cloud(mx - dw / 2 - 24 * u, dy - 50 * u, dw + 48 * u, 100 * u, 16 * u).draw(g, span(p, 0.82, 1));
    pen(g, ink(0.4), 1 * u, [6 * u, 6 * u]);
    new Pth().M(mx, dy + 56 * u).L(mx, py - 80 * u).draw(g, dq);
    g.setLineDash([]);
  }

  const DRAW = { chart, object, people, process, compare };
  // ---- decorative drawings that fill the rest of the sheet -----------------------------------------
  function gear(g, F, cx, cy, r, teeth, q, rot) {
    const { u, ink } = F, P = new Pth();
    for (let i = 0; i <= teeth * 4; i++) {
      const a = rot + (i * TAU) / (teeth * 4), rr = i % 4 === 1 || i % 4 === 2 ? r : r * 0.86;
      i ? P._l(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : P._m(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    pen(g, ink(0.85), 1.8 * u);
    P.draw(g, q);
    pen(g, ink(0.7), 1.3 * u);
    new Pth().O(cx, cy, r * 0.3).O(cx, cy, r * 0.12).draw(g, q);
    pen(g, ink(0.4), 1 * u, [10 * u, 5 * u, 3 * u, 5 * u]);
    new Pth().O(cx, cy, r * 0.93).M(cx - r * 1.15, cy).L(cx + r * 1.15, cy).M(cx, cy - r * 1.15).L(cx, cy + r * 1.15).draw(g, q);
    g.setLineDash([]);
  }
  function bolt(g, F, x, y, s, q) {
    const { u, ink } = F, P = new Pth(x, y, s);
    P.poly([[0, 0], [60, 0], [60, 40], [0, 40]], true).M(0, 12).L(60, 12).M(0, 28).L(60, 28).R(60, 8, 150, 24);
    for (let k = 0; k < 14; k++) P.M(100 + k * 8, 8).L(104 + k * 8, 32);
    pen(g, ink(0.8), 1.5 * u);
    P.draw(g, q);
    centreLine(g, F, x - 16 * u, y + 20 * s, x + 226 * s, y + 20 * s, q, 0.35);
  }
  function notes(g, F, x, y, lines, size, q) {
    lines.forEach((s, i) => say(g, s, x, y + i * size * 1.6, size, { color: F.ink(0.72), q: span(q, i * 0.12, 0.4 + i * 0.12), weight: 500 }));
  }
  function filmstrip(g, F, x, y, w, h, q) {
    const { u, ink } = F, P = new Pth().R(x, y, w, h), fw = h * 1.5;
    for (let fx = x + fw; fx < x + w - 2; fx += fw) P.M(fx, y + h * 0.2).L(fx, y + h * 0.8);
    for (let hx = x + 12 * u; hx < x + w - 18 * u; hx += 26 * u) P.R(hx, y + 6 * u, 12 * u, h * 0.1).R(hx, y + h - 6 * u - h * 0.1, 12 * u, h * 0.1);
    pen(g, ink(0.85), 1.5 * u);
    P.draw(g, q);
    let i = 0;
    for (let fx = x; fx + fw <= x + w; fx += fw, i++) if (i < 4) dim(g, F, fx, y + h, fx + fw, y + h, -28 * u, "24", span(q, 0.4 + i * 0.1, 0.8 + i * 0.05));
  }
  function slider(g, F, ox, oy, s, q) {
    // A camera slider: a rail on two end blocks, a carriage and a camera, in front elevation and plan.
    const { u, ink } = F, P = () => new Pth(ox, oy, s);
    pen(g, ink(0.9), 2 * u);
    P().R(0, 160, 1100, 26).R(0, 196, 1100, 14).R(-40, 140, 60, 110).R(1080, 140, 60, 110).draw(g, q);
    P().RR(420, 112, 200, 48, 8).RR(450, 30, 140, 82, 10).O(620, 70, 34).O(620, 70, 20).R(500, 10, 40, 20).draw(g, span(q, 0.2, 0.8));
    pen(g, ink(0.6), 1.2 * u);
    P().M(-60, 250).L(-90, 330).M(20, 250).L(50, 330).M(1080, 250).L(1050, 330).M(1160, 250).L(1190, 330).draw(g, span(q, 0.3, 0.8));
    hatch(g, P().R(-40, 140, 60, 110).R(1080, 140, 60, 110), ox - 40 * s, oy + 140 * s, 1180 * s, 110 * s, 9 * u, span(q, 0.5, 1), ink(0.45), 1 * u);
    dim(g, F, ox - 40 * s, oy + 250 * s, ox + 1140 * s, oy + 250 * s, -110 * u, "1200", span(q, 0.5, 1));
    dim(g, F, ox + 420 * s, oy + 112 * s, ox + 620 * s, oy + 112 * s, 40 * u, "200", span(q, 0.6, 1));
    pen(g, ink(0.85), 1.6 * u);
    P().R(0, 420, 1100, 60).R(420, 400, 200, 100).O(520, 450, 22).draw(g, span(q, 0.4, 1));
    say(g, "FRONT ELEVATION", ox + 550 * s, oy + 380 * s, 24 * u, { align: "center", color: ink(0.8), q, weight: 500 });
    say(g, "PLAN", ox + 550 * s, oy + 560 * s, 24 * u, { align: "center", color: ink(0.8), q, weight: 500 });
  }
  function knob(g, F, cx, top, s, q) {
    // An exploded view of a control dial: cap, knurled knob, washer, nut and shaft along one axis.
    const { u, ink } = F, P = () => new Pth(cx, top, s);
    centreLine(g, F, cx, top - 30 * u, cx, top + 760 * s, q, 0.4);
    pen(g, ink(0.9), 1.8 * u);
    P().E(0, 0, 70, 16, 0, TAU, true).M(-70, 0).L(-70, 26).E(0, 26, 70, 16, Math.PI, 0).L(70, 0).draw(g, span(q, 0, 0.4));
    const kn = P().E(0, 120, 110, 26, 0, TAU, true).M(-110, 120).L(-110, 230).E(0, 230, 110, 26, Math.PI, 0).L(110, 120);
    for (let k = -100; k <= 100; k += 14) kn.M(k, 128 + 26 * Math.sqrt(1 - (k / 110) ** 2) * 0.7).L(k, 240);
    kn.draw(g, span(q, 0.1, 0.6));
    P().E(0, 330, 80, 18, 0, TAU, true).E(0, 330, 30, 7, 0, TAU, true).draw(g, span(q, 0.3, 0.7));
    P().poly([[-60, 420], [60, 420], [60, 470], [-60, 470]], true).M(-20, 420).L(-20, 470).M(20, 420).L(20, 470).draw(g, span(q, 0.4, 0.8));
    P().R(-16, 540, 32, 200).draw(g, span(q, 0.5, 0.9));
    const parts = [[0, 13], [110, 175], [80, 330], [60, 445], [16, 640]];
    parts.forEach(([x, y], i) => balloon(g, F, cx + 230 * s, top + y * s, i + 1, span(q, 0.5 + i * 0.08, 0.8 + i * 0.04), ink(0.85), cx + x * s, top + y * s));
    say(g, "EXPLODED VIEW · DIAL ASSEMBLY", cx, top + 820 * s, 24 * u, { align: "center", color: ink(0.8), q, weight: 500 });
  }

  // The title station: compass construction, a drafted film strip and a revision table.
  function titleDecor(g, F, q) {
    const { u, W, H, tall, ink } = F;
    const cx = W * (tall ? 0.62 : 0.74), cy = H * (tall ? 0.36 : 0.42), r = Math.min(W, H) * 0.36;
    pen(g, ink(0.32), 1 * u);
    new Pth().A(cx, cy, r, -2.6, 1.3, true).draw(g, span(q, 0, 0.5));
    pen(g, ink(0.22), 1 * u, [12 * u, 8 * u]);
    new Pth().A(cx, cy, r * 0.62, -3.0, 2.0, true).draw(g, span(q, 0.1, 0.6));
    g.setLineDash([]);
    construct(g, F, cx - r * 1.2, cy, cx + r * 1.1, cy, span(q, 0, 0.4), 0.3);
    construct(g, F, cx, cy - r * 1.1, cx, cy + r * 1.1, span(q, 0.05, 0.45), 0.3);
    pen(g, ink(0.6), 1.2 * u);
    new Pth().O(cx, cy, 8 * u).M(cx, cy).L(cx + Math.cos(-0.6) * r, cy + Math.sin(-0.6) * r).draw(g, span(q, 0.3, 0.6));
    say(g, "R 400", cx + Math.cos(-0.6) * r * 0.55, cy + Math.sin(-0.6) * r * 0.55 - 14 * u, 22 * u, { color: ink(0.6), q: span(q, 0.5, 0.7), weight: 500 });
    gear(g, F, cx + r * 0.62, cy + r * 0.62, r * 0.32, 18, span(q, 0.2, 0.8), F.t * 0.15);
    gear(g, F, cx + r * 0.62 - r * 0.53, cy + r * 0.62 + r * 0.06, r * 0.2, 11, span(q, 0.3, 0.85), -F.t * 0.15 * (18 / 11) + 0.14);
    const fy = tall ? H * 0.8 : H * 0.8, fx = (tall ? 90 : 140) * u;
    filmstrip(g, F, fx, fy, W - fx * 2, 74 * u, span(q, 0.25, 0.9));
    // Scale bar and general notes between the title and the strip.
    const sy = H * (tall ? 0.7 : 0.69), sw = (tall ? 420 : 520) * u, cell = sw / 5, sb = new Pth().R(fx, sy, sw, 16 * u);
    for (let k = 1; k < 5; k++) sb.M(fx + cell * k, sy).L(fx + cell * k, sy + 16 * u);
    pen(g, ink(0.85), 1.4 * u); sb.draw(g, span(q, 0.3, 0.6));
    for (let k = 0; k < 5; k += 2) hatch(g, new Pth().R(fx + cell * k, sy, cell, 16 * u), fx + cell * k, sy, cell, 16 * u, 6 * u, span(q, 0.5, 0.8), ink(0.7), 1 * u);
    ["0", "1 S", "2 S", "3 S", "4 S", "5 S"].forEach((s, k) => say(g, s, fx + cell * k, sy - 12 * u, 18 * u, { align: "center", color: ink(0.7), q: span(q, 0.5 + k * 0.04, 0.7 + k * 0.04), weight: 500 }));
    say(g, "SCALE · SECONDS", fx + sw + 24 * u, sy + 13 * u, 18 * u, { color: ink(0.7), q: span(q, 0.6, 0.8), weight: 500, track: 0.14 });
    notes(g, F, tall ? fx : fx + sw + 260 * u, tall ? sy + 50 * u : sy - 4 * u, ["GENERAL NOTES:", "1. EVERY CHANGE ARRIVES AS A CARD.", "2. PREVIEW BEFORE YOU APPLY."], 20 * u, span(q, 0.5, 1));
    // Revision table, top right.
    const tw = (tall ? 430 : 520) * u, tx = W - (tall ? 70 : 100) * u - tw, ty = 90 * u, rh = 30 * u;
    const rows = [["REV", "DESCRIPTION", "DATE"], ["A", "FIRST ISSUE", "10.21"], ["B", "TIMING TUNED", "10.22"], ["C", "YOUR NOTES IN", "10.23"]];
    pen(g, ink(0.6), 1.2 * u);
    const T = new Pth().R(tx, ty, tw, rh * rows.length).M(tx + 60 * u, ty).L(tx + 60 * u, ty + rh * rows.length).M(tx + tw - 100 * u, ty).L(tx + tw - 100 * u, ty + rh * rows.length);
    for (let i = 1; i < rows.length; i++) T.M(tx, ty + rh * i).L(tx + tw, ty + rh * i);
    T.draw(g, span(q, 0.3, 0.7));
    rows.forEach((row, i) => {
      const y = ty + rh * (i + 0.5), qq = span(q, 0.45 + i * 0.08, 0.7 + i * 0.08);
      say(g, row[0], tx + 30 * u, y, 18 * u, { align: "center", base: "middle", color: ink(0.75), q: qq, weight: 500 });
      say(g, row[1], tx + 74 * u, y, 18 * u, { base: "middle", color: ink(0.75), q: qq, weight: 500 });
      say(g, row[2], tx + tw - 50 * u, y, 18 * u, { align: "center", base: "middle", color: ink(0.75), q: qq, weight: 500 });
    });
  }
  // The closing station: the sheet's title block, a signature and the approval stamp.
  function closingDecor(g, F, q, local) {
    const { u, W, H, tall, ink, acc } = F;
    const bw = Math.min(W * (tall ? 0.86 : 0.5), 900 * u), bh = 250 * u, bx = W - 56 * u - bw, by = H - 56 * u - bh;
    pen(g, ink(0.95), 2.2 * u);
    new Pth().R(bx, by, bw, bh).draw(g, span(q, 0, 0.35));
    pen(g, ink(0.65), 1.2 * u);
    const c1 = bx + bw * 0.55, r1 = by + bh * 0.42, r2 = by + bh * 0.71;
    new Pth().M(bx, r1).L(bx + bw, r1).M(bx, r2).L(bx + bw, r2).M(c1, r1).L(c1, by + bh).M(bx + bw * 0.25, r2).L(bx + bw * 0.25, by + bh).M(bx + bw * 0.78, r2).L(bx + bw * 0.78, by + bh).draw(g, span(q, 0.1, 0.45));
    const lab = (s, x, y, qq) => say(g, s, x + 14 * u, y + 20 * u, 17 * u, { color: ink(0.6), q: qq, weight: 500 });
    const val = (s, x, y, qq, size = 30 * u) => say(g, s, x + 14 * u, y + 58 * u, size, { color: ink(0.95), q: qq, weight: 600 });
    lab("PROJECT", bx, by, span(q, 0.3, 0.5)); val("DREAMCUT · MOTION EXPLAINER", bx, by + 4 * u, span(q, 0.35, 0.6), 40 * u);
    lab("DRAWN BY", bx, r1, span(q, 0.35, 0.55)); val("AGENT", bx, r1 - 8 * u, span(q, 0.4, 0.6));
    lab("APPROVED BY", c1, r1, span(q, 0.4, 0.6)); val("YOU", c1, r1 - 8 * u, span(q, 0.45, 0.65));
    lab("SCALE", bx, r2, span(q, 0.4, 0.6)); val("NTS", bx, r2 - 8 * u, span(q, 0.45, 0.65));
    lab("DWG NO.", bx + bw * 0.25, r2, span(q, 0.45, 0.65)); val("DC-0001", bx + bw * 0.25, r2 - 8 * u, span(q, 0.5, 0.7));
    lab("SHEET", c1, r2, span(q, 0.5, 0.7)); val("1 OF 1", c1, r2 - 8 * u, span(q, 0.55, 0.75));
    lab("REV", bx + bw * 0.78, r2, span(q, 0.55, 0.75)); val("C", bx + bw * 0.78, r2 - 8 * u, span(q, 0.6, 0.8));
    // Signature, written into the approval field.
    const sq = span(local, 1.4, 2.2);
    const sx = c1 + bw * 0.16, sy = r1 + (r2 - r1) * 0.62;
    pen(g, acc(1), 2.4 * u);
    const sig = new Pth();
    for (let i = 0; i <= 60; i++) { const k = i / 60, x = sx + k * bw * 0.24, y = sy + Math.sin(k * 19) * 12 * u * (1 - k * 0.5) - Math.sin(k * 3.1) * 8 * u; i ? sig.L(x, y) : sig.M(x, y); }
    sig.draw(g, sq);
    // The stamp lands with a thump.
    const k = span(local, 0.8, 1.05);
    if (k > 0) {
      const sc = 1 + (1 - ease(k)) * 0.35, x = W * (tall ? 0.7 : 0.8), y = H * (tall ? 0.16 : 0.2);
      g.save(); g.translate(x, y); g.rotate(-0.12); g.scale(sc, sc); g.globalAlpha *= clamp(k * 1.6) * 0.92;
      const w = 360 * u, h = 120 * u;
      pen(g, acc(1), 5 * u); new Pth().RR(-w / 2, -h / 2, w, h, 10 * u).draw(g, 1);
      pen(g, acc(1), 2 * u); new Pth().RR(-w / 2 + 12 * u, -h / 2 + 12 * u, w - 24 * u, h - 24 * u, 6 * u).draw(g, 1);
      say(g, "APPROVED", 0, 4 * u, 64 * u, { align: "center", base: "middle", color: acc(1), weight: 700, track: 0.12 });
      g.restore();
    }
    filmstrip(g, F, (tall ? 90 : 140) * u, (tall ? 0.12 : 0.1) * H, W * (tall ? 0.3 : 0.4), 60 * u, span(q, 0.2, 0.8));
  }
  // Every data station: crop marks around its drawing area and faint centre lines.
  function scaffold(g, F, b, q) {
    const { u, ink } = F, m = 26 * u;
    pen(g, ink(0.55), 1.4 * u);
    const P = new Pth();
    for (const [x, y, sx, sy] of [[b.x - 20 * u, b.y - 20 * u, 1, 1], [b.x + b.w + 20 * u, b.y - 20 * u, -1, 1], [b.x - 20 * u, b.y + b.h + 20 * u, 1, -1], [b.x + b.w + 20 * u, b.y + b.h + 20 * u, -1, -1]]) P.M(x + sx * m, y).L(x, y).L(x, y + sy * m);
    P.draw(g, q);
  }

  // ---- the sheet: paper, grid, creases, border -----------------------------------------------------
  let tiles = null, tileKey = "";
  function makeTiles(T, u) {
    const S = Math.round(1100 * u), r = rng(37);
    const mott = document.createElement("canvas"); mott.width = mott.height = S;
    const m = mott.getContext("2d");
    const bloom = (x, y, rad, color) => {
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const X = x + dx * S, Y = y + dy * S;
        if (X + rad < 0 || X - rad > S || Y + rad < 0 || Y - rad > S) continue;
        const gr = m.createRadialGradient(X, Y, 0, X, Y, rad);
        gr.addColorStop(0, color); gr.addColorStop(1, "rgba(0,0,0,0)");
        m.fillStyle = gr; m.fillRect(X - rad, Y - rad, rad * 2, rad * 2);
      }
    };
    for (let i = 0; i < 70; i++) {
      const light = r() < 0.5, a = (light ? T.lite : T.dark) * (0.4 + r() * 0.9);
      bloom(r() * S, r() * S, (60 + r() * 420) * u, `rgba(${light ? T.liteRGB : T.darkRGB},${a})`);
    }
    // Finer mottle: the paper took the sensitiser unevenly.
    for (let i = 0; i < 260; i++) {
      const light = r() < 0.5;
      bloom(r() * S, r() * S, (14 + r() * 70) * u, `rgba(${light ? T.liteRGB : T.darkRGB},${(light ? T.lite : T.dark) * (0.3 + r() * 0.7)})`);
    }
    // Water stains: faint rings with darker edges.
    for (let i = 0; i < 3; i++) {
      const x = r() * S, y = r() * S, rad = (90 + r() * 140) * u;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        m.strokeStyle = `rgba(${T.darkRGB},${T.dark * 0.9})`; m.lineWidth = 3 * u;
        m.beginPath(); m.ellipse(x + dx * S, y + dy * S, rad, rad * (0.8 + r() * 0.3), r() * 3, 0, TAU); m.stroke();
      }
    }
    // Specks.
    for (let i = 0; i < 1400; i++) {
      const light = r() < 0.6;
      m.fillStyle = `rgba(${light ? T.liteRGB : T.darkRGB},${Math.min(0.09, light ? T.lite : T.dark) * (1 + r() * 2)})`;
      m.beginPath(); m.arc(r() * S, r() * S, (0.4 + r() * 1.3) * u, 0, TAU); m.fill();
    }
    // Fine grain and fibres.
    const G = 320, grain = document.createElement("canvas"); grain.width = grain.height = G;
    const gg = grain.getContext("2d"), img = gg.createImageData(G, G);
    const [lr, lg, lb] = T.liteRGB.split(",").map(Number), [dr, dg, db] = T.darkRGB.split(",").map(Number);
    for (let i = 0; i < G * G; i++) {
      const v = r(), light = v > 0.5;
      img.data[i * 4] = light ? lr : dr; img.data[i * 4 + 1] = light ? lg : dg; img.data[i * 4 + 2] = light ? lb : db;
      img.data[i * 4 + 3] = Math.round(Math.abs(v - 0.5) * 2 * 255 * T.grain);
    }
    gg.putImageData(img, 0, 0);
    gg.lineWidth = 0.8;
    for (let i = 0; i < 70; i++) {
      gg.strokeStyle = `rgba(${T.liteRGB},${T.lite * 1.4})`;
      const x = r() * G, y = r() * G, a = r() * TAU, l = 8 + r() * 26;
      gg.beginPath(); gg.moveTo(x, y); gg.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); gg.stroke();
    }
    // Ink wear: patches where the line-work printed weaker.
    const wear = document.createElement("canvas"); wear.width = wear.height = Math.round(900 * u);
    const wg = wear.getContext("2d"), WS = wear.width;
    for (let i = 0; i < 40; i++) {
      const x = r() * WS, y = r() * WS, rad = (40 + r() * 260) * u;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const gr = wg.createRadialGradient(x + dx * WS, y + dy * WS, 0, x + dx * WS, y + dy * WS, rad);
        gr.addColorStop(0, `rgba(0,0,0,${0.1 + r() * 0.3})`); gr.addColorStop(1, "rgba(0,0,0,0)");
        wg.fillStyle = gr; wg.fillRect(x + dx * WS - rad, y + dy * WS - rad, rad * 2, rad * 2);
      }
    }
    for (let i = 0; i < 2600; i++) { wg.fillStyle = `rgba(0,0,0,${0.2 + r() * 0.5})`; wg.fillRect(r() * WS, r() * WS, (0.6 + r() * 1.6) * u, (0.6 + r() * 1.6) * u); }
    return { mott, grain, wear, pats: new Map() };
  }
  function pattern(ctx, name) {
    let set = tiles.pats.get(ctx);
    if (!set) { set = {}; tiles.pats.set(ctx, set); }
    if (!set[name]) set[name] = ctx.createPattern(tiles[name], "repeat");
    return set[name];
  }
  // ---- the plan: which scenes play, when, and where each sits on the sheet -------------------------
  // The template's controls say which scenes play and for how long. Each scene's data is rebuilt from
  // them exactly as the template builds it, so a finished station stays drawn after the camera leaves.
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  let planCache = null, planKey = "";
  function controls() {
    if (window.__dreamcut && window.__dreamcut.controls) return window.__dreamcut.controls;
    try { if (typeof dc !== "undefined" && dc && dc.controls) return dc.controls; } catch (e) { /* not on this page */ }
    return null;
  }
  function planOf(F) {
    const c = controls();
    if (!c) return null;
    const key = `${F.W}x${F.H}`;
    if (planCache && planKey === key) return planCache;
    let t = 0;
    const shown = [];
    for (const id of ORDER) { const hold = Number(c[`${id}_hold`]) || 0; if (hold > 0) shown.push({ id, start: t, hold }); t += hold; }
    if (!shown.length) return null;
    // Stations sit in story order along the sheet, so every pan lands on the next scene and crosses nothing else.
    shown.forEach((st, i) => { st.i = i; st.x = i * F.PX; st.y = (i % 2) * F.H * 0.12; });
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
  // The sheet reaches well past every station, so even the widest pull-back stays on paper.
  function sheetOf(F) {
    const n = F.plan ? F.plan.shown.length : 1;
    return { x: -0.5 * F.W, y: -0.5 * F.H, w: (n - 1) * F.PX + F.W * 2, h: F.H * 2.12 };
  }
  function viewOf(F) {
    const { cam, W, H } = F, hw = W / 2 / cam.z, hh = H / 2 / cam.z, cx = cam.x + W / 2, cy = cam.y + H / 2;
    return { x: cx - hw, y: cy - hh, w: hw * 2, h: hh * 2 };
  }
  function camApply(g, F) {
    const { cam, W, H } = F;
    g.translate(W / 2, H / 2); g.scale(cam.z, cam.z); g.translate(-cam.x - W / 2, -cam.y - H / 2);
  }
  function holdCam(F, st, tt) { const k = clamp((tt - st.start) / st.hold); return { x: st.x + F.W * 0.012 * k, y: st.y, z: 1 + 0.03 * k }; }
  // A pan starts as the outgoing headline begins to leave and lands as the next headline is written.
  function panWindow(P, k) {
    const A = P.shown[k - 1], B = P.shown[k], T = B.start;
    return [Math.max(A.start + A.hold * 0.5, T - P.change * 0.85), Math.min(T + 0.32, T + B.hold * 0.3)];
  }
  // The drafting camera: a slow push during each scene, a pan to the next station that pulls back
  // mid-move, and at the end a slow pull-back over the finished sheet.
  function camera(F) {
    const P = F.plan, t = F.t;
    if (!P) return { x: 0, y: 0, z: 1 + 0.03 * clamp(F.info.local / Math.max(0.01, F.info.hold)) };
    const sh = P.shown;
    let i = sh.findIndex((st) => t >= st.start && t < st.start + st.hold);
    if (i < 0) i = t <= 0 ? 0 : sh.length - 1;
    const pan = (A, B, a, b) => {
      const m = inout((t - a) / (b - a)), ca = holdCam(F, A, a), cb = holdCam(F, B, b), dip = 0.2 * Math.sin(Math.PI * m);
      return { x: lerp(ca.x, cb.x, m), y: lerp(ca.y, cb.y, m), z: lerp(ca.z, cb.z, m) * (1 - dip) };
    };
    const inW = i > 0 ? panWindow(P, i) : null, outW = i < sh.length - 1 ? panWindow(P, i + 1) : null;
    let cam;
    if (inW && t < inW[1]) cam = pan(sh[i - 1], sh[i], inW[0], inW[1]);
    else if (outW && t >= outW[0]) cam = pan(sh[i], sh[i + 1], outW[0], outW[1]);
    else {
      cam = holdCam(F, sh[i], t);
      if (i === sh.length - 1) {
        const st = sh[i], d = Math.min(2.2, st.hold * 0.5), k = inout((t - (st.start + st.hold - d)) / d);
        cam.z = lerp(cam.z, F.tall ? 0.74 : 0.66, k);
      }
    }
    const S = sheetOf(F), hw = F.W / 2 / cam.z, hh = F.H / 2 / cam.z;
    cam.x = clamp(cam.x + F.W / 2, S.x + hw, S.x + S.w - hw) - F.W / 2;
    cam.y = clamp(cam.y + F.H / 2, S.y + hh, S.y + S.h - hh) - F.H / 2;
    return cam;
  }
  function paper(ctx, F) {
    const { u, T, cam, W, H } = F, tex = F.S.look.texture, sh = sheetOf(F), v = viewOf(F);
    ctx.save();
    ctx.fillStyle = T.table; ctx.fillRect(0, 0, W, H);
    camApply(ctx, F);
    if (cam.z < 0.995) { ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 60 * u * cam.z; ctx.shadowOffsetY = 18 * u * cam.z; }
    ctx.fillStyle = T.paper; ctx.fillRect(sh.x, sh.y, sh.w, sh.h);
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.beginPath(); ctx.rect(sh.x, sh.y, sh.w, sh.h); ctx.clip();
    const x0 = Math.max(sh.x, v.x), y0 = Math.max(sh.y, v.y), x1 = Math.min(sh.x + sh.w, v.x + v.w), y1 = Math.min(sh.y + sh.h, v.y + v.h);
    ctx.globalAlpha = tex;
    ctx.fillStyle = pattern(ctx, "mott"); ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.fillStyle = pattern(ctx, "grain"); ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.globalAlpha = 1;
    // Grid: minor every 40, major every 200.
    const step = 40 * u;
    for (const major of [false, true]) {
      ctx.beginPath();
      const s = major ? step * 5 : step;
      for (let x = Math.ceil(x0 / s) * s; x < x1; x += s) if (major || Math.round(x / step) % 5) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
      for (let y = Math.ceil(y0 / s) * s; y < y1; y += s) if (major || Math.round(y / step) % 5) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
      ctx.strokeStyle = `rgba(${T.ink},${major ? T.gridMajor : T.gridMinor})`; ctx.lineWidth = (major ? 1.3 : 1) * u; ctx.stroke();
    }
    // Fold creases: a worn light band, a ridge and a shadowed valley; brighter wear where folds cross.
    const vx = [1, 2, 3, 4, 5, 6, 7].map((k) => sh.x + (sh.w * k) / 8), hy = [1, 2, 3, 4, 5].map((k) => sh.y + (sh.h * k) / 6);
    const r = rng(91);
    const crease = (x1c, y1c, x2c, y2c, vertical) => {
      const band = 26 * u, gr = vertical ? ctx.createLinearGradient(x1c - band, 0, x1c + band, 0) : ctx.createLinearGradient(0, y1c - band, 0, y1c + band);
      gr.addColorStop(0, `rgba(${T.liteRGB},0)`); gr.addColorStop(0.5, `rgba(${T.liteRGB},${T.crease * 0.5 * tex})`); gr.addColorStop(1, `rgba(${T.liteRGB},0)`);
      ctx.fillStyle = gr;
      if (vertical) ctx.fillRect(x1c - band, y0, band * 2, y1 - y0); else ctx.fillRect(x0, y1c - band, x1 - x0, band * 2);
      for (const [off, col, w] of [[0, `rgba(${T.liteRGB},${T.crease * tex})`, 1.6], [2.6, `rgba(${T.darkRGB},${T.crease * 1.6 * tex})`, 2.4]]) {
        ctx.beginPath();
        const n = 40;
        for (let i = 0; i <= n; i++) {
          const k = i / n, j = (r() - 0.5) * 1.6 * u;
          const x = vertical ? x1c + off * u + j : lerp(x1c, x2c, k), y = vertical ? lerp(y1c, y2c, k) : y1c + off * u + j;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.strokeStyle = col; ctx.lineWidth = w * u; ctx.stroke();
      }
    };
    for (const x of vx) if (x > x0 - 40 * u && x < x1 + 40 * u) crease(x, sh.y, x, sh.y + sh.h, true);
    for (const y of hy) if (y > y0 - 40 * u && y < y1 + 40 * u) crease(sh.x, y, sh.x + sh.w, y, false);
    for (const x of vx) for (const y of hy) {
      if (x < x0 - 90 * u || x > x1 + 90 * u || y < y0 - 90 * u || y > y1 + 90 * u) continue;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, 80 * u);
      gr.addColorStop(0, `rgba(${T.liteRGB},${T.crease * 1.4 * tex})`); gr.addColorStop(1, `rgba(${T.liteRGB},0)`);
      ctx.fillStyle = gr; ctx.fillRect(x - 80 * u, y - 80 * u, 160 * u, 160 * u);
    }
    ctx.restore();
  }
  // The zoned border around the whole sheet.
  function border(g, F) {
    const { u, ink } = F, sh = sheetOf(F), o = 28 * u, i2 = 56 * u;
    pen(g, ink(0.9), 2.4 * u);
    new Pth().R(sh.x + o, sh.y + o, sh.w - o * 2, sh.h - o * 2).draw(g, 1);
    pen(g, ink(0.7), 1.4 * u);
    new Pth().R(sh.x + i2, sh.y + i2, sh.w - i2 * 2, sh.h - i2 * 2).draw(g, 1);
    const cols = 18, rows = 12, P = new Pth();
    for (let k = 1; k < cols; k++) { const x = sh.x + o + ((sh.w - o * 2) * k) / cols; P.M(x, sh.y + o).L(x, sh.y + i2).M(x, sh.y + sh.h - o).L(x, sh.y + sh.h - i2); }
    for (let k = 1; k < rows; k++) { const y = sh.y + o + ((sh.h - o * 2) * k) / rows; P.M(sh.x + o, y).L(sh.x + i2, y).M(sh.x + sh.w - o, y).L(sh.x + sh.w - i2, y); }
    P.draw(g, 1);
    for (let k = 0; k < cols; k++) {
      const x = sh.x + o + ((sh.w - o * 2) * (k + 0.5)) / cols, s = String(k + 1);
      say(g, s, x, sh.y + (o + i2) / 2, 18 * u, { align: "center", base: "middle", color: ink(0.75), weight: 600 });
      say(g, s, x, sh.y + sh.h - (o + i2) / 2, 18 * u, { align: "center", base: "middle", color: ink(0.75), weight: 600 });
    }
    for (let k = 0; k < rows; k++) {
      const y = sh.y + o + ((sh.h - o * 2) * (k + 0.5)) / rows, s = String.fromCharCode(65 + k);
      say(g, s, sh.x + (o + i2) / 2, y, 18 * u, { align: "center", base: "middle", color: ink(0.75), weight: 600 });
      say(g, s, sh.x + sh.w - (o + i2) / 2, y, 18 * u, { align: "center", base: "middle", color: ink(0.75), weight: 600 });
    }
  }
  function boxOf(F) {
    const { W, H, u, tall } = F, side = (tall ? 90 : 140) * u;
    return tall ? { x: side, y: H * 0.3, w: W - side * 2, h: H * 0.6 } : { x: side, y: H * 0.34, w: W - side * 2, h: H * 0.58 };
  }
  // The drawing area for a scene: from just under its measured headline to the foot of the frame.
  function areaOf(F, id) {
    const b = boxOf(F), lines = headLines(`${id}-title`);
    if (!lines.length) return b;
    const bottom = Math.max(...lines.map((l) => l.y + l.h));
    const top = Math.min(b.y, Math.max(bottom + (F.tall ? 80 : 64) * F.u, F.H * 0.19));
    return { x: b.x, y: top, w: b.w, h: F.H - (F.tall ? 120 : 76) * F.u - top };
  }
  // Generic drawings in the margins and gutters, seen when the camera pulls back.
  function margins(g, F, v) {
    const { W, H, PX, u } = F, n = F.plan ? F.plan.shown.length : 1;
    const see = (x, y, w, h) => !(x > v.x + v.w || x + w < v.x || y > v.y + v.h || y + h < v.y);
    for (let i = -1; i <= n; i++) {
      const x = i * PX, y = (((i % 2) + 2) % 2) * H * 0.12;
      if (i >= 0 && i < n - 1 && see(x + W, y, PX - W, H)) {
        gear(g, F, x + W + (PX - W) / 2, y + H * 0.3, Math.min((PX - W) * 0.36, 80 * u), 12, 1, (F.t * 0.3 * (i + 1)) % TAU);
        gear(g, F, x + W + (PX - W) / 2, y + H * 0.7, Math.min((PX - W) * 0.26, 60 * u), 9, 1, -F.t * 0.4);
      }
      if (i < 0 || i >= n) {
        if (see(x, y, W, H)) {
          gear(g, F, x + W * (i < 0 ? 0.62 : 0.38), y + H * 0.4, Math.min(W, H) * 0.18, 22, 1, F.t * 0.12);
          notes(g, F, x + W * (i < 0 ? 0.5 : 0.2), y + H * 0.72, ["NOTES:", "1. ALL TIMES IN FRAMES AT 30 FPS.", "2. TRIMS KEEP SOURCE HANDLES.", "3. NOTHING APPLIES UNTIL APPROVED."], 22 * u, 1);
        }
        continue;
      }
      if (see(x, y - H * 0.5, W, H * 0.5)) {
        notes(g, F, x + W * 0.08, y - H * 0.2, [`SECTION ${String.fromCharCode(70 + i)}-${String.fromCharCode(70 + i)} · SEE SHEET ${i + 2}`, "BREAK ALL SHARP EDGES · TOLERANCE ±1 FRAME"], 22 * u, 1);
        bolt(g, F, x + W * 0.62, y - H * 0.24, u * 0.9, 1);
        gear(g, F, x + W * 0.88, y - H * 0.24, Math.min(W, H) * 0.08, 14, 1, F.t * 0.2);
      }
      if (see(x, y + H, W, H * 0.62)) {
        if (i % 2 === 0) slider(g, F, x + W * 0.12, y + H * 1.04, Math.min((W * 0.72) / 1200, (H * 0.34) / 560), 1);
        else { knob(g, F, x + W * 0.24, y + H * 1.06, (H * 0.36) / 820, 1); gear(g, F, x + W * 0.66, y + H * 1.24, Math.min(W, H) * 0.15, 20, 1, -F.t * 0.12); }
      }
    }
  }
  // A sign-off stamp that lands on the last drawing before the reel ends.
  function endStamp(g, F, id, local, hold) {
    if (id === "closing") return;
    const k = span(local, hold - 1.9, hold - 1.65);
    if (k <= 0) return;
    const { u, W, H, acc } = F, lines = headLines(HEADS[id] ? HEADS[id][HEADS[id].length - 1] : "");
    const right = lines.length ? Math.max(...lines.map((l) => l.x + l.w)) : W;
    const top = right < W - 620 * u;
    const x = W - 250 * u, y = top ? 150 * u : H - 110 * u, sc = 1 + (1 - ease(k)) * 0.4;
    g.save(); g.translate(x, y); g.rotate(-0.1); g.scale(sc, sc); g.globalAlpha *= clamp(k * 1.6) * 0.9;
    const w = 330 * u, h = 104 * u;
    pen(g, acc(1), 4.5 * u); new Pth().RR(-w / 2, -h / 2, w, h, 10 * u).draw(g, 1);
    pen(g, acc(1), 1.8 * u); new Pth().RR(-w / 2 + 11 * u, -h / 2 + 11 * u, w - 22 * u, h - 22 * u, 6 * u).draw(g, 1);
    say(g, "CHECKED", 0, -8 * u, 50 * u, { align: "center", base: "middle", color: acc(1), weight: 700, track: 0.12 });
    say(g, "REV C · READY FOR YOU", 0, 30 * u, 18 * u, { align: "center", base: "middle", color: acc(1), weight: 600, track: 0.12 });
    g.restore();
  }
  // Everything on the sheet: past stations finished, the current one building, later ones still blank.
  function world(g, F) {
    const { W, H, info } = F, v = viewOf(F), P = F.plan;
    border(g, F);
    margins(g, F, v);
    if (!P) {
      if (DRAW[info.scene]) scaffold(g, F, areaOf(F, info.scene), 1);
      else if (info.scene === "title") titleDecor(g, F, span(info.local, 0, 2.2));
      else if (info.scene === "closing") closingDecor(g, F, span(info.local, 0, 1.6), info.local);
      return;
    }
    for (const st of P.shown) {
      if (st.x > v.x + v.w || st.x + W < v.x || st.y > v.y + v.h || st.y + H < v.y) continue;
      const local = F.t - st.start;
      if (local < 0) { if (DRAW[st.id]) { g.save(); g.translate(st.x, st.y); scaffold(g, F, areaOf(F, st.id), 1); g.restore(); } continue; }
      g.save(); g.translate(st.x, st.y);
      if (DRAW[st.id]) {
        const a = areaOf(F, st.id);
        scaffold(g, F, a, 1);
        // Strokes begin on the first frame of the scene, while the camera is still settling.
        DRAW[st.id](g, F, a, clamp(local / Math.min(2.6, st.hold * 0.62)), P.data[st.id]);
      } else if (st.id === "title") titleDecor(g, F, span(local, 0, 2.2));
      else if (st.id === "closing") closingDecor(g, F, span(local, 0, 1.6), local);
      if (st.i === P.shown.length - 1) endStamp(g, F, st.id, local, st.hold);
      g.restore();
    }
  }

  // Positions of each headline line on the page, read once from the layout (transforms ignored).
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
  // Lettering guide lines ruled across the sheet behind each headline, and the view tag above it.
  function guides(g, F) {
    const { info, u, W, ink } = F;
    if (!info.scene || !HEADS[info.scene]) return;
    const q = span(info.local, 0, 0.7), fade = 1 - span(info.local, info.hold - info.change, info.hold);
    if (q <= 0 || fade <= 0) return;
    g.save(); g.globalAlpha = fade;
    let first = null;
    for (const id of HEADS[info.scene]) for (const L of headLines(id)) {
      first = first || L;
      const cap = L.y + L.h * 0.2, base = L.y + L.h * 0.82;
      pen(g, ink(0.2), 0.9 * u);
      new Pth().M(L.x - 40 * u, cap).L(W - 40 * u, cap).M(L.x - 40 * u, base).L(W - 40 * u, base).draw(g, q);
      pen(g, ink(0.45), 1.1 * u);
      new Pth().M(L.x - 22 * u, cap - 8 * u).L(L.x - 22 * u, base + 8 * u).draw(g, q);
    }
    if (first && TAGS[info.scene]) say(g, TAGS[info.scene], first.x, first.y - 8 * u, 21 * u, { color: ink(0.7), q: span(info.local, 0.2, 0.9), weight: 500, track: 0.14 });
    g.restore();
  }

  let frame = null;
  let layer = null;
  function finishFrame(ctx, F) {
    const g = F.g, { u, W, H, T } = F;
    g.setTransform(1, 0, 0, 1, 0, 0);
    guides(g, F);
    // Weaken the line-work where the print faded.
    if (F.S.paint) {
      g.save();
      g.globalCompositeOperation = "destination-out";
      g.globalAlpha = 0.55 * F.S.look.texture;
      camApply(g, F);
      g.fillStyle = pattern(g, "wear");
      const v = viewOf(F); g.fillRect(v.x, v.y, v.w, v.h);
      g.restore();
    }
    ctx.save();
    ctx.globalAlpha *= T.bleed;
    ctx.filter = `blur(${3.2 * u}px)`;
    ctx.drawImage(layer, 0, 0);
    ctx.filter = "none";
    ctx.globalAlpha /= T.bleed;
    ctx.drawImage(layer, 0, 0);
    if (F.S.paint) {
      // Sun-fade: a soft bright wash and darker, unevenly exposed edges.
      const gr = ctx.createRadialGradient(W * 0.42, H * 0.38, 0, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.62);
      gr.addColorStop(0, `rgba(${T.liteRGB},${T.wash})`); gr.addColorStop(0.55, "rgba(0,0,0,0)"); gr.addColorStop(1, `rgba(${T.darkRGB},${T.vignette})`);
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }
  function makeFrame(ctx, S, info) {
    const { W, H, u } = S, look = S.look;
    if (!layer || layer.width !== W || layer.height !== H) { layer = document.createElement("canvas"); layer.width = W; layer.height = H; }
    const T = look.tone;
    const key = `${W}x${H}:${look.palette || ""}:${T.paper}`;
    if (!tiles || tileKey !== key) { tiles = makeTiles(T, u); tileKey = key; }
    const F = {
      S, W, H, u, tall: S.tall, T, info, t: info.t, local: info.local, PX: W * PITCH, PY: H * PITCH, g: layer.getContext("2d"),
      ink: (a) => `rgba(${T.ink},${a})`, acc: (a) => hexA(S.accent, a),
    };
    F.plan = planOf(F);
    F.cam = camera(F);
    return F;
  }

  const TONE = {
    paper: "#1d4f93", table: "#06122a", ink: "236,244,255", liteRGB: "255,255,255", darkRGB: "2,14,42",
    lite: 0.04, dark: 0.09, grain: 0.09, gridMinor: 0.055, gridMajor: 0.11, crease: 0.1, bleed: 0.85, wash: 0.07, vignette: 0.42,
  };
  const scene = (id) => (ctx, S, box, p, d) => {
    const F = frame;
    // With the plan known the stage draws every station; this only runs when the controls are unavailable.
    if (!F || F.plan || F.info.scene !== id) return;
    const g = F.g;
    g.save(); camApply(g, F);
    DRAW[id](g, F, areaOf(F, id), p, d);
    g.restore();
    finishFrame(ctx, F);
  };
  const halo = (paperColor, ink) => () => `0 0 1.5px rgba(${ink},0.5), 0 0 16px ${paperColor}, 0 0 34px ${paperColor}`;

  return {
    bg: "#1d4f93", panel: "rgba(238,245,255,0.06)", ink: "#eef5ff", muted: "#b4cbe9", accent: "#ffe08a", onAccent: "#163a6b",
    rule: "rgba(238,245,255,0.8)", track: "rgba(238,245,255,0.1)",
    display: LETTER, displayWeight: 600, displayCase: "uppercase", displayTracking: "0.04em",
    body: LETTER, bodyWeight: 500,
    figures: LETTER, radius: 0, motion: "stroke", change: "grid", kit: { line: 2.2, fill: "none", panel: "outline", dims: true, hatch: true },
    panelEdge: "rgba(238,245,255,0.6)",
    tone: TONE,
    keepArt: true,
    palettes: {
      // Whiteprint: blue lines on pale stock. Night: deep navy drafting. Graphite: pencil on cartridge paper.
      light: { bg: "#e9eef5", panel: "rgba(20,60,120,0.05)", ink: "#163f7a", muted: "#4f6f99", accent: "#d64545", onAccent: "#ffffff", rule: "rgba(22,63,122,0.75)", track: "rgba(22,63,122,0.08)", panelEdge: "rgba(22,63,122,0.5)",
        textShadow: halo("#e9eef5", "22,63,122"), backdrop: () => "#e9eef5",
        tone: { ...TONE, paper: "#e9eef5", table: "#7b8ba0", ink: "22,63,122", liteRGB: "255,255,255", darkRGB: "60,90,140", lite: 0.1, dark: 0.03, grain: 0.05, gridMinor: 0.06, gridMajor: 0.12, crease: 0.12, bleed: 0.3, wash: 0.1, vignette: 0.08 } },
      dark: { bg: "#0b2143", textShadow: halo("#0b2143", "236,244,255"), backdrop: () => "#0b2143",
        tone: { ...TONE, paper: "#0b2143", table: "#01050c", ink: "222,236,255", lite: 0.035, dark: 0.16, crease: 0.07, bleed: 0.55, wash: 0.04, vignette: 0.55 } },
      mono: { bg: "#efeee8", panel: "rgba(40,40,40,0.04)", ink: "#2d2d2d", muted: "#6a6a66", accent: "#2d2d2d", onAccent: "#efeee8", rule: "rgba(45,45,45,0.7)", track: "rgba(45,45,45,0.08)", panelEdge: "rgba(45,45,45,0.45)",
        textShadow: halo("#efeee8", "45,45,45"), backdrop: () => "#efeee8",
        tone: { ...TONE, paper: "#efeee8", table: "#5f5e59", ink: "48,48,46", liteRGB: "255,255,252", darkRGB: "70,68,60", lite: 0.08, dark: 0.035, grain: 0.07, gridMinor: 0.035, gridMajor: 0.07, crease: 0.1, bleed: 0.4, wash: 0.08, vignette: 0.1 } },
    },
    textShadow: halo("#1d4f93", "236,244,255"),
    backdrop: () => "#1d4f93",
    // The paper is drawn by the stage so it can move with the camera; this pass only marks the backdrop as on.
    paint: (ctx, W, H) => { ctx.clearRect(0, 0, W, H); },
    stage(ctx, S, info) {
      const F = (frame = makeFrame(ctx, S, info));
      if (S.paint) paper(ctx, F);
      const g = F.g;
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
      g.clearRect(0, 0, F.W, F.H);
      g.save(); camApply(g, F); world(g, F); g.restore();
      if (F.plan || !DRAW[info.scene]) finishFrame(ctx, F);
    },
    scenes: { chart: scene("chart"), object: scene("object"), people: scene("people"), process: scene("process"), compare: scene("compare") },
  };
});
