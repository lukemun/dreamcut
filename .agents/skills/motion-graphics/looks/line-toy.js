// Line Toy: a drawing toy with a powder screen and two knobs. Every picture is ONE line that never
// lifts, laid down in stair-steps (the knobs only move up/down and left/right), shaded by back-and-forth
// scribbles, and wiped away by a shake that lets the powder fall back. A moulded plastic body with
// a screen recess, a brand plate, screws and two ridged knobs that really turn with the pen. All drawings
// are original; no product marks. Frames are pure functions of time.
window.DreamcutMotion.register("line-toy", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const SANS = "'Futura', 'Avenir Next', 'Century Gothic', 'Trebuchet MS', sans-serif";
  const fmtNum = (v, to, d) => window.DreamcutMotion.formatNumber(v, Math.abs((Number(to) || 0) % 1) > 0.001 ? 1 : 0, (d && d.prefix) || "", (d && d.suffix) || "");

  // ---- layout ---------------------------------------------------------------------------------------
  const geoms = {};
  function geom(S) {
    const key = S.W + "x" + S.H;
    if (geoms[key]) return geoms[key];
    const { W, H, u, tall } = S;
    const mx = (tall ? 40 : 56) * u, top = (tall ? 56 : 40) * u, bot = (tall ? 260 : 150) * u, kr = (tall ? 100 : 60) * u;
    return (geoms[key] = {
      sx: mx, sy: top, sw: W - 2 * mx, sh: H - top - bot, bot, kr, ky: H - bot / 2,
      kx1: mx + kr + (tall ? 34 : 34) * u, kx2: W - mx - kr - 34 * u, rad: (tall ? 34 : 26) * u,
    });
  }
  function elBox(id) {
    const el = document.getElementById(id), root = document.getElementById("root");
    if (!el || !root) return null;
    let ox = 0, oy = 0;
    for (let n = el; n && n !== root; n = n.offsetParent) { ox += n.offsetLeft; oy += n.offsetTop; }
    return { x: ox, y: oy, w: el.offsetWidth, h: el.offsetHeight };
  }
  const areas = {};
  function areaOf(S, id) {
    const key = S.W + "x" + S.H + id;
    if (areas[key]) return areas[key];
    const G = geom(S), u = S.u, side = (S.tall ? 90 : 140) * u;
    const hb = elBox(id + "-title");
    const top = hb ? hb.y + hb.h + (S.tall ? 44 : 30) * u : S.H * 0.34;
    const bottom = G.sy + G.sh - 84 * u;
    return (areas[key] = { x: side, y: top, w: S.W - side * 2, h: bottom - top });
  }
  // The block of type a statement scene (title, closing) sets in the middle of the screen.
  function statementBox(S, id) {
    const ids = id === "title" ? ["kicker", "title"] : ["closing"];
    let top = Infinity, bottom = -Infinity;
    for (const k of ids) { const b = elBox(k); if (b) { top = Math.min(top, b.y); bottom = Math.max(bottom, b.y + b.h); } }
    if (!isFinite(top)) { top = S.H * 0.4; bottom = S.H * 0.6; }
    return { top, bottom };
  }

  // ---- the line: one polyline in stair-steps ---------------------------------------------------------
  class Pen {
    constructor(gs) { this.gs = gs; this.xs = []; this.ys = []; this.cum = []; this.runs = []; this.col = 0; this.runStart = 0; this.x = 0; this.y = 0; this.len = 0; this.labels = []; this.main = 0; }
    // The first begin sets the pen down; later ones (after the headline was written) travel there on a link.
    begin(x, y, col = 0) {
      if (this.started) { this.color(2); this.go(x, y); return this.color(col); }
      this.started = true; this.x = x; this.y = y; this.xs = [x]; this.ys = [y]; this.cum = [0]; this.len = 0; this.col = col; this.runStart = 0; this.runs = []; return this; }
    _seg(x, y) {
      const d = Math.hypot(x - this.x, y - this.y);
      if (d < 0.01) return this;
      this.len += d; this.xs.push(x); this.ys.push(y); this.cum.push(this.len); this.x = x; this.y = y;
      return this;
    }
    color(c) {
      if (c === this.col) return this;
      const i = this.xs.length - 1;
      this.runs.push({ i0: this.runStart, i1: i, col: this.col });
      this.runStart = i; this.col = c;
      return this;
    }
    // Straight along an axis; any other direction climbs in stair-steps, as the knobs force.
    to(x, y) {
      const dx = x - this.x, dy = y - this.y, ax = Math.abs(dx), ay = Math.abs(dy);
      if (ax < 0.5 || ay < 0.5) return this._seg(x, y);
      const major = Math.max(ax, ay), minor = Math.min(ax, ay);
      const m = Math.max(1, Math.round(minor / this.gs)), x0 = this.x, y0 = this.y;
      void major;
      for (let i = 1; i <= m; i++) {
        const xi = x0 + (dx * i) / m, yi = y0 + (dy * i) / m;
        if (ax >= ay) { this._seg(xi, this.y); this._seg(xi, yi); } else { this._seg(this.x, yi); this._seg(xi, yi); }
      }
      return this;
    }
    h(dx) { return this.to(this.x + dx, this.y); }
    v(dy) { return this.to(this.x, this.y + dy); }
    poly(pts) { for (const p of pts) this.to(p[0], p[1]); return this; }
    arc(cx, cy, rx, ry, a0, a1) {
      const n = Math.max(6, Math.ceil((Math.abs(a1 - a0) * Math.max(rx, ry)) / (this.gs * 1.25)));
      for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; this.to(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry); }
      return this;
    }
    // A closed round loop that starts and ends at its top.
    ring(cx, cy, rx, ry = rx) { this.to(cx, cy - ry); return this.arc(cx, cy, rx, ry, -Math.PI / 2, Math.PI * 1.5); }
    // Vertical back-and-forth shading from the pen's column to column xb. Ends where it began when `back`.
    zigV(xb, ya, yb, sp, back) {
      const xa = this.x;
      let n = Math.max(1, Math.round(Math.abs(xb - xa) / sp));
      if (back ? n % 2 === 0 : n % 2 === 1) n++;
      for (let j = 0; j <= n; j++) { this.to(this.x, j % 2 === 0 ? yb : ya); if (j < n) this.to(xa + ((xb - xa) * (j + 1)) / n, this.y); }
      return this;
    }
    zigH(xb, yb, sp, back) {
      const xa = this.x, ya = this.y;
      let n = Math.max(1, Math.round(Math.abs(yb - ya) / sp));
      if (back ? n % 2 === 0 : n % 2 === 1) n++;
      for (let j = 0; j <= n; j++) { this.to(j % 2 === 0 ? xb : xa, this.y); if (j < n) this.to(this.x, ya + ((yb - ya) * (j + 1)) / n); }
      return this;
    }
    // Go off and draw something, then come back along a straight route.
    go(x, y, vFirst) { if (vFirst) { this.to(this.x, y); return this.to(x, y); } this.to(x, this.y); return this.to(x, y); }
    spurBack(fn) { const i0 = this.xs.length - 1; fn(); for (let j = this.xs.length - 2; j >= i0; j--) this._seg(this.xs[j], this.ys[j]); return this; }
    spur(fn) { const x = this.x, y = this.y; fn(); return this.go(x, y); }
    rect(x, y, w, h) { this.to(x, y + h); this.to(x, y); this.to(x + w, y); this.to(x + w, y + h); return this.to(x, y + h); }
    // Write type with the same line: the pen travels out to the words along a faint link, writes every
    // letter as part of the one stroke, and (unless o.back === false) comes back the way it went.
    // y is the baseline of the first line; o.anchor "bottom"/"middle" lifts wrapped lines instead.
    text(str, x, y, size, o = {}) {
      str = normText(str);
      if (!str) return this;
      const un = size * 0.072, lh = o.lh || size * 1.2;
      const lines = o.maxW ? gwrap(str, o.maxW / un) : [str];
      if (o.anchor === "bottom") y -= (lines.length - 1) * lh;
      else if (o.anchor === "middle") y -= ((lines.length - 1) * lh) / 2;
      const col = o.color === "acc" ? 1 : 0, ox = this.x, oy = this.y, vf = !!o.vFirst, back = o.back !== false;
      const lead = Math.max(6 * (this.gs / 5), un * 1.4), gs0 = this.gs, prev = this.col, way = [];
      const fresh = !this.started;
      lines.forEach((ln, i) => {
        const w = gmeasure(ln) * un, by = y + i * lh;
        const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
        if (fresh && i === 0) { this.begin(x0 - lead, by, 2); }
        else {
          this.color(2);
          if (i === 0) this.go(x0 - lead, by, vf);
          else { const w0 = way[way.length - 1]; this.to(w0[0], w0[1]); this.to(w0[0], by); this.to(x0 - lead, by); way.push([w0[0], by]); }
        }
        way.push([x0 - lead, by]);
        this.gs = Math.max(1.5, Math.min(gs0, un * 0.75));
        let cx = x0;
        for (const ch of ln) {
          const g = ch === " " ? null : glyphOf(ch);
          if (!g) { cx += SPACE * un; continue; }
          const sx = cx + g.start[0] * un, sy = by + (g.start[1] - 10) * un;
          this.color(2);
          if (Math.abs(this.y - by) > 0.5) this.to(this.x, by);
          this.to(sx, by); this.to(sx, sy);
          this.color(col);
          let link = false;
          for (const p of g.pts) {
            if (p === "~") { link = true; continue; }
            const X = cx + p[0] * un, Y = by + (p[1] - 10) * un;
            if (link) { this.color(2); this.to(X, Y); this.color(col); link = false; } else this.to(X, Y);
          }
          cx += (g.w + GAP) * un;
        }
        this.gs = gs0;
        this.color(2);
        if (Math.abs(this.y - by) > 0.5) this.to(this.x, by);
      });
      if (back && !fresh) {
        for (let i = way.length - 1; i >= 0; i--) this.to(way[i][0], way[i][1]);
        this.go(ox, oy, !vf);
      }
      this.color(fresh ? 0 : prev);
      return this;
    }
    finish() {
      this.runs.push({ i0: this.runStart, i1: this.xs.length - 1, col: this.col });
      for (const r of this.runs) {
        const p = new Path2D();
        p.moveTo(this.xs[r.i0], this.ys[r.i0]);
        for (let i = r.i0 + 1; i <= r.i1; i++) p.lineTo(this.xs[i], this.ys[i]);
        r.path = p; r.start = this.cum[r.i0]; r.length = this.cum[r.i1] - this.cum[r.i0];
      }
      this.total = this.len;
      return this;
    }
    at(s) {
      s = clamp(s, 0, this.total);
      let lo = 0, hi = this.cum.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this.cum[mid] <= s) lo = mid; else hi = mid - 1; }
      const i = Math.min(lo, this.cum.length - 2);
      const d = this.cum[i + 1] - this.cum[i] || 1, k = clamp((s - this.cum[i]) / d);
      return [this.xs[i] + (this.xs[i + 1] - this.xs[i]) * k, this.ys[i] + (this.ys[i + 1] - this.ys[i]) * k];
    }
  }
  // ---- the stylus alphabet: single-stroke capitals, each one continuous line ----------------------------
  // Glyph space: x from 0 to w, y from 0 (cap top) to 10 (baseline). "~" makes the next segment a link
  // (drawn in the faint connector tone). A glyph that ends above the baseline retraces itself back down.
  const D2R = Math.PI / 180;
  function ar(cx, cy, rx, ry, a0, a1) {
    const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 15)), o = [];
    for (let i = 0; i <= n; i++) { const a = (a0 + ((a1 - a0) * i) / n) * D2R; o.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
    return o;
  }
  const rev = (a) => a.slice().reverse();
  const GL = {}, GAP = 2.1, SPACE = 4.4;
  function def(ch, w, pts) {
    const P = pts.slice(), real = P.filter((p) => p !== "~");
    const end = real[real.length - 1];
    if (end[1] < 9.9) {
      let k = 0;
      for (let i = real.length - 2; i >= 0; i--) if (real[i][1] >= 9.9) { k = i; break; }
      for (let i = real.length - 2; i >= k; i--) P.push(real[i]);
    }
    GL[ch] = { w, pts: P, start: real[0] };
  }
  def("A", 6, [[0, 10], [3, 0], [6, 10], [5, 6.7], [1, 6.7], [5, 6.7], [6, 10]]);
  def("B", 5.4, [[0, 10], [0, 0], [3, 0], ...ar(3, 2.5, 2.4, 2.5, -90, 90), [0, 5], [3.1, 5], ...ar(3.1, 7.5, 2.3, 2.5, -90, 90), [0, 10]]);
  def("C", 5.9, [...ar(3.1, 5, 3, 5, 50, 300), ...rev(ar(3.1, 5, 3, 5, 90, 300))]);
  def("D", 5.6, [[2.4, 10], [0, 10], [0, 0], [2.4, 0], ...ar(2.4, 5, 3.2, 5, -90, 90)]);
  def("E", 5, [[5, 10], [0, 10], [0, 0], [5, 0], [0, 0], [0, 5], [4, 5], [0, 5], [0, 10]]);
  def("F", 4.8, [[0, 10], [0, 0], [4.8, 0], [0, 0], [0, 5], [3.8, 5], [0, 5], [0, 10]]);
  def("G", 6, [...ar(3.1, 5, 3, 5, 90, 300), ...rev(ar(3.1, 5, 3, 5, 90, 300)), ...rev(ar(3.1, 5, 3, 5, 0, 90)), [3.6, 5], [6.1, 5], ...ar(3.1, 5, 3, 5, 0, 90)]);
  def("H", 5.6, [[0, 10], [0, 0], [0, 5], [5.6, 5], [5.6, 0], [5.6, 10]]);
  def("I", 0, [[0, 10], [0, 0], [0, 10]]);
  def("J", 4.6, [[0, 7.6], ...rev(ar(2.3, 7.6, 2.3, 2.4, 0, 180)), [4.6, 0], [4.6, 7.6], ...ar(2.3, 7.6, 2.3, 2.4, 0, 90)]);
  def("K", 5.2, [[0, 10], [0, 0], [0, 6.2], [5.2, 0], [1.9, 4], [5.2, 10]]);
  def("L", 4.5, [[0, 10], [0, 0], [0, 10], [4.5, 10]]);
  def("M", 6.6, [[0, 10], [0, 0], [3.3, 6.4], [6.6, 0], [6.6, 10]]);
  def("N", 5.6, [[0, 10], [0, 0], [5.6, 10], [5.6, 0], [5.6, 10]]);
  def("O", 6.2, ar(3.1, 5, 3.1, 5, 90, 450));
  def("P", 5.2, [[0, 10], [0, 0], [2.8, 0], ...ar(2.8, 2.7, 2.4, 2.7, -90, 90), [0, 5.4], [0, 10]]);
  def("Q", 6.2, [...ar(3.1, 5, 3.1, 5, 90, 450), [4.1, 7.6], [6.4, 10.4]]);
  def("R", 5.4, [[0, 10], [0, 0], [2.8, 0], ...ar(2.8, 2.7, 2.4, 2.7, -90, 90), [0, 5.4], [2.6, 5.4], [5.4, 10]]);
  def("S", 5.4, [...ar(2.7, 7.5, 2.7, 2.5, 160, -90), ...ar(2.6, 2.5, 2.4, 2.5, 90, 330)]);
  def("T", 5.6, [[2.8, 10], [2.8, 0], [0, 0], [5.6, 0], [2.8, 0], [2.8, 10]]);
  def("U", 5.6, [...ar(2.8, 7.2, 2.8, 2.8, 90, 180), [0, 0], [0, 7.2], ...rev(ar(2.8, 7.2, 2.8, 2.8, 0, 180)), [5.6, 0], [5.6, 7.2], ...ar(2.8, 7.2, 2.8, 2.8, 0, 90)]);
  def("V", 6, [[3, 10], [0, 0], [3, 10], [6, 0], [3, 10]]);
  def("W", 8, [[2, 10], [0, 0], [2, 10], [4, 3], [6, 10], [8, 0], [6, 10]]);
  def("X", 5.6, [[0, 10], [5.6, 0], [2.8, 5], [0, 0], [5.6, 10]]);
  def("Y", 5.6, [[2.8, 10], [2.8, 5], [0, 0], [2.8, 5], [5.6, 0], [2.8, 5], [2.8, 10]]);
  def("Z", 5.4, [[5.4, 10], [0, 10], [5.4, 0], [0, 0], [5.4, 0], [0, 10]]);
  def("0", 5.2, [...ar(2.6, 5, 2.6, 5, 90, 450)]);
  def("1", 3.4, [[2.2, 10], [2.2, 0], [0, 2], [2.2, 0], [2.2, 10]]);
  def("2", 5.2, [[5.2, 10], [0, 10], [4.5, 4.45], ...ar(2.6, 2.7, 2.5, 2.7, 40, -180)]);
  def("3", 5, [...ar(2.4, 7.4, 2.6, 2.6, 155, -90), [1.3, 4.8], [2.4, 4.8], ...ar(2.4, 2.45, 2.3, 2.35, 90, -155)]);
  def("4", 5.4, [[4, 10], [4, 0], [0, 6.8], [5.4, 6.8], [4, 6.8], [4, 10]]);
  def("5", 5.2, [...ar(2.5, 6.7, 2.7, 3.3, 155, -90), [0.4, 4.2], [0.7, 0], [5, 0]]);
  { const up6 = [[0, 6.9], [0.1, 4.2], ...ar(3, 4.2, 2.9, 4, 180, 285)]; def("6", 5.2, [...ar(2.6, 6.9, 2.6, 3.1, 90, 180), ...up6, ...rev(up6), ...ar(2.6, 6.9, 2.6, 3.1, 180, 450)]); }
  def("7", 5, [[1.4, 10], [5, 0], [0, 0], [5, 0], [1.4, 10]]);
  def("8", 5.2, [...ar(2.6, 7.4, 2.6, 2.6, 90, 270), ...ar(2.6, 2.45, 2.2, 2.35, 90, 450), ...ar(2.6, 7.4, 2.6, 2.6, 270, 450)]);
  def("9", 5.2, [[5.2, 10], [5.2, 3.3], ...ar(2.6, 3.3, 2.6, 3.3, 0, -360), [5.2, 10]]);
  def(".", 1, [[0, 10], [0, 8.8], [1, 8.8], [1, 10]]);
  def(",", 1, [[0, 10], [0, 8.8], [1, 8.8], [1, 10.4], [0.2, 12]]);
  def("'", 0.6, [[0.3, 3.2], [0.3, 0]]);
  def('"', 2, [[0.3, 3.2], [0.3, 0], [0.3, 3.2], "~", [1.7, 3.2], [1.7, 0]]);
  def("!", 1, [[0, 10], [0, 8.8], [1, 8.8], [1, 10], "~", [1, 7], [1, 0], [0, 0], [0, 7], [1, 7], "~", [1, 10]]);
  { const hook = [[2.4, 7.2], [2.4, 5.4], ...ar(2.4, 2.7, 2.4, 2.7, 90, -180)]; def("?", 4.8, [[1.9, 10], [1.9, 8.8], [2.9, 8.8], [2.9, 10], "~", ...hook, ...rev(hook), "~", [2.4, 10]]); }
  def("%", 6, [[0, 10], [6, 0], [4.8, 2], [2.8, 2], ...ar(1.6, 2, 1.2, 1.6, 0, 360), [4.8, 2], [1.2, 8], [3.4, 8], ...ar(4.6, 8, 1.2, 1.6, 180, 540), [1.2, 8], [0, 10]]);
  def("+", 5, [[2.5, 8.5], [2.5, 3], [2.5, 5.75], [0, 5.75], [5, 5.75], [2.5, 5.75], "~", [2.5, 10]]);
  def("-", 3.6, [[0, 5.6], [3.6, 5.6], [0, 5.6], "~", [0, 10]]);
  def(":", 1, [[0, 10], [0, 8.8], [1, 8.8], [1, 10], [0, 10], "~", [0, 5.4], [0, 4.2], [1, 4.2], [1, 5.4], [0, 5.4], "~", [0, 10]]);
  def("/", 4, [[0, 10], [4, 0], [0, 10]]);
  def("(", 1.4, ar(2.6, 5, 2.6, 6, 120, 240));
  def(")", 1.4, ar(-1.2, 5, 2.6, 6, 60, -60));
  GL["&"] = GL["+"];
  const glyphOf = (ch) => GL[ch] || GL[ch.normalize("NFD").replace(/[̀-ͯ]/g, "")] || null;
  const normText = (str) => String(str ?? "").toUpperCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  // Width in glyph units.
  function gmeasure(str) {
    let w = 0;
    for (const ch of str) { const g = ch === " " ? null : glyphOf(ch); w += g ? g.w + GAP : SPACE; }
    return Math.max(0, w - GAP);
  }
  function gwrap(str, maxU) {
    const words = str.split(" "), lines = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? cur + " " + w : w;
      if (cur && gmeasure(t) > maxU) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  // ---- the toy: body, powder screen, knobs, glass -------------------------------------------------------
  let body = null, bodyKey = "", layer = null;
  function roundRectPath(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function makePowder(S, T, tex) {
    const G = geom(S), w = Math.ceil(G.sw), h = Math.ceil(G.sh);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"), img = g.createImageData(w, h), px = img.data, r = rng(91);
    const cell = Math.max(24, 90 * S.u), gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2, grid = [];
    for (let i = 0; i < gw * gh; i++) grid.push(r());
    const [pr, pg, pb] = T.powder;
    for (let y = 0; y < h; y++) {
      const gy = y / cell, y0 = Math.floor(gy), fy = gy - y0;
      for (let x = 0; x < w; x++) {
        const gx = x / cell, x0 = Math.floor(gx), fx = gx - x0;
        const a = grid[y0 * gw + x0] * (1 - fx) + grid[y0 * gw + x0 + 1] * fx, b = grid[(y0 + 1) * gw + x0] * (1 - fx) + grid[(y0 + 1) * gw + x0 + 1] * fx;
        const mott = (a * (1 - fy) + b * fy - 0.5) * 30 * tex;
        const noise = (r() - 0.5) * 44 * tex + (r() < 0.012 ? 38 * tex : 0);
        const v = mott + noise, i = (y * w + x) * 4;
        px[i] = pr + v; px[i + 1] = pg + v; px[i + 2] = pb + v * 1.02; px[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // A few dark flecks where the powder has clumped.
    g.fillStyle = "rgba(40,44,52,0.16)";
    for (let i = 0; i < 120 * tex; i++) g.fillRect(r() * w, r() * h, 1 + r() * 2.4 * S.u, 1 + r() * 2.4 * S.u);
    return c;
  }
  function makeBody(S) {
    const { W, H, u } = S, G = geom(S), T = S.look.tone, tex = S.look.texture;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d"), r = rng(17);
    g.fillStyle = T.bezel; g.fillRect(0, 0, W, H);
    let gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, hexA(T.bezelHi, 0.5)); gr.addColorStop(0.3, hexA(T.bezelHi, 0.0)); gr.addColorStop(0.75, hexA(T.bezelLo, 0.0)); gr.addColorStop(1, hexA(T.bezelLo, 0.7));
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // Moulded grain.
    for (let i = 0; i < 9000 * tex; i++) { g.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)"; g.fillRect(r() * W, r() * H, 1.5 * u, 1.5 * u); }
    // Rim: a bright lip and a dark shoulder just inside the edge.
    g.lineWidth = 3 * u; g.strokeStyle = hexA(T.bezelHi, 0.8); roundRectPath(g, 4 * u, 4 * u, W - 8 * u, H - 8 * u, 24 * u); g.stroke();
    g.lineWidth = 3 * u; g.strokeStyle = "rgba(0,0,0,0.22)"; roundRectPath(g, 10 * u, 10 * u, W - 20 * u, H - 20 * u, 20 * u); g.stroke();
    // Screen recess.
    const e = 8 * u;
    roundRectPath(g, G.sx - e, G.sy - e, G.sw + 2 * e, G.sh + 2 * e, G.rad + e);
    const rim = g.createLinearGradient(0, G.sy - e, 0, G.sy + G.sh + e);
    rim.addColorStop(0, "rgba(0,0,0,0.5)"); rim.addColorStop(0.5, "rgba(0,0,0,0.25)"); rim.addColorStop(1, hexA(T.bezelHi, 0.9));
    g.fillStyle = rim; g.fill();
    g.save(); roundRectPath(g, G.sx, G.sy, G.sw, G.sh, G.rad); g.clip();
    g.drawImage(makePowder(S, T, tex), G.sx, G.sy);
    // Inner shadow from the lip above and the left, and a soft light fall-off.
    let sh = g.createLinearGradient(0, G.sy, 0, G.sy + 46 * u); sh.addColorStop(0, "rgba(20,24,32,0.4)"); sh.addColorStop(1, "rgba(20,24,32,0)"); g.fillStyle = sh; g.fillRect(G.sx, G.sy, G.sw, 46 * u);
    sh = g.createLinearGradient(G.sx, 0, G.sx + 40 * u, 0); sh.addColorStop(0, "rgba(20,24,32,0.3)"); sh.addColorStop(1, "rgba(20,24,32,0)"); g.fillStyle = sh; g.fillRect(G.sx, G.sy, 40 * u, G.sh);
    const vg = g.createRadialGradient(G.sx + G.sw * 0.4, G.sy + G.sh * 0.35, G.sh * 0.2, G.sx + G.sw * 0.5, G.sy + G.sh * 0.5, Math.hypot(G.sw, G.sh) * 0.62);
    vg.addColorStop(0, "rgba(255,255,255,0.12)"); vg.addColorStop(1, "rgba(30,34,44,0.26)"); g.fillStyle = vg; g.fillRect(G.sx, G.sy, G.sw, G.sh);
    g.restore();
    // Knob wells.
    for (const kx of [G.kx1, G.kx2]) {
      g.beginPath(); g.arc(kx, G.ky, G.kr + 12 * u, 0, TAU);
      const wl = g.createLinearGradient(0, G.ky - G.kr, 0, G.ky + G.kr + 12 * u); wl.addColorStop(0, "rgba(0,0,0,0.55)"); wl.addColorStop(1, hexA(T.bezelHi, 0.7));
      g.fillStyle = wl; g.fill();
      g.beginPath(); g.arc(kx, G.ky, G.kr + 5 * u, 0, TAU); g.fillStyle = T.bezelLo; g.fill();
    }
    // Brand plate.
    const px0 = G.kx1 + G.kr + 50 * u, px1 = G.kx2 - G.kr - 50 * u, ph = (S.tall ? 112 : 78) * u, py = G.ky - ph / 2;
    roundRectPath(g, px0, py, px1 - px0, ph, 14 * u);
    g.fillStyle = T.plate; g.fill(); g.lineWidth = 2.5 * u; g.strokeStyle = "rgba(0,0,0,0.35)"; g.stroke();
    roundRectPath(g, px0 + 3 * u, py + 3 * u, px1 - px0 - 6 * u, ph - 6 * u, 12 * u); g.lineWidth = 1.5 * u; g.strokeStyle = hexA(T.bezelHi, 0.45); g.stroke();
    // The name, moulded as raised single-stroke letters, with a tiny stair-step mark beside it.
    const fs = (S.tall ? 56 : 44) * u, un = fs * 0.072, name = "LINE TOY", nw = gmeasure(name) * un * 1.25;
    const mw = fs * 1.5, gx0 = (px0 + px1) / 2 - (nw + mw + fs * 0.5) / 2, by = G.ky + fs * 0.36;
    const letters = new Path2D();
    let cx = gx0 + mw + fs * 0.5;
    for (const ch of name) {
      const gl = ch === " " ? null : glyphOf(ch);
      if (!gl) { cx += SPACE * un * 1.25; continue; }
      let first = true;
      for (const q of gl.pts) { if (q === "~") { first = true; continue; } const X = cx + q[0] * un, Y = by + (q[1] - 10) * un; if (first) letters.moveTo(X, Y); else letters.lineTo(X, Y); first = false; }
      cx += (gl.w + GAP) * un * 1.25;
    }
    g.lineJoin = "round"; g.lineCap = "round";
    g.save(); g.translate(0, -1.5 * u); g.lineWidth = 5 * u; g.strokeStyle = "rgba(0,0,0,0.4)"; g.stroke(letters); g.restore();
    g.lineWidth = 4.2 * u; g.strokeStyle = T.plateInk; g.stroke(letters);
    const mx0 = gx0, my = by;
    g.lineWidth = 4.5 * u; g.strokeStyle = T.markInk;
    g.beginPath(); g.moveTo(mx0, my); g.lineTo(mx0 + mw * 0.25, my); g.lineTo(mx0 + mw * 0.25, my - fs * 0.3); g.lineTo(mx0 + mw * 0.5, my - fs * 0.3); g.lineTo(mx0 + mw * 0.5, my - fs * 0.6); g.lineTo(mx0 + mw * 0.75, my - fs * 0.6); g.lineTo(mx0 + mw * 0.75, my - fs * 0.9); g.lineTo(mx0 + mw, my - fs * 0.9); g.stroke();
    // Screws in the corners.
    for (const [sx, sy] of [[26 * u, 22 * u], [W - 26 * u, 22 * u], [26 * u, H - 22 * u], [W - 26 * u, H - 22 * u]]) {
      g.beginPath(); g.arc(sx, sy, 9 * u, 0, TAU); g.fillStyle = hexA(T.bezelLo, 0.9); g.fill(); g.lineWidth = 2 * u; g.strokeStyle = hexA(T.bezelHi, 0.8); g.stroke();
      g.beginPath(); g.moveTo(sx - 5.5 * u, sy - 4 * u); g.lineTo(sx + 5.5 * u, sy + 4 * u); g.lineWidth = 2.4 * u; g.strokeStyle = "rgba(0,0,0,0.55)"; g.stroke();
    }
    return c;
  }
  function getBody(S) {
    const key = S.W + "x" + S.H + ":" + S.look.tone.k + ":" + Math.round(S.look.texture * 20);
    if (!body || bodyKey !== key) { body = makeBody(S); bodyKey = key; }
    return body;
  }
  function getLayer(S) {
    if (!layer || layer.width !== S.W || layer.height !== S.H) { layer = document.createElement("canvas"); layer.width = S.W; layer.height = S.H; }
    return layer.getContext("2d");
  }
  function drawKnob(g, S, cx, cy, ang) {
    const { u } = S, T = S.look.tone, r = geom(S).kr;
    g.save();
    g.beginPath(); g.ellipse(cx + 3 * u, cy + 9 * u, r, r * 0.98, 0, 0, TAU); g.fillStyle = "rgba(0,0,0,0.38)"; g.fill();
    g.beginPath(); g.arc(cx, cy, r, 0, TAU);
    let gr = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    gr.addColorStop(0, T.knobHi); gr.addColorStop(0.6, T.knob); gr.addColorStop(1, T.knobLo);
    g.fillStyle = gr; g.fill();
    // Ridges that turn with the knob.
    const n = 26;
    for (let k = 0; k < n; k++) {
      const a = ang + (k * TAU) / n, c = Math.cos(a), s = Math.sin(a);
      g.beginPath(); g.moveTo(cx + c * r * 0.86, cy + s * r * 0.86); g.lineTo(cx + c * r * 0.985, cy + s * r * 0.985);
      g.lineWidth = r * 0.075; g.lineCap = "round"; g.strokeStyle = "rgba(60,40,10,0.32)"; g.stroke();
      const a2 = a + TAU / n / 2.2;
      g.beginPath(); g.moveTo(cx + Math.cos(a2) * r * 0.86, cy + Math.sin(a2) * r * 0.86); g.lineTo(cx + Math.cos(a2) * r * 0.985, cy + Math.sin(a2) * r * 0.985);
      g.lineWidth = r * 0.03; g.strokeStyle = "rgba(255,255,255,0.35)"; g.stroke();
    }
    // Dished face with a marker.
    g.beginPath(); g.arc(cx, cy, r * 0.72, 0, TAU);
    gr = g.createRadialGradient(cx + r * 0.25, cy + r * 0.3, r * 0.05, cx, cy, r * 0.72);
    gr.addColorStop(0, T.knobLo); gr.addColorStop(1, T.knob); g.fillStyle = gr; g.fill();
    g.lineWidth = 2 * u; g.strokeStyle = "rgba(0,0,0,0.25)"; g.stroke();
    g.beginPath(); g.moveTo(cx + Math.cos(ang) * r * 0.2, cy + Math.sin(ang) * r * 0.2); g.lineTo(cx + Math.cos(ang) * r * 0.6, cy + Math.sin(ang) * r * 0.6);
    g.lineWidth = r * 0.11; g.lineCap = "round"; g.strokeStyle = T.knobMark; g.stroke();
    g.beginPath(); g.arc(cx, cy, r * 0.12, 0, TAU); g.fillStyle = T.knobLo; g.fill();
    // Fixed highlight.
    g.beginPath(); g.arc(cx, cy, r * 0.92, Math.PI * 1.08, Math.PI * 1.58); g.lineWidth = r * 0.07; g.strokeStyle = "rgba(255,255,255,0.55)"; g.stroke();
    g.restore();
  }

  // ---- shake: the whole toy jolts; the powder falls back and the picture is gone ---------------------------
  let CUR = null;
  function shakeOf(t, amp) {
    if (amp <= 0) return { x: 0, y: 0, r: 0 };
    return { x: (Math.sin(t * 97) * 0.65 + Math.sin(t * 61 + 1.3) * 0.35) * amp, y: (Math.sin(t * 83 + 2) * 0.7 + Math.sin(t * 47) * 0.3) * amp * 0.7, r: (Math.sin(t * 71 + 0.5) * 0.7 + Math.sin(t * 29 + 2.1) * 0.3) * amp * 0.0014 };
  }
  function withShake(ctx, S, fn) {
    const c = CUR, amp = c ? c.shake * 22 * S.u : 0, sk = shakeOf(c ? c.t : 0, amp);
    ctx.save();
    if (amp > 0) { ctx.translate(S.W / 2, S.H / 2); ctx.rotate(sk.r); ctx.translate(-S.W / 2 + sk.x, -S.H / 2 + sk.y); }
    fn();
    ctx.restore();
  }

  // ---- strokes, labels, erase --------------------------------------------------------------------------
  function colorOf(S, c) {
    const T = S.look.tone;
    return c === 1 ? S.accent : c === 2 ? T.mid : T.groove;
  }
  // A scratched groove: a faint bank of displaced powder, a bright lip on the lower right, a dark floor.
  function groove(g, S, path, col, dash, w) {
    const u = S.u, T = S.look.tone;
    g.lineCap = "round"; g.lineJoin = "round";
    g.setLineDash(dash);
    g.save(); g.lineWidth = w * 2.6; g.strokeStyle = "rgba(40,44,52,0.10)"; g.stroke(path); g.restore();
    g.save(); g.translate(1.5 * u, 1.9 * u); g.lineWidth = w; g.strokeStyle = T.lip; g.stroke(path); g.restore();
    g.lineWidth = w; g.strokeStyle = col; g.stroke(path);
    g.setLineDash([]);
  }
  function drawLine(g, S, P, s) {
    const w = 5.2 * S.u;
    // Faint links and shading first, so the letters and outlines always sit on top of them.
    for (const pass of [2, -1]) {
      for (const r of P.runs) {
        const q = s - r.start;
        if (q <= 0) break;
        if ((r.col === 2) !== (pass === 2)) continue;
        groove(g, S, r.path, colorOf(S, r.col), q >= r.length ? [] : [q + 0.01, r.length + 50], w);
      }
    }
  }
  // Powder pouring back over the picture, cell by cell, from the top down. The shake takes it to
  // ERASE_END; the rest falls away under the next board.
  const ERASE_END = 0.62;
  function erase(g, S, ex) {
    const cs = 18 * S.u, G = geom(S);
    g.save(); g.globalCompositeOperation = "destination-out"; g.fillStyle = "#000";
    const c0 = Math.floor(G.sx / cs), c1 = Math.ceil((G.sx + G.sw) / cs), r0 = Math.floor(G.sy / cs), r1 = Math.ceil((G.sy + G.sh) / cs);
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        const hh = (((cx * 73856093) ^ (cy * 19349663)) >>> 0) % 1000 / 1000;
        const thr = hh * 0.55 + ((cy - r0) / Math.max(1, r1 - r0)) * 0.45;
        if (ex * 1.45 - 0.2 > thr) g.fillRect(cx * cs, cy * cs, cs + 1, cs + 1);
      }
    }
    g.restore();
  }

  // ---- ring: a stepped border that keeps drawing round the screen --------------------------------------------
  const rings = {};
  function ringOf(S) {
    const key = S.W + "x" + S.H;
    if (rings[key]) return rings[key];
    const G = geom(S), u = S.u, c = 6.5 * u, ins = 20 * u;
    const x0 = G.sx + ins, x1 = G.sx + G.sw - ins, y0 = G.sy + ins, y1 = G.sy + G.sh - ins;
    const verts = [];
    const side = (len, map, nm) => {
      const cells = Math.max(2, Math.round(len / (8 * c))), cw = len / cells;
      for (let k = 0; k < cells; k++) {
        const a0 = k * cw, s = cw / 8;
        const pts = [[0, 0], [0, c], [s, c], [s, 2 * c], [2 * s, 2 * c], [2 * s, 3 * c], [3 * s, 3 * c], [5 * s, 3 * c], [5 * s, 2 * c], [6 * s, 2 * c], [6 * s, c], [7 * s, c], [7 * s, 0], [8 * s, 0]];
        for (const p of pts) { const [x, y] = map(a0 + p[0], p[1]); verts.push({ x, y, base: p[1] === 0 && (p[0] === 0 || p[0] === 8 * s || p[0] === 7 * s), side: nm }); }
      }
    };
    side(x1 - x0, (a, b) => [x0 + a, y1 - b], "b");
    side(y1 - y0, (a, b) => [x1 - b, y1 - a], "r");
    side(x1 - x0, (a, b) => [x1 - a, y0 + b], "t");
    side(y1 - y0, (a, b) => [x0 + b, y0 + a], "l");
    return (rings[key] = verts);
  }
  function addRing(pen, S, need) {
    const verts = ringOf(S);
    let best = -1, bd = Infinity;
    verts.forEach((v, i) => { if (!v.base) return; const d = Math.hypot(v.x - pen.x, v.y - pen.y); if (d < bd) { bd = d; best = i; } });
    const v0 = verts[best];
    if (v0.side === "b" || v0.side === "t") { pen.to(v0.x, pen.y); pen.to(v0.x, v0.y); } else { pen.to(pen.x, v0.y); pen.to(v0.x, v0.y); }
    const start = pen.len, target = Math.max(need, 700 * S.u);
    for (let lap = 0, j = best; lap < 4 && pen.len - start < target; lap++) {
      for (let k = 1; k <= verts.length && pen.len - start < target; k++) { const v = verts[(best + k) % verts.length]; pen.to(v.x, v.y); }
    }
    void bd;
  }

  // ---- shared drawing parts ----------------------------------------------------------------------------------
  function ringL(pen, cx, cy, r) { return pen.arc(cx, cy, r, r, Math.PI, Math.PI * 3); }
  function ringB(pen, cx, cy, r) { return pen.arc(cx, cy, r, r, Math.PI / 2, Math.PI * 2.5); }
  // Nose, eyes and mouth, drawn down from the top of a head and back up the same line.
  function faceInner(pen, cx, cy, r, mood) {
    const t = Math.max(6, r * 0.14), ym = cy + (mood > 0 ? 0.3 : 0.55) * r;
    pen.v(r * 0.75);
    pen.h(-r * 0.4); pen.v(-t); pen.v(t); pen.h(r * 0.8); pen.v(-t); pen.v(t); pen.h(-r * 0.4);
    pen.v(ym - pen.y);
    pen.h(-r * 0.45);
    if (mood > 0) pen.poly([[cx - r * 0.25, ym + r * 0.28], [cx + r * 0.25, ym + r * 0.28], [cx + r * 0.45, ym]]);
    else pen.poly([[cx - r * 0.25, ym - r * 0.25], [cx + r * 0.25, ym - r * 0.25], [cx + r * 0.45, ym]]);
  }
  function face(pen, cx, cy, r, mood) {
    pen.spur(() => { pen.ring(cx, cy, r); pen.spur(() => faceInner(pen, cx, cy, r, mood)); });
  }
  function star(pen, cx, cy, r) {
    pen.spur(() => {
      pen.to(cx, cy);
      for (let k = 0; k < 8; k++) {
        const a = (k * TAU) / 8, rr = k % 2 ? r * 0.62 : r;
        pen.to(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); pen.to(cx, cy);
      }
    });
  }
  function arrowHead(pen, x, y, dx, dy, sz) {
    const nx = -dy, ny = dx;
    pen.spur(() => {
      pen.to(x - dx * sz + nx * sz * 0.6, y - dy * sz + ny * sz * 0.6); pen.to(x, y); pen.to(x - dx * sz - nx * sz * 0.6, y - dy * sz - ny * sz * 0.6); pen.to(x - dx * sz + nx * sz * 0.6, y - dy * sz + ny * sz * 0.6);
    });
  }
  // A box drawn as a closed loop that starts and ends at the middle of one side (side: l r t b), walking
  // clockwise. A hook can hang something from the top edge where the line passes hookX.
  function boxLoop(pen, x, y, w, h, side, hookX, hookFn) {
    const m = { l: [x, y + h / 2], r: [x + w, y + h / 2], t: [x + w / 2, y], b: [x + w / 2, y + h] }[side];
    const cs = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    const walk = { t: [1, 2, 3, 0], r: [2, 3, 0, 1], b: [3, 0, 1, 2], l: [0, 1, 2, 3] }[side];
    const step = (p) => {
      if (hookFn && Math.abs(pen.y - y) < 1 && Math.abs(p[1] - y) < 1 && (pen.x - hookX) * (p[0] - hookX) < 0) { pen.to(hookX, y); pen.spur(hookFn); }
      pen.to(p[0], p[1]);
    };
    pen.to(m[0], m[1]);
    for (const i of walk) step(cs[i]);
    step(m);
  }

  // ---- scene builders ------------------------------------------------------------------------------------------
  const BUILD = {};

  BUILD.chart = (pen, A, d, f, S) => {
    const u = S.u, tall = S.tall;
    const vals = (d.values || []).map((v) => Math.max(0, Number(v) || 0)), n = Math.max(1, vals.length), max = Math.max(...vals, 1);
    const hot = d.highlight >= 0 && d.highlight < n ? d.highlight : vals.indexOf(max);
    const labels = d.labels || [];
    let B, P;
    if (!tall) { B = { x: A.x + 130 * u, y: A.y + 6 * u, w: A.w * 0.58, h: A.h - 6 * u - 84 * u }; P = { x: A.x + A.w * 0.7, y: A.y + 6 * u, w: A.w * 0.3, h: B.h }; }
    else { const ph = Math.min(420 * u, A.h * 0.32); P = { x: A.x, y: A.y, w: A.w, h: ph }; B = { x: A.x + 130 * u, y: A.y + ph + 40 * u, w: A.w - 130 * u, h: A.h - ph - 40 * u - 84 * u }; }
    const base = B.y + B.h, topY = B.y + 70 * u, H0 = base - topY, axisX = B.x - 60 * u;
    const others = vals.filter((_, i) => i !== hot), mean = others.length ? others.reduce((a, b) => a + b, 0) / others.length : 0;
    const pct = mean > 0 ? Math.round(((vals[hot] - mean) / mean) * 100) : 0;
    const panel = () => {
      const x = P.x, y = P.y, w = P.w, h = P.h, bot = y + h, foot = Math.min(60 * u, h * 0.14);
      pen.color(1); pen.zigH(x + w, bot - foot, 24 * u * f, false);
      pen.color(0); pen.v(-(h - foot)); pen.h(-100 * u);
      pen.spur(() => { pen.v(46 * u); star(pen, pen.x, y + 100 * u, 38 * u); });
      pen.h(-(pen.x - x));
      pen.text(labels[hot] || "", x + 30 * u, y + 76 * u, 56 * u, { color: "muted", vFirst: true });
      pen.text(fmtNum(vals[hot], vals[hot], d), x + 30 * u, y + 206 * u, 112 * u, { color: "acc", vFirst: true });
      pen.text(`${pct >= 0 ? "+" : ""}${pct}% vs rest`, x + 30 * u, y + 272 * u, 52 * u, { vFirst: true, maxW: w - 50 * u });
      // Down the left edge, with the four values drawn as a little line along the way.
      const ybase = bot - foot - 30 * u, hsp = Math.min(130 * u, h * 0.26), sx0 = tall ? x + w * 0.5 : x + 50 * u, sx1 = x + w - 60 * u;
      pen.v(ybase - y);
      pen.spurBack(() => {
        pen.to(sx0, ybase);
        for (let k = 0; k < n; k++) {
          const px = sx0 + ((sx1 - sx0) * k) / Math.max(1, n - 1), py = ybase - (vals[k] / max) * hsp - 14 * u;
          pen.to(px, py);
          pen.color(k === hot ? 1 : 0); pen.ring(px, py + 0, 10 * u); pen.to(px, py); pen.color(0);
        }
      });
      pen.v(bot - pen.y);
    };
    if (tall) { pen.begin(P.x, P.y + P.h); panel(); pen.go(axisX, topY - 24 * u); }
    else pen.begin(axisX, topY - 24 * u);
    // Scale, with ticks that run across as faint rules.
    // Rules laid down as one serpentine, then the axis drawn up and back down the left.
    const ty = (k) => topY - 24 * u + ((base - topY + 24 * u) * k) / 4, RL = B.w + 70 * u;
    pen.color(2);
    for (let k = 0; k < 4; k++) { pen.to(k % 2 ? axisX : axisX + RL, ty(k)); if (k < 3) pen.to(pen.x, ty(k + 1)); }
    pen.to(axisX, ty(3));
    pen.color(0);
    pen.to(axisX, base); pen.to(axisX, ty(0)); pen.to(axisX, base);
    const slot = B.w / n, bw = Math.min(slot * 0.56, 250 * u);
    for (let i = 0; i < n; i++) {
      const bx = B.x + slot * i + (slot - bw) / 2, h = Math.max(46 * u, (H0 * vals[i]) / max), top = base - h, isHot = i === hot;
      pen.to(bx, base);
      pen.text(labels[i] || "", bx + bw / 2, base + 64 * u, 54 * u, { align: "center", color: isHot ? "acc" : "ink", vFirst: true });
      pen.v(-h);
      pen.text(fmtNum(vals[i], vals[i], d), bx + bw / 2, top - 24 * u, isHot ? 74 * u : 62 * u, { align: "center", color: isHot ? "acc" : "ink", vFirst: true });
      pen.h(bw); pen.v(h);
      pen.color(isHot ? 1 : 2);
      pen.zigV(bx, base, top + 8 * u, (isHot ? 24 : 30) * u * Math.min(f, 2.5), true);
      pen.color(0);
    }
    if (tall) pen.to(A.x + A.w, base);
    else { pen.to(P.x, base); panel(); }
    pen.main = pen.len;
    const hx = B.x + slot * hot + slot / 2, hy = base - Math.max(46 * u, (H0 * vals[hot]) / max) - 150 * u;
    pen.live = (g, s, t, gv) => {
      if (s < pen.main * 0.7) return;
      const k = 0.5 + 0.5 * Math.sin(t * 5.2), r = (22 + 16 * k) * u;
      gv([[hx - r, hy], [hx + r, hy]], 1); gv([[hx, hy - r], [hx, hy + r]], 1);
      const r2 = r * 0.55; gv([[hx - r2, hy - r2], [hx + r2, hy + r2]], 1); gv([[hx - r2, hy + r2], [hx + r2, hy - r2]], 1);
    };
  };

  BUILD.object = (pen, A, d, f, S) => {
    const u = S.u, tall = S.tall, phone = d.kind === "phone" || tall;
    const calls = [(d.callouts || [])[0], (d.callouts || [])[1], (d.callouts || [])[2]];
    let sw, sh, sx, sy, R;
    if (!phone) {
      sh = Math.min(A.h - 50 * u, (A.w * 0.5) / 1.55); sw = sh * 1.55; sx = A.x + 36 * u; sy = A.y + (A.h - sh - 34 * u) / 2;
      R = { x: sx + 22 * u, y: sy + 22 * u, w: sw - 44 * u, h: sh - 44 * u };
    } else {
      sw = tall ? Math.min(A.w * 0.5, (A.h - 20 * u) / 1.7) : Math.min(A.h * 0.5, A.w * 0.3); sh = tall ? Math.min(A.h - 20 * u, sw * 1.7) : A.h - 12 * u;
      sx = A.x + 36 * u; sy = A.y + (A.h - sh) / 2;
      R = { x: sx + 20 * u, y: sy + 56 * u, w: sw - 40 * u, h: sh - 96 * u };
    }
    const Lx = sx + sw + (phone ? 90 : 120) * u, lw = A.x + A.w - Lx;
    const fr = phone ? { pr: [0.04, 0.4], r1: [0.52, 0.62], r2: [0.76, 0.86] } : { pr: [0.06, 0.56], r1: [0.64, 0.74], r2: [0.82, 0.92] };
    const rowY = (k) => [R.y + R.h * fr[k][0], R.y + R.h * fr[k][1]];
    const X = (a) => R.x + R.w * a;
    // The body.
    if (!phone) {
      pen.begin(sx - 40 * u, sy + sh + 30 * u);
      pen.h(sw + 80 * u); pen.v(-30 * u); pen.h(-(sw + 80 * u)); pen.v(30 * u);
      pen.go(sx, sy + sh);
      pen.v(-sh); pen.h(sw); pen.v(sh);
    } else {
      pen.begin(sx + 40 * u, sy + sh);
      pen.poly([[sx, sy + sh - 40 * u], [sx, sy + 40 * u], [sx + 40 * u, sy], [sx + sw / 2 - 50 * u, sy]]);
      pen.spur(() => { pen.v(26 * u); pen.h(100 * u); pen.v(-26 * u); });
      pen.h(100 * u);
      pen.poly([[sx + sw - 40 * u, sy], [sx + sw, sy + 40 * u], [sx + sw, sy + sh - 40 * u], [sx + sw - 40 * u, sy + sh], [sx + 40 * u, sy + sh]]);
    }
    const [pa, pb] = rowY("pr"), [r1a, r1b] = rowY("r1"), [r2a, r2b] = rowY("r2");
    const px = X(0.05), pw = R.w * 0.9, ph = pb - pa;
    pen.go(px, pa + ph);
    // The preview: a frame with a sun hung from its top edge and hills for a floor.
    pen.v(-ph);
    const sunX = px + pw * 0.74, sunY = pa + ph * 0.45, sunR = Math.min(ph * 0.2, 40 * u);
    pen.to(sunX, pa);
    pen.spur(() => {
      pen.v(sunY - sunR - pa);
      pen.ring(sunX, sunY, sunR);
      for (let k = 0; k < 8; k++) { const a = (k * TAU) / 8, c = Math.cos(a), s = Math.sin(a); pen.to(sunX + c * sunR, sunY + s * sunR); pen.to(sunX + c * (sunR + 18 * u), sunY + s * (sunR + 18 * u)); pen.to(sunX + c * sunR, sunY + s * sunR); }
      pen.to(sunX + sunR, sunY); pen.to(sunX + sunR + 26 * u, sunY); pen.to(Lx - 16 * u, sunY);
      pen.text(calls[0] || "", Lx, sunY + 19 * u, 52 * u, { maxW: lw });
    });
    pen.to(px + pw, pa); pen.v(ph);
    pen.color(2);
    for (const [a, b] of [[1, 0.95], [0.86, 0.55], [0.7, 0.8], [0.52, 0.4], [0.36, 0.75], [0.2, 0.5], [0, 0.9]]) pen.to(px + pw * (1 - a), pa + ph * b);
    pen.color(0); pen.to(px, pa + ph);
    // Tracks: the proposed row (accent clip, leader 2), then the original row (leader 3).
    const row = (ya, yb, clips, k) => {
      for (const c of clips) {
        const xa = X(c.a), xb = X(c.b);
        pen.go(xa, yb);
        if (c.hot) { pen.color(1); pen.zigV(xb, yb, ya, 22 * u * f, true); pen.color(0); pen.v(-(yb - ya)); pen.h(-(xb - xa)); pen.v(yb - ya); pen.h(xb - xa); }
        else { pen.v(-(yb - ya)); pen.h(xb - xa); pen.v(yb - ya); }
        if (c.lead) {
          const my = (ya + yb) / 2;
          pen.to(xb, my);
          pen.spur(() => { pen.ring(xb, my, 9 * u); pen.to(xb, my); pen.to(Lx - 16 * u, my); pen.text(calls[k] || "", Lx, my + 19 * u, 52 * u, { maxW: lw, color: k === 1 ? "acc" : "ink" }); });
        }
      }
    };
    pen.to(px, r1b);
    row(r1a, r1b, [{ a: 0.05, b: 0.4 }, { a: 0.44, b: 0.58 }, { a: 0.62, b: 0.95, hot: true, lead: true }], 1);
    pen.to(pen.x, r2b);
    row(r2a, r2b, [{ a: 0.05, b: 0.3 }, { a: 0.34, b: 0.58 }, { a: 0.62, b: 0.95, lead: true }], 2);
    // Out along the foot of the device to the border.
    const deskY = sy + sh + (phone ? 14 : 30) * u;
    pen.to(pen.x, deskY);
    // Little toys stand along the desk line on the way out.
    {
      const dh = (tall ? 150 : 84) * u, names = ["robot", "mug", "cactus", "flag", "tower"], x0 = sx + sw + (phone ? 110 : 150) * u, x1 = A.x + A.w - 10 * u;
      const list = []; let total = 0;
      for (const nm of names) { const w = ITEMS[nm].w(dh); if (total + w + list.length * 30 * u > x1 - x0) break; list.push({ nm, w }); total += w; }
      const g = list.length > 1 ? (x1 - x0 - total) / (list.length - 1) : 0;
      let x = x0;
      for (const it of list) { pen.to(x, deskY); ITEMS[it.nm].draw(pen, x, deskY, dh, f, S); x += it.w + g; }
    }
    pen.to(A.x + A.w + 24 * u, pen.y);
    pen.main = pen.len;
    // The playhead sweeps across the tracks.
    pen.live = (g, s, t, gv) => {
      if (s < pen.main * 0.6) return;
      const x = X(0.06 + 0.88 * ((t * 0.16) % 1));
      gv([[x, r1a - 14 * u], [x, r2b + 10 * u]], 1);
      gv([[x - 9 * u, r1a - 28 * u], [x + 9 * u, r1a - 28 * u], [x, r1a - 12 * u], [x - 9 * u, r1a - 28 * u]], 1);
    };
  };

  BUILD.people = (pen, A, d, f, S) => {
    const u = S.u, tall = S.tall;
    const n = clamp(Math.round(d.count || 4), 2, 6), badges = (d.badges || []).filter(Boolean);
    const cols = tall ? (n >= 3 ? 2 : 1) : n, rows = Math.ceil(n / cols), cw = A.w / cols, ch = A.h / rows;
    const hotIdx = Math.min(n - 1, d.highlight ?? 1);
    const fh = Math.min(ch * 0.64, cw * 1.05), bw = fh * 0.52, bodyH = fh * 0.5, hr = fh * 0.16;
    const spots = [];
    for (let i = 0; i < n; i++) { const r = Math.floor(i / cols), cc = i % cols; spots.push({ i, r, col: r % 2 ? cols - 1 - cc : cc }); }
    const hairs = [
      (cx, top) => { const w = hr * 0.8; pen.poly([[cx - w, top + 6 * u], [cx - w * 0.6, top - hr * 0.5], [cx - w * 0.2, top + 2 * u], [cx, top - hr * 0.7], [cx + w * 0.2, top + 2 * u], [cx + w * 0.6, top - hr * 0.5], [cx + w, top + 6 * u]]); },
      (cx, top) => { pen.v(-4 * u); ringB(pen, cx, top - 4 * u - hr * 0.38, hr * 0.38); },
      (cx, top) => { pen.poly([[cx - hr * 0.9, top + hr * 0.5], [cx - hr * 0.7, top - hr * 0.2], [cx + hr * 0.7, top - hr * 0.2], [cx + hr * 0.9, top + hr * 0.5], [cx + hr * 1.5, top + hr * 0.5]]); },
      (cx, top) => { pen.v(-hr * 0.8); ringB(pen, cx, pen.y - hr * 0.22, hr * 0.22); },
      (cx, top) => { for (const dx of [-0.6, 0, 0.6]) { pen.to(cx + dx * hr, top - 2 * u); ringB(pen, cx + dx * hr, top - 2 * u - hr * 0.26, hr * 0.26); } },
      (cx, top) => { pen.to(cx - hr * 0.8, top + 4 * u); pen.v(-hr * 0.8 - 4 * u); pen.h(hr * 1.6); pen.v(hr * 0.8 + 4 * u); pen.h(hr * 0.5); pen.h(-hr * 2.6); },
    ];
    let first = true;
    const hotPos = {};
    for (const sp of spots) {
      const i = sp.i, hot = i === hotIdx, cx = A.x + cw * (sp.col + 0.5), gy = A.y + ch * (sp.r + 1) - 16 * u;
      if (first) { pen.begin(A.x, gy); first = false; }
      const shY = gy - bodyH, hcy = shY - 8 * u - hr, headTop = hcy - hr;
      pen.to(cx - bw / 2, gy);
      pen.color(hot ? 1 : 2);
      pen.zigV(cx + bw / 2, gy, shY + 12 * u, (hot ? 20 : 24) * u * f, true);
      pen.color(0);
      pen.v(-(bodyH - 20 * u)); pen.to(cx + bw / 2 - 20 * u, shY); pen.to(cx + 8 * u, shY); pen.to(cx + 8 * u, shY - 8 * u); pen.to(cx, shY - 8 * u);
      pen.arc(cx, hcy, hr, hr, Math.PI / 2, Math.PI * 1.5);
      const label = badges.length ? badges[i % badges.length] : "";
      pen.text(label, cx, headTop - hr * 1.5 - 20 * u, hot ? 58 * u : 54 * u, { align: "center", color: hot ? "acc" : "ink", maxW: cw * 0.96, vFirst: true, anchor: "bottom" });
      pen.spur(() => hairs[i % hairs.length](cx, headTop));
      pen.spur(() => faceInner(pen, cx, hcy, hr, 1));
      pen.arc(cx, hcy, hr, hr, Math.PI * 1.5, Math.PI * 2.5);
      pen.to(cx - 8 * u, shY - 8 * u); pen.to(cx - 8 * u, shY); pen.to(cx - bw / 2 + 20 * u, shY); pen.to(cx - bw / 2, shY + 20 * u); pen.to(cx - bw / 2, gy);
      if (hot) { hotPos.x = cx; hotPos.y = shY + 8 * u; hotPos.bw = bw; }
      const nxt = spots[i + 1];
      if (nxt && nxt.r === sp.r) {
        const mid = A.x + cw * ((sp.col + nxt.col) / 2 + 0.5), fs = Math.min(86 * u, fh * 0.3);
        pen.to(mid, gy);
        pen.spurBack(() => {
          pen.v(-fs * 0.5); pen.h(-fs * 0.3); pen.v(-fs * 0.12); pen.h(fs * 0.3); pen.v(fs * 0.12);
          pen.v(-fs * 0.5); ringB(pen, mid, pen.y - fs * 0.34, fs * 0.34);
          pen.v(-fs * 0.68 + 0); pen.v(0);
        });
      } else if (nxt) {
        pen.to(cx > A.x + A.w / 2 ? A.x + A.w : A.x, gy);
        pen.to(pen.x, A.y + ch * (nxt.r + 1) - 16 * u);
      }
    }
    const lastSpot = spots[spots.length - 1], lastX = A.x + cw * (lastSpot.col + 0.5);
    pen.to(lastSpot.col >= cols / 2 ? A.x + A.w + 24 * u : lastX + cw / 2 - 8 * u, pen.y);
    pen.main = pen.len;
    pen.live = (g, s, t, gv) => {
      if (s < pen.main * 0.55 || hotPos.x === undefined) return;
      const x0 = hotPos.x + hotPos.bw / 2 - 6 * u, y0 = hotPos.y, L = fh * 0.34, a = -0.7 + Math.sin(t * 6.5) * 0.5;
      const hx = x0 + Math.cos(a) * L, hy = y0 + Math.sin(a) * L;
      gv([[x0, y0], [hx, hy]], 1);
      const pts = []; for (let k = 0; k <= 14; k++) pts.push([hx + Math.cos((k / 14) * TAU) * 12 * u, hy + Math.sin((k / 14) * TAU) * 12 * u]);
      gv(pts, 1);
    };
  };

  BUILD.process = (pen, A, d, f, S) => {
    const u = S.u, tall = S.tall, steps = (d.steps || []).filter(Boolean), n = Math.max(1, steps.length);
    const ICON = {
      file(r, cx, cy) {
        pen.poly([[cx - 0.7 * r, cy - r], [cx + 0.2 * r, cy - r], [cx + 0.7 * r, cy - 0.5 * r], [cx + 0.7 * r, cy + r], [cx - 0.7 * r, cy + r], [cx - 0.7 * r, cy]]);
        pen.spurBack(() => { pen.v(-0.4 * r); pen.h(0.75 * r); });
        pen.spurBack(() => { pen.v(0.45 * r); pen.h(0.95 * r); });
      },
      gear(r, cx, cy) {
        const T = 8, w0 = 0.2, w1 = 0.13, step = TAU / T;
        for (let k = 0; k < T; k++) {
          const a = Math.PI + k * step, P = (ang, rr) => [cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr];
          pen.poly([P(a - w1, r), P(a + w1, r), P(a + w0, 0.78 * r), P(a + step / 2, 0.78 * r), P(a + step - w0, 0.78 * r)]);
        }
        pen.to(cx - r, cy);
        pen.spurBack(() => { pen.h(0.7 * r); ringL(pen, cx, cy, 0.3 * r); });
      },
      eye(r, cx, cy) {
        pen.poly([[cx - 0.5 * r, cy - 0.5 * r], [cx + 0.5 * r, cy - 0.5 * r], [cx + r, cy], [cx + 0.5 * r, cy + 0.5 * r], [cx - 0.5 * r, cy + 0.5 * r], [cx - r, cy]]);
        pen.spurBack(() => { pen.h(0.7 * r); ringL(pen, cx, cy, 0.3 * r); });
      },
      check(r, cx, cy) {
        ringL(pen, cx, cy, r);
        pen.spurBack(() => { pen.h(0.55 * r); pen.poly([[cx - 0.1 * r, cy + 0.38 * r], [cx + 0.5 * r, cy - 0.32 * r]]); });
      },
    };
    const lw = { file: 0.7, gear: 1, eye: 1, check: 1 };
    const kinds = ["file", "gear", "eye"];
    const gap = (tall ? 120 : 150) * u;
    const cw = tall ? A.w : (A.w - gap * (n - 1)) / n, ch = tall ? (A.h - gap * (n - 1)) / n : Math.min(A.h - 20 * u, 470 * u);
    const cx0 = (i) => (tall ? A.x : A.x + i * (cw + gap)), cy0 = (i) => (tall ? A.y + i * (ch + gap) : A.y + (A.h - ch) / 2);
    if (!tall) pen.begin(A.x, cy0(0) + ch / 2); else pen.begin(A.x + cw / 2, A.y);
    for (let i = 0; i < n; i++) {
      const x = cx0(i), y = cy0(i), last = i === n - 1, hot = last;
      const mx = x + cw / 2, my = y + ch / 2, r = Math.min(ch * 0.24, 100 * u), kind = last ? "check" : kinds[i % 3];
      const dotsX = x + cw - 40 * u - (n - 1) * 38 * u;
      boxLoop(pen, x, y, cw, ch, tall ? "t" : "l", dotsX, () => {
        pen.v(35 * u);
        for (let k = 0; k < n; k++) {
          const px = dotsX + 38 * u * k;
          pen.to(px, y + 35 * u); pen.color(k === i ? 1 : 0); pen.ring(px, y + 46 * u, 11 * u); pen.color(0);
        }
      });
      // The stem through the card, with the icon strung on it.
      pen.to(mx, my);
      pen.spur(() => { pen.h(-lw[kind] * r); ICON[kind](r, mx, my); });
      if (!tall) {
        pen.to(x + cw, my);
        pen.text(steps[i] || "", mx, y + ch - 46 * u, 54 * u, { align: "center", maxW: cw - 70 * u, color: hot ? "acc" : "ink", vFirst: true, anchor: "bottom" });
      } else {
        pen.to(mx, y + ch);
        pen.text(steps[i] || "", mx + r + 50 * u, my + 20 * u, 58 * u, { maxW: cw / 2 - r - 70 * u, color: hot ? "acc" : "ink", anchor: "middle" });
      }
      // A shaded corner.
      pen.color(hot ? 1 : 2);
      pen.spur(() => { pen.go(x + cw - 6 * u, y + ch - 6 * u, true); pen.zigV(x + cw - 60 * u, y + ch - 6 * u, y + ch - 60 * u, 20 * u * f, true); });
      pen.color(0);
      if (!last) {
        if (!tall) { const nx = cx0(i + 1); pen.to(nx - 4 * u, my); arrowHead(pen, nx - 4 * u, my, 1, 0, 24 * u); pen.to(nx, my); }
        else { const ny = cy0(i + 1); pen.to(mx, ny - 4 * u); arrowHead(pen, mx, ny - 4 * u, 0, 1, 24 * u); pen.to(mx, ny); }
      }
    }
    if (!tall) { pen.to(A.x + A.w + 24 * u, pen.y); } else { pen.to(A.x + A.w + 24 * u, pen.y); }
    pen.main = pen.len;
    pen.live = (g, s, t, gv) => {
      if (s < pen.main * 0.6) return;
      for (let i = 0; i < n; i++) {
        const x = cx0(i), y = cy0(i), k = (t * 0.7 + i * 0.3) % 1;
        const px = tall ? x + cw / 2 : x + 20 * u + (cw - 40 * u) * k, py = tall ? y + 14 * u + (ch - 28 * u) * k : y + ch / 2;
        const pts = []; for (let q = 0; q <= 12; q++) pts.push([px + Math.cos((q / 12) * TAU) * 9 * u, py + Math.sin((q / 12) * TAU) * 9 * u]);
        gv(pts, 1);
      }
    };
  };

  BUILD.compare = (pen, A, d, f, S) => {
    const u = S.u, tall = S.tall;
    const lv = Number(d.leftValue) || 0, rv = Number(d.rightValue) || 0, mx = Math.max(lv, rv, 1);
    const gap = (tall ? 210 : 230) * u;
    const pw = tall ? A.w : (A.w - gap) / 2, ph = tall ? (A.h - gap) / 2 : Math.min(A.h - 10 * u, 560 * u);
    const P1 = { x: A.x, y: tall ? A.y : A.y + (A.h - ph) / 2, w: pw, h: ph }, P2 = { x: tall ? A.x : A.x + pw + gap, y: tall ? A.y + ph + gap : A.y + (A.h - ph) / 2, w: pw, h: ph };
    const pct = lv ? Math.round(((rv - lv) / lv) * 100) : 0;
    const E1 = tall ? [P1.x + pw / 2, P1.y + ph] : [P1.x + pw, P1.y + ph / 2], E2 = tall ? [P2.x + pw / 2, P2.y] : [P2.x, P2.y + ph / 2];
    const panel = (Pn, E, label, val, hot, sad, side) => {
      const { x, y, w, h } = Pn, fx = x + w - 100 * u;
      boxLoop(pen, x, y, w, h, side, fx, () => { pen.v(34 * u); face(pen, fx, y + 34 * u + 56 * u, 56 * u, sad ? -1 : 1); });
      // The meter along the foot, shaded to its value, reached down the edge.
      const mx0 = x + 36 * u, my0 = y + h - 80 * u, mw = w - 72 * u, mh = 40 * u, fill = clamp(val / mx);
      if (tall) { pen.to(x, pen.y); pen.to(x, my0 + mh); pen.to(mx0, my0 + mh); } else pen.go(mx0, my0 + mh, true);
      pen.color(hot ? 1 : 2); pen.zigV(mx0 + mw * fill, my0 + mh, my0, 22 * u * f, true); pen.color(0);
      pen.to(mx0 + mw, my0 + mh); pen.v(-mh); pen.h(-mw); pen.v(mh);
      // Up the margin to write the number, then the label above it.
      pen.text(fmtNum(val, val, d), mx0, y + h * 0.5 + 56 * u, Math.min(140 * u, h * 0.3), { color: hot ? "acc" : "ink", vFirst: true });
      pen.text(label, mx0, y + 82 * u, 56 * u, { color: hot ? "acc" : "muted", maxW: w - 230 * u, vFirst: true });
      pen.to(pen.x, y + h);
      if (E) { pen.to(E[0], y + h); pen.to(E[0], E[1]); }
    };
    // In a tall frame the pen enters the first panel from the top, so the link from the headline stays short.
    if (tall) pen.begin(P1.x + pw / 2, P1.y); else pen.begin(E1[0], E1[1]);
    panel(P1, E1, d.left || "", lv, false, true, tall ? "t" : "r");
    if (!tall) {
      pen.to(E2[0] - 4 * u, E2[1]); arrowHead(pen, E2[0] - 4 * u, E2[1], 1, 0, 28 * u);
      pen.text(`${pct >= 0 ? "+" : ""}${pct}%`, (E1[0] + E2[0]) / 2, E2[1] - 34 * u, 72 * u, { align: "center", color: "acc", vFirst: true });
    } else {
      pen.to(E2[0], E2[1] - 4 * u); arrowHead(pen, E2[0], E2[1] - 4 * u, 0, 1, 28 * u);
      pen.text(`${pct >= 0 ? "+" : ""}${pct}%`, E2[0] + 44 * u, (E1[1] + E2[1]) / 2 + 26 * u, 72 * u, { color: "acc" });
    }
    pen.to(E2[0], E2[1]);
    panel(P2, null, d.right || "", rv, true, false, tall ? "t" : "l");
    if (!tall) { pen.to(P2.x, P2.y + ph); pen.to(pen.x, A.y + A.h + 10 * u); } else { pen.to(P2.x + pw, pen.y); pen.to(pen.x + 24 * u, pen.y); }
    pen.main = pen.len;
    pen.live = (g, s, t, gv) => {
      if (s < pen.main * 0.6) return;
      const k = (t * 0.5) % 1;
      for (const Pn of [P1, P2]) {
        const bx = Pn.x + 36 * u + (Pn.w - 72 * u) * k, by = Pn.y + Pn.h - 80 * u;
        gv([[bx, by - 12 * u], [bx, by + 52 * u]], Pn === P2 ? 1 : 0);
      }
    };
  };

  // Statement scenes: a toy shelf along the foot of the screen and a sky of hanging things above the type.
  function itemBlock(pen, x, gy, w, h, f, S, col) {
    pen.to(x, gy); pen.color(col); pen.zigV(x + w, gy, gy - h * 0.8, (col === 1 ? 22 : 18) * S.u * f, true); pen.color(0);
  }
  const ITEMS = {
    tower: { w: (h) => h * 0.42, draw(pen, x, gy, h, f, S) {
      const u = S.u, w = h * 0.42, m = Math.max(10 * u, h * 0.07), seg = w / 6;
      itemBlock(pen, x, gy, w, h, f, S, 2);
      pen.v(-h);
      for (let i = 0; i < 6; i++) { if (i % 2 === 0) { pen.v(-m); pen.h(-seg); pen.v(m); } else pen.h(-seg); }
      pen.v(h);
      pen.spurBack(() => { pen.to(x + w / 2, gy - h * 0.55); pen.h(-w * 0.18); pen.v(-h * 0.14); pen.h(w * 0.36); pen.v(h * 0.14); pen.h(-w * 0.36); });
    } },
    house: { w: (h) => h * 0.7, draw(pen, x, gy, h, f, S) {
      const u = S.u, w = h * 0.7, bh = h * 0.55;
      itemBlock(pen, x, gy, w, bh, f, S, 1);
      pen.v(-bh); pen.to(x + w + 10 * u, gy - bh); pen.to(x + w / 2, gy - h); pen.to(x - 10 * u, gy - bh); pen.to(x, gy - bh); pen.to(x, gy);
      pen.spurBack(() => { pen.to(x + w * 0.4, gy); pen.v(-bh * 0.55); pen.h(w * 0.2); pen.v(bh * 0.55); });
    } },
    tree: { w: (h) => h * 0.5, draw(pen, x, gy, h, f, S) {
      const u = S.u, w = h * 0.5, cx = x + w / 2, r = Math.min(w * 0.5, h * 0.3), cy = gy - h * 0.35 - r;
      pen.to(cx, gy); pen.v(-h * 0.35);
      pen.color(2); pen.spurBack(() => { pen.arc(cx, cy, r, r, Math.PI / 2, Math.PI * 1.5); pen.zigH(cx + r * 0.2, cy - r, 18 * u * f, true); }); pen.color(0);
      pen.spurBack(() => { ringB(pen, cx, cy, r); ringB(pen, cx, cy - r * 0.7, r * 0.7); });
      pen.to(cx, gy);
    } },
    rocket: { w: (h) => h * 0.36 * 1.7, draw(pen, x, gy, h, f, S) {
      const u = S.u, w = h * 0.36, cx = x + w / 2, ox = w * 0.35;
      pen.to(x + ox, gy);
      const X = (v) => x + ox + v;
      pen.color(1); pen.spurBack(() => { pen.to(X(w * 0.1), gy - h * 0.2); pen.zigV(X(w * 0.9), gy - h * 0.2, gy - h * 0.62, 22 * u * f, true); }); pen.color(0);
      pen.poly([[X(-ox), gy], [X(0), gy - h * 0.25], [X(0), gy - h * 0.7], [X(w / 2), gy - h], [X(w), gy - h * 0.7], [X(w), gy - h * 0.25], [X(w + ox), gy], [X(w), gy], [X(0), gy]]);
      void cx;
      pen.spurBack(() => { pen.to(X(w / 2), gy); pen.v(-h * 0.55); ringB(pen, X(w / 2), gy - h * 0.55 - w * 0.2, w * 0.2); });
      pen.to(x + ox, gy);
    } },
    flag: { w: (h) => h * 0.5, draw(pen, x, gy, h, f, S) {
      const u = S.u, w = h * 0.5;
      pen.to(x, gy); pen.v(-h);
      pen.poly([[x + w, gy - h * 0.88], [x, gy - h * 0.62]]);
      pen.color(2); pen.spurBack(() => { pen.to(x + 6 * u, gy - h * 0.88); pen.zigV(x + w * 0.9, gy - h * 0.88, gy - h * 0.66, 14 * u * f, true); }); pen.color(0);
      pen.to(x, gy);
    } },
    robot: { w: (h) => h * 0.5, draw(pen, x, gy, h, f, S) {
      const u = S.u, w = h * 0.5, bh = h * 0.5, hh = h * 0.28, hw = w * 0.8, hx = x + (w - hw) / 2;
      pen.to(x, gy); pen.color(1); pen.zigV(x + w, gy, gy - bh, 22 * u * f, true); pen.color(0);
      pen.v(-bh); pen.h(-w); pen.v(bh);
      pen.spurBack(() => {
        pen.to(x, gy - bh); pen.h((w - hw) / 2); pen.v(-hh); pen.h(hw); pen.v(hh); pen.h(-hw);
        pen.v(-hh * 0.62); pen.h(hw * 0.28); pen.v(-7 * u); pen.v(7 * u); pen.h(hw * 0.44); pen.v(-7 * u); pen.v(7 * u);
      });
      pen.spurBack(() => { pen.to(x + w * 0.5, gy - bh); pen.v(-hh); pen.v(-h * 0.14); ringB(pen, x + w * 0.5, pen.y - 9 * u, 9 * u); });
      pen.to(x, gy);
    } },
    cactus: { w: (h) => h * 0.5, draw(pen, x, gy, h, f, S) {
      const u = S.u, w = h * 0.5, cx = x + w / 2, tw = w * 0.22;
      pen.to(cx - tw / 2, gy); pen.color(2); pen.zigV(cx + tw / 2, gy, gy - h * 0.9, 12 * u * f, true); pen.color(0);
      pen.v(-h * 0.9); pen.h(tw); pen.v(h * 0.9);
      pen.spurBack(() => { pen.to(cx + tw / 2, gy - h * 0.45); pen.h(w * 0.28); pen.v(-h * 0.3); pen.h(-w * 0.1); });
      pen.spurBack(() => { pen.to(cx - tw / 2, gy - h * 0.6); pen.h(-w * 0.28); pen.v(-h * 0.22); pen.h(w * 0.1); });
      pen.to(cx - tw / 2, gy); pen.to(x, gy);
    } },
    mug: { w: (h) => h * 0.62, draw(pen, x, gy, h, f, S) {
      const u = S.u, w = h * 0.46, bh = h * 0.6;
      pen.to(x, gy); pen.color(2); pen.zigV(x + w, gy, gy - bh, 14 * u * f, true); pen.color(0);
      pen.v(-bh); pen.h(-w); pen.v(bh);
      pen.spurBack(() => { pen.to(x + w, gy - bh * 0.78); pen.h(h * 0.1); pen.v(bh * 0.5); pen.h(-h * 0.1); });
      pen.to(x, gy);
    } },
  };
  function statement(variant) {
    return (pen, A, d, f, S) => {
      const u = S.u, G = geom(S), T = statementBox(S, variant === 0 ? "title" : "closing");
      const bandTop = G.sy + 78 * u, bandBot = G.sy + G.sh - 78 * u;
      const lowH = bandBot - (T.bottom + 30 * u), highH = T.top - 24 * u - bandTop;
      const x0 = A.x, x1 = A.x + A.w;
      const order = variant === 0 ? ["tower", "tree", "rocket", "house", "robot", "flag", "cactus", "mug", "tower", "tree"] : ["flag", "house", "robot", "tree", "rocket", "cactus", "tower", "mug", "house", "flag"];
      pen.begin(x0, bandBot);
      if (lowH > 90 * u) {
        const H = Math.min(lowH, (S.tall ? 340 : 270) * u), scale = [1, 0.8, 0.95, 0.75, 1, 0.85, 0.9, 0.7, 1, 0.8];
        const list = []; let total = 0;
        for (let i = 0; i < order.length; i++) {
          const h = H * scale[i % scale.length], w = ITEMS[order[i]].w(h);
          if (total + w + (list.length) * 28 * u > A.w - 20 * u) break;
          list.push({ name: order[i], h, w }); total += w;
        }
        const g = list.length > 1 ? (A.w - 30 * u - total) / (list.length - 1) : 0;
        let x = x0 + 12 * u;
        for (const it of list) { pen.to(x, bandBot); ITEMS[it.name].draw(pen, x, bandBot, it.h, f, S); x += it.w + g; }
      }
      pen.to(x1, bandBot);
      if (highH > 100 * u) {
        const top = bandTop + 14 * u;
        pen.to(x1, top);
        const n = Math.max(3, Math.round((x1 - x0) / (170 * u))), cwid = (x1 - x0) / n;
        for (let k = 0; k < n; k++) {
          const xr = x1 - k * cwid, cx = xr - cwid / 2, r = cwid / 2;
          pen.to(xr, top); pen.arc(cx, top, r, r * 0.55, 0, -Math.PI);
          const len = Math.min(highH - 70 * u, (60 + ((k * 53) % 90)) * u * (S.tall ? 2.6 : 1.5)), br = Math.min(cwid * 0.2, 52 * u);
          pen.spurBack(() => {
            pen.to(cx, top);
            pen.v(len);
            if (variant === 0) {
              pen.color(k % 2 ? 1 : 2); pen.spurBack(() => { pen.to(cx - br * 0.7, pen.y + br); pen.zigH(cx + br * 0.7, pen.y + br * 1.6, (k % 2 ? 20 : 14) * u * f, true); }); pen.color(0);
              pen.v(br * 0.0); ringB(pen, cx, pen.y + br * 1.1, br * 0.82);
            } else star(pen, cx, pen.y + br, br * 1.1);
          });
        }
        pen.to(x0, top);
      }
      pen.main = pen.len;
      pen.live = (g, s, t, gv) => {
        if (s < pen.main * 0.8) return;
        for (let k = 0; k < 3; k++) {
          const cx = A.x + A.w * (0.2 + 0.3 * k), cy = G.sy + G.sh / 2 + (k % 2 ? 1 : -1) * (T.bottom - T.top) * 0.9, a = 0.5 + 0.5 * Math.sin(t * 4 + k * 2), r = (14 + 12 * a) * u;
          if (cy < T.top - 30 * u || cy > T.bottom + 30 * u) { gv([[cx - r, cy], [cx + r, cy]], 1); gv([[cx, cy - r], [cx, cy + r]], 1); }
        }
      };
    };
  }
  BUILD.title = statement(0);
  BUILD.closing = statement(1);

  // ---- paths, cached by everything that shapes them -------------------------------------------------------------
  // The headline (and kicker) of a scene, read from the template's hidden type so layout agrees with it.
  function headOf(S, id) {
    const ids = id === "title" ? ["kicker", "title"] : id === "closing" ? ["closing"] : [id + "-title"], out = [];
    for (const k of ids) {
      const el = document.getElementById(k), b = elBox(k);
      if (!el || !b) continue;
      const str = normText(el.textContent);
      if (!str) continue;
      const u = S.u;
      if (k === "kicker") { out.push({ str, x: b.x, y: b.y + b.h - 2 * u, size: 48 * u, color: "acc" }); continue; }
      let fs = parseFloat(el.style.fontSize) || 72 * u;
      const allow = Math.max(1, Math.round(b.h / (fs * 1.04))), minFs = 46 * u;
      let lines = gwrap(str, b.w / (fs * 0.072));
      while (lines.length > allow && fs > minFs) { fs *= 0.95; lines = gwrap(str, b.w / (fs * 0.072)); }
      out.push({ str, x: b.x, y: b.y + fs * 0.86, size: fs, maxW: b.w, lh: fs * 1.04, color: "ink" });
    }
    return out;
  }
  const cache = new Map();
  function pathFor(S, id, hold, change, d, A) {
    const heads = headOf(S, id);
    const key = [id, S.W, S.H, hold.toFixed(2), change.toFixed(2), JSON.stringify(d || {}), JSON.stringify(heads), Math.round(A.x), Math.round(A.y), Math.round(A.w), Math.round(A.h)].join("|");
    if (cache.has(key)) return cache.get(key);
    const make = (f) => {
      const pen = new Pen(S.u * 5);
      for (const hd of heads) pen.text(hd.str, hd.x, hd.y, hd.size, { maxW: hd.maxW, lh: hd.lh, color: hd.color, back: false });
      pen.head = pen.len;
      BUILD[id](pen, A, d || {}, f, S);
      return pen;
    };
    const base = 3500 * S.u, budget = base * 2.8 * hold * 0.7;
    let f = 1, pen = make(1);
    if (pen.len > budget) {
      const len1 = pen.len;
      pen = make(60);
      const fixed = pen.len;
      f = budget <= fixed * 1.05 ? 1.8 : clamp((len1 - fixed) / (budget - fixed), 1, 1.8);
      pen = make(f);
    }
    const main = pen.len, head = pen.head;
    const speed = clamp((main - head) / Math.max(0.8, hold * 0.7 - 0.5), base, base * 4);
    // The headline is written quickly so the drawing starts within the first moments of the board.
    const hs = Math.max(speed * 1.5, head / 0.6);
    pen.speed = speed; pen.hs = hs; pen.main = main;
    const tMain = head / hs + (main - head) / speed;
    addRing(pen, S, speed * Math.max(0.5, hold + change + 0.6 - tMain));
    pen.finish();
    cache.set(key, pen);
    return pen;
  }
  // Distance along the line at a scene-local time (the pen has a small head start).
  function sAt(P, local) {
    const tt = Math.max(0, local + 0.3), th = P.head / P.hs, dl = P.main - P.head, tm = dl / P.speed;
    if (tt < th) return tt * P.hs;
    const k = (tt - th) / tm;
    // The drawing opens fast and settles: the board fills early, and the pen keeps moving.
    if (k < 1) return P.head + dl * (k + 0.6 * k * (1 - k));
    return clamp(P.main + (tt - th - tm) * P.speed, 0, P.total);
  }

  // ---- one frame of a scene ---------------------------------------------------------------------------------------
  function gvFor(g, S) {
    return (pts, col) => {
      const p = new Path2D(); p.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
      groove(g, S, p, colorOf(S, col), [], 4.6 * S.u);
    };
  }
  // info.exit set: the outgoing board, still shaking loose under the new one (powder residue, no stylus).
  function renderScene(ctx, S, id, d, info) {
    const cur = CUR || { ex: 0, shake: 0, t: info.t };
    const leaving = info.exit != null;
    const ex = leaving ? ERASE_END + (1 - ERASE_END) * Math.pow(info.exit, 1.6) : cur.ex;
    const A = areaOf(S, id), G = geom(S), T = S.look.tone, u = S.u;
    const P = pathFor(S, id, info.hold, info.change, d, A);
    const s = sAt(P, info.local);
    const g = getLayer(S);
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, S.W, S.H);
    drawLine(g, S, P, s);
    if (P.live) P.live(g, s, info.t, gvFor(g, S));
    if (ex > 0) erase(g, S, ex);
    const tip = P.at(s);
    withShake(ctx, S, () => {
      ctx.save();
      roundRectPath(ctx, G.sx, G.sy, G.sw, G.sh, G.rad); ctx.clip();
      if (ex > 0) { ctx.filter = `blur(${ex * 2.2 * u}px)`; ctx.globalAlpha = leaving ? (1 - ERASE_END * 0.2) * (1 - Math.pow(info.exit, 1.4)) : 1 - ex * 0.2; }
      ctx.drawImage(layer, 0, 0);
      ctx.filter = "none"; ctx.globalAlpha = 1;
      if (!leaving) {
        // The stylus head.
        const vis = 1 - clamp((ex - 0.15) / 0.3);
        if (vis > 0) {
          ctx.globalAlpha = vis;
          const gl = ctx.createRadialGradient(tip[0], tip[1], 0, tip[0], tip[1], 30 * u);
          gl.addColorStop(0, hexA(S.accent, 0.55)); gl.addColorStop(1, hexA(S.accent, 0));
          ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(tip[0], tip[1], 30 * u, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.arc(tip[0], tip[1], 8 * u, 0, TAU); ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = 2.6 * u; ctx.strokeStyle = T.groove; ctx.stroke();
          ctx.globalAlpha = 1;
        }
        glass(ctx, S, info.t);
      }
      ctx.restore();
      if (S.paint && !leaving) {
        drawKnob(ctx, S, G.kx1, G.ky, tip[0] / (G.kr * 0.62));
        drawKnob(ctx, S, G.kx2, G.ky, -tip[1] / (G.kr * 0.62));
      }
    });
  }
  // A moving sheen across the glass and a few motes of powder drifting in the light.
  const motes = (() => { const r = rng(5), a = []; for (let i = 0; i < 26; i++) a.push([r(), r(), r() * 6, 0.4 + r() * 0.8]); return a; })();
  function glass(ctx, S, t) {
    if (!S.paint) return;
    const G = geom(S), u = S.u, tex = S.look.texture;
    const k = ((t * 0.045) % 1.3) - 0.15, gx = G.sx + k * (G.sw + 400 * u) - 200 * u;
    const gr = ctx.createLinearGradient(gx, 0, gx + 260 * u, 0);
    gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.5, "rgba(255,255,255,0.11)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    ctx.save();
    ctx.transform(1, 0, -0.45, 1, 0, 0);
    ctx.fillStyle = gr; ctx.fillRect(gx + G.sh * 0.45 * 0.5, G.sy, 260 * u, G.sh);
    ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (const m of motes) {
      const x = G.sx + m[0] * G.sw + Math.sin(t * 0.5 * m[3] + m[2]) * 26 * u, y = G.sy + m[1] * G.sh + Math.cos(t * 0.37 * m[3] + m[2] * 2) * 18 * u;
      ctx.globalAlpha = 0.15 + 0.35 * tex * (0.5 + 0.5 * Math.sin(t * 1.3 + m[2]));
      ctx.fillRect(x, y, 2.2 * u, 2.2 * u);
    }
    ctx.globalAlpha = 1;
  }

  const scene = (id) => (ctx, S, box, p, d, info) => { renderScene(ctx, S, id, d, info); };

  // ---- tones ------------------------------------------------------------------------------------------------------------
  const TONE = {
    k: "teal", bezel: "#0e7c79", bezelHi: "#4dc3b5", bezelLo: "#07474d", plate: "#08565a", plateInk: "#e9f6ee", markInk: "#ffb347",
    knob: "#f3e7ca", knobHi: "#fff8e4", knobLo: "#c9b88f", knobMark: "#e5522d",
    powder: [186, 190, 196], groove: "#22252c", mid: "rgba(48,53,62,0.62)", lip: "rgba(255,255,255,0.62)", halo: "rgba(206,210,216,0.92)",
  };
  return {
    bg: "#0e7c79", panel: "rgba(255,255,255,0.18)", ink: "#1d2027", muted: "#4a515b", accent: "#e8481f", onAccent: "#ffffff",
    rule: "rgba(34,37,44,0.7)", track: "rgba(34,37,44,0.12)",
    display: SANS, displayWeight: 800, displayTracking: "0.005em", body: SANS, bodyWeight: 600,
    figures: SANS, radius: 10, motion: "stroke", change: "fade",
    kit: { line: 3, fill: "solid", panel: "outline" },
    panelEdge: "rgba(34,37,44,0.5)",
    tone: TONE,
    keepArt: true,
    palettes: {
      light: { bg: "#efe7d6", panel: "rgba(255,255,255,0.3)", ink: "#23262d", muted: "#565d68", accent: "#d93f17", rule: "rgba(34,37,44,0.7)", track: "rgba(34,37,44,0.12)", textShadow: () => "0 2px 0 rgba(255,255,255,0.6)", backdrop: () => "#efe7d6",
        tone: { ...TONE, k: "cream", bezel: "#efe7d6", bezelHi: "#ffffff", bezelLo: "#b6a88a", plate: "#d9cdb3", plateInk: "#3a3a36", markInk: "#d93f17", knob: "#e45a3b", knobHi: "#ff8a66", knobLo: "#9a2f19", knobMark: "#fff4d8", powder: [196, 199, 204] } },
      dark: { bg: "#23262d", panel: "rgba(255,255,255,0.1)", ink: "#111318", muted: "#3a4048", accent: "#ff7a3c", rule: "rgba(20,22,28,0.7)", track: "rgba(20,22,28,0.14)", textShadow: () => "0 2px 0 rgba(255,255,255,0.4)", backdrop: () => "#23262d",
        tone: { ...TONE, k: "night", bezel: "#2a2d36", bezelHi: "#6b7280", bezelLo: "#0f1116", plate: "#15171d", plateInk: "#d7dae2", markInk: "#ff7a3c", knob: "#f4a62b", knobHi: "#ffd37a", knobLo: "#a8691a", knobMark: "#23262d", powder: [150, 156, 166], groove: "#14161b", mid: "rgba(28,31,38,0.62)", halo: "rgba(160,166,176,0.92)", lip: "rgba(255,255,255,0.5)" } },
      mono: { bg: "#c9c9c4", panel: "rgba(255,255,255,0.3)", ink: "#25262a", muted: "#555660", accent: "#25262a", rule: "rgba(37,38,42,0.7)", track: "rgba(37,38,42,0.12)", textShadow: () => "0 2px 0 rgba(255,255,255,0.6)", backdrop: () => "#c9c9c4",
        tone: { ...TONE, k: "mono", bezel: "#c9c9c4", bezelHi: "#f1f1ee", bezelLo: "#7d7d78", plate: "#a9a9a4", plateInk: "#2d2d30", markInk: "#2d2d30", knob: "#3a3b40", knobHi: "#6a6b72", knobLo: "#1a1b1e", knobMark: "#f1f1ee", powder: [190, 191, 194], mid: "rgba(48,50,56,0.6)" } },
    },
    textShadow: () => "0 2px 0 rgba(255,255,255,0.55), 0 0 14px rgba(255,255,255,0.25)",
    backdrop: () => "#0e7c79",
    // Type is written by the stylus on the screen; the template's own type stays in place, hidden, for layout.
    css: () => "#root .display,#root .kicker{visibility:hidden!important}",
    paint: (ctx, W, H) => { ctx.clearRect(0, 0, W, H); },
    stage(ctx, S, info) {
      const next = info.next, c = info.change || 0.45;
      const ex = next && info.scene && info.local > info.hold - c ? span(info.local, info.hold - c, info.hold) * ERASE_END : 0;
      const settle = info.index > 0 && info.local < c ? 1 - info.local / c : 0;
      CUR = { t: info.t, ex, shake: ex > 0 ? 0.35 + 0.65 * (ex / ERASE_END) : settle * settle * 0.8 };
      if (S.paint) { ctx.fillStyle = S.look.tone.bezel; ctx.fillRect(0, 0, S.W, S.H); }
      withShake(ctx, S, () => { if (S.paint) ctx.drawImage(getBody(S), 0, 0); });
      // Past the last frame there is no scene: hold the closing board if the reel has one.
      if (!info.scene && info.t >= info.length - 0.01) {
        const el = document.getElementById("closing-scene");
        if (el && getComputedStyle(el).opacity !== "0") renderScene(ctx, S, "closing", {}, { t: info.t, local: info.hold || 2.4, hold: info.hold || 2.4, change: c });
      }
    },
    overlap: true,
    scenes: { title: scene("title"), closing: scene("closing"), chart: scene("chart"), object: scene("object"), people: scene("people"), process: scene("process"), compare: scene("compare") },
  };
});
