// Woodblock: a travelling print in the ukiyo-e manner. One long landscape is printed on fibrous
// washi: an indigo strip and horizon bokashi in the sky, pale ranges and sage hills cut by drifting
// kasumi mist, a river of carved ripple lines along the foot, reeds in the corners and petals (snow
// at night) falling through every hold. Each scene prints in like a real impression: the keyblock
// outlines first, then each colour block, settling into register. At a change, mist bands sweep
// across the frame while the landscape pans on to the next stop. All motifs, figures and buildings
// are original drawings. Frames are pure functions of time.
window.DreamcutMotion.register("woodblock", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const inout = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const c = 1.6; return 1 + (c + 1) * Math.pow(v - 1, 3) + c * Math.pow(v - 1, 2); };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const SERIF = "'Hiragino Mincho ProN', 'Baskerville', 'Palatino', 'Georgia', serif";
  const CJK = "'Hiragino Mincho ProN', 'Songti SC', 'STSong', 'Hiragino Sans GB', serif";
  const NUMS = ["一", "二", "三", "四", "五", "六", "七", "八"];
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  const HEADS = { title: ["kicker", "title"], chart: ["chart-title"], object: ["object-title"], people: ["people-title"], process: ["process-title"], compare: ["compare-title"], closing: ["closing"] };

  // ---- small path builders --------------------------------------------------------------------------
  const P = () => new Path2D();
  const rectP = (x, y, w, h) => { const p = P(); p.rect(x, y, w, h); return p; };
  const rrP = (x, y, w, h, r) => { const p = P(); p.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2))); return p; };
  const ellP = (cx, cy, rx, ry, rot = 0) => { const p = P(); p.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); return p; };
  const polyP = (pts, close = true) => { const p = P(); pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); if (close) p.closePath(); return p; };
  const lineP = (pts) => polyP(pts, false);
  function grad(g, x0, y0, x1, y1, stops) {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    for (const [k, c] of stops) gr.addColorStop(clamp(k), c);
    return gr;
  }
  function shade(hex, k) {
    // k < 0 darkens toward black, k > 0 lightens toward white.
    const n = parseInt(String(hex).slice(1), 16);
    let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
    if (k < 0) { r *= 1 + k; gg *= 1 + k; b *= 1 + k; } else { r += (255 - r) * k; gg += (255 - gg) * k; b += (255 - b) * k; }
    const h = (v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0");
    return `#${h(r)}${h(gg)}${h(b)}`;
  }

  // ---- printing ------------------------------------------------------------------------------------
  // One block: the colour impression (slightly out of register, with wood grain in the ink), then the
  // keyblock line. F.pass limits a call to the colour or the key impression while a scene prints in.
  function ink(g, F, path, color, o = {}) {
    if (F.pass !== "line" && color) {
      g.save();
      if (o.reg !== false) g.translate(F.reg.x, F.reg.y);
      g.fillStyle = color;
      g.fill(path, o.rule || "nonzero");
      const gr = (o.grain ?? 1) * F.tex;
      if (gr > 0) { g.globalAlpha *= gr; g.fillStyle = F.pat.grain; g.fill(path, o.rule || "nonzero"); }
      g.restore();
    }
    if (F.pass !== "fill" && o.lw !== 0) {
      g.lineWidth = (o.lw ?? 3) * F.u;
      g.strokeStyle = o.stroke || F.T.key;
      g.lineJoin = "round"; g.lineCap = "round";
      g.stroke(path);
    }
  }
  // Key lines only (hatching, ribs, strands).
  function key(g, F, path, lw = 2, color) {
    if (F.pass === "fill") return;
    g.lineWidth = lw * F.u; g.strokeStyle = color || F.T.key; g.lineJoin = "round"; g.lineCap = "round";
    g.stroke(path);
  }
  // A scene element prints in: the key impression sweeps across first, then the colour block.
  function printIn(g, F, b, qk, qc, draw) {
    if (qk <= 0) return;
    if (qk >= 1 && qc >= 1) { F.pass = "both"; draw(); return; }
    const sweep = (q) => {
      const skew = b.h * 0.18, x = b.x - skew + (b.w + skew * 2) * q;
      g.beginPath(); g.moveTo(b.x - skew - 4, b.y - 4); g.lineTo(x + skew, b.y - 4); g.lineTo(x - skew, b.y + b.h + 4); g.lineTo(b.x - skew - 4, b.y + b.h + 4); g.closePath(); g.clip();
    };
    const reg = F.reg;
    if (qc > 0) {
      g.save(); sweep(ease(qc));
      F.reg = { x: reg.x + (1 - ease(qc)) * 7 * F.u, y: reg.y - (1 - ease(qc)) * 5 * F.u };
      F.pass = "fill"; draw();
      F.reg = reg; g.restore();
    }
    g.save(); sweep(ease(qk)); F.pass = "line"; draw(); g.restore();
    F.pass = "both";
  }

  // ---- lettering -----------------------------------------------------------------------------------
  function font(g, size, weight = 600, fam = SERIF) { g.font = `${weight} ${size}px ${fam}`; }
  function measure(g, s, size, weight = 600, fam = SERIF) { font(g, size, weight, fam); return g.measureText(String(s ?? "")).width; }
  function say(g, F, s, x, y, size, o = {}) {
    if (F.pass === "fill") return;
    s = String(s ?? "");
    if (!s) return;
    const fam = o.fam || SERIF, wt = o.weight || 600;
    let sz = size, w = measure(g, s, sz, wt, fam);
    if (o.maxW && w > o.maxW) { sz = Math.max(o.min || size * 0.8, (size * o.maxW) / w); w = measure(g, s, sz, wt, fam); }
    g.fillStyle = o.color || F.T.key; g.textAlign = o.align || "center"; g.textBaseline = o.base || "middle";
    g.fillText(s, x, y);
  }
  // Up to two lines; shrinks toward `min` when a line still does not fit.
  function wrap(g, s, size, maxW, min) {
    s = String(s ?? "").trim();
    let sz = size;
    for (let tries = 0; tries < 12; tries++) {
      if (measure(g, s, sz) <= maxW) return { lines: [s], size: sz };
      const words = s.split(/\s+/);
      if (words.length > 1) {
        let best = null;
        for (let k = 1; k < words.length; k++) {
          const a = words.slice(0, k).join(" "), b = words.slice(k).join(" ");
          const w = Math.max(measure(g, a, sz), measure(g, b, sz));
          if (!best || w < best.w) best = { a, b, w };
        }
        if (best.w <= maxW) return { lines: [best.a, best.b], size: sz };
      }
      if (sz <= min) break;
      sz = Math.max(min, sz * 0.94);
    }
    const words = s.split(/\s+/);
    if (words.length > 1) { const k = Math.ceil(words.length / 2); return { lines: [words.slice(0, k).join(" "), words.slice(k).join(" ")], size: sz }; }
    return { lines: [s], size: sz };
  }
  // A printed label plate (cream, double keyline, ochre bokashi along the top) with its words in place.
  function plateSize(g, F, text, size, maxW) {
    const { u } = F, padX = 26 * u, padY = 14 * u;
    const lay = wrap(g, text, size, maxW - padX * 2, 42 * u);
    const tw = Math.max(...lay.lines.map((l) => measure(g, l, lay.size)));
    return { lay, w: tw + padX * 2, h: lay.lines.length * lay.size * 1.16 + padY * 2 };
  }
  function plate(g, F, x, y, w, h, o = {}) {
    const { u, T } = F;
    const p = rectP(x, y, w, h);
    ink(g, F, p, grad(g, 0, y, 0, y + h, [[0, o.top || shade(T.ochre, 0.45)], [0.35, T.plate], [1, T.plate]]), { lw: 3, grain: 0.5 });
    key(g, F, rectP(x + 6 * u, y + 6 * u, w - 12 * u, h - 12 * u), 1.3, o.edge);
    if (o.accent) { ink(g, F, rectP(x, y + h - 7 * u, w, 7 * u), o.accent, { lw: 0, grain: 0.3 }); }
  }
  function labelPlate(g, F, text, cx, cy, size, maxW, o = {}) {
    const m = o.m || plateSize(g, F, text, size, maxW);
    const x = cx - m.w / 2, y = cy - m.h / 2;
    plate(g, F, x, y, m.w, m.h, o);
    const n = m.lay.lines.length;
    m.lay.lines.forEach((l, i) => say(g, F, l, cx, cy + (i - (n - 1) / 2) * m.lay.size * 1.16 + m.lay.size * 0.04, m.lay.size, { weight: 600 }));
    return m;
  }
  const fmt = (v, d) => window.DreamcutMotion.formatNumber(v, Math.abs((Number(v) || 0) % 1) > 0.001 ? 1 : 0, (d && d.prefix) || "", (d && d.suffix) || "");
  const tally = (target, k, d) => { const dec = Math.abs((Number(target) || 0) % 1) > 0.001 ? 1 : 0; return window.DreamcutMotion.formatNumber(target * k, dec, (d && d.prefix) || "", (d && d.suffix) || ""); };

  // ---- shared motifs -------------------------------------------------------------------------------
  // A kasumi mist band: a long rounded bar with a stepped second bar, bokashi toward its edges.
  function mistBand(g, F, x, y, w, h, color, o = {}) {
    const p = P();
    p.roundRect(x, y, w, h, h / 2);
    p.roundRect(x + w * (o.step ?? 0.18), y - h * 0.45, w * 0.5, h * 0.7, h * 0.35);
    p.roundRect(x + w * 0.42, y + h * 0.7, w * 0.46, h * 0.62, h * 0.31);
    g.save();
    g.globalAlpha *= o.alpha ?? 1;
    g.fillStyle = grad(g, 0, y - h * 0.45, 0, y + h * 1.32, [[0, color], [0.55, color], [1, o.edge || color]]);
    g.fill(p);
    if (o.tint) { g.fillStyle = grad(g, x, 0, x + w, 0, [[0, hexA(o.tint, 0)], [0.5, hexA(o.tint, 0.28)], [1, hexA(o.tint, 0)]]); g.fill(p); }
    if (o.line) { g.lineWidth = 1.4 * F.u; g.strokeStyle = hexA(F.T.key, 0.35); g.stroke(p); }
    g.restore();
  }
  // A person in a patterned robe. h is their full height; style picks hair, prop and robe pattern.
  function person(g, F, x, feet, h, style, o = {}) {
    const { T, t } = F, s = h / 100, i = o.seed ?? style;
    const bob = Math.sin(t * 1.8 + i * 1.3) * 0.9 * s;
    const robe = o.robe || [T.indigo, T.sage, T.ochre, T.rose, T.deep, T.wood][style % 6];
    const obi = o.obi || [T.ochre, T.rose, T.deep, T.indigo, T.ochre, T.sage][style % 6];
    const y = (v) => feet - v * s + bob * (v / 100);
    const sway = Math.sin(t * 1.4 + i) * 1.2 * s;
    const hy = y(86), hr = 8 * s;
    // Prop behind the body: parasol canopy.
    if (style % 6 === 0 && !o.walker) {
      const ang = -0.25 + Math.sin(t * 0.9 + i) * 0.06, px = x + 16 * s, py = y(56);
      const tipX = px + Math.sin(ang) * 54 * s, tipY = py - Math.cos(ang) * 54 * s;
      ink(g, F, lineP([[px, py], [tipX, tipY]]), null, { lw: 2.2 });
      g.save(); g.translate(tipX, tipY); g.rotate(ang);
      const cw = 36 * s, ch = 15 * s;
      const can = P(); can.moveTo(-cw, ch * 0.55); can.quadraticCurveTo(-cw * 0.7, -ch, 0, -ch * 1.05); can.quadraticCurveTo(cw * 0.7, -ch, cw, ch * 0.55);
      for (let k = 0; k <= 8; k++) { const xx = -cw + (k / 8) * cw * 2; can.lineTo(xx, ch * 0.55 + (k % 2 ? -2.5 * s : 0)); }
      can.closePath();
      ink(g, F, can, grad(g, 0, -ch, 0, ch, [[0, shade(o.prop || T.rose, -0.15)], [1, o.prop || T.rose]]), { lw: 2.4 });
      const ribs = P();
      for (let k = -3; k <= 3; k++) { ribs.moveTo(0, -ch * 1.05); ribs.lineTo((k / 3.4) * cw, ch * 0.5); }
      key(g, F, ribs, 1.2);
      g.restore();
    }
    // Sleeves behind the robe.
    const sl = (dir) => {
      const sx = x + dir * 12 * s;
      const p = polyP([[sx, y(74)], [sx + dir * 12 * s + sway * 0.3, y(66)], [sx + dir * 13 * s + sway * 0.5, y(46)], [sx + dir * 4 * s, y(44)], [sx, y(54)]]);
      ink(g, F, p, shade(robe, -0.12), { lw: 2.6 });
    };
    sl(-1); sl(1);
    // Robe.
    const rp = P();
    rp.moveTo(x - 5 * s, y(78)); rp.lineTo(x - 13 * s, y(74)); rp.quadraticCurveTo(x - 14 * s, y(40), x - 18 * s, y(3));
    rp.quadraticCurveTo(x, y(0), x + 18 * s, y(3)); rp.quadraticCurveTo(x + 14 * s, y(40), x + 13 * s, y(74)); rp.lineTo(x + 5 * s, y(78)); rp.closePath();
    ink(g, F, rp, grad(g, 0, y(78), 0, y(0), [[0, robe], [0.75, robe], [1, shade(robe, -0.22)]]), { lw: 2.8 });
    // Robe pattern, clipped to the robe.
    if (F.pass !== "line") {
      g.save(); g.clip(rp);
      g.fillStyle = hexA(T.plate, 0.55); g.strokeStyle = hexA(T.plate, 0.6); g.lineWidth = 1.4 * s;
      const kind = (style + (o.pattern ?? 0)) % 6, x0 = x - 20 * s, x1 = x + 20 * s, y0 = y(80), y1 = y(0);
      const pp = P();
      if (kind === 0) { for (let yy = y0; yy < y1; yy += 7 * s) for (let xx = x0 + ((Math.round((yy - y0) / (7 * s)) % 2) * 7 * s); xx < x1; xx += 14 * s) pp.rect(xx, yy, 7 * s, 7 * s); g.globalAlpha *= 0.55; g.fill(pp); }
      else if (kind === 1) { for (let yy = y0; yy < y1; yy += 8 * s) for (let xx = x0 + ((Math.round((yy - y0) / (8 * s)) % 2) * 4 * s); xx < x1; xx += 8 * s) { pp.moveTo(xx + 1.6 * s, yy); pp.arc(xx, yy, 1.6 * s, 0, TAU); } g.fill(pp); }
      else if (kind === 2) { for (let xx = x0; xx < x1; xx += 5 * s) { pp.moveTo(xx, y0); pp.lineTo(xx, y1); } g.stroke(pp); }
      else if (kind === 3) { for (let yy = y0; yy < y1; yy += 10 * s) for (let xx = x0; xx < x1; xx += 10 * s) { pp.moveTo(xx, yy - 3 * s); pp.lineTo(xx, yy + 3 * s); pp.moveTo(xx - 3 * s, yy); pp.lineTo(xx + 3 * s, yy); } g.stroke(pp); }
      else if (kind === 4) { for (let yy = y0; yy < y1; yy += 7 * s) { pp.moveTo(x0, yy); for (let xx = x0; xx <= x1; xx += 4 * s) pp.lineTo(xx, yy + Math.sin(xx / s * 0.8) * 1.6 * s); } g.stroke(pp); }
      else { for (let k = -10; k < 10; k++) { pp.moveTo(x0 + k * 7 * s, y0); pp.lineTo(x0 + k * 7 * s + 60 * s, y1); } g.globalAlpha *= 0.7; g.stroke(pp); }
      g.restore();
    }
    // Collar and sash.
    key(g, F, lineP([[x - 5 * s, y(78)], [x + 3 * s, y(52)]]), 4.2, T.plate);
    key(g, F, lineP([[x + 5 * s, y(78)], [x - 2 * s, y(54)]]), 4.2, T.plate);
    key(g, F, lineP([[x - 5.8 * s, y(78.5)], [x + 2.4 * s, y(52)], [x + 5.8 * s, y(78.5)]]), 1.6);
    ink(g, F, polyP([[x - 13.4 * s, y(54)], [x + 13.4 * s, y(54)], [x + 13.6 * s, y(46)], [x - 13.6 * s, y(46)]]), obi, { lw: 2.2 });
    ink(g, F, polyP([[x + 6 * s, y(52)], [x + 12 * s, y(56)], [x + 11 * s, y(44)]]), shade(obi, -0.2), { lw: 1.6 });
    // Sandals.
    ink(g, F, rrP(x - 10 * s, feet - 2.4 * s, 8 * s, 3 * s, 1 * s), T.wood, { lw: 1.6 });
    ink(g, F, rrP(x + 2 * s, feet - 2.4 * s, 8 * s, 3 * s, 1 * s), T.wood, { lw: 1.6 });
    // Head, hair and face.
    const hair = style % 6;
    if (hair === 4) ink(g, F, ellP(x, hy + 4 * s, hr * 1.25, hr * 1.5), T.key, { lw: 0 });
    ink(g, F, ellP(x, hy, hr, hr * 1.1), T.face, { lw: 2.2, grain: 0.2 });
    const hp = P();
    if (hair === 0 || hair === 3) { hp.ellipse(x, hy - hr * 0.5, hr * 1.04, hr * 0.68, 0, Math.PI, TAU); hp.closePath(); hp.moveTo(x + hr * 0.6, hy - hr * 1.3); hp.ellipse(x, hy - hr * 1.3, hr * 0.6, hr * 0.42, 0, 0, TAU); }
    else if (hair === 1) { hp.moveTo(x - hr * 1.12, hy + hr * 0.5); hp.quadraticCurveTo(x - hr * 1.2, hy - hr * 1.4, x, hy - hr * 1.18); hp.quadraticCurveTo(x + hr * 1.2, hy - hr * 1.4, x + hr * 1.12, hy + hr * 0.5); hp.lineTo(x + hr * 0.6, hy - hr * 0.3); hp.lineTo(x - hr * 0.6, hy - hr * 0.3); hp.closePath(); }
    else if (hair === 2) { hp.ellipse(x, hy - hr * 0.55, hr * 1.02, hr * 0.62, 0, Math.PI, TAU); hp.closePath(); }
    else if (hair === 5) { hp.ellipse(x, hy - hr * 0.5, hr * 1.06, hr * 0.7, 0, Math.PI, TAU); hp.closePath(); hp.moveTo(x - hr, hy - hr * 0.2); hp.quadraticCurveTo(x - hr * 1.5, hy + hr * 2.2, x - hr * 0.6, hy + hr * 3.6); hp.lineTo(x - hr * 0.3, hy + hr * 1.2); hp.closePath(); }
    else { hp.ellipse(x, hy - hr * 0.45, hr * 1.06, hr * 0.7, 0, Math.PI, TAU); hp.closePath(); }
    ink(g, F, hp, T.key, { lw: 1.4, grain: 0.15 });
    if (hair === 3 || o.walker) {
      // A wide straw hat.
      const hat = P(); hat.moveTo(x - hr * 2.6, hy - hr * 0.35); hat.quadraticCurveTo(x, hy - hr * 2.6, x + hr * 2.6, hy - hr * 0.35); hat.quadraticCurveTo(x, hy - hr * 0.9, x - hr * 2.6, hy - hr * 0.35); hat.closePath();
      ink(g, F, hat, grad(g, 0, hy - hr * 2.4, 0, hy, [[0, shade(T.ochre, -0.1)], [1, T.ochre]]), { lw: 2.2 });
      key(g, F, lineP([[x - hr * 1.6, hy - hr * 0.8], [x, hy - hr * 2.0], [x + hr * 1.6, hy - hr * 0.8]]), 1);
    }
    if (hair === 2) ink(g, F, rrP(x - hr * 0.3, hy - hr * 1.6, hr * 0.6, hr * 0.5, 1 * s), T.accentSoft, { lw: 1.2 });
    const eyeY = hy + hr * 0.08;
    const eyes = P();
    eyes.moveTo(x - hr * 0.62, eyeY); eyes.quadraticCurveTo(x - hr * 0.4, eyeY + hr * 0.18, x - hr * 0.18, eyeY);
    eyes.moveTo(x + hr * 0.18, eyeY); eyes.quadraticCurveTo(x + hr * 0.4, eyeY + hr * 0.18, x + hr * 0.62, eyeY);
    eyes.moveTo(x - hr * 0.14, hy + hr * 0.55); eyes.quadraticCurveTo(x, hy + hr * 0.64, x + hr * 0.14, hy + hr * 0.55);
    key(g, F, eyes, 1.5);
    if (F.pass !== "line") { g.save(); g.fillStyle = hexA(T.blush, 0.55); g.fill(ellP(x - hr * 0.6, hy + hr * 0.38, hr * 0.2, hr * 0.12)); g.fill(ellP(x + hr * 0.6, hy + hr * 0.38, hr * 0.2, hr * 0.12)); g.restore(); }
    // Props in front.
    const kind = o.walker ? 6 : style % 6;
    if (kind === 1) {
      const hx = x + 14 * s, hyy = y(52), sw = Math.sin(t * 2.2 + i) * 0.22;
      const ex = hx + 18 * s, ey = hyy - 14 * s;
      key(g, F, lineP([[hx, hyy], [ex, ey]]), 2.2, T.wood);
      g.save(); g.translate(ex, ey); g.rotate(sw);
      key(g, F, lineP([[0, 0], [0, 6 * s]]), 1.2);
      const lp = ellP(0, 14 * s, 6.5 * s, 8.5 * s);
      if (F.pass !== "line" && F.glow) { g.save(); const gl = g.createRadialGradient(0, 14 * s, 0, 0, 14 * s, 26 * s); gl.addColorStop(0, hexA(T.glow, 0.5)); gl.addColorStop(1, hexA(T.glow, 0)); g.fillStyle = gl; g.fillRect(-26 * s, -12 * s, 52 * s, 52 * s); g.restore(); }
      ink(g, F, lp, grad(g, 0, 6 * s, 0, 22 * s, [[0, T.glow], [1, shade(T.glow, -0.2)]]), { lw: 1.8, grain: 0.2 });
      key(g, F, lineP([[-6 * s, 11 * s], [6 * s, 11 * s]]), 1); key(g, F, lineP([[-6 * s, 17 * s], [6 * s, 17 * s]]), 1);
      g.restore();
    } else if (kind === 2) {
      const fx = x + 11 * s, fy = y(58), a = -0.6 + Math.sin(t * 3 + i) * 0.18;
      g.save(); g.translate(fx, fy); g.rotate(a);
      const fp = P(); fp.moveTo(0, 0); fp.arc(0, 0, 14 * s, -Math.PI * 0.85, -Math.PI * 0.15); fp.closePath();
      ink(g, F, fp, o.prop || T.plate, { lw: 2 });
      const fr = P(); for (let k = 1; k < 6; k++) { const aa = -Math.PI * 0.85 + (k / 6) * Math.PI * 0.7; fr.moveTo(0, 0); fr.lineTo(Math.cos(aa) * 14 * s, Math.sin(aa) * 14 * s); }
      key(g, F, fr, 1);
      g.restore();
    } else if (kind === 4) {
      const sy = y(60);
      ink(g, F, rrP(x - 15 * s, sy - 3 * s, 30 * s, 6 * s, 3 * s), T.plate, { lw: 2 });
      ink(g, F, ellP(x - 15 * s, sy, 2.6 * s, 3.4 * s), T.wood, { lw: 1.4 });
      ink(g, F, ellP(x + 15 * s, sy, 2.6 * s, 3.4 * s), T.wood, { lw: 1.4 });
    } else if (kind === 5) {
      const bx = x - 15 * s, by = y(40);
      const bp = P(); bp.moveTo(bx - 8 * s, by); bp.lineTo(bx + 8 * s, by); bp.lineTo(bx + 6 * s, by + 10 * s); bp.lineTo(bx - 6 * s, by + 10 * s); bp.closePath();
      ink(g, F, bp, T.ochre, { lw: 1.8 });
      key(g, F, lineP([[bx - 7 * s, by + 4 * s], [bx + 7 * s, by + 4 * s]]), 1);
      key(g, F, lineP([[bx - 7 * s, by], [bx - 3 * s, by - 9 * s], [bx + 3 * s, by - 9 * s], [bx + 7 * s, by]]), 1.4);
    } else if (kind === 6) {
      const sw = Math.sin(o.step || 0) * 3 * s;
      key(g, F, lineP([[x + 15 * s + sw, y(70)], [x + 18 * s - sw, y(0)]]), 2.6, T.wood);
    }
  }
  // A small dancing crest: a ring of three seeds, used on banners and the seal.
  function crest(g, F, cx, cy, r, color) {
    ink(g, F, ellP(cx, cy, r, r), F.T.plate, { lw: 2.2, grain: 0.3 });
    const p = P();
    for (let k = 0; k < 3; k++) {
      const a = -Math.PI / 2 + (k * TAU) / 3, sx = cx + Math.cos(a) * r * 0.42, sy = cy + Math.sin(a) * r * 0.42;
      p.moveTo(sx + r * 0.28, sy); p.ellipse(sx, sy, r * 0.28, r * 0.28, 0, 0, TAU);
    }
    ink(g, F, p, color, { lw: 1.4, grain: 0.2 });
  }
  // A stamped seal with a carved character; q drives the press (scale settles, ink lands).
  function seal(g, F, cx, cy, size, ch, q, rot = -0.06) {
    if (q <= 0) return;
    const { u } = F, k = back(span(q, 0, 0.7));
    g.save(); g.translate(cx, cy); g.rotate(rot); const sc = 1.35 - 0.35 * k; g.scale(sc, sc);
    g.globalAlpha *= clamp(q * 3);
    const red = F.sealColor;
    const p = rrP(-size / 2, -size / 2, size, size, size * 0.08);
    g.fillStyle = red; g.fill(p);
    g.globalCompositeOperation = "destination-out";
    g.lineWidth = size * 0.05; g.strokeStyle = "#000"; g.strokeRect(-size * 0.38, -size * 0.38, size * 0.76, size * 0.76);
    font(g, size * 0.6, 700, CJK); g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#000";
    g.fillText(ch, 0, size * 0.03);
    g.globalCompositeOperation = "source-over";
    g.restore();
    void u;
  }

  // ---- scene drawings ------------------------------------------------------------------------------
  // Chart: nobori banners on poles. Each pole's height is its value; the cloth flutters all through
  // the hold, the highlighted banner is vermilion, the count rides on a plaque at the top.
  function chart(g, F, a, p, d) {
    const { u, T, t } = F;
    const vals = d.values.map((v) => Number(v) || 0), n = vals.length, max = Math.max(...vals.map(Math.abs), 1e-6);
    const slot = a.w / n, bw = Math.min(slot * 0.42, 190 * u);
    const numSize = Math.max(96 * u, Math.min(112 * u, slot * 0.3));
    const plH = 74 * u, plTop = F.gy - plH;
    const top = a.y + numSize * 1.15 + 34 * u, Hmax = Math.max(80 * u, plTop - top - 24 * u);
    vals.forEach((v, i) => {
      const cx = a.x + slot * (i + 0.5), q0 = i * 0.1;
      const qk = span(p, q0, q0 + 0.28), qc = span(p, q0 + 0.12, q0 + 0.46), rise = ease(span(p, q0 + 0.06, q0 + 0.72));
      const hi = i === d.highlight;
      const b = { x: cx - slot / 2, y: a.y - 10 * u, w: slot, h: F.gy - a.y + 20 * u };
      printIn(g, F, b, qk, qc, () => {
        // Stone plinth carrying the label.
        const lm = plateSize(g, F, d.labels[i], 46 * u, slot * 0.92);
        const pw = Math.max(lm.w, bw + 60 * u);
        const pl = P(); pl.moveTo(cx - pw / 2, F.gy); pl.lineTo(cx - pw / 2 + 8 * u, plTop); pl.lineTo(cx + pw / 2 - 8 * u, plTop); pl.lineTo(cx + pw / 2, F.gy); pl.closePath();
        ink(g, F, pl, grad(g, 0, plTop, 0, F.gy, [[0, shade(T.stone, 0.18)], [1, T.stone]]), { lw: 3 });
        key(g, F, lineP([[cx - pw / 2 + 4 * u, plTop + 10 * u], [cx + pw / 2 - 4 * u, plTop + 10 * u]]), 1.2);
        say(g, F, lm.lay.lines.join(" "), cx, plTop + plH * 0.56, Math.max(42 * u, lm.lay.size), { maxW: pw - 30 * u, min: 42 * u });
        // Pole and cloth.
        const h = Math.max(36 * u, Hmax * (Math.abs(v) / max)) * rise;
        const poleX = cx - bw / 2 - 4 * u, poleTop = plTop - h - 18 * u;
        ink(g, F, rrP(poleX - 5 * u, poleTop, 10 * u, plTop - poleTop, 4 * u), T.wood, { lw: 2.4 });
        ink(g, F, ellP(poleX, poleTop - 4 * u, 8 * u, 8 * u), T.ochre, { lw: 2 });
        const cTop = poleTop + 14 * u, cBot = plTop - 16 * u, ch = cBot - cTop;
        const barP = rrP(poleX - 4 * u, cTop - 8 * u, bw + 26 * u, 8 * u, 3 * u);
        if (ch > 10 * u) {
          const steps = 14, right = [], cloth = P();
          for (let k = 0; k <= steps; k++) {
            const yy = cTop + (ch * k) / steps, f = k / steps;
            right.push([poleX + 6 * u + bw + Math.sin(t * 2.6 + f * 4.2 + i * 1.7) * 7 * u * f + Math.sin(t * 1.1 + i) * 2 * u * f, yy]);
          }
          cloth.moveTo(poleX + 6 * u, cTop);
          right.forEach(([xx, yy]) => cloth.lineTo(xx, yy));
          const tail = Math.sin(t * 2.6 + 4.2 + i * 1.7) * 5 * u;
          cloth.lineTo(poleX + 6 * u + bw * 0.5, cBot + tail * 0.4);
          cloth.lineTo(poleX + 6 * u, cBot);
          cloth.closePath();
          const main = hi ? F.acc : T.indigo, deep = hi ? shade(F.acc, -0.32) : T.deep, lite = hi ? T.rose : T.aqua;
          ink(g, F, cloth, grad(g, 0, cTop, 0, cBot, [[0, deep], [0.42, main], [1, lite]]), { lw: 2.8 });
          // Hem band and folds.
          const folds = P();
          for (let k = 1; k < 3; k++) { const fx = poleX + 6 * u + (bw * k) / 3; folds.moveTo(fx, cTop + 6 * u); folds.lineTo(fx + Math.sin(t * 2.6 + k + i) * 3 * u, cBot - 10 * u); }
          key(g, F, folds, 1, hexA(T.key, 0.45));
          if (ch > 70 * u) key(g, F, lineP([[poleX + 6 * u, cBot - 24 * u], [right[steps - 1][0], cBot - 24 * u]]), 3, T.plate);
          if (ch > bw * 1.05) crest(g, F, poleX + 6 * u + bw / 2 + Math.sin(t * 2.6 + 1.4 + i * 1.7) * 2 * u, cTop + Math.min(bw * 0.56, ch * 0.3), bw * 0.27, main);
          // Ties along the pole.
          const ties = P();
          for (let yy = cTop + 18 * u; yy < cBot - 8 * u; yy += 46 * u) ties.rect(poleX - 7 * u, yy, 14 * u, 7 * u);
          ink(g, F, ties, T.plate, { lw: 1.4, grain: 0 });
        }
        ink(g, F, barP, T.wood, { lw: 2 });
        // Count plaque riding the pole.
        const txt = tally(v, rise, d), tw = measure(g, txt, numSize, 700);
        const pw2 = Math.max(tw + 48 * u, bw + 24 * u), ph = numSize * 1.12, py = poleTop - 12 * u - ph;
        plate(g, F, cx - pw2 / 2, py, pw2, ph, { accent: hi ? F.acc : null });
        say(g, F, txt, cx, py + ph * 0.53, numSize, { weight: 700, color: hi ? shade(F.acc, -0.25) : T.key });
        key(g, F, lineP([[cx - 18 * u, py + ph], [poleX, poleTop - 2 * u], [cx + 18 * u, py + ph]]), 1.4);
      });
    });
  }

  // Object: a laptop or phone printed on a low wooden table, its screen a small editor with a moving
  // playhead and a live miniature landscape; wooden tags on cords name three parts and sway.
  function screenUI(g, F, x, y, w, h, phone, q) {
    const { u, T, t } = F;
    const pvH = h * (phone ? 0.46 : 0.54);
    ink(g, F, rectP(x, y, w, h), T.plate, { lw: 2, grain: 0.25 });
    // Live preview: a miniature landscape print with drifting cloud and boat.
    const px = x + w * 0.05, py = y + h * 0.05, pw = w * 0.9, ph = pvH - h * 0.06;
    ink(g, F, rectP(px, py, pw, ph), grad(g, 0, py, 0, py + ph, [[0, T.paper], [0.55, T.sky], [1, T.waterLite]]), { lw: 2, grain: 0.3 });
    g.save(); g.beginPath(); g.rect(px, py, pw, ph); g.clip();
    ink(g, F, ellP(px + pw * 0.74, py + ph * 0.3, ph * 0.14, ph * 0.14), T.moon, { lw: 1.4 });
    const hill = P(); hill.moveTo(px, py + ph * 0.75);
    for (let k = 0; k <= 20; k++) { const xx = px + (pw * k) / 20; hill.lineTo(xx, py + ph * (0.62 - 0.16 * Math.sin(k * 0.55 + 0.6) - 0.06 * Math.sin(k * 1.4))); }
    hill.lineTo(px + pw, py + ph * 0.8); hill.lineTo(px, py + ph * 0.8); hill.closePath();
    ink(g, F, hill, grad(g, 0, py + ph * 0.4, 0, py + ph * 0.8, [[0, T.sageDeep], [1, T.sage]]), { lw: 1.6 });
    ink(g, F, rectP(px, py + ph * 0.78, pw, ph * 0.22), T.water, { lw: 1.6 });
    const rip = P();
    for (let r = 0; r < 2; r++) { const yy = py + ph * (0.85 + r * 0.07); rip.moveTo(px, yy); for (let xx = 0; xx <= pw; xx += 6 * u) rip.lineTo(px + xx, yy + Math.sin(xx / (5 * u) + t * 3 + r) * 1.4 * u); }
    key(g, F, rip, 1.1, T.foam);
    const bx = px + ((t * 0.08 + 0.2) % 1) * (pw + 60 * u) - 30 * u, by = py + ph * 0.8;
    ink(g, F, polyP([[bx - 18 * u, by - 3 * u], [bx + 18 * u, by - 3 * u], [bx + 12 * u, by + 4 * u], [bx - 12 * u, by + 4 * u]]), T.wood, { lw: 1.4 });
    mistBand(g, F, px + ((t * 0.05) % 1) * pw * 1.6 - pw * 0.5, py + ph * 0.5, pw * 0.5, ph * 0.07, T.mist, { alpha: 0.9 });
    g.restore();
    // Transport strip.
    const ty = py + ph + h * 0.035;
    ink(g, F, polyP([[x + w * 0.47, ty - h * 0.018], [x + w * 0.47, ty + h * 0.018], [x + w * 0.5, ty]]), T.key, { lw: 0 });
    key(g, F, lineP([[x + w * 0.06, ty], [x + w * 0.4, ty]]), 1.2, hexA(T.key, 0.5));
    key(g, F, lineP([[x + w * 0.57, ty], [x + w * 0.94, ty]]), 1.2, hexA(T.key, 0.5));
    // Three tracks.
    const tx = x + w * 0.05, tw = w * 0.9, tTop = ty + h * 0.04, th = (y + h * 0.95 - tTop) / 3;
    const rows = [
      { c: T.indigo, clips: [[0, 0.3], [0.33, 0.62], [0.66, 1]] },
      { c: F.acc, clips: [[0.5, 0.86]], hatch: true },
      { c: T.sage, clips: [[0, 0.46], [0.5, 1]], wave: true },
    ];
    const targets = [];
    rows.forEach((r, k) => {
      const ry = tTop + th * k + th * 0.14, rh = th * 0.72;
      key(g, F, lineP([[tx, ry + rh / 2], [tx + tw, ry + rh / 2]]), 1, hexA(T.key, 0.25));
      r.clips.forEach(([c0, c1], j) => {
        const cxp = tx + tw * c0, cw = tw * (c1 - c0) - 3 * u;
        ink(g, F, rrP(cxp, ry, cw, rh, 3 * u), r.c, { lw: 1.8, grain: 0.4 });
        if (r.hatch) { g.save(); g.beginPath(); g.rect(cxp, ry, cw, rh); g.clip(); const hp = P(); for (let xx = -rh; xx < cw; xx += 9 * u) { hp.moveTo(cxp + xx, ry + rh); hp.lineTo(cxp + xx + rh, ry); } key(g, F, hp, 1.4, hexA(T.plate, 0.5)); g.restore(); }
        if (r.wave) { const wp = P(); for (let xx = 4 * u; xx < cw - 4 * u; xx += 4 * u) { const amp = (0.25 + 0.6 * Math.abs(Math.sin(xx * 0.09 / u + j * 2))) * rh * 0.4; wp.moveTo(cxp + xx, ry + rh / 2 - amp); wp.lineTo(cxp + xx, ry + rh / 2 + amp); } key(g, F, wp, 1.1, hexA(T.key, 0.55)); }
        if (j === (k === 2 ? 0 : 0)) targets[k] = [cxp + cw * (k === 2 ? 0.4 : 0.5), ry + rh / 2];
      });
    });
    targets[0] = [px + pw * 0.3, py + ph * 0.45];
    // Playhead sweeping the tracks.
    const ph2 = ((t * 0.22) % 1), phx = tx + tw * ph2;
    if (q > 0.4) {
      key(g, F, lineP([[phx, tTop - 4 * u], [phx, y + h * 0.95]]), 2, F.acc);
      ink(g, F, polyP([[phx - 6 * u, tTop - 10 * u], [phx + 6 * u, tTop - 10 * u], [phx, tTop - 2 * u]]), F.acc, { lw: 0 });
    }
    return targets;
  }
  function object(g, F, a, p, d) {
    const { u, T, t, tall } = F;
    const phone = d.kind === "phone";
    const tableH = 64 * u, tableTop = F.gy - tableH;
    let dev, scr;
    if (phone) {
      const ph = Math.min(a.h * (tall ? 0.6 : 0.84), (tableTop - a.y) * 0.96), pw = ph * 0.5;
      const cx = a.x + a.w / 2, y0 = tableTop - 16 * u - ph;
      dev = { x: cx - pw / 2, y: y0, w: pw, h: ph };
      scr = { x: dev.x + pw * 0.07, y: dev.y + ph * 0.06, w: pw * 0.86, h: ph * 0.86 };
    } else {
      const avail = tableTop - a.y - 10 * u;
      const sw = Math.min(a.w * (tall ? 0.84 : 0.46), avail / (tall ? 1.15 : 0.74)), sh = sw * 0.6;
      const cx = a.x + a.w / 2, baseY = tableTop - 6 * u, y0 = baseY - sw * 0.07 - sh;
      dev = { x: cx - sw / 2, y: y0, w: sw, h: sh, baseY };
      scr = { x: dev.x + sw * 0.045, y: dev.y + sw * 0.04, w: sw * 0.91, h: sh - sw * 0.07 };
    }
    const tk = span(p, 0, 0.32), tc = span(p, 0.12, 0.5);
    const devB = { x: dev.x - 140 * u, y: dev.y - 20 * u, w: dev.w + 280 * u, h: F.gy - dev.y + 30 * u };
    let targets = null;
    printIn(g, F, devB, tk, tc, () => {
      // Low table with wood grain.
      const tx0 = dev.x - (phone ? 160 : 120) * u, tx1 = dev.x + dev.w + (phone ? 160 : 120) * u;
      ink(g, F, rectP(tx0 + 30 * u, tableTop + 14 * u, 22 * u, tableH - 14 * u), shade(T.wood, -0.15), { lw: 2.4 });
      ink(g, F, rectP(tx1 - 52 * u, tableTop + 14 * u, 22 * u, tableH - 14 * u), shade(T.wood, -0.15), { lw: 2.4 });
      ink(g, F, rectP(tx0, tableTop, tx1 - tx0, 18 * u), grad(g, 0, tableTop, 0, tableTop + 18 * u, [[0, T.woodLite], [1, T.wood]]), { lw: 2.6 });
      const gr = P(); for (let k = 0; k < 3; k++) { gr.moveTo(tx0 + 20 * u, tableTop + 5 * u + k * 4 * u); for (let xx = tx0 + 20 * u; xx < tx1 - 20 * u; xx += 20 * u) gr.lineTo(xx, tableTop + 5 * u + k * 4 * u + Math.sin(xx / (60 * u) + k) * 1.5 * u); }
      key(g, F, gr, 0.9, hexA(T.key, 0.4));
      // A tea bowl steaming at the table's end.
      const bx = phone ? tx1 - 70 * u : tx1 - 80 * u, by = tableTop;
      const bowl = P(); bowl.moveTo(bx - 30 * u, by - 34 * u); bowl.quadraticCurveTo(bx - 28 * u, by, bx, by); bowl.quadraticCurveTo(bx + 28 * u, by, bx + 30 * u, by - 34 * u); bowl.closePath();
      ink(g, F, bowl, grad(g, 0, by - 34 * u, 0, by, [[0, T.indigo], [1, T.deep]]), { lw: 2.4 });
      key(g, F, lineP([[bx - 30 * u, by - 26 * u], [bx + 30 * u, by - 26 * u]]), 2, T.plate);
      const steam = P();
      for (let k = 0; k < 2; k++) { const sx = bx - 8 * u + k * 16 * u; steam.moveTo(sx, by - 40 * u); for (let yy = 0; yy < 70 * u; yy += 4 * u) steam.lineTo(sx + Math.sin(yy / (12 * u) - t * 2.4 + k * 2) * 6 * u, by - 40 * u - yy); }
      key(g, F, steam, 1.6, hexA(T.key, 0.45));
      if (phone) {
        const stand = polyP([[dev.x - 14 * u, tableTop], [dev.x + dev.w + 14 * u, tableTop], [dev.x + dev.w + 4 * u, tableTop - 22 * u], [dev.x - 4 * u, tableTop - 22 * u]]);
        ink(g, F, stand, T.woodLite, { lw: 2.4 });
        ink(g, F, rrP(dev.x, dev.y, dev.w, dev.h, dev.w * 0.12), grad(g, dev.x, 0, dev.x + dev.w, 0, [[0, T.deep], [1, shade(T.deep, 0.2)]]), { lw: 3 });
        ink(g, F, rrP(dev.x + dev.w * 0.38, dev.y + dev.h * 0.022, dev.w * 0.24, dev.h * 0.016, 4 * u), T.key, { lw: 0 });
      } else {
        const sw = dev.w;
        const base = polyP([[dev.x - sw * 0.08, dev.baseY], [dev.x + sw * 1.08, dev.baseY], [dev.x + sw, dev.baseY - sw * 0.07], [dev.x, dev.baseY - sw * 0.07]]);
        ink(g, F, base, grad(g, 0, dev.baseY - sw * 0.07, 0, dev.baseY, [[0, shade(T.stone, 0.25)], [1, T.stone]]), { lw: 2.8 });
        const keys = P(); for (let k = 1; k < 3; k++) { const yy = dev.baseY - sw * 0.07 * (k / 3); keys.moveTo(dev.x + sw * 0.04 * (1 - k / 3), yy); keys.lineTo(dev.x + sw - sw * 0.04 * (1 - k / 3), yy); }
        key(g, F, keys, 1, hexA(T.key, 0.5));
        ink(g, F, rrP(dev.x, dev.y, sw, dev.h, 12 * u), grad(g, 0, dev.y, 0, dev.y + dev.h, [[0, T.deep], [1, shade(T.deep, 0.18)]]), { lw: 3 });
      }
      targets = screenUI(g, F, scr.x, scr.y, scr.w, scr.h, phone, tc);
    });
    if (!targets) return;
    // Tags on cords.
    const size = 46 * u;
    const ms = d.callouts.map((c) => plateSize(g, F, c, size, tall ? a.w * 0.62 : Math.max(260 * u, (a.w - dev.w) / 2 - 60 * u)));
    let spots;
    if (tall) {
      const y0 = a.y + 10 * u;
      spots = [[a.x + ms[0].w / 2, y0 + ms[0].h / 2], [a.x + a.w - ms[1].w / 2, y0 + ms[0].h + 26 * u + ms[1].h / 2], [a.x + ms[2].w / 2, y0 + ms[0].h + ms[1].h + 52 * u + ms[2].h / 2]];
      const room = dev.y - 30 * u - (spots[2][1] + ms[2].h / 2);
      if (room < 0) spots = spots.map(([x, y]) => [x, y + room]);
    } else {
      const lx = Math.max(a.x + Math.max(ms[0].w, ms[2].w) / 2, dev.x - 70 * u - Math.max(ms[0].w, ms[2].w) / 2);
      const rx = Math.min(a.x + a.w - ms[1].w / 2, dev.x + dev.w + 70 * u + ms[1].w / 2);
      spots = [[lx, dev.y + dev.h * 0.12 + ms[0].h / 2], [rx, dev.y + dev.h * 0.5], [lx, Math.max(dev.y + dev.h * 0.12 + ms[0].h + 40 * u + ms[2].h / 2, dev.y + dev.h * 0.88)]];
    }
    const order = [0, 1, 2];
    order.forEach((k) => {
      const q0 = 0.32 + k * 0.12, qk = span(p, q0, q0 + 0.22), qc = span(p, q0 + 0.08, q0 + 0.32);
      const [sx, sy0] = spots[k], sy = sy0 + Math.sin(t * 1.6 + k * 2.1) * 3 * u, m = ms[k];
      const [tx, ty] = targets[k];
      const b = { x: Math.min(sx - m.w / 2, tx) - 10 * u, y: Math.min(sy - m.h / 2, ty) - 20 * u, w: Math.abs(tx - sx) + m.w / 2 + 40 * u + m.w / 2, h: Math.abs(ty - sy) + m.h + 40 * u };
      printIn(g, F, b, qk, qc, () => {
        const cord = P(), sag = 26 * u + Math.sin(t * 1.6 + k * 2.1) * 4 * u;
        if (tall) {
          const ex = clamp(tx, sx - m.w / 2 + 24 * u, sx + m.w / 2 - 24 * u), ey = sy + m.h / 2;
          cord.moveTo(ex, ey); cord.quadraticCurveTo(ex + Math.sin(t * 1.6 + k) * 10 * u, (ey + ty) / 2, tx, ty);
        } else {
          const ex = tx > sx ? sx + m.w / 2 : sx - m.w / 2, midX = (ex + tx) / 2;
          cord.moveTo(ex, sy); cord.quadraticCurveTo(midX, Math.max(sy, ty) + sag, tx, ty);
        }
        key(g, F, cord, 2.4, T.key);
        ink(g, F, ellP(tx, ty, 7 * u, 7 * u), F.acc, { lw: 2 });
        // A small tassel under the tag.
        const tas = P(); for (let j = -2; j <= 2; j++) { tas.moveTo(sx + j * 3 * u, sy + m.h / 2); tas.lineTo(sx + j * 4 * u + Math.sin(t * 2 + k) * 4 * u, sy + m.h / 2 + 26 * u); }
        key(g, F, tas, 1.6, k === 1 ? F.acc : T.indigo);
        labelPlate(g, F, d.callouts[k], sx, sy, size, 0, { m, accent: k === 1 ? F.acc : null });
      });
    });
  }

  // People: a row of figures before a garden fence, each in their own robe pattern and carrying
  // something; three wear name plaques on cords. Everyone breathes and their props move.
  function people(g, F, a, p, d) {
    const { u, T, t, tall } = F;
    const n = clamp(Math.round(Number(d.count) || 4), 1, 6);
    const twoRows = tall && n > 3;
    const front = twoRows ? 3 : n, backN = n - front;
    const spacing = a.w / front;
    const plateRoom = 150 * u;
    const fh = Math.min((F.gy - a.y - plateRoom) / (twoRows ? 1.42 : 1.02), spacing * 2.3);
    const fenceY = F.gy - fh * 0.42;
    // Fence behind.
    const fk = span(p, 0, 0.25), fc = span(p, 0.1, 0.4);
    printIn(g, F, { x: a.x - 60 * u, y: fenceY - fh * 0.4, w: a.w + 120 * u, h: fh }, fk, fc, () => {
      const posts = P(), x0 = a.x - 40 * u, x1 = a.x + a.w + 40 * u;
      for (let x = x0; x <= x1; x += Math.max(70 * u, spacing / 2)) posts.rect(x - 7 * u, fenceY - fh * 0.12, 14 * u, fh * 0.12 + (F.gy - fenceY) * 0.55);
      ink(g, F, posts, T.wood, { lw: 2.2 });
      ink(g, F, rectP(x0, fenceY - fh * 0.08, x1 - x0, 10 * u), T.woodLite, { lw: 2.2 });
      ink(g, F, rectP(x0, fenceY + fh * 0.08, x1 - x0, 10 * u), T.woodLite, { lw: 2.2 });
      // Shrubs behind the fence.
      const sh = P();
      for (let x = x0; x < x1; x += 120 * u) { const r = (40 + 22 * hash(x / u)) * u; sh.moveTo(x + r, fenceY - fh * 0.08); sh.arc(x, fenceY - fh * 0.08, r, Math.PI, TAU); }
      ink(g, F, sh, grad(g, 0, fenceY - fh * 0.3, 0, fenceY, [[0, T.sageDeep], [1, T.sage]]), { lw: 2, grain: 0.8 });
    });
    const spots = [];
    for (let i = 0; i < n; i++) {
      // In a tall frame with two rows, the three named people stand on the raised back row.
      if (!twoRows) spots.push({ i, x: a.x + spacing * (i + 0.5), feet: F.gy - 4 * u, h: fh });
      else if (i < 3) spots.push({ i, x: a.x + spacing * (i + 0.5) - spacing * 0.18, feet: F.gy - fh * 0.42, h: fh * 0.9, back: true });
      else { const j = i - 3, sp = a.w / backN; spots.push({ i, x: a.x + sp * (j + 0.5) + spacing * 0.12, feet: F.gy - 4 * u, h: fh }); }
    }
    const drawOrder = spots.slice().sort((A, B) => (A.back === B.back ? 0 : A.back ? -1 : 1));
    drawOrder.forEach((s) => {
      const q0 = 0.08 + s.i * 0.07, qk = span(p, q0, q0 + 0.28), qc = span(p, q0 + 0.1, q0 + 0.42);
      const hi = s.i === d.highlight;
      const b = { x: s.x - s.h * 0.4, y: s.feet - s.h * 1.15, w: s.h * 0.8, h: s.h * 1.2 };
      printIn(g, F, b, qk, qc, () => person(g, F, s.x, s.feet, s.h, (twoRows ? [2, 1, 4, 3, 5, 1] : [2, 1, 4, 0, 5, 3])[s.i % 6], { robe: hi ? F.acc : null, seed: s.i * 1.7, pattern: s.i }));
    });
    // Name plaques for the first three, staggered if neighbours would touch.
    const size = 46 * u, labelled = spots.slice(0, Math.min(3, n));
    const ms = labelled.map((s, k) => plateSize(g, F, d.badges[k], size, Math.max(spacing * 1.7, 300 * u)));
    let lift = labelled.map(() => 0);
    for (let k = 1; k < labelled.length; k++) if (labelled[k].x - labelled[k - 1].x < (ms[k].w + ms[k - 1].w) / 2 + 16 * u && lift[k - 1] === 0) lift[k] = 1;
    labelled.forEach((s, k) => {
      const m = ms[k], headTop = s.feet - s.h * 1.02;
      const cy = Math.max(a.y + m.h / 2, headTop - 36 * u - m.h / 2 - lift[k] * (m.h + 18 * u)) + Math.sin(t * 1.5 + k * 1.9) * 2.5 * u;
      const cx = clamp(s.x, a.x + m.w / 2 - 40 * u, a.x + a.w - m.w / 2 + 40 * u);
      const q0 = 0.3 + k * 0.1, qk = span(p, q0, q0 + 0.22), qc = span(p, q0 + 0.08, q0 + 0.3);
      printIn(g, F, { x: cx - m.w / 2 - 10 * u, y: cy - m.h / 2 - 10 * u, w: m.w + 20 * u, h: headTop - cy + m.h }, qk, qc, () => {
        key(g, F, lineP([[cx, cy + m.h / 2], [s.x, headTop - 8 * u]]), 1.6, hexA(T.key, 0.7));
        labelPlate(g, F, d.badges[k], cx, cy, size, 0, { m, accent: k === d.highlight ? F.acc : null });
      });
    });
  }

  // Process: three buildings along a stepping-stone path — a thatched hut, a tiled workshop and a
  // vermilion pavilion — with a traveller in a straw hat walking from one to the next.
  function building(g, F, kind, cx, base, bs, lit) {
    const { u, T, t } = F;
    if (kind === 0) {
      ink(g, F, rectP(cx - bs * 0.34, base - bs * 0.36, bs * 0.68, bs * 0.36), grad(g, 0, base - bs * 0.36, 0, base, [[0, T.plate], [1, shade(T.plate, -0.1)]]), { lw: 2.6 });
      ink(g, F, rectP(cx - bs * 0.08, base - bs * 0.24, bs * 0.16, bs * 0.24), T.wood, { lw: 2 });
      const roof = P(); roof.moveTo(cx - bs * 0.48, base - bs * 0.32); roof.quadraticCurveTo(cx - bs * 0.3, base - bs * 0.86, cx, base - bs * 0.9); roof.quadraticCurveTo(cx + bs * 0.3, base - bs * 0.86, cx + bs * 0.48, base - bs * 0.32); roof.closePath();
      ink(g, F, roof, grad(g, 0, base - bs * 0.9, 0, base - bs * 0.3, [[0, shade(T.ochre, -0.25)], [1, T.ochre]]), { lw: 2.8 });
      const straw = P(); for (let k = -5; k <= 5; k++) { straw.moveTo(cx + k * bs * 0.03, base - bs * 0.84); straw.lineTo(cx + k * bs * 0.085, base - bs * 0.36); }
      key(g, F, straw, 1, hexA(T.key, 0.5));
    } else if (kind === 1) {
      ink(g, F, rectP(cx - bs * 0.4, base - bs * 0.42, bs * 0.8, bs * 0.42), T.plate, { lw: 2.6 });
      const lat = P(); for (let k = 1; k < 6; k++) { lat.moveTo(cx - bs * 0.4 + (bs * 0.8 * k) / 6, base - bs * 0.42); lat.lineTo(cx - bs * 0.4 + (bs * 0.8 * k) / 6, base); }
      lat.moveTo(cx - bs * 0.4, base - bs * 0.22); lat.lineTo(cx + bs * 0.4, base - bs * 0.22);
      key(g, F, lat, 1.3);
      const roof = P(); roof.moveTo(cx - bs * 0.6, base - bs * 0.38); roof.quadraticCurveTo(cx - bs * 0.46, base - bs * 0.46, cx - bs * 0.3, base - bs * 0.72); roof.lineTo(cx + bs * 0.3, base - bs * 0.72); roof.quadraticCurveTo(cx + bs * 0.46, base - bs * 0.46, cx + bs * 0.6, base - bs * 0.38); roof.closePath();
      ink(g, F, roof, grad(g, 0, base - bs * 0.72, 0, base - bs * 0.38, [[0, T.deep], [1, T.indigo]]), { lw: 2.8 });
      const tiles = P(); for (let k = -6; k <= 6; k++) { tiles.moveTo(cx + k * bs * 0.045, base - bs * 0.7); tiles.lineTo(cx + k * bs * 0.085, base - bs * 0.42); }
      key(g, F, tiles, 1, hexA(T.plate, 0.45));
      // Smoke from a vent.
      const sm = P(); sm.moveTo(cx + bs * 0.18, base - bs * 0.74);
      for (let k = 0; k < 24; k++) sm.lineTo(cx + bs * 0.18 + Math.sin(k * 0.45 - t * 2.2) * bs * 0.04 + k * bs * 0.006, base - bs * 0.74 - k * bs * 0.016);
      key(g, F, sm, 1.6, hexA(T.key, 0.4));
    } else {
      ink(g, F, rectP(cx - bs * 0.46, base - bs * 0.08, bs * 0.92, bs * 0.08), T.stone, { lw: 2.4 });
      const pil = P(); for (const k of [-0.34, -0.12, 0.12, 0.34]) pil.rect(cx + k * bs - bs * 0.025, base - bs * 0.44, bs * 0.05, bs * 0.36);
      ink(g, F, pil, F.acc, { lw: 2 });
      ink(g, F, rectP(cx - bs * 0.4, base - bs * 0.47, bs * 0.8, bs * 0.05), shade(F.acc, -0.2), { lw: 2 });
      for (const [w, y0, hgt] of [[0.62, 0.45, 0.16], [0.42, 0.66, 0.14]]) {
        const roof = P(); roof.moveTo(cx - bs * w, base - bs * y0); roof.quadraticCurveTo(cx - bs * w * 0.75, base - bs * (y0 + hgt * 0.3), cx - bs * w * 0.5, base - bs * (y0 + hgt)); roof.lineTo(cx + bs * w * 0.5, base - bs * (y0 + hgt)); roof.quadraticCurveTo(cx + bs * w * 0.75, base - bs * (y0 + hgt * 0.3), cx + bs * w, base - bs * y0); roof.closePath();
        ink(g, F, roof, grad(g, 0, base - bs * (y0 + hgt), 0, base - bs * y0, [[0, T.deep], [1, T.indigo]]), { lw: 2.6 });
      }
      key(g, F, lineP([[cx, base - bs * 0.8], [cx, base - bs * 1.02]]), 2.4, T.wood);
      const fl = P(); fl.moveTo(cx, base - bs * 1.02);
      for (let k = 0; k <= 8; k++) fl.lineTo(cx + k * bs * 0.025, base - bs * 1.02 + Math.sin(t * 4 + k * 0.7) * bs * 0.012 * (k / 8));
      for (let k = 8; k >= 0; k--) fl.lineTo(cx + k * bs * 0.025, base - bs * 0.95 + Math.sin(t * 4 + k * 0.7) * bs * 0.012 * (k / 8));
      fl.closePath();
      ink(g, F, fl, F.acc, { lw: 1.6 });
    }
    // A hanging lantern that lights when the traveller arrives.
    const lx = cx + bs * (kind === 0 ? 0.26 : 0.36), ly = base - bs * (kind === 0 ? 0.3 : 0.38), sw = Math.sin(t * 2 + kind) * 0.12;
    g.save(); g.translate(lx, ly); g.rotate(sw);
    key(g, F, lineP([[0, 0], [0, bs * 0.05]]), 1.2);
    if (lit > 0 && F.pass !== "line") { const gl = g.createRadialGradient(0, bs * 0.1, 0, 0, bs * 0.1, bs * 0.22); gl.addColorStop(0, hexA(T.glow, 0.6 * lit)); gl.addColorStop(1, hexA(T.glow, 0)); g.fillStyle = gl; g.fillRect(-bs * 0.22, -bs * 0.12, bs * 0.44, bs * 0.44); }
    ink(g, F, ellP(0, bs * 0.1, bs * 0.045, bs * 0.06), lit > 0.5 ? T.glow : T.plate, { lw: 1.6, grain: 0.2 });
    g.restore();
    void u;
  }
  function process(g, F, a, p, d, local, hold) {
    const { u, T, t, tall } = F;
    let st;
    const bs = tall ? Math.min(a.w * 0.4, a.h * 0.25) : Math.min(a.w * 0.23, a.h * 0.56);
    if (tall) st = [[a.x + a.w * 0.26, a.y + a.h * 0.3], [a.x + a.w * 0.74, a.y + a.h * 0.62], [a.x + a.w * 0.26, F.gy - 6 * u]];
    else st = [0, 1, 2].map((k) => [a.x + a.w * (0.17 + 0.33 * k), a.y + a.h * 0.68]);
    // The path: stepping stones curving between doorsteps.
    const pts = [];
    for (let k = 0; k < 2; k++) {
      const [x0, y0] = st[k], [x1, y1] = st[k + 1];
      const mx = (x0 + x1) / 2, my = Math.max(y0, y1) + (tall ? 0 : 40 * u);
      for (let j = 0; j <= 30; j++) { const s = j / 30; const x = (1 - s) * (1 - s) * x0 + 2 * s * (1 - s) * mx + s * s * x1, y = (1 - s) * (1 - s) * y0 + 2 * s * (1 - s) * (tall ? (y0 + y1) / 2 + 30 * u : my) + s * s * y1; if (j || !k) pts.push([x, y + 8 * u]); }
    }
    const pk = span(p, 0.15, 0.6);
    const nStones = Math.floor(pts.length * pk);
    const stones = P();
    for (let j = 1; j < nStones; j += 3) { const [x, y] = pts[j]; stones.moveTo(x + 14 * u, y); stones.ellipse(x, y, 14 * u, 6 * u, 0, 0, TAU); }
    if (nStones > 1) { F.pass = "both"; ink(g, F, stones, T.stone, { lw: 1.6, grain: 0.4 }); }
    // The traveller's schedule.
    const T1 = 0.16 * hold, A1 = 0.42 * hold, T2 = 0.5 * hold, A2 = 0.74 * hold;
    let sPos = 0;
    if (local > A2) sPos = 2; else if (local > T2) sPos = 1 + inout((local - T2) / (A2 - T2)); else if (local > A1) sPos = 1; else if (local > T1) sPos = inout((local - T1) / (A1 - T1));
    const lit = [1, clamp((local - A1) / 0.3), clamp((local - A2) / 0.3)];
    const size = 46 * u;
    st.forEach(([cx, base], k) => {
      const q0 = k * 0.12, qk = span(p, q0, q0 + 0.3), qc = span(p, q0 + 0.12, q0 + 0.45);
      const maxW = tall ? a.w * 0.48 : a.w * 0.3;
      const m = plateSize(g, F, d.steps[k], size, maxW);
      const lx = tall ? (k === 1 ? a.x + m.w / 2 : a.x + a.w - m.w / 2) : cx, ly = tall ? base - bs * 0.45 : base + 34 * u + m.h / 2;
      const b = { x: Math.min(cx - bs * 0.65, lx - m.w / 2) - 10 * u, y: base - bs * 1.1, w: Math.max(bs * 1.3, Math.abs(lx - cx) + m.w / 2 + bs * 0.65) + 20 * u, h: bs * 1.1 + (tall ? 20 * u : m.h + 60 * u) };
      printIn(g, F, b, qk, qc, () => {
        building(g, F, k, cx, base, bs, lit[k]);
        labelPlate(g, F, d.steps[k], lx, ly, size, 0, { m, accent: lit[k] > 0.5 ? F.acc : null });
        // Step number in a round seal-like badge.
        const nx = cx - bs * 0.5, ny = base - bs * 0.86, r = 34 * u;
        ink(g, F, ellP(nx, ny, r, r), lit[k] > 0.5 ? F.acc : T.plate, { lw: 2.6, grain: 0.4 });
        say(g, F, String(k + 1), nx, ny + 2 * u, 46 * u, { weight: 700, color: lit[k] > 0.5 ? T.plate : T.key });
      });
    });
    // The traveller.
    if (p > 0.2) {
      const fi = clamp(sPos / 2) * (pts.length - 1), j = Math.floor(fi), f = fi - j;
      const A = pts[Math.min(j, pts.length - 1)], B = pts[Math.min(j + 1, pts.length - 1)];
      const x = lerp(A[0], B[0], f), y = lerp(A[1], B[1], f);
      const walking = Math.abs(sPos - Math.round(sPos)) > 0.01;
      const step = t * 9;
      const fhW = bs * 0.62;
      F.pass = "both";
      const k = span(p, 0.2, 0.4);
      g.save(); g.globalAlpha *= k;
      person(g, F, x, y - (walking ? Math.abs(Math.sin(step)) * 3 * u : 0), fhW, 5, { walker: true, robe: T.sage, obi: T.ochre, step: walking ? step : t * 1.5, seed: 9 });
      g.restore();
    }
  }

  // Compare: two pagodas built tier by tier, height for value. Bells at the eaves and a banner on
  // each spire move in the wind; a cloud-scroll arrow leads from the first to the second.
  function pagoda(g, F, cx, base, w, height, tiersFull, rise, color, i, num, label, d, hi) {
    const { u, T, t } = F;
    const tiers = Math.max(1, tiersFull), th = height / tiers;
    const shown = rise * tiers;
    for (let j = 0; j < tiers; j++) {
      const k = clamp(shown - j);
      if (k <= 0) break;
      const drop = (1 - back(k)) * 40 * u;
      const wj = w * (1 - (0.32 * j) / Math.max(1, tiers - 1 || 1)), y1 = base - th * j - drop, y0 = y1 - th;
      g.save(); g.globalAlpha *= clamp(k * 3);
      ink(g, F, rectP(cx - wj * 0.3, y0 + th * 0.36, wj * 0.6, th * 0.64), T.plate, { lw: 2.4, grain: 0.4 });
      const lat = P(); for (let m = 1; m < 4; m++) { lat.moveTo(cx - wj * 0.3 + (wj * 0.6 * m) / 4, y0 + th * 0.42); lat.lineTo(cx - wj * 0.3 + (wj * 0.6 * m) / 4, y1); }
      key(g, F, lat, 1.1);
      const ry = y0 + th * 0.42, roof = P();
      roof.moveTo(cx - wj * 0.5, ry - th * 0.06); roof.quadraticCurveTo(cx - wj * 0.38, ry - th * 0.02, cx - wj * 0.28, ry - th * 0.36);
      roof.lineTo(cx + wj * 0.28, ry - th * 0.36); roof.quadraticCurveTo(cx + wj * 0.38, ry - th * 0.02, cx + wj * 0.5, ry - th * 0.06);
      roof.lineTo(cx + wj * 0.44, ry + th * 0.04); roof.lineTo(cx - wj * 0.44, ry + th * 0.04); roof.closePath();
      ink(g, F, rectP(cx - wj * 0.4, ry + th * 0.04, wj * 0.8, th * 0.05), T.deep, { lw: 1.6, grain: 0 });
      ink(g, F, roof, grad(g, 0, ry - th * 0.36, 0, ry + th * 0.04, [[0, shade(color, -0.3)], [1, color]]), { lw: 2.6 });
      const tl = P(); for (let m = -7; m <= 7; m++) { tl.moveTo(cx + m * wj * 0.036, ry - th * 0.34); tl.lineTo(cx + m * wj * 0.058, ry + th * 0.02); }
      key(g, F, tl, 1, hexA(T.plate, 0.4));
      // Balcony rail under the eave.
      if (j > 0) { const rl = P(); rl.moveTo(cx - wj * 0.36, y1 - th * 0.02); rl.lineTo(cx + wj * 0.36, y1 - th * 0.02); for (let m = 0; m <= 8; m++) { const xx = cx - wj * 0.36 + (wj * 0.72 * m) / 8; rl.moveTo(xx, y1 - th * 0.02); rl.lineTo(xx, y1 + th * 0.06); } key(g, F, rl, 1.8, T.wood); }
      // Bells at the eave tips.
      for (const s of [-1, 1]) {
        const bx = cx + s * wj * 0.5, by = ry - th * 0.06, a = Math.sin(t * 2.6 + j + s + i * 2) * 0.3;
        g.save(); g.translate(bx, by); g.rotate(a);
        key(g, F, lineP([[0, 0], [0, 10 * u]]), 1.2);
        ink(g, F, ellP(0, 15 * u, 5 * u, 6 * u), T.ochre, { lw: 1.4, grain: 0 });
        g.restore();
      }
      g.restore();
    }
    const topY = base - height * clamp(rise) - 0;
    if (rise > 0.05) {
      // Spire with rings and a banner.
      const sp = 60 * u;
      key(g, F, lineP([[cx, topY + th * 0.06], [cx, topY - sp]]), 3, T.wood);
      const rings = P(); for (let m = 0; m < 4; m++) { rings.moveTo(cx - 10 * u, topY - 12 * u - m * 9 * u); rings.lineTo(cx + 10 * u, topY - 12 * u - m * 9 * u); }
      key(g, F, rings, 2.2);
      const fl = P(); fl.moveTo(cx, topY - sp);
      for (let k = 0; k <= 10; k++) fl.lineTo(cx + k * 6 * u, topY - sp + Math.sin(t * 4 + k * 0.6 + i) * 3 * u * (k / 10));
      for (let k = 10; k >= 0; k--) fl.lineTo(cx + k * 6 * u, topY - sp + 14 * u + Math.sin(t * 4 + k * 0.6 + i) * 3 * u * (k / 10));
      fl.closePath();
      ink(g, F, fl, hi ? F.acc : T.indigo, { lw: 1.6 });
      // Count plaque.
      const numSize = Math.max(96 * u, Math.min(116 * u, w * 0.34));
      const txt = tally(num, ease(rise), d), tw = measure(g, txt, numSize, 700);
      const pw = tw + 56 * u, ph = numSize * 1.12, py = topY - sp - 24 * u - ph;
      plate(g, F, cx - pw / 2, py, pw, ph, { accent: hi ? F.acc : null });
      say(g, F, txt, cx, py + ph * 0.53, numSize, { weight: 700, color: hi ? shade(F.acc, -0.25) : T.key });
    }
    void label;
  }
  // A garden pine: a leaning trunk with flat cloud-pads of needles that rock in the wind.
  function pine(g, F, x, base, h, dir, seed) {
    const { u, T, t } = F;
    const sway = (k) => Math.sin(t * 1.1 + seed + k * 0.8) * h * 0.012 * (1 + k);
    const lean = dir * h * 0.22;
    const trunk = P();
    trunk.moveTo(x - h * 0.035, base);
    trunk.bezierCurveTo(x - h * 0.02 + lean * 0.2, base - h * 0.4, x + lean * 0.9, base - h * 0.62, x + lean + sway(3), base - h * 0.92);
    trunk.lineTo(x + lean + sway(3) + h * 0.03, base - h * 0.9);
    trunk.bezierCurveTo(x + lean * 0.9 + h * 0.04, base - h * 0.6, x + h * 0.03 + lean * 0.2, base - h * 0.38, x + h * 0.04, base);
    trunk.closePath();
    ink(g, F, trunk, grad(g, x - h * 0.05, 0, x + h * 0.05, 0, [[0, shade(T.wood, -0.2)], [1, T.woodLite]]), { lw: 2.4 });
    const bark = P();
    for (let k = 1; k < 7; k++) { const yy = base - h * 0.12 * k, xx = x + lean * Math.pow(k / 7.5, 1.4); bark.moveTo(xx - h * 0.02, yy); bark.quadraticCurveTo(xx, yy - h * 0.012, xx + h * 0.022, yy); }
    key(g, F, bark, 1.1, hexA(T.key, 0.55));
    const pads = [[0.92, 0, 0.2], [0.7, -0.62, 0.17], [0.62, 0.55, 0.15], [0.45, -0.95, 0.13], [0.82, 0.62, 0.14]];
    pads.forEach(([fy, fx, r], k) => {
      const cx = x + lean * Math.pow(fy, 1.2) + fx * dir * h * 0.3 + sway(k), cy = base - h * fy;
      if (k) key(g, F, lineP([[x + lean * Math.pow(fy, 1.4), cy + h * 0.03], [cx, cy + h * 0.02]]), 3, T.wood);
      const pad = P(), rw = h * r, rh = h * r * 0.36;
      pad.moveTo(cx - rw, cy + rh * 0.5);
      for (let j = 0; j <= 6; j++) { const sx = cx - rw + (rw * 2 * j) / 6; pad.quadraticCurveTo(sx - rw / 6, cy - rh * (0.9 + 0.3 * Math.sin(j * 1.7 + k)), sx, cy - rh * 0.2); }
      pad.lineTo(cx + rw, cy + rh * 0.5); pad.quadraticCurveTo(cx, cy + rh * 1.1, cx - rw, cy + rh * 0.5); pad.closePath();
      ink(g, F, pad, grad(g, 0, cy - rh, 0, cy + rh * 0.5, [[0, T.sageDeep], [1, shade(T.sageDeep, -0.25)]]), { lw: 2.2, grain: 0.7 });
      const nd = P();
      for (let j = -4; j <= 4; j++) { nd.moveTo(cx + j * rw * 0.2, cy + rh * 0.3); nd.lineTo(cx + j * rw * 0.22 + rh * 0.2, cy - rh * 0.4); }
      key(g, F, nd, 1, hexA(T.plate, 0.35));
    });
    void u;
  }
  // Carp streamers on a tall pole: they fill with wind and swim in place all through the hold.
  function streamers(g, F, x, top, base, len, q) {
    const { u, T, t } = F;
    key(g, F, lineP([[x, base], [x, top]]), 5, T.wood);
    ink(g, F, ellP(x, top - 6 * u, 9 * u, 9 * u), T.ochre, { lw: 2 });
    const wheel = P(); for (let k = 0; k < 6; k++) { const an = t * 3 + (k * TAU) / 6; wheel.moveTo(x, top + 14 * u); wheel.lineTo(x + Math.cos(an) * 16 * u, top + 14 * u + Math.sin(an) * 5 * u); }
    key(g, F, wheel, 2, T.key);
    const cols = [[T.deep, T.indigo], [shade(F.acc, -0.2), F.acc], [shade(T.ochre, -0.2), T.ochre]];
    for (let i = 0; i < 3; i++) {
      const L = len * (1 - i * 0.16) * ease(span(q, i * 0.15, i * 0.15 + 0.5));
      if (L < 10 * u) continue;
      const y0 = top + 34 * u + i * len * 0.3, r = len * (0.13 - i * 0.012), steps = 16;
      const up = [], dn = [];
      for (let k = 0; k <= steps; k++) {
        const f = k / steps, w = Math.sin(t * 3.2 - f * 5 + i * 1.4) * r * 0.55 * f + Math.sin(t * 1.3 + i) * r * 0.3 * f;
        const half = r * (k === 0 ? 0.85 : 1 - 0.35 * f) * (0.82 + 0.18 * Math.sin(t * 2.4 + i - f * 3));
        up.push([x + 6 * u + L * f, y0 + w - half]); dn.push([x + 6 * u + L * f, y0 + w + half]);
      }
      const tailA = up[steps], tailB = dn[steps], mid = [(tailA[0] + tailB[0]) / 2 - r * 0.5, (tailA[1] + tailB[1]) / 2];
      const body = polyP([...up, [tailA[0] + r * 0.4, tailA[1] - r * 0.25], mid, [tailB[0] + r * 0.4, tailB[1] + r * 0.25], ...dn.slice().reverse()]);
      const [c0, c1] = cols[i];
      ink(g, F, body, grad(g, 0, y0 - r, 0, y0 + r, [[0, c0], [0.6, c1], [1, shade(c1, 0.35)]]), { lw: 2.4 });
      // Scales, gill line and eye.
      const sc = P();
      for (let k = 4; k < steps - 2; k += 2) { const [ux, uy] = up[k], [, dy] = dn[k]; sc.moveTo(ux, uy + (dy - uy) * 0.25); sc.quadraticCurveTo(ux + r * 0.35, (uy + dy) / 2, ux, dy - (dy - uy) * 0.25); }
      key(g, F, sc, 1.2, hexA(T.plate, 0.55));
      const [gx, gy0] = up[2], [, gy1] = dn[2];
      key(g, F, lineP([[gx, gy0 + 2 * u], [gx + r * 0.2, (gy0 + gy1) / 2], [gx, gy1 - 2 * u]]), 1.8, T.plate);
      ink(g, F, ellP(up[1][0] + r * 0.15, (up[1][1] + dn[1][1]) / 2 - r * 0.15, r * 0.2, r * 0.2), T.plate, { lw: 1.6, grain: 0 });
      ink(g, F, ellP(up[1][0] + r * 0.15, (up[1][1] + dn[1][1]) / 2 - r * 0.15, r * 0.08, r * 0.08), T.key, { lw: 0, grain: 0 });
    }
  }
  function compare(g, F, a, p, d) {
    const { u, T, t } = F;
    const L = Math.abs(Number(d.leftValue) || 0), R = Math.abs(Number(d.rightValue) || 0), max = Math.max(L, R, 1e-6);
    const xs = [a.x + a.w * 0.27, a.x + a.w * 0.73];
    const w = Math.min(a.w * 0.34, 470 * u);
    // The garden around the towers: pines at both ends and carp streamers on a pole between them.
    const gk = span(p, 0, 0.3), gc = span(p, 0.1, 0.45);
    const ph = Math.min(a.h * 0.95, F.gy - a.y);
    printIn(g, F, { x: a.x - 160 * u, y: F.gy - ph - 20 * u, w: a.w + 320 * u, h: ph + 30 * u }, gk, gc, () => {
      pine(g, F, a.x - 70 * u, F.gy, ph * (F.tall ? 0.55 : 0.78), 1, 0.3);
      pine(g, F, a.x + a.w + 70 * u, F.gy, ph * (F.tall ? 0.5 : 0.66), -1, 2.1);
    });
    const poleX = xs[1] + w * 0.32, poleTop = a.y + 10 * u;
    const sLen = Math.min(a.x + a.w - poleX - 40 * u, 300 * u);
    if (sLen > 150 * u) printIn(g, F, { x: poleX - 30 * u, y: poleTop - 30 * u, w: sLen + 120 * u, h: F.gy - poleTop + 40 * u }, span(p, 0.2, 0.45), span(p, 0.3, 0.6), () => streamers(g, F, poleX, poleTop, F.gy - 6 * u, sLen, span(p, 0.3, 1)));
    const numSize = Math.max(96 * u, Math.min(116 * u, w * 0.34));
    const plH = 76 * u, plTop = F.gy - plH;
    const Hmax = Math.max(100 * u, plTop - (a.y + numSize * 1.12 + 60 * u + 30 * u) - 6 * u);
    const tierIdeal = Math.max(70 * u, w * 0.3);
    const items = [[L, d.left, false], [R, d.right, true]];
    items.forEach(([v, label, hi], i) => {
      const cx = xs[i], q0 = i * 0.18;
      const qk = span(p, q0, q0 + 0.3), qc = span(p, q0 + 0.12, q0 + 0.45), rise = span(p, q0 + 0.08, q0 + 0.8);
      const height = Math.max(tierIdeal * 0.8, Hmax * (v / max)), tiers = Math.max(1, Math.round(height / tierIdeal));
      const b = { x: cx - a.w * 0.25, y: a.y - 10 * u, w: a.w * 0.5, h: F.gy - a.y + 20 * u };
      printIn(g, F, b, qk, qc, () => {
        const lm = plateSize(g, F, label, 46 * u, a.w * 0.44);
        const pw = Math.max(lm.w + 20 * u, w * 1.1);
        const pl = polyP([[cx - pw / 2, F.gy], [cx - pw / 2 + 10 * u, plTop], [cx + pw / 2 - 10 * u, plTop], [cx + pw / 2, F.gy]]);
        ink(g, F, pl, grad(g, 0, plTop, 0, F.gy, [[0, shade(T.stone, 0.18)], [1, T.stone]]), { lw: 3 });
        say(g, F, label, cx, plTop + plH * 0.54, Math.max(42 * u, lm.lay.size), { maxW: pw - 30 * u, min: 42 * u });
        pagoda(g, F, cx, plTop, w, height, tiers, rise, hi ? F.acc : T.indigo, i, v * Math.sign(Number(i ? d.rightValue : d.leftValue) || 1), label, d, hi);
      });
    });
    // Cloud-scroll arrow between the towers.
    const ak = span(p, 0.35, 0.6);
    if (ak > 0) {
      const y = a.y + a.h * 0.52 + Math.sin(t * 1.2) * 6 * u, x0 = xs[0] + w * 0.62, x1 = xs[1] - w * 0.62;
      if (x1 - x0 > 60 * u) {
        F.pass = "both";
        g.save();
        g.beginPath(); g.rect(x0 - 40 * u, y - 80 * u, (x1 - x0 + 80 * u) * ease(ak), 160 * u); g.clip();
        mistBand(g, F, x0 - 20 * u, y - 14 * u, x1 - x0 + 10 * u, 28 * u, T.mist, { tint: T.rose, line: true });
        const ar = P(); ar.moveTo(x0, y); ar.bezierCurveTo(x0 + (x1 - x0) * 0.3, y - 30 * u, x0 + (x1 - x0) * 0.6, y + 30 * u, x1 - 20 * u, y);
        key(g, F, ar, 4.2);
        ink(g, F, polyP([[x1 + 6 * u, y], [x1 - 26 * u, y - 16 * u], [x1 - 18 * u, y], [x1 - 26 * u, y + 16 * u]]), T.key, { lw: 0 });
        const sp = P(); sp.arc(x0 - 6 * u, y - 10 * u, 12 * u, Math.PI * 0.4, Math.PI * 2.1);
        key(g, F, sp, 3.2);
        g.restore();
      }
    }
  }
  const DRAW = { chart, object, people, process, compare };

  // ---- title and closing prints --------------------------------------------------------------------
  // Title: an arched bridge across the lower third with two small travellers crossing it, a ferry
  // under the arch, and the moon above the ranges.
  function bridge(g, F, x0, x1, apex, foot, q) {
    const { u, T, t } = F;
    const deck = (s) => [lerp(x0, x1, s), foot - (foot - apex) * Math.sin(Math.PI * s)];
    const top = P(), under = P(), th = 22 * u;
    for (let k = 0; k <= 40; k++) { const [x, y] = deck(k / 40); k ? top.lineTo(x, y) : top.moveTo(x, y); }
    for (let k = 40; k >= 0; k--) { const [x, y] = deck(k / 40); top.lineTo(x, y + th); }
    top.closePath();
    // Piers.
    const piers = P();
    for (const s of [0.18, 0.36, 0.64, 0.82]) { const [x, y] = deck(s); piers.rect(x - 9 * u, y + th, 18 * u, F.riverTop + 30 * u - y - th); }
    ink(g, F, piers, shade(T.wood, -0.1), { lw: 2.4 });
    ink(g, F, top, grad(g, 0, apex, 0, foot + th, [[0, T.woodLite], [1, T.wood]]), { lw: 3 });
    // Rail and posts.
    const rail = P(), posts = P();
    for (let k = 0; k <= 40; k++) { const [x, y] = deck(k / 40); k ? rail.lineTo(x, y - 34 * u) : rail.moveTo(x, y - 34 * u); }
    for (let k = 0; k <= 12; k++) { const [x, y] = deck(k / 12); posts.moveTo(x, y); posts.lineTo(x, y - 40 * u); }
    key(g, F, posts, 2.6);
    key(g, F, rail, 3.2, T.key);
    for (const s of [0, 1]) { const [x, y] = deck(s); ink(g, F, rrP(x - 10 * u, y - 52 * u, 20 * u, 18 * u, 4 * u), F.acc, { lw: 2 }); }
    void under;
    // Travellers crossing.
    if (q > 0.5) {
      F.pass = "both";
      for (let k = 0; k < 2; k++) {
        const s = ((t * 0.035 + k * 0.17) % 1);
        const [x, y] = deck(0.1 + s * 0.8);
        person(g, F, x, y + 2 * u, 92 * u, k === 0 ? 3 : 0, { seed: 20 + k, prop: k ? T.rose : null });
      }
    }
  }
  function ferry(g, F, x, y, s) {
    const { u, T, t } = F;
    const bob = Math.sin(t * 1.6) * 3 * u, yy = y + bob;
    const hull = P(); hull.moveTo(x - 90 * s, yy - 16 * s); hull.quadraticCurveTo(x - 60 * s, yy + 12 * s, x, yy + 12 * s); hull.quadraticCurveTo(x + 70 * s, yy + 12 * s, x + 100 * s, yy - 22 * s); hull.lineTo(x + 80 * s, yy - 10 * s); hull.lineTo(x - 78 * s, yy - 8 * s); hull.closePath();
    ink(g, F, hull, grad(g, 0, yy - 20 * s, 0, yy + 12 * s, [[0, T.woodLite], [1, T.wood]]), { lw: 2.6 });
    const pole = Math.sin(t * 0.9) * 0.18;
    key(g, F, lineP([[x + 20 * s, yy - 110 * s], [x + 20 * s + Math.sin(pole) * 150 * s, yy + 40 * s]]), 2.6, T.wood);
    person(g, F, x + 6 * s, yy - 10 * s, 100 * s, 3, { seed: 33, robe: T.deep });
    void u;
  }
  function titleArt(g, F, local) {
    const { u, W, H, tall } = F;
    const q = span(local, 0, 0.9);
    const x0 = tall ? W * 0.04 : W * 0.12, x1 = tall ? W * 0.96 : W * 0.7;
    const apex = tall ? H * 0.74 : H * 0.7, foot = F.gy - 4 * u;
    printIn(g, F, { x: x0 - 40 * u, y: apex - 80 * u, w: x1 - x0 + 80 * u, h: F.riverTop - apex + 120 * u }, span(local, 0, 0.4), span(local, 0.1, 0.6), () => bridge(g, F, x0, x1, apex, foot, q));
  }
  function closingArt(g, F, local, hold) {
    const { u, W, H, T, t, tall } = F;
    const q = span(local, 0, 0.9);
    // A stone lantern on the bank, lit and flickering.
    const lx = tall ? W * 0.8 : W * 0.86, base = F.gy - 2 * u, s = (tall ? H * 0.2 : H * 0.27) / 100;
    printIn(g, F, { x: lx - 60 * s, y: base - 110 * s, w: 120 * s, h: 115 * s }, span(local, 0, 0.5), span(local, 0.1, 0.7), () => {
      const fl = 0.75 + 0.25 * Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1);
      if (F.pass !== "line") { g.save(); const gl = g.createRadialGradient(lx, base - 62 * s, 0, lx, base - 62 * s, 70 * s); gl.addColorStop(0, hexA(T.glow, 0.5 * fl)); gl.addColorStop(1, hexA(T.glow, 0)); g.fillStyle = gl; g.fillRect(lx - 70 * s, base - 132 * s, 140 * s, 140 * s); g.restore(); }
      ink(g, F, polyP([[lx - 26 * s, base], [lx + 26 * s, base], [lx + 20 * s, base - 8 * s], [lx - 20 * s, base - 8 * s]]), T.stone, { lw: 2.6 });
      ink(g, F, rectP(lx - 7 * s, base - 44 * s, 14 * s, 36 * s), T.stone, { lw: 2.4 });
      ink(g, F, polyP([[lx - 22 * s, base - 44 * s], [lx + 22 * s, base - 44 * s], [lx + 18 * s, base - 50 * s], [lx - 18 * s, base - 50 * s]]), shade(T.stone, 0.15), { lw: 2.4 });
      ink(g, F, rectP(lx - 15 * s, base - 72 * s, 30 * s, 22 * s), shade(T.stone, 0.1), { lw: 2.4 });
      ink(g, F, rectP(lx - 8 * s, base - 68 * s, 16 * s, 14 * s), hexA(T.glow, 0.6 + 0.4 * fl), { lw: 1.6, grain: 0 });
      const roof = P(); roof.moveTo(lx - 34 * s, base - 72 * s); roof.quadraticCurveTo(lx - 20 * s, base - 76 * s, lx - 8 * s, base - 88 * s); roof.lineTo(lx + 8 * s, base - 88 * s); roof.quadraticCurveTo(lx + 20 * s, base - 76 * s, lx + 34 * s, base - 72 * s); roof.closePath();
      ink(g, F, roof, shade(T.stone, -0.1), { lw: 2.6 });
      ink(g, F, ellP(lx, base - 92 * s, 6 * s, 5 * s), T.stone, { lw: 2 });
    });
    // A jetty with a moored boat.
    const jx0 = tall ? W * 0.06 : W * 0.08, jx1 = tall ? W * 0.5 : W * 0.4;
    printIn(g, F, { x: jx0 - 20 * u, y: F.gy - 70 * u, w: jx1 - jx0 + 200 * u, h: H - F.gy + 70 * u }, span(local, 0.05, 0.55), span(local, 0.2, 0.8), () => {
      const planks = P();
      for (let x = jx0; x < jx1; x += 26 * u) planks.rect(x, F.riverTop - 10 * u, 24 * u, 12 * u);
      ink(g, F, planks, T.woodLite, { lw: 1.8 });
      const posts = P(); for (let x = jx0 + 20 * u; x < jx1; x += 130 * u) posts.rect(x, F.riverTop - 24 * u, 12 * u, 60 * u);
      ink(g, F, posts, T.wood, { lw: 2 });
      ferry(g, F, jx1 + 120 * u, F.riverTop + (H - F.riverTop) * 0.45, (tall ? 0.9 : 1) * u);
    });
    void q; void hold;
  }

  // ---- the world -----------------------------------------------------------------------------------
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
    shown.forEach((st, i) => { st.i = i; });
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
  // How far the landscape has travelled: a slow drift plus a pan at every change.
  function travel(F, t) {
    const P2 = F.plan;
    let pan = 0;
    if (P2) for (let k = 1; k < P2.shown.length; k++) { const T0 = P2.shown[k].start, c = P2.change; pan += inout((t - (T0 - c)) / (2 * c)); }
    return { drift: t * 16 * F.u, pan: pan * F.W * 0.42 };
  }
  const ridge = (x, s) => 0.5 + 0.26 * Math.sin(x * 0.0021 + s) + 0.13 * Math.sin(x * 0.0053 + s * 2.3) + 0.07 * Math.sin(x * 0.0131 + s * 1.7) + 0.06 * Math.abs(Math.sin(x * 0.0009 + s * 0.4));
  // Moon height: up over the title, setting behind the ranges at the first change, rising at the end.
  function moonState(F) {
    const P2 = F.plan, t = F.t;
    if (!P2) return F.info.scene === "title" || F.info.scene === "closing" ? 0 : 1;
    const first = P2.shown[0], last = P2.shown[P2.shown.length - 1];
    let down = 1;
    if (first.id === "title") down = Math.min(down, clamp((t - (first.hold - P2.change)) / (P2.change * 3)));
    if (last.id === "closing" && P2.shown.length > 1) down = Math.min(down, 1 - inout((t - last.start + P2.change) / 1.6));
    if (first.id === "title" && P2.shown.length === 1) down = 0;
    return down;
  }
  function sky(g, F) {
    const { W, H, u, T, tall } = F;
    g.save();
    // Horizon bokashi rising from behind the ranges.
    const hz = F.horizon;
    g.fillStyle = grad(g, 0, hz - H * 0.34, 0, hz, [[0, hexA(T.sky, 0)], [1, hexA(T.sky, 0.95)]]);
    g.fillRect(0, hz - H * 0.34, W, H * 0.34 + 4 * u);
    // Ichimonji: the dark strip along the top edge.
    g.fillStyle = grad(g, 0, 0, 0, (tall ? 120 : 90) * u, [[0, T.deep], [0.42, hexA(T.indigo, 0.85)], [1, hexA(T.indigo, 0)]]);
    g.fillRect(0, 0, W, (tall ? 120 : 90) * u);
    g.restore();
    // The moon, low in the sky, setting and rising.
    const down = moonState(F);
    if (down < 1) {
      const mx = tall ? W * 0.72 : W * 0.8, my0 = tall ? H * 0.2 : H * 0.24, r = (tall ? 120 : 112) * u;
      const my = lerp(my0, F.horizon + r * 1.2, down) + Math.sin(F.t * 0.4) * 4 * u;
      F.pass = "both";
      g.save();
      const halo = g.createRadialGradient(mx, my, r * 0.9, mx, my, r * 1.9);
      halo.addColorStop(0, hexA(T.sky, 0.95)); halo.addColorStop(0.35, hexA(T.sky, 0.55)); halo.addColorStop(1, hexA(T.sky, 0));
      g.fillStyle = halo; g.fillRect(mx - r * 2, my - r * 2, r * 4, r * 4);
      g.restore();
      ink(g, F, ellP(mx, my, r, r), grad(g, 0, my - r, 0, my + r, [[0, T.moon], [1, shade(T.moon, -0.06)]]), { lw: 2, grain: 0.5 });
    }
  }
  function clouds(g, F, off) {
    const { W, H, u, T, tall } = F;
    const band = [[0.2, 0.34, 520, 30], [0.62, 0.27, 420, 24], [1.05, 0.38, 600, 34], [1.5, 0.3, 380, 22], [0.85, 0.2, 360, 20], [1.3, 0.44, 480, 26], [0.45, 0.46, 300, 18]];
    const period = W * 1.9;
    for (const [fx, fy, len, hh] of band) {
      let x = ((fx * W - off * 0.12) % period + period) % period - W * 0.4;
      mistBand(g, F, x, H * fy * (tall ? 0.85 : 1), len * u, hh * u, T.cloud, { tint: T.rose, alpha: 0.85 });
    }
  }
  function ranges(g, F, travelled) {
    const { W, H, u, T } = F;
    const hz = F.horizon;
    F.pass = "both";
    // Far range: pale, keyline only along the ridge.
    const offF = travelled * 0.15, ampF = F.tall ? H * 0.11 : H * 0.19;
    const far = P(); far.moveTo(0, hz + 4 * u);
    const ridgeF = [];
    for (let x = 0; x <= W + 8 * u; x += 8 * u) { const y = hz - ridge((x + offF) / u, 1.3) * ampF; ridgeF.push([x, y]); far.lineTo(x, y); }
    far.lineTo(W, hz + 4 * u); far.closePath();
    g.save(); g.fillStyle = grad(g, 0, hz - ampF, 0, hz, [[0, T.far], [0.6, shade(T.far, 0.35)], [1, hexA(T.sky, 0.3)]]); g.fill(far);
    g.globalAlpha = F.tex * 0.6; g.fillStyle = F.pat.grain; g.fill(far); g.restore();
    key(g, F, lineP(ridgeF), 1.6, hexA(T.key, 0.45));
    // Near hills with trees.
    const offN = travelled * 0.34, nearY = F.nearY, ampN = F.tall ? H * 0.06 : H * 0.1;
    const near = P(); near.moveTo(0, F.gy);
    const ridgeN = [];
    for (let x = 0; x <= W + 8 * u; x += 8 * u) { const y = nearY - ridge((x + offN) / u * 1.6, 4.1) * ampN; ridgeN.push([x, y]); near.lineTo(x, y); }
    near.lineTo(W, F.gy); near.closePath();
    // Trees behind the ridge line.
    const step = 46 * u, first = Math.floor((offN - 60 * u) / step);
    for (let k = first; k * step - offN < W + 60 * u; k++) {
      if (hash(k * 1.31) < 0.42) continue;
      const x = k * step - offN, y = nearY - ridge((x + offN) / u * 1.6, 4.1) * ampN + 6 * u, h = (34 + 30 * hash(k * 2.7)) * u;
      const sway = Math.sin(F.t * 1.2 + k) * 1.5 * u;
      ink(g, F, rectP(x - 2.5 * u, y - h * 0.4, 5 * u, h * 0.4), T.wood, { lw: 1.4, grain: 0 });
      const crown = P(); const tiers = 3;
      for (let j = 0; j < tiers; j++) { const cy = y - h * (0.35 + j * 0.22), cw = h * (0.42 - j * 0.1); crown.moveTo(x - cw + sway * j, cy); crown.quadraticCurveTo(x + sway * j, cy - h * 0.34, x + cw + sway * j, cy); crown.closePath(); }
      ink(g, F, crown, grad(g, 0, y - h, 0, y, [[0, T.sageDeep], [1, T.sage]]), { lw: 1.6, grain: 0.6 });
    }
    g.save(); g.fillStyle = grad(g, 0, nearY - ampN, 0, F.gy, [[0, T.sage], [0.5, shade(T.sage, 0.3)], [1, shade(T.sage, 0.5)]]); g.fill(near);
    g.globalAlpha = F.tex * 0.8; g.fillStyle = F.pat.grain; g.fill(near); g.restore();
    key(g, F, lineP(ridgeN), 2.2);
  }
  function lowMist(g, F, travelled) {
    const { W, H, u, T } = F;
    const off = travelled * 0.5 + F.t * 10 * u;
    const rows = [[F.horizon - H * 0.02, 34, 0.0, 0.8], [F.nearY + H * 0.035, 42, 0.45, 1.25]];
    const period = W * 1.6;
    for (const [y, hh, ph, len] of rows) {
      for (let k = 0; k < 2; k++) {
        const x = (((ph + k * 0.8) * W - off) % period + period) % period - W * 0.35;
        mistBand(g, F, x, y, W * 0.45 * len, hh * u, T.mist, { tint: T.rose, alpha: 0.92 });
      }
    }
  }
  function birds(g, F) {
    const { W, H, u, T, t } = F;
    const per = 15, ph = ((t + 4) / per) % 1;
    const fx = W + 120 * u - ph * (W + 500 * u), fy = (F.tall ? H * 0.27 : H * 0.36) + Math.sin(ph * TAU) * 24 * u;
    const pth = P();
    for (let k = 0; k < 6; k++) {
      const row = Math.ceil(k / 2), side = k % 2 ? 1 : -1;
      const x = fx + row * 46 * u, y = fy + side * row * 22 * u + Math.sin(t * 0.7 + k) * 4 * u;
      const fl = Math.sin(t * 8 + k * 1.3) * 7 * u, s = 13 * u;
      pth.moveTo(x - s, y - fl); pth.quadraticCurveTo(x - s * 0.4, y - fl * 0.3 - 4 * u, x, y); pth.quadraticCurveTo(x + s * 0.4, y - fl * 0.3 - 4 * u, x + s, y - fl);
    }
    F.pass = "both";
    key(g, F, pth, 2.4, T.key);
  }
  function ground(g, F, pan) {
    const { W, H, u, T, t } = F;
    F.pass = "both";
    const gy = F.gy - 6 * u, rt = F.riverTop;
    const bank = P(); bank.moveTo(0, rt + 6 * u);
    const edge = [];
    for (let x = 0; x <= W + 10 * u; x += 10 * u) { const y = gy + Math.sin((x + pan) / (90 * u)) * 2 * u; edge.push([x, y]); bank.lineTo(x, y); }
    bank.lineTo(W, rt + 6 * u); bank.closePath();
    ink(g, F, bank, grad(g, 0, gy, 0, rt, [[0, T.sand], [1, shade(T.sand, -0.1)]]), { lw: 0, grain: 0.8 });
    key(g, F, lineP(edge), 2.4);
    // Grass tufts along the bank.
    const tufts = P(), step = 70 * u, first = Math.floor(pan / step) - 1;
    for (let k = first; k * step - pan < W + step; k++) {
      if (hash(k * 3.3) < 0.35) continue;
      const x = k * step - pan + hash(k) * 30 * u, y = gy + 2 * u, sw = Math.sin(t * 1.7 + k) * 3 * u;
      for (let j = -2; j <= 2; j++) { tufts.moveTo(x + j * 4 * u, y); tufts.quadraticCurveTo(x + j * 6 * u, y - 10 * u, x + j * 8 * u + sw, y - (16 + 4 * Math.abs(j)) * u); }
    }
    key(g, F, tufts, 1.6, T.sageDeep);
    // River: bokashi from pale to deep, carved ripple lines, a scalloped foam edge.
    const rv = rectP(0, rt, W, H - rt);
    ink(g, F, rv, grad(g, 0, rt, 0, H, [[0, T.waterLite], [0.45, T.water], [1, T.deep]]), { lw: 0, grain: 1 });
    const flow = t * 34 * u + pan;
    const rip = P();
    const rows = Math.max(3, Math.round((H - rt) / (24 * u)));
    for (let r = 0; r < rows; r++) {
      const y = rt + 18 * u + r * ((H - rt - 18 * u) / rows), wl = (60 + r * 14) * u, sh = (flow * (0.6 + r * 0.25)) % wl;
      for (let x = -wl - sh; x < W + wl; x += wl) { rip.moveTo(x, y); rip.quadraticCurveTo(x + wl * 0.25, y - 7 * u, x + wl * 0.5, y); rip.quadraticCurveTo(x + wl * 0.75, y + 5 * u, x + wl, y); }
    }
    key(g, F, rip, 1.8, hexA(T.foam, 0.75));
    const foam = P(), fw = 28 * u, fsh = (flow * 0.5) % fw;
    for (let x = -fw - fsh; x < W + fw; x += fw) { foam.moveTo(x, rt + 2 * u); foam.arc(x + fw / 2, rt + 2 * u, fw / 2, Math.PI, 0); }
    ink(g, F, foam, T.foam, { lw: 1.6, grain: 0 });
    key(g, F, lineP([[0, rt], [W, rt]]), 2.6);
  }
  function reeds(g, F) {
    const { W, H, u, T, t } = F;
    F.pass = "both";
    const clump = (x0, dir) => {
      for (let k = 0; k < 9; k++) {
        const bx = x0 + dir * k * 11 * u, hgt = (120 + 70 * hash(k * 5.1 + dir)) * u, sw = Math.sin(t * 1.5 + k * 0.7) * 10 * u + dir * 14 * u * hash(k);
        const tip = [bx + sw, H - hgt];
        const blade = P(); blade.moveTo(bx - 4 * u, H + 4 * u); blade.quadraticCurveTo(bx + sw * 0.3, H - hgt * 0.55, tip[0], tip[1]); blade.quadraticCurveTo(bx + sw * 0.3 + 5 * u, H - hgt * 0.55, bx + 4 * u, H + 4 * u); blade.closePath();
        ink(g, F, blade, grad(g, 0, H - hgt, 0, H, [[0, T.sage], [1, T.sageDeep]]), { lw: 1.6, grain: 0.4 });
        if (k % 3 === 1) {
          const hx = bx + sw * 0.8, hy = H - hgt * 0.86;
          ink(g, F, rrP(hx - 5 * u, hy - 18 * u, 10 * u, 34 * u, 5 * u), T.wood, { lw: 1.6, grain: 0 });
        }
      }
    };
    clump(F.edge + 10 * u, 1);
    clump(W - F.edge - 10 * u, -1);
  }
  function petals(g, F) {
    const { W, H, u, T, t } = F;
    const n = F.tall ? 26 : 30, snow = T.snow;
    F.pass = "both";
    for (let i = 0; i < n; i++) {
      const v = (34 + 46 * hash(i * 1.7)) * u, cyc = H + 80 * u;
      const y = ((t * v + hash(i * 3.3) * cyc) % cyc) - 40 * u;
      const xs = W + 140 * u;
      const x = (((hash(i * 7.1) * xs - t * v * 0.45 + Math.sin(t * 1.2 + i) * 26 * u) % xs) + xs) % xs - 70 * u;
      if (snow) { g.save(); g.fillStyle = hexA(T.petal, 0.9); g.beginPath(); g.arc(x, y, (2.6 + 3 * hash(i)) * u, 0, TAU); g.fill(); g.restore(); continue; }
      const r = t * (1 + hash(i * 9)) * 2 + i, s = (7 + 4 * hash(i * 2.2)) * u;
      g.save(); g.translate(x, y); g.rotate(r); g.scale(1, 0.55 + 0.45 * Math.abs(Math.sin(t * 2 + i)));
      const pp = P(); pp.moveTo(0, -s); pp.quadraticCurveTo(s * 0.9, -s * 0.2, 0, s); pp.quadraticCurveTo(-s * 0.9, -s * 0.2, 0, -s); pp.closePath();
      ink(g, F, pp, T.petal, { lw: 1.1, grain: 0, reg: false, stroke: hexA(T.key, 0.6) });
      g.restore();
    }
  }
  // Transition mist: bands sweep across from the right, covering the frame at the change, then clear.
  function changeMist(g, F) {
    const P2 = F.plan, t = F.t;
    if (!P2) return;
    const { u, T } = F;
    for (let k = 1; k < P2.shown.length; k++) {
      const T0 = P2.shown[k].start, c = P2.change;
      if (t < T0 - c || t > T0 + c) continue;
      for (const r of mistRows(F, T0)) {
        const x0 = r.b - r.len / 2;
        mistBand(g, F, x0, r.band - r.rh * 0.1, r.len, r.rh * 1.2, r.j % 2 ? T.mist : T.cloud, { tint: T.rose, step: 0.08, edge: shade(T.mist, -0.05), line: true });
        // Carved swirls riding the band.
        const sp = P();
        sp.arc(x0 + r.rh * 0.7, r.band + r.rh * 0.5, r.rh * 0.3, Math.PI * 0.5, Math.PI * 2.2);
        sp.moveTo(x0 + r.len * 0.55 + r.rh * 0.25, r.band + r.rh * 0.45); sp.arc(x0 + r.len * 0.55, r.band + r.rh * 0.45, r.rh * 0.25, 0, Math.PI * 1.6);
        F.pass = "both";
        key(g, F, sp, 2, hexA(T.key, 0.45));
      }
    }
  }
  function cartouche(g, F) {
    const { u, T, tall } = F;
    const P2 = F.plan;
    let idx = 0, swap = 1;
    if (P2) {
      const t = F.t, i = Math.max(0, P2.shown.findIndex((s) => t >= s.start && t < s.start + s.hold));
      idx = t >= P2.length ? P2.shown.length - 1 : i;
      swap = clamp((t - P2.shown[idx].start) / 0.5);
      if (idx === 0) swap = 1;
    }
    const w = (tall ? 58 : 66) * u, x = (tall ? 22 : 38) * u, y = (tall ? 70 : 56) * u, ch = (tall ? 38 : 42) * u, h = ch * 3 + 34 * u;
    F.pass = "both";
    ink(g, F, rectP(x, y, w, h), T.plate, { lw: 2.6, grain: 0.4 });
    key(g, F, rectP(x + 5 * u, y + 5 * u, w - 10 * u, h - 10 * u), 1.2);
    g.save(); g.globalAlpha *= 0.25 + 0.75 * swap;
    const chars = ["第", NUMS[idx] || String(idx + 1), "景"];
    chars.forEach((c, k) => { font(g, ch * 0.86, 600, CJK); g.fillStyle = T.key; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(c, x + w / 2, y + 17 * u + ch * (k + 0.5) + (1 - swap) * 6 * u); });
    g.restore();
    seal(g, F, x + w / 2, y + h + 40 * u, w * 0.78, "夢", 1, 0);
  }
  // A seal pressed on the last print before the reel ends (the closing has its own, larger one).
  function endSeal(g, F) {
    const P2 = F.plan;
    if (!P2) return;
    const last = P2.shown[P2.shown.length - 1], local = F.t - last.start;
    const { u, W, H } = F;
    if (last.id === "closing") {
      const k = span(local, 0.8, 1.3);
      seal(g, F, F.tall ? W * 0.5 : W * 0.66, F.tall ? F.gy - 260 * u : F.gy - 150 * u, 150 * u, "可", k, -0.08);
    } else {
      const k = span(local, last.hold - 1.7, last.hold - 1.3);
      seal(g, F, W - F.edge - 90 * u, (F.riverTop + H) / 2, Math.min(96 * u, (H - F.riverTop) * 0.8), "可", k, -0.08);
    }
  }

  // Headline lines, measured once from the layout so drawings sit below them.
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
  function areaOf(F, id) {
    const { W, H, u, tall } = F, side = (tall ? 90 : 140) * u;
    const lines = headLines(`${id}-title`);
    const bottom = lines.length ? Math.max(...lines.map((l) => l.y + l.h)) : (tall ? 300 : 200) * u;
    const top = Math.max(bottom + (tall ? 70 : 52) * u, H * (tall ? 0.17 : 0.19));
    return { x: side, y: top, w: W - side * 2, h: F.gy - top };
  }

  // ---- textures (rendered once per size and palette) -----------------------------------------------
  let tex = null, texKey = "";
  function makeTextures(F) {
    const { W, H, u, T } = F, amt = F.tex;
    const mk = (w, h) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
    const r = rng(2107);
    // Washi: base tone, soft blotches, long fibres and small inclusions.
    const paper = mk(W, H), pg = paper.getContext("2d");
    pg.fillStyle = T.paper; pg.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) {
      const x = r() * W, y = r() * H, rad = (80 + r() * 260) * u, dark = r() < 0.5;
      const gr = pg.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, dark ? `rgba(${T.shadeRGB},${0.05 * amt})` : `rgba(255,255,255,${0.07 * amt})`); gr.addColorStop(1, "rgba(0,0,0,0)");
      pg.fillStyle = gr; pg.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    const fib = (g2, n, alpha) => {
      for (let i = 0; i < n; i++) {
        const x = r() * W, y = r() * H, len = (12 + r() * 60) * u, a = r() * TAU, bend = (r() - 0.5) * 30 * u;
        g2.beginPath(); g2.moveTo(x, y); g2.quadraticCurveTo(x + Math.cos(a) * len / 2 + bend, y + Math.sin(a) * len / 2 - bend, x + Math.cos(a) * len, y + Math.sin(a) * len);
        const light = r() < 0.6;
        g2.strokeStyle = light ? `rgba(255,252,240,${alpha * (0.5 + r()) * amt})` : `rgba(${T.shadeRGB},${alpha * 0.6 * (0.5 + r()) * amt})`;
        g2.lineWidth = (0.6 + r() * 1.2) * u; g2.stroke();
      }
    };
    fib(pg, 1200, 0.16);
    for (let i = 0; i < 500; i++) { pg.fillStyle = `rgba(${T.shadeRGB},${(0.08 + r() * 0.14) * amt})`; pg.beginPath(); pg.arc(r() * W, r() * H, (0.5 + r() * 1.6) * u, 0, TAU); pg.fill(); }
    // Fibres that show through the ink.
    const over = mk(W, H), og = over.getContext("2d");
    fib(og, 700, 0.16);
    // Ink skips: speckles and short scuffs where the block did not print.
    const wear = mk(W, H), wg = wear.getContext("2d");
    for (let i = 0; i < 2600; i++) { wg.fillStyle = `rgba(0,0,0,${0.25 + r() * 0.6})`; wg.beginPath(); wg.arc(r() * W, r() * H, (0.4 + r() * 1.5) * u, 0, TAU); wg.fill(); }
    for (let i = 0; i < 260; i++) { const x = r() * W, y = r() * H; wg.strokeStyle = `rgba(0,0,0,${0.15 + r() * 0.3})`; wg.lineWidth = (0.6 + r()) * u; wg.beginPath(); wg.moveTo(x, y); wg.lineTo(x + (8 + r() * 30) * u, y + (r() - 0.5) * 4 * u); wg.stroke(); }
    // Wood grain carried into every colour block.
    const gw = Math.round(640 * u), gh = Math.round(360 * u), gt = mk(gw, gh), gg = gt.getContext("2d");
    for (let k = 0; k < 70; k++) {
      const y0 = r() * gh, amp = (2 + r() * 7) * u, fr = (0.004 + r() * 0.01) / u, ph = r() * TAU;
      gg.beginPath();
      for (let x = 0; x <= gw; x += 6 * u) { const y = y0 + Math.sin(x * fr + ph) * amp + Math.sin(x * fr * 3.1 + ph) * amp * 0.3; x ? gg.lineTo(x, y) : gg.moveTo(x, y); }
      const light = r() < 0.4;
      gg.strokeStyle = light ? "rgba(255,250,235,0.16)" : `rgba(${T.shadeRGB},0.13)`; gg.lineWidth = (0.8 + r() * 2.2) * u; gg.stroke();
    }
    for (let i = 0; i < 40; i++) {
      const x = r() * gw, y = r() * gh, rad = (30 + r() * 90) * u, gr = gg.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, r() < 0.5 ? "rgba(255,250,235,0.1)" : `rgba(${T.shadeRGB},0.08)`); gr.addColorStop(1, "rgba(0,0,0,0)");
      gg.fillStyle = gr; gg.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    return { paper, over, wear, grainTile: gt, grain: null };
  }

  // ---- frame assembly ------------------------------------------------------------------------------
  let layer = null, frame = null;
  function makeFrame(S, info) {
    const { W, H, u, look } = S;
    if (!layer || layer.width !== W || layer.height !== H) { layer = document.createElement("canvas"); layer.width = W; layer.height = H; }
    const T = { ...look.tone };
    const g = layer.getContext("2d");
    const F = {
      S, W, H, u, tall: S.tall, T, info, t: info.t, g, tex: look.texture, acc: S.accent, pass: "both",
      reg: { x: 1.6 * u, y: -1.1 * u }, edge: 18 * u, glow: true,
      gy: H * (S.tall ? 0.9 : 0.875), riverTop: H * (S.tall ? 0.918 : 0.896),
      horizon: H * (S.tall ? 0.6 : 0.64), nearY: H * (S.tall ? 0.78 : 0.8),
      sealColor: T.seal === "accent" ? S.accent : T.seal,
    };
    T.accentSoft = hexA(S.accent, 0.9);
    const k = `${W}x${H}:${look.palette || ""}:${T.paper}:${F.tex}`;
    if (!tex || texKey !== k) { tex = makeTextures(F); texKey = k; tex.grain = g.createPattern(tex.grainTile, "repeat"); }
    F.pat = { grain: tex.grain };
    F.plan = planOf(F);
    return F;
  }
  // Each scene's own clock starts when the mist begins to reveal it (the first scene at zero).
  function sceneArt(g, F, st) {
    const P2 = F.plan, local = F.t - st.start + (st.i > 0 ? P2.change : 0), hold = st.hold;
    F.pass = "both";
    if (st.id === "title") titleArt(g, F, local, hold);
    else if (st.id === "closing") closingArt(g, F, local, hold);
    else if (DRAW[st.id]) DRAW[st.id](g, F, areaOf(F, st.id), clamp(local / Math.min(1.7, hold * 0.5)), P2.data[st.id], local, hold);
    F.pass = "both";
  }
  // Rows of the change: each row's mist band rides its own boundary from the right edge to the left.
  function mistRows(F, T0) {
    const { W, H, u, t } = F, c = F.plan.change;
    const top = F.tall ? H * 0.17 : H * 0.15, bot = F.riverTop + 10 * u, n = 6, rh = (bot - top) / n, len = W * 0.5;
    const x = (t - (T0 - c)) / (2 * c);
    const rows = [];
    for (let j = 0; j < n; j++) {
      const stg = ((j * 37) % n) / (n - 1);
      const f = inout(clamp(x * 1.25 - stg * 0.25));
      const b = W + len / 2 + 30 * u - f * (W + len + 60 * u);
      const y0 = j === 0 ? 0 : top + rh * j, y1 = j === n - 1 ? H : top + rh * (j + 1);
      rows.push({ top: y0, h: y1 - y0, b, band: top + rh * j, rh, len, j });
    }
    return rows;
  }
  function world(F) {
    const g = F.g, { W, H, t, info } = F;
    const tr = travel(F, t), travelled = tr.drift + tr.pan;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    g.clearRect(0, 0, W, H);
    sky(g, F);
    clouds(g, F, travelled + t * 8 * F.u);
    ranges(g, F, travelled);
    birds(g, F);
    lowMist(g, F, travelled);
    ground(g, F, tr.pan);
    // The current scene, or two scenes split by the travelling mist at a change.
    const P2 = F.plan;
    if (P2) {
      const sh = P2.shown, c = P2.change, n = sh.length;
      let i = sh.findIndex((s) => t >= s.start && t < s.start + s.hold);
      if (i < 0) i = t <= 0 ? 0 : n - 1;
      let wipe = null;
      if (i > 0 && t < sh[i].start + c) wipe = [i - 1, i];
      else if (i < n - 1 && t >= sh[i].start + sh[i].hold - c) wipe = [i, i + 1];
      if (!wipe) sceneArt(g, F, sh[i]);
      else {
        const rows = mistRows(F, sh[wipe[1]].start);
        for (const side of [0, 1]) {
          g.save(); g.beginPath();
          for (const r of rows) { if (side === 0) g.rect(-10, r.top, r.b + 10, r.h); else g.rect(r.b, r.top, F.W - r.b + 10, r.h); }
          g.clip();
          sceneArt(g, F, sh[wipe[side]]);
          g.restore();
        }
      }
    } else if (info.scene) {
      F.pass = "both";
      if (info.scene === "title") titleArt(g, F, info.local, info.hold);
      else if (info.scene === "closing") closingArt(g, F, info.local, info.hold);
    }
    F.pass = "both";
    reeds(g, F);
    changeMist(g, F);
    petals(g, F);
    cartouche(g, F);
    endSeal(g, F);
    F.pass = "both";
  }
  function compose(ctx, F) {
    const g = F.g, { W, H, u, T } = F;
    // Ink skips.
    if (F.tex > 0) {
      g.save(); g.globalCompositeOperation = "destination-out"; g.globalAlpha = 0.5 * F.tex; g.drawImage(tex.wear, 0, 0); g.restore();
    }
    // Margin: the image sits inside a thin printed border.
    const e = F.edge;
    g.save(); g.globalCompositeOperation = "destination-in"; g.fillRect(e, e, W - e * 2, H - e * 2); g.restore();
    ctx.save();
    ctx.globalAlpha = 0.97;
    ctx.drawImage(layer, 0, 0);
    ctx.globalAlpha = 1;
    if (F.tex > 0) { ctx.globalAlpha = 0.45; ctx.drawImage(tex.over, 0, 0); ctx.globalAlpha = 1; }
    ctx.strokeStyle = T.key; ctx.lineWidth = 2.6 * u; ctx.strokeRect(e, e, W - e * 2, H - e * 2);
    ctx.lineWidth = 1 * u; ctx.strokeRect(e - 6 * u, e - 6 * u, W - (e - 6 * u) * 2, H - (e - 6 * u) * 2);
    // Aged edges.
    const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, `rgba(${T.shadeRGB},${0.22 * F.tex})`);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  const TONE = {
    paper: "#eee1c1", plate: "#f7eed6", key: "#2a211b", shadeRGB: "92,64,32",
    indigo: "#2e4f80", deep: "#1b2e52", aqua: "#8db3c9", sky: "#a9c9d8", far: "#7fa2bd",
    sage: "#8aa673", sageDeep: "#55734a", ochre: "#d3a24f", rose: "#e8b2a0", blush: "#e58f7c",
    wood: "#7b5235", woodLite: "#a97a50", stone: "#a8a294", sand: "#e3cf9f",
    water: "#2f5c8c", waterLite: "#86b0c9", foam: "#f6eed8", mist: "#f4e9cf", cloud: "#f6e3d2",
    moon: "#f9f0d6", glow: "#f2b648", petal: "#f1bcbc", face: "#f8ecd8", seal: "accent", snow: false,
  };
  const halo = (paper) => () => `0 0 2px ${paper}, 0 0 14px ${paper}, 0 0 30px ${paper}, 0 0 44px ${paper}`;
  const CSS = (accent, look) => `
    #root .display { text-wrap: balance; }
    #root .kicker { letter-spacing: 0.22em; font-weight: 700; }
    ${look.tone.snow ? "" : ""}
  `;
  const scene = (id) => (ctx, S, box, p, d) => {
    // With the plan known the stage prints every scene; this only runs when the controls are unavailable.
    const F = frame;
    if (!F || F.plan || F.info.scene !== id) return;
    const g = F.g;
    DRAW[id](g, F, areaOf(F, id), p, d, F.info.local, F.info.hold);
    compose(ctx, F);
  };

  return {
    bg: TONE.paper, panel: "rgba(247,238,214,0.92)", ink: "#2a211b", muted: "#6b5a48", accent: "#c4432b", onAccent: "#f7eed6",
    rule: "rgba(42,33,27,0.85)", track: "rgba(42,33,27,0.12)",
    display: SERIF, displayWeight: 600, displayTracking: "0.01em", displayCase: "none",
    body: SERIF, bodyWeight: 600, figures: SERIF, radius: 0,
    motion: "wipe", change: "fade",
    kit: { line: 3, fill: "solid", panel: "fill" },
    panelEdge: "rgba(42,33,27,0.9)",
    tone: TONE,
    keepArt: true,
    overlap: true,
    palettes: {
      // Spring: a pale, sunlit print. Night: deep indigo sky and falling snow. Sumi: ink and grey wash only.
      light: { bg: "#f6efdf", ink: "#2b2622", muted: "#6c6156", accent: "#d4574a", textShadow: halo("#f6efdf"), backdrop: () => "#f6efdf",
        tone: { ...TONE, paper: "#f6efdf", plate: "#fcf7ea", indigo: "#4c78a8", deep: "#33557f", aqua: "#a9cfe2", sky: "#cfe6ee", far: "#b9d3df", sage: "#9cc488", sageDeep: "#679a5a", rose: "#f4c4c6", water: "#4d7fb0", waterLite: "#a9cde2", mist: "#fbf3e2", cloud: "#fbe8e4", petal: "#f6c6cf" } },
      dark: { bg: "#1f2b47", ink: "#f4e8cb", muted: "#c9bda0", accent: "#e0604a", textShadow: halo("#1f2b47"), backdrop: () => "#1f2b47",
        tone: { ...TONE, paper: "#1f2b47", plate: "#efe3c3", key: "#0c0f18", shadeRGB: "4,8,20", indigo: "#3e5f95", deep: "#121d36", aqua: "#5f82ab", sky: "#2f4a76", far: "#3c5880", sage: "#4f6e5c", sageDeep: "#30493a", ochre: "#c39446", rose: "#9c7a8a", wood: "#5e3f2a", woodLite: "#82603f", stone: "#7f7c78", sand: "#6d6553", water: "#172a4c", waterLite: "#3c5f8e", foam: "#d9e2ec", mist: "#33476b", cloud: "#3b5078", moon: "#f6ebc6", petal: "#f4f1e8", face: "#efe2c8", snow: true } },
      mono: { bg: "#efebe2", ink: "#1c1c1c", muted: "#5a5a58", accent: "#2a2a2a", onAccent: "#efebe2", textShadow: halo("#efebe2"), backdrop: () => "#efebe2",
        tone: { ...TONE, paper: "#efebe2", plate: "#f8f6f0", key: "#1b1b1b", shadeRGB: "40,40,40", indigo: "#5a5a5a", deep: "#2c2c2c", aqua: "#a4a4a2", sky: "#d2d2ce", far: "#b5b5b2", sage: "#8c8c88", sageDeep: "#5c5c5a", ochre: "#b0ada6", rose: "#d4d0ca", blush: "#bdb8b2", wood: "#5f5b56", woodLite: "#8a857e", stone: "#a5a39e", sand: "#d8d5cd", water: "#555553", waterLite: "#a9a9a6", foam: "#f2f1ec", mist: "#f3f1eb", cloud: "#ebe9e3", moon: "#f8f7f2", glow: "#d8d4c8", petal: "#d9d6d0", face: "#f6f3ec", seal: "#3a3a3a" } },
    },
    textShadow: halo(TONE.paper),
    backdrop: () => TONE.paper,
    css: CSS,
    // The paper is laid by the stage under the print; this pass only marks the backdrop as on.
    paint: (ctx, W, H) => { ctx.clearRect(0, 0, W, H); },
    stage(ctx, S, info) {
      const F = (frame = makeFrame(S, info));
      if (S.paint) ctx.drawImage(tex.paper, 0, 0);
      world(F);
      if (F.plan || !DRAW[info.scene]) compose(ctx, F);
    },
    scenes: { chart: scene("chart"), object: scene("object"), people: scene("people"), process: scene("process"), compare: scene("compare") },
  };
});
