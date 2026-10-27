// Manga: a page of an original manga, inked live. Slanted panels slam open, tapered ink, focus lines and
// screentone drift, katakana sound effects shake, and a diagonal ink slash wipes one page into the next.
// An invented cast (Mio the editor, Clap the clapperboard) lives in every scene. All art is original.
// Frames are pure functions of time; texture uses seeded generators only.
window.DreamcutMotion.register("manga", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const easeIn = (v) => { v = clamp(v); return v * v; };
  const inout = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); return 1 + 2.9 * Math.pow(v - 1, 3) + 1.9 * Math.pow(v - 1, 2); };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const LET = "'Avenir Next Condensed','DIN Condensed','Roboto Condensed','Arial Narrow',Impact,sans-serif";
  const FIG = "Impact,'Haettenschweiler','Anton','Avenir Next Condensed','Arial Narrow',sans-serif";
  const SFXF = "'Hiragino Sans','Hiragino Kaku Gothic ProN','Yu Gothic','Meiryo','Noto Sans CJK JP','Noto Sans JP',sans-serif";
  const hash = (a, b = 0, c = 0) => {
    let x = Math.imul(Math.floor(a), 374761393) ^ Math.imul(Math.floor(b), 668265263) ^ Math.imul(Math.floor(c), 2147483647);
    x = Math.imul(x ^ (x >>> 13), 1274126177); x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  };
  const STEP = 12; // drawn "on twos": the line-work redraws twelve times a second
  const TITLES = { chart: ["chart-title"], object: ["object-title"], people: ["people-title"], process: ["process-title"], compare: ["compare-title"], title: ["kicker", "title"], closing: ["closing"] };

  // ---- ink: tapered strokes, wedges, tone ---------------------------------------------------------
  const PROF = {
    both: (s) => Math.pow(Math.sin(Math.PI * s), 0.7),
    tail: (s) => Math.min(1, s / 0.1) * (1 - 0.92 * s),
    brush: (s) => Math.min(1, s / 0.08) * (1 - 0.75 * Math.max(0, (s - 0.5) / 0.5)),
    flat: () => 1,
  };
  function taper(g, pts, width, prof = PROF.both) {
    const n = pts.length;
    if (n < 2) return;
    const L = [], Rt = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      const w = width * prof(i / (n - 1)) * 0.5;
      L.push([pts[i][0] - dy * w, pts[i][1] + dx * w]); Rt.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
    }
    g.beginPath(); g.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i < n; i++) g.lineTo(L[i][0], L[i][1]);
    for (let i = n - 1; i >= 0; i--) g.lineTo(Rt[i][0], Rt[i][1]);
    g.closePath(); g.fill();
  }
  function bez(x0, y0, cx, cy, x1, y1, n = 16) {
    const out = [];
    for (let i = 0; i <= n; i++) { const s = i / n, a = (1 - s) * (1 - s), b = 2 * s * (1 - s), c = s * s; out.push([a * x0 + b * cx + c * x1, a * y0 + b * cy + c * y1]); }
    return out;
  }
  const lens = (g, x0, y0, x1, y1, w) => {
    const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1, nx = -dy / d * w * 0.5, ny = dx / d * w * 0.5, mx = lerp(x0, x1, 0.4), my = lerp(y0, y1, 0.4);
    g.moveTo(x0, y0); g.lineTo(mx + nx, my + ny); g.lineTo(x1, y1); g.lineTo(mx - nx, my - ny); g.closePath();
  };
  // Focus lines: wedges radiating from (cx, cy), redrawn on twos so they shimmer like pen work.
  function focus(g, cx, cy, r0, r1, n, wMax, seed, t, color, spin = 0) {
    const R = rng(seed), step = Math.floor(t * STEP);
    g.fillStyle = color; g.beginPath();
    for (let i = 0; i < n; i++) {
      const base = (i + R() * 0.8) / n * TAU + spin, jr = hash(seed, i, step), a = base + (jr - 0.5) * 0.016;
      const rIn = r0 * (1 + R() * 0.9 + jr * 0.12), w = wMax * (0.35 + R() * 0.65) / r1;
      const ox = Math.cos(a - w), oy = Math.sin(a - w), px = Math.cos(a + w), py = Math.sin(a + w);
      g.moveTo(cx + Math.cos(a) * rIn, cy + Math.sin(a) * rIn); g.lineTo(cx + ox * r1, cy + oy * r1); g.lineTo(cx + px * r1, cy + py * r1); g.closePath();
    }
    g.fill();
  }
  // Parallel speed streaks drifting across a rectangle.
  function streaks(g, bb, ang, n, seed, t, speed, wMax, color, lenK = 0.5) {
    const R = rng(seed), ca = Math.cos(ang), sa = Math.sin(ang), diag = Math.hypot(bb.w, bb.h);
    const cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
    g.fillStyle = color; g.beginPath();
    for (let i = 0; i < n; i++) {
      const off = (R() - 0.5) * diag, len = diag * lenK * (0.3 + R() * 0.7), ph = (R() + t * speed * (0.6 + R() * 0.8)) % 1;
      const along = (ph - 0.5) * (diag + len) * 1.1, w = wMax * (0.3 + R() * 0.7);
      const mx = cx + ca * along - sa * off, my = cy + sa * along + ca * off;
      lens(g, mx - ca * len / 2, my - sa * len / 2, mx + ca * len / 2, my + sa * len / 2, w);
    }
    g.fill();
  }
  // Screentone: a lattice of dots at 45 degrees whose size follows a field f(x, y) in 0..1.
  function tone(g, bb, cell, f, color, ox = 0, oy = 0, ang = Math.PI / 4) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
    for (const [x, y] of [[bb.x, bb.y], [bb.x + bb.w, bb.y], [bb.x + bb.w, bb.y + bb.h], [bb.x, bb.y + bb.h]]) {
      const a = ((x - ox) * ca + (y - oy) * sa) / cell, b = (-(x - ox) * sa + (y - oy) * ca) / cell;
      a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b);
    }
    g.fillStyle = color; g.beginPath();
    for (let a = Math.floor(a0); a <= Math.ceil(a1); a++) for (let b = Math.floor(b0); b <= Math.ceil(b1); b++) {
      const x = ox + (a * ca - b * sa) * cell, y = oy + (a * sa + b * ca) * cell;
      if (x < bb.x - cell || x > bb.x + bb.w + cell || y < bb.y - cell || y > bb.y + bb.h + cell) continue;
      const v = f(x, y);
      if (v <= 0.03) continue;
      const r = cell * 0.5 * Math.sqrt(Math.min(1.25, v)) * 1.1;
      g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU);
    }
    g.fill();
  }
  const flat = (v) => () => v;
  const linear = (x0, y0, x1, y1, v0, v1) => { const dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy || 1; return (x, y) => lerp(v0, v1, clamp(((x - x0) * dx + (y - y0) * dy) / L)); };
  const radial = (cx, cy, r0, r1, v0, v1) => (x, y) => lerp(v0, v1, clamp((Math.hypot(x - cx, y - cy) - r0) / (r1 - r0)));
  function star(g, x, y, r, rot = 0, pinch = 0.2) {
    g.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = rot + (i * TAU) / 4, b = a + TAU / 8, c = a + TAU / 4;
      if (i === 0) g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      g.quadraticCurveTo(x + Math.cos(b) * r * pinch, y + Math.sin(b) * r * pinch, x + Math.cos(c) * r, y + Math.sin(c) * r);
    }
    g.closePath();
  }
  function poly(g, pts) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); }
  const bboxOf = (pts) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };

  // ---- panel layout --------------------------------------------------------------------------------
  // Columns split by dividers that lean: the top of each gutter sits `slant` to the right of its bottom.
  function cols(r, ratios, slant, gut) {
    const tot = ratios.reduce((a, b) => a + b, 0), xs = [r.x];
    let acc = 0;
    for (const v of ratios) { acc += v; xs.push(r.x + (r.w * acc) / tot); }
    return ratios.map((_, i) => {
      const last = i === ratios.length - 1, gl = i ? gut / 2 : 0, gr = last ? 0 : gut / 2, sl = i ? slant / 2 : 0, sr = last ? 0 : slant / 2;
      return [[xs[i] + sl + gl, r.y], [xs[i + 1] + sr - gr, r.y], [xs[i + 1] - sr - gr, r.y + r.h], [xs[i] - sl + gl, r.y + r.h]];
    });
  }
  // Rows split by dividers that rise to the right.
  function rows(r, ratios, slant, gut) {
    const tot = ratios.reduce((a, b) => a + b, 0), ys = [r.y];
    let acc = 0;
    for (const v of ratios) { acc += v; ys.push(r.y + (r.h * acc) / tot); }
    return ratios.map((_, i) => {
      const last = i === ratios.length - 1, gt = i ? gut / 2 : 0, gb = last ? 0 : gut / 2, st = i ? slant / 2 : 0, sb = last ? 0 : slant / 2;
      return [[r.x, ys[i] + st + gt], [r.x + r.w, ys[i] - st + gt], [r.x + r.w, ys[i + 1] - sb - gb], [r.x, ys[i + 1] + sb - gb]];
    });
  }
  const centroid = (pts) => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
  // A panel pops open from its centre: ink border first, art revealed through the growing frame.
  function panel(g, F, pts, q, draw, o = {}) {
    if (q <= 0.01) return;
    const [cx, cy] = centroid(pts), s = o.noPop ? ease(q) : back(q);
    const sp = pts.map(([x, y]) => [cx + (x - cx) * s, cy + (y - cy) * s]);
    g.save();
    poly(g, sp); g.fillStyle = o.fill || F.pnl(1); g.fill(); g.clip();
    if (draw) draw(g, bboxOf(pts), sp);
    g.restore();
    g.save();
    poly(g, sp); g.lineJoin = "miter"; g.miterLimit = 3; g.lineWidth = (o.bw || 5.5) * F.u; g.strokeStyle = F.ink(1); g.stroke();
    g.restore();
  }

  // ---- lettering -----------------------------------------------------------------------------------
  function say(g, F, s, x, y, size, o = {}) {
    s = String(s ?? "");
    if (o.upper !== false) s = s.toUpperCase();
    if (!s) return 0;
    const font = o.font || LET, weight = o.weight || 800;
    g.save();
    g.font = `${weight} ${size}px ${font}`;
    g.letterSpacing = (o.track ?? 0.02) * size + "px";
    let w = g.measureText(s).width;
    if (o.maxW && w > o.maxW) { size = Math.max(o.min || size * 0.7, (size * o.maxW) / w); g.font = `${weight} ${size}px ${font}`; g.letterSpacing = (o.track ?? 0.02) * size + "px"; w = g.measureText(s).width; }
    g.textBaseline = o.base || "alphabetic"; g.textAlign = "left"; g.lineJoin = "round";
    const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    if (o.rot) { g.translate(x, y); g.rotate(o.rot); g.translate(-x, -y); }
    if (o.halo) { g.lineWidth = size * (o.haloW || 0.16); g.strokeStyle = o.halo; g.strokeText(s, x0, y); }
    g.fillStyle = o.color || F.ink(1);
    g.fillText(s, x0, y);
    g.restore();
    return w;
  }
  // Katakana sound effect: ink outline, paper outline, ink fill; it throbs and shakes on twos.
  function sfx(g, F, text, x, y, size, o = {}) {
    const q = o.q ?? 1;
    if (q <= 0.01) return;
    const { u, t } = F, step = Math.floor(t * STEP), chars = [...text], n = chars.length;
    if (o.maxW && !o.vertical) size = Math.min(size, o.maxW / (Math.max(1, n) * 0.9));
    const jx = (hash(step, 3, o.seed || 0) - 0.5) * (o.shake ?? 5) * u, jy = (hash(step, 7, o.seed || 0) - 0.5) * (o.shake ?? 5) * u;
    const pulse = 1 + 0.045 * Math.sin(t * 9 + (o.seed || 0));
    g.save();
    g.translate(x + jx, y + jy); g.rotate(o.rot || 0); g.scale(back(q) * pulse * (o.flipX ? -1 : 1), back(q) * pulse);
    g.transform(1, 0, -(o.skew ?? 0.16), 1, 0, 0);
    g.font = `900 ${size}px ${SFXF}`; g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round"; g.miterLimit = 2;
    const fill = o.fill || F.ink(1), edge = o.edge || F.pap(1), outer = o.outer || F.ink(1);
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < n; i++) {
        const k = n > 1 ? i - (n - 1) / 2 : 0, grow = 1 + i * 0.07;
        g.save();
        g.translate(o.vertical ? 0 : k * size * 0.86, o.vertical ? k * size * 0.9 : 0);
        g.rotate((hash(i, 11, o.seed || 0) - 0.5) * 0.14 + (o.vertical ? 0 : (i - n / 2) * 0.02));
        g.scale(grow, grow);
        if (pass === 0) { g.lineWidth = size * 0.3; g.strokeStyle = outer; g.strokeText(chars[i], 0, 0); }
        else if (pass === 1) { g.lineWidth = size * 0.17; g.strokeStyle = edge; g.strokeText(chars[i], 0, 0); }
        else { g.fillStyle = fill; g.fillText(chars[i], 0, 0); }
        g.restore();
      }
    }
    g.restore();
  }
  // A label on a slanted plate; the plate and its lettering reveal together, left to right.
  function tag(g, F, s, x, y, size, q, o = {}) {
    s = String(s ?? "").toUpperCase();
    if (!s || q <= 0.01) return { w: 0, h: 0 };
    const { u } = F;
    g.save();
    g.font = `800 ${size}px ${LET}`; g.letterSpacing = 0.03 * size + "px";
    let tw = g.measureText(s).width, fs = size;
    const pad = size * 0.5, h = size * 1.5;
    if (o.maxW && tw + pad * 2 > o.maxW) { fs = Math.max(o.min || size * 0.8, (size * (o.maxW - pad * 2)) / tw); g.font = `800 ${fs}px ${LET}`; g.letterSpacing = 0.03 * fs + "px"; tw = g.measureText(s).width; }
    const w = tw + pad * 2, x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x, y0 = y - h / 2, sk = h * 0.18, sh = 7 * u;
    g.beginPath(); g.rect(x0 - 4 * u, y0 - 8 * u, (w + sh + 12 * u) * ease(q), h + sh + 16 * u); g.clip();
    const plate = () => { g.beginPath(); g.moveTo(x0 + sk, y0); g.lineTo(x0 + w + sk, y0); g.lineTo(x0 + w - sk * 0.3, y0 + h); g.lineTo(x0 - sk * 0.3, y0 + h); g.closePath(); };
    g.translate(sh, sh); plate(); g.fillStyle = o.shadow || F.ink(1); g.fill(); g.translate(-sh, -sh);
    plate(); g.fillStyle = o.fill || F.pap(1); g.fill();
    g.lineJoin = "miter"; g.lineWidth = 3.6 * u; g.strokeStyle = F.ink(1); g.stroke();
    g.textBaseline = "middle"; g.textAlign = "left"; g.fillStyle = o.color || (o.fill === F.acc(1) ? F.onAcc : F.ink(1));
    g.fillText(s, x0 + pad + sk * 0.35, y0 + h / 2 + size * 0.04);
    g.restore();
    return { w, h, x: x0, y: y0 };
  }
  // A round speech balloon with a pointed tail, drawn from the balloon's own centre.
  function bubble(g, F, cx, cy, rx, ry, tx, ty, q) {
    if (q <= 0.01) return;
    const { u } = F, s = back(q);
    g.save(); g.translate(cx, cy); g.scale(s, s);
    const a = Math.atan2(ty - cy, tx - cx), spread = 0.34;
    g.beginPath();
    g.ellipse(0, 0, rx, ry, 0, a + spread, a - spread + TAU);
    g.lineTo(tx - cx, ty - cy);
    g.closePath();
    g.fillStyle = F.pap(1); g.fill(); g.lineWidth = 4.5 * u; g.lineJoin = "round"; g.strokeStyle = F.ink(1); g.stroke();
    g.restore();
  }
  // A spiky burst outline (shout balloon / impact flash) that boils on twos.
  function burst(g, cx, cy, rx, ry, spikes, depth, seed, t, rot = 0) {
    const step = Math.floor(t * STEP);
    g.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const a = rot + (i / (spikes * 2)) * TAU, outer = i % 2 === 0, j = 1 + (hash(seed, i, step) - 0.5) * 0.14;
      const k = outer ? 1 + depth * (0.6 + 0.4 * hash(seed, i, 99)) : 1 - depth * 0.15;
      const x = cx + Math.cos(a) * rx * k * j, y = cy + Math.sin(a) * ry * k * j;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
  }

  // ---- the cast ------------------------------------------------------------------------------------
  // People are drawn in head-radius units (r = 1) and placed with translate + scale, so line weight scales with them.
  function eye(g, F, side, expr, open, lk) {
    const ink = F.ink(1), pap = F.pap(1), x = side * 0.42, y = 0.2;
    g.save(); g.translate(x, y);
    if (expr === "happy" || expr === "cheer") {
      g.lineCap = "round"; g.strokeStyle = ink; g.lineWidth = 0.1;
      g.beginPath(); g.moveTo(-0.22, 0.06); g.quadraticCurveTo(0, -0.26, 0.22, 0.06); g.stroke();
      g.restore(); return;
    }
    const rx = expr === "shock" ? 0.27 : 0.25, ry = (expr === "shock" ? 0.34 : 0.3) * open;
    // white of the eye, then iris clipped inside it
    g.beginPath(); g.ellipse(0, 0, rx, Math.max(0.02, ry), 0, 0, TAU); g.fillStyle = pap; g.fill(); g.lineWidth = 0.035; g.strokeStyle = ink; g.stroke();
    g.save(); g.beginPath(); g.ellipse(0, 0, rx, Math.max(0.02, ry), 0, 0, TAU); g.clip();
    const ir = expr === "shock" ? 0.09 : 0.17, iry = (expr === "shock" ? 0.12 : 0.27) * open;
    g.beginPath(); g.ellipse(lk[0] * 0.07, lk[1] * 0.05 + 0.02, ir, Math.max(0.02, iry), 0, 0, TAU); g.fillStyle = ink; g.fill();
    if (expr !== "shock") {
      g.fillStyle = pap; g.beginPath(); g.arc(lk[0] * 0.07 - 0.06, lk[1] * 0.05 - 0.09 * open, 0.065, 0, TAU); g.fill();
      g.beginPath(); g.arc(lk[0] * 0.07 + 0.07, lk[1] * 0.05 + 0.1 * open, 0.03, 0, TAU); g.fill();
    }
    g.restore();
    // heavy upper lash with an outward flick
    g.fillStyle = ink;
    const e = Math.max(0.02, ry);
    taper(g, [[-rx * side * 0.9, e * 0.2], [-rx * 0.8 * side, -e * 0.8], [0, -e * 1.12], [rx * 0.8 * side, -e * 0.8], [rx * side * 1.15, -e * 0.55], [rx * side * 1.42, -e * 0.78]].map(([a, b]) => [a, b]), 0.1, (s) => 0.4 + 0.6 * Math.sin(Math.PI * Math.min(1, s * 1.1)));
    g.restore();
  }
  function brow(g, F, side, expr) {
    const tilt = { idle: 0, happy: -0.05, cheer: -0.08, shock: -0.16, sad: 0.2, wow: -0.12, stern: -0.2 }[expr] ?? 0;
    g.save(); g.translate(side * 0.44, -0.2 - (expr === "shock" || expr === "wow" ? 0.1 : 0)); g.rotate(side * tilt * -1.2);
    g.fillStyle = F.ink(1); taper(g, bez(-0.24 * side, 0.02, 0, -0.07, 0.22 * side, 0.01, 8), 0.07, PROF.both);
    g.restore();
  }
  function mouth(g, F, expr, t, seed) {
    const ink = F.ink(1);
    g.save(); g.translate(0, 0.72); g.lineCap = "round"; g.lineJoin = "round";
    if (expr === "cheer" || expr === "happy") {
      const open = expr === "cheer" ? 0.16 + 0.04 * Math.sin(t * 7 + seed) : 0.07;
      g.beginPath(); g.moveTo(-0.2, -0.02); g.quadraticCurveTo(0, 0.1 + open * 2, 0.2, -0.02); g.quadraticCurveTo(0, -0.04, -0.2, -0.02); g.closePath();
      g.fillStyle = ink; g.fill();
      if (expr === "cheer") { g.beginPath(); g.ellipse(0, 0.075 + open * 0.5, 0.09, 0.04, 0, 0, TAU); g.fillStyle = F.acc(1); g.fill(); }
    } else if (expr === "shock" || expr === "wow") {
      g.beginPath(); g.ellipse(0, 0.04, 0.07, 0.1 + 0.015 * Math.sin(t * 8), 0, 0, TAU); g.fillStyle = ink; g.fill();
    } else if (expr === "sad") {
      g.strokeStyle = ink; g.lineWidth = 0.05; g.beginPath(); g.moveTo(-0.14, 0.06); g.bezierCurveTo(-0.06, -0.04, 0.06, 0.1, 0.14, 0); g.stroke();
    } else {
      g.strokeStyle = ink; g.lineWidth = 0.05; g.beginPath(); g.moveTo(-0.11, 0); g.quadraticCurveTo(0, 0.07, 0.11, -0.01); g.stroke();
    }
    g.restore();
  }
  // Hair is ink with a paper-white highlight band; `sway` moves loose strands.
  function hairShape(g, kind) {
    g.beginPath();
    if (kind === 0) { // spiky fringe
      g.moveTo(-1.02, 0.0); g.bezierCurveTo(-1.2, -0.9, -0.5, -1.38, 0.1, -1.32); g.bezierCurveTo(0.75, -1.3, 1.22, -0.8, 1.04, 0.0);
      [[0.84, -0.5], [0.66, -0.06], [0.4, -0.52], [0.18, -0.04], [-0.06, -0.56], [-0.3, -0.02], [-0.56, -0.5], [-0.72, -0.04], [-0.92, -0.4]].forEach(([x, y]) => g.lineTo(x, y));
    } else if (kind === 1) { // long, side part
      g.moveTo(-1.04, 0.3); g.bezierCurveTo(-1.18, -0.9, -0.4, -1.36, 0.2, -1.3); g.bezierCurveTo(0.85, -1.22, 1.16, -0.7, 1.04, 0.3);
      g.bezierCurveTo(0.96, -0.1, 0.72, -0.42, 0.42, -0.56); g.bezierCurveTo(0.1, -0.2, -0.36, -0.36, -0.66, -0.64); g.bezierCurveTo(-0.9, -0.4, -1.0, -0.1, -1.04, 0.3);
    } else if (kind === 2) { // smooth cap
      g.moveTo(-1.02, 0.0); g.bezierCurveTo(-1.14, -0.95, -0.4, -1.3, 0, -1.3); g.bezierCurveTo(0.4, -1.3, 1.14, -0.95, 1.02, 0);
      g.bezierCurveTo(0.8, -0.52, 0.3, -0.64, 0, -0.66); g.bezierCurveTo(-0.34, -0.64, -0.8, -0.52, -1.02, 0);
    } else if (kind === 4) { // curls
      for (let k = 0; k < 9; k++) { const a = Math.PI * (1.08 + (k / 8) * 0.84); g.moveTo(Math.cos(a) * 1.0 + 0.44, Math.sin(a) * 1.0 - 0.15); g.arc(Math.cos(a) * 1.0, Math.sin(a) * 1.0 - 0.15, 0.44, 0, TAU); }
      g.moveTo(-0.6, -0.5); g.lineTo(0.6, -0.5); g.lineTo(0.9, 0.1); g.lineTo(-0.9, 0.1);
    } else { // 5: swept fringe over one eye
      g.moveTo(-1.04, 0.4); g.bezierCurveTo(-1.2, -0.9, -0.4, -1.36, 0.2, -1.3); g.bezierCurveTo(0.9, -1.2, 1.2, -0.7, 1.04, 0.1);
      g.bezierCurveTo(0.9, -0.3, 0.5, -0.5, 0.1, -0.3); g.bezierCurveTo(-0.1, 0.1, -0.5, 0.5, -0.78, 0.62); g.bezierCurveTo(-0.9, 0.5, -1.0, 0.45, -1.04, 0.4);
    }
    g.closePath();
  }
  function person(g, F, x, y, s, o = {}) {
    const { t } = F, ink = F.ink(1), pap = F.pap(1), seed = o.seed || 0, kind = o.hair ?? 0, expr = o.expr || "idle";
    const bob = Math.sin(t * 2.2 + seed) * 0.035, sway = Math.sin(t * 1.7 + seed * 2);
    const bp = (t + seed * 1.7) % 3.2, open = expr === "happy" || expr === "cheer" ? 1 : bp < 0.14 ? Math.max(0.08, Math.abs(bp / 0.07 - 1)) : 1;
    const lk = o.look || [Math.sin(t * 0.9 + seed) * 0.8, Math.cos(t * 0.6 + seed) * 0.4];
    g.save(); g.translate(x, y); g.scale(s * (o.flip ? -1 : 1), s); g.lineJoin = "round"; g.lineCap = "round";
    g.rotate((o.tilt || 0) + sway * 0.012);
    const lw = 0.05;
    // back hair (long styles) sits behind the shoulders
    if (kind === 1) {
      g.save(); g.translate(sway * 0.03, 0);
      g.beginPath(); g.moveTo(-1.02, -0.5); g.bezierCurveTo(-1.55, 0.5, -1.7, 2.0, -1.45, 3.2); g.lineTo(1.45, 3.2); g.bezierCurveTo(1.7, 2.0, 1.55, 0.5, 1.02, -0.5); g.closePath();
      g.fillStyle = ink; g.fill(); g.restore();
    }
    // shoulders and shirt
    const br = Math.sin(t * 1.9 + seed) * 0.03;
    g.save(); g.translate(0, br);
    g.beginPath(); g.moveTo(-0.3, 1.1); g.bezierCurveTo(-1.2, 1.3, -2.05, 1.65, -2.25, 3.4); g.lineTo(2.25, 3.4); g.bezierCurveTo(2.05, 1.65, 1.2, 1.3, 0.3, 1.1); g.closePath();
    if (o.shirt === "tone") { g.fillStyle = pap; g.fill(); g.save(); g.clip(); tone(g, { x: -3, y: 1, w: 6, h: 3 }, 0.2, flat(o.toneLevel ?? 0.55), ink, 0, 0); g.restore(); }
    else { g.fillStyle = ink; g.fill(); }
    g.lineWidth = lw; g.strokeStyle = ink; g.stroke();
    // collar and a pale highlight stripe
    g.beginPath(); g.moveTo(-0.62, 1.2); g.lineTo(0, 2.0); g.lineTo(0.62, 1.2); g.lineTo(0.3, 1.1); g.lineTo(0, 1.5); g.lineTo(-0.3, 1.1); g.closePath();
    g.fillStyle = pap; g.fill(); g.lineWidth = lw * 0.8; g.stroke();
    if (o.shirt !== "tone") { g.fillStyle = pap; g.globalAlpha = 0.9; taper(g, bez(-1.5, 2.0, -1.4, 2.5, -1.7, 3.3, 8), 0.14, PROF.both); taper(g, bez(1.5, 2.0, 1.4, 2.5, 1.7, 3.3, 8), 0.14, PROF.both); g.globalAlpha = 1; }
    g.restore();
    // neck
    g.beginPath(); g.moveTo(-0.3, 0.7); g.lineTo(-0.28, 1.25 + br); g.quadraticCurveTo(0, 1.4 + br, 0.28, 1.25 + br); g.lineTo(0.3, 0.7); g.closePath();
    g.fillStyle = pap; g.fill(); g.lineWidth = lw; g.stroke();
    g.fillStyle = ink; taper(g, bez(-0.26, 1.05, 0, 1.25, 0.26, 1.02, 8), 0.18, PROF.both);
    // head
    g.save(); g.translate(0, bob); g.rotate(sway * 0.02);
    for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(sd * 0.9, 0.22, 0.14, 0.2, 0, 0, TAU); g.fillStyle = pap; g.fill(); g.lineWidth = lw * 0.8; g.stroke(); }
    g.beginPath(); g.moveTo(-0.86, -0.2); g.bezierCurveTo(-0.86, 0.45, -0.5, 1.02, 0, 1.12); g.bezierCurveTo(0.5, 1.02, 0.86, 0.45, 0.86, -0.2);
    g.bezierCurveTo(0.86, -0.82, 0.45, -1.02, 0, -1.02); g.bezierCurveTo(-0.45, -1.02, -0.86, -0.82, -0.86, -0.2); g.closePath();
    g.fillStyle = pap; g.fill(); g.lineWidth = lw; g.strokeStyle = ink; g.stroke();
    // cheek shading: a few short hatch marks along the jaw
    g.strokeStyle = ink; g.lineWidth = 0.022;
    g.beginPath(); for (let i = 0; i < 4; i++) { g.moveTo(0.52 + i * 0.07, 0.62 - i * 0.07); g.lineTo(0.44 + i * 0.07, 0.8 - i * 0.05); } g.stroke();
    // blush
    g.save(); g.globalAlpha = 0.8; g.strokeStyle = o.blush ? F.acc(1) : ink; g.lineWidth = 0.02;
    g.beginPath(); for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) { g.moveTo(sd * (0.5 + i * 0.08) - 0.04, 0.5 + 0.08); g.lineTo(sd * (0.5 + i * 0.08) + 0.04, 0.5 - 0.02 + 0.08); } g.stroke(); g.restore();
    // face
    brow(g, F, -1, expr); brow(g, F, 1, expr);
    eye(g, F, -1, expr, open, lk); eye(g, F, 1, expr, open, lk);
    g.strokeStyle = ink; g.lineWidth = 0.03; g.beginPath(); g.moveTo(-0.02, 0.5); g.lineTo(0.03, 0.6); g.stroke();
    mouth(g, F, expr, t, seed);
    if (expr === "sad" || o.sweat) { g.beginPath(); const sy = 0.1 + ((t * 0.5 + seed) % 1) * 0.5; g.moveTo(0.95, -0.35 + sy); g.quadraticCurveTo(1.12, -0.1 + sy, 0.95, 0.04 + sy); g.quadraticCurveTo(0.78, -0.1 + sy, 0.95, -0.35 + sy); g.fillStyle = pap; g.fill(); g.lineWidth = 0.03; g.stroke(); }
    // hair
    g.save(); g.translate(sway * 0.015, 0);
    hairShape(g, kind);
    g.fillStyle = kind === 3 ? pap : ink; if (kind !== 3) { g.fill(); g.lineWidth = 0.03; g.stroke(); }
    if (kind === 0) { // a cowlick that bobs
      g.fillStyle = ink; taper(g, bez(-0.1, -1.3, -0.2 + sway * 0.12, -1.9, -0.55 + sway * 0.2, -2.0, 10), 0.34, PROF.tail);
    }
    if (kind === 2) { g.beginPath(); g.arc(0, -1.62, 0.44, 0, TAU); g.fillStyle = ink; g.fill(); g.lineWidth = 0.03; g.strokeStyle = ink; g.stroke(); g.fillStyle = pap; taper(g, bez(-0.2, -1.78, 0, -1.9, 0.22, -1.72, 8), 0.07, PROF.both); }
    if (kind === 4) { g.fillStyle = ink; g.fill(); }
    if (kind === 5) { // headphone band and cups
      g.lineWidth = 0.12; g.strokeStyle = ink; g.beginPath(); g.arc(0, -0.15, 1.12, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
      for (const sd of [-1, 1]) { g.beginPath(); g.roundRect ? g.roundRect(sd * 1.05 - 0.2, -0.12, 0.4, 0.6, 0.14) : g.rect(sd * 1.05 - 0.2, -0.12, 0.4, 0.6); g.fillStyle = F.acc(1); g.fill(); g.lineWidth = 0.05; g.strokeStyle = ink; g.stroke(); }
    }
    if (kind === 3) { // knit cap with ribbing and a pompom
      g.beginPath(); g.moveTo(-1.1, -0.34); g.bezierCurveTo(-1.18, -1.5, 1.18, -1.5, 1.1, -0.34); g.closePath(); g.fillStyle = ink; g.fill(); g.lineWidth = 0.04; g.stroke();
      g.beginPath(); g.moveTo(-1.12, -0.34); g.lineTo(-1.1, -0.64); g.bezierCurveTo(-0.5, -0.72, 0.5, -0.72, 1.1, -0.64); g.lineTo(1.12, -0.34); g.bezierCurveTo(0.5, -0.42, -0.5, -0.42, -1.12, -0.34); g.closePath();
      g.fillStyle = F.acc(1); g.fill(); g.lineWidth = 0.04; g.stroke();
      g.strokeStyle = pap; g.lineWidth = 0.035; g.beginPath(); for (let i = -4; i <= 4; i++) { g.moveTo(i * 0.22, -0.66); g.quadraticCurveTo(i * 0.2, -1.0, i * 0.12, -1.3); } g.stroke();
      g.beginPath(); g.arc(0.05, -1.4 - 0.03 * sway, 0.22, 0, TAU); g.fillStyle = pap; g.fill(); g.strokeStyle = ink; g.lineWidth = 0.05; g.stroke();
      for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(sd * 0.98, -0.3); g.lineTo(sd * 1.0, 0.25); g.lineTo(sd * 0.86, 0.1); g.closePath(); g.fillStyle = ink; g.fill(); }
    }
    // hair highlight: a pale band that follows the crown
    if (kind !== 3) { g.fillStyle = pap; g.globalAlpha = 0.95; taper(g, bez(-0.62, -0.92, 0, -1.12 - (kind === 4 ? 0.1 : 0), 0.55, -0.9, 12), 0.1, PROF.both); g.globalAlpha = 1; }
    g.restore();
    if (o.glasses || kind === 2) {
      g.strokeStyle = ink; g.lineWidth = 0.045;
      for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(sd * 0.42, 0.2, 0.36, 0.33, 0, 0, TAU); g.stroke(); }
      g.beginPath(); g.moveTo(-0.07, 0.17); g.quadraticCurveTo(0, 0.1, 0.07, 0.17); g.stroke();
      g.fillStyle = pap; g.globalAlpha = 0.7; taper(g, [[-0.58, 0.06], [-0.5, 0.0], [-0.4, -0.06]], 0.06, PROF.both); g.globalAlpha = 1;
    }
    if (o.clip) { star(g, -0.72, -0.5, 0.2, 0.3); g.fillStyle = F.acc(1); g.fill(); g.lineWidth = 0.03; g.strokeStyle = ink; g.stroke(); }
    g.restore();
    g.restore();
  }

  // Clap: a clapperboard with a face. Its clapper opens and snaps shut on a loop.
  function clap(g, F, x, y, s, o = {}) {
    const { t } = F, ink = F.ink(1), pap = F.pap(1), seed = o.seed || 0, expr = o.expr || "idle";
    const cyc = ((t * 0.78 + seed * 0.37) % 1), open = cyc < 0.62 ? 0.42 * Math.sin((cyc / 0.62) * Math.PI * 0.5) : 0.42 * Math.max(0, 1 - (cyc - 0.62) / 0.07);
    const hop = Math.abs(Math.sin(t * 3.1 + seed)) * 0.1 * (o.hop ?? 1), sq = 1 - (cyc > 0.6 && cyc < 0.72 ? 0.05 : 0);
    g.save(); g.translate(x, y - hop * s); g.scale(s * (o.flip ? -1 : 1), s * sq); g.rotate((o.tilt || 0) + Math.sin(t * 2 + seed) * 0.02);
    g.lineJoin = "round"; g.lineCap = "round";
    // little shadow-free feet
    for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(sd * 0.45, 1.02, 0.28, 0.14, 0, 0, TAU); g.fillStyle = ink; g.fill(); }
    // arms: tapered noodles with round hands
    const wv = Math.sin(t * 5 + seed) * 0.12;
    const armL = o.armsUp ? [[-1.0, 0.1], [-1.5, -0.2 + wv], [-1.55, -0.95 + wv]] : [[-1.0, 0.25], [-1.4, 0.5], [-1.45, 0.95]];
    const armR = o.armsUp ? [[1.0, 0.1], [1.5, -0.2 - wv], [1.55, -0.95 - wv]] : [[1.0, 0.25], [1.45, 0.4 + wv], [1.75, 0.0 + wv]];
    for (const a of [armL, armR]) {
      g.fillStyle = ink; taper(g, bez(a[0][0], a[0][1], a[1][0], a[1][1], a[2][0], a[2][1], 10), 0.18, PROF.flat);
      g.beginPath(); g.arc(a[2][0], a[2][1], 0.2, 0, TAU); g.fillStyle = pap; g.fill(); g.lineWidth = 0.06; g.strokeStyle = ink; g.stroke();
    }
    // body
    const rr = (px, py, w, h, r) => { g.beginPath(); g.moveTo(px + r, py); g.arcTo(px + w, py, px + w, py + h, r); g.arcTo(px + w, py + h, px, py + h, r); g.arcTo(px, py + h, px, py, r); g.arcTo(px, py, px + w, py, r); g.closePath(); };
    rr(-1.05, -0.62, 2.1, 1.55, 0.14); g.fillStyle = pap; g.fill(); g.lineWidth = 0.08; g.strokeStyle = ink; g.stroke();
    g.save(); rr(-1.05, -0.62, 2.1, 1.55, 0.14); g.clip(); tone(g, { x: -1.1, y: 0.5, w: 2.2, h: 0.5 }, 0.12, linear(0, 0.5, 0, 0.95, 0, 0.8), ink, 0, 0); g.restore();
    // clapper stick, hinged at its left end; the slanted stripes ride on it
    g.save(); g.translate(-1.05, -0.72); g.rotate(-open);
    g.beginPath(); g.moveTo(0, -0.34); g.lineTo(2.1, -0.34); g.lineTo(2.1, 0.0); g.lineTo(0, 0.0); g.closePath();
    g.fillStyle = pap; g.fill(); g.save(); g.clip();
    g.fillStyle = ink; g.beginPath(); for (let i = -1; i < 6; i++) { g.moveTo(i * 0.46, 0.0); g.lineTo(i * 0.46 + 0.23, 0.0); g.lineTo(i * 0.46 + 0.5, -0.34); g.lineTo(i * 0.46 + 0.27, -0.34); g.closePath(); } g.fill(); g.restore();
    g.lineWidth = 0.08; g.strokeStyle = ink; g.beginPath(); g.moveTo(0, -0.34); g.lineTo(2.1, -0.34); g.lineTo(2.1, 0.0); g.lineTo(0, 0.0); g.closePath(); g.stroke();
    g.restore();
    g.beginPath(); g.moveTo(-1.05, -0.62); g.lineTo(1.05, -0.62); g.lineWidth = 0.1; g.stroke();
    // face
    const blink = ((t + seed) % 3.3) < 0.12;
    for (const sd of [-1, 1]) {
      g.save(); g.translate(sd * 0.48, 0.05);
      if (expr === "cheer" || expr === "happy" || blink) { g.strokeStyle = ink; g.lineWidth = 0.09; g.beginPath(); g.moveTo(-0.17, 0.05); g.quadraticCurveTo(0, -0.2, 0.17, 0.05); g.stroke(); }
      else { g.beginPath(); g.ellipse(0, 0, 0.17, expr === "shock" ? 0.26 : 0.22, 0, 0, TAU); g.fillStyle = ink; g.fill(); g.fillStyle = pap; g.beginPath(); g.arc(-0.05, -0.07, 0.06, 0, TAU); g.fill(); g.beginPath(); g.arc(0.05, 0.07, 0.025, 0, TAU); g.fill(); }
      g.restore();
    }
    g.save(); g.translate(0, 0.42);
    if (expr === "cheer" || expr === "happy") { g.beginPath(); g.moveTo(-0.24, -0.02); g.quadraticCurveTo(0, 0.34, 0.24, -0.02); g.closePath(); g.fillStyle = ink; g.fill(); g.beginPath(); g.ellipse(0, 0.12, 0.1, 0.05, 0, 0, TAU); g.fillStyle = F.acc(1); g.fill(); }
    else if (expr === "shock") { g.beginPath(); g.ellipse(0, 0.05, 0.1, 0.14, 0, 0, TAU); g.fillStyle = ink; g.fill(); }
    else { g.strokeStyle = ink; g.lineWidth = 0.07; g.beginPath(); g.moveTo(-0.15, 0); g.quadraticCurveTo(0, 0.12, 0.15, 0); g.stroke(); }
    g.restore();
    g.fillStyle = F.acc(1); g.globalAlpha = 0.9;
    for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(sd * 0.82, 0.3, 0.14, 0.08, 0, 0, TAU); g.fill(); }
    g.globalAlpha = 1;
    // slate marks on the lower body
    g.strokeStyle = ink; g.lineWidth = 0.05; g.beginPath(); g.moveTo(-0.85, 0.74); g.lineTo(-0.2, 0.74); g.moveTo(0.2, 0.74); g.lineTo(0.85, 0.74); g.stroke();
    g.restore();
    // the snap: three tick marks as the stick closes
    if (cyc > 0.62 && cyc < 0.78) {
      const k = span(cyc, 0.62, 0.78);
      g.save(); g.translate(x, y - s * 0.72); g.strokeStyle = ink; g.lineWidth = 0.07 * s; g.lineCap = "round"; g.globalAlpha = 1 - k;
      for (let i = -1; i <= 1; i++) { const a = -Math.PI / 2 + i * 0.5; g.beginPath(); g.moveTo(Math.cos(a) * s * (0.6 + k * 0.5) * 1.1 + i * 0.02, Math.sin(a) * s * (0.9 + k * 0.5)); g.lineTo(Math.cos(a) * s * (1.0 + k * 0.6) * 1.1, Math.sin(a) * s * (1.2 + k * 0.7)); g.stroke(); }
      g.restore();
    }
  }
  // ---- the page: frame state, headline captions, transitions ---------------------------------------
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  const DEFHOLD = [2.4, 3.4, 3.6, 3.2, 3.6, 3.2, 2.4];
  let frame = null, planCache = null;
  const controls = () => (typeof window !== "undefined" && window.__dreamcut && window.__dreamcut.controls) || {};
  function plan() {
    if (planCache) return planCache;
    const c = controls(), shown = [];
    let at = 0;
    ORDER.forEach((id, i) => { const h = typeof c[id + "_hold"] === "number" ? c[id + "_hold"] : DEFHOLD[i]; if (h > 0) { shown.push({ id, start: at, hold: h, i: shown.length }); at += h; } });
    return (planCache = { shown, length: at });
  }
  function makeFrame(g, S, info) {
    const { W, H, u } = S, T = S.look.tone, tall = S.tall;
    const m = 34 * u, hb = (tall ? 0.3 : 0.34) * H - 22 * u;
    return {
      S, g, W, H, u, tall, T, t: info.t, info, index: info.index || 0, m,
      ink: (a) => `rgba(${T.ink},${a})`, pap: (a) => `rgba(${T.paper},${a})`, pnl: (a) => `rgba(${T.panel},${a})`, acc: (a) => hexA(S.accent, a),
      HD: { x: m, y: m, w: W - 2 * m, h: hb - m }, C: { x: m, y: hb + 16 * u, w: W - 2 * m, h: H - m - (hb + 16 * u) }, plan: plan(),
    };
  }
  const isStage = (id) => id === "title" || id === "closing";

  // Positions of each headline line on the page, read once from the layout (transforms ignored).
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
  const elemCache = {};
  function elemRect(id) {
    if (elemCache[id]) return elemCache[id];
    const el = document.getElementById(id), root = document.getElementById("root");
    if (!el || !root) return null;
    let ox = 0;
    for (let n = el; n && n !== root; n = n.offsetParent) ox += n.offsetLeft;
    return (elemCache[id] = { x: ox, w: el.offsetWidth });
  }
  function headBox(key) {
    let r = null;
    for (const id of TITLES[key] || []) for (const L of headLines(id)) {
      r = r ? { x0: Math.min(r.x0, L.x), y0: Math.min(r.y0, L.y), x1: Math.max(r.x1, L.x + L.w), y1: Math.max(r.y1, L.y + L.h) } : { x0: L.x, y0: L.y, x1: L.x + L.w, y1: L.y + L.h };
    }
    return r;
  }
  // The headline's own plate: a slanted caption box that wipes open with the lettering.
  function caption(g, F, key, local, hold, last) {
    const u = F.u, change = F.info.change, e = Number(controls().entrance) || 0.7;
    (TITLES[key] || []).forEach((id, k) => {
      const lines = headLines(id);
      if (!lines.length || id === "title") return; // the title sits on its own burst
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const L of lines) { x0 = Math.min(x0, L.x); y0 = Math.min(y0, L.y); x1 = Math.max(x1, L.x + L.w); y1 = Math.max(y1, L.y + L.h); }
      const kick = id === "kicker";
      const px = (kick ? 22 : 34) * u, py = (kick ? 8 : 16) * u, sk = (kick ? 8 : 16) * u;
      const q = 1 - Math.pow(1 - clamp((local - k * 0.12) / e), 4);
      const out = last ? 0 : easeIn(span(local, hold - change, hold));
      if (q <= 0.01 || out >= 1) return;
      const w = x1 - x0 + px * 2, h = y1 - y0 + py * 2, bx = x0 - px + 40 * u * out * 0, by = y0 - py;
      g.save();
      g.globalAlpha = 1 - out;
      g.translate(40 * u * out, 0);
      // the plate opens exactly as the lettering's own wipe does, so no plate shows empty
      const er = elemRect(id) || { x: x0, w: x1 - x0 }, tx = -36 * u * (1 - q), left = lerp(er.x + tx, bx - 12 * u, q), right = er.x + tx + er.w * q + (q >= 1 ? 60 * u : 0);
      g.beginPath(); g.rect(left, by - 10 * u, Math.max(0, right - left), h + 40 * u); g.clip();
      const shape = () => { g.beginPath(); g.moveTo(bx + sk, by); g.lineTo(bx + w + sk, by); g.lineTo(bx + w - sk, by + h); g.lineTo(bx - sk, by + h); g.closePath(); };
      g.translate(9 * u, 9 * u); shape(); g.fillStyle = kick ? F.acc(1) : F.ink(1); g.fill(); g.translate(-9 * u, -9 * u);
      shape(); g.fillStyle = kick ? F.ink(1) : F.pap(1); g.fill();
      g.lineJoin = "miter"; g.lineWidth = 4.5 * u; g.strokeStyle = F.ink(1); g.stroke();
      if (!kick) { // a hairline inside the box, the way caption boxes are ruled
        g.lineWidth = 1.6 * u; g.beginPath(); g.moveTo(bx + sk * 0.8 + 10 * u, by + 9 * u); g.lineTo(bx + w + sk * 0.8 - 10 * u, by + 9 * u); g.stroke();
      }
      g.restore();
    });
  }

  // The slash: an ink band sweeps across the page along a leaning line; the old scene lives ahead of it, the new one behind.
  function slashGeom(F, k) {
    const { W, H, u } = F, th = 0.3, sgn = F.index % 2 ? -1 : 1, cs = Math.cos(th) * sgn, sn = Math.sin(th);
    const vs = [[0, 0], [W, 0], [W, H], [0, H]].map(([x, y]) => x * cs + y * sn), vmin = Math.min(...vs), vmax = Math.max(...vs), bw = 170 * u;
    return { cs, sn, bw, f: lerp(vmin, vmax + bw, k), L: Math.hypot(W, H) * 2, W, H, u };
  }
  function halfPlane(G, c, ahead) {
    const dx = G.cs, dy = G.sn, px = -dy, py = dx, s = ahead ? 1 : -1, bx = dx * c, by = dy * c, L = G.L;
    return [[bx + px * L, by + py * L], [bx - px * L, by - py * L], [bx - px * L + dx * L * s, by - py * L + dy * L * s], [bx + px * L + dx * L * s, by + py * L + dy * L * s]];
  }
  function clipSide(g, F, k, ahead) {
    const G = slashGeom(F, k);
    poly(g, halfPlane(G, ahead ? G.f - G.bw * 0.35 : G.f - G.bw * 0.65, ahead)); g.clip();
  }
  function band(g, F, k) {
    const G = slashGeom(F, k);
    if (k <= 0.001 || k >= 0.999) return;
    const { u } = F, c0 = G.f - G.bw, c1 = G.f;
    g.save();
    g.beginPath();
    const dx = G.cs, dy = G.sn, px = -dy, py = dx, L = G.L;
    const P0 = [dx * c0 + px * L, dy * c0 + py * L], P1 = [dx * c0 - px * L, dy * c0 - py * L], P2 = [dx * c1 - px * L, dy * c1 - py * L], P3 = [dx * c1 + px * L, dy * c1 + py * L];
    g.moveTo(P0[0], P0[1]); g.lineTo(P1[0], P1[1]); g.lineTo(P2[0], P2[1]); g.lineTo(P3[0], P3[1]); g.closePath();
    g.fillStyle = F.ink(1); g.fill(); g.clip();
    const ang = Math.atan2(dy, dx);
    streaks(g, { x: 0, y: 0, w: F.W, h: F.H }, ang, 34, 77, F.t, 2.2, 5 * u, F.pap(0.95), 0.34);
    g.restore();
    // white rules just inside each edge, and the sound of the cut
    g.save(); g.strokeStyle = F.pap(1); g.lineWidth = 4 * u; g.lineCap = "butt";
    for (const [c, sgn] of [[c0 + 14 * u, 1], [c1 - 14 * u, -1]]) {
      g.beginPath(); g.moveTo(dx * c + px * L, dy * c + py * L); g.lineTo(dx * c - px * L, dy * c - py * L); g.stroke();
    }
    g.restore();
    const mid = G.f - G.bw / 2;
    const tx = F.W / 2 + (mid - (F.W / 2 * dx + F.H / 2 * dy)) * dx, ty = F.H / 2 + (mid - (F.W / 2 * dx + F.H / 2 * dy)) * dy;
    sfx(g, F, "ズバッ", tx, ty, 118 * u, { vertical: true, rot: Math.atan2(Math.abs(py), py < 0 ? -px : px) - Math.PI / 2, fill: F.pap(1), edge: F.ink(1), outer: F.pap(1), shake: 6, seed: 5, skew: 0 });
  }

  // Header panel shared by the five illustrated scenes: a burst of focus lines, a drifting tone, a sound effect.
  const rv = (P, i) => span(P.local, 0.02 + 0.08 * i, 0.44 + 0.08 * i);
  function header(g, F, P, word, seed) {
    const { u, t } = F, HD = F.HD;
    const pts = [[HD.x, HD.y], [HD.x + HD.w, HD.y], [HD.x + HD.w - 42 * u, HD.y + HD.h], [HD.x, HD.y + HD.h]];
    const fx = HD.x + HD.w * (F.tall ? 0.74 : 0.8), fy = HD.y + HD.h * 0.54;
    panel(g, F, pts, span(P.local, 0, 0.4), (g, bb) => {
      tone(g, bb, 9 * u, radial(fx, fy, HD.h * 0.3, HD.h * 1.7, 0.0, 0.82), F.ink(0.9), (t * 7 * u) % (9 * u * 1.4), 0);
      focus(g, fx, fy, HD.h * 0.3, Math.hypot(HD.w, HD.h), 120, 15 * u, seed, t, F.ink(1), Math.sin(t * 0.3) * 0.04);
      g.beginPath(); g.arc(fx, fy, HD.h * 0.27 + Math.sin(t * 3) * 4 * u, 0, TAU); g.fillStyle = F.pap(1); g.fill(); g.lineWidth = 4 * u; g.strokeStyle = F.ink(1); g.stroke();
      // sparkles that twinkle on their own clocks
      for (let i = 0; i < 9; i++) {
        const x = HD.x + HD.w * (0.08 + hash(seed, i, 1) * 0.84), y = HD.y + HD.h * (0.12 + hash(seed, i, 2) * 0.76), tw = 0.5 + 0.5 * Math.sin(t * (2 + hash(seed, i, 3) * 3) + i * 2);
        star(g, x, y, (18 + hash(seed, i, 4) * 20) * u * (0.4 + tw * 0.8), hash(seed, i, 5), 0.2); g.fillStyle = F.pap(1); g.fill(); g.lineWidth = 2.5 * u; g.strokeStyle = F.ink(1); g.stroke();
      }
      sfx(g, F, word, fx, fy, Math.min(HD.h * 0.5, HD.w * 0.1), { q: span(P.local, 0.1, 0.55), rot: -0.1, seed });
    });
  }
  // ---- scenes --------------------------------------------------------------------------------------
  const fmt = (v, d) => window.DreamcutMotion.formatNumber(v, 0, d.prefix, d.suffix);
  // Little arrows that rise on a loop (growth, upward motion).
  function risers(g, F, x, y, w, h, n, seed, color) {
    const { u, t } = F;
    g.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const k = (t * 0.7 + i / n + hash(seed, i, 1) * 0.3) % 1, yy = y + h - k * h * 1.1, a = Math.sin(Math.PI * clamp(k * 1.05)), xx = x + w * (i + 0.5) / n;
      g.save(); g.globalAlpha = a; g.beginPath(); g.moveTo(xx, yy - 34 * u); g.lineTo(xx + 30 * u, yy); g.lineTo(xx + 11 * u, yy); g.lineTo(xx + 11 * u, yy + 26 * u); g.lineTo(xx - 11 * u, yy + 26 * u); g.lineTo(xx - 11 * u, yy); g.lineTo(xx - 30 * u, yy); g.closePath(); g.fill(); g.restore();
    }
  }

  function chartArt(g, F, P) {
    const { u, t } = F, d = P.d, C = F.C, n = d.values.length, max = Math.max(...d.values, 1), gut = 16 * u, sl = 40 * u;
    header(g, F, P, "グングン", 11);
    let main, shout, mascot;
    if (!F.tall) {
      const xd = C.x + C.w * 0.66, dv = (y) => xd + sl * (0.5 - (y - C.y) / C.h), ym = C.y + C.h * 0.56, rs = 22 * u;
      const yl = ym + rs / 2, yr = ym - rs / 2;
      main = [[C.x, C.y], [dv(C.y) - gut / 2, C.y], [dv(C.y + C.h) - gut / 2, C.y + C.h], [C.x, C.y + C.h]];
      shout = [[dv(C.y) + gut / 2, C.y], [C.x + C.w, C.y], [C.x + C.w, yr - gut / 2], [dv(yl - gut / 2) + gut / 2, yl - gut / 2]];
      mascot = [[dv(yl + gut / 2) + gut / 2, yl + gut / 2], [C.x + C.w, yr + gut / 2], [C.x + C.w, C.y + C.h], [dv(C.y + C.h) + gut / 2, C.y + C.h]];
    } else {
      const ly = C.y + C.h * 0.6, low = cols({ x: C.x, y: ly, w: C.w, h: C.y + C.h - ly }, [0.56, 0.44], 34 * u, gut);
      main = [[C.x, C.y], [C.x + C.w, C.y], [C.x + C.w, ly - gut / 2 - 18 * u], [C.x, ly - gut / 2 + 18 * u]];
      shout = low[0]; mascot = low[1];
    }
    const hot = clamp(d.highlight, 0, n - 1);
    // main panel: a skyline of towers
    panel(g, F, main, rv(P, 0), (g, bb) => {
      tone(g, bb, 9 * u, linear(0, bb.y, 0, bb.y + bb.h * 0.85, 0.7, 0.03), F.ink(0.9), (t * 9 * u) % (12.7 * u), 0);
      streaks(g, bb, -0.1, 16, 5, t, 0.07, 7 * u, F.pap(0.92), 0.5);
      const strip = 100 * u, base = bb.y + bb.h - strip, pad = 56 * u, usable = bb.w - pad * 2 - 40 * u, slot = usable / n, bw = Math.min(slot * 0.58, 230 * u), ex = bw * 0.2, ey = -bw * 0.15;
      const maxH = base - bb.y - 150 * u;
      const tops = [];
      for (let i = 0; i < n; i++) {
        const gq = clamp(span(P.local, 0.25 + i * 0.12, 0.25 + i * 0.12 + 0.6)), grow = back(gq), isHot = i === hot;
        const cx = bb.x + pad + slot * (i + 0.5), x = cx - bw / 2;
        const h = maxH * (d.values[i] / max) * grow * (1 + 0.016 * Math.sin(t * 2.3 + i * 1.4) * gq);
        tops.push({ cx, y: base - h, x, bw, h, gq });
      }
      // an impact burst and rays behind the leading tower
      const T0 = tops[hot];
      if (T0 && T0.gq > 0.2) {
        const bq = ease(T0.gq);
        focus(g, T0.cx, T0.y, bw * 0.9, bb.w, 46, 10 * u, 21, t, F.ink(1), t * 0.05);
        burst(g, T0.cx + ex / 2, T0.y + ey / 2, bw * (1.05 + 0.04 * Math.sin(t * 7)) * bq, bw * 0.95 * bq, 13, 0.34, 7, t, t * 0.2);
        g.fillStyle = F.pap(1); g.fill(); g.lineWidth = 4.5 * u; g.strokeStyle = F.ink(1); g.stroke();
      }
      // the label strip sits over the rays
      g.fillStyle = F.pap(1); g.fillRect(bb.x - 10, base, bb.w + 20, strip + 10); g.lineWidth = 5.5 * u; g.strokeStyle = F.ink(1); g.beginPath(); g.moveTo(bb.x - 10, base); g.lineTo(bb.x + bb.w + 10, base); g.stroke();
      tops.forEach((T, i) => {
        if (T.gq <= 0.02 || T.h < 2) return;
        const isHot = i === hot, jx = isHot && T.gq > 0.9 ? (hash(Math.floor(t * STEP), i, 3) - 0.5) * 2.5 * u : 0;
        const x = T.x + jx, w = T.bw, y = T.y, b = base;
        const front = [[x, b], [x + w, b], [x + w, y], [x, y]], side = [[x + w, b], [x + w + ex, b + ey], [x + w + ex, y + ey], [x + w, y]], top = [[x, y], [x + w, y], [x + w + ex, y + ey], [x + ex, y + ey]];
        poly(g, front); g.fillStyle = isHot ? F.acc(1) : F.pap(1); g.fill();
        g.save(); poly(g, front); g.clip();
        tone(g, { x, y, w, h: b - y }, 8 * u, linear(x, 0, x + w, 0, isHot ? 0.35 : 0.8, isHot ? 0 : 0.05), F.ink(isHot ? 0.75 : 1), 0, 0);
        g.restore();
        poly(g, side); g.fillStyle = F.ink(1); g.fill();
        poly(g, top); g.fillStyle = isHot ? F.pap(1) : F.pap(1); g.fill();
        g.lineJoin = "miter"; g.lineWidth = 5 * u; g.strokeStyle = F.ink(1); for (const q of [front, side, top]) { poly(g, q); g.stroke(); }
        // a pale shine slashed across the front
        g.fillStyle = F.pap(0.95); taper(g, [[x + w * 0.18, y + (b - y) * 0.2], [x + w * 0.1, y + (b - y) * 0.42]], 8 * u, PROF.flat);
        taper(g, bez(x + w * 0.22, y + (b - y) * 0.14, x + w * 0.16, y + (b - y) * 0.3, x + w * 0.1, y + (b - y) * 0.5, 8), 10 * u, PROF.both);
        if (T.gq > 0.35) say(g, F, fmt(d.values[i] * ease(T.gq), d), T.x + w / 2 + ex / 2, y - 24 * u + ey, 58 * u, { align: "center", font: FIG, halo: F.pap(1), haloW: 0.28, color: isHot ? F.acc(1) : F.ink(1), track: 0.01 });
        if (T.gq > 0.3) say(g, F, d.labels[i] || "", T.cx + ex / 2, b + strip * 0.68, 48 * u, { align: "center", maxW: slot * 0.92, min: 42 * u });
      });
      risers(g, F, tops[hot].x - bw * 0.5, base - maxH * 0.95, bw * 2, maxH * 0.9, 3, 3, F.ink(0.9));
    });
    // the leading value, shouted
    panel(g, F, shout, rv(P, 1), (g, bb) => {
      const cx = bb.x + bb.w * 0.52, cy = bb.y + bb.h * 0.46, R = Math.hypot(bb.w, bb.h);
      g.fillStyle = F.ink(1); g.fillRect(bb.x - 4, bb.y - 4, bb.w + 8, bb.h + 8);
      focus(g, cx, cy, bb.h * 0.22, R, 100, 20 * u, 3, t, F.pap(1), t * 0.08);
      for (let k = 0; k < 2; k++) { const kk = (t * 0.8 + k * 0.5) % 1; g.beginPath(); g.arc(cx, cy, bb.h * (0.2 + kk * 0.6), 0, TAU); g.strokeStyle = F.pap(1 - kk); g.lineWidth = 7 * u; g.stroke(); }
      const v = d.values[hot] * ease(span(P.p, 0.2, 0.9)), txt = fmt(v, d), j = Math.floor(t * STEP);
      const size = Math.min(bb.h * 0.5, (bb.w * 0.8) / Math.max(2.2, txt.length * 0.52));
      const ox = (hash(j, 1, 4) - 0.5) * 3 * u, oy = (hash(j, 2, 4) - 0.5) * 3 * u;
      g.save(); g.translate(cx + ox, cy + oy); g.rotate(-0.05); g.scale(1 + 0.025 * Math.sin(t * 6), 1 + 0.025 * Math.sin(t * 6));
      say(g, F, txt, 9 * u, 9 * u + size * 0.36, size, { align: "center", font: FIG, color: F.acc(1), track: 0.01 });
      say(g, F, txt, 0, size * 0.36, size, { align: "center", font: FIG, color: F.pap(1), halo: F.ink(1), haloW: 0.1, track: 0.01 });
      g.restore();
      tag(g, F, d.labels[hot] || "", cx, bb.y + bb.h * 0.88, 44 * u, span(P.p, 0.3, 0.6), { align: "center", maxW: bb.w * 0.86 });
    });
    // the mascot cheers it on
    panel(g, F, mascot, rv(P, 2), (g, bb) => {
      const cx = bb.x + bb.w * 0.5, cy = bb.y + bb.h * 0.58;
      tone(g, bb, 9 * u, radial(cx, cy, bb.h * 0.2, bb.h * 0.95, 0.0, 0.7), F.ink(0.9), (t * 6 * u) % (12 * u), 0);
      focus(g, cx, cy, bb.h * 0.3, Math.hypot(bb.w, bb.h), 60, 11 * u, 14, t, F.ink(1), -t * 0.06);
      risers(g, F, bb.x + 20 * u, bb.y + 10 * u, bb.w - 40 * u, bb.h - 20 * u, 4, 8, F.ink(1));
      const s = Math.min(bb.h * 0.2, bb.w * 0.18), pop = back(span(P.local, 0.2, 0.7));
      clap(g, F, cx, bb.y + bb.h * 0.62 + (1 - pop) * bb.h * 0.5, s, { expr: "cheer", armsUp: true, seed: 2 });
      sfx(g, F, "ドン", bb.x + bb.w * 0.24, bb.y + bb.h * 0.36, Math.min(bb.h * 0.26, 80 * u), { q: span(P.p, 0.4, 0.7), rot: -0.2, seed: 9, vertical: true });
    });
  }

  // OBJECT: a laptop or phone on a desk, with a playhead sweeping its timeline and three numbered callouts.
  function deviceArt(g, F, bb, P, dev) {
    const { u, t } = F, d = P.d, phone = d.kind === "phone", wide = bb.w > bb.h * 1.2 && !phone ? true : bb.w > bb.h;
    const w = phone ? Math.min(bb.w * 0.27, bb.h * 0.34) : Math.min(bb.w * (wide ? 0.46 : 0.74), bb.h * (wide ? 0.92 : 0.58)), h = phone ? w * 1.95 : w * 0.62;
    const cx = bb.x + bb.w * (wide ? 0.33 : 0.5), cy = bb.y + bb.h * (wide ? 0.5 : 0.4);
    const bob = Math.sin(t * 1.7) * 6 * u, x = cx - w / 2, y = cy - h / 2 + bob - (phone ? 0 : 20 * u);
    const q = back(span(P.local, 0.15, 0.7)), drop = (1 - q) * bb.h * 0.6;
    g.save(); g.translate(0, -drop);
    // soft ellipse shadow on the desk
    g.beginPath(); g.ellipse(cx, y + h + (phone ? 20 : 70) * u - bob * 0.2, w * 0.55 * (1 - bob / (90 * u)), 22 * u, 0, 0, TAU); g.fillStyle = F.ink(0.85); g.fill();
    const rr = (px, py, ww, hh, r) => { g.beginPath(); g.moveTo(px + r, py); g.arcTo(px + ww, py, px + ww, py + hh, r); g.arcTo(px + ww, py + hh, px, py + hh, r); g.arcTo(px, py + hh, px, py, r); g.arcTo(px, py, px + ww, py, r); g.closePath(); };
    // body
    rr(x + 14 * u, y + 14 * u, w, h, (phone ? 34 : 18) * u); g.fillStyle = F.ink(1); g.fill();
    rr(x, y, w, h, (phone ? 34 : 18) * u); g.fillStyle = F.ink(1); g.fill(); g.lineWidth = 5.5 * u; g.strokeStyle = F.ink(1); g.stroke();
    const pad = (phone ? 16 : 20) * u, sx = x + pad, sy = y + pad + (phone ? 22 * u : 0), sw = w - pad * 2, sh = h - pad * 2 - (phone ? 30 * u : 0);
    rr(sx, sy, sw, sh, 8 * u); g.fillStyle = F.pap(1); g.fill(); g.save(); rr(sx, sy, sw, sh, 8 * u); g.clip();
    // screen: a preview with a drifting sun, hills and clouds
    const pv = { x: sx + sw * 0.06, y: sy + sh * 0.07, w: sw * 0.88, h: sh * (phone ? 0.44 : 0.5) };
    g.save(); g.beginPath(); g.rect(pv.x, pv.y, pv.w, pv.h); g.clip();
    tone(g, pv, 6 * u, linear(0, pv.y, 0, pv.y + pv.h, 0.55, 0.0), F.ink(1), 0, 0);
    const sunx = pv.x + pv.w * (0.3 + 0.18 * Math.sin(t * 0.6)), suny = pv.y + pv.h * 0.38;
    g.beginPath(); g.arc(sunx, suny, pv.h * 0.2, 0, TAU); g.fillStyle = F.acc(1); g.fill(); g.lineWidth = 3 * u; g.strokeStyle = F.ink(1); g.stroke();
    g.beginPath(); g.moveTo(pv.x, pv.y + pv.h); g.lineTo(pv.x + pv.w * 0.28, pv.y + pv.h * 0.5); g.lineTo(pv.x + pv.w * 0.5, pv.y + pv.h * 0.78); g.lineTo(pv.x + pv.w * 0.74, pv.y + pv.h * 0.44); g.lineTo(pv.x + pv.w, pv.y + pv.h * 0.9); g.lineTo(pv.x + pv.w, pv.y + pv.h); g.closePath(); g.fillStyle = F.ink(1); g.fill();
    for (let i = 0; i < 2; i++) { const cxx = pv.x + ((t * 18 * u + i * pv.w * 0.55) % (pv.w + 120 * u)) - 60 * u, cyy = pv.y + pv.h * (0.22 + i * 0.16); g.beginPath(); g.ellipse(cxx, cyy, 36 * u, 14 * u, 0, 0, TAU); g.ellipse(cxx + 20 * u, cyy - 8 * u, 22 * u, 12 * u, 0, 0, TAU); g.fillStyle = F.pap(1); g.fill(); }
    g.restore();
    g.lineWidth = 3.5 * u; g.strokeStyle = F.ink(1); g.strokeRect(pv.x, pv.y, pv.w, pv.h);
    // timeline: three tracks and a playhead that never stops
    const tl = { x: sx + sw * 0.06, y: sy + sh * 0.62, w: sw * 0.88, h: sh * 0.3 }, th = tl.h / 3.4;
    const clips = [[[0.0, 0.3], [0.34, 0.2], [0.58, 0.36]], [[0.08, 0.26], [0.4, 0.4], [0.84, 0.16]], [[0.0, 0.2], [0.26, 0.34], [0.64, 0.3]]];
    clips.forEach((row, ti) => row.forEach(([a, b], ci) => {
      const k = ease(span(P.local, 0.5 + ti * 0.1 + ci * 0.08, 0.9 + ti * 0.1 + ci * 0.08)); if (k <= 0) return;
      const cxx = tl.x + tl.w * a, cyy = tl.y + ti * (th + tl.h * 0.05), hot = ti === 0 && ci === 1;
      g.fillStyle = hot ? F.acc(1) : ti === 1 ? F.pap(1) : F.ink(1); g.fillRect(cxx, cyy, tl.w * b * k, th);
      g.lineWidth = 2.5 * u; g.strokeStyle = F.ink(1); g.strokeRect(cxx, cyy, tl.w * b * k, th);
      if (ti === 1) { g.save(); g.beginPath(); g.rect(cxx, cyy, tl.w * b * k, th); g.clip(); tone(g, { x: cxx, y: cyy, w: tl.w * b, h: th }, 6 * u, flat(0.5), F.ink(1), 0, 0); g.restore(); }
    }));
    const phx = tl.x + ((t * 0.2) % 1) * tl.w;
    g.fillStyle = F.acc(1); g.fillRect(phx - 2.5 * u, tl.y - 10 * u, 5 * u, tl.h + 16 * u); g.beginPath(); g.moveTo(phx - 9 * u, tl.y - 12 * u); g.lineTo(phx + 9 * u, tl.y - 12 * u); g.lineTo(phx, tl.y + 2 * u); g.closePath(); g.fill(); g.lineWidth = 2 * u; g.strokeStyle = F.ink(1); g.stroke();
    // a glare that sweeps across the glass
    const gl = ((t * 0.33) % 1.6) - 0.3; g.save(); g.globalAlpha = 0.7; g.fillStyle = F.pap(1); g.beginPath(); g.moveTo(sx + sw * (gl - 0.12), sy + sh); g.lineTo(sx + sw * (gl - 0.02), sy + sh); g.lineTo(sx + sw * (gl + 0.28), sy); g.lineTo(sx + sw * (gl + 0.18), sy); g.closePath(); g.fill(); g.restore();
    g.restore();
    g.lineWidth = 3 * u; g.strokeStyle = F.ink(1); rr(sx, sy, sw, sh, 8 * u); g.stroke();
    if (!phone) { // the base, keyboard dots and a hinge line
      const by = y + h;
      g.beginPath(); g.moveTo(x - w * 0.07, by + 56 * u); g.lineTo(x + w * 1.07, by + 56 * u); g.lineTo(x + w, by); g.lineTo(x, by); g.closePath();
      g.fillStyle = F.pap(1); g.fill(); g.lineWidth = 5.5 * u; g.strokeStyle = F.ink(1); g.lineJoin = "round"; g.stroke();
      g.fillStyle = F.ink(1); g.beginPath();
      for (let r = 0; r < 3; r++) for (let c = 0; c < 18; c++) { const px = x + w * (0.08 + c * 0.047) - r * 4 * u, py = by + (10 + r * 13) * u; g.rect(px, py, 12 * u, 6 * u); }
      g.fill();
    } else { g.beginPath(); g.roundRect ? g.roundRect(x + w * 0.38, y + 8 * u, w * 0.24, 10 * u, 5 * u) : g.rect(x + w * 0.38, y + 8 * u, w * 0.24, 10 * u); g.fillStyle = F.pap(1); g.fill(); }
    g.restore();
    return { x, y: y - drop, w, h, pv, tl, sx, sy, sw, sh, drop, bob, base: phone ? 0 : 56 * u };
  }
  function objectArt(g, F, P) {
    const { u, t } = F, d = P.d, C = F.C, wide = !F.tall;
    header(g, F, P, "ピカッ", 23);
    const main = [[C.x, C.y], [C.x + C.w, C.y], [C.x + C.w - 40 * u, C.y + C.h], [C.x + 40 * u, C.y + C.h]];
    let anchors, dev;
    panel(g, F, main, rv(P, 0), (g, bb) => {
      const cx = bb.x + bb.w * (wide ? 0.36 : 0.5), cy = bb.y + bb.h * (wide ? 0.4 : 0.32), R = Math.hypot(bb.w, bb.h);
      // a diagonal split of tone and paper, rays from the screen, desk lines in perspective
      g.save(); g.beginPath(); g.moveTo(bb.x, bb.y + bb.h * 0.35); g.lineTo(bb.x + bb.w, bb.y - bb.h * 0.05); g.lineTo(bb.x + bb.w, bb.y + bb.h); g.lineTo(bb.x, bb.y + bb.h); g.closePath(); g.clip();
      tone(g, bb, 9 * u, linear(0, bb.y + bb.h * 0.3, 0, bb.y + bb.h, 0.0, 0.68), F.ink(0.9), (t * 8 * u) % (12.7 * u), 0);
      g.restore();
      focus(g, cx, cy, Math.min(bb.w, bb.h) * 0.3, R, 90, 13 * u, 17, t, F.ink(1), Math.sin(t * 0.4) * 0.05);
      // desk plane
      const dy = bb.y + bb.h * (wide ? 0.78 : 0.62);
      g.fillStyle = F.pap(1); g.beginPath(); g.moveTo(bb.x - 10, dy); g.lineTo(bb.x + bb.w + 10, dy - 24 * u); g.lineTo(bb.x + bb.w + 10, bb.y + bb.h + 10); g.lineTo(bb.x - 10, bb.y + bb.h + 10); g.closePath(); g.fill();
      g.lineWidth = 5.5 * u; g.strokeStyle = F.ink(1); g.beginPath(); g.moveTo(bb.x - 10, dy); g.lineTo(bb.x + bb.w + 10, dy - 24 * u); g.stroke();
      g.save(); g.beginPath(); g.moveTo(bb.x - 10, dy); g.lineTo(bb.x + bb.w + 10, dy - 24 * u); g.lineTo(bb.x + bb.w + 10, bb.y + bb.h + 10); g.lineTo(bb.x - 10, bb.y + bb.h + 10); g.closePath(); g.clip();
      tone(g, bb, 9 * u, linear(0, dy, 0, bb.y + bb.h, 0.5, 0.05), F.ink(0.9), 0, 0);
      g.fillStyle = F.ink(1); g.beginPath(); for (let i = -8; i <= 8; i++) { lens(g, cx + i * bb.w * 0.09, dy + 4 * u, cx + i * bb.w * 0.34 + (t * 10 * u * 0) , bb.y + bb.h + 10, 4 * u); } g.fill();
      g.restore();
      dev = deviceArt(g, F, bb, P, null);
      const k = (a, b) => ({ x: a, y: b });
      anchors = [k(dev.pv.x + dev.pv.w * 0.72, dev.pv.y + dev.pv.h * 0.3), k(dev.tl.x + dev.tl.w * 0.52, dev.tl.y + dev.tl.h * 0.45), k(dev.tl.x + dev.tl.w * 0.16, dev.tl.y + dev.tl.h * 0.85)];
      // Clap perches on the lid
      const s = Math.min(bb.h * 0.09, 56 * u), pop = back(span(P.local, 0.3, 0.8));
      clap(g, F, dev.x + dev.w * 0.9, dev.y - s * 1.0 - (1 - pop) * bb.h * 0.4, s, { expr: "cheer", seed: 4, hop: 0.5, tilt: 0.12 });
      sfx(g, F, "カチッ", bb.x + bb.w * (wide ? 0.12 : 0.2), bb.y + bb.h * (wide ? 0.2 : 0.1), Math.min(bb.h * 0.15, 88 * u), { q: span(P.p, 0.5, 0.85), rot: 0.12, seed: 31 });
      // twinkles
      for (let i = 0; i < 8; i++) { const x = bb.x + bb.w * (0.06 + hash(23, i, 1) * 0.88), y = bb.y + bb.h * (0.08 + hash(23, i, 2) * 0.55), tw = 0.5 + 0.5 * Math.sin(t * (2 + hash(23, i, 3) * 3) + i); star(g, x, y, (14 + hash(23, i, 4) * 18) * u * (0.3 + tw), hash(23, i, 5), 0.2); g.fillStyle = F.pap(1); g.fill(); g.lineWidth = 2.5 * u; g.strokeStyle = F.ink(1); g.stroke(); }
    });
    if (!dev) return;
    // callouts: numbered plates joined to their parts by tapered leaders
    const lx = F.tall ? C.x + 100 * u : C.x + C.w * 0.62, tw = F.tall ? C.w - 140 * u : C.w * 0.36 - 20 * u;
    d.callouts.forEach((label, i) => {
      if (!label) return;
      const q = span(P.local, 0.5 + i * 0.16, 0.95 + i * 0.16), a = anchors[i], ty = F.tall ? C.y + C.h * (0.67 + i * 0.12) : C.y + C.h * (0.2 + i * 0.28);
      if (q <= 0) return;
      const pulse = 1 + 0.2 * Math.sin(t * 5 + i * 1.7), lead = Math.min(1, q * 1.6), tx = lx - 22 * u;
      const pts = bez(a.x, a.y, lerp(a.x, tx, 0.5), ty - 80 * u * (i === 1 ? -1 : 1), tx, ty, 18).slice(0, Math.max(2, Math.round(19 * lead)));
      g.fillStyle = F.ink(1); taper(g, pts, 8 * u, PROF.both);
      g.beginPath(); g.arc(a.x, a.y, 12 * u * pulse, 0, TAU); g.fillStyle = F.acc(1); g.fill(); g.lineWidth = 4 * u; g.strokeStyle = F.ink(1); g.stroke();
      const hb = 30 * u;
      g.save(); g.translate(lx + 4 * u, ty); g.scale(back(span(q, 0.3, 0.8)), back(span(q, 0.3, 0.8)));
      burst(g, 0, 0, hb, hb, 9, 0.22, 40 + i, t, t * 0.3); g.fillStyle = i === 1 ? F.acc(1) : F.ink(1); g.fill(); g.lineWidth = 3.5 * u; g.strokeStyle = F.ink(1); g.stroke();
      say(g, F, String(i + 1), 0, 16 * u, 46 * u, { align: "center", font: FIG, color: i === 1 ? F.onAcc : F.pap(1) });
      g.restore();
      tag(g, F, label, lx + 52 * u, ty, 48 * u, span(q, 0.35, 0.9), { maxW: tw - 70 * u, min: 42 * u, fill: i === 1 ? F.acc(1) : F.pap(1) });
    });
  }
  // PEOPLE: a cast line-up, one slanted strip per person with their own ground, name plate and idle life.
  function emote(g, F, kind, x, y, s, t, seed) {
    const { u } = F, ink = F.ink(1), pap = F.pap(1), k = 0.5 + 0.5 * Math.sin(t * 4 + seed);
    g.save(); g.translate(x, y); g.lineJoin = "round"; g.lineCap = "round"; g.lineWidth = 4 * u; g.strokeStyle = ink;
    if (kind === 0) { star(g, 0, 0, s * (0.7 + k * 0.4), t * 0.6, 0.2); g.fillStyle = pap; g.fill(); g.stroke(); }
    else if (kind === 1) { g.beginPath(); g.arc(0, -s * 0.15, s * 0.5, 0, TAU); g.fillStyle = pap; g.fill(); g.stroke(); g.fillStyle = ink; g.fillRect(-s * 0.2, s * 0.35, s * 0.4, s * 0.22); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.62; g.beginPath(); g.moveTo(Math.cos(a) * s * 0.75, -s * 0.15 + Math.sin(a) * s * 0.75); g.lineTo(Math.cos(a) * s * (0.95 + k * 0.2), -s * 0.15 + Math.sin(a) * s * (0.95 + k * 0.2)); g.stroke(); } }
    else if (kind === 2) { g.beginPath(); g.moveTo(0, s * 0.5); g.bezierCurveTo(-s * 1.0, -s * 0.2, -s * 0.5, -s * 0.8, 0, -s * 0.3); g.bezierCurveTo(s * 0.5, -s * 0.8, s * 1.0, -s * 0.2, 0, s * 0.5); g.closePath(); g.scale(0.9 + k * 0.2, 0.9 + k * 0.2); g.fillStyle = F.acc(1); g.fill(); g.stroke(); }
    else { g.fillStyle = ink; taper(g, [[0, -s * 0.8], [0, s * 0.15]], s * 0.34, PROF.flat); g.beginPath(); g.arc(0, s * 0.55, s * 0.17, 0, TAU); g.fill(); g.beginPath(); g.moveTo(-s * 0.17, -s * 0.8); g.lineTo(s * 0.17, -s * 0.8); g.lineTo(s * 0.1, s * 0.15); g.lineTo(-s * 0.1, s * 0.15); g.closePath(); g.fill(); }
    g.restore();
  }
  function peopleArt(g, F, P) {
    const { u, t } = F, d = P.d, C = F.C, n = Math.max(2, Math.min(6, Math.round(d.count))), gut = 16 * u;
    header(g, F, P, "ワイワイ", 31);
    let panels;
    if (!F.tall) panels = cols(C, new Array(n).fill(1), 56 * u, gut);
    else {
      const r = Math.ceil(n / 2), rr = rows(C, new Array(r).fill(1), 22 * u, gut);
      panels = [];
      rr.forEach((row, ri) => {
        const bb = bboxOf(row), k = Math.min(2, n - ri * 2), cc = cols({ x: bb.x, y: bb.y, w: bb.w, h: bb.h }, new Array(k).fill(1), 34 * u, gut);
        cc.forEach((q, i) => {
          // keep the row's slanted top and bottom edges
          const yAt = (px, ys) => ys; panels.push(q.map(([x, y], j) => [x, j < 2 ? lerp(row[0][1], row[1][1], (x - bb.x) / bb.w) : lerp(row[3][1], row[2][1], (x - bb.x) / bb.w)]));
        });
      });
    }
    panels.forEach((pts, i) => {
      const bb = bboxOf(pts), hot = i === Math.min(n - 1, d.highlight), kind = i % 6, v = i % 4, seed = 3 + i * 7;
      panel(g, F, pts, rv(P, i * 0.8), (g, bb) => {
        const cx = bb.x + bb.w / 2, hy = bb.y + bb.h * (F.tall ? 0.46 : 0.5), s = Math.min(bb.w * 0.3, bb.h * 0.2);
        if (v === 0 || hot) { tone(g, bb, 9 * u, radial(cx, hy, s * 1.2, bb.h * 0.9, 0.0, 0.8), F.ink(0.9), (t * 6 * u) % (12 * u), 0); focus(g, cx, hy, s * 1.5, Math.hypot(bb.w, bb.h), 70, 12 * u, seed, t, F.ink(1), (i % 2 ? -1 : 1) * t * 0.05); }
        else if (v === 1) { tone(g, bb, 9 * u, linear(0, bb.y, 0, bb.y + bb.h, 0.75, 0.0), F.ink(0.9), 0, (t * 14 * u) % (12.7 * u)); streaks(g, bb, Math.PI / 2, 22, seed, t, 0.35, 7 * u, F.pap(0.95), 0.4); }
        else if (v === 2) { tone(g, bb, 18 * u, flat(0.5), F.ink(0.9), (t * 10 * u) % (25 * u), 0); g.beginPath(); g.arc(cx, hy, s * 1.55, 0, TAU); g.fillStyle = F.pap(1); g.fill(); g.lineWidth = 4 * u; g.strokeStyle = F.ink(1); g.stroke(); }
        else { tone(g, bb, 9 * u, linear(bb.x, 0, bb.x + bb.w, 0, 0.0, 0.7), F.ink(0.9), 0, 0); streaks(g, bb, -0.5, 18, seed, t, 0.25, 6 * u, F.ink(0.9), 0.4); }
        if (hot) { burst(g, cx, hy, s * 1.9, s * 1.9, 16, 0.3, 6, t, t * 0.3); g.fillStyle = F.acc(1); g.fill(); g.lineWidth = 4.5 * u; g.strokeStyle = F.ink(1); g.stroke(); }
        const pop = back(span(P.local, 0.2 + i * 0.09, 0.65 + i * 0.09));
        const expr = hot ? "cheer" : ["idle", "happy", "wow", "idle", "happy", "idle"][i % 6];
        person(g, F, cx, hy + (1 - pop) * bb.h * 0.6, s, { hair: kind, expr, seed, shirt: i % 2 ? "tone" : "ink", toneLevel: 0.5, glasses: kind === 2, clip: kind === 1, blush: hot });
        // emote floats beside the head
        const eq = span(P.local, 0.7 + i * 0.09, 1.0 + i * 0.09);
        if (eq > 0) emote(g, F, hot ? 3 : i % 3, cx + s * 1.5, hy - s * (1.1 + 0.08 * Math.sin(t * 3 + i)), s * 0.36 * back(eq), t, seed);
        const label = d.badges[i] || ["Viewer", "Crew", "Guest"][(i - 3) % 3];
        tag(g, F, label, cx, bb.y + bb.h - 46 * u, 48 * u, span(P.local, 0.55 + i * 0.09, 0.95 + i * 0.09), { align: "center", maxW: bb.w * 0.94, min: 42 * u, fill: hot ? F.acc(1) : F.pap(1) });
      });
    });
  }

  // PROCESS: a three-beat strip. Each beat has its own machine in motion: a film reel, a pen, a stamp.
  function reelIcon(g, F, cx, cy, s, t) {
    const { u } = F, ink = F.ink(1), pap = F.pap(1);
    // film strip trailing out of the reel, sliding left to right
    const fy = cy + s * 0.9, fh = s * 0.5, off = (t * 60 * u) % (s * 0.5);
    g.save(); g.translate(cx - s * 2.2, fy); g.fillStyle = ink; g.beginPath(); g.moveTo(0, 0); g.lineTo(s * 4.2, -s * 0.16); g.lineTo(s * 4.2, fh - s * 0.16); g.lineTo(0, fh); g.closePath(); g.fill();
    g.fillStyle = pap; for (let i = -1; i < 9; i++) { const x = i * s * 0.5 + off; if (x < 0 || x > s * 4.0) continue; g.fillRect(x, fh * 0.12 - x * 0.038, s * 0.2, s * 0.09); g.fillRect(x, fh * 0.76 - x * 0.038, s * 0.2, s * 0.09); }
    g.restore();
    g.save(); g.translate(cx, cy); g.rotate(t * 1.6);
    g.beginPath(); g.arc(0, 0, s, 0, TAU); g.fillStyle = pap; g.fill(); g.lineWidth = 6 * u; g.strokeStyle = ink; g.stroke();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; g.beginPath(); g.arc(Math.cos(a) * s * 0.58, Math.sin(a) * s * 0.58, s * 0.2, 0, TAU); g.fillStyle = ink; g.fill(); }
    g.beginPath(); g.arc(0, 0, s * 0.16, 0, TAU); g.fillStyle = F.acc(1); g.fill(); g.lineWidth = 4 * u; g.stroke();
    g.restore();
  }
  function penIcon(g, F, cx, cy, s, t) {
    const { u } = F, ink = F.ink(1), pap = F.pap(1), k = (t * 0.55) % 1, kk = inout(Math.min(1, k * 1.35));
    // the page the pen draws on
    g.save(); g.translate(cx, cy); g.rotate(-0.06);
    g.fillStyle = ink; g.fillRect(-s * 1.3 + 12 * u, -s * 0.95 + 12 * u, s * 2.6, s * 1.9);
    g.fillStyle = pap; g.fillRect(-s * 1.3, -s * 0.95, s * 2.6, s * 1.9); g.lineWidth = 5 * u; g.strokeStyle = ink; g.strokeRect(-s * 1.3, -s * 0.95, s * 2.6, s * 1.9);
    // the stroke, tapered, grown by k
    const pts = []; const N = 40;
    for (let i = 0; i <= Math.round(N * kk); i++) { const a = i / N; pts.push([lerp(-s * 1.0, s * 1.0, a), s * 0.1 - Math.sin(a * Math.PI * 2.2) * s * 0.5 * (0.4 + 0.6 * a)]); }
    if (pts.length > 2) { g.fillStyle = ink; taper(g, pts, s * 0.17, PROF.brush); }
    // ruled guide lines
    g.strokeStyle = F.ink(0.4); g.lineWidth = 1.8 * u; g.setLineDash([8 * u, 8 * u]); g.beginPath(); g.moveTo(-s * 1.15, s * 0.1); g.lineTo(s * 1.15, s * 0.1); g.stroke(); g.setLineDash([]);
    const tip = pts.length ? pts[pts.length - 1] : [-s, s * 0.1];
    // the nib and holder
    g.save(); g.translate(tip[0], tip[1]); g.rotate(-0.7);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-s * 0.1, -s * 0.34); g.lineTo(s * 0.1, -s * 0.34); g.closePath(); g.fillStyle = pap; g.fill(); g.lineWidth = 4 * u; g.strokeStyle = ink; g.stroke();
    g.fillStyle = ink; g.fillRect(-s * 0.1, -s * 0.34 - s * 1.0, s * 0.2, s * 1.0); g.fillStyle = F.acc(1); g.fillRect(-s * 0.1, -s * 0.34 - s * 0.3, s * 0.2, s * 0.12);
    g.restore();
    // flicked ink drops
    for (let i = 0; i < 3; i++) { const dk = (k * 2 + i * 0.33) % 1; g.beginPath(); g.arc(tip[0] + (i - 1) * 16 * u * dk, tip[1] - 10 * u - dk * 40 * u, (6 - dk * 3) * u, 0, TAU); g.fillStyle = ink; g.fill(); }
    g.restore();
  }
  function stampIcon(g, F, cx, cy, s, t) {
    const { u } = F, ink = F.ink(1), pap = F.pap(1), cyc = (t * 0.62) % 1, down = cyc < 0.3 ? easeIn(cyc / 0.3) : cyc < 0.42 ? 1 : 1 - ease((cyc - 0.42) / 0.5) * 0.98;
    const sy = cy - s * 0.9 + down * s * 0.62, sh = down > 0.9 ? 1 + 0.03 * Math.sin(t * 70) : 1;
    // the page and the impression, which strengthens with every thump
    g.fillStyle = ink; g.fillRect(cx - s * 1.3 + 12 * u, cy + s * 0.25 + 12 * u, s * 2.6, s * 0.85); g.fillStyle = pap; g.fillRect(cx - s * 1.3, cy + s * 0.25, s * 2.6, s * 0.85); g.lineWidth = 5 * u; g.strokeStyle = ink; g.strokeRect(cx - s * 1.3, cy + s * 0.25, s * 2.6, s * 0.85);
    const imp = clamp((cyc - 0.28) * 10) * (1 - clamp((cyc - 0.8) * 5) * 0);
    g.save(); g.translate(cx, cy + s * 0.68); g.rotate(-0.16); g.globalAlpha = 0.25 + 0.75 * imp; g.strokeStyle = F.acc(1); g.lineWidth = 7 * u;
    g.beginPath(); g.ellipse(0, 0, s * 0.82, s * 0.32, 0, 0, TAU); g.stroke(); g.beginPath(); g.ellipse(0, 0, s * 0.7, s * 0.22, 0, 0, TAU); g.lineWidth = 2.5 * u; g.stroke();
    say(g, F, "OK", 0, s * 0.14, s * 0.46, { align: "center", font: FIG, color: F.acc(1) });
    g.restore();
    // the stamp itself
    g.save(); g.translate(cx, sy); g.scale(1, sh);
    g.fillStyle = ink; g.fillRect(-s * 0.1, -s * 0.9, s * 0.2, s * 0.5);
    g.beginPath(); g.ellipse(0, -s * 0.98, s * 0.28, s * 0.2, 0, 0, TAU); g.fillStyle = F.acc(1); g.fill(); g.lineWidth = 4.5 * u; g.strokeStyle = ink; g.stroke();
    g.beginPath(); g.moveTo(-s * 0.55, -s * 0.4); g.lineTo(s * 0.55, -s * 0.4); g.lineTo(s * 0.62, s * 0.05); g.lineTo(-s * 0.62, s * 0.05); g.closePath(); g.fillStyle = pap; g.fill(); g.stroke();
    g.fillStyle = ink; g.fillRect(-s * 0.62, s * 0.05, s * 1.24, s * 0.16);
    g.restore();
    if (cyc > 0.3 && cyc < 0.55) { const k = (cyc - 0.3) / 0.25; g.save(); g.strokeStyle = ink; g.lineWidth = 6 * u; g.lineCap = "round"; g.globalAlpha = 1 - k; for (let i = -2; i <= 2; i++) { const a = -Math.PI / 2 + i * 0.5; g.beginPath(); g.moveTo(cx + Math.cos(a) * s * (0.9 + k * 0.3), cy + s * 0.2 + Math.sin(a) * s * (0.5 + k * 0.4)); g.lineTo(cx + Math.cos(a) * s * (1.3 + k * 0.6), cy + s * 0.2 + Math.sin(a) * s * (0.9 + k * 0.8)); g.stroke(); } g.restore(); }
  }
  function processArt(g, F, P) {
    const { u, t } = F, d = P.d, C = F.C, n = d.steps.length, gut = 18 * u;
    header(g, F, P, "トントン", 41);
    const panels = F.tall ? rows(C, new Array(n).fill(1), 26 * u, gut) : cols(C, new Array(n).fill(1), 50 * u, gut);
    const icons = [reelIcon, penIcon, stampIcon], words = ["シュッ", "サラサラ", "ポン"];
    panels.forEach((pts, i) => {
      const bb = bboxOf(pts), hotStep = i === n - 1;
      panel(g, F, pts, rv(P, i), (g, bb) => {
        const cx = bb.x + bb.w * (F.tall ? 0.5 : 0.5), cy = bb.y + bb.h * (F.tall ? 0.46 : 0.44), s = Math.min(bb.w * (F.tall ? 0.16 : 0.2), bb.h * 0.2);
        if (i % 2 === 0) { tone(g, bb, 9 * u, radial(cx, cy, s * 1.4, Math.hypot(bb.w, bb.h) * 0.55, 0.0, 0.75), F.ink(0.9), (t * 6 * u) % (12 * u), 0); focus(g, cx, cy, s * 1.9, Math.hypot(bb.w, bb.h), 80, 13 * u, 50 + i, t, F.ink(1), t * 0.04 * (i - 1)); }
        else { tone(g, bb, 9 * u, linear(0, bb.y, 0, bb.y + bb.h, 0.0, 0.72), F.ink(0.9), 0, (t * 12 * u) % (12.7 * u)); streaks(g, bb, -0.35, 22, 60 + i, t, 0.3, 7 * u, F.pap(0.95), 0.45); }
        g.save(); g.beginPath(); g.arc(cx, cy + s * 0.1, s * 1.75, 0, TAU); g.fillStyle = hotStep ? F.acc(0.3) : F.pap(0.9); g.fill(); g.lineWidth = 3 * u; g.strokeStyle = F.ink(1); g.setLineDash([12 * u, 10 * u]); g.lineDashOffset = -t * 18 * u; g.stroke(); g.restore();
        const iq = back(span(P.local, 0.3 + i * 0.12, 0.8 + i * 0.12));
        g.save(); g.translate(cx, cy); g.scale(iq, iq); g.translate(-cx, -cy); icons[i % 3](g, F, cx, cy, s, t); g.restore();
        sfx(g, F, words[i % 3], bb.x + bb.w * 0.74, bb.y + bb.h * 0.2, Math.min(bb.h * 0.17, 76 * u), { maxW: bb.w * 0.4, q: span(P.local, 0.6 + i * 0.12, 1.0 + i * 0.12), rot: 0.14, seed: 90 + i });
        // step number in a burst at the corner
        const bx = bb.x + 62 * u, by = bb.y + 62 * u;
        g.save(); g.translate(bx, by); const nq = back(span(P.local, 0.2 + i * 0.12, 0.6 + i * 0.12)); g.scale(nq, nq);
        burst(g, 0, 0, 52 * u, 52 * u, 10, 0.25, 70 + i, t, t * 0.4); g.fillStyle = hotStep ? F.acc(1) : F.ink(1); g.fill(); g.lineWidth = 4 * u; g.strokeStyle = F.ink(1); g.stroke();
        say(g, F, String(i + 1), 0, 20 * u, 64 * u, { align: "center", font: FIG, color: hotStep ? F.onAcc : F.pap(1) });
        g.restore();
        tag(g, F, d.steps[i], cx, bb.y + bb.h - 52 * u, 48 * u, span(P.local, 0.5 + i * 0.12, 0.95 + i * 0.12), { align: "center", maxW: bb.w * 0.92, min: 42 * u, fill: hotStep ? F.acc(1) : F.pap(1) });
      });
    });
    // arrows that ride the gutters between beats
    for (let i = 0; i < n - 1; i++) {
      const a = bboxOf(panels[i]), b = bboxOf(panels[i + 1]), q = back(span(P.local, 0.5 + i * 0.12, 0.9 + i * 0.12));
      if (q <= 0) continue;
      const x = F.tall ? (a.x + a.w / 2) : (a.x + a.w + b.x) / 2 + 0, y = F.tall ? (a.y + a.h + b.y) / 2 : a.y + a.h * 0.44, nudge = Math.sin(t * 5 + i) * 6 * u;
      g.save(); g.translate(x + (F.tall ? 0 : nudge), y + (F.tall ? nudge : 0)); g.rotate(F.tall ? Math.PI / 2 : 0); g.scale(q, q);
      g.beginPath(); g.moveTo(-34 * u, -26 * u); g.lineTo(6 * u, -26 * u); g.lineTo(6 * u, -48 * u); g.lineTo(44 * u, 0); g.lineTo(6 * u, 48 * u); g.lineTo(6 * u, 26 * u); g.lineTo(-34 * u, 26 * u); g.closePath();
      g.fillStyle = F.acc(1); g.fill(); g.lineWidth = 5 * u; g.lineJoin = "miter"; g.strokeStyle = F.ink(1); g.stroke(); g.restore();
    }
  }

  // COMPARE: a versus spread cut along a slanted gutter. Left is the grind, right is the payoff.
  function compareArt(g, F, P) {
    const { u, t } = F, d = P.d, C = F.C, gut = 22 * u, tall = F.tall;
    header(g, F, P, "バシッ", 53);
    const panels = tall ? rows(C, [1, 1], 60 * u, gut) : cols(C, [1, 1], 120 * u, gut);
    const vals = [d.leftValue, d.rightValue], labels = [d.left, d.right], mx = Math.max(vals[0], vals[1], 1);
    panels.forEach((pts, i) => {
      const bb = bboxOf(pts), win = i === 1, v = vals[i], shown = v * ease(span(P.p, 0.15 + i * 0.12, 0.8 + i * 0.12));
      panel(g, F, pts, rv(P, i), (g, bb) => {
        const cx = bb.x + bb.w * (tall ? 0.72 : 0.7), cy = bb.y + bb.h * (tall ? 0.46 : 0.56), s = Math.min(bb.w * 0.17, bb.h * 0.15);
        if (!win) {
          tone(g, bb, 9 * u, linear(0, bb.y, 0, bb.y + bb.h, 0.82, 0.25), F.ink(0.92), (t * 5 * u) % (12 * u), 0);
          // gloom lines: tapered verticals that drip down on a loop
          g.fillStyle = F.ink(1); g.beginPath();
          for (let k = 0; k < 16; k++) { const x = bb.x + bb.w * (0.04 + hash(5, k, 1) * 0.92), len = bb.h * (0.2 + hash(5, k, 2) * 0.3), y0 = bb.y + ((hash(5, k, 3) + t * 0.12) % 1.2) * bb.h * 0.9 - len * 0.5; lens(g, x, y0, x + 6 * u, y0 + len, 9 * u); }
          g.fill();
        } else {
          tone(g, bb, 9 * u, radial(cx, cy, s * 1.2, bb.h * 0.95, 0.0, 0.78), F.ink(0.9), (t * 7 * u) % (12 * u), 0);
          focus(g, cx, cy, s * 1.7, Math.hypot(bb.w, bb.h), 100, 14 * u, 8, t, F.ink(1), t * 0.08);
          burst(g, cx, cy, s * 2.1, s * 2.1, 15, 0.3, 13, t, t * 0.35); g.fillStyle = F.acc(1); g.fill(); g.lineWidth = 4.5 * u; g.strokeStyle = F.ink(1); g.stroke();
          for (let k = 0; k < 9; k++) { const x = bb.x + bb.w * (0.06 + hash(8, k, 1) * 0.88), y = bb.y + bb.h * (0.1 + hash(8, k, 2) * 0.8), tw = 0.5 + 0.5 * Math.sin(t * (2 + hash(8, k, 3) * 3) + k); star(g, x, y, (14 + hash(8, k, 4) * 20) * u * (0.3 + tw), hash(8, k, 5), 0.2); g.fillStyle = F.pap(1); g.fill(); g.lineWidth = 2.5 * u; g.strokeStyle = F.ink(1); g.stroke(); }
        }
        const pop = back(span(P.local, 0.2 + i * 0.12, 0.7 + i * 0.12));
        person(g, F, cx, cy + (1 - pop) * bb.h * 0.7, s * (win ? 1.12 : 1), { hair: 0, expr: win ? "cheer" : "sad", seed: 2, shirt: "ink", blush: win, tilt: win ? 0.04 : -0.07, look: win ? [0, -0.3] : [0.3, 1] });
        // label, the big number and the meter
        const lx = bb.x + 50 * u + (tall ? 0 : (i ? 70 * u : 0));
        tag(g, F, labels[i], lx, bb.y + 62 * u, 48 * u, span(P.local, 0.4 + i * 0.12, 0.8 + i * 0.12), { fill: win ? F.acc(1) : F.pap(1), maxW: bb.w * 0.55, min: 42 * u });
        const txt = fmt(shown, d), size = Math.min(bb.h * 0.34, (bb.w * 0.5) / Math.max(1.6, txt.length * 0.5)), j = Math.floor(t * STEP);
        const sx = lx - 4 * u, sy = bb.y + bb.h * 0.52 + size * 0.34, shk = win ? 0 : 1.5 * u;
        const oxx = (hash(j, i, 6) - 0.5) * shk, oyy = (hash(j, i, 7) - 0.5) * shk;
        say(g, F, txt, sx + oxx, sy + oyy, size, { font: FIG, color: win ? F.acc(1) : F.ink(1), halo: F.pap(1), haloW: 0.2, track: 0.01, maxW: bb.w * 0.52 });
        const my = bb.y + bb.h - 54 * u, mw = bb.w * 0.5, mh = 30 * u, mk = clamp(v / mx) * ease(span(P.p, 0.25 + i * 0.1, 0.85 + i * 0.1));
        g.fillStyle = F.pap(1); g.fillRect(lx, my, mw, mh); g.lineWidth = 4.5 * u; g.strokeStyle = F.ink(1); g.strokeRect(lx, my, mw, mh);
        g.save(); g.beginPath(); g.rect(lx, my, mw * mk, mh); g.clip(); g.fillStyle = win ? F.acc(1) : F.ink(1); g.fillRect(lx, my, mw, mh);
        g.fillStyle = F.pap(0.9); g.beginPath(); for (let k = -2; k < 20; k++) { const x = lx + k * 26 * u + ((t * 40 * u) % (26 * u)); g.moveTo(x, my + mh); g.lineTo(x + 10 * u, my + mh); g.lineTo(x + 22 * u, my); g.lineTo(x + 12 * u, my); g.closePath(); } g.fill(); g.restore();
        g.strokeStyle = F.ink(1); g.strokeRect(lx, my, mw, mh);
        if (!win) sfx(g, F, "ズーン", bb.x + bb.w * 0.5, bb.y + bb.h * 0.2, Math.min(bb.h * 0.15, 80 * u), { q: span(P.p, 0.4, 0.7), rot: -0.1, seed: 12, vertical: false, skew: 0.1 });
      });
    });
    // a lightning-bolt strike where the two pages meet
    const q = span(P.local, 0.4, 0.8);
    if (q > 0) {
      const mid = tall ? [F.W / 2, (bboxOf(panels[0]).y + bboxOf(panels[0]).h)] : [C.x + C.w / 2 + 120 * u * (0.5 - 0.3), C.y + C.h * 0.3];
      g.save(); g.translate(mid[0], mid[1]); g.scale(back(q) * (1 + 0.05 * Math.sin(t * 8)), back(q) * (1 + 0.05 * Math.sin(t * 8))); g.rotate(tall ? Math.PI / 2 : 0);
      burst(g, 0, 0, 76 * u, 76 * u, 12, 0.3, 9, t, t * 0.5); g.fillStyle = F.acc(1); g.fill(); g.lineWidth = 5 * u; g.strokeStyle = F.ink(1); g.stroke();
      g.rotate(tall ? -Math.PI / 2 : 0); say(g, F, "VS", 0, 28 * u, 82 * u, { align: "center", font: FIG, color: F.ink(1), upper: false });
      g.restore();
    }
  }
  // ---- title and closing pages (drawn by the stage) ------------------------------------------------
  function confetti(g, F, n, seed, bright) {
    const { u, t, W, H } = F;
    for (let i = 0; i < n; i++) {
      const sp = 0.06 + hash(seed, i, 1) * 0.1, y = ((hash(seed, i, 2) + t * sp) % 1.1) * H * 1.1 - H * 0.05, x = W * hash(seed, i, 3) + Math.sin(t * 1.4 + i) * 22 * u, a = t * (1 + hash(seed, i, 4) * 3) + i;
      g.save(); g.translate(x, y); g.rotate(a); g.scale(1, Math.cos(a * 1.3));
      g.fillStyle = i % 3 === 0 ? F.acc(1) : bright ? F.pap(1) : F.ink(1); const w = (10 + hash(seed, i, 5) * 14) * u; g.fillRect(-w / 2, -w / 4, w, w / 2); g.lineWidth = 2 * u; g.strokeStyle = F.ink(1); g.strokeRect(-w / 2, -w / 4, w, w / 2); g.restore();
    }
  }
  function sparkField(g, F, n, seed, area) {
    const { u, t } = F;
    for (let i = 0; i < n; i++) {
      const x = area.x + area.w * hash(seed, i, 1), y = area.y + area.h * hash(seed, i, 2), tw = 0.5 + 0.5 * Math.sin(t * (2 + hash(seed, i, 3) * 3) + i * 2);
      star(g, x, y, (16 + hash(seed, i, 4) * 26) * u * (0.3 + tw * 0.9), hash(seed, i, 5), 0.2); g.fillStyle = F.pap(1); g.fill(); g.lineWidth = 3 * u; g.strokeStyle = F.ink(1); g.stroke();
    }
  }
  function inkDrops(g, F, n, seed) {
    const { u, t, W, H } = F;
    g.fillStyle = F.ink(1);
    for (let i = 0; i < n; i++) { const x = W * hash(seed, i, 1), y = H * hash(seed, i, 2), r = (4 + hash(seed, i, 3) * 9) * u * (0.7 + 0.3 * Math.sin(t * 2 + i)); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.beginPath(); g.arc(x + r * 2.2, y - r * 1.4, r * 0.45, 0, TAU); g.fill(); }
  }
  function titleArt(g, F, local) {
    const { u, t, W, H, m } = F, box = headBox("title") || { x0: W * 0.2, y0: H * 0.34, x1: W * 0.8, y1: H * 0.62 };
    const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2, bw = box.x1 - box.x0, bh = box.y1 - box.y0;
    // the page: a tone vignette, focus lines and a ruled border
    g.save(); g.beginPath(); g.rect(m, m, W - 2 * m, H - 2 * m); g.clip();
    g.fillStyle = F.pnl(1); g.fillRect(0, 0, W, H);
    tone(g, { x: 0, y: 0, w: W, h: H }, 9 * u, radial(cx, cy, Math.min(W, H) * 0.3, Math.hypot(W, H) * 0.55, 0.0, 0.92), F.ink(0.92), (t * 7 * u) % (12.7 * u), 0);
    focus(g, cx, cy, Math.min(bw, bh) * 0.42, Math.hypot(W, H), 170, 22 * u, 1, t, F.ink(1), Math.sin(t * 0.35) * 0.05);
    inkDrops(g, F, 14, 4);
    g.restore();
    g.lineWidth = 7 * u; g.lineJoin = "miter"; g.strokeStyle = F.ink(1); g.strokeRect(m, m, W - 2 * m, H - 2 * m);
    // the cast, standing in front of the frame
    const popM = back(span(local, 0.15, 0.75)), popC = back(span(local, 0.3, 0.9));
    const sM = F.tall ? H * 0.085 : H * 0.115, sC = F.tall ? H * 0.07 : H * 0.095;
    const mx = F.tall ? W * 0.24 : W * 0.115, my = (F.tall ? H * 0.86 : H * 0.86) + (1 - popM) * H * 0.4;
    person(g, F, mx, my, sM, { hair: 0, expr: local > 1.1 ? "cheer" : "wow", seed: 2, shirt: "ink", blush: true, tilt: -0.07 });
    const cxx = F.tall ? W * 0.78 : W * 0.885, cyy = (F.tall ? H * 0.84 : H * 0.8) + (1 - popC) * H * 0.4;
    clap(g, F, cxx, cyy, sC, { expr: "cheer", armsUp: true, seed: 1, tilt: 0.08 });
    // the burst that holds the headline
    const hs = F.plan.shown.find((s) => s.id === "title"), outK = hs ? easeIn(span(local, hs.hold - F.info.change, hs.hold)) : 0;
    const bq = back(span(local, 0, 0.55)), sc = lerp(0.5, 1, bq) * (1 - 0.3 * outK);
    const rx = Math.min(bw / 2 + (F.tall ? 110 : 230) * u, W / 2 - 20 * u) * sc, ry = (bh / 2 + (F.tall ? 150 : 190) * u) * sc;
    g.save(); g.translate(14 * u, 14 * u); burst(g, cx, cy, rx * (1 + 0.012 * Math.sin(t * 4)), ry * (1 + 0.012 * Math.sin(t * 4)), 24, 0.17, 3, t); g.fillStyle = F.ink(1); g.fill(); g.restore();
    burst(g, cx, cy, rx * (1 + 0.012 * Math.sin(t * 4)), ry * (1 + 0.012 * Math.sin(t * 4)), 24, 0.17, 3, t); g.fillStyle = F.pap(1); g.fill(); g.lineWidth = 7 * u; g.lineJoin = "miter"; g.strokeStyle = F.ink(1); g.stroke();
    sfx(g, F, "ドーン", W * (F.tall ? 0.2 : 0.12), H * (F.tall ? 0.11 : 0.2), Math.min(H * 0.12, 130 * u), { q: span(local, 0.2, 0.7), rot: -0.2, seed: 61, vertical: true });
    sfx(g, F, "ワクワク", W * (F.tall ? 0.7 : 0.86), H * (F.tall ? 0.12 : 0.2), Math.min(H * 0.1, 108 * u), { q: span(local, 0.3, 0.8), rot: 0.14, seed: 62, vertical: F.tall ? false : true });
    sparkField(g, F, 14, 17, { x: m * 2, y: m * 2, w: W - m * 4, h: H - m * 4 });
  }
  function closingArt(g, F, local) {
    const { u, t, W, H, m } = F, box = headBox("closing") || { x0: W * 0.2, y0: H * 0.34, x1: W * 0.8, y1: H * 0.62 };
    const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
    g.save(); g.beginPath(); g.rect(m, m, W - 2 * m, H - 2 * m); g.clip();
    g.fillStyle = F.ink(1); g.fillRect(0, 0, W, H);
    tone(g, { x: 0, y: 0, w: W, h: H }, 9 * u, radial(cx, cy, Math.min(W, H) * 0.25, Math.hypot(W, H) * 0.6, 0.0, 0.5), F.pap(0.55), (t * 8 * u) % (12.7 * u), 0);
    focus(g, cx, cy, Math.min(W, H) * 0.2, Math.hypot(W, H), 190, 24 * u, 5, t, F.pap(1), -Math.sin(t * 0.3) * 0.06 + t * 0.02);
    confetti(g, F, 36, 9, true);
    g.restore();
    g.lineWidth = 7 * u; g.lineJoin = "miter"; g.strokeStyle = F.ink(1); g.strokeRect(m, m, W - 2 * m, H - 2 * m);
    // the headline's big slanted plate
    const q = back(span(local, 0, 0.5)), pad = 70 * u, sk = 46 * u;
    const x0 = box.x0 - pad, x1 = box.x1 + pad, y0 = box.y0 - pad * 0.7, y1 = box.y1 + pad * 0.7;
    g.save(); g.translate(cx, cy); g.scale(lerp(0.6, 1, q), lerp(0.6, 1, q)); g.translate(-cx, -cy);
    const shape = () => { g.beginPath(); g.moveTo(x0 + sk, y0); g.lineTo(x1 + sk, y0); g.lineTo(x1 - sk, y1); g.lineTo(x0 - sk, y1); g.closePath(); };
    g.translate(16 * u, 16 * u); shape(); g.fillStyle = F.acc(1); g.fill(); g.translate(-16 * u, -16 * u);
    shape(); g.fillStyle = F.pap(1); g.fill(); g.lineWidth = 7 * u; g.lineJoin = "miter"; g.strokeStyle = F.ink(1); g.stroke();
    g.lineWidth = 2 * u; g.beginPath(); g.moveTo(x0 + sk * 0.9 + 18 * u, y0 + 16 * u); g.lineTo(x1 + sk * 0.9 - 18 * u, y0 + 16 * u); g.stroke();
    g.restore();
    // the cast cheers; a stamp lands on the page
    const pm = back(span(local, 0.2, 0.8)), pc = back(span(local, 0.35, 0.95));
    person(g, F, F.tall ? W * 0.26 : W * 0.13, H * 0.87 + (1 - pm) * H * 0.4, F.tall ? H * 0.085 : H * 0.115, { hair: 0, expr: "cheer", seed: 2, shirt: "ink", blush: true, tilt: 0.05 });
    clap(g, F, F.tall ? W * 0.76 : W * 0.87, (F.tall ? H * 0.85 : H * 0.82) + (1 - pc) * H * 0.4, F.tall ? H * 0.07 : H * 0.095, { expr: "cheer", armsUp: true, seed: 3, tilt: -0.08 });
    const sq = span(local, 0.7, 0.95), sd = easeIn(sq);
    if (sq > 0) {
      const size = Math.min(H * 0.2, 200 * u), sx = F.tall ? W * 0.5 : W * 0.5, sy = F.tall ? H * 0.8 : H * 0.79, sc = lerp(2.2, 1, sd) * (1 + (sq >= 1 ? 0.03 * Math.sin(t * 6) : 0));
      g.save(); g.translate(sx, sy); g.rotate(-0.2); g.scale(sc, sc); g.globalAlpha = clamp(sq * 3);
      g.beginPath(); g.arc(0, 0, size * 0.78, 0, TAU); g.fillStyle = F.pap(1); g.fill(); g.lineWidth = 8 * u; g.strokeStyle = F.acc(1); g.stroke(); g.beginPath(); g.arc(0, 0, size * 0.66, 0, TAU); g.lineWidth = 3 * u; g.stroke();
      g.font = `900 ${size}px ${SFXF}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = F.acc(1); g.fillText("完", 0, size * 0.04);
      g.restore();
    }
    sparkField(g, F, 12, 33, { x: m * 2, y: m * 2, w: W - m * 4, h: H - m * 4 });
  }

  // ---- registered scenes and the stage ---------------------------------------------------------------
  const kit = (id, art) => (ctx, S, box, p, d, info) => {
    const F = frame;
    if (!F || !F.plan) return;
    const g = ctx;
    if (info.exit != null) { // this scene is leaving: it lives ahead of the slash
      const k = inout(info.exit);
      g.save(); clipSide(g, F, k, true); art(g, F, { d, p: 1, local: info.local + 0, t: info.t }); g.restore();
      band(g, F, k);
      return;
    }
    const inT = F.index > 0 && info.local < info.change, k = inT ? inout(info.local / info.change) : 1;
    g.save(); if (inT) clipSide(g, F, k, false);
    art(g, F, { d, p, local: info.local, t: info.t });
    g.restore();
    if (inT) band(g, F, k);
    caption(g, F, id, info.local, info.hold, F.index === F.plan.shown.length - 1);
  };
  const STAGE_ART = { title: titleArt, closing: closingArt };

  let grainTile = null, grainKey = "";
  function paint(ctx, W, H, t, accent, look) {
    ctx.clearRect(0, 0, W, H);
    const T = look.tone, u = Math.min(W, H) / 1080, step = Math.floor(t * 8);
    const key = T.ink;
    if (!grainTile || grainKey !== key) {
      grainTile = document.createElement("canvas"); grainTile.width = grainTile.height = 256; grainKey = key;
      const gg = grainTile.getContext("2d"), R = rng(77);
      for (let i = 0; i < 2600; i++) { gg.fillStyle = `rgba(${T.ink},${0.05 + R() * 0.12})`; const s = 1 + R() * 1.6; gg.fillRect(R() * 256, R() * 256, s, s); }
      for (let i = 0; i < 700; i++) { gg.fillStyle = `rgba(${T.paper},${0.1 + R() * 0.2})`; gg.fillRect(R() * 256, R() * 256, 1 + R() * 1.4, 1 + R() * 1.4); }
    }
    const pat = ctx.createPattern(grainTile, "repeat"), ox = Math.floor(hash(step, 1, 2) * 256), oy = Math.floor(hash(step, 3, 4) * 256);
    ctx.save(); ctx.translate(-ox, -oy); ctx.fillStyle = pat; ctx.fillRect(ox, oy, W, H); ctx.restore();
    // scan dust, a stray hair, and slightly darker page edges
    ctx.fillStyle = `rgba(${T.ink},0.5)`;
    for (let i = 0; i < 22; i++) { const x = hash(step, i, 5) * W, y = hash(step, i, 6) * H, r = (0.8 + hash(step, i, 7) * 2.2) * u; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = `rgba(${T.ink},0.35)`; ctx.lineWidth = 1.2 * u;
    for (let i = 0; i < 2; i++) { const x = hash(Math.floor(t * 3), i, 8) * W, y = hash(Math.floor(t * 3), i, 9) * H; ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + 30 * u, y - 14 * u, x + 50 * u, y + 20 * u, x + 90 * u, y + 4 * u); ctx.stroke(); }
    const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    gr.addColorStop(0, `rgba(${T.ink},0)`); gr.addColorStop(1, `rgba(${T.ink},0.12)`); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  }

  const TONE = { paper: "243,238,226", paperHex: "#f3eee2", panel: "252,250,243", ink: "22,19,16" };
  const halo = () => "none";
  return {
    bg: "#f3eee2", panel: "#fcfaf3", ink: "#16130f", muted: "#6b645a", accent: "#e5402a", onAccent: "#ffffff",
    rule: "rgba(22,19,16,0.9)", track: "rgba(22,19,16,0.1)",
    display: LET, displayWeight: 800, displayCase: "uppercase", displayTracking: "0.01em", displayStyle: "italic",
    body: LET, bodyWeight: 700, figures: FIG, radius: 0, motion: "wipe", change: "slash",
    kit: { line: 4, fill: "solid", panel: "outline" },
    tone: TONE, keepArt: true, overlap: true,
    palettes: {
      light: { bg: "#fbfaf6", panel: "#ffffff", ink: "#101218", muted: "#555a66", accent: "#2a62e0", onAccent: "#ffffff", rule: "rgba(16,18,24,0.9)", track: "rgba(16,18,24,0.1)", backdrop: () => "#fbfaf6", textShadow: halo,
        tone: { paper: "251,250,246", paperHex: "#fbfaf6", panel: "255,255,255", ink: "16,18,24" } },
      dark: { bg: "#15120f", panel: "#1d1915", ink: "#efe9db", muted: "#a49c8d", accent: "#ff6a4a", onAccent: "#15120f", rule: "rgba(239,233,219,0.9)", track: "rgba(239,233,219,0.12)", backdrop: () => "#15120f", textShadow: halo,
        tone: { paper: "21,18,15", paperHex: "#15120f", panel: "29,25,21", ink: "239,233,219" } },
      mono: { bg: "#efefec", panel: "#fafaf8", ink: "#1a1a1a", muted: "#666666", accent: "#8c8c88", onAccent: "#1a1a1a", rule: "rgba(26,26,26,0.9)", track: "rgba(26,26,26,0.1)", backdrop: () => "#efefec", textShadow: halo,
        tone: { paper: "239,239,236", paperHex: "#efefec", panel: "250,250,248", ink: "26,26,26" } },
    },
    textShadow: halo,
    backdrop: () => "#f3eee2",
    css: () => `
      #root .kicker { color: var(--bg); font-size: calc(min(100vw, 100vh) * 0.0426) !important; letter-spacing: 0.1em; font-weight: 800; font-style: italic; text-shadow: none; }
      #root .display { text-shadow: none; -webkit-font-smoothing: antialiased; }
    `,
    paint, paintOver: true,
    stage(ctx, S, info) {
      const F = (frame = makeFrame(ctx, S, info)), g = ctx;
      F.onAcc = S.look.onAccent;
      if (S.paint) { g.fillStyle = F.T.paperHex; g.fillRect(0, 0, F.W, F.H); }
      const id = info.scene, shown = F.plan.shown, prev = shown[F.index - 1];
      if (!id) return;
      const inT = F.index > 0 && info.local < info.change, k = inT ? inout(info.local / info.change) : 1;
      if (isStage(id)) {
        g.save(); if (inT) clipSide(g, F, k, false);
        STAGE_ART[id](g, F, info.local);
        g.restore();
        if (inT && prev && isStage(prev.id)) {
          g.save(); clipSide(g, F, k, true); STAGE_ART[prev.id](g, F, prev.hold + info.local); g.restore(); band(g, F, k);
        }
        caption(g, F, id, info.local, info.hold, F.index === shown.length - 1);
      } else if (inT && prev && isStage(prev.id)) {
        g.save(); clipSide(g, F, k, true); STAGE_ART[prev.id](g, F, prev.hold + info.local); g.restore();
      }
    },
    scenes: { chart: kit("chart", chartArt), object: kit("object", objectArt), people: kit("people", peopleArt), process: kit("process", processArt), compare: kit("compare", compareArt) },
  };
});
