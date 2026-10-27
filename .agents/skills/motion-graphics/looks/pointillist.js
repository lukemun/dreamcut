// Pointillist: a sun-struck seaside afternoon painted entirely from separate dabs of pure colour that
// mix in the eye, never on the palette. Every form is built the same way: a hex-jittered field of small
// dabs picked from five pigments (deep, shade, mid, light and the complement) by how lit the spot is, so
// shadows turn violet and highlights turn yellow. Sky, sea, sand, lighthouse and hills are a painted
// stage under every scene; a slow camera drifts along the shore while the sun sinks from noon to dusk.
// Each scene is a painting of its own subject (striped towers, a laptop on the beach, a stroll of
// people with a dog, a stream of stepping spheres, a moon and a sun) whose dabs flicker between
// neighbouring pigments all through the hold. Changes blow the outgoing dabs away on a gust. All motifs
// are original. Frames are pure functions of time.
window.DreamcutMotion.register("pointillist", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };
  const fract = (v) => v - Math.floor(v);
  const SERIF = "'Baskerville', 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif";
  const SANS = "'Avenir Next', 'Gill Sans', 'Trebuchet MS', 'Helvetica Neue', sans-serif";
  const TAGINK = "#2a2150";
  const M = () => window.DreamcutMotion;

  // ---- hashing and colour -----------------------------------------------------------------------------
  function hash(i, j, k) {
    let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(k | 0, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1103515245);
    h ^= h >>> 16;
    h = Math.imul(h, 2246822519);
    h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  }
  const toRGB = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const toHex = (r, g, b) => "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
  function toHSL(hex) {
    const [r, g, b] = toRGB(hex).map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    let h = 0, s = 0;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    }
    return [(h * 60 + 360) % 360, s, l];
  }
  function fromHSL(h, s, l) {
    h = ((h % 360) + 360) % 360; s = clamp(s); l = clamp(l);
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
  }
  // Five pigments per form: deep, shade, mid, light, and the complement that makes the dabs vibrate.
  const R = {
    blue: ["#233a96", "#3d52b8", "#2f84dc", "#86c4f2", "#f4a03c"],
    teal: ["#146f78", "#1f94a0", "#3ec0c0", "#9ae6dc", "#e8604a"],
    violet: ["#4a2a82", "#6a43b0", "#8a63c8", "#c4a4e8", "#e8d84a"],
    green: ["#1d6a3a", "#2f8a4a", "#5fb84a", "#b6dd5a", "#e0405a"],
    orange: ["#c8461e", "#e2682a", "#f58a30", "#ffc060", "#2f7ed8"],
    pink: ["#b84a8a", "#d6609a", "#f08ab4", "#fcc6d6", "#5fb84a"],
    yellow: ["#e0881e", "#f0a020", "#f8d034", "#fff08a", "#7a5ad0"],
    sand: ["#b88a52", "#d8aa68", "#efcc90", "#f9e8b8", "#7a6ad0"],
    cream: ["#e9d7ac", "#f1e3bc", "#f7efd9", "#fffaf0", "#f3c9d6"],
    stripe: ["#b9a4d8", "#dccbe8", "#f7ecd6", "#fffaf0", "#8fb8e8"],
    slate: ["#2a2a5a", "#44448a", "#6a6ab0", "#a4a4dc", "#e0c05a"],
    cast: ["#3a2a80", "#5a46a8", "#7c68c4", "#a99be0", "#e0b040"],
    ink: ["#1c1640", "#2d2565", "#3f3590", "#6a62b8", "#e8a040"],
    skinA: ["#6a3a2a", "#8a5236", "#b06a46", "#d89a6a", "#5a7ad0"],
    skinB: ["#9a4a3a", "#c46a4a", "#e8955f", "#fbc99a", "#6a8ad8"],
    skinC: ["#c07a5a", "#e0a07a", "#f6c8a4", "#fde4cc", "#8a9ae0"],
    fur: ["#6a3a1e", "#9a5a2a", "#d08a3a", "#f4c070", "#5a78d0"],
    hair: ["#1c1230", "#3a2250", "#5a3a6a", "#8a6aa0", "#d8a840"],
    cloud: ["#cdbfe6", "#e6dcf0", "#fff3e4", "#ffffff", "#bfe0f4"],
    scr: ["#26307a", "#3a52b8", "#5f9ae4", "#b8dcf4", "#f4b868"],
    skyp: ["#9ac4ee", "#bfe0f4", "#f9efcf", "#ffffff", "#f7c9d2"],
    water: ["#1f4aa8", "#2f78d0", "#3ec0d0", "#a8e8e8", "#f4a05a"],
    dusk: ["#2a2a8a", "#5a4ab8", "#9a62c8", "#f08ab4", "#f5a040"],
    sun: ["#f08c1e", "#f6b02a", "#fbd23a", "#fff08a", "#8a6ae0"],
    sunset: ["#c8381e", "#e8581e", "#f58a2a", "#fbc060", "#6a5ad0"],
    moon: ["#9a92c8", "#bfb8e4", "#e6e2f8", "#ffffff", "#8a9cf0"],
    halo: ["#fbd98a", "#fbe69a", "#fdf3c0", "#fffbe6", "#f6b0c8"],
    hill1: ["#6a74c0", "#8a94d4", "#a8b4e4", "#cfd6f2", "#f2c6a0"],
    hill2: ["#2a7a82", "#3a9a8a", "#5ab89a", "#9ad8b0", "#e87a8a"],
    roof: ["#8a2a1e", "#b8442a", "#d86a3a", "#f09a5a", "#4a6ad0"],
    rock: ["#4a4478", "#6a64a0", "#8a84c0", "#b8b4e0", "#e8a860"],
    wood: ["#5a3a2a", "#7a5236", "#a2764a", "#c89a68", "#4a6ad0"],
    glow: ["#e0601e", "#f58a2a", "#fbc060", "#fff2b0", "#8a6ae0"],
  };
  R.body = ["#6a5aa0", "#9a8ac8", "#cfc4ea", "#f4eefa", "#e8c060"];
  R.trail = ["#8a6ac8", "#c4a4e8", "#fdf3c0", "#ffffff", "#f08ab4"];
  const memo = new Map();
  // A palette changes every pigment at once: mono turns them to greys, dark deepens the world's.
  function cv(S, hex, world) {
    const mono = S.look.mono, night = S.look.night && world;
    if (!mono && !night) return hex;
    const key = hex + (mono ? "m" : "") + (night ? "n" : "");
    let out = memo.get(key);
    if (!out) {
      let [r, g, b] = toRGB(hex);
      if (night) { r = r * 0.56 + 10; g = g * 0.56 + 10; b = b * 0.6 + 34; }
      if (mono) { const l = 0.3 * r + 0.59 * g + 0.11 * b; r = l * 1.02; g = l * 0.98; b = l * 0.9; }
      out = toHex(r, g, b);
      memo.set(key, out);
    }
    return out;
  }
  const tone = (S, ramp, world) => ramp.map((h) => cv(S, h, world));
  const accMemo = {};
  function accRamp(S) {
    const key = S.accent + S.look.name;
    if (accMemo[key]) return accMemo[key];
    const [h, s, l] = toHSL(S.accent);
    const ramp = [fromHSL(h - 14, s * 0.95, l * 0.5), fromHSL(h - 7, s, l * 0.76), S.accent, fromHSL(h + 16, s, Math.min(0.88, l + 0.24)), fromHSL(h + 180, s * 0.9, 0.52)];
    return (accMemo[key] = ramp.map((c) => cv(S, c)));
  }

  // ---- dabs ---------------------------------------------------------------------------------------------
  const ANG = Array.from({ length: 16 }, (_, k) => (k / 16) * Math.PI);
  const COS = ANG.map(Math.cos), SIN = ANG.map(Math.sin);
  function dab(map, col, x, y, rx, ry, a) {
    let p = map.get(col);
    if (!p) { p = new Path2D(); map.set(col, p); }
    p.moveTo(x + rx * COS[a], y + rx * SIN[a]);
    p.ellipse(x, y, rx, ry, ANG[a], 0, TAU);
  }
  function flush(g, map, alpha) {
    if (alpha != null) { g.save(); g.globalAlpha *= alpha; }
    for (const [col, p] of map) { g.fillStyle = col; g.fill(p); }
    if (alpha != null) g.restore();
  }
  // Which pigment a spot takes: the lit value picks deep to light, a tenth go to the complement.
  function pick(lum, h, hc) {
    if (hc < 0.07 + 0.09 * (1 - clamp(lum))) return 4;
    const t = lum + (h - 0.5) * 0.62;
    return t < 0.2 ? 0 : t < 0.42 ? 1 : t < 0.7 ? 2 : 3;
  }
  // A signed distance per shape: negative inside. Dabs are laid wherever it is below zero.
  const circ = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;
  const ell = (cx, cy, rx, ry) => (x, y) => (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry);
  const rbox = (cx, cy, hw, hh, r) => (x, y) => {
    const qx = Math.abs(x - cx) - hw + r, qy = Math.abs(y - cy) - hh + r;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  };
  const seg = (ax, ay, bx, by, r) => (x, y) => {
    const px = x - ax, py = y - ay, dx = bx - ax, dy = by - ay, k = clamp((px * dx + py * dy) / (dx * dx + dy * dy || 1));
    return Math.hypot(px - dx * k, py - dy * k) - r;
  };
  const poly = (pts) => {
    const n = pts.length;
    return (x, y) => {
      let d = 1e12, inside = false;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1], ex = xj - xi, ey = yj - yi;
        const k = clamp(((x - xi) * ex + (y - yi) * ey) / (ex * ex + ey * ey || 1)), dx = x - xi - ex * k, dy = y - yi - ey * k;
        d = Math.min(d, dx * dx + dy * dy);
        if ((yi > y) !== (yj > y) && x < (ex * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      d = Math.sqrt(d);
      return inside ? -d : d;
    };
  };
  const uni = (...fs) => (x, y) => { let d = 1e12; for (let i = 0; i < fs.length; i++) d = Math.min(d, fs[i](x, y)); return d; };
  const isect = (a, b) => (x, y) => Math.max(a(x, y), b(x, y));
  const bbOf = (cx, cy, hw, hh) => [cx - hw, cy - hh, cx + hw, cy + hh];
  const sphere = (cx, cy, r) => (x, y, d) => {
    const nx = (x - cx) / r, ny = (y - cy) / r, z = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const dot = Math.max(0, -0.5 * nx - 0.6 * ny + 0.62 * z);
    return clamp(0.16 + 0.88 * dot - 0.2 * (1 - clamp(-d / (0.16 * r))) * (d > -0.16 * r ? 1 : 0));
  };

  // Lay dabs through a shape. Options: bb (bounding box), sd, ramp or rampf, lum (a number or a function of
  // the spot), step, p (build progress with birth order), exit (dissolve progress with ord order), warp,
  // keep (the share of spots kept), size, t (for the flicker) and seed.
  const tmp = { x: 0, y: 0 };
  function fillShape(g, o) {
    const step = o.step, Rr = step * 0.52 * (o.size || 1), seed = o.seed | 0, t = o.t || 0, T = Math.floor(t * 5);
    const p = o.p == null ? 1 : o.p, ex = o.exit || 0, map = new Map();
    const [x0, y0, x1, y1] = o.bb;
    const i0 = Math.floor(x0 / step) - 1, i1 = Math.ceil(x1 / step) + 1, j0 = Math.floor(y0 / step) - 1, j1 = Math.ceil(y1 / step) + 1;
    const lumf = typeof o.lum === "function" ? o.lum : () => o.lum ?? 0.5;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const h1 = hash(i, j, seed), h2 = hash(i, j, seed + 1), h3 = hash(i, j, seed + 2), h4 = hash(i, j, seed + 3);
        let x = (i + (j & 1) * 0.5 + (h1 - 0.5) * 0.9) * step, y = (j + (h2 - 0.5) * 0.9) * step;
        const d = o.sd(x, y);
        if (d > Rr * (h3 * 1.0 - 0.45)) continue;
        if (o.keep && hash(i, j, seed + 6) > o.keep(x, y, d)) continue;
        let sc = 1;
        if (p < 1) {
          const b = o.birth ? o.birth(x, y) : 0, q = clamp((p - b * 0.62 - h4 * 0.1) / 0.28);
          if (q <= 0) continue;
          sc = ease(q);
        }
        if (ex > 0) {
          const ord = o.ord ? o.ord(x, y) : 0.5, leave = clamp((ex - (ord * 0.8 + h2 * 0.2) * 0.55) / 0.45);
          if (leave >= 1) continue;
          const dr = leave * leave;
          x += dr * (60 + h4 * 110) * (o.u || 1);
          y += dr * (Math.sin(h1 * 9 + leave * 3) * 50 - 30) * (o.u || 1);
          sc *= 1 - leave * 0.85;
        }
        if (o.warp) { o.warp(x, y, tmp); x = tmp.x; y = tmp.y; }
        const lum = lumf(x, y, d);
        const fl = h4 < 0.3 ? hash(i, j, seed + 40 + T) : h1, hc = h4 < 0.3 ? hash(i, j, seed + 80 + T) : h3;
        const ramp = o.rampf ? o.rampf(x, y, h2) : o.ramp;
        const rx = Rr * sc * (1.06 + 0.3 * h3), ry = Rr * sc * (0.74 + 0.22 * h1);
        dab(map, ramp[pick(lum, fl, hc)], x, y, rx, ry, (h2 * 16) | 0);
      }
    }
    flush(g, map, o.alpha);
  }
  // A plain field of dabs with a colour per spot, for the stage's broad areas.
  function field(g, o) {
    const step = o.step, Rr = step * 0.52, seed = o.seed | 0, map = new Map();
    for (let j = Math.floor(o.y0 / step); j <= Math.ceil(o.y1 / step); j++) {
      for (let i = Math.floor(o.x0 / step); i <= Math.ceil(o.x1 / step); i++) {
        const h1 = hash(i, j, seed), h2 = hash(i, j, seed + 1), h3 = hash(i, j, seed + 2), h4 = hash(i, j, seed + 3);
        const x = (i + (j & 1) * 0.5 + (h1 - 0.5) * 0.9) * step, y = (j + (h2 - 0.5) * 0.9) * step;
        const col = o.col(x, y, h4, h3);
        if (col) dab(map, col, x, y, Rr * (1.06 + 0.3 * h3), Rr * (0.74 + 0.22 * h1), (h2 * 16) | 0);
      }
    }
    flush(g, map);
  }
  function pickW(list, v, h) {
    let total = 0;
    for (let i = 0; i < list.length; i++) total += lerp(list[i][1], list[i][2], v);
    let a = h * total;
    for (let i = 0; i < list.length; i++) { a -= lerp(list[i][1], list[i][2], v); if (a <= 0) return list[i][0]; }
    return list[list.length - 1][0];
  }
  // A line of dabs along a polyline; march slides them along it, q draws it on.
  function dabLine(g, pts, o) {
    const lens = [];
    let L = 0;
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); lens.push(l); L += l; }
    const lim = L * (o.q == null ? 1 : o.q), n = Math.floor(lim / o.gap), total = (n + 1) * o.gap, map = new Map();
    if (lim <= 0) return;
    for (let k = 0; k <= n; k++) {
      let s = (k * o.gap + (o.march || 0)) % total;
      if (s > lim) continue;
      let i = 0;
      while (i < lens.length - 1 && s > lens[i]) { s -= lens[i]; i++; }
      const f = lens[i] ? s / lens[i] : 0, h = hash(k, 3, o.seed | 0), h2 = hash(k, 4, o.seed | 0);
      const x = lerp(pts[i][0], pts[i + 1][0], f) + (h2 - 0.5) * o.rad * 0.5, y = lerp(pts[i][1], pts[i + 1][1], f) + (h - 0.5) * o.rad * 0.5;
      const r = o.rad * (0.8 + 0.5 * h2);
      dab(map, o.cols[Math.floor(h * o.cols.length) % o.cols.length], x, y, r * 1.1, r * 0.82, (h * 16) | 0);
    }
    flush(g, map, o.alpha);
  }

  // ---- the world: geometry and the painted stage layers -------------------------------------------------------
  function geo(S) {
    const { W, H, u } = S;
    const hy = H * (S.tall ? 0.46 : 0.5), seaH = H * (S.tall ? 0.11 : 0.145);
    return { W, H, u, hy, seaH, shore: hy + seaH, LW: W * 1.5, M: W * 0.25 };
  }
  const shoreY = (G, x) => G.shore + 12 * G.u * Math.sin(x / (190 * G.u)) + 8 * G.u * Math.sin(x / (71 * G.u) + 1.3);
  const SKY = {
    day: [["#bfe0f4", 0.3, 0.06], ["#8cc6ee", 0.36, 0.03], ["#58a4e4", 0.2, 0], ["#f9efcf", 0.08, 0.34], ["#f7c9d2", 0.03, 0.26], ["#fbe69a", 0.02, 0.2], ["#f6a45a", 0.004, 0.07], ["#cdb8ee", 0.06, 0.03]],
    dusk: [["#4a4aa8", 0.3, 0], ["#6e5ac0", 0.26, 0.04], ["#9a7ad8", 0.16, 0.1], ["#e872a8", 0.1, 0.3], ["#f5904a", 0.04, 0.3], ["#fbc860", 0.02, 0.2], ["#fbe69a", 0, 0.1], ["#f7c9d2", 0.12, 0.15]],
    night: [["#1b1a5e", 0.5, 0.05], ["#2c2a8a", 0.3, 0.1], ["#3d4fb8", 0.1, 0.25], ["#6a62c8", 0.04, 0.3], ["#9a8ae0", 0, 0.2], ["#fbe69a", 0.012, 0.01], ["#ffffff", 0.006, 0]],
    night2: [["#241a66", 0.5, 0.05], ["#4a2a8a", 0.3, 0.15], ["#8a3a9a", 0.06, 0.2], ["#e0609a", 0.02, 0.2], ["#f5904a", 0, 0.1], ["#3d4fb8", 0.12, 0.05], ["#fbe69a", 0.012, 0]],
  };
  const SAND = [["#f2d49a", 0.38, 0.22], ["#f7e7bc", 0.26, 0.14], ["#f0b878", 0.06, 0.2], ["#e89a9a", 0.03, 0.1], ["#9a8ad8", 0.04, 0.14], ["#70b8e0", 0.03, 0.06], ["#8a7a5a", 0, 0.04]];
  const WET = [["#5a7ac8", 0.3, 0], ["#7a9ae0", 0.3, 0], ["#f7e7bc", 0.2, 0], ["#f2d49a", 0.2, 0]];
  const mkCanvas = (w, h) => { const c = document.createElement("canvas"); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; };
  let LAY = null, layKey = "";
  function buildLayers(S) {
    const key = `${S.W}x${S.H}:${S.look.name}`;
    if (LAY && layKey === key) return LAY;
    const G = geo(S), { W, H, u, hy, M: mg, LW } = G, look = S.look, night = look.night;
    const lay = { G };
    const sky = (list, seed) => {
      const c = mkCanvas(LW, H), g = c.getContext("2d");
      g.fillStyle = look.bg; g.fillRect(0, 0, LW, H);
      field(g, { x0: 0, y0: 0, x1: LW, y1: hy + 30 * u, step: 8.6 * u, seed, col: (x, y, h) => cv(S, pickW(list, clamp(y / hy), h), false) });
      return c;
    };
    lay.skyDay = sky(night ? SKY.night : SKY.day, 11);
    lay.skyDusk = sky(night ? SKY.night2 : SKY.dusk, 23);

    // Far shore: hazy hills, a lighthouse on its rocks and a row of small houses.
    const far = mkCanvas(LW, H), f = far.getContext("2d");
    const hillTop = (x, a, b, ph) => hy - (a * u + b * u * Math.sin(x / (250 * u) + ph) + 0.5 * b * u * Math.sin(x / (93 * u) + ph * 2)) ;
    const hill = (a, b, ph, ramp, seed, lum0, left) => {
      const top = (x) => hillTop(x, a, b, ph) - (left ? 70 * u * Math.exp(-Math.pow((x - (mg + W * 0.2)) / (W * 0.28), 2)) : 0);
      fillShape(f, { bb: [0, hy - 190 * u, LW, hy + 6 * u], sd: (x, y) => Math.max(top(x) - y, y - (hy + 4 * u)), ramp: tone(S, ramp, true), step: 8.2 * u, seed,
        lum: (x, y) => clamp(lum0 + 0.62 * ((hy - y) / (110 * u)) * 0.5 + 0.12 * Math.sin(x / (40 * u) + y / (30 * u))) });
    };
    hill(66, 26, 0.6, R.hill1, 31, 0.35, false);
    hill(34, 16, 2.4, R.hill2, 37, 0.3, true);
    const lx = mg + W * 0.06, lh = H * 0.13;
    fillShape(f, { bb: bbOf(lx, hy, 130 * u, 60 * u), sd: uni(ell(lx - 20 * u, hy - 4 * u, 120 * u, 36 * u), ell(lx + 70 * u, hy - 2 * u, 60 * u, 24 * u)), ramp: tone(S, R.rock, true), step: 6 * u, seed: 41, lum: (x, y) => 0.5 - ((y - hy) / (60 * u)) * 0.2 + 0.14 * Math.sin(x / (14 * u)) });
    const tw = (y) => lerp(0.011, 0.02, (y - (hy - lh)) / lh) * H;
    fillShape(f, { bb: [lx - 40 * u, hy - lh - 10 * u, lx + 40 * u, hy], sd: poly([[lx - tw(hy - lh), hy - lh], [lx + tw(hy - lh), hy - lh], [lx + tw(hy), hy - 18 * u], [lx - tw(hy), hy - 18 * u]]),
      rampf: (x, y) => (Math.floor((hy - y) / (30 * u)) & 1 ? tone(S, R.stripe, true) : tone(S, R.orange, true)), step: 4.6 * u, seed: 43,
      lum: (x) => clamp(0.62 - 0.55 * ((x - lx) / (tw(hy) * 2)) + 0.08) });
    fillShape(f, { bb: bbOf(lx, hy - lh - 28 * u, 30 * u, 24 * u), sd: rbox(lx, hy - lh - 24 * u, 17 * u, 16 * u, 6 * u), ramp: tone(S, R.glow, true), step: 3.6 * u, seed: 47, lum: 0.8 });
    fillShape(f, { bb: bbOf(lx, hy - lh - 60 * u, 40 * u, 40 * u), sd: poly([[lx - 26 * u, hy - lh - 40 * u], [lx + 26 * u, hy - lh - 40 * u], [lx, hy - lh - 72 * u]]), ramp: tone(S, R.roof, true), step: 3.8 * u, seed: 49, lum: 0.45 });
    for (let k = 0; k < 11; k++) {
      const hx = mg + W * (0.17 + 0.03 * k) + hash(k, 1, 5) * 18 * u, hw = (26 + hash(k, 2, 5) * 22) * u, hh = (28 + hash(k, 3, 5) * 34) * u, base = hy - 6 * u - (k % 3) * 3 * u;
      const wall = [R.pink, R.cream, R.yellow, R.stripe, R.sand][k % 5];
      fillShape(f, { bb: bbOf(hx, base - hh / 2, hw, hh / 2), sd: rbox(hx, base - hh / 2, hw / 2, hh / 2, 2 * u), ramp: tone(S, wall, true), step: 4.4 * u, seed: 60 + k, lum: (x) => clamp(0.7 - 0.4 * ((x - hx) / hw)) });
      fillShape(f, { bb: bbOf(hx, base - hh - 8 * u, hw, 14 * u), sd: poly([[hx - hw / 2 - 4 * u, base - hh], [hx + hw / 2 + 4 * u, base - hh], [hx, base - hh - 18 * u]]), ramp: tone(S, R.roof, true), step: 4.2 * u, seed: 90 + k, lum: 0.5 });
    }
    lay.far = far;

    // Beach: wet sand at the waterline, warm sand falling toward the viewer, two striped parasols.
    const gr = mkCanvas(LW, H), g2 = gr.getContext("2d");
    field(g2, { x0: 0, y0: G.shore - 40 * u, x1: LW, y1: H, step: 8.6 * u, seed: 71, col: (x, y, h, h3) => {
      const d = y - shoreY(G, x);
      if (d < -10 * u * h3) return null;
      const v = clamp((y - G.shore) / (H - G.shore));
      if (d < 30 * u) return cv(S, pickW(WET, 0, h), true);
      return cv(S, pickW(SAND, v, h), true);
    } });
    const parasol = (px, py, sc, ramp) => {
      fillShape(g2, { bb: bbOf(px + 30 * u, py + 6 * u, 140 * u * sc, 20 * u * sc), sd: ell(px + 36 * u * sc, py + 6 * u * sc, 120 * u * sc, 16 * u * sc), ramp: tone(S, R.cast, true), step: 6 * u, seed: 120, lum: 0.35 });
      fillShape(g2, { bb: bbOf(px, py - 80 * u * sc, 8 * u, 84 * u * sc), sd: seg(px, py, px - 4 * u * sc, py - 130 * u * sc, 3.5 * u), ramp: tone(S, R.wood, true), step: 3.4 * u, seed: 121, lum: 0.5 });
      const cy = py - 128 * u * sc, rx = 96 * u * sc;
      fillShape(g2, { bb: bbOf(px, cy - 30 * u * sc, rx, 36 * u * sc), sd: isect(ell(px, cy, rx, 46 * u * sc), (x, y) => y - cy), rampf: (x) => (Math.floor((x - px) / (22 * u * sc)) & 1 ? tone(S, R.cream, true) : tone(S, ramp, true)), step: 4.6 * u, seed: 122,
        lum: (x, y) => clamp(0.8 - 0.4 * ((x - px) / rx) - 0.3 * ((y - (cy - 46 * u * sc)) / (46 * u * sc)) * -0.3) });
    };
    // Starfish, shells, pebbles and footprints scattered over the sand.
    for (let k = 0; k < 9; k++) {
      const px = mg + W * (0.04 + 0.92 * hash(k, 1, 33)), py = G.shore + (0.22 + 0.7 * hash(k, 2, 33)) * (H - G.shore), r = (18 + 14 * hash(k, 3, 33)) * u, a0 = hash(k, 4, 33) * TAU;
      const pts = [];
      for (let m = 0; m < 10; m++) { const a = a0 + (m / 10) * TAU, rr = m % 2 ? r * 0.45 : r; pts.push([px + Math.cos(a) * rr, py + Math.sin(a) * rr * 0.8]); }
      if (k % 3 === 0) fillShape(g2, { bb: bbOf(px, py, r + 4 * u, r + 4 * u), sd: poly(pts), ramp: tone(S, R.orange, true), step: 3.6 * u, seed: 140 + k, lum: (x, y) => clamp(0.6 + (py - y) * 0.01 / u) });
      else if (k % 3 === 1) fillShape(g2, { bb: bbOf(px, py, r, r), sd: ell(px, py, r * 0.9, r * 0.65), ramp: tone(S, R.pink, true), step: 3.4 * u, seed: 140 + k, lum: (x, y) => clamp(0.7 - ((y - py) / r) * 0.5 + 0.12 * Math.sin((x - px) * 0.5 / u)) });
      else for (let m = 0; m < 4; m++) fillShape(g2, { bb: bbOf(px + m * 18 * u, py, 16 * u, 12 * u), sd: ell(px + m * 18 * u, py + (m % 2) * 6 * u, 12 * u, 8 * u), ramp: tone(S, R.rock, true), step: 3.2 * u, seed: 160 + k * 4 + m, lum: 0.45 });
    }
    for (let k = 0; k < 14; k++) {
      const fx = mg + W * 0.3 + k * 44 * u, fy = G.shore + (0.55 + 0.04 * Math.sin(k * 0.8) + k * 0.012) * (H - G.shore) + (k % 2) * 16 * u;
      fillShape(g2, { bb: bbOf(fx, fy, 16 * u, 24 * u), sd: ell(fx, fy, 8 * u, 15 * u), ramp: tone(S, R.cast, true), step: 3.2 * u, seed: 190 + k, lum: 0.4, keep: () => 0.85 });
    }
    parasol(mg + W * 0.1, G.shore + 0.2 * (H - G.shore), 0.86, R.pink);
    parasol(mg + W * 0.93, G.shore + 0.3 * (H - G.shore), 1.0, R.blue);
    lay.ground = gr;

    // The painted edge: a band of deep dabs around the whole canvas.
    const fr = mkCanvas(W, H), f3 = fr.getContext("2d");
    const edge = 26 * u, cols = [R.ink[1], R.ink[2], R.blue[1], R.violet[1], R.ink[0], R.orange[2], R.violet[2]].map((c) => cv(S, c));
    field(f3, { x0: 0, y0: 0, x1: W, y1: H, step: 7.4 * u, seed: 131, col: (x, y, h, h3) => {
      const d = Math.min(x, y, W - x, H - y);
      if (d > edge * (0.5 + h3)) return null;
      return cols[Math.floor(h * cols.length) % cols.length];
    } });
    lay.frame = fr;
    LAY = lay; layKey = key;
    return lay;
  }

  // ---- text and tags ------------------------------------------------------------------------------------------
  const HEADS = { title: ["kicker", "title"], chart: ["chart-title"], object: ["object-title"], people: ["people-title"], process: ["process-title"], compare: ["compare-title"], closing: ["closing"] };
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
  const ctxOf = (S, box, info) => ({ u: S.u, t: info.t, ex: info.exit || 0, ord: (x) => clamp((x - box.x) / box.w) });
  // A cream paint tag: scumbled pale dabs with a violet shadow, and its words appearing as it forms.
  function tag(g, S, c, o) {
    const { u } = c, size = o.size;
    if (o.q <= 0) return null;
    g.save();
    g.font = `${o.weight || 700} ${size}px ${o.font || SANS}`;
    let w = g.measureText(o.text).width, fs = size;
    if (o.maxW && w + size > o.maxW) { fs = Math.max(size * 0.7, (size * (o.maxW - size)) / w); g.font = `${o.weight || 700} ${fs}px ${o.font || SANS}`; w = g.measureText(o.text).width; }
    const pw = w + size * 1.1, ph = size * (o.tall || 1.5);
    const cx = o.align === "left" ? o.x + pw / 2 : o.align === "right" ? o.x - pw / 2 : o.x, cy = o.y;
    const ramp = o.ramp || tone(S, R.cream);
    const birth = (x, y) => clamp(Math.hypot((x - cx) / pw, (y - cy) / ph) * 1.5);
    const base = { bb: bbOf(cx + 8 * u, cy + 10 * u, pw / 2 + 12 * u, ph / 2 + 14 * u), p: o.q, birth, exit: c.ex, ord: c.ord, u, t: c.t, step: 6.4 * u, seed: (o.seed | 0) + 200 };
    fillShape(g, { ...base, sd: rbox(cx + 7 * u, cy + 9 * u, pw / 2, ph / 2, ph * 0.3), ramp: tone(S, R.cast), lum: 0.5, keep: () => 0.55, seed: base.seed + 3 });
    fillShape(g, { ...base, bb: bbOf(cx, cy, pw / 2 + 6 * u, ph / 2 + 6 * u), sd: rbox(cx, cy, pw / 2, ph / 2, ph * 0.3), ramp, size: 1.3, lum: (x, y) => 0.72 + 0.2 * Math.sin(x * 0.05 + y * 0.07) });
    const a = clamp(o.q / 0.4) * (1 - clamp(c.ex * 2.4));
    if (a > 0.01) {
      g.globalAlpha = a;
      g.fillStyle = o.color || TAGINK;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(o.text, cx, cy + size * 0.04 - (1 - ease(o.q)) * 8 * u);
    }
    g.restore();
    return { cx, cy, w: pw, h: ph, left: cx - pw / 2, right: cx + pw / 2 };
  }
  // Large lettering drawn straight onto a form: a thick cream rim keeps it legible over the dabs.
  function figure(g, S, c, text, x, y, size, o = {}) {
    const a = (o.a ?? 1) * (1 - clamp(c.ex * 2.4));
    if (a <= 0.01) return;
    g.save();
    g.globalAlpha = a;
    g.font = `700 ${size}px ${SERIF}`;
    const w = g.measureText(text).width;
    if (o.maxW && w > o.maxW) { size = Math.max(o.min || size * 0.6, (size * o.maxW) / w); g.font = `700 ${size}px ${SERIF}`; }
    g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
    g.lineWidth = size * 0.16; g.strokeStyle = o.rim || TAGINK;
    g.strokeText(text, x, y);
    g.fillStyle = o.color || "#fffaf0";
    g.fillText(text, x, y);
    g.restore();
  }
  const tally = (target, k, d) => {
    const dec = Math.abs((Number(target) || 0) % 1) > 0.001 ? 1 : 0;
    return M().formatNumber(target * k, dec, (d && d.prefix) || "", (d && d.suffix) || "");
  };

  // ---- the stage's live parts ---------------------------------------------------------------------------------
  function sunAndSky(g, S, L, t, cam, warm, pan, info) {
    const G = L.G, { W, H, u } = S, night = S.look.night;
    g.drawImage(L.skyDay, -G.M - pan(0.25), 0);
    if (warm > 0.003) { g.save(); g.globalAlpha = warm; g.drawImage(L.skyDusk, -G.M - pan(0.25), 0); g.restore(); }
    const sx = W * 0.72 - pan(0.25), sy = lerp(H * 0.2, G.hy - H * 0.04, warm), r = (night ? 110 : 140) * u * (1 + 0.45 * warm);
    const haloRamp = tone(S, night ? R.moon : R.halo), sunRamp = tone(S, night ? R.moon : R.sun), dusk = tone(S, night ? R.moon : R.sunset);
    fillShape(g, { bb: bbOf(sx, sy, r * 2.7, r * 2.7), sd: circ(sx, sy, r * 2.6), ramp: haloRamp, step: 9 * u, seed: 301, t, lum: 0.78, keep: (x, y, d) => Math.pow(clamp(1 - Math.hypot(x - sx, y - sy) / (r * 2.6)), 1.6) * 0.95 });
    fillShape(g, { bb: bbOf(sx, sy, r, r), sd: circ(sx, sy, r), rampf: (x, y, h) => (h < warm ? dusk : sunRamp), step: 6.6 * u, seed: 303, t,
      lum: (x, y) => clamp(0.5 + 0.3 * (1 - Math.hypot(x - sx, y - sy) / r) + 0.07 * Math.sin(t * 2 + x * 0.02)) });
    const rays = [];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU + t * 0.12, l0 = r * 1.2, l1 = r * (1.55 + 0.32 * Math.sin(t * 1.7 + k * 1.3));
      dabLine(g, [[sx + Math.cos(a) * l0, sy + Math.sin(a) * l0], [sx + Math.cos(a) * l1, sy + Math.sin(a) * l1]], { cols: night ? [R.moon[2], R.moon[3]].map((c) => cv(S, c)) : [cv(S, "#fbd23a"), cv(S, "#f6b02a"), cv(S, "#fff08a")], rad: 4.2 * u, gap: 9 * u, seed: 310 + k, alpha: 0.9 });
    }
    // Clouds drift across at their own pace.
    const cr = tone(S, R.cloud);
    for (let k = 0; k < 6; k++) {
      const sc = (0.8 + hash(k, 1, 9) * 0.7) * u, x = ((hash(k, 2, 9) * W * 1.6 + t * (7 + 4 * (k % 3)) * u) % (W * 1.6)) - W * 0.3 - pan(0.35), y = H * (0.07 + 0.045 * (k % 4)) + Math.sin(t * 0.3 + k) * 4 * u;
      fillShape(g, { bb: bbOf(x, y, 190 * sc, 60 * sc), sd: uni(ell(x, y, 110 * sc, 32 * sc), ell(x - 84 * sc, y + 8 * sc, 70 * sc, 24 * sc), ell(x + 88 * sc, y + 10 * sc, 76 * sc, 26 * sc), ell(x + 14 * sc, y - 18 * sc, 62 * sc, 28 * sc)), ramp: cr, step: 7 * u, seed: 330 + k, t,
        lum: (xx, yy) => clamp(0.82 - 0.35 * ((yy - y + 20 * sc) / (60 * sc))) });
    }
    // Gulls beat across the sky.
    const gc = [cv(S, "#3a2a80"), cv(S, "#5a46a8"), cv(S, "#2d2565")];
    for (let k = 0; k < 3; k++) {
      const x = ((t * (55 + 12 * k) * u + k * W * 0.41) % (W + 300 * u)) - 150 * u, y = H * (0.15 + 0.045 * k) + Math.sin(t * 1.1 + k * 2) * 16 * u, fl = Math.sin(t * 7 + k * 2.1), s = (1 + 0.2 * k) * u;
      dabLine(g, [[x - 42 * s, y - 14 * s * fl + 6 * s], [x - 18 * s, y - 8 * s * fl - 3 * s], [x, y], [x + 18 * s, y - 8 * s * fl - 3 * s], [x + 42 * s, y - 14 * s * fl + 6 * s]], { cols: gc, rad: 3 * s, gap: 5 * s, seed: 350 + k });
    }
    return { sx, sy, r };
  }
  function lighthouseBeam(g, S, L, t, warm, pan) {
    if (warm < 0.25) return;
    const G = L.G, { u } = S, lx = G.W * 0.06 - pan(0.5), ly = G.hy - G.H * 0.13 - 24 * u, a = Math.sin(t * 0.7) * 0.9 + (Math.cos(t * 0.7) > 0 ? 0 : Math.PI);
    const dir = Math.cos(t * 0.7) > 0 ? -1 : 1, map = new Map(), cols = [cv(S, "#fff2b0"), cv(S, "#fbe69a"), cv(S, "#fbc060")];
    for (let k = 0; k < 160; k++) {
      const h = hash(k, 1, 77), h2 = hash(k, 2, 77), s = Math.pow(h, 0.7), ang = (dir < 0 ? Math.PI : 0) + (h2 - 0.5) * 0.28 * s - 0.04 * dir;
      const len = s * 560 * u;
      dab(map, cols[k % 3], lx + Math.cos(ang) * len, ly + Math.sin(ang) * len * 0.35, 5 * u, 3.2 * u, (k * 5) & 15);
    }
    flush(g, map, (warm - 0.25) * 0.9 * Math.abs(Math.cos(t * 0.7)));
  }
  function sea(g, S, L, t, warm, sunx, pan) {
    const G = L.G, { W, u } = S, step = 8.6 * u, map = new Map(), day = tone(S, R.water, true), dusk = tone(S, R.dusk, true);
    const glint = [cv(S, "#fff4a8"), cv(S, "#fbe06a"), cv(S, "#ffffff"), cv(S, S.look.night ? "#c8c0f0" : "#fbc0a0")];
    for (let j = 0; j * step * 0.78 < G.seaH + 26 * u; j++) {
      for (let i = -1; i * step < W + step; i++) {
        const h1 = hash(i, j, 401), h2 = hash(i, j, 402), h3 = hash(i, j, 403), h4 = hash(i, j, 404);
        const x = (i + (j & 1) * 0.5 + (h1 - 0.5) * 0.7) * step, y0 = G.hy + (j + (h2 - 0.5) * 0.6) * step * 0.78, v = clamp((y0 - G.hy) / G.seaH);
        const y = y0 + Math.sin(x * 0.018 + t * 1.7 + j * 0.7) * 2.8 * u * (0.4 + v);
        const wave = 0.28 * Math.sin(x * 0.02 - t * 1.4 + y * 0.06) + 0.14 * Math.sin(x * 0.051 + t * 2.2 + j);
        const lum = clamp(0.62 - 0.3 * v + wave * (0.6 + v * 0.7));
        const dx = (x - sunx) / (90 * u + v * 50 * u), gl = Math.exp(-dx * dx) * (1 - v * 0.25) * (0.5 + 0.5 * Math.sin(x * 0.07 + t * 3 + h3 * 6));
        let col;
        if (h4 < gl * 0.9) col = glint[Math.floor(h3 * glint.length) % glint.length];
        else { const ramp = h1 < warm ? dusk : day, fl = h4 < 0.3 ? hash(i, j, 410 + Math.floor(t * 5)) : h2; col = ramp[pick(lum, fl, h3)]; }
        dab(map, col, x, y, step * 0.52 * 1.7, step * 0.52 * 0.62, 0);
      }
    }
    flush(g, map);
    // Sailing boats.
    const boats = [[0.4, 0.012, 0.1, 0.62, R.orange], [0.78, -0.009, 0.55, 1.0, R.blue]];
    boats.forEach(([yv, speed, off, sc0, hull], k) => {
      const sc = sc0 * u, x = fract(t * speed + off) * (W + 300 * u) - 150 * u, y = G.hy + G.seaH * yv * 1.0 + Math.sin(t * 1.3 + k) * 3 * u, tilt = Math.sin(t * 0.9 + k) * 3 * u;
      fillShape(g, { bb: bbOf(x, y + 6 * sc, 60 * sc, 14 * sc), sd: ell(x, y + 24 * sc, 90 * sc, 8 * sc), ramp: tone(S, R.cast, true), step: 5 * u, seed: 420 + k, lum: 0.3, alpha: 0.6 });
      fillShape(g, { bb: bbOf(x, y, 64 * sc, 24 * sc), sd: poly([[x - 58 * sc, y - 10 * sc + tilt], [x + 62 * sc, y - 10 * sc - tilt], [x + 44 * sc, y + 14 * sc], [x - 40 * sc, y + 14 * sc]]), ramp: tone(S, hull, true), step: 4 * u, seed: 422 + k, lum: (xx, yy) => clamp(0.55 + (y - yy) * 0.01 / sc) });
      fillShape(g, { bb: bbOf(x, y - 70 * sc, 50 * sc, 70 * sc), sd: poly([[x - 4 * sc, y - 130 * sc], [x - 4 * sc, y - 16 * sc], [x - 54 * sc, y - 16 * sc]]), ramp: tone(S, R.cream, true), step: 4 * u, seed: 424 + k, lum: (xx) => clamp(0.85 - 0.3 * ((xx - x + 54 * sc) / (54 * sc))) });
      fillShape(g, { bb: bbOf(x, y - 60 * sc, 50 * sc, 60 * sc), sd: poly([[x + 4 * sc, y - 110 * sc], [x + 4 * sc, y - 16 * sc], [x + 44 * sc, y - 16 * sc]]), ramp: tone(S, R.pink, true), step: 4 * u, seed: 426 + k, lum: (xx) => clamp(0.8 - 0.4 * ((xx - x) / (44 * sc))) });
    });
  }
  function shoreLife(g, S, L, t, pan) {
    const G = L.G, { W, u } = S, map = new Map(), cols = [cv(S, "#ffffff"), cv(S, "#fffaf0"), cv(S, "#bfe0f4"), cv(S, "#dccbe8")];
    for (let i = -2; i * 6.4 * u < W + 20; i++) {
      const xs = i * 6.4 * u, xl = xs + G.M + pan(1), surge = 6 * u * Math.sin(t * 1.2 + xl / (120 * u)) + 3 * u * Math.sin(t * 2.3 + xl / (47 * u));
      for (let r = 0; r < 2; r++) {
        const h = hash(i, r, 501), y = shoreY(G, xl) + surge - r * 7 * u + (h - 0.5) * 6 * u;
        dab(map, cols[Math.floor(hash(i, r, 502) * 4) % 4], xs + (h - 0.5) * 4 * u, y, 5.2 * u, 3 * u, (i & 7));
      }
    }
    flush(g, map);
    // Beach grass sways at the edges of the ground.
    const gcols = [R.green[1], R.green[2], R.green[3], R.teal[1], R.green[0]].map((c) => cv(S, c, true));
    for (let k = 0; k < 8; k++) {
      const xl = G.M + W * (k < 4 ? 0.005 + 0.05 * k : 0.86 + 0.045 * (k - 4)), x = xl - G.M - pan(1), by = G.H + 4 * u;
      for (let b = 0; b < 7; b++) {
        const lean = (b - 3) * 22 * u + (hash(k, b, 7) - 0.5) * 20 * u, len = (110 + hash(k, b, 8) * 90) * u, sway = Math.sin(t * 1.3 + k * 1.7 + b * 0.6) * 12 * u;
        const bx = x + (b - 3) * 9 * u; dabLine(g, [[bx, by], [bx + lean * 0.4 + sway * 0.3, by - len * 0.5], [bx + lean + sway, by - len]], { cols: gcols, rad: 4.4 * u, gap: 6.4 * u, seed: 520 + k * 9 + b });
      }
    }
  }
  // Kites and their fliers: the title and closing scenes' hero. Strings run behind the headline tag.
  function person(g, S, c, o) {
    const { u, t } = c, s = o.size, cx = o.cx, base = o.base, q = o.q;
    if (q <= 0) return;
    const sway = Math.sin(t * 1.5 + o.phase) * s * 0.018, warp = (x, y, out) => { out.x = x + (sway * (base - y)) / s * 2; out.y = y; };
    const hr = 0.115 * s, hy = base - 0.86 * s, shY = base - 0.72 * s, wY = base - 0.5 * s;
    const common = { p: q, warp, step: Math.max(4.4 * u, s * 0.018), ord: c.ord, exit: c.ex, u, t, birth: (x, y) => clamp((base - y) / s), seed: o.seed };
    const gar = o.ramp, skin = o.skin, v = o.v % 4;
    fillShape(g, { ...common, bb: bbOf(cx + 0.3 * s, base, 0.5 * s, 0.05 * s), sd: ell(cx + (0.34 + 0.08 * Math.sin(t * 0.4)) * s, base + 0.01 * s, 0.4 * s, 0.045 * s), ramp: tone(S, R.cast), lum: 0.4, seed: o.seed + 1, warp: null, p: Math.min(1, q * 2) });
    if (v === 3) fillShape(g, { ...common, bb: bbOf(cx, hy - 0.1 * s, 0.2 * s, 0.22 * s), sd: uni(circ(cx, hy - 0.02 * s, hr * 1.18), circ(cx + 0.85 * hr, hy - 1.18 * hr, 0.46 * hr)), ramp: tone(S, R.hair), lum: 0.35, seed: o.seed + 2 });
    const body0 = poly([[cx - 0.11 * s, shY], [cx + 0.11 * s, shY], [cx + 0.14 * s, wY], [cx + 0.27 * s, base], [cx - 0.27 * s, base], [cx - 0.14 * s, wY]]);
    fillShape(g, { ...common, bb: bbOf(cx, (shY + base) / 2, 0.36 * s, 0.46 * s), sd: uni((x, y) => body0(x, y) - 9 * u, circ(cx, hy, hr + 9 * u)), ramp: tone(S, R.cream), lum: 0.8, keep: () => 0.55, seed: o.seed + 11, size: 1.1 });
    const body = poly([[cx - 0.11 * s, shY], [cx + 0.11 * s, shY], [cx + 0.14 * s, wY], [cx + 0.27 * s, base], [cx - 0.27 * s, base], [cx - 0.14 * s, wY]]);
    fillShape(g, { ...common, bb: bbOf(cx, (shY + base) / 2, 0.3 * s, 0.4 * s), sd: body, ramp: gar, seed: o.seed + 3,
      lum: (x, y, d) => clamp(0.64 - 0.55 * ((x - cx) / (0.27 * s)) * 0.7 + 0.1 * Math.sin((y - shY) * 0.05 - t * 1.4) - (d > -0.02 * s ? 0.1 : 0)) });
    const hand = o.arm === "up" ? [cx + 0.22 * s, hy - 0.08 * s] : [cx - 0.2 * s, wY + 0.08 * s];
    fillShape(g, { ...common, bb: bbOf(cx, shY, 0.3 * s, 0.35 * s), sd: uni(seg(cx - 0.11 * s, shY + 0.02 * s, cx - 0.2 * s, wY + 0.08 * s, 0.032 * s), seg(cx + 0.11 * s, shY + 0.02 * s, hand[0], hand[1], 0.032 * s)), ramp: gar, lum: 0.6, seed: o.seed + 4 });
    fillShape(g, { ...common, bb: bbOf(cx, hy, hr * 1.4, hr * 1.4), sd: circ(cx, hy, hr), ramp: skin, step: Math.max(3.6 * u, s * 0.014), lum: sphere(cx, hy, hr), seed: o.seed + 5 });
    if (v === 0) {
      fillShape(g, { ...common, bb: bbOf(cx, hy - hr, 0.22 * s, 0.1 * s), sd: uni(ell(cx, hy - 0.6 * hr, 0.2 * s, 0.045 * s), isect(circ(cx, hy - 0.5 * hr, 1.05 * hr), (x, y) => y - (hy - 0.55 * hr))), ramp: tone(S, R.yellow), lum: (x, y) => clamp(0.74 - (y - hy) * 0.002), seed: o.seed + 6 });
    } else if (v === 1) {
      const pcx = cx + 0.14 * s, pcy = hy - 0.3 * s, rx = 0.34 * s;
      fillShape(g, { ...common, bb: bbOf(cx + 0.18 * s, hy - 0.1 * s, 0.1 * s, 0.4 * s), sd: seg(cx + 0.22 * s, wY - 0.05 * s, pcx, pcy, Math.max(2.4 * u, 0.008 * s)), ramp: tone(S, R.wood), lum: 0.5, seed: o.seed + 7 });
      fillShape(g, { ...common, bb: bbOf(pcx, pcy - 0.07 * s, rx, 0.14 * s), sd: isect(ell(pcx, pcy, rx, 0.15 * s), (x, y) => y - pcy), step: Math.max(4.2 * u, s * 0.015),
        rampf: (x) => (Math.floor((x - pcx) / (0.05 * s) + t * 1.6) & 1 ? tone(S, R.cream) : o.canopy || tone(S, R.pink)), lum: (x, y) => clamp(0.5 - 0.3 * ((x - pcx) / rx) + 0.1 * Math.sin(t * 2 + x * 0.05)), seed: o.seed + 8 });
    } else if (v === 2) {
      fillShape(g, { ...common, bb: bbOf(cx, hy - hr, 0.2 * s, 0.12 * s), sd: uni(isect(circ(cx, hy - 0.5 * hr, 1.0 * hr), (x, y) => y - (hy - 0.45 * hr)), ell(cx, hy - 0.5 * hr, 0.17 * s, 0.03 * s)), ramp: tone(S, R.ink), lum: 0.5, seed: o.seed + 9 });
    }
  }
  function kite(g, S, c, kx, ky, k, ramps, seed, hand) {
    const { u, t } = c, ang = Math.sin(t * 1.1 + seed) * 0.22, ca = Math.cos(ang), sa = Math.sin(ang);
    const rot = (x, y) => [kx + x * ca - y * sa, ky + x * sa + y * ca];
    const pts = [rot(0, -0.78 * k), rot(0.5 * k, -0.1 * k), rot(0, 0.72 * k), rot(-0.5 * k, -0.1 * k)];
    fillShape(g, { bb: bbOf(kx, ky, k * 0.9, k * 0.95), sd: poly(pts), step: Math.max(4.2 * u, k * 0.05), seed: 600 + seed, t,
      rampf: (x, y) => { const lx = (x - kx) * ca + (y - ky) * sa, ly = -(x - kx) * sa + (y - ky) * ca; return (lx > 0) !== (ly > -0.1 * k) ? ramps[0] : ramps[1]; },
      lum: (x, y) => clamp(0.66 - 0.3 * ((x - kx) / k) + 0.1 * Math.sin(t * 2 + seed)) });
    const bot = rot(0, 0.72 * k), tail = [bot];
    for (let s = 1; s <= 10; s++) tail.push([bot[0] + Math.sin(t * 3 - s * 0.7 + seed) * 16 * u * (s / 10) + s * 3 * u, bot[1] + s * 14 * u]);
    dabLine(g, tail, { cols: [ramps[0][2], ramps[1][3], ramps[0][4], ramps[1][2]], rad: 5.2 * u, gap: 9 * u, seed: 620 + seed });
    const sag = (a, b) => [a, [lerp(a[0], b[0], 0.5) - 14 * u, lerp(a[1], b[1], 0.5) - 12 * u], b];
    dabLine(g, sag(bot, hand), { cols: [cv(S, "#3a2a80"), cv(S, "#5a46a8")], rad: 2.6 * u, gap: 7.5 * u, seed: 640 + seed, alpha: 0.85 });
  }
  function hero(g, S, L, info, t, warm) {
    const sceneId = info.scene;
    if (sceneId !== "title" && sceneId !== "closing") return;
    const c = { u: S.u, t, ex: 0, ord: () => 0.5 }, { W, H, u } = S;
    const q = ease(span(info.local, 0, 0.9)), out = info.next ? 1 - span(info.local, info.hold - info.change, info.hold) : 1;
    const k = q * out;
    if (k <= 0.01) return;
    const base = H * 0.955, size = 230 * u, flyers = [{ cx: W * 0.16, v: 0, ramp: R.violet, skin: R.skinB }, { cx: W * 0.84, v: 1, ramp: R.teal, skin: R.skinA }];
    const hands = flyers.map((f) => [f.cx + 0.22 * size, base - 0.86 * size - 0.08 * size]);
    const KR = [[R.blue, R.cream], [R.orange, R.pink], [R.green, R.yellow]].map((pair) => pair.map((r) => tone(S, r)));
    const kk = Math.min(1, k * 1.25);
    [[0.12, 0.17, 0, 0], [0.46, 0.11, 1, 0], [0.92, 0.19, 2, 1]].forEach(([fx, fy, i, fl]) => {
      const kx = W * fx + Math.sin(t * 0.6 + i * 2) * 26 * u, ky = (H * fy + Math.sin(t * 0.9 + i) * 14 * u) * kk + (1 - kk) * H * 0.6;
      kite(g, S, { ...c, t }, kx, ky, (100 + 14 * i) * u * Math.max(0.3, kk), KR[i], i + 1, hands[fl]);
    });
    flyers.forEach((f, i) => person(g, S, { ...c, t }, { cx: f.cx, base, size, v: f.v, ramp: tone(S, f.ramp), skin: tone(S, f.skin), q: Math.min(1, k * 1.6), phase: i * 2, arm: "up", seed: 700 + i * 20, canopy: tone(S, R.orange) }));
    // Dusk lanterns rise from the sand.
    if (sceneId === "closing") {
      const lr = tone(S, R.glow);
      for (let n = 0; n < 6; n++) {
        const x = W * (0.12 + 0.15 * n) + Math.sin(t * 0.7 + n * 1.9) * 22 * u, y = H * 1.05 - ((t * 30 * u + n * 0.37 * H) % (H * 0.9));
        fillShape(g, { bb: bbOf(x, y, 50 * u, 56 * u), sd: ell(x, y, 22 * u, 30 * u), ramp: lr, step: 4.4 * u, seed: 760 + n, t, lum: (xx, yy) => clamp(0.78 - 0.4 * ((yy - y) / (30 * u)) * 0.3), alpha: k });
        fillShape(g, { bb: bbOf(x, y, 100 * u, 100 * u), sd: circ(x, y, 90 * u), ramp: lr, step: 9 * u, seed: 780 + n, t, lum: 0.9, keep: (xx, yy) => Math.pow(clamp(1 - Math.hypot(xx - x, yy - y) / (90 * u)), 2) * 0.5, alpha: k * 0.7 });
      }
    }
  }
  function motes(g, S, t, tex) {
    const { W, H, u } = S, map = new Map(), n = Math.round(90 * tex), cols = [cv(S, "#fff08a"), cv(S, "#ffffff"), cv(S, "#fcc6d6"), cv(S, "#bfe0f4")];
    for (let k = 0; k < n; k++) {
      const h = hash(k, 1, 801), h2 = hash(k, 2, 801), sp = 12 + 20 * h2;
      const x = (((h * W + t * (10 + 22 * h2) * u + Math.sin(t * 0.8 + k) * 14 * u) % W) + W) % W, y = (((h2 * H - t * sp * u) % H) + H) % H;
      const tw = 0.5 + 0.5 * Math.sin(t * 3 + k * 1.7);
      dab(map, cols[k % 4], x, y, (2.6 + 3.2 * tw) * u, (2 + 2 * tw) * u, k & 15);
    }
    flush(g, map, 0.85);
  }
  // The headline's own paint tag: pale dabs behind the lines of words, forming as they arrive.
  function patch(g, S, info) {
    if (!info.scene || !HEADS[info.scene]) return;
    const lines = [];
    for (const id of HEADS[info.scene]) for (const l of headLines(id)) lines.push(l);
    if (!lines.length) return;
    const { u } = S, x0 = Math.min(...lines.map((l) => l.x)) - 48 * u, x1 = Math.max(...lines.map((l) => l.x + l.w)) + 48 * u;
    const y0 = Math.min(...lines.map((l) => l.y)) - 30 * u, y1 = Math.max(...lines.map((l) => l.y + l.h)) + 30 * u;
    const q = ease(span(info.local, 0, 0.55)), leave = info.next ? span(info.local, info.hold - info.change, info.hold) : 0;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = (x1 - x0) / 2, hh = (y1 - y0) / 2;
    const base = { bb: bbOf(cx + 8 * u, cy + 10 * u, hw + 16 * u, hh + 18 * u), p: q, exit: leave, ord: (x) => clamp((x - x0) / (x1 - x0)), u, t: info.t, step: 8 * u, birth: (x, y) => clamp(Math.hypot((x - cx) / hw, (y - cy) / hh) * 0.7) };
    fillShape(g, { ...base, sd: rbox(cx + 8 * u, cy + 10 * u, hw, hh, 44 * u), ramp: tone(S, R.cast), lum: 0.5, keep: () => 0.5, seed: 811 });
    fillShape(g, { ...base, bb: bbOf(cx, cy, hw + 8 * u, hh + 8 * u), sd: rbox(cx, cy, hw, hh, 44 * u), ramp: tone(S, R.cream), size: 1.3, lum: (x, y) => 0.7 + 0.22 * Math.sin(x * 0.03 + y * 0.05), seed: 813 });
  }
  // At each change a gust of loose dabs sweeps across behind the art, carrying the old scene away.
  function gust(g, S, info) {
    if (!info.scene) return;
    const ch = info.change;
    let q = -1;
    if (info.next && info.local > info.hold - ch) q = 0.5 * span(info.local, info.hold - ch, info.hold);
    else if (info.index > 0 && info.local < ch * 1.5) q = 0.5 + 0.5 * span(info.local, 0, ch * 1.5);
    if (q < 0 || q >= 1) return;
    const { W, H, u } = S, cx = lerp(-0.25 * W, 1.25 * W, q), bw = 0.4 * W, map = new Map();
    const cols = [S.accent, cv(S, "#f6b02a"), cv(S, "#2f84dc"), cv(S, "#f08ab4"), cv(S, "#fffaf0"), cv(S, "#5fb84a"), cv(S, "#8a63c8")];
    for (let k = 0; k < 700; k++) {
      const h = hash(k, 1, 901), h2 = hash(k, 2, 901), h3 = hash(k, 3, 901), y = H * (0.02 + 0.96 * h2);
      const x = cx + (h - 0.5) * bw + (y / H - 0.5) * 0.22 * W + Math.sin(h2 * 12 + q * 10) * 46 * u, yy = y + Math.sin(h * 9 + q * 8) * 30 * u;
      dab(map, cols[Math.floor(h3 * cols.length) % cols.length], x, yy, (4 + 5 * h3) * u * 1.2, (3 + 3 * h) * u, (k * 3) & 15);
    }
    flush(g, map, Math.sqrt(Math.sin(q * Math.PI)));
  }

  // ---- scenes ------------------------------------------------------------------------------------------------
  const shape = (g, c, o) => fillShape(g, { u: c.u, t: c.t, exit: c.ex, ord: c.ord, step: 7 * c.u, ...o });

  // Chart: striped sea-towers rise from the sand; each wears a paint tag with its figure.
  function chart(g, S, box, p, d, info) {
    const c = ctxOf(S, box, info), { u, t } = c, tall = S.tall;
    const vals = (d.values || []).map((v) => Math.max(0, Number(v) || 0)), n = Math.max(1, vals.length), max = Math.max(...vals, 1);
    const hi = d.highlight >= 0 && d.highlight < n ? d.highlight : -1;
    const slot = box.w / n, bw = Math.min(slot * 0.52, (tall ? 150 : 176) * u), base = box.y + box.h - (tall ? 110 : 96) * u;
    const minH = 170 * u, maxH = Math.max(minH + 40 * u, base - box.y - 135 * u);
    const RAMPS = [R.violet, R.green, R.orange, R.teal, R.blue, R.pink], acc = accRamp(S), stripe = tone(S, R.stripe), spark = [];
    vals.forEach((v, i) => {
      const cx = box.x + slot * (i + 0.5), hot = i === hi, ramp = hot ? acc : tone(S, RAMPS[i % RAMPS.length]);
      const q = ease(span(p, i * 0.11, i * 0.11 + 0.5)), pre = ease(span(p, i * 0.05, i * 0.05 + 0.2));
      const hFull = minH + (maxH - minH) * (v / max) * (1 + 0.012 * Math.sin(t * 1.7 + i)), top = base - hFull;
      const Ls = 0.6 * hFull * (0.85 + 0.15 * Math.sin(t * 0.5));
      shape(g, c, { bb: bbOf(cx + Ls * 0.5, base + 8 * u, Ls + bw, 34 * u), sd: ell(cx + bw * 0.3 + Ls * 0.5, base + 12 * u, bw * 0.55 + Ls * 0.5, 24 * u), ramp: tone(S, R.cast), lum: 0.4, p: pre, keep: () => 0.85, seed: 1100 + i, birth: (x) => clamp((x - cx) / (Ls + bw)) });
      shape(g, c, { bb: bbOf(cx, base + 4 * u, bw, 30 * u), sd: ell(cx, base + 6 * u, bw * 0.66, 20 * u), ramp: tone(S, R.sand), lum: (x, y) => clamp(0.55 + (base - y) * 0.01), p: pre, seed: 1120 + i });
      const body = rbox(cx, (base + top) / 2, bw / 2, hFull / 2, 16 * u), growth = base - hFull * q, bandY = base - hFull * fract(t * 0.22 + i * 0.23);
      shape(g, c, { bb: [cx - bw / 2 - 8 * u, top - 8 * u, cx + bw / 2 + 8 * u, base + 8 * u], sd: (x, y) => Math.max(body(x, y), growth - y), seed: 1140 + i,
        rampf: (x, y) => (Math.floor((base - y) / (54 * u)) & 1 ? stripe : ramp),
        lum: (x, y, dd) => { const nx = (x - cx) / (bw / 2); return clamp(0.58 - 0.42 * nx + 0.12 * (1 - nx * nx) + 0.2 * Math.exp(-Math.pow((y - bandY) / (34 * u), 2)) - (dd > -9 * u ? 0.3 : 0)); } });
      if (q > 0.9) shape(g, c, { bb: bbOf(cx, top, bw / 2 + 6 * u, bw * 0.16), sd: ell(cx, top + 2 * u, bw / 2, bw * 0.13), ramp, lum: 0.86, seed: 1160 + i, p: ease(span(q, 0.9, 1)) });
      const tq = ease(span(p, i * 0.11 + 0.28, i * 0.11 + 0.6)), bob = Math.sin(t * 2 + i * 1.1) * 5 * u;
      tag(g, S, c, { x: cx, y: top - 30 * u + bob, text: tally(v, ease(span(p, i * 0.11 + 0.3, i * 0.11 + 0.75)), d), size: 100 * u, font: SERIF, q: tq, color: hot ? acc[1] : TAGINK, ramp: hot ? tone(S, R.pink) : undefined, seed: i * 7, maxW: Math.max(slot * 1.02, 230 * u) });
      tag(g, S, c, { x: cx, y: base + 66 * u, text: d.labels[i] || "", size: (tall ? 40 : 44) * u, q: ease(span(p, i * 0.05 + 0.04, i * 0.05 + 0.3)), seed: i * 11 + 3, maxW: slot * 0.96 });
      if (hot && q > 0.8) for (let k = 0; k < 14; k++) { const a = t * 1.3 + (k / 14) * TAU, rr = bw * 0.78 + 14 * u * Math.sin(t * 2 + k); spark.push([cx + Math.cos(a) * rr * 1.25, top - 30 * u + Math.sin(a) * rr * 0.62 + bob, k]); }
    });
    if (spark.length) {
      const map = new Map(), cols = [acc[3], acc[4], cv(S, "#fff08a"), acc[2]];
      for (const [x, y, k] of spark) dab(map, cols[k % 4], x, y, (4.6 + 2.4 * Math.sin(t * 4 + k)) * u, 3.2 * u, k);
      flush(g, map, 1 - clamp(c.ex * 2));
    }
  }

  // Object: the device, painted dab by dab, with a playhead that runs, dials that slide and three leaders.
  function object(g, S, box, p, d, info) {
    const c = ctxOf(S, box, info), { u, t } = c, tall = S.tall, phone = d.kind === "phone", acc = accRamp(S);
    let dx, dy, dw, dh;
    if (phone) { dh = Math.min(box.h - 70 * u, tall ? box.h * 0.55 : 9999); dw = dh * 0.5; dx = tall ? box.x + (box.w - dw) / 2 : box.x + box.w * 0.2 - dw / 2; dy = tall ? box.y + 10 * u : box.y + (box.h - dh) / 2; }
    else { dw = Math.min(tall ? box.w : box.w * 0.56, (box.h - 90 * u) / 0.66); dh = dw * 0.6; dx = tall ? box.x + (box.w - dw) / 2 : box.x + 4 * u; dy = tall ? box.y + 10 * u : box.y + (box.h - dh - 30 * u) / 2; }
    const bq = ease(span(p, 0, 0.3)), sq = ease(span(p, 0.12, 0.45)), cq = span(p, 0.3, 0.7);
    const mx = dx + dw / 2, my = dy + dh / 2, slate = tone(S, R.body), bez = phone ? 22 * u : 42 * u;
    // Shadow on the sand and the body.
    shape(g, c, { bb: bbOf(mx + 30 * u, dy + dh + 20 * u, dw * 0.65, 40 * u), sd: ell(mx + 40 * u, dy + dh + (phone ? 10 : 34) * u, dw * 0.55, 22 * u), ramp: tone(S, R.cast), lum: 0.4, p: bq, keep: () => 0.8, seed: 1201 });
    const bodySd = rbox(mx, my, dw / 2, dh / 2, (phone ? 40 : 22) * u);
    shape(g, c, { bb: bbOf(mx, my, dw / 2 + 8 * u, dh / 2 + 8 * u), sd: bodySd, ramp: slate, p: bq, birth: (x, y) => clamp(Math.hypot(x - mx, y - my) / Math.hypot(dw, dh) * 2), seed: 1210, step: 6 * u,
      lum: (x, y, dd) => clamp(0.8 - 0.3 * ((x - dx) / dw) - 0.15 * ((y - dy) / dh) + (dd > -7 * u ? -0.3 : 0) + 0.05 * Math.sin(t * 1.5 + x * 0.01)) });
    if (!phone) shape(g, c, { bb: [dx - dw * 0.07, dy + dh - 4 * u, dx + dw * 1.07, dy + dh + 34 * u], sd: poly([[dx - dw * 0.06, dy + dh + 30 * u], [dx + dw * 1.06, dy + dh + 30 * u], [dx + dw * 0.97, dy + dh - 2 * u], [dx + dw * 0.03, dy + dh - 2 * u]]), ramp: tone(S, R.body), p: bq, seed: 1215, step: 5 * u,
      lum: (x, y) => clamp(0.7 + (y - dy - dh) * 0.012 - (y > dy + dh + 24 * u ? 0.3 : 0)), birth: (x) => clamp((x - dx) / dw) });
    const sx = dx + bez, sy = dy + bez, sw = dw - bez * 2, sh = dh - bez * 2 - (phone ? 6 * u : 0);
    const scrSd = rbox(sx + sw / 2, sy + sh / 2, sw / 2, sh / 2, 10 * u);
    shape(g, c, { bb: bbOf(sx + sw / 2, sy + sh / 2, sw / 2 + 4 * u, sh / 2 + 4 * u), sd: scrSd, ramp: tone(S, R.scr), p: sq, birth: (x, y) => clamp((y - sy) / sh), seed: 1230, step: 5 * u,
      lum: (x, y) => clamp(0.4 - 0.34 * ((y - sy) / sh) + 0.07 * Math.sin(x * 0.02 + t * 1.5)) });
    // Preview painting, dials and timeline.
    const pr = phone ? { x: sx + sw * 0.08, y: sy + sh * 0.06, w: sw * 0.84, h: sh * 0.36 } : { x: sx + sw * 0.05, y: sy + sh * 0.07, w: sw * 0.58, h: sh * 0.5 };
    const prSd = rbox(pr.x + pr.w / 2, pr.y + pr.h / 2, pr.w / 2, pr.h / 2, 8 * u), pq = ease(span(cq, 0, 0.5)), bb = bbOf(pr.x + pr.w / 2, pr.y + pr.h / 2, pr.w / 2 + 4 * u, pr.h / 2 + 4 * u);
    shape(g, c, { bb, sd: prSd, ramp: tone(S, R.skyp), lum: 0.66, p: pq, seed: 1240, step: 4.2 * u, birth: (x) => clamp((x - pr.x) / pr.w) });
    const sunx = pr.x + pr.w * 0.72, suny = pr.y + pr.h * 0.36 + Math.sin(t * 1.2) * 5 * u;
    shape(g, c, { bb, sd: isect(prSd, circ(sunx, suny, pr.h * 0.17)), ramp: tone(S, R.sun), lum: 0.75, p: pq, seed: 1242, step: 4.2 * u });
    shape(g, c, { bb, sd: isect(prSd, (x, y) => pr.y + pr.h * 0.64 - y), ramp: tone(S, R.water), lum: (x, y) => clamp(0.55 + 0.25 * Math.sin(x * 0.07 + y * 0.1 - t * 3)), p: pq, seed: 1244, step: 4.2 * u });
    if (!phone) {
      const ix = sx + sw * 0.69, iw = sw * 0.26;
      for (let k = 0; k < 3; k++) {
        const y = pr.y + pr.h * (0.18 + 0.32 * k), kx = ix + iw * (0.5 + 0.38 * Math.sin(t * (0.8 + 0.3 * k) + k * 2.1)), dq = ease(span(cq, 0.2 + 0.1 * k, 0.6 + 0.1 * k));
        shape(g, c, { bb: bbOf(ix + iw / 2, y, iw / 2 + 8 * u, 10 * u), sd: seg(ix, y, ix + iw, y, 3.4 * u), ramp: tone(S, R.stripe), lum: 0.55, p: dq, seed: 1250 + k, step: 3.4 * u });
        shape(g, c, { bb: bbOf(kx, y, 16 * u, 16 * u), sd: circ(kx, y, 11 * u), ramp: k === 0 ? acc : tone(S, R.orange), lum: sphere(kx, y, 11 * u), p: dq, seed: 1260 + k, step: 3.4 * u });
      }
    } else {
      for (let k = 0; k < 2; k++) {
        const y = sy + sh * (0.5 + 0.06 * k), kx = sx + sw * (0.2 + 0.6 * (0.5 + 0.5 * Math.sin(t * (0.8 + 0.3 * k) + k * 2)));
        shape(g, c, { bb: bbOf(sx + sw / 2, y, sw * 0.4, 10 * u), sd: seg(sx + sw * 0.12, y, sx + sw * 0.88, y, 3.2 * u), ramp: tone(S, R.stripe), lum: 0.55, p: pq, seed: 1250 + k, step: 3.4 * u });
        shape(g, c, { bb: bbOf(kx, y, 16 * u, 16 * u), sd: circ(kx, y, 10 * u), ramp: k === 0 ? acc : tone(S, R.orange), lum: sphere(kx, y, 10 * u), p: pq, seed: 1260 + k, step: 3.4 * u });
      }
    }
    const y0 = sy + sh * (phone ? 0.64 : 0.66), th = sh * (phone ? 0.07 : 0.075), gap = sh * 0.03;
    const rows = [[[0.04, 0.24], [0.3, 0.2], [0.54, 0.16], [0.74, 0.2]], [[0.1, 0.3], [0.44, 0.28], [0.76, 0.18]], [[0, 0.18], [0.22, 0.34], [0.6, 0.3]]];
    const cram = [R.blue, R.teal, R.violet], anchors = [[pr.x + pr.w * 0.85, pr.y + pr.h * 0.5], null, null];
    dabLine(g, [[sx + sw * 0.03, y0 - 8 * u], [sx + sw * 0.97, y0 - 8 * u]], { cols: [cv(S, "#b8dcf4"), cv(S, "#fffaf0")], rad: 2.4 * u, gap: 5 * u, q: ease(span(cq, 0.2, 0.6)), seed: 1270, alpha: 1 - clamp(c.ex * 2) });
    rows.forEach((row, r) => row.forEach(([a, w], i) => {
      const cy = y0 + th / 2 + r * (th + gap), cx = sx + sw * (a + w / 2), hotClip = r === 0 && i === 1, qq = ease(span(cq, 0.3 + (r * 4 + i) * 0.03, 0.65 + (r * 4 + i) * 0.03));
      shape(g, c, { bb: bbOf(cx, cy, sw * w / 2 + 4 * u, th / 2 + 4 * u), sd: rbox(cx, cy, sw * w / 2 - 3 * u, th / 2, 5 * u), ramp: hotClip ? acc : tone(S, cram[(r + i) % 3]), p: qq, seed: 1280 + r * 10 + i, step: 3.8 * u, birth: (x) => clamp((x - cx) / (sw * w) + 0.5),
        lum: (x, y) => clamp(0.62 + 0.18 * Math.sin(x * 0.04 - t * 3 + r) - ((y - cy) / th) * 0.2) });
      if (hotClip) anchors[1] = [cx, cy];
      if (r === 2 && i === 1) anchors[2] = [cx, cy];
    }));
    const ph = sx + sw * (0.06 + 0.88 * fract(t * 0.1 + 0.15)), pa = ease(span(cq, 0.5, 0.9)) * (1 - clamp(c.ex * 2));
    if (pa > 0) {
      dabLine(g, [[ph, y0 - 12 * u], [ph, y0 + 3 * (th + gap)]], { cols: [cv(S, "#fffaf0"), cv(S, "#fff08a")], rad: 3.2 * u, gap: 5.6 * u, alpha: pa, seed: 1290 });
      shape(g, c, { bb: bbOf(ph, y0 - 20 * u, 14 * u, 12 * u), sd: poly([[ph - 11 * u, y0 - 28 * u], [ph + 11 * u, y0 - 28 * u], [ph, y0 - 10 * u]]), ramp: acc, lum: 0.7, p: pa, seed: 1291, step: 3.2 * u });
    }
    // Sparks lift off the screen and drift upward.
    const sm = new Map(), spc = [cv(S, "#fff08a"), cv(S, "#b8dcf4"), cv(S, "#fcc6d6")];
    for (let k = 0; k < 26; k++) { const f = fract(t * (0.18 + 0.1 * hash(k, 1, 12)) + hash(k, 2, 12)), x = sx + sw * hash(k, 3, 12) + Math.sin(f * 6 + k) * 14 * u, y = sy + sh * 0.9 - f * (sh * 0.9 + 120 * u); dab(sm, spc[k % 3], x, y, (3.6 * (1 - f) + 1.4) * u, (2.6 * (1 - f) + 1) * u, k & 15); }
    flush(g, sm, ease(span(p, 0.4, 0.7)) * (1 - clamp(c.ex * 2)));
    // Leaders and labels.
    const labels = (d.callouts || []).slice(0, 3), size = (tall ? 42 : 46) * u;
    labels.forEach((label, i) => {
      const lq = ease(span(p, 0.5 + 0.1 * i, 0.82 + 0.1 * i)), a = anchors[i];
      if (lq <= 0 || !label || !a) return;
      const ty = tall ? dy + dh + 120 * u + i * 104 * u : box.y + box.h * (0.2 + 0.3 * i), tx = tall ? box.x + 24 * u : box.x + box.w * 0.64;
      const tg = tag(g, S, c, { x: tx, y: ty, align: "left", text: label, size, q: lq, seed: 30 + i * 5, maxW: box.x + box.w - tx });
      if (!tg) return;
      const end = tall ? [tg.cx, tg.cy - tg.h / 2 - 4 * u] : [tg.left - 10 * u, tg.cy];
      const mid = tall ? [a[0], end[1] - 50 * u] : [lerp(a[0], end[0], 0.5), a[1] * 0.4 + end[1] * 0.6];
      dabLine(g, [a, mid, end], { cols: [acc[2], acc[1], cv(S, TAGINK)], rad: 3.6 * u, gap: 9 * u, q: ease(span(lq, 0, 0.8)), march: t * 22 * u, seed: 1300 + i, alpha: 1 - clamp(c.ex * 2) });
      const pulse = 0.5 + 0.5 * Math.sin(t * 3 + i * 2), am = new Map();
      for (let k = 0; k < 8; k++) { const ang = t * 1.5 + (k / 8) * TAU, rr = (16 + 8 * pulse) * u; dab(am, acc[(k % 3) + 1], a[0] + Math.cos(ang) * rr, a[1] + Math.sin(ang) * rr, 4.2 * u, 3 * u, k * 2 & 15); }
      flush(g, am, lq * (1 - clamp(c.ex * 2)));
      shape(g, c, { bb: bbOf(a[0], a[1], 14 * u, 14 * u), sd: circ(a[0], a[1], 9 * u), ramp: acc, lum: sphere(a[0], a[1], 9 * u), p: lq, seed: 1310 + i, step: 3.2 * u });
    });
  }

  // People: a stroll of figures with a dog and a butterfly; the highlighted one carries a turning parasol.
  function dog(g, S, c, x, y, size, ramp, q) {
    const { t, u } = c, fur = ramp, sw = (k) => Math.sin(t * 9 + k * Math.PI / 2) * 0.5;
    const common = { p: q, step: Math.max(3.4 * u, size * 0.04), ord: c.ord, exit: c.ex, u, t, birth: (xx) => clamp((xx - x) / size + 0.6) };
    const parts = [[-0.3, 0], [0.3, 1], [-0.2, 2], [0.4, 3]].map(([hx, k]) => seg(x + hx * size, y + 0.1 * size, x + hx * size + Math.sin(sw(k)) * 0.22 * size, y + 0.46 * size, 0.06 * size));
    shape(g, c, { ...common, bb: bbOf(x, y + 0.3 * size, size * 0.9, size * 0.5), sd: uni(...parts), ramp: fur, lum: 0.32, seed: 1500 });
    shape(g, c, { ...common, bb: bbOf(x, y, size * 1.0, size * 0.5), sd: uni(ell(x, y, 0.5 * size, 0.22 * size), circ(x + 0.52 * size, y - 0.2 * size, 0.17 * size), ell(x + 0.7 * size, y - 0.15 * size, 0.1 * size, 0.06 * size),
      ell(x + 0.46 * size, y - 0.36 * size + Math.sin(t * 6) * 0.01 * size, 0.06 * size, 0.1 * size), seg(x - 0.48 * size, y - 0.05 * size, x - 0.72 * size, y - 0.3 * size + Math.sin(t * 12) * 0.12 * size, 0.04 * size)),
      ramp: fur, lum: (xx, yy) => clamp(0.64 - ((yy - y) / size) * 0.7 - ((xx - x) / size) * 0.1), seed: 1501 });
  }
  function people(g, S, box, p, d, info) {
    const c = ctxOf(S, box, info), { u, t } = c, n = Math.max(2, Math.min(6, Math.round(d.count || 4))), size = Math.min(box.h * 0.74, (box.w / n) * 1.3), base = box.y + box.h * 0.9;
    const acc = accRamp(S), garments = [R.violet, R.teal, R.green, R.blue, R.orange, R.pink], skins = [R.skinB, R.skinA, R.skinC], hotI = Math.min(n - 1, d.highlight == null ? 1 : d.highlight);
    // A strip of grass the group stands on.
    shape(g, c, { bb: bbOf(box.x + box.w / 2, base + 14 * u, box.w / 2 + 10 * u, 22 * u), sd: ell(box.x + box.w / 2, base + 6 * u, box.w / 2, 16 * u), ramp: tone(S, R.green), lum: (x) => 0.55 + 0.2 * Math.sin(x * 0.02), p: ease(span(p, 0, 0.3)), birth: (x) => clamp((x - box.x) / box.w), seed: 1400 });
    for (let i = 0; i < n; i++) {
      const q = ease(span(p, i * 0.1, i * 0.1 + 0.5)), cx = box.x + (box.w / n) * (i + 0.5), hot = i === hotI, s = size * (hot ? 1.06 : 1), label = d.badges[i % d.badges.length];
      person(g, S, c, { cx, base, size: s, v: hot ? 1 : i % 4 === 1 ? 0 : i % 4, ramp: hot ? acc : tone(S, garments[i % garments.length]), skin: tone(S, skins[i % 3]), q, phase: i * 1.3, arm: "down", seed: 1410 + i * 20, canopy: acc });
      const tq = ease(span(p, i * 0.1 + 0.3, i * 0.1 + 0.7));
      if (label) tag(g, S, c, { x: cx, y: base - s * (hot ? 1.2 : 1.08) - 54 * u + Math.sin(t * 2 + i) * 4 * u, text: label, size: (S.tall ? 40 : 44) * u, q: tq, color: hot ? acc[1] : TAGINK, seed: 40 + i * 3, maxW: (box.w / n) * 1.02 });
      if (hot && q > 0.7) {
        const hm = new Map();
        for (let k = 0; k < 12; k++) { const a = -t * 1.1 + (k / 12) * TAU; dab(hm, acc[(k % 3) + 2 > 4 ? 3 : (k % 3) + 2], cx + Math.cos(a) * s * 0.4, base - s * 0.58 + Math.sin(a) * s * 0.46, 5 * u, 3.4 * u, k & 15); }
        flush(g, hm, (1 - clamp(c.ex * 2)) * 0.9);
      }
    }
    // The dog trots along the front of the group and wraps around.
    const dq = ease(span(p, 0.4, 0.8)), dx = box.x - 120 * u + fract(t * 0.07 + 0.3) * (box.w + 240 * u);
    dog(g, S, c, dx, base + 0.06 * size, size * 0.26, tone(S, R.fur), dq);
    // A butterfly wanders over the group.
    const bx = box.x + box.w * (0.5 + 0.38 * Math.sin(t * 0.5)) , by = box.y + box.h * 0.36 + Math.sin(t * 1.3) * 40 * u + Math.sin(t * 3.1) * 8 * u, wing = 0.25 + 0.75 * Math.abs(Math.sin(t * 12));
    const bq = ease(span(p, 0.5, 0.8)), ws = 26 * u;
    [-1, 1].forEach((sd) => shape(g, c, { bb: bbOf(bx + sd * ws * 0.6, by, ws, ws), sd: uni(ell(bx + sd * ws * 0.7 * wing, by - ws * 0.3, ws * 0.8 * wing, ws * 0.7), ell(bx + sd * ws * 0.5 * wing, by + ws * 0.45, ws * 0.5 * wing, ws * 0.4)), ramp: sd < 0 ? acc : tone(S, R.violet), lum: 0.62, p: bq, seed: 1600 + sd, step: 3.4 * u }));
  }

  // Process: stepping spheres joined by a flowing stream with leaf-boats; each holds its number.
  function icon(g, kind, cx, cy, k, cols, u, q, alpha) {
    const P = { file: [[[-0.5, -0.65], [0.15, -0.65], [0.5, -0.3], [0.5, 0.65], [-0.5, 0.65], [-0.5, -0.65]], [[-0.28, 0], [0.28, 0]], [[-0.28, 0.28], [0.12, 0.28]]],
      spark: [[[0, -0.7], [0, 0.7]], [[-0.7, 0], [0.7, 0]], [[-0.38, -0.38], [0.38, 0.38]], [[-0.38, 0.38], [0.38, -0.38]]], check: [[[-0.55, 0.05], [-0.15, 0.45], [0.6, -0.45]]] }[kind];
    P.forEach((poly2, i) => dabLine(g, poly2.map(([x, y]) => [cx + x * k, cy + y * k]), { cols, rad: 3.4 * u, gap: 6.4 * u, q, seed: 1700 + i, alpha }));
  }
  function process(g, S, box, p, d, info) {
    const c = ctxOf(S, box, info), { u, t } = c, tall = S.tall, steps = (d.steps || []).slice(0, 4), n = Math.max(1, steps.length), acc = accRamp(S);
    const R0 = tall ? Math.min(box.w * 0.27, (box.h / n) * 0.34) : Math.min(box.h * 0.24, (box.w / n) * 0.3);
    const pts = steps.map((_, i) => tall ? { x: box.x + box.w * (0.3 + 0.4 * (i % 2)), y: box.y + box.h * ((i + 0.5) / n) } : { x: box.x + box.w * ((i + 0.5) / n), y: box.y + box.h * (0.46 + (i % 2 ? 0.07 : -0.07)) });
    const rampOf = (i) => (i === n - 1 ? acc : tone(S, [R.violet, R.green, R.orange][i % 3])), water = tone(S, R.trail), kinds = ["file", "spark", "check", "check"];
    // Stream between neighbours: dabs flowing along a curve, ripple bands running with the current.
    for (let i = 0; i < n - 1; i++) {
      const a = pts[i], b = pts[i + 1], sq = ease(span(p, 0.1 + i * 0.22, 0.5 + i * 0.22));
      const P0 = tall ? [a.x, a.y + R0 * 0.9] : [a.x + R0 * 0.9, a.y], P3 = tall ? [b.x, b.y - R0 * 0.9] : [b.x - R0 * 0.9, b.y];
      const P1 = tall ? [P0[0], lerp(P0[1], P3[1], 0.5)] : [lerp(P0[0], P3[0], 0.5), P0[1]], P2 = tall ? [P3[0], lerp(P0[1], P3[1], 0.5)] : [lerp(P0[0], P3[0], 0.5), P3[1]];
      const at = (s) => { const k = 1 - s; return [k * k * k * P0[0] + 3 * k * k * s * P1[0] + 3 * k * s * s * P2[0] + s * s * s * P3[0], k * k * k * P0[1] + 3 * k * k * s * P1[1] + 3 * k * s * s * P2[1] + s * s * s * P3[1]]; };
      const len = Math.hypot(P3[0] - P0[0], P3[1] - P0[1]) * 1.2, N = Math.floor(len / (4.4 * u)), map = new Map();
      for (let k = 0; k <= N; k++) {
        const s = k / N;
        if (s > sq) break;
        const [x, y] = at(s), [x2, y2] = at(Math.min(1, s + 0.01)), tx = x2 - x, ty = y2 - y, tl = Math.hypot(tx, ty) || 1, nx = -ty / tl, ny = tx / tl;
        for (let m = 0; m < 7; m++) {
          const h = hash(k, m, 1750 + i), h2 = hash(k, m, 1760 + i), off = (h - 0.5) * 2 * (42 * u) * (0.5 + 0.5 * Math.sin(s * Math.PI)) , lum = clamp(0.55 + 0.35 * Math.sin(s * len * 0.04 - t * 5 + h2 * 2) - Math.abs(off) / (80 * u));
          dab(map, water[pick(lum, h2, hash(k, m, 1770))], x + nx * off, y + ny * off, 5 * u, 3 * u, (Math.atan2(ty, tx) / Math.PI * 16 + 16 | 0) & 15);
        }
      }
      flush(g, map, 1 - clamp(c.ex * 2));
      for (let bI = 0; bI < 2; bI++) {
        const s = fract(t * 0.14 + i * 0.37 + bI * 0.5);
        if (s > sq - 0.04) continue;
        const [x, y] = at(s);
        shape(g, c, { bb: bbOf(x, y, 40 * u, 40 * u), sd: uni(ell(x, y + 6 * u, 22 * u, 7 * u), poly([[x - 2 * u, y - 36 * u], [x - 2 * u, y + 2 * u], [x + 22 * u, y + 2 * u]])), rampf: (xx, yy) => (yy < y + 1 * u ? tone(S, R.cream) : tone(S, R.orange)), lum: 0.7, seed: 1780 + i * 3 + bI, step: 3.2 * u });
      }
      if (sq > 0.97) { const e = at(1), pa = at(0.96), ang = Math.atan2(e[1] - pa[1], e[0] - pa[0]); [-0.5, 0.5].forEach((o2) => dabLine(g, [[e[0] - Math.cos(ang + o2) * 22 * u, e[1] - Math.sin(ang + o2) * 22 * u], e], { cols: [acc[1], acc[2]], rad: 3.6 * u, gap: 6 * u, seed: 1790 + i, alpha: 1 - clamp(c.ex * 2) })); }
    }
    steps.forEach((label, i) => {
      const { x, y0 } = { x: pts[i].x, y0: pts[i].y }, q = ease(span(p, i * 0.2, i * 0.2 + 0.45)), bobY = y0 + Math.sin(t * 1.4 + i * 1.6) * 7 * u, rr = R0 * (0.94 + 0.04 * Math.sin(t * 2 + i));
      shape(g, c, { bb: bbOf(x + 20 * u, bobY + rr + 20 * u, rr * 1.2, 30 * u), sd: ell(x + 24 * u, y0 + rr + 22 * u, rr * 0.9, 18 * u), ramp: tone(S, R.cast), lum: 0.4, p: q, keep: () => 0.8, seed: 1800 + i });
      shape(g, c, { bb: bbOf(x, bobY, rr + 8 * u, rr + 8 * u), sd: circ(x, bobY, rr), ramp: rampOf(i), lum: sphere(x, bobY, rr), p: q, birth: (xx, yy) => clamp(Math.hypot(xx - x, yy - bobY) / rr), seed: 1810 + i, step: 6.4 * u });
      const orb = new Map();
      for (let k = 0; k < 12; k++) { const a = t * (0.7 + 0.1 * i) + (k / 12) * TAU, rad = rr * 1.2 + 6 * u * Math.sin(t * 2 + k); dab(orb, rampOf(i)[k % 2 ? 3 : 4], x + Math.cos(a) * rad, bobY + Math.sin(a) * rad, 5 * u, 3.4 * u, k & 15); }
      flush(g, orb, q * (1 - clamp(c.ex * 2)));
      figure(g, S, c, String(i + 1).padStart(2, "0"), x, bobY, Math.max(96 * u, rr * 0.8), { a: ease(span(q, 0.5, 1)), maxW: rr * 1.5, min: 60 * u });
      const ex2 = x + rr * 0.8, ey2 = bobY - rr * 0.82, er = rr * 0.34;
      shape(g, c, { bb: bbOf(ex2, ey2, er + 6 * u, er + 6 * u), sd: circ(ex2, ey2, er), ramp: tone(S, R.cream), lum: 0.8, p: ease(span(q, 0.4, 1)), seed: 1820 + i, step: 4.4 * u });
      icon(g, kinds[Math.min(i, 3)], ex2, ey2, er * 0.6, [cv(S, TAGINK), acc[2]], u, ease(span(q, 0.6, 1)), 1 - clamp(c.ex * 2));
      tag(g, S, c, { x, y: y0 + R0 + 66 * u, text: label, size: (tall ? 40 : 46) * u, q: ease(span(p, i * 0.2 + 0.2, i * 0.2 + 0.55)), seed: 50 + i * 5, maxW: tall ? box.w * 0.6 : (box.w / n) * 0.98 });
    });
  }

  // Compare: a cool moon and a warm sun, sized by their values, joined by a flowing change.
  function compare(g, S, box, p, d, info) {
    const c = ctxOf(S, box, info), { u, t } = c, tall = S.tall, acc = accRamp(S);
    const lv = Math.max(0, Number(d.leftValue) || 0), rv = Math.max(0, Number(d.rightValue) || 0), mxv = Math.max(lv, rv, 1);
    const Rmax = tall ? Math.min(box.w * 0.3, box.h * 0.19) : Math.min(box.h * 0.36, box.w * 0.19);
    const radius = (v) => Rmax * lerp(0.42, 1, Math.sqrt(v / mxv));
    const items = [{ v: lv, label: d.left, ramp: tone(S, R.violet), hot: false, x: tall ? box.x + box.w * 0.5 : box.x + box.w * 0.27, y: tall ? box.y + box.h * 0.26 : box.y + box.h * 0.56 },
      { v: rv, label: d.right, ramp: acc, hot: true, x: tall ? box.x + box.w * 0.5 : box.x + box.w * 0.73, y: tall ? box.y + box.h * 0.75 : box.y + box.h * 0.56 }];
    const centers = items.map((it, i) => { const q = ease(span(p, i * 0.22, i * 0.22 + 0.5)); return { ...it, r: radius(it.v) * (0.96 + 0.04 * Math.sin(t * 1.8 + i * 2)), q, by: it.y + Math.sin(t * 1.3 + i * 2.2) * 9 * u }; });
    // The flow between them.
    const [A, B] = centers, fq = ease(span(p, 0.45, 0.85));
    const a0 = tall ? [A.x, A.by + A.r * 1.05] : [A.x + A.r * 1.05, A.by], b0 = tall ? [B.x, B.by - B.r * 1.05] : [B.x - B.r * 1.05, B.by];
    const mid = tall ? [A.x + 130 * u, (a0[1] + b0[1]) / 2] : [(a0[0] + b0[0]) / 2, A.by - 120 * u];
    dabLine(g, [a0, mid, b0], { cols: [acc[2], acc[3], cv(S, "#2f84dc"), cv(S, "#fff08a")], rad: 4.6 * u, gap: 10 * u, q: fq, march: t * 40 * u, seed: 1900, alpha: 1 - clamp(c.ex * 2) });
    centers.forEach((it, i) => {
      const { x, by, r, q, ramp, hot } = it;
      shape(g, c, { bb: bbOf(x + 30 * u, by + r + 20 * u, r * 1.1, 34 * u), sd: ell(x + 26 * u, it.y + r + 26 * u, r * 0.85, 20 * u), ramp: tone(S, R.cast), lum: 0.4, p: q, keep: () => 0.8, seed: 1910 + i });
      if (hot) for (let k = 0; k < 18; k++) { const a = (k / 18) * TAU + t * 0.25, l0 = r * 1.14, l1 = r * (1.34 + 0.12 * Math.sin(t * 2.2 + k * 1.7)); dabLine(g, [[x + Math.cos(a) * l0, by + Math.sin(a) * l0], [x + Math.cos(a) * l1, by + Math.sin(a) * l1]], { cols: [acc[3], acc[2], cv(S, "#fff08a")], rad: 4.4 * u, gap: 8 * u, q: q, seed: 1920 + k, alpha: 1 - clamp(c.ex * 2) }); }
      shape(g, c, { bb: bbOf(x, by, r + 8 * u, r + 8 * u), sd: circ(x, by, r), ramp, lum: sphere(x, by, r), p: q, birth: (xx, yy) => clamp(Math.hypot(xx - x, yy - by) / r), seed: 1930 + i, step: 7 * u });
      if (!hot) [[-0.3, -0.25, 0.14], [0.25, 0.1, 0.2], [-0.15, 0.4, 0.1]].forEach(([cx2, cy2, cr], k) => shape(g, c, { bb: bbOf(x + cx2 * r, by + cy2 * r, cr * r + 4 * u, cr * r + 4 * u), sd: circ(x + cx2 * r, by + cy2 * r, cr * r), ramp: tone(S, R.violet), lum: 0.3 + 0.1 * k, p: ease(span(q, 0.5, 1)), seed: 1940 + k, step: 4.6 * u }));
      const orb = new Map();
      for (let k = 0; k < 10; k++) { const a = t * (hot ? 0.9 : -0.6) + (k / 10) * TAU, rad = r * 1.5 + 8 * u * Math.sin(t * 2 + k); dab(orb, ramp[k % 2 ? 3 : 4], x + Math.cos(a) * rad * (hot ? 1 : 1.05), by + Math.sin(a) * rad * 0.7, 5 * u, 3.4 * u, k & 15); }
      flush(orb.size ? g : g, orb, q * 0.9 * (1 - clamp(c.ex * 2)));
      figure(g, S, c, tally(it.v, ease(span(p, i * 0.22 + 0.2, i * 0.22 + 0.8)), d), x, by + r * 0.05, Math.min(150 * u, r * 0.85), { a: ease(span(q, 0.4, 1)), maxW: r * 1.6, min: 96 * u });
      tag(g, S, c, { x, y: tall ? by - r - 52 * u : by - r - 60 * u, text: it.label || "", size: (tall ? 42 : 46) * u, q: ease(span(p, i * 0.22 + 0.15, i * 0.22 + 0.5)), seed: 60 + i * 4, color: hot ? acc[1] : TAGINK, maxW: tall ? box.w : box.w * 0.46 });
    });
    if (lv > 0) {
      const pct = Math.round(((rv - lv) / lv) * 100), txt = (pct > 0 ? "+" : pct < 0 ? "−" : "") + Math.abs(pct) + "%";
      tag(g, S, c, { x: tall ? box.x + box.w * 0.78 : mid[0], y: tall ? (A.by + B.by) / 2 : mid[1] - 8 * u + Math.sin(t * 1.6) * 5 * u, text: txt, size: 96 * u, font: SERIF, q: ease(span(p, 0.6, 0.95)), color: acc[1], ramp: tone(S, R.pink), seed: 80 });
    }
  }

  // ---- tokens ---------------------------------------------------------------------------------------------------
  const weave = {};
  function weaveOf(ctx, u) {
    const key = Math.round(u * 100);
    if (weave[key]) return weave[key];
    const size = Math.max(64, Math.round(240 * u)), c = mkCanvas(size, size), g = c.getContext("2d"), cell = Math.max(3, 6 * u);
    g.lineWidth = Math.max(1, 1.5 * u);
    for (let y = 0; y < size; y += cell) { g.strokeStyle = "rgba(60,40,90,0.09)"; g.beginPath(); g.moveTo(0, y); g.lineTo(size, y); g.stroke(); g.strokeStyle = "rgba(255,250,235,0.12)"; g.beginPath(); g.moveTo(0, y + cell / 2); g.lineTo(size, y + cell / 2); g.stroke(); }
    for (let x = 0; x < size; x += cell) { g.strokeStyle = "rgba(60,40,90,0.06)"; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, size); g.stroke(); g.strokeStyle = "rgba(255,250,235,0.09)"; g.beginPath(); g.moveTo(x + cell / 2, 0); g.lineTo(x + cell / 2, size); g.stroke(); }
    const r = rng(77);
    for (let k = 0; k < 90; k++) { const x = r() * size, y = r() * size, l = (14 + r() * 40) * u; g.strokeStyle = r() < 0.5 ? "rgba(70,50,100,0.16)" : "rgba(255,250,235,0.28)"; g.lineWidth = Math.max(1, (1 + r() * 1.4) * u); g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (r() - 0.5) * 3 * u); g.stroke(); }
    return (weave[key] = ctx.createPattern(c, "repeat"));
  }
  const halo = (c) => () => `0 0 3px ${c}, 0 0 14px ${c}, 0 0 28px ${c}`;
  const BASE = {
    name: "original", bg: "#f4ecd6", panel: "rgba(247,239,217,0.9)", ink: "#2a2150", muted: "#5a4f86", accent: "#e2452a", onAccent: "#fffaf0",
    rule: "rgba(42,33,80,0.7)", track: "rgba(42,33,80,0.12)",
  };
  return {
    ...BASE,
    display: SERIF, displayWeight: 700, displayTracking: "0.005em", body: SANS, bodyWeight: 600, figures: SERIF, radius: 18,
    motion: "focus", change: "frost", kit: { line: 3, fill: "solid", panel: "fill" },
    panelEdge: "rgba(42,33,80,0.4)", keepArt: true, overlap: true, paintOver: true,
    palettes: {
      // Daylight is the look as drawn. Night repaints the world in moon-lit indigo; mono keeps the dab structure in greys.
      light: { name: "light" },
      dark: { name: "dark", night: true, bg: "#171233", ink: "#f6efd8", muted: "#c8bcee", accent: "#f4793a", onAccent: "#171233", rule: "rgba(246,239,216,0.7)", track: "rgba(246,239,216,0.12)", textShadow: halo("rgba(23,18,51,0.9)"), panel: "rgba(30,24,70,0.9)" },
      mono: { name: "mono", mono: true, bg: "#eeeae0", ink: "#26262a", muted: "#6a6a70", accent: "#2b2b30", onAccent: "#eeeae0", rule: "rgba(38,38,42,0.7)", track: "rgba(38,38,42,0.12)", textShadow: halo("rgba(247,243,232,0.9)") },
    },
    textShadow: halo("rgba(250,244,226,0.95)"),
    css() {
      return `.display{text-wrap:balance;}.kicker{font-family:${SANS};font-weight:700;letter-spacing:0.16em;}`;
    },
    backdrop: (accent, texture, look) => look.bg,
    // The canvas weave lies over everything, text included; texture scales its strength.
    paint(ctx, W, H) {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = weaveOf(ctx, Math.min(W, H) / 1080);
      ctx.fillRect(0, 0, W, H);
    },
    stage(ctx, S, info) {
      if (!S.paint) return;
      const L = buildLayers(S), G = L.G, { W, H } = S, t = info.t, tex = S.look.texture;
      const cam = clamp(t / Math.max(1, info.length)), warm = smooth(span(cam, 0.55, 0.95)), pan = (f) => (cam - 0.5) * 0.4 * W * f;
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.fillStyle = S.look.bg;
      ctx.fillRect(0, 0, W, H);
      const sun = sunAndSky(ctx, S, L, t, cam, warm, pan, info);
      ctx.drawImage(L.far, -G.M - pan(0.5), 0);
      lighthouseBeam(ctx, S, L, t, warm, pan);
      sea(ctx, S, L, t, warm, sun.sx, pan);
      ctx.drawImage(L.ground, -G.M - pan(1), 0);
      shoreLife(ctx, S, L, t, pan);
      hero(ctx, S, L, info, t, warm);
      motes(ctx, S, t, Math.max(0.25, tex));
      gust(ctx, S, info);
      patch(ctx, S, info);
      ctx.drawImage(L.frame, 0, 0);
      ctx.restore();
    },
    scenes: { chart, object, people, process, compare },
  };
});
