// ASCII: the whole frame is a monospace character grid. Every picture is built from glyphs: a drifting
// plasma and a scrolling floor grid fill the stage, a 3D ribbon or knot is splatted into the grid and
// shaded through a luminance ramp, rain streams fall at the margins, a sine ticker rides the bottom and
// a status frame ticks around the edge. Scenes are small programs in that grid: bars made of streaming
// bits, a laptop whose preview window spins a solid, shaded ellipsoid characters with their own faces,
// terminal windows joined by conveyor belts, and noise versus order. Numbers are drawn in a 5x7 bitmap
// font made of cells. Scene changes decrunch cell by cell (dissolve, sweep, iris, diagonal) through a
// band of random glyphs, and the outgoing scene tears before it goes. Original characters and icons.
// Frames are pure functions of time: seeded values only, no clocks.
window.DreamcutMotion.register("ascii", ({ hexA }) => {
  const TAU = Math.PI * 2, PI = Math.PI;
  const MONO = "'SF Mono','Menlo','Consolas','DejaVu Sans Mono','Liberation Mono','Courier New',monospace";
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const fract = (v) => v - Math.floor(v);
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const hash2 = (a, b) => hash(a * 57.13 + b * 131.7 + 0.5);
  const RAMP = " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
  const NOISE = "@#%&$0123456789<>/\\|=+*?";
  const DRAWABLE = { chart: 1, object: 1, people: 1, process: 1, compare: 1 };
  const gi = (s) => { const k = s.charCodeAt(0) - 32; return k >= 0 && k < 95 ? k : 31; };
  // glyph indexes beyond printable ASCII: shade blocks and a few solid shapes drawn as paths
  const G_SH1 = 95, G_SH2 = 96, G_SH3 = 97, G_BLK = 98, G_DOT = 99, G_UP = 100, G_RT = 101, G_DIA = 102, G_DN = 103, G_LT = 104, NG = 105;
  const rampG = (lum) => RAMP.charCodeAt(Math.min(RAMP.length - 1, Math.floor(clamp(lum) * RAMP.length))) - 32;
  const toneOf = (lum) => clamp(Math.round(lum * 7 + 0.3), 1, 7);

  // ---- colour --------------------------------------------------------------------------------------
  const rgbOf = (h) => { const n = parseInt(String(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  let THEME = null;
  function themeOf(S) {
    const T = S.look.tone, hues = T.hues.slice();
    hues[1] = S.accent;
    const key = [T.bg, ...hues].join(",");
    if (THEME && THEME.key === key) return THEME;
    return (THEME = { key, bg: rgbOf(T.bg), bgS: T.bg, hues: hues.map(rgbOf), glow: !!T.glow, light: !!T.light, tone: T });
  }
  function toneColor(th, hue, tn) {
    const k = tn === 0 ? 0.14 : 0.2 + 0.8 * Math.pow(tn / 7, 0.9);
    let c = mixc(th.bg, th.hues[hue], k);
    if (th.glow && tn >= 6) c = mixc(c, [255, 255, 255], tn === 7 ? 0.45 : 0.18);
    return rgba(c);
  }

  // ---- the grid ------------------------------------------------------------------------------------
  // ch 255 = nothing here (what is underneath shows); 0 = an opaque blank; otherwise a glyph index.
  function Grid(n) { this.ch = new Uint8Array(n).fill(255); this.hue = new Uint8Array(n); this.tn = new Uint8Array(n); }
  let FR = null;
  function layoutFor(S) {
    if (FR && FR.S === S) return FR;
    const g0 = document.createElement("canvas").getContext("2d");
    g0.font = `700 100px ${MONO}`;
    const adv = g0.measureText("M").width / 100 || 0.6;
    const ch = Math.max(10, Math.round(19 * S.u));
    const cw = Math.max(6, Math.round(ch * 0.58));
    const cols = Math.ceil(S.W / cw), rows = Math.ceil(S.H / ch);
    return (FR = { S, adv, ch, cw, fs: cw / adv, cols, rows, W: S.W, H: S.H, world: new Grid(cols * rows), sg: new Grid(cols * rows),
      zb: new Float32Array(cols * rows), sl: new Float32Array(cols * rows), sh: new Uint8Array(cols * rows), tear: new Int16Array(rows),
      ovl: [], strips: [], stripKey: "", att: new Float32Array(rows), info: null, th: null });
  }
  function strip(F, hue, tn) {
    const k = hue * 8 + tn;
    let s = F.strips[k];
    if (s) return s;
    const { cw, ch } = F;
    const cv = document.createElement("canvas");
    cv.width = NG * cw; cv.height = ch;
    const g = cv.getContext("2d");
    const col = toneColor(F.th, hue, tn);
    g.fillStyle = col; g.font = `700 ${F.fs}px ${MONO}`; g.textAlign = "center"; g.textBaseline = "middle";
    for (let i = 1; i < 95; i++) g.fillText(String.fromCharCode(32 + i), i * cw + cw / 2, ch / 2 + ch * 0.03);
    [0.2, 0.42, 0.68, 1].forEach((a, i) => { g.globalAlpha = a; g.fillRect((G_SH1 + i) * cw, 0, cw, ch); });
    g.globalAlpha = 1;
    const mx = (i) => i * cw + cw / 2, my = ch / 2, rr = Math.min(cw, ch) * 0.42;
    g.beginPath(); g.arc(mx(G_DOT), my, rr, 0, TAU); g.fill();
    const tri = (i, pts) => { g.beginPath(); pts.forEach(([x, y], j) => (j ? g.lineTo : g.moveTo).call(g, mx(i) + x * cw * 0.46, my + y * ch * 0.42)); g.closePath(); g.fill(); };
    tri(G_UP, [[0, -1], [1, 1], [-1, 1]]); tri(G_DN, [[0, 1], [1, -1], [-1, -1]]); tri(G_RT, [[1, 0], [-1, -1], [-1, 1]]); tri(G_LT, [[-1, 0], [1, -1], [1, 1]]);
    tri(G_DIA, [[0, -1], [1, 0], [0, 1], [-1, 0]]);
    return (F.strips[k] = cv);
  }

  // ---- 3D: surfaces splatted into the grid and shaded through the ramp ----------------------------
  const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const withNormal = (f) => (u, v, o) => {
    const e = 0.002, a = [0, 0, 0, 0, 0, 0], b = [0, 0, 0, 0, 0, 0], c = [0, 0, 0, 0, 0, 0];
    f(u, v, a); f(u + e, v, b); f(u, v + e, c);
    const du = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], dv = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = nrm([du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]]);
    o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; o[3] = n[0]; o[4] = n[1]; o[5] = n[2];
  };
  const SHAPES = {
    torus: { du: 6.3, dv: 2.5, bands: 8, f(u, v, o) { const a = u * TAU, b = v * TAU, R = 1, r = 0.4, cb = Math.cos(b), sb = Math.sin(b), ca = Math.cos(a), sa = Math.sin(a); o[0] = (R + r * cb) * ca; o[1] = (R + r * cb) * sa; o[2] = r * sb; o[3] = cb * ca; o[4] = cb * sa; o[5] = sb; } },
    sphere: { du: 6.3, dv: 3.2, bands: 10, f(u, v, o) { const a = u * TAU, b = (v - 0.5) * PI, cb = Math.cos(b); o[0] = o[3] = cb * Math.cos(a); o[1] = o[4] = cb * Math.sin(a); o[2] = o[5] = Math.sin(b); } },
    mobius: { du: 6.5, dv: 1.6, bands: 6, two: true, f: withNormal((u, v, o) => { const a = u * TAU, w = (v - 0.5) * 1.5, h = 1 + (w / 2) * Math.cos(a / 2); o[0] = h * Math.cos(a); o[1] = h * Math.sin(a); o[2] = (w / 2) * Math.sin(a / 2); }) },
    knot: { du: 9, dv: 1.5, bands: 14, f(u, v, o) {
      const K = (s) => { const a = s * TAU, r = 2 + Math.cos(3 * a); return [r * Math.cos(2 * a) * 0.38, r * Math.sin(2 * a) * 0.38, Math.sin(3 * a) * 0.38]; };
      const p = K(u), q = K(u + 0.002), T = nrm([q[0] - p[0], q[1] - p[1], q[2] - p[2]]);
      const n1 = nrm([T[1], -T[0], 0.0001]), n2 = [T[1] * n1[2] - T[2] * n1[1], T[2] * n1[0] - T[0] * n1[2], T[0] * n1[1] - T[1] * n1[0]];
      const b = v * TAU, cb = Math.cos(b) * 0.2, sb = Math.sin(b) * 0.2;
      o[0] = p[0] + cb * n1[0] + sb * n2[0]; o[1] = p[1] + cb * n1[1] + sb * n2[1]; o[2] = p[2] + cb * n1[2] + sb * n2[2];
      const n = nrm([cb * n1[0] + sb * n2[0], cb * n1[1] + sb * n2[1], cb * n1[2] + sb * n2[2]]); o[3] = n[0]; o[4] = n[1]; o[5] = n[2];
    } },
    cube: { du: 6.3, dv: 3.2, bands: 4, f: withNormal((u, v, o) => { const a = u * TAU, b = (v - 0.5) * PI, e = 0.22, sp = (x) => Math.sign(x) * Math.pow(Math.abs(x), e); const cb = sp(Math.cos(b)); o[0] = cb * sp(Math.cos(a)) * 0.82; o[1] = cb * sp(Math.sin(a)) * 0.82; o[2] = sp(Math.sin(b)) * 0.82; }) },
  };
  const LIGHT = nrm([-0.4, 0.6, 0.7]), HALF = nrm([-0.4, 0.6, 1.7]);
  // o: cx, cy, sc (px), ax, ay, az, lmax, att, hueA, hueB, clip [c0, r0, c1, r1], spin
  function splat(F, emit, shp, o) {
    const { cw, ch, cols, rows, zb, sl, sh } = F;
    zb.fill(1e9);
    const nu = Math.min(330, Math.max(12, Math.ceil((shp.du * o.sc) / (cw * 0.8)))), nv = Math.min(190, Math.max(8, Math.ceil((shp.dv * o.sc) / (cw * 0.8))));
    const ca = Math.cos(o.ax), sa = Math.sin(o.ax), cb = Math.cos(o.ay), sb = Math.sin(o.ay), cc = Math.cos(o.az), sc2 = Math.sin(o.az);
    const rot = (x, y, z) => {
      let y1 = y * ca - z * sa, z1 = y * sa + z * ca;
      let x2 = x * cb + z1 * sb, z2 = -x * sb + z1 * cb;
      return [x2 * cc - y1 * sc2, x2 * sc2 + y1 * cc, z2];
    };
    const [c0, r0, c1, r1] = o.clip || [0, 0, cols - 1, rows - 1];
    const buf = [0, 0, 0, 0, 0, 0], dist = 3.4;
    const two = !!shp.two, bands = shp.bands || 6;
    for (let i = 0; i < nu; i++) {
      const u = i / nu;
      for (let j = 0; j < nv; j++) {
        shp.f(u, j / nv, buf);
        const p = rot(buf[0], buf[1], buf[2]);
        const zc = p[2] + dist, f = dist / zc;
        const c = Math.floor((o.cx + p[0] * f * o.sc) / cw), r = Math.floor((o.cy - p[1] * f * o.sc) / ch);
        if (c < c0 || c > c1 || r < r0 || r > r1) continue;
        const k = r * cols + c;
        if (zc >= zb[k]) continue;
        const n = rot(buf[3], buf[4], buf[5]);
        let d = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2];
        let hh = n[0] * HALF[0] + n[1] * HALF[1] + n[2] * HALF[2];
        if (two) { d = Math.abs(d); hh = Math.abs(hh); }
        zb[k] = zc;
        sl[k] = clamp(0.1 + 0.78 * Math.max(0, d) + 0.55 * Math.pow(Math.max(0, hh), 22));
        sh[k] = Math.floor(u * bands) % 2;
      }
    }
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const k = r * cols + c;
      if (zb[k] >= 1e9) continue;
      const lum = clamp(Math.pow(sl[k], 0.85) * o.lmax) * (o.att ? o.att[r] : 1);
      if (lum < 0.05) continue;
      emit(c, r, rampG(lum), sh[k] ? o.hueB : o.hueA, toneOf(lum));
    }
  }

  // ---- bitmap digits made of cells -----------------------------------------------------------------
  const F57 = {
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"], "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"], "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"], "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
    "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"], "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"], "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
    ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"], ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
    "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"], "$": ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
    "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"], "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
    "x": ["00000", "10001", "01010", "00100", "01010", "10001", "00000"], "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"], "s": ["00000", "01111", "10000", "01110", "00001", "11110", "00000"],
  };
  const digitsWidth = (s, sx) => String(s).length * (5 * sx + sx);

  // ---- per-frame drawing surface for a scene -------------------------------------------------------
  const transType = (T0) => Math.floor(hash(Math.round(T0 * 20) + 3.1) * 4) % 4;
  function maskVal(F, type, c, r) {
    switch (type) {
      case 0: return hash2(c, r);
      case 1: return (c / F.cols) * 0.82 + hash(r * 3.1) * 0.18;
      case 2: return Math.min(1, Math.hypot((c - F.cols / 2) * F.cw, (r - F.rows / 2) * F.ch) / (Math.hypot(F.W, F.H) / 2)) * 0.86 + hash2(c, r) * 0.14;
      default: return ((c * F.cw) / F.W * 0.5 + (r * F.ch) / F.H * 0.5) * 0.86 + hash2(c, r) * 0.14;
    }
  }
  function gate(F, info, out) {
    const k = out ? clamp(info.exit) : clamp(info.local / Math.max(0.01, info.change));
    if (out ? k <= 0 : k >= 1) return () => 1;
    const T0 = out ? info.t - (info.local - info.hold) : info.t - info.local;
    const type = transType(T0), edge = k * 1.2;
    return (c, r) => {
      const m = maskVal(F, type, c, r);
      if (out) return m < edge - 0.12 ? 0 : m < edge ? 2 : 1;
      return m > edge ? 0 : m > edge - 0.12 ? 2 : 1;
    };
  }

  function makeApi(F, vis, info) {
    const { cols, rows, cw, ch } = F, g = F.sg, T = info.t, tex = F.S.look.texture ?? 1;
    const frameStep = Math.floor(T * 24);
    const cell = (c, r, chi, hue, tn) => {
      c = Math.round(c); r = Math.round(r);
      if (c < 0 || r < 0 || c >= cols || r >= rows) return;
      const v = vis(c, r);
      if (!v) return;
      const i = r * cols + c;
      if (v === 2) {
        if (chi === 255) return;
        g.ch[i] = chi === 0 ? 0 : RAMP.length ? NOISE.charCodeAt(Math.floor(hash2(c * 7 + frameStep, r) * NOISE.length)) - 32 : 0;
        g.hue[i] = 0; g.tn[i] = 7; return;
      }
      g.ch[i] = chi; g.hue[i] = hue; g.tn[i] = tn;
    };
    const A = {
      cell, T, tex, F,
      str(c, r, s, hue, tn) { s = String(s); for (let i = 0; i < s.length; i++) { if (s[i] !== " ") cell(c + i, r, gi(s[i]), hue, tn); else cell(c + i, r, 0, hue, tn); } },
      strC(c, r, s, hue, tn) { A.str(c - Math.floor(String(s).length / 2), r, s, hue, tn); },
      fill(c0, r0, c1, r1) { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cell(c, r, 0, 0, 0); },
      block(c0, r0, c1, r1, chi, hue, tn) { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cell(c, r, chi, hue, tn); },
      win(c0, r0, c1, r1, title, hue, tn, fill = true) {
        if (fill) A.fill(c0, r0, c1, r1);
        for (let c = c0; c <= c1; c++) {
          const lit = (c - Math.floor(T * 14)) % 16 === 0 ? 7 : tn;
          cell(c, r0, gi("-"), hue, lit); cell(c, r1, gi("-"), hue, (c + Math.floor(T * 14)) % 16 === 0 ? 7 : tn);
        }
        for (let r = r0; r <= r1; r++) { cell(c0, r, gi("|"), hue, tn); cell(c1, r, gi("|"), hue, tn); }
        for (const [c, r] of [[c0, r0], [c1, r0], [c0, r1], [c1, r1]]) cell(c, r, gi("+"), hue, 7);
        if (title) A.str(c0 + 2, r0, "[ " + title + " ]", hue, Math.min(7, tn + 3));
      },
      line(c0, r0, c1, r1, hue, tn, upTo = 1, glyph) {
        const dxp = (c1 - c0) * cw, dyp = (r1 - r0) * ch, n = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0), 1);
        let chr = "-";
        if (Math.abs(dyp) > Math.abs(dxp) * 2.4) chr = "|"; else if (Math.abs(dxp) > Math.abs(dyp) * 2.4) chr = "-"; else chr = dxp * dyp > 0 ? "\\" : "/";
        const m = Math.floor(n * clamp(upTo));
        for (let i = 0; i <= m; i++) cell(c0 + ((c1 - c0) * i) / n, r0 + ((r1 - r0) * i) / n, glyph ?? gi(chr), hue, tn);
      },
      ring(cc, cr, rpx, hue, tn, glyph = G_DOT, upTo = 1) {
        const n = Math.max(12, Math.ceil((TAU * rpx) / (cw * 0.8))), m = Math.floor(n * clamp(upTo));
        for (let i = 0; i < m; i++) { const a = (i / n) * TAU; cell(cc + (Math.cos(a) * rpx) / cw, cr + (Math.sin(a) * rpx) / ch, glyph, hue, tn); }
      },
      // Key numbers: solid block cells with a glyph drop shade, on a dark plate so they read over anything.
      digits(s, c, r, sx, sy, hue, shimmer = true) {
        s = String(s);
        const wd = digitsWidth(s, sx) - sx, hgt = 7 * sy;
        A.fill(c - sx, r - 1, c + wd + sx, r + hgt + 1);
        const lit = (x, y) => { const k = Math.floor(x / (6 * sx)), gl = F57[s[k]]; if (!gl) return false; const px = Math.floor((x - k * 6 * sx) / sx), py = Math.floor(y / sy); return px < 5 && py >= 0 && py < 7 && gl[py][px] === "1"; };
        const sweep = Math.floor(T * 14) % (wd + hgt + 24) - 12;
        for (let y = 0; y <= hgt; y++) for (let x = 0; x <= wd; x++) {
          const on = x < wd && y < hgt && lit(x, y);
          if (on) {
            const hot = shimmer && Math.abs(x + y - sweep) < 2;
            const edgeTop = y === 0 || !lit(x, y - 1);
            cell(c + x, r + y, hot ? gi("@") : edgeTop && sy > 1 ? G_SH3 : G_BLK, hot ? 0 : hue, 7);
          } else if (x > 0 && y > 0 && lit(x - 1, y - 1)) cell(c + x, r + y, gi(":"), hue, 3);
        }
        return wd + sx;
      },
      // Large type drawn over the grid. reveal 0..1 types it on with a block cursor.
      big(text, x, y, size, hue, align = "left", reveal = 1) {
        text = String(text);
        const n = Math.ceil(text.length * clamp(reveal));
        if (n <= 0) return;
        const w = text.length * size * F.adv;
        const x0 = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
        const c = Math.floor(x0 / cw), r = Math.floor(y / ch);
        if (vis(c, r) !== 1 || vis(Math.floor((x0 + w) / cw), r) !== 1) return;
        F.ovl.push({ text: text.slice(0, n), x: x0, y, size, hue, cursor: reveal < 1 ? x0 + n * size * F.adv : -1 });
      },
    };
    return A;
  }

  // ---- the stage: plasma, floor, rain, 3D hero, HUD and ticker -------------------------------------
  const THEMES = [[3, 2], [2, 1], [3, 4], [1, 3], [4, 2]];
  const HEROES = ["mobius", "torus", "knot", "sphere", "cube"];
  const isTitle = (id) => id === "title" || id === "closing" || !id;
  const lerp = (a, b, k) => a + (b - a) * k;
  function heroFor(S, id, idx, t) {
    const { W, H } = S;
    const name = id === "title" ? "mobius" : id === "closing" ? "knot" : HEROES[(idx + 1) % 5];
    let cx = W * (0.5 + 0.34 * Math.sin(t * 0.23 + idx)), cy = H * (0.52 + 0.16 * Math.cos(t * 0.17 + idx)), sc = H * 0.3;
    if (id === "title") { cx = W * (S.tall ? 0.5 : 0.7) + Math.sin(t * 0.5) * W * 0.02; cy = H * (S.tall ? 0.72 : 0.5); sc = H * (S.tall ? 0.3 : 0.5); }
    if (id === "closing") { cx = W * (S.tall ? 0.5 : 0.7); cy = H * (S.tall ? 0.72 : 0.52); sc = H * (S.tall ? 0.24 : 0.36); }
    return { name, cx, cy, sc, lmax: isTitle(id) ? 1.2 : 0.55, title: isTitle(id) };
  }
  function stage(ctx, S, info) {
    const F = layoutFor(S);
    F.th = themeOf(S);
    const key = F.th.key + "|" + F.cw;
    if (F.stripKey !== key) { F.strips = []; F.stripKey = key; }
    F.info = info; F.ctx = ctx; F.ovl.length = 0; F.box = null; F.boxDim = 0; F.composed = false;
    F.world.ch.fill(255); F.sg.ch.fill(255);
    const { cols, rows, cw, ch, W, H, world: g, th } = F;
    const t = info.t, u = S.u, tex = S.look.texture ?? 1, footage = !S.paint;
    const idx = Math.max(0, info.index), id = info.scene;
    const title = isTitle(id);
    const k = info.index > 0 && info.local < info.change ? clamp(info.local / Math.max(0.01, info.change)) : 1;
    const type = transType(t - info.local);
    // the last `change` seconds of a scene hand the world over to the next one
    const kOut = info.next && info.local > info.hold - info.change ? clamp((info.local - (info.hold - info.change)) / Math.max(0.01, info.change)) : 0;
    const nextType = transType(t - info.local + info.hold);
    const w = lerp(title ? 1 : 0, info.next ? (isTitle(info.next) ? 1 : 0) : (title ? 1 : 0), eio(kOut));
    const A = THEMES[idx % 5], P = THEMES[(idx + 4) % 5];
    const pairAt = (c, r) => (k >= 1 || maskVal(F, type, c, r) < k ? A : P);
    // Keep the headline readable: the world dims behind it.
    const bT = S.tall ? [0.26, 0.74] : [0.2, 0.8], bD = S.tall ? [0.06, 0.27] : [0.04, 0.3];
    const band = [lerp(bD[0], bT[0], w), lerp(bD[1], bT[1], w)];
    const strength = lerp(0.62, 0.55, w);
    for (let r = 0; r < rows; r++) {
      const y = (r * ch) / H, e = 0.05;
      const inside = eio(seg(y, band[0] - e, band[0] + e)) * (1 - eio(seg(y, band[1] - e, band[1] + e)));
      F.att[r] = 1 - strength * inside;
    }
    const put = (c, r, chi, hue, tn) => { if (c < 0 || r < 0 || c >= cols || r >= rows) return; const i = r * cols + c; g.ch[i] = chi; g.hue[i] = hue; g.tn[i] = tn; };
    const str = (c, r, s, hue, tn) => { for (let i = 0; i < s.length; i++) if (s[i] !== " ") put(c + i, r, gi(s[i]), hue, tn); };
    const fstep = Math.floor(t * 24);
    const noiseG = (c, r) => NOISE.charCodeAt(Math.floor(hash2(c * 7 + fstep, r) * NOISE.length)) - 32;
    // plasma: quiet behind content, brighter on title cards
    const plum = lerp(0.36, 0.5, w);
    if (!footage) {
      for (let r = 0; r < rows; r++) {
        const py = (r * ch) / u;
        for (let c = 0; c < cols; c++) {
          const px = (c * cw) / u;
          let v = Math.sin(px * 0.011 + t * 0.7) + Math.sin(py * 0.017 - t * 0.5) + Math.sin((px + py) * 0.007 + t * 0.4)
            + Math.sin(Math.hypot(px - 960 - 420 * Math.sin(t * 0.2), py - 540 - 260 * Math.cos(t * 0.27)) * 0.012 - t * 1.2);
          v = v * 0.25 + 0.5;
          const lum = Math.pow(v, 2.7) * plum * F.att[r];
          if (lum < 0.05) continue;
          const pair = pairAt(c, r);
          put(c, r, rampG(lum), v > 0.64 ? pair[1] : pair[0], toneOf(lum * 0.95));
        }
      }
      // perspective floor
      const rH = Math.round(rows * lerp(0.76, 0.8, w));
      for (let r = rH + 1; r < rows; r++) {
        const y = r - rH, depth = y / (rows - rH);
        const hl = fract(7 / y + t * 0.75) < 0.13;
        for (let c = 0; c < cols; c++) {
          const x = (c - cols / 2) / y * 0.8;
          const vl = Math.abs(fract(x) - 0.5) > 0.455;
          if (!hl && !vl) continue;
          const lum = (0.14 + 0.3 * depth) * lerp(0.6, 0.9, w);
          put(c, r, hl && vl ? gi("+") : hl ? gi("=") : gi(c < cols / 2 - 3 ? "/" : c > cols / 2 + 3 ? "\\" : "|"), pairAt(c, r)[0], toneOf(lum));
        }
      }
    }
    // data rain
    const streams = Math.floor(cols * (footage ? 0.12 : 0.26) * (0.4 + 0.6 * tex + 0.0001));
    const rainK = lerp(0.5, 1, w);
    for (let s = 0; s < streams; s++) {
      const c = Math.floor(hash(s * 3.7) * cols), sp = 5 + hash(s * 1.9) * 9, len = 6 + Math.floor(hash(s * 5.3) * 16);
      const head = ((t * sp + hash(s * 8.1) * (rows + len * 2)) % (rows + len * 2)) - len;
      for (let q = 0; q < len; q++) {
        const r = Math.floor(head - q);
        if (r < 0 || r >= rows) continue;
        const f = 1 - q / len, att = F.att[r];
        const chr = q === 0 ? gi("@") : gi("01{}[]<>/=+*#:".charAt(Math.floor(hash2(c, r + Math.floor(t * (6 + sp * 0.4))) * 14)));
        if (q === 0 && att > 0.5) put(c, r, chr, w > 0.5 ? 0 : pairAt(c, r)[0], w > 0.5 ? 7 : 5); else if (f * att * rainK > 0.14) put(c, r, chr, pairAt(c, r)[0], toneOf(f * att * 0.8 * rainK));
      }
    }
    // 3D hero; on the way out it decrunches into the next scene's hero through a band of random glyphs
    const edge = kOut * 1.2, bandW = 0.2;
    const drawHero = (hr, which) => {
      if (footage && !hr.title) return;
      splat(F, (c, r, chi, hue, tn) => {
        if (kOut > 0) {
          const m = maskVal(F, nextType, c, r);
          if (which === 0) { if (m < edge - bandW) return; if (m < edge) return put(c, r, noiseG(c, r), hue, Math.min(7, tn + 1)); }
          else { if (m >= edge) return; if (m >= edge - bandW) return put(c, r, noiseG(c, r), hue, Math.min(7, tn + 1)); }
        }
        put(c, r, chi, hue, tn);
      }, SHAPES[hr.name], { cx: hr.cx, cy: hr.cy, sc: hr.sc, ax: 0.7 + t * 0.31, ay: t * 0.43 + hr.idx, az: 0.3 + t * 0.17, lmax: hr.lmax, att: F.att, hueA: hr.pair[0], hueB: hr.pair[1] });
    };
    const cur = heroFor(S, id, idx, t); cur.idx = idx; cur.pair = A;
    drawHero(cur, 0);
    if (kOut > 0) { const nx = heroFor(S, info.next, idx + 1, t); nx.idx = idx + 1; nx.pair = THEMES[(idx + 1) % 5]; drawHero(nx, 1); }
    // closing: char fireworks; title: twinkles
    if (id === "closing" || id === "title") {
      const nb = id === "closing" ? 5 : 3;
      for (let b = 0; b < nb; b++) {
        const per = 2.1 + b * 0.17, ph = (t + b * 0.83) / per, n = Math.floor(ph), f = fract(ph);
        const bx = (0.14 + 0.72 * hash(n * 7.3 + b * 3.1)) * cols, by = (0.18 + 0.5 * hash(n * 3.7 + b * 5.9)) * rows;
        const rad = eo(f) * (14 + 10 * hash(b + n)), life = 1 - f;
        for (let a = 0; a < 26; a++) {
          const ang = (a / 26) * TAU + b, rr = rad * (0.7 + 0.3 * hash(a + b * 9));
          const c = Math.round(bx + Math.cos(ang) * rr * 1.5), r = Math.round(by + Math.sin(ang) * rr * 0.75 + f * f * 5);
          if (r < rows && r >= 0 && c >= 0 && c < cols && F.att[r] > 0.5) put(c, r, gi(f < 0.5 ? "*" : f < 0.8 ? "+" : "."), [1, 2, 3, 4, 0][b % 5], toneOf(life + 0.2));
        }
      }
    }
    // border frame, marching highlight and corner readouts
    const per = 2 * (cols + rows);
    const mar = (t * 22) % per;
    for (let c = 0; c < cols; c++) { put(c, 0, gi("="), pairAt(c, 0)[0], Math.abs(((c - mar + per * 2) % per)) < 10 ? 7 : 3); put(c, rows - 1, gi("="), pairAt(c, rows - 1)[0], Math.abs(((cols * 1 + rows + (cols - 1 - c) - mar + per * 2) % per)) < 10 ? 7 : 3); }
    for (let r = 0; r < rows; r++) { put(0, r, gi("|"), pairAt(0, r)[0], Math.abs(((cols + r - mar + per * 2) % per)) < 10 ? 7 : 3); put(cols - 1, r, gi("|"), pairAt(cols - 1, r)[0], Math.abs(((2 * cols + rows + (rows - 1 - r) - mar + per * 2) % per)) < 10 ? 7 : 3); }
    const pct = clamp(t / Math.max(0.01, info.length));
    const bar = Math.round(pct * 20);
    str(3, 0, "[ DREAMCUT/ASCII ]", 1, 7);
    str(cols - 30, 0, `[ SCN:${(id || "end").toUpperCase().padEnd(7, " ")} T+${t.toFixed(2).padStart(5, "0")} ]`, 3, 6);
    str(3, rows - 1, `[${"#".repeat(bar)}${"-".repeat(20 - bar)}] ${String(Math.round(pct * 100)).padStart(3, "0")}%`, 4, 6);
    str(cols - 17, rows - 1, `[ F:${Math.floor(t * 30).toString(16).toUpperCase().padStart(4, "0")}h ]`, 2, 6);
    // signal band: two interleaved sine traces drawn in glyph weights, no words to half-read
    const base = rows - 4, WAVE = "_.-~=+*#";
    for (let c = 1; c < cols - 1; c++) {
      for (let tr = 0; tr < 2; tr++) {
        const ph = c * (tr ? 0.13 : 0.21) + t * (tr ? -2.1 : 3.2) + tr * 1.7;
        const r = Math.round(base + Math.sin(ph) * (tr ? 1.6 : 1.2) + (tr ? 0.5 : -0.5));
        const amp = 0.5 + 0.5 * Math.sin(c * 0.05 - t * 1.4 + tr * 2);
        const pulse = Math.abs(((c - t * 26 * (tr ? -1 : 1)) % 48 + 48) % 48 - 24) < 2;
        if (amp < 0.18 && !pulse) continue;
        put(c, r, gi(pulse ? "@" : WAVE[Math.min(7, Math.floor(amp * 8))]), pulse ? 0 : tr ? 3 : 1, pulse ? 7 : toneOf(0.3 + amp * 0.5));
      }
    }
    // glitch tear on the leaving scene and the arriving one
    const tearK = kOut;
    const gl = Math.max(tearK, info.index > 0 ? (1 - k) * 0.5 : 0) * tex;
    const stp = Math.floor(t * 18);
    for (let r = 0; r < rows; r++) F.tear[r] = gl > 0.02 && hash2(r, stp) < gl * 0.38 ? Math.round((hash2(stp, r) - 0.5) * 18 * gl) : 0;
    // A closing card that follows a drawn scene composes after that scene's exit has drawn into the grid.
    const deferForExit = !DRAWABLE[id] && info.index >= 2 && info.local < info.change;
    if (!DRAWABLE[id] && !deferForExit) compose(F, ctx);
  }

  // ---- final pass: glyphs, glow, big type, CRT -----------------------------------------------------
  let SCAN = null;
  function compose(F, ctx) {
    const { cols, rows, cw, ch, world, sg, W, H, th, S, info } = F;
    const tex = S.look.texture ?? 1, footage = !S.paint, t = info.t;
    if (F.composed) return;
    F.composed = true;
    ctx.save();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    // the world steps back behind the scene's content: half the light near and under the content box
    const bx = F.box, bd = bx ? F.boxDim : 0;
    for (let r = 0; r < rows; r++) {
      const sh = F.tear[r], row = r * cols, y = r * ch;
      for (let c = 0; c < cols; c++) {
        let src = null, i = 0;
        const sc = c - sh;
        if (sc >= 0 && sc < cols && sg.ch[row + sc] !== 255) { src = sg; i = row + sc; }
        else if (world.ch[row + c] !== 255) { src = world; i = row + c; }
        if (!src) continue;
        const g = src.ch[i];
        if (g === 0) continue;
        let tn = src.tn[i];
        if (src === world && bd > 0) {
          const dx = Math.max(bx.c0 - 3 - c, 0, c - bx.c1 - 3), dy = Math.max(bx.r0 - 2 - r, 0, r - bx.r1 - 2);
          const near = 1 - clamp(Math.max(dx, dy * 1.7) / 6);
          if (near > 0) { tn = Math.round(tn * (1 - 0.5 * near * bd)); if (tn < 1) continue; }
        }
        ctx.drawImage(strip(F, src.hue[i], tn), g * cw, 0, cw, ch, c * cw, y, cw, ch);
      }
    }
    // bloom: only the brightest glyphs glow. Thresholded by hand on a tiny copy (no canvas filters, which
    // renderers treat differently) and scaled back up in two smooth steps, so the field stays near black.
    if (!th.light && tex > 0.02) {
      let b = F.bloom;
      if (!b) {
        b = F.bloom = document.createElement("canvas"); b.width = Math.ceil(W / 8); b.height = Math.ceil(H / 8); b.g = b.getContext("2d", { willReadFrequently: true });
        b.mid = document.createElement("canvas"); b.mid.width = Math.ceil(W / 4); b.mid.height = Math.ceil(H / 4); b.mg = b.mid.getContext("2d");
      }
      b.g.imageSmoothingEnabled = true; b.g.imageSmoothingQuality = "high";
      b.g.clearRect(0, 0, b.width, b.height);
      b.g.drawImage(ctx.canvas, 0, 0, b.width, b.height);
      const img = b.g.getImageData(0, 0, b.width, b.height), px = img.data, cut = 150;
      for (let i = 0; i < px.length; i += 4) {
        const a = px[i + 3] / 255, m = Math.max(px[i], px[i + 1], px[i + 2]) * a;
        const k = m > cut ? ((m - cut) / (255 - cut)) : 0;
        px[i] = px[i] * k; px[i + 1] = px[i + 1] * k; px[i + 2] = px[i + 2] * k; px[i + 3] = 255;
      }
      b.g.putImageData(img, 0, 0);
      b.mg.imageSmoothingEnabled = true; b.mg.imageSmoothingQuality = "high";
      b.mg.clearRect(0, 0, b.mid.width, b.mid.height);
      b.mg.drawImage(b, 0, 0, b.mid.width, b.mid.height);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.4 * tex;
      ctx.drawImage(b.mid, 0, 0, W, H);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    }
    // big type
    for (const o of F.ovl) {
      const col = toneColor(th, o.hue, 7), adv = o.size * F.adv;
      ctx.font = `800 ${o.size}px ${MONO}`; ctx.textBaseline = "middle"; ctx.textAlign = "center";
      ctx.lineJoin = "round"; ctx.lineWidth = Math.max(4, o.size * 0.16); ctx.strokeStyle = rgba(th.bg, 0.95);
      for (let i = 0; i < o.text.length; i++) {
        if (o.text[i] === " ") continue;
        const x = o.x + adv * (i + 0.5);
        ctx.strokeText(o.text[i], x, o.y);
        ctx.shadowColor = col; ctx.shadowBlur = th.light ? 0 : o.size * 0.3;
        ctx.fillStyle = col; ctx.fillText(o.text[i], x, o.y);
        ctx.shadowBlur = 0;
      }
      if (o.cursor >= 0) { ctx.fillStyle = toneColor(th, 4, 7); ctx.fillRect(o.cursor + adv * 0.1, o.y - o.size * 0.45, adv * 0.8, o.size * 0.9); }
    }
    if (!footage && tex > 0.02) {
      // scanlines, vignette and a slow rolling band
      const lh = Math.max(3, Math.round(3 * S.u));
      if (!SCAN || SCAN.h !== lh) { const cv = document.createElement("canvas"); cv.width = 4; cv.height = lh; const g = cv.getContext("2d"); g.fillStyle = "#000"; g.fillRect(0, lh - 1, 4, 1); SCAN = { cv, h: lh }; }
      ctx.globalAlpha = (th.light ? 0.06 : 0.22) * tex;
      ctx.fillStyle = ctx.createPattern(SCAN.cv, "repeat"); ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.38, W / 2, H / 2, Math.hypot(W, H) * 0.56);
      const vc = th.hues[3];
      v.addColorStop(0, "rgba(0,0,0,0)");
      v.addColorStop(0.7, th.light ? `rgba(70,50,20,${0.08 * tex})` : rgba(vc, 0.05 * tex));
      v.addColorStop(1, th.light ? `rgba(70,50,20,${0.2 * tex})` : `rgba(0,0,0,${0.5 * tex})`);
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  // ---- scene programs ------------------------------------------------------------------------------
  const cellsOf = (F, box) => ({ c0: Math.ceil(box.x / F.cw), r0: Math.ceil(box.y / F.ch), c1: Math.floor((box.x + box.w) / F.cw) - 1, r1: Math.floor((box.y + box.h) / F.ch) - 1 });
  const stag = (p, i, n, spread = 0.55) => eo((p - (i / Math.max(1, n)) * spread) / (1 - spread));
  const clipOf = (a, b, c, d) => [a, b, c, d];
  const trimTitle = (s, w) => String(s || "").toUpperCase().slice(0, Math.max(4, w));
  const sprinkle = (A, t, cx, cy, rx, ry, n, hue) => {
    for (let q = 0; q < n; q++) {
      const a = t * (1.2 + hash(q) * 0.8) + q * 2.4, f = fract(t * 0.7 + q * 0.37);
      A.cell(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, gi(f < 0.33 ? "*" : f < 0.66 ? "+" : "."), hue, f < 0.33 ? 7 : 5);
    }
  };

  const DRAW = {
    chart(A, F, B, p, d, info) {
      const t = info.t, { cw, ch, S } = F, u = S.u;
      const n = d.values.length, max = Math.max(...d.values, 1);
      A.win(B.c0, B.r0, B.c1, B.r1, "DATA//" + trimTitle(d.span, B.c1 - B.c0 - 14), 5, 3);
      const ic0 = B.c0 + 3, ic1 = B.c1 - 3, base = B.r1 - 4, hMax = base - (B.r0 + 11);
      // gridlines with a scanning bright spot
      for (let g = 1; g <= 5; g++) {
        const r = base - Math.round((hMax * g) / 5);
        const spot = Math.floor((t * 26 + g * 37) % (ic1 - ic0 + 30)) + ic0 - 10;
        for (let c = ic0; c <= ic1; c++) if ((c + Math.floor(t * 5)) % 4 === 0 || Math.abs(c - spot) < 3) A.cell(c, r, gi(Math.abs(c - spot) < 3 ? "-" : "."), 5, Math.abs(c - spot) < 3 ? 6 : 3);
        A.str(B.c0 + 1, r, String(Math.round((max * g) / 5)).padStart(2), 5, 4);
      }
      for (let c = ic0 - 1; c <= ic1 + 1; c++) A.cell(c, base + 1, gi("="), 0, 5);
      const slot = (ic1 - ic0) / n, bw = Math.max(5, Math.floor(slot * 0.64));
      const tops = [];
      d.values.forEach((value, i) => {
        const q = stag(p, i, n), x0 = Math.round(ic0 + i * slot + (slot - bw) / 2), hot = i === d.highlight;
        const hue = hot ? 1 : 3, h = Math.max(0, Math.round(hMax * (value / max) * q)), top = base - h;
        tops.push([x0 + bw / 2, top - 2, q]);
        for (let r = top; r < base; r++) for (let c = 0; c < bw; c++) {
          const fx = c / (bw - 1), wave = 0.22 * Math.sin((base - r) * 0.55 - t * 5 + i * 1.7);
          const lum = clamp(0.3 + 0.5 * fx + wave);
          const bit = ((c + i) % 3 === 1) && hash2(x0 + c, Math.floor(r + t * (6 + i))) < 0.6;
          if (bit) A.cell(x0 + c, r, gi(hash2(c, Math.floor(r + t * 8)) < 0.5 ? "1" : "0"), hot ? 4 : 0, 7);
          else A.cell(x0 + c, r, rampG(lum), hue, toneOf(lum));
        }
        for (let s = 0; s < 3 && h > 1; s++) A.cell(x0 + bw + s, top - 1 + s + 0 * s, gi("/"), hue, 3 - s > 0 ? 3 : 2);
        for (let r = top; r < base - 1 && h > 2; r++) { A.cell(x0 + bw, r, gi("|"), hue, 3); A.cell(x0 + bw + 1, r - 1, gi("/"), hue, 2); }
        if (h > 0) for (let c = 0; c < bw; c++) A.cell(x0 + c, top - 1, gi(c % 2 ? "_" : "="), hue, 7);
        if (q > 0.05) {
          const num = Math.round(value * q), w = digitsWidth(String(num), 2) > slot * 0.98 ? 1 : 2;
          const label = (d.prefix || "") + String(num) + (d.suffix || "");
          const ww = digitsWidth(label, w);
          A.digits(label, Math.round(x0 + bw / 2 - ww / 2), top - 10 - (hot ? Math.round(Math.abs(Math.sin(t * 3)) * 1.2) : 0), w, 1, hot ? 1 : 0);
          const lbl = String(d.labels[i] || ""), lc = stag(p, i + 0.5, n, 0.5);
          A.big(lbl, (x0 + bw / 2) * cw, (base + 3) * ch, 42 * u, hot ? 1 : 5, "center", lc);
        }
        if (hot && q > 0.8) sprinkle(A, t, x0 + bw / 2, top - 5, bw * 0.8, 5, 8, 4);
      });
      // trend line with a travelling comet
      const pts = tops.filter((q) => q[2] > 0.3);
      if (pts.length > 1) {
        const segs = [];
        let L = 0;
        for (let i = 1; i < pts.length; i++) { const l = Math.hypot((pts[i][0] - pts[i - 1][0]) * cw, (pts[i][1] - pts[i - 1][1]) * ch); segs.push(l); L += l; }
        const lim = L * eo(seg(p, 0.45, 1));
        const at = (s) => { let r = s; for (let i = 0; i < segs.length; i++) { if (r <= segs[i] || i === segs.length - 1) { const f = clamp(r / segs[i]); return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]; } r -= segs[i]; } return pts[0]; };
        for (let s = 0; s < lim; s += cw * 0.8) { const [c, r] = at(s); A.cell(c, r, gi("."), 4, 5); }
        const head = (t * 0.5 % 1) * lim;
        for (let q = 0; q < 8; q++) { const [c, r] = at(Math.max(0, head - q * cw * 1.4)); A.cell(c, r, gi(q === 0 ? "@" : q < 3 ? "O" : "o"), 4, 7 - Math.floor(q * 0.7)); }
        pts.forEach(([c, r]) => A.cell(c, r, G_DIA, 4, 7));
      }
    },

    object(A, F, B, p, d, info) {
      const t = info.t, { cw, ch, S } = F, u = S.u, phone = d.kind === "phone";
      const wpx = phone ? Math.min((B.c1 - B.c0) * cw * 0.32, (B.r1 - B.r0) * ch * 0.5) : Math.min((B.c1 - B.c0) * cw * (S.tall ? 0.5 : 0.6), (B.r1 - B.r0) * ch * 1.2);
      const hpx = phone ? wpx * 1.85 : wpx * 0.62;
      const xpx = B.c0 * cw + (phone ? (B.c1 - B.c0) * cw * 0.34 - wpx / 2 : (B.c1 - B.c0) * cw * 0.05);
      const ypx = B.r0 * ch + ((B.r1 - B.r0) * ch - hpx - (phone ? 0 : hpx * 0.14)) / 2;
      const c0 = Math.round(xpx / cw), c1 = Math.round((xpx + wpx) / cw), r0 = Math.round(ypx / ch), r1 = Math.round((ypx + hpx) / ch);
      const q = eo(p * 1.5);
      // brushed body with a sheen that slides across it
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const lum = clamp(0.34 + 0.2 * Math.sin((c + r * 2) * 0.22 - t * 2.2) + 0.1 * Math.sin(c * 0.9));
        A.cell(c, r, rampG(lum * 0.9), 5, toneOf(lum * 0.9));
      }
      for (const [c, r] of [[c0, r0], [c1, r0], [c0, r1], [c1, r1]]) A.cell(c, r, gi("+"), 0, 7);
      const s0 = c0 + 2, s1 = c1 - 2, sr0 = r0 + 1, sr1 = r1 - 1;
      A.win(s0, sr0, s1, sr1, phone ? "" : "DREAMCUT", 0, 4);
      // preview with a spinning solid
      const pv = { c0: s0 + 2, c1: s1 - 2, r0: sr0 + 2, r1: sr0 + 2 + Math.max(6, Math.round((sr1 - sr0) * 0.46)) };
      A.win(pv.c0, pv.r0, pv.c1, pv.r1, "PREVIEW", 1, 3);
      const shapeName = ["torus", "cube", "sphere", "knot", "mobius"][Math.floor(t / 1.6) % 5];
      const pcx = ((pv.c0 + pv.c1) / 2) * cw, pcy = ((pv.r0 + pv.r1) / 2 + 0.8) * ch, psc = Math.min((pv.c1 - pv.c0) * cw * 0.3, (pv.r1 - pv.r0) * ch * 0.5);
      splat(F, (c, r, chi, hue, tn) => A.cell(c, r, chi, hue, tn), SHAPES[shapeName], { cx: pcx, cy: pcy, sc: psc * (0.5 + 0.5 * q), ax: 0.5 + t * 0.7, ay: t * 0.9, az: 0.2 + t * 0.3, lmax: 1, hueA: 1, hueB: 4, clip: clipOf(pv.c0 + 1, pv.r0 + 1, pv.c1 - 1, pv.r1 - 1) });
      A.str(pv.c1 - 12, pv.r0 + 1, "REC", 2, hash(Math.floor(t * 2)) < 0.6 ? 7 : 3);
      A.cell(pv.c1 - 14, pv.r0 + 1, G_DOT, 2, Math.floor(t * 2) % 2 ? 7 : 3);
      // tracks
      const tl0 = s0 + 2, tl1 = s1 - 2, trTop = pv.r1 + 2, ph = tl0 + fract(t * 0.16) * (tl1 - tl0);
      for (let c = tl0; c <= tl1; c++) A.cell(c, trTop - 1, gi(c % 5 === 0 ? "|" : "."), 5, 4);
      const clips = [[0.0, 0.34], [0.38, 0.28], [0.7, 0.3]];
      for (let tr = 0; tr < 3; tr++) {
        const rr = trTop + tr * 2;
        if (rr + 1 > sr1 - 1) break;
        clips.forEach(([cx, cwid], i) => {
          const shown = clamp((q - 0.2 - i * 0.12) * 3), a = Math.round(tl0 + (cx + tr * 0.03) * (tl1 - tl0)), w = Math.round((tl1 - tl0) * cwid * shown);
          const hue = tr === 0 && i === 1 ? 1 : [3, 2, 4][tr];
          for (let c = a; c < a + w; c++) {
            const on = Math.abs(c - ph) < 3;
            A.cell(c, rr, gi(c === a ? "[" : c === a + w - 1 ? "]" : "="), hue, on ? 7 : 5);
            A.cell(c, rr + 1, gi((c + tr + Math.floor(t * 6)) % 3 === 0 ? ":" : "."), hue, on ? 6 : 3);
          }
        });
      }
      for (let r = trTop - 1; r <= Math.min(sr1 - 1, trTop + 6); r++) A.cell(ph, r, gi("|"), 4, 7);
      A.cell(ph, trTop - 2, G_DN, 4, 7);
      // base or notch
      if (!phone) {
        for (let c = c0 - 4; c <= c1 + 4; c++) { A.cell(c, r1 + 1, gi("="), 5, 5); A.cell(c, r1 + 2, gi(c < c0 - 2 || c > c1 + 2 ? "_" : (c + Math.floor(t * 3)) % 4 === 0 ? ":" : "_"), 5, 4); }
        A.str(Math.round((c0 + c1) / 2) - 3, r1 + 1, "[____]", 0, 6);
      } else A.str(Math.round((c0 + c1) / 2) - 1, r0 + 1, "(_)", 0, 6);
      // callouts
      const anchors = [[pv.c1 - 6, pv.r0 + 3], [Math.round((tl0 + tl1) / 2), trTop], [tl0 + 4, trTop + 4]];
      const lx = B.c0 + Math.floor((B.c1 - B.c0) * (phone ? 0.6 : S.tall ? 0.56 : 0.73));
      d.callouts.forEach((label, i) => {
        const cq = stag(p, i, d.callouts.length, 0.5);
        if (cq <= 0 || !label) return;
        const [ac, ar] = anchors[i], lr = Math.round(B.r0 + (B.r1 - B.r0) * (0.16 + i * 0.3)), ec = lx - 3;
        const elbow = [Math.min(ec - 2, c1 + 5), lr];
        A.line(ac, ar, elbow[0], elbow[1], 4, 6, cq);
        A.line(elbow[0], elbow[1], ec, lr, 4, 6, clamp(cq * 2 - 0.6));
        A.cell(ac, ar, G_DOT, 1, 7);
        if (cq > 0.6) {
          const trip = fract(t * 0.5 + i * 0.3);
          const px = trip < 0.5 ? ac + (elbow[0] - ac) * trip * 2 : elbow[0] + (ec - elbow[0]) * (trip - 0.5) * 2, py = trip < 0.5 ? ar + (elbow[1] - ar) * trip * 2 : lr;
          A.cell(px, py, gi("@"), 0, 7);
        }
        const w = String(label).length * 42 * u * F.adv;
        A.fill(lx - 2, lr - 2, Math.min(B.c1 + 4, Math.ceil((lx * cw + w) / cw) + 1), lr + 2);
        A.cell(lx - 2, lr, G_RT, 1, 7);
        A.big(label, lx * cw, (lr + 0.2) * ch, 42 * u, 0, "left", seg(cq, 0.55, 1));
      });
    },

    people(A, F, B, p, d, info) {
      const t = info.t, { cw, ch, S, cols, rows } = F, u = S.u;
      const n = Math.max(2, Math.min(6, Math.round(d.count)));
      const bw = (B.c1 - B.c0 + 1) * cw, bh = (B.r1 - B.r0 + 1) * ch;
      const size = Math.min(bh * 0.6, (bw / n) * 1.15);
      const baseR = B.r0 + Math.round((B.r1 - B.r0) * 0.88), base = baseR * ch;
      // ground
      const gq = eo(p * 2);
      for (let c = B.c0; c < B.c0 + (B.c1 - B.c0) * gq; c++) { A.cell(c, baseR + 1, gi((c + Math.floor(t * 8)) % 4 === 0 ? "=" : "-"), 3, 5); A.cell(c, baseR + 2, gi((c - Math.floor(t * 5)) % 6 === 0 ? ":" : " "), 5, 3); }
      const BODY = [3, 2, 4, 0, 3, 2], TOK = ["?", "!", "</>", "+1", "OK", "..."];
      for (let i = 0; i < n; i++) {
        const qv = stag(p, i, n), hot = i === Math.min(n - 1, d.highlight);
        if (qv <= 0.02) continue;
        const s = size * (hot ? 1.07 : 1) * (0.7 + 0.3 * qv);
        const cx = B.c0 * cw + (bw / n) * (i + 0.5) + Math.sin(t * 1.1 + i * 1.9) * s * 0.04;
        const hop = hot ? Math.abs(Math.sin(t * 3.1)) * s * 0.07 : 0, breathe = Math.sin(t * 2.4 + i) * s * 0.012;
        const fy = base + (1 - qv) * s * 0.3 - hop;
        const hue = hot ? 1 : BODY[i % 6];
        const v = i % 5;
        const el = [
          { x: cx, y: fy - s * 0.13, rx: s * 0.34, ry: s * 0.16, rz: s * 0.28, hue },
          { x: cx, y: fy - s * 0.34 + breathe, rx: s * 0.28, ry: s * 0.3, rz: s * 0.24, hue },
          { x: cx, y: fy - s * 0.8 + breathe, rx: s * 0.2, ry: s * 0.2, rz: s * 0.2, hue: hot ? 4 : hue },
        ];
        // arms: stubs that swing, one arm waving on the highlighted one
        for (const side of [-1, 1]) {
          const wave = hot && side === 1;
          const sw = wave ? -1.1 + Math.sin(t * 6) * 0.35 : 0.25 + Math.sin(t * 1.7 + i + side) * 0.12;
          for (let a = 0; a < 5; a++) {
            const f = a / 4;
            const ang = wave ? sw : sw * side;
            el.push({ x: cx + side * (s * 0.3 + Math.sin(ang * side + (wave ? 0.2 : 0)) * s * 0.17 * f * (wave ? 1.6 : 1) * 1.0 + (wave ? Math.sin(ang) * 0 : 0)), y: fy - s * 0.5 + (wave ? -f * s * 0.3 : f * s * 0.22 + Math.cos(ang) * s * 0.02), rx: s * 0.06, ry: s * 0.06, rz: s * 0.06, hue: hue });
          }
        }
        const hx = cx, hy = fy - s * 0.8 + breathe;
        if (v === 0) for (let a = -1; a <= 1; a++) el.push({ x: hx + a * s * 0.07, y: hy - s * 0.2 - Math.abs(a) * -s * 0.01, rx: s * 0.05, ry: s * 0.07, rz: s * 0.05, hue: 4 });
        if (v === 1) for (const side of [-1, 1]) el.push({ x: hx + side * s * 0.21, y: hy, rx: s * 0.05, ry: s * 0.09, rz: s * 0.08, hue: 1 });
        if (v === 3) { el.push({ x: hx, y: hy - s * 0.15, rx: s * 0.21, ry: s * 0.12, rz: s * 0.2, hue: 1 }); el.push({ x: hx, y: hy - s * 0.3, rx: s * 0.05, ry: s * 0.05, rz: s * 0.05, hue: 0 }); }
        // raster the ellipsoids into the grid
        F.zb.fill(1e9);
        let minc = cols, maxc = 0, minr = rows, maxr = 0;
        for (const e of el) { minc = Math.min(minc, Math.floor((e.x - e.rx) / cw)); maxc = Math.max(maxc, Math.ceil((e.x + e.rx) / cw)); minr = Math.min(minr, Math.floor((e.y - e.ry) / ch)); maxr = Math.max(maxr, Math.ceil((e.y + e.ry) / ch)); }
        for (let r = Math.max(0, minr - 2); r <= Math.min(rows - 1, maxr + 2); r++) for (let c = Math.max(0, minc - 2); c <= Math.min(cols - 1, maxc + 2); c++) {
          const px = (c + 0.5) * cw, py = (r + 0.5) * ch;
          let best = 1e9, bl = 0, bh = 0, near = false;
          for (const e of el) {
            const nx = (px - e.x) / e.rx, ny = (py - e.y) / e.ry, d2 = nx * nx + ny * ny;
            if (d2 >= 1) { if (!near) { const hx2 = (px - e.x) / (e.rx + cw * 1.6), hy2 = (py - e.y) / (e.ry + ch * 1.1); near = hx2 * hx2 + hy2 * hy2 < 1; } continue; }
            const nz = Math.sqrt(1 - d2), z = -nz * e.rz;
            if (z >= best) continue;
            best = z; bh = e.hue;
            bl = clamp(0.14 + 0.86 * Math.max(0, nx * LIGHT[0] - ny * LIGHT[1] + nz * LIGHT[2]) + 0.35 * Math.pow(Math.max(0, nz), 8) * 0.2);
          }
          if (best < 1e9) A.cell(c, r, rampG(Math.max(0.22, bl)), bh, toneOf(Math.max(0.3, bl)));
          else if (near) A.cell(c, r, 0, 0, 0);
        }
        // face
        const ec = Math.round(hx / cw), er = Math.round((hy - s * 0.02) / ch), blink = fract(t * 0.4 + i * 0.27) > 0.93;
        const look = Math.sin(t * 0.9 + i * 2) > 0.55 ? 1 : 0;
        const ex = Math.max(1, Math.round((s * 0.08) / cw));
        if (v === 4) { A.str(ec - ex - 1, er, "[", 0, 7); A.str(ec + ex + 1, er, "]", 0, 7); A.str(ec - ex, er, "O", 0, 7); A.str(ec + ex, er, "O", 0, 7); A.str(ec - ex + 1, er, "-", 0, 7); A.str(ec + ex - 1, er, "-", 0, 7); }
        else { const e1 = blink ? "-" : v === 2 ? "#" : "o"; A.str(ec - ex + look, er, e1, 7 > 0 ? 0 : 0, 7); A.str(ec + ex + look, er, e1, 0, 7); }
        A.str(ec - 1, er + 2, v === 2 ? "---" : Math.sin(t * 0.7 + i) > 0 ? "\\_/" : "\\_/", 0, 7);
        if (v === 2) { const aR = Math.round((hy - s * 0.2) / ch); A.line(ec, aR, ec, aR - 3, 0, 6); A.cell(ec, aR - 4, G_DOT, 1, Math.floor(t * 3 + i) % 2 ? 7 : 3); }
        if (v === 1) { const ar = Math.round((hy - s * 0.22) / ch); for (let a = -4; a <= 4; a++) A.cell(ec + a, ar - Math.round(Math.cos((a / 4) * 1.3) * 0.6 * 0 + 0.6 * (1 - (a * a) / 16)) , gi("="), 1, 6); }
        // shadow
        for (let c = Math.round((cx - s * 0.34) / cw); c <= Math.round((cx + s * 0.34) / cw); c++) A.cell(c, Math.round(base / ch) + 1, gi(Math.abs(c * cw - cx) < s * 0.2 ? "_" : "."), 5, 3);
        // speech token
        const per = 3.4, ph2 = ((t + i * 0.9) % per) / per, tok = TOK[Math.floor((t + i * 0.9) / per + i) % 6 | 0];
        if (ph2 < 0.62 && qv > 0.9) {
          const bc = Math.round((cx + s * 0.34) / cw), br = Math.round((fy - s * 0.92) / ch) - Math.round(ph2 * 3), tw = tok.length + 4;
          A.fill(bc, br - 1, bc + tw - 1, br + 1);
          A.str(bc, br - 1, "." + "-".repeat(tw - 2) + ".", 0, 5); A.str(bc, br + 1, "'" + "-".repeat(tw - 2) + "'", 0, 5);
          A.str(bc, br, "( " + tok + " )".slice(0, tw - 2), hot ? 1 : 4, 7);
          A.cell(bc - 1, br + 2, gi("o"), 0, 5); A.cell(bc - 2, br + 3, gi("."), 0, 4);
        }
        // badge
        const label = d.badges[i % d.badges.length];
        if (qv > 0.8 && label) {
          const lw = label.length * 42 * u * F.adv + 54 * u, bcx = cx / cw, bcw = Math.ceil(lw / cw), bc0 = Math.round(bcx - bcw / 2), brow = Math.round((fy - s * 1.14 - 62 * u) / ch);
          const brr = brow + Math.ceil((70 * u) / ch);
          A.win(bc0, brow, bc0 + bcw, brr, "", hot ? 1 : 3, hot ? 7 : 4);
          A.big(label, cx, ((brow + brr) / 2 + 0.5) * ch, 42 * u, hot ? 1 : 0, "center", clamp((qv - 0.8) * 9));
        }
      }
      // drifting motes between people so the stage never sits still
      sprinkle(A, t, (B.c0 + B.c1) / 2, B.r0 + (B.r1 - B.r0) * 0.3, (B.c1 - B.c0) * 0.48, (B.r1 - B.r0) * 0.2, 14, 4);
    },

    process(A, F, B, p, d, info) {
      const t = info.t, { cw, ch, S } = F, u = S.u;
      const n = d.steps.length, vertical = B.r1 - B.r0 > (B.c1 - B.c0) * (cw / ch) * 1.0;
      const bwp = (B.c1 - B.c0 + 1) * cw, bhp = (B.r1 - B.r0 + 1) * ch;
      const kinds = ["file", "spark", "eye", "check"];
      const wins = [];
      for (let i = 0; i < n; i++) {
        let x, y, w, h;
        if (vertical) { w = bwp * 0.9; h = (bhp / n) * 0.8; x = B.c0 * cw + (bwp - w) / 2; y = B.r0 * ch + i * (bhp / n); }
        else { const slot = bwp / n; w = slot * 0.76; h = Math.min(bhp * 0.94, w * 1.15); x = B.c0 * cw + i * slot + slot * 0.03; y = B.r0 * ch + (bhp - h) / 2; }
        wins.push({ c0: Math.round(x / cw), c1: Math.round((x + w) / cw), r0: Math.round(y / ch), r1: Math.round((y + h) / ch) });
      }
      // conveyors first so windows sit over their ends
      for (let i = 0; i < n - 1; i++) {
        const a = wins[i], b = wins[i + 1], cq = stag(p, i + 0.6, n, 0.6);
        if (cq <= 0) continue;
        if (!vertical) {
          const r = Math.round((a.r0 + a.r1) / 2), cs = a.c1 + 1, ce = b.c0 - 1, m = Math.floor((ce - cs) * cq);
          for (let c = cs; c <= cs + m; c++) { A.cell(c, r - 1, gi("-"), 5, 4); A.cell(c, r + 1, gi("-"), 5, 4); A.cell(c, r, gi(((c - Math.floor(t * 12)) % 4 + 4) % 4 === 0 ? ">" : "-"), 1, 7 - ((c - Math.floor(t * 12)) % 4 + 4) % 4); }
          const pk = cs + fract(t * 0.5 + i * 0.4) * (ce - cs - 3);
          if (cq > 0.9) A.str(Math.round(pk), r - 2 + 1 - 1, "[#]", 4, 7);
          if (cq > 0.9) A.cell(ce + 1, r, G_RT, 1, 7);
        } else {
          const c = Math.round((a.c0 + a.c1) / 2), rs = a.r1 + 1, re = b.r0 - 1;
          for (let r = rs; r <= re; r++) { A.cell(c - 2, r, gi("|"), 5, 4); A.cell(c + 2, r, gi("|"), 5, 4); A.cell(c, r, gi(((r - Math.floor(t * 9)) % 3 + 3) % 3 === 0 ? "v" : "|"), 1, 7); }
          A.cell(c, re + 1, G_DN, 1, 7);
        }
      }
      wins.forEach((w, i) => {
        const q = stag(p, i, n, 0.6);
        if (q <= 0) return;
        const hue = i === n - 1 ? 1 : [3, 2, 4][i % 3], tn = 5;
        A.win(w.c0, w.r0, w.c1, w.r1, `STEP ${String(i + 1).padStart(2, "0")}`, hue, tn);
        const wc = w.c1 - w.c0, wr = w.r1 - w.r0;
        // the picture area and the label area
        const area = vertical ? { c0: w.c0 + 2, c1: w.c0 + Math.floor(wc * 0.32), r0: w.r0 + 2, r1: w.r1 - 2 } : { c0: w.c0 + 2, c1: w.c1 - 2, r0: w.r0 + 2, r1: w.r1 - Math.max(5, Math.round((78 * u) / ch)) };
        const acx = (area.c0 + area.c1) / 2, acy = (area.r0 + area.r1) / 2, aw = area.c1 - area.c0, ah = area.r1 - area.r0;
        const kind = kinds[i === n - 1 ? 3 : i % 3], iq = clamp((q - 0.2) * 1.5), loc = t + i * 0.7;
        const rad = Math.min(aw * cw, ah * ch) * 0.62;
        if (kind === "file") {
          // a full page of glyph text being read, a scan bar sweeping down it
          const fw = Math.max(8, Math.round(Math.min(aw * 0.72, (rad * 1.7) / cw))), fh = Math.max(8, Math.round(Math.min(ah * 0.96, (rad * 2.1) / ch)));
          const fc0 = Math.round(acx - fw / 2), fr0 = Math.round(acy - fh / 2), fold = Math.max(2, Math.round(fw * 0.22));
          const lines = fh - 2, cap = (lines * (fw - 3)) * iq, scan = fr0 + 1 + Math.floor(fract(loc * 0.35) * lines);
          for (let r = fr0; r <= fr0 + fh; r++) for (let c = fc0; c <= fc0 + fw; c++) {
            const dc = c - (fc0 + fw - fold), dr = r - fr0;
            if (dc > dr) continue;
            const border = r === fr0 || r === fr0 + fh || c === fc0 || c === fc0 + fw || dc === dr;
            if (border) { A.cell(c, r, gi(dc === dr ? "\\" : r === fr0 || r === fr0 + fh ? "=" : "|"), 0, 7); continue; }
            if (dc >= 0 && dr <= fold) { A.cell(c, r, G_SH2, hue, 4); continue; }
            const l = r - fr0 - 1, cc = c - fc0 - 2, at = l * (fw - 3) + cc, short = hash2(l, 3) * (fw - 6);
            const ink = cc >= 0 && cc < fw - 3 && at < cap && cc < fw - 3 - short * (l % 4 === 3 ? 1 : 0.25);
            const onScan = r === scan;
            if (ink) A.cell(c, r, gi(hash2(c, l + 9) > 0.5 ? "#" : "="), onScan ? 4 : hue, onScan ? 7 : 6);
            else A.cell(c, r, onScan ? G_SH1 : gi(((c + r) & 1) ? ":" : "."), onScan ? 4 : 5, onScan ? 5 : 3);
          }
          A.cell(fc0 - 1, scan, G_RT, 4, 7); A.cell(fc0 + fw + 1, scan, G_LT, 4, 7);
        } else if (kind === "spark") {
          // a shaded glyph orb throwing thick rays: the draft taking shape
          const orb = rad * 0.42 * (0.6 + 0.4 * iq);
          for (let r = Math.floor(acy - orb / ch) - 1; r <= Math.ceil(acy + orb / ch) + 1; r++) for (let c = Math.floor(acx - orb / cw) - 1; c <= Math.ceil(acx + orb / cw) + 1; c++) {
            const nx = ((c + 0.5 - acx) * cw) / orb, ny = ((r + 0.5 - acy) * ch) / orb, d2 = nx * nx + ny * ny;
            if (d2 >= 1) continue;
            const nz = Math.sqrt(1 - d2), l = clamp(0.2 + 0.8 * Math.max(0, nx * LIGHT[0] - ny * LIGHT[1] + nz * LIGHT[2]) + 0.1 * Math.sin(loc * 4 + c * 0.6));
            A.cell(c, r, l > 0.9 ? gi("@") : rampG(l), d2 < 0.2 ? 4 : hue, toneOf(l));
          }
          const rays = 12;
          for (let a = 0; a < rays; a++) {
            const ang = (a / rays) * TAU + loc * 0.6, L = rad * (a % 2 ? 0.78 : 1) * (0.75 + 0.25 * Math.abs(Math.sin(loc * 2.2 + a * 0.9))) * iq;
            const s0 = Math.ceil((orb * 1.15) / cw), steps = Math.ceil(L / cw);
            for (let s = s0; s < steps; s++) {
              const rr2 = s * cw, tip = s > steps - 3;
              const cx2 = acx + (Math.cos(ang) * rr2) / cw, cy2 = acy + (Math.sin(ang) * rr2) / ch;
              A.cell(cx2, cy2, gi(tip ? "*" : "#"), a % 2 ? 1 : 4, tip ? 7 : 6);
              if (!tip && s < s0 + 3) A.cell(cx2 + Math.sin(ang) * 0.8, cy2 - Math.cos(ang) * 0.5, gi("+"), a % 2 ? 1 : 4, 5);
            }
          }
          A.ring(acx, acy, rad * (0.92 + 0.06 * Math.sin(loc * 3)), hue, 4, gi("."));
        } else if (kind === "eye") {
          const ew = rad * 1.3, eh = rad * 0.62 * (0.12 + 0.88 * (1 - 0.95 * Math.pow(Math.max(0, Math.sin(loc * 1.3 + 0.2)), 40)));
          const ic = Math.sin(loc * 1.1) * ew * 0.25, ir = Math.sin(loc * 0.8 + 1) * eh * 0.3;
          for (let r = Math.floor(acy - eh / ch) - 1; r <= Math.ceil(acy + eh / ch) + 1; r++) for (let c = Math.floor(acx - ew / cw) - 1; c <= Math.ceil(acx + ew / cw) + 1; c++) {
            const nx = ((c + 0.5) * cw - acx * cw) / ew, ny = ((r + 0.5) * ch - acy * ch) / Math.max(1, eh), lid = (1 - nx * nx) * eh;
            if (Math.abs(ny * eh) > lid || Math.abs(nx) > 1) { if (Math.abs(Math.abs(ny * eh) - lid) < ch * 0.8 && Math.abs(nx) <= 1) A.cell(c, r, gi(ny < 0 ? "'" : "."), hue, 7); continue; }
            const dx = ((c + 0.5) * cw - acx * cw - ic), dy = ((r + 0.5) * ch - acy * ch - ir), rr3 = Math.hypot(dx, dy), ir0 = Math.min(eh * 0.85, ew * 0.3);
            if (rr3 < ir0 * 0.42) A.cell(c, r, gi("@"), 0, 7); else if (rr3 < ir0) { const l = 0.35 + 0.5 * (1 - rr3 / ir0); A.cell(c, r, rampG(l), hue, toneOf(l)); } else A.cell(c, r, gi(((c + r) & 1) ? "." : " "), 5, 3);
          }
        } else {
          // check mark, thick strokes, with a ripple
          const k0 = [acx - rad * 0.55 / cw, acy + rad * 0.02 / ch], k1 = [acx - rad * 0.12 / cw, acy + rad * 0.4 / ch], k2 = [acx + rad * 0.62 / cw, acy - rad * 0.42 / ch];
          for (let o = -1; o <= 1; o++) {
            A.line(k0[0] + o, k0[1], k1[0] + o, k1[1], 1, 7, clamp(iq * 2), gi("#"));
            A.line(k1[0] + o, k1[1], k2[0] + o, k2[1], 1, 7, clamp(iq * 2 - 1), gi("#"));
          }
          const rp = fract(loc * 0.6);
          A.ring(acx, acy, rad * (0.3 + rp * 0.8), 4, toneOf(1 - rp), gi("o"), 1);
          A.ring(acx, acy, rad * 0.95, hue, 4, gi("."), 1);
          sprinkle(A, loc, acx, acy, rad / cw * 1.1, rad / ch * 0.9, 6, 4);
        }
        // status line
        const sr = w.r1 - 1, run = Math.floor(fract(loc * 0.4) * 10);
        A.str(w.c0 + 2, sr, "RUN [" + "#".repeat(run) + "-".repeat(10 - run) + "]", hue, 6);
        // label
        const lbl = d.steps[i], sz = Math.max(42 * u, Math.min(52 * u, (((vertical ? wc * 0.62 : wc - 4) * cw) / Math.max(6, lbl.length)) / F.adv));
        const lr = vertical ? (w.r0 + w.r1) / 2 : w.r1 - Math.max(3.4, (60 * u) / ch);
        const lx = vertical ? (area.c1 + 3) * cw : ((w.c0 + w.c1) / 2) * cw;
        A.big(lbl, lx, lr * ch, sz, i === n - 1 ? 1 : 0, vertical ? "left" : "center", clamp((q - 0.45) * 2.4));
      });
    },

    compare(A, F, B, p, d, info) {
      const t = info.t, { cw, ch, S } = F, u = S.u;
      const bwp = (B.c1 - B.c0 + 1) * cw, bhp = (B.r1 - B.r0 + 1) * ch, vertical = bhp > bwp * 1.1, gap = 40 * u;
      const pw = vertical ? bwp : (bwp - gap) / 2, ph = vertical ? (bhp - gap) / 2 : bhp * 0.9;
      const maxV = Math.max(d.leftValue, d.rightValue, 1);
      [[d.left, d.leftValue, 0], [d.right, d.rightValue, 1]].forEach(([label, value, side]) => {
        const q = stag(p, side, 2, 0.4);
        if (q <= 0) return;
        const x = vertical ? B.c0 * cw : B.c0 * cw + side * (pw + gap), y = vertical ? B.r0 * ch + side * (ph + gap) : B.r0 * ch + (bhp - ph) / 2;
        const c0 = Math.round(x / cw), c1 = Math.round((x + pw) / cw) - 1, r0 = Math.round(y / ch), r1 = Math.round((y + ph) / ch) - 1;
        const hue = side ? 1 : 3;
        A.win(c0, r0, c1, r1, side ? "AFTER.LOG" : "BEFORE.LOG", hue, 5);
        const wc = c1 - c0, wr = r1 - r0;
        // texture: noise on the left, a calm lattice on the right
        const tx0 = vertical ? c0 + Math.floor(wc * 0.56) : c0 + Math.floor(wc * 0.52), tx1 = c1 - 2, ty0 = r0 + 2, ty1 = r1 - 6;
        for (let r = ty0; r <= ty1; r++) for (let c = tx0; c <= tx1; c++) {
          if (!side) {
            const st = Math.floor(t * 12 + c * 0.1);
            const h = hash2(c + st, r * 3 + st);
            if (h < 0.55) A.cell(c, r, gi(NOISE[Math.floor(hash2(c, r + st) * NOISE.length)]), 3, 3 + Math.floor(h * 8) % 4);
          } else {
            const wv = Math.sin(c * 0.28 + t * 2) + Math.sin(r * 0.55 - t * 1.6), l = clamp(0.25 + 0.2 * wv);
            if ((c + r) % 2 === 0) A.cell(c, r, rampG(l + 0.15), 1, toneOf(l + 0.2));
          }
        }
        // hero glyph solid: a tangle on the left, a clean sphere on the right
        const hcx = ((tx0 + tx1) / 2) * cw, hcy = ((ty0 + ty1) / 2) * ch, hsc = Math.min((tx1 - tx0) * cw, (ty1 - ty0) * ch) * 0.34 * q;
        if (hsc > 20) splat(F, (c, r, chi, h2, tn) => A.cell(c, r, chi, h2, tn), SHAPES[side ? "sphere" : "knot"], { cx: hcx, cy: hcy, sc: hsc, ax: 0.4 + t * (side ? 0.4 : 1.7), ay: t * (side ? 0.6 : 2.3), az: side ? 0.1 : t * 1.1, lmax: 1, hueA: side ? 1 : 3, hueB: side ? 4 : 2, clip: clipOf(tx0, ty0, tx1, ty1) });
        A.big(label, (c0 + 3) * cw, (r0 + 3.4) * ch, 42 * u, side ? 1 : 0, "left", clamp((q - 0.3) * 2.5));
        const shown = value * eo(q);
        const text = (d.prefix || "") + String(Math.round(shown)) + (d.suffix || "");
        const avail = (tx0 - c0 - 4), sy = Math.max(1, Math.min(4, Math.floor((wr - 11) / 7)));
        let sx = Math.min(sy * 2, 6);
        while (sx > 1 && digitsWidth(text, sx) > avail) sx--;
        A.digits(text, c0 + 4, r0 + 6 + Math.max(0, Math.floor((wr - 11 - 7 * sy) / 2)), sx, sy, hue);
        // meter
        const mr = r1 - 2, mc0 = c0 + 3, mc1 = c1 - 3, fillW = Math.round((mc1 - mc0) * clamp(value / maxV) * eo(q));
        for (let c = mc0; c <= mc1; c++) A.cell(c, mr, gi(c === mc0 ? "[" : c === mc1 ? "]" : "."), 5, 4);
        for (let c = mc0 + 1; c < mc0 + fillW; c++) { const glint = Math.abs(c - (mc0 + fract(t * 0.4 + side * 0.3) * fillW)) < 3; A.cell(c, mr, gi("="), hue, glint ? 7 : 5); A.cell(c, mr - 1, gi("-"), hue, glint ? 6 : 3); }
        A.str(mc0, r1 - 3, side ? "STABLE" : "UNSTABLE", hue, 5);
      });
    },
  };

  const scene = (id) => (ctx, S, box, p, d, info) => {
    const F = FR;
    if (!F || F.S !== S || !F.info) return;
    const out = info && info.exit !== undefined;
    const vis = gate(F, info, out);
    const A = makeApi(F, vis, info);
    const B = cellsOf(F, box);
    // the world dims behind content as the content arrives, and lifts again as it leaves for the closing card
    if (out) { F.box = B; F.boxDim = DRAWABLE[F.info.scene] ? 1 : 1 - eio(info.exit); }
    else { F.boxDim = Math.max(F.box ? F.boxDim : 0, eio(info.local / Math.max(0.01, info.change * 1.5))); F.box = B; }
    DRAW[id](A, F, B, out ? 1 : p, d, info);
    // a drawn scene composes; an exit into the closing card composes for it
    if (!out || !DRAWABLE[F.info.scene]) compose(F, ctx);
  };

  // ---- look tokens ---------------------------------------------------------------------------------
  const halo = (bg, glow) => (accent) => `0 0 2px ${bg}, 0 0 9px ${bg}, 0 0 22px ${bg}, 0 0 40px ${bg}` + (glow ? `, 0 0 16px ${hexA(accent, 0.45)}` : "");
  const mk = (c) => ({ glow: true, light: false, ...c });
  const DARK = mk({ bg: "#07060f", hues: ["#d9f6ff", "#ff7a3d", "#ff4fa8", "#35e0ff", "#ffd75e", "#6c7aa8"] });
  return {
    bg: "#07060f", panel: "rgba(217,246,255,0.06)", ink: "#e7f8ff", muted: "#7f93c0", accent: "#ff7a3d", onAccent: "#07060f",
    rule: "rgba(217,246,255,0.5)", track: "rgba(217,246,255,0.1)",
    display: MONO, displayWeight: 800, displayCase: "uppercase", displayTracking: "0.02em",
    body: MONO, bodyWeight: 700, figures: MONO, radius: 0,
    motion: "type", change: "scan", kit: { line: 3, fill: "solid", panel: "outline" },
    keepArt: true, overlap: true,
    tone: DARK,
    palettes: {
      // Paper: dark ink characters on pale print stock. Night: a single warm amber monitor. Grey: plain white-on-black glyphs.
      light: { bg: "#f2ecdf", panel: "rgba(30,24,50,0.06)", ink: "#1b1830", muted: "#6c6a7e", accent: "#d9480f", onAccent: "#ffffff", rule: "rgba(27,24,48,0.6)", track: "rgba(27,24,48,0.1)",
        textShadow: halo("#f2ecdf", false), backdrop: () => "#f2ecdf",
        tone: { bg: "#f2ecdf", light: true, glow: false, hues: ["#1b1830", "#d9480f", "#b0125b", "#0b6e8a", "#a86e00", "#8d887a"] } },
      dark: { bg: "#0b0600", ink: "#ffe0a8", muted: "#a2723a", accent: "#ffb43a", rule: "rgba(255,200,120,0.5)", track: "rgba(255,190,100,0.1)",
        textShadow: halo("#0b0600", true), backdrop: () => "#0b0600",
        tone: mk({ bg: "#0b0600", hues: ["#ffe6b8", "#ffb43a", "#ff7a2e", "#ffcf6a", "#fff0c8", "#9a6a30"] }) },
      mono: { bg: "#0a0a0a", ink: "#f0f0f0", muted: "#8c8c8c", accent: "#ffffff", onAccent: "#0a0a0a", rule: "rgba(240,240,240,0.5)", track: "rgba(240,240,240,0.1)",
        textShadow: halo("#0a0a0a", false), backdrop: () => "#0a0a0a",
        tone: mk({ bg: "#0a0a0a", hues: ["#f0f0f0", "#ffffff", "#c8c8c8", "#a4a4a4", "#dcdcdc", "#6e6e6e"] }) },
    },
    css: (accent) => `#root .display { text-shadow: var(--separation); }
      #root h2.display::before { content: "> "; color: ${accent}; }
      #root .kicker::before { content: "[ "; } #root .kicker::after { content: " ]"; }
      #root .kicker { letter-spacing: 0.1em; }`,
    textShadow: halo("#07060f", true),
    backdrop: (accent, texture, look) => {
      const bg = look && look.tone ? look.tone.bg : "#07060f";
      // layered over a solid base so nothing behind the composition (a white page) can show through
      return look && look.tone && look.tone.light ? bg : `radial-gradient(ellipse at 50% 42%, ${hexA(accent, 0.035)} 0%, rgba(0,0,0,0) 70%), ${bg}`;
    },
    // The grid is drawn by the stage; this pass only marks the backdrop as on.
    paint: (ctx, W, H) => { ctx.clearRect(0, 0, W, H); },
    stage,
    scenes: { chart: scene("chart"), object: scene("object"), people: scene("people"), process: scene("process"), compare: scene("compare") },
  };
});
