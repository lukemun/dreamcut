// Punk Zine: a photocopied cut-and-paste zine. Every scene is a torn sheet slapped onto a black copier lid.
// Headlines are ransom-note scraps pasted letter by letter, bars and figures are toner-black cut-outs with
// halftone shading, one fluoro spot ink sits off-register behind the line-work, and tape, staples, pins and
// scissors keep moving through every hold. Stop-motion boil (8 fps) runs under everything. Every frame is a
// pure function of time: seeded hashes only, no clocks. All drawings are original.
window.DreamcutMotion.register("punk-zine", ({ rng }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const ei = (v) => { v = clamp(v); return v * v * v; };
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const bk = (v) => { v = clamp(v); const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const hash = (n) => { n = Math.imul(n ^ (n >>> 15), 2246822519); n = Math.imul(n ^ (n >>> 13), 3266489917); n ^= n >>> 16; return (n >>> 0) / 4294967296; };
  const hh = (a, b = 0, c = 0) => hash(((a | 0) * 374761393 + (b | 0) * 668265263 + (c | 0) * 1274126177) | 0);
  const fmt = (v, d) => window.DreamcutMotion.formatNumber(v, 0, (d && d.prefix) || "", (d && d.suffix) || "");

  const F_BLACK = "'Arial Black', 'Helvetica Neue', Arial, sans-serif";
  const F_LABEL = "'Helvetica Neue', Helvetica, Arial, sans-serif";
  const F_TYPE = "'Courier New', Courier, monospace";
  const F_IMPACT = "Impact, 'Haettenschweiler', 'Arial Narrow Bold', sans-serif";

  let U = 1;
  let STEP = 0;
  const stepOf = (t) => Math.floor(t * 8);

  // ---- theme -------------------------------------------------------------------------------------
  function theme(S) {
    const L = S.look;
    return { board: L.board, page: L.page, news: L.news, white: L.white, ink: L.ink, mute: L.muted, tape: L.tape, acc: S.accent, inv: !!L.inv };
  }
  const colOf = (th, k) => (k === "ink" ? th.ink : k === "page" ? th.page : k === "white" ? th.white : k === "news" ? th.news : k === "tape" ? th.tape : th.acc);

  // ---- plan: which scenes play, when ---------------------------------------------------------------
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  function controls() {
    if (window.__dreamcut && window.__dreamcut.controls) return window.__dreamcut.controls;
    try { if (typeof dc !== "undefined" && dc && dc.controls) return dc.controls; } catch (e) { /* not on this page */ }
    return null;
  }
  function plan() {
    const c = controls();
    if (!c) return null;
    let t = 0;
    const out = [];
    for (const id of ORDER) { const hold = Number(c[`${id}_hold`]) || 0; if (hold > 0) out.push({ id, start: t, hold }); t += hold; }
    return out;
  }
  function orderOf(id) {
    const P = plan();
    if (!P) return { idx: 1, next: null, prev: null };
    const i = P.findIndex((s) => s.id === id);
    return { idx: i, next: P[i + 1] ? P[i + 1].id : null, prev: P[i - 1] ? P[i - 1].id : null };
  }
  const sid = (id) => { let s = 7; for (let i = 0; i < id.length; i++) s = (s * 31 + id.charCodeAt(i)) | 0; return s & 0xffff; };

  // ---- shapes ---------------------------------------------------------------------------------------
  const TORN = {};
  function torn(seed, w, h, rough, sides) {
    const key = seed + "|" + (w | 0) + "|" + (h | 0) + "|" + rough.toFixed(1) + "|" + sides;
    if (TORN[key]) return TORN[key];
    const r = rng(seed * 977 + 13), pts = [];
    const edge = (x0, y0, x1, y1, nx, ny, on) => {
      const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(L / (14 * U)));
      for (let i = 0; i < n; i++) {
        const k = i / n, o = on ? (r() - 0.5) * 2 * rough * (r() < 0.12 ? 2.4 : 1) : 0;
        pts.push(x0 + (x1 - x0) * k + nx * o, y0 + (y1 - y0) * k + ny * o);
      }
    };
    edge(0, 0, w, 0, 0, 1, sides & 1); edge(w, 0, w, h, -1, 0, sides & 2); edge(w, h, 0, h, 0, -1, sides & 4); edge(0, h, 0, 0, 1, 0, sides & 8);
    return (TORN[key] = pts);
  }
  function pathPts(g, pts) { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); }

  // Photocopy halftone: dots on a 45 degree screen whose size follows coverage(x, y).
  function halftone(g, x, y, w, h, cov, cell, color) {
    g.save(); g.fillStyle = color; g.beginPath();
    const rowH = cell * 0.5;
    let row = 0;
    for (let yy = y + rowH / 2; yy < y + h; yy += rowH, row++) {
      for (let xx = x + (row & 1 ? cell / 2 : 0) + cell / 4; xx < x + w; xx += cell) {
        const c = cov(xx, yy);
        if (c <= 0.025) continue;
        const r = Math.sqrt((Math.min(1, c) * cell * cell * 0.5) / Math.PI) * 1.06;
        g.moveTo(xx + r, yy); g.arc(xx, yy, r, 0, TAU);
      }
    }
    g.fill(); g.restore();
  }

  // A torn sheet. `draw(g, w, h)` paints inside it (clipped to its torn edge) in sheet coordinates.
  function sheet(g, x, y, w, h, o = {}) {
    const pts = torn(o.seed ?? 1, w, h, (o.rough ?? 4) * U, o.sides ?? 15);
    g.save(); g.translate(x, y);
    if (o.rot) { g.translate(w / 2, h / 2); g.rotate(o.rot); g.translate(-w / 2, -h / 2); }
    pathPts(g, pts);
    g.save();
    if (o.shadow !== false) {
      g.shadowColor = o.shadowColor || "rgba(0,0,0,0.42)"; g.shadowBlur = (o.sb ?? 16) * U; g.shadowOffsetX = (o.sx ?? 4) * U; g.shadowOffsetY = (o.sy ?? 7) * U;
    }
    g.fillStyle = o.fill; g.fill();
    g.restore();
    if (o.draw) { g.save(); pathPts(g, pts); g.clip(); o.draw(g, w, h); g.restore(); }
    if (o.edge !== false) { pathPts(g, pts); g.strokeStyle = o.edgeColor || "rgba(0,0,0,0.2)"; g.lineWidth = 1.3 * U; g.stroke(); }
    g.restore();
  }

  function tape(g, x, y, len, wid, ang, col, seed, alpha = 0.84) {
    g.save(); g.translate(x, y); g.rotate(ang);
    const r = rng(seed * 31 + 5), n = 6;
    g.beginPath(); g.moveTo(-len / 2, -wid / 2); g.lineTo(len / 2, -wid / 2);
    for (let i = 0; i <= n; i++) g.lineTo(len / 2 + (i % 2 ? -1 : 1) * wid * 0.09 * (0.5 + r()), -wid / 2 + (wid * i) / n);
    g.lineTo(-len / 2, wid / 2);
    for (let i = n; i >= 0; i--) g.lineTo(-len / 2 + (i % 2 ? 1 : -1) * wid * 0.09 * (0.5 + r()), -wid / 2 + (wid * i) / n);
    g.closePath();
    g.save(); g.shadowColor = "rgba(0,0,0,0.3)"; g.shadowBlur = 5 * U; g.shadowOffsetY = 2 * U;
    g.globalAlpha = alpha; g.fillStyle = col; g.fill(); g.restore();
    g.globalAlpha = 0.22; g.strokeStyle = "#ffffff"; g.lineWidth = 1.2 * U; g.beginPath();
    for (let i = 1; i < 4; i++) { g.moveTo(-len / 2 + wid * 0.2, -wid / 2 + (wid * i) / 4); g.lineTo(len / 2 - wid * 0.2, -wid / 2 + (wid * i) / 4); }
    g.stroke();
    g.restore();
  }

  function staple(g, x, y, ang, s) {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(-s * 0.5 + 2 * U, -s * 0.09 + 3 * U, s, s * 0.18);
    g.fillStyle = "#8d8f93"; g.fillRect(-s * 0.5, -s * 0.09, s, s * 0.18);
    g.fillStyle = "#d8dade"; g.fillRect(-s * 0.5, -s * 0.09, s, s * 0.06);
    g.fillStyle = "#5c5e63"; g.fillRect(-s * 0.5, -s * 0.09, s * 0.12, s * 0.18); g.fillRect(s * 0.38, -s * 0.09, s * 0.12, s * 0.18);
    g.restore();
  }

  function pin(g, th, x, y, ang, s, wob = 0) {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.strokeStyle = "#a9acb2"; g.lineWidth = 3.2 * U; g.lineCap = "round"; g.lineJoin = "round";
    g.shadowColor = "rgba(0,0,0,0.35)"; g.shadowBlur = 4 * U; g.shadowOffsetY = 2 * U;
    g.beginPath();
    g.moveTo(-s * 0.5, -s * 0.12); g.lineTo(s * 0.5, -s * 0.12);
    g.arc(s * 0.5, 0, s * 0.12, -Math.PI / 2, Math.PI / 2);
    g.lineTo(-s * 0.35, s * 0.12);
    g.arc(-s * 0.5, 0, s * 0.12, Math.PI / 2, Math.PI * 1.5 + wob * 0.2);
    g.moveTo(-s * 0.35, s * 0.12); g.lineTo(-s * 0.2, -s * 0.12);
    g.stroke();
    g.restore();
  }

  function burst(g, cx, cy, r, n, rot, inner, seed) {
    g.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = rot + (i * Math.PI) / n, rr = i & 1 ? r * inner : r * (0.9 + hh(seed, i) * 0.2);
      if (i) g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); else g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.closePath();
  }

  function spotBurst(g, th, cx, cy, r, n, rot, off, seed, alpha = 1) {
    g.save(); g.globalCompositeOperation = "multiply"; g.globalAlpha = alpha; g.fillStyle = th.acc;
    burst(g, cx + off, cy - off * 0.7, r, n, rot, 0.74, seed); g.fill(); g.restore();
  }

  // Hand-drawn line from points; draws the first q of it.
  function wob(x0, y0, x1, y1, bend, n, seed, amp) {
    const pts = [], dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    for (let i = 0; i <= n; i++) {
      const k = i / n, b = Math.sin(k * Math.PI) * bend, w = (hh(seed, i, STEP) - 0.5) * amp;
      pts.push(x0 + dx * k + nx * (b + w), y0 + dy * k + ny * (b + w));
    }
    return pts;
  }
  function line(g, pts, q, col, wd) {
    if (q <= 0) return;
    const n = pts.length / 2 - 1, m = clamp(q) * n, full = Math.floor(m);
    g.save(); g.strokeStyle = col; g.lineWidth = wd; g.lineCap = "round"; g.lineJoin = "round"; g.beginPath(); g.moveTo(pts[0], pts[1]);
    for (let i = 1; i <= full; i++) g.lineTo(pts[2 * i], pts[2 * i + 1]);
    const f = m - full;
    if (f > 0 && full < n) g.lineTo(pts[2 * full] + (pts[2 * full + 2] - pts[2 * full]) * f, pts[2 * full + 1] + (pts[2 * full + 3] - pts[2 * full + 1]) * f);
    g.stroke(); g.restore();
  }
  function arrow(g, x0, y0, x1, y1, bend, q, col, wd, seed) {
    const pts = wob(x0, y0, x1, y1, bend, 22, seed, 3.2 * U);
    line(g, pts, q, col, wd);
    if (q >= 0.98) {
      const n = pts.length, ang = Math.atan2(pts[n - 1] - pts[n - 5], pts[n - 2] - pts[n - 6]), s = 26 * U;
      g.save(); g.strokeStyle = col; g.lineWidth = wd; g.lineCap = "round"; g.beginPath();
      g.moveTo(x1 - Math.cos(ang - 0.45) * s, y1 - Math.sin(ang - 0.45) * s); g.lineTo(x1, y1); g.lineTo(x1 - Math.cos(ang + 0.45) * s, y1 - Math.sin(ang + 0.45) * s);
      g.stroke(); g.restore();
    }
  }
  function scribble(g, cx, cy, rx, ry, q, col, wd, seed, rot0 = 0) {
    const n = 54, pts = [];
    for (let i = 0; i <= n; i++) {
      const a = rot0 + (i / n) * TAU * 1.14, k = 1 + (i / n) * 0.07 + (hh(seed, i, STEP) - 0.5) * 0.05;
      pts.push(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k);
    }
    line(g, pts, q, col, wd);
  }

  // Marker doodles that draw themselves on, hold, and start over: loose filler that is always moving.
  function doodlePts(kind) {
    const P = [];
    if (kind === 0) { for (let i = 0; i <= 5; i++) { const a = -Math.PI / 2 + (i * 2 * TAU) / 5; P.push(Math.cos(a), Math.sin(a)); } }
    else if (kind === 1) { for (const a of [0, 1.047, 2.094]) P.push(Math.cos(a), Math.sin(a), -Math.cos(a), -Math.sin(a)); }
    else if (kind === 2) { for (let i = 0; i <= 40; i++) { const a = (i / 40) * TAU * 2.2, r = i / 40; P.push(Math.cos(a) * r, Math.sin(a) * r); } }
    else if (kind === 3) { for (let i = 0; i <= 14; i++) P.push(-1 + i / 7, i % 2 ? 0.35 : -0.35); }
    else if (kind === 4) P.push(-1, -1, 1, 1, 0, 0, 1, -1, -1, 1);
    else if (kind === 5) P.push(0.3, -1, -0.5, 0.1, 0.1, 0.1, -0.3, 1, 0.6, -0.2, 0, -0.2, 0.3, -1);
    else { for (let i = 0; i <= 30; i++) { const k = i / 30; P.push(-1 + k * 2, Math.sin(k * TAU * 1.5) * 0.45 * (1 - k * 0.3)); } }
    return P;
  }
  function doodles(g, th, r, t, seed, count) {
    for (let i = 0; i < count; i++) {
      const x = r.x + hh(seed, i, 1) * r.w, y = r.y + hh(seed, i, 2) * r.h, s = (24 + hh(seed, i, 3) * 34) * U, kind = Math.floor(hh(seed, i, 4) * 7);
      const rot = (hh(seed, i, 5) - 0.5) * 1.2, base = doodlePts(kind), pts = [];
      const cs = Math.cos(rot), sn = Math.sin(rot);
      for (let k = 0; k < base.length; k += 2) {
        const jx = (hh(seed + i, k, STEP) - 0.5) * 2.4 * U, jy = (hh(seed + i, k + 1, STEP) - 0.5) * 2.4 * U;
        pts.push(x + (base[k] * cs - base[k + 1] * sn) * s + jx, y + (base[k] * sn + base[k + 1] * cs) * s + jy);
      }
      const ph = hh(seed, i, 6) * 3, q = clamp((((t * 0.4 + ph) % 2.1)) / 0.7);
      g.save(); g.globalAlpha = 0.7;
      line(g, pts, q, hh(seed, i, 7) > 0.68 ? th.acc : th.ink, 4.2 * U);
      g.restore();
    }
  }

  function scissors(g, th, x, y, s, ang, open) {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.shadowColor = "rgba(0,0,0,0.3)"; g.shadowBlur = 5 * U; g.shadowOffsetY = 3 * U;
    for (const sg of [-1, 1]) {
      g.save(); g.rotate(sg * open);
      g.fillStyle = th.ink;
      g.beginPath(); g.moveTo(-s * 0.06, -s * 0.07 * (sg < 0 ? 1 : 0.4)); g.lineTo(s, 0); g.lineTo(-s * 0.06, s * 0.07 * (sg < 0 ? 0.4 : 1)); g.closePath(); g.fill();
      g.shadowColor = "transparent";
      g.strokeStyle = sg > 0 ? th.acc : th.ink; g.lineWidth = s * 0.075;
      g.beginPath(); g.ellipse(-s * 0.4, sg * s * 0.02, s * 0.22, s * 0.13, 0, 0, TAU); g.stroke();
      g.strokeStyle = th.ink; g.lineWidth = s * 0.05; g.beginPath(); g.moveTo(-s * 0.2, 0); g.lineTo(0, 0); g.stroke();
      g.restore();
    }
    g.fillStyle = th.page; g.beginPath(); g.arc(0, 0, s * 0.035, 0, TAU); g.fill();
    g.restore();
  }

  // ---- lettering ------------------------------------------------------------------------------------
  const LS = [
    { f: F_IMPACT, w: 400, bg: "ink", fg: "page", s: 1.0 },
    { f: "Georgia, 'Times New Roman', serif", w: 800, bg: "white", fg: "ink", s: 0.95 },
    { f: F_TYPE, w: 700, bg: "news", fg: "ink", s: 0.92 },
    { f: F_BLACK, w: 900, bg: "acc", fg: "ink", s: 0.86 },
    { f: "'Times New Roman', Times, serif", w: 700, bg: "ink", fg: "acc", s: 1.0, it: true },
    { f: "'Trebuchet MS', 'Helvetica Neue', sans-serif", w: 800, bg: "white", fg: "ink", s: 0.92, border: true },
    { f: F_IMPACT, w: 400, bg: "news", fg: "ink", s: 1.0 },
    { f: "'Didot', 'Bodoni 72', Georgia, serif", w: 800, bg: "ink", fg: "white", s: 0.98 },
  ];
  const SAFE = [2, 3, 1], SERIF = [2, 1]; // Courier slab, Arial Black, Georgia; I only in serif faces
  // One cut-out letter: its own scrap, font, colours and tilt. q < 1 is the slap down (scale and fade).
  function scrap(g, th, ch, cx, cy, cw, chh, seed, size, q = 1) {
    // Letters that collapse into one another at small sizes (t/I, i/l, 1/l, j) are always capitals in a slab or
    // heavy face, where each keeps its own shape; every other letter may pick any scrap style and case.
    const amb = "tTiIlLjJ1|".includes(ch);
    const safe = "iI".includes(ch) ? SERIF : SAFE;
    const st = amb ? LS[safe[Math.floor(hh(seed, 3) * safe.length)]] : LS[Math.floor(hh(seed, 3) * LS.length)];
    const c = amb ? (ch === "1" ? ch : ch.toUpperCase()) : hh(seed, 7) < 0.3 ? ch.toLowerCase() : ch.toUpperCase();
    const jx = (hh(seed, STEP, 1) - 0.5) * 2.4 * U, jy = (hh(seed, STEP, 2) - 0.5) * 2.4 * U, jr = (hh(seed, STEP, 3) - 0.5) * 0.03;
    g.save();
    g.font = `${st.it ? "italic " : ""}${st.w} ${size * st.s}px ${st.f}`;
    let fs = size * st.s, gw = g.measureText(c).width;
    if (gw > cw * 0.96) { fs *= (cw * 0.96) / gw; g.font = `${st.it ? "italic " : ""}${st.w} ${fs}px ${st.f}`; gw = g.measureText(c).width; }
    const w = clamp(gw + size * 0.3, size * 0.4, Math.max(cw, size * 0.4)), h = chh;
    g.translate(cx + jx, cy + jy); g.rotate((hh(seed, 5) - 0.5) * 0.2 + jr);
    const sc = 1 + 0.5 * (1 - clamp(q)); g.scale(sc, sc); g.globalAlpha = clamp(q * 3);
    const j = (k) => (hh(seed, 10 + k) - 0.5) * size * 0.09;
    g.beginPath(); g.moveTo(-w / 2 + j(0), -h / 2 + j(1)); g.lineTo(w / 2 + j(2), -h / 2 + j(3)); g.lineTo(w / 2 + j(4), h / 2 + j(5)); g.lineTo(-w / 2 + j(6), h / 2 + j(7)); g.closePath();
    g.shadowColor = "rgba(0,0,0,0.45)"; g.shadowBlur = 5 * U; g.shadowOffsetX = 2 * U; g.shadowOffsetY = 3 * U;
    g.fillStyle = colOf(th, st.bg); g.fill();
    g.shadowColor = "transparent";
    if (st.border) { g.strokeStyle = th.ink; g.lineWidth = 2.4 * U; g.stroke(); }
    g.fillStyle = colOf(th, st.fg); g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(c, 0, fs * 0.03);
    g.restore();
  }

  // Numbers as pasted letters (each digit its own scrap). Returns the run width.
  function ransomRun(g, th, str, x, yb, size, o = {}) {
    str = String(str);
    const cells = [...str].map((ch) => (" ,.'".includes(ch) ? 0.34 : "%$+".includes(ch) ? 0.86 : 0.7));
    let total = cells.reduce((a, b) => a + b, 0) * size;
    if (o.maxW && total > o.maxW) { size *= o.maxW / total; total = o.maxW; }
    let x0 = o.align === "center" ? x - total / 2 : o.align === "right" ? x - total : x;
    [...str].forEach((ch, i) => {
      const cw = cells[i] * size;
      if (ch !== " ") scrap(g, th, ch, x0 + cw / 2, yb - size * 0.6, cw * 1.04, size * 1.2, (o.seed || 3) * 53 + i * 7, size, o.q ?? 1);
      x0 += cw;
    });
    return total;
  }

  // A label-maker strip: embossed caps on tape, cut at an angle. (x, y) is the centre of its left, centre or right end.
  function label(g, th, text, x, y, size, o = {}) {
    const q = o.q ?? 1;
    if (q <= 0 || !text) return { w: 0, h: 0 };
    const kind = o.kind || "ink", bg = kind === "ink" ? th.ink : kind === "acc" ? th.acc : th.white, fg = kind === "ink" ? th.page : th.ink;
    g.save();
    let fs = size, s = String(text).toUpperCase();
    g.font = `800 ${fs}px ${F_LABEL}`; g.letterSpacing = fs * 0.07 + "px";
    let w = g.measureText(s).width;
    if (o.maxW && w + fs * 0.9 > o.maxW) {
      fs = Math.max(42 * U, (fs * (o.maxW - fs * 0.9)) / w);
      g.font = `800 ${fs}px ${F_LABEL}`; g.letterSpacing = fs * 0.07 + "px"; w = g.measureText(s).width;
    }
    const pw = w + fs * 0.95, ph = fs * 1.5;
    const cx = o.align === "center" ? x : o.align === "right" ? x - pw / 2 : x + pw / 2;
    g.translate(cx, y); g.rotate(o.rot || 0);
    g.beginPath(); g.rect(-pw / 2 - 12 * U, -ph, (pw + 24 * U) * q, ph * 2); g.clip();
    const cut = ph * 0.2;
    g.beginPath(); g.moveTo(-pw / 2 + cut, -ph / 2); g.lineTo(pw / 2, -ph / 2); g.lineTo(pw / 2 - cut, ph / 2); g.lineTo(-pw / 2, ph / 2); g.closePath();
    g.shadowColor = "rgba(0,0,0,0.4)"; g.shadowBlur = 6 * U; g.shadowOffsetX = 2 * U; g.shadowOffsetY = 4 * U;
    g.fillStyle = bg; g.fill(); g.shadowColor = "transparent";
    if (kind === "page") { g.strokeStyle = th.ink; g.lineWidth = 2.6 * U; g.stroke(); }
    g.textAlign = "center"; g.textBaseline = "middle";
    if (kind === "ink") { g.fillStyle = "rgba(0,0,0,0.55)"; g.fillText(s, 1.5 * U, fs * 0.05 + 1.5 * U); }
    g.fillStyle = fg; g.fillText(s, 0, fs * 0.05);
    g.letterSpacing = "0px";
    g.restore();
    return { w: pw, h: ph };
  }
  // Greedy line wrap for a label at a given size and width.
  function wrapLines(g, text, size, maxW) {
    g.save(); g.font = `800 ${size}px ${F_LABEL}`; g.letterSpacing = size * 0.07 + "px";
    const words = String(text).toUpperCase().split(/\s+/), lines = [];
    let cur = "";
    for (const w of words) { const nx = cur ? cur + " " + w : w; if (cur && g.measureText(nx).width + size * 0.95 > maxW) { lines.push(cur); cur = w; } else cur = nx; }
    if (cur) lines.push(cur);
    g.letterSpacing = "0px"; g.restore();
    return lines;
  }

  function typed(g, th, text, x, y, size, o = {}) {
    g.save(); g.font = `700 ${size}px ${F_TYPE}`; g.fillStyle = o.color || th.ink; g.textAlign = o.align || "left"; g.textBaseline = o.base || "middle";
    if (o.rot) { g.translate(x, y); g.rotate(o.rot); g.fillText(text, 0, 0); } else g.fillText(text, x, y);
    g.restore();
  }

  function stamp(g, th, text, x, y, r, rot, col, q = 1) {
    if (q <= 0) return;
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(q, q); g.globalAlpha = 0.92;
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = r * 0.07;
    g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke();
    g.lineWidth = r * 0.03; g.beginPath(); g.arc(0, 0, r * 0.84, 0, TAU); g.stroke();
    g.font = `400 ${r * 0.62}px ${F_IMPACT}`; g.textAlign = "center"; g.textBaseline = "middle";
    const w = g.measureText(text).width, k = Math.min(1, (r * 1.5) / w);
    g.font = `400 ${r * 0.62 * k}px ${F_IMPACT}`;
    g.fillText(text, 0, r * 0.04);
    g.restore();
  }

  function barcode(g, th, x, y, w, h, seed) {
    g.save(); g.fillStyle = th.ink; let xx = x;
    for (let i = 0; xx < x + w; i++) { const bw = (1 + hh(seed, i) * 3.2) * U; if (i % 2 === 0) g.fillRect(xx, y, bw, h); xx += bw + (0.8 + hh(seed, i, 4) * 2.2) * U; }
    g.restore();
  }

  // ---- DOM headlines read once, then pasted as scraps ----------------------------------------------
  const HC = {};
  function headChars(id) {
    if (HC[id]) return HC[id];
    const out = { chars: [], size: 0, box: null };
    const el = document.getElementById(id), root = document.getElementById("root");
    if (!el || !root || !el.firstChild) return (HC[id] = out);
    let ox = 0, oy = 0;
    for (let n = el; n && n !== root; n = n.offsetParent) { ox += n.offsetLeft; oy += n.offsetTop; }
    const scale = root.getBoundingClientRect().width / (Number(root.dataset.width) || 1920) || 1;
    const er = el.getBoundingClientRect(), node = el.firstChild, text = node.textContent, range = document.createRange();
    out.size = parseFloat(getComputedStyle(el).fontSize) || 72;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < text.length; i++) {
      range.setStart(node, i); range.setEnd(node, i + 1);
      const r = range.getClientRects()[0];
      if (!r) continue;
      const c = { ch: text[i], x: ox + (r.left - er.left) / scale, y: oy + (r.top - er.top) / scale, w: r.width / scale, h: r.height / scale };
      if (c.ch.trim() && c.w > 1) { out.chars.push(c); x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x + c.w); y1 = Math.max(y1, c.y + c.h); }
    }
    if (out.chars.length) out.box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    return (HC[id] = out);
  }
  function ransomHead(g, th, id, local, delay = 0) {
    const H = headChars(id);
    let k = 0;
    const sid0 = sid(id), gap = Math.min(0.03, 0.27 / Math.max(1, H.chars.length));
    for (const c of H.chars) {
      const at = delay + k * gap, q = seg(local, at, at + 0.1);
      k++;
      if (q <= 0) continue;
      scrap(g, th, c.ch, c.x + c.w / 2, c.y + c.h * 0.52, c.w * 1.02, c.h * 0.92, sid0 * 131 + k * 17, H.size, bk(q));
    }
    return H;
  }
  function kickerLabel(g, th, local) {
    const H = headChars("kicker");
    if (!H.box) return;
    const size = 44 * U;
    label(g, th, document.getElementById("kicker").textContent, H.box.x, H.box.y + H.box.h * 0.4, size, { kind: "page", rot: -0.025, q: seg(local, 0.02, 0.32) });
  }

  // ---- paper dust, copier flash and lens fall-off over everything -----------------------------------
  let DUST = null, DUSTKEY = "";
  function dustTile(look) {
    const key = look.ink + look.page;
    if (DUST && DUSTKEY === key) return DUST;
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const g = c.getContext("2d"), r = rng(77);
    const dark = look.ink, light = look.page;
    for (let i = 0; i < 520; i++) {
      const s = r() < 0.9 ? r() * 1.5 + 0.4 : r() * 3.2 + 1;
      g.globalAlpha = 0.25 + r() * 0.5; g.fillStyle = dark; g.beginPath(); g.arc(r() * 512, r() * 512, s, 0, TAU); g.fill();
    }
    for (let i = 0; i < 300; i++) {
      const s = r() < 0.9 ? r() * 1.3 + 0.4 : r() * 2.6 + 0.8;
      g.globalAlpha = 0.18 + r() * 0.35; g.fillStyle = light; g.beginPath(); g.arc(r() * 512, r() * 512, s, 0, TAU); g.fill();
    }
    g.globalAlpha = 0.4; g.strokeStyle = dark; g.lineWidth = 1;
    for (let i = 0; i < 9; i++) { const x = r() * 512, y = r() * 512; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + (r() - 0.5) * 60, y + (r() - 0.5) * 60, x + (r() - 0.5) * 50, y + (r() - 0.5) * 50); g.stroke(); }
    DUSTKEY = key;
    return (DUST = c);
  }
  function paint(ctx, W, H, t, accent, look) {
    ctx.clearRect(0, 0, W, H);
    const u = Math.min(W, H) / 1080, step = Math.floor(t * 8), tile = dustTile(look);
    for (const k of [0, 1]) {
      const ox = hh(step, k, 1) * 512, oy = hh(step, k, 2) * 512;
      ctx.save(); ctx.translate(-ox, -oy); ctx.globalAlpha = k ? 0.6 : 1; ctx.fillStyle = ctx.createPattern(tile, "repeat"); ctx.fillRect(ox, oy, W, H); ctx.restore();
    }
    // Copier streaks: thin vertical lines that never quite stay put.
    ctx.save(); ctx.strokeStyle = look.ink;
    for (let i = 0; i < 6; i++) {
      const x = (0.08 + hh(i, 11) * 0.84) * W + (hh(i, step, 3) - 0.5) * 2 * u;
      ctx.globalAlpha = 0.05 + hh(i, 12) * 0.08; ctx.lineWidth = (0.8 + hh(i, 13) * 1.6) * u;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (hh(i, 14) - 0.5) * 8 * u, H); ctx.stroke();
    }
    ctx.restore();
    // Lens fall-off.
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.3)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    // The scan lamp sweeps across, and a hot exposure runs down the frame at every page change.
    const band = ((t / 3.6) % 1.3) - 0.15;
    const bx = band * (W + 200 * u) - 100 * u;
    const lg = ctx.createLinearGradient(bx - 150 * u, 0, bx + 150 * u, 0);
    lg.addColorStop(0, "rgba(255,255,255,0)"); lg.addColorStop(0.5, "rgba(255,255,255,0.09)"); lg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = lg; ctx.fillRect(bx - 150 * u, 0, 300 * u, H);
    const P = plan();
    if (P) {
      for (let i = 1; i < P.length; i++) {
        const d = t - P[i].start;
        if (d < -0.1 || d > 0.5) continue;
        const k = (d + 0.1) / 0.6, a = 0.22 * Math.pow(Math.sin(Math.PI * k), 2);
        const y = k * (H + 240 * u) - 120 * u;
        const fg = ctx.createLinearGradient(0, y - 110 * u, 0, y + 110 * u);
        fg.addColorStop(0, "rgba(255,255,255,0)"); fg.addColorStop(0.5, `rgba(255,255,255,${a})`); fg.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = fg; ctx.fillRect(0, y - 110 * u, W, 220 * u);
      }
    }
  }

  // ---- world: the copier lid under every page ------------------------------------------------------
  function world(g, S, th, info) {
    const { W, H } = S, t = info.t, tex = S.look.texture ?? 1;
    g.fillStyle = th.board; g.fillRect(0, 0, W, H);
    // Faint lid grid and rows of ghost type sliding in opposite directions.
    g.save(); g.strokeStyle = th.page; g.globalAlpha = 0.05 * (0.4 + 0.6 * tex); g.lineWidth = 1.2 * U; g.beginPath();
    for (let x = 0; x < W; x += 72 * U) { g.moveTo(x, 0); g.lineTo(x, H); }
    for (let y = 0; y < H; y += 72 * U) { g.moveTo(0, y); g.lineTo(W, y); }
    g.stroke(); g.restore();
    g.save(); g.translate(W / 2, H / 2); g.rotate(-0.07); g.translate(-W / 2, -H / 2);
    g.fillStyle = th.page; g.globalAlpha = 0.07; g.font = `400 ${150 * U}px ${F_IMPACT}`; g.textBaseline = "middle";
    const unit = "COPY THIS  ✂  PASS IT ON  ✂  ", uw = g.measureText(unit).width;
    for (let r = -1; r < 8; r++) {
      const off = (((t * 46 * U * (r % 2 ? -1 : 1)) % uw) + uw) % uw;
      for (let x = -uw - off; x < W * 1.3; x += uw) g.fillText(unit, x, r * 175 * U);
    }
    g.restore();
    // Scraps drifting on the lid, stepped like stop-motion.
    const ts = Math.floor(t * 8) / 8;
    for (let i = 0; i < 12; i++) {
      const span = W + 500 * U, v = (14 + hh(i, 1) * 26) * U * (i % 2 ? 1 : -1);
      const x = ((((hh(i, 2) * span + v * ts) % span) + span) % span) - 250 * U;
      const y = (0.05 + hh(i, 3) * 0.9) * H + Math.sin(ts * 0.7 + i) * 18 * U;
      const w = (110 + hh(i, 4) * 150) * U, h = (60 + hh(i, 5) * 90) * U, rot = (hh(i, 6) - 0.5) * 0.9 + Math.sin(ts * 0.8 + i) * 0.06;
      g.save(); g.translate(x, y); g.rotate(rot);
      if (i % 3 === 0) tape(g, 0, 0, w, 36 * U, 0, th.tape, i, 0.7);
      else if (i % 3 === 1) sheet(g, -w / 2, -h / 2, w, h, { fill: i % 2 ? th.news : th.page, seed: 30 + i, rough: 5, sb: 8, sy: 4, draw: (gg, ww, hh2) => halftone(gg, 0, 0, ww, hh2, (px, py) => 0.35 * (py / hh2), 9 * U, th.ink) });
      else { g.fillStyle = th.acc; g.globalAlpha = 0.9; burst(g, 0, 0, w * 0.32, 9, 0, 0.7, i); g.fill(); }
      g.restore();
    }
  }

  // ---- pages ---------------------------------------------------------------------------------------
  function pageRect(S) { const m = (S.tall ? 46 : 60) * S.u; return { x: m, y: m, w: S.W - 2 * m, h: S.H - 2 * m }; }
  const NO = { title: "00", chart: "01", object: "02", people: "03", process: "04", compare: "05", closing: "99" };

  function pageBase(g, S, th, id, t) {
    const pg = pageRect(S), seed = sid(id), tex = S.look.texture ?? 1;
    sheet(g, pg.x, pg.y, pg.w, pg.h, { seed, fill: th.page, rough: 5, sb: 34, sy: 12, sx: 6, draw: (gg, w, h) => {
      // Paste-up grid, a ghost page number, and the toner falling off in two corners.
      gg.strokeStyle = th.ink; gg.globalAlpha = 0.045; gg.lineWidth = 1.2 * U; gg.beginPath();
      for (let x = 54 * U; x < w; x += 54 * U) { gg.moveTo(x, 0); gg.lineTo(x, h); }
      for (let y = 54 * U; y < h; y += 54 * U) { gg.moveTo(0, y); gg.lineTo(w, y); }
      gg.stroke(); gg.globalAlpha = 1;
      gg.fillStyle = th.ink; gg.globalAlpha = 0.06; gg.font = `400 ${(S.tall ? 760 : 700) * U}px ${F_IMPACT}`; gg.textAlign = "left"; gg.textBaseline = "alphabetic";
      gg.fillText(NO[id] || "00", S.tall ? -10 * U : w * 0.5, h * 1.02);
      gg.globalAlpha = tex;
      const cs = Math.min(w, h) * 0.55;
      halftone(gg, 0, 0, cs, cs * 0.5, (x, y) => 0.3 * Math.max(0, 1 - Math.hypot(x, y * 1.6) / cs), 11 * U, th.ink);
      halftone(gg, w - cs, h - cs * 0.5, cs, cs * 0.5, (x, y) => 0.3 * Math.max(0, 1 - Math.hypot(w - x, (h - y) * 1.6) / cs), 11 * U, th.ink);
    } });
  }

  // Tape, staples and pins on the page edges: pasted last so they sit over the art.
  function pageTrim(g, S, th, id, t) {
    const pg = pageRect(S), r = hh(sid(id), 99);
    const cs = [[pg.x + 8 * U, pg.y + 6 * U, -0.78], [pg.x + pg.w - 8 * U, pg.y + 6 * U, 0.78], [pg.x + 8 * U, pg.y + pg.h - 6 * U, 0.78], [pg.x + pg.w - 8 * U, pg.y + pg.h - 6 * U, -0.78]];
    cs.forEach(([x, y, a], i) => {
      const fl = Math.sin(t * 1.3 + i * 1.7) * 0.03 + (hh(i, STEP, 8) - 0.5) * 0.02;
      tape(g, x, y, 150 * U, 44 * U, a + fl, i % 2 ? th.tape : "rgba(220,220,214,0.9)", sid(id) + i, 0.86);
    });
    staple(g, pg.x + pg.w * 0.5 + (r - 0.5) * 300 * U, pg.y + 18 * U, (r - 0.5) * 0.3, 40 * U);
    staple(g, pg.x + pg.w * 0.5 + (r - 0.5) * 300 * U + 70 * U, pg.y + 20 * U, (r - 0.5) * 0.3 + 0.08, 40 * U);
    pin(g, th, pg.x + 20 * U, pg.y + pg.h * (S.tall ? 0.17 : 0.3), -1.45 + Math.sin(t * 1.1) * 0.03, 62 * U, Math.sin(t * 2));
  }

  // Page decoration in the free corner, each with something moving.
  function pageDecor(g, S, th, id, t) {
    const pg = pageRect(S), n = id === "chart" ? "FIG.1" : id === "object" ? "NEW!" : id === "people" ? "WHO?" : id === "process" ? "HOW" : "VS.";
    const cx = S.tall ? pg.x + pg.w - 112 * U : pg.x + pg.w - 150 * U, cy = S.tall ? pg.y + 108 * U : pg.y + 150 * U, R = (S.tall ? 62 : 96) * U;
    if (!S.tall) {
      sheet(g, pg.x + pg.w - 560 * U, pg.y + 28 * U, 330 * U, 190 * U, { seed: 61, fill: th.news, rough: 5, rot: 0.035, sb: 10, sy: 5, draw: (gg, w, h) => {
        gg.fillStyle = th.ink;
        for (let i = 0; i < 7; i++) { const lw = (0.45 + hh(i, 77) * 0.5) * (w - 50 * U); gg.fillRect(25 * U, 28 * U + i * 21 * U, lw, 9 * U); }
        gg.fillRect(25 * U, 28 * U + 7 * 21 * U, w * 0.25, 9 * U);
        halftone(gg, w - 100 * U, h - 80 * U, 90 * U, 70 * U, (x, y) => 0.6 - 0.4 * ((y - (h - 80 * U)) / (70 * U)), 8 * U, th.ink);
      } });
      barcode(g, th, pg.x + pg.w - 590 * U + 20 * U, pg.y + 235 * U, 260 * U, 36 * U, sid(id));
    }
    const rot = (t * 0.25) % TAU, ph = (t + sid(id) * 0.01) % 1.7, thud = ph < 0.3 ? Math.sin((ph / 0.3) * Math.PI) : 0;
    g.save(); g.translate(cx, cy); g.scale(1 + 0.14 * thud, 1 + 0.14 * thud); g.translate(-cx, -cy);
    spotBurst(g, th, cx, cy, R * 1.12, 12, rot, (8 + 10 * thud) * U, 5);
    g.save(); g.fillStyle = th.ink; burst(g, cx, cy, R, 12, rot, 0.74, 5); g.fill(); g.restore();
    g.save(); g.fillStyle = th.acc; burst(g, cx, cy, R * 0.8, 12, rot, 0.78, 5); g.fill();
    g.fillStyle = th.ink; g.font = `400 ${R * 0.52}px ${F_IMPACT}`; g.textAlign = "center"; g.textBaseline = "middle";
    g.translate(cx, cy); g.rotate(-0.12 + Math.sin(t * 2.2) * 0.03); g.fillText(n, 0, R * 0.04); g.restore();
    g.restore();
  }

  function cutLine(g, S, th, box, t) {
    const r = { x: box.x - 22 * U, y: box.y - 14 * U, w: box.w + 44 * U, h: box.h + 28 * U };
    g.save(); g.strokeStyle = th.ink; g.globalAlpha = 0.75; g.lineWidth = 3 * U; g.setLineDash([16 * U, 11 * U]); g.lineDashOffset = -t * 36 * U;
    g.strokeRect(r.x, r.y, r.w, r.h); g.restore();
    const P = 2 * (r.w + r.h), s = (t * 190 * U) % P;
    let x, y, a;
    if (s < r.w) { x = r.x + s; y = r.y; a = 0; } else if (s < r.w + r.h) { x = r.x + r.w; y = r.y + s - r.w; a = Math.PI / 2; }
    else if (s < 2 * r.w + r.h) { x = r.x + r.w - (s - r.w - r.h); y = r.y + r.h; a = Math.PI; } else { x = r.x; y = r.y + r.h - (s - 2 * r.w - r.h); a = -Math.PI / 2; }
    scissors(g, th, x, y, 66 * U, a, 0.12 + Math.abs(Math.sin(t * 9)) * 0.32);
  }

  const EDGE = 0.5;
  // When each scene's hold beats land (shared by the drawers and the page jolt).
  const objLate = (hold) => Math.max(hold * 0.42, hold - 2.4);
  const chartLate = (hold) => Math.max(hold * 0.7, hold - 1.25);
  function holdBeats(id, hold) {
    if (id === "object") { const l = objLate(hold); return [l + 0.16, l + 0.9]; }
    if (id === "chart") { const l = chartLate(hold); return [l + 0.56]; }
    if (id === "title" || id === "closing") return [0.9 + 0.1, 0.9 + 0.55 + 0.1, 0.9 + 1.1 + 0.1];
    return [];
  }
  function jolt(local, times) {
    let j = 0;
    for (const at of times) { const k = (local - at) / 0.22; if (k > 0 && k < 1) j += Math.sin(k * Math.PI * 2) * (1 - k); }
    return j;
  }
  // The page transform: new pages are dropped onto the lid; old pages are covered, or ripped away before the closing page.
  function pageScene(id, draw) {
    return (ctx, S, box, p, d, info) => {
      U = S.u; STEP = stepOf(info.t);
      const th = theme(S), o = orderOf(id), leaving = info.exit !== undefined;
      const idx = o.idx, local = info.local, W = S.W, H = S.H;
      let tx = 0, ty = 0, rot = (hh(sid(id), 4) - 0.5) * 0.014, sc = 1, alpha = 1, shade = 0;
      if (!leaving) {
        if (idx > 0) {
          const slide = Math.max(0.3, info.change), k = eio(seg(local, 0, slide));
          tx = (1 - k) * W * 1.1; ty = -(1 - k) * H * 0.04; rot += 0.07 * (1 - k);
          // the landing: a short paper settle once it hits the lid
          sc = 1 - 0.012 * Math.sin(Math.PI * seg(local, slide, slide + 0.24));
        } else if (idx === 0) {
          // First page of the piece: pushed in from the right, so a cut or dissolve from another piece reads as a wipe.
          const k = eio(seg(local, 0.1, EDGE + 0.06));
          tx = (1 - k) * W * 1.04; rot += 0.04 * (1 - k);
        }
        if (!o.next && info.hold > 2 * EDGE && local > info.hold - EDGE) {
          // Last page: pushed off to the left over the final half second, matching the next piece's push-in.
          const k = eio(seg(local, info.hold - EDGE - 0.06, info.hold - 0.1));
          tx = -k * W * 1.06; rot -= 0.04 * k;
        }
        // Hold beats: the sheet jolts on the lid each time something is slapped onto it.
        const jl = jolt(local, holdBeats(id, info.hold));
        ty += jl * 9 * U; rot += jl * 0.004;
      } else {
        const k = info.exit;
        if (o.next === "closing") { tx = -eio(k) * W * 1.25; ty = eio(k) * H * 0.08; rot -= eio(k) * 0.35; }
        else { tx = -eio(k) * W * 0.12; ty = eio(k) * H * 0.02; rot -= eio(k) * 0.03; sc = 1 - 0.04 * eio(k); shade = 0.5 * eio(k); }
      }
      const jx = (hh(sid(id), STEP, 1) - 0.5) * 1.6 * U, jy = (hh(sid(id), STEP, 2) - 0.5) * 1.6 * U, jr = (hh(sid(id), STEP, 3) - 0.5) * 0.0012;
      ctx.save();
      ctx.translate(W / 2 + tx + jx, H / 2 + ty + jy); ctx.rotate(rot + jr); ctx.scale(sc, sc); ctx.translate(-W / 2, -H / 2);
      ctx.globalAlpha *= alpha;
      pageBase(ctx, S, th, id, info.t);
      doodles(ctx, th, { x: box.x, y: box.y, w: box.w, h: box.h }, info.t, sid(id) + 3, S.tall ? 14 : 18);
      const hb = headChars(`${id}-title`).box, pgr = pageRect(S);
      if (!S.tall && hb) {
        const zx = hb.x + hb.w + 60 * U, zr = pgr.x + pgr.w - 620 * U;
        if (zr - zx > 130 * U) doodles(ctx, th, { x: zx, y: pgr.y + 60 * U, w: zr - zx - 40 * U, h: 150 * U }, info.t, sid(id) + 9, 4);
      }
      cutLine(ctx, S, th, box, info.t);
      pageDecor(ctx, S, th, id, info.t);
      // The build starts already under way as the page lands, and is spread across the hold.
      const pd = leaving ? 1 : clamp(0.16 + local / Math.max(0.8, info.hold * 0.85));
      draw(ctx, S, th, box, pd, d, info, { local, leaving });
      ransomHead(ctx, th, `${id}-title`, local, 0);
      pageTrim(ctx, S, th, id, info.t);
      if (shade) {
        const pg = pageRect(S);
        ctx.fillStyle = `rgba(0,0,0,${shade})`; ctx.fillRect(pg.x, pg.y, pg.w, pg.h);
      }
      ctx.restore();
    };
  }

  // ---- chart: torn toner towers with a spot-ink hero ------------------------------------------------
  function chartDraw(g, S, th, box, p, d, info) {
    const t = info.t, tall = S.tall, n = d.values.length, max = Math.max(...d.values, 1);
    const areaW = tall ? box.w : box.w * 0.66, areaH = tall ? box.h * 0.6 : box.h;
    const base = box.y + areaH - 90 * U, maxH = areaH - 90 * U - 150 * U, slot = areaW / n, bw = Math.min(slot * 0.6, 210 * U);
    tape(g, box.x + areaW / 2, base + 10 * U, areaW + 40 * U, 36 * U, -0.004, th.tape, 3, 0.95);
    g.save(); g.strokeStyle = th.ink; g.globalAlpha = 0.6; g.lineWidth = 1.6 * U; g.beginPath();
    for (let x = box.x + 10 * U, i = 0; x < box.x + areaW; x += 28 * U, i++) { g.moveTo(x, base + (i % 5 ? 2 : -4) * U); g.lineTo(x, base + 22 * U); }
    g.stroke(); g.restore();
    let hot = null;
    for (let i = 0; i < n; i++) {
      const q = bk(seg(p, 0.04 + i * 0.12, 0.48 + i * 0.12)), v = d.values[i], isHot = i === d.highlight;
      if (q <= 0) continue;
      const wig = (hh(i, STEP, 5) - 0.5) * 4 * U;
      const h = Math.max(34 * U, (v / max) * maxH * q) + wig, x = box.x + slot * i + (slot - bw) / 2, y = base - h;
      if (isHot) {
        g.save(); g.globalCompositeOperation = "multiply";
        sheet(g, x + 16 * U, y - 12 * U, bw, h, { fill: th.acc, seed: 90 + i, rough: 7, shadow: false, edge: false, sides: 1 });
        g.restore();
      }
      sheet(g, x, y, bw, h, { fill: th.ink, seed: 40 + i, rough: 7, sides: 1, draw: (gg, w, hh2) => {
        halftone(gg, 0, 0, w, hh2, (px, py) => (isHot ? 0.16 : 0.5) * (1 - py / Math.max(hh2, 1)) + (isHot ? 0 : 0.08), 10 * U, th.page);
        gg.fillStyle = th.page; gg.globalAlpha = 0.5; gg.fillRect(w * 0.12, 0, 3 * U, hh2);
        // a pulsing scan notch climbing the bar keeps it alive in the hold
        gg.globalAlpha = 0.35; gg.fillRect(0, hh2 * (1 - ((t * 0.5 + i * 0.23) % 1)), w, 5 * U);
      } });
      tape(g, x + bw * (0.3 + hh(i, 2) * 0.4), y + 6 * U, 100 * U, 38 * U, (hh(i, 3) - 0.5) * 0.5, th.tape, i + 5, 0.86);
      if (q > 0.35) {
        const size = isHot ? 120 * U : 66 * U;
        const w = ransomRun(g, th, fmt(v * clamp(q), d), x + bw / 2, y - 20 * U, size, { align: "center", maxW: slot * 0.96, seed: i + 2 });
        if (isHot) hot = { x: x + bw / 2, y, w, size };
      }
      label(g, th, d.labels[i] || "", x + bw / 2, base + 76 * U, 42 * U, { align: "center", kind: isHot ? "acc" : "page", maxW: slot * 0.98, rot: (hh(i, 9) - 0.5) * 0.05, q: seg(p, 0.3 + i * 0.1, 0.5 + i * 0.1) });
    }
    // The hero card: the highlighted number, huge, with a marker ring and an arrow back to its bar.
    // The hero card slams down at full size as the page lands, so the right half is never empty.
    const cardQ = seg(p, 0.12, 0.28), slam = eo(cardQ), thud = Math.sin(Math.PI * seg(p, 0.28, 0.36));
    if (d.highlight < 0 || d.highlight >= n) return;
    const hv = d.values[d.highlight], hl = d.labels[d.highlight] || "";
    const card = tall ? { x: box.x, y: box.y + areaH + 24 * U, w: box.w, h: box.h - areaH - 24 * U } : { x: box.x + areaW + 56 * U, y: box.y + 10 * U, w: box.w - areaW - 56 * U, h: box.h - 70 * U };
    g.save(); g.translate(card.x + card.w / 2, card.y + card.h / 2); g.translate(0, -(1 - slam) * (card.h * 0.8 + 200 * U)); g.rotate(0.025 - (1 - slam) * 0.18 + 0.01 * thud); g.scale(1.06 - 0.06 * slam - 0.03 * thud, 1.06 - 0.06 * slam - 0.03 * thud); g.translate(-card.w / 2, -card.h / 2);
    sheet(g, 0, 0, card.w, card.h, { fill: th.white, seed: 71, rough: 5, draw: (gg, w, h) => {
      halftone(gg, 0, 0, w, h, (px, py) => 0.2 * (py / h), 10 * U, th.ink);
    } });
    const late = chartLate(info.hold), lk = info.local - late;
    const pulse = 1 + 0.05 * Math.sin(t * 4.2) + (lk > 0 && lk < 0.35 ? 0.16 * Math.sin((lk / 0.35) * Math.PI) : 0);
    spotBurst(g, th, card.w * 0.5, card.h * 0.55, Math.min(card.w, card.h) * 0.46 * pulse, 14, t * 0.3, 10 * U, 9);
    const lb = label(g, th, hl, card.w * 0.06, card.h * 0.14, 46 * U, { kind: "ink", maxW: card.w * 0.9, rot: -0.03 });
    const uy = card.h * 0.14 + lb.h * 0.62;
    line(g, wob(card.w * 0.05, uy + 4 * U, card.w * 0.06 + lb.w * 1.05, uy - 6 * U, 6 * U, 16, 33, 3 * U), seg(lk, 0, 0.3), th.acc, 13 * U);
    line(g, wob(card.w * 0.09, uy + 18 * U, card.w * 0.06 + lb.w * 0.9, uy + 10 * U, -4 * U, 14, 34, 3 * U), seg(lk, 0.2, 0.45), th.ink, 5 * U);
    const sq = seg(lk, 0.45, 0.62);
    if (sq > 0) {
      const sx = card.w * 0.86, sy = card.h * 0.2, ss = (1.8 - 0.8 * eo(sq)) * (1 + 0.04 * Math.sin(t * 6));
      g.save(); g.translate(sx, sy); g.rotate(0.3 + Math.sin(t * 1.4) * 0.05); g.scale(ss, ss); g.globalAlpha = clamp(sq * 3);
      g.fillStyle = th.ink; burst(g, 0, 0, 58 * U, 10, 0, 0.72, 41); g.fill();
      g.fillStyle = th.acc; burst(g, 0, 0, 48 * U, 10, 0, 0.74, 41); g.fill();
      g.fillStyle = th.ink; g.font = `400 ${40 * U}px ${F_IMPACT}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("#1", 0, 2 * U);
      g.restore();
    }
    const cnt = ease3(seg(p, 0.22, 0.7));
    const nw = ransomRun(g, th, fmt(hv * cnt, d), card.w * 0.5, card.h * 0.74, Math.min(168 * U, card.h * 0.5), { align: "center", maxW: card.w * 0.86, seed: 14 });
    scribble(g, card.w * 0.5, card.h * 0.55, nw * 0.62 + 20 * U, card.h * 0.3, seg(p, 0.7, 1) * 1, th.ink, 5 * U, 21, -0.5);
    g.restore();
    if (hot && !tall) arrow(g, card.x - 8 * U, card.y + card.h * 0.5, hot.x + 70 * U, hot.y - hot.size * 0.8, -60 * U, seg(p, 0.55, 0.9), th.ink, 5 * U, 4);
  }
  const ease3 = (v) => 1 - Math.pow(1 - clamp(v), 3);

  // ---- object: a cut-out screen with a playhead, a cursor and three pinned labels --------------------
  function objectDraw(g, S, th, box, p, d, info) {
    const t = info.t, tall = S.tall, phone = d.kind === "phone";
    const area = tall ? { x: box.x, y: box.y, w: box.w, h: box.h * 0.6 } : { x: box.x, y: box.y, w: box.w * 0.6, h: box.h };
    let w = phone ? Math.min(area.w * 0.5, area.h * 0.5) : Math.min(area.w * 0.94, area.h * 1.5), h = phone ? w * 1.9 : w * 0.6;
    const q = bk(seg(p, 0, 0.35));
    const x = area.x + (area.w - w) / 2, y = area.y + (area.h - h - (phone ? 0 : 50 * U)) / 2;
    g.save(); g.translate(x + w / 2, y + h / 2); g.rotate(-0.02 + (hh(5, STEP) - 0.5) * 0.004); g.scale(q || 0.001, q || 0.001); g.translate(-w / 2, -h / 2);
    g.save(); g.globalCompositeOperation = "multiply"; sheet(g, 16 * U, -12 * U, w, h, { fill: th.acc, seed: 8, rough: 6, shadow: false, edge: false }); g.restore();
    sheet(g, 0, 0, w, h, { fill: th.ink, seed: 12, rough: 5 });
    const pad = (phone ? 22 : 26) * U, sx = pad, sy = pad, sw = w - pad * 2, sh = h - pad * 2;
    sheet(g, sx, sy, sw, sh, { fill: th.page, seed: 13, rough: 2, shadow: false, edge: false, draw: (gg) => {
      // preview: halftone sun over cut hills
      const pv = { x: sw * 0.07, y: sh * 0.08, w: sw * 0.86, h: sh * 0.46 };
      gg.fillStyle = th.news; gg.fillRect(pv.x, pv.y, pv.w, pv.h);
      halftone(gg, pv.x, pv.y, pv.w, pv.h, (px, py) => 0.55 * (1 - (py - pv.y) / pv.h), 8 * U, th.ink);
      const sun = { x: pv.x + pv.w * (0.3 + 0.25 * (0.5 + 0.5 * Math.sin(t * 0.8))), y: pv.y + pv.h * 0.34, r: pv.h * 0.2 };
      gg.save(); gg.globalCompositeOperation = "multiply"; gg.fillStyle = th.acc; gg.beginPath(); gg.arc(sun.x + 8 * U, sun.y - 6 * U, sun.r, 0, TAU); gg.fill(); gg.restore();
      gg.fillStyle = th.page; gg.beginPath(); gg.arc(sun.x, sun.y, sun.r * 0.9, 0, TAU); gg.fill();
      gg.fillStyle = th.ink; gg.beginPath(); gg.moveTo(pv.x, pv.y + pv.h); gg.lineTo(pv.x + pv.w * 0.25, pv.y + pv.h * 0.5); gg.lineTo(pv.x + pv.w * 0.42, pv.y + pv.h * 0.74);
      gg.lineTo(pv.x + pv.w * 0.66, pv.y + pv.h * 0.4); gg.lineTo(pv.x + pv.w, pv.y + pv.h * 0.8); gg.lineTo(pv.x + pv.w, pv.y + pv.h); gg.closePath(); gg.fill();
      gg.strokeStyle = th.ink; gg.lineWidth = 4 * U; gg.strokeRect(pv.x, pv.y, pv.w, pv.h);
      // timeline: three tracks of cut clips that slide
      for (let r = 0; r < 3; r++) {
        const ty = sh * (0.6 + r * 0.125), th2 = sh * 0.09, off = (((t * (12 + r * 5) * U) % (80 * U)) + 80 * U) % (80 * U);
        let cxp = sw * 0.04 - off;
        for (let k = 0; k < 8; k++) {
          const cw = (60 + hh(r, k, 4) * 90) * U * (sw / (700 * U) > 1.6 ? 1.6 : Math.max(0.6, sw / (700 * U)));
          const colr = r === 1 && k === 3 ? th.acc : (r + k) % 2 ? th.ink : th.news;
          if (cxp + cw > sx - sw && cxp < sw) { gg.fillStyle = colr; gg.fillRect(Math.max(sw * 0.04, cxp), ty, Math.max(0, Math.min(cxp + cw, sw * 0.96) - Math.max(sw * 0.04, cxp) - 5 * U), th2); }
          cxp += cw;
        }
      }
      // playhead
      const px = sw * (0.06 + 0.88 * ((t * 0.16) % 1));
      gg.fillStyle = th.acc; gg.fillRect(px - 2.5 * U, sh * 0.56, 5 * U, sh * 0.42);
      gg.beginPath(); gg.moveTo(px - 12 * U, sh * 0.56); gg.lineTo(px + 12 * U, sh * 0.56); gg.lineTo(px, sh * 0.6); gg.closePath(); gg.fill();
      // cursor
      const cxs = sw * (0.5 + 0.32 * Math.sin(t * 0.9)), cys = sh * (0.55 + 0.22 * Math.sin(t * 1.3 + 1));
      gg.fillStyle = th.ink; gg.strokeStyle = th.page; gg.lineWidth = 3 * U; gg.beginPath(); gg.moveTo(cxs, cys); gg.lineTo(cxs + 20 * U, cys + 40 * U); gg.lineTo(cxs + 8 * U, cys + 36 * U); gg.lineTo(cxs, cys + 54 * U); gg.closePath(); gg.stroke(); gg.fill();
      const click = (t * 0.7) % 1;
      if (click < 0.3) { gg.strokeStyle = th.ink; gg.lineWidth = 3 * U; gg.beginPath(); gg.arc(cxs, cys, click * 90 * U, 0, TAU); gg.stroke(); }
    } });
    if (!phone) {
      sheet(g, -w * 0.07, h + 6 * U, w * 1.14, 40 * U, { fill: th.ink, seed: 14, rough: 3, sides: 4, draw: (gg, ww, hh2) => halftone(gg, 0, 0, ww, hh2, () => 0.5, 9 * U, th.page) });
      tape(g, w * 0.5, h + 8 * U, 130 * U, 36 * U, 0.02, th.tape, 6, 0.9);
    }
    g.restore();
    // three pinned labels with marker leaders to parts of the screen
    const anchors = [[x + pad + sw * 0.7, y + pad + sh * 0.25], [x + pad + sw * 0.55, y + pad + sh * 0.78], [x + pad + sw * 0.2, y + pad + sh * 0.9]];
    (d.callouts || []).forEach((txt, i) => {
      const c = bk(seg(p, 0.3 + i * 0.14, 0.62 + i * 0.14));
      if (c <= 0 || !txt) return;
      const lx = tall ? box.x + 70 * U : box.x + box.w * 0.64 + 60 * U, ly = tall ? area.y + area.h + 80 * U + i * 110 * U : box.y + box.h * (0.2 + i * 0.3);
      const [ax, ay] = anchors[i];
      const jb = Math.sin(t * 1.4 + i) * 6 * U;
      arrow(g, lx - 12 * U, ly, ax, ay, (i % 2 ? 1 : -1) * 40 * U + jb, seg(c, 0.2, 1), th.ink, 4.5 * U, 30 + i);
      scribble(g, ax, ay, 22 * U, 22 * U, seg(c, 0.5, 1), th.acc, 6 * U, 50 + i);
      ransomRun(g, th, String(i + 1), lx - 6 * U - 28 * U, ly + 36 * U, 60 * U, { align: "right", seed: 20 + i, q: c });
      const lb = label(g, th, txt, lx, ly, 42 * U, { kind: i === 1 ? "acc" : "ink", maxW: tall ? box.w - 160 * U : box.w * 0.36 - 40 * U, rot: (i - 1) * 0.02 + Math.sin(t * 1.7 + i) * 0.006, q: seg(c, 0.4, 1) });
      // tape slapped over each label's end, one after another
      const tq = seg(c, 0.8, 1);
      if (tq > 0) tape(g, lx + lb.w + 6 * U, ly - lb.h * 0.3, 70 * U * (1.3 - 0.3 * eo(tq)), 30 * U, 0.6 + Math.sin(t * 2.1 + i) * 0.06, th.tape, 80 + i, 0.86 * clamp(tq * 3));
      const cyc = info.local - 0.1 - 0.74 * Math.max(0.8, info.hold * 0.85);
      if (cyc > 0) {
        const per = 0.75, j = Math.floor(cyc / per) % 3, f = (cyc % per) / per;
        if (j === i) {
          line(g, wob(lx, ly + lb.h * 0.62, lx + lb.w, ly + lb.h * 0.55, 5 * U, 14, 60 + i, 3 * U), eo(f / 0.45), th.acc, 8 * U);
          scribble(g, ax, ay, 34 * U * (1 + 0.3 * Math.sin(f * Math.PI)), 34 * U * (1 + 0.3 * Math.sin(f * Math.PI)), eo(f / 0.5), th.ink, 5 * U, 70 + i, f * 2);
        }
      }
    });
    // Hold beat: a LIVE sticker slaps onto the screen, a strip of tape is pulled over it, then an EDIT sticker
    // lands on the opposite corner and a marker ring scribbles round the playhead lane.
    const late = objLate(info.hold), lk = info.local - late;
    if (lk > 0) {
      const sx = x + w * 0.9, sy = y + h * 0.06;
      sticker(g, th, sx, sy, 92 * U, "LIVE!", seg(lk, 0, 0.18), t, 3, false);
      const tq = eo(seg(lk, 0.3, 0.6));
      if (tq > 0) tape(g, sx - 70 * U + 80 * U * tq, sy - 10 * U, 160 * U * tq + 1, 40 * U, -0.5, th.tape, 91, 0.9);
      sticker(g, th, x + w * 0.08, y + h * 0.94, 64 * U, "EDIT", seg(lk, 0.74, 0.92), t, 7, true);
      scribble(g, x + w * 0.5, y + pad + sh * 0.78, w * 0.46, sh * 0.2, seg(lk, 1.05, 1.5), th.acc, 7 * U, 95, 2.4);
    }
  }

  // A burst sticker slapped onto the art: drops from 2x, thuds, then keeps a slight wobble.
  function sticker(g, th, x, y, R, text, q, t, seed, alt) {
    if (q <= 0) return;
    const s = (2.1 - 1.1 * eo(q)) * (1 + 0.03 * Math.sin(t * 5 + seed));
    g.save(); g.translate(x, y); g.rotate((alt ? -0.25 : 0.22) + Math.sin(t * 1.6 + seed) * 0.04); g.scale(s, s); g.globalAlpha = clamp(q * 4);
    g.shadowColor = "rgba(0,0,0,0.4)"; g.shadowBlur = 8 * U; g.shadowOffsetY = 4 * U;
    g.fillStyle = th.ink; burst(g, 0, 0, R, 11, 0, 0.74, seed); g.fill(); g.shadowColor = "transparent";
    g.fillStyle = alt ? th.white : th.acc; burst(g, 0, 0, R * 0.86, 11, 0, 0.76, seed); g.fill();
    g.fillStyle = th.ink; g.font = `400 ${R * 0.5}px ${F_IMPACT}`; g.textAlign = "center"; g.textBaseline = "middle";
    const w = g.measureText(text).width; if (w > R * 1.3) g.font = `400 ${R * 0.5 * (R * 1.3) / w}px ${F_IMPACT}`;
    g.fillText(text, 0, R * 0.04);
    g.restore();
  }

  // ---- people: paper puppets with punk hair ---------------------------------------------------------
  function puppet(g, th, cx, base, size, kind, hot, t, i, q, react = 0) {
    const r = size * 0.19, bob = -Math.abs(Math.sin(t * 3 + i * 1.3)) * 5 * U * (Math.floor(t * 12) % 2 ? 1 : 0.9);
    g.save(); g.translate(cx, base + (1 - q) * size * 0.5); g.globalAlpha = clamp(q * 2.5);
    const bw = size * 0.52, bodyTop = -size * 0.62 + bob, bodyH = size * 0.34, legH = size * 0.28;
    // legs and boots
    g.fillStyle = th.ink;
    for (const sg of [-1, 1]) {
      g.fillRect(sg * bw * 0.22 - bw * 0.1, -legH + bob * 0.3, bw * 0.2, legH - 12 * U);
      g.beginPath(); g.moveTo(sg * bw * 0.22 - bw * 0.14, -14 * U); g.lineTo(sg * bw * 0.22 + bw * 0.22 * sg + (sg < 0 ? -bw * 0.1 : 0), -14 * U); g.lineTo(sg * bw * 0.22 + bw * 0.22 * sg + (sg < 0 ? -bw * 0.1 : 0), 0); g.lineTo(sg * bw * 0.22 - bw * 0.14, 0); g.closePath(); g.fill();
    }
    // arms behind the torso
    const wave = hot ? -2.5 + Math.sin(t * 7) * 0.45 : 0.28 + Math.sin(t * 2 + i) * 0.1 - 2.6 * react;
    const arm = (sg, ang, col) => {
      g.save(); g.translate(sg * bw * 0.5, bodyTop + bodyH * 0.14); g.rotate(sg * (ang));
      g.fillStyle = col; g.fillRect(-bw * 0.09, 0, bw * 0.18, size * 0.3);
      g.fillStyle = th.news; g.beginPath(); g.arc(0, size * 0.31, bw * 0.12, 0, TAU); g.fill(); g.strokeStyle = th.ink; g.lineWidth = 3 * U; g.stroke();
      g.restore();
    };
    const jacket = hot ? th.acc : th.ink;
    arm(-1, 0.28 + Math.sin(t * 2 + i + 1) * 0.08 - 2.6 * react, jacket); arm(1, wave, jacket);
    // jacket
    sheet(g, -bw / 2, bodyTop, bw, bodyH, { fill: hot ? th.acc : th.ink, seed: 3 + i, rough: 4, sides: 4, sb: 6, sy: 4, draw: (gg, w, h) => {
      if (!hot) halftone(gg, 0, 0, w, h, (px, py) => 0.34 * (py / h) + 0.08, 9 * U, th.page);
      gg.strokeStyle = th.page; gg.lineWidth = 3.5 * U; gg.globalAlpha = hot ? 0 : 0.9; gg.beginPath(); gg.moveTo(w / 2, 0); gg.lineTo(w / 2, h); gg.stroke(); gg.globalAlpha = 1;
      if (hot) { gg.fillStyle = th.ink; gg.fillRect(w / 2 - 3 * U, 0, 6 * U, h); gg.fillRect(0, 0, w * 0.16, h); gg.fillRect(w * 0.84, 0, w * 0.16, h); halftone(gg, w * 0.16, 0, w * 0.68, h, (px, py) => 0.25 * (py / h), 9 * U, th.ink); }
    } });
    // patch and pin
    const patch = bodyTop + bodyH * 0.55;
    g.save(); g.translate(-bw * 0.24, patch); g.rotate(-0.15); g.fillStyle = hot ? th.ink : th.acc; g.fillRect(-bw * 0.1, -bw * 0.08, bw * 0.2, bw * 0.16);
    g.strokeStyle = hot ? th.page : th.ink; g.lineWidth = 2.5 * U; g.setLineDash([5 * U, 4 * U]); g.strokeRect(-bw * 0.075, -bw * 0.055, bw * 0.15, bw * 0.11); g.setLineDash([]); g.restore();
    pin(g, th, bw * 0.2, bodyTop + bodyH * 0.2, 0.4, bw * 0.28, 0);
    // neck, head
    const hy = bodyTop - r * 0.95;
    g.save(); g.translate(0, hy); g.rotate(Math.sin(t * 2 + i) * 0.045 + (hh(i, STEP, 6) - 0.5) * 0.01);
    g.fillStyle = th.news; g.fillRect(-r * 0.25, r * 0.6, r * 0.5, r * 0.5);
    // hair behind
    const hair = hot ? th.acc : th.ink;
    if (kind === 4) { g.fillStyle = th.ink; for (let k = 0; k < 9; k++) { const a = -Math.PI * (k / 8); g.beginPath(); g.arc(Math.cos(a) * r * 1.1, Math.sin(a) * r * 1.0 - r * 0.1, r * 0.46, 0, TAU); g.fill(); } }
    if (kind === 5) { g.fillStyle = th.ink; g.beginPath(); g.ellipse(-r * 0.2, r * 0.2, r * 1.2, r * 1.3, 0.2, 0, TAU); g.fill(); }
    // face
    g.beginPath(); g.ellipse(0, 0, r, r * 1.08, 0, 0, TAU);
    g.fillStyle = th.news; g.fill(); g.strokeStyle = th.ink; g.lineWidth = 4.5 * U; g.stroke();
    halftone(g, -r * 0.9, r * 0.1, r * 0.55, r * 0.5, () => 0.45, 6 * U, th.ink);
    halftone(g, r * 0.35, r * 0.1, r * 0.55, r * 0.5, () => 0.45, 6 * U, th.ink);
    // hair front
    g.fillStyle = hair; g.strokeStyle = th.ink; g.lineWidth = 3.5 * U;
    if (kind === 0) { for (let k = 0; k < 5; k++) { const bx = (k - 2) * r * 0.28, tall2 = r * (0.8 + 0.5 * (1 - Math.abs(k - 2) / 2)) + Math.sin(t * 4 + k) * 3 * U; g.beginPath(); g.moveTo(bx - r * 0.2, -r * 0.8); g.lineTo(bx + (k - 2) * 5 * U, -r * 0.8 - tall2); g.lineTo(bx + r * 0.2, -r * 0.8); g.closePath(); g.fill(); g.stroke(); } }
    else if (kind === 1) { g.beginPath(); g.ellipse(0, -r * 0.35, r * 1.05, r * 0.75, 0, Math.PI, TAU); for (let k = 5; k >= 0; k--) g.lineTo(-r * 1.0 + (k * r * 2.0) / 5, -r * 0.3 + (k % 2 ? r * 0.35 : 0)); g.closePath(); g.fill(); }
    else if (kind === 2) { g.fillStyle = th.acc; g.beginPath(); g.ellipse(0, -r * 0.55, r * 1.05, r * 0.72, 0, Math.PI, TAU); g.fill(); g.stroke(); g.fillStyle = th.ink; g.fillRect(-r * 1.05, -r * 0.62, r * 2.1, r * 0.3);
      g.fillStyle = th.page; for (let k = 0; k < 6; k++) g.fillRect(-r * 0.95 + k * r * 0.38, -r * 0.58, r * 0.14, r * 0.22);
      g.fillStyle = th.ink; g.beginPath(); g.arc(0, -r * 1.3, r * 0.17, 0, TAU); g.fill(); }
    else if (kind === 3) { halftone(g, -r * 0.8, -r * 1.0, r * 1.6, r * 0.5, () => 0.5, 5 * U, th.ink); g.fillStyle = th.page; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(r * 0.98, r * (-0.1 + k * 0.2), 4 * U, 0, TAU); g.fill(); g.stroke(); } }
    else if (kind === 4) { g.beginPath(); for (let k = 0; k < 6; k++) { const a = -Math.PI * (k / 5); g.arc(Math.cos(a) * r * 0.8, -r * 0.55 + Math.sin(a) * r * 0.35, r * 0.34, 0, TAU); g.closePath(); } g.fill(); }
    else { g.beginPath(); g.moveTo(-r * 1.0, r * 0.1); g.quadraticCurveTo(-r * 1.1, -r * 1.2, r * 0.4, -r * 1.0); g.quadraticCurveTo(r * 1.1, -r * 0.8, r * 0.9, r * 0.25); g.lineTo(r * 0.7, -r * 0.2); g.quadraticCurveTo(0, -r * 0.55, -r * 0.55, -r * 0.1); g.closePath(); g.fill(); }
    // eyes, brows, mouth
    const blink = ((t + i * 0.77) % 2.6) < 0.14;
    for (const sg of [-1, 1]) {
      const ex = sg * r * 0.38, ey = -r * 0.02;
      g.strokeStyle = th.ink; g.lineWidth = 5 * U; g.lineCap = "round";
      g.beginPath(); g.moveTo(ex - r * 0.2, ey - r * 0.3 - (sg * (hot ? 0.1 : 0.02) * r)); g.lineTo(ex + r * 0.2, ey - r * 0.3 + (sg * (hot ? 0.1 : 0.02) * r)); g.stroke();
      if (blink) { g.beginPath(); g.moveTo(ex - r * 0.14, ey); g.lineTo(ex + r * 0.14, ey); g.stroke(); }
      else { g.fillStyle = th.ink; g.beginPath(); g.arc(ex, ey, r * 0.13, 0, TAU); g.fill(); g.fillStyle = th.page; g.beginPath(); g.arc(ex + 3 * U, ey - 3 * U, r * 0.04, 0, TAU); g.fill(); }
    }
    g.strokeStyle = th.ink; g.lineWidth = 4.5 * U; g.beginPath();
    if (react > 0.3) { g.stroke(); g.fillStyle = th.ink; g.beginPath(); g.ellipse(0, r * 0.48, r * 0.2, r * 0.24 * react, 0, 0, TAU); g.fill(); g.beginPath(); }
    else if (hot) { g.arc(0, r * 0.34, r * 0.28, 0.1, Math.PI - 0.1); } else if (i % 3 === 1) { g.moveTo(-r * 0.25, r * 0.5); g.quadraticCurveTo(0, r * 0.35, r * 0.3, r * 0.42); } else { g.moveTo(-r * 0.22, r * 0.46); g.lineTo(r * 0.22, r * 0.46); }
    g.stroke();
    g.restore(); g.restore();
  }
  // A reaction envelope: after `start`, each of n figures takes a `per`-second turn (0 -> 1 -> 0).
  function reactOf(local, start, per, n, i) {
    const c = local - start;
    if (c < 0) return 0;
    const j = Math.floor(c / per) % (n + 1), f = (c % per) / per;
    return j === i ? Math.sin(Math.PI * f) : 0;
  }
  // A torn speech scrap with a ransom "!" that pops above a figure.
  function shout(g, th, x, y, s, q, i) {
    g.save(); g.translate(x, y); g.rotate(0.2 * (i % 2 ? 1 : -1)); g.scale(0.6 + 0.4 * q, 0.6 + 0.4 * q); g.globalAlpha = clamp(q * 2.5);
    g.fillStyle = th.ink; burst(g, 0, 0, s * 1.05, 9, i, 0.72, 200 + i); g.fill();
    g.fillStyle = i % 2 ? th.acc : th.white; burst(g, 0, 0, s * 0.9, 9, i, 0.74, 200 + i); g.fill();
    g.fillStyle = th.ink; g.font = `400 ${s * 1.1}px ${F_IMPACT}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("!", 0, s * 0.05);
    g.restore();
  }
  const SPARE_ROLES = ["Creator", "Reviewer", "Producer", "Writer", "Designer", "Sound"];
  function castRoles(badges, n) {
    const out = [], used = new Set();
    for (let i = 0; i < n; i++) {
      let b = badges[i];
      if (!b || used.has(String(b).toLowerCase())) b = SPARE_ROLES.find((r) => !used.has(r.toLowerCase())) || b || "";
      used.add(String(b).toLowerCase()); out.push(b);
    }
    return out;
  }
  function peopleDraw(g, S, th, box, p, d, info) {
    const t = info.t, n = Math.max(2, Math.min(6, Math.round(d.count))), hotI = Math.min(n - 1, d.highlight);
    const roles = castRoles(d.badges || [], n);
    const size = Math.min(box.h * 0.62, (box.w / n) * (S.tall ? 1.5 : 1.12)), base = box.y + box.h * (S.tall ? 0.72 : 0.9);
    const hx = box.x + (box.w / n) * (hotI + 0.5);
    // rays behind the hero, a torn ground strip below everyone
    g.save(); g.globalCompositeOperation = "multiply"; g.fillStyle = th.acc; g.globalAlpha = 0.85 * seg(p, 0, 0.4);
    for (let k = 0; k < 14; k++) { const a = t * 0.42 + (k * TAU) / 14, R = size * 1.25; g.beginPath(); g.moveTo(hx, base - size * 0.55); g.arc(hx, base - size * 0.55, R, a, a + TAU / 28); g.closePath(); g.fill(); }
    g.restore();
    sheet(g, box.x - 20 * U, base, box.w + 40 * U, 54 * U, { fill: th.ink, seed: 44, rough: 4, sides: 1, sb: 8, draw: (gg, w, h) => halftone(gg, 0, 0, w, h, (px, py) => 0.5 * (1 - py / h), 9 * U, th.page) });
    for (let i = 0; i < n; i++) {
      const q = bk(seg(p, i * 0.1, 0.38 + i * 0.1)), cx = box.x + (box.w / n) * (i + 0.5), hot = i === hotI;
      if (q <= 0) continue;
      const kinds = [1, 2, 4, 3, 5, 1], kind = hot ? 0 : kinds[i % kinds.length];
      // Hold beat: once everyone is on the page they jump and shout in turn, left to right.
      const re = reactOf(info.local, Math.max(1.2, info.hold * 0.48), 0.42, n, i), jump = re * 66 * U;
      puppet(g, th, cx, base + 8 * U - jump, size * (hot ? 1.08 : 1), kind, hot, t, i, q, re);
      if (re > 0.05) shout(g, th, cx + size * 0.3, base - size * 0.95 - jump, size * 0.22, re, i);
      const name = roles[i], top = base - size * (hot ? 1.14 : 1.06) - 20 * U - jump * 0.6;
      const stag = S.tall && n >= 3 && i % 2 ? -78 * U : 0;
      label(g, th, name, cx, top - 36 * U + stag, 42 * U, { align: "center", kind: hot ? "acc" : "ink", maxW: (box.w / n) * (S.tall ? 1.7 : 0.96), rot: (i % 2 ? 0.03 : -0.03) + Math.sin(t * 1.6 + i) * 0.008, q: seg(q, 0.5, 1) });
    }
  }

  // ---- process: three torn cards, a marker arrow with a travelling dot -----------------------------
  function icon(g, th, kind, cx, cy, s, t, i) {
    g.save(); g.translate(cx, cy); g.lineCap = "round"; g.lineJoin = "round";
    if (kind === "file") {
      g.save(); g.globalCompositeOperation = "multiply"; g.fillStyle = th.acc; g.fillRect(-s * 0.3 + 12 * U, -s * 0.42 - 10 * U, s * 0.62, s * 0.84); g.restore();
      g.fillStyle = th.page; g.strokeStyle = th.ink; g.lineWidth = 6 * U;
      g.beginPath(); g.moveTo(-s * 0.3, -s * 0.42); g.lineTo(s * 0.14, -s * 0.42); g.lineTo(s * 0.32, -s * 0.22); g.lineTo(s * 0.32, s * 0.42); g.lineTo(-s * 0.3, s * 0.42); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(s * 0.14, -s * 0.42); g.lineTo(s * 0.14, -s * 0.22); g.lineTo(s * 0.32, -s * 0.22); g.stroke();
      g.lineWidth = 5 * U; const lines = 5, shown = (t * 1.2 + i) % (lines + 1.5);
      for (let k = 0; k < lines; k++) { const w2 = s * (0.42 - (k % 3) * 0.08) * clamp(shown - k); g.beginPath(); g.moveTo(-s * 0.2, -s * 0.08 + k * s * 0.1); g.lineTo(-s * 0.2 + w2, -s * 0.08 + k * s * 0.1); g.stroke(); }
    } else if (kind === "spark") {
      spotBurst(g, th, 0, 0, s * 0.5, 10, t * 0.5, 12 * U, 5);
      g.fillStyle = th.ink; burst(g, 0, 0, s * 0.46, 10, t * 0.5, 0.68, 5); g.fill();
      g.fillStyle = th.page; g.beginPath(); g.moveTo(s * 0.06, -s * 0.34); g.lineTo(-s * 0.16, s * 0.04); g.lineTo(0, s * 0.04); g.lineTo(-s * 0.06, s * 0.34); g.lineTo(s * 0.18, -s * 0.06); g.lineTo(0, -s * 0.06); g.closePath(); g.fill();
    } else {
      g.save(); g.globalCompositeOperation = "multiply"; g.fillStyle = th.acc; g.beginPath(); g.arc(12 * U, -10 * U, s * 0.42, 0, TAU); g.fill(); g.restore();
      g.strokeStyle = th.ink; g.lineWidth = 7 * U; g.beginPath(); g.arc(0, 0, s * 0.42, 0, TAU); g.stroke();
      const k = ((t * 0.7 + i * 0.1) % 1.5), q = clamp(k / 0.6);
      g.lineWidth = 12 * U; g.beginPath(); g.moveTo(-s * 0.2, s * 0.02); const m1 = clamp(q * 2), m2 = clamp(q * 2 - 1);
      g.lineTo(-s * 0.2 + s * 0.12 * m1, s * 0.02 + s * 0.14 * m1);
      if (m2 > 0) g.lineTo(-s * 0.08 + s * 0.36 * m2, s * 0.16 - s * 0.34 * m2);
      g.stroke();
    }
    g.restore();
  }
  function processDraw(g, S, th, box, p, d, info) {
    const t = info.t, n = d.steps.length, tall = S.tall, gap = (tall ? 70 : 100) * U;
    const cw = tall ? box.w * 0.84 : (box.w - gap * (n - 1)) / n, ch = tall ? (box.h - gap * (n - 1)) / n : box.h * 0.9;
    const kinds = ["file", "spark", "check"], pos = [];
    for (let i = 0; i < n; i++) {
      const x = tall ? box.x + (box.w - cw) / 2 + (i % 2 ? 24 : -24) * U : box.x + i * (cw + gap), y = tall ? box.y + i * (ch + gap) : box.y + (box.h - ch) / 2 + (i % 2 ? 22 : -8) * U;
      pos.push({ x, y });
      const q = bk(seg(p, i * 0.2, i * 0.2 + 0.36)), last = i === n - 1;
      if (q <= 0) continue;
      g.save(); g.translate(x + cw / 2, y + ch / 2); g.rotate((i % 2 ? 0.025 : -0.03) + (hh(i, STEP, 2) - 0.5) * 0.006); g.scale(q, q); g.translate(-cw / 2, -ch / 2);
      sheet(g, 0, 0, cw, ch, { fill: th.white, seed: 20 + i, rough: 5, draw: (gg, w, h) => { halftone(gg, 0, h * 0.55, w, h * 0.45, (px, py) => 0.18 * ((py - h * 0.55) / (h * 0.45)), 9 * U, th.ink); } });
      const ix = tall ? cw * 0.24 : cw / 2, iy = tall ? ch * 0.5 : ch * 0.38, isz = Math.min(cw, ch) * (tall ? 0.6 : 0.46);
      icon(g, th, kinds[i % 3], ix, iy, isz, t, i);
      ransomRun(g, th, String(i + 1), 18 * U, 112 * U, 100 * U, { seed: 60 + i });
      const lw = tall ? cw * 0.5 : cw * 0.92, lines = wrapLines(g, d.steps[i], 42 * U, lw), lx = tall ? cw * 0.74 : cw / 2;
      lines.forEach((ln, k) => label(g, th, ln, lx, (tall ? ch * 0.5 - (lines.length - 1) * 38 * U : ch * 0.8 - (lines.length - 1) * 38 * U) + k * 76 * U, 42 * U, { align: "center", kind: last ? "acc" : "page", rot: (k ? 0.02 : -0.02), q: seg(q, 0.5, 1) }));
      g.restore();
    }
    for (let i = 0; i < n - 1; i++) {
      const a = seg(p, i * 0.2 + 0.25, i * 0.2 + 0.5);
      if (a <= 0) continue;
      const A = pos[i], B = pos[i + 1];
      const x0 = tall ? A.x + cw * 0.5 : A.x + cw + 8 * U, y0 = tall ? A.y + ch + 6 * U : A.y + ch * 0.5, x1 = tall ? B.x + cw * 0.5 : B.x - 12 * U, y1 = tall ? B.y - 8 * U : B.y + ch * 0.5;
      arrow(g, x0, y0, x1, y1, (i % 2 ? 1 : -1) * 18 * U, a, th.ink, 7 * U, 70 + i);
      if (a >= 0.98) {
        const f = (t * 0.55 + i * 0.35) % 1;
        g.save(); g.fillStyle = th.acc; g.strokeStyle = th.ink; g.lineWidth = 3.5 * U; g.beginPath(); g.arc(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f + Math.sin(f * Math.PI) * (i % 2 ? 1 : -1) * 18 * U, 11 * U, 0, TAU); g.fill(); g.stroke(); g.restore();
      }
    }
  }

  // ---- compare: a crumpled "before" poster against a crisp spot-ink "after" ------------------------
  function compareDraw(g, S, th, box, p, d, info) {
    const t = info.t, tall = S.tall, gap = (tall ? 140 : 160) * U;
    const cw = tall ? box.w : (box.w - gap) / 2, ch = tall ? (box.h - gap) / 2 : box.h * 0.92;
    const maxV = Math.max(d.leftValue, d.rightValue, 1);
    const items = [[d.left, d.leftValue, false], [d.right, d.rightValue, true]];
    items.forEach(([lab, val, win], i) => {
      const q = bk(seg(p, i * 0.18, 0.4 + i * 0.18));
      if (q <= 0) return;
      const x = tall ? box.x : box.x + i * (cw + gap), y = tall ? box.y + i * (ch + gap) : box.y + (box.h - ch) / 2;
      g.save(); g.translate(x + cw / 2, y + ch / 2); g.rotate((i ? 0.022 : -0.028) + (hh(i, STEP, 9) - 0.5) * 0.005); g.scale(q, q); g.translate(-cw / 2, -ch / 2);
      sheet(g, 0, 0, cw, ch, { fill: win ? th.white : th.news, seed: 80 + i, rough: win ? 4 : 8, draw: (gg, w, h) => {
        if (!win) {
          gg.strokeStyle = th.ink; gg.globalAlpha = 0.22; gg.lineWidth = 2.5 * U;
          for (let k = 0; k < 7; k++) { gg.beginPath(); gg.moveTo(hh(k, 1) * w, 0); gg.lineTo(hh(k, 2) * w, h * 0.5); gg.lineTo(hh(k, 3) * w, h); gg.stroke(); }
          gg.globalAlpha = 1;
          halftone(gg, 0, 0, w, h, (px, py) => 0.28 * (1 - py / h) + 0.04, 10 * U, th.ink);
        } else {
          gg.save(); gg.globalCompositeOperation = "multiply"; gg.fillStyle = th.acc; burst(gg, w * 0.62, h * 0.52, Math.min(w, h) * 0.5, 16, t * 0.35, 0.76, 7); gg.fill(); gg.restore();
        }
      } });
      if (!win) {
        for (let k = 0; k < 4; k++) {
          const yy = ch * (0.2 + k * 0.07) + 70 * U;
          const zz = [], zl = (150 + hh(k, 61) * 80) * U;
          for (let m = 0; m <= 16; m++) zz.push(cw * 0.56 + (m / 16) * zl + (hh(k, m, STEP) - 0.5) * 3 * U, yy + (m % 2 ? -10 : 10) * U * (0.7 + hh(k, m, 3) * 0.5));
          line(g, zz, seg(p, 0.45 + k * 0.05, 0.62 + k * 0.05), "rgba(20,18,14,0.55)", 4 * U);
          line(g, wob(cw * 0.55, yy, cw * 0.55 + zl + 10 * U, yy + 2 * U, 0, 8, 90 + k, 2 * U), seg(p, 0.6 + k * 0.05, 0.75 + k * 0.05), th.ink, 4.5 * U);
        }
      } else {
        for (let k = 0; k < 4; k++) {
          const sx = cw * (0.16 + k * 0.22), sy = ch * (0.3 + 0.1 * Math.sin(t * 1.5 + k * 2)), sr = (18 + (k % 2) * 10) * U * (0.8 + 0.3 * Math.sin(t * 5 + k));
          g.save(); g.translate(sx, sy); g.rotate(t * 0.8 + k); g.fillStyle = th.ink; g.beginPath();
          for (let m = 0; m < 8; m++) { const rr = m % 2 ? sr * 0.25 : sr; g.lineTo(Math.cos((m * Math.PI) / 4) * rr, Math.sin((m * Math.PI) / 4) * rr); }
          g.closePath(); g.fill(); g.restore();
        }
      }
      label(g, th, lab, 28 * U, 64 * U, 46 * U, { kind: win ? "acc" : "ink", maxW: cw - 80 * U, rot: -0.02, q: seg(q, 0.4, 1) });
      const cnt = ease3(seg(p, 0.3 + i * 0.1, 0.85));
      const nsz = Math.min(300 * U, ch * 0.5);
      const nw = ransomRun(g, th, fmt(val * cnt, d), cw * 0.5, ch * 0.74, nsz, { align: "center", maxW: cw * 0.86, seed: 31 + i });
      // end beat: the old count gets crossed out, the new one ringed, and the after-meter re-inks
      const late = Math.max(info.hold * 0.68, info.hold - 1.3), lk = info.local - late, ncy = ch * 0.74 - nsz * 0.6;
      if (!win) {
        line(g, wob(cw * 0.5 - nw * 0.75, ncy - nsz * 0.55, cw * 0.5 + nw * 0.75, ncy + nsz * 0.5, 0, 10, 140, 4 * U), seg(lk, 0, 0.18), th.acc, 16 * U);
        line(g, wob(cw * 0.5 + nw * 0.75, ncy - nsz * 0.55, cw * 0.5 - nw * 0.75, ncy + nsz * 0.5, 0, 10, 141, 4 * U), seg(lk, 0.14, 0.32), th.acc, 16 * U);
      } else {
        scribble(g, cw * 0.5, ncy, nw * 0.9 + 30 * U, nsz * 0.66, seg(lk, 0.35, 0.7), th.ink, 8 * U, 142, -1.2);
      }
      const refill = win ? 1 - 0.85 * Math.sin(Math.PI * seg(info.local - Math.max(info.hold * 0.68, info.hold - 1.3), 0.55, 1.05)) : 1;
      const mx = 34 * U, my = ch - 70 * U, mw = cw - 68 * U, mh = 30 * U, fill = (val / maxV) * mw * cnt * refill;
      g.fillStyle = th.ink; g.globalAlpha = 0.18; g.fillRect(mx, my, mw, mh); g.globalAlpha = 1;
      g.save(); g.beginPath(); g.rect(mx, my, fill, mh); g.clip();
      g.fillStyle = win ? th.acc : th.ink; g.fillRect(mx, my, mw, mh);
      g.strokeStyle = win ? th.ink : th.page; g.lineWidth = 5 * U; g.beginPath();
      for (let sx = mx - mh * 2 + ((t * 40 * U) % (22 * U)); sx < mx + mw; sx += 22 * U) { g.moveTo(sx, my + mh); g.lineTo(sx + mh, my); }
      g.stroke(); g.restore();
      g.strokeStyle = th.ink; g.lineWidth = 3.5 * U; g.strokeRect(mx, my, mw, mh);
      g.restore();
    });
    // the VS burst between them, plus the change stamp
    const vq = bk(seg(p, 0.35, 0.65));
    if (vq > 0) {
      const cx = tall ? box.x + box.w / 2 : box.x + cw + gap / 2, cy = tall ? box.y + ch + gap / 2 : box.y + box.h / 2, R = (tall ? 78 : 84) * U * (1 + Math.sin(t * 5) * 0.04);
      g.save(); g.translate(cx, cy); g.scale(vq, vq); g.translate(-cx, -cy);
      spotBurst(g, th, cx, cy, R * 1.15, 14, -t * 0.5, 9 * U, 3);
      g.fillStyle = th.ink; burst(g, cx, cy, R, 14, t * 0.4, 0.72, 3); g.fill();
      g.fillStyle = th.page; g.font = `400 ${R * 0.78}px ${F_IMPACT}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("VS", cx, cy + R * 0.04);
      g.restore();
    }
    if (d.leftValue > 0) {
      const pct = Math.round(((d.rightValue - d.leftValue) / d.leftValue) * 100), sq = bk(seg(p, 0.7, 0.95));
      const sx = tall ? box.x + box.w - 120 * U : box.x + box.w - 130 * U, sy = tall ? box.y + ch + gap + 60 * U : box.y + 54 * U;
      const lk = info.local - Math.max(info.hold * 0.68, info.hold - 1.3), hit = lk > 0.7 && lk < 1.0 ? Math.sin(((lk - 0.7) / 0.3) * Math.PI) : 0;
      stamp(g, th, `${pct > 0 ? "+" : pct < 0 ? "-" : ""}${Math.abs(pct)}%`, sx, sy, 78 * U * (1 + Math.sin(t * 4) * 0.03 + 0.22 * hit), -0.2 + 0.08 * hit, hit > 0.3 ? th.acc : th.ink, sq);
    }
  }

  // ---- title and closing: statement pages drawn by the stage ----------------------------------------
  let S_W = 1920;
  function tagRow(g, th, words, left, right, y, local, t, closing) {
    const gap = 34 * U, kinds = ["ink", "page", "acc"];
    let fs = 44 * U, ws = [];
    const measure = () => { g.save(); g.font = `800 ${fs}px ${F_LABEL}`; g.letterSpacing = fs * 0.07 + "px"; ws = words.map((w) => g.measureText(w.toUpperCase()).width + fs * 0.95); g.letterSpacing = "0px"; g.restore(); return ws.reduce((a, b2) => a + b2, 0) + gap * (ws.length - 1); };
    let total = measure();
    if (total > right - left) { fs = Math.max(42 * U, fs * (right - left) / total); total = measure(); }
    while (words.length > 1 && total > right - left) { words = words.slice(0, -1); total = measure(); }
    let x = left;
    words.forEach((w, i) => {
      const q = seg(local, (closing ? 0.05 : -0.25) + i * 0.13, (closing ? 0.3 : 0) + i * 0.13);
      const c = local - 0.9, per = 0.55, turn = c > 0 && Math.floor(c / per) % (words.length + 1) === i, f = turn ? (c % per) / per : 0;
      const pop = turn ? Math.sin(Math.PI * Math.min(1, f / 0.35)) * (f < 0.35 ? 1 : 0) : 0;
      const cx = x + ws[i] / 2;
      g.save(); g.translate(cx, y); g.scale(1 + 0.12 * pop, 1 + 0.12 * pop); g.rotate(((hh(i, 31) - 0.5) * 0.05 + (closing ? 0.015 : -0.015)) - 0.04 * pop); g.translate(-cx, -y);
      label(g, th, w, x, y, fs, { kind: kinds[i % 3], q: closing ? q : 1 });
      g.restore();
      if (turn) line(g, wob(x + 10 * U, y + fs * 0.95, x + ws[i] - 10 * U, y + fs * 0.85, 4 * U, 14, 300 + i, 3 * U), eo(f / 0.5), th.acc, 7 * U);
      x += ws[i] + gap;
    });
  }
  function statement(ctx, S, th, id, info, exitK) {
    const { W, H } = S, t = info.t, local = id === info.scene ? info.local : info.hold + info.local, pg = pageRect(S);
    const o = orderOf(id);
    let tx = 0, ty = 0, rot = (hh(sid(id), 4) - 0.5) * 0.014, sc = 1, shade = 0;
    if (exitK !== undefined) { tx = -eio(exitK) * W * 0.05; sc = 1 - 0.03 * eio(exitK); shade = 0.5 * exitK; }
    else if (!o.next && id === info.scene && info.hold > 2 * EDGE && local > info.hold - EDGE) { const k = eio(seg(local, info.hold - EDGE - 0.06, info.hold - 0.1)); tx = -k * W * 1.06; rot -= 0.04 * k; }
    if (exitK === undefined && id === info.scene) { const jl = jolt(local, holdBeats(id, info.hold)); ty += jl * 7 * U; rot += jl * 0.003; }
    const jx = (hh(sid(id), STEP, 1) - 0.5) * 1.6 * U, jy = (hh(sid(id), STEP, 2) - 0.5) * 1.6 * U;
    S_W = W;
    ctx.save(); ctx.translate(W / 2 + tx + jx, H / 2 + ty + jy); ctx.rotate(rot); ctx.scale(sc, sc); ctx.translate(-W / 2, -H / 2);
    pageBase(ctx, S, th, id, t);
    const hb = headChars(id).box || { x: pg.x + 80 * U, y: H * 0.4, w: W * 0.6, h: H * 0.2 };
    const topH = hb.y - pg.y, botY = hb.y + hb.h, botH = pg.y + pg.h - botY, closing = id === "closing";
    const r1 = Math.min(topH, botH) * 0.5;
    // a huge halftone moon bleeding off one corner, with the spot ink knocked off-register
    const mx = closing ? pg.x + pg.w * 0.12 : pg.x + pg.w * 0.88, my = closing ? pg.y + pg.h - botH * 0.4 : pg.y + topH * 0.45, mr = Math.max(180 * U, Math.min(r1 * 1.2, 330 * U));
    g_clip(ctx, pg, () => {
      ctx.save(); ctx.globalCompositeOperation = "multiply"; ctx.fillStyle = th.acc; ctx.beginPath(); ctx.arc(mx + 16 * U, my - 12 * U, mr, 0, TAU); ctx.fill(); ctx.restore();
      halftone(ctx, mx - mr, my - mr, mr * 2, mr * 2, (px, py) => (Math.hypot(px - mx, py - my) < mr ? 0.82 - 0.7 * ((py - (my - mr)) / (mr * 2)) : 0), 12 * U, th.ink);
    });
    // scissors cutting a dashed line across the free band, a ticker in the other
    const cutY = botY + botH * 0.2;
    ctx.save(); ctx.strokeStyle = th.ink; ctx.globalAlpha = 0.8; ctx.lineWidth = 3.5 * U; ctx.setLineDash([18 * U, 12 * U]); ctx.lineDashOffset = -t * 40 * U;
    ctx.beginPath(); ctx.moveTo(pg.x + 40 * U, cutY); ctx.lineTo(pg.x + pg.w - 40 * U, cutY); ctx.stroke(); ctx.restore();
    const sp = pg.x + 40 * U + (((t * 150 * U) % (pg.w + 240 * U))) - 120 * U;
    scissors(ctx, th, sp, cutY, 130 * U, 0, 0.1 + Math.abs(Math.sin(t * 8)) * 0.34);
    ctx.save(); ctx.beginPath(); ctx.rect(pg.x, pg.y, pg.w, pg.h); ctx.clip();
    const np = S.tall ? 3 : 5, psz = Math.max(260 * U, Math.min(botH * 1.15, 470 * U)), hotP = closing ? 1 : 2;
    for (let k = 0; k < np; k++) {
      const px = pg.x + pg.w * (S.tall ? 0.2 + 0.3 * k : closing ? 0.14 + 0.18 * k : 0.3 + 0.16 * k), kinds = [1, 3, 0, 4, 2];
      const q = bk(seg(local, -0.25 + k * 0.07, 0.15 + k * 0.07));
      const re = reactOf(local, closing ? 0.9 : 0.75, 0.32, np, k);
      puppet(ctx, th, px, pg.y + pg.h + psz * 0.22 - re * 40 * U, psz, k === hotP ? 0 : kinds[k % kinds.length], k === hotP, t, k + (closing ? 3 : 0), q, re);
      if (re > 0.05) shout(ctx, th, px + psz * 0.3, pg.y + pg.h - psz * 0.62 - re * 40 * U, psz * 0.16, re, k);
    }
    ctx.restore();
    // A row of label-maker tags pasted one by one, fitted inside the sheet between the corner tape and the moon
    // (title) or the FIN stamp (closing); in the hold each tag is re-slapped in turn and gets a marker underline.
    const words = closing ? ["pass it on", "make your own", "copy this page"] : ["take one", "copy this page", "fresh issue"];
    const tickY = pg.y + topH * (closing ? 0.46 : 0.52);
    const left = pg.x + (S.tall ? 70 : 150) * U;
    let right = closing ? pg.x + pg.w - (S.tall ? 290 : 300) * U : pg.x + pg.w - 90 * U;
    if (!closing && Math.abs(my - tickY) < mr + 60 * U) right = Math.min(right, mx - mr - 40 * U);
    tagRow(ctx, th, words, left, right, tickY, local, t, closing);
    stamp(ctx, th, closing ? "FIN" : "ISSUE 1", closing ? pg.x + pg.w - 170 * U : pg.x + 170 * U, closing ? pg.y + topH * 0.45 : botY + botH * 0.58, 92 * U * (1 + Math.sin(t * 3) * 0.03), closing ? 0.2 : -0.18, th.ink, bk(seg(local, -0.1, 0.3)));
    // The opening page is already half pasted on the first frame.
    if (id === "title") kickerLabel(ctx, th, local + 0.2);
    ransomHead(ctx, th, id, local, id === "title" ? -0.14 : 0);
    pageTrim(ctx, S, th, id, t);
    if (shade) { ctx.fillStyle = `rgba(0,0,0,${shade})`; ctx.fillRect(pg.x, pg.y, pg.w, pg.h); }
    ctx.restore();
  }
  function g_clip(ctx, pg, fn) { ctx.save(); ctx.beginPath(); ctx.rect(pg.x, pg.y, pg.w, pg.h); ctx.clip(); fn(); ctx.restore(); }

  return {
    bg: "#14120e", panel: "#f1eee3", ink: "#14120e", muted: "#6f6a5c", accent: "#ff5a1f", onAccent: "#14120e",
    rule: "rgba(20,18,14,0.7)", track: "rgba(20,18,14,0.12)",
    board: "#14120e", page: "#f1eee3", news: "#d8d3c2", white: "#fbf9f2", tape: "#e5d7a0",
    display: F_BLACK, displayWeight: 900, displayCase: "none", displayTracking: "0.01em",
    body: F_LABEL, bodyWeight: 700, figures: F_IMPACT, radius: 0, motion: "type", change: "fade",
    kit: { line: 4, fill: "solid", panel: "fill" },
    keepArt: true, overlap: true, paintOver: true,
    palettes: {
      // Daylight: a pale desk under cream copies. Night: a photocopy negative, light toner on dark stock. Mono: grey spot ink.
      light: { bg: "#cdc8b8", board: "#cdc8b8", page: "#fbfaf3", news: "#e9e5d6", white: "#ffffff", tape: "#e8dba6", ink: "#17150f", muted: "#6c675a", accent: "#ff4a10" },
      dark: { bg: "#050505", board: "#050505", page: "#26241f", news: "#38352d", white: "#2f2d27", tape: "#7e7448", ink: "#ece8da", muted: "#a39e8f", accent: "#ff6a2e", onAccent: "#050505", inv: true, rule: "rgba(236,232,218,0.7)", track: "rgba(236,232,218,0.14)" },
      mono: { bg: "#17150f", board: "#17150f", page: "#e9e7e0", news: "#cfccc2", white: "#f7f6f1", tape: "#d6d3c6", ink: "#17150f", muted: "#6c6a62", accent: "#8c887c" },
    },
    textShadow: () => "none",
    backdrop: (accent, texture, look) => look.board,
    css: () => `.display, .kicker { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; }
      .display { font-family: ${F_BLACK}; }`,
    paint,
    stage(ctx, S, info) {
      U = S.u; STEP = stepOf(info.t);
      const th = theme(S);
      ctx.save(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      if (S.paint) world(ctx, S, th, info);
      const o = info.scene ? orderOf(info.scene) : { prev: null };
      // The title page has no drawer: it sits under the next page while that page drops.
      const P = plan();
      const prevId = P && info.index > 0 ? P[info.index - 1].id : null;
      if (prevId === "title" && info.scene && info.scene !== "closing" && info.local < info.change) {
        statement(ctx, S, th, "title", { ...info, scene: info.scene }, clamp(info.local / Math.max(0.01, info.change)));
      }
      // Under the last page as it is pushed off: a slammed "pass it on" burst on the lid, so the piece never ends empty.
      if (P && info.index === P.length - 1 && info.hold > 2 * EDGE && info.local > info.hold - EDGE - 0.2) {
        const lq = seg(info.local, info.hold - EDGE - 0.2, info.hold - EDGE + 0.1), cx = S.W / 2, cy = S.H / 2, R = Math.min(S.W, S.H) * 0.34;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.08 + Math.sin(info.t * 2) * 0.02); const k = 1.25 - 0.25 * eo(lq); ctx.scale(k, k); ctx.translate(-cx, -cy);
        spotBurst(ctx, th, cx, cy, R * 1.08, 16, info.t * 0.4, 14 * U, 77);
        ctx.fillStyle = th.ink; burst(ctx, cx, cy, R, 16, info.t * 0.4, 0.78, 77); ctx.fill();
        ctx.fillStyle = th.page; burst(ctx, cx, cy, R * 0.88, 16, info.t * 0.4, 0.8, 77); ctx.fill();
        ransomRun(ctx, th, "PASS", cx, cy - 4 * U, 150 * U, { align: "center", maxW: R * 1.3, seed: 88 });
        ransomRun(ctx, th, "IT ON", cx, cy + 176 * U, 150 * U, { align: "center", maxW: R * 1.3, seed: 97 });
        ctx.restore();
      }
      if (info.scene === "title" || info.scene === "closing") statement(ctx, S, th, info.scene, info);
      ctx.restore();
    },
    scenes: {
      chart: pageScene("chart", chartDraw), object: pageScene("object", objectDraw), people: pageScene("people", peopleDraw),
      process: pageScene("process", processDraw), compare: pageScene("compare", compareDraw),
    },
  };
});
