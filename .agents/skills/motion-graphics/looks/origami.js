// Origami: a warm studio sweep where everything is folded from two-tone paper — coloured on the
// front, white on the back. Faceted models catch a soft key light, crease lines stay visible, and a
// large creased work sheet lies on the studio floor. Headlines sit on folded paper cards that unfold
// with the words. Bars are accordion pleats, the device is a folded laptop, people are folded
// figures under a bunting garland, steps are fold diagrams, and the comparison opens two paper fans.
// Scenes fold flat into the floor as the next one stands up. All models are original.
// Frames are pure functions of time.
window.DreamcutMotion.register("origami", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const inout = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const backOut = (v) => { v = clamp(v); const c = 1.6, w = v - 1; return 1 + (c + 1) * w * w * w + c * w * w; };
  const span = (v, a, b) => clamp((v - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const frac = (v) => v - Math.floor(v);
  // A repeating hold beat: after `start`, every `per` seconds a 0→1 phase runs for `len` seconds.
  const beatPh = (local, start, per, len = 0.9) => { if (local < start) return 0; const x = (local - start) % per; return x < len ? x / len : 0; };
  const bump = (ph) => Math.pow(Math.sin(clamp(ph) * Math.PI), 2);
  const DISPLAY = "'Avenir Next', Avenir, Futura, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
  const HEADS = { title: ["kicker", "title"], chart: ["chart-title"], object: ["object-title"], people: ["people-title"], process: ["process-title"], compare: ["compare-title"], closing: ["closing"] };
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];

  // ---- colour ----------------------------------------------------------------------------------------
  const rgbCache = {};
  function rgbOf(c) {
    if (rgbCache[c]) return rgbCache[c];
    const n = parseInt(String(c).slice(1), 16);
    return (rgbCache[c] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]);
  }
  const mixA = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const css = (c, al = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${al})`;
  // The frame's fold-down shade: models folding flat or still standing up read darker.
  let DIM = 0;
  let F = null;
  // A paper colour lit by the key light (k > 0) or turned away from it (k < 0).
  function tone(hex, k = 0, al = 1) {
    let c = rgbOf(hex);
    c = k >= 0 ? mixA(c, F.liteRGB, k) : mixA(c, F.shadeRGB, -k);
    if (DIM > 0) c = mixA(c, F.shadeRGB, DIM * 0.6);
    return css(c, al);
  }
  const blend = (a, b, k) => { const c = mixA(rgbOf(a), rgbOf(b), k); return "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join(""); };

  // ---- geometry --------------------------------------------------------------------------------------
  function path(g, pts) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); }
  // One flat facet of paper with a faint crease along its edges.
  function facet(g, pts, hex, k, crease = 0.22) {
    path(g, pts);
    g.fillStyle = tone(hex, k);
    g.fill();
    if (crease > 0) { g.strokeStyle = `rgba(255,253,248,${crease * (1 - DIM)})`; g.lineWidth = Math.max(0.8, 1 * F.u); g.lineJoin = "round"; g.stroke(); }
  }
  // Fold a point across the line a→b: k = 0 leaves it flat, k = 1 lays it over on the other side.
  function foldPt(p, a, b, k) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    const d = (p[0] - a[0]) * nx + (p[1] - a[1]) * ny, c = Math.cos(k * Math.PI);
    return [p[0] - nx * d + nx * d * c, p[1] - ny * d + ny * d * c];
  }
  // A folding flap: the front colour while it lifts, the white back once it passes upright.
  function flap(g, pts, a, b, k, front, back, lit = 0.1) {
    const c = Math.cos(k * Math.PI), q = pts.map((p) => foldPt(p, a, b, k));
    if (c >= 0) facet(g, q, front, lit - (1 - c) * 0.35);
    else facet(g, q, back, 0.05 - (1 + c) * 0.3);
  }
  function crease(g, x1, y1, x2, y2, dash, al = 0.5, w = 1.6) {
    g.save(); g.strokeStyle = css(F.inkRGB, al * (1 - DIM)); g.lineWidth = w * F.u; g.lineCap = "round";
    g.setLineDash(dash ? dash.map((v) => v * F.u) : []);
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.restore();
  }
  // Stand an item up from the floor: it unfolds from flat (k = 0) to upright (k = 1) about its base.
  function rise(g, px, py, k, fn, shade = 0.5) {
    if (k <= 0) return;
    const s = Math.max(0.03, Math.sin(clamp(k) * Math.PI / 2));
    g.save(); g.translate(px, py); g.scale(1, s); g.translate(-px, -py);
    const d0 = DIM; DIM = Math.min(1, DIM + (1 - k) * shade); fn(); DIM = d0;
    g.restore();
  }
  function floorShadow(g, cx, cy, rx, ry, al = 0.22) {
    if (rx <= 0) return;
    g.save(); g.translate(cx, cy); g.scale(1, ry / rx);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    gr.addColorStop(0, css(F.shadeRGB, al)); gr.addColorStop(1, css(F.shadeRGB, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill(); g.restore();
  }

  // A flat paper panel lying on a surface: a stepped under-layer, two facets split by a crease and a
  // folded corner tab showing the other side.
  function paperPanel(g, x, y, w, h, col, lit = 0, tabCol = null, step = 4) {
    const u = F.u, c = tabCol ? Math.min(h * 0.42, w * 0.25, 26 * u) : 0;
    if (step) facet(g, [[x + step * u, y + step * u], [x + w + step * u, y + step * u], [x + w + step * u, y + h + step * u], [x + step * u, y + h + step * u]], col, -0.5, 0);
    const m1 = x + w * 0.6, m2 = x + w * 0.46;
    facet(g, [[x, y], [m1, y], [m2, y + h], [x, y + h]], col, lit + 0.07, 0);
    facet(g, [[m1, y], [x + w - c, y], [x + w, y + c], [x + w, y + h], [m2, y + h]], col, lit - 0.08, 0);
    crease(g, m1, y + 1.5 * u, m2, y + h - 1.5 * u, null, 0.12, 1);
    if (c) facet(g, [[x + w - c, y], [x + w, y + c], [x + w - c, y + c]], tabCol, -0.05, 0.3);
  }
  // A strip pleated like an accordion, lying on a darker step, with its end folded under.
  function pleatStrip(g, x, y, w, h, col, t, seed) {
    const u = F.u;
    if (w < 2) return;
    facet(g, [[x + 5 * u, y + 5 * u], [x + w + 5 * u, y + 5 * u], [x + w + 5 * u, y + h + 5 * u], [x + 5 * u, y + h + 5 * u]], col, -0.55, 0);
    const pw = 26 * u, n = Math.max(1, Math.round(w / pw)), sw = w / n;
    for (let j = 0; j < n; j++) {
      const x0 = x + j * sw, lit = j % 2 ? -0.14 : 0.1 + 0.04 * Math.sin(t * 2 + seed + j);
      facet(g, [[x0, y], [x0 + sw, y], [x0 + sw, y + h], [x0, y + h]], col, lit, 0.18);
    }
    const c = Math.min(h * 0.45, 16 * u);
    facet(g, [[x + w - c, y + h], [x + w, y + h], [x + w, y + h - c]], F.back, 0.05, 0.25);
  }
  // A folded crane: body, neck, tail and two wings that flap.
  function crane(g, x, y, s, col, flapK, dir = 1) {
    g.save(); g.translate(x, y); g.scale(dir, 1);
    const tipY = -0.95 * s * flapK, tipY2 = -0.75 * s * flapK;
    facet(g, [[-0.15 * s, -0.06 * s], [0.18 * s, -0.06 * s], [0.05 * s, tipY2]], col, -0.4, 0.2);
    facet(g, [[-0.15 * s, -0.05 * s], [-0.82 * s, -0.55 * s], [-0.3 * s, 0.03 * s]], col, -0.1, 0.25);
    facet(g, [[0.15 * s, -0.05 * s], [0.74 * s, -0.62 * s], [0.3 * s, 0.03 * s]], col, 0.05, 0.25);
    facet(g, [[0.74 * s, -0.62 * s], [0.94 * s, -0.5 * s], [0.68 * s, -0.5 * s]], col, -0.25, 0.25);
    facet(g, [[-0.5 * s, 0], [0, -0.12 * s], [0.45 * s, 0]], col, 0.18, 0.25);
    facet(g, [[-0.5 * s, 0], [0.45 * s, 0], [0, 0.2 * s]], col, -0.28, 0.25);
    facet(g, [[-0.2 * s, -0.04 * s], [0.12 * s, -0.04 * s], [-0.1 * s, tipY]], blend(col, F.back, 0.35), 0.15, 0.3);
    g.restore();
  }

  // ---- words on paper --------------------------------------------------------------------------------
  function txt(g, s, x, y, size, o = {}) {
    s = String(s ?? "");
    if (!s) return 0;
    const font = (sz) => `${o.weight || 700} ${sz}px ${DISPLAY}`;
    g.font = font(size);
    let w = g.measureText(s).width;
    if (o.maxW && w > o.maxW) { size = Math.max(o.min || size * 0.8, (size * o.maxW) / w); g.font = font(size); w = g.measureText(s).width; }
    g.textAlign = o.align || "left"; g.textBaseline = o.base || "middle";
    g.fillStyle = o.color || css(F.inkRGB, 1 - DIM * 0.5);
    g.fillText(s, x, y);
    return w;
  }
  function measure(g, s, size, weight = 700) { g.font = `${weight} ${size}px ${DISPLAY}`; return g.measureText(String(s ?? "")).width; }
  // A paper card: a crease splits it into two facets, one corner is folded down to show the coloured front.
  function card(g, x, y, w, h, o = {}) {
    const u = F.u, c = Math.min(o.corner ?? 34 * u, h * 0.45, w * 0.3), paper = o.paper || F.back;
    if (o.shadow !== false) {
      g.save(); g.shadowColor = css(F.shadeRGB, 0.3 * (1 - DIM * 0.5)); g.shadowBlur = (o.blur ?? 26) * u; g.shadowOffsetY = 12 * u; g.shadowOffsetX = 6 * u;
      path(g, [[x, y], [x + w - c, y], [x + w, y + c], [x + w, y + h], [x, y + h]]); g.fillStyle = tone(paper, 0); g.fill(); g.restore();
    }
    const m1 = x + w * 0.58, m2 = x + w * 0.46;
    facet(g, [[x, y], [m1, y], [m2, y + h], [x, y + h]], paper, 0.06, 0);
    facet(g, [[m1, y], [x + w - c, y], [x + w, y + c], [x + w, y + h], [m2, y + h]], paper, -0.05, 0);
    crease(g, m1, y + 3 * u, m2, y + h - 3 * u, null, 0.07, 1.2);
    facet(g, [[x + w - c, y], [x + w, y + c], [x + w - c, y + c]], o.fold || F.acc, -0.05, 0.3);
    g.save(); g.strokeStyle = css(F.shadeRGB, 0.12); g.lineWidth = 1 * u;
    path(g, [[x, y], [x + w - c, y], [x + w, y + c], [x + w, y + h], [x, y + h]]); g.stroke(); g.restore();
  }
  // A small tag with its words, centred on (cx, cy).
  function tag(g, s, cx, cy, size, o = {}) {
    const u = F.u, pad = (o.pad ?? 26) * u;
    let w = measure(g, s, size, o.weight), sz = size;
    if (o.maxW && w + pad * 2 > o.maxW) { sz = Math.max(o.min || 42 * u, (size * (o.maxW - pad * 2)) / w); w = measure(g, s, sz, o.weight); }
    const tw = w + pad * 2 + (o.extra || 0), th = sz * 1.55;
    const x = o.align === "left" ? cx : cx - tw / 2;
    card(g, x, cy - th / 2, tw, th, { corner: th * 0.32, fold: o.fold, blur: 16 });
    txt(g, s, x + pad + (o.extra || 0), cy + sz * 0.04, sz, { color: o.color, weight: o.weight });
    return { x, y: cy - th / 2, w: tw, h: th };
  }

  // ---- folded models ---------------------------------------------------------------------------------
  // A spinning faceted gem (two pyramids base to base), shaded facet by facet against the key light.
  function gem(g, cx, cy, r, n, rot, tilt, colA, colB, h1 = 1.15, h2 = 1.0) {
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const P = (x, y, z) => [x, y * ct - z * st, y * st + z * ct];
    const ring = [];
    for (let i = 0; i < n; i++) { const a = rot + (i * TAU) / n; ring.push(P(Math.cos(a) * r, 0, Math.sin(a) * r)); }
    const top = P(0, -r * h1, 0), bot = P(0, r * h2, 0);
    const L = [-0.45, -0.7, 0.55], Ln = Math.hypot(...L);
    const faces = [];
    for (let i = 0; i < n; i++) { faces.push([top, ring[i], ring[(i + 1) % n], i % 2 ? colA : colB]); faces.push([bot, ring[(i + 1) % n], ring[i], i % 2 ? colB : colA]); }
    for (const [a, b, c, col] of faces) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const mx = (a[0] + b[0] + c[0]) / 3, my = (a[1] + b[1] + c[1]) / 3, mz = (a[2] + b[2] + c[2]) / 3;
      if (nx * mx + ny * my + nz * mz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      if (nz <= 0) continue;
      const nl = Math.hypot(nx, ny, nz), lit = (nx * L[0] + ny * L[1] + nz * L[2]) / (nl * Ln);
      facet(g, [[cx + a[0], cy + a[1]], [cx + b[0], cy + b[1]], [cx + c[0], cy + c[1]]], col, lit * 0.5 - 0.12, 0.25);
    }
  }
  // A paper plane pointing along `ang`.
  function plane(g, x, y, s, ang, col) {
    g.save(); g.translate(x, y); g.rotate(ang);
    facet(g, [[s, 0], [-0.85 * s, 0.12 * s], [-0.5 * s, 0.03 * s]], col, -0.12, 0.2);
    facet(g, [[s, 0], [-0.5 * s, 0.03 * s], [-0.72 * s, 0.26 * s]], col, -0.38, 0.2);
    facet(g, [[s, 0], [-0.82 * s, -0.44 * s], [-0.5 * s, 0.03 * s]], col, 0.22, 0.3);
    g.restore();
  }
  // A paper boat: a three-facet hull with a white folded rim and a centre peak.
  function boat(g, cx, wy, s, col, sail, bob) {
    g.save(); g.translate(cx, wy); g.rotate(bob);
    const hw = s / 2, hb = s * 0.3, hh = s * 0.25, peak = s * 0.62;
    facet(g, [[-hw * 0.18, -hh], [0, -hh - peak], [0, -hh]], sail, 0.25, 0.3);
    facet(g, [[0, -hh - peak], [hw * 0.42, -hh], [0, -hh]], sail, -0.2, 0.3);
    facet(g, [[-hw * 0.2, -hh], [-hw * 0.02, -hh - peak * 0.55], [-hw * 0.52, -hh]], sail, 0.05, 0.3);
    facet(g, [[-hw, -hh], [-hw * 0.55, -hh], [-hb * 0.55, 0], [-hb, 0]], col, 0.18, 0.25);
    facet(g, [[-hw * 0.55, -hh], [hw * 0.55, -hh], [hb * 0.55, 0], [-hb * 0.55, 0]], col, -0.02, 0.25);
    facet(g, [[hw * 0.55, -hh], [hw, -hh], [hb, 0], [hb * 0.55, 0]], col, -0.3, 0.25);
    facet(g, [[-hw, -hh], [hw, -hh], [hw * 0.96, -hh + s * 0.045], [-hw * 0.96, -hh + s * 0.045]], F.back, 0.1, 0);
    g.restore();
  }
  // Rows of folded wave peaks: a strip of pleated paper standing for water.
  function sea(g, y0, k, t) {
    const { W, H, u } = F;
    if (k <= 0) return;
    // The band rises from below the frame with its folds already standing.
    y0 += (1 - k) * (H - y0 + 120 * u);
    const rows = [[y0, 34, 120, 22, F.papers[1], 0.35], [y0 + 40 * u, 42, 150, -30, F.papers[1], 0.1], [y0 + 88 * u, 48, 180, 16, F.papers[0], 0.25],
      [y0 + 145 * u, 52, 210, -12, F.papers[1], -0.05], [y0 + 210 * u, 58, 240, 9, F.papers[0], 0.05]];
    for (const [ry, A0, P0, sp, col, lift] of rows) {
      const A = A0 * u * (0.85 + 0.15 * k), P = P0 * u, off = frac((t * sp * u) / P) * P;
      const c = blend(col, F.wallB, 0.25 - lift * 0.3);
      for (let x = -P * 2 + off; x < W + P; x += P) {
        const bob = 0.75 + 0.25 * Math.sin(t * 1.7 + x * 0.013);
        facet(g, [[x, ry], [x + P / 2, ry - A * bob], [x + P / 2, ry]], c, 0.16 + lift * 0.3, 0.25);
        facet(g, [[x + P / 2, ry - A * bob], [x + P, ry], [x + P / 2, ry]], c, -0.15 + lift * 0.2, 0.25);
      }
      g.fillStyle = tone(c, -0.06 + lift * 0.2); g.fillRect(-2, ry - 0.5, W + 4, H - ry + 2);
    }
  }
  // An accordion rosette seal with ribbon tails and a check.
  function rosette(g, cx, cy, r, k, rot) {
    if (k <= 0) return;
    const s = backOut(k);
    g.save(); g.translate(cx, cy); g.scale(s, s);
    const acc = F.acc;
    facet(g, [[-r * 0.42, r * 0.3], [-r * 0.08, r * 0.3], [-r * 0.2, r * 1.5], [-r * 0.36, r * 1.3], [-r * 0.58, r * 1.48]], acc, -0.25, 0.25);
    facet(g, [[r * 0.08, r * 0.3], [r * 0.42, r * 0.3], [r * 0.58, r * 1.48], [r * 0.36, r * 1.3], [r * 0.2, r * 1.5]], acc, -0.05, 0.25);
    const N = 26;
    for (let i = 0; i < N; i++) {
      const a0 = rot + (i * TAU) / N, a1 = rot + ((i + 1) * TAU) / N, am = (a0 + a1) / 2, ro = i % 2 ? r : r * 0.9;
      facet(g, [[0, 0], [Math.cos(a0) * r * 0.95, Math.sin(a0) * r * 0.95], [Math.cos(am) * ro, Math.sin(am) * ro], [Math.cos(a1) * r * 0.95, Math.sin(a1) * r * 0.95]], i % 2 ? F.back : F.papers[2], i % 2 ? 0.05 - Math.sin(am) * 0.15 : -0.1 - Math.sin(am) * 0.12, 0.15);
    }
    const ri = r * 0.6;
    for (let i = 0; i < 8; i++) {
      const a0 = rot * 0.3 + (i * TAU) / 8, a1 = a0 + TAU / 8;
      facet(g, [[0, 0], [Math.cos(a0) * ri, Math.sin(a0) * ri], [Math.cos(a1) * ri, Math.sin(a1) * ri]], acc, i % 2 ? 0.08 : -0.12, 0.25);
    }
    g.strokeStyle = tone(F.back, 0.3); g.lineWidth = r * 0.14; g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath(); g.moveTo(-ri * 0.45, 0); g.lineTo(-ri * 0.1, ri * 0.36); g.lineTo(ri * 0.5, -ri * 0.32); g.stroke();
    g.restore();
  }

  // ---- the studio --------------------------------------------------------------------------------------
  let tile = null, tileKey = "";
  function fibreTile(u) {
    const c = document.createElement("canvas"), n = 320;
    c.width = c.height = n;
    const g = c.getContext("2d"), r = rng(2804);
    for (let i = 0; i < 2600; i++) { const v = r() < 0.5 ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},${0.02 + r() * 0.05})`; g.fillRect(r() * n, r() * n, 1 + r() * 1.6, 1 + r() * 1.6); }
    g.lineCap = "round";
    for (let i = 0; i < 140; i++) {
      const x = r() * n, y = r() * n, a = r() * TAU, l = (8 + r() * 26) * Math.max(0.6, u), v = r() < 0.6 ? 255 : 60;
      g.strokeStyle = `rgba(${v},${v},${v},${0.05 + r() * 0.08})`; g.lineWidth = 0.6 + r() * 0.8;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    return c;
  }
  function horizon() { return F.H * (F.tall ? 0.6 : 0.57); }
  // The floor's work sheet in perspective, mapped from unit coordinates.
  function sheetPt(s, v) {
    const { W, H, tall } = F, hz = horizon();
    const by = hz + H * (tall ? 0.04 : 0.06), bl = W * (tall ? 0.12 : 0.2), br = W * (tall ? 0.88 : 0.8);
    const fl = -W * 0.08, fr = W * 1.08, fy = H * 1.04;
    const xl = lerp(bl, fl, v), xr = lerp(br, fr, v);
    return [lerp(xl, xr, s), lerp(by, fy, v * (0.85 + 0.15 * v))];
  }
  // Where the sun-star and the crane sit for each scene (fractions of the frame); they glide during a change.
  const SKY = {
    star: { title: [0.86, 0.2], chart: [0.9, 0.22], object: [0.62, 0.23], people: [0.9, 0.15], process: [0.88, 0.21], compare: [0.5, 0.27], closing: [0.86, 0.2] },
    crane: { title: [0.6, 0.12], chart: [0.46, 0.26], object: [0.88, 0.2], people: [0.64, 0.19], process: [0.56, 0.26], compare: [0.86, 0.23], closing: [0.66, 0.13] },
  };
  const SKY_TALL = { star: [0.8, 0.1], crane: [0.24, 0.2] };
  function skyPos(info, what) {
    if (F.tall) return SKY_TALL[what];
    const P = planOf(F.W, F.H), id = info.scene || (P && P.shown.length ? P.shown[P.shown.length - 1].id : "title");
    const cur = SKY[what][id] || SKY[what].title;
    const prev = P && info.index > 0 ? P.shown[info.index - 1] : null;
    if (!prev || info.local >= info.change) return cur;
    const from = SKY[what][prev.id] || cur, k = inout(info.local / Math.max(0.01, info.change));
    return [lerp(from[0], cur[0], k), lerp(from[1], cur[1], k)];
  }
  function studio(g, info) {
    const { W, H, u, t, tall } = F, hz = horizon(), tex = F.tex;
    // The sweep: wall into floor with no corner, lit from the upper left.
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, F.wallT); gr.addColorStop(hz / H - 0.08, F.wallB); gr.addColorStop(hz / H + 0.05, F.floorT); gr.addColorStop(1, F.floorB);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const key = g.createRadialGradient(W * 0.32, H * 0.25, 0, W * 0.4, H * 0.4, Math.hypot(W, H) * 0.7);
    key.addColorStop(0, css(F.liteRGB, F.keyLight)); key.addColorStop(1, css(F.liteRGB, 0));
    g.fillStyle = key; g.fillRect(0, 0, W, H);
    // A faceted paper sun turning slowly high on the wall.
    let [sx, sy] = skyPos(info, "star"), sr = (tall ? 64 : 78) * u, srot = t * 0.12;
    sx *= W; sy *= H;
    const sunCol = blend(F.papers[2], F.wallT, 0.35);
    for (let i = 0; i < 10; i++) {
      const a0 = srot + (i * TAU) / 10, a1 = a0 + TAU / 10, am = (a0 + a1) / 2;
      facet(g, [[sx, sy], [sx + Math.cos(a0) * sr, sy + Math.sin(a0) * sr], [sx + Math.cos(am) * sr * 1.32, sy + Math.sin(am) * sr * 1.32], [sx + Math.cos(a1) * sr, sy + Math.sin(a1) * sr]], sunCol, i % 2 ? 0.12 : -0.1, 0.25);
    }
    // A crane hangs on its thread in the band under the headline, wings beating, moving between scenes.
    {
      let [cxk, cyk] = skyPos(info, "crane");
      const cx = cxk * W + Math.sin(t * 0.7) * 16 * u, cy = cyk * H + Math.sin(t * 1.1) * 8 * u, fk = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 3.1));
      g.save(); g.strokeStyle = css(F.inkRGB, 0.3); g.lineWidth = 1.2 * u; g.beginPath(); g.moveTo(cxk * W, 0); g.lineTo(cx, cy - 10 * u); g.stroke(); g.restore();
      crane(g, cx, cy, (tall ? 62 : 74) * u, F.papers[(info.index + 1) % F.papers.length], fk, Math.sin(t * 0.25) >= 0 ? 1 : -1);
    }
    // Folded paper hills along the sweep, two rows drifting apart a little.
    const r = rng(77);
    for (let row = 0; row < 2; row++) {
      const drift = Math.sin(t * 0.07 + row) * 14 * u * (row + 1), n = tall ? 4 : 7;
      for (let i = -1; i <= n; i++) {
        const x = (i + r() * 0.5) * (W / n) + drift, w = (W / n) * (1.1 + r() * 0.6), h = H * (row ? 0.075 : 0.12) * (0.6 + r() * 0.7);
        const col = blend(F.papers[(i + 5 + row) % F.papers.length], F.wallB, row ? 0.62 : 0.74), base = hz + H * 0.02 * row, px = x + w * (0.35 + r() * 0.3);
        facet(g, [[x, base], [px, base - h], [px, base]], col, 0.1, 0.2);
        facet(g, [[px, base - h], [x + w, base], [px, base]], col, -0.12, 0.2);
      }
    }
    // Paper planes gliding on long loops, with dotted flight lines like a fold diagram.
    for (let j = 0; j < 2; j++) {
      const per = 13 + j * 4, ph = frac(t / per + j * 0.47), dir = j ? -1 : 1;
      const xx = (k) => (dir > 0 ? lerp(-0.12, 1.12, k) : lerp(1.12, -0.12, k)) * W;
      const yy = (k) => H * (tall ? 0.08 + j * 0.07 : 0.1 + j * 0.2) + Math.sin(k * TAU * 1.3 + j) * 34 * u;
      g.save(); g.strokeStyle = css(F.inkRGB, 0.16); g.lineWidth = 2 * u; g.setLineDash([3 * u, 12 * u]); g.lineCap = "round";
      g.beginPath();
      for (let i = 0; i <= 24; i++) { const k = ph - 0.16 + (i / 24) * 0.15; if (i) g.lineTo(xx(k), yy(k)); else g.moveTo(xx(k), yy(k)); }
      g.stroke(); g.restore();
      const ang = Math.atan2(yy(ph + 0.002) - yy(ph), xx(ph + 0.002) - xx(ph));
      plane(g, xx(ph), yy(ph), (46 - j * 8) * u, ang, j ? F.papers[3] : F.papers[1]);
    }
    // Two gems hanging on threads at the edges, turning and swaying.
    [[tall ? 0.07 : 0.035, tall ? 0.06 : 0.3, 30, 0], [tall ? 0.93 : 0.965, tall ? 0.24 : 0.5, 26, 1]].forEach(([fx, fy, rr, i]) => {
      const ax = W * fx, sway = Math.sin(t * 0.9 + i * 2) * 0.05, len = H * fy, gx = ax + Math.sin(sway) * len, gy = Math.cos(sway) * len;
      g.save(); g.strokeStyle = css(F.inkRGB, 0.3); g.lineWidth = 1.2 * u; g.beginPath(); g.moveTo(ax, 0); g.lineTo(gx, gy - rr * u * 1.1); g.stroke(); g.restore();
      gem(g, gx, gy, rr * u, 6, t * (0.6 + i * 0.2), 0.25, F.papers[i ? 0 : 2], blend(F.papers[i ? 0 : 2], F.back, 0.55));
    });
    // The work sheet: a big creased square on the floor. At each change its mountain and valley folds flip.
    let relief = 1;
    if (info.index > 0 && info.local < info.change) relief = Math.cos((info.local / Math.max(0.01, info.change)) * Math.PI);
    const N = 6;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const a = sheetPt(i / N, j / N), b = sheetPt((i + 1) / N, j / N), c = sheetPt((i + 1) / N, (j + 1) / N), d = sheetPt(i / N, (j + 1) / N);
      const sg = ((i + j) % 2 ? 1 : -1) * relief;
      if ((i + j) % 2) { facet(g, [a, b, c], F.sheet, 0.05 * sg + 0.02, 0); facet(g, [a, c, d], F.sheet, -0.05 * sg, 0); }
      else { facet(g, [a, b, d], F.sheet, 0.05 * sg + 0.02, 0); facet(g, [b, c, d], F.sheet, -0.05 * sg, 0); }
    }
    g.save(); g.strokeStyle = css(F.liteRGB, 0.4); g.lineWidth = 1.2 * u; g.beginPath();
    for (let i = 0; i <= N; i++) { const a = sheetPt(i / N, 0), b = sheetPt(i / N, 1), c = sheetPt(0, i / N), d = sheetPt(1, i / N); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.moveTo(c[0], c[1]); g.lineTo(d[0], d[1]); }
    for (let i = 0; i < N; i++) { const a = sheetPt(i / N, 0), b = sheetPt(1, 1 - i / N); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
    g.stroke();
    // A glint runs along the creases on a slow loop, and sweeps fast during a change.
    const corners = [sheetPt(0, 0), sheetPt(1, 0), sheetPt(1, 1), sheetPt(0, 1)];
    path(g, corners); g.clip();
    const sweep = info.index > 0 && info.local < info.change ? info.local / Math.max(0.01, info.change) : frac(t / 7);
    const gx = lerp(-0.3, 1.3, sweep) * W, band = g.createLinearGradient(gx - 220 * u, 0, gx + 220 * u, H * 0.3);
    band.addColorStop(0, css(F.liteRGB, 0)); band.addColorStop(0.5, css(F.liteRGB, 0.22 * tex + 0.06)); band.addColorStop(1, css(F.liteRGB, 0));
    g.fillStyle = band; g.fillRect(0, hz, W, H - hz);
    g.restore();
    // Loose folded sheets lie on the floor's front edge, one corner lifting and settling.
    const sheets = tall ? [[0.16, 0.985, 120, 1], [0.84, 1.0, 150, -1]] : [[0.08, 0.975, 120, 1], [0.5, 1.025, 170, -1], [0.93, 0.985, 110, 3]];
    sheets.forEach(([fx, fy, rr, ci], i) => {
      const x = W * fx, y = H * fy, r0 = rr * u, sq = 0.36, col = ci < 0 ? F.back : F.papers[ci];
      floorShadow(g, x + 10 * u, y + 8 * u, r0 * 1.2, r0 * 0.4, 0.22);
      g.save(); g.translate(x, y); g.scale(1, sq); g.rotate(0.3 + i * 0.5 + Math.sin(t * 0.2 + i) * 0.04);
      const D = diamond(0, 0, r0);
      facet(g, [D[3], D[0], D[1]], col, 0.1, 0.25); facet(g, [D[3], D[1], D[2]], col, -0.06, 0.25);
      crease(g, D[3][0], D[3][1], D[1][0], D[1][1], [10, 8], 0.35, 1.6 / sq);
      crease(g, D[0][0], D[0][1], D[2][0], D[2][1], null, 0.15, 1.2 / sq);
      const lift = 0.12 + 0.3 * (0.5 + 0.5 * Math.sin(t * 0.9 + i * 2.2)), mA = [(D[1][0] + D[0][0]) / 2, (D[1][1] + D[0][1]) / 2], mB = [(D[1][0] + D[2][0]) / 2, (D[1][1] + D[2][1]) / 2];
      flap(g, [mA, D[1], mB], mA, mB, lift, col, ci < 0 ? F.papers[0] : F.back, -0.05);
      g.restore();
    });
    // Little folded pieces resting at the floor's edges.
    const props = tall ? [[0.07, 0.93, 28, 2], [0.94, 0.9, 22, 3]] : [[0.035, 0.88, 30, 2], [0.975, 0.83, 24, 3], [0.93, 0.965, 18, 0]];
    for (const [fx, fy, rr, ci] of props) {
      floorShadow(g, W * fx + 8 * u, H * fy + rr * u * 0.9, rr * u * 1.3, rr * u * 0.35, 0.25);
      gem(g, W * fx, H * fy, rr * u, 4, 0.5 + ci + Math.sin(t * 0.3 + ci) * 0.25, 0.35, F.papers[ci], blend(F.papers[ci], F.back, 0.6), 1.0, 0.6);
    }
  }

  // ---- headline cards --------------------------------------------------------------------------------
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
  function headBox(id) {
    const lines = (HEADS[id] || []).flatMap((h) => headLines(h));
    if (!lines.length) return null;
    const x0 = Math.min(...lines.map((l) => l.x)), y0 = Math.min(...lines.map((l) => l.y));
    const x1 = Math.max(...lines.map((l) => l.x + l.w)), y1 = Math.max(...lines.map((l) => l.y + l.h));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  // The headline's card unfolds from the left with the words and folds shut as they leave.
  function headCard(g, id, local, hold, change, last) {
    const B = headBox(id);
    if (!B) return null;
    const u = F.u, padX = 40 * u, padY = 24 * u;
    const x = B.x - padX, y = B.y - padY, w = B.w + padX * 2, h = B.h + padY * 2;
    const ent = Math.max(0.2, Number((controls() || {}).entrance) || 0.7), lag = (HEADS[id] || []).length > 1 ? 0.06 : 0, kin = 1 - Math.pow(1 - span(local, lag, ent * 0.85 + lag), 4), kout = last ? 0 : span(local, hold - change, hold);
    if (kin <= 0 || kout >= 1) return { x, y, w, h };
    g.save();
    if (kout > 0) { g.globalAlpha *= 1 - span(kout, 0.55, 1); g.translate(x, y + h); g.scale(1, 1 - inout(kout) * 0.85); g.translate(-x, -(y + h)); }
    g.translate(x, y); g.scale(Math.max(0.02, kin), 1); g.translate(-x, -y);
    const d0 = DIM; DIM = (1 - kin) * 0.25 + kout * 0.4;
    card(g, x, y, w, h, { corner: Math.min(58 * u, h * 0.4) });
    // A small fold-diagram mark hangs below the card's right end: a dashed crease and a curled arrow.
    if (!last || id !== "closing") {
      const mx = x + w - 120 * u, my = y + h + 30 * u, q = span(local, 0.4, 1.1);
      if (q > 0 && my < F.H * 0.36 + 10 * u) {
        g.save(); g.strokeStyle = css(F.accRGB, 0.85 * (1 - DIM)); g.lineWidth = 3 * u; g.lineCap = "round"; g.setLineDash([12 * u, 9 * u]);
        g.beginPath(); g.moveTo(mx - 60 * u, my); g.lineTo(mx - 60 * u + 150 * u * q, my); g.stroke(); g.restore();
      }
    }
    DIM = d0;
    g.restore();
    return { x, y, w, h };
  }

  // ---- chart: accordion-pleated columns on a folded base board -------------------------------------
  const tally = (target, k, d) => { const dec = Math.abs((Number(target) || 0) % 1) > 0.001 ? 1 : 0; return window.DreamcutMotion.formatNumber(target * k, dec, (d && d.prefix) || "", (d && d.suffix) || ""); };
  function pleatColumn(g, x, base, bw, h, k, col, seed, t) {
    const u = F.u, dep = bw * 0.24, N = Math.max(4, Math.round(h / (38 * u)));
    const hh = h * (0.12 + 0.88 * ease(k)) * (1 + 0.012 * Math.sin(t * 2.1 + seed));
    const pitch = hh / N, zig = (3 + 9 * (1 - ease(k))) * u;
    floorShadow(g, x + bw * 0.6, base + 4 * u, bw * 0.9, 16 * u, 0.28);
    for (let j = 0; j < N; j++) {
      const y0 = base - j * pitch, y1 = y0 - pitch, o0 = (j % 2 ? zig : -zig), o1 = (j % 2 ? -zig : zig);
      const lit = j % 2 ? -0.2 - (1 - k) * 0.15 : 0.12;
      facet(g, [[x + o0, y0], [x + bw + o0, y0], [x + bw + o1, y1], [x + o1, y1]], col, lit, 0.2);
      facet(g, [[x + bw + o0, y0], [x + bw + dep + o0, y0 - dep * 0.6], [x + bw + dep + o1, y1 - dep * 0.6], [x + bw + o1, y1]], col, lit - 0.3, 0.12);
    }
    const top = base - hh, o = N % 2 ? -zig : zig;
    facet(g, [[x + o, top], [x + bw + o, top], [x + bw + dep + o, top - dep * 0.6], [x + dep + o, top - dep * 0.6]], col, 0.32, 0.3);
    return top - dep * 0.6;
  }
  function chart(g, b, q, d, local) {
    const { u, tall, t } = F;
    const vals = (d.values || []).map((v) => Math.max(0, Number(v) || 0));
    const n = Math.max(1, vals.length), max = Math.max(...vals, 1);
    const hi = d.highlight >= 0 && d.highlight < n ? d.highlight : -1;
    const C = tall ? { x: b.x, y: b.y, w: b.w, h: 330 * u } : { x: b.x + b.w * 0.645, y: b.y + 6 * u, w: b.w * 0.355, h: b.h - 140 * u };
    const R = tall ? { x: b.x + 20 * u, y: b.y + (hi >= 0 ? 430 : 80) * u, w: b.w - 40 * u, h: 0 } : { x: b.x + 10 * u, y: b.y + 20 * u, w: hi >= 0 ? b.w * 0.58 : b.w - 20 * u, h: b.h - 120 * u };
    if (tall) R.h = b.y + b.h - 130 * u - R.y;
    const base = R.y + R.h, slot = R.w / n, bw = Math.min(slot * 0.5, 170 * u);
    // Base board: a long folded strip with pleat creases on its front face.
    const kb = ease(span(q, 0, 0.3)), bx0 = R.x - 30 * u, bx1 = lerp(bx0 + 40 * u, R.x + R.w + 20 * u, kb);
    facet(g, [[bx0 + 22 * u, base - 16 * u], [bx1 + 22 * u, base - 16 * u], [bx1, base], [bx0, base]], F.back, 0.18, 0.2);
    facet(g, [[bx0, base], [bx1, base], [bx1, base + 24 * u], [bx0, base + 24 * u]], F.back, -0.14, 0.2);
    for (let x = bx0 + 30 * u; x < bx1; x += 46 * u) crease(g, x, base + 3 * u, x, base + 21 * u, null, 0.12, 1);
    let hot = null;
    vals.forEach((v, i) => {
      const k = span(q, 0.04 + i * 0.09, 0.5 + i * 0.09), cx = R.x + slot * (i + 0.5), x = cx - bw / 2;
      const isHot = i === hi, col = isHot ? F.acc : F.papers[(i + 1) % F.papers.length];
      const h = Math.max(50 * u, (v / max) * (R.h - 160 * u));
      const top = pleatColumn(g, x, base - 8 * u, bw, h, k, col, i * 1.7, t);
      if (k > 0) {
        const tg = tag(g, tally(v, ease(k), d), cx + bw * 0.12, top - 46 * u, (isHot ? 60 : 50) * u, { color: isHot ? F.acc : undefined, fold: isHot ? F.acc : F.papers[(i + 1) % F.papers.length], pad: 20 });
        if (isHot) hot = { cx, top: tg.y, v, label: d.labels[i] || "" };
      }
      txt(g, d.labels[i] || "", cx + bw * 0.12, base + 66 * u, 44 * u, { align: "center", maxW: slot * 0.96, min: 42 * u, weight: 600 });
    });
    // The highlighted column flies a fluttering pennant.
    if (hot) {
      const sx = hot.cx - bw * 0.2, sy = hot.top - 90 * u, f = Math.sin(t * 4.2), len = (64 + 8 * f) * u;
      crease(g, sx, hot.top + 4 * u, sx, sy, null, 0.7, 2.4);
      facet(g, [[sx, sy], [sx + len, sy + 18 * u + 4 * u * f], [sx, sy + 20 * u]], F.acc, 0.2, 0.3);
      facet(g, [[sx, sy + 20 * u], [sx + len, sy + 18 * u + 4 * u * f], [sx, sy + 40 * u]], F.acc, -0.2 + 0.1 * f, 0.3);
    }
    if (hi < 0) return;
    // The readout card stands up beside the chart.
    const kc = ease(span(q, 0.18, 0.55));
    rise(g, C.x, C.y + C.h, kc, () => {
      card(g, C.x, C.y, C.w, C.h, { corner: 60 * u });
      const lx = C.x + 44 * u, lab = d.labels[hi] || "";
      txt(g, lab, lx, C.y + 70 * u, 46 * u, { maxW: C.w - 190 * u, min: 42 * u });
      txt(g, tally(vals[hi], ease(span(q, 0.25, 0.8)), d), lx - 4 * u, C.y + (tall ? 190 : 205) * u, 132 * u, { color: F.acc, weight: 800, maxW: C.w - 90 * u, min: 96 * u });
      const others = vals.filter((_, i) => i !== hi);
      if (others.length) {
        const mean = others.reduce((s, v) => s + v, 0) / others.length, pct = mean > 0 ? Math.round(((vals[hi] - mean) / mean) * 100) : 0;
        txt(g, `${pct >= 0 ? "+" : "−"}${Math.abs(pct)}% vs the rest`, lx, C.y + (tall ? 288 : 310) * u, 42 * u, { color: css(F.inkRGB, 0.72), weight: 600, maxW: C.w - 80 * u });
      }
      gem(g, C.x + C.w - 80 * u, C.y + 130 * u, 34 * u, 5, t * 0.9, 0.3, F.acc, blend(F.acc, F.back, 0.55));
      if (!tall) {
        // A folded ribbon traces every column at the foot of the card.
        const rx0 = C.x + 44 * u, rx1 = C.x + C.w - 44 * u, ry = C.y + C.h - 50 * u, rh = Math.max(40 * u, C.h - 420 * u);
        const pts = vals.map((v, i) => [lerp(rx0, rx1, n > 1 ? i / (n - 1) : 0.5), ry - (v / max) * rh * ease(span(q, 0.4 + i * 0.05, 0.8 + i * 0.05))]);
        for (let i = 0; i < pts.length - 1; i++) {
          const [ax, ay] = pts[i], [bx, by] = pts[i + 1], th = 16 * u;
          facet(g, [[ax, ay], [bx, by], [bx, by + th], [ax, ay + th]], i + 1 === hi || i === hi ? F.acc : F.papers[0], i % 2 ? -0.18 : 0.12, 0.25);
        }
      }
    });
  }

  // ---- object: a folded paper laptop or phone with hanging tags -------------------------------------
  function screen(g, R, phone, q, t) {
    const u = F.u, dark = F.papers[0];
    facet(g, [[R.x, R.y], [R.x + R.w, R.y], [R.x + R.w, R.y + R.h], [R.x, R.y + R.h]], dark, -0.5, 0);
    const P = phone ? { x: R.x + R.w * 0.07, y: R.y + R.h * 0.05, w: R.w * 0.86, h: R.h * 0.4 } : { x: R.x + R.w * 0.04, y: R.y + R.h * 0.07, w: R.w * 0.54, h: R.h * 0.5 };
    // Preview: a folded landscape with a turning sun and a drifting paper cloud.
    const kp = ease(span(q, 0.05, 0.4));
    g.save(); path(g, [[P.x, P.y], [P.x + P.w, P.y], [P.x + P.w, P.y + P.h], [P.x, P.y + P.h]]); g.clip();
    facet(g, [[P.x, P.y], [P.x + P.w, P.y], [P.x + P.w, P.y + P.h], [P.x, P.y + P.h]], F.papers[1], 0.55, 0);
    const sun = [P.x + P.w * 0.72, P.y + P.h * (0.36 + (1 - kp) * 0.5)];
    gem(g, sun[0], sun[1], P.h * 0.13, 8, t * 0.5, 1.4, F.acc, blend(F.acc, F.back, 0.4), 0.2, 0.2);
    const cl = P.x + frac(t * 0.05) * (P.w + 120 * u) - 60 * u;
    facet(g, [[cl - 40 * u, P.y + P.h * 0.26], [cl, P.y + P.h * 0.15], [cl + 50 * u, P.y + P.h * 0.26]], F.back, 0.1, 0.2);
    [[0, 0.55, 0.42, F.papers[0]], [0.3, 0.75, 0.6, F.papers[3]], [0.62, 0.45, 0.5, F.papers[0]]].forEach(([a, w, hgt, col]) => {
      const x0 = P.x + P.w * a, x1 = x0 + P.w * w, pk = x0 + (x1 - x0) * 0.45, y = P.y + P.h, top = y - P.h * hgt * kp;
      facet(g, [[x0, y], [pk, top], [pk, y]], col, 0.05, 0.2);
      facet(g, [[pk, top], [x1, y], [pk, y]], col, -0.3, 0.2);
    });
    g.restore();
    let card2 = null;
    if (!phone) {
      // Beside the preview: a proposal card folding open, with lines and an Apply tab.
      const C = { x: R.x + R.w * 0.62, y: R.y + R.h * 0.07, w: R.w * 0.34, h: R.h * 0.5 }, kc = ease(span(q, 0.2, 0.55));
      flap(g, [[C.x, C.y], [C.x + C.w, C.y], [C.x + C.w, C.y + C.h], [C.x, C.y + C.h]], [C.x, C.y], [C.x, C.y + C.h], 1 - kc, F.back, F.papers[1], 0.12);
      if (kc > 0.5) {
        for (let i = 0; i < 3; i++) facet(g, [[C.x + C.w * 0.1, C.y + C.h * (0.16 + i * 0.16)], [C.x + C.w * (i === 2 ? 0.55 : 0.88), C.y + C.h * (0.16 + i * 0.16)], [C.x + C.w * (i === 2 ? 0.55 : 0.88), C.y + C.h * (0.22 + i * 0.16)], [C.x + C.w * 0.1, C.y + C.h * (0.22 + i * 0.16)]], F.papers[0], -0.15, 0);
        const pulse = 0.5 + 0.5 * Math.sin(t * 3);
        facet(g, [[C.x + C.w * 0.1, C.y + C.h * 0.68], [C.x + C.w * 0.9, C.y + C.h * 0.68], [C.x + C.w * 0.9, C.y + C.h * 0.88], [C.x + C.w * 0.1, C.y + C.h * 0.88]], F.acc, -0.05 + pulse * 0.12, 0.3);
      }
      card2 = C;
    }
    // Tracks of folded strips; one proposed strip in the accent with a marching dashed edge.
    const T = phone ? { x: R.x + R.w * 0.07, y: R.y + R.h * 0.52, w: R.w * 0.86, h: R.h * 0.4 } : { x: R.x + R.w * 0.04, y: R.y + R.h * 0.64, w: R.w * 0.92, h: R.h * 0.3 };
    const rows = [[[0, 0.24], [0.27, 0.3, 1], [0.6, 0.38]], [[0.05, 0.4], [0.5, 0.34]], [[0, 0.62], [0.66, 0.3]]];
    const rh = T.h / 3, anchors = [[sun[0], sun[1]]];
    rows.forEach((clips, r) => clips.forEach(([a, w, isHot], i) => {
      const k = ease(span(q, 0.15 + (r * 3 + i) * 0.05, 0.45 + (r * 3 + i) * 0.05));
      if (k <= 0) return;
      const x = T.x + T.w * a, y = T.y + r * rh + rh * 0.14, cw = T.w * w * k, ch = rh * 0.72;
      const col = isHot ? F.acc : r === 2 ? F.papers[2] : F.papers[1];
      facet(g, [[x, y], [x + cw * 0.5, y], [x + cw * 0.42, y + ch], [x, y + ch]], col, 0.1, 0.15);
      facet(g, [[x + cw * 0.5, y], [x + cw, y], [x + cw, y + ch], [x + cw * 0.42, y + ch]], col, -0.15, 0.15);
      if (isHot) {
        g.save(); g.strokeStyle = tone(F.back, 0.4); g.lineWidth = 2.4 * u; g.setLineDash([9 * u, 6 * u]); g.lineDashOffset = -t * 30 * u;
        g.strokeRect(x - 5 * u, y - 5 * u, cw + 10 * u, ch + 10 * u); g.restore();
        anchors.push([x + cw * 0.5, y + ch * 0.5]);
      }
      if (r === 2 && i === 0) anchors.push([x + cw * 0.3, y + ch * 0.5]);
    }));
    if (q > 0.5) {
      const px = T.x + T.w * frac(t * 0.1 + 0.2);
      facet(g, [[px - 2 * u, T.y - 6 * u], [px + 2 * u, T.y - 6 * u], [px + 2 * u, T.y + T.h], [px - 2 * u, T.y + T.h]], F.back, 0.3, 0);
      facet(g, [[px - 10 * u, T.y - 18 * u], [px + 10 * u, T.y - 18 * u], [px, T.y - 4 * u]], F.acc, 0.1, 0);
    }
    return anchors;
  }
  // A lid of coloured paper with its edges folded in, showing the white back as a frame.
  function lid(g, x, y, w, h, fold) {
    const col = F.papers[3];
    facet(g, [[x, y], [x + w, y], [x + w / 2, y + h / 2]], col, 0.1, 0.25);
    facet(g, [[x + w, y], [x + w, y + h], [x + w / 2, y + h / 2]], col, -0.18, 0.25);
    facet(g, [[x + w, y + h], [x, y + h], [x + w / 2, y + h / 2]], col, -0.08, 0.25);
    facet(g, [[x, y + h], [x, y], [x + w / 2, y + h / 2]], col, 0.18, 0.25);
    facet(g, [[x, y], [x + w, y], [x + w - fold, y + fold], [x + fold, y + fold]], F.back, 0.2, 0.3);
    facet(g, [[x + w, y], [x + w, y + h], [x + w - fold, y + h - fold], [x + w - fold, y + fold]], F.back, -0.12, 0.3);
    facet(g, [[x + w, y + h], [x, y + h], [x + fold, y + h - fold], [x + w - fold, y + h - fold]], F.back, -0.04, 0.3);
    facet(g, [[x, y + h], [x, y], [x + fold, y + fold], [x + fold, y + h - fold]], F.back, 0.1, 0.3);
    return { x: x + fold * 1.6, y: y + fold * 1.6, w: w - fold * 3.2, h: h - fold * 3.2 };
  }
  function object(g, b, q, d, local) {
    const { u, tall, t } = F, phone = d.kind === "phone";
    let anchors = [], tags = [];
    if (!phone) {
      const sw = tall ? b.w * 0.86 : Math.min(b.w * 0.52, (b.h - 170 * u) / 0.66), sh = sw * 0.64;
      const x0 = tall ? b.x + (b.w - sw) / 2 : b.x + 40 * u, hinge = tall ? b.y + 40 * u + sh : b.y + b.h - 150 * u, by = hinge + 80 * u;
      floorShadow(g, x0 + sw / 2 + 30 * u, by + 6 * u, sw * 0.7, 30 * u, 0.3);
      const kd = ease(span(q, 0, 0.3));
      rise(g, x0, by, kd, () => {
        facet(g, [[x0 - 46 * u, by], [x0 + sw + 46 * u, by], [x0 + sw, hinge], [x0, hinge]], F.papers[3], 0.18, 0.25);
        facet(g, [[x0 - 46 * u, by], [x0 + sw + 46 * u, by], [x0 + sw + 46 * u, by + 16 * u], [x0 - 46 * u, by + 16 * u]], F.papers[3], -0.3, 0.2);
        for (let r = 1; r < 4; r++) { const yy = lerp(hinge, by, r / 4), xl = lerp(x0, x0 - 46 * u, r / 4) + 30 * u, xr = lerp(x0 + sw, x0 + sw + 46 * u, r / 4) - 30 * u; crease(g, xl, yy, xr, yy, [10, 8], 0.18, 1.4); }
        facet(g, [[x0 + sw * 0.38, by - 22 * u], [x0 + sw * 0.62, by - 22 * u], [x0 + sw * 0.6, by - 6 * u], [x0 + sw * 0.4, by - 6 * u]], F.back, -0.1, 0.2);
      });
      const kl = ease(span(q, 0.08, 0.42));
      rise(g, x0, hinge, kl, () => {
        const R = lid(g, x0, hinge - sh, sw, sh, 16 * u);
        anchors = screen(g, R, false, span(q, 0.2, 0.9), t);
      }, 0.6);
      if (tall) tags = [0, 1, 2].map((i) => ({ x: b.x + 40 * u, y: by + 110 * u + i * 128 * u, maxW: b.w - 80 * u }));
      else { const lx = x0 + sw + 150 * u; tags = [0, 1, 2].map((i) => ({ x: lx, y: b.y + b.h * (0.12 + i * 0.3), maxW: b.x + b.w - lx })); }
    } else {
      const ph = tall ? Math.min(b.h * 0.62, (b.w * 0.42) * 1.9) : b.h - 70 * u, pw = ph / 1.9;
      const x0 = tall ? b.x + 20 * u : b.x + b.w * 0.26, by = b.y + (tall ? ph + 40 * u : b.h - 30 * u);
      floorShadow(g, x0 + pw * 0.6, by + 4 * u, pw * 0.8, 24 * u, 0.3);
      const kl = ease(span(q, 0, 0.4));
      rise(g, x0, by, kl, () => {
        facet(g, [[x0 + pw * 0.55, by], [x0 + pw * 1.05, by], [x0 + pw * 0.62, by - ph * 0.45]], F.papers[3], -0.35, 0.2);
        const R = lid(g, x0, by - ph, pw, ph, 14 * u);
        anchors = screen(g, R, true, span(q, 0.15, 0.9), t);
      }, 0.6);
      const lx = x0 + pw + (tall ? 90 : 190) * u;
      tags = [0, 1, 2].map((i) => ({ x: lx, y: b.y + (tall ? ph * (0.15 + i * 0.32) + 40 * u : b.h * (0.14 + i * 0.32)), maxW: b.x + b.w - lx }));
    }
    // Tags hang on threads from the parts they name, swinging slightly.
    d.callouts.forEach((label, i) => {
      if (!label || !anchors[i]) return;
      const k = ease(span(q, 0.42 + i * 0.12, 0.72 + i * 0.12));
      if (k <= 0) return;
      const T = tags[i], [ax, ay] = anchors[i], sw = Math.sin(t * 1.3 + i * 2.1) * 0.03;
      const tx = T.x, ty = T.y;
      g.save(); g.strokeStyle = css(F.inkRGB, 0.55); g.lineWidth = 2 * u; g.beginPath(); g.moveTo(ax, ay);
      g.lineTo(lerp(ax, tx, k), lerp(ay, ty, k)); g.stroke(); g.restore();
      gem(g, ax, ay, 9 * u, 4, t + i, 0.6, F.acc, blend(F.acc, F.back, 0.5));
      if (k < 0.6) return;
      g.save(); g.translate(tx, ty); g.rotate(sw); g.translate(-tx, -ty);
      rise(g, tx, ty + 34 * u, span(k, 0.6, 1), () => tag(g, label, tx, ty, 44 * u, { align: "left", maxW: T.maxW, min: 42 * u, fold: i === 1 ? F.acc : F.papers[1] }));
      g.restore();
    });
  }

  // ---- people: folded figures under a bunting garland -----------------------------------------------
  function person(g, cx, base, Hf, col, i, hot, t) {
    const u = F.u, top = base - Hf * 0.66, hw = Hf * 0.27;
    floorShadow(g, cx + 10 * u, base, hw * 1.3, 14 * u, 0.28);
    const sway = Math.sin(t * 1.2 + i * 1.9) * 0.025;
    g.save(); g.translate(cx, base); g.rotate(sway); g.translate(-cx, -base);
    // Robe: two facets split down the middle, a white collar fold and a hem fold.
    facet(g, [[cx, top], [cx - hw, base], [cx, base]], col, 0.14, 0.25);
    facet(g, [[cx, top], [cx + hw, base], [cx, base]], col, -0.22, 0.25);
    facet(g, [[cx - hw, base], [cx + hw, base], [cx + hw * 0.93, base - Hf * 0.05], [cx - hw * 0.93, base - Hf * 0.05]], F.back, -0.05, 0.2);
    facet(g, [[cx - Hf * 0.07, top + Hf * 0.01], [cx + Hf * 0.07, top + Hf * 0.01], [cx, top + Hf * 0.16]], F.back, 0.15, 0.25);
    // Arms: folded flaps; the highlighted figure waves.
    const wave = hot ? Math.sin(t * 5) * 0.35 - 0.9 : 0.1 * Math.sin(t * 1.4 + i);
    const sh = [cx + Hf * 0.06, top + Hf * 0.1];
    g.save(); g.translate(sh[0], sh[1]); g.rotate(wave);
    facet(g, [[0, 0], [Hf * 0.2, Hf * 0.24], [Hf * 0.08, Hf * 0.26]], col, -0.35, 0.25);
    g.restore();
    facet(g, [[cx - Hf * 0.06, top + Hf * 0.1], [cx - Hf * 0.2, top + Hf * 0.34], [cx - Hf * 0.08, top + Hf * 0.32]], col, 0.25, 0.25);
    // Head: a faceted hexagon with a folded cap, a bob or a plain crown.
    const hx = cx, hy = top - Hf * 0.12, hr = Hf * 0.12, skin = F.skin;
    for (let s = 0; s < 6; s++) {
      const a0 = -Math.PI / 2 + (s * TAU) / 6, a1 = a0 + TAU / 6;
      facet(g, [[hx, hy], [hx + Math.cos(a0) * hr, hy + Math.sin(a0) * hr], [hx + Math.cos(a1) * hr, hy + Math.sin(a1) * hr]], skin, [0.12, -0.08, -0.2, -0.1, 0.08, 0.18][s], 0.2);
    }
    const style = i % 3, hair = hot ? F.acc : F.papers[(i + 2) % F.papers.length];
    if (style === 0) facet(g, [[hx - hr * 1.05, hy - hr * 0.3], [hx, hy - hr * 1.9], [hx + hr * 1.05, hy - hr * 0.3]], hair, 0.05, 0.25);
    else if (style === 1) { facet(g, [[hx - hr * 1.1, hy + hr * 0.4], [hx - hr * 0.9, hy - hr * 0.9], [hx, hy - hr * 1.15], [hx - hr * 0.3, hy - hr * 0.2]], hair, 0.12, 0.25); facet(g, [[hx, hy - hr * 1.15], [hx + hr * 0.9, hy - hr * 0.9], [hx + hr * 1.1, hy + hr * 0.4], [hx + hr * 0.3, hy - hr * 0.2]], hair, -0.2, 0.25); }
    else facet(g, [[hx - hr * 0.9, hy - hr * 0.5], [hx + hr * 0.9, hy - hr * 0.5], [hx + hr * 0.5, hy - hr * 1.1], [hx - hr * 0.5, hy - hr * 1.1]], hair, -0.05, 0.25);
    const blink = frac(t * 0.31 + i * 0.23) < 0.03 ? 0.2 : 1;
    g.fillStyle = css(F.inkRGB, 0.85 * (1 - DIM));
    for (const e of [-1, 1]) { g.beginPath(); g.ellipse(hx + e * hr * 0.38, hy + hr * 0.1, hr * 0.09, hr * 0.12 * blink, 0, 0, TAU); g.fill(); }
    g.restore();
  }
  function people(g, b, q, d, local) {
    const { u, tall, t } = F;
    const n = Math.max(2, Math.min(6, Math.round(d.count) || 4)), slot = b.w / n;
    const base = b.y + b.h - 30 * u, Hf = Math.min(b.h * (tall ? 0.48 : 0.6), slot * (tall ? 1.5 : 1.1));
    const hi = Math.min(n - 1, d.highlight ?? 1);
    // Bunting: pennants on a sagging string, swinging on their own.
    const gy = tall ? base - Hf * 1.08 - 330 * u : b.y - 30 * u, kg = ease(span(q, 0, 0.5)), sx0 = b.x - 40 * u, sx1 = b.x + b.w + 40 * u;
    const sag = (x) => gy + Math.sin(((x - sx0) / (sx1 - sx0)) * Math.PI) * 50 * u;
    g.save(); g.strokeStyle = css(F.inkRGB, 0.45); g.lineWidth = 1.6 * u; g.beginPath();
    for (let i = 0; i <= 30; i++) { const x = lerp(sx0, lerp(sx0, sx1, kg), i / 30); if (i) g.lineTo(x, sag(x)); else g.moveTo(x, sag(x)); }
    g.stroke(); g.restore();
    const np = Math.round((sx1 - sx0) / (70 * u));
    for (let j = 0; j < np; j++) {
      const x = sx0 + (j + 0.5) * ((sx1 - sx0) / np);
      if ((x - sx0) / (sx1 - sx0) > kg) break;
      const y = sag(x), a = Math.sin(t * 1.6 + j * 0.8) * 0.12, pw = 26 * u, phh = 48 * u, col = j % 3 === 1 ? F.acc : F.papers[j % F.papers.length];
      g.save(); g.translate(x, y); g.rotate(a);
      facet(g, [[-pw, 0], [0, 0], [0, phh]], col, 0.12, 0.25);
      facet(g, [[0, 0], [pw, 0], [0, phh]], col, -0.2, 0.25);
      g.restore();
    }
    for (let i = 0; i < n; i++) {
      const k = ease(span(q, 0.05 + i * 0.07, 0.42 + i * 0.07)), cx = b.x + slot * (i + 0.5), isHot = i === hi;
      const H2 = Hf * (isHot ? 1.08 : 1), col = isHot ? F.acc : F.papers[i % F.papers.length];
      rise(g, cx, base, k, () => person(g, cx, base, H2, col, i, isHot, t));
      const label = d.badges[i % d.badges.length];
      if (!label) continue;
      const kb = ease(span(q, 0.3 + i * 0.07, 0.6 + i * 0.07));
      const lw = measure(g, label, 44 * u, 700) + 52 * u, crowded = lw > slot * 0.96;
      const by = base - H2 * 0.96 - 70 * u - (crowded && i % 2 ? 84 * u : 0);
      if (kb > 0) rise(g, cx, by + 34 * u, kb, () => tag(g, label, cx, by, 44 * u, { color: isHot ? F.acc : undefined, fold: isHot ? F.acc : F.papers[i % F.papers.length] }));
    }
  }

  // ---- process: three fold-diagram cards joined by diagram arrows -----------------------------------
  function diamond(cx, cy, r) { return [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]]; }
  function diagram(g, step, cx, cy, s, q, t) {
    const u = F.u, r = s * 0.42;
    if (step === 0) {
      // A sheet with a dashed valley line and a curled arrow: fold this.
      const D = diamond(cx, cy, r), lift = (0.06 + 0.06 * Math.sin(t * 2.2)) * ease(q);
      facet(g, [D[3], D[0], D[1]], F.papers[1], 0.15, 0.25);
      flap(g, [D[3], D[2], D[1]], D[3], D[1], lift, F.papers[1], blend(F.back, F.papers[1], 0.3), -0.05);
      crease(g, D[3][0], D[3][1], D[1][0], D[1][1], [10, 8], 0.75, 2.2);
      const k = ease(span(q, 0.2, 0.8));
      if (k > 0) {
        g.save(); g.strokeStyle = css(F.inkRGB, 0.8 * (1 - DIM)); g.lineWidth = 3 * u; g.lineCap = "round";
        g.beginPath(); g.arc(cx + r * 0.62, cy, r * 0.62, Math.PI * 0.45, Math.PI * 0.45 - Math.PI * 0.95 * k, true); g.stroke();
        if (k > 0.95) { const a = Math.PI * 0.45 - Math.PI * 0.95, ex = cx + r * 0.62 + Math.cos(a) * r * 0.62, ey = cy + Math.sin(a) * r * 0.62; g.beginPath(); g.moveTo(ex - 14 * u, ey - 6 * u); g.lineTo(ex, ey); g.lineTo(ex - 4 * u, ey + 15 * u); g.stroke(); }
        g.restore();
      }
    } else if (step === 1) {
      // The flap folding over and back again, white side flashing as it passes upright.
      const D = diamond(cx, cy, r), k = 0.15 + 0.7 * (0.5 - 0.5 * Math.cos(t * 1.9)) * ease(q);
      facet(g, [D[0], D[1], D[2]], F.papers[2], -0.1, 0.25);
      crease(g, D[0][0], D[0][1], D[2][0], D[2][1], [14, 6, 3, 6], 0.6, 2);
      flap(g, [D[0], D[3], D[2]], D[0], D[2], k, F.papers[2], blend(F.back, F.papers[2], 0.3), 0.15);
    } else {
      // The finished boat, bobbing on a folded wave strip, with a check seal.
      const wy = cy + r * 0.55, kb = ease(q);
      boat(g, cx - r * 0.05, wy - 4 * u + Math.sin(t * 1.8) * 4 * u, r * 1.5 * kb + 1, F.papers[0], F.acc, Math.sin(t * 1.5) * 0.05);
      for (let x = cx - r * 1.1, j = 0; x < cx + r * 1.1; x += r * 0.37, j++) {
        const A = r * 0.14 * (0.8 + 0.2 * Math.sin(t * 2 + j));
        facet(g, [[x, wy + r * 0.12], [x + r * 0.185, wy + r * 0.12 - A], [x + r * 0.185, wy + r * 0.12]], F.papers[1], 0.15, 0.2);
        facet(g, [[x + r * 0.185, wy + r * 0.12 - A], [x + r * 0.37, wy + r * 0.12], [x + r * 0.185, wy + r * 0.12]], F.papers[1], -0.2, 0.2);
      }
      rosette(g, cx + r * 0.85, cy - r * 0.7, r * 0.3, span(q, 0.5, 1), t * 0.4);
    }
  }
  function process(g, b, q, d, local) {
    const { u, tall, t } = F, n = d.steps.length, gap = (tall ? 70 : 120) * u;
    const cw = tall ? b.w : (b.w - gap * (n - 1)) / n, ch = tall ? (b.h - gap * (n - 1)) / n : Math.min(b.h - 30 * u, cw * 1.18);
    const cards = [];
    for (let i = 0; i < n; i++) {
      const x = tall ? b.x : b.x + i * (cw + gap), y = tall ? b.y + i * (ch + gap) : b.y + (b.h - ch) / 2;
      const k = ease(span(q, 0.04 + i * 0.14, 0.4 + i * 0.14));
      cards.push({ x, y });
      rise(g, x, y + ch, k, () => {
        card(g, x, y, cw, ch, { corner: 50 * u, fold: i === n - 1 ? F.acc : F.papers[i % F.papers.length] });
        const s = tall ? Math.min(ch * 0.92, cw * 0.44) : Math.min(cw * 0.72, ch * 0.58);
        const dcx = tall ? x + 50 * u + s / 2 : x + cw / 2, dcy = tall ? y + ch / 2 : y + 60 * u + s * 0.52;
        diagram(g, Math.min(i, 2), dcx, dcy, s, span(q, 0.12 + i * 0.14, 0.6 + i * 0.14), t);
        // Step number in a folded square badge.
        const nx = x + 54 * u, ny = y + 54 * u, nr = 34 * u;
        facet(g, diamond(nx, ny, nr), i === n - 1 ? F.acc : F.papers[0], 0.05, 0.3);
        facet(g, [[nx - nr, ny], [nx, ny + nr], [nx + nr, ny]], i === n - 1 ? F.acc : F.papers[0], -0.2, 0.2);
        txt(g, String(i + 1), nx, ny + 2 * u, 34 * u, { align: "center", color: tone(F.back, 0.3), weight: 800 });
        if (tall) txt(g, d.steps[i], x + 90 * u + s, y + ch / 2, 46 * u, { maxW: cw - s - 130 * u, min: 42 * u });
        else txt(g, d.steps[i], x + cw / 2, y + ch - 58 * u, 46 * u, { align: "center", maxW: cw - 50 * u, min: 42 * u });
      });
      floorShadow(g, x + cw / 2 + 14 * u, y + ch + 8 * u, cw * 0.55, 18 * u, 0.22 * k);
    }
    // Diagram arrows between the cards, drawing on, with marching dashes once drawn.
    for (let i = 0; i < n - 1; i++) {
      const k = ease(span(q, 0.28 + i * 0.16, 0.5 + i * 0.16));
      if (k <= 0) continue;
      g.save(); g.strokeStyle = css(F.accRGB, 0.95 * (1 - DIM)); g.lineWidth = 5 * u; g.lineCap = "round"; g.lineJoin = "round";
      g.setLineDash([16 * u, 10 * u]); g.lineDashOffset = -t * 40 * u;
      let ex, ey, ang;
      g.beginPath();
      if (tall) {
        const x = b.x + cw - 70 * u, y0 = cards[i].y + ch - 10 * u, y1 = cards[i + 1].y + 10 * u, xm = x + 70 * u;
        const P = (s) => [lerp(lerp(x, xm, s), lerp(xm, x, s), s), lerp(y0, y1, s)];
        for (let s = 0; s <= 1.0001; s += 0.05) { const [px, py] = P(s * k); if (s) g.lineTo(px, py); else g.moveTo(px, py); }
        [ex, ey] = P(k); const [qx, qy] = P(Math.max(0, k - 0.05)); ang = Math.atan2(ey - qy, ex - qx);
      } else {
        const x0 = cards[i].x + cw - 30 * u, x1 = cards[i + 1].x + 30 * u, y = cards[i].y + ch * 0.32, top = y - 110 * u;
        const P = (s) => [lerp(x0, x1, s), y - Math.sin(s * Math.PI) * (y - top)];
        for (let s = 0; s <= 1.0001; s += 0.05) { const [px, py] = P(s * k); if (s) g.lineTo(px, py); else g.moveTo(px, py); }
        [ex, ey] = P(k); const [qx, qy] = P(Math.max(0, k - 0.05)); ang = Math.atan2(ey - qy, ex - qx);
      }
      g.stroke(); g.setLineDash([]);
      g.translate(ex, ey); g.rotate(ang);
      g.beginPath(); g.moveTo(-20 * u, -13 * u); g.lineTo(0, 0); g.lineTo(-20 * u, 13 * u); g.stroke();
      g.restore();
    }
  }

  // ---- compare: two pleated fans opening to their values --------------------------------------------
  function fan(g, cx, cy, R, ang, col, back, t, seed) {
    const u = F.u, K = 14, a0 = -Math.PI / 2 - ang / 2;
    floorShadow(g, cx + 10 * u, cy + 18 * u, R * Math.max(0.25, Math.sin(Math.min(ang, Math.PI) / 2)) * 0.9, 18 * u, 0.25);
    for (let j = 0; j < K; j++) {
      const s0 = a0 + (ang * j) / K, s1 = a0 + (ang * (j + 1)) / K, ro = R, ri = R * 0.3;
      const p = (a, r) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
      const lit = j % 2 ? -0.18 : 0.14;
      facet(g, [p(s0, ri), p(s0, ro), p(s1, ro * 0.985), p(s1, ri)], j % 2 ? back : col, lit + Math.cos((s0 + s1) / 2 + 2.2) * 0.08, 0.2);
    }
    // Guard sticks and the rivet.
    for (const a of [a0, a0 + ang]) {
      const p = (r) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r], nx = -Math.sin(a) * 6 * u, ny = Math.cos(a) * 6 * u;
      const A = p(0), B = p(R * 1.02);
      facet(g, [[A[0] - nx, A[1] - ny], [B[0] - nx * 0.5, B[1] - ny * 0.5], [B[0] + nx * 0.5, B[1] + ny * 0.5], [A[0] + nx, A[1] + ny]], F.papers[0], -0.2, 0.2);
    }
    gem(g, cx, cy, 14 * u, 6, t + seed, 1.2, F.back, F.papers[0], 0.3, 0.3);
  }
  function compare(g, b, q, d, local) {
    const { u, tall, t } = F;
    const vals = [Math.max(0, Number(d.leftValue) || 0), Math.max(0, Number(d.rightValue) || 0)], max = Math.max(...vals, 1);
    const gap = 60 * u, hw = tall ? b.w : (b.w - gap) / 2, hh = tall ? (b.h - gap) / 2 : b.h;
    const sides = [[d.left, vals[0], F.papers[0], blend(F.papers[0], F.back, 0.7)], [d.right, vals[1], F.acc, blend(F.acc, F.back, 0.65)]];
    const centres = [];
    sides.forEach(([label, v, col, back], i) => {
      const x = tall ? b.x : b.x + i * (hw + gap), y = tall ? b.y + i * (hh + gap) : b.y;
      const k = ease(span(q, 0.05 + i * 0.18, 0.55 + i * 0.18));
      const ch = (tall ? 200 : 220) * u, cy = y + hh - ch - 10 * u, R = Math.min(hw * 0.4, cy - y - 30 * u), cx = x + hw / 2;
      const ang = lerp(0.1, lerp(0.8, 2.9, v / max) + 0.03 * Math.sin(t * 1.6 + i * 2), k);
      fan(g, cx, cy, R, ang, col, back, t, i * 3);
      centres.push([cx, cy - R * 0.6]);
      // Label and figure on a card standing in front of the fan's rivet.
      const tw = Math.min(hw * 0.86, 640 * u), tx = cx - tw / 2, ty = cy + 6 * u;
      rise(g, tx, ty + ch, ease(span(q, 0.1 + i * 0.18, 0.45 + i * 0.18)), () => {
        card(g, tx, ty, tw, ch, { corner: 46 * u, fold: col });
        const nw = measure(g, tally(v, 1, d), (tall ? 112 : 124) * u, 800);
        txt(g, tally(v, k, d), tx + tw - 40 * u, ty + ch * 0.55, (tall ? 112 : 124) * u, { align: "right", weight: 800, color: i ? F.acc : undefined, maxW: tw * 0.45, min: 96 * u });
        txt(g, label, tx + 40 * u, ty + ch * 0.52, 46 * u, { maxW: tw - Math.min(nw, tw * 0.45) - 110 * u, min: 42 * u, color: i ? F.acc : undefined });
      });
    });
    // A folded arrow tag between the two, carrying the change.
    const kd = ease(span(q, 0.55, 0.85));
    if (kd > 0 && vals[0] > 0) {
      const pct = Math.round(((vals[1] - vals[0]) / vals[0]) * 100), s = `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%`;
      const ax = tall ? b.x + b.w - 150 * u : b.x + hw + gap / 2, ay = (tall ? b.y + hh * 0.35 : b.y + hh * 0.42) + Math.sin(t * 1.4) * 6 * u;
      rise(g, ax, ay + 40 * u, kd, () => tag(g, s, ax, ay, 50 * u, { color: F.acc, fold: F.acc }));
    }
  }

  // ---- title and closing worlds ----------------------------------------------------------------------
  // The blintz: a two-tone square whose four corners fold to its centre one after another.
  function blintz(g, cx, cy, r, local, t) {
    const u = F.u, spin = -0.3 + 0.3 * ease(span(local, 0, 0.6)) + Math.sin(t * 0.6) * 0.06, hover = Math.sin(t * 1.3) * 10 * u;
    g.save(); g.translate(cx, cy + hover); g.rotate(spin);
    const D = diamond(0, 0, r), mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    floorShadow(g, 0, r * 1.25 - hover, r * 0.9, r * 0.12, 0.2);
    // Base square with its quarter creases.
    facet(g, [D[0], D[1], [0, 0]], F.papers[0], 0.12, 0.25); facet(g, [D[1], D[2], [0, 0]], F.papers[0], -0.12, 0.25);
    facet(g, [D[2], D[3], [0, 0]], F.papers[0], -0.02, 0.25); facet(g, [D[3], D[0], [0, 0]], F.papers[0], 0.2, 0.25);
    for (let i = 0; i < 4; i++) {
      const c = D[i], a = mid(D[(i + 3) % 4], c), b = mid(c, D[(i + 1) % 4]);
      const k = ease(span(local, 0.45 + i * 0.32, 0.85 + i * 0.32)) * 0.999 + 0.0005 * Math.sin(t);
      flap(g, [a, c, b], a, b, k, F.papers[0], F.back, [0.12, -0.12, -0.02, 0.2][i]);
    }
    const kc = span(local, 1.8, 2.3);
    if (kc > 0) crease(g, -r * 0.5 * kc, 0, r * 0.5 * kc, 0, [8, 7], 0.5, 2);
    g.restore();
  }
  function statementArt(g, id, local, hold, exit) {
    const { W, H, u, t, tall } = F;
    // After a drawn scene, wait for it to fold flat and fade before the sea comes up under it.
    const lag = 0;
    local -= lag;
    const k = ease(span(local, 0, 0.42));
    const B = headBox(id);
    const seaY = H * (tall ? 0.8 : 0.79);
    sea(g, seaY, k, t);
    // A small fleet sails across; the lead boat carries the accent.
    const fleet = tall ? [[0.22, 120, 0], [0.62, 160, 1], [0.86, 90, 2]] : [[0.12, 130, 0], [0.34, 170, 1], [0.62, 110, 2], [0.84, 140, 3]];
    fleet.forEach(([fx, s, i]) => {
      const drift = ((t * 18 * u + i * 220 * u) % (W + 400 * u)) - 200 * u;
      const x = id === "closing" ? lerp(W * fx - 120 * u, W * fx, ease(span(local, 0, 1.6))) : (fx * W + drift * 0.25) % (W + 200 * u);
      const kb = ease(span(local, 0.1 + i * 0.12, 0.7 + i * 0.12));
      if (kb <= 0) return;
      const wy = seaY + 30 * u + Math.sin(t * 1.6 + i * 1.3) * 7 * u;
      rise(g, x, wy, kb, () => boat(g, x, wy, s * u, F.papers[(i + 1) % F.papers.length], i === 1 ? F.acc : F.back, Math.sin(t * 1.4 + i) * 0.06));
    });
    // A mobile of folded gems hangs above the card, each strand turning on its own.
    const top = B ? B.y - 40 * u : H * 0.3, strands = tall ? [0.18, 0.5, 0.82] : [0.1, 0.27, 0.45, 0.63];
    strands.forEach((fx, i) => {
      const len = Math.max(60 * u, top - 30 * u) * (0.55 + 0.35 * ((i * 7) % 3) / 2), ax = W * fx, sw = Math.sin(t * 0.8 + i * 1.7) * 0.04, kk = ease(span(local, 0.1 + i * 0.1, 0.9 + i * 0.1));
      if (kk <= 0) return;
      const ex = ax + Math.sin(sw) * len, ey = Math.cos(sw) * len * kk;
      g.save(); g.strokeStyle = css(F.inkRGB, 0.3); g.lineWidth = 1.2 * u; g.beginPath(); g.moveTo(ax, 0); g.lineTo(ex, ey); g.stroke(); g.restore();
      for (let j = 0; j < 3; j++) {
        const f = (j + 1) / 3, gx = lerp(ax, ex, f), gy = ey * f - 22 * u * (j === 2 ? 0 : 1), col = F.papers[(i + j) % F.papers.length];
        if (gy < 30 * u) continue;
        gem(g, gx, gy, (14 + j * 5) * u, j === 2 ? 6 : 4, t * (0.8 + j * 0.3) + i, 0.3, j === 2 && i === 1 ? F.acc : col, blend(col, F.back, 0.55));
      }
    });
    if (id === "title") {
      // The centrepiece folds beside or above the words.
      const right = B ? B.x + B.w : W * 0.6;
      let cx, cy, r;
      if (tall) { r = 170 * u; cx = W / 2; cy = B ? Math.max(r + 60 * u, B.y - r - 110 * u) : H * 0.22; }
      else { r = Math.min(200 * u, (W - right - 120 * u) / 2.2); cx = W - r * 1.25 - 60 * u; cy = B ? B.y + B.h / 2 : H * 0.45; }
      if (r > 90 * u) blintz(g, cx, cy, r, local, t);
    } else {
      // The closing seal lands on the card's lower right; folded confetti drifts down to the end.
      const r = rng(5150);
      for (let i = 0; i < 30; i++) {
        const sp = 0.05 + r() * 0.05, ph = r(), x0 = r() * W, sz = (10 + r() * 14) * u, col = F.papers[i % F.papers.length], sw = r() * TAU;
        const y = frac(t * sp + ph) * (H * 0.9) - 40 * u, x = x0 + Math.sin(t * 0.8 + sw) * 30 * u, flip = Math.cos(t * (1.5 + r()) + sw);
        const kc = ease(span(local, 0.1 + r() * 0.5, 0.9 + r() * 0.5));
        if (y > seaY || kc <= 0) continue;
        g.save(); g.globalAlpha *= kc; g.translate(x, y); g.rotate(sw + t * 0.4); g.scale(1, Math.max(0.08, Math.abs(flip)));
        facet(g, i % 2 ? [[-sz, sz * 0.6], [0, -sz], [sz, sz * 0.6]] : [[-sz, -sz], [sz, -sz], [sz, sz], [-sz, sz]], flip > 0 ? col : F.back, flip > 0 ? 0.05 : -0.05, 0);
        g.restore();
      }
      if (B) rosette(g, Math.min(W - 110 * u, B.x + B.w + 10 * u), B.y + B.h + 34 * u, 74 * u, span(local, 0.7, 1.3), t * 0.35);
    }
  }

  // ---- frame assembly ----------------------------------------------------------------------------------
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
    const data = {
      chart: { labels: [c.bar_1_label, c.bar_2_label, c.bar_3_label, c.bar_4_label], values: [c.bar_1, c.bar_2, c.bar_3, c.bar_4], suffix: c.chart_suffix, prefix: "", highlight: Number(c.highlight) - 1 },
      object: { kind: c.device, callouts: [c.callout_1, c.callout_2, c.callout_3] },
      people: { count: c.people_count, badges: [c.badge_1, c.badge_2, c.badge_3], highlight: 1 },
      process: { steps: [c.step_1, c.step_2, c.step_3] },
      compare: { left: c.before_label, leftValue: c.before_value, right: c.after_label, rightValue: c.after_value, suffix: c.compare_suffix, prefix: "" },
    };
    planKey = key;
    return (planCache = { shown, data, length: t });
  }
  function makeFrame(S, info) {
    const L = S.look;
    if (!tile || tileKey !== `${S.u}`) { tile = fibreTile(S.u); tileKey = `${S.u}`; }
    return {
      S, W: S.W, H: S.H, u: S.u, tall: S.tall, t: info.t, info, tex: L.texture,
      acc: S.accent, accRGB: rgbOf(S.accent), papers: L.papers, back: L.paperBack, sheet: L.sheet, skin: L.skin,
      wallT: L.wallT, wallB: L.wallB, floorT: L.floorT, floorB: L.floorB, keyLight: L.keyLight,
      liteRGB: rgbOf(L.lite), shadeRGB: rgbOf(L.shade), inkRGB: rgbOf(L.ink),
    };
  }
  const DRAW = { chart, object, people, process, compare };
  function boxOf(S) {
    const side = (S.tall ? 90 : 140) * S.u;
    return S.tall ? { x: side, y: S.H * 0.3, w: S.W - side * 2, h: S.H * 0.6 } : { x: side, y: S.H * 0.34, w: S.W - side * 2, h: S.H * 0.61 };
  }
  // Build progress from the scene's own clock, so strokes begin on its first frame.
  // Front-loaded, so the first models are already standing a few frames into the scene.
  const build = (local, hold) => 1 - Math.pow(1 - clamp(local / Math.min(2.6, Math.max(1.2, hold * 0.66))), 1.6);
  // An outgoing drawing folds flat into the floor and slides away while the next one stands up.
  const PRE = 0.82;
  function foldAway(g, b, exit, fn) {
    const k = inout(exit), y0 = b.y + b.h;
    g.save();
    g.globalAlpha *= 1 - span(exit, 0.7, 1);
    g.translate(-k * 70 * F.u, y0); g.scale(1, Math.max(0.03, Math.cos(k * Math.PI / 2))); g.translate(0, -y0);
    const d0 = DIM; DIM = Math.min(1, d0 + k * 0.55); fn(); DIM = d0;
    g.restore();
  }
  const scene = (id) => (ctx, S, box, p, d, info) => {
    if (!F || F.S !== S) F = makeFrame(S, info || { t: 0, local: 0, hold: 1, change: 0.45, index: 0 });
    const local = info ? info.local : 0, hold = info ? info.hold : 1;
    if (info && info.exit !== undefined) {
      foldAway(ctx, box, PRE + (1 - PRE) * info.exit, () => DRAW[id](ctx, box, 1, d, local));
      // A statement arriving over this drawing is painted after it, so its card always sits on top.
      const fi = F.info;
      if (fi && (fi.scene === "title" || fi.scene === "closing")) { statementArt(ctx, fi.scene, fi.local, fi.hold); headCard(ctx, fi.scene, fi.local, fi.hold, fi.change, !fi.next); }
    }
    else if (info && F.info && F.info.next && local > hold - info.change) {
      foldAway(ctx, box, PRE * span(local, hold - info.change, hold), () => DRAW[id](ctx, box, build(local, hold), d, local));
    }
    else DRAW[id](ctx, box, info ? build(local, hold) : p, d, local);
  };

  return {
    // Headlines set straight on this look's backdrop, where its ink and accent (meant for panels) do not read.
    displayInk: { dark: "#ffffff" },
    displayAccent: { original: "#a83e2d" },
    bg: "#efe6da", panel: "#fbf7f0", ink: "#2a2420", muted: "#6d625a", accent: "#e0533c", onAccent: "#ffffff",
    rule: "rgba(42,36,32,0.35)", track: "rgba(42,36,32,0.1)",
    display: DISPLAY, displayWeight: 700, displayCase: "none", displayTracking: "-0.01em",
    body: DISPLAY, bodyWeight: 600, figures: DISPLAY, radius: 6,
    motion: "wipe", change: "fade", kit: { line: 2.4, fill: "solid", panel: "fill" },
    panelEdge: "rgba(42,36,32,0.18)",
    papers: ["#2f4a8a", "#1f8a7c", "#e8a63a", "#7a4a8c"], paperBack: "#fbf7f0", sheet: "#f4ece0", skin: "#f1d3b5",
    wallT: "#f3ebe0", wallB: "#e9dccb", floorT: "#e2d3bf", floorB: "#cdbba4", keyLight: 0.28,
    lite: "#fffaf2", shade: "#5a4636",
    palettes: {
      // Light: white-on-white studio with pastel papers. Dark: a charcoal studio under a spotlight.
      // Mono: grey stock folded on a grey sweep with one inked accent.
      light: { bg: "#f7f6f3", accent: "#e8574a", papers: ["#5d7fd6", "#4fb3a2", "#f2c25c", "#c48ad8"], sheet: "#ffffff", paperBack: "#ffffff",
        wallT: "#fbfaf8", wallB: "#f1efea", floorT: "#ebe8e2", floorB: "#dcd8d0", keyLight: 0.35, shade: "#5f5a66" },
      dark: { bg: "#1f1c1f", ink: "#241f1c", accent: "#ff6a4d", papers: ["#4c6fd1", "#22a593", "#f0b444", "#a46cc4"], sheet: "#3a3436", paperBack: "#f6f0e6",
        wallT: "#3a3338", wallB: "#272226", floorT: "#2c272a", floorB: "#151214", keyLight: 0.12, lite: "#fff3e4", shade: "#0b0809" },
      mono: { bg: "#e6e4e0", accent: "#262422", papers: ["#5e5b57", "#8a8681", "#b3afa8", "#3f3c39"], sheet: "#efedea", paperBack: "#fbfaf8", skin: "#d8d4ce",
        wallT: "#efedea", wallB: "#e1dfdb", floorT: "#d8d5d0", floorB: "#c2beb7", keyLight: 0.3, shade: "#3a3836" },
    },
    textShadow: () => "none",
    backdrop: (accent, texture, look) => (look && look.wallT) || "#f3ebe0",
    css: (accent) => `#root .kicker { color: ${accent}; font-weight: 700; letter-spacing: 0.16em; } #root .display { text-wrap: balance; }`,
    // The fibre pass: washi fibres and a soft vignette laid over everything, the words included.
    paintOver: true,
    paint: (ctx, W, H, t, accent, look) => {
      ctx.clearRect(0, 0, W, H);
      const u = Math.min(W, H) / 1080;
      if (!tile || tileKey !== `${u}`) { tile = fibreTile(u); tileKey = `${u}`; }
      ctx.save(); ctx.globalAlpha = 0.55; ctx.fillStyle = ctx.createPattern(tile, "repeat"); ctx.fillRect(0, 0, W, H); ctx.restore();
      const gr = ctx.createRadialGradient(W * 0.45, H * 0.4, Math.min(W, H) * 0.3, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.62);
      gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, `rgba(${rgbOf(look.shade).join(",")},0.22)`);
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    },
    keepArt: true,
    overlap: true,
    stage(ctx, S, info) {
      F = makeFrame(S, info);
      DIM = 0;
      if (S.paint) studio(ctx, info);
      const P = planOf(S.W, S.H), b = boxOf(S);
      let id = info.scene, local = info.local, hold = info.hold, last = !info.next;
      // Past the last frame the template has no scene: hold the final one so the reel never ends blank.
      if (!id && P && P.shown.length && info.t > 0) { const st = P.shown[P.shown.length - 1]; id = st.id; local = st.hold; hold = st.hold; last = true; if (DRAW[id]) DRAW[id](ctx, b, 1, P.data[id], local); }
      // The title has no drawer, so it folds away here as the next scene starts.
      const prev = P && info.index > 0 ? P.shown[info.index - 1] : null;
      if (prev && prev.id === "title" && info.local < info.change) {
        foldAway(ctx, { x: 0, y: 0, w: S.W, h: S.H * 0.9 }, PRE + (1 - PRE) * clamp(info.local / Math.max(0.01, info.change)), () => statementArt(ctx, "title", prev.hold + info.local, prev.hold));
      }
      // While a drawn scene folds away under an arriving statement, its drawer paints the statement on top.
      const deferred = (id === "title" || id === "closing") && prev && DRAW[prev.id] && info.local < info.change;
      if (!deferred && id === "title" && !last && local > hold - info.change) foldAway(ctx, { x: 0, y: 0, w: S.W, h: S.H * 0.9 }, PRE * span(local, hold - info.change, hold), () => statementArt(ctx, id, local, hold));
      else if (!deferred && (id === "title" || id === "closing")) statementArt(ctx, id, local, hold);
      if (id && !deferred) headCard(ctx, id, local, hold, info.change, last);
    },
    scenes: { chart: scene("chart"), object: scene("object"), people: scene("people"), process: scene("process"), compare: scene("compare") },
  };
});
