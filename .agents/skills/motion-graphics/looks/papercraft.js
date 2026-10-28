// Papercraft: low-poly cardstock models on a self-healing cutting mat under a desk lamp. Every
// drawing is a little paper model: printed die-cut nets lie flat with dashed fold lines and glue
// tabs, then fold up into faceted boxes, prisms and pop-up figures that cast soft shadows. Each scene
// is a station along the mat; the camera slides from one station to the next while the old models
// fold back down into flat nets. Headlines sit on standing tent cards. All models are original.
// Frames are pure functions of time.
window.DreamcutMotion.register("papercraft", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const inout = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const backOut = (v) => { v = clamp(v); const c = 1.7, w = v - 1; return 1 + (c + 1) * w * w * w + c * w * w; };
  const span = (v, a, b) => clamp((v - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const frac = (v) => v - Math.floor(v);
  const DISPLAY = "Rockwell, 'Roboto Slab', 'Rockwell Nova', Georgia, serif";
  const BODY = "'Avenir Next', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

  // Camera: an orthographic view looking down at the mat. u runs right, v runs away, z up.
  const EL = 0.7, SE = Math.sin(EL), CE = Math.cos(EL);
  const GRID = -0.27;
  const PITCH_K = 1.0;
  const HEADS = { title: ["kicker", "title"], chart: ["chart-title"], object: ["object-title"], people: ["people-title"], process: ["process-title"], compare: ["compare-title"], closing: ["closing"] };

  // ---- colour ----------------------------------------------------------------------------------------
  const rgbCache = {};
  function rgb(c) {
    if (rgbCache[c]) return rgbCache[c];
    const n = parseInt(String(c).slice(1), 16);
    return (rgbCache[c] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]);
  }
  function tone(c, k) {
    const [r, g, b] = rgb(c);
    if (k <= 1) return `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
    const m = Math.min(1, k - 1);
    return `rgb(${Math.round(r + (255 - r) * m)},${Math.round(g + (255 - g) * m)},${Math.round(b + (255 - b) * m)})`;
  }
  const rgba = (c, a) => { const [r, g, b] = rgb(c); return `rgba(${r},${g},${b},${a})`; };

  // ---- vectors -----------------------------------------------------------------------------------------
  const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  // ---- transforms: local model space → mat space ------------------------------------------------------
  function place(F, ou, sx, sy, yaw = 0, z0 = 0) {
    const c = Math.cos(yaw), s = Math.sin(yaw), bu = ou + LU(F, sx), bv = LV(F, sy);
    return (x, y, z) => [bu + x * c - y * s, bv + x * s + y * c, z0 + z];
  }
  // Pop-up: the part lies flat behind its hinge (y = hy) and stands as f runs 0 → 1 (f > 1 leans forward).
  const pop = (X, hy, f) => { const a = (1 - f) * -Math.PI / 2, c = Math.cos(a), s = Math.sin(a); return (x, y, z) => X(x, hy + (y - hy) * c - z * s, (y - hy) * s + z * c); };
  const rotZ = (X, a, cx = 0, cy = 0) => { const c = Math.cos(a), s = Math.sin(a); return (x, y, z) => X(cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c, z); };
  const rotY = (X, a, px = 0, pz = 0) => { const c = Math.cos(a), s = Math.sin(a); return (x, y, z) => X(px + (x - px) * c - (z - pz) * s, y, pz + (x - px) * s + (z - pz) * c); };
  const rotX = (X, a, py = 0, pz = 0) => { const c = Math.cos(a), s = Math.sin(a); return (x, y, z) => X(x, py + (y - py) * c - (z - pz) * s, pz + (y - py) * s + (z - pz) * c); };
  const shift = (X, dx, dy, dz) => (x, y, z) => X(x + dx, y + dy, z + dz);
  const sway = (X, sx, sy) => (x, y, z) => X(x + z * sx, y + z * sy, z);
  const scaleXf = (X, k) => (x, y, z) => X(x * k, y * k, z * k);

  // ---- frame state -------------------------------------------------------------------------------------
  let frame = null;
  const LU = (F, sx) => (sx - F.W / 2) / F.u;
  const LV = (F, sy) => (F.H / 2 - sy) / (F.u * SE);
  function proj(F, p) { return [F.cx + (p[0] - F.camU) * F.s, F.cy - ((p[1] - F.camV) * SE + p[2] * CE) * F.s]; }
  const farOf = (p) => p[1] * CE - p[2] * SE;

  // ---- textures ------------------------------------------------------------------------------------------
  let tiles = null, tileKey = "";
  function makeTiles(F) {
    const T = F.T, u = F.u;
    const mk = (w, h) => { const c = document.createElement("canvas"); c.width = Math.max(8, Math.round(w)); c.height = Math.max(8, Math.round(h)); return c; };
    // Paper fibre: speckles and short fibres, light and dark.
    const fibre = mk(256, 256), fg = fibre.getContext("2d"), r = rng(31);
    for (let i = 0; i < 1500; i++) { fg.fillStyle = r() < 0.5 ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.12)"; fg.fillRect(r() * 256, r() * 256, 1 + r() * 1.4, 1 + r() * 1.4); }
    fg.lineWidth = 0.8;
    for (let i = 0; i < 160; i++) {
      const x = r() * 256, y = r() * 256, a = r() * TAU, l = 4 + r() * 12;
      fg.strokeStyle = r() < 0.5 ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.12)";
      fg.beginPath(); fg.moveTo(x, y); fg.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); fg.stroke();
    }
    // Mat vinyl: fine speckle plus soft blotches.
    const S = Math.round(320 * u), mat = mk(S, S), mg = mat.getContext("2d"), r2 = rng(77);
    for (let i = 0; i < 26; i++) {
      const x = r2() * S, y = r2() * S, rad = (30 + r2() * 90) * u;
      const gr = mg.createRadialGradient(x, y, 0, x, y, rad);
      const tint = r2() < 0.5 ? `rgba(${T.matLite},${0.05})` : "rgba(0,0,0,0.06)";
      gr.addColorStop(0, tint); gr.addColorStop(1, "rgba(0,0,0,0)");
      mg.fillStyle = gr;
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { mg.save(); mg.translate(ox, oy); mg.fillRect(x - rad, y - rad, rad * 2, rad * 2); mg.restore(); }
    }
    for (let i = 0; i < 2600; i++) { mg.fillStyle = r2() < 0.5 ? `rgba(${T.matLite},0.07)` : "rgba(0,0,0,0.09)"; mg.fillRect(r2() * S, r2() * S, 1.2 * u, 1.2 * u); }
    // Old knife scores in the mat.
    mg.lineWidth = 0.9 * u;
    for (let i = 0; i < 14; i++) {
      const x = r2() * S, y = r2() * S, a = r2() * TAU, l = (40 + r2() * 140) * u;
      mg.strokeStyle = `rgba(${T.matLite},0.07)`;
      mg.beginPath(); mg.moveTo(x, y); mg.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); mg.stroke();
    }
    return { fibre, mat, S, pats: new Map() };
  }
  function pattern(g, name) {
    const key = name;
    if (!tiles.pats.has(key)) tiles.pats.set(key, g.createPattern(tiles[name], "repeat"));
    return tiles.pats.get(key);
  }
  const layers = {};
  function layerCanvas(name, w, h) {
    let c = layers[name];
    if (!c || c.width !== w || c.height !== h) { c = layers[name] = document.createElement("canvas"); c.width = w; c.height = h; }
    return c;
  }

  // ---- the face renderer -----------------------------------------------------------------------------------
  // Faces are collected per scene, sorted back to front (layer, object, face), shaded by a lamp and
  // printed through an affine map so artwork sits on the cardstock.
  class Build {
    constructor(F) { this.F = F; this.list = []; this.sh = []; this.ct = []; this.over = []; this.o = null; this.n = 0; this.alpha = 1; }
    obj(layer, base) { this.o = { layer, far: farOf(base), n: this.n++ }; return this; }
    face(pts, col, opt = {}) {
      if (!this.o) this.obj(2, pts[0]);
      let far = 0;
      for (const p of pts) far += farOf(p);
      this.list.push({ pts, col, opt, o: this.o, a: this.alpha * (opt.alpha ?? 1), far: far / pts.length });
      if (!opt.noShadow) this.sh.push(pts);
    }
    contact(pts) { this.ct.push(pts); }
    render(g) {
      const F = this.F, { W, H } = F;
      if (this.sh.length) shadowPass(g, F, this.sh, true, F.T.shadowA * this.alpha, 8 * F.u);
      if (this.ct.length) shadowPass(g, F, this.ct, false, F.T.shadowA * 0.9 * this.alpha, 2.2 * F.u);
      const m = layerCanvas("mdl", W, H), mg = m.getContext("2d");
      mg.setTransform(1, 0, 0, 1, 0, 0); mg.globalAlpha = 1; mg.globalCompositeOperation = "source-over";
      mg.clearRect(0, 0, W, H);
      this.list.sort((a, b) => a.o.layer - b.o.layer || b.o.far - a.o.far || a.o.n - b.o.n || b.far - a.far);
      for (const f of this.list) drawFace(mg, F, f);
      if (F.tex > 0) {
        mg.globalCompositeOperation = "source-atop"; mg.globalAlpha = 0.7 * F.tex;
        mg.fillStyle = pattern(mg, "fibre"); mg.fillRect(0, 0, W, H);
        mg.globalCompositeOperation = "source-over"; mg.globalAlpha = 1;
      }
      g.drawImage(m, 0, 0);
      for (const fn of this.over) fn(g);
    }
  }
  function shadowPass(g, F, polys, cast, alpha, blur) {
    if (alpha <= 0) return;
    const k = 1 / 3, w = Math.ceil(F.W * k), h = Math.ceil(F.H * k);
    const a = layerCanvas("sa", w, h), b = layerCanvas("sb", w, h), ag = a.getContext("2d"), bg = b.getContext("2d");
    ag.setTransform(1, 0, 0, 1, 0, 0); ag.clearRect(0, 0, w, h); ag.setTransform(k, 0, 0, k, 0, 0);
    ag.fillStyle = "#000";
    const L = F.L;
    for (const poly of polys) {
      ag.beginPath();
      poly.forEach((p, i) => {
        const z = Math.max(0, p[2]);
        const q = cast ? [p[0] - (L[0] * z) / L[2], p[1] - (L[1] * z) / L[2], 0] : [p[0], p[1], 0];
        const s = proj(F, q);
        i ? ag.lineTo(s[0], s[1]) : ag.moveTo(s[0], s[1]);
      });
      ag.closePath(); ag.fill();
    }
    bg.setTransform(1, 0, 0, 1, 0, 0); bg.clearRect(0, 0, w, h);
    bg.filter = `blur(${Math.max(0.5, blur * k)}px)`; bg.drawImage(a, 0, 0); bg.filter = "none";
    g.save(); g.globalAlpha = alpha; g.imageSmoothingEnabled = true; g.drawImage(b, 0, 0, F.W, F.H); g.restore();
  }
  function newell(pts) {
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      x += (a[1] - b[1]) * (a[2] + b[2]); y += (a[2] - b[2]) * (a[0] + b[0]); z += (a[0] - b[0]) * (a[1] + b[1]);
    }
    let n = norm([x, y, z]);
    if (n[1] * -CE + n[2] * SE < 0) n = [-n[0], -n[1], -n[2]];
    return n;
  }
  function trace(g, P) { g.beginPath(); P.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); }
  function drawFace(g, F, f) {
    const P = f.pts.map((p) => proj(F, p)), o = f.opt, u = F.u;
    let area = 0;
    for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; area += a[0] * b[1] - b[0] * a[1]; }
    if (Math.abs(area) < 0.5 && !o.thread) return;
    const front = area > 0;
    const n = newell(f.pts), L = F.L;
    let lit = o.flat ? 1 : 0.6 + 0.5 * Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
    const col = !front && o.inside ? o.inside : f.col;
    g.globalAlpha = clamp(f.a);
    trace(g, P);
    g.fillStyle = col; g.fill();
    if (front && o.print && P.length === 4) {
      const w = Math.hypot(...sub(f.pts[1], f.pts[0])), h = Math.hypot(...sub(f.pts[3], f.pts[0]));
      if (w > 0.5 && h > 0.5) {
        g.save(); trace(g, P); g.clip();
        g.setTransform((P[1][0] - P[0][0]) / w, (P[1][1] - P[0][1]) / w, (P[3][0] - P[0][0]) / h, (P[3][1] - P[0][1]) / h, P[0][0], P[0][1]);
        o.print(g, w, h);
        g.restore();
      }
    }
    if (!o.flat) {
      trace(g, P);
      g.fillStyle = lit < 1 ? `rgba(${F.T.shadeRGB},${(1 - lit) * 0.92})` : `rgba(255,250,240,${(lit - 1) * 0.9})`;
      g.fill();
    }
    if (!o.thread) {
      g.lineJoin = "round"; g.lineWidth = 1.1 * u;
      g.strokeStyle = `rgba(${F.T.edgeRGB},${o.edge ?? 0.3})`;
      g.stroke();
      if (front && P.length === 4 && !o.noLip) {
        // The cut edge of the cardstock catches the lamp.
        g.beginPath(); g.moveTo(P[0][0], P[0][1]); g.lineTo(P[1][0], P[1][1]);
        g.strokeStyle = "rgba(255,255,255,0.32)"; g.lineWidth = 1.3 * u; g.stroke();
      }
    }
    if (o.fold) for (const [i, j, a] of o.fold) {
      if (a <= 0.02) continue;
      g.save(); g.setLineDash([7 * u, 5 * u]); g.lineWidth = 1.4 * u; g.strokeStyle = `rgba(${F.T.edgeRGB},${0.55 * a})`;
      g.beginPath(); g.moveTo(P[i][0], P[i][1]); g.lineTo(P[j][0], P[j][1]); g.stroke(); g.restore();
    }
    g.globalAlpha = 1;
  }

  // ---- model builders ------------------------------------------------------------------------------------
  // A box that folds up from its die-cut net: four sides hinge up from the base, the lid folds over last.
  function boxNet(B, X, w, d, h, f, col, o = {}) {
    const ins = o.inside || tone(col, 1.22);
    B.obj(o.layer ?? 2, X(0, 0, o.baseZ || 0));
    const pr = o.print || {};
    B.face([X(-w / 2, d / 2, 0), X(w / 2, d / 2, 0), X(w / 2, -d / 2, 0), X(-w / 2, -d / 2, 0)], ins, { flat: f < 0.02, noLip: true, print: o.floorPrint });
    const sides = [
      { o: [0, -1], c: [0, -d / 2], len: w, s: span(f, 0, 0.5), key: "front", tabs: true },
      { o: [1, 0], c: [w / 2, 0], len: d, s: span(f, 0.08, 0.58), key: "right" },
      { o: [-1, 0], c: [-w / 2, 0], len: d, s: span(f, 0.16, 0.66), key: "left" },
      { o: [0, 1], c: [0, d / 2], len: w, s: span(f, 0.24, 0.74), key: "back", tabs: true },
    ];
    let backTop = null;
    for (const sd of sides) {
      const ph = ease(sd.s) * Math.PI / 2, dir = [sd.o[0] * Math.cos(ph), sd.o[1] * Math.cos(ph), Math.sin(ph)];
      const l = [-sd.o[1], sd.o[0], 0], hl = sd.len / 2;
      const BL = [sd.c[0] - l[0] * hl, sd.c[1] - l[1] * hl, 0], BR = [sd.c[0] + l[0] * hl, sd.c[1] + l[1] * hl, 0];
      const TL = add(BL, dir, h), TR = add(BR, dir, h);
      if (sd.key === "back") backTop = ph;
      B.face([TL, TR, BR, BL].map((p) => X(...p)), (o.sideCols && o.sideCols[sd.key]) || col, { inside: ins, print: pr[sd.key], fold: sd.s < 1 ? [[2, 3, 1 - sd.s]] : null });
      if (sd.tabs && sd.s < 0.7) {
        const tw = Math.min(h, sd.len) * 0.16 * (1 - sd.s / 0.7);
        for (const side of [-1, 1]) {
          const a = side < 0 ? TL : TR, b = side < 0 ? BL : BR;
          const off = [l[0] * side * tw, l[1] * side * tw, 0];
          const ta = add(add(a, off), dir, -h * 0.12), tb = add(add(b, off), dir, h * 0.12);
          B.face([a, ta, tb, b].map((p) => X(...p)), tone(col, 0.86), { inside: tone(ins, 0.94), noShadow: true, noLip: true, fold: [[3, 0, 1]] });
        }
      }
    }
    if (o.open) { if (!o.noContact) B.contact([X(-w / 2, d / 2, 0), X(w / 2, d / 2, 0), X(w / 2, -d / 2, 0), X(-w / 2, -d / 2, 0)]); return; }
    const lid = ease(span(f, 0.7, 1)) * Math.PI / 2 - (o.lidOpen || 0), a = backTop + lid;
    const T0y = d / 2 + Math.cos(backTop) * h, T0z = Math.sin(backTop) * h, vt = [0, Math.cos(a), Math.sin(a)];
    const TL = [-w / 2, T0y, T0z], TR = [w / 2, T0y, T0z];
    B.face([TL, TR, add(TR, vt, d), add(TL, vt, d)].map((p) => X(...p)), (o.sideCols && o.sideCols.top) || col, { inside: ins, print: pr.top, fold: lid < 1.55 ? [[0, 1, 1 - lid / 1.57]] : null });
    if (!o.noContact) B.contact([X(-w / 2, d / 2, 0), X(w / 2, d / 2, 0), X(w / 2, -d / 2, 0), X(-w / 2, -d / 2, 0)]);
  }
  // A faceted n-sided prism or frustum, sides ordered left to right as seen from outside.
  function prism(B, X, n, r0, r1, z0, z1, col, o = {}) {
    const rot = o.rot || 0;
    const ring = (r, z) => Array.from({ length: n }, (_, i) => { const a = rot + (i * TAU) / n; return [Math.cos(a) * r, Math.sin(a) * r, z]; });
    const lo = ring(r0, z0), hi = ring(r1, z1);
    if (!o.keep) B.obj(o.layer ?? 2, X(0, 0, z0));
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      B.face([hi[i], hi[j], lo[j], lo[i]].map((p) => X(...p)), o.cols ? o.cols[i % o.cols.length] : col, { print: o.face && i === o.face.i ? o.face.fn : null, noShadow: o.noShadow, noLip: true });
    }
    if (o.cap) { const ap = [0, 0, z1 + o.cap]; for (let i = 0; i < n; i++) B.face([hi[i], hi[(i + 1) % n], ap].map((p) => X(...p)), o.capCol || col, { noShadow: o.noShadow }); }
    else B.face(hi.map((p) => X(...p)), o.topCol || col, { noShadow: o.noShadow, print: o.topPrint });
    if (o.contact) B.contact(lo.map((p) => X(p[0], p[1], 0)));
  }
  // A rod between two points with an n-sided section; optional cone tip at the far end.
  function rod(B, X, a, b, r, n, col, o = {}) {
    const ax = sub(b, a), dir = norm(ax), up = Math.abs(dir[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const p1 = norm(cross(dir, up)), p2 = cross(p1, dir);
    const ring = (c, rr) => Array.from({ length: n }, (_, i) => { const t = (i * TAU) / n + (o.rot || 0); return add(add(c, p1, Math.cos(t) * rr), p2, Math.sin(t) * rr); });
    const A = ring(a, r), Bq = ring(b, r);
    if (!o.keep) B.obj(o.layer ?? 2, X(...a));
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; B.face([A[i], A[j], Bq[j], Bq[i]].map((p) => X(...p)), o.cols ? o.cols[i % o.cols.length] : col, { noShadow: o.noShadow, noLip: true, edge: 0.18 }); }
    if (o.tip) {
      const tp = add(b, dir, o.tip), mid = o.tipMid ? add(b, dir, o.tip * o.tipMid) : null;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        if (mid) {
          const M = ring(add(b, dir, o.tip * o.tipMid), r * (1 - o.tipMid));
          B.face([Bq[i], Bq[j], M[j], M[i]].map((p) => X(...p)), o.tipCol, { noShadow: o.noShadow, noLip: true });
          B.face([M[i], M[j], tp].map((p) => X(...p)), o.leadCol || o.tipCol, { noShadow: o.noShadow });
        } else B.face([Bq[i], Bq[j], tp].map((p) => X(...p)), o.tipCol, { noShadow: o.noShadow });
      }
    }
    if (o.capA) B.face(A.map((p) => X(...p)), o.capA, { noShadow: o.noShadow });
  }
  // A flat polygon in the x–z plane extruded along y (front at −y).
  function extrude(B, X, poly, depth, col, o = {}) {
    const y0 = -depth / 2, y1 = depth / 2;
    if (!o.keep) B.obj(o.layer ?? 2, X(0, 0, 0));
    const side = o.sideCol || tone(col, 0.82);
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      B.face([[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]].map((p) => X(...p)), side, { noLip: true, noShadow: o.noShadow });
    }
    B.face(poly.map((p) => X(p[0], y1, p[1])), side, { noShadow: o.noShadow });
    B.face(poly.map((p) => X(p[0], y0, p[1])), col, { noShadow: o.noShadow });
  }
  // A thin thread or string between two mat-space points, sorted like any face.
  function thread(B, a, b, col, w = 1.6) {
    B.face([a, b, add(b, [w, 0, 0]), add(a, [w, 0, 0])], col, { thread: true, flat: true, noShadow: true });
  }
  // A standing tent card: two panels leaning on each other, the front one printed.
  function tent(B, X, w, h, f, o = {}) {
    // Standing cards breathe a little in the lamp's draught, so no hold goes still.
    const wob = o.still ? 0 : 0.035 * Math.sin(frame.t * 1.7 + X(0, 0, 0)[0] * 0.011) * clamp(f);
    const beta = lerp(0.03, 1.18, clamp(f, 0, 1.06)) + wob, b = h * Math.cos(beta), z = h * Math.sin(beta);
    const card = o.col || frame.T.card;
    B.obj(o.layer ?? 2, X(0, -b, 0));
    B.face([X(w / 2, 0, z), X(-w / 2, 0, z), X(-w / 2, b, 0), X(w / 2, b, 0)], tone(card, 0.86), { noLip: true });
    B.face([X(-w / 2, 0, z), X(w / 2, 0, z), X(w / 2, -b, 0), X(-w / 2, -b, 0)], card, { print: (g, pw, ph) => cardPrint(g, pw, ph, o), inside: tone(card, 0.9) });
    B.contact([X(-w / 2, -b, 0), X(w / 2, -b, 0), X(w / 2, b, 0), X(-w / 2, b, 0)]);
  }
  function cardPrint(g, w, h, o) {
    const F = frame;
    g.fillStyle = o.stripe || F.accent; g.fillRect(0, 0, w, Math.max(6, h * 0.075));
    g.strokeStyle = rgba(F.T.inkHex, 0.18); g.lineWidth = 1.5; g.setLineDash([6, 5]);
    g.strokeRect(10, h * 0.075 + 8, w - 20, h - h * 0.075 - 18); g.setLineDash([]);
    const lines = o.lines || [];
    const total = lines.reduce((s, l) => s + l.size * (l.lead ?? 1.12), 0);
    let y = h * 0.075 / 2 + h / 2 - total / 2;
    for (const l of lines) {
      const lh = l.size * (l.lead ?? 1.12);
      say(g, l.text, w / 2, y + lh / 2, l.size, { color: l.color || F.T.inkHex, font: l.font, weight: l.weight, maxW: w - 34, min: l.min });
      y += lh;
    }
  }
  function say(g, s, x, y, size, o = {}) {
    s = String(s ?? "");
    if (!s) return 0;
    const fam = o.font === "body" ? BODY : DISPLAY, wt = o.weight || (o.font === "body" ? 600 : 700);
    g.font = `${wt} ${size}px ${fam}`;
    let w = g.measureText(s).width;
    if (o.maxW && w > o.maxW) { size = Math.max(o.min || size * 0.7, (size * o.maxW) / w); g.font = `${wt} ${size}px ${fam}`; w = g.measureText(s).width; }
    g.textAlign = o.align || "center"; g.textBaseline = o.base || "middle"; g.fillStyle = o.color || frame.T.inkHex;
    g.fillText(s, x, y);
    return w;
  }
  function textWidth(s, size, font = "display", weight) {
    const g = layerCanvas("measure", 4, 4).getContext("2d");
    g.font = `${weight || (font === "body" ? 600 : 700)} ${size}px ${font === "body" ? BODY : DISPLAY}`;
    return g.measureText(String(s ?? "")).width;
  }
  // Counts toward a target with the target's own decimals, so a count never shows stray fractions.
  const fmt = (target, d, k = 1) => window.DreamcutMotion.formatNumber(k >= 1 ? target : target * k, Math.abs((Number(target) || 0) % 1) > 0.001 ? 1 : 0, (d && d.prefix) || "", (d && d.suffix) || "");

  // ---- small craft objects ---------------------------------------------------------------------------------
  function pinwheel(B, X, H, R, f, spin, cols) {

    const P = pop(X, 6, f);
    rod(B, P, [0, 0, 0], [0, 0, H], 4.5, 4, frame.T.wood, { layer: 2 });
    B.contact([X(-8, -8, 0), X(8, -8, 0), X(8, 8, 0), X(-8, 8, 0)]);
    const c = [0, -7, H];
    for (let k = 0; k < 4; k++) {
      const a = spin + (k * Math.PI) / 2, rr = R;
      const tip = [c[0] + Math.cos(a) * rr, c[1], c[2] + Math.sin(a) * rr];
      const mid = [c[0] + Math.cos(a + 0.8) * rr * 0.62, c[1] - rr * 0.32, c[2] + Math.sin(a + 0.8) * rr * 0.62];
      const inn = [c[0] + Math.cos(a - 0.55) * rr * 0.36, c[1], c[2] + Math.sin(a - 0.55) * rr * 0.36];
      B.face([c, tip, mid].map((p) => P(...p)), cols[k % cols.length], { noLip: true });
      B.face([c, inn, tip].map((p) => P(...p)), tone(cols[k % cols.length], 0.82), { noLip: true });
    }
    prism(B, (x, y, z) => P(c[0] + x, c[1] - 4 + y, c[2] - 7 + z), 6, 7, 7, 0, 14, frame.T.card, { keep: true });
  }
  function pushpin(B, X, col) {
    prism(B, X, 8, 13, 9, 0, 6, tone(col, 0.85), { layer: 1, contact: true });
    prism(B, X, 8, 7, 6, 6, 18, col, { keep: true });
    prism(B, X, 8, 11, 11, 18, 24, col, { keep: true, topCol: tone(col, 1.12) });
  }
  function pencil(B, X, len, col) {
    rod(B, X, [-len / 2, 0, 11], [len / 2, 0, 11], 11, 6, col, { layer: 1, tip: 46, tipMid: 0.72, tipCol: frame.T.wood, leadCol: "#3a3a3a", capA: "#f2c6c0", rot: Math.PI / 6 });
    B.contact([X(-len / 2, -9, 0), X(len / 2 + 30, -5, 0), X(len / 2 + 30, 5, 0), X(-len / 2, 9, 0)]);
  }
  function knife(B, X, len, col) {
    rod(B, X, [-len / 2, 0, 9], [len * 0.28, 0, 9], 9, 6, col, { layer: 1, rot: Math.PI / 6 });
    rod(B, X, [len * 0.28, 0, 9], [len * 0.36, 0, 9], 10.5, 6, "#c9ced3", { keep: true, rot: Math.PI / 6 });
    B.face([X(len * 0.36, -6, 4), X(len * 0.36, 6, 4), X(len * 0.52, -1, 1.5)], "#dfe4e8", { noLip: true });
    B.contact([X(-len / 2, -8, 0), X(len * 0.5, -6, 0), X(len * 0.5, 6, 0), X(-len / 2, 8, 0)]);
  }
  function tape(B, X, r, col) {
    prism(B, X, 14, r, r, 0, 24, col, { layer: 1, contact: true, cols: [col, tone(col, 0.92)], topCol: tone(col, 1.1) });
    prism(B, X, 14, r * 0.62, r * 0.62, 24, 24.4, frame.T.mat, { keep: true, noShadow: true });
  }
  function scrap(B, X, r, col, seed) {
    const g = rng(seed), n = 3 + Math.floor(g() * 3), pts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU + g() * 0.6, rr = r * (0.55 + g() * 0.6); pts.push(X(Math.cos(a) * rr, Math.sin(a) * rr, 0.8)); }
    B.obj(0, pts[0]);
    B.face(pts, col, { noLip: true });
  }
  // A cardstock sheet the parts were punched from: dashed die lines and empty windows.
  function sprue(B, X, w, h, seed) {
    const T = frame.T;
    B.obj(0, X(0, 0, 0));
    B.face([X(-w / 2, h / 2, 1), X(w / 2, h / 2, 1), X(w / 2, -h / 2, 1), X(-w / 2, -h / 2, 1)], T.card, {
      print: (g, pw, ph) => {
        const r = rng(seed);
        g.strokeStyle = rgba(T.inkHex, 0.35); g.lineWidth = 2.2; g.setLineDash([10, 7]);
        for (let i = 0; i < 4; i++) {
          const x = 30 + (i % 2) * pw * 0.5, y = 30 + Math.floor(i / 2) * ph * 0.5, bw = pw * 0.5 - 60, bh = ph * 0.5 - 60;
          const k = r();
          g.beginPath();
          if (k < 0.5) { g.rect(x + bw * 0.3, y, bw * 0.4, bh); g.rect(x, y + bh * 0.3, bw, bh * 0.4); }
          else { g.moveTo(x + bw / 2, y); g.lineTo(x + bw, y + bh); g.lineTo(x, y + bh); g.closePath(); }
          if (r() < 0.55) { g.save(); g.fillStyle = T.mat; g.globalAlpha = 0.92; g.fill(); g.restore(); }
          g.stroke();
        }
        g.setLineDash([]);
        g.fillStyle = rgba(T.inkHex, 0.45); g.font = `700 22px ${BODY}`; g.textAlign = "left"; g.textBaseline = "top";
        g.fillText(`SHEET ${String(1 + Math.floor(r() * 9)).padStart(2, "0")}  ·  CUT  ·  SCORE  ·  FOLD`, 18, ph - 34);
      },
    });
  }

  // ---- the mat and its props ---------------------------------------------------------------------------------
  function mat(g, F) {
    const { W, H, u, T } = F;
    g.save();
    g.fillStyle = T.mat; g.fillRect(0, 0, W, H);
    if (F.tex > 0) {
      g.globalAlpha = F.tex;
      const S = tiles.S * (F.s / u), ox = -((F.camU * F.s) % S), oy = ((F.camV * SE * F.s) % S);
      g.save(); g.translate(ox, oy); g.scale(F.s / u, F.s / u);
      g.fillStyle = pattern(g, "mat"); g.fillRect(-tiles.S * 2, -tiles.S * 2, (W / F.s) * u + tiles.S * 4, (H / F.s) * u + tiles.S * 4);
      g.restore(); g.globalAlpha = 1;
    }
    // Grid lines: minor every 30, major every 150, rotated on the mat.
    const c = Math.cos(GRID), s = Math.sin(GRID);
    const corners = [[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => {
      const uu = (x - F.cx) / F.s + F.camU, vv = (F.cy - y) / (F.s * SE) + F.camV;
      return [uu * c + vv * s, -uu * s + vv * c];
    });
    const gx0 = Math.min(...corners.map((p) => p[0])), gx1 = Math.max(...corners.map((p) => p[0]));
    const gy0 = Math.min(...corners.map((p) => p[1])), gy1 = Math.max(...corners.map((p) => p[1]));
    const toS = (gx, gy) => proj(F, [gx * c - gy * s, gx * s + gy * c, 0]);
    const step = 30;
    for (const level of [0, 1, 2]) {
      g.beginPath();
      for (let gx = Math.ceil(gx0 / step) * step; gx < gx1; gx += step) {
        const k = Math.round(gx / step), lv = k % 25 === 0 ? 2 : k % 5 === 0 ? 1 : 0;
        if (lv !== level) continue;
        const a = toS(gx, gy0), b = toS(gx, gy1); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
      }
      for (let gy = Math.ceil(gy0 / step) * step; gy < gy1; gy += step) {
        const k = Math.round(gy / step), lv = k % 25 === 0 ? 2 : k % 5 === 0 ? 1 : 0;
        if (lv !== level) continue;
        const a = toS(gx0, gy), b = toS(gx1, gy); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
      }
      g.strokeStyle = level === 2 ? rgba(T.gridHot, 0.5) : `rgba(${T.gridRGB},${level ? T.gridMajor : T.gridMinor})`;
      g.lineWidth = (level === 2 ? 2.2 : level ? 1.5 : 0.9) * u;
      g.stroke();
    }
    // Angle guides and ruler figures printed on the mat.
    g.beginPath();
    for (let k = Math.floor(gx0 / 750) - 2; k <= Math.ceil(gx1 / 750) + 2; k++) {
      const a = toS(k * 750 + gy0, gy0), b = toS(k * 750 + gy1, gy1); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
    }
    g.setLineDash([12 * u, 10 * u]); g.strokeStyle = `rgba(${T.gridRGB},${T.gridMajor * 0.8})`; g.lineWidth = 1.2 * u; g.stroke(); g.setLineDash([]);
    g.fillStyle = `rgba(${T.gridRGB},${T.gridMajor * 1.6})`;
    g.font = `600 ${17}px ${BODY}`; g.textAlign = "center"; g.textBaseline = "middle";
    for (let gy = Math.ceil(gy0 / 750) * 750; gy < gy1; gy += 750) {
      for (let gx = Math.ceil(gx0 / 150) * 150; gx < gx1; gx += 150) {
        const p = toS(gx + 14, gy + 12), q = toS(gx + 15, gy + 12), r2 = toS(gx + 14, gy + 13);
        g.save();
        g.setTransform(q[0] - p[0], q[1] - p[1], -(r2[0] - p[0]), -(r2[1] - p[1]), p[0], p[1]);
        g.fillText(String(Math.round(gx / 30)), 0, 0);
        g.restore();
      }
    }
    g.restore();
  }
  function props(B, F, i) {
    const r = rng(9001 + i * 131), { W, H, tall } = F, ou = i * F.PITCH, T = F.T;
    const at = (fx, fy, yaw = 0) => place(F, ou, fx * W, fy * H, yaw);
    const cols = T.cards;
    const spots = tall
      ? [[0.04, 0.38], [0.96, 0.52], [0.05, 0.97], [0.95, 0.975], [0.5, 0.995], [0.03, 0.7], [0.97, 0.8], [0.3, 0.985]]
      : [[0.025, 0.52], [0.975, 0.45], [0.05, 0.96], [0.95, 0.97], [0.36, 0.995], [0.66, 0.99], [0.03, 0.16], [0.975, 0.18]];
    spots.forEach(([fx, fy], k) => {
      const X = at(fx + (r() - 0.5) * 0.02, fy + (r() - 0.5) * 0.02, r() * TAU);
      scrap(B, X, 22 + r() * 22, cols[Math.floor(r() * cols.length)], 300 + i * 17 + k);
    });
    const left = i % 2 === 0;
    sprue(B, at(left ? -0.02 : 1.02, tall ? 0.985 : 0.97, (left ? 0.18 : -0.2) + (r() - 0.5) * 0.1), tall ? 360 : 440, tall ? 240 : 290, 50 + i);
    if (i % 3 === 1) knife(B, at(left ? 0.86 : 0.14, tall ? 0.985 : 0.985, (left ? -0.12 : 0.1)), 300, T.cards[2]);
    else pencil(B, at(left ? 0.84 : 0.16, tall ? 0.985 : 0.985, (left ? -0.16 : 0.14) + (r() - 0.5) * 0.08), 280, T.cards[1]);
    pushpin(B, at(left ? 0.975 : 0.025, tall ? 0.62 : 0.66), F.accent);
    pushpin(B, at(left ? 0.03 : 0.97, tall ? 0.28 : 0.3), T.cards[0]);
    tape(B, at(left ? 1.0 : 0.0, tall ? 0.2 : 0.06), 62, T.cards[(i + 3) % cols.length]);
    // A small working model in the back corner of every station, always moving, so the mat never sits still.
    const kind = ((i % 3) + 3) % 3, mx = tall ? 0.87 : 0.925, my = tall ? 0.065 : 0.125, t = F.t;
    if (kind === 0) gemStand(B, at(mx, my), t, F.accent, cols[0]);
    else if (kind === 1) bird(B, at(mx, my, -0.5), t + i, cols[(i + 2) % cols.length]);
    else sheetStack(B, at(mx, my, 0.15), t + i * 0.7, cols, F.accent);
  }
  // A faceted low-poly gem turning slowly on a card turntable.
  function gemStand(B, X, t, col, col2) {
    prism(B, X, 10, 58, 58, 0, 12, frame.T.card2, { layer: 1, contact: true, topCol: frame.T.card, rot: t * 0.5 });
    const bob = 6 * Math.sin(t * 1.6);
    const G = (x, y, z) => X(x, y, z + 20 + bob);
    prism(B, G, 6, 12, 38, 0, 34, col, { keep: true, cols: [col, tone(col, 0.86), tone(col, 1.12), tone(col, 0.92)], rot: t * 0.8, cap: 26, capCol: tone(col, 1.08) });
    prism(B, X, 8, 7, 7, 12, 20, col2, { keep: true, noShadow: true });
  }
  // A folded paper bird on the mat that bobs and beats its wings.
  function bird(B, X, t, col) {
    const T = frame.T, flap = 0.45 + 0.4 * Math.sin(t * 3.1), hop = Math.max(0, Math.sin(t * 1.55)) * 10;
    const P = (x, y, z) => X(x, y, z + hop);
    B.obj(2, X(0, 0, 0));
    B.face([[56, 0, 34], [-50, 8, 30], [-10, 12, 4]].map((p) => P(...p)), col, { noLip: true, inside: tone(col, 0.85) });
    B.face([[56, 0, 34], [-50, -8, 30], [-10, -12, 4]].map((p) => P(...p)), tone(col, 0.88), { noLip: true, inside: tone(col, 0.8) });
    B.face([[56, 0, 34], [80, 0, 58], [62, 0, 30]].map((p) => P(...p)), tone(col, 0.92), { noLip: true });
    B.face([[-50, 0, 30], [-74, 0, 54], [-34, 0, 30]].map((p) => P(...p)), tone(col, 0.8), { noLip: true });
    for (const s of [-1, 1]) {
      const a = flap * s, wx = Math.cos(a) * 62, wz = Math.sin(Math.abs(a)) * 62;
      B.face([[18, 0, 30], [-22, 0, 30], [-6, s * wx, 30 + wz]].map((p) => P(...p)), s > 0 ? T.card : tone(T.card, 0.9), { noLip: true, inside: tone(T.card, 0.82) });
    }
    B.contact([X(-40, -14, 0), X(50, -10, 0), X(50, 10, 0), X(-40, 14, 0)]);
  }
  // A stack of coloured card sheets with a pinwheel stuck in a cork, turning in the lamp's draught.
  function sheetStack(B, X, t, cols, accent) {
    for (let k = 0; k < 4; k++) {
      const R = rotZ((x, y, z) => X(x, y, z + k * 4), (k - 1.5) * 0.12, 0, 0);
      B.obj(1, R(0, 0, 0));
      B.face([R(-70, 52, 4), R(70, 52, 4), R(70, -52, 4), R(-70, -52, 4)], cols[(k * 2 + 1) % cols.length], { noLip: k < 3 });
    }
    pinwheel(B, shift(X, 34, -8, 18), 120, 46, 1, t * 2.4, [accent, cols[0], cols[1], cols[2]]);
  }

  // ---- headline tent cards ----------------------------------------------------------------------------------
  const lineCache = {}, boxCache = {};
  function headLines(id) {
    if (lineCache[id]) return lineCache[id];
    const el = document.getElementById(id), root = document.getElementById("root");
    if (!el || !root || !el.firstChild) return (lineCache[id] = []);
    let ox = 0, oy = 0;
    for (let n = el; n && n !== root; n = n.offsetParent) { ox += n.offsetLeft; oy += n.offsetTop; }
    boxCache[id] = { x: ox, y: oy, w: el.offsetWidth, h: el.offsetHeight };
    const scale = root.getBoundingClientRect().width / (Number(root.dataset.width) || 1920) || 1;
    const er = el.getBoundingClientRect(), range = document.createRange();
    range.selectNodeContents(el);
    const out = [];
    for (const rr of range.getClientRects()) {
      const line = { x: ox + (rr.left - er.left) / scale, y: oy + (rr.top - er.top) / scale, w: rr.width / scale, h: rr.height / scale };
      if (line.w > 1 && !out.some((o) => Math.abs(o.y - line.y) < 2)) out.push(line);
    }
    return (lineCache[id] = out);
  }
  function headRect(F, id) {
    const lines = (HEADS[id] || []).flatMap((h) => headLines(h));
    if (!lines.length) return null;
    const u = F.u;
    return { x0: Math.min(...lines.map((l) => l.x)) - 40 * u, x1: Math.max(...lines.map((l) => l.x + l.w)) + 40 * u, y0: Math.min(...lines.map((l) => l.y)) - 26 * u, y1: Math.max(...lines.map((l) => l.y + l.h)) + 18 * u };
  }
  function areaOf(F, id) {
    const { W, H, u, tall } = F, side = (tall ? 90 : 140) * u, R = headRect(F, id);
    const top = (R ? R.y1 + 16 * u : H * (tall ? 0.22 : 0.27)) + (tall ? 60 : 40) * u;
    return { x: side, y: top, w: W - side * 2, h: H - (tall ? 140 : 100) * u - top };
  }
  // Two headlines may share the frame only when their cards do not overlap.
  function clash(F, a, b) {
    const A = headRect(F, a), B2 = headRect(F, b), m = 30 * F.u;
    if (!A || !B2) return true;
    return !(A.x1 + m < B2.x0 || B2.x1 + m < A.x0 || A.y1 + m < B2.y0 || B2.y1 + m < A.y0);
  }
  const wipeP = (x) => { x = clamp(x); return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };
  const quadP = (g, pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); };
  // The headline card lies face down on the mat and rides in with it, then flips up on its lip; the
  // fully inked words slide out from under a printed flap that rolls back across the card.
  function placard(g, F, id, local, hold, last, idx, early) {
    const R = headRect(F, id);
    if (!R) return;
    const { u, T } = F;
    // The card stays up under its words while they fade, and folds flat only in the last moment.
    const outL = last ? 0 : span(local, hold - 0.09, hold);
    const alpha = 1;
    const s0 = early ? -0.06 : idx === 0 ? -0.08 : 0;
    const phi = 0.35 + (Math.PI / 2 + 0.05 - 0.35) * backOut(span(local, s0, s0 + 0.3));
    const kk = ((Math.sin(phi) * CE - Math.cos(phi) * SE) / CE) * (1 - ease(outL));
    if (alpha <= 0.002 || (outL > 0.98)) return;
    const dx = Math.max(0, (idx * F.PITCH - F.base) * F.s);
    const out = 0;
    g.save();
    g.globalAlpha = alpha;
    g.translate(dx, -18 * u * out);
    const full = R.y1 - R.y0, lip = 18 * u, base = R.y1 + lip;
    if (kk < 0) {
      // The back of the card: kraft stock with printed stripes and the approval stamp.
      const hb = -kk * full, y1 = R.y1 + hb, grow = -kk * 0.03 * (R.x1 - R.x0);
      const pts = [[R.x0, R.y1], [R.x1, R.y1], [R.x1 + grow, y1], [R.x0 - grow, y1]];
      g.save();
      g.filter = `blur(${10 * u}px)`; g.fillStyle = `rgba(${T.shadeRGB},0.4)`;
      quadP(g, pts.map(([x, y]) => [x + 16 * u, y + 12 * u])); g.fill(); g.filter = "none";
      quadP(g, pts);
      const gr = g.createLinearGradient(0, R.y1, 0, y1);
      gr.addColorStop(0, tone(T.card2, 0.9)); gr.addColorStop(1, tone(T.card2, 1.04));
      g.fillStyle = gr; g.fill();
      g.save(); g.clip();
      g.strokeStyle = rgba(F.accent, 0.2); g.lineWidth = 14 * u;
      for (let x = R.x0 - hb - grow; x < R.x1 + grow; x += 52 * u) { g.beginPath(); g.moveTo(x, y1); g.lineTo(x + hb, R.y1); g.stroke(); }
      if (F.tex > 0) { g.globalAlpha = alpha * 0.8 * F.tex; g.fillStyle = pattern(g, "fibre"); g.fillRect(R.x0 - grow, R.y1, R.x1 - R.x0 + grow * 2, hb); }
      g.restore();
      g.strokeStyle = `rgba(${T.edgeRGB},0.35)`; g.lineWidth = 1.2 * u; quadP(g, pts); g.stroke();
      const cxm = (R.x0 + R.x1) / 2, cym = R.y1 + hb / 2, r = Math.min(full * 0.4, 130 * u);
      g.save(); g.translate(cxm, cym); g.scale(1, Math.max(0.02, -kk));
      g.strokeStyle = F.accent; g.lineWidth = 9 * u; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke();
      g.lineWidth = 15 * u; g.lineCap = "round"; g.lineJoin = "round";
      g.beginPath(); g.moveTo(-r * 0.42, 0); g.lineTo(-r * 0.1, r * 0.32); g.lineTo(r * 0.46, -r * 0.34); g.stroke();
      g.restore();
      g.setLineDash([8 * u, 5 * u]); g.strokeStyle = rgba(T.inkHex, 0.4); g.lineWidth = 1.3 * u;
      g.beginPath(); g.moveTo(R.x0 + 4 * u, R.y1); g.lineTo(R.x1 - 4 * u, R.y1); g.stroke(); g.setLineDash([]);
      g.restore();
      g.restore();
      return;
    }
    const k = kk, h = full * k, top = R.y1 - h, inset = (1 - Math.min(1, k)) * 0.035 * (R.x1 - R.x0);
    const quad = (pts) => quadP(g, pts);
    g.save();
    g.filter = `blur(${12 * u}px)`; g.fillStyle = `rgba(${T.shadeRGB},${0.42 * Math.min(1, k)})`;
    quad([[R.x0 + 30 * u, top - 14 * u], [R.x1 + 34 * u, top - 14 * u], [R.x1 + 16 * u, base], [R.x0 + 12 * u, base]]); g.fill();
    g.filter = "none";
    for (const side of [-1, 1]) {
      const x = side < 0 ? R.x0 : R.x1, tw = 30 * u * side;
      quad([[x, top + h * 0.12], [x + tw, top + h * 0.22], [x + tw, R.y1 - h * 0.18], [x, R.y1 - h * 0.08]]);
      g.fillStyle = tone(T.card, 0.8); g.fill();
      g.setLineDash([6 * u, 4 * u]); g.strokeStyle = rgba(T.inkHex, 0.35); g.lineWidth = 1.2 * u;
      g.beginPath(); g.moveTo(x, top + h * 0.12); g.lineTo(x, R.y1 - h * 0.08); g.stroke(); g.setLineDash([]);
    }
    quad([[R.x0 + inset, top], [R.x1 - inset, top], [R.x1, R.y1], [R.x0, R.y1]]);
    const gr = g.createLinearGradient(0, top, 0, R.y1);
    gr.addColorStop(0, tone(T.card, 1.06)); gr.addColorStop(1, tone(T.card, 0.94));
    g.fillStyle = gr; g.fill();
    if (F.tex > 0) { g.save(); g.clip(); g.globalAlpha = alpha * 0.8 * F.tex; g.fillStyle = pattern(g, "fibre"); g.fillRect(R.x0, top, R.x1 - R.x0, R.y1 - top); g.restore(); }
    if (k < 1) { quad([[R.x0 + inset, top], [R.x1 - inset, top], [R.x1, R.y1], [R.x0, R.y1]]); g.fillStyle = `rgba(${T.shadeRGB},${(1 - Math.min(1, k)) * 0.35})`; g.fill(); }
    g.strokeStyle = `rgba(${T.edgeRGB},0.35)`; g.lineWidth = 1.2 * u; quad([[R.x0 + inset, top], [R.x1 - inset, top], [R.x1, R.y1], [R.x0, R.y1]]); g.stroke();
    g.fillStyle = F.accent; quad([[R.x0 + inset, top], [R.x1 - inset, top], [R.x1 - inset * 0.9, top + 10 * u * k], [R.x0 + inset * 0.9, top + 10 * u * k]]); g.fill();
    g.strokeStyle = rgba(T.inkHex, 0.3); g.lineWidth = 1.5 * u;
    for (const [x, y, sx] of [[R.x0 + 16 * u, R.y1 - 14 * u, 1], [R.x1 - 16 * u, R.y1 - 14 * u, -1]]) {
      g.beginPath(); g.moveTo(x, y - 14 * u * k); g.lineTo(x, y); g.lineTo(x + 14 * u * sx, y); g.stroke();
    }
    quad([[R.x0, R.y1], [R.x1, R.y1], [R.x1 - 8 * u, base], [R.x0 + 8 * u, base]]);
    g.fillStyle = tone(T.card, 0.78); g.fill();
    g.setLineDash([8 * u, 5 * u]); g.strokeStyle = rgba(T.inkHex, 0.4); g.lineWidth = 1.3 * u;
    g.beginPath(); g.moveTo(R.x0 + 4 * u, R.y1); g.lineTo(R.x1 - 4 * u, R.y1); g.stroke(); g.setLineDash([]);
    g.restore();
    g.restore();
    if (k > 0.3) flap(g, F, id, local, alpha);
  }
  // The printed flap over the words not yet revealed, with the rolled edge at the reveal front.
  function flap(g, F, id, local, alpha) {
    const { u, T } = F, dur = F.entrance * 1.15;
    (HEADS[id] || []).forEach((hid, j) => {
      const x = (local - j * 0.12) / dur;
      if (x >= 1) return;
      const lines = headLines(hid), bx = boxCache[hid];
      if (!lines.length || !bx) return;
      const p = wipeP(x), fx = bx.x + (-0.02 + 1.04 * p) * bx.w;
      const lx = Math.min(...lines.map((l) => l.x)) - 10 * u, right = Math.max(...lines.map((l) => l.x + l.w)) + 12 * u;
      const left = Math.max(fx, lx);
      if (left >= right) return;
      const top = Math.min(...lines.map((l) => l.y)) - 2 * u, bot = Math.max(...lines.map((l) => l.y + l.h)) + 2 * u, hh = bot - top;
      g.save();
      g.globalAlpha = alpha;
      g.fillStyle = tone(T.card2, 1.03); g.fillRect(left, top, right - left, hh);
      g.save(); g.beginPath(); g.rect(left, top, right - left, hh); g.clip();
      g.strokeStyle = rgba(F.accent, 0.24); g.lineWidth = 7 * u;
      for (let xx = lx - hh; xx < right; xx += 30 * u) { g.beginPath(); g.moveTo(xx, bot); g.lineTo(xx + hh, top); g.stroke(); }
      if (F.tex > 0) { g.globalAlpha = alpha * 0.8 * F.tex; g.fillStyle = pattern(g, "fibre"); g.fillRect(left, top, right - left, hh); }
      g.restore();
      const rw = Math.max(14 * u, Math.min(30 * u, hh * 0.3));
      const sg = g.createLinearGradient(left + rw, 0, left + rw + 46 * u, 0);
      sg.addColorStop(0, `rgba(${T.shadeRGB},0.32)`); sg.addColorStop(1, `rgba(${T.shadeRGB},0)`);
      g.fillStyle = sg; g.fillRect(left + rw, top, Math.min(46 * u, right - left), hh);
      const rg = g.createLinearGradient(left, 0, left + rw, 0);
      rg.addColorStop(0, tone(T.card, 0.74)); rg.addColorStop(0.4, tone(T.card, 1.1)); rg.addColorStop(1, tone(T.card, 0.72));
      g.fillStyle = rg;
      g.beginPath(); g.roundRect ? g.roundRect(left, top - 7 * u, rw, hh + 14 * u, rw / 2) : g.rect(left, top - 7 * u, rw, hh + 14 * u); g.fill();
      g.strokeStyle = `rgba(${T.edgeRGB},0.4)`; g.lineWidth = 1.2 * u; g.stroke();
      g.restore();
    });
  }
  function lighting(g, F) {
    if (!F.S.paint) return;
    const { W, H, t, T } = F;
    const lx = W * (0.28 + 0.07 * Math.sin(t * 0.21)), ly = H * (0.12 + 0.05 * Math.cos(t * 0.17));
    const gr = g.createRadialGradient(lx, ly, 0, lx, ly, Math.hypot(W, H) * 0.9);
    gr.addColorStop(0, `rgba(${T.lampRGB},${T.lamp})`); gr.addColorStop(0.42, `rgba(${T.lampRGB},0)`); gr.addColorStop(1, `rgba(0,0,0,${T.vignette})`);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }

  // ---- scenes ----------------------------------------------------------------------------------------------
  const stg = (local, delay, dur) => clamp((local - delay) / dur);

  // Title: bunting strung across the back, a clapperboard that keeps clapping, a waving film strip
  // and a pinwheel around the headline card.
  function bunting(B, F, ou, y0, x0, x1, z, f, t) {
    const T = F.T, a = place(F, ou, x0, y0), n = 22, sag = 46, Lu = (x1 - x0) / F.u;
    const pt = (s) => a(s * Lu, 14 * Math.sin(t * 1.1 + s * 3.2) * 4 * s * (1 - s), z - (sag + 10 * Math.sin(t * 0.9)) * 4 * s * (1 - s) + 6 * Math.sin(t * 1.3 + s * 6));
    B.obj(1, a(Lu / 2, 0, 0));
    for (let i = 0; i < n; i++) thread(B, pt(i / n), pt((i + 1) / n), T.thread, 1.8);
    const flags = 13;
    for (let k = 0; k < flags; k++) {
      const s0 = (k + 0.18) / flags, s1 = (k + 0.82) / flags, q = 0.3 + 0.7 * clamp(f * 1.6 - (k / flags) * 0.6);
      if (f <= 0 && q <= 0.3 && frame.index !== 0) continue;
      const p0 = pt(s0), p1 = pt(s1), mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
      const swing = Math.sin(t * 2.1 + k * 0.9) * 46, L = 78 * ease(q);
      const tip = [mid[0] + swing * 0.35, mid[1] - swing, mid[2] - L * (0.92 + 0.08 * Math.cos(t * 2.1 + k * 0.9))];
      B.obj(1, mid);
      B.face([p0, p1, tip], T.cards[k % T.cards.length], { noShadow: true, inside: tone(T.cards[k % T.cards.length], 0.85), noLip: true });
    }
  }
  function slatePrint(g, w, h) {
    const T = frame.T;
    g.fillStyle = T.slate; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(255,255,255,0.75)"; g.lineWidth = 3;
    g.strokeRect(14, 14, w - 28, h - 28);
    g.beginPath(); g.moveTo(14, h * 0.42); g.lineTo(w - 14, h * 0.42); g.moveTo(14, h * 0.7); g.lineTo(w - 14, h * 0.7); g.moveTo(w * 0.5, h * 0.42); g.lineTo(w * 0.5, h - 14); g.stroke();
    g.fillStyle = "rgba(255,255,255,0.85)"; g.font = `700 ${h * 0.12}px ${BODY}`; g.textAlign = "left"; g.textBaseline = "middle";
    g.fillText("CUT 01", 26, h * 0.27);
    g.font = `600 ${h * 0.085}px ${BODY}`;
    g.fillText("SCENE", 26, h * 0.56); g.fillText("TAKE", w * 0.5 + 12, h * 0.56); g.fillText("ROLL", 26, h * 0.84); g.fillText("CARD", w * 0.5 + 12, h * 0.84);
  }
  const stripes = (g, w, h) => {
    const T = frame.T;
    g.fillStyle = T.card; g.fillRect(0, 0, w, h);
    g.fillStyle = T.slate;
    for (let x = -h; x < w + h; x += h * 1.3) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + h * 0.65, h); g.lineTo(x + h * 1.3, 0); g.lineTo(x + h * 0.65, 0); g.closePath(); g.fill(); }
  };
  function clapper(B, X, w, h, f, t) {
    const T = frame.T, d = w * 0.12, hb = h * 0.8, sb = h * 0.14;
    boxNet(B, X, w, d, hb, f, T.slate, { print: { front: slatePrint }, inside: tone(T.slate, 1.5), sideCols: { top: T.card } });
    const k = span(f, 0.78, 1);
    if (k <= 0) return;
    boxNet(B, shift(X, 0, 0, hb), w, d, sb * k, 1, T.card, { print: { front: stripes }, noContact: true });
    const per = 2.3, ph = frac((t + 0.5) / per);
    let a = ph < 0.6 ? 0.5 * ease(ph / 0.6) : ph < 0.82 ? 0.5 : ph < 0.86 ? 0.5 * (1 - span(ph, 0.82, 0.86) ** 2) : 0.06 * Math.sin(span(ph, 0.86, 1) * Math.PI) * (1 - span(ph, 0.86, 1));
    a = lerp(1.2, a, ease(k));
    const Xs = rotY(shift(X, 0, 0, hb + sb * k + 1), a, -w / 2, 0);
    boxNet(B, Xs, w, d, sb, 1, T.card, { print: { front: stripes }, noContact: true });
  }
  function filmStrip(B, F, ou, sx0, sx1, sy, hs, f, t) {
    const T = F.T, n = 9, a = place(F, ou, sx0, sy), L = (sx1 - sx0) / F.u;
    const q = 0.25 + 0.75 * ease(f);
    const pt = (s) => [s * L * q, 38 * Math.sin(s * TAU * 1.15 + t * 0.9), 0];
    B.obj(2, a(L / 2, 0, 0));
    for (let i = 0; i < n; i++) {
      const p = pt(i / n), r2 = pt((i + 1) / n), k = i;
      B.face([a(p[0], p[1], hs), a(r2[0], r2[1], hs), a(r2[0], r2[1], 0), a(p[0], p[1], 0)], T.film, {
        inside: tone(T.film, 0.8), noLip: true,
        print: (g, w, h) => {
          // The film feeds left to right: frames and sprocket holes march along the strip.
          const run = t * 0.55, off = frac(run) * w, kk = k - Math.floor(run);
          g.fillStyle = T.film; g.fillRect(0, 0, w, h);
          g.fillStyle = T.card;
          for (let x = 6 + ((t * 40) % 22) - 22; x < w; x += 22) { g.fillRect(x, 6, 11, 10); g.fillRect(x, h - 16, 11, 10); }
          for (const [ox, j] of [[off - w, kk - 1], [off, kk]]) {
            const c = ((j % T.cards.length) + T.cards.length) % T.cards.length;
            g.fillStyle = T.cards[c]; g.fillRect(ox + 8, 24, w - 16, h - 48);
            g.fillStyle = "rgba(255,255,255,0.55)"; g.beginPath(); g.moveTo(ox + 14, h - 26); g.lineTo(ox + w * (0.3 + 0.12 * (c % 3)), h * 0.42); g.lineTo(ox + w * 0.7, h - 26); g.fill();
            g.beginPath(); g.arc(ox + w * 0.72, h * 0.38, h * 0.1, 0, TAU); g.fill();
          }
        },
      });
    }
  }
  function camera(B, X, s, f, t) {
    const T = frame.T, w = s * 1.15, d = s * 0.62, h = s * 0.66;
    boxNet(B, X, w, d, h, f, T.slate, { print: { front: (g, pw, ph) => {
      g.fillStyle = T.slate; g.fillRect(0, 0, pw, ph);
      g.fillStyle = frame.accent; g.fillRect(0, ph * 0.12, pw, ph * 0.14);
      g.strokeStyle = "rgba(255,255,255,0.5)"; g.lineWidth = 3; g.strokeRect(pw * 0.08, ph * 0.38, pw * 0.36, ph * 0.46);
      const on = frac(t / 1.1) < 0.6;
      g.fillStyle = on ? "#ff5a4a" : "rgba(255,90,74,0.3)"; g.beginPath(); g.arc(pw * 0.86, ph * 0.5, ph * 0.07, 0, TAU); g.fill();
      g.fillStyle = "rgba(255,255,255,0.75)"; g.font = `700 ${ph * 0.12}px ${BODY}`; g.textAlign = "right"; g.textBaseline = "middle"; g.fillText("REC", pw * 0.78, ph * 0.5);
    } }, sideCols: { top: tone(T.slate, 1.25) } });
    const k = span(f, 0.6, 1);
    if (k <= 0) return;
    const kb = backOut(k);
    // The lens tube points at the viewer, with a printed glass.
    rod(B, X, [w * 0.18, -d / 2, h * 0.5], [w * 0.18, -d / 2 - s * 0.34 * kb, h * 0.5], s * 0.2, 8, tone(T.card2, 0.9), { layer: 3, capA: T.card2, rot: t * 0.4 });
    rod(B, X, [w * 0.18, -d / 2 - s * 0.34 * kb, h * 0.5], [w * 0.18, -d / 2 - s * 0.4 * kb, h * 0.5], s * 0.24, 8, frame.accent, { layer: 3, keep: true, rot: t * 0.4 });
    const lr = s * 0.16;
    B.face([X(w * 0.18 - lr, -d / 2 - s * 0.41 * kb, h * 0.5 + lr), X(w * 0.18 + lr, -d / 2 - s * 0.41 * kb, h * 0.5 + lr), X(w * 0.18 + lr, -d / 2 - s * 0.41 * kb, h * 0.5 - lr), X(w * 0.18 - lr, -d / 2 - s * 0.41 * kb, h * 0.5 - lr)], "rgba(0,0,0,0)", {
      flat: true, noShadow: true, edge: 0, noLip: true,
      print: (g, pw, ph) => { const gr = g.createRadialGradient(pw * 0.38, ph * 0.38, 0, pw / 2, ph / 2, pw * 0.5); gr.addColorStop(0, "#9fd0ee"); gr.addColorStop(0.7, "#2a4b66"); gr.addColorStop(1, "#1c2a38"); g.fillStyle = gr; g.beginPath(); g.arc(pw / 2, ph / 2, pw * 0.48, 0, TAU); g.fill(); g.fillStyle = "rgba(255,255,255,0.7)"; g.beginPath(); g.arc(pw * 0.36, ph * 0.34, pw * 0.09, 0, TAU); g.fill(); },
    });
    // Two reels on top, faces to the viewer, spokes turning.
    for (const [rx, rr, sp] of [[-w * 0.24, s * 0.34, 1.6], [w * 0.22, s * 0.28, 2.1]]) {
      const zc = h + rr * kb + 6, Xr = (x, y, z) => X(rx + x * kb, y, h + (z - h) * kb);
      rod(B, Xr, [0, -7, zc], [0, 7, zc], rr, 14, tone(T.card, 0.95), { layer: 3, capA: T.card, rot: t * sp });
      for (let j = 0; j < 3; j++) {
        const a = t * sp + (j * TAU) / 3, ca = Math.cos(a), sa = Math.sin(a), hw = rr * 0.12;
        const P2 = (r1, o) => Xr(ca * r1 - sa * o, -7.6, zc + sa * r1 + ca * o);
        B.face([P2(rr * 0.2, -hw), P2(rr * 0.82, -hw * 1.6), P2(rr * 0.82, hw * 1.6), P2(rr * 0.2, hw)], j === 0 ? frame.accent : T.slate, { noShadow: true, noLip: true, flat: true });
      }
      prism(B, (x, y, z) => Xr(x, y, z), 6, 8, 8, h, zc, T.wood, { keep: true, noShadow: true });
    }
  }
  function sTitle(C) { statement(C, "title"); }
  function sClosing(C) { statement(C, "closing"); }
  function statement(C, id) {
    const { F, B, ou, local, t, fold } = C, { W, H, u, tall, T } = F;
    const R = headRect(F, id) || { x0: W * 0.1, x1: W * 0.9, y0: H * 0.35, y1: H * 0.62 };
    const baseY = H - (tall ? 150 : 104) * u, bandTop = R.y1 + 60 * u, room = Math.max(160 * u, baseY - bandTop), zMax = room / (CE * u);
    const f = (d, dur = 0.8) => fold * stg(local, d, dur);
    if (id === "title") {
      const topY = R.y0 - 40 * u;
      if (topY > 120 * u) bunting(B, F, ou, topY + 40 * u, -0.05 * W, 1.05 * W, Math.min(220, (topY - 20 * u) / (CE * u) * 0.6) + 60, f(0.1, 1), t);
      const cw = Math.min(tall ? 400 : 340, zMax * 1.3), chh = Math.min(cw * 0.78, zMax * 0.9);
      clapper(B, place(F, ou, (tall ? 0.3 : 0.15) * W, baseY, 0.32), cw, chh, f(0, 1.1), t);
      pinwheel(B, place(F, ou, (tall ? 0.6 : 0.93) * W, baseY - 6 * u, -0.1), Math.min(zMax * 0.8, 300), Math.min(zMax * 0.32, 110), backOut(f(0.12, 0.7)), 0.6 + t * 3.6 + 1.2 * Math.sin(t * 0.8), [F.accent, T.cards[0], T.cards[1], T.cards[2]]);
      const fy = tall ? bandTop + room * 0.3 : baseY - 30 * u;
      filmStrip(B, F, ou, (tall ? 0.12 : 0.28) * W, (tall ? 0.6 : 0.6) * W, fy, Math.min(118, zMax * 0.45), f(0.05, 1.1), t);
      // A folded box camera the film feeds into, its two reels turning.
      const cs = Math.min(zMax * 0.62, tall ? 300 : 240);
      camera(B, place(F, ou, (tall ? 0.8 : 0.72) * W, tall ? fy + 40 * u : baseY - 10 * u, -0.28), cs, f(0.15, 0.9), t);
    } else {
      // Closing: a check-mark sculpture, a turning rosette and confetti falling through the frame.
      const s = Math.min(zMax * 0.95, tall ? 420 : 300);
      const Xc = sway(place(F, ou, (tall ? 0.3 : 0.2) * W, baseY, 0.35), 0.03 * Math.sin(t * 1.4), 0);
      const pk = backOut(f(0.05, 0.75));
      boxNet(B, Xc, s * 0.9, s * 0.4, 18, f(0, 0.5), T.card2, {});
      {
        const P = pop(shift(Xc, 0, 0, 18), s * 0.12, pk);
        extrude(B, P, [[-0.52, 0.4], [-0.1, 0.02], [0.56, 0.84], [0.41, 0.97], [-0.1, 0.28], [-0.38, 0.54]].map(([x, z]) => [x * s, z * s]), s * 0.16, F.accent);
      }
      const rx = (tall ? 0.76 : 0.9) * W, ry = tall ? baseY : baseY - 40 * u;
      rosette(B, place(F, ou, rx, ry, -0.15), Math.min(zMax * 0.42, 150), backOut(f(0.3, 0.7)), t);
      // A row of proposal cards on the mat: each unfolds just before the stamp presses its check into it.
      const sy = tall ? bandTop + room * 0.22 : baseY - 16 * u;
      stamper(B, place(F, ou, 0.5 * W, sy, tall ? 0 : -0.04), Math.min(zMax * 0.3, 140), local, t, f(0.2, 0.6), tall ? 0.8 : 0.86);
      // Approved tickets pegged on a line above the card, swinging, each stamped in turn.
      const lineY = Math.max(70 * u, R.y0 - (tall ? 380 : 300) * u);
      if (R.y0 - lineY > 180 * u) clothesline(B, F, ou, R.y0 - 30 * u, lineY, f(0.1, 1.0), local, t);
      if (!C.pending) {
        burst(B, F, ou, local, [[Xc(0, 0, s * 0.9), 1], [place(F, ou, rx, ry, 0)(0, 0, Math.min(zMax * 0.42, 150) * 1.9), -1]]);
        confetti(B, F, ou, local, t);
      }
    }
  }
  // A cardstock rubber stamp that hops along a row and keeps pressing check marks into the mat.
  function okPrint(g, w, h) {
    const F = frame;
    g.strokeStyle = F.accent; g.lineWidth = w * 0.07;
    g.beginPath(); g.arc(w / 2, h / 2, w * 0.4, 0, TAU); g.stroke();
    g.lineWidth = w * 0.11; g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath(); g.moveTo(w * 0.3, h * 0.52); g.lineTo(w * 0.45, h * 0.67); g.lineTo(w * 0.72, h * 0.34); g.stroke();
  }
  function stamper(B, X, lift, local, t, f, gsc = 1) {
    if (f <= 0.01) return;
    const T = frame.T, per = 1.0, gap = 215 * gsc, slots = 4, sz = 165 * gsc * Math.min(1, f);
    const cyc = Math.floor(local / per), ph = frac(local / per);
    const slotX = (j) => (j - (slots - 1) / 2) * gap;
    for (let j = 0; j < slots; j++) {
      const cw = gap * 0.88, cd = gap * 0.74, x = slotX(j), a = Math.PI * (1 - ease(clamp((local - (j * per - 0.35)) / 0.45))) * 0.98;
      const q = (px, py, pz) => X(x + px, py, 0.3 + pz);
      const hinge = (px, py) => q(px, py * Math.cos(a), py * Math.sin(a) + (a > 0.05 ? 1.2 : 0));
      B.obj(0, X(x, 0, 0));
      B.face([q(-cw / 2, 0, 0), q(cw / 2, 0, 0), q(cw / 2, -cd / 2, 0), q(-cw / 2, -cd / 2, 0)], T.card, { alpha: f, noLip: true, print: (g, w, h) => {
        g.fillStyle = rgba(T.inkHex, 0.25); g.fillRect(w * 0.1, h * 0.25, w * 0.55, h * 0.12); g.fillRect(w * 0.1, h * 0.55, w * 0.38, h * 0.12);
        g.strokeStyle = rgba(T.inkHex, 0.3); g.lineWidth = 2; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(0, 2); g.lineTo(w, 2); g.stroke(); g.setLineDash([]);
      } });
      B.face([hinge(-cw / 2, cd / 2), hinge(cw / 2, cd / 2), hinge(cw / 2, 0), hinge(-cw / 2, 0)], T.card, { alpha: f, noLip: true, inside: tone(T.card2, 0.95), print: (g, w, h) => {
        g.fillStyle = T.cards[j % T.cards.length]; g.fillRect(w * 0.08, h * 0.12, w * 0.84, h * 0.72);
        g.fillStyle = "rgba(255,255,255,0.55)"; g.beginPath(); g.moveTo(w * 0.08, h * 0.84); g.lineTo(w * 0.4, h * 0.4); g.lineTo(w * 0.62, h * 0.84); g.fill();
      } });
    }
    // Prints already pressed: every slot reached at or before this cycle's impact.
    const pressed = ph >= 0.5 ? cyc + 1 : cyc;
    for (let j = 0; j < Math.min(slots, pressed); j++) {
      const x = slotX(j), r = sz * 0.5, wob = 0.08 * Math.sin(j * 2.3);
      const c = Math.cos(wob), sn = Math.sin(wob), q = (px, py) => X(x + px * c - py * sn, px * sn + py * c, 0.6);
      B.obj(0, X(x, 0, 0));
      B.face([q(-r, r), q(r, r), q(r, -r), q(-r, -r)], "rgba(0,0,0,0)", { flat: true, noShadow: true, noLip: true, edge: 0, print: okPrint, alpha: f });
    }
    const cur = cyc % slots, prev = (cyc + slots - 1) % slots;
    let x = slotX(cur), z;
    if (ph < 0.35) { x = lerp(slotX(prev), slotX(cur), inout(ph / 0.35)); z = lift; }
    else if (ph < 0.5) z = lift * (1 - ease((ph - 0.35) / 0.15));
    else if (ph < 0.6) z = 0;
    else z = lift * ease((ph - 0.6) / 0.4);
    if (local < per * 0.35) { x = slotX(0); z = lerp(lift, z, 1) * Math.min(1, f); }
    const squash = ph >= 0.5 && ph < 0.6 ? 1 - 0.18 * Math.sin(((ph - 0.5) / 0.1) * Math.PI) : 1;
    const tilt = ph < 0.35 ? 0.18 * Math.sin((ph / 0.35) * Math.PI) : 0;
    const Xs = rotY((px, py, pz) => X(x + px, py, z + pz * squash), tilt, 0, 0);
    const k = Math.min(1, f) * gsc;
    boxNet(B, Xs, sz, sz, 34 * k, 1, tone(frame.accent, 0.8), { layer: 3, noContact: z > 4 });
    boxNet(B, shift(Xs, 0, 0, 34 * k), sz * 0.82, sz * 0.82, 40 * k, 1, T.wood, { layer: 3, noContact: true });
    prism(B, shift(Xs, 0, 0, 74 * k), 8, 26 * k, 26 * k, 0, 120 * k, T.wood, { layer: 3 });
    prism(B, shift(Xs, 0, 0, 194 * k), 10, 58 * k, 44 * k, 0, 60 * k, frame.accent, { layer: 3, topCol: tone(frame.accent, 1.15) });
  }
  function rosette(B, X, R, f, t) {

    const T = frame.T, P = pop(X, 10, f), zc = R * 1.9, spin = t * 0.6, n = 18;
    for (const sd of [-1, 1]) {
      const tl = [sd * R * 0.15, -4, zc], br = [sd * R * 0.75, -16, 0];
      B.obj(2, P(...br));
      B.face([[tl[0] - sd * R * 0.18, tl[1], tl[2]], [tl[0] + sd * R * 0.18, tl[1], tl[2]], [br[0] + sd * R * 0.2, br[1], 0], [br[0] - sd * R * 0.12, br[1], R * 0.18]].map((p) => P(...p)), sd < 0 ? frame.accent : T.cards[0], { noLip: true });
    }
    B.obj(2, P(0, -20, zc - R));
    for (let i = 0; i < n; i++) {
      const a0 = spin + (i / n) * TAU, a1 = spin + ((i + 1) / n) * TAU, y = i % 2 ? -26 : -14;
      B.face([[0, -30, zc], [Math.cos(a0) * R, y, zc + Math.sin(a0) * R], [Math.cos(a1) * R, i % 2 ? -14 : -26, zc + Math.sin(a1) * R]].map((p) => P(...p)), i % 2 ? T.cards[1] : tone(T.cards[1], 1.12), { noLip: true });
    }
    prism(B, (x, y, z) => P(x, -36 + y * 0.2, zc + z - 0), 10, R * 0.45, R * 0.45, -1, 1, frame.accent, { keep: true, rot: spin });
    B.face([P(-R * 0.32, -38, zc + R * 0.32), P(R * 0.32, -38, zc + R * 0.32), P(R * 0.32, -38, zc - R * 0.32), P(-R * 0.32, -38, zc - R * 0.32)], frame.accent, {
      flat: true, noShadow: true, edge: 0,
      print: (g, w, h) => { g.strokeStyle = "#fff"; g.lineWidth = w * 0.12; g.lineCap = "round"; g.lineJoin = "round"; g.beginPath(); g.moveTo(w * 0.2, h * 0.52); g.lineTo(w * 0.42, h * 0.74); g.lineTo(w * 0.8, h * 0.28); g.stroke(); },
    });
  }
  // Party-popper bursts: paper confetti shot up in arcs from the check and the rosette, fluttering
  // down and settling on the mat, where it stays.
  function burst(B, F, ou, local, origins) {
    const T = F.T, k = 1.15, gr = 1000;
    [0.95, 2.55].forEach((tb, bi) => {
      const tau = local - tb;
      if (tau <= 0) return;
      origins.forEach(([o, inward], oi) => {
        const r = rng(700 + bi * 31 + oi * 7), N = 46;
        for (let i = 0; i < N; i++) {
          const vu = inward * (160 + r() * 640), vv = 60 + r() * 480, vz = 950 + r() * 650, sz = 18 + r() * 16, w1 = 3 + r() * 5, w2 = 2 + r() * 4, ph = r() * TAU;
          const col = i % 4 === 0 ? F.accent : T.cards[(i + oi) % T.cards.length];
          const E = (1 - Math.exp(-k * tau)) / k;
          let z = o[2] + (vz + gr / k) * E - (gr / k) * tau;
          const flut = 22 * Math.sin(tau * 6 + ph) * clamp(tau - 0.45);
          const cu = o[0] + vu * E + flut, cv = o[1] + vv * E;
          const landed = z <= 1;
          if (landed) z = 1;
          const a1 = landed ? ph * 3 : tau * w1 + ph, a2 = landed ? 0 : tau * w2 + ph * 2;
          const ca = Math.cos(a1), sa = Math.sin(a1), cb = Math.cos(a2), sb = Math.sin(a2);
          const corner = (x, y) => { const X1 = x * ca - y * sa, Y1 = x * sa + y * ca; return [cu + X1, cv + Y1 * cb, z + Y1 * sb]; };
          B.obj(landed ? 0 : 3, [cu, cv, z]);
          B.face([corner(-sz / 2, -sz / 3), corner(sz / 2, -sz / 3), corner(sz / 2, sz / 3), corner(-sz / 2, sz / 3)], col, { noShadow: landed, inside: tone(col, 0.75), noLip: true, alpha: clamp(tau / 0.08) });
        }
      });
    });
  }
  function ticketPrint(g, w, h, j, stamp) {
    const F = frame, T = F.T;
    g.fillStyle = T.card; g.fillRect(0, 0, w, h);
    g.fillStyle = T.cards[j % T.cards.length]; g.fillRect(w * 0.1, h * 0.14, w * 0.8, h * 0.4);
    g.fillStyle = "rgba(255,255,255,0.55)"; g.beginPath(); g.moveTo(w * 0.1, h * 0.54); g.lineTo(w * 0.38, h * 0.26); g.lineTo(w * 0.6, h * 0.54); g.fill();
    g.fillStyle = rgba(T.inkHex, 0.3); g.fillRect(w * 0.1, h * 0.64, w * 0.5, h * 0.07); g.fillRect(w * 0.1, h * 0.78, w * 0.32, h * 0.07);
    g.strokeStyle = rgba(T.inkHex, 0.3); g.lineWidth = 2; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(0, h * 0.08); g.lineTo(w, h * 0.08); g.stroke(); g.setLineDash([]);
    if (stamp > 0) {
      const r = w * 0.2 * backOut(stamp), cx = w * 0.74, cy = h * 0.72;
      g.save(); g.translate(cx, cy); g.rotate(-0.25);
      g.strokeStyle = F.accent; g.lineWidth = r * 0.18; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke();
      g.lineWidth = r * 0.26; g.lineCap = "round"; g.lineJoin = "round";
      g.beginPath(); g.moveTo(-r * 0.45, 0); g.lineTo(-r * 0.1, r * 0.35); g.lineTo(r * 0.5, -r * 0.35); g.stroke();
      g.restore();
    }
  }
  function clothesline(B, F, ou, sy, lineY, f, local, t) {
    const T = F.T, { W, u } = F, x0 = -0.04 * W, x1 = 1.04 * W, a = place(F, ou, x0, sy), Lu = (x1 - x0) / u;
    const z = (sy - lineY) / (CE * u), sag = 40;
    const pt = (s) => a(s * Lu, 8 * Math.sin(t * 0.9 + s * 3) * 4 * s * (1 - s), z - (sag + 8 * Math.sin(t * 1.1)) * 4 * s * (1 - s));
    B.obj(1, a(Lu / 2, 0, z));
    for (let i = 0; i < 24; i++) thread(B, pt(i / 24), pt((i + 1) / 24), T.thread, 1.8);
    const n = F.tall ? 4 : 7, Lh = Math.min(170, z * 0.62);
    for (let j = 0; j < n; j++) {
      const sc = (j + 0.5) / n, half = 0.36 / n;
      const p0 = pt(sc - half), p1 = pt(sc + half);
      const arrive = backOut(clamp(f * 1.5 - (j / n) * 0.5));
      const swing = 0.32 * Math.sin(t * 1.8 + j * 0.9) + 0.1 * Math.sin(t * 3.1 + j);
      const ang = lerp(Math.PI * 0.94, swing, arrive);
      const dir = [0.06 * Math.sin(t * 1.3 + j), -Math.sin(ang), -Math.cos(ang)];
      const b0 = add(p0, dir, Lh), b1 = add(p1, dir, Lh);
      const stamp = clamp((local - 0.9 - j * 0.28) / 0.25);
      B.obj(1, p0);
      B.face([p0, p1, b1, b0], T.card, { inside: tone(T.card2, 0.92), print: (g, w, h) => ticketPrint(g, w, h, j, stamp) });
      const pc = pt(sc);
      prism(B, (x, y, zz) => [pc[0] + x, pc[1] - 3 + y, pc[2] - 22 + zz], 4, 9, 9, 0, 34, T.wood, { keep: true, noShadow: true, rot: Math.PI / 4 });
    }
  }
  function confetti(B, F, ou, local, t) {
    const { W, H, T } = F, r = rng(4242), N = F.tall ? 30 : 26;
    for (let i = 0; i < N; i++) {
      const fx = r(), fy = r(), per = 3.4 + r() * 2.6, ph = r(), sz = 12 + r() * 12, w1 = 2 + r() * 4, w2 = 1.5 + r() * 3, col = i % 5 === 0 ? F.accent : T.cards[i % T.cards.length];
      const gu = ou + LU(F, fx * W), gv = LV(F, (0.35 + fy * 0.62) * H);
      const top = (F.H / 2 + gv * SE * F.u + 80 * F.u) / (CE * F.u);
      const k = frac(local / per + ph), z = top * (1 - k);
      if (z < 6) continue;
      const cu = gu + 30 * Math.sin(local * 1.3 + i), a1 = t * w1 + i, a2 = t * w2 + i * 2;
      const ca = Math.cos(a1), sa = Math.sin(a1), cb = Math.cos(a2), sb = Math.sin(a2);
      const corner = (x, y) => { const X1 = x * ca - y * sa, Y1 = x * sa + y * ca; return [cu + X1, gv + Y1 * cb, z + Y1 * sb]; };
      B.obj(3, [cu, gv, z]);
      B.face([corner(-sz / 2, -sz / 3), corner(sz / 2, -sz / 3), corner(sz / 2, sz / 3), corner(-sz / 2, sz / 3)], col, { noShadow: true, inside: tone(col, 0.75), noLip: true, alpha: clamp((z - 6) / 40) });
    }
  }

  // Chart: cardstock columns fold up from long flat nets on a base board; a star spins on the
  // highlighted column, a paper plane loops round the chart and a score card shows the top value.
  function barPrint(g, w, h) {
    g.strokeStyle = "rgba(255,255,255,0.4)"; g.lineWidth = 3; g.setLineDash([9, 6]);
    g.strokeRect(10, 10, w - 20, h - 20); g.setLineDash([]);
    g.fillStyle = "rgba(255,255,255,0.35)";
    for (let y = 34; y < h - 20; y += 46) { g.beginPath(); g.arc(w / 2, y, 4.5, 0, TAU); g.fill(); }
  }
  function star(n, r0, r1) { const out = []; for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + (i * Math.PI) / n, r = i % 2 ? r1 : r0; out.push([Math.cos(a) * r, -Math.sin(a) * r]); } return out; }
  function plane(B, X, s) {
    const T = frame.T;
    const nose = [s, 0, 0], tail = [-s * 0.6, 0, 0], wl = [-s * 0.55, s * 0.55, s * 0.08], wr = [-s * 0.55, -s * 0.55, s * 0.08], keel = [-s * 0.5, 0, -s * 0.22];
    B.obj(3, X(0, 0, 0));
    B.face([nose, wl, tail].map((p) => X(...p)), T.card, { noLip: true, inside: tone(T.card, 0.85) });
    B.face([nose, tail, wr].map((p) => X(...p)), T.card, { noLip: true, inside: tone(T.card, 0.85) });
    B.face([nose, tail, keel].map((p) => X(...p)), tone(T.card, 0.85), { noLip: true });
  }
  function sChart(C) {
    const { F, B, ou, local, t, fold, data: d, A } = C, { u, tall, T } = F;
    const n = d.values.length, vals = d.values.map((v) => Number(v) || 0), max = Math.max(...vals, 1);
    const regionW = tall ? A.w : A.w * 0.68, cx = A.x + regionW / 2, baseY = A.y + A.h * (tall ? 0.52 : 0.7);
    const yaw = 0.12, spacing = (regionW * 0.94) / n / u, bw = Math.min(spacing * 0.56, 170), bd = bw * 0.86;
    // The tallest column, its open lid and the star above it all stay clear of the headline band.
    const rowHalf = (spacing * (n - 1)) / 2, topLimit = A.y + 40 * u;
    const maxH = Math.max(80, (baseY - rowHalf * Math.sin(yaw) * SE * u - (bd / 2) * SE * u - topLimit) / (CE * u) - 26 - 120);
    const X = place(F, ou, cx, baseY, yaw), bt = (local) / Math.min(1.9, C.hold * 0.6);
    boxNet(B, X, spacing * n * 0.99, bd * 2.1, 16, fold * stg(local, 0, 0.5), T.card2, { layer: 1, print: { front: (g, w, h) => { g.fillStyle = rgba(T.inkHex, 0.4); for (let x = 20; x < w; x += 30) g.fillRect(x, h * 0.3, 2, h * 0.4); } } });
    let hot = null;
    const counts = [];
    vals.forEach((v, i) => {
      const xi = (i - (n - 1) / 2) * spacing, q = fold * clamp((bt - i * 0.12) / 0.6), hgt = Math.max(26, (maxH * v) / max);
      const isHot = i === d.highlight, col = isHot ? F.accent : T.cards[i % T.cards.length];
      // Built columns keep their lids moving: the highlight's flap wobbles, the others pop in a wave.
      const built = clamp((q - 0.98) / 0.02);
      const lidOpen = built * (isHot ? 0.22 + 0.2 * Math.sin(t * 3.4) : 0.32 * Math.pow(Math.max(0, Math.sin(t * 1.8 - i * 0.9)), 6));
      boxNet(B, shift(X, xi, 0, 16), bw, bd, hgt, q, col, { print: { front: barPrint }, lidOpen });
      if (isHot) hot = { xi, hgt, q };
      const cq = backOut(fold * clamp((bt - 0.2 - i * 0.12) / 0.5)), cnt = ease(span(q, 0.45, 1));
      counts[i] = cnt;
      tent(B, shift(X, xi, -bd * 1.05 - 64, 0), spacing * 0.88, 124, cq, {
        stripe: col, lines: [{ text: fmt(v, d, cnt), size: 60, color: isHot ? F.accent : T.inkHex }, { text: d.labels[i] || "", size: 44, font: "body", min: 42 }],
      });
    });
    if (hot && hot.q > 0.9) {
      const k = backOut(span(hot.q, 0.9, 1)), bob = 8 * Math.sin(t * 2.2);
      const Xs = rotZ(shift(X, hot.xi, 0, 16 + hot.hgt + 14 + bob), t * 1.3);
      extrude(B, (x, y, z) => Xs(x * k, y, z * k), star(5, 46, 20).map(([x, y]) => [x, y + 46]), 16, T.cards[1]);
    }
    // The paper plane loops round the chart.
    const cu = LU(F, cx), cv = LV(F, baseY) + 20, ru = (regionW / u) * 0.52, rv = 170, per = 7.5;
    const pa = (t / per) * TAU, pu = cu + Math.cos(pa) * ru, pv = cv + Math.sin(pa) * rv, pz = maxH * 0.9 + 26 * Math.sin(pa * 2);
    const head = Math.atan2(Math.cos(pa) * rv, -Math.sin(pa) * ru), pq = ease(stg(local, 0.6, 0.6)) * fold;
    if (pq > 0.01) {
      const Xp = (x, y, z) => { const c = Math.cos(head), s = Math.sin(head), bank = -0.35; const y2 = y * Math.cos(bank) - z * Math.sin(bank), z2 = y * Math.sin(bank) + z * Math.cos(bank); return [ou + pu + (x * c - y2 * s) * pq, pv + (x * s + y2 * c) * pq, pz + z2 * pq]; };
      plane(B, Xp, 62);
    }
    // Score card for the highlighted column.
    const hi = Math.max(0, Math.min(n - 1, d.highlight));
    const sx = tall ? A.x + A.w * 0.5 : A.x + A.w * 0.86, sy = tall ? A.y + A.h * 0.86 : A.y + A.h * 0.8;
    const cw = tall ? Math.min(A.w * 0.62, 560) / u : Math.min(A.w * 0.28, 470) / u;
    // The score card shows the highlighted column's own counter, so the two always agree.
    const sq = backOut(fold * stg(local, 0.5, 0.6)), cnt = counts[hi] ?? 1;
    tent(B, place(F, ou, sx, sy, tall ? 0 : -0.16), cw, tall ? 270 : 300, sq, {
      lines: [{ text: d.labels[hi] || "", size: 46, font: "body", color: T.mutedHex, min: 42 }, { text: fmt(vals[hi], d, cnt), size: 132, color: F.accent, min: 100 }],
    });
  }

  // Object: a cardstock laptop (or phone) whose base folds up and lid swings open; a paper playhead
  // slides along the printed timeline; pins and red thread tie three tent-card labels to its parts.
  function screenPrint(g, w, h, q, t, vertical) {
    const F = frame, T = F.T;
    g.fillStyle = T.slate; g.fillRect(0, 0, w, h);
    const p = Math.min(w, h) * 0.05, sx = p, sy = p, sw = w - p * 2, sh = h - p * 2;
    g.fillStyle = tone(T.slate, 1.35); g.fillRect(sx, sy, sw, sh);
    const pv = { x: sx + sw * 0.08, y: sy + sh * 0.07, w: sw * 0.84, h: sh * (vertical ? 0.4 : 0.44) };
    // The preview plays: the sun arcs over, the hills slide past at two speeds and a bird crosses.
    g.save(); g.beginPath(); g.rect(pv.x, pv.y, pv.w, pv.h); g.clip();
    g.fillStyle = F.accent; g.fillRect(pv.x, pv.y, pv.w, pv.h);
    const sunK = frac(t / 5.5), sx2 = pv.x + pv.w * (0.1 + 0.8 * sunK), sy2 = pv.y + pv.h * (0.5 - 0.32 * Math.sin(sunK * Math.PI));
    g.fillStyle = "#fff"; g.beginPath(); g.arc(sx2, sy2, pv.h * 0.1, 0, TAU); g.fill();
    for (const [sp, a, hh] of [[0.05, 0.35, 0.55], [0.11, 0.55, 0.3]]) {
      const o = frac(t * sp) * pv.w;
      g.fillStyle = `rgba(255,255,255,${a})`;
      for (const base of [-pv.w, 0, pv.w]) {
        const x0 = pv.x + base - o;
        g.beginPath(); g.moveTo(x0, pv.y + pv.h);
        g.lineTo(x0 + pv.w * 0.3, pv.y + pv.h * hh); g.lineTo(x0 + pv.w * 0.55, pv.y + pv.h * (hh + 0.25)); g.lineTo(x0 + pv.w * 0.8, pv.y + pv.h * (hh - 0.08)); g.lineTo(x0 + pv.w, pv.y + pv.h);
        g.fill();
      }
    }
    const bx2 = pv.x + pv.w * frac(t / 3.2 + 0.3), by2 = pv.y + pv.h * (0.3 + 0.05 * Math.sin(t * 3));
    g.strokeStyle = tone(T.slate, 1.0); g.lineWidth = Math.max(2, pv.h * 0.025); g.lineCap = "round";
    g.beginPath(); g.moveTo(bx2 - pv.h * 0.06, by2 - pv.h * 0.03 * Math.sin(t * 9)); g.lineTo(bx2, by2); g.lineTo(bx2 + pv.h * 0.06, by2 - pv.h * 0.03 * Math.sin(t * 9)); g.stroke();
    g.restore();
    const top = sy + sh * (vertical ? 0.55 : 0.58), th = sh * (vertical ? 0.1 : 0.1), gap = sh * 0.035;
    const clips = [[[0.04, 0.3], [0.37, 0.24], [0.64, 0.3]], [[0.1, 0.22], [0.36, 0.34], [0.73, 0.2]], [[0.02, 0.44], [0.5, 0.4]]];
    clips.forEach((row, r) => row.forEach(([cx, cw], i) => {
      const k = clamp((q - 0.2 - (r * 3 + i) * 0.06) * 4);
      if (k <= 0) return;
      g.fillStyle = r === 0 && i === 1 ? F.accent : T.cards[(r * 2 + i) % T.cards.length];
      g.fillRect(sx + sw * 0.04 + sw * 0.92 * cx, top + r * (th + gap), sw * 0.92 * cw * k - 4, th);
    }));
    const ph = sx + sw * 0.04 + sw * 0.92 * frac(t / 3.2);
    g.fillStyle = "#fff"; g.fillRect(ph - 2, top - gap, 4, 3 * (th + gap) + gap);
    g.beginPath(); g.moveTo(ph - 10, top - gap - 12); g.lineTo(ph + 10, top - gap - 12); g.lineTo(ph, top - gap); g.fill();
  }
  function keyboardPrint(g, w, h) {
    const T = frame.T;
    g.fillStyle = tone(T.card2, 1.05); g.fillRect(0, 0, w, h);
    const cols = 13, kw = (w * 0.9) / cols, x0 = w * 0.05, y0 = h * 0.08;
    g.fillStyle = tone(T.slate, 1.2);
    for (let r = 0; r < 4; r++) for (let c = 0; c < cols - (r === 3 ? 0 : 0); c++) {
      if (r === 3 && c > 3 && c < 9) continue;
      g.fillRect(x0 + c * kw + 2, y0 + r * kw * 0.9 + 2, kw - 4, kw * 0.9 - 4);
    }
    g.fillRect(x0 + 4 * kw + 2, y0 + 3 * kw * 0.9 + 2, kw * 5 - 4, kw * 0.9 - 4);
    g.strokeStyle = tone(T.slate, 1.4); g.lineWidth = 3; g.strokeRect(w * 0.36, h * 0.6, w * 0.28, h * 0.32);
  }
  function sObject(C) {
    const { F, B, ou, local, t, fold, data: d, A } = C, { u, tall, T } = F;
    const phone = d.kind === "phone", bt = local / Math.min(2.0, C.hold * 0.6);
    const cxs = tall ? A.x + A.w * 0.5 : A.x + A.w * 0.32;
    const yaw = tall ? 0.18 : 0.3;
    let pins = [], Xbase;
    const room = tall ? A.h * 0.52 : A.h * 0.92;
    if (!phone) {
      const L = Math.min((tall ? A.w * 0.82 : A.w * 0.5) / u, room / u / 1.0), D = L * 0.66, tb = L * 0.045, Hs = D * 0.95, th = L * 0.02;
      const by = tall ? A.y + A.h * 0.42 : A.y + A.h * 0.74;
      Xbase = place(F, ou, cxs, by - (D / 2) * SE * u * 0.2, yaw);
      const f1 = fold * clamp(bt / 0.5);
      // An open tray: the keyboard is printed on its floor, so the flat net already reads as a laptop.
      boxNet(B, Xbase, L, D, tb, f1, T.card2, { floorPrint: keyboardPrint, open: true });
      // The lid starts as the printed half of the net, lying flat behind the base, and swings up on its hinge.
      const open = ease(clamp((bt - 0.42) / 0.5)) * fold, gam = lerp(-Math.PI / 2, -0.24, open), hz = tb * f1;
      {
        const Xp = (x, y, z) => { const c = Math.cos(gam), s = Math.sin(gam); return Xbase(x, D / 2 - th / 2 + (y * c - z * s), hz + th / 2 + (y * s + z * c)); };
        const q = clamp((bt - 0.05) / 0.9);
        boxNet(B, Xp, L * 0.98, th, Hs, 1, T.card2, { print: { front: (g, w, h) => screenPrint(g, w, h, q, t, false) }, noContact: true, sideCols: { back: F.accent } });
        const anchor = (s, tt) => Xp(-L * 0.49 + s * L * 0.98, -th / 2 - 16, Hs * (1 - tt));
        pins = [anchor(0.72, 0.28), anchor(0.5, 0.62), anchor(0.22, 0.86)];
      }
    } else {
      const ph = Math.min(room / u / 1.05, tall ? 640 : 560), pw = ph * 0.5, th = 22;
      const by = tall ? A.y + A.h * 0.45 : A.y + A.h * 0.84;
      Xbase = place(F, ou, cxs, by, yaw * 0.6);
      const f1 = fold * clamp(bt / 0.5);
      boxNet(B, Xbase, pw * 0.9, pw * 0.5, 24, f1, T.card2, {});
      const P = pop(shift(Xbase, 0, 0, 24), pw * 0.12, backOut(clamp((bt - 0.3) / 0.5)) * fold);
      const Xph = rotX(P, -0.2, 0, 0);
      const q = clamp((bt - 0.05) / 0.9);
      boxNet(B, Xph, pw, th, ph, 1, T.slate, { print: { front: (g, w, h) => screenPrint(g, w, h, q, t, true) }, noContact: true, sideCols: { back: F.accent } });
      const anchor = (s, tt) => Xph(-pw / 2 + s * pw, -th / 2 - 16, ph * (1 - tt));
      pins = [anchor(0.62, 0.22), anchor(0.55, 0.64), anchor(0.3, 0.84)];
    }
    // Labels: tent cards with red thread to pins on the device.
    const n = d.callouts.length;
    d.callouts.forEach((label, i) => {
      if (!label) return;
      const cq = backOut(fold * clamp((bt - 0.75 - i * 0.14) / 0.45));

      const cw = tall ? Math.min(A.w * 0.76, 720) / u : Math.min(A.w * 0.34, 560) / u;
      const csx = tall ? A.x + A.w * 0.5 : A.x + A.w * 0.8, csy = tall ? A.y + A.h * (0.66 + i * 0.15) : A.y + A.h * (0.28 + i * 0.31);
      const Xc = place(F, ou, csx, csy, tall ? 0 : -0.1);
      tent(B, Xc, cw, 100, cq, { lines: [{ text: label, size: 54, font: "body", min: 46 }], stripe: i === 1 ? F.accent : T.cards[i % T.cards.length] });
      const pin = pins[i];
      if (!pin) return;
      const pq = ease(fold * clamp((bt - 0.85 - i * 0.14) / 0.4));
      if (pq <= 0) return;
      prism(B, (x, y, z) => [pin[0] + x, pin[1] + y, pin[2] + z - 8], 8, 10, 8, 0, 16 * pq, F.accent, { layer: 3, noShadow: false, topCol: tone(F.accent, 1.2) });
      const end = Xc(tall ? 0 : -cw / 2 + 6, -12, 70 * Math.sin(1.18));
      B.over.push((g) => {
        const a = proj(F, [pin[0], pin[1], pin[2] + 8]), b = proj(F, tall ? Xc(-cw / 2 + 20, -10, 78) : end);
        const mx = (a[0] + b[0]) / 2, my = Math.max(a[1], b[1]) + 46 * u;
        const k = pq;
        g.save(); g.lineCap = "round";
        for (const [off, col, lw] of [[5 * u, `rgba(${T.shadeRGB},0.25)`, 3 * u], [0, T.thread, 2.6 * u]]) {
          g.beginPath(); g.moveTo(a[0] + off, a[1] + off);
          const N = 24;
          for (let j = 1; j <= Math.ceil(N * k); j++) {
            const s = Math.min(1, j / N), x = (1 - s) * (1 - s) * a[0] + 2 * (1 - s) * s * mx + s * s * b[0], y = (1 - s) * (1 - s) * a[1] + 2 * (1 - s) * s * my + s * s * b[1];
            g.lineTo(x + off, y + off);
          }
          g.strokeStyle = col; g.lineWidth = lw; g.stroke();
        }
        g.restore();
      });
    });
  }

  // People: faceted pop-up paper figures stand up one by one, sway on their bases and turn their
  // heads; the highlighted one holds a speech card with bouncing dots.
  function faceprint(g, w, h, blink) {
    const T = frame.T;
    g.fillStyle = T.inkHex;
    const ey = h * 0.42, eh = blink ? 1.5 : w * 0.09;
    g.beginPath(); g.ellipse(w * 0.32, ey, w * 0.075, eh, 0, 0, TAU); g.ellipse(w * 0.68, ey, w * 0.075, eh, 0, 0, TAU); g.fill();
    g.fillStyle = "rgba(240,110,110,0.45)"; g.beginPath(); g.ellipse(w * 0.2, h * 0.62, w * 0.09, w * 0.05, 0, 0, TAU); g.ellipse(w * 0.8, h * 0.62, w * 0.09, w * 0.05, 0, 0, TAU); g.fill();
    g.strokeStyle = T.inkHex; g.lineWidth = w * 0.06; g.lineCap = "round";
    g.beginPath(); g.arc(w * 0.5, h * 0.6, w * 0.14, 0.25 * Math.PI, 0.75 * Math.PI); g.stroke();
  }
  function figure(B, X, H, shirt, skin, hair, t, i, hot) {
    const T = frame.T;
    prism(B, X, 8, H * 0.24, H * 0.24, 0, H * 0.03, T.card2, { layer: 2, contact: true });
    prism(B, X, 6, H * 0.19, H * 0.12, H * 0.03, H * 0.55, shirt, { keep: true, rot: 0 });
    for (const sd of [-1, 1]) {
      const wave = hot && sd > 0 ? 0.5 + 0.35 * Math.sin(t * 4) : 0;
      rod(B, X, [sd * H * 0.13, 0, H * 0.5], [sd * H * (0.26 + wave * 0.05), -H * 0.04, H * (0.27 + wave * 0.38)], H * 0.035, 4, tone(shirt, 0.9), { keep: true });
    }
    const turn = 0.32 * Math.sin(t * 0.9 + i * 1.7);
    const Xh = rotZ(X, turn);
    const blink = frac(t / 3.1 + i * 0.37) > 0.96;
    prism(B, Xh, 6, H * 0.17, H * 0.17, H * 0.57, H * 0.84, skin, { keep: true, rot: 0, face: { i: 4, fn: (g, w, h) => faceprint(g, w, h, blink) } });
    prism(B, Xh, 6, H * 0.185, H * 0.13, H * 0.84, H * 0.94, hair, { keep: true, rot: 0 });
  }
  function sPeople(C) {
    const { F, B, ou, local, t, fold, data: d, A } = C, { u, tall, T } = F;
    const n = Math.max(2, Math.min(6, Math.round(Number(d.count) || 4))), bt = local / Math.min(1.9, C.hold * 0.6);
    const hiIdx = Math.min(n - 1, d.highlight);
    const twoRows = tall && n > 3;
    const front = twoRows ? 3 : n, back = n - front;
    const slots = [];
    const rowY = (r) => (twoRows ? A.y + A.h * (r ? 0.36 : 0.66) : A.y + A.h * (tall ? 0.6 : 0.66));
    for (let i = 0; i < front; i++) slots.push({ i, sx: A.x + (A.w / front) * (i + 0.5), sy: rowY(0) + (tall ? 0 : Math.abs(i - (front - 1) / 2) * -14 * u), spacing: A.w / front });
    for (let i = 0; i < back; i++) slots.push({ i: front + i, sx: A.x + (A.w / back) * (i + 0.5), sy: rowY(1), spacing: A.w / back });
    const skins = T.skins, hairs = T.hairs;
    slots.forEach((sl) => {
      const i = sl.i, hot = i === hiIdx;
      const H = Math.min((sl.spacing / u) * 1.45, (sl.sy - (twoRows && sl.i < front ? rowY(1) - 40 * u : A.y + 70 * u)) / (CE * u) - (hot ? 120 : 10), tall ? 520 : 470) * (hot ? 1.06 : 1);
      const q = backOut(fold * clamp((bt - i * 0.1) / 0.5));

      const swayA = 0.035 * Math.sin(t * 1.6 + i * 1.3), swayB = 0.02 * Math.sin(t * 1.1 + i);
      // Figures spring up from a flattened paper concertina, overshooting a little.
      const kz = 0.05 + 0.95 * q, Xp = place(F, ou, sl.sx, sl.sy, (i - (n - 1) / 2) * -0.12);
      const X = sway((x, y, z) => Xp(x, y, z * kz), swayA * clamp(q), swayB * clamp(q));
      figure(B, X, H, hot ? F.accent : T.cards[(i + 1) % T.cards.length], skins[i % skins.length], hairs[(i * 3 + 1) % hairs.length], t, i, hot);
      const label = i < 3 ? d.badges[i] : null;
      if (label) {
        const cq = backOut(fold * clamp((bt - 0.3 - i * 0.1) / 0.45));
        tent(B, place(F, ou, sl.sx, sl.sy + 96 * u, 0), Math.min(sl.spacing / u * 0.9, 400), 104, cq, { lines: [{ text: label, size: 56, font: "body", min: 48, color: hot ? F.accent : T.inkHex }], stripe: hot ? F.accent : T.cards[(i + 1) % T.cards.length] });
      }
      if (hot) {
        const bq = backOut(fold * clamp((bt - 0.75) / 0.4));
        if (bq > 0.01) {
          const Xb = scaleXf(shift(rotZ(X, 0), H * 0.32, 0, H * 1.02), 1);
          const bw = 150, bh = 96, k = bq;
          const Xbb = (x, y, z) => Xb(x * k, y, (z - bh / 2) * k + bh / 2);
          boxNet(B, Xbb, bw, 12, bh, 1, T.card, { noContact: true, layer: 3, print: { front: (g, w, h) => {
            g.strokeStyle = rgba(T.inkHex, 0.25); g.lineWidth = 3; g.strokeRect(8, 8, w - 16, h - 16);
            for (let j = 0; j < 3; j++) { const y = h / 2 - Math.max(0, Math.sin(t * 6 - j * 0.9)) * h * 0.14; g.fillStyle = j === 1 ? F.accent : T.inkHex; g.beginPath(); g.arc(w * (0.3 + j * 0.2), y, w * 0.06, 0, TAU); g.fill(); }
          } } });
          B.face([Xbb(-bw * 0.3, -6, 2), Xbb(-bw * 0.1, -6, 2), Xbb(-bw * 0.36, -6, -26)], T.card, { noLip: true });
        }
      }
    });
  }

  // Process: three pedestals climb like steps; a paper road with scrolling chevrons links them and a
  // little cube keeps hopping along it. Step names stand on tent cards.
  function icon(g, kind, cx, cy, s, col) {
    g.save(); g.strokeStyle = col; g.fillStyle = col; g.lineWidth = s * 0.09; g.lineCap = "round"; g.lineJoin = "round";
    if (kind === 0) { // a film frame under a loupe
      g.strokeRect(cx - s * 0.42, cy - s * 0.3, s * 0.62, s * 0.5);
      for (let k = 0; k < 4; k++) { g.fillRect(cx - s * 0.38 + k * s * 0.15, cy - s * 0.27, s * 0.07, s * 0.06); g.fillRect(cx - s * 0.38 + k * s * 0.15, cy + s * 0.11, s * 0.07, s * 0.06); }
      g.beginPath(); g.arc(cx + s * 0.16, cy + s * 0.02, s * 0.2, 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(cx + s * 0.3, cy + s * 0.17); g.lineTo(cx + s * 0.44, cy + s * 0.34); g.stroke();
    } else if (kind === 1) { // a pencil over a dashed line
      g.beginPath(); g.moveTo(cx - s * 0.3, cy + s * 0.3); g.lineTo(cx + s * 0.25, cy - s * 0.25); g.lineTo(cx + s * 0.36, cy - s * 0.14); g.lineTo(cx - s * 0.19, cy + s * 0.41); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(cx - s * 0.3, cy + s * 0.3); g.lineTo(cx - s * 0.38, cy + s * 0.48); g.lineTo(cx - s * 0.19, cy + s * 0.41); g.stroke();
      g.setLineDash([s * 0.08, s * 0.08]); g.beginPath(); g.moveTo(cx - s * 0.45, cy - s * 0.38); g.lineTo(cx + s * 0.05, cy - s * 0.38); g.stroke(); g.setLineDash([]);
    } else { // a check in a rosette ring
      g.beginPath(); g.arc(cx, cy, s * 0.36, 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(cx - s * 0.17, cy + s * 0.01); g.lineTo(cx - s * 0.04, cy + s * 0.14); g.lineTo(cx + s * 0.19, cy - s * 0.13); g.stroke();
    }
    g.restore();
  }
  function sProcess(C) {
    const { F, B, ou, local, t, fold, data: d, A } = C, { u, tall, T } = F;
    const steps = d.steps, n = steps.length, bt = local / Math.min(2.0, C.hold * 0.6);
    const pos = [];
    for (let i = 0; i < n; i++) {
      if (tall) pos.push({ bx: A.x + A.w * 0.24, by: A.y + A.h * (0.24 + i * 0.32), cx: A.x + A.w * 0.68, cy: A.y + A.h * (0.24 + i * 0.32) + 30 * u });
      else pos.push({ bx: A.x + A.w * ((i + 0.5) / n), by: A.y + A.h * 0.56, cx: A.x + A.w * ((i + 0.5) / n), cy: A.y + A.h * 0.56 + 210 * u });
    }
    const bw = tall ? 200 : Math.min(230, (A.w / n / u) * 0.42), bd = bw * 0.85;
    const maxH = tall ? (A.h * 0.24) / (CE * u) : (pos[0].by - A.y - 40 * u) / (CE * u) - 20;
    // The road: a paper strip through the pedestals' feet.
    const road = pos.map((p) => [ou + LU(F, p.bx) + (tall ? bw * 0.7 : 0), LV(F, p.by) - (tall ? 0 : bd * 0.5 + 56), 0]);
    const ext = tall ? [[road[0][0], road[0][1] + 140, 0], ...road, [road[n - 1][0], road[n - 1][1] - 160, 0]] : [[road[0][0] - 260, road[0][1] + 30, 0], ...road, [road[n - 1][0] + 260, road[n - 1][1] + 30, 0]];
    const segs = [];
    let total = 0;
    for (let i = 0; i < ext.length - 1; i++) { const l = Math.hypot(ext[i + 1][0] - ext[i][0], ext[i + 1][1] - ext[i][1]); segs.push(l); total += l; }
    const rq = fold * ease(clamp(bt / 0.7)), rw = 46;
    let acc = 0;
    for (let i = 0; i < ext.length - 1; i++) {
      const a = ext[i], b = ext[i + 1], l = segs[i];
      const shown = clamp((rq * total - acc) / l);
      acc += l;
      if (shown <= 0) continue;
      const e = [a[0] + (b[0] - a[0]) * shown, a[1] + (b[1] - a[1]) * shown, 0];
      const dx = (b[0] - a[0]) / l, dy = (b[1] - a[1]) / l, nx = -dy * rw / 2, ny = dx * rw / 2;
      const off0 = acc - l;
      B.obj(0, a);
      B.face([[a[0] - nx, a[1] - ny, 1.2], [e[0] - nx, e[1] - ny, 1.2], [e[0] + nx, e[1] + ny, 1.2], [a[0] + nx, a[1] + ny, 1.2]], T.card, {
        noLip: true, inside: T.card,
        print: (g, w, h) => {
          g.fillStyle = tone(T.card2, 1); g.fillRect(0, 0, w, 5); g.fillRect(0, h - 5, w, 5);
          g.fillStyle = rgba(F.accent, 0.85);
          const stepL = 52, o = (t * 70 + off0) % stepL;
          for (let x = -o; x < w + stepL; x += stepL) { g.beginPath(); g.moveTo(x, h * 0.25); g.lineTo(x + 16, h * 0.5); g.lineTo(x, h * 0.75); g.lineTo(x + 10, h * 0.75); g.lineTo(x + 26, h * 0.5); g.lineTo(x + 10, h * 0.25); g.closePath(); g.fill(); }
        },
      });
    }
    // Pedestals, icons, numbers and labels.
    pos.forEach((p, i) => {
      // Nets start half-scored (sides already lifting) so neighbours never sprawl over each other.
      const pre = 0.3 * (C.pending ? 1 : fold), q = pre + (fold - pre) * clamp((bt - 0.15 - i * 0.16) / 0.55), hgt = maxH * (0.44 + 0.24 * i);
      const col = i === n - 1 ? F.accent : T.cards[(i * 2) % T.cards.length];
      const X = place(F, ou, p.bx, p.by, tall ? 0.38 : 0.34 - i * 0.04);
      boxNet(B, X, bw, bd, hgt, q, col, {
        print: {
          front: (g, w, h) => { const s = Math.min(w, h) * 0.78; g.fillStyle = "rgba(255,255,255,0.88)"; g.beginPath(); g.arc(w / 2, Math.min(h * 0.42, w * 0.55), s * 0.52, 0, TAU); g.fill(); icon(g, i, w / 2, Math.min(h * 0.42, w * 0.55), s * 0.8, T.inkHex); },
          top: (g, w, h) => say(g, String(i + 1), w / 2, h / 2 + 4, h * 0.72, { color: "#fff", weight: 800 }),
        },
      });
      const cq = backOut(fold * clamp((bt - 0.45 - i * 0.16) / 0.45));
      {
        const cw = tall ? Math.min(A.w * 0.5, 470) / u : Math.min((A.w / n) * 0.9, 520) / u;
        tent(B, place(F, ou, p.cx, p.cy, 0), cw, 110, cq, { lines: [{ text: steps[i] || "", size: 58, font: "body", min: 48 }], stripe: col });
      }
    });
    // The hopping cube.
    if (rq > 0.98) {
      const per = 4.2, k = frac(t / per), dist = k * total;
      let s = 0, j = 0;
      while (j < segs.length - 1 && s + segs[j] < dist) { s += segs[j]; j++; }
      const a = ext[j], b = ext[j + 1], kk = clamp((dist - s) / segs[j]);
      const hop = Math.abs(Math.sin(k * Math.PI * 9)) * 40, fade = clamp(k * 12) * clamp((1 - k) * 12);
      const cu = a[0] + (b[0] - a[0]) * kk, cv = a[1] + (b[1] - a[1]) * kk;
      const sz = 40 * fade;
      if (sz > 1) boxNet(B, (x, y, z) => { const r = t * 3; const c = Math.cos(r), sn = Math.sin(r); return [cu + x * c - y * sn, cv + x * sn + y * c, 2 + hop + z]; }, sz, sz, sz, 1, F.accent, { layer: 3, noContact: true });
    }
  }

  // Compare: a big cardstock balance. Cube nets fold up and pile into each pan, the beam tips as the
  // weight lands and keeps rocking, a paper meter on the pillar follows the tilt, and two sliders ride a
  // paper ruler under the counter cards.
  function sCompare(C) {
    const { F, B, ou, local, t, fold, data: d, A } = C, { u, tall, T } = F;
    const lv = Number(d.leftValue) || 0, rv = Number(d.rightValue) || 0, mx = Math.max(lv, rv, 1), bt = local / Math.min(2.2, C.hold * 0.62);
    const cx = A.x + A.w / 2, by = tall ? A.y + A.h * 0.52 : A.y + A.h * 0.6;
    const Lb = Math.min((tall ? A.w * 0.9 : A.w * 0.64) / u, 1180), Hp = Math.min((by - A.y - 10 * u) / (CE * u) * 0.95, tall ? 600 : 500);
    const X = place(F, ou, cx, by, 0);
    const f0 = fold * clamp(bt / 0.4);
    boxNet(B, X, Lb * 0.3, 190, 30, f0, T.card2, { layer: 1, print: { front: (g, w, h) => { g.fillStyle = rgba(T.inkHex, 0.35); for (let x = 16; x < w; x += 26) g.fillRect(x, h * 0.3, 2, h * 0.4); } } });
    boxNet(B, shift(X, 0, 0, 30), 40, 40, Hp - 30, fold * clamp((bt - 0.12) / 0.4), T.slate, {});
    const R = Math.min(Lb * 0.18, 175), ls = Hp * 0.6, s = R * 0.52;
    const nl = Math.min(13, Math.max(1, Math.round(lv))), nr = Math.min(13, Math.max(1, Math.round(rv)));
    const drop = (i, side) => clamp((bt - 0.34 - i * 0.06 - side * 0.12) / 0.3);
    let wl = 0, wr = 0;
    for (let i = 0; i < nl; i++) wl += drop(i, 0);
    for (let i = 0; i < nr; i++) wr += drop(i, 1);
    const fl = nl ? wl / nl : 0, fr = nr ? wr / nr : 0;
    // Each landing gives the beam a kick that rings down; under it a steady rock never stops.
    let kick = 0;
    for (const [n2, side, sg] of [[nl, 0, 1], [nr, 1, -1]]) for (let i = 0; i < n2; i++) {
      const land = 0.34 + i * 0.06 + side * 0.12 + 0.3, dt = bt - land;
      if (dt > 0) kick += sg * 0.035 * Math.exp(-dt * 2.4) * Math.sin(dt * 9);
    }
    const settle = clamp(bt - 0.3);
    const tilt = (0.2 * (lv * fl - rv * fr)) / mx + (0.045 * Math.sin(t * 1.5) + 0.015 * Math.sin(t * 3.7 + 1)) * settle + kick;
    const bq = fold * clamp((bt - 0.1) / 0.3);
    const pz = Hp + 16;
    const Xbeam = rotY(shift(X, 0, 0, 0), tilt, 0, pz);
    if (bq > 0.01) {
      boxNet(B, (x, y, z) => Xbeam(x * bq, y, pz - 12 + z), Lb, 28, 24, 1, T.card2, { noContact: true, print: { front: (g, w, h) => { g.fillStyle = rgba(T.inkHex, 0.35); for (let x = w * 0.04; x < w; x += w * 0.04) g.fillRect(x, h * 0.25, 2, h * 0.5); g.fillStyle = F.accent; g.fillRect(w / 2 - 3, 0, 6, h); } } });
      prism(B, (x, y, z) => X(x, y - 20, z), 8, 24, 24, pz - 22, pz + 22, F.accent, { layer: 2 });
      // A paper meter card on the pillar: its needle follows the beam.
      const mq = backOut(fold * clamp((bt - 0.3) / 0.4)), mw = 210 * mq, mh = 130 * mq, mz = pz - 70;
      if (mq > 0.02) {
        const M = (x, z) => X(x, -24, mz + z);
        B.obj(3, M(0, 0));
        B.face([M(-mw / 2, 0), M(mw / 2, 0), M(mw / 2, -mh), M(-mw / 2, -mh)], T.card, { print: (g, w, h) => {
          g.fillStyle = T.card; g.fillRect(0, 0, w, h);
          g.strokeStyle = rgba(T.inkHex, 0.55); g.lineWidth = 3;
          for (let j = -6; j <= 6; j++) { const a = -Math.PI / 2 + j * 0.16, r0 = h * (j % 3 ? 0.66 : 0.58); g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * r0, h * 0.92 + Math.sin(a) * r0); g.lineTo(w / 2 + Math.cos(a) * h * 0.76, h * 0.92 + Math.sin(a) * h * 0.76); g.stroke(); }
          g.fillStyle = T.mutedHex; g.beginPath(); g.arc(w * 0.14, h * 0.3, h * 0.07, 0, TAU); g.fill();
          g.fillStyle = F.accent; g.beginPath(); g.arc(w * 0.86, h * 0.3, h * 0.07, 0, TAU); g.fill();
        } });
        const na = -tilt * 3.2, nl2 = mh * 0.7;
        const tip = M(Math.sin(na) * nl2, -mh * 0.92 + Math.cos(na) * nl2), b1 = M(Math.cos(na) * 7, -mh * 0.92 - Math.sin(na) * 7), b2 = M(-Math.cos(na) * 7, -mh * 0.92 + Math.sin(na) * 7);
        B.face([b1, tip, b2].map((p) => [p[0], p[1] - 2, p[2]]), F.accent, { noShadow: true, noLip: true, flat: true });
      }
    }
    const pans = [[-1, nl, lv, fl, T.mutedHex], [1, nr, rv, fr, F.accent]];
    // Pile order: a 2×2 floor, a 2×2 second layer, a cap, then a ring round the floor.
    const pile = [[-0.5, -0.5, 0], [0.5, -0.5, 0], [-0.5, 0.5, 0], [0.5, 0.5, 0], [-0.5, -0.5, 1], [0.5, -0.5, 1], [-0.5, 0.5, 1], [0.5, 0.5, 1], [0, 0, 2], [-1.55, 0, 0], [1.55, 0, 0], [0, -1.55, 0], [0, 1.55, 0]];
    pans.forEach(([sd, cnt, val, fr2, col], side) => {
      const end = Xbeam(sd * Lb / 2 * Math.max(bq, 0.0001), 0, pz);
      const pq = fold * clamp((bt - 0.2) / 0.3), rest = X(sd * Lb / 2, 0, 0);
      const swing = 14 * Math.sin(t * 1.9 + side * 1.7) * settle, swv = 8 * Math.cos(t * 1.6 + side) * settle;
      const hang = [end[0] + swing, end[1] + swv, Math.max(10, end[2] - ls)];
      const pc = [lerp(rest[0], hang[0], pq), lerp(rest[1], hang[1], pq), lerp(18, hang[2], ease(pq))], pcz = pc[2];
      const Xpan = (x, y, z) => [pc[0] + x, pc[1] + y, pcz + z];
      prism(B, Xpan, 8, R * 0.72, R, -20, 10, tone(T.card2, 0.95), { layer: 2, topCol: tone(T.card2, 0.78), rot: Math.PI / 8 });
      if (pq > 0.05) for (let k = 0; k < 3; k++) {
        const a = Math.PI / 6 + k * (TAU / 3) + Math.PI / 3;
        B.obj(2, [pc[0] + Math.cos(a) * R, pc[1] + Math.sin(a) * R, pcz + 10]);
        thread(B, [pc[0] + Math.cos(a) * R * 0.95, pc[1] + Math.sin(a) * R * 0.95, pcz + 10], end, T.thread, 1.8);
      }
      const base = X(sd * Lb / 2, -R * 1.3, 0);
      for (let i = 0; i < cnt; i++) {
        const k = drop(i, side) * fold, g0 = pile[i];
        const col2 = T.cards[(i + side * 2) % T.cards.length];
        const wa = (i - (cnt - 1) / 2) * 0.36 + side * 0.2, wr2 = R * (1.0 + (i % 3) * 0.3);
        const w0 = [base[0] + Math.sin(wa) * wr2, base[1] - Math.cos(wa) * wr2 * 0.45 + R * 0.5, 0];
        const fk = clamp(k / 0.45), mk = ease(clamp((k - 0.3) / 0.7));
        const sc = s * 0.94 * lerp(0.62, 1, fk);
        // Landed cubes ride the pan and jostle a little as it swings.
        const jig = k >= 1 ? 2.5 * Math.sin(t * 2.6 + i * 1.3) : 0;
        const tx = lerp(w0[0], pc[0] + g0[0] * s, mk) + jig, ty = lerp(w0[1], pc[1] + g0[1] * s, mk);
        const tz = lerp(0, pcz + 10 + g0[2] * s, mk) + Math.sin(mk * Math.PI) * 150;
        const spin = (1 - mk) * (wa * 1.6 + 0.4) + mk * (Math.PI * 2 + 0.08 * Math.sin(i * 2.1)) + (k >= 1 ? 0.04 * Math.sin(t * 2 + i) : 0);
        boxNet(B, rotZ((x, y, z) => [tx + x, ty + y, tz + z], spin, 0, 0), sc, sc, sc, fk, col2, { layer: k > 0.3 ? 3 : 1, noContact: k > 0.3 });
      }
    });
    // The paper ruler along the bottom band, with a slider for each side riding to its count.
    const rq = ease(fold * clamp((bt - 0.1) / 0.5));
    const ry = tall ? A.y + A.h * 0.78 : A.y + A.h * 0.97, rx0 = tall ? A.x + A.w * 0.06 : A.x + A.w * 0.27, rx1 = tall ? A.x + A.w * 0.94 : A.x + A.w * 0.73;
    const rL = (rx1 - rx0) / u, rD = 84;
    if (rq > 0.01) {
      const Xr = place(F, ou, rx0, ry, 0);
      B.obj(0, Xr(0, 0, 0));
      B.face([Xr(0, rD / 2, 1.5), Xr(rL * rq, rD / 2, 1.5), Xr(rL * rq, -rD / 2, 1.5), Xr(0, -rD / 2, 1.5)], tone(T.wood, 1.18), { noLip: true, print: (g, w, h) => {
        const full = w / Math.max(0.01, rq);
        g.fillStyle = tone(T.wood, 1.22); g.fillRect(0, 0, w, h);
        g.fillStyle = rgba(T.inkHex, 0.7); g.font = `700 ${h * 0.34}px ${BODY}`; g.textAlign = "center"; g.textBaseline = "bottom";
        const steps = Math.max(4, Math.ceil(mx));
        for (let j = 0; j <= steps * 2; j++) {
          const x = 12 + ((full - 24) * j) / (steps * 2);
          if (x > w) break;
          g.fillRect(x - 1.5, 0, 3, j % 2 ? h * 0.22 : h * 0.4);
          if (j % 2 === 0 && (steps <= 12 || j % 4 === 0)) g.fillText(String(Math.round((j / 2) * (mx / steps))), x, h - 4);
        }
      } });
      B.contact([Xr(0, rD / 2, 0), Xr(rL * rq, rD / 2, 0), Xr(rL * rq, -rD / 2, 0), Xr(0, -rD / 2, 0)]);
      for (const [val, frc, col2] of [[lv, fl, T.mutedHex], [rv, fr, F.accent]]) {
        const sx2 = Math.min(rL * rq, 12 + (rL - 24) * ((val * frc) / Math.max(4, Math.ceil(mx))));
        const Xs = shift(Xr, sx2, -rD * 0.15, 0);
        prism(B, (x, y, z) => Xs(x, y, z), 3, 26, 26, 0, 44, col2, { layer: 3, rot: -Math.PI / 2, contact: true, topCol: tone(col2, 1.15) });
      }
    }
    pans.forEach(([sd, cnt, val, fr2, col], side) => {
      const cq = backOut(fold * clamp((bt - 0.15 - side * 0.12) / 0.45));
      const label = side ? d.right : d.left;
      const csx = tall ? A.x + A.w * (side ? 0.75 : 0.25) : A.x + A.w * (side ? 0.88 : 0.12), csy = tall ? A.y + A.h * 0.94 : A.y + A.h * 0.94;
      const cw = tall ? Math.min(A.w * 0.47, 440) / u : Math.min(A.w * 0.23, 400) / u;
      tent(B, place(F, ou, csx, csy, tall ? 0 : sd * -0.14), cw, 260, cq, {
        stripe: side ? F.accent : T.mutedHex,
        lines: [{ text: label || "", size: 46, font: "body", min: 42 }, { text: fmt(val, d, fr2), size: 126, color: side ? F.accent : T.inkHex, min: 98 }],
      });
    });
  }

  const DRAW = { title: sTitle, chart: sChart, object: sObject, people: sPeople, process: sProcess, compare: sCompare, closing: sClosing };
  const drawer = (id) => (ctx, S, box, p, d, info) => {
    const F = frame;
    if (!F || !DRAW[id] || F.plan) return;
    const outgoing = info.exit !== undefined;
    const idx = outgoing ? F.index - 1 : F.index;
    const local = info.local, hold = info.hold;
    const B = new Build(F);
    B.alpha = outgoing || F.index === 0 ? 1 : clamp(local / 0.08);
    const fold = outgoing ? 1 - ease(info.exit) : 1;
    const C = { F, B, ou: idx * F.PITCH, local, hold, t: info.t, fold, data: d || {}, A: areaOf(F, id) };
    ctx.save();
    DRAW[id](C);
    B.render(ctx);
    if (!outgoing) { placard(ctx, F, id, local, hold, !F.info.next, F.index, false); lighting(ctx, F); }
    ctx.restore();
  };

  // The scene plan, read from the composition's controls so every station can be drawn at any time.
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  let planCache = null, planKey = "";
  function controls() {
    if (window.__dreamcut && window.__dreamcut.controls) return window.__dreamcut.controls;
    try { if (typeof dc !== "undefined" && dc && dc.controls) return dc.controls; } catch (e) { /* not on this page */ }
    return null;
  }
  function planOf(W, H) {
    const c = controls();
    if (!c) return null;
    const key = `${W}x${H}`;
    if (planCache && planKey === key) return planCache;
    let t = 0;
    const shown = [];
    for (const id of ORDER) { const hold = Number(c[`${id}_hold`]) || 0; if (hold > 0) shown.push({ id, start: t, hold }); t += hold; }
    if (!shown.length) return null;
    const data = {
      chart: { labels: [c.bar_1_label, c.bar_2_label, c.bar_3_label, c.bar_4_label], values: [c.bar_1, c.bar_2, c.bar_3, c.bar_4], suffix: c.chart_suffix, prefix: "", highlight: Number(c.highlight) - 1 },
      object: { kind: c.device, callouts: [c.callout_1, c.callout_2, c.callout_3] },
      people: { count: c.people_count, badges: [c.badge_1, c.badge_2, c.badge_3], highlight: 1 },
      process: { steps: [c.step_1, c.step_2, c.step_3] },
      compare: { left: c.before_label, leftValue: c.before_value, right: c.after_label, rightValue: c.after_value, suffix: c.compare_suffix, prefix: "" },
    };
    planKey = key;
    return (planCache = { shown, data, entrance: Number(c.entrance) || 0.7, length: t });
  }

  function makeFrame(S, info) {
    const { W, H, u } = S, look = S.look, T = look.tone;
    const PITCH = (W / u) * PITCH_K;
    const i = Math.max(0, info.index), loc = info.local, hold = info.hold || 1, ch = info.change || 0.45, t = info.t;
    const plan = planOf(W, H);
    // With the plan known every station is drawn by the stage, so the pan can take its time.
    // The pan mostly lands before the new scene starts, so a scene opens on its own station, not on bare mat.
    const pre = plan ? 0.8 : Math.max(0.45, 1.05 - ch), post = plan ? 0.32 : ch * 0.9;
    let base = i * PITCH, lift = 0;
    if (i > 0 && loc < post) { const k = inout((loc + pre) / (pre + post)); base = lerp((i - 1) * PITCH, i * PITCH, k); lift = Math.sin(Math.PI * k); }
    else if (info.next && loc > hold - pre) { const k = inout((loc - (hold - pre)) / (pre + post)); base = lerp(i * PITCH, (i + 1) * PITCH, k); lift = Math.sin(Math.PI * k); }
    let zoom = 1.02 + 0.014 * Math.sin(t * 0.31 + 0.6) - 0.07 * lift;
    // A slow push in on every held station, eased back out as the camera leaves, so holds keep moving.
    if (info.scene && info.next) zoom += 0.055 * inout(span(loc, post, hold - pre)) * (1 - inout(span(loc, hold - pre, hold)));
    if (!info.next && info.scene) zoom -= 0.06 * inout(span(loc, hold - Math.min(2.6, hold * 0.6), hold));
    const F = {
      S, W, H, u, T, info, t, tall: S.tall, accent: S.accent, tex: look.texture, PITCH, index: info.index,
      s: u * zoom, cx: W / 2, cy: H / 2, base, camU: base + 30 * Math.sin(t * 0.37), camV: 16 * Math.sin(t * 0.29 + 1.3),
      L: norm([-0.5 + 0.07 * Math.sin(t * 0.4), -0.4, 0.78]),
      plan, entrance: plan ? plan.entrance : 0.7, change: ch,
    };
    frame = F;
    const key = `${W}x${H}:${T.mat}`;
    if (!tiles || tileKey !== key) { tiles = makeTiles(F); tileKey = key; }
    return F;
  }

  const CARDS = ["#7cb7d9", "#f2b53d", "#3fa497", "#ef7357", "#9b7bc4", "#9fc27a"];
  const TONE = {
    mat: "#30485f", matLite: "200,225,245", gridRGB: "196,222,240", gridMinor: 0.12, gridMajor: 0.24, gridHot: "#e8c25a",
    card: "#f4ecdc", card2: "#e3d6bd", slate: "#2f3640", wood: "#d9a46a", film: "#3a3f47", thread: "#d8453a",
    inkHex: "#25303b", mutedHex: "#5c6a77", cards: CARDS,
    skins: ["#f1c9a5", "#c98f63", "#8d5a3b", "#e8b48c", "#a86f4c", "#f5d6b8"], hairs: ["#3b2a20", "#1f1f24", "#a0522d", "#d9a441", "#6b4a3a", "#2d2a3a"],
    shadeRGB: "12,18,28", edgeRGB: "20,26,34", shadowA: 0.42, lampRGB: "255,236,205", lamp: 0.13, vignette: 0.38,
  };

  return {
    // Headlines set straight on this look's backdrop, where its ink and accent (meant for panels) do not read.
    displayInk: { original: "#ffffff", dark: "#ffffff", mono: "#ffffff" },
    displayAccent: { light: "#8f4024", mono: "#f4f5f5" },
    bg: TONE.mat, panel: TONE.card, ink: TONE.inkHex, muted: TONE.mutedHex, accent: "#ef6a3c", onAccent: "#ffffff",
    rule: "rgba(37,48,59,0.4)", track: "rgba(37,48,59,0.12)",
    display: DISPLAY, displayWeight: 700, displayTracking: "-0.005em",
    body: BODY, bodyWeight: 600, figures: DISPLAY, radius: 4,
    motion: "write", change: "fold",
    kit: { line: 2.4, fill: "solid", panel: "fill" },
    tone: TONE,
    keepArt: true,
    overlap: true,
    css: () => "#root .kicker { letter-spacing: 0.2em; font-weight: 700; }",
    palettes: {
      // Light: a pale grey mat. Dark: a charcoal mat at night. Mono: grey and white stock on a grey mat.
      light: { bg: "#c9d2d6", backdrop: () => "#c9d2d6",
        tone: { ...TONE, mat: "#c6d0d5", matLite: "255,255,255", gridRGB: "60,80,96", gridMinor: 0.12, gridMajor: 0.24, gridHot: "#d2683c", shadowA: 0.3, lamp: 0.16, vignette: 0.16, shadeRGB: "30,36,48" } },
      dark: { bg: "#17191d", backdrop: () => "#17191d",
        tone: { ...TONE, mat: "#1b1e23", matLite: "180,190,205", gridRGB: "150,170,190", gridMinor: 0.08, gridMajor: 0.17, gridHot: "#c99a3c", shadowA: 0.55, lamp: 0.1, vignette: 0.55 } },
      mono: { bg: "#6c7075", accent: "#2b2e33", backdrop: () => "#6c7075",
        tone: { ...TONE, mat: "#686c71", matLite: "230,230,230", gridRGB: "235,235,235", gridMinor: 0.12, gridMajor: 0.24, gridHot: "#f0f0f0", card: "#f3f3f1", card2: "#d5d5d2", slate: "#34373b", wood: "#bdbdb8", film: "#3c3e42", thread: "#2b2e33",
          cards: ["#ffffff", "#c9c9c6", "#9a9b9c", "#e3e3e0", "#7d7f82", "#b3b4b2"], skins: ["#e9e9e7", "#cfcfcc", "#b5b5b2"], hairs: ["#3a3c40", "#5a5c60", "#2a2b2e"], shadowA: 0.4, lamp: 0.12, vignette: 0.3 } },
    },
    textShadow: () => "none",
    backdrop: () => TONE.mat,
    // The mat is drawn by the stage so it can move with the camera; this pass only marks the backdrop as on.
    paint: (ctx, W, H) => { ctx.clearRect(0, 0, W, H); },
    stage(ctx, S, info) {
      const F = makeFrame(S, info);
      const half = (F.W / 2) / F.s;
      if (S.paint) {
        mat(ctx, F);
        const B = new Build(F);
        for (let i = Math.floor((F.camU - half) / F.PITCH) - 1; i <= Math.ceil((F.camU + half) / F.PITCH) + 1; i++) props(B, F, i);
        B.render(ctx);
      }
      const P = F.plan;
      if (!P) return;
      // Every station in view: later ones wait as flat nets, the current one builds, earlier ones fold back down.
      // A station starts building LEAD seconds before its scene, while the camera is still sliding to it.
      const LEAD = 0.6;
      P.shown.forEach((st, k) => {
        const ou = k * F.PITCH;
        if (Math.abs(ou - F.camU) > half + F.PITCH * 0.75) return;
        const local = F.t - st.start, lastSt = k === P.shown.length - 1, eff = local + LEAD;
        const fold = eff < 0 ? 0 : local > st.hold && !lastSt ? 1 - ease((local - st.hold) / 0.9) : 1;
        const B = new Build(F);
        DRAW[st.id]({ F, B, ou, local: Math.max(0, eff), hold: st.hold + LEAD, t: F.t, fold, data: P.data[st.id] || {}, A: areaOf(F, st.id), pending: eff < 0 });
        B.render(ctx);
      });
      const prev = F.index > 0 ? P.shown[F.index - 1] : null;
      if (info.scene) placard(ctx, F, info.scene, info.local, info.hold, !info.next, F.index, !!prev && !clash(F, prev.id, info.scene));
      // The next headline card rides in face down with the mat while this one is still folding away.
      if (info.scene && info.next && info.local > info.hold - 0.7 && !clash(F, info.scene, info.next)) placard(ctx, F, info.next, info.local - info.hold, 99, false, F.index + 1, true);
      lighting(ctx, F);
    },
    scenes: { title: drawer("title"), chart: drawer("chart"), object: drawer("object"), people: drawer("people"), process: drawer("process"), compare: drawer("compare"), closing: drawer("closing") },
  };
});
