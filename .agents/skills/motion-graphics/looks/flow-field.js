// Flow Field: a generative world. Long tapered streamlines of a curl-noise current run full frame in
// additive gradient colour, banded along the stream function so neighbouring lines share a colour and
// wrap each foreground object as coherent ribbons; comets and flowing pulses ride them. Each scene bends
// the current (bars and the card become obstacles, people become vortices drawn as contour lines, the
// compare splits turbulence from a laminar dial). Scene changes are carried by the flow itself: the
// current surges downstream, lighting a curved front, sweeping the old drawing away in streaks while the
// next one is advected in from upstream across the cut. Pure function of time: seeded noise, no clocks.
window.DreamcutMotion.register("flow-field", ({ rng }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const fr = (v) => v - Math.floor(v);
  const hash = (n) => { n = Math.imul(n ^ (n >>> 15), 2246822519); n = Math.imul(n ^ (n >>> 13), 3266489917); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const stagger = (p, i, n, spread = 0.55) => eo((p - (i / Math.max(1, n)) * spread) / (1 - spread));
  const FMT = (v, pre, suf) => window.DreamcutMotion.formatNumber(v, 0, pre, suf);

  // ---- colour ---------------------------------------------------------------------------------------
  function rgb(value) {
    const s = String(value || "");
    if (s[0] === "#") {
      const h = s.length === 4 ? s.slice(1).split("").map((c) => c + c).join("") : s.slice(1, 7);
      const n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (m) return m[1].split(",").slice(0, 3).map(Number);
    return [200, 210, 255];
  }
  const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a)})`;
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const WHITE = [255, 255, 255];
  function ramp(stops, q) {
    const x = clamp(q) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x));
    return mixc(stops[i], stops[i + 1], x - i);
  }
  const fold = (v) => { v = ((v % 2) + 2) % 2; return v > 1 ? 2 - v : v; };
  function theme(S) {
    if (S._ff) return S._ff;
    const L = S.look;
    const th = { stops: (L.stops || []).map(rgb), add: L.additive !== false, acc: rgb(S.accent), bg: rgb(L.bg), ink: rgb(L.ink), tex: L.texture ?? 1, u: S.u };
    th.lift = th.add ? WHITE : [0, 0, 0];
    return (S._ff = th);
  }
  const rcol = (th, q, a) => css(ramp(th.stops, q), a);
  const hi = (th, c, k) => mixc(c, th.lift, th.add ? k : k * 0.35);

  // ---- noise ----------------------------------------------------------------------------------------
  const VAL = new Float32Array(256), PERM = new Uint8Array(256);
  { const r = rng(8401); for (let i = 0; i < 256; i++) { VAL[i] = r() * 2 - 1; PERM[i] = i; }
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = PERM[i]; PERM[i] = PERM[j]; PERM[j] = t; } }
  const h3 = (i, j, k) => VAL[PERM[(PERM[(PERM[i & 255] + j) & 255] + k) & 255]];
  function noise3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let fx = x - xi, fy = y - yi, fz = z - zi;
    fx = fx * fx * fx * (fx * (fx * 6 - 15) + 10); fy = fy * fy * fy * (fy * (fy * 6 - 15) + 10); fz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
    const a = h3(xi, yi, zi), b = h3(xi + 1, yi, zi), c = h3(xi, yi + 1, zi), d = h3(xi + 1, yi + 1, zi);
    const e = h3(xi, yi, zi + 1), f = h3(xi + 1, yi, zi + 1), g = h3(xi, yi + 1, zi + 1), h = h3(xi + 1, yi + 1, zi + 1);
    const x1 = a + (b - a) * fx, x2 = c + (d - c) * fx, x3 = e + (f - e) * fx, x4 = g + (h - g) * fx;
    const y1 = x1 + (x2 - x1) * fy, y2 = x3 + (x4 - x3) * fy;
    return y1 + (y2 - y1) * fz;
  }
  // Smooth, large-scale stream function: two octaves only, so lines are long and calm.
  const psi = (x, y, z) => noise3(x, y, z) + 0.34 * noise3(x * 2.03 + 11.3, y * 2.03, z * 1.4);

  // ---- buffers --------------------------------------------------------------------------------------
  const BUF = {};
  function buf(key, w, h) {
    let c = BUF[key];
    if (!c) c = BUF[key] = document.createElement("canvas");
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return c;
  }
  let GRAIN = null;
  function grainTile() {
    if (GRAIN) return GRAIN;
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d"), img = g.createImageData(256, 256), r = rng(33);
    for (let i = 0; i < img.data.length; i += 4) { const v = r(); img.data[i] = img.data[i + 1] = img.data[i + 2] = v > 0.5 ? 255 : 0; img.data[i + 3] = Math.abs(v - 0.5) * 2 * 255; }
    g.putImageData(img, 0, 0);
    return (GRAIN = c);
  }

  // ---- shared state, controls, timing ---------------------------------------------------------------
  const ST = { t: 0, te: 0, next: null, index: 0, curDrawer: false };
  const CD = { entrance: 0.7, bar_1: 12, bar_2: 19, bar_3: 27, bar_4: 41, highlight: "4", device: "laptop", people_count: 4 };
  const ctl = () => Object.assign({}, CD, (window.__dreamcut && window.__dreamcut.controls) || {});
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  const shownList = () => { const c = ctl(); return ORDER.map((id) => ({ id, hold: Number(c[`${id}_hold`]) || 0 })).filter((s) => s.hold > 0); };
  const pOf = (info) => clamp((info.local - Number(ctl().entrance) * 0.35) / Math.max(0.6, info.hold * 0.55));
  const growOf = (info) => (info.index > 0 ? eo(clamp((info.local - 0.45) / 0.8)) : 1);
  const statementId = (id) => !id || id === "title" || id === "closing";
  const boxFor = (S) => {
    const side = (S.tall ? 90 : 140) * S.u;
    return S.tall ? { x: side, y: S.H * 0.3, w: S.W - side * 2, h: S.H * 0.6 } : { x: side, y: S.H * 0.34, w: S.W - side * 2, h: S.H * 0.58 };
  };
  const SURGE_GAIN = 7;

  // ---- geometry shared by the field (obstacles) and the drawers -------------------------------------
  function chartGeom(S, box, values, p) {
    const n = values.length, u = S.u, max = Math.max(...values, 1);
    const gap = box.w * 0.06, bw = (box.w - gap * (n + 1)) / n, base = box.y + box.h - 72 * u, hmax = box.h - 200 * u;
    const bars = values.map((v, i) => {
      const q = stagger(p, i, n), full = hmax * (v / max), h = full * q;
      return { x: box.x + gap + i * (bw + gap), w: bw, full, h, q, top: base - h, v };
    });
    return { bars, base, hmax };
  }
  function deviceGeom(S, box, kind) {
    const u = S.u, phone = kind === "phone", tall = S.tall;
    let w, h, x, y;
    if (phone) { h = tall ? box.h * 0.5 : Math.min(box.h * 0.96, box.w * 0.5); w = h / 1.9; x = tall ? box.x + (box.w - w) / 2 : box.x + box.w * 0.18; y = tall ? box.y : box.y + (box.h - h) / 2; }
    else { w = tall ? box.w * 0.92 : Math.min(box.w * 0.5, box.h * 1.2); h = w * 0.62; x = tall ? box.x + (box.w - w) / 2 : box.x + box.w * 0.03; y = tall ? box.y + box.h * 0.02 : box.y + (box.h - h * 1.12) / 2; }
    const pad = w * (phone ? 0.08 : 0.045), sx = x + pad, sy = y + pad, sw = w - pad * 2, sh = h - pad * 2;
    const anchors = [[sx + sw * 0.72, sy + sh * 0.22], [sx + sw * 0.47, sy + sh * 0.65], [sx + sw * 0.3, sy + sh * 0.88]];
    const labels = tall
      ? [0, 1, 2].map((i) => [box.x + box.w * 0.1, y + h + 150 * u + i * 132 * u])
      : [0, 1, 2].map((i) => [phone ? x + w + box.w * 0.14 : box.x + box.w * 0.64, box.y + box.h * (0.16 + 0.32 * i)]);
    return { x, y, w, h, sx, sy, sw, sh, phone, anchors, labels };
  }
  function peopleGeom(S, box, n) {
    const size = Math.min(box.h * (S.tall ? 0.42 : 0.56), (box.w / n) * 1.1), base = box.y + box.h * 0.74;
    const ps = [];
    for (let i = 0; i < n; i++) {
      const cx = box.x + (box.w / n) * (i + 0.5);
      ps.push({ cx, base, size, hx: cx, hy: base - size * 0.82, hr: size * 0.15, rx: size * 0.34, ry: size * 0.5 });
    }
    return { ps, size, base };
  }
  function processGeom(S, box, n) {
    const u = S.u, tall = S.tall, R = Math.min(86 * u, (tall ? box.h : box.w) / n * 0.22);
    const nodes = [];
    for (let i = 0; i < n; i++) {
      const f = n > 1 ? i / (n - 1) : 0.5;
      if (tall) nodes.push({ x: box.x + box.w * (0.2 + (i % 2 ? 0.1 : 0)), y: box.y + box.h * (0.14 + 0.72 * f), R });
      else nodes.push({ x: box.x + box.w * (0.14 + 0.72 * f), y: box.y + box.h * (0.4 + (i % 2 ? -0.1 : 0.1)), R });
    }
    const pts = [];
    const first = nodes[0], last = nodes[n - 1];
    const lead = tall ? [0, -box.h * 0.1] : [-box.w * 0.1, 0];
    pts.push([first.x + lead[0], first.y + lead[1]]);
    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k <= 24; k++) {
        const tt = k / 24, e = (1 - Math.cos(Math.PI * tt)) / 2, a = nodes[i], b = nodes[i + 1];
        pts.push(tall ? [lerp(a.x, b.x, e), lerp(a.y, b.y, tt)] : [lerp(a.x, b.x, tt), lerp(a.y, b.y, e)]);
      }
    }
    pts.push([last.x - lead[0], last.y - lead[1]]);
    const norm = pts.map((q, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      return [q[0], q[1], -dy / l, dx / l];
    });
    const out = [0, 0, 0, 1];
    const pt = (s) => {
      const f = clamp(s) * (norm.length - 1), i = Math.min(norm.length - 2, Math.floor(f)), k = f - i, a = norm[i], b = norm[i + 1];
      out[0] = lerp(a[0], b[0], k); out[1] = lerp(a[1], b[1], k); out[2] = lerp(a[2], b[2], k); out[3] = lerp(a[3], b[3], k);
      return out;
    };
    return { nodes, pt, R };
  }
  function compareGeom(S, box) {
    const u = S.u, gap = 64 * u, vertical = S.tall;
    const cw = vertical ? box.w : (box.w - gap) / 2, ch = vertical ? (box.h - gap) / 2 : box.h * 0.92;
    return [0, 1].map((i) => {
      const c = { x: vertical ? box.x : box.x + i * (cw + gap), y: vertical ? box.y + i * (ch + gap) : box.y, w: cw, h: ch };
      c.fig = { x: c.x + c.w * 0.66, y: c.y + c.h * 0.5, rx: c.w * 0.27, ry: c.h * 0.31 };
      c.num = { x: c.x + 36 * u, y: c.y + c.h * 0.64, size: Math.min(200 * u, c.h * 0.36) };
      return c;
    });
  }

  // ---- the current ----------------------------------------------------------------------------------
  const BASE_CFG = () => ({ angle: 0, speed: 1, turb: 1, freq: 1, shift: 0, boost: 0, bodies: [], sources: [], zones: [] });
  const calm = (x, y, rx, ry) => ({ x, y, rx, ry, turb: 0.06, freq: 1, speed: 1, dim: 1, wt: 1 });
  function cfgFor(id, S, p, grow = 1) {
    const { W, H, u } = S, box = boxFor(S), c = ctl(), cfg = BASE_CFG();
    switch (id) {
      case "title":
        Object.assign(cfg, { angle: -0.08, speed: 0.35, turb: 0.9, shift: 0 });
        cfg.sources.push({ x: W * 0.18, y: H * 0.2, k: 1.5, r: H * 0.1, wt: 1 }, { x: W * 0.82, y: H * 0.8, k: -1.5, r: H * 0.1, wt: 1 });
        break;
      case "chart": {
        Object.assign(cfg, { angle: 0, speed: 1, turb: 0.8, shift: 0.16 });
        const g = chartGeom(S, box, [c.bar_1, c.bar_2, c.bar_3, c.bar_4], p);
        for (const b of g.bars) {
          if (b.h > 4 * u) cfg.bodies.push({ k: "b", x: b.x + b.w / 2, y: b.top + b.h / 2, w: b.w, h: b.h, rc: Math.min(b.w * 0.2, 18 * u), swirl: 0, pres: grow });
          cfg.zones.push(calm(b.x + b.w / 2, b.top - 64 * u, b.w * 0.75, 78 * u));
        }
        break;
      }
      case "object": {
        Object.assign(cfg, { angle: -0.06, speed: 1, turb: 0.75, shift: 0.32 });
        const g = deviceGeom(S, box, c.device);
        cfg.bodies.push({ k: "b", x: g.x + g.w / 2, y: g.y + g.h / 2, w: g.w * 1.04, h: g.h * (g.phone ? 1 : 1.12), rc: 24 * u, swirl: 0, pres: grow });
        g.labels.forEach(([lx, ly]) => cfg.zones.push(calm(lx + 200 * u, ly, 290 * u, 52 * u)));
        break;
      }
      case "people": {
        Object.assign(cfg, { angle: 0, speed: 0.85, turb: 0.85, shift: 0.5 });
        const g = peopleGeom(S, box, Math.max(2, Math.min(6, Math.round(c.people_count))));
        g.ps.forEach((q, i) => {
          const k = grow * stagger(p, i, g.ps.length, 0.5);
          cfg.bodies.push({ k: "c", x: q.hx, y: q.hy, r: q.hr * 1.5, swirl: i % 2 ? -1.1 : 1.1, pres: k });
          cfg.bodies.push({ k: "b", x: q.cx, y: q.base - q.ry * 0.5, w: q.rx * 2, h: q.ry, rc: q.rx * 0.4, swirl: 0, pres: k });
          cfg.zones.push(calm(q.cx, q.base + 60 * u, 150 * u, 44 * u));
        });
        break;
      }
      case "process": {
        Object.assign(cfg, { angle: 0.0, speed: 0.9, turb: 0.85, shift: 0.22 });
        const g = processGeom(S, box, 3);
        g.nodes.forEach((n, i) => cfg.bodies.push({ k: "c", x: n.x, y: n.y, r: n.R * 1.5, swirl: i % 2 ? -1.2 : 1.2, pres: grow * stagger(p, i, g.nodes.length, 0.6) }));
        break;
      }
      case "compare": {
        Object.assign(cfg, { angle: 0, speed: 1, turb: 1, shift: 0.74 });
        const g = compareGeom(S, box);
        cfg.zones.push({ x: g[0].fig.x, y: g[0].fig.y, rx: g[0].fig.rx * 1.6, ry: g[0].fig.ry * 1.6, turb: 3.2, freq: 2.3, speed: 0.45, wt: 1 });
        cfg.zones.push({ x: g[1].x + g[1].w / 2, y: g[1].y + g[1].h / 2, rx: g[1].w * 0.62, ry: g[1].h * 0.72, turb: 0.1, freq: 0.6, speed: 1.6, wt: 1 });
        g.forEach((q) => cfg.zones.push(calm(q.num.x + q.num.size * 0.32, q.num.y - q.num.size * 0.36, q.num.size * 0.75, q.num.size * 0.62)));
        cfg.bodies.push({ k: "c", x: g[1].fig.x, y: g[1].fig.y, r: Math.min(g[1].fig.rx, g[1].fig.ry) * 0.95, swirl: 1.4, pres: grow * stagger(p, 1, 2, 0.4) });
        break;
      }
      default:
        Object.assign(cfg, { angle: -0.4, speed: 0.4, turb: 0.9, shift: 0.62 });
        cfg.sources.push({ x: W * 0.15, y: H * 0.82, k: 1.4, r: H * 0.1, wt: 1 }, { x: W * 0.85, y: H * 0.2, k: -1.7, r: H * 0.09, wt: 1 });
    }
    return cfg;
  }
  function blend(a, b, w) {
    const o = BASE_CFG();
    for (const k of ["angle", "speed", "turb", "freq", "shift"]) o[k] = lerp(a[k], b[k], w);
    const add = (list, from, wt, key) => { for (const x of from) { const y = { ...x }; y[key] = (x[key] ?? 1) * wt; list.push(y); } };
    add(o.bodies, a.bodies, 1 - clamp(w * 4), "pres"); add(o.bodies, b.bodies, w, "pres");
    add(o.sources, a.sources, 1 - w, "wt"); add(o.sources, b.sources, w, "wt");
    add(o.zones, a.zones, 1 - w, "wt"); add(o.zones, b.zones, w, "wt");
    return o;
  }

  const F = { gw: 0, gh: 0, cell: 1, m: 0, vx: null, vy: null, dg: null, ph: null };
  function boxSdf(b, x, y, out) {
    const hx = (b.w * b.pres) / 2, hy = (b.h * b.pres) / 2, rc = Math.min(b.rc * b.pres, hx, hy);
    const dx = x - b.x, dy = y - b.y, sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1;
    const qx = Math.abs(dx) - hx + rc, qy = Math.abs(dy) - hy + rc;
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0), len = Math.hypot(ox, oy);
    const d = len + Math.min(Math.max(qx, qy), 0) - rc;
    if (len > 1e-6) { out[0] = (ox * sx) / len; out[1] = (oy * sy) / len; } else if (qx > qy) { out[0] = sx; out[1] = 0; } else { out[0] = 0; out[1] = sy; }
    return d;
  }
  const NRM = [0, 0];
  function buildField(S, cfg, t, drift) {
    const u = S.u, cell = 22 * u, m = cell * 4;
    const gw = Math.ceil((S.W + 2 * m) / cell) + 1, gh = Math.ceil((S.H + 2 * m) / cell) + 1;
    if (F.gw !== gw || F.gh !== gh) { F.vx = new Float32Array(gw * gh); F.vy = new Float32Array(gw * gh); F.dg = new Float32Array(gw * gh); F.ph = new Float32Array(gw * gh); }
    F.gw = gw; F.gh = gh; F.cell = cell; F.m = m;
    const f0 = (1 / (720 * u)) * cfg.freq, z = t * 0.12, ux = Math.cos(cfg.angle) * cfg.speed, uy = Math.sin(cfg.angle) * cfg.speed, e = 0.02;
    const bodies = cfg.bodies.filter((b) => b.pres > 0.05), zones = cfg.zones.filter((q) => q.wt > 0.02), srcs = cfg.sources.filter((q) => q.wt > 0.02);
    const reach = 80 * u;
    for (let j = 0; j < gh; j++) {
      const y = j * cell - m;
      for (let i = 0; i < gw; i++) {
        const x = i * cell - m;
        let tm = 1, fm = 1, sm = 1;
        for (const q of zones) {
          const dx = (x - q.x) / q.rx, dy = (y - q.y) / q.ry, w = (1 - sstep(0.5, 1.0, Math.sqrt(dx * dx + dy * dy))) * q.wt;
          if (w <= 0) continue;
          tm *= 1 + (q.turb - 1) * w; fm *= 1 + (q.freq - 1) * w; sm *= 1 + (q.speed - 1) * w;
        }
        const f = f0 * fm, xs = (x - drift) * f, ys = y * f;
        const pc = psi(xs, ys, z);
        const dpy = (psi(xs, ys + e, z) - psi(xs, ys - e, z)) / (2 * e), dpx = (psi(xs + e, ys, z) - psi(xs - e, ys, z)) / (2 * e);
        const K = 0.55 * cfg.turb * tm;
        let vx = ux * sm + K * dpy, vy = uy * sm - K * dpx, sd = 1e9;
        for (const s of srcs) {
          const dx = x - s.x, dy = y - s.y, d2 = dx * dx + dy * dy + s.r * s.r, k = (s.k * s.wt * s.r * 2) / d2;
          vx += dx * k; vy += dy * k;
        }
        for (const b of bodies) {
          let d, nx, ny;
          if (b.k === "c") { const r = b.r * b.pres, dx = x - b.x, dy = y - b.y, l = Math.hypot(dx, dy) || 1; d = l - r; nx = dx / l; ny = dy / l; }
          else { d = boxSdf(b, x, y, NRM); nx = NRM[0]; ny = NRM[1]; }
          if (d < sd) sd = d;
          if (d < 0) { vx = nx; vy = ny; continue; }
          if (d < reach) {
            const w = 1 - sstep(0, reach, d), vn = vx * nx + vy * ny;
            vx -= nx * vn * w; vy -= ny * vn * w;
            if (b.swirl) { vx += -ny * b.swirl * w; vy += nx * b.swirl * w; }
          }
        }
        const k = j * gw + i;
        F.vx[k] = vx; F.vy[k] = vy; F.dg[k] = sd;
        // Stream function (pixels): constant along an undisturbed streamline, so it bands the colour.
        F.ph[k] = ux * y - uy * x + (K * pc) / f;
      }
    }
  }
  let SX = 0, SY = 0, SD = 0, SP = 0;
  function sampleF(x, y) {
    const gx = (x + F.m) / F.cell, gy = (y + F.m) / F.cell;
    const i = Math.floor(gx), j = Math.floor(gy);
    if (i < 0 || j < 0 || i >= F.gw - 1 || j >= F.gh - 1) return false;
    const fx = gx - i, fy = gy - j, k = j * F.gw + i, k2 = k + F.gw;
    const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
    SX = F.vx[k] * w00 + F.vx[k + 1] * w10 + F.vx[k2] * w01 + F.vx[k2 + 1] * w11;
    SY = F.vy[k] * w00 + F.vy[k + 1] * w10 + F.vy[k2] * w01 + F.vy[k2 + 1] * w11;
    SD = F.dg[k] * w00 + F.dg[k + 1] * w10 + F.dg[k2] * w01 + F.dg[k2 + 1] * w11;
    SP = F.ph[k] * w00 + F.ph[k + 1] * w10 + F.ph[k2] * w01 + F.ph[k2 + 1] * w11;
    return true;
  }
  let NX = 0, NY = 0;
  function step(x, y, ds) {
    if (!sampleF(x, y) || SD < 0) return false;
    let l = Math.hypot(SX, SY);
    if (l < 1e-6) return false;
    const mx = x + (SX / l) * ds * 0.5, my = y + (SY / l) * ds * 0.5;
    if (!sampleF(mx, my) || SD < 0) return false;
    l = Math.hypot(SX, SY);
    if (l < 1e-6) return false;
    NX = x + (SX / l) * ds; NY = y + (SY / l) * ds;
    return true;
  }

  // ---- seeds and streamlines ------------------------------------------------------------------------
  const LM = 34, PTS = 2 * LM + 1, STRIDE = PTS * 2, NB = 8, EXTRA = 900;
  const LN = { key: "", n: 0, cap: 0, sx: null, sy: null, P: null, a: null, b: null, col: null, tone: null, flag: null, lists: null, counts: null };
  function seeds(S, th) {
    const key = `${S.W}x${S.H}x${th.tex.toFixed(2)}`;
    if (LN.key === key) return;
    const sp = S.u * lerp(40, 25, th.tex), r = rng(77), pts = [];
    for (let y = -sp; y < S.H + sp; y += sp) for (let x = -sp * 2; x < S.W + sp; x += sp) pts.push([x + (r() - 0.5) * sp, y + (r() - 0.5) * sp]);
    LN.key = key; LN.n = pts.length; LN.cap = LN.n + EXTRA;
    LN.sx = new Float32Array(LN.n); LN.sy = new Float32Array(LN.n);
    pts.forEach((q, i) => { LN.sx[i] = q[0]; LN.sy[i] = q[1]; });
    LN.P = new Float32Array(LN.cap * STRIDE); LN.a = new Int16Array(LN.cap); LN.b = new Int16Array(LN.cap);
    LN.col = new Uint8Array(LN.cap); LN.tone = new Uint8Array(LN.cap); LN.flag = new Float32Array(LN.cap);
    LN.lists = new Int32Array(NB * 3 * LN.cap); LN.counts = new Int32Array(NB * 3);
  }
  const TAPER_W = [1, 0.66, 0.38], TAPER_A = [1, 0.66, 0.34];
  function drawLines(ctx, S, th, cfg, t, front) {
    seeds(S, th);
    const u = S.u, ds = 9 * u, P = LN.P, sinks = cfg.sources.filter((q) => q.k < 0 && q.wt > 0.3);
    const dims = cfg.zones.filter((q) => q.dim && q.wt > 0.05);
    const band = 400 * u;
    LN.counts.fill(0);
    let count = 0;
    const sinkHit = (x, y) => { for (const s of sinks) { const dx = x - s.x, dy = y - s.y, rr0 = s.r * 0.16; if (dx * dx + dy * dy < rr0 * rr0) return true; } return false; };
    // Trace one line. forwardOnly lines start at index 0 and run 2*LM steps downstream.
    const trace = (i, x0, y0, forwardOnly) => {
      const base = i * STRIDE;
      if (!sampleF(x0, y0) || SD < 0) { LN.a[i] = 0; LN.b[i] = 0; return false; }
      if (forwardOnly) {
        P[base] = x0; P[base + 1] = y0;
        let x = x0, y = y0, k = 1;
        for (; k < PTS; k++) { if (!step(x, y, ds)) break; x = NX; y = NY; if (sinks.length && sinkHit(x, y)) break; P[base + k * 2] = x; P[base + k * 2 + 1] = y; }
        LN.a[i] = 0; LN.b[i] = k - 1;
      } else {
        P[base + 2 * LM] = x0; P[base + 2 * LM + 1] = y0;
        let nf = 0, nb = 0;
        for (let dir = 1; dir >= -1; dir -= 2) {
          let x = x0, y = y0;
          for (let k = 1; k <= LM; k++) {
            if (!step(x, y, ds * dir)) break;
            x = NX; y = NY;
            if (sinks.length && sinkHit(x, y)) break;
            P[base + (LM + dir * k) * 2] = x; P[base + (LM + dir * k) * 2 + 1] = y;
            if (dir > 0) nf++; else nb++;
          }
        }
        LN.a[i] = LM - nb; LN.b[i] = LM + nf;
      }
      return LN.b[i] - LN.a[i] >= 3;
    };
    const classify = (i, x0, y0, wrapLine) => {
      const a = LN.a[i], base = i * STRIDE;
      sampleF(P[base + a * 2], P[base + a * 2 + 1]);
      const ph = SP / band;
      const q = fold(ph * 0.8 + cfg.shift * 0.6 + 0.12 * (x0 / S.W));
      const ci = Math.min(NB - 1, Math.floor(q * NB));
      // Tonal zones: slow large patches, plus bright/dim bands along the stream function.
      const zn = noise3(x0 * 0.0007 / u, y0 * 0.0007 / u, t * 0.035 + 9);
      let tv = 0.55 + 0.75 * zn + 0.3 * Math.sin(ph * TAU * 0.5);
      if (wrapLine) tv += 0.5;
      let dim = 0;
      for (const z of dims) { const dx = (x0 - z.x) / z.rx, dy = (y0 - z.y) / z.ry; dim = Math.max(dim, (1 - sstep(0.6, 1.05, Math.sqrt(dx * dx + dy * dy))) * z.wt); }
      const tone = dim > 0.5 ? 0 : tv < 0.2 ? 0 : tv < 0.7 ? 1 : 2;
      LN.col[i] = ci; LN.tone[i] = tone;
      let fl = 0;
      if (front.on) {
        const fx = front.x + front.amp * noise3(y0 * 0.0024 / u, 7.7, t * 0.3);
        fl = Math.max(0, 1 - Math.abs(x0 - fx) / (S.W * 0.085));
      }
      LN.flag[i] = fl * (dim > 0.5 ? 0.3 : 1);
      const slot = ci * 3 + tone;
      LN.lists[slot * LN.cap + LN.counts[slot]++] = i;
    };
    for (let i = 0; i < LN.n; i++) if (trace(i, LN.sx[i], LN.sy[i], false)) { classify(i, LN.sx[i], LN.sy[i], false); count = i; }
    // Ribbons that wrap each obstacle: seeded upstream of it, traced downstream around it.
    let ni = LN.n;
    for (const b of cfg.bodies) {
      if (b.pres < 0.3 || ni >= LN.cap - 1) continue;
      const hw = b.k === "c" ? b.r * b.pres : (b.w * b.pres) / 2, hh = b.k === "c" ? b.r * b.pres : (b.h * b.pres) / 2;
      const sp = b.k === "c" ? 11 * u : 13 * u;
      let si = 0;
      for (let y = b.y - hh - 70 * u; y <= b.y + hh + 70 * u && ni < LN.cap - 1; y += sp, si++) {
        const x0 = b.x - hw - (60 + 220 * hash(si * 17 + 5)) * u;
        if (trace(ni, x0, y, true)) { classify(ni, x0, y, true); ni++; }
      }
    }
    const total = ni;
    ctx.save();
    ctx.globalCompositeOperation = th.add ? "lighter" : "source-over";
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const wake = 1 + cfg.boost * 0.35;
    const TA = th.add ? [0.13, 0.27, 0.46] : [0.16, 0.32, 0.52], TW = [1, 1.45, 2];
    for (let slot = 0; slot < NB * 3; slot++) {
      const cnt = LN.counts[slot];
      if (!cnt) continue;
      const ci = (slot / 3) | 0, tone = slot % 3;
      for (let lev = 0; lev < 3; lev++) {
        ctx.strokeStyle = rcol(th, (ci + 0.5) / NB, TA[tone] * TAPER_A[lev] * wake);
        ctx.lineWidth = TW[tone] * TAPER_W[lev] * u;
        ctx.beginPath();
        for (let k = 0; k < cnt; k++) {
          const i = LN.lists[slot * LN.cap + k], a = LN.a[i], b = LN.b[i], base = i * STRIDE, mid = (a + b) / 2, half = Math.max(1, (b - a) / 2);
          let open = false;
          for (let j = a; j < b; j++) {
            const rel = Math.abs(j + 0.5 - mid) / half, L = rel < 0.5 ? 0 : rel < 0.8 ? 1 : 2;
            if (L === lev) {
              if (!open) { ctx.moveTo(P[base + j * 2], P[base + j * 2 + 1]); open = true; }
              ctx.lineTo(P[base + j * 2 + 2], P[base + j * 2 + 3]);
            } else open = false;
          }
        }
        ctx.stroke();
      }
    }
    // Flowing pulses along a share of the lines.
    const te = ST.te;
    ctx.setLineDash([34 * u, 74 * u]);
    ctx.lineDashOffset = -te * 120 * u;
    ctx.lineWidth = 1.7 * u;
    for (let ci = 0; ci < NB; ci++) {
      ctx.strokeStyle = css(hi(th, ramp(th.stops, (ci + 0.5) / NB), 0.3), (th.add ? 0.26 : 0.34) * wake);
      ctx.beginPath();
      for (let tone = 1; tone < 3; tone++) {
        const slot = ci * 3 + tone, cnt = LN.counts[slot];
        for (let k = 0; k < cnt; k++) {
          const i = LN.lists[slot * LN.cap + k];
          if (hash(i * 5 + 2) > 0.26) continue;
          const a = LN.a[i] + Math.floor(hash(i * 9 + 4) * 8), b = LN.b[i], base = i * STRIDE;
          if (b - a < 6) continue;
          ctx.moveTo(P[base + a * 2], P[base + a * 2 + 1]);
          for (let j = a + 1; j <= b; j++) ctx.lineTo(P[base + j * 2], P[base + j * 2 + 1]);
        }
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Comets with fading tails ride the lines.
    const headCol = [];
    for (let c = 0; c < 4; c++) headCol.push(mixc(ramp(th.stops, (c + 0.5) / 4), th.lift, th.add ? 0.5 : 0.15));
    const comets = [[], [], [], []];
    for (let i = 0; i < total; i++) {
      if (i >= LN.n || LN.tone[i] === 0 || hash(i * 7 + 3) > 0.24) continue;
      const a = LN.a[i], b = LN.b[i];
      if (b - a < 12) continue;
      const jf = a + 3 + fr(hash(i * 11) + te * (0.07 + 0.11 * hash(i * 13))) * (b - a - 3);
      comets[Math.min(3, Math.floor((LN.col[i] / NB) * 4))].push(i, jf);
    }
    const heads = [];
    for (let c = 0; c < 4; c++) {
      const list = comets[c];
      if (!list.length) continue;
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = css(headCol[c], pass ? 0.9 : 0.34); ctx.lineWidth = (pass ? 2.6 : 1.8) * u;
        ctx.beginPath();
        for (let k = 0; k < list.length; k += 2) {
          const i = list[k], jf = list[k + 1], base = i * STRIDE, a = LN.a[i], j1 = Math.floor(jf);
          const j0 = Math.max(a, j1 - (pass ? 5 : 13)), je = pass ? j1 : Math.max(a, j1 - 4);
          ctx.moveTo(P[base + j0 * 2], P[base + j0 * 2 + 1]);
          for (let j = j0 + 1; j <= je; j++) ctx.lineTo(P[base + j * 2], P[base + j * 2 + 1]);
          if (pass) {
            const fj = jf - j1, jn = Math.min(LN.b[i], j1 + 1), hx = lerp(P[base + j1 * 2], P[base + jn * 2], fj), hy = lerp(P[base + j1 * 2 + 1], P[base + jn * 2 + 1], fj);
            ctx.lineTo(hx, hy); heads.push(hx, hy);
          }
        }
        ctx.stroke();
      }
    }
    ctx.fillStyle = css(th.add ? WHITE : [20, 20, 40], 0.95);
    ctx.beginPath();
    for (let k = 0; k < heads.length; k += 2) { ctx.moveTo(heads[k] + 2.4 * u, heads[k + 1]); ctx.arc(heads[k], heads[k + 1], 2.4 * u, 0, TAU); }
    ctx.fill();
    // The surge front: a curved band of lines lit as the current rushes through.
    if (front.on) {
      for (let lev = 0; lev < 3; lev++) {
        const lo = lev / 3, hiL = (lev + 1) / 3;
        ctx.strokeStyle = css(mixc(th.acc, th.lift, th.add ? 0.35 : 0.1), (th.add ? 0.36 : 0.5) * front.a * (0.35 + 0.65 * hiL));
        ctx.lineWidth = (1.2 + lev * 0.8) * u;
        ctx.beginPath();
        for (let i = 0; i < total; i++) {
          const fl = LN.flag[i];
          if (fl <= lo || fl > hiL) continue;
          const a = LN.a[i], b = LN.b[i], base = i * STRIDE;
          if (b - a < 2) continue;
          ctx.moveTo(P[base + a * 2], P[base + a * 2 + 1]);
          for (let j = a + 1; j <= b; j++) ctx.lineTo(P[base + j * 2], P[base + j * 2 + 1]);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
    return count;
  }

  // ---- primitives -----------------------------------------------------------------------------------
  const PT = [0, 0, 0, 1];
  function lineP(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    return (s) => { PT[0] = x1 + dx * s; PT[1] = y1 + dy * s; PT[2] = nx; PT[3] = ny; return PT; };
  }
  function quadP(a, c, b) {
    return (s) => {
      const m = 1 - s;
      PT[0] = m * m * a[0] + 2 * m * s * c[0] + s * s * b[0]; PT[1] = m * m * a[1] + 2 * m * s * c[1] + s * s * b[1];
      const tx = 2 * m * (c[0] - a[0]) + 2 * s * (b[0] - c[0]), ty = 2 * m * (c[1] - a[1]) + 2 * s * (b[1] - c[1]), l = Math.hypot(tx, ty) || 1;
      PT[2] = -ty / l; PT[3] = tx / l; return PT;
    };
  }
  function cubicP(a, b, c, d) {
    return (s) => {
      const m = 1 - s, A = m * m * m, B = 3 * m * m * s, C = 3 * m * s * s, D = s * s * s;
      PT[0] = A * a[0] + B * b[0] + C * c[0] + D * d[0]; PT[1] = A * a[1] + B * b[1] + C * c[1] + D * d[1];
      const tx = 3 * m * m * (b[0] - a[0]) + 6 * m * s * (c[0] - b[0]) + 3 * s * s * (d[0] - c[0]);
      const ty = 3 * m * m * (b[1] - a[1]) + 6 * m * s * (c[1] - b[1]) + 3 * s * s * (d[1] - c[1]), l = Math.hypot(tx, ty) || 1;
      PT[2] = -ty / l; PT[3] = tx / l; return PT;
    };
  }
  // A bundle of threads along a path, each offset sideways and swaying on its own phase; optional
  // flowing dashes and tapered ends make it read as streamlines rather than a ruled line.
  function bundle(ctx, th, pt, s0, s1, n, spread, o) {
    if (s1 - s0 <= 0.002) return;
    const steps = o.steps || 26, u = th.u;
    ctx.save();
    ctx.globalCompositeOperation = th.add ? "lighter" : "source-over";
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = o.lw || 1.4 * u;
    if (o.dash) { ctx.setLineDash(o.dash); ctx.lineDashOffset = -(o.dashT ?? ST.t) * (o.dashV ?? 60 * u); }
    for (let k = 0; k < n; k++) {
      const kk = n > 1 ? k / (n - 1) : 0.5, off = (kk - 0.5) * spread, ph = k * 1.9 + (o.seed || 0);
      ctx.strokeStyle = o.colf ? o.colf(kk) : o.color;
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const s = lerp(s0, s1, i / steps), P = pt(s), w = (o.wob ?? 3 * u) * Math.sin(s * (o.wf ?? 18) + ST.t * (o.ws ?? 1.8) + ph) + off * (o.pinch ? Math.sin(Math.PI * clamp(s)) : 1);
        const x = P[0] + P[2] * w, y = P[1] + P[3] * w;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  function glow(ctx, th, x, y, r, c, a = 1) {
    ctx.save();
    ctx.globalCompositeOperation = th.add ? "lighter" : "source-over";
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
    g.addColorStop(0, css(th.add ? WHITE : c, a)); g.addColorStop(0.2, css(mixc(c, WHITE, th.add ? 0.35 : 0), 0.85 * a)); g.addColorStop(0.55, css(c, 0.28 * a)); g.addColorStop(1, css(c, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
    ctx.restore();
  }
  // Type: a thin outline in the field's own colour around a tight backing stroke, no soft halo.
  function label(ctx, S, th, s, x, y, size, o = {}) {
    if (!s) return;
    const Lk = S.look, u = S.u, big = size >= 80 * u;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha *= clamp(o.alpha ?? 1);
    ctx.font = `${o.weight ?? (o.fam === "display" || o.fam === "figures" ? Lk.displayWeight : 600)} ${size}px ${o.fam === "display" ? Lk.display : o.fam === "figures" ? Lk.figures : Lk.body}`;
    ctx.textAlign = o.align || "left"; ctx.textBaseline = o.base || "alphabetic"; ctx.lineJoin = "round";
    const ring = o.ring || ramp(th.stops, 0.55);
    ctx.strokeStyle = css(ring, th.add ? 0.6 : 0.7); ctx.lineWidth = size * (big ? 0.1 : 0.15); ctx.strokeText(s, x, y);
    ctx.strokeStyle = css(th.bg, 1); ctx.lineWidth = size * (big ? 0.07 : 0.11); ctx.strokeText(s, x, y);
    ctx.fillStyle = o.color || Lk.ink; ctx.fillText(s, x, y);
    ctx.restore();
  }
  function polyLens(pts) {
    let total = 0; const lens = [];
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); lens.push(l); total += l; }
    return { lens, total };
  }
  function pointOn(pts, L, d) {
    d = clamp(d, 0, L.total);
    for (let i = 1; i < pts.length; i++) { const l = L.lens[i - 1]; if (d <= l || i === pts.length - 1) { const k = clamp(d / (l || 1)); return [lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k)]; } d -= l; }
    return pts[pts.length - 1];
  }
  // Path of the part of a polyline between fractions f0 and f1.
  function polyPart(ctx, pts, f0, f1) {
    const L = polyLens(pts), d0 = L.total * clamp(f0), d1 = L.total * clamp(f1);
    ctx.beginPath();
    if (d1 - d0 < 0.5) return;
    const p0 = pointOn(pts, L, d0); ctx.moveTo(p0[0], p0[1]);
    let acc = 0;
    for (let i = 1; i < pts.length; i++) { acc += L.lens[i - 1]; if (acc > d0 && acc < d1) ctx.lineTo(pts[i][0], pts[i][1]); }
    const p1 = pointOn(pts, L, d1); ctx.lineTo(p1[0], p1[1]);
  }
  // A pole of the current: a bright core with rings that breathe outward (a source) or inward (a sink).
  function pole(ctx, S, th, x, y, r, sign, t, col, alpha) {
    const u = S.u;
    if (alpha <= 0.01) return;
    glow(ctx, th, x, y, r * 0.3, col, alpha);
    ctx.save();
    ctx.globalCompositeOperation = th.add ? "lighter" : "source-over";
    for (let k = 0; k < 4; k++) {
      let f = fr(t * 0.32 + k / 4); if (sign < 0) f = 1 - f;
      ctx.strokeStyle = css(mixc(col, WHITE, 0.3), Math.pow(1 - f, 1.4) * 0.7 * alpha); ctx.lineWidth = (2 + (1 - f) * 2) * u;
      ctx.beginPath(); ctx.arc(x, y, r * (0.3 + f * 1.9), 0, TAU); ctx.stroke();
    }
    // A spiral of inflow/outflow threads.
    for (let k = 0; k < 6; k++) {
      ctx.strokeStyle = css(mixc(col, WHITE, 0.4), 0.55 * alpha); ctx.lineWidth = 1.8 * u;
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) { const s = i / 40, a = k * (TAU / 6) + s * 2.6 * sign + t * 0.7 * sign, rr0 = r * (0.25 + 1.2 * s); i ? ctx.lineTo(x + Math.cos(a) * rr0, y + Math.sin(a) * rr0) : ctx.moveTo(x + Math.cos(a) * rr0, y + Math.sin(a) * rr0); }
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---- finish: bloom, scrim, grain ------------------------------------------------------------------
  function bloom(ctx, S, th) {
    if (!th.add) return;
    const W = S.W, H = S.H;
    const b1 = buf("b1", W / 4, H / 4), c1 = b1.getContext("2d");
    c1.clearRect(0, 0, b1.width, b1.height); c1.filter = "blur(3px)"; c1.drawImage(ctx.canvas, 0, 0, b1.width, b1.height); c1.filter = "none";
    const b2 = buf("b2", W / 8, H / 8), c2 = b2.getContext("2d");
    c2.clearRect(0, 0, b2.width, b2.height); c2.filter = "blur(3px)"; c2.drawImage(b1, 0, 0, b2.width, b2.height); c2.filter = "none";
    ctx.save();
    ctx.globalCompositeOperation = "lighter"; ctx.imageSmoothingQuality = "high";
    ctx.globalAlpha = 0.45; ctx.drawImage(b1, 0, 0, W, H);
    ctx.globalAlpha = 0.55; ctx.drawImage(b2, 0, 0, W, H);
    ctx.restore();
  }
  // Statement scenes darken an ellipse behind the line; drawn scenes darken the headline band. The two
  // blend across a change instead of switching.
  function scrim(ctx, S, th, sw) {
    const { W, H } = S;
    if (sw > 0.001) {
      ctx.save();
      ctx.globalAlpha = sw;
      const rx = S.tall ? W * 0.75 : W * 0.5, ry = H * (S.tall ? 0.21 : 0.3);
      ctx.translate(W / 2, H / 2); ctx.scale(1, ry / rx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, css(th.bg, 0.74)); g.addColorStop(0.7, css(th.bg, 0.46)); g.addColorStop(1, css(th.bg, 0));
      ctx.fillStyle = g; ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
      ctx.restore();
    }
    if (sw < 0.999) {
      ctx.save();
      ctx.globalAlpha = 1 - sw;
      const g = ctx.createLinearGradient(0, 0, 0, H * (S.tall ? 0.34 : 0.4));
      g.addColorStop(0, css(th.bg, 0.86)); g.addColorStop(0.65, css(th.bg, 0.5)); g.addColorStop(1, css(th.bg, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * 0.42);
      ctx.restore();
    }
  }
  function grain(ctx, S, th, t) {
    if (th.tex <= 0) return;
    const k = Math.floor(t * 24), ox = Math.floor(hash(k) * 256), oy = Math.floor(hash(k + 999) * 256);
    ctx.save();
    ctx.globalCompositeOperation = th.add ? "lighter" : "source-over";
    ctx.globalAlpha = (th.add ? 0.035 : 0.06) * th.tex;
    ctx.translate(-ox, -oy);
    ctx.fillStyle = ctx.createPattern(grainTile(), "repeat");
    ctx.fillRect(ox, oy, S.W, S.H);
    ctx.restore();
  }

  // ---- transitions on the flow ----------------------------------------------------------------------
  // A change runs T 0→1 over the last `change` seconds of one scene and the first `change` of the next.
  function transitionOf(info) {
    const ch = Math.max(0.01, info.change), list = shownList(), prev = info.index > 0 && list[info.index - 1] ? list[info.index - 1].id : null;
    if (info.next && info.local > info.hold - ch) return { T: 0.5 * clamp((info.local - (info.hold - ch)) / ch), A: info.scene, B: info.next, prev, incoming: false, done: info.index };
    if (prev && info.local < ch) return { T: 0.5 + 0.5 * clamp(info.local / ch), A: prev, B: info.scene, prev, incoming: true, done: info.index - 1 };
    return { T: 0, A: info.scene, B: null, prev, incoming: false, done: info.index };
  }
  // Content swept downstream (out 0→1) or advected in from upstream (inc 1→0): the drawing is sliced
  // into thin rows, each carried by its own smooth amount, with fading streaks behind it.
  function sweep(ctx, S, th, src, out, inc) {
    const { W, H, u } = S, bh = Math.max(3, Math.round(5 * u));
    if (out <= 0.0005 && inc <= 0.0005) { ctx.drawImage(src, 0, 0); return; }
    if (out >= 0.999) return;
    ctx.save();
    for (let y = 0; y < H; y += bh) {
      const yn = y / u;
      const n1 = clamp(0.5 + 1.0 * noise3(yn * 0.0036, 3.1, 1.7) + 0.06 * noise3(yn * 0.012, 8.3, 2.2));
      const n2 = clamp(0.5 + 1.0 * noise3(yn * 0.0032, 5.7, 4.1) + 0.05 * noise3(yn * 0.011, 1.9, 0.3));
      const ko = Math.pow(out, 1.45), ki = Math.pow(inc, 1.6);
      const o = W * (0.015 + 0.6 * n1) * ko - W * (0.04 + 0.32 * n2) * ki;
      const a = Math.pow(1 - out, 1.25) * (1 - ki);
      if (a <= 0.003) continue;
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = a;
      ctx.drawImage(src, 0, y, W, bh, o, y, W, bh);
      const trail = out > 0 ? o : o;
      if (Math.abs(trail) > 2 * u) {
        ctx.globalCompositeOperation = th.add ? "lighter" : "source-over";
        for (let j = 1; j <= 3; j++) {
          ctx.globalAlpha = (a * 0.3) / j;
          const oj = out > 0 ? o * (1 - 0.24 * j) : o * (1 + 0.3 * j);
          ctx.drawImage(src, 0, y, W, bh, oj, y, W, bh);
        }
      }
    }
    ctx.restore();
  }

  // ---- stage ----------------------------------------------------------------------------------------
  const DRAWN = new Set(["chart", "object", "people", "process", "compare"]);
  function stage(ctx, S, info) {
    const th = theme(S);
    const tr = transitionOf(info), ch = Math.max(0.01, info.change);
    // Surge time: the current runs faster through each change; integrated so motion never jumps.
    const surged = tr.done * (4 * ch) / Math.PI + (tr.T > 0 ? (2 * ch * (1 - Math.cos(Math.PI * tr.T))) / Math.PI : 0);
    ST.t = info.t; ST.te = info.t + 2.2 * surged; ST.next = info.next; ST.index = info.index; ST.curDrawer = DRAWN.has(info.scene);
    if (!S.paint) return;
    const { W, H, u } = S;
    const w = eio(tr.T), A = tr.A || "closing";
    const pA = tr.incoming ? 1 : pOf(info), gA = tr.incoming ? 1 : growOf(info);
    const cfg = tr.B ? blend(cfgFor(A, S, pA, gA), cfgFor(tr.B, S, tr.incoming ? pOf(info) : 0, tr.incoming ? growOf(info) : 0), w) : cfgFor(A, S, pA, gA);
    cfg.boost = Math.sin(Math.PI * tr.T);
    const drift = (info.t + SURGE_GAIN * surged) * 30 * u;
    buildField(S, cfg, info.t, drift);
    const front = { on: tr.T > 0 && tr.T < 1, x: lerp(-0.2 * W, 1.2 * W, eio(tr.T)), amp: 0.16 * W, a: Math.sin(Math.PI * tr.T) };
    drawLines(ctx, S, th, cfg, info.t, front);
    // Statement poles fade with the change, no wipe.
    const cols = [ramp(th.stops, 0.3), ramp(th.stops, 0.8)];
    const poleSet = (id) => id === "title" ? [[W * 0.18, H * 0.2, 1], [W * 0.82, H * 0.8, -1]] : [[W * 0.15, H * 0.82, 1], [W * 0.85, H * 0.2, -1]];
    const drawPoles = (id, alpha) => { if (statementId(id)) poleSet(id).forEach(([x, y, sg], i) => pole(ctx, S, th, x, y, H * 0.1, sg, info.t + i * 0.7, i ? th.acc : cols[1], alpha)); };
    drawPoles(A, tr.B ? 1 - eo(w * 1.6) : 1);
    if (tr.B) drawPoles(tr.B, sstep(0.35, 1, w));
    const sw = tr.B ? lerp(statementId(A) ? 1 : 0, statementId(tr.B) ? 1 : 0, w) : statementId(A) ? 1 : 0;
    scrim(ctx, S, th, sw);
    // One bloom per frame, laid by whichever call draws last.
    const leaveBlooms = tr.incoming && DRAWN.has(tr.prev) && !ST.curDrawer;
    if (!ST.curDrawer && !leaveBlooms) bloom(ctx, S, th);
    grain(ctx, S, th, info.t);
  }
  // Drawers render into a layer so the change can sweep them downstream or advect them in.
  const wrap = (fn) => (ctx, S, box, p, d, info) => {
    const th = theme(S), ch = Math.max(0.01, info.change);
    const leaving = info.exit !== undefined;
    let out = 0, inc = 0;
    if (leaving) out = clamp(0.5 + 0.5 * info.exit) * 1.55;
    else if (ST.next && info.local > info.hold - ch) out = 0.5 * clamp((info.local - (info.hold - ch)) / ch) * 1.55;
    if (!leaving && ST.index > 0) inc = 1 - eo(clamp(info.local / 0.95));
    out = clamp(out);
    if (out >= 0.999) { if (S.paint && leaving && !ST.curDrawer) bloom(ctx, S, th); return; }
    const layer = buf("scene", S.W, S.H), lc = layer.getContext("2d");
    lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalAlpha = 1; lc.globalCompositeOperation = "source-over";
    lc.clearRect(0, 0, S.W, S.H);
    fn(lc, S, th, box, p, d, info);
    ctx.save();
    sweep(ctx, S, th, layer, out, inc);
    ctx.restore();
    if (S.paint && (!leaving || !ST.curDrawer)) bloom(ctx, S, th);
  };

  // ---- scenes ---------------------------------------------------------------------------------------
  const rcolHex = (c) => css(mixc(c, WHITE, 0.15), 1);

  function chartScene(ctx, S, th, box, p, d, info) {
    const u = S.u, t = info.t, n = d.values.length, g = chartGeom(S, box, d.values, p);
    for (let gi = 0; gi <= 4; gi++) {
      const y = g.base - (g.hmax * gi) / 4, grow = eo(seg(info.local, 0.05 + gi * 0.06, 0.9 + gi * 0.06));
      bundle(ctx, th, lineP(box.x, y, box.x + box.w, y), 0, grow, gi === 0 ? 5 : 2, gi === 0 ? 10 * u : 3 * u, { lw: 1.3 * u, color: rcol(th, 0.5, gi === 0 ? 0.6 : 0.24), wob: 1.4 * u, wf: 30, ws: 1.4, steps: 40, dash: gi ? [26 * u, 18 * u] : null, dashV: 40 * u });
    }
    g.bars.forEach((b, i) => {
      const hot = i === d.highlight, col = hot ? th.acc : ramp(th.stops, 0.1 + (0.75 * i) / Math.max(1, n - 1));
      ctx.save();
      ctx.setLineDash([10 * u, 14 * u]); ctx.lineDashOffset = -t * 26 * u; ctx.lineWidth = 2 * u; ctx.strokeStyle = css(col, (0.34 - 0.18 * b.q) * eo(seg(info.local, 0.1, 0.6)));
      ctx.beginPath(); ctx.moveTo(b.x, g.base); ctx.lineTo(b.x, g.base - b.full); ctx.lineTo(b.x + b.w, g.base - b.full); ctx.lineTo(b.x + b.w, g.base); ctx.stroke();
      ctx.restore();
      if (b.h > 3 * u) {
        const grad = ctx.createLinearGradient(0, b.top, 0, g.base);
        grad.addColorStop(0, css(col, 0.26)); grad.addColorStop(1, css(col, 0.03));
        ctx.save(); ctx.fillStyle = grad; ctx.fillRect(b.x, b.top, b.w, b.h); ctx.restore();
        const cnt = Math.max(8, Math.floor(b.w / (8 * u)));
        bundle(ctx, th, (s) => { PT[0] = b.x + b.w / 2; PT[1] = g.base - s * b.h; PT[2] = 1; PT[3] = 0; return PT; }, 0, 1, cnt, b.w - 10 * u, {
          lw: 1.5 * u, colf: (k) => css(mixc(col, WHITE, hot ? 0.1 + 0.4 * k : 0.2 * k), 0.58), wob: 4.5 * u, wf: Math.max(8, b.h / (34 * u)), ws: -2.6, seed: i * 3, steps: Math.max(10, Math.floor(b.h / (14 * u))),
        });
        bundle(ctx, th, lineP(b.x + 4 * u, b.top, b.x + b.w - 4 * u, b.top), 0, 1, 3, 6 * u, { lw: 2.2 * u, color: css(mixc(col, WHITE, 0.5), 0.95), wob: 1.5 * u, wf: 12, ws: 3 });
        glow(ctx, th, b.x + b.w / 2, b.top, 9 * u, col, 0.8);
        for (let k = 0; k < 8; k++) {
          const f = fr(hash(i * 40 + k) + t * (0.28 + 0.25 * hash(i * 40 + k + 9))), x = b.x + 8 * u + hash(i * 40 + k + 17) * (b.w - 16 * u);
          glow(ctx, th, x, g.base - f * b.h, 3.5 * u, col, Math.sin(Math.PI * f) * 0.95);
        }
        const big = hot ? 124 : 100;
        label(ctx, S, th, FMT(d.values[i] * b.q, d.prefix, d.suffix), b.x + b.w / 2, b.top - 30 * u, big * u, { align: "center", fam: "figures", color: hot ? rcolHex(th.acc) : undefined, ring: col, alpha: seg(b.q, 0.02, 0.2) });
      }
      label(ctx, S, th, d.labels[i] || "", b.x + b.w / 2, g.base + 56 * u, 44 * u, { align: "center", alpha: seg(info.local, 0.15 + i * 0.08, 0.6 + i * 0.08), ring: col });
    });
  }

  function objectScene(ctx, S, th, box, p, d, info) {
    const u = S.u, t = info.t, L = info.local, g = deviceGeom(S, box, d.kind), col = ramp(th.stops, 0.45), col2 = ramp(th.stops, 0.8);
    const add = th.add ? "lighter" : "source-over";
    // Screen body: a dark pane filled with faint laminar threads, fading in once the outline has arrived.
    const fillA = eo(seg(L, 0.45, 1.2));
    if (fillA > 0) {
      ctx.save();
      ctx.globalAlpha = fillA;
      ctx.fillStyle = css(th.bg, th.add ? 0.4 : 0.6); ctx.fillRect(g.x, g.y, g.w, g.h);
      ctx.beginPath(); ctx.rect(g.sx, g.sy, g.sw, g.sh); ctx.clip();
      ctx.globalCompositeOperation = add; ctx.lineWidth = 1.1 * u;
      for (let k = 0; k < 34; k++) {
        const kk = k / 33, y0 = g.sy + g.sh * kk;
        ctx.strokeStyle = rcol(th, 0.15 + 0.7 * kk, 0.24);
        ctx.beginPath();
        for (let i = 0; i <= 24; i++) { const s = i / 24, x = g.sx + g.sw * s, y = y0 + 4 * u * Math.sin(s * 6 + t * 1.3 + k * 0.7); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke();
      }
      ctx.restore();
    }
    // Outline: nested streamlines arrive from upstream, split around the card and meet on the far side.
    const lead = Math.min(560 * u, g.x + 80 * u), ymid = g.y + g.h / 2, head = eo(seg(L, 0.0, 1.25)), tailF = eo(seg(L, 0.65, 1.8));
    for (let k = 0; k < 4; k++) {
      const ins = k * 7 * u, x0 = g.x + ins, y0 = g.y + ins, x1 = g.x + g.w - ins, y1 = g.y + g.h - ins;
      const lsY = ymid + (k - 1.5) * 34 * u * (1 + Math.sin(t * 0.8 + k));
      const leadPts = [];
      for (let i = 0; i <= 16; i++) { const s = i / 16, e = (1 - Math.cos(Math.PI * s)) / 2; leadPts.push([lerp(g.x - lead, x0, s), lerp(lsY, ymid, e) + 10 * u * Math.sin(s * 5 + t * 1.6 + k) * (1 - s)]); }
      const routes = [[...leadPts, [x0, y0], [x1, y0], [x1, ymid]], [...leadPts, [x0, y1], [x1, y1], [x1, ymid]]];
      const leadLen = polyLens(leadPts).total;
      routes.forEach((pts) => {
        const tot = polyLens(pts).total, lf = leadLen / tot, f0 = lf * tailF;
        const ccol = mixc(k % 2 ? col : col2, WHITE, 0.15 + 0.12 * k);
        ctx.save(); ctx.globalCompositeOperation = add; ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.strokeStyle = css(ccol, 0.78 - k * 0.12); ctx.lineWidth = (2.4 - k * 0.35) * u;
        polyPart(ctx, pts, f0, head); ctx.stroke();
        ctx.setLineDash([18 * u, 46 * u]); ctx.lineDashOffset = -ST.te * 90 * u - k * 13 * u;
        ctx.strokeStyle = css(mixc(ccol, WHITE, 0.5), 0.75); ctx.lineWidth = 2.2 * u;
        polyPart(ctx, pts, f0, head); ctx.stroke();
        ctx.restore();
        if (head < 1) { const hp = pointOn(pts, polyLens(pts), tot * head); glow(ctx, th, hp[0], hp[1], 5 * u, ccol, 0.9); }
      });
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(g.sx, g.sy, g.sw, g.sh); ctx.clip();
    ctx.globalCompositeOperation = add;
    // Preview: a small current of its own; each thread streams in from the left on its own delay.
    const pv = { x: g.sx + g.sw * 0.06, y: g.sy + g.sh * 0.07, w: g.sw * 0.88, h: g.sh * 0.46 };
    for (let k = 0; k < 15; k++) {
      const kk = k / 14, y0 = pv.y + pv.h * (0.04 + 0.92 * kk), A = pv.h * (0.05 + 0.07 * hash(k + 40)), hotL = k === 9;
      const reach = eo(seg(L, 0.45 + k * 0.035, 1.25 + k * 0.035));
      if (reach <= 0) continue;
      ctx.beginPath();
      const steps = 30;
      for (let i = 0; i <= steps * reach; i++) { const s = i / steps, x = pv.x + pv.w * s, y = y0 + A * Math.sin(s * 8 + t * 1.9 + k * 0.6) * Math.sin(s * Math.PI * 0.9 + 0.2); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.strokeStyle = hotL ? css(th.acc, 0.95) : rcol(th, 0.2 + 0.7 * kk, 0.6); ctx.lineWidth = (hotL ? 3 : 1.6) * u; ctx.stroke();
    }
    // Lanes: three tracks of clips, each clip a ribbon of five threads with a bright leading edge.
    const clips = [[0.0, 0.3], [0.34, 0.2], [0.58, 0.34]];
    for (let r = 0; r < 3; r++) {
      const ty = g.sy + g.sh * (0.6 + r * 0.115), th2 = g.sh * 0.075;
      clips.forEach(([cx, cw], i) => {
        const shown = eo(seg(L, 0.8 + i * 0.16 + r * 0.1, 1.5 + i * 0.16 + r * 0.1));
        if (shown <= 0) return;
        const x0 = g.sx + g.sw * (0.06 + cx * 0.88 + r * 0.025), w0 = g.sw * cw * 0.88 * shown, hot = r === 0 && i === 1;
        const cc = hot ? th.acc : ramp(th.stops, 0.2 + 0.25 * i + 0.15 * r);
        ctx.fillStyle = css(cc, 0.12); ctx.fillRect(x0, ty, w0, th2);
        for (let s = 0; s < 5; s++) {
          const yy = ty + th2 * (0.12 + 0.19 * s);
          ctx.strokeStyle = css(mixc(cc, WHITE, s === 2 ? 0.35 : 0.05), hot ? 0.95 : 0.62); ctx.lineWidth = (s === 2 ? 2.2 : 1.4) * u;
          ctx.beginPath();
          for (let q = 0; q <= 14; q++) { const f = q / 14, x = x0 + w0 * f, y = yy + 1.6 * u * Math.sin(f * 9 + t * 2.4 + s + i * 2); q ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
          ctx.stroke();
        }
        ctx.strokeStyle = css(mixc(cc, WHITE, 0.6), 0.95); ctx.lineWidth = 2.6 * u;
        ctx.beginPath(); ctx.moveTo(x0 + w0, ty); ctx.lineTo(x0 + w0, ty + th2); ctx.stroke();
      });
    }
    const phA = seg(L, 1.6, 2.0);
    if (phA > 0) {
      const px = g.sx + g.sw * (0.06 + 0.88 * fr(t * 0.16));
      ctx.fillStyle = css(WHITE, 0.9 * phA); ctx.fillRect(px - 1.5 * u, g.sy + g.sh * 0.56, 3 * u, g.sh * 0.4);
      glow(ctx, th, px, g.sy + g.sh * 0.56, 4 * u, th.acc, phA);
    }
    const sy2 = g.sy + g.sh * fr(t * 0.22), sg = ctx.createLinearGradient(0, sy2 - 40 * u, 0, sy2 + 4 * u);
    sg.addColorStop(0, css(col, 0)); sg.addColorStop(1, css(col, 0.2 * fillA)); ctx.fillStyle = sg; ctx.fillRect(g.sx, sy2 - 40 * u, g.sw, 44 * u);
    ctx.restore();
    if (!g.phone) bundle(ctx, th, lineP(g.x - g.w * 0.07, g.y + g.h * 1.07, g.x + g.w * 1.07, g.y + g.h * 1.07), 0, eo(seg(L, 0.3, 1.2)), 3, 8 * u, { lw: 1.8 * u, color: css(mixc(col, WHITE, 0.3), 0.7), wob: 1.4 * u, wf: 20, ws: 2 });
    // Callouts: each leader is a streamline bundle that peels off the card and flows to its label.
    g.anchors.forEach(([ax, ay], i) => {
      const c = eo(seg(L, 1.2 + i * 0.32, 2.1 + i * 0.32)), [lx, ly] = g.labels[i], ccol = i === 1 ? th.acc : ramp(th.stops, 0.25 + 0.3 * i);
      const ex = lx - 30 * u, dx = ex - ax;
      const path = S.tall ? cubicP([ax, ay], [ax, lerp(ay, ly, 0.6)], [ex - 120 * u, ly], [ex, ly]) : cubicP([ax, ay], [ax + dx * 0.55, ay], [ex - dx * 0.5, ly], [ex, ly]);
      const ring = 10 * u + 5 * u * Math.sin(t * 3 + i * 2);
      if (c > 0.001) {
        ctx.save(); ctx.globalCompositeOperation = add;
        ctx.strokeStyle = css(ccol, c); ctx.lineWidth = 2.4 * u; ctx.beginPath(); ctx.arc(ax, ay, ring, 0, TAU); ctx.stroke();
        ctx.restore();
        glow(ctx, th, ax, ay, 5 * u, ccol, 0.9 * c);
        bundle(ctx, th, path, 0, c, 4, 16 * u, { lw: 1.6 * u, colf: (k) => css(mixc(ccol, WHITE, 0.1 + 0.4 * k), 0.75), wob: 3 * u, wf: 11, ws: 2.6, seed: i * 2, steps: 40, pinch: true });
        bundle(ctx, th, path, 0, c, 2, 8 * u, { lw: 2.4 * u, color: css(mixc(ccol, WHITE, 0.55), 0.95), wob: 2 * u, wf: 11, ws: 2.6, seed: i * 2 + 1, steps: 40, pinch: true, dash: [16 * u, 30 * u], dashT: ST.te, dashV: 80 * u });
        const bp = path(fr(t * 0.45 + i * 0.3) * c);
        glow(ctx, th, bp[0], bp[1], 4.5 * u, ccol, 0.95);
      }
      if (d.callouts[i]) label(ctx, S, th, d.callouts[i], lx, ly, 50 * u, { base: "middle", weight: 700, alpha: seg(c, 0.55, 1), color: i === 1 ? rcolHex(th.acc) : undefined, ring: ccol });
    });
  }

  // People as contour streamlines: nested level sets of a head-and-shoulders field, cached in unit
  // size and drawn as flowing, tapered lines that run out along the ground into the current.
  let PERSON = null;
  function personContours() {
    if (PERSON) return PERSON;
    const hx = 0, hy = -0.82, hr = 0.15, rx = 0.34, ry = 0.5, k = 0.2;
    const sdf = (x, y) => {
      const dh = Math.hypot(x - hx, y - hy) - hr, ex = x / rx, ey = y / ry, ds = (Math.hypot(ex, ey) - 1) * Math.min(rx, ry);
      const h = clamp(0.5 + (0.5 * (ds - dh)) / k);
      return lerp(ds, dh, h) - k * h * (1 - h);
    };
    const cy = -0.45, levels = [-0.035, 0.035, 0.1, 0.17, 0.25, 0.34];
    PERSON = levels.map((lv) => {
      const pts = [];
      for (let i = 0; i <= 96; i++) {
        const a = Math.PI * 0.5 + (i / 96) * TAU, dx = Math.cos(a), dy = Math.sin(a);
        let tHit = -1;
        for (let tt = 1.4; tt >= 0; tt -= 0.025) if (sdf(dx * tt, cy + dy * tt) <= lv) { tHit = tt; break; }
        if (tHit < 0) continue;
        let lo = tHit, hiT = tHit + 0.025;
        for (let b = 0; b < 6; b++) { const m = (lo + hiT) / 2; if (sdf(dx * m, cy + dy * m) <= lv) lo = m; else hiT = m; }
        const y = cy + dy * lo;
        if (y < 0) pts.push([dx * lo, y, a]);
      }
      return { lv, pts };
    });
    return PERSON;
  }
  function peopleScene(ctx, S, th, box, p, d, info) {
    const u = S.u, t = info.t, n = Math.max(2, Math.min(6, Math.round(d.count))), g = peopleGeom(S, box, n), add = th.add ? "lighter" : "source-over";
    bundle(ctx, th, lineP(box.x - 60 * u, g.base, box.x + box.w + 60 * u, g.base), 0, eo(seg(info.local, 0.1, 1.0)), 6, 10 * u, { lw: 1.4 * u, color: rcol(th, 0.5, 0.5), wob: 1.8 * u, wf: 26, ws: 2, dash: [40 * u, 22 * u], dashT: ST.te, dashV: 70 * u });
    for (let i = 0; i < n - 1; i++) {
      const a = g.ps[i], b = g.ps[i + 1], c = eo(seg(p, 0.35 + i * 0.08, 0.85));
      const ctrl = [(a.hx + b.hx) / 2, a.hy - g.size * 0.5], pt = quadP([a.hx, a.hy - a.hr * 1.6], ctrl, [b.hx, b.hy - b.hr * 1.6]);
      bundle(ctx, th, pt, 0, 0.12 + 0.88 * c, 4, 12 * u, { lw: 1.4 * u, colf: (k) => rcol(th, 0.2 + 0.2 * i + 0.4 * k, 0.55 * c), wob: 3 * u, wf: 9, ws: 2.4, seed: i, pinch: true });
      if (c > 0.05) { const pp = pt(fr(t * 0.35 + i * 0.37) * c); glow(ctx, th, pp[0], pp[1], 5 * u, ramp(th.stops, 0.4 + 0.1 * i), 0.9); }
    }
    // Unique role per figure: the three badges, then roles not already used.
    const roles = [], spare = ["Producer", "Reviewer", "Client", "Colorist", "Writer", "Sound"];
    for (let i = 0; i < n; i++) {
      let r = d.badges[i];
      if (!r || roles.includes(r)) r = spare.find((x) => !roles.includes(x) && !d.badges.includes(x)) || "";
      roles.push(r);
    }
    const hotI = Math.min(n - 1, d.highlight), C = personContours();
    g.ps.forEach((q, i) => {
      const k = stagger(p, i, n, 0.5), hot = i === hotI, col = hot ? th.acc : ramp(th.stops, 0.12 + (0.75 * i) / Math.max(1, n - 1));
      const sz = q.size * (0.6 + 0.4 * k);
      ctx.save();
      ctx.globalCompositeOperation = add; ctx.lineCap = "round"; ctx.lineJoin = "round";
      C.forEach((cl, li) => {
        const draw = eo(seg(k, li * 0.08, 0.5 + li * 0.08));
        if (draw <= 0 || cl.pts.length < 3) return;
        const m = cl.pts.length, half = (m - 1) / 2, cnt = Math.max(2, Math.round(m * draw)), s0 = Math.floor(half - (cnt - 1) / 2);
        const pts = [];
        // Ground run-out: the contour leaves along the floor like a streamline parting around the figure.
        const run = (0.18 + li * 0.08) * sz;
        for (let j = s0; j < s0 + cnt; j++) {
          const [px, py, a] = cl.pts[j], wv = 1 + 0.025 * Math.sin(a * 5 + t * (li % 2 ? -2.2 : 2.2) + li);
          pts.push([q.cx + px * sz * wv, q.base + py * sz * wv]);
        }
        if (draw > 0.98) { pts.unshift([pts[0][0] - run, q.base]); pts.push([pts[pts.length - 1][0] + run, q.base]); }
        const ca = (0.85 - li * 0.11) * (0.4 + 0.6 * k), cc = mixc(col, WHITE, li === 1 ? 0.35 : 0.05);
        for (let pass = 0; pass < 2; pass++) {
          ctx.strokeStyle = css(cc, pass ? ca * 0.35 : ca); ctx.lineWidth = (pass ? 1 : li === 1 ? 2.8 : 1.8) * u;
          ctx.beginPath(); pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
        }
        ctx.setLineDash([22 * u, 40 * u]); ctx.lineDashOffset = -ST.te * (60 + li * 14) * u * (li % 2 ? -1 : 1);
        ctx.strokeStyle = css(mixc(col, WHITE, 0.55), ca * 0.9); ctx.lineWidth = 2.4 * u;
        ctx.beginPath(); pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
        ctx.setLineDash([]);
      });
      // The head is a small vortex: a tight spiral streamline turning in place.
      const hx = q.cx, hy = q.base - 0.82 * sz, hr = 0.15 * sz, va = clamp(k * 1.5);
      for (let s = 0; s < 3; s++) {
        ctx.strokeStyle = css(mixc(col, WHITE, 0.25 + 0.15 * s), 0.8 * va); ctx.lineWidth = (2.2 - s * 0.4) * u;
        ctx.beginPath();
        for (let j = 0; j <= 50; j++) { const f = j / 50, a = f * TAU * 2.2 + t * (i % 2 ? -1.4 : 1.4) + s * (TAU / 3), r = hr * (0.12 + 0.78 * f); j ? ctx.lineTo(hx + Math.cos(a) * r, hy + Math.sin(a) * r) : ctx.moveTo(hx + Math.cos(a) * r, hy + Math.sin(a) * r); }
        ctx.stroke();
      }
      ctx.restore();
      glow(ctx, th, hx, hy, hr * 0.28, col, 0.9 * va);
      if (hot) for (let r = 0; r < 2; r++) { const f = fr(t * 0.45 + r * 0.5); ctx.save(); ctx.globalCompositeOperation = add; ctx.strokeStyle = css(col, (1 - f) * 0.6 * va); ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.arc(hx, hy, hr * (1.3 + f * 1.3), 0, TAU); ctx.stroke(); ctx.restore(); }
      if (roles[i]) label(ctx, S, th, roles[i], q.cx, q.base + 72 * u, 46 * u, { align: "center", alpha: seg(k, 0.25, 0.8), color: hot ? rcolHex(th.acc) : undefined, ring: col });
    });
  }

  function processScene(ctx, S, th, box, p, d, info) {
    const u = S.u, t = info.t, n = d.steps.length, g = processGeom(S, box, n), tall = S.tall;
    const reveal = 0.3 + 0.7 * eo(seg(p, 0, 0.8)), lead = eo(seg(info.local, 0, 0.6));
    bundle(ctx, th, g.pt, 0, lead, 12, 46 * u, { lw: 1.2 * u, color: rcol(th, 0.5, 0.16), wob: 3 * u, wf: 20, ws: 1.6, steps: 70 });
    bundle(ctx, th, g.pt, 0, reveal * lead, 14, 44 * u, { lw: 1.6 * u, colf: (k) => rcol(th, 0.1 + 0.8 * k, 0.55), wob: 7 * u, wf: 24, ws: -2.2, steps: 80 });
    bundle(ctx, th, g.pt, 0, reveal * lead, 4, 30 * u, { lw: 2 * u, colf: (k) => css(hi(th, ramp(th.stops, 0.3 + 0.5 * k), 0.4), 0.7), wob: 5 * u, wf: 24, ws: -2.2, steps: 80, dash: [30 * u, 60 * u], dashT: ST.te, dashV: 110 * u });
    for (let k = 0; k < 9; k++) {
      const f = fr(hash(k + 70) + t * (0.07 + 0.04 * hash(k + 71))), P = g.pt(f * reveal * lead), off = (hash(k + 80) - 0.5) * 36 * u;
      glow(ctx, th, P[0] + P[2] * off, P[1] + P[3] * off, 4 * u, ramp(th.stops, hash(k + 90)), 0.9 * lead);
    }
    const icons = ["lines", "spark", "check"];
    g.nodes.forEach((nd, i) => {
      const k = stagger(p, i, n, 0.6), last = i === n - 1, col = last ? th.acc : ramp(th.stops, 0.2 + 0.28 * i), R = nd.R * (0.55 + 0.45 * k);
      ctx.save();
      ctx.globalCompositeOperation = th.add ? "lighter" : "source-over";
      ctx.globalAlpha = clamp(k * 1.8);
      glow(ctx, th, nd.x, nd.y, R * 0.9, col, 0.35);
      for (let r = 0; r < 3; r++) {
        const rad = R * (0.72 + r * 0.28), a = t * (1 + r * 0.4) * (r % 2 ? -1 : 1) + i * 2;
        ctx.strokeStyle = css(col, r === 0 ? 0.9 : 0.35); ctx.lineWidth = (r === 0 ? 4 : 1.6) * u; ctx.beginPath(); ctx.arc(nd.x, nd.y, rad, 0, TAU); ctx.stroke();
        if (r) { ctx.strokeStyle = css(mixc(col, WHITE, 0.5), 0.95); ctx.lineWidth = 3.2 * u; ctx.beginPath(); ctx.arc(nd.x, nd.y, rad, a - 0.9, a); ctx.stroke(); ctx.fillStyle = css(WHITE, 1); ctx.beginPath(); ctx.arc(nd.x + Math.cos(a) * rad, nd.y + Math.sin(a) * rad, 4 * u, 0, TAU); ctx.fill(); }
      }
      ctx.strokeStyle = css(mixc(col, WHITE, 0.4), 1); ctx.lineWidth = 5 * u; ctx.lineCap = "round"; ctx.lineJoin = "round";
      const s = R * 0.5; ctx.beginPath();
      if (icons[i % 3] === "lines") { for (let r = -1; r <= 1; r++) { ctx.moveTo(nd.x - s * (r === 1 ? 0.6 : 0.9), nd.y + r * s * 0.55); ctx.lineTo(nd.x + s * (r === 1 ? 0.3 : 0.9) * (1 + 0.1 * Math.sin(t * 2 + r)), nd.y + r * s * 0.55); } }
      else if (icons[i % 3] === "spark") { for (let r = 0; r < 4; r++) { const a = (r * Math.PI) / 2 + t * 0.6; ctx.moveTo(nd.x + Math.cos(a) * s * 0.2, nd.y + Math.sin(a) * s * 0.2); ctx.lineTo(nd.x + Math.cos(a) * s * 1.05, nd.y + Math.sin(a) * s * 1.05); } }
      else { ctx.moveTo(nd.x - s * 0.75, nd.y + s * 0.05); ctx.lineTo(nd.x - s * 0.2, nd.y + s * 0.6); ctx.lineTo(nd.x + s * 0.85, nd.y - s * 0.6); }
      ctx.stroke();
      ctx.restore();
      const txt = d.steps[i];
      if (txt) {
        label(ctx, S, th, String(i + 1).padStart(2, "0"), tall ? nd.x + nd.R * 1.55 : nd.x, tall ? nd.y - 26 * u : nd.y - nd.R * 1.75, 44 * u, { align: tall ? "left" : "center", fam: "figures", color: rcolHex(col), alpha: seg(k, 0.2, 0.7), ring: col });
        label(ctx, S, th, txt, tall ? nd.x + nd.R * 1.55 : nd.x, tall ? nd.y + 34 * u : nd.y + nd.R * 1.75 + 56 * u, 50 * u, { align: tall ? "left" : "center", alpha: seg(k, 0.3, 0.85), weight: 700, ring: col });
      }
    });
  }

  function compareScene(ctx, S, th, box, p, d, info) {
    const u = S.u, t = info.t, cols = compareGeom(S, box), max = Math.max(d.leftValue, d.rightValue, 1), add = th.add ? "lighter" : "source-over";
    const defs = [[d.left, d.leftValue, ramp(th.stops, 0.12), false], [d.right, d.rightValue, th.acc, true]];
    defs.forEach(([name, value, col, calmSide], i) => {
      const c = cols[i], q = stagger(p, i, 2, 0.4), fg = c.fig, build = eo(seg(info.local, 0.1 + i * 0.25, 1.3 + i * 0.25));
      ctx.save();
      ctx.globalCompositeOperation = add; ctx.lineCap = "round"; ctx.lineJoin = "round";
      if (!calmSide) {
        // Re-prompting: a tangle of looping threads that never settles.
        for (let k = 0; k < 30; k++) {
          const ph = hash(k + 5) * TAU, A = fg.rx * (0.45 + 0.55 * hash(k + 6)), B = fg.ry * (0.45 + 0.55 * hash(k + 7)), f1 = 2 + Math.floor(hash(k + 8) * 3), f2 = 3 + Math.floor(hash(k + 9) * 3), sp = 0.35 + 0.4 * hash(k + 10);
          ctx.strokeStyle = rcol(th, 0.05 + 0.4 * hash(k + 11), 0.36 * build); ctx.lineWidth = (k % 5 ? 1.4 : 2.2) * u; ctx.beginPath();
          const end = Math.round(90 * build);
          for (let s = 0; s <= end; s++) { const a = (s / 90) * TAU, x = fg.x + A * Math.sin(f1 * a + ph + t * sp), y = fg.y + B * Math.sin(f2 * a + ph * 1.3 - t * sp * 0.8); s ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
          ctx.stroke();
        }
        // Sparks thrown off the tangle.
        for (let k = 0; k < 10; k++) {
          const f = fr(hash(k + 31) + t * (0.4 + 0.3 * hash(k + 32))), a = hash(k + 33) * TAU + t * 0.3, r = Math.min(fg.rx, fg.ry) * (0.6 + 0.7 * f);
          glow(ctx, th, fg.x + Math.cos(a) * r * (fg.rx / Math.min(fg.rx, fg.ry)), fg.y + Math.sin(a) * r, 3 * u, col, Math.sin(Math.PI * f) * build);
        }
      } else {
        // Tuning: a laminar dial, a ribbon of parallel threads in two smooth turns around a turning knob.
        const R = Math.min(fg.rx, fg.ry) * 1.05, r0 = R * 0.22, rot = t * 0.35;
        for (let k = 0; k < 7; k++) {
          const off = (k - 3) * 5.5 * u, cc = mixc(th.acc, ramp(th.stops, 0.6), k / 6 * 0.6);
          ctx.strokeStyle = css(cc, (k === 3 ? 0.95 : 0.5) * build); ctx.lineWidth = (k === 3 ? 2.6 : 1.5) * u;
          ctx.beginPath();
          const end = Math.round(160 * build);
          for (let s = 0; s <= end; s++) { const f = s / 160, a = rot + f * TAU * 2, r = r0 + (R - r0) * f + off; s ? ctx.lineTo(fg.x + Math.cos(a) * r, fg.y + Math.sin(a) * r) : ctx.moveTo(fg.x + Math.cos(a) * r, fg.y + Math.sin(a) * r); }
          ctx.stroke();
        }
        ctx.setLineDash([20 * u, 36 * u]); ctx.lineDashOffset = -ST.te * 70 * u;
        ctx.strokeStyle = css(mixc(th.acc, WHITE, 0.6), 0.85 * build); ctx.lineWidth = 2.6 * u;
        ctx.beginPath();
        for (let s = 0; s <= Math.round(160 * build); s++) { const f = s / 160, a = rot + f * TAU * 2, r = r0 + (R - r0) * f; s ? ctx.lineTo(fg.x + Math.cos(a) * r, fg.y + Math.sin(a) * r) : ctx.moveTo(fg.x + Math.cos(a) * r, fg.y + Math.sin(a) * r); }
        ctx.stroke(); ctx.setLineDash([]);
        // Knob and its pointer, plus tick marks on the outer turn.
        ctx.strokeStyle = css(mixc(th.acc, WHITE, 0.3), 0.9 * build); ctx.lineWidth = 3 * u;
        ctx.beginPath(); ctx.arc(fg.x, fg.y, r0 * 0.75, 0, TAU); ctx.stroke();
        const pa = rot * 2.2;
        ctx.lineWidth = 4 * u; ctx.beginPath(); ctx.moveTo(fg.x, fg.y); ctx.lineTo(fg.x + Math.cos(pa) * r0 * 0.7, fg.y + Math.sin(pa) * r0 * 0.7); ctx.stroke();
        for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU, r1 = R + 16 * u, r2 = R + (k % 6 ? 26 : 38) * u; ctx.strokeStyle = css(th.acc, 0.5 * build * (k / 24 <= build ? 1 : 0)); ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.moveTo(fg.x + Math.cos(a) * r1, fg.y + Math.sin(a) * r1); ctx.lineTo(fg.x + Math.cos(a) * r2, fg.y + Math.sin(a) * r2); ctx.stroke(); }
        const bf = fr(t * 0.18), ba = rot + bf * TAU * 2, br = r0 + (R - r0) * bf;
        ctx.restore(); ctx.save();
        glow(ctx, th, fg.x + Math.cos(ba) * br, fg.y + Math.sin(ba) * br, 5 * u, th.acc, build);
      }
      ctx.restore();
      label(ctx, S, th, name, c.x + 36 * u, c.y + 68 * u, 52 * u, { weight: 700, color: calmSide ? rcolHex(th.acc) : undefined, alpha: seg(q, 0.05, 0.4), ring: col });
      label(ctx, S, th, FMT(value * q, d.prefix, d.suffix), c.num.x, c.num.y, c.num.size, { fam: "figures", color: calmSide ? rcolHex(th.acc) : undefined, alpha: seg(q, 0.02, 0.25), ring: col });
      const mx = c.x + 36 * u, my = c.y + c.h - 50 * u, mw = c.w - 72 * u, len = clamp(value / max) * q;
      bundle(ctx, th, lineP(mx, my, mx + mw, my), 0, build, 3, 8 * u, { lw: 1.2 * u, color: css(th.add ? WHITE : th.ink, th.add ? 0.18 : 0.3), wob: 1 * u, wf: 20, ws: 1 });
      bundle(ctx, th, lineP(mx, my, mx + mw, my), 0, len, 9, 22 * u, { lw: 1.8 * u, colf: (k) => css(mixc(col, WHITE, 0.4 * k), 0.8), wob: calmSide ? 1.6 * u : 9 * u, wf: calmSide ? 14 : 40, ws: calmSide ? 2 : 7, seed: i * 4, steps: 60 });
      if (len > 0.01) glow(ctx, th, mx + mw * len, my, 9 * u, col, 1);
    });
    const a = cols[0], b = cols[1], sx = S.tall ? [box.x, a.y + a.h + (b.y - a.y - a.h) / 2, box.x + box.w, a.y + a.h + (b.y - a.y - a.h) / 2] : [a.x + a.w + (b.x - a.x - a.w) / 2, box.y, a.x + a.w + (b.x - a.x - a.w) / 2, box.y + cols[0].h];
    const sb = eo(seg(info.local, 0, 0.8));
    bundle(ctx, th, lineP(sx[0], sx[1], sx[2], sx[3]), 0, sb, 3, 8 * u, { lw: 1.4 * u, color: css(th.add ? WHITE : th.ink, 0.35), wob: 3 * u, wf: 16, ws: 2.4, steps: 40, dash: [24 * u, 20 * u], dashV: 50 * u });
  }

  // ---- the look --------------------------------------------------------------------------------------
  const SCENES = { chart: wrap(chartScene), object: wrap(objectScene), people: wrap(peopleScene), process: wrap(processScene), compare: wrap(compareScene) };
  return {
    bg: "#05060f", panel: "rgba(255,255,255,0.06)", ink: "#f2f4ff", muted: "rgba(226,232,255,0.72)", accent: "#ff5d8f", onAccent: "#16040b",
    rule: "rgba(200,210,255,0.35)", track: "rgba(200,210,255,0.12)",
    display: "Futura, 'Avenir Next', 'Century Gothic', 'Trebuchet MS', sans-serif", displayWeight: 700, displayCase: "none", displayTracking: "-0.01em",
    body: "'Avenir Next', Avenir, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif", bodyWeight: 500,
    figures: "Futura, 'Avenir Next', 'Century Gothic', Arial, sans-serif", radius: 18, motion: "wipe", change: "grid", kit: { line: 2 },
    stops: ["#5a2dff", "#2f6bff", "#18b9ff", "#22e6c4", "#a6f56e"], additive: true, glowA: "#101a4a", glowB: "#1a0f3a",
    palettes: {
      light: { bg: "#f4f1ea", panel: "rgba(255,255,255,0.6)", ink: "#0d1033", muted: "rgba(13,16,51,0.7)", accent: "#d6246e", onAccent: "#ffffff", rule: "rgba(13,16,51,0.3)", track: "rgba(13,16,51,0.08)",
        stops: ["#2b2bd9", "#0b6fbf", "#0a8f78", "#5f8a0a", "#b86500"], additive: false, glowA: "#e4e8ff", glowB: "#ffe6ee", textShadow: () => "0 0 16px rgba(244,241,234,0.95)" },
      dark: { bg: "#02030a", accent: "#ff4f8b", stops: ["#2b5cff", "#00b4ff", "#00e5c3", "#5dffa0", "#b6ff4d"], glowA: "#07102e", glowB: "#10081f" },
      mono: { bg: "#070707", ink: "#f4f4f4", accent: "#ffffff", onAccent: "#111111", stops: ["#4a4a4a", "#8a8a8a", "#bdbdbd", "#e6e6e6", "#ffffff"], glowA: "#161616", glowB: "#101010" },
    },
    textShadow: () => "0 2px 22px rgba(3,4,14,0.9), 0 0 4px rgba(3,4,14,0.6)",
    backdrop: (accent, texture, look) => `radial-gradient(120% 90% at 72% 18%, ${look.glowA} 0%, rgba(0,0,0,0) 62%), radial-gradient(100% 80% at 14% 92%, ${look.glowB} 0%, rgba(0,0,0,0) 64%), ${look.bg}`,
    css: (accent, look) => `#title-scene .kicker { display: flex; align-items: center; gap: 0.9em; color: ${look.ink}; letter-spacing: 0.2em; }
      #title-scene .kicker::before { content: ""; width: 3.4em; height: 3px; border-radius: 2px; background: linear-gradient(90deg, ${accent}, rgba(255,255,255,0)); box-shadow: 0 0 12px ${accent}; }`,
    // Slow tonal zones under the streamlines, on the texture canvas.
    paint: (ctx, W, H, t, accent, look) => {
      ctx.clearRect(0, 0, W, H);
      const stops = (look.stops || []).map(rgb), add = look.additive !== false;
      ctx.globalCompositeOperation = add ? "lighter" : "source-over";
      for (let k = 0; k < 5; k++) {
        const x = W * (0.5 + 0.45 * Math.sin(t * 0.11 + k * 1.7)), y = H * (0.5 + 0.42 * Math.cos(t * 0.09 + k * 2.3)), r = Math.max(W, H) * (0.34 + 0.07 * k);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r), c = stops[(k * 2 + 1) % stops.length] || [90, 120, 255];
        g.addColorStop(0, css(c, add ? 0.18 : 0.13)); g.addColorStop(0.6, css(c, add ? 0.06 : 0.05)); g.addColorStop(1, css(c, 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      ctx.globalCompositeOperation = "source-over";
    },
    keepArt: true,
    overlap: true,
    stage,
    scenes: SCENES,
  };
});
