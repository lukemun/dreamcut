// Truchet: a living multi-scale maze. Quarter-arc tiles (two arcs per square, quad-tree subdivided on one
// grid so big and small tiles share one pipe network) fill the frame in quiet tones, flip a quarter turn at
// their own pace and carry slow colour waves. Every foreground thing is built from the same tiles on a
// grid: panel rims, hard shadows, bars, meters, bodies, floors and the headline word. Things arrive and
// leave cell by cell, and scene changes are a diagonal wave of tiles turning over.
// Every frame is a pure function of time: hashed tiles, seeded noise only, no clocks.
window.DreamcutMotion.register("truchet", ({ rng }) => {
  const TAU = Math.PI * 2, PI = Math.PI;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const seg = (p, a, b) => clamp((p - a) / (b - a));

  function hash(i, j, k) {
    let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(k | 0, 1274126177)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    h = Math.imul(h, 2246822519); h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, k) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return lerp(lerp(hash(xi, yi, k), hash(xi + 1, yi, k), sx), lerp(hash(xi, yi + 1, k), hash(xi + 1, yi + 1, k), sx), sy);
  }

  // ---- colour ------------------------------------------------------------------------------------
  function rgb(value) {
    const s = String(value || "");
    if (s[0] === "#") {
      const h = s.length === 4 ? s.slice(1).split("").map((c) => c + c).join("") : s.slice(1, 7);
      const n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (m) return m[1].split(",").slice(0, 3).map(Number);
    return [128, 128, 128];
  }
  const rgba = (c, a = 1) => { const v = typeof c === "string" ? rgb(c) : c; return `rgba(${v[0] | 0},${v[1] | 0},${v[2] | 0},${a})`; };
  const mix = (a, b, f) => { const A = rgb(a), B = rgb(b); return `rgb(${Math.round(lerp(A[0], B[0], f))},${Math.round(lerp(A[1], B[1], f))},${Math.round(lerp(A[2], B[2], f))})`; };
  const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;

  function theme(S) {
    const L = S.look;
    const dark = lum(rgb(L.bg)) < 120;
    return {
      u: S.u, tex: L.texture ?? 1, dark, ground: L.bg, disc: L.disc, band: L.band, alt: L.alt, pale: L.pale, acc: S.accent,
      plate: L.panel, ink: L.ink, muted: L.muted, border: L.edge, onAcc: L.onAccent,
    };
  }
  // The world is drawn in quiet tones of the ground so everything in front of it reads first.
  function worldPal(th) {
    const k = th.dark ? 1 : 0.75, g = th.ground;
    return {
      disc: [mix(g, th.band, 0.1 * k), mix(g, th.alt, 0.12 * k), mix(g, th.acc, 0.16 * k), mix(g, th.band, 0.17 * k)],
      band: [mix(g, th.band, 0.5 * k), mix(g, th.alt, 0.5 * k), mix(g, th.acc, 0.56 * k), mix(g, th.band, 0.7 * k)],
    };
  }
  const miniPal = (disc, band, disc2, band2) => ({ disc: [disc, disc2 || disc, disc, disc2 || disc], band: [band, band2 || band, band, band2 || band] });

  // ---- buffers / primitives ------------------------------------------------------------------------
  const BUF = {};
  function buf(key, w, h) {
    let c = BUF[key];
    if (!c) c = BUF[key] = document.createElement("canvas");
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return c;
  }
  function rr(ctx, x, y, w, h, r) {
    const q = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + q, y); ctx.arcTo(x + w, y, x + w, y + h, q); ctx.arcTo(x + w, y + h, x, y + h, q);
    ctx.arcTo(x, y + h, x, y, q); ctx.arcTo(x, y, x + w, y, q); ctx.closePath();
  }
  const font = (S, size, weight, fam = "display") => `${weight ?? (fam === "display" ? S.look.displayWeight : S.look.bodyWeight)} ${size}px ${fam === "figures" ? S.look.figures : fam === "body" ? S.look.body : S.look.display}`;
  function textW(ctx, S, s, size, o = {}) { ctx.save(); ctx.font = font(S, size, o.weight, o.fam); const w = ctx.measureText(String(s)).width; ctx.restore(); return w; }
  function fitSize(ctx, S, s, size, maxW, min, o = {}) {
    let z = size;
    while (z > min && textW(ctx, S, s, z, o) > maxW) z *= 0.95;
    return Math.max(min, z);
  }
  function txt(ctx, S, th, s, x, y, size, o = {}) {
    ctx.save();
    ctx.font = font(S, size, o.weight, o.fam);
    ctx.textAlign = o.align || "left"; ctx.textBaseline = o.base || "middle";
    ctx.fillStyle = o.color || th.ink;
    ctx.fillText(String(s ?? ""), x, y);
    ctx.restore();
  }
  const nf = (v, ref, suffix = "") => {
    const n = Number.isInteger(Number(ref)) ? String(Math.round(v)) : Number(v).toFixed(1);
    return n.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (suffix || "");
  };

  // ---- tiles ---------------------------------------------------------------------------------------
  // Two quarter arcs of one square tile, centre (cx, cy), half size h, turned by ang.
  function arcAdd(p, cx, cy, h, ang) {
    const cs = Math.cos(ang), sn = Math.sin(ang);
    const c1x = cx - h * cs + h * sn, c1y = cy - h * sn - h * cs, c2x = cx + h * cs - h * sn, c2y = cy + h * sn + h * cs;
    p.moveTo(c1x + h * cs, c1y + h * sn); p.arc(c1x, c1y, h, ang, ang + PI / 2);
    p.moveTo(c2x - h * cs, c2y - h * sn); p.arc(c2x, c2y, h, ang + PI, ang + PI * 1.5);
  }
  // Batch-draw tiles: { x, y (centre), s (size), ang, g (ground), a (arc colour) }.
  function tiles(ctx, list, o = {}) {
    if (!list.length) return;
    const G = new Map(), A = new Map(), grid = o.grid ? new Path2D() : null;
    for (const c of list) {
      const h = c.s / 2;
      if (c.g) { let p = G.get(c.g); if (!p) G.set(c.g, (p = new Path2D())); p.rect(c.x - h, c.y - h, c.s, c.s); }
      if (grid) grid.rect(c.x - h, c.y - h, c.s, c.s);
      if (c.a) {
        const lw = Math.max(1, Math.round(c.s * (o.lw ?? 0.24) * 2) / 2), key = c.a + "|" + lw;
        let e = A.get(key); if (!e) A.set(key, (e = { p: new Path2D(), lw, a: c.a }));
        arcAdd(e.p, c.x, c.y, h, c.ang);
      }
    }
    ctx.save();
    for (const [g, p] of G) { ctx.fillStyle = g; ctx.fill(p); }
    ctx.lineCap = "butt";
    for (const e of A.values()) { ctx.lineWidth = e.lw; ctx.strokeStyle = e.a; ctx.stroke(e.p); }
    if (grid) { ctx.lineWidth = o.gridW || 1.5; ctx.strokeStyle = o.grid; ctx.stroke(grid); }
    ctx.restore();
  }
  // A tile's turn: every tile flips a quarter turn on its own slow beat.
  function tAng(i, j, seed, t, per = 3.4, spread = 3.6) {
    const P = per + hash(i, j, seed + 1) * spread, off = hash(i, j, seed + 2) * P;
    const o0 = hash(i, j, seed + 3) < 0.5 ? 0 : 1, tt = t + off, k = Math.floor(tt / P);
    return (o0 + k + eio((tt - k * P) / 0.55)) * PI / 2;
  }
  // A designed wave: every `period` seconds the tile flips when the wave front (offset by `lag`) passes.
  function wAng(i, j, seed, t, lag, period = 1.9) {
    const o0 = hash(i, j, seed + 3) < 0.5 ? 0 : 1, ph = t / period - lag, k = Math.floor(ph), f = (ph - k) * period / 0.5;
    return { ang: (o0 + k + eio(f)) * PI / 2, flip: f > 0 && f < 1 };
  }

  // A panel built from tiles: a hard shadow of small tiles, a cream face on a faint cell grid, a rim of
  // flipping tiles carrying a travelling highlight. The size snaps to whole cells; returns the geometry.
  function tilePlate(ctx, S, th, x, y, w, h, o = {}) {
    const u = S.u, t = o.t || 0, seed = o.seed || 1;
    let cs = o.cs || 40 * u;
    const cols = Math.max(3, Math.round(w / cs)); cs = w / cols;
    const rows = Math.max(o.ring === false ? 1 : 3, Math.round(h / cs)), hh = rows * cs, yy = o.snap === false ? y : y + (h - hh) / 2;
    const H = o.snap === false ? h : hh;
    const off = (o.shadow ?? 18) * u, fill = o.fill || th.plate, ss = off;
    // Shadow: one row and one column of small tiles.
    if (off > 0) {
      const list = [], sg = o.shadowColor || th.alt;
      const nx = Math.ceil(w / ss), ny = Math.ceil(H / ss);
      for (let k = 0; k < nx; k++) list.push({ x: x + off + (k + 0.5) * ss, y: yy + H + ss / 2, s: ss, ang: tAng(k, 0, seed + 50, t, 2.2, 3), g: sg, a: th.border });
      for (let k = 0; k < ny; k++) list.push({ x: x + w + ss / 2, y: yy + off + (k + 0.5) * ss, s: ss, ang: tAng(0, k, seed + 60, t, 2.2, 3), g: sg, a: th.border });
      ctx.save(); ctx.beginPath(); ctx.rect(x + off, yy + off, w, H); ctx.clip();
      tiles(ctx, list, { lw: 0.26 });
      ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(x + off, yy + off, w, H); ctx.lineWidth = 3 * u; ctx.strokeStyle = th.border; ctx.stroke(); ctx.restore();
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(x, yy, w, H); ctx.fillStyle = fill; ctx.fill();
    const face = [], rim = [];
    const faintA = rgba(th.border, fill === th.plate ? 0.13 : 0.18), faintHot = rgba(th.border, 0.42);
    const faintG = rgba(fill === th.plate ? th.acc : th.plate, 0.24);
    const ring = o.ring !== false;
    const nr = Math.round(H / cs);
    const perim = 2 * (cols + nr) - 4;
    for (let j = 0; j < nr; j++) for (let i = 0; i < cols; i++) {
      const edge = ring && (i === 0 || j === 0 || i === cols - 1 || j === nr - 1);
      const cx = x + (i + 0.5) * cs, cy = yy + (j + 0.5) * cs;
      if (!edge) {
        if (o.faint !== false) { const wv = wAng(i, j, seed + 3, t, (i + j) * 0.07 + seed * 0.11, 2.8); face.push({ x: cx, y: cy, s: cs, ang: wv.ang, g: wv.flip ? faintG : null, a: wv.flip ? faintHot : faintA }); }
        continue;
      }
      const k = j === 0 ? i : i === cols - 1 ? cols - 1 + j : j === nr - 1 ? cols - 1 + nr - 1 + (cols - 1 - i) : 2 * (cols - 1) + nr - 1 + (nr - 1 - j);
      const hl = ((((k / perim - t * 0.11 - seed * 0.13) % 1) + 1) % 1) < 0.07;
      rim.push({ x: cx, y: cy, s: cs, ang: tAng(i, j, seed + 7, t, 2.6, 4), g: hl ? (o.hlGround || th.border) : (o.rimGround || th.acc), a: hl ? (o.rimGround || th.acc) : (o.rimArc || th.border) });
    }
    tiles(ctx, face, { lw: 0.16, grid: rgba(th.border, 0.06), gridW: 1.5 * u });
    tiles(ctx, rim, { lw: 0.26, grid: rgba(th.border, 0.35), gridW: 1.5 * u });
    ctx.lineWidth = 5 * u; ctx.strokeStyle = th.border;
    ctx.beginPath(); ctx.rect(x, yy, w, H); ctx.stroke();
    if (ring) { ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.rect(x + cs, yy + cs, w - 2 * cs, H - 2 * cs); ctx.stroke(); }
    ctx.restore();
    const r = ring ? cs : 0;
    return { x, y: yy, w, h: H, cs, ix: x + r, iy: yy + r, iw: w - 2 * r, ih: H - 2 * r };
  }

  // Build something cell by cell: cells turn over in a diagonal sweep and reveal what `draw` paints.
  function cellBuild(ctx, S, th, R, q, draw, o = {}) {
    if (q >= 1) { draw(); return; }
    if (q <= 0) return;
    const u = S.u, cs = o.cs || 60 * u, ni = Math.max(1, Math.ceil(R.w / cs)), nj = Math.max(1, Math.ceil(R.h / cs)), bw = 0.22;
    const f = -bw + q * (1 + 2 * bw), seed = o.seed || 7;
    const path = new Path2D(), list = [];
    for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
      const v = clamp(((i + 0.5) / ni) * 0.62 + ((j + 0.5) / nj) * 0.38 + (hash(i, j, seed) - 0.5) * 0.14);
      const d = (f - v) / bw;
      if (d >= 1) path.rect(R.x + i * cs - 0.5, R.y + j * cs - 0.5, cs + 1, cs + 1);
      else if (d > 0) {
        const e = eo(d);
        list.push({ x: R.x + (i + 0.5) * cs, y: R.y + (j + 0.5) * cs, s: cs * (0.35 + 0.6 * e), ang: (1 - e) * PI + (hash(i, j, seed + 1) < 0.5 ? 0 : PI / 2), g: hash(i, j, seed + 2) < 0.5 ? th.acc : th.plate, a: th.border });
      }
    }
    ctx.save(); ctx.clip(path); draw(); ctx.restore();
    tiles(ctx, list, { lw: 0.24, grid: th.border, gridW: 3 * u });
  }

  // Capsule label on a solid chip with a dark outline.
  function pill(ctx, S, th, s, x, y, size, o = {}) {
    const u = S.u;
    if (o.max) size = fitSize(ctx, S, s, size, o.max - size * 1.1, Math.min(size, 44 * u), { weight: 800 });
    const padX = size * 0.55, h = size * 1.62;
    const w = textW(ctx, S, s, size, { weight: 800 }) + padX * 2;
    const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x, y0 = y - h / 2;
    ctx.save();
    if (o.q != null) { ctx.translate(x, y); ctx.scale(o.q, o.q); ctx.translate(-x, -y); }
    rr(ctx, x0 + 7 * u, y0 + 7 * u, w, h, h / 2); ctx.fillStyle = o.shadowColor || th.border; ctx.fill();
    rr(ctx, x0, y0, w, h, h / 2); ctx.fillStyle = o.fill || th.plate; ctx.fill();
    ctx.lineWidth = 5 * u; ctx.strokeStyle = th.border; ctx.stroke();
    txt(ctx, S, th, s, x0 + w / 2, y + size * 0.04, size, { align: "center", weight: 800, color: o.color || (o.fill && o.fill !== th.plate ? th.onAcc : th.ink) });
    ctx.restore();
    return { x: x0, y: y0, w, h };
  }

  // A single flipping tile on a square badge: the look's logo glyph.
  function glyph(ctx, S, th, cx, cy, s, t, o = {}) {
    const u = S.u, h = s / 2;
    const ph = t / (o.period || 1.7) + (o.phase || 0), k = Math.floor(ph), f = ph - k;
    const ang = (k + eio(clamp(f * 2.2))) * PI / 2;
    ctx.save();
    rr(ctx, cx - h, cy - h, s, s, s * 0.12); ctx.fillStyle = o.fill || th.acc; ctx.fill();
    ctx.save(); rr(ctx, cx - h, cy - h, s, s, s * 0.12); ctx.clip();
    const p = new Path2D(); arcAdd(p, cx, cy, h, ang);
    ctx.lineCap = "butt"; ctx.strokeStyle = o.color || th.onAcc; ctx.lineWidth = s * 0.2; ctx.stroke(p);
    ctx.restore();
    rr(ctx, cx - h, cy - h, s, s, s * 0.12); ctx.lineWidth = 4 * u; ctx.strokeStyle = th.border; ctx.stroke();
    ctx.restore();
  }

  // A pipe: ink outline under a coloured core, with travelling beads when a phase is given.
  function pipe(ctx, S, th, pts, q, t, o = {}) {
    if (q <= 0.001 || pts.length < 2) return;
    const u = S.u;
    const lens = [0]; for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = lens[lens.length - 1], upto = total * clamp(q);
    const at = (d) => { let i = 1; while (i < lens.length - 1 && lens[i] < d) i++; const a = pts[i - 1], b = pts[i], f = clamp((d - lens[i - 1]) / Math.max(1e-6, lens[i] - lens[i - 1])); return [lerp(a[0], b[0], f), lerp(a[1], b[1], f)]; };
    const path = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length && lens[i - 1] < upto; i++) { const e = at(Math.min(lens[i], upto)); ctx.lineTo(e[0], e[1]); } };
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
    path(); ctx.lineWidth = (o.w ?? 9) * u + 9 * u; ctx.strokeStyle = th.border; ctx.stroke();
    path(); ctx.lineWidth = (o.w ?? 9) * u; ctx.strokeStyle = o.color || th.acc; ctx.stroke();
    if (q >= 0.98 && o.beads) {
      for (let k = 0; k < o.beads; k++) {
        const f = (((t * (o.speed ?? 0.55) + k / o.beads) % 1) + 1) % 1;
        const p = at(total * f);
        ctx.beginPath(); ctx.arc(p[0], p[1], ((o.w ?? 9) * 0.78 + 1) * u, 0, TAU); ctx.fillStyle = th.plate; ctx.fill();
        ctx.lineWidth = 3 * u; ctx.strokeStyle = th.border; ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ---- the maze ----------------------------------------------------------------------------------
  const FLIP = 0.9;
  function tileState(ci, cj, l, seed, t) {
    const hr = hash(ci, cj, seed + l * 17 + 5);
    const per = 2.6 + hr * 4, off = hash(ci, cj, seed + l * 19 + 9) * per;
    const o0 = hash(ci, cj, seed + l * 13 + 99) < 0.5 ? 0 : 1;
    const tt = t - off, k = Math.floor(tt / per), fr = tt - k * per;
    return { hr, per, o0, k, fr, fp: clamp(fr / FLIP) };
  }
  // Draw the maze over screen rect (x0..x1, y0..y1); world = screen + (ox, oy). Subdivision is a quad tree
  // on one grid, so every small tile sits exactly inside a big one.
  function drawMaze(ctx, o) {
    const { S, t, B, seed, pal } = o;
    const maxL = o.maxL ?? 3, sub = o.sub || [0.5, 0.5, 0.42];
    const reveal = o.reveal ?? 1, u = S.u, lwK = o.lwK ?? 0.3;
    const ox = o.ox, oy = o.oy;
    const wx0 = o.x0 + ox, wy0 = o.y0 + oy, wx1 = o.x1 + ox, wy1 = o.y1 + oy;
    const discs = [], bands = [], grid = o.grid ? new Path2D() : null;
    const P = (arr, k) => arr[k] || (arr[k] = new Path2D());
    const split = (ci, cj, l, cx, cy) => l < maxL && hash(ci, cj, seed + l * 7 + 1000) < Math.min(0.92, sub[Math.min(l, sub.length - 1)] * (0.25 + 1.5 * vnoise(cx / (B * 4.5), cy / (B * 4.5), seed + 3)));
    const leaf = (wx, wy, s, ci, cj, l) => {
      if (reveal < 1 && hash(ci, cj, seed + 4242 + l) > reveal) return;
      const st = tileState(ci, cj, l, seed, t);
      let cls = 0;
      if (o.wave) {
        const sv = ((((wx + wy * 0.6) / (B * 10) - t * 0.07) % 1) + 1) % 1;
        if (sv < 0.05) cls = 2; else if (((sv + 0.5) % 1) < 0.03) cls = 1; else cls = st.hr < 0.11 ? 1 : 0;
        if (st.fp > 0 && st.fp < 1 && st.hr > 0.5) cls = 3;
      } else cls = st.hr < 0.3 ? 1 : 0;
      const th0 = (((st.o0 + st.k) % 2 + 2) % 2 + eio(st.fp)) * PI / 2;
      const h = s / 2, cs = Math.cos(th0), sn = Math.sin(th0);
      const cx = wx + h - ox, cy = wy + h - oy;
      if (grid) grid.rect(wx - ox, wy - oy, s, s);
      const c1x = cx + h * (sn - cs), c1y = cy - h * (sn + cs), c2x = cx + h * (cs - sn), c2y = cy + h * (sn + cs);
      const d = P(discs, cls), b = P(bands, cls * 4 + l);
      d.moveTo(c1x, c1y); d.arc(c1x, c1y, h, th0, th0 + PI / 2); d.closePath();
      d.moveTo(c2x, c2y); d.arc(c2x, c2y, h, PI + th0, PI * 1.5 + th0); d.closePath();
      b.moveTo(c1x + h * cs, c1y + h * sn); b.arc(c1x, c1y, h, th0, th0 + PI / 2);
      b.moveTo(c2x + h * Math.cos(PI + th0), c2y + h * Math.sin(PI + th0)); b.arc(c2x, c2y, h, PI + th0, PI * 1.5 + th0);
    };
    const visit = (wx, wy, s, ci, cj, l) => {
      if (wx > wx1 || wy > wy1 || wx + s < wx0 || wy + s < wy0) return;
      if (split(ci, cj, l, wx + s / 2, wy + s / 2)) {
        const h = s / 2;
        visit(wx, wy, h, ci * 2, cj * 2, l + 1); visit(wx + h, wy, h, ci * 2 + 1, cj * 2, l + 1);
        visit(wx, wy + h, h, ci * 2, cj * 2 + 1, l + 1); visit(wx + h, wy + h, h, ci * 2 + 1, cj * 2 + 1, l + 1);
        return;
      }
      leaf(wx, wy, s, ci, cj, l);
    };
    const i0 = Math.floor(wx0 / B), i1 = Math.floor(wx1 / B), j0 = Math.floor(wy0 / B), j1 = Math.floor(wy1 / B);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) visit(i * B, j * B, B, i, j, 0);
    ctx.save();
    ctx.lineCap = "butt"; ctx.lineJoin = "round";
    for (let c = 0; c < 4; c++) if (discs[c]) { ctx.fillStyle = pal.disc[c]; ctx.fill(discs[c]); }
    const lw = (l) => (B / Math.pow(2, l)) * lwK;
    for (let l = 0; l <= maxL; l++) for (let c = 0; c < 4; c++) { const p = bands[c * 4 + l]; if (!p) continue; ctx.lineWidth = lw(l); ctx.strokeStyle = pal.band[c]; ctx.stroke(p); }
    if (grid) { ctx.lineWidth = o.gridW || 1.5 * u; ctx.strokeStyle = o.grid; ctx.stroke(grid); }
    // Closed loops: four neighbouring big tiles that happen to circle one corner light up as a soft disc.
    if (o.rings) {
      const stable = (ci, cj) => {
        if (split(ci, cj, 0, (ci + 0.5) * B, (cj + 0.5) * B)) return null;
        const st = tileState(ci, cj, 0, seed, t);
        if (st.fr < FLIP) return null;
        return { par: (((st.o0 + st.k + 1) % 2) + 2) % 2, a: clamp((st.fr - FLIP) / 0.5) * clamp((st.per - st.fr) / 0.4) };
      };
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const a = stable(i, j); if (!a || a.par !== 0) continue;
        const b = stable(i + 1, j); if (!b || b.par !== 1) continue;
        const c = stable(i, j + 1); if (!c || c.par !== 1) continue;
        const d = stable(i + 1, j + 1); if (!d || d.par !== 0) continue;
        const al = Math.min(a.a, b.a, c.a, d.a), px = (i + 1) * B - ox, py = (j + 1) * B - oy;
        ctx.beginPath(); ctx.arc(px, py, B * 0.5 - lw(0) / 2, 0, TAU); ctx.fillStyle = rgba(o.ringColor, al * 0.55); ctx.fill();
      }
    }
    ctx.restore();
  }
  function fillMaze(ctx, S, th, x, y, w, h, o) {
    ctx.save(); rr(ctx, x, y, w, h, o.r || 0); ctx.clip();
    ctx.fillStyle = o.ground; ctx.fillRect(x, y, w, h);
    drawMaze(ctx, { S, t: o.t, B: o.B, maxL: o.maxL ?? 1, seed: o.seed || 1, sub: o.sub || [0.55, 0.4, 0.3], pal: o.pal, wave: false, lwK: o.lwK ?? 0.28, grid: o.grid, gridW: o.gridW, x0: x, y0: y, x1: x + w, y1: y + h, ox: o.ox ?? -x, oy: o.oy ?? -y, reveal: o.reveal ?? 1 });
    ctx.restore();
  }

  // ---- camera, transitions -------------------------------------------------------------------------
  function camera(S, info) {
    const u = S.u, t = info.t, idx = Math.max(0, info.index), D = 300 * u;
    const kick = idx > 0 ? (idx - 1 + eio(info.local / 1.0)) * D : 0;
    return { x: t * 15 * u + kick * 0.9 + 40 * u * Math.sin(t * 0.23), y: t * 6 * u + kick * 0.45 + 30 * u * Math.cos(t * 0.19) };
  }
  const BW = 0.1;
  const waveF = (g) => -BW + eio(g) * (1 + 2 * BW);
  const cellSize = (S) => 104 * S.u;
  function cellW(S, i, j) {
    const cs = cellSize(S), a = S.tall ? 0.28 : 0.66;
    return ((i + 0.5) * cs / S.W) * a + ((j + 0.5) * cs / S.H) * (1 - a) + (hash(i, j, 5) - 0.5) * 0.07;
  }
  function clipCells(ctx, S, f, mode) {
    const cs = cellSize(S), path = new Path2D();
    const ni = Math.ceil(S.W / cs), nj = Math.ceil(S.H / cs);
    for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
      const w = cellW(S, i, j);
      if (mode === "new" ? w <= f - BW : w >= f + BW) path.rect(i * cs - 0.5, j * cs - 0.5, cs + 1, cs + 1);
    }
    ctx.clip(path);
  }
  // The wave front: tiles turning over between the outgoing and incoming picture (optionally only within R).
  function waveGap(ctx, S, th, f, R) {
    const cs = cellSize(S), ni = Math.ceil(S.W / cs), nj = Math.ceil(S.H / cs), list = [];
    for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
      if (R && ((i + 1) * cs < R.x || i * cs > R.x + R.w || (j + 1) * cs < R.y || j * cs > R.y + R.h)) continue;
      const w = cellW(S, i, j), d = (w - f) / BW;
      if (Math.abs(d) >= 1) continue;
      const k = 1 - Math.abs(d);
      list.push({ x: (i + 0.5) * cs, y: (j + 0.5) * cs, s: cs * (0.55 + 0.45 * k), ang: (1 - k) * PI / 2 * (d > 0 ? 1 : -1) + PI / 2 * (hash(i, j, 8) < 0.5 ? 0 : 1), g: hash(i, j, 3) < 0.5 ? th.acc : th.plate, a: th.border });
    }
    if (R) { ctx.save(); ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip(); }
    tiles(ctx, list, { lw: 0.2, grid: th.border, gridW: 3 * S.u });
    if (R) ctx.restore();
  }
  // Exit of a plate within its own scene: cells turn over across R during the scene's last `change` seconds.
  function plateExit(ctx, S, th, info, R) {
    const g = seg(info.local, info.hold - info.change, info.hold);
    if (g <= 0) return null;
    const f = waveF(g);
    clipCells(ctx, S, f, "old");
    return () => waveGap(ctx, S, th, f, R);
  }

  // ---- measuring DOM headlines ---------------------------------------------------------------------
  const MEAS = {};
  function measure(S, id, withKicker) {
    const el = document.getElementById(id);
    if (!el) return null;
    const sc = el.parentElement;
    const size = parseFloat(el.style.fontSize) || 80 * S.u;
    const key = id + "|" + el.textContent + "|" + size + "|" + S.W + "|" + sc.style.top;
    if (MEAS[key]) return MEAS[key];
    const c = buf("measure", 4, 4).getContext("2d");
    c.font = font(S, size, S.look.displayWeight);
    try { c.letterSpacing = `${-0.01 * size}px`; } catch (err) { /* older canvas */ }
    const maxW = (el.offsetWidth || S.W * 0.8) * 1.015;
    const nLines = Math.max(1, Math.round(el.offsetHeight / (size * 1.04)));
    const words = String(el.textContent).split(/\s+/).filter(Boolean);
    let lines = []; let line = "";
    if (nLines === 1) lines = [String(el.textContent)];
    else {
      for (const w of words) { const next = line ? line + " " + w : w; if (line && c.measureText(next).width > maxW) { lines.push(line); line = w; } else line = next; }
      if (line) lines.push(line);
    }
    let w = Math.min(maxW, Math.max(1, ...lines.map((l) => c.measureText(l).width)) * 1.03);
    try { c.letterSpacing = "0px"; } catch (err) { /* older canvas */ }
    const centered = sc.classList.contains("statement");
    let y = sc.offsetTop + el.offsetTop, h = el.offsetHeight;
    const elY = y, lineH = el.offsetHeight / Math.max(1, lines.length);
    let kick = null;
    if (withKicker) {
      const k = document.getElementById("kicker");
      if (k && k.textContent) {
        const ks = parseFloat(k.style.fontSize) || 30 * S.u;
        c.font = font(S, ks, 700, "body");
        const kw = c.measureText(k.textContent.toUpperCase()).width + k.textContent.length * ks * 0.14 + ks * 2.4;
        w = Math.max(w, kw);
        const ky = sc.offsetTop + k.offsetTop;
        kick = { text: k.textContent.toUpperCase(), size: ks, y: ky + k.offsetHeight / 2 };
        h = (y + h) - ky; y = ky;
      }
    }
    const x = centered ? (S.W - w) / 2 : sc.offsetLeft + el.offsetLeft;
    return (MEAS[key] = { x, y, w, h, size, text: el.textContent, lines, lineH, elY, centered, kick, lx: sc.offsetLeft + el.offsetLeft });
  }
  function headingPlate(ctx, S, th, scene, info, first) {
    const m = measure(S, scene + "-title", false);
    if (!m) return;
    const u = S.u, t = info.t;
    const pad = 30 * u, gl = 64 * u;
    const px = Math.max(10 * u, m.x - pad);
    const multi = m.h > m.size * 1.6;
    let pw = m.x - pad + m.w + pad * 2 + (multi ? 0 : gl + 24 * u) - px, withGlyph = !multi;
    if (px + pw > S.W - 40 * u) { pw = m.w + pad * 2 + 6 * u; withGlyph = false; if (px + pw > S.W - 34 * u) pw = S.W - 34 * u - px; }
    const py = m.y - 12 * u, ph = m.h + 28 * u;
    const R = { x: px - 4 * u, y: py - 4 * u, w: pw + 30 * u, h: ph + 30 * u };
    // Arrives cell by cell in step with the headline's own wipe; leaves the same way.
    const qh = 1 - Math.pow(1 - clamp(info.local / 0.62), 3);
    ctx.save();
    // The last scene keeps its headline plate to the end (its words never leave).
    const gap = LAST ? null : plateExit(ctx, S, th, info, R);
    cellBuild(ctx, S, th, R, qh, () => {
      tilePlate(ctx, S, th, px, py, pw, ph, { t, seed: scene.length * 3, ring: false, faint: false, snap: false, shadow: 16, cs: 999 * u });
      if (withGlyph) glyph(ctx, S, th, px + pw - 20 * u - gl / 2, py + ph / 2, gl, t, { phase: scene.length * 0.37 });
    }, { cs: Math.max(40 * u, R.h / 2), seed: 31 });
    ctx.restore();
    if (gap) gap();
  }

  // ---- title / closing -------------------------------------------------------------------------------
  function pickWord(text) {
    const words = String(text || "").split(/\s+/).map((w) => w.replace(/[^A-Za-z0-9]/g, "")).filter(Boolean);
    let best = words[0] || "";
    for (const w of words) if (w.length > best.length) best = w;
    return best.toUpperCase();
  }
  function statementPlateRect(S, m) {
    const u = S.u, padX = 54 * u, padY = 40 * u;
    return { x: m.x - padX, y: m.y - padY, w: m.w + padX * 2, h: m.h + padY * 2 };
  }
  // The headline's longest word, spelled big in small tiles with a solid extruded shadow. It sits in the
  // free band below the plate when there is room, away from where the next headline arrives.
  function statement(ctx, S, th, id, local, t) {
    const m = measure(S, id, id === "title");
    if (!m) return;
    const { W, H } = S, u = S.u;
    const P = statementPlateRect(S, m);
    const above = P.y - 50 * u, below = H - (P.y + P.h) - 60 * u;
    const useBelow = below >= 150 * u || below >= above;
    const bandH = useBelow ? below : above, top = useBelow ? P.y + P.h + 44 * u : 30 * u;
    const word = pickWord(m.text);
    const wc = buf("wordmeasure", 4, 4).getContext("2d");
    let fs = 520 * u;
    const maxWidth = W * 0.9, maxCap = Math.max(110 * u, bandH * 0.74);
    wc.font = font(S, fs, 900);
    while (fs > 80 * u && (wc.measureText(word).width > maxWidth || fs * 0.72 > maxCap)) { fs *= 0.95; wc.font = font(S, fs, 900); }
    const ww = wc.measureText(word).width, cap = fs * 0.72;
    const cx = W / 2, cy = bandH > 110 * u ? top + bandH / 2 : P.y + P.h / 2;
    const bw = Math.ceil(ww + 60 * u), bh = Math.ceil(cap * 1.5 + 40 * u);
    const reveal = 0.25 + 0.75 * eo(seg(local, 0.0, 1.3));
    const bx = cx - bw / 2, by = cy - bh / 2;
    const draw = (c2, ox, oy, style) => {
      c2.font = font(S, fs, 900); c2.textAlign = "center"; c2.textBaseline = "alphabetic";
      c2.lineJoin = "round";
      if (style === "fill") c2.fillText(word, ox, oy);
      else c2.strokeText(word, ox, oy);
    };
    const baseY = cy + cap / 2, ext = Math.max(10, 16 * u);
    // Solid extrusion: the shadow colour stacked diagonally, closed with an ink outline.
    ctx.save();
    ctx.fillStyle = th.border; ctx.lineWidth = 8 * u; ctx.strokeStyle = th.border;
    draw(ctx, cx + ext + 3 * u, baseY + ext + 3 * u, "fill"); draw(ctx, cx + ext + 3 * u, baseY + ext + 3 * u, "stroke");
    ctx.fillStyle = th.alt;
    for (let k = ext; k >= 1; k -= 2 * u) draw(ctx, cx + k, baseY + k, "fill");
    ctx.restore();
    // Letter faces: a fine, regular grid of tiles (half the size of the world's smallest), cell by cell.
    const b = buf("word", bw, bh), c2 = b.getContext("2d");
    c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(0, 0, bw, bh);
    c2.fillStyle = mix(th.acc, th.border, 0.55); c2.fillRect(0, 0, bw, bh);
    const B = Math.max(22 * u, Math.min(38 * u, fs * 0.1));
    const c2b = buf("wordtiles", bw, bh).getContext("2d");
    c2b.setTransform(1, 0, 0, 1, 0, 0); c2b.clearRect(0, 0, bw, bh);
    c2b.fillStyle = th.acc;
    const cols = Math.ceil(bw / B) + 1, rows = Math.ceil(bh / B) + 1, list = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const v = hash(i, j, 77);
      if (v > reveal) continue;
      const e = clamp((reveal - v) / 0.12);
      const sweep = wAng(i, j, 81, t, (i + j * 0.5) * 0.045, 2.4);
      list.push({ x: (i + 0.5) * B, y: (j + 0.5) * B, s: B * (0.4 + 0.6 * eo(e)), ang: sweep.ang + (1 - eo(e)) * PI / 2, g: sweep.flip ? th.plate : th.acc, a: th.border });
    }
    tiles(c2b, list, { lw: 0.24, grid: rgba(th.border, 0.4), gridW: 1.2 * u });
    c2.drawImage(c2b.canvas, 0, 0);
    const mb = buf("wordmask", bw, bh), mc = mb.getContext("2d");
    mc.setTransform(1, 0, 0, 1, 0, 0); mc.clearRect(0, 0, bw, bh);
    mc.fillStyle = "#000";
    draw(mc, bw / 2, baseY - by, "fill");
    c2.globalCompositeOperation = "destination-in";
    c2.drawImage(mb, 0, 0);
    c2.globalCompositeOperation = "source-over";
    ctx.drawImage(b, bx, by);
    ctx.save();
    ctx.lineWidth = 7 * u; ctx.strokeStyle = th.border; ctx.lineJoin = "round"; draw(ctx, cx, baseY, "stroke");
    ctx.restore();
  }
  // The title's own words are drawn on the plate (the DOM copy is transparent), so the card and its words
  // arrive and leave together, tile by tile, with the scene change.
  function titleWords(ctx, S, th, m) {
    const u = S.u;
    ctx.save();
    ctx.fillStyle = th.ink; ctx.textBaseline = "middle";
    ctx.font = font(S, m.size, S.look.displayWeight);
    try { ctx.letterSpacing = `${-0.01 * m.size}px`; } catch (err) { /* older canvas */ }
    ctx.textAlign = m.centered ? "center" : "left";
    m.lines.forEach((line, k) => ctx.fillText(line, m.centered ? S.W / 2 : m.lx, m.elY + m.lineH * (k + 0.53)));
    if (m.kick) {
      const ks = m.kick.size;
      ctx.font = font(S, ks, 700, "body");
      try { ctx.letterSpacing = `${0.16 * ks}px`; } catch (err) { /* older canvas */ }
      const tw = ctx.measureText(m.kick.text).width, lw = ks * 0.7, total = lw + ks * 0.7 + tw;
      const x0 = m.centered ? S.W / 2 - total / 2 : m.lx;
      ctx.textAlign = "left"; ctx.fillStyle = th.ink; ctx.fillText(m.kick.text, x0 + lw + ks * 0.7, m.kick.y);
      ctx.beginPath(); ctx.moveTo(x0, m.kick.y - lw / 2); ctx.lineTo(x0 + lw * 0.5, m.kick.y - lw / 2);
      ctx.arc(x0 + lw * 0.5, m.kick.y, lw / 2, -PI / 2, 0); ctx.lineTo(x0 + lw, m.kick.y + lw / 2); ctx.lineTo(x0 + lw * 0.5, m.kick.y + lw / 2);
      ctx.arc(x0 + lw * 0.5, m.kick.y, lw / 2, PI / 2, PI); ctx.closePath();
      ctx.fillStyle = th.acc; ctx.fill(); ctx.lineWidth = Math.max(2, ks * 0.12); ctx.strokeStyle = th.border; ctx.stroke();
    }
    ctx.restore();
  }
  function statementPlate(ctx, S, th, id, info, o = {}) {
    const m = measure(S, id, id === "title");
    if (!m) return;
    const u = S.u, P = statementPlateRect(S, m), t = info.t;
    const R = { x: P.x - 10 * u, y: P.y - 10 * u, w: P.w + 50 * u, h: P.h + 50 * u };
    ctx.save();
    if (id === "closing" && info.index > 0 && info.local < info.change) clipCells(ctx, S, waveF(info.local / Math.max(0.01, info.change)), "new");
    const build = o.build ?? (id === "title" && info.index === 0 ? 0.45 + 0.55 * seg(info.local, 0, 0.5) : 1);
    cellBuild(ctx, S, th, R, build, () => {
      tilePlate(ctx, S, th, P.x, P.y, P.w, P.h, { t, seed: 3, cs: 28 * u, shadow: 18 });
      if (id === "title") titleWords(ctx, S, th, m);
    }, { cs: 56 * u, seed: 12 });
    ctx.restore();
  }
  // A frieze of big bright tiles over the free band above a statement: it grows up out of the plate,
  // a flip wave keeps running along it, and a highlight sweeps through its pipes.
  function frieze(ctx, S, th, id, local, t) {
    const m = measure(S, id, id === "title");
    if (!m) return;
    const { W, u } = S, P = statementPlateRect(S, m);
    const top = 26 * u, bot = P.y - 40 * u, band = bot - top;
    if (band < 90 * u) return;
    const rows = Math.max(1, Math.min(4, Math.round(band / (200 * u)))), s = Math.min(band / rows, 230 * u);
    const cols = Math.ceil(W / s) + 1, x0 = (W - cols * s) / 2, y0 = bot - rows * s;
    const grow = eo(seg(local, 0, 1.1)), list = [], shadow = new Path2D();
    const gr = [th.acc, th.plate, th.alt, th.acc, th.pale, th.band];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      // Rows nearest the plate first, from the middle outwards; ragged at the top edge.
      const dc = Math.abs(i + 0.5 - cols / 2) / (cols / 2), dr = (rows - 1 - j) / Math.max(1, rows);
      if (j === 0 && rows > 1 && hash(i, j, 61) < 0.28) continue;
      const v = 0.08 + dc * 0.45 + dr * 0.4 + hash(i, j, 62) * 0.08;
      const e = clamp((grow * 1.1 - v) / 0.18);
      if (e <= 0) continue;
      const wv = wAng(i, j, 63, t, i * 0.055 + j * 0.12, 2.2);
      const hot = ((((i * 0.07 - t * 0.45) % 1) + 1) % 1) < 0.12;
      const cx = x0 + (i + 0.5) * s, cy = y0 + (j + 0.5) * s, ss = s * (0.4 + 0.6 * eo(e));
      list.push({ x: cx, y: cy, s: ss, ang: wv.ang + (1 - eo(e)) * PI / 2, g: wv.flip || hot ? th.plate : gr[Math.floor(hash(i, j, 64) * gr.length)], a: hot ? th.acc : th.border });
      shadow.rect(cx - ss / 2 + 12 * u, cy - ss / 2 + 12 * u, ss, ss);
    }
    ctx.save(); ctx.fillStyle = th.border; ctx.fill(shadow); ctx.restore();
    tiles(ctx, list, { lw: 0.26, grid: th.border, gridW: 4 * u });
  }
  function closingRings(ctx, S, th, local, t, hold) {
    const { W, H, u } = S, fade = 1 - seg(local, hold - 1.0, hold - 0.55);
    ctx.save();
    for (let k = 0; k < 4; k++) {
      const f = (((t * 0.28 + k / 4) % 1) + 1) % 1;
      ctx.beginPath(); ctx.arc(W / 2, H / 2, (120 + f * Math.max(W, H) * 0.7) * u, 0, TAU);
      ctx.lineWidth = (12 - f * 9) * u; ctx.strokeStyle = rgba(th.acc, (1 - f) * 0.45 * eo(local / 0.6) * fade); ctx.stroke();
    }
    ctx.restore();
  }

  let LAST = false, RAIL = null;
  // ---- stage: the world under every scene ------------------------------------------------------------
  function stage(ctx, S, info) {
    const th = theme(S), { W, H, u } = S;
    const t = info.t;
    LAST = !info.next;
    const ctl = (window.__dreamcut && window.__dreamcut.controls) || {};
    if (S.paint) {
      const cam = camera(S, info);
      const pal = worldPal(th);
      ctx.save();
      ctx.fillStyle = th.ground; ctx.fillRect(0, 0, W, H);
      drawMaze(ctx, { S, t, B: 192 * u, maxL: 2, seed: 11, sub: [0.5, 0.45], pal, wave: true, rings: true, ringColor: mix(th.ground, th.acc, 0.3), lwK: 0.22, grid: rgba(th.pale, th.dark ? 0.11 : 0.16), gridW: 2 * u, x0: 0, y0: 0, x1: W, y1: H, ox: cam.x, oy: cam.y });
      ctx.restore();
      // A calm pool behind the content area, and a vignette at the edges.
      const cy = S.tall ? H * 0.6 : H * 0.6;
      const pool = ctx.createRadialGradient(W / 2, cy, 0, W / 2, cy, Math.max(W, H) * 0.5);
      pool.addColorStop(0, rgba(th.ground, 0.24)); pool.addColorStop(0.7, rgba(th.ground, 0.1)); pool.addColorStop(1, rgba(th.ground, 0));
      ctx.fillStyle = pool; ctx.fillRect(0, 0, W, H);
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.78);
      v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, th.dark ? "rgba(0,0,0,0.32)" : "rgba(40,20,0,0.16)");
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
      if (info.index > 0 && info.local < info.change) waveGap(ctx, S, th, waveF(info.local / Math.max(0.01, info.change)));
    }
    // The title and closing statements are drawn here (they have no drawer of their own).
    if (info.scene === "title" || info.scene === "closing") {
      ctx.save();
      if (info.scene === "closing" && info.index > 0 && info.local < info.change) clipCells(ctx, S, waveF(info.local / Math.max(0.01, info.change)), "new");
      if (info.scene === "closing") closingRings(ctx, S, th, info.local, t, info.hold);
      frieze(ctx, S, th, info.scene, info.local, t);
      statement(ctx, S, th, info.scene, info.local, t);
      ctx.restore();
      statementPlate(ctx, S, th, info.scene, info);
    } else if (info.index === 1 && Number(ctl.title_hold ?? 2.4) > 0 && info.local < info.change) {
      // The whole title card (frieze, plate, words, spelled word) stays until the wave turns it over.
      const th2 = Number(ctl.title_hold ?? 2.4);
      ctx.save();
      clipCells(ctx, S, waveF(info.local / Math.max(0.01, info.change)), "old");
      frieze(ctx, S, th, "title", th2 + info.local, t);
      statement(ctx, S, th, "title", th2 + info.local, t);
      statementPlate(ctx, S, th, "title", { t, local: th2 + info.local, index: 0, change: info.change }, { build: 1 });
      ctx.restore();
    }
  }

  // ---- scenes ----------------------------------------------------------------------------------------
  function wrap(id, fn) {
    return (ctx, S, box, p, d, info) => {
      const th = theme(S), leaving = info.exit !== undefined;
      const first = info.t - info.local < 0.01;
      // A scene that arrives behind the tile wave is already standing when the wave uncovers it (its
      // numbers and details still play in); the opening scene builds from a little further back.
      const pp = leaving ? 1 : !first ? 0.42 + 0.58 * p : id === "chart" ? 0.1 + 0.9 * p : 0.3 + 0.7 * p;
      ctx.save();
      if (leaving) clipCells(ctx, S, waveF(info.exit), "old");
      else if (!first && info.local < info.change) clipCells(ctx, S, waveF(info.local / Math.max(0.01, info.change)), "new");
      fn(ctx, S, th, { x: box.x, y: box.y, w: box.w, h: box.h }, pp, d, info.t, info.local, info);
      ctx.restore();
      if (!leaving) headingPlate(ctx, S, th, id, info, first);
    };
  }

  function chartScene(ctx, S, th, A, pp, d, t) {
    const u = S.u, n = d.values.length, max = Math.max(...d.values, 1);
    const R = tilePlate(ctx, S, th, A.x, A.y, A.w, A.h, { cs: 40 * u, t, seed: 21 });
    const padX = 30 * u, baseY = R.iy + R.ih - 92 * u, topY = R.iy + 150 * u;
    // Ruled lines slide slowly sideways.
    ctx.save(); ctx.beginPath(); ctx.rect(R.ix, R.iy, R.iw, R.ih); ctx.clip();
    ctx.setLineDash([14 * u, 16 * u]); ctx.lineDashOffset = -t * 24 * u; ctx.lineWidth = 3 * u; ctx.strokeStyle = rgba(th.border, 0.25);
    for (let k = 0; k < 4; k++) { const y = lerp(topY, baseY, k / 4); ctx.beginPath(); ctx.moveTo(R.ix + padX, y); ctx.lineTo(R.ix + R.iw - padX, y); ctx.stroke(); }
    ctx.setLineDash([]);
    ctx.restore();
    const slot = (R.iw - padX * 2) / n, cb = Math.min(slot * 0.6, 270 * u) / 3, bw = cb * 3, hmax = baseY - topY;
    ctx.lineWidth = 6 * u; ctx.strokeStyle = th.border; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(R.ix + padX * 0.6, baseY); ctx.lineTo(R.ix + padX * 0.6 + (R.iw - padX * 1.2) * eo(seg(pp, 0.05, 0.4)), baseY); ctx.stroke();
    d.values.forEach((v, i) => {
      const q = eo(seg(pp, 0.16 + i * 0.1, 0.52 + i * 0.1));
      const hot = i === d.highlight;
      const x = R.ix + padX + slot * i + (slot - bw) / 2, h = Math.max(0, hmax * (v / max) * q), y = baseY - h;
      if (h > 2) {
        // The bar: a stack of tiles three wide. Rows turn into place as they rise; once up, a flip wave
        // climbs every bar in turn and the hot bar's crest flashes.
        const list = [], rows = Math.ceil(h / cb);
        for (let r = 0; r < rows; r++) for (let c = 0; c < 3; c++) {
          const e = clamp((h - r * cb) / (cb * 1.4));
          const wv = wAng(c, r, 31 + i * 17, t, r * 0.11 + c * 0.03 + i * 0.25, 2.1);
          const g = hot ? (wv.flip ? th.plate : th.acc) : (wv.flip ? th.pale : th.band);
          list.push({ x: x + (c + 0.5) * cb, y: baseY - (r + 0.5) * cb, s: cb, ang: wv.ang + (1 - eo(e)) * PI / 2, g, a: th.border });
        }
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, bw, h); ctx.clip();
        tiles(ctx, list, { lw: 0.24, grid: rgba(th.border, 0.45), gridW: 2 * u });
        ctx.restore();
        ctx.beginPath(); ctx.rect(x, y, bw, h); ctx.lineWidth = 5 * u; ctx.strokeStyle = th.border; ctx.stroke();
      }
      if (q > 0.12) {
        const size = (hot ? 118 : 96) * u;
        const label = nf(v * q, v, d.suffix);
        const fz = fitSize(ctx, S, label, size, slot * 0.98, 66 * u, { weight: 900 });
        const py = y - fz * 0.62 - 14 * u - (hot ? Math.abs(Math.sin(t * 3.2)) * 10 * u : 0);
        pill(ctx, S, th, label, x + bw / 2, py, fz, { align: "center", fill: hot ? th.acc : th.plate });
        pill(ctx, S, th, d.labels[i] || "", x + bw / 2, baseY + 48 * u, 44 * u, { align: "center", max: slot - 8 * u, fill: hot ? th.acc : th.plate, shadowColor: th.border });
      }
      if (hot && q > 0.9) for (let k = 0; k < 4; k++) {
        const f = (((t * 0.5 + k / 4) % 1) + 1) % 1;
        glyph(ctx, S, th, x + bw / 2 + (k - 1.5) * bw * 0.32 + Math.sin(t * 2 + k) * 10 * u, y - 160 * u - f * 70 * u, (30 - f * 12) * u, t, { phase: k * 0.3 });
      }
    });
  }

  // A tile-built apply button wired to the card: a check redraws itself and a pointer taps it on a beat.
  function approveButton(ctx, S, th, x, y, w, h, q, t, from) {
    if (q <= 0.01) return;
    const u = S.u;
    pipe(ctx, S, th, [from, [from[0] + (x - from[0]) * 0.5, from[1]], [from[0] + (x - from[0]) * 0.5, y + h / 2], [x - 16 * u, y + h / 2]], q, t, { w: 8, beads: 2, speed: 0.5 });
    if (q < 0.6) return;
    const per = 2.4, ph = ((t % per) + per) % per, press = ph > 1.5 && ph < 1.8 ? Math.sin(((ph - 1.5) / 0.3) * PI) : 0;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2); const sc = back(seg(q, 0.6, 1)) * (1 - 0.04 * press); ctx.scale(sc, sc); ctx.translate(-(x + w / 2), -(y + h / 2));
    const R = tilePlate(ctx, S, th, x, y, w, h, { cs: Math.min(34 * u, h / 4.2), t, seed: 44, fill: press > 0.2 ? th.plate : th.acc, rimGround: th.plate, shadowColor: th.band, shadow: 16 * (1 - press * 0.7) });
    // The check: draws, holds, redraws.
    const cx = R.ix + R.iw * 0.5, cy = R.iy + R.ih * 0.52, es = Math.min(R.ih * 0.42, R.iw * 0.2);
    const f = (t * 0.55) % 1.6, c1 = eo(seg(f, 0, 0.35)), c2 = eo(seg(f, 0.25, 0.7));
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(cx - es, cy); const a = [cx - es * 0.3, cy + es * 0.65], b = [cx + es * 1.05, cy - es * 0.75];
    ctx.lineTo(lerp(cx - es, a[0], c1), lerp(cy, a[1], c1)); if (c1 > 0.999) ctx.lineTo(lerp(a[0], b[0], c2), lerp(a[1], b[1], c2));
    ctx.lineWidth = Math.max(16 * u, es * 0.36); ctx.strokeStyle = th.border; ctx.stroke();
    ctx.restore();
    // Pointer: an arrow that comes in, taps and backs off.
    const px = x + w * 0.78 + Math.sin(t * 1.3) * 10 * u, py = y + h * 0.62 + (press ? -6 * u : 18 * u * (1 - seg(ph, 1.0, 1.5)) + 18 * u * seg(ph, 1.8, 2.4));
    const ar = 54 * u;
    ctx.save(); ctx.translate(px, py); ctx.rotate(-0.35);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, ar); ctx.lineTo(ar * 0.28, ar * 0.76); ctx.lineTo(ar * 0.48, ar * 1.12); ctx.lineTo(ar * 0.62, ar * 1.04); ctx.lineTo(ar * 0.44, ar * 0.7); ctx.lineTo(ar * 0.78, ar * 0.7); ctx.closePath();
    ctx.fillStyle = th.plate; ctx.fill(); ctx.lineWidth = 5 * u; ctx.strokeStyle = th.border; ctx.stroke();
    ctx.restore();
    if (press > 0) for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(px, py, (20 + press * 40 + k * 14) * u, 0, TAU); ctx.lineWidth = 4 * u; ctx.strokeStyle = rgba(th.border, press * 0.6); ctx.stroke(); }
  }

  function objectScene(ctx, S, th, A, pp, d, t) {
    const u = S.u, phone = d.kind === "phone", tall = S.tall;
    // Wide laptops use the full height under the headline, not only the content box.
    const yTop = S.H * 0.235, yBot = S.H * 0.955;
    const w = phone ? Math.min(A.w * 0.3, A.h * 0.5, tall ? A.w * 0.5 : 9999) : Math.min(A.w * (tall ? 0.94 : 0.56), tall ? A.h * 0.62 : (yBot - yTop) / (0.62 * 1.1));
    const h = phone ? w * 1.9 : w * 0.62;
    const x = tall ? A.x + (A.w - w) / 2 : A.x + 24 * u;
    const y = tall ? A.y + 20 * u : phone ? A.y + (A.h - h) / 2 : yTop + (yBot - yTop - h * 1.08) / 2;
    const bezel = (phone ? 22 : 30) * u;
    let R = null;
    const drawDevice = () => {
      R = tilePlate(ctx, S, th, x, y, w, h, { cs: bezel, t, seed: 41, shadow: 18 });
      const sx = R.ix, sy = R.iy, sw = R.iw, sh = R.ih;
      ctx.save(); ctx.beginPath(); ctx.rect(sx, sy, sw, sh); ctx.fillStyle = th.ground; ctx.fill(); ctx.clip();
      // Preview window: a maze sweeping past, with a play disc.
      const pv = { x: sx + sw * 0.06, y: sy + sh * 0.07, w: sw * 0.88, h: sh * 0.47 };
      fillMaze(ctx, S, th, pv.x, pv.y, pv.w, pv.h, { ground: th.acc, B: pv.h / 2.4, maxL: 2, seed: 5, t, pal: miniPal(rgba(th.plate, 0.88), th.border, rgba(th.alt, 0.9)), ox: -t * 40 * u, oy: 0, lwK: 0.24 });
      ctx.beginPath(); ctx.rect(pv.x, pv.y, pv.w, pv.h); ctx.lineWidth = 4 * u; ctx.strokeStyle = th.plate; ctx.stroke();
      const pr = Math.min(pv.h * 0.2, 54 * u), pcx = pv.x + pv.w / 2, pcy = pv.y + pv.h / 2;
      glyph(ctx, S, th, pcx, pcy, pr * 2 * (1 + 0.05 * Math.sin(t * 3)), t, { fill: th.plate, color: th.border, period: 1.2 });
      // Timeline tracks of clips, each clip a row of tiles; a playhead scans across them.
      const tracks = 3, th0 = sh * 0.1, ty0 = sy + sh * 0.62;
      const clipSets = [[[0.06, 0.32], [0.42, 0.2], [0.66, 0.28]], [[0.06, 0.18], [0.28, 0.36], [0.68, 0.26]], [[0.1, 0.5], [0.64, 0.3]]];
      const kcol = [th.band, th.alt, th.acc];
      for (let r = 0; r < tracks; r++) clipSets[r].forEach(([cx, cw], i) => {
        const q = eo(seg(pp, 0.25 + r * 0.08 + i * 0.07, 0.6 + r * 0.08 + i * 0.07));
        if (q <= 0) return;
        const cxp = sx + sw * cx, cyp = ty0 + r * (th0 + sh * 0.035), cwp = sw * cw * q;
        const list = [], nT = Math.ceil(cwp / th0);
        for (let c = 0; c < nT; c++) { const wv = wAng(c, r, 90 + r * 13 + i, t, c * 0.06 + r * 0.2, 2.6); list.push({ x: cxp + (c + 0.5) * th0, y: cyp + th0 / 2, s: th0, ang: wv.ang, g: wv.flip ? th.plate : kcol[r], a: th.border }); }
        ctx.save(); ctx.beginPath(); ctx.rect(cxp, cyp, cwp, th0); ctx.clip();
        tiles(ctx, list, { lw: 0.22 });
        ctx.restore();
        ctx.beginPath(); ctx.rect(cxp, cyp, cwp, th0); ctx.lineWidth = 3 * u; ctx.strokeStyle = th.plate; ctx.stroke();
      });
      const phx = sx + sw * (0.06 + (((t * 0.11) % 1) * 0.88));
      ctx.beginPath(); ctx.moveTo(phx, ty0 - 12 * u); ctx.lineTo(phx, ty0 + tracks * (th0 + sh * 0.035)); ctx.lineWidth = 5 * u; ctx.strokeStyle = th.plate; ctx.stroke();
      ctx.restore();
      if (!phone) {
        // Deck: a trapezoid paved with one row of tiles.
        const dh = h * 0.08, y0 = R.y + R.h;
        ctx.save();
        ctx.beginPath(); ctx.moveTo(x - w * 0.05, y0 + dh); ctx.lineTo(x + w * 1.05, y0 + dh); ctx.lineTo(x + w, y0); ctx.lineTo(x, y0); ctx.closePath();
        ctx.fillStyle = th.plate; ctx.fill(); ctx.save(); ctx.clip();
        const list = [], nT = Math.ceil((w * 1.1) / dh);
        for (let c = 0; c < nT; c++) { const wv = wAng(c, 0, 47, t, c * 0.05, 2.3); list.push({ x: x - w * 0.05 + (c + 0.5) * dh, y: y0 + dh / 2, s: dh, ang: wv.ang, g: wv.flip ? th.plate : th.acc, a: th.border }); }
        tiles(ctx, list, { lw: 0.24, grid: rgba(th.border, 0.35), gridW: 1.5 * u });
        ctx.restore();
        ctx.lineWidth = 5 * u; ctx.strokeStyle = th.border; ctx.lineJoin = "round"; ctx.stroke();
        ctx.restore();
      }
    };
    // The device builds cell by cell instead of fading.
    const qd = 0.3 + 0.7 * seg(pp, 0.3, 0.5);
    cellBuild(ctx, S, th, { x: x - w * 0.06, y: y - 6 * u, w: w * 1.12 + 24 * u, h: h * 1.1 + 30 * u }, qd, drawDevice, { cs: 70 * u, seed: 44 });
    if (!R) return;
    if (qd < 1) return;
    const sx = R.ix, sy = R.iy, sw = R.iw, sh = R.ih;
    const pv = { x: sx + sw * 0.06, y: sy + sh * 0.07, w: sw * 0.88, h: sh * 0.47 };
    const th0 = sh * 0.1, ty0 = sy + sh * 0.62;
    // Callouts.
    const anchors = [[pv.x + pv.w * 0.72, pv.y + pv.h * 0.3], [sx + sw * 0.55, ty0 + th0 * 0.5 + (th0 + sh * 0.035)], [sx + sw * 0.2, ty0 + th0 * 0.5 + 2 * (th0 + sh * 0.035)]];
    const labels = d.callouts || [];
    if (!tall) {
      const labelX = x + w + 110 * u, avail = A.x + A.w - labelX - 10 * u;
      const lys = phone ? [0.18, 0.49, 0.8].map((f) => A.y + A.h * f) : [0.09, 0.33, 0.57].map((f) => y + h * f);
      labels.forEach((label, i) => {
        const c = eo(seg(pp, 0.5 + i * 0.1, 0.72 + i * 0.1));
        if (c <= 0 || !label) return;
        const ly = lys[i];
        const [ax, ay] = anchors[i], tx = labelX - 18 * u;
        const pts = []; for (let k = 0; k <= 24; k++) { const f = k / 24, e = f * f * (3 - 2 * f); pts.push([lerp(ax, tx, f), lerp(ay, ly, e)]); }
        pipe(ctx, S, th, pts, c, t + i * 0.3, { w: 8, beads: 2, speed: 0.4 });
        glyph(ctx, S, th, ax, ay, 30 * u, t, { phase: i * 0.4 });
        if (c > 0.8) pill(ctx, S, th, label, labelX, ly, 52 * u, { max: avail, q: back(seg(c, 0.8, 1)), fill: i === 1 ? th.acc : th.plate });
      });
      if (!phone) approveButton(ctx, S, th, labelX, y + h * 0.7, Math.min(avail, 560 * u), h * 0.38, eo(seg(pp, 0.78, 0.96)), t, [sx + sw, ty0 + th0 * 0.5 + (th0 + sh * 0.035)]);
    } else {
      const top = y + h + (phone ? 40 : h * 0.1 + 50) * u, rowH = Math.min(120 * u, (A.y + A.h - top) / 3);
      labels.forEach((label, i) => {
        const c = eo(seg(pp, 0.5 + i * 0.1, 0.72 + i * 0.1));
        if (c <= 0 || !label) return;
        const [ax, ay] = anchors[i], ly = top + rowH * (i + 0.5);
        ctx.save(); ctx.translate(ax, ay); ctx.scale(c, c);
        ctx.beginPath(); ctx.arc(0, 0, 28 * u, 0, TAU); ctx.fillStyle = th.acc; ctx.fill(); ctx.lineWidth = 5 * u; ctx.strokeStyle = th.border; ctx.stroke();
        txt(ctx, S, th, String(i + 1), 0, 2 * u, 36 * u, { align: "center", weight: 900, color: th.onAcc });
        ctx.restore();
        ctx.save(); ctx.translate(A.x + 70 * u, ly); ctx.scale(c, c);
        ctx.beginPath(); ctx.arc(0, 0, 34 * u, 0, TAU); ctx.fillStyle = th.acc; ctx.fill(); ctx.lineWidth = 5 * u; ctx.strokeStyle = th.border; ctx.stroke();
        txt(ctx, S, th, String(i + 1), 0, 2 * u, 44 * u, { align: "center", weight: 900, color: th.onAcc });
        ctx.restore();
        if (c > 0.6) pill(ctx, S, th, label, A.x + 120 * u, ly, 48 * u, { max: A.w - 160 * u, q: back(seg(c, 0.6, 1)) });
      });
    }
  }

  function peopleScene(ctx, S, th, A, pp, d, t) {
    const u = S.u, n = Math.max(2, Math.min(6, Math.round(d.count)));
    const tallRows = S.tall && n >= 3 ? 2 : 1;
    const perRow = Math.ceil(n / tallRows);
    const stripH = A.h * (tallRows === 2 ? 0.1 : 0.15);
    const floors = tallRows === 2 ? [A.y + A.h * 0.43, A.y + A.h * 0.88] : [A.y + A.h * 0.9];
    // Floors: one row of tiles each, laid left to right; a flip wave runs along them.
    const fq = eo(seg(pp, 0.12, 0.45));
    floors.forEach((fy, r) => {
      const nT = Math.ceil(A.w / stripH), cs = A.w / nT, list = [];
      for (let c = 0; c < nT; c++) {
        const e = clamp(fq * (nT + 3) - c);
        if (e <= 0) continue;
        const wv = wAng(c, r, 202 + r * 7, t, c * 0.05 * (r ? -1 : 1), 2.2);
        list.push({ x: A.x + (c + 0.5) * cs, y: fy + cs / 2, s: cs * (0.4 + 0.6 * eo(e)), ang: wv.ang + (1 - eo(e)) * PI / 2, g: wv.flip ? th.acc : th.plate, a: th.border });
      }
      tiles(ctx, list, { lw: 0.24, grid: th.border, gridW: 3 * u });
      if (fq >= 1) { ctx.beginPath(); ctx.rect(A.x, fy, A.w, cs); ctx.lineWidth = 5 * u; ctx.strokeStyle = th.border; ctx.stroke(); }
    });
    const size = Math.min(A.h * (tallRows === 2 ? 0.23 : 0.66), (A.w / perRow) * (tallRows === 2 ? 1.0 : 1.12));
    // The review rail: a row of big tiles across the top that links everyone. A signal tile rides it
    // left to right; tiles flip as it passes and each person's drop lights when it reaches them.
    if (tallRows === 1) {
      const rq = eo(seg(pp, 0.08, 0.5)), rs = Math.min(104 * u, A.h * 0.17);
      const nT = Math.ceil(A.w / rs), cs = A.w / nT, ry = Math.max(S.H * 0.215, A.y - A.h * 0.2), per = 3.2;
      const list = [], sh = new Path2D();
      for (let c = 0; c < nT; c++) {
        const e = clamp(rq * (nT + 4) - c);
        if (e <= 0) continue;
        const wv = wAng(c, 0, 230, t, (c + 0.5) / nT, per);
        const ss = cs * (0.4 + 0.6 * eo(e)), cx = A.x + (c + 0.5) * cs;
        list.push({ x: cx, y: ry + cs / 2, s: ss, ang: wv.ang + (1 - eo(e)) * PI / 2, g: wv.flip ? th.acc : c % 2 ? th.plate : th.pale, a: th.border });
        sh.rect(cx - ss / 2 + 12 * u, ry + cs / 2 - ss / 2 + 12 * u, ss, ss);
      }
      ctx.save(); ctx.fillStyle = th.border; ctx.fill(sh); ctx.restore();
      tiles(ctx, list, { lw: 0.26, grid: th.border, gridW: 3 * u });
      if (rq >= 1) {
        ctx.beginPath(); ctx.rect(A.x, ry, A.w, cs); ctx.lineWidth = 5 * u; ctx.strokeStyle = th.border; ctx.stroke();
        const f = (((t / per) % 1) + 1) % 1, bx = A.x + A.w * f;
        glyph(ctx, S, th, bx, ry + cs / 2, cs * 0.78, t, { period: 0.6, fill: th.alt, color: th.border });
      }
      RAIL = { y: ry + cs, per, q: rq };
    } else RAIL = null;
    const skins = [[255, 219, 190], [233, 184, 140], [190, 134, 98], [146, 98, 70], [247, 207, 168], [118, 80, 58]];
    const cols = [th.alt, th.acc, th.plate, th.pale, th.alt, th.acc];
    const hairs = [th.border, th.alt, th.acc, th.border, th.band, th.alt];
    for (let i = 0; i < n; i++) {
      const q = back(seg(pp, 0.2 + i * 0.08, 0.48 + i * 0.08));
      if (q <= 0.01) continue;
      const hot = i === Math.min(n - 1, d.highlight);
      const sc = size * (hot ? 1.08 : 1);
      const row = i % tallRows, col = Math.floor(i / tallRows), floorY = floors[row];
      const cntRow = tallRows === 2 ? (row === 0 ? Math.ceil(n / 2) : Math.floor(n / 2)) : n;
      const cx = A.x + (A.w / cntRow) * (col + 0.5), by = floorY + 4 * u;
      const sway = Math.sin(t * 1.4 + i * 1.3) * 0.035, bob = Math.abs(Math.sin(t * 2.2 + i)) * 6 * u * (hot ? 1.6 : 1);
      ctx.save();
      ctx.translate(cx, by); ctx.rotate(sway); ctx.scale(q, q); ctx.translate(0, -bob);
      if (hot) for (let k = 0; k < 3; k++) { const f = (((t * 0.5 + k / 3) % 1) + 1) % 1; ctx.beginPath(); ctx.arc(0, -sc * 0.55, sc * (0.42 + f * 0.45), 0, TAU); ctx.lineWidth = (8 - f * 6) * u; ctx.strokeStyle = rgba(th.acc, (1 - f) * 0.8); ctx.stroke(); }
      // Body: an arch paved with tiles on its own grid.
      const bwid = sc * 0.62, bh = sc * 0.5, bodyTop = -bh * 0.5 - bwid / 2;
      const arch = () => { ctx.beginPath(); ctx.moveTo(-bwid / 2, 0); ctx.lineTo(-bwid / 2, -bh * 0.5); ctx.arc(0, -bh * 0.5, bwid / 2, PI, 0); ctx.lineTo(bwid / 2, 0); ctx.closePath(); };
      ctx.save(); arch(); ctx.clip();
      const cs = bwid / 4, list = [], nr = Math.ceil(-bodyTop / cs);
      for (let r = 0; r < nr; r++) for (let c = 0; c < 4; c++) list.push({ x: -bwid / 2 + (c + 0.5) * cs, y: -(r + 0.5) * cs, s: cs, ang: tAng(c, r, 300 + i * 11, t, 2.4, 3), g: cols[i % cols.length], a: th.border });
      tiles(ctx, list, { lw: 0.22, grid: rgba(th.border, 0.3), gridW: 1.5 * u });
      ctx.restore();
      arch(); ctx.lineWidth = 6 * u; ctx.strokeStyle = th.border; ctx.lineJoin = "round"; ctx.stroke();
      // Arms: swinging arcs; the highlighted figure waves.
      ctx.lineCap = "round";
      for (const side of [-1, 1]) {
        const wave = hot && side === 1 ? Math.sin(t * 6) * 0.45 - 0.9 : Math.sin(t * 1.6 + i + side) * 0.1 + 0.25;
        ctx.save(); ctx.translate(side * bwid * 0.47, -bh * 0.62); ctx.rotate(side * (wave + 0.4) * (hot && side === 1 ? -1 : 1));
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(side * sc * 0.16, sc * 0.1, side * sc * 0.08, sc * 0.26);
        ctx.lineWidth = 18 * u; ctx.strokeStyle = th.border; ctx.stroke(); ctx.lineWidth = 9 * u; ctx.strokeStyle = rgba(skins[i % 6]); ctx.stroke();
        ctx.restore();
      }
      // Neck and head, joined to the top of the body.
      const hr = sc * 0.19, hy = bodyTop - hr * 1.12;
      const hcx = Math.sin(t * 1.1 + i) * 3 * u;
      const nw = hr * 0.62;
      ctx.beginPath(); ctx.moveTo(hcx - nw / 2, hy + hr * 0.6); ctx.lineTo(-nw / 2, bodyTop + 10 * u); ctx.lineTo(nw / 2, bodyTop + 10 * u); ctx.lineTo(hcx + nw / 2, hy + hr * 0.6); ctx.closePath();
      ctx.fillStyle = rgba(skins[i % 6]); ctx.fill(); ctx.lineWidth = 5 * u; ctx.strokeStyle = th.border; ctx.lineJoin = "round"; ctx.stroke();
      // Collar: a small tile at the neck.
      glyph(ctx, S, th, 0, bodyTop + 4 * u, hr * 0.62, t, { phase: i * 0.6, fill: hot ? th.plate : th.acc, color: th.border });
      const hair = i % 5, hairCol = hairs[i % hairs.length];
      ctx.lineWidth = 5 * u; ctx.strokeStyle = th.border;
      if (hair === 2) {
        const ax = hcx + Math.sin(t * 3 + i) * 10 * u;
        ctx.beginPath(); ctx.moveTo(hcx, hy - hr); ctx.lineTo(ax, hy - hr - sc * 0.15); ctx.lineWidth = 8 * u; ctx.strokeStyle = th.border; ctx.stroke();
        glyph(ctx, S, th, ax, hy - hr - sc * 0.17, hr * 0.55, t, { phase: 0.3 });
      }
      if (hair === 1) for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(hcx + side * hr * 0.85, hy - hr * 0.78, hr * 0.38, 0, TAU); ctx.fillStyle = hairCol; ctx.fill(); ctx.lineWidth = 5 * u; ctx.stroke(); }
      ctx.beginPath(); ctx.arc(hcx, hy, hr, 0, TAU); ctx.fillStyle = rgba(skins[i % 6]); ctx.fill(); ctx.lineWidth = 5 * u; ctx.strokeStyle = th.border; ctx.stroke();
      ctx.fillStyle = hairCol;
      if (hair === 0 || hair === 1) { ctx.beginPath(); ctx.arc(hcx, hy, hr, PI * 1.02, PI * 1.98); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      if (hair === 3) { ctx.beginPath(); ctx.arc(hcx, hy - hr * 0.1, hr * 1.04, PI * 1.05, PI * 1.95); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(hcx - hr, hy - hr * 0.2); ctx.lineTo(hcx + hr, hy - hr * 0.2); ctx.stroke(); }
      if (hair === 4) for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.arc(hcx + k * hr * 0.5, hy - hr, hr * 0.32, PI, TAU); ctx.fill(); ctx.stroke(); }
      const blink = (t * 0.4 + i * 0.37) % 1 < 0.05;
      ctx.fillStyle = th.border; ctx.strokeStyle = th.border; ctx.lineWidth = 4 * u;
      for (const side of [-1, 1]) {
        if (blink) { ctx.beginPath(); ctx.moveTo(hcx + side * hr * 0.4 - hr * 0.14, hy - hr * 0.02); ctx.lineTo(hcx + side * hr * 0.4 + hr * 0.14, hy - hr * 0.02); ctx.stroke(); }
        else { ctx.beginPath(); ctx.arc(hcx + side * hr * 0.4, hy - hr * 0.02, hr * 0.1, 0, TAU); ctx.fill(); }
      }
      ctx.beginPath(); ctx.arc(hcx, hy + hr * 0.2, hr * 0.32, 0.15 * PI, 0.85 * PI); ctx.stroke();
      ctx.restore();
      const label = d.badges[i % d.badges.length];
      const headTop = by + (hy - hr - (hair === 2 ? sc * 0.22 : hr * 0.3)) * q;
      if (RAIL && RAIL.q >= 1 && q > 0.6) {
        const by0 = headTop - 50 * u - 30 * u, f = (((t / RAIL.per) % 1) + 1) % 1, at = (cx - A.x) / A.w;
        const lit = (((f - at) % 1) + 1) % 1 < 0.22;
        pipe(ctx, S, th, [[cx, RAIL.y + 4 * u], [cx, by0]], eo(seg(q, 0.6, 1)), t + i * 0.37, { w: 10, beads: 2, speed: 0.9, color: lit ? th.alt : th.acc });
      }
      if (label && q > 0.8) pill(ctx, S, th, label, cx, headTop - 50 * u + Math.sin(t * 2 + i) * 4 * u, 46 * u, { align: "center", fill: hot ? th.acc : th.plate, q: back(seg(q, 0.8, 1)), max: A.w / cntRow - 10 * u });
    }
  }

  function processScene(ctx, S, th, A, pp, d, t) {
    const u = S.u, n = d.steps.length, tall = S.tall || A.h > A.w;
    const gap = (tall ? 110 : 120) * u;
    const cw = tall ? A.w * 0.8 : (A.w - gap * (n - 1)) / n, ch = tall ? (A.h - gap * (n - 1)) / n : A.h * 0.94;
    for (let i = 0; i < n; i++) {
      const x = tall ? A.x + (A.w - cw) / 2 : A.x + i * (cw + gap), y = tall ? A.y + i * (ch + gap) : A.y + (A.h - ch) / 2;
      if (i < n - 1) {
        const a = eo(seg(pp, 0.36 + i * 0.14, 0.6 + i * 0.14));
        const pts = tall ? [[x + cw / 2, y + ch + 22 * u], [x + cw / 2, y + ch + gap - 14 * u]] : [[x + cw + 22 * u, y + ch / 2], [x + cw + gap - 14 * u, y + ch / 2]];
        pipe(ctx, S, th, pts, a, t + i * 0.4, { w: 10, beads: 2, speed: 0.6 });
        if (a > 0.95) { const e = pts[1]; ctx.beginPath(); if (tall) { ctx.moveTo(e[0] - 18 * u, e[1] - 6 * u); ctx.lineTo(e[0], e[1] + 18 * u); ctx.lineTo(e[0] + 18 * u, e[1] - 6 * u); } else { ctx.moveTo(e[0] - 6 * u, e[1] - 18 * u); ctx.lineTo(e[0] + 18 * u, e[1]); ctx.lineTo(e[0] - 6 * u, e[1] + 18 * u); } ctx.closePath(); ctx.fillStyle = th.acc; ctx.fill(); ctx.lineWidth = 5 * u; ctx.strokeStyle = th.border; ctx.lineJoin = "round"; ctx.stroke(); }
      }
      const qb = seg(pp, 0.2 + i * 0.12, 0.44 + i * 0.12);
      if (qb <= 0) continue;
      const last = i === n - 1;
      cellBuild(ctx, S, th, { x: x - 4 * u, y: y - 4 * u, w: cw + 28 * u, h: ch + 28 * u }, qb, () => {
        const R = tilePlate(ctx, S, th, x, y, cw, ch, { cs: 36 * u, t, seed: 60 + i * 5, fill: last ? th.acc : th.plate, rimGround: last ? th.plate : th.acc, shadowColor: last ? th.band : th.alt });
        // Icon stage: a tile window with the step's emblem on top.
        const iw = tall ? R.ih * 0.9 : R.iw * 0.8, ih = tall ? R.ih * 0.8 : R.ih * 0.5;
        const ix = tall ? R.ix + 24 * u : R.ix + (R.iw - iw) / 2, iy = tall ? R.iy + (R.ih - ih) / 2 : R.iy + 26 * u;
        fillMaze(ctx, S, th, ix, iy, iw, ih, { ground: last ? th.plate : th.ground, B: Math.min(iw, ih) / 2.2, maxL: 1, seed: 400 + i * 23, t, pal: last ? miniPal(rgba(th.acc, 0.55), th.border, rgba(th.alt, 0.6)) : miniPal(rgba(th.band, 0.6), th.acc, rgba(th.alt, 0.35)), ox: -ix - t * 30 * u * (i % 2 ? -1 : 1), oy: -iy + t * 12 * u, grid: rgba(last ? th.border : th.pale, 0.18) });
        ctx.beginPath(); ctx.rect(ix, iy, iw, ih); ctx.lineWidth = 5 * u; ctx.strokeStyle = th.border; ctx.stroke();
        const ecx = ix + iw / 2, ecy = iy + ih / 2, es = Math.min(iw, ih) * 0.32;
        ctx.save(); ctx.translate(ecx, ecy); ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.beginPath(); ctx.arc(0, 0, es * 1.05, 0, TAU); ctx.fillStyle = th.plate; ctx.fill(); ctx.lineWidth = 5 * u; ctx.strokeStyle = th.border; ctx.stroke();
        ctx.strokeStyle = th.border; ctx.lineWidth = 8 * u;
        if (i % 3 === 0 && !last) { // a page being read
          rr(ctx, -es * 0.5, -es * 0.62, es, es * 1.24, 6 * u); ctx.stroke();
          ctx.beginPath(); for (let k = 0; k < 3; k++) { ctx.moveTo(-es * 0.28, -es * 0.3 + k * es * 0.3); ctx.lineTo(es * 0.28, -es * 0.3 + k * es * 0.3); } ctx.stroke();
          const sy = -es * 0.62 + ((t * 0.7) % 1) * es * 1.24; ctx.beginPath(); ctx.moveTo(-es * 0.7, sy); ctx.lineTo(es * 0.7, sy); ctx.lineWidth = 6 * u; ctx.strokeStyle = th.alt; ctx.stroke();
        } else if (!last) { // a tile forming: four cells turning
          const q2 = es * 0.62, list = [];
          for (let k = 0; k < 4; k++) { const wv = wAng(k, 0, 470, t, k * 0.12, 1.6); list.push({ x: (k % 2 - 0.5) * q2, y: (Math.floor(k / 2) - 0.5) * q2, s: q2, ang: wv.ang, g: wv.flip ? th.acc : th.plate, a: th.border }); }
          tiles(ctx, list, { lw: 0.26, grid: th.border, gridW: 3 * u });
        } else { // a check drawing itself, over and over
          const f = ((t * 0.6) % 1.4), c = eo(seg(f, 0, 0.5)), c2 = eo(seg(f, 0.35, 0.8));
          ctx.beginPath(); ctx.moveTo(-es * 0.5, es * 0.02); const a = [-es * 0.14, es * 0.4], b = [es * 0.55, -es * 0.4];
          ctx.lineTo(lerp(-es * 0.5, a[0], c), lerp(es * 0.02, a[1], c));
          if (c > 0.999) ctx.lineTo(lerp(a[0], b[0], c2), lerp(a[1], b[1], c2));
          ctx.lineWidth = 14 * u; ctx.strokeStyle = th.border; ctx.stroke();
        }
        ctx.restore();
        // Number chip and label.
        ctx.beginPath(); ctx.arc(x + 44 * u, y + 44 * u, 36 * u, 0, TAU); ctx.fillStyle = last ? th.plate : th.border; ctx.fill(); ctx.lineWidth = 5 * u; ctx.strokeStyle = th.border; ctx.stroke();
        txt(ctx, S, th, String(i + 1), x + 44 * u, y + 47 * u, 46 * u, { align: "center", weight: 900, color: last ? th.ink : th.acc });
        const lx = tall ? ix + iw + 30 * u : R.ix + R.iw / 2, ly = tall ? R.iy + R.ih / 2 : R.iy + R.ih - 64 * u, lw = tall ? R.ix + R.iw - lx - 16 * u : R.iw - 24 * u;
        const words = String(d.steps[i] || "").split(/\s+/);
        const color = last ? th.onAcc : th.ink;
        let size = fitSize(ctx, S, d.steps[i], 56 * u, lw, 44 * u, { weight: 800 });
        if (textW(ctx, S, d.steps[i], size, { weight: 800 }) > lw && words.length > 1) {
          const half = Math.ceil(words.length / 2), l1 = words.slice(0, half).join(" "), l2 = words.slice(half).join(" ");
          size = Math.max(44 * u, Math.min(fitSize(ctx, S, l1, 52 * u, lw, 44 * u, { weight: 800 }), fitSize(ctx, S, l2, 52 * u, lw, 44 * u, { weight: 800 })));
          txt(ctx, S, th, l1, lx, ly - size * 0.55, size, { align: tall ? "left" : "center", weight: 800, color });
          txt(ctx, S, th, l2, lx, ly + size * 0.55, size, { align: tall ? "left" : "center", weight: 800, color });
        } else txt(ctx, S, th, d.steps[i], lx, ly, size, { align: tall ? "left" : "center", weight: 800, color });
      }, { cs: 64 * u, seed: 70 + i });
    }
  }

  function compareScene(ctx, S, th, A, pp, d, t, local, info) {
    const u = S.u, tall = S.tall || A.h > A.w * 1.1;
    const gap = (tall ? 120 : 150) * u;
    const cw = tall ? A.w : (A.w - gap) / 2, ch = tall ? (A.h - gap) / 2 : A.h * 0.94;
    const lv = Number(d.leftValue) || 0, rv = Number(d.rightValue) || 0, mx = Math.max(lv, rv, 1);
    const sides = [{ label: d.left, v: lv, hot: false }, { label: d.right, v: rv, hot: true }];
    const centers = [];
    sides.forEach((s, i) => {
      const qb = seg(pp, 0.2 + i * 0.12, 0.44 + i * 0.12);
      const x = tall ? A.x : A.x + i * (cw + gap), y = tall ? A.y + i * (ch + gap) : A.y + (A.h - ch) / 2;
      centers.push([x + cw / 2, y + ch / 2]);
      if (qb <= 0) return;
      cellBuild(ctx, S, th, { x: x - 4 * u, y: y - 4 * u, w: cw + 28 * u, h: ch + 28 * u }, qb, () => {
        const R = tilePlate(ctx, S, th, x, y, cw, ch, { cs: 38 * u, t, seed: 80 + i * 9, fill: s.hot ? th.acc : th.plate, rimGround: s.hot ? th.plate : th.acc, shadowColor: s.hot ? th.band : th.alt });
        const col = s.hot ? th.onAcc : th.ink;
        const pad = 26 * u, x0 = R.ix + pad, w0 = R.iw - pad * 2;
        const lsz = fitSize(ctx, S, s.label, 54 * u, w0 - 100 * u, 44 * u, { weight: 800 });
        txt(ctx, S, th, s.label, x0, R.iy + pad + 26 * u, lsz, { weight: 800, color: col });
        glyph(ctx, S, th, R.ix + R.iw - pad - 34 * u, R.iy + pad + 26 * u, 68 * u, t, { phase: i * 0.5, fill: s.hot ? th.plate : th.acc, color: th.border });
        const qn = eo(seg(pp, 0.4 + i * 0.12, 0.8 + i * 0.1));
        const big = Math.min(tall ? 180 * u : 200 * u, R.ih * 0.38);
        const label = nf(s.v * qn, s.v, d.suffix);
        const bz = fitSize(ctx, S, label, big, w0, 96 * u, { weight: 900 });
        txt(ctx, S, th, label, x0, R.iy + R.ih * 0.48, bz, { weight: 900, color: col });
        // Meter: a row of tiles, filled up to this side's share. On the left, the tiles beyond the right
        // side's value are the waste and turn coral; a flip wave runs along the filled tiles.
        const mh0 = Math.max(52 * u, R.ih * 0.15), nT = Math.max(4, Math.round(w0 / mh0)), mh = w0 / nT;
        const my0 = R.iy + R.ih - pad - mh;
        const fill = nT * (s.v / mx) * eo(seg(pp, 0.5 + i * 0.1, 0.9)), cut = nT * (rv / mx);
        const list = [];
        for (let c = 0; c < nT; c++) {
          const e = clamp(fill - c);
          const wv = wAng(c, i, 500 + i * 9, t, c * 0.07 + i * 0.4, 2.0);
          if (e <= 0) { list.push({ x: x0 + (c + 0.5) * mh, y: my0 + mh / 2, s: mh, ang: 0, g: rgba(th.border, s.hot ? 0.16 : 0.08), a: null }); continue; }
          const waste = !s.hot && c >= cut && qn >= 1;
          const g = s.hot ? (wv.flip ? th.plate : th.border) : waste ? (wv.flip ? th.plate : th.alt) : (wv.flip ? th.pale : th.band);
          list.push({ x: x0 + (c + 0.5) * mh, y: my0 + mh / 2, s: mh * (0.45 + 0.55 * eo(e)), ang: wv.ang + (1 - eo(e)) * PI / 2, g, a: s.hot ? th.acc : th.border });
        }
        tiles(ctx, list, { lw: 0.24, grid: rgba(th.border, 0.5), gridW: 2 * u });
        ctx.beginPath(); ctx.rect(x0, my0, w0, mh); ctx.lineWidth = 5 * u; ctx.strokeStyle = th.border; ctx.stroke();
      }, { cs: 64 * u, seed: 90 + i });
    });
    // Bridge: a turning-tile badge between the two cards, orbited by beads.
    const bq = back(seg(pp, 0.5, 0.7));
    if (bq > 0.01) {
      const bx = (centers[0][0] + centers[1][0]) / 2, by = (centers[0][1] + centers[1][1]) / 2, br = (tall ? 62 : 66) * u;
      ctx.save(); ctx.translate(bx, by); ctx.scale(bq, bq);
      for (let k = 0; k < 3; k++) { const a = t * 1.6 + (k * TAU) / 3; ctx.beginPath(); ctx.arc(Math.cos(a) * br * 1.5, Math.sin(a) * br * 1.5, 10 * u, 0, TAU); ctx.fillStyle = th.acc; ctx.fill(); ctx.lineWidth = 4 * u; ctx.strokeStyle = th.border; ctx.stroke(); }
      glyph(ctx, S, th, 0, 0, br * 1.6, t, { period: 1.3, fill: th.plate, color: th.border });
      ctx.restore();
    }
    // Change badge on the winning card: it lands, then keeps a heartbeat.
    if (lv) {
      const pct = Math.round(((rv - lv) / lv) * 100), q = back(seg(pp, 0.72, 0.9));
      if (q > 0.01) {
        const beat = q >= 1 ? 1 + 0.07 * Math.pow(Math.max(0, Math.sin(t * 4.2)), 6) : q;
        const x = tall ? A.x + A.w - 20 * u : A.x + A.w - 24 * u, y = (tall ? A.y + ch + gap : A.y + (A.h - ch) / 2) - 10 * u;
        pill(ctx, S, th, `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%`, x, y, 60 * u, { align: "right", fill: th.alt, color: th.border, q: beat, shadowColor: th.border });
      }
    }
    if (LAST && info && info.exit === undefined) compareFinale(ctx, S, th, A, d, t, local, info.hold, lv, rv);
  }
  // The closing beat when the comparison ends the piece: the cards' tiles fold into one big medallion
  // carrying the change, which keeps pulsing, orbiting and flipping to the last frame.
  function compareFinale(ctx, S, th, A, d, t, local, hold, lv, rv) {
    const u = S.u, start = Math.max(hold * 0.68, hold - 1.5), g = seg(local, start, start + 0.9);
    if (g <= 0) return;
    const pct = lv ? Math.round(((rv - lv) / lv) * 100) : null;
    const label = pct != null ? `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%` : nf(rv, rv, d.suffix);
    // The cards recede under a veil of small turning tiles.
    const cs = 52 * u, ni = Math.ceil(S.W / cs), nj = Math.ceil((S.H - A.y + 60 * u) / cs), y0 = A.y - 40 * u, list = [];
    for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
      const cx = (i + 0.5) * cs, cy = y0 + (j + 0.5) * cs;
      const dist = Math.hypot((cx - S.W / 2) / S.W, (cy - (A.y + A.h / 2)) / S.H);
      const e = clamp((g * 1.4 - (0.75 - dist)) / 0.25);
      if (e <= 0) continue;
      const wv = wAng(i, j, 610, t, dist * 3, 2.0);
      list.push({ x: cx, y: cy, s: cs * (0.3 + 0.7 * eo(e)), ang: wv.ang + (1 - eo(e)) * PI, g: wv.flip ? th.acc : th.ground, a: rgba(th.band, 0.9) });
    }
    tiles(ctx, list, { lw: 0.22, grid: rgba(th.border, 0.5), gridW: 1.5 * u });
    const mw = Math.min(A.w * (S.tall ? 0.92 : 0.56), 980 * u), mh = Math.min(A.h * 0.86, mw * 0.62);
    const mx = S.W / 2 - mw / 2, my = A.y + (A.h - mh) / 2;
    const beat = 1 + 0.035 * Math.pow(Math.max(0, Math.sin(t * 3.6)), 4);
    ctx.save(); ctx.translate(S.W / 2, my + mh / 2); ctx.scale(beat, beat); ctx.translate(-S.W / 2, -(my + mh / 2));
    cellBuild(ctx, S, th, { x: mx - 6 * u, y: my - 6 * u, w: mw + 34 * u, h: mh + 34 * u }, seg(g, 0.25, 1), () => {
      const R = tilePlate(ctx, S, th, mx, my, mw, mh, { cs: 40 * u, t, seed: 97, fill: th.acc, rimGround: th.plate, shadowColor: th.alt, shadow: 22 });
      const fz = fitSize(ctx, S, label, Math.min(300 * u, R.ih * 0.62), R.iw * 0.84, 96 * u, { weight: 900 });
      txt(ctx, S, th, label, R.ix + R.iw / 2 + 6 * u, R.iy + R.ih * 0.47 + 6 * u, fz, { align: "center", weight: 900, color: th.alt });
      txt(ctx, S, th, label, R.ix + R.iw / 2, R.iy + R.ih * 0.47, fz, { align: "center", weight: 900, color: th.onAcc });
      // A meter of tiles: the left side's count collapsing to the right side's.
      const nT = Math.max(lv, rv, 1) <= 16 ? Math.round(Math.max(lv, rv, 1)) : 12, ts = Math.min(R.iw * 0.8 / nT, 46 * u);
      const keep = Math.max(1, Math.round(nT * (rv / Math.max(lv, rv, 1)))), myy = R.iy + R.ih * 0.84;
      const count = lerp(nT, keep, eo(seg(g, 0.6, 1))), mx0 = R.ix + R.iw / 2 - (count * ts) / 2;
      const ml = [];
      for (let c = 0; c < nT; c++) {
        const gone = c >= keep, k = gone ? 1 - eo(seg(g, 0.55 + (c - keep) * 0.04, 0.8 + (c - keep) * 0.04)) : 1;
        if (k <= 0.02) continue;
        const wv = wAng(c, 0, 620, t, c * 0.08, 1.8);
        ml.push({ x: mx0 + (c + 0.5) * ts, y: myy, s: ts * k, ang: wv.ang, g: gone ? th.alt : wv.flip ? th.pale : th.plate, a: th.border });
      }
      tiles(ctx, ml, { lw: 0.26, grid: th.border, gridW: 3 * u });
    }, { cs: 66 * u, seed: 98 });
    ctx.restore();
    // Orbiting tiles keep circling the medallion to the very last frame.
    const oq = eo(seg(g, 0.6, 1));
    if (oq > 0) for (let k = 0; k < 8; k++) {
      const a = t * 0.9 + (k * TAU) / 8, rx = mw * 0.62 * oq, ry = mh * 0.66 * oq;
      glyph(ctx, S, th, S.W / 2 + Math.cos(a) * rx, my + mh / 2 + Math.sin(a) * ry, (34 + 10 * Math.sin(t * 2 + k)) * u, t, { phase: k * 0.21, fill: k % 2 ? th.alt : th.plate, color: th.border });
    }
  }

  // ---- texture over everything -----------------------------------------------------------------------
  function paint(ctx, W, H, t, accent, look) {
    ctx.clearRect(0, 0, W, H);
    const dark = lum(rgb(look.bg)) < 120, k = W / 1920, tall = H > W;
    const r = rng(Math.floor(t * 12) * 977 + 5);
    const n = Math.round(420 * (tall ? 0.7 : 1));
    for (let i = 0; i < n; i++) {
      const x = r() * W, y = r() * H, s = (0.7 + r() * 1.6) * k * (tall ? 1.3 : 1), a = 0.04 + r() * 0.08;
      ctx.fillStyle = r() < 0.5 ? (dark ? `rgba(255,255,255,${a})` : `rgba(255,250,235,${a})`) : `rgba(0,0,0,${a * 0.8})`;
      ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill();
    }
  }

  const display = "'Arial Rounded MT Bold', 'Avenir Next', 'Helvetica Neue', Arial, sans-serif";
  return {
    bg: "#0c2530", disc: "#123846", band: "#2fa79c", alt: "#f0675f", pale: "#d9f4ec",
    panel: "#f7f0dc", ink: "#0c2530", muted: "rgba(12,37,48,0.72)", edge: "#0c2530", accent: "#ffb324", onAccent: "#0c2530",
    rule: "rgba(12,37,48,0.4)", track: "rgba(12,37,48,0.12)",
    display, displayWeight: 800, displayCase: "none", displayTracking: "-0.01em",
    body: "'Avenir Next', 'Helvetica Neue', Arial, sans-serif", bodyWeight: 700,
    figures: display, radius: 20, motion: "wipe", change: "grid", kit: { line: 4, fill: "solid", panel: "fill" },
    // Headlines set straight on this look's backdrop, where its ink and accent (meant for panels) do not read.
    displayInk: { original: "#f7f0dc", mono: "#f4f4f6" },
    displayAccent: { light: "#994925" },
    palettes: {
      light: { bg: "#efe4c8", disc: "#e3d3ab", band: "#233a6e", alt: "#d9533f", pale: "#fbf4df", panel: "#fffaec", ink: "#1a2750", muted: "rgba(26,39,80,0.7)", edge: "#1a2750", accent: "#ff7a3d", onAccent: "#1a2750" },
      dark: { bg: "#0a0714", disc: "#170f2e", band: "#6a46f2", alt: "#17c3c9", pale: "#e6dcff", panel: "#1c1332", ink: "#f4eeff", muted: "rgba(244,238,255,0.74)", edge: "#f4eeff", accent: "#ff5fa8", onAccent: "#1a0b20" },
      mono: { bg: "#141518", disc: "#1f2125", band: "#8f959e", alt: "#cfd2d8", pale: "#f0f1f3", panel: "#ececef", ink: "#141518", muted: "rgba(20,21,24,0.7)", edge: "#141518", accent: "#f4f4f6", onAccent: "#141518" },
    },
    textShadow: () => "none",
    backdrop: (accent, texture = 1, look) => look.bg,
    css: (accent, look) => `
      #title-scene, #closing-scene { align-items: center; text-align: center; }
      #title-scene #title, #title-scene .kicker { color: transparent !important; }
      #title-scene .kicker::before { visibility: hidden; }
      #title-scene .kicker { align-self: center; display: inline-block; color: ${look.ink}; text-shadow: none; letter-spacing: 0.16em; padding-left: 0; }
      #title-scene .kicker::before { content: ""; display: inline-block; width: 0.7em; height: 0.7em; margin: 0 0.7em 0.08em 0; vertical-align: middle; background: ${accent}; border: 0.12em solid ${look.ink}; border-radius: 0 100% 0 100%; }
      .display { text-shadow: none; }`,
    paint,
    paintOver: true,
    keepArt: true,
    overlap: true,
    stage,
    scenes: { chart: wrap("chart", chartScene), object: wrap("object", objectScene), people: wrap("people", peopleScene), process: wrap("process", processScene), compare: wrap("compare", compareScene) },
  };
});
