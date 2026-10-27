// Wireframe: a real little 3D engine drawn as cyan phosphor line-work. Every solid is a mesh that is
// transformed, projected and depth-sorted each frame; faces are filled with the void colour before their
// edges are stroked, so hidden lines really are hidden. Scenes are constructions: a bar plinth, an
// exploded laptop with a floating interface layer, mannequins on pedestals, a conveyor with a scanning
// ring, two dial coins. Objects build bottom-up under a bright scan ring and come apart the same way.
// A floor grid streams toward the camera under drifting solids, dust and a HUD in every hold; a
// vertical scan sweep crosses the frame at every scene change. Original forms throughout.
// Frames are pure functions of time.
window.DreamcutMotion.register("wireframe", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const inout = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const fract = (x) => x - Math.floor(x);
  const hash = (a, b = 0, c = 0) => fract(Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453);
  const rgbOf = (hex) => { const n = parseInt(String(hex).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const MONO = "'SF Mono', 'Menlo', 'Consolas', 'Courier New', monospace";
  const nf = (v, dec = 0, pre = "", suf = "") => window.DreamcutMotion.formatNumber(v, dec, pre, suf);

  // ---- meshes -------------------------------------------------------------------------------------
  const MESHES = {};
  const cached = (key, make) => MESHES[key] || (MESHES[key] = make());
  function finalize(m) {
    let y0 = 1e9, y1 = -1e9, rad = 0;
    for (const v of m.v) { y0 = Math.min(y0, v[1]); y1 = Math.max(y1, v[1]); rad = Math.max(rad, Math.hypot(v[0], v[2])); }
    const sp = y1 - y0 || 1;
    m.y0 = y0; m.y1 = y1; m.rad = rad;
    m.vy = m.v.map((v) => (v[1] - y0) / sp);
    m.fy = m.f.map((f) => f.reduce((s, i) => s + m.vy[i], 0) / f.length);
    m.vd = m.v.map((v) => {
      const h = hash(Math.round(v[0] * 7), Math.round(v[1] * 7), Math.round(v[2] * 7)), a = h * TAU, b = hash(h * 91.3, 3.7) * Math.PI;
      return [Math.cos(a) * Math.sin(b), Math.cos(b) * 0.8 + 0.2, Math.sin(a) * Math.sin(b)];
    });
    return m;
  }
  function addGrid(m, p00, p10, p11, p01, nu, nv) {
    const base = m.v.length;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const a = i / nu, b = j / nv;
      m.v.push([0, 1, 2].map((k) => lerp(lerp(p00[k], p10[k], a), lerp(p01[k], p11[k], a), b)));
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const k = base + j * (nu + 1) + i; m.f.push([k, k + 1, k + nu + 2, k + nu + 1]); }
  }
  function boxMesh(w, h, d, nx = 1, ny = 1, nz = 1) {
    return cached(`b${w}|${h}|${d}|${nx}|${ny}|${nz}`, () => {
      const m = { v: [], f: [] }, x = w / 2, y = h / 2, z = d / 2;
      addGrid(m, [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z], nx, ny);
      addGrid(m, [x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z], nx, ny);
      addGrid(m, [x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z], nz, ny);
      addGrid(m, [-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z], nz, ny);
      addGrid(m, [-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z], nx, nz);
      addGrid(m, [-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z], nx, nz);
      return finalize(m);
    });
  }
  function latheMesh(key, profile, seg) {
    return cached(`l${key}|${seg}`, () => {
      const m = { v: [], f: [] };
      for (const [r, y] of profile) for (let s = 0; s < seg; s++) { const a = (s / seg) * TAU; m.v.push([r * Math.cos(a), y, r * Math.sin(a)]); }
      for (let k = 0; k < profile.length - 1; k++) for (let s = 0; s < seg; s++) {
        const s2 = (s + 1) % seg;
        m.f.push([k * seg + s, k * seg + s2, (k + 1) * seg + s2, (k + 1) * seg + s]);
      }
      return finalize(m);
    });
  }
  function sphereMesh(r, lat, lon) {
    const prof = [];
    for (let i = 0; i <= lat; i++) { const a = -Math.PI / 2 + (Math.PI * i) / lat; prof.push([Math.max(0.001, r * Math.cos(a)), r * Math.sin(a)]); }
    return latheMesh(`s${r}|${lat}`, prof, lon);
  }
  function torusMesh(R, r, seg, sides) {
    return cached(`t${R}|${r}|${seg}|${sides}`, () => {
      const m = { v: [], f: [] };
      for (let i = 0; i < seg; i++) for (let j = 0; j < sides; j++) {
        const a = (i / seg) * TAU, b = (j / sides) * TAU, rr = R + r * Math.cos(b);
        m.v.push([rr * Math.cos(a), r * Math.sin(b), rr * Math.sin(a)]);
      }
      for (let i = 0; i < seg; i++) for (let j = 0; j < sides; j++) {
        const i2 = (i + 1) % seg, j2 = (j + 1) % sides;
        m.f.push([i * sides + j, i2 * sides + j, i2 * sides + j2, i * sides + j2]);
      }
      return finalize(m);
    });
  }
  function icoMesh(r) {
    return cached(`i${r}`, () => {
      const t = (1 + Math.sqrt(5)) / 2;
      const raw = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
      const m = { v: raw.map((p) => { const l = Math.hypot(...p); return p.map((c) => (c / l) * r); }), f: [] };
      m.f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
      return finalize(m);
    });
  }
  function octaMesh(r) {
    return cached(`o${r}`, () => {
      const m = { v: [[r, 0, 0], [-r, 0, 0], [0, r * 1.3, 0], [0, -r * 1.3, 0], [0, 0, r], [0, 0, -r]], f: [] };
      m.f = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]];
      return finalize(m);
    });
  }
  const crystalMesh = () => latheMesh("crystal", [[0.001, -1], [0.62, -0.38], [0.8, 0], [0.62, 0.34], [0.001, 1]].map(([r, y]) => [r * 100, y * 100]), 8);

  // ---- camera and render list ---------------------------------------------------------------------
  const R = { items: [], over: [], top: [], C: null, F: null };
  function mkCam(o) {
    return { fogMin: 0.28, fogR: 2400, ...o, cy: Math.cos(o.yaw), sy: Math.sin(o.yaw), cp: Math.cos(o.pitch), sp: Math.sin(o.pitch), fogZ: o.dist * 0.82 };
  }
  function proj(C, x, y, z, out) {
    x -= C.tx; y -= C.ty; z -= C.tz;
    const x1 = x * C.cy + z * C.sy, z1 = -x * C.sy + z * C.cy;
    const y2 = y * C.cp + z1 * C.sp;
    const z2 = Math.max(40, -y * C.sp + z1 * C.cp + C.dist);
    const k = C.f / z2;
    out[0] = C.sx0 + x1 * k; out[1] = C.sy0 - y2 * k; out[2] = z2; out[3] = k;
    return out;
  }
  // The camera for a scene: fits a design box into the area, sways, and swings in and out at changes.
  function sceneCam(F, area, info, o) {
    const k = Math.min(area.w / o.dw, area.h / o.dh);
    const ex = info.exit || 0;
    const en = ex ? 0 : 1 - ease(info.local / (info.change + 0.7));
    const dist = 1600 * (1 + 0.32 * (en + ex));
    return mkCam({
      sx0: area.x + area.w * (o.cx ?? 0.5), sy0: area.y + area.h * (o.cy ?? 0.5), dist, f: 1600 * k,
      yaw: (o.yaw || 0) + (o.sway || 0) * Math.sin(info.t * (o.sw || 0.55) + (o.ph || 0)) + 1.0 * en - 1.0 * ex,
      pitch: (o.pitch ?? 0.3) + 0.025 * Math.sin(info.t * 0.4) + 0.22 * (en + ex),
      tx: o.tx || 0, ty: o.ty || 0, tz: o.tz || 0, k, fogR: o.fogR || 2600,
    });
  }
  function begin(F, C) { R.F = F; R.C = C; R.items.length = 0; R.over.length = 0; R.top.length = 0; }

  function xform(o) {
    const sc = o.s == null ? 1 : o.s, sx = Array.isArray(sc) ? sc[0] : sc, sy = Array.isArray(sc) ? sc[1] : sc, sz = Array.isArray(sc) ? sc[2] : sc;
    const pos = o.pos || [0, 0, 0];
    const cz = Math.cos(o.rz || 0), sz_ = Math.sin(o.rz || 0), cx = Math.cos(o.rx || 0), sx_ = Math.sin(o.rx || 0), cy = Math.cos(o.ry || 0), sy_ = Math.sin(o.ry || 0);
    return (x, y, z, out) => {
      x *= sx; y *= sy; z *= sz;
      const x1 = x * cz - y * sz_, y1 = x * sz_ + y * cz;
      const y2 = y1 * cx - z * sx_, z2 = y1 * sx_ + z * cx;
      out[0] = x1 * cy + z2 * sy_ + pos[0]; out[1] = y2 + pos[1]; out[2] = -x1 * sy_ + z2 * cy + pos[2];
      return out;
    };
  }
  const WX = [], WY = [], WZ = [], PX = [], PY = [], PZ = [];
  const LIGHT = (() => { const l = Math.hypot(-0.5, 0.8, 0.6); return [-0.5 / l, 0.8 / l, 0.6 / l]; })();
  // Add a mesh to the frame. o: pos, rx/ry/rz, s, col (0 line, 1 accent), a, asm (build 0..1), glass, lit, bias, w, ring.
  function mesh(m, o = {}) {
    const C = R.C, n = m.v.length, T = xform(o), tmp = [0, 0, 0, 0], w3 = [0, 0, 0];
    const asm = o.asm == null ? 1 : o.asm, lvl = asm * 1.3, rise = o.dis == null ? 170 : o.dis;
    for (let i = 0; i < n; i++) {
      const v = m.v[i];
      T(v[0], v[1], v[2], w3);
      if (asm < 1) {
        const fv = clamp((lvl - m.vy[i]) / 0.35), d = ((1 - fv) * (1 - fv) * 0.6 + (1 - asm) * (1 - asm) * 1.4) * rise, dd = m.vd[i];
        w3[0] += dd[0] * d; w3[1] += dd[1] * d; w3[2] += dd[2] * d;
      }
      WX[i] = w3[0]; WY[i] = w3[1]; WZ[i] = w3[2];
      proj(C, w3[0], w3[1], w3[2], tmp);
      PX[i] = tmp[0]; PY[i] = tmp[1]; PZ[i] = tmp[2];
    }
    const a0 = o.a == null ? 1 : o.a, bias = o.bias || 0;
    for (let fi = 0; fi < m.f.length; fi++) {
      const f = m.f[fi];
      const fa = asm >= 1 ? 1 : clamp((lvl - m.fy[fi]) / 0.3);
      const a = fa * a0;
      if (a < 0.03) continue;
      const p = [];
      let z = 0;
      for (let q = 0; q < f.length; q++) { p.push(PX[f[q]], PY[f[q]]); z += PZ[f[q]]; }
      z = z / f.length + bias;
      const i0 = f[0], i1 = f[1], i2 = f[2];
      const ux = WX[i1] - WX[i0], uy = WY[i1] - WY[i0], uz = WZ[i1] - WZ[i0], vx = WX[i2] - WX[i0], vy = WY[i2] - WY[i0], vz = WZ[i2] - WZ[i0];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1;
      const sh = Math.abs((nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / l);
      R.items.push({ k: 0, p, z, a, c: o.col || 0, sh, lit: o.lit || 0, w: o.w || 1, g: o.glass || 0, hot: asm >= 1 ? 0 : 1 - fa });
    }
    // The scan ring that travels up an object as it builds or comes apart.
    if (o.ring !== false && asm > 0.015 && asm < 0.985) {
      const yy = lerp(m.y0, m.y1, clamp(lvl - 0.12)), rr = m.rad * 1.08 + 4, pts = [];
      for (let s = 0; s <= 40; s++) { const ang = (s / 40) * TAU; T(rr * Math.cos(ang), yy, rr * Math.sin(ang), w3); proj(C, w3[0], w3[1], w3[2], tmp); pts.push(tmp[0], tmp[1]); }
      R.items.push({ k: 1, p: pts, z: (R.C.dist - 4000) + (o.bias || 0) * 0 + 0, a: 1, c: 1, w: 2.2, hot: 1 });
      R.items[R.items.length - 1].z = PZ[0] - 9999;
    }
  }
  // A world-space polyline (points as [x,y,z]).
  function line3(pts, o = {}) {
    const C = R.C, tmp = [0, 0, 0, 0], p = [];
    let z = 0;
    for (const q of pts) { proj(C, q[0], q[1], q[2], tmp); p.push(tmp[0], tmp[1]); z += tmp[2]; }
    R.items.push({ k: 1, p, z: z / pts.length + (o.bias || 0), a: o.a ?? 1, c: o.c || 0, w: o.w || 1, d: o.d, off: o.off || 0, hot: o.hot || 0 });
  }
  function dot3(x, y, z, o = {}) {
    const tmp = proj(R.C, x, y, z, [0, 0, 0, 0]);
    R.items.push({ k: 2, x: tmp[0], y: tmp[1], r: (o.r || 6) * (o.scale ? tmp[3] : 1), z: tmp[2] + (o.bias || 0), a: o.a ?? 1, c: o.c || 0 });
    return tmp;
  }
  const over = (fn) => R.over.push(fn);
  const top = (fn) => R.top.push(fn);

  // ---- colour caches, layers and bloom --------------------------------------------------------------
  const CACHE = { key: "", line: {}, fill: {} };
  const LAYERS = { W: 0, H: 0 };
  function layers(F) {
    if (LAYERS.W !== F.W || LAYERS.H !== F.H) {
      const mk = (w, h) => { const c = document.createElement("canvas"); c.width = Math.max(2, Math.round(w)); c.height = Math.max(2, Math.round(h)); return c; };
      LAYERS.W = F.W; LAYERS.H = F.H;
      LAYERS.main = mk(F.W, F.H); LAYERS.s1 = mk(F.W / 4, F.H / 4); LAYERS.s2 = mk(F.W / 4, F.H / 4); LAYERS.s3 = mk(F.W / 14, F.H / 14); LAYERS.s4 = mk(F.W / 14, F.H / 14);
      for (const k of ["main", "s1", "s2", "s3", "s4"]) LAYERS[k + "g"] = LAYERS[k].getContext("2d");
    }
    return LAYERS;
  }
  function cacheFor(F) {
    const key = F.tone.line + F.tone.face + F.accKey;
    if (CACHE.key !== key) { CACHE.key = key; CACHE.line = {}; CACHE.fill = {}; }
    return CACHE;
  }
  function lineStr(F, c, a, hot) {
    const q = Math.round(clamp(a) * 24), h = Math.round(hot * 3), key = (c * 40 + q) * 4 + h, ca = cacheFor(F);
    if (ca.line[key]) return ca.line[key];
    const base = c === 1 ? F.acc : F.tone.lineRGB, mix = h / 3 * 0.75;
    const rgb = base.map((v) => Math.round(v + ((F.tone.hotRGB ? F.tone.hotRGB[0] : 255) - v) * mix));
    return (ca.line[key] = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(q / 24).toFixed(3)})`);
  }
  function fillStr(F, c, sh, lit, a) {
    const sq = Math.round(clamp(sh) * 9), lq = Math.round(clamp(lit) * 4), aq = Math.round(clamp(a) * 10), key = ((c * 10 + sq) * 5 + lq) * 11 + aq, ca = cacheFor(F);
    if (ca.fill[key]) return ca.fill[key];
    const T = F.tone, base = T.faceRGB, tgt = c === 1 ? F.acc : T.lineRGB;
    const tint = (T.tintMin + (sq / 9) * T.tintRange + lq * 0.05) * (c === 1 ? 1.9 : 1);
    const rgb = base.map((v, i) => Math.round(v + (tgt[i] - v) * clamp(tint)));
    return (ca.fill[key] = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${((aq / 10) * (F.solid ? 1 : 0.74)).toFixed(2)})`);
  }
  function flush(ctx, F, opts = {}) {
    const L = layers(F), g = L.maing, C = R.C, items = R.items;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.clearRect(0, 0, F.W, F.H);
    g.lineJoin = "round"; g.lineCap = "round";
    items.sort((a, b) => b.z - a.z);
    const lw0 = 1.7 * F.u;
    for (const it of items) {
      const fog = clamp(1 - (it.z - C.fogZ) / C.fogR, C.fogMin, 1);
      if (it.k === 0) {
        const p = it.p;
        g.beginPath(); g.moveTo(p[0], p[1]);
        for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
        g.closePath();
        g.fillStyle = fillStr(F, it.c, it.sh, it.lit, clamp(it.a * (1 - it.g)));
        g.fill();
        g.strokeStyle = lineStr(F, it.c, Math.min(1, 0.95 * it.a * fog + it.hot * 0.35), it.hot);
        g.lineWidth = lw0 * it.w * (1 + it.hot * 0.9);
        g.stroke();
      } else if (it.k === 1) {
        const p = it.p;
        g.beginPath(); g.moveTo(p[0], p[1]);
        for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
        g.setLineDash(it.d ? it.d.map((v) => v * F.u) : []); g.lineDashOffset = it.off * F.u;
        g.strokeStyle = lineStr(F, it.c, Math.min(1, it.a * (it.hot ? 1 : fog)), it.hot);
        g.lineWidth = lw0 * it.w * (it.hot ? 1.3 : 1);
        g.stroke(); g.setLineDash([]);
      } else {
        g.beginPath(); g.arc(it.x, it.y, Math.max(1, it.r), 0, TAU);
        g.fillStyle = lineStr(F, it.c, it.a * fog, it.c === 1 ? 1 : 0); g.fill();
      }
    }
    for (const fn of R.over) { g.save(); fn(g, F); g.restore(); }
    items.length = 0; R.over.length = 0;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(L.main, 0, 0);
    const glow = F.tone.glow * (opts.glow ?? 1);
    if (glow > 0.01) {
      L.s1g.clearRect(0, 0, L.s1.width, L.s1.height); L.s1g.drawImage(L.main, 0, 0, L.s1.width, L.s1.height);
      L.s2g.clearRect(0, 0, L.s2.width, L.s2.height); L.s2g.filter = `blur(${(2.4).toFixed(1)}px)`; L.s2g.drawImage(L.s1, 0, 0); L.s2g.filter = "none";
      L.s3g.clearRect(0, 0, L.s3.width, L.s3.height); L.s3g.drawImage(L.s1, 0, 0, L.s3.width, L.s3.height);
      L.s4g.clearRect(0, 0, L.s4.width, L.s4.height); L.s4g.filter = "blur(1.6px)"; L.s4g.drawImage(L.s3, 0, 0); L.s4g.filter = "none";
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = clamp(glow * 0.95); ctx.drawImage(L.s2, 0, 0, F.W, F.H);
      ctx.globalAlpha = clamp(glow * 0.75); ctx.drawImage(L.s4, 0, 0, F.W, F.H);
    }
    ctx.restore();
    for (const fn of R.top) { ctx.save(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; fn(ctx, F); ctx.restore(); }
    R.top.length = 0;
  }

  // ---- 2D drawing helpers (run on the layer, so they bloom with the lines) --------------------------
  // A HUD tag: dark plate, colour bar, bracketed edge; the plate grows with the letters as they type on.
  function tag(g, F, text, x, y, o = {}) {
    const u = F.u, q = o.q == null ? 1 : o.q;
    text = String(text ?? "").toUpperCase();
    if (q <= 0 || !text) return null;
    let size = (o.size || 42) * u;
    g.font = `700 ${size}px ${MONO}`; g.letterSpacing = "0px";
    let full = g.measureText(text).width;
    if (o.maxW && full > o.maxW) { size *= o.maxW / full; g.font = `700 ${size}px ${MONO}`; full = g.measureText(text).width; }
    const shown = q >= 1 ? text : text.slice(0, Math.max(1, Math.ceil(text.length * q)));
    const tw = g.measureText(shown).width, pad = size * 0.4, h = size * 1.5, bw = tw + pad * 2 + 6 * u + (q < 1 ? size * 0.5 : 0);
    const fullBw = full + pad * 2 + 6 * u;
    const x0 = o.align === "center" ? x - fullBw / 2 : o.align === "right" ? x - fullBw : x, y0 = y - h / 2;
    const col = o.col === 1 ? F.accC : F.lineC;
    g.fillStyle = `rgba(${F.tone.face},0.9)`; g.fillRect(x0, y0, bw, h);
    g.fillStyle = col(1); g.fillRect(x0, y0, 5 * u, h);
    g.strokeStyle = col(0.55); g.lineWidth = 1.4 * u; g.strokeRect(x0, y0, bw, h);
    g.strokeStyle = col(1); g.lineWidth = 2.4 * u; const cl = size * 0.28;
    g.beginPath(); g.moveTo(x0 + bw - cl, y0); g.lineTo(x0 + bw, y0); g.lineTo(x0 + bw, y0 + cl); g.moveTo(x0 + bw - cl, y0 + h); g.lineTo(x0 + bw, y0 + h); g.lineTo(x0 + bw, y0 + h - cl); g.stroke();
    g.textAlign = "left"; g.textBaseline = "middle";
    g.shadowColor = col(0.6); g.shadowBlur = size * 0.2; g.fillStyle = o.color || F.ink;
    g.fillText(shown, x0 + pad + 5 * u, y + size * 0.05);
    if (q < 1 && Math.floor(F.t * 14) % 2 === 0) { g.shadowBlur = 0; g.fillStyle = col(1); g.fillRect(x0 + pad + 5 * u + tw + size * 0.08, y - size * 0.4, size * 0.34, size * 0.8); }
    return { x: x0, y: y0, w: fullBw, h };
  }
  // A glowing figure (numbers): bold mono with a phosphor halo.
  function figure(g, F, text, x, y, size, o = {}) {
    g.font = `800 ${size}px ${MONO}`; g.textAlign = o.align || "center"; g.textBaseline = o.base || "alphabetic"; g.letterSpacing = "0px";
    const w = g.measureText(text).width;
    if (o.maxW && w > o.maxW) { size *= o.maxW / w; g.font = `800 ${size}px ${MONO}`; }
    const col = o.col === 1 ? F.accC : F.lineC;
    g.shadowColor = col(0.9); g.shadowBlur = size * 0.3; g.fillStyle = o.color || (o.col === 1 ? F.accC(1) : F.ink);
    g.fillText(text, x, y);
    g.shadowBlur = 0;
  }
  function polylineScreen(g, pts, q) {
    if (q <= 0) return;
    let total = 0;
    for (let i = 2; i < pts.length; i += 2) total += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
    let left = total * clamp(q);
    g.beginPath(); g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) {
      const dx = pts[i] - pts[i - 2], dy = pts[i + 1] - pts[i - 1], d = Math.hypot(dx, dy);
      if (d >= left) { const k = d ? left / d : 0; g.lineTo(pts[i - 2] + dx * k, pts[i - 1] + dy * k); break; }
      left -= d; g.lineTo(pts[i], pts[i + 1]);
    }
    g.stroke();
  }
  const circle3 = (cx, cy, cz, r, n = 48, plane = "xz", rot = 0) => {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU + rot, c = Math.cos(a) * r, s = Math.sin(a) * r;
      out.push(plane === "xz" ? [cx + c, cy, cz + s] : plane === "xy" ? [cx + c, cy + s, cz] : [cx, cy + c, cz + s]);
    }
    return out;
  };

  // ---- frame state -----------------------------------------------------------------------------------
  const ST = { F: null, info: null };
  function frameFor(S, info) {
    if (ST.F && ST.F.S === S && ST.F.t === info.t) return ST.F;
    const look = S.look, T = look.tone;
    const F = { S, W: S.W, H: S.H, u: S.u, tall: S.tall, tone: T, t: info.t, solid: !!S.paint, tex: look.texture, ink: look.ink, acc: rgbOf(S.accent), accKey: S.accent };
    T.lineRGB = T.lineRGB || T.line.split(",").map(Number);
    T.faceRGB = T.faceRGB || T.face.split(",").map(Number);
    F.lineC = (a) => `rgba(${T.line},${a})`;
    F.accC = (a) => `rgba(${F.acc[0]},${F.acc[1]},${F.acc[2]},${a})`;
    return (ST.F = F);
  }

  // ---- the world: sky, floor, solids, dust, ripples, HUD ----------------------------------------------
  let SOLIDS = null, DUST = null, worldKey = "";
  function worldSeeds() {
    if (SOLIDS) return;
    const r = rng(6606);
    SOLIDS = [];
    const kinds = ["ico", "oct", "box", "tor", "ico", "oct", "box", "tor", "ico", "box", "oct"];
    for (let i = 0; i < 11; i++) {
      SOLIDS.push({ kind: kinds[i], x: (r() * 2 - 1) * 2300, y: 250 + r() * 900, z: 1100 + r() * 3000, sz: 0.7 + r() * 0.9, sp: 0.15 + r() * 0.35, ph: r() * TAU, drift: 18 + r() * 30 });
    }
    DUST = [];
    for (let i = 0; i < 90; i++) DUST.push({ x: (r() * 2 - 1) * 2400, y: -300 + r() * 1500, z: r() * 4200, sp: 60 + r() * 140, s: 0.6 + r() * 1.6, ph: r() * 40 });
  }
  function worldCam(F, info) {
    const { W, H, u, t } = F;
    const yaw = 0.16 * Math.sin(t * 0.17) + 0.07 * Math.sin(t * 0.43 + 1) + (F.tall ? 0 : 0);
    return mkCam({ sx0: W / 2, sy0: H * (F.tall ? 0.66 : 0.64), dist: 1500, f: 1500 * u * (F.tall ? 0.78 : 0.9), yaw, pitch: 0.13 + 0.015 * Math.sin(t * 0.3), tx: 0, ty: 0, tz: 0, fogZ: 1500, fogR: 4800, fogMin: 0.1 });
  }
  const FLOOR_Y = -400, SPACE = 220;
  function worldItems(F, info) {
    const { t, u } = F;
    const C = R.C;
    if (!F.solid) return;
    const off = (t * 150) % SPACE;
    // lines running away from the camera, brighter every fourth
    for (let j = -14; j <= 14; j++) {
      const x = j * SPACE, major = ((j % 4) + 4) % 4 === 0;
      line3([[x, FLOOR_Y, -900], [x, FLOOR_Y, 5600]], { a: major ? 0.8 : 0.42, w: major ? 1.15 : 0.8 });
    }
    // lines streaming toward the camera
    for (let k = -4; k < 26; k++) {
      const z = k * SPACE - off, idx = Math.round((z + off) / SPACE), major = ((idx % 4) + 4) % 4 === 0;
      line3([[-3100, FLOOR_Y, z], [3100, FLOOR_Y, z]], { a: major ? 0.85 : 0.5, w: major ? 1.2 : 0.85 });
    }
    // radar pings spreading across the floor
    for (let i = 0; i < 3; i++) {
      const ph = fract(t * 0.2 + i / 3), r = 120 + ph * 1900;
      line3(circle3(0, FLOOR_Y + 2, 1000, r, 56), { a: (1 - ph) * (1 - ph) * 0.9, c: 1, w: 1.4, bias: -500 });
    }
    // far solids drifting and turning
    for (let i = 0; i < SOLIDS.length; i++) {
      const s = SOLIDS[i];
      const o = { pos: [s.x + Math.sin(t * 0.2 + s.ph) * s.drift, s.y + Math.sin(t * 0.33 + s.ph) * 40, s.z], ry: t * s.sp + s.ph, rx: t * s.sp * 0.6, a: 0.8, bias: 100, ring: false, glass: 0 };
      if (s.kind === "ico") mesh(icoMesh(130 * s.sz), o);
      else if (s.kind === "oct") mesh(octaMesh(120 * s.sz), o);
      else if (s.kind === "box") mesh(boxMesh(190 * s.sz, 190 * s.sz, 190 * s.sz, 2, 2, 2), o);
      else mesh(torusMesh(110 * s.sz, 34 * s.sz, 14, 6), o);
    }
    // dust streaming toward the camera
    for (let i = 0; i < DUST.length; i++) {
      const d = DUST[i], z = ((d.z - t * d.sp + d.ph * 100) % 4200 + 4200) % 4200 - 400;
      const tw = 0.45 + 0.55 * hash(i, Math.floor(t * 4 + d.ph));
      dot3(d.x, d.y + Math.sin(t * 0.5 + d.ph) * 30, z, { r: d.s * 1.7 * u, a: tw * 0.9, c: i % 9 === 0 ? 1 : 0 });
    }
  }
  function skyAndHorizon(ctx, F, C) {
    const { W, H, u } = F, T = F.tone;
    const hy = C.sy0 - C.f * (C.sp / C.cp) * 1.0;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    const hf = clamp(hy / H, 0.2, 0.8);
    g.addColorStop(0, T.sky0); g.addColorStop(hf * 0.92, T.sky1); g.addColorStop(hf, T.hor); g.addColorStop(Math.min(0.99, hf + 0.04), T.gnd0); g.addColorStop(1, T.gnd1);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, hy); ctx.scale(1, 0.22);
    const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 0.75);
    rg.addColorStop(0, `rgba(${T.line},${0.34 * (T.glow > 0 ? 1 : 0.4)})`); rg.addColorStop(1, `rgba(${T.line},0)`);
    ctx.fillStyle = rg; ctx.fillRect(-W, -W, W * 2, W * 2);
    ctx.restore();
    return hy;
  }
  function hud(g, F, info) {
    const { W, H, u, t } = F;
    const lc = F.lineC, m = 44 * u, len = 54 * u;
    g.lineWidth = 2.2 * u; g.strokeStyle = lc(0.7);
    for (const [cx, cy, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
      g.beginPath(); g.moveTo(cx + sx * len, cy); g.lineTo(cx, cy); g.lineTo(cx, cy + sy * len); g.stroke();
    }
    // record lamp, blinking
    if (Math.floor(t * 1.6) % 2 === 0) { g.fillStyle = F.accC(0.95); g.beginPath(); g.arc(m + 14 * u, m + 14 * u, 6 * u, 0, TAU); g.fill(); }
    // rulers whose ticks slide
    g.lineWidth = 1.4 * u;
    const step = 26 * u, sl = (t * 34 * u) % (step * 5);
    for (let y = m + len; y < H - m - len; y += step) {
      const k = Math.round((y - sl) / step), maj = ((k % 5) + 5) % 5 === 0, yy = y + sl % step;
      g.strokeStyle = lc(maj ? 0.5 : 0.26);
      g.beginPath(); g.moveTo(W - m, yy); g.lineTo(W - m - (maj ? 20 : 11) * u, yy); g.stroke();
      g.beginPath(); g.moveTo(m, yy); g.lineTo(m + (maj ? 20 : 11) * u, yy); g.stroke();
    }
    // readout and spectrum, top right
    g.font = `600 ${26 * u}px ${MONO}`; g.textAlign = "right"; g.textBaseline = "alphabetic"; g.fillStyle = lc(0.7);
    const ry = (info && info.rd) || 0;
    g.fillText(`T+${t.toFixed(2).padStart(5, "0")}s   YAW ${(((Math.sin(t * 0.17) * 9) + 180) % 360 - 180).toFixed(1)}`, W - m - 36 * u, m + 20 * u);
    for (let i = 0; i < 16; i++) {
      const hh = (0.25 + 0.75 * Math.abs(Math.sin(t * (1.3 + (i % 5) * 0.37) + i * 1.7) * Math.cos(t * 0.9 + i))) * 40 * u;
      g.fillStyle = i % 7 === 3 ? F.accC(0.75) : lc(0.5);
      g.fillRect(W - m - 36 * u - (16 - i) * 11 * u, m + 72 * u - hh, 7 * u, hh);
    }
    // timeline rail along the bottom
    const bx0 = W * 0.2, bx1 = W * 0.8, by = H - m - 4 * u, prog = clamp(t / Math.max(1, info.length || 20));
    g.strokeStyle = lc(0.35); g.lineWidth = 2 * u; g.beginPath(); g.moveTo(bx0, by); g.lineTo(bx1, by); g.stroke();
    g.strokeStyle = lc(0.2); g.lineWidth = 1.4 * u;
    for (let i = 0; i <= 20; i++) { const x = lerp(bx0, bx1, i / 20); g.beginPath(); g.moveTo(x, by); g.lineTo(x, by - (i % 5 === 0 ? 14 : 8) * u); g.stroke(); }
    g.strokeStyle = F.accC(0.95); g.lineWidth = 3.4 * u; g.beginPath(); g.moveTo(bx0, by); g.lineTo(lerp(bx0, bx1, prog), by); g.stroke();
    g.fillStyle = F.accC(1); g.beginPath(); g.arc(lerp(bx0, bx1, prog), by, 7 * u, 0, TAU); g.fill();
    // axis gizmo
    const gx = m + 98 * u, gy = H - m - 98 * u, yaw = 0.16 * Math.sin(t * 0.17), ax = [[Math.cos(yaw), 0.18 * Math.sin(yaw)], [0, -1], [-Math.sin(yaw), -0.42]];
    ["X", "Y", "Z"].forEach((n, i) => {
      g.strokeStyle = i === 1 ? F.accC(0.9) : lc(0.85); g.lineWidth = 2.4 * u;
      g.beginPath(); g.moveTo(gx, gy); g.lineTo(gx + ax[i][0] * 56 * u, gy + ax[i][1] * 56 * u); g.stroke();
      g.fillStyle = i === 1 ? F.accC(0.9) : lc(0.85); g.font = `700 ${22 * u}px ${MONO}`; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(n, gx + ax[i][0] * 76 * u, gy + ax[i][1] * 76 * u);
    });
  }

  // ---- the hero crystal for title and closing --------------------------------------------------------
  function hero(F, ctx, asm, lit, strongAcc) {
    const { W, H, u, t } = F;
    const area = F.tall ? { x: 0, y: H * 0.52, w: W, h: H * 0.42 } : { x: W * 0.58, y: H * 0.06, w: W * 0.42, h: H * 0.78 };
    const k = Math.min(area.w / 800, area.h / 800);
    const C = mkCam({ sx0: area.x + area.w * 0.5, sy0: area.y + area.h * 0.5, dist: 1600, f: 1600 * k, yaw: 0.2 * Math.sin(t * 0.3), pitch: 0.28, tx: 0, ty: 0, tz: 0, fogR: 3000 });
    begin(F, C);
    const hover = Math.sin(t * 1.3) * 14;
    // plinth: a grid disc that turns slowly, with a ping ring
    mesh(latheMesh("disc", [[0.001, -330], [110, -330], [220, -330], [330, -330], [330, -318], [0.001, -318]], 28), { ry: -t * 0.15, a: 1, asm: span(asm, 0, 0.5), bias: 400, ring: false, w: 0.8 });
    for (let i = 0; i < 2; i++) { const ph = fract(t * 0.35 + i / 2); line3(circle3(0, -316, 0, 60 + ph * 330, 48), { a: (1 - ph) * 0.9 * asm, c: 1, w: 1.4 }); }
    // outer glass crystal and an inner accent one turning the other way
    mesh(crystalMesh(), { s: [1.85, 2.0, 1.85], ry: t * 0.55, pos: [0, hover, 0], glass: 0.62, asm, lit, col: 0, w: 1.15 });
    mesh(crystalMesh(), { s: [0.82, 0.95, 0.82], ry: -t * 0.9, pos: [0, hover, 0], col: 1, asm: span(asm, 0.25, 1), lit: lit + 0.2 + 0.25 * Math.sin(t * 3), w: 1 });
    // three great circles and satellites
    for (let i = 0; i < 3; i++) {
      const tilt = i * 1.05 + t * (0.18 + 0.05 * i) * (i % 2 ? -1 : 1), rr = 360 + i * 36, pts = [];
      for (let s = 0; s <= 72; s++) {
        const a = (s / 72) * TAU, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        pts.push([x * Math.cos(tilt) - 0, x * Math.sin(tilt) * 0.55 + hover, z * Math.cos(tilt * 0.6) + x * 0.15]);
      }
      line3(pts, { a: 0.85 * asm, c: i === 1 ? 1 : 0, w: 1.1 });
      const a = t * (0.7 + 0.25 * i) + i * 2, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      mesh(octaMesh(16 + i * 3), { pos: [x * Math.cos(tilt), x * Math.sin(tilt) * 0.55 + hover, z * Math.cos(tilt * 0.6) + x * 0.15], ry: t * 2, rx: t, col: i === 1 ? 1 : 0, asm: span(asm, 0.5, 1), ring: false, bias: -80 });
    }
    flush(ctx, F, { glow: 1 + lit * 0.4 });
  }

  // ---- texture, scan sweep and vignette: the last thing drawn each frame -----------------------------
  let SCAN = null, NOISE = null;
  function finish(ctx, F) {
    const { W, H, u, t, tex } = F, info = ST.info || {};
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    // scan sweep across the frame at each scene change
    if (info.index > 0 && info.local < info.change + 0.15) {
      const q = ease(info.local / Math.max(0.05, info.change)), tall = F.tall, wd = 360 * u;
      const pos = lerp(-wd * 0.4, (tall ? H : W) + wd * 0.6, q);
      const lg = tall ? ctx.createLinearGradient(0, pos - wd, 0, pos) : ctx.createLinearGradient(pos - wd, 0, pos, 0);
      lg.addColorStop(0, F.lineC(0)); lg.addColorStop(0.92, F.lineC(0.16 * (F.tone.glow > 0 ? 1 : 0.6))); lg.addColorStop(1, F.accC(0.9));
      ctx.globalCompositeOperation = F.tone.glow > 0 ? "lighter" : "source-over";
      ctx.fillStyle = lg;
      if (tall) ctx.fillRect(0, pos - wd, W, wd); else ctx.fillRect(pos - wd, 0, wd, H);
      ctx.globalCompositeOperation = "source-over";
    }
    if (F.solid && tex > 0) {
      // slow rolling scanlines
      if (!SCAN) { const c = document.createElement("canvas"); c.width = 4; c.height = 4; const g = c.getContext("2d"); g.fillStyle = "rgba(0,0,0,1)"; g.fillRect(0, 0, 4, 1.4); SCAN = ctx.createPattern(c, "repeat"); }
      ctx.save(); ctx.translate(0, (t * 22) % 4); ctx.globalAlpha = (F.tone.glow > 0 ? 0.2 : 0.06) * tex; ctx.fillStyle = SCAN; ctx.fillRect(0, -4, W, H + 8); ctx.restore();
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, `rgba(${F.tone.vig},${F.tone.vigA * tex})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      if (F.tone.glow > 0) {
        if (!NOISE) { const c = document.createElement("canvas"); c.width = 160; c.height = 160; const g = c.getContext("2d"), im = g.createImageData(160, 160), r = rng(77); for (let i = 0; i < 160 * 160; i++) { const v = r() * 255; im.data[i * 4] = v * 0.6; im.data[i * 4 + 1] = v; im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; } g.putImageData(im, 0, 0); NOISE = ctx.createPattern(c, "repeat"); }
        const fr = Math.floor(t * 24);
        ctx.save(); ctx.translate(Math.floor(hash(fr, 1) * 160), Math.floor(hash(fr, 2) * 160)); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.035 * tex; ctx.fillStyle = NOISE; ctx.fillRect(-160, -160, W + 320, H + 320); ctx.restore();
      }
    }
    ctx.restore();
  }

  // ---- stage: under every scene -------------------------------------------------------------------
  const DRAWN = (s) => s && s !== "title" && s !== "closing";
  function stage(ctx, S, info) {
    worldSeeds();
    const F = frameFor(S, info);
    ST.info = { ...info };
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; ctx.filter = "none";
    const C = worldCam(F, info);
    if (F.solid) skyAndHorizon(ctx, F, C);
    begin(F, C);
    worldItems(F, info);
    over((g, FF) => hud(g, FF, { ...info, length: info.length }));
    flush(ctx, F, { glow: 0.9 });
    // the hero crystal belongs to the title and the closing line
    const ctl = (window.__dreamcut && window.__dreamcut.controls) || {};
    const titleHold = Number(ctl.title_hold ?? 2.4);
    if (info.scene === "title") hero(F, ctx, clamp(0.06 + info.local / 1.5), 0, false);
    else if (info.scene === "closing") hero(F, ctx, clamp(0.06 + info.local / 1.3), 0.45 + 0.3 * Math.sin(info.local * 2.6), true);
    else if (info.index === 1 && titleHold > 0 && info.local < info.change) hero(F, ctx, 1 - clamp(info.local / Math.max(0.01, info.change)), 0, false);
    ctx.restore();
    if (!DRAWN(info.scene)) finish(ctx, F);
  }

  // ---- scenes -----------------------------------------------------------------------------------------
  const stag = (b, x, i, n, spread = 0.5) => (x > 0 ? clamp(1 - (x * (1 + spread) - (i * spread) / Math.max(1, n))) : clamp((b * (1 + spread) - (i * spread) / Math.max(1, n))));
  const sceneFrame = (S, info, p) => {
    const F = frameFor(S, info);
    return { F, x: info.exit || 0, b: info.exit ? 1 : Math.max(p, ease(info.local / 0.9) * 0.2), t: info.t, u: S.u };
  };
  const wrapUp = (ctx, F, x) => { if (!x) finish(ctx, F); };

  // BARS: a plinth, a gridded back wall and bars that rise, with the numbers floating over their tops.
  function chart(ctx, S, box, p, d, info) {
    const { F, x, b, t, u } = sceneFrame(S, info, p);
    const n = d.values.length, max = Math.max(...d.values, 1), tall = S.tall;
    const DW = tall ? 920 : 1760, DH = tall ? 1080 : 760;
    const C = sceneCam(F, box, info, { dw: DW, dh: DH, yaw: -0.46, pitch: 0.32, sway: 0.1, ty: DH * (tall ? 0.24 : 0.17), tx: 0, cy: 0.5 });
    begin(F, C);
    const sp = (DW * 0.84) / n, bw = sp * 0.56, bd = bw * 0.9, hmax = DH * (tall ? 0.46 : 0.5);
    mesh(boxMesh(n * sp + 120, 26, bd + 190, n * 3, 1, 3), { pos: [0, -13, 0], a: 1, bias: 500, asm: span(b, 0, 0.3) * (x ? 1 - x : 1) + (x ? 0 : 0), ring: false });
    // gridded back wall
    const wa = clamp(span(b, 0.05, 0.4) - x), wz = -bd / 2 - 80, ww = (n * sp + 120) / 2;
    for (let lv = 0; lv <= 5; lv++) line3([[-ww, (hmax * 1.25 * lv) / 5, wz], [ww, (hmax * 1.25 * lv) / 5, wz]], { a: wa * (lv === 0 ? 0.8 : 0.4), bias: 400 });
    for (let i = 0; i <= n; i++) line3([[-ww + (i * 2 * ww) / n, 0, wz], [-ww + (i * 2 * ww) / n, hmax * 1.25, wz]], { a: wa * 0.4, bias: 400 });
    // side wall hint
    for (let lv = 1; lv <= 5; lv++) line3([[-ww, (hmax * 1.25 * lv) / 5, wz], [-ww, (hmax * 1.25 * lv) / 5, wz + bd + 190]], { a: wa * 0.25, bias: 400 });
    const tops = [], hs = [];
    for (let i = 0; i < n; i++) {
      const g = stag(b, x, i, n), h = Math.max(0.01, (d.values[i] / max) * hmax * g), cx = -((n - 1) * sp) / 2 + i * sp, hot = i === d.highlight;
      hs.push(h);
      tops.push([cx, h, 0, g]);
      if (g > 0.02) {
        mesh(boxMesh(1, 1, 1, 2, 6, 2), { s: [bw, h, bd], pos: [cx, h / 2, 0], col: hot ? 1 : 0, a: clamp(g * 3), lit: (g < 1 && g > 0.05 ? 0.7 : 0) + (hot ? 0.25 + 0.25 * Math.sin(t * 3.6) : 0), ring: false, w: hot ? 1.3 : 1 });
        // a floating cap that scans up and down the bar
        const sc = (fract(t * 0.35 + i * 0.21) * 2); const cy = (sc > 1 ? 2 - sc : sc) * h;
        if (g > 0.95) line3([[cx - bw / 2 - 6, cy, bd / 2 + 6], [cx + bw / 2 + 6, cy, bd / 2 + 6], [cx + bw / 2 + 6, cy, -bd / 2 - 6], [cx - bw / 2 - 6, cy, -bd / 2 - 6], [cx - bw / 2 - 6, cy, bd / 2 + 6]], { a: 0.75, c: hot ? 1 : 0, w: 0.9, bias: -50 });
        if (hot && g > 0.9) { // dashed ghost of the reach, drawn above the bar
          const hh = hmax * 1.12;
          line3([[cx - bw / 2, h, bd / 2], [cx - bw / 2, hh, bd / 2], [cx + bw / 2, hh, bd / 2], [cx + bw / 2, h, bd / 2]], { a: 0.5, c: 1, d: [8, 9], off: -t * 30, bias: -60 });
        }
      }
    }
    // trend line joining the tops with a travelling pulse
    if (b >= 0.8 || x > 0) {
      const tl = clamp(1 - x * 2), pts = tops.map((q) => [q[0], q[1] + 38, 0]);
      if (pts.length > 1 && tl > 0) {
        line3(pts, { a: 0.9 * tl, c: 1, w: 1.5, bias: -200 });
        const s = fract(t * 0.32) * (pts.length - 1), i0 = Math.min(pts.length - 2, Math.floor(s)), f = s - i0;
        dot3(lerp(pts[i0][0], pts[i0 + 1][0], f), lerp(pts[i0][1], pts[i0 + 1][1], f), 0, { r: 9 * u, c: 1, bias: -300, a: tl });
        dot3(lerp(pts[i0][0], pts[i0 + 1][0], f), lerp(pts[i0][1], pts[i0 + 1][1], f), 0, { r: 19 * u, c: 1, bias: -300, a: 0.25 * tl });
      }
    }
    const tmp = [0, 0, 0, 0], tmp2 = [0, 0, 0, 0];
    top((g, FF) => {
      for (let i = 0; i < n; i++) {
        const q = tops[i][3];
        if (q < 0.08) continue;
        proj(C, tops[i][0], tops[i][1], 0, tmp);
        proj(C, tops[i][0] + sp, 0, 0, tmp2);
        const gap = Math.abs(tmp2[0] - tmp[0]) || 200 * u, hot = i === d.highlight;
        const sx = tmp[0], sy = tmp[1] - 30 * u * 1.1;
        const txt = nf(d.values[i] * q, 0, d.prefix, d.suffix);
        figure(g, FF, txt, sx, sy, 96 * u, { col: hot ? 1 : 0, maxW: gap * 0.95 });
        proj(C, tops[i][0], 0, bd / 2 + 70, tmp);
        tag(g, FF, d.labels[i] || "", tmp[0], tmp[1] + 38 * u, { align: "center", q: clamp((q - 0.4) * 3) * (x ? 1 - x : 1), size: 42, col: hot ? 1 : 0, maxW: gap * 0.96 });
      }
    });
    flush(ctx, F);
    wrapUp(ctx, F, x);
  }

  // DEVICE: an exploded laptop (or phone) with a floating interface layer and three leader callouts.
  function object(ctx, S, box, p, d, info) {
    const { F, x, b, t, u } = sceneFrame(S, info, p);
    const phone = d.kind === "phone", tall = S.tall;
    const area = tall ? { x: box.x, y: box.y, w: box.w, h: box.h * 0.62 } : { x: box.x, y: box.y, w: box.w * 0.64, h: box.h };
    const C = sceneCam(F, area, info, { dw: phone ? 760 : 1000, dh: phone ? 780 : 640, yaw: -0.5, pitch: 0.3, sway: 0.16, ty: phone ? 90 : 120, tz: 0, cx: 0.5, cy: 0.5 });
    begin(F, C);
    const ex = ease(span(b, 0.28, 1)) * (x ? 1 - x : 1) * (1 + 0.04 * Math.sin(t * 1.4)), asmB = x ? 1 - x : span(b, 0, 0.5), asmS = x ? 1 - x : span(b, 0.15, 0.75);
    const SW = phone ? 300 : 600, SH = phone ? 620 : 390, UW = SW - 40, UH = SH - 40;
    let centre, tilt, normal, baseY = 0;
    if (!phone) {
      mesh(boxMesh(600, 26, 400, 10, 1, 7), { pos: [0, 0, 0], asm: asmB, a: 1, bias: 200 });
      // keys and a touch pad
      const ka = clamp(asmB * 2 - 0.6);
      if (ka > 0) {
        for (let r = 0; r < 4; r++) for (let c = 0; c < 11; c++) {
          const kx = -255 + c * 51, kz = -120 + r * 46;
          line3([[kx, 14, kz], [kx + 42, 14, kz], [kx + 42, 14, kz + 34], [kx, 14, kz + 34], [kx, 14, kz]], { a: 0.55 * ka, w: 0.6 });
        }
        line3([[-90, 14, 80], [90, 14, 80], [90, 14, 168], [-90, 14, 168], [-90, 14, 80]], { a: 0.6 * ka, w: 0.7 });
      }
      tilt = -0.21;
      centre = [0, 13 + 195 * Math.cos(tilt) + ex * 8, -200 + 195 * Math.sin(tilt) - ex * 6];
      normal = [0, -Math.sin(tilt), Math.cos(tilt)];
    } else {
      tilt = 0;
      centre = [0, 330, 0];
      normal = [0, 0, 1];
      mesh(latheMesh("pedD", [[0.001, 0], [170, 0], [178, 10], [170, 16], [0.001, 16]], 24), { asm: asmB, bias: 400, ring: false });
    }
    const spin = phone ? 0 : 0;
    mesh(boxMesh(SW, SH, phone ? 28 : 16, phone ? 5 : 10, phone ? 10 : 6, 1), { pos: centre, rx: tilt, asm: asmS, a: 1, lit: 0, ring: true });
    const lay = (dist) => [centre[0] + normal[0] * dist, centre[1] + normal[1] * dist, centre[2] + normal[2] * dist];
    // the interface layer floats forward of the screen
    const uiC = lay((phone ? 26 : 14) + ex * 120);
    const uiT = xform({ pos: uiC, rx: tilt });
    const q1 = [0, 0, 0], q2 = [0, 0, 0], q3 = [0, 0, 0], s1 = [0, 0, 0, 0], s2 = [0, 0, 0, 0], s3 = [0, 0, 0, 0];
    uiT(-UW / 2, UH / 2, 0, q1); uiT(UW / 2, UH / 2, 0, q2); uiT(-UW / 2, -UH / 2, 0, q3);
    proj(C, q1[0], q1[1], q1[2], s1); proj(C, q2[0], q2[1], q2[2], s2); proj(C, q3[0], q3[1], q3[2], s3);
    const uiOn = clamp(span(b, 0.3, 0.7) - x * 2);
    const gT = xform({ pos: lay((phone ? 26 : 14) + ex * 250), rx: tilt });
    // a glass pane further out, drawn as corner brackets
    const gl = clamp(span(b, 0.5, 0.9) - x * 2);
    if (gl > 0) {
      const gw = SW * 0.5 * 1.04, gh = SH * 0.5 * 1.04, cl = 46;
      for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
        const a = [0, 0, 0], bb = [0, 0, 0], c = [0, 0, 0];
        gT(sx * gw, sy * gh, 0, a); gT(sx * (gw - cl), sy * gh, 0, bb); gT(sx * gw, sy * (gh - cl), 0, c);
        line3([bb, a, c], { a: 0.9 * gl, c: 1, w: 1.5, bias: -400 });
      }
      line3([(() => { const o = [0, 0, 0]; gT(-gw, gh, 0, o); return o; })(), (() => { const o = [0, 0, 0]; gT(gw, gh, 0, o); return o; })()], { a: 0.2 * gl, d: [6, 10], off: -t * 20, bias: -400 });
    }
    // tether lines between the layers
    if (ex > 0.05) for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const a = [0, 0, 0], bb = [0, 0, 0];
      xform({ pos: centre, rx: tilt })(sx * SW * 0.5, sy * SH * 0.5, 9, a); uiT(sx * UW * 0.5, sy * UH * 0.5, 0, bb);
      line3([a, bb], { a: 0.4 * ex, d: [5, 7], off: -t * 24, bias: -300 });
    }
    // the interface content, mapped onto the floating layer
    const A = { a: (s2[0] - s1[0]) / UW, b: (s2[1] - s1[1]) / UW, c: (s3[0] - s1[0]) / UH, d: (s3[1] - s1[1]) / UH, e: s1[0], f: s1[1] };
    const sc = Math.hypot(A.a, A.b) || 1;
    const lp = (uu, vv) => [A.a * uu + A.c * vv + A.e, A.b * uu + A.d * vv + A.f];
    const pw = UW, ph = UH;
    const prev = { x: pw * 0.045, y: ph * 0.05, w: pw * 0.91, h: ph * 0.46 };
    const trackY = [ph * 0.6, ph * 0.74, ph * 0.88];
    over((g, FF) => {
      if (uiOn <= 0) return;
      g.save();
      g.globalAlpha = uiOn;
      g.setTransform(A.a, A.b, A.c, A.d, A.e, A.f);
      const lw = (v) => (v * u) / sc * 1.1;
      g.fillStyle = `rgba(${FF.tone.face},0.96)`; g.fillRect(0, 0, pw, ph);
      g.strokeStyle = FF.lineC(0.9); g.lineWidth = lw(2.4); g.strokeRect(0, 0, pw, ph);
      // preview frame
      g.strokeStyle = FF.accC(1); g.lineWidth = lw(2.6); g.strokeRect(prev.x, prev.y, prev.w, prev.h);
      g.fillStyle = FF.lineC(0.08); g.fillRect(prev.x, prev.y, prev.w, prev.h);
      g.save(); g.beginPath(); g.rect(prev.x, prev.y, prev.w, prev.h); g.clip();
      const pcx = prev.x + prev.w / 2, pcy = prev.y + prev.h / 2, rr = Math.min(prev.w, prev.h) * 0.3;
      // a small cube turning inside the preview
      const a1 = t * 1.1, a2 = t * 0.7, cv = [];
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        let X = sx * rr * 0.7, Y = sy * rr * 0.7, Z = sz * rr * 0.7;
        const X2 = X * Math.cos(a1) + Z * Math.sin(a1), Z2 = -X * Math.sin(a1) + Z * Math.cos(a1), Y2 = Y * Math.cos(a2) - Z2 * Math.sin(a2), Z3 = Y * Math.sin(a2) + Z2 * Math.cos(a2);
        cv.push([pcx + X2 * (1 + Z3 / 500), pcy + Y2 * (1 + Z3 / 500)]);
      }
      g.strokeStyle = FF.lineC(0.95); g.lineWidth = lw(2);
      for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) { if (((i ^ j) & (i ^ j) - 1) === 0 && (i ^ j) !== 0) { g.beginPath(); g.moveTo(cv[i][0], cv[i][1]); g.lineTo(cv[j][0], cv[j][1]); g.stroke(); } }
      // a sweeping scan band
      const sw = fract(t * 0.45) * (prev.w + 80) - 40;
      const sg = g.createLinearGradient(prev.x + sw - 40, 0, prev.x + sw, 0); sg.addColorStop(0, FF.accC(0)); sg.addColorStop(1, FF.accC(0.5));
      g.fillStyle = sg; g.fillRect(prev.x + sw - 40, prev.y, 40, prev.h);
      g.restore();
      // tracks
      const clips = [[[0.05, 0.27], [0.36, 0.2], [0.62, 0.32]], [[0.05, 0.4], [0.5, 0.22], [0.76, 0.19]], [[0.05, 0.18], [0.28, 0.34], [0.68, 0.27]]];
      for (let r = 0; r < 3; r++) {
        g.strokeStyle = FF.lineC(0.18); g.lineWidth = lw(1.2); g.beginPath(); g.moveTo(0, trackY[r] + ph * 0.045); g.lineTo(pw, trackY[r] + ph * 0.045); g.stroke();
        clips[r].forEach(([cx, cw], i) => {
          const sh = clamp(span(b, 0.4 + r * 0.05 + i * 0.05, 0.7 + r * 0.05 + i * 0.05));
          if (sh <= 0) return;
          const hot = r === 1 && i === 1;
          g.fillStyle = hot ? FF.accC(0.35) : FF.lineC(0.14); g.fillRect(pw * cx, trackY[r], pw * cw * sh, ph * 0.09);
          g.strokeStyle = hot ? FF.accC(1) : FF.lineC(0.7); g.lineWidth = lw(hot ? 2.6 : 1.6); g.strokeRect(pw * cx, trackY[r], pw * cw * sh, ph * 0.09);
        });
      }
      // playhead
      const px = pw * 0.04 + fract(t * 0.16) * pw * 0.92;
      g.strokeStyle = FF.ink; g.lineWidth = lw(2.4); g.beginPath(); g.moveTo(px, ph * 0.54); g.lineTo(px, ph * 0.97); g.stroke();
      g.fillStyle = FF.ink; g.beginPath(); g.moveTo(px - 9 / sc * u, ph * 0.54); g.lineTo(px + 9 / sc * u, ph * 0.54); g.lineTo(px, ph * 0.54 + 14 / sc * u); g.fill();
      g.restore();
    });
    // callouts with elbow leaders
    const anchors = [lp(prev.x + prev.w * 0.86, prev.y + prev.h * 0.2), lp(pw * 0.61, trackY[1] + ph * 0.045), lp(pw * 0.18, trackY[2] + ph * 0.045)];
    top((g, FF) => {
      d.callouts.forEach((label, i) => {
        const c = stag(b, x, i, 3, 0.45);
        if (c <= 0 || !label || uiOn < 0.5) return;
        const [ax, ay] = anchors[i];
        const tx = tall ? box.x + box.w * 0.06 : box.x + box.w * 0.7, ty = tall ? box.y + box.h * (0.7 + i * 0.12) : box.y + box.h * (0.2 + i * 0.3);
        const ex_ = tall ? box.x + box.w * 0.52 : tx - 70 * u, pts = tall ? [ax, ay, ax, ty - 0 * u, tx + 3 * u, ty] : [ax, ay, ex_, ty, tx, ty];
        g.strokeStyle = FF.accC(0.95); g.lineWidth = 2.2 * u; g.setLineDash([]);
        if (tall) { pts[0] = ax; pts[1] = ay; pts[2] = ax; pts[3] = ty; pts[4] = tx + 12 * u; pts[5] = ty; }
        polylineScreen(g, pts, span(c, 0, 0.5));
        g.fillStyle = FF.accC(1); g.beginPath(); g.arc(ax, ay, 8 * u, 0, TAU); g.fill();
        g.strokeStyle = FF.accC(0.5 - 0.3 * Math.sin(t * 4 + i)); g.lineWidth = 1.6 * u; g.beginPath(); g.arc(ax, ay, (14 + 5 * Math.sin(t * 4 + i)) * u, 0, TAU); g.stroke();
        tag(g, FF, label, tall ? tx : tx, ty, { q: span(c, 0.45, 1), col: i === 1 ? 1 : 0, size: 42, maxW: tall ? box.w * 0.9 : box.w * 0.29 });
      });
    });
    flush(ctx, F);
    wrapUp(ctx, F, x);
  }

  // MANNEQUINS: low-poly figures on pedestals, gesturing, linked by travelling packets.
  const figParts = () => ({
    ped: latheMesh("ped", [[0.001, 0], [78, 0], [84, 8], [84, 18], [70, 24], [0.001, 24]], 20),
    body: latheMesh("body", [[0.001, 24], [42, 26], [34, 112], [46, 190], [74, 238], [80, 266], [56, 292], [24, 304], [22, 328]], 10),
    head: sphereMesh(48, 6, 10), arm: boxMesh(20, 120, 20, 1, 3, 1), ant: latheMesh("ant", [[0.001, 0], [4, 0], [4, 60], [11, 66], [0.001, 90]], 6),
  });
  function people(ctx, S, box, p, d, info) {
    const { F, x, b, t, u } = sceneFrame(S, info, p);
    const n = Math.max(2, Math.min(6, Math.round(d.count))), tall = S.tall, P = figParts();
    const DW = tall ? 940 : 1560, DH = tall ? 1020 : 740;
    const C = sceneCam(F, box, info, { dw: DW, dh: DH, yaw: -0.12, pitch: 0.22, sway: 0.22, ty: 190, cy: 0.5 });
    begin(F, C);
    const sp = (DW * 0.94) / n, sf = Math.min(1.25, sp / 190), hot = Math.min(n - 1, d.highlight);
    const heads = [];
    for (let i = 0; i < n; i++) {
      const cx = -((n - 1) * sp) / 2 + i * sp, g = stag(b, x, i, n, 0.6), isHot = i === hot, col = isHot ? 1 : 0;
      const bob = Math.sin(t * 2 + i * 1.3) * 7 * sf, ry = Math.sin(t * 0.8 + i * 1.3) * 0.55 + (i - (n - 1) / 2) * 0.12;
      const base = { s: sf, pos: [cx, 0, 0], ry, col };
      mesh(P.ped, { ...base, asm: span(g, 0, 0.4), bias: 300, ring: false });
      const by = bob;
      mesh(P.body, { ...base, pos: [cx, by, 0], asm: span(g, 0.15, 0.8), lit: isHot ? 0.2 + 0.2 * Math.sin(t * 3) : 0 });
      mesh(P.head, { ...base, pos: [cx, by + 372 * sf, 0], s: sf, asm: span(g, 0.55, 1), glass: 0.3, ring: false });
      // arms, one waving on the highlighted figure
      const aw = isHot ? 2.4 + Math.sin(t * 5) * 0.28 : 0.22;
      const aT = xform({ pos: [cx, by, 0], ry, s: sf });
      for (const side of [-1, 1]) {
        const w3 = [0, 0, 0];
        aT(side * 82, 236, 0, w3);
        mesh(P.arm, { s: sf, pos: [w3[0], w3[1] - 52 * sf * Math.cos(isHot && side > 0 ? aw : 0.22), w3[2]], ry, rz: side * (isHot && side > 0 ? aw : 0.22) - (isHot && side > 0 ? 0 : 0), asm: span(g, 0.5, 1), col, ring: false });
      }
      // accessories: antenna, halo or visor
      if (i % 3 === 0) mesh(P.ant, { s: sf, pos: [cx, by + 414 * sf, 0], ry: t, asm: span(g, 0.7, 1), col: 1, ring: false });
      else if (i % 3 === 1) mesh(torusMesh(62, 5, 20, 5), { s: sf, pos: [cx, by + 380 * sf, 0], rx: 0.4 * Math.sin(t * 2 + i), ry: t * 1.2, asm: span(g, 0.7, 1), col: 1, ring: false });
      else mesh(boxMesh(110, 22, 12, 4, 1, 1), { s: sf, pos: [cx, by + 380 * sf, 36 * sf], ry, asm: span(g, 0.7, 1), col: 1, ring: false });
      heads.push([cx, by + 372 * sf, 0, g]);
      if (isHot && g > 0.9) for (let k = 0; k < 2; k++) { const ph = fract(t * 0.6 + k / 2); line3(circle3(cx, 6, 0, 90 * sf + ph * 150 * sf, 40), { a: (1 - ph) * 0.9, c: 1, w: 1.4, bias: 350 }); }
    }
    // links and travelling packets
    for (let i = 0; i < n - 1; i++) {
      const a = heads[i], c = heads[i + 1], q = Math.min(a[3], c[3]) * (x ? 1 - x : 1);
      if (q < 0.9 && !x) continue;
      const pts = [];
      for (let s = 0; s <= 20; s++) { const f = s / 20; pts.push([lerp(a[0], c[0], f), lerp(a[1], c[1], f) + 70 + Math.sin(f * Math.PI) * 90, 0]); }
      line3(pts, { a: 0.7 * q, d: [9, 9], off: -t * 40, w: 1, bias: -250 });
      const f = fract(t * 0.4 + i * 0.37), idx = f * 20, k = Math.min(19, Math.floor(idx)), ff = idx - k;
      dot3(lerp(pts[k][0], pts[k + 1][0], ff), lerp(pts[k][1], pts[k + 1][1], ff), 0, { r: 8 * u, c: 1, a: q, bias: -300 });
    }
    const tmp = [0, 0, 0, 0], tmp2 = [0, 0, 0, 0];
    top((g, FF) => {
      for (let i = 0; i < n; i++) {
        const label = d.badges[i % d.badges.length], q = heads[i][3];
        if (q < 0.9 && !x) continue;
        proj(C, heads[i][0], heads[i][1] + (i % 3 === 0 ? 150 : 110) * sf, 0, tmp);
        proj(C, heads[i][0] + sp, 0, 0, tmp2);
        const gap = Math.abs(tmp2[0] - tmp[0]);
        const lift = n >= 5 && i % 2 ? 62 * u : 0;
        tag(g, FF, label, tmp[0], tmp[1] - 30 * u - lift, { align: "center", q: (x ? 1 - x : span(q, 0.9, 1)), col: i === hot ? 1 : 0, size: 42, maxW: Math.max(gap * 0.98, 200 * u) });
      }
    });
    flush(ctx, F);
    wrapUp(ctx, F, x);
  }

  // CONVEYOR: three solids on pads along a rail; a scanning ring passes through and lights each in turn.
  function process(ctx, S, box, p, d, info) {
    const { F, x, b, t, u } = sceneFrame(S, info, p);
    const n = d.steps.length, tall = S.tall;
    const DW = tall ? 940 : 1500, DH = tall ? 1100 : 560;
    const C = sceneCam(F, box, info, { dw: DW, dh: DH, yaw: tall ? -0.5 : -0.2, pitch: tall ? 0.18 : 0.3, sway: 0.12, ty: tall ? 0 : 150, cx: tall ? 0.38 : 0.5, cy: 0.5 });
    begin(F, C);
    const span_ = tall ? (DH * 0.78) : (DW * 0.9), gapLen = span_ / n;
    const pos = (i) => (tall ? [0, ((n - 1) / 2 - i) * gapLen + 20, 0] : [(i - (n - 1) / 2) * gapLen, 0, 0]);
    const along = (s, h = 0) => (tall ? [0, ((n - 1) / 2) * gapLen - s * (n - 1) * gapLen + 20 + h, 0] : [(-(n - 1) / 2 + s * (n - 1)) * gapLen + h, 0, 0]);
    const sz = Math.min(gapLen * 0.4, tall ? 150 : 175);
    // rail with sliding crossbars and chevrons
    const ra = clamp(span(b, 0, 0.4)) * (x ? 1 - x : 1);
    const L0 = -(n - 1) / 2 * gapLen - gapLen * 0.45, L1 = (n - 1) / 2 * gapLen + gapLen * 0.45;
    const railPt = (s, side) => (tall ? [side * 30, -s + 20, 0] : [s, side * 30 - 0, 0]);
    if (ra > 0) {
      if (tall) { line3([[-30, L1 + 20, 0], [-30, -L1 + 20, 0]], { a: 0.8 * ra }); line3([[30, L1 + 20, 0], [30, -L1 + 20, 0]], { a: 0.8 * ra }); }
      else { line3([[L0, 0, -34], [L1, 0, -34]], { a: 0.8 * ra, bias: 500 }); line3([[L0, 0, 34], [L1, 0, 34]], { a: 0.8 * ra, bias: 500 }); }
      const stepL = 46, off = (t * 70) % stepL;
      for (let s = L0 + off; s < L1; s += stepL) {
        const e = Math.min(1, (s - L0) / 120, (L1 - s) / 120);
        line3(tall ? [[-30, -s + 20, 0], [30, -s + 20, 0]] : [[s, 0, -34], [s, 0, 34]], { a: 0.4 * ra * e, w: 0.8, bias: 500 });
      }
      // chevrons marching between the pads
      for (let i = 0; i < n - 1; i++) {
        const c0 = pos(i), c1 = pos(i + 1);
        for (let k = 0; k < 3; k++) {
          const f = fract(t * 0.45 + k / 3), px = lerp(c0[0], c1[0], 0.22 + f * 0.56), py = lerp(c0[1], c1[1], 0.22 + f * 0.56), a = Math.sin(f * Math.PI) * ra;
          if (tall) line3([[px - 26, py + 20, 0], [px, py - 8, 0], [px + 26, py + 20, 0]], { a, c: 1, w: 1.5, bias: 100 });
          else line3([[px - 18, 0, -26], [px + 12, 0, 0], [px - 18, 0, 26]], { a, c: 1, w: 1.5, bias: 100 });
        }
      }
    }
    // the scanning ring
    const s = fract(t * 0.2 + 0.15), sCur = n > 1 ? s : 0.5;
    if (ra > 0.5 && !x) {
      for (let k = 0; k < 4; k++) {
        const pp = along(clamp(sCur - k * 0.012)), r = sz * 1.45;
        line3(tall ? circle3(pp[0], pp[1], 0, r, 40, "xz") : circle3(pp[0], pp[1] + 20, 0, r, 40, "yz"), { a: [1, 0.5, 0.25, 0.1][k], c: 1, w: 1.8 - k * 0.3, bias: -500 + k });
      }
    }
    const tmp = [0, 0, 0, 0];
    const lbl = [];
    for (let i = 0; i < n; i++) {
      const g = stag(b, x, i, n, 0.7), pc = pos(i), last = i === n - 1;
      const dist = Math.abs(sCur - i / Math.max(1, n - 1)), flash = Math.max(0, 1 - dist * (n - 1) / 0.55) * (x ? 0 : 1);
      const lit = (last ? 0.5 : 0) + flash * 1.6;
      mesh(latheMesh("pad", [[0.001, 0], [60, 0], [120, 0], [150, 0], [152, -10], [0.001, -10]], 20), { pos: [pc[0], pc[1] - (tall ? 4 : 0), pc[2]], s: sz / 130, asm: span(g, 0, 0.4), bias: 300, ring: false, col: last ? 1 : 0 });
      const fl = Math.sin(t * 1.6 + i) * 10, hy = sz * 0.9 + 40 + fl;
      const o = { pos: [pc[0], pc[1] + hy, pc[2]], ry: t * (0.5 + 0.18 * i) + i, rx: i % 3 === 1 ? t * 0.3 : 0.1, asm: span(g, 0.25, 1), lit, col: last ? 1 : 0, glass: last ? 0.5 : 0.1, w: 1 + flash * 0.4 };
      if (i % 3 === 0) mesh(boxMesh(sz * 1.15, sz * 1.15, sz * 1.15, 3, 3, 3), o);
      else if (i % 3 === 1) mesh(icoMesh(sz * 0.8), o);
      else mesh(crystalMesh(), { ...o, s: sz / 78 });
      if (g > 0.05) mesh(torusMesh(sz * 0.95, 3, 28, 4), { pos: [pc[0], pc[1] + hy, pc[2]], rx: Math.PI / 2 + 0.3, ry: -t * (0.8 + 0.2 * i), asm: span(g, 0.5, 1), ring: false, col: last ? 1 : 0, a: 0.8 });
      lbl.push({ i, pc, g, hy, last });
    }
    top((g, FF) => {
      lbl.forEach(({ i, pc, g: q, hy, last }) => {
        if (q < 0.2) return;
        const q2 = x ? 1 - x : clamp((q - 0.5) * 2.6);
        if (tall) {
          proj(C, pc[0], pc[1] + hy * 0.4, pc[2], tmp);
          figure(g, FF, String(i + 1).padStart(2, "0"), tmp[0] - 116 * u * 1.3, tmp[1] + 25 * u, 72 * u, { col: 1, align: "right" });
          tag(g, FF, d.steps[i], tmp[0] + 128 * u, tmp[1], { align: "left", q: q2, col: last ? 1 : 0, size: 42, maxW: box.x + box.w - (tmp[0] + 128 * u) });
        } else {
          proj(C, pc[0], pc[1] + hy + sz * 1.2, pc[2], tmp);
          const gapPx = (C.f / C.dist) * gapLen * 0.98;
          figure(g, FF, String(i + 1).padStart(2, "0"), tmp[0], tmp[1], 72 * u, { col: 1 });
          proj(C, pc[0], pc[1], pc[2] + 130, tmp);
          tag(g, FF, d.steps[i], tmp[0], tmp[1] + 64 * u, { align: "center", q: q2, col: last ? 1 : 0, size: 42, maxW: gapPx });
        }
      });
    });
    flush(ctx, F);
    wrapUp(ctx, F, x);
  }

  // DIALS: two coins with a gauge arc, a needle and a travelling highlight; a delta between them.
  function compare(ctx, S, box, p, d, info) {
    const { F, x, b, t, u } = sceneFrame(S, info, p);
    const tall = S.tall, max = Math.max(d.leftValue, d.rightValue, 1);
    const DW = tall ? 760 : 1560, DH = tall ? 1260 : 600;
    const C = sceneCam(F, box, info, { dw: DW, dh: DH, yaw: 0, pitch: 0.12, sway: 0.1, ty: 0, cy: 0.5 });
    begin(F, C);
    const R_ = 215, sep = tall ? 410 : 470;
    const coins = [[d.left, d.leftValue, 0], [d.right, d.rightValue, 1]];
    const info2 = [];
    coins.forEach(([label, value, i]) => {
      const g = stag(b, x, i, 2, 0.4), pc = tall ? [0, (i ? -1 : 1) * sep, 0] : [(i ? 1 : -1) * sep, 0, 0];
      const ry = Math.sin(t * 0.6 + i * 1.4) * 0.38 + (i ? -0.12 : 0.12), col = i;
      const hov = Math.sin(t * 1.5 + i) * 8;
      const pos = [pc[0], pc[1] + hov, pc[2]];
      mesh(latheMesh("coin", [[0.001, 17], [70, 17], [140, 17], [190, 17], [R_, 17], [R_ + 4, 9], [R_ + 4, -9], [R_, -17], [0.001, -17]], 40), { pos, rx: Math.PI / 2, ry, asm: span(g, 0, 0.8), col, a: 1, lit: i ? 0.25 : 0, w: 1, dis: 260 });
      const T = xform({ pos, ry });
      const w3 = [0, 0, 0];
      const q = clamp(span(g, 0.55, 1)), fr = (value / max) * 0.92;
      const a0 = -225 * Math.PI / 180, a1 = 45 * Math.PI / 180, sweep = (a1 - a0);
      // ticks
      for (let k = 0; k <= 54; k++) {
        const a = a0 + (k / 54) * sweep, major = k % 6 === 0, r0 = major ? 150 : 160, r1 = 176, wp = fract(t * 0.5 - i * 0.2), near = Math.max(0, 1 - Math.abs(((k / 54) - wp + 0.5) % 1 - 0.5) * 9);
        const A = [0, 0, 0], B = [0, 0, 0];
        T(Math.cos(a) * r0, Math.sin(a) * r0, 19, A); T(Math.cos(a) * r1, Math.sin(a) * r1, 19, B);
        line3([A, B], { a: (major ? 0.8 : 0.45) * clamp(q * 3 - k / 54 * 1.6) + near * 0.6, c: near > 0.4 ? 1 : col, w: major ? 1.1 : 0.7, bias: -300, hot: near > 0.6 ? 1 : 0 });
      }
      // value arc, grows with the reveal and then hovers
      const arc = [], ae = a0 + sweep * fr * ease(q) * (1 + 0.012 * Math.sin(t * 3));
      for (let s = 0; s <= 40; s++) { const a = lerp(a0, ae, s / 40); T(Math.cos(a) * 190, Math.sin(a) * 190, 19, w3); arc.push([w3[0], w3[1], w3[2]]); }
      line3(arc, { a: 1, c: 1, w: 3, bias: -400 });
      const needle = [0, 0, 0]; T(Math.cos(ae) * 168, Math.sin(ae) * 168, 22, needle);
      const hub = [0, 0, 0]; T(0, 0, 22, hub);
      if (q > 0.1) { line3([hub, needle], { a: 0.9, c: 1, w: 1.8, bias: -420 }); dot3(needle[0], needle[1], needle[2], { r: 8 * u, c: 1, bias: -450 }); }
      // pulse rings leaving the hot coin
      if (i && g > 0.9) for (let k = 0; k < 2; k++) { const ph = fract(t * 0.5 + k / 2); line3(circle3(pos[0], pos[1], -20, R_ + ph * 120, 56, "xy"), { a: (1 - ph) * 0.7, c: 1, w: 1.3, bias: 400 }); }
      info2.push({ pos, g, value, label, i });
    });
    // a connector with chevrons running from the first coin toward the second
    const cq = clamp(span(b, 0.5, 0.9)) * (x ? 1 - x : 1);
    if (cq > 0) {
      const A0 = tall ? [0, sep - R_ - 30, 0] : [-sep + R_ + 30, 0, 0], A1 = tall ? [0, -sep + R_ + 30, 0] : [sep - R_ - 30, 0, 0];
      line3([A0, A1], { a: 0.5 * cq, d: [10, 10], off: -t * 40, w: 1.2 });
      for (let k = 0; k < 4; k++) {
        const f = fract(t * 0.4 + k / 4), cx = lerp(A0[0], A1[0], f), cy = lerp(A0[1], A1[1], f), s = tall ? -1 : 1;
        line3(tall ? [[cx - 22, cy + 26, 0], [cx, cy, 0], [cx + 22, cy + 26, 0]] : [[cx - 26, cy + 22, 0], [cx, cy, 0], [cx - 26, cy - 22, 0]], { a: Math.sin(f * Math.PI) * cq, c: 1, w: 1.6 });
      }
    }
    const tmp = [0, 0, 0, 0], tmp2 = [0, 0, 0, 0];
    top((g, FF) => {
      info2.forEach(({ pos, g: q, value, label, i }) => {
        if (q < 0.5) return;
        proj(C, pos[0], pos[1], pos[2], tmp);
        proj(C, pos[0], pos[1] + 0, pos[2] + 0, tmp2);
        const rpx = R_ * tmp[3];
        const qq = clamp((q - 0.55) * 2.2) * (x ? 1 - x : 1);
        figure(g, FF, nf(value * clamp(span(q, 0.55, 1)), 0, d.prefix, d.suffix), tmp[0], tmp[1] + 44 * u, 120 * u * Math.min(1.2, rpx / 190), { col: i, maxW: rpx * 1.15, base: "alphabetic" });
        tag(g, FF, label, tmp[0], tmp[1] - rpx - 56 * u * 1.0, { align: "center", q: qq, col: i, size: 42, maxW: Math.max(rpx * 2, 260 * u) });
      });
      if (d.leftValue > 0 && cq > 0.5) {
        const pct = Math.round(((d.rightValue - d.leftValue) / d.leftValue) * 100), cx = C.sx0, cy = C.sy0;
        const txt = (pct < 0 ? "−" : "+") + Math.abs(pct) + "%";
        const reveal = clamp((cq - 0.5) * 2);
        figure(g, FF, txt, cx, cy - (tall ? 70 : 62) * u, 84 * u, { col: 1, maxW: tall ? box.w * 0.5 : box.w * 0.2 });
      }
    });
    flush(ctx, F);
    wrapUp(ctx, F, x);
  }

  // ---- tokens -----------------------------------------------------------------------------------------
  const TONE = {
    line: "125,249,255", face: "3,12,24", glow: 1, sky0: "#01050d", sky1: "#04172a", hor: "#0c4a66", gnd0: "#03101e", gnd1: "#010710",
    tintMin: 0.03, tintRange: 0.12, vig: "0,0,0", vigA: 0.62, hotRGB: [255],
  };
  const css = (accent, look) => {
    const T = look.tone;
    return `.display { text-shadow: 0 0 2px rgba(${T.face},1), 0 0 20px rgba(${T.face},0.95), 0 0 40px rgba(${T.line},0.22) !important; }
      .scene .display { align-self: flex-start; padding: 0.1em 0.36em 0.14em 0.42em; border-left: 7px solid ${accent}; background: linear-gradient(90deg, rgba(${T.face},0.9) 0%, rgba(${T.face},0.78) 60%, rgba(${T.face},0.2) 100%); }
      #title.display, #closing.display { width: fit-content !important; max-width: 100%; }
      .kicker { align-self: flex-start; padding: 0.38em 0.9em; border: 1px solid rgba(${T.line},0.75); background: rgba(${T.face},0.92); color: ${look.ink}; text-shadow: none !important; }
      .kicker::before { content: ""; display: inline-block; width: 0.55em; height: 0.55em; margin: 0 0.7em 0.06em 0; background: ${accent}; box-shadow: 0 0 0.8em ${accent}; }`;
  };
  const halo = (face, line) => () => `0 0 2px rgba(${face},1), 0 0 20px rgba(${face},0.95), 0 0 40px rgba(${line},0.2)`;

  return {
    bg: "#030b17", panel: "rgba(10,40,60,0.55)", ink: "#d2fbff", muted: "#72bcc9", accent: "#ffb347", onAccent: "#04121e",
    rule: "rgba(125,249,255,0.65)", track: "rgba(125,249,255,0.14)",
    display: MONO, displayWeight: 700, displayCase: "uppercase", displayTracking: "0.02em", body: MONO, bodyWeight: 600, figures: MONO,
    radius: 0, motion: "type", change: "scan", kit: { line: 1.7, fill: "none", panel: "outline", dims: true },
    panelEdge: "rgba(125,249,255,0.7)",
    tone: TONE, keepArt: true, overlap: true,
    palettes: {
      light: { bg: "#e7f1f1", panel: "rgba(7,72,90,0.06)", ink: "#06475a", muted: "#4b8190", accent: "#e0502a", onAccent: "#ffffff", rule: "rgba(7,72,90,0.7)", track: "rgba(7,72,90,0.1)", panelEdge: "rgba(7,72,90,0.6)",
        backdrop: () => "#e7f1f1", textShadow: halo("231,241,241", "7,72,90"),
        tone: { ...TONE, line: "6,86,108", face: "231,241,241", glow: 0, sky0: "#d3e6e8", sky1: "#e4f0f0", hor: "#f4fafa", gnd0: "#e9f3f3", gnd1: "#d7e8e9", tintMin: 0.02, tintRange: 0.09, vig: "20,60,70", vigA: 0.22, hotRGB: [10] } },
      dark: { bg: "#01050c", backdrop: () => "#01050c", textShadow: halo("1,5,12", "125,249,255"),
        tone: { ...TONE, face: "1,6,14", sky0: "#00030a", sky1: "#02101e", hor: "#073a52", gnd0: "#020a14", gnd1: "#00040a", glow: 1.2, vigA: 0.75 } },
      mono: { bg: "#0b0b0c", panel: "rgba(255,255,255,0.06)", ink: "#f0f0ee", muted: "#9a9a96", accent: "#ffffff", onAccent: "#0b0b0c", rule: "rgba(240,240,238,0.6)", track: "rgba(240,240,238,0.12)", panelEdge: "rgba(240,240,238,0.65)",
        backdrop: () => "#0b0b0c", textShadow: halo("11,11,12", "240,240,238"),
        tone: { ...TONE, line: "226,226,222", face: "10,10,11", glow: 0.7, sky0: "#050506", sky1: "#101011", hor: "#3a3a3a", gnd0: "#0b0b0c", gnd1: "#040404" } },
    },
    css,
    textShadow: halo("3,12,24", "125,249,255"),
    backdrop: () => "#030b17",
    paint: (ctx, W, H) => { ctx.clearRect(0, 0, W, H); },
    stage,
    scenes: { chart, object, people, process, compare },
  };
});
