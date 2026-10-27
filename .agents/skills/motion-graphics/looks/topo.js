// Topo: a printed topographic survey sheet. A live heightfield is contoured every frame (marching
// squares, index lines every fifth level, coast and lake lines), tinted by elevation and hill-shaded
// from the north-west. Scenes are survey plates on the sheet: an elevation profile, a mesa of terraces,
// surveyors on mounds, a dashed trail with waypoints, two relief insets. Transitions send a range ring
// across the sheet that bends the contours and morphs the landform. The printed collar (graticule,
// coordinates, scale bar, north arrow, reticle readout) frames everything. Frames are pure functions of time.
window.DreamcutMotion.register("topo", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const inout = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif";
  const SANS = "'Avenir Next', 'Helvetica Neue', Helvetica, Arial, sans-serif";
  const fmt = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  // ---- tones ---------------------------------------------------------------------------------------
  const TONES = {
    original: {
      paper: "#efe4c8", collar: "#e6d8b6", plate: "#f6eed7", line: "128,84,44", idx: "98,58,26", water: "52,118,140", ink: "58,38,24",
      ramp: [[0, [200, 218, 196]], [0.3, [226, 224, 188]], [0.55, [236, 222, 176]], [0.8, [228, 196, 150]], [1, [214, 168, 128]]],
      lakeLo: [118, 164, 178], lakeHi: [186, 214, 214], shadeK: 3.3, shadeStr: 1.05, wash: "255,252,238", wood: [168, 196, 140], woodA: 0.5,
    },
    light: {
      paper: "#f8f5ec", collar: "#f0ece0", plate: "#fffdf6", line: "88,122,132", idx: "40,84,100", water: "40,120,170", ink: "28,52,64",
      ramp: [[0, [226, 238, 230]], [0.4, [240, 240, 224]], [0.7, [244, 236, 216]], [1, [236, 220, 200]]],
      lakeLo: [150, 196, 222], lakeHi: [208, 230, 240], shadeK: 2.6, shadeStr: 0.8, wash: "255,255,250", wood: [196, 222, 186], woodA: 0.45,
    },
    dark: {
      paper: "#10201d", collar: "#0b1816", plate: "#16302b", line: "112,196,160", idx: "170,236,200", water: "92,176,220", ink: "216,238,224",
      ramp: [[0, [14, 40, 38]], [0.35, [20, 62, 52]], [0.65, [30, 90, 70]], [1, [58, 130, 96]]],
      lakeLo: [8, 28, 46], lakeHi: [16, 56, 78], shadeK: 3.4, shadeStr: 1.0, wash: "20,44,40", wood: [26, 74, 44], woodA: 0.55,
    },
    mono: {
      paper: "#ebe9e3", collar: "#e1ded6", plate: "#f4f2ed", line: "110,108,102", idx: "46,45,42", water: "80,80,78", ink: "40,40,38",
      ramp: [[0, [214, 212, 206]], [0.5, [228, 226, 220]], [1, [206, 203, 196]]],
      lakeLo: [170, 170, 168], lakeHi: [206, 206, 204], shadeK: 3.2, shadeStr: 1.0, wash: "250,249,245", wood: [196, 196, 190], woodA: 0.4,
    },
  };
  const halo = (paper, ink) => () => `0 0 1px ${paper}, 0 0 8px ${paper}, 0 0 18px ${paper}, 0 0 34px ${paper}, 0 1px 1px ${ink}`;

  // ---- the landform --------------------------------------------------------------------------------
  // Bumps: [x, y, sigma, amplitude], x and y as fractions of the frame, sigma as a fraction of sqrt(W*H).
  const LAYOUTS = [
    [[0.16, 0.32, 0.17, 0.46], [0.64, 0.2, 0.12, 0.32], [0.86, 0.64, 0.17, 0.5], [0.42, 0.82, 0.14, 0.34], [0.06, 0.84, 0.12, -0.22], [0.52, 0.5, 0.1, -0.18], [0.96, 0.12, 0.1, 0.22]],
    [[0.8, 0.3, 0.16, 0.5], [0.3, 0.2, 0.13, 0.3], [0.12, 0.72, 0.18, 0.44], [0.58, 0.78, 0.13, 0.32], [0.46, 0.46, 0.11, -0.2], [0.94, 0.9, 0.12, -0.2], [0.04, 0.1, 0.1, 0.22]],
    [[0.5, 0.28, 0.2, 0.52], [0.14, 0.58, 0.13, 0.34], [0.88, 0.82, 0.14, 0.4], [0.7, 0.58, 0.1, -0.2], [0.3, 0.9, 0.13, 0.3], [0.94, 0.2, 0.12, 0.3], [0.2, 0.2, 0.09, -0.16]],
    [[0.24, 0.7, 0.18, 0.5], [0.76, 0.22, 0.17, 0.46], [0.5, 0.5, 0.1, -0.22], [0.9, 0.78, 0.12, 0.3], [0.08, 0.16, 0.12, 0.32], [0.62, 0.9, 0.11, 0.26], [0.36, 0.1, 0.1, -0.14]],
    [[0.7, 0.7, 0.19, 0.5], [0.22, 0.26, 0.15, 0.42], [0.46, 0.12, 0.1, 0.26], [0.1, 0.86, 0.13, 0.3], [0.5, 0.64, 0.1, -0.2], [0.92, 0.18, 0.12, 0.34], [0.34, 0.52, 0.09, -0.12]],
  ];
  const WAVES = [[1.3, 0.7, 0.3, 0.2, 0.05], [-0.8, 1.9, -0.22, 1.7, 0.04], [2.7, -1.1, 0.18, 3.1, 0.025], [0.5, 3.3, -0.35, 0.9, 0.02]];
  const DZ = 0.03, SEA = 5 * DZ;
  const ANCHORS = (() => { const r = rng(11), a = []; for (let i = 0; i < 18; i++) a.push([0.1 + r() * 0.8, 0.12 + r() * 0.78]); return a; })();

  function makeField(F) {
    const { W, H, t } = F, sg = Math.sqrt(W * H), info = F.info;
    const idx = Math.max(0, info.index || 0);
    const cur = LAYOUTS[idx % LAYOUTS.length], prev = LAYOUTS[(idx + LAYOUTS.length - 1) % LAYOUTS.length];
    const k = idx > 0 ? ease(span(info.local, 0, 1.5)) : 1;
    const bumps = [];
    const add = (L, wgt) => { if (wgt <= 0.001) return; L.forEach((b, i) => bumps.push([(b[0] + 0.012 * Math.sin(t * 0.35 + i * 1.7)) * W, (b[1] + 0.012 * Math.cos(t * 0.29 + i * 2.3)) * H, b[2] * sg, b[3] * 1.25 * wgt * (1 + 0.08 * Math.sin(t * 0.5 + i)), wgt])); };
    add(prev, 1 - k); add(cur, k);
    const nb = bumps.length;
    const rip = F.rip;
    const hAt = (x, y) => {
      const xn = x / W, yn = y / H;
      let h = 0.3;
      for (let i = 0; i < 4; i++) {
        const w = WAVES[i];
        h += w[4] * Math.sin(TAU * (w[0] * xn + w[1] * yn) + w[2] * t * 3 + w[3] + 0.8 * Math.sin(TAU * (w[1] * xn - w[0] * yn) + 0.6 * t));
      }
      for (let i = 0; i < nb; i++) {
        const b = bumps[i], dx = x - b[0], dy = y - b[1];
        h += b[3] * Math.exp(-(dx * dx + dy * dy) / (2 * b[2] * b[2]));
      }
      if (rip) {
        const d = Math.hypot(x - rip.x, y - rip.y), e = (d - rip.R) / rip.wd;
        h += rip.amp * Math.sin(e * 2.4) * Math.exp(-e * e);
      }
      return h;
    };
    hAt.bumps = bumps;
    return hAt;
  }

  // The sampled grid, its image and the colour ramps are kept between frames.
  let G = null;
  const lutCache = {};
  function lutOf(T, key) {
    const id = key + T.paper;
    if (lutCache[id]) return lutCache[id];
    const out = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      const q = i / 255;
      let c;
      if (key === "ramp") {
        const R = T.ramp; let a = R[0], b = R[R.length - 1];
        for (let j = 0; j < R.length - 1; j++) if (q >= R[j][0] && q <= R[j + 1][0]) { a = R[j]; b = R[j + 1]; break; }
        const f = clamp((q - a[0]) / Math.max(1e-6, b[0] - a[0]));
        c = [lerp(a[1][0], b[1][0], f), lerp(a[1][1], b[1][1], f), lerp(a[1][2], b[1][2], f)];
      } else c = [lerp(T.lakeLo[0], T.lakeHi[0], q), lerp(T.lakeLo[1], T.lakeHi[1], q), lerp(T.lakeLo[2], T.lakeHi[2], q)];
      out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2];
    }
    return (lutCache[id] = out);
  }
  function gridOf(F) {
    const cell = Math.max(8, 13 * F.u);
    const gw = Math.ceil(F.W / cell) + 2, gh = Math.ceil(F.H / cell) + 2;
    if (!G || G.gw !== gw || G.gh !== gh || G.cell !== cell) {
      const cv = document.createElement("canvas"); cv.width = gw; cv.height = gh;
      const gx = cv.getContext("2d");
      G = { gw, gh, cell, v: new Float32Array(gw * gh), cv, gx, img: gx.createImageData(gw, gh) };
    }
    return G;
  }
  function sample(G, hAt) {
    const { gw, gh, cell, v } = G;
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) v[j * gw + i] = hAt(i * cell, j * cell);
  }
  // Woodland: a slow, low-frequency mask over the middle slopes, printed as a green tint.
  const woodAt = (xn, yn) => 0.5 * Math.sin(xn * 9.1 + 1.2 + Math.sin(yn * 5.3)) + 0.35 * Math.sin(yn * 11.7 - xn * 3.1 + 0.7) + 0.25 * Math.sin((xn + yn) * 17.3 + 2.2);
  function tint(G, T, texture) {
    const { gw, gh, v } = G, d = G.img.data, ramp = lutOf(T, "ramp"), lake = lutOf(T, "lake");
    const strength = T.shadeStr * (0.6 + 0.4 * texture);
    const wood = T.wood || [150, 186, 132], woodA = (T.woodA ?? 0.42) * (0.6 + 0.4 * texture);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const o = j * gw + i, h = v[o];
      const gx = v[j * gw + Math.min(i + 1, gw - 1)] - v[j * gw + Math.max(i - 1, 0)];
      const gy = v[Math.min(j + 1, gh - 1) * gw + i] - v[Math.max(j - 1, 0) * gw + i];
      // Hillshade lit from the north-west: slopes facing the light brighten, the far sides darken.
      const sh = clamp((gx + gy) * 2.1 * T.shadeK * strength, -0.34, 0.26);
      let m, r, gg, b;
      if (h < SEA) { const c = clamp(h / SEA) * 255 | 0, q = c * 3; m = 1 + sh * 0.5; r = lake[q]; gg = lake[q + 1]; b = lake[q + 2]; }
      else {
        const c = clamp((h - SEA) / (1.05 - SEA)) * 255 | 0, q = c * 3; m = 1 + sh; r = ramp[q]; gg = ramp[q + 1]; b = ramp[q + 2];
        const band = clamp((h - SEA - 0.02) / 0.06) * clamp((0.62 - h) / 0.12);
        const w = clamp((woodAt(i / gw, j / gh) - 0.12) / 0.22) * band * woodA;
        if (w > 0) { r = lerp(r, wood[0], w); gg = lerp(gg, wood[1], w); b = lerp(b, wood[2], w); }
      }
      d[o * 4] = r * m; d[o * 4 + 1] = gg * m; d[o * 4 + 2] = b * (m + (1 - m) * 0.1);
      d[o * 4 + 3] = 255;
    }
    G.gx.putImageData(G.img, 0, 0);
  }
  // Fine paper grain under the linework (full resolution, cached per size).
  let GRAIN = null;
  function grain(ctx, W, H, texture) {
    if (texture <= 0) return;
    if (!GRAIN) {
      const r = rng(23), c = document.createElement("canvas"); c.width = c.height = 256;
      const g = c.getContext("2d"), im = g.createImageData(256, 256);
      for (let i = 0; i < 256 * 256; i++) { const n = r(); const dark = n < 0.5; im.data[i * 4] = dark ? 60 : 255; im.data[i * 4 + 1] = dark ? 40 : 250; im.data[i * 4 + 2] = dark ? 20 : 236; im.data[i * 4 + 3] = (Math.abs(n - 0.5) * 2) ** 3 * 70; }
      g.putImageData(im, 0, 0); GRAIN = c;
    }
    ctx.save(); ctx.globalAlpha = 0.85 * texture; ctx.fillStyle = ctx.createPattern(GRAIN, "repeat"); ctx.fillRect(0, 0, W, H); ctx.restore();
  }

  // Marching squares over the grid: one path per class of line.
  function seg(P, l, x0, y0, x1, y1, a, b, c, d) {
    const code = (a > l ? 8 : 0) | (b > l ? 4 : 0) | (c > l ? 2 : 0) | (d > l ? 1 : 0);
    if (code === 0 || code === 15) return;
    const T = () => [x0 + ((l - a) / (b - a)) * (x1 - x0), y0];
    const R = () => [x1, y0 + ((l - b) / (c - b)) * (y1 - y0)];
    const B = () => [x0 + ((l - d) / (c - d)) * (x1 - x0), y1];
    const L = () => [x0, y0 + ((l - a) / (d - a)) * (y1 - y0)];
    const line = (p, q) => { P.moveTo(p[0], p[1]); P.lineTo(q[0], q[1]); };
    switch (code) {
      case 1: case 14: line(L(), B()); break;
      case 2: case 13: line(B(), R()); break;
      case 3: case 12: line(L(), R()); break;
      case 4: case 11: line(T(), R()); break;
      case 6: case 9: line(T(), B()); break;
      case 7: case 8: line(L(), T()); break;
      case 5: if ((a + b + c + d) / 4 > l) { line(L(), T()); line(B(), R()); } else { line(T(), R()); line(L(), B()); } break;
      case 10: if ((a + b + c + d) / 4 > l) { line(T(), R()); line(L(), B()); } else { line(L(), T()); line(B(), R()); } break;
    }
  }
  function contours(g, G, F, alpha) {
    const { gw, gh, cell, v } = G, { u, T } = F;
    const N = new Path2D(), I = new Path2D(), C = new Path2D(), Wt = new Path2D();
    for (let j = 0; j < gh - 1; j++) for (let i = 0; i < gw - 1; i++) {
      const a = v[j * gw + i], b = v[j * gw + i + 1], c = v[(j + 1) * gw + i + 1], d = v[(j + 1) * gw + i];
      const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d);
      const k0 = Math.max(1, Math.ceil(lo / DZ)), k1 = Math.floor(hi / DZ);
      for (let k = k0; k <= k1; k++) {
        const P = k === 5 ? C : k < 5 ? Wt : k % 5 === 0 ? I : N;
        seg(P, k * DZ, i * cell, j * cell, (i + 1) * cell, (j + 1) * cell, a, b, c, d);
      }
    }
    g.save(); g.lineCap = "round"; g.lineJoin = "round"; g.globalAlpha = alpha;
    g.strokeStyle = `rgba(${T.water},0.42)`; g.lineWidth = 1.2 * u; g.stroke(Wt);
    g.strokeStyle = `rgba(${T.line},0.62)`; g.lineWidth = 1.5 * u; g.stroke(N);
    g.strokeStyle = `rgba(${T.idx},0.92)`; g.lineWidth = 3.3 * u; g.stroke(I);
    g.strokeStyle = `rgba(${T.water},0.95)`; g.lineWidth = 3.4 * u; g.stroke(C);
    g.restore();
  }

  // ---- lettering -----------------------------------------------------------------------------------
  function say(g, C, s, x, y, size, o = {}) {
    s = String(s ?? "");
    const q = o.q ?? 1;
    if (!s || q <= 0) return 0;
    const fam = o.font === "serif" ? SERIF : SANS;
    g.save();
    g.font = `${o.weight || 700} ${size}px ${fam}`;
    if (o.track) g.letterSpacing = o.track * size + "px";
    let w = g.measureText(s).width;
    if (o.maxW && w > o.maxW) {
      size = Math.max(o.min || size * 0.7, (size * o.maxW) / w);
      g.font = `${o.weight || 700} ${size}px ${fam}`;
      w = g.measureText(s).width;
    }
    const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    const shown = q >= 1 ? s : s.slice(0, Math.ceil(s.length * q));
    g.textAlign = "left"; g.textBaseline = o.base || "alphabetic";
    if (o.halo !== false) { g.lineJoin = "round"; g.strokeStyle = hexA(C.T.paper, o.haloA ?? 0.94); g.lineWidth = size * 0.3; g.strokeText(shown, x0, y); }
    g.fillStyle = o.color || C.inkHex;
    g.fillText(shown, x0, y);
    g.restore();
    return w;
  }
  const cOf = (S) => {
    const T = S.look.tone, u = S.u;
    return { T, u, S, inkHex: S.look.ink, muted: S.look.muted,
      acc: (a) => hexA(S.accent, a), line: (a) => `rgba(${T.line},${a})`, idx: (a) => `rgba(${T.idx},${a})`, ink: (a) => `rgba(${T.ink},${a})`,
      water: (a) => `rgba(${T.water},${a})`, paper: (a) => hexA(T.paper, a), plate: (a) => hexA(T.plate, a) };
  };
  function rr(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function tri(g, x, y, s, fill) { g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s * 0.92, y + s * 0.62); g.lineTo(x - s * 0.92, y + s * 0.62); g.closePath(); g.fillStyle = fill; g.fill(); }
  function flag(g, C, x, y, h, t, seed, color) {
    const u = C.u, w = h * 0.55, fh = h * 0.32;
    g.save();
    g.strokeStyle = C.ink(0.9); g.lineWidth = 3 * u; g.lineCap = "round";
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - h); g.stroke();
    const wave = (k) => Math.sin(k * 5 - t * 6 + seed) * k * 9 * u;
    g.beginPath();
    for (let s = 0; s <= 8; s++) { const k = s / 8; g.lineTo(x + k * w, y - h + wave(k)); }
    for (let s = 8; s >= 0; s--) { const k = s / 8; g.lineTo(x + k * w, y - h + fh * (1 - k) + wave(k)); }
    g.closePath(); g.fillStyle = color; g.fill(); g.lineWidth = 1.6 * u; g.strokeStyle = C.ink(0.8); g.stroke();
    g.restore();
  }
  // A stage-held frame, so the scene drawers know what the stage knew.
  let ST = { next: null, index: 0, hAt: null };
  const leaveOf = (info) => (info.exit != null ? 1 : ST.next ? span(info.local, info.hold - info.change * 0.85, info.hold) : 0);

  // ---- the stage: terrain, labels, collar ----------------------------------------------------------
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
  // Cartographers break the linework behind lettering: a soft cleared band under each headline line.
  function clearing(g, F) {
    const { info, u, C } = F;
    if (!info.scene || !HEADS[info.scene]) return;
    const a = span(info.local, 0, 0.4) * (1 - (info.next ? span(info.local, info.hold - info.change * 0.8, info.hold) : 0));
    if (a <= 0) return;
    g.save();
    g.shadowColor = C.paper(0.9 * a); g.shadowBlur = 34 * u; g.shadowOffsetX = 10000;
    g.fillStyle = C.paper(0.82 * a);
    for (const id of HEADS[info.scene]) for (const L of headLines(id)) { rr(g, L.x - 24 * u - 10000, L.y + L.h * 0.04, L.w + 48 * u, L.h * 0.92, 14 * u); g.fill(); }
    g.restore();
  }

  function contourLabels(g, F, hAt) {
    const { u, C, W, H } = F;
    const spots = hAt.bumps.filter((b) => !(b[3] < 0.18 || b[0] < 90 * u || b[0] > W - 200 * u || b[1] < 90 * u || b[1] > H - 100 * u));
    // Contour figures give way to spot heights (their triangle and figure) so the two never collide.
    const nearSpot = (x, y) => spots.some((b) => x > b[0] - 60 * u && x < b[0] + 150 * u && y > b[1] - 50 * u && y < b[1] + 44 * u);
    g.save();
    for (const [fx, fy] of ANCHORS) {
      let x = fx * W, y = fy * H;
      const h0 = hAt(x, y), L0 = Math.round(h0 / (5 * DZ)) * 5 * DZ;
      if (L0 < 6 * DZ) continue;
      const a = 1 - Math.pow(clamp(Math.abs(h0 - L0) / (2.5 * DZ)), 2);
      if (a < 0.05) continue;
      let gx = 0, gy = 0, ok = true;
      for (let it = 0; it < 4; it++) {
        const e = 4 * u, h = hAt(x, y);
        gx = (hAt(x + e, y) - hAt(x - e, y)) / (2 * e); gy = (hAt(x, y + e) - hAt(x, y - e)) / (2 * e);
        const g2 = gx * gx + gy * gy;
        if (g2 < 1e-9) { ok = false; break; }
        const err = h - L0;
        let sx = (err * gx) / g2, sy = (err * gy) / g2;
        const m = Math.hypot(sx, sy);
        if (m > 70 * u) { sx *= (70 * u) / m; sy *= (70 * u) / m; }
        x -= sx; y -= sy;
      }
      if (!ok || x < 80 * u || x > W - 80 * u || y < 80 * u || y > H - 90 * u || nearSpot(x, y)) continue;
      let ang = Math.atan2(gx, -gy);
      if (ang > Math.PI / 2) ang -= Math.PI;
      if (ang < -Math.PI / 2) ang += Math.PI;
      g.save(); g.translate(x, y); g.rotate(ang); g.globalAlpha = a * 0.95;
      say(g, C, fmt(((L0 - SEA) / DZ) * 40), 0, 0, 24 * u, { align: "center", base: "middle", weight: 700, color: C.idx(1), haloA: 0.88 });
      g.restore();
    }
    // Spot heights at the summits of the current landform.
    const bumps = hAt.bumps;
    for (let i = 0; i < bumps.length; i++) {
      const b = bumps[i];
      if (b[3] < 0.18 || b[0] < 90 * u || b[0] > W - 200 * u || b[1] < 90 * u || b[1] > H - 100 * u) continue;
      g.globalAlpha = b[4];
      tri(g, b[0], b[1], 11 * u, C.idx(0.95));
      say(g, C, fmt(((hAt(b[0], b[1]) - SEA) / DZ) * 40), b[0] + 20 * u, b[1] + 8 * u, 26 * u, { weight: 700, color: C.idx(1), font: "serif" });
    }
    g.restore();
  }

  function collar(g, F, hAt) {
    const { W, H, u, C, T, t, info } = F;
    const ct = 54 * u, cb = 70 * u, bw = 12 * u;
    const x0 = ct, y0 = ct, x1 = W - ct, y1 = H - cb;
    g.save();
    g.fillStyle = T.collar;
    g.fillRect(0, 0, W, ct); g.fillRect(0, H - cb, W, cb); g.fillRect(0, 0, ct, H); g.fillRect(W - ct, 0, ct, H);
    g.strokeStyle = C.ink(0.92); g.lineWidth = 3.2 * u; g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    g.lineWidth = 1.4 * u; g.strokeRect(x0 - bw, y0 - bw, x1 - x0 + bw * 2, y1 - y0 + bw * 2);
    // Graticule band: alternating blocks, with coordinate figures.
    const nx = 22, ny = Math.max(8, Math.round((y1 - y0) / ((x1 - x0) / nx)));
    g.fillStyle = C.ink(0.88);
    for (let i = 0; i < nx; i += 2) { const sx = x0 + ((x1 - x0) * i) / nx, ex = ((x1 - x0) / nx); g.fillRect(sx, y0 - bw, ex, bw); g.fillRect(sx, y1, ex, bw); }
    for (let j = 0; j < ny; j += 2) { const sy = y0 + ((y1 - y0) * j) / ny, ey = (y1 - y0) / ny; g.fillRect(x0 - bw, sy, bw, ey); g.fillRect(x1, sy, bw, ey); }
    const fs = 20 * u;
    for (let i = 0; i <= nx; i += 2) say(g, C, "E" + (400 + i * 2), x0 + ((x1 - x0) * i) / nx, y0 - bw - 7 * u, fs, { align: "center", weight: 700, halo: false, color: C.ink(0.85) });
    for (let j = 2; j < ny; j += 2) {
      g.save(); g.translate(x0 - bw - 8 * u, y0 + ((y1 - y0) * j) / ny); g.rotate(-Math.PI / 2);
      say(g, C, "N" + (6040 + j * 2), 0, 0, fs, { align: "center", weight: 700, halo: false, color: C.ink(0.85) }); g.restore();
      g.save(); g.translate(x1 + bw + 8 * u + fs * 0.7, y0 + ((y1 - y0) * j) / ny); g.rotate(Math.PI / 2);
      say(g, C, "N" + (6040 + j * 2), 0, 0, fs, { align: "center", weight: 700, halo: false, color: C.ink(0.85) }); g.restore();
    }
    // Reticle: a survey cursor that wanders the sheet, with its ticks and readout on the collar.
    const rx = W * (0.5 + 0.36 * Math.sin(t * 0.23 + 0.5)), ry = H * (0.5 + 0.3 * Math.sin(t * 0.31 + 2));
    const rxc = clamp(rx, x0, x1), ryc = clamp(ry, y0, y1);
    tri(g, rxc, y0 - bw * 0.55, 8 * u, C.acc(1)); tri(g, rxc, y1 + bw * 0.55, 8 * u, C.acc(1));
    g.fillStyle = C.acc(1);
    g.beginPath(); g.moveTo(x0 - bw * 0.45, ryc - 8 * u); g.lineTo(x0 - bw * 0.45, ryc + 8 * u); g.lineTo(x0 + 4 * u, ryc); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(x1 + bw * 0.45, ryc - 8 * u); g.lineTo(x1 + bw * 0.45, ryc + 8 * u); g.lineTo(x1 - 4 * u, ryc); g.closePath(); g.fill();
    const el = ((hAt(rxc, ryc) - SEA) / DZ) * 40;
    const sheet = String(Math.max(1, (info.index || 0) + 1)).padStart(2, "0");
    const narrow = W < 1400;
    const ty = y1 + bw + 34 * u;
    say(g, C, (narrow ? `E ${(400 + ((rxc - x0) / (x1 - x0)) * 44).toFixed(1)}  ·  ELEV ${fmt(el)} M  ·  C.I. 40 M` : `SHEET ${sheet}  ·  E ${(400 + ((rxc - x0) / (x1 - x0)) * 44).toFixed(1)}  N ${fmt(6040 + ((y1 - ryc) / (y1 - y0)) * 20)}.${Math.round(((ryc * 7) % 10))}  ·  ELEV ${fmt(el)} M  ·  C.I. 40 M`), W / 2, ty, 22 * u, { align: "center", weight: 700, halo: false, color: C.ink(0.9), track: 0.08 });
    // Scale bar.
    const sbx = x0 + 6 * u, sbw = 56 * u;
    for (let i = 0; i < (narrow ? 0 : 4); i++) { g.fillStyle = i % 2 ? C.paper(1) : C.ink(0.9); g.fillRect(sbx + i * sbw, ty - 22 * u, sbw, 11 * u); }
    if (!narrow) { g.strokeStyle = C.ink(0.9); g.lineWidth = 1.4 * u; g.strokeRect(sbx, ty - 22 * u, sbw * 4, 11 * u); }
    (narrow ? [] : ["0", "1", "2", "3 KM"]).forEach((s, i) => say(g, C, s, sbx + i * sbw, ty + 2 * u, 16 * u, { weight: 700, halo: false, color: C.ink(0.85) }));
    // North arrow, needle trembling.
    const nx0 = x1 - 60 * u, ny0 = ty - 8 * u;
    g.save(); g.translate(nx0, ny0); g.rotate(Math.sin(t * 1.3) * 0.12);
    g.fillStyle = C.ink(0.92); g.beginPath(); g.moveTo(0, -22 * u); g.lineTo(8 * u, 8 * u); g.lineTo(0, 3 * u); g.lineTo(-8 * u, 8 * u); g.closePath(); g.fill();
    g.fillStyle = C.acc(1); g.beginPath(); g.moveTo(0, -22 * u); g.lineTo(8 * u, 8 * u); g.lineTo(0, 3 * u); g.closePath(); g.fill();
    g.restore();
    say(g, C, "N", nx0 - 28 * u, ny0 + 6 * u, 24 * u, { align: "right", weight: 700, halo: false, font: "serif", color: C.ink(0.95) });
    g.restore();
    return { rx: rxc, ry: ryc };
  }

  // ---- title and closing: a scrolling ridge with a walker, flags and a stamp ----------------------
  function ridgeY(s) { return 0.5 * Math.sin(s * 0.0045 + 1.3) + 0.3 * Math.sin(s * 0.0113 + 0.4) + 0.2 * Math.sin(s * 0.027 + 2.1) + 0.1 * Math.sin(s * 0.061); }
  function hiker(g, C, x, y, s, t, hold) {
    const u = C.u, w = Math.sin(t * 7), bob = Math.abs(w) * 3 * u * (hold ? 0 : 1);
    g.save(); g.translate(x, y - bob); g.lineCap = "round"; g.lineJoin = "round";
    g.strokeStyle = C.ink(1); g.lineWidth = 4 * u;
    const hy = -s * 0.62;
    g.beginPath(); g.moveTo(0, -s * 0.3); g.lineTo(-w * s * 0.2 * (hold ? 0.2 : 1), 0); g.moveTo(0, -s * 0.3); g.lineTo(w * s * 0.2 * (hold ? 0.2 : 1), 0); g.stroke();
    g.beginPath(); g.moveTo(0, -s * 0.3); g.lineTo(s * 0.02, hy + s * 0.12); g.stroke();
    g.fillStyle = C.acc(1); rr(g, -s * 0.15, hy + s * 0.08, s * 0.3, s * 0.32, s * 0.08); g.fill(); g.stroke();
    g.beginPath(); g.arc(s * 0.02, hy, s * 0.1, 0, TAU); g.fillStyle = C.plate(1); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(s * 0.02, hy - s * 0.07, s * 0.19, s * 0.05, 0, 0, TAU); g.fillStyle = C.ink(1); g.fill();
    g.beginPath(); g.moveTo(s * 0.12, hy + s * 0.2); g.lineTo(s * 0.34, 0); g.stroke();
    g.restore();
  }
  function strip(g, F, rise, calm, o = {}) {
    const { W, H, u, C, T, t, tall } = F;
    const top = H * (tall ? 0.76 : 0.69), bot = H - 70 * u, mid = top + (bot - top) * 0.58, amp = (bot - top) * 0.4;
    const scroll = (o.ground ?? t) * 70 * u, k = ease(rise);
    const Y = (x) => mid - amp * ridgeY((x + scroll) / u);
    g.save();
    g.translate(0, (1 - k) * (bot - top + 90 * u));
    const x0 = 54 * u, x1 = W - 54 * u;
    g.beginPath(); g.rect(x0, top - 120 * u, x1 - x0, bot - top + 120 * u + 12 * u); g.clip();
    const fillPath = () => { g.beginPath(); g.moveTo(x0, bot + 20 * u); for (let x = x0; x <= x1 + 8 * u; x += 8 * u) g.lineTo(x, Y(x)); g.lineTo(x1, bot + 20 * u); g.closePath(); };
    fillPath();
    const gr = g.createLinearGradient(0, mid - amp, 0, bot);
    const rp = T.ramp; gr.addColorStop(0, `rgb(${rp[rp.length - 1][1]})`); gr.addColorStop(0.5, `rgb(${rp[Math.floor(rp.length / 2)][1]})`); gr.addColorStop(1, `rgb(${rp[0][1]})`);
    g.fillStyle = gr; g.globalAlpha = 0.97; g.fill(); g.globalAlpha = 1;
    g.save(); fillPath(); g.clip();
    for (let j = 1; j < 11; j++) {
      g.beginPath();
      for (let x = x0; x <= x1 + 8 * u; x += 8 * u) { const y = Y(x) + j * 15 * u + Math.sin(t * 0.9 + j * 0.7 + x * 0.004) * 3 * u; x === x0 ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.strokeStyle = j % 5 === 0 ? C.idx(0.7) : C.line(0.5 - j * 0.03); g.lineWidth = (j % 5 === 0 ? 2.6 : 1.4) * u; g.stroke();
    }
    g.restore();
    g.beginPath(); for (let x = x0; x <= x1 + 8 * u; x += 8 * u) x === x0 ? g.moveTo(x, Y(x)) : g.lineTo(x, Y(x));
    g.strokeStyle = C.idx(1); g.lineWidth = 5 * u; g.lineJoin = "round"; g.stroke();
    // The trail rides the crest; its dashes belong to the ground and slide with it.
    g.beginPath(); for (let x = x0; x <= x1 + 8 * u; x += 8 * u) x === x0 ? g.moveTo(x, Y(x) - 13 * u) : g.lineTo(x, Y(x) - 13 * u);
    g.setLineDash([26 * u, 16 * u]); g.lineDashOffset = scroll; g.strokeStyle = C.acc(1); g.lineWidth = 6 * u; g.lineCap = "butt"; g.stroke(); g.setLineDash([]);
    // Waymark flags every 1300 units of ground.
    const gap = 1300 * u, first = Math.floor((scroll - 200 * u) / gap);
    for (let i = first; i < first + 4; i++) {
      const x = i * gap + 320 * u - scroll + gap * 0.0;
      if (x < x0 + 20 * u || x > x1 - 120 * u) continue;
      flag(g, C, x, Y(x) - 8 * u, 120 * u, t, i, C.acc(1));
      say(g, C, "BM " + fmt(1200 + (((i % 9) + 9) % 9) * 110 + 40), x - 8 * u, Y(x) + 34 * u, 28 * u, { align: "center", weight: 700, color: C.idx(1), font: "serif" });
    }
    const wx = W * 0.3;
    // Closing: the walker halts and plants a summit flag beside them; it keeps flying to the end.
    const pl = o.plant || 0;
    if (pl > 0) {
      const fx = wx + 70 * u, fy = Y(fx) - 10 * u, fh = 190 * u * ease(span(pl, 0, 0.6));
      const pr = ((t * 0.7) % 1);
      g.save(); g.strokeStyle = C.acc(0.7 * (1 - pr)); g.lineWidth = 3 * u;
      g.beginPath(); g.ellipse(fx, fy + 6 * u, 20 * u + pr * 90 * u, (20 * u + pr * 90 * u) * 0.3, 0, 0, TAU); g.stroke(); g.restore();
      if (fh > 8 * u) flag(g, C, fx, fy, fh, t, 3.1, C.acc(1));
      const lq = ease(span(pl, 0.5, 0.9));
      if (lq > 0) {
        g.save(); g.globalAlpha *= lq;
        const lx = fx + 150 * u, ly = fy - fh * 0.32;
        g.strokeStyle = C.ink(0.85); g.lineWidth = 2 * u; g.beginPath(); g.moveTo(fx + 8 * u, ly + 10 * u); g.lineTo(lx - 12 * u, ly + 10 * u); g.stroke();
        say(g, C, "SUMMIT REACHED", lx, ly + 22 * u, 44 * u, { weight: 700, font: "serif", color: C.idx(1), track: 0.04 });
        g.restore();
      }
    }
    hiker(g, C, wx, Y(wx) - 14 * u, 112 * u, t, calm || pl > 0);
    g.restore();
  }
  function stamp(g, F, q) {
    if (q <= 0) return;
    const { W, H, u, C, t } = F, s = 1 + (1 - ease(q)) * 0.6, wob = Math.sin(t * 1.4) * 0.006;
    g.save(); g.translate(Math.min(W * 0.8, W - 54 * u - 270 * u), H * 0.19); g.rotate(-0.12 + wob); g.scale(s, s); g.globalAlpha = clamp(q * 2) * 0.92;
    const w = 480 * u, h = 130 * u;
    g.strokeStyle = C.acc(1); g.lineWidth = 6 * u; rr(g, -w / 2, -h / 2, w, h, 12 * u); g.stroke();
    g.lineWidth = 2 * u; rr(g, -w / 2 + 12 * u, -h / 2 + 12 * u, w - 24 * u, h - 24 * u, 6 * u); g.stroke();
    say(g, C, "SURVEY COMPLETE", 0, -4 * u, 52 * u, { align: "center", base: "middle", color: C.acc(1), halo: false, weight: 800, track: 0.08 });
    say(g, C, "CHECKED · SIGNED OFF", 0, 36 * u, 26 * u, { align: "center", base: "middle", color: C.acc(1), halo: false, weight: 700, track: 0.14 });
    g.restore();
  }

  // ---- the stage -----------------------------------------------------------------------------------
  function stage(ctx, S, info) {
    const { W, H, u } = S, T = S.look.tone, C = cOf(S);
    ST = { next: info.next, index: info.index, hAt: null };
    const F = { S, W, H, u, T, C, t: info.t, info, tall: S.tall, rip: null };
    // A range ring sweeps the sheet at each change, bending the contours it crosses.
    const c = info.change;
    let tt = -1;
    if (info.next && info.local > info.hold - 0.6 * c) tt = info.local - (info.hold - 0.6 * c);
    else if (info.index > 0 && info.local < 1.8 * c) tt = info.local + 0.6 * c;
    const L = 2.4 * c;
    if (tt >= 0 && tt < L) {
      const q = tt / L, R = ease(q) * 0.85 * Math.hypot(W, H);
      F.rip = { x: W * 0.5, y: H * 0.6, R, wd: 120 * u, amp: 0.09 * (1 - q * 0.6), a: Math.pow(1 - q, 1.1) };
    }
    const hAt = makeField(F);
    ST.hAt = hAt;
    if (!S.paint) {
      // Over footage: contour lines only.
      const Gd = gridOf(F); sample(Gd, hAt); contours(ctx, Gd, F, 0.7);
      return;
    }
    const Gd = gridOf(F);
    sample(Gd, hAt);
    tint(Gd, T, S.look.texture);
    ctx.save();
    ctx.fillStyle = T.paper; ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(Gd.cv, 0, 0, Gd.gw, Gd.gh, 0, 0, Gd.gw * Gd.cell, Gd.gh * Gd.cell);
    ctx.restore();
    grain(ctx, W, H, S.look.texture ?? 1);
    contours(ctx, Gd, F, 1);
    contourLabels(ctx, F, hAt);
    if (F.rip) {
      const r = F.rip;
      ctx.save();
      ctx.lineWidth = 34 * u; ctx.strokeStyle = `rgba(${T.wash},${0.3 * r.a})`; ctx.beginPath(); ctx.arc(r.x, r.y, r.R, 0, TAU); ctx.stroke();
      ctx.lineWidth = 5 * u; ctx.strokeStyle = C.acc(r.a); ctx.beginPath(); ctx.arc(r.x, r.y, r.R, 0, TAU); ctx.stroke();
      ctx.lineWidth = 2 * u; ctx.setLineDash([14 * u, 10 * u]); ctx.strokeStyle = C.acc(r.a * 0.8); ctx.beginPath(); ctx.arc(r.x, r.y, Math.max(1, r.R - 34 * u), 0, TAU); ctx.stroke();
      ctx.restore();
    }
    // Survey reticle crosshair under the headlines.
    clearing(ctx, F);
    if (info.scene === "title") strip(ctx, F, span(info.local, 0, 1.3), false);
    if (info.scene === "closing") {
      // The ground glides to a halt, then the flag goes in.
      const L = info.local, a = 0.6, b = 1.1, ramp = L < a ? L : L < b ? a + (L - a) - ((L - a) * (L - a)) / (2 * (b - a)) : a + (b - a) / 2;
      strip(ctx, F, span(L, 0, 1.0), false, { ground: info.t - L + ramp, plant: span(L, 1.1, 1.9) });
      stamp(ctx, F, span(L, 0.7, 1.1));
    }
    const cur = collar(ctx, F, hAt);
    ctx.save();
    ctx.setLineDash([10 * u, 12 * u]); ctx.lineDashOffset = -F.t * 20 * u; ctx.strokeStyle = C.acc(0.45); ctx.lineWidth = 1.6 * u;
    ctx.beginPath(); ctx.moveTo(54 * u, cur.ry); ctx.lineTo(W - 54 * u, cur.ry); ctx.moveTo(cur.rx, 54 * u); ctx.lineTo(cur.rx, H - 70 * u); ctx.stroke();
    ctx.setLineDash([]); ctx.lineWidth = 3 * u; ctx.strokeStyle = C.acc(0.95); ctx.beginPath(); ctx.arc(cur.rx, cur.ry, 20 * u, 0, TAU); ctx.stroke();
    ctx.lineWidth = 1.6 * u; ctx.strokeStyle = C.acc(0.7); ctx.beginPath(); ctx.arc(cur.rx, cur.ry, 20 * u + (((F.t * 0.9) % 1) * 24 * u), 0, TAU); ctx.stroke();
    ctx.restore();
  }

  // ---- scene helpers -------------------------------------------------------------------------------
  function begin(g, S, info) {
    const C = cOf(S), leave = leaveOf(info);
    g.save();
    g.globalAlpha *= 1 - leave;
    g.translate(0, leave * 26 * S.u);
    return { C, leave };
  }
  // A cleared patch under a drawing, soft at its edge.
  function patch(g, C, x, y, w, h, a = 0.86) {
    g.save(); g.shadowColor = C.paper(a); g.shadowBlur = 40 * C.u; g.shadowOffsetX = 10000; g.fillStyle = C.paper(a);
    rr(g, x - 10000, y, w, h, 26 * C.u); g.fill(); g.restore();
  }
  function plate(g, C, x, y, w, h, o = {}) {
    const u = C.u;
    g.save();
    g.shadowColor = "rgba(40,24,10,0.3)"; g.shadowBlur = 22 * u; g.shadowOffsetX = 8 * u; g.shadowOffsetY = 10 * u;
    rr(g, x, y, w, h, 8 * u); g.fillStyle = C.plate(o.a ?? 0.97); g.fill();
    g.shadowColor = "transparent";
    g.strokeStyle = C.ink(0.92); g.lineWidth = 3.4 * u; rr(g, x, y, w, h, 8 * u); g.stroke();
    g.lineWidth = 1.3 * u; rr(g, x + 9 * u, y + 9 * u, w - 18 * u, h - 18 * u, 4 * u); g.stroke();
    g.restore();
  }

  // ---- chart: an elevation profile -----------------------------------------------------------------
  function chart(g, S, box, p, d, info) {
    const { C, leave } = begin(g, S, info), u = S.u, T = C.T, t = info.t;
    const n = d.values.length, max = Math.max(...d.values, 1);
    const base = box.y + box.h - 70 * u, top = box.y + 128 * u, hmax = base - top;
    // A right-hand gutter keeps the elevation figures clear of the last peak and its flag.
    const gut = 120 * u, pw = box.w - gut;
    const cx = (i) => box.x + (pw * (i + 0.5)) / n, sig = (pw / n) * 0.34;
    const rise = d.values.map((v, i) => ease((p - (i / n) * 0.5) / 0.5));
    const hs = d.values.map((v, i) => hmax * (v / max) * rise[i]);
    const Y = (x) => {
      let s = 0, m = 0;
      for (let i = 0; i < n; i++) { const w = Math.exp(-Math.pow(Math.abs(x - cx(i)) / sig, 1.7)); s += hs[i] * w; m = Math.max(m, w * rise[i]); }
      return base - s - Math.min(1, s / (30 * u)) * 7 * u * (Math.sin(x / (37 * u) + t * 0.4) + 0.6 * Math.sin(x / (17 * u) + 1.3 - t * 0.3));
    };
    const x0 = box.x - 20 * u, x1 = box.x + box.w + 20 * u;
    patch(g, C, x0 - 20 * u, box.y + 10 * u, x1 - x0 + 40 * u, box.h + 20 * u, 0.78);
    // Elevation rules and ticks (always there, so the sheet is never bare).
    g.save();
    g.lineWidth = 1.4 * u; g.setLineDash([4 * u, 9 * u]);
    for (let r = 1; r <= 4; r++) {
      const y = base - (hmax * r) / 4;
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + (x1 - x0) * ease(0.3 + p * 2 - r * 0.1), y); g.strokeStyle = C.line(0.6); g.stroke();
      say(g, C, fmt((max * r) / 4) + (d.suffix || ""), x1 - 6 * u, y - 8 * u, 28 * u, { align: "right", weight: 700, color: C.line(1), haloA: 0.8, q: clamp(p * 4 - r * 0.2) });
    }
    g.restore();
    // Fill, strata and crest.
    const path = () => { g.beginPath(); g.moveTo(x0, base); for (let x = x0; x <= x1 + 4; x += 6 * u) g.lineTo(x, Y(x)); g.lineTo(x1, base); g.closePath(); };
    g.save();
    path();
    const gr = g.createLinearGradient(0, top, 0, base);
    const rp = T.ramp; gr.addColorStop(0, `rgb(${rp[rp.length - 1][1]})`); gr.addColorStop(0.55, `rgb(${rp[Math.floor(rp.length / 2)][1]})`); gr.addColorStop(1, `rgb(${rp[0][1]})`);
    g.fillStyle = gr; g.fill(); g.clip();
    const hot = d.highlight;
    if (hot >= 0 && hot < n) { const hg = g.createLinearGradient(cx(hot) - sig * 2.2, 0, cx(hot) + sig * 2.2, 0); hg.addColorStop(0, C.acc(0)); hg.addColorStop(0.5, C.acc(0.42 * rise[hot])); hg.addColorStop(1, C.acc(0)); g.fillStyle = hg; g.fillRect(cx(hot) - sig * 2.2, top - 40 * u, sig * 4.4, hmax + 80 * u); }
    for (let j = 1; j < 12; j++) {
      g.beginPath();
      for (let x = x0; x <= x1 + 4; x += 6 * u) { const y = Y(x) + j * 14 * u + Math.sin(t * 1.1 - j * 0.6 + x * 0.006) * 4 * u; x === x0 ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.strokeStyle = j % 5 === 0 ? C.idx(0.75) : C.line(0.55 - j * 0.025); g.lineWidth = (j % 5 === 0 ? 2.8 : 1.4) * u; g.stroke();
    }
    g.restore();
    g.save(); g.lineJoin = "round";
    g.beginPath(); for (let x = x0; x <= x1 + 4; x += 6 * u) x === x0 ? g.moveTo(x, Y(x)) : g.lineTo(x, Y(x));
    g.strokeStyle = C.idx(1); g.lineWidth = 5 * u; g.stroke();
    g.restore();
    // Baseline ruler.
    g.save(); g.strokeStyle = C.ink(0.95); g.lineWidth = 4 * u;
    const bx = x0 + (x1 - x0) * ease(p * 3 + 0.25);
    g.beginPath(); g.moveTo(x0, base); g.lineTo(bx, base); g.stroke();
    g.lineWidth = 1.6 * u; g.beginPath();
    for (let x = x0; x < bx; x += 22 * u) { g.moveTo(x, base); g.lineTo(x, base + (Math.round((x - x0) / (22 * u)) % 5 === 0 ? 16 : 9) * u); }
    g.stroke(); g.restore();
    // Peaks: drop lines, spot-height marks, figures and names.
    for (let i = 0; i < n; i++) {
      const q = rise[i], x = cx(i), isHot = i === hot, y = Y(x);
      g.save(); g.beginPath(); g.moveTo(x, base); g.lineTo(x, base + (y - base) * Math.max(0.12, q));
      g.setLineDash([10 * u, 8 * u]); g.lineDashOffset = -t * 36 * u; g.strokeStyle = isHot ? C.acc(0.95) : C.ink(0.55); g.lineWidth = 2.2 * u; g.stroke(); g.restore();
      // Each name arrives whole, together with its own peak.
      if (q > 0.02) { g.save(); g.globalAlpha *= clamp(q * 3); say(g, C, d.labels[i] || "", x, base + 58 * u + (1 - clamp(q * 3)) * 14 * u, 44 * u, { align: "center", weight: 700, color: isHot ? C.acc(1) : C.inkHex, font: "serif", track: 0.04, maxW: (pw / n) * 0.92 }); g.restore(); }
      if (q > 0.04) {
        tri(g, x, y - 4 * u, (isHot ? 17 : 13) * u, isHot ? C.acc(1) : C.idx(1));
        say(g, C, M().formatNumber(d.values[i] * q, 0, d.prefix, d.suffix), x, y - 30 * u, 96 * u, { align: "center", weight: 700, font: "serif", color: isHot ? C.acc(1) : C.inkHex, maxW: (pw / n) * 0.96, min: 70 * u });
        if (isHot) flag(g, C, x + 44 * u, y - 10 * u, 0.3 * hmax + 40 * u, t, 1.3, C.acc(1));
      }
    }
    // A climber works up the highlighted peak; a leader ties their live reading to a caption.
    if (p > 0.7 && hot >= 0 && hot < n) {
      const a = span(p, 0.7, 0.95), hx = cx(hot);
      const cyc = (t * 0.16) % 1, k = cyc < 0.8 ? inout(cyc / 0.8) : 1;
      const sx = hx - sig * 1.9 * (1 - k * 0.8), sy = Y(sx);
      g.save(); g.globalAlpha *= a;
      hiker(g, C, sx, sy - 6 * u, 70 * u, t, k >= 1);
      const rv = Math.min(d.values[hot], ((base - sy) / hmax) * max);
      const lw = 330 * u, lh = 104 * u, lx = Math.max(box.x, hx - sig * 2.6 - lw), ly = top - 20 * u;
      g.strokeStyle = C.ink(0.85); g.lineWidth = 2 * u; g.setLineDash([6 * u, 6 * u]);
      g.beginPath(); g.moveTo(sx, sy - 80 * u); g.lineTo(lx + lw, ly + lh * 0.7); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.arc(sx, sy - 80 * u, 5 * u, 0, TAU); g.fillStyle = C.ink(0.9); g.fill();
      plate(g, C, lx, ly, lw, lh, { a: 0.95 });
      say(g, C, (d.labels[hot] || "").toUpperCase() + " CLIMB", lx + lw / 2, ly + 36 * u, 26 * u, { align: "center", base: "middle", halo: false, weight: 700, color: C.muted, track: 0.12, maxW: lw - 30 * u });
      say(g, C, "▲ " + M().formatNumber(rv, 0, d.prefix, d.suffix) + " of " + M().formatNumber(d.values[hot], 0, d.prefix, d.suffix), lx + lw / 2, ly + 74 * u, 42 * u, { align: "center", base: "middle", halo: false, weight: 700, font: "serif", color: C.acc(1), maxW: lw - 30 * u });
      g.restore();
    }
    g.restore();
  }
  const M = () => window.DreamcutMotion;

  // ---- object: a device raised on terraces ---------------------------------------------------------
  function object(g, S, box, p, d, info) {
    const { C } = begin(g, S, info), u = S.u, t = info.t;
    const phone = d.kind === "phone", tallL = box.h > box.w * 1.1 && !phone;
    const w = tallL ? box.w * 0.84 : phone ? Math.min(box.w * 0.3, box.h * 0.46) : Math.min(box.w * 0.58, box.h * 1.25);
    const h = phone ? w * 1.9 : w * 0.62;
    const x = tallL ? box.x + box.w * 0.08 : box.x + (phone ? box.w * 0.36 - w / 2 : box.w * 0.04) + 40 * u;
    const y = tallL ? box.y + 40 * u : box.y + (box.h - h - (phone ? 0 : h * 0.12)) / 2;
    const q = ease(p * 1.3 + 0.12), R0 = (phone ? 36 : 16) * u;
    // Terrace rings: contour lines radiating off the device, always moving outward.
    g.save();
    const f = (t * 0.45) % 1;
    for (let k = 0; k < 8; k++) {
      const off = (k + f) * 17 * u * q, a = (1 - (k + f) / 8) * 0.8;
      rr(g, x - off, y - off, w + off * 2, h + off * 2 + (phone ? 0 : h * 0.06), R0 + off * 0.9);
      const idxLine = (k + (f > 0.5 ? 1 : 0)) % 5 === 0;
      g.strokeStyle = idxLine ? C.idx(a) : C.line(a * 0.9); g.lineWidth = (idxLine ? 3.2 : 1.8) * u; g.stroke();
    }
    g.restore();
    // The card as a map inset: a printed panel with a title band, a relief view and a legend of clip strips.
    g.save(); g.globalAlpha *= clamp(p * 4 + 0.3);
    plate(g, C, x, y, w, h, { a: 1 });
    const pad = (phone ? 22 : 30) * u, sx = x + pad, sy = y + pad, sw = w - pad * 2, sh = h - pad * 2;
    const band = Math.max(40 * u, sh * 0.13);
    g.strokeStyle = C.ink(0.9); g.lineWidth = 2 * u; g.beginPath(); g.moveTo(sx, sy + band); g.lineTo(sx + sw, sy + band); g.stroke();
    say(g, C, "INSET A · PROPOSAL CARD", sx + 6 * u, sy + band * 0.62, Math.min(28 * u, band * 0.55), { base: "middle", weight: 700, font: "serif", halo: false, color: C.ink(0.9), track: 0.12, maxW: sw * 0.7 });
    say(g, C, "1 : 25 000", sx + sw - 6 * u, sy + band * 0.62, Math.min(24 * u, band * 0.5), { align: "right", base: "middle", weight: 700, font: "serif", halo: false, color: C.ink(0.7), maxW: sw * 0.26 });
    const pv = { x: sx, y: sy + band + 14 * u, w: sw, h: sh * 0.44 };
    relief(g, C, pv.x, pv.y, pv.w, pv.h, pv.x + pv.w * (0.5 + 0.1 * Math.sin(t * 0.6)), pv.y + pv.h * 0.56, 0.35 + 0.65 * q, pv.w * 0.12, pv.h * 0.22, 1 / 12, t, 0.9);
    g.strokeStyle = C.ink(0.85); g.lineWidth = 2.4 * u; rr(g, pv.x, pv.y, pv.w, pv.h, 6 * u); g.stroke();
    tri(g, pv.x + pv.w * (0.5 + 0.1 * Math.sin(t * 0.6)), pv.y + pv.h * 0.56, 12 * u, C.acc(1));
    // Legend: three rows of hatch-filled clip strips; the proposed change carries the accent cross-hatch.
    const ly0 = pv.y + pv.h + 18 * u, lh = sy + sh - ly0, th = lh / 3 - 10 * u, clips = [[0.0, 0.3], [0.34, 0.24], [0.62, 0.36]];
    for (let r = 0; r < 3; r++) {
      const ty = ly0 + r * (th + 10 * u);
      clips.forEach(([cx, cw], i) => {
        const shown = clamp((q - 0.2 - i * 0.12) * 3);
        if (shown <= 0) return;
        const hot = r === 0 && i === 1, bx = sx + sw * (cx + r * 0.02), bw = Math.min(sw * cw * shown, sx + sw - bx);
        g.save(); g.beginPath(); g.rect(bx, ty, bw, th); g.clip();
        g.fillStyle = hot ? C.acc(0.18) : C.plate(1); g.fillRect(bx, ty, bw, th);
        const sp = (hot ? 10 : 13) * u, off = (t * 12 * u) % sp;
        g.strokeStyle = hot ? C.acc(0.95) : C.line(0.85); g.lineWidth = (hot ? 2.4 : 1.6) * u; g.beginPath();
        for (let k = -th; k < bw + th; k += sp) { g.moveTo(bx + k + off, ty + th); g.lineTo(bx + k + off + th, ty); if (hot) { g.moveTo(bx + k - off, ty); g.lineTo(bx + k - off + th, ty + th); } }
        g.stroke(); g.restore();
        g.strokeStyle = hot ? C.acc(1) : C.ink(0.85); g.lineWidth = (hot ? 3 : 2) * u; g.strokeRect(bx, ty, bw, th);
      });
    }
    // The playhead runs along the strips.
    const ph = sx + sw * (0.03 + 0.94 * ((t * 0.17) % 1));
    g.strokeStyle = C.acc(1); g.lineWidth = 3 * u; g.beginPath(); g.moveTo(ph, ly0 - 8 * u); g.lineTo(ph, sy + sh); g.stroke();
    tri(g, ph, ly0 - 10 * u, 8 * u, C.acc(1));
    g.restore();
    // Callouts: numbered survey pins with chained leaders to labels in the map's own lettering.
    const anchors = [[pv.x + pv.w * 0.78, pv.y + pv.h * 0.3], [sx + sw * 0.46, ly0 + th * 0.5], [sx + sw * 0.16, ly0 + 2 * (th + 10 * u) + th * 0.5]];
    const labelX = tallL ? box.x + 70 * u : box.x + box.w * (phone ? 0.64 : 0.7);
    d.callouts.forEach((label, i) => {
      const cq = ease((p - 0.1 - i * 0.14) / 0.4);
      if (cq <= 0 || !label) return;
      const [ax, ay] = anchors[i], ly = tallL ? y + h + 130 * u + i * 120 * u : box.y + box.h * (0.2 + i * 0.28);
      const ex = tallL ? labelX + 10 * u : labelX - 24 * u;
      const lxp = lerp(ax, ex, cq), lyp = lerp(ay, ly, cq);
      g.save();
      g.strokeStyle = C.ink(0.9); g.lineWidth = 2.4 * u;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(lxp, lyp); g.stroke();
      // Chain ticks along the leader, crawling toward the label.
      const L = Math.hypot(lxp - ax, lyp - ay), nx = (lxp - ax) / Math.max(1, L), ny = (lyp - ay) / Math.max(1, L);
      g.lineWidth = 2 * u; g.beginPath();
      for (let s2 = 30 * u + ((t * 30 * u) % (28 * u)); s2 < L - 10 * u; s2 += 28 * u) { const px = ax + nx * s2, py = ay + ny * s2; g.moveTo(px - ny * 7 * u, py + nx * 7 * u); g.lineTo(px + ny * 7 * u, py - nx * 7 * u); }
      g.stroke();
      if (cq > 0.95) { g.lineWidth = 3 * u; g.beginPath(); g.moveTo(lxp, lyp - 16 * u); g.lineTo(lxp, lyp + 16 * u); g.stroke(); }
      const pr = 22 * u + Math.sin(t * 3 + i) * 2 * u;
      g.beginPath(); g.arc(ax, ay, pr, 0, TAU); g.fillStyle = C.acc(1); g.fill(); g.lineWidth = 3 * u; g.strokeStyle = C.plate(1); g.stroke();
      g.beginPath(); g.arc(ax, ay, pr + 6 * u + ((t * 0.8 + i * 0.3) % 1) * 22 * u, 0, TAU); g.strokeStyle = C.acc(0.5 * (1 - ((t * 0.8 + i * 0.3) % 1))); g.lineWidth = 2 * u; g.stroke();
      say(g, C, String(i + 1), ax, ay + 1 * u, 28 * u, { align: "center", base: "middle", halo: false, weight: 800, color: "#ffffff", font: "serif" });
      if (cq > 0.8) {
        const maxW = box.x + box.w - labelX, la = clamp((cq - 0.8) * 5);
        g.globalAlpha *= la;
        const tw = say(g, C, String(label).toUpperCase(), labelX, ly, 44 * u, { base: "middle", weight: 700, font: "serif", maxW, min: 42 * u, track: 0.06 });
        const uw = Math.min(tw, maxW);
        g.strokeStyle = C.ink(0.9); g.lineWidth = 2.4 * u; g.beginPath(); g.moveTo(labelX, ly + 30 * u); g.lineTo(labelX + uw, ly + 30 * u); g.moveTo(labelX, ly + 37 * u); g.lineTo(labelX + uw, ly + 37 * u); g.stroke();
      }
      g.restore();
    });
    g.restore();
  }
  const T0 = (C) => C.T;

  // ---- people: surveyors on mounds -----------------------------------------------------------------
  // Each surveyor is a different person: their own hat, kit and coat.
  function surveyor(g, C, cx, base, size, color, t, i, q, hot) {
    const u = C.u, r = size * 0.14, bob = Math.sin(t * 1.9 + i * 1.3) * 3.5 * u, sway = Math.sin(t * 1.3 + i) * 0.05;
    const v = i % 4;
    g.save(); g.lineCap = "round"; g.lineJoin = "round";
    g.globalAlpha *= clamp(q * 2);
    g.translate(0, (1 - q) * size * 0.3);
    const top = base - size * 0.78 + bob, bw = size * (v === 2 ? 0.46 : 0.4);
    const hx = cx + size * 0.4, handY = base - size * 0.52;
    // Kit, behind the figure.
    if (v === 0) {
      g.save(); g.translate(hx, base); g.rotate(sway);
      const sh = size * 1.12, bands = 9;
      for (let b = 0; b < bands; b++) { g.fillStyle = b % 2 ? C.plate(1) : C.acc(1); g.fillRect(-4.5 * u, -sh * ((b + 1) / bands), 9 * u, sh / bands + 0.5); }
      g.strokeStyle = C.ink(1); g.lineWidth = 2.4 * u; g.strokeRect(-4.5 * u, -sh, 9 * u, sh);
      tri(g, 0, -sh - 8 * u, 9 * u, C.ink(1));
      g.restore();
    } else if (v === 1) {
      // A tripod with a level on top, its scope slowly panning.
      const tx = cx + size * 0.52, ty = base - size * 0.72;
      g.strokeStyle = C.ink(1); g.lineWidth = 4 * u;
      g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx - size * 0.16, base); g.moveTo(tx, ty); g.lineTo(tx + size * 0.18, base); g.moveTo(tx, ty); g.lineTo(tx + size * 0.02, base); g.stroke();
      g.save(); g.translate(tx, ty - 10 * u); g.rotate(Math.sin(t * 0.7 + i) * 0.18);
      rr(g, -size * 0.13, -size * 0.06, size * 0.26, size * 0.1, 5 * u); g.fillStyle = C.idx(1); g.fill(); g.lineWidth = 2.6 * u; g.stroke();
      g.beginPath(); g.arc(size * 0.13, -size * 0.01, size * 0.035, 0, TAU); g.fillStyle = C.water(1); g.fill(); g.stroke();
      g.restore();
    } else if (v === 3) {
      // A plain walking pole with a pennant.
      g.save(); g.translate(hx, base); g.rotate(sway * 1.4 - 0.06);
      g.strokeStyle = C.idx(1); g.lineWidth = 6 * u; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -size * 1.02); g.stroke();
      g.beginPath(); g.moveTo(0, -size * 1.02); g.lineTo(size * 0.2, -size * 0.96 + Math.sin(t * 4 + i) * 4 * u); g.lineTo(0, -size * 0.88); g.closePath(); g.fillStyle = C.water(1); g.fill(); g.strokeStyle = C.ink(1); g.lineWidth = 2 * u; g.stroke();
      g.restore();
    }
    // Body: a field coat, cut a little differently for each.
    const coatW = v === 1 ? 0.62 : v === 3 ? 0.5 : 0.55;
    g.beginPath(); g.moveTo(cx - bw * coatW, base); g.lineTo(cx - bw * 0.42, top + size * 0.1); g.quadraticCurveTo(cx, top - size * 0.04, cx + bw * 0.42, top + size * 0.1); g.lineTo(cx + bw * coatW, base); g.closePath();
    g.fillStyle = color; g.fill(); g.strokeStyle = C.ink(1); g.lineWidth = 3.4 * u; g.stroke();
    g.lineWidth = 2.4 * u; g.beginPath();
    if (v === 0) { g.moveTo(cx - bw * 0.5, base - size * 0.3); g.lineTo(cx + bw * 0.5, base - size * 0.3); g.moveTo(cx - bw * 0.36, top + size * 0.1); g.lineTo(cx + bw * 0.34, base - size * 0.34); }
    else if (v === 1) { g.moveTo(cx, top + size * 0.06); g.lineTo(cx, base); rr(g, cx - bw * 0.4, base - size * 0.32, bw * 0.28, size * 0.12, 3 * u); rr(g, cx + bw * 0.12, base - size * 0.32, bw * 0.28, size * 0.12, 3 * u); }
    else if (v === 2) { for (let k = 0; k < 3; k++) { g.moveTo(cx - bw * 0.5, top + size * (0.26 + k * 0.08)); g.lineTo(cx + bw * 0.5, top + size * (0.26 + k * 0.08)); } }
    else { g.moveTo(cx - bw * 0.2, top + size * 0.08); g.lineTo(cx, top + size * 0.24); g.lineTo(cx + bw * 0.2, top + size * 0.08); g.moveTo(cx - bw * 0.52, base - size * 0.26); g.lineTo(cx + bw * 0.52, base - size * 0.26); }
    g.stroke();
    if (v === 0) { g.fillStyle = C.ink(1); for (let b = 0; b < 3; b++) { g.beginPath(); g.arc(cx + bw * 0.12, top + size * (0.2 + b * 0.1), 3.4 * u, 0, TAU); g.fill(); } }
    if (v === 2) { g.fillStyle = C.acc(hot ? 0 : 0.9); g.fillRect(cx - bw * 0.5, top + size * 0.13, bw, size * 0.05); }
    g.fillStyle = C.idx(1); g.beginPath(); g.ellipse(cx - bw * 0.22, base + 2 * u, bw * 0.22, 9 * u, 0, 0, TAU); g.ellipse(cx + bw * 0.22, base + 2 * u, bw * 0.22, 9 * u, 0, 0, TAU); g.fill();
    // Arms: each holds their own kit.
    const arm = (x0, y0, x1, y1) => { g.lineWidth = 7 * u; g.strokeStyle = color; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.lineWidth = 3 * u; g.strokeStyle = C.ink(1); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
    const sy0 = top + size * 0.14;
    if (v === 0 || v === 3) arm(cx + bw * 0.38, sy0, hx + Math.sin(sway) * size * 0.5, handY);
    if (v === 1) arm(cx + bw * 0.38, sy0, cx + size * 0.42, base - size * 0.66);
    if (v === 2) {
      // A clipboard held to the chest, pencil ticking.
      const kx = cx + bw * 0.05, ky = top + size * 0.3;
      g.save(); g.translate(kx, ky); g.rotate(-0.12);
      rr(g, -size * 0.13, -size * 0.12, size * 0.26, size * 0.32, 4 * u); g.fillStyle = C.plate(1); g.fill(); g.strokeStyle = C.ink(1); g.lineWidth = 2.6 * u; g.stroke();
      g.lineWidth = 1.6 * u; g.beginPath(); for (let k = 0; k < 4; k++) { g.moveTo(-size * 0.08, -size * 0.04 + k * size * 0.055); g.lineTo(size * 0.08, -size * 0.04 + k * size * 0.055); } g.stroke();
      g.fillStyle = C.ink(1); g.fillRect(-size * 0.05, -size * 0.14, size * 0.1, size * 0.04);
      const px = size * (0.02 + 0.06 * Math.sin(t * 5 + i));
      g.strokeStyle = C.acc(1); g.lineWidth = 4 * u; g.beginPath(); g.moveTo(px, size * 0.06); g.lineTo(px + size * 0.1, -size * 0.06); g.stroke();
      g.restore();
      arm(cx + bw * 0.4, sy0, kx + size * 0.08, ky + size * 0.04);
    }
    if (v === 3) {
      // Binoculars on a strap.
      g.fillStyle = C.ink(1); g.beginPath(); g.arc(cx - bw * 0.12, top + size * 0.3, size * 0.035, 0, TAU); g.arc(cx + bw * 0.08, top + size * 0.3, size * 0.035, 0, TAU); g.fill();
    }
    g.lineWidth = 3 * u; g.strokeStyle = C.ink(1);
    g.beginPath(); g.moveTo(cx - bw * 0.4, top + size * 0.15); g.quadraticCurveTo(cx - bw * 0.78, top + size * 0.3, cx - bw * 0.38, top + size * 0.42); g.stroke();
    // Head, hat, face.
    const hy = top - r * 0.9;
    g.beginPath(); g.arc(cx, hy, r, 0, TAU); g.fillStyle = C.plate(1); g.fill(); g.lineWidth = 3.4 * u; g.stroke();
    const hatC = hot ? C.acc(1) : [C.idx(1), C.water(1), C.acc(0.85), C.line(1)][v];
    g.fillStyle = hatC; g.lineWidth = 2.6 * u;
    if (v === 0) {
      g.beginPath(); g.ellipse(cx, hy - r * 0.55, r * 1.9, r * 0.42, 0, 0, TAU); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(cx - r * 1.0, hy - r * 0.7); g.quadraticCurveTo(cx, hy - r * 2.1, cx + r * 1.0, hy - r * 0.7); g.fill(); g.stroke();
    } else if (v === 1) {
      g.beginPath(); g.arc(cx, hy - r * 0.35, r * 1.02, Math.PI, 0); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(cx + r * 0.6, hy - r * 0.4); g.quadraticCurveTo(cx + r * 1.9, hy - r * 0.42, cx + r * 1.9, hy - r * 0.2); g.lineTo(cx + r * 0.6, hy - r * 0.25); g.closePath(); g.fill(); g.stroke();
    } else if (v === 2) {
      g.beginPath(); g.arc(cx, hy - r * 0.3, r * 1.04, Math.PI, 0); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = C.plate(1); rr(g, cx - r * 1.08, hy - r * 0.48, r * 2.16, r * 0.34, r * 0.1); g.fill(); g.stroke();
      g.beginPath(); g.arc(cx + Math.sin(t * 3 + i) * r * 0.15, hy - r * 1.45, r * 0.3, 0, TAU); g.fillStyle = hatC; g.fill(); g.stroke();
    } else {
      g.beginPath(); g.ellipse(cx, hy - r * 0.42, r * 1.55, r * 0.3, 0, 0, TAU); g.fill(); g.stroke();
      g.beginPath(); g.ellipse(cx, hy - r * 0.62, r * 1.05, r * 0.95, 0, Math.PI, TAU); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(cx - r * 1.0, hy - r * 0.7); g.lineTo(cx + r * 1.0, hy - r * 0.7); g.stroke();
    }
    g.fillStyle = C.ink(1); g.beginPath(); g.arc(cx - r * 0.36, hy + r * 0.05, r * 0.1, 0, TAU); g.arc(cx + r * 0.36, hy + r * 0.05, r * 0.1, 0, TAU); g.fill();
    g.lineWidth = 2.2 * u; g.beginPath(); g.arc(cx, hy + r * 0.18, r * 0.36, 0.2, Math.PI - 0.2); g.stroke();
    if (v === 1) { g.beginPath(); g.arc(cx - r * 0.36, hy + r * 0.05, r * 0.24, 0, TAU); g.arc(cx + r * 0.36, hy + r * 0.05, r * 0.24, 0, TAU); g.stroke(); }
    if (v === 3) { g.beginPath(); g.moveTo(cx - r * 0.5, hy + r * 0.45); g.quadraticCurveTo(cx, hy + r * 0.9, cx + r * 0.5, hy + r * 0.45); g.lineWidth = 3 * u; g.stroke(); }
    g.restore();
  }
  // Roles for figures beyond the supplied badges, never repeating a name already on the sheet.
  const EXTRA_ROLES = ["Producer", "Client", "Reviewer", "Colourist", "Sound", "Writer"];
  function rolesOf(badges, n) {
    const out = [], used = new Set();
    for (let i = 0; i < n; i++) {
      let r = badges[i];
      if (!r || used.has(String(r).toLowerCase())) r = EXTRA_ROLES.find((e) => !used.has(e.toLowerCase())) || "";
      used.add(String(r).toLowerCase()); out.push(r);
    }
    return out;
  }
  function people(g, S, box, p, d, info) {
    const { C } = begin(g, S, info), u = S.u, t = info.t;
    const n = Math.max(2, Math.min(6, Math.round(d.count))), roles = rolesOf(d.badges.filter(Boolean), n);
    const size = Math.min(box.h * 0.52, (box.w / n) * (box.h > box.w ? 1.5 : 1.1));
    const base = box.y + box.h * 0.86;
    patch(g, C, box.x - 30 * u, box.y - 10 * u, box.w + 60 * u, box.h + 20 * u, 0.62);
    // A traverse line joins the stations; its dashes march.
    g.save(); g.setLineDash([14 * u, 10 * u]); g.lineDashOffset = -t * 40 * u; g.strokeStyle = C.acc(0.95); g.lineWidth = 4 * u; g.lineCap = "round";
    const sx = (i) => box.x + (box.w / n) * (i + 0.5);
    g.beginPath(); g.moveTo(box.x - 20 * u, base + 4 * u);
    for (let i = 0; i < n; i++) g.lineTo(sx(i), base + 4 * u + Math.sin(i * 1.7) * 8 * u);
    g.lineTo(box.x + box.w * ease(p * 1.6 + 0.2) + 20 * u, base + 4 * u);
    g.save(); g.beginPath(); g.rect(box.x - 40 * u, 0, (box.w + 80 * u) * ease(p * 1.6 + 0.15), 4000); g.clip(); g.stroke(); g.restore();
    g.restore();
    for (let i = 0; i < n; i++) {
      const q = Math.max(0.18, ease((p - (i / n) * 0.5) / 0.5)), cx = sx(i), hot = i === Math.min(n - 1, d.highlight);
      // Mound: contour ellipses that swell outward continuously.
      g.save();
      const f = (t * 0.5 + i * 0.27) % 1;
      for (let k = 0; k < 6; k++) {
        const rad = (k + f) * size * 0.1 * (0.3 + 0.7 * q) + 14 * u, a = (1 - (k + f) / 6);
        g.beginPath(); g.ellipse(cx, base + 6 * u, rad * 1.7, rad * 0.46, 0, 0, TAU);
        if (k === 0 && f < 0.5) { g.fillStyle = hot ? C.acc(0.18) : C.line(0.12); g.fill(); }
        g.strokeStyle = hot ? C.acc(a) : C.idx(a * 0.85); g.lineWidth = (k % 3 === 0 ? 3 : 1.7) * u; g.stroke();
      }
      g.restore();
      const coats = [C.plate(1), `rgb(${C.T.ramp[1][1]})`, `rgb(${C.T.ramp[C.T.ramp.length - 1][1]})`, `rgb(${C.T.lakeHi})`];
      surveyor(g, C, cx, base, size * (hot ? 1.06 : 1), hot ? C.acc(1) : coats[i % 4], t, i, q, hot);
      const label = roles[i];
      if (q > 0.85 && label) {
        g.save();
        g.font = `700 ${44 * u}px ${SERIF}`; const tw = g.measureText(label).width;
        const bw = Math.max(170 * u, tw + 60 * u), bh = 76 * u, by = base - size * 1.12 - 120 * u + Math.sin(t * 1.6 + i) * 4 * u, bx = clamp(cx - bw / 2, box.x - 60 * u, box.x + box.w + 60 * u - bw);
        plate(g, C, bx, by, bw, bh);
        g.beginPath(); g.moveTo(cx - 12 * u, by + bh); g.lineTo(cx, by + bh + 20 * u); g.lineTo(cx + 12 * u, by + bh); g.fillStyle = C.plate(1); g.fill();
        g.strokeStyle = C.ink(0.92); g.lineWidth = 3 * u; g.beginPath(); g.moveTo(cx - 12 * u, by + bh); g.lineTo(cx, by + bh + 20 * u); g.lineTo(cx + 12 * u, by + bh); g.stroke();
        say(g, C, label, bx + bw / 2, by + bh / 2 + 2 * u, 44 * u, { align: "center", base: "middle", halo: false, weight: 700, color: hot ? C.acc(1) : C.inkHex, maxW: bw - 30 * u, min: 42 * u, font: "serif" });
        g.restore();
      }
    }
    g.restore();
  }

  // ---- process: a trail with waypoints -------------------------------------------------------------
  function spline(pts, per = 28) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[Math.max(i - 1, 0)], b = pts[i], c = pts[i + 1], e = pts[Math.min(i + 2, pts.length - 1)];
      for (let s = 0; s < per; s++) {
        const k = s / per, k2 = k * k, k3 = k2 * k;
        out.push([0.5 * (2 * b[0] + (-a[0] + c[0]) * k + (2 * a[0] - 5 * b[0] + 4 * c[0] - e[0]) * k2 + (-a[0] + 3 * b[0] - 3 * c[0] + e[0]) * k3),
          0.5 * (2 * b[1] + (-a[1] + c[1]) * k + (2 * a[1] - 5 * b[1] + 4 * c[1] - e[1]) * k2 + (-a[1] + 3 * b[1] - 3 * c[1] + e[1]) * k3)]);
      }
    }
    out.push(pts[pts.length - 1]);
    const len = [0];
    for (let i = 1; i < out.length; i++) len.push(len[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
    return { pts: out, len, total: len[len.length - 1], per };
  }
  function at(sp, L) {
    L = clamp(L, 0, sp.total);
    let i = 1; while (i < sp.len.length - 1 && sp.len[i] < L) i++;
    const k = (L - sp.len[i - 1]) / Math.max(1e-6, sp.len[i] - sp.len[i - 1]);
    return [lerp(sp.pts[i - 1][0], sp.pts[i][0], k), lerp(sp.pts[i - 1][1], sp.pts[i][1], k)];
  }
  function glyph(g, C, kind, cx, cy, s, color) {
    g.save(); g.strokeStyle = color; g.lineWidth = 5 * C.u; g.lineCap = "round"; g.lineJoin = "round"; g.beginPath();
    if (kind === 0) { g.moveTo(cx - s * 0.32, cy - s * 0.42); g.lineTo(cx + s * 0.1, cy - s * 0.42); g.lineTo(cx + s * 0.32, cy - s * 0.2); g.lineTo(cx + s * 0.32, cy + s * 0.42); g.lineTo(cx - s * 0.32, cy + s * 0.42); g.closePath(); g.moveTo(cx - s * 0.16, cy); g.lineTo(cx + s * 0.16, cy); g.moveTo(cx - s * 0.16, cy + s * 0.16); g.lineTo(cx + s * 0.08, cy + s * 0.16); }
    else if (kind === 1) { for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2; g.moveTo(cx + Math.cos(a) * s * 0.12, cy + Math.sin(a) * s * 0.12); g.lineTo(cx + Math.cos(a) * s * 0.44, cy + Math.sin(a) * s * 0.44); } for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + (k * Math.PI) / 2; g.moveTo(cx + Math.cos(a) * s * 0.14, cy + Math.sin(a) * s * 0.14); g.lineTo(cx + Math.cos(a) * s * 0.26, cy + Math.sin(a) * s * 0.26); } }
    else if (kind === 2) { g.moveTo(cx - s * 0.44, cy); g.quadraticCurveTo(cx, cy - s * 0.4, cx + s * 0.44, cy); g.quadraticCurveTo(cx, cy + s * 0.4, cx - s * 0.44, cy); g.moveTo(cx + s * 0.12, cy); g.arc(cx, cy, s * 0.12, 0, TAU); }
    else { g.moveTo(cx - s * 0.32, cy + s * 0.02); g.lineTo(cx - s * 0.08, cy + s * 0.26); g.lineTo(cx + s * 0.36, cy - s * 0.24); }
    g.stroke(); g.restore();
  }
  function process(g, S, box, p, d, info) {
    const { C } = begin(g, S, info), u = S.u, t = info.t;
    const n = d.steps.length, vertical = box.h > box.w;
    const pts = [];
    if (vertical) {
      pts.push([box.x + box.w * 0.1, box.y + 10 * u]);
      for (let i = 0; i < n; i++) pts.push([box.x + box.w * (i % 2 ? 0.7 : 0.3), box.y + (box.h * (i + 0.5)) / n]);
      pts.push([box.x + box.w * 0.9, box.y + box.h - 10 * u]);
    } else {
      pts.push([box.x - 10 * u, box.y + box.h * 0.36]);
      for (let i = 0; i < n; i++) pts.push([box.x + (box.w * (i + 0.5)) / n, box.y + box.h * (i % 2 ? 0.34 : 0.56)]);
      pts.push([box.x + box.w + 10 * u, box.y + box.h * 0.42]);
    }
    const sp = spline(pts), build = ease(p * 1.15 + 0.05);
    const drawn = sp.total * build;
    patch(g, C, box.x - 40 * u, box.y - 20 * u, box.w + 80 * u, box.h + 40 * u, 0.5);
    // The worn path under the dashes.
    const trace = (L) => { g.beginPath(); for (let i = 0; i < sp.pts.length && sp.len[i] <= L; i++) i ? g.lineTo(sp.pts[i][0], sp.pts[i][1]) : g.moveTo(sp.pts[i][0], sp.pts[i][1]); const e = at(sp, L); g.lineTo(e[0], e[1]); };
    g.save(); g.lineCap = "round"; g.lineJoin = "round";
    trace(drawn); g.strokeStyle = C.paper(0.9); g.lineWidth = 30 * u; g.stroke();
    trace(drawn); g.strokeStyle = C.ink(0.35); g.lineWidth = 3 * u; g.setLineDash([]); g.stroke();
    g.save(); trace(drawn); g.setLineDash([24 * u, 16 * u]); g.lineDashOffset = -t * 46 * u; g.strokeStyle = C.acc(1); g.lineWidth = 8 * u; g.lineCap = "butt"; g.stroke(); g.restore();
    g.restore();
    // Waypoints.
    for (let i = 0; i < n; i++) {
      const at0 = sp.len[(i + 1) * sp.per], q = ease((drawn - at0 + 60 * u) / (120 * u));
      if (q <= 0) continue;
      const [x, y] = sp.pts[(i + 1) * sp.per], r = (vertical ? 62 : 70) * u * (0.7 + 0.3 * q), last = i === n - 1;
      g.save(); g.globalAlpha *= clamp(q * 2);
      const f = (t * 0.6 + i * 0.33) % 1;
      g.beginPath(); g.arc(x, y, r + 8 * u + f * 46 * u, 0, TAU); g.strokeStyle = C.acc(0.7 * (1 - f)); g.lineWidth = 3 * u; g.stroke();
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = C.plate(1); g.fill(); g.strokeStyle = C.ink(0.95); g.lineWidth = 5 * u; g.stroke();
      g.beginPath(); g.arc(x, y, r - 10 * u, 0, TAU); g.strokeStyle = C.ink(0.6); g.lineWidth = 1.6 * u; g.stroke();
      glyph(g, C, last ? 3 : i % 3, x, y, r * 1.0, last ? C.acc(1) : C.inkHex);
      g.beginPath(); g.arc(x + r * 0.78, y - r * 0.78, 26 * u, 0, TAU); g.fillStyle = C.acc(1); g.fill(); g.lineWidth = 3.5 * u; g.strokeStyle = C.plate(1); g.stroke();
      say(g, C, String(i + 1), x + r * 0.78, y - r * 0.78 + 1 * u, 32 * u, { align: "center", base: "middle", halo: false, weight: 800, color: "#ffffff" });
      if (last) flag(g, C, x - r * 0.1, y - r - 4 * u, 84 * u, t, 2, C.acc(1));
      if (q > 0.7) {
        const ly = vertical ? y : y + r + 58 * u;
        const lx = vertical ? x + (i % 2 ? -r - 30 * u : r + 30 * u) : x;
        const al = vertical ? (i % 2 ? "right" : "left") : "center";
        say(g, C, d.steps[i], lx, vertical ? ly + 14 * u : ly, 48 * u, { align: al, weight: 700, font: "serif", color: C.inkHex, maxW: vertical ? box.w * 0.46 : (box.w / n) * 0.9, min: 42 * u, haloA: 0.96 });
      }
      g.restore();
    }
    // A surveyor walks the finished trail station to station, pausing at each; a field-book readout
    // in the open sheet above follows them.
    const ra = ease(span(build, 0.75, 1));
    if (ra > 0) {
      const stops = [0, ...d.steps.map((_, i) => sp.len[(i + 1) * sp.per]), sp.total];
      const seg = stops.length - 1, cyc = ((info.local - 1.9) * 0.3 + 10) % 1, sf = cyc * seg, si = Math.floor(sf), sk = sf - si;
      const mv = clamp(sk / 0.7), s = lerp(stops[si], stops[si + 1], inout(mv));
      const [hx, hy] = at(sp, s), moving = mv > 0 && mv < 1;
      g.save(); g.globalAlpha *= ra;
      for (let k = 6; k >= 1; k--) { const [ex, ey] = at(sp, s - k * 20 * u); g.beginPath(); g.arc(ex, ey, (10 - k) * u, 0, TAU); g.fillStyle = C.acc(0.32 - k * 0.04); g.fill(); }
      hiker(g, C, hx, hy - 4 * u, 96 * u, t, !moving);
      if (!vertical) {
        const done = clamp(s / sp.total), at0 = Math.min(n, Math.max(0, si + (mv >= 1 ? 1 : 0)));
        const pw2 = Math.min(560 * u, box.w * 0.4), ph2 = 150 * u, px = box.x + box.w - pw2, py = box.y - 30 * u;
        plate(g, C, px, py, pw2, ph2, { a: 0.95 });
        const elev = ST.hAt ? ((ST.hAt(hx, hy) - SEA) / DZ) * 40 : 0;
        say(g, C, "ELEV " + fmt(elev) + " M", px + 30 * u, py + 62 * u, 46 * u, { weight: 700, font: "serif", halo: false, color: C.inkHex, maxW: pw2 * 0.6 });
        say(g, C, at0 === 0 ? "SETTING OUT" : at0 >= n ? "ARRIVED" : "STN " + at0 + " / " + n, px + pw2 - 30 * u, py + 62 * u, 30 * u, { align: "right", weight: 700, halo: false, color: C.acc(1), track: 0.1, maxW: pw2 * 0.34 });
        const bx = px + 30 * u, by = py + 96 * u, bw = pw2 - 60 * u;
        g.fillStyle = C.line(0.22); g.fillRect(bx, by, bw, 14 * u);
        g.fillStyle = C.acc(1); g.fillRect(bx, by, bw * done, 14 * u);
        g.strokeStyle = C.ink(0.85); g.lineWidth = 2 * u; g.strokeRect(bx, by, bw, 14 * u);
        for (let i = 0; i < n; i++) { const tx = bx + bw * (stops[i + 1] / sp.total); g.beginPath(); g.moveTo(tx, by - 8 * u); g.lineTo(tx, by + 22 * u); g.stroke(); tri(g, tx, by - 14 * u, 7 * u, done * sp.total >= stops[i + 1] ? C.acc(1) : C.ink(0.6)); }
      }
      g.restore();
    }
    g.restore();
  }

  // ---- compare: two relief insets ------------------------------------------------------------------
  function relief(g, C, x, y, w, h, cx, cy, A, sx, sy, dz, t, phase, reveal = 1) {
    g.save(); rr(g, x, y, w, h, 8 * C.u); g.clip();
    const T = C.T, rp = T.ramp;
    g.fillStyle = `rgb(${rp[0][1]})`; g.fillRect(x, y, w, h);
    const rings = [];
    for (let k = 1; k * dz < A; k++) {
      const r = Math.sqrt(2 * Math.log(A / (k * dz)));
      rings.push([k, r]);
    }
    // Outer rings first, so each higher terrace is printed over the one below it.
    const nr = rings.length, ga = g.globalAlpha;
    for (let j = 0; j < nr; j++) {
      const [k, r] = rings[j], ra = clamp(reveal * nr - j);
      if (ra <= 0) break;
      g.globalAlpha = ga * ra;
      g.beginPath();
      for (let s = 0; s <= 72; s++) {
        const a = (s / 72) * TAU, wob = 1 + 0.07 * Math.sin(3 * a + t * 0.8 + k * 0.5 + phase) + 0.04 * Math.sin(5 * a - t * 0.6 + k);
        const px = cx + Math.cos(a) * r * sx * wob, py = cy + Math.sin(a) * r * sy * wob;
        s ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath();
      const ci = clamp(k / (nr + 1)), a1 = rp[Math.min(rp.length - 1, Math.floor(ci * rp.length))][1], a2 = rp[Math.min(rp.length - 1, Math.floor(ci * rp.length) + 1)][1];
      g.fillStyle = `rgb(${lerp(a1[0], a2[0], 0.5)},${lerp(a1[1], a2[1], 0.5)},${lerp(a1[2], a2[2], 0.5)})`; g.fill();
      g.strokeStyle = k % 5 === 0 ? C.idx(0.95) : C.line(0.85); g.lineWidth = (k % 5 === 0 ? 3.2 : 1.8) * C.u; g.stroke();
    }
    g.restore();
  }
  function compare(g, S, box, p, d, info) {
    const { C } = begin(g, S, info), u = S.u, t = info.t;
    const vertical = box.h > box.w * 1.1, gap = 36 * u;
    const cw = vertical ? box.w : (box.w - gap) / 2, ch = vertical ? (box.h - gap) / 2 : box.h * 0.9;
    const vmax = Math.max(d.leftValue, d.rightValue, 1);
    [[d.left, d.leftValue, 0], [d.right, d.rightValue, 1]].forEach(([label, value, i]) => {
      const q = ease((p - i * 0.2) / 0.5);
      const x = vertical ? box.x : box.x + i * (cw + gap), y = vertical ? box.y + i * (ch + gap) : box.y + (box.h - ch) / 2;
      // Even before it grows, the inset shows its frame and a faint hill.
      g.save(); g.globalAlpha *= clamp(0.5 + q * 3);
      plate(g, C, x, y, cw, ch);
      const ix = x + cw * (vertical ? 0.42 : 0.38), iy = y + 18 * u, iw = cw - (ix - x) - 18 * u, ih = ch - 36 * u;
      // Contour rings build ring by ring through the hold: many for the larger figure, few for the smaller.
      const nRing = Math.round(clamp(value * 1.8, 3, 18)), dz = 1 / (nRing + 0.5), rOut = Math.sqrt(2 * Math.log(nRing + 0.5));
      const hcx = ix + iw * 0.5, hcy = iy + ih * 0.55, ssx = (iw * 0.44) / rOut, ssy = (ih * 0.42) / rOut;
      const breathe = 1 + 0.025 * Math.sin(t * 0.9 + i * 2);
      relief(g, C, ix, iy, iw, ih, hcx, hcy, 1, ssx * breathe, ssy * breathe, dz, t, i * 1.7, Math.max(span(p, 0, 0.5) * 0.3, span(info.local / Math.max(0.1, info.hold), 0.08 + i * 0.1, 0.94)));
      // A dashed route on each island: the larger figure circles back on itself, the smaller walks straight up.
      const rq = ease(span(p, 0.35 + i * 0.1, 0.85));
      if (rq > 0) {
        const N = 90, pts = [];
        for (let s2 = 0; s2 <= N; s2++) {
          const k = s2 / N;
          if (i === 0) { const a = 2.3 + k * TAU * 2.4, rr0 = lerp(0.98, 0.36, k) * rOut; pts.push([hcx + Math.cos(a) * rr0 * ssx, hcy + Math.sin(a) * rr0 * ssy]); }
          else { const a0 = [ix + iw * 0.08, iy + ih * 0.94], c0 = [ix + iw * 0.2, iy + ih * 0.45]; pts.push([lerp(lerp(a0[0], c0[0], k), lerp(c0[0], hcx, k), k), lerp(lerp(a0[1], c0[1], k), lerp(c0[1], hcy, k), k)]); }
        }
        const upto = Math.floor(N * rq);
        g.save(); rr(g, ix, iy, iw, ih, 8 * u); g.clip();
        g.lineCap = "round"; g.beginPath(); for (let s2 = 0; s2 <= upto; s2++) s2 ? g.lineTo(pts[s2][0], pts[s2][1]) : g.moveTo(pts[s2][0], pts[s2][1]);
        g.strokeStyle = C.paper(0.85); g.lineWidth = 12 * u; g.stroke();
        g.setLineDash([16 * u, 11 * u]); g.lineDashOffset = -t * 30 * u; g.strokeStyle = i ? C.acc(1) : C.ink(0.85); g.lineWidth = 5 * u; g.stroke(); g.setLineDash([]);
        if (rq >= 1) {
          const wk = ((t * (i ? 0.22 : 0.12) + i * 0.3) % 1) * N, w0 = Math.floor(wk), wf = wk - w0, w1 = Math.min(N, w0 + 1);
          const wx = lerp(pts[w0][0], pts[w1][0], wf), wy = lerp(pts[w0][1], pts[w1][1], wf);
          g.beginPath(); g.arc(wx, wy, 11 * u, 0, TAU); g.fillStyle = i ? C.acc(1) : C.ink(0.9); g.fill(); g.lineWidth = 3.5 * u; g.strokeStyle = C.plate(1); g.stroke();
        }
        g.restore();
      }
      g.strokeStyle = C.ink(0.9); g.lineWidth = 3 * u; rr(g, ix, iy, iw, ih, 8 * u); g.stroke();
      // The summit mark.
      tri(g, hcx, hcy, 15 * u, i ? C.acc(1) : C.idx(1));
      if (i) flag(g, C, hcx + 6 * u, hcy - 6 * u, ih * 0.3, t, 0.4, C.acc(1));
      say(g, C, label, x + 34 * u, y + 76 * u, 46 * u, { weight: 700, font: "serif", color: i ? C.acc(1) : C.inkHex, maxW: (ix - x) - 50 * u, min: 38 * u, halo: false });
      say(g, C, M().formatNumber(value * q, 0, d.prefix, d.suffix), x + 30 * u, y + ch * 0.64, Math.min(150 * u, ch * 0.34), { font: "serif", weight: 700, color: i ? C.acc(1) : C.inkHex, maxW: (ix - x) - 44 * u, min: 96 * u, halo: false });
      // A measured bar under the figure.
      const mx = x + 32 * u, my = y + ch - 62 * u, mw = ix - x - 66 * u;
      rr(g, mx, my, mw, 20 * u, 10 * u); g.fillStyle = C.line(0.25); g.fill();
      rr(g, mx, my, Math.max(20 * u, mw * (value / vmax) * q), 20 * u, 10 * u); g.fillStyle = i ? C.acc(1) : C.idx(0.85); g.fill();
      g.strokeStyle = C.ink(0.8); g.lineWidth = 2 * u; rr(g, mx, my, mw, 20 * u, 10 * u); g.stroke();
      g.save(); g.setLineDash([8 * u, 8 * u]); g.lineDashOffset = -t * 30 * u; g.strokeStyle = i ? C.acc(0.8) : C.ink(0.5); g.lineWidth = 2.4 * u; rr(g, x + 7 * u, y + 7 * u, cw - 14 * u, ch - 14 * u, 6 * u); g.stroke(); g.restore();
      g.restore();
    });
    // The change between them, as a chip.
    const delta = Math.round(((d.rightValue - d.leftValue) / Math.max(1, d.leftValue)) * 100);
    const k = ease((p - 0.6) / 0.3);
    if (k > 0) {
      const cx = vertical ? box.x + box.w / 2 : box.x + box.w / 2, cy = vertical ? box.y + ch + gap / 2 : box.y + (box.h - ch) / 2 - 40 * u;
      g.save(); g.translate(cx, cy + Math.sin(t * 2) * 3 * u); g.scale(0.7 + 0.3 * k, 0.7 + 0.3 * k); g.globalAlpha *= k;
      const label = (delta > 0 ? "+" : "−") + Math.abs(delta) + "%";
      g.font = `800 ${56 * u}px ${SANS}`; const cw2 = g.measureText(label).width + 56 * u;
      rr(g, -cw2 / 2, -48 * u, cw2, 96 * u, 48 * u); g.fillStyle = C.acc(1); g.shadowColor = "rgba(40,24,10,0.35)"; g.shadowBlur = 18 * u; g.shadowOffsetY = 8 * u; g.fill(); g.shadowColor = "transparent";
      g.lineWidth = 4 * u; g.strokeStyle = C.plate(1); g.stroke();
      say(g, C, label, 0, 3 * u, 56 * u, { align: "center", base: "middle", halo: false, weight: 800, color: "#ffffff" });
      g.restore();
    }
    g.restore();
  }

  // ---- the look ------------------------------------------------------------------------------------
  const base = TONES.original;
  return {
    bg: base.paper, panel: "rgba(255,250,236,0.6)", ink: "#3a2616", muted: "#7a6144", accent: "#d8432b", onAccent: "#ffffff",
    rule: "rgba(58,38,24,0.8)", track: "rgba(58,38,24,0.12)",
    display: SERIF, displayWeight: 700, displayCase: "uppercase", displayTracking: "0.05em",
    body: SANS, bodyWeight: 600, figures: SERIF, radius: 8,
    motion: "wipe", change: "grid", kit: { line: 3, fill: "solid", panel: "fill", dims: false },
    panelEdge: "rgba(58,38,24,0.8)",
    tone: TONES.original,
    keepArt: true, overlap: true,
    palettes: {
      light: { bg: TONES.light.paper, ink: "#1c3440", muted: "#4c6b78", accent: "#e2552f", rule: "rgba(28,52,64,0.8)", track: "rgba(28,52,64,0.1)", panelEdge: "rgba(28,52,64,0.8)", tone: TONES.light, textShadow: halo(TONES.light.paper, "28,52,64"), backdrop: () => TONES.light.paper },
      dark: { bg: TONES.dark.paper, panel: "rgba(22,48,43,0.7)", ink: "#e8f4ea", muted: "#9fc7b2", accent: "#ffb347", onAccent: "#10201d", rule: "rgba(216,238,224,0.8)", track: "rgba(216,238,224,0.12)", panelEdge: "rgba(216,238,224,0.8)", tone: TONES.dark, textShadow: halo(TONES.dark.paper, "216,238,224"), backdrop: () => TONES.dark.paper },
      mono: { bg: TONES.mono.paper, ink: "#2a2a28", muted: "#6a6a66", accent: "#2a2a28", rule: "rgba(42,42,40,0.8)", track: "rgba(42,42,40,0.1)", panelEdge: "rgba(42,42,40,0.8)", tone: TONES.mono, textShadow: halo(TONES.mono.paper, "42,42,40"), backdrop: () => TONES.mono.paper },
    },
    textShadow: halo(base.paper, "58,38,24"),
    backdrop: () => base.paper,
    css: (accent) => `.kicker{font-family:${SANS};font-weight:800;letter-spacing:.32em;align-self:flex-start;padding-bottom:10px;border-bottom:4px double ${accent};}`,
    // The paper: fibres, a fold and a soft edge burn, laid over the whole frame.
    paint(ctx, W, H, t, accent, look) {
      ctx.clearRect(0, 0, W, H);
      if (!paint.tile || paint.key !== W + "x" + H) {
        const r = rng(5), tile = document.createElement("canvas"); tile.width = tile.height = 300;
        const g = tile.getContext("2d");
        for (let i = 0; i < 2600; i++) { g.fillStyle = r() < 0.5 ? "rgba(70,48,24,0.07)" : "rgba(255,252,240,0.09)"; g.fillRect(r() * 300, r() * 300, 1 + r() * 1.6, 1 + r() * 1.6); }
        for (let i = 0; i < 260; i++) { g.strokeStyle = "rgba(90,64,34,0.07)"; g.lineWidth = 1; g.beginPath(); const x = r() * 300, y = r() * 300, a = r() * TAU; g.moveTo(x, y); g.lineTo(x + Math.cos(a) * (6 + r() * 14), y + Math.sin(a) * (6 + r() * 14)); g.stroke(); }
        paint.tile = tile; paint.key = W + "x" + H;
      }
      ctx.fillStyle = ctx.createPattern(paint.tile, "repeat"); ctx.fillRect(0, 0, W, H);
      const u = Math.min(W, H) / 1080;
      for (const [fx, fy, vert] of [[0.5, 0, true], [0, 0.34, false], [0, 0.68, false]]) {
        const grd = vert ? ctx.createLinearGradient(W * fx - 18 * u, 0, W * fx + 18 * u, 0) : ctx.createLinearGradient(0, H * fy - 14 * u, 0, H * fy + 14 * u);
        grd.addColorStop(0, "rgba(255,250,235,0)"); grd.addColorStop(0.45, "rgba(60,40,20,0.1)"); grd.addColorStop(0.55, "rgba(255,250,235,0.14)"); grd.addColorStop(1, "rgba(255,250,235,0)");
        ctx.fillStyle = grd; ctx.fillRect(vert ? W * fx - 18 * u : 0, vert ? 0 : H * fy - 14 * u, vert ? 36 * u : W, vert ? H : 28 * u);
      }
      const vg = ctx.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.4, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.62);
      vg.addColorStop(0, "rgba(60,36,10,0)"); vg.addColorStop(1, "rgba(60,36,10,0.22)");
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    },
    paintOver: true,
    stage,
    scenes: { chart, object, people, process, compare },
  };
  function paint() {}
});
