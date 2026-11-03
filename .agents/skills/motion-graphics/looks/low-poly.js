// Low Poly: a faceted archipelago at golden hour. Every surface is a flat-shaded triangle: a
// triangulated sky, a sea whose facets roll and glint, rocky islets, drifting gulls and leaping fish.
// A real (tiny) 3D renderer sits underneath: a camera sweeps from island to island, each scene is
// built from faceted solids that assemble out of loose triangles and shatter back out, and every
// label is a chamfered flat tag pinned to a point in the world. Original shapes throughout.
// Frames are pure functions of time: seeded integer hashes only, no clocks.
window.DreamcutMotion.register("low-poly", ({ grain, rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const c1 = 1.7; return 1 + (c1 + 1) * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const fract = (v) => v - Math.floor(v);
  function hash(i, j = 0, k = 0) {
    let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(k | 0, 1274126177)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  const rgbMemo = new Map();
  function rgb(c) {
    if (Array.isArray(c)) return c;
    let v = rgbMemo.get(c);
    if (!v) {
      const s = String(c).trim();
      const m = s.match(/rgba?\(([^)]+)\)/);
      if (m) v = m[1].split(",").slice(0, 3).map(Number);
      else {
        let h = s.replace("#", "");
        if (h.length === 3) h = h.replace(/./g, "$&$&");
        const n = parseInt(h.slice(0, 6), 16) || 0;
        v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      }
      rgbMemo.set(c, v);
    }
    return v;
  }
  const mixc = (a, b, k) => { a = rgb(a); b = rgb(b); return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]; };
  const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : v) | 0;
  const css = (c, al) => (al == null || al >= 1 ? `rgb(${cl(c[0])},${cl(c[1])},${cl(c[2])})` : `rgba(${cl(c[0])},${cl(c[1])},${cl(c[2])},${al < 0 ? 0 : al.toFixed(3)})`);
  const stops = (list, v) => {
    const n = list.length - 1, x = clamp(v) * n, i = Math.min(n - 1, Math.floor(x));
    return mixc(list[i], list[i + 1], x - i);
  };

  const FONT = "'Futura', 'Avenir Next', 'Trebuchet MS', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  const DEF_HOLD = { title: 2.4, chart: 3.4, object: 3.6, people: 3.2, process: 3.6, compare: 3.2, closing: 2.4 };
  const SLOT_Z = { title: 0, chart: 5, object: -2, people: 6, process: 0, compare: 5, closing: -2 };
  // Islands are laid out in the order the scenes actually play, so every camera move is one short hop.
  const SLOT = {};
  let SLOT_KEY = null;
  function fillSlots() {
    const pl = plan(), key = pl.map((e) => e.id).join();
    if (key === SLOT_KEY) return;
    SLOT_KEY = key; WORLD = null;
    const ids = pl.map((e) => e.id).concat(ORDER.filter((id) => !pl.some((e) => e.id === id)));
    ids.forEach((id, k) => { SLOT[id] = [k * 30, SLOT_Z[id]]; });
  }

  // ---- world palettes ------------------------------------------------------------------------------------
  const WORLD_DUSK = {
    sky: ["#1b2166", "#6a48a8", "#ee7b8c", "#ffc79c"], sun: "#fff1cc", sunGlow: "#ffae78", fog: "#e8a3a6",
    seaShallow: "#34c2b4", seaDeep: "#18467f", moss: "#2f9d86", mossHi: "#86d6a2", sand: "#f6d4a2", rock: "#6c59a3", rockDark: "#3e3577",
    snow: "#fff5ee", cyan: "#5fe3ff", wood: "#8c5a4c", ink: "#241c52", teal2: "#3fb7d4",
    shadow: [0.4, 0.42, 0.72], lit: [1.13, 1.03, 0.93], sunc: [255, 188, 130], stars: 0.6,
    cloud: ["#ffdcd2", "#b98cc2"], tagBg: "#fff4e6", tagInk: "#241c52", tagDark: "#1d1852",
    skin: ["#f2bb92", "#d98d6b", "#9c6049", "#f7d6b8"], cloth: ["#5a6bff", "#ff7a59", "#22b5a0", "#b45cd8", "#ffc948", "#4cb4ff"],
  };
  const WORLD_DAY = {
    sky: ["#62b2ee", "#9fd6f5", "#ffe6c6", "#fff6e2"], sun: "#fffbe0", sunGlow: "#fff0a8", fog: "#dcf0f2",
    seaShallow: "#46d4c8", seaDeep: "#2d86c6", moss: "#58c488", mossHi: "#a9e89e", sand: "#fbe4b6", rock: "#8d92c4", rockDark: "#5d6498",
    snow: "#ffffff", cyan: "#3fd0ff", wood: "#a2705a", ink: "#17265a", teal2: "#3fb7d4",
    shadow: [0.55, 0.62, 0.86], lit: [1.08, 1.04, 0.97], sunc: [255, 232, 170], stars: 0,
    cloud: ["#ffffff", "#cfe3f4"], tagBg: "#ffffff", tagInk: "#17265a", tagDark: "#2a3f86",
    skin: ["#f2bb92", "#d98d6b", "#9c6049", "#f7d6b8"], cloth: ["#4f62f0", "#ff7a59", "#1fae98", "#b45cd8", "#f7b82d", "#3fa8f5"],
  };
  const WORLD_NIGHT = {
    sky: ["#04061b", "#0e1749", "#2b2c80", "#5057a8"], sun: "#eef4ff", sunGlow: "#7a90ff", fog: "#272f70",
    seaShallow: "#1c93a2", seaDeep: "#0a2352", moss: "#1f7c78", mossHi: "#4ec9b2", sand: "#9ba8d2", rock: "#3d4290", rockDark: "#22275f",
    snow: "#dfe8ff", cyan: "#62e6ff", wood: "#5b4a78", ink: "#e9f0ff", teal2: "#37b0d0",
    shadow: [0.3, 0.38, 0.72], lit: [0.86, 0.96, 1.16], sunc: [140, 170, 255], stars: 1,
    cloud: ["#7078cc", "#31397f"], tagBg: "#1b2058", tagInk: "#eaf0ff", tagDark: "#0f1340",
    skin: ["#e9b08f", "#c98667", "#8d5a47", "#efcdb3"], cloth: ["#6a7bff", "#ff7f66", "#2cc6ae", "#c071e6", "#ffd45a", "#58bcff"],
  };
  const WORLD_MONO = {
    sky: ["#17171b", "#34343c", "#6e6e78", "#b4b4bf"], sun: "#ffffff", sunGlow: "#d8d8e4", fog: "#9a9aa6",
    seaShallow: "#a9a9b4", seaDeep: "#34343e", moss: "#80808a", mossHi: "#b6b6c0", sand: "#d8d8de", rock: "#5e5e68", rockDark: "#34343c",
    snow: "#ffffff", cyan: "#f2f2f8", wood: "#6a6a72", ink: "#f3f3f7", teal2: "#9a9aa6",
    shadow: [0.5, 0.5, 0.58], lit: [1.1, 1.08, 1.04], sunc: [235, 235, 245], stars: 0.5,
    cloud: ["#e4e4ec", "#8a8a96"], tagBg: "#f0f0f4", tagInk: "#22222a", tagDark: "#22222a",
    skin: ["#cfcfd6", "#aeaeb7", "#8a8a93", "#e1e1e7"], cloth: ["#5e5e68", "#8a8a93", "#b4b4be", "#48484f", "#d2d2da", "#74747e"],
  };

  // ---- theme per frame (cached on the look object) ---------------------------------------------------------
  const THEMES = new WeakMap();
  function theme(S) {
    const cached = THEMES.get(S.look);
    if (cached && cached.accentKey === S.accent) return cached;
    const w = S.look.world, acc = rgb(S.accent);
    const mats = [
      rgb(w.moss), rgb(w.mossHi), rgb(w.sand), rgb(w.rock), rgb(w.rockDark), acc, rgb(w.snow), rgb(w.cyan), rgb(w.wood), rgb(w.ink), rgb(w.teal2),
    ];
    const th = {
      accentKey: S.accent, w, acc, mats, u: S.u, tex: S.look.texture ?? 1,
      fog: rgb(w.fog), fogNear: 42, fogFar: 135, fogMax: 0.82,
      shadow: w.shadow, lit: w.lit, sunc: w.sunc,
      night: lum(rgb(w.sky[0])) < 60,
      accHi: mixc(acc, [255, 255, 255], 0.42), accLo: mixc(acc, [30, 20, 70], 0.4),
    };
    THEMES.set(S.look, th);
    return th;
  }
  function lum(c) { return c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11; }

  // ---- projection, camera ------------------------------------------------------------------------------------
  let CAM = null, TH = null, SS = null, QU = [], FQ = [], INFO = { scene: null, local: 0 };
  let PX = 0, PY = 0, PZ = 0;
  const LV = (() => { const l = [-0.45, 0.76, -0.5]; const n = Math.hypot(...l); return l.map((v) => v / n); })();
  const SUN = (() => { const l = [0.36, 0.035, 1]; const n = Math.hypot(...l); return l.map((v) => v / n); })();

  function P(x, y, z) {
    const dx = x - CAM.px, dy = y - CAM.py, dz = z - CAM.pz;
    const zc = dx * CAM.fx + dy * CAM.fy + dz * CAM.fz;
    PZ = zc;
    if (zc < 0.6) return false;
    const k = CAM.f / zc;
    PX = CAM.cx + (dx * CAM.rx + dz * CAM.rz) * k;
    PY = CAM.cy - (dx * CAM.ux + dy * CAM.uy + dz * CAM.uz) * k;
    return true;
  }
  function scr(x, y, z) { return P(x, y, z) ? [PX, PY, PZ] : null; }
  function makeCam(S, c) {
    const cp = Math.cos(c.theta), sp = Math.sin(c.theta), cs = Math.cos(c.psi), ss = Math.sin(c.psi);
    const fx = ss * cp, fy = -sp, fz = cs * cp;
    const n = Math.hypot(fz, fx) || 1;
    const rx = fz / n, rz = -fx / n;
    const cam = {
      ...c, fx, fy, fz, rx, rz, ux: fy * rz, uy: fz * rx - fx * rz, uz: -fy * rx,
      px: c.tx - fx * c.D, py: c.ty - fy * c.D, pz: c.tz - fz * c.D, f: c.ppu * c.D, hz: 0,
    };
    CAM = cam;
    cam.hz = P(cam.px + ss * 6000, 0, cam.pz + cs * 6000) ? PY : c.cy - cam.f * Math.tan(c.theta);
    return cam;
  }

  // ---- lighting -------------------------------------------------------------------------------------------------
  function litCol(base, nx, ny, nz, zc, emit, glow, mul) {
    const lam = Math.max(0, nx * LV[0] + ny * LV[1] + nz * LV[2]);
    const t = clamp(lam * 0.82 + (ny * 0.5 + 0.5) * 0.2);
    const rim = Math.max(0, nx * SUN[0] + ny * SUN[1] + nz * SUN[2]);
    const r2 = rim * rim * 0.34, sh = TH.shadow, li = TH.lit, sc = TH.sunc, m = mul == null ? 1 : mul;
    let r = base[0] * m * (sh[0] + (li[0] - sh[0]) * t) + sc[0] * r2 * 0.5;
    let g = base[1] * m * (sh[1] + (li[1] - sh[1]) * t) + sc[1] * r2 * 0.5;
    let b = base[2] * m * (sh[2] + (li[2] - sh[2]) * t) + sc[2] * r2 * 0.5;
    if (emit) { const e = glow || [255, 244, 220]; r += (e[0] - r) * emit; g += (e[1] - g) * emit; b += (e[2] - b) * emit; }
    const fg = TH.fogMax * Math.pow(clamp((zc - TH.fogNear) / (TH.fogFar - TH.fogNear)), 1.15), f = TH.fog;
    return `rgb(${cl(r + (f[0] - r) * fg)},${cl(g + (f[1] - g) * fg)},${cl(b + (f[2] - b) * fg)})`;
  }

  // ---- triangle queue -------------------------------------------------------------------------------------------
  function qtri(list, x0, y0, x1, y1, x2, y2, z, c) {
    const W = SS.W, H = SS.H, m = 60;
    if ((x0 < -m && x1 < -m && x2 < -m) || (x0 > W + m && x1 > W + m && x2 > W + m) || (y0 < -m && y1 < -m && y2 < -m) || (y0 > H + m && y1 > H + m && y2 > H + m)) return;
    list.push({ x0, y0, x1, y1, x2, y2, z, c });
  }
  function fillTri(ctx, x0, y0, x1, y1, x2, y2, c, ex) {
    const cx = (x0 + x1 + x2) / 3, cy = (y0 + y1 + y2) / 3;
    const area = Math.abs((x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0));
    if (area < 0.4) return;
    let a = x0 - cx, b = y0 - cy, d = Math.hypot(a, b) || 1;
    const ax = x0 + (a / d) * ex, ay = y0 + (b / d) * ex;
    a = x1 - cx; b = y1 - cy; d = Math.hypot(a, b) || 1;
    const bx = x1 + (a / d) * ex, by = y1 + (b / d) * ex;
    a = x2 - cx; b = y2 - cy; d = Math.hypot(a, b) || 1;
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(x2 + (a / d) * ex, y2 + (b / d) * ex); ctx.closePath(); ctx.fill();
  }
  const byDepth = (a, b) => b.z - a.z;
  function flush(ctx, list) {
    list.sort(byDepth);
    const ex = 0.55 * SS.u;
    for (const t of list) fillTri(ctx, t.x0, t.y0, t.x1, t.y1, t.x2, t.y2, t.c, ex);
    list.length = 0;
  }
  // A raw world triangle with a ready colour (rings, beams, wings).
  function wtri(list, a, b, c, col, bias = 0) {
    if (!P(a[0], a[1], a[2])) return; const x0 = PX, y0 = PY, z0 = PZ;
    if (!P(b[0], b[1], b[2])) return; const x1 = PX, y1 = PY, z1 = PZ;
    if (!P(c[0], c[1], c[2])) return;
    qtri(list, x0, y0, x1, y1, PX, PY, (z0 + z1 + PZ) / 3 + bias, col);
  }

  // ---- mesh builders ------------------------------------------------------------------------------------------
  // Faces are [a, b, c, mat, shade]. mat: index into the theme's materials, or -1/-2/-3 for the colours given at placement.
  function prism(n, rb, rt, h, top, side, rot = 0) {
    const v = [], f = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU + rot; v.push([Math.cos(a) * rb, 0, Math.sin(a) * rb]); }
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU + rot; v.push([Math.cos(a) * rt, h, Math.sin(a) * rt]); }
    v.push([0, h, 0], [0, 0, 0]);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, s = 0.9 + (i % 3) * 0.08;
      f.push([i, j, n + j, side, s], [i, n + j, n + i, side, s]);
      f.push([n + i, n + j, 2 * n, top, 1]);
      f.push([j, i, 2 * n + 1, side, 0.8]);
    }
    return { v, f, cy: h / 2 };
  }
  function box(w, h, d, mat, centered = false) {
    const x = w / 2, z = d / 2, y0 = centered ? -h / 2 : 0, y1 = y0 + h;
    const v = [[-x, y0, -z], [x, y0, -z], [x, y0, z], [-x, y0, z], [-x, y1, -z], [x, y1, -z], [x, y1, z], [-x, y1, z]];
    const q = [[0, 1, 5, 4, 0.95], [1, 2, 6, 5, 0.85], [2, 3, 7, 6, 0.75], [3, 0, 4, 7, 0.88], [4, 5, 6, 7, 1.08], [3, 2, 1, 0, 0.7]];
    const f = [];
    for (const [a, b, c, d2, s] of q) { const m = Array.isArray(mat) ? mat[f.length >> 1] ?? mat[0] : mat; f.push([a, b, c, m, s], [a, c, d2, m, s]); }
    return { v, f, cy: centered ? 0 : h / 2 };
  }
  function bipyramid(n, r, ht, hb, mat, rot = 0) {
    const v = [], f = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU + rot; v.push([Math.cos(a) * r, 0, Math.sin(a) * r]); }
    v.push([0, ht, 0], [0, -hb, 0]);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, s = 0.86 + (i % 2) * 0.2;
      f.push([i, j, n, mat, s], [j, i, n + 1, mat, s * 0.92]);
    }
    return { v, f, cy: (ht - hb) / 2 };
  }
  function octa(r, sub, seed, mats, jit = 0.1) {
    let v = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    let tris = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]];
    for (let s = 0; s < sub; s++) {
      const cache = new Map(), next = [];
      const mid = (a, b) => {
        const key = a < b ? a * 1000 + b : b * 1000 + a;
        if (cache.has(key)) return cache.get(key);
        const m = [(v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, (v[a][2] + v[b][2]) / 2], l = Math.hypot(...m);
        v.push([m[0] / l, m[1] / l, m[2] / l]); cache.set(key, v.length - 1); return v.length - 1;
      };
      for (const [a, b, c] of tris) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
      tris = next;
    }
    v = v.map((p, i) => { const k = r * (1 + (hash(i, seed, 3) - 0.5) * jit * 2); return [p[0] * k, p[1] * k, p[2] * k]; });
    const f = tris.map(([a, b, c], i) => [a, b, c, Array.isArray(mats) ? mats[Math.floor(hash(i, seed, 9) * mats.length)] : mats, 0.9 + hash(i, seed, 5) * 0.22]);
    return { v, f, cy: 0 };
  }

  // ---- placing meshes into a queue ----------------------------------------------------------------------------
  let TV = [];
  // o: yaw, rx, rz, sc|sx|sy|sz, build 0..1, seed, spread, emit, glow, mul, mat/mat2/mat3, bias, list
  function put(m, X, Y, Z, o = {}) {
    const list = o.list || QU;
    const b = o.build == null ? 1 : o.build;
    if (b <= 0.002) return;
    const sx = o.sx ?? o.sc ?? 1, sy = o.sy ?? o.sc ?? 1, sz = o.sz ?? o.sc ?? 1;
    const yaw = o.yaw || 0, rx = o.rx || 0, rz = o.rz || 0;
    const cy_ = Math.cos(yaw), sy_ = Math.sin(yaw), cx_ = Math.cos(rx), sx_ = Math.sin(rx), cz_ = Math.cos(rz), sz_ = Math.sin(rz);
    const n = m.v.length;
    if (TV.length < (n + 1) * 3) TV = new Array((n + 1) * 3);
    const xf = (x, y, z, k) => {
      x *= sx; y *= sy; z *= sz;
      const x1 = x * cz_ - y * sz_, y1 = x * sz_ + y * cz_;
      const y2 = y1 * cx_ - z * sx_, z2 = y1 * sx_ + z * cx_;
      TV[k] = x1 * cy_ + z2 * sy_ + X; TV[k + 1] = y2 + Y; TV[k + 2] = -x1 * sy_ + z2 * cy_ + Z;
    };
    for (let i = 0; i < n; i++) xf(m.v[i][0], m.v[i][1], m.v[i][2], i * 3);
    const cenK = n * 3;
    xf(0, m.cy || 0, 0, cenK);
    const cX = TV[cenK], cY = TV[cenK + 1], cZ = TV[cenK + 2];
    const open = m.open, both = m.both;
    const bias = (m.bias || 0) + (o.bias || 0);
    const seed = o.seed | 0, spread = o.spread ?? 5, mulAll = o.mul == null ? 1 : o.mul;
    const mats = TH.mats;
    for (let fi = 0; fi < m.f.length; fi++) {
      const fc = m.f[fi];
      const ia = fc[0] * 3, ib = fc[1] * 3, ic = fc[2] * 3;
      let ax = TV[ia], ay = TV[ia + 1], az = TV[ia + 2], bx = TV[ib], by = TV[ib + 1], bz = TV[ib + 2], cx = TV[ic], cy = TV[ic + 1], cz = TV[ic + 2];
      let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay), ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-9) continue;
      nx /= nl; ny /= nl; nz /= nl;
      const mx = (ax + bx + cx) / 3, my = (ay + by + cy) / 3, mz = (az + bz + cz) / 3;
      if (open) {
        if (both) { if (nx * (CAM.px - mx) + ny * (CAM.py - my) + nz * (CAM.pz - mz) < 0) { nx = -nx; ny = -ny; nz = -nz; } }
        else if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      } else {
        if (nx * (mx - cX) + ny * (my - cY) + nz * (mz - cZ) < 0) { nx = -nx; ny = -ny; nz = -nz; }
        if (nx * (CAM.px - mx) + ny * (CAM.py - my) + nz * (CAM.pz - mz) <= 0) continue;
      }
      if (b < 1) {
        const k = eo((b - hash(fi, seed, 7) * 0.5) / 0.5);
        if (k <= 0.02) continue;
        const q = (1 - k) * (1 - k) * spread;
        const ox = (hash(fi, seed, 2) - 0.5) * q * 1.6, oy = (hash(fi, seed, 4) * 0.8 + 0.1) * q, oz = (hash(fi, seed, 6) - 0.5) * q * 1.6;
        ax = mx + (ax - mx) * k + ox; ay = my + (ay - my) * k + oy; az = mz + (az - mz) * k + oz;
        bx = mx + (bx - mx) * k + ox; by = my + (by - my) * k + oy; bz = mz + (bz - mz) * k + oz;
        cx = mx + (cx - mx) * k + ox; cy = my + (cy - my) * k + oy; cz = mz + (cz - mz) * k + oz;
      }
      if (!P(ax, ay, az)) continue; const x0 = PX, y0 = PY, z0 = PZ;
      if (!P(bx, by, bz)) continue; const x1 = PX, y1 = PY, z1 = PZ;
      if (!P(cx, cy, cz)) continue;
      const zc = (z0 + z1 + PZ) / 3;
      const mat = fc[3];
      const base = mat >= 0 ? mats[mat] : mat === -1 ? o.mat : mat === -2 ? o.mat2 || o.mat : o.mat3 || o.mat;
      qtri(list, x0, y0, x1, y1, PX, PY, zc + bias, litCol(base, nx, ny, nz, zc, (fc[5] || 0) + (o.emit || 0), o.glow, (fc[4] || 1) * mulAll));
    }
  }
  function rotXZ(yaw, lx, lz) { const c = Math.cos(yaw), s = Math.sin(yaw); return [lx * c + lz * s, -lx * s + lz * c]; }

  // ---- terrain: sea, islands, ridge -----------------------------------------------------------------------------
  function wave(x, z, t) {
    return 0.27 * Math.sin(x * 0.31 + t * 1.05 + Math.sin(z * 0.21)) + 0.21 * Math.sin(z * 0.41 - t * 0.82 + x * 0.13) + 0.1 * Math.sin((x + z) * 0.8 + t * 1.9);
  }
  const PROTO = {};
  function island(seed, R, H, PH, kind) {
    const N = 12, F = [0, 0.3, 0.52, 0.74, 0.9, 1.0];
    const rows = [[[0, PH, 0]]];
    for (let k = 1; k < F.length; k++) {
      const row = [];
      for (let j = 0; j < N; j++) {
        const a = ((j + (hash(j, k, seed) - 0.5) * 0.55) / N) * TAU;
        const rr = R * F[k] * (1 + (k >= 2 ? (hash(j, k, seed + 5) - 0.5) * 0.28 : 0.04 * (hash(j, k, seed) - 0.5)));
        const bk = Math.pow(Math.max(0, Math.sin(a)), 2), nz = hash(j, k, seed + 9);
        let y;
        if (k <= 2) y = PH + (k === 2 ? (nz - 0.5) * 0.1 : 0);
        else if (k === 3) y = PH * 0.78 + (nz - 0.3) * 0.7 + H * bk * 0.7;
        else if (k === 4) y = PH * 0.3 + (nz - 0.5) * 0.5 + H * bk * 0.35;
        else y = -0.2 + (nz - 0.5) * 0.2;
        row.push([Math.cos(a) * rr, y, Math.sin(a) * rr]);
      }
      rows.push(row);
    }
    const v = [rows[0][0]];
    for (let k = 1; k < rows.length; k++) for (let j = 0; j < N; j++) v.push(rows[k][j]);
    const idx = (k, j) => (k === 0 ? 0 : 1 + (k - 1) * N + (((j % N) + N) % N));
    const f = [];
    const stack = kind === "stack";
    for (let j = 0; j < N; j++) f.push([0, idx(1, j), idx(1, j + 1), stack ? 3 : 0, 0.94 + hash(j, 1, seed) * 0.16]);
    for (let k = 1; k < rows.length - 1; k++) {
      for (let j = 0; j < N; j++) {
        const h0 = rows[k][j][1], h1 = rows[k + 1][j][1];
        for (const tri of [[idx(k, j), idx(k + 1, j), idx(k + 1, j + 1)], [idx(k, j), idx(k + 1, j + 1), idx(k, j + 1)]]) {
          const rnd = hash(f.length, seed, 11);
          let mat;
          if (stack) mat = rnd > 0.55 ? 3 : 4;
          else if (k === 1) mat = rnd > 0.55 ? 1 : 0;
          else if (k === 2) mat = rnd > 0.7 ? 1 : 0;
          else if (k === 3) mat = (h0 + h1) / 2 < PH * 0.42 ? 2 : rnd > 0.6 ? 3 : 0;
          else mat = rnd > 0.35 ? 2 : 3;
          f.push([...tri, mat, 0.88 + rnd * 0.26]);
        }
      }
    }
    const decor = [];
    const count = kind === "stack" ? 0 : 3 + Math.floor(hash(seed, 1, 1) * 4);
    for (let i = 0; i < count; i++) {
      const k = hash(i, seed, 21) > 0.5 ? 3 : 4, j = Math.floor(hash(i, seed, 22) * N);
      const p = rows[k][j], r = hash(i, seed, 23), yaw = hash(i, seed, 24) * TAU;
      if (k === 4 && p[1] < 0.1) continue;
      decor.push({ x: p[0], y: p[1] + 0.05, z: p[2], type: r < 0.4 ? "crystal" : r < 0.72 ? "tree" : "boulder", yaw, s: 0.7 + hash(i, seed, 25) * 0.7, seed: seed + i * 7 });
    }
    return { mesh: { v, f, open: true, bias: 1.4, cy: 0 }, decor, R, H, PH };
  }
  let WORLD = null;
  function world() {
    if (WORLD) return WORLD;
    const list = [];
    const add = (x, z, R, H, PH, seed, kind, yaw = 0) => { const isl = island(seed, R, H, PH, kind); isl.x = x; isl.z = z; isl.yaw = yaw; isl.seed = seed; list.push(isl); };
    const spec = {
      title: [[0, 3, 9.2, 2.6, 1.0, 11]], object: [[0, 2, 10.2, 2.8, 1.0, 23]], people: [[0, 2, 12.2, 2.4, 1.0, 37]], closing: [[0, 3, 9.6, 2.8, 1.0, 53]],
    };
    ORDER.forEach((id, si) => {
      const [sx, sz] = SLOT[id];
      for (const [ox, oz, R, H, PH, seed] of spec[id] || []) add(sx + ox, sz + oz, R, H, PH, seed, "island", hash(seed) * TAU);
    });
    for (let i = -1; i <= 7; i++) {
      const bx = i * 30, bz = (Object.values(SLOT).find((v) => v[0] === bx) || [0, 0])[1];
      for (let k = 0; k < 4; k++) {
        const s = 100 + i * 17 + k * 5;
        add(bx + (hash(s, 1) - 0.5) * 30, bz + 16 + hash(s, 2) * 30, 3.4 + hash(s, 3) * 4.6, 2 + hash(s, 4) * 3, 0.8 + hash(s, 5) * 0.7, s, "island", hash(s, 6) * TAU);
      }
      for (let k = 0; k < 2; k++) {
        const s = 300 + i * 13 + k * 7;
        add(bx + (hash(s, 1) - 0.5) * 34, bz + 28 + hash(s, 2) * 26, 1.7 + hash(s, 3) * 1.1, 0, 5 + hash(s, 4) * 6, s, "stack", hash(s, 6) * TAU);
      }
      const fg = [[-17, -9], [18, -11]];
      fg.forEach(([ox, oz], k) => {
        const s = 500 + i * 11 + k * 3;
        add(bx + ox + (hash(s, 1) - 0.5) * 5, bz + oz + (hash(s, 2) - 0.5) * 3, 2.4 + hash(s, 3) * 2.2, 1.2, 0.7 + hash(s, 5) * 0.4, s, "island", hash(s, 6) * TAU);
      });
    }
    // Far headlands: two hazy ranges along the horizon.
    const ridge = (z0, depth, hMin, hMax, seed, step) => {
      const v = [], f = [];
      const xs = [];
      for (let x = -120; x <= 330; x += step) xs.push(x);
      xs.forEach((x, i) => {
        const jx = x + (hash(i, seed, 1) - 0.5) * step * 0.6;
        const h = hMin + (hMax - hMin) * Math.pow(hash(i, seed, 2), 1.6) * (0.5 + 0.5 * Math.sin(i * 0.35 + seed));
        v.push([jx, 0, z0], [jx + step * 0.1, h, z0 + depth * 0.5], [jx, 0, z0 + depth]);
      });
      for (let i = 0; i < xs.length - 1; i++) {
        const a = i * 3, b = (i + 1) * 3;
        const r1 = hash(i, seed, 3), r2 = hash(i, seed, 4);
        f.push([a, a + 1, b + 1, r1 > 0.5 ? 3 : 4, 0.9 + r1 * 0.2], [a, b + 1, b, r2 > 0.5 ? 3 : 4, 0.85 + r2 * 0.2]);
        f.push([a + 1, a + 2, b + 2, r2 > 0.5 ? 4 : 3, 0.8 + r2 * 0.2], [a + 1, b + 2, b + 1, r1 > 0.5 ? 4 : 3, 0.85 + r1 * 0.2]);
      }
      return { v, f, open: true, cy: 0 };
    };
    WORLD = { list, ridgeA: ridge(88, 18, 6, 22, 5, 7), ridgeB: ridge(70, 14, 3, 11, 9, 5) };
    return WORLD;
  }
  function protoOf(name) {
    if (PROTO[name]) return PROTO[name];
    let m;
    switch (name) {
      case "crystal": m = bipyramid(5, 0.55, 2.1, 0.1, 7); break;
      case "crystal2": m = bipyramid(4, 0.42, 1.5, 0.1, 5); break;
      case "boulder": m = octa(0.9, 1, 4, [3, 4, 3], 0.2); break;
      case "trunk": m = prism(5, 0.2, 0.14, 1.2, 8, 8); break;
      case "canopy": m = octa(0.95, 1, 8, [0, 1, 0], 0.15); break;
      case "hexpad": m = prism(6, 1, 0.94, 1, 3, 3, TAU / 12); break;
      default: m = box(1, 1, 1, 3);
    }
    return (PROTO[name] = m);
  }
  function drawIsland(isl, t, o = {}) {
    if (!P(isl.x, 1, isl.z)) return;
    const reach = isl.R * 1.4 * CAM.f / PZ;
    if (PX < -reach - 80 || PX > SS.W + reach + 80 || PY < -reach - 80 || PY > SS.H + reach + 120) return;
    put(isl.mesh, isl.x, 0, isl.z, { yaw: isl.yaw, build: o.build });
    for (const d of isl.decor) {
      const [dx, dz] = rotXZ(isl.yaw, d.x, d.z);
      const X = isl.x + dx, Z = isl.z + dz, yaw = d.yaw + isl.yaw;
      if (d.type === "crystal") {
        put(protoOf("crystal"), X, d.y, Z, { yaw, sc: d.s, rz: 0.12, emit: 0.16 + 0.1 * Math.sin(t * 1.6 + d.seed), glow: TH.mats[7], mul: 1.1, seed: d.seed });
        put(protoOf("crystal2"), X + 0.7 * d.s, d.y, Z - 0.3, { yaw: yaw + 1, sc: d.s * 0.9, rz: -0.28, emit: 0.1, glow: TH.mats[7], seed: d.seed + 1 });
      } else if (d.type === "tree") {
        put(protoOf("trunk"), X, d.y, Z, { sc: d.s, mat: TH.mats[8], seed: d.seed });
        put(protoOf("canopy"), X, d.y + 1.5 * d.s, Z, { yaw, sc: d.s * (1.05 + 0.04 * Math.sin(t * 1.3 + d.seed)), seed: d.seed });
      } else put(protoOf("boulder"), X, d.y + 0.2, Z, { yaw, sc: d.s, sy: d.s * 0.7, seed: d.seed });
    }
  }
  function shoreFoam(isl, t) {
    if (isl.PH > 4) return;
    const N = 14, R = isl.R;
    for (let j = 0; j < N; j++) {
      const a0 = (j / N) * TAU + isl.yaw, a1 = ((j + 1) / N) * TAU + isl.yaw;
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.5 + j * 1.3 + isl.seed);
      const r0 = R * (0.94 + 0.04 * Math.sin(j * 2.1 + isl.seed)), r1 = R * (1.1 + 0.07 * pulse);
      const A = [isl.x + Math.cos(a0) * r0, 0.12, isl.z + Math.sin(a0) * r0], B = [isl.x + Math.cos(a1) * r0, 0.12, isl.z + Math.sin(a1) * r0];
      const C = [isl.x + Math.cos(a1) * r1, 0.1, isl.z + Math.sin(a1) * r1], D = [isl.x + Math.cos(a0) * r1, 0.1, isl.z + Math.sin(a0) * r1];
      const col = `rgba(255,255,255,${(0.28 + 0.2 * pulse) * (TH.night ? 0.7 : 1)})`;
      wtri(FQ, A, B, C, col); wtri(FQ, A, C, D, col);
    }
  }
  // A ring of ripple that grows and fades, centred on (x, z).
  const RT = { list: FQ };
  function ripple(x, z, r, phase, a = 0.5) {
    const k = fract(phase), rr = r * (1 + k * 1.2), w = 0.28 + 0.3 * k, al = a * (1 - k) * Math.min(1, k * 6);
    if (al < 0.02) return;
    const N = 14, col = `rgba(255,255,255,${al.toFixed(3)})`;
    for (let j = 0; j < N; j++) {
      const a0 = (j / N) * TAU, a1 = ((j + 1) / N) * TAU;
      const A = [x + Math.cos(a0) * rr, 0.14, z + Math.sin(a0) * rr], B = [x + Math.cos(a1) * rr, 0.14, z + Math.sin(a1) * rr];
      const C = [x + Math.cos(a1) * (rr + w), 0.14, z + Math.sin(a1) * (rr + w)], D = [x + Math.cos(a0) * (rr + w), 0.14, z + Math.sin(a0) * (rr + w)];
      wtri(RT.list, A, B, C, col, -1); wtri(RT.list, A, C, D, col, -1);
    }
  }

  function drawSea(ctx, t) {
    const cs = 4, W = SS.W, H = SS.H;
    const gz0 = Math.floor((CAM.pz - 5) / cs), gz1 = Math.floor((CAM.pz + 100) / cs);
    const gx0 = Math.floor((CAM.px - 78) / cs), gx1 = Math.floor((CAM.px + 78) / cs);
    const nx = gx1 - gx0 + 1, nz = gz1 - gz0 + 1;
    const vx = new Float32Array(nx * nz), vy = new Float32Array(nx * nz), vz = new Float32Array(nx * nz);
    const px = new Float32Array(nx * nz), py = new Float32Array(nx * nz), pz = new Float32Array(nx * nz);
    for (let jz = 0; jz < nz; jz++) {
      for (let jx = 0; jx < nx; jx++) {
        const gx = gx0 + jx, gz = gz0 + jz, k = jz * nx + jx;
        const x = gx * cs + (hash(gx, gz, 1) - 0.5) * cs * 0.75, z = gz * cs + (hash(gx, gz, 2) - 0.5) * cs * 0.75;
        vx[k] = x; vz[k] = z; vy[k] = wave(x, z, t);
        if (P(x, vy[k], z)) { px[k] = PX; py[k] = PY; pz[k] = PZ; } else pz[k] = -1;
      }
    }
    const isl = world().list, tex = TH.tex;
    const deep = rgb(TH.w.seaDeep), shallow = rgb(TH.w.seaShallow), fogc = TH.fog, sunc = TH.sunc;
    const seaQ = QU;
    for (let jz = 0; jz < nz - 1; jz++) {
      for (let jx = 0; jx < nx - 1; jx++) {
        const k00 = jz * nx + jx, k10 = k00 + 1, k01 = k00 + nx, k11 = k01 + 1;
        const flip = hash(gx0 + jx, gz0 + jz, 3) > 0.5;
        const tris = flip ? [[k00, k10, k11], [k00, k11, k01]] : [[k00, k10, k01], [k10, k11, k01]];
        for (const [a, b, c] of tris) {
          if (pz[a] < 0 || pz[b] < 0 || pz[c] < 0) continue;
          if ((px[a] < -40 && px[b] < -40 && px[c] < -40) || (px[a] > W + 40 && px[b] > W + 40 && px[c] > W + 40) || (py[a] > H + 40 && py[b] > H + 40 && py[c] > H + 40)) continue;
          const ux = vx[b] - vx[a], uy = vy[b] - vy[a], uz = vz[b] - vz[a], wx = vx[c] - vx[a], wy = vy[c] - vy[a], wz = vz[c] - vz[a];
          let nx_ = uy * wz - uz * wy, ny_ = uz * wx - ux * wz, nz_ = ux * wy - uy * wx;
          const nl = Math.hypot(nx_, ny_, nz_) || 1;
          nx_ /= nl; ny_ /= nl; nz_ /= nl;
          if (ny_ < 0) { nx_ = -nx_; ny_ = -ny_; nz_ = -nz_; }
          const mx = (vx[a] + vx[b] + vx[c]) / 3, mz = (vz[a] + vz[b] + vz[c]) / 3, my = (vy[a] + vy[b] + vy[c]) / 3;
          const zc = (pz[a] + pz[b] + pz[c]) / 3;
          // Lagoon: the water turns pale turquoise near land.
          let sh = 0;
          for (let i = 0; i < isl.length; i++) {
            const q = isl[i];
            if (q.PH > 4) continue;
            const dx = mx - q.x, dz = mz - q.z;
            if (dx > q.R * 3 || dx < -q.R * 3 || dz > q.R * 3 || dz < -q.R * 3) continue;
            const dd = Math.sqrt(dx * dx + dz * dz) / q.R;
            if (dd < 2.6) sh = Math.max(sh, 1 - (dd - 1) / 1.6);
          }
          sh = clamp(sh);
          const base = mixc(deep, shallow, clamp(sh * 0.95 + (hash(gx0 + jx, gz0 + jz, 5) - 0.5) * 0.25 + 0.05));
          // Sky reflection and sun glitter.
          const vxv = CAM.px - mx, vyv = CAM.py - my, vzv = CAM.pz - mz, vl = Math.hypot(vxv, vyv, vzv) || 1;
          const nv = (nx_ * vxv + ny_ * vyv + nz_ * vzv) / vl;
          const fres = Math.pow(1 - clamp(nv), 3) * 0.3;
          const rxv = 2 * nv * nx_ - vxv / vl, ryv = 2 * nv * ny_ - vyv / vl, rzv = 2 * nv * nz_ - vzv / vl;
          const spec = Math.pow(Math.max(0, rxv * SUN[0] + ryv * SUN[1] + rzv * SUN[2]), 36) * 0.8;
          let col = litCol(base, nx_, ny_, nz_, zc, 0, null, 0.92 + 0.12 * Math.sin(t * 2.1 + hash(gx0 + jx, gz0 + jz, 8) * TAU) * tex);
          const rgbv = col.match(/\d+/g).map(Number);
          const refl = TH.w.sky[2];
          const rr = rgb(refl);
          rgbv[0] = rgbv[0] + (rr[0] - rgbv[0]) * fres + sunc[0] * spec * 1.2;
          rgbv[1] = rgbv[1] + (rr[1] - rgbv[1]) * fres + sunc[1] * spec * 1.2;
          rgbv[2] = rgbv[2] + (rr[2] - rgbv[2]) * fres + sunc[2] * spec * 1.2;
          qtri(seaQ, px[a], py[a], px[b], py[b], px[c], py[c], zc, css(rgbv));
        }
      }
    }
    flush(ctx, seaQ);
  }

  // ---- sky ---------------------------------------------------------------------------------------------------------
  function drawSky(ctx, t) {
    const { W, H, u } = SS, hz = clamp(CAM.hz, H * 0.1, H * 0.98), tex = TH.tex;
    const nxc = 26, nyc = 14, bot = Math.min(H, hz + H * 0.05);
    const cw = W / nxc, ch = bot / nyc;
    const shift = (CAM.psi * CAM.f * 0.5 + CAM.tx * 7) / cw, i0 = Math.floor(shift), fr = shift - i0;
    const stopsC = TH.w.sky.map(rgb);
    const sunP = P(CAM.px + SUN[0] * 400, CAM.py + SUN[1] * 400, CAM.pz + SUN[2] * 400) ? [PX, PY] : null;
    const vert = (i, j) => {
      const ii = i + i0;
      const jit = j === 0 || j === nyc ? 0 : 0.34;
      return [(i - fr) * cw + (hash(ii, j, 31) - 0.5) * cw * jit * 2, j * ch + (j === 0 || j === nyc ? 0 : (hash(ii, j, 32) - 0.5) * ch * jit * 2)];
    };
    for (let j = 0; j < nyc; j++) {
      let prev = vert(-1, j), prev2 = vert(-1, j + 1);
      for (let i = 0; i <= nxc + 1; i++) {
        const a = prev, b = vert(i, j), c = prev2, d = vert(i, j + 1);
        const flip = hash(i + i0, j, 33) > 0.5;
        for (const tri of flip ? [[a, b, d], [a, d, c]] : [[a, b, c], [b, d, c]]) {
          const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
          const v = clamp(cy / hz);
          const c0 = stops(stopsC, Math.pow(v, 1.15));
          const nz = hash(Math.floor(cx * 7), Math.floor(cy * 7), j + i0) - 0.5;
          const shimmer = Math.sin(t * 0.9 + cx * 0.011 + cy * 0.017) * 0.03 * (0.4 + tex);
          let k = 1 + nz * 0.1 * (0.5 + 0.5 * tex) + shimmer;
          let r = c0[0] * k, g = c0[1] * k, bb = c0[2] * k;
          if (sunP) {
            const dd = Math.hypot(cx - sunP[0], (cy - sunP[1]) * 1.3) / (H * 0.55), gl = Math.pow(Math.max(0, 1 - dd), 2.2) * 0.62;
            const sg = TH.sunc; r += (sg[0] - r) * gl; g += (sg[1] - g) * gl; bb += (sg[2] - bb) * gl;
          }
          fillTri(ctx, tri[0][0], tri[0][1], tri[1][0], tri[1][1], tri[2][0], tri[2][1], css([r, g, bb]), 0.7 * u);
        }
        prev = b; prev2 = d;
      }
    }
    // Stars on a night sky: little four-point glints.
    if (TH.w.stars > 0) {
      for (let k = 0; k < 90; k++) {
        const sx = (((hash(k, 1, 77) * W * 1.4 - shift * cw * 0.35) % (W * 1.4)) + W * 1.4) % (W * 1.4) - W * 0.2, sy = hash(k, 2, 77) * hz * 0.75;
        const tw = 0.35 + 0.65 * Math.pow(Math.sin(t * (1.2 + hash(k, 3, 77) * 2) + k) * 0.5 + 0.5, 2), s = (1.6 + hash(k, 4, 77) * 3) * u;
        const col = `rgba(255,248,230,${(TH.w.stars * tw * (1 - sy / hz * 0.5)).toFixed(3)})`;
        fillTri(ctx, sx - s, sy, sx, sy - s * 1.7, sx + s, sy, col, 0); fillTri(ctx, sx - s, sy, sx, sy + s * 1.7, sx + s, sy, col, 0);
      }
    }
    // Sun: a faceted disc with turning rays, half sunk behind the sea plane.
    if (sunP) {
      const R = H * (TH.night ? 0.05 : 0.062), sc = rgb(TH.w.sun), gl = rgb(TH.w.sunGlow);
      const g = ctx.createRadialGradient(sunP[0], sunP[1], R * 0.4, sunP[0], sunP[1], R * 6.5);
      g.addColorStop(0, css(gl, 0.6)); g.addColorStop(0.35, css(gl, 0.2)); g.addColorStop(1, css(gl, 0));
      ctx.fillStyle = g; ctx.fillRect(sunP[0] - R * 7, sunP[1] - R * 7, R * 14, R * 14);
      const rot = t * 0.08;
      for (let k = 0; k < 12; k++) {
        const a = rot + (k / 12) * TAU, w = 0.07, len = R * (3.2 + 1.3 * Math.sin(k * 2.3 + t * 0.7));
        fillTri(ctx, sunP[0], sunP[1], sunP[0] + Math.cos(a - w) * len, sunP[1] + Math.sin(a - w) * len, sunP[0] + Math.cos(a + w) * len, sunP[1] + Math.sin(a + w) * len, css(gl, 0.16), 0);
      }
      for (let k = 0; k < 14; k++) {
        const a0 = (k / 14) * TAU + 0.2, a1 = ((k + 1) / 14) * TAU + 0.2;
        fillTri(ctx, sunP[0], sunP[1], sunP[0] + Math.cos(a0) * R, sunP[1] + Math.sin(a0) * R, sunP[0] + Math.cos(a1) * R, sunP[1] + Math.sin(a1) * R, css(mixc(sc, gl, 0.1 + 0.3 * ((k % 3) / 2) + 0.1 * Math.sin(t * 1.4 + k))), 0.5 * u);
      }
    }
    // Faceted clouds drift slowly and slide with the camera.
    const cloudA = rgb(TH.w.cloud[0]), cloudB = rgb(TH.w.cloud[1]);
    for (let k = 0; k < 9; k++) {
      const span = W * 1.7, sp = (8 + hash(k, 1, 88) * 14) * u;
      const x = ((((hash(k, 2, 88) * span - t * sp - CAM.tx * 9 * (0.5 + hash(k, 9, 88)) - CAM.psi * CAM.f * 0.3) % span) + span) % span) - W * 0.3;
      const y = hz * (0.12 + hash(k, 3, 88) * 0.55) + Math.sin(t * 0.2 + k) * 4 * u, s = (0.7 + hash(k, 4, 88) * 0.9) * H * 0.045;
      const puffs = 5 + (k % 3), bx0 = x - (puffs / 2 + 0.7) * s * 0.95, bx1 = x + (puffs / 2) * s * 0.95, by0 = y - s * 1.3, by1 = y + s * 0.7;
      const al = 1 - titleZoneHit(bx0, by0, bx1, by1);
      if (al > 0.02) cloud(ctx, x, y, s, k, cloudA, cloudB, al);
    }
  }
  // Where the template's headline sits, so clouds dissolve instead of drifting behind its letters.
  function titleZones() {
    const { W, H, tall } = SS;
    return {
      hero: tall ? [0, H * 0.34, W, H * 0.66] : [0, H * 0.34, W * 0.62, H * 0.66],
      content: tall ? [0, 0, W, H * 0.25] : [0, 0, W * 0.66, H * 0.26],
    };
  }
  function heroWeight() {
    const pl = plan(), id = INFO.scene, isHero = (sid) => (sid === "title" || sid === "closing" ? 1 : 0);
    const k = pl.findIndex((e) => e.id === id);
    if (k < 0) return 0;
    const now = isHero(id), prev = k > 0 ? isHero(pl[k - 1].id) : now;
    return lerp(prev, now, eio((INFO.local + 0.2) / 0.6));
  }
  function titleZoneHit(x0, y0, x1, y1) {
    const z = titleZones(), hw = heroWeight(), f = SS.H * 0.05;
    const hit = (r) => { const dx = Math.max(r[0] - x1, x0 - r[2], 0), dy = Math.max(r[1] - y1, y0 - r[3], 0); return clamp(1 - Math.hypot(dx, dy) / f); };
    return clamp(hit(z.hero) * hw + hit(z.content) * (1 - hw));
  }
  function cloud(ctx, x, y, s, seed, A, B, al = 1) {
    const puffs = 5 + (seed % 3);
    for (let i = 0; i < puffs; i++) {
      const px = x + (i - puffs / 2) * s * 0.95, py = y - Math.sin((i / (puffs - 1)) * Math.PI) * s * 0.55 + (hash(i, seed, 90) - 0.5) * s * 0.2;
      const r = s * (0.7 + 0.5 * Math.sin((i / (puffs - 1)) * Math.PI));
      for (let k = 0; k < 6; k++) {
        const a0 = (k / 6) * TAU, a1 = ((k + 1) / 6) * TAU;
        const top = Math.sin((a0 + a1) / 2) < 0;
        fillTri(ctx, px, py, px + Math.cos(a0) * r, py + Math.sin(a0) * r * 0.62, px + Math.cos(a1) * r, py + Math.sin(a1) * r * 0.62, css(mixc(A, B, top ? 0.06 + 0.1 * (k % 2) : 0.5 + 0.2 * (k % 2)), 0.9 * al), 0.5);
      }
    }
  }

  // ---- living details: gulls, leaping fish, little boats ------------------------------------------------------
  function drawGulls(t) {
    const wingA = [255, 247, 232], wingB = [214, 196, 214], body = [150, 132, 170];
    ORDER.forEach((id, si) => {
      const [sx, sz] = SLOT[id];
      for (let k = 0; k < 3; k++) {
        const dir = k % 2 ? -1 : 1, rad = 9 + k * 4 + (si % 3), ph = si * 1.7 + k * 2.1, ang = t * (0.34 + 0.07 * k) * dir + ph;
        const cx = sx + 2 + Math.cos(si + k) * 5, cz = sz + 8;
        const x = cx + Math.cos(ang) * rad, z = cz + Math.sin(ang) * rad * 0.55, y = 8.5 + k * 1.3 + Math.sin(t * 0.8 + ph) * 0.9;
        let fx = -Math.sin(ang) * dir, fz = Math.cos(ang) * 0.55 * dir; const fl = Math.hypot(fx, fz); fx /= fl; fz /= fl;
        const rx = fz, rz = -fx, flap = Math.sin(t * 7.5 + ph * 3) * 0.75, s = 0.62;
        const wl = [x - rx * 1.9 * s, y + flap * s, z - rz * 1.9 * s], wr = [x + rx * 1.9 * s, y + flap * s, z + rz * 1.9 * s];
        const nose = [x + fx * 0.9 * s, y, z + fz * 0.9 * s], tail = [x - fx * 0.8 * s, y - 0.05, z - fz * 0.8 * s];
        const root = [x + fx * 0.25 * s, y, z + fz * 0.25 * s], root2 = [x - fx * 0.4 * s, y, z - fz * 0.4 * s];
        const fg = Math.min(1, Math.max(0, (CAM.pz - 0) * 0 + 0));
        wtri(QU, root, root2, wl, css(wingA), -1); wtri(QU, root, root2, wr, css(wingB), -1);
        wtri(QU, nose, tail, [x, y + 0.25 * s, z], css(body), -1.5);
      }
    });
  }
  function drawFish(t) {
    for (let i = 0; i < 14; i++) {
      const si = i % 7, [sx, sz] = SLOT[ORDER[si]];
      const T = 3.2 + hash(i, 1, 61) * 3.2, f = fract(t / T + hash(i, 2, 61));
      const bx = sx + (hash(i, 3, 61) - 0.5) * 34, bz = sz + (hash(i, 4, 61) - 0.5) * 8 - 2 + (i > 6 ? 12 : 0);
      const dur = 0.14, dir = i % 2 ? 1 : -1;
      if (f < dur) {
        const s = f / dur, x = bx + dir * (s - 0.5) * 6.4, y = Math.sin(Math.PI * s) * (2.8 + hash(i, 5, 61)), slope = Math.cos(Math.PI * s) * 1.2 * -1;
        fish(x, y + 0.2, bz, dir, slope, t, i);
        if (s < 0.4) ripple(bx - dir * 3.2, bz, 0.5, s * 2.2, 0.55);
      } else if (f < dur + 0.14) ripple(bx + dir * 3.2, bz, 0.5, (f - dur) / 0.14, 0.55);
      else if (f > 1 - 0.0) {}
    }
  }
  function fish(x, y, z, dir, slope, t, i) {
    const body = [255, 150, 90], belly = [255, 224, 190], fin = [255, 110, 120];
    const fx = dir, up = 0.5, tilt = slope * 0.7;
    const nose = [x + fx * 0.8, y + tilt, z], tail = [x - fx * 0.8, y - tilt, z];
    const top = [x, y + 0.34, z], bot = [x, y - 0.3, z], side = [x, y, z - 0.22], side2 = [x, y, z + 0.22];
    wtri(QU, nose, tail, top, css(body), -2); wtri(QU, nose, tail, bot, css(belly), -2); wtri(QU, nose, top, side, css(mixc(body, belly, 0.4)), -2.2);
    const sw = Math.sin(t * 20 + i) * 0.22;
    wtri(QU, tail, [x - fx * 1.35, y + 0.48 + tilt, z + sw], [x - fx * 1.35, y - 0.48 + tilt, z + sw], css(fin), -2.1);
  }
  function drawBoats(ctx, t) {
    for (let i = 0; i < 3; i++) {
      const [sx, sz] = SLOT[ORDER[1 + i * 2]];
      const x = sx + 13 + Math.sin(t * 0.12 + i * 2) * 6 - i * 3, z = sz + 13 + Math.sin(t * 0.17 + i) * 2;
      const bob = wave(x, z, t) * 0.9, roll = Math.sin(t * 0.9 + i) * 0.07, yaw = 0.35 + Math.cos(t * 0.12 + i * 2) * 0.2;
      put(protoOf("hull"), x, bob - 0.1, z, { yaw, rz: roll, sc: 1, mat: TH.mats[8], mat2: TH.mats[2], mat3: TH.mats[6] });
      put(protoOf("sail"), x, bob + 0.2, z, { yaw: yaw + 0.1 + Math.sin(t * 0.9 + i) * 0.05, rz: roll, mat: i % 2 ? TH.acc : TH.mats[6] });
    }
  }
  PROTO.hull = (() => {
    const m = prism(4, 1.5, 1.0, 0.9, -2, -1, TAU / 8);
    m.v = m.v.map(([x, y, z]) => [x * 1.35, y, z * 0.55]);
    return m;
  })();
  PROTO.sail = (() => ({ v: [[0, 0.8, 0], [0, 4.2, 0], [1.5, 0.8, 0.0], [-0.04, 0.8, 0]], f: [[0, 1, 2, -1, 1], [0, 1, 2, -1, 0.82]], open: true, both: true, cy: 2 }))();

  // ---- UI: flat tags and screen-space effects ------------------------------------------------------------------
  function tagPoly(ctx, w, h, c) {
    ctx.beginPath();
    ctx.moveTo(-w / 2 + c, -h / 2); ctx.lineTo(w / 2, -h / 2); ctx.lineTo(w / 2, h / 2 - c); ctx.lineTo(w / 2 - c, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.lineTo(-w / 2, -h / 2 + c);
    ctx.closePath();
  }
  // A chamfered flat tag with a lit top facet and a deeper lower facet. Returns its width, height.
  function tag(ctx, S, str, x, y, size, o = {}) {
    str = String(str ?? "");
    if (!str) return { w: 0, h: 0 };
    const q = o.q == null ? 1 : o.q;
    if (q <= 0.02) return { w: 0, h: 0 };
    const w0 = TH.w, u = S.u;
    ctx.save();
    ctx.font = `${o.weight || 700} ${size}px ${o.font || FONT}`;
    const padX = size * (o.pad ?? 0.6), tw = ctx.measureText(str).width, w = tw + padX * 2 + (o.lead || 0), h = size * 1.5, c = h * 0.3;
    const sc = o.scale == null ? back(q) : o.scale * back(q);
    const ax = o.align === "l" ? w / 2 : o.align === "r" ? -w / 2 : 0;
    // Tags fade out before they reach a frame edge, so a camera move never clips their lettering.
    const cxT = x + ax * sc, edge = Math.min(cxT - (w * sc) / 2, S.W - (cxT + (w * sc) / 2), S.H - (y + (h * sc) / 2));
    ctx.globalAlpha = clamp(q * 3) * (o.alpha == null ? 1 : o.alpha) * clamp(edge / (46 * u));
    ctx.translate(x + ax * sc, y);
    ctx.rotate(o.rot || 0);
    ctx.scale(sc, sc);
    const hot = o.kind === "accent", dark = o.kind === "dark";
    const bg = hot ? TH.acc : dark ? rgb(w0.tagDark) : rgb(w0.tagBg), ink = hot ? onAccent(S) : dark ? [250, 244, 238] : rgb(w0.tagInk);
    tagPoly(ctx, w, h, c); ctx.save(); ctx.translate(7 * u, 9 * u); ctx.fillStyle = "rgba(14,8,40,0.3)"; ctx.fill(); ctx.restore();
    tagPoly(ctx, w, h, c); ctx.fillStyle = css(bg); ctx.fill();
    ctx.save(); tagPoly(ctx, w, h, c); ctx.clip();
    ctx.fillStyle = css(mixc(bg, [255, 255, 255], 0.24)); ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(w / 2, -h / 2); ctx.lineTo(-w / 2, h * 0.08); ctx.closePath(); ctx.fill();
    ctx.fillStyle = css(mixc(bg, [20, 10, 60], 0.14)); ctx.beginPath(); ctx.moveTo(w / 2, -h * 0.22); ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w * 0.12, h / 2); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = css(ink); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(str, (o.lead || 0) / 2, size * 0.05);
    if (o.lead) o.leadDraw && o.leadDraw(ctx, -w / 2 + padX * 0.55 + (o.lead || 0) / 2 - (o.lead || 0) / 2, 0, size);
    ctx.restore();
    return { w: w * sc, h: h * sc };
  }
  function onAccent(S) { return lum(TH.acc) > 150 ? [30, 18, 70] : [255, 255, 255]; }
  function leader(ctx, S, pts, prog, color, width) {
    // Polyline that draws on, with a bead travelling along it forever.
    const lens = []; let total = 0;
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); lens.push(l); total += l; }
    const upto = total * clamp(prog);
    ctx.save();
    ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.lineWidth = width; ctx.strokeStyle = color;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const l = lens[i - 1];
      if (acc + l <= upto) { ctx.lineTo(pts[i][0], pts[i][1]); acc += l; }
      else { const k = (upto - acc) / (l || 1); ctx.lineTo(lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k)); break; }
    }
    ctx.stroke();
    ctx.restore();
  }
  function pointOn(pts, k) {
    let total = 0; const lens = [];
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); lens.push(l); total += l; }
    let d = clamp(k) * total;
    for (let i = 1; i < pts.length; i++) { if (d <= lens[i - 1]) { const f = d / (lens[i - 1] || 1); return [lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)]; } d -= lens[i - 1]; }
    return pts[pts.length - 1];
  }
  // Ground shadow: a soft flat ellipse under a floating thing.
  function blob(ctx, x, y, z, r, a) {
    if (!P(x, y, z)) return;
    const cx = PX, cy = PY, k = CAM.f / PZ;
    const rx = r * k, ry = r * k * Math.max(0.18, Math.abs(CAM.fy) * 1.1 + 0.1);
    ctx.save(); ctx.translate(cx, cy); ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, `rgba(18,10,48,${a})`); g.addColorStop(1, "rgba(18,10,48,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill(); ctx.restore();
  }
  // Foreground motes: tiny drifting triangles that slide past the lens.
  function motes(ctx, S, t, amt = 1) {
    const { W, H, u } = S;
    const col = TH.night ? "255,244,220" : "255,255,255";
    for (let k = 0; k < 34; k++) {
      const sp = (14 + hash(k, 1, 41) * 30) * u, x = ((hash(k, 2, 41) * W * 1.2 - t * sp * 1.2 - CAM.tx * 14) % (W * 1.2) + W * 1.2) % (W * 1.2) - W * 0.1;
      const y = ((hash(k, 3, 41) * H * 1.1 - t * sp * 0.5 + Math.sin(t * 0.8 + k) * 20) % (H * 1.1) + H * 1.1) % (H * 1.1) - H * 0.05;
      const s = (3 + hash(k, 4, 41) * 6) * u, a = t * (0.6 + hash(k, 5, 41)) + k;
      const al = (0.18 + 0.25 * hash(k, 6, 41)) * amt * (0.6 + 0.4 * Math.sin(t * 1.6 + k));
      fillTri(ctx, x + Math.cos(a) * s, y + Math.sin(a) * s, x + Math.cos(a + 2.1) * s, y + Math.sin(a + 2.1) * s, x + Math.cos(a + 4.2) * s, y + Math.sin(a + 4.2) * s, `rgba(${col},${al.toFixed(3)})`, 0);
    }
  }
  const NOISE = { c: null };
  function noiseTile() {
    if (NOISE.c) return NOISE.c;
    const c = document.createElement("canvas"); c.width = c.height = 160;
    const g = c.getContext("2d"), img = g.createImageData(160, 160), r = rng(21);
    for (let i = 0; i < img.data.length; i += 4) { const v = r() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    return (NOISE.c = c);
  }
  function finishPass(ctx, S, t) {
    const { W, H } = S, tex = TH.tex;
    const g = ctx.createRadialGradient(W / 2, H * 0.52, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    g.addColorStop(0, "rgba(10,4,34,0)"); g.addColorStop(1, `rgba(10,4,34,${(0.1 + 0.28 * tex) * (TH.night ? 1.2 : 0.8)})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (tex > 0.02) {
      ctx.save(); ctx.globalAlpha = 0.045 * tex; ctx.globalCompositeOperation = "overlay";
      const tile = noiseTile(), ox = Math.floor(hash(Math.floor(t * 24), 1, 2) * 160), oy = Math.floor(hash(Math.floor(t * 24), 2, 3) * 160);
      for (let x = -ox; x < W; x += 160) for (let y = -oy; y < H; y += 160) ctx.drawImage(tile, x, y);
      ctx.restore();
    }
  }
  // Scene change: a diagonal band of loose triangles sweeps across, sliding with the camera.
  function shardWipe(ctx, S, local, change) {
    const dur = Math.max(0.75, change * 2);
    if (local >= dur) return;
    const { W, H, u } = S, k = local / dur;
    const nx = 22, ny = 12, cw = W / nx * 1.25, ch = H / ny;
    const front = lerp(-0.45, 1.45, eio(k)) * W;
    const c0 = rgb(TH.w.sky[2]), c1 = rgb(TH.w.sky[3]), c2 = TH.acc, c3 = rgb(TH.w.sky[1]);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const x = i * cw * 0.8 - cw * 0.3 + (j % 2) * cw * 0.4, y = j * ch;
        const cx = x + cw / 2, cy = y + ch / 2;
        const d = (cx - front) / (W * 0.34) + (cy / H - 0.5) * 0.35 + (hash(i, j, 55) - 0.5) * 0.25;
        const q = clamp(1 - Math.abs(d)) * (d < 0 ? 0.6 + 0.4 * clamp(1 + d * 1.6) : 1);
        const s = Math.pow(q, 0.85);
        if (s <= 0.03) continue;
        const flip = hash(i, j, 56) > 0.5;
        const pts = flip ? [[x, y], [x + cw, y], [x, y + ch]] : [[x + cw, y], [x + cw, y + ch], [x, y + ch]];
        const mx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3, my = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
        const rot = (1 - s) * (hash(i, j, 57) - 0.5) * 2.2, cr = Math.cos(rot), sr = Math.sin(rot), sc = s;
        const m = pts.map(([px, py]) => { const dx = (px - mx) * sc, dy = (py - my) * sc; return [mx + dx * cr - dy * sr + (1 - s) * 60 * u, my + dx * sr + dy * cr - (1 - s) * 30 * u * (hash(i, j, 58) - 0.5)]; });
        const pick = hash(i, j, 59), col = pick > 0.82 ? c2 : pick > 0.55 ? c1 : pick > 0.25 ? c0 : c3;
        fillTri(ctx, m[0][0], m[0][1], m[1][0], m[1][1], m[2][0], m[2][1], css(col, clamp(s * 1.4) * (0.55 + 0.4 * (pick > 0.82))), 0.4 * u);
      }
    }
  }

  // ---- layout and camera slots ---------------------------------------------------------------------------------
  function boxOf(S) {
    const { W, H, u, tall } = S, side = (tall ? 90 : 140) * u;
    return tall ? { x: side, y: H * 0.3, w: W - side * 2, h: H * 0.6 } : { x: side, y: H * 0.34, w: W - side * 2, h: H * 0.58 };
  }
  const ctlOf = () => (window.__dreamcut && window.__dreamcut.controls) || {};
  function layout(id, S) {
    const B = boxOf(S), tall = S.tall, ctl = ctlOf();
    const [sx, sz] = SLOT[id], bcx = B.x + B.w / 2;
    const L = { B, sx, sz };
    switch (id) {
      case "title": case "closing": {
        const wide = !tall && S.W > S.H * 1.15;
        L.cam = { tx: sx + 0.6, ty: 3.6, tz: sz + 3, psi: id === "title" ? 0.05 : -0.04, theta: 0.15, D: 30, ppu: tall ? S.W * 0.033 : S.H * 0.031, cx: wide ? S.W * 0.87 : S.W * 0.5, cy: tall ? S.H * 0.8 : S.H * 0.76 };
        break;
      }
      case "chart": {
        const n = 4, sp = 5.8, needW = n * sp + 1.8, ppuW = B.w / needW, avail = B.h / ppuW;
        const hMax = clamp(avail - 4.4, 4.2, 17);
        const ppu = Math.min(ppuW, B.h / (hMax + 4.4));
        Object.assign(L, { n, sp, hMax, rc: sp * 0.34 });
        L.cam = { tx: sx, ty: hMax * 0.5 - 0.2, tz: sz, psi: 0.08, theta: tall ? 0.2 : 0.14, D: 26, ppu, cx: bcx, cy: B.y + B.h * 0.55 };
        break;
      }
      case "object": {
        const ppu = tall ? Math.min(B.w * 0.082, B.h / 15) : Math.min(B.w * 0.05, B.h / 10.2);
        L.cam = { tx: sx, ty: 5.2, tz: sz, psi: 0.0, theta: tall ? 0.16 : 0.13, D: 26, ppu, cx: tall ? bcx : B.x + B.w * 0.33, cy: tall ? B.y + B.h * 0.36 : B.y + B.h * 0.54 };
        break;
      }
      case "people": {
        const n = clamp(Math.round(ctl.people_count ?? 4), 2, 6), rows = tall && n >= 4 ? 2 : 1, cols = Math.ceil(n / rows);
        const needW = cols * 5.6 + 3, ppu = Math.min(B.w / needW, B.h / (rows === 2 ? 17 : 11));
        Object.assign(L, { n, rows, cols });
        L.cam = { tx: sx, ty: 3.2, tz: sz + 1, psi: -0.03, theta: tall ? 0.22 : 0.14, D: 26, ppu, cx: bcx, cy: B.y + B.h * 0.56 };
        break;
      }
      case "process": {
        const ppu = tall ? Math.min(B.w / 14, B.h / 24) : Math.min(B.w / 25, B.h / 10);
        L.cam = { tx: sx, ty: 2.6, tz: sz, psi: 0.02, theta: tall ? 0.34 : 0.13, D: 28, ppu, cx: bcx, cy: B.y + B.h * (tall ? 0.52 : 0.54) };
        break;
      }
      case "compare": {
        const rP = 4.6, off = 5.4, needW = off * 2 + rP * 2 + 2, ppuW = B.w / needW, hMax = clamp(B.h / ppuW - 5.4, 5, 15), ppu = Math.min(ppuW, B.h / (hMax + 5.4));
        Object.assign(L, { rP, off, hMax });
        L.cam = { tx: sx, ty: hMax * 0.45, tz: sz, psi: -0.05, theta: tall ? 0.19 : 0.13, D: 27, ppu, cx: bcx, cy: B.y + B.h * 0.56 };
        break;
      }
    }
    return L;
  }
  let PLAN = null, PLAN_KEY = "";
  function plan() {
    const ctl = ctlOf(), holds = ORDER.map((id) => Number(ctl[id + "_hold"] ?? DEF_HOLD[id]));
    const key = holds.join();
    if (PLAN && key === PLAN_KEY) return PLAN;
    let t = 0; PLAN = [];
    ORDER.forEach((id, i) => { if (holds[i] > 0) PLAN.push({ id, start: t, hold: holds[i] }); t += holds[i]; });
    PLAN_KEY = key;
    return PLAN;
  }
  const LEAD = 0.32, PAN = 1.05;
  function camParams(S, ent, t) {
    const L = layout(ent.id, S), c = L.cam, local = Math.max(0, t - ent.start), k = local / Math.max(1, ent.hold);
    const idx = ORDER.indexOf(ent.id);
    return {
      ...c,
      psi: c.psi + 0.07 * Math.sin(local * 0.55 + idx) + 0.03 * (k - 0.5),
      theta: c.theta + 0.012 * Math.sin(local * 0.8 + idx * 2),
      D: c.D * (1 - 0.05 * Math.min(1, k)) + 0.5 * Math.sin(local * 0.6 + idx),
      tx: c.tx + 0.6 * Math.sin(local * 0.45 + idx * 1.3),
      cx: c.cx + 6 * S.u * Math.sin(local * 0.7 + idx),
    };
  }
  function camAt(S, t) {
    const pl = plan();
    if (!pl.length) return makeCam(S, layout("title", S).cam);
    let k = 0;
    for (let i = 0; i < pl.length; i++) if (t >= pl[i].start - LEAD) k = i;
    const cur = pl[k];
    const a = camParams(S, cur, t);
    if (k > 0) {
      const u = (t - (cur.start - LEAD)) / PAN;
      if (u < 1) {
        const b = camParams(S, pl[k - 1], t), e = eio(u), arc = Math.sin(Math.PI * e);
        const m = {};
        for (const key of Object.keys(a)) m[key] = lerp(b[key], a[key], e);
        m.D = m.D + arc * 7; m.ty = m.ty + arc * 2.2; m.theta = m.theta + arc * 0.03; m.psi = m.psi + Math.sin(e * Math.PI * 2) * 0.05;
        m.ppu = lerp(b.ppu, a.ppu, e) * (1 - arc * 0.05);
        return makeCam(S, m);
      }
    }
    return makeCam(S, a);
  }

  // ---- world drawing (stage) --------------------------------------------------------------------------------------
  function drawWorld(ctx, S, t) {
    const hz = clamp(CAM.hz, 0, S.H);
    drawSky(ctx, t);
    // The sea plane below the horizon, fogged to the horizon colour, drawn under the far headlands.
    const w = TH.w, g = ctx.createLinearGradient(0, hz, 0, S.H);
    g.addColorStop(0, css(TH.fog)); g.addColorStop(0.25, css(mixc(TH.fog, w.seaDeep, 0.3))); g.addColorStop(1, css(mixc(TH.fog, w.seaDeep, 0.7)));
    ctx.fillStyle = g; ctx.fillRect(0, hz - 1, S.W, S.H - hz + 1);
    const wd = world();
    TH.fogMax = 0.8;
    put(wd.ridgeA, 0, 0, 0, { bias: 50 }); put(wd.ridgeB, 0, 0, 0, { bias: 40 });
    TH.fogMax = 0.82;
    flush(ctx, QU);
    drawSea(ctx, t);
    for (const isl of wd.list) shoreFoam(isl, t);
    ripples(t);
    flush(ctx, FQ);
    for (const isl of wd.list) drawIsland(isl, t);
    drawBoats(ctx, t);
    drawGulls(t);
    drawFish(t);
    flush(ctx, QU);
  }
  function ripples(t) {
    // Sea stacks and slot islands send slow rings across the water.
    const wd = world();
    for (const q of wd.list) {
      if (q.PH > 4 && q.H < 1) ripple(q.x, q.z, q.R * 1.1, t * 0.28 + q.seed * 0.13, 0.35);
    }
  }

  // ---- scene wrapper ------------------------------------------------------------------------------------------------
  const FRAME = { labels: [] };
  function wrap(fn) {
    return (ctx, S, box, p, d, info) => {
      if (!CAM || !TH) return;
      const exit = info.exit || 0;
      const t = info.t;
      const build = exit > 0 ? 1 - eio(clamp((exit - 0.25) / 0.75)) : clamp(0.28 + 0.72 * (info.local + 0.05) / Math.max(0.9, info.hold * 0.42));
      const R = { S, th: TH, p, b: build, t, local: info.local, hold: info.hold, exit, box, d: d || {}, L: layout(R_ID.cur, S) };
      QU.length = 0;
      FRAME.labels = [];
      RT.list = QU;
      fn(ctx, S, R);
      flush(ctx, QU);
      RT.list = FQ;
      for (const job of FRAME.labels) job(ctx);
      if (!exit) { motes(ctx, S, t); }
    };
  }
  const R_ID = { cur: "title" };
  const WIPE_LEAD = 0.34;
  function scene(id, fn) {
    return (ctx, S, box, p, d, info) => {
      R_ID.cur = id;
      wrap(fn)(ctx, S, box, p, d, info);
      if (!info.exit && S.paint) {
        // The shard wipe starts WIPE_LEAD before the boundary, over the outgoing camera move, and runs on into the new scene.
        const pl = plan(), idx = pl.findIndex((e) => e.id === id);
        shardWipe(ctx, S, idx > 0 ? info.local + WIPE_LEAD : info.local, info.change);
        if (idx >= 0 && idx < pl.length - 1 && info.local > info.hold - WIPE_LEAD) shardWipe(ctx, S, info.local - (info.hold - WIPE_LEAD), info.change);
        finishPass(ctx, S, info.t);
      }
    };
  }
  const later = (job) => FRAME.labels.push(job);

  // ======================================================================================================================
  // Scene props
  // ======================================================================================================================
  function beacon(R, x, z, big, lit, bld) {
    const { t, th } = R, y0 = 1.0;
    const tower = PB("tower"), band = PB("band"), gallery = PB("gallery"), roof = PB("roof"), lamp = PB("lamp");
    const sw = Math.sin(t * 0.9) * 0.02;
    put(tower, x, y0, z, { build: bld, seed: 3, mat: th.mats[6], mat2: th.mats[5], spread: 6 });
    put(band, x, y0 + 2.6, z, { build: bld, seed: 4, mat: th.acc, mat2: th.acc });
    put(band, x, y0 + 5.4, z, { build: bld, seed: 5, mat: th.acc, mat2: th.acc, sc: 0.8 });
    put(gallery, x, y0 + 8.6, z, { build: bld, seed: 6, mat: th.mats[9], mat2: th.mats[3] });
    put(lamp, x, y0 + 9.6, z, { build: bld, seed: 7, mat: [255, 226, 150], emit: 0.6 + 0.25 * Math.sin(t * 5), glow: [255, 236, 170], yaw: t * 0.9 });
    put(roof, x, y0 + 11.1, z, { build: bld, seed: 8, mat: th.acc, mat2: th.accHi });
    // The island base: a stone plinth.
    put(PB("plinth"), x, y0 - 0.1, z, { build: bld, seed: 2 });
    if (bld > 0.6 && lit) {
      const a = t * 0.9 + (R.id === "closing" ? 1.2 : 0), len = 70, lampY = y0 + 9.65;
      for (let k = 0; k < 2; k++) {
        const ang = a + k * Math.PI;
        const dx = Math.sin(ang), dz = Math.cos(ang);
        const p0 = scr(x, lampY, z);
        let p1 = null;
        for (const ln of [len, 40, 20, 10]) { p1 = scr(x + dx * ln, lampY - 4 * ln / len, z + dz * ln); if (p1) break; }
        if (p0 && p1) later((ctx) => beam(ctx, R.S, p0, p1, bld, k));
      }
    }
    // Lantern shards orbit the lamp.
    for (let k = 0; k < 8; k++) {
      const a = t * (0.9 + 0.1 * (k % 3)) + k * (TAU / 8), r = 2.4 + 0.5 * Math.sin(t * 1.3 + k);
      put(PB("shard"), x + Math.cos(a) * r, y0 + 9.6 + Math.sin(a * 1.7 + k) * 1.2, z + Math.sin(a) * r, { build: bld, seed: 20 + k, yaw: a * 2, rz: a, emit: 0.35, glow: [255, 236, 190], mat: k % 2 ? th.acc : th.mats[7], sc: 0.8 });
    }
  }
  function beam(ctx, S, a, b, bld, k) {
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    const sp = 0.0 + S.H * 0.16;
    // The beam dims as it swings toward the headline side, so it never cuts through the title.
    bld *= clamp((dx / len + 0.25) / 0.55);
    if (bld <= 0.01) return;
    const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
    g.addColorStop(0, `rgba(255,244,200,${0.7 * bld})`); g.addColorStop(0.3, `rgba(255,226,170,${0.28 * bld})`); g.addColorStop(1, "rgba(255,226,170,0)");
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0] + nx * sp, b[1] + ny * sp); ctx.lineTo(b[0] - nx * sp * 0.25, b[1] - ny * sp * 0.25); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  const PB_CACHE = {};
  function PB(name) {
    if (PB_CACHE[name]) return PB_CACHE[name];
    let m;
    switch (name) {
      case "tower": m = prism(8, 1.7, 1.05, 8.6, -1, -1, TAU / 16); m.f.forEach((f) => { if (f[3] === -1) f[3] = -1; }); break;
      case "band": m = prism(8, 1.52, 1.5, 0.62, -1, -1, TAU / 16); break;
      case "gallery": m = prism(8, 1.9, 1.7, 0.6, -2, -1, TAU / 16); break;
      case "lamp": m = bipyramid(6, 0.95, 1.1, 0.7, -1); break;
      case "roof": m = prism(8, 1.35, 0.05, 1.6, -1, -1, TAU / 16); break;
      case "plinth": m = prism(8, 3.4, 2.6, 0.9, 3, 4, TAU / 16); break;
      case "shard": m = bipyramid(3, 0.2, 0.55, 0.55, -1); break;
      default: m = box(1, 1, 1, 3);
    }
    return (PB_CACHE[name] = m);
  }
  // In-beacon materials: -1 resolved to o.mat, -2 to o.mat2.
  function hexColumn() {
    if (PB_CACHE.column) return PB_CACHE.column;
    const n = 6, rings = [[0, 1.08], [0.34, 0.96], [0.67, 1.0], [1, 0.9]], v = [], f = [];
    rings.forEach(([y, r], k) => { for (let i = 0; i < n; i++) { const a = (i / n) * TAU + 0.2 + (hash(i, k, 71) - 0.5) * 0.14; v.push([Math.cos(a) * r, y, Math.sin(a) * r]); } });
    const top = v.length; v.push([0, 1.02, 0]);
    for (let k = 0; k < rings.length - 1; k++) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, a = k * n + i, b = k * n + j, c = (k + 1) * n + j, d = (k + 1) * n + i, s = 0.82 + ((i + k) % 3) * 0.1 + (k % 2) * 0.06;
        f.push([a, b, c, -1, s], [a, c, d, -1, s]);
      }
    }
    for (let i = 0; i < n; i++) f.push([3 * n + i, 3 * n + (i + 1) % n, top, -2, 1.08]);
    return (PB_CACHE.column = { v, f, cy: 0.5 });
  }

  // ---- title / closing ----------------------------------------------------------------------------------------------
  function heroScene(id) {
    return (ctx, S, R) => {
      const { t, th } = R, [sx, sz] = SLOT[id];
      const bld = id === "title" ? lerp(0.5, 1, clamp(R.p)) : lerp(0.45, 1, clamp(R.p * 1.1));
      R.id = id;
      const b2 = R.exit > 0 ? R.b : bld;
      blob(ctx, sx + 0.6, 1.1, sz + 3, 6, 0.28);
      beacon(R, sx + 0.6, sz + 3, 1, true, b2);
      // Rising sparks lift off the lamp and fade out into the sky.
      const sparks = id === "closing" ? 26 : 14;
      for (let k = 0; k < sparks; k++) {
        const f = fract(t * (0.22 + hash(k, 1, 93) * 0.2) + hash(k, 2, 93));
        const x = sx + 0.6 + (hash(k, 3, 93) - 0.5) * 8 * (0.4 + f), y = 10.6 + f * 16, z = sz + 3 + (hash(k, 4, 93) - 0.5) * 6;
        put(PB("shard"), x, y, z, { build: b2, seed: k, yaw: t * 2 + k, rz: t + k, emit: 0.5, glow: [255, 236, 190], mat: k % 3 ? th.acc : th.mats[7], sc: 0.6 * (1 - f * 0.7) });
      }
    };
  }

  // ---- chart --------------------------------------------------------------------------------------------------------
  // Headline band: value tags never rise into it.
  const tagFloor = (S, size) => (S.tall ? 0.235 : 0.2) * S.H + size * 0.8;
  function chartScene(ctx, S, R) {
    const { d, t, th, L, b } = R, n = L.n, max = Math.max(...d.values, 1), col = hexColumn();
    const u = S.u, hold = Math.max(1, R.hold), loc = R.local;
    // Each pillar rises in turn and its number counts up with it; then the highlighted one flares.
    const gap = Math.min(0.15, 0.6 / Math.max(1, n)), dur = Math.max(0.55, hold * 0.24);
    const start = (i) => hold * (0.05 + i * gap);
    const allDone = start(n - 1) + dur;
    d.values.forEach((value, i) => {
      const gq = clamp((loc - start(i)) / dur), g = eo(gq);
      const x = L.sx + (i - (n - 1) / 2) * L.sp, z = L.sz;
      const hot = i === d.highlight;
      const hgt = Math.max(0.6, L.hMax * (value / max) * g) + 0.25;
      const bob = Math.sin(t * 1.3 + i * 1.1) * 0.08;
      const flare = hot ? Math.sin(Math.PI * seg(loc, allDone, allDone + 0.8)) : 0;
      const rising = gq > 0 && gq < 1 ? 1 : 0;
      const gl = hot ? 0.16 + 0.08 * Math.sin(t * 3) + 0.4 * flare : 0.05 * rising;
      put(col, x, -0.25 + bob, z, { sx: L.rc * (1 + 0.08 * flare), sz: L.rc * (1 + 0.08 * flare), sy: hgt, mat: hot ? th.acc : th.mats[3], mat2: hot ? th.accHi : th.mats[1], emit: gl, glow: [255, 220, 190], yaw: i * 0.5 + t * 0.03, seed: 7 * i, build: b > 0.02 ? Math.min(1, b * 3) : 0, mul: hot ? 1.05 : 1 });
      ripple(x, z, L.rc * 1.15, t * 0.42 + i * 0.27, 0.55);
      // A splash ring while it rises.
      if (gq > 0 && gq < 1) ripple(x, z, L.rc * 1.1, gq * 0.98, 0.9);
      else ripple(x, z, L.rc * 1.15, t * 0.42 + i * 0.27 + 0.5, 0.35);
      const topY = hgt - 0.25 + bob;
      // Chips spray off the top as it rises; the highlight keeps a small orbit of shards around its crown.
      if (rising) for (let k = 0; k < 4; k++) { const f = fract(loc * 1.6 + k * 0.25), a = k * 1.9 + i; put(PB("shard"), x + Math.cos(a) * (0.6 + f * 2), topY + f * 1.6, z + Math.sin(a) * (0.6 + f * 2), { yaw: a + loc * 4, rz: a, sc: 0.7 * (1 - f), emit: 0.3, glow: [255, 236, 200], mat: hot ? th.accHi : th.mats[6] }); }
      if (hot && gq >= 1) for (let k = 0; k < 5; k++) { const a = t * 1.3 + k * 1.256, r = L.rc * 1.5 + flare * 1.2; put(PB("shard"), x + Math.cos(a) * r, topY - 0.6 + Math.sin(a * 2) * 0.4, z + Math.sin(a) * r, { yaw: a, rz: a, sc: 0.6, emit: 0.4, glow: [255, 236, 200], mat: th.mats[6] }); }
      const size = (hot ? 112 : 100) * u;
      const top = scr(x, topY + 0.9, z), bot = scr(x, 0, z);
      const label = d.labels[i] || "";
      const aOut = R.exit ? 1 - clamp(R.exit * 2.5) : 1;
      if (top && b > 0.05) later((c) => {
        const y = Math.max(top[1] - 62 * u, tagFloor(S, size));
        tag(c, S, M_.formatNumber(value * g, 0, d.prefix, d.suffix), top[0], y, size, { kind: hot ? "accent" : "light", q: clamp((b - 0.28 - i * 0.05) / 0.25), scale: 1 + 0.14 * flare + 0.06 * rising, font: FONT, weight: 800, pad: 0.4, alpha: aOut });
      });
      if (bot && label && b > 0.05) later((c) => tag(c, S, label, bot[0], bot[1] + 62 * u, 48 * u, { kind: "dark", q: clamp((b - 0.3 - i * 0.06) / 0.3), alpha: aOut }));
    });
  }
  const M_ = window.DreamcutMotion;

  // ---- object (a floating slab-laptop with callouts) ---------------------------------------------------------
  function objectScene(ctx, S, R) {
    const { d, t, th, L, p, b } = R, u = S.u, phone = d.kind === "phone";
    const gx = L.sx, gz = L.sz + 1, gy = 4.2 + Math.sin(t * 1.1) * 0.28, gyaw = Math.sin(t * 0.55) * 0.2 + 0.03;
    const y0 = 1.0;
    blob(ctx, gx, y0 + 0.1, gz, 6.8, 0.3 * clamp(b * 2));
    const W = phone ? 4.6 : 10, Hh = phone ? 9 : 6.4, depth = phone ? 0.5 : 0.34;
    let sc, rx;
    const place = (lx, ly, lz) => { const [dx, dz] = rotXZ(gyaw, lx, lz); return [gx + dx, gy + ly, gz + dz]; };
    const bd = Math.min(1, b * 1.4);
    let corners;
    const body = box(W, Hh, depth, -1, true);
    const rim = (phone ? 0.34 : 0.4);
    if (phone) {
      put(body, ...place(0, 2.5, 0), { yaw: gyaw, mat: th.mats[9], build: bd, seed: 2, mul: 1 });
      rx = 0;
      const half = [W / 2 - rim, Hh / 2 - rim];
      corners = [[-half[0], half[1]], [half[0], half[1]], [-half[0], -half[1]]].map(([x, y]) => place(x, 2.5 + y, -depth / 2 - 0.02));
    } else {
      // Deck and hinged screen: the screen leans back a little.
      put(box(W, 0.34, 6.2, -1), ...place(0, 0, 0), { yaw: gyaw, mat: th.mats[3], build: bd, seed: 3 });
      put(box(W * 0.62, 0.05, 2.2, 4), ...place(0, 0.36, -0.9), { yaw: gyaw, build: bd, seed: 4 });
      rx = 0.2;
      const hy = 0.34, hz = 3.0, ca = Math.cos(rx), sa = Math.sin(rx);
      const sp = (lx, ly, lz) => place(lx, hy + (Hh / 2) * ca + ly * ca - lz * sa, hz + (Hh / 2) * sa + ly * sa + lz * ca);
      put(box(W, Hh, depth, -1, true), ...sp(0, 0, 0), { yaw: gyaw, rx, mat: th.mats[9], build: bd, seed: 5 });
      const half = [W / 2 - rim, Hh / 2 - rim];
      corners = [[-half[0], half[1]], [half[0], half[1]], [-half[0], -half[1]]].map(([x, y]) => sp(x, y, -depth / 2 - 0.02));
    }
    // The screen is drawn after the solids, mapped onto the front face.
    const sw = 920, sh = phone ? 1900 : 596;
    const tl = scr(...corners[0]), tr = scr(...corners[1]), bl = scr(...corners[2]);
    const aff = tl && tr && bl ? { a: (tr[0] - tl[0]) / sw, b: (tr[1] - tl[1]) / sw, c: (bl[0] - tl[0]) / sh, d: (bl[1] - tl[1]) / sh, e: tl[0], f: tl[1] } : null;
    const screenPt = (lx, ly) => aff ? [aff.e + aff.a * lx + aff.c * ly, aff.f + aff.b * lx + aff.d * ly] : null;
    // Floating accents around the device.
    const accents = [];
    for (let k = 0; k < 6; k++) { const a = t * 0.8 + k * 1.05, r = 7.2 + 0.6 * Math.sin(t + k); accents.push([gx + Math.cos(a) * r, gy + 2 + Math.sin(a * 1.3) * 1.5, gz + Math.sin(a) * r * 0.5 - 2, a, k]); }
    for (const [x, y, z, a, k] of accents) put(PB("shard"), x, y, z, { build: bd, seed: 40 + k, yaw: a * 2, rz: a, emit: 0.25, glow: [255, 236, 190], mat: k % 2 ? th.acc : th.mats[7], sc: 1.1 });
    flush(ctx, QU);
    if (aff && bd > 0.5) {
      ctx.save();
      ctx.globalAlpha = clamp((bd - 0.5) * 3);
      ctx.setTransform(aff.a, aff.b, aff.c, aff.d, aff.e, aff.f);
      screenFace(ctx, S, th, t, sw, sh, phone, R);
      ctx.restore();
    }
    // Callouts: dots on the screen, leaders out to flat tags.
    const SB = slideBeat(R);
    // Callout 2 rides on the proposed clip as it slides into the timeline.
    const anchors = phone ? [[460, 520], [520, 1180], [230, 1560]] : [[700, 170], [496 + (1 - SB.k) * 102, 467 - (1 - SB.k) * 194 - SB.lift * 26], [180, 520]];
    const tagsAt = phone || S.tall
      ? [[R.box.x + R.box.w * 0.5, R.box.y + R.box.h * 0.69], [R.box.x + R.box.w * 0.5, R.box.y + R.box.h * 0.8], [R.box.x + R.box.w * 0.5, R.box.y + R.box.h * 0.91]]
      : [[R.box.x + R.box.w * 0.7, R.box.y + R.box.h * 0.2], [R.box.x + R.box.w * 0.7, R.box.y + R.box.h * 0.5], [R.box.x + R.box.w * 0.7, R.box.y + R.box.h * 0.8]];
    anchors.forEach((an, i) => {
      const q = clamp((b - 0.25 - i * 0.12) / 0.4), label = d.callouts[i];
      const a = screenPt(an[0], an[1]);
      if (!a || !label || q <= 0) return;
      const [tx, ty] = tagsAt[i], wide = !(phone || S.tall);
      later((c) => {
        c.save();
        c.globalAlpha = R.exit ? 1 - clamp(R.exit * 2.5) : 1;
        const pts = wide ? [a, [lerp(a[0], tx, 0.55), a[1]], [tx - 20 * u, ty]] : [a, [a[0], lerp(a[1], ty, 0.6)], [tx, ty - 42 * u]];
        leader(c, S, pts, seg(q, 0, 0.6), "rgba(14,8,40,0.5)", 7 * u);
        leader(c, S, pts, seg(q, 0, 0.6), css(i === 1 ? th.accHi : [255, 247, 232]), 3.4 * u);
        const bead = pointOn(pts, fract(t * 0.45 + i * 0.33));
        c.fillStyle = css(th.mats[6]); c.beginPath(); c.arc(bead[0], bead[1], 5 * u, 0, TAU); c.fill();
        const pulse = 1 + 0.35 * Math.sin(t * 4 + i);
        c.fillStyle = css(th.acc); c.beginPath(); c.arc(a[0], a[1], 12 * u * pulse * seg(q, 0, 0.2), 0, TAU); c.fill();
        c.fillStyle = "#fff"; c.beginPath(); c.arc(a[0], a[1], 5 * u * seg(q, 0, 0.2), 0, TAU); c.fill();
        c.restore();
        tag(c, S, label, tx, ty, 46 * u, { align: wide ? "l" : "c", kind: i === 1 ? "accent" : "light", q: seg(q, 0.45, 0.95), scale: i === 1 ? 1 + 0.16 * SB.flash : i === 0 ? 1 + 0.1 * Math.sin(Math.PI * SB.wipe) : 1, alpha: R.exit ? 1 - clamp(R.exit * 2.5) : 1 });
      });
    });
  }
  // The proposed clip lifts off, slides into its slot on the timeline, lands with a flash and the preview re-renders.
  function slideBeat(R) {
    const hold = Math.max(1, R.hold), loc = R.local, s0 = hold * 0.32, s1 = hold * 0.56;
    const k = eio(seg(loc, s0, s1)), flash = loc > s1 ? 1 - seg(loc, s1, s1 + 0.7) : 0;
    return { k, flash, wipe: seg(loc, s1, s1 + 0.9), lift: Math.sin(Math.PI * seg(loc, s0, s1)) };
  }
  // The device's screen: a miniature low-poly picture and an editing timeline with a moving playhead.
  function screenFace(ctx, S, th, t, w, h, phone, R) {
    const w0 = th.w, SB = slideBeat(R);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    const bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, "#1a1f55"); bg.addColorStop(1, "#0e1038");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    const px = 36, py = 34, pw = w - 72, ph = phone ? 560 : 290;
    ctx.save(); ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();
    const sky = ctx.createLinearGradient(0, py, 0, py + ph);
    sky.addColorStop(0, css(rgb(w0.sky[1]))); sky.addColorStop(0.7, css(rgb(w0.sky[2]))); sky.addColorStop(1, css(rgb(w0.sky[3])));
    ctx.fillStyle = sky; ctx.fillRect(px, py, pw, ph);
    // Preview picture: a faceted sunset, mountains and sea, with cloud triangles sliding by.
    const sunx = px + pw * (0.7 + 0.03 * Math.sin(t)), suny = py + ph * 0.5;
    ctx.fillStyle = css(rgb(w0.sun)); ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; ctx.lineTo(sunx + Math.cos(a) * ph * 0.14, suny + Math.sin(a) * ph * 0.14); } ctx.fill();
    for (let k = 0; k < 4; k++) { const cx = px + ((((k * 260 - t * 24) % (pw + 200)) + pw + 200) % (pw + 200)) - 100; ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.moveTo(cx - 60, py + ph * (0.2 + 0.1 * k % 0.4) + 14); ctx.lineTo(cx - 20, py + ph * (0.2 + 0.1 * k % 0.4) - 14); ctx.lineTo(cx + 24, py + ph * (0.2 + 0.1 * k % 0.4) - 8); ctx.lineTo(cx + 60, py + ph * (0.2 + 0.1 * k % 0.4) + 14); ctx.fill(); }
    const peaks = [[0, 0.74], [0.18, 0.46], [0.34, 0.66], [0.52, 0.5], [0.7, 0.72], [0.86, 0.55], [1, 0.7]];
    ctx.fillStyle = css(rgb(w0.rock)); ctx.beginPath(); ctx.moveTo(px, py + ph); peaks.forEach(([x, y]) => ctx.lineTo(px + pw * x, py + ph * y)); ctx.lineTo(px + pw, py + ph); ctx.fill();
    ctx.fillStyle = css(rgb(w0.rockDark)); ctx.beginPath(); ctx.moveTo(px, py + ph); peaks.forEach(([x, y], i) => { if (i % 2) { ctx.lineTo(px + pw * x, py + ph * y); ctx.lineTo(px + pw * (x + 0.07), py + ph * (y + 0.2)); } }); ctx.lineTo(px + pw, py + ph); ctx.fill();
    ctx.fillStyle = css(mixc(rgb(w0.seaDeep), rgb(w0.seaShallow), 0.4)); ctx.fillRect(px, py + ph * 0.84, pw, ph * 0.16);
    // Once the change lands the preview re-renders: a bright facet band sweeps across and leaves a warmer grade behind.
    if (SB.wipe > 0) {
      const fx = px + pw * (SB.wipe * 1.3 - 0.15);
      ctx.fillStyle = css(th.acc, 0.22); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(fx + 60, py); ctx.lineTo(fx - 60, py + ph); ctx.lineTo(px, py + ph); ctx.closePath(); ctx.fill();
      if (SB.wipe < 1) { ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.beginPath(); ctx.moveTo(fx + 40, py); ctx.lineTo(fx + 90, py); ctx.lineTo(fx - 10, py + ph); ctx.lineTo(fx - 60, py + ph); ctx.closePath(); ctx.fill(); }
      const bx = px + pw * 0.18, by = py + ph * 0.42;
      ctx.fillStyle = css(th.accHi, 0.9 * SB.wipe); ctx.beginPath(); ctx.moveTo(bx, by - 26); ctx.lineTo(bx + 30, by + 18); ctx.lineTo(bx - 30, by + 18); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // Timeline.
    const tracks = phone ? 6 : 3, ty0 = py + ph + 34, th_ = phone ? 96 : 62, gap = phone ? 30 : 16;
    const clips = [[0.0, 0.34, 0], [0.38, 0.22, 1], [0.64, 0.36, 2], [0.08, 0.2, 2], [0.32, 0.4, 0], [0.76, 0.2, 1], [0.0, 0.5, 1], [0.54, 0.4, 0]];
    const cols = [rgb(w0.rock), rgb(w0.teal2), rgb(w0.mossHi)];
    for (let r = 0; r < tracks; r++) {
      const y = ty0 + r * (th_ + gap);
      ctx.fillStyle = "rgba(255,255,255,0.06)"; ctx.fillRect(px, y, pw, th_);
      for (let c = 0; c < 3; c++) {
        const cc = clips[(r * 3 + c) % clips.length], hot = r === 1 && c === 1;
        let x = px + pw * cc[0] + (r * 37 % 90) * (c ? 1 : 0), yy = y;
        const cw = pw * cc[1] * 0.9;
        if (x + cw > px + pw) continue;
        if (hot) {
          // The empty slot waits as a dashed outline until the clip drops in.
          ctx.save(); ctx.setLineDash([14, 10]); ctx.lineDashOffset = -t * 40; ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - SB.k)})`; ctx.lineWidth = 3;
          ctx.strokeRect(x, y + 6, cw, th_ - 12); ctx.restore();
          yy = y - (1 - SB.k) * (ty0 - py - ph * 0.45) - SB.lift * 26; x += (1 - SB.k) * pw * 0.12;
        }
        ctx.fillStyle = hot ? css(th.acc) : css(cols[cc[2]]); ctx.beginPath(); ctx.moveTo(x, yy + 6); ctx.lineTo(x + cw - 12, yy + 6); ctx.lineTo(x + cw, yy + 18); ctx.lineTo(x + cw, yy + th_ - 6); ctx.lineTo(x, yy + th_ - 6); ctx.closePath(); ctx.fill();
        if (hot) {
          ctx.strokeStyle = `rgba(255,255,255,${0.55 + 0.4 * Math.sin(t * 5)})`; ctx.lineWidth = 4; ctx.stroke();
          if (SB.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${0.7 * SB.flash})`; ctx.fill(); ctx.strokeStyle = css(th.accHi, SB.flash); ctx.lineWidth = 6; ctx.strokeRect(x - 14 * (1 - SB.flash) - 4, yy - 10 * (1 - SB.flash), cw + 28 * (1 - SB.flash) + 8, th_ + 20 * (1 - SB.flash)); }
        }
        ctx.fillStyle = "rgba(255,255,255,0.28)"; ctx.fillRect(x + 12, yy + th_ / 2 - 3, cw * 0.5, 6);
      }
    }
    const headX = px + pw * fract(t * 0.16 + 0.1);
    ctx.fillStyle = "#fff"; ctx.fillRect(headX - 2, py + ph + 14, 4, tracks * (th_ + gap) + 10);
    ctx.beginPath(); ctx.moveTo(headX - 14, py + ph + 8); ctx.lineTo(headX + 14, py + ph + 8); ctx.lineTo(headX, py + ph + 30); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // ---- people --------------------------------------------------------------------------------------------------------
  function figProto(name) {
    if (PROTO["f_" + name]) return PROTO["f_" + name];
    let m;
    switch (name) {
      case "body": m = prism(8, 1.3, 0.82, 2.7, -1, -1, TAU / 16); break;
      case "belt": m = prism(8, 1.12, 1.04, 0.34, -2, -2, TAU / 16); break;
      case "arm": m = prism(5, 0.34, 0.27, 1.7, -1, -1); break;
      case "head": m = octa(0.98, 1, 17, -3, 0.07); break;
      case "eye": m = box(0.2, 0.34, 0.08, th9(), true); break;
      case "cone": m = prism(6, 1.05, 0.06, 1.5, -2, -2); break;
      case "cap": m = prism(8, 1.05, 0.98, 0.42, -2, -2); break;
      case "brim": m = box(1.5, 0.12, 0.9, -2); break;
      case "crest": m = bipyramid(3, 0.22, 1.3, 0.1, -2); break;
      case "bead": m = octa(0.26, 0, 2, -2, 0); break;
      case "stalk": m = box(0.08, 1.2, 0.08, 9, false); break;
      case "pad": m = prism(6, 2.3, 2.1, 0.8, 3, 4, TAU / 12); break;
      default: m = box(1, 1, 1, 3);
    }
    return (PROTO["f_" + name] = m);
  }
  const th9 = () => 9;
  function figure(R, i, x, y, z, hot, hat, p, gs = 0, spin = 0) {
    const { th, t } = R, S = R.S;
    const sway = Math.sin(t * 1.3 + i * 1.7) * 0.12 * (1 - gs), hop = (hot ? Math.abs(Math.sin(t * 2.3 + 0.4)) * 0.35 : Math.max(0, Math.sin(t * 1.1 + i * 2)) * 0.12) + gs * 1.5;
    const cloth = hot ? th.acc : rgb(th.w.cloth[(i * 2 + 1) % th.w.cloth.length]), cloth2 = mixc(cloth, [255, 255, 255], 0.3);
    const skin = rgb(th.w.skin[(i * 3 + 1) % th.w.skin.length]);
    const bld = clamp((p - i * 0.1) / 0.55), yaw = sway + spin;
    const g = { yaw, build: bld, seed: i * 13, mat: cloth, mat2: mixc(cloth, [255, 214, 120], 0.55), mat3: skin };
    put(figProto("pad"), x, y - 0.1, z, { build: bld, seed: i * 5, mat: hot ? th.accHi : th.mats[3] });
    const yb = y + 0.65 + hop;
    blob(R.ctx, x, y + 0.7, z, 2.4, 0.25 * bld);
    const at = (lx, ly, lz) => { const [dx, dz] = rotXZ(yaw, lx, lz); return [x + dx, yb + ly, z + dz]; };
    put(figProto("body"), ...at(0, 0, 0), g);
    put(figProto("belt"), ...at(0, 0.7, 0), g);
    const wave = Math.sin(t * 6) * 0.35, raise = Math.max(hot ? 0.6 : 0, gs);
    put(figProto("arm"), ...at(-1.0, 0.7, 0), { ...g, rz: lerp(0.55 + Math.sin(t * 1.5 + i) * 0.05, 2.3 - Math.sin(t * 6) * 0.2, gs * 0.8) });
    put(figProto("arm"), ...at(1.0, 0.7, 0), { ...g, rz: lerp(-0.55 - Math.sin(t * 1.5 + i) * 0.05, -2.5 + wave, raise) });
    const headBob = Math.sin(t * 1.9 + i) * 0.07;
    const hp = at(0, 3.4 + headBob, 0);
    const hy = yaw + Math.sin(t * 0.9 + i) * 0.25 * (1 - gs);
    put(figProto("head"), ...hp, { ...g, yaw: hy });
    const face = (lx, ly, lz) => { const [dx, dz] = rotXZ(hy, lx, lz); return [hp[0] + dx, hp[1] + ly, hp[2] + dz]; };
    put(figProto("eye"), ...face(-0.34, 0.1, -0.9), { yaw: hy, mat: [30, 20, 60], build: bld, seed: i });
    put(figProto("eye"), ...face(0.34, 0.1, -0.9), { yaw: hy, mat: [30, 20, 60], build: bld, seed: i });
    const hatMat = hot ? th.accHi : rgb(th.w.cloth[(i * 2 + 4) % th.w.cloth.length]);
    const hg = { yaw: hy, build: bld, seed: i * 9, mat: hatMat, mat2: mixc(hatMat, [255, 255, 255], 0.25) };
    const hpAt = (lx, ly, lz) => { const [dx, dz] = rotXZ(hy, lx, lz); return [hp[0] + dx, hp[1] + ly, hp[2] + dz]; };
    switch (hat) {
      case 0: put(figProto("cone"), ...hpAt(0, 0.62, 0), hg); break;
      case 1: put(figProto("cap"), ...hpAt(0, 0.62, 0), hg); put(figProto("brim"), ...hpAt(0, 0.62, -0.75), hg); break;
      case 2: for (let k = -1; k <= 1; k++) put(figProto("crest"), ...hpAt(k * 0.42, 0.76 - Math.abs(k) * 0.12, 0), { ...hg, rz: -k * 0.4 }); break;
      default:
        put(figProto("stalk"), ...hpAt(0, 0.8, 0), { ...hg, mat: [60, 50, 90] });
        put(figProto("bead"), ...hpAt(0, 2.1 + Math.sin(t * 4 + i) * 0.1, 0), { ...hg, mat: th.acc, emit: 0.45 + 0.3 * Math.sin(t * 4 + i), glow: [255, 230, 190] });
    }
    return at(0, 5.6, 0);
  }
  function peopleScene(ctx, S, R) {
    const { d, t, th, L, p, b } = R, u = S.u, n = L.n;
    R.ctx = ctx;
    const hi = Math.min(n - 1, d.highlight);
    // Roll call: each figure in turn hops, throws its arms up and its tag pops forward.
    const hold = Math.max(1, R.hold), step = Math.min(0.17, 0.56 / n) * hold, g0 = hold * 0.3;
    for (let i = 0; i < n; i++) {
      const period = n * step + Math.max(0.7, step * 1.4) + 0.3, ph = R.local < g0 ? -1 : (R.local - g0) % period;
      const gk = ph < 0 ? 0 : seg(ph, i * step, i * step + Math.max(0.7, step * 1.4)), gs = Math.sin(Math.PI * gk), spin = TAU * eio(gk);
      let x, z;
      if (L.rows === 2) {
        const row = i % 2, col = Math.floor(i / 2);
        x = L.sx + (col - (L.cols - 1) / 2) * 5.6 + (row ? 2.6 : -0.2); z = L.sz + 2 + (row ? 4.4 : -2.2);
      } else { x = L.sx + (i - (n - 1) / 2) * 5.6; z = L.sz + 2 + Math.abs(i - (n - 1) / 2) * 0.5 - 1.8; }
      const hot = i === hi, top = figure(R, i, x, 1.0, z, hot, i % 4, clamp(b * 1.1), gs, spin);
      const pt = scr(top[0], top[1] + 0.2 + gs * 0.6, top[2]);
      const label = d.badges[i % d.badges.length];
      const q = clamp((b - 0.28 - i * 0.07) / 0.35);
      if (pt && label && q > 0.02) later((c) => tag(c, S, label, pt[0], pt[1] - (30 + (L.rows === 2 && i % 2 === 0 ? 26 : 0)) * u, (L.rows === 2 ? 38 : 46) * u, { kind: hot || gs > 0.5 ? "accent" : "light", q, scale: 1 + 0.2 * gs, rot: Math.sin(Math.PI * 2 * gs) * 0.04, alpha: R.exit ? 1 - clamp(R.exit * 2.5) : 1 }));
    }
  }

  // ---- process -------------------------------------------------------------------------------------------------------
  function processScene(ctx, S, R) {
    const { d, t, th, L, b } = R, u = S.u, n = d.steps.length, tall = S.tall;
    const hold = Math.max(1, R.hold), loc = R.local;
    // Steps light in turn: a pulse runs along the stepping stones, then the next stop flares.
    const gapK = Math.min(0.24, 0.62 / Math.max(1, n - 1));
    const act = (i) => hold * (0.14 + i * gapK);
    const pos = [];
    for (let i = 0; i < n; i++) {
      if (tall) pos.push([L.sx + (i % 2 ? 3.6 : -3.6), L.sz + 8 - i * (16 / Math.max(1, n - 1))]);
      else pos.push([L.sx + (i - (n - 1) / 2) * 9.2, L.sz + (i % 2 ? 1.6 : -1.2)]);
    }
    const allOn = loc > act(n - 1) + 0.4;
    for (let i = 0; i < n - 1; i++) {
      const [x0, z0] = pos[i], [x1, z1] = pos[i + 1], tiles = tall ? 5 : 6;
      const head = seg(loc, act(i) + 0.1, act(i + 1));
      for (let k = 0; k < tiles; k++) {
        const f = (k + 1) / (tiles + 1), x = lerp(x0, x1, f), z = lerp(z0, z1, f);
        const q = clamp((b - 0.2 - i * 0.15 - k * 0.03) / 0.2);
        const run = head > 0 && head < 1 ? Math.max(0, 1 - Math.abs(head - f) * 5) : 0;
        const loop = allOn ? Math.pow(Math.max(0, 1 - Math.abs(fract(t * 0.55 - (i + f) * 0.33) - 0.5) * 5), 2) : 0;
        const lit = head >= f ? 0.35 : 0, pulse = Math.max(run, loop);
        put(figProto("pad"), x, 0.2 + Math.sin(t * 1.5 + k + i) * 0.05 + run * 0.35, z, { sc: 0.28, sy: 0.4, build: q, seed: k, mat: lit ? mixc(th.mats[3], th.acc, 0.45) : th.mats[3], emit: 0.08 + lit * 0.3 + pulse * 0.6, glow: [255, 228, 180], mul: 1 + pulse * 0.2 });
        if (pulse > 0.12) put(figProto("pad"), x, 0.25 + run * 0.35, z, { sc: 0.18, sy: 0.4, build: q, seed: k, mat: th.acc, emit: pulse, glow: [255, 240, 200], bias: -1 });
      }
    }
    const Z = tall ? 1.1 : 1.3;
    pos.forEach(([x, z], i) => {
      const q = clamp((b - i * 0.15) / 0.45), last = i === n - 1;
      const on = seg(loc, act(i), act(i) + 0.3), pop = Math.sin(Math.PI * seg(loc, act(i), act(i) + 0.55));
      put(PB("plinth"), x, -0.2, z, { sc: 1.0, sx: 1.05, sz: 1.05, build: q, seed: i * 3, spread: 5, emit: 0.1 * on + 0.3 * pop, glow: [255, 214, 170] });
      ripple(x, z, 3.5, t * 0.36 + i * 0.3, 0.5);
      if (loc > act(i) && loc < act(i) + 1.1) ripple(x, z, 3.3, seg(loc, act(i), act(i) + 1.1) * 0.99, 0.95);
      const fy = 3.4 + Math.sin(t * 1.3 + i) * 0.22 + pop * 0.5, bq = clamp((q - 0.15) / 0.6);
      blob(ctx, x, 0.9, z, 2.4, 0.28 * bq);
      icon(R, i, x, fy, z, bq, last, Z, on, pop);
      const pt = scr(x, 0.75, z - 3.0), top = scr(x, fy + 2.5 * Z, z);
      const label = d.steps[i], aOut = R.exit ? 1 - clamp(R.exit * 2.5) : 1;
      // The step's name sits on the front of its own stone, right under its object.
      if (pt && label && q > 0.1) later((c) => tag(c, S, label, pt[0], pt[1] + 8 * u, 48 * u, { kind: last && on > 0.5 ? "accent" : "light", q: seg(q, 0.25, 0.75), scale: 1 + 0.1 * pop, alpha: aOut }));
      if (top && q > 0.1) later((c) => tag(c, S, String(i + 1).padStart(2, "0"), top[0], top[1] - 36 * u, 56 * u, { kind: on > 0.5 ? "accent" : "dark", q: seg(q, 0.2, 0.65), scale: 1 + 0.22 * pop, font: FONT, weight: 800, pad: 0.5, alpha: aOut }));
    });
  }
  const ICON = {};
  function icon(R, i, x, y, z, bq, last, Z, on, pop) {
    const { th, t } = R, yaw = t * 0.9 + i;
    const g = { build: bq, seed: i * 31, sc: Z };
    const at = (lx, ly, lz) => [x + lx * Z, y + ly * Z, z + lz * Z];
    const cache = (k, f) => ICON[k] || (ICON[k] = f());
    const glow = 0.12 * on + 0.35 * pop;
    if (last) {
      // Sign-off: a round seal with a raised check mark, pressed down when its step lights.
      const press = on < 1 ? 1.4 * (1 - eo(on)) : 0, gy = Math.sin(t * 0.9 + 1) * 0.32;
      const seal = cache("seal", () => prism(12, 1.75, 1.75, 0.45, -2, -1, TAU / 24)), arm = cache("arm", () => box(1, 0.56, 0.5, -1, true));
      const P0 = (lx, ly, lz) => { const [dx, dz] = rotXZ(gy, lx * Z, lz * Z); return [x + dx, y + press + ly * Z, z + dz]; };
      put(seal, ...P0(0, 0, 0.25), { ...g, yaw: gy, rx: -Math.PI / 2, mat: th.accLo, mat2: th.acc, emit: glow, glow: [255, 220, 190] });
      const arms = [[-0.62, -0.2, 1.25, -0.82], [0.32, 0.18, 2.35, 0.81]];
      for (const [mx, my, len, ang] of arms) put(arm, ...P0(mx, my, -0.35), { ...g, sx: len * Z, sy: Z, sz: Z, rz: ang, yaw: gy, mat: th.mats[6], emit: 0.15 + glow, glow: [255, 250, 235] });
      // A ring of chips bursts out when the stamp lands.
      if (pop > 0) for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU, r = 2 + 3.5 * on; put(PB("shard"), ...at(Math.cos(a) * r, -0.9, Math.sin(a) * r * 0.6), { build: 1, yaw: a + t, rz: a, sc: 0.9 * pop, mat: k % 2 ? th.accHi : th.mats[6], emit: 0.4, glow: [255, 240, 210] }); }
    } else if (i % 2 === 0) {
      const sheet = cache("sheet", () => box(3.0, 0.2, 3.9, -1)), line = cache("line", () => box(1, 0.06, 0.2, -1));
      const fan = 0.2 + 0.25 * pop;
      for (let k = 0; k < 3; k++) put(sheet, ...at(0, k * (0.34 + 0.2 * pop), 0), { ...g, yaw: yaw * 0.4 + (k - 1) * fan, mat: k === 2 ? th.mats[6] : mixc(th.mats[6], th.mats[3], 0.35 + k * 0.1), emit: glow * 0.5 });
      for (let k = 0; k < 3; k++) put(line, ...at(0, 0.92 + 0.4 * pop, -1.0 + k * 0.7), { ...g, yaw: yaw * 0.4 + fan, sx: (1.9 - k * 0.3) * Z, mat: th.acc, emit: glow });
    } else {
      const s = 1 + 0.08 * Math.sin(t * 3) + 0.2 * pop, spike = cache("spike", () => bipyramid(4, 0.55, 2.0, 2.0, -1)), core = cache("core", () => octa(0.8, 1, 3, -1, 0.06));
      for (let k = 0; k < 3; k++) put(spike, ...at(0, 0.3, 0), { ...g, yaw: yaw * (1 + 2 * pop), rx: k === 1 ? Math.PI / 2 : 0, rz: k === 2 ? Math.PI / 2 : 0, sc: Z * s, mat: k === 0 ? th.acc : th.accHi, emit: 0.2 + glow, glow: [255, 232, 190] });
      put(core, ...at(0, 0.3, 0), { ...g, yaw, mat: th.mats[6], emit: 0.5, glow: [255, 244, 210] });
      for (let k = 0; k < 4; k++) { const a = t * 1.8 + k * 1.57; put(PB("shard"), ...at(Math.cos(a) * 2.2, 0.3 + Math.sin(a * 2) * 0.8, Math.sin(a) * 2.2), { ...g, rz: a, yaw: a, mat: th.mats[7], emit: 0.3, glow: [255, 244, 210] }); }
    }
  }

  // ---- compare ----------------------------------------------------------------------------------------------------------
  function mountain(rP, seed, snow) {
    const key = "mtn" + seed;
    if (PROTO[key]) return PROTO[key];
    const rings = [[0, 1], [0.34, 0.8], [0.66, 0.52], [1, 0]], n = 9, v = [], f = [];
    rings.forEach(([y, r], k) => {
      if (k === rings.length - 1) { v.push([(hash(1, seed, 5) - 0.5) * 0.18, y, (hash(2, seed, 5) - 0.5) * 0.18]); return; }
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU + k * 0.3, rr = r * (1 + (hash(i, k, seed) - 0.5) * 0.4); v.push([Math.cos(a) * rr, y + (hash(i, k, seed + 3) - 0.5) * 0.06, Math.sin(a) * rr]); }
    });
    const tip = v.length - 1;
    for (let k = 0; k < 2; k++) for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, a = k * n + i, b = k * n + j, c = (k + 1) * n + j, d = (k + 1) * n + i, s = 0.78 + hash(i, k, seed + 8) * 0.4;
      const mat = k === 0 ? -1 : -2;
      f.push([a, b, c, mat, s], [a, c, d, mat, s * 0.94]);
    }
    for (let i = 0; i < n; i++) f.push([2 * n + i, 2 * n + (i + 1) % n, tip, -3, 0.9 + hash(i, 1, seed) * 0.2]);
    return (PROTO[key] = { v, f, cy: 0.5 });
  }
  function compareScene(ctx, S, R) {
    const { d, t, th, L, b } = R, u = S.u, hold = Math.max(1, R.hold), loc = R.local;
    const max = Math.max(d.leftValue, d.rightValue, 1);
    // Before rises first and counts up, then after; then both summit flags are planted with a burst.
    const win = [[0.05, 0.33], [0.37, 0.62]], plant = hold * 0.66;
    [[d.left, d.leftValue, -1], [d.right, d.rightValue, 1]].forEach(([label, value, side], i) => {
      const gq = seg(loc, hold * win[i][0], hold * win[i][1]), g = eo(gq), x = L.sx + side * L.off, z = L.sz + 1;
      const hgt = Math.max(0.9, L.hMax * (value / max) * g + 0.8), hot = i === 1;
      const pq = seg(loc, plant + i * 0.15, plant + i * 0.15 + 0.5), burst = Math.sin(Math.PI * pq);
      const m = mountain(L.rP, 3 + i * 5);
      put(m, x, -0.2, z, { sx: L.rP, sz: L.rP, sy: hgt + 0.2, build: Math.min(1, b * 3), seed: 11 * i, mat: hot ? th.acc : th.mats[3], mat2: hot ? th.accLo : th.mats[4], mat3: th.mats[6], yaw: i * 0.9 + t * 0.02, spread: 7, emit: (hot ? 0.06 : 0) + 0.25 * burst });
      ripple(x, z, L.rP * 1.0, t * 0.3 + i * 0.4, 0.5);
      if (gq > 0 && gq < 1) {
        ripple(x, z, L.rP * 0.9, gq * 0.98, 0.9);
        for (let k = 0; k < 5; k++) { const f = fract(loc * 1.4 + k * 0.2), a = k * 1.3 + i; put(PB("shard"), x + Math.cos(a) * L.rP * (0.5 + f * 0.6), hgt * (0.7 + f * 0.3), z + Math.sin(a) * L.rP * (0.5 + f * 0.6), { yaw: a + loc * 3, rz: a, sc: 0.8 * (1 - f), emit: 0.3, glow: [255, 236, 200], mat: hot ? th.accHi : th.mats[6] }); }
      }
      if (pq > 0) {
        // The summit flag drops in on its pole and starts to ripple.
        const fy = hgt - 0.2 + (1 - back(pq)) * 2.5;
        put(figProto("stalk"), x, fy, z, { sy: 1.4, mat: [250, 244, 236], build: 1 });
        const wv = Math.sin(t * 5 + i) * 0.35;
        wtri(QU, [x, fy + 1.6, z], [x, fy + 0.9, z], [x + 1.8 * side, fy + 1.25 + wv * 0.2, z + wv], css(hot ? th.acc : th.mats[7]), -2);
        wtri(QU, [x, fy + 1.6, z], [x + 1.8 * side, fy + 1.25 + wv * 0.2, z + wv], [x + 0.9 * side, fy + 1.55 + wv * 0.1, z + wv * 0.5], css(mixc(hot ? th.acc : th.mats[7], [255, 255, 255], 0.3)), -2.1);
        const rr = 2.4 + 2.2 * (pq < 1 ? pq : 0);
        for (let k = 0; k < 6; k++) { const a = t * 1.2 + k * 1.047 + i; put(PB("shard"), x + Math.cos(a) * rr, fy + 1 + Math.sin(a * 1.5) * 0.6, z + Math.sin(a) * rr, { yaw: a, rz: a, sc: 0.8 + 0.5 * burst, emit: 0.35 + 0.3 * burst, glow: [255, 236, 190], mat: hot ? th.accHi : th.mats[7] }); }
        if (pq < 1) ripple(x, z, L.rP * 1.1, pq * 0.98, 1);
      }
      const size = 128 * u;
      const top = scr(x, hgt - 0.2 + 1.8, z), bot = scr(x, 0, z + 3);
      const aOut = R.exit ? 1 - clamp(R.exit * 2.5) : 1;
      if (top && b > 0.05) later((c) => tag(c, S, M_.formatNumber(value * g, 0, d.prefix, d.suffix), top[0], Math.max(top[1] - 74 * u, tagFloor(S, size)), size, { kind: hot ? "accent" : "light", q: clamp((b - 0.3 - i * 0.08) / 0.25), scale: 1 + 0.12 * burst + 0.05 * (gq > 0 && gq < 1 ? 1 : 0), font: FONT, weight: 800, pad: 0.38, alpha: aOut }));
      if (bot && label && b > 0.05) later((c) => tag(c, S, label, bot[0], bot[1] + 66 * u, 50 * u, { kind: "dark", q: clamp((b - 0.32 - i * 0.08) / 0.3), alpha: aOut }));
    });
  }

  // ---- registration -----------------------------------------------------------------------------------------------------
  const WORLD_HEX = "#241c52";
  return {
    bg: "#1b2166", panel: "rgba(255,244,230,0.9)", ink: "#fff6ea", muted: "rgba(255,246,234,0.82)", accent: "#ff6a5c", onAccent: "#2a1646",
    rule: "rgba(255,246,234,0.5)", track: "rgba(255,246,234,0.16)",
    display: FONT, displayWeight: 800, displayTracking: "0.005em", body: FONT, bodyWeight: 600, figures: FONT,
    radius: 6, motion: "rise", change: "fade", kit: { line: 3, fill: "solid", panel: "fill" },
    panelEdge: "rgba(255,246,234,0.4)",
    world: WORLD_DUSK,
    // Headlines set straight on this look's backdrop, where its ink and accent (meant for panels) do not read.
    displayAccent: { original: "#fff8f7", light: "#993832" },
    palettes: {
      // Daylight lagoon, a moonlit night, and a graphite study.
      light: { bg: "#62b2ee", ink: "#14224d", muted: "rgba(20,34,77,0.76)", accent: "#ff5e54", onAccent: "#ffffff", rule: "rgba(20,34,77,0.4)", track: "rgba(20,34,77,0.14)", panel: "rgba(255,255,255,0.92)",
        textShadow: () => "0 0.04em 0 rgba(255,255,255,0.65), 0 0.1em 0.5em rgba(255,255,255,0.7)", world: WORLD_DAY, backdrop: () => "linear-gradient(#62b2ee, #fff6e2)" },
      dark: { bg: "#04061b", ink: "#eef2ff", muted: "rgba(238,242,255,0.8)", accent: "#ff7466", world: WORLD_NIGHT, backdrop: () => "linear-gradient(#04061b, #2b2c80)" },
      mono: { bg: "#17171b", ink: "#f4f4f8", muted: "rgba(244,244,248,0.8)", accent: "#f2f2f6", onAccent: "#1c1c22", world: WORLD_MONO, backdrop: () => "linear-gradient(#17171b, #b4b4bf)" },
    },
    textShadow: () => "0.02em 0.045em 0 rgba(36,22,82,0.55), 0 0.1em 0.45em rgba(22,10,64,0.55)",
    backdrop: () => "linear-gradient(#1b2166, #6a48a8 45%, #ee7b8c 80%, #ffc79c)",
    css: (accent, look) => `#title-scene .kicker { align-self: flex-start; display: inline-flex; align-items: center; gap: 0.6em; color: ${look.ink}; text-shadow: 0 0.12em 0.4em rgba(20,8,60,0.5); }
      #title-scene .kicker::before { content: ""; display: inline-block; width: 0; height: 0; border-left: 0.5em solid transparent; border-right: 0.5em solid transparent; border-bottom: 0.86em solid ${accent}; filter: drop-shadow(0 0.1em 0 rgba(0,0,0,0.25)); }`,
    paint: (ctx, W, H) => { ctx.clearRect(0, 0, W, H); },
    keepArt: true,
    overlap: true,
    stage(ctx, S, info) {
      TH = theme(S); SS = S; INFO = info;
      fillSlots();
      CAM = camAt(S, info.t);
      if (!S.paint) return;
      QU.length = 0; FQ.length = 0;
      drawWorld(ctx, S, info.t);
    },
    scenes: {
      title: scene("title", heroScene("title")),
      chart: scene("chart", chartScene),
      object: scene("object", objectScene),
      people: scene("people", peopleScene),
      process: scene("process", processScene),
      compare: scene("compare", compareScene),
      closing: scene("closing", heroScene("closing")),
    },
  };
});
