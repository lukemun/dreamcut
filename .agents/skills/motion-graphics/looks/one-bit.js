// One-Bit: a whole world drawn in two colours. Everything is painted on a small pixel grid with
// flat fills, 8x8 fill patterns and ordered or error-diffusion dither, thresholded to pure ink and paper,
// then blown up with hard pixel edges. Each scene is a window in an invented paint program ("Scrapbook")
// that sits on a living desktop: a dithered landscape that changes with every scene, a tool palette,
// level meters and a status bar that never stop moving. Scenes enter and leave by dissolving through
// a dither matrix and the landscape behind them wipes by iris, blinds, blocks or stairs.
// Frames are pure functions of time: seeded integer hashes only, no clocks.
window.DreamcutMotion.register("one-bit", ({ rng }) => {
  const M = window.DreamcutMotion;
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const R = Math.round;
  const wrap = (v, m) => ((v % m) + m) % m;
  const hash = (n) => {
    n = Math.floor(n) | 0;
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const K = "#000", Wh = "#fff";
  const MONO = "Monaco, Menlo, 'Courier New', monospace";
  const BLACK = "'Arial Black', 'Helvetica Neue', Impact, Arial, sans-serif";
  const NAMES = { chart: "BARS.PIC", object: "GADGET.PIC", people: "CREW.PIC", process: "BELT.PIC", compare: "VERSUS.PIC" };
  const HZ_SCENE = 0.31, HZ_STATEMENT = 0.58;

  // ---- ordered dither and 8x8 fill patterns ---------------------------------------------------
  const BAY = new Float32Array(64);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const xo = x ^ y;
    BAY[y * 8 + x] = ((((xo & 1) << 5) | ((y & 1) << 4) | ((xo & 2) << 2) | ((y & 2) << 1) | ((xo & 4) >> 1) | ((y & 4) >> 2)) + 0.5) / 64;
  }
  const bay = (x, y) => BAY[((y & 7) << 3) | (x & 7)];
  const PAT = {
    g50: [0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55], g25: [0x88, 0x22, 0x88, 0x22, 0x88, 0x22, 0x88, 0x22],
    g12: [0x80, 0x00, 0x08, 0x00, 0x80, 0x00, 0x08, 0x00], g75: [0x77, 0xdd, 0x77, 0xdd, 0x77, 0xdd, 0x77, 0xdd],
    hl: [0xff, 0, 0xff, 0, 0xff, 0, 0xff, 0], hs: [0xff, 0, 0, 0, 0xff, 0, 0, 0], vl: [0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa],
    vs: [0x88, 0x88, 0x88, 0x88, 0x88, 0x88, 0x88, 0x88], dg: [0x80, 0x40, 0x20, 0x10, 0x08, 0x04, 0x02, 0x01],
    dt: [0xc0, 0x60, 0x30, 0x18, 0x0c, 0x06, 0x03, 0x81], dr: [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80],
    br: [0xff, 0x08, 0x08, 0x08, 0xff, 0x80, 0x80, 0x80], wv: [0xee, 0xdd, 0xbb, 0x77, 0xee, 0xdd, 0xbb, 0x77],
    dm: [0x10, 0x28, 0x44, 0x82, 0x44, 0x28, 0x10, 0x00], ck: [0xf0, 0xf0, 0xf0, 0xf0, 0x0f, 0x0f, 0x0f, 0x0f],
    pt: [0x80, 0, 0, 0, 0, 0, 0, 0], gr: [0xff, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80], pl: [0xff, 0xaa, 0xff, 0xaa, 0xf0, 0xaa, 0xf0, 0xaa],
  };
  const TILES = new Map();
  function tile(name, fg, bg) {
    const key = name + fg + (bg || "~");
    let c = TILES.get(key);
    if (c) return c;
    c = document.createElement("canvas"); c.width = c.height = 8;
    const g = c.getContext("2d");
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, 8, 8); }
    g.fillStyle = fg;
    PAT[name].forEach((row, y) => { for (let x = 0; x < 8; x++) if (row & (0x80 >> x)) g.fillRect(x, y, 1, 1); });
    TILES.set(key, c);
    return c;
  }
  // A pattern fill; ox, oy slide it a whole number of pixels so a fill can crawl.
  function pat(g, name, o = {}) {
    const p = g.createPattern(tile(name, o.fg || K, o.bg === undefined ? Wh : o.bg), "repeat");
    p.setTransform(new DOMMatrix([1, 0, 0, 1, R(o.ox || 0), R(o.oy || 0)]));
    return p;
  }
  const rc = (g, x, y, w, h, c) => { if (w <= 0 || h <= 0) return; g.fillStyle = c; g.fillRect(R(x), R(y), R(x + w) - R(x), R(y + h) - R(y)); };
  const fr = (g, x, y, w, h, lw, c) => { rc(g, x, y, w, lw, c); rc(g, x, y + h - lw, w, lw, c); rc(g, x, y, lw, h, c); rc(g, x + w - lw, y, lw, h, c); };
  const prc = (g, x, y, w, h, name, o) => { if (w <= 0 || h <= 0) return; g.fillStyle = pat(g, name, o); g.fillRect(R(x), R(y), R(x + w) - R(x), R(y + h) - R(y)); };
  const dot = (g, x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
  const line = (g, pts, w, c, dash, off) => {
    g.save(); g.strokeStyle = c; g.lineWidth = w; g.lineCap = "butt"; g.lineJoin = "miter";
    g.setLineDash(dash || []); g.lineDashOffset = off || 0;
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); g.restore();
  };
  const poly = (g, pts, fill, stroke, w) => {
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.lineWidth = w || 1.5; g.strokeStyle = stroke; g.lineJoin = "miter"; g.stroke(); }
  };

  // Ordered-dither a rectangle from a darkness field (1 = black). Unset pixels are paper, or clear.
  let SCR = null;
  function dfield(g, x, y, w, h, fn, clear) {
    x = R(x); y = R(y); w = Math.max(1, R(w)); h = Math.max(1, R(h));
    if (!SCR) SCR = document.createElement("canvas");
    if (SCR.width < w || SCR.height < h) { SCR.width = Math.max(SCR.width, w); SCR.height = Math.max(SCR.height, h); }
    const sg = SCR.getContext("2d");
    const id = sg.createImageData(w, h), d = id.data;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const on = fn(i + x, j + y) > bay(i + x, j + y), o = (j * w + i) * 4;
      d[o] = d[o + 1] = d[o + 2] = on ? 0 : 255; d[o + 3] = on ? 255 : clear ? 0 : 255;
    }
    sg.putImageData(id, 0, 0);
    g.drawImage(SCR, 0, 0, w, h, x, y, w, h);
  }
  // Atkinson error diffusion over a whole frame; cached because static skies repeat every frame.
  function atkinson(w, h, fn) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"), id = g.createImageData(w, h), d = id.data, e = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, v = fn(x, y) + e[i], on = v > 0.5, q = (v - (on ? 1 : 0)) / 8;
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = on ? 0 : 255; d[i * 4 + 3] = 255;
      if (x + 1 < w) e[i + 1] += q;
      if (x + 2 < w) e[i + 2] += q;
      if (y + 1 < h) { if (x > 0) e[i + w - 1] += q; e[i + w] += q; if (x + 1 < w) e[i + w + 1] += q; }
      if (y + 2 < h) e[i + 2 * w] += q;
    }
    g.putImageData(id, 0, 0);
    return c;
  }

  // ---- frame buffers --------------------------------------------------------------------------
  let CV = null, SKIES = new Map();
  const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  function ensure(W, H, P) {
    const LW = Math.ceil(W / P), LH = Math.ceil(H / P), key = LW + "x" + LH;
    if (!CV || CV.key !== key) {
      CV = { key, LW, LH, lo: mk(LW, LH), sc: mk(LW, LH), lb: mk(LW, LH), lm: mk(LW, LH), out: mk(LW, LH) };
      SKIES = new Map();
    }
    return CV;
  }
  const rgb = (h) => { const s = String(h).replace("#", ""); const f = s.length === 3 ? s.split("").map((c) => c + c).join("") : s; const n = parseInt(f, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  let frame = null;

  function makeFrame(ctx, S, info) {
    const P = Math.max(2, Math.round(3 * S.u));
    const cv = ensure(S.W, S.H, P);
    const g = cv.lo.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.setLineDash([]);
    g.imageSmoothingEnabled = false; g.clearRect(0, 0, cv.LW, cv.LH);
    const U = Math.min(cv.LW, cv.LH) / 360;
    const sc = info.scene;
    const statement = !sc || sc === "title" || sc === "closing";
    return {
      S, ctx, cv, g, P, LW: cv.LW, LH: cv.LH, U, t: info.t, info, tall: S.tall, tex: S.look.texture ?? 1,
      idx: Math.max(0, info.index || 0), statement, hz: statement ? HZ_STATEMENT : HZ_SCENE + (S.tall ? -0.02 : 0),
      ink: rgb(S.look.ink), paper: rgb(S.look.bg), side: ((S.tall ? 90 : 140) * S.u) / P,
    };
  }
  // The pixels become the palette: black is ink, white is paper, then everything scales up crisp.
  function blit(F) {
    const { cv, g, ctx, ink, paper, P, LW, LH } = F;
    const id = g.getImageData(0, 0, LW, LH), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) { d[i + 3] = 0; continue; }
      const on = d[i] * 77 + d[i + 1] * 151 + d[i + 2] * 28 < 32768;
      const c = on ? ink : paper;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
    const og = cv.out.getContext("2d");
    og.putImageData(id, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cv.out, 0, 0, LW, LH, 0, 0, LW * P, LH * P);
    ctx.restore();
  }

  // ---- lettering ------------------------------------------------------------------------------
  const fontOf = (size, o) => `${o.w || 800} ${size}px ${o.f || MONO}`;
  function txt(g, s, x, y, size, o = {}) {
    s = String(s ?? ""); if (o.up) s = s.toUpperCase();
    const q = o.q ?? 1; if (q <= 0 || !s) return 0;
    g.save();
    g.font = fontOf(size, o); g.textBaseline = o.base || "middle"; g.textAlign = "left";
    let w = g.measureText(s).width;
    if (o.maxW && w > o.maxW) { size = Math.max(o.min || size * 0.75, (size * o.maxW) / w); g.font = fontOf(size, o); w = g.measureText(s).width; }
    const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    const shown = q >= 1 ? s : s.slice(0, Math.max(1, Math.ceil(s.length * q)));
    if (o.halo) { g.lineWidth = o.halo; g.lineJoin = "round"; g.strokeStyle = o.haloColor || Wh; g.strokeText(shown, x0, y); }
    g.fillStyle = o.color || K; g.fillText(shown, x0, y);
    g.restore();
    return w;
  }
  // A label on a plate; the plate only ever spans the letters that have appeared, never an empty box.
  function plate(g, s, x, y, size, q, o = {}) {
    s = String(s ?? ""); if (q <= 0 || !s) return null;
    g.save(); g.font = fontOf(size, o);
    let full = g.measureText(s).width;
    if (o.maxW && full + size * 0.8 > o.maxW) { size = Math.max(o.min || size * 0.8, (size * (o.maxW - size * 0.8)) / full); g.font = fontOf(size, o); full = g.measureText(s).width; }
    const shown = q >= 1 ? s : s.slice(0, Math.max(1, Math.ceil(s.length * q)));
    const w = g.measureText(shown).width, pad = size * 0.4, h = size * 1.5;
    const x0 = o.align === "center" ? x - (full + pad * 2) / 2 : o.align === "right" ? x - full - pad * 2 : x;
    const inv = !!o.inv;
    rc(g, x0 + 2, y + 2, w + pad * 2, h, K);
    rc(g, x0, y, w + pad * 2, h, inv ? K : Wh);
    if (!inv) fr(g, x0, y, w + pad * 2, h, 2, K); else fr(g, x0, y, w + pad * 2, h, 1, Wh);
    g.textBaseline = "middle"; g.textAlign = "left"; g.fillStyle = inv ? Wh : K; g.fillText(shown, x0 + pad, y + h / 2 + 1);
    g.restore();
    return { x: x0, y, w: w + pad * 2, h, size };
  }

  // ---- little pieces: the mascot and a few glyphs --------------------------------------------
  // Pip, a drop of ink with a white outline so it reads on any ground. mood: 0 calm, 1 delighted, 2 worried.
  function pip(g, x, y, s, o = {}) {
    const t = o.t || 0, mood = o.mood || 0, hop = o.hop || 0, r = s * 0.34, cy = y - r - s * 0.12 - hop;
    const lean = Math.sin(t * 2.3 + (o.seed || 0)) * r * 0.25;
    const body = () => {
      g.beginPath(); g.arc(x, cy, r, 0, TAU);
      g.moveTo(x - r * 0.78, cy - r * 0.55); g.quadraticCurveTo(x - r * 0.1, cy - r * 1.0, x + lean, cy - r * 1.85); g.quadraticCurveTo(x + r * 0.2, cy - r * 1.0, x + r * 0.78, cy - r * 0.55); g.closePath();
    };
    const step = Math.sin(t * (o.walk || 6));
    const foot = (sx, lift) => { rc(g, x + sx * r * 0.5 - r * 0.28 - 1, y - s * 0.12 - lift - 1, r * 0.56 + 2, s * 0.12 + 2, Wh); rc(g, x + sx * r * 0.5 - r * 0.28, y - s * 0.12 - lift, r * 0.56, s * 0.12, K); };
    foot(-1, Math.max(0, step) * s * 0.07 * (o.walk ? 1 : 0)); foot(1, Math.max(0, -step) * s * 0.07 * (o.walk ? 1 : 0));
    g.save();
    body(); g.lineWidth = 3; g.strokeStyle = Wh; g.lineJoin = "round"; g.stroke(); g.fillStyle = Wh; g.fill();
    body(); g.fillStyle = K; g.fill();
    const ex = r * 0.42, ey = cy - r * 0.08, e = Math.max(2, r * 0.42);
    const blink = hash(Math.floor(t * 1.6) + (o.seed || 0) * 17) > 0.8 && wrap(t * 1.6, 1) < 0.3;
    const lookx = Math.sin(t * 0.9 + (o.seed || 0)) * e * 0.18;
    if (mood === 1) {
      line(g, [[x - ex - e * 0.6, ey + e * 0.3], [x - ex, ey - e * 0.5], [x - ex + e * 0.6, ey + e * 0.3]], 1.6, Wh);
      line(g, [[x + ex - e * 0.6, ey + e * 0.3], [x + ex, ey - e * 0.5], [x + ex + e * 0.6, ey + e * 0.3]], 1.6, Wh);
    } else {
      const eh = blink ? 1 : e * 1.25;
      rc(g, x - ex - e / 2, ey - eh / 2, e, eh, Wh); rc(g, x + ex - e / 2, ey - eh / 2, e, eh, Wh);
      if (!blink) { rc(g, x - ex - e * 0.2 + lookx, ey - e * 0.1, e * 0.5, e * 0.6, K); rc(g, x + ex - e * 0.2 + lookx, ey - e * 0.1, e * 0.5, e * 0.6, K); }
    }
    const my = cy + r * 0.42;
    if (mood === 1) { g.fillStyle = Wh; g.beginPath(); g.arc(x, my - r * 0.12, r * 0.38, 0, Math.PI); g.closePath(); g.fill(); }
    else if (mood === 2) {
      line(g, [[x - r * 0.4, my + 1], [x - r * 0.2, my - 1], [x, my + 1], [x + r * 0.2, my - 1], [x + r * 0.4, my + 1]], 1.5, Wh);
      line(g, [[x - ex - e * 0.7, ey - e * 1.0], [x - ex + e * 0.6, ey - e * 1.5]], 1.5, Wh); line(g, [[x + ex + e * 0.7, ey - e * 1.0], [x + ex - e * 0.6, ey - e * 1.5]], 1.5, Wh);
    } else line(g, [[x - r * 0.3, my], [x - r * 0.1, my + r * 0.16], [x + r * 0.1, my + r * 0.16], [x + r * 0.3, my]], 1.5, Wh);
    g.restore();
    if (mood === 2) { // a bead of sweat slides down, over and over
      const k = wrap(t * 0.9 + (o.seed || 0), 1), sx = x + r * 0.95, sy = cy - r * 0.6 + k * r * 1.3;
      g.save(); g.fillStyle = K; g.strokeStyle = Wh; g.lineWidth = 1.5; g.beginPath(); g.arc(sx, sy + 2, 2.4, 0, TAU); g.moveTo(sx - 2, sy + 1); g.lineTo(sx, sy - 3); g.lineTo(sx + 2, sy + 1); g.stroke(); g.fill(); g.restore();
    }
  }
  function sparkle(g, x, y, r, c = K) {
    poly(g, [[x, y - r], [x + r * 0.28, y - r * 0.28], [x + r, y], [x + r * 0.28, y + r * 0.28], [x, y + r], [x - r * 0.28, y + r * 0.28], [x - r, y], [x - r * 0.28, y - r * 0.28]], c);
  }
  function glyph(g, kind, x, y, s, c) {
    switch (kind % 6) {
      case 0: sparkle(g, x, y, s * 0.5, c); break;
      case 1: poly(g, [[x - s * 0.5, y - s * 0.18], [x + s * 0.1, y - s * 0.18], [x + s * 0.1, y - s * 0.45], [x + s * 0.55, y], [x + s * 0.1, y + s * 0.45], [x + s * 0.1, y + s * 0.18], [x - s * 0.5, y + s * 0.18]], c); break;
      case 2: poly(g, [[x - s * 0.3, y - s * 0.5], [x + s * 0.3, y + s * 0.1], [x + s * 0.02, y + s * 0.1], [x + s * 0.16, y + s * 0.5], [x - s * 0.04, y + s * 0.5], [x - s * 0.14, y + s * 0.16], [x - s * 0.3, y + s * 0.34]], c); break;
      case 3: poly(g, [[x + s * 0.1, y - s * 0.55], [x - s * 0.35, y + s * 0.08], [x - s * 0.02, y + s * 0.08], [x - s * 0.12, y + s * 0.55], [x + s * 0.35, y - s * 0.1], [x + s * 0.02, y - s * 0.1]], c); break;
      case 4: poly(g, [[x, y - s * 0.5], [x + s * 0.5, y], [x, y + s * 0.5], [x - s * 0.5, y]], c); break;
      default: rc(g, x - s * 0.4, y - s * 0.4, s * 0.8, s * 0.8, c); rc(g, x - s * 0.18, y - s * 0.18, s * 0.36, s * 0.36, c === K ? Wh : K);
    }
  }

  // ---- landscapes ---------------------------------------------------------------------------------
  const skyOf = (F, key, hz, fn) => {
    const k = key + ":" + hz;
    let c = SKIES.get(k);
    if (!c) { c = atkinson(F.LW, F.LH, fn); SKIES.set(k, c); }
    return c;
  };
  const smooth = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };
  function hillPath(g, F, f) {
    g.beginPath(); g.moveTo(-2, F.LH + 2);
    for (let x = -2; x <= F.LW + 3; x += 3) g.lineTo(x, f(x));
    g.lineTo(F.LW + 3, F.LH + 2); g.closePath();
  }
  function cloud(g, x, y, s, fillC) {
    g.save(); g.fillStyle = fillC; g.strokeStyle = K; g.lineWidth = 1.5;
    g.beginPath(); g.arc(x - s * 0.5, y, s * 0.28, Math.PI * 0.6, Math.PI * 1.5); g.arc(x - s * 0.15, y - s * 0.2, s * 0.32, Math.PI * 1.05, Math.PI * 1.9);
    g.arc(x + s * 0.28, y - s * 0.12, s * 0.28, Math.PI * 1.2, Math.PI * 0.2 + TAU); g.arc(x + s * 0.5, y + s * 0.02, s * 0.22, Math.PI * 1.5, Math.PI * 0.6 + TAU); g.closePath();
    g.fill(); g.stroke(); g.restore();
  }
  function stars(g, F, n, ymax, seed, speed) {
    const { t, LW } = F;
    for (let i = 0; i < n; i++) {
      const x = speed ? wrap(hash(i + seed) * LW - t * speed * (0.4 + hash(i + 9 + seed)), LW) : hash(i + seed) * LW, y = hash(i + 311 + seed) * ymax;
      const tw = hash(i * 7 + Math.floor(t * 2.4 + hash(i) * 6) + seed) > 0.22;
      if (!tw) continue;
      if (i % 6 === 0) { const r = 1 + (Math.sin(t * 3 + i) > 0.2 ? 2 : 1); rc(g, x - r, y, r * 2 + 1, 1, Wh); rc(g, x, y - r, 1, r * 2 + 1, Wh); }
      else rc(g, x, y, i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1, Wh);
    }
  }

  function night(F, g, hz) {
    const { LW, LH, U, t } = F, hy = hz * LH;
    g.drawImage(skyOf(F, "night", hz, (x, y) => (y < hy ? 0.97 - 0.84 * Math.pow(clamp(y / hy), 1.35) : 0.9)), 0, 0);
    stars(g, F, 90, hy * 0.82, 3, 0);
    // aurora curtains: pale dotted ribbons that sway
    for (let b = 0; b < 3; b++) {
      g.beginPath();
      const pts = [];
      for (let x = 0; x <= LW; x += 4) pts.push([x, hy * (0.3 + b * 0.09) + Math.sin(x * 0.03 + t * (0.5 + b * 0.2) + b * 2) * 9 * U]);
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      for (let i = pts.length - 1; i >= 0; i--) g.lineTo(pts[i][0], pts[i][1] + (16 + 8 * Math.sin(pts[i][0] * 0.05 + t)) * U);
      g.closePath(); g.fillStyle = pat(g, b === 1 ? "g25" : "g12", { fg: Wh, bg: null, ox: t * 4 * (b + 1), oy: -t * 2 }); g.fill();
    }
    // the moon, shaded by a dither whose terminator creeps across
    const mx = LW * 0.8, my = hy * 0.34 + Math.sin(t * 0.6) * 2 * U, mr = 31 * U;
    for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU + t * 0.4; rc(g, mx + Math.cos(a) * (mr + 8 * U + Math.sin(t * 2 + i) * 2), my + Math.sin(a) * (mr + 8 * U), 2, 2, Wh); }
    g.save(); g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.clip(); rc(g, mx - mr, my - mr, mr * 2, mr * 2, Wh);
    const ph = Math.sin(t * 0.25) * 0.6;
    dfield(g, mx - mr, my - mr, mr * 2, mr * 2, (x, y) => { const nx = (x - mx) / mr, ny = (y - my) / mr; return clamp(0.12 + (nx - ph) * 0.55 + (ny * ny) * 0.12); }, true);
    for (let i = 0; i < 6; i++) dot(g, mx + (hash(i + 40) - 0.5) * mr * 1.2, my + (hash(i + 50) - 0.5) * mr * 1.2, (2 + hash(i + 60) * 4) * U, "rgba(0,0,0,0.75)");
    g.restore(); g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.lineWidth = 2; g.strokeStyle = K; g.stroke();
    // shooting stars
    for (let m = 0; m < 2; m++) {
      const tt = wrap(t + m * 2.3, 4.6), x0 = LW * (0.15 + 0.5 * hash(Math.floor((t + m * 2.3) / 4.6) + m * 5)), y0 = hy * 0.1 + hash(Math.floor((t + m * 2.3) / 4.6) + 77) * hy * 0.25;
      if (tt < 0.8) { const k = tt / 0.8, hx = x0 - k * 90 * U, hyy = y0 + k * 40 * U; line(g, [[hx + 26 * U, hyy - 11 * U], [hx, hyy]], 1.6, Wh); line(g, [[hx + 26 * U, hyy - 11 * U + 4], [hx + 12 * U, hyy - 2]], 1, Wh, [2, 2]); sparkle(g, hx, hyy, 3 * U, Wh); }
    }
    // hills in three layers, each its own fill
    const spd = [3 * U, 8 * U, 18 * U], base = [hy - 10 * U, hy + 2 * U, hy + 14 * U], amp = [14 * U, 12 * U, 9 * U];
    const H = (l) => (x) => base[l] + amp[l] * Math.sin((x + t * spd[l]) * (0.012 + l * 0.01) + l * 2) + amp[l] * 0.45 * Math.sin((x + t * spd[l]) * (0.031 + l * 0.01) + l * 3.7);
    for (let l = 0; l < 3; l++) {
      const f = H(l);
      hillPath(g, F, f); g.fillStyle = l === 0 ? pat(g, "g50") : l === 1 ? pat(g, "g75") : K; g.fill();
      g.lineWidth = 1.5; g.strokeStyle = K; g.beginPath(); for (let x = -2; x <= LW + 3; x += 3) (x < 0 ? g.moveTo(x, f(x)) : g.lineTo(x, f(x))); g.stroke();
      if (l === 2) { g.strokeStyle = Wh; g.setLineDash([2, 3]); g.lineWidth = 1; g.beginPath(); for (let x = 0; x <= LW; x += 3) (x < 1 ? g.moveTo(x, f(x) + 3) : g.lineTo(x, f(x) + 3)); g.stroke(); g.setLineDash([]); }
      const per = LW * 1.3;
      for (let i = 0; i < 16; i++) {
        const wx = hash(i + l * 31 + 5) * per, x = wrap(wx - t * spd[l], per) - 14;
        if (x < -6 || x > LW + 6) continue;
        const y = f(x), h = (10 + hash(i + l * 17) * 9) * U * (1 - l * 0.12);
        poly(g, [[x, y - h], [x + h * 0.32, y - h * 0.2], [x - h * 0.32, y - h * 0.2]], l === 2 ? K : Wh, K, 1.2);
        poly(g, [[x, y - h * 0.62], [x + h * 0.42, y + 1], [x - h * 0.42, y + 1]], l === 2 ? K : Wh, K, 1.2);
      }
      if (l === 2) { // a cabin whose windows flicker
        const wx = LW * 0.62, x = wrap(wx - t * spd[l], LW * 1.3) - 14, y = f(x);
        if (x > 4 && x < LW - 20) { rc(g, x - 9 * U, y - 11 * U, 18 * U, 11 * U, Wh); fr(g, x - 9 * U, y - 11 * U, 18 * U, 11 * U, 1.5, K); poly(g, [[x - 11 * U, y - 11 * U], [x, y - 20 * U], [x + 11 * U, y - 11 * U]], K); rc(g, x - 5 * U, y - 8 * U, 4 * U, 4 * U, hash(Math.floor(t * 3)) > 0.3 ? Wh : K); rc(g, x + 2 * U, y - 8 * U, 4 * U, 4 * U, hash(Math.floor(t * 3) + 9) > 0.5 ? Wh : K); for (let s = 0; s < 4; s++) { const k = wrap(t * 0.8 + s * 0.25, 1); rc(g, x + 6 * U + Math.sin(k * 6) * 3, y - 22 * U - k * 20 * U, 2, 2, Wh); } }
      }
    }
    // a paper plane glides across, rocking
    const pk = wrap(t / 8, 1), px = lerp(-30, LW + 30, pk), py = hy * 0.5 + Math.sin(pk * TAU * 1.5) * 14 * U, ang = Math.cos(pk * TAU * 1.5) * 0.35;
    g.save(); g.translate(px, py); g.rotate(ang); const ps = 11 * U;
    poly(g, [[-ps, -ps * 0.3], [ps, 0], [-ps * 0.55, ps * 0.5]], Wh, K, 1.6); line(g, [[-ps, -ps * 0.3], [-ps * 0.2, ps * 0.12], [ps, 0]], 1.2, K); g.restore();
  }

  function sea(F, g, hz) {
    const { LW, LH, U, t } = F, hy = hz * LH;
    g.drawImage(skyOf(F, "sea", hz, (x, y) => (y < hy ? 0.5 * Math.pow(1 - clamp(y / hy), 1.6) + 0.04 : 0.1)), 0, 0);
    const sx = LW * 0.72, sy = hy - 16 * U + Math.sin(t * 0.7) * 3 * U, sr = 26 * U;
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU + t * 0.35, r0 = sr + 4 * U, r1 = r0 + (i % 2 ? 7 : 14) * U * (0.8 + 0.2 * Math.sin(t * 3 + i));
      poly(g, [[sx + Math.cos(a - 0.09) * r0, sy + Math.sin(a - 0.09) * r0], [sx + Math.cos(a) * r1, sy + Math.sin(a) * r1], [sx + Math.cos(a + 0.09) * r0, sy + Math.sin(a + 0.09) * r0]], K);
    }
    dot(g, sx, sy, sr + 1.5, K); dot(g, sx, sy, sr - 1.5, Wh);
    for (let i = 0; i < 6; i++) rc(g, sx - sr + 4, sy - sr * 0.55 + i * sr * 0.28 + wrap(t * 6, sr * 0.28), (sr - 4) * 2 * Math.sqrt(Math.max(0, 1 - Math.pow(((i * 0.28 - 0.55 + wrap(t * 6, sr * 0.28) / sr)), 2))) * 0.95 / 1, 1 + i * 0.4, K);
    for (let i = 0; i < 4; i++) cloud(g, wrap(hash(i + 4) * (LW + 120) + t * (3 + i * 1.7) * U, LW + 120) - 60, hy * (0.14 + 0.16 * hash(i + 14)) + 8 * U, (26 + hash(i) * 14) * U, Wh);
    for (let i = 0; i < 4; i++) { // gulls
      const x = wrap(t * (14 + i * 4) * U + i * 130, LW + 60) - 30, y = hy * 0.55 + Math.sin(t * 1.2 + i * 2) * 8 * U + i * 6 * U, w = Math.sin(t * 7 + i) * 4 * U;
      line(g, [[x - 7 * U, y - w], [x - 3 * U, y - 3 * U], [x, y], [x + 3 * U, y - 3 * U], [x + 7 * U, y - w]], 1.8, K);
    }
    const pats = ["g12", "hs", "g25", "hl", "g50", "g75"];
    const surf = (b) => (x) => hy + (b * b * 1.7 + 3) * U + Math.sin((x + t * (9 + b * 8) * U) * (0.05 + b * 0.012) + b * 1.7) * (1.4 + b * 0.8) * U;
    for (let b = 0; b < 6; b++) {
      const f = surf(b);
      hillPath(g, F, f); g.fillStyle = pat(g, pats[b], { ox: -t * (6 + b * 5) * U, oy: b * 2 }); g.fill();
      g.lineWidth = 1.5; g.strokeStyle = K; g.beginPath(); for (let x = -2; x <= LW + 3; x += 3) (x < 0 ? g.moveTo(x, f(x)) : g.lineTo(x, f(x))); g.stroke();
      if (b === 2) { // sailboat riding the third wave
        const bx = LW * 0.3, by = f(bx) - 1, rk = Math.sin(t * 1.3) * 0.1;
        g.save(); g.translate(bx, by); g.rotate(rk);
        poly(g, [[-16 * U, -3 * U], [16 * U, -3 * U], [11 * U, 5 * U], [-11 * U, 5 * U]], K);
        rc(g, -1, -34 * U, 2, 31 * U, K);
        poly(g, [[3 * U, -33 * U], [3 * U, -6 * U], [18 * U, -6 * U]], Wh, K, 1.6); poly(g, [[-3 * U, -30 * U], [-3 * U, -6 * U], [-14 * U, -6 * U]], Wh, K, 1.6);
        line(g, [[0, -34 * U], [4 * U, -37 * U + Math.sin(t * 9) * 1.5], [9 * U, -35 * U], [13 * U, -38 * U + Math.sin(t * 9 + 1) * 1.5]], 1.6, K);
        g.restore();
      }
    }
  }

  function city(F, g, hz) {
    const { LW, LH, U, t } = F, hy = hz * LH;
    g.drawImage(skyOf(F, "city", hz, (x, y) => (y < hy ? 0.88 - 0.8 * Math.pow(clamp(y / hy), 0.9) : 0.5)), 0, 0);
    stars(g, F, 40, hy * 0.6, 29, 0);
    dot(g, LW * 0.16, hy * 0.28, 12 * U, K); dot(g, LW * 0.16, hy * 0.28, 10.5 * U, Wh); dot(g, LW * 0.16 - 3 * U, hy * 0.28 - 2 * U, 2.2 * U, K); dot(g, LW * 0.16 + 4 * U, hy * 0.28 + 3 * U, 3 * U, K); dot(g, LW * 0.16 + 3 * U, hy * 0.28 - 5 * U, 1.5 * U, K);
    // a blimp drifts through, propeller turning
    const bk = wrap(t / 22, 1), bx = lerp(-80 * U, LW + 80 * U, bk), by = hy * 0.3 + Math.sin(t * 0.8) * 4 * U, bw = 46 * U, bh = 15 * U;
    g.save(); g.translate(bx, by);
    poly(g, [[-bw * 0.9, 0], [-bw * 1.25, -bh * 0.9], [-bw * 1.05, 0], [-bw * 1.25, bh * 0.9]], K);
    g.beginPath(); g.ellipse(0, 0, bw, bh, 0, 0, TAU); g.fillStyle = Wh; g.fill(); g.save(); g.clip(); g.fillStyle = pat(g, "vs", { ox: -t * 2 }); g.fillRect(-bw, -bh, bw * 2, bh * 2); rc(g, -bw, -2, bw * 2, 4, K); g.restore();
    g.beginPath(); g.ellipse(0, 0, bw, bh, 0, 0, TAU); g.lineWidth = 2; g.strokeStyle = K; g.stroke();
    rc(g, -9 * U, bh - 1, 18 * U, 6 * U, K); rc(g, -6 * U, bh + 1, 3 * U, 2, Wh); rc(g, 1, bh + 1, 3 * U, 2, Wh);
    const sp = Math.sin(t * 20); line(g, [[-bw * 1.25, -bh * 0.9 * sp], [-bw * 1.25, bh * 0.9 * sp]], 1.6, K);
    g.restore();
    const layers = [{ sp: 4 * U, h: 46, w: [20, 34], p: "g50", n: 22, lit: false }, { sp: 11 * U, h: 62, w: [24, 40], p: null, n: 18, lit: true }];
    layers.forEach((L, li) => {
      const per = LW * 1.5; let x = 0, i = 0;
      const items = [];
      while (x < per && i < 60) { const w = (L.w[0] + hash(i * 3 + li * 99) * (L.w[1] - L.w[0])) * U, h = (14 + hash(i * 5 + li * 71) * L.h) * U; items.push({ x, w, h, i }); x += w + (li ? 2 : 0) * U; i++; }
      const total = x;
      for (const b of items) {
        const sx = wrap(b.x - t * L.sp, total) - 30;
        if (sx > LW + 4 || sx + b.w < -4) continue;
        const top = hy + (li ? 14 : 4) * U - b.h;
        rc(g, sx, top, b.w, LH - top, Wh);
        if (L.p) prc(g, sx, top, b.w, LH - top, L.p, { ox: 0 }); else rc(g, sx, top, b.w, LH - top, K);
        fr(g, sx, top, b.w, Math.min(LH - top, 40 * U), 1.5, K);
        if (L.lit) {
          for (let wy = top + 5 * U; wy < top + b.h - 3 * U; wy += 7 * U) for (let wx = sx + 4 * U; wx < sx + b.w - 4 * U; wx += 7 * U) {
            const on = hash(Math.floor(wx * 3 + wy * 7 + t * 0.5 + b.i * 13)) > 0.45; if (on) rc(g, wx, wy, 3.5 * U, 4 * U, Wh);
          }
          if (b.i % 3 === 0) { rc(g, sx + b.w / 2, top - 9 * U, 1.5, 9 * U, K); rc(g, sx + b.w / 2 - 1, top - 11 * U, 3, 3, Math.sin(t * 4 + b.i) > 0 ? Wh : K); }
          if (b.i % 4 === 1) { rc(g, sx + 3 * U, top - 7 * U, 9 * U, 7 * U, K); line(g, [[sx + 3 * U, top - 7 * U], [sx + 7.5 * U, top - 11 * U], [sx + 12 * U, top - 7 * U]], 1.5, K); }
        }
      }
    });
    // an all-night tram on the street
    const ty = LH - 34 * U, tk = wrap(t * 26 * U, LW + 200 * U) - 110 * U;
    for (let c = 0; c < 3; c++) {
      const x = tk + c * 52 * U;
      rc(g, x, ty - 22 * U, 48 * U, 22 * U, Wh); fr(g, x, ty - 22 * U, 48 * U, 22 * U, 2, K); rc(g, x, ty - 8 * U, 48 * U, 4 * U, K);
      for (let w = 0; w < 4; w++) rc(g, x + 4 * U + w * 11 * U, ty - 18 * U, 8 * U, 7 * U, hash(c * 5 + w + Math.floor(t * 0.4)) > 0.2 ? K : Wh);
      for (const wx of [8, 38]) { dot(g, x + wx * U, ty + 1, 3.2 * U, K); dot(g, x + wx * U, ty + 1, 1.2 * U, Wh); rc(g, x + wx * U - 1, ty + 1 - 2 * Math.cos(t * 12) , 2, 2, Wh); }
    }
    rc(g, 0, ty + 3 * U, LW, 2, K);
  }

  function space(F, g, hz) {
    const { LW, LH, U, t } = F, hy = hz * LH;
    g.drawImage(skyOf(F, "space", hz, (x, y) => clamp(0.93 - 0.55 * Math.exp(-(Math.pow((x - LW * 0.2) / (LW * 0.4), 2) + Math.pow((y - LH * 0.35) / (LH * 0.25), 2))) - 0.35 * Math.exp(-(Math.pow((x - LW * 0.8) / (LW * 0.3), 2) + Math.pow((y - LH * 0.7) / (LH * 0.3), 2))))), 0, 0);
    for (let l = 0; l < 3; l++) stars(g, F, 40, LH, 100 * l + 7, (3 + l * 5) * U);
    const cx = LW * 0.72, cy = Math.min(LH * 0.4, hy * 0.78 + 14 * U), pr = (F.statement ? 50 : 38) * U, rk = pr * 1.95, tilt = -0.32;
    const ring = (front) => {
      g.save(); g.translate(cx, cy); g.rotate(tilt);
      for (const [rad, w, col] of [[rk, 5 * U, Wh], [rk * 0.84, 3 * U, Wh], [rk * 0.72, 2, Wh]]) { g.beginPath(); g.ellipse(0, 0, rad, rad * 0.26, 0, front ? 0 : Math.PI, front ? Math.PI : TAU); g.lineWidth = w + 3; g.strokeStyle = col; g.stroke(); }
      for (const [rad, w] of [[rk, 5 * U], [rk * 0.84, 3 * U], [rk * 0.72, 2]]) { g.beginPath(); g.ellipse(0, 0, rad, rad * 0.26, 0, front ? 0 : Math.PI, front ? Math.PI : TAU); g.lineWidth = Math.max(1.2, w - 2); g.strokeStyle = K; g.setLineDash([6, 3]); g.lineDashOffset = -t * 6; g.stroke(); g.setLineDash([]); }
      g.restore();
    };
    ring(false);
    g.save(); g.beginPath(); g.arc(cx, cy, pr, 0, TAU); g.clip(); rc(g, cx - pr, cy - pr, pr * 2, pr * 2, Wh);
    dfield(g, cx - pr, cy - pr, pr * 2, pr * 2, (x, y) => { const nx = (x - cx) / pr, ny = (y - cy) / pr; const band = 0.16 * Math.sin(ny * 7 + t * 0.7 + Math.sin(nx * 3 + t * 0.4)); return clamp(0.08 + 0.7 * ((nx + ny) * 0.5 + 0.5) * 0.9 + band + (nx * nx + ny * ny) * 0.15); }, true);
    g.restore(); g.beginPath(); g.arc(cx, cy, pr, 0, TAU); g.lineWidth = 2.5; g.strokeStyle = Wh; g.stroke(); g.lineWidth = 1.5; g.strokeStyle = K; g.stroke();
    ring(true);
    const oa = t * 0.9, mxx = cx + Math.cos(oa) * pr * 2.5, myy = cy + Math.sin(oa) * pr * 0.55 - pr * 0.1, mr = 7 * U;
    if (Math.sin(oa) > 0) { dot(g, mxx, myy, mr + 1.5, Wh); dot(g, mxx, myy, mr, K); dot(g, mxx - 2, myy - 2, 2, Wh); }
    else { dot(g, mxx, myy, mr + 1.5, Wh); dot(g, mxx, myy, mr, K); }
    // a comet crosses with a beaded tail
    const ck = wrap(t / 6, 1), hx = lerp(LW + 20, -40, ck), hyy = lerp(LH * 0.05, LH * 0.5, ck);
    for (let i = 14; i >= 0; i--) { const k = i / 14, px = hx + k * 70 * U, py = hyy - k * 35 * U + Math.sin(k * 9 + t * 5) * 2, r = (1 - k) * 4 * U + 1; if (hash(i + Math.floor(t * 12)) > k * 0.6) dot(g, px, py, r, Wh); }
    dot(g, hx, hyy, 5 * U, Wh); dot(g, hx, hyy, 3.5 * U, K); sparkle(g, hx - 1, hyy - 1, 2.5 * U, Wh);
    // a satellite turning its panels toward the sun
    const sk = wrap(t / 14 + 0.3, 1), sx = lerp(-30, LW + 30, sk), sy = LH * 0.18 + Math.sin(sk * TAU * 2) * 10 * U, pw = Math.abs(Math.cos(t * 1.1)) * 9 * U + 2;
    rc(g, sx - 5 * U, sy - 4 * U, 10 * U, 8 * U, Wh); rc(g, sx - 4 * U, sy - 3 * U, 8 * U, 6 * U, K);
    for (const sg of [-1, 1]) { rc(g, sx + sg * 6 * U - (sg < 0 ? pw : 0), sy - 3 * U, pw, 6 * U, Wh); fr(g, sx + sg * 6 * U - (sg < 0 ? pw : 0), sy - 3 * U, pw, 6 * U, 1, K); }
    line(g, [[sx, sy - 4 * U], [sx, sy - 9 * U]], 1.5, Wh); rc(g, sx - 1, sy - 11 * U, 3, 3, Math.sin(t * 5) > 0 ? Wh : K);
  }

  function burst(F, g, hz) {
    const { LW, LH, U, t } = F, cx = LW * 0.34, cy = hz * LH * 0.9, Rr = Math.hypot(LW, LH);
    rc(g, 0, 0, LW, LH, Wh);
    const n = 28, rot = t * 0.14;
    for (let i = 0; i < n; i++) {
      const a0 = rot + (i / n) * TAU, a1 = a0 + TAU / n / 2;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a0) * Rr, cy + Math.sin(a0) * Rr); g.lineTo(cx + Math.cos(a1) * Rr, cy + Math.sin(a1) * Rr); g.closePath();
      g.fillStyle = i % 4 === 0 ? K : i % 4 === 2 ? pat(g, "g50", { ox: t * 6, oy: t * 3 }) : pat(g, "dt", { ox: t * 8 * (i % 2 ? 1 : -1) }); g.fill();
    }
    for (let r = 0; r < 5; r++) { const k = wrap(t * 0.35 + r / 5, 1), rr = k * Rr * 0.7; g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.lineWidth = 2 + 4 * (1 - k); g.strokeStyle = Wh; g.stroke(); g.lineWidth = 1.5; g.setLineDash([5, 4]); g.lineDashOffset = -t * 12; g.strokeStyle = K; g.stroke(); g.setLineDash([]); }
    dot(g, cx, cy, 30 * U, Wh); dot(g, cx, cy, 25 * U, K);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU - t * 0.9, rr = 41 * U + Math.sin(t * 2 + i) * 4 * U; dot(g, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 5 * U, K); dot(g, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 2.5 * U, Wh); }
    sparkle(g, cx, cy, (15 + Math.sin(t * 4) * 3) * U, Wh);
    // halftone dots swell across the right
    for (let gy = 0; gy < LH; gy += 7 * U) for (let gx = LW * 0.55; gx < LW; gx += 7 * U) {
      const k = (gx - LW * 0.55) / (LW * 0.45), r = (0.4 + 2.6 * k * (0.6 + 0.4 * Math.sin(gy * 0.03 + t * 1.6))) * U; dot(g, gx + ((gy / (7 * U)) % 2) * 3.5 * U, gy, r + 1.2, Wh); dot(g, gx + ((gy / (7 * U)) % 2) * 3.5 * U, gy, r, K);
    }
  }

  const THEMES = [night, sea, city, space, burst];
  function world(F) {
    const { g, idx, info, LW, LH, cv, U } = F;
    THEMES[idx % 5](F, g, F.hz);
    if (idx > 0 && info.local < info.change) {
      const q = clamp(info.local / Math.max(0.01, info.change)), kind = idx % 4;
      const bg = cv.lb.getContext("2d"), mg = cv.lm.getContext("2d");
      for (const c of [bg, mg]) { c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = "source-over"; c.setLineDash([]); c.imageSmoothingEnabled = false; c.clearRect(0, 0, LW, LH); }
      THEMES[(idx - 1) % 5](F, bg, idx === 1 ? HZ_STATEMENT : F.hz);
      // the mask is where the old landscape is still showing; the new one opens through it
      mg.fillStyle = Wh;
      if (kind === 0) { mg.beginPath(); mg.rect(0, 0, LW, LH); mg.arc(LW * 0.5, LH * 0.5, q * Math.hypot(LW, LH) * 0.52, 0, TAU); mg.fill("evenodd"); }
      else if (kind === 1) { const nb = 16, bw = LW / nb; for (let i = 0; i < nb; i++) { const w = (1 - q) * bw; mg.fillRect(i * bw + (bw - w) / 2, 0, w, LH); } }
      else if (kind === 2) { const s = 9 * U; for (let y = 0; y < LH; y += s) for (let x = 0; x < LW; x += s) if (hash(Math.floor(x / s) * 131 + Math.floor(y / s) * 17 + idx * 7) > q) mg.fillRect(x, y, s, s); }
      else { const sp = 12 * U; for (let y = 0; y < LH; y += sp) mg.fillRect(Math.max(0, q * (LW + LH) - y), y, LW, sp); }
      bg.globalCompositeOperation = "destination-in"; bg.drawImage(cv.lm, 0, 0); bg.globalCompositeOperation = "source-over";
      g.drawImage(cv.lb, 0, 0);
    }
  }

  // ---- the desktop: menu bar, tool palette, meters and status bar ------------------------------
  function toolIcon(g, k, cx, cy, s, c, T) {
    switch (k % 6) {
      case 0: line(g, [[cx - s * 0.32, cy + s * 0.32], [cx + s * 0.22, cy - s * 0.22]], 2.4, c); poly(g, [[cx + s * 0.22, cy - s * 0.22], [cx + s * 0.38, cy - s * 0.38], [cx + s * 0.38, cy - s * 0.1]], c); poly(g, [[cx - s * 0.32, cy + s * 0.32], [cx - s * 0.4, cy + s * 0.4], [cx - s * 0.18, cy + s * 0.38]], c); break;
      case 1: line(g, [[cx + s * 0.35, cy - s * 0.35], [cx - s * 0.05, cy + s * 0.05]], 2.2, c); dot(g, cx - s * 0.16, cy + s * 0.16, s * 0.2, c); break;
      case 2: poly(g, [[cx - s * 0.32, cy - s * 0.1], [cx + s * 0.18, cy - s * 0.1], [cx + s * 0.08, cy + s * 0.36], [cx - s * 0.22, cy + s * 0.36]], c); line(g, [[cx - s * 0.1, cy - s * 0.1], [cx + s * 0.1, cy - s * 0.4], [cx + s * 0.34, cy - s * 0.2]], 1.6, c); dot(g, cx + s * 0.36, cy + s * 0.12 + Math.abs(Math.sin(T * 3)) * s * 0.1, s * 0.07, c); break;
      case 3: poly(g, [[cx - s * 0.38, cy + s * 0.12], [cx - s * 0.08, cy - s * 0.32], [cx + s * 0.38, cy - s * 0.08], [cx + s * 0.08, cy + s * 0.34]], null, c, 2); line(g, [[cx - s * 0.12, cy + s * 0.04], [cx + s * 0.18, cy + s * 0.22]], 1.4, c); break;
      case 4: g.save(); g.strokeStyle = c; g.lineWidth = 1.6; g.setLineDash([3, 2]); g.lineDashOffset = -T * 8; g.beginPath(); g.ellipse(cx, cy - s * 0.06, s * 0.36, s * 0.26, 0, 0, TAU); g.stroke(); g.restore(); line(g, [[cx - s * 0.1, cy + s * 0.2], [cx - s * 0.2, cy + s * 0.4]], 1.6, c); break;
      default: for (let i = 0; i < 9; i++) rc(g, cx - s * 0.3 + hash(i + Math.floor(T * 6) * 3) * s * 0.6, cy - s * 0.3 + hash(i + 20 + Math.floor(T * 6) * 3) * s * 0.6, 2, 2, c); poly(g, [[cx - s * 0.36, cy + s * 0.36], [cx - s * 0.2, cy + s * 0.2], [cx - s * 0.12, cy + s * 0.34]], c);
    }
  }
  const SWATCH = ["g12", "g25", "g50", "g75", "hl", "dg", "br", "wv"];
  function chrome(F) {
    const { g, LW, LH, U, t, side, info } = F;
    const MB = 22 * U;
    // menu bar
    rc(g, 0, 0, LW, MB, Wh); rc(g, 0, MB, LW, 2, K);
    glyph(g, 4, 11 * U, MB / 2, 13 * U, K); sparkle(g, 11 * U, MB / 2, 3 * U, Wh);
    txt(g, "FILE EDIT INK VIEW", 24 * U, MB / 2 + 1, 14 * U, { w: 800 });
    const mm = String(Math.floor(t / 60)).padStart(2, "0"), ss = String(Math.floor(t % 60)).padStart(2, "0");
    txt(g, `${mm}:${ss}`, LW - 6 * U, MB / 2 + 1, 14 * U, { align: "right" });
    if (Math.sin(t * 5) > -0.2) dot(g, LW - 62 * U, MB / 2, 3.5 * U, K);
    // tool palette, down the left margin
    const ts = Math.min(side - 8 * U, 30 * U), x0 = (side - ts) / 2, sel = Math.floor(t * 1.1) % 6;
    for (let i = 0; i < 6; i++) {
      const y = MB + 10 * U + i * (ts + 4 * U), on = i === sel;
      rc(g, x0 + 2, y + 2, ts, ts, K); rc(g, x0, y, ts, ts, on ? K : Wh); fr(g, x0, y, ts, ts, 2, K);
      toolIcon(g, i, x0 + ts / 2, y + ts / 2, ts * 0.8, on ? Wh : K, t);
      if (on) { g.save(); g.strokeStyle = K; g.lineWidth = 1; g.setLineDash([3, 3]); g.lineDashOffset = -t * 10; g.strokeRect(x0 - 2.5, y - 2.5, ts + 5, ts + 5); g.restore(); }
    }
    const sy0 = MB + 14 * U + 6 * (ts + 4 * U);
    for (let i = 0; i < 4; i++) {
      const y = sy0 + i * (13 * U + 3 * U), on = i === Math.floor(t * 0.9) % 4;
      prc(g, x0, y, ts, 13 * U, SWATCH[(i * 2 + 1) % 8], { ox: on ? t * 6 : 0 }); fr(g, x0, y, ts, 13 * U, on ? 3 : 1.5, K);
    }
    // level meters down the right margin
    const rx = LW - side + (side - ts) / 2, my0 = MB + 10 * U, mh = LH - 24 * U - 12 * U - my0;
    rc(g, rx + 2, my0 + 2, ts, mh, K); rc(g, rx, my0, ts, mh, Wh); fr(g, rx, my0, ts, mh, 2, K);
    const nb = Math.floor((mh - 6) / (5 * U));
    for (let i = 0; i < nb; i++) {
      const e = Math.abs(Math.sin(t * (1.4 + hash(i * 5) * 3.2) + i * 1.3)) * (0.5 + 0.5 * Math.sin(t * 0.6 + i * 0.2) ** 2), len = (ts - 8) * clamp(0.1 + e);
      rc(g, rx + 4, my0 + 4 + i * 5 * U, len, 3 * U, K); if (i % 5 === 0) rc(g, rx + ts - 6, my0 + 4 + i * 5 * U, 2, 3 * U, K);
    }
    // status bar
    const by = LH - 24 * U;
    rc(g, 0, by, LW, 24 * U, Wh); rc(g, 0, by, LW, 2, K);
    const sw = 17 * U, swSel = Math.floor(t * 1.6) % 8;
    for (let i = 0; i < 8; i++) {
      const x = 6 * U + i * (sw + 3 * U);
      prc(g, x, by + 5 * U, sw, 14 * U, SWATCH[i], { ox: i === swSel ? t * 8 : 0 }); fr(g, x, by + 5 * U, sw, 14 * U, i === swSel ? 3 : 1.5, K);
    }
    const px0 = 6 * U + 8 * (sw + 3 * U) + 8 * U, px1 = LW - 74 * U, prog = clamp(t / Math.max(0.1, info.length));
    if (px1 - px0 > 30 * U) {
      rc(g, px0, by + 9 * U, px1 - px0, 7 * U, Wh); fr(g, px0, by + 9 * U, px1 - px0, 7 * U, 1.5, K);
      prc(g, px0 + 2, by + 11 * U, (px1 - px0 - 4) * prog, 3 * U, "dt", { ox: -t * 10 });
      pip(g, px0 + (px1 - px0) * prog, by + 23 * U, 20 * U, { t, walk: 9, seed: 3 });
    }
    txt(g, "FRM " + String(Math.floor(t * 30) % 10000).padStart(4, "0"), LW - 6 * U, by + 13 * U, 14 * U, { align: "right" });
  }

  // ---- windows ------------------------------------------------------------------------------------
  function chromeWin(g, F, x, y, w, h, title, T, o = {}) {
    const U = F.U, tb = (o.tb || 17) * U;
    rc(g, x + 3, y + 3, w, h, K); rc(g, x, y, w, h, Wh); fr(g, x, y, w, h, 2, K);
    for (let r = y + 4; r < y + tb - 3; r += 2) rc(g, x + 2, r, w - 4, 1, K);
    g.font = fontOf(o.fs || 14 * U, {}); const tw = g.measureText(title).width;
    rc(g, x + w / 2 - tw / 2 - 6 * U, y + 2, tw + 12 * U, tb - 3, Wh);
    txt(g, title, x + w / 2, y + tb / 2 + 1, o.fs || 14 * U, { align: "center" });
    const bs = tb - 7;
    rc(g, x + 6 * U, y + 4, bs, bs, Wh); fr(g, x + 6 * U, y + 4, bs, bs, 2, K);
    if (Math.floor(T * 1.5) % 4 === 0) rc(g, x + 6 * U + 3, y + 7, bs - 6, bs - 6, K);
    rc(g, x + w - 6 * U - bs, y + 4, bs, bs, Wh); fr(g, x + w - 6 * U - bs, y + 4, bs, bs, 2, K); fr(g, x + w - 6 * U - bs + 3, y + 7, bs - 7, bs - 7, 1, K);
    rc(g, x, y + tb - 1, w, 2, K);
    return { x: x + 2, y: y + tb + 1, w: w - 4, h: h - tb - 3 };
  }
  function scrollBar(g, F, c, T, ph) {
    const U = F.U, bw = 9 * U, x = c.x + c.w - bw;
    rc(g, x, c.y, bw, c.h, Wh); rc(g, x, c.y, 2, c.h, K); prc(g, x + 2, c.y + 2, bw - 3, c.h - 4, "g25");
    const th = c.h * 0.28, ty = c.y + 3 + (c.h - th - 6) * (0.5 - 0.5 * Math.cos(T * 0.9 + ph));
    rc(g, x + 2, ty, bw - 2, th, Wh); fr(g, x + 2, ty, bw - 2, th, 2, K);
    poly(g, [[x + bw / 2 + 0.5, c.y + 3], [x + bw - 1, c.y + 3 + 4 * U], [x + 3, c.y + 3 + 4 * U]], K);
    poly(g, [[x + bw / 2 + 0.5, c.y + c.h - 3], [x + bw - 1, c.y + c.h - 3 - 4 * U], [x + 3, c.y + c.h - 3 - 4 * U]], K);
    return { x: c.x, y: c.y, w: c.w - bw, h: c.h };
  }
  function miniWin(g, F, x, y, w, h, title, k, T) {
    const c = chromeWin(g, F, x, y, w, h, title, T, { tb: 16, fs: 13 * F.U });
    g.save(); g.beginPath(); g.rect(c.x, c.y, c.w, c.h); g.clip();
    prc(g, c.x, c.y, c.w, c.h, "pt");
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2, s = Math.min(c.w, c.h) * 0.36;
    if (k === 0) {
      const V = [];
      for (let i = 0; i < 8; i++) V.push([(i & 1 ? 1 : -1), (i & 2 ? 1 : -1), (i & 4 ? 1 : -1)]);
      const ay = T * 0.9, ax = T * 0.6, P2 = V.map(([a, b, d]) => { const x1 = a * Math.cos(ay) + d * Math.sin(ay), z1 = -a * Math.sin(ay) + d * Math.cos(ay), y1 = b * Math.cos(ax) - z1 * Math.sin(ax), z2 = b * Math.sin(ax) + z1 * Math.cos(ax), f = 1 / (1 - z2 * 0.18); return [cx + x1 * s * f * 0.8, cy + y1 * s * f * 0.8, z2]; });
      const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
      for (const [a, b] of E) line(g, [[P2[a][0], P2[a][1]], [P2[b][0], P2[b][1]]], 1.8, K);
      for (const p of P2) rc(g, p[0] - 1.5, p[1] - 1.5, 3, 3, K);
    } else if (k === 1) {
      const pts = []; for (let x2 = 0; x2 <= c.w; x2 += 2) pts.push([c.x + x2, cy - 3 + Math.sin((x2 + T * 40) * 0.12) * s * 0.4 + Math.sin((x2 - T * 70) * 0.31) * s * 0.18]);
      line(g, pts, 2, K);
      const nb = Math.max(5, Math.floor(c.w / 8)); for (let i = 0; i < nb; i++) { const hh = (0.2 + 0.8 * Math.abs(Math.sin(T * (2 + hash(i) * 3) + i))) * s * 0.5; rc(g, c.x + 3 + i * (c.w - 6) / nb, c.y + c.h - 2 - hh, (c.w - 6) / nb - 2, hh, K); }
    } else {
      dot(g, cx, cy, s, K); dot(g, cx, cy, s - 2, Wh);
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; line(g, [[cx + Math.cos(a) * (s - 2), cy + Math.sin(a) * (s - 2)], [cx + Math.cos(a) * (s - (i % 3 ? 5 : 8)), cy + Math.sin(a) * (s - (i % 3 ? 5 : 8))]], 1.5, K); }
      const sa = Math.floor(T * 2) / 2 * (TAU / 60) * 2 * 6 - Math.PI / 2, ma = (T / 60) * TAU * 6 - Math.PI / 2;
      line(g, [[cx, cy], [cx + Math.cos(ma) * s * 0.55, cy + Math.sin(ma) * s * 0.55]], 2.4, K); line(g, [[cx, cy], [cx + Math.cos(sa) * s * 0.85, cy + Math.sin(sa) * s * 0.85]], 1.2, K); dot(g, cx, cy, 2, K);
    }
    g.restore();
  }
  // the title and closing scenes have no drawing of their own, so the desktop supplies one
  function statementArt(F) {
    const { g, LW, LH, U, t, side } = F;
    const avail = LW - side * 2, sw = Math.min(110 * U, (avail - 16 * U) / 3), sh = sw * 0.6 + 16 * U, gap = (avail - sw * 3) / 2;
    const names = ["CUBE", "WAVE", "TIME"];
    for (let i = 0; i < 3; i++) miniWin(g, F, side + i * (sw + gap), 30 * U + Math.sin(t * 1.1 + i * 2) * 1.5 * U, sw, sh, names[i], i, t);
    const h = 26 * U, ty = LH - 24 * U - h - 12 * U;
    rc(g, 0, ty - 4, LW, h + 8, Wh); rc(g, 0, ty, LW, h, K);
    for (let x = -wrap(t * 22 * U, 8); x < LW; x += 8) { rc(g, x, ty - 3, 4, 2, K); rc(g, x + 4, ty + h + 1, 4, 2, K); }
    const sp = 38 * U, shift = Math.floor((t * 26 * U) / sp);
    for (let i = -1; i < LW / sp + 2; i++) glyph(g, (i + shift) % 6 + 6, i * sp + sp / 2 - wrap(t * 26 * U, sp), ty + h / 2, 15 * U, Wh);
    pip(g, wrap(t * 24 * U, LW + 60 * U) - 30 * U, ty - 5, 30 * U, { t, walk: 10, seed: 5, mood: 1 });
    pip(g, wrap(-t * 18 * U + LW * 0.5, LW + 60 * U) - 30 * U, ty - 5, 24 * U, { t: t + 1, walk: 8, seed: 11 });
  }
  // fine screen grain, dust and a slow raster bar; scaled by the texture control
  function finish(F) {
    const { g, LW, LH, t, tex, U } = F;
    if (tex <= 0.02) return;
    const step = Math.floor(t * 12);
    g.save();
    const bandY = wrap(t * 38 * U, LH + 40 * U) - 20 * U;
    if (tex > 0.3) { g.globalAlpha = 1; g.fillStyle = pat(g, "g12", { fg: K, bg: null, ox: step }); g.fillRect(0, bandY, LW, 14 * U); }
    const n = Math.floor(260 * tex);
    for (let i = 0; i < n; i++) { const x = hash(i * 7 + step * 131) * LW, y = hash(i * 13 + step * 71 + 5) * LH; rc(g, x, y, 1, 1, hash(i + step) > 0.5 ? K : Wh); }
    for (let i = 0; i < Math.floor(5 * tex); i++) { const x = hash(i + 900 + Math.floor(t * 2) * 17) * LW, y = hash(i + 950 + Math.floor(t * 2) * 31) * LH; rc(g, x, y, 1 + (i % 3), 1, K); }
    g.restore();
  }

  // ---- scenes ------------------------------------------------------------------------------------
  const stagger = (p, i, n, spread = 0.5) => ease((p - (i / Math.max(1, n)) * spread) / (1 - spread));
  function drift(g, F, c, T, seed, n) {
    for (let i = 0; i < n; i++) {
      const sp = (4 + hash(i + seed) * 9) * F.U, x = c.x + hash(i * 3 + seed) * c.w, y = c.y + c.h - wrap(T * sp + hash(i + seed + 50) * c.h, c.h), s = 2 + Math.floor(hash(i + seed + 9) * 3);
      if (i % 3) fr(g, x, y, s + 1, s + 1, 1, K); else rc(g, x, y, s, s, K);
    }
  }
  const NUM = (v, d) => M.formatNumber(v, 0, d.prefix, d.suffix);

  function drawChart(g, F, c, p, d, T) {
    const U = F.U, n = d.values.length, max = Math.max(...d.values, 1), vert = c.h > c.w * 1.1;
    const lab = 14 * U, valS = (vert ? 27 : 32) * U;
    rc(g, c.x, c.y, c.w, c.h, Wh); prc(g, c.x, c.y, c.w, c.h, "pt"); drift(g, F, c, T, 3, 16);
    const base = c.y + c.h - lab - 12 * U, hmax = base - (c.y + valS * 1.2 + 32 * U);
    for (let k = 1; k <= 4; k++) { const y = base - (hmax * k) / 4; line(g, [[c.x + 8 * U, y], [c.x + c.w - 6 * U, y]], 1, K, [1, 4]); rc(g, c.x + 3 * U, y - 1, 5 * U, 2, K); }
    const sy = c.y + c.h - wrap(T * 0.4, 1) * c.h;
    g.fillStyle = pat(g, "g25", { fg: K, bg: null, oy: T * 3 }); g.fillRect(c.x, sy - 5 * U, c.w, 10 * U);
    const slot = (c.w - 18 * U) / n, x0 = c.x + 9 * U, hot = clamp(d.highlight | 0, 0, n - 1), pats = ["g50", "dt", "br", "hl", "wv", "g25"], tops = [];
    for (let i = 0; i < n; i++) {
      const v = d.values[i], q = stagger(p, i, n), xc = x0 + slot * (i + 0.5), bw = Math.min(slot * 0.62, 84 * U), hf = (hmax * v) / max, isHot = i === hot;
      const h = hf * q + (q >= 1 ? Math.sin(T * 3 + i * 1.3) * 1.3 * U : 0);
      if (q < 1) {
        g.fillStyle = pat(g, "g12", { fg: K, bg: null, oy: T * 4 }); g.fillRect(xc - bw / 2, base - hf, bw, hf);
        line(g, [[xc - bw / 2, base], [xc - bw / 2, base - hf], [xc + bw / 2, base - hf], [xc + bw / 2, base]], 1.4, K, [3, 3], -T * 9);
      }
      if (h > 1) {
        const bx = xc - bw / 2, by = base - h;
        rc(g, bx + 3, by + 3, bw, h, K);
        rc(g, bx, by, bw, h, Wh);
        if (isHot) { rc(g, bx, by, bw, h, K); g.fillStyle = pat(g, "dt", { fg: Wh, bg: null, ox: T * 10 }); g.fillRect(bx + 3, by + 3, bw - 6, Math.max(0, h - 6)); rc(g, bx + 3, by + 3, bw - 6, 3, Wh); }
        else { prc(g, bx, by, bw, h, pats[i % pats.length], { ox: i % 2 ? T * 5 : 0 }); fr(g, bx, by, bw, h, 2, K); rc(g, bx + 2, by + 2, bw - 4, 2, Wh); }
        if (q > 0.04) txt(g, NUM(v * q, d), xc, by - valS * 0.62, valS, { align: "center", w: 900, f: BLACK, halo: 5, maxW: slot * 1.05, min: 26 * U });
      }
      tops.push([xc, base - h, q]);
      txt(g, d.labels[i] || "", xc, base + 8 * U + lab / 2, lab, { align: "center", maxW: slot * 0.98, min: 12 * U });
    }
    rc(g, c.x + 6 * U, base, c.w - 12 * U, 2, K); prc(g, c.x + 6 * U, base + 3, c.w - 12 * U, 3 * U, "dg", { ox: T * 8 });
    const pts = tops.filter((t2) => t2[2] > 0.3).map((t2) => [t2[0], t2[1] - 7 * U]);
    if (pts.length > 1) line(g, pts, 2.2, K, [5, 3], -T * 14);
    for (const [x, y] of pts) { rc(g, x - 3, y - 3, 6, 6, Wh); fr(g, x - 3, y - 3, 6, 6, 2, K); }
    const hx = x0 + slot * (hot + 0.5), htop = base - (hmax * d.values[hot]) / max;
    const hop = Math.abs(Math.sin(T * 3.2)) * 7 * U * span(p, 0.5, 0.8);
    pip(g, hx, htop - valS * 1.18 - 3, 28 * U, { t: T, mood: p > 0.75 ? 1 : 0, hop, seed: 2 });
    for (let k = 0; k < 3; k++) { const a = T * 1.6 + (k * TAU) / 3, rr = 26 * U; sparkle(g, hx + Math.cos(a) * rr, htop - valS * 0.8 + Math.sin(a) * rr * 0.55, (3 + Math.sin(T * 5 + k) * 1.2) * U, K); }
  }

  function drawObject(g, F, c, p, d, T) {
    const U = F.U, vert = c.h > c.w * 1.05, phone = d.kind === "phone";
    rc(g, c.x, c.y, c.w, c.h, Wh); prc(g, c.x, c.y, c.w, c.h, "pt"); drift(g, F, c, T, 31, 14);
    let dw, dh;
    if (phone) { dh = vert ? c.h * 0.5 : c.h - 28 * U; dw = dh * 0.54; } else { dw = vert ? c.w - 22 * U : Math.min(c.w * 0.54, c.h * 1.32); dh = dw * 0.62; }
    const dx = vert ? c.x + (c.w - dw) / 2 : c.x + 16 * U, dy = c.y + (vert ? 14 * U : (c.h - dh - (phone ? 0 : 10 * U)) / 2);
    const q = ease(p * 1.5), bez = (phone ? 6 : 5) * U;
    for (let k = 0; k < 5; k++) { // radar rings spread from the device across the whole window
      const f = wrap(T * 0.22 + k / 5, 1), rr = f * Math.max(c.w, c.h) * 0.75;
      g.save(); g.beginPath(); g.arc(dx + dw / 2, dy + dh / 2, rr, 0, TAU); g.lineWidth = 4 * (1 - f) + 1; g.strokeStyle = K; g.setLineDash([6, 5]); g.lineDashOffset = -T * 10; g.stroke(); g.restore();
    }
    rc(g, dx + 3, dy + 3, dw, dh, K); rc(g, dx, dy, dw, dh, K);
    const ix = dx + bez, iy = dy + bez + (phone ? 3 * U : 0), iw = dw - bez * 2, ih = dh - bez * 2 - (phone ? 6 * U : 0);
    const on = span(q, 0, 0.35), sh = Math.max(2, ih * on);
    g.save(); g.beginPath(); g.rect(ix, iy + (ih - sh) / 2, iw, sh); g.clip();
    rc(g, ix, iy, iw, ih, Wh);
    // preview: a tiny sunrise over rolling hills
    const pw = phone ? iw - 6 * U : iw * 0.62, ph = ih * (phone ? 0.46 : 0.5), px = ix + 3 * U, py = iy + 3 * U;
    rc(g, px, py, pw, ph, Wh); prc(g, px, py, pw, ph, "g25", { oy: T * 2 });
    const sk = 0.5 - 0.5 * Math.cos(T * 0.8), sx = px + pw * 0.68, sy = py + ph * (0.78 - 0.42 * sk);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU + T; line(g, [[sx + Math.cos(a) * 7 * U, sy + Math.sin(a) * 7 * U], [sx + Math.cos(a) * 11 * U, sy + Math.sin(a) * 11 * U]], 1.4, K); }
    dot(g, sx, sy, 6 * U, K); dot(g, sx, sy, 4.5 * U, Wh);
    g.beginPath(); g.moveTo(px, py + ph); for (let x = 0; x <= pw; x += 3) g.lineTo(px + x, py + ph * 0.8 + Math.sin((x + T * 12) * 0.09) * ph * 0.07 + Math.sin((x - T * 7) * 0.2) * ph * 0.03); g.lineTo(px + pw, py + ph); g.closePath(); g.fillStyle = K; g.fill();
    const bx = wrap(T * 14, pw + 30) - 10; line(g, [[px + bx - 4, py + ph * 0.3 - Math.sin(T * 9) * 2], [px + bx, py + ph * 0.3 + 1], [px + bx + 4, py + ph * 0.3 - Math.sin(T * 9) * 2]], 1.4, K);
    fr(g, px, py, pw, ph, 2, K);
    if (!phone) {
      const nx = px + pw + 5 * U, nw = iw - pw - 9 * U;
      for (let i = 0; i < 4; i++) { const y = py + 6 * U + i * (ph - 8 * U) / 3, k = 0.5 + 0.42 * Math.sin(T * (1 + i * 0.6) + i); line(g, [[nx, y], [nx + nw, y]], 1.5, K); rc(g, nx + (nw - 4 * U) * k, y - 3 * U, 4 * U, 6 * U, K); rc(g, nx + (nw - 4 * U) * k + 1, y - 2 * U, 2 * U, 4 * U, Wh); }
    }
    const ty0 = py + ph + 6 * U, th = (iy + ih - 3 * U - ty0) / 3 - 2 * U, clips = [[0.02, 0.3], [0.35, 0.26], [0.65, 0.33]], cp = ["dt", "g50", "br"], anchors = [[px + pw * 0.7, py + ph * 0.3]];
    for (let r = 0; r < 3; r++) {
      const y = ty0 + r * (th + 2 * U);
      line(g, [[ix + 3 * U, y + th + 1], [ix + iw - 3 * U, y + th + 1]], 1, K, [1, 2]);
      clips.forEach(([a, b], i) => {
        const shown = span(q, 0.3 + (r * 3 + i) * 0.06, 0.55 + (r * 3 + i) * 0.06);
        if (shown <= 0) return;
        const cx0 = ix + 3 * U + (iw - 6 * U) * a, cw0 = (iw - 6 * U) * b * shown, isAcc = r === 1 && i === 1;
        const flash = isAcc && Math.floor(T * 2.4) % 2 === 0;
        rc(g, cx0, y, cw0, th, flash ? K : Wh); prc(g, cx0, y, cw0, th, cp[(r + i) % 3], { fg: flash ? Wh : K, bg: flash ? K : Wh, ox: r % 2 ? T * 6 : -T * 6 }); fr(g, cx0, y, cw0, th, 1.5, K);
        if (isAcc) anchors[1] = [cx0 + cw0 * 0.5, y + th * 0.5];
      });
      if (r === 2) anchors[2] = [ix + iw * 0.2, y + th * 0.5];
    }
    const phx = ix + 4 * U + (iw - 8 * U) * wrap(T * 0.2, 1);
    line(g, [[phx, py + ph + 2 * U], [phx, iy + ih - 2 * U]], 1.6, K); poly(g, [[phx - 3, py + ph + 1], [phx + 3, py + ph + 1], [phx, py + ph + 5]], K);
    const cxp = ix + iw * (0.5 + 0.36 * Math.sin(T * 0.9)), cyp = ty0 + th * (1.3 + 1.2 * Math.sin(T * 1.3 + 1));
    glyph(g, 2, cxp + 1, cyp + 2, 13 * U, Wh); glyph(g, 2, cxp, cyp, 11 * U, K);
    g.restore();
    fr(g, ix, iy, iw, ih, 1, K);
    if (phone) { rc(g, dx + dw / 2 - 8 * U, dy + 2, 16 * U, 3 * U, Wh); dot(g, dx + dw / 2, dy + dh - 3 * U, 1.8 * U, Wh); }
    else {
      rc(g, dx - dw * 0.06 + 3, dy + dh + 3, dw * 1.12, 7 * U, K); rc(g, dx - dw * 0.06, dy + dh + 1, dw * 1.12, 7 * U, K); rc(g, dx + dw / 2 - 12 * U, dy + dh + 1, 24 * U, 3 * U, Wh);
      for (let i = 0; i < 14; i++) if (hash(i + Math.floor(T * 5)) > 0.7) rc(g, dx + dw * 0.1 + i * dw * 0.06, dy + dh + 6 * U, 3, 2, Wh);
    }
    // floating bits around the device
    for (let i = 0; i < 4; i++) { const a = T * 0.7 + (i * TAU) / 4; glyph(g, i * 2, dx + dw / 2 + Math.cos(a) * (dw * 0.62 + 6 * U), dy + dh * 0.5 + Math.sin(a) * dh * 0.62, (8 + Math.sin(T * 3 + i) * 1.5) * U, K); }
    // callouts: dashed leaders run to labelled plates
    const lx = vert ? c.x + 16 * U : dx + dw + 38 * U, labs = d.callouts;
    labs.forEach((label, i) => {
      if (!label) return;
      const ly = vert ? dy + dh + 28 * U + i * 28 * U : c.y + c.h * (0.17 + 0.3 * i), lq = span(p, 0.25 + i * 0.12, 0.5 + i * 0.12), tq = span(p, 0.45 + i * 0.12, 0.7 + i * 0.12);
      const [ax, ay] = anchors[i] || anchors[0], ex = lx - 4, ey = ly + 10 * U, mx2 = vert ? ex : lx - 14 * U;
      const path = [[ax, ay], [mx2, ey], [ex, ey]], len1 = Math.hypot(mx2 - ax, ey - ay), len2 = Math.abs(ex - mx2), tot = len1 + len2 + 0.001, cut = tot * lq;
      let pts2 = [[ax, ay]];
      if (cut <= len1) pts2.push([ax + (mx2 - ax) * (cut / (len1 || 1)), ay + (ey - ay) * (cut / (len1 || 1))]); else { pts2.push([mx2, ey]); pts2.push([mx2 + (ex - mx2) * ((cut - len1) / (len2 || 1)), ey]); }
      if (lq > 0) { line(g, pts2, 4.5, Wh); line(g, pts2, 1.8, K, [5, 3], -T * 12); }
      const pulse = 3 + Math.abs(Math.sin(T * 3 + i)) * 2.5; g.beginPath(); g.arc(ax, ay, pulse * U, 0, TAU); g.lineWidth = 2; g.strokeStyle = Wh; g.stroke(); g.lineWidth = 1.2; g.strokeStyle = K; g.stroke(); dot(g, ax, ay, 2.4 * U, K);
      plate(g, label, lx, ly, 14 * U, tq, { maxW: vert ? c.w - 26 * U : c.x + c.w - 14 * U - lx, min: 13 * U, inv: i === 1 });
    });
  }

  function person(g, F, x, base, s, i, q, T, hot) {
    const U = F.U, bob = hot ? Math.abs(Math.sin(T * 3.2 + i)) * 4 * U : Math.sin(T * 2 + i) * 1.2 * U, v = i % 6;
    const by = base - bob + (1 - q) * s * 0.4, bw = s * 0.52, bh = s * 0.42, hr = s * 0.19, hy = by - bh - s * 0.1 - hr;
    if (q <= 0.02) return;
    g.save(); g.beginPath(); g.rect(x - s, base - s * 1.6, s * 2, s * 1.7); g.clip();
    g.globalAlpha = 1;
    // shadow
    prc(g, x - bw * 0.7, base - 2, bw * 1.4, 4, "g50", {});
    // legs
    const st = Math.sin(T * 5 + i) * (hot ? 3 : 1) * U;
    rc(g, x - bw * 0.3 - 2, by - s * 0.12, 5 * U, s * 0.12 + bob + st * 0.3, K); rc(g, x + bw * 0.3 - 3 * U, by - s * 0.12, 5 * U, s * 0.12 + bob - st * 0.3, K);
    // arms
    const wave = hot ? Math.sin(T * 7) * 0.5 - 0.9 : Math.sin(T * 2 + i) * 0.15 + 0.5;
    line(g, [[x - bw / 2, by - bh * 0.8], [x - bw / 2 - Math.cos(0.5) * s * 0.2, by - bh * 0.8 + Math.sin(0.5) * s * 0.26]], 3, K);
    line(g, [[x + bw / 2, by - bh * 0.8], [x + bw / 2 + Math.cos(wave) * s * 0.22, by - bh * 0.8 + Math.sin(wave) * s * 0.26]], 3, K);
    // body
    const bp = ["g25", "dt", "br", "wv", "hl", "ck"][v];
    rc(g, x - bw / 2 + 2, by - bh + 2, bw, bh, K); rc(g, x - bw / 2, by - bh, bw, bh, Wh);
    if (hot) { rc(g, x - bw / 2, by - bh, bw, bh, K); g.fillStyle = pat(g, "g50", { fg: Wh, bg: null, ox: T * 6 }); g.fillRect(x - bw / 2 + 2, by - bh + 2, bw - 4, bh - 4); }
    else prc(g, x - bw / 2, by - bh, bw, bh, bp, { ox: T * 3 * (v % 2 ? 1 : -1) });
    fr(g, x - bw / 2, by - bh, bw, bh, 2, K);
    // head
    const round = v % 2 === 0;
    if (round) { dot(g, x, hy, hr + 1.5, K); dot(g, x, hy, hr - 0.5, Wh); } else { rc(g, x - hr - 1.5, hy - hr - 1.5, hr * 2 + 3, hr * 2 + 3, K); rc(g, x - hr + 0.5, hy - hr + 0.5, hr * 2 - 1, hr * 2 - 1, Wh); }
    const blink = hash(Math.floor(T * 1.5) + i * 31) > 0.82 && wrap(T * 1.5, 1) < 0.3, ey = hy - hr * 0.1;
    rc(g, x - hr * 0.5 - 1, ey, 2.5, blink ? 1 : 3.5, K); rc(g, x + hr * 0.5 - 1.5, ey, 2.5, blink ? 1 : 3.5, K);
    if (hot) { g.beginPath(); g.arc(x, hy + hr * 0.25, hr * 0.38, 0, Math.PI); g.fillStyle = K; g.fill(); } else line(g, [[x - hr * 0.3, hy + hr * 0.45], [x + hr * 0.3, hy + hr * 0.45]], 1.6, K);
    // headgear
    if (v === 0) for (let k = -2; k <= 2; k++) poly(g, [[x + k * hr * 0.32 - 2, hy - hr + 1], [x + k * hr * 0.4, hy - hr - hr * (0.55 + 0.15 * (k % 2 ? 1 : 0))], [x + k * hr * 0.32 + 2, hy - hr + 1]], K);
    if (v === 1) { line(g, [[x, hy - hr], [x, hy - hr - hr * 0.8]], 1.6, K); dot(g, x, hy - hr - hr * 0.9, 2.4 * U + (Math.sin(T * 6 + i) > 0 ? 1 : 0), K); }
    if (v === 2) { rc(g, x - hr, hy - hr - 2, hr * 2, hr * 0.5, K); rc(g, x - hr, hy - hr - 2 + hr * 0.4, hr * 1.6 + hr * 0.9, 2.5, K); }
    if (v === 3) { line(g, [[x - hr, hy], [x - hr - 3, hy + 3]], 2, K); line(g, [[x + hr, hy], [x + hr + 3, hy + 3]], 2, K); g.beginPath(); g.arc(x, hy - 1, hr + 2.5, Math.PI, 0); g.lineWidth = 2.2; g.strokeStyle = K; g.stroke(); rc(g, x - hr - 5, hy - 1, 5, 6, K); rc(g, x + hr, hy - 1, 5, 6, K); }
    if (v === 4) { for (const sg of [-1, 1]) { g.beginPath(); g.arc(x + sg * hr * 0.5, ey + 1, 3.6, 0, TAU); g.lineWidth = 1.5; g.strokeStyle = K; g.stroke(); } line(g, [[x - 1, ey + 1], [x + 1, ey + 1]], 1.4, K); }
    if (v === 5) { poly(g, [[x - hr * 0.3, hy - hr - 1], [x - hr * 1.1, hy - hr - 5], [x - hr * 1.1, hy - hr + 4]], K); poly(g, [[x + hr * 0.3, hy - hr - 1], [x + hr * 1.1, hy - hr - 5], [x + hr * 1.1, hy - hr + 4]], K); dot(g, x, hy - hr - 1, 2.2, K); }
    g.restore();
    return hy - hr;
  }
  function drawPeople(g, F, c, p, d, T) {
    const U = F.U, n = Math.max(2, Math.min(6, Math.round(d.count))), vert = c.h > c.w * 1.1;
    rc(g, c.x, c.y, c.w, c.h, Wh);
    // curtain, swaying spotlights and a rolling floor
    prc(g, c.x, c.y, c.w, 20 * U, "vl", { ox: Math.sin(T * 0.8) * 3 });
    for (let k = 0; k < c.w / (14 * U); k++) { const x = c.x + k * 14 * U, hh = 8 * U + Math.sin(T * 1.4 + k) * 1.5 * U; poly(g, [[x, c.y + 20 * U], [x + 14 * U, c.y + 20 * U], [x + 7 * U, c.y + 20 * U + hh]], K); }
    for (const sg of [0, 1]) {
      const ox = c.x + (sg ? c.w * 0.82 : c.w * 0.18), ex = ox + Math.sin(T * 0.7 + sg * 2) * c.w * 0.12, ey = c.y + c.h - 10 * U;
      g.beginPath(); g.moveTo(ox - 3, c.y + 22 * U); g.lineTo(ox + 3, c.y + 22 * U); g.lineTo(ex + c.w * 0.14, ey); g.lineTo(ex - c.w * 0.14, ey); g.closePath(); g.fillStyle = pat(g, "g12", { fg: K, bg: null, ox: T * 2 }); g.fill();
      rc(g, ox - 5, c.y + 20 * U, 10, 5, K);
    }
    const floorY = c.y + c.h - 18 * U; prc(g, c.x, floorY, c.w, 18 * U, "br", { ox: T * 10 }); rc(g, c.x, floorY, c.w, 3, K);
    drift(g, F, c, T, 77, 8);
    const slot = c.w / n, size = Math.min((c.h - 62 * U) * 0.95, slot * 1.28, 150 * U), base = floorY + 7 * U, tops = [];
    const speaker = Math.floor((T + 0.3) / 2.2) % n;
    for (let i = 0; i < n; i++) {
      const q = stagger(p, i, n), x = c.x + slot * (i + 0.5), hot = i === Math.min(n - 1, d.highlight);
      const s = size * (hot ? 1.08 : 1);
      if (q < 1) { // an outline of where they will stand
        g.save(); g.globalAlpha = 1 - q;
        g.fillStyle = pat(g, "g12", { oy: T * 4 }); g.fillRect(x - s * 0.26, base - s * 0.5, s * 0.52, s * 0.5); dot(g, x, base - s * 0.68, s * 0.17, pat(g, "g12", { oy: T * 4 }));
        g.strokeStyle = K; g.lineWidth = 1.3; g.setLineDash([3, 3]); g.lineDashOffset = -T * 8; g.strokeRect(x - s * 0.3, base - s * 0.9, s * 0.6, s * 0.9);
        txt(g, "?", x, base - s * 0.52 + Math.sin(T * 3 + i) * 3 * U, 26 * U, { align: "center", w: 900, f: BLACK });
        g.restore();
      }
      const top = person(g, F, x, base, s, i, q, T, hot);
      if (q > 0.6 && hot) for (let k = 0; k < 5; k++) { const a = T * 2 + (k * TAU) / 5, rr = s * 0.42; sparkle(g, x + Math.cos(a) * rr, base - s * 0.62 + Math.sin(a) * rr * 0.9, (2.4 + Math.sin(T * 6 + k) * 1) * U, K); }
      tops.push([x, top ?? base - s, q, s, hot]);
    }
    tops.forEach(([x, top, q, s, hot], i) => {
      const label = d.badges[i % d.badges.length];
      if (q <= 0.5 || !label) return;
      const lift = n >= 4 && i % 2 ? 26 * U : 0, py = Math.max(c.y + 36 * U, top - 28 * U - lift);
      if (lift) line(g, [[x, py + 21 * U], [x, top - 2]], 1.5, K, [2, 2]); else poly(g, [[x - 4, py + 21 * U], [x + 4, py + 21 * U], [x, py + 26 * U]], K);
      plate(g, label, x, py, 14 * U, span(q, 0.55, 1), { align: "center", inv: hot, maxW: slot * (n >= 4 ? 1.7 : 1.1), min: 13 * U });
    });
    // someone is always talking
    const sp = tops[speaker];
    if (sp && sp[2] > 0.9) {
      const bx = sp[0] + sp[3] * 0.34, byy = sp[1] + sp[3] * 0.02 + 20 * U;
      const lft = bx + 34 * U > c.x + c.w;
      const x2 = lft ? sp[0] - sp[3] * 0.34 - 34 * U : bx;
      rc(g, x2 + 2, byy + 2, 32 * U, 15 * U, K); rc(g, x2, byy, 32 * U, 15 * U, Wh); fr(g, x2, byy, 32 * U, 15 * U, 2, K);
      poly(g, lft ? [[x2 + 28 * U, byy + 14 * U], [x2 + 36 * U, byy + 19 * U], [x2 + 22 * U, byy + 14 * U]] : [[x2 + 4 * U, byy + 14 * U], [x2 - 4 * U, byy + 19 * U], [x2 + 10 * U, byy + 14 * U]], Wh, K, 2);
      for (let k = 0; k < 3; k++) dot(g, x2 + 9 * U + k * 7 * U, byy + 7.5 * U + Math.sin(T * 8 - k) * 1.8, 2.2 * U, K);
    }
  }

  function drawProcess(g, F, c, p, d, T) {
    const U = F.U, n = d.steps.length, vert = c.h > c.w * 1.1;
    rc(g, c.x, c.y, c.w, c.h, Wh); prc(g, c.x, c.y, c.w, c.h, "gr", { ox: vert ? 0 : -T * 6, oy: vert ? -T * 6 : 0 }); drift(g, F, c, T, 55, 10);
    const beltT = 12 * U;
    let cards = [], beltPos, L, beltRect;
    if (!vert) {
      const slot = (c.w - 16 * U) / n, cw = Math.min(slot * 0.84, 190 * U), ch = c.h - beltT - 30 * U;
      for (let i = 0; i < n; i++) cards.push({ x: c.x + 8 * U + slot * (i + 0.5) - cw / 2, y: c.y + 8 * U, w: cw, h: ch, s: slot * (i + 0.5) + 8 * U });
      L = c.w; beltRect = { x: c.x, y: c.y + c.h - beltT - 4 * U, w: c.w, h: beltT }; beltPos = (s) => [c.x + s, beltRect.y + beltT / 2];
    } else {
      const slot = (c.h - 12 * U) / n, cw = c.w - 56 * U, ch = Math.min(slot * 0.86, 110 * U);
      for (let i = 0; i < n; i++) cards.push({ x: c.x + 46 * U, y: c.y + 6 * U + slot * (i + 0.5) - ch / 2, w: cw, h: ch, s: slot * (i + 0.5) + 6 * U });
      L = c.h; beltRect = { x: c.x + 8 * U, y: c.y, w: beltT, h: c.h }; beltPos = (s) => [beltRect.x + beltT / 2, c.y + s];
    }
    // the belt: moving treads
    rc(g, beltRect.x, beltRect.y, beltRect.w, beltRect.h, K);
    const tp = 8 * U, off = wrap(T * 30 * U, tp);
    if (!vert) for (let x = beltRect.x - off; x < beltRect.x + beltRect.w; x += tp) { if (x > beltRect.x - 1) rc(g, x, beltRect.y + 3, 2, beltT - 6, Wh); }
    else for (let y = beltRect.y - off; y < beltRect.y + beltRect.h; y += tp) { if (y > beltRect.y - 1) rc(g, beltRect.x + 3, y, beltT - 6, 2, Wh); }
    // cards: machines with an animated heart each
    cards.forEach((cd, i) => {
      const q = stagger(p, i, n, 0.6);
      if (q <= 0.02) return;
      const hh = cd.h * (0.35 + 0.65 * q);
      const y = vert ? cd.y : cd.y + cd.h - hh;
      rc(g, cd.x + 3, y + 3, cd.w, vert ? cd.h : hh, K); rc(g, cd.x, y, cd.w, vert ? cd.h : hh, Wh); fr(g, cd.x, y, cd.w, vert ? cd.h : hh, 2, K);
      if (q < 0.85) return;
      const last = i === n - 1;
      txt(g, String(i + 1).padStart(2, "0"), cd.x + 6 * U, cd.y + 12 * U, 18 * U, { w: 900, f: BLACK });
      rc(g, cd.x + cd.w - 13 * U, cd.y + 5 * U, 8 * U, 8 * U, Math.floor(T * 2 + i) % 2 ? K : Wh); fr(g, cd.x + cd.w - 13 * U, cd.y + 5 * U, 8 * U, 8 * U, 1.5, K);
      const lab = d.steps[i], ph = vert ? cd.h : cd.h;
      const iconS = vert ? Math.min(cd.h * 0.62, cd.w * 0.3) : Math.min(cd.w * 0.55, cd.h * 0.42), icx = vert ? cd.x + cd.w * 0.2 : cd.x + cd.w / 2, icy = vert ? cd.y + cd.h * 0.5 : cd.y + 24 * U + iconS * 0.5;
      const kind = last ? 2 : i % 2;
      g.save(); g.beginPath(); g.rect(cd.x + 2, cd.y + 2, cd.w - 4, ph - 4); g.clip();
      if (kind === 0) { // pages shuffle
        for (let k = 2; k >= 0; k--) { const sh2 = k === 0 ? Math.sin(T * 2.4 + i) * iconS * 0.14 : 0, px = icx - iconS * 0.3 + k * 3 + sh2, py = icy - iconS * 0.4 + k * 3; rc(g, px, py, iconS * 0.6, iconS * 0.8, Wh); fr(g, px, py, iconS * 0.6, iconS * 0.8, 2, K); if (k === 0) for (let l = 0; l < 4; l++) rc(g, px + 4, py + 5 * U + l * iconS * 0.14, iconS * 0.6 * (l === 3 ? 0.4 : 0.7) - 8 + (l === Math.floor(T * 3) % 4 ? 3 : 0), 2, K); }
      } else if (kind === 1) { // a gear turning, sparks flying
        const gr = iconS * 0.36, a0 = T * 1.4 * (i % 2 ? -1 : 1), pts = [];
        for (let k = 0; k < 16; k++) { const a = a0 + (k * TAU) / 16 - TAU / 64, r1 = k % 2 ? gr * 0.78 : gr; pts.push([icx + Math.cos(a) * r1, icy + Math.sin(a) * r1], [icx + Math.cos(a + TAU / 32) * r1, icy + Math.sin(a + TAU / 32) * r1]); }
        poly(g, pts, K); dot(g, icx, icy, gr * 0.36, Wh); dot(g, icx, icy, gr * 0.16, K);
        for (let k = 0; k < 4; k++) { const kk = wrap(T * 1.3 + k * 0.25, 1); sparkle(g, icx + gr * 1.1 + kk * gr * 0.7, icy - gr * 0.7 - kk * gr * 0.5, (1 - kk) * 4 * U + 1, K); }
      } else { // a stamp thumps down: check mark and a ripple
        const k = wrap(T * 0.8, 1), press = k < 0.2 ? k / 0.2 : k < 0.3 ? 1 : Math.max(0, 1 - (k - 0.3) / 0.4);
        rc(g, icx - iconS * 0.36 + 2, icy + iconS * 0.1 + 2, iconS * 0.72, iconS * 0.22, K); rc(g, icx - iconS * 0.36, icy + iconS * 0.1, iconS * 0.72, iconS * 0.22, Wh); fr(g, icx - iconS * 0.36, icy + iconS * 0.1, iconS * 0.72, iconS * 0.22, 2, K);
        const hy2 = icy - iconS * 0.3 + press * iconS * 0.22;
        rc(g, icx - 3, hy2 - iconS * 0.3, 6, iconS * 0.3, K); rc(g, icx - iconS * 0.2, hy2, iconS * 0.4, iconS * 0.13, K);
        const rr = (k > 0.2 && k < 0.7 ? (k - 0.2) / 0.5 : 0) * iconS * 0.55; if (rr > 0) { g.beginPath(); g.arc(icx, icy + iconS * 0.22, rr, Math.PI, TAU); g.lineWidth = 2; g.setLineDash([3, 3]); g.strokeStyle = K; g.stroke(); g.setLineDash([]); }
        dot(g, icx - iconS * 0.5, icy - iconS * 0.1, iconS * 0.17, K); line(g, [[icx - iconS * 0.58, icy - iconS * 0.1], [icx - iconS * 0.52, icy - iconS * 0.03], [icx - iconS * 0.4, icy - iconS * 0.2]], 1.8, Wh);
      }
      g.restore();
      const tx = vert ? cd.x + cd.w * 0.4 : cd.x + cd.w / 2, tw2 = vert ? cd.w * 0.58 : cd.w - 10 * U;
      const words = String(lab).split(" "), two = words.length > 1 && lab.length * 8.4 * U > tw2;
      const t1 = two ? words.slice(0, Math.ceil(words.length / 2)).join(" ") : lab, t2 = two ? words.slice(Math.ceil(words.length / 2)).join(" ") : "";
      const ly = vert ? cd.y + cd.h * 0.5 : cd.y + cd.h - (two ? 22 : 12) * U, qq = span(q, 0.85, 1);
      txt(g, t1, tx, ly, 14 * U, { align: vert ? "left" : "center", q: qq, maxW: tw2, min: 13 * U, halo: 0 });
      if (two) txt(g, t2, tx, ly + 15 * U, 14 * U, { align: vert ? "left" : "center", q: qq, maxW: tw2, min: 13 * U });
    });
    // chevrons between cards, crawling along
    for (let i = 0; i < n - 1; i++) {
      const a = cards[i], b = cards[i + 1], k = span(p, (i + 0.6) / n * 0.6, (i + 1) / n * 0.6 + 0.2);
      if (k <= 0) continue;
      for (let m = 0; m < 3; m++) {
        const f = wrap(T * 0.9 + m / 3, 1), x = vert ? a.x - 20 * U : a.x + a.w + 3 * U + (b.x - a.x - a.w - 6 * U) * f, y = vert ? a.y + a.h + (b.y - a.y - a.h) * f : a.y + a.h * 0.7;
        if (vert) poly(g, [[x - 4, y - 3], [x + 4, y - 3], [x, y + 3]], K); else poly(g, [[x - 3, y - 4], [x + 3, y], [x - 3, y + 4]], K);
      }
    }
    // crates ride the belt and are finished station by station
    if (p > 0.25) for (let k = 0; k < 4; k++) {
      const s = wrap(T * (L / 5) + (k * L) / 4, L + 20 * U) - 10 * U, [x, y] = beltPos(s), sz = 15 * U;
      const done = cards.filter((cd) => s > cd.s + 6 * U).length, cy = y - beltT / 2 - sz / 2 + 1, cx = vert ? x + beltT / 2 + sz / 2 - 2 : x;
      const bx = vert ? x - sz / 2 : cx - sz / 2, byy = vert ? y - sz / 2 : cy - sz / 2;
      const px = vert ? beltRect.x + beltT / 2 - sz / 2 : bx, py = vert ? byy : byy;
      rc(g, px + 2, py + 2, sz, sz, K); rc(g, px, py, sz, sz, Wh); fr(g, px, py, sz, sz, 2, K);
      if (done >= 1) prc(g, px + 2, py + 2, sz - 4, sz - 4, "dt");
      if (done >= 2) sparkle(g, px + sz / 2, py + sz / 2, sz * 0.32, K);
      if (done >= n) { rc(g, px, py, sz, sz, K); line(g, [[px + 2, py + sz / 2], [px + sz * 0.42, py + sz - 3], [px + sz - 2, py + 3]], 2, Wh); }
    }
  }

  function drawCompare(g, F, c, p, d, T) {
    const U = F.U, vert = c.h > c.w * 1.1, gap = 14 * U;
    rc(g, c.x, c.y, c.w, c.h, Wh);
    const pw = vert ? c.w - 8 * U : (c.w - gap) / 2 - 4 * U, ph = vert ? (c.h - gap) / 2 - 3 * U : c.h - 8 * U, max = Math.max(d.leftValue, d.rightValue, 1);
    [[d.left, d.leftValue, 0], [d.right, d.rightValue, 1]].forEach(([label, value, side], i) => {
      const q = stagger(p, i, 2, 0.4), x = vert ? c.x + 2 * U : c.x + 2 * U + i * (pw + gap), y = vert ? c.y + 2 * U + i * (ph + gap) : c.y + 2 * U;
      rc(g, x + 3, y + 3, pw, ph, K); rc(g, x, y, pw, ph, Wh);
      prc(g, x, y, pw, ph, side ? "pt" : "dr", { ox: side ? 0 : T * 5, oy: side ? 0 : -T * 5 });
      if (q < 0.99) { g.save(); g.strokeStyle = K; g.lineWidth = 1.4; g.setLineDash([3, 3]); g.lineDashOffset = -T * 9; g.strokeRect(x + 2, y + 2, pw - 4, ph - 4); g.restore(); }
      if (q > 0.05) {
        g.save(); g.beginPath(); g.rect(x, y, pw, ph); g.clip();
        rc(g, x, y, pw, 21 * U, side ? K : Wh); rc(g, x, y + 21 * U - 1, pw, 2, K);
        txt(g, label, x + 8 * U, y + 11 * U, 14 * U, { color: side ? Wh : K, q: span(q, 0.05, 0.6), maxW: pw - 16 * U, min: 13 * U });
        // the number, huge
        const ns = Math.min(54 * U, ph * 0.34);
        const numY = y + 21 * U + (ph - 21 * U - 24 * U) * 0.42;
        txt(g, NUM(value * q, d), x + 8 * U, numY, Math.max(32 * U, ns), { w: 900, f: BLACK, halo: 6 });
        // a character reacting to the number
        const ps = Math.min(ph * 0.62, pw * 0.34), pxx = x + pw - ps * 0.62, pyy = y + ph - 30 * U;
        pip(g, pxx, pyy, ps, { t: T, mood: side ? 1 : 2, hop: side ? Math.abs(Math.sin(T * 3.4)) * 6 * U : 0, seed: i * 4 + 1 });
        if (side) { for (let k = 0; k < 14; k++) { const kk = wrap(T * 0.5 + hash(k) , 1), cx2 = x + 8 * U + hash(k + 20) * pw * 0.9, cy2 = y + 24 * U + kk * (ph - 30 * U); if (k % 2) rc(g, cx2, cy2, 3, 3, K); else fr(g, cx2, cy2, 4, 4, 1, K); } }
        else { // a tangle of scribble rolls along
          const tx = x + pw * 0.45 + Math.sin(T * 0.8) * pw * 0.12, ty = y + ph - 36 * U; g.save(); g.translate(tx, ty); g.rotate(T * 2.5); g.lineWidth = 1.8; g.strokeStyle = K; g.beginPath();
          for (let k = 0; k <= 60; k++) { const a = k * 0.55, r = 3 + k * 0.22 * U + Math.sin(k) * 1.5; k ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(r, 0); } g.stroke(); g.restore();
        }
        // a meter of cells that lights up one by one
        const cells = 16, mx = x + 8 * U, my = y + ph - 17 * U, cw = (pw - 16 * U) / cells, fillN = (value / max) * cells * q;
        fr(g, mx - 2, my - 2, pw - 12 * U, 15 * U, 2, K);
        for (let k = 0; k < cells; k++) { const lit = k + 1 <= fillN || (k < fillN), flick = lit && k === Math.floor(fillN) - 1 && q >= 1 && Math.sin(T * 6) > 0.3; if (lit && !flick) rc(g, mx + k * cw, my, cw - 1.5, 11 * U, K); else if (!lit) prc(g, mx + k * cw, my + 3, cw - 1.5, 5 * U, "g25"); }
        g.restore();
      }
      fr(g, x, y, pw, ph, 2, K);
    });
    const bx = vert ? c.x + c.w / 2 : c.x + c.w / 2, by = vert ? c.y + c.h / 2 : c.y + c.h * 0.5;
    if (p > 0.3) { g.save(); g.translate(bx, by); g.rotate(Math.sin(T * 1.5) * 0.25); const bs = 19 * U * ease((p - 0.3) * 3); poly(g, [[0, -bs], [bs, 0], [0, bs], [-bs, 0]], Wh, K, 3); g.restore(); txt(g, "VS", bx, by + 1, 14 * U, { align: "center" }); }
  }

  const DRAW = { chart: drawChart, object: drawObject, people: drawPeople, process: drawProcess, compare: drawCompare };

  // Each scene dissolves in and out through the dither matrix, sweeping top-down on entry and bottom-up on exit.
  function dissolve(F, amt, rising, y0, y1) {
    const { cv, LW, LH } = F, sg = cv.sc.getContext("2d");
    const ys = Math.max(0, Math.floor(y0)), ye = Math.min(LH, Math.ceil(y1)), id = sg.getImageData(0, ys, LW, ye - ys), d = id.data;
    const k = clamp(amt) * 1.12;
    for (let y = ys; y < ye; y++) {
      const bias = clamp((y - y0) / Math.max(1, y1 - y0)), b = rising ? 1 - bias : bias;
      for (let x = 0; x < LW; x++) { const o = ((y - ys) * LW + x) * 4 + 3; if (d[o] && bay(x, y) * 0.75 + b * 0.25 > k) d[o] = 0; }
    }
    sg.putImageData(id, 0, ys);
  }
  const scene = (id) => (ctx, S, box, p, d, info) => {
    const F = frame;
    if (!F) return;
    const { cv, P, U } = F, sg = cv.sc.getContext("2d");
    sg.setTransform(1, 0, 0, 1, 0, 0); sg.globalAlpha = 1; sg.globalCompositeOperation = "source-over"; sg.setLineDash([]); sg.imageSmoothingEnabled = false;
    sg.clearRect(0, 0, F.LW, F.LH);
    const T = info.local, x = box.x / P, y = box.y / P, w = box.w / P - 4 * U, h = box.h / P - 4 * U;
    const body = chromeWin(sg, F, x, y, w, h, NAMES[id], T);
    const c = scrollBar(sg, F, body, T, id.length);
    sg.save(); sg.beginPath(); sg.rect(c.x, c.y, c.w, c.h); sg.clip();
    sg.translate(0, 0);
    DRAW[id](sg, F, c, p, d, T);
    sg.restore();
    const leaving = info.exit !== undefined, amt = leaving ? 1 - info.exit : ease(info.local / Math.max(0.2, info.change));
    if (amt < 1) dissolve(F, amt, leaving, y, y + h + 4);
    F.g.drawImage(cv.sc, 0, 0);
    blit(F);
  };

  const rgbOf = (hex) => rgb(hex);
  return {
    bg: "#f1f0e8", panel: "#f1f0e8", ink: "#16150f", muted: "#16150f", accent: "#16150f", onAccent: "#f1f0e8", rule: "#16150f", track: "#f1f0e8",
    display: BLACK, displayWeight: 900, displayCase: "uppercase", displayTracking: "0.01em",
    body: MONO, bodyWeight: 800, figures: BLACK, radius: 0, motion: "type", change: "grid",
    kit: { line: 2.5, fill: "solid", panel: "fill" },
    keepArt: true, overlap: true,
    palettes: {
      // Ink on pure white; paper-white on black; and green phosphor on a dark tube.
      light: { bg: "#ffffff", panel: "#ffffff", ink: "#000000", muted: "#000000", accent: "#000000", onAccent: "#ffffff", rule: "#000000", track: "#ffffff", backdrop: () => "#ffffff" },
      dark: { bg: "#000000", panel: "#000000", ink: "#f4f4f0", muted: "#f4f4f0", accent: "#f4f4f0", onAccent: "#000000", rule: "#f4f4f0", track: "#000000", backdrop: () => "#000000" },
      mono: { bg: "#0a1a10", panel: "#0a1a10", ink: "#b9f7c4", muted: "#b9f7c4", accent: "#b9f7c4", onAccent: "#0a1a10", rule: "#b9f7c4", track: "#0a1a10", backdrop: () => "#0a1a10" },
    },
    textShadow: () => "none",
    backdrop: (accent, tex, look) => look.bg,
    paint: (ctx, W, H) => { ctx.clearRect(0, 0, W, H); },
    // Headlines sit in hard-edged title plates; a threshold filter keeps the type to two tones.
    css(accent, look) {
      const r = document.getElementById("root"), H = Number(r && r.dataset.height) || 1080, W = Number(r && r.dataset.width) || 1920, u = Math.min(W, H) / 1080;
      const a = rgbOf(look.ink), b = rgbOf(look.bg), lumA = a[0] * 0.3 + a[1] * 0.59 + a[2] * 0.11, lumB = b[0] * 0.3 + b[1] * 0.59 + b[2] * 0.11;
      const dk = lumA < lumB ? a : b, lt = lumA < lumB ? b : a, tv = (ch) => `${(dk[ch] / 255).toFixed(3)} ${(lt[ch] / 255).toFixed(3)}`;
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='0' height='0'><filter id='t' color-interpolation-filters='sRGB'><feColorMatrix values='0.3 0.59 0.11 0 0 0.3 0.59 0.11 0 0 0.3 0.59 0.11 0 0 0 0 0 1 0'/><feComponentTransfer><feFuncR type='discrete' tableValues='${tv(0)}'/><feFuncG type='discrete' tableValues='${tv(1)}'/><feFuncB type='discrete' tableValues='${tv(2)}'/><feFuncA type='discrete' tableValues='0 1'/></feComponentTransfer></filter></svg>`;
      const f = "url(\"data:image/svg+xml," + encodeURIComponent(svg) + "#t\")";
      return `
        .display { display: inline-block; width: auto !important; max-width: 100%; align-self: flex-start; background: var(--bg); color: var(--ink);
          border: ${6 * u}px solid var(--ink); box-shadow: ${10 * u}px ${10 * u}px 0 var(--ink); padding: 0.1em 0.34em 0.04em; text-shadow: none; filter: ${f}; line-height: 1.06; }
        .statement .display { align-self: center; text-align: center; }
        .kicker { align-self: center; background: var(--ink); color: var(--bg) !important; padding: ${4 * u}px ${16 * u}px ${2 * u}px; text-shadow: none; filter: ${f}; letter-spacing: 0.1em; font-weight: 800; }
        .scene:not(.statement) .display { margin-top: ${6 * u}px; }
      `;
    },
    stage(ctx, S, info) {
      const F = (frame = makeFrame(ctx, S, info));
      if (S.paint) {
        world(F);
        if (F.statement) statementArt(F);
        chrome(F);
        finish(F);
      }
      blit(F);
    },
    scenes: { chart: scene("chart"), object: scene("object"), people: scene("people"), process: scene("process"), compare: scene("compare") },
  };
});
