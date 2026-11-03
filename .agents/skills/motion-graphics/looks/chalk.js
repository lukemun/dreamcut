// Chalk: a classroom slate in an oak frame. Broken, grainy chalk line-work in white and coloured
// sticks over a board clouded with old eraser smears and the ghosts of earlier lessons. A chalk stick
// writes every line and headline; a felt eraser swipes the board between scenes, revealing the next
// lesson's faint guide marks behind it; a wooden pointer taps through each finished drawing while
// dust drifts down. All drawings are original. Frames are pure functions of time.
window.DreamcutMotion.register("chalk", ({ smudge, rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const inout = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const quad = (v) => { v = clamp(v); return v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2; };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const HAND = "'Chalkboard SE', 'Marker Felt', 'Comic Sans MS', 'Segoe Print', cursive";
  const DRAWN = new Set(["chart", "object", "people", "process", "compare"]);
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  const HEADS = { title: "title", chart: "chart-title", object: "object-title", people: "people-title", process: "process-title", compare: "compare-title", closing: "closing" };
  const fmt = (target, k, d) => {
    const dec = Math.abs((Number(target) || 0) % 1) > 0.001 ? 1 : 0;
    return window.DreamcutMotion.formatNumber((Number(target) || 0) * k, dec, (d && d.prefix) || "", (d && d.suffix) || "");
  };
  const lum = (hex) => { const n = parseInt(String(hex).slice(1, 7), 16); return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); };

  // ---- hand-drawn paths that can be stroked part-way ----------------------------------------------
  // Points wobble smoothly along their running length, so a straight line reads as drawn by hand.
  class Pth {
    constructor(amp = 0, seed = 1) { this.s = []; this.c = null; this.amp = amp; this.seed = seed; this.run = 0; this.n = -1; this.lx = 0; this.ly = 0; }
    _p(x, y) {
      if (!this.amp) return [x, y];
      const r = this.run, s = this.seed, a = this.amp;
      return [x + a * (Math.sin(r * 0.019 + s) * 0.6 + Math.sin(r * 0.051 + s * 2.3) * 0.4), y + a * (Math.sin(r * 0.023 + s * 1.7) * 0.6 + Math.sin(r * 0.047 + s * 3.1) * 0.4)];
    }
    M(x, y) { this.lx = x; this.ly = y; this.run += 37; const [a, b] = this._p(x, y); this.c = [a, b]; this.s.push(this.c); return this; }
    L(x, y) {
      if (!this.c) return this.M(x, y);
      const d = Math.hypot(x - this.lx, y - this.ly), n = Math.max(1, Math.ceil(d / 9));
      for (let i = 1; i <= n; i++) {
        const k = i / n; this.run += d / n;
        const [a, b] = this._p(this.lx + (x - this.lx) * k, this.ly + (y - this.ly) * k);
        this.c.push(a, b);
      }
      this.lx = x; this.ly = y;
      return this;
    }
    Q(cx, cy, x, y) {
      const x0 = this.lx, y0 = this.ly, n = 18;
      for (let i = 1; i <= n; i++) { const k = i / n, m = 1 - k; this.L(m * m * x0 + 2 * m * k * cx + k * k * x, m * m * y0 + 2 * m * k * cy + k * k * y); }
      return this;
    }
    E(cx, cy, rx, ry, a0, a1, move) {
      const steps = Math.max(8, Math.ceil((Math.abs(a1 - a0) * Math.max(rx, ry)) / 8));
      for (let i = 0; i <= steps; i++) {
        const a = a0 + ((a1 - a0) * i) / steps, x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
        if (i === 0 && (move || !this.c)) this.M(x, y); else this.L(x, y);
      }
      return this;
    }
    // A hand-drawn circle overshoots its start a little.
    O(cx, cy, r, from = -2.2, over = 0.35) { return this.E(cx, cy, r, r, from, from + TAU + over, true); }
    R(x, y, w, h) { return this.M(x, y).L(x + w, y).L(x + w, y + h).L(x, y + h).L(x, y - 2); }
    RR(x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      this.M(x + r, y).L(x + w - r, y).E(x + w - r, y + r, r, r, -Math.PI / 2, 0).L(x + w, y + h - r).E(x + w - r, y + h - r, r, r, 0, Math.PI / 2);
      return this.L(x + r, y + h).E(x + r, y + h - r, r, r, Math.PI / 2, Math.PI).L(x, y + r).E(x + r, y + r, r, r, Math.PI, Math.PI * 1.5);
    }
    poly(pts) { pts.forEach(([x, y], i) => (i ? this.L(x, y) : this.M(x, y))); return this; }
    trace(g) { for (const s of this.s) { g.moveTo(s[0], s[1]); for (let i = 2; i < s.length; i += 2) g.lineTo(s[i], s[i + 1]); } }
    len() {
      if (this.n >= 0) return this.n;
      let n = 0;
      for (const s of this.s) for (let i = 2; i < s.length; i += 2) n += Math.hypot(s[i] - s[i - 2], s[i + 1] - s[i - 1]);
      return (this.n = n);
    }
    // The point at fraction k of the path's length.
    at(k) {
      let left = this.len() * clamp(k);
      for (const s of this.s) for (let i = 2; i < s.length; i += 2) {
        const dx = s[i] - s[i - 2], dy = s[i + 1] - s[i - 1], d = Math.hypot(dx, dy);
        if (d >= left) { const f = d ? left / d : 0; return [s[i - 2] + dx * f, s[i - 1] + dy * f, Math.atan2(dy, dx)]; }
        left -= d;
      }
      const s = this.s[this.s.length - 1] || [0, 0];
      return [s[s.length - 2], s[s.length - 1], 0];
    }
    // Stroke the first q of the length; returns the pen's position.
    draw(g, q = 1) {
      if (q <= 0 || !this.s.length) return null;
      g.beginPath();
      if (q >= 1) { this.trace(g); g.stroke(); return null; }
      let left = this.len() * q;
      for (const s of this.s) {
        g.moveTo(s[0], s[1]);
        for (let i = 2; i < s.length; i += 2) {
          const dx = s[i] - s[i - 2], dy = s[i + 1] - s[i - 1], d = Math.hypot(dx, dy);
          if (d >= left) { const k = d ? left / d : 0, x = s[i - 2] + dx * k, y = s[i - 1] + dy * k; g.lineTo(x, y); g.stroke(); return [x, y]; }
          left -= d;
          g.lineTo(s[i], s[i + 1]);
        }
      }
      g.stroke();
      return null;
    }
  }

  // ---- per-frame state ---------------------------------------------------------------------------
  let ST = null;
  function controls() {
    if (window.__dreamcut && window.__dreamcut.controls) return window.__dreamcut.controls;
    try { if (typeof dc !== "undefined" && dc && dc.controls) return dc.controls; } catch (e) { /* not on this page */ }
    return null;
  }
  let planCache = null;
  function planOf() {
    if (planCache) return planCache.shown ? planCache : null;
    const c = controls();
    if (!c) { planCache = {}; return null; }
    let t = 0;
    const shown = [];
    for (const id of ORDER) { const hold = Number(c[`${id}_hold`]) || 0; if (hold > 0) shown.push({ id, start: t, hold }); t += hold; }
    planCache = { shown, entrance: Number(c.entrance) || 0.7, backdrop: c.backdrop !== false };
    return planCache;
  }
  function tone(S) {
    const look = S.look, light = lum(look.bg) > 150, mono = String(S.accent).toLowerCase() === String(look.ink).toLowerCase();
    return {
      board: look.bg, chalk: look.ink, muted: look.muted, acc: S.accent, light, mono,
      c2: mono ? look.muted : light ? "#c7406f" : "#f3a2b8", c3: mono ? look.muted : light ? "#2c78ad" : "#9fd2ee",
      grain: light ? 0.55 : 1, halo: light ? 0.12 : 1, tex: look.texture,
    };
  }

  // ---- chalk marks on the layer ------------------------------------------------------------------
  function setTip(g, pt, col) {
    if (!pt || !ST || ST.exiting) return;
    const m = g.getTransform(), x = m.a * pt[0] + m.c * pt[1] + m.e, y = m.b * pt[0] + m.d * pt[1] + m.f;
    ST.tip = [x, y]; ST.tipColor = col;
  }
  // A chalk stroke: a firm line plus a lighter, offset second pass, so the grain leaves a broken edge.
  function chalk(g, P, q, col, w) {
    if (q <= 0) return;
    const u = ST.S.u;
    g.save();
    g.strokeStyle = col; g.lineWidth = w; g.lineCap = "round"; g.lineJoin = "round"; g.setLineDash([]);
    const tip = P.draw(g, q);
    g.globalAlpha *= 0.5; g.lineWidth = w * 0.55; g.translate(1.4 * u, -1.1 * u);
    P.draw(g, q);
    g.restore();
    if (tip) setTip(g, tip, col);
  }
  // A faint dashed guide mark, the kind a teacher sketches before the real line.
  function guide(g, P, col, a = 0.3) {
    const u = ST.S.u;
    g.save(); g.strokeStyle = col; g.globalAlpha *= a; g.lineWidth = 2.4 * u; g.lineCap = "round"; g.setLineDash([3 * u, 11 * u]);
    P.draw(g, 1); g.restore();
  }
  function dot(g, x, y, r, col) { g.save(); g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.restore(); }
  function fontOf(size, weight = 700) { return `${weight} ${size}px ${HAND}`; }
  function measure(g, s, size, weight) { g.font = fontOf(size, weight); return g.measureText(String(s)).width; }
  // Handwriting: the words reveal left to right behind the chalk; returns the width and size used.
  function write(g, s, x, y, size, o = {}) {
    s = String(s ?? "");
    const q = o.q ?? 1, weight = o.weight || 700;
    let w = measure(g, s, size, weight);
    if (o.maxW && w > o.maxW) { size = Math.max(o.min || size * 0.7, (size * o.maxW) / w); w = measure(g, s, size, weight); }
    if (!s || q <= 0) return { w, size };
    const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    g.save();
    g.font = fontOf(size, weight);
    g.textAlign = "left"; g.textBaseline = "middle"; g.fillStyle = o.color;
    if (q < 1) { g.beginPath(); g.rect(x0 - size * 0.3, y - size * 1.2, size * 0.3 + w * q, size * 2.4); g.clip(); }
    g.fillText(s, x0, y);
    g.restore();
    if (q < 1) setTip(g, [x0 + w * q, y + size * 0.18], o.color);
    return { w, size, x0 };
  }
  function arrowHead(P, x, y, ang, s) {
    P.M(x + Math.cos(ang + 2.6) * s, y + Math.sin(ang + 2.6) * s).L(x, y).L(x + Math.cos(ang - 2.6) * s, y + Math.sin(ang - 2.6) * s);
    return P;
  }
  // A zig-zag scribble filling a rectangle from the bottom up.
  function scribble(x, y, w, h, step, seed, amp) {
    const P = new Pth(amp, seed);
    let k = 0;
    P.M(x, y + h);
    for (let yy = y + h; yy > y; yy -= step) { P.L(k % 2 ? x : x + w, Math.max(y, yy - step * 0.6)); k++; }
    return P;
  }

  // ---- textures ----------------------------------------------------------------------------------
  let tileSet = null;
  function tiles() {
    if (tileSet) return tileSet;
    const make = (n) => { const c = document.createElement("canvas"); c.width = c.height = n; return c; };
    const sp = make(180), g = sp.getContext("2d"), r = rng(7);
    g.fillStyle = "#000";
    for (let i = 0; i < 5200; i++) { const s = 0.6 + r() * 1.7; g.globalAlpha = 0.45 + r() * 0.55; g.fillRect(r() * 180, r() * 180, s, s * (0.5 + r())); }
    const pr = make(420), h = pr.getContext("2d"), r2 = rng(19);
    for (let i = 0; i < 70; i++) {
      const x = r2() * 420, y = r2() * 420, rad = 20 + r2() * 70;
      for (const [ox, oy] of [[0, 0], [420, 0], [-420, 0], [0, 420], [0, -420]]) {
        const gr = h.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        gr.addColorStop(0, `rgba(0,0,0,${0.25 + r2() * 0.5})`); gr.addColorStop(1, "rgba(0,0,0,0)");
        h.fillStyle = gr; h.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
      }
    }
    return (tileSet = { speck: sp, press: pr, pats: new WeakMap() });
  }
  function pattern(g, name) {
    const T = tiles();
    let m = T.pats.get(g);
    if (!m) { m = {}; T.pats.set(g, m); }
    return m[name] || (m[name] = g.createPattern(T[name], "repeat"));
  }
  let LC = null, LG = null;
  function layer(S) {
    if (!LC || LC.width !== S.W || LC.height !== S.H) { LC = document.createElement("canvas"); LC.width = S.W; LC.height = S.H; LG = LC.getContext("2d"); }
    LG.setTransform(1, 0, 0, 1, 0, 0); LG.globalAlpha = 1; LG.globalCompositeOperation = "source-over"; LG.filter = "none"; LG.setLineDash([]);
    LG.clearRect(0, 0, S.W, S.H);
    return LG;
  }
  // Break the chalk with grain and pressure, then lay it on the board with a faint dust halo.
  function composite(ctx, S, T) {
    const g = LG, tex = T.tex;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "destination-out";
    g.globalAlpha = 0.9 * tex * T.grain; g.fillStyle = pattern(g, "speck"); g.fillRect(0, 0, S.W, S.H);
    g.globalAlpha = 0.45 * tex * T.grain; g.fillStyle = pattern(g, "press"); g.fillRect(0, 0, S.W, S.H);
    g.restore();
    ctx.save();
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * 0.4 * T.halo * Math.max(0.3, tex); ctx.filter = `blur(${5 * S.u}px)`; ctx.drawImage(LC, 0, 0);
    ctx.filter = "none"; ctx.globalAlpha = a; ctx.drawImage(LC, 0, 0);
    ctx.restore();
  }

  // ---- the board -----------------------------------------------------------------------------------
  const frameW = (S) => 26 * S.u, trayH = (S) => 50 * S.u;
  let boardC = null, boardKey = "";
  function board(S, T) {
    const { W, H, u } = S, key = `${W}x${H}:${T.board}:${T.chalk}:${T.acc}:${T.tex}`;
    if (boardC && boardKey === key) return boardC;
    boardC = boardC || document.createElement("canvas"); boardC.width = W; boardC.height = H; boardKey = key;
    const g = boardC.getContext("2d"), r = rng(23), tex = T.tex, fw = frameW(S), th = trayH(S);
    // A dark board is lifted to a richer slate of its own hue, so the surface survives compression.
    const n0 = parseInt(String(T.board).slice(1, 7), 16), ch = [(n0 >> 16) & 255, (n0 >> 8) & 255, n0 & 255];
    const slate = T.light ? T.board : `rgb(${ch.map((c, k) => Math.min(255, Math.round(c * 1.42 + [2, 6, 4][k]))).join(",")})`;
    g.fillStyle = slate; g.fillRect(0, 0, W, H);
    const lift = g.createRadialGradient(W * 0.45, H * 0.4, 0, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.6);
    lift.addColorStop(0, T.light ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.07)"); lift.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = lift; g.fillRect(0, 0, W, H);
    // Cloudy dust: mid-sized blotches, lighter and darker, so the slate is never one flat tone.
    g.save(); g.filter = `blur(${28 * u}px)`;
    for (let i = 0; i < 60; i++) {
      const light = r() < 0.6;
      g.globalAlpha = (light ? 0.03 + r() * 0.05 : 0.08 + r() * 0.1) * tex * (T.light ? 0.4 : 1);
      g.fillStyle = light ? T.chalk : "#000";
      g.beginPath(); g.ellipse(r() * W, r() * H, (60 + r() * 220) * u, (30 + r() * 110) * u, r() * Math.PI, 0, TAU); g.fill();
    }
    g.restore();
    // Old eraser swipes: broad soft arcs of chalk dust.
    g.save(); g.filter = `blur(${14 * u}px)`; g.strokeStyle = T.chalk; g.lineCap = "round";
    for (let i = 0; i < 34; i++) {
      g.globalAlpha = (0.035 + r() * 0.055) * tex * (T.light ? 0.5 : 1);
      g.lineWidth = (50 + r() * 110) * u;
      const x = r() * W, y = r() * H, len = (160 + r() * 420) * u, turns = 2 + Math.floor(r() * 4), amp = (30 + r() * 80) * u;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 1; k <= turns * 6; k++) { const f = k / (turns * 6); g.lineTo(x + len * f, y + Math.sin(f * turns * TAU) * amp); }
      g.stroke();
    }
    g.restore();
    // Ghosts of earlier lessons, half wiped.
    g.save(); g.filter = `blur(${1.6 * u}px)`; g.fillStyle = T.chalk; g.strokeStyle = T.chalk; g.lineWidth = 4 * u; g.lineCap = "round";
    const ghosts = ["3 + 4 = 7", "x = 12", "a · b", "½ + ¼", "7 × 8", "Δt", "y = 2x + 1", "√49", "10 ÷ 2", "π r²"];
    for (let i = 0; i < 16; i++) {
      g.globalAlpha = (0.05 + r() * 0.06) * tex;
      g.save(); g.translate(r() * W, fw + r() * (H - fw - th)); g.rotate((r() - 0.5) * 0.25);
      const kind = i % 4;
      if (kind < 2) { g.font = fontOf((44 + r() * 50) * u); g.fillText(ghosts[i % ghosts.length], 0, 0); }
      else if (kind === 2) { g.beginPath(); g.moveTo(0, 0); for (let k = 0; k < 40; k++) g.lineTo(k * 8 * u, Math.sin(k * 0.35) * 40 * u); g.stroke(); }
      else { g.beginPath(); for (let k = 0; k < 4; k++) { g.moveTo(k * 22 * u, 0); g.lineTo(k * 22 * u + 4 * u, 70 * u); } g.moveTo(-10 * u, 50 * u); g.lineTo(90 * u, 18 * u); g.stroke(); }
      g.restore();
    }
    g.restore();
    // Fine slate grain.
    g.save();
    for (let i = 0; i < (W * H) / 260; i++) {
      g.globalAlpha = (0.03 + r() * 0.07) * tex;
      g.fillStyle = r() < 0.5 ? T.chalk : "#000";
      const s = (0.6 + r() * 1.4) * u; g.fillRect(r() * W, r() * H, s, s);
    }
    g.restore();
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, `rgba(0,0,0,${T.light ? 0.12 : 0.42})`);
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    // The oak frame and its chalk tray.
    const wood = (x, y, w, h, vertical, seed) => {
      const gr = vertical ? g.createLinearGradient(x, 0, x + w, 0) : g.createLinearGradient(0, y, 0, y + h);
      gr.addColorStop(0, "#8a5a30"); gr.addColorStop(0.45, "#a46c3a"); gr.addColorStop(1, "#6a4020");
      g.fillStyle = gr; g.fillRect(x, y, w, h);
      const rr = rng(seed);
      g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
      g.strokeStyle = "rgba(60,32,12,0.35)"; g.lineWidth = 1.2 * u;
      for (let k = 0; k < (vertical ? w : h) / (3.4 * u); k++) {
        const o = rr() * (vertical ? w : h), wav = (2 + rr() * 5) * u, ph = rr() * 10;
        g.beginPath();
        if (vertical) { for (let yy = y; yy <= y + h; yy += 30 * u) g.lineTo(x + o + Math.sin(yy * 0.004 + ph) * wav, yy); }
        else { for (let xx = x; xx <= x + w; xx += 30 * u) g.lineTo(xx, y + o + Math.sin(xx * 0.004 + ph) * wav); }
        g.stroke();
      }
      g.restore();
    };
    wood(0, 0, W, fw, false, 3); wood(0, 0, fw, H, true, 5); wood(W - fw, 0, fw, H, true, 7);
    // Inner shadow where the board meets the frame.
    const inner = (x, y, w, h, x0, y0, x1, y1) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, "rgba(0,0,0,0.45)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(x, y, w, h); };
    inner(fw, fw, W - fw * 2, 18 * u, 0, fw, 0, fw + 18 * u);
    inner(fw, fw, 18 * u, H - fw, fw, 0, fw + 18 * u, 0);
    inner(W - fw - 18 * u, fw, 18 * u, H - fw, W - fw, 0, W - fw - 18 * u, 0);
    // Tray: a top face, a lip and its shadow on the board above.
    inner(fw, H - th - 22 * u, W - fw * 2, 22 * u, 0, H - th, 0, H - th - 22 * u);
    wood(0, H - th, W, th, false, 11);
    const lip = g.createLinearGradient(0, H - th, 0, H - th + 14 * u);
    lip.addColorStop(0, "rgba(255,225,180,0.35)"); lip.addColorStop(1, "rgba(255,225,180,0)");
    g.fillStyle = lip; g.fillRect(0, H - th, W, 14 * u);
    // Dust collected in the tray, and spare sticks lying in it.
    g.save(); g.filter = `blur(${3 * u}px)`; g.fillStyle = T.light ? "rgba(255,255,255,0.4)" : "rgba(240,238,228,0.35)";
    for (let k = 0; k < 14; k++) { g.beginPath(); g.ellipse(fw + r() * (W - fw * 2), H - th + 16 * u, (30 + r() * 90) * u, 5 * u, 0, 0, TAU); g.fill(); }
    g.restore();
    const sticks = [[0.12, T.chalk, 0.04], [0.16, T.acc, -0.05], [0.205, T.c2, 0.08], [0.24, T.c3, -0.02], [0.9, T.chalk, 0.03]];
    for (const [fx, col, rot] of sticks) stick(g, S, W * fx, H - th + 18 * u, col, rot, 0.8);
    return boardC;
  }
  // A stick of chalk lying flat (rot near 0) or held writing (tip at x, y).
  function stick(g, S, x, y, col, rot, scale = 1, held = false) {
    const u = S.u * scale, len = (held ? 120 : 90) * u, th = 20 * u;
    g.save(); g.translate(x, y); g.rotate(rot);
    g.shadowColor = "rgba(0,0,0,0.45)"; g.shadowBlur = 10 * u; g.shadowOffsetX = 4 * u; g.shadowOffsetY = 8 * u;
    const x0 = held ? 6 * u : -len / 2;
    g.beginPath(); g.moveTo(x0 + th * 0.4, -th / 2); g.lineTo(x0 + len, -th / 2); g.arc(x0 + len, 0, th / 2, -Math.PI / 2, Math.PI / 2); g.lineTo(x0 + th * 0.4, th / 2);
    g.quadraticCurveTo(x0 - th * 0.15, 0, x0 + th * 0.4, -th / 2);
    g.fillStyle = col; g.fill();
    g.shadowColor = "transparent";
    const sh = g.createLinearGradient(0, -th / 2, 0, th / 2);
    sh.addColorStop(0, "rgba(255,255,255,0.35)"); sh.addColorStop(0.5, "rgba(255,255,255,0)"); sh.addColorStop(1, "rgba(0,0,0,0.28)");
    g.fillStyle = sh; g.fill();
    g.restore();
  }
  function eraserAt(g, S, x, y, ang, scale = 1) {
    const u = S.u * scale, w = 240 * u, h = 92 * u;
    g.save(); g.translate(x, y); g.rotate(ang);
    g.shadowColor = "rgba(0,0,0,0.5)"; g.shadowBlur = 24 * u; g.shadowOffsetX = 8 * u; g.shadowOffsetY = 16 * u;
    const rr = (x0, y0, w0, h0, r0) => { g.beginPath(); g.moveTo(x0 + r0, y0); g.arcTo(x0 + w0, y0, x0 + w0, y0 + h0, r0); g.arcTo(x0 + w0, y0 + h0, x0, y0 + h0, r0); g.arcTo(x0, y0 + h0, x0, y0, r0); g.arcTo(x0, y0, x0 + w0, y0, r0); g.closePath(); };
    rr(-w / 2, -h / 2, w, h, 14 * u); g.fillStyle = "#3b3a3f"; g.fill();
    g.shadowColor = "transparent";
    rr(-w / 2, -h / 2, w, h * 0.62, 14 * u);
    const gr = g.createLinearGradient(0, -h / 2, 0, h * 0.12);
    gr.addColorStop(0, "#c08a52"); gr.addColorStop(1, "#8c5a2c"); g.fillStyle = gr; g.fill();
    g.strokeStyle = "rgba(70,38,14,0.4)"; g.lineWidth = 1.4 * u;
    for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(-w / 2 + 12 * u, -h / 2 + (10 + k * 8) * u); g.bezierCurveTo(-w / 6, -h / 2 + (6 + k * 8) * u, w / 6, -h / 2 + (14 + k * 8) * u, w / 2 - 12 * u, -h / 2 + (9 + k * 8) * u); g.stroke(); }
    // Chalk-dusted felt.
    g.fillStyle = "rgba(235,232,222,0.55)";
    const r = rng(41);
    for (let k = 0; k < 90; k++) g.fillRect(-w / 2 + r() * w, h * 0.14 + r() * h * 0.34, (2 + r() * 14) * u, (1 + r() * 2) * u);
    g.restore();
  }
  function pointerAt(g, S, tx, ty, bx, by) {
    const u = S.u, ang = Math.atan2(ty - by, tx - bx), len = Math.hypot(tx - bx, ty - by);
    g.save(); g.translate(bx, by); g.rotate(ang);
    g.shadowColor = "rgba(0,0,0,0.45)"; g.shadowBlur = 18 * u; g.shadowOffsetX = 6 * u; g.shadowOffsetY = 14 * u;
    g.beginPath(); g.moveTo(0, -12 * u); g.lineTo(len, -4 * u); g.arc(len, 0, 4 * u, -Math.PI / 2, Math.PI / 2); g.lineTo(0, 12 * u); g.closePath();
    const gr = g.createLinearGradient(0, -12 * u, 0, 12 * u);
    gr.addColorStop(0, "#d9a668"); gr.addColorStop(0.5, "#b07a42"); gr.addColorStop(1, "#7a4c22");
    g.fillStyle = gr; g.fill();
    g.shadowColor = "transparent";
    g.beginPath(); g.moveTo(len - 30 * u, -5.2 * u); g.lineTo(len, -4 * u); g.arc(len, 0, 4 * u, -Math.PI / 2, Math.PI / 2); g.lineTo(len - 30 * u, 5.2 * u); g.closePath();
    g.fillStyle = "#26211d"; g.fill();
    g.restore();
  }

  // ---- the eraser between scenes -----------------------------------------------------------------
  // E runs 0→1 across a change: 0→0.5 over the outgoing scene's last `change` seconds, 0.5→1 over the
  // incoming scene's first. The eraser swipes up and down while it travels left to right.
  function eraserPath(S, E) {
    const { W, H } = S, top = frameW(S) + 70 * S.u, bot = H - trayH(S) - 70 * S.u;
    const x = -0.06 * W + 1.12 * W * E, y = lerp(top, bot, 0.5 + 0.5 * Math.sin(E * TAU * 3.2 - Math.PI / 2));
    return [x, y];
  }
  function edgeX(S, E, y) { return -0.1 * S.W + 1.2 * S.W * E + Math.sin(y * 0.011 + E * 9) * 26 * S.u - 80 * S.u; }
  function erasedRegion(g, S, E) {
    g.beginPath(); g.moveTo(-10, -10);
    for (let y = -10; y <= S.H + 10; y += 24) g.lineTo(edgeX(S, E, y), y);
    g.lineTo(-10, S.H + 10); g.closePath();
  }
  function eraseNow() {
    const i = ST.info;
    if (!i.scene) return 0;
    if (i.next && i.local > i.hold - i.change) return clamp((i.local - (i.hold - i.change)) / (2 * i.change));
    if (i.index > 0 && i.local < i.change) return 0.5 + 0.5 * clamp(i.local / Math.max(0.01, i.change));
    return 0;
  }
  // Apply a change to the layer's art: wipe what the eraser has passed (out) or keep only that (in).
  function applyErase(g, S, E, keep) {
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = keep ? "destination-in" : "destination-out";
    erasedRegion(g, S, E); g.fillStyle = "#000"; g.fill();
    g.restore();
  }
  // The smear the last swipe left: bright while fresh, settling to a faint haze for the rest of the scene.
  function smear(ctx, S, T) {
    const i = ST.info;
    let E = 0, k = 0;
    if (i.next && i.local > i.hold - i.change) { E = eraseNow(); k = 1; }
    else if (i.index > 0) { E = Math.min(1, 0.5 + 0.5 * i.local / Math.max(0.01, i.change)); k = 1 - 0.9 * span(i.local, i.change, i.change + 1.6); }
    if (E <= 0) return;
    ctx.save(); ctx.filter = `blur(${14 * S.u}px)`; ctx.strokeStyle = T.chalk; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.globalAlpha = 0.06 * k * T.tex * (T.light ? 0.6 : 1); ctx.lineWidth = 46 * S.u;
    ctx.beginPath();
    for (let e = 0; e <= E; e += 0.004) { const [x, y] = eraserPath(S, e); e ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
    ctx.restore();
  }

  // ---- headline measurement and the chalk that writes it ------------------------------------------
  const headCache = {};
  function head(id) {
    if (headCache[id]) return headCache[id];
    const el = document.getElementById(id), root = document.getElementById("root");
    if (!el || !root || !el.firstChild) return (headCache[id] = { lines: [] });
    let ox = 0, oy = 0;
    for (let n = el; n && n !== root; n = n.offsetParent) { ox += n.offsetLeft; oy += n.offsetTop; }
    const scale = root.getBoundingClientRect().width / (Number(root.dataset.width) || 1920) || 1;
    const er = el.getBoundingClientRect(), range = document.createRange();
    range.selectNodeContents(el);
    const lines = [];
    for (const r of range.getClientRects()) {
      const line = { x: ox + (r.left - er.left) / scale, y: oy + (r.top - er.top) / scale, w: r.width / scale, h: r.height / scale };
      if (line.w > 1 && !lines.some((o) => Math.abs(o.y - line.y) < 2)) lines.push(line);
    }
    return (headCache[id] = { x: ox, y: oy, w: el.offsetWidth, h: el.offsetHeight, lines });
  }
  function headBottom(S, id, fallback) {
    const H = head(id);
    return H.lines.length ? Math.max(...H.lines.map((l) => l.y + l.h)) : fallback;
  }
  // The template writes headlines with a left-to-right reveal; the chalk rides its edge.
  function headTip(S) {
    const i = ST.info, P = planOf();
    if (!i.scene || !HEADS[i.scene]) return null;
    const e = P ? P.entrance : 0.7, start = i.scene === "title" ? 0.12 : 0, dur = e * 1.15;
    const k = (i.local - start) / dur;
    if (k <= 0.02 || k >= 0.98) return null;
    const H = head(HEADS[i.scene]);
    if (!H.lines.length) return null;
    const x = H.x + H.w * quad(k), last = H.lines[H.lines.length - 1];
    const line = H.lines.find((l) => x >= l.x && x <= l.x + l.w) || (x <= last.x + last.w ? H.lines[0] : null);
    if (!line) return null;
    return [x, line.y + line.h * 0.72];
  }

  // ---- scenes ------------------------------------------------------------------------------------
  // Each returns the points the pointer taps once the drawing is finished.
  function chart(g, S, T, b, p, d, X) {
    const u = S.u, n = d.values.length, vals = d.values.map((v) => Number(v) || 0), max = Math.max(...vals, 1), W5 = 6.4 * u;
    const hot = clamp(Math.round(d.highlight), 0, n - 1);
    // The plot claims the board under the headline: the axis sits near the frame, its scale beside it.
    const hb = headBottom(S, "chart-title", b.y - 60 * u);
    const left = Math.max(frameW(S) + 150 * u, b.x + 70 * u), right = b.x + b.w - 10 * u, base = b.y + b.h - 70 * u;
    const top = Math.min(b.y + 132 * u, Math.max(hb + 230 * u, b.y - 40 * u));
    const slot = (right - left - 24 * u) / n, bw = slot * 0.56;
    const bars = vals.map((v, i) => { const h = Math.max(6 * u, (base - top) * (v / max)); const x = left + 24 * u + slot * i + (slot - bw) / 2; return { x, h, cx: x + bw / 2, top: base - h }; });
    // Guides.
    const gd = new Pth(1.2 * u, 3).M(left, top - 50 * u).L(left, base).L(right, base);
    bars.forEach((r) => gd.R(r.x, r.top, bw, r.h));
    guide(g, gd, T.chalk);
    // Axes, ticks and faint gridlines.
    const ax = new Pth(1.6 * u, 5).M(left, top - 60 * u).L(left, base).L(right, base);
    chalk(g, ax, span(p, 0, 0.16), T.chalk, W5);
    if (p > 0.16) {
      chalk(g, arrowHead(new Pth(0.8 * u, 6), left, top - 60 * u, -Math.PI / 2, 22 * u), span(p, 0.16, 0.2), T.chalk, W5);
      chalk(g, arrowHead(new Pth(0.8 * u, 7), right, base, 0, 22 * u), span(p, 0.16, 0.2), T.chalk, W5);
      const tk = new Pth(0.5 * u, 8);
      for (let k = 1; k <= 4; k++) { const y = lerp(base, top, k / 4); tk.M(left - 14 * u, y).L(left + 14 * u, y); }
      chalk(g, tk, span(p, 0.18, 0.26), T.chalk, 4 * u);
      // The scale, written beside each tick.
      for (let k = 1; k <= 4; k++) {
        const y = lerp(base, top, k / 4), v = (max * k) / 4;
        write(g, fmt(Math.abs(v % 1) > 0.05 ? Math.round(v * 10) / 10 : Math.round(v), 1, d), left - 28 * u, y, 42 * u, { align: "right", color: T.muted, q: span(p, 0.2 + k * 0.03, 0.28 + k * 0.03), weight: 400 });
      }
      g.save(); g.globalAlpha *= 0.35 * span(p, 0.2, 0.3); g.strokeStyle = T.chalk; g.lineWidth = 2.5 * u; g.setLineDash([4 * u, 16 * u]);
      g.beginPath(); for (let k = 1; k <= 4; k++) { const y = lerp(base, top, k / 4); g.moveTo(left + 20 * u, y); g.lineTo(right, y); } g.stroke(); g.restore();
    }
    // Bars: outline, scribble fill, the figure counting, the label.
    const valueSize = Math.min(112 * u, slot * 0.9);
    bars.forEach((r, i) => {
      const o = 0.14 + i * 0.13, isHot = i === hot, col = isHot ? T.acc : T.chalk;
      const out = new Pth(1.5 * u, 11 + i).M(r.x, base).L(r.x, r.top).L(r.x + bw, r.top).L(r.x + bw, base);
      chalk(g, out, span(p, o, o + 0.1), col, W5);
      const fill = scribble(r.x + 8 * u, r.top + 8 * u, bw - 16 * u, r.h - 10 * u, 15 * u, 21 + i, 1.4 * u);
      g.save(); if (!isHot) g.globalAlpha *= 0.55;
      chalk(g, fill, span(p, o + 0.08, o + 0.26), isHot ? T.acc : T.muted, 3.6 * u);
      g.restore();
      const k = span(p, o + 0.06, o + 0.3);
      if (k > 0) write(g, fmt(vals[i], ease(k), d), r.cx, r.top - 26 * u - valueSize * 0.42, valueSize, { align: "center", color: col, q: span(p, o + 0.06, o + 0.14), maxW: slot * 0.98, min: 64 * u });
      write(g, d.labels[i] || "", r.cx, base + 42 * u, 44 * u, { align: "center", color: T.chalk, q: span(p, o + 0.02, o + 0.1), maxW: slot * 0.96, min: 34 * u, weight: 400 });
    });
    // The winner: a loop round its figure and sparks; a dashed trend through the bar tops with a dot riding it.
    const H0 = bars[hot], vy = H0.top - 26 * u - valueSize * 0.42;
    const vw = measure(g, fmt(vals[hot], 1, d), valueSize) * 0.5 + 38 * u;
    const loop = new Pth(2 * u, 31).E(H0.cx, vy, vw, valueSize * 0.62, -2.4, -2.4 + TAU * 1.08, true);
    chalk(g, loop, span(p, 0.8, 0.94), T.c2, 4.5 * u);
    if (p >= 0.94) {
      const sp = new Pth(0, 33);
      for (let k = 0; k < 3; k++) {
        const a = -2.2 + k * 0.5, L = (16 + 12 * (0.5 + 0.5 * Math.sin(X.t * 7 + k * 2))) * u, rx = H0.cx + Math.cos(a) * (vw + 14 * u), ry = vy + Math.sin(a) * (valueSize * 0.62 + 14 * u);
        sp.M(rx, ry).L(rx + Math.cos(a) * L, ry + Math.sin(a) * L);
      }
      chalk(g, sp, 1, T.c2, 4 * u);
    }
    // A growth callout beside the winner: how far it climbed from the first bar.
    const v0 = vals[0];
    if (hot > 0 && v0 > 0 && vals[hot] !== v0) {
      const pct = Math.round(((vals[hot] - v0) / v0) * 100), txt = `${pct > 0 ? "+" : ""}${pct}%`;
      const cs = Math.min(100 * u, slot * 0.62), cxl = H0.x - 34 * u, cyl = vy + (S.tall ? cs * 1.3 : 0);
      const kq = span(p, 0.86, 0.96), rr = write(g, txt, cxl - 40 * u, cyl, cs, { align: "right", color: T.c2, q: kq, maxW: slot * 1.3, min: 60 * u });
      if (kq > 0) {
        const ax = new Pth(1.2 * u, 45).M(cxl - 30 * u, cyl - rr.size * 0.15).Q(cxl + 10 * u, cyl + rr.size * 0.2, H0.x - 4 * u, H0.top + 40 * u);
        const ak = span(p, 0.92, 1);
        chalk(g, ax, ak, T.c2, 4 * u);
        if (ak >= 1) { const [ex, ey] = ax.at(1), [qx, qy] = ax.at(0.94); chalk(g, arrowHead(new Pth(0, 46), ex, ey, Math.atan2(ey - qy, ex - qx), 18 * u), 1, T.c2, 4 * u); }
        // A double underline that keeps being re-chalked.
        const ul = new Pth(1 * u, 47).M(cxl - 40 * u - rr.w, cyl + rr.size * 0.6).L(cxl - 40 * u, cyl + rr.size * 0.64).M(cxl - 30 * u - rr.w, cyl + rr.size * 0.78).L(cxl - 50 * u, cyl + rr.size * 0.8);
        chalk(g, ul, p >= 1 ? 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(X.t * 2.4)) : span(p, 0.94, 1), T.c2, 3.6 * u);
      }
    }
    const tr = new Pth(1.2 * u, 41);
    bars.forEach((r, i) => (i ? tr.L(r.cx, r.top - 6 * u) : tr.M(r.cx, r.top - 6 * u)));
    if (n > 1) {
      g.save(); g.setLineDash([14 * u, 12 * u]); g.lineDashOffset = -X.t * 40 * u;
      g.strokeStyle = T.c3; g.lineWidth = 3.4 * u; g.lineCap = "round"; g.globalAlpha *= span(p, 0.88, 1);
      tr.draw(g, span(p, 0.88, 1)); g.restore();
      if (p >= 1) { const [x, y] = tr.at((X.t * 0.3) % 1); dot(g, x, y, 10 * u, T.c3); }
    }
    return bars.map((r) => [r.cx + bw * 0.32, r.top + Math.min(r.h * 0.5, 80 * u)]).filter((_, i) => i !== hot).concat([[H0.cx + bw * 0.32, H0.top + Math.min(H0.h * 0.5, 80 * u)]]);
  }

  function object(g, S, T, b, p, d, X) {
    const u = S.u, phone = d.kind === "phone", tall = b.h > b.w, W5 = 6.4 * u;
    // Where the device sits and where its labels go.
    const region = tall ? { x: b.x, y: b.y, w: b.w, h: b.h * 0.6 } : { x: b.x, y: b.y, w: b.w * 0.56, h: b.h };
    let w, h;
    if (phone) { h = region.h * 0.94; w = h * 0.52; if (w > region.w * 0.8) { w = region.w * 0.8; h = w / 0.52; } }
    else { w = Math.min(region.w * 0.94, (region.h * 0.86) / 0.7); h = w * 0.6; }
    const x = region.x + (region.w - w) / 2, y = region.y + (region.h - h - (phone ? 0 : h * 0.1)) / 2;
    const pad = (phone ? 18 : 24) * u, sx = x + pad, sy = y + pad * (phone ? 2.2 : 1), sw = w - pad * 2, sh = h - pad * (phone ? 4.4 : 2);
    // Guides.
    const gd = new Pth(1.2 * u, 3).RR(x, y, w, h, (phone ? 40 : 18) * u);
    guide(g, gd, T.chalk);
    // Body, screen and base.
    chalk(g, new Pth(1.8 * u, 4).RR(x, y, w, h, (phone ? 40 : 18) * u), span(p, 0, 0.18), T.chalk, W5);
    chalk(g, new Pth(1.2 * u, 5).RR(sx, sy, sw, sh, 8 * u), span(p, 0.12, 0.26), T.chalk, 3.6 * u);
    if (!phone) {
      const bp = new Pth(1.6 * u, 6).M(x, y + h).L(x - w * 0.07, y + h * 1.09).L(x + w * 1.07, y + h * 1.09).L(x + w, y + h);
      bp.M(x + w * 0.42, y + h * 1.045).L(x + w * 0.58, y + h * 1.045);
      chalk(g, bp, span(p, 0.16, 0.28), T.chalk, W5);
    } else {
      chalk(g, new Pth(0.6 * u, 6).M(x + w * 0.4, y + pad * 1.1).L(x + w * 0.6, y + pad * 1.1), span(p, 0.16, 0.2), T.chalk, 4 * u);
    }
    // Screen: a preview picture over three tracks of clips.
    const pv = { x: sx + sw * 0.07, y: sy + sh * 0.07, w: sw * 0.86, h: sh * (phone ? 0.38 : 0.44) };
    chalk(g, new Pth(1 * u, 7).R(pv.x, pv.y, pv.w, pv.h), span(p, 0.24, 0.34), T.chalk, 3.4 * u);
    const hills = new Pth(1.2 * u, 8).M(pv.x + 4 * u, pv.y + pv.h * 0.86).L(pv.x + pv.w * 0.26, pv.y + pv.h * 0.42).L(pv.x + pv.w * 0.44, pv.y + pv.h * 0.7)
      .L(pv.x + pv.w * 0.62, pv.y + pv.h * 0.3).L(pv.x + pv.w - 4 * u, pv.y + pv.h * 0.86);
    chalk(g, hills, span(p, 0.3, 0.42), T.c3, 4 * u);
    const sun = [pv.x + pv.w * 0.8, pv.y + pv.h * 0.3], sr = Math.min(pv.w, pv.h) * 0.11;
    chalk(g, new Pth(0.8 * u, 9).O(sun[0], sun[1], sr), span(p, 0.36, 0.44), T.acc, 4 * u);
    if (p > 0.44) {
      const rays = new Pth(0, 10), rot = X.t * 0.6;
      for (let k = 0; k < 8; k++) { const a = rot + (k * TAU) / 8; rays.M(sun[0] + Math.cos(a) * sr * 1.45, sun[1] + Math.sin(a) * sr * 1.45).L(sun[0] + Math.cos(a) * sr * 2, sun[1] + Math.sin(a) * sr * 2); }
      chalk(g, rays, span(p, 0.44, 0.5), T.acc, 3.4 * u);
      // A bird crossing the picture.
      const bx = pv.x + pv.w * ((X.t * 0.12) % 1), by = pv.y + pv.h * (0.2 + 0.05 * Math.sin(X.t * 2)), bs = pv.h * 0.06, fl = Math.sin(X.t * 9) * 0.5;
      g.save(); g.beginPath(); g.rect(pv.x, pv.y, pv.w, pv.h); g.clip();
      chalk(g, new Pth(0, 11).M(bx - bs, by - bs * fl).Q(bx - bs * 0.4, by - bs * 0.2, bx, by).Q(bx + bs * 0.4, by - bs * 0.2, bx + bs, by - bs * fl), 1, T.chalk, 3 * u);
      g.restore();
    }
    const ty0 = pv.y + pv.h + sh * 0.08, th = (sy + sh - ty0 - sh * 0.06) / 3.4;
    const clips = [[[0.02, 0.3], [0.36, 0.26], [0.66, 0.3]], [[0.08, 0.4], [0.52, 0.42]], [[0.02, 0.22], [0.28, 0.5], [0.82, 0.14]]];
    let proposed = null, original = null;
    clips.forEach((row, t) => row.forEach(([cx, cw], i) => {
      const k = span(p, 0.34 + t * 0.06 + i * 0.03, 0.46 + t * 0.06 + i * 0.03);
      const rx = pv.x + pv.w * cx, ry = ty0 + t * th * 1.2, rw = pv.w * cw;
      const isProp = t === 0 && i === 1;
      if (isProp) proposed = [rx + rw / 2, ry + th / 2];
      if (t === 2 && i === 1) original = [rx + rw * 0.3, ry + th / 2];
      const R = new Pth(0.8 * u, 50 + t * 5 + i).R(rx, ry, rw, th);
      chalk(g, R, k, isProp ? T.acc : T.chalk, 3.2 * u);
      if (isProp && k >= 1) { g.save(); g.globalAlpha *= 0.8; chalk(g, scribble(rx + 5 * u, ry + 5 * u, rw - 10 * u, th - 10 * u, 9 * u, 61, 0.6 * u), span(p, 0.5, 0.62), T.acc, 2.6 * u); g.restore(); }
    }));
    // The playhead sweeps the tracks without stopping.
    if (p > 0.6) {
      const phx = pv.x + pv.w * ((X.t * 0.16) % 1), y0 = ty0 - 10 * u, y1 = ty0 + th * 3.6;
      const ph = new Pth(0, 70).M(phx, y0).L(phx, y1);
      ph.M(phx - 10 * u, y0 - 12 * u).L(phx + 10 * u, y0 - 12 * u).L(phx, y0).L(phx - 10 * u, y0 - 12 * u);
      g.save(); g.globalAlpha *= span(p, 0.6, 0.7); chalk(g, ph, 1, T.c2, 3.6 * u); g.restore();
    }
    // Callouts: words first, then an underline and a curved leader with an arrowhead into the part.
    const anchors = [[sun[0] - sr * 1.2, sun[1] + sr * 0.9], proposed, original];
    const out = [];
    d.callouts.forEach((label, i) => {
      if (!label) return;
      const o = 0.56 + i * 0.12, a = anchors[i];
      let lx, ly, tw, align = "left";
      if (tall) { lx = b.x + 90 * u; ly = b.y + b.h * 0.66 + i * b.h * 0.12; }
      else { lx = b.x + b.w * 0.6; ly = b.y + b.h * (0.16 + i * 0.32); }
      const maxW = (tall ? Math.min(b.x + b.w, S.W - frameW(S) - 60 * u) : Math.min(b.x + b.w - 40 * u, S.W - frameW(S) - 70 * u)) - lx;
      const r = write(g, label, lx, ly, 48 * u, { color: T.chalk, q: span(p, o, o + 0.1), maxW, min: 38 * u, align });
      tw = r.w;
      chalk(g, new Pth(1.4 * u, 80 + i).M(lx, ly + r.size * 0.62).L(lx + tw, ly + r.size * 0.62 + 4 * u), span(p, o + 0.08, o + 0.14), T.acc, 4 * u);
      // Leader: from the label's left, bowing out, into the anchor.
      const sxl = lx - 22 * u, syl = ly;
      const L = new Pth(1.2 * u, 90 + i);
      if (tall) L.M(sxl, syl).Q(b.x + 20 * u, (syl + a[1]) / 2, a[0], a[1] + 14 * u);
      else L.M(sxl, syl).Q((sxl + a[0]) / 2, Math.min(syl, a[1]) - 40 * u, a[0] + 14 * u, a[1]);
      const k = span(p, o + 0.04, o + 0.14);
      chalk(g, L, k, T.acc, 3.8 * u);
      if (k >= 1) {
        const [ex, ey] = L.at(1), [px, py] = L.at(0.96);
        chalk(g, arrowHead(new Pth(0, 95 + i), ex, ey, Math.atan2(ey - py, ex - px), 18 * u), 1, T.acc, 3.8 * u);
        chalk(g, new Pth(0.6 * u, 99 + i).O(a[0], a[1], 12 * u), 1, T.acc, 3.4 * u);
      }
      out.push([a[0], a[1]]);
    });
    return out;
  }

  // An original classroom character in chalk: round head, a hairdo, dot eyes, a smile, shirt or dress.
  function person(g, S, T, cx, base, s, style, col, q, X, i, hot, done) {
    const u = S.u, r = s * 0.14, hy = base - s + r, W5 = 5 * u;
    const ks = [span(q, 0, 0.3), span(q, 0.2, 0.45), span(q, 0.35, 0.7), span(q, 0.6, 0.85), span(q, 0.75, 1)];
    // Head and hair.
    chalk(g, new Pth(1 * u, 200 + i).O(cx, hy, r), ks[0], col, W5);
    const hair = new Pth(0.8 * u, 210 + i);
    if (style === 0) { for (let k = 0; k < 5; k++) { const a = -2.6 + k * 0.32; hair.M(cx + Math.cos(a) * r, hy + Math.sin(a) * r).L(cx + Math.cos(a) * r * 1.45, hy + Math.sin(a) * r * 1.45); } }
    else if (style === 1) { for (let k = 0; k < 6; k++) { const a = -2.9 + k * 0.33; hair.E(cx + Math.cos(a) * r, hy + Math.sin(a) * r, r * 0.22, r * 0.22, 0, TAU, true); } }
    else if (style === 2) { // long hair falling past the ears, with a side fringe
      hair.E(cx, hy, r * 1.12, r * 1.12, Math.PI * 1.02, Math.PI * 1.98, true);
      hair.M(cx - r * 1.1, hy - r * 0.1).Q(cx - r * 1.35, hy + r * 0.9, cx - r * 1.05, hy + r * 1.55);
      hair.M(cx + r * 1.1, hy - r * 0.1).Q(cx + r * 1.35, hy + r * 0.9, cx + r * 1.05, hy + r * 1.55);
      hair.M(cx - r * 0.9, hy - r * 0.55).Q(cx - r * 0.1, hy - r * 0.2, cx + r * 0.6, hy - r * 0.85);
    }
    else { hair.E(cx, hy - r * 0.2, r * 1.05, r * 0.9, Math.PI * 1.05, Math.PI * 1.95, true).M(cx - r * 0.2, hy - r * 0.5).L(cx + r * 1.7, hy - r * 0.45); }
    chalk(g, hair, ks[1], col, 4 * u);
    // Face: eyes blink now and then; a smile.
    if (ks[1] > 0.5) {
      const blink = ((X.t * 0.8 + i * 0.37) % 2.6) < 0.13;
      const ex = r * 0.38, ey = hy - r * 0.08;
      if (blink) chalk(g, new Pth(0, 220 + i).M(cx - ex - 6 * u, ey).L(cx - ex + 6 * u, ey).M(cx + ex - 6 * u, ey).L(cx + ex + 6 * u, ey), 1, col, 3.4 * u);
      else { dot(g, cx - ex, ey, 4.6 * u, col); dot(g, cx + ex, ey, 4.6 * u, col); }
      chalk(g, new Pth(0, 230 + i).E(cx, hy + r * 0.12, r * 0.42, r * 0.36, 0.35, Math.PI - 0.35, true), span(ks[1], 0.5, 1), col, 3.4 * u);
    }
    // Body.
    const ny = hy + r + s * 0.02, hipY = base - s * 0.36, sw = s * 0.17;
    const body = new Pth(1.2 * u, 240 + i);
    if (style % 2) body.M(cx - sw * 0.6, ny + s * 0.02).L(cx - sw * 1.35, hipY + s * 0.05).L(cx + sw * 1.35, hipY + s * 0.05).L(cx + sw * 0.6, ny + s * 0.02).L(cx - sw * 0.6, ny + s * 0.02);
    else body.RR(cx - sw, ny, sw * 2, hipY - ny, sw * 0.5);
    chalk(g, body, ks[2], col, W5);
    // Legs.
    chalk(g, new Pth(1 * u, 250 + i).M(cx - sw * 0.45, hipY + (style % 2 ? s * 0.05 : 0)).L(cx - sw * 0.55, base).L(cx - sw * 1.1, base).M(cx + sw * 0.45, hipY + (style % 2 ? s * 0.05 : 0)).L(cx + sw * 0.55, base).L(cx + sw * 1.1, base), ks[3], col, W5);
    // Arms; the highlighted one waves once the drawing is done.
    // Arms, posed for the prop each one carries: headset (hands on hips), megaphone (raised and calling),
    // clipboard (held at the chest), camera (held up to the eye line).
    const prop = i % 4, shY = ny + s * 0.06, al = s * 0.3, tt = X.t;
    const sway = done ? Math.sin(tt * 3 + i) * 0.08 : 0;
    const arm = { 0: [Math.PI * 0.82, Math.PI * 0.18], 1: [Math.PI * 0.62, -0.9 + (done ? Math.sin(tt * 4.5) * 0.12 : 0)], 2: [Math.PI * 0.62, Math.PI * 0.82 + sway], 3: [Math.PI * 0.62, -0.25 + sway] }[prop];
    const la = arm[0], ra = arm[1];
    const elbow = (x0, a, bend) => [x0 + Math.cos(a) * al * 0.55, shY + Math.sin(a) * al * 0.55 + bend];
    const arms = new Pth(1 * u, 260 + i);
    let hand = null;
    const lh = [cx - sw + Math.cos(la) * al, shY + Math.sin(la) * al];
    if (prop === 0) { // hands on hips: elbows out
      arms.M(cx - sw, shY).L(cx - sw - al * 0.5, shY + al * 0.5).L(cx - sw * 0.95, hipY - s * 0.02).M(cx + sw, shY).L(cx + sw + al * 0.5, shY + al * 0.5).L(cx + sw * 0.95, hipY - s * 0.02);
    } else {
      const rh = prop === 2 ? [cx + sw * 0.2, shY + al * 0.62] : [cx + sw + Math.cos(ra) * al, shY + Math.sin(ra) * al];
      const re = prop === 2 ? [cx + sw * 1.4, shY + al * 0.5] : elbow(cx + sw, ra, 0);
      arms.M(cx - sw, shY).L(lh[0], lh[1]).M(cx + sw, shY).L(re[0], re[1]).L(rh[0], rh[1]);
      hand = rh;
    }
    chalk(g, arms, ks[4], col, W5);
    const pk = span(q, 0.8, 1);
    if (pk > 0) {
      const P = new Pth(0.8 * u, 280 + i);
      if (prop === 0) { // headset: a band over the head, ear cups, a mic boom to the mouth
        P.E(cx, hy, r * 1.18, r * 1.18, Math.PI * 1.08, Math.PI * 1.92, true);
        P.R(cx - r * 1.28, hy - r * 0.3, r * 0.32, r * 0.6).R(cx + r * 0.96, hy - r * 0.3, r * 0.32, r * 0.6);
        P.M(cx - r * 1.1, hy + r * 0.3).Q(cx - r * 0.9, hy + r * 0.85, cx - r * 0.25, hy + r * 0.62);
        chalk(g, P, pk, T.c3, 4 * u);
        if (pk >= 1) dot(g, cx - r * 0.22, hy + r * 0.62, 6 * u, T.c3);
      } else if (prop === 1) { // megaphone pointing up and out, with sound arcs
        const [hx, hy2] = hand, a = -0.55, c = Math.cos(a), sn = Math.sin(a), L = s * 0.24, m0 = s * 0.035, m1 = s * 0.1;
        const pt = (x, y) => [hx + x * c - y * sn, hy2 + x * sn + y * c];
        P.poly([pt(-L * 0.15, -m0), pt(L, -m1), pt(L, m1), pt(-L * 0.15, m0), pt(-L * 0.15, -m0)]).M(...pt(L * 0.2, m0 * 1.3)).L(...pt(L * 0.25, m0 * 3));
        chalk(g, P, pk, T.acc, 4 * u);
        if (pk >= 1) {
          const A = new Pth(0, 290 + i), [ox, oy] = pt(L * 1.1, 0);
          for (let k = 0; k < 3; k++) { const ph = (tt * 1.6 + k / 3) % 1, rr = s * (0.05 + ph * 0.16); g.save(); g.globalAlpha *= 1 - ph; chalk(g, new Pth(0, 291 + k).E(ox, oy, rr, rr, a - 0.7, a + 0.7, true), 1, T.acc, 3.6 * u); g.restore(); }
          void A;
        }
      } else if (prop === 2) { // clipboard at the chest, a line being ticked off
        const [hx, hy2] = hand, w = s * 0.2, h = s * 0.26, x = hx - w * 0.15, y = hy2 - h * 0.65;
        P.R(x, y, w, h).R(x + w * 0.3, y - h * 0.08, w * 0.4, h * 0.12);
        for (let k = 0; k < 3; k++) P.M(x + w * 0.38, y + h * (0.3 + k * 0.22)).L(x + w * 0.85, y + h * (0.3 + k * 0.22));
        chalk(g, P, pk, T.c2, 3.6 * u);
        if (pk >= 1) {
          const row = Math.floor(tt * 0.9 + i) % 3, kk = (tt * 0.9 + i) % 1, yy = y + h * (0.3 + row * 0.22);
          chalk(g, new Pth(0, 295).M(x + w * 0.1, yy).L(x + w * 0.18, yy + h * 0.06).L(x + w * 0.3, yy - h * 0.07), ease(kk / 0.4), T.c2, 3.4 * u);
        }
      } else { // a film camera held up, its reels turning
        const [hx, hy2] = hand, w = s * 0.22, h = s * 0.14, x = hx - w * 0.2, y = hy2 - h * 0.8;
        P.RR(x, y, w, h, 6 * u).poly([[x + w, y + h * 0.3], [x + w * 1.3, y + h * 0.1], [x + w * 1.3, y + h * 0.9], [x + w, y + h * 0.7]]);
        chalk(g, P, pk, T.c3, 3.8 * u);
        if (pk >= 1) for (let k = 0; k < 2; k++) {
          const rx = x + w * (0.25 + k * 0.48), ry = y - h * 0.42, rr = h * 0.42, R = new Pth(0, 296 + k).O(rx, ry, rr, 0, 0);
          for (let j = 0; j < 3; j++) { const a = tt * 3 + (j * TAU) / 3; R.M(rx, ry).L(rx + Math.cos(a) * rr * 0.8, ry + Math.sin(a) * rr * 0.8); }
          chalk(g, R, 1, T.c3, 3.2 * u);
        }
      }
    }
    void hot;
    return [cx, hy - r * 1.6];
  }
  function people(g, S, T, b, p, d, X) {
    const u = S.u, n = clamp(Math.round(Number(d.count) || 4), 2, 6), tall = b.h > b.w;
    const rows = tall && n > 2 ? 2 : 1, per = Math.ceil(n / rows), hot = Math.min(n - 1, d.highlight ?? 1);
    const rowH = b.h / rows, done = p >= 1;
    const out = [];
    for (let row = 0; row < rows; row++) {
      const count = row === rows - 1 ? n - per * row : per, slot = b.w / per;
      const base = b.y + rowH * (row + 1) - 26 * u;
      // Figures grow into the room under the headline, leaving space for their speech bubbles.
      const roof = row === 0 ? headBottom(S, "people-title", b.y - 60 * u) + 150 * u : b.y + rowH * row + 120 * u;
      const s = Math.min(slot * 0.95, rowH * 1.05, Math.max(rowH * 0.6, (base - roof) / 1.05));
      const floor = new Pth(1.4 * u, 300 + row).M(b.x + (b.w - slot * count) / 2, base + 6 * u).L(b.x + (b.w + slot * count) / 2, base + 6 * u);
      guide(g, floor, T.chalk);
      chalk(g, floor, span(p, 0, 0.12), T.muted, 4 * u);
      for (let j = 0; j < count; j++) {
        const i = row * per + j, cx = b.x + (b.w - slot * count) / 2 + slot * (j + 0.5), isHot = i === hot;
        const o = 0.06 + (i / n) * 0.5, q = span(p, o, o + 0.32);
        const bob = Math.sin(X.t * 2.3 + i * 1.3) * 5 * u;
        const col = isHot ? T.acc : T.chalk;
        g.save(); g.translate(0, bob);
        guide(g, new Pth(1 * u, 310 + i).O(cx, base - s + s * 0.14, s * 0.14), T.chalk);
        const top = person(g, S, T, cx, base, s * (isHot ? 1.05 : 1), i % 4, col, q, X, i, isHot, done);
        g.restore();
        // Speech bubble: the words, then the bubble drawn round them.
        // Each figure has its own role; a figure beyond the named roles goes unlabelled rather than repeat one.
        const label = d.badges[i];
        if (!label) continue;
        const kq = span(p, o + 0.2, o + 0.34), size = 46 * u;
        const by = base - s * 1.05 - 64 * u - (isHot ? 10 * u : 0);
        const r = write(g, label, cx, by, size, { align: "center", color: isHot ? T.acc : T.chalk, q: kq, maxW: slot * 0.8, min: 32 * u, weight: 700 });
        const bw = r.w + 46 * u, bh = r.size * 1.7;
        const bub = new Pth(1.2 * u, 320 + i).M(cx - 16 * u, by + bh / 2).L(cx - bw / 2 + 18 * u, by + bh / 2)
          .E(cx - bw / 2 + 18 * u, by, 18 * u, bh / 2, Math.PI / 2, Math.PI * 1.5).L(cx + bw / 2 - 18 * u, by - bh / 2)
          .E(cx + bw / 2 - 18 * u, by, 18 * u, bh / 2, -Math.PI / 2, Math.PI / 2).L(cx + 16 * u, by + bh / 2).L(cx + 2 * u, by + bh / 2 + 22 * u).L(cx - 16 * u, by + bh / 2);
        chalk(g, bub, span(p, o + 0.26, o + 0.4), isHot ? T.acc : T.muted, 3.8 * u);
        out.push([cx + bw * 0.3, by + bh * 0.2]);
        void top;
      }
    }
    const h = out.splice(hot, 1);
    return out.concat(h);
  }

  function icon(g, S, kind, cx, cy, s, col, q, X) {
    const u = S.u, P = new Pth(1 * u, 400 + kind);
    if (kind === 0) { // a magnifier over a page of lines
      P.R(cx - s * 0.42, cy - s * 0.5, s * 0.6, s * 0.8);
      for (let k = 0; k < 3; k++) P.M(cx - s * 0.32, cy - s * 0.3 + k * s * 0.18).L(cx + s * 0.06, cy - s * 0.3 + k * s * 0.18);
      P.O(cx + s * 0.18, cy + s * 0.1, s * 0.22).M(cx + s * 0.34, cy + s * 0.26).L(cx + s * 0.52, cy + s * 0.46);
    } else if (kind === 1) { // a pencil
      const a = -0.75, c = Math.cos(a), si = Math.sin(a), L = s * 0.62, w = s * 0.13;
      const pt = (x, y) => [cx + x * c - y * si, cy + x * si + y * c];
      P.poly([pt(-L, -w), pt(L * 0.6, -w), pt(L, 0), pt(L * 0.6, w), pt(-L, w), pt(-L, -w)]);
      P.M(...pt(L * 0.6, -w)).L(...pt(L * 0.6, w)).M(...pt(-L * 0.7, -w)).L(...pt(-L * 0.7, w));
    } else { // a tick in a box
      P.R(cx - s * 0.4, cy - s * 0.4, s * 0.8, s * 0.8).M(cx - s * 0.24, cy).L(cx - s * 0.06, cy + s * 0.2).L(cx + s * 0.32, cy - s * 0.26);
    }
    chalk(g, P, q, col, 5 * u);
  }
  // A small working sketch under each step; each keeps moving once drawn.
  function stepSketch(g, S, T, kind, cx, cy, s, q, X, col) {
    if (q <= 0) return;
    const u = S.u, t = X.t, done = q >= 1;
    if (kind === 0) { // a strip of film frames with a magnifier gliding along it
      const w = s * 2.1, h = s * 0.82, x = cx - w / 2, y = cy - h / 2;
      const P = new Pth(1 * u, 560).R(x, y, w, h);
      for (let k = 1; k < 3; k++) P.M(x + (w * k) / 3, y + h * 0.18).L(x + (w * k) / 3, y + h * 0.82);
      for (let k = 0; k < 7; k++) { const hx = x + w * (0.06 + k * 0.145); P.M(hx, y + h * 0.07).L(hx + w * 0.04, y + h * 0.07).M(hx, y + h * 0.93).L(hx + w * 0.04, y + h * 0.93); }
      chalk(g, P, span(q, 0, 0.7), T.chalk, 3.6 * u);
      // Tiny pictures in the frames: a hill, a face, a sun.
      const F = new Pth(0.6 * u, 561), fw3 = w / 3;
      F.M(x + fw3 * 0.15, y + h * 0.7).L(x + fw3 * 0.45, y + h * 0.35).L(x + fw3 * 0.8, y + h * 0.7);
      F.O(x + fw3 * 1.5, y + h * 0.48, h * 0.17).O(x + fw3 * 2.5, y + h * 0.48, h * 0.14);
      chalk(g, F, span(q, 0.4, 1), T.muted, 3 * u);
      if (done) {
        const mx = x + w * (0.18 + 0.64 * (0.5 + 0.5 * Math.sin(t * 1.6))), my = cy - h * 0.05, mr = h * 0.36;
        chalk(g, new Pth(0, 562).O(mx, my, mr, -2, 0.1).M(mx + mr * 0.7, my + mr * 0.7).L(mx + mr * 1.5, my + mr * 1.5), 1, T.c3, 4.5 * u);
      }
    } else if (kind === 1) { // a card being written on, the pencil never quite still
      const w = s * 1.7, h = s * 1.05, x = cx - w / 2, y = cy - h / 2;
      chalk(g, new Pth(1 * u, 565).RR(x, y, w, h, 12 * u), span(q, 0, 0.5), T.chalk, 3.6 * u);
      chalk(g, new Pth(0.6 * u, 566).R(x + w * 0.08, y + h * 0.14, w * 0.3, h * 0.36), span(q, 0.3, 0.6), T.c3, 3 * u);
      const L = new Pth(1 * u, 567);
      for (let k = 0; k < 2; k++) L.M(x + w * 0.46, y + h * (0.22 + k * 0.18)).L(x + w * (0.9 - k * 0.12), y + h * (0.22 + k * 0.18));
      chalk(g, L, span(q, 0.5, 0.8), T.muted, 3 * u);
      // The line being written loops: it grows, the pencil lifts and starts again.
      const cyc = (t * 0.5) % 1, wl = done ? ease(cyc / 0.8) : 0;
      if (done) {
        const ly = y + h * 0.74, lx0 = x + w * 0.08, lx1 = lx0 + (w * 0.8) * wl;
        const wv = new Pth(0, 568).M(lx0, ly);
        for (let xx = lx0; xx <= lx1; xx += 6 * u) wv.L(xx, ly + Math.sin((xx - lx0) * 0.09 / u) * 6 * u);
        chalk(g, wv, 1, col, 3.4 * u);
        const a = -0.8, pl = s * 0.7, pw = s * 0.11, px = lx1, py = ly + Math.sin((lx1 - lx0) * 0.09 / u) * 6 * u - (cyc > 0.8 ? (cyc - 0.8) * 120 * u : 0);
        const c = Math.cos(a), si = Math.sin(a), pt = (xx, yy) => [px + xx * c - yy * si, py + xx * si + yy * c];
        chalk(g, new Pth(0, 569).poly([pt(0, 0), pt(pl * 0.22, -pw), pt(pl, -pw), pt(pl, pw), pt(pl * 0.22, pw), pt(0, 0)]).M(...pt(pl * 0.22, -pw)).L(...pt(pl * 0.22, pw)), 1, T.acc, 3.4 * u);
      }
    } else { // a card stamped OK, the stamp breathing
      const w = s * 1.7, h = s * 1.05, x = cx - w / 2 - s * 0.25, y = cy - h / 2;
      chalk(g, new Pth(1 * u, 570).RR(x, y, w, h, 12 * u), span(q, 0, 0.5), T.chalk, 3.6 * u);
      const L = new Pth(0.6 * u, 571);
      for (let k = 0; k < 3; k++) L.M(x + w * 0.1, y + h * (0.25 + k * 0.22)).L(x + w * (0.6 - k * 0.1), y + h * (0.25 + k * 0.22));
      chalk(g, L, span(q, 0.3, 0.6), T.muted, 3 * u);
      const k = done ? 1 + 0.05 * Math.sin(t * 3.4) : 1, sx = x + w * 0.86, sy = cy + h * 0.08, sr = s * 0.46 * k;
      chalk(g, new Pth(1 * u, 572).O(sx, sy, sr), span(q, 0.5, 0.8), col, 4.5 * u);
      chalk(g, new Pth(0.8 * u, 573).M(sx - sr * 0.45, sy + sr * 0.02).L(sx - sr * 0.1, sy + sr * 0.38).L(sx + sr * 0.5, sy - sr * 0.4), span(q, 0.75, 1), col, 5.5 * u);
      if (done) {
        const R = new Pth(0, 574);
        for (let j = 0; j < 6; j++) { const a = -0.3 + j * 1.05 + t * 0.4, p0 = sr * 1.25, p1 = sr * (1.45 + 0.15 * Math.sin(t * 5 + j)); R.M(sx + Math.cos(a) * p0, sy + Math.sin(a) * p0).L(sx + Math.cos(a) * p1, sy + Math.sin(a) * p1); }
        chalk(g, R, 1, T.c2, 3.4 * u);
      }
    }
  }
  function process(g, S, T, b, p, d, X) {
    const u = S.u, n = d.steps.length, tall = b.h > b.w, W5 = 6.4 * u;
    // The diagram fills the board from under the headline to the tray: big step circles, their labels,
    // and under each a small working sketch of that step.
    const top = Math.min(b.y, headBottom(S, "process-title", b.y - 80 * u) + 60 * u), bottom = S.H - trayH(S) - 40 * u;
    let pos, ds;
    if (tall) {
      const rowH = (bottom - top) / n, r = Math.min(rowH * 0.34, b.w * 0.2);
      ds = Math.min(rowH * 0.2, b.w * 0.13);
      pos = d.steps.map((_, i) => ({ cx: b.x + r + 40 * u, cy: top + rowH * (i + 0.5), r, dx: b.x + r * 2 + 90 * u + ds * 1.1, dy: top + rowH * (i + 0.5) + r * 0.42 }));
    } else {
      const slot = b.w / n, r = Math.min(slot * 0.36, (bottom - top) * 0.27), cy = top + r * 1.12;
      ds = Math.max(60 * u, Math.min(150 * u, (bottom - (cy + r + 120 * u)) * 0.75));
      pos = d.steps.map((_, i) => ({ cx: b.x + slot * (i + 0.5), cy, r, dx: b.x + slot * (i + 0.5), dy: bottom - ds * 0.62 }));
    }
    const arrows = [];
    for (let i = 0; i < n - 1; i++) {
      const A = pos[i], B = pos[i + 1], P = new Pth(1.2 * u, 500 + i);
      if (tall) P.M(A.cx + A.r * 0.75, A.cy + A.r * 0.75).Q(A.cx + A.r * 1.7, (A.cy + B.cy) / 2, B.cx + B.r * 0.75, B.cy - B.r * 0.75);
      else P.M(A.cx + A.r + 16 * u, A.cy - A.r * 0.25).Q((A.cx + B.cx) / 2, A.cy - A.r * 1.15, B.cx - B.r - 16 * u, B.cy - B.r * 0.25);
      arrows.push(P);
    }
    pos.forEach((c, i) => guide(g, new Pth(1 * u, 510 + i).O(c.cx, c.cy, c.r, 0, 0), T.chalk));
    // The moving dot: which step it is visiting.
    const cyc = (X.t * 0.45) % 1, seg = cyc * (n - 0.001);
    const at = Math.floor(seg);
    pos.forEach((c, i) => {
      const o = 0.04 + i * 0.25, last = i === n - 1;
      chalk(g, new Pth(1.6 * u, 520 + i).O(c.cx, c.cy, c.r), span(p, o, o + 0.14), last ? T.acc : T.chalk, W5);
      icon(g, S, Math.min(i, 2), c.cx, c.cy, c.r * 0.9, last ? T.acc : T.chalk, span(p, o + 0.08, o + 0.2), X);
      // Step number in a small coloured circle on the rim.
      const nx = c.cx - c.r * 0.74, ny = c.cy - c.r * 0.74, nr = 34 * u;
      chalk(g, new Pth(0.8 * u, 530 + i).O(nx, ny, nr), span(p, o + 0.06, o + 0.12), T.c2, 4 * u);
      write(g, String(i + 1), nx, ny + 2 * u, 46 * u, { align: "center", color: T.c2, q: span(p, o + 0.1, o + 0.14) });
      const label = d.steps[i] || "";
      if (tall) write(g, label, c.cx + c.r + 50 * u, c.cy - c.r * 0.35, 54 * u, { color: T.chalk, q: span(p, o + 0.12, o + 0.24), maxW: b.x + b.w - (c.cx + c.r + 50 * u), min: 42 * u });
      else write(g, label, c.cx, c.cy + c.r + 64 * u, 54 * u, { align: "center", color: T.chalk, q: span(p, o + 0.12, o + 0.24), maxW: b.w / n * 0.94, min: 40 * u });
      stepSketch(g, S, T, Math.min(i, 2), c.dx, c.dy, ds, span(p, o + 0.18, o + 0.36), X, last ? T.acc : T.chalk);
      // A ring pulses round the step the dot is visiting.
      if (p >= 1 && i === at) {
        const k = 0.5 + 0.5 * Math.sin(X.t * 8);
        g.save(); g.globalAlpha *= 0.55 + 0.45 * k; chalk(g, new Pth(1.4 * u, 540 + i).O(c.cx, c.cy, c.r + 16 * u + k * 6 * u), 1, T.acc, 3.4 * u); g.restore();
      }
      if (i < n - 1) {
        const P = arrows[i], k = span(p, o + 0.14, o + 0.26);
        chalk(g, P, k, T.acc, 4.5 * u);
        if (k >= 1) { const [ex, ey] = P.at(1), [px, py] = P.at(0.95); chalk(g, arrowHead(new Pth(0, 550 + i), ex, ey, Math.atan2(ey - py, ex - px), 22 * u), 1, T.acc, 4.5 * u); }
      }
    });
    // A dot travels the arrows step to step without stopping.
    if (p >= 1 && n > 1) {
      const f = seg - at, P = arrows[Math.min(at, n - 2)], k = at >= n - 1 ? 1 : ease(f);
      for (let j = 0; j < 4; j++) { const [x, y] = P.at(clamp(k - j * 0.05)); g.save(); g.globalAlpha *= 1 - j * 0.24; dot(g, x, y, (11 - j * 2) * u, T.c3); g.restore(); }
    }
    return pos.map((c) => [c.cx + c.r * 0.7, c.cy + c.r * 0.7]);
  }

  function compare(g, S, T, b, p, d, X) {
    const u = S.u, tall = b.h > b.w, W5 = 6.4 * u;
    const lv = Number(d.leftValue) || 0, rv = Number(d.rightValue) || 0, mx = Math.max(lv, rv, 1);
    const cx = b.x + b.w / 2, py = b.y + b.h * (tall ? 0.24 : 0.2), Lb = Math.min(b.w * (tall ? 0.36 : 0.33), 560 * u);
    const foot = b.y + b.h - 8 * u, hang = b.h * (tall ? 0.2 : 0.26), panW = Math.min(Lb * 0.78, 240 * u);
    // The beam settles toward the heavier side with a damped swing, then keeps a gentle sway.
    const target = -((lv - rv) / mx) * 0.2, k = span(p, 0.45, 1);
    const theta = target * (1 - Math.exp(-4 * k) * Math.cos(10 * k)) * (k > 0 ? 1 : 0) + Math.sin(X.t * 1.7) * 0.018 * span(p, 0.6, 1);
    const ends = [[cx - Math.cos(theta) * Lb, py - Math.sin(theta) * Lb], [cx + Math.cos(theta) * Lb, py + Math.sin(theta) * Lb]];
    // Guides.
    guide(g, new Pth(1 * u, 600).M(cx - Lb, py).L(cx + Lb, py).M(cx, py).L(cx, foot), T.chalk);
    // Stand.
    const stand = new Pth(1.6 * u, 601).M(cx, py).L(cx, foot - 30 * u).M(cx - 150 * u, foot).L(cx - 40 * u, foot - 34 * u).L(cx + 40 * u, foot - 34 * u).L(cx + 150 * u, foot).L(cx - 150 * u, foot);
    chalk(g, stand, span(p, 0, 0.16), T.chalk, W5);
    chalk(g, new Pth(0.8 * u, 602).O(cx, py, 16 * u), span(p, 0.12, 0.18), T.acc, 4.5 * u);
    // The beam is drawn from the pivot outwards, both arms at once, with a ring at each end.
    const bk = span(p, 0.14, 0.26);
    for (let i = 0; i < 2; i++) chalk(g, new Pth(1.4 * u, 603 + i * 4).M(cx, py).L(ends[i][0], ends[i][1]), bk, T.chalk, W5);
    const sides = [[d.left, lv, T.chalk], [d.right, rv, T.acc]];
    const out = [];
    const bsz = panW * 0.24;
    sides.forEach(([label, v, col], i) => {
      const [ex, ey] = ends[i], o = 0.24 + i * 0.1;
      // Each pan hangs from a hook at the beam end: a cord down to the apex, then two cords to the rim.
      // The apex always clears the tallest stack of blocks.
      const panY = Math.max(ey + hang, ey + bsz * 3.2 + 110 * u), apexY = panY - bsz * 3.2 - 40 * u;
      if (bk >= 1) chalk(g, new Pth(0.6 * u, 612 + i).O(ex, ey, 9 * u), 1, col, 3.4 * u);
      const strings = new Pth(0.8 * u, 610 + i).M(ex, ey + 9 * u).L(ex, apexY).M(ex, apexY).L(ex - panW / 2 - 6 * u, panY).M(ex, apexY).L(ex + panW / 2 + 6 * u, panY);
      chalk(g, strings, span(p, o, o + 0.08), col, 3.4 * u);
      if (span(p, o, o + 0.08) >= 1) dot(g, ex, apexY, 6 * u, col);
      const pan = new Pth(1.2 * u, 615 + i).M(ex - panW / 2 - 10 * u, panY).L(ex + panW / 2 + 10 * u, panY).E(ex, panY, panW / 2 + 10 * u, 34 * u, 0, Math.PI);
      chalk(g, pan, span(p, o + 0.06, o + 0.16), col, W5);
      // Blocks stacked in the pan, as many as the value earns (up to six), dropping in one by one.
      const blocks = v > 0 ? Math.max(1, Math.round((v / mx) * 6)) : 0, bs = bsz;
      const slots = [[-1, 0], [0, 0], [1, 0], [-0.5, 1], [0.5, 1], [0, 2]];
      for (let j = 0; j < blocks; j++) {
        const kq = span(p, 0.36 + i * 0.08 + j * 0.04, 0.46 + i * 0.08 + j * 0.04);
        if (kq <= 0) continue;
        const [sx, sy] = slots[j], bx = ex + sx * bs * 1.05 - bs / 2, byy = panY - bs * (sy + 1) - 2 * u - (1 - ease(kq)) * 140 * u;
        g.save(); g.globalAlpha *= clamp(kq * 3);
        chalk(g, new Pth(0.8 * u, 620 + i * 10 + j).R(bx, byy, bs, bs), 1, col, 3.6 * u);
        g.globalAlpha *= 0.5; chalk(g, scribble(bx + 6 * u, byy + 6 * u, bs - 12 * u, bs - 12 * u, 10 * u, 640 + j, 0.6 * u), 1, i ? T.acc : T.muted, 2.6 * u);
        g.restore();
      }
      // The figure above the beam end and the label under the pan.
      const fs = Math.min(120 * u, Lb * 0.5), fk = span(p, o + 0.1, o + 0.4);
      const fy = Math.min(ey, py) - Lb * 0.12 - fs * 0.62 - 10 * u;
      if (fk > 0) write(g, fmt(v, ease(fk), d), ex, fy, fs, { align: "center", color: col, q: span(p, o + 0.1, o + 0.18), maxW: Lb * 0.95, min: 72 * u });
      const lr = write(g, label || "", ex, panY + 78 * u, 46 * u, { align: "center", color: col, q: span(p, o + 0.16, o + 0.26), maxW: Math.min(Lb * 1.15, b.w / 2 - 20 * u), min: 34 * u });
      chalk(g, new Pth(1.2 * u, 630 + i).M(ex - lr.w / 2, panY + 78 * u + lr.size * 0.62).L(ex + lr.w / 2, panY + 78 * u + lr.size * 0.66), span(p, o + 0.24, o + 0.3), i ? T.acc : T.muted, 3.6 * u);
      out.push([ex + 40 * u, fy + fs * 0.3]);
    });
    out.push([cx + 10 * u, py + 10 * u]);
    return out;
  }
  const DRAW = { chart, object, people, process, compare };

  // ---- title and closing decoration --------------------------------------------------------------
  function filmCurl(g, S, T, x, y, s, q, t) {
    const u = S.u, P = new Pth(1.2 * u, 700), Q = new Pth(1.2 * u, 701);
    P.M(x - s, y + s * 0.3).Q(x - s * 0.2, y - s * 0.6, x + s, y - s * 0.1);
    Q.M(x - s, y + s * 0.75).Q(x - s * 0.1, y - s * 0.15, x + s, y + s * 0.35);
    chalk(g, P, span(q, 0, 0.4), T.chalk, 4.5 * u); chalk(g, Q, span(q, 0.2, 0.6), T.chalk, 4.5 * u);
    if (q > 0.6) {
      const holes = new Pth(0, 702), off = (t * 0.12) % (1 / 7);
      for (let k = 0; k < 7; k++) {
        const f = clamp(k / 7 + off + 0.04), [ax, ay] = P.at(f), [bx, by] = Q.at(f);
        holes.M(ax + (bx - ax) * 0.18, ay + (by - ay) * 0.18).L(ax + (bx - ax) * 0.26, ay + (by - ay) * 0.26);
        holes.M(ax + (bx - ax) * 0.74, ay + (by - ay) * 0.74).L(ax + (bx - ax) * 0.82, ay + (by - ay) * 0.82);
      }
      chalk(g, holes, span(q, 0.6, 0.85), T.chalk, 4 * u);
    }
  }
  function bulb(g, S, T, x, y, s, q, t) {
    const u = S.u, P = new Pth(1 * u, 710);
    P.E(x, y, s * 0.5, s * 0.5, Math.PI * 0.75, Math.PI * 2.25, true).L(x + s * 0.2, y + s * 0.62).L(x - s * 0.2, y + s * 0.62).L(x - s * 0.35, y + s * 0.35);
    P.M(x - s * 0.2, y + s * 0.74).L(x + s * 0.2, y + s * 0.74).M(x - s * 0.14, y + s * 0.86).L(x + s * 0.14, y + s * 0.86);
    P.M(x - s * 0.12, y + s * 0.3).L(x - s * 0.06, y).L(x + s * 0.06, y + s * 0.1).L(x + s * 0.12, y + s * 0.3);
    chalk(g, P, span(q, 0, 0.7), T.acc, 4.5 * u);
    if (q > 0.7) {
      const R = new Pth(0, 711);
      for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k - 2) * 0.55, L = s * (0.2 + 0.14 * (0.5 + 0.5 * Math.sin(t * 6 + k * 1.7))); R.M(x + Math.cos(a) * s * 0.66, y + Math.sin(a) * s * 0.66).L(x + Math.cos(a) * (s * 0.66 + L), y + Math.sin(a) * (s * 0.66 + L)); }
      chalk(g, R, span(q, 0.7, 0.9), T.acc, 4 * u);
    }
  }
  function star(P, x, y, r, rot = 0) {
    for (let k = 0; k <= 5; k++) { const a = rot - Math.PI / 2 + (k * 4 * Math.PI) / 5; k ? P.L(x + Math.cos(a) * r, y + Math.sin(a) * r) : P.M(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    return P;
  }
  function playBadge(g, S, T, x, y, s, q, t) {
    const u = S.u, P = new Pth(1.2 * u, 720).O(x, y, s);
    chalk(g, P, span(q, 0, 0.5), T.c3, 4.5 * u);
    const k = 1 + 0.06 * Math.sin(t * 4);
    chalk(g, new Pth(0.8 * u, 721).poly([[x - s * 0.3 * k, y - s * 0.42 * k], [x + s * 0.48 * k, y], [x - s * 0.3 * k, y + s * 0.42 * k], [x - s * 0.3 * k, y - s * 0.42 * k]]), span(q, 0.4, 0.9), T.c3, 4.5 * u);
  }
  function underline(g, S, T, id, q, col, seed) {
    const H = head(id), u = S.u;
    if (!H.lines.length) return null;
    const L = H.lines[H.lines.length - 1], y = L.y + L.h * 0.98;
    const P = new Pth(1.6 * u, seed).M(L.x - 6 * u, y);
    for (let k = 1; k <= 24; k++) P.L(L.x - 6 * u + (L.w + 12 * u) * (k / 24), y + Math.sin(k * 1.3) * 5 * u + k * 0.25 * u);
    chalk(g, P, q, col, 6 * u);
    return { L, y };
  }
  // Free room at the top right, beside the headline?
  function roomTopRight(S, id, need) {
    const H = head(id), fw = frameW(S);
    if (!H.lines.length) return true;
    return H.lines.every((l) => l.x + l.w < S.W - fw - need || l.y > fw + need * 1.1);
  }
  // A classroom clock: drawn with the scene, its hands keep moving.
  function clock(g, S, T, x, y, r, q, t, seed) {
    const u = S.u;
    chalk(g, new Pth(1 * u, seed).O(x, y, r), span(q, 0, 0.5), T.chalk, 4.5 * u);
    const tk = new Pth(0, seed + 1);
    for (let k = 0; k < 12; k++) { const a = (k * TAU) / 12, r0 = r * (k % 3 ? 0.84 : 0.74); tk.M(x + Math.cos(a) * r0, y + Math.sin(a) * r0).L(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92); }
    chalk(g, tk, span(q, 0.4, 0.8), T.chalk, 3.4 * u);
    if (q > 0.7) {
      const m = -Math.PI / 2 + t * 0.9, h = -Math.PI / 2 + 1.1 + t * 0.075;
      chalk(g, new Pth(0, seed + 2).M(x, y).L(x + Math.cos(h) * r * 0.48, y + Math.sin(h) * r * 0.48), 1, T.chalk, 5 * u);
      chalk(g, new Pth(0, seed + 3).M(x, y).L(x + Math.cos(m) * r * 0.74, y + Math.sin(m) * r * 0.74), 1, T.c2, 3.6 * u);
      dot(g, x, y, 5 * u, T.c2);
    }
  }
  function clapper(g, S, T, x, y, s, q, t) {
    const u = S.u, open = 0.12 + 0.12 * Math.max(0, Math.sin(t * 2.2));
    const P = new Pth(1.2 * u, 800).R(x - s, y - s * 0.35, s * 2, s * 1.2);
    for (let k = 0; k < 3; k++) P.M(x - s * 0.7, y + s * 0.05 + k * s * 0.24).L(x + s * 0.4 - k * s * 0.3, y + s * 0.05 + k * s * 0.24);
    chalk(g, P, span(q, 0, 0.6), T.chalk, 4.5 * u);
    g.save(); g.translate(x - s, y - s * 0.4); g.rotate(-open);
    const B = new Pth(0.8 * u, 801).R(0, -s * 0.34, s * 2, s * 0.34);
    for (let k = 0; k < 5; k++) B.M(s * 0.1 + k * s * 0.4, -s * 0.34).L(s * 0.3 + k * s * 0.4, 0);
    chalk(g, B, span(q, 0.5, 1), T.acc, 4.5 * u);
    g.restore();
  }
  // The lesson's outline: the steps when the reel has a process, otherwise the headlines still to come.
  function outlineItems() {
    const c = controls() || {}, P = planOf(), ids = P && P.shown ? P.shown.map((s) => s.id) : [];
    let items = [];
    if (ids.includes("process")) items = [c.step_1, c.step_2, c.step_3];
    else items = ids.filter((id) => DRAWN.has(id)).map((id) => c[`${id}_title`]);
    items = items.filter((v) => v && String(v).trim());
    return items.slice(0, 3);
  }
  function bounds(id) {
    const H = head(id);
    if (!H.lines.length) return null;
    return { x0: Math.min(...H.lines.map((l) => l.x)), x1: Math.max(...H.lines.map((l) => l.x + l.w)), y0: Math.min(...H.lines.map((l) => l.y)), y1: Math.max(...H.lines.map((l) => l.y + l.h)) };
  }
  function numberBadge(g, S, T, x, y, n, q, col, seed) {
    const u = S.u;
    chalk(g, new Pth(0.8 * u, seed).O(x, y, 32 * u), span(q, 0, 0.6), col, 4 * u);
    write(g, String(n), x, y + 2 * u, 44 * u, { align: "center", color: col, q: span(q, 0.5, 1) });
  }
  function titleDecor(g, S, T, local, hold) {
    const { W, H, u, tall } = S, s = Math.min(W, H) / 1080;
    const fw = frameW(S), th = trayH(S);
    const ul = underline(g, S, T, "title", span(local, 0.8, 1.4), T.acc, 730);
    const B = bounds("title") || { x0: fw + 100 * u, x1: W * 0.6, y0: H * 0.4, y1: H * 0.6 };
    const film = [W - fw - (tall ? 210 : 260) * u, fw + (tall ? 170 : 150) * u];
    guide(g, new Pth(1 * u, 742).M(film[0] - 140 * s, film[1] + 40 * s).Q(film[0], film[1] - 70 * s, film[0] + 140 * s, film[1]), T.chalk);
    filmCurl(g, S, T, film[0], film[1], 140 * s, span(local, 0.3, 1.3), local);
    // Right of the headline: a clapper when there is a lot of room, otherwise the idea bulb.
    const room = W - fw - B.x1;
    if (!tall && room > 560 * u) clapper(g, S, T, W - fw - 300 * u, (B.y0 + B.y1) / 2, 120 * s, span(local, 0.5, 1.5), local);
    else if (!tall && room > 240 * u) {
      const bx = B.x1 + room / 2, by = (B.y0 + B.y1) / 2 - 10 * u, bs = Math.min(120 * s, room * 0.42);
      guide(g, new Pth(1 * u, 741).O(bx, by, bs * 0.6), T.chalk);
      bulb(g, S, T, bx, by, bs, span(local, 0.6, 1.5), local);
    }
    // Under the headline: the lesson outline drawn as a timeline, a play badge at its start, numbered stops
    // with their words, and a dot that keeps travelling along it.
    const items = outlineItems(), n = items.length;
    const top = (ul ? ul.y : B.y1) + 46 * u, bottom = H - th - 26 * u;
    const lk = (a, b) => span(local, a, b);
    if (!tall) {
      const Ly = top + Math.min(70 * u, (bottom - top) * 0.3), x0 = fw + 140 * u, x1 = W - fw - 110 * u, pr = Math.min(52 * s, (bottom - top) * 0.22);
      guide(g, new Pth(1 * u, 740).O(x0, Ly, pr), T.chalk);
      playBadge(g, S, T, x0, Ly, pr, lk(0.4, 1.0), local);
      const line = new Pth(1.4 * u, 744).M(x0 + pr + 16 * u, Ly);
      for (let k = 1; k <= 30; k++) line.L(lerp(x0 + pr + 16 * u, x1, k / 30), Ly + Math.sin(k * 1.1) * 3 * u);
      guide(g, line, T.chalk);
      chalk(g, line, lk(0.5, 1.3), T.chalk, 4.5 * u);
      if (lk(0.5, 1.3) >= 1) chalk(g, arrowHead(new Pth(0, 745), x1, Ly, 0, 22 * u), 1, T.chalk, 4.5 * u);
      // Ruler ticks along the line.
      const tk = new Pth(0.4 * u, 746);
      for (let k = 0; k <= 24; k++) { const xx = lerp(x0 + pr + 40 * u, x1 - 30 * u, k / 24); tk.M(xx, Ly - (k % 4 ? 8 : 14) * u).L(xx, Ly + (k % 4 ? 8 : 14) * u); }
      chalk(g, tk, lk(0.9, 1.5), T.muted, 3 * u);
      const segW = (x1 - x0 - pr - 60 * u) / Math.max(1, n), stops = [];
      items.forEach((label, i) => {
        const nx = x0 + pr + 60 * u + segW * i + 34 * u, o = 0.9 + i * 0.28;
        numberBadge(g, S, T, nx, Ly, i + 1, lk(o, o + 0.3), i === n - 1 ? T.acc : T.c2, 747 + i);
        write(g, label, nx - 30 * u, Ly + 74 * u, 46 * u, { color: T.chalk, q: lk(o + 0.15, o + 0.5), maxW: segW - 40 * u, min: 42 * u, weight: 400 });
        stops.push(nx);
      });
      if (local > 1.6) {
        const f = ((local - 1.6) * 0.35) % 1, xx = lerp(x0 + pr + 20 * u, x1 - 20 * u, f);
        for (let j = 0; j < 4; j++) { g.save(); g.globalAlpha *= 1 - j * 0.24; dot(g, xx - j * 14 * u, Ly - 26 * u, (9 - j * 1.6) * u, T.c3); g.restore(); }
      }
    } else {
      const Lx = fw + 130 * u, y0 = top + 60 * u, y1 = bottom - 60 * u, pr = 56 * s;
      playBadge(g, S, T, Lx, y0, pr, lk(0.4, 1.0), local);
      const line = new Pth(1.4 * u, 744).M(Lx, y0 + pr + 16 * u).L(Lx, y1);
      guide(g, line, T.chalk);
      chalk(g, line, lk(0.5, 1.3), T.chalk, 4.5 * u);
      const seg = (y1 - y0 - pr - 40 * u) / Math.max(1, n);
      items.forEach((label, i) => {
        const ny = y0 + pr + 40 * u + seg * (i + 0.5), o = 0.9 + i * 0.28;
        numberBadge(g, S, T, Lx, ny, i + 1, lk(o, o + 0.3), i === n - 1 ? T.acc : T.c2, 747 + i);
        write(g, label, Lx + 64 * u, ny, 54 * u, { color: T.chalk, q: lk(o + 0.15, o + 0.5), maxW: W - fw - 220 * u - Lx, min: 42 * u, weight: 400 });
      });
      bulb(g, S, T, W - fw - 130 * u, y0 + seg * 0.4, 100 * s, lk(0.6, 1.5), local);
      if (local > 1.6) { const f = ((local - 1.6) * 0.35) % 1; dot(g, Lx + 26 * u, lerp(y0 + pr + 20 * u, y1, f), 9 * u, T.c3); }
    }
    // Stars keep being drawn along the top edge through the hold.
    const sp = new Pth(0.8 * u, 750), ns = 5;
    for (let k = 0; k < ns; k++) star(sp, fw + (tall ? 120 : 180) * u + k * 74 * s, fw + 90 * u + Math.sin(k * 1.9) * 16 * s, (k % 2 ? 16 : 24) * s, k * 0.4);
    chalk(g, sp, span(local, 1.2, Math.max(1.9, hold - 0.2)), T.c2, 4 * u);
  }
  // A small card sketch: a picture, a dial track, a button; three numbered leaders point into it.
  function cardSketch(g, S, T, x, y, w, h, q, t, nums) {
    const u = S.u, P = new Pth(1.4 * u, 900).RR(x, y, w, h, 18 * u);
    chalk(g, P, span(q, 0, 0.3), T.chalk, 5.5 * u);
    const pv = { x: x + w * 0.07, y: y + h * 0.1, w: w * 0.46, h: h * 0.48 };
    chalk(g, new Pth(1 * u, 901).R(pv.x, pv.y, pv.w, pv.h), span(q, 0.2, 0.4), T.chalk, 3.6 * u);
    chalk(g, new Pth(1 * u, 902).M(pv.x + 4 * u, pv.y + pv.h * 0.85).L(pv.x + pv.w * 0.35, pv.y + pv.h * 0.4).L(pv.x + pv.w * 0.6, pv.y + pv.h * 0.7).L(pv.x + pv.w * 0.8, pv.y + pv.h * 0.45).L(pv.x + pv.w - 4 * u, pv.y + pv.h * 0.85), span(q, 0.3, 0.5), T.c3, 3.6 * u);
    chalk(g, new Pth(0.6 * u, 903).O(pv.x + pv.w * 0.78, pv.y + pv.h * 0.26, pv.h * 0.11), span(q, 0.35, 0.5), T.acc, 3.4 * u);
    const L = new Pth(0.8 * u, 904);
    for (let k = 0; k < 3; k++) L.M(x + w * 0.6, y + h * (0.16 + k * 0.15)).L(x + w * (0.92 - k * 0.1), y + h * (0.16 + k * 0.15));
    chalk(g, L, span(q, 0.35, 0.55), T.muted, 3.2 * u);
    // Dial track: the knob keeps sliding while the closer holds.
    const sy = y + h * 0.75, sx0 = x + w * 0.08, sx1 = x + w * 0.52;
    chalk(g, new Pth(0.6 * u, 905).M(sx0, sy).L(sx1, sy), span(q, 0.45, 0.6), T.chalk, 3.6 * u);
    const kx = lerp(sx0, sx1, 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(t * 1.7)));
    if (q > 0.6) chalk(g, new Pth(0.6 * u, 906).O(kx, sy, 13 * u), 1, T.c2, 4 * u);
    // Button.
    const bx = x + w * 0.62, by = y + h * 0.66, bw = w * 0.3, bh = h * 0.2;
    chalk(g, new Pth(0.8 * u, 907).RR(bx, by, bw, bh, 10 * u), span(q, 0.55, 0.7), T.acc, 4 * u);
    chalk(g, new Pth(0.6 * u, 908).M(bx + bw * 0.34, by + bh * 0.5).L(bx + bw * 0.46, by + bh * 0.72).L(bx + bw * 0.68, by + bh * 0.28), span(q, 0.65, 0.75), T.acc, 4 * u);
    return { pic: [pv.x + pv.w * 0.5, pv.y + pv.h * 0.5], dial: [kx, sy], button: [bx + bw * 0.5, by + bh], nums };
  }
  function closingDecor(g, S, T, local, hold) {
    const { W, H, u, tall } = S, s = Math.min(W, H) / 1080, fw = frameW(S), th = trayH(S);
    const ul = underline(g, S, T, "closing", span(local, 0.75, 1.3), T.acc, 760);
    const B = bounds("closing") || { x0: fw + 100 * u, x1: W * 0.6, y0: H * 0.42, y1: H * 0.58 };
    const lk = (a, b) => span(local, a, b);
    const top = { x: fw + 90 * u, y: fw + 50 * u, w: W - fw * 2 - 180 * u, h: B.y0 - fw - 110 * u };
    const foot = H - th - 110 * u, bot = { x: fw + 90 * u, y: (ul ? ul.y : B.y1) + 50 * u, w: W - fw * 2 - 180 * u };
    bot.h = foot - bot.y;
    const roomRight = W - fw - 90 * u - B.x1;
    // The card: beside the headline when it is short, otherwise in the top band's right half.
    let card, clockOK = true;
    if (!tall && roomRight > 620 * u) {
      const ch = Math.min(360 * u, (roomRight - 200 * u) / 1.5, B.y1 - B.y0 + 160 * u), cw = ch * 1.5;
      card = { x: W - fw - 90 * u - cw, y: (B.y0 + B.y1) / 2 - ch / 2, w: cw, h: ch };
    } else if (!tall) {
      const ch = Math.min(top.h, 320 * u), cw = ch * 1.5;
      card = { x: top.x + top.w - cw, y: top.y + (top.h - ch) / 2, w: cw, h: ch };
      clockOK = false;
    } else {
      const ch = Math.min(top.h * 0.5, 330 * u), cw = ch * 1.5;
      card = { x: W - fw - 90 * u - cw, y: top.y + top.h - ch, w: cw, h: ch };
      clockOK = false;
    }
    if (clockOK && roomTopRight(S, "closing", 300 * u)) clock(g, S, T, W - fw - 150 * u, fw + 140 * u, 80 * s, lk(0.3, 1.1), local, 830);
    guide(g, new Pth(1 * u, 899).RR(card.x, card.y, card.w, card.h, 18 * u), T.chalk);
    const C = cardSketch(g, S, T, card.x, card.y, card.w, card.h, lk(0.2, 1.3), local);
    // Numbered leaders into the card's picture, dial and button.
    const items = outlineItems(), n = items.length ? Math.min(3, items.length) : 3;
    const parts = [C.pic, C.dial, C.button];
    for (let i = 0; i < n; i++) {
      const nx = card.x - 80 * u, ny = card.y + card.h * (0.18 + i * 0.34), o = 0.9 + i * 0.22;
      numberBadge(g, S, T, nx, ny, i + 1, lk(o, o + 0.25), i === 2 ? T.acc : T.c2, 910 + i);
      const [px, py] = parts[i], A = new Pth(1 * u, 915 + i).M(nx + 38 * u, ny).Q((nx + px) / 2, Math.min(ny, py) - 30 * u, px - 10 * u, py - 6 * u);
      const ak = lk(o + 0.15, o + 0.4);
      chalk(g, A, ak, i === 2 ? T.acc : T.c2, 3.4 * u);
      if (ak >= 1) { const [ex, ey] = A.at(1), [qx, qy] = A.at(0.93); chalk(g, arrowHead(new Pth(0, 918 + i), ex, ey, Math.atan2(ey - qy, ex - qx), 16 * u), 1, i === 2 ? T.acc : T.c2, 3.4 * u); }
    }
    // The card gets its tick: a big stroke over its corner, confetti that keeps twinkling.
    const tickX = card.x + card.w * 0.86, tickY = card.y + card.h * 0.3, tr = Math.min(card.h * 0.26, 76 * s);
    chalk(g, new Pth(1.4 * u, 763).O(tickX, tickY, tr), lk(1.5, 1.85), T.c3, 5 * u);
    chalk(g, new Pth(1.6 * u, 762).M(tickX - tr * 0.56, tickY + tr * 0.02).L(tickX - tr * 0.15, tickY + tr * 0.48).L(tickX + tr * 0.68, tickY - tr * 0.56), lk(1.7, 2.0), T.acc, 7 * u);
    if (local > 2.0) {
      const cf = new Pth(0, 764), r = rng(77);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * TAU + r() * 0.3, pulse = 0.5 + 0.5 * Math.sin(local * 5 + k * 1.3), r0 = tr * 1.3 + pulse * 8 * s, r1 = r0 + (12 + pulse * 16) * s;
        cf.M(tickX + Math.cos(a) * r0, tickY + Math.sin(a) * r0).L(tickX + Math.cos(a) * r1, tickY + Math.sin(a) * r1);
      }
      chalk(g, cf, lk(2.0, 2.3), T.c2, 4 * u);
    }
    // Top band, left: the lesson recap as a checklist, ticked off one after another.
    const listW = (card.y < B.y0 ? card.x - 160 * u : top.w) - (top.x - fw - 90 * u) - 20 * u;
    const rowH = Math.min(96 * u, top.h / Math.max(1, items.length) - (tall && card.y < B.y0 ? card.h / 3 : 0));
    if (rowH >= 62 * u && items.length) {
      const y0 = top.y + Math.max(0, (Math.min(top.h, tall ? top.h - card.h - 40 * u : top.h) - rowH * items.length) / 2);
      items.forEach((label, i) => {
        const yy = y0 + rowH * (i + 0.5), bx = top.x + 10 * u, bs = 46 * u, o = 0.5 + i * 0.25;
        chalk(g, new Pth(0.8 * u, 920 + i).R(bx, yy - bs / 2, bs, bs), lk(o, o + 0.2), T.chalk, 4 * u);
        write(g, label, bx + bs + 26 * u, yy, Math.min(58 * u, rowH * 0.62), { color: T.chalk, q: lk(o + 0.1, o + 0.45), maxW: listW - bs - 40 * u, min: 42 * u, weight: 400 });
        chalk(g, new Pth(0.6 * u, 925 + i).M(bx + bs * 0.15, yy).L(bx + bs * 0.45, yy + bs * 0.35).L(bx + bs * 1.1, yy - bs * 0.6), lk(1.1 + i * 0.3, 1.3 + i * 0.3), T.acc, 5 * u);
      });
    }
    // Bottom band: a dial being turned, a strip of clips with a sweeping playhead.
    if (bot.h > 110 * u) {
      // The dial sits beside a short headline when the card is up in the top band; otherwise it leads the strip.
      const side = !tall && card.y + card.h < B.y0 && roomRight > 260 * u;
      const kr = side ? Math.min(roomRight * 0.26, 130 * u) : Math.min(bot.h * 0.4, 90 * u);
      const kx = side ? B.x1 + roomRight * 0.55 : bot.x + kr + 30 * u, ky = side ? (B.y0 + B.y1) / 2 : bot.y + bot.h / 2;
      chalk(g, new Pth(1 * u, 930).O(kx, ky, kr), lk(0.8, 1.2), T.chalk, 4.5 * u);
      const tk = new Pth(0, 931);
      for (let k = 0; k <= 8; k++) { const a = Math.PI * 0.75 + (k / 8) * Math.PI * 1.5; tk.M(kx + Math.cos(a) * kr * 1.15, ky + Math.sin(a) * kr * 1.15).L(kx + Math.cos(a) * kr * 1.32, ky + Math.sin(a) * kr * 1.32); }
      chalk(g, tk, lk(1.0, 1.4), T.muted, 3.4 * u);
      if (local > 1.2) {
        const a = Math.PI * 0.75 + Math.PI * 1.5 * (0.35 + 0.4 * (0.5 + 0.5 * Math.sin(local * 1.4)));
        chalk(g, new Pth(0, 932).M(kx, ky).L(kx + Math.cos(a) * kr * 0.8, ky + Math.sin(a) * kr * 0.8), 1, T.c2, 5 * u);
        dot(g, kx, ky, 6 * u, T.c2);
      }
      const sx0 = side ? bot.x + 20 * u : kx + kr * 1.6 + 40 * u, sx1 = (card.y > B.y1 ? card.x - 140 * u : bot.x + bot.w);
      if (sx1 - sx0 > 200 * u) {
        const rh = Math.min(bot.h * 0.28, 56 * u), r0 = bot.y + bot.h / 2 - rh * 1.15;
        const clips = [[[0, 0.28], [0.32, 0.3], [0.66, 0.34]], [[0.06, 0.4], [0.5, 0.46]]];
        clips.forEach((row, ri) => row.forEach(([cx0, cw], ci) => {
          const o = 0.9 + ri * 0.12 + ci * 0.08, hot = ri === 0 && ci === 1;
          chalk(g, new Pth(0.8 * u, 940 + ri * 4 + ci).R(lerp(sx0, sx1, cx0), r0 + ri * rh * 1.3, (sx1 - sx0) * cw, rh), lk(o, o + 0.3), hot ? T.acc : T.chalk, 3.6 * u);
        }));
        if (local > 1.4) {
          const phx = lerp(sx0, sx1, ((local - 1.4) * 0.3) % 1);
          chalk(g, new Pth(0, 950).M(phx, r0 - 18 * u).L(phx, r0 + rh * 2.5).M(phx - 10 * u, r0 - 28 * u).L(phx + 10 * u, r0 - 28 * u).L(phx, r0 - 16 * u).L(phx - 10 * u, r0 - 28 * u), 1, T.c2, 3.6 * u);
        }
      }
    }
    // A row of small stars along the foot of the board, written one after another to the very end.
    const ns = 9, period = 0.42, start = 0.6;
    const k = Math.floor((local - start) / period);
    for (let j = 0; j < Math.min(ns, Math.max(0, k + 1)); j++) {
      const sx = fw + (tall ? 110 : 200) * u + j * ((W - fw * 2 - (tall ? 220 : 400) * u) / (ns - 1)), sy = H - th - 70 * u + Math.sin(j * 1.7) * 10 * s;
      const q = clamp((local - start - j * period) / (period * 0.9));
      chalk(g, star(new Pth(0.6 * u, 770 + j), sx, sy, (j % 2 ? 15 : 22) * s, j * 0.5), q, j % 3 === 0 ? T.acc : j % 3 === 1 ? T.c2 : T.c3, 3.8 * u);
    }
    if (k >= ns) {
      const dots = Math.floor((local - start - ns * period) / 0.18);
      const P = new Pth(0, 790);
      for (let j = 0; j <= dots % 24; j++) { const xx = fw + (tall ? 110 : 200) * u + j * 26 * s, yy = H - th - 26 * u; P.M(xx, yy).L(xx + 6 * s, yy); }
      chalk(g, P, 0.999, T.chalk, 5 * u);
    }
  }
  function decor(g, S, T, id, local, hold) { if (id === "title") titleDecor(g, S, T, local, hold); else if (id === "closing") closingDecor(g, S, T, local, hold); }

  // ---- foreground: dust, eraser, pointer, chalk ---------------------------------------------------
  let motes = null;
  function foreground(ctx, S, T) {
    if (ST.fg) return;
    ST.fg = true;
    const { W, H, u } = S, t = ST.info.t, i = ST.info, onBoard = ST.backdrop;
    // Dust drifting down through the light.
    if (!motes) { const r = rng(91); motes = Array.from({ length: 46 }, () => ({ x: r(), ph: r(), sp: 0.02 + r() * 0.05, sz: 0.8 + r() * 2.2, dr: 0.3 + r() * 0.8, a: 0.15 + r() * 0.35 })); }
    ctx.save(); ctx.fillStyle = T.light ? "rgba(120,120,120,1)" : T.chalk;
    for (const m of motes) {
      const y = (((m.ph + t * m.sp) % 1) * (H + 40 * u)) - 20 * u, x = m.x * W + Math.sin(t * m.dr + m.ph * 9) * 34 * u;
      ctx.globalAlpha = m.a * T.tex * (0.6 + 0.4 * Math.sin(t * 2 + m.ph * 20));
      ctx.beginPath(); ctx.arc(x, y, m.sz * u, 0, TAU); ctx.fill();
    }
    ctx.restore();
    const E = eraseNow();
    const restY = H - trayH(S) + 8 * u;
    // Wooden pointer: slides in once the drawing is done and taps each part in turn.
    if (ST.targets && ST.targets.length && DRAWN.has(i.scene)) {
      const startAt = ST.buildEnd + 0.15, endAt = i.next ? i.hold - i.change - 0.1 : i.hold + 10;
      const kin = ease((i.local - startAt) / 0.45), kout = i.next ? 1 - ease((i.local - (endAt - 0.4)) / 0.4) : 1, k = Math.min(kin, kout);
      if (k > 0) {
        const n = ST.targets.length, per = 1.15, tt = Math.max(0, i.local - startAt), idx = Math.floor(tt / per), f = (tt % per) / per;
        const A = ST.targets[(idx + n - 1) % n], B = ST.targets[idx % n], m = idx === 0 ? 1 : inout(f / 0.4);
        const tap = f > 0.45 ? Math.max(0, Math.sin(((f - 0.45) / 0.55) * Math.PI * 2)) * 12 * u : 0;
        let tx = lerp(A[0], B[0], m) + tap * 0.6, ty = lerp(A[1], B[1], m) + tap;
        // The pointer is held from below the board, a little to the right of where it points.
        const bx = Math.min(W + 60 * u, tx + 420 * u), by = H + 140 * u;
        const ox = W + 80 * u, oy = H * 0.9;
        tx = lerp(ox, tx, k); ty = lerp(oy, ty, k);
        pointerAt(ctx, S, tx, ty, lerp(ox + 200 * u, bx, k), by);
      }
    }
    // The eraser: swiping during a change, otherwise resting in the tray.
    if (E > 0 && E < 1) {
      const [x, y] = eraserPath(S, E), [x2, y2] = eraserPath(S, Math.min(1, E + 0.01));
      eraserAt(ctx, S, x, y, Math.atan2(y2 - y, x2 - x) * 0.25);
    } else if (onBoard) eraserAt(ctx, S, W * 0.72, restY - 30 * u, 0, 0.82);
    // The chalk: writing where a line is being drawn, otherwise lying in the tray.
    const tip = ST.headTip || ST.tip;
    if (tip && !(E > 0 && E < 1 && tip[0] > edgeX(S, E, tip[1]) && ST.tipIncoming)) {
      const wob = Math.sin(t * 40) * 1.2 * u;
      stick(ctx, S, tip[0] + wob, tip[1], ST.headTip ? T.chalk : ST.tipColor || T.chalk, -0.9, 1, true);
      ctx.save(); ctx.fillStyle = T.chalk;
      for (let k = 0; k < 4; k++) { const ph = (t * 3 + k * 0.25) % 1; ctx.globalAlpha = (1 - ph) * 0.6 * T.tex; ctx.beginPath(); ctx.arc(tip[0] - 4 * u + k * 3 * u, tip[1] + ph * 40 * u, 1.6 * u, 0, TAU); ctx.fill(); }
      ctx.restore();
    } else if (onBoard) stick(ctx, S, W * 0.56, restY - 8 * u, T.chalk, 0.06, 0.95);
  }

  // ---- registration helpers ----------------------------------------------------------------------
  function ensure(S, info) {
    if (!ST || ST.S !== S) ST = { S, info: info || { t: 0, local: 0, hold: 4, change: 0.45, index: 0, scene: null, next: null }, fg: false, tip: null, targets: null, buildEnd: 1.5, backdrop: true };
    return ST;
  }
  const buildLen = (hold) => clamp(hold * 0.6, 1, 2.6);
  const scene = (id) => (ctx, S, box, p, d, info) => {
    ensure(S, info);
    const T = tone(S), exiting = info && info.exit !== undefined;
    const local = info ? info.local : 0, hold = info ? info.hold : 4, change = info ? info.change : 0.45;
    const start = 0.25, bl = buildLen(hold);
    const pp = clamp((local - start) / bl);
    const g = layer(S);
    ST.exiting = exiting;
    const before = ST.tip;
    const targets = DRAW[id](g, S, T, box, pp, d, { t: info ? info.t : 0, local, hold });
    if (roomTopRight(S, HEADS[id], 330 * S.u)) clock(g, S, T, S.W - frameW(S) - 150 * S.u, frameW(S) + 140 * S.u, 78 * S.u, clamp((local - 0.2) / 1.2), info ? info.t : 0, 840);
    if (!exiting) { ST.targets = targets; ST.buildEnd = start + bl; ST.tipIncoming = ST.info.index > 0 && local < change; }
    else ST.tip = before;
    let E = 0;
    if (exiting) E = 0.5 + 0.5 * info.exit;
    else if (ST.info.next && local > hold - change) E = clamp((local - (hold - change)) / (2 * change));
    if (E > 0) applyErase(g, S, E, false);
    if (!exiting && ST.info.index > 0 && local < change) applyErase(g, S, 0.5 + 0.5 * clamp(local / Math.max(0.01, change)), true);
    composite(ctx, S, T);
    ST.exiting = false;
    if (!exiting || !DRAWN.has(ST.info.scene)) foreground(ctx, S, T);
  };

  const CHALKMASK = (tex) =>
    "url(\"data:image/svg+xml," +
    encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'><filter id='c'><feTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='2' seed='23' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -5 0 0 0 " +
        (3.3 + (1 - tex) * 4).toFixed(2) +
        "'/></filter><rect width='100%' height='100%' filter='url(#c)'/></svg>",
    ) +
    "\")";

  return {
    bg: "#1e2a25", panel: "#26332d", ink: "#f0eee4", muted: "#a9b3a8", accent: "#f2cf5b", onAccent: "#1e2a25",
    rule: "rgba(240,238,228,0.5)", track: "rgba(240,238,228,0.08)",
    display: "'Chalkboard SE', 'Marker Felt', 'Comic Sans MS', 'Segoe Print', cursive", displayWeight: 700, displayCase: "none", displayTracking: "0em",
    body: "'Chalkboard SE', 'Marker Felt', 'Comic Sans MS', 'Segoe Print', cursive", bodyWeight: 400,
    figures: "'Chalkboard SE', 'Marker Felt', 'Comic Sans MS', cursive", radius: 14, motion: "write", kit: { line: 4, fill: "hatch", panel: "outline", hatch: true },
    palettes: {
      light: { bg: "#f7f7f4", panel: "#ffffff", ink: "#1f2a44", muted: "#5d6780", accent: "#e8553a", onAccent: "#ffffff", rule: "rgba(31,42,68,0.45)", track: "rgba(31,42,68,0.08)", backdrop: () => "#f7f7f4" },
      dark: { bg: "#151515", panel: "#1e1e1e", backdrop: () => `${smudge}, radial-gradient(110% 90% at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.45) 100%), #151515` },
      mono: { accent: "#f0eee4", onAccent: "#1e2a25" },
    },
    backdrop: () => `${smudge}, radial-gradient(110% 90% at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.35) 100%), #1e2a25`,
    // Only the illustrated template has the #art canvas: there the HTML headlines get broken chalk grain too.
    css: (accent, look) => {
      const m = CHALKMASK(look.texture ?? 1);
      return `#art ~ .scene .display, #art ~ .scene .kicker { -webkit-mask-image: ${m}; mask-image: ${m}; -webkit-mask-size: 260px 260px; mask-size: 260px 260px; text-shadow: 0 0 12px ${hexA(look.ink, 0.28)}; }`;
    },
    keepArt: true,
    overlap: true,
    stage(ctx, S, info) {
      ST = { S, info, fg: false, tip: null, headTip: null, targets: null, buildEnd: 1.5, exiting: false, tipIncoming: false };
      const T = tone(S), P = planOf();
      ST.backdrop = P ? P.backdrop : true;
      if (ST.backdrop) {
        ctx.drawImage(board(S, T), 0, 0);
        // A slow drift of window light across the slate.
        const lx = S.W * (0.5 + 0.35 * Math.sin(info.t * 0.17)), gr = ctx.createRadialGradient(lx, S.H * 0.35, 0, lx, S.H * 0.35, S.W * 0.5);
        gr.addColorStop(0, `rgba(255,250,235,${(T.light ? 0.06 : 0.045) * T.tex})`); gr.addColorStop(1, "rgba(255,250,235,0)");
        ctx.fillStyle = gr; ctx.fillRect(0, 0, S.W, S.H);
        smear(ctx, S, T);
      }
      ST.headTip = headTip(S);
      const prev = P && P.shown && info.index > 0 ? P.shown[info.index - 1] : null;
      // The title's doodles are wiped by the eraser as the next scene begins.
      if (prev && prev.id === "title" && info.local < info.change) {
        const g = layer(S);
        ST.exiting = true;
        decor(g, S, T, "title", prev.hold + info.local, prev.hold);
        ST.exiting = false;
        applyErase(g, S, 0.5 + 0.5 * clamp(info.local / Math.max(0.01, info.change)), false);
        composite(ctx, S, T);
      }
      if (info.scene === "title" || info.scene === "closing") {
        const g = layer(S);
        decor(g, S, T, info.scene, info.local, info.hold);
        const E = eraseNow();
        if (info.next && E > 0) applyErase(g, S, E, false);
        if (info.index > 0 && info.local < info.change) applyErase(g, S, 0.5 + 0.5 * clamp(info.local / Math.max(0.01, info.change)), true);
        composite(ctx, S, T);
      }
      const pending = prev && DRAWN.has(prev.id) && info.local < info.change;
      if (!DRAWN.has(info.scene) && !pending) foreground(ctx, S, T);
    },
    scenes: { chart: scene("chart"), object: scene("object"), people: scene("people"), process: scene("process"), compare: scene("compare") },
  };
});
