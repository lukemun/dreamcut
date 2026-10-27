// Proof: a mathematician's lit board. Pure black, thin bright strokes, italic serif statements and a
// restrained five-colour palette; outlines draw on, then the fill floods in. On the illustrated
// explainer every scene lives on one endless coordinate plane that pans (and briefly shears, like a
// linear map) between scenes; each idea is drawn as a small theorem: axes and fitted curves, a device
// in line-art, a graph of people, a commuting diagram and a number line with braces. A clock axis
// runs along the foot of the frame. All drawings are original. Frames are pure functions of time.
window.DreamcutMotion.register("proof", ({ hexA, rng }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const span = (v, a, b) => clamp((v - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const SERIF = "'Iowan Old Style', Palatino, 'Palatino Linotype', 'Book Antiqua', Georgia, serif";
  const col = (c, a) => (String(c)[0] === "#" && a !== undefined ? hexA(c, a) : c);

  // ---- paths that can be drawn part-way ------------------------------------------------------------
  class Ln {
    constructor() { this.s = []; this.c = null; this.n = -1; }
    M(x, y) { this.c = [x, y]; this.s.push(this.c); return this; }
    L(x, y) { if (!this.c) return this.M(x, y); this.c.push(x, y); return this; }
    Z() { if (this.c && this.c.length > 2) this.c.push(this.c[0], this.c[1]); return this; }
    Q(cx, cy, x, y, steps = 18) {
      const [x0, y0] = this.c.slice(-2);
      for (let i = 1; i <= steps; i++) { const k = i / steps, a = (1 - k) * (1 - k), b = 2 * k * (1 - k), c = k * k; this.L(a * x0 + b * cx + c * x, a * y0 + b * cy + c * y); }
      return this;
    }
    C(c1x, c1y, c2x, c2y, x, y, steps = 24) {
      const [x0, y0] = this.c.slice(-2);
      for (let i = 1; i <= steps; i++) {
        const k = i / steps, m = 1 - k;
        this.L(m * m * m * x0 + 3 * m * m * k * c1x + 3 * m * k * k * c2x + k * k * k * x, m * m * m * y0 + 3 * m * m * k * c1y + 3 * m * k * k * c2y + k * k * k * y);
      }
      return this;
    }
    A(cx, cy, r, a0, a1, move) {
      const steps = Math.max(8, Math.ceil(Math.abs(a1 - a0) * r / 5));
      for (let i = 0; i <= steps; i++) { const a = a0 + ((a1 - a0) * i) / steps, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; if (i === 0 && (move || !this.c)) this.M(x, y); else this.L(x, y); }
      return this;
    }
    O(cx, cy, r) { return this.A(cx, cy, r, -Math.PI / 2, Math.PI * 1.5, true); }
    R(x, y, w, h) { return this.M(x, y).L(x + w, y).L(x + w, y + h).L(x, y + h).Z(); }
    RR(x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      this.M(x + r, y).L(x + w - r, y).A(x + w - r, y + r, r, -Math.PI / 2, 0).L(x + w, y + h - r).A(x + w - r, y + h - r, r, 0, Math.PI / 2);
      return this.L(x + r, y + h).A(x + r, y + h - r, r, Math.PI / 2, Math.PI).L(x, y + r).A(x + r, y + r, r, Math.PI, Math.PI * 1.5);
    }
    pts(list) { list.forEach(([x, y], i) => (i ? this.L(x, y) : this.M(x, y))); return this; }
    trace(g) { for (const s of this.s) { g.moveTo(s[0], s[1]); for (let i = 2; i < s.length; i += 2) g.lineTo(s[i], s[i + 1]); } }
    len() {
      if (this.n >= 0) return this.n;
      let n = 0;
      for (const s of this.s) for (let i = 2; i < s.length; i += 2) n += Math.hypot(s[i] - s[i - 2], s[i + 1] - s[i - 1]);
      return (this.n = n);
    }
    // The point and heading a fraction q along the whole path.
    at(q) {
      let left = this.len() * clamp(q), last = [0, 0, 0];
      for (const s of this.s) for (let i = 2; i < s.length; i += 2) {
        const dx = s[i] - s[i - 2], dy = s[i + 1] - s[i - 1], d = Math.hypot(dx, dy);
        if (d <= 0) continue;
        last = [s[i], s[i + 1], Math.atan2(dy, dx)];
        if (d >= left) { const k = left / d; return [s[i - 2] + dx * k, s[i - 1] + dy * k, Math.atan2(dy, dx)]; }
        left -= d;
      }
      return last;
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
  }
  const pen = (g, color, w, dash, off = 0) => { g.strokeStyle = color; g.lineWidth = w; g.setLineDash(dash || []); g.lineDashOffset = off; g.lineCap = "round"; g.lineJoin = "round"; };
  // Fill a closed path with a translucent flood that rises from its foot as q runs.
  function flood(g, path, box, q, color, alpha) {
    if (q <= 0) return;
    g.save();
    g.beginPath(); path.trace(g); g.clip();
    g.globalAlpha *= alpha;
    g.fillStyle = color;
    g.fillRect(box.x - 2, box.y + box.h * (1 - q) - 2, box.w + 4, box.h * q + 4);
    g.restore();
  }
  function dot(g, x, y, r, color) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = color; g.fill(); }
  function tip(g, x, y, ang, size, color) {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-size, -size * 0.42); g.lineTo(-size * 0.78, 0); g.lineTo(-size, size * 0.42); g.closePath();
    g.fillStyle = color; g.fill(); g.restore();
  }
  // An arrow along a path: the shaft draws on and the head rides its leading end.
  function arrow(g, F, path, q, color, w) {
    if (q <= 0) return;
    pen(g, color, w || 2.6 * F.u);
    path.draw(g, q);
    const [x, y, a] = path.at(q);
    tip(g, x, y, a, 18 * F.u, color);
  }

  // ---- lettering -----------------------------------------------------------------------------------
  function font(size, italic, weight) { return `${italic ? "italic " : ""}${weight || 400} ${size}px ${SERIF}`; }
  function measure(g, s, size, italic = true, weight) { g.font = font(size, italic, weight); return g.measureText(String(s ?? "")).width; }
  // Writing: the outline is traced left to right, then the ink fills in behind it.
  function write(g, F, s, x, y, size, o = {}) {
    s = String(s ?? "");
    const q = o.q ?? 1, italic = o.italic ?? true;
    if (!s) return { w: 0, size };
    let w = measure(g, s, size, italic, o.weight);
    if (o.maxW && w > o.maxW) { size = Math.max(o.min || size * 0.7, (size * o.maxW) / w); w = measure(g, s, size, italic, o.weight); }
    if (q <= 0) return { w, size };
    // Inside a shrunk echo, small lettering fades out (it would be too small to read); big numbers stay.
    const fade = textFade(F, size);
    if (fade <= 0) return { w, size };
    const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    g.save();
    g.globalAlpha *= fade;
    g.font = font(size, italic, o.weight);
    g.textAlign = "left"; g.textBaseline = o.base || "alphabetic";
    g.setLineDash([]);
    const color = o.color || F.th.ink;
    if (q >= 1) { g.fillStyle = color; g.fillText(s, x0, y); g.restore(); return { w, size, x: x0 }; }
    const a = clamp(q * 1.45), b = clamp(q * 1.45 - 0.45), pad = size;
    g.save(); g.beginPath(); g.rect(x0 - pad * 0.2, y - pad * 2, w * a + pad * 0.2, pad * 4); g.clip();
    g.strokeStyle = color; g.lineWidth = Math.max(1, size * 0.028); g.lineJoin = "round"; g.strokeText(s, x0, y);
    g.restore();
    if (b > 0) { g.beginPath(); g.rect(x0 - pad * 0.2, y - pad * 2, w * b + pad * 0.2, pad * 4); g.clip(); g.fillStyle = color; g.fillText(s, x0, y); }
    g.restore();
    return { w, size, x: x0 };
  }
  function fmt(v, suffix = "", decimals = 0) {
    const fixed = Math.abs(v).toFixed(decimals);
    const [whole, frac] = fixed.split(".");
    return (v < -0.0001 ? "−" : "") + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (frac ? "." + frac : "") + (suffix || "");
  }
  function nice(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9)))), m = raw / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }

  // ---- marks of the medium -------------------------------------------------------------------------
  // A curly brace from (x1,y1) to (x2,y2), bulging to the left of that direction; it grows from its tip.
  function brace(g, F, x1, y1, x2, y2, q, color, depth) {
    if (q <= 0) return null;
    const L = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / L, uy = (y2 - y1) / L, nx = -uy, ny = ux;
    const h = depth || 20 * F.u, half = L / 2, r = Math.min(h * 0.9, half * 0.45);
    const P = (s, d) => [x1 + ux * s + nx * d, y1 + uy * s + ny * d];
    const leftArm = new Ln().M(...P(half, h)).Q(...P(half, h * 0.5), ...P(half - r, h * 0.5)).L(...P(r, h * 0.5)).Q(...P(0, h * 0.5), ...P(0, 0));
    const rightArm = new Ln().M(...P(half, h)).Q(...P(half, h * 0.5), ...P(half + r, h * 0.5)).L(...P(L - r, h * 0.5)).Q(...P(L, h * 0.5), ...P(L, 0));
    pen(g, color, 2.4 * F.u);
    leftArm.draw(g, q); rightArm.draw(g, q);
    return P(half, h + 14 * F.u);
  }
  // A box drawn around a region, starting at its top-left corner.
  // How visible lettering of this size is right now (small lettering fades inside a shrunk echo).
  const textFade = (F, size) => (F.minText && size < F.minText ? F.smallFade ?? 0 : 1);
  // textSize: the box frames lettering of that size, so it fades with it.
  function surround(g, F, x, y, w, h, q, color, lw, textSize) {
    const a = textSize ? textFade(F, textSize) : 1;
    if (q <= 0 || a <= 0) return;
    g.save(); g.globalAlpha *= a;
    pen(g, color, lw || 2.6 * F.u);
    new Ln().R(x, y, w, h).draw(g, q);
    g.restore();
  }
  // A growing ring that marks a point for a moment.
  function ping(g, F, x, y, r0, k, color) {
    if (k <= 0 || k >= 1) return;
    pen(g, col(color, 0.9 * (1 - k)), 2.2 * F.u);
    g.beginPath(); g.arc(x, y, r0 + 34 * F.u * eo(k), 0, TAU); g.stroke();
  }
  // Axes with arrowheads, drawn on together.
  function axes(g, F, ox, oy, x1, y1, q, color) {
    const { u } = F;
    const X = new Ln().M(ox - 12 * u, oy).L(x1, oy), Y = new Ln().M(ox, oy + 12 * u).L(ox, y1);
    arrow(g, F, X, q, color, 2.2 * u);
    arrow(g, F, Y, q, color, 2.2 * u);
  }
  // A smooth curve through points (Catmull-Rom), as a path.
  function smooth(pts, steps = 16) {
    const P = new Ln();
    if (pts.length < 2) return P;
    P.M(pts[0][0], pts[0][1]);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let k = 1; k <= steps; k++) {
        const t = k / steps, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        P.L(f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]));
      }
    }
    return P;
  }

  // ---- layout read from the page --------------------------------------------------------------------
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
  function bounds(lines) {
    if (!lines.length) return null;
    const x = Math.min(...lines.map((l) => l.x)), y = Math.min(...lines.map((l) => l.y));
    return { x, y, w: Math.max(...lines.map((l) => l.x + l.w)) - x, h: Math.max(...lines.map((l) => l.y + l.h)) - y };
  }
  function boxOf(F) {
    const { W, H, u, tall } = F, side = (tall ? 90 : 140) * u;
    return tall ? { x: side, y: H * 0.3, w: W - side * 2, h: H * 0.6 } : { x: side, y: H * 0.34, w: W - side * 2, h: H * 0.58 };
  }
  // The drawing area: from just under the measured headline to above the clock axis.
  function areaOf(F, id) {
    const b = boxOf(F), r = bounds(headLines(`${id}-title`));
    const foot = F.H - (F.tall ? 150 : 96) * F.u;
    const top = r ? Math.min(b.y, Math.max(r.y + r.h + (F.tall ? 80 : 56) * F.u, F.H * 0.2)) : b.y;
    return { x: b.x, y: top, w: b.w, h: foot - top };
  }

  // ---- the plan -------------------------------------------------------------------------------------
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  let planCache = null;
  function controls() {
    if (window.__dreamcut && window.__dreamcut.controls) return window.__dreamcut.controls;
    try { if (typeof dc !== "undefined" && dc && dc.controls) return dc.controls; } catch (e) { /* not on this page */ }
    return null;
  }
  function planOf() {
    if (planCache) return planCache;
    const c = controls() || {};
    let t = 0;
    const shown = [];
    for (const id of ORDER) { const hold = Number(c[`${id}_hold`]) || 0; if (hold > 0) shown.push({ id, start: t, hold }); t += hold; }
    return (planCache = { shown, length: t, change: Number(c.change) || 0.45, entrance: Number(c.entrance) || 0.7, backdrop: c.backdrop !== false });
  }
  // The same data the template hands each scene, rebuilt from the controls so any frame can draw any scene.
  function dataOf(id) {
    const c = controls() || {};
    if (id === "chart") return { labels: [c.bar_1_label, c.bar_2_label, c.bar_3_label, c.bar_4_label], values: [c.bar_1, c.bar_2, c.bar_3, c.bar_4], suffix: c.chart_suffix, highlight: Number(c.highlight) - 1 };
    if (id === "object") return { kind: c.device, callouts: [c.callout_1, c.callout_2, c.callout_3] };
    if (id === "people") return { count: c.people_count, badges: [c.badge_1, c.badge_2, c.badge_3], highlight: 1 };
    if (id === "process") return { steps: [c.step_1, c.step_2, c.step_3] };
    return { left: c.before_label, leftValue: c.before_value, right: c.after_label, rightValue: c.after_value, suffix: c.compare_suffix };
  }
  // The headline's own box (not its lines): the reveal sweeps across this width.
  function elBox(id) {
    const el = document.getElementById(id), root = document.getElementById("root");
    if (!el || !root) return null;
    let x = 0, y = 0;
    for (let n = el; n && n !== root; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
  }
  // A pen nib rides the front of each headline's reveal: a bright point with a short fading trail on every
  // line it is crossing. The reveal timing mirrors the template's stroke arrival.
  function nibs(g, F) {
    const { u, th, t, plan } = F, e = plan.entrance, dur = e * 0.8;
    for (const st of plan.shown) {
      const ids = st.id === "title" ? ["title"] : st.id === "closing" ? ["closing"] : [`${st.id}-title`];
      const t0 = st.start + (st.id === "title" ? 0.12 : 0);
      const k = (t - t0) / dur;
      if (k <= 0 || k >= 1) continue;
      const p = k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k);
      for (const id of ids) {
        const b = elBox(id);
        if (!b) continue;
        const fx = b.x - b.w * 0.02 + b.w * 1.02 * p;
        headLines(id).forEach((ln, j) => {
          if (fx < ln.x || fx > ln.x + ln.w + 20 * u) return;
          const y = ln.y + ln.h * 0.62 + Math.sin(t * 40 + j) * ln.h * 0.12;
          const gr = g.createLinearGradient(fx - 120 * u, 0, fx, 0);
          gr.addColorStop(0, col(th.hues[1], 0)); gr.addColorStop(1, col(th.hues[1], 0.9));
          g.save();
          pen(g, gr, 3 * u); g.strokeStyle = gr;
          g.beginPath(); g.moveTo(fx - 120 * u, ln.y + ln.h * 0.9); g.lineTo(fx, ln.y + ln.h * 0.9); g.stroke();
          g.globalAlpha *= 0.35; dot(g, fx, y, 22 * u, th.hues[1]); g.globalAlpha /= 0.35;
          dot(g, fx, y, 7 * u, th.chalk);
          g.restore();
        });
      }
    }
  }

  // ---- theme ----------------------------------------------------------------------------------------
  function theme(S) {
    const L = S.look, hues = (L.hues || ["#5bc0e8", "#f4d35e", "#8fd694", "#ff7a6b", "#c7a6ff"]).slice();
    hues[0] = S.accent;
    return { ink: L.ink, muted: L.muted, bg: L.bg, hues, grid: L.gridTone || "#5bc0e8", vignette: L.vignette ?? 0.5, tex: L.texture ?? 1, chalk: L.chalk || "#ffffff" };
  }

  // ---- the world ------------------------------------------------------------------------------------
  // The plane pans one stride at every scene change and shears briefly, like a matrix being applied.
  function camera(F) {
    const P = F.plan, t = F.t, ch = Math.max(0.2, P.change);
    let x = 16 * F.u * t, shear = 0;
    P.shown.forEach((st, i) => {
      if (i === 0) return;
      const k = eio((t - (st.start - ch)) / (ch * 1.7));
      x += 300 * F.u * k;
      shear += 0.16 * Math.sin(Math.PI * k);
    });
    return { x, y: 7 * F.u * Math.sin(t * 0.35), shear };
  }
  function plane(g, F) {
    const { W, H, u, th, cam } = F;
    const vis = 0.4 + 0.6 * th.tex;
    g.save();
    g.setTransform(1, 0, cam.shear, 1, -cam.shear * H * 0.5, 0);
    const minor = 60 * u, x0 = -H * 0.4, x1 = W + H * 0.4;
    for (const major of [false, true]) {
      const s = major ? minor * 4 : minor;
      g.beginPath();
      for (let x = Math.floor((x0 + cam.x) / s) * s - cam.x; x < x1; x += s) {
        if (!major && Math.round((x + cam.x) / minor) % 4 === 0) continue;
        g.moveTo(x, -10); g.lineTo(x, H + 10);
      }
      for (let y = Math.floor((-10 + cam.y) / s) * s - cam.y; y < H + 10; y += s) {
        if (!major && Math.round((y + cam.y) / minor) % 4 === 0) continue;
        g.moveTo(x0, y); g.lineTo(x1, y);
      }
      pen(g, col(th.grid, (major ? 0.16 : 0.07) * vis), (major ? 1.4 : 1) * u);
      g.stroke();
    }
    // The axes of the plane: the vertical one passes by as the camera pans.
    const ay = H * 0.5 - cam.y + minor * 2, period = minor * 4 * 9;
    pen(g, col(th.ink, 0.2 * vis), 1.6 * u);
    g.beginPath(); g.moveTo(x0, ay); g.lineTo(x1, ay); g.stroke();
    for (let ax = Math.floor((x0 + cam.x) / period) * period - cam.x; ax < x1; ax += period) {
      g.beginPath(); g.moveTo(ax, -10); g.lineTo(ax, H + 10); g.stroke();
      for (let k = 1; k < 9; k++) {
        const tx = ax + k * minor * 4;
        g.beginPath(); g.moveTo(tx, ay - 7 * u); g.lineTo(tx, ay + 7 * u); g.stroke();
      }
    }
    g.restore();
  }
  // Symbols drifting up the side margins, faint, each slowly turning.
  const GLYPHS = ["∫", "∑", "∂", "π", "∞", "Δ", "λ", "θ", "∇", "≡", "√", "φ"];
  function margins(g, F) {
    const { W, H, u, th, t, tall } = F;
    const r = rng(37), side = (tall ? 90 : 140) * u, n = tall ? 6 : 8;
    g.save();
    g.textAlign = "center"; g.textBaseline = "middle";
    for (let i = 0; i < n; i++) {
      const left = i % 2 === 0, x = left ? side * (0.25 + r() * 0.45) : W - side * (0.25 + r() * 0.45);
      const speed = (18 + r() * 16) * u, y0 = r() * (H + 200 * u), y = ((((y0 - speed * t) % (H + 200 * u)) + H + 200 * u) % (H + 200 * u)) - 100 * u;
      const size = (tall ? 38 : 46) * u * (0.8 + r() * 0.4), a = 0.16 * th.tex * clamp(Math.min(y + 100 * u, H + 100 * u - y) / (200 * u));
      g.save(); g.translate(x, y); g.rotate(Math.sin(t * 0.4 + i) * 0.25);
      g.font = font(size, true); g.fillStyle = col(th.hues[i % 5], a); g.fillText(GLYPHS[(i * 5) % GLYPHS.length], 0, 0);
      g.restore();
    }
    g.restore();
  }
  // The clock: a number line along the foot of the frame, a tick per second and a dot riding at t.
  function clock(g, F) {
    const { W, H, u, th, t, tall, plan } = F;
    const side = (tall ? 90 : 140) * u, y = H - (tall ? 70 : 42) * u, len = Math.max(0.1, plan.length);
    const xAt = (s) => side + (W - side * 2) * (s / len);
    g.save();
    pen(g, col(th.ink, 0.32), 1.5 * u);
    g.beginPath(); g.moveTo(side, y); g.lineTo(W - side, y);
    for (let s = 0; s <= len + 0.001; s += 1) { g.moveTo(xAt(s), y - 6 * u); g.lineTo(xAt(s), y + 6 * u); }
    g.stroke();
    plan.shown.forEach((st, i) => {
      if (i === 0) return;
      pen(g, col(th.hues[1], 0.55), 2 * u);
      g.beginPath(); g.moveTo(xAt(st.start), y - 14 * u); g.lineTo(xAt(st.start), y + 14 * u); g.stroke();
    });
    const x = xAt(clamp(t, 0, len));
    pen(g, col(th.hues[0], 0.8), 2.4 * u);
    g.beginPath(); g.moveTo(side, y); g.lineTo(x, y); g.stroke();
    dot(g, x, y, 7 * u, th.hues[0]);
    g.font = font(32 * u, true); g.fillStyle = col(th.ink, 0.8); g.textBaseline = "bottom";
    const label = `t = ${t.toFixed(2)}`;
    const lw = g.measureText(label).width;
    g.textAlign = "left";
    g.fillText(label, clamp(x - lw / 2, side, W - side - lw), y - 14 * u);
    g.restore();
  }

  // ---- title and closing ----------------------------------------------------------------------------
  function titleDecor(g, F, local, hold, exit) {
    const { W, H, u, th, t, tall } = F;
    const r = bounds([...headLines("kicker"), ...headLines("title")]);
    if (!r) return;
    const k = exit === undefined ? 1 : 1 - eo(exit * 1.15);
    g.save();
    g.globalAlpha *= k;
    if (exit !== undefined) g.translate(-80 * u * eio(exit), 0);
    const side = (tall ? 90 : 140) * u;
    let plotBox = null;
    // A brace under the statement, as if defining it.
    const by = r.y + r.h + 26 * u;
    const tipAt = brace(g, F, r.x, by, r.x + r.w, by, eo(span(local, 0.25, 0.85)), col(th.hues[1], 0.9), 22 * u);
    // Below: a unit circle turning beside the wave it traces. The wave's newest point is the dial's
    // height, tied to the dial's tip by a dashed rule, so the card reads as one composed diagram.
    const top = (tipAt ? tipAt[1] : by) + 40 * u, room = H - (tall ? 190 : 120) * u - top;
    const ang = (s) => -0.5 - s * 0.75;
    let R = 0, cx = 0, cy = 0, fits = false;
    if (room > 160 * u) {
      const ph = Math.min(room, tall ? 460 * u : 480 * u);
      let pw, yc, amp;
      if (tall) {
        pw = W - side * 2; yc = top + ph / 2; amp = ph * 0.38;
        R = Math.min(210 * u, (r.y - 280 * u) / 2.7); cx = W / 2; cy = r.y - R * 1.32 - 70 * u;
        fits = R > 90 * u && cy - R * 1.3 > 190 * u;
      } else {
        R = Math.min(232 * u, (ph - 40 * u) / 2);
        pw = W - side * 2 - R * 2.55 - 110 * u; yc = top + ph / 2; amp = R;
        cx = W - side - R * 1.22; cy = yc; fits = R > 90 * u;
      }
      const ox = side + 10 * u, x0 = ox + 26 * u, x1 = ox + pw - 20 * u;
      const aq = eo(span(local, 0.1, 0.6));
      axes(g, F, ox, yc, ox + pw, yc - amp - 40 * u, aq, col(th.ink, 0.7));
      pen(g, col(th.ink, 0.7), 2.2 * u); new Ln().M(ox, yc).L(ox, yc + amp + 30 * u).draw(g, aq);
      // Quarter-turn gridlines with their names.
      for (let j = 1; j <= 4; j++) {
        const gx = x0 + ((x1 - x0) * j) / 4, k = span(local, 0.3 + j * 0.08, 0.6 + j * 0.08);
        if (k <= 0) continue;
        pen(g, col(th.ink, 0.16 * k), 1.2 * u, [4 * u, 8 * u]); g.beginPath(); g.moveTo(gx, yc - amp - 10 * u); g.lineTo(gx, yc + amp + 10 * u); g.stroke();
      }
      for (const [v, lab] of [[-1, "1"], [1, "−1"]]) {
        const yy = yc + v * amp, k = span(local, 0.35, 0.7);
        pen(g, col(th.ink, 0.7 * k), 2 * u); g.beginPath(); g.moveTo(ox - 9 * u, yy); g.lineTo(ox + 9 * u, yy); g.stroke();
        write(g, F, lab, ox - 18 * u, yy, 34 * u, { italic: false, align: "right", base: "middle", color: th.muted, q: k });
      }
      const histo = 2.9, pts = [], pts2 = [];
      for (let i = 0; i <= 140; i++) {
        const x = i / 140, tau = t - (1 - x) * histo, a = ang(tau);
        pts.push([x0 + (x1 - x0) * x, yc + amp * Math.sin(a)]);
        pts2.push([x0 + (x1 - x0) * x, yc + amp * 0.55 * Math.cos(a)]);
      }
      const curve = new Ln().pts(pts), cq = eio(span(local, 0.4, 1.4));
      // A shaded strip under the wave, hatched one rule at a time.
      const hq = span(local, 1.0, 1.9);
      if (hq > 0) {
        const i0 = 70, i1 = 112, nH = 18;
        pen(g, col(th.hues[0], 0.38), 1.6 * u);
        g.beginPath();
        for (let j = 0; j < nH * hq; j++) { const [hx, hy] = pts[Math.round(i0 + ((i1 - i0) * j) / (nH - 1))]; g.moveTo(hx, yc); g.lineTo(hx, hy); }
        g.stroke();
      }
      pen(g, col(th.hues[4], 0.75), 2 * u, [10 * u, 8 * u]); new Ln().pts(pts2).draw(g, eio(span(local, 0.7, 1.6)));
      pen(g, th.hues[0], 3.4 * u); curve.draw(g, cq);
      const [px, py] = pts[140];
      if (cq > 0.98) {
        write(g, F, "sin θ", px - 10 * u, py < yc ? py - 28 * u : py + 56 * u, 44 * u, { color: th.hues[0], align: "right", q: span(local, 1.35, 1.75) });
        dot(g, px, py, 10 * u, th.hues[0]);
        pen(g, col(th.hues[1], 0.75), 1.6 * u, [7 * u, 7 * u]);
        g.beginPath(); g.moveTo(px, py); g.lineTo(px, yc); g.stroke();
        dot(g, px, yc, 5 * u, th.hues[1]);
      }
      // The dial.
      if (fits) {
        const q = eo(span(local, 0.1, 0.9)), a = ang(t);
        pen(g, col(th.ink, 0.35), 1.6 * u);
        new Ln().M(cx - R * 1.25, cy).L(cx + R * 1.25, cy).M(cx, cy + R * 1.25).L(cx, cy - R * 1.25).draw(g, q);
        pen(g, th.hues[2], 2.8 * u); new Ln().O(cx, cy, R).draw(g, q);
        // Protractor ticks around the rim, every 15 degrees.
        pen(g, col(th.hues[2], 0.8), 1.8 * u);
        g.beginPath();
        for (let j = 0; j < 24 * q; j++) {
          const ta = (j / 24) * TAU, l = j % 6 === 0 ? 22 * u : 11 * u;
          g.moveTo(cx + Math.cos(ta) * R, cy + Math.sin(ta) * R); g.lineTo(cx + Math.cos(ta) * (R + l), cy + Math.sin(ta) * (R + l));
        }
        g.stroke();
        if (q > 0.6) {
          const ex = cx + Math.cos(a) * R, ey = cy + Math.sin(a) * R;
          const aa = ((a % TAU) + TAU) % TAU;
          flood(g, new Ln().M(cx, cy).A(cx, cy, R * 0.36, aa, TAU).Z(), { x: cx - R, y: cy - R, w: R * 2, h: R * 2 }, 1, th.hues[1], 0.14);
          pen(g, th.ink, 2.8 * u); g.beginPath(); g.moveTo(cx, cy); g.lineTo(ex, ey); g.stroke();
          pen(g, col(th.hues[1], 0.8), 1.6 * u, [6 * u, 6 * u]);
          g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex, cy); g.moveTo(ex, ey); g.lineTo(cx, ey); g.stroke();
          pen(g, th.hues[1], 2.4 * u); g.beginPath(); g.arc(cx, cy, R * 0.36, aa, TAU); g.stroke();
          write(g, F, "θ", cx + R * 0.5, cy - R * 0.12, 46 * u, { color: th.hues[1] });
          dot(g, cx, cy, 6 * u, th.ink);
          dot(g, ex, ey, 10 * u, th.ink);
          // The tie from the dial's tip to the wave's newest point.
          if (!tall && cq > 0.98) {
            pen(g, col(th.hues[0], 0.6), 1.6 * u, [8 * u, 8 * u], -t * 30 * u);
            g.beginPath(); g.moveTo(ex, ey); g.lineTo(px, py); g.stroke();
          }
        }
      }
    }
    g.restore();
  }
  // Under the closing statement, the explainer's last diagram comes back as a shrunk, faded echo that
  // redraws itself, framed by corner brackets that settle into place: the result the statement concludes.
  // Where the echo sits: the last drawn scene's area, shrunk into the room under the closing box.
  function echoPlace(F) {
    const { W, H, u, tall, plan } = F;
    const ci = plan.shown.findIndex((s) => s.id === "closing");
    if (ci < 1 || !DRAW[plan.shown[ci - 1].id]) return null;
    const prev = plan.shown[ci - 1], r = bounds(headLines("closing"));
    if (!r) return null;
    const top = r.y + r.h + 0.7 * 40 * u + (tall ? 60 : 26) * u;
    const side = (tall ? 90 : 140) * u, bottom = H - (tall ? 180 : 92) * u;
    const T = { x: side, y: top, w: W - side * 2, h: bottom - top };
    if (T.h < 240 * u) return null;
    // Echo only the band the scene actually draws in: the people stand low in their area.
    const full = areaOf(F, prev.id), cut = prev.id === "people" ? full.h * 0.12 : 0;
    const A0 = { x: full.x, y: full.y + cut, w: full.w, h: full.h - cut };
    const s = Math.min(T.w / A0.w, T.h / (A0.h + 10 * u), 0.9);
    const dw = A0.w * s, dh = (A0.h + 10 * u) * s;
    return { id: prev.id, A0, full, s, dw, dh, dx: T.x + (T.w - dw) / 2, dy: T.y + (T.h - dh) / 2 };
  }
  function echo(g, F, local) {
    const { u, th } = F, P = echoPlace(F);
    if (!P) return;
    const { A0, s, dw, dh, dx, dy } = P;
    const fade = span(local, 0.05, 0.35);
    if (fade <= 0) return;
    // Corner brackets that slide in from wide and settle.
    const settle = eo(span(local, 0.1, 0.9)), off = 60 * u * (1 - settle), arm = 34 * u, m = 20 * u;
    pen(g, col(th.hues[1], 0.75 * fade), 2.2 * u);
    g.beginPath();
    for (const [cx, cy, sx, sy] of [[dx - m, dy - m, 1, 1], [dx + dw + m, dy - m, -1, 1], [dx - m, dy + dh + m, 1, -1], [dx + dw + m, dy + dh + m, -1, -1]]) {
      const bx = cx - sx * off, by = cy - sy * off;
      g.moveTo(bx + sx * arm, by); g.lineTo(bx, by); g.lineTo(bx, by + sy * arm);
    }
    g.stroke();
    // The outgoing scene shrinks into this place during the change (see scene()); from then on the
    // echo is drawn here, still live.
    if (local < F.plan.change) return;
    g.save();
    g.globalAlpha *= ECHO_ALPHA;
    g.translate(dx, dy); g.scale(s, s); g.translate(-A0.x, -A0.y);
    F.minText = 66 * u / s; F.smallFade = 0;
    DRAW[P.id](g, F, P.full, 1, dataOf(P.id), F.t, 9);
    F.minText = 0;
    g.restore();
  }
  const ECHO_ALPHA = 0.9;
  function closingDecor(g, F, local) {
    const { u, th, t, W, H } = F;
    const lines = headLines("closing"), r = bounds(lines);
    if (!r) return;
    const pad = 40 * u, x = Math.max(16 * u, r.x - pad), y = Math.max(16 * u, r.y - pad * 0.7);
    const w = Math.min(W - 16 * u, r.x + r.w + pad + 70 * u) - x, h = Math.min(H - 16 * u, r.y + r.h + pad * 0.7) - y;
    const q = eio(span(local, 0.25, 1.05));
    echo(g, F, local);
    surround(g, F, x, y, w, h, q, th.hues[1], 3 * u);
    // The end-of-proof mark after the last line: outline, then filled.
    const last = lines[lines.length - 1];
    const s = Math.min(46 * u, last.h * 0.42), sx = last.x + last.w + 22 * u, sy = last.y + last.h * 0.78 - s;
    const box = new Ln().R(sx, sy, s, s);
    pen(g, th.ink, 2.4 * u); box.draw(g, span(local, 0.8, 1.15));
    flood(g, box, { x: sx, y: sy, w: s, h: s }, eo(span(local, 1.05, 1.45)), th.ink, 1);
    // A point keeps circling the box, leaving a short trail.
    if (q >= 1) {
      const P = new Ln().R(x, y, w, h), s0 = ((local - 1.05) * 0.22) % 1;
      for (let i = 0; i < 14; i++) {
        const [px, py] = P.at((s0 - i * 0.006 + 1) % 1);
        dot(g, px, py, (8 - i * 0.45) * u, col(th.hues[1], 1 - i / 14));
      }
      ping(g, F, sx + s / 2, sy + s / 2, s * 0.6, ((local - 1.45) % 2.6) / 1.2, th.ink);
    }
    // Corner ticks just outside the box breathe slowly.
    const k = 10 * u + 4 * u * Math.sin(t * 1.6);
    pen(g, col(th.ink, 0.5 * q), 1.6 * u);
    g.beginPath();
    for (const [cx, cy, dx, dy] of [[x, y, -1, -1], [x + w, y, 1, -1], [x, y + h, -1, 1], [x + w, y + h, 1, 1]]) {
      g.moveTo(cx + dx * 8 * u, cy + dy * 8 * u); g.lineTo(cx + dx * (8 * u + k), cy + dy * 8 * u);
      g.moveTo(cx + dx * 8 * u, cy + dy * 8 * u); g.lineTo(cx + dx * 8 * u, cy + dy * (8 * u + k));
    }
    g.stroke();
  }

  // ---- scenes ---------------------------------------------------------------------------------------
  // Axes, bars that are outlined then filled, a fitted curve with a point riding it, and a boxed readout.
  function chart(g, F, A, q, d, t, late = 9) {
    const { u, th, tall } = F;
    const vals = d.values.map((v) => Math.max(0, Number(v) || 0)), n = vals.length;
    const max = Math.max(...vals, 1), step = nice(max / 4), top = Math.ceil(max / step) * step;
    const hi = clamp(Number.isFinite(d.highlight) ? d.highlight : n - 1, 0, n - 1);
    let P, R;
    if (tall) { R = { x: A.x, y: A.y, w: A.w, h: Math.min(250 * u, A.h * 0.26) }; const py = R.y + R.h + 60 * u; P = { x: A.x + 80 * u, y: py, w: A.w - 100 * u, h: A.y + A.h - py - 80 * u }; }
    else { const pw = A.w * 0.72; P = { x: A.x + 90 * u, y: A.y + 30 * u, w: pw - 110 * u, h: A.h - 110 * u }; R = { x: A.x + pw + 20 * u, y: A.y, w: A.w - pw - 20 * u, h: A.h }; }
    const ox = P.x, oy = P.y + P.h, sy = (P.h * 0.86) / top;
    axes(g, F, ox, oy, P.x + P.w + 20 * u, P.y - 10 * u, eo(span(q, 0, 0.16)), col(th.ink, 0.85));
    // Ticks and a faint dashed level at each.
    for (let v = step, i = 0; v <= top + 1e-9; v += step, i++) {
      const k = span(q, 0.06 + i * 0.03, 0.2 + i * 0.03), y = oy - v * sy;
      if (k <= 0) continue;
      pen(g, col(th.ink, 0.7 * k), 2 * u); g.beginPath(); g.moveTo(ox - 9 * u, y); g.lineTo(ox + 9 * u, y); g.stroke();
      pen(g, col(th.ink, 0.12 * k), 1.2 * u, [4 * u, 8 * u]); g.beginPath(); g.moveTo(ox + 14 * u, y); g.lineTo(P.x + P.w, y); g.stroke();
      write(g, F, fmt(v), ox - 20 * u, y, 30 * u, { italic: false, align: "right", base: "middle", color: th.muted, q: k });
    }
    const slot = P.w / n, bw = slot * 0.46;
    const tops = vals.map((v, i) => [ox + slot * (i + 0.5), oy - Math.max(2 * u, v * sy)]);
    // The tracer rides the fitted curve; each bar lights as it passes over it.
    const curve = smooth(tops), cq = eio(span(q, 0.6, 0.84));
    const ts = 0.5 - 0.5 * Math.cos(t * 1.5), tr = cq >= 1 ? curve.at(ts) : null;
    vals.forEach((v, i) => {
      const cx = tops[i][0], x = cx - bw / 2, y = tops[i][1], h = oy - y, hot = i === hi;
      const color = hot ? th.hues[1] : th.hues[0];
      const a = 0.18 + i * 0.07;
      const outline = new Ln().M(x, oy).L(x, y).L(x + bw, y).L(x + bw, oy);
      const lit = tr ? eio(clamp(1 - Math.abs(tr[0] - cx) / (slot * 0.55))) : 0;
      const pulse = Math.max(lit, hot ? Math.max(0, Math.sin(((t * TAU) / 2.8) - 1.2)) ** 6 : 0);
      if (lit > 0.02) {
        // A bright column rises through the lit bar and its foot tick flares.
        g.save(); g.globalAlpha *= lit;
        const gr = g.createLinearGradient(0, oy, 0, y - 60 * u);
        gr.addColorStop(0, col(color, 0.0)); gr.addColorStop(0.5, col(color, 0.22)); gr.addColorStop(1, col(color, 0));
        g.fillStyle = gr; g.fillRect(x - 14 * u, y - 60 * u, bw + 28 * u, oy - y + 60 * u);
        pen(g, color, 4 * u); g.beginPath(); g.moveTo(x - 10 * u, oy + 12 * u); g.lineTo(x + bw + 10 * u, oy + 12 * u); g.stroke();
        g.restore();
      }
      pen(g, color, (2.6 + 2 * pulse) * u); outline.draw(g, eio(span(q, a, a + 0.24)));
      const fq = eo(span(q, a + 0.18, a + 0.4));
      flood(g, new Ln().R(x, y, bw, h), { x, y, w: bw, h }, fq, color, 0.3 + 0.2 * pulse);
      if (fq > 0) write(g, F, fmt(v * fq, d.suffix), cx, y - 18 * u - 10 * u * lit, 46 * u * (1 + 0.25 * lit), { italic: false, align: "center", color: lit > 0.5 ? th.ink : color, q: span(q, a + 0.2, a + 0.34), maxW: slot * 0.98 });
      write(g, F, d.labels[i] || "", cx, oy + 52 * u, 42 * u, { align: "center", color: th.ink, q: span(q, a + 0.04, a + 0.26), maxW: slot * 0.96, min: 30 * u });
    });
    // The fitted curve and its riding point, read out live.
    pen(g, th.hues[2], 3 * u); curve.draw(g, cq);
    let value = vals[0];
    if (tr) {
      const [px, py] = tr;
      value = (oy - py) / sy;
      pen(g, col(th.hues[2], 0.6), 1.5 * u, [6 * u, 6 * u], -t * 20 * u);
      g.beginPath(); g.moveTo(px, py); g.lineTo(px, oy); g.moveTo(px, py); g.lineTo(ox, py); g.stroke();
      dot(g, px, py, 10 * u, th.ink); pen(g, th.hues[2], 2.4 * u); g.beginPath(); g.arc(px, py, 16 * u, 0, TAU); g.stroke();
      dot(g, ox, py, 6 * u, th.hues[2]);
    }
    // Once built, the week-to-week steps are measured one after another: a hop arc over each pair of bar
    // tops with its difference written at the crest.
    if (late > 0) {
      for (let i = 1; i < n; i++) {
        const a0 = 0.1 + (i - 1) * 0.38, k = eio(span(late, a0, a0 + 0.42));
        if (k <= 0) continue;
        const [x1, y1] = tops[i - 1], [x2, y2] = tops[i];
        const sx1 = x1 + bw * 0.12, sy1 = y1 - 74 * u, sx2 = x2 - bw * 0.12, sy2 = y2 - 74 * u;
        const crest = Math.min(sy1, sy2) - 46 * u;
        const hop = new Ln().M(sx1, sy1).Q((sx1 + sx2) / 2, crest - 20 * u, sx2, sy2);
        arrow(g, F, hop, k, col(th.hues[4], 0.95), 2.2 * u);
        const dv = vals[i] - vals[i - 1];
        write(g, F, `${dv >= 0 ? "+" : "−"}${fmt(Math.abs(dv), d.suffix)}`, (sx1 + sx2) / 2, crest - 4 * u, 42 * u, { italic: false, align: "center", color: th.hues[4], q: span(late, a0 + 0.18, a0 + 0.5) });
        ping(g, F, x2, y2, 8 * u, (late - a0 - 0.42) / 0.7, th.hues[4]);
      }
    }
    // The readout: the highlighted value, boxed, tied to its bar by an arrow.
    const big = fmt(vals[hi] * eo(span(q, 0.5, 0.75)), d.suffix);
    let bx, by, size = 112 * u;
    if (tall) { bx = R.x + 40 * u; by = R.y + R.h * 0.5; }
    else { bx = R.x + R.w / 2; by = R.y + R.h * 0.3; }
    const m = write(g, F, big, bx, by, size, { italic: false, align: tall ? "left" : "center", base: "middle", color: th.hues[1], q: span(q, 0.48, 0.62), maxW: (tall ? R.w * 0.45 : R.w) - 50 * u, min: 84 * u });
    const bxL = tall ? bx : bx - m.w / 2, boxR = { x: bxL - 24 * u, y: by - m.size * 0.62, w: m.w + 48 * u, h: m.size * 1.24 };
    surround(g, F, boxR.x, boxR.y, boxR.w, boxR.h, eio(span(q, 0.58, 0.8)), th.hues[1]);
    const [hx, hy] = tops[hi];
    const startX = tall ? boxR.x + boxR.w * 0.5 : boxR.x, startY = tall ? boxR.y + boxR.h : boxR.y + boxR.h * 0.5;
    const endX = hx + (tall ? 0 : bw * 0.5 + 10 * u), endY = hy - (tall ? 70 * u : 10 * u);
    const lead = new Ln().M(startX, startY).Q(tall ? startX : lerp(startX, endX, 0.5), tall ? lerp(startY, endY, 0.5) : startY - 60 * u, endX, endY);
    arrow(g, F, lead, eio(span(q, 0.68, 0.88)), col(th.hues[1], 0.85), 2.2 * u);
    const lx = tall ? boxR.x + boxR.w + 40 * u : bx, al = tall ? "left" : "center";
    const lw = tall ? R.x + R.w - lx : R.w;
    write(g, F, d.labels[hi] || "", lx, tall ? by - 10 * u : boxR.y + boxR.h + 64 * u, 44 * u, { align: al, color: th.ink, q: span(q, 0.62, 0.8), maxW: lw, min: 32 * u });
    const fy = tall ? by + 52 * u : boxR.y + boxR.h + 136 * u;
    if (q > 0.84) {
      const lab = `f(x) = ${fmt(value, "", 1)}`;
      write(g, F, lab, lx, fy, 42 * u, { align: al, color: th.hues[2], q: span(q, 0.84, 0.98), maxW: lw, min: 30 * u });
    }
  }

  // The device in line-art: a live preview plotting a signal, a timeline with a sweeping playhead and a
  // proposed clip whose dashed outline marches; three labelled arrows point into it.
  function object(g, F, A, q, d, t) {
    const { u, th, tall } = F;
    const phone = d.kind === "phone";
    const D = tall ? { x: A.x, y: A.y + A.h * 0.04, w: A.w, h: A.h * 0.56 } : { x: A.x, y: A.y, w: A.w * 0.6, h: A.h };
    let sx, sy, sw, sh, body;
    if (phone) {
      const ph = Math.min(D.h * 0.98, D.w * 1.9), pw = ph * 0.52;
      const px = D.x + (D.w - pw) / 2, py = D.y + (D.h - ph) / 2;
      body = new Ln().RR(px, py, pw, ph, 46 * u);
      sx = px + 20 * u; sy = py + 64 * u; sw = pw - 40 * u; sh = ph - 110 * u;
      pen(g, th.ink, 2.6 * u); body.draw(g, eio(span(q, 0, 0.22)));
      pen(g, col(th.ink, 0.6), 2 * u); new Ln().M(px + pw * 0.4, py + 32 * u).L(px + pw * 0.6, py + 32 * u).M(px + pw * 0.42, py + ph - 24 * u).L(px + pw * 0.58, py + ph - 24 * u).draw(g, span(q, 0.15, 0.3));
    } else {
      const lw = Math.min(D.w * 0.94, D.h * 0.84 * 1.55), lh = lw / 1.55;
      const lx = D.x + (D.w - lw) / 2, ly = D.y + (D.h - lh * 1.1) / 2;
      body = new Ln().RR(lx, ly, lw, lh, 18 * u);
      pen(g, th.ink, 2.6 * u); body.draw(g, eio(span(q, 0, 0.22)));
      const base = new Ln().M(lx - lw * 0.07, ly + lh + lh * 0.08).L(lx + lw * 1.07, ly + lh + lh * 0.08).L(lx + lw, ly + lh).L(lx, ly + lh).Z();
      pen(g, th.ink, 2.4 * u); base.draw(g, eio(span(q, 0.08, 0.26)));
      // Hinge and a row of keys in fine strokes.
      pen(g, col(th.ink, 0.35), 1.4 * u);
      const keys = new Ln();
      for (let i = 0; i < 18; i++) { const kx = lx + lw * (0.06 + i * 0.05); keys.M(kx, ly + lh + lh * 0.025).L(kx + lw * 0.032, ly + lh + lh * 0.025); }
      keys.M(lx + lw * 0.42, ly + lh + lh * 0.058).L(lx + lw * 0.58, ly + lh + lh * 0.058);
      keys.draw(g, span(q, 0.2, 0.36));
      sx = lx + 22 * u; sy = ly + 22 * u; sw = lw - 44 * u; sh = lh - 44 * u;
    }
    pen(g, col(th.ink, 0.45), 1.6 * u); new Ln().RR(sx, sy, sw, sh, 8 * u).draw(g, eio(span(q, 0.06, 0.26)));
    // Preview: a framed plot of a moving signal.
    const pv = { x: sx + sw * 0.06, y: sy + sh * 0.06, w: sw * 0.88, h: sh * (phone ? 0.4 : 0.46) };
    pen(g, th.hues[0], 2.2 * u); new Ln().R(pv.x, pv.y, pv.w, pv.h).draw(g, eio(span(q, 0.18, 0.36)));
    const wq = eio(span(q, 0.28, 0.5));
    if (wq > 0) {
      const mid = pv.y + pv.h * 0.55, pts = [];
      for (let i = 0; i <= 80; i++) { const x = i / 80; pts.push([pv.x + pv.w * (0.06 + 0.88 * x), mid - pv.h * 0.3 * Math.sin(x * 9 + t * 2.4) * (0.4 + 0.6 * Math.sin(x * 3.1 + 0.5))]); }
      pen(g, col(th.ink, 0.4), 1.2 * u); new Ln().M(pv.x + pv.w * 0.06, mid).L(pv.x + pv.w * 0.94, mid).draw(g, wq);
      const wave = new Ln().pts(pts);
      pen(g, th.hues[0], 2.4 * u); wave.draw(g, wq);
      const [ex, ey] = wave.at(wq); dot(g, ex, ey, 6 * u, th.ink);
    }
    // Timeline: ruler, three tracks of clips, the proposed clip and the playhead.
    const tl = { x: sx + sw * 0.06, y: pv.y + pv.h + sh * 0.08, w: sw * 0.88, h: sh - pv.h - sh * 0.2 };
    const rq = span(q, 0.3, 0.45);
    pen(g, col(th.ink, 0.5), 1.2 * u);
    const ruler = new Ln().M(tl.x, tl.y).L(tl.x + tl.w, tl.y);
    for (let i = 0; i <= 16; i++) ruler.M(tl.x + (tl.w * i) / 16, tl.y).L(tl.x + (tl.w * i) / 16, tl.y + (i % 4 ? 5 : 10) * u);
    ruler.draw(g, rq);
    const th3 = (tl.h - 18 * u) / 3, clips = [[[0.0, 0.3], [0.33, 0.24], [0.6, 0.4]], [[0.05, 0.42], [0.5, 0.3]], [[0.0, 0.55], [0.58, 0.35]]];
    const hues = [th.hues[0], th.hues[4], th.hues[2]];
    const anchors = [[pv.x + pv.w * 0.78, pv.y + pv.h * 0.3]];
    clips.forEach((row, r) => row.forEach(([cx0, cw], i) => {
      const x = tl.x + tl.w * cx0, y = tl.y + 18 * u + r * th3, w = tl.w * cw - 6 * u, h = th3 - 8 * u;
      const k = span(q, 0.34 + r * 0.05 + i * 0.04, 0.5 + r * 0.05 + i * 0.04);
      const prop = r === 0 && i === 1;
      const R2 = new Ln().RR(x, y, w, h, 4 * u);
      if (prop) {
        flood(g, R2, { x, y, w, h }, eo(k), th.hues[1], 0.28);
        pen(g, th.hues[1], 2.4 * u, [9 * u, 6 * u], -t * 40 * u); if (k > 0) { g.beginPath(); R2.trace(g); g.stroke(); }
        anchors.push([x + w / 2, y + h / 2]);
      } else {
        flood(g, R2, { x, y, w, h }, eo(span(k, 0.4, 1)), hues[r], 0.22);
        pen(g, hues[r], 1.8 * u); R2.draw(g, k);
      }
      if (r === 2 && i === 0) anchors.push([x + w * 0.4, y + h / 2]);
    }));
    if (q > 0.45) {
      const s = (t * 0.16) % 1, px = tl.x + tl.w * s, k = span(q, 0.45, 0.55);
      pen(g, col(th.hues[3], k), 2.4 * u); g.beginPath(); g.moveTo(px, tl.y - 4 * u); g.lineTo(px, tl.y + tl.h); g.stroke();
      g.save(); g.globalAlpha *= k; tip(g, px, tl.y + 8 * u, Math.PI / 2, 16 * u, th.hues[3]); g.restore();
    }
    // Callouts.
    const colors = [th.hues[0], th.hues[1], th.hues[2]];
    d.callouts.forEach((label, i) => {
      if (!label) return;
      const a0 = 0.46 + i * 0.12, [ax, ay] = anchors[i];
      const ring = eo(span(q, a0 + 0.12, a0 + 0.24));
      if (tall) {
        // Numbered markers on the device, a numbered list below it.
        const ly = D.y + D.h + 120 * u + i * 130 * u, lx = A.x + 90 * u;
        if (ring > 0) {
          pen(g, colors[i], 2.4 * u); new Ln().O(ax, ay, 26 * u).draw(g, ring);
          write(g, F, String(i + 1), ax, ay + 1 * u, 32 * u, { italic: false, align: "center", base: "middle", color: colors[i], q: ring });
          pen(g, colors[i], 2.2 * u); new Ln().O(A.x + 40 * u, ly - 14 * u, 26 * u).draw(g, ring);
          write(g, F, String(i + 1), A.x + 40 * u, ly - 13 * u, 32 * u, { italic: false, align: "center", base: "middle", color: colors[i], q: ring });
        }
        write(g, F, label, lx, ly, 44 * u, { color: th.ink, q: span(q, a0, a0 + 0.22), maxW: A.x + A.w - lx, min: 32 * u });
        if (ring >= 1) ping(g, F, ax, ay, 26 * u, ((t + i * 0.9) % 3) / 1.1, colors[i]);
        return;
      }
      const LX = A.x + A.w * 0.66, ly = A.y + A.h * (0.2 + 0.3 * i);
      const m = write(g, F, label, LX, ly, 44 * u, { color: colors[i], q: span(q, a0, a0 + 0.2), maxW: A.x + A.w - LX + 60 * u, min: 32 * u });
      const sxp = LX - 18 * u, syp = ly - m.size * 0.32;
      const path = new Ln().M(sxp, syp).Q(lerp(sxp, ax, 0.55), syp + (ay - syp) * 0.1 - 40 * u, ax + 22 * u, ay);
      arrow(g, F, path, eio(span(q, a0 + 0.05, a0 + 0.22)), colors[i], 2.2 * u);
      if (ring > 0) { pen(g, colors[i], 2 * u); g.beginPath(); g.arc(ax, ay, (12 + 3 * Math.sin(t * 3 + i * 2)) * u, 0, TAU * ring); g.stroke(); }
      if (ring >= 1) ping(g, F, ax, ay, 12 * u, ((t + i * 0.9) % 3) / 1.1, colors[i]);
    });
  }

  // People as an original cast of rounded figures on a number line, joined to the one in the accent by
  // arcs that carry small messages; each carries a boxed label. Eyes blink and turn toward the lead.
  // A fountain pen as one glyph: barrel with a cap band and clip, a tapered nib with its slit and breather
  // hole. Drawn along +x with the nib toward -x, then turned to the given heading of the nib.
  function penGlyph(g, F, x, y, len, heading, color, q) {
    if (q <= 0) return;
    const { u, th } = F, w = len * 0.17;
    g.save(); g.translate(x, y); g.rotate(heading + Math.PI);
    const barrel = new Ln().M(0, -w / 2).L(len * 0.78, -w / 2).Q(len, -w / 2, len, 0).Q(len, w / 2, len * 0.78, w / 2).L(0, w / 2).Z();
    const nib = new Ln().M(0, -w * 0.42).L(-len * 0.16, -w * 0.38).L(-len * 0.36, 0).L(-len * 0.16, w * 0.38).L(0, w * 0.42).Z();
    flood(g, barrel, { x: 0, y: -w / 2, w: len, h: w }, eo(span(q, 0.4, 1)), color, 0.85);
    pen(g, th.ink, 2.2 * u); barrel.draw(g, eio(span(q, 0, 0.6)));
    flood(g, nib, { x: -len * 0.36, y: -w / 2, w: len * 0.36, h: w }, eo(span(q, 0.5, 1)), th.chalk, 0.9);
    pen(g, th.ink, 2 * u); nib.draw(g, eio(span(q, 0.2, 0.7)));
    if (q > 0.6) {
      pen(g, th.bg, 1.6 * u); g.beginPath(); g.moveTo(-len * 0.34, 0); g.lineTo(-len * 0.12, 0); g.stroke();
      dot(g, -len * 0.11, 0, w * 0.13, th.bg);
      pen(g, th.ink, 2 * u); g.beginPath(); g.moveTo(len * 0.5, -w / 2); g.lineTo(len * 0.5, w / 2); g.moveTo(len * 0.56, -w / 2); g.lineTo(len * 0.56, w / 2); g.stroke();
      pen(g, th.ink, 1.8 * u); g.beginPath(); g.moveTo(len * 0.56, -w * 0.5); g.lineTo(len * 0.6, -w * 0.72); g.lineTo(len * 0.9, -w * 0.72); g.lineTo(len * 0.92, -w * 0.55); g.stroke();
    }
    g.restore();
  }
  // People as an original cast of bell-shaped figures ruled like the rest of the board: an outline, a
  // hatched fill, a collar and buttons, and one distinguishing detail each (spectacles, a mortarboard with
  // a swinging tassel, a curl of hair, a bow tie). The lead raises a pen.
  function figure(g, F, cx, base, size, color, q, look, blink, lead, kind, t) {
    const { u, th } = F;
    const bodyH = size * 0.56, bw = size * 0.64, sw2 = size * 0.4, r = size * 0.18, hy = base - bodyH - size * 0.04 - r;
    const sy = base - bodyH * 0.8;
    const body = new Ln().M(cx - bw / 2, base).C(cx - bw * 0.46, base - bodyH * 0.45, cx - sw2 * 0.62, sy + size * 0.02, cx - sw2 / 2, sy)
      .Q(cx - sw2 * 0.42, base - bodyH, cx, base - bodyH).Q(cx + sw2 * 0.42, base - bodyH, cx + sw2 / 2, sy)
      .C(cx + sw2 * 0.62, sy + size * 0.02, cx + bw * 0.46, base - bodyH * 0.45, cx + bw / 2, base).Z();
    const bb = { x: cx - bw / 2, y: base - bodyH, w: bw, h: bodyH };
    pen(g, color, 2.6 * u); body.draw(g, eio(span(q, 0, 0.5)));
    flood(g, body, bb, eo(span(q, 0.35, 0.7)), color, 0.16);
    // Hatching inside the body, ruled diagonally.
    const hk = span(q, 0.4, 0.8);
    if (hk > 0) {
      g.save(); g.beginPath(); body.trace(g); g.clip();
      pen(g, col(color, 0.32), 1.4 * u);
      g.beginPath();
      for (let k = -bodyH; k < bw * hk; k += 14 * u) { g.moveTo(bb.x + k, base); g.lineTo(bb.x + k + bodyH, base - bodyH); }
      g.stroke(); g.restore();
    }
    const head = new Ln().O(cx, hy, r);
    pen(g, color, 2.6 * u); head.draw(g, eio(span(q, 0.15, 0.6)));
    flood(g, head, { x: cx - r, y: hy - r, w: r * 2, h: r * 2 }, eo(span(q, 0.45, 0.75)), color, 0.18);
    if (q > 0.55) {
      const k = span(q, 0.55, 0.85);
      // Collar and buttons.
      pen(g, col(color, k), 2 * u);
      new Ln().M(cx - sw2 * 0.28, base - bodyH * 0.96).L(cx, base - bodyH * 0.76).L(cx + sw2 * 0.28, base - bodyH * 0.96).draw(g, k);
      for (let j = 0; j < 3; j++) dot(g, cx, base - bodyH * (0.6 - j * 0.18), 3.6 * u * k, col(color, 0.9));
      // Face.
      const e = size * 0.03, ex = r * 0.38;
      for (const sgn of [-1, 1]) {
        g.save(); g.translate(cx + sgn * ex + look * r * 0.16, hy - r * 0.08); g.scale(1, Math.max(0.12, blink));
        g.beginPath(); g.ellipse(0, 0, e * 1.2, e * 1.5, 0, 0, TAU); g.fillStyle = th.ink; g.fill();
        g.restore();
      }
      pen(g, th.ink, 2 * u); g.beginPath(); g.arc(cx + look * r * 0.12, hy + r * 0.3, r * 0.24, 0.22 * Math.PI, 0.78 * Math.PI); g.stroke();
      if (lead) {
        // A raised arm and the pen, nib up, rocking slightly as if about to sign.
        const shx = cx + sw2 * 0.46, shy = sy + size * 0.03;
        const hx = cx + bw * 0.62, hyy = base - bodyH * 1.06 + Math.sin(t * 2.1) * 4 * u;
        pen(g, color, 2.6 * u); new Ln().M(shx, shy).Q(hx + size * 0.04, shy + size * 0.02, hx, hyy).draw(g, k);
        const ph = -1.25 + Math.sin(t * 1.3) * 0.08, pl = size * 0.42;
        penGlyph(g, F, hx + Math.cos(ph) * pl * 0.3, hyy + Math.sin(ph) * pl * 0.3, pl, ph, color, span(q, 0.6, 1));
        g.beginPath(); g.arc(hx, hyy, size * 0.045, 0, TAU); g.fillStyle = th.bg; g.fill(); pen(g, color, 2.4 * u); g.stroke();
      } else if (kind === 0) {
        // Round spectacles.
        pen(g, col(th.ink, k), 2 * u);
        for (const sgn of [-1, 1]) { g.beginPath(); g.arc(cx + sgn * ex + look * r * 0.16, hy - r * 0.08, r * 0.27, 0, TAU); g.stroke(); }
        g.beginPath(); g.moveTo(cx - ex * 0.3 + look * r * 0.16, hy - r * 0.12); g.lineTo(cx + ex * 0.3 + look * r * 0.16, hy - r * 0.12); g.stroke();
      } else if (kind === 1) {
        // A mortarboard with a tassel that swings.
        const cy0 = hy - r * 0.92;
        const board = new Ln().M(cx - r * 1.25, cy0).L(cx, cy0 - r * 0.42).L(cx + r * 1.25, cy0).L(cx, cy0 + r * 0.42).Z();
        flood(g, board, { x: cx - r * 1.25, y: cy0 - r * 0.42, w: r * 2.5, h: r * 0.84 }, k, color, 0.5);
        pen(g, color, 2.2 * u); board.draw(g, k);
        const sway = Math.sin(t * 2.4 + cx * 0.01) * 0.35, tx = cx + r * 1.1, ty = cy0;
        pen(g, th.hues[1], 2 * u); g.beginPath(); g.moveTo(cx, cy0); g.lineTo(tx, ty); g.lineTo(tx + Math.sin(sway) * r * 0.8, ty + Math.cos(sway) * r * 0.8); g.stroke();
        dot(g, tx + Math.sin(sway) * r * 0.8, ty + Math.cos(sway) * r * 0.8, 5 * u * k, th.hues[1]);
      } else if (kind === 2) {
        // A curl of hair, drawn as a small spiral.
        const spiral = new Ln();
        for (let j = 0; j <= 40; j++) { const a = -Math.PI / 2 + j * 0.42, rr = r * (0.06 + j * 0.0105); const px = cx + r * 0.12 + Math.cos(a) * rr, py = hy - r * 1.1 + Math.sin(a) * rr; if (j) spiral.L(px, py); else spiral.M(px, py); }
        pen(g, color, 2.2 * u); spiral.draw(g, k);
      } else {
        // A bow tie at the collar.
        const by = base - bodyH * 0.8, s2 = size * 0.07;
        const tie = new Ln().M(cx, by).L(cx - s2 * 1.4, by - s2).L(cx - s2 * 1.4, by + s2).Z().M(cx, by).L(cx + s2 * 1.4, by - s2).L(cx + s2 * 1.4, by + s2).Z();
        flood(g, tie, { x: cx - s2 * 1.4, y: by - s2, w: s2 * 2.8, h: s2 * 2 }, k, th.hues[1], 0.8);
        pen(g, th.hues[1], 2 * u); tie.draw(g, k);
      }
    }
    return { hy: kind === 1 && !lead ? hy - r * 0.35 : hy, r };
  }
  function people(g, F, A, q, d, t) {
    const { u, th, tall } = F;
    const n = clamp(Math.round(Number(d.count) || 3), 2, 6), hi = Math.min(n - 1, d.highlight ?? 1);
    const slot = A.w / n, labelH = 70 * u, arcs = 90 * u;
    let ground = A.y + A.h - 150 * u;
    const widths = [];
    for (let i = 0; i < n; i++) widths.push(Math.min(slot * (tall ? 1.6 : 0.96), measure(g, d.badges[i % d.badges.length] || "", 42 * u) + 36 * u));
    const crowd = widths.some((w) => w > slot * 0.98);
    const size = Math.min(ground - A.y - labelH * (crowd ? 2.1 : 1) - arcs - 40 * u, slot * (tall ? 1.25 : 1.05), 330 * u);
    if (tall) ground -= Math.max(0, (ground - A.y - size * 1.1 - labelH * (crowd ? 2.1 : 1) - arcs - 40 * u) * 0.5);
    const xs = Array.from({ length: n }, (_, i) => A.x + slot * (i + 0.5));
    // The number line they stand on, and a brace counting them.
    const lq = eo(span(q, 0, 0.2));
    pen(g, col(th.ink, 0.7), 2 * u);
    const line = new Ln().M(A.x, ground).L(A.x + A.w, ground);
    xs.forEach((x) => line.M(x, ground - 9 * u).L(x, ground + 9 * u));
    line.draw(g, lq);
    xs.forEach((x, i) => write(g, F, String(i + 1), x, ground + 40 * u, 30 * u, { italic: false, align: "center", color: th.muted, q: span(q, 0.1 + i * 0.03, 0.22 + i * 0.03) }));
    const bt = brace(g, F, xs[0], ground + 54 * u, xs[n - 1], ground + 54 * u, eo(span(q, 0.62, 0.82)), col(th.ink, 0.8), 20 * u);
    if (bt) write(g, F, `n = ${n}`, bt[0], bt[1] + 30 * u, 42 * u, { align: "center", color: th.ink, q: span(q, 0.72, 0.9) });
    const cast = [th.hues[0], th.hues[2], th.hues[4], th.hues[3]];
    const heads = [];
    for (let i = 0; i < n; i++) {
      const qi = span(q, 0.08 + i * 0.07, 0.5 + i * 0.07), lead = i === hi, color = lead ? th.hues[1] : cast[i % cast.length];
      const bob = Math.sin(t * 2 + i * 1.3) * 3 * u * (lead ? 1.4 : 1);
      const look = lead ? Math.sin(t * 0.7) * 0.8 : clamp((xs[hi] - xs[i]) / slot, -1, 1);
      const ph = (t * 0.9 + i * 0.37) % 3.1, blink = ph < 0.12 ? Math.abs(ph - 0.06) / 0.06 : 1;
      heads.push(figure(g, F, xs[i], ground - 4 * u + bob, size * (lead ? 1.06 : 1), color, qi, look, blink, lead, (i > hi ? i - 1 : i) % 4, t));
      heads[i].color = color; heads[i].bob = bob;
    }
    // Boxed labels above the heads; crowded rows alternate height.
    const boxes = [];
    for (let i = 0; i < n; i++) {
      const label = d.badges[i % d.badges.length];
      const hdy = heads[i].hy - heads[i].r;
      const by = hdy - 40 * u - (crowd && i % 2 ? labelH * 1.05 : 0);
      boxes.push(by - 52 * u);
      if (!label) continue;
      const a0 = 0.1 + i * 0.07;
      const m = write(g, F, label, xs[i], by, 42 * u, { align: "center", color: i === hi ? heads[i].color : th.ink, q: span(q, a0, a0 + 0.17), maxW: widths[i] - 28 * u, min: 30 * u });
      surround(g, F, xs[i] - m.w / 2 - 16 * u, by - m.size * 0.95, m.w + 32 * u, m.size * 1.32, eio(span(q, a0 + 0.08, a0 + 0.24)), col(heads[i].color, 0.9), 2 * u, m.size);
    }
    // Arcs from each figure's label to the lead's, carrying messages.
    const topY = Math.min(...boxes);
    for (let i = 0; i < n; i++) {
      if (i === hi) continue;
      const x1 = xs[i], x2 = xs[hi], lift = 30 * u + Math.abs(i - hi) * 14 * u;
      const y1 = boxes[i] + 4 * u, y2 = boxes[hi] + 4 * u;
      const path = new Ln().M(x1, y1).Q((x1 + x2) / 2, topY - lift, x2 + (x1 < x2 ? -18 * u : 18 * u), y2);
      const k = eio(span(q, 0.58 + i * 0.03, 0.8 + i * 0.03));
      pen(g, col(th.ink, 0.38), 1.6 * u); path.draw(g, k);
      if (k >= 1) {
        const s = (t * 0.45 + i * 0.29) % 1, [mx, my] = path.at(s);
        dot(g, mx, my, 7 * u, heads[i].color);
        if (s > 0.9) ping(g, F, x2, y2, 8 * u, (s - 0.9) / 0.1, heads[i].color);
      }
    }
    // A dashed ring turns around the lead's head.
    if (q > 0.5) {
      const L = heads[hi], k = eo(span(q, 0.5, 0.7));
      pen(g, col(th.hues[1], 0.75 * k), 2 * u, [10 * u, 10 * u], -t * 30 * u);
      g.beginPath(); g.arc(xs[hi], L.hy, L.r * 1.45, 0, TAU); g.stroke();
    }
  }

  // Three steps as a diagram that commutes: f then g along the top, their composite along the arc.
  // A point travels each route and both arrive together.
  function stepIcon(g, F, i, cx, cy, r, color, q, t) {
    const { u, th } = F;
    if (q <= 0) return;
    if (i === 0) {
      const w = r * 1.05, h = r * 0.72, x = cx - w / 2, y = cy - h / 2;
      pen(g, color, 2.2 * u);
      const P = new Ln().R(x, y, w, h);
      for (let k = 0; k < 5; k++) { const hx = x + w * (0.1 + k * 0.2) - r * 0.04; P.R(hx, y + h * 0.07, r * 0.08, r * 0.07).R(hx, y + h - h * 0.07 - r * 0.07, r * 0.08, r * 0.07); }
      P.draw(g, q);
      if (q > 0.6) { g.beginPath(); g.moveTo(cx - r * 0.12, cy - r * 0.15); g.lineTo(cx + r * 0.18, cy); g.lineTo(cx - r * 0.12, cy + r * 0.15); g.closePath(); g.fillStyle = col(color, span(q, 0.6, 1)); g.fill(); }
    } else if (i === 1) {
      const w = Math.sin(t * 1.3) * r * 0.25;
      const a = [cx - r * 0.5, cy + r * 0.25], b = [cx + r * 0.5, cy - r * 0.25], c1 = [cx - r * 0.15 + w, cy - r * 0.6], c2 = [cx + r * 0.15 - w, cy + r * 0.6];
      pen(g, col(th.ink, 0.5), 1.4 * u, [5 * u, 5 * u]);
      new Ln().M(...a).L(...c1).M(...b).L(...c2).draw(g, q);
      pen(g, color, 2.8 * u); new Ln().M(...a).C(...c1, ...c2, ...b).draw(g, q);
      if (q > 0.5) { for (const p of [a, b]) dot(g, p[0], p[1], 6 * u, color); for (const p of [c1, c2]) { pen(g, th.ink, 1.6 * u); g.beginPath(); g.arc(p[0], p[1], 6 * u, 0, TAU); g.stroke(); } }
    } else {
      const s = r * 0.78;
      pen(g, color, 2.4 * u); new Ln().R(cx - s / 2, cy - s / 2, s, s).draw(g, q);
      pen(g, color, 4 * u); new Ln().M(cx - s * 0.3, cy + s * 0.02).L(cx - s * 0.08, cy + s * 0.24).L(cx + s * 0.34, cy - s * 0.26).draw(g, span(q, 0.5, 1));
    }
  }
  function process(g, F, A, q, d, t) {
    const { u, th, tall } = F;
    const steps = d.steps.filter((s) => s !== undefined).slice(0, 3), n = Math.max(2, steps.length);
    const colors = [th.hues[0], th.hues[4], th.hues[2]];
    const names = ["f", "g"];
    let nodes;
    let r;
    if (tall) {
      r = Math.min(A.w * 0.16, A.h * 0.11, 140 * u);
      nodes = steps.map((_, i) => [A.x + A.w * 0.34, A.y + r + 20 * u + i * ((A.h - r * 2 - 150 * u) / Math.max(1, n - 1))]);
    } else {
      r = Math.min(A.h * 0.23, A.w * 0.1, 165 * u);
      const cy = A.y + Math.max(r + 230 * u, A.h * 0.56);
      nodes = steps.map((_, i) => [A.x + A.w * (0.16 + (0.68 * i) / Math.max(1, n - 1)), cy]);
    }
    const routes = [];
    for (let i = 0; i < n - 1; i++) {
      const [x1, y1] = nodes[i], [x2, y2] = nodes[i + 1];
      const path = tall
        ? new Ln().M(x1 + r * 0.7, y1 + r * 0.8).Q(x1 + r * 1.9, (y1 + y2) / 2, x2 + r * 0.7, y2 - r * 0.8)
        : new Ln().M(x1 + r + 12 * u, y1 - r * 0.25).Q((x1 + x2) / 2, y1 - r * 1.2, x2 - r - 14 * u, y2 - r * 0.25);
      routes.push(path);
    }
    const [fx, fy] = nodes[0], [lx, ly] = nodes[n - 1];
    const comp = tall
      ? new Ln().M(fx - r * 0.8, fy + r * 0.7).Q(A.x - 40 * u, (fy + ly) / 2, lx - r * 0.8, ly - r * 0.7)
      : new Ln().M(fx, fy - r - 14 * u).Q((fx + lx) / 2, fy - r - 300 * u, lx, ly - r - 16 * u);
    // The travel clock: both routes are walked in the same time, and each node lights as the walkers reach it.
    const period = 3.2, s = q >= 0.9 ? ((t % period) / period) * 1.25 : -1;
    const litOf = (i) => {
      if (s < 0) return 0;
      const arrive = i / Math.max(1, n - 1);
      const dt = s - arrive;
      return dt < -0.04 ? 0 : clamp(1 - Math.max(0, dt) / 0.32) * clamp((dt + 0.04) / 0.04);
    };
    // Nodes, icons and labels.
    nodes.forEach(([cx, cy], i) => {
      const a = 0.04 + i * 0.16, color = colors[i], lit = litOf(i);
      const rr = r * (1 + 0.06 * lit);
      const ring = new Ln().O(cx, cy, rr);
      pen(g, color, (2.8 + 3 * lit) * u); ring.draw(g, eio(span(q, a, a + 0.2)));
      flood(g, ring, { x: cx - rr, y: cy - rr, w: rr * 2, h: rr * 2 }, eo(span(q, a + 0.14, a + 0.3)), color, 0.12 + 0.3 * lit);
      if (lit > 0.02) { pen(g, col(color, 0.5 * lit), 2 * u, [8 * u, 10 * u], -t * 60 * u); g.beginPath(); g.arc(cx, cy, rr + 22 * u, 0, TAU); g.stroke(); }
      stepIcon(g, F, i === n - 1 ? 2 : i, cx, cy, r, color, span(q, a + 0.1, a + 0.32), t);
      const lbl = steps[i] || "", lc = lit > 0.4 ? color : th.ink;
      if (tall) write(g, F, lbl, cx + r + 36 * u, cy + 18 * u, 52 * u, { color: lc, q: span(q, a + 0.12, a + 0.32), maxW: A.x + A.w - cx - r - 10 * u, min: 40 * u });
      else write(g, F, lbl, cx, cy + r + 74 * u, 54 * u, { align: "center", color: lc, q: span(q, a + 0.12, a + 0.32), maxW: A.w / n - 20 * u, min: 42 * u });
    });
    routes.forEach((path, i) => {
      const a = 0.3 + i * 0.16;
      arrow(g, F, path, eio(span(q, a, a + 0.18)), col(th.ink, 0.9), 2.4 * u);
      const [mx, my] = path.at(0.5);
      write(g, F, names[i] || "h", tall ? mx + 26 * u : mx, tall ? my + 18 * u : my - 24 * u, 60 * u, { align: tall ? "left" : "center", color: th.ink, q: span(q, a + 0.12, a + 0.24) });
    });
    const cq = eio(span(q, 0.66, 0.88));
    if (cq > 0) {
      pen(g, th.hues[1], 2.6 * u, [14 * u, 9 * u], -t * 36 * u);
      comp.draw(g, cq);
      const [ex, ey, ea] = comp.at(cq); tip(g, ex, ey, ea, 18 * u, th.hues[1]);
      const [mx, my] = comp.at(0.5);
      const label = n > 2 ? "g ∘ f" : "f";
      if (tall) {
        g.save(); g.translate(mx + 40 * u, my); g.rotate(-Math.PI / 2);
        write(g, F, label, 0, 0, 60 * u, { align: "center", base: "middle", color: th.hues[1], q: span(q, 0.8, 0.95) });
        g.restore();
      } else write(g, F, label, mx, my - 20 * u, 60 * u, { align: "center", color: th.hues[1], q: span(q, 0.8, 0.95) });
    }
    // Both routes are travelled in the same time: the diagram commutes.
    if (s >= 0) {
      for (let i = 0; i < 10; i++) {
        const k = clamp(s - i * 0.012);
        if (s - i * 0.012 > 1 || k <= 0) continue;
        const seg = k * routes.length, j = Math.min(routes.length - 1, Math.floor(seg));
        const [ax, ay] = routes[j].at(seg - j);
        const [bx, by] = comp.at(k);
        dot(g, ax, ay, (13 - i) * u, col(th.ink, 1 - i / 10)); dot(g, bx, by, (13 - i) * u, col(th.hues[1], 1 - i / 10));
      }
      for (let i = 1; i < n; i++) {
        const arrive = i / routes.length;
        ping(g, F, nodes[i][0], nodes[i][1], r, (s - arrive) / 0.2, i === n - 1 ? th.hues[1] : colors[i]);
      }
    }
  }

  // Two values: big figures with the relation between them, a number line where two points slide to
  // their places, a brace measuring the gap and a boxed change.
  function compare(g, F, A, q, d, t, late = 9) {
    const { u, th, tall } = F;
    const L = Number(d.leftValue) || 0, R = Number(d.rightValue) || 0;
    const cl = th.hues[3], cr = th.hues[0];
    const xl = A.x + A.w * 0.25, xr = A.x + A.w * 0.75, colW = A.w * 0.46;
    const ly = A.y + 46 * u;
    write(g, F, d.left, xl, ly, 44 * u, { align: "center", color: cl, q: span(q, 0.02, 0.2), maxW: colW, min: 30 * u });
    write(g, F, d.right, xr, ly, 44 * u, { align: "center", color: cr, q: span(q, 0.14, 0.32), maxW: colW, min: 30 * u });
    const lineY = tall ? A.y + A.h * 0.6 : A.y + A.h - 150 * u;
    const nyMax = lineY - 120 * u;
    const size = clamp(Math.min(nyMax - ly - 30 * u, tall ? 190 * u : 170 * u), 96 * u, 190 * u), ny = ly + 30 * u + size * 0.86;
    const kl = eo(span(q, 0.12, 0.5)), kr = eo(span(q, 0.26, 0.64));
    const ml = write(g, F, fmt(L * kl, d.suffix), xl, ny, size, { italic: false, align: "center", color: cl, q: span(q, 0.1, 0.26), maxW: colW, min: 96 * u });
    const mr = write(g, F, fmt(R * kr, d.suffix), xr, ny, size, { italic: false, align: "center", color: cr, q: span(q, 0.24, 0.4), maxW: colW, min: 96 * u });
    const rel = R > L ? "<" : R < L ? ">" : "=";
    const pulse = 1 + 0.06 * Math.max(0, Math.sin(t * 2.2)) ** 4;
    g.save(); g.translate(A.x + A.w / 2, ny - size * 0.3); g.scale(pulse, pulse);
    write(g, F, rel, 0, 0, size * 0.72, { italic: false, align: "center", base: "middle", color: th.hues[1], q: span(q, 0.5, 0.64) });
    g.restore();
    // The change, boxed, under the relation.
    const pct = L ? Math.round(((R - L) / Math.abs(L)) * 100) : null;
    if (pct !== null) {
      const py = ny + 72 * u, s = `${pct > 0 ? "+" : ""}${fmt(pct)}%`;
      const m = write(g, F, s, A.x + A.w / 2, py, 52 * u, { italic: false, align: "center", base: "middle", color: th.hues[1], q: span(q, 0.66, 0.8) });
      surround(g, F, A.x + A.w / 2 - m.w / 2 - 20 * u, py - 40 * u, m.w + 40 * u, 80 * u, eio(span(q, 0.72, 0.9)), th.hues[1], 2.2 * u, 52 * u);
      if (py + 100 * u < lineY - 100 * u) write(g, F, `${fmt(R)} ÷ ${fmt(L)} = ${(R / L).toFixed(2)}`, A.x + A.w / 2, py + 96 * u, 42 * u, { align: "center", color: th.muted, q: span(q, 0.8, 0.96) });
    }
    // Once built, the working: an arc carries the left figure into the right one with its ratio at the
    // crest, then the change gets its second box, as a final answer does.
    if (late > 0 && L) {
      const k = eio(span(late, 0.0, 0.45));
      const wl = Math.min(colW, measure(g, d.left, 44 * u)), wr = Math.min(colW, measure(g, d.right, 44 * u));
      const ax1 = xl + wl / 2 + 24 * u, ax2 = xr - wr / 2 - 24 * u, ay = ly - 14 * u;
      if (ax2 - ax1 > 160 * u) {
        const crest = ay - 70 * u;
        const hop = new Ln().M(ax1, ay).Q((ax1 + ax2) / 2, crest - 30 * u, ax2, ay);
        arrow(g, F, hop, k, col(th.hues[4], 0.95), 2.4 * u);
        write(g, F, `× ${(R / L).toFixed(2)}`, (ax1 + ax2) / 2, crest - 4 * u, 44 * u, { italic: false, align: "center", color: th.hues[4], q: span(late, 0.2, 0.55) });
      }
      if (pct !== null) {
        const py = ny + 72 * u, bq = eio(span(late, 0.35, 0.75));
        const m2 = measure(g, `${pct > 0 ? "+" : ""}${fmt(pct)}%`, 52 * u, false);
        surround(g, F, A.x + A.w / 2 - m2 / 2 - 30 * u, py - 50 * u, m2 + 60 * u, 100 * u, bq, col(th.hues[1], 0.7), 1.8 * u, 52 * u);
        ping(g, F, A.x + A.w / 2, py, m2 * 0.5, (late - 0.75) / 0.8, th.hues[1]);
      }
    }
    // Number line.
    const top = Math.max(1, Math.abs(L), Math.abs(R)), step = nice(top / 5), end = Math.ceil(top / step) * step;
    const x0 = A.x + 60 * u, x1 = A.x + A.w - 60 * u, X = (v) => x0 + (x1 - x0) * clamp(v / end);
    const nq = eo(span(q, 0.04, 0.26));
    const NL = new Ln().M(x0 - 20 * u, lineY).L(x1 + 30 * u, lineY);
    arrow(g, F, NL, nq, col(th.ink, 0.8), 2 * u);
    for (let v = 0, i = 0; v <= end + 1e-9; v += step, i++) {
      const k = span(q, 0.08 + i * 0.02, 0.22 + i * 0.02), x = X(v);
      if (k <= 0) continue;
      pen(g, col(th.ink, 0.8 * k), 2 * u); g.beginPath(); g.moveTo(x, lineY - 9 * u); g.lineTo(x, lineY + 9 * u); g.stroke();
      write(g, F, fmt(v), x, lineY - 22 * u, 30 * u, { italic: false, align: "center", color: th.muted, q: k });
    }
    const pl = X(Math.abs(L) * eio(span(q, 0.3, 0.62))), pr = X(Math.abs(R) * eio(span(q, 0.42, 0.74)));
    // Dashed leads from each figure down to its point.
    for (const [px, c, v, a] of [[pl, cl, L, 0.3], [pr, cr, R, 0.42]]) {
      if (q <= a) continue;
      pen(g, col(c, 0.6), 1.6 * u, [6 * u, 8 * u], -t * 24 * u);
      g.beginPath(); g.moveTo(px, lineY - 16 * u); g.lineTo(px, lineY - 62 * u); g.stroke();
      write(g, F, fmt(v, d.suffix), px, lineY - 72 * u, 40 * u, { italic: false, align: "center", color: c, q: span(q, a + 0.2, a + 0.32) });
    }
    if (q > 0.3) {
      dot(g, pl, lineY, 11 * u, cl); ping(g, F, pl, lineY, 11 * u, ((t + 0.2) % 2.4) / 1.1, cl);
    }
    if (q > 0.42) {
      dot(g, pr, lineY, 11 * u, cr); ping(g, F, pr, lineY, 11 * u, ((t + 1.4) % 2.4) / 1.1, cr);
    }
    if (tall) {
      // Each value as a block of unit squares, outlined then filled.
      const per = Math.max(1, Math.ceil(Math.max(Math.abs(L), Math.abs(R)) / 24)), cols = 4, s = Math.min(46 * u, colW / 6), gy = lineY + 170 * u;
      [[L, cl, xl, 0.5], [R, cr, xr, 0.6]].forEach(([v, c, cx, a]) => {
        const count = Math.round(Math.abs(v) / per);
        for (let i = 0; i < count; i++) {
          const x = cx - (cols * s * 1.2) / 2 + (i % cols) * s * 1.2, y = gy + Math.floor(i / cols) * s * 1.2;
          if (y + s > A.y + A.h + 100 * u) break;
          const k = span(q, a + i * 0.012, a + 0.12 + i * 0.012), box = new Ln().R(x, y, s, s);
          pen(g, c, 2 * u); box.draw(g, k);
          const lit = Math.floor(t * 2.5) % Math.max(1, count) === i ? 0.3 : 0;
          flood(g, box, { x, y, w: s, h: s }, eo(span(k, 0.5, 1)), c, 0.28 + lit);
        }
        if (per > 1) write(g, F, `□ = ${per}`, cx, gy - 30 * u, 34 * u, { align: "center", color: th.muted, q: span(q, a, a + 0.15) });
      });
    }
    const gap = Math.abs(pr - pl), bq = eo(span(q, 0.74, 0.9));
    if (gap > 30 * u) {
      const a = Math.min(pl, pr), b = Math.max(pl, pr);
      // The measured gap is hatched in, rule by rule, after the working.
      const hq = span(late, 0.5, 1.0);
      if (hq > 0) {
        const nH = Math.max(4, Math.floor((b - a) / (22 * u)));
        pen(g, col(th.hues[3], 0.45), 1.6 * u);
        g.beginPath();
        for (let j = 0; j < nH * hq; j++) { const hx = a + ((b - a) * (j + 0.5)) / nH; g.moveTo(hx - 12 * u, lineY - 4 * u); g.lineTo(hx + 12 * u, lineY - 40 * u); }
        g.stroke();
      }
      const bt = brace(g, F, a, lineY + 24 * u, b, lineY + 24 * u, bq, col(th.ink, 0.85), 20 * u);
      if (bt) {
        write(g, F, `Δ = ${R - L > 0 ? "+" : ""}${fmt(R - L, d.suffix)}`, bt[0], bt[1] + 32 * u, 42 * u, { align: "center", color: th.ink, q: span(q, 0.8, 0.96) });
        // A small marker sweeps the measured gap.
        if (bq >= 1) { const s = 0.5 - 0.5 * Math.cos(t * 1.6); tip(g, lerp(a, b, s), lineY + 14 * u, -Math.PI / 2, 12 * u, th.hues[1]); }
      }
      // The second beat of the hold: the left value slides along the line into the right one under a
      // drawn hop, the brace flares as it lands and the boxed change answers with a flash. It repeats.
      if (late > 0.4 && late < 9) {
        const c = ((late - 0.4) % 2.2) / 2.2, k = eio(span(c, 0.05, 0.55)), land = span(c, 0.55, 0.95);
        const hopTop = lineY - 150 * u;
        const hop = new Ln().M(pl, lineY - 18 * u).Q((pl + pr) / 2, hopTop, pr, lineY - 18 * u);
        g.save(); g.globalAlpha *= 1 - span(c, 0.8, 1);
        pen(g, col(th.hues[1], 0.9), 3 * u, [12 * u, 8 * u], -t * 50 * u); hop.draw(g, k);
        if (k > 0 && k < 1) { const [hx, hy, ha] = hop.at(k); tip(g, hx, hy, ha, 20 * u, th.hues[1]); }
        for (let i = 0; i < 12; i++) {
          const kk = clamp(k - i * 0.025), x = lerp(pl, pr, kk);
          dot(g, x, lineY, (14 - i) * u, col(th.hues[1], (1 - i / 12) * (c < 0.6 ? 1 : 1 - land)));
        }
        if (land > 0) {
          const bt2 = brace(g, F, a, lineY + 24 * u, b, lineY + 24 * u, 1, col(th.hues[1], 1 - land), 20 * u);
          void bt2;
          ping(g, F, pr, lineY, 14 * u, land, th.hues[1]);
          if (pct !== null) {
            const py = ny + 72 * u, m3 = measure(g, `${pct > 0 ? "+" : ""}${fmt(pct)}%`, 52 * u, false);
            pen(g, col(th.hues[1], (1 - land) * textFade(F, 52 * u)), 5 * u); g.strokeRect(A.x + A.w / 2 - m3 / 2 - 20 * u, py - 40 * u, m3 + 40 * u, 80 * u);
          }
        }
        g.restore();
      }
    } else if (q > 0.8) write(g, F, "Δ = 0", (pl + pr) / 2, lineY + 70 * u, 42 * u, { align: "center", color: th.ink, q: span(q, 0.8, 0.96) });
    void mr; void ml;
  }

  const DRAW = { chart, object, people, process, compare };

  // ---- frame ----------------------------------------------------------------------------------------
  let frame = null;
  function makeFrame(S, info) {
    const plan = planOf();
    const F = { S, W: S.W, H: S.H, u: S.u, tall: S.tall, th: theme(S), info, t: info.t, plan };
    F.cam = camera(F);
    return F;
  }
  // Each scene arrives sliding in from the right as its strokes draw; on its way out it slides left
  // and fades while the next scene is drawn in.
  const scene = (id) => (ctx, S, box, p, d, info) => {
    const F = frame && frame.t === info.t ? frame : (frame = makeFrame(S, info));
    const A = areaOf(F, id), u = F.u;
    const exit = info.exit;
    const first = F.plan.shown.length && F.plan.shown[0].id === id;
    const build = Math.min(2.2, Math.max(1, info.hold * 0.56)), lead = first ? 0.3 : 0.15;
    const q = clamp((info.local + lead) / build), late = info.local + lead - build;
    ctx.save();
    const P = exit !== undefined && F.info.scene === "closing" ? echoPlace(F) : null;
    if (P && P.id === id) {
      // Into the closing: the scene shrinks into its echo under the statement instead of leaving.
      const k = eio(exit), s = lerp(1, P.s, k);
      ctx.globalAlpha *= lerp(1, ECHO_ALPHA, k);
      ctx.translate(lerp(P.A0.x, P.dx, k), lerp(P.A0.y, P.dy, k)); ctx.scale(s, s); ctx.translate(-P.A0.x, -P.A0.y);
      F.minText = 66 * u / P.s; F.smallFade = 1 - eo(exit * 1.6);
    } else if (exit !== undefined) { const k = eio(exit); ctx.globalAlpha *= 1 - eo(exit * 1.15); ctx.translate(-130 * u * k, 0); }
    else { const k = 1 - eo(info.local / 0.7); ctx.translate(90 * u * k, 0); }
    DRAW[id](ctx, F, A, exit !== undefined ? 1 : q, d, info.t, exit !== undefined ? Math.max(late, 9) : late);
    F.minText = 0;
    ctx.restore();
  };
  const halo = () => "none";

  return {
    bg: "#000000", panel: "#0b0b0d", ink: "#f2f2f0", muted: "#a6a6a2", accent: "#5bc0e8", onAccent: "#000000",
    rule: "rgba(242,242,240,0.85)", track: "rgba(242,242,240,0.1)",
    display: "'Iowan Old Style', Palatino, 'Palatino Linotype', Georgia, serif", displayWeight: 500, displayCase: "none", displayTracking: "0em",
    displayStyle: "italic",
    body: "'Iowan Old Style', Palatino, 'Palatino Linotype', Georgia, serif", bodyWeight: 400,
    figures: "'Iowan Old Style', Palatino, Georgia, serif", radius: 0, motion: "stroke", change: "fade", kit: { line: 2.4, fill: "none", panel: "outline", italic: true },
    panelEdge: "rgba(242,242,240,0.55)",
    hues: ["#5bc0e8", "#f4d35e", "#8fd694", "#ff7a6b", "#c7a6ff"], gridTone: "#5bc0e8", vignette: 0.55,
    palettes: {
      light: { bg: "#f7f5ef", panel: "#ffffff", ink: "#1b1b1b", muted: "#5f5f5a", accent: "#1f6fa8", onAccent: "#ffffff", rule: "rgba(27,27,27,0.8)", track: "rgba(27,27,27,0.08)", panelEdge: "rgba(27,27,27,0.5)",
        hues: ["#1f6fa8", "#b7791f", "#2f855a", "#c53030", "#6b46c1"], gridTone: "#1f6fa8", vignette: 0.08,
        backdrop: () => "#f7f5ef" },
      dark: { bg: "#0b1220", gridTone: "#7fb2ff", vignette: 0.5, backdrop: (accent) => `radial-gradient(80% 70% at 50% 50%, ${hexA(accent, 0.06)} 0%, rgba(0,0,0,0) 70%), #0b1220` },
      mono: { accent: "#f2f2f0", onAccent: "#000000", hues: ["#f2f2f0", "#d9d9d4", "#a8a8a3", "#8c8c88", "#bdbdb8"], gridTone: "#f2f2f0" },
    },
    backdrop: (accent) => `radial-gradient(80% 70% at 50% 50%, ${hexA(accent, 0.035)} 0%, rgba(0,0,0,0) 70%), #000000`,
    textShadow: halo,
    // Only on the illustrated explainer (the page with the #art canvas): the kicker reads as a bold upright
    // proposition heading rather than tracked capitals.
    // Headlines keep their ink while the reveal sweeps left to right and the canvas draws a pen nib riding
    // the sweep, so writing never flips from outline to fill in one frame. In wide frames the opening and
    // closing statements sit high, leaving the lower frame to their diagrams.
    css: (accent) => `#art ~ #title-scene .kicker { font-family: var(--display); font-style: normal; font-weight: 700; text-transform: none; letter-spacing: 0.01em; color: ${accent}; transform: scale(1.5); transform-origin: 0 100%; }
#art ~ .scene .display, #art ~ .scene .kicker { -webkit-text-fill-color: currentColor !important; }
@media (min-aspect-ratio: 1/1) { #art ~ #title-scene, #art ~ #closing-scene { justify-content: flex-start; top: 15%; } #art ~ #closing-scene { top: 13%; } }
@media (max-aspect-ratio: 1/1) { #art ~ #closing-scene { justify-content: flex-start; top: 11%; } }`,
    keepArt: true,
    overlap: true,
    stage(ctx, S, info) {
      const F = (frame = makeFrame(S, info));
      const { W, H } = F;
      if (F.plan.backdrop) {
        plane(ctx, F);
        const v = F.th.vignette;
        if (v > 0) {
          const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.6);
          gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, `rgba(0,0,0,${v})`);
          ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
        }
        margins(ctx, F);
        clock(ctx, F);
      }
      const sh = F.plan.shown;
      if (info.scene === "title") titleDecor(ctx, F, info.local, info.hold);
      else if (info.index === 1 && sh[0] && sh[0].id === "title" && info.local < info.change) titleDecor(ctx, F, sh[0].hold + info.local, sh[0].hold, clamp(info.local / Math.max(0.01, info.change)));
      if (info.scene === "closing") closingDecor(ctx, F, info.local);
      nibs(ctx, F);
    },
    scenes: { chart: scene("chart"), object: scene("object"), people: scene("people"), process: scene("process"), compare: scene("compare") },
  };
});
