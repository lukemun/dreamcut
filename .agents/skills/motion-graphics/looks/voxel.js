// Voxel: a floating voxel diorama. Every element is built from unit cubes in true isometric — three-tone
// faces lit from the upper left, per-edge ambient occlusion, grass-lipped soil skirts, soft ground
// shadows and a tilt-shift finish. Each scene is its own island in one sky: props rain down cube by
// cube, hold with living secondary motion (walkers, waterfalls, blinking windows, hopping cards), then
// lift off in pieces while the camera glides to the next island.
// Frames are pure functions of time: seeded noise only, no clocks.
window.DreamcutMotion.register("voxel", ({ grain, rng }) => {
  const TAU = Math.PI * 2;
  const R3 = 0.8660254;
  const DROP = 0.08, PRE = 0.3;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const mod = (a, n) => ((a % n) + n) % n;
  const ping = (v) => { const m = mod(v, 2); return m < 1 ? m : 2 - m; };
  const hash = (n) => { let x = (n | 0) ^ 0x9e3779b9; x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
  const h3 = (x, y, z) => hash(Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul(z | 0, 83492791));
  const K = (x, y, z) => ((x + 128) * 1024 + (y + 128)) * 1024 + (z + 128);
  const fmt = (v, d) => window.DreamcutMotion.formatNumber(v, 0, (d && d.prefix) || "", (d && d.suffix) || "");

  // ---- colour ------------------------------------------------------------------------------------
  function rgb(value) {
    const s = String(value || "");
    if (s[0] === "#") {
      const h = s.length === 4 ? s.slice(1).split("").map((c) => c + c).join("") : s.slice(1, 7);
      const n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const m = s.match(/rgba?\(([^)]+)\)/);
    return m ? m[1].split(",").slice(0, 3).map(Number) : [128, 128, 128];
  }
  const css = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const shade = (c, k) => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
  const WHITE = [255, 255, 255];

  // Dawn over a mint sky: sage grass, warm loam, coral accent.
  const WORLD = {
    sky: ["#86cde6", "#cbeeee", "#fbf2dc"], sun: "#fff4d2",
    grass: ["#7cc576", "#6cb76a", "#8bd07f"], soil: ["#b27b50", "#9b6844", "#7c5339", "#8f909e"], stone: ["#c6c9d2", "#a9adb9", "#8e93a1"],
    sand: "#efd8a0", water: "#5bc0e6", wood: "#a8724a", leaf: ["#4fae6a", "#3f9b5e", "#69c26f", "#2f8a55"], bloom: ["#ff9ec2", "#ffd166", "#ffffff", "#b69cff"],
    metal: "#d6dbe4", dark: "#394058", white: "#f8f5ee", skin: ["#f3c9a6", "#d39a70", "#9a643f"], shirts: ["#4f86e8", "#f2b43c", "#9b78e6", "#ef7d57", "#e8679a"],
    hats: ["#ff5a5f", "#2f6fd6", "#ffd166", "#7a5ad0", "#f7f1e3"], pants: ["#efe3c6", "#8a6bb8", "#e08a5c", "#6f9f58", "#cfd2de"], lit: "#ffd877", glass: "#5f7fa8", cloud: "#ffffff", cool: "#4a5aa8", ao: "#1d2a4a", plaza: ["#ece4d0", "#ddd3bc"], pot: "#d9774f",
  };

  let TH = null, THK = "";
  function theme(S) {
    const L = S.look, key = [L.bg, S.accent, L.texture, S.W, S.H, L.ink].join("|");
    if (TH && THK === key) return TH;
    const w = { ...WORLD, ...(L.world || {}) };
    const one = (k) => rgb(w[k]), many = (k) => w[k].map(rgb);
    const acc = rgb(S.accent);
    TH = {
      night: !!w.night, sky: many("sky"), sun: one("sun"), grass: many("grass"), soil: many("soil"), stone: many("stone"), sand: one("sand"), water: one("water"),
      wood: one("wood"), leaf: many("leaf"), bloom: many("bloom"), metal: one("metal"), dark: one("dark"), white: one("white"), skin: many("skin"), shirts: many("shirts"),
      hats: many("hats"), pants: many("pants"), lit: one("lit"), glass: one("glass"), cloud: one("cloud"), cool: one("cool"), ao: one("ao"), plaza: many("plaza"), pot: one("pot"),
      acc, accD: shade(acc, 0.72), accL: mix(acc, WHITE, 0.4), ink: L.ink, panelC: rgb(L.panel), onAccent: L.onAccent,
      tex: L.texture ?? 1, u: S.u, mats: new Map(),
    };
    TH.aoA = css(TH.ao, 0.12 + 0.14 * TH.tex);
    TH.aoB = css(TH.ao, 0.07 + 0.08 * TH.tex);
    TH.hiC = TH.night ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.28)";
    TH.litS = css(TH.lit); TH.glassS = css(TH.glass); TH.glassS2 = css(shade(TH.glass, 0.8));
    THK = key;
    TH.lipM = mat(TH, TH.soil[0], false);
    return TH;
  }
  // Three tones per colour: a sunlit top, a softer left face and a cool shadowed right face.
  function mat(th, c, emit) {
    const k = ((Math.round(c[0]) & 255) << 16 | (Math.round(c[1]) & 255) << 8 | (Math.round(c[2]) & 255)) * 2 + (emit ? 1 : 0);
    let m = th.mats.get(k);
    if (m) return m;
    if (emit) m = { t: css(mix(c, WHITE, 0.15)), l: css(c), r: css(shade(c, 0.88)) };
    else m = { t: css(mix(shade(c, 1.05), th.sun, 0.07)), l: css(mix(shade(c, 0.84), th.cool, 0.08)), r: css(mix(shade(c, 0.66), th.cool, 0.16)) };
    th.mats.set(k, m);
    return m;
  }

  // ---- buffers ------------------------------------------------------------------------------------
  const BUF = {};
  function buf(key, w, h) {
    let c = BUF[key];
    if (!c) c = BUF[key] = document.createElement("canvas");
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return c;
  }
  let NOISE = null;
  function noise() {
    if (NOISE) return NOISE;
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d"), img = g.createImageData(256, 256), r = rng(41);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = r();
      const on = v > 0.5 ? 255 : 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = on; img.data[i + 3] = Math.abs(v - 0.5) * 2 * 120;
    }
    g.putImageData(img, 0, 0);
    return (NOISE = c);
  }

  // ---- the cube ----------------------------------------------------------------------------------
  const view = (ax, ay, s, gx, gy) => { const a = s * R3, b = s * 0.5; return { ox: ax - (gx - gy) * a, oy: ay - (gx + gy) * b, s, a, b }; };
  const proj = (V, x, y, z) => [V.ox + (x - y) * V.a, V.oy + (x + y) * V.b - z * V.s];
  const FP = { Ax: 0, Ay: 0, Bx: 0, By: 0, Cx: 0, Cy: 0, Dx: 0, Dy: 0, Ex: 0, Ey: 0, Fx: 0, Fy: 0, Gx: 0, Gy: 0 };
  function quad(ctx, x1, y1, x2, y2, x3, y3, x4, y4, col, seam) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
    if (seam) { ctx.strokeStyle = col; ctx.stroke(); }
  }
  // An occlusion strip along edge P1–P2, fading toward the opposite edge Q1–Q2.
  function strip(ctx, th, p1x, p1y, p2x, p2y, q1x, q1y, q2x, q2y) {
    let f = 0.44;
    quad(ctx, p1x, p1y, p2x, p2y, p2x + (q2x - p2x) * f, p2y + (q2y - p2y) * f, p1x + (q1x - p1x) * f, p1y + (q1y - p1y) * f, th.aoB, false);
    f = 0.2;
    quad(ctx, p1x, p1y, p2x, p2y, p2x + (q2x - p2x) * f, p2y + (q2y - p2y) * f, p1x + (q1x - p1x) * f, p1y + (q1y - p1y) * f, th.aoA, false);
  }
  // mask: 1 top, 2 right (+x), 4 left (+y). ao bits: 1..8 top edges, 16/32 side bottoms, 64/128 side corners.
  function box(ctx, V, th, x, y, z, w, d, h, m, mask, ao, hi, lipF) {
    const a = V.a, b = V.b, s = V.s;
    const px = V.ox + (x - y) * a, py = V.oy + (x + y) * b - z * s, ez = h * s;
    const Ax = px, Ay = py - ez, Bx = px + w * a, By = py + w * b - ez;
    const Cx = Bx - d * a, Cy = By + d * b, Dx = px - d * a, Dy = py + d * b - ez;
    const Ex = Bx, Ey = By + ez, Fx = Cx, Fy = Cy + ez, Gx = Dx, Gy = Dy + ez;
    FP.Ax = Ax; FP.Ay = Ay; FP.Bx = Bx; FP.By = By; FP.Cx = Cx; FP.Cy = Cy; FP.Dx = Dx; FP.Dy = Dy;
    FP.Ex = Ex; FP.Ey = Ey; FP.Fx = Fx; FP.Fy = Fy; FP.Gx = Gx; FP.Gy = Gy;
    const seam = Math.min(w, d, h) * s > 5;
    if (mask & 4) quad(ctx, Dx, Dy, Cx, Cy, Fx, Fy, Gx, Gy, m.l, seam);
    if (mask & 2) quad(ctx, Bx, By, Cx, Cy, Fx, Fy, Ex, Ey, m.r, seam);
    if (lipF) {
      const L = th.lipM;
      if (mask & 4) quad(ctx, Dx, Dy + (Gy - Dy) * lipF, Cx, Cy + (Fy - Cy) * (lipF + 0.08), Fx, Fy, Gx, Gy, L.l, true);
      if (mask & 2) quad(ctx, Bx, By + (Ey - By) * (lipF + 0.06), Cx, Cy + (Fy - Cy) * lipF, Fx, Fy, Ex, Ey, L.r, true);
    }
    if (mask & 1) quad(ctx, Ax, Ay, Bx, By, Cx, Cy, Dx, Dy, m.t, seam);
    if (ao) {
      if (mask & 1) {
        if (ao & 1) strip(ctx, th, Ax, Ay, Dx, Dy, Bx, By, Cx, Cy);
        if (ao & 2) strip(ctx, th, Ax, Ay, Bx, By, Dx, Dy, Cx, Cy);
        if (ao & 4) strip(ctx, th, Bx, By, Cx, Cy, Ax, Ay, Dx, Dy);
        if (ao & 8) strip(ctx, th, Dx, Dy, Cx, Cy, Ax, Ay, Bx, By);
      }
      if ((mask & 2) && (ao & 16)) strip(ctx, th, Ex, Ey, Fx, Fy, Bx, By, Cx, Cy);
      if ((mask & 4) && (ao & 32)) strip(ctx, th, Gx, Gy, Fx, Fy, Dx, Dy, Cx, Cy);
      if ((mask & 2) && (ao & 64)) strip(ctx, th, Bx, By, Ex, Ey, Cx, Cy, Fx, Fy);
      if ((mask & 4) && (ao & 128)) strip(ctx, th, Dx, Dy, Gx, Gy, Cx, Cy, Fx, Fy);
    }
    if (hi && (mask & 1) && seam) {
      ctx.beginPath(); ctx.moveTo(Dx, Dy); ctx.lineTo(Ax, Ay); ctx.lineTo(Bx, By);
      ctx.strokeStyle = th.hiC; ctx.lineWidth = 1.3 * th.u; ctx.stroke(); ctx.lineWidth = 1;
    }
  }
  function aoBits(occ, x, y, z) {
    return (occ(x - 1, y, z + 1) ? 1 : 0) | (occ(x, y - 1, z + 1) ? 2 : 0) | (occ(x + 1, y, z + 1) ? 4 : 0) | (occ(x, y + 1, z + 1) ? 8 : 0)
      | (occ(x + 1, y, z - 1) ? 16 : 0) | (occ(x, y + 1, z - 1) ? 32 : 0) | (occ(x + 1, y - 1, z) ? 64 : 0) | (occ(x - 1, y + 1, z) ? 128 : 0);
  }
  // A small parallelogram on a face, by face-space fractions. TL, TR, BL corners of the face.
  function facePatch(ctx, tlx, tly, trx, try_, blx, bly, u0, u1, v0, v1, col) {
    const ux = trx - tlx, uy = try_ - tly, vx = blx - tlx, vy = bly - tly;
    quad(ctx, tlx + ux * u0 + vx * v0, tly + uy * u0 + vy * v0, tlx + ux * u1 + vx * v0, tly + uy * u1 + vy * v0,
      tlx + ux * u1 + vx * v1, tly + uy * u1 + vy * v1, tlx + ux * u0 + vx * v1, tly + uy * u0 + vy * v1, col, false);
  }

  // ---- islands -----------------------------------------------------------------------------------
  function makeIsland(th, N, M, seed, o = {}) {
    const r = rng(seed);
    const p1 = r() * TAU, p2 = r() * TAU, p3 = r() * TAU;
    const n = N * M, inside = new Uint8Array(n), water = new Uint8Array(n), res = new Uint8Array(n), pave = new Uint8Array(n), sandy = new Uint8Array(n), used = new Uint8Array(n);
    const ix = (x, y) => y * N + x;
    const In = (x, y) => x >= 0 && y >= 0 && x < N && y < M && inside[ix(x, y)] === 1;
    for (let y = 0; y < M; y++) for (let x = 0; x < N; x++) {
      const dx = (x + 0.5 - N / 2) / (N / 2), dy = (y + 0.5 - M / 2) / (M / 2);
      const ang = Math.atan2(dy, dx);
      const rr = Math.pow(Math.pow(Math.abs(dx), 2.6) + Math.pow(Math.abs(dy), 2.6), 1 / 2.6);
      const lim = 0.97 + 0.05 * Math.sin(3 * ang + p1) + 0.035 * Math.sin(5 * ang + p2) + 0.025 * Math.sin(8 * ang + p3) - h3(x, y, seed) * 0.06;
      if (rr < lim) inside[ix(x, y)] = 1;
    }
    const rect = (list, fn) => { for (const [x0, y0, x1, y1] of list || []) for (let y = Math.max(0, y0); y < Math.min(M, y1); y++) for (let x = Math.max(0, x0); x < Math.min(N, x1); x++) fn(ix(x, y)); };
    rect(o.reserve, (i) => { inside[i] = 1; res[i] = 1; if (o.pave !== false) pave[i] = 1; });
    rect(o.paths, (i) => { if (inside[i] && !pave[i]) sandy[i] = 1; });
    // Distance from the rim, so the soil skirt tapers into a hanging cone.
    const dist = new Int16Array(n), q = [];
    for (let y = 0; y < M; y++) for (let x = 0; x < N; x++) if (In(x, y) && (!In(x - 1, y) || !In(x + 1, y) || !In(x, y - 1) || !In(x, y + 1))) { dist[ix(x, y)] = 1; q.push(x, y); }
    for (let h = 0; h < q.length; h += 2) {
      const x = q[h], y = q[h + 1], dd = dist[ix(x, y)];
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) if (In(nx, ny) && !dist[ix(nx, ny)]) { dist[ix(nx, ny)] = dd + 1; q.push(nx, ny); }
    }
    if (o.pond) for (let y = 0; y < M; y++) for (let x = 0; x < N; x++) {
      const e = Math.pow((x + 0.5 - o.pond[0]) / o.pond[2], 2) + Math.pow((y + 0.5 - o.pond[1]) / o.pond[3], 2);
      if (e < 1 && In(x, y) && dist[ix(x, y)] >= 2 && !res[ix(x, y)]) water[ix(x, y)] = 1;
    }
    let fall = null;
    if (o.fall != null) {
      const fx = Math.round(o.fall);
      for (let y = M - 1; y >= 0; y--) if (In(fx, y) && !res[ix(fx, y)]) { water[ix(fx, y)] = 1; if (In(fx, y - 1) && !res[ix(fx, y - 1)]) water[ix(fx, y - 1)] = 1; fall = { x: fx + 0.5, y: y + 1 }; break; }
    }
    const vox = [], set = new Set(), small = [], casters = [], glows = [];
    const add = (x, y, z, c, ex = {}) => {
      if (set.has(K(x, y, z))) return null;
      const v = { x, y, z, w: ex.w ?? 1, d: ex.d ?? 1, h: ex.h ?? 1, c, emit: !!ex.emit, water: !!ex.water, lip: !!ex.lip, hi: ex.hi !== false };
      vox.push(v); set.add(K(x, y, z)); return v;
    };
    const D = o.depth ?? 5;
    for (let y = 0; y < M; y++) for (let x = 0; x < N; x++) {
      if (!In(x, y)) continue;
      const i = ix(x, y), dd = dist[i];
      if (water[i]) add(x, y, -1, th.water, { h: 0.8, water: true, hi: false });
      else {
        let c;
        if (pave[i]) c = shade(th.plaza[(x + y) & 1], 0.98 + h3(x, y, 2) * 0.04);
        else if (sandy[i]) c = shade(th.sand, 0.95 + h3(x, y, 4) * 0.08);
        else { const g = h3(x, y, seed + 3); c = th.grass[g < 0.5 ? 0 : g < 0.8 ? 1 : 2]; if (dd === 1 && h3(x, y, seed + 9) < 0.4) c = th.grass[2]; }
        add(x, y, 0, c, { lip: !pave[i] });
      }
      const extra = dd >= 3 && h3(x, y, seed + 17) < 0.1 ? 1 + ((h3(x, y, seed + 19) * 3) | 0) : 0;
      for (let z = water[i] ? -2 : -1; z >= -(D + extra); z--) {
        const d = -z;
        if (d <= D && dd < d * 0.9 + h3(x, y, d + seed) * 1.1 - 0.5) break;
        const c = d <= 1 ? th.soil[0] : d <= 2 ? th.soil[h3(x, y, d) < 0.6 ? 0 : 1] : (h3(x, y, d + 40) < 0.22 ? th.soil[3] : th.soil[2]);
        add(x, y, z, shade(c, 0.97 + h3(x, y, d + 5) * 0.06));
      }
    }
    const free = (x, y, rad) => {
      for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
        const xx = x + dx, yy = y + dy;
        if (!In(xx, yy)) return false;
        const i = ix(xx, yy);
        if (res[i] || water[i] || used[i] || sandy[i] || dist[i] < 2 || (o.clear && o.clear(xx, yy))) return false;
      }
      return true;
    };
    const take = (x, y, rad) => { for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) if (In(x + dx, y + dy)) used[ix(x + dx, y + dy)] = 1; };
    const spots = (count, rad, fn) => { for (let k = 0, tries = 0; k < count && tries < 300; tries++) { const x = (r() * N) | 0, y = (r() * M) | 0; if (!free(x, y, rad)) continue; take(x, y, rad); fn(x, y); k++; } };
    spots(o.trees ?? 4, 1, (x, y) => {
      const tall = 2 + (r() < 0.45 ? 1 : 0), blossom = r() < (o.blossom ?? 0.22);
      for (let z = 1; z <= tall; z++) add(x, y, z, th.wood);
      const lc = blossom ? th.bloom[0] : th.leaf[(r() * 3) | 0], z0 = tall + 1;
      for (let dz = 0; dz < 2; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const corner = Math.abs(dx) + Math.abs(dy) === 2;
        if (corner && r() < (dz ? 0.75 : 0.25)) continue;
        add(x + dx, y + dy, z0 + dz, shade(lc, 0.9 + r() * 0.2));
      }
      add(x, y, z0 + 2, shade(lc, 1.06));
      if (r() < 0.6) add(x + (r() < 0.5 ? 1 : -1), y, z0 + 2, shade(lc, 0.96));
      casters.push([x - 1, y - 1, 3, 3, z0 + 1.5]);
    });
    spots(o.rocks ?? 3, 0, (x, y) => { add(x, y, 1, th.stone[(r() * 2) | 0]); if (r() < 0.5) small.push(mk(x + 1, y + 0.2, 1, 0.5, 0.6, 0.4, th.stone[2])); });
    spots(o.bushes ?? 3, 0, (x, y) => { add(x, y, 1, th.leaf[(r() * 4) | 0]); casters.push([x, y, 1, 1, 1]); });
    if (o.lanterns || th.night) spots(o.lanterns ?? 3, 0, (x, y) => {
      small.push(mk(x + 0.41, y + 0.41, 1, 0.18, 0.18, 1.4, th.wood));
      small.push(mk(x + 0.25, y + 0.25, 2.4, 0.5, 0.5, 0.42, th.lit, true));
      glows.push([x + 0.5, y + 0.5, 2.6]);
    });
    function mk(x, y, z, w, d, h, c, emit) { return { small: true, x, y, z, w, d, h, c, emit: !!emit, ph: r() * TAU, sway: 0, k: x + y + z + (w + d + h) / 2 }; }
    for (let k = 0; k < (o.flowers ?? 14); k++) {
      const x = (r() * N) | 0, y = (r() * M) | 0, i = ix(Math.min(N - 1, x), Math.min(M - 1, y));
      if (!In(x, y) || res[i] || water[i] || used[i] || set.has(K(x, y, 1))) continue;
      const f = mk(x + 0.2 + r() * 0.5, y + 0.2 + r() * 0.5, 1, 0.24, 0.24, 0.24, th.bloom[(r() * 4) | 0]); f.sway = 0.05; small.push(f);
    }
    for (let k = 0; k < (o.tufts ?? 16); k++) {
      const x = (r() * N) | 0, y = (r() * M) | 0, i = ix(Math.min(N - 1, x), Math.min(M - 1, y));
      if (!In(x, y) || res[i] || water[i] || used[i] || sandy[i] || set.has(K(x, y, 1))) continue;
      const f = mk(x + 0.3 + r() * 0.4, y + 0.3 + r() * 0.4, 1, 0.13, 0.13, 0.36, shade(th.grass[1], 0.82)); f.sway = 0.07; small.push(f);
    }
    // Static faces and occlusion against the island's own cubes.
    const has = (x, y, z) => set.has(K(x, y, z));
    const low = [], high = [];
    for (const v of vox) {
      v.mask = (has(v.x, v.y, v.z + 1) ? 0 : 1) | (has(v.x + 1, v.y, v.z) ? 0 : 2) | (has(v.x, v.y + 1, v.z) ? 0 : 4);
      if (!v.mask) continue;
      v.ao = aoBits(has, v.x, v.y, v.z);
      v.m = mat(th, v.c, v.emit);
      v.lipF = v.lip && (v.mask & 6) ? 0.4 + h3(v.x, v.y, 5) * 0.16 : 0;
      v.k = v.x + v.y + v.z + (v.w + v.d + v.h) / 2;
      if (v.z === 0 && o.reserve) for (const [x0, y0, x1, y1] of o.reserve) if (v.x >= x0 - 1 && v.x <= x1 && v.y >= y0 - 1 && v.y <= y1) v.dyn = true;
      (v.z <= 0 ? low : high).push(v);
    }
    for (const v of small) v.m = mat(th, v.c, v.emit);
    low.sort((p, q2) => p.k - q2.k);
    const topPath = new Path2D();
    let halfW = 0;
    for (let y = 0; y < M; y++) for (let x = 0; x < N; x++) if (In(x, y)) {
      if (!water[ix(x, y)]) topPath.rect(x, y, 1, 1);
      halfW = Math.max(halfW, Math.abs(x + 0.5 - N / 2 - (y + 0.5 - M / 2)) + 1);
    }
    return { N, M, gx: N / 2, gy: M / 2, low, high, small, set, casters, glows, fall, topPath, halfW, In };
  }

  // ---- scene props --------------------------------------------------------------------------------
  function group() {
    const list = [];
    const c = (x, y, z, col, o = {}) => {
      const unit = o.w == null && o.d == null && o.h == null && Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z);
      const v = { prop: true, x, y, z, w: o.w ?? 1, d: o.d ?? 1, h: o.h ?? 1, c: col, emit: !!o.emit, mf: o.mf || null, deco: o.deco || null, g: o.g || 0, hi: o.hi !== false, unit, t0: 0, lv: 0, ar: 0, lp: 0, on: false, order: o.order };
      list.push(v);
      return v;
    };
    return { list, c };
  }
  // Cubes in each build group rain in bottom-up (or in a given order) across that group's window.
  function timeGroups(list, ranges, seed) {
    const groups = {};
    for (const v of list) (groups[v.g] = groups[v.g] || []).push(v);
    for (const g of Object.keys(groups)) {
      const arr = groups[g], [a, b] = ranges[g] || [0.05, 0.6];
      arr.forEach((v, i) => { v._r = v.order != null ? v.order : v.z + hash(i * 31 + seed + g * 7) * 0.9; });
      arr.sort((p, q) => p._r - q._r);
      const n = arr.length;
      arr.forEach((v, i) => { v.t0 = a + (b - a - DROP) * (n > 1 ? i / (n - 1) : 0); v.lv = 0.5 * hash(i * 13 + Number(g) * 101 + seed); });
    }
  }
  const arrive = (P, a, len = 0.12) => clamp((P - a) / len);

  function renderIsland(ctx, S, th, V, isl, sc, P, L, t) {
    ctx.lineWidth = 1; ctx.lineJoin = "miter";
    const props = sc ? sc.props : null, pmap = sc ? sc.pmap : null;
    if (props) for (const v of props) { v.ar = clamp((P - v.t0) / DROP); v.lp = L > 0 ? clamp((L - v.lv) / 0.5) : 0; v.on = v.ar >= 1 && v.lp <= 0; }
    const set = isl.set;
    const occP = (x, y, z) => { const v = pmap && pmap.get(K(x, y, z)); return !!(v && v.on); };
    const occ = (x, y, z) => set.has(K(x, y, z)) || occP(x, y, z);
    // Pass 1: ground and skirt.
    for (const v of isl.low) {
      let ao = v.ao, m = v.m;
      if (v.dyn && pmap) ao |= (occP(v.x - 1, v.y, 1) ? 1 : 0) | (occP(v.x, v.y - 1, 1) ? 2 : 0) | (occP(v.x + 1, v.y, 1) ? 4 : 0) | (occP(v.x, v.y + 1, 1) ? 8 : 0);
      if (v.water) m = mat(th, mix(th.water, WHITE, Math.round((0.5 + 0.5 * Math.sin(t * 2.4 + v.x * 1.1 + v.y * 0.7)) * 6) / 6 * 0.22), false);
      box(ctx, V, th, v.x, v.y, v.z, v.w, v.d, v.h, m, v.mask, ao, v.hi, v.lipF);
    }
    if (isl.fall) waterfall(ctx, V, th, isl.fall, t);
    // Pass 2: soft shadows on the ground.
    const cs = isl.casters.slice();
    if (sc && sc.casters) sc.casters(cs, t, P, L);
    shadows(ctx, S, th, V, isl, cs);
    // Pass 3: everything standing on the ground, painter-sorted.
    const items = [];
    for (const v of isl.high) items.push(v);
    for (const v of isl.small) items.push(v);
    if (props) for (const v of props) { if (v.ar <= 0 || v.lp >= 1) continue; animProp(v); items.push(v); }
    if (sc && sc.extras) sc.extras((it) => items.push(it), t, P, L, V);
    items.sort((p, q) => p.k - q.k);
    for (const it of items) {
      if (it.draw) { it.draw(ctx, V, th, t); continue; }
      if (it.small) { const sw = it.sway ? Math.sin(t * 2.2 + it.ph) * it.sway : 0; box(ctx, V, th, it.x + sw, it.y - sw * 0.5, it.z, it.w, it.d, it.h, it.m, 7, 0, false); continue; }
      if (it.prop) { drawProp(ctx, V, th, it, occ, t); continue; }
      box(ctx, V, th, it.x, it.y, it.z, it.w, it.d, it.h, it.m, it.mask, it.ao, it.hi);
    }
    for (const g of isl.glows) glow(ctx, V, th, g[0], g[1], g[2], 1, t);
  }
  function animProp(v) {
    let x = v.x, y = v.y, z = v.z, w = v.w, d = v.d, h = v.h, al = 1;
    if (v.ar < 1) { z += 6 * Math.pow(1 - v.ar, 3); al = seg(v.ar, 0, 0.35); }
    if (v.lp > 0) {
      const e = v.lp * v.lp, k = 1 - 0.7 * v.lp;
      x += (1 - k) * w / 2 - e * 2.2; y += (1 - k) * d / 2 - e * 0.8; z += 8 * e;
      w *= k; d *= k; h *= k; al *= 1 - seg(v.lp, 0.6, 1);
    }
    v.ax = x; v.ay = y; v.az = z; v.aw = w; v.ad = d; v.ah = h; v.al = al;
    v.k = x + y + z + (w + d + h) / 2;
  }
  function drawProp(ctx, V, th, v, occ, t) {
    const m = v.mf ? mat(th, v.mf(t, v), v.emit) : v.m;
    let mask = 7, ao = 0;
    if (v.on && v.unit) {
      mask = (occ(v.x, v.y, v.z + 1) ? 0 : 1) | (occ(v.x + 1, v.y, v.z) ? 0 : 2) | (occ(v.x, v.y + 1, v.z) ? 0 : 4);
      if (!mask) return;
      ao = aoBits(occ, v.x, v.y, v.z);
    }
    const fade = v.al < 1;
    if (fade) { ctx.save(); ctx.globalAlpha *= v.al; }
    box(ctx, V, th, v.ax, v.ay, v.az, v.aw, v.ad, v.ah, m, mask, ao, v.hi);
    if (v.deco && v.al > 0.4) v.deco(ctx, th, t, v, mask);
    if (fade) ctx.restore();
  }
  function waterfall(ctx, V, th, f, t) {
    const m = mat(th, mix(th.water, WHITE, 0.25), false), m2 = mat(th, th.water, false);
    ctx.save();
    ctx.globalAlpha *= 0.55;
    box(ctx, V, th, f.x - 0.22, f.y - 0.06, -4.5, 0.44, 0.08, 3.7, m2, 7, 0, false);
    ctx.restore();
    for (let i = 0; i < 16; i++) {
      const ph = mod(t * 0.85 + i / 16, 1), k = 0.42 - ph * 0.18;
      ctx.save();
      ctx.globalAlpha *= 1 - seg(ph, 0.65, 1);
      box(ctx, V, th, f.x - k / 2 + Math.sin(i * 1.7 + t * 3) * 0.1, f.y - 0.04, -0.4 - ph * 9, k, k * 0.6, k, i % 3 ? m : m2, 7, 0, false);
      ctx.restore();
    }
  }
  function glow(ctx, V, th, x, y, z, a, t) {
    const [px, py] = proj(V, x, y, z), r = V.s * (th.night ? 2.6 : 1.4);
    const g = ctx.createRadialGradient(px, py, 0, px, py, r);
    const al = (th.night ? 0.55 : 0.3) * a * (0.85 + 0.15 * Math.sin(t * 3 + x));
    g.addColorStop(0, css(th.lit, al)); g.addColorStop(1, css(th.lit, 0));
    ctx.fillStyle = g; ctx.fillRect(px - r, py - r, r * 2, r * 2);
  }
  // Soft shadows: quarter-resolution, drawn in ground space with the iso matrix, clipped to the grass.
  function shadows(ctx, S, th, V, isl, list) {
    if (!list.length) return;
    const q = 0.25, W = S.W, H = S.H;
    const A = buf("shA", W * q, H * q), B = buf("shB", W * q, H * q);
    const a = A.getContext("2d");
    a.setTransform(1, 0, 0, 1, 0, 0); a.clearRect(0, 0, A.width, A.height);
    a.setTransform(q * V.a, q * V.b, -q * V.a, q * V.b, q * V.ox, q * (V.oy - V.s));
    a.save(); a.clip(isl.topPath);
    a.fillStyle = css(th.ao);
    a.beginPath();
    for (const c of list) {
      const [x0, y0, w, d, h] = c;
      if (h <= 0.01) continue;
      const dx = h * 0.5, dy = h * 0.16;
      a.moveTo(x0, y0); a.lineTo(x0 + w, y0); a.lineTo(x0 + w + dx, y0 + dy); a.lineTo(x0 + w + dx, y0 + d + dy); a.lineTo(x0 + dx, y0 + d + dy); a.lineTo(x0, y0 + d); a.closePath();
    }
    a.fill();
    a.restore();
    const b = B.getContext("2d");
    b.setTransform(1, 0, 0, 1, 0, 0); b.clearRect(0, 0, B.width, B.height);
    b.filter = `blur(${(2.4 * S.u).toFixed(2)}px)`; b.drawImage(A, 0, 0); b.filter = "none";
    ctx.save(); ctx.globalAlpha *= th.night ? 0.34 : 0.22; ctx.drawImage(B, 0, 0, W, H); ctx.restore();
  }

  // ---- characters ---------------------------------------------------------------------------------
  // A cube-kid: a big chamfered head under a bobble hat with a brim, rosy cheeks, a bell-shaped
  // tunic over stubby legs and boots, mitten hands. Faces ±x or ±y; o.k scales, o.walk swings legs.
  function person(push, x, y, z, o) {
    push({ k: x + y + z + 0.75 * (o.k || 1), draw: (ctx, V, th) => drawPerson(ctx, V, th, x, y, z, o) });
  }
  function drawPerson(ctx, V, th, x, y, z, o) {
    const k = o.k || 1, face = o.face || "y", fx = face.endsWith("x"), f = face[0] === "-" ? -1 : 1;
    if ((o.alpha ?? 1) <= 0) return;
    ctx.save();
    ctx.globalAlpha *= o.alpha ?? 1;
    const B = (lat, fw, lz, lw, ld, lh, col) => {
      const m = mat(th, col, false), F = fw * f;
      if (fx) box(ctx, V, th, x + (F - ld / 2) * k, y + (lat - lw / 2) * k, z + lz * k, ld * k, lw * k, lh * k, m, 7, 0, false);
      else box(ctx, V, th, x + (lat - lw / 2) * k, y + (F - ld / 2) * k, z + lz * k, lw * k, ld * k, lh * k, m, 7, 0, false);
    };
    const walking = o.walk != null, wp = o.walk || 0;
    const l1 = walking ? Math.max(0, Math.sin(wp)) * 0.12 : 0, l2 = walking ? Math.max(0, -Math.sin(wp)) * 0.12 : 0, sw = walking ? Math.sin(wp) * 0.08 : 0;
    const wave = o.wave || 0, bz = (o.bob || 0) + (walking ? Math.abs(Math.sin(wp)) * 0.03 : 0);
    const boot = shade(o.pants, 0.55), tunic = o.shirt, hem = shade(o.shirt, 0.86), hat = o.hat, hatL = mix(o.hat, WHITE, 0.45);
    // Far side first so the near side paints over it.
    const arm = (lat, ph, lift) => { B(lat, ph, 0.36 + bz + lift, 0.13, 0.16, 0.28, tunic); B(lat, ph + 0.01, 0.26 + bz + lift, 0.15, 0.18, 0.12, o.skin); };
    arm(-0.37, -sw, o.both ? wave * 0.42 : 0);
    B(-0.13, -sw, l1 + bz, 0.19, 0.3, 0.1, boot);
    B(0.13, sw, l2 + bz, 0.19, 0.3, 0.1, boot);
    B(-0.13, -sw, 0.1 + l1 + bz, 0.17, 0.2, 0.16, o.pants);
    B(0.13, sw, 0.1 + l2 + bz, 0.17, 0.2, 0.16, o.pants);
    B(0, 0, 0.24 + bz, 0.6, 0.42, 0.2, hem);
    B(0, 0, 0.44 + bz, 0.48, 0.34, 0.24, tunic);
    if (f > 0) B(0.1, 0.175, 0.5 + bz, 0.12, 0.02, 0.1, hatL);
    arm(0.37, sw, wave * 0.42);
    // Head: two crossed boxes read as a chamfered, rounder block.
    const hz = 0.66 + bz;
    B(0, 0, hz + 0.05, 0.74, 0.5, 0.4, o.skin);
    B(0, 0, hz, 0.62, 0.62, 0.5, o.skin);
    if (f > 0) {
      B(-0.13, 0.315, hz + 0.2, 0.07, 0.02, 0.15, th.dark); B(0.13, 0.315, hz + 0.2, 0.07, 0.02, 0.15, th.dark);
      B(-0.25, 0.315, hz + 0.1, 0.1, 0.02, 0.06, th.bloom[0]); B(0.25, 0.315, hz + 0.1, 0.1, 0.02, 0.06, th.bloom[0]);
      if (o.smile) B(0, 0.315, hz + 0.08, 0.14, 0.02, 0.04, th.dark);
    }
    B(0, 0, hz + 0.44, 0.8, 0.74, 0.07, hat);
    B(0, -0.02, hz + 0.51, 0.6, 0.56, 0.2, hat);
    B(0, -0.02, hz + 0.6, 0.62, 0.58, 0.05, hatL);
    B(0, -0.02, hz + 0.71, 0.18, 0.18, 0.18, hatL);
    ctx.restore();
  }
  const crew = (th, i, hot) => ({ shirt: hot ? th.acc : th.shirts[i % th.shirts.length], skin: th.skin[(i * 2 + 1) % th.skin.length], hat: hot ? th.hats[1] : th.hats[(i + 2) % th.hats.length], pants: th.pants[(i + 1) % th.pants.length] });

  // ---- plaques ------------------------------------------------------------------------------------
  // A label slab: a flat face over a darker extruded edge, popping in with its text already on it.
  function plaque(ctx, S, th, text, x, y, size, o = {}) {
    const q = o.q ?? 1;
    if (q <= 0.001 || text == null || text === "") return null;
    const u = S.u, figures = o.font === "figures";
    ctx.save();
    ctx.font = `${size}px ${VFONT}`;
    const tw = ctx.measureText(String(text)).width;
    const numW = o.num ? size * 1.35 : 0;
    const padX = size * (figures ? 0.36 : 0.42), pw = Math.round(tw + padX * 2 + numW), ph = Math.round(size * (figures ? 1.18 : 1.4)), ext = Math.round(Math.max(6 * u, size * 0.16));
    const an = o.anchor || "bottom";
    let left = x - pw / 2, top = y - ph - ext;
    if (an === "top") top = y;
    else if (an === "left") { left = x; top = y - ph / 2; }
    else if (an === "right") { left = x - pw; top = y - ph / 2; }
    else if (an === "center") top = y - ph / 2;
    const sc = back(q);
    ctx.translate(x, y); ctx.scale(sc, sc); ctx.translate(-x, -y);
    ctx.globalAlpha *= clamp(q * 3) * (o.alpha ?? 1);
    const hot = !!o.hot, face = hot ? th.acc : th.panelC, side = hot ? th.accD : shade(th.panelC, th.night ? 0.62 : 0.76);
    left = Math.round(left); top = Math.round(top);
    // Hard, tight shadow and a stepped extrusion: a block, not a card.
    ctx.fillStyle = css(th.ao, 0.2); ctx.fillRect(left + ext * 0.7, top + ext * 1.7, pw, ph);
    ctx.fillStyle = css(side); ctx.fillRect(left, top + ext, pw, ph);
    ctx.fillStyle = css(face); ctx.fillRect(left, top, pw, ph);
    ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.fillRect(left, top, pw, Math.max(2, Math.round(4 * u)));
    ctx.fillStyle = css(shade(face, 0.9)); ctx.fillRect(left + pw - Math.max(2, Math.round(5 * u)), top, Math.max(2, Math.round(5 * u)), ph);
    if (o.num) {
      ctx.fillStyle = css(hot ? th.accD : th.acc); ctx.fillRect(left, top, numW, ph);
      ctx.fillStyle = hot ? th.ink : th.onAccent; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(o.num), left + numW / 2, top + ph / 2 + size * 0.05);
    }
    ctx.fillStyle = hot ? th.onAccent : th.ink; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(text), left + numW + (pw - numW) / 2, top + ph / 2 + size * 0.05);
    ctx.restore();
    return { left, top, w: pw, h: ph + ext };
  }
  // A leader made of small cubes, drawn on from the anchor.
  function chain(ctx, S, th, x1, y1, x2, y2, c, alpha) {
    const u = S.u, len = Math.hypot(x2 - x1, y2 - y1), n = Math.max(1, Math.floor(len / (15 * u)));
    const shown = Math.floor(n * clamp(c));
    ctx.save();
    ctx.globalAlpha *= alpha;
    for (let i = 0; i <= shown; i++) {
      const f = i / n, px = x1 + (x2 - x1) * f, py = y1 + (y2 - y1) * f, r = 4.5 * u;
      ctx.fillStyle = css(th.accD); ctx.fillRect(px - r, py - r + 2.5 * u, r * 2, r * 2);
      ctx.fillStyle = css(th.acc); ctx.fillRect(px - r, py - r, r * 2, r * 2);
    }
    ctx.restore();
  }
  function marker(ctx, S, th, x, y, t, alpha) {
    const u = S.u, r = (11 + 3 * Math.sin(t * 4)) * u;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.lineWidth = 4 * u; ctx.strokeStyle = css(th.acc);
    ctx.beginPath(); ctx.moveTo(x, y - r * 0.6); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r * 0.6); ctx.lineTo(x - r, y); ctx.closePath(); ctx.stroke();
    ctx.fillStyle = css(th.acc); ctx.fillRect(x - 4 * u, y - 4 * u, 8 * u, 8 * u);
    ctx.restore();
  }

  // ---- voxel type -------------------------------------------------------------------------------
  // Headlines are set in a blocky display face, rasterised to a coarse grid and rebuilt as raised
  // blocks on a block-outline sign: each cell drops in left to right, and lifts away at the change.
  const VFONT = "Silom, 'Arial Black', Impact, 'Helvetica Neue', sans-serif";
  const EM = 13, ROWS = 18, BASE = 13;
  const VT = new Map();
  function vtype(text, maxCols) {
    const key = text + "|" + maxCols;
    let L = VT.get(key);
    if (L) return L;
    const mc = buf("vtm", 4, 4).getContext("2d");
    mc.font = `${EM}px ${VFONT}`;
    const words = String(text || "").trim().split(/\s+/).filter(Boolean), lines = [];
    let cur = "";
    for (const w of words) { const s2 = cur ? cur + " " + w : w; if (cur && mc.measureText(s2).width + 6 > maxCols) { lines.push(cur); cur = w; } else cur = s2; }
    if (cur) lines.push(cur);
    const out = [];
    let cols = 0;
    for (const line of lines) {
      const w = Math.ceil(mc.measureText(line).width) + 6, h = ROWS;
      const c = buf("vtr", w, h), g = c.getContext("2d");
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
      g.font = `${EM}px ${VFONT}`; g.fillStyle = "#000"; g.textBaseline = "alphabetic"; g.fillText(line, 3, BASE);
      const d = g.getImageData(0, 0, w, h).data, on = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) on[i] = d[i * 4 + 3] >= 118 ? 1 : 0;
      const at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && on[y * w + x] === 1;
      const cells = [], plate = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on[y * w + x]) cells.push([x, y, at(x, y - 1) ? 0 : 1]);
      for (let y = -2; y < h + 2; y++) for (let x = -2; x < w + 2; x++) {
        let hit = false;
        for (let dy = -2; dy <= 2 && !hit; dy++) for (let dx = -2; dx <= 2 && !hit; dx++) if (Math.abs(dx) + Math.abs(dy) <= 3 && at(x + dx, y + dy)) hit = true;
        if (hit) plate.push([x, y]);
      }
      out.push({ cells, plate, w });
      cols = Math.max(cols, w);
    }
    L = { lines: out, cols, n: out.length, pitch: ROWS - 3 };
    VT.set(key, L);
    return L;
  }
  function vdraw(ctx, th, L, x, y, cell, inP, outP, t, seed) {
    if (!L || inP <= 0 || outP >= 1) return;
    const cols = L.cols + 4, ink = rgb(th.ink), D1 = cell * 0.85, D2 = cell * 0.42;
    const plateF = css(th.panelC), plateS = css(shade(th.panelC, th.night ? 0.6 : 0.76)), shadowC = css(th.ao, 0.16);
    const sideC = css(th.acc), faceC = css(ink), hiC = css(mix(ink, WHITE, th.night ? 0.0 : 0.3)), shineC = css(mix(ink, th.night ? th.acc : WHITE, 0.42));
    const sweep = mod(t * 0.42 + seed * 0.37, 2.4) - 0.4;
    const pass = (li, list, lag, fn) => {
      const oy = y + li * L.pitch * cell;
      for (const c of list) {
        const order = ((c[0] + 2) / cols) * 0.62 + hash(c[0] * 131 + c[1] * 17 + li * 977 + seed) * 0.12;
        const a = clamp((inP - order - lag) / 0.26);
        if (a <= 0) continue;
        const e = outP > 0 ? clamp((outP - order * 0.7) / 0.3) : 0;
        if (e >= 1) continue;
        const k = 1 - 0.55 * e, dy = -(1 - eo(a)) * cell * 6 - e * e * cell * 16, dx = e * cell * 3;
        const al = Math.min(seg(a, 0, 0.45), 1 - e);
        const px = x + c[0] * cell + dx + (1 - k) * cell / 2, py = oy + c[1] * cell + dy + (1 - k) * cell / 2;
        if (al < 1) ctx.globalAlpha = al;
        fn(px, py, cell * k, c);
        if (al < 1) ctx.globalAlpha = 1;
      }
    };
    ctx.save();
    L.lines.forEach((ln, li) => pass(li, ln.plate, 0, (px, py, s) => { ctx.fillStyle = shadowC; ctx.fillRect(px + cell * 0.8, py + D1 + cell * 0.9, s + 0.6, s + 0.6); }));
    L.lines.forEach((ln, li) => pass(li, ln.plate, 0, (px, py, s) => { ctx.fillStyle = plateS; ctx.fillRect(px, py + D1, s + 0.6, s + 0.6); }));
    L.lines.forEach((ln, li) => pass(li, ln.plate, 0, (px, py, s) => { ctx.fillStyle = plateF; ctx.fillRect(px, py, s + 0.6, s + 0.6); }));
    L.lines.forEach((ln, li) => pass(li, ln.cells, 0.08, (px, py, s) => { ctx.fillStyle = sideC; ctx.fillRect(px, py + D2, s + 0.6, s + 0.6); }));
    L.lines.forEach((ln, li) => pass(li, ln.cells, 0.08, (px, py, s, c) => {
      const band = Math.abs((c[0] + c[1] * 0.6) / cols - sweep) < 0.035;
      ctx.fillStyle = band ? shineC : faceC; ctx.fillRect(px, py, s + 0.6, s + 0.6);
      if (c[2]) { ctx.fillStyle = hiC; ctx.fillRect(px, py, s + 0.6, s * 0.3); }
    }));
    ctx.restore();
  }
  // A kicker slab: accent block with a hard step under it.
  function kickerSlab(ctx, S, th, text, x, y, q, outP) {
    if (!text || q <= 0 || outP >= 1) return 0;
    const u = S.u, size = 42 * u;
    ctx.save();
    ctx.font = `${size}px ${VFONT}`;
    const tw = ctx.measureText(text).width, pw = Math.round(tw + size * 0.9), ph = Math.round(size * 1.45), ext = Math.round(size * 0.22);
    const sc = back(q) * (1 - 0.3 * outP);
    ctx.translate(x, y + ph / 2); ctx.scale(sc, sc); ctx.translate(-x, -(y + ph / 2));
    ctx.translate(outP * 60 * u, -outP * outP * 120 * u);
    ctx.globalAlpha *= clamp(q * 3) * (1 - outP);
    ctx.fillStyle = css(th.ao, 0.2); ctx.fillRect(x + ext, y + ext * 2, pw, ph);
    ctx.fillStyle = css(th.accD); ctx.fillRect(x, y + ext, pw, ph);
    ctx.fillStyle = css(th.acc); ctx.fillRect(x, y, pw, ph);
    ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.fillRect(x, y, pw, Math.max(2, 4 * u));
    ctx.fillStyle = th.onAccent; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(text, x + size * 0.45, y + ph / 2 + size * 0.06);
    ctx.restore();
    return ph + ext;
  }
  const HEAD_IDS = { title: "title", closing: "closing", chart: "chart-title", object: "object-title", people: "people-title", process: "process-title", compare: "compare-title" };
  function wordsFor(id) {
    const el = typeof document !== "undefined" && HEAD_IDS[id] ? document.getElementById(HEAD_IDS[id]) : null;
    if (el && el.textContent) return el.textContent;
    const c = controls();
    if (!c) return "";
    return id === "title" ? c.title : id === "closing" ? c.closing : c[id + "_title"] || "";
  }
  function kickerWords() {
    const el = typeof document !== "undefined" ? document.getElementById("kicker") : null;
    if (el && el.textContent) return el.textContent;
    const c = controls();
    return (c && c.kicker) || "";
  }
  const HS = new Map();
  function headSpec(S, id) {
    if (!HEAD_IDS[id]) return null;
    const words = wordsFor(id), kick = id === "title" ? kickerWords() : "";
    const key = id + "|" + S.W + "|" + S.H + "|" + words + "|" + kick;
    let h = HS.get(key);
    if (h) return h;
    const u = S.u, tall = S.tall, side = (tall ? 90 : 140) * u;
    if (id === "title" || id === "closing") {
      const px = (tall ? 112 : 120) * u * (id === "closing" ? 0.94 : 1), cell = px / EM;
      const maxW = tall ? S.W - side * 2 : Math.min(S.W * 0.5, 900 * u);
      const L = vtype(words, Math.floor(maxW / cell));
      const kh = kick ? 42 * u * 1.7 + 40 * u : 0, bodyH = L.n * L.pitch * cell;
      const top = tall ? 230 * u : (S.H - kh - bodyH) / 2;
      h = { L, cell, x: side - 2 * cell, y: top + kh, kick, kx: side, ky: top, statement: true };
    } else {
      const px = (tall ? 82 : 88) * u, cell = px / EM;
      const L = vtype(words, Math.floor((S.W - side * 2) / cell));
      h = { L, cell, x: side - 2 * cell, y: (tall ? 150 : 74) * u };
    }
    h.band = { x0: h.x - h.cell * 2, y0: Math.min(h.y, h.ky ?? h.y) - h.cell * 2, x1: h.x + (h.L.cols + 4) * h.cell, y1: h.y + (h.L.n * h.L.pitch + 4) * h.cell };
    HS.set(key, h);
    return h;
  }
  // When a headline builds and leaves, within its scene's own clock.
  function drawHead(ctx, S, th, id, info, first, hasNext) {
    const h = headSpec(S, id);
    if (!h) return;
    const t0 = first ? 0.15 : info.change + 0.05;
    const inP = seg(info.local, t0, t0 + 0.8), outP = hasNext ? seg(info.local, info.hold - 0.6, info.hold - 0.1) : 0;
    if (h.kick) kickerSlab(ctx, S, th, h.kick, h.kx, h.ky, seg(info.local, t0 - 0.1, t0 + 0.35), outP);
    vdraw(ctx, th, h.L, h.x, h.y, h.cell, inP, outP, info.t, id.length * 7);
  }

  // A floating sign made of pixel tiles, each tile a small extruded block, with a post down to its anchor.
  function pixelSign(ctx, S, th, icon, x, y, cell, q, alpha, hot, t, seed) {
    if (q <= 0) return;
    const u = S.u, n = icon.length, pad = cell * 0.7, w = n * cell + pad * 2, ext = cell * 0.35;
    ctx.save();
    const sc = back(q);
    ctx.translate(x, y + w / 2); ctx.scale(sc, sc); ctx.translate(-x, -(y + w / 2));
    ctx.globalAlpha *= clamp(q * 3) * alpha;
    const left = x - w / 2, top = y - w / 2;
    for (let k = 0; k < 4; k++) { ctx.fillStyle = css(th.dark); ctx.fillRect(x - 3 * u, top + w + ext + k * 14 * u, 6 * u, 9 * u); }
    ctx.shadowColor = "rgba(12,22,44,0.22)"; ctx.shadowBlur = 18 * u; ctx.shadowOffsetY = 10 * u;
    ctx.fillStyle = css(shade(th.panelC, th.night ? 0.62 : 0.76)); ctx.fillRect(left, top + ext, w, w);
    ctx.shadowColor = "transparent";
    ctx.fillStyle = css(th.panelC); ctx.fillRect(left, top, w, w);
    const on = hot ? th.acc : th.dark, lit = Math.floor(t * 6 + seed * 3) % (n * n);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (icon[r][c] === "X") {
      const px = left + pad + c * cell, py = top + pad + r * cell, g = 1.5 * u;
      ctx.fillStyle = css(shade(on, 0.7)); ctx.fillRect(px + g, py + g + cell * 0.18, cell - g * 2, cell - g * 2);
      ctx.fillStyle = css(r * n + c === lit ? mix(on, WHITE, 0.45) : on); ctx.fillRect(px + g, py + g, cell - g * 2, cell - g * 2);
    }
    ctx.restore();
  }

  // ---- sky ----------------------------------------------------------------------------------------
  let SKY = null;
  function cloudShape(th, seed) {
    const r = rng(seed), n = 4 + ((r() * 4) | 0), m = 2 + ((r() * 2) | 0), set = new Set(), vox = [];
    for (let y = 0; y < m; y++) for (let x = 0; x < n; x++) {
      const e = Math.pow((x + 0.5 - n / 2) / (n / 2), 2) + Math.pow((y + 0.5 - m / 2) / (m / 2), 2);
      if (e < 1.05 + r() * 0.35) { vox.push([x, y, 0]); set.add(K(x, y, 0)); if (e < 0.55 && r() < 0.85) { vox.push([x, y, 1]); set.add(K(x, y, 1)); } }
    }
    const cm = mat(th, th.cloud, false);
    return vox.map(([x, y, z]) => ({ x, y, z, m: cm, mask: (set.has(K(x, y, z + 1)) ? 0 : 1) | (set.has(K(x + 1, y, z)) ? 0 : 2) | (set.has(K(x, y + 1, z)) ? 0 : 4), k: x + y + z }))
      .filter((v) => v.mask).sort((p, q) => p.k - q.k);
  }
  function skyAssets(th) {
    if (SKY && SKY.key === THK) return SKY;
    const clouds = [], islets = [];
    for (let i = 0; i < 8; i++) clouds.push(cloudShape(th, 500 + i * 7));
    for (let i = 0; i < 4; i++) islets.push(makeIsland(th, 5 + (i % 2), 5, 900 + i, { trees: 1, depth: 3, rocks: 1, bushes: 1, flowers: 3, tufts: 2, lanterns: th.night ? 1 : 0 }));
    const stars = [], r = rng(77);
    for (let i = 0; i < 110; i++) stars.push([r(), r() * 0.7, 1 + r() * 2.5, r() * TAU]);
    return (SKY = { key: THK, clouds, islets, stars });
  }
  function drawStatic(ctx, V, th, isl, t) {
    for (const v of isl.low) box(ctx, V, th, v.x, v.y, v.z, v.w, v.d, v.h, v.m, v.mask, v.ao, false, v.lipF);
    if (isl.fall) waterfall(ctx, V, th, isl.fall, t);
    const items = isl.high.concat(isl.small).sort((p, q) => p.k - q.k);
    for (const v of items) box(ctx, V, th, v.x, v.y, v.z, v.w, v.d, v.h, v.m, v.small ? 7 : v.mask, v.small ? 0 : v.ao, false);
    for (const g of isl.glows) glow(ctx, V, th, g[0], g[1], g[2], 1, t);
  }
  function sky(ctx, S, th, t, camX) {
    const W = S.W, H = S.H, u = S.u, A = skyAssets(th);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, css(th.sky[0])); g.addColorStop(0.58, css(th.sky[1])); g.addColorStop(1, css(th.sky[2]));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const sx = W * 0.84 - camX * 20 * u, sy = H * 0.13;
    const rg = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(W, H) * 0.6);
    rg.addColorStop(0, css(th.sun, th.night ? 0.32 : 0.8)); rg.addColorStop(0.22, css(th.sun, th.night ? 0.1 : 0.32)); rg.addColorStop(1, css(th.sun, 0));
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    if (th.night) {
      for (const [x, y, s, ph] of A.stars) {
        ctx.fillStyle = `rgba(255,255,255,${(0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2.2 + ph))).toFixed(3)})`;
        const px = mod(x * W * 1.4 - camX * W * 0.04, W * 1.4) - W * 0.2;
        ctx.fillRect(px, y * H, s * u, s * u);
      }
      const mv = view(sx, sy, 34 * u, 0.5, 0.5);
      box(ctx, mv, th, 0, 0, 0, 1, 1, 1, mat(th, th.sun, true), 7, 0, false);
    }
    // Far islets, hazed by distance.
    const span = W * 2.4;
    A.islets.forEach((isl, i) => {
      const s = (8 + i * 1.6) * u;
      const x = mod(i * span / 4 + W * 0.1 - camX * W * 0.12 - t * 5 * u, span) - W * 0.3;
      const y = H * (0.3 + 0.11 * ((i * 3) % 4) / 3) + Math.sin(t * 0.6 + i * 2) * 5 * u;
      drawStatic(ctx, view(x, y, s, isl.gx, isl.gy), th, isl, t);
    });
    const hz = ctx.createLinearGradient(0, H * 0.15, 0, H);
    hz.addColorStop(0, css(th.sky[1], 0)); hz.addColorStop(0.5, css(th.sky[1], 0.35)); hz.addColorStop(1, css(th.sky[2], 0.5));
    ctx.fillStyle = hz; ctx.fillRect(0, 0, W, H);
    A.clouds.forEach((cl, i) => {
      const s = (12 + (i % 3) * 5) * u, par = 0.16 + (i % 3) * 0.1;
      const x = mod(i * W * 0.37 - camX * W * par - t * (9 + (i % 3) * 5) * u, W * 1.9) - W * 0.35;
      const y = H * (0.03 + ((i * 37) % 10) / 10 * (S.wide ? 0.16 : 0.12)) + Math.sin(t * 0.5 + i) * 3 * u;
      const V = view(x, y, s, 0, 0), clr = bandClear(x, y + s, s * 4);
      if (clr <= 0) return;
      ctx.save(); ctx.globalAlpha *= (th.night ? 0.7 : 0.95) * clr;
      for (const v of cl) box(ctx, V, th, v.x, v.y, v.z, 1, 1, 1, v.m, v.mask, 0, false);
      ctx.restore();
    });
    // Loose cubes drifting upward between the islands.
    const cols = [th.grass[0], th.soil[0], th.leaf[2], th.acc, th.stone[0], th.bloom[1]];
    for (let i = 0; i < 14; i++) {
      const s = (10 + hash(i * 5) * 12) * u;
      const x = mod(hash(i * 3 + 1) * W * 1.6 - camX * W * (0.45 + hash(i) * 0.2) + Math.sin(t * 0.4 + i) * 20 * u, W * 1.6) - W * 0.3;
      const y = mod(hash(i * 7 + 2) * H * 1.3 - t * (12 + hash(i * 11) * 14) * u, H * 1.3) - H * 0.15;
      const clr = bandClear(x, y, s * 1.5);
      if (clr <= 0) continue;
      ctx.save(); ctx.globalAlpha *= clr;
      box(ctx, view(x, y, s, 0.5, 0.5), th, 0, 0, 0, 1, 1, 1, mat(th, cols[i % cols.length], false), 7, 0, false);
      ctx.restore();
    }
  }
  function fore(ctx, S, th, t, camX) {
    const W = S.W, H = S.H, u = S.u, cols = [th.grass[0], th.soil[1], th.acc];
    for (let i = 0; i < 3; i++) {
      const s = (30 + i * 9) * u;
      const x = mod(W * (0.1 + i * 0.43) - camX * W * 1.3 - t * (16 + i * 7) * u, W * 1.7) - W * 0.35;
      const y = H * (0.95 - i * 0.025) + Math.sin(t * 0.9 + i * 2) * 10 * u;
      box(ctx, view(x, y, s, 0.5, 0.5), th, 0, 0, 0, 1, 1, 1, mat(th, cols[i], false), 7, 0, true);
    }
  }
  function tilt(ctx, S, th) {
    if (th.tex <= 0.02) return;
    const W = S.W, H = S.H, q = 0.5, y0 = Math.floor(H * 0.88), bh = H - y0;
    const A = buf("tilt", W * q, bh * q), a = A.getContext("2d");
    a.setTransform(1, 0, 0, 1, 0, 0);
    a.globalCompositeOperation = "copy"; a.filter = `blur(${(0.7 * S.u).toFixed(2)}px)`;
    a.drawImage(ctx.canvas, 0, y0, W, bh, 0, 0, A.width, A.height);
    a.filter = "none"; a.globalCompositeOperation = "destination-in";
    const g = a.createLinearGradient(0, 0, 0, A.height);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.7, "rgba(0,0,0,0.85)"); g.addColorStop(1, "rgba(0,0,0,1)");
    a.fillStyle = g; a.fillRect(0, 0, A.width, A.height);
    a.globalCompositeOperation = "source-over";
    ctx.save(); ctx.globalAlpha *= th.tex * 0.6; ctx.drawImage(A, 0, y0, W, bh); ctx.restore();
  }
  function vignette(ctx, S, th) {
    const W = S.W, H = S.H;
    const g = ctx.createRadialGradient(W / 2, H * 0.48, Math.min(W, H) * 0.42, W / 2, H * 0.5, Math.hypot(W, H) * 0.62);
    g.addColorStop(0, css(th.ao, 0)); g.addColorStop(1, css(th.ao, (th.night ? 0.4 : 0.18) * (0.4 + 0.6 * th.tex)));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  // ---- shared bits --------------------------------------------------------------------------------
  // Lit and dark windows on a tower cube's two visible faces; some blink on and off.
  function windows(seed) {
    return (ctx, th, t, v, mask) => {
      const lit = (k) => { const hs = h3(v.x, v.y, v.z * 3 + k + seed), per = 2.2 + hs * 4; return mod(t / per + hs, 1) < (th.night ? 0.75 : 0.22 + hs * 0.25); };
      if (mask & 4) facePatch(ctx, FP.Dx, FP.Dy, FP.Cx, FP.Cy, FP.Gx, FP.Gy, 0.26, 0.74, 0.26, 0.72, lit(1) ? th.litS : th.glassS);
      if (mask & 2) facePatch(ctx, FP.Bx, FP.By, FP.Cx, FP.Cy, FP.Ex, FP.Ey, 0.26, 0.74, 0.26, 0.72, lit(2) ? th.litS : th.glassS2);
    };
  }
  function steam(push, x, y, z, t, n, seed, col, s0 = 0.34) {
    for (let i = 0; i < n; i++) {
      const ph = mod(t * 0.55 + i / n + hash(seed + i) * 0.3, 1), k = s0 * (1 - ph * 0.6);
      const px = x + Math.sin(ph * 5 + i) * 0.2 - k / 2 - ph * 0.6, py = y - k / 2, pz = z + ph * 2.6;
      push({ k: px + py + pz + k * 1.5, draw: (ctx, V, th) => { ctx.save(); ctx.globalAlpha *= (1 - ph) * 0.8; box(ctx, V, th, px, py, pz, k, k, k, mat(th, col, false), 7, 0, false); ctx.restore(); } });
    }
  }
  // Small pixel icons for signs, 5×5, row 0 at the top.
  const ICONS = {
    read: ["XXX..", "X.X..", "XXX..", "...X.", "....X"],
    draft: ["..X..", ".XXX.", "XXXXX", ".XXX.", "..X.."],
    check: [".....", "....X", "...X.", "X.X..", ".X..."],
  };

  // ---- scenes -------------------------------------------------------------------------------------
  const BUILD = {};
  // Keep tall props off the back rows that would reach up into the headline band, plus any
  // scene-specific sight lines (extra).
  const headBottom = (S) => (S.tall ? 470 : 240) * S.u;
  const keepClear = (S, N, ay, s, extra) => (x, y) => ay * S.H + (x + y + 1 - N) * s * 0.5 - 7 * s < headBottom(S) || (extra ? extra(x, y) : false);
  const islet = (th, seed, dx, dy, n = 6) => ({ isl: makeIsland(th, n, n, seed, { trees: 1, depth: 3, rocks: 1, bushes: 1, flowers: 4, tufts: 3, fall: seed % 2 ? n * 0.6 : null }), dx, dy, ph: hash(seed) * TAU });

  // Chart: a skyline of voxel towers, one per bar; the hot tower flies a flag.
  BUILD.chart = (S, th, d) => {
    const narrow = !S.wide, N = narrow ? 18 : 22, M = N, cx = N >> 1, cy = M >> 1;
    const vals = (d.values || []).map((v) => Number(v) || 0), n = vals.length || 1;
    const max = Math.max(1, ...vals.map(Math.abs));
    const sp = narrow ? 3 : 4, hmax = narrow ? 9 : 8, fwd = 2;
    const towers = vals.map((v, i) => {
      const o = Math.round((i - (n - 1) / 2) * sp);
      return { x0: cx + o + fwd - 1, y0: cy - o + fwd - 1, h: Math.max(1, Math.round(Math.abs(v) / max * hmax)), v, hot: i === d.highlight, vox: [] };
    });
    const AY = narrow ? 0.54 : 0.64, SS = (narrow ? 36 : 38) * S.u, tsum = towers.length ? towers[0].x0 + towers[0].y0 : N;
    const lats = towers.map((T) => T.x0 - T.y0), lat0 = Math.min(...lats) - 3, lat1 = Math.max(...lats) + 4;
    const isl = makeIsland(th, N, M, 3101, { reserve: towers.map((T) => [T.x0 - 1, T.y0 - 1, T.x0 + 3, T.y0 + 3]), clear: keepClear(S, N, AY, SS, (x, y) => x + y >= tsum - 2 && x - y >= lat0 && x - y <= lat1), trees: narrow ? 5 : 7, fall: Math.round(N * 0.32), pond: [cx - 4.5, cy - 3.5, 2.6, 2], flowers: 26, tufts: 30, rocks: 4, bushes: 4 });
    const G = group();
    towers.forEach((T, i) => {
      const body = T.hot ? th.acc : i % 2 ? th.white : th.stone[0];
      for (let z = 1; z <= T.h; z++) for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++)
        T.vox.push(G.c(T.x0 + dx, T.y0 + dy, z, z === 1 ? shade(body, 0.86) : body, { g: i, deco: z === 1 ? null : windows(i * 9) }));
      T.vox.push(G.c(T.x0 + 0.15, T.y0 + 0.15, T.h + 1, T.hot ? th.accD : th.dark, { w: 1.7, d: 1.7, h: 0.25, g: i }));
    });
    timeGroups(G.list, towers.map((T, i) => [0.04 + i * 0.2, 0.04 + i * 0.2 + 0.3]), 31);
    const built = (T) => T.vox.reduce((s, v) => s + (v.ar >= 1 ? 1 : 0), 0) / T.vox.length;
    const hot = towers.find((T) => T.hot);
    return {
      isl, props: G.list, ax: 0.5, ay: AY, s: SS, phase: 0.4,
      islets: narrow ? [islet(th, 3111, 7, 11, 5)] : [islet(th, 3111, -19, 4), islet(th, 3112, 19, -5, 5)],
      casters(cs, t, P, L) { for (const T of towers) cs.push([T.x0, T.y0, 2, 2, (T.h + 0.3) * built(T) * (1 - L)]); },
      extras(push, t, P, L, V) {
        if (hot && built(hot) >= 1 && L < 0.5) {
          const fx = hot.x0 + 1.6, fy = hot.y0 + 0.2, fz = hot.h + 1.25;
          push({ k: fx + fy + fz + 1, draw: (ctx, V2, th2) => {
            box(ctx, V2, th2, fx, fy, fz, 0.12, 0.12, 2, mat(th2, th2.dark, false), 7, 0, false);
            for (let j = 0; j < 4; j++) box(ctx, V2, th2, fx + 0.12 + j * 0.3, fy, fz + 1.35 + Math.sin(t * 5 - j * 0.9) * 0.1 * j, 0.3, 0.08, 0.55, mat(th2, j % 2 ? th2.accL : WHITE, false), 7, 0, false);
          } });
          for (let i = 0; i < 4; i++) {
            const ph = mod(t * 0.5 + i / 4, 1), sx = hot.x0 + 1 + Math.sin(i * 2.3) * 1.3, sy = hot.y0 + 1 + Math.cos(i * 1.7) * 1.3, sz = 1 + ph * (hot.h + 3), k = 0.22 * (1 - ph);
            push({ k: sx + sy + sz, draw: (ctx, V2, th2) => { ctx.save(); ctx.globalAlpha *= 1 - ph; box(ctx, V2, th2, sx, sy, sz, k, k, k, mat(th2, th2.accL, true), 7, 0, false); ctx.restore(); } });
          }
        }
        // Two builders stroll the plaza front.
        for (let w = 0; w < 2; w++) {
          const ar = arrive(P, 0.3 + w * 0.15);
          if (ar <= 0) continue;
          const span = narrow ? 3 : 4, pp = ping(t * 0.18 + w * 0.7), o = -span + pp * span * 2, dir = mod(t * 0.18 + w * 0.7, 2) < 1 ? 1 : -1;
          const px = cx + o + fwd + 2.5 + w * 1.2, py = cy - o + fwd + 2.5 + w * 1.2;
          person(push, px, py, 1 + 4 * Math.pow(1 - ar, 3), { ...crew(th, w + 1), k: 1.15, face: dir > 0 ? "x" : "-x", walk: t * 9 + w, alpha: seg(ar, 0, 0.3) * (1 - seg(L, 0, 0.4)) });
        }
      },
      overlay(ctx, S2, th2, V, t, P, L, dd) {
        const u = S2.u, a = 1 - seg(L, 0, 0.35);
        towers.forEach((T, i) => {
          const q = built(T);
          if (q <= 0) return;
          const top = proj(V, T.x0 + 1, T.y0 + 1, 1 + T.h * q + 0.4);
          plaque(ctx, S2, th2, fmt(T.v * q, dd), top[0], top[1] - 10 * u, 96 * u, { font: "figures", hot: T.hot, q: seg(q, 0, 0.18), alpha: a });
          const base = proj(V, T.x0 + 2, T.y0 + 2, 1);
          plaque(ctx, S2, th2, (dd.labels || [])[i], base[0], base[1] + 18 * u, 44 * u, { anchor: "top", q: seg(q, 0, 0.18), alpha: a });
        });
      },
    };
  };

  // Object: a giant voxel laptop (or phone) whose screen shows a live edit timeline; a tiny editor
  // walks the keyboard, keys sink under their feet.
  BUILD.object = (S, th, d) => {
    const narrow = !S.wide, phone = d.kind === "phone";
    const N = narrow ? 18 : 20, M = N, cx = N >> 1, cy = M >> 1;
    const sw = phone ? 7 : 12, sh = phone ? 10 : 8;
    const x0 = phone ? cx - 3 : cx - 6, y0 = phone ? cy : cy - 2;
    const AY = narrow ? 0.56 : (phone ? 0.68 : 0.66), SS = (narrow ? 34 : 38) * S.u;
    const mugX = x0 + sw + 1, mugY = y0 + (phone ? 2 : 3);
    const isl = makeIsland(th, N, M, 3121, { reserve: [[x0 - 3, y0 - 1, x0 + sw + 5, y0 + 9], [x0, y0 - 3, x0 + sw + 3, y0]], clear: keepClear(S, N, AY, SS, (x, y) => x + y > x0 + y0 + 4 && x - y > x0 - y0 - 2), trees: narrow ? 4 : 6, fall: Math.round(N * 0.7), flowers: 24, tufts: 26, rocks: 3, bushes: 4 });
    const G = group();
    const scr = th.night ? shade(th.dark, 0.7) : th.dark;
    // Screen pixels: preview picture on top, a ruler, three tracks; a playhead sweeps across.
    const sky1 = mix(th.sky[0], WHITE, 0.1), sky2 = th.sky[1], hill = th.grass[1], hill2 = th.leaf[1];
    const trackA = th.shirts[0], trackB = th.shirts[2], wave = th.leaf[2];
    const pix = (i, j) => (t) => {
      const W2 = sw - 2, ip = 1 + Math.floor(mod(t * 2.4, W2));
      const head = i === ip;
      if (!phone) {
        if (j >= 5) {
          const sunI = 1 + Math.floor(mod(t * 0.9, W2));
          if (j === 7) return i === sunI ? th.lit : sky1;
          if (j === 6) return (i + Math.floor(t * 1.5)) % 5 === 0 ? hill2 : sky2;
          return (i + Math.floor(t * 1.5)) % 3 === 0 ? hill2 : hill;
        }
        if (j === 4) return head ? WHITE : shade(scr, 1.5);
        let c = j === 3 ? (i >= 4 && i <= 6 ? th.acc : trackA) : j === 2 ? (i <= 5 ? trackB : shade(trackB, 1.2)) : shade(wave, 0.75 + 0.35 * (0.5 + 0.5 * Math.sin(i * 1.7 + t * 6)));
        if (j === 3 && i >= 4 && i <= 6) c = mix(th.acc, WHITE, 0.25 * (0.5 + 0.5 * Math.sin(t * 5)));
        return head ? mix(c, WHITE, 0.55) : c;
      }
      if (j >= 6) {
        const sunJ = 7 + Math.floor(mod(t * 0.8, 5));
        if (j >= 9) return i === 3 && j === sunJ ? th.lit : sky1;
        if (j >= 7) return j === sunJ && i === 4 ? th.lit : sky2;
        return (i + Math.floor(t * 1.5)) % 2 ? hill2 : hill;
      }
      if (j === 5) return head ? WHITE : shade(scr, 1.5);
      let c = j === 4 ? (i >= 2 && i <= 3 ? mix(th.acc, WHITE, 0.25 * (0.5 + 0.5 * Math.sin(t * 5))) : trackA) : j === 3 ? trackB : j === 2 ? shade(wave, 0.75 + 0.35 * (0.5 + 0.5 * Math.sin(i * 1.7 + t * 6))) : shade(scr, 1.3);
      return head && j >= 2 ? mix(c, WHITE, 0.55) : c;
    };
    for (let i = 0; i < sw; i++) for (let j = 0; j < sh; j++) {
      const bezel = i === 0 || i === sw - 1 || j === 0 || j === sh - 1;
      G.c(x0 + i, y0, 2 + j, scr, bezel ? { g: 1 } : { g: 1, mf: pix(i, j), emit: true, hi: false });
    }
    if (!phone) { for (let i = 0; i < sw; i++) for (let j = 0; j < 7; j++) G.c(x0 + i, y0 + j, 1, th.metal, { g: 0 }); }
    else { for (let i = 1; i < sw - 1; i++) for (let j = 0; j < 3; j++) G.c(x0 + i, y0 + j, 1, th.metal, { g: 0 }); }
    // Mug with steam, plant in a pot.
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) for (let z = 1; z <= 2; z++) G.c(mugX + dx, mugY + dy, z, z === 2 ? th.acc : th.white, { g: 2 });
    G.c(mugX + 2, mugY + 0.6, 1.4, th.white, { w: 0.35, d: 0.8, h: 1, g: 2 });
    G.c(x0 - 2, y0 + 4, 1, th.pot, { g: 2 });
    G.c(x0 - 2, y0 + 4, 2, th.leaf[0], { g: 2 }); G.c(x0 - 2, y0 + 4, 3, th.leaf[2], { g: 2 });
    G.c(x0 - 2.5, y0 + 4.3, 2.5, th.leaf[1], { w: 0.6, d: 0.5, h: 0.6, g: 2 });
    timeGroups(G.list, { 0: [0.02, 0.3], 1: [0.15, 0.62], 2: [0.45, 0.75] }, 21);
    const sc = (i, j) => [x0 + i + 0.5, y0 + 1, 2 + j + 0.5];
    const anchors = phone ? [sc(3, 7.5), sc(2.5, 4), sc(3, 2.5)] : [sc(5.5, 6), sc(5, 3), sc(3, 1)];
    return {
      isl, props: G.list, ax: narrow ? 0.5 : 0.37, ay: AY, s: SS, phase: 1.3,
      islets: narrow ? [islet(th, 3131, -8, 12, 5)] : [islet(th, 3131, -17, 6), islet(th, 3132, 17, -7, 5)],
      casters(cs, t, P, L) { const k = 1 - L; if (P > 0.2) cs.push([x0, y0, sw, 1, (phone ? 11 : 9) * k], [mugX, mugY, 2, 2, 2 * k]); },
      extras(push, t, P, L, V) {
        const on = arrive(P, 0.62, 0.1) * (1 - seg(L, 0, 0.3));
        if (!phone) {
          // Keys and trackpad, sinking where the walker steps.
          const ar = arrive(P, 0.3, 0.2);
          const wp = ping(t * 0.22), wx = x0 + 1.4 + wp * (sw - 2.8), wy = y0 + 3.5, dir = mod(t * 0.22, 2) < 1 ? 1 : -1;
          if (ar > 0 && L < 0.5) for (let i = 1; i < sw - 1; i++) for (let j = 1; j < 5; j++) {
            const kx = x0 + i + 0.18, ky = y0 + j + 0.18, near = Math.hypot(kx + 0.32 - wx, ky + 0.32 - wy) < 0.7;
            const typed = hash(i * 7 + j * 13 + Math.floor(t * 5)) < 0.08;
            const kz = 2 + (near || typed ? 0.02 : 0.1) * ar;
            push({ k: kx + ky + 2.2, draw: (ctx, V2, th2) => { ctx.save(); ctx.globalAlpha *= ar * (1 - seg(L, 0, 0.3)); box(ctx, V2, th2, kx, ky, 2, 0.64, 0.64, kz - 2 + 0.06, mat(th2, near || typed ? th2.acc : th2.dark, false), 7, 0, false); ctx.restore(); } });
          }
          if (on > 0) person(push, wx, wy, 2.1, { ...crew(th, 3), k: 1.05, face: dir > 0 ? "x" : "-x", walk: t * 10, alpha: on });
        } else if (on > 0) {
          person(push, x0 + sw + 0.5, y0 + 5, 1, { ...crew(th, 3), k: 1.3, face: "y", wave: seg(Math.sin(t * 2.6), 0.2, 1), alpha: on, smile: true });
        }
        if (on > 0) steam(push, mugX + 1, mugY + 1, 3, t, 5, 7, th.white);
      },
      overlay(ctx, S2, th2, V, t, P, L, dd) {
        const u = S2.u, a = 1 - seg(L, 0, 0.35), W = S2.W, H = S2.H;
        (dd.callouts || []).forEach((label, i) => {
          const c = seg(P, 0.62 + i * 0.1, 0.8 + i * 0.1);
          if (c <= 0 || !label) return;
          const [ax2, ay2] = proj(V, ...anchors[i]);
          let lx, ly;
          if (narrow) { lx = 90 * u; ly = H * (0.75 + i * 0.065); }
          else { lx = W * 0.665; ly = H * (0.4 + i * 0.16); }
          marker(ctx, S2, th2, ax2, ay2, t + i, a * clamp(c * 4));
          chain(ctx, S2, th2, ax2, ay2, lx - 14 * u, ly, c * 1.2, a);
          plaque(ctx, S2, th2, label, lx, ly, 44 * u, { anchor: "left", q: seg(c, 0.55, 1), alpha: a, hot: i === 1 });
        });
      },
    };
  };

  // People: the team stands in a row before a big voxel screen playing the cut; they wave and react.
  BUILD.people = (S, th, d) => {
    const narrow = !S.wide, N = narrow ? 18 : 22, M = N, cx = N >> 1, cy = M >> 1;
    const n = Math.max(2, Math.min(6, Math.round(Number(d.count) || 4)));
    const hot = Math.min(n - 1, d.highlight ?? 1);
    const sp = narrow ? (n > 4 ? 2.2 : n > 3 ? 2.6 : 3.2) : (n > 5 ? 2.7 : n > 4 ? 3.2 : 3.9), fwd = narrow ? 2.5 : 3, k = narrow ? (n > 4 ? 1.7 : 2) : (n > 4 ? 2 : 2.3);
    const ppl = Array.from({ length: n }, (_, i) => { const o = (i - (n - 1) / 2) * sp; return { x: cx + o + fwd, y: cy - o + fwd, hot: i === hot, i }; });
    const sw = narrow ? 12 : 14, shh = 6, sy = cy - 2, sx0 = Math.round(sy - sw / 2 + 0.5);
    const AY = narrow ? 0.5 : 0.69, SS = 36 * S.u, psum = 2 * cy + 2 * fwd;
    const isl = makeIsland(th, N, M, 3151, {
      reserve: [[sx0, sy, sx0 + sw, sy + 1]], pave: false, clear: keepClear(S, N, AY, SS, (x, y) => x + y >= psum - 4),
      paths: [[cx - 9, cy - 3, cx + 11, cy + 8]], trees: narrow ? 4 : 6, fall: Math.round(N * 0.25), flowers: 26, tufts: 24, rocks: 3, bushes: 3,
    });
    const G = group();
    for (let i = 0; i < sw; i++) for (let j = 0; j < shh; j++) {
      const bezel = i === 0 || i === sw - 1 || j === 0 || j === shh - 1;
      G.c(sx0 + i, sy, 2 + j, th.dark, bezel ? { g: 0 } : { g: 0, emit: true, hi: false, mf: (t) => {
        // A tiny film plays: drifting clouds, a sun, scrolling hills, a hopping runner, a scrub bar.
        const I = sw - 2, ii = i - 1, jj = j - 1, sh2 = Math.floor(t * 2.5);
        if (jj === 0) return ii < Math.floor(mod(t * 1.4, I + 1)) ? th.acc : shade(th.dark, 1.7);
        const runner = 2 + Math.floor(mod(t * 2, I - 3)), hop = mod(t * 2, 1) < 0.45 ? 2 : 1;
        if (ii === runner && jj === hop) return th.acc;
        if (ii === runner && jj === hop + 1) return th.skin[0];
        if (jj === 1) return (ii + sh2) % 4 === 0 ? th.leaf[1] : th.grass[0];
        if (jj === 2) return (ii + sh2 * 0.5 | 0) % 6 < 3 ? ((ii + (sh2 * 0.5 | 0)) % 6 === 1 ? th.leaf[0] : th.leaf[3]) : mix(th.sky[2], th.lit, 0.35);
        if (jj === 3) return ii === 1 + Math.floor(mod(t * 0.6, I - 2)) ? th.lit : mix(th.sky[2], th.lit, 0.25);
        return (ii + Math.floor(t * 1.2)) % 5 === 0 ? WHITE : mix(th.sky[0], th.acc, 0.18);
      } });
    }
    G.c(sx0 + 1, sy, 1, th.dark, { g: 0 }); G.c(sx0 + sw - 2, sy, 1, th.dark, { g: 0 });
    timeGroups(G.list, { 0: [0.02, 0.4] }, 51);
    const headZ = 1 + 1.52 * k;
    return {
      isl, props: G.list, ax: 0.5, ay: AY, s: SS, phase: 2.1,
      islets: narrow ? [islet(th, 3161, 8, 11, 5)] : [islet(th, 3161, -19, 5), islet(th, 3162, 19, -4, 5)],
      casters(cs, t, P, L) { for (const p of ppl) if (arrive(P, 0.2 + p.i * 0.1, 0.24) >= 1) cs.push([p.x - 0.3 * k, p.y - 0.3 * k, 0.6 * k, 0.6 * k, 1.4 * k * (1 - L)]); cs.push([sx0, sy, sw, 1, 8 * clamp(P * 3) * (1 - L)]); },
      extras(push, t, P, L, V) {
        for (const p of ppl) {
          // Each reviewer strolls up from the front, backs to us, then turns to face the screen's audience.
          const ar = arrive(P, 0.2 + p.i * 0.1, 0.24);
          if (ar <= 0) continue;
          const e = eo(ar), back2 = (1 - e) * 4.5, cycle = mod(t * 0.45 + p.i * 0.37, 1), there = ar >= 1;
          const wave = !there ? 0 : p.hot ? seg(Math.sin(t * 3.2), 0.1, 0.9) : cycle < 0.25 ? Math.sin(cycle / 0.25 * Math.PI) : 0;
          const hop = there && p.hot ? Math.max(0, Math.sin(t * 4)) * 0.18 : 0;
          person(push, p.x + back2, p.y + back2, 1 + hop, { ...crew(th, p.i, p.hot), k: p.hot ? k * 1.1 : k, face: there ? (p.i % 2 ? "x" : "y") : (p.i % 2 ? "-x" : "-y"), walk: there ? null : t * 10 + p.i, wave, both: p.hot, bob: Math.sin(t * 2 + p.i) * 0.02, smile: p.hot, alpha: seg(ar, 0, 0.25) * (1 - seg(L, 0, 0.4)) });
        }
        // Reaction blocks pop above whoever is speaking up.
        if (P > 0.7 && L < 0.3) for (let b = 0; b < 2; b++) {
          const slot = Math.floor(t / 1.1) + b * 3, ph = mod(t / 1.1, 1), p = ppl[slot % n];
          const bz = headZ + 0.8 + ph * 1.4, bk = 0.42 * back(seg(ph, 0, 0.3)) * (1 - seg(ph, 0.75, 1));
          if (bk <= 0) continue;
          push({ k: p.x + p.y + bz + 2, draw: (ctx, V2, th2) => {
            box(ctx, V2, th2, p.x - bk / 2, p.y - bk / 2, bz, bk, bk, bk, mat(th2, b ? th2.bloom[0] : th2.accL, true), 7, 0, false);
            box(ctx, V2, th2, p.x - bk * 0.15, p.y - bk * 0.15, bz + bk, bk * 0.3, bk * 0.3, bk * 0.3, mat(th2, WHITE, true), 7, 0, false);
          } });
        }
      },
      overlay(ctx, S2, th2, V, t, P, L, dd) {
        const u = S2.u, a = 1 - seg(L, 0, 0.35);
        // Badges sit over the first three heads; neighbours that would touch step up a row.
        ctx.save(); ctx.font = `800 ${44 * u}px ${S2.look.body}`;
        const shown = ppl.filter((p) => p.i <= 2).map((p) => {
          const label = (dd.badges || [])[p.i] || "";
          const [hx, hy] = proj(V, p.x, p.y, 1 + 1.52 * k * (p.hot ? 1.1 : 1) + 0.4);
          return { p, label, hx, hy, w: ctx.measureText(label).width + 44 * u + 20 * u };
        });
        ctx.restore();
        let crowded = false;
        for (let i = 1; i < shown.length; i++) if (shown[i].hx - shown[i - 1].hx < (shown[i].w + shown[i - 1].w) / 2) crowded = true;
        shown.forEach((b, i) => {
          const q = seg(P, 0.44 + b.p.i * 0.1, 0.56 + b.p.i * 0.1);
          const lift = crowded && i % 2 ? 78 * u : 0;
          if (lift && q > 0) chain(ctx, S2, th2, b.hx, b.hy - 8 * u, b.hx, b.hy - 12 * u - lift, q, a * 0.5);
          plaque(ctx, S2, th2, b.label, b.hx, b.hy - 12 * u - lift, 44 * u, { q, alpha: a, hot: b.p.hot });
        });
      },
    };
  };

  // Process: three machines in a row; cards hop machine to machine, changing colour as they are
  // read, drafted and approved, then drop onto a finished stack.
  BUILD.process = (S, th, d) => {
    const narrow = !S.wide, N = narrow ? 18 : 22, M = N, cx = N >> 1, cy = M >> 1;
    const sp = narrow ? 4 : 7, fwd = 1;
    const st = [0, 1, 2].map((i) => { const o = (i - 1) * sp; return { x0: cx + o + fwd - 1, y0: cy - o + fwd - 1, i }; });
    const done = { x: st[2].x0 + (narrow ? 2 : 3), y: st[2].y0 - (narrow ? 3 : 4) };
    const AY = narrow ? 0.5 : 0.64, SS = (narrow ? 36 : 38) * S.u, msum = st[1].x0 + st[1].y0;
    const isl = makeIsland(th, N, M, 3141, { reserve: st.map((s) => [s.x0 - 1, s.y0 - 1, s.x0 + 4, s.y0 + 4]).concat([[done.x - 1, done.y - 1, done.x + 2, done.y + 2]]), clear: keepClear(S, N, AY, SS, (x, y) => x + y >= msum), trees: narrow ? 4 : 6, fall: Math.round(N * 0.3), pond: [cx + 4, cy + 5, 2.2, 1.8], flowers: 24, tufts: 26, rocks: 3, bushes: 3 });
    const G = group();
    const body = [th.white, th.metal, th.white];
    st.forEach((s, i) => {
      for (let z = 1; z <= 2; z++) for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) {
        const band = z === 2 && (dx === 2 || dy === 2);
        G.c(s.x0 + dx, s.y0 + dy, z, band ? (i === 2 ? th.acc : th.shirts[i]) : body[i], { g: i });
      }
      G.c(s.x0 + 2, s.y0, 3, th.stone[1], { g: i });
    });
    for (let z = 1; z <= 2; z++) G.c(done.x, done.y, z, th.stone[0], { g: 3 });
    timeGroups(G.list, { 0: [0.02, 0.32], 1: [0.18, 0.5], 2: [0.34, 0.66], 3: [0.5, 0.7] }, 41);
    const tops = st.map((s) => [s.x0 + 1.5, s.y0 + 1.9, 3]);
    const startP = [st[0].x0 - 2.5, st[0].y0 + 3, 1];
    const endP = [done.x + 0.5, done.y + 0.5, 3];
    const pts = [startP, ...tops, endP];
    const cardCol = (stage) => (stage <= 0 ? th.white : stage === 1 ? th.stone[0] : stage === 2 ? th.shirts[0] : th.acc);
    const T = 3.6;
    const cardAt = (t, c) => {
      const tt = mod(t + c * T / 3, T) / T * 4, seg4 = Math.floor(tt), f = tt - seg4;
      const A = pts[seg4], B = pts[seg4 + 1];
      const hopF = seg(f, 0.35, 1), e = eio(hopF);
      const x = A[0] + (B[0] - A[0]) * e, y = A[1] + (B[1] - A[1]) * e, z = A[2] + (B[2] - A[2]) * e + Math.sin(hopF * Math.PI) * 1.7;
      const stage = hopF < 0.5 ? seg4 : seg4 + 1;
      return { x, y, z, stage, landed: f < 0.35, at: seg4, f };
    };
    return {
      isl, props: G.list, ax: 0.5, ay: AY, s: SS, phase: 0.9,
      islets: narrow ? [islet(th, 3145, -8, 11, 5)] : [islet(th, 3145, -19, 5), islet(th, 3146, 19, -5, 5)],
      casters(cs, t, P, L) { const k = 1 - L; st.forEach((s, i) => { if (P > 0.1 + i * 0.16) cs.push([s.x0, s.y0, 3, 3, 2.6 * k]); }); },
      extras(push, t, P, L, V) {
        const live = arrive(P, 0.72, 0.12) * (1 - seg(L, 0, 0.3));
        if (live <= 0) return;
        // Cards: three in flight at once; a lamp flashes on the machine that just caught one.
        const flash = [0, 0, 0];
        for (let c = 0; c < 3; c++) {
          const cd = cardAt(t, c);
          if (cd.landed && cd.at >= 1 && cd.at <= 3) flash[cd.at - 1] = Math.max(flash[cd.at - 1], 1 - cd.f / 0.35);
          const appear = cd.at === 0 ? seg(cd.f, 0, 0.25) : 1, fadeOut = cd.at === 3 ? 1 - seg(cd.f, 0.85, 1) : 1;
          const kk = 0.86, al = live * appear * fadeOut;
          const zz = cd.z + (cd.at === 0 ? 3 * (1 - appear) : 0);
          push({ k: cd.x + cd.y + zz + 0.6, draw: (ctx, V2, th2) => {
            ctx.save(); ctx.globalAlpha *= al;
            box(ctx, V2, th2, cd.x - kk / 2, cd.y - kk / 2, zz, kk, kk, 0.28, mat(th2, cardCol(cd.stage), false), 7, 0, true);
            facePatch(ctx, FP.Ax, FP.Ay, FP.Bx, FP.By, FP.Dx, FP.Dy, 0.2, 0.8, 0.25, 0.4, css(cd.stage >= 3 ? WHITE : th2.dark, 0.55));
            facePatch(ctx, FP.Ax, FP.Ay, FP.Bx, FP.By, FP.Dx, FP.Dy, 0.2, 0.6, 0.55, 0.7, css(cd.stage >= 3 ? WHITE : th2.dark, 0.4));
            ctx.restore();
          } });
        }
        st.forEach((s, i) => {
          const fl = flash[i];
          push({ k: s.x0 + s.y0 + 3.5, draw: (ctx, V2, th2) => {
            ctx.save(); ctx.globalAlpha *= live;
            box(ctx, V2, th2, s.x0 + 0.2, s.y0 + 0.2, 3, 0.6, 0.6, 0.45 + fl * 0.15, mat(th2, fl > 0.05 ? mix(th2.lit, WHITE, fl * 0.4) : shade(th2.lit, 0.55), fl > 0.05), 7, 0, false);
            ctx.restore();
            if (fl > 0.05) glow(ctx, V2, th2, s.x0 + 0.5, s.y0 + 0.5, 3.6, fl, t);
          } });
          steam(push, s.x0 + 2.5, s.y0 + 0.5, 4, t + i * 0.7, 3, 40 + i, th.white, 0.3);
        });
        // The finished stack keeps a few approved cards on it.
        for (let j = 0; j < 3; j++) push({ k: done.x + done.y + 3 + j * 0.3 + 1, draw: (ctx, V2, th2) => { ctx.save(); ctx.globalAlpha *= live; box(ctx, V2, th2, done.x + 0.07 + Math.sin(j * 2.1) * 0.05, done.y + 0.07, 3 + j * 0.28, 0.86, 0.86, 0.26, mat(th2, j % 2 ? th2.accL : th2.acc, false), 7, 0, true); ctx.restore(); } });
      },
      overlay(ctx, S2, th2, V, t, P, L, dd) {
        const u = S2.u, a = 1 - seg(L, 0, 0.35);
        st.forEach((s, i) => {
          const q = seg(P, 0.3 + i * 0.16, 0.45 + i * 0.16);
          const [bx, by] = proj(V, s.x0 + 3, s.y0 + 3, 1);
          const drop = i === 1 ? 92 * u : 0;
          if (drop && q > 0) chain(ctx, S2, th2, bx, by + 6 * u, bx, by + 20 * u + drop, q, a * 0.6);
          plaque(ctx, S2, th2, (dd.steps || [])[i], bx, by + 20 * u + drop, 44 * u, { anchor: "top", q, alpha: a, num: i + 1, hot: i === 2 });
          const [tx, ty] = proj(V, s.x0 + 1.5, s.y0 + 1.5, 3);
          pixelSign(ctx, S2, th2, ICONS[["read", "draft", "check"][i]], tx, ty - (narrow ? 120 : 150) * u + Math.sin(t * 1.6 + i) * 5 * u, (narrow ? 15 : 18) * u, seg(P, 0.22 + i * 0.16, 0.38 + i * 0.16), a, i === 2, t, i);
        });
      },
    };
  };

  // Compare: two measured columns of counted cubes, one layer per unit — grey re-dos on the left,
  // accent tweaks on the right — joined by a raised voxel arrow that carries the change.
  BUILD.compare = (S, th, d) => {
    const narrow = !S.wide, N = narrow ? 18 : 22, M = N, cx = N >> 1, cy = M >> 1;
    const lv = Math.abs(Number(d.leftValue) || 0), rv = Math.abs(Number(d.rightValue) || 0), max = Math.max(1, lv, rv);
    const top = 8, exact = max <= top && Number.isInteger(lv) && Number.isInteger(rv);
    const hl = Math.max(1, exact ? lv : Math.round(lv / max * top)), hr = Math.max(1, exact ? rv : Math.round(rv / max * top));
    const sp = narrow ? 3 : 4, fwd = 2;
    const Lp = { x0: cx - sp + fwd - 1, y0: cy + sp + fwd - 1 }, Rp = { x0: cx + sp + fwd - 1, y0: cy - sp + fwd - 1 };
    const AY = narrow ? 0.52 : 0.7, SS = (narrow ? 34 : 36) * S.u, csum = Lp.x0 + Lp.y0;
    const isl = makeIsland(th, N, M, 3191, { reserve: [[Lp.x0 - 1, Lp.y0 - 1, Lp.x0 + 3, Lp.y0 + 3], [Rp.x0 - 1, Rp.y0 - 1, Rp.x0 + 3, Rp.y0 + 3]], clear: keepClear(S, N, AY, SS, (x, y) => x + y >= csum - 3), trees: narrow ? 4 : 6, fall: Math.round(N * 0.68), pond: [cx - 4, cy - 4, 2.4, 2], flowers: 24, tufts: 26, rocks: 3, bushes: 3 });
    const G = group();
    // A light runs up each column a layer at a time, counting it.
    const col = (P0, n, a, b, phase, g) => {
      const out = [];
      for (let z = 1; z <= n; z++) for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
        const base = z % 2 ? a : b, lit = mix(base, WHITE, 0.4);
        out.push(G.c(P0.x0 + dx, P0.y0 + dy, z, base, { g, mf: (t) => (Math.floor(mod(t * 3.2 + phase, n + 3)) === z - 1 ? lit : base) }));
      }
      return out;
    };
    const left = col(Lp, hl, th.stone[0], th.stone[1], 0, 0);
    const right = col(Rp, hr, th.acc, shade(th.acc, 0.86), 1.5, 1);
    timeGroups(G.list, { 0: [0.06, 0.48], 1: [0.5, 0.62] }, 61);
    const frac = (arr) => arr.reduce((s2, v) => s2 + (v.ar >= 1 ? 1 : 0), 0) / arr.length;
    // The arrow runs along the line between the two column centres (screen-horizontal in iso).
    const lx = Lp.x0 + 1, ly = Lp.y0 + 1, span = 2 * sp, t0 = 1.75, tip = span - 1.6;
    const shaft = [];
    for (let k = t0; k <= tip - 0.6; k += 0.62) shaft.push(k);
    const at = (k) => [lx + k, ly - k];
    return {
      isl, props: G.list, ax: 0.5, ay: AY, s: SS, phase: 2.7,
      islets: narrow ? [islet(th, 3193, -8, 11, 5)] : [islet(th, 3193, -19, 5), islet(th, 3194, 19, -5, 5)],
      casters(cs, t, P, L) { const k = 1 - L; cs.push([Lp.x0, Lp.y0, 2, 2, hl * frac(left) * k], [Rp.x0, Rp.y0, 2, 2, hr * frac(right) * k]); },
      extras(push, t, P, L, V) {
        const fade = 1 - seg(L, 0, 0.3);
        if (fade <= 0) return;
        const n = shaft.length, pulse = mod(t * 5, n + 5);
        shaft.forEach((k, j) => {
          const ar = arrive(P, 0.63 + j * 0.012, 0.07);
          if (ar <= 0) return;
          const [x, y] = at(k), hot = Math.max(0, 1 - Math.abs(pulse - j) / 1.5);
          push({ k: x + y + 1.3, draw: (ctx, V2, th2) => { ctx.save(); ctx.globalAlpha *= fade * seg(ar, 0, 0.5); box(ctx, V2, th2, x - 0.32, y - 0.32, 1 + (1 - ar) * 2, 0.64, 0.64, 0.42 + hot * 0.14, mat(th2, mix(th2.acc, WHITE, hot * 0.45), hot > 0.5), 7, 0, true); ctx.restore(); } });
        });
        const ah = arrive(P, 0.72, 0.08);
        if (ah > 0) {
          const pieces = [[0, 0], [-0.62, 0.62], [-0.62, -0.62], [-1.24, 1.24], [-1.24, -1.24]];
          for (const [back3, side] of pieces) {
            const kk = tip + back3, [x0, y0] = at(kk), x = x0 + side * 0.5 * 1, y = y0 + side * 0.5;
            const hot = Math.max(0, 1 - Math.abs(pulse - n - 1) / 1.5);
            push({ k: x + y + 1.3, draw: (ctx, V2, th2) => { ctx.save(); ctx.globalAlpha *= fade * seg(ah, 0, 0.5); box(ctx, V2, th2, x - 0.34, y - 0.34, 1 + (1 - ah) * 2, 0.68, 0.68, 0.52 + hot * 0.14, mat(th2, mix(th2.accD, WHITE, hot * 0.4), false), 7, 0, true); ctx.restore(); } });
          }
        }
        // A cube-kid beside the short column hops for the win.
        const kar = arrive(P, 0.8, 0.12);
        if (kar > 0) person(push, Rp.x0 + 3.5, Rp.y0 - 0.5, 1 + 4 * Math.pow(1 - kar, 3) + Math.max(0, Math.sin(t * 4.5)) * 0.35, { ...crew(th, 0), k: 1.4, face: "y", wave: 1, both: true, smile: true, alpha: seg(kar, 0, 0.3) * fade });
      },
      overlay(ctx, S2, th2, V, t, P, L, dd) {
        const u = S2.u, a = 1 - seg(L, 0, 0.35), big = (narrow ? 112 : 120) * u;
        const fl = frac(left), fr = frac(right);
        if (fl > 0) {
          const [x, y] = proj(V, Lp.x0 + 1, Lp.y0 + 1, 1 + hl * fl + 0.3);
          plaque(ctx, S2, th2, fmt(lv * fl, dd), x, y - 10 * u, big, { font: "figures", q: seg(fl, 0, 0.2), alpha: a });
          const [bx, by] = proj(V, Lp.x0 + 2, Lp.y0 + 2, 1);
          plaque(ctx, S2, th2, dd.left, bx, by + 22 * u, 46 * u, { anchor: "top", q: seg(fl, 0, 0.2), alpha: a });
        }
        if (fr > 0) {
          const [x, y] = proj(V, Rp.x0 + 1, Rp.y0 + 1, 1 + hr * fr + 0.3);
          plaque(ctx, S2, th2, fmt(rv * fr, dd), x, y - 10 * u, big, { font: "figures", hot: true, q: seg(fr, 0, 0.2), alpha: a });
          const [bx, by] = proj(V, Rp.x0 + 2, Rp.y0 + 2, 1);
          plaque(ctx, S2, th2, dd.right, bx, by + 22 * u, 46 * u, { anchor: "top", q: seg(fr, 0, 0.2), alpha: a, hot: true });
        }
        const pq = seg(P, 0.76, 0.9);
        if (pq > 0 && lv) {
          const pct = Math.round(((rv - lv) / lv) * 100);
          const [mx0, my0] = at(t0 + (tip - t0) * (narrow ? 0.3 : 0.42));
          const [mx, my] = proj(V, mx0, my0, 1.4);
          const lift = 70 * u + Math.sin(t * 2.4) * 4 * u;
          chain(ctx, S2, th2, mx, my - 6 * u, mx, my - lift, pq * 1.4, a);
          plaque(ctx, S2, th2, `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%`, mx, my - lift, 64 * u, { q: pq, alpha: a, hot: true, font: "figures" });
        }
      },
    };
  };

  // Title: a little film set — camera on a tripod with turning reels, a clapperboard that snaps,
  // a director's chair and a lamp; crew wander between them.
  BUILD.title = (S, th) => {
    const narrow = !S.wide, N = 14, M = 14, cx = 7, cy = 7;
    const isl = makeIsland(th, N, M, 3171, { reserve: [[cx - 4, cy - 3, cx + 4, cy + 4]], pave: false, paths: [[cx - 4, cy + 4, cx + 4, cy + 6], [cx + 4, cy - 3, cx + 6, cy + 4]], trees: 3, fall: 3, flowers: 16, tufts: 16, rocks: 2, bushes: 3 });
    const G = group();
    const bx = cx - 3, by = cy - 2;
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 3; dy++) for (let z = 3; z <= 4; z++) G.c(bx + dx, by + dy, z, z === 4 ? shade(th.dark, 1.25) : th.dark, { g: 0 });
    // Splayed tripod: each leg steps outward as it goes down.
    for (const [lx, ly, ox, oy] of [[0.2, 0.3, -0.45, -0.35], [1.6, 0.6, 0.5, -0.3], [0.9, 2.4, 0, 0.55]]) {
      G.c(bx + lx + ox, by + ly + oy, 1, th.dark, { w: 0.22, d: 0.22, h: 1, g: 0, order: -2 });
      G.c(bx + lx, by + ly, 2, th.dark, { w: 0.22, d: 0.22, h: 1, g: 0, order: -1 });
    }
    G.c(bx + 0.6, by + 0.9, 5, shade(th.dark, 1.3), { w: 0.8, d: 1.2, h: 0.3, g: 0 });
    G.c(bx + 0.2, by + 3, 3.2, th.acc, { w: 1.6, d: 0.4, h: 1.6, g: 0 });
    G.c(bx + 0.45, by + 3.4, 3.45, shade(th.dark, 0.7), { w: 1.1, d: 0.25, h: 1.1, g: 0, deco: (ctx, th2, t) => {
      facePatch(ctx, FP.Dx, FP.Dy, FP.Cx, FP.Cy, FP.Gx, FP.Gy, 0.15, 0.85, 0.15, 0.85, css(mix(th2.glass, th2.sky[0], 0.4)));
      const gl = 0.2 + 0.55 * ping(t * 0.5);
      facePatch(ctx, FP.Dx, FP.Dy, FP.Cx, FP.Cy, FP.Gx, FP.Gy, gl, gl + 0.14, 0.22, 0.42, "rgba(255,255,255,0.8)");
    } });
    // Clapperboard slate.
    const kx = cx + 1, ky = cy + 3;
    G.c(kx, ky, 1, th.dark, { w: 3, d: 0.35, h: 1.8, g: 1, deco: (ctx, th2) => {
      for (let s2 = 0; s2 < 5; s2++) facePatch(ctx, FP.Dx, FP.Dy, FP.Cx, FP.Cy, FP.Gx, FP.Gy, s2 * 0.2 + 0.02, s2 * 0.2 + 0.11, 0.06, 0.22, "rgba(255,255,255,0.9)");
      for (let l = 0; l < 3; l++) facePatch(ctx, FP.Dx, FP.Dy, FP.Cx, FP.Cy, FP.Gx, FP.Gy, 0.1, 0.5 + l * 0.12, 0.42 + l * 0.17, 0.5 + l * 0.17, "rgba(255,255,255,0.7)");
    } });
    // Director's chair.
    const chx = cx + 2, chy = cy - 2.5;
    for (const [lx, ly] of [[0.05, 0.05], [1.15, 0.05], [0.05, 1.15], [1.15, 1.15]]) G.c(chx + lx, chy + ly, 1, th.wood, { w: 0.16, d: 0.16, h: 0.95, g: 2 });
    G.c(chx, chy, 1.95, th.acc, { w: 1.36, d: 1.36, h: 0.2, g: 2 });
    G.c(chx, chy, 2.15, th.wood, { w: 0.16, d: 1.36, h: 0.5, g: 2 }); G.c(chx + 1.2, chy, 2.15, th.wood, { w: 0.16, d: 1.36, h: 0.5, g: 2 });
    G.c(chx, chy - 0.05, 2.3, th.acc, { w: 1.36, d: 0.18, h: 0.85, g: 2 });
    // Lamp.
    const lx0 = cx - 3.6, ly0 = cy + 2.6;
    G.c(lx0 + 0.3, ly0 + 0.3, 1, th.dark, { w: 0.6, d: 0.6, h: 0.18, g: 3 });
    G.c(lx0 + 0.5, ly0 + 0.5, 1.18, th.dark, { w: 0.18, d: 0.18, h: 2.8, g: 3 });
    G.c(lx0 + 0.15, ly0 + 0.15, 3.9, th.lit, { w: 0.9, d: 0.9, h: 0.7, emit: true, g: 3 });
    timeGroups(G.list, { 0: [0.0, 0.42], 1: [0.18, 0.55], 2: [0.32, 0.7], 3: [0.45, 0.82] }, 71);
    const ready = (g, P) => G.list.filter((v) => v.g === g).every((v) => v.ar >= 1);
    return {
      isl, props: G.list, ax: narrow ? 0.5 : 0.745, ay: narrow ? 0.68 : 0.6, s: (narrow ? 42 : 42) * S.u, phase: 0,
      islets: narrow ? [islet(th, 3175, -9, -3, 5)] : [islet(th, 3175, 11, 7, 5), islet(th, 3176, -1, -11, 4)],
      casters(cs, t, P, L) { const k = 1 - L; if (P > 0.4) cs.push([bx, by, 2, 3, 4.5 * k]); if (P > 0.55) cs.push([kx, ky, 3, 0.35, 1.8 * k]); if (P > 0.7) cs.push([chx, chy, 1.4, 1.4, 3 * k]); },
      extras(push, t, P, L, V) {
        const fade = 1 - seg(L, 0, 0.35);
        if (ready(0, P)) {
          // Two film reels: a ring of blocks around a hub, three spokes turning smoothly.
          for (const [ry, dir] of [[by + 0.25, 1], [by + 2.35, 1]]) {
            const rz = 6.25, R = 0.95, cs = 0.36, ang = t * 2.4 * dir;
            const cells = [];
            for (let k = 0; k < 12; k++) cells.push([Math.cos(k * TAU / 12) * R, Math.sin(k * TAU / 12) * R, 0]);
            for (let k = 0; k < 3; k++) cells.push([Math.cos(ang + k * TAU / 3) * 0.48, Math.sin(ang + k * TAU / 3) * 0.48, 1]);
            cells.push([0, 0, 2]);
            cells.sort((p, q) => (p[0] + p[1]) - (q[0] + q[1]));
            push({ k: bx + 1 + ry + rz + 0.6, draw: (ctx, V2, th2) => {
              ctx.save(); ctx.globalAlpha *= fade;
              for (const [dy, dz, kind] of cells) box(ctx, V2, th2, bx + 0.84, ry + dy - cs / 2, rz + dz - cs / 2, 0.32, cs, cs, mat(th2, kind === 1 ? th2.accL : kind === 2 ? th2.acc : th2.metal, false), 7, 0, false);
              ctx.restore();
            } });
          }
        }
        if (ready(1, P)) {
          // The slate's arm opens and snaps shut every couple of seconds.
          const tau = mod(t + 0.6, 2.2);
          const th0 = tau < 1.4 ? 0.5 * eo(tau / 0.35) : tau < 1.55 ? 0.5 * (1 - (tau - 1.4) / 0.15) : 0;
          const hx = kx, hz = 2.85;
          push({ k: kx + 1.5 + ky + 0.2 + 3.2, draw: (ctx, V2, th2) => {
            ctx.save(); ctx.globalAlpha *= fade;
            for (let s2 = 0; s2 < 6; s2++) {
              const r = 0.25 + s2 * 0.5;
              box(ctx, V2, th2, hx + r * Math.cos(th0) - 0.25, ky, hz + r * Math.sin(th0), 0.5, 0.35, 0.3, mat(th2, s2 % 2 ? WHITE : th2.dark, false), 7, 0, false);
            }
            ctx.restore();
          } });
          const snap = tau >= 1.55 && tau < 1.9 ? (tau - 1.55) / 0.35 : -1;
          if (snap >= 0) for (let i = 0; i < 5; i++) {
            const a = -0.4 + i * 0.35, px = kx + 3.2 + Math.cos(a) * snap * 1.2, pz = 2.9 + Math.sin(a) * snap * 1.2;
            push({ k: px + ky + pz + 1, draw: (ctx, V2, th2) => { ctx.save(); ctx.globalAlpha *= (1 - snap) * fade; box(ctx, V2, th2, px, ky, pz, 0.16, 0.16, 0.16, mat(th2, th2.lit, true), 7, 0, false); ctx.restore(); } });
          }
        }
        if (ready(3, P)) push({ k: lx0 + ly0 + 6, draw: (ctx, V2, th2) => glow(ctx, V2, th2, lx0 + 0.6, ly0 + 0.6, 4.3, fade, t) });
        // Crew walking the paths.
        const a0 = arrive(P, 0.55), a1 = arrive(P, 0.7);
        if (a0 > 0) { const pp = ping(t * 0.16), dir = mod(t * 0.16, 2) < 1; person(push, cx - 3.2 + pp * 6.5, cy + 4.8, 1 + 4 * Math.pow(1 - a0, 3), { ...crew(th, 0), k: 1.3, face: dir ? "x" : "-x", walk: t * 9, alpha: seg(a0, 0, 0.3) * fade }); }
        if (a1 > 0) { const pp = ping(t * 0.13 + 0.5), dir = mod(t * 0.13 + 0.5, 2) < 1; person(push, cx + 4.8, cy - 2.5 + pp * 5.5, 1 + 4 * Math.pow(1 - a1, 3), { ...crew(th, 1), k: 1.3, face: dir ? "y" : "-y", walk: t * 9 + 1, alpha: seg(a1, 0, 0.3) * fade }); }
      },
      overlay() {},
    };
  };

  // Closing: an accent check mark rises cube by cube on a plinth; the crew cheers under bursts of
  // cube confetti that keep coming to the last frame.
  BUILD.closing = (S, th) => {
    const narrow = !S.wide, N = 14, M = 14, cx = 7, cy = 7;
    const isl = makeIsland(th, N, M, 3181, { reserve: [[cx - 4, cy - 2, cx + 4, cy + 1]], trees: 3, fall: 4, flowers: 18, tufts: 16, rocks: 2, bushes: 3, paths: [[cx - 4, cy + 1, cx + 4, cy + 5]] });
    const G = group();
    for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) G.c(cx - 4 + i, cy - 2 + j, 1, th.stone[j], { g: 0 });
    const shape = ["......X", ".....XX", "X...XX.", "XX.XX..", ".XXX...", "..X...."];
    // Columns step up as they go right so the mark reads upright against the iso slant.
    const lift = [0, 0, 1, 1, 2, 2, 3];
    shape.forEach((row, r) => { for (let i = 0; i < 7; i++) if (row[i] === "X") for (let yy = 0; yy < 2; yy++) G.c(cx - 3 + i, cy - 2 + yy, 2 + (5 - r) + lift[i], yy ? th.accD : th.acc, { g: 1, order: i * 10 + (5 - r) * (i < 3 ? -1 : 1) + yy * 0.5 }); });
    timeGroups(G.list, { 0: [0.0, 0.3], 1: [0.25, 0.85] }, 81);
    const checkDone = (P) => G.list.every((v) => v.ar >= 1);
    return {
      isl, props: G.list, ax: narrow ? 0.5 : 0.745, ay: narrow ? 0.7 : 0.62, s: (narrow ? 42 : 42) * S.u, phase: 3.3,
      islets: narrow ? [islet(th, 3185, 9, -2, 5)] : [islet(th, 3185, 11, -6, 5), islet(th, 3186, -10, 8, 4)],
      casters(cs, t, P, L) { const k = 1 - L; cs.push([cx - 4, cy - 2, 8, 2, clamp(P * 3) * k], [cx - 3, cy - 2, 7, 1, 6 * clamp((P - 0.25) * 1.6) * k]); },
      extras(push, t, P, L, V) {
        [[cx - 3, cy + 3], [cx, cy + 3.6], [cx + 3, cy + 2.8]].forEach(([x, y], i) => {
          const ar = arrive(P, 0.3 + i * 0.1);
          if (ar <= 0) return;
          const jump = Math.max(0, Math.sin(t * 5 + i * 2.1)) * 0.5;
          person(push, x, y, 1 + 5 * Math.pow(1 - ar, 3) + jump, { ...crew(th, i + 2), k: 1.35, face: i % 2 ? "x" : "y", wave: 1, both: true, smile: true, alpha: seg(ar, 0, 0.3) });
        });
        if (!checkDone(P)) return;
        const cols = [th.acc, th.bloom[1], th.shirts[0], th.bloom[0], WHITE, th.shirts[3]];
        for (let b = 0; b < 2; b++) {
          const life = 1.7, idx = Math.floor((t + b * life / 2) / life), ph = mod(t + b * life / 2, life) / life;
          const ox = cx + 1 + (hash(idx * 3) - 0.5) * 3, oy = cy - 1.5, oz = 7;
          for (let i = 0; i < 16; i++) {
            const a = hash(idx * 31 + i) * TAU, sp2 = 1.2 + hash(idx * 17 + i) * 2.2, vz = 3 + hash(idx * 7 + i) * 3;
            const tt = ph * 1.8, px = ox + Math.cos(a) * sp2 * tt, py = oy + Math.sin(a) * sp2 * tt, pz = oz + vz * tt - 3.4 * tt * tt;
            const k = 0.28, col = cols[(i + idx) % cols.length];
            push({ k: px + py + pz, draw: (ctx, V2, th2) => { ctx.save(); ctx.globalAlpha *= 1 - seg(ph, 0.7, 1); box(ctx, V2, th2, px, py, pz, k, k, k, mat(th2, col, false), 7, 0, false); ctx.restore(); } });
          }
        }
      },
      overlay() {},
    };
  };

  // ---- the camera ---------------------------------------------------------------------------------
  // Each island glides in from the right during the change and out to the upper left as the next arrives.
  function travel(local, hold, ch, first, hasNext) {
    const span = PRE + ch;
    if (!first && local < ch) return 1 - eio((PRE + local) / span);
    if (hasNext && local > hold - PRE) return -eio((local - hold + PRE) / span);
    return 0;
  }
  const leaving = (local, hold, ch, hasNext) => (hasNext && local > hold - PRE ? clamp((local - hold + PRE) / (PRE + ch)) : 0);
  const CACHE = new Map();
  function layoutSig(id, d) {
    if (!d) return "";
    if (id === "chart") return (d.values || []).join(",") + ":" + d.highlight;
    if (id === "object") return String(d.kind);
    if (id === "people") return d.count + ":" + d.highlight;
    if (id === "compare") return d.leftValue + ":" + d.rightValue;
    return "";
  }
  function getScene(S, th, id, d) {
    const sig = id + "|" + THK + "|" + layoutSig(id, d);
    let sc = CACHE.get(sig);
    if (!sc) {
      sc = BUILD[id](S, th, d || {});
      sc.pmap = new Map();
      for (const v of sc.props) { if (v.c) v.m = mat(th, v.c, v.emit); if (v.unit) sc.pmap.set(K(v.x, v.y, v.z), v); }
      sc.halfS = sc.isl.halfW * R3;
      for (const it of sc.islets) sc.halfS = Math.max(sc.halfS, Math.abs(it.dx) + it.isl.halfW * R3);
      CACHE.set(sig, sc);
    }
    return sc;
  }
  const FRAME = { index: 0, next: null, camX: 0, band: null };
  // Sky props fade out where they would cross the headline sign.
  function bandClear(x, y, r) {
    const b = FRAME.band;
    if (!b) return 1;
    const dx = Math.max(b.x0 - x, 0, x - b.x1), dy = Math.max(b.y0 - y, 0, y - b.y1);
    return seg(Math.hypot(dx, dy) - r, 0, r + 40);
  }
  function runScene(ctx, S, th, id, d, o) {
    if (!BUILD[id]) return;
    const sc = getScene(S, th, id, d);
    const u = S.u, W = S.W, H = S.H;
    const tr = travel(o.local, o.hold, o.change, o.first, o.hasNext);
    const L = leaving(o.local, o.hold, o.change, o.hasNext);
    // The build is staged across most of the hold, so something new lands every beat.
    const P = o.p != null ? o.p : clamp((o.local + 0.2) / Math.max(1, o.hold * 0.74));
    const lp = clamp(o.local / Math.max(1, o.hold));
    const zoom = 1 + 0.08 * lp, s = sc.s * zoom;
    const hw = sc.halfS * s + 60 * u;
    const ax0 = sc.ax * W, ay0 = sc.ay * H;
    const ax = ax0 + (tr > 0 ? tr * (W - ax0 + hw) : tr * (ax0 + hw)) + (0.5 - lp) * 120 * u;
    const ay = ay0 + tr * 0.1 * H + Math.sin(o.t * 0.8 + sc.phase) * 10 * u + (0.5 - lp) * 26 * u;
    const gone = 1 - seg(L, 0.4, 0.85);
    if (gone <= 0) return;
    ctx.save();
    ctx.globalAlpha *= gone;
    for (const it of sc.islets) {
      const isl = it.isl;
      drawStatic(ctx, view(ax + it.dx * s, ay + it.dy * s + Math.sin(o.t * 1.1 + it.ph) * 7 * u, s, isl.gx, isl.gy), th, isl, o.t);
    }
    const V = view(ax, ay, s, sc.isl.gx, sc.isl.gy);
    renderIsland(ctx, S, th, V, sc.isl, sc, P, L, o.t);
    if (o.current && S.paint) { fore(ctx, S, th, o.t, FRAME.camX); tilt(ctx, S, th); }
    sc.overlay(ctx, S, th, V, o.t, P, L, d || {}, o);
    ctx.restore();
    if (o.current && S.paint) vignette(ctx, S, th);
  }
  const controls = () => (window.__dreamcut && window.__dreamcut.controls) || null;
  function dataFrom(c) {
    return {
      chart: { labels: [c.bar_1_label, c.bar_2_label, c.bar_3_label, c.bar_4_label], values: [c.bar_1, c.bar_2, c.bar_3, c.bar_4], suffix: c.chart_suffix, prefix: "", highlight: Number(c.highlight) - 1 },
      object: { kind: c.device, callouts: [c.callout_1, c.callout_2, c.callout_3] },
      people: { count: c.people_count, badges: [c.badge_1, c.badge_2, c.badge_3], highlight: 1 },
      process: { steps: [c.step_1, c.step_2, c.step_3] },
      compare: { left: c.before_label, leftValue: c.before_value, right: c.after_label, rightValue: c.after_value, suffix: c.compare_suffix, prefix: "" },
    };
  }
  function drawer(id) {
    return (ctx, S, box2, p, d, info) => {
      const out = info.exit !== undefined, th = theme(S);
      const first = !out && FRAME.index === 0, hasNext = out || !!FRAME.next;
      runScene(ctx, S, th, id, d, { t: info.t, local: info.local, hold: info.hold, change: info.change, p: out ? 1 : null, first, hasNext, current: !out });
      if (!out) drawHead(ctx, S, th, id, info, first, hasNext);
    };
  }

  const ROUND = VFONT;
  const BODY = VFONT;
  const extrude = (c1, c2) => () => `0 0.04em 0 ${c1}, 0 0.08em 0 ${c2}`;
  return {
    bg: "#cbeeee", panel: "#fffaf0", ink: "#203049", muted: "#4b5a73", accent: "#ff5a5f", onAccent: "#ffffff",
    rule: "rgba(32,48,73,0.35)", track: "rgba(32,48,73,0.12)",
    display: ROUND, displayWeight: 400, displayCase: "none", displayTracking: "-0.01em",
    body: BODY, bodyWeight: 400, figures: ROUND, radius: 0, motion: "rise", change: "fade",
    kit: { line: 3, fill: "solid", panel: "fill" },
    world: WORLD,
    textShadow: extrude("#9fd8dc", "#7dbfc7"),
    palettes: {
      // Noon: brighter sky and grass. Night: indigo sky, lit windows and lanterns. Mono: unpainted clay cubes.
      light: { bg: "#e2f4ff", panel: "#ffffff", ink: "#16213a", muted: "#45526b", accent: "#ff7a1a", onAccent: "#ffffff", textShadow: extrude("#bfe3ff", "#9fcff5"),
        world: { ...WORLD, sky: ["#9fd8ff", "#e0f3ff", "#ffffff"], sun: "#ffffff", grass: ["#86d56d", "#77c962", "#95de79"], water: "#47b9f0", plaza: ["#f4efe2", "#e6dfcc"] } },
      dark: { bg: "#141b40", panel: "#262e5c", ink: "#f5f3ff", muted: "#c3c6e6", accent: "#ffc94d", onAccent: "#1b1640", rule: "rgba(245,243,255,0.35)", track: "rgba(245,243,255,0.14)", textShadow: extrude("#3a3f86", "#272b66"),
        world: { ...WORLD, night: true, sky: ["#0b1230", "#1c2557", "#3b2d63"], sun: "#d7ddff", grass: ["#2f7a62", "#286b57", "#36866b"], soil: ["#5d4636", "#4e3a2e", "#3b2c25", "#4a4c5e"],
          stone: ["#666b84", "#565b73", "#464a60"], sand: "#8a7a5a", water: "#2f6fb0", wood: "#6b4a33", leaf: ["#1f6b55", "#195e4b", "#2a7d60", "#14523f"], bloom: ["#ff8fb8", "#ffd166", "#e6e9ff", "#a58cff"],
          metal: "#8e96b0", dark: "#1d2238", white: "#c9cde0", shirts: ["#4f6fd0", "#d99a2b", "#8a64d0", "#d0654a", "#c4507f"], hats: ["#e0474c", "#2a55b0", "#e6b84a", "#5a3fa8", "#d8d2c0"], pants: ["#c9bc9e", "#5e4a85", "#a85a3e", "#4a7040", "#9a9cb0"], lit: "#ffd36b", glass: "#2b3666", cloud: "#3d4680", cool: "#1a1f50", ao: "#05081a", plaza: ["#4c5274", "#41466a"], pot: "#9a5a3c" } },
      mono: { bg: "#f1f1f3", panel: "#ffffff", ink: "#16171b", muted: "#55575f", accent: "#2b2c31", onAccent: "#ffffff", textShadow: extrude("#d6d7dc", "#bfc0c6"),
        world: { ...WORLD, sky: ["#e4e5e8", "#f0f0f2", "#fbfbfb"], sun: "#ffffff", grass: ["#dcdde1", "#d0d1d6", "#e6e7ea"], soil: ["#b4b5bc", "#a3a4ac", "#909199", "#9a9ba3"],
          stone: ["#cfd0d5", "#b9bac0", "#a4a5ac"], sand: "#e9e9ec", water: "#c3c6ce", wood: "#a9aab1", leaf: ["#c2c4ca", "#b4b6bd", "#cfd1d6", "#a7a9b0"], bloom: ["#ffffff", "#e0e0e4", "#8e9097", "#c8c9ce"],
          metal: "#e3e4e8", dark: "#3c3d44", white: "#fafafa", skin: ["#ececef", "#d9dade", "#c6c7cc"], shirts: ["#8e9099", "#b0b2b9", "#6f717a", "#c4c6cc", "#7d7f88"], hats: ["#3c3d44", "#d6d7dc", "#6f717a", "#a4a5ac", "#55575f"], pants: ["#e6e7ea", "#9a9ba3", "#c4c6cc", "#7d7f88", "#d0d1d6"],
          lit: "#ffffff", glass: "#9fa2ab", cloud: "#ffffff", cool: "#50525e", ao: "#16171c", plaza: ["#ececef", "#e0e0e4"], pot: "#a4a5ac" } },
    },
    backdrop: (accent, texture = 1, look) => {
      const s = ((look && look.world) || WORLD).sky;
      return `${grain(0.05 * texture)}, linear-gradient(180deg, ${s[0]} 0%, ${s[1]} 58%, ${s[2]} 100%)`;
    },
    // Toy-block type: the kicker is a coloured slab, headlines carry a stepped extrusion.
    css: (accent, look) => {
      const d = css(shade(rgb(accent), 0.7));
      return `#root .kicker { align-self: flex-start; font-size: 40px !important; font-weight: 800; letter-spacing: 0.08em; color: ${look.onAccent}; background: ${accent};
          padding: 0.32em 0.75em 0.28em; text-shadow: none; box-shadow: 0 0.22em 0 ${d}, 0 0.5em 0.8em rgba(16,30,60,0.2); margin-bottom: 40px !important; }
        #root .display { color: ${look.ink}; }
        #root.vx-type .scene .display, #root.vx-type .scene .kicker { visibility: hidden !important; }
        #root[data-width="1920"] #title, #root[data-width="1920"] #closing { max-width: 900px; }
        #root[data-height="1920"] .statement { justify-content: flex-start !important; padding-top: 250px !important; }`;
    },
    // The sky is painted by the stage; this pass lays a fine film grain over the finished frame.
    paintOver: true,
    paint: (ctx, W, H, t) => {
      ctx.clearRect(0, 0, W, H);
      const r = rng(1000 + Math.floor(t * 12)), ox = Math.floor(r() * 256), oy = Math.floor(r() * 256);
      ctx.save(); ctx.globalAlpha = 0.16; ctx.translate(-ox, -oy); ctx.fillStyle = ctx.createPattern(noise(), "repeat"); ctx.fillRect(ox, oy, W, H); ctx.restore();
    },
    keepArt: true,
    overlap: true,
    stage(ctx, S, info) {
      const th = theme(S);
      FRAME.index = info.index; FRAME.next = info.next;
      const first = info.index === 0, hasNext = !!info.next;
      // The look sets its own headlines in blocks; the template's type steps aside.
      const root = ctx.canvas && ctx.canvas.parentNode;
      if (root && root.classList && !root.classList.contains("vx-type")) root.classList.add("vx-type");
      const hs = headSpec(S, info.scene);
      FRAME.band = hs ? hs.band : null;
      FRAME.camX = info.index - travel(info.local, info.hold, info.change, first, hasNext);
      if (S.paint) sky(ctx, S, th, info.t, FRAME.camX);
      const c = controls();
      // The next island starts gliding in during the last moments of this scene.
      if (c && info.next && info.local > info.hold - PRE) {
        const nd = dataFrom(c);
        runScene(ctx, S, th, info.next, nd[info.next] || null, { t: info.t, local: info.local - info.hold, hold: Number(c[info.next + "_hold"]) || 3, change: info.change, p: null, first: false, hasNext: false, current: false });
      }
      // The title island has no drawer, so it leaves from here while the next scene arrives.
      const titleHold = Number(c ? c.title_hold : 2.4);
      if (info.index === 1 && titleHold > 0 && info.local < info.change) {
        runScene(ctx, S, th, "title", null, { t: info.t, local: titleHold + info.local, hold: titleHold, change: info.change, p: 1, first: true, hasNext: true, current: false });
      }
      if (info.scene === "title" || info.scene === "closing") {
        runScene(ctx, S, th, info.scene, null, { t: info.t, local: info.local, hold: info.hold, change: info.change, p: null, first, hasNext, current: true });
        drawHead(ctx, S, th, info.scene, info, first, hasNext);
      }
    },
    scenes: { chart: drawer("chart"), object: drawer("object"), people: drawer("people"), process: drawer("process"), compare: drawer("compare") },
  };
});
