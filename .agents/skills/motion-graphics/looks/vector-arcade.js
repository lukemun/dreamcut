// Vector Arcade: a 1980s vector-monitor world. Everything is a thin additive beam with a bright dwell
// dot where the beam lingers at a vertex: wireframe solids tumbling in a starfield, a receding octagon
// tunnel, a planet of latitude lines, and a hand-built stroke font for every label. Scenes wipe into
// each other with a retrace beam; a CRT pass (scanlines, bloom roll, vignette, speckle) sits over the
// whole frame. All shapes, ships and figures are original. Frames are pure functions of time.
window.DreamcutMotion.register("vector-arcade", ({ rng }) => {
  const M = window.DreamcutMotion;
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const inout = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const fr = (v) => v - Math.floor(v);
  const mix = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const hex2 = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h)); const n = m ? parseInt(m[1], 16) : 0xffffff; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const stag = (p, i, n, sp = 0.55) => ease((p - (i / Math.max(1, n)) * sp) / (1 - sp));
  const DISPLAY = "'Avenir Next Condensed', 'DIN Condensed', 'Roboto Condensed', 'Arial Narrow', 'Helvetica Neue', sans-serif";

  // ---- stroke font ------------------------------------------------------------------------------------
  // Glyphs on a 4 by 6 grid (y down), as polylines. A beam writes them letter by letter.
  const SRC = {
    A: "0,6 0,2 2,0 4,2 4,6;0,4 4,4", B: "0,6 0,0 3,0 4,1 4,2 3,3 0,3;3,3 4,4 4,5 3,6 0,6", C: "4,1 3,0 1,0 0,1 0,5 1,6 3,6 4,5",
    D: "0,0 0,6 2,6 4,4 4,2 2,0 0,0", E: "4,0 0,0 0,6 4,6;0,3 3,3", F: "4,0 0,0 0,6;0,3 3,3", G: "4,1 3,0 1,0 0,1 0,5 1,6 3,6 4,5 4,3 2,3",
    H: "0,0 0,6;4,0 4,6;0,3 4,3", I: "1,0 3,0;2,0 2,6;1,6 3,6", J: "4,0 4,5 3,6 1,6 0,5", K: "0,0 0,6;4,0 0,3.4;1.4,2.2 4,6",
    L: "0,0 0,6 4,6", M: "0,6 0,0 2,3 4,0 4,6", N: "0,6 0,0 4,6 4,0", O: "1,0 3,0 4,1 4,5 3,6 1,6 0,5 0,1 1,0",
    P: "0,6 0,0 3,0 4,1 4,2 3,3 0,3", Q: "1,0 3,0 4,1 4,5 3,6 1,6 0,5 0,1 1,0;2.4,4.2 4,6.4", R: "0,6 0,0 3,0 4,1 4,2 3,3 0,3;2,3 4,6",
    S: "4,1 3,0 1,0 0,1 0,2 1,3 3,3 4,4 4,5 3,6 1,6 0,5", T: "0,0 4,0;2,0 2,6", U: "0,0 0,5 1,6 3,6 4,5 4,0", V: "0,0 2,6 4,0",
    W: "0,0 1,6 2,3 3,6 4,0", X: "0,0 4,6;4,0 0,6", Y: "0,0 2,3 4,0;2,3 2,6", Z: "0,0 4,0 0,6 4,6",
    0: "1,0 3,0 4,1 4,5 3,6 1,6 0,5 0,1 1,0;0.7,4.9 3.3,1.1", 1: "1,1.2 2,0 2,6;1,6 3,6", 2: "0,1 1,0 3,0 4,1 4,2 0,6 4,6",
    3: "0,1 1,0 3,0 4,1 4,2 3,3 1.6,3;3,3 4,4 4,5 3,6 1,6 0,5", 4: "3,6 3,0 0,4 4,4", 5: "4,0 0,0 0,3 3,3 4,4 4,5 3,6 1,6 0,5",
    6: "4,1 3,0 1,0 0,1 0,5 1,6 3,6 4,5 4,4 3,3 0,3", 7: "0,0 4,0 1.6,6", 8: "1,0 3,0 4,1 4,2 3,3 1,3 0,2 0,1 1,0;1,3 0,4 0,5 1,6 3,6 4,5 4,4 3,3",
    9: "0,5 1,6 3,6 4,5 4,1 3,0 1,0 0,1 0,2 1,3 4,3", ".": "1.8,5.7 2.2,6", ",": "2.2,5.4 1.7,6.8", "-": "0.6,3 3.4,3", "+": "0.6,3 3.4,3;2,1.4 2,4.6",
    "%": "0,0 1.2,0 1.2,1.2 0,1.2 0,0;2.8,4.8 4,4.8 4,6 2.8,6 2.8,4.8;4,0 0,6", ":": "2,1.7 2,2.2;2,4 2,4.5", "/": "4,0 0,6", "!": "2,0 2,4;2,5.6 2,6",
    "?": "0,1 1,0 3,0 4,1 4,2 2,3.2 2,4;2,5.6 2,6", "'": "2,0 2,1.6", "$": "4,1 3,0 1,0 0,1 0,2 1,3 3,3 4,4 4,5 3,6 1,6 0,5;2,-0.6 2,6.6",
    "(": "3,0 1.6,1.5 1.6,4.5 3,6", ")": "1,0 2.4,1.5 2.4,4.5 1,6", "=": "0.6,2.2 3.4,2.2;0.6,4 3.4,4", "<": "3.6,0.8 0.6,3 3.6,5.2", ">": "0.4,0.8 3.4,3 0.4,5.2",
    "&": "4,6 0.8,2.6 0.8,1 1.8,0 3,0.6 3,2 0,5 1,6 2.6,6 4,4", "#": "1.2,0 0.8,6;3.2,0 2.8,6;0,2 4,2;0,4 4,4", "*": "0.8,1.2 3.2,4.2;3.2,1.2 0.8,4.2;2,0.6 2,4.8",
  };
  const GL = {};
  for (const k of Object.keys(SRC)) GL[k] = SRC[k].split(";").map((s) => s.trim().split(/\s+/).map((q) => q.split(",").map(Number)));
  const ADV = 5.2;
  // The beam paths for a string: one polyline per stroke, laid out from a baseline.
  function textPolys(str, x, y, cap, o = {}) {
    str = String(str ?? "").toUpperCase();
    let unit = cap / 6;
    let w = Math.max(0, str.length * ADV - (ADV - 4)) * unit;
    if (o.maxW && w > o.maxW) { unit *= o.maxW / w; w = o.maxW; }
    const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    const by = o.mid ? y + 3 * unit : y;
    const polys = [];
    for (let i = 0; i < str.length; i++) {
      const gl = GL[str[i]];
      if (!gl) continue;
      for (const stroke of gl) {
        const s = [];
        for (const [gx, gy] of stroke) s.push(x0 + (i * ADV + gx) * unit, by - (6 - gy) * unit);
        polys.push(s);
      }
    }
    return { polys, w, unit };
  }

  // ---- beams ------------------------------------------------------------------------------------------
  // While a scene leaves, every beam it draws is retracted along its own path (1 = fully erased).
  let ERASE = 0;
  const SPR = new Map();
  function sprite(col, add) {
    const key = col.map((v) => v | 0).join(",") + (add ? "a" : "s");
    let c = SPR.get(key);
    if (c) return c;
    c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d");
    const core = add ? [255, 255, 255] : [8, 10, 30];
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, rgba(core, 1)); gr.addColorStop(0.13, rgba(mix(col, core, 0.55), 1)); gr.addColorStop(0.3, rgba(col, 0.6));
    gr.addColorStop(0.62, rgba(col, 0.14)); gr.addColorStop(1, rgba(col, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    SPR.set(key, c);
    return c;
  }
  // A dwell dot: the beam resting on a point.
  function dot(g, P, x, y, size, col, a = 1) {
    a *= 1 - ERASE;
    if (a <= 0 || size <= 0) return;
    g.save();
    g.globalCompositeOperation = P.add ? "lighter" : "source-over";
    g.globalAlpha *= clamp(a);
    g.drawImage(sprite(col, P.add), x - size / 2, y - size / 2, size, size);
    g.restore();
  }
  function plen(polys) {
    let n = 0;
    for (const s of polys) for (let i = 2; i < s.length; i += 2) n += Math.hypot(s[i] - s[i - 2], s[i + 1] - s[i - 1]);
    return n;
  }
  function trace(g, polys, q) {
    let left = q >= 1 ? Infinity : plen(polys) * q;
    for (const s of polys) {
      g.moveTo(s[0], s[1]);
      for (let i = 2; i < s.length; i += 2) {
        const dx = s[i] - s[i - 2], dy = s[i + 1] - s[i - 1], d = Math.hypot(dx, dy);
        if (d >= left) { const k = d ? left / d : 0; const x = s[i - 2] + dx * k, y = s[i - 1] + dy * k; g.lineTo(x, y); return { x, y }; }
        left -= d;
        g.lineTo(s[i], s[i + 1]);
      }
    }
    return null;
  }
  // Three passes: a wide faint halo, a mid glow and a white-hot core.
  function beam(g, P, polys, col, w, o = {}) {
    const q = (o.q ?? 1) * (1 - ERASE);
    const a = o.a ?? 1;
    if (q <= 0 || a <= 0 || !polys.length) return;
    g.save();
    g.globalCompositeOperation = P.add ? "lighter" : "source-over";
    g.lineCap = "round"; g.lineJoin = "round";
    if (o.dash) { g.setLineDash(o.dash); g.lineDashOffset = o.dashOff || 0; }
    g.beginPath();
    const head = trace(g, polys, q);
    const h = o.halo ?? 1;
    g.strokeStyle = rgba(col, 0.1 * a * h); g.lineWidth = w * 6; g.stroke();
    g.strokeStyle = rgba(col, 0.28 * a); g.lineWidth = w * 2.6; g.stroke();
    g.strokeStyle = rgba(P.add ? mix(col, [255, 255, 255], 0.62) : mix(col, [0, 0, 0], 0.35), 0.96 * a); g.lineWidth = w; g.stroke();
    g.restore();
    if (head && q < 1) dot(g, P, head.x, head.y, w * 9, col, a);
  }
  function dotsOf(g, P, polys, col, size, a = 1, q = 1) {
    if (q <= 0) return;
    let left = q >= 1 ? Infinity : plen(polys) * q;
    for (const s of polys) {
      for (let i = 0; i < s.length; i += 2) {
        if (i) { left -= Math.hypot(s[i] - s[i - 2], s[i + 1] - s[i - 1]); if (left < 0) return; }
        dot(g, P, s[i], s[i + 1], size, col, a);
      }
    }
  }
  function vtext(g, P, str, x, y, cap, o = {}) {
    const T = textPolys(str, x, y, cap, o);
    const w = Math.max(1.7, T.unit * 0.42);
    beam(g, P, T.polys, o.color || P.ink, w, { q: o.q ?? 1, a: o.a ?? 1, halo: o.halo ?? 0.8 });
    return T.w;
  }

  // ---- geometry ---------------------------------------------------------------------------------------
  const rect = (x, y, w, h) => [x, y, x + w, y, x + w, y + h, x, y + h, x, y];
  const cham = (x, y, w, h, c) => [x + c, y, x + w - c, y, x + w, y + c, x + w, y + h - c, x + w - c, y + h, x + c, y + h, x, y + h - c, x, y + c, x + c, y];
  const circ = (cx, cy, r, n = 32, a0 = 0, a1 = TAU) => { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; o.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } return o; };
  const ngon = (cx, cy, r, n, rot = 0) => { const o = []; for (let i = 0; i <= n; i++) { const a = rot + (TAU * i) / n; o.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } return o; };
  // Camera: roll, then yaw about the object's own vertical, then the camera's pitch, then perspective.
  function view(cx, cy, scale, yaw, pitch, roll, dist) {
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll || 0), sr = Math.sin(roll || 0);
    dist = dist || scale * 6;
    return (x, y, z) => {
      const x1 = x * cr - y * sr, y1 = x * sr + y * cr;
      const x2 = x1 * cyw + z * syw, z2 = -x1 * syw + z * cyw;
      const y3 = y1 * cp - z2 * sp, z3 = y1 * sp + z2 * cp;
      const Z = z3 * scale, f = dist / (dist + Z);
      return [cx + x2 * scale * f, cy - y3 * scale * f, Z];
    };
  }
  // Split a projected polyline into runs nearer to and farther from the viewer.
  function split(pts, thr, F, B) {
    let cur = null, curF = null;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], f = (a[2] + b[2]) / 2 <= thr;
      if (cur === null || curF !== f) { cur = [a[0], a[1]]; (f ? F : B).push(cur); curF = f; }
      cur.push(b[0], b[1]);
    }
  }
  function mk(v) {
    let m = 1e9;
    for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) m = Math.min(m, Math.hypot(v[i][0] - v[j][0], v[i][1] - v[j][1], v[i][2] - v[j][2]));
    const e = [];
    for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) if (Math.hypot(v[i][0] - v[j][0], v[i][1] - v[j][1], v[i][2] - v[j][2]) < m * 1.02) e.push([i, j]);
    return { v, e };
  }
  const PHI = (1 + Math.sqrt(5)) / 2;
  const nrm = (v) => v.map(([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; });
  const SOL = {
    cube: mk(nrm([[1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]])),
    octa: mk([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]),
    tetra: mk(nrm([[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]])),
    icosa: mk(nrm([[0, 1, PHI], [0, 1, -PHI], [0, -1, PHI], [0, -1, -PHI], [1, PHI, 0], [1, -PHI, 0], [-1, PHI, 0], [-1, -PHI, 0], [PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, 1], [-PHI, 0, -1]])),
    prism: mk(nrm([[1, 0.6, 0], [0.5, 0.6, 0.87], [-0.5, 0.6, 0.87], [-1, 0.6, 0], [-0.5, 0.6, -0.87], [0.5, 0.6, -0.87], [1, -0.6, 0], [0.5, -0.6, 0.87], [-0.5, -0.6, 0.87], [-1, -0.6, 0], [-0.5, -0.6, -0.87], [0.5, -0.6, -0.87]])),
  };
  // A solid as a wireframe: near edges bright, far edges dim, a dwell dot on every vertex.
  function wire(g, P, V, sol, col, w, o = {}) {
    const pts = sol.v.map(([x, y, z]) => V(x * (o.sx || 1), y * (o.sy || 1), z * (o.sz || 1)));
    const med = pts.reduce((s, p) => s + p[2], 0) / pts.length;
    const fp = [], bp = [];
    for (const [i, j] of sol.e) { const a = pts[i], b = pts[j]; ((a[2] + b[2]) / 2 <= med ? fp : bp).push([a[0], a[1], b[0], b[1]]); }
    const q = o.q ?? 1, a = o.a ?? 1;
    beam(g, P, bp, col, w * 0.8, { a: a * 0.32, q, halo: 0.6 });
    beam(g, P, fp, col, w, { a, q });
    if (o.dots !== false) for (const p of pts) dot(g, P, p[0], p[1], w * (p[2] <= med ? 6.5 : 4), col, a * (p[2] <= med ? 1 : 0.4) * (q >= 1 ? 1 : q));
    return pts;
  }
  function sphere(V, lats, nm, segs, rx = 1, ry = 1, rz = 1, lonA = 0, lonB = TAU) {
    const F = [], B = [];
    for (const lat of lats) {
      const la = (lat * Math.PI) / 180, pts = [];
      for (let i = 0; i <= segs; i++) { const lo = lonA + ((lonB - lonA) * i) / segs; pts.push(V(Math.cos(la) * Math.cos(lo) * rx, Math.sin(la) * ry, Math.cos(la) * Math.sin(lo) * rz)); }
      split(pts, 0, F, B);
    }
    for (let m = 0; m < nm; m++) {
      const lo = (TAU * m) / nm, pts = [];
      for (let i = 0; i <= segs; i++) { const la = -Math.PI / 2 + (Math.PI * i) / segs; pts.push(V(Math.cos(la) * Math.cos(lo) * rx, Math.sin(la) * ry, Math.cos(la) * Math.sin(lo) * rz)); }
      split(pts, 0, F, B);
    }
    return { F, B };
  }

  // ---- palette ----------------------------------------------------------------------------------------
  function pal(S) {
    const L = S.look, T = L.tone;
    return { add: T.add, u: S.u, W: S.W, H: S.H, tall: S.tall, ink: hex2(L.ink), muted: hex2(L.muted), acc: hex2(S.accent), c: T.c.map(hex2), bg: hex2(L.bg), tex: L.texture ?? 1, S };
  }

  // ---- the world under every scene --------------------------------------------------------------------
  const STAR = (() => { const r = rng(77); return Array.from({ length: 120 }, () => ({ x: r() * 2 - 1, y: r() * 2 - 1, z: r(), h: r() })); })();
  const CITY = (() => { const r = rng(311); return Array.from({ length: 70 }, () => ({ la: (r() * 1.15 - 0.2) * 1.3, lo: r() * TAU, ph: r() * TAU })); })();
  const DEBRIS = (() => { const r = rng(404); return Array.from({ length: 44 }, () => ({ a: r() * TAU, s: 0.6 + r() * 0.9, ph: r(), len: 0.6 + r() })); })();
  const SPARK = (() => { const r = rng(515); return Array.from({ length: 14 }, () => ({ x: r(), y: r(), ph: r() * TAU, s: 0.6 + r() * 0.8 })); })();

  function bloom(g, P, t) {
    const { W, H } = P;
    const g1 = g.createRadialGradient(W * (0.5 + 0.05 * Math.sin(t * 0.3)), H * 0.5, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.7);
    g1.addColorStop(0, rgba(P.c[0], P.add ? 0.12 : 0.05)); g1.addColorStop(0.55, rgba(P.c[1], P.add ? 0.035 : 0.02)); g1.addColorStop(1, rgba(P.c[0], 0));
    g.fillStyle = g1; g.fillRect(0, 0, W, H);
  }
  function tunnel(g, P, t, k) {
    const { W, H, u } = P;
    const cx = W / 2 + Math.sin(t * 0.21) * W * 0.04, cy = H * 0.5 + Math.cos(t * 0.17) * H * 0.03, R = Math.hypot(W, H) * 0.62, N = 11;
    const spokes = [];
    for (let j = 0; j < 8; j++) { const a = (j * Math.PI) / 4 + t * 0.06; spokes.push([cx + Math.cos(a) * R * 0.03, cy + Math.sin(a) * R * 0.03, cx + Math.cos(a) * R, cy + Math.sin(a) * R]); }
    beam(g, P, spokes, P.c[0], 1.2 * u, { a: 0.16 * k, halo: 0.4 });
    for (let i = 0; i < N; i++) {
      const d = fr(i / N + t * 0.055);
      const r = R * Math.pow(d, 2.3) + 6 * u;
      const a = Math.min(1, d * 5) * Math.pow(1 - d, 0.7) * 0.55 * k;
      const rot = t * 0.1 + d * 1.5;
      const poly = [ngon(cx, cy, r, 8, rot)];
      beam(g, P, poly, i % 3 === 1 ? P.c[1] : P.c[0], (1 + d * 2) * u, { a, halo: 0.5 });
      if (d > 0.25 && d < 0.9) dotsOf(g, P, poly, i % 3 === 1 ? P.c[1] : P.c[0], (4 + d * 9) * u, a * 0.9);
    }
  }
  function stars(g, P, t, k, boost) {
    const { W, H, u } = P;
    const cx = W / 2, cy = H / 2, kk = Math.max(W, H) * 0.26;
    const groups = [[], [], [], []];
    STAR.forEach((s, i) => {
      const z = fr(s.z - t * 0.04), zz = z * 0.94 + 0.06;
      const z2 = Math.min(1, zz + 0.01 + boost * 0.16);
      const x1 = cx + (s.x * kk) / zz, y1 = cy + (s.y * kk) / zz;
      if (x1 < -20 || x1 > W + 20 || y1 < -20 || y1 > H + 20) return;
      const x2 = cx + (s.x * kk) / z2, y2 = cy + (s.y * kk) / z2;
      groups[Math.floor(s.h * 4) % 4].push([x1, y1, x2, y2]);
      if (i % 5 === 0) dot(g, P, x1, y1, (3 + (1 - zz) * 12) * u, P.ink, 0.8 * k);
    });
    const cols = [P.ink, P.c[0], P.c[1], P.acc];
    groups.forEach((gp, i) => beam(g, P, gp, cols[i], 1.6 * u, { a: 0.55 * k, halo: 0.5 }));
  }
  function drifters(g, P, t, k) {
    const { W, H, u } = P, m = Math.min(W, H);
    const spec = [
      ["icosa", 0.93, 0.2, 0.075, 0.35, 0.21, P.c[0]], ["octa", 0.055, 0.5, 0.06, -0.5, 0.33, P.c[1]], ["cube", 0.94, 0.7, 0.07, 0.42, -0.27, P.c[2]],
      ["tetra", 0.06, 0.24, 0.05, -0.3, 0.4, P.acc], ["prism", 0.08, 0.82, 0.055, 0.28, 0.3, P.c[0]],
    ];
    spec.forEach(([name, fx, fy, fs, w1, w2, col], i) => {
      const x = W * fx + Math.sin(t * 0.4 + i * 1.7) * 18 * u, y = H * fy + Math.cos(t * 0.33 + i) * 26 * u;
      const V = view(x, y, m * fs, t * w1 + i, 0.5 + 0.4 * Math.sin(t * w2 + i), 0.25 * Math.sin(t * 0.3 + i), m * fs * 5);
      wire(g, P, V, SOL[name], col, 1.7 * u, { a: 0.7 * k });
    });
  }
  function rails(g, P, t, k, info) {
    const { W, H, u, tall } = P;
    const rx = (tall ? 22 : 54) * u, y0 = 120 * u, y1 = H - 110 * u, step = 22 * u;
    for (const side of [0, 1]) {
      const x = side ? W - rx : rx, dir = side ? 1 : -1;
      const ticks = [];
      const off = fr(t * 0.22 * dir) * step * 4;
      for (let i = -4; i < (y1 - y0) / step + 4; i++) {
        const y = y0 + i * step + off;
        if (y < y0 || y > y1) continue;
        const env = Math.sin(((y - y0) / (y1 - y0)) * Math.PI);
        const L = (((i % 4) + 4) % 4 === 0 ? 26 : 12) * u * (0.35 + 0.65 * env);
        ticks.push([x - (side ? L : 0), y, x + (side ? 0 : L), y]);
      }
      beam(g, P, [[x, y0, x, y1], ...ticks], P.c[0], 1.4 * u, { a: 0.6 * k, halo: 0.5 });
      const my = lerp(y0, y1, 0.5 + 0.42 * Math.sin(t * 0.7 + side * 2));
      const ax = x + (side ? -34 : 34) * u;
      beam(g, P, [[ax, my, x, my - 11 * u, x, my + 11 * u, ax, my]], P.acc, 1.6 * u, { a: 0.9 * k });
      dot(g, P, x, my, 14 * u, P.acc, k);
      // An energy column beside each rail.
      const mx = x + (side ? -36 : 36) * u - 9 * u, bottom = H * 0.8, segH = 10 * u, gap = 7 * u, segs = 14;
      const lit = Math.round(segs * clamp(0.55 + 0.3 * Math.sin(t * 1.3 + side * 2.4) + 0.1 * Math.sin(t * 5 + side)));
      const gp = [[], [], [], []];
      for (let s = 0; s < segs; s++) {
        const yy = bottom - s * (segH + gap), poly = rect(mx, yy - segH, 18 * u, segH);
        gp[s >= lit ? 0 : s < 9 ? 1 : s < 12 ? 2 : 3].push(poly);
      }
      beam(g, P, gp[0], P.ink, 1 * u, { a: 0.18 * k, halo: 0.2 });
      beam(g, P, gp[1], P.c[2], 1.4 * u, { a: 0.85 * k });
      beam(g, P, gp[2], P.acc, 1.4 * u, { a: 0.9 * k });
      beam(g, P, gp[3], P.c[1], 1.4 * u, { a: 0.95 * k });
    }
    // Corner brackets with dwell dots.
    const m = 26 * u, L = 70 * u;
    beam(g, P, [[m, m + L, m, m, m + L, m], [W - m - L, m, W - m, m, W - m, m + L], [m, H - m - L, m, H - m, m + L, H - m], [W - m - L, H - m, W - m, H - m, W - m, H - m - L]], P.c[0], 1.9 * u, { a: 0.75 * k });
    for (const [x, y] of [[m, m], [W - m, m], [m, H - m], [W - m, H - m]]) dot(g, P, x, y, 16 * u, P.c[0], k * (0.7 + 0.3 * Math.sin(t * 4 + x)));
  }
  function readouts(g, P, t, k, info) {
    const { W, H, u } = P;
    const x0 = (P.tall ? 112 : 132) * u, cap = 32 * u;
    const score = String(Math.floor(t * 137 + 4710) % 1000000).padStart(6, "0");
    vtext(g, P, "1UP " + score, x0, 62 * u, cap, { color: P.c[2], a: 0.9 * k });
    vtext(g, P, "HI 099500", W - x0, 62 * u, cap, { color: P.acc, align: "right", a: 0.85 * k });
    // The bottom line: credits, a progress beam over the whole piece, the stage number.
    vtext(g, P, "CREDIT 02", x0, H - 46 * u, cap, { color: P.c[0], a: 0.85 * k });
    vtext(g, P, "STAGE " + String((info.index ?? 0) + 1).padStart(2, "0"), W - x0, H - 46 * u, cap, { color: P.c[1], align: "right", a: 0.85 * k });
    const bx0 = x0, bx1 = W - x0, by = H - 24 * u, q = clamp(info.t / Math.max(1, info.length));
    beam(g, P, [[bx0, by, bx1, by]], P.ink, 1.2 * u, { a: 0.22 * k, halo: 0.3 });
    beam(g, P, [[bx0, by, lerp(bx0, bx1, q), by]], P.c[0], 2 * u, { a: 0.95 * k });
    dot(g, P, lerp(bx0, bx1, q), by, 20 * u, P.acc, k);
  }

  function sparkle(g, P, x, y, s, col, a) {
    beam(g, P, [[x - s, y, x + s, y], [x, y - s, x, y + s], [x - s * 0.5, y - s * 0.5, x + s * 0.5, y + s * 0.5], [x + s * 0.5, y - s * 0.5, x - s * 0.5, y + s * 0.5]], col, 1.5 * P.u, { a, halo: 0.6 });
    dot(g, P, x, y, s * 0.9, col, a);
  }

  // The title world: a planet of latitude lines rising from below, an original ship crossing it.
  const SHIP = {
    v: [[0, 0, 2.2], [-1.2, 0, -1.1], [1.2, 0, -1.1], [0, 0.18, -0.55], [0, 0.95, -1.35], [0, -0.38, -0.95], [-0.5, 0.05, -1.45], [0.5, 0.05, -1.45]],
    e: [[0, 1], [0, 2], [1, 3], [2, 3], [0, 4], [4, 3], [0, 5], [5, 1], [5, 2], [4, 1], [4, 2], [3, 5], [1, 6], [2, 7], [6, 7], [3, 6], [3, 7]],
  };
  function shipAt(g, P, tt, hk, ghost, cx0, cy0, ax, ay) {
    const w = 0.55;
    const x = cx0 + Math.sin(tt * w) * ax, y = cy0 + Math.sin(tt * w * 2 + 0.7) * ay;
    const turn = Math.tanh(2.6 * Math.cos(tt * w));
    const V = view(x, y, 62 * P.u, (Math.PI / 2) * turn, 0.38, -0.5 * Math.sin(tt * w) - 0.1, 62 * P.u * 7);
    const pts = SHIP.v.map(([a, b, c]) => V(a, b, c));
    const polys = SHIP.e.map(([i, j]) => [pts[i][0], pts[i][1], pts[j][0], pts[j][1]]);
    const col = ghost ? P.c[0] : P.c[0];
    if (ghost) { beam(g, P, polys, col, 1.4 * P.u, { a: 0.5 * ghost * hk, halo: 0.4 }); return; }
    beam(g, P, polys, col, 2.4 * P.u, { a: hk });
    for (const p of pts) dot(g, P, p[0], p[1], 14 * P.u, col, hk);
    // Engine flare: two beams streaming out of the tail.
    const t1 = V(-0.5, 0.05, -1.45), t2 = V(0.5, 0.05, -1.45), back = V(0, 0.05, -1.45 - 1.4 - 0.5 * Math.sin(tt * 30)), c0 = V(0, 0.05, -1.45);
    beam(g, P, [[t1[0], t1[1], back[0], back[1], t2[0], t2[1]]], P.acc, 2 * P.u, { a: 0.9 * hk });
    dot(g, P, c0[0], c0[1], 26 * P.u, P.acc, hk);
  }
  function planet(g, P, t, hk) {
    const { W, H, u } = P, m = Math.min(W, H);
    const R = 0.62 * m, cx = W / 2, cy = H * (P.tall ? 0.76 : 0.79) + R + (1 - hk) * H * 0.35;
    const V = view(cx, cy, R, t * 0.16, 0.38, 0, R * 4.5);
    const sp = sphere(V, [-30, -15, 0, 15, 30, 45, 60, 75], 24, 56);
    g.save(); g.globalAlpha *= hk;
    beam(g, P, sp.B, P.c[0], 1.4 * u, { a: 0.22, halo: 0.4 });
    beam(g, P, sp.F, P.c[0], 2 * u, { a: 0.85 });
    // Craters: small circles lying on the surface.
    const craters = [[40, 0.5, 0.2], [58, 2.2, 0.16], [22, 3.6, 0.22], [64, 4.9, 0.14], [10, 1.3, 0.18], [48, 5.8, 0.15]];
    const CF = [], CB = [];
    for (const [lat, lon, ang] of craters) {
      const la = (lat * Math.PI) / 180, n = [Math.cos(la) * Math.cos(lon), Math.sin(la), Math.cos(la) * Math.sin(lon)];
      let e1 = [n[2], 0, -n[0]]; const l1 = Math.hypot(e1[0], e1[2]) || 1; e1 = [e1[0] / l1, 0, e1[2] / l1];
      const e2 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]];
      const pts = [];
      for (let i = 0; i <= 24; i++) { const th = (TAU * i) / 24, sa = Math.sin(ang), ca = Math.cos(ang); pts.push(V(n[0] * ca + (e1[0] * Math.cos(th) + e2[0] * Math.sin(th)) * sa, n[1] * ca + (e1[1] * Math.cos(th) + e2[1] * Math.sin(th)) * sa, n[2] * ca + (e1[2] * Math.cos(th) + e2[2] * Math.sin(th)) * sa)); }
      split(pts, 0, CF, CB);
    }
    beam(g, P, CF, P.c[1], 2 * u, { a: 0.85 });
    beam(g, P, CB, P.c[1], 1.2 * u, { a: 0.15, halo: 0.3 });
    // City lights twinkle on the near side.
    for (const c of CITY) {
      const p = V(Math.cos(c.la) * Math.cos(c.lo), Math.sin(c.la), Math.cos(c.la) * Math.sin(c.lo));
      if (p[2] < -R * 0.05 && p[1] > H * 0.7 && p[1] < H) dot(g, P, p[0], p[1], 9 * u, P.acc, 0.35 + 0.65 * Math.abs(Math.sin(t * 2.6 + c.ph)));
    }
    // The limb: a bright rim, a thin haze ring, and glints running along it.
    beam(g, P, [circ(cx, cy, R, 120)], P.c[0], 2.6 * u, { a: 1 });
    beam(g, P, [circ(cx, cy, R * 1.03, 120)], P.c[1], 1.4 * u, { a: 0.45, halo: 0.5 });
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + Math.sin(t * 0.5 + i * 1.3) * 0.8 + (i - 2) * 0.12;
      dot(g, P, cx + Math.cos(a) * R, cy + Math.sin(a) * R, 22 * u, P.ink, 0.9);
    }
    g.restore();
  }
  function belt(g, P, t, hk) {
    const { W, H, u } = P, m = Math.min(W, H);
    for (let i = 0; i < 5; i++) {
      const x = fr(t * 0.028 + i / 5) * W * 1.2 - W * 0.1, y = H * (P.tall ? 0.085 + 0.012 * (i % 2) : 0.1 + 0.014 * (i % 2)) + Math.sin(t * 0.7 + i) * 8 * u;
      const V = view(x, y, m * 0.04, t * (0.5 + i * 0.13) + i, 0.5, t * 0.2, m * 0.2);
      wire(g, P, V, SOL[["octa", "cube", "tetra", "prism", "icosa"][i]], [P.c[0], P.c[1], P.c[2], P.acc, P.c[0]][i], 1.6 * u, { a: 0.85 * hk });
    }
  }
  function titleHero(g, P, t, hk) {
    const { W, H, u } = P;
    planet(g, P, t, hk);
    belt(g, P, t, hk);
    const y0 = H * (P.tall ? 0.69 : 0.725), ax = W * 0.36, ay = 18 * u;
    for (let k = 5; k >= 1; k--) shipAt(g, P, t - k * 0.045, hk, Math.pow(0.55, k) * 1.6, W / 2, y0, ax, ay);
    shipAt(g, P, t, hk, 0, W / 2, y0, ax, ay);
    SPARK.slice(0, 7).forEach((s, i) => {
      const y = H * (0.08 + 0.55 * s.y);
      if (P.tall ? (y > H * 0.13 && y < H * 0.62) : (y > H * 0.13 && y < H * 0.62 && s.x > 0.1 && s.x < 0.9)) return;
      sparkle(g, P, W * (0.05 + 0.9 * s.x), y, (10 + 14 * Math.abs(Math.sin(t * 1.7 + s.ph))) * u * s.s, [P.ink, P.acc, P.c[1], P.c[0]][i % 4], hk * (0.5 + 0.5 * Math.sin(t * 2.2 + s.ph)));
    });
  }
  // The closing world: a spinning pair of solids, shockwave octagons and debris streaming outward.
  function finale(g, P, t, hk, info) {
    const { W, H, u } = P, m = Math.min(W, H);
    const cx = W / 2, cy = H * 0.84 + (1 - hk) * H * 0.3, R = 0.24 * m;
    g.save(); g.globalAlpha *= hk;
    const V = view(cx, cy, R, t * 0.6, 0.45 + 0.15 * Math.sin(t * 0.4), 0.18 * Math.sin(t * 0.5), R * 4);
    wire(g, P, V, SOL.icosa, P.acc, 2.8 * u, { a: 1 });
    const V2 = view(cx, cy, R * 0.52, -t * 0.9, 0.5, 0.2, R * 4);
    wire(g, P, V2, SOL.octa, P.c[1], 2.2 * u, { a: 0.95 });
    const V3 = view(cx, cy, R * 1.5, t * 0.25, 1.2, 0, R * 6);
    const ring = []; for (let i = 0; i <= 60; i++) { const a = (TAU * i) / 60; ring.push(V3(Math.cos(a), 0, Math.sin(a))); }
    const RF = [], RB = []; split(ring, 0, RF, RB);
    beam(g, P, RB, P.c[0], 1.2 * u, { a: 0.25, halo: 0.3 }); beam(g, P, RF, P.c[0], 2 * u, { a: 0.9 });
    for (let k = 0; k < 3; k++) {
      const s = fr(t * 0.42 + k / 3), r = R * (1.1 + s * 3.4), a = Math.pow(1 - s, 1.4) * 0.75;
      beam(g, P, [ngon(cx, cy, r, 8, t * 0.2 + k)], [P.c[0], P.c[1], P.c[2]][k], (2.2 - s) * u, { a });
    }
    const far = Math.hypot(W, H) * 0.55;
    const dp = [[], [], [], []];
    DEBRIS.forEach((d, i) => {
      const s = fr(d.ph + t * 0.22 * d.s), r0 = R * 1.2 + s * far, r1 = r0 + (26 + 60 * s) * u * d.len;
      dp[i % 4].push([cx + Math.cos(d.a) * r0, cy + Math.sin(d.a) * r0 * 0.9, cx + Math.cos(d.a) * r1, cy + Math.sin(d.a) * r1 * 0.9]);
    });
    [P.ink, P.acc, P.c[0], P.c[1]].forEach((c, i) => beam(g, P, dp[i], c, 1.8 * u, { a: 0.6 }));
    SPARK.forEach((s, i) => {
      const x = W * (0.06 + 0.88 * s.x), y = H * (0.07 + 0.5 * s.y);
      if (y > H * 0.28 && y < H * 0.7 && x > W * 0.12 && x < W * 0.88) return;
      sparkle(g, P, x, y, (10 + 16 * Math.abs(Math.sin(t * 1.9 + s.ph))) * u * s.s, [P.ink, P.acc, P.c[1], P.c[2], P.c[0]][i % 5], 0.5 + 0.5 * Math.sin(t * 2.4 + s.ph));
    });
    g.restore();
  }

  // Which scenes this composition shows, in order (read from the template's controls).
  let PLAN = null;
  function plan() {
    if (PLAN) return PLAN;
    let c = null;
    try { c = (window.__dreamcut && window.__dreamcut.controls) || (typeof dc !== "undefined" && dc && dc.controls) || null; } catch (e) { c = null; }
    if (!c) return null;
    return (PLAN = ["title", "chart", "object", "people", "process", "compare", "closing"].filter((id) => Number(c[id + "_hold"]) > 0));
  }
  function stage(ctx, S, info) {
    const P = pal(S), g = ctx, { W, H } = P, t = info.t;
    const special = (s) => s === "title" || s === "closing" || !s;
    const ramp = info.next ? clamp((info.local - (info.hold - info.change)) / Math.max(0.01, info.change)) : 0;
    const wk = lerp(special(info.scene) ? 1 : 0.62, info.next ? (special(info.next) ? 1 : 0.62) : special(info.scene) ? 1 : 0.62, inout(ramp));
    let hk = 1;
    if (info.scene === "closing" && info.index > 0) hk = inout(info.local / Math.max(0.01, info.change));
    const lead = clamp(1 - info.local / (info.change * 1.6)), tail = info.next ? clamp((info.local - (info.hold - info.change * 1.6)) / (info.change * 1.6)) : 0;
    const boost = (info.index > 0 ? lead : 0) + tail;
    g.save();
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    if (S.paint) bloom(g, P, t);
    g.globalAlpha = 1;
    tunnel(g, P, t, wk);
    stars(g, P, t, wk, boost);
    drifters(g, P, t, wk);
    rails(g, P, t, 0.9, info);
    readouts(g, P, t, 1, info);
    if (info.scene === "title") titleHero(g, P, t, hk);
    else if (info.scene === "closing") finale(g, P, t, hk, info);
    if (info.scene === "title" || info.scene === "closing") heading(g, P, info.scene, t, info.local, info.hold, { change: info.change, first: info.index === 0 });
    // The title world leaves like any scene: its lines retract while the next drawing wipes in.
    const order = plan();
    if (order && info.index > 0 && order[info.index - 1] === "title" && info.local < info.change) {
      const ex = clamp(info.local / Math.max(0.01, info.change));
      ERASE = inout(clamp(ex * 1.35));
      try { titleHero(g, P, t, 1); } finally { ERASE = 0; }
      heading(g, P, "title", t, 99, 99, { change: info.change, exit: ex });
    }
    g.restore();
  }

  // ---- scene frame: a retrace beam wipes one scene into the next ----------------------------------------
  function seam(g, P, alongY, pos, t, k) {
    const { W, H, u } = P, ext = alongY ? W : H, pts = [];
    for (let x = 0; x <= ext + 1; x += Math.max(24, ext / 40)) {
      const j = Math.sin(x * 0.045 + t * 46) * 4 * u * Math.sin(Math.PI * k);
      pts.push(alongY ? x : pos + j, alongY ? pos + j : x);
    }
    const line = [pts];
    for (let m = 1; m <= 4; m++) {
      const off = -m * 20 * u;
      beam(g, P, [alongY ? [0, pos + off, W, pos + off] : [pos + off, 0, pos + off, H]], P.c[0], 1.2 * u, { a: 0.5 / m, halo: 0.3 });
    }
    beam(g, P, line, P.acc, 3 * u, { a: 1, halo: 1.4 });
    for (let i = 0; i < 7; i++) { const s = fr(Math.sin(i * 12.9898 + Math.floor(t * 40) * 3.7) * 43758.5453), at = s * ext; dot(g, P, alongY ? at : pos, alongY ? pos : at, (20 + 20 * s) * u, P.ink, 0.9); }
  }
  // Incoming scenes are revealed behind the retrace beam; outgoing scenes are erased, every line
  // retracting along its own path, so the next drawing never sits over leftover linework.
  const scene = (id, fn) => (ctx, S, box, p, d, info) => {
    const P = pal(S), g = ctx;
    const leaving = info.exit !== undefined;
    const start = info.t - info.local;
    let k = 1, wipe = false;
    if (!leaving && start > 0.05 && info.local < info.change) { k = inout(info.local / Math.max(0.01, info.change)); wipe = true; }
    const alongY = P.tall || Math.round(start * 10) % 2 === 0;
    const pos = k * (alongY ? P.H : P.W);
    g.save();
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    if (wipe) { g.beginPath(); if (alongY) g.rect(0, 0, P.W, pos); else g.rect(0, 0, pos, P.H); g.clip(); }
    if (leaving) ERASE = inout(clamp(info.exit * 1.35));
    try { fn(g, P, box, p, d, info); } finally { ERASE = 0; }
    g.restore();
    heading(g, P, id, info.t, info.local, info.hold, { change: info.change, exit: leaving ? info.exit : undefined, first: start <= 0.05 });
    if (wipe && k > 0 && k < 1) seam(g, P, alongY, pos, info.t, k);
  };

  // ---- headlines: the template's words, re-lettered as hollow double-line beam type -------------------
  const HEAD_ID = { title: "title", closing: "closing", chart: "chart-title", object: "object-title", people: "people-title", process: "process-title", compare: "compare-title" };
  const WORDS = {};
  function words(id) {
    if (WORDS[id]) return WORDS[id];
    const el = typeof document !== "undefined" && document.getElementById(id);
    const v = el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "";
    if (v) WORDS[id] = v;
    return v;
  }
  const tw = (str, cap) => Math.max(0, String(str).length * ADV - (ADV - 4)) * (cap / 6);
  const LAY = {};
  function layout(str, maxW, cap, minCap, maxLines) {
    const key = `${str}|${maxW | 0}|${cap | 0}|${maxLines}`;
    if (LAY[key]) return LAY[key];
    const ws = str.toUpperCase().split(" ").filter(Boolean);
    let c = cap, lines = [];
    for (;;) {
      lines = []; let cur = "";
      for (const w of ws) { const nx = cur ? cur + " " + w : w; if (cur && tw(nx, c) > maxW) { lines.push(cur); cur = w; } else cur = nx; }
      if (cur) lines.push(cur);
      if ((lines.length <= maxLines && lines.every((l) => tw(l, c) <= maxW)) || c <= minCap) break;
      c = Math.max(minCap, c * 0.95);
    }
    return (LAY[key] = { lines, cap: c });
  }
  // Each stroke is beamed wide, then the tube's black is run down its centre: an outlined letter.
  function hollow(g, P, polys, cap, col, q, a) {
    const w = Math.max(2.6, (cap / 6) * 0.95);
    beam(g, P, polys, col, w, { q, a, halo: 0.7 });
    const qq = q * (1 - ERASE);
    if (qq <= 0) return;
    g.save();
    g.globalCompositeOperation = "source-over"; g.lineCap = "round"; g.lineJoin = "round";
    g.strokeStyle = rgba(P.bg, 0.94); g.lineWidth = w * 0.42;
    g.beginPath(); trace(g, polys, qq); g.stroke();
    g.restore();
  }
  function heading(g, P, id, t, local, hold, o) {
    const str = words(HEAD_ID[id]);
    if (!str) return;
    const { W, H, u, tall } = P, side = (tall ? 90 : 140) * u, statement = id === "title" || id === "closing";
    const L = statement ? layout(str, W - side * 2, (tall ? 100 : 104) * u, 70 * u, tall ? 4 : 2) : layout(str, W - side * 2, (tall ? 78 : 76) * u, 66 * u, tall ? 3 : 2);
    const cap = L.cap, lh = cap * 1.55, align = statement ? "center" : "left", x = statement ? W / 2 : side;
    const lead = o.first ? 0.05 : o.change * 0.66, dur = Math.min(1.15, Math.max(0.5, hold * 0.3));
    let erase = o.exit !== undefined ? inout(clamp(o.exit * 1.5)) : 0;
    const keep = 1 - erase;
    let y = id === "title" ? H * 0.17 + 58 * u + cap : id === "closing" ? H * (tall ? 0.22 : 0.26) + cap : (tall ? 170 : 96) * u + cap;
    if (id === "title") {
      const kick = words("kicker");
      if (kick) {
        const kq = span(local, lead, lead + 0.45) * keep, kc = 40 * u, ky = H * 0.17;
        const kw = vtext(g, P, kick, W / 2, ky, kc, { align: "center", color: P.acc, q: kq, maxW: W - side * 2 - 160 * u });
        const bq = span(local, lead + 0.2, lead + 0.6) * keep, bx = kw / 2 + 26 * u, bh = kc * 0.62;
        beam(g, P, [[W / 2 - bx + 12 * u, ky - kc - 8 * u, W / 2 - bx, ky - kc - 8 * u, W / 2 - bx, ky + 8 * u, W / 2 - bx + 12 * u, ky + 8 * u], [W / 2 + bx - 12 * u, ky - kc - 8 * u, W / 2 + bx, ky - kc - 8 * u, W / 2 + bx, ky + 8 * u, W / 2 + bx - 12 * u, ky + 8 * u]], P.acc, 2.4 * u, { q: bq });
        for (const sd of [-1, 1]) dot(g, P, W / 2 + sd * (bx + 30 * u + 10 * u * Math.sin(t * 3)), ky - bh * 0.8, 16 * u, P.acc, bq * (0.6 + 0.4 * Math.sin(t * 5 + sd)));
      }
    }
    const polys = [];
    let wmax = 0;
    L.lines.forEach((ln, i) => { const T = textPolys(ln, x, y + i * lh, cap, { align, maxW: W - side * 2 }); polys.push(...T.polys); wmax = Math.max(wmax, T.w); });
    const q = inout(span(local, lead, lead + dur)) * keep;
    const flick = 0.9 + 0.1 * Math.sin(t * 9.3) * Math.sin(t * 2.1);
    hollow(g, P, polys, cap, P.ink, q, flick);
    // A rule under the words: ticks at its ends, dashes marching, a dwell dot riding it all hold long.
    const ry = y + (L.lines.length - 1) * lh + 30 * u, x0 = statement ? W / 2 - wmax / 2 : side, x1 = x0 + Math.max(wmax, 260 * u);
    const rq = span(local, lead + dur * 0.5, lead + dur + 0.35) * keep;
    if (rq > 0) {
      beam(g, P, [[x0, ry, x1, ry]], P.c[0], 1.6 * u, { q: rq, a: 0.7, dash: [26 * u, 12 * u], dashOff: -t * 50 * u, halo: 0.5 });
      beam(g, P, [[x0, ry - 10 * u, x0, ry + 10 * u], [x1, ry - 10 * u, x1, ry + 10 * u]], P.c[0], 2 * u, { a: rq });
      const ph = fr(t * 0.3), rx = lerp(x0, x1, ph < 0.5 ? ph * 2 : 2 - ph * 2);
      dot(g, P, rx, ry, 22 * u, P.acc, rq);
    }
  }

  // ---- chart: a bay of wireframe bars on a scrolling floor grid -----------------------------------------
  function chart(g, P, box, p, d, info) {
    const { u, tall } = P, t = info.t, n = d.values.length, max = Math.max(...d.values, 1);
    const bw0 = (box.w / n) * 0.5;
    const xl = box.x, xr = box.x + box.w - bw0 * 0.8, slot = (xr - xl) / n, bw = slot * 0.5;
    const yb = box.y + box.h - (tall ? 120 : 100) * u;
    const dep = 0.55 + 0.1 * Math.sin(t * 0.8), up = 0.34 + 0.05 * Math.cos(t * 0.7);
    const dx = bw * dep, dy = -bw * up;
    const cap = 96 * u;
    const hMax = yb + dy - 18 * u - box.y - cap;
    const xs = xl + fr(t * 0.3) * (xr - xl);
    // Floor: outline, depth lines that glide toward the viewer, ticks along the front edge.
    const fy = yb + 10 * u, D = 1.3, fq = 0.5 + 0.5 * span(p, 0, 0.3);
    beam(g, P, [[xl, fy, xr, fy, xr + dx * D, fy + dy * D, xl + dx * D, fy + dy * D, xl, fy]], P.c[0], 1.8 * u, { a: 0.85, q: fq });
    const floor = [];
    for (let j = 0; j < 6; j++) { const s = fr(j / 6 + t * 0.22); floor.push([xl + dx * D * s, fy + dy * D * s, xr + dx * D * s, fy + dy * D * s]); }
    for (let i = 0; i <= n * 2; i++) { const x = xl + ((xr - xl) * i) / (n * 2); floor.push([x, fy, x + dx * D, fy + dy * D]); }
    beam(g, P, floor, P.c[0], 1.1 * u, { a: 0.4, halo: 0.3 });
    const pads = [];
    for (let i = 0; i < n; i++) { const fx = xl + slot * (i + 0.5) - bw / 2; pads.push([fx, yb, fx + bw, yb, fx + bw + dx, yb + dy, fx + dx, yb + dy, fx, yb]); }
    beam(g, P, pads, P.c[0], 1.4 * u, { a: 0.55 * (1 - span(p, 0.1, 0.5) * 0.4), halo: 0.4 });
    for (let i = 0; i < n; i++) vtext(g, P, d.labels[i] || "", xl + slot * (i + 0.5), box.y + box.h - 6 * u, 42 * u, { align: "center", color: P.muted, maxW: slot * 0.92, a: 0.55 });
    const ticks = [];
    for (let x = xl, i = 0; x <= xr; x += 28 * u, i++) ticks.push([x, fy, x, fy + (i % 4 === 0 ? 18 : 9) * u]);
    beam(g, P, ticks, P.c[0], 1.2 * u, { a: 0.5 * fq, halo: 0.3 });
    const tops = [];
    d.values.forEach((value, i) => {
      const q = stag(p, i, n, 0.5), h = hMax * (value / max) * q;
      const cx = xl + slot * (i + 0.5), x = cx - bw / 2;
      const hot = i === d.highlight;
      const col = hot ? P.acc : P.c[0];
      const gk = 0.8 + 0.7 * Math.exp(-Math.pow((cx - xs) / (bw * 0.8), 2));
      if (q <= 0.01) return;
      const vis = [rect(x, yb, bw, -h), [x, yb - h, x + dx, yb - h + dy, x + bw + dx, yb - h + dy, x + bw, yb - h], [x + bw + dx, yb - h + dy, x + bw + dx, yb + dy, x + bw, yb]];
      const hid = [[x + dx, yb - h + dy, x + dx, yb + dy, x + bw + dx, yb + dy], [x, yb, x + dx, yb + dy]];
      const fill = [], cnt = Math.max(1, Math.floor(h / (15 * u)));
      for (let k = 0; k < cnt; k++) { const yy = yb - fr(k / cnt + t * 0.12) * h; fill.push([x, yy, x + bw, yy]); }
      beam(g, P, fill, col, 1 * u, { a: (hot ? 0.5 : 0.32) * gk, halo: 0.3 });
      const side = []; for (let k = 0; k < cnt; k += 2) { const yy = yb - (k / cnt) * h; side.push([x + bw, yy, x + bw + dx, yy + dy]); }
      beam(g, P, side, col, 1 * u, { a: 0.3 * gk, halo: 0.3 });
      beam(g, P, hid, col, 1.2 * u, { a: 0.22, halo: 0.3 });
      beam(g, P, vis, col, (hot ? 3 : 2.3) * u, { a: Math.min(1, gk) });
      const corners = [[x, yb - h], [x + bw, yb - h], [x + dx, yb - h + dy], [x + bw + dx, yb - h + dy], [x, yb], [x + bw, yb], [x + bw + dx, yb + dy]];
      for (const [px, py] of corners) dot(g, P, px, py, (hot ? 15 : 11) * u, col, gk * 0.9);
      tops.push(cx + dx / 2, yb - h + dy / 2);
      if (q > 0.05) {
        vtext(g, P, M.formatNumber(value * q, 0, d.prefix, d.suffix), cx + dx / 2, yb - h + dy - 18 * u, cap, { align: "center", color: hot ? P.acc : P.ink, maxW: slot * 0.96, a: clamp(q * 3) });
        vtext(g, P, d.labels[i] || "", cx, box.y + box.h - 6 * u, 42 * u, { align: "center", color: hot ? P.acc : P.muted, maxW: slot * 0.92, q: span(q, 0.1, 0.8) });
      }
      if (hot && q >= 1) {
        // Chevrons climbing above the highlighted bar, and sparks lifting off its top.
        const base = yb - h + dy - 18 * u - cap - 12 * u;
        for (let c = 0; c < 3; c++) {
          const s = fr(t * 0.9 + c / 3), cy = base - s * 70 * u, a = Math.sin(Math.PI * s);
          beam(g, P, [[cx + dx / 2 - 22 * u, cy + 12 * u, cx + dx / 2, cy - 8 * u, cx + dx / 2 + 22 * u, cy + 12 * u]], P.acc, 2.4 * u, { a });
        }
        for (let s = 0; s < 8; s++) {
          const f = fr(t * 0.7 + s / 8), sx = cx + dx / 2 + Math.sin(s * 5.1 + f * 4) * bw * 0.5;
          dot(g, P, sx, yb - h + dy - f * 120 * u, 9 * u, P.acc, (1 - f) * 0.9);
        }
      }
    });
    // A trend beam through the bar tops with a ship of light riding it.
    const tq = span(p, 0.62, 1);
    if (tops.length >= 4 && tq > 0) {
      beam(g, P, [tops], P.c[1], 2 * u, { a: 0.85, q: tq, dash: [16 * u, 12 * u], dashOff: -t * 46 * u });
      let tot = 0; const segs = [];
      for (let i = 2; i < tops.length; i += 2) { const l = Math.hypot(tops[i] - tops[i - 2], tops[i + 1] - tops[i - 1]); segs.push(l); tot += l; }
      let at = fr(t * 0.35) * tot * tq, i = 0;
      while (i < segs.length - 1 && at > segs[i]) { at -= segs[i]; i++; }
      const k = segs[i] ? at / segs[i] : 0;
      dot(g, P, lerp(tops[i * 2], tops[i * 2 + 2], k), lerp(tops[i * 2 + 1], tops[i * 2 + 3], k), 30 * u, P.c[1], 1);
    }
    // The sweep beam crossing the bay.
    beam(g, P, [[xs, fy, xs + dx * D, fy + dy * D, xs + dx * D, box.y + 30 * u]], P.c[2], 1.4 * u, { a: 0.35, halo: 0.5 });
  }

  // ---- object: a wireframe laptop (or phone) turning on a turntable, callouts on its parts --------------
  function object(g, P, box, p, d, info) {
    const { u, tall } = P, t = info.t, phone = d.kind === "phone";
    const w = phone ? Math.min(box.w * 0.3, box.h * (tall ? 0.34 : 0.4)) : Math.min(box.w * (tall ? 0.86 : 0.5), box.h * (tall ? 0.6 : 1.1));
    const cx = tall ? box.x + box.w / 2 : box.x + (phone ? box.w * 0.3 : w * 0.62);
    const cy = tall ? box.y + box.h * 0.31 : box.y + box.h * 0.5;
    const yaw = -0.18 + 0.2 * Math.sin(t * 0.5) + (1 - ease(p * 1.6)) * 1.6;
    const raw = view(cx, cy, w, yaw, 0.3, 0, w * 5);
    const lift = phone ? 0.5 * 1.95 : 0.3;
    const V = (x, y, z) => raw(x, y - lift, z);
    const q = ease(clamp(0.22 + p * 1.2));
    const col = P.c[0];
    // A turntable under the object, present from the first frame.
    for (let k = 0; k < 3; k++) {
      const rr = [0.62, 0.84, 1.06][k], tp = [];
      for (let i = 0; i <= 48; i++) { const a = (TAU * i) / 48; tp.push(V(Math.cos(a) * rr, phone ? 0 : 0, Math.sin(a) * rr * 0.9)); }
      beam(g, P, [tp.map(([x, y]) => [x, y]).flat()], P.c[k === 1 ? 1 : 0], 1.5 * u, { a: 0.55 - k * 0.1, halo: 0.4, dash: k === 1 ? [20 * u, 14 * u] : null, dashOff: -t * 40 * u });
    }
    // The screen surface: (a, b) in screen units to a point in space.
    let S3, sw, sh;
    if (phone) {
      sw = 0.82; sh = 1.75;
      S3 = (a, b) => V(a, 0.12 + b, -0.07);
      const body = { v: SOL.cube.v.map(([x, y, z]) => [x, y, z]), e: SOL.cube.e };
      wire(g, P, (x, y, z) => V(x * 0.5, y * 0.975 + 0.975, z * 0.07), body, col, 2.4 * u, { q: span(q, 0, 0.5), dots: true });
    } else {
      sw = 0.9; sh = 0.52;
      const lid = (a, b) => V(a, 0.04 + b * 0.966, 0.31 + b * 0.259);
      S3 = lid;
      wire(g, P, (x, y, z) => V(x * 0.5, y * 0.02 + 0.02, z * 0.31), SOL.cube, col, 2.4 * u, { q: span(q, 0, 0.45) });
      const frame = [lid(-0.5, 0), lid(0.5, 0), lid(0.5, 0.62), lid(-0.5, 0.62), lid(-0.5, 0)].map(([x, y]) => [x, y]).flat();
      beam(g, P, [frame], col, 2.4 * u, { a: 1, q: span(q, 0.1, 0.5) });
      for (const [a, b] of [[-0.5, 0], [0.5, 0], [0.5, 0.62], [-0.5, 0.62]]) { const pt = lid(a, b); dot(g, P, pt[0], pt[1], 15 * u, col, q); }
      const keys = [];
      for (let r = 0; r < 4; r++) for (let k = 0; k < 11; k++) { const a = V(-0.44 + k * 0.08, 0.04, 0.22 - r * 0.06), b = V(-0.44 + k * 0.08 + 0.05, 0.04, 0.22 - r * 0.06); keys.push([a[0], a[1], b[0], b[1]]); }
      const pad = [V(-0.12, 0.04, -0.14), V(0.12, 0.04, -0.14), V(0.12, 0.04, -0.28), V(-0.12, 0.04, -0.28), V(-0.12, 0.04, -0.14)].map(([x, y]) => [x, y]).flat();
      beam(g, P, [...keys, pad], col, 1.4 * u, { a: 0.6, q: span(q, 0.25, 0.7), halo: 0.4 });
      const li = Math.floor(t * 6) % 44, lr = Math.floor(li / 11), lk = li % 11, kp = V(-0.44 + lk * 0.08 + 0.025, 0.04, 0.22 - lr * 0.06);
      dot(g, P, kp[0], kp[1], 22 * u, P.acc, span(q, 0.6, 0.8));
    }
    // Screen contents: a preview with a sun and ridgeline, three tracks of clips, a playhead.
    const A = (a, b) => S3(phone ? a * 0.42 : a * 0.45, phone ? 0.1 + b * 1.62 : 0.03 + b * 0.55);
    const pv = [A(-0.9, 0.52), A(0.9, 0.52), A(0.9, 0.98), A(-0.9, 0.98), A(-0.9, 0.52)].map(([x, y]) => [x, y]).flat();
    const pq = span(q, 0.4, 0.65);
    beam(g, P, [pv], P.c[1], 2 * u, { a: 0.95, q: pq });
    const ridge = [[-0.9, 0.6], [-0.65, 0.78], [-0.45, 0.66], [-0.15, 0.9], [0.15, 0.64], [0.45, 0.76], [0.9, 0.58]].map(([a, b]) => A(a, b)).map(([x, y]) => [x, y]).flat();
    beam(g, P, [ridge], P.c[1], 1.6 * u, { a: 0.8, q: pq });
    const sunA = 0.5 + 0.28 * Math.sin(t * 0.6), sunC = A(sunA, 0.82), sunR = A(sunA + 0.14, 0.82);
    beam(g, P, [circ(sunC[0], sunC[1], Math.hypot(sunR[0] - sunC[0], sunR[1] - sunC[1]), 18)], P.acc, 1.8 * u, { a: 0.9, q: pq });
    dot(g, P, sunC[0], sunC[1], 20 * u, P.acc, pq);
    const clips = [[0, 0.34], [0.4, 0.24], [0.7, 0.3]];
    for (let r = 0; r < 3; r++) {
      const yb = 0.38 - r * 0.15, polys = [];
      clips.forEach(([c0, cl], i) => {
        const sh0 = span(q, 0.55 + r * 0.06 + i * 0.05, 0.8 + r * 0.06 + i * 0.05);
        if (sh0 <= 0) return;
        const a0 = -0.9 + (c0 + r * 0.04) * 1.8, a1 = a0 + cl * 1.8 * sh0;
        polys.push(rect2(A, a0, yb, a1, yb + 0.1));
      });
      beam(g, P, polys, r === 1 ? P.acc : P.c[2], 1.8 * u, { a: 0.9 });
    }
    const ph = -0.9 + 1.8 * fr(t * 0.2);
    const h0 = A(ph, 0.04), h1 = A(ph, 1.0);
    beam(g, P, [[h0[0], h0[1], h1[0], h1[1]]], P.ink, 2 * u, { a: 0.9 * span(q, 0.7, 0.9) });
    dot(g, P, h1[0], h1[1], 20 * u, P.ink, span(q, 0.7, 0.9));
    // A scan beam sweeping the glass.
    const sb = fr(t * 0.33), s0 = A(-0.9, 0.04 + sb * 0.96), s1 = A(0.9, 0.04 + sb * 0.96);
    beam(g, P, [[s0[0], s0[1], s1[0], s1[1]]], P.c[2], 1.8 * u, { a: 0.6 * span(q, 0.5, 0.8), halo: 1 });
    // An orbit ring with a satellite.
    const R = phone ? 0.85 : 0.82, rp = [];
    for (let i = 0; i <= 64; i++) { const a = (TAU * i) / 64; rp.push(V(Math.cos(a) * R, phone ? 0.97 : 0.18, Math.sin(a) * R * 0.9)); }
    const RF = [], RB = []; split(rp, V(0, phone ? 0.97 : 0.18, 0)[2], RF, RB);
    beam(g, P, RB, P.c[1], 1.1 * u, { a: 0.22 * span(q, 0.3, 0.6), halo: 0.3 });
    beam(g, P, RF, P.c[1], 1.8 * u, { a: 0.7 * span(q, 0.3, 0.6) });
    for (let k = 0; k < 6; k++) {
      const a = t * 0.9 - k * 0.07, pt = V(Math.cos(a) * R, phone ? 0.97 : 0.18, Math.sin(a) * R * 0.9);
      dot(g, P, pt[0], pt[1], (k ? 14 - k * 2 : 26) * u, P.acc, (1 - k * 0.16) * span(q, 0.4, 0.7));
    }
    // Callouts: pulsing anchors on the glass, leaders to the labels.
    const anchors = [A(0.5, 0.75), A(-0.05, 0.38 - 0.15 + 0.05), A(-0.6, 0.38 - 0.3 + 0.05)];
    const labelX = tall ? box.x + 70 * u : box.x + box.w * 0.64;
    d.callouts.forEach((label, i) => {
      const c = span(p, 0.4 + i * 0.12, 0.64 + i * 0.12);
      if (!label) return;
      const [ax, ay] = anchors[i];
      const ly = tall ? box.y + box.h * (0.66 + 0.14 * i) : box.y + box.h * (0.2 + 0.3 * i);
      const ex = labelX - 20 * u, ey = ly - 14 * u;
      if (c > 0) {
        const pulse = fr(t * 0.8 + i / 3);
        beam(g, P, [circ(ax, ay, (10 + 26 * pulse) * u, 20)], P.acc, 1.6 * u, { a: (1 - pulse) * c });
        dot(g, P, ax, ay, 22 * u, P.acc, c);
        beam(g, P, [[ax, ay, ex, ey]], P.acc, 2 * u, { a: 0.95, q: ease(c * 1.6) });
        const lk = fr(t * 0.6 + i * 0.3);
        if (c >= 1) dot(g, P, lerp(ax, ex, lk), lerp(ay, ey, lk), 14 * u, P.ink, 0.9);
        beam(g, P, [[ex, ey, ex + 14 * u, ey]], P.acc, 2 * u, { a: c });
      }
      if (c > 0.3) vtext(g, P, label, labelX, ly, 42 * u, { color: P.ink, q: span(c, 0.3, 1), maxW: tall ? box.w - 100 * u : box.x + box.w - labelX });
    });
  }
  function rect2(A, a0, b0, a1, b1) { return [A(a0, b0), A(a1, b0), A(a1, b1), A(a0, b1), A(a0, b0)].map(([x, y]) => [x, y]).flat(); }

  // ---- people: hovering vector pilots on teleport pads ------------------------------------------------
  function pilot(g, P, cx, base, size, col, hot, q, t, i) {
    const u = P.u;
    const yaw = 0.7 * Math.sin(t * 0.9 + i * 1.3) + (1 - q) * TAU;
    const raw = view(cx, base - size * 0.5, size, yaw, 0.24, 0.03 * Math.sin(t + i), size * 5);
    const V = (x, y, z) => raw(x, y - 0.5, z);
    const bob = Math.sin(t * 1.6 + i * 1.1) * 0.025;
    const lw = (hot ? 2.6 : 2.1) * u;
    // Pad: concentric rings, a column of light, sonar pulses.
    const ringAt = (r, y) => { const o = []; for (let k = 0; k <= 40; k++) { const a = (TAU * k) / 40; o.push(V(Math.cos(a) * r, y, Math.sin(a) * r)); } return o; };
    const pads = [];
    for (const r of [0.34, 0.24, 0.13]) { const F = [], B = []; split(ringAt(r, 0.02), 0, F, B); pads.push(...F, ...B); }
    beam(g, P, pads.map((s) => s), col, lw * 0.9, { a: 0.8, q });
    for (let s = 0; s < 3; s++) {
      const f = fr(t * 0.6 + i * 0.2 + s / 3), r = 0.1 + f * 0.5, pp = ringAt(r, 0.02).map(([x, y]) => [x, y]).flat();
      beam(g, P, [pp], col, 1.2 * u, { a: (1 - f) * 0.5 * q, halo: 0.3 });
    }
    const hipY = 0.3 + bob;
    const column = [];
    for (let k = 0; k < 8; k++) { const a = (TAU * k) / 8 + t * 0.4, p0 = V(Math.cos(a) * 0.24, 0.02, Math.sin(a) * 0.24), p1 = V(Math.cos(a) * 0.1, hipY, Math.sin(a) * 0.1); column.push([p0[0], p0[1], p1[0], p1[1]]); }
    beam(g, P, column, col, 1 * u, { a: 0.4 * q, halo: 0.3, q });
    // Torso: a tapered box.
    const tv = [[-0.09, hipY, -0.06], [0.09, hipY, -0.06], [0.09, hipY, 0.06], [-0.09, hipY, 0.06], [-0.2, 0.58, -0.08], [0.2, 0.58, -0.08], [0.2, 0.58, 0.08], [-0.2, 0.58, 0.08]].map(([x, y, z]) => V(x, y, z));
    const te = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    beam(g, P, te.map(([a, b]) => [tv[a][0], tv[a][1], tv[b][0], tv[b][1]]), col, lw, { a: 1, q });
    for (const p of tv) dot(g, P, p[0], p[1], 8 * u * (hot ? 1.4 : 1.1) * 1.4, col, 0.9 * q);
    // Arms swing; hands are dwell dots.
    const sway = Math.sin(t * 1.8 + i) * 0.05;
    for (const sd of [-1, 1]) {
      const s0 = V(0.2 * sd, 0.56, 0), s1 = V(0.3 * sd, 0.44 + sway * sd, 0.04), s2 = V(0.27 * sd, 0.32 - sway * sd, 0.1);
      beam(g, P, [[s0[0], s0[1], s1[0], s1[1], s2[0], s2[1]]], col, lw, { a: 1, q });
      dot(g, P, s2[0], s2[1], 20 * u, hot ? P.acc : col, q);
    }
    // Head: a faceted ellipsoid with a glowing visor.
    const HV = (x, y, z) => V(x, y + 0.76, z);
    const sp = sphere(HV, [-45, 0, 45], 6, 24, 0.14, 0.15, 0.13);
    beam(g, P, sp.B, col, 1.1 * u, { a: 0.25, q, halo: 0.3 });
    beam(g, P, sp.F, col, lw, { a: 1, q });
    const visor = [[], []];
    for (const [ri, lat] of [8, -12].entries()) {
      const la = (lat * Math.PI) / 180, pts = [];
      for (let k = 0; k <= 16; k++) { const lo = (-60 + (120 * k) / 16) * (Math.PI / 180); pts.push(HV(0.14 * Math.cos(la) * Math.sin(lo) * 1.03, 0.15 * Math.sin(la), -0.13 * Math.cos(la) * Math.cos(lo) * 1.03)); }
      split(pts, 0, visor[ri], []);
    }
    const vcol = hot ? P.acc : P.c[1];
    beam(g, P, [...visor[0], ...visor[1]], vcol, lw * 1.2, { a: 1, q });
    const lo = (45 * Math.PI / 180) * Math.sin(t * 2.1 + i * 1.7), eye = HV(0.14 * Math.sin(lo), -0.01, -0.13 * Math.cos(lo));
    if (eye[2] < 0) dot(g, P, eye[0], eye[1], 24 * u, P.ink, q);
    const an0 = HV(0, 0.15, 0), an1 = HV(0, 0.26, 0);
    beam(g, P, [[an0[0], an0[1], an1[0], an1[1]]], col, lw * 0.8, { a: 0.9, q });
    dot(g, P, an1[0], an1[1], 20 * u, hot ? P.acc : P.c[2], q * (0.5 + 0.5 * Math.sin(t * 5 + i)));
    const nk = V(0, 0.58, 0), nk2 = V(0, 0.62, 0);
    beam(g, P, [[nk[0], nk[1], nk2[0], nk2[1]]], col, lw, { a: 0.8, q });
  }
  function people(g, P, box, p, d, info) {
    const { u, tall } = P, t = info.t;
    const n = Math.max(2, Math.min(6, Math.round(d.count)));
    const cols = tall && n > 2 ? 2 : n, rows = Math.ceil(n / cols);
    const slot = box.w / cols, rowH = box.h / rows;
    const size = tall ? Math.min(slot * 0.9, rowH * 0.6) : Math.min(box.h * 0.64, slot * 1.1);
    const hotI = Math.min(n - 1, d.highlight);
    for (let r = 0; r < rows; r++) {
      const by = tall ? box.y + rowH * (r + 0.88) : box.y + box.h * 0.9;
      beam(g, P, [[box.x, by + 8 * u, box.x + box.w * ease(p * 2), by + 8 * u]], P.c[0], 1.4 * u, { a: 0.5, halo: 0.4 });
    }
    for (let i = 0; i < n; i++) {
      const q = stag(p, i, n, 0.5), r = Math.floor(i / cols), inRow = Math.min(cols, n - r * cols);
      const cx = box.x + box.w / 2 + (i % cols - (inRow - 1) / 2) * slot;
      const base = tall ? box.y + rowH * (r + 0.88) : box.y + box.h * 0.9;
      const hot = i === hotI;
      const col = hot ? P.acc : [P.c[0], P.c[2], P.c[1]][i % 3];
      if (q <= 0.01) {
        for (const rr of [0.34, 0.24, 0.13]) beam(g, P, [circ(cx, base - size * 0.02, size * rr, 40).map((v, k) => (k % 2 ? base - size * 0.02 + (v - base + size * 0.02) * 0.4 : v))], col, 1.8 * u, { a: 0.55, halo: 0.4 });
        continue;
      }
      pilot(g, P, cx, base, size * (hot ? 1.08 : 1), col, hot, q, t, i);
      if (hot && q > 0.5) {
        const bx = size * (0.46 + 0.02 * Math.sin(t * 3)), by0 = base - size * 1.06, by1 = base + 14 * u, L = 28 * u;
        beam(g, P, [[cx - bx, by0 + L, cx - bx, by0, cx - bx + L, by0], [cx + bx - L, by0, cx + bx, by0, cx + bx, by0 + L], [cx - bx, by1 - L, cx - bx, by1, cx - bx + L, by1], [cx + bx - L, by1, cx + bx, by1, cx + bx, by1 - L]], P.acc, 2.4 * u, { a: span(q, 0.5, 1) });
      }
      const label = i < d.badges.length ? d.badges[i] : String(i + 1).padStart(2, "0");
      if (label && q > 0.35) {
        const cap = 42 * u, bq = span(q, 0.35, 0.9), mw = slot * 0.96 - 44 * u;
        const tw = textPolys(label, 0, 0, cap, { maxW: mw }).w;
        const bw = tw + 44 * u, bh = 70 * u, by = base - size * 1.06 - 84 * u;
        beam(g, P, [cham(cx - bw / 2, by, bw, bh, 12 * u)], col, 2 * u, { a: 0.95, q: bq });
        vtext(g, P, label, cx, by + bh / 2, cap, { align: "center", mid: true, color: hot ? P.acc : P.ink, maxW: mw, q: span(bq, 0.3, 1) });
        beam(g, P, [[cx, by + bh, cx, base - size * 1.06]], col, 1.4 * u, { a: 0.6 * bq, halo: 0.4 });
      }
      if (!tall) {
        const metersTop = base + 56 * u, metersH = box.y + box.h - metersTop;
        if (metersH > 130 * u) {
          const mh = metersH - 10 * u, lvl = clamp(0.5 + 0.3 * Math.sin(t * 1.5 + i * 1.9) + 0.15 * Math.sin(t * 4.3 + i)), segs = 12, segH = mh / segs;
          const lit = [], off = [];
          for (let s = 0; s < segs; s++) (s < Math.round(segs * lvl * q) ? lit : off).push(rect(cx - slot * 0.22, metersTop + mh - (s + 1) * segH + 3 * u, slot * 0.44, segH - 6 * u));
          beam(g, P, off, col, 1 * u, { a: 0.2, halo: 0.2 });
          beam(g, P, lit, col, 1.6 * u, { a: 0.85 });
        }
      }
    }
  }

  // ---- process: stations on a flight lane, a ship delivering between them ----------------------------------
  function stationIcon(g, P, kind, cx, cy, R, col, q, t, i) {
    const u = P.u, lw = 2.4 * u;
    const raw = view(cx, cy, R, t * 0.7 + i, 0.35, 0, R * 5);
    const V = raw;
    if (kind === "file") {
      for (let k = 0; k < 3; k++) {
        const z = k * 0.22 - 0.22, pts = [V(-0.55, 0.7, z), V(0.55, 0.7, z), V(0.55, -0.7, z), V(-0.55, -0.7, z), V(-0.55, 0.7, z)].map(([x, y]) => [x, y]).flat();
        beam(g, P, [pts], k === 2 ? P.acc : col, lw, { a: k === 2 ? 1 : 0.55, q });
      }
      const rows = [];
      for (let r = 0; r < 5; r++) { const a = V(-0.4, 0.45 - r * 0.2, 0.22), b = V(-0.4 + (r % 2 ? 0.55 : 0.8) * (0.6 + 0.4 * Math.sin(t * 2 + r)), 0.45 - r * 0.2, 0.22); rows.push([a[0], a[1], b[0], b[1]]); }
      beam(g, P, rows, P.ink, 1.6 * u, { a: 0.9, q: span(q, 0.3, 1) });
    } else if (kind === "spark") {
      wire(g, P, V, SOL.octa, col, lw, { q, sx: 0.7, sy: 0.9, sz: 0.7 });
      const rays = [];
      for (let k = 0; k < 8; k++) { const a = (TAU * k) / 8 + t * 0.5, r0 = 1.0 + 0.05 * Math.sin(t * 3 + k), r1 = r0 + 0.25 + 0.2 * Math.sin(t * 4 + k * 2); rays.push([cx + Math.cos(a) * R * r0, cy + Math.sin(a) * R * r0, cx + Math.cos(a) * R * r1, cy + Math.sin(a) * R * r1]); }
      beam(g, P, rays, P.acc, 2 * u, { a: 0.9 * q });
      dot(g, P, cx, cy, R * 0.5, P.acc, q);
    } else if (kind === "eye") {
      const a1 = [], a2 = [];
      for (let k = 0; k <= 20; k++) { const x = -0.95 + (1.9 * k) / 20, y = 0.55 * (1 - Math.pow(x / 0.95, 2)); a1.push(V(x, y, 0)); a2.push(V(x, -y, 0)); }
      const f = (arr) => arr.map(([x, y]) => [x, y]).flat();
      beam(g, P, [f(a1), f(a2)], col, lw, { a: 1, q });
      const px = 0.35 * Math.sin(t * 1.4 + i), pp = []; for (let k = 0; k <= 20; k++) { const a = (TAU * k) / 20; pp.push(V(px + Math.cos(a) * 0.22, Math.sin(a) * 0.22, 0.02)); }
      beam(g, P, [f(pp)], P.acc, 2 * u, { a: 1, q });
      const pc = V(px, 0, 0.02); dot(g, P, pc[0], pc[1], R * 0.4, P.ink, q);
      const rr = []; for (let k = 0; k <= 40; k++) { const a = (TAU * k) / 40; rr.push([cx + Math.cos(a) * R * 1.12, cy + Math.sin(a) * R * 1.12]); }
      beam(g, P, [rr.flat()], P.c[1], 1.2 * u, { a: 0.4 * q, dash: [14 * u, 10 * u], dashOff: -t * 30 * u });
    } else {
      const hex = []; for (let k = 0; k <= 6; k++) { const a = (TAU * k) / 6; hex.push(V(Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0)); }
      const hex2p = hex.map(([x, y, z]) => [x, y, z]);
      beam(g, P, [hex.map(([x, y]) => [x, y]).flat()], col, lw, { a: 1, q });
      const hx = []; for (let k = 0; k <= 6; k++) { const a = (TAU * k) / 6; hx.push(V(Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0.3)); }
      beam(g, P, [hx.map(([x, y]) => [x, y]).flat()], col, lw * 0.8, { a: 0.5, q });
      beam(g, P, hex2p.slice(0, 6).map((h, k) => [h[0], h[1], hx[k][0], hx[k][1]]), col, 1.2 * u, { a: 0.5, q });
      const ck = [V(-0.45, 0.0, 0.15), V(-0.12, -0.38, 0.15), V(0.5, 0.34, 0.15)].map(([x, y]) => [x, y]).flat();
      beam(g, P, [ck], P.acc, lw * 1.4, { a: 1, q: span(q, 0.3, 1) * (0.55 + 0.45 * Math.abs(Math.sin(t * 2.4))) });
      dotsOf(g, P, [hex.map(([x, y]) => [x, y]).flat()], col, 11 * u, q);
    }
  }
  function lane(P, pts, at) {
    let tot = 0; const segs = [];
    for (let i = 2; i < pts.length; i += 2) { const l = Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]); segs.push(l); tot += l; }
    let a = clamp(at) * tot, i = 0;
    while (i < segs.length - 1 && a > segs[i]) { a -= segs[i]; i++; }
    const k = segs[i] ? a / segs[i] : 0;
    return { x: lerp(pts[i * 2], pts[i * 2 + 2], k), y: lerp(pts[i * 2 + 1], pts[i * 2 + 3], k), ang: Math.atan2(pts[i * 2 + 3] - pts[i * 2 + 1], pts[i * 2 + 2] - pts[i * 2]) };
  }
  function dart(g, P, x, y, ang, s, a) {
    const c = Math.cos(ang), sn = Math.sin(ang), pt = (px, py) => [x + px * c * s - py * sn * s, y + px * sn * s + py * c * s];
    const nose = pt(1.2, 0), l = pt(-0.9, -0.75), r = pt(-0.9, 0.75), m = pt(-0.45, 0), tail = pt(-1.9 - 0.4 * Math.sin(x * 0.2), 0);
    beam(g, P, [[nose[0], nose[1], l[0], l[1], m[0], m[1], r[0], r[1], nose[0], nose[1]]], P.c[0], 2.4 * P.u, { a });
    beam(g, P, [[m[0], m[1], tail[0], tail[1]]], P.acc, 2.2 * P.u, { a: a * 0.9 });
    dot(g, P, nose[0], nose[1], s * 0.5, P.ink, a); dot(g, P, m[0], m[1], s * 0.6, P.acc, a);
  }
  function process(g, P, box, p, d, info) {
    const { u, tall } = P, t = info.t, n = d.steps.length;
    const kinds = ["file", "spark", "eye", "check"];
    const slotW = box.w / n, slotH = box.h / n;
    const R = tall ? Math.min(box.w * 0.19, slotH * 0.32) : Math.min(slotW * 0.28, box.h * 0.26);
    const cs = [], ys = [];
    for (let i = 0; i < n; i++) { cs.push(tall ? box.x + box.w * 0.24 : box.x + slotW * (i + 0.5)); ys.push(tall ? box.y + slotH * (i + 0.5) : box.y + box.h * 0.36); }
    // The lane: two dashed rails through the stations, marching, with data packets riding along.
    const path = []; for (let i = 0; i < n; i++) path.push(cs[i], ys[i]);
    const lq = 0.35 + 0.65 * span(p, 0.1, 0.85);
    const off = 11 * u;
    const rails = tall ? [path.map((v, k) => (k % 2 ? v : v - off)), path.map((v, k) => (k % 2 ? v : v + off))] : [path.map((v, k) => (k % 2 ? v - off : v)), path.map((v, k) => (k % 2 ? v + off : v))];
    for (const r of rails) beam(g, P, [r], P.c[0], 1.4 * u, { a: 0.55, q: lq, dash: [18 * u, 14 * u], dashOff: -t * 60 * u * (tall ? 1 : 1) });
    if (lq >= 1) for (let k = 0; k < 8; k++) { const s = lane(P, path, fr(t * 0.2 + k / 8)); dot(g, P, s.x, s.y, 12 * u, P.c[2], 0.8); }
    for (let i = 0; i < n; i++) {
      const q = stag(p, i, n, 0.55), cx = cs[i], cy = ys[i];
      if (q <= 0.01) {
        // Not built yet: the station's icon waits as a dim outline inside a turning target ring.
        g.save(); g.globalAlpha *= 0.3 + 0.08 * Math.sin(t * 3 + i);
        stationIcon(g, P, i === n - 1 ? "check" : kinds[i % 3], cx, cy, R, P.c[0], 1, t, i);
        g.restore();
        beam(g, P, [circ(cx, cy, R * 1.25, 48)], P.c[0], 1.4 * u, { a: 0.45, dash: [18 * u, 14 * u], dashOff: -t * 40 * u, halo: 0.4 });
        const py = cy + R * 1.18;
        beam(g, P, [circ(cx, py, R * 0.95, 40).map((v, k) => (k % 2 ? py + (v - py) * 0.3 : v))], P.c[0], 1.8 * u, { a: 0.5, halo: 0.4 });
        beam(g, P, [ngon(cx - R * 1.05, cy - R * 1.12, 34 * u, 6, Math.PI / 6)], P.c[0], 2 * u, { a: 0.5 });
        vtext(g, P, String(i + 1).padStart(2, "0"), cx - R * 1.05, cy - R * 1.12, 38 * u, { align: "center", mid: true, color: P.ink, a: 0.5 });
        continue;
      }
      const kind = i === n - 1 ? "check" : kinds[i % 3];
      const hot = i === n - 1;
      const col = hot ? P.acc : [P.c[0], P.c[1], P.c[2]][i % 3];
      // Pad rings under each icon, hex badge with the step number.
      const padY = cy + R * 1.18;
      beam(g, P, [circ(cx, padY, R * 0.95, 40).map((v, k) => (k % 2 ? padY + (v - padY) * 0.3 : v))], col, 1.8 * u, { a: 0.8, q });
      for (let s = 0; s < 2; s++) { const f = fr(t * 0.5 + i * 0.2 + s / 2); beam(g, P, [circ(cx, padY, R * (0.3 + f * 0.9), 40).map((v, k) => (k % 2 ? padY + (v - padY) * 0.3 : v))], col, 1.2 * u, { a: (1 - f) * 0.6 * q, halo: 0.3 }); }
      stationIcon(g, P, kind, cx, cy, R, col, q, t, i);
      const bx = cx - R * 1.05, by = cy - R * 1.12, hr = 34 * u;
      beam(g, P, [ngon(bx, by, hr, 6, Math.PI / 6)], col, 2 * u, { a: 0.95, q });
      vtext(g, P, String(i + 1).padStart(2, "0"), bx, by, 38 * u, { align: "center", mid: true, color: hot ? P.acc : P.ink, q: span(q, 0.4, 1) });
      const lx = tall ? cx + R * 1.5 : cx, ly = tall ? cy + 16 * u : padY + 96 * u;
      vtext(g, P, d.steps[i], lx, ly, 46 * u, { align: tall ? "left" : "center", color: hot ? P.acc : P.ink, maxW: tall ? box.x + box.w - lx : slotW * 0.94, q: span(q, 0.35, 1) });
    }
    if (lq > 0.3 && n > 1) {
      const s = lane(P, path, fr(t * 0.16));
      for (let k = 6; k >= 1; k--) { const sg = lane(P, path, fr(t * 0.16 - k * 0.006)); dart(g, P, sg.x, sg.y, sg.ang, 24 * u, 0.5 / k); }
      dart(g, P, s.x, s.y, s.ang, 30 * u, 1);
    }
  }

  // ---- compare: two score panels with dials, segmented meters, a delta tag ---------------------------------
  function compare(g, P, box, p, d, info) {
    const { u, tall } = P, t = info.t;
    const gap = (tall ? 90 : 120) * u;
    const pw = tall ? box.w : (box.w - gap) / 2, ph = tall ? (box.h - gap) / 2 : box.h * 0.9;
    const maxV = Math.max(d.leftValue, d.rightValue, 1);
    const sides = [[d.left, d.leftValue, P.c[0], false], [d.right, d.rightValue, P.acc, true]];
    sides.forEach(([label, value, col, win], i) => {
      const q = stag(p, i, 2, 0.35);
      const x = tall ? box.x : box.x + i * (pw + gap), y = tall ? box.y + i * (ph + gap) : box.y + (box.h - ph) / 2;
      if (q <= 0.01) {
        beam(g, P, [cham(x, y, pw, ph, 26 * u)], col, 2.2 * u, { a: 0.55 });
        vtext(g, P, label, x + 40 * u, y + 76 * u, 42 * u, { color: win ? P.acc : P.ink, maxW: pw - 80 * u, a: 0.6 });
        return;
      }
      const pulse = win ? 0.75 + 0.25 * Math.sin(t * 4) : 1;
      beam(g, P, [cham(x, y, pw, ph, 26 * u)], col, 2.6 * u, { a: pulse, q: span(q, 0, 0.6) });
      beam(g, P, [cham(x + 12 * u, y + 12 * u, pw - 24 * u, ph - 24 * u, 18 * u)], col, 1.2 * u, { a: 0.35, q: span(q, 0, 0.7), halo: 0.3 });
      for (const [px, py] of [[x + 26 * u, y], [x + pw, y + ph - 26 * u]]) dot(g, P, px, py, 16 * u, col, q);
      vtext(g, P, label, x + 40 * u, y + 76 * u, 42 * u, { color: win ? P.acc : P.ink, maxW: pw - 80 * u, q: span(q, 0.2, 0.8) });
      // The dial: a semicircle with ticks and a needle sweeping to the value.
      const r = Math.min(pw * (tall ? 0.28 : 0.2), ph * 0.34), cx = tall ? x + pw * 0.3 : x + pw * 0.28, cy = y + ph * 0.58;
      const a0 = Math.PI * 1.05, a1 = Math.PI * 1.95;
      beam(g, P, [circ(cx, cy, r, 40, a0, a1)], col, 2.4 * u, { a: 1, q: span(q, 0.1, 0.6) });
      const tk = [];
      for (let k = 0; k <= 10; k++) { const a = lerp(a0, a1, k / 10), L = k % 5 === 0 ? 0.2 : 0.1; tk.push([cx + Math.cos(a) * r * (1 - L), cy + Math.sin(a) * r * (1 - L), cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
      beam(g, P, tk, col, 1.6 * u, { a: 0.8, q: span(q, 0.2, 0.7) });
      const target = value / maxV, na = lerp(a0, a1, clamp(ease(span(q, 0.3, 1)) * target + 0.015 * Math.sin(t * 9 + i * 2) * span(q, 0.9, 1)));
      beam(g, P, [[cx, cy, cx + Math.cos(na) * r * 0.92, cy + Math.sin(na) * r * 0.92]], win ? P.acc : P.ink, 3 * u, { a: 1, halo: 1.2 });
      dot(g, P, cx, cy, 26 * u, col, q); dot(g, P, cx + Math.cos(na) * r * 0.92, cy + Math.sin(na) * r * 0.92, 24 * u, P.ink, q);
      // The key number.
      const nx = tall ? x + pw * 0.62 : x + pw * 0.55;
      vtext(g, P, M.formatNumber(value * ease(span(q, 0.3, 1)), 0, d.prefix, d.suffix), nx, tall ? y + ph * 0.62 : y + ph * 0.66, Math.min(130 * u, ph * 0.3), { color: col, maxW: x + pw - nx - 36 * u, a: clamp(q * 3) });
      // A segmented meter along the bottom: lit cells ripple.
      const segs = 20, mx = x + 40 * u, mw = pw - 80 * u, my = y + ph - 56 * u, cw = mw / segs;
      const lit = Math.round(segs * target * ease(span(q, 0.4, 1)));
      const on = [], offc = [];
      for (let s = 0; s < segs; s++) (s < lit ? on : offc).push(rect(mx + s * cw + 3 * u, my, cw - 6 * u, 26 * u));
      beam(g, P, offc, col, 1 * u, { a: 0.22, halo: 0.2 });
      beam(g, P, on, col, 1.8 * u, { a: 0.9 });
      const hs = Math.floor(fr(t * 0.9 + i * 0.4) * Math.max(1, lit));
      if (lit > 0) dot(g, P, mx + hs * cw + cw / 2, my + 13 * u, 34 * u, P.ink, 0.9);
      if (win) {
        // Rays flare from the winning number.
        const rays = [];
        for (let k = 0; k < 14; k++) { const a = (TAU * k) / 14 + t * 0.4, r0 = 0.9 + 0.1 * Math.sin(t * 3 + k), r1 = r0 + 0.12 + 0.12 * Math.sin(t * 5 + k * 1.7); rays.push([cx + Math.cos(a) * r * r0, cy + Math.sin(a) * r * r0, cx + Math.cos(a) * r * r1, cy + Math.sin(a) * r * r1]); }
        beam(g, P, rays.filter((rr) => rr[1] < cy + 2), P.acc, 1.6 * u, { a: 0.6 * q });
      }
    });
    // The change between them, with chevrons pointing the way it moved.
    const q2 = span(p, 0.55, 0.9);
    if (q2 > 0 && d.leftValue > 0) {
      const pct = Math.round(((d.rightValue - d.leftValue) / d.leftValue) * 100), down = pct < 0;
      const cx = tall ? box.x + box.w / 2 : box.x + pw + gap / 2, cy = tall ? box.y + ph + gap / 2 : box.y + box.h / 2;
      const rr = (tall ? 54 : 62) * u;
      beam(g, P, [ngon(cx, cy, rr, 8, t * 0.5)], P.c[1], 2.2 * u, { a: q2 });
      beam(g, P, [ngon(cx, cy, rr * 0.72, 8, -t * 0.7)], P.c[1], 1.2 * u, { a: 0.5 * q2, halo: 0.3 });
      vtext(g, P, "VS", cx, cy, 46 * u, { align: "center", mid: true, color: P.ink, q: q2 });
      const tag = (pct > 0 ? "+" : pct < 0 ? "-" : "") + Math.abs(pct) + "%";
      const tx = tall ? box.x + box.w - 40 * u : box.x + box.w - 40 * u, ty = tall ? box.y + ph + gap + 78 * u : box.y + (box.h - ph) / 2 + 76 * u;
      vtext(g, P, tag, tx - 60 * u, ty, 54 * u, { align: "right", color: P.c[2], q: q2 });
      for (let c = 0; c < 2; c++) {
        const s = fr(t * 0.8 + c * 0.5), yy = ty - 30 * u + (down ? s : -s) * 18 * u, a = Math.sin(Math.PI * s);
        const ax = tx - 24 * u, dir = down ? 1 : -1;
        beam(g, P, [[ax - 20 * u, yy - 10 * u * dir, ax, yy + 10 * u * dir, ax + 20 * u, yy - 10 * u * dir]], P.c[2], 2.4 * u, { a: a * q2 });
      }
    }
  }

  // ---- the CRT over everything ----------------------------------------------------------------------
  const TILE = new Map();
  function tile(h, light) {
    const key = h + (light ? "l" : "d");
    let c = TILE.get(key);
    if (c) return c;
    c = document.createElement("canvas"); c.width = 4; c.height = h;
    const g = c.getContext("2d");
    g.clearRect(0, 0, 4, h);
    g.fillStyle = light ? "rgba(40,30,20,0.07)" : "rgba(0,0,0,0.30)";
    g.fillRect(0, Math.floor(h / 2), 4, Math.max(1, Math.ceil(h / 2)));
    TILE.set(key, c);
    return c;
  }
  function paint(ctx, W, H, t, accent, look) {
    ctx.clearRect(0, 0, W, H);
    const u = Math.min(W, H) / 1080, light = !look.tone.add;
    ctx.save();
    const th = Math.max(3, Math.round(3.2 * u));
    ctx.fillStyle = ctx.createPattern(tile(th * 2, light), "repeat");
    ctx.translate(0, (t * 9 * u) % (th * 2));
    ctx.fillRect(0, -th * 2, W, H + th * 4);
    ctx.restore();
    if (!light) {
      // A bloom bar rolling slowly down the tube.
      const by = ((t * 0.14) % 1.4 - 0.2) * H, bh = H * 0.22;
      const gr = ctx.createLinearGradient(0, by - bh, 0, by + bh);
      gr.addColorStop(0, "rgba(120,220,255,0)"); gr.addColorStop(0.5, "rgba(120,220,255,0.05)"); gr.addColorStop(1, "rgba(120,220,255,0)");
      ctx.fillStyle = gr; ctx.fillRect(0, by - bh, W, bh * 2);
      // Tracking tear: a bright thin band now and then.
      const ph = fr(t / 3.7);
      if (ph < 0.04) { const ty = (fr(Math.floor(t / 3.7) * 0.618) * 0.8 + 0.1) * H; ctx.fillStyle = "rgba(160,235,255,0.07)"; ctx.fillRect(0, ty, W, 5 * u); ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.fillRect(0, ty + 8 * u, W, 2 * u); }
      const fl = 0.012 * (Math.sin(t * 47) + Math.sin(t * 23.3));
      if (fl > 0) { ctx.fillStyle = `rgba(190,240,255,${fl})`; ctx.fillRect(0, 0, W, H); }
      const r = rng(1000 + Math.floor(t * 24));
      for (let i = 0; i < 90; i++) { ctx.fillStyle = `rgba(190,240,255,${0.04 + r() * 0.1})`; ctx.fillRect(r() * W, r() * H, (1 + r() * 2) * u, (1 + r()) * u); }
    } else {
      const r = rng(2000 + Math.floor(t * 12));
      for (let i = 0; i < 70; i++) { ctx.fillStyle = `rgba(60,40,20,${0.03 + r() * 0.06})`; ctx.fillRect(r() * W, r() * H, (1 + r() * 2) * u, (1 + r()) * u); }
    }
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, light ? "rgba(70,50,30,0.22)" : "rgba(0,0,0,0.62)");
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    if (!light) {
      // The tube's rounded glass: dark corners.
      const rr = 84 * u;
      ctx.beginPath(); ctx.rect(0, 0, W, H);
      ctx.moveTo(rr, 0); ctx.arcTo(0, 0, 0, rr, rr); ctx.lineTo(0, H - rr); ctx.arcTo(0, H, rr, H, rr); ctx.lineTo(W - rr, H); ctx.arcTo(W, H, W, H - rr, rr); ctx.lineTo(W, rr); ctx.arcTo(W, 0, W - rr, 0, rr); ctx.closePath();
      ctx.fillStyle = "rgba(0,0,0,0.9)";
      ctx.fill("evenodd");
    }
  }

  const TONE = { add: true, c: ["#35e8ff", "#ff3fcf", "#5dff8a"] };
  const halo = (core, glow) => (accent) => `0 0 2px ${core}, 0 0 10px ${glow}, 0 0 26px ${glow}, 0 2px 4px rgba(0,0,0,0.9), 0 0 18px rgba(0,0,0,0.85)`;
  return {
    bg: "#02050b", panel: "rgba(53,232,255,0.06)", ink: "#e8fdff", muted: "#8ad3df", accent: "#ffb21f", onAccent: "#02050b",
    rule: "rgba(53,232,255,0.7)", track: "rgba(53,232,255,0.12)",
    display: DISPLAY, displayWeight: 700, displayCase: "uppercase", displayTracking: "0.07em",
    body: DISPLAY, bodyWeight: 600, figures: DISPLAY, radius: 0,
    motion: "glow", change: "scan", kit: { line: 2.4, glow: 14, fill: "none", panel: "outline" },
    panelEdge: "rgba(53,232,255,0.7)",
    tone: TONE,
    palettes: {
      // Plotter: dark ink beams drawn on warm paper. Night: violet-black tube. Phosphor: one green gun.
      light: { bg: "#efe8d6", panel: "rgba(20,40,110,0.05)", ink: "#12236b", muted: "#4a5a99", accent: "#d94a00", onAccent: "#ffffff", rule: "rgba(18,35,107,0.7)", track: "rgba(18,35,107,0.1)", panelEdge: "rgba(18,35,107,0.6)",
        tone: { add: false, c: ["#1b3fb4", "#bf1b78", "#0b7a4a"] }, textShadow: () => "0 0 1px rgba(239,232,214,0.9), 0 0 10px rgba(239,232,214,0.9)", backdrop: () => "#efe8d6" },
      dark: { bg: "#05020f", ink: "#f2eaff", muted: "#a495d8", accent: "#ffd24a", onAccent: "#05020f", rule: "rgba(138,150,255,0.7)", track: "rgba(138,150,255,0.12)", panelEdge: "rgba(138,150,255,0.7)",
        tone: { add: true, c: ["#7f93ff", "#ff4f9a", "#46f0d0"] }, textShadow: halo("#f2eaff", "rgba(127,147,255,0.8)"), backdrop: () => "#05020f" },
      mono: { bg: "#010a04", ink: "#d9ffe5", muted: "#58b878", accent: "#b6ffd0", onAccent: "#010a04", rule: "rgba(77,255,145,0.7)", track: "rgba(77,255,145,0.12)", panelEdge: "rgba(77,255,145,0.7)",
        tone: { add: true, c: ["#4dff91", "#2fd673", "#7affb0"] }, textShadow: halo("#d9ffe5", "rgba(77,255,145,0.8)"), backdrop: () => "#010a04" },
    },
    textShadow: halo("#e8fdff", "rgba(53,232,255,0.8)"),
    backdrop: () => "#02050b",
    // The template's own headline elements stay in place for layout; the look re-letters them in beam type.
    css: () => "#root:has(> canvas#art) .scene .display, #root:has(> canvas#art) .scene .kicker { color: transparent !important; -webkit-text-fill-color: transparent !important; -webkit-text-stroke: 0 !important; text-shadow: none !important; }",
    paint,
    paintOver: true,
    keepArt: true,
    overlap: true,
    stage,
    scenes: { chart: scene("chart", chart), object: scene("object", object), people: scene("people", people), process: scene("process", process), compare: scene("compare", compare) },
  };
});
