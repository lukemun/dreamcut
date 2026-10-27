// Stained Glass: the whole frame is one leaded window seen from inside a dim hall. Diamond quarries with
// painted fleurons fill the light, a jewelled border runs round the edge, iron saddle bars cross it and
// shafts of sunlight drift over the glass. Every illustration is cut from glass pieces held in lead
// cames: lancet columns that fill with light, a glazed laptop, robed figures in niches, three roundel
// medallions, a glass balance. Pieces light from dark to colour as they arrive; a light front sweeps
// one panel dark and the next one bright at each change. Pure functions of time: seeded values only.
window.DreamcutMotion.register("stained-glass", ({ grain, rng }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const bump = (x, w) => Math.exp(-(x * x) / (w * w));
  const h1 = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

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
  const rgba = (c, a = 1) => `rgba(${clamp(c[0], 0, 255) | 0},${clamp(c[1], 0, 255) | 0},${clamp(c[2], 0, 255) | 0},${a})`;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  const WHITE = [255, 255, 255];

  function theme(S) {
    const L = S.look, G = L.glassSet;
    const field = G.field.map(rgb), jewel = G.jewel.map(rgb);
    return {
      u: S.u, tex: L.texture ?? 1, light: lum(rgb(L.bg)) > 150,
      lead: rgb(G.lead), came: rgb(G.came), unlit: rgb(G.unlit), matte: rgb(G.matte), field, jewel,
      ruby: jewel[0], amber: jewel[1], emerald: jewel[2], azure: jewel[3], violet: jewel[4], rose: jewel[5],
      plaque: rgb(G.plaque), plaqueInk: rgb(G.plaqueInk), panel: G.panel.map(rgb), skin: G.skin.map(rgb), hair: G.hair.map(rgb),
      acc: rgb(S.accent), dim: rgb(G.dim), beam: G.beam, ray: rgb(G.ray), ink: rgb(L.ink),
    };
  }

  // ---- buffers and glass texture ------------------------------------------------------------------
  const BUF = {};
  function buf(key, w, h) {
    let c = BUF[key];
    if (!c) c = BUF[key] = document.createElement("canvas");
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return c;
  }
  // Four sheets of cathedral glass: mottle, streaks running one way, and seed bubbles. Tiled, so
  // each element is drawn at every wrap offset.
  const TEX = [];
  const TN = 384;
  function texCanvas(k) {
    if (TEX[k]) return TEX[k];
    const c = document.createElement("canvas");
    c.width = c.height = TN;
    const g = c.getContext("2d");
    const r = rng(907 + k * 131);
    const wrapDraw = (fn) => { for (const ox of [-TN, 0, TN]) for (const oy of [-TN, 0, TN]) { g.save(); g.translate(ox, oy); fn(); g.restore(); } };
    for (let i = 0; i < 34; i++) {
      const x = r() * TN, y = r() * TN, rad = 30 + r() * 90, light = r() > 0.5, a = 0.05 + r() * 0.09;
      wrapDraw(() => {
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, light ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.2})`); gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      });
    }
    const ang = -0.5 + k * 0.42;
    for (let i = 0; i < 70; i++) {
      const x = r() * TN, y = r() * TN, len = 80 + r() * 260, light = r() > 0.7, a = (light ? 0.025 : 0.05) + r() * 0.07, w = 1.5 + r() * 5, wob = (r() - 0.5) * 30;
      const dx = Math.cos(ang) * len, dy = Math.sin(ang) * len;
      wrapDraw(() => {
        g.beginPath(); g.moveTo(x - dx / 2, y - dy / 2); g.quadraticCurveTo(x + wob, y - wob, x + dx / 2, y + dy / 2);
        g.lineWidth = w; g.strokeStyle = light ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`; g.stroke();
      });
    }
    for (let i = 0; i < 26; i++) {
      const x = r() * TN, y = r() * TN, rad = 0.8 + r() * 2.4;
      wrapDraw(() => {
        g.beginPath(); g.ellipse(x, y, rad * 1.4, rad, ang, 0, TAU);
        g.lineWidth = 0.9; g.strokeStyle = "rgba(255,255,255,0.32)"; g.stroke();
        g.fillStyle = "rgba(0,0,0,0.12)"; g.fill();
      });
    }
    return (TEX[k] = c);
  }
  const PAT = [];
  function texPattern(ctx, k) { if (!PAT[k]) PAT[k] = ctx.createPattern(texCanvas(k), "repeat"); return PAT[k]; }
  let NOISE = null;
  function noise() {
    if (NOISE) return NOISE;
    const c = document.createElement("canvas");
    c.width = c.height = 192;
    const g = c.getContext("2d");
    const img = g.createImageData(192, 192);
    const r = rng(23);
    for (let i = 0; i < img.data.length; i += 4) { const v = r() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    return (NOISE = c);
  }

  // ---- shapes: each piece carries a path builder, a centre and a radius -------------------------
  function poly(pts) {
    let cx = 0, cy = 0;
    for (const p of pts) { cx += p[0]; cy += p[1]; }
    cx /= pts.length; cy /= pts.length;
    let r = 1;
    for (const p of pts) r = Math.max(r, Math.hypot(p[0] - cx, p[1] - cy));
    return { cx, cy, r, path: (c) => { c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); } };
  }
  function circle(cx, cy, r) { return { cx, cy, r, path: (c) => { c.moveTo(cx + r, cy); c.arc(cx, cy, r, 0, TAU); c.closePath(); } }; }
  function ellipseS(cx, cy, rx, ry, rot = 0) { return { cx, cy, r: Math.max(rx, ry), path: (c) => { c.moveTo(cx + Math.cos(rot) * rx, cy + Math.sin(rot) * rx); c.ellipse(cx, cy, rx, ry, rot, 0, TAU); c.closePath(); } }; }
  function sector(cx, cy, r0, r1, a0, a1) {
    const am = (a0 + a1) / 2, rm = (r0 + r1) / 2;
    return {
      cx: cx + Math.cos(am) * rm, cy: cy + Math.sin(am) * rm, r: Math.max((r1 - r0) * 0.6, rm * Math.abs(a1 - a0) * 0.6, 2),
      path: (c) => {
        c.moveTo(cx + Math.cos(a0) * r1, cy + Math.sin(a0) * r1); c.arc(cx, cy, r1, a0, a1);
        if (r0 > 0.5) { c.lineTo(cx + Math.cos(a1) * r0, cy + Math.sin(a1) * r0); c.arc(cx, cy, r0, a1, a0, true); } else c.lineTo(cx, cy);
        c.closePath();
      },
    };
  }
  function rrS(x, y, w, h, r) {
    const q = Math.max(0, Math.min(r, w / 2, h / 2));
    return { cx: x + w / 2, cy: y + h / 2, r: Math.hypot(w, h) / 2, path: (c) => {
      c.moveTo(x + q, y); c.arcTo(x + w, y, x + w, y + h, q); c.arcTo(x + w, y + h, x, y + h, q); c.arcTo(x, y + h, x, y, q); c.arcTo(x, y, x + w, y, q); c.closePath();
    } };
  }
  const qpts = (a, c, b, n) => { const out = []; for (let i = 0; i <= n; i++) { const f = i / n, g = 1 - f; out.push([g * g * a[0] + 2 * g * f * c[0] + f * f * b[0], g * g * a[1] + 2 * g * f * c[1] + f * f * b[1]]); } return out; };
  const arcPts = (cx, cy, r, a0, a1, n) => { const out = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return out; };
  // A pointed (equilateral) arch: the left arc is centred on the right springer and vice versa.
  function lancetHalves(x, y, w) {
    const ah = w * 0.866;
    const left = [[x, y + ah], ...arcPts(x + w, y + ah, w, Math.PI, Math.PI * 4 / 3, 9).slice(1), [x + w / 2, y + ah]];
    const right = [...arcPts(x, y + ah, w, -Math.PI / 3, 0, 9), [x + w / 2, y + ah]];
    return { ah, left, right };
  }
  function lancetOutline(x, y, w, h) {
    const ah = Math.min(h, w * 0.866);
    return poly([[x, y + h], ...arcPts(x + w, y + ah, w, Math.PI, Math.PI * 4 / 3, 12), ...arcPts(x, y + ah, w, -Math.PI / 3, 0, 12).slice(1), [x + w, y + h]]);
  }
  const piece = (shape, col, seed, extra) => Object.assign(shape, { col, seed: seed | 0 }, extra || {});

  // ---- per-frame state ------------------------------------------------------------------------------
  const FR = { t: 0, local: 0, trans: null, W: 1920, H: 1080, idx: 0 };
  // A glint band travels diagonally across the glass every few seconds.
  function glintAt(x, y) {
    const d = (x * 0.82 + y * 0.57) / (FR.W * 0.82 + FR.H * 0.57);
    const c = ((FR.t * 0.36 + 0.2) % 1.6) - 0.3;
    return bump(d - c, 0.07);
  }
  // The change works cell by cell, the way a window is glazed. Leaving: each pane flickers, goes dark
  // and drops out of its came, then the empty came lifts away. Arriving: the came lines draw on first,
  // then each cell takes its colour with a flash. Cells go in a loose left-to-right order with a
  // per-piece jitter, so the panel changes pane by pane rather than as one dissolve.
  function transAt(x, y, seed = 0) {
    const T = FR.trans;
    if (!T) return { v: 1, l: 1, hot: 0, ld: 1, la: 1 };
    const A = T.A;
    const pos = clamp(((x - A.x) / Math.max(1, A.w)) * 0.7 + ((y - A.y) / Math.max(1, A.h)) * 0.3);
    const order = clamp(pos * 0.8 + h1(seed * 0.731 + 3.1) * 0.2);
    const e = clamp((T.k - order * 0.55) / 0.45);
    if (T.mode === "out") return { l: 1 - 0.4 * seg(e, 0.05, 0.35), v: 1 - seg(e, 0.22, 0.55), hot: 0.3 * bump(e - 0.06, 0.07), ld: 1, la: 1 - seg(e, 0.3, 0.6) };
    return { ld: eo(seg(e, 0, 0.3)), la: seg(e, 0, 0.05), v: seg(e, 0.2, 0.45), l: 1, hot: 0.5 * bump(e - 0.5, 0.12) };
  }

  // ---- one glass piece ------------------------------------------------------------------------------
  // Fill with light through glass (bright centre, darker edges), lay the sheet's streaks and seeds,
  // then the painted matting that darkens every piece towards its lead.
  function pane(ctx, S, th, pc, lit, vis = 1, o = {}) {
    if (vis <= 0.004) return;
    const u = S.u, L = clamp(lit);
    const gl = o.still ? 0 : glintAt(pc.cx, pc.cy) * L;
    const sh = o.still ? 1 : 1 + 0.07 * Math.sin(FR.t * 1.7 + pc.seed * 2.3) * L;
    const jit = o.still ? 1 : 0.9 + 0.2 * h1(pc.seed * 1.37);
    const base = mul(mix(th.unlit, pc.col, 0.26 + 0.74 * L), ((0.5 + 0.5 * L) * sh + gl * 0.28) * jit);
    const hot = clamp((o.hot || 0) + (pc.hot || 0));
    const hi = mix(base, WHITE, clamp((0.24 + gl * 0.45) * L + hot * 0.6));
    const mid = hot > 0 ? mix(base, WHITE, hot * 0.35) : base;
    ctx.save();
    ctx.globalAlpha *= vis;
    ctx.beginPath(); pc.path(ctx);
    const g = ctx.createRadialGradient(pc.cx - pc.r * 0.28, pc.cy - pc.r * 0.32, pc.r * 0.04, pc.cx, pc.cy, pc.r * 1.15);
    g.addColorStop(0, rgba(hi)); g.addColorStop(0.55, rgba(mid)); g.addColorStop(1, rgba(mul(mid, 0.62)));
    ctx.fillStyle = g; ctx.fill();
    if (pc.r > 4 * u) {
      ctx.clip();
      if (th.tex > 0) {
        const k = pc.seed & 3, pat = texPattern(ctx, k);
        if (pat.setTransform) pat.setTransform(new DOMMatrix([u, 0, 0, u, (pc.seed * 37) % TN, (pc.seed * 91) % TN]));
        const a0 = ctx.globalAlpha;
        ctx.globalAlpha = a0 * th.tex * (0.55 + 0.45 * L);
        ctx.fillStyle = pat; ctx.fillRect(pc.cx - pc.r * 1.05, pc.cy - pc.r * 1.05, pc.r * 2.1, pc.r * 2.1);
        ctx.globalAlpha = a0;
      }
      ctx.lineWidth = Math.min(pc.r * 0.55, 22 * u);
      ctx.strokeStyle = rgba(th.matte, 0.3 + 0.1 * (1 - L));
      ctx.stroke();
      if (pc.paint) pc.paint(ctx, L, base);
    }
    ctx.restore();
  }
  // Lead cames over a set of pieces: a dark core with a rounded face. Fully shown pieces share one path.
  function leadAll(ctx, S, th, list, lw) {
    if (!list.length) return;
    ctx.save();
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    const face = rgba(th.came);
    lw *= 1.35;
    const strokeIt = () => {
      ctx.strokeStyle = rgba(th.lead); ctx.lineWidth = lw; ctx.stroke();
      ctx.strokeStyle = face; ctx.lineWidth = lw * 0.34; ctx.stroke();
    };
    const isFull = (e) => e.v >= 0.985 && (e.ld ?? 1) >= 0.999;
    const full = list.filter(isFull);
    if (full.length) { ctx.beginPath(); for (const e of full) e.pc.path(ctx); strokeIt(); }
    const a0 = ctx.globalAlpha;
    for (const e of list) {
      if (isFull(e)) continue;
      ctx.globalAlpha = a0 * e.v;
      // A came still being laid: dashed to its drawn fraction (the dash outruns any perimeter at 1).
      const ld = e.ld ?? 1;
      if (ld < 0.999) { if (ld <= 0.002) continue; const len = e.pc.r * 7; ctx.setLineDash([len * ld, len * 2]); }
      ctx.beginPath(); e.pc.path(ctx); strokeIt();
      if (ld < 0.999) ctx.setLineDash([]);
    }
    ctx.restore();
  }
  // Draw a set of pieces with the scene's change applied. `pc.L` is each piece's light (0 dark, 1 lit).
  function glaze(ctx, S, th, pieces, lw = 6) {
    const out = [];
    for (const pc of pieces) {
      const tr = transAt(pc.cx, pc.cy, pc.seed);
      const vis = pc.vis ?? 1, v = vis * tr.v, la = vis * tr.la;
      if (v > 0.004) pane(ctx, S, th, pc, (pc.L ?? 1) * tr.l, v, { hot: tr.hot });
      if (la > 0.004) out.push({ pc, v: la, ld: tr.ld });
    }
    leadAll(ctx, S, th, out, lw * S.u);
  }

  // ---- type ---------------------------------------------------------------------------------------
  function font(S, size, weight, fam = "body") {
    const F = fam === "display" ? S.look.display : fam === "figures" ? S.look.figures : S.look.body;
    return `${weight ?? (fam === "body" ? S.look.bodyWeight : S.look.displayWeight)} ${size}px ${F}`;
  }
  function textW(ctx, S, s, size, weight, fam) { ctx.save(); ctx.font = font(S, size, weight, fam); const w = ctx.measureText(String(s)).width; ctx.restore(); return w; }
  function fitSize(ctx, S, s, size, maxW, min, weight, fam) { let z = size; while (z > min && textW(ctx, S, s, z, weight, fam) > maxW) z *= 0.95; return Math.max(min, z); }
  const fmt = (v, ref, suffix = "") => {
    const isInt = Number.isInteger(Number(ref));
    const n = isInt ? Math.round(v) : Number(v).toFixed(1);
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (suffix || "");
  };
  // Grisaille paint on glass: dark brown letters with a faint halo where the paint thins.
  function paintText(ctx, S, th, s, x, y, size, o = {}) {
    ctx.save();
    ctx.font = font(S, size, o.weight ?? 700, o.fam || "body");
    ctx.textAlign = o.align || "center"; ctx.textBaseline = "middle";
    ctx.globalAlpha *= o.alpha ?? 1;
    ctx.fillStyle = rgba(o.color || th.plaqueInk, 0.95);
    ctx.shadowColor = rgba(mix(o.color || th.plaqueInk, WHITE, 0.2), 0.35); ctx.shadowBlur = 2 * S.u;
    ctx.fillText(String(s), x, y);
    ctx.restore();
  }

  // A banderole: a scroll of pale glass with folded swallowtail ends, its painted words on it. The scroll
  // and its words always arrive together, so it is never seen blank.
  function banderole(ctx, S, th, text, cx, cy, size, o = {}) {
    const u = S.u;
    size *= 1.2;
    const maxW = o.maxW || S.W;
    const z = fitSize(ctx, S, text, size, maxW - size * 2.2, Math.min(size, 42 * u), 700);
    const tw = textW(ctx, S, text, z, 700);
    const h = z * 1.55, w = tw + z * 1.5;
    let x = cx - w / 2;
    if (o.align === "left") x = cx; else if (o.align === "right") x = cx - w;
    const y = cy - h / 2;
    const tr = transAt(x + w / 2, cy);
    const q = clamp((o.q ?? 1) * 2.2) * tr.v;
    if (q <= 0.004) return { x, y, w, h };
    const seed = o.seed || 1;
    const sag = h * 0.12 * Math.sin(FR.t * 1.3 + seed * 1.7);
    const tail = z * 0.8, drop = h * 0.32;
    const shadowCol = mul(th.plaque, 0.7);
    const ends = [
      piece(poly([[x + tail * 0.2, y + drop], [x - tail, y + drop + sag * 0.3], [x - tail * 0.55, y + drop + h * 0.5], [x - tail, y + drop + h], [x + tail * 0.2, y + drop + h]]), shadowCol, seed * 7 + 1),
      piece(poly([[x + w - tail * 0.2, y + drop], [x + w + tail, y + drop - sag * 0.3], [x + w + tail * 0.55, y + drop + h * 0.5], [x + w + tail, y + drop + h], [x + w - tail * 0.2, y + drop + h]]), shadowCol, seed * 7 + 2),
    ];
    const N = 10, top = [], bot = [];
    for (let i = 0; i <= N; i++) { const f = i / N, wv = Math.sin(f * Math.PI) * sag; top.push([x + w * f, y + wv]); bot.unshift([x + w * f, y + h + wv]); }
    const main = piece(poly([...top, ...bot]), th.plaque, seed * 7 + 3);
    main.cy = cy + sag * 0.6;
    const list = [...ends, main];
    const lit = (0.55 + 0.45 * q) * (0.75 + 0.25 * tr.l);
    const out = [];
    for (const pc of list) { pane(ctx, S, th, pc, lit, q, { hot: tr.hot }); out.push({ pc, v: q }); }
    leadAll(ctx, S, th, out, 7 * u);
    paintText(ctx, S, th, text, x + w / 2, cy + sag * 0.62 + z * 0.04, z, { alpha: q });
    return { x, y, w, h, z };
  }
  // A framed plaque for a figure: pale glass in an amber fillet, numbers painted large.
  function plaque(ctx, S, th, s, cx, cy, size, o = {}) {
    const u = S.u;
    const z = fitSize(ctx, S, s, size, (o.maxW || S.W) - size * 0.8, o.min ?? 56 * u, 800, "figures");
    const tw = Math.max(textW(ctx, S, s, z, 800, "figures"), z * 1.1);
    const w = tw + z * 0.9, h = z * 1.32, x = cx - w / 2, y = cy - h / 2, f = Math.max(10 * u, z * 0.13);
    const tr = transAt(cx, cy);
    const q = clamp((o.q ?? 1) * 2.2) * tr.v;
    if (q <= 0.004) return { x, y, w, h };
    const seed = o.seed || 3;
    const fillet = o.color || th.amber;
    const list = [
      piece(poly([[x, y], [x + w, y], [x + w - f, y + f], [x + f, y + f]]), fillet, seed + 1),
      piece(poly([[x + w, y], [x + w, y + h], [x + w - f, y + h - f], [x + w - f, y + f]]), mul(fillet, 0.85), seed + 2),
      piece(poly([[x + w, y + h], [x, y + h], [x + f, y + h - f], [x + w - f, y + h - f]]), mul(fillet, 0.75), seed + 3),
      piece(poly([[x, y + h], [x, y], [x + f, y + f], [x + f, y + h - f]]), mul(fillet, 0.9), seed + 4),
      piece(poly([[x + f, y + f], [x + w - f, y + f], [x + w - f, y + h - f], [x + f, y + h - f]]), th.plaque, seed + 5),
    ];
    const out = [];
    for (const pc of list) { pane(ctx, S, th, pc, (0.6 + 0.4 * q) * (0.75 + 0.25 * tr.l), q, { hot: tr.hot + (o.hot || 0) * tr.l }); out.push({ pc, v: q }); }
    leadAll(ctx, S, th, out, 5 * u);
    paintText(ctx, S, th, s, cx, cy + z * 0.05, z, { alpha: q, weight: 800, fam: "figures" });
    return { x, y, w, h };
  }

  // ---- the window: leaded backgrounds, border and saddle bars (cached), with moving light over them --
  // Each scene is glazed in its own hand-cut pattern: diamond quarries for the statements, irregular cut
  // glass behind the chart, a grisaille grid with jewelled border bands behind the device, honeycomb
  // quarries behind the figures, bullseye roundels behind the process and fish-scale glazing behind the
  // balance. A change relights the window cell by cell from one pattern into the next.
  const KIND = { title: "diamond", closing: "diamond", chart: "cut", object: "grisaille", people: "hex", process: "roundel", compare: "scale" };
  const FIELDS = {};
  let FIELD = null;
  function fieldPieces(kind, S, th, FW, FH, r) {
    const u = S.u, list = [];
    let n = 0;
    const colAt = (cx, cy, jewelP = 0.1) => {
      // Large slow drifts of hue across the window, so it reads as glazed in batches of sheet.
      const fx = 0.5 + 0.5 * Math.sin(cx / (420 * u) + 1.3) * Math.cos(cy / (360 * u) - cx / (900 * u));
      const k = Math.floor(clamp(fx * th.field.length + (r() - 0.5) * 1.4, 0, th.field.length - 0.001));
      let col = mix(th.field[k], th.field[(k + 1) % th.field.length], r() * 0.3);
      col = mul(col, 0.88 + r() * 0.24);
      const jewel = r() < jewelP;
      if (jewel) col = mix(th.jewel[Math.floor(r() * th.jewel.length)], WHITE, 0.12);
      return { col, jewel };
    };
    const add = (shape, col, paint) => { const pc = piece(shape, col, ++n); if (paint) pc.paint = paint; list.push(pc); return pc; };
    const M = th.matte;
    if (kind === "cut") {
      // Irregular cut glass: a jittered lattice, its cells split by single cuts the way offcuts are used up.
      const g = 132 * u, gy = g * 0.88;
      const nx = Math.ceil(FW / g) + 3, ny = Math.ceil(FH / gy) + 3;
      const P = [];
      for (let i = 0; i < nx; i++) { P[i] = []; for (let j = 0; j < ny; j++) P[i][j] = [(i - 1) * g + (r() - 0.5) * g * 0.6, (j - 1) * gy + (r() - 0.5) * gy * 0.6]; }
      for (let i = 0; i < nx - 1; i++) for (let j = 0; j < ny - 1; j++) {
        const a = P[i][j], b = P[i + 1][j], c = P[i + 1][j + 1], d = P[i][j + 1];
        const roll = r();
        const parts = roll < 0.38 ? (r() < 0.5 ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]])
          : roll < 0.6 ? (() => { const f1 = 0.3 + r() * 0.4, f2 = 0.3 + r() * 0.4; const m1 = [a[0] + (b[0] - a[0]) * f1, a[1] + (b[1] - a[1]) * f1], m2 = [d[0] + (c[0] - d[0]) * f2, d[1] + (c[1] - d[1]) * f2]; return [[a, m1, m2, d], [m1, b, c, m2]]; })()
          : [[a, b, c, d]];
        for (const pts of parts) {
          const sh = poly(pts);
          const { col, jewel } = colAt(sh.cx, sh.cy, 0.09);
          // Some offcuts carry a painted tendril.
          const paint = !jewel && r() < 0.28 ? (() => { const cx = sh.cx, cy = sh.cy, s = sh.r * 0.42, rot = r() * TAU; return (cc) => {
            cc.strokeStyle = rgba(M, 0.42); cc.lineWidth = 2.6 * u; cc.lineCap = "round"; cc.beginPath();
            cc.moveTo(cx - Math.cos(rot) * s, cy - Math.sin(rot) * s); cc.quadraticCurveTo(cx + Math.cos(rot + 1.6) * s * 0.7, cy + Math.sin(rot + 1.6) * s * 0.7, cx + Math.cos(rot) * s, cy + Math.sin(rot) * s); cc.stroke();
            cc.fillStyle = rgba(M, 0.45); cc.beginPath(); cc.arc(cx + Math.cos(rot) * s, cy + Math.sin(rot) * s, 4 * u, 0, TAU); cc.fill();
          }; })() : null;
          add(sh, col, paint);
        }
      }
    } else if (kind === "roundel") {
      // Bullseye roundels touching on a square grid, with four-pointed jewel stars in the gaps.
      const R = 58 * u, s = R * 2;
      const nx = Math.ceil(FW / s) + 2, ny = Math.ceil(FH / s) + 2;
      const jw = [th.ruby, th.amber, th.emerald, th.violet];
      for (let i = -1; i < nx; i++) for (let j = -1; j < ny; j++) {
        const cx = i * s, cy = j * s;
        const { col } = colAt(cx, cy, 0);
        add(circle(cx, cy, R), mix(col, WHITE, 0.08), (cc) => {
          cc.strokeStyle = rgba(M, 0.3); cc.lineWidth = 2.2 * u;
          for (const f of [0.34, 0.62, 0.84]) { cc.beginPath(); cc.arc(cx, cy, R * f, 0, TAU); cc.stroke(); }
          cc.fillStyle = "rgba(255,255,255,0.22)"; cc.beginPath(); cc.arc(cx - R * 0.08, cy - R * 0.1, R * 0.16, 0, TAU); cc.fill();
        });
        const sc = [
          ...arcPts(cx, cy, R, 0, Math.PI / 2, 6), ...arcPts(cx, cy + s, R, -Math.PI / 2, 0, 6).slice(1),
          ...arcPts(cx + s, cy + s, R, -Math.PI, -Math.PI / 2, 6).slice(1), ...arcPts(cx + s, cy, R, Math.PI / 2, Math.PI, 6).slice(1, -1),
        ];
        const star = poly(sc); star.cx = cx + R; star.cy = cy + R; star.r = R * 0.6;
        add(star, mul(jw[(((i + j) % 4) + 4) % 4], 0.9 + r() * 0.15));
      }
    } else if (kind === "grisaille") {
      // Pale squares painted with grisaille leafwork, crossed every few rows by a jewelled border band.
      const s = 120 * u, bh = s * 0.42;
      let y = -s, j = 0;
      while (y < FH + s) {
        if (j % 4 === 3) {
          let x = -s, k = 0;
          while (x < FW + s) {
            const w = k % 2 ? bh : s * 0.78;
            const col = k % 2 ? th.amber : th.ruby;
            const x0 = x, y0 = y;
            add(poly([[x0, y0], [x0 + w, y0], [x0 + w, y0 + bh], [x0, y0 + bh]]), mul(col, 0.85 + r() * 0.2), k % 2 ? (cc) => {
              cc.fillStyle = rgba(M, 0.5); cc.beginPath(); cc.arc(x0 + w / 2, y0 + bh / 2, bh * 0.18, 0, TAU); cc.fill();
            } : (cc) => {
              cc.fillStyle = "rgba(255,240,210,0.35)";
              for (let q = 1; q < 4; q++) { cc.beginPath(); cc.arc(x0 + (w * q) / 4, y0 + bh / 2, bh * 0.1, 0, TAU); cc.fill(); }
            });
            x += w; k++;
          }
          y += bh;
        } else {
          for (let x = -s; x < FW + s; x += s) {
            const x0 = x, y0 = y, cx = x0 + s / 2, cy = y0 + s / 2;
            const { col, jewel } = colAt(cx, cy, 0.06);
            add(poly([[x0, y0], [x0 + s, y0], [x0 + s, y0 + s], [x0, y0 + s]]), jewel ? col : mix(col, WHITE, 0.16), jewel ? null : (cc) => {
              cc.strokeStyle = rgba(M, 0.5); cc.lineWidth = 2.4 * u; cc.lineCap = "round";
              cc.strokeRect(x0 + s * 0.12, y0 + s * 0.12, s * 0.76, s * 0.76);
              cc.fillStyle = rgba(M, 0.5);
              for (let a = 0; a < 4; a++) {
                const ang = Math.PI / 4 + (a * Math.PI) / 2, ca = Math.cos(ang), sa = Math.sin(ang), L0 = s * 0.33, W0 = s * 0.1;
                cc.beginPath(); cc.moveTo(cx, cy);
                cc.quadraticCurveTo(cx + ca * L0 * 0.5 - sa * W0, cy + sa * L0 * 0.5 + ca * W0, cx + ca * L0, cy + sa * L0);
                cc.quadraticCurveTo(cx + ca * L0 * 0.5 + sa * W0, cy + sa * L0 * 0.5 - ca * W0, cx, cy); cc.fill();
              }
              // Cross-hatching in the corners, the way grisaille painters shaded a ground.
              cc.beginPath();
              for (let q = 0; q < 4; q++) { const o = s * (0.02 + q * 0.025); cc.moveTo(x0 + s * 0.14 + o, y0 + s * 0.5); cc.lineTo(x0 + s * 0.5, y0 + s * 0.14 + o); cc.moveTo(x0 + s * 0.86 - o, y0 + s * 0.5); cc.lineTo(x0 + s * 0.5, y0 + s * 0.86 - o); }
              cc.lineWidth = 1.4 * u; cc.strokeStyle = rgba(M, 0.22); cc.stroke();
              cc.beginPath(); cc.arc(cx, cy, s * 0.05, 0, TAU); cc.fillStyle = rgba(M, 0.6); cc.fill();
            });
          }
          y += s;
        }
        j++;
      }
    } else if (kind === "hex") {
      // Honeycomb quarries, a painted trefoil in many of them.
      const R = 68 * u, dx = R * 1.5, dy = R * Math.sqrt(3);
      for (let i = -1; i * dx < FW + R * 2; i++) for (let j = -1; j * dy < FH + dy; j++) {
        const cx = i * dx, cy = j * dy + (i & 1 ? dy / 2 : 0);
        const pts = []; for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]); }
        const { col, jewel } = colAt(cx, cy, 0.1);
        add(poly(pts), col, !jewel && r() < 0.5 ? (cc) => {
          cc.fillStyle = rgba(M, 0.38);
          for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + (k / 3) * TAU; cc.beginPath(); cc.arc(cx + Math.cos(a) * R * 0.17, cy + Math.sin(a) * R * 0.17, R * 0.15, 0, TAU); cc.fill(); }
          cc.strokeStyle = rgba(M, 0.3); cc.lineWidth = 2 * u; cc.beginPath();
          for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; const px = cx + Math.cos(a) * R * 0.74, py = cy + Math.sin(a) * R * 0.74; k ? cc.lineTo(px, py) : cc.moveTo(px, py); }
          cc.closePath(); cc.stroke();
        } : null);
      }
    } else if (kind === "scale") {
      // Fish-scale glazing: each scale a half-disc tucked under the two above it.
      const s = 124 * u, h = s / 2, R = s / 2;
      for (let j = -2; j * h < FH + s; j++) for (let i = -1; i * s < FW + s; i++) {
        const cx = i * s + (j & 1 ? s / 2 : 0), cy = j * h;
        // Lower half of the own circle (left to right through the bottom), then the neighbours' arcs above.
        const low = arcPts(cx, cy, R, Math.PI, 0, 10).map((p) => [p[0], 2 * cy - p[1]]);
        const upR = arcPts(cx + R, cy - R, R, Math.PI / 2, Math.PI, 6).slice(1);
        const upL = arcPts(cx - R, cy - R, R, 0, Math.PI / 2, 6).slice(1, -1);
        const sh = poly([...low, ...upR, ...upL]); sh.cx = cx; sh.cy = cy; sh.r = R;
        const { col, jewel } = colAt(cx, cy, 0.08);
        add(sh, mul(col, 0.92 + 0.1 * (((j % 3) + 3) % 3) / 2), jewel ? null : (cc) => {
          cc.strokeStyle = rgba(M, 0.36); cc.lineWidth = 2.2 * u; cc.beginPath(); cc.arc(cx, cy, R * 0.74, Math.PI * 0.18, Math.PI * 0.82); cc.stroke();
          cc.strokeStyle = rgba(M, 0.22); cc.lineWidth = 1.5 * u; cc.beginPath(); cc.arc(cx, cy, R * 0.5, Math.PI * 0.28, Math.PI * 0.72); cc.stroke();
        });
      }
    } else {
      // Diamond quarries with painted fleurons.
      const qw = 104 * u, qh = qw * 1.4;
      for (let j = -1; j * qh / 2 < FH + qh; j++) {
        for (let i = -1; i * qw < FW + qw; i++) {
          const cx = i * qw + (j & 1 ? qw / 2 : 0), cy = j * qh / 2;
          const pts = [[cx, cy - qh / 2], [cx + qw / 2, cy], [cx, cy + qh / 2], [cx - qw / 2, cy]];
          const { col, jewel } = colAt(cx, cy, 0.1);
          let paint = null;
          if (!jewel && r() < 0.42) {
            const s = qw * 0.075, kind2 = r() < 0.5;
            paint = (c) => {
              c.fillStyle = rgba(M, 0.42);
              if (kind2) { for (let a = 0; a < 4; a++) { c.beginPath(); c.arc(cx + Math.cos(a * Math.PI / 2) * s * 1.3, cy + Math.sin(a * Math.PI / 2) * s * 1.6, s, 0, TAU); c.fill(); } }
              else { c.beginPath(); c.moveTo(cx, cy - s * 3); c.quadraticCurveTo(cx + s * 1.6, cy, cx, cy + s * 3); c.quadraticCurveTo(cx - s * 1.6, cy, cx, cy - s * 3); c.fill(); c.fillRect(cx - s * 2, cy - s * 0.25, s * 4, s * 0.5); }
              c.beginPath(); c.arc(cx, cy, s * 0.55, 0, TAU); c.fillStyle = rgba(M, 0.6); c.fill();
            };
          }
          add(poly(pts), col, paint);
        }
      }
    }
    return list;
  }
  function buildBorder(S, th) {
    const { W, H, u } = S;
    const key = [W, H, S.look.bg, S.look.glassSet.field.join(), th.tex, S.accent].join("|");
    if (FIELD && FIELD.key === key) return FIELD;
    const M = Math.round(90 * u), FW = W + M * 2, FH = H + M * 2;
    // The border: a running band of jewels fixed to the frame (it does not pan with the quarries).
    const bC = document.createElement("canvas"); bC.width = W; bC.height = H;
    const bL = document.createElement("canvas"); bL.width = W; bL.height = H;
    const b = bC.getContext("2d"), bl = bL.getContext("2d");
    const bw = 34 * u, rim = 10 * u;
    const blist = [];
    const cells = (len) => Math.max(4, Math.round(len / (bw * 1.25)));
    const edge = (x0, y0, dx, dy, len) => {
      const nC = cells(len), step = len / nC;
      for (let i = 0; i < nC; i++) {
        const x = x0 + dx * step * i, y = y0 + dy * step * i;
        const w = dx ? step : bw, h = dy ? step : bw;
        const col = i % 2 ? th.ruby : th.azure;
        blist.push(piece(poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]), col, 900 + blist.length));
        if (i % 2 === 0) blist.push(piece(circle(x + w / 2, y + h / 2, bw * 0.26), th.amber, 1900 + blist.length));
      }
    };
    edge(rim + bw, rim, 1, 0, W - (rim + bw) * 2);
    edge(rim + bw, H - rim - bw, 1, 0, W - (rim + bw) * 2);
    edge(rim, rim + bw, 0, 1, H - (rim + bw) * 2);
    edge(W - rim - bw, rim + bw, 0, 1, H - (rim + bw) * 2);
    for (const [x, y] of [[rim, rim], [W - rim - bw, rim], [rim, H - rim - bw], [W - rim - bw, H - rim - bw]]) {
      blist.push(piece(poly([[x, y], [x + bw, y], [x + bw, y + bw], [x, y + bw]]), th.emerald, 2900 + blist.length));
      blist.push(piece(circle(x + bw / 2, y + bw / 2, bw * 0.34), th.amber, 3900 + blist.length));
    }
    const dimK = th.dim.map((v) => v / 255);
    for (const pc of blist) { pc.col = [pc.col[0] * dimK[0], pc.col[1] * dimK[1], pc.col[2] * dimK[2]]; pane(b, S, th, pc, 1, 1, { still: true }); }
    bl.lineJoin = "round";
    bl.beginPath(); for (const pc of blist) pc.path(bl);
    bl.strokeStyle = rgba(th.lead); bl.lineWidth = 6.5 * u; bl.stroke();
    bl.strokeStyle = rgba(th.came); bl.lineWidth = 1.6 * u; bl.stroke();
    // The window's frame: a heavy outer lead and an inner fillet line.
    bl.strokeStyle = rgba(mul(th.lead, 0.7)); bl.lineWidth = rim * 2; bl.strokeRect(0, 0, W, H);
    bl.lineWidth = 7 * u; bl.strokeStyle = rgba(th.lead); bl.strokeRect(rim + bw, rim + bw, W - (rim + bw) * 2, H - (rim + bw) * 2);
    bl.lineWidth = 2 * u; bl.strokeStyle = rgba(th.came); bl.strokeRect(rim + bw, rim + bw, W - (rim + bw) * 2, H - (rim + bw) * 2);
    for (const k in FIELDS) delete FIELDS[k];
    return (FIELD = { key, bC, bL, M, bw: bw + rim, FH, FW });
  }
  function buildField(S, th, kind) {
    const B = buildBorder(S, th);
    if (FIELDS[kind]) return FIELDS[kind];
    const { u } = S, { M, FW, FH } = B;
    const gC = document.createElement("canvas"); gC.width = FW; gC.height = FH;
    const lC = document.createElement("canvas"); lC.width = FW; lC.height = FH;
    const g = gC.getContext("2d"), l = lC.getContext("2d");
    const list = fieldPieces(kind, S, th, FW, FH, rng(4243 + kind.length * 97 + kind.charCodeAt(0)));
    for (const pc of list) pane(g, S, th, pc, 1, 1, { still: true });
    l.lineJoin = "round";
    l.beginPath(); for (const pc of list) pc.path(l);
    l.strokeStyle = rgba(th.lead); l.lineWidth = 7.5 * u; l.stroke();
    l.strokeStyle = rgba(th.came); l.lineWidth = 2.4 * u; l.stroke();
    // Iron saddle bars across the light.
    for (let y = FH * 0.2; y < FH; y += FH * 0.2) {
      l.fillStyle = rgba(mul(th.lead, 0.8)); l.fillRect(0, y - 6 * u, FW, 12 * u);
      l.fillStyle = rgba(th.came, 0.9); l.fillRect(0, y - 4 * u, FW, 2.5 * u);
    }
    const cells = list.map((pc) => ({ path: pc.path, cx: pc.cx, cy: pc.cy, r: pc.r, hc: h1(pc.seed * 12.9898 + kind.length) }));
    return (FIELDS[kind] = { gC, lC, cells, M, FW, FH });
  }

  // Each scene also takes its own tint of light through the glass.
  const SCENE_TINT = { title: [3, 0.18], chart: [2, 0.4], object: [4, 0.42], people: [0, 0.36], process: [0, 0.3], compare: [2, 0.32], closing: [5, 0.38] };
  function tintOf(th, id) {
    const d = SCENE_TINT[id] || [3, 0];
    return { col: th.jewel[d[0]], a: d[1] * (th.light ? 0.75 : 1) };
  }
  // One glazed layer of the window: glass, the light outside, the scene tint, light moving cell by cell,
  // the sun behind it and shafts of sunlight, then the lead laid over it all.
  function windowLayer(ctx, S, th, F, tint, t, px, py) {
    const { W, H, u } = S;
    const B = FIELD, ox = -F.M + px, oy = -F.M + py;
    ctx.drawImage(F.gC, ox, oy);
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = rgba(th.dim); ctx.fillRect(0, 0, W, H);
    for (let k = 0; k < 3; k++) {
      const cx = (((t * (0.018 + k * 0.007) + k * 0.37) % 1.4) - 0.2) * W, cy = H * (0.25 + 0.3 * k) + Math.sin(t * 0.3 + k) * 60 * u;
      const rad = (520 + k * 160) * u;
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      gr.addColorStop(0, `rgba(70,70,90,${th.light ? 0.18 : 0.42})`); gr.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gr; ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    }
    if (tint && tint.a > 0) {
      ctx.globalCompositeOperation = "color"; ctx.globalAlpha = tint.a;
      ctx.fillStyle = rgba(tint.col); ctx.fillRect(B.bw, B.bw, W - B.bw * 2, H - B.bw * 2);
      ctx.globalAlpha = 1;
    }
    // Slow cloud-light rolling across the panes, odd panes catching the sun, a few always backlit.
    const dk = th.light ? 0.6 : 1;
    ctx.save();
    ctx.translate(ox, oy);
    for (const q of F.cells) {
      const sx = q.cx + ox, sy = q.cy + oy;
      if (sx < -q.r || sx > W + q.r || sy < -q.r || sy > H + q.r) continue;
      const b = Math.sin(sx / (250 * u) + t * 1.15 + q.hc * 2.2) * Math.cos(sy / (220 * u) - t * 0.75 + q.hc);
      const sp = bump(((t * 0.32 + q.hc * 9) % 9) - 0.45, 0.2);
      const gem = q.hc > 0.9 ? (0.16 + 0.12 * Math.sin(t * 0.9 + q.hc * 40)) : 0;
      const lightA = Math.max(0, b) * 0.2 + sp * 0.42 + gem;
      const darkA = Math.max(0, -b) * 0.26 * dk;
      if (darkA > 0.01) { ctx.globalCompositeOperation = "source-over"; ctx.beginPath(); q.path(ctx); ctx.fillStyle = `rgba(4,3,10,${darkA})`; ctx.fill(); }
      if (lightA > 0.01) { ctx.globalCompositeOperation = "screen"; ctx.beginPath(); q.path(ctx); ctx.fillStyle = rgba(th.ray, Math.min(0.85, lightA)); ctx.fill(); }
    }
    ctx.restore();
    // Backlight: the sun stands behind the window, a broad warm glow drifting slowly across the glass.
    ctx.globalCompositeOperation = "screen";
    {
      const sx = W * (0.5 + 0.32 * Math.sin(t * 0.09 + 0.6)), sy = -H * 0.12, rad = Math.max(W, H) * 0.95;
      const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad);
      const a = th.light ? 0.12 : 0.26;
      gr.addColorStop(0, rgba(th.ray, a)); gr.addColorStop(0.45, rgba(th.ray, a * 0.45)); gr.addColorStop(1, rgba(th.ray, 0));
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      const lx = W * (0.15 + 0.7 * (0.5 + 0.5 * Math.sin(t * 0.05 + 2.1))), ly = H * 1.05, lr = H * 0.7;
      const g2 = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
      g2.addColorStop(0, rgba(mix(th.ray, th.jewel[4], 0.4), a * 0.5)); g2.addColorStop(1, rgba(th.ray, 0));
      ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = "source-over";
    // Sunlight: soft bands that brighten only the glass they cross (the lead stays dark).
    const Bf = buf("beam", W / 3, H / 3), bg = Bf.getContext("2d");
    bg.setTransform(1, 0, 0, 1, 0, 0);
    bg.globalCompositeOperation = "source-over";
    bg.clearRect(0, 0, Bf.width, Bf.height);
    bg.setTransform(Bf.width / W, 0, 0, Bf.height / H, 0, 0);
    const band = (c, wdt, a) => {
      const x0 = c * (W + H) - H * 0.6;
      const gr = bg.createLinearGradient(x0 - wdt, 0, x0 + wdt, H * 0.45);
      gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.5, `rgba(255,255,255,${a})`); gr.addColorStop(1, "rgba(255,255,255,0)");
      bg.fillStyle = gr; bg.fillRect(0, 0, W, H);
    };
    band(((t * 0.05) % 1.3) - 0.1, 380 * u, 0.85);
    band(((t * 0.05 + 0.62) % 1.3) - 0.1, 260 * u, 0.6);
    bg.setTransform(1, 0, 0, 1, 0, 0);
    bg.globalCompositeOperation = "source-in";
    bg.drawImage(ctx.canvas, 0, 0, W, H, 0, 0, Bf.width, Bf.height);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = th.beam;
    ctx.drawImage(Bf, 0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(F.lC, ox, oy);
  }
  // Glints of sun running along the iron saddle bars and round the border's lead.
  function cameGlints(ctx, S, th, F, t, px, py) {
    const { W, H, u } = S;
    const oy = -F.M + py;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const bead = (x, y, r, a) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(mix(th.ray, WHITE, 0.4), a)); g.addColorStop(0.35, rgba(th.ray, a * 0.45)); g.addColorStop(1, rgba(th.ray, 0));
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    let k = 0;
    for (let y = F.FH * 0.2; y < F.FH; y += F.FH * 0.2, k++) {
      const sy = y + oy;
      if (sy < 0 || sy > H) continue;
      const span = W + 600 * u;
      const x = (((t * (210 + k * 35) * u + k * 590 * u) % span) + span) % span - 300 * u;
      const g = ctx.createLinearGradient(x - 260 * u, 0, x + 60 * u, 0);
      g.addColorStop(0, rgba(th.ray, 0)); g.addColorStop(0.85, rgba(th.ray, 0.5)); g.addColorStop(1, rgba(th.ray, 0));
      ctx.fillStyle = g; ctx.fillRect(x - 260 * u, sy - 3 * u, 320 * u, 6 * u);
      bead(x + 40 * u, sy, 34 * u, 0.75);
    }
    // Two glints chase each other round the inner frame line.
    const b = F.bw, pw = W - b * 2, ph = H - b * 2, per = 2 * (pw + ph);
    const at = (d) => { d = ((d % per) + per) % per; if (d < pw) return [b + d, b]; d -= pw; if (d < ph) return [b + pw, b + d]; d -= ph; if (d < pw) return [b + pw - d, b + ph]; d -= pw; return [b, b + ph - d]; };
    for (let n = 0; n < 2; n++) { const [x, y] = at(t * 340 * u + n * per / 2); bead(x, y, 40 * u, 0.8); }
    ctx.restore();
  }

  // Each scene sits at a slightly different place on the window; the glass pans between them.
  const panFor = (i) => [Math.cos(i * 2.1 + 0.4) * 0.75, Math.sin(i * 1.7 + 0.9) * 0.65];
  function drawField(ctx, S, th, t, info) {
    const { W, H, u } = S;
    const Bd = buildBorder(S, th);
    const idx = Math.max(0, info ? info.index : 0);
    const local = info ? info.local : t;
    const change = info ? info.change : 0.45;
    const gpan = idx > 0 ? eio(seg(local, -0.05, change * 1.8)) : 1;
    const P0 = panFor(idx - 1), P1 = panFor(idx);
    const px = (P0[0] + (P1[0] - P0[0]) * gpan + 0.12 * Math.sin(t * 0.21)) * Bd.M * 0.85;
    const py = (P0[1] + (P1[1] - P0[1]) * gpan + 0.1 * Math.cos(t * 0.17)) * Bd.M * 0.85;
    // Which scene's glass, and whether a change is turning the cells from one pattern to the next.
    let idA = null, idB = "title", kf = -1;
    if (info) {
      const Ls = shownList(), c = info.change || 0.45;
      let cur = Ls.findIndex((s) => t >= s.start && t < s.start + s.hold);
      if (cur < 0) cur = Ls.length - 1;
      idB = Ls[cur] ? Ls[cur].id : "title";
      for (let i = 1; i < Ls.length; i++) {
        const s0 = Ls[i].start - c * 0.6;
        if (t >= s0 && t < s0 + c * 2.1) { kf = (t - s0) / (c * 2.1); idA = Ls[i - 1].id; idB = Ls[i].id; break; }
      }
    }
    const FB = buildField(S, th, KIND[idB] || "diamond");
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save();
    ctx.beginPath(); ctx.rect(Bd.bw * 0.5, Bd.bw * 0.5, W - Bd.bw, H - Bd.bw); ctx.clip();
    if (kf < 0) windowLayer(ctx, S, th, FB, info ? tintOf(th, idB) : null, t, px, py);
    else {
      const FA = buildField(S, th, KIND[idA] || "diamond");
      windowLayer(ctx, S, th, FA, tintOf(th, idA), t, px, py);
      // The incoming pattern takes over cell by cell, left to right with a jitter, each cell flashing.
      const ox = -FB.M + px, oy = -FB.M + py;
      const turned = [], front = [];
      for (const q of FB.cells) {
        const sx = q.cx + ox, sy = q.cy + oy;
        if (sx < -q.r || sx > W + q.r || sy < -q.r || sy > H + q.r) continue;
        const e = clamp((kf - clamp((sx / W) * 0.66 + q.hc * 0.34) * 0.5) / 0.5);
        if (e >= 0.45) turned.push(q);
        const fl = 0.5 * bump(e - 0.5, 0.07);
        if (fl > 0.02) front.push([q, fl]);
      }
      if (turned.length) {
        ctx.save();
        ctx.save(); ctx.translate(ox, oy); ctx.beginPath(); for (const q of turned) q.path(ctx); ctx.restore();
        ctx.clip();
        windowLayer(ctx, S, th, FB, tintOf(th, idB), t, px, py);
        ctx.restore();
      }
      ctx.save(); ctx.translate(ox, oy); ctx.globalCompositeOperation = "screen";
      for (const [q, fl] of front) { ctx.beginPath(); q.path(ctx); ctx.fillStyle = rgba(th.ray, Math.min(0.8, fl * 0.6)); ctx.fill(); }
      ctx.restore();
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(Bd.bC, 0, 0);
    ctx.drawImage(Bd.bL, 0, 0);
    cameGlints(ctx, S, th, Bd, t, px, py);
    // Shafts of light in the hall and dust turning in them.
    ctx.globalCompositeOperation = "screen";
    for (let k = 0; k < 3; k++) {
      const x0 = (((t * 0.012 + k * 0.31) % 1.1) - 0.05) * W, wdt = (140 + k * 70) * u;
      const a = (th.light ? 0.05 : 0.075) * (0.7 + 0.3 * Math.sin(t * 0.7 + k * 2));
      ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 + wdt, 0); ctx.lineTo(x0 + wdt + H * 0.55, H); ctx.lineTo(x0 + H * 0.55 - wdt * 0.4, H); ctx.closePath();
      const gr = ctx.createLinearGradient(x0, 0, x0 + H * 0.3, H);
      gr.addColorStop(0, rgba(th.ray, a)); gr.addColorStop(1, rgba(th.ray, 0));
      ctx.fillStyle = gr; ctx.fill();
    }
    for (let i = 0; i < 46; i++) {
      const x = ((h1(i) * W + t * (8 + h1(i + 3) * 14) * u) % W + W) % W;
      const y = ((h1(i + 7) * H + t * (5 + h1(i + 9) * 10) * u + Math.sin(t * 0.6 + i) * 14 * u) % H + H) % H;
      const s = (1.3 + h1(i + 11) * 2.4) * u, tw = 0.5 + 0.5 * Math.sin(t * (1.5 + h1(i) * 2) + i);
      ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fillStyle = rgba(th.ray, (0.18 + 0.4 * tw) * (th.light ? 0.6 : 1)); ctx.fill();
    }
    ctx.restore();
  }
  // Finishing pass: light blooming off the bright glass, a warm vignette and a fine grain.
  function finishFrame(ctx, S, th, t) {
    const { W, H, u } = S;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const sm = buf("bloom", W / 8, H / 8), g = sm.getContext("2d");
    g.clearRect(0, 0, sm.width, sm.height);
    g.filter = "blur(3px)";
    g.drawImage(ctx.canvas, 0, 0, W, H, 0, 0, sm.width, sm.height);
    g.filter = "none";
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = th.light ? 0.16 : 0.3;
    ctx.drawImage(sm, 0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, `rgba(12,6,2,${th.light ? 0.22 : 0.45})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    if (th.tex > 0) {
      const f = Math.floor(t * 12), r = rng(f * 7919 + 5);
      ctx.translate(-r() * 192, -r() * 192);
      ctx.globalCompositeOperation = "overlay";
      ctx.globalAlpha = 0.06 * th.tex;
      ctx.fillStyle = ctx.createPattern(noise(), "repeat");
      ctx.fillRect(0, 0, W + 192, H + 192);
    }
    ctx.restore();
  }

  // ---- rose window -------------------------------------------------------------------------------
  // Petals radiate from a jewelled boss; a ring of roundels and a segmented rim close it. Light runs
  // round the petals continuously. `seal` sets a gold check in the boss (the closing).
  function rose(ctx, S, th, cx, cy, R, local, t, o = {}) {
    const u = S.u, list = [];
    const np = o.petals || 10;
    const spin = t * 0.9;
    const lightAt = (a, dist) => {
      const arrive = eo(seg(local - (o.delay || 0), dist * 0.7, dist * 0.7 + 0.45));
      const chase = 0.5 + 0.5 * Math.cos(a - spin);
      // A sweep of sun round the rose, and pulses of light running out from the boss to the rim.
      const ripple = Math.pow(0.5 + 0.5 * Math.sin(t * 2.6 - dist * 7), 5);
      return { L: arrive, hot: (0.45 * Math.pow(chase, 6) + 0.3 * ripple) * arrive };
    };
    const add = (shape, col, seed, a, dist) => { const lt = lightAt(a, dist); list.push(piece(shape, col, seed, { L: 0.22 + 0.78 * lt.L, hot: lt.hot })); };
    const r0 = R * 0.2, r1 = R * 0.62, r2 = R * 0.84;
    for (let i = 0; i < np; i++) {
      const a = (i / np) * TAU - Math.PI / 2, da = TAU / np;
      const tip = [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1];
      const bl = [cx + Math.cos(a - da * 0.36) * r0 * 1.05, cy + Math.sin(a - da * 0.36) * r0 * 1.05];
      const br = [cx + Math.cos(a + da * 0.36) * r0 * 1.05, cy + Math.sin(a + da * 0.36) * r0 * 1.05];
      const ml = [cx + Math.cos(a - da * 0.3) * r1 * 0.66, cy + Math.sin(a - da * 0.3) * r1 * 0.66];
      const mr = [cx + Math.cos(a + da * 0.3) * r1 * 0.66, cy + Math.sin(a + da * 0.3) * r1 * 0.66];
      const mc = [cx + Math.cos(a) * r1 * 0.5, cy + Math.sin(a) * r1 * 0.5];
      const pcol = i % 2 ? th.ruby : th.azure;
      add(poly([bl, ml, mc]), mul(pcol, 0.95), 4000 + i * 3, a, 0.3);
      add(poly([br, mc, mr]), mul(pcol, 0.82), 4001 + i * 3, a, 0.3);
      add(poly([mc, ml, tip, mr]), mix(pcol, WHITE, 0.08), 4002 + i * 3, a, 0.45);
      // Spandrel between petals, out to the roundel ring.
      const a2 = a + da / 2;
      add(poly([mr, tip, [cx + Math.cos(a2) * r2, cy + Math.sin(a2) * r2], [cx + Math.cos(a2 - da * 0.05) * r1 * 0.72, cy + Math.sin(a2 - da * 0.05) * r1 * 0.72]]), th.violet, 4100 + i * 2, a2, 0.55);
      const nx = [cx + Math.cos(a + da) * r1, cy + Math.sin(a + da) * r1];
      const nml = [cx + Math.cos(a + da - da * 0.3) * r1 * 0.66, cy + Math.sin(a + da - da * 0.3) * r1 * 0.66];
      add(poly([[cx + Math.cos(a2) * r2, cy + Math.sin(a2) * r2], nx, nml, [cx + Math.cos(a2 + da * 0.05) * r1 * 0.72, cy + Math.sin(a2 + da * 0.05) * r1 * 0.72]]), mul(th.violet, 0.85), 4101 + i * 2, a2, 0.55);
      // Wedge between tip and ring.
      add(sector(cx, cy, r1, r2, a - da * 0.5 + 0.001, a + da * 0.5 - 0.001), mix(th.emerald, th.azure, 0.3 * (i % 2)), 4200 + i, a, 0.65);
    }
    const nr = np * 2;
    for (let i = 0; i < nr; i++) {
      const a = (i / nr) * TAU - Math.PI / 2, da = TAU / nr;
      add(sector(cx, cy, r2, R, a, a + da), i % 2 ? th.amber : th.ruby, 4300 + i, a + da / 2, 0.8);
      list[list.length - 1].hot += 0.45 * bump((((t * 0.55 - i / nr) % 1) + 1) % 1 - 0.5, 0.045);
    }
    for (let i = 0; i < np; i++) {
      const a = (i / np) * TAU - Math.PI / 2;
      add(circle(cx + Math.cos(a) * (r1 + r2) / 2, cy + Math.sin(a) * (r1 + r2) / 2, (r2 - r1) * 0.36), th.amber, 4400 + i, a, 0.7);
    }
    add(circle(cx, cy, r0), o.seal ? th.ruby : th.amber, 4500, spin, 0.05);
    // Behind it all, a disc of dark glass so the gaps between shapes read as glass too.
    const disc = piece(circle(cx, cy, R), mul(th.azure, 0.55), 4600, { L: eo(seg(local - (o.delay || 0), 0, 0.5)) * 0.7 });
    ctx.save();
    const halo = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.5);
    halo.addColorStop(0, rgba(mix(th.amber, WHITE, 0.3), (th.light ? 0.18 : 0.28) * eo(seg(local, 0.2, 1)) * (0.85 + 0.15 * Math.sin(t * 1.4))));
    halo.addColorStop(1, rgba(th.amber, 0));
    ctx.fillStyle = halo; ctx.globalCompositeOperation = th.light ? "source-over" : "screen";
    ctx.fillRect(cx - R * 1.6, cy - R * 1.6, R * 3.2, R * 3.2);
    ctx.restore();
    glaze(ctx, S, th, [disc], 7);
    glaze(ctx, S, th, list, Math.max(4, R / 60));
    if (o.seal) {
      const q = back(seg(local, 0.5, 1.0));
      if (q > 0) {
        const s = r0 * 0.75 * q;
        const ck = piece(poly([[cx - s * 0.95, cy - s * 0.05], [cx - s * 0.55, cy - s * 0.42], [cx - s * 0.18, cy + s * 0.02], [cx + s * 0.62, cy - s * 0.78], [cx + s * 0.98, cy - s * 0.4], [cx - s * 0.18, cy + s * 0.75]]), th.plaque, 4700, { L: 1, hot: 0.25 + 0.2 * Math.sin(t * 3) });
        glaze(ctx, S, th, [ck], 5);
      }
    }
  }

  // A row of small pointed lights on a jewelled sill: each light has two panes and a roundel in its head.
  // A wave of sun runs along the row and the roundels pulse in turn.
  function sillArcade(ctx, S, th, x, y, w, h, local, t) {
    const u = S.u;
    const baseH = Math.min(30 * u, h * 0.2), lh = h - baseH - 8 * u;
    const N = Math.max(5, Math.round(w / (150 * u))), lw = w / N, pad = Math.min(14 * u, lw * 0.1);
    const cols = [th.ruby, th.azure, th.emerald, th.violet, th.amber];
    const lights = [], heads = [], base = [];
    for (let i = 0; i < N; i++) {
      const x0 = x + i * lw + pad, ww = lw - pad * 2, cx = x0 + ww / 2, rise = Math.min(ww * 0.75, lh * 0.55);
      const order = i / N;
      const L = 0.2 + 0.8 * eo(seg(local, 0.15 + order * 0.5, 0.45 + order * 0.5));
      const wave = 0.5 * bump(((((t * 0.5 - order) % 1) + 1) % 1) - 0.5, 0.08);
      const col = cols[i % cols.length], col2 = cols[(i + 2) % cols.length];
      const sp = [x0, y + rise], ap = [cx, y], ep = [x0 + ww, y + rise];
      const left = [sp, ...qpts(sp, [x0, y + rise * 0.3], ap, 8).slice(1), [cx, y + rise]];
      const right = [ap, ...qpts(ap, [x0 + ww, y + rise * 0.3], ep, 8).slice(1), [cx, y + rise]];
      lights.push(piece(poly(left), mul(col2, 0.9), 5800 + i * 6, { L, hot: wave }));
      lights.push(piece(poly(right), mul(col2, 0.8), 5801 + i * 6, { L, hot: wave }));
      lights.push(piece(poly([[x0, y + rise], [cx, y + rise], [cx, y + lh], [x0, y + lh]]), col, 5802 + i * 6, { L, hot: wave }));
      lights.push(piece(poly([[cx, y + rise], [x0 + ww, y + rise], [x0 + ww, y + lh], [cx, y + lh]]), mix(col, WHITE, 0.1), 5803 + i * 6, { L, hot: wave }));
      const beat = 0.5 * bump(((((t * 0.8 - i * 0.37) % 2.2) + 2.2) % 2.2) - 0.4, 0.14);
      heads.push(piece(circle(cx, y + rise * 0.62, Math.min(ww * 0.17, rise * 0.24)), th.amber, 5805 + i * 6, { L, hot: beat * L }));
      const bx0 = x + i * lw, by0 = y + lh + 8 * u;
      base.push(piece(poly([[bx0, by0], [bx0 + lw / 2, by0], [bx0 + lw / 2, by0 + baseH], [bx0, by0 + baseH]]), th.amber, 5880 + i * 2, { L, hot: wave * 0.6 }));
      base.push(piece(poly([[bx0 + lw / 2, by0], [bx0 + lw, by0], [bx0 + lw, by0 + baseH], [bx0 + lw / 2, by0 + baseH]]), th.ruby, 5881 + i * 2, { L, hot: wave * 0.6 }));
    }
    glaze(ctx, S, th, lights, 6);
    glaze(ctx, S, th, heads, 4);
    glaze(ctx, S, th, base, 5);
  }

  // ---- statements (title and closing) -------------------------------------------------------------
  const MEASURE = {};
  function measureStatement(S, id) {
    const el = document.getElementById(id);
    if (!el) return null;
    const key = id + "|" + el.textContent + "|" + el.style.fontSize + "|" + S.W + "|" + S.H;
    if (MEASURE[key]) return MEASURE[key];
    const c = buf("measure", 4, 4).getContext("2d");
    const size = parseFloat(el.style.fontSize) || 110 * S.u;
    const maxW = el.clientWidth || parseFloat(el.style.width) || S.W * 0.8;
    c.font = font(S, size, S.look.displayWeight, "display");
    const words = String(el.textContent).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (const w of words) { const next = line ? line + " " + w : w; if (line && c.measureText(next).width > maxW) { lines.push(line); line = w; } else line = next; }
    if (line) lines.push(line);
    let wMax = Math.max(1, ...lines.map((l) => c.measureText(l).width));
    let hC = lines.length * size * 1.04;
    // Prefer the laid-out lines (wrapping may be balanced): widest line box, in layout pixels.
    let exact = false;
    try {
      const bb = el.getBoundingClientRect(), sc = el.offsetWidth ? bb.width / el.offsetWidth : 0;
      if (sc > 0 && el.firstChild) {
        const rg = document.createRange(); rg.selectNodeContents(el);
        const rows = {};
        for (const r of rg.getClientRects()) { if (r.width < 1) continue; const k = Math.round(r.top / (size * sc * 0.5)); rows[k] = rows[k] || [1e9, -1e9]; rows[k][0] = Math.min(rows[k][0], r.left); rows[k][1] = Math.max(rows[k][1], r.right); }
        const ws = Object.values(rows).map(([a, b]) => (b - a) / sc);
        if (ws.length) { wMax = Math.max(...ws); hC = el.offsetHeight || hC; exact = true; }
      }
    } catch (e) { exact = false; }
    if (id === "title") {
      const k = document.getElementById("kicker");
      if (k && k.textContent) {
        const ks = parseFloat(k.style.fontSize) || 30 * S.u;
        c.font = font(S, ks, 600, "body");
        const kw = (exact && k.offsetWidth && k.offsetWidth < S.W * 0.9) ? k.offsetWidth : c.measureText(k.textContent.toUpperCase()).width + k.textContent.length * ks * 0.14 + ks * 2.4;
        hC += (exact && k.offsetHeight ? k.offsetHeight : ks * 2.1) + (parseFloat(k.style.marginBottom) || 24 * S.u);
        wMax = Math.max(wMax, kw);
      }
    }
    const side = parseFloat(el.parentElement && el.parentElement.style.paddingLeft) || 140 * S.u;
    const R = { x: side, y: (S.H - hC) / 2, w: wMax, h: hC, size };
    if (exact) MEASURE[key] = R;
    return R;
  }

  // `o.pre` runs the ornament (roses and sill) ahead of the words; `o.transR`/`o.transP` give the ornament
  // and the inscription panel their own changes, and `o.only` draws just the ornament.
  function statement(ctx, S, th, info, o = {}) {
    const { W, H, u, tall } = S;
    const t = info.t, local = info.local + (o.pre || 0), localP = info.local;
    if (o.transR !== undefined) FR.trans = o.transR;
    const R = measureStatement(S, info.scene);
    if (!R) return;
    const closing = info.scene === "closing";
    const padX = 60 * u, padY = 46 * u;
    const P = { x: R.x - padX, y: R.y - padY, w: Math.min(W - (R.x - padX) * 2, R.w + padX * 2), h: R.h + padY * 2 };
    // Ornament first, then the inscription panel the words sit on.
    const roomR = W - (P.x + P.w) - 70 * u;
    const roses = [];
    if (!tall && roomR > 330 * u) {
      const rr = Math.min(roomR / 2 - 20 * u, H * 0.37);
      roses.push([P.x + P.w + 40 * u + roomR / 2, H / 2, rr]);
    } else {
      const topH = P.y - 70 * u, botH = H - (P.y + P.h) - 70 * u;
      if (topH > 260 * u) { const rr = Math.min(topH * 0.46, W * 0.36); roses.push([W / 2, P.y - 30 * u - rr, rr]); }
      if (botH > 260 * u) {
        const rr = Math.min(botH * 0.36, W * 0.2);
        const n = tall ? 2 : Math.max(2, Math.floor(W / (rr * 3.2)));
        for (let i = 0; i < n; i++) roses.push([W * (i + 0.5) / n, P.y + P.h + 40 * u + rr, rr, true]);
      }
    }
    roses.forEach(([x, y, rr, small], i) => {
      if (closing && i === 0) {
        // Light breaks out from the sealed rose.
        ctx.save(); ctx.globalCompositeOperation = th.light ? "source-over" : "screen";
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * TAU + t * 0.55, len = rr * (1.9 + 0.35 * Math.sin(t * 2.4 + k * 1.7));
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a - 0.07) * len, y + Math.sin(a - 0.07) * len); ctx.lineTo(x + Math.cos(a + 0.07) * len, y + Math.sin(a + 0.07) * len); ctx.closePath();
          const gr = ctx.createRadialGradient(x, y, rr * 0.4, x, y, len);
          gr.addColorStop(0, rgba(mix(th.amber, WHITE, 0.4), (0.2 + 0.1 * Math.sin(t * 3.1 + k * 2.3)) * eo(seg(local, 0.4, 1.2)))); gr.addColorStop(1, rgba(th.amber, 0));
          ctx.fillStyle = gr; ctx.fill();
        }
        ctx.restore();
      }
      rose(ctx, S, th, x, y, rr, local, t + i * 0.7, { seal: closing && i === 0, petals: small ? 8 : 10, delay: small ? 0.15 + i * 0.08 : 0.05 });
    });
    // Under them a sill of small lights, so the frame reads as one complete window down to its base.
    if (!tall) {
      const roseBot = roses.reduce((m, [, y, rr]) => Math.max(m, y + rr), 0);
      const fb = FIELD ? FIELD.bw : 44 * u;
      const top = Math.max(P.y + P.h + 24 * u, roseBot) + 34 * u, bot = H - fb - 18 * u;
      if (bot - top > 90 * u) sillArcade(ctx, S, th, fb + 26 * u, top, W - (fb + 26 * u) * 2, bot - top, local, t);
    }
    if (o.only) return;
    if (o.transP !== undefined) FR.trans = o.transP;
    // Inscription panel: a few large panes of deep glass inside a jewelled fillet.
    const list = [];
    const r = rng(closing ? 77 : 55);
    const rows = Math.max(2, Math.round(P.h / (150 * u)));
    for (let j = 0; j < rows; j++) {
      const y0 = P.y + (P.h * j) / rows, y1 = P.y + (P.h * (j + 1)) / rows;
      const cols = Math.max(2, Math.round(P.w / (320 * u)));
      let xa = P.x, xb = P.x;
      for (let i = 0; i < cols; i++) {
        const last = i === cols - 1;
        const na = last ? P.x + P.w : P.x + (P.w * (i + 1)) / cols + (r() - 0.5) * 80 * u;
        const nb = last ? P.x + P.w : na + (r() - 0.5) * 120 * u;
        const col = mul(th.panel[(i + j) % th.panel.length], 0.92 + r() * 0.16);
        const pc = piece(poly([[xa, y0], [na, y0], [nb, y1], [xb, y1]]), col, 5000 + j * 20 + i);
        pc.L = (0.62 + 0.3 * eo(seg(localP, 0.05 + (i / cols) * 0.3, 0.45 + (i / cols) * 0.3))) * (th.light ? 1 : 0.92);
        pc.hot = 0.16 * bump(((((t * 0.36 - (i + j * 0.5) / cols * 0.45) % 1.5) + 1.5) % 1.5) - 0.6, 0.12);
        list.push(pc);
        xa = na; xb = nb;
      }
    }
    const f = 24 * u;
    const ring = [];
    const perim = (x0, y0, x1, y1, n, k0) => {
      for (let i = 0; i < n; i++) {
        const ax = x0 + ((x1 - x0) * i) / n, ay = y0 + ((y1 - y0) * i) / n, bx = x0 + ((x1 - x0) * (i + 1)) / n, by = y0 + ((y1 - y0) * (i + 1)) / n;
        const horiz = Math.abs(y1 - y0) < 1;
        const pts = horiz ? [[ax, ay], [bx, by], [bx, by + f], [ax, ay + f]] : [[ax, ay], [ax + f, ay], [bx + f, by], [bx, by]];
        ring.push(piece(poly(pts), (i + k0) % 2 ? th.ruby : th.amber, 5600 + ring.length, { k: ring.length }));
      }
    };
    const nH = Math.max(6, Math.round((P.w + f * 2) / (64 * u))), nV = Math.max(3, Math.round(P.h / (64 * u)));
    perim(P.x - f, P.y - f, P.x + P.w + f, P.y - f, nH, 0);
    perim(P.x - f, P.y + P.h, P.x + P.w + f, P.y + P.h, nH, 1);
    perim(P.x - f, P.y, P.x - f, P.y + P.h, nV, 1);
    perim(P.x + P.w, P.y, P.x + P.w, P.y + P.h, nV, 0);
    const total = ring.length;
    ring.forEach((pc, i) => {
      pc.L = eo(seg(localP, 0.05 + (i / total) * 0.4, 0.3 + (i / total) * 0.4));
      const chase = ((t * 0.5 - i / total) % 1 + 1) % 1;
      pc.hot = 0.4 * bump(chase - 0.5, 0.04) * pc.L;
    });
    glaze(ctx, S, th, list, 7);
    glaze(ctx, S, th, ring, 5);
  }

  // ---- scene areas, transitions and frame finishing ------------------------------------------------
  function area(S, box) {
    const u = S.u;
    // The bottom keeps the same inset from the window's lead as the headline keeps from the top.
    return S.tall ? { x: box.x - 20 * u, y: box.y - 40 * u, w: box.w + 40 * u, h: Math.min(box.h + 90 * u, S.H - 120 * u - (box.y - 40 * u)) }
      : { x: box.x - 30 * u, y: box.y - 30 * u, w: box.w + 60 * u, h: Math.min(box.h + 74 * u, S.H - 104 * u - (box.y - 30 * u)) };
  }
  function wrap(fn, id) {
    return (ctx, S, box, p, d, info) => {
      const th = theme(S);
      const leaving = info.exit !== undefined;
      FR.t = info.t; FR.local = info.local; FR.W = S.W; FR.H = S.H;
      const A = area(S, box);
      // Into the closing the panel starts going dark with its headline (the last `change` of its hold) and
      // is gone just after the cut, before the big words wipe across where it was.
      const list = shownList(), at = list.findIndex((sc) => sc.id === FR.scene);
      const toClosing = leaving ? FR.scene === "closing" : Boolean(list[at + 1] && list[at + 1].id === "closing");
      // Every panel starts going dark with its headline (the last `change` of its hold), so the next
      // headline never lands over a lit drawing; the remainder burns out just after the cut.
      const hasNext = Boolean(list[at + 1]);
      const early = !leaving && hasNext && info.local > info.hold - info.change * 0.75;
      // The last panel of a film stays lit to the end, still glinting and pushing in.
      const endOut = false;
      const k0 = toClosing ? 0.6 : 0.45;
      const c = Math.max(0.01, info.change);
      // Into the closing the drawing stays through the whole change, so the closing's roses (already
      // glazing underneath) and its panel take over without a bare window between them.
      FR.trans = leaving ? { mode: "out", k: k0 + (1 - k0) * clamp(info.exit * (toClosing ? 1.05 : 1.4)), A }
        : early ? { mode: "out", k: k0 * clamp((info.local - (info.hold - c * 0.75)) / (c * 0.75)), A }
        : endOut ? { mode: "out", k: clamp((info.local - (info.hold - 1.15)) / 0.6), A }
        : FR.idx > 0 && info.local < c * 1.5 ? { mode: "in", k: clamp((info.local + c * 0.05) / (c * 1.05)), A } : null;
      ctx.save();
      // A slow push towards the glass through every hold.
      const push = 1 + 0.03 * clamp(info.local / Math.max(1, info.hold));
      const ox = S.W / 2, oy = A.y + A.h / 2;
      ctx.translate(ox, oy); ctx.scale(push, push); ctx.translate(-ox, -oy);
      // The first panel of a film opens already part-glazed, so frame one is never a bare window.
      const lead = FR.idx === 0 ? 0.55 : 0.18;
      const build = leaving ? 1 : clamp((info.local + lead) / Math.max(0.8, info.hold * 0.48));
      // Hold progress (0 at the cut, 1 at the next): staged sequences run across the whole hold.
      FR.hp = leaving ? 1 : clamp(info.local / Math.max(0.5, info.hold - c * 0.75));
      FR.hold = info.hold;
      tracery(ctx, S, th, A, FR.hp, info.t, id, leaving ? info.hold + 1 : info.local);
      fn(ctx, S, th, A, build, d, info.t, info.local);
      ctx.restore();
      FR.trans = null;
      if (!leaving) finishFrame(ctx, S, th, info.t);
    };
  }
  // A small lit tracery light in the window's head beside the headline, so the upper corner is glass
  // too. Its pattern differs per scene and it keeps turning through the hold.
  const TRACERY = { chart: 8, object: 6, people: 12, process: 6, compare: 8 };
  function tracery(ctx, S, th, A, hp, t, scene, local) {
    const u = S.u, W = S.W;
    if (S.tall) return;
    const el = document.getElementById(scene + "-title"), root = document.getElementById("root");
    let right = W * 0.62;
    try {
      if (el && root) {
        const r = el.getBoundingClientRect(), rr = root.getBoundingClientRect(), sc = rr.width / W;
        if (sc > 0 && r.width > 0) right = (r.right - rr.left) / sc;
      }
    } catch (e) { right = W * 0.62; }
    const fb = FIELD ? FIELD.bw : 44 * u;
    const R = Math.min(150 * u, (A.y - fb) * 0.5 - 6 * u, (W - fb - 40 * u - right) / 2 - 30 * u);
    if (R < 70 * u) return;
    const cx = W - fb - 50 * u - R, cy = fb + (A.y - fb) * 0.5 + 6 * u;
    rose(ctx, S, th, cx, cy, R, local, t * 0.8 + 1.3, { petals: TRACERY[scene] || 8, delay: 0.1 });
  }
  // Light per piece in a staggered build: order 0 lights first, 1 last.
  const litBy = (p, order, spread = 0.6) => eo(seg(p, order * spread, order * spread + (1 - spread)));

  // ---- chart: lancet columns that fill with light to their value ------------------------------------
  function chartScene(ctx, S, th, A0, p, d, t) {
    const u = S.u, tall = S.tall;
    const roundel = !tall && A0.w > A0.h * 1.4;
    const A = roundel ? { x: A0.x, y: A0.y, w: A0.w * 0.72, h: A0.h } : A0;
    const vals = d.values.map((v) => Math.max(0, Number(v) || 0));
    const max = Math.max(1e-6, ...vals);
    const hiIdx = Number.isFinite(d.highlight) ? clamp(d.highlight, 0, 3) : 3;
    const n = vals.length, slot = A.w / n;
    // The lancets are glazed one after another across the whole hold.
    const growOf = (i) => eo(seg(FR.hp, 0.03 + i * 0.19, 0.3 + i * 0.19));
    const cw = Math.min(slot * (tall ? 0.6 : 0.5), 230 * u);
    const labelH = 96 * u, numH = (tall ? 150 : 140) * u;
    const baseY = A.y + A.h - labelH, topY = A.y + numH;
    // The sill: a strip of small panes under the columns.
    const sill = [];
    const sh = 22 * u, nS = Math.round(A.w / (46 * u));
    for (let i = 0; i < nS; i++) sill.push(piece(poly([[A.x + (A.w * i) / nS, baseY], [A.x + (A.w * (i + 1)) / nS, baseY], [A.x + (A.w * (i + 1)) / nS, baseY + sh], [A.x + (A.w * i) / nS, baseY + sh]]), i % 2 ? th.amber : th.emerald, 6000 + i, { L: litBy(p, i / nS, 0.5) }));
    glaze(ctx, S, th, sill, 5);
    if (roundel) {
      // The week's total in a rose roundel at the right, its petals turning with the light.
      const rx = A0.x + A0.w * 0.865, R = Math.min(A0.w * 0.115, A0.h * 0.3), ry = A0.y + A0.h * 0.08 + R;
      // The total counts up as each lancet is glazed, and the rose flares at every addition.
      const total = vals.reduce((a, b, i) => a + b * growOf(i), 0);
      const flare = vals.reduce((a, b, i) => a + bump(FR.hp - (0.3 + i * 0.19), 0.04), 0);
      const ref = d.values.every((v) => Number.isInteger(Number(v))) ? 1 : 0.5;
      rose(ctx, S, th, rx, ry, R, p * 3.2, t, { petals: 8, delay: 0.25 });
      plaque(ctx, S, th, fmt(total, ref, d.suffix), rx, ry, 100 * u, { q: seg(p, 0.12, 0.3), maxW: R * 1.9, min: 80 * u, seed: 6290, color: th.acc, hot: 0.1 * (0.5 + 0.5 * Math.sin(t * 2.1)) + 0.5 * flare });
      banderole(ctx, S, th, "Total", rx, ry + R + 70 * u, 46 * u, { q: seg(p, 0.15, 0.35), maxW: A0.w * 0.26, seed: 6295 });
    }
    // A slow sun sweeps across the row of lancets every few seconds, lighting each in turn.
    const sweep = ((t * 0.42) % 1.4) - 0.2;
    const colMax = baseY - topY;
    for (let i = 0; i < n; i++) {
      const cx = A.x + slot * (i + 0.5), x = cx - cw / 2;
      const hot = i === hiIdx;
      const grow = growOf(i);
      const done = bump(FR.hp - (0.3 + i * 0.19), 0.04);
      // Each window is as tall as its value; it rises out of the sill as it is glazed.
      const hFull = Math.max(colMax * (vals[i] / max), cw * 0.62);
      const hNow = hFull * (0.3 + 0.7 * grow);
      const top = baseY - hNow;
      const rise = Math.min(cw * 0.8, hFull * 0.4, hNow);
      const rowH = cw * 0.38;
      const pieces = [];
      const cool = [th.azure, mix(th.azure, th.violet, 0.5), mix(th.azure, th.emerald, 0.55), th.violet][i % 4];
      const base = hot ? th.acc : cool;
      const alt = hot ? th.amber : th.field[(i + 1) % th.field.length];
      if (hNow > 4 * u) {
        let row = 0;
        for (let yb = baseY; yb > top + rise + 1; yb -= rowH, row++) {
          const yt = Math.max(top + rise, yb - rowH);
          const sg = row % 2 ? 1 : -1;
          const xa = x + cw * (0.5 + 0.2 * sg), xb = x + cw * (0.5 - 0.2 * sg);
          pieces.push(piece(poly([[x, yt], [xa, yt], [xb, yb], [x, yb]]), mix(base, alt, h1(i * 50 + row) * 0.35), 6100 + i * 60 + row * 2));
          pieces.push(piece(poly([[xa, yt], [x + cw, yt], [x + cw, yb], [xb, yb]]), mix(base, alt, h1(i * 50 + row + 0.5) * 0.35), 6101 + i * 60 + row * 2));
        }
        const sp = [x, top + rise], ap = [cx, top], ep = [x + cw, top + rise];
        pieces.push(piece(poly([sp, ...qpts(sp, [x, top + rise * 0.3], ap, 10).slice(1), [cx, top + rise]]), mix(base, alt, 0.2), 6150 + i * 60));
        pieces.push(piece(poly([ap, ...qpts(ap, [x + cw, top + rise * 0.3], ep, 10).slice(1), [cx, top + rise]]), mix(base, alt, 0.1), 6151 + i * 60));
        // Lit as it rises; then a band of sun keeps climbing each window in turn through the hold.
        const phase = (((t * 0.5 + i * 0.27) % 1.5) + 1.5) % 1.5 - 0.2;
        for (const pc of pieces) {
          const rf = (baseY - pc.cy) / Math.max(1, hNow);
          pc.L = 0.4 + 0.6 * clamp(grow * 1.3 - rf * 0.3);
          pc.hot = (0.34 * bump(phase - rf, 0.13) + 0.42 * bump(sweep - (i + 0.5) / n, 0.13)) * grow + 0.55 * done + 0.35 * bump(rf - grow * 1.05, 0.08) * (grow < 1 ? 1 : 0);
        }
        glaze(ctx, S, th, pieces, 6);
        // The oculus in the arch: a jewel that lights when the window is full, and pulses on the highlight.
        const oc = piece(circle(cx, top + rise * 0.6, Math.min(cw * 0.14, rise * 0.26)), hot ? th.amber : th.ruby, 6190 + i, { L: 0.15 + 0.85 * seg(grow, 0.85, 1), hot: (hot ? 0.3 : 0.15) * (0.5 + 0.5 * Math.sin(t * 3 + i)) * grow });
        glaze(ctx, S, th, [oc], 5);
      }
      // Light rising inside the lit glass of the highlighted window.
      if (hot && hNow > 20 * u) {
        ctx.save(); ctx.globalCompositeOperation = "screen";
        for (let k = 0; k < 9; k++) {
          const ph = ((t * 0.35 + h1(k + i * 9)) % 1);
          const yy = baseY - (hNow - rise * 0.5) * ph, xx = x + cw * (0.15 + 0.7 * h1(k * 3 + 1)) + Math.sin(t * 2 + k) * 6 * u;
          ctx.beginPath(); ctx.arc(xx, yy, (3 + 3 * h1(k)) * u, 0, TAU); ctx.fillStyle = `rgba(255,248,220,${0.55 * Math.sin(ph * Math.PI) * transAt(xx, yy).v})`; ctx.fill();
        }
        ctx.restore();
      }
      // The value, painted on a plaque above the arch.
      const qv = seg(FR.hp, 0.03 + i * 0.19, 0.08 + i * 0.19);
      plaque(ctx, S, th, fmt(vals[i] * grow, vals[i], d.suffix), cx, Math.min(top, baseY - cw * 0.3) - numH * 0.5, hot ? 100 * u : 74 * u,
        { q: qv, maxW: slot * 0.96, min: hot ? 72 * u : 56 * u, seed: 6300 + i * 10, color: hot ? th.acc : th.amber, hot: (hot ? 0.1 * (0.5 + 0.5 * Math.sin(t * 2.4)) : 0) + 0.4 * done });
      banderole(ctx, S, th, d.labels[i], cx, baseY + sh + (labelH - sh) * 0.52, 46 * u, { q: seg(p, 0.05 + i * 0.05, 0.2 + i * 0.05), maxW: slot * 0.98, seed: 6400 + i });
    }
  }

  // ---- object: a glazed laptop or phone with three callouts ----------------------------------------
  function deviceScreen(S, th, x, y, w, h, p, t, phone) {
    const u = S.u, list = [], anchors = {};
    const picH = h * (phone ? 0.52 : 0.6);
    // Sky in three wavy bands, a sun that travels, two hills.
    const bands = 3;
    for (let i = 0; i < bands; i++) {
      const y0 = y + (picH * 0.7 * i) / bands, y1 = y + (picH * 0.7 * (i + 1)) / bands;
      const wave = (yy, k) => { const pts = []; for (let s = 0; s <= 8; s++) pts.push([x + (w * s) / 8, yy + Math.sin(s * 0.9 + k) * h * 0.012]); return pts; };
      const top = i === 0 ? [[x, y0], [x + w, y0]] : wave(y0, i);
      const bot = wave(y1, i + 1).reverse();
      list.push(piece(poly([...top, ...bot]), mix(th.azure, WHITE, 0.12 + i * 0.12), 7000 + i, { o: 0.3 + i * 0.05 }));
    }
    const sunR = Math.min(w, picH) * 0.12;
    const sx = x + w * (0.22 + 0.56 * (0.5 + 0.5 * Math.sin(t * 0.35))), sy = y + picH * (0.3 - 0.08 * Math.sin(t * 0.35 * 2 + 1));
    const hill = (k, col, seed) => {
      const pts = [[x, y + picH]];
      for (let s = 0; s <= 12; s++) { const f = s / 12; pts.push([x + w * f, y + picH * (0.62 + k * 0.1) - Math.sin(f * Math.PI * (1.2 + k) + k * 2) * picH * 0.13]); }
      pts.push([x + w, y + picH]);
      list.push(piece(poly(pts), col, seed, { o: 0.45 + k * 0.05 }));
    };
    hill(0, mix(th.emerald, th.azure, 0.25), 7010);
    hill(1, th.emerald, 7011);
    anchors.preview = [x + w * 0.5, y + picH * 0.45];
    // Timeline: three tracks of clips; the proposed clip glows.
    const tlY = y + picH, tlH = h - picH;
    list.push(piece(poly([[x, tlY], [x + w, tlY], [x + w, y + h], [x, y + h]]), mul(th.violet, 0.5), 7020, { o: 0.55 }));
    const tr = tlH / 3.4, pad = tr * 0.2;
    const clips = [[[0.03, 0.3, th.azure], [0.34, 0.63, mix(th.azure, th.violet, 0.4)], [0.67, 0.97, th.azure]], [[0.3, 0.7, th.acc]], [[0.03, 0.97, th.emerald]]];
    clips.forEach((row, ri) => {
      const ry = tlY + pad * 1.5 + ri * (tr + pad);
      row.forEach(([a, b, col], ci) => {
        const pc = piece(rrS(x + w * a, ry, w * (b - a), tr, tr * 0.25), col, 7030 + ri * 5 + ci, { o: 0.62 + ri * 0.08 + ci * 0.03 });
        if (ri === 1) { pc.hot = 0.18 + 0.18 * Math.sin(t * 3.2); anchors.proposed = [x + w * (a + b) / 2, ry + tr / 2]; }
        if (ri === 2) {
          anchors.original = [x + w * 0.8, ry + tr / 2];
          const cx0 = x + w * a, cw0 = w * (b - a);
          pc.paint = (c) => {
            c.strokeStyle = rgba(th.matte, 0.55); c.lineWidth = Math.max(1.5, 2.2 * u); c.beginPath();
            for (let s = 0; s < 40; s++) { const xx = cx0 + (cw0 * (s + 0.5)) / 40, amp = tr * 0.32 * (0.3 + 0.7 * Math.abs(Math.sin(s * 1.7 + 0.3) * Math.cos(s * 0.4))); c.moveTo(xx, ry + tr / 2 - amp); c.lineTo(xx, ry + tr / 2 + amp); }
            c.stroke();
          };
        }
        list.push(pc);
      });
    });
    const sun = piece(circle(sx, sy, sunR), th.amber, 7050, { o: 0.4, hot: 0.15 });
    const ph = (t * 0.16 + 0.1) % 1;
    const playX = x + w * (0.04 + 0.92 * ph);
    return { list, sun, anchors, playX, tlY, tlH };
  }
  function objectScene(ctx, S, th, A, p, d, t) {
    const u = S.u, phone = d.kind === "phone", tall = S.tall || (S.H > S.W * 0.8 && !phone);
    let dw, dh, dx, dy;
    if (phone) {
      dh = Math.min(A.h * 0.98, tall ? A.h * 0.62 : A.h);
      dw = dh * 0.52;
      dx = tall ? A.x + (A.w - dw) / 2 : A.x + A.w * 0.3 - dw / 2;
      dy = tall ? A.y : A.y + (A.h - dh) / 2;
    } else {
      dw = tall ? Math.min(A.w * 0.96, (A.h * 0.56) / 0.66) : Math.min(A.w * 0.54, A.h * 1.42);
      dh = dw * 0.66;
      dx = tall ? A.x + (A.w - dw) / 2 : A.x + A.w * 0.03;
      dy = tall ? A.y + 10 * u : A.y + (A.h - dh) / 2 - 10 * u;
    }
    const list = [];
    const bez = phone ? dw * 0.07 : dw * 0.04;
    const scrH = phone ? dh : dh * 0.86;
    const sx = dx + bez, sy = dy + bez, sw = dw - bez * 2, sh = scrH - bez * 2;
    const frameCol = mix(th.violet, th.unlit, 0.35);
    // Bezel as four mitred pieces.
    list.push(piece(poly([[dx, dy], [dx + dw, dy], [sx + sw, sy], [sx, sy]]), mix(frameCol, WHITE, 0.08), 7100, { o: 0 }));
    list.push(piece(poly([[dx + dw, dy], [dx + dw, dy + scrH], [sx + sw, sy + sh], [sx + sw, sy]]), frameCol, 7101, { o: 0.05 }));
    list.push(piece(poly([[dx + dw, dy + scrH], [dx, dy + scrH], [sx, sy + sh], [sx + sw, sy + sh]]), mul(frameCol, 0.85), 7102, { o: 0.1 }));
    list.push(piece(poly([[dx, dy + scrH], [dx, dy], [sx, sy], [sx, sy + sh]]), mul(frameCol, 0.92), 7103, { o: 0.15 }));
    if (!phone) {
      // The deck: a trapezoid with a grid of keys and a trackpad.
      const ky = dy + scrH, kh = dh - scrH, over = dw * 0.06;
      list.push(piece(poly([[dx, ky], [dx + dw, ky], [dx + dw + over, ky + kh], [dx - over, ky + kh]]), mix(frameCol, th.azure, 0.25), 7110, { o: 0.2 }));
      const keys = 12;
      for (let r = 0; r < 2; r++) for (let k = 0; k < keys; k++) {
        const fy0 = ky + kh * (0.18 + r * 0.36), fy1 = fy0 + kh * 0.26;
        const lx = (yy) => dx - over * ((yy - ky) / kh), rx = (yy) => dx + dw + over * ((yy - ky) / kh);
        const ax = lx(fy0) + (rx(fy0) - lx(fy0)) * (0.08 + (0.84 * k) / keys), bx = lx(fy0) + (rx(fy0) - lx(fy0)) * (0.08 + (0.84 * (k + 0.8)) / keys);
        const cx2 = lx(fy1) + (rx(fy1) - lx(fy1)) * (0.08 + (0.84 * k) / keys), dx2 = lx(fy1) + (rx(fy1) - lx(fy1)) * (0.08 + (0.84 * (k + 0.8)) / keys);
        const press = bump(((t * 2.2 + h1(k + r * 13) * 4) % 4) - 0.2, 0.12);
        list.push(piece(poly([[ax, fy0], [bx, fy0], [dx2, fy1], [cx2, fy1]]), mix(th.plaque, th.azure, 0.35), 7120 + r * 20 + k, { o: 0.22 + k * 0.004, hot: 0.35 * press }));
      }
    } else {
      list.push(piece(circle(dx + dw / 2, dy + bez * 0.5, bez * 0.18), th.unlit, 7105, { o: 0 }));
    }
    const scr = deviceScreen(S, th, sx, sy, sw, sh, p, t, phone);
    for (const pc of list) pc.L = 0.32 + 0.68 * litBy(p, pc.o ?? 0.5, 0.5);
    // The window in the screen is glazed piece by piece across the hold: sky, hills, then each clip of
    // the timeline lights in turn, the original track, and last the proposed clip with a flare.
    const hp = FR.hp;
    const START = { 7000: 0.02, 7001: 0.05, 7002: 0.08, 7010: 0.12, 7011: 0.16, 7020: 0.2, 7030: 0.27, 7031: 0.34, 7032: 0.41, 7040: 0.5, 7035: 0.62 };
    for (const pc of scr.list) {
      const st = START[pc.seed] ?? 0.2;
      const lit = eo(seg(hp, st, st + 0.08));
      pc.L = 0.26 + 0.74 * lit;
      pc.hot = (pc.hot || 0) * lit + 0.6 * bump(hp - st - 0.06, 0.04);
    }
    glaze(ctx, S, th, list, 6);
    // The screen: sky, sun and hills share one leading; the sun sits over the sky as its own piece.
    glaze(ctx, S, th, scr.list.slice(0, 3), 5);
    scr.sun.L = 0.3 + 0.7 * eo(seg(hp, 0.1, 0.18));
    glaze(ctx, S, th, [scr.sun], 5);
    glaze(ctx, S, th, scr.list.slice(3), 5);
    // The playhead: a came with a jewel head running over the timeline.
    const qp = eo(seg(hp, 0.68, 0.76));
    if (qp > 0) {
      const tr = transAt(scr.playX, scr.tlY);
      ctx.save(); ctx.globalAlpha *= qp * tr.v;
      ctx.strokeStyle = rgba(th.lead); ctx.lineWidth = 7 * u; ctx.beginPath(); ctx.moveTo(scr.playX, scr.tlY - 4 * u); ctx.lineTo(scr.playX, scr.tlY + scr.tlH - 6 * u); ctx.stroke();
      ctx.strokeStyle = rgba(mix(th.amber, WHITE, 0.3)); ctx.lineWidth = 2.5 * u; ctx.stroke();
      ctx.restore();
      const head = piece(poly([[scr.playX, scr.tlY - 26 * u], [scr.playX + 14 * u, scr.tlY - 8 * u], [scr.playX, scr.tlY + 8 * u], [scr.playX - 14 * u, scr.tlY - 8 * u]]), th.amber, 7190, { L: qp, hot: 0.2 });
      glaze(ctx, S, th, [head], 4);
    }
    // Callouts on banderoles, joined to their parts by lead cames carrying a bead of light.
    const keys = ["preview", "proposed", "original"];
    const labels = d.callouts;
    const z = 46 * u;
    let spots;
    if (tall) {
      const top = phone ? dy + dh + 70 * u : dy + dh + 90 * u;
      const room = A.y + A.h - top;
      spots = [0, 1, 2].map((i) => [A.x + 120 * u, top + (room * (i + 0.5)) / 3, "left"]);
    } else {
      const lx = dx + dw + (phone ? 120 : 110) * u;
      spots = [0, 1, 2].map((i) => [lx, A.y + A.h * (0.2 + i * 0.3), "left"]);
    }
    spots.forEach(([lx, ly, align], i) => {
      const q = seg(hp, [0.16, 0.64, 0.52][i], [0.16, 0.64, 0.52][i] + 0.1);
      if (q <= 0) return;
      const an = scr.anchors[keys[i]];
      const maxW = A.x + A.w - lx;
      ctx.save();
      const b0 = { x: align === "left" ? lx : lx, y: ly };
      // Came path: from the anchor out to the scroll's near end.
      const ex = lx - 30 * u, ey = ly;
      // Wide: a curve out to the scroll. Tall: down the left margin, then across to the scroll.
      const gx = A.x + (34 + 26 * i) * u;
      const route = tall ? [an, [gx, an[1]], [gx, ey], [ex, ey]] : null;
      const mx = (an[0] + ex) / 2 + 40 * u, my = an[1];
      const drawn = eo(q);
      const tr = transAt((an[0] + ex) / 2, (an[1] + ey) / 2);
      ctx.globalAlpha *= tr.v;
      ctx.beginPath(); ctx.moveTo(an[0], an[1]);
      const steps = 24;
      const lens = route ? route.slice(1).map((pp, k) => Math.hypot(pp[0] - route[k][0], pp[1] - route[k][1])) : null;
      const total = lens ? lens.reduce((a, b) => a + b, 0) : 0;
      const pt = (f) => {
        if (route) {
          let dd = f * total;
          for (let k = 0; k < lens.length; k++) { if (dd <= lens[k] || k === lens.length - 1) { const g = lens[k] ? clamp(dd / lens[k]) : 0; return [route[k][0] + (route[k + 1][0] - route[k][0]) * g, route[k][1] + (route[k + 1][1] - route[k][1]) * g]; } dd -= lens[k]; }
        }
        const a = 1 - f; return [a * a * an[0] + 2 * a * f * mx + f * f * ex, a * a * an[1] + 2 * a * f * my + f * f * ey];
      };
      const nS = route ? 90 : steps;
      for (let s = 1; s <= nS * drawn; s++) { const pp = pt(s / nS); ctx.lineTo(pp[0], pp[1]); }
      ctx.lineCap = "round"; ctx.strokeStyle = rgba(th.lead); ctx.lineWidth = 8 * u; ctx.stroke();
      ctx.strokeStyle = rgba(th.came); ctx.lineWidth = 2.6 * u; ctx.stroke();
      if (drawn > 0.95) {
        const bead = pt(((t * 0.5 + i * 0.33) % 1));
        const gr = ctx.createRadialGradient(bead[0], bead[1], 0, bead[0], bead[1], 16 * u);
        gr.addColorStop(0, "rgba(255,250,225,0.95)"); gr.addColorStop(1, "rgba(255,220,140,0)");
        ctx.fillStyle = gr; ctx.fillRect(bead[0] - 16 * u, bead[1] - 16 * u, 32 * u, 32 * u);
      }
      ctx.restore();
      const jewel = piece(circle(an[0], an[1], 15 * u), [th.ruby, th.acc, th.emerald][i], 7200 + i, { L: clamp(q * 3), hot: 0.25 * (0.5 + 0.5 * Math.sin(t * 3 + i * 2)) });
      glaze(ctx, S, th, [jewel], 4);
      banderole(ctx, S, th, labels[i], b0.x, b0.y, z, { q, maxW, align: align === "left" ? "left" : "center", seed: 7300 + i });
    });
  }

  // ---- people: robed figures, each in a gothic niche ------------------------------------------------
  // A figure cut the way a glazier would: the robe divided by lead into columns and courses (yoke, skirt,
  // girdle and a jewelled hem), every piece painted with grisaille trace lines for folds and shading,
  // the face and hair painted in thin brown line on flesh-tint glass.
  function figurePieces(S, th, cx, base, s, i, accent, holding, t) {
    const u = S.u, list = [];
    const robe = accent ? th.acc : [th.azure, th.emerald, th.violet, th.ruby, mix(th.azure, th.emerald, 0.5), th.rose][i % 6];
    const shY = base - s * 0.6, shW = s * 0.36, hemW = s * 0.52;
    const sway = Math.sin(t * 1.1 + i * 1.9) * s * 0.012;
    const fx = (f, y) => cx + sway * ((base - y) / s) + f;
    const M = th.matte, tw = Math.max(1.4, s * 0.0055);
    const lerp = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    const atY = (a, b, y) => lerp(a, b, clamp((y - a[1]) / Math.max(1e-6, b[1] - a[1])));
    // Column boundary lines from the shoulder line down to the hem.
    const p0 = [fx(-shW / 2, shY), shY], p1 = [fx(shW / 2, shY), shY], p2 = [cx + hemW / 2, base], p3 = [cx - hemW / 2, base];
    const lines = [[p0, p3], [lerp(p0, p1, 0.33), lerp(p3, p2, 0.28)], [lerp(p0, p1, 0.67), lerp(p3, p2, 0.72)], [p1, p2]];
    const yG = shY + s * 0.2, yG2 = yG + s * 0.035, yH = base - s * 0.085;
    const tones = [mul(robe, 0.8), mix(robe, WHITE, 0.14), robe];
    // Painted folds: two trace lines running down each piece, with hatching in the shadowed edge.
    const folds = (a, b, c, d, dark) => (cc) => {
      cc.strokeStyle = rgba(M, 0.5); cc.lineWidth = tw * 1.3; cc.lineCap = "round"; cc.beginPath();
      for (const f of [0.34, 0.68]) { const top = lerp(a, b, f), bot = lerp(d, c, f + (f - 0.5) * 0.15); cc.moveTo(top[0], top[1] + s * 0.01); cc.quadraticCurveTo((top[0] + bot[0]) / 2 + s * 0.012, (top[1] + bot[1]) / 2, bot[0], bot[1]); }
      cc.stroke();
      cc.strokeStyle = rgba(M, dark ? 0.32 : 0.2); cc.lineWidth = tw; cc.beginPath();
      const nH = 7;
      for (let k = 0; k < nH; k++) { const f = (k + 0.5) / nH, e = lerp(b, c, f); cc.moveTo(e[0], e[1]); cc.lineTo(e[0] - s * 0.03, e[1] + s * 0.012); }
      cc.stroke();
    };
    for (let k = 0; k < 3; k++) {
      const L = lines[k], R = lines[k + 1];
      const band = (y0, y1, col, seed, paint) => list.push(piece(poly([atY(L[0], L[1], y0), atY(R[0], R[1], y0), atY(R[0], R[1], y1), atY(L[0], L[1], y1)]), col, seed, paint ? { paint } : undefined));
      const q = (y0, y1) => [atY(L[0], L[1], y0), atY(R[0], R[1], y0), atY(R[0], R[1], y1), atY(L[0], L[1], y1)];
      band(shY, yG, tones[k], 8000 + i * 40 + k, folds(...q(shY, yG), k === 0));
      band(yG, yG2, mix(th.amber, WHITE, 0.1), 8020 + i * 40 + k);
      band(yG2, yH, mul(tones[k], 0.95), 8003 + i * 40 + k, folds(...q(yG2, yH), k === 0));
      const hq = q(yH, base);
      band(yH, base, k === 1 ? th.amber : mul(th.ruby, 0.9), 8023 + i * 40 + k, (cc) => {
        cc.fillStyle = rgba(M, 0.5);
        for (let d = 1; d < 4; d++) { const pt = lerp(lerp(hq[0], hq[3], 0.5), lerp(hq[1], hq[2], 0.5), d / 4); cc.beginPath(); cc.arc(pt[0], pt[1], s * 0.008, 0, TAU); cc.fill(); }
      });
    }
    // Sleeves and hands; the figure holding the card brings its hands together.
    const handY = base - s * 0.3;
    const lHand = [fx(-shW * 0.62, handY), handY], rHand = [fx(shW * 0.62, handY), handY];
    const hold = [fx(0, base - s * 0.36), base - s * 0.36];
    const hl = lerp(lHand, [hold[0] - s * 0.06, hold[1]], holding), hr = lerp(rHand, [hold[0] + s * 0.06, hold[1]], holding);
    const sleeve = (pts, seed) => list.push(piece(poly(pts), mul(robe, 0.7), seed, { paint: (cc) => {
      cc.strokeStyle = rgba(M, 0.45); cc.lineWidth = tw * 1.2; cc.beginPath();
      const a = lerp(pts[0], pts[1], 0.5), b = lerp(pts[2], pts[3], 0.5); cc.moveTo(a[0], a[1]); cc.lineTo(b[0], b[1]); cc.stroke();
    } }));
    sleeve([[p0[0] - s * 0.03, shY + s * 0.02], [p0[0] + s * 0.07, shY + s * 0.04], [hl[0] + s * 0.035, hl[1] - s * 0.03], [hl[0] - s * 0.04, hl[1] - s * 0.04]], 8013 + i * 40);
    sleeve([[p1[0] + s * 0.03, shY + s * 0.02], [p1[0] - s * 0.07, shY + s * 0.04], [hr[0] - s * 0.035, hr[1] - s * 0.03], [hr[0] + s * 0.04, hr[1] - s * 0.04]], 8014 + i * 40);
    const skin = th.skin[i % th.skin.length];
    const hand = (h, seed) => list.push(piece(circle(h[0], h[1], s * 0.038), skin, seed, { paint: (cc) => {
      cc.strokeStyle = rgba(M, 0.55); cc.lineWidth = tw; cc.beginPath();
      for (let k = -1; k <= 1; k++) { cc.moveTo(h[0] + k * s * 0.012, h[1] - s * 0.01); cc.lineTo(h[0] + k * s * 0.012, h[1] + s * 0.022); }
      cc.stroke();
    } }));
    hand(hl, 8015 + i * 40); hand(hr, 8016 + i * 40);
    // Collar.
    list.push(piece(poly([[fx(-shW * 0.28, shY), shY - s * 0.01], [fx(shW * 0.28, shY), shY - s * 0.01], [fx(shW * 0.16, shY + s * 0.06), shY + s * 0.06], [fx(-shW * 0.16, shY + s * 0.06), shY + s * 0.06]]), th.amber, 8017 + i * 40, { paint: (cc) => {
      cc.fillStyle = rgba(M, 0.5); for (const f of [-0.14, 0, 0.14]) { cc.beginPath(); cc.arc(fx(shW * f, shY), shY + s * 0.022, s * 0.007, 0, TAU); cc.fill(); }
    } }));
    // Head: flesh-tint glass painted in trace line; the eyes blink now and then.
    const hr0 = s * 0.115, hx = fx(0, shY - hr0) + Math.sin(t * 0.9 + i) * s * 0.006, hy = shY - hr0 * 1.08;
    const blink = bump(((t + h1(i) * 5) % 4.2) - 3.9, 0.06);
    const hairCol = th.hair[i % th.hair.length], style = i % 3;
    const strands = (cc, pts, n) => {
      cc.strokeStyle = rgba(M, 0.45); cc.lineWidth = tw; cc.lineCap = "round"; cc.beginPath();
      for (let k = 0; k < n; k++) { const f = (k + 0.5) / n, a = Math.PI * (1.08 + 0.84 * f); cc.moveTo(hx + Math.cos(a) * hr0 * 0.98, hy + Math.sin(a) * hr0 * 0.98); cc.quadraticCurveTo(hx + Math.cos(a) * hr0 * 0.6, hy + Math.sin(a) * hr0 * 0.85, hx + (f - 0.5) * hr0 * 0.4, hy - hr0 * 0.48); }
      cc.stroke(); void pts;
    };
    if (style === 1) list.push(piece(poly([[hx - hr0 * 1.12, hy - hr0 * 0.2], [hx + hr0 * 1.12, hy - hr0 * 0.2], [hx + hr0 * 1.05, hy + hr0 * 1.35], [hx - hr0 * 1.05, hy + hr0 * 1.35]]), mul(hairCol, 0.85), 8008 + i * 40, { paint: (cc) => {
      cc.strokeStyle = rgba(M, 0.4); cc.lineWidth = tw; cc.beginPath();
      for (let k = 0; k < 6; k++) { const x = hx - hr0 * 1.0 + (k / 5) * hr0 * 2.0; cc.moveTo(x, hy); cc.quadraticCurveTo(x + hr0 * 0.08, hy + hr0 * 0.7, x - hr0 * 0.04, hy + hr0 * 1.3); }
      cc.stroke();
    } }));
    list.push(piece(circle(hx, hy, hr0), skin, 8009 + i * 40, {
      paint: (c) => {
        // A soft matt wash shading one side of the face and under the brow.
        const wash = c.createLinearGradient(hx - hr0, hy, hx + hr0, hy);
        wash.addColorStop(0, rgba(M, 0)); wash.addColorStop(0.6, rgba(M, 0)); wash.addColorStop(1, rgba(M, 0.28));
        c.fillStyle = wash; c.fillRect(hx - hr0, hy - hr0, hr0 * 2, hr0 * 2);
        c.strokeStyle = rgba(M, 0.85); c.lineCap = "round"; c.lineJoin = "round";
        const ey = hy + hr0 * 0.08, open = 1 - blink * 0.92;
        for (const sx of [-1, 1]) {
          const ex = hx + sx * hr0 * 0.36;
          // Brow: a long tapering arc.
          c.lineWidth = Math.max(1.2, hr0 * 0.055);
          c.beginPath(); c.moveTo(ex - sx * hr0 * 0.2, ey - hr0 * 0.2); c.quadraticCurveTo(ex, ey - hr0 * 0.34, ex + sx * hr0 * 0.24, ey - hr0 * 0.22); c.stroke();
          // Upper lid with the lash line, the iris under it, a faint lower lid.
          c.lineWidth = Math.max(1.1, hr0 * 0.05);
          c.beginPath(); c.moveTo(ex - hr0 * 0.17, ey); c.quadraticCurveTo(ex, ey - hr0 * 0.12 * open, ex + hr0 * 0.17, ey); c.stroke();
          if (open > 0.3) { c.fillStyle = rgba(M, 0.85); c.beginPath(); c.arc(ex + Math.sin(t * 0.7 + i) * hr0 * 0.03, ey - hr0 * 0.025, hr0 * 0.055 * open, 0, TAU); c.fill(); }
          c.lineWidth = Math.max(0.8, hr0 * 0.025); c.strokeStyle = rgba(M, 0.45);
          c.beginPath(); c.moveTo(ex - hr0 * 0.13, ey + hr0 * 0.05); c.quadraticCurveTo(ex, ey + hr0 * 0.1, ex + hr0 * 0.13, ey + hr0 * 0.05); c.stroke();
          c.strokeStyle = rgba(M, 0.85);
        }
        // Nose: one line down from the brow and a small turn at the tip.
        c.lineWidth = Math.max(1, hr0 * 0.045);
        c.beginPath(); c.moveTo(hx - hr0 * 0.04, ey - hr0 * 0.14); c.quadraticCurveTo(hx + hr0 * 0.04, ey + hr0 * 0.18, hx + hr0 * 0.1, ey + hr0 * 0.3); c.quadraticCurveTo(hx + hr0 * 0.02, ey + hr0 * 0.36, hx - hr0 * 0.08, ey + hr0 * 0.31); c.stroke();
        // Mouth: a short line with the shadow of the lower lip.
        c.beginPath(); c.moveTo(hx - hr0 * 0.17, hy + hr0 * 0.55); c.quadraticCurveTo(hx, hy + hr0 * 0.6, hx + hr0 * 0.17, hy + hr0 * 0.55); c.stroke();
        c.lineWidth = Math.max(0.8, hr0 * 0.03); c.strokeStyle = rgba(M, 0.4);
        c.beginPath(); c.moveTo(hx - hr0 * 0.09, hy + hr0 * 0.68); c.quadraticCurveTo(hx, hy + hr0 * 0.72, hx + hr0 * 0.09, hy + hr0 * 0.68); c.stroke();
        // Jaw and cheek modelling.
        c.beginPath(); c.arc(hx, hy + hr0 * 0.05, hr0 * 0.86, Math.PI * 0.22, Math.PI * 0.42); c.stroke();
      },
    }));
    // Hair on top: a cap with painted strands, a long fall (behind) or a bun.
    const cap = [...arcPts(hx, hy, hr0 * 1.08, Math.PI * 1.05, Math.PI * 1.95, 10), [hx + hr0 * 0.7, hy - hr0 * 0.35], [hx, hy - hr0 * 0.5], [hx - hr0 * 0.7, hy - hr0 * 0.35]];
    list.push(piece(poly(cap), hairCol, 8010 + i * 40, { paint: (cc) => strands(cc, cap, 7) }));
    if (style === 2) list.push(piece(circle(hx, hy - hr0 * 1.15, hr0 * 0.36), hairCol, 8011 + i * 40, { paint: (cc) => {
      cc.strokeStyle = rgba(M, 0.45); cc.lineWidth = tw; cc.beginPath(); cc.arc(hx, hy - hr0 * 1.15, hr0 * 0.2, 0.3, 4.6); cc.stroke();
    } }));
    return { list, hold, head: [hx, hy, hr0] };
  }
  function peopleScene(ctx, S, th, A, p, d, t) {
    const u = S.u, tall = S.H > S.W * 0.8;
    const n = clamp(Math.round(Number(d.count) || 4), 2, 6);
    const rowsN = tall && n > 3 ? 2 : 1;
    const perRow = Math.ceil(n / rowsN);
    const rowH = A.h / rowsN;
    const hp = FR.hp;
    const hl = Number.isFinite(d.highlight) ? clamp(Math.round(d.highlight), 0, n - 1) : 0;
    // The beats: each figure in turn has its niche brighten and its halo flare; then the card passes
    // from the highlighted figure to each of the others, the receiver's halo flaring as it lands.
    const beatAt = (i) => 0.1 + (i / Math.max(1, n - 1)) * 0.38;
    const owners = [hl]; for (let k = hl - 1; k >= 0; k--) owners.push(k); for (let k = hl + 1; k < n; k++) owners.push(k);
    const pass0 = 0.56, passL = (0.97 - pass0) / Math.max(1, owners.length - 1);
    let cardFrom = owners[0], cardTo = owners[0], fly = 0;
    const arrive = new Array(n).fill(-1);
    for (let k = 1; k < owners.length; k++) {
      const a = pass0 + (k - 1) * passL;
      arrive[owners[k]] = a + passL * 0.55;
      if (hp >= a) { cardFrom = owners[k - 1]; cardTo = owners[k]; fly = eio(seg(hp, a, a + passL * 0.55)); }
    }
    const holder = fly >= 1 ? cardTo : fly <= 0 ? cardFrom : -1;
    const geo = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / perRow), k = i % perRow, inRow = Math.min(perRow, n - r * perRow);
      const slot = A.w / perRow;
      const cx = A.x + A.w / 2 + (k - (inRow - 1) / 2) * slot;
      const base = A.y + rowH * (r + 1) - (rowsN === 1 ? 112 * u : 96 * u);
      const top = A.y + rowH * r + 6 * u;
      const s = Math.min(base - top - 20 * u, slot * 1.9) * 0.98;
      const order = i / Math.max(1, n);
      const beat = bump(hp - beatAt(i), 0.06) + (arrive[i] >= 0 ? 0.9 * bump(hp - arrive[i], 0.035) : 0);
      // The niche: a pointed arch of darker glass with a cusped canopy line.
      const nw = Math.min(slot * 0.86, s * 0.62), nx = cx - nw / 2, ny = base - s * 1.02;
      const { ah, left, right } = lancetHalves(nx, ny, nw);
      const niche = [];
      const nb = mix(th.field[i % th.field.length], th.unlit, 0.35);
      niche.push(piece(poly(left), mul(nb, 1.05), 8500 + i * 10));
      niche.push(piece(poly(right), mul(nb, 0.95), 8501 + i * 10));
      const mid = ny + ah + (base - ny - ah) * 0.45;
      niche.push(piece(poly([[nx, ny + ah], [nx + nw, ny + ah], [nx + nw, mid], [nx, mid + nw * 0.12]]), mul(nb, 0.9), 8502 + i * 10));
      niche.push(piece(poly([[nx, mid + nw * 0.12], [nx + nw, mid], [nx + nw, base], [nx, base]]), mul(nb, 0.82), 8503 + i * 10));
      niche.push(piece(poly([[nx - nw * 0.08, base], [nx + nw * 1.08, base], [nx + nw * 1.02, base + 26 * u], [nx - nw * 0.02, base + 26 * u]]), th.amber, 8504 + i * 10));
      const lN = 0.38 + 0.62 * litBy(p, order * 0.6, 0.5);
      for (const pc of niche) { pc.L = Math.min(1, lN * (0.82 + 0.18 * clamp(hp * 6)) + 0.25 * beat); pc.hot = 0.45 * beat; }
      glaze(ctx, S, th, niche, 6);
      const holding = holder === i ? 1 : (fly > 0 && fly < 1 && (cardFrom === i ? 1 - seg(fly, 0, 0.3) : cardTo === i ? seg(fly, 0.7, 1) : 0));
      const F = figurePieces(S, th, cx, base, s * 0.86, i, i === hl, holding, t);
      geo[i] = F;
      const lF = 0.3 + 0.7 * litBy(p, 0.1 + order * 0.6, 0.55);
      // A nimbus of gold glass behind each head that flares on the figure's beat.
      {
        const [hx, hy, hr] = F.head, nR = hr * 1.75;
        const ring = [];
        for (let k = 0; k < 12; k++) {
          const a0 = (k / 12) * TAU, a1 = ((k + 1) / 12) * TAU;
          const chase = Math.pow(0.5 + 0.5 * Math.cos((a0 + a1) / 2 - t * 2.2 - i), 6);
          ring.push(piece(sector(hx, hy, nR * 0.62, nR, a0, a1), k % 2 ? th.amber : mix(th.amber, WHITE, 0.25), 8700 + i * 20 + k, { L: lF, hot: (0.08 + 0.18 * chase + 0.7 * beat) * lF }));
        }
        ring.push(piece(circle(hx, hy, nR * 0.62), mix(th.amber, th.plaque, 0.4), 8699 + i * 20, { L: lF, hot: 0.5 * beat * lF }));
        if (beat > 0.02) {
          ctx.save(); ctx.globalCompositeOperation = "screen";
          const gr = ctx.createRadialGradient(hx, hy, nR * 0.5, hx, hy, nR * 2.6);
          gr.addColorStop(0, rgba(mix(th.amber, WHITE, 0.5), Math.min(0.75, 0.65 * beat) * lF * transAt(hx, hy).v)); gr.addColorStop(1, rgba(th.amber, 0));
          ctx.fillStyle = gr; ctx.fillRect(hx - nR * 2.6, hy - nR * 2.6, nR * 5.2, nR * 5.2);
          ctx.restore();
        }
        glaze(ctx, S, th, ring, 4);
      }
      for (const pc of F.list) { pc.L = lF; pc.hot = (pc.hot || 0) + 0.18 * beat; }
      glaze(ctx, S, th, F.list, 5);
      const badge = d.badges[i] || "Viewer";
      if (badge) banderole(ctx, S, th, badge, cx, base + 26 * u + 40 * u, 44 * u, { q: seg(p, 0.15 + order * 0.3, 0.3 + order * 0.3), maxW: Math.max(slot, 300 * u) * 0.98, seed: 8600 + i });
    }
    // The card: a pale glass tablet held at the chest, flying in an arc from one figure to the next.
    const a = geo[cardFrom].hold, b = geo[cardTo].hold;
    const s0 = Math.abs(b[0] - a[0]);
    const hx = a[0] + (b[0] - a[0]) * fly, hy = a[1] + (b[1] - a[1]) * fly - Math.sin(Math.PI * fly) * Math.max(120 * u, s0 * 0.35);
    const cs = Math.min(A.w / perRow, A.h) * 0.075;
    const lC = 0.3 + 0.7 * litBy(p, 0.2, 0.55);
    const rot = Math.sin(Math.PI * fly) * 0.5;
    const R = (x0, y0) => [hx + x0 * Math.cos(rot) - y0 * Math.sin(rot), hy + x0 * Math.sin(rot) + y0 * Math.cos(rot)];
    const card = piece(poly([R(-cs * 0.8, -cs * 0.6), R(cs * 0.8, -cs * 0.6), R(cs * 0.8, cs * 0.5), R(-cs * 0.8, cs * 0.5)]), th.plaque, 8590, { L: lC, hot: 0.3 + 0.2 * Math.sin(t * 2.6) + 0.3 * Math.sin(Math.PI * fly), paint: (cc) => {
      cc.strokeStyle = rgba(th.matte, 0.55); cc.lineWidth = 2.4 * u; cc.beginPath();
      for (let k = 0; k < 3; k++) { const y0 = -cs * 0.3 + k * cs * 0.28; const l0 = R(-cs * 0.5, y0), l1 = R(cs * (k === 2 ? 0.1 : 0.5), y0); cc.moveTo(l0[0], l0[1]); cc.lineTo(l1[0], l1[1]); }
      cc.stroke();
    } });
    ctx.save(); ctx.globalCompositeOperation = "screen";
    const gr = ctx.createRadialGradient(hx, hy, 0, hx, hy, cs * 3.2);
    gr.addColorStop(0, rgba(mix(th.amber, WHITE, 0.5), 0.5 * lC * transAt(hx, hy).v * transAt(hx, hy).l)); gr.addColorStop(1, rgba(th.amber, 0));
    ctx.fillStyle = gr; ctx.fillRect(hx - cs * 3.2, hy - cs * 3.2, cs * 6.4, cs * 6.4);
    ctx.restore();
    glaze(ctx, S, th, [card], 4);
  }

  // ---- process: three roundel medallions on a came band of travelling light -------------------------
  function iconPieces(S, th, k, cx, cy, r, t, L) {
    const list = [];
    if (k === 0) {
      // An eye that looks about and blinks.
      const w = r * 0.78, hgt = r * 0.42 * (1 - 0.9 * bump(((t + 1.3) % 3.6) - 3.4, 0.07));
      const top = arcPts(cx, cy + hgt * 1.9, Math.hypot(w, hgt * 1.9), -Math.PI / 2 - Math.atan2(w, hgt * 1.9), -Math.PI / 2 + Math.atan2(w, hgt * 1.9), 12);
      const bot = arcPts(cx, cy - hgt * 1.9, Math.hypot(w, hgt * 1.9), Math.PI / 2 - Math.atan2(w, hgt * 1.9), Math.PI / 2 + Math.atan2(w, hgt * 1.9), 12);
      list.push(piece(poly([...top, ...bot]), th.plaque, 9000));
      const lx = Math.sin(t * 0.8) * w * 0.3;
      if (hgt > r * 0.1) {
        list.push(piece(circle(cx + lx, cy, Math.min(r * 0.3, hgt * 0.95)), th.emerald, 9001));
        list.push(piece(circle(cx + lx, cy, Math.min(r * 0.12, hgt * 0.4)), mul(th.unlit, 0.6), 9002));
      }
    } else if (k === 1) {
      // A quill, writing.
      const a = -0.75 + Math.sin(t * 3.1) * 0.06, ca = Math.cos(a), sa = Math.sin(a);
      const P = (u0, v0) => [cx + r * 0.08 * Math.sin(t * 3.1) + u0 * ca - v0 * sa, cy + u0 * sa + v0 * ca];
      const L0 = r * 0.82, W0 = r * 0.24;
      const lft = [], rgt = [];
      for (let s = 0; s <= 8; s++) { const f = s / 8, uu = -L0 + 2 * L0 * f * 0.85, wv = Math.sin(f * Math.PI) * W0; lft.push(P(uu, -wv)); rgt.push(P(uu, wv * 0.7)); }
      list.push(piece(poly([P(-L0, 0), ...lft, P(L0 * 0.7, 0)]), th.plaque, 9010));
      list.push(piece(poly([P(-L0, 0), P(L0 * 0.7, 0), ...rgt.reverse()]), mix(th.plaque, th.azure, 0.25), 9011));
      list.push(piece(poly([P(L0 * 0.7, -W0 * 0.2), P(L0 * 1.05, 0), P(L0 * 0.7, W0 * 0.2)]), th.amber, 9012));
    } else {
      // A gold check on a ruby seal.
      list.push(piece(circle(cx, cy, r * 0.62), th.ruby, 9020));
      const s = r * 0.5;
      list.push(piece(poly([[cx - s * 0.95, cy - s * 0.05], [cx - s * 0.55, cy - s * 0.42], [cx - s * 0.18, cy + s * 0.02], [cx + s * 0.62, cy - s * 0.78], [cx + s * 0.98, cy - s * 0.4], [cx - s * 0.18, cy + s * 0.75]]), th.amber, 9021));
    }
    for (const pc of list) pc.L = L;
    return list;
  }
  function processScene(ctx, S, th, A, p, d, t) {
    const u = S.u, tall = S.H > S.W * 0.8;
    let centers, r;
    if (tall) {
      r = Math.min(A.w * 0.2, A.h * 0.14);
      centers = [0, 1, 2].map((i) => [A.x + r + 30 * u, A.y + A.h * (0.17 + i * 0.33)]);
    } else {
      r = Math.min(A.w / 3 * 0.34, A.h * 0.31);
      centers = [0, 1, 2].map((i) => [A.x + A.w * (i + 0.5) / 3, A.y + A.h * 0.4]);
    }
    // The steps light one after another across the whole hold: a medallion kindles, then the came band
    // to the next fills pane by pane, and the next medallion kindles as the light reaches it.
    const hp = FR.hp;
    const act = (i) => 0.04 + i * 0.3;
    const on = (i) => eo(seg(hp, act(i), act(i) + 0.14));
    for (let i = 0; i < 2; i++) {
      const [ax, ay] = centers[i], [bx, by] = centers[i + 1];
      const band = [];
      const nB = 9, bh = 26 * u;
      const a0 = act(i) + 0.1, a1 = act(i + 1) + 0.02;
      for (let k = 0; k < nB; k++) {
        const f0 = k / nB, f1 = (k + 1) / nB;
        const lit = seg(hp, a0 + (a1 - a0) * f0, a0 + (a1 - a0) * f1);
        const run = ((t * 0.8 - f0) % 1 + 1) % 1;
        const L = 0.15 + 0.85 * lit;
        const hot = 0.5 * bump(run - 0.5, 0.08) * on(i + 1) + 0.7 * bump(lit - 0.6, 0.25) * (lit > 0 ? 1 : 0);
        if (tall) {
          const y0 = ay + r + (by - ay - 2 * r) * f0, y1 = ay + r + (by - ay - 2 * r) * f1;
          band.push(piece(poly([[ax - bh / 2, y0], [ax + bh / 2, y0], [ax + bh / 2, y1], [ax - bh / 2, y1]]), k % 2 ? th.amber : th.ruby, 9100 + i * 20 + k, { L, hot }));
        } else {
          const x0 = ax + r + (bx - ax - 2 * r) * f0, x1 = ax + r + (bx - ax - 2 * r) * f1;
          band.push(piece(poly([[x0, ay - bh / 2], [x1, ay - bh / 2], [x1, ay + bh / 2], [x0, ay + bh / 2]]), k % 2 ? th.amber : th.ruby, 9100 + i * 20 + k, { L, hot }));
        }
      }
      glaze(ctx, S, th, band, 5);
    }
    const cycle = Math.floor(t / 0.9) % 3;
    centers.forEach(([cx, cy], i) => {
      const L = 0.22 + 0.78 * on(i);
      const kindle = bump(hp - act(i) - 0.08, 0.06);
      const live = (hp > 0.72 && i === cycle ? 1 : 0) + 1.4 * kindle;
      const list = [];
      const nR = 14;
      const spin = t * 1.6;
      for (let k = 0; k < nR; k++) {
        const a0 = (k / nR) * TAU - Math.PI / 2, a1 = ((k + 1) / nR) * TAU - Math.PI / 2;
        const chase = Math.pow(0.5 + 0.5 * Math.cos((a0 + a1) / 2 - spin), 8);
        list.push(piece(sector(cx, cy, r * 0.8, r, a0, a1), k % 2 ? th.amber : (i === 2 ? th.ruby : th.azure), 9200 + i * 40 + k, { L, hot: (0.32 + 0.3 * live) * chase * on(i) }));
      }
      const nW = 6;
      for (let k = 0; k < nW; k++) {
        const turn = i + t * 0.32 * (i % 2 ? -1 : 1);
        const a0 = (k / nW) * TAU + turn, a1 = ((k + 1) / nW) * TAU + turn;
        const pulse = 0.3 * bump(((t * 0.9 + k / nW + i * 0.33) % 1) - 0.5, 0.09);
        list.push(piece(sector(cx, cy, 0, r * 0.8, a0, a1), mix(th.field[(i + k) % th.field.length], th.azure, 0.3), 9230 + i * 40 + k, { L: L * 0.85, hot: pulse * on(i) + 0.5 * kindle }));
      }
      glaze(ctx, S, th, list, 6);
      glaze(ctx, S, th, iconPieces(S, th, i, cx, cy, r * 0.66, t, L), 5);
      // The roman numeral on a small roundel at the top of the ring.
      const nr = Math.max(34 * u, r * 0.26);
      const rx = cx + (tall ? 0 : 0), ry = cy - r;
      const tr = transAt(rx, ry);
      const q = clamp(on(i) * 2.5) * tr.v;
      if (q > 0.004) {
        const nPc = piece(circle(rx, ry, nr), th.plaque, 9300 + i, { L: 0.7 + 0.3 * q });
        pane(ctx, S, th, nPc, nPc.L, q, { hot: tr.hot }); leadAll(ctx, S, th, [{ pc: nPc, v: q }], 5 * u);
        paintText(ctx, S, th, ["I", "II", "III"][i], rx, ry + nr * 0.04, Math.max(42 * u, nr * 0.9), { alpha: q, fam: "display", weight: 700 });
      }
      const label = d.steps[i];
      const ql = seg(hp, act(i) + 0.02, act(i) + 0.1);
      if (tall) banderole(ctx, S, th, label, cx + r + 60 * u, cy, 46 * u, { q: ql, align: "left", maxW: A.x + A.w - (cx + r + 60 * u), seed: 9400 + i });
      else banderole(ctx, S, th, label, cx, cy + r + 78 * u, 46 * u, { q: ql, maxW: A.w / 3 * 0.98, seed: 9400 + i });
    });
  }

  // ---- compare: a glass balance weighing two quantities ---------------------------------------------
  function compareScene(ctx, S, th, A, p, d, t) {
    const u = S.u, tall = S.H > S.W * 0.8;
    const lv = Math.max(0, Number(d.leftValue) || 0), rv = Math.max(0, Number(d.rightValue) || 0);
    const mx = Math.max(1e-6, lv, rv);
    const cx = A.x + A.w / 2;
    const pivotY = A.y + A.h * (tall ? (S.tall ? 0.3 : 0.5) : 0.2);
    const Lb = tall ? A.w * 0.36 : Math.min(A.w * 0.26, A.h * 0.62, 450 * u);
    const baseY = A.y + A.h * (tall ? 0.94 : 0.95);
    // The weighing happens through the hold: the left pan's weights drop in one at a time, then the
    // right's, each counter ticking as a weight lands; the beam answers every landing with a damped
    // swing and never quite stops.
    const hp = FR.hp, Hs = Math.max(0.5, (FR.hold || 3) - 0.34);
    const cnt = [lv > 0 ? Math.max(1, Math.round((lv / mx) * 10)) : 0, rv > 0 ? Math.max(1, Math.round((rv / mx) * 10)) : 0];
    const dropAt = (si, k) => si === 0 ? 0.03 + (k / Math.max(1, cnt[0])) * 0.4 : 0.5 + ((k + 0.4) / Math.max(1, cnt[1])) * 0.36;
    const landQ = (si, k) => eo(seg(hp, dropAt(si, k), dropAt(si, k) + 0.05));
    const events = [];
    for (let si = 0; si < 2; si++) for (let k = 0; k < cnt[si]; k++) events.push([dropAt(si, k) + 0.05, si]);
    events.sort((a, b) => a[0] - b[0]);
    const tiltMax = 0.2;
    let theta = 0.012 * Math.sin(t * 1.3);
    {
      const w = [0, 0];
      let prev = 0;
      for (const [at, si] of events) {
        w[si] += (si ? rv : lv) / cnt[si];
        const dNow = (w[0] - w[1]) / Math.max(1e-6, w[0] + w[1]);
        const dt = (hp - at) * Hs;
        if (dt > 0) {
          const a = 2.4, om = 7.5;
          theta += -tiltMax * (dNow - prev) * (1 - Math.exp(-a * dt) * (Math.cos(om * dt) + (a / om) * Math.sin(om * dt)));
        }
        prev = dNow;
      }
    }
    const ca = Math.cos(theta), sa = Math.sin(theta);
    const L = 0.3 + 0.7 * litBy(p, 0, 0.3);
    // Pillar: plinth, shaft courses and capital.
    const pw = 54 * u, list = [];
    const plH = 46 * u;
    list.push(piece(poly([[cx - pw * 2.2, baseY], [cx + pw * 2.2, baseY], [cx + pw * 1.5, baseY - plH], [cx - pw * 1.5, baseY - plH]]), th.amber, 9500));
    const courses = 6, top = pivotY + 30 * u;
    for (let k = 0; k < courses; k++) {
      const y0 = baseY - plH - ((baseY - plH - top) * k) / courses, y1 = baseY - plH - ((baseY - plH - top) * (k + 1)) / courses;
      list.push(piece(poly([[cx - pw / 2, y0], [cx + pw / 2, y0], [cx + pw / 2, y1], [cx - pw / 2, y1]]), k % 2 ? th.violet : mix(th.violet, th.azure, 0.5), 9501 + k));
    }
    for (const pc of list) pc.L = L;
    glaze(ctx, S, th, list, 6);
    // Ends of the beam, then chains and pans hanging plumb (with a slow swing).
    const El = [cx - Lb * ca, pivotY - Lb * sa], Er = [cx + Lb * ca, pivotY + Lb * sa];
    const panW = Lb * (tall ? 0.62 : 0.52);
    // Long enough that the stacked weights always sit inside the chains, below the beam.
    const chain = panW * 1.5;
    const sides = [[El, lv, d.left, th.violet, -1], [Er, rv, d.right, th.acc, 1]];
    sides.forEach(([E, v, label, col, sgn], si) => {
      const swing = Math.sin(t * 1.2 + si * 1.4) * 0.03;
      const px = E[0] + Math.sin(swing) * chain, py = E[1] + Math.cos(swing) * chain;
      // Chains: leaded links from a stirrup ring on the beam tip down to each side of the pan rim.
      ctx.save();
      const tr = transAt(px, py);
      ctx.globalAlpha *= tr.v * clamp(L * 1.5);
      ctx.lineCap = "round";
      const metal = mix(th.came, th.amber, 0.55), metalHi = mix(metal, WHITE, 0.35);
      for (const side of [-1, 1]) {
        const ex = px + side * panW * 0.47, ey = py - 4 * u;
        const len = Math.hypot(ex - E[0], ey - E[1]), ang = Math.atan2(ey - E[1], ex - E[0]);
        ctx.beginPath(); ctx.moveTo(E[0], E[1]); ctx.lineTo(ex, ey);
        ctx.strokeStyle = rgba(th.lead); ctx.lineWidth = 9 * u; ctx.stroke();
        ctx.strokeStyle = rgba(metal); ctx.lineWidth = 3.5 * u; ctx.stroke();
        const nL = Math.max(4, Math.floor(len / (24 * u)));
        for (let k = 1; k < nL; k++) {
          const f = k / nL, lx = E[0] + (ex - E[0]) * f, ly = E[1] + (ey - E[1]) * f;
          ctx.beginPath(); ctx.ellipse(lx, ly, 9 * u, 5 * u, ang + (k % 2 ? 0 : Math.PI / 2) * 0.0, 0, TAU);
          ctx.strokeStyle = rgba(th.lead); ctx.lineWidth = 6 * u; ctx.stroke();
          ctx.strokeStyle = rgba(k % 2 ? metal : metalHi); ctx.lineWidth = 2.6 * u; ctx.stroke();
        }
      }
      ctx.restore();
      // Weights: glass tiles stacked in the pan, dropping in one by one.
      const count = cnt[si];
      let landed = 0;
      const ts = panW / 5.1;
      const rowsDef = [4, 3, 2, 1];
      let k = 0;
      const tiles = [];
      for (let rI = 0; rI < rowsDef.length && k < count; rI++) {
        const inRow = Math.min(rowsDef[rI], count - k);
        for (let c = 0; c < inRow; c++, k++) {
          const tx = px + (c - (inRow - 1) / 2) * ts * 1.04, ty = py - ts * (rI + 1) * 1.02;
          const q = landQ(si, k);
          landed += q >= 1 ? 1 : 0;
          if (q <= 0) continue;
          const dy = -160 * u * (1 - q);
          const flash = bump(hp - dropAt(si, k) - 0.06, 0.03);
          const cl = mix(col, th.field[(k + si) % th.field.length], h1(k + si * 20) * 0.3);
          tiles.push(piece(poly([[tx - ts / 2, ty + dy], [tx + ts / 2, ty + dy], [tx + ts / 2, ty + ts + dy], [tx - ts / 2, ty + ts + dy]]), cl, 9600 + si * 30 + k, { L: q, vis: clamp(q * 2), hot: 0.4 * (1 - q) + 0.6 * flash }));
        }
      }
      glaze(ctx, S, th, tiles, 5);
      // The pan: a shallow bowl with a rim.
      const bowl = [];
      const bwPts = [[px - panW / 2, py], [px + panW / 2, py]];
      for (let s = 0; s <= 10; s++) { const f = s / 10, a = Math.PI * f; bwPts.push([px + Math.cos(a) * panW / 2, py + Math.sin(a) * panW * 0.2]); }
      bowl.push(piece(poly(bwPts.slice(1)), th.amber, 9700 + si, { L }));
      bowl.push(piece(poly([[px - panW * 0.56, py - 9 * u], [px + panW * 0.56, py - 9 * u], [px + panW * 0.5, py + 5 * u], [px - panW * 0.5, py + 5 * u]]), mix(th.amber, WHITE, 0.2), 9702 + si, { L }));
      glaze(ctx, S, th, bowl, 5);
      // Number and label.
      const qn = seg(p, 0.08 + si * 0.06, 0.22 + si * 0.06);
      const shown = count ? (v * landed) / count : 0;
      const tick = events.some(([at, s2]) => s2 === si && hp >= at && hp < at + 0.04) ? 0.35 : 0;
      let nx, ny;
      if (tall) { nx = cx + sgn * A.w * 0.25; ny = A.y + 70 * u; }
      else { nx = clamp(px + sgn * (panW * 0.5 + 170 * u), A.x + 150 * u, A.x + A.w - 150 * u); ny = py - panW * 0.45; }
      plaque(ctx, S, th, fmt(shown, v, d.suffix), nx, ny, 104 * u, { q: qn, maxW: tall ? A.w * 0.48 : 330 * u, min: 72 * u, seed: 9800 + si * 10, color: si ? th.acc : th.violet, hot: (si ? 0.1 * (0.5 + 0.5 * Math.sin(t * 2.2)) : 0) + tick });
      banderole(ctx, S, th, label, tall ? cx + sgn * A.w * 0.25 : px, tall ? A.y + 205 * u : Math.min(A.y + A.h - 40 * u, py + panW * 0.2 + 70 * u), 46 * u, { q: seg(p, 0.1 + si * 0.06, 0.25 + si * 0.06), maxW: tall ? A.w * 0.5 : Lb * 1.1, seed: 9900 + si });
    });
    // The beam itself, over the chain tops, split into panes with a jewelled pivot and finial.
    const bh = 28 * u, beam = [];
    const nBm = 8;
    const R = (x0, y0) => [cx + x0 * ca - y0 * sa, pivotY + x0 * sa + y0 * ca];
    for (let k = 0; k < nBm; k++) {
      const a = -Lb * 1.06 + (2 * Lb * 1.06 * k) / nBm, b = -Lb * 1.06 + (2 * Lb * 1.06 * (k + 1)) / nBm;
      beam.push(piece(poly([R(a, -bh / 2), R(b, -bh / 2), R(b, bh / 2), R(a, bh / 2)]), k % 2 ? th.amber : mix(th.amber, th.ruby, 0.35), 9950 + k, { L }));
    }
    glaze(ctx, S, th, beam, 6);
    // Stirrup rings on the beam tips, where the chains hang.
    glaze(ctx, S, th, [El, Er].map((E, k) => piece(circle(E[0], E[1], 13 * u), th.amber, 9985 + k, { L, hot: 0.15 })), 5);
    const fin = piece(poly([[cx, pivotY - 84 * u], [cx + 22 * u, pivotY - 40 * u], [cx, pivotY - 20 * u], [cx - 22 * u, pivotY - 40 * u]]), th.ruby, 9990, { L, hot: 0.2 * (0.5 + 0.5 * Math.sin(t * 2.5)) });
    const piv = piece(circle(cx, pivotY, 24 * u), th.acc, 9991, { L, hot: 0.2 });
    glaze(ctx, S, th, [fin, piv], 5);
  }

  // Which scenes are shown, from the template's controls (for the title's change and the final frame).
  function shownList() {
    const c = (window.__dreamcut && window.__dreamcut.controls) || {};
    const order = ["title", "chart", "object", "people", "process", "compare", "closing"];
    const def = { title: 2.4, chart: 3.4, object: 3.6, people: 3.2, process: 3.6, compare: 3.2, closing: 2.4 };
    let s = 0;
    const out = [];
    for (const id of order) { const hold = Number(c[id + "_hold"] ?? def[id]); if (hold > 0) out.push({ id, start: s, hold }); s += Math.max(0, hold); }
    return out;
  }

  return {
    bg: "#0d0a18", panel: "#f1e2b8", ink: "#fbf0d4", muted: "#d8c79c", accent: "#f2b02e", onAccent: "#1a1008",
    rule: "rgba(251,240,212,0.4)", track: "rgba(251,240,212,0.14)",
    display: "'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif", displayWeight: 700, displayCase: "none", displayTracking: "0em",
    body: "'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif", bodyWeight: 600,
    figures: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif", radius: 6, motion: "wipe", change: "fade",
    kit: { line: 5, fill: "solid", panel: "fill" },
    panelEdge: "#16110c",
    glassSet: {
      lead: "#15100c", came: "#4a4036", unlit: "#141626", matte: "#2a1a0e",
      field: ["#1d3c9a", "#2752bd", "#18327c", "#33298a", "#1b6a94", "#2a47a8"],
      jewel: ["#c21f3a", "#f2a628", "#1f8f50", "#2f7fd0", "#6a2ea3", "#d4567c"],
      plaque: "#f4e6bf", plaqueInk: "#2b190c", panel: ["#241657", "#1c1a63", "#2b1550"],
      skin: ["#f3cba2", "#d9a074", "#a8704a", "#f0bf98"], hair: ["#4a2a14", "#8c3b1c", "#1d1512", "#c88a2c"],
      dim: "#8a8aa2", beam: 0.7, ray: "#ffe7b0",
    },
    palettes: {
      // Daylight: clear and pale-tinted quarries with jewels; dark painted words on pale glass.
      light: { bg: "#ece4cf", ink: "#24180c", muted: "#5c4a33", accent: "#c8361f", onAccent: "#fff6e0", rule: "rgba(36,24,12,0.35)", track: "rgba(36,24,12,0.1)",
        textShadow: () => "0 1px 0 rgba(255,250,235,0.7), 0 0 22px rgba(255,248,230,0.8)",
        glassSet: { lead: "#2a221b", came: "#6e6256", unlit: "#5b5a5e", matte: "#3a2a1a",
          field: ["#dfe8e4", "#ebe5cf", "#d3e2ea", "#e8dcc6", "#cfe2d3", "#e4e9da"],
          jewel: ["#c83a3a", "#eeb23c", "#3c9a5c", "#4f92d4", "#8a56b8", "#d8708c"],
          plaque: "#fbf3da", plaqueInk: "#2b190c", panel: ["#f6efda", "#efe6cc", "#f3ead2"],
          skin: ["#f6d2ae", "#e0ab80", "#b47c56", "#f2c6a0"], hair: ["#5a3418", "#9a4a22", "#2a2018", "#d29a3c"],
          dim: "#e6e2d8", beam: 0.35, ray: "#fff4d8" } },
      // Night: moonlight through deep glass, silver-blue highlights.
      dark: { bg: "#05060f", ink: "#e9eeff", muted: "#a9b3d8", accent: "#9ccbff", onAccent: "#0a0f22",
        glassSet: { lead: "#07070b", came: "#2c3040", unlit: "#0b0c18", matte: "#0c0a14",
          field: ["#0f1d55", "#162466", "#0c2a4a", "#21195e", "#102f5c", "#1a2260"],
          jewel: ["#a5203e", "#d9a640", "#1a7a52", "#3a78d0", "#5a34a8", "#b4507e"],
          plaque: "#e6ecf6", plaqueInk: "#121a2e", panel: ["#0c1033", "#121540", "#0e0d2c"],
          skin: ["#e8c6a8", "#c99a78", "#996a4c", "#e2b896"], hair: ["#2c1c10", "#6a3018", "#121014", "#a8823c"],
          dim: "#7c80a0", beam: 0.75, ray: "#cfe0ff" } },
      // Grisaille: grey painted glass with silver-stain gold, the way plain windows were glazed.
      mono: { bg: "#d9d3c4", ink: "#211a12", muted: "#5a5144", accent: "#d39a2a", onAccent: "#1a1208", rule: "rgba(33,26,18,0.35)", track: "rgba(33,26,18,0.1)",
        textShadow: () => "0 1px 0 rgba(255,250,235,0.6), 0 0 20px rgba(250,245,230,0.75)",
        glassSet: { lead: "#221d17", came: "#5e564c", unlit: "#4c4a46", matte: "#2e261c",
          field: ["#cfc9b9", "#bdb6a4", "#d8d2c2", "#b0aa99", "#c6c0b0", "#d2cbb8"],
          jewel: ["#8a8478", "#e0b448", "#a49e8e", "#7c776c", "#6a665e", "#b8b2a2"],
          plaque: "#f4efe0", plaqueInk: "#211a12", panel: ["#ece6d6", "#e4ddcb", "#efe9da"],
          skin: ["#e8dcc6", "#d4c6ac", "#bfb196", "#e0d2b8"], hair: ["#5a5246", "#7a6e5c", "#3c362e", "#c8a050"],
          dim: "#dcd8ce", beam: 0.3, ray: "#fff6dc" } },
    },
    textShadow: () => "0 3px 0 rgba(8,4,2,0.55), 0 0 26px rgba(6,3,14,0.75)",
    backdrop: (accent, texture = 1, look) => `${grain(0.05 * texture)}, ${look ? look.bg : "#0d0a18"}`,
    // Headlines sit on scrolls of pale painted glass in a lead came; the kicker is a ruby quarry.
    css: (accent, look) => {
      const G = look.glassSet;
      // In a wide frame the statements keep to the left so a rose window has room beside them.
      const root = document.getElementById("root");
      const W = Number(root && root.dataset.width) || 1920, H = Number(root && root.dataset.height) || 1080;
      const narrow = (W > H * 1.15 ? `#title, #closing { max-width: ${Math.round(W * 0.64)}px; }` : "") + `#title, #closing { text-wrap: balance; }`;
      return narrow + `#root .scene:not(.statement) { filter: opacity(var(--sg-head, 1)); }
        #root .scene:not(.statement) h2.display { align-self: flex-start; color: ${G.plaqueInk}; text-shadow: none; padding: 0.1em 0.55em 0.16em; border-radius: 0.08em;
          background: radial-gradient(120% 140% at 30% 25%, #fffaf0 0%, ${G.plaque} 45%, ${G.plaque} 70%, #cdb98a 100%);
          border: 0.1em solid ${G.lead}; box-shadow: inset 0 0 0 0.035em ${G.came}, inset 0 0 0.5em rgba(90,60,20,0.35), 0 0 0.6em rgba(255,214,140,0.35); }
        #title-scene .kicker { align-self: flex-start; padding: 0.45em 0.95em; color: #fff4dc; text-shadow: 0 1px 0 rgba(60,0,10,0.6); letter-spacing: 0.16em;
          background: radial-gradient(130% 160% at 30% 25%, #f0687a 0%, ${G.jewel[0]} 50%, #6e0f20 100%); border: 0.16em solid ${G.lead};
          box-shadow: inset 0 0 0 0.06em ${G.came}, 0 0 1.2em rgba(220,40,70,0.45); }`;
    },
    // Other templates: the window alone on the texture canvas (the illustrated explainer draws its own).
    paint: (ctx, W, H, t, accent, look) => {
      ctx.clearRect(0, 0, W, H);
      if (document.getElementById("art")) return;
      const S = { W, H, u: Math.min(W, H) / 1080, look, accent, tall: H > W * 1.15 };
      const th = theme(S);
      FR.t = t; FR.W = W; FR.H = H;
      drawField(ctx, S, th, t, null);
    },
    keepArt: true,
    overlap: true,
    stage(ctx, S, info) {
      const th = theme(S);
      FR.t = info.t; FR.local = info.local; FR.W = S.W; FR.H = S.H; FR.idx = Math.max(0, info.index);
      FR.trans = null;
      let scene = info.scene, local = info.local, hold = info.hold;
      FR.scene = scene;
      // A film that ends on a drawn panel lets its headline go just before its glass unglazes.
      const rootEl = document.getElementById("root");
      if (rootEl) {
        const Ls = shownList(), last = Ls[Ls.length - 1];
        const hv = 1;
        rootEl.style.setProperty("--sg-head", hv.toFixed(3));
      }
      // The final frame (t at the very end) keeps the last scene up.
      if (!scene && info.t > 0) {
        const L = shownList(), last = L[L.length - 1];
        if (last && (last.id === "closing" || last.id === "title")) { scene = last.id; local = last.hold; hold = last.hold; }
      }
      if (S.paint) drawField(ctx, S, th, info.t, info);
      // The title has no drawer, so it goes dark here as the next scene's light arrives.
      const L = shownList();
      // Its darkening starts as its words leave (the last `change` of its hold) and ends soon after the cut.
      const titleOut = (lt) => clamp((lt + info.change * 0.75) / Math.max(0.01, info.change * 1.3));
      if (info.index === 1 && L[0] && L[0].id === "title" && titleOut(info.local) < 1) {
        const box = { x: 0, y: 0, w: S.W, h: S.H };
        FR.trans = { mode: "out", k: titleOut(info.local), A: box };
        statement(ctx, S, th, { ...info, scene: "title", local: L[0].hold + info.local, hold: L[0].hold });
        FR.trans = null;
      }
      // The closing's roses start glazing under the last drawing before the cut, so the window is never
      // bare between the outgoing diagram and the incoming inscription.
      const PRE = info.change * 1.1;
      const full = { x: 0, y: 0, w: S.W, h: S.H };
      const roseIn = (lr) => (lr < info.change * 1.5 ? { mode: "in", k: clamp(lr / Math.max(0.01, info.change * 1.05)), A: full } : null);
      if (info.next === "closing" && scene !== "title" && local > hold - PRE) {
        const lr = local - (hold - PRE);
        statement(ctx, S, th, { ...info, scene: "closing", local: lr - PRE, hold }, { pre: PRE, transR: roseIn(lr), only: true });
        FR.trans = null;
      }
      if (scene === "title" || scene === "closing") {
        const pre = scene === "closing" && FR.idx > 0 ? PRE : 0;
        // The closing's panel glazes fast from the cut, a step ahead of its words.
        const transP = scene === "closing" && FR.idx > 0 && local < info.change * 1.5 ? { mode: "in", k: clamp((local + info.change * 0.45) / Math.max(0.01, info.change * 0.75)), A: full } : null;
        let transR = scene === "closing" && FR.idx > 0 ? roseIn(local + pre) : null;
        if (scene === "title" && info.next && local > hold - info.change * 0.75) transR = { mode: "out", k: titleOut(local - hold), A: full };
        statement(ctx, S, th, { ...info, scene, local, hold }, { pre, transR, transP: scene === "title" ? transR : transP });
        FR.trans = null;
        finishFrame(ctx, S, th, info.t);
      }
    },
    scenes: { chart: wrap(chartScene, "chart"), object: wrap(objectScene, "object"), people: wrap(peopleScene, "people"), process: wrap(processScene, "process"), compare: wrap(compareScene, "compare") },
  };
});
