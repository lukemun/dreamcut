// Tarot: an art-nouveau card world. Foxed ivory cards with even ink outlines, muted litho colours
// and gold halos are dealt onto deep velvet; each scene is a spread of original cards whose
// windows hold the drawing (coin towers, robed figures, a gilded oracle, a wax seal, a scale).
// Cards are dealt from a deck, flipped face-up, and swept away to cross between scenes. Velvet
// folds, a slow celestial wheel, drifting gold dust and swaying vines keep every hold alive.
// All art is original. Frames are pure functions of time: seeded noise only, no clocks.
window.DreamcutMotion.register("tarot", ({ rng }) => {
  const PI = Math.PI, TAU = PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const fract = (v) => v - Math.floor(v);
  const SERIF = "'Bodoni 72', 'Didot', 'Playfair Display', 'Hoefler Text', Georgia, serif";
  const LABEL = "'Optima', 'Candara', 'Gill Sans', 'Trebuchet MS', sans-serif";

  // ---- colour --------------------------------------------------------------------------------------
  const rgb = (h) => { const n = parseInt(String(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mixc = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

  // Litho colours: teal, rust, mustard, rose, plum, sage, navy.
  const TONE = {
    v0: "#08201f", v1: "#103b38", v2: "#2f7d70", paper: "#ecdfb9", paperLo: "#c9ae78", paperHi: "#f7efd2", ink: "#2a1e16",
    gold: "#e0ae45", goldHi: "#ffe6a0", goldLo: "#8c6120", deco: "#e8bd5c", back: "#6e2a30", backLo: "#431a22",
    skyTop: "#243e66", skyBot: "#c9856f", cream: "#f6e8bd", glow: "#ffd98a", shade: "#050f10", dust: "#ffe6a8",
    c: ["#3f8179", "#b4532f", "#d0a03a", "#c9857a", "#6a4569", "#8c9d63", "#2f466d"],
    vig: 0.55, fold: 0.16, light: false,
  };

  function prep(T) {
    if (T._r) return T;
    T._r = {};
    for (const k of Object.keys(T)) if (typeof T[k] === "string" && T[k][0] === "#") T._r[k] = rgb(T[k]);
    T._c = T.c.map(rgb);
    return T;
  }

  // ---- the frame's working state -------------------------------------------------------------------
  let cur = null;
  function frameOf(g, S, info) {
    const T = prep(S.look.tone), u = S.u;
    if (cur && cur.S === S && cur.g === g && cur.t === info.t) return cur;
    let R = T._r;
    if (S.accent && S.accent !== S.look.accent) { const ac = rgb(S.accent); R = { ...R, gold: ac, goldHi: mixc(ac, [255, 255, 255], 0.5), glow: mixc(ac, [255, 255, 255], 0.4) }; }
    return (cur = {
      S, g, u, W: S.W, H: S.H, T, R, t: info.t, info, tex: S.look.texture ?? 1, mis: 1.5 * u, k: 1,
      C: (key, a = 1) => rgba(R[key], a),
      CC: (i, a = 1) => rgba(T._c[((i % 7) + 7) % 7], a),
      mixk: (ka, kb, m, a = 1) => rgba(mixc(R[ka], R[kb], m), a),
    });
  }

  // ---- drawing primitives --------------------------------------------------------------------------
  // An outlined, litho-printed shape: the flat colour sits slightly off its ink line.
  function ink(g, F, path, fill, lw = 2.2, keep) {
    if (fill) { g.save(); g.translate(F.mis / F.k, (F.mis * 0.7) / F.k); g.fillStyle = fill; g.fill(path); g.restore(); }
    if (lw > 0) { g.save(); g.lineWidth = (lw * F.u) / F.k; g.lineJoin = "round"; g.lineCap = "round"; g.strokeStyle = keep || F.C("ink", 0.95); g.stroke(path); g.restore(); }
  }
  function hatch(g, F, path, bx, by, bw, bh, ang, step, col, lw = 1) {
    g.save(); g.clip(path);
    g.translate(bx + bw / 2, by + bh / 2); g.rotate(ang);
    const r = Math.hypot(bw, bh) / 2; g.beginPath();
    for (let x = -r; x <= r; x += step * F.u / F.k) { g.moveTo(x, -r); g.lineTo(x, r); }
    g.strokeStyle = col; g.lineWidth = (lw * F.u) / F.k; g.stroke();
    g.restore();
  }
  function say(g, F, s, x, y, size, o = {}) {
    s = String(s ?? ""); if (o.upper) s = s.toUpperCase();
    if (!s) return 0;
    const fam = o.font === "label" ? LABEL : SERIF, wt = o.weight || (o.font === "label" ? 700 : 600);
    let sz = size;
    const set = () => { g.font = `${o.italic ? "italic " : ""}${wt} ${sz}px ${fam}`; g.letterSpacing = (o.track || 0) * sz + "px"; };
    set(); let w = g.measureText(s).width;
    if (o.maxW && w > o.maxW) { sz = Math.max(o.min || size * 0.7, (size * o.maxW) / w); set(); w = g.measureText(s).width; }
    g.textAlign = o.align || "center"; g.textBaseline = o.base || "middle";
    if (o.halo) { g.lineJoin = "round"; g.lineWidth = o.haloW || sz * 0.16; g.strokeStyle = o.halo; g.strokeText(s, x, y); }
    g.fillStyle = o.color; g.fillText(s, x, y); g.letterSpacing = "0px";
    return w;
  }
  const ROMAN = ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

  function star(g, cx, cy, r, n = 4, inner = 0.4, rot = -PI / 2) {
    const p = new Path2D();
    for (let i = 0; i < n * 2; i++) { const a = rot + (i * PI) / n, rr = i % 2 ? r * inner : r; p[i ? "lineTo" : "moveTo"](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    p.closePath(); return p;
  }
  function sparkle(g, F, x, y, r, a, col) {
    if (a <= 0.02) return;
    g.save(); g.globalAlpha *= a; g.fillStyle = col || F.C("goldHi"); g.fill(star(g, x, y, r, 4, 0.18));
    g.beginPath(); g.arc(x, y, r * 0.22, 0, TAU); g.fill(); g.restore();
  }
  function rays(g, F, cx, cy, r0, r1, n, rot, col, w = 0.5) {
    g.fillStyle = col; g.beginPath();
    for (let i = 0; i < n; i++) {
      const a = rot + (i * TAU) / n, da = (TAU / n) * w * 0.5;
      g.moveTo(cx + Math.cos(a - da) * r0, cy + Math.sin(a - da) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.lineTo(cx + Math.cos(a + da) * r0, cy + Math.sin(a + da) * r0);
    }
    g.fill();
  }
  function halo(g, F, cx, cy, r, a, t, seed = 0) {
    if (a <= 0.01) return;
    g.save(); g.globalAlpha *= a;
    const gr = g.createRadialGradient(cx, cy, r * 0.08, cx, cy, r);
    gr.addColorStop(0, F.C("glow", 0.95)); gr.addColorStop(0.35, F.C("gold", 0.38)); gr.addColorStop(1, F.C("gold", 0));
    g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2);
    rays(g, F, cx, cy, r * 0.12, r * (0.82 + Math.sin(t * 1.7 + seed) * 0.05), 18, t * 0.22 + seed, F.C("goldHi", 0.34), 0.34);
    g.restore();
  }
  function leaf(len, wid) {
    const p = new Path2D(); p.moveTo(0, 0); p.quadraticCurveTo(len * 0.45, -wid, len, 0); p.quadraticCurveTo(len * 0.45, wid, 0, 0); return p;
  }
  const LEAF = leaf(1, 0.34);
  // A leafy ring around an oval, swaying a little.
  function laurel(g, F, rx, ry, n, t, seed, ci = 5) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 0.3, side = i % 2 ? 1 : -1;
      const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
      const tan = Math.atan2(Math.cos(a) * ry, -Math.sin(a) * rx);
      const len = 30 * F.u * (0.8 + 0.3 * Math.sin(i * 2.1 + seed)), sway = Math.sin(t * 1.6 + i * 0.7 + seed) * 0.16;
      g.save(); g.translate(x, y); g.rotate(tan + side * 0.75 + sway); g.scale(len, len);
      F.k = len; ink(g, F, LEAF, F.CC(ci + (i % 3 === 0 ? 1 : 0), 0.95), 1.6); F.k = 1;
      g.restore();
      if (i % 4 === 0) { g.beginPath(); g.arc(x + Math.cos(a) * 9 * F.u, y + Math.sin(a) * 9 * F.u, 3.4 * F.u, 0, TAU); g.fillStyle = F.C("gold"); g.fill(); g.lineWidth = 1.2 * F.u; g.strokeStyle = F.C("ink"); g.stroke(); }
    }
  }
  // A swallow-tail ribbon with a label; returns nothing. (x, y) is its centre.
  function ribbon(g, F, x, y, w, h, fillKey = "paperHi", tail = 0.26) {
    const hw = w / 2, hh = h / 2, tl = h * tail;
    const back = new Path2D();
    back.moveTo(x - hw - tl * 1.4, y - hh + h * 0.3); back.lineTo(x - hw + 4 * F.u, y - hh + h * 0.3); back.lineTo(x - hw + 4 * F.u, y + hh + h * 0.3);
    back.lineTo(x - hw - tl * 1.4, y + hh + h * 0.3); back.lineTo(x - hw - tl * 0.7, y + h * 0.3); back.closePath();
    back.moveTo(x + hw + tl * 1.4, y - hh + h * 0.3); back.lineTo(x + hw - 4 * F.u, y - hh + h * 0.3); back.lineTo(x + hw - 4 * F.u, y + hh + h * 0.3);
    back.lineTo(x + hw + tl * 1.4, y + hh + h * 0.3); back.lineTo(x + hw + tl * 0.7, y + h * 0.3); back.closePath();
    ink(g, F, back, F.mixk("paperLo", "ink", 0.2), 2);
    const body = new Path2D(); body.rect(x - hw, y - hh, w, h);
    g.save(); g.shadowColor = "rgba(0,0,0,0.3)"; g.shadowBlur = 8 * F.u; g.shadowOffsetY = 3 * F.u; ink(g, F, body, F.C(fillKey), 2.4); g.restore();
    const ln = new Path2D(); ln.rect(x - hw + 5 * F.u, y - hh + 5 * F.u, w - 10 * F.u, h - 10 * F.u);
    g.lineWidth = 1.3 * F.u; g.strokeStyle = F.C("goldLo", 0.85); g.stroke(ln);
  }
  function glint(g, F, x, y, w, h, t, seed) {
    // A soft diagonal sheen that crosses a shape; callers clip first.
    const k = fract(t * 0.16 + seed * 0.37), cx = lerp(x - w * 0.3, x + w * 1.3, k);
    const gr = g.createLinearGradient(cx - w * 0.2, y, cx + w * 0.2, y + h);
    gr.addColorStop(0, "rgba(255,244,205,0)"); gr.addColorStop(0.5, "rgba(255,244,205,0.22)"); gr.addColorStop(1, "rgba(255,244,205,0)");
    g.fillStyle = gr; g.fillRect(x, y, w, h);
  }

  // ---- emblems -------------------------------------------------------------------------------------
  const SKIN = ["#e8be98", "#cc9368", "#8f5d3e", "#f2d3b2", "#aa7149", "#dba67e"];
  const HAIR = ["#2c1c14", "#6a3d1f", "#c58d3a", "#18141c", "#8b4a2c"];
  function sun(g, F, cx, cy, r, t, face = true) {
    rays(g, F, cx, cy, r * 1.05, r * 1.7, 16, t * 0.3, F.C("gold", 0.95), 0.5);
    rays(g, F, cx, cy, r * 1.05, r * 1.4, 16, -t * 0.3 + 0.2, F.C("goldHi", 0.9), 0.4);
    const d = new Path2D(); d.arc(cx, cy, r, 0, TAU); ink(g, F, d, F.C("gold"), 2.4);
    g.beginPath(); g.arc(cx - r * 0.18, cy - r * 0.2, r * 0.6, 0, TAU); g.fillStyle = "rgba(255,240,180,0.45)"; g.fill();
    if (face) {
      g.strokeStyle = F.C("ink"); g.lineWidth = 2.2 * F.u / F.k; g.lineCap = "round";
      g.beginPath(); g.arc(cx - r * 0.3, cy - r * 0.05, r * 0.12, PI * 1.1, PI * 1.9); g.moveTo(cx + r * 0.42, cy - r * 0.05); g.arc(cx + r * 0.3, cy - r * 0.05, r * 0.12, PI * 1.1, PI * 1.9); g.stroke();
      g.beginPath(); g.arc(cx, cy + r * 0.1, r * 0.3, 0.2, PI - 0.2); g.stroke();
    }
  }
  function moon(g, F, cx, cy, r, t, face = true) {
    const q = new Path2D(); q.arc(cx, cy, r, 0, TAU); q.moveTo(cx - r * 0.42 + r * 0.88, cy - r * 0.08); q.arc(cx - r * 0.42, cy - r * 0.08, r * 0.88, 0, TAU, true);
    g.save(); g.translate(F.mis, F.mis * 0.7); g.fillStyle = F.C("paperHi"); g.fill(q, "evenodd"); g.restore();
    g.save(); g.lineWidth = 2.2 * F.u / F.k; g.lineJoin = "round"; g.strokeStyle = F.C("ink"); g.stroke(q); g.restore();
    if (face) { g.fillStyle = F.C("ink"); g.beginPath(); g.arc(cx + r * 0.52, cy - r * 0.2, r * 0.05, 0, TAU); g.fill(); g.beginPath(); g.arc(cx + r * 0.8, cy + r * 0.12, r * 0.04, 0, TAU); g.fill(); }
    sparkle(g, F, cx - r * 1.1, cy - r * 0.6, r * 0.18, 0.6 + 0.4 * Math.sin(t * 3));
  }
  function eye(g, F, cx, cy, w, t, look = 0, openK = 1) {
    const h = w * 0.34 * openK;
    const almond = new Path2D(); almond.moveTo(cx - w / 2, cy); almond.quadraticCurveTo(cx, cy - h * 1.9, cx + w / 2, cy); almond.quadraticCurveTo(cx, cy + h * 1.9, cx - w / 2, cy); almond.closePath();
    ink(g, F, almond, F.C("paperHi"), 2.6);
    g.save(); g.clip(almond);
    const ix = cx + Math.sin(t * 0.9 + look) * w * 0.13, iy = cy + Math.sin(t * 0.7 + look * 2) * h * 0.18;
    const ir = new Path2D(); ir.arc(ix, iy, h * 1.25, 0, TAU); ink(g, F, ir, F.CC(0), 2.2);
    g.beginPath(); g.arc(ix, iy, h * 0.75, 0, TAU); g.fillStyle = F.C("shade", 0.9); g.fill();
    rays(g, F, ix, iy, h * 0.8, h * 1.2, 14, t * 0.5, F.C("goldHi", 0.55), 0.35);
    g.beginPath(); g.arc(ix - h * 0.35, iy - h * 0.35, h * 0.22, 0, TAU); g.fillStyle = "rgba(255,255,240,0.9)"; g.fill();
    g.restore();
    g.strokeStyle = F.C("ink"); g.lineWidth = 2 * F.u / F.k; g.beginPath();
    for (let i = -3; i <= 3; i++) { const x = cx + (i / 3) * w * 0.4, y = cy - h * 1.35 * (1 - (i / 3) ** 2 * 0.55); g.moveTo(x, y); g.lineTo(x + i * w * 0.02, y - w * 0.09); }
    g.stroke();
  }
  function chalice(g, F, x, y, s, t) {
    const p = new Path2D(); p.moveTo(x - s * 0.36, y - s * 0.55); p.quadraticCurveTo(x - s * 0.34, y - s * 0.05, x, y - s * 0.02); p.quadraticCurveTo(x + s * 0.34, y - s * 0.05, x + s * 0.36, y - s * 0.55); p.closePath();
    const st = new Path2D(); st.rect(x - s * 0.05, y - s * 0.03, s * 0.1, s * 0.3); st.moveTo(x - s * 0.26, y + s * 0.34); st.quadraticCurveTo(x, y + s * 0.2, x + s * 0.26, y + s * 0.34); st.closePath();
    ink(g, F, st, F.C("gold"), 2); ink(g, F, p, F.C("gold"), 2.2);
    g.save(); g.clip(p); g.fillStyle = F.CC(3, 0.95); g.fillRect(x - s * 0.4, y - s * (0.42 + 0.03 * Math.sin(t * 3)), s * 0.8, s * 0.5); g.restore();
    sparkle(g, F, x + s * 0.05, y - s * (0.75 + 0.06 * Math.sin(t * 2)), s * 0.14, 0.7 + 0.3 * Math.sin(t * 4));
  }
  function key(g, F, x, y, s, t) {
    const bow = new Path2D(); bow.arc(x, y - s * 0.4, s * 0.17, 0, TAU); bow.moveTo(x + s * 0.07, y - s * 0.4); bow.arc(x, y - s * 0.4, s * 0.07, 0, TAU, true);
    const sh = new Path2D(); sh.rect(x - s * 0.04, y - s * 0.24, s * 0.08, s * 0.62); sh.rect(x + s * 0.04, y + s * 0.2, s * 0.14, s * 0.07); sh.rect(x + s * 0.04, y + s * 0.32, s * 0.1, s * 0.06);
    ink(g, F, sh, F.C("gold"), 2); ink(g, F, bow, F.C("gold"), 2.2);
    sparkle(g, F, x, y - s * 0.4, s * 0.12, 0.5 + 0.5 * Math.sin(t * 3));
  }
  function lantern(g, F, x, y, s, t) {
    const hang = new Path2D(); hang.moveTo(x - s * 0.12, y - s * 0.34); hang.quadraticCurveTo(x, y - s * 0.62, x + s * 0.12, y - s * 0.34);
    const body = new Path2D(); body.moveTo(x - s * 0.17, y - s * 0.34); body.lineTo(x + s * 0.17, y - s * 0.34); body.lineTo(x + s * 0.21, y + s * 0.12); body.lineTo(x - s * 0.21, y + s * 0.12); body.closePath();
    ink(g, F, hang, null, 2); ink(g, F, body, F.C("paperHi"), 2.2);
    const fl = 1 + Math.sin(t * 9 + 1) * 0.12 + Math.sin(t * 5.3) * 0.08;
    halo(g, F, x, y - s * 0.12, s * 0.55, 0.55, t, 1);
    const f = new Path2D(); f.moveTo(x, y - s * 0.3 * fl); f.quadraticCurveTo(x + s * 0.12, y - s * 0.08, x, y + s * 0.02); f.quadraticCurveTo(x - s * 0.12, y - s * 0.08, x, y - s * 0.3 * fl);
    ink(g, F, f, F.C("gold"), 1.6);
    const bars = new Path2D(); bars.moveTo(x - s * 0.06, y - s * 0.34); bars.lineTo(x - s * 0.09, y + s * 0.12); bars.moveTo(x + s * 0.06, y - s * 0.34); bars.lineTo(x + s * 0.09, y + s * 0.12);
    ink(g, F, bars, null, 1.4);
  }
  function scrollRoll(g, F, x, y, s, t) {
    const sheet = new Path2D(); sheet.rect(x - s * 0.22, y - s * 0.3, s * 0.44, s * 0.6);
    ink(g, F, sheet, F.C("paperHi"), 2);
    g.strokeStyle = F.C("ink", 0.7); g.lineWidth = 1.4 * F.u / F.k; g.beginPath();
    for (let i = 0; i < 5; i++) { g.moveTo(x - s * 0.15, y - s * 0.2 + i * s * 0.11); g.lineTo(x + s * (0.15 - (i % 2) * 0.07), y - s * 0.2 + i * s * 0.11); } g.stroke();
    for (const dy of [-0.3, 0.3]) { const r = new Path2D(); r.rect(x - s * 0.27, y + s * dy - s * 0.04, s * 0.54, s * 0.08); ink(g, F, r, F.CC(1), 1.8); }
    const hl = fract(t * 0.5); sparkle(g, F, x - s * 0.15 + hl * s * 0.3, y - s * 0.2 + Math.floor(hl * 5) * s * 0.11, s * 0.09, 0.9);
  }
  function compass(g, F, x, y, s, t) {
    const ring = new Path2D(); ring.arc(x, y, s * 0.26, 0, TAU); ink(g, F, ring, F.C("paperHi"), 2.2);
    const rim = new Path2D(); rim.arc(x, y, s * 0.2, 0, TAU); g.lineWidth = 1.3 * F.u / F.k; g.strokeStyle = F.C("goldLo"); g.stroke(rim);
    g.save(); g.translate(x, y); g.rotate(Math.sin(t * 1.3) * 1.2 + t * 0.3);
    const n = new Path2D(); n.moveTo(0, -s * 0.22); n.lineTo(s * 0.05, 0); n.lineTo(-s * 0.05, 0); n.closePath(); ink(g, F, n, F.CC(1), 1.6);
    const sN = new Path2D(); sN.moveTo(0, s * 0.22); sN.lineTo(s * 0.05, 0); sN.lineTo(-s * 0.05, 0); sN.closePath(); ink(g, F, sN, F.CC(6), 1.6);
    g.restore();
  }
  function staffStar(g, F, x, y, s, t) {
    const pole = new Path2D(); pole.rect(x - s * 0.025, y - s * 0.3, s * 0.05, s * 0.78); ink(g, F, pole, F.C("goldLo"), 1.8);
    halo(g, F, x, y - s * 0.42, s * 0.5, 0.6, t, 2);
    const st = star(g, x, y - s * 0.42, s * 0.2, 5, 0.45, -PI / 2 + Math.sin(t * 1.5) * 0.2); ink(g, F, st, F.C("goldHi"), 2);
  }
  const ATTR = [staffStar, key, lantern, scrollRoll, chalice, compass];

  // A robed figure in a tarot-card pose: halo, cape, robe, a raised attribute.
  function person(g, F, cx, base, hgt, v, t, hot, tilt = 0) {
    const kk = hgt / 100;
    g.save(); g.translate(cx, base); g.scale(kk, kk); F.k = kk;
    const sway = Math.sin(t * 1.5 + v * 1.3);
    const robe = (v * 2) % 7, cape = (v * 2 + 3) % 7;
    const hem = (x, ph) => Math.sin(x * 0.28 + t * 2.4 + v + ph) * 1.8;
    // Gold halo behind the head.
    halo(g, F, 0, -66, hot ? 62 : 44, hot ? 0.95 : 0.55, t, v);
    const hr = new Path2D(); hr.arc(0, -66, 19, 0, TAU); g.save(); g.lineWidth = 3 * F.u / kk; g.strokeStyle = F.C("gold"); g.stroke(hr); g.restore();
    // Cape behind.
    const cp = new Path2D(); cp.moveTo(-10, -57); cp.bezierCurveTo(-26, -52, -38, -20, -41 + sway, 0); for (let x = -41; x <= 41; x += 6) cp.lineTo(x + sway * (x < 0 ? 1 : -1) * 0.5, 2 + hem(x, 1.5));
    cp.bezierCurveTo(38, -20, 26, -52, 10, -57); cp.closePath();
    ink(g, F, cp, F.CC(cape, 0.97), 2.2); hatch(g, F, cp, -42, -58, 84, 62, 0.9, 5, F.C("shade", 0.18), 0.9);
    // Robe.
    const rb = new Path2D(); rb.moveTo(-8, -58); rb.quadraticCurveTo(-17, -55, -18, -46); rb.bezierCurveTo(-19, -28, -31, -12, -28, 0 + hem(-28, 0));
    for (let x = -28; x <= 28; x += 4) rb.lineTo(x, hem(x, 0)); rb.bezierCurveTo(31, -12, 19, -28, 18, -46); rb.quadraticCurveTo(17, -55, 8, -58); rb.closePath();
    ink(g, F, rb, F.CC(robe), 2.4); hatch(g, F, rb, -30, -58, 60, 60, -0.6, 4.5, F.C("shade", 0.2), 0.9);
    // Trim, belt, chest star.
    const trim = new Path2D(); for (let x = -27; x <= 27; x += 4) trim[x === -27 ? "moveTo" : "lineTo"](x, -3 + hem(x, 0));
    g.save(); g.lineWidth = 2.4 * F.u / kk; g.strokeStyle = F.C("gold"); g.stroke(trim); g.restore();
    const belt = new Path2D(); belt.moveTo(-18.5, -34); belt.quadraticCurveTo(0, -30, 18.5, -34); g.save(); g.lineWidth = 3 * F.u / kk; g.strokeStyle = F.C("gold"); g.stroke(belt); g.restore();
    ink(g, F, star(g, 0, -45, 5.5, 4, 0.4), F.C("goldHi"), 1.2);
    // Arms: one down, one raised to hold the attribute.
    const sleeve = (pts, col) => {
      const p = new Path2D(); p.moveTo(pts[0], pts[1]); p.quadraticCurveTo(pts[2], pts[3], pts[4], pts[5]);
      g.save(); g.lineCap = "round"; g.lineWidth = 11 * F.u / kk; g.strokeStyle = F.C("ink"); g.stroke(p); g.lineWidth = 7.4 * F.u / kk; g.strokeStyle = col; g.stroke(p); g.restore();
    };
    sleeve([-15, -50, -28, -38, -26 + sway * 0.8, -22], F.CC(robe)); sleeve([15, -50, 30, -44, 31, -33 + sway], F.CC(robe));
    for (const [hx, hy] of [[-26 + sway * 0.8, -21], [31, -32 + sway]]) { const hd = new Path2D(); hd.arc(hx, hy, 4.2, 0, TAU); ink(g, F, hd, SKINC(v), 1.8); }
    // The held attribute.
    ATTR[v % 6](g, F, 31, -52 + sway, 58, t + v);
    // Neck, head, hair, face.
    const nk = new Path2D(); nk.rect(-3.6, -60, 7.2, 7); ink(g, F, nk, SKINC(v), 1.6);
    const hairCol = HAIRC(v);
    const style = v % 3;
    if (style === 0) { const hp = new Path2D(); hp.moveTo(-12, -68); hp.bezierCurveTo(-18, -58, -15, -46, -11 + sway * 0.6, -41); hp.lineTo(-4, -45); hp.lineTo(4, -45); hp.lineTo(11 + sway * 0.6, -41); hp.bezierCurveTo(15, -46, 18, -58, 12, -68); hp.closePath(); ink(g, F, hp, hairCol, 2); }
    if (style === 1) { const bn = new Path2D(); bn.arc(0, -82, 6.5 + Math.sin(t * 2) * 0.2, 0, TAU); ink(g, F, bn, hairCol, 2); }
    const head = new Path2D(); head.ellipse(0, -66, 10, 11.2, 0, 0, TAU); ink(g, F, head, SKINC(v), 2.2);
    const cap = new Path2D(); cap.ellipse(0, -66, 10.6, 11.7, 0, PI * 1.02, PI * 1.98); cap.bezierCurveTo(6, -72, -4, -73, -10.4, -67);
    ink(g, F, cap, hairCol, 2);
    const blink = fract(t / 3.1 + v * 0.29) < 0.05;
    g.strokeStyle = F.C("ink"); g.fillStyle = F.C("ink"); g.lineWidth = 1.6 * F.u / kk; g.lineCap = "round";
    for (const ex of [-4.2, 4.2]) { if (blink) { g.beginPath(); g.arc(ex, -65, 2, 0.15, PI - 0.15); g.stroke(); } else { g.beginPath(); g.arc(ex, -65.4, 1.5, 0, TAU); g.fill(); } }
    g.beginPath(); g.arc(0, -61, 2.8, 0.25, PI - 0.25); g.stroke();
    g.fillStyle = F.CC(3, 0.5); g.beginPath(); g.arc(-6.4, -62, 2.2, 0, TAU); g.arc(6.4, -62, 2.2, 0, TAU); g.fill();
    g.restore(); F.k = 1;
  }
  const SKINC = (v) => SKIN[v % 6], HAIRC = (v) => HAIR[v % 5];

  // A coin: gold or bronze, with an embossed star on the top face.
  function coin(g, F, cx, cy, r, sq, thick, key, spin = 1, shine = 0) {
    const rx = r * spin, ry = r * sq;
    const side = new Path2D(); side.moveTo(cx - rx, cy); side.lineTo(cx - rx, cy + thick); side.ellipse(cx, cy + thick, Math.max(0.5, rx), ry, 0, PI, 0, true); side.lineTo(cx + rx, cy); side.closePath();
    ink(g, F, side, F.mixk(key, "ink", 0.38), 2);
    g.save(); g.clip(side); g.strokeStyle = F.mixk(key, "ink", 0.6, 0.55); g.lineWidth = 1.2 * F.u; g.beginPath();
    for (let i = -6; i <= 6; i++) { g.moveTo(cx + (i / 6) * rx, cy); g.lineTo(cx + (i / 6) * rx, cy + thick + ry); } g.stroke(); g.restore();
    const top = new Path2D(); top.ellipse(cx, cy, Math.max(0.5, rx), ry, 0, 0, TAU);
    ink(g, F, top, F.C(key), 2.2);
    g.save(); g.clip(top);
    const hi = g.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry); hi.addColorStop(0, "rgba(255,246,210,0.55)"); hi.addColorStop(0.5, "rgba(255,246,210,0)"); hi.addColorStop(1, "rgba(60,30,0,0.28)");
    g.fillStyle = hi; g.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
    if (shine > 0) { g.fillStyle = `rgba(255,252,225,${0.8 * shine})`; g.beginPath(); g.ellipse(cx + (shine - 0.5) * rx, cy, rx * 0.12, ry * 0.9, 0.5, 0, TAU); g.fill(); }
    g.restore();
    const ring = new Path2D(); ring.ellipse(cx, cy, Math.max(0.4, rx * 0.72), ry * 0.72, 0, 0, TAU); g.lineWidth = 1.4 * F.u; g.strokeStyle = F.mixk(key, "ink", 0.5, 0.8); g.stroke(ring);
    g.save(); g.translate(cx, cy); g.scale(Math.max(0.05, spin), sq); g.fillStyle = F.mixk(key, "ink", 0.45, 0.85); g.fill(star(g, 0, 0, r * 0.4, 8, 0.45, 0)); g.restore();
  }

  // ---- the card ------------------------------------------------------------------------------------
  // Corners are cut inward in quarter circles, as on a printed deck.
  function cardPath(w, h, r) {
    const x = -w / 2, y = -h / 2, p = new Path2D();
    p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.arc(x + w, y, r, PI, PI / 2, true);
    p.lineTo(x + w, y + h - r); p.arc(x + w, y + h, r, -PI / 2, PI, true);
    p.lineTo(x + r, y + h); p.arc(x, y + h, r, 0, -PI / 2, true);
    p.lineTo(x, y + r); p.arc(x, y, r, PI / 2, 0, true); p.closePath(); return p;
  }
  const FOX = {};
  function foxing(seed) {
    if (FOX[seed]) return FOX[seed];
    const r = rng(seed * 977 + 13), a = [];
    for (let i = 0; i < 30; i++) {
      let x = r() - 0.5, y = r() - 0.5;
      if (i % 3) { x *= 1.18; y *= 1.12; }
      a.push({ x, y, r: 0.015 + r() * r() * 0.12, a: 0.06 + r() * 0.2 });
    }
    return (FOX[seed] = a);
  }
  const textW = (g, s, size, font, track) => { g.font = `${font === "label" ? 700 : 600} ${size}px ${font === "label" ? LABEL : SERIF}`; g.letterSpacing = track * size + "px"; const w = g.measureText(s).width; g.letterSpacing = "0px"; return w; };

  function cardBack(g, F, w, h, r, path, seed, t) {
    const u = F.u, mn = Math.min(w, h), m = mn * 0.06;
    const gr = g.createRadialGradient(0, 0, mn * 0.1, 0, 0, Math.hypot(w, h) * 0.55);
    gr.addColorStop(0, F.C("back")); gr.addColorStop(1, F.C("backLo"));
    g.fillStyle = gr; g.fill(path);
    g.save(); g.clip(path);
    const inner = cardPath(w - m * 2, h - m * 2, r * 0.6);
    g.save(); g.clip(inner);
    g.strokeStyle = F.C("deco", 0.34); g.lineWidth = 1.3 * u; g.beginPath();
    const st = 40 * u;
    for (let i = -w / st - h / st; i < w / st + h / st; i++) { g.moveTo(-w / 2 + i * st, -h / 2); g.lineTo(-w / 2 + i * st + h, h / 2); g.moveTo(-w / 2 + i * st + h, -h / 2); g.lineTo(-w / 2 + i * st, h / 2); }
    g.stroke();
    g.fillStyle = F.C("deco", 0.55);
    for (let ix = -Math.ceil(w / st / 2); ix <= w / st / 2; ix++) for (let iy = -Math.ceil(h / st / 2); iy <= h / st / 2; iy++) { g.beginPath(); g.arc(ix * st, iy * st + st * 0, 2.6 * u, 0, TAU); g.fill(); }
    g.restore();
    const med = mn * 0.3;
    g.fillStyle = F.C("backLo", 0.96); g.beginPath(); g.arc(0, 0, med * 1.12, 0, TAU); g.fill();
    rays(g, F, 0, 0, med * 0.5, med * 1.08, 16, t * 0.25 + seed, F.C("deco", 0.85), 0.46);
    for (const [rr, lw] of [[med * 1.12, 2.6], [med * 0.5, 2]]) { g.beginPath(); g.arc(0, 0, rr, 0, TAU); g.lineWidth = lw * u; g.strokeStyle = F.C("deco", 0.95); g.stroke(); }
    ink(g, F, star(g, 0, 0, med * 0.4, 8, 0.42, t * 0.2), F.C("goldHi"), 1.8);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.fillStyle = F.C("deco", 0.9); g.fill(star(g, sx * (w / 2 - m * 2.2), sy * (h / 2 - m * 2.2), m * 0.9, 4, 0.3)); }
    g.restore();
    g.lineWidth = 2 * u; g.strokeStyle = F.C("cream", 0.9); g.stroke(inner);
    g.lineWidth = 1.2 * u; g.strokeStyle = F.C("deco", 0.9); g.stroke(cardPath(w - m * 3.2, h - m * 3.2, r * 0.45));
    ink(g, F, path, null, 3.4);
  }

  function windowPath(shape, ww, wh, cy, u) {
    const p = new Path2D();
    if (shape === "tab") {
      const x = -ww / 2, y = cy - wh / 2, r = Math.min(ww, wh) * 0.07;
      p.moveTo(x + r, y); p.lineTo(x + ww - r, y); p.arc(x + ww, y, r, PI, PI / 2, true); p.lineTo(x + ww, y + wh - r); p.arc(x + ww, y + wh, r, -PI / 2, PI, true);
      p.lineTo(x + r, y + wh); p.arc(x, y + wh, r, 0, -PI / 2, true); p.lineTo(x, y + r); p.arc(x, y, r, PI / 2, 0, true); p.closePath();
    } else p.ellipse(0, cy, ww / 2, wh / 2, 0, 0, TAU);
    return p;
  }

  function cardFace(g, F, w, h, r, path, o, art) {
    const u = F.u, t = F.t, mn = Math.min(w, h), m = mn * 0.055, seed = o.seed || 1, ci = o.ci ?? 0;
    const pg = g.createRadialGradient(0, -h * 0.08, mn * 0.08, 0, 0, Math.hypot(w, h) * 0.58);
    pg.addColorStop(0, F.C("paperHi")); pg.addColorStop(0.7, F.C("paper")); pg.addColorStop(1, F.C("paperLo"));
    g.fillStyle = pg; g.fill(path);
    g.save(); g.clip(path);
    const tx = F.tex;
    for (const f of o.lite ? [] : foxing(seed)) {
      const rr = f.r * mn * 1.4, gx = f.x * w, gy = f.y * h, fg = g.createRadialGradient(gx, gy, 0, gx, gy, rr);
      fg.addColorStop(0, `rgba(150,96,44,${f.a * tx})`); fg.addColorStop(1, "rgba(150,96,44,0)"); g.fillStyle = fg; g.fillRect(gx - rr, gy - rr, rr * 2, rr * 2);
    }
    g.lineWidth = 30 * u; g.strokeStyle = F.C("paperLo", 0.5 * (0.4 + 0.6 * tx)); g.stroke(path);
    const rn = rng(seed * 31 + 7); g.strokeStyle = F.C("ink", 0.1 * tx); g.lineWidth = 1 * u; g.beginPath();
    for (let i = 0; i < (o.lite ? 0 : 46); i++) { const x = (rn() - 0.5) * w, y = (rn() - 0.5) * h, a = rn() * TAU, l = (6 + rn() * 14) * u; g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5, y + Math.sin(a) * l, x + Math.cos(a) * l, y + Math.sin(a) * l * 0.4); }
    g.stroke(); g.restore();
    ink(g, F, path, null, 3.4);
    // Borders.
    const b1 = cardPath(w - m * 2, h - m * 2, r * 0.6), b2 = cardPath(w - m * 3.2, h - m * 3.2, r * 0.4);
    g.lineWidth = 2.2 * u; g.strokeStyle = F.C("ink", 0.9); g.stroke(b1);
    g.lineWidth = 1.6 * u; g.strokeStyle = F.C("goldLo", 0.95); g.stroke(b2);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const px = sx * (w / 2 - m * 1.6), py = sy * (h / 2 - m * 1.6); ink(g, F, star(g, px, py, m * 0.62, 4, 0.34), F.C("gold"), 1.1); }
    // Bands: numeral above, ribbon below.
    const tb = h >= 430 && o.numeral ? 62 * u : 0, bb = o.label ? 96 * u : 26 * u;
    const ww = w - m * 2 - 30 * u, wy0 = -h / 2 + m * 1.8 + 12 * u + tb, wy1 = h / 2 - m * 1.8 - 12 * u - bb, wh = wy1 - wy0, wcy = (wy0 + wy1) / 2;
    if (tb) {
      const nw = Math.max(70 * u, textW(g, o.numeral, 40 * u, "serif", 0.05) + 40 * u);
      const nb = new Path2D(); nb.moveTo(-nw / 2, -h / 2 + m * 1.8 + 6 * u); nb.lineTo(nw / 2, -h / 2 + m * 1.8 + 6 * u); nb.lineTo(nw / 2 + 10 * u, -h / 2 + m * 1.8 + 30 * u); nb.lineTo(nw / 2, -h / 2 + m * 1.8 + 54 * u); nb.lineTo(-nw / 2, -h / 2 + m * 1.8 + 54 * u); nb.lineTo(-nw / 2 - 10 * u, -h / 2 + m * 1.8 + 30 * u); nb.closePath();
      ink(g, F, nb, F.CC(ci, 0.9), 2);
      say(g, F, o.numeral, 0, -h / 2 + m * 1.8 + 31 * u, 40 * u, { color: F.C("cream"), track: 0.05 });
    }
    // Spandrel field behind the window.
    const field = new Path2D(); field.rect(-ww / 2, wy0, ww, wh);
    g.save(); g.fillStyle = F.mixk("paperLo", "ink", 0.15); g.fill(field); g.fillStyle = F.CC(ci, 0.45); g.fill(field);
    g.clip(field); g.strokeStyle = F.C("ink", 0.14); g.lineWidth = 1 * u; g.beginPath();
    for (let x = -ww; x < ww + wh; x += 14 * u) { g.moveTo(-ww / 2 + x, wy0); g.lineTo(-ww / 2 + x - wh, wy1); } g.stroke();
    const rs = rng(seed * 13 + 5); for (let i = 0; i < 9; i++) sparkle(g, F, (rs() - 0.5) * ww, wy0 + rs() * wh, (4 + rs() * 5) * u, 0.5 + 0.5 * Math.sin(t * 2 + i * 1.9), F.C("goldHi", 0.9));
    g.restore();
    // The window itself.
    const shape = o.win || "oval", wpath = windowPath(shape, ww * (shape === "oval" ? 0.9 : 0.98), wh * (shape === "oval" ? 0.96 : 0.98), wcy, u);
    const win = { x: -ww / 2, y: wy0, w: ww, h: wh, cx: 0, cy: wcy, s: Math.min(ww, wh), path: wpath };
    g.save(); g.clip(wpath);
    const sk = g.createLinearGradient(0, wy0, 0, wy1);
    sk.addColorStop(0, o.skyTop || F.mixk("skyTop", "ink", 0.0)); sk.addColorStop(1, o.skyBot || F.C("skyBot"));
    g.fillStyle = sk; g.fillRect(-ww / 2, wy0, ww, wh);
    // Faint sky stars and slow rays behind whatever the art draws.
    rays(g, F, 0, wy0 + wh * 0.72, wh * 0.1, wh * 1.2, 22, t * 0.06 + seed, "rgba(255,236,170,0.12)", 0.4);
    const rsk = rng(seed * 5 + 1); for (let i = 0; i < 14; i++) sparkle(g, F, (rsk() - 0.5) * ww, wy0 + rsk() * wh * 0.7, (3 + rsk() * 4) * u, 0.25 + 0.6 * Math.abs(Math.sin(t * 1.4 + i * 2.3)), F.C("cream"));
    if (art) art(g, win);
    const vg = g.createRadialGradient(0, wcy, Math.min(ww, wh) * 0.3, 0, wcy, Math.max(ww, wh) * 0.75); vg.addColorStop(0, "rgba(10,8,6,0)"); vg.addColorStop(1, "rgba(10,8,6,0.4)");
    g.fillStyle = vg; g.fillRect(-ww / 2, wy0, ww, wh);
    g.restore();
    g.lineWidth = 4 * u; g.strokeStyle = F.C("ink"); g.stroke(wpath);
    const wo = windowPath(shape, ww * (shape === "oval" ? 0.9 : 0.98) + 14 * u, wh * (shape === "oval" ? 0.96 : 0.98) + 14 * u, wcy, u);
    g.lineWidth = 2 * u; g.strokeStyle = F.C("gold"); g.stroke(wo);
    if (shape === "oval" && o.laurel !== false && !o.lite) { g.save(); g.translate(0, wcy); laurel(g, F, ww * 0.45 + 12 * u, wh * 0.48 + 12 * u, Math.round(10 + ww / (26 * u)), t, seed, 5); g.restore(); }
    // Label ribbon.
    if (o.label) {
      const fs = 42 * u, lw = Math.min(textW(g, String(o.label).toUpperCase(), fs, "label", 0.07) + 60 * u, w * 1.18), rw = Math.max(w * 0.8, lw);
      const ry = h / 2 - m * 1.8 - 12 * u - bb / 2 + 8 * u;
      ribbon(g, F, 0, ry, rw, 64 * u, o.hot ? "goldHi" : "paperHi");
      say(g, F, o.label, 0, ry + 2 * u, fs, { font: "label", upper: true, color: F.C("ink"), track: 0.07, maxW: rw - 36 * u, min: 38 * u });
    }
    g.save(); g.clip(path); glint(g, F, -w / 2, -h / 2, w, h, t, seed); g.restore();
  }

  function card(g, F, cx, cy, w, h, o = {}, art) {
    const alpha = o.alpha ?? 1;
    if (alpha <= 0.01) return;
    const flip = o.flip ?? 1, sx = Math.abs(Math.cos(flip * PI)), face = flip >= 0.5;
    g.save(); g.globalAlpha *= alpha; g.translate(cx, cy); g.rotate(o.rot || 0);
    const sc = (o.sc ?? 1) * (1 + 0.08 * Math.sin(clamp(flip, 0, 1) * PI)); g.scale(sc, sc);
    if (o.glow > 0.01) halo(g, F, 0, 0, Math.max(w, h) * 0.9, o.glow, F.t, o.seed || 0);
    g.scale(Math.max(0.025, sx), 1);
    const r = Math.min(w, h) * 0.07, path = cardPath(w, h, r);
    g.save(); g.shadowColor = "rgba(0,0,0,0.55)"; g.shadowBlur = 28 * F.u; g.shadowOffsetY = 10 * F.u; g.fillStyle = F.C("paperLo"); g.fill(path); g.restore();
    if (face) cardFace(g, F, w, h, r, path, o, art); else cardBack(g, F, w, h, r, path, o.seed || 1, F.t);
    g.restore();
  }

  // Cards fly to a place in the layout; slots lay them out in rows.
  function slots(box, n, ratio, cols, cap = 1) {
    cols = cols || n; const rows = Math.ceil(n / cols), cw = box.w / cols, ch = box.h / rows;
    const h = Math.min(ch * 0.96 * cap, (cw * 0.9) / ratio), w = h * ratio, out = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols), c = i % cols, cnt = Math.min(cols, n - r * cols);
      out.push({ cx: box.x + (cols - cnt) * cw * 0.5 + (c + 0.5) * cw, cy: box.y + (r + 0.5) * ch, w, h });
    }
    return out;
  }
  // The drawing area reaches up toward the headline so cards fill the frame.
  const grow = (F, box) => { const up = (F.W > F.H ? 70 : 140) * F.u, dn = 18 * F.u; return { x: box.x, y: box.y - up, w: box.w, h: box.h + up + dn }; };
  // Where a card is while it is dealt in (lp 0 to 1) and swept out (k 0 to 1).
  // The stage runs first each frame; scene drawers read which scene comes next from it.
  let CUR = null, OUTDECK = false;
  const EXTRA_ROLES = ["Reviewer", "Client", "Producer"];
  // A spread leaves across two windows: the last `change` seconds of its own hold (while its headline
  // frosts out) and the first `change` seconds of the next (drawn by the overlap pass), so the outgoing
  // cards are still lifting away while the next spread is being dealt. Returns 0..1 over that span.
  function outK(info) {
    if (info.exit !== undefined) { OUTDECK = !!CUR && CUR.scene === "closing"; return 0.5 + 0.5 * info.exit; }
    const nx = CUR && CUR.next; OUTDECK = nx === "closing";
    if (!nx) return 0;
    return 0.5 * seg(info.local, info.hold - info.change, info.hold);
  }
  // Deal from the first frame of the scene instead of waiting out the headline's entrance.
  const earlyP = (info, p) => Math.max(p, clamp((info.local + 0.05) / Math.max(0.6, info.hold * 0.55)));
  function pose(F, box, slot, lp, k, i, n) {
    const { W, H, u, t } = F;
    const e1 = eo(seg(lp, 0, 0.5)), fl = eio(seg(lp, 0.3, 0.72)), cp = eo(seg(lp, 0.62, 1));
    const deck = { x: W + 40 * u, y: H + 90 * u };
    let x = lerp(deck.x, slot.cx, e1), y = lerp(deck.y, slot.cy, e1) - Math.sin(e1 * PI) * H * 0.07;
    let rot = lerp(0.9, Math.sin(i * 1.9) * 0.022, e1) + Math.sin(t * 0.8 + i) * 0.007;
    y += Math.sin(t * 1.15 + i * 1.3) * 5 * u * e1;
    let alpha = clamp(lp * 6), sc = 1, flip = fl;
    if (k > 0 && OUTDECK) {
      // Gathered back into the deck, face down, clearing the middle band before the closing line lands.
      const kk = eio(seg(k, 0.16 + (i / n) * 0.2, 0.16 + (i / n) * 0.2 + 0.5));
      x = lerp(x, W + slot.w * 0.2 - (n - 1 - i) * 18 * u, kk); y = lerp(y, H + slot.h * 0.75, kk) - Math.sin(kk * PI) * 30 * u;
      rot = lerp(rot, -0.38 + i * 0.03, kk); sc = 1 - kk * 0.35; flip = fl * (1 - eio(seg(kk, 0, 0.4))); alpha *= 1 - seg(kk, 0.85, 1);
    } else if (k > 0) {
      // A small lift while the headline frosts out, then the fly-off while the next spread is dealt.
      const lift = eo(seg(k, 0, 0.45)); y -= lift * 26 * u; rot += lift * 0.04 * (i % 2 ? 1 : -1); sc = 1 + lift * 0.03;
      const kk = eio(seg(k, 0.3 + (i / n) * 0.16, 0.3 + (i / n) * 0.16 + 0.56));
      x = lerp(x, -slot.w * 1.1 - (n - 1 - i) * 30 * u, kk); y = lerp(y, slot.cy - H * 0.1, kk) - Math.sin(kk * PI) * 50 * u; rot += kk * -1.2 * (i % 2 ? 1 : -0.7); sc *= 1 - kk * 0.25; alpha *= 1 - seg(kk, 0.8, 1);
    }
    return { x, y, rot, alpha, sc, flip, cp, e1 };
  }

  // ---- illustration helpers used inside card windows -----------------------------------------------
  function emblem(g, F, kind, cx, cy, s, t) {
    switch (kind % 7) {
      case 0: sun(g, F, cx, cy, s * 0.26, t); break;
      case 1: moon(g, F, cx, cy, s * 0.3, t); break;
      case 2: eye(g, F, cx, cy, s * 0.8, t, kind); break;
      case 3: chalice(g, F, cx, cy + s * 0.06, s * 0.8, t); break;
      case 4: key(g, F, cx, cy, s * 0.9, t); break;
      case 5: { halo(g, F, cx, cy, s * 0.5, 0.8, t, kind); ink(g, F, star(g, cx, cy, s * 0.3, 8, 0.42, t * 0.4), F.C("goldHi"), 2.2); break; }
      default: {
        const r = s * 0.3; g.save(); g.translate(cx, cy); g.rotate(t * 0.7);
        const ring = new Path2D(); ring.arc(0, 0, r, 0, TAU); ink(g, F, ring, F.C("paperHi"), 2.4);
        g.strokeStyle = F.C("ink"); g.lineWidth = 2 * F.u; g.beginPath(); for (let i = 0; i < 8; i++) { g.moveTo(0, 0); g.lineTo(Math.cos((i * TAU) / 8) * r, Math.sin((i * TAU) / 8) * r); } g.stroke();
        for (let i = 0; i < 8; i++) { const o = new Path2D(); o.arc(Math.cos((i * TAU) / 8) * r * 1.12, Math.sin((i * TAU) / 8) * r * 1.12, r * 0.1, 0, TAU); ink(g, F, o, F.CC(i), 1.6); }
        const hub = new Path2D(); hub.arc(0, 0, r * 0.18, 0, TAU); ink(g, F, hub, F.C("gold"), 2); g.restore();
      }
    }
  }
  // A banner string between two points that sags and swings.
  function thread(g, F, ax, ay, bx, by, sag, a, charm, seed) {
    if (a <= 0.02) return;
    const mx = (ax + bx) / 2, my = (ay + by) / 2 + sag + Math.sin(F.t * 1.3 + seed) * 4 * F.u;
    g.save(); g.globalAlpha *= a; g.lineCap = "round";
    const p = new Path2D(); p.moveTo(ax, ay); p.quadraticCurveTo(mx, my + sag * 0.5, bx, by);
    g.lineWidth = 4 * F.u; g.strokeStyle = F.C("ink", 0.8); g.stroke(p);
    g.lineWidth = 2.2 * F.u; g.strokeStyle = F.C("gold"); g.stroke(p);
    if (charm) {
      const cx = lerp(ax, bx, 0.5) * 0.5 + mx * 0.5, cy = (ay * 0.25 + (my + sag * 0.5) * 0.5 + by * 0.25);
      g.save(); g.translate(cx, cy); g.rotate(Math.sin(F.t * 1.9 + seed) * 0.25);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 22 * F.u); g.lineWidth = 2 * F.u; g.strokeStyle = F.C("gold"); g.stroke();
      ink(g, F, star(g, 0, 40 * F.u, 17 * F.u, 5, 0.45), F.C("goldHi"), 1.8); g.restore();
    }
    g.restore();
  }
  const quad = (a, c, e, s) => [(1 - s) * (1 - s) * a[0] + 2 * (1 - s) * s * c[0] + s * s * e[0], (1 - s) * (1 - s) * a[1] + 2 * (1 - s) * s * c[1] + s * s * e[1]];

  // ---- chart: coin towers on four cards ------------------------------------------------------------
  function tower(g, F, win, value, max, cp, hot, i, d) {
    const { u, t } = F, ground = win.y + win.h * 0.9, usable = ground - (win.y + win.h * 0.5), step = usable / 9.6;
    const cr = Math.min(win.w * 0.27, step * 2.6), sq = 0.3, thick = step * 0.9, key = hot ? "gold" : "bronze";
    // plinth
    const pl = new Path2D(); pl.ellipse(0, ground + thick * 0.2, cr * 1.5, cr * 0.42, 0, 0, TAU); ink(g, F, pl, F.mixk("paperLo", "ink", 0.35), 2.2);
    const pl2 = new Path2D(); pl2.ellipse(0, ground - thick * 0.1, cr * 1.25, cr * 0.36, 0, 0, TAU); ink(g, F, pl2, F.mixk("paperLo", "ink", 0.15), 2.2);
    const coins = value > 0 ? Math.max(0.6, (value / max) * 9) * cp : 0, n = Math.ceil(coins);
    let topY = ground, topX = 0;
    for (let k = 0; k < n; k++) {
      const ck = clamp(coins - k), drop = (1 - eo(ck)) * 90 * u, sway = Math.sin(t * 1.3 + i + k * 0.45) * (1.5 + k * 0.35) * u;
      const y = ground - (k + 1) * step - drop, top = k === n - 1 && cp >= 1;
      const spin = top ? clamp(Math.abs(Math.cos(t * 1.9 + i * 1.3)), 0.3, 1) : 1;
      const sh = fract(t * 0.55 - k * 0.07 + i * 0.21); g.save(); g.globalAlpha *= clamp(ck * 3);
      coin(g, F, sway, y, cr, sq, thick, key, spin, sh < 0.3 ? sh / 0.3 : 0); g.restore();
      topY = y - cr * sq; topX = sway;
    }
    if (cp > 0.9) {
      const s = 1 + Math.sin(t * 3 + i) * 0.15;
      if (hot) halo(g, F, topX, topY - 28 * u, win.w * 0.4, 0.8, t, i);
      g.save(); g.translate(topX, topY - 28 * u); g.scale(s, s); ink(g, F, star(g, 0, 0, 20 * u, hot ? 8 : 4, 0.35, t * 0.5), F.C("goldHi"), 1.8); g.restore();
    }
    const label = window.DreamcutMotion.formatNumber(value * cp, 0, d.prefix, d.suffix);
    say(g, F, label, 0, win.y + win.h * 0.2, 104 * u, { color: hot ? F.C("goldHi") : F.C("cream"), halo: F.C("ink", 0.92), haloW: 12 * u, maxW: win.w * 0.92, min: 80 * u });
  }

  function chart(ctx, S, box, p, d, info) {
    p = earlyP(info, p);
    const F = frameOf(ctx, S, info), g = ctx, { u, t } = F, n = d.values.length, vertical = box.h > box.w * 0.9, k = outK(info);
    box = grow(F, box);
    const sl = slots(box, n, 0.6, vertical && n > 2 ? 2 : n, 1), mx = Math.max(...d.values, 1);
    const po = sl.map((s, i) => pose(F, box, s, clamp((p - (i / n) * 0.5) / 0.5), k, i, n));
    // Banner string and charms between neighbours.
    const cols = vertical && n > 2 ? 2 : n;
    for (let i = 0; i < n - 1; i++) {
      if ((i + 1) % cols === 0) continue;
      const a = po[i], b = po[i + 1], A = sl[i], B = sl[i + 1];
      thread(g, F, a.x + A.w * 0.34 * Math.cos(a.rot), a.y - A.h * 0.5 + 8 * u, b.x - B.w * 0.34 * Math.cos(b.rot), b.y - B.h * 0.5 + 8 * u, 38 * u, Math.min(a.cp, b.cp) * Math.min(a.alpha, b.alpha), true, i);
    }
    sl.forEach((s, i) => {
      const hot = i === d.highlight, q = po[i];
      card(g, F, q.x, q.y, s.w, s.h, { rot: q.rot, flip: q.flip, alpha: q.alpha, sc: q.sc * (hot ? 1.03 : 1), seed: i + 3, ci: [0, 3, 4, 1][i % 4], hot, glow: hot ? 0.75 * q.cp : 0, numeral: ROMAN[i + 1], label: d.labels[i] || "", win: "tab",
        skyTop: F.mixk("skyTop", "ink", 0.12), skyBot: F.mixk("skyBot", "skyTop", hot ? 0.1 : 0.45) }, (gg, win) => tower(gg, F, win, d.values[i], mx, q.cp, hot, i, d));
    });
  }

  // ---- object: a gilded oracle with three labelled callouts ----------------------------------------
  function candle(g, F, x, base, hgt, a, seed) {
    if (a <= 0.01) return;
    const { u, t } = F; g.save(); g.globalAlpha *= a;
    const fl = Math.sin(t * 9 + seed) * 0.5 + Math.sin(t * 5.3 + seed * 2) * 0.5;
    const gl = g.createRadialGradient(x, base - hgt, 4, x, base - hgt, 190 * u); gl.addColorStop(0, F.C("glow", 0.5 + fl * 0.06)); gl.addColorStop(1, F.C("glow", 0));
    g.fillStyle = gl; g.fillRect(x - 200 * u, base - hgt - 200 * u, 400 * u, 400 * u);
    const dish = new Path2D(); dish.ellipse(x, base - 6 * u, 40 * u, 11 * u, 0, 0, TAU); ink(g, F, dish, F.C("gold"), 2.2);
    const body = new Path2D(); body.moveTo(x - 17 * u, base - 8 * u); body.lineTo(x - 15 * u, base - hgt); body.lineTo(x + 15 * u, base - hgt); body.lineTo(x + 17 * u, base - 8 * u); body.closePath();
    ink(g, F, body, F.C("paperHi"), 2.4);
    const dr = new Path2D(); dr.moveTo(x - 15 * u, base - hgt); dr.lineTo(x - 15 * u, base - hgt + 38 * u); dr.quadraticCurveTo(x - 10 * u, base - hgt + 50 * u, x - 5 * u, base - hgt + 38 * u); dr.lineTo(x - 5 * u, base - hgt); ink(g, F, dr, F.C("paper"), 1.8);
    const top = new Path2D(); top.ellipse(x, base - hgt, 15 * u, 5 * u, 0, 0, TAU); ink(g, F, top, F.C("paperLo"), 1.8);
    g.beginPath(); g.moveTo(x, base - hgt - 2 * u); g.lineTo(x, base - hgt - 14 * u); g.lineWidth = 2.4 * u; g.strokeStyle = F.C("ink"); g.stroke();
    const f = new Path2D(), fh = 40 * u * (1 + fl * 0.14), sw = fl * 5 * u;
    f.moveTo(x + sw, base - hgt - 14 * u - fh); f.quadraticCurveTo(x + 16 * u, base - hgt - 22 * u, x, base - hgt - 11 * u); f.quadraticCurveTo(x - 16 * u, base - hgt - 22 * u, x + sw, base - hgt - 14 * u - fh);
    ink(g, F, f, F.C("gold"), 1.8); g.fillStyle = F.C("goldHi"); g.beginPath(); g.ellipse(x + sw * 0.4, base - hgt - 22 * u, 5 * u, 11 * u, 0, 0, TAU); g.fill();
    for (let i = 0; i < 3; i++) { const s = fract(t * 0.4 + i / 3 + seed); g.fillStyle = F.C("goldHi", (1 - s) * 0.8); g.beginPath(); g.arc(x + Math.sin(s * 9 + i) * 12 * u, base - hgt - 40 * u - s * 120 * u, (3 - s * 2) * u, 0, TAU); g.fill(); }
    g.restore();
  }
  function deviceFrame(g, F, w, h, bz, phone) {
    const u = F.u, fr = cardPath(w + bz * 2, h + bz * 2, bz * 1.3);
    const gr = g.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2); gr.addColorStop(0, F.C("goldHi")); gr.addColorStop(0.35, F.C("gold")); gr.addColorStop(0.7, F.C("goldLo")); gr.addColorStop(1, F.C("gold"));
    g.save(); g.shadowColor = "rgba(0,0,0,0.5)"; g.shadowBlur = 30 * u; g.shadowOffsetY = 12 * u; g.fillStyle = gr; g.fill(fr); g.restore();
    ink(g, F, fr, null, 3.4);
    g.lineWidth = 1.6 * u; g.strokeStyle = F.C("ink", 0.7); g.stroke(cardPath(w + bz * 1.1, h + bz * 1.1, bz * 0.8));
    // Beads along the frame and a curl in each corner.
    g.fillStyle = F.C("paperHi");
    const pts = [];
    for (let x = -w / 2 + bz * 2; x < w / 2 - bz * 2; x += 38 * u) pts.push([x, -h / 2 - bz * 0.55], [x, h / 2 + bz * 0.55]);
    for (let y = -h / 2 + bz * 2; y < h / 2 - bz * 2; y += 38 * u) pts.push([-w / 2 - bz * 0.55, y], [w / 2 + bz * 0.55, y]);
    for (const [x, y] of pts) { g.beginPath(); g.arc(x, y, 3.4 * u, 0, TAU); g.fill(); g.lineWidth = 1.1 * u; g.strokeStyle = F.C("ink", 0.8); g.stroke(); }
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.save(); g.translate(sx * (w / 2 + bz * 0.62), sy * (h / 2 + bz * 0.62)); ink(g, F, star(g, 0, 0, bz * 0.62, 8, 0.4, F.t * 0.3), F.C("goldHi"), 1.4); g.restore();
    }
  }
  function object(ctx, S, box, p, d, info) {
    p = earlyP(info, p);
    const F = frameOf(ctx, S, info), g = ctx, { u, t, W, H } = F, k = outK(info), phone = d.kind === "phone";
    box = grow(F, box); const vertical = box.h > box.w * 0.9;
    let w, h;
    if (phone) { h = vertical ? box.h * 0.5 : box.h * 0.9; w = h * 0.52; } else { w = vertical ? box.w * 0.9 : Math.min(box.w * 0.56, box.h * 1.3); h = w * 0.62; }
    const bz = (phone ? 20 : 26) * u, baseH = phone ? 0 : h * 0.1 + bz;
    const dx = vertical ? box.x + box.w / 2 : box.x + (phone ? box.w * 0.24 : box.w * 0.29);
    const dy = vertical ? box.y + (h + baseH) / 2 + box.h * 0.02 : box.y + box.h / 2 - baseH / 2;
    const q = back(seg(p, 0, 0.45)), kk = eo(seg(k, 0.2, 0.85)), rv = seg(p, 0.05, 0.5);
    const ko = eio(seg(k, 0.3, 1)), offX = -ko * W * 0.7, offY = (1 - q) * H * 0.28 - eo(seg(k, 0, 0.4)) * 20 * u - ko * H * 0.06, rot = (1 - q) * 0.1 - ko * 0.2, alpha = clamp(q * 3) * (1 - seg(k, 0.68, 1));
    // Candles flank the oracle.
    if (!vertical) { const ca = eo(seg(p, 0, 0.35)) * (1 - kk); candle(g, F, box.x * 0.5, box.y + box.h, box.h * 0.46, ca, 1); candle(g, F, W - box.x * 0.5, box.y + box.h, box.h * 0.38, ca, 2.4); }
    g.save(); g.globalAlpha *= alpha; g.translate(dx + offX, dy + offY); g.rotate(rot);
    halo(g, F, 0, 0, Math.max(w, h) * 0.8, 0.55, t, 3);
    // Keyboard deck.
    if (!phone) {
      const dk = new Path2D(); dk.moveTo(-w / 2 - bz, h / 2 + bz * 0.9); dk.lineTo(w / 2 + bz, h / 2 + bz * 0.9); dk.lineTo(w / 2 + bz * 2.4, h / 2 + baseH); dk.lineTo(-w / 2 - bz * 2.4, h / 2 + baseH); dk.closePath();
      const dg = g.createLinearGradient(0, h / 2, 0, h / 2 + baseH); dg.addColorStop(0, F.C("goldHi")); dg.addColorStop(1, F.C("goldLo"));
      g.save(); g.shadowColor = "rgba(0,0,0,0.5)"; g.shadowBlur = 22 * u; g.shadowOffsetY = 10 * u; g.fillStyle = dg; g.fill(dk); g.restore(); ink(g, F, dk, null, 3);
      const nk = 13;
      for (let i = 0; i < nk; i++) { const x = (i / (nk - 1) - 0.5) * (w + bz * 3), a = 0.45 + 0.55 * Math.max(0, Math.sin(t * 3 - i * 0.6)); g.fillStyle = F.mixk("paperHi", "goldHi", a); g.beginPath(); g.arc(x, h / 2 + bz * 0.9 + (baseH - bz * 0.9) * 0.5, 5.4 * u, 0, TAU); g.fill(); g.lineWidth = 1.4 * u; g.strokeStyle = F.C("ink"); g.stroke(); }
    }
    deviceFrame(g, F, w, h, bz, phone);
    // Screen.
    const scr = new Path2D(); scr.rect(-w / 2, -h / 2, w, h);
    g.save(); g.clip(scr);
    const sg = g.createLinearGradient(0, -h / 2, 0, h / 2); sg.addColorStop(0, F.C("v1")); sg.addColorStop(1, F.C("v0")); g.fillStyle = sg; g.fillRect(-w / 2, -h / 2, w, h);
    const pad = 18 * u;
    const pv = { x: -w / 2 + pad, y: -h / 2 + pad, w: phone ? w - pad * 2 : w * 0.58, h: phone ? h * 0.4 : h * 0.54 };
    // Preview: a rising sun over rolling hills, clouds drifting.
    const pp = new Path2D(); pp.rect(pv.x, pv.y, pv.w, pv.h);
    g.save(); g.clip(pp);
    const ps = g.createLinearGradient(0, pv.y, 0, pv.y + pv.h); ps.addColorStop(0, F.mixk("skyTop", "ink", 0.0)); ps.addColorStop(1, F.C("skyBot")); g.fillStyle = ps; g.fillRect(pv.x, pv.y, pv.w, pv.h);
    const sunY = pv.y + pv.h * (0.62 - 0.1 * Math.sin(t * 0.7));
    sun(g, F, pv.x + pv.w * 0.62, sunY, pv.h * 0.15, t);
    for (let l = 0; l < 3; l++) {
      const hill = new Path2D(), by = pv.y + pv.h * (0.66 + l * 0.12), sp = t * (8 + l * 9) * u;
      hill.moveTo(pv.x - 10, pv.y + pv.h + 10);
      for (let x = pv.x - 10; x <= pv.x + pv.w + 10; x += 12 * u) hill.lineTo(x, by + Math.sin((x + sp) / (70 * u) + l * 2) * pv.h * 0.05);
      hill.lineTo(pv.x + pv.w + 10, pv.y + pv.h + 10); hill.closePath(); ink(g, F, hill, F.CC([5, 0, 6][l]), 2);
    }
    for (let c = 0; c < 3; c++) {
      const cx = pv.x + ((fract(t * 0.03 * (1 + c * 0.4) + c * 0.37)) * 1.4 - 0.2) * pv.w, cy = pv.y + pv.h * (0.16 + c * 0.12);
      const cl = new Path2D(); cl.arc(cx, cy, 14 * u, 0, TAU); cl.arc(cx + 17 * u, cy + 3 * u, 11 * u, 0, TAU); cl.arc(cx - 16 * u, cy + 4 * u, 10 * u, 0, TAU); ink(g, F, cl, F.C("paperHi"), 1.6);
    }
    g.restore();
    g.lineWidth = 3 * u; g.strokeStyle = F.C("ink"); g.stroke(pp); g.lineWidth = 1.6 * u; g.strokeStyle = F.C("gold"); g.strokeRect(pv.x - 5 * u, pv.y - 5 * u, pv.w + 10 * u, pv.h + 10 * u);
    // Dials.
    const dials = phone ? [[pv.x + pv.w * 0.2, pv.y + pv.h + 50 * u], [pv.x + pv.w * 0.5, pv.y + pv.h + 50 * u], [pv.x + pv.w * 0.8, pv.y + pv.h + 50 * u]]
      : [[pv.x + pv.w + (w / 2 - pad - pv.x - pv.w) * 0.5, pv.y + pv.h * 0.36], [pv.x + pv.w + (w / 2 - pad - pv.x - pv.w) * 0.5, pv.y + pv.h * 0.64], [pv.x + pv.w + (w / 2 - pad - pv.x - pv.w) * 0.5, pv.y + pv.h * 0.92]];
    const dr = Math.min(pv.h * 0.1, 27 * u);
    dials.forEach(([x, y], i) => {
      const ring = new Path2D(); ring.arc(x, y, dr, 0, TAU); ink(g, F, ring, F.mixk("paperHi", "gold", 0.2 + i * 0.1), 2.2);
      g.strokeStyle = F.C("ink", 0.8); g.lineWidth = 1.4 * u; g.beginPath(); for (let a = 0; a < 12; a++) { const an = -PI * 0.8 + (a / 11) * PI * 1.6; g.moveTo(x + Math.cos(an) * dr * 0.72, y + Math.sin(an) * dr * 0.72); g.lineTo(x + Math.cos(an) * dr * 0.94, y + Math.sin(an) * dr * 0.94); } g.stroke();
      const an = -PI / 2 + Math.sin(t * (0.9 + i * 0.35) + i * 2) * 1.1; g.lineWidth = 3 * u; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(an) * dr * 0.7, y + Math.sin(an) * dr * 0.7); g.stroke();
    });
    // Timeline: ruler, three tracks of clips, playhead.
    const tl = { x: -w / 2 + pad, y: phone ? pv.y + pv.h + 110 * u : pv.y + pv.h + 16 * u, w: w - pad * 2 }; tl.h = h / 2 - pad - tl.y;
    g.strokeStyle = F.C("deco", 0.5); g.lineWidth = 1.4 * u; g.beginPath(); const off = (t * 20 * u) % (16 * u);
    for (let x = tl.x - off; x < tl.x + tl.w; x += 16 * u) if (x >= tl.x) { g.moveTo(x, tl.y); g.lineTo(x, tl.y + (Math.round((x - tl.x) / (16 * u)) % 4 === 0 ? 11 : 6) * u); } g.stroke();
    const th = (tl.h - 14 * u) / 3, anchors = [[pv.x + pv.w * 0.9, pv.y + pv.h * 0.14], null, null];
    const clips = [[[0.0, 0.3], [0.33, 0.24], [0.6, 0.4]], [[0.08, 0.2], [0.32, 0.34], [0.7, 0.3]], [[0.0, 0.4], [0.44, 0.2], [0.68, 0.32]]];
    clips.forEach((row, ti) => {
      const y = tl.y + 14 * u + ti * th, strip = new Path2D(); strip.rect(tl.x, y + th * 0.08, tl.w, th * 0.84); g.fillStyle = F.C("shade", 0.5); g.fill(strip);
      row.forEach(([cx, cw], ci) => {
        const hotc = ti === 0 && ci === 1, x = tl.x + cx * tl.w, pw = cw * tl.w * eo(seg(rv, 0.2 + ci * 0.1, 0.8)), cl = new Path2D(); cl.rect(x + 2 * u, y + th * 0.14, Math.max(0, pw - 4 * u), th * 0.72);
        const pulse = hotc ? 0.5 + 0.5 * Math.sin(t * 4) : 0;
        if (hotc) { g.save(); g.shadowColor = F.C("goldHi"); g.shadowBlur = (14 + pulse * 14) * u; ink(g, F, cl, F.C("gold"), 2.2); g.restore(); anchors[1] = [x + pw * 0.5, y + th * 0.5]; }
        else ink(g, F, cl, F.CC(ti * 2 + ci * 3 + 1, 0.95), 2);
        if (pw > 40 * u) { const ix = x + 22 * u, iy = y + th * 0.5; if (ci % 3 === 0) ink(g, F, star(g, ix, iy, th * 0.2, 4, 0.4), F.C("goldHi"), 1.2); else if (ci % 3 === 1) { g.beginPath(); g.arc(ix, iy, th * 0.17, 0, TAU); g.fillStyle = F.C("paperHi"); g.fill(); } else { g.fillStyle = F.C("paperHi"); g.beginPath(); g.moveTo(ix - th * 0.17, iy + th * 0.15); g.lineTo(ix, iy - th * 0.2); g.lineTo(ix + th * 0.17, iy + th * 0.15); g.fill(); } }
      });
      if (ti === 2) anchors[2] = [tl.x + tl.w * 0.12, y + th * 0.5];
    });
    const phx = tl.x + fract(t * 0.16) * tl.w;
    g.lineWidth = 2.6 * u; g.strokeStyle = F.C("goldHi"); g.beginPath(); g.moveTo(phx, tl.y); g.lineTo(phx, tl.y + tl.h); g.stroke(); ink(g, F, star(g, phx, tl.y, 10 * u, 4, 0.34, t), F.C("goldHi"), 1.2);
    // A sheen crossing the glass.
    glint(g, F, -w / 2, -h / 2, w, h, t, 2);
    g.restore();
    g.restore();
    // Callouts: leaders carry travelling beads to ribbon labels.
    const fs = 42 * u, labels = d.callouts, n = labels.length;
    const bw = labels.map((l) => Math.min(textW(g, String(l).toUpperCase(), fs, "label", 0.06) + 76 * u, vertical ? box.w * 0.82 : box.w * 0.4));
    const cosr = Math.cos(rot), sinr = Math.sin(rot);
    labels.forEach((label, i) => {
      const c = eo(seg(p, 0.5 + i * 0.11, 0.85 + i * 0.05)) * (1 - kk);
      if (c <= 0.01 || !label) return;
      const an = anchors[i] || [0, 0], ax = dx + an[0] * cosr - an[1] * sinr, ay = dy + offY + an[0] * sinr + an[1] * cosr;
      const bx = vertical ? box.x + box.w / 2 : box.x + box.w - bw[i] / 2 - 20 * u, by = vertical ? box.y + box.h * (0.64 + i * 0.14) : box.y + box.h * (0.08 + i * 0.36);
      const ex = bx - bw[i] / 2 - 26 * u, ey = by, ctrl = [vertical ? ax : ax + (ex - ax) * 0.2, vertical ? ey : ey];
      const A = [ax, ay], E = [ex, ey];
      g.save(); g.globalAlpha *= c; g.lineCap = "round";
      const path = new Path2D(); path.moveTo(ax, ay); for (let s = 0.04; s <= 1.001; s += 0.04) { const pt = quad(A, ctrl, E, s * c); path.lineTo(pt[0], pt[1]); }
      g.lineWidth = 5 * u; g.strokeStyle = F.C("ink", 0.85); g.stroke(path); g.lineWidth = 2.6 * u; g.strokeStyle = F.C("goldHi"); g.stroke(path);
      const pulse = (fract(t * 0.9 + i * 0.3)); g.beginPath(); g.arc(ax, ay, (12 + pulse * 22) * u, 0, TAU); g.lineWidth = 2.2 * u; g.strokeStyle = F.C("goldHi", (1 - pulse) * 0.8); g.stroke();
      g.beginPath(); g.arc(ax, ay, 8 * u, 0, TAU); g.fillStyle = F.C("gold"); g.fill(); g.lineWidth = 2 * u; g.strokeStyle = F.C("ink"); g.stroke();
      if (c > 0.95) for (let j = 0; j < 3; j++) { const pt = quad(A, ctrl, E, fract(t * 0.45 + j / 3 + i * 0.2)); sparkle(g, F, pt[0], pt[1], 9 * u, 0.95); }
      g.restore();
      const bs = back(seg(c, 0.55, 1)); g.save(); g.globalAlpha *= clamp(c * 2 - 0.6); g.translate(bx, by); g.scale(bs, bs); g.translate(-bx, -by);
      ribbon(g, F, bx, by, bw[i], 66 * u, i === 1 ? "goldHi" : "paperHi");
      say(g, F, label, bx, by + 2 * u, fs, { font: "label", upper: true, color: F.C("ink"), track: 0.06, maxW: bw[i] - 40 * u, min: 38 * u }); g.restore();
    });
  }

  // ---- people: robed figures, one card each --------------------------------------------------------
  function people(ctx, S, box, p, d, info) {
    p = earlyP(info, p);
    const F = frameOf(ctx, S, info), g = ctx, { u, t } = F, k = outK(info);
    box = grow(F, box); const vertical = box.h > box.w * 0.9;
    const n = Math.max(2, Math.min(6, Math.round(d.count))), cols = vertical && n > 3 ? Math.ceil(n / 2) : n;
    const sl = slots(box, n, 0.62, cols, 1), hotI = Math.min(n - 1, d.highlight ?? 1);
    const po = sl.map((s, i) => pose(F, box, s, clamp((p - (i / n) * 0.5) / 0.5), k, i, n));
    // A ripple of light spreading from the highlighted card.
    const hq = po[hotI];
    if (hq.cp > 0.5) for (let r = 0; r < 3; r++) { const s = fract(t * 0.5 + r / 3); g.beginPath(); g.ellipse(hq.x, hq.y, sl[hotI].w * (0.6 + s * 0.9), sl[hotI].h * (0.55 + s * 0.6), 0, 0, TAU); g.lineWidth = 2.5 * u; g.strokeStyle = F.C("goldHi", (1 - s) * 0.45 * hq.alpha); g.stroke(); }
    sl.forEach((s, i) => {
      const hot = i === hotI, q = po[i];
      const label = (i < d.badges.length ? d.badges[i] : EXTRA_ROLES[(i - d.badges.length) % EXTRA_ROLES.length]) || "";
      card(g, F, q.x, q.y, s.w, s.h, { rot: q.rot, flip: q.flip, alpha: q.alpha, sc: q.sc * (hot ? 1.04 : 1), seed: i + 21, ci: [0, 3, 6, 1, 4, 5][i % 6], hot, glow: hot ? 0.85 * q.cp : 0, numeral: ROMAN[i + 1], label,
        skyTop: F.mixk("skyTop", "ink", 0.1), skyBot: F.mixk("skyBot", "skyTop", [0.2, 0.5, 0.0, 0.35, 0.1, 0.6][i % 6]) },
      (gg, win) => {
        const sy = win.y + win.h * 1.0;
        const e = eo(seg(q.cp, 0, 0.8));
        gg.save(); gg.globalAlpha *= clamp(q.cp * 3);
        // Hills and a ground ring under the figure.
        const hill = new Path2D(); hill.moveTo(win.x - 5, sy + 5); for (let x = win.x; x <= win.x + win.w; x += 10 * u) hill.lineTo(x, sy - win.h * (0.12 + 0.03 * Math.sin(x / (50 * u) + i + t * 0.4))); hill.lineTo(win.x + win.w + 5, sy + 5); hill.closePath(); ink(gg, F, hill, F.CC([5, 0, 5, 4, 0, 5][i % 6], 0.95), 2);
        person(gg, F, -win.w * 0.07, sy - win.h * 0.06, win.h * (0.84 + (hot ? 0.05 : 0)) * (0.6 + 0.4 * e), i, t, hot);
        gg.restore();
      });
    });
    // Orbiting stars around the highlighted card.
    if (hq.cp > 0.6) for (let j = 0; j < 4; j++) { const a = t * 0.9 + (j * TAU) / 4; sparkle(g, F, hq.x + Math.cos(a) * sl[hotI].w * 0.72, hq.y + Math.sin(a) * sl[hotI].h * 0.56, 14 * u, hq.alpha * (0.6 + 0.4 * Math.sin(t * 4 + j))); }
  }

  // ---- process: read, draft, approve ---------------------------------------------------------------
  function stepEye(g, F, win, t, i) {
    const u = F.u, s = win.s, bookY = win.y + win.h * 0.7, bw = win.w * 0.4;
    g.fillStyle = "rgba(255,226,150,0.18)"; const bm = 0.65 + 0.35 * Math.sin(t * 2);
    g.beginPath(); g.moveTo(-win.w * 0.12, win.y + win.h * 0.4); g.lineTo(win.w * 0.12, win.y + win.h * 0.4); g.lineTo(bw * 0.9, bookY); g.lineTo(-bw * 0.9, bookY); g.closePath(); g.globalAlpha *= bm; g.fill(); g.globalAlpha /= bm;
    for (const sg of [-1, 1]) {
      const pg = new Path2D(); pg.moveTo(0, bookY); pg.quadraticCurveTo(sg * bw * 0.5, bookY - bw * 0.14, sg * bw, bookY - bw * 0.07); pg.lineTo(sg * bw, bookY + bw * 0.52); pg.quadraticCurveTo(sg * bw * 0.5, bookY + bw * 0.43, 0, bookY + bw * 0.52); pg.closePath();
      ink(g, F, pg, F.C("paperHi"), 2.4);
      g.save(); g.clip(pg); g.strokeStyle = F.C("ink", 0.55); g.lineWidth = 2 * u; g.beginPath();
      for (let l = 0; l < 5; l++) { const y = bookY + bw * (0.06 + l * 0.09); g.moveTo(sg * bw * 0.12, y); g.lineTo(sg * bw * (0.9 - (l % 2) * 0.22), y); } g.stroke();
      const idx = Math.floor(fract(t * 0.3) * 5), pr = fract(t * 1.5);
      if (sg === 1) { const y = bookY + bw * (0.06 + idx * 0.09); g.fillStyle = F.C("gold", 0.55); g.fillRect(bw * 0.12, y - 8 * u, bw * 0.78 * pr, 16 * u); sparkle(g, F, bw * (0.12 + 0.78 * pr), y, 11 * u, 0.9); }
      g.restore();
    }
    const spine = new Path2D(); spine.moveTo(0, bookY); spine.lineTo(0, bookY + bw * 0.52); g.lineWidth = 3 * u; g.strokeStyle = F.C("ink"); g.stroke(spine);
    const blink = fract(t / 2.6) < 0.06 ? 0.15 : 1;
    eye(g, F, 0, win.y + win.h * 0.3, win.w * 0.62, t, i, blink);
    for (let j = 0; j < 5; j++) sparkle(g, F, Math.sin(t * 0.8 + j * 1.9) * win.w * 0.4, win.y + win.h * (0.12 + 0.4 * fract(t * 0.2 + j * 0.21)), 7 * u, 0.8);
  }
  function stepQuill(g, F, win, t) {
    const u = F.u, s = win.s, cy = win.cy + win.h * 0.02, R = s * 0.24;
    const sheet = new Path2D(); sheet.rect(-win.w * 0.3, cy - win.h * 0.3, win.w * 0.6, win.h * 0.6); ink(g, F, sheet, F.C("paperHi"), 2.6);
    g.save(); g.clip(sheet); const mw = new Path2D(); mw.moveTo(-win.w * 0.38, cy + win.h * 0.2); mw.lineTo(win.w * 0.38, cy + win.h * 0.1); g.restore();
    // A star drawn in one stroke, looping.
    const pts = []; for (let i = 0; i < 6; i++) { const a = -PI / 2 + ((i * 2) % 5) * (TAU / 5) + (i === 5 ? 0 : 0); pts.push([Math.cos(a) * R, cy + Math.sin(a) * R]); }
    const pr = eio(fract(t / 3.2) * 1.15), total = 5; let acc = pr * total, head = pts[0];
    g.save(); g.lineCap = "round"; g.lineJoin = "round";
    const trail = new Path2D(); trail.moveTo(pts[0][0], pts[0][1]);
    for (let i = 0; i < 5; i++) { const f = clamp(acc - i); if (f <= 0) break; head = [lerp(pts[i][0], pts[i + 1][0], f), lerp(pts[i][1], pts[i + 1][1], f)]; trail.lineTo(head[0], head[1]); }
    g.lineWidth = 7 * u; g.strokeStyle = F.C("gold", 0.35); g.stroke(trail); g.lineWidth = 3.4 * u; g.strokeStyle = F.C("ink"); g.stroke(trail); g.restore();
    const circ = new Path2D(); circ.arc(0, cy, R * 1.28, 0, TAU); g.lineWidth = 1.6 * u; g.setLineDash([6 * u, 8 * u]); g.lineDashOffset = -t * 14 * u; g.strokeStyle = F.C("ink", 0.5); g.stroke(circ); g.setLineDash([]);
    // The quill.
    g.save(); g.translate(head[0], head[1]); g.rotate(0.18 + Math.sin(t * 6) * 0.03);
    const fe = new Path2D(); fe.moveTo(0, 0); fe.lineTo(s * 0.06, -s * 0.14); fe.bezierCurveTo(s * 0.34, -s * 0.34, s * 0.4, -s * 0.66, s * 0.3, -s * 0.8); fe.bezierCurveTo(s * 0.18, -s * 0.66, s * 0.1, -s * 0.4, s * 0.03, -s * 0.14); fe.closePath();
    ink(g, F, fe, F.CC(1), 2.2);
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(s * 0.2, -s * 0.38, s * 0.3, -s * 0.8); g.lineWidth = 2 * u; g.strokeStyle = F.C("ink"); g.stroke(); g.restore();
    sparkle(g, F, head[0], head[1], 12 * u, 0.9);
    for (let j = 0; j < 3; j++) sparkle(g, F, (j - 1) * win.w * 0.36, win.y + win.h * (0.1 + 0.05 * j) + Math.sin(t * 1.4 + j) * 6 * u, 8 * u, 0.7);
  }
  function stepSeal(g, F, win, t) {
    const u = F.u, s = win.s, cx = 0, cy = win.cy - win.h * 0.04, R = s * 0.26, ph = fract(t / 2.6), press = ph < 0.14 ? 1 + (0.14 - ph) * 2.2 : 1 + 0.025 * Math.sin(t * 3);
    halo(g, F, cx, cy, s * 0.7, 0.9, t, 4);
    for (const sg of [-1, 1]) { const tl = new Path2D(); tl.moveTo(cx + sg * R * 0.25, cy + R * 0.7); tl.lineTo(cx + sg * R * 1.05, cy + R * 2.15 + Math.sin(t * 2 + sg) * 4 * u); tl.lineTo(cx + sg * R * 0.62, cy + R * 1.9); tl.lineTo(cx + sg * R * 0.2, cy + R * 2.05); tl.closePath(); ink(g, F, tl, F.CC(sg > 0 ? 6 : 0), 2.2); }
    g.save(); g.translate(cx, cy); g.scale(press, press);
    const sealP = new Path2D(); for (let i = 0; i <= 56; i++) { const a = (i / 56) * TAU, r = R * (1 + 0.07 * Math.sin(a * 14) + 0.015 * Math.sin(a * 5)); sealP[i ? "lineTo" : "moveTo"](Math.cos(a) * r, Math.sin(a) * r); } sealP.closePath();
    g.shadowColor = "rgba(0,0,0,0.45)"; g.shadowBlur = 16 * u; g.shadowOffsetY = 6 * u; ink(g, F, sealP, F.CC(1), 2.8); g.shadowColor = "transparent";
    const ring = new Path2D(); ring.arc(0, 0, R * 0.74, 0, TAU); g.lineWidth = 3 * u; g.strokeStyle = F.mixk("ink", "gold", 0.0, 0.5); g.stroke(ring); g.lineWidth = 2 * u; g.strokeStyle = "rgba(255,200,170,0.5)"; g.stroke(ring);
    g.save(); g.clip(sealP); g.fillStyle = "rgba(255,225,200,0.25)"; g.beginPath(); g.ellipse(-R * 0.3, -R * 0.4, R * 0.5, R * 0.28, -0.6, 0, TAU); g.fill(); g.restore();
    const ck = new Path2D(); ck.moveTo(-R * 0.36, 0); ck.lineTo(-R * 0.08, R * 0.3); ck.lineTo(R * 0.42, -R * 0.3);
    g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = 11 * u; g.strokeStyle = F.C("ink"); g.stroke(ck); g.lineWidth = 6.5 * u; g.strokeStyle = F.C("goldHi"); g.stroke(ck);
    g.restore();
    if (ph < 0.5) { g.beginPath(); g.arc(cx, cy, R * (1 + ph * 3), 0, TAU); g.lineWidth = 3 * u; g.strokeStyle = F.C("goldHi", (0.5 - ph) * 1.4); g.stroke(); }
    for (let j = 0; j < 6; j++) { const a = t * 0.8 + (j * TAU) / 6; sparkle(g, F, cx + Math.cos(a) * R * 1.55, cy + Math.sin(a) * R * 1.3, 8 * u, 0.5 + 0.5 * Math.sin(t * 4 + j)); }
  }
  function process(ctx, S, box, p, d, info) {
    p = earlyP(info, p);
    const F = frameOf(ctx, S, info), g = ctx, { u, t, W, H } = F, k = outK(info), n = d.steps.length;
    box = grow(F, box); const vertical = box.h > box.w * 0.9;
    let sl;
    if (vertical) {
      const ch = (box.h / n) * 0.9, cw = Math.min(box.w * 0.9, ch * 1.9);
      sl = d.steps.map((_, i) => ({ cx: box.x + box.w / 2 + (i % 2 ? 1 : -1) * box.w * 0.03, cy: box.y + (i + 0.5) * (box.h / n), w: cw, h: ch }));
    } else {
      sl = slots(box, n, 0.62, n, 1); const wave = [0.035, -0.045, 0.035, -0.045, 0.035];
      sl.forEach((s, i) => { s.cy += wave[i % 5] * box.h; });
    }
    const po = sl.map((s, i) => pose(F, box, s, clamp((p - (i / n) * 0.55) / 0.45), k, i, n));
    // Threads with beads of light between the cards.
    for (let i = 0; i < n - 1; i++) {
      const A = sl[i], B = sl[i + 1], a = po[i], b = po[i + 1], c = Math.min(a.cp, b.cp) * Math.min(a.alpha, b.alpha);
      if (c <= 0.02) continue;
      const s0 = vertical ? [a.x, a.y + A.h / 2 + 4 * u] : [a.x + A.w / 2 + 6 * u, a.y], e0 = vertical ? [b.x, b.y - B.h / 2 - 4 * u] : [b.x - B.w / 2 - 6 * u, b.y];
      const ctrl = vertical ? [(s0[0] + e0[0]) / 2 + 80 * u * (i % 2 ? 1 : -1), (s0[1] + e0[1]) / 2] : [(s0[0] + e0[0]) / 2, Math.min(s0[1], e0[1]) - 70 * u];
      const path = new Path2D(); path.moveTo(s0[0], s0[1]); for (let s = 0.05; s <= 1.001; s += 0.05) { const pt = quad(s0, ctrl, e0, s * eo(seg(p, 0.3 + i * 0.2, 0.75 + i * 0.1))); path.lineTo(pt[0], pt[1]); }
      g.save(); g.globalAlpha *= c; g.lineCap = "round"; g.lineWidth = 7 * u; g.strokeStyle = F.C("ink", 0.85); g.stroke(path); g.lineWidth = 3.4 * u; g.strokeStyle = F.C("gold"); g.stroke(path);
      for (let j = 0; j < 4; j++) { const pt = quad(s0, ctrl, e0, fract(t * 0.5 + j / 4 + i * 0.13)); sparkle(g, F, pt[0], pt[1], 10 * u, 0.95); }
      const hd = quad(s0, ctrl, e0, 0.97), tl = quad(s0, ctrl, e0, 0.9), ang = Math.atan2(hd[1] - tl[1], hd[0] - tl[0]);
      g.translate(hd[0], hd[1]); g.rotate(ang); g.beginPath(); g.moveTo(0, 0); g.lineTo(-26 * u, -15 * u); g.lineTo(-26 * u, 15 * u); g.closePath(); g.fillStyle = F.C("gold"); g.fill(); g.lineWidth = 2.4 * u; g.strokeStyle = F.C("ink"); g.stroke();
      g.restore();
    }
    sl.forEach((s, i) => {
      const q = po[i], last = i === n - 1;
      card(g, F, q.x, q.y, s.w, s.h, { rot: q.rot, flip: q.flip, alpha: q.alpha, sc: q.sc * (last ? 1.03 : 1), seed: i + 41, ci: [0, 4, 1, 6, 3][i % 5], hot: last, glow: last ? 0.8 * q.cp : 0, numeral: ROMAN[i + 1], label: d.steps[i], win: vertical ? "tab" : "oval",
        skyTop: F.mixk("skyTop", "ink", 0.1), skyBot: F.mixk("skyBot", "skyTop", [0.3, 0.55, 0.05][i % 3]) },
      (gg, win) => { gg.save(); gg.globalAlpha *= clamp(q.cp * 3); const sc = (0.65 + 0.35 * eo(q.cp)) * Math.min(1, win.h / (win.w * 0.85)); gg.translate(0, win.cy); gg.scale(sc, sc); gg.translate(0, -win.cy); (last ? stepSeal : i === 0 ? stepEye : stepQuill)(gg, F, win, t, i); gg.restore(); });
    });
  }

  // ---- compare: a wheel and a dial, weighed on a scale ---------------------------------------------
  function wheelArt(g, F, win, t, q) {
    const u = F.u, s = win.s, cx = 0, cy = win.y + win.h * 0.36, r = s * 0.26;
    for (let i = 0; i < 3; i++) { const a = -t * (0.9 + i * 0.3) + i * 2.1, rr = r * (1.3 + i * 0.16); g.beginPath(); g.arc(cx, cy, rr, a, a + 1.5); g.lineWidth = 4 * u; g.lineCap = "round"; g.strokeStyle = F.C("paperHi", 0.7); g.stroke(); const ex = cx + Math.cos(a + 1.5) * rr, ey = cy + Math.sin(a + 1.5) * rr, ta = a + 1.5 + PI / 2; g.beginPath(); g.moveTo(ex + Math.cos(ta) * 11 * u, ey + Math.sin(ta) * 11 * u); g.lineTo(ex + Math.cos(ta + 2.5) * 11 * u, ey + Math.sin(ta + 2.5) * 11 * u); g.lineTo(ex + Math.cos(ta - 2.5) * 11 * u, ey + Math.sin(ta - 2.5) * 11 * u); g.closePath(); g.fillStyle = F.C("paperHi", 0.85); g.fill(); }
    g.save(); g.translate(cx, cy); g.rotate(t * 1.4 + Math.sin(t * 4) * 0.25);
    const rim = new Path2D(); rim.arc(0, 0, r, 0, TAU); rim.moveTo(r * 0.82, 0); rim.arc(0, 0, r * 0.82, 0, TAU, true); g.save(); g.fillStyle = F.C("bronze"); g.fill(rim, "evenodd"); g.restore(); ink(g, F, rim, null, 2.4);
    g.strokeStyle = F.C("ink"); g.lineWidth = 3 * u; g.beginPath(); for (let i = 0; i < 8; i++) { g.moveTo(0, 0); g.lineTo(Math.cos((i * TAU) / 8) * r * 0.82, Math.sin((i * TAU) / 8) * r * 0.82); } g.stroke();
    for (let i = 0; i < 8; i++) { const o = new Path2D(); o.arc(Math.cos((i * TAU) / 8) * r * 1.0, Math.sin((i * TAU) / 8) * r * 1.0, r * 0.1, 0, TAU); ink(g, F, o, F.CC(i), 1.8); }
    const hub = new Path2D(); hub.arc(0, 0, r * 0.2, 0, TAU); ink(g, F, hub, F.C("gold"), 2.2); g.restore();
  }
  function dialArt(g, F, win, t, q) {
    const u = F.u, s = win.s, cx = 0, cy = win.y + win.h * 0.36, r = s * 0.26;
    halo(g, F, cx, cy, s * 0.62, 0.85, t, 2);
    const ring = new Path2D(); ring.arc(cx, cy, r, 0, TAU); ink(g, F, ring, F.C("gold"), 2.6);
    g.beginPath(); g.arc(cx, cy, r * 0.8, 0, TAU); g.fillStyle = F.C("paperHi"); g.fill(); g.lineWidth = 2 * u; g.strokeStyle = F.C("ink"); g.stroke();
    g.strokeStyle = F.C("ink", 0.85); g.lineWidth = 2 * u; g.beginPath(); for (let i = 0; i <= 20; i++) { const a = -PI * 0.85 + (i / 20) * PI * 1.7, l = i % 5 === 0 ? 0.62 : 0.7; g.moveTo(cx + Math.cos(a) * r * l, cy + Math.sin(a) * r * l); g.lineTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78); } g.stroke();
    const an = -PI / 2 + 0.55 * Math.sin(t * 0.9) * (0.4 + 0.6 * q);
    g.save(); g.translate(cx, cy); g.rotate(an); const nd = new Path2D(); nd.moveTo(0, -r * 0.7); nd.lineTo(r * 0.07, 0); nd.lineTo(-r * 0.07, 0); nd.closePath(); ink(g, F, nd, F.CC(1), 2); g.restore();
    const hub = new Path2D(); hub.arc(cx, cy, r * 0.12, 0, TAU); ink(g, F, hub, F.C("goldHi"), 2);
    for (let j = 0; j < 6; j++) { const a = t * 0.7 + (j * TAU) / 6; sparkle(g, F, cx + Math.cos(a) * r * 1.5, cy + Math.sin(a) * r * 1.35, 9 * u, 0.5 + 0.5 * Math.sin(t * 3 + j)); }
  }
  function scales(g, F, cx, py, half, drop, lv, rv, mx, q, a, t) {
    const u = F.u; if (a <= 0.01) return;
    g.save(); g.globalAlpha *= a;
    const ang = clamp((rv - lv) / mx, -1, 1) * 0.2 * eo(q) + Math.sin(t * 1.4) * 0.014 * (1 + (1 - eo(q)) * 3);
    // Pillar and foot.
    const pil = new Path2D(); pil.moveTo(cx - 9 * u, py); pil.lineTo(cx + 9 * u, py); pil.lineTo(cx + 15 * u, py + drop + 150 * u); pil.lineTo(cx - 15 * u, py + drop + 150 * u); pil.closePath(); ink(g, F, pil, F.C("gold"), 2.6);
    const foot = new Path2D(); foot.moveTo(cx - 80 * u, py + drop + 190 * u); foot.quadraticCurveTo(cx, py + drop + 120 * u, cx + 80 * u, py + drop + 190 * u); foot.closePath(); ink(g, F, foot, F.C("goldLo"), 2.6);
    g.save(); g.translate(cx, py); g.rotate(ang);
    const beam = new Path2D(); beam.moveTo(-half, 0); beam.quadraticCurveTo(0, -26 * u, half, 0); beam.quadraticCurveTo(0, 12 * u, -half, 0); beam.closePath(); ink(g, F, beam, F.C("gold"), 3);
    for (const sg of [-1, 1]) { const bl = new Path2D(); bl.arc(sg * half, 0, 11 * u, 0, TAU); ink(g, F, bl, F.C("goldHi"), 2.2); }
    // Pans on chains, kept level by counter-rotation.
    [[-1, lv, "bronze"], [1, rv, "gold"]].forEach(([sg, val, key], idx) => {
      g.save(); g.translate(sg * half, 0); g.rotate(-ang + Math.sin(t * 1.9 + idx * 2) * 0.03);
      g.lineWidth = 2.4 * u; g.strokeStyle = F.C("ink"); g.beginPath(); g.moveTo(0, 0); g.lineTo(-sg * 0 - 70 * u, drop); g.moveTo(0, 0); g.lineTo(70 * u, drop); g.stroke();
      g.lineWidth = 1.2 * u; g.strokeStyle = F.C("goldHi"); g.beginPath(); g.moveTo(0, 0); g.lineTo(-70 * u, drop); g.moveTo(0, 0); g.lineTo(70 * u, drop); g.stroke();
      const cnt = val > 0 ? Math.max(1, Math.round((val / mx) * 8)) : 0, shown = cnt * eo(q);
      for (let c = 0; c < Math.ceil(shown); c++) { const ck = clamp(shown - c); g.save(); g.globalAlpha *= clamp(ck * 3); coin(g, F, Math.sin(t * 2 + c) * 2 * u + (c % 2) * 6 * u - 3 * u, drop - 16 * u - c * 11 * u - (1 - eo(ck)) * 70 * u, 30 * u, 0.3, 8 * u, key, 1, 0); g.restore(); }
      const pan = new Path2D(); pan.moveTo(-82 * u, drop); pan.quadraticCurveTo(0, drop + 54 * u, 82 * u, drop); pan.quadraticCurveTo(0, drop + 12 * u, -82 * u, drop); pan.closePath(); ink(g, F, pan, F.C("gold"), 2.6);
      g.restore();
    });
    g.restore();
    const piv = new Path2D(); piv.arc(cx, py, 14 * u, 0, TAU); ink(g, F, piv, F.C("goldHi"), 2.4); ink(g, F, star(g, cx, py - 36 * u, 14 * u, 4, 0.36, t * 0.6), F.C("goldHi"), 1.6);
    g.restore();
  }
  function compare(ctx, S, box, p, d, info) {
    p = earlyP(info, p);
    const F = frameOf(ctx, S, info), g = ctx, { u, t } = F, k = outK(info);
    box = grow(F, box); const vertical = box.h > box.w * 1.1;
    const mx = Math.max(d.leftValue, d.rightValue, 1), items = [[d.left, d.leftValue, 0], [d.right, d.rightValue, 1]];
    let sl, sc;
    if (vertical) { const w = (box.w - 30 * u) / 2, h = Math.min(box.h * 0.56, w / 0.62); sl = items.map((_, i) => ({ cx: box.x + w / 2 + i * (w + 30 * u), cy: box.y + h / 2, w, h })); sc = { cx: box.x + box.w / 2, py: box.y + h + 110 * u, half: box.w * 0.3, drop: Math.min(box.h * 0.17, 180 * u) }; }
    else { const h = box.h * 0.98, w = h * 0.62; sl = items.map((_, i) => ({ cx: i ? box.x + box.w - w / 2 : box.x + w / 2, cy: box.y + box.h / 2, w, h })); sc = { cx: box.x + box.w / 2, py: box.y + box.h * 0.26, half: Math.min(box.w * 0.15, (box.w - 2 * w) * 0.34), drop: box.h * 0.3 }; }
    const po = sl.map((s, i) => pose(F, box, s, clamp((p - i * 0.2) / 0.55), k, i, 2));
    scales(g, F, sc.cx, sc.py, sc.half, sc.drop, d.leftValue, d.rightValue, mx, seg(p, 0.35, 0.9), Math.min(1, eo(seg(p, 0.1, 0.45))) * (1 - eo(k)), t);
    items.forEach(([label, value, i]) => {
      const q = po[i], s = sl[i], hot = i === 1;
      card(g, F, q.x, q.y, s.w, s.h, { rot: q.rot, flip: q.flip, alpha: q.alpha, sc: q.sc * (hot ? 1.03 : 1), seed: i + 61, ci: hot ? 2 : 4, hot, glow: hot ? 0.9 * q.cp : 0, numeral: ROMAN[i + 1], label, win: "oval",
        skyTop: F.mixk("skyTop", "ink", hot ? 0.05 : 0.35), skyBot: F.mixk("skyBot", "skyTop", hot ? 0.15 : 0.75) },
      (gg, win) => {
        gg.save(); gg.globalAlpha *= clamp(q.cp * 3); (hot ? dialArt : wheelArt)(gg, F, win, t, q.cp);
        say(gg, F, window.DreamcutMotion.formatNumber(value * q.cp, 0, d.prefix, d.suffix), 0, win.y + win.h * 0.82, 150 * u, { color: hot ? F.C("goldHi") : F.C("cream"), halo: F.C("ink", 0.92), haloW: 16 * u, maxW: win.w * 0.8, min: 100 * u });
        gg.restore();
      });
    });
  }

  // ---- the world: velvet, wheel, vines, dust, hands of cards ---------------------------------------
  let NAP = null;
  function napTile() {
    if (NAP) return NAP;
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d"), r = rng(77);
    g.lineCap = "round";
    for (let i = 0; i < 2600; i++) {
      const x = r() * 256, y = r() * 256, l = 5 + r() * 12, a = -0.95 + (r() - 0.5) * 0.5, lite = r() > 0.5;
      g.strokeStyle = lite ? `rgba(255,255,255,${0.03 + r() * 0.06})` : `rgba(0,0,0,${0.05 + r() * 0.09})`; g.lineWidth = 1 + r() * 1.2;
      for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) { g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l); g.stroke(); }
    }
    return (NAP = c);
  }
  let GRAINT = null;
  function grainTile() {
    if (GRAINT) return GRAINT;
    const c = document.createElement("canvas"); c.width = c.height = 220;
    const g = c.getContext("2d"), im = g.createImageData(220, 220), r = rng(5);
    for (let i = 0; i < im.data.length; i += 4) { const v = r(), d = v > 0.5 ? 255 : 0; im.data[i] = im.data[i + 1] = im.data[i + 2] = d; im.data[i + 3] = Math.abs(v - 0.5) * 2 > 0.35 ? (Math.abs(v - 0.5) * 2 - 0.3) * 120 : 0; }
    g.putImageData(im, 0, 0); return (GRAINT = c);
  }
  const DUST = (() => { const r = rng(101); return Array.from({ length: 120 }, () => ({ x: r(), y: r(), s: 0.01 + r() * 0.028, a: r() * TAU, sz: 1 + r() * 2.6, ph: r() * TAU, w: r() })); })();
  const GLINTS = (() => { const r = rng(303); return Array.from({ length: 14 }, () => ({ x: 0.05 + r() * 0.9, y: 0.05 + r() * 0.9, r: 7 + r() * 11, ph: r() * TAU, sp: 0.8 + r() * 1.6 })); })();
  const VINE = (() => {
    const pts = [];
    for (let i = 0; i <= 70; i++) { const s = i / 70; pts.push([16 + 360 * s, 22 + 44 * Math.sin(s * TAU * 0.85) * (1 - s * 0.25)]); }
    const [ex, ey] = pts[pts.length - 1];
    for (let i = 1; i <= 44; i++) { const s = i / 44, a = -PI / 2 + s * TAU * 1.5, r = 26 * (1 - s * 0.82); pts.push([ex + Math.cos(a) * r, ey + 26 + Math.sin(a) * r]); }
    return pts;
  })();

  function velvet(g, F) {
    const { W, H, t, tex } = F;
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, F.C("v1")); gr.addColorStop(1, F.C("v0")); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let k = 0; k < 7; k++) {
      const cx = W * (0.04 + 0.15 * k) + Math.sin(t * 0.22 + k * 1.7) * W * 0.05, ang = -0.3 + Math.sin(t * 0.15 + k) * 0.07, wd = W * (0.09 + 0.03 * (k % 3));
      g.save(); g.translate(cx, H / 2); g.rotate(ang);
      const lg = g.createLinearGradient(-wd, 0, wd, 0), lit = k % 2 === 0;
      lg.addColorStop(0, "rgba(0,0,0,0)"); lg.addColorStop(0.5, lit ? F.C("v2", F.T.fold) : F.C("shade", F.T.fold * 1.9)); lg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = lg; g.fillRect(-wd, -H, wd * 2, H * 2); g.restore();
    }
    const px = W * (0.5 + 0.14 * Math.sin(t * 0.2)), py = H * (0.42 + 0.06 * Math.cos(t * 0.17));
    const pg = g.createRadialGradient(px, py, 0, px, py, W * 0.62); pg.addColorStop(0, F.C("v2", 0.42)); pg.addColorStop(1, F.C("v2", 0)); g.fillStyle = pg; g.fillRect(0, 0, W, H);
    g.save(); g.globalAlpha = 0.95 * tex; g.fillStyle = g.createPattern(napTile(), "repeat"); g.translate((t * 3) % 256, (t * 2) % 256); g.fillRect(-256, -256, W + 512, H + 512); g.restore();
    // A diagonal sheen that crawls across the pile.
    const sx = ((t * 0.05) % 1.6 - 0.3) * W; g.save(); g.translate(sx, H / 2); g.rotate(0.5);
    const sh = g.createLinearGradient(-W * 0.1, 0, W * 0.1, 0); sh.addColorStop(0, "rgba(255,240,200,0)"); sh.addColorStop(0.5, `rgba(255,240,200,${0.06 * tex + 0.02})`); sh.addColorStop(1, "rgba(255,240,200,0)");
    g.fillStyle = sh; g.fillRect(-W * 0.1, -H, W * 0.2, H * 2); g.restore();
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, Math.hypot(W, H) * 0.58); vg.addColorStop(0, F.C("shade", 0)); vg.addColorStop(1, F.C("shade", F.T.vig)); g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }
  function wheel(g, F, cx, cy, R, rot, a) {
    const { u } = F; g.save(); g.translate(cx, cy); g.globalAlpha *= a; g.strokeStyle = F.C("deco"); g.fillStyle = F.C("deco");
    for (const [r, lw] of [[1, 2.6], [0.93, 1.4], [0.78, 2], [0.5, 1.6], [0.2, 2]]) { g.beginPath(); g.arc(0, 0, R * r, 0, TAU); g.lineWidth = lw * u; g.stroke(); }
    g.save(); g.rotate(rot); g.beginPath(); for (let i = 0; i < 72; i++) { const a2 = (i / 72) * TAU, l = i % 6 === 0 ? 0.88 : 0.91; g.moveTo(Math.cos(a2) * R * l, Math.sin(a2) * R * l); g.lineTo(Math.cos(a2) * R * 0.93, Math.sin(a2) * R * 0.93); } g.lineWidth = 1.5 * u; g.stroke(); g.restore();
    g.save(); g.rotate(-rot * 0.6);
    for (let i = 0; i < 12; i++) {
      const a2 = (i / 12) * TAU, x = Math.cos(a2) * R * 0.855, y = Math.sin(a2) * R * 0.855;
      g.save(); g.translate(x, y); g.rotate(a2 + PI / 2);
      if (i % 3 === 0) g.fill(star(g, 0, 0, R * 0.04, 4, 0.34)); else if (i % 3 === 1) { g.beginPath(); g.arc(0, 0, R * 0.026, 0, TAU); g.fill(); g.beginPath(); g.arc(0, 0, R * 0.045, PI, 0); g.lineWidth = 1.4 * u; g.stroke(); } else { g.beginPath(); g.arc(0, 0, R * 0.04, PI * 0.5, PI * 1.5, true); g.arc(R * 0.014, 0, R * 0.032, PI * 1.5, PI * 0.5, false); g.fill(); }
      g.restore();
    }
    g.restore();
    rays(g, F, 0, 0, R * 0.2, R * 0.5, 16, rot * 1.5, F.C("deco", 0.5), 0.3);
    g.save(); g.rotate(-rot * 1.1); g.beginPath(); for (let i = 0; i < 8; i++) { const a2 = (i / 8) * TAU; g.moveTo(Math.cos(a2) * R * 0.5, Math.sin(a2) * R * 0.5); g.lineTo(Math.cos(a2 + 0.5) * R * 0.78, Math.sin(a2 + 0.5) * R * 0.78); } g.lineWidth = 1.3 * u; g.stroke(); g.restore();
    g.restore();
  }
  function vines(g, F, a) {
    const { W, H, u, t } = F;
    for (const [sx, sy, ph] of [[1, 1, 0], [-1, 1, 1.7], [1, -1, 3.1], [-1, -1, 4.6]]) {
      for (const tr of [0, 1]) {
        g.save(); g.translate(sx > 0 ? 0 : W, sy > 0 ? 0 : H); g.scale(sx * u * (tr ? 0.78 : 1), sy * u * (tr ? 0.78 : 1)); g.rotate(Math.sin(t * 0.7 + ph + tr) * 0.018 * (tr ? -1 : 1));
        if (tr) g.transform(0, 1, 1, 0, 0, 0);
        g.globalAlpha *= a; g.lineCap = "round"; g.lineJoin = "round";
        g.beginPath(); VINE.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.lineWidth = 6 * (tr ? 1.15 : 1); g.strokeStyle = F.C("shade", 0.5); g.stroke(); g.lineWidth = 3.2; g.strokeStyle = F.C("deco"); g.stroke();
        for (let i = 6; i < 70; i += 7) {
          const [x, y] = VINE[i], [x2, y2] = VINE[i + 1], an = Math.atan2(y2 - y, x2 - x), side = (i / 7) % 2 ? 1 : -1, sw = Math.sin(t * 1.4 + i * 0.5 + ph) * 0.14, len = 46 * (1 - i / 140);
          g.save(); g.translate(x, y); g.rotate(an + side * 0.95 + sw); g.scale(len, len); g.fillStyle = F.C("deco", 0.22); g.fill(LEAF); g.lineWidth = 2.2 / len; g.strokeStyle = F.C("deco", 0.9); g.stroke(LEAF); g.restore();
        }
        const [ex, ey] = VINE[VINE.length - 1]; g.beginPath(); g.arc(ex, ey, 5.5, 0, TAU); g.fillStyle = F.C("goldHi"); g.fill();
        g.restore();
      }
    }
  }
  function moons(g, F, y, a) {
    const { W, u, t } = F, n = 9, span = W * 0.3, cur = Math.floor(fract(t * 0.16) * n);
    g.save(); g.globalAlpha *= a;
    g.strokeStyle = F.C("deco", 0.55); g.lineWidth = 1.6 * u; g.beginPath(); g.moveTo(W / 2 - span * 0.8, y); g.lineTo(W / 2 - span * 0.58, y); g.moveTo(W / 2 + span * 0.58, y); g.lineTo(W / 2 + span * 0.8, y); g.stroke();
    for (let i = 0; i < n; i++) {
      const x = W / 2 + (i / (n - 1) - 0.5) * span, r = 15 * u, on = i === cur;
      if (on) { const gl = g.createRadialGradient(x, y, 0, x, y, r * 3.2); gl.addColorStop(0, F.C("glow", 0.6)); gl.addColorStop(1, F.C("glow", 0)); g.fillStyle = gl; g.fillRect(x - r * 3.2, y - r * 3.2, r * 6.4, r * 6.4); }
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = F.C("shade", 0.85); g.fill(); g.lineWidth = 1.6 * u; g.strokeStyle = F.C("deco", on ? 1 : 0.75); g.stroke();
      const k = i / (n - 1), ph = k * 2 - 1; g.save(); g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip(); g.fillStyle = F.C(on ? "goldHi" : "deco", on ? 1 : 0.85);
      g.beginPath(); g.arc(x, y, r, -PI / 2, PI / 2, ph < 0); g.ellipse(x, y, Math.abs(ph) * r, r, 0, PI / 2, -PI / 2, ph >= 0); g.fill(); g.restore();
    }
    g.restore();
  }
  function dustMotes(g, F, a) {
    const { W, H, t, u, tex } = F;
    for (const d of DUST) {
      const y = (((d.y - t * d.s) % 1) + 1) % 1, x = d.x + Math.sin(t * 0.6 + d.a) * 0.02;
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * (1 + d.w * 2) + d.ph)), r = d.sz * u * (0.8 + d.w * 0.6);
      g.fillStyle = F.C("dust", 0.16 * tw * a * tex); g.beginPath(); g.arc(x * W, y * H, r * 3.4, 0, TAU); g.fill();
      g.fillStyle = F.C("dust", 0.85 * tw * a); g.beginPath(); g.arc(x * W, y * H, r, 0, TAU); g.fill();
    }
  }
  function deck(g, F, a, off = 0) {
    const { W, H, u, t } = F; g.save(); g.globalAlpha *= a; g.translate(off * 260 * u, off * 340 * u);
    for (let i = 0; i < 5; i++) card(g, F, W - 20 * u - i * 2 * u, H - 6 * u - i * 3 * u, 190 * u, 300 * u, { flip: 0, rot: -0.38 + i * 0.012 + Math.sin(t * 0.9) * 0.008, seed: 3 + i, lite: true });
    g.restore();
  }

  // A hand of cards fanning in from the top or bottom edge; used by the title and the closing line.
  function fan(g, F, info, top, mode, out = 0) {
    const { W, H, u, t } = F, wide = W > H, n = 7, cw = (wide ? 250 : 270) * u, ch = cw * 1.6, peek = (wide ? 0.3 : 0.2) * H, R = ch * 1.5, spread = wide ? 1.25 : 1.0, loc = info.local;
    g.save(); if (top) { g.translate(W, H); g.rotate(PI); }
    const order = [3, 2, 4, 1, 5, 0, 6];
    for (const i of order) {
      const a = ((i - (n - 1) / 2) / (n - 1)) * spread + Math.sin(t * 0.9 + i * 0.8 + (top ? 2 : 0)) * 0.016;
      const cy0 = H - peek + ch / 2, pivY = cy0 + R, delay = Math.abs(i - 3) * 0.07 + (top ? 0.1 : 0), e = eo(seg(loc - delay, 0, 0.55));
      // On the way out every card is gathered, face down, into the deck in the corner.
      const dl = i * 0.045 + (top ? 0.1 : 0), o = eio(seg(out, dl, dl + 0.6));
      const x1 = W / 2 + R * Math.sin(a), y1 = pivY - R * Math.cos(a) + (1 - e) * ch * 1.3 + Math.sin(t * 1.2 + i) * 4 * u;
      const tx = top ? 28 * u : W - 28 * u, ty = top ? 18 * u : H - 18 * u, tr = top ? -0.33 + PI : -0.33;
      const x = lerp(x1, tx, o), y = lerp(y1, ty, o) - Math.sin(o * PI) * H * (top ? -0.08 : 0.12);
      const fl0 = mode === "title" ? eio(seg(loc, 0.55 + Math.abs(i - 3) * 0.16 + (top ? 0.15 : 0), 0.95 + Math.abs(i - 3) * 0.16 + (top ? 0.2 : 0))) : eio(seg(loc, 0.1 + i * 0.1, 0.6 + i * 0.1));
      const fl = fl0 * (1 - eio(seg(o, 0, 0.4)));
      card(g, F, x, y, cw, ch, { rot: lerp(a, tr, o), sc: lerp(1, 190 / (wide ? 250 : 270), o), flip: fl, seed: 90 + i + (top ? 7 : 0), ci: [0, 3, 6, 1, 4, 5, 2][i], glow: i === 3 ? 0.55 * fl : 0, win: "oval", lite: true, alpha: clamp(e * 4) * (1 - seg(o, 0.93, 1)),
        skyTop: F.mixk("skyTop", "ink", 0.1), skyBot: F.mixk("skyBot", "skyTop", [0.2, 0.5, 0.1, 0.4, 0.3, 0.6, 0.15][i]) },
      (gg, win) => { emblem(gg, F, i + (top ? 3 : 0) + (mode === "closing" ? 2 : 0), 0, win.cy, win.s * 0.95, t + i); });
    }
    g.restore();
  }

  const HB = {};
  function headBottom(scene) {
    const id = scene + "-title"; if (HB[id] !== undefined) return HB[id];
    const el = document.getElementById(id), sc = document.getElementById(scene + "-scene");
    return (HB[id] = el && sc ? sc.offsetTop + el.offsetTop + el.offsetHeight : 0);
  }
  const WHEEL_AT = [[0.76, 0.6], [0.24, 0.62], [0.7, 0.4], [0.3, 0.55], [0.74, 0.62], [0.5, 0.5]];

  function stageDraw(g, S, info) {
    CUR = info;
    const F = frameOf(g, S, info), { W, H, u, t } = F, scene = info.scene, idx = Math.max(0, info.index || 0), tall = S.tall;
    // The title's hands sweep back off the edges over its last half second while the deck slides in.
    const lr = scene === "title" && info.next ? seg(info.local, info.hold - 0.55, info.hold) : 0, lv = eio(lr);
    if (S.paint) velvet(g, F);
    // Slow celestial wheel; it drifts to a new place each scene.
    const from = WHEEL_AT[(idx + 5) % 6], to = WHEEL_AT[idx % 6], mv = eio(seg(info.local, 0, 0.9)), big = scene === "title" || scene === "closing";
    let wx = big ? W / 2 : lerp(from[0], to[0], mv) * W, wy = big ? H / 2 : lerp(from[1], to[1], mv) * H, R = big ? Math.min(W, H) * 0.62 : Math.min(W, H) * 0.56, wa = big ? 0.22 : 0.16;
    if (lv > 0) { wx = lerp(wx, WHEEL_AT[0][0] * W, lv); wy = lerp(wy, WHEEL_AT[0][1] * H, lv); R = lerp(R, Math.min(W, H) * 0.56, lv); wa = lerp(wa, 0.16, lv); }
    if (S.paint) wheel(g, F, wx, wy, R, t * 0.07 + idx, wa);
    vines(g, F, S.paint ? 0.62 : 0.0);
    dustMotes(g, F, S.paint ? 1 : 0);
    if (big) {
      // A calm halo behind the words, and hands of cards at the edges.
      g.save(); g.globalAlpha *= 1 - lv; g.translate(W / 2, H / 2); g.scale(1.6, 1); const sc = g.createRadialGradient(0, 0, 0, 0, 0, H * 0.46); sc.addColorStop(0, F.C("shade", 0.55)); sc.addColorStop(1, F.C("shade", 0)); g.fillStyle = sc; g.fillRect(-W, -H, W * 2, H * 2); g.restore();
      g.save(); g.globalAlpha *= 1 - lv;
      rays(g, F, W / 2, H / 2, H * 0.1, Math.hypot(W, H) * 0.7, 28, t * 0.05, F.C("goldHi", 0.06), 0.32);
      const gl = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, H * 0.5); gl.addColorStop(0, F.C("glow", 0.14 + 0.03 * Math.sin(t * 1.5))); gl.addColorStop(1, F.C("glow", 0)); g.fillStyle = gl; g.fillRect(0, 0, W, H);
      g.restore();
      // A gilded wreath rings the words; on the way out it unwinds back into the gold ink it was drawn in.
      const wq = eo(seg(info.local, 0, 0.8)), un = 1 - lv; g.save(); g.translate(W / 2, H / 2); g.globalAlpha *= 0.9 * wq;
      for (const [sx, sy, lw] of [[0.5, 0.3, 3], [0.485, 0.285, 1.5]]) { g.beginPath(); g.ellipse(0, 0, W * sx, H * sy, 0, -PI / 2 - PI * un, -PI / 2 + PI * un); g.lineWidth = lw * u; g.strokeStyle = F.C("deco", 0.9); g.stroke(); }
      if (lv > 0 && lv < 1) for (const sg of [-1, 1]) { const an = -PI / 2 + sg * PI * un; sparkle(g, F, Math.cos(an) * W * 0.5, Math.sin(an) * H * 0.3, 16 * u, 1); }
      g.globalAlpha *= 1 - seg(lv, 0, 0.6);
      laurel(g, F, W * 0.492, H * 0.292, tall ? 54 : 70, t, 9, 5); g.restore();
      if (lv > 0) deck(g, F, 1, 1 - eo(seg(lr, 0, 0.35)));
      fan(g, F, info, false, scene, lr); fan(g, F, info, true, scene, lr);
      if (lv > 0) {
        // The next spread's scrim settles in under where its headline will land.
        const hb = headBottom(info.next) || H * 0.2, sg = g.createLinearGradient(0, 0, 0, hb + 70 * u); sg.addColorStop(0, F.C("shade", 0.5 * lv)); sg.addColorStop(0.7, F.C("shade", 0.3 * lv)); sg.addColorStop(1, F.C("shade", 0)); g.fillStyle = sg; g.fillRect(0, 0, W, hb + 70 * u);
        moons(g, F, H - (tall ? 56 : 42) * u, (S.paint ? 0.9 : 0) * lv);
      }
      if (scene === "closing" && idx > 0 && info.local < 1.1) {
        // The last spread was gathered into the deck; deck and moon row then slide away.
        const go = eio(seg(info.local, 0.5, 1.05)); deck(g, F, 1, go);
        moons(g, F, H - (tall ? 56 : 42) * u, (S.paint ? 0.9 : 0) * (1 - go));
      }
      // Shooting stars cross now and then.
      for (let s = 0; s < 3; s++) { const k = fract(t * 0.33 + s * 0.37), x = lerp(W * (0.1 + s * 0.3), W * (0.4 + s * 0.3), k), y = lerp(H * (0.08 + s * 0.07), H * (0.4 + s * 0.05), k), a = Math.sin(k * PI); g.save(); g.globalAlpha *= a * 0.9; const tg = g.createLinearGradient(x, y, x - 160 * u, y - 70 * u); tg.addColorStop(0, F.C("goldHi", 0.9)); tg.addColorStop(1, F.C("goldHi", 0)); g.strokeStyle = tg; g.lineWidth = 3 * u; g.lineCap = "round"; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 160 * u, y - 70 * u); g.stroke(); g.restore(); sparkle(g, F, x, y, 11 * u, a); }
    } else if (scene) {
      deck(g, F, 1);
      // A scrim keeps the headline readable; a gold rule is ruled under it.
      const hb = headBottom(scene) || H * 0.2, sg = g.createLinearGradient(0, 0, 0, hb + 70 * u); sg.addColorStop(0, F.C("shade", 0.5)); sg.addColorStop(0.7, F.C("shade", 0.3)); sg.addColorStop(1, F.C("shade", 0)); g.fillStyle = sg; g.fillRect(0, 0, W, hb + 70 * u);
      // The rule is inked in gold as the headline arrives, a glowing nib at its head, and wiped back
      // up by the same nib as the headline frosts out, so lettering changes share the card-table hand.
      const x0 = (tall ? 90 : 140) * u, L = Math.min(W - x0 * 2, W * 0.46), y = hb + 18 * u;
      const rq = eio(seg(info.local, 0, 0.75)), ro = info.next ? eio(seg(info.local, info.hold - info.change, info.hold - 0.02)) : 0;
      const a0 = x0 + L * ro, a1 = x0 + L * rq;
      g.save(); g.lineCap = "round";
      if (a1 > a0 + 1) {
        g.strokeStyle = F.C("shade", 0.6); g.lineWidth = 7 * u; g.beginPath(); g.moveTo(a0, y); g.lineTo(a1, y); g.stroke();
        g.strokeStyle = F.C("deco", 0.95); g.lineWidth = 3 * u; g.beginPath(); g.moveTo(a0, y); g.lineTo(a1, y); g.stroke();
        const b1 = x0 + L * 0.8 * rq; if (b1 > a0) { g.lineWidth = 1.4 * u; g.beginPath(); g.moveTo(a0, y + 9 * u); g.lineTo(b1, y + 9 * u); g.stroke(); }
        // A bead of light runs along the ink through the hold.
        const bx = a0 + (a1 - a0) * fract(t * 0.35); const bg = g.createRadialGradient(bx, y, 0, bx, y, 40 * u); bg.addColorStop(0, F.C("goldHi", 0.75)); bg.addColorStop(1, F.C("goldHi", 0)); g.fillStyle = bg; g.fillRect(bx - 40 * u, y - 40 * u, 80 * u, 80 * u);
      }
      const nibs = []; if (rq > 0 && rq < 1) nibs.push([a1, rq]); if (ro > 0 && ro < 1) nibs.push([a0, ro]);
      for (const [nx, q] of nibs) {
        const ng = g.createRadialGradient(nx, y, 0, nx, y, 70 * u); ng.addColorStop(0, F.C("goldHi", 0.85)); ng.addColorStop(1, F.C("goldHi", 0)); g.fillStyle = ng; g.fillRect(nx - 70 * u, y - 70 * u, 140 * u, 140 * u);
        sparkle(g, F, nx, y, 22 * u, 1);
        for (let j = 0; j < 4; j++) { const s2 = fract(q * 3 + j / 4); g.fillStyle = F.C("goldHi", (1 - s2) * 0.9); g.beginPath(); g.arc(nx - s2 * (30 + j * 14) * u, y + Math.sin(j * 2.3) * 8 * u + s2 * s2 * 40 * u, (4 - s2 * 2.5) * u, 0, TAU); g.fill(); }
      }
      if (rq > 0.6 && ro < 0.05) { const sx = x0 + L * rq + 22 * u, sa = seg(rq, 0.6, 1); g.globalAlpha *= sa * (1 - ro * 20); g.fillStyle = F.C("goldHi"); g.fill(star(g, sx, y, 16 * u, 4, 0.3, t * 0.4)); g.beginPath(); g.arc(sx + 36 * u, y, 4 * u, 0, TAU); g.arc(sx + 54 * u, y, 2.6 * u, 0, TAU); g.fill(); }
      g.restore();
    }
    if (!big) moons(g, F, H - (tall ? 56 : 42) * u, S.paint ? 0.9 : 0);
    // A shuffle of face-down cards streams across the frame between spreads.
    // It starts in the last moments of the outgoing spread and runs on, unbroken, into the next.
    const streams = [];
    if (idx > 0 && scene && !big) streams.push(info.local);
    if (scene && info.next && info.next !== "closing" && info.local > info.hold - 0.5) streams.push(info.local - info.hold);
    for (const sl of streams) {
      const span = Math.max(0.6, info.change * 1.6);
      for (let j = 0; j < 8; j++) {
        const s = seg(sl, j * 0.06 - 0.45, j * 0.06 - 0.45 + span); if (s <= 0 || s >= 1) continue;
        const A = [W + 90 * u, H + 90 * u], C = [W * 0.5, H * (1.02 - j * 0.03)], E = [-170 * u, H * (0.48 - j * 0.035)], pt = quad(A, C, E, eio(s));
        const cs = 1 + 0.25 * Math.sin(s * PI); card(g, F, pt[0], pt[1], 200 * u * cs, 320 * u * cs, { flip: 0, rot: lerp(0.5, -2.4, s) + j * 0.12, seed: 3 + j, alpha: Math.min(1, Math.sin(s * PI) * 2.2), lite: true });
      }
    }
    // Gold light sweeps across the frame as one spread gives way to the next.
    if (idx > 0 || scene === "closing") {
      const k = seg(info.local, 0, Math.max(0.5, info.change * 1.8));
      if (k > 0 && k < 1) {
        g.save(); g.translate(W * lerp(-0.25, 1.25, eio(k)), H / 2); g.rotate(0.38);
        const sw = g.createLinearGradient(-W * 0.2, 0, W * 0.2, 0); sw.addColorStop(0, F.C("goldHi", 0)); sw.addColorStop(0.5, F.C("goldHi", 0.34 * Math.sin(k * PI))); sw.addColorStop(1, F.C("goldHi", 0));
        g.fillStyle = sw; g.fillRect(-W * 0.2, -H, W * 0.4, H * 2); g.restore();
      }
    }
  }

  // Over everything: print grain, a soft vignette and a few glints that catch the light.
  function paintTop(g, W, H, t, accent, look) {
    g.clearRect(0, 0, W, H);
    const T = prep(look.tone), R = T._r, u = Math.min(W, H) / 1080, tex = 1;
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, Math.hypot(W, H) * 0.6); vg.addColorStop(0, rgba(R.shade, 0)); vg.addColorStop(1, rgba(R.shade, 0.3)); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    g.save(); g.globalAlpha = 0.5; g.fillStyle = g.createPattern(grainTile(), "repeat"); const f = Math.floor(t * 12); g.translate((f * 53) % 220, (f * 91) % 220); g.fillRect(-220, -220, W + 440, H + 440); g.restore();
    for (const gl of GLINTS) {
      const a = Math.pow(Math.max(0, Math.sin(t * gl.sp + gl.ph)), 6); if (a < 0.03) continue;
      const x = gl.x * W + Math.sin(t * 0.3 + gl.ph) * 14 * u, y = gl.y * H, r = gl.r * u * (0.5 + a);
      g.save(); g.globalAlpha = a * 0.9; g.fillStyle = rgba(R.goldHi, 1); g.beginPath();
      for (let i = 0; i < 8; i++) { const an = -PI / 2 + (i * PI) / 4, rr = i % 2 ? r * 0.16 : r; g.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); } g.fill(); g.restore();
    }
  }

  const PAL = {
    light: { v0: "#b4a77f", v1: "#d3c7a1", v2: "#efe5c4", shade: "#43351f", deco: "#8a6322", dust: "#9a6f22", fold: 0.24, vig: 0.28, light: true },
    dark: { v0: "#06030a", v1: "#140919", v2: "#4a2762", shade: "#020104", deco: "#e8bd5c", fold: 0.18, vig: 0.62 },
    mono: {
      v0: "#131313", v1: "#242424", v2: "#4b4b4b", paper: "#e8e6e1", paperLo: "#b6b3ab", paperHi: "#f6f5f1", ink: "#1b1b1b", gold: "#cdcdcd", goldHi: "#ffffff", goldLo: "#6a6a6a", deco: "#d6d6d6", back: "#3a3a3a", backLo: "#1b1b1b",
      skyTop: "#2a2e35", skyBot: "#8f8f8f", cream: "#f0efeb", glow: "#ffffff", shade: "#060606", dust: "#f2f2f2", bronze: "#8a8a8a", c: ["#6c7378", "#888888", "#b1b1b1", "#9b9797", "#57575b", "#7b7f79", "#43474e"],
    },
  };
  TONE.bronze = "#b08650";
  const tone = (o) => ({ ...TONE, ...o });
  const headShadow = (dark) => () => (dark ? "0 2px 2px rgba(4,12,11,0.9), 0 0 4px rgba(4,12,11,0.9), 0 0 26px rgba(4,14,13,0.95)" : "0 0 3px rgba(240,230,200,0.95), 0 0 24px rgba(240,230,200,0.95)");

  return {
    bg: "#0f3633", panel: "rgba(246,232,189,0.06)", ink: "#f6e8bd", muted: "#cdbd8f", accent: "#e8bd5c", onAccent: "#2a1e16",
    rule: "rgba(246,232,189,0.5)", track: "rgba(246,232,189,0.12)",
    display: SERIF, displayWeight: 600, displayTracking: "0.01em", body: LABEL, bodyWeight: 600, figures: SERIF, radius: 10,
    motion: "focus", change: "frost", kit: { line: 2.4, fill: "solid", panel: "fill" },
    tone: tone({}),
    keepArt: true, overlap: true,
    palettes: {
      light: { bg: "#d3c7a1", ink: "#2a1e16", muted: "#6b5a3c", accent: "#9b5a1c", onAccent: "#fbf2d6", rule: "rgba(42,30,22,0.6)", track: "rgba(42,30,22,0.1)", textShadow: headShadow(false), backdrop: () => "#d3c7a1", tone: tone(PAL.light) },
      dark: { bg: "#140919", textShadow: headShadow(true), backdrop: () => "#140919", tone: tone(PAL.dark) },
      mono: { bg: "#242424", ink: "#f2f1ed", muted: "#bdbdbd", accent: "#f2f2f2", onAccent: "#1b1b1b", textShadow: headShadow(true), backdrop: () => "#242424", tone: tone(PAL.mono) },
    },
    textShadow: headShadow(true),
    backdrop: () => "#0f3633",
    paint: paintTop, paintOver: true,
    stage(ctx, S, info) { stageDraw(ctx, S, info); },
    scenes: { chart, object, people, process, compare },
  };
});
