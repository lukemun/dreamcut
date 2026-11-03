// Patent: one engraved patent sheet. Ruling-pen line art on yellowed, foxed paper: shade lines, stipple,
// reference numerals on curved leaders, a double-ruled border, a header strip and a FIG. caption. Every
// scene is an original mechanical drawing that keeps working through its hold: spoked wheels turn,
// liquid sloshes, a governor's balls swing, a balance settles and sways, a lens scans a ledger.
// Scenes change with a draftsman's erasing shield sweeping across the plate. Frames are pure functions of time.
window.DreamcutMotion.register("patent", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const inout = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const fract = (v) => v - Math.floor(v);
  const SERIF = "'Bodoni 72', 'Didot', 'Baskerville', 'Georgia', 'Times New Roman', serif";
  const BODY = "'Baskerville', 'Hoefler Text', 'Georgia', 'Times New Roman', serif";
  const M = window.DreamcutMotion;
  const ctl = () => (window.__dreamcut && window.__dreamcut.controls) || {};

  // ---- paths that can be drawn part-way -------------------------------------------------------------
  class Pth {
    constructor() { this.s = []; this.c = null; this.n = -1; this.px = 0; this.py = 0; }
    M(x, y) { this.c = [x, y]; this.s.push(this.c); this.px = x; this.py = y; return this; }
    L(x, y) { if (!this.c) return this.M(x, y); this.c.push(x, y); this.px = x; this.py = y; return this; }
    Z() { if (this.c && this.c.length > 2) { this.c.push(this.c[0], this.c[1]); this.px = this.c[0]; this.py = this.c[1]; } return this; }
    C(x1, y1, x2, y2, x3, y3) {
      const x0 = this.px, y0 = this.py;
      const n = Math.max(8, Math.min(40, Math.ceil((Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2)) / 9)));
      for (let i = 1; i <= n; i++) {
        const t = i / n, m = 1 - t;
        this.L(m * m * m * x0 + 3 * m * m * t * x1 + 3 * m * t * t * x2 + t * t * t * x3, m * m * m * y0 + 3 * m * m * t * y1 + 3 * m * t * t * y2 + t * t * t * y3);
      }
      return this;
    }
    Q(x1, y1, x2, y2) { const x0 = this.px, y0 = this.py; return this.C(x0 + (x1 - x0) * 2 / 3, y0 + (y1 - y0) * 2 / 3, x2 + (x1 - x2) * 2 / 3, y2 + (y1 - y2) * 2 / 3, x2, y2); }
    E(cx, cy, rx, ry, a0, a1, move) {
      const steps = Math.max(8, Math.ceil((Math.abs(a1 - a0) * Math.max(rx, ry)) / 5));
      for (let i = 0; i <= steps; i++) {
        const a = a0 + ((a1 - a0) * i) / steps, x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
        if (i === 0 && (move || !this.c)) this.M(x, y); else this.L(x, y);
      }
      return this;
    }
    A(cx, cy, r, a0, a1, move) { return this.E(cx, cy, r, r, a0, a1, move); }
    O(cx, cy, r) { return this.E(cx, cy, r, r, 0, TAU, true); }
    R(x, y, w, h) { return this.M(x, y).L(x + w, y).L(x + w, y + h).L(x, y + h).Z(); }
    poly(pts, close) { pts.forEach(([x, y], i) => (i ? this.L(x, y) : this.M(x, y))); return close ? this.Z() : this; }
    trace(g) { for (const s of this.s) { g.moveTo(s[0], s[1]); for (let i = 2; i < s.length; i += 2) g.lineTo(s[i], s[i + 1]); } }
    len() {
      if (this.n >= 0) return this.n;
      let n = 0;
      for (const s of this.s) for (let i = 2; i < s.length; i += 2) n += Math.hypot(s[i] - s[i - 2], s[i + 1] - s[i - 1]);
      return (this.n = n);
    }
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
    fill(g, color, a = 1) { if (a <= 0) return; g.save(); g.globalAlpha *= Math.min(1, a); g.beginPath(); this.trace(g); g.fillStyle = color; g.fill(); g.restore(); }
  }
  const pen = (g, col, w, dash) => { g.strokeStyle = col; g.lineWidth = w; g.setLineDash(dash || []); g.lineCap = "round"; g.lineJoin = "round"; };

  // ---- per-frame helper bundle -----------------------------------------------------------------------
  function mk(g, S, info) {
    const look = S.look, T = look.tone;
    return {
      g, S, u: S.u, W: S.W, H: S.H, tall: S.tall, info, t: info.t, T,
      ink: (a = 1) => hexA(look.ink, a), acc: (a = 1) => hexA(S.accent, a), mut: (a = 1) => hexA(look.muted, a),
      sheet: T.paper, hasPaper: !!S.paint, tex: look.texture,
    };
  }

  // Lettering: serif capitals and italics; letters appear from the left as q runs.
  function say(F, s, x, y, size, o = {}) {
    const g = F.g;
    s = String(s ?? "");
    const q = o.q ?? 1;
    if (!s || q <= 0) return 0;
    const fam = o.font === "disp" ? SERIF : BODY;
    const sty = o.font === "ital" ? "italic " : "";
    const wt = o.weight || (o.font === "disp" ? 700 : 500);
    g.font = `${sty}${wt} ${size}px ${fam}`;
    let w = g.measureText(s).width;
    if (o.maxW && w > o.maxW) {
      size = Math.max(o.min || size * 0.7, (size * o.maxW) / w);
      g.font = `${sty}${wt} ${size}px ${fam}`;
      w = g.measureText(s).width;
    }
    const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    g.textAlign = "left";
    g.textBaseline = o.base || "alphabetic";
    g.fillStyle = o.color || F.ink();
    g.fillText(q >= 1 ? s : s.slice(0, Math.max(1, Math.ceil(s.length * q))), x0, y);
    return w;
  }
  const tally = (target, k, d) => { const dec = Math.abs((Number(target) || 0) % 1) > 0.001 ? 1 : 0; return M.formatNumber(target * k, dec, (d && d.prefix) || "", (d && d.suffix) || ""); };

  // Shade lines: parallel strokes inside a closed path, spacing optionally tightening toward one side.
  function shade(g, F, clip, x, y, w, h, step, ang, q, lw, color, tight) {
    if (q <= 0 || w <= 0 || h <= 0) return;
    g.save();
    g.beginPath(); clip.trace(g); g.clip();
    if (q < 1) { g.beginPath(); g.rect(x - 2, y - 2, (w + 4) * q, h + 4); g.clip(); }
    pen(g, color, lw);
    const dx = Math.cos(ang), dy = Math.sin(ang), L = Math.hypot(w, h), cx = x + w / 2, cy = y + h / 2;
    g.beginPath();
    let k = -L / 2;
    while (k <= L / 2) {
      const px = cx - dy * k, py = cy + dx * k;
      g.moveTo(px - dx * L, py - dy * L); g.lineTo(px + dx * L, py + dy * L);
      k += tight ? lerp(step * tight, step, (k + L / 2) / L) : step;
    }
    g.stroke(); g.restore();
  }
  // Stipple: seeded dots inside a clip, denser where `dens` is high.
  const dotBank = {};
  function dots(n, seed) {
    const key = n + ":" + seed;
    if (!dotBank[key]) { const r = rng(seed); const a = new Float32Array(n * 3); for (let i = 0; i < a.length; i++) a[i] = r(); dotBank[key] = a; }
    return dotBank[key];
  }
  function stipple(g, F, clip, x, y, w, h, n, seed, dens, size, color) {
    const a = dots(n, seed);
    g.save();
    if (clip) { g.beginPath(); clip.trace(g); g.clip(); }
    g.fillStyle = color;
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const uu = a[i * 3], vv = a[i * 3 + 1];
      if (a[i * 3 + 2] > dens(uu, vv)) continue;
      g.rect(x + uu * w, y + vv * h, size, size);
    }
    g.fill(); g.restore();
  }
  // A reference numeral with a curved leader that ends in an arrowhead on the part.
  function numeral(F, txt, x, y, tx, ty, q, o = {}) {
    if (q <= 0) return;
    const { g, u } = F;
    const bow = (o.bow ?? 0.25), dx = tx - x, dy = ty - y, L = Math.hypot(dx, dy) || 1;
    const mx = x + dx * 0.5 - (dy / L) * L * bow, my = y + dy * 0.5 + (dx / L) * L * bow;
    const col = o.color || F.ink(0.9);
    pen(g, col, 1.7 * u);
    const sx = x + (dx / L) * 22 * u, sy = y + (dy / L) * 22 * u;
    new Pth().M(sx, sy).Q(mx, my, tx, ty).draw(g, span(q, 0, 0.65));
    if (q > 0.6) {
      const a = Math.atan2(ty - my, tx - mx);
      g.save(); g.translate(tx, ty); g.rotate(a);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(-13 * u, -4.5 * u); g.lineTo(-13 * u, 4.5 * u); g.closePath(); g.fillStyle = col; g.fill(); g.restore();
    }
    say(F, txt, x, y, (o.size || 34) * u, { font: "ital", weight: 500, align: "center", base: "middle", color: col, q: span(q, 0.4, 1) });
  }
  function wheelShade(g, F, cx, cy, r, from = 0.15, to = 0.85) {
    const { u } = F;
    pen(g, F.ink(0.7), 1.1 * u);
    for (let k = 0; k < 5; k++) new Pth().A(cx, cy, r * (0.93 - k * 0.06), Math.PI * from, Math.PI * (to - k * 0.07), true).draw(g, 1);
  }
  // A toothed wheel; rotation turns teeth, web and spokes while shading stays put.
  function cog(F, cx, cy, r, teeth, ang, q, o = {}) {
    if (q <= 0) return;
    const { g, u } = F;
    const w = (o.w || 2.6) * u, ri = r * 0.86;
    g.save(); g.translate(cx, cy); g.rotate(ang);
    pen(g, F.ink(), w);
    const P = new Pth();
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * TAU, da = TAU / teeth;
      [[0.04, ri], [0.2, r], [0.52, r], [0.68, ri]].forEach(([k, rr], j) => { const x = Math.cos(a + k * da) * rr, y = Math.sin(a + k * da) * rr; if (!i && !j) P.M(x, y); else P.L(x, y); });
    }
    P.Z().draw(g, q);
    if (q > 0.35) {
      pen(g, F.ink(), w * 0.75);
      new Pth().O(0, 0, r * 0.68).draw(g, 1);
      new Pth().O(0, 0, r * 0.2).draw(g, 1);
      const spokes = o.spokes || 5, sp = new Pth();
      for (let k = 0; k < spokes; k++) {
        const a = (k / spokes) * TAU, hw = 0.07;
        sp.M(Math.cos(a - hw) * r * 0.2, Math.sin(a - hw) * r * 0.2).L(Math.cos(a - hw * 0.7) * r * 0.68, Math.sin(a - hw * 0.7) * r * 0.68)
          .M(Math.cos(a + hw) * r * 0.2, Math.sin(a + hw) * r * 0.2).L(Math.cos(a + hw * 0.7) * r * 0.68, Math.sin(a + hw * 0.7) * r * 0.68);
      }
      sp.draw(g, 1);
      pen(g, F.ink(0.6), 1 * u);
      const rr = new Pth();
      for (let k = 0; k < teeth; k++) { const a = ((k + 0.4) / teeth) * TAU; rr.M(Math.cos(a) * r * 0.69, Math.sin(a) * r * 0.69).L(Math.cos(a) * ri * 0.98, Math.sin(a) * ri * 0.98); }
      rr.draw(g, 1);
      new Pth().R(-r * 0.04, -r * 0.2 - 1, r * 0.08, r * 0.1).draw(g, 1);
    }
    g.restore();
    if (q > 0.5) wheelShade(g, F, cx, cy, r * 0.8, 0.15, 0.8);
  }
  // A spoked pulley with a rim and flat belt face.
  function pulley(F, cx, cy, r, ang, q, spokes = 6) {
    if (q <= 0) return;
    const { g, u } = F;
    g.save(); g.translate(cx, cy);
    g.save(); g.globalAlpha = clamp(q * 1.6 - 0.3); g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fillStyle = F.sheet; g.fill(); g.restore();
    g.rotate(ang);
    pen(g, F.ink(), 2.8 * u);
    new Pth().O(0, 0, r).draw(g, q);
    if (q > 0.3) {
      pen(g, F.ink(), 1.8 * u);
      new Pth().O(0, 0, r * 0.86).draw(g, 1);
      pen(g, F.ink(), 2.2 * u);
      new Pth().O(0, 0, r * 0.2).draw(g, 1);
      const sp = new Pth();
      for (let k = 0; k < spokes; k++) { const a = (k / spokes) * TAU; sp.M(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2).L(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86); }
      sp.draw(g, 1);
      pen(g, F.ink(0.7), 1.1 * u);
      new Pth().O(0, 0, r * 0.08).draw(g, 1);
    }
    g.restore();
    if (q > 0.5) wheelShade(g, F, cx, cy, r * 0.97, 0.1, 0.9);
  }
  // Hatched ground with a ruled top edge.
  function ground(F, x1, x2, y, q) {
    const { g, u } = F;
    pen(g, F.ink(), 2.6 * u);
    new Pth().M(x1, y).L(x2, y).draw(g, q);
    pen(g, F.ink(0.65), 1.1 * u);
    const P = new Pth();
    for (let x = x1 + 8 * u; x < x2; x += 17 * u) P.M(x, y + 3 * u).L(x - 12 * u, y + 15 * u);
    P.draw(g, span(q, 0.2, 1));
  }

  // ---- the sheet -------------------------------------------------------------------------------------
  let paperCan = null, paperKey = "";
  function paperBase(S) {
    const { W, H, u } = S, T = S.look.tone, tex = S.look.texture;
    const key = `${W}x${H}:${T.paper}:${T.stain}:${tex}`;
    if (paperCan && paperKey === key) return paperCan;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d");
    g.fillStyle = T.paper; g.fillRect(0, 0, W, H);
    const r = rng(7313);
    for (let i = 0; i < 46; i++) {
      const x = r() * W, y = r() * H, rad = (120 + r() * 320) * u, dark = r() < 0.55, rgb = dark ? T.stain : T.lite;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(${rgb},${(0.05 + r() * 0.08) * (0.3 + 0.7 * tex)})`); gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    const edge = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.58);
    edge.addColorStop(0, `rgba(${T.stain},0)`); edge.addColorStop(1, `rgba(${T.stain},${0.34 * tex})`);
    g.fillStyle = edge; g.fillRect(0, 0, W, H);
    if (tex > 0) {
      const tile = document.createElement("canvas"); tile.width = tile.height = 512;
      const tg = tile.getContext("2d"), tr = rng(991);
      tg.lineCap = "round";
      for (let i = 0; i < 1000; i++) {
        const x = tr() * 512, y = tr() * 512, len = 5 + tr() * 20, a = tr() * TAU;
        tg.strokeStyle = `rgba(${T.fiber},${0.04 + tr() * 0.09})`; tg.lineWidth = 0.6 + tr() * 0.9;
        tg.beginPath(); tg.moveTo(x, y); tg.quadraticCurveTo(x + Math.cos(a + 0.8) * len * 0.6, y + Math.sin(a + 0.8) * len * 0.6, x + Math.cos(a) * len, y + Math.sin(a) * len); tg.stroke();
      }
      for (let i = 0; i < 260; i++) { tg.fillStyle = `rgba(${T.stain},${0.08 + tr() * 0.25})`; tg.beginPath(); tg.arc(tr() * 512, tr() * 512, 0.5 + tr() * 1.3, 0, TAU); tg.fill(); }
      g.globalAlpha = tex; g.fillStyle = g.createPattern(tile, "repeat"); g.fillRect(0, 0, W, H); g.globalAlpha = 1;
      // Foxing: small brown blooms with a darker core.
      for (let i = 0; i < 26; i++) {
        const x = r() * W, y = r() * H, rad = (6 + r() * 30) * u, gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, `rgba(${T.fox},${(0.1 + r() * 0.18) * tex})`); gr.addColorStop(0.5, `rgba(${T.fox},${0.05 * tex})`); gr.addColorStop(1, `rgba(${T.fox},0)`);
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
      }
      // Fold creases: a pale line beside a dark one.
      for (const [horiz, at] of [[true, 0.5], [false, 0.5], [false, 0.25]]) {
        const pos = (horiz ? H : W) * at;
        g.lineWidth = 1.6 * u;
        g.strokeStyle = `rgba(${T.stain},${0.2 * tex})`; g.beginPath();
        if (horiz) { g.moveTo(0, pos); g.lineTo(W, pos + 3 * u); } else { g.moveTo(pos, 0); g.lineTo(pos + 3 * u, H); }
        g.stroke();
        g.strokeStyle = `rgba(${T.lite},${0.28 * tex})`; g.beginPath();
        if (horiz) { g.moveTo(0, pos + 2.5 * u); g.lineTo(W, pos + 5.5 * u); } else { g.moveTo(pos + 2.5 * u, 0); g.lineTo(pos + 5.5 * u, H); }
        g.stroke();
      }
    }
    paperCan = c; paperKey = key;
    return c;
  }
  let grainCan = null;
  function grainTile() {
    if (grainCan) return grainCan;
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d"), r = rng(5531);
    for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(30,20,8,${0.05 + r() * 0.14})`; g.fillRect(r() * 256, r() * 256, 1 + (r() < 0.2 ? 1 : 0), 1); }
    return (grainCan = c);
  }

  // Heading line boxes, read once from the layout.
  const lineCache = {};
  function headLines(id) {
    if (lineCache[id] && lineCache[id].length) return lineCache[id];
    const el = document.getElementById(id), root = document.getElementById("root");
    if (!el || !root || !el.firstChild) return [];
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
  const HEAD = { chart: "chart-title", object: "object-title", people: "people-title", process: "process-title", compare: "compare-title" };
  const SCALE = { chart: "SCALE 1 : 4", object: "SCALE 2 : 5", people: "SCALE 1 : 12", process: "SCALE 1 : 6", compare: "SCALE 1 : 3" };

  // ---- scene changes: an erasing shield sweeps across the plate ---------------------------------------
  // `e` runs 0 to 1. The outgoing drawing survives beyond the shield; the incoming one appears behind it.
  function sweepPos(F, box, e) {
    const lo = F.tall ? box.y : box.x, len = F.tall ? box.h : box.w;
    return lo - 70 * F.u + (len + 140 * F.u) * inout(e);
  }
  function clipSide(F, box, e, keepBeyond) {
    const { g } = F, pos = sweepPos(F, box, e), big = 9999;
    g.beginPath();
    if (F.tall) { if (keepBeyond) g.rect(-big, pos, big * 2, big); else g.rect(-big, -big, big * 2, big + pos); }
    else if (keepBeyond) g.rect(pos, -big, big, big * 2); else g.rect(-big, -big, big + pos, big * 2);
    g.clip();
  }
  function shield(F, box, e) {
    if (e <= 0 || e >= 1) return;
    const { g, u } = F, pos = sweepPos(F, box, e);
    const len = F.tall ? box.w : box.h;
    g.save();
    if (F.tall) { g.translate(box.x - 30 * u, pos); } else { g.translate(pos, box.y - 30 * u); }
    const along = len + 60 * u, thick = 54 * u;
    const rect = (x, y, w, h) => (F.tall ? [y, x, h, w] : [x, y, w, h]);
    const R = (x, y, w, h) => { const [a, b, c, d] = rect(x, y, w, h); g.rect(a, b, c, d); };
    g.shadowColor = "rgba(40,28,10,0.35)"; g.shadowBlur = 18 * u; g.shadowOffsetX = (F.tall ? 0 : 8 * u); g.shadowOffsetY = (F.tall ? 8 * u : 0);
    g.beginPath(); R(-thick / 2, 0, thick, along); g.fillStyle = F.T.metal; g.fill();
    g.shadowColor = "transparent";
    pen(g, F.ink(0.9), 2.4 * u);
    g.beginPath(); R(-thick / 2, 0, thick, along); g.stroke();
    // Slots, rivets and a bright edge.
    pen(g, F.ink(0.75), 1.8 * u);
    const slots = Math.max(3, Math.round(along / (110 * u)));
    for (let i = 0; i < slots; i++) {
      const sy = (i + 0.5) * (along / slots), sl = 56 * u;
      g.beginPath(); const [a, b, c, d] = rect(-thick * 0.16, sy - sl / 2, thick * 0.32, sl);
      g.roundRect ? g.roundRect(a, b, c, d, 8 * u) : g.rect(a, b, c, d); g.fillStyle = F.ink(0.25); g.fill(); g.stroke();
    }
    g.fillStyle = F.ink(0.7);
    for (const sy of [10 * u, along - 10 * u]) { g.beginPath(); const [a, b] = rect(0, sy, 0, 0); g.arc(F.tall ? sy : 0, F.tall ? 0 : sy, 3.2 * u, 0, TAU); g.fill(); }
    pen(g, "rgba(255,255,255,0.65)", 2 * u);
    g.beginPath(); const [ea, eb, ec, ed] = rect(-thick / 2 + 4 * u, 6 * u, 0, along - 12 * u); g.moveTo(ea, eb); g.lineTo(ea + ec, eb + ed); g.stroke();
    // Rubbings: pale crumbs trailing behind the plate.
    const r = rng(404);
    g.fillStyle = F.ink(0.5);
    for (let i = 0; i < 38; i++) {
      const back = (14 + r() * 120) * u, off = r() * along, s = (1.2 + r() * 2.4) * u;
      g.globalAlpha = (1 - back / (140 * u)) * 0.85;
      g.fillRect(F.tall ? off : -thick / 2 - back, F.tall ? -thick / 2 - back : off, s, s);
    }
    g.restore();
  }

  // ---- stage decoration ------------------------------------------------------------------------------
  function chrome(F) {
    const { g, u, W, H, t } = F, info = F.info;
    // Double-ruled border: heavy outer rule, fine inner rule, corner scrolls and registration crosses.
    const q = span(t + 1.3, 0, 1.6);
    const a = 24 * u, b = 37 * u;
    pen(g, F.ink(0.95), 3.4 * u);
    new Pth().R(a, a, W - a * 2, H - a * 2).draw(g, q);
    pen(g, F.ink(0.8), 1.2 * u);
    new Pth().R(b, b, W - b * 2, H - b * 2).draw(g, q);
    pen(g, F.ink(0.7), 1.3 * u);
    for (const [cx, cy, sx, sy] of [[b, b, 1, 1], [W - b, b, -1, 1], [b, H - b, 1, -1], [W - b, H - b, -1, -1]]) {
      new Pth().O(cx + sx * 7 * u, cy + sy * 7 * u, 2.4 * u).draw(g, q);
    }
    pen(g, F.ink(0.6), 1.2 * u);
    for (const x of [W / 2]) new Pth().M(x, a - 9 * u).L(x, b + 8 * u).M(x - 9 * u, (a + b) / 2).L(x + 9 * u, (a + b) / 2).draw(g, q);
    new Pth().M(W / 2, H - a + 9 * u).L(W / 2, H - b - 8 * u).M(W / 2 - 9 * u, H - (a + b) / 2).L(W / 2 + 9 * u, H - (a + b) / 2).draw(g, q);
    // Header strip: date, specification mark with two small turning cogs, sheet number.
    const hq = span(t + 1.3, 0.1, 1.5), hy = 78 * u, hs = 27 * u;
    say(F, "Patented Feb. 11, 1930", 62 * u, hy, hs, { font: "ital", color: F.ink(0.82), q: hq });
    say(F, `SHEET ${(info.index ?? 0) + 1}`, W - 62 * u, hy, hs, { font: "disp", weight: 600, align: "right", color: F.ink(0.82), q: hq });
    say(F, "SPECIFICATION", W / 2, hy, hs * 0.86, { font: "disp", weight: 600, align: "center", color: F.ink(0.7), q: hq });
    const spin = t * 1.1;
    cog(F, W / 2 - 150 * u, hy - 8 * u, 15 * u, 10, spin, hq, { w: 1.5 });
    cog(F, W / 2 + 150 * u, hy - 8 * u, 15 * u, 10, -spin * 1.0 + 0.3, hq, { w: 1.5 });
    // Foot rule: a graduated scale with an index mark that travels the length of the piece.
    const ry = H - 62 * u, rx0 = 66 * u, rx1 = W - 66 * u;
    pen(g, F.ink(0.75), 1.4 * u);
    new Pth().M(rx0, ry).L(rx1, ry).draw(g, hq);
    const tk = new Pth();
    const steps = Math.floor((rx1 - rx0) / (12 * u));
    for (let i = 0; i <= steps; i++) { const x = rx0 + i * 12 * u; tk.M(x, ry).L(x, ry - (i % 10 === 0 ? 16 : i % 5 === 0 ? 11 : 6) * u); }
    tk.draw(g, hq);
    const prog = clamp(t / Math.max(1, info.length || 10));
    const mx = lerp(rx0, rx1, prog);
    g.beginPath(); g.moveTo(mx, ry + 2 * u); g.lineTo(mx - 8 * u, ry + 15 * u); g.lineTo(mx + 8 * u, ry + 15 * u); g.closePath(); g.fillStyle = F.acc(); g.fill();
    // FIG. caption.
    if (info.scene) {
      const fig = (info.index ?? 0) + 1, fq = span(info.local, 0.1, 1.0);
      say(F, `FIG. ${fig}.`, W - 70 * u, H - 104 * u, 36 * u, { font: "disp", weight: 700, align: "right", color: F.ink(0.92), q: fq });
    }
  }
  // Flecks of paper dust drifting through the whole sheet.
  function flecks(F) {
    if (F.tex <= 0) return;
    const { g, u, W, H, t } = F, r = rng(2718);
    g.fillStyle = F.ink(0.34 * F.tex);
    g.beginPath();
    for (let i = 0; i < Math.round(34 * F.tex); i++) {
      const x0 = r(), y0 = r(), vx = (r() - 0.3) * 0.012, vy = 0.004 + r() * 0.01, s = (1 + r() * 2.2) * u;
      const x = fract(x0 + t * vx) * W, y = fract(y0 + t * vy) * H;
      g.rect(x, y, s, s);
    }
    g.fill();
  }
  // Pencil construction lines, crop marks and the heading rule that give each station its place on the sheet.
  function scaffold(F, box, id, fade) {
    const { g, u, info } = F, local = info.local;
    const q = span(local + 0.3, 0, 1.0);
    g.save(); g.globalAlpha = fade;
    pen(g, F.ink(0.38), 1.1 * u, [26 * u, 6 * u, 4 * u, 6 * u]);
    new Pth().M(box.x - 50 * u, box.y + box.h * 0.5).L(box.x + box.w + 50 * u, box.y + box.h * 0.5).draw(g, q);
    new Pth().M(box.x + box.w * 0.5, box.y - 26 * u).L(box.x + box.w * 0.5, box.y + box.h + 10 * u).draw(g, q);
    pen(g, F.ink(0.6), 1.5 * u);
    for (const [x, y, sx, sy] of [[box.x, box.y, 1, 1], [box.x + box.w, box.y, -1, 1], [box.x, box.y + box.h, 1, -1], [box.x + box.w, box.y + box.h, -1, -1]])
      new Pth().M(x - sx * 14 * u, y).L(x + sx * 30 * u, y).M(x, y - sy * 14 * u).L(x, y + sy * 30 * u).draw(g, q);
    say(F, SCALE[id] || "", box.x + box.w, box.y - 14 * u, 25 * u, { font: "ital", align: "right", color: F.ink(0.7), q: span(local, 0.2, 1) });
    // Heading rule: a heavy line over a hairline under the last line of the headline.
    const lines = headLines(HEAD[id]);
    if (lines.length) {
      const L = lines[lines.length - 1], y = L.y + L.h + 2 * u, x0 = lines[0].x, x1 = F.W - x0, rq = span(local, 0.18, 1.0);
      pen(g, F.ink(0.95), 2.6 * u); new Pth().M(x0, y).L(x1, y).draw(g, rq);
      pen(g, F.ink(0.7), 1 * u); new Pth().M(x0, y + 8 * u).L(x1, y + 8 * u).draw(g, rq);
    }
    g.restore();
  }

  // ---- title and closing decoration -------------------------------------------------------------------
  // A line shaft under a ceiling beam: spoked pulleys of different sizes joined by stitched belts.
  function shaftBand(F, x, y, w, h, q, speed, off) {
    if (q <= 0 || h < 80 * F.u) return;
    const { g, u, t } = F;
    const n = clamp(Math.round(w / (h * 1.2)), 3, 6), ys = y + h * 0.46;
    const radii = [0.31, 0.2, 0.27, 0.17, 0.29, 0.22].map((k) => k * h);
    const xs = [], rs = [];
    for (let i = 0; i < n; i++) { const k = (i + off) % radii.length; rs.push(radii[k]); xs.push(x + w * (0.12 + (0.76 * i) / (n - 1))); }
    // Ceiling beam, hatched.
    const beam = new Pth().R(x, y, w, h * 0.07);
    pen(g, F.ink(), 2.6 * u); beam.draw(g, q);
    shade(g, F, beam, x, y, w, h * 0.07, 9 * u, 0.9, span(q, 0.2, 1), 1.1 * u, F.ink(0.7));
    // Shaft and hangers.
    pen(g, F.ink(), 2.4 * u);
    new Pth().M(x + w * 0.03, ys - 6 * u).L(x + w * 0.97, ys - 6 * u).M(x + w * 0.03, ys + 6 * u).L(x + w * 0.97, ys + 6 * u).draw(g, span(q, 0, 0.7));
    xs.forEach((cx, i) => {
      const hx = cx + (i % 2 ? 1 : -1) * rs[i] * 1.3;
      pen(g, F.ink(), 2.2 * u);
      new Pth().M(hx - 7 * u, y + h * 0.07).L(hx - 7 * u, ys - 14 * u).M(hx + 7 * u, y + h * 0.07).L(hx + 7 * u, ys - 14 * u).draw(g, span(q, 0.1, 0.8));
      new Pth().R(hx - 17 * u, ys - 24 * u, 34 * u, 20 * u).draw(g, span(q, 0.3, 1));
    });
    // Belts between neighbouring pulleys: outer tangents with moving stitches.
    for (let i = 0; i < n - 1; i++) {
      const x1 = xs[i], x2 = xs[i + 1], r1 = rs[i], r2 = rs[i + 1], d = x2 - x1, s = (r1 - r2) / d, c = Math.sqrt(1 - s * s);
      const bq = span(q, 0.35, 1);
      for (const sg of [-1, 1]) {
        const ax = x1 + r1 * s, ay = ys + sg * r1 * c, bx = x2 + r2 * s, by = ys + sg * r2 * c;
        pen(g, F.ink(0.95), 3 * u);
        new Pth().M(ax, ay).L(bx, by).draw(g, bq);
        if (bq > 0.9) {
          pen(g, F.ink(0.85), 7 * u, [3 * u, 14 * u]);
          g.lineDashOffset = -t * 70 * u * speed * (sg > 0 ? -1 : 1);
          new Pth().M(ax, ay).L(bx, by).draw(g, 1);
          g.lineDashOffset = 0; g.setLineDash([]);
        }
      }
    }
    xs.forEach((cx, i) => {
      pulley(F, cx, ys, rs[i], (t * speed * 0.9 * (0.3 * h)) / rs[i], span(q, 0.05 + i * 0.07, 0.65 + i * 0.07), 6 - (i % 2));
      numeral(F, String(10 + i * 2), cx + (i % 2 ? -1 : 1) * (rs[i] * 0.75 + 40 * u), y + h * 0.93, cx + (i % 2 ? -1 : 1) * rs[i] * 0.55, ys + rs[i] * 0.84, span(q, 0.6, 1), { bow: i % 2 ? -0.3 : 0.3 });
    });
  }
  // A drifting plume of stipple puffs.
  function smoke(F, x, y, h, q, seed) {
    if (q <= 0) return;
    const { g, u, t } = F, r = rng(seed);
    g.fillStyle = F.ink(0.85);
    g.beginPath();
    for (let k = 0; k < 46; k++) {
      const ph = r(), sp = 0.16 + r() * 0.1, drift = (r() - 0.2) * 70 * u, wob = r() * TAU;
      const tau = fract(t * sp + ph);
      const cx = x + drift * tau + Math.sin(tau * 5 + wob) * 14 * u * tau, cy = y - tau * h, rad = (6 + tau * 34) * u;
      const alive = (1 - tau) * q;
      for (let j = 0; j < 7; j++) {
        const a = r() * TAU, rr = Math.sqrt(r()) * rad;
        if (r() > alive) continue;
        g.rect(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8, 2.4 * u, 2.4 * u);
      }
    }
    g.fill();
  }
  function governor(F, cx, base, h, q) {
    if (q <= 0) return;
    const { g, u, t } = F, top = base - h, L = h * 0.5, al = 0.66 + 0.17 * Math.sin(t * 2.3);
    // Pedestal and spindle.
    pen(g, F.ink(), 2.8 * u);
    const ped = new Pth().poly([[cx - h * 0.16, base], [cx - h * 0.07, base - h * 0.12], [cx + h * 0.07, base - h * 0.12], [cx + h * 0.16, base]], true);
    ped.draw(g, span(q, 0, 0.5));
    shade(g, F, ped, cx - h * 0.16, base - h * 0.12, h * 0.32, h * 0.12, 6 * u, 1.25, span(q, 0.2, 0.8), 1.1 * u, F.ink(0.8));
    pen(g, F.ink(), 2.6 * u);
    new Pth().M(cx - 5 * u, base - h * 0.12).L(cx - 5 * u, top).M(cx + 5 * u, base - h * 0.12).L(cx + 5 * u, top).draw(g, span(q, 0.1, 0.7));
    // Turning marks on the spindle.
    pen(g, F.ink(0.7), 1.2 * u);
    const mk2 = new Pth();
    for (let k = 0; k < 9; k++) { const yy = base - h * 0.13 - fract(k / 9 + t * 0.35) * (h * 0.86); mk2.M(cx - 5 * u, yy).L(cx + 5 * u, yy - 5 * u); }
    mk2.draw(g, span(q, 0.5, 1));
    // Pivot, arms, balls, links and sleeve.
    const bq = span(q, 0.3, 1);
    if (bq > 0) {
      const sx = Math.sin(al) * L, sy = Math.cos(al) * L, sleeveY = top + 2 * (L * 0.5) * Math.cos(al);
      pen(g, F.ink(), 3 * u);
      for (const sg of [-1, 1]) {
        const bx = cx + sg * sx, by = top + sy, mx = cx + sg * sx * 0.5, my = top + sy * 0.5;
        new Pth().M(cx, top).L(bx, by).draw(g, bq);
        pen(g, F.ink(0.95), 2.2 * u);
        new Pth().M(mx, my).L(cx, sleeveY).draw(g, bq);
        pen(g, F.ink(), 3 * u);
        const br = h * 0.1;
        g.beginPath(); g.arc(bx, by + br * 0.2, br, 0, TAU); g.fillStyle = F.sheet; g.fill();
        new Pth().O(bx, by + br * 0.2, br).draw(g, bq);
        const ball = new Pth().O(bx, by + br * 0.2, br);
        shade(g, F, ball, bx - br, by - br * 0.8, br * 2, br * 2, 5 * u, 0.7, bq, 1 * u, F.ink(0.8), 0.5);
        pen(g, F.ink(0.9), 1.3 * u);
        new Pth().A(bx, by + br * 0.2, br * 0.65, Math.PI * 1.05, Math.PI * 1.4, true).draw(g, 1);
        g.beginPath(); g.arc(mx, my, 4 * u, 0, TAU); g.fillStyle = F.ink(); g.fill();
      }
      g.beginPath(); g.rect(cx - 13 * u, sleeveY, 26 * u, 18 * u); g.fillStyle = F.sheet; g.fill();
      pen(g, F.ink(), 2.4 * u); g.strokeRect(cx - 13 * u, sleeveY, 26 * u, 18 * u);
      g.beginPath(); g.arc(cx, top, 7 * u, 0, TAU); g.fillStyle = F.ink(); g.fill();
    }
    cog(F, cx, base - h * 0.2, h * 0.11, 12, t * 1.9, span(q, 0.4, 1), { w: 2 });
  }
  function gauge(F, cx, cy, r, q) {
    if (q <= 0) return;
    const { g, u, t } = F;
    g.save(); g.globalAlpha = clamp(q * 1.6 - 0.3); g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fillStyle = F.sheet; g.fill(); g.restore();
    pen(g, F.ink(), 3.2 * u); new Pth().O(cx, cy, r).draw(g, q);
    pen(g, F.ink(), 1.6 * u); new Pth().O(cx, cy, r * 0.86).draw(g, span(q, 0.2, 1));
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    const ticks = new Pth();
    for (let k = 0; k <= 20; k++) { const a = lerp(a0, a1, k / 20), r1 = r * (k % 5 === 0 ? 0.62 : 0.72); ticks.M(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1).L(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8); }
    pen(g, F.ink(0.9), 1.5 * u); ticks.draw(g, span(q, 0.3, 1));
    pen(g, F.acc(), 5 * u); new Pth().A(cx, cy, r * 0.8, lerp(a0, a1, 0.78), a1, true).draw(g, span(q, 0.5, 1));
    const na = lerp(a0, a1, 0.5 + 0.28 * Math.sin(t * 1.7) + 0.06 * Math.sin(t * 7.3));
    pen(g, F.ink(), 2.6 * u);
    new Pth().M(cx - Math.cos(na) * r * 0.16, cy - Math.sin(na) * r * 0.16).L(cx + Math.cos(na) * r * 0.7, cy + Math.sin(na) * r * 0.7).draw(g, span(q, 0.6, 1));
    g.beginPath(); g.arc(cx, cy, 6 * u, 0, TAU); g.fillStyle = F.ink(); g.fill();
    pen(g, "rgba(255,255,255,0.7)", 2 * u); new Pth().A(cx, cy, r * 0.93, Math.PI * 1.15, Math.PI * 1.45, true).draw(g, 1);
  }
  function boiler(F, x, y, w, h, q) {
    if (q <= 0) return;
    const { g, u } = F, bh = h * 0.42, by = y + h - bh - 10 * u, cw = w * 0.14;
    // Drum with riveted bands, chimney, firebox door.
    const drum = new Pth().M(x + bh * 0.2, by).L(x + w - bh * 0.2, by).A(x + w - bh * 0.2, by + bh / 2, bh / 2, -Math.PI / 2, Math.PI / 2).L(x + bh * 0.2, by + bh).A(x + bh * 0.2, by + bh / 2, bh / 2, Math.PI / 2, Math.PI * 1.5);
    drum.fill(g, F.sheet, q * 1.6 - 0.3);
    pen(g, F.ink(), 3 * u); drum.draw(g, q);
    shade(g, F, drum, x, by, w, bh, 7 * u, Math.PI / 2, span(q, 0.2, 1), 1.1 * u, F.ink(0.75), 0.35);
    pen(g, F.ink(0.9), 1.6 * u);
    const bands = new Pth();
    for (const k of [0.25, 0.5, 0.75]) bands.M(x + w * k, by).L(x + w * k, by + bh);
    bands.draw(g, span(q, 0.3, 1));
    g.fillStyle = F.ink(0.9);
    g.beginPath();
    for (const k of [0.25, 0.5, 0.75]) for (let j = 0; j < 6; j++) g.rect(x + w * k - 7 * u, by + (j + 0.5) * (bh / 6) - 1.6 * u, 3.2 * u, 3.2 * u);
    g.fill();
    const cx0 = x + w * 0.62;
    const stack = new Pth().poly([[cx0 - cw * 0.5, by], [cx0 - cw * 0.38, y + h * 0.03], [cx0 + cw * 0.38, y + h * 0.03], [cx0 + cw * 0.5, by]], true);
    stack.fill(g, F.sheet, q * 1.6 - 0.3);
    pen(g, F.ink(), 3 * u); stack.draw(g, span(q, 0.2, 0.9));
    shade(g, F, stack, cx0 - cw * 0.5, y + h * 0.03, cw, by - y - h * 0.03, 9 * u, 0, span(q, 0.4, 1), 1.1 * u, F.ink(0.7));
    pen(g, F.ink(), 2.4 * u); new Pth().R(cx0 - cw * 0.52, y + h * 0.015, cw * 1.04, 12 * u).draw(g, span(q, 0.5, 1));
    new Pth().R(x + w * 0.12, by + bh * 0.38, w * 0.12, bh * 0.5).draw(g, span(q, 0.6, 1));
    ground(F, x, x + w, y + h - 2 * u, 1);
    return { sx: cx0, sy: y + h * 0.03 };
  }
  function governorBand(F, x, y, w, h, q) {
    if (q <= 0 || h < 100 * F.u) return;
    const { g, u } = F, gy = y + h * 0.9;
    ground(F, x, x + w, gy, span(q, 0, 0.6));
    governor(F, x + w * 0.2, gy, h * 0.82, q);
    const b = boiler(F, x + w * 0.42, y + h * 0.02, w * 0.33, h * 0.88, span(q, 0.1, 1));
    if (b) smoke(F, b.sx, b.sy, h * 0.8, span(q, 0.5, 1), 33);
    gauge(F, x + w * 0.89, y + h * 0.42, Math.min(w * 0.11, h * 0.26), span(q, 0.3, 1));
    pen(g, F.ink(), 2.4 * u);
    new Pth().M(x + w * 0.89, y + h * 0.42 + Math.min(w * 0.11, h * 0.26)).L(x + w * 0.89, gy).draw(g, span(q, 0.5, 1));
    numeral(F, "30", x + w * 0.06, y + h * 0.4, x + w * 0.17, y + h * 0.5, span(q, 0.7, 1), { bow: -0.3 });
    numeral(F, "32", x + w * 0.4, y + h * 0.1, x + w * 0.5, y + h * 0.5, span(q, 0.75, 1), { bow: 0.3 });
    numeral(F, "34", x + w * 0.77, y + h * 0.12, x + w * 0.85, y + h * 0.3, span(q, 0.8, 1), { bow: 0.3 });
  }
  // The approval seal: a ring of lettering turning around a cog, slammed down once with an ink bloom.
  function seal(F, cx, cy, r, local) {
    const { g, u, t } = F;
    const drop = span(local, 0.5, 0.95), s = lerp(1.6, 1, ease(drop)) + (drop >= 1 ? 0.035 * Math.exp(-(local - 0.95) * 6) * Math.sin((local - 0.95) * 26) : 0);
    if (local < 0.5) return;
    g.save(); g.translate(cx, cy); g.scale(s, s);
    g.globalAlpha = clamp(drop * 2.2);
    const col = F.acc(0.95);
    g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fillStyle = F.acc(0.1); g.fill();
    pen(g, col, 5 * u); new Pth().O(0, 0, r).draw(g, 1);
    pen(g, col, 1.8 * u); new Pth().O(0, 0, r * 0.9).draw(g, 1); new Pth().O(0, 0, r * 0.6).draw(g, 1);
    const text = "APPROVED  •  SEALED  •  GRANTED  •  ";
    g.font = `700 ${r * 0.17}px ${SERIF}`; g.fillStyle = col; g.textAlign = "center"; g.textBaseline = "middle";
    const n = text.length, rot = t * 0.28;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rot;
      g.save(); g.rotate(a); g.translate(0, -r * 0.75); g.fillText(text[i], 0, 0); g.restore();
    }
    cog({ ...F, g, ink: () => col, acc: F.acc }, 0, 0, r * 0.4, 12, -t * 0.9, 1, { w: 2.4 });
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i / 5) * TAU, rr = r * 0.54;
      g.save(); g.translate(Math.cos(a) * rr, Math.sin(a) * rr); g.rotate(a + Math.PI / 2);
      g.beginPath(); g.moveTo(0, -5 * u); g.lineTo(3 * u, 3 * u); g.lineTo(-3 * u, 3 * u); g.closePath(); g.fill(); g.restore();
    }
    g.restore();
    // Bloom ring and radiating pulse after the strike.
    if (local > 0.9) {
      const k = span(local, 0.9, 2.2);
      g.save(); g.globalAlpha = (1 - k) * 0.6; pen(g, F.acc(), 3 * u); new Pth().O(cx, cy, r * (1.05 + k * 0.7)).draw(g, 1); g.restore();
    }
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
    pen(g, F.acc(0.45 + 0.3 * pulse), 2 * u);
    const rays = new Pth();
    for (let i = 0; i < 28; i++) { const a = (i / 28) * TAU + t * 0.1, r1 = r * 1.12, r2 = r * (1.18 + (i % 2 ? 0.1 : 0.2) * (0.5 + 0.5 * Math.sin(t * 2.4 + i))); rays.M(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1).L(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); }
    rays.draw(g, clamp((local - 1) * 2));
    // Ribbon tails.
    const rq = span(local, 0.9, 1.6);
    if (rq > 0) {
      const sway = Math.sin(t * 1.8) * 5 * u;
      for (const sg of [-1, 1]) {
        const x0 = cx + sg * r * 0.3, y0 = cy + r * 0.92, tail = r * 0.9 * rq;
        const P = new Pth().M(x0, y0).L(x0 + sg * r * 0.4 + sway * sg, y0 + tail).L(x0 + sg * r * 0.2 + sway * sg, y0 + tail - r * 0.18).L(x0 - sg * r * 0.15 + sway * sg, y0 + tail + r * 0.12).L(x0 - sg * r * 0.15, y0).Z();
        P.fill(g, F.acc(0.14)); pen(g, F.acc(), 2.6 * u); P.draw(g, 1);
      }
    }
  }
  // Blocks of the statement scenes, read from the layout so the art stays out of the lettering.
  function statementBlock(F, ids) {
    const lines = ids.flatMap((id) => headLines(id));
    if (!lines.length) return { top: F.H * 0.38, bottom: F.H * 0.62 };
    return { top: Math.min(...lines.map((l) => l.y)), bottom: Math.max(...lines.map((l) => l.y + l.h)), lines };
  }
  function titleDecor(F, local) {
    const { g, u, W, H } = F, blk = statementBlock(F, ["kicker", "title"]);
    const q = clamp(0.6 + local / 1.6), pad = 70 * u;
    const topY = 96 * u, topH = blk.top - topY - 40 * u, botY = blk.bottom + 44 * u, botH = H - 92 * u - botY;
    const bx = 110 * u, bw = W - 220 * u;
    shaftBand(F, bx, topY, bw, Math.min(topH, 330 * u), q, 1, 0);
    governorBand(F, bx, botY, bw, Math.min(botH, 330 * u), q);
    // Ruled lines around the lettering.
    if (blk.lines) {
      const y1 = blk.top - 18 * u, y2 = blk.bottom + 18 * u, rq = span(local, 0.1, 1.2);
      pen(g, F.ink(0.9), 2.6 * u); new Pth().M(W / 2 - bw * 0.46 * rq, y1).L(W / 2 + bw * 0.46 * rq, y1).M(W / 2 - bw * 0.46 * rq, y2).L(W / 2 + bw * 0.46 * rq, y2).draw(g, 1);
      pen(g, F.ink(0.7), 1 * u); new Pth().M(W / 2 - bw * 0.46 * rq, y1 - 8 * u).L(W / 2 + bw * 0.46 * rq, y1 - 8 * u).M(W / 2 - bw * 0.46 * rq, y2 + 8 * u).L(W / 2 + bw * 0.46 * rq, y2 + 8 * u).draw(g, 1);
    }
  }
  function closingDecor(F, local) {
    const { g, u, W, H } = F, blk = statementBlock(F, ["closing"]);
    const q = clamp(0.3 + local / 1.8);
    const topY = 96 * u, topH = blk.top - topY - 40 * u, botY = blk.bottom + 36 * u, botH = H - 92 * u - botY;
    const bx = 110 * u, bw = W - 220 * u;
    shaftBand(F, bx, topY, bw, Math.min(topH, 330 * u), q, 1.4, 2);
    const r = Math.min(botH * 0.42, 150 * u, bw * 0.2), cy = botY + botH * 0.46;
    // Cogs meshing at either side of the seal, a ground line below.
    const ry = botY + botH * 0.92;
    ground(F, bx, bx + bw, ry, span(q, 0, 0.7));
    const gr = Math.min(r * 0.9, botH * 0.3);
    cog(F, W / 2 - r * 2.6, ry - gr - 4 * u, gr, 14, local * 0.8, span(q, 0.2, 1));
    cog(F, W / 2 - r * 2.6 - gr * 1.9, ry - gr * 0.8 - 4 * u, gr * 0.8, 11, -local * 0.8 * 14 / 11 * 0.82 + 0.3, span(q, 0.3, 1), { spokes: 4 });
    cog(F, W / 2 + r * 2.6, ry - gr - 4 * u, gr, 14, -local * 0.8 + 0.2, span(q, 0.2, 1));
    cog(F, W / 2 + r * 2.6 + gr * 1.9, ry - gr * 0.8 - 4 * u, gr * 0.8, 11, local * 0.8 * 14 / 11 * 0.82, span(q, 0.3, 1), { spokes: 4 });
    pen(g, F.ink(0.6), 1.1 * u);
    numeral(F, "40", W / 2 - r * 3.9, ry - gr * 2.2, W / 2 - r * 3.1, ry - gr * 1.3, span(q, 0.7, 1), { bow: 0.3 });
    numeral(F, "42", W / 2 + r * 3.9, ry - gr * 2.2, W / 2 + r * 3.1, ry - gr * 1.3, span(q, 0.7, 1), { bow: -0.3 });
    seal(F, W / 2, cy, r, local);
  }

  // ---- the five scenes -------------------------------------------------------------------------------
  const DRAW = {};

  // Chart: graduated glass tubes in a rack. Liquid rises to each value, bubbles climb, a surface sloshes.
  DRAW.chart = (F, box, p, d, info) => {
    const { g, u, tall, t } = F, n = d.values.length, max = Math.max(...d.values, 1);
    const numH = 190 * u, baseY = box.y + box.h - numH - 6 * u, slot = box.w / n;
    const tw = Math.min(slot * 0.36, (tall ? 120 : 150) * u), th = Math.min(baseY - box.y + (tall ? 0 : 110 * u) - 24 * u, (tall ? 640 : 500) * u), top = baseY - th;
    const bottom = baseY - 16 * u;
    // Base plate and standing uprights.
    pen(g, F.ink(), 3 * u);
    const plate = new Pth().R(box.x, baseY, box.w, 22 * u);
    plate.draw(g, ease(span(p, 0, 0.3)));
    shade(g, F, plate, box.x, baseY, box.w, 22 * u, 7 * u, 0.8, span(p, 0.05, 0.4), 1.2 * u, F.ink(0.85));
    ground(F, box.x - 20 * u, box.x + box.w + 20 * u, baseY + 22 * u, span(p, 0.05, 0.35));
    const railY = top + th * 0.32;
    pen(g, F.ink(), 2.6 * u);
    for (const sx of [box.x + slot * 0.1, box.x + box.w - slot * 0.1]) new Pth().M(sx - 7 * u, baseY).L(sx - 7 * u, railY - 14 * u).M(sx + 7 * u, baseY).L(sx + 7 * u, railY - 14 * u).draw(g, ease(span(p, 0.05, 0.35)));
    pen(g, F.ink(), 2.2 * u);
    new Pth().M(box.x + slot * 0.1, railY - 7 * u).L(box.x + box.w - slot * 0.1, railY - 7 * u).M(box.x + slot * 0.1, railY + 7 * u).L(box.x + box.w - slot * 0.1, railY + 7 * u).draw(g, ease(span(p, 0.05, 0.45)));
    d.values.forEach((value, i) => {
      const cx = box.x + slot * (i + 0.5), hot = i === d.highlight;
      const q = ease(span(p, 0.06 + i * 0.1, 0.4 + i * 0.1)), lq = ease(span(p, 0.28 + i * 0.1, 0.8 + i * 0.1));
      const arcY = bottom - tw / 2, lx = cx - tw / 2, rx = cx + tw / 2;
      const glass = new Pth().M(lx, top).L(lx, arcY).A(cx, arcY, tw / 2, Math.PI, 0, false).L(rx, top);
      // Liquid.
      const lh = (th - tw * 0.5 - 28 * u) * (value / max) * lq + 4 * u;
      const slosh = Math.sin(t * 2.6 + i * 1.7) * 3.4 * u, tilt = Math.sin(t * 1.9 + i) * 3 * u;
      if (q > 0.3) {
        const wave = [];
        const level = bottom - lh;
        const body = new Pth().M(lx + 1.5 * u, level + tilt + slosh * 0.3);
        for (let k = 1; k <= 12; k++) { const x = lerp(lx + 1.5 * u, rx - 1.5 * u, k / 12); body.L(x, level + Math.sin(k * 0.9 + t * 3 + i) * 2.4 * u - tilt + slosh * 0.3); }
        body.L(rx - 1.5 * u, arcY).A(cx, arcY, tw / 2 - 1.5 * u, 0, Math.PI, false).L(lx + 1.5 * u, level + tilt).Z();
        const col = hot ? F.acc(0.95) : F.ink(0.82);
        shade(g, F, body, lx, level - 8 * u, tw, lh + tw, 6.2 * u, 0, 1, 1.2 * u, col, 0.45);
        stipple(g, F, body, lx, level - 8 * u, tw, lh + tw, 340, 10 + i, (a, b) => 0.15 + 0.7 * a * a, 2.1 * u, col);
        pen(g, hot ? F.acc() : F.ink(), 2.2 * u);
        new Pth().M(lx + 1.5 * u, level + tilt).L(rx - 1.5 * u, level - tilt).draw(g, 1);
        // Bubbles climbing through the liquid.
        const r = rng(60 + i);
        pen(g, F.sheet, 1.7 * u);
        for (let k = 0; k < 6; k++) {
          const sp = 0.14 + r() * 0.16, ph = r(), wob = r() * TAU, rad = (3 + r() * 3.2) * u, tau = fract(t * sp + ph);
          const by = bottom - 6 * u - tau * Math.max(10 * u, lh - 12 * u);
          if (lh < 30 * u) continue;
          const bx = cx + Math.sin(tau * 8 + wob) * tw * 0.26;
          g.beginPath(); g.arc(bx, by, rad, 0, TAU); g.strokeStyle = F.sheet; g.lineWidth = 1.8 * u; g.stroke();
        }
      }
      pen(g, F.ink(), 3.2 * u); glass.draw(g, q);
      pen(g, F.ink(), 2.4 * u);
      new Pth().M(lx - 9 * u, top - 3 * u).L(lx, top).M(rx + 9 * u, top - 3 * u).L(rx, top).M(lx - 9 * u, top - 3 * u).L(rx + 9 * u, top - 3 * u).draw(g, q);
      pen(g, F.ink(0.5), 1.4 * u);
      new Pth().M(lx + tw * 0.16, top + 18 * u).L(lx + tw * 0.16, arcY - 4 * u).M(lx + tw * 0.28, top + 40 * u).L(lx + tw * 0.28, top + th * 0.4).draw(g, q);
      // Graduations on the left wall.
      pen(g, F.ink(0.9), 1.5 * u);
      const gr = new Pth();
      for (let k = 1; k <= 8; k++) { const yy = bottom - 4 * u - ((th - tw * 0.5 - 16 * u) * k) / 8; gr.M(lx, yy).L(lx - (k % 4 === 0 ? 20 : 11) * u, yy); }
      gr.draw(g, span(q, 0.3, 1));
      // Rack ring in front of the glass.
      pen(g, F.ink(), 2.6 * u);
      new Pth().E(cx, railY, tw / 2 + 9 * u, 6 * u, 0, Math.PI, true).draw(g, q);
      numeral(F, String(10 + i * 2), cx + tw * 0.5 + (tall ? 36 : 52) * u, top + th * (0.12 + 0.1 * (i % 2)), rx, top + th * (0.36 + 0.08 * (i % 2)), span(q, 0.5, 1), { bow: 0.3 });
      // Big figure and label.
      const nq = span(lq, 0.05, 1);
      if (nq > 0) {
        say(F, tally(value, lq, d), cx, baseY + 118 * u, 104 * u, { font: "disp", align: "center", color: hot ? F.acc() : F.ink(), maxW: slot * 0.92, min: 70 * u });
        say(F, d.labels[i] || "", cx, baseY + 168 * u, 46 * u, { font: "ital", align: "center", color: F.ink(0.82), maxW: slot * 0.9, min: 36 * u, q: span(q, 0.5, 1) });
        if (hot) {
          const ring = clamp((p - 0.7) / 0.25);
          pen(g, F.acc(0.9), 3 * u, [14 * u, 7 * u]); g.lineDashOffset = -t * 22 * u;
          new Pth().E(cx, baseY + 88 * u, slot * 0.4, 62 * u, -Math.PI / 2 - 0.3, -Math.PI / 2 - 0.3 + TAU * ring, true).draw(g, 1);
          g.lineDashOffset = 0; g.setLineDash([]);
        }
      }
      if (hot && lq > 0.5) smoke(F, cx, top - 6 * u, th * 0.45, 0.6 * span(lq, 0.5, 1), 77);
    });
  };

  // Object: an exploded view of a device in oblique projection with numbered callouts.
  DRAW.object = (F, box, p, d, info) => {
    const { g, u, tall, t } = F, phone = d.kind === "phone";
    const R = tall ? { x: box.x, y: box.y - 60 * u, w: box.w, h: box.h * 0.64 } : { x: box.x, y: box.y - 120 * u, w: box.w * 0.62, h: box.h + 100 * u };
    // Unit-space layout and fit.
    const bb = phone ? { x0: -0.02, x1: 0.9, y0: -0.3, y1: 1.02 } : { x0: -0.02, x1: 1.3, y0: -1.04, y1: 0.1 };
    const s = Math.min(R.w / (bb.x1 - bb.x0), R.h / (bb.y1 - bb.y0)) * 0.94;
    const ox = R.x + (R.w - (bb.x1 - bb.x0) * s) / 2 - bb.x0 * s, oy = R.y + (R.h - (bb.y1 - bb.y0) * s) / 2 - bb.y0 * s;
    const P = (x, y) => [ox + x * s, oy + y * s];
    const poly = (pts) => { const q = new Pth(); pts.forEach(([x, y], i) => { const [a, b] = P(x, y); if (i) q.L(a, b); else q.M(a, b); }); return q.Z(); };
    const bob = Math.sin(t * 1.7) * 0.012, bob2 = Math.sin(t * 1.7 + 1.3) * 0.012;
    const q0 = ease(span(p, 0, 0.35)), q1 = ease(span(p, 0.15, 0.55)), q2 = ease(span(p, 0.3, 0.7)), q3 = ease(span(p, 0.45, 0.85));
    const lw = 2.8 * u;
    const anchors = [];
    // The timeline drawn on a display rectangle (x, y, w, h in unit space).
    const timeline = (x, y, w, h, q, vertical) => {
      if (q <= 0) return;
      const [a, b] = P(x, y), W2 = w * s, H2 = h * s;
      g.save(); g.beginPath(); g.rect(a, b, W2, H2); g.clip();
      // Preview picture: accent shade lines over a sketched sun and hills.
      const pw = W2 * 0.84, ph = H2 * (vertical ? 0.36 : 0.44), px = a + W2 * 0.08, py = b + H2 * 0.08;
      const prev = new Pth().R(px, py, pw, ph);
      pen(g, F.ink(), 2 * u); prev.draw(g, q);
      shade(g, F, prev, px, py, pw, ph, 6 * u, 0.8, q, 1.2 * u, F.acc(0.8));
      pen(g, F.ink(), 1.8 * u);
      new Pth().M(px, py + ph * 0.85).C(px + pw * 0.25, py + ph * 0.45, px + pw * 0.4, py + ph * 0.95, px + pw * 0.62, py + ph * 0.55).C(px + pw * 0.75, py + ph * 0.35, px + pw * 0.88, py + ph * 0.7, px + pw, py + ph * 0.6).draw(g, q);
      g.beginPath(); g.arc(px + pw * 0.78, py + ph * 0.25, ph * 0.12, 0, TAU); g.fillStyle = F.sheet; g.fill(); pen(g, F.ink(), 1.8 * u); g.stroke();
      // Tracks of clips.
      const tracks = 3, ty0 = py + ph + H2 * 0.09, th2 = H2 * (vertical ? 0.075 : 0.085), gap = H2 * (vertical ? 0.04 : 0.045);
      const clips = [[0.0, 0.34], [0.4, 0.22], [0.68, 0.3]];
      for (let k = 0; k < tracks; k++) clips.forEach(([cx0, cw], i) => {
        const sh = clamp((q - 0.2 - i * 0.12 - k * 0.05) * 3);
        if (sh <= 0) return;
        const x0 = px + pw * ((cx0 + k * 0.05) % 0.96), w0 = pw * cw * sh, y0 = ty0 + k * (th2 + gap);
        const r = new Pth().R(x0, y0, w0, th2);
        pen(g, F.ink(), 1.6 * u); r.draw(g, 1);
        if ((i + k) % 3 === 1) shade(g, F, r, x0, y0, w0, th2, 5 * u, 0.8, 1, 1.1 * u, F.acc(0.9)); else shade(g, F, r, x0, y0, w0, th2, 8 * u, -0.8, 1, 1 * u, F.ink(0.6));
      });
      // Playhead sweeping across the tracks.
      const phx = px + pw * fract(t * 0.14 + 0.1);
      pen(g, F.acc(), 2.6 * u); new Pth().M(phx, py + ph + 4 * u).L(phx, ty0 + tracks * (th2 + gap)).draw(g, q);
      g.beginPath(); g.moveTo(phx - 7 * u, py + ph + 2 * u); g.lineTo(phx + 7 * u, py + ph + 2 * u); g.lineTo(phx, py + ph + 14 * u); g.closePath(); g.fillStyle = F.acc(); g.fill();
      g.restore();
    };
    const dashLink = (x1, y1, x2, y2, q) => {
      pen(g, F.ink(0.7), 1.4 * u, [10 * u, 7 * u]); g.lineDashOffset = -t * 18 * u;
      new Pth().M(...P(x1, y1)).L(...P(x2, y2)).draw(g, q); g.lineDashOffset = 0; g.setLineDash([]);
    };
    if (!phone) {
      // Base slab: front, top and right faces; a wave of pressed keys runs across the keyboard.
      const bw = 1, bh = 0.07, ex = 0.26, ey = -0.19;
      const front = poly([[0, 0], [bw, 0], [bw, bh], [0, bh]]), top = poly([[0, 0], [bw, 0], [bw + ex, ey], [ex, ey]]), side = poly([[bw, 0], [bw + ex, ey], [bw + ex, ey + bh], [bw, bh]]);
      for (const f of [front, top, side]) f.fill(g, F.sheet);
      pen(g, F.ink(), lw); front.draw(g, q0); top.draw(g, q0); side.draw(g, q0);
      const [fa, fb] = P(0, 0), [fc, fd] = P(bw, bh);
      shade(g, F, side, ...P(bw, ey), ex * s, (bh - ey) * s, 6 * u, 1.0, q0, 1.1 * u, F.ink(0.85));
      shade(g, F, front, fa, fb, fc - fa, fd - fb, 7 * u, 0, q0, 1.1 * u, F.ink(0.5));
      if (q0 > 0.5) {
        const wave = (t * 9) % 18;
        for (let r = 0; r < 4; r++) for (let c = 0; c < 10; c++) {
          const s0 = 0.06 + c * 0.093, t0 = 0.14 + r * 0.18;
          const k = (s2, t2) => [s2 + ex * t2 + 0, ey * t2 + 0];
          const pts = [k(s0, t0), k(s0 + 0.07, t0), k(s0 + 0.07 + ex * 0 , t0 + 0.12), k(s0, t0 + 0.12)].map(([x, y]) => [x * 1 + (0), y]);
          const hit = Math.max(0, 1 - Math.abs(wave - (c + r * 1.5)) / 1.4);
          const kq = poly(pts.map(([x, y]) => [x, y + hit * 0.008]));
          if (hit > 0) kq.fill(g, F.ink(0.5 * hit));
          pen(g, F.ink(0.9), 1.3 * u); kq.draw(g, 1);
        }
        const pad = poly([[0.36, ey * 0.82 + 0.0], [0.64, ey * 0.82], [0.64 + ex * 0.08, ey * 0.95], [0.36 + ex * 0.08, ey * 0.95]]);
        pen(g, F.ink(0.6), 1.2 * u); pad.draw(g, 1);
      }
      // Standing screen: bezel, display and (exploded away) a cover glass tethered by dashed corners.
      const sx0 = 0.3 + ex * 0.0, sy1 = ey, sw = 0.92, sh = 0.62;
      const bez = poly([[sx0 + 0.0, sy1], [sx0 + sw, sy1], [sx0 + sw, sy1 - sh], [sx0, sy1 - sh]]);
      bez.fill(g, F.sheet);
      pen(g, F.ink(), lw); bez.draw(g, q1);
      const edge = poly([[sx0 + sw, sy1 - sh], [sx0 + sw + 0.025, sy1 - sh - 0.02], [sx0 + sw + 0.025, sy1 - 0.02], [sx0 + sw, sy1]]);
      pen(g, F.ink(), lw * 0.8); edge.draw(g, q1);
      shade(g, F, edge, ...P(sx0 + sw, sy1 - sh - 0.02), 0.03 * s, (sh + 0.02) * s, 4 * u, 1.1, q1, 1 * u, F.ink(0.85));
      const ix = sx0 + 0.045, iy = sy1 - sh + 0.045, iw = sw - 0.09, ih = sh - 0.09;
      pen(g, F.ink(0.9), 1.6 * u); poly([[ix, iy], [ix + iw, iy], [ix + iw, iy + ih], [ix, iy + ih]]).draw(g, q1);
      timeline(ix, iy, iw, ih, q2, false);
      // Cover glass.
      const gx = ix - 0.16, gy = iy - 0.2 + bob, glass = poly([[gx, gy], [gx + iw, gy], [gx + iw, gy + ih], [gx, gy + ih]]);
      pen(g, F.ink(0.9), 2.2 * u); glass.draw(g, q3);
      pen(g, F.ink(0.55), 1.4 * u);
      new Pth().M(...P(gx + iw * 0.12, gy + ih * 0.9)).L(...P(gx + iw * 0.4, gy + ih * 0.1)).M(...P(gx + iw * 0.2, gy + ih * 0.93)).L(...P(gx + iw * 0.48, gy + ih * 0.13)).draw(g, q3);
      for (const [cx, cy] of [[0, 0], [iw, 0], [iw, ih], [0, ih]]) dashLink(ix + cx, iy + cy, gx + cx, gy + cy, q3);
      anchors.push(P(gx + iw * 0.96, gy + ih * 0.12), P(ix + iw * 0.62, iy + ih * 0.78), P(0.46, 0.065));
    } else {
      const w0 = 0.5, h0 = 1.0, ex = 0.06, ey = -0.045;
      const layer = (dx, dy, inset, q, fillPaper, extra) => {
        const x = dx + inset, y = dy + inset, w = w0 - inset * 2, h = h0 - inset * 2;
        const front = poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
        if (fillPaper) front.fill(g, F.sheet);
        return { x, y, w, h, front };
      };
      // Body.
      const b0 = layer(0, 0.02, 0, q0, true);
      const bodyTop = poly([[0, 0.02], [w0, 0.02], [w0 + ex, 0.02 + ey], [ex, 0.02 + ey]]);
      const bodySide = poly([[w0, 0.02], [w0 + ex, 0.02 + ey], [w0 + ex, 0.02 + ey + h0], [w0, 0.02 + h0]]);
      bodyTop.fill(g, F.sheet); bodySide.fill(g, F.sheet);
      pen(g, F.ink(), lw); b0.front.draw(g, q0); bodyTop.draw(g, q0); bodySide.draw(g, q0);
      shade(g, F, bodySide, ...P(w0, 0.02 + ey), ex * s, (h0 + 0 - ey) * s, 5 * u, 1.1, q0, 1.1 * u, F.ink(0.85));
      pen(g, F.ink(0.8), 1.8 * u);
      new Pth().O(...P(w0 / 2, 0.93), 0.022 * s).draw(g, q0);
      new Pth().M(...P(w0 * 0.4, 0.08)).L(...P(w0 * 0.6, 0.08)).draw(g, q0);
      // Display layer, floating up and out.
      const dx = 0.13, dy = -0.1 + bob2;
      const disp = layer(dx, dy + 0.02, 0.035, q1, true);
      pen(g, F.ink(), 2.2 * u); disp.front.draw(g, q1);
      const scr = layer(dx, dy + 0.02, 0.07, q1, false);
      pen(g, F.ink(0.9), 1.6 * u); scr.front.draw(g, q1);
      timeline(scr.x, scr.y + 0.02, scr.w, scr.h - 0.04, q2, true);
      for (const [cx, cy] of [[0, 0], [1, 0], [1, 1], [0, 1]]) dashLink(0.035 + cx * (w0 - 0.07), 0.055 + cy * (h0 - 0.07), disp.x + cx * disp.w, disp.y + cy * disp.h, q2);
      // Cover glass floating higher.
      const gl = layer(0.34, -0.3 + bob, 0.035, q3, false);
      pen(g, F.ink(0.9), 2.2 * u); gl.front.draw(g, q3);
      pen(g, F.ink(0.55), 1.4 * u);
      new Pth().M(...P(gl.x + gl.w * 0.15, gl.y + gl.h * 0.25)).L(...P(gl.x + gl.w * 0.7, gl.y + gl.h * 0.05)).M(...P(gl.x + gl.w * 0.2, gl.y + gl.h * 0.3)).L(...P(gl.x + gl.w * 0.8, gl.y + gl.h * 0.07)).draw(g, q3);
      for (const [cx, cy] of [[0, 0], [1, 0], [1, 1], [0, 1]]) dashLink(disp.x + cx * disp.w, disp.y + cy * disp.h, gl.x + cx * gl.w, gl.y + cy * gl.h, q3);
      anchors.push(P(gl.x + gl.w * 0.96, gl.y + gl.h * 0.06), P(scr.x + scr.w * 0.65, scr.y + scr.h * 0.72), P(w0 * 0.55, 0.94));
    }
    // Callouts.
    const nums = ["10", "12", "14"];
    if (!tall) {
      const lx = box.x + box.w * 0.69;
      d.callouts.forEach((label, i) => {
        const c = ease(span(p, 0.4 + i * 0.1, 0.72 + i * 0.07));
        if (c <= 0 || !label) return;
        const [ax, ay] = anchors[i], ly = box.y + box.h * (0.17 + i * 0.3);
        numeral(F, nums[i], lx - 34 * u, ly - 14 * u, ax, ay, c, { bow: i === 1 ? 0.12 : -0.2 });
        pen(g, F.ink(0.9), 1.8 * u); new Pth().M(lx - 6 * u, ly + 12 * u).L(lx + (box.x + box.w - lx) * 0.96, ly + 12 * u).draw(g, c);
        say(F, label, lx, ly, 46 * u, { font: "ital", weight: 500, maxW: box.x + box.w - lx, min: 36 * u, q: span(c, 0.45, 1) });
      });
    } else {
      d.callouts.forEach((label, i) => {
        const c = ease(span(p, 0.4 + i * 0.1, 0.72 + i * 0.07));
        if (c <= 0 || !label) return;
        const [ax, ay] = anchors[i], off = (i % 2 ? -1 : 1) * (R.w * 0.36);
        numeral(F, nums[i], clamp(ax + off, box.x + 40 * u, box.x + box.w - 40 * u), ay + (i === 1 ? 10 : -34) * u, ax, ay, c, { bow: 0.2 });
        const ly = box.y + box.h * (0.68 + i * 0.1);
        say(F, nums[i], box.x + 40 * u, ly, 44 * u, { font: "disp", color: F.acc(), q: c });
        say(F, label, box.x + 120 * u, ly, 48 * u, { font: "ital", maxW: box.w - 130 * u, min: 38 * u, q: span(c, 0.4, 1) });
        pen(g, F.ink(0.85), 1.4 * u, [2 * u, 8 * u]); new Pth().M(box.x + 120 * u, ly + 14 * u).L(box.x + box.w, ly + 14 * u).draw(g, c);
        g.setLineDash([]);
      });
    }
  };

  // People: automaton figures on drum plinths, each with a prop that keeps moving.
  function person(F, cx, base, h, i, q, hot, label, labelQ) {
    const { g, u, t } = F;
    g.save();
    g.translate(cx, base); g.scale(h, h);
    const wu = (px) => px / h, breath = 1 + 0.012 * Math.sin(t * 2 + i * 1.3);
    g.scale(1, breath);
    // Reveal bottom-up like a print developing.
    g.beginPath(); g.rect(-0.9, -1.35 * q - 0.02, 1.8, 1.35 * q + 0.1); g.clip();
    const ink = (a) => F.ink(a), line = (w, col, dash) => pen(g, col || ink(1), wu(w * u), dash);
    const coat = hot ? F.acc() : ink(1);
    const nod = Math.sin(t * 1.6 + i * 2.1) * 0.006;
    // Legs and shoes.
    for (const sg of [-1, 1]) {
      const leg = new Pth().R(sg > 0 ? 0.025 : -0.115, -0.37, 0.09, 0.34);
      leg.fill(g, F.sheet); line(2.6); leg.draw(g, 1);
      shade(g, F, leg, sg > 0 ? 0.025 : -0.115, -0.37, 0.09, 0.34, 0.012, Math.PI / 2, 1, wu(1.1 * u), ink(0.75));
      const shoe = new Pth().E(sg * 0.075, -0.022, 0.09, 0.027, 0, TAU, true);
      shoe.fill(g, ink(0.9)); line(2.2); shoe.draw(g, 1);
    }
    // Arms (outlined tubes): the prop decides the pose.
    const kind = i % 4;
    const arm = (sx, sy, a1, a2, l1, l2) => {
      const ex = sx + Math.sin(a1) * l1, ey = sy + Math.cos(a1) * l1, hx = ex + Math.sin(a2) * l2, hy = ey + Math.cos(a2) * l2;
      g.lineCap = "round"; g.lineJoin = "round";
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.lineTo(hx, hy); g.strokeStyle = ink(1); g.lineWidth = 0.074; g.stroke();
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.lineTo(hx, hy); g.strokeStyle = F.sheet; g.lineWidth = 0.05; g.stroke();
      g.beginPath(); g.arc(hx, hy, 0.034, 0, TAU); g.fillStyle = F.sheet; g.fill(); line(2); g.stroke();
      return [hx, hy];
    };
    const swing = Math.sin(t * 1.5 + i) * 0.05;
    let handR, handL;
    if (kind === 1) { handL = arm(-0.14, -0.62, -0.5, 0.75 + swing, 0.17, 0.15); handR = arm(0.14, -0.62, 0.5, -0.75 - swing, 0.17, 0.15); }
    else if (kind === 3) { handL = arm(-0.14, -0.62, -0.22, -0.08, 0.17, 0.15); handR = arm(0.14, -0.62, 2.35, 2.35 + 0.65 * Math.sin(t * 5.2 + i), 0.17, 0.15); }
    else { handL = arm(-0.14, -0.62, -0.24 + swing * 0.3, -0.1, 0.17, 0.15); handR = arm(0.14, -0.62, 0.55 + swing * 0.4, 0.2 + (kind === 0 ? 0.35 : 0), 0.17, 0.15); }
    // Coat.
    const body = new Pth().poly([[-0.14, -0.645], [0.14, -0.645], [0.165, -0.3], [-0.165, -0.3]], true);
    body.fill(g, F.sheet); line(2.8); body.draw(g, 1);
    shade(g, F, new Pth().poly([[0.01, -0.645], [0.14, -0.645], [0.165, -0.3], [0.03, -0.3]], true), 0.01, -0.645, 0.16, 0.35, 0.013, 1.15, 1, wu(1.2 * u), hot ? F.acc(0.95) : ink(0.85), 0.4);
    line(2); new Pth().M(-0.05, -0.645).L(0, -0.5).L(0.05, -0.645).M(0, -0.5).L(0, -0.3).draw(g, 1);
    g.fillStyle = ink(1); g.beginPath(); for (const yy of [-0.46, -0.4, -0.34]) g.arc(0.02, yy, 0.0085, 0, TAU); g.fill();
    // Bow tie.
    const bow = new Pth().poly([[0, -0.655], [-0.045, -0.675], [-0.045, -0.635]], true);
    const bow2 = new Pth().poly([[0, -0.655], [0.045, -0.675], [0.045, -0.635]], true);
    bow.fill(g, hot ? F.acc() : ink(0.9)); bow2.fill(g, hot ? F.acc() : ink(0.9));
    // Head, face and hat.
    const hy = -0.745 + nod;
    const head = new Pth().O(0, hy, 0.09);
    head.fill(g, F.sheet); line(2.8); head.draw(g, 1);
    shade(g, F, new Pth().A(0, hy, 0.09, -1.1, 1.1, true).Z(), 0.02, hy - 0.09, 0.1, 0.18, 0.014, 1.2, 1, wu(1 * u), ink(0.7), 0.5);
    const blink = fract(t * 0.4 + i * 0.37) > 0.955 ? 0.15 : 1;
    g.fillStyle = ink(1);
    for (const ex of [-0.035, 0.035]) { g.beginPath(); g.ellipse(ex, hy - 0.008, 0.0085, 0.0085 * blink, 0, 0, TAU); g.fill(); }
    line(1.6); new Pth().M(0.004, hy), new Pth().M(0.0, hy - 0.002).Q(0.014, hy + 0.025, -0.004, hy + 0.027).draw(g, 1);
    line(1.8); new Pth().M(-0.034, hy + 0.05).Q(0, hy + 0.068 + 0.004 * Math.sin(t * 0.9 + i), 0.034, hy + 0.05).draw(g, 1);
    const hat = i % 5, hb = hy - 0.075;
    if (hat === 0) {
      const crown = new Pth().R(-0.072, hb - 0.15, 0.144, 0.15), brim = new Pth().E(0, hb, 0.125, 0.022, 0, TAU, true);
      crown.fill(g, F.sheet); line(2.6); crown.draw(g, 1); brim.fill(g, F.sheet); brim.draw(g, 1);
      new Pth().R(-0.072, hb - 0.04, 0.144, 0.04).fill(g, hot ? F.acc() : ink(0.9));
      shade(g, F, crown, 0.0, hb - 0.15, 0.072, 0.15, 0.012, Math.PI / 2, 1, wu(1.1 * u), ink(0.75));
    } else if (hat === 1) {
      const cap = new Pth().E(0, hb + 0.01, 0.1, 0.085, Math.PI, TAU, true).Z();
      cap.fill(g, F.sheet); line(2.6); cap.draw(g, 1);
      line(2.6); new Pth().M(0.02, hb + 0.012).Q(0.12, hb - 0.01, 0.17, hb + 0.03).draw(g, 1);
      shade(g, F, cap, -0.1, hb - 0.075, 0.2, 0.09, 0.013, 0.7, 1, wu(1.1 * u), hot ? F.acc(0.9) : ink(0.8));
    } else if (hat === 2) {
      const hair = new Pth().E(0, hy - 0.005, 0.1, 0.1, Math.PI * 0.95, Math.PI * 2.05, true).Z();
      hair.fill(g, F.sheet); line(2.6); hair.draw(g, 1);
      shade(g, F, hair, -0.1, hy - 0.11, 0.2, 0.1, 0.011, 1.0, 1, wu(1.1 * u), hot ? F.acc(0.9) : ink(0.9));
      const bun = new Pth().O(-0.01, hy - 0.125, 0.04); bun.fill(g, F.sheet); line(2.4); bun.draw(g, 1);
      shade(g, F, bun, -0.05, hy - 0.165, 0.08, 0.08, 0.01, 0.6, 1, wu(1 * u), ink(0.85));
    } else if (hat === 3) {
      const dome = new Pth().E(0, hb + 0.005, 0.082, 0.085, Math.PI, TAU, true).Z(), brim = new Pth().E(0, hb + 0.005, 0.125, 0.02, 0, TAU, true);
      brim.fill(g, F.sheet); line(2.4); brim.draw(g, 1); dome.fill(g, F.sheet); line(2.6); dome.draw(g, 1);
      shade(g, F, dome, 0.0, hb - 0.08, 0.082, 0.09, 0.011, Math.PI / 2, 1, wu(1.1 * u), ink(0.8));
    } else {
      const disc = new Pth().E(0, hb + 0.005, 0.115, 0.03, 0, TAU, true), crown = new Pth().E(0, hb, 0.07, 0.07, Math.PI, TAU, true).Z();
      disc.fill(g, F.sheet); line(2.4); disc.draw(g, 1); crown.fill(g, F.sheet); line(2.6); crown.draw(g, 1);
      const sw = Math.sin(t * 2 + i) * 0.03;
      line(2.2, hot ? F.acc() : ink(1)); new Pth().M(0.04, hb - 0.04).C(0.12 + sw, hb - 0.12, 0.17 + sw * 2, hb - 0.1, 0.19 + sw * 2, hb - 0.18).draw(g, 1);
    }
    // Props.
    if (kind === 0) {
      // Pocket watch swinging on its chain.
      const ph = 0.55 * Math.sin(t * 2.4 + i), wx = handR[0] + Math.sin(ph) * 0.16, wy = handR[1] + Math.cos(ph) * 0.16;
      line(1.6); new Pth().M(handR[0], handR[1]).L(wx, wy - 0.045).draw(g, 1);
      const face = new Pth().O(wx, wy, 0.052); face.fill(g, F.sheet); line(2.4); face.draw(g, 1);
      line(1.2); new Pth().O(wx, wy, 0.04).draw(g, 1);
      const ta = t * 0.8 + i; line(1.6); new Pth().M(wx, wy).L(wx + Math.sin(ta) * 0.034, wy - Math.cos(ta) * 0.034).M(wx, wy).L(wx + Math.sin(ta * 12) * 0.024, wy - Math.cos(ta * 12) * 0.024).draw(g, 1);
    } else if (kind === 1) {
      // A rolled drawing held across the middle.
      const sy = -0.5 + Math.sin(t * 1.4 + i) * 0.006, roll = new Pth().R(-0.2, sy - 0.03, 0.4, 0.06);
      roll.fill(g, F.sheet); line(2.4); roll.draw(g, 1);
      shade(g, F, roll, -0.2, sy - 0.03, 0.4, 0.06, 0.011, 0.9, 1, wu(1 * u), ink(0.8));
      for (const ex of [-0.2, 0.2]) { new Pth().E(ex, sy, 0.012, 0.03, 0, TAU, true).draw(g, 1); }
      line(1.4, hot ? F.acc() : ink(0.9)); new Pth().M(-0.08, sy - 0.03).L(-0.08, sy + 0.03).M(0.04, sy - 0.03).L(0.04, sy + 0.03).draw(g, 1);
    } else if (kind === 2) {
      // Lantern on a swinging hook, with a pulsing glow of rays.
      const ph = 0.4 * Math.sin(t * 2.0 + i * 0.7), lx = handR[0] + Math.sin(ph) * 0.17, ly = handR[1] + Math.cos(ph) * 0.17;
      line(1.6); new Pth().M(handR[0], handR[1]).L(lx, ly - 0.04).draw(g, 1);
      const body = new Pth().poly([[lx - 0.034, ly - 0.03], [lx + 0.034, ly - 0.03], [lx + 0.045, ly + 0.07], [lx - 0.045, ly + 0.07]], true);
      body.fill(g, F.sheet); line(2.4); body.draw(g, 1);
      line(1.8); new Pth().M(lx - 0.04, ly - 0.03).L(lx, ly - 0.06).L(lx + 0.04, ly - 0.03).M(lx, ly - 0.03).L(lx, ly + 0.07).draw(g, 1);
      g.fillStyle = hot ? F.acc() : ink(0.9); g.beginPath(); g.ellipse(lx, ly + 0.02, 0.012, 0.02 + 0.004 * Math.sin(t * 9 + i), 0, 0, TAU); g.fill();
      line(1.3, ink(0.55 + 0.3 * Math.sin(t * 5 + i)));
      const rays = new Pth();
      for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU + t * 0.4, r1 = 0.075, r2 = 0.1 + 0.03 * Math.sin(t * 3 + k * 1.7); rays.M(lx + Math.cos(a) * r1, ly + 0.02 + Math.sin(a) * r1).L(lx + Math.cos(a) * r2, ly + 0.02 + Math.sin(a) * r2); }
      rays.draw(g, 1);
    } else {
      // Wave: a few motion arcs beside the hand.
      line(1.4, ink(0.6)); const wv = 0.5 + 0.5 * Math.sin(t * 5.2 + i);
      new Pth().A(handR[0] + 0.02, handR[1] - 0.01, 0.07 + 0.02 * wv, -0.3, 0.9, true).draw(g, 1);
      new Pth().A(handR[0] + 0.02, handR[1] - 0.01, 0.105 + 0.02 * wv, -0.2, 0.8, true).draw(g, 1);
    }
    g.restore();
  }
  // A drum plinth: top ellipse, shaded side and a name on its face.
  function plinth(F, cx, base, w, hgt, label, q, hot) {
    const { g, u } = F;
    if (q <= 0) return;
    const ry = w * 0.1;
    const side = new Pth().M(cx - w / 2, base).L(cx - w / 2, base + hgt).A(cx, base + hgt, w / 2, Math.PI, 0, false).L(cx + w / 2, base);
    const top = new Pth().E(cx, base, w / 2, ry, 0, TAU, true);
    const face = new Pth().M(cx - w / 2, base).L(cx - w / 2, base + hgt).E(cx, base + hgt, w / 2, ry, Math.PI, 0, false).L(cx + w / 2, base).E(cx, base, w / 2, ry, 0, Math.PI, false).Z();
    face.fill(g, F.sheet);
    pen(g, F.ink(), 2.8 * u); face.draw(g, q);
    top.fill(g, F.sheet); top.draw(g, q);
    shade(g, F, face, cx + w * 0.1, base, w * 0.4, hgt + ry, 6 * u, Math.PI / 2, q, 1.1 * u, hot ? F.acc(0.9) : F.ink(0.8), 0.3);
    pen(g, F.ink(0.6), 1.2 * u); new Pth().E(cx, base, w * 0.36, ry * 0.72, 0, TAU, true).draw(g, q);
    say(F, label, cx - w * 0.04, base + ry + hgt * 0.62, 44 * u, { font: "ital", weight: 600, align: "center", maxW: w * 0.82, min: 34 * u, color: hot ? F.acc() : F.ink(), q: span(q, 0.5, 1) });
  }
  DRAW.people = (F, box, p, d, info) => {
    const { g, u, tall, t } = F, n = clamp(Math.round(d.count), 2, 6);
    const rows = tall && n > 3 ? 2 : 1, per = rows === 2 ? Math.ceil(n / 2) : n;
    const top0 = box.y - (tall ? 0 : 110 * u), rh = (box.h + (box.y - top0)) / rows, plH = 96 * u;
    const hotIdx = Math.min(n - 1, d.highlight);
    const lamp = (cx, y0, y1, w, q) => {
      if (q <= 0) return;
      const r = rng(88), a = dots(220, 91);
      g.fillStyle = F.ink(0.75); g.beginPath();
      for (let k = 0; k < 220; k++) {
        const tau = fract(a[k * 3 + 1] + t * (0.05 + 0.04 * a[k * 3 + 2])), yy = lerp(y0, y1, tau), half = lerp(w * 0.05, w * 0.5, tau);
        const xx = cx + (a[k * 3] * 2 - 1) * half + Math.sin(t * 0.8 + k) * 3 * u;
        if (a[k * 3 + 2] > q * 0.9) continue;
        g.rect(xx, yy, 2.2 * u, 2.2 * u);
      }
      g.fill();
    };
    for (let i = 0; i < n; i++) {
      const row = rows === 2 ? (i < per ? 0 : 1) : 0, idxInRow = rows === 2 ? (i < per ? i : i - per) : i, cnt = rows === 2 ? (row === 0 ? per : n - per) : n;
      const slot = box.w / cnt, cx = box.x + slot * (idxInRow + 0.5), rowTop = top0 + row * rh;
      const hot = i === hotIdx;
      const h = Math.min(rh - plH - 70 * u, slot * 1.55, 520 * u);
      const q = ease(span(p, 0.04 + i * 0.1, 0.5 + i * 0.1));
      const pb = rowTop + rh - plH - 30 * u - 10 * u;
      // Spotlight dust over the highlighted figure.
      if (hot) lamp(cx, rowTop + 4 * u, pb, slot * 0.9, q);
      plinth(F, cx, pb, Math.min(slot * 0.74, h * 0.62), plH, d.badges[i % d.badges.length] || "", q, hot);
      person(F, cx, pb, h, i, q, hot);
      if (hot && q > 0.9) {
        pen(g, F.acc(0.9), 3 * u, [14 * u, 8 * u]); g.lineDashOffset = -t * 24 * u;
        new Pth().E(cx, pb - h * 0.5, h * 0.36, h * 0.6, 0, TAU, true).draw(g, ease(span(p, 0.6, 0.95)));
        g.lineDashOffset = 0; g.setLineDash([]);
      }
      numeral(F, String(20 + i * 2), cx + Math.min(slot * 0.46, h * 0.4), pb - h * 0.98, cx + h * 0.1, pb - h * 0.72, span(q, 0.6, 1), { bow: -0.3 });
    }
    const gy = box.y + box.h - 22 * u;
    for (let r = 0; r < rows; r++) ground(F, box.x - 10 * u, box.x + box.w - 120 * u, top0 + (r + 1) * rh - 22 * u, ease(span(p, 0, 0.4)));
  };

  // Process: three benches on a moving belt. A lens scans a ledger, an arm drafts a line, a press stamps a mark.
  function bench(F, kind, cx, cy, s, q, p) {
    const { g, u, t } = F;
    if (q <= 0) return;
    g.save();
    g.beginPath(); g.rect(cx - s, cy + s * 0.5 - (s * 1.1) * q, s * 2, s * 1.1 * q + 4 * u); g.clip();
    const ty = cy + s * 0.3;
    // Bench top and legs shared by all.
    const top = new Pth().R(cx - s * 0.46, ty, s * 0.92, s * 0.06);
    top.fill(g, F.sheet); pen(g, F.ink(), 2.8 * u); top.draw(g, 1);
    shade(g, F, top, cx - s * 0.46, ty, s * 0.92, s * 0.06, 6 * u, 0.9, 1, 1 * u, F.ink(0.8));
    pen(g, F.ink(), 2.6 * u);
    new Pth().M(cx - s * 0.4, ty + s * 0.06).L(cx - s * 0.4, ty + s * 0.2).M(cx + s * 0.4, ty + s * 0.06).L(cx + s * 0.4, ty + s * 0.2).M(cx - s * 0.4, ty + s * 0.2).L(cx + s * 0.4, ty + s * 0.2).draw(g, 1);
    if (kind === 0) {
      // Ledger with ruled lines; a lens on a pivoting arm scans across it and magnifies.
      const lx = cx - s * 0.3, lw = s * 0.6;
      const pg1 = new Pth().poly([[lx, ty], [lx + lw * 0.5, ty - s * 0.02], [lx + lw * 0.5, ty - s * 0.14], [lx, ty - s * 0.12]], true), pg2 = new Pth().poly([[lx + lw * 0.5, ty - s * 0.02], [lx + lw, ty], [lx + lw, ty - s * 0.12], [lx + lw * 0.5, ty - s * 0.14]], true);
      for (const pg of [pg1, pg2]) { pg.fill(g, F.sheet); pen(g, F.ink(), 2.2 * u); pg.draw(g, 1); }
      pen(g, F.ink(0.75), 1.3 * u);
      const rl = new Pth();
      for (let k = 0; k < 4; k++) { const f = (k + 1) / 5; for (const [a, b] of [[0.06, 0.44], [0.56, 0.94]]) rl.M(lx + lw * a, ty - s * (0.01 + 0.11 * f) - (a > 0.5 ? 0 : 0)).L(lx + lw * b, ty - s * (0.01 + 0.11 * f)); }
      rl.draw(g, 1);
      const lensX = cx + Math.sin(t * 1.25) * s * 0.18, lensY = cy - s * 0.02 + Math.sin(t * 2.5) * s * 0.012, lr = s * 0.19;
      const px = cx + s * 0.36, py = ty - s * 0.02;
      pen(g, F.ink(), 3 * u);
      new Pth().M(px, ty).L(px, cy - s * 0.3).L(lensX + lr * 0.7, lensY - lr * 0.7).draw(g, 1);
      new Pth().M(px - 10 * u, ty).L(px + 10 * u, ty).draw(g, 1);
      g.beginPath(); g.arc(lensX, lensY, lr, 0, TAU); g.fillStyle = F.sheet; g.fill();
      g.save(); g.beginPath(); g.arc(lensX, lensY, lr * 0.92, 0, TAU); g.clip();
      pen(g, F.ink(0.95), 4.4 * u);
      for (let k = -2; k <= 2; k++) { const yy = lensY + k * lr * 0.36 + Math.sin(t * 2.5 + k) * 0; g.beginPath(); g.moveTo(lensX - lr, yy); g.lineTo(lensX + lr * (0.3 + 0.5 * ((k + 7) % 3) / 2) - (lensX - cx) * 0.0, yy); g.stroke(); }
      g.restore();
      pen(g, F.ink(), 4 * u); g.beginPath(); g.arc(lensX, lensY, lr, 0, TAU); g.stroke();
      pen(g, F.ink(), 1.6 * u); g.beginPath(); g.arc(lensX, lensY, lr * 0.9, 0, TAU); g.stroke();
      pen(g, "rgba(255,255,255,0.7)", 2.4 * u); new Pth().A(lensX, lensY, lr * 0.76, Math.PI * 1.1, Math.PI * 1.45, true).draw(g, 1);
    } else if (kind === 1) {
      // Drafting arm: two links reach for a pen tip that traces a looping line on a sheet.
      const sheetX = cx - s * 0.12, sheetW = s * 0.5;
      const sheet = new Pth().poly([[sheetX, ty], [sheetX + sheetW, ty], [sheetX + sheetW - s * 0.04, ty - s * 0.16], [sheetX - s * 0.04, ty - s * 0.16]], true);
      sheet.fill(g, F.sheet); pen(g, F.ink(), 2.2 * u); sheet.draw(g, 1);
      const tip = (tt) => [sheetX + sheetW * 0.5 - s * 0.02 + Math.sin(tt * 1.3) * sheetW * 0.36, ty - s * 0.075 + Math.sin(tt * 2.6) * s * 0.045];
      pen(g, F.ink(0.95), 2.4 * u);
      const trail = 70;
      for (let k = 1; k < trail; k++) {
        const a0 = tip(t - (trail - k + 1) * 0.04), a1 = tip(t - (trail - k) * 0.04);
        g.globalAlpha = k / trail; g.beginPath(); g.moveTo(a0[0], a0[1]); g.lineTo(a1[0], a1[1]); g.stroke();
      }
      g.globalAlpha = 1;
      const [tx, tyy] = tip(t), sx = cx - s * 0.36, sy = cy - s * 0.18, L = s * 0.36;
      const dx = tx - sx, dy = tyy - sy, dist = Math.min(Math.hypot(dx, dy), L * 1.96), ang = Math.atan2(dy, dx), cosA = dist / (2 * L), a1 = Math.acos(clamp(cosA, 0, 1));
      const ex = sx + Math.cos(ang - a1) * L, ey = sy + Math.sin(ang - a1) * L;
      pen(g, F.ink(), 6 * u);
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.lineTo(tx, tyy); g.stroke();
      pen(g, F.sheet, 3 * u); g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.lineTo(tx, tyy); g.stroke();
      pen(g, F.ink(), 2.6 * u); new Pth().M(cx - s * 0.36, ty).L(cx - s * 0.36, sy + 6 * u).draw(g, 1);
      for (const [x, y, r] of [[sx, sy, 10], [ex, ey, 8]]) { g.beginPath(); g.arc(x, y, r * u, 0, TAU); g.fillStyle = F.sheet; g.fill(); pen(g, F.ink(), 2.6 * u); g.stroke(); g.beginPath(); g.arc(x, y, 2.5 * u, 0, TAU); g.fillStyle = F.ink(); g.fill(); }
      g.beginPath(); g.moveTo(tx, tyy); g.lineTo(tx, tyy - 16 * u); pen(g, F.ink(), 3 * u); g.stroke();
    } else {
      // Stamp press: a handle drives the die down; an approval mark blooms and fades.
      const ph = fract(t / 2.4), down = ph < 0.2 ? ease(ph / 0.2) : ph < 0.34 ? 1 : 1 - ease((ph - 0.34) / 0.3);
      const sy0 = cy - s * 0.18, sy1 = ty - s * 0.2, dieY = lerp(sy0, sy1, down);
      pen(g, F.ink(), 3 * u);
      for (const sg of [-1, 1]) new Pth().M(cx + sg * s * 0.26, ty).L(cx + sg * s * 0.26, cy - s * 0.34).draw(g, 1);
      const arch = new Pth().R(cx - s * 0.3, cy - s * 0.4, s * 0.6, s * 0.08); arch.fill(g, F.sheet); arch.draw(g, 1);
      shade(g, F, arch, cx - s * 0.3, cy - s * 0.4, s * 0.6, s * 0.08, 6 * u, 0.9, 1, 1 * u, F.ink(0.8));
      pen(g, F.ink(), 6 * u); new Pth().M(cx, cy - s * 0.32).L(cx, dieY).draw(g, 1);
      pen(g, F.sheet, 2.4 * u); new Pth().M(cx, cy - s * 0.32).L(cx, dieY).draw(g, 1);
      const die = new Pth().R(cx - s * 0.12, dieY, s * 0.24, s * 0.08); die.fill(g, F.sheet); pen(g, F.ink(), 3 * u); die.draw(g, 1);
      shade(g, F, die, cx - s * 0.12, dieY, s * 0.24, s * 0.08, 5 * u, 0.9, 1, 1 * u, F.acc(0.9));
      const lev = Math.sin(down * 0.9) * 0.0, lvx = cx + s * 0.2 + down * 6 * u;
      pen(g, F.ink(), 3.4 * u); new Pth().M(cx, cy - s * 0.34).L(cx + s * 0.34, cy - s * (0.46 - 0.12 * down)).draw(g, 1);
      g.beginPath(); g.arc(cx + s * 0.34, cy - s * (0.46 - 0.12 * down), 11 * u, 0, TAU); g.fillStyle = F.ink(); g.fill();
      // The sheet and its mark.
      const sheet = new Pth().poly([[cx - s * 0.2, ty], [cx + s * 0.2, ty], [cx + s * 0.17, ty - s * 0.1], [cx - s * 0.23, ty - s * 0.1]], true);
      sheet.fill(g, F.sheet); pen(g, F.ink(), 2.2 * u); sheet.draw(g, 1);
      const mk2 = ph > 0.2 ? clamp(1 - (ph - 0.2) * 0.9) : 0;
      if (mk2 > 0) {
        g.save(); g.globalAlpha = mk2;
        pen(g, F.acc(), 4.5 * u);
        new Pth().M(cx - s * 0.09, ty - s * 0.05).L(cx - s * 0.035, ty - s * 0.015).L(cx + s * 0.1, ty - s * 0.085).draw(g, span(ph, 0.2, 0.3));
        new Pth().E(cx - s * 0.005, ty - s * 0.052, s * 0.15, s * 0.045, 0, TAU, true).draw(g, span(ph, 0.2, 0.36));
        g.restore();
      }
      if (down > 0.95) { pen(g, F.ink(0.6), 1.5 * u); new Pth().M(cx - s * 0.2, ty - s * 0.1).L(cx - s * 0.25, ty - s * 0.13).M(cx + s * 0.2, ty - s * 0.1).L(cx + s * 0.25, ty - s * 0.13).draw(g, 1); }
    }
    g.restore();
  }
  DRAW.process = (F, box, p, d, info) => {
    const { g, u, tall, t } = F, n = d.steps.length;
    const s = tall ? Math.min(box.w * 0.46, (box.h / n) * 0.78) : Math.min(box.w / n * 0.98, box.h * 0.78);
    const beltPos = tall ? box.x + box.w * 0.55 : box.y + box.h * 0.76;
    const cells = [];
    for (let i = 0; i < n; i++) cells.push(tall ? [box.x + box.w * 0.25, box.y + (box.h / n) * (i + 0.5) - 6 * u] : [box.x + (box.w / n) * (i + 0.5), box.y + box.h * 0.27]);
    // Conveyor: rails, turning rollers, chevrons and sheets that travel the length.
    const bq = ease(span(p, 0, 0.4));
    pen(g, F.ink(), 3 * u);
    const along0 = tall ? box.y : box.x, along1 = tall ? box.y + box.h : box.x + box.w;
    const pt = (a, o) => (tall ? [beltPos + o, a] : [a, beltPos + o]);
    for (const o of [-14 * u, 14 * u]) new Pth().M(...pt(along0, o)).L(...pt(along1, o)).draw(g, bq);
    const roll = (along1 - along0) / Math.round((along1 - along0) / (74 * u));
    for (let a = along0 + roll / 2; a < along1; a += roll) {
      if ((a - along0) / (along1 - along0) > bq) break;
      const [rx, ry] = pt(a, 0);
      g.beginPath(); g.arc(rx, ry, 11 * u, 0, TAU); g.fillStyle = F.sheet; g.fill(); pen(g, F.ink(), 2.2 * u); g.stroke();
      const ang = t * 2.4 + a;
      pen(g, F.ink(0.85), 1.6 * u); g.beginPath(); g.moveTo(rx + Math.cos(ang) * 9 * u, ry + Math.sin(ang) * 9 * u); g.lineTo(rx - Math.cos(ang) * 9 * u, ry - Math.sin(ang) * 9 * u); g.stroke();
    }
    if (bq > 0.9) {
      const sp = 95 * u, len = along1 - along0, N = Math.max(4, Math.round(len / (210 * u)));
      for (let k = 0; k < N; k++) {
        const a = along0 + fract((t * sp) / len + k / N) * len, [sx, sy] = pt(a, -24 * u);
        const sw = tall ? 44 * u : 74 * u, sh = tall ? 58 * u : 46 * u;
        const fade = Math.min(1, (a - along0) / (40 * u), (along1 - a) / (40 * u));
        g.save(); g.globalAlpha = clamp(fade);
        g.beginPath(); g.rect(sx - sw / 2, sy - sh / 2, sw, sh); g.fillStyle = F.sheet; g.fill(); pen(g, F.ink(), 2 * u); g.stroke();
        pen(g, F.ink(0.65), 1.2 * u); g.beginPath();
        for (let j = 1; j <= 3; j++) { g.moveTo(sx - sw * 0.34, sy - sh / 2 + (sh * j) / 4); g.lineTo(sx + sw * (j === 3 ? 0.1 : 0.34), sy - sh / 2 + (sh * j) / 4); }
        g.stroke(); g.restore();
      }
      // Chevrons showing the direction of travel.
      pen(g, F.acc(0.9), 3 * u);
      for (let k = 0; k < 5; k++) {
        const a = along0 + fract(t * 0.2 + k / 5) * (along1 - along0), [cx2, cy2] = pt(a, 36 * u), c = 8 * u;
        g.beginPath();
        if (tall) { g.moveTo(cx2 - c, cy2 - c); g.lineTo(cx2, cy2); g.lineTo(cx2 + c, cy2 - c); } else { g.moveTo(cx2 - c, cy2 - c); g.lineTo(cx2, cy2); g.lineTo(cx2 - c, cy2 + c); }
        g.stroke();
      }
    }
    for (let i = 0; i < n; i++) {
      const q = ease(span(p, i * 0.1, 0.38 + i * 0.1)), [cx, cy] = cells[i];
      bench(F, i % 3, cx, cy, s, q, p);
      // Numeral and step name.
      const nq = span(q, 0.5, 1);
      const label = d.steps[i];
      if (!tall) {
        numeral(F, String(10 + i * 2), cx - s * 0.5, cy - s * 0.38, cx - s * 0.3, cy - s * 0.02, nq, { bow: -0.3 });
        say(F, label, cx, box.y + box.h * 0.95, 50 * u, { font: "ital", weight: 600, align: "center", maxW: box.w / n * 0.94, min: 40 * u, q: nq });
        pen(g, F.ink(0.9), 1.8 * u); new Pth().M(cx - box.w / n * 0.4, box.y + box.h * 0.95 + 14 * u).L(cx + box.w / n * 0.4, box.y + box.h * 0.95 + 14 * u).draw(g, nq);
        say(F, String(i + 1).padStart(2, "0"), cx - box.w / n * 0.4, box.y + box.h * 0.95 - 54 * u, 40 * u, { font: "disp", color: F.acc(), q: nq });
      } else {
        const lx = box.x + box.w * 0.64;
        numeral(F, String(10 + i * 2), cx - s * 0.5, cy - s * 0.35, cx - s * 0.3, cy - s * 0.02, nq, { bow: -0.3 });
        say(F, String(i + 1).padStart(2, "0"), lx, cy - 34 * u, 44 * u, { font: "disp", color: F.acc(), q: nq });
        say(F, label, lx, cy + 22 * u, 50 * u, { font: "ital", weight: 600, maxW: box.x + box.w - lx, min: 38 * u, q: nq });
        pen(g, F.ink(0.9), 1.8 * u); new Pth().M(lx, cy + 36 * u).L(box.x + box.w, cy + 36 * u).draw(g, nq);
      }
    }
  };

  // Compare: a beam balance. The beam swings to rest by the two values and keeps a slow sway; weights drop on.
  function weights(F, cx, y, w, count, q, hot) {
    const { g, u } = F;
    const rows = [];
    let left = count, row = 0;
    while (left > 0) { const per = Math.min(left, Math.max(1, 3 - row)); rows.push(per); left -= per; row++; }
    const dw = w * 0.3, dh = w * 0.1;
    let k = 0;
    rows.forEach((per, r) => {
      for (let j = 0; j < per; j++, k++) {
        const kq = ease(span(q * (count + 2) - k, 0, 1.1));
        if (kq <= 0) continue;
        const x = cx + (j - (per - 1) / 2) * dw * 1.05, yy = y - r * dh * 1.5 - dh * 0.5 - (1 - kq) * 90 * u + (kq < 1 ? 0 : 0);
        const body = new Pth().M(x - dw / 2, yy).L(x - dw / 2, yy - dh).E(x, yy - dh, dw / 2, dh * 0.34, Math.PI, 0, false).L(x + dw / 2, yy).E(x, yy, dw / 2, dh * 0.34, 0, Math.PI, false).Z();
        body.fill(g, F.sheet); pen(g, F.ink(), 2.6 * u); body.draw(g, 1);
        new Pth().E(x, yy - dh, dw / 2, dh * 0.34, 0, TAU, true).draw(g, 1);
        shade(g, F, body, x - dw * 0.1, yy - dh * 1.4, dw * 0.6, dh * 1.8, 5 * u, Math.PI / 2, 1, 1 * u, hot ? F.acc(0.95) : F.ink(0.85), 0.35);
        pen(g, F.ink(0.9), 1.4 * u); g.beginPath(); g.arc(x, yy - dh, dh * 0.12, 0, TAU); g.stroke();
      }
    });
  }
  DRAW.compare = (F, box, p, d, info) => {
    const { g, u, tall, t } = F, mx = Math.max(d.leftValue, d.rightValue, 1);
    const cx = box.x + box.w / 2, py = box.y + box.h * 0.2, Lb = Math.min(box.w * (tall ? 0.37 : 0.31), 520 * u), Lc = box.h * (tall ? 0.26 : 0.3);
    const groundY = box.y + box.h * (tall ? 0.7 : 0.7);
    const target = clamp(((d.rightValue - d.leftValue) / mx) * 0.9, -0.9, 0.9) * 0.24;
    const local = info.local, s = Math.max(0, local - 0.55);
    const theta = target * (1 - Math.exp(-3.4 * s) * Math.cos(8.2 * s)) + Math.sin(t * 1.4) * 0.011 * clamp(s * 2) * 1;
    // Pillar, foot and column details.
    const pq = ease(span(p, 0, 0.35));
    const col = new Pth().poly([[cx - 22 * u, groundY], [cx - 11 * u, py + 26 * u], [cx + 11 * u, py + 26 * u], [cx + 22 * u, groundY]], true);
    col.fill(g, F.sheet, pq * 1.6 - 0.3); pen(g, F.ink(), 3.2 * u); col.draw(g, pq);
    shade(g, F, col, cx - 22 * u, py, 44 * u, groundY - py, 6 * u, Math.PI / 2, pq, 1.1 * u, F.ink(0.85), 0.3);
    const foot = new Pth().poly([[cx - Lb * 0.34, groundY], [cx - Lb * 0.24, groundY - 30 * u], [cx + Lb * 0.24, groundY - 30 * u], [cx + Lb * 0.34, groundY]], true);
    foot.fill(g, F.sheet, pq * 1.6 - 0.3); pen(g, F.ink(), 3.2 * u); foot.draw(g, pq);
    shade(g, F, foot, cx - Lb * 0.34, groundY - 30 * u, Lb * 0.68, 30 * u, 6 * u, 1.0, pq, 1.1 * u, F.ink(0.85));
    ground(F, box.x, box.x + box.w, groundY, pq);
    // Graduated arc behind the beam with the needle riding it.
    const arcR = Lb * 0.34;
    pen(g, F.ink(0.9), 1.6 * u);
    const grad = new Pth();
    for (let k = -8; k <= 8; k++) { const a = Math.PI / 2 + k * 0.045, r1 = arcR + (k % 4 === 0 ? 0 : 10 * u), r2 = arcR + 22 * u; grad.M(cx + Math.cos(a) * r1, py + Math.sin(a) * r1).L(cx + Math.cos(a) * r2, py + Math.sin(a) * r2); }
    grad.draw(g, span(p, 0.1, 0.5));
    new Pth().A(cx, py, arcR + 22 * u, Math.PI / 2 - 0.36, Math.PI / 2 + 0.36, true).draw(g, span(p, 0.1, 0.5));
    // Beam.
    const bq = ease(span(p, 0.04, 0.4));
    g.save(); g.translate(cx, py); g.rotate(theta);
    const beam = new Pth().M(-Lb, 0).C(-Lb * 0.6, -26 * u, -Lb * 0.2, -22 * u, 0, -22 * u).C(Lb * 0.2, -22 * u, Lb * 0.6, -26 * u, Lb, 0).C(Lb * 0.6, 12 * u, Lb * 0.2, 14 * u, 0, 14 * u).C(-Lb * 0.2, 14 * u, -Lb * 0.6, 12 * u, -Lb, 0);
    beam.fill(g, F.sheet, bq * 1.6 - 0.3); pen(g, F.ink(), 3.2 * u); beam.draw(g, bq);
    shade(g, F, beam, -Lb, -26 * u, Lb * 2, 42 * u, 6 * u, 0.9, bq, 1.1 * u, F.ink(0.85));
    for (const sg of [-1, 1]) { g.beginPath(); g.arc(sg * Lb, 0, 11 * u, 0, TAU); g.fillStyle = F.sheet; g.fill(); pen(g, F.ink(), 3 * u); g.stroke(); }
    // Needle rides the arc below the pivot.
    pen(g, F.ink(), 3 * u); new Pth().M(0, 0).L(0, arcR + 16 * u).draw(g, bq);
    g.restore();
    g.beginPath(); g.arc(cx, py, 15 * u, 0, TAU); g.fillStyle = F.sheet; g.fill(); pen(g, F.ink(), 3.4 * u); g.stroke();
    g.beginPath(); g.arc(cx, py, 5 * u, 0, TAU); g.fillStyle = F.ink(); g.fill();
    // Pans with chains, plumb lines, weights and the big figures.
    [[-1, d.left, d.leftValue, false], [1, d.right, d.rightValue, true]].forEach(([sg, label, value, hot], i) => {
      const ex = cx + sg * Lb * Math.cos(theta), ey = py + sg * Lb * Math.sin(theta);
      const q = ease(span(p, 0.12 + i * 0.1, 0.55 + i * 0.1)), pw = Lb * 0.74, py2 = ey + Lc;
      pen(g, F.ink(0.95), 1.9 * u);
      new Pth().M(ex, ey).L(ex - pw / 2, py2).M(ex, ey).L(ex, py2 - 4 * u).M(ex, ey).L(ex + pw / 2, py2).draw(g, q);
      g.beginPath(); g.arc(ex, ey + 22 * u, 5 * u, 0, TAU); g.stroke();
      const pan = new Pth().M(ex - pw / 2, py2).L(ex + pw / 2, py2).C(ex + pw * 0.42, py2 + pw * 0.19, ex - pw * 0.42, py2 + pw * 0.19, ex - pw / 2, py2);
      weights(F, ex, py2 - 2 * u, pw, clamp(Math.round((value / mx) * 6), 1, 7), q, hot);
      pan.fill(g, F.sheet, q * 1.6 - 0.3); pen(g, F.ink(), 3.2 * u); pan.draw(g, q);
      shade(g, F, pan, ex - pw / 2, py2, pw, pw * 0.2, 5 * u, 0.9, q, 1.1 * u, F.ink(0.85));
      pen(g, F.ink(), 2.4 * u); new Pth().E(ex, py2, pw / 2, 6 * u, 0, TAU, true).draw(g, q);
      // Plumb line to the plaque, and the plaque itself.
      const lx = box.x + box.w / 2 + sg * Lb;
      pen(g, F.ink(0.6), 1.3 * u, [3 * u, 8 * u]); new Pth().M(ex, py2 + pw * 0.19 + 6 * u).L(lx, box.y + box.h * 0.8 - 52 * u).draw(g, q);
      g.setLineDash([]);
      say(F, label, lx, box.y + box.h * 0.8, 48 * u, { font: "ital", weight: 600, align: "center", color: hot ? F.acc() : F.ink(), maxW: Lb * 1.2, min: 36 * u, q: span(q, 0.55, 0.9) });
      const nq = span(q, 0.55, 1);
      if (nq > 0) say(F, tally(value, ease(nq), d), lx, box.y + box.h * 0.96, 112 * u, { font: "disp", align: "center", color: hot ? F.acc() : F.ink(), maxW: Lb * 1.3, min: 80 * u });
    });
    numeral(F, "50", cx - arcR * 2.4, py - 70 * u, cx - 10 * u, py - 10 * u, span(p, 0.5, 0.9), { bow: 0.3 });
    numeral(F, "52", cx + Lb * 0.78, groundY - 120 * u, cx + Lb * 0.2, groundY - 20 * u, span(p, 0.6, 1), { bow: -0.3 });
  };

  // Every drawer: a leaving drawing is erased behind the shield; the next one appears behind it.
  const scene = (id) => (ctx, S, box, p, d, info) => {
    const F = mk(ctx, S, info);
    F.info = info;
    p = 0.12 + 0.88 * p;
    const leaving = info.exit !== undefined, entering = !leaving && info.t - info.local > 0.01 && info.local < info.change;
    if (leaving) {
      ctx.save(); clipSide(F, box, info.exit, true);
      DRAW[id](F, box, 1, d, info);
      ctx.restore();
      shield(F, box, info.exit);
    } else if (entering) {
      ctx.save(); clipSide(F, box, info.local / Math.max(0.01, info.change), false);
      DRAW[id](F, box, p, d, info);
      ctx.restore();
    } else DRAW[id](F, box, p, d, info);
  };

  // The stage keeps the sheet, border and caption up under every scene, and draws the title and closing art.
  function stage(ctx, S, info) {
    const F = mk(ctx, S, info), { W, H, u } = S;
    const box = S.tall ? { x: 90 * u, y: H * 0.3, w: W - 180 * u, h: H * 0.6 } : { x: 140 * u, y: H * 0.34, w: W - 280 * u, h: H * 0.58 };
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (S.paint) {
      ctx.drawImage(paperBase(S), 0, 0);
      flecks(F);
    }
    const sc = info.scene, hasNext = !!info.next;
    const tc = ctl();
    const titleHold = Number(tc.title_hold) || 0;
    if (S.paint) chrome(F);
    // Title art; it is erased by the shield when the next scene begins.
    const entering = info.index > 0 && info.local < info.change;
    if (sc === "title") {
      ctx.save();
      titleDecor(F, info.local);
      ctx.restore();
    } else if (sc === "closing") {
      ctx.save();
      if (entering) clipSide(F, box, info.local / Math.max(0.01, info.change), false);
      closingDecor(F, info.local);
      ctx.restore();
    } else if (HEAD[sc]) {
      const fade = hasNext ? 1 - span(info.local, info.hold - info.change, info.hold) : 1;
      if (S.paint) scaffold(F, box, sc, fade);
      if (info.index === 1 && titleHold > 0 && entering) {
        // The title plate is still up while the shield passes.
        ctx.save(); clipSide(F, box, info.local / Math.max(0.01, info.change), true);
        titleDecor(F, titleHold + info.local);
        ctx.restore();
        shield(F, box, info.local / Math.max(0.01, info.change));
      }
    }
    ctx.restore();
  }

  const PAPER = {
    paper: "#e6d6a7", stain: "112,78,30", lite: "255,245,212", fiber: "110,80,35", fox: "140,86,30", vig: 0.3, metal: "#c9c0a8",
  };
  const halo = () => "0 0 1px rgba(70,45,10,0.4)";
  return {
    bg: "#e6d6a7", panel: "rgba(80,50,10,0.05)", ink: "#211b13", muted: "#6a5c45", accent: "#a1281f", onAccent: "#f4ead0",
    rule: "rgba(33,27,19,0.8)", track: "rgba(33,27,19,0.08)",
    display: SERIF, displayWeight: 700, displayCase: "uppercase", displayTracking: "0.05em",
    body: BODY, bodyWeight: 500, figures: SERIF, radius: 0,
    motion: "stroke", change: "grid", kit: { line: 2.4, fill: "none", panel: "outline", dims: true, hatch: true },
    panelEdge: "rgba(33,27,19,0.6)",
    tone: PAPER,
    keepArt: true, overlap: true,
    palettes: {
      // Clean copy: crisp black ink on pale stock. Night print: cream ink on a dark sheet. Carbon: pencil grey.
      light: { bg: "#f0ead9", ink: "#1b1a17", muted: "#625d50", accent: "#b3261e", rule: "rgba(27,26,23,0.8)", backdrop: () => "#f0ead9",
        tone: { ...PAPER, paper: "#f0ead9", stain: "120,100,60", lite: "255,252,240", fox: "150,110,50", vig: 0.14, metal: "#d6d0c0" } },
      dark: { bg: "#18140e", panel: "rgba(240,225,180,0.05)", ink: "#efe2c0", muted: "#a2967a", accent: "#ff8a5c", onAccent: "#18140e", rule: "rgba(239,226,192,0.8)", track: "rgba(239,226,192,0.1)", panelEdge: "rgba(239,226,192,0.6)", backdrop: () => "#18140e",
        textShadow: () => "none",
        tone: { ...PAPER, paper: "#18140e", stain: "0,0,0", lite: "255,225,160", fiber: "230,210,160", fox: "200,150,70", vig: 0.45, metal: "#3a3328" } },
      mono: { bg: "#e7e7e3", ink: "#222222", muted: "#68685f", accent: "#3b3b3b", onAccent: "#e7e7e3", rule: "rgba(34,34,34,0.8)", panelEdge: "rgba(34,34,34,0.6)", backdrop: () => "#e7e7e3",
        tone: { ...PAPER, paper: "#e7e7e3", stain: "70,70,70", lite: "255,255,255", fiber: "90,90,90", fox: "100,100,100", vig: 0.16, metal: "#cfcfcb" } },
    },
    textShadow: halo,
    backdrop: (accent, texture, look) => look.tone.paper,
    css: (accent) => `
      .kicker { font-family: ${BODY}; font-style: italic; font-weight: 500; text-transform: none; letter-spacing: 0.05em; }
      .display { font-kerning: normal; font-feature-settings: "kern", "liga"; }
    `,
    // A thin pass over the whole frame: ageing at the corners, a lamp glint drifting across and film grain.
    paintOver: true,
    paint(ctx, W, H, t, accent, look) {
      ctx.clearRect(0, 0, W, H);
      const T = look.tone;
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      vg.addColorStop(0, `rgba(${T.stain},0)`); vg.addColorStop(1, `rgba(${T.stain},${T.vig})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W / 2, H / 2); ctx.rotate(0.5);
      const reach = Math.hypot(W, H), pos = (fract(t * 0.045) * 1.6 - 0.8) * reach;
      const gl = ctx.createLinearGradient(pos - reach * 0.12, 0, pos + reach * 0.12, 0);
      gl.addColorStop(0, `rgba(${T.lite},0)`); gl.addColorStop(0.5, `rgba(${T.lite},0.11)`); gl.addColorStop(1, `rgba(${T.lite},0)`);
      ctx.fillStyle = gl; ctx.fillRect(pos - reach * 0.12, -reach, reach * 0.24, reach * 2);
      ctx.restore();
      ctx.save();
      const f = Math.floor(t * 8);
      ctx.translate((f * 71) % 256, (f * 133) % 256);
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = ctx.createPattern(grainTile(), "repeat");
      ctx.fillRect(-256, -256, W + 512, H + 512);
      ctx.restore();
    },
    stage,
    scenes: { chart: scene("chart"), object: scene("object"), people: scene("people"), process: scene("process"), compare: scene("compare") },
  };
});
