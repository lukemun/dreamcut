// String Art: a felt board in a wooden frame, brass nails and coloured thread. Every picture is
// wound from straight chords between nails (roses, parabolic fans, zigzag weaves, tangles); the
// lettering is woven too. Scenes change with one taut thread swept across the board, snagging the old strings, while
// a morphing rose, glints and plucked strings keep moving through every hold. All motifs are original.
// Frames are pure functions of time; texture uses seeded rng only.
window.DreamcutMotion.register("string-art", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const inout = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const fmod = (a, b) => ((a % b) + b) % b;
  const tri = (v) => { v = fmod(v, 1); return v < 0.5 ? v * 2 : 2 - v * 2; };
  const stagger = (p, i, n, sp = 0.5) => ease((p - (i / Math.max(1, n)) * sp) / (1 - sp));
  const FONT = "'Avenir Next', 'Trebuchet MS', 'Helvetica Neue', Arial, sans-serif";

  // ---- colour ------------------------------------------------------------------------------------
  const LC = {};
  function lite(hex, k) {
    const key = hex + k;
    if (LC[key]) return LC[key];
    let r, g, b;
    const m = /^rgba?\(([^)]+)\)/.exec(String(hex));
    if (m) [r, g, b] = m[1].split(",").map(Number);
    else { const n = parseInt(String(hex).slice(1), 16); r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255; }
    const f = (v) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k));
    return (LC[key] = `rgb(${f(r)},${f(g)},${f(b)})`);
  }
  function pal(S) {
    if (S._sa) return S._sa;
    const L = S.look, T = L.thr, acc = S.accent;
    return (S._sa = { ...T, accent: acc, board: L.board, wood: L.wood, sh: L.shade, tagBg: L.tagBg, tagInk: L.tagInk, disc: L.disc,
      cols: [acc, T.gold, T.teal, T.violet, T.rose], cool: [T.teal, T.gold, T.violet, T.rose, T.main] });
  }
  const shade = (C, a) => `rgba(${C.sh},${a})`;

  // ---- geometry that comes out as chords -------------------------------------------------------------
  const memo = new Map();
  const once = (key, make) => { if (!memo.has(key)) { if (memo.size > 400) memo.clear(); memo.set(key, make()); } return memo.get(key); };
  function ringPts(cx, cy, r, n, rot = 0) { const o = []; for (let i = 0; i < n; i++) { const a = rot + (TAU * i) / n; o.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } return o; }
  // Chord i runs from nail i to the point m times as far round the ring; a fractional m morphs the curve.
  function rose(cx, cy, r, n, m, rot = 0) {
    const o = [];
    for (let i = 0; i < n; i++) { const a = rot + (TAU * i) / n, b = rot + (TAU * i * m) / n; o.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cx + Math.cos(b) * r, cy + Math.sin(b) * r); }
    return o;
  }
  // Every nail to the one `skip` places on: the chords leave a bare disc inside a woven ring.
  function ringBand(cx, cy, r, n, skip, rot = 0) {
    const o = [];
    for (let i = 0; i < n; i++) { const a = rot + (TAU * i) / n, b = rot + (TAU * (i + skip)) / n; o.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cx + Math.cos(b) * r, cy + Math.sin(b) * r); }
    return o;
  }
  // Nail i on one line to nail n-i on the other: the envelope is a parabola.
  function fan(x0, y0, x1, y1, x2, y2, n) {
    const o = [];
    for (let i = 0; i <= n; i++) { const a = i / n, b = 1 - a; o.push(lerp(x0, x1, a), lerp(y0, y1, a), lerp(x0, x2, b), lerp(y0, y2, b)); }
    return o;
  }
  function ladder(ax, ay, bx, by, cx, cy, dx, dy, n, skew = 0) {
    const o = [];
    for (let i = 0; i <= n; i++) { const a = i / n, b = clamp(a + skew / n, 0, 1); o.push(lerp(ax, bx, a), lerp(ay, by, a), lerp(cx, dx, b), lerp(cy, dy, b)); }
    return o;
  }
  // Rows of nails down two edges; thread crosses between them (X weave).
  function weave(x0, x1, yBase, h, step, kind = "x") {
    const rows = Math.max(2, Math.round(h / step) + 1), o = [], rails = [];
    const ys = (j) => yBase - (h * j) / (rows - 1);
    for (let j = 0; j < rows - 1; j++) {
      if (kind === "x") o.push(x0, ys(j), x1, ys(j + 1), x1, ys(j), x0, ys(j + 1));
      else o.push(x0, ys(j), x1, ys(j + 1));
      rails.push(x0, ys(j), x0, ys(j + 1), x1, ys(j), x1, ys(j + 1));
    }
    const nl = [];
    for (let j = 0; j < rows; j++) nl.push(x0, ys(j), x1, ys(j));
    return { chords: o, rails, nails: nl, rows };
  }

  // ---- drawing threads and nails -------------------------------------------------------------------
  // Draw the first n chords of a flat [x1,y1,x2,y2,...] list: shadow, body and a lit edge. The last chord
  // is part-drawn. Returns the winding tip. o.sheen sweeps a bright patch along the winding order.
  function strands(g, S, segs, n, color, w, o = {}) {
    const total = segs.length / 4, C = pal(S), u = S.u;
    n = Math.min(n, total);
    if (n <= 0) return null;
    const full = Math.floor(n), part = n - full, m = Math.ceil(n);
    const run = (dx, dy, from = 0, to = m) => {
      g.beginPath();
      for (let i = from; i < to; i++) {
        const k = i < full ? 1 : part, x1 = segs[i * 4] + dx, y1 = segs[i * 4 + 1] + dy;
        g.moveTo(x1, y1);
        g.lineTo(x1 + (segs[i * 4 + 2] - segs[i * 4]) * k, y1 + (segs[i * 4 + 3] - segs[i * 4 + 1]) * k);
      }
    };
    g.save();
    g.lineCap = "round";
    if (o.shadow !== false) { run(1.5 * u, 2.6 * u); g.strokeStyle = shade(C, 0.34); g.lineWidth = w * 1.55; g.stroke(); }
    run(0, 0);
    g.strokeStyle = color; g.lineWidth = w;
    if (o.glow) { g.shadowColor = color; g.shadowBlur = o.glow; }
    g.stroke();
    g.shadowBlur = 0;
    run(-0.45 * u, -0.6 * u);
    g.strokeStyle = lite(color, 0.6); g.globalAlpha = 0.55; g.lineWidth = Math.max(0.8, w * 0.34); g.stroke();
    if (o.sheen !== undefined) {
      const c = o.sheen * (total + 10) - 5, a = Math.max(0, Math.floor(c - 4)), b = Math.min(m, Math.ceil(c + 4));
      if (b > a) { run(0, 0, a, b); g.strokeStyle = "rgba(255,255,255,0.95)"; g.globalAlpha = 0.5; g.lineWidth = w * 0.9; g.stroke(); }
    }
    g.restore();
    const li = Math.min(m, total) - 1, k = li < full ? 1 : part;
    return { x: segs[li * 4] + (segs[li * 4 + 2] - segs[li * 4]) * k, y: segs[li * 4 + 1] + (segs[li * 4 + 3] - segs[li * 4 + 1]) * k };
  }
  // A thread laid along a polyline (flat x,y list), same three-pass look.
  function line(g, S, pts, color, w, o = {}) {
    const C = pal(S), u = S.u;
    const run = (dx, dy) => { g.beginPath(); g.moveTo(pts[0] + dx, pts[1] + dy); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i] + dx, pts[i + 1] + dy); };
    g.save(); g.lineCap = "round"; g.lineJoin = "round";
    if (o.shadow !== false) { run(1.5 * u, 2.6 * u); g.strokeStyle = shade(C, 0.34); g.lineWidth = w * 1.55; g.stroke(); }
    run(0, 0); g.strokeStyle = color; g.lineWidth = w; if (o.glow) { g.shadowColor = color; g.shadowBlur = o.glow; } g.stroke(); g.shadowBlur = 0;
    run(-0.45 * u, -0.6 * u); g.strokeStyle = lite(color, 0.6); g.globalAlpha = 0.55; g.lineWidth = Math.max(0.8, w * 0.34); g.stroke();
    g.restore();
  }
  // Part of a polyline: the first q of its length.
  function partOf(pts, q) {
    if (q >= 1) return pts;
    let len = 0;
    for (let i = 2; i < pts.length; i += 2) len += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
    let left = len * q;
    const o = [pts[0], pts[1]];
    for (let i = 2; i < pts.length; i += 2) {
      const d = Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
      if (d >= left) { const k = d ? left / d : 0; o.push(pts[i - 2] + (pts[i] - pts[i - 2]) * k, pts[i - 1] + (pts[i + 1] - pts[i - 1]) * k); return o; }
      left -= d; o.push(pts[i], pts[i + 1]);
    }
    return o;
  }
  const pluck = (t, ph, period = 2.3) => { const x = fmod(t + ph, period); return Math.exp(-2.4 * x) * Math.sin(x * 34); };
  // A taut string between two nails that a finger has just plucked.
  function taut(x1, y1, x2, y2, amp, n = 30) {
    const o = [], L = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / L, ny = (x2 - x1) / L;
    for (let i = 0; i <= n; i++) { const s = i / n, d = Math.sin(Math.PI * s) * amp; o.push(lerp(x1, x2, s) + nx * d, lerp(y1, y2, s) + ny * d); }
    return o;
  }
  // The piece of a polyline between fractions a and b of its length.
  const sliceOf = (pts, a, b, n = 14) => { const o = []; for (let i = 0; i <= n; i++) { const q = pointAlong(pts, lerp(a, b, i / n)); o.push(q.x, q.y); } return o; };
  const pointAlong = (pts, s) => {
    let len = 0; const L = [];
    for (let i = 2; i < pts.length; i += 2) { len += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]); L.push(len); }
    let want = len * clamp(s);
    for (let i = 0; i < L.length; i++) if (want <= L[i]) { const d = L[i] - (i ? L[i - 1] : 0) || 1, k = 1 - (L[i] - want) / d; return { x: lerp(pts[i * 2], pts[i * 2 + 2], k), y: lerp(pts[i * 2 + 1], pts[i * 2 + 3], k) }; }
    return { x: pts[pts.length - 2], y: pts[pts.length - 1] };
  };

  function nails(g, S, pts, r, count = Infinity) {
    const C = pal(S), n = Math.min(count, pts.length / 2);
    if (n <= 0) return;
    const circles = (dx, dy, rr, from = 0) => { g.beginPath(); for (let i = from; i < n; i++) { g.moveTo(pts[i * 2] + dx + rr, pts[i * 2 + 1] + dy); g.arc(pts[i * 2] + dx, pts[i * 2 + 1] + dy, rr, 0, TAU); } };
    g.save();
    circles(r * 0.4, r * 0.7, r * 1.05); g.fillStyle = shade(C, 0.45); g.fill();
    circles(0, 0, r); g.fillStyle = C.brass; g.fill();
    circles(0, 0, r); g.strokeStyle = shade(C, 0.5); g.lineWidth = Math.max(0.8, r * 0.18); g.stroke();
    circles(-r * 0.28, -r * 0.3, r * 0.42); g.fillStyle = lite(C.brass, 0.75); g.fill();
    g.restore();
  }
  // A bead that glows: used for the winding tip and the shuttles that run along taut threads.
  function bead(g, S, x, y, r, color, a = 1) {
    const C = pal(S);
    g.save(); g.globalAlpha = a;
    const gr = g.createRadialGradient(x, y, 0, x, y, r * 3.2);
    gr.addColorStop(0, hexA(color.startsWith("#") ? color : C.main, 0.75)); gr.addColorStop(1, hexA(color.startsWith("#") ? color : C.main, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 3.2, 0, TAU); g.fill();
    g.fillStyle = C.brass; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,255,255,0.9)"; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, TAU); g.fill();
    g.restore();
  }
  function sparkle(g, x, y, r, a, color) {
    if (a <= 0) return;
    g.save(); g.globalAlpha = a; g.strokeStyle = color; g.lineWidth = Math.max(1, r * 0.16); g.lineCap = "round";
    g.beginPath(); g.moveTo(x - r, y); g.lineTo(x + r, y); g.moveTo(x, y - r); g.lineTo(x, y + r);
    g.moveTo(x - r * 0.45, y - r * 0.45); g.lineTo(x + r * 0.45, y + r * 0.45); g.moveTo(x + r * 0.45, y - r * 0.45); g.lineTo(x - r * 0.45, y + r * 0.45);
    g.stroke(); g.restore();
  }
  function rr(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  const rrPts = (x, y, w, h, r, n = 6) => {
    const o = [], arc = (cx, cy, a0) => { for (let i = 0; i <= n; i++) { const a = a0 + (Math.PI / 2) * (i / n); o.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } };
    arc(x + w - r, y + r, -Math.PI / 2); arc(x + w - r, y + h - r, 0); arc(x + r, y + h - r, Math.PI / 2); arc(x + r, y + r, Math.PI);
    o.push(o[0], o[1]);
    return o;
  };

  // ---- woven lettering ----------------------------------------------------------------------------------
  // Letters are a dark inked base with thread hatched across them in two directions, a thin edge thread,
  // and a second cached layer (the sheen) that a bright band travels across.
  const mc = document.createElement("canvas").getContext("2d");
  const TT = new Map();
  const font = (size, w = 800) => `${w} ${size}px ${FONT}`;
  function wrapLines(text, size, width, weight) {
    mc.font = font(size, weight);
    const words = String(text).split(/\s+/).filter(Boolean), out = [];
    let cur = "";
    for (const w of words) { const t = cur ? cur + " " + w : w; if (mc.measureText(t).width > width && cur) { out.push(cur); cur = w; } else cur = t; }
    if (cur) out.push(cur);
    return out;
  }
  function fitHead(text, width, max, min, maxLines, weight = 800) {
    let size = max, lines = wrapLines(text, size, width, weight);
    while ((lines.length > maxLines || Math.max(...lines.map((l) => mc.measureText(l).width)) > width) && size > min) { size = Math.max(min, size * 0.94); lines = wrapLines(text, size, width, weight); if (size === min) break; }
    return { lines, size };
  }
  function woven(S, lines, size, o = {}) {
    const C = pal(S), u = S.u, key = [lines.join("|"), Math.round(size), o.col || "", o.align || "", S.W, C.main, C.board].join("~");
    if (TT.has(key)) return TT.get(key);
    if (TT.size > 160) TT.clear();
    const weight = o.weight || 800, lh = size * 1.06, pad = Math.round(size * 0.24 + 6 * u);
    mc.font = font(size, weight);
    const ws = lines.map((l) => mc.measureText(l).width), maxw = Math.max(...ws);
    const W = Math.ceil(maxw + pad * 2), H = Math.ceil(lines.length * lh + pad * 2);
    const mk = () => { const c = document.createElement("canvas"); c.width = W; c.height = H; return c; };
    const place = (g) => { g.font = font(size, weight); g.textBaseline = "alphabetic"; g.textAlign = "left"; };
    const textAt = (g, fn) => lines.forEach((l, i) => fn(l, pad + (o.align === "center" ? (maxw - ws[i]) / 2 : o.align === "right" ? maxw - ws[i] : 0), pad + size * 0.84 + i * lh));
    const mask = mk(), mg = mask.getContext("2d");
    place(mg); mg.fillStyle = "#fff"; textAt(mg, (l, x, y) => mg.fillText(l, x, y));
    const hatch = (g, col, sp, wd, dir) => {
      g.strokeStyle = col; g.lineWidth = wd; g.beginPath();
      if (dir > 0) for (let x = -H; x < W + H; x += sp) { g.moveTo(x, H); g.lineTo(x + H * 0.8, 0); }
      else for (let x = -H; x < W + H * 1.4; x += sp) { g.moveTo(x, 0); g.lineTo(x + H * 1.3, H); }
      g.stroke();
    };
    // Letters are solid thread colour wound tight: fine dark grooves and lit ridges at a steep angle read as
    // close wraps without striping the type; a dark rim keeps them off the board's own threads.
    const sp = Math.max(2.6 * u, size * 0.034), col = o.col || C.main, alt = o.alt || C.alt;
    const th = mk(), tg = th.getContext("2d");
    tg.fillStyle = col; tg.fillRect(0, 0, W, H);
    tg.globalAlpha = 0.28; hatch(tg, shade(C, 1), sp, sp * 0.26, 1);
    tg.globalAlpha = 0.45; tg.save(); tg.translate(-sp * 0.4, 0); hatch(tg, lite(col, 0.55), sp, sp * 0.18, 1); tg.restore();
    tg.globalAlpha = 0.5; hatch(tg, alt, sp * 9, sp * 0.3, 1);
    tg.globalAlpha = 1; tg.globalCompositeOperation = "destination-in"; tg.drawImage(mask, 0, 0);
    const sh = mk(), sg = sh.getContext("2d");
    hatch(sg, "#ffffff", sp, sp * 0.5, 1);
    sg.globalCompositeOperation = "destination-in"; sg.drawImage(mask, 0, 0);
    const out = mk(), g = out.getContext("2d");
    place(g); g.lineJoin = "round";
    g.save(); g.shadowColor = shade(C, 0.6); g.shadowBlur = size * 0.1; g.shadowOffsetY = size * 0.05; g.shadowOffsetX = size * 0.02;
    g.strokeStyle = C.disc; g.lineWidth = size * 0.09; textAt(g, (l, x, y) => g.strokeText(l, x, y));
    g.fillStyle = C.disc; textAt(g, (l, x, y) => g.fillText(l, x, y)); g.restore();
    g.drawImage(th, 0, 0);
    g.strokeStyle = lite(col, -0.35); g.lineWidth = Math.max(1.2 * u, size * 0.014);
    textAt(g, (l, x, y) => g.strokeText(l, x, y));
    const r = { out, sheen: sh, W, H, pad, maxw, lh, lines, size };
    TT.set(key, r);
    return r;
  }
  // Draw woven lettering with its block's top-left at (x, y); q reveals it left to right.
  function drawWoven(g, S, tt, x, y, q, t, o = {}) {
    if (q <= 0) return;
    const ax = o.anchor === "center" ? -tt.maxw / 2 : o.anchor === "right" ? -tt.maxw : 0, X = x + ax - tt.pad, Y = y - tt.pad;
    g.save();
    if (o.alpha !== undefined) g.globalAlpha = o.alpha;
    const front = X + tt.W * lerp(-0.1, 1.08, q), sl = tt.H * 0.3;
    if (q < 1) { g.beginPath(); g.moveTo(X - 40, Y - 4); g.lineTo(front + sl, Y - 4); g.lineTo(front - sl, Y + tt.H + 4); g.lineTo(X - 40, Y + tt.H + 4); g.closePath(); g.clip(); }
    g.drawImage(tt.out, X, Y);
    if (q >= 0.9) {
      const band = tt.W * 0.2, s = fmod(t * 0.42 + (o.ph || 0), 2.0) * (tt.W + band * 2) / 1.0 - band * 1.5;
      g.save(); g.beginPath(); g.moveTo(X + s, Y); g.lineTo(X + s + band, Y); g.lineTo(X + s + band - sl, Y + tt.H); g.lineTo(X + s - sl, Y + tt.H); g.closePath(); g.clip();
      g.globalAlpha *= 0.8; g.drawImage(tt.sheen, X, Y); g.restore();
    }
    g.restore();
    if (q < 1) bead(g, S, front, Y + tt.H * 0.52, 7 * S.u, pal(S).gold, 1);
  }
  function headBlock(S, text, w, max, min, maxLines, o = {}) {
    const key = ["h", text, w, max, min, maxLines, o.align].join("|");
    return once(key, () => { const f = fitHead(text, w, max, min, maxLines); return woven(S, f.lines, f.size, o); });
  }
  function number(g, S, text, cx, cy, size, q, t, o = {}) {
    const tt = woven(S, [text], size, { align: "center", col: o.col, alt: o.alt });
    drawWoven(g, S, tt, cx, cy - size * 0.5, q, t, { anchor: "center", ph: o.ph, alpha: o.alpha });
    return tt;
  }
  const fmt = (v, d, k = 1) => { const dec = Math.abs((Number(v) || 0) % 1) > 0.001 ? 1 : 0; return window.DreamcutMotion.formatNumber(v * k, dec, (d && d.prefix) || "", (d && d.suffix) || ""); };

  // ---- hanging brass tags (labels) ---------------------------------------------------------------------
  function tagLayout(S, text, size, maxW) {
    return once(["tag", text, Math.round(size), Math.round(maxW || 0), S.W].join("|"), () => {
      let sz = size, lines = [String(text)];
      mc.font = font(sz, 800);
      const wd = (ls) => Math.max(...ls.map((l) => mc.measureText(l).width));
      if (maxW && wd(lines) > maxW - 56 * S.u) {
        const words = String(text).split(/\s+/);
        if (words.length > 1) {
          let best = null;
          for (let i = 1; i < words.length; i++) { const ls = [words.slice(0, i).join(" "), words.slice(i).join(" ")]; const w = wd(ls); if (!best || w < best.w) best = { ls, w }; }
          lines = best.ls;
        }
        while (wd(lines) > maxW - 56 * S.u && sz > 42 * S.u) { sz *= 0.96; mc.font = font(sz, 800); }
      }
      const pad = 26 * S.u;
      return { lines, size: sz, w: wd(lines) + pad * 2, h: lines.length * sz * 1.14 + pad * 0.9 };
    });
  }
  function tag(g, S, text, x, top, q, t, o = {}) {
    if (q <= 0 || !text) return null;
    const u = S.u, C = pal(S), L = tagLayout(S, text, (o.size || 46) * u, o.maxW), { w, h } = L;
    const cx = o.left ? x + w / 2 : x, e = ease(q), drop = (1 - e) * -60 * u;
    const hx = cx, hy = top - 26 * u;
    const sway = Math.sin(t * 1.5 + (o.ph || 0)) * 0.03 * (o.sway ?? 1) + (1 - e) * 0.3;
    g.save(); g.globalAlpha = clamp(q * 3);
    g.translate(hx, hy + drop); g.rotate(sway);
    const ty = 26 * u;
    g.strokeStyle = shade(C, 0.3); g.lineWidth = 3 * u; g.lineCap = "round"; g.beginPath(); g.moveTo(1.5 * u, 3 * u); g.lineTo(-w * 0.34 + 1.5 * u, ty + 3 * u); g.moveTo(1.5 * u, 3 * u); g.lineTo(w * 0.34 + 1.5 * u, ty + 3 * u); g.stroke();
    g.strokeStyle = o.thread || C.main; g.lineWidth = 2.4 * u; g.beginPath(); g.moveTo(0, 0); g.lineTo(-w * 0.34, ty); g.moveTo(0, 0); g.lineTo(w * 0.34, ty); g.stroke();
    rr(g, -w / 2 + 3 * u, ty + 6 * u, w, h, 12 * u); g.fillStyle = shade(C, 0.4); g.fill();
    rr(g, -w / 2, ty, w, h, 12 * u);
    const gr = g.createLinearGradient(0, ty, 0, ty + h); gr.addColorStop(0, lite(o.fill || C.tagBg, 0.35)); gr.addColorStop(1, o.fill || C.tagBg);
    g.fillStyle = gr; g.fill();
    if (o.glow) { g.save(); g.shadowColor = o.glow; g.shadowBlur = (16 + 6 * Math.sin(t * 3)) * u; g.strokeStyle = o.glow; g.lineWidth = 5 * u; g.stroke(); g.restore(); rr(g, -w / 2 - 8 * u, ty - 8 * u, w + 16 * u, h + 16 * u, 16 * u); g.save(); g.setLineDash([10 * u, 7 * u]); g.lineDashOffset = -t * 30 * u; g.strokeStyle = o.glow; g.lineWidth = 2.6 * u; g.stroke(); g.restore(); rr(g, -w / 2, ty, w, h, 12 * u); }
    else { g.strokeStyle = o.edge || C.brass; g.lineWidth = 3 * u; g.stroke(); }
    g.fillStyle = o.ink || C.tagInk; g.font = font(L.size, 800); g.textAlign = "center"; g.textBaseline = "middle";
    L.lines.forEach((l, i) => g.fillText(l, 0, ty + h / 2 + (i - (L.lines.length - 1) / 2) * L.size * 1.14 + L.size * 0.02));
    g.restore();
    nails(g, S, [hx, hy + drop], 7 * u);
    return { cx, w, h, hang: { x: hx, y: hy }, top, bottom: top + ty + h };
  }

  // ---- the board ---------------------------------------------------------------------------------------
  function boardTile(S) {
    const C = pal(S), tex = S.look.texture, key = [S.W, S.H, C.board, C.wood, tex].join();
    return once("board" + key, () => {
      const { W, H, u } = S, c = document.createElement("canvas"); c.width = W; c.height = H;
      const g = c.getContext("2d"), r = rng(76), F = 34 * u;
      g.fillStyle = C.board; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 34; i++) {
        const x = r() * W, y = r() * H, rad = (160 + r() * 360) * u, gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, r() < 0.5 ? `rgba(255,255,255,${0.035 * (0.4 + tex)})` : `rgba(0,0,0,${0.06 * (0.4 + tex)})`); gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
      }
      const dots = Math.round(((W * H) / 520) * (0.2 + 0.8 * tex));
      for (let i = 0; i < dots; i++) { g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.02 + r() * 0.06})` : `rgba(0,0,0,${0.04 + r() * 0.08})`; g.fillRect(r() * W, r() * H, 1.4 * u, 1.4 * u); }
      g.lineCap = "round";
      for (let i = 0, n = Math.round(2600 * (0.2 + 0.8 * tex)); i < n; i++) {
        const x = r() * W, y = r() * H, a = r() * TAU, l = (4 + r() * 10) * u;
        g.strokeStyle = r() < 0.5 ? `rgba(255,255,255,${0.03 + r() * 0.05})` : `rgba(0,0,0,${0.05 + r() * 0.06})`; g.lineWidth = 0.9 * u;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.6, y + Math.sin(a + 0.6) * l * 0.6, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
      const vg = g.createRadialGradient(W * 0.5, H * 0.45, Math.min(W, H) * 0.25, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.62);
      vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, shade(C, 0.5)); g.fillStyle = vg; g.fillRect(0, 0, W, H);
      // wooden frame with grain, a lit bevel and a shadow cast onto the felt
      const strip = (x, y, w, h, vertical) => {
        const gr = vertical ? g.createLinearGradient(x, 0, x + w, 0) : g.createLinearGradient(0, y, 0, y + h);
        gr.addColorStop(0, lite(C.wood, 0.28)); gr.addColorStop(0.5, C.wood); gr.addColorStop(1, lite(C.wood, -0.38));
        g.fillStyle = gr; g.fillRect(x, y, w, h);
        for (let i = 0, n = Math.round((vertical ? w : h) / (2.2 * u)); i < n; i++) {
          g.strokeStyle = r() < 0.5 ? "rgba(0,0,0,0.14)" : "rgba(255,255,255,0.07)"; g.lineWidth = (0.6 + r() * 1.2) * u; g.beginPath();
          if (vertical) { const gx = x + (i + 0.5) * (w / n); g.moveTo(gx, y); for (let s = 1; s <= 10; s++) g.lineTo(gx + Math.sin(s + i) * 2.5 * u, y + (h * s) / 10); }
          else { const gy = y + (i + 0.5) * (h / n); g.moveTo(x, gy); for (let s = 1; s <= 14; s++) g.lineTo(x + (w * s) / 14, gy + Math.sin(s * 0.8 + i) * 2 * u); }
          g.stroke();
        }
      };
      const sd = g.createLinearGradient(0, F, 0, F + 30 * u); sd.addColorStop(0, "rgba(0,0,0,0.5)"); sd.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = sd; g.fillRect(F, F, W - F * 2, 30 * u);
      const sl = g.createLinearGradient(F, 0, F + 30 * u, 0); sl.addColorStop(0, "rgba(0,0,0,0.45)"); sl.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = sl; g.fillRect(F, F, 30 * u, H - F * 2);
      strip(0, 0, W, F, false); strip(0, H - F, W, F, false); strip(0, 0, F, H, true); strip(W - F, 0, F, H, true);
      g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = 2 * u; g.strokeRect(F, F, W - F * 2, H - F * 2);
      g.strokeStyle = "rgba(255,255,255,0.22)"; g.lineWidth = 1.5 * u; g.strokeRect(1, 1, W - 2, H - 2);
      for (const [x, y] of [[F / 2, F / 2], [W - F / 2, F / 2], [F / 2, H - F / 2], [W - F / 2, H - F / 2]]) {
        g.fillStyle = C.brass; g.beginPath(); g.arc(x, y, 8 * u, 0, TAU); g.fill();
        g.strokeStyle = "rgba(0,0,0,0.55)"; g.lineWidth = 1.5 * u; g.stroke();
        g.beginPath(); g.moveTo(x - 5 * u, y - 2 * u); g.lineTo(x + 5 * u, y + 2 * u); g.stroke();
      }
      return c;
    });
  }
  function glints(S) {
    return once(`gl${S.W}x${S.H}`, () => { const r = rng(311), o = []; for (let i = 0; i < 44; i++) o.push({ x: r() * S.W, y: r() * S.H, vx: (6 + r() * 22) * (r() < 0.5 ? -1 : 1), amp: (10 + r() * 40) * S.u, ph: r() * TAU, sz: (6 + r() * 12) * S.u, c: Math.floor(r() * 4) }); return o; });
  }
  // The world under every scene: board, frame, ghost roses that never stop morphing, corner fans, glints.
  // Quiet the background lattice behind a text block: a soft pool of bare felt.
  function hush(g, S, x, y, w, h, a = 0.62) {
    const C = pal(S), cx = x + w / 2, cy = y + h / 2, rx = w / 2 + 70 * S.u, ry = h / 2 + 60 * S.u;
    g.save(); g.translate(cx, cy); g.scale(1, ry / rx);
    const gr = g.createRadialGradient(0, 0, rx * 0.62, 0, 0, rx);
    gr.addColorStop(0, hexA(C.board, a)); gr.addColorStop(0.55, hexA(C.board, a)); gr.addColorStop(1, hexA(C.board, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill();
    g.restore();
  }
  function ambient(g, S, t) {
    const { W, H, u } = S, C = pal(S), tex = S.look.texture, F = 34 * u;
    g.drawImage(boardTile(S), 0, 0);
    // pegs
    const pegs = [];
    for (let y = F + 70 * u; y < H - F; y += 118 * u) for (let x = F + 70 * u; x < W - F; x += 118 * u) pegs.push(x, y);
    g.save(); g.globalAlpha = 0.3 + 0.1 * Math.sin(t * 1.2); nails(g, S, pegs, 2.4 * u); g.restore();
    // two ghost roses wander the board
    g.save(); g.lineCap = "round";
    const R = Math.min(W, H) * 0.5;
    for (let k = 0; k < 2; k++) {
      const cx = W * (0.5 + (k ? -0.42 : 0.4) * Math.sin(t * 0.09 + k * 2.1 + 1)), cy = H * (0.5 + 0.38 * Math.cos(t * 0.07 + k * 1.3)), m = 2 + 1.6 * (0.5 - 0.5 * Math.cos(t * 0.21 + k * 2)), rot = t * (k ? -0.05 : 0.04);
      const segs = rose(cx, cy, R * (k ? 0.62 : 0.78), 84, m, rot);
      g.globalAlpha = 0.12; strands(g, S, segs, 84, k ? C.teal : C.accent, 1.6 * u, { shadow: false });
      g.globalAlpha = 0.28; nails(g, S, ringPts(cx, cy, R * (k ? 0.62 : 0.78), 84, rot), 2.2 * u);
    }
    g.restore();
    // a moire of two sets of long chords, nail to nail across the whole board
    g.save(); g.lineCap = "round"; g.globalAlpha = 0.07 + 0.03 * tex;
    { const cnt = 30, kA = 0.15 + 0.55 * (0.5 + 0.5 * Math.sin(t * 0.13)), kB = 0.15 + 0.55 * (0.5 + 0.5 * Math.cos(t * 0.1 + 1)), A = [], B = [];
      for (let i = 0; i <= cnt; i++) { const f = i / cnt, x = F + (W - 2 * F) * f, x2 = F + (W - 2 * F) * lerp(f, 1 - f, kA); A.push(x, F, x2, H - F); const y = F + (H - 2 * F) * f, y2 = F + (H - 2 * F) * lerp(f, 1 - f, kB); B.push(F, y, W - F, y2); }
      strands(g, S, A, cnt + 1, C.main, 1.3 * u, { shadow: false }); strands(g, S, B, cnt + 1, C.cols[2], 1.3 * u, { shadow: false }); }
    g.restore();
    // corner fans, wound in over the first seconds and then shimmering
    const fr = [[F, F, 1, 1, 110], [W - F, F, -1, 1, 250], [F, H - F, 1, -1, 250], [W - F, H - F, -1, -1, 300]];
    fr.forEach(([x, y, sx, sy, rad], i) => {
      const r = rad * u, segs = fan(x, y, x + sx * r, y, x, y + sy * r, 18), q = ease((t - i * 0.12) / 1.3);
      g.save(); g.globalAlpha = 0.9;
      strands(g, S, segs, segs.length / 4 * q, C.cols[(i + 1) % 5], 1.8 * u, { sheen: fmod(t * 0.28 + i * 0.27, 1.5) / 1.5 });
      nails(g, S, [x + sx * r, y, x, y + sy * r, x + sx * r * 0.5, y, x, y + sy * r * 0.5], 4.4 * u, 4 * q);
      g.restore();
    });
    // glints drifting over the felt
    for (const s of glints(S)) {
      const x = fmod(s.x + t * s.vx, W), y = s.y + Math.sin(t * 0.5 + s.ph) * s.amp, a = Math.pow(0.5 + 0.5 * Math.sin(t * (1.4 + (s.ph % 1)) + s.ph * 3), 3);
      sparkle(g, x, y, s.sz * (0.6 + a * 0.6), a * 0.65 * (0.5 + 0.5 * tex), s.c % 2 ? C.main : C.gold);
    }
  }

  // ---- scene changes: one taut thread is drawn across the board ----------------------------------------------
  // Ahead of the thread the old picture unwinds; behind it the next one winds on. The thread catches the old
  // strings on its way: each snagged string stretches from its nail to the moving thread until it snaps free.
  function sweep(S, trans) {
    return once(`sw${trans}|${S.W}|${S.H}`, () => {
      const { W, H, u } = S, dir = trans % 2 ? -1 : 1, tilt = (trans % 3 === 1 ? -1 : 1) * (S.tall ? 0.1 : 0.17);
      const nx = dir * Math.cos(tilt), ny = Math.sin(tilt);
      const a = [0, W * nx, H * ny, W * nx + H * ny], r = rng(500 + trans * 17), pins = [];
      for (let i = 0; i < 40; i++) pins.push({ x: (0.06 + r() * 0.88) * W, y: (0.14 + r() * 0.78) * H, c: i % 5, o: (r() - 0.5) * 160 * u, L: (260 + r() * 360) * u });
      return { nx, ny, tx: -ny, ty: nx, amin: Math.min(...a) - 40 * u, amax: Math.max(...a) + 40 * u, F: W + H, pins };
    });
  }
  const edgeAt = (G, k) => lerp(G.amin, G.amax, inout(k));
  function region(g, G, c, side) {
    const px = G.nx * c, py = G.ny * c, F = G.F, s = side === "in" ? -1 : 1;
    g.beginPath();
    g.moveTo(px + G.tx * F, py + G.ty * F); g.lineTo(px - G.tx * F, py - G.ty * F);
    g.lineTo(px - G.tx * F + G.nx * F * s, py - G.ty * F + G.ny * F * s); g.lineTo(px + G.tx * F + G.nx * F * s, py + G.ty * F + G.ny * F * s);
    g.closePath();
  }
  function clipSide(g, S, trans, k, side) {
    const G = sweep(S, trans);
    region(g, G, edgeAt(G, k), side); g.clip();
  }
  function ribbon(g, S, trans, k, t) {
    if (k <= 0 || k >= 1) return;
    const G = sweep(S, trans), C = pal(S), u = S.u, e = edgeAt(G, k), Fr = 34 * u;
    // where the thread meets the top and bottom rails of the frame
    const sAt = (y) => (y - G.ny * e) / G.ty, P = (s) => [G.nx * e + G.tx * s, G.ny * e + G.ty * s];
    const [x1, y1] = P(sAt(Fr * 0.5)), [x2, y2] = P(sAt(S.H - Fr * 0.5));
    const vib = 12 * u * Math.sin(k * 38) * Math.sin(Math.PI * k);
    // snagged strings trail behind the thread
    g.save(); g.beginPath(); g.rect(Fr, Fr, S.W - Fr * 2, S.H - Fr * 2); g.clip();
    for (const p of G.pins) {
      const d = p.x * G.nx + p.y * G.ny - e;
      if (d > 0 || -d > p.L) continue;
      const s = p.x * G.tx + p.y * G.ty, f = -d / p.L, [hx, hy] = P(s + p.o * (1 - f * 0.5)), [h2x, h2y] = P(s + p.o * (1 - f * 0.5) + 46 * u);
      g.save(); g.globalAlpha = 1 - f * f;
      line(g, S, [p.x, p.y, hx, hy, h2x, h2y, p.x, p.y], C.cols[p.c], 3.4 * u);
      g.restore();
      nails(g, S, [p.x, p.y], 5 * u);
      if (f > 0.82) sparkle(g, hx, hy, 18 * u, (f - 0.82) * 5, C.main);
    }
    // the next picture's nails knock in just behind the thread
    for (let i = 0; i < 9; i++) {
      const s = sAt(Fr + ((i + 0.5) / 9) * (S.H - Fr * 2)), [bx, by] = P(s), back = (60 + (i % 3) * 40) * u;
      nails(g, S, [bx - G.nx * back, by - G.ny * back], 5.6 * u);
    }
    g.restore();
    line(g, S, taut(x1, y1, x2, y2, vib, 40), C.main, 6 * u, { glow: 14 * u });
    const b = pointAlong([x1, y1, x2, y2], fmod(k * 2.2, 1)); bead(g, S, b.x, b.y, 8 * u, C.gold);
    nails(g, S, [x1, y1, x2, y2], 9 * u);
  }

  // ---- the plan the controls give ------------------------------------------------------------------------
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  const DEFAULT_HOLD = [2.4, 3.4, 3.6, 3.2, 3.6, 3.2, 2.4];
  let planMemo = null;
  function plan() {
    if (planMemo) return planMemo;
    const c = (window.__dreamcut && window.__dreamcut.controls) || {};
    const shown = ORDER.map((id, i) => ({ id, hold: Number(c[id + "_hold"] ?? DEFAULT_HOLD[i]) })).filter((s) => s.hold > 0);
    let acc = 0;
    shown.forEach((s) => { s.start = acc; acc += s.hold; });
    return (planMemo = { shown, ids: shown.map((s) => s.id), change: Number(c.change ?? 0.45), c });
  }
  const textOf = (id) => { const el = document.getElementById(id); return el ? el.textContent : ""; };

  // A dark felt patch stitched to the board behind a headline, pinned at its corners.
  function plate(g, S, x, y, w, h, q, t) {
    if (q <= 0) return;
    const C = pal(S), u = S.u, a = clamp(q * 2.5), X = x - 18 * u, Y = y - 6 * u, Wd = (w + 36 * u) * lerp(0.86, 1, ease(q * 1.6)), Hd = h + 12 * u;
    hush(g, S, X, Y, Wd, Hd, 0.7 * a);
    g.save(); g.globalAlpha = a;
    rr(g, X + 4 * u, Y + 7 * u, Wd, Hd, 20 * u); g.fillStyle = shade(C, 0.45); g.fill();
    rr(g, X, Y, Wd, Hd, 20 * u); g.fillStyle = hexA(C.disc, 0.9); g.fill();
    rr(g, X + 10 * u, Y + 10 * u, Wd - 20 * u, Hd - 20 * u, 13 * u);
    g.setLineDash([14 * u, 9 * u]); g.lineDashOffset = -t * 18 * u; g.strokeStyle = hexA(C.main, 0.5); g.lineWidth = 2.4 * u; g.stroke();
    g.restore();
    nails(g, S, [X + 16 * u, Y + 16 * u, X + Wd - 16 * u, Y + 16 * u, X + 16 * u, Y + Hd - 16 * u, X + Wd - 16 * u, Y + Hd - 16 * u], 5.6 * u, a > 0.3 ? 4 : 0);
  }
  // Headline drawn at the page's headline position (the page's own text stays in the markup, unseen).
  function heading(g, S, id, q, t) {
    const u = S.u, side = (S.tall ? 90 : 140) * u, top = (S.tall ? 170 : 96) * u, w = S.W - side * 2;
    const tt = headBlock(S, textOf(id + "-title"), w, (S.tall ? 76 : 72) * u, 66 * u, S.tall ? 3 : 2, {});
    plate(g, S, side - tt.pad, top - tt.pad, tt.maxw + tt.pad * 2, tt.H, q, t);
    drawWoven(g, S, tt, side, top, q, t, { ph: 0.3 });
    return tt;
  }
  // Geometry shared by the scene drawers.
  function wrapScene(id, build) {
    return (ctx, S, box, p, d, info) => {
      const P = plan(), idx = P.ids.indexOf(id), exiting = info.exit !== undefined;
      const k = exiting ? info.exit : info.local < info.change ? info.local / info.change : 1;
      const build_ = Math.max(1.0, Math.min(2.3, info.hold * 0.56));
      // leaving, the picture unwinds from its nails while the thread sweeps it away
      const pp = exiting ? 1 - 0.7 * inout(k) : clamp((info.local + 0.3) / build_);
      ctx.save();
      if (exiting) clipSide(ctx, S, idx, k, "out");
      else if (idx > 0 && k < 1) clipSide(ctx, S, idx - 1, k, "in");
      build(ctx, S, box, pp, d, info);
      ctx.restore();
      if (exiting) ribbon(ctx, S, idx, k, info.t);
      else if (idx > 0 && k < 1 && P.ids[idx - 1] === "title") ribbon(ctx, S, idx - 1, k, info.t);
    };
  }

  // ---- chart ----------------------------------------------------------------------------------------------
  function chartScene(g, S, box, pp, d, info) {
    const u = S.u, C = pal(S), t = info.t, n = d.values.length, max = Math.max(...d.values, 1);
    heading(g, S, "chart", ease(info.local / 0.7), t);
    const slot = box.w / n, barW = Math.min(slot * 0.54, 300 * u), base = box.y + box.h - 130 * u, maxH = box.h - 130 * u - 150 * u;
    // a fan of thread in the corner of the axes, behind the bars
    { const fx = box.x - 30 * u, fy = base, fh = maxH * 1.12, fw = box.w * 0.55, segs = once(`cf|${Math.round(fx)}|${Math.round(fy)}|${Math.round(fh)}`, () => fan(fx, fy, fx, fy - fh, fx + fw, fy, 22)), q = ease(span(pp, 0, 0.7));
      g.save(); g.globalAlpha = 0.6; strands(g, S, segs, segs.length / 4 * q, C.teal, 1.8 * u, { shadow: false, sheen: fmod(t * 0.3, 1.6) / 1.6 }); g.restore(); }
    // value rules: faint threads between pairs of nails
    for (let k = 1; k <= 4; k++) {
      const y = base - (maxH * k) / 4, a = ease(span(pp, 0, 0.3));
      g.save(); g.globalAlpha = 0.5;
      line(g, S, [box.x - 30 * u, y, box.x - 30 * u + (box.w + 60 * u) * a, y], hexA(C.main, 0.4), 1.8 * u, { shadow: false });
      g.restore();
      nails(g, S, [box.x - 30 * u, y, box.x + box.w + 30 * u, y], 4.4 * u, a > 0.05 ? 2 : 0);
    }
    // the baseline: taut, and plucked every few seconds
    const amp = 9 * u * pluck(t, 0.4);
    line(g, S, taut(box.x - 30 * u, base, box.x + box.w + 30 * u, base, amp, 60), C.main, 5 * u);
    nails(g, S, [box.x - 30 * u, base, box.x + box.w + 30 * u, base], 7 * u);
    const tops = [];
    // The hold is a sequence: a bright thread zig-zags up each bar in turn, then the trend thread is run
    // pin to pin across the tops, then the highlighted bar is plucked and rings until the scene leaves.
    const build_ = Math.max(1.0, Math.min(2.3, info.hold * 0.56)), b0 = 0.88 * build_ - 0.3, rem = Math.max(1.2, info.hold - b0), bk = (info.local - b0) / rem;
    const hiI = d.highlight >= 0 && d.highlight < n ? d.highlight : d.values.indexOf(max);
    const plk = bk - 0.8, ring = plk > 0 ? Math.exp(-1.6 * plk * rem) * Math.sin(plk * rem * 38) : 0;
    const pull = ease(span(bk, 0.68, 0.8));
    d.values.forEach((v, i) => {
      const cx = box.x + slot * (i + 0.5), x0 = cx - barW / 2, x1 = cx + barW / 2, h = (maxH * v) / max, hi = i === d.highlight;
      const col = hi ? C.accent : [C.teal, C.gold, C.violet, C.rose][i % 4];
      const r = ease(stagger(pp, i, n, 0.5));
      const W_ = once(`bar|${Math.round(x0)}|${Math.round(h)}|${Math.round(barW)}|${Math.round(base)}`, () => weave(x0, x1, base, h, 15 * u, "x"));
      const total = W_.chords.length / 4;
      nails(g, S, W_.nails, 4.6 * u, Math.max(2, Math.ceil(W_.nails.length / 2 * r)));
      const zq = ease(span(bk, i * 0.1, i * 0.1 + 0.2)), passing = zq > 0 && zq < 1;
      const shiver = (passing ? Math.sin(zq * 60) * 2.5 * u : 0) + (i === hiI ? ring * 14 * u : 0);
      g.save(); g.translate(shiver, 0);
      strands(g, S, W_.chords, total * r, col, 3 * u, { glow: hi ? 14 * u : 0, sheen: fmod(t * 0.42 + i * 0.21, 1.7) / 1.7 });
      strands(g, S, W_.rails, (W_.rails.length / 4) * r, lite(col, 0.45), 2.4 * u, { shadow: false });
      if (zq > 0) {
        const zz = once(`zz|${Math.round(x0)}|${Math.round(h)}`, () => { const o = [], rows = Math.max(3, Math.round(h / (34 * u))); for (let j = 0; j <= rows; j++) o.push(j % 2 ? x1 : x0, base - (h * j) / rows); return o; });
        line(g, S, partOf(zz, Math.min(zq, r)), lite(col, 0.7), 4 * u, { glow: passing ? 12 * u : 0 });
        if (passing) { const tip = pointAlong(zz, zq); bead(g, S, tip.x, tip.y, 7 * u, C.gold); }
      }
      g.restore();
      const topY = base - h * r;
      tops.push(cx, base - h - 14 * u);
      if (r < 1 && r > 0) bead(g, S, cx, topY, 6 * u, col);
      if (r >= 1) {
        // the top thread: on the plucked bar a finger draws it up, lets go, and it rings
        const amp = i === hiI ? -pull * 60 * u * (plk > 0 ? 0 : 1) + ring * 30 * u : 0;
        line(g, S, taut(x0, base - h, x1, base - h, amp, 24), lite(col, 0.55), 4 * u);
        if (i === hiI && pull > 0 && plk <= 0) bead(g, S, cx, base - h - pull * 60 * u, 9 * u, C.gold);
        if (i === hiI && plk > 0) for (let k = 0; k < 4; k++) sparkle(g, cx + Math.sin(t * 1.3 + k * 2.1) * barW * 0.62, base - h - (40 + k * 26) * u, 14 * u, Math.abs(ring) * 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * 3 + k * 1.7)), C.main);
      }
      tag(g, S, d.labels[i], cx, base + 58 * u, ease(span(pp, 0.0 + i * 0.07, 0.35 + i * 0.07)), t, { ph: i * 1.3, maxW: slot * 0.96, size: 46 });
      const lift = (zq > 0 && zq < 1 ? Math.sin(Math.PI * zq) * 14 * u : 0) + (i === hiI ? Math.abs(ring) * 12 * u : 0);
      if (r > 0.02) number(g, S, fmt(v, d, r), cx, topY - 76 * u - lift, 104 * u, clamp(r * 3), t, { col: hi ? lite(C.accent, 0.35) : C.main, alt: hi ? C.accent : C.alt, ph: i * 0.2 });
    });
    // the trend thread is run nail to nail across the bar tops; a shuttle bead then rides it to the end
    const tq = span(bk, 0.42, 0.68);
    if (tq > 0) {
      const q = ease(tq) * (info.exit !== undefined ? 1 - info.exit : 1), pts = partOf(tops, q), reached = Math.min(n, Math.floor(q * (n - 1) + 1.0001));
      line(g, S, pts, hexA(C.main, 0.9), 3.6 * u);
      nails(g, S, tops, 5.6 * u, reached);
      if (q < 1) { const tp = pointAlong(tops, q); bead(g, S, tp.x, tp.y, 8 * u, C.gold); }
      for (let k = 0; k < reached; k++) { const age = tq * (n - 1) - k; if (age >= 0 && age < 0.6) sparkle(g, tops[k * 2], tops[k * 2 + 1], (12 + 30 * age) * u, 1 - age / 0.6, C.main); }
      if (q >= 1) { const b = pointAlong(tops, fmod((bk - 0.68) * rem * 0.35, 1)); bead(g, S, b.x, b.y, 7 * u, C.gold); }
    }
  }

  // ---- object (laptop or phone, with callouts) ------------------------------------------------------------
  function deviceScene(g, S, box, pp, d, info) {
    const u = S.u, C = pal(S), t = info.t, phone = d.kind !== "laptop", tall = S.tall;
    heading(g, S, "object", ease(info.local / 0.7), t);
    const cx = box.x + box.w / 2, cy = box.y + box.h * (tall ? 0.5 : 0.47);
    let sw, sh_, sx, sy;
    if (phone) { sh_ = Math.min(box.h * (tall ? 0.56 : 0.88), 720 * u); sw = sh_ * 0.5; sx = cx - sw / 2; sy = cy - sh_ / 2; }
    else { sw = Math.min(box.w * (tall ? 0.84 : 0.5), (box.h - 120 * u) / 0.74); sh_ = sw * 0.6; sx = cx - sw / 2; sy = cy - sh_ * 0.62; }
    const rim = rrPts(sx, sy, sw, sh_, 22 * u), rimQ = ease(span(pp, 0, 0.3));
    // the web behind the device is quietened; a woven ring frames it instead of chords crossing behind it
    hush(g, S, sx - 40 * u, sy - 30 * u, sw + 80 * u, sh_ + (phone ? 60 : 140) * u, 0.78 * rimQ);
    { const hr = Math.hypot(sw, sh_ + (phone ? 0 : 90 * u)) * 0.56, hq = ease(span(pp, 0, 0.6)), skip = 7 + 1.5 * Math.sin(t * 0.5), ccy = sy + sh_ * 0.5 + (phone ? 0 : 40 * u);
      g.save(); g.globalAlpha = 0.5; strands(g, S, ringBand(cx, ccy, hr, 120, skip, t * 0.04), 120 * hq, phone ? C.teal : C.violet, 1.6 * u, { shadow: false, sheen: fmod(t * 0.3, 1.6) / 1.6 }); g.restore();
      g.save(); g.globalAlpha = 0.6; nails(g, S, ringPts(cx, ccy, hr, 60, t * 0.04), 2.8 * u, Math.ceil(60 * hq)); g.restore(); }
    // screen glass
    g.save(); rr(g, sx, sy, sw, sh_, 22 * u); g.fillStyle = shade(C, 0.5); g.fill(); g.restore();
    // device body: nails around the rim every 46u, cream thread drawn right round it
    const rimNails = []; for (let i = 0; i < rim.length - 2; i += 8) rimNails.push(rim[i], rim[i + 1]);
    line(g, S, partOf(rim, rimQ), C.main, 7 * u);
    nails(g, S, rimNails, 5.4 * u, Math.ceil(rimNails.length / 2 * rimQ));
    const sheen = (i) => fmod(t * 0.4 + i * 0.3, 1.8) / 1.8;
    let targets, beat = { bk: -1, rem: 1 }, block = null;
    if (!phone) {
      // keyboard deck: a fan of thread from the hinge down to the front edge
      const by = sy + sh_ + 22 * u, bh = 54 * u, topW = sw * 1.12, botW = sw * 1.3;
      const deck = once(`deck|${Math.round(cx)}|${Math.round(by)}|${Math.round(sw)}`, () => ladder(cx - topW / 2, by, cx + topW / 2, by, cx - botW / 2, by + bh, cx + botW / 2, by + bh, 46, 1));
      const dq = ease(span(pp, 0.1, 0.5));
      strands(g, S, deck, deck.length / 4 * dq, C.gold, 3 * u, { sheen: sheen(1) });
      line(g, S, partOf([cx - topW / 2, by, cx + topW / 2, by, cx + botW / 2, by + bh, cx - botW / 2, by + bh, cx - topW / 2, by], dq), C.main, 5 * u);
      nails(g, S, [cx - topW / 2, by, cx + topW / 2, by, cx + botW / 2, by + bh, cx - botW / 2, by + bh], 6 * u, dq > 0.1 ? 4 : 0);
      // timeline inside the glass: three lanes of woven clips and a playhead that scrubs back and forth
      for (const [fx, fy, a, b] of [[sx, sy, 1, 1], [sx + sw, sy, -1, 1], [sx, sy + sh_, 1, -1], [sx + sw, sy + sh_, -1, -1]]) {
        const fs = once(`sf|${Math.round(fx)}|${Math.round(fy)}`, () => fan(fx + a * 10 * u, fy + b * 10 * u, fx + a * 10 * u + a * sw * 0.2, fy + b * 10 * u, fx + a * 10 * u, fy + b * 10 * u + b * sh_ * 0.3, 10));
        strands(g, S, fs, fs.length / 4 * rimQ, hexA(C.main, 0.5), 1.4 * u, { shadow: false });
      }
      // the beat after the callouts land: the proposed block is re-wound thread by thread in a new colour,
      // then a thread is pulled from the Live preview tag across to it and drawn tight
      const build_ = Math.max(1.0, Math.min(2.3, info.hold * 0.56)), b0 = build_ * 0.8 - 0.3, rem = Math.max(1.2, info.hold - b0);
      beat = { bk: (info.local - b0) / rem, rem };
      const lanes = [0.34, 0.55, 0.76], clips = [[[0.07, 0.36], [0.42, 0.62], [0.68, 0.93]], [[0.07, 0.24], [0.3, 0.7], [0.76, 0.93]], [[0.07, 0.5], [0.56, 0.93]]];
      lanes.forEach((ly, li) => clips[li].forEach(([a, b], ci) => {
        const q = ease(span(pp, 0.2 + li * 0.12 + ci * 0.06, 0.6 + li * 0.12 + ci * 0.06)), x0 = sx + sw * a, x1 = sx + sw * b, hh = sh_ * 0.14, y0 = sy + sh_ * ly - hh / 2;
        const W_ = once(`clip|${Math.round(x0)}|${Math.round(x1)}|${Math.round(y0)}`, () => weave(x0, x1, y0 + hh, hh, 11 * u, "x"));
        let c0 = C.cols[(li * 2 + ci + 1) % 5];
        if (li === 1 && ci === 2) {
          const tot = W_.chords.length / 4, wk = ease(span(beat.bk, 0.02, 0.4)) * q, nw = tot * wk, c1 = c0 === C.gold ? C.teal : C.gold;
          block = { x0, x1, y0, hh, col: wk >= 1 ? c1 : c0 };
          // the old colour is unpicked from the top while the new one winds on from the start
          strands(g, S, W_.chords.slice(Math.ceil(nw) * 4), (tot - Math.ceil(nw)) * q, c0, 2.6 * u, { shadow: false });
          const tip = strands(g, S, W_.chords, nw, c1, 3.2 * u, { glow: wk > 0 && wk < 1 ? 12 * u : 0, sheen: sheen(li + ci) });
          if (tip && wk > 0 && wk < 1) bead(g, S, tip.x, tip.y, 7 * u, C.gold);
          if (wk > 0 && wk < 1) { const lx = lerp(x0, x1, 1 - wk), ly = y0 - 18 * u - Math.sin(wk * 30) * 6 * u; line(g, S, [x1, y0, lerp(lx, x1, 0.5), ly, lx, y0 + hh * 0.3], c0, 2.4 * u, { shadow: false }); }
          c0 = block.col;
        } else strands(g, S, W_.chords, W_.chords.length / 4 * q, c0, 2.6 * u, { shadow: false, sheen: sheen(li + ci) });
        line(g, S, partOf([x0, y0, x1, y0, x1, y0 + hh, x0, y0 + hh, x0, y0], q), lite(c0, 0.4), 2.4 * u, { shadow: false });
      }));
      for (let i = 0; i <= 12; i++) { const x = sx + sw * (0.07 + (0.86 * i) / 12); line(g, S, [x, sy + sh_ * 0.13, x, sy + sh_ * (i % 4 ? 0.16 : 0.19)], hexA(C.main, 0.7), 2 * u, { shadow: false }); }
      const ph = sx + sw * (0.1 + 0.8 * tri(t * 0.17 + 0.2));
      line(g, S, [ph, sy + sh_ * 0.12, ph, sy + sh_ * 0.9], C.main, 3.2 * u, { glow: 10 * u });
      nails(g, S, [ph, sy + sh_ * 0.1], 7 * u);
      targets = [{ x: sx + sw * 0.2, y: sy + sh_ * 0.34 }, { x: sx + sw * 0.84, y: sy + sh_ * 0.55 }, { x: cx + botW * 0.3, y: by + bh }];
    } else {
      // feed of woven cards scrolling up the screen without end
      const pitch = sh_ * 0.27, off = fmod(t * 0.2, 1) * pitch;
      g.save(); rr(g, sx + 4 * u, sy + 4 * u, sw - 8 * u, sh_ - 8 * u, 18 * u); g.clip();
      for (let i = -1; i < 4; i++) {
        const y0 = sy + sh_ * 0.1 + i * pitch - off, hh = pitch * 0.78, x0 = sx + sw * 0.1, x1 = sx + sw * 0.9, q = ease(span(pp, 0.2 + Math.max(0, i) * 0.12, 0.62 + Math.max(0, i) * 0.12));
        const k = ((i + Math.round(t * 0.2 - fmod(t * 0.2, 1))) % 5 + 5) % 5, W_ = once(`card|${Math.round(x0)}|${Math.round(hh)}`, () => weave(0, x1 - x0, hh, hh, 12 * u, "x"));
        g.save(); g.translate(x0, y0);
        strands(g, S, W_.chords, W_.chords.length / 4 * q, C.cols[k], 2.6 * u, { shadow: false, sheen: sheen(i + 2) });
        g.restore();
      }
      g.restore();
      nails(g, S, [cx, sy + 18 * u], 6 * u); line(g, S, [cx - sw * 0.16, sy + sh_ - 20 * u, cx + sw * 0.16, sy + sh_ - 20 * u], C.main, 5 * u);
      targets = [{ x: sx + sw * 0.5, y: sy + sh_ * 0.2 }, { x: sx + sw * 0.5, y: sy + sh_ * 0.52 }, { x: sx + sw * 0.5, y: sy + sh_ * 0.8 }];
    }
    // callouts: each tag hangs from a nail and a taut thread runs to its spot on the device
    const tagSz = 46, maxW = tall ? box.w * 0.62 : Math.max(380 * u, (box.w - sw) / 2 - 40 * u);
    const spots = tall
      ? [{ x: box.x + box.w * 0.27, y: box.y + 24 * u }, { x: box.x + box.w * 0.74, y: sy + sh_ * 0.5 }, { x: box.x + box.w * 0.5, y: box.y + box.h - 118 * u }]
      : [{ x: box.x + maxW / 2 + 6 * u, y: sy + sh_ * 0.04 }, { x: box.x + box.w - maxW / 2 - 6 * u, y: sy + sh_ * 0.34 }, { x: box.x + box.w - maxW / 2 - 6 * u, y: sy + sh_ * 0.9 }];
    const lefts = tall ? [true, false, true] : [true, false, true];
    let firstTag = null;
    d.callouts.forEach((txt, i) => {
      if (!txt) return;
      const q = span(pp, 0.35 + i * 0.16, 0.8 + i * 0.16), sp = spots[i];
      const shape = tagLayout(S, txt, tagSz * u, maxW), hx = sp.x, hy = sp.y - 26 * u;
      // leader thread
      const target = targets[i], lq = ease(span(q, 0.15, 0.9)), la = 7 * u * pluck(t, i * 0.7, 2.6);
      const lp = taut(hx, hy, target.x, target.y, la * (lq >= 1 ? 1 : 0), 24);
      const lq2 = partOf(lp, lq);
      line(g, S, lq2, C.cols[i % 5], 3.6 * u);
      if (lq >= 1) {
        const ring = fmod(t * 0.6 + i * 0.33, 1);
        g.save(); g.globalAlpha = 1 - ring; g.strokeStyle = C.cols[i % 5]; g.lineWidth = 3 * u; g.beginPath(); g.arc(target.x, target.y, (10 + ring * 34) * u, 0, TAU); g.stroke(); g.restore();
        const bp = pointAlong(lp, fmod(t * 0.4 + i * 0.3, 1)); bead(g, S, bp.x, bp.y, 5.4 * u, C.cols[i % 5]);
      }
      nails(g, S, [target.x, target.y], 6 * u, lq > 0.9 ? 1 : 0);
      void shape; void lefts;
      const tg = tag(g, S, txt, sp.x, sp.y, ease(q * 3), t, { ph: i * 2.1, maxW, size: tagSz, thread: C.cols[i % 5] });
      if (i === 0) firstTag = tg;
    });
    // the pulled thread: wound out from the Live preview tag, sagging, then drawn tight onto the block and plucked
    if (block && firstTag && beat.bk > 0.4) {
      const bk = beat.bk, out = ease(span(bk, 0.4, 0.66)), tight = ease(span(bk, 0.66, 0.78)), since = (bk - 0.78) * beat.rem;
      const ax = firstTag.cx + firstTag.w * 0.32, ay = firstTag.bottom - 6 * u, bx = block.x0, by_ = block.y0 + block.hh * 0.5;
      const sag = lerp(150 * u, 0, tight) + (since > 0 ? Math.exp(-2 * since) * Math.sin(since * 36) * 22 * u : 0);
      const pts = []; for (let k = 0; k <= 36; k++) { const f = k / 36; pts.push(lerp(ax, bx, f), lerp(ay, by_, f) + Math.sin(Math.PI * f) * sag); }
      const col = C.cols[0];
      line(g, S, partOf(pts, out), col, 4.4 * u, { glow: tight > 0 ? 10 * u : 0 });
      nails(g, S, [ax, ay], 6.4 * u);
      if (out < 1) { const tp = pointAlong(pts, out); bead(g, S, tp.x, tp.y, 8 * u, C.gold); }
      else {
        nails(g, S, [bx, by_], 6.4 * u);
        const pulse = 0.5 + 0.5 * Math.sin(t * 5);
        g.save(); g.globalAlpha = 0.4 + 0.5 * pulse; g.strokeStyle = block.col; g.lineWidth = 4 * u; g.shadowColor = block.col; g.shadowBlur = 16 * u;
        rr(g, block.x0 - 7 * u, block.y0 - 7 * u, block.x1 - block.x0 + 14 * u, block.hh + 14 * u, 8 * u); g.stroke(); g.restore();
        if (tight >= 1) for (let j = 0; j < 2; j++) { const bp = pointAlong(pts, fmod(since * 0.55 + j * 0.5, 1)); bead(g, S, bp.x, bp.y, 6 * u, C.gold); }
      }
    }
  }

  // ---- people ---------------------------------------------------------------------------------------------
  // Each person is wound differently: a spoked dome, a curve-stitched dome or a pleated one, in their own
  // proportions, so a row never reads as one stamp repeated.
  const BODY = [[0.46, 0.52], [0.4, 0.58], [0.52, 0.46], [0.43, 0.55], [0.49, 0.5]];
  function figure(g, S, cx, by, sc, i, q, t, hi) {
    const u = S.u, C = pal(S), [kx, ky] = BODY[i % 5], rx = kx * sc, ry = ky * sc, R = (0.2 + 0.02 * (i % 3)) * sc, pat = i % 3;
    const bob = Math.sin(t * 2.1 + i * 1.3) * 0.012 * sc, hcy = by - ry - R * 0.85 + bob;
    const shirt = hi ? C.accent : C.cols[(i + 1) % 5] === C.accent ? C.teal : C.cols[(i + 1) % 5], skin = C.skins[i % C.skins.length], hair = [C.hair, lite(C.hair, 0.15), C.brown, C.hair, lite(C.brown, 0.1)][i % 5];
    const kind = i % 5;
    const dome = once(`dome|${Math.round(cx)}|${Math.round(by)}|${Math.round(sc)}|${i % 5}`, () => {
      const n = 24, p = [];
      for (let k = 0; k < n; k++) { const a = Math.PI + (Math.PI * k) / (n - 1); p.push([cx + Math.cos(a) * rx, by + Math.sin(a) * ry]); }
      const a1 = [], a2 = [];
      if (pat === 0) { p.forEach(([x, y]) => a1.push(cx, by, x, y)); for (let k = 1; k < n / 2; k++) a2.push(p[k][0], p[k][1], p[n - 1 - k][0], p[n - 1 - k][1]); }
      else if (pat === 1) { for (let k = 0; k < n; k++) a1.push(p[k][0], p[k][1], lerp(cx + rx, cx - rx, k / (n - 1)) * 0.5 + cx * 0.5, by); for (let k = 0; k + 7 < n; k++) a2.push(p[k][0], p[k][1], p[k + 7][0], p[k + 7][1]); }
      else { for (let k = 1; k < n - 1; k++) a1.push(p[k][0], p[k][1], p[k][0], by); for (let k = 1; k < n / 2; k += 2) a2.push(p[k][0], p[k][1], p[n - 1 - k][0], p[n - 1 - k][1]); for (let k = 1; k < n - 2; k += 2) a2.push(p[k][0], p[k][1], p[k + 2][0], by); }
      return { a1, a2, pts: p.flat() };
    });
    // a woven ring behind each person, faint, so the web never crosses the figure itself
    { const aq = ease(span(q, 0, 0.5)), ar = sc * 0.66;
      g.save(); g.globalAlpha = hi ? 0.5 : 0.3; strands(g, S, ringBand(cx, by - sc * 0.36, ar, 72, 6 + Math.sin(t * 0.7 + i), t * (i % 2 ? -0.08 : 0.08)), 72 * aq, hi ? C.accent : lite(shirt, 0.1), 1.4 * u, { shadow: false }); g.restore(); }
    strands(g, S, dome.a2, dome.a2.length / 4 * span(q, 0, 0.3), lite(shirt, 0.3), 3 * u);
    strands(g, S, dome.a1, dome.a1.length / 4 * span(q, 0.05, 0.4), shirt, 3 * u, { sheen: fmod(t * 0.4 + i * 0.2, 1.7) / 1.7 });
    nails(g, S, dome.pts, 3.8 * u, Math.ceil(24 * span(q, 0, 0.3)));
    line(g, S, partOf(dome.pts.concat([dome.pts[0], dome.pts[1]]), ease(span(q, 0, 0.35))), lite(shirt, 0.5), 3.4 * u);
    // head: a ball of thread round a ring of nails
    const hq = span(q, 0.3, 0.65), ring = ringPts(cx, hcy, R, 26), hs = [];
    for (let k = 0; k < 26; k++) for (const sk of [9, 11, 13]) hs.push(ring[k * 2], ring[k * 2 + 1], ring[((k + sk) % 26) * 2], ring[((k + sk) % 26) * 2 + 1]);
    strands(g, S, hs, hs.length / 4 * hq, skin, 2.4 * u);
    nails(g, S, ring, 2.8 * u, Math.ceil(26 * hq));
    // hair
    const hqq = span(q, 0.55, 0.85), cap = [];
    for (let k = 0; k < 9; k++) { const a = Math.PI + 0.12 + ((Math.PI - 0.24) * k) / 8; cap.push([cx + Math.cos(a) * R * 1.04, hcy + Math.sin(a) * R * 1.04]); }
    const cs = []; for (let k = 0; k < 4; k++) cs.push(cap[k][0], cap[k][1], cap[8 - k][0], cap[8 - k][1]);
    if (kind !== 4) strands(g, S, cs, 4 * hqq, hair, 3 * u);
    if (kind === 1) { const bc = { x: cx + R * 0.2, y: hcy - R * 1.25 }, br = ringPts(bc.x, bc.y, R * 0.4, 10), bs = []; for (let k = 0; k < 10; k++) bs.push(br[k * 2], br[k * 2 + 1], br[((k + 4) % 10) * 2], br[((k + 4) % 10) * 2 + 1]); strands(g, S, bs, 10 * hqq, hair, 2.4 * u); }
    if (kind === 2) for (const sg of [-1, 1]) { const f = fan(cx + sg * R * 0.98, hcy - R * 0.1, cx + sg * R * 1.08, hcy + R * 0.9, cx + sg * R * 0.5, hcy - R * 0.1, 8); strands(g, S, f, 9 * hqq, hair, 2.6 * u); }
    if (kind === 3) for (let k = 0; k < 3; k++) { const a = -2.5 + k * 0.95, bx = cx + Math.cos(a) * R * 1.02, byy = hcy + Math.sin(a) * R * 1.02, br = ringPts(bx, byy, R * 0.3, 8), bs = []; for (let m = 0; m < 8; m++) bs.push(br[m * 2], br[m * 2 + 1], br[((m + 3) % 8) * 2], br[((m + 3) % 8) * 2 + 1]); strands(g, S, bs, 8 * hqq, hair, 2.2 * u); }
    if (kind === 4) { for (const sg of [-1, 1]) { const gl = ringPts(cx + sg * R * 0.4, hcy + R * 0.05, R * 0.26, 12); line(g, S, partOf(gl.concat([gl[0], gl[1]]), hqq), C.main, 2.6 * u); } line(g, S, partOf([cx - R * 0.14, hcy + R * 0.05, cx + R * 0.14, hcy + R * 0.05], hqq), C.main, 2.6 * u); }
    // face
    if (span(q, 0.8, 1) > 0) {
      const fq = ease(span(q, 0.8, 1)), blink = fmod(t + i * 0.9, 3.4) > 3.25 ? 0.2 : 1;
      g.save(); g.globalAlpha = fq; g.fillStyle = C.disc;
      for (const sg of [-1, 1]) { g.beginPath(); g.ellipse(cx + sg * R * 0.38, hcy + R * 0.08, R * 0.1, R * 0.1 * blink, 0, 0, TAU); g.fill(); }
      g.strokeStyle = C.disc; g.lineWidth = 3 * u; g.lineCap = "round"; g.beginPath(); g.arc(cx, hcy + R * 0.18, R * 0.34, 0.25, Math.PI - 0.25); g.stroke(); g.restore();
    }
    return { neck: { x: cx, y: by - ry * 0.85 }, rx, ry, head: { x: cx, y: hcy, r: R }, shirt, shL: { x: cx - rx * 0.78, y: by - ry * 0.62 }, shR: { x: cx + rx * 0.78, y: by - ry * 0.62 } };
  }
  // An arm laid as one thread from the shoulder through the elbow to a nail at the hand.
  function arm(g, S, a, hx, hy, bend, col) {
    const u = S.u, mx = (a.x + hx) / 2, my = (a.y + hy) / 2, dx = hx - a.x, dy = hy - a.y, L = Math.hypot(dx, dy) || 1;
    line(g, S, [a.x, a.y, mx - (dy / L) * bend, my + (dx / L) * bend, hx, hy], col, 8 * u);
    nails(g, S, [hx, hy], 7 * u);
  }
  function peopleScene(g, S, box, pp, d, info) {
    const u = S.u, C = pal(S), t = info.t, n = Math.max(2, Math.min(6, Math.round(d.count)));
    heading(g, S, "people", ease(info.local / 0.7), t);
    const cols = S.tall ? (n <= 3 ? n : Math.ceil(n / 2)) : n, rows = Math.ceil(n / cols), cw = box.w / cols, ch = box.h / rows;
    const sc = Math.min((cw * 0.9) / 0.92, (ch * 0.92 - 150 * u) / 0.96, 440 * u);
    const build_ = Math.max(1.0, Math.min(2.3, info.hold * 0.56)), SP = 0.6;
    // quiet the background web behind the row so the figures read first
    hush(g, S, box.x, box.y + box.h * 0.12, box.w, box.h * 0.8, 0.72 * clamp(pp * 3));
    const row = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols), inRow = r === rows - 1 ? n - cols * (rows - 1) : cols, ci = i - r * cols, x0 = box.x + (box.w - inRow * cw) / 2;
      const cx = x0 + cw * (ci + 0.5), by = box.y + ch * r + ch - 118 * u;
      // each person winds on in turn, and starts their own action once wound
      const fq = stagger(pp, i, n, SP), done = ((i / n) * SP + (1 - SP)) * build_ - 0.3, lt = info.local - done;
      const drop = (1 - ease(span(fq, 0, 0.35))) * 40 * u;
      const f = figure(g, S, cx, by - drop, sc, i, fq, t, i === d.highlight);
      row.push({ cx, by, f, r, lt, i });
      const bt = d.badges[i];
      if (bt) tag(g, S, bt, cx, by + 52 * u, ease(span(pp, i * 0.12, 0.4 + i * 0.12)), t, { ph: i * 1.7, maxW: cw * 0.96, size: 46, edge: i === d.highlight ? C.accent : undefined, glow: i === d.highlight ? C.accent : undefined, thread: i === d.highlight ? C.accent : undefined });
    }
    // the taut strings between neighbours; one may be hooked and plucked by a person's thread
    const hooks = {};
    const railOf = (i) => { const a = row[i], b = row[i + 1]; return { x1: a.cx + a.f.rx * 0.82, x2: b.cx - b.f.rx * 0.82, y: Math.max(a.f.neck.y, b.f.neck.y) + 0.12 * sc }; };
    row.forEach((p) => {
      const lt = p.lt, act = p.i % 3;
      if (lt <= 0) return;
      const f = p.f, col = p.i === d.highlight ? C.accent : lite(f.shirt, 0.2);
      if (act === 0) {
        // a clapper board raised and snapped shut on a beat
        const up = ease(span(lt, 0, 0.35)), hx = lerp(f.shR.x + 0.06 * sc, f.head.x + f.head.r * 1.9, up), hy = lerp(f.shR.y + 0.2 * sc, f.head.y - f.head.r * 0.9, up);
        arm(g, S, f.shR, hx, hy, 0.1 * sc, col);
        if (up > 0.2) {
          const bw = 0.3 * sc, bh = 0.2 * sc, bx = hx - bw * 0.2, byy = hy - bh, ph = fmod(Math.max(0, lt - 0.35) * 1.2, 1), open = ph < 0.7 ? 0.55 * ease(ph / 0.7) : 0.55 * (1 - ease((ph - 0.7) / 0.06));
          g.save(); g.globalAlpha = clamp((up - 0.2) * 3);
          rr(g, bx, byy, bw, bh, 6 * u); g.fillStyle = C.disc; g.fill();
          const st = []; for (let k = 0; k < 7; k++) st.push(bx + bw * (k / 7), byy + bh, bx + bw * ((k + 1) / 7), byy);
          strands(g, S, st, 7, C.main, 2.4 * u, { shadow: false });
          line(g, S, [bx, byy, bx + bw, byy, bx + bw, byy + bh, bx, byy + bh, bx, byy], C.main, 3 * u);
          const ca = -open, ex = bx + Math.cos(ca) * bw, ey = byy - 8 * u + Math.sin(ca) * bw;
          line(g, S, [bx, byy - 8 * u, ex, ey], C.gold, 7 * u);
          g.restore();
          nails(g, S, [bx, byy - 8 * u], 5 * u);
          if (ph > 0.7 && ph < 0.95) sparkle(g, bx + bw * 0.6, byy - 20 * u, 26 * u, 1 - (ph - 0.7) / 0.25, C.main);
        }
      } else if (act === 1) {
        // the hand reaches over and hooks its thread onto the next pin along the string
        const ri = p.i < row.length - 1 && row[p.i + 1].r === p.r ? p.i : p.i - 1;
        if (ri < 0) return;
        const rl = railOf(ri), pinX = lerp(rl.x1, rl.x2, ri === p.i ? 0.4 : 0.6), pinY = rl.y, sh = ri === p.i ? f.shR : f.shL;
        const reach = ease(span(lt, 0, 0.4)), rest = { x: sh.x + (ri === p.i ? 1 : -1) * 0.08 * sc, y: sh.y + 0.22 * sc };
        const pull = ease(span(lt, 0.7, 1.0)), since = lt - 1.0;
        const hx = lerp(rest.x, pinX, reach) - (ri === p.i ? 1 : -1) * pull * 0.1 * sc, hy = lerp(rest.y, pinY - 0.16 * sc, reach) - pull * 0.04 * sc;
        arm(g, S, sh, hx, hy, 0.1 * sc, C.accent);
        const hk = ease(span(lt, 0.4, 0.7));
        if (hk > 0) {
          const loop = []; for (let k = 0; k <= 20; k++) { const a = -Math.PI / 2 + (k / 20) * TAU; loop.push(pinX + Math.cos(a) * 11 * u, pinY + Math.sin(a) * 11 * u); }
          const pts = [hx, hy].concat(loop);
          line(g, S, partOf(pts, hk), C.accent, 4 * u, { glow: 10 * u });
          if (hk < 1) { const tp = pointAlong(pts, hk); bead(g, S, tp.x, tp.y, 7 * u, C.gold); }
          else { const ring_ = fmod(t * 0.8, 1); g.save(); g.globalAlpha = 1 - ring_; g.strokeStyle = C.accent; g.lineWidth = 3 * u; g.beginPath(); g.arc(pinX, pinY, (14 + ring_ * 30) * u, 0, TAU); g.stroke(); g.restore(); }
        }
        hooks[ri] = { x: pinX, lift: hk >= 1 ? pull * 0.05 * sc : 0, since: since > 0 ? since : -1 };
      } else {
        // a little rose winds on above the head and keeps turning: the agent thinking
        const wq = ease(span(lt, 0, 0.6)), rx_ = f.head.x + f.head.r * 1.5, ry_ = f.head.y - f.head.r * 1.5, rr_ = f.head.r * 0.85;
        line(g, S, partOf([f.head.x + f.head.r * 0.8, f.head.y - f.head.r * 0.6, rx_ - rr_ * 0.6, ry_ + rr_ * 0.6], wq), hexA(C.main, 0.8), 2.4 * u, { shadow: false });
        strands(g, S, rose(rx_, ry_, rr_, 40, 2 + 1.2 * (0.5 - 0.5 * Math.cos(lt * 1.6)), lt * 0.8), 40 * wq, C.gold, 2 * u, { glow: 6 * u });
        nails(g, S, ringPts(rx_, ry_, rr_, 20, lt * 0.8), 2.6 * u, Math.ceil(20 * wq));
        if (wq >= 1) for (let k = 0; k < 2; k++) { const a = lt * 2.4 + k * Math.PI; sparkle(g, rx_ + Math.cos(a) * rr_ * 1.25, ry_ + Math.sin(a) * rr_ * 1.25, 12 * u, 0.5 + 0.5 * Math.sin(t * 4 + k), C.main); }
      }
    });
    for (let i = 0; i < row.length - 1; i++) {
      const a = row[i], b = row[i + 1];
      if (a.r !== b.r) continue;
      const q = ease(span(pp, 0.45 + i * 0.07, 0.8 + i * 0.07));
      if (q <= 0) continue;
      const rl = railOf(i), hk = hooks[i];
      let pts;
      if (hk && hk.since < 0) pts = [rl.x1, rl.y, hk.x, rl.y - hk.lift, rl.x2, rl.y];
      else if (hk) { const amp = 0.05 * sc * Math.exp(-2.2 * hk.since) * Math.cos(hk.since * 30) + 3 * u * Math.sin(t * 2.5); pts = taut(rl.x1, rl.y, rl.x2, rl.y, -amp, 28); }
      else pts = taut(rl.x1, rl.y, rl.x2, rl.y, 10 * u * pluck(t, i * 0.55, 2.4), 28);
      line(g, S, partOf(pts, q), C.main, 3.6 * u);
      nails(g, S, [rl.x1, rl.y, rl.x2, rl.y], 5.4 * u, q > 0.1 ? 2 : 0);
      if (q >= 1) { const bp = pointAlong(pts, tri(t * 0.45 + i * 0.3)); bead(g, S, bp.x, bp.y, 5 * u, C.gold); }
    }
    // a rail the figures stand on
    for (let r = 0; r < rows; r++) {
      const y = box.y + ch * r + ch - 118 * u + 14 * u, q = ease(span(pp, 0, 0.4));
      line(g, S, [box.x - 20 * u, y, box.x - 20 * u + (box.w + 40 * u) * q, y], hexA(C.main, 0.55), 3 * u);
      nails(g, S, [box.x - 20 * u, y, box.x + box.w + 20 * u, y], 5 * u, q > 0.05 ? 2 : 0);
    }
  }

  // ---- process --------------------------------------------------------------------------------------------
  function processScene(g, S, box, pp, d, info) {
    const u = S.u, C = pal(S), t = info.t, tall = S.tall, n = d.steps.length;
    heading(g, S, "process", ease(info.local / 0.7), t);
    const R = (tall ? 112 : Math.min(190 * u, box.w / n * 0.36)), disc = R * 0.62;
    const pos = (i) => tall ? { x: box.x + R + 24 * u, y: box.y + box.h * ((i + 0.5) / n) } : { x: box.x + box.w * ((i + 0.5) / n), y: box.y + box.h * 0.42 };
    for (let i = 0; i < n; i++) {
      const c = pos(i), q = ease(span(pp, i * 0.26, i * 0.26 + 0.34)), col = C.cols[i % 5];
      const m = 2 + i + 0.7 * Math.sin(t * 0.8 + i * 1.7) + 0.5 * i * 0 ;
      g.save(); g.globalAlpha = 0.4; strands(g, S, rose(c.x, c.y, R * 1.7, 72, 2 + i * 0.5 + 0.6 * Math.sin(t * 0.5 + i), t * 0.04), 72 * q, col, 1.4 * u, { shadow: false }); g.restore();
      const segs = rose(c.x, c.y, R, 64, m, t * (i % 2 ? -0.06 : 0.06));
      strands(g, S, segs, 64 * q, col, 2.6 * u, { sheen: fmod(t * 0.4 + i * 0.3, 1.7) / 1.7 });
      strands(g, S, rose(c.x, c.y, R * 0.98, 64, m + 1, -t * 0.05), 64 * q, lite(col, 0.45), 1.6 * u, { shadow: false });
      nails(g, S, ringPts(c.x, c.y, R, 32, t * (i % 2 ? -0.06 : 0.06)), 4.4 * u, Math.ceil(32 * q));
      // inked disc with the step number woven on it
      g.save(); g.globalAlpha = clamp(q * 2); g.beginPath(); g.arc(c.x, c.y, disc, 0, TAU); g.fillStyle = C.disc; g.fill(); g.restore();
      line(g, S, partOf(ringPts(c.x, c.y, disc, 40).concat(ringPts(c.x, c.y, disc, 1).slice(0, 2)), q), C.main, 4 * u);
      number(g, S, String(i + 1), c.x, c.y, Math.min(150 * u, disc * 1.5), clamp(q * 1.6), t, { col: lite(col, 0.4), alt: col, ph: i * 0.3 });
      const lab = tag(g, S, d.steps[i], tall ? c.x + R + 44 * u : c.x, tall ? c.y - 36 * u : c.y + R + 60 * u, ease(span(pp, i * 0.26 + 0.1, i * 0.26 + 0.5)), t, { ph: i * 1.4, maxW: tall ? box.w - R * 2 - 80 * u : box.w / n * 0.96, size: 46, left: tall });
      void lab;
      if (i < n - 1) {
        const nx = pos(i + 1), rq = ease(span(pp, i * 0.26 + 0.22, i * 0.26 + 0.55));
        const dx = nx.x - c.x, dy = nx.y - c.y, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, x1 = c.x + ux * (R + 10 * u), y1 = c.y + uy * (R + 10 * u), x2 = nx.x - ux * (R + 34 * u), y2 = nx.y - uy * (R + 34 * u);
        // two strands twist round each other
        for (let s = 0; s < 2; s++) {
          const pts = [], len = Math.hypot(x2 - x1, y2 - y1);
          for (let k = 0; k <= 50; k++) { const f = k / 50, w = Math.sin(TAU * (f * 3 - t * 0.7) + s * Math.PI) * 13 * u * Math.sin(Math.PI * f) ** 0.5; pts.push(lerp(x1, x2, f) - uy * w, lerp(y1, y2, f) + ux * w); }
          line(g, S, partOf(pts, rq), s ? C.main : col, 4.4 * u);
          if (s === 0 && rq >= 1) { const bp = pointAlong(pts, fmod(t * 0.35 + i * 0.4, 1)); bead(g, S, bp.x, bp.y, 6 * u, C.gold); void len; }
        }
        if (rq > 0.95) { const a = Math.atan2(uy, ux); line(g, S, [x2 + Math.cos(a + 2.6) * 26 * u, y2 + Math.sin(a + 2.6) * 26 * u, x2 + ux * 14 * u, y2 + uy * 14 * u, x2 + Math.cos(a - 2.6) * 26 * u, y2 + Math.sin(a - 2.6) * 26 * u], C.main, 5 * u); }
      }
    }
  }

  // Curved threads [x1,y1,cx,cy,x2,y2,...] that hang slack between their ends.
  function slack(g, S, list, color, w) {
    const C = pal(S), u = S.u;
    const run = (dx, dy) => { g.beginPath(); for (let i = 0; i < list.length; i += 6) { g.moveTo(list[i] + dx, list[i + 1] + dy); g.quadraticCurveTo(list[i + 2] + dx, list[i + 3] + dy, list[i + 4] + dx, list[i + 5] + dy); } };
    g.save(); g.lineCap = "round";
    run(1.5 * u, 2.6 * u); g.strokeStyle = shade(C, 0.34); g.lineWidth = w * 1.55; g.stroke();
    run(0, 0); g.strokeStyle = color; g.lineWidth = w; g.stroke();
    run(-0.45 * u, -0.6 * u); g.strokeStyle = lite(color, 0.6); g.globalAlpha = 0.55; g.lineWidth = Math.max(0.8, w * 0.34); g.stroke();
    g.restore();
  }
  // ---- compare: a tangle against a tidy weave -----------------------------------------------------------------
  // After the build the scene keeps winding to its last frame: the saving banner is knotted onto its nails,
  // the tangle's threads go slack and drop into a heap, and the tidy bar is drawn tight and settles.
  function compareScene(g, S, box, pp, d, info) {
    const u = S.u, C = pal(S), t = info.t, tall = S.tall;
    heading(g, S, "compare", ease(info.local / 0.7), t);
    const bw = Math.min(box.w * (tall ? 0.4 : 0.34), 600 * u), base = box.y + box.h - 130 * u, maxH = box.h - 130 * u - (tall ? 170 : 110) * u;
    const vmax = Math.max(d.leftValue, d.rightValue, 1);
    const build_ = Math.max(1.0, Math.min(2.3, info.hold * 0.56)), b0 = 0.75 * build_ - 0.3, rem = Math.max(1.2, info.hold - b0), bk = (info.local - b0) / rem, live = Math.max(0, bk * rem);
    const sides = [{ v: d.leftValue, label: d.left, cx: box.x + box.w * 0.24 }, { v: d.rightValue, label: d.right, cx: box.x + box.w * 0.76 }];
    const hOf = (v) => Math.max(maxH * 0.34, maxH * (v / vmax));
    const tc = [C.muted, C.rose, lite(C.brown, 0.3)];
    const tz = span(bk, 0.68, 0.84), settleT = (bk - 0.84) * rem;
    const squeeze = tz > 0 && tz < 1 ? -0.16 * Math.sin(Math.PI * tz) : settleT > 0 ? Math.exp(-2.2 * settleT) * Math.sin(settleT * 24) * 0.09 : 0;
    sides.forEach((s, i) => {
      const h = hOf(s.v), x0 = s.cx - bw / 2, x1 = s.cx + bw / 2, q = ease(span(pp, i * 0.3, i * 0.3 + 0.55)), col = i ? C.accent : C.muted;
      const rim = [x0, base, x1, base, x1, base - h, x0, base - h, x0, base];
      nails(g, S, once(`cn|${Math.round(x0)}|${Math.round(h)}`, () => { const p = []; const per = 12; for (let k = 0; k < per; k++) { const f = k / per; p.push(lerp(x0, x1, f), base); p.push(x1, lerp(base, base - h, f)); p.push(lerp(x1, x0, f), base - h); p.push(x0, lerp(base - h, base, f)); } return p; }), 4.6 * u, Math.ceil(48 * Math.max(0.2, q)));
      if (i === 0) {
        const r = once(`tg|${Math.round(x0)}|${Math.round(h)}`, () => {
          const rg = rng(909), P = [], on = () => { const e = Math.floor(rg() * 4), f = rg(); return e === 0 ? [lerp(x0, x1, f), base] : e === 1 ? [x1, lerp(base, base - h, f)] : e === 2 ? [lerp(x1, x0, f), base - h] : [x0, lerp(base - h, base, f)]; };
          for (let k = 0; k < 150; k++) { const a = on(), b = on(); P.push({ a, b, ph: rg() * TAU, c: k % 3, dl: 0.18 + rg() * 0.36, py: (2 + rg() * 26) * u, sx: (rg() - 0.5) * 40 * u }); }
          return P;
        });
        const calm = 1 - span(bk, 0.05, 0.3), jit = 4 * u * calm;
        if (bk < 0.08) {
          const segs = []; r.forEach((c) => segs.push(c.a[0] + Math.sin(t * 2.4 + c.ph) * jit, c.a[1] + Math.cos(t * 2.1 + c.ph) * jit, c.b[0] + Math.cos(t * 2.2 + c.ph) * jit, c.b[1] + Math.sin(t * 2.6 + c.ph) * jit));
          for (let c = 0; c < 3; c++) { const part = []; for (let k = c; k < segs.length / 4; k += 3) part.push(segs[k * 4], segs[k * 4 + 1], segs[k * 4 + 2], segs[k * 4 + 3]); strands(g, S, part, part.length / 4 * q, tc[c], 2.4 * u, { sheen: c === 0 ? fmod(t * 0.5, 1.6) / 1.6 : undefined }); }
        } else {
          // each thread loosens (its middle sags), then slips off its nails and drops to a heap on the floor
          const groups = [[], [], []];
          r.forEach((c) => {
            const sl = ease(span(bk, 0.08, c.dl)), f = ease(span(bk, c.dl, c.dl + 0.2)), floor = base - c.py;
            const ax = c.a[0] + c.sx * f, ay = lerp(c.a[1], floor, f), bx = c.b[0] - c.sx * f, by_ = lerp(c.b[1], floor - c.py * 0.3, f);
            const sag = (14 + 70 * sl) * u * (1 - f) + f * (6 + c.py * 0.4) * u * Math.sin(c.ph + 1), mx = (ax + bx) / 2 + Math.sin(t * 1.6 + c.ph) * 5 * u * sl * (1 - f), my = Math.min(floor + 4 * u, (ay + by_) / 2 + sag);
            groups[c.c].push(ax, ay, mx, my, bx, by_);
          });
          groups.forEach((list, c) => slack(g, S, list, tc[c], 2.4 * u));
          // a puff of dust sparkles where the threads land
          for (let k = 0; k < 4; k++) { const ph = fmod(bk * 3 + k / 4, 1), on_ = bk > 0.25 && bk < 0.85 ? 1 : 0; sparkle(g, lerp(x0, x1, (k + 0.5) / 4) + Math.sin(k * 3.1) * 20 * u, base - 20 * u - ph * 40 * u, 12 * u, on_ * Math.sin(Math.PI * ph) * 0.8, C.main); }
        }
      } else {
        const W_ = once(`neat|${Math.round(x0)}|${Math.round(h)}`, () => weave(x0, x1, base, h, 20 * u, "x")), total = W_.chords.length / 4;
        g.save(); g.translate(0, base); g.scale(1, 1 + squeeze); g.translate(0, -base);
        strands(g, S, W_.chords, total * q, col, 3 * u, { glow: 12 * u, sheen: fmod(t * 0.45, 1.6) / 1.6 });
        strands(g, S, W_.rails, W_.rails.length / 4 * q, lite(col, 0.5), 2.2 * u, { shadow: false });
        // the tightening pass: a bright thread re-winds the weave bottom to top as it is drawn tight
        if (tz > 0 && tz < 1) { const wk = ease(tz); const tip = strands(g, S, W_.chords, total * wk, lite(col, 0.7), 4.4 * u, { shadow: false, glow: 16 * u }); if (tip) bead(g, S, tip.x, tip.y, 7 * u, C.gold); }
        g.restore();
        if (settleT > 0) for (let k = 0; k < 3; k++) { const a = Math.exp(-1.2 * settleT) * 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(t * 3 + k * 2)); sparkle(g, s.cx + (k - 1) * bw * 0.36, base - h * (1 + squeeze) - (24 + k * 10) * u, 15 * u, a, C.main); }
      }
      const topH = i ? h * (1 + squeeze) : h;
      line(g, S, partOf(i ? [x0, base, x1, base, x1, base - topH, x0, base - topH, x0, base] : rim, q), i ? lite(C.accent, 0.4) : C.main, 5 * u);
      const bob = live > 0 ? Math.sin(live * 2.4 + i * 1.6) * 6 * u : 0;
      number(g, S, fmt(s.v, d, q), s.cx, base - topH - 90 * u + bob, 150 * u, clamp(q * 3), t, { col: i ? lite(C.accent, 0.35) : C.main, alt: i ? C.accent : C.muted, ph: i * 0.3 });
      tag(g, S, s.label, s.cx, base + 58 * u, ease(span(pp, i * 0.2, 0.4 + i * 0.2)), t, { ph: i * 1.9, maxW: box.w * 0.44, size: 46 });
    });
    // a heavy twisted cord carries threads from the tangle to the tidy weave
    const q = ease(span(pp, 0.62, 1)), hL = hOf(sides[0].v), hR = hOf(sides[1].v);
    const ax = sides[0].cx + bw / 2 + 30 * u, ay = base - hL * 0.5, bx_ = sides[1].cx - bw / 2 - 46 * u, by_ = base - hR * 0.5, mx = (ax + bx_) / 2, my = Math.min(ay, by_) - 90 * u + 8 * u * Math.sin(t * 2);
    const arc = []; for (let k = 0; k <= 40; k++) { const f = k / 40; arc.push((1 - f) * (1 - f) * ax + 2 * f * (1 - f) * mx + f * f * bx_, (1 - f) * (1 - f) * ay + 2 * f * (1 - f) * my + f * f * by_); }
    for (let sI = 0; sI < 2; sI++) {
      const tw = []; for (let k = 0; k <= 40; k++) { const f = k / 40, i2 = Math.min(39, k), nx = -(arc[i2 * 2 + 3] - arc[i2 * 2 + 1]), ny = arc[i2 * 2 + 2] - arc[i2 * 2], L = Math.hypot(nx, ny) || 1, w = Math.sin(TAU * (f * 4 - t * 0.8) + sI * Math.PI) * 7 * u; tw.push(arc[k * 2] + (nx / L) * w, arc[k * 2 + 1] + (ny / L) * w); }
      line(g, S, partOf(tw, q), sI ? C.main : C.gold, 6.5 * u);
    }
    nails(g, S, [ax, ay], 7 * u, q > 0 ? 1 : 0);
    if (q >= 1) {
      const A = Math.atan2(by_ - arc[77], bx_ - arc[76]), hl = 42 * u;
      line(g, S, [bx_ + Math.cos(A + 2.5) * hl, by_ + Math.sin(A + 2.5) * hl, bx_ + Math.cos(A) * 14 * u, by_ + Math.sin(A) * 14 * u, bx_ + Math.cos(A - 2.5) * hl, by_ + Math.sin(A - 2.5) * hl], C.main, 8 * u);
      for (let j = 0; j < 3; j++) { const sH = fmod(t * 0.7 + j / 3, 1), piece = sliceOf(arc, Math.max(0, sH - 0.2), sH); line(g, S, piece, lite(tc[j], 0.35), 5 * u, { glow: 10 * u }); const b = pointAlong(arc, sH); bead(g, S, b.x, b.y, 7 * u, C.gold); }
    }
    // the saving banner: woven on, then knotted to its two nails with a cinch that lifts it taut
    if (d.leftValue > 0 && d.rightValue !== d.leftValue) {
      const pct = Math.round(((d.rightValue - d.leftValue) / d.leftValue) * 100), txt = (pct > 0 ? "+" : "−") + Math.abs(pct) + "%";
      const rq = ease(span(pp, 0.55, 0.95)), kq = ease(span(bk, 0.0, 0.3)), cinchT = (bk - 0.3) * rem;
      const lift = kq * 14 * u + (cinchT > 0 ? Math.exp(-3 * cinchT) * Math.sin(cinchT * 22) * 8 * u : 0);
      const rx = sides[1].cx, rw = Math.min(bw * 1.15, 560 * u), ry = Math.max(box.y - 10 * u, base - hR - 330 * u) - lift, sag = (26 - 12 * kq) * u + 8 * u * Math.sin(t * 1.7), bh = 112 * u;
      const xL = rx - rw / 2, xR = rx + rw / 2, top = [], bot = [];
      for (let k = 0; k <= 16; k++) { const f = k / 16, y = ry + Math.sin(Math.PI * f) * sag + Math.sin(f * 9 - t * 3) * 3 * u; top.push(lerp(xL, xR, f), y); bot.push(lerp(xL, xR, f), y + bh); }
      if (rq > 0) {
        const lad = []; for (let k = 0; k < 16; k++) { lad.push(top[k * 2], top[k * 2 + 1], bot[k * 2 + 2], bot[k * 2 + 3]); lad.push(bot[k * 2], bot[k * 2 + 1], top[k * 2 + 2], top[k * 2 + 3]); }
        g.save(); g.beginPath(); g.moveTo(top[0], top[1]); for (let k = 1; k <= 16; k++) g.lineTo(top[k * 2], top[k * 2 + 1]); for (let k = 16; k >= 0; k--) g.lineTo(bot[k * 2], bot[k * 2 + 1]); g.closePath(); g.globalAlpha = 0.88 * rq; g.fillStyle = C.disc; g.fill(); g.restore();
        strands(g, S, lad, lad.length / 4 * rq, hexA(C.accent, 0.55), 2 * u, { shadow: false, sheen: fmod(t * 0.4, 1.5) / 1.5 });
        line(g, S, partOf(top, rq), lite(C.accent, 0.3), 4.4 * u); line(g, S, partOf(bot, rq), lite(C.accent, 0.3), 4.4 * u);
        // knots: a coil of thread wound round each top nail, two tails hanging and swinging below
        for (const [kx, ky, sg] of [[xL, top[1], -1], [xR, top[33], 1]]) {
          if (kq > 0) {
            const coil = []; for (let k = 0; k <= 40; k++) { const a = k * 0.55, rr_ = (5 + k * 0.42) * u * (1.3 - 0.3 * kq); coil.push(kx + Math.cos(a) * rr_, ky + Math.sin(a) * rr_ * 0.8); }
            line(g, S, partOf(coil, kq), C.gold, 3.4 * u);
            for (let k = 0; k < 2; k++) { const sw_ = Math.sin(t * 2.2 + k * 1.4 + sg) * 0.25, L = (54 + k * 22) * u * kq, a = Math.PI / 2 + sg * (0.35 + k * 0.25) + sw_; line(g, S, [kx, ky, kx + Math.cos(a) * L * 0.5 + Math.sin(t * 3 + k) * 4 * u, ky + Math.sin(a) * L * 0.5, kx + Math.cos(a) * L, ky + Math.sin(a) * L], C.gold, 3 * u); }
            if (kq < 1) sparkle(g, kx, ky, 22 * u, 1 - kq, C.main);
          }
        }
        nails(g, S, [xL, top[1], xR, top[33], xL, bot[1], xR, bot[33]], 7 * u);
        number(g, S, txt, rx, ry + sag * 0.8 + bh / 2, 96 * u, clamp((rq - 0.4) * 2.5), t, { col: lite(C.accent, 0.4), alt: C.gold, ph: 0.6 });
        const sp = fmod(t * 0.9, 1); sparkle(g, lerp(xL, xR, sp), ry + Math.sin(Math.PI * sp) * sag, 16 * u, Math.sin(Math.PI * sp) * (kq >= 1 ? 1 : 0), C.main);
      }
    }
  }

  // ---- title and closing, drawn by the stage ----------------------------------------------------------------
  function titleArt(g, S, local, t, closing) {
    const { W, H, u, tall } = S, C = pal(S), side = (tall ? 90 : 140) * u, F = 34 * u;
    const cr = Math.min(250 * u, (H - F * 2) * 0.4), cw = W * 0.42;
    const roses = tall
      ? [{ x: W / 2, y: H * 0.26, r: 360 * u }]
      : closing ? [{ x: F + cr + 46 * u, y: H * 0.54, r: cr }, { x: W - F - cr - 46 * u, y: H * 0.54, r: cr }] : [{ x: W * 0.78, y: H * 0.5, r: 365 * u }];
    if (closing && tall) { roses[0] = { x: W / 2, y: H * 0.22, r: 300 * u }; roses.push({ x: W / 2, y: H * 0.8, r: 270 * u }); }
    { // bare felt behind the words, laid before the roses so they stay bright
      const hw = closing ? (tall ? W - side * 2 : cw) : tall ? W - side * 2 : W * 0.46, txt = textOf(closing ? "closing" : "title");
      const tt = closing ? headBlock(S, txt, hw, (tall ? 112 : 120) * u, 76 * u, 4, { align: "center" }) : headBlock(S, txt, hw, (tall ? 120 : 132) * u, 80 * u, 4, { align: tall ? "center" : "left" });
      const ty = closing ? (H - tt.H) / 2 + 40 * u : tall ? H * 0.5 : (H - tt.H) / 2 + 60 * u, x0 = closing || tall ? W / 2 - tt.maxw / 2 : side;
      hush(g, S, x0 - tt.pad, ty - tt.pad, tt.maxw + tt.pad * 2, tt.H, 0.84 * clamp(local * 2));
    }
    // On the closing card every figure holds still except one thread: a finger hooks it out of the first
    // rose, stretches it, lets go, and it twangs while everything else stays put.
    const pull0 = 1.1, rel = 1.75, since = local - rel;
    roses.forEach((R, k) => {
      const m = closing ? 2.62 + k * 0.33 : 2 + 1.5 * (0.5 - 0.5 * Math.cos(t * 0.38 + k * 1.7)), rot = closing ? k * 0.2 : t * (k % 2 ? -0.07 : 0.07), n = 96;
      const tq = ease((local - k * 0.2) / (closing ? 1.0 : 1.8));
      let segs = rose(R.x, R.y, R.r, n, m, rot), pick = -1;
      if (closing && k === 0) {
        pick = once(`pick|${Math.round(R.x)}|${Math.round(R.r)}|${m}`, () => { let best = 0, bv = -Infinity; for (let i = 0; i < n; i++) { const L = Math.hypot(segs[i * 4 + 2] - segs[i * 4], segs[i * 4 + 3] - segs[i * 4 + 1]), mx = (segs[i * 4] + segs[i * 4 + 2]) / 2 - R.x, my = (segs[i * 4 + 1] + segs[i * 4 + 3]) / 2 - R.y, v = 0.7 * (tall ? my : mx) / R.r + L / R.r; if (v > bv) { bv = v; best = i; } } return best; });
        if (tq >= 1) segs = segs.slice(0, pick * 4).concat(segs.slice(pick * 4 + 4));
      }
      strands(g, S, segs, segs.length / 4 * tq, C.cols[(k + 1) % 5], 2.6 * u, { sheen: fmod(t * 0.35 + k * 0.4, 1.7) / 1.7 });
      strands(g, S, rose(R.x, R.y, R.r * 0.64, 60, -m * 0.5 - 1, -rot * 1.6), 60 * tq, C.cols[(k + 3) % 5], 2.2 * u, { sheen: fmod(t * 0.3 + 0.3, 1.5) / 1.5 });
      strands(g, S, rose(R.x, R.y, R.r * 0.3, 36, closing ? 3.3 : 3 + 0.6 * Math.sin(t * 0.6), rot * 2), 36 * tq, C.main, 2 * u, { shadow: false });
      nails(g, S, ringPts(R.x, R.y, R.r, 48, rot), 4.4 * u, Math.ceil(48 * tq));
      nails(g, S, ringPts(R.x, R.y, R.r * 0.64, 30, -rot * 1.6), 3.6 * u, Math.ceil(30 * tq));
      if (pick >= 0 && tq >= 1) {
        const all = rose(R.x, R.y, R.r, n, m, rot), x1 = all[pick * 4], y1 = all[pick * 4 + 1], x2 = all[pick * 4 + 2], y2 = all[pick * 4 + 3];
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = mx - R.x, dy = my - R.y, dl = Math.hypot(dx, dy) || 1, ux = tall ? 0 : 1, uy = tall ? 1 : 0; void dx; void dy; void dl;
        const reach = (R.x + R.r * 1.05 - mx) * (tall ? 0 : 1) + (tall ? R.y + R.r * 1.05 - my : 0); const rq_ = ease(span(local, pull0, rel - 0.1)), pullD = reach * rq_;
        const col = C.accent;
        if (since < 0) {
          const fx = mx + ux * pullD, fy = my + uy * pullD;
          line(g, S, [x1, y1, fx, fy, x2, y2], col, 3.6 * u, { glow: 10 * u });
          if (local > pull0 - 0.15) bead(g, S, fx, fy, 9 * u, C.gold, clamp((local - pull0 + 0.15) * 6));
        } else {
          const amp = reach * 0.8 * Math.exp(-0.9 * since) * Math.cos(since * 26), L = Math.hypot(x2 - x1, y2 - y1) || 1, side_ = ((x2 - x1) * uy - (y2 - y1) * ux) / L >= 0 ? 1 : -1;
          line(g, S, taut(x1, y1, x2, y2, amp * side_, 40), col, 4.4 * u, { glow: 14 * u });
          for (let j = 0; j < 3; j++) { const ph = fmod(since * 1.4 + j / 3, 1); sparkle(g, mx + ux * R.r * 0.3 * (1 + ph), my + uy * R.r * 0.3 * (1 + ph), (10 + 14 * (1 - ph)) * u, (1 - ph) * Math.exp(-0.8 * since), C.main); }
        }
        nails(g, S, [x1, y1, x2, y2], 5.6 * u);
      }
      // beads circle the title rose; on the closing card only a slow glint passes
      if (!closing) for (let b = 0; b < 3; b++) { const a = t * 0.5 + (b * TAU) / 3 + k, rr_ = R.r * (1.06 + 0.02 * Math.sin(t + b)); bead(g, S, R.x + Math.cos(a) * rr_, R.y + Math.sin(a) * rr_, 6 * u, C.gold, tq); }
    });
    // words
    const id = closing ? "closing" : "title", text = textOf(id);
    if (!closing) {
      const w = tall ? W - side * 2 : W * 0.46, tt = headBlock(S, text, w, (tall ? 120 : 132) * u, 80 * u, tall ? 4 : 4, { align: tall ? "center" : "left" });
      const tx = tall ? W / 2 : side, ty = tall ? H * 0.5 : (H - tt.H) / 2 + 60 * u;
      drawWoven(g, S, tt, tx, ty, ease(local / 1.0), t, { anchor: tall ? "center" : "left" });
      tag(g, S, textOf("kicker"), tall ? W / 2 : side, ty - (tall ? 130 : 150) * u, ease((local - 0.15) / 0.6), t, { left: !tall, maxW: w, size: 44, ph: 1 });
    } else {
      const w = tall ? W - side * 2 : cw, tt = headBlock(S, text, w, (tall ? 112 : 120) * u, 76 * u, 4, { align: "center" });
      drawWoven(g, S, tt, W / 2, (H - tt.H) / 2 + 40 * u, ease(local / 1.0), t, { anchor: "center" });
    }
  }

  function stage(ctx, S, info) {
    const P = plan(), g = ctx, t = info.t;
    ambient(g, S, t);
    const idx = info.index, cur = info.scene;
    const stageScene = cur === "title" || cur === "closing";
    const prev = idx > 0 ? P.ids[idx - 1] : null;
    if (stageScene) {
      const closing = cur === "closing", k = idx > 0 && info.local < info.change ? info.local / info.change : 1;
      g.save();
      if (idx > 0 && k < 1) clipSide(g, S, idx - 1, k, "in");
      titleArt(g, S, info.local + 0.3, t, closing);
      g.restore();
      if (prev === "title" && k < 1) ribbon(g, S, idx - 1, k, t);
    } else if (prev === "title" && info.local < info.change) {
      const k = info.local / info.change, th = P.shown[idx - 1].hold;
      g.save(); clipSide(g, S, idx - 1, k, "out"); titleArt(g, S, th + info.local, t, false); g.restore();
    }
  }

  // ---- tokens ------------------------------------------------------------------------------------------------------
  const SKINS = ["#f2c9a5", "#d9a074", "#a8704a", "#7a4a31", "#efb8a0", "#c88b5e"];
  const THR = { main: "#f8ecd0", alt: "#f4b942", gold: "#f4b942", teal: "#36c5b1", violet: "#9c88f6", rose: "#f58ca9", brass: "#d8a244", brown: "#a8714a", hair: "#2a1d2e", muted: "#8f98b3", skins: SKINS };
  const halo = (c) => () => `0 0 2px ${c}, 0 0 14px ${c}`;
  return {
    bg: "#101b36", panel: "rgba(255,255,255,0.06)", ink: "#f8ecd0", muted: "#9aa3bf", accent: "#ff6f59", onAccent: "#101b36", rule: "rgba(248,236,208,0.6)", track: "rgba(248,236,208,0.12)",
    display: FONT, displayWeight: 800, displayCase: "none", displayTracking: "0em", body: FONT, bodyWeight: 700, figures: FONT, radius: 14,
    motion: "stroke", change: "grid", kit: { line: 3, fill: "none", panel: "outline" },
    board: "#101b36", wood: "#8a5a34", shade: "4,8,20", tagBg: "#f3e2b8", tagInk: "#1d2745", disc: "#0a1226", thr: THR,
    keepArt: true, overlap: true,
    palettes: {
      light: { bg: "#efe4cb", ink: "#1d2745", muted: "#6c6a78", accent: "#d9482f", onAccent: "#ffffff", board: "#efe4cb", wood: "#b07b4a", shade: "70,45,15", tagBg: "#fffaf0", tagInk: "#1d2745", disc: "#fff6e0", panel: "rgba(29,39,69,0.06)", rule: "rgba(29,39,69,0.6)", track: "rgba(29,39,69,0.1)",
        thr: { ...THR, main: "#1d2f5c", alt: "#d9482f", gold: "#d99a1f", teal: "#14877a", violet: "#6b52d6", rose: "#d9547a", brass: "#c99430", muted: "#7b7a88", hair: "#1d1425" } },
      dark: { bg: "#070b17", board: "#070b17", wood: "#5a3a22", shade: "0,0,6", disc: "#04070f", tagBg: "#e9d7ad" },
      mono: { bg: "#d9d8d2", ink: "#1f1f1f", muted: "#6d6d68", accent: "#262626", onAccent: "#d9d8d2", board: "#d9d8d2", wood: "#7d7a72", shade: "20,20,18", tagBg: "#f2f1ec", tagInk: "#1f1f1f", disc: "#efeee9", panel: "rgba(30,30,30,0.06)", rule: "rgba(30,30,30,0.6)", track: "rgba(30,30,30,0.1)",
        thr: { main: "#1c1c1c", alt: "#5a5a56", gold: "#4a4a46", teal: "#6a6a66", violet: "#2e2e2c", rose: "#808078", brass: "#9a9890", brown: "#4a4640", hair: "#141414", muted: "#8a8a84", skins: ["#bdbdb8", "#9a9a95", "#7c7c78", "#5c5c58", "#aaaaa5", "#8c8c88"] } },
    },
    css: () => ".display, .kicker { color: transparent !important; text-shadow: none !important; -webkit-text-fill-color: transparent !important; }",
    textShadow: halo("transparent"),
    backdrop: (accent, texture, look) => look.board,
    stage,
    scenes: { chart: wrapScene("chart", chartScene), object: wrapScene("object", deviceScene), people: wrapScene("people", peopleScene), process: wrapScene("process", processScene), compare: wrapScene("compare", compareScene) },
  };
});
