// Mosaic: the whole frame is one laid tesserae wall. A gold ground of tiles set in concentric rows turns
// slowly in three rings, a gleam of light travels round each ring and single tesserae wink; a braided
// border of diamonds runs round the edge with rosettes turning in the corners; tesserae drift up like
// dust. Every drawing is cut from tiles: fill with grout and per-tile tint, a row of tesserae laid
// along the inside of each contour and another along its outline. At a change the pieces shatter into
// loose tiles and fall while the next ones fly in. Frames are pure functions of time: seeded values only.
window.DreamcutMotion.register("mosaic", ({ rng }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const h1 = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const wrapPi = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

  // ---- colour ------------------------------------------------------------------------------------
  function rgb(value) {
    const s = String(value || "");
    if (s[0] === "#") {
      const h = s.length === 4 ? s.slice(1).split("").map((c) => c + c).join("") : s.slice(1, 7);
      const n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (m) return m[1].split(",").slice(0, 3).map(Number);
    return [128, 128, 128];
  }
  const rgba = (c, a = 1) => `rgba(${clamp(c[0], 0, 255) | 0},${clamp(c[1], 0, 255) | 0},${clamp(c[2], 0, 255) | 0},${a})`;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  const WHITE = [255, 255, 255];
  const col = (c) => (typeof c === "string" ? c : rgba(c));

  // ---- palettes -----------------------------------------------------------------------------------
  const GOLD_MOS = {
    ground: ["#c8962c", "#d9ab3d", "#e6c25a", "#b78628", "#efcd6e", "#a8791f", "#dcb04a"],
    gleam: "#fff1b8", grout: "#2e1c0c", vignette: "#2a1604",
    lapis: "#1f4090", lapisDeep: "#142a63", teal: "#1d8c88", tealDeep: "#145a5e", emerald: "#2f8153", emeraldDeep: "#1d5438",
    coral: "#e3583a", wine: "#85273f", wineDeep: "#5a1830", cream: "#f6ecd2", creamShade: "#dccfa8", clay: "#b9623c",
    gold: "#e7b94c", violet: "#5d3c8c", ink: "#2a1a0c", sky: "#0e1b3f",
    skin: ["#f0c9a0", "#d9a577", "#b97c53", "#8d5a3a"],
  };
  const mapMos = (mos, fn) => {
    const out = {};
    for (const [k, v] of Object.entries(mos)) out[k] = Array.isArray(v) ? v.map(fn) : typeof v === "string" && v[0] === "#" ? fn(v) : v;
    return out;
  };
  const grey = (hex) => { const c = rgb(hex); const g = lum(c); return `rgb(${g * 1.03 | 0},${g | 0},${g * 0.95 | 0})`; };
  const greyHex = (hex) => { const c = rgb(hex); const g = lum(c); const x = (v) => clamp(v | 0, 0, 255).toString(16).padStart(2, "0"); return "#" + x(g * 1.03) + x(g) + x(g * 0.95); };
  const LIGHT_MOS = { ...GOLD_MOS, ground: ["#efe6d2", "#e6dcc4", "#f6efe0", "#dcd0b4", "#f2e9d6", "#d4c7a8"], gleam: "#ffffff", grout: "#6f5f40", vignette: "#6f5a30" };
  const DARK_MOS = { ...GOLD_MOS, ground: ["#2a3a66", "#233159", "#344574", "#1d284d", "#3a4d80", "#18224a"], gleam: "#bcd4ff", grout: "#050a1c", vignette: "#02040e" };
  const MONO_MOS = mapMos(GOLD_MOS, greyHex);
  void grey;

  function theme(S) {
    const L = S.look, M = L.mos;
    const c = {};
    for (const k of Object.keys(M)) c[k] = Array.isArray(M[k]) ? M[k].map(rgb) : typeof M[k] === "string" && M[k][0] === "#" ? rgb(M[k]) : M[k];
    return { ...c, u: S.u, tex: L.texture ?? 1, font: L.display, body: L.body, acc: rgb(S.accent), light: lum(rgb(M.ground[0])) > 150, mosKey: M.ground[0] + M.lapis };
  }

  // ---- buffers ------------------------------------------------------------------------------------
  const CACHE = {};

  // The grout-and-tint overlay laid over every tessera fill: a seamless tile of jittered stones.
  function patternCanvas(big) {
    const key = "pat" + big;
    if (CACHE[key]) return CACHE[key];
    const P = 256, cell = big ? 24 : 15;
    const cols = Math.round(P / cell), cw = P / cols;
    const rows = cols, rh = P / rows;
    const c = document.createElement("canvas");
    c.width = c.height = P;
    const g = c.getContext("2d");
    const r = rng(big ? 91 : 53);
    g.fillStyle = "rgba(32,18,6,0.62)";
    g.fillRect(0, 0, P, P);
    const tiles = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const off = (j % 2) * cw * 0.5 + (r() - 0.5) * cw * 0.12;
      const x = i * cw + off, y = j * rh + (r() - 0.5) * 1.2, w = cw - 1.7, h = rh - 1.7;
      tiles.push([x + 0.85, y + 0.85, w, h, r(), r()]);
    }
    const each = (fn) => { for (const t of tiles) for (const dx of [-P, 0]) for (const dy of [-P, 0]) fn(t[0] + dx, t[1] + dy, t[2], t[3], t[4], t[5]); };
    g.globalCompositeOperation = "destination-out";
    g.fillStyle = "#000";
    each((x, y, w, h) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, 2.2) : g.rect(x, y, w, h); g.fill(); });
    g.globalCompositeOperation = "source-over";
    each((x, y, w, h, a, b) => {
      g.fillStyle = b < 0.5 ? `rgba(255,248,215,${a * 0.26})` : `rgba(24,12,0,${a * 0.24})`;
      g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, 2.2) : g.rect(x, y, w, h); g.fill();
      // A lit corner on some stones.
      if (a > 0.55) { g.fillStyle = "rgba(255,255,235,0.14)"; g.fillRect(x + 1, y + 1, w * 0.6, 1.6); }
    });
    return (CACHE[key] = c);
  }
  const PATS = new WeakMap();
  function pattern(ctx, big) {
    let m = PATS.get(ctx);
    if (!m) PATS.set(ctx, (m = {}));
    const k = big ? "b" : "s";
    return m[k] || (m[k] = ctx.createPattern(patternCanvas(big), "repeat"));
  }

  const DASH = {};
  function dashes(w) {
    const key = Math.max(2, Math.round(w * 2));
    if (DASH[key]) return DASH[key];
    const r = rng(key + 17), arr = [];
    for (let i = 0; i < 18; i++) { arr.push(w * (0.8 + r() * 0.5)); arr.push(Math.max(2, w * 0.2)); }
    return (DASH[key] = arr);
  }

  // ---- paths --------------------------------------------------------------------------------------
  const rrPath = (x, y, w, h, r) => (g) => {
    const q = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath(); g.moveTo(x + q, y); g.arcTo(x + w, y, x + w, y + h, q); g.arcTo(x + w, y + h, x, y + h, q); g.arcTo(x, y + h, x, y, q); g.arcTo(x, y, x + w, y, q); g.closePath();
  };
  const chamfPath = (x, y, w, h, c) => (g) => {
    c = Math.min(c, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + c, y); g.lineTo(x + w - c, y); g.lineTo(x + w, y + c); g.lineTo(x + w, y + h - c); g.lineTo(x + w - c, y + h); g.lineTo(x + c, y + h); g.lineTo(x, y + h - c); g.lineTo(x, y + c); g.closePath();
  };
  const circPath = (cx, cy, r) => (g) => { g.beginPath(); g.arc(cx, cy, Math.max(0.1, r), 0, TAU); };
  const archPath = (x, y, w, h) => (g) => {
    const r = w / 2;
    g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + r); g.arc(x + r, y + r, r, Math.PI, 0); g.lineTo(x + w, y + h); g.closePath();
  };
  const polyPath = (pts) => (g) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
  const starPath = (cx, cy, R, r, n, rot = 0) => (g) => {
    g.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = rot + (i * Math.PI) / n - Math.PI / 2, rr = i % 2 ? r : R; i ? g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    g.closePath();
  };
  const diamondPath = (cx, cy, rx, ry) => polyPath([[cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]]);
  const leafPath = (x0, y0, x1, y1, bulge) => (g) => {
    const dx = x1 - x0, dy = y1 - y0, nx = -dy * bulge, ny = dx * bulge;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 + nx, (y0 + y1) / 2 + ny, x1, y1); g.quadraticCurveTo((x0 + x1) / 2 - nx, (y0 + y1) / 2 - ny, x0, y0); g.closePath();
  };

  // ---- tessera drawing ----------------------------------------------------------------------------
  // Fill a path with tesserae: base colour, grout and per-tile tint, a row of stones laid along the inside
  // of the contour, and a row along the outline itself.
  function tess(ctx, th, path, color, o = {}) {
    const u = th.u, tex = th.tex;
    ctx.save();
    path(ctx);
    ctx.fillStyle = col(color);
    ctx.fill();
    ctx.save();
    ctx.clip();
    if (tex > 0 && o.pat !== 0) {
      ctx.globalAlpha = (o.pat ?? 1) * (0.3 + 0.7 * tex);
      ctx.fillStyle = pattern(ctx, o.big);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (o.row) {
      const rw = (o.rw ?? 11) * u;
      ctx.lineJoin = "round"; ctx.lineCap = "butt";
      ctx.setLineDash([]); ctx.lineWidth = rw * 2 + 3 * u; ctx.strokeStyle = rgba(th.grout, 0.85); ctx.stroke();
      ctx.setLineDash(dashes(rw * 1.05)); ctx.lineDashOffset = -(o.march || 0); ctx.lineWidth = rw * 2; ctx.strokeStyle = col(o.row); ctx.stroke();
      ctx.setLineDash(dashes(rw * 0.7)); ctx.lineDashOffset = -(o.march || 0) - rw * 0.9; ctx.strokeStyle = `rgba(255,255,235,${0.2 * (0.4 + 0.6 * tex)})`; ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
    if (o.edge !== null) {
      const ew = (o.ew ?? 7) * u;
      ctx.lineJoin = "round"; ctx.lineCap = "butt";
      ctx.setLineDash([]); ctx.lineWidth = ew + 3 * u; ctx.strokeStyle = rgba(th.grout, 0.9); ctx.stroke();
      ctx.setLineDash(dashes(ew * 1.0)); ctx.lineDashOffset = -(o.march || 0) * 0.6; ctx.lineWidth = ew; ctx.strokeStyle = col(o.edge || th.cream); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  // A line of tesserae along a path (stems, leaders, rails).
  function tileStroke(ctx, th, path, color, w, march = 0, grout = true) {
    ctx.save();
    path(ctx);
    ctx.lineCap = "butt"; ctx.lineJoin = "round";
    if (grout) { ctx.setLineDash([]); ctx.lineWidth = w + 3 * th.u; ctx.strokeStyle = rgba(th.grout, 0.85); ctx.stroke(); }
    ctx.setLineDash(dashes(w * 0.95)); ctx.lineDashOffset = -march; ctx.lineWidth = w; ctx.strokeStyle = col(color); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function sparkle(ctx, th, x, y, s, a, color = th.cream) {
    if (a <= 0.02) return;
    ctx.save();
    ctx.globalAlpha *= clamp(a);
    ctx.fillStyle = col(color);
    starPath(x, y, s, s * 0.16, 4, 0)(ctx);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath(); ctx.arc(x, y, s * 0.16, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function measure(ctx, th, str, size, weight = 700) {
    ctx.save(); ctx.font = `${weight} ${size}px ${th.font}`;
    const w = ctx.measureText(String(str)).width;
    ctx.restore();
    return w;
  }

  // ---- tessera lettering ----------------------------------------------------------------------------
  // Words are laid in stones: the glyphs are rasterised once, sampled on a grid of cells, and every cell a
  // letter covers becomes a stone. Cells a letter only partly covers are cut into quarter stones, as a
  // mosaicist cuts small pieces at a contour, and a row of dark stones can outline each letter.
  const GLY = {};
  let GCTX = null;
  const strHash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  function wrapLines(g, str, maxW) {
    const words = String(str).split(/\s+/).filter(Boolean);
    if (!maxW) return [words.join(" ")];
    const lines = [];
    let cur = "";
    for (const w of words) { const test = cur ? cur + " " + w : w; if (cur && g.measureText(test).width > maxW) { lines.push(cur); cur = w; } else cur = test; }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  }
  function glyphs(th, str, size, o = {}) {
    const font = `${o.weight || 700} ${size}px ${o.font || th.font}`;
    const spacing = o.spacing || 0;
    const key = [str, size.toFixed(1), font, spacing.toFixed(1), Math.round(o.maxW || 0), o.align || "l", o.lh || 1.04].join("|");
    if (GLY[key]) return GLY[key];
    GCTX = GCTX || document.createElement("canvas").getContext("2d");
    let g = GCTX;
    g.font = font; g.letterSpacing = spacing + "px";
    const lines = wrapLines(g, str, o.maxW);
    const widths = lines.map((l) => g.measureText(l).width);
    const mm = g.measureText("Hg");
    const fa = mm.fontBoundingBoxAscent || size * 0.8, fd = mm.fontBoundingBoxDescent || size * 0.25;
    const lh = size * (o.lh || 1.04);
    const bw = Math.max(1, ...widths), bh = lines.length * lh;
    const pad = Math.ceil(size * 0.25);
    const cw = Math.ceil(bw + pad * 2), chh = Math.ceil(bh + pad * 2);
    const c = document.createElement("canvas");
    c.width = cw; c.height = chh;
    g = c.getContext("2d", { willReadFrequently: true });
    g.font = font; g.letterSpacing = spacing + "px"; g.fillStyle = "#000"; g.textBaseline = "alphabetic";
    lines.forEach((l, i) => g.fillText(l, pad + (o.align === "c" ? (bw - widths[i]) / 2 : 0), pad + i * lh + (lh - (fa + fd)) / 2 + fa));
    const A = g.getImageData(0, 0, cw, chh).data;
    const cell = size / (size >= 88 ? 9.5 : size >= 56 ? 8.5 : 8.5), sub = cell / 2;
    const nx = Math.ceil(cw / sub) + 1, ny = Math.ceil(chh / sub) + 1;
    const F = new Uint8Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      let s = 0;
      for (let b = 0; b < 3; b++) for (let a = 0; a < 3; a++) {
        const x = Math.min(cw - 1, Math.floor((i + (a + 0.5) / 3) * sub)), y = Math.min(chh - 1, Math.floor((j + (b + 0.5) / 3) * sub));
        s += A[(y * cw + x) * 4 + 3];
      }
      F[j * nx + i] = s / 9 > (size >= 56 ? 105 : 72) ? 1 : 0;
    }
    const at = (i, j) => (i < 0 || j < 0 || i >= nx || j >= ny ? 0 : F[j * nx + i]);
    const O = new Uint8Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (F[j * nx + i]) continue;
      let n = 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) n += at(i + a, j + b);
      O[j * nx + i] = n ? 1 : 0;
    }
    const r = rng(strHash(key));
    const tiles = [];
    for (const [M, kind] of [[O, 1], [F, 0]]) {
      const m = (i, j) => (i >= nx || j >= ny ? 0 : M[j * nx + i]);
      for (let J = 0; J < ny; J += 2) for (let I = 0; I < nx; I += 2) {
        const q = [m(I, J), m(I + 1, J), m(I, J + 1), m(I + 1, J + 1)];
        if (q[0] && q[1] && q[2] && q[3]) { tiles.push([I * sub - pad, J * sub - pad, cell, kind, r(), r()]); continue; }
        q.forEach((v, k) => { if (v) tiles.push([(I + (k % 2)) * sub - pad, (J + (k >> 1)) * sub - pad, sub, kind, r(), r()]); });
      }
    }
    return (GLY[key] = { tiles, w: bw, h: bh, cell });
  }
  // Draw laid lettering with its top-left at (ox, oy). `arrive(nx, r)` gives each stone's landing 0..1 from its
  // place across the word; `glint` = { x, w } runs a band of light across the stones.
  function layGlyphs(ctx, th, G, ox, oy, o = {}) {
    const fill = o.fill || th.cream, fill2 = o.fill2 || fill, line = o.line || th.grout;
    const gl = o.glint, fly = o.fly || 80 * th.u;
    for (const pass of [1, 0]) {
      if (pass === 1 && !o.outline) continue;
      for (const T of G.tiles) {
        if (T[3] !== pass) continue;
        const [tx, ty, s, , r1, r2] = T;
        let k = 1;
        if (o.arrive) { k = o.arrive(tx / G.w, r1); if (k <= 0) continue; }
        let c;
        if (pass) c = shade(line, 0.85 + r1 * 0.3);
        else {
          c = shade(r2 < 0.14 ? fill2 : fill, 0.88 + r1 * 0.2);
          if (gl) { const I = 1 - Math.abs(tx / G.w - gl.x) / gl.w; if (I > 0) c = mix(c, o.glintColor || th.gleam, I * (o.glintAmt ?? 0.75)); }
        }
        const gap = Math.max(0.6, s * 0.14), w = s - gap;
        if (k >= 1) {
          ctx.fillStyle = rgba(c);
          ctx.fillRect(ox + tx + gap / 2, oy + ty + gap / 2, w, w);
          if (!pass && s > G.cell * 0.8 && r2 > 0.45) { ctx.fillStyle = "rgba(255,255,240,0.22)"; ctx.fillRect(ox + tx + gap / 2, oy + ty + gap / 2, w, Math.max(1, w * 0.22)); }
        } else {
          const e = back(k), f = 1 - clamp(e, 0, 1.2);
          ctx.save();
          ctx.globalAlpha *= clamp(k * 3);
          ctx.translate(ox + tx + s / 2 + (r1 - 0.5) * 2 * fly * f, oy + ty + s / 2 - (0.5 + r2) * fly * f);
          ctx.rotate((r2 - 0.5) * 3.2 * f);
          const sc = 0.4 + 0.6 * clamp(e, 0, 1.15);
          ctx.fillStyle = rgba(c);
          ctx.fillRect((-w / 2) * sc, (-w / 2) * sc, w * sc, w * sc);
          ctx.restore();
        }
      }
    }
  }
  // A number or short word laid centred on (cx, cy).
  function tileWord(ctx, th, str, cx, cy, size, o = {}) {
    const G = glyphs(th, String(str), size, { align: "c", weight: o.weight || 700 });
    layGlyphs(ctx, th, G, cx - G.w / 2, cy - G.h / 2 + size * 0.04, o);
    return G;
  }
  // Each tablet catches a band of light in turn.
  const glintAt = (th, x, rate = 0.22) => ({ x: (((th.t || 0) * rate + x * 0.00041) % 1.9) - 0.45, w: 0.16 });

  // A stone tablet carrying words: tessera border, cream face, lettering laid in stones. Returns its width.
  function tablet(ctx, th, str, cx, cy, size, o = {}) {
    const u = th.u;
    const tw = measure(ctx, th, str, size);
    const w = o.w || tw + size * 1.15;
    const h = size * (o.hf || 1.7);
    if (o.left) cx = cx + w / 2;
    if (o.right) cx = cx - w / 2;
    tess(ctx, th, chamfPath(cx - w / 2, cy - h / 2, w, h, h * 0.26), o.bg || th.cream, { row: o.row || th.creamShade, rw: Math.max(5, size * 0.12) / u, ew: Math.max(5, size * 0.1) / u, edge: o.edge || th.lapisDeep, pat: o.pat ?? 0.55 });
    const ink = o.ink || th.ink;
    const light = lum(ink) > 150;
    tileWord(ctx, th, String(str), cx, cy, size, { fill: ink, fill2: light ? th.gold : th.wineDeep, glint: glintAt(th, cx), glintColor: light ? th.gleam : th.coral, glintAmt: light ? 0.7 : 0.55 });
    return w;
  }

  // Loose tesserae flying to a piece as it lands, or off it as it falls.
  function swarm(ctx, th, cx, cy, R, seed, k, out) {
    if (k <= 0.01 || k >= 0.995) return;
    const cols = [th.cream, th.gold, th.coral, th.teal, th.lapis];
    for (let i = 0; i < 11; i++) {
      const a = h1(seed + i * 1.7) * TAU, d = R * (0.5 + 0.8 * h1(seed + i * 2.3));
      const x = cx + Math.cos(a) * d * k, y = cy + Math.sin(a) * d * k + (out ? k * k * R * 1.1 : 0);
      const s = th.u * 13 * (0.7 + h1(seed + i * 4.1) * 0.7);
      ctx.save();
      ctx.globalAlpha *= out ? clamp(k * 5) * (1 - k) : clamp(k * 3.2);
      ctx.translate(x, y); ctx.rotate(h1(seed + i) * TAU + k * (out ? 5 : -4));
      ctx.fillStyle = rgba(cols[i % cols.length]); ctx.fillRect(-s / 2, -s * 0.4, s, s * 0.8);
      ctx.strokeStyle = rgba(th.grout, 0.8); ctx.lineWidth = 1.5 * th.u; ctx.strokeRect(-s / 2, -s * 0.4, s, s * 0.8);
      ctx.restore();
    }
  }

  // ---- the ground: three rings of tiles that turn --------------------------------------------------
  function buildGround(S, th) {
    const u = th.u;
    const R = Math.hypot(S.W, S.H) / 2 + 14 * u;
    const edges = [0, R * 0.3, R * 0.62, R];
    const rowH = 16.5 * u, gap = 1.5 * u;
    const bandCols = [th.teal, th.cream, th.coral, th.lapis];
    const layers = [];
    for (let li = 0; li < 3; li++) {
      const r0 = edges[li], r1 = edges[li + 1];
      const size = Math.ceil(r1 * 2);
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const g = c.getContext("2d");
      const cc = size / 2;
      const r = rng(900 + li * 37 + (th.light ? 5 : 0));
      g.fillStyle = col(th.grout);
      g.beginPath(); g.arc(cc, cc, r1, 0, TAU); if (r0 > 0) g.arc(cc, cc, r0, 0, TAU, true); g.fill("evenodd");
      const rows = Math.max(1, Math.round((r1 - r0) / rowH));
      const rh = (r1 - r0) / rows;
      const pts = [], angs = [];
      for (let k = 0; k < rows; k++) {
        const ra = r0 + k * rh, rb = ra + rh, rm = (ra + rb) / 2;
        const n = Math.max(7, Math.round((TAU * rm) / (rh * 1.08)));
        const da = TAU / n, phase = r() * da;
        const band = li < 2 && k >= rows - 3 && k < rows - 1 ? bandCols[(li + (k === rows - 3 ? 0 : 1)) % bandCols.length] : null;
        const tide = 1 + 0.05 * Math.sin(k * 0.55 + li * 2);
        for (let i = 0; i < n; i++) {
          const a0 = phase + i * da + (r() - 0.5) * da * 0.06, a1 = a0 + da;
          const j = () => (r() - 0.5) * 1.1 * u;
          const gA = gap / rm, gR = gap * 0.5;
          const p = [
            [ra + gR + j(), a0 + gA], [rb - gR + j(), a0 + gA], [rb - gR + j(), a1 - gA], [ra + gR + j(), a1 - gA],
          ].map(([rr, aa]) => [cc + Math.cos(aa) * rr, cc + Math.sin(aa) * rr]);
          let base = band ? band : th.ground[Math.floor(r() * th.ground.length) % th.ground.length];
          if (band && r() < 0.18) base = th.gold;
          const t = (0.9 + r() * 0.2) * tide;
          g.fillStyle = rgba(shade(base, t));
          g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (let q = 1; q < 4; q++) g.lineTo(p[q][0], p[q][1]); g.closePath(); g.fill();
          // A lit corner on the leading edge.
          g.fillStyle = "rgba(255,250,225,0.16)";
          g.beginPath(); g.moveTo(p[0][0], p[0][1]); g.lineTo(p[1][0], p[1][1]); g.lineTo((p[1][0] + p[2][0]) / 2, (p[1][1] + p[2][1]) / 2); g.lineTo((p[0][0] + p[3][0]) / 2, (p[0][1] + p[3][1]) / 2); g.closePath(); g.fill();
          pts.push(p.map(([x, y]) => [x - cc, y - cc]));
          angs.push((a0 + a1) / 2 - TAU * Math.floor(((a0 + a1) / 2) / TAU));
        }
      }
      layers.push({ canvas: c, cc, r1, pts, angs, seed: li * 17 + 3 });
    }
    return layers;
  }
  let MAXK = 0;
  function drawGround(ctx, S, th, info) {
    const key = `g${S.W}x${S.H}|${th.mosKey}`;
    const G = CACHE[key] || (CACHE[key] = buildGround(S, th));
    const t = info.t;
    let K = 0;
    if (info.index >= 1) { K = info.index - 1 + eio(seg(info.local, 0, 1.1)); MAXK = Math.max(MAXK, K); } else if (info.index < 0) K = MAXK;
    const rates = [0.05, -0.034, 0.022], kicks = [0.42, -0.3, 0.2];
    const cx = S.W / 2, cy = S.H / 2;
    G.forEach((L, i) => {
      const ang = rates[i] * t + kicks[i] * K;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      ctx.drawImage(L.canvas, -L.cc, -L.cc);
      // A gleam travels round each ring; single stones catch the light and wink.
      const gl = t * (0.75 + 0.15 * i) * (i === 1 ? -1 : 1) + i * 2.3 - ang;
      const width = 0.24;
      const tex = th.tex;
      for (let n = 0; n < L.pts.length; n++) {
        const d = Math.abs(wrapPi(L.angs[n] - gl));
        let I = d < width ? Math.pow(1 - d / width, 2) * 0.62 : 0;
        const s = (t * 0.33 + h1(n * 0.37 + L.seed)) % 1;
        if (s < 0.035) I = Math.max(I, Math.sin((s / 0.035) * Math.PI) * 0.85);
        I *= 0.25 + 0.75 * tex;
        if (I < 0.04) continue;
        const p = L.pts[n];
        ctx.fillStyle = rgba(th.gleam, I);
        ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); ctx.lineTo(p[1][0], p[1][1]); ctx.lineTo(p[2][0], p[2][1]); ctx.lineTo(p[3][0], p[3][1]); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    });
    // The wall darkens toward its corners.
    const vg = ctx.createRadialGradient(cx, cy, Math.min(S.W, S.H) * 0.3, cx, cy, Math.hypot(cx, cy));
    vg.addColorStop(0, rgba(th.vignette, 0)); vg.addColorStop(1, rgba(th.vignette, th.light ? 0.28 : 0.5));
    ctx.fillStyle = vg; ctx.fillRect(0, 0, S.W, S.H);
  }

  // Loose tesserae drifting up the wall.
  function dust(ctx, S, th, t) {
    const n = Math.round(46 * (0.3 + 0.7 * th.tex)), u = th.u;
    const cols = [th.cream, th.gold, th.teal, th.coral, th.lapis];
    for (let i = 0; i < n; i++) {
      const sp = (14 + h1(i * 5.1) * 22) * u;
      const y = S.H + 40 * u - ((t * sp + h1(i * 2.7) * (S.H + 80 * u)) % (S.H + 80 * u));
      const x = h1(i * 9.3) * S.W + Math.sin(t * 0.6 + i) * 26 * u;
      const s = (9 + h1(i * 3.3) * 10) * u;
      ctx.save();
      ctx.translate(x, y); ctx.rotate(t * (0.5 + h1(i)) * (i % 2 ? 1 : -1) + i);
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = rgba(cols[i % cols.length]); ctx.fillRect(-s / 2, -s * 0.4, s, s * 0.8);
      ctx.strokeStyle = rgba(th.grout, 0.85); ctx.lineWidth = 1.6 * u; ctx.strokeStyle = rgba(th.grout, 0.9); ctx.strokeRect(-s / 2, -s * 0.4, s, s * 0.8);
      ctx.restore();
    }
  }

  // ---- border: braided diamonds, rosettes in the corners ------------------------------------------
  const BORDER = (S) => Math.round(62 * S.u);
  function buildBorder(S, th) {
    const u = th.u, b = BORDER(S);
    const c = document.createElement("canvas");
    c.width = S.W; c.height = S.H;
    const g = c.getContext("2d");
    g.fillStyle = col(th.grout);
    g.beginPath(); g.rect(0, 0, S.W, S.H); g.rect(b, b, S.W - b * 2, S.H - b * 2); g.fill("evenodd");
    const frameRows = [[5, th.cream, 12], [b - 6, th.cream, 11]];
    for (const [inset, color, w] of frameRows) {
      const path = rrPath(inset * u / u, inset, S.W - inset * 2, S.H - inset * 2, 0);
      path(g);
      g.save(); g.lineWidth = w * u; g.setLineDash(dashes(w * u * 1.05)); g.strokeStyle = col(color); g.stroke(); g.restore();
    }
    // Diamond chain along all four sides.
    const mid = b / 2, sp = 44 * u, pal = [th.lapis, th.coral, th.teal, th.lapis, th.wine, th.emerald];
    const side = (len, put) => { const n = Math.floor(len / sp); const off = (len - n * sp) / 2 + sp / 2; for (let i = 0; i < n; i++) put(off + i * sp, i); };
    const dia = (x, y, i) => {
      tess(g, th, diamondPath(x, y, 16 * u, 19 * u), pal[i % pal.length], { row: th.cream, rw: 4.5, edge: th.gold, ew: 4.5, pat: 0.8 });
      tess(g, th, circPath(x, y, 4 * u), th.cream, { edge: null, pat: 0 });
    };
    side(S.W - b * 2, (x, i) => { dia(b + x, mid, i); dia(b + x, S.H - mid, i + 2); });
    side(S.H - b * 2, (y, i) => { dia(mid, b + y, i + 1); dia(S.W - mid, b + y, i + 3); });
    return c;
  }
  function rosette(ctx, th, cx, cy, R, t, dir) {
    const u = th.u;
    tess(ctx, th, circPath(cx, cy, R), th.lapisDeep, { edge: th.cream, ew: 9, row: th.teal, rw: 7, march: t * 10 * dir, pat: 0.7 });
    tileStroke(ctx, th, circPath(cx, cy, R * 0.74), th.coral, R * 0.26, t * 22 * dir);
    tess(ctx, th, starPath(cx, cy, R * 0.66, R * 0.32, 8, t * 0.55 * dir), th.gold, { row: th.cream, rw: 4, edge: th.grout, ew: 3, pat: 0.8 });
    tess(ctx, th, circPath(cx, cy, R * 0.2), th.coral, { edge: th.cream, ew: 4, pat: 0.8 });
    void u;
  }
  function drawBorder(ctx, S, th, t) {
    const key = `b${S.W}x${S.H}|${th.mosKey}`;
    const bc = CACHE[key] || (CACHE[key] = buildBorder(S, th));
    ctx.drawImage(bc, 0, 0);
    const b = BORDER(S), u = th.u;
    // A light travels the frame.
    const per = 2 * (S.W + S.H - 4 * b);
    const gl = Math.round(5 * (0.3 + 0.7 * th.tex));
    for (let i = 0; i < gl; i++) {
      let d = (((t * 90 * u + (i / gl) * per) % per) + per) % per;
      let x, y;
      const w = S.W - 2 * b, h = S.H - 2 * b, m = b / 2;
      if (d < w) { x = b + d; y = m; } else if ((d -= w) < h) { x = S.W - m; y = b + d; } else if ((d -= h) < w) { x = S.W - b - d; y = S.H - m; } else { d -= w; x = m; y = S.H - b - d; }
      const rg = ctx.createRadialGradient(x, y, 0, x, y, 70 * u);
      rg.addColorStop(0, rgba(th.gleam, 0.75)); rg.addColorStop(1, rgba(th.gleam, 0));
      ctx.fillStyle = rg; ctx.fillRect(x - 70 * u, y - 70 * u, 140 * u, 140 * u);
    }
    const ro = b * 1.05;
    rosette(ctx, th, ro, ro, b * 0.95, t, 1);
    rosette(ctx, th, S.W - ro, ro, b * 0.95, t, -1);
    rosette(ctx, th, ro, S.H - ro, b * 0.95, t, -1);
    rosette(ctx, th, S.W - ro, S.H - ro, b * 0.95, t, 1);
  }

  // ---- friezes and the headline plaque -------------------------------------------------------------
  function motif(ctx, th, kind, x, y, s, t, i, dir) {
    ctx.save();
    ctx.translate(x, y); ctx.scale(dir, 1); ctx.translate(-x, -y);
    if (kind === 0) tess(ctx, th, starPath(x, y, s * 0.52, s * 0.24, 8, t * 0.4), th.cream, { row: th.gold, rw: 4, edge: th.lapis, ew: 4.5, pat: 0.8 });
    else if (kind === 1) {
      const w = Math.sin(t * 5 + i) * s * 0.08;
      tess(ctx, th, (g) => {
        g.beginPath(); g.moveTo(x - s * 0.5, y); g.quadraticCurveTo(x - s * 0.05, y - s * 0.42, x + s * 0.26, y - s * 0.02);
        g.lineTo(x + s * 0.5, y - s * 0.3 + w); g.lineTo(x + s * 0.5, y + s * 0.3 + w); g.lineTo(x + s * 0.26, y + s * 0.02);
        g.quadraticCurveTo(x - s * 0.05, y + s * 0.42, x - s * 0.5, y); g.closePath();
      }, th.teal, { row: th.cream, rw: 4, edge: th.lapisDeep, ew: 4, pat: 0.8 });
      tess(ctx, th, circPath(x - s * 0.28, y - s * 0.04, s * 0.05), th.cream, { edge: null, pat: 0 });
    } else if (kind === 2) tess(ctx, th, diamondPath(x, y, s * 0.36, s * 0.5), th.coral, { row: th.cream, rw: 4, edge: th.wineDeep, ew: 4.5, pat: 0.8 });
    else {
      tess(ctx, th, circPath(x, y + s * 0.04, s * 0.32), th.wine, { row: th.coral, rw: 5, edge: th.cream, ew: 4, pat: 0.8 });
      tess(ctx, th, starPath(x, y - s * 0.3, s * 0.2, s * 0.09, 5, t * 0.3), th.gold, { edge: th.grout, ew: 3, pat: 0.6 });
    }
    ctx.restore();
  }
  function frieze(ctx, S, th, y, x0, x1, t, dir, amt) {
    if (amt <= 0.01) return;
    const u = th.u, sp = 150 * u, s = 74 * u;
    ctx.save();
    ctx.globalAlpha *= clamp(amt * 1.4);
    ctx.beginPath(); ctx.rect(x0, y - 62 * u, x1 - x0, 124 * u); ctx.clip();
    tileStroke(ctx, th, (g) => { g.beginPath(); g.moveTo(x0, y - 52 * u); g.lineTo(x1, y - 52 * u); }, th.cream, 9 * u, t * 24 * dir);
    tileStroke(ctx, th, (g) => { g.beginPath(); g.moveTo(x0, y + 52 * u); g.lineTo(x1, y + 52 * u); }, th.cream, 9 * u, -t * 24 * dir);
    const base = (((t * 40 * u * dir) % (sp * 4)) + sp * 4) % (sp * 4);
    const n = Math.ceil((x1 - x0) / sp) + 6;
    for (let i = -4; i < n; i++) {
      const x = x0 + base + i * sp;
      if (x < x0 - sp || x > x1 + sp) continue;
      motif(ctx, th, ((i % 4) + 4) % 4, x, y + Math.sin(t * 1.6 + i) * 3 * u, s, t, i, dir > 0 ? 1 : -1);
    }
    ctx.restore();
  }

  function nodeRect(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    let x = 0, y = 0, n = el;
    while (n && n.id !== "root") { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight, el };
  }
  // The headline in stones. The HTML words stay for layout only (the look's css hides them); their boxes
  // place the laid lettering, so every frame agrees with the template's fitting.
  function headSpec(th, scene) {
    const ids = scene === "title" ? ["kicker", "title"] : scene === "closing" ? ["closing"] : [`${scene}-title`];
    const items = [];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    ids.forEach((id, n) => {
      const r = nodeRect(id);
      if (!r || !r.w || !r.el.textContent.trim()) return;
      const cs = getComputedStyle(r.el);
      const size = parseFloat(cs.fontSize);
      const kicker = id === "kicker";
      const str = kicker ? r.el.textContent.toUpperCase() : r.el.textContent;
      const G = glyphs(th, str, size, { maxW: r.w + 2, spacing: kicker ? size * 0.12 : 0, font: kicker ? th.body : th.font, weight: 700, lh: kicker ? 1.1 : 1.04 });
      const y = r.y + (r.h - G.h) / 2;
      items.push({ G, x: r.x, y, kicker, delay: n * 0.12 });
      x0 = Math.min(x0, r.x); y0 = Math.min(y0, y); x1 = Math.max(x1, r.x + G.w); y1 = Math.max(y1, y + G.h);
    });
    if (!items.length) return null;
    const u = th.u, padX = 46 * u, padY = 28 * u;
    return { items, full: { x: x0 - padX, y: y0 - padY, w: x1 - x0 + padX * 2, h: y1 - y0 + padY * 2 } };
  }
  function plaqueShell(ctx, th, full, t) {
    const u = th.u;
    tess(ctx, th, chamfPath(full.x, full.y, full.w, full.h, 30 * u), th.lapisDeep, { row: th.lapis, rw: 12, edge: th.cream, ew: 9, march: t * 12, big: true, pat: 0.9 });
    const inset = 22 * u;
    tileStroke(ctx, th, rrPath(full.x + inset, full.y + inset, full.w - inset * 2, full.h - inset * 2, 12 * u), th.gold, 5 * u, -t * 20, false);
    const gemY = full.y + full.h / 2;
    for (const gx of [full.x, full.x + full.w]) tess(ctx, th, diamondPath(gx, gemY, 22 * u, 30 * u), th.coral, { row: th.cream, rw: 5, edge: th.gold, ew: 5, pat: 0.8 });
  }
  // The words fly in stone by stone along the line as the plaque is laid, then a band of light keeps crossing them.
  function letters(ctx, th, H, L, t) {
    for (const it of H.items) {
      const gl = { x: ((t * 0.3 + it.y * 0.0011) % 1.7) - 0.35, w: 0.09 };
      layGlyphs(ctx, th, it.G, it.x, it.y, {
        fill: it.kicker ? th.gold : th.cream, fill2: it.kicker ? th.coral : th.gold, line: th.grout, outline: true, glint: gl, fly: 110 * th.u,
        arrive: L > 1.3 ? null : (nx, r) => clamp((L - it.delay - 0.42 * nx - 0.12 * r) / 0.36),
      });
    }
  }
  function sideFrieze(S, th, full) {
    const u = th.u;
    const x0 = full.x + full.w + 70 * u, x1 = S.W - BORDER(S) - 56 * u;
    return x1 - x0 > 260 * u ? { x0, x1, y: full.y + full.h / 2 } : null;
  }

  // ---- scatter and re-lay ---------------------------------------------------------------------------
  // A whole layer (plaque, panel, drawing) is rendered to a buffer and laid down, or lifted off, as square
  // stones in a sweep across the frame; moving stones show their grout.
  const BUFS = {};
  function buffer(S, name) {
    const key = `${name}|${S.W}x${S.H}`;
    let B = BUFS[key];
    if (!B) { const c = document.createElement("canvas"); c.width = S.W; c.height = S.H; B = BUFS[key] = { canvas: c, ctx: c.getContext("2d") }; }
    B.ctx.setTransform(1, 0, 0, 1, 0, 0);
    B.ctx.globalAlpha = 1;
    B.ctx.clearRect(0, 0, S.W, S.H);
    return B;
  }
  const union = (...rs) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const r of rs) if (r) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  const grow = (r, m) => ({ x: r.x - m, y: r.y - m, w: r.w + m * 2, h: r.h + m * 2 });
  function shatter(ctx, th, B, R, k, out, seed) {
    const u = th.u, cs = Math.max(20, Math.round(54 * u));
    const src = B.canvas, g = B.ctx;
    const x0 = Math.max(0, Math.floor(R.x)), y0 = Math.max(0, Math.floor(R.y));
    const x1 = Math.min(src.width, Math.ceil(R.x + R.w)), y1 = Math.min(src.height, Math.ceil(R.y + R.h));
    const nx = Math.ceil((x1 - x0) / cs), ny = Math.ceil((y1 - y0) / cs);
    if (nx <= 0 || ny <= 0) return;
    const ms = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const r = h1(i * 12.9898 + j * 78.233 + seed);
      const order = (i / Math.max(1, nx - 1)) * 0.82 + (j / Math.max(1, ny - 1)) * 0.18;
      ms[j * nx + i] = out ? clamp((k - order * 0.42 - r * 0.1) / 0.46) : clamp((k - order * 0.4 - r * 0.12) / 0.46);
    }
    // Grout round the stones that are moving, cut only into the drawing itself.
    g.save();
    g.globalCompositeOperation = "source-atop";
    g.lineWidth = Math.max(2, 3 * u);
    g.strokeStyle = rgba(th.grout, 0.95);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const m = ms[j * nx + i];
      if (m <= 0 || m >= 1) continue;
      const sx = x0 + i * cs, sy = y0 + j * cs;
      g.strokeRect(sx + g.lineWidth / 2, sy + g.lineWidth / 2, Math.min(cs, x1 - sx) - g.lineWidth, Math.min(cs, y1 - sy) - g.lineWidth);
    }
    g.restore();
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const m = ms[j * nx + i];
      const sx = x0 + i * cs, sy = y0 + j * cs, w = Math.min(cs, x1 - sx), h = Math.min(cs, y1 - sy);
      if (out ? m <= 0 : m >= 1) { ctx.drawImage(src, sx, sy, w, h, sx, sy, w, h); continue; }
      if (out ? m >= 1 : m <= 0) continue;
      const r = h1(i * 3.17 + j * 9.71 + seed * 1.3), r2 = h1(i * 7.3 + j * 1.9 + seed);
      const e = out ? m : 1 - eo(m);
      const dx = (r - 0.5) * 240 * u * e;
      const dy = out ? (e * e * 560 - e * 80 * (0.5 + r2)) * u : -(150 + 170 * r2) * u * e;
      ctx.save();
      ctx.globalAlpha *= out ? 1 - Math.pow(m, 3) : clamp(m * 3);
      ctx.translate(sx + w / 2 + dx, sy + h / 2 + dy);
      ctx.rotate((r2 - 0.5) * 2.8 * e);
      const sc = 1 - 0.32 * e;
      ctx.scale(sc, sc);
      ctx.drawImage(src, sx, sy, w, h, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }

  // ---- title and closing: a plaque between two friezes ----------------------------------------------
  function statementScene(id) {
    return (ctx, S, box, p, d, info) => {
      const th = theme(S);
      th.t = info.t;
      const ex = info.exit || 0;
      if (ex >= 1) return;
      const H = headSpec(th, id);
      if (!H) return;
      const u = th.u, b = BORDER(S), t = info.t, P = H.full;
      const x0 = b + 56 * u, x1 = S.W - b - 56 * u;
      const gap = 130 * u;
      const yTop = Math.max(b + 100 * u, P.y - gap), yBot = Math.min(S.H - b - 100 * u, P.y + P.h + gap);
      const friezes = (g, amt) => { frieze(g, S, th, yTop, x0, x1, t, 1, amt); frieze(g, S, th, yBot, x0, x1, t, -1, amt); };
      if (ex > 0) {
        const B = buffer(S, "out");
        friezes(B.ctx, 1); plaqueShell(B.ctx, th, P, t); letters(B.ctx, th, H, 99, t);
        shatter(ctx, th, B, { x: x0 - 10 * u, y: yTop - 70 * u, w: x1 - x0 + 20 * u, h: yBot - yTop + 140 * u }, ex, true, 11);
        return;
      }
      // The opening scene starts already in motion, so its first frame is not bare.
      const L = info.local + (info.t - info.local < 1e-6 ? 0.16 : 0);
      friezes(ctx, eo(seg(L, 0.05, 0.75)));
      const lay = clamp(L / 0.62);
      if (lay < 1) { const B = buffer(S, "in"); plaqueShell(B.ctx, th, P, t); shatter(ctx, th, B, grow(P, 40 * u), lay, false, 5); }
      else plaqueShell(ctx, th, P, t);
      letters(ctx, th, H, L, t);
    };
  }

  // ---- scene helpers ------------------------------------------------------------------------------
  const BED = { chart: "lapisDeep", object: "tealDeep", people: "wineDeep", process: "lapisDeep", compare: "emeraldDeep" };
  const BEDROW = { chart: "lapis", object: "teal", people: "wine", process: "lapis", compare: "emerald" };

  function bedRect(S, th, box) {
    const u = th.u;
    const x = box.x - 34 * u, y = box.y - 14 * u, w = box.w + 68 * u;
    const h = Math.min(box.h + 30 * u, S.H - BORDER(S) - 8 * u - y);
    return { x, y, w, h };
  }
  function bed(ctx, S, th, R, t, id) {
    const u = th.u;
    const { x, w } = R, yy = R.y, hh = R.h;
    ctx.save();
    const path = chamfPath(x, yy, w, hh, 40 * u);
    tess(ctx, th, path, th[BED[id]], { row: th[BEDROW[id]], rw: 13, edge: th.cream, ew: 10, march: t * 14, big: true, pat: 1 });
    ctx.save();
    path(ctx); ctx.clip();
    // Faint turning stars on the field, and a band of light moving across it.
    for (let i = 0; i < 9; i++) {
      const sx = x + (0.08 + 0.84 * h1(i * 7.7 + id.length)) * w, sy = yy + (0.12 + 0.76 * h1(i * 3.9 + 2)) * hh;
      ctx.globalAlpha = 0.2;
      starPath(sx, sy, (34 + 26 * h1(i)) * u, (14 + 8 * h1(i)) * u, 8, t * 0.3 * (i % 2 ? 1 : -1) + i)(ctx);
      ctx.fillStyle = rgba(th.cream); ctx.fill();
    }
    ctx.globalAlpha = 0.9;
    for (let i = 0; i < 3; i++) {
      const per = w + 300 * u, dir = i % 2 ? -1 : 1;
      const k = ((t * (46 + i * 17) * u + i * 500 * u) % per);
      const fx = dir > 0 ? x - 150 * u + k : x + w + 150 * u - k, fy = yy + hh * (0.14 + i * 0.3) + Math.sin(t * 1.8 + i * 2) * 14 * u;
      motif(ctx, th, 1, fx, fy, 62 * u, t + i, i, dir);
    }
    ctx.globalAlpha = 1;
    const k = ((t * 0.16) % 1.6) - 0.3;
    const gx = x + w * k;
    const bg = ctx.createLinearGradient(gx - w * 0.12, yy, gx + w * 0.12, yy + hh);
    bg.addColorStop(0, "rgba(255,255,255,0)"); bg.addColorStop(0.5, "rgba(255,246,210,0.13)"); bg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = bg; ctx.fillRect(x, yy, w, hh);
    ctx.restore();
    for (const [gx2, gy] of [[x + 8 * u, yy + 8 * u], [x + w - 8 * u, yy + 8 * u], [x + 8 * u, yy + hh - 8 * u], [x + w - 8 * u, yy + hh - 8 * u]]) {
      tess(ctx, th, circPath(gx2, gy, 16 * u), th.coral, { row: th.gold, rw: 5, edge: th.cream, ew: 5, pat: 0.8 });
    }
    // Twinkles.
    for (let i = 0; i < 11; i++) {
      const sx = x + (0.05 + 0.9 * h1(i * 5.3 + 9)) * w, sy = yy + (0.08 + 0.84 * h1(i * 2.1 + 5)) * hh;
      sparkle(ctx, th, sx, sy, 15 * u, Math.sin(t * 2.1 + i * 1.9) * 0.6 + 0.2);
    }
    ctx.restore();
  }

  function maker(ctx, S, th, p, ex) {
    return function put(k, cx, cy, fn, o = {}) {
      const a = (o.a ?? 0.04) + k * (o.s ?? 0.06), b = a + (o.d ?? 0.24);
      const raw = seg(p, a, b);
      const q = o.grow ? (raw > 0 ? 1 : 0) : back(raw);
      const x = ex > 0 ? eo(seg(ex, k * 0.04, 0.6 + k * 0.04)) : 0;
      if (q <= 0.001 || x >= 1) return;
      const seed = k * 3.7 + (o.seed || 0);
      ctx.save();
      ctx.globalAlpha *= clamp((o.grow ? 1 : q) * 2.2) * (1 - x);
      ctx.translate(cx, cy + x * x * S.H * 0.2);
      ctx.rotate((h1(seed) - 0.5) * 1.6 * x);
      const sc = (o.grow ? 1 : clamp(q, 0, 1.12)) * (1 - 0.25 * x);
      ctx.scale(sc, sc);
      ctx.translate(-cx, -cy);
      fn(o.grow ? eo(raw) : q);
      ctx.restore();
      if (raw > 0 && raw < 1) swarm(ctx, th, cx, cy, (o.r ?? 140) * th.u, seed, 1 - raw, false);
      if (x > 0) swarm(ctx, th, cx, cy, (o.r ?? 140) * th.u, seed + 40, x, true);
    };
  }

  // Each drawn scene: its headline plaque and a frieze, the laid panel and the drawing. The panel and plaque
  // are laid as stones at the start; at the change the whole scene lifts off as stones while the next is laid.
  function wrap(id, fn) {
    return (ctx, S, box, p, d, info) => {
      const th = theme(S);
      th.t = info.t;
      const ex = info.exit || 0;
      if (ex >= 1) return;
      const u = th.u, t = info.t, L = info.local;
      const H = headSpec(th, id), P = H ? H.full : null;
      const R = bedRect(S, th, box);
      const fz = P ? sideFrieze(S, th, P) : null;
      if (ex > 0) {
        const B = buffer(S, "out");
        if (fz) frieze(B.ctx, S, th, fz.y, fz.x0, fz.x1, t, 1, 1);
        if (P) plaqueShell(B.ctx, th, P, t);
        bed(B.ctx, S, th, R, t, id);
        fn(B.ctx, S, th, box, 1, d, info, 0, maker(B.ctx, S, th, 1, 0));
        if (H) letters(B.ctx, th, H, 99, t);
        const fr = fz ? { x: fz.x0, y: fz.y - 64 * u, w: fz.x1 - fz.x0, h: 128 * u } : null;
        shatter(ctx, th, B, grow(union(R, P, fr, box), 50 * u), ex, true, id.length * 7);
        return;
      }
      // The drawing starts while the panel is still being laid (the chart's first column at once).
      const pp = clamp((L - (id === "chart" ? 0.02 : 0.14)) / Math.max(0.6, info.hold * 0.5));
      const lay = clamp(L / 0.62);
      if (fz) frieze(ctx, S, th, fz.y, fz.x0, fz.x1, t, 1, eo(seg(L, 0.15, 0.8)));
      if (lay < 1) {
        const B = buffer(S, "in");
        if (P) plaqueShell(B.ctx, th, P, t);
        bed(B.ctx, S, th, R, t, id);
        shatter(ctx, th, B, grow(union(R, P), 40 * u), lay, false, id.length * 3);
      } else {
        if (P) plaqueShell(ctx, th, P, t);
        bed(ctx, S, th, R, t, id);
      }
      ctx.save();
      fn(ctx, S, th, box, pp, d, info, 0, maker(ctx, S, th, pp, 0));
      ctx.restore();
      if (H) letters(ctx, th, H, L, t);
    };
  }

  // ---- chart: tessera ingots rising from a laid floor ------------------------------------------------
  function chartScene(ctx, S, th, box, p, d, info, ex, put) {
    const u = th.u, t = info.t, tall = S.tall;
    const n = d.values.length, max = Math.max(...d.values, 1);
    const baseY = box.y + box.h - 96 * u;
    const topY = box.y + (tall ? 210 : 196) * u;
    const maxH = baseY - topY;
    const bw = Math.min(260 * u, box.w / (n * 1.45));
    const gap = (box.w - n * bw) / (n + 1);
    // Floor.
    put(0, box.x + box.w / 2, baseY + 12 * u, () => {
      const fw = box.w * 0.96;
      tess(ctx, th, chamfPath(box.x + (box.w - fw) / 2, baseY, fw, 26 * u, 10 * u), th.creamShade, { row: th.cream, rw: 9, edge: th.gold, ew: 5, march: -t * 16, pat: 0.8 });
    }, { grow: true, a: 0.0, s: 0, d: 0.16, r: 10 });
    for (let i = 0; i < n; i++) {
      const hot = i === d.highlight;
      const hh = maxH * (d.values[i] / max);
      const cx = box.x + gap * (i + 1) + bw * (i + 0.5);
      const val = d.values[i];
      // Once built, light runs along the tops of the columns in turn.
      const flash = p >= 1 ? clamp(1 - Math.abs(((t * 0.5) % 1) * (n + 1.6) - (i + 0.5)) * 1.3) : 0;
      put(i, cx, baseY - hh / 2, (g) => {
        const gh = hh * g, c = Math.min(30 * u, bw * 0.28);
        const x = cx - bw / 2, y = baseY - gh;
        const body = hot ? th.acc : th.gold;
        tess(ctx, th, polyPath([[x, baseY], [x, y + c], [x + c, y], [x + bw - c, y], [x + bw, y + c], [x + bw, baseY]]), body, { row: mix(body, WHITE, 0.35), rw: 13, edge: hot ? th.cream : th.grout, ew: 7, march: hot ? -t * 24 : -t * 6, big: true, pat: 0.95 });
        // A column of small stones standing in the bar.
        if (gh > 80 * u) {
          tileStroke(ctx, th, (gg) => { gg.beginPath(); gg.moveTo(cx, baseY - 18 * u); gg.lineTo(cx, y + 36 * u); }, mix(body, WHITE, 0.55), 12 * u, -t * (hot ? 40 : 14), false);
        }
        if (hot) {
          // Light climbs the bar.
          for (let s = 0; s < 4; s++) {
            const k = (t * 0.45 + s / 4) % 1;
            sparkle(ctx, th, cx + (h1(s * 3) - 0.5) * bw * 0.6, baseY - 12 * u - (gh - 24 * u) * k, 22 * u, Math.sin(k * Math.PI), th.gleam);
          }
        }
        if (flash > 0 && g >= 1) {
          ctx.save(); ctx.globalAlpha *= flash * 0.8;
          tess(ctx, th, polyPath([[x, y + c + 30 * u], [x, y + c], [x + c, y], [x + bw - c, y], [x + bw, y + c], [x + bw, y + c + 30 * u]]), th.gleam, { edge: null, pat: 0.9 });
          ctx.restore();
          for (let s = 0; s < 3; s++) sparkle(ctx, th, cx + (s - 1) * bw * 0.32, y - 10 * u - s % 2 * 16 * u, (20 + 10 * flash) * u, flash, th.gleam);
        }
      }, { grow: true, a: 0.02, s: 0.08, d: 0.32, r: 120 });
      // Value tablet above, label below.
      put(i + 0.5, cx, baseY - hh - 80 * u, () => {
        const bob = Math.sin(t * 2.1 + i * 1.3) * 6 * u - flash * 14 * u;
        const q = eo(seg(p, 0.08 + i * 0.08, 0.38 + i * 0.08));
        ctx.save(); ctx.translate(0, bob);
        tablet(ctx, th, M.formatNumber(val * q, 0, d.prefix, d.suffix), cx, baseY - hh * q - 78 * u, 96 * u, { hf: 1.38, bg: hot ? th.acc : th.cream, ink: hot ? th.cream : th.ink, row: hot ? mix(th.acc, WHITE, 0.3) : th.creamShade, w: Math.max(bw + 20 * u, 200 * u) });
        ctx.restore();
      }, { a: 0.08, s: 0.08, d: 0.2, r: 100 });
      put(i + 0.2, cx, baseY + 56 * u, () => {
        tablet(ctx, th, d.labels[i] || "", cx, baseY + 56 * u, 42 * u, { w: Math.max(bw, measure(ctx, th, d.labels[i] || "", 42 * u) + 50 * u), bg: th.creamShade, row: th.cream });
      }, { a: 0.02, s: 0.08, d: 0.2, r: 80 });
    }
  }
  const M = window.DreamcutMotion;

  // ---- object: a lit tessera screen with numbered callouts ------------------------------------------
  function objectScene(ctx, S, th, box, p, d, info, ex, put) {
    const u = th.u, t = info.t, tall = S.tall;
    const phone = d.kind === "phone";
    const reg = tall ? { x: box.x, y: box.y + 26 * u, w: box.w, h: box.h * 0.6 } : { x: box.x + 20 * u, y: box.y + 8 * u, w: box.w * 0.6, h: box.h - 24 * u };
    let w, h;
    if (phone) { h = reg.h * 0.92; w = Math.min(h * 0.5, reg.w * 0.7); h = Math.min(h, w * 2.0); }
    else { w = Math.min(reg.w * 0.94, reg.h * 1.32); h = w * 0.62; if (h > reg.h * 0.8) { h = reg.h * 0.8; w = h / 0.62; } }
    const x = reg.x + (reg.w - w) / 2, y = reg.y + (reg.h - h - (phone ? 0 : h * 0.14)) / 2;
    const pad = (phone ? 22 : 24) * u;
    const sx = x + pad, sy = y + pad, sw = w - pad * 2, sh = h - pad * 2;
    const sun = [sx + sw * 0.72, sy + sh * 0.3];
    put(0, x + w / 2, y + h / 2, () => {
      tess(ctx, th, rrPath(x, y, w, h, (phone ? 40 : 20) * u), th.gold, { row: th.cream, rw: 12, edge: th.grout, ew: 7, march: t * 10, big: true });
      if (!phone) {
        tess(ctx, th, polyPath([[x - w * 0.07, y + h + h * 0.09], [x + w * 1.07, y + h + h * 0.09], [x + w, y + h], [x, y + h]]), th.creamShade, { row: th.cream, rw: 9, edge: th.grout, ew: 6, pat: 0.9 });
        tess(ctx, th, rrPath(x + w * 0.4, y + h + h * 0.012, w * 0.2, h * 0.045, 8 * u), th.gold, { edge: th.grout, ew: 3, pat: 0.7 });
      }
      // The screen: night sky with a turning sun, drifting clouds, hills and a small timeline.
      const spath = rrPath(sx, sy, sw, sh, 10 * u);
      tess(ctx, th, spath, th.sky, { edge: th.grout, ew: 5, pat: 0.7 });
      ctx.save(); spath(ctx); ctx.clip();
      for (let c = 0; c < 2; c++) {
        const cx = sx + ((((t * (14 + c * 9) * u + c * sw * 0.55) % (sw + 240 * u)) + sw + 240 * u) % (sw + 240 * u)) - 120 * u;
        tess(ctx, th, (g) => { g.beginPath(); g.ellipse(cx, sy + sh * (0.14 + c * 0.2), 70 * u, 20 * u, 0, 0, TAU); }, mix(th.lapis, th.cream, 0.4), { edge: null, pat: 0.4 });
      }
      // Sun with rays.
      for (let r = 0; r < 12; r++) {
        const a = (r / 12) * TAU + t * 0.5;
        const rr = sh * 0.17, r2 = sh * (r % 2 ? 0.27 : 0.33);
        tess(ctx, th, polyPath([[sun[0] + Math.cos(a - 0.1) * rr, sun[1] + Math.sin(a - 0.1) * rr], [sun[0] + Math.cos(a) * r2, sun[1] + Math.sin(a) * r2], [sun[0] + Math.cos(a + 0.1) * rr, sun[1] + Math.sin(a + 0.1) * rr]]), th.gold, { edge: null, pat: 0.5 });
      }
      tess(ctx, th, circPath(sun[0], sun[1], sh * 0.14), th.gleam, { row: th.gold, rw: 6, edge: th.coral, ew: 5, pat: 0.7 });
      const hy = sy + sh * 0.62;
      tess(ctx, th, (g) => { g.beginPath(); g.moveTo(sx, hy + sh * 0.1); g.quadraticCurveTo(sx + sw * 0.25, hy - sh * 0.2, sx + sw * 0.5, hy + sh * 0.04); g.quadraticCurveTo(sx + sw * 0.75, hy + sh * 0.2, sx + sw, hy - sh * 0.05); g.lineTo(sx + sw, sy + sh); g.lineTo(sx, sy + sh); g.closePath(); }, th.emeraldDeep, { row: th.emerald, rw: 7, edge: null });
      // Timeline.
      const ty = sy + sh * 0.7, th2 = sh * 0.07;
      const clips = [[0.04, 0.3, th.coral], [0.38, 0.22, th.gold], [0.65, 0.3, th.teal]];
      for (let r = 0; r < 3; r++) clips.forEach(([cx0, cw, cc], i) => {
        const grow = eo(seg(p, 0.35 + i * 0.05 + r * 0.04, 0.55 + i * 0.05 + r * 0.04));
        if (grow <= 0) return;
        tess(ctx, th, rrPath(sx + sw * (cx0 + r * 0.04), ty + r * (th2 + 8 * u), sw * cw * grow, th2, 5 * u), cc, { edge: th.grout, ew: 3.5, pat: 0.7 });
      });
      const px = sx + sw * (0.06 + ((t * 0.17) % 0.9));
      ctx.fillStyle = rgba(th.cream); ctx.fillRect(px - 2.5 * u, ty - 16 * u, 5 * u, sh * 0.3);
      polyPath([[px - 10 * u, ty - 22 * u], [px + 10 * u, ty - 22 * u], [px, ty - 8 * u]])(ctx); ctx.fill();
      ctx.restore();
    }, { a: 0, d: 0.3, r: 260 });
    // Callouts.
    const anchors = [sun, [sx + sw * 0.5, sy + sh * 0.78], [sx + sw * 0.16, sy + sh * 0.86]];
    const size = 42 * u;
    const labelLeft = box.x + box.w * 0.66;
    d.callouts.forEach((label, i) => {
      if (!label) return;
      const [ax, ay] = anchors[i];
      const ly = tall ? box.y + box.h * (0.72 + i * 0.12) : box.y + box.h * (0.2 + i * 0.3);
      const tw = measure(ctx, th, label, size) + size * 1.15 + (tall ? 70 * u : 0);
      const left = tall ? box.x + (box.w - tw) / 2 : labelLeft;
      put(i + 1, left + tw / 2, ly, (q) => {
        if (!tall) {
          const e = eo(seg(q, 0, 0.8));
          tileStroke(ctx, th, (g) => { g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax + (left - 10 * u - ax) * e, ay + (ly - ay) * e); }, th.acc, 8 * u, -t * 30);
          // A bead of light runs down each leader in turn.
          if (e >= 1) { const k = (t * 0.45 + i * 0.33) % 1; sparkle(ctx, th, ax + (left - 10 * u - ax) * k, ay + (ly - ay) * k, 26 * u, Math.sin(k * Math.PI), th.gleam); }
        }
        if (tall) {
          const bx = left + 36 * u;
          tess(ctx, th, circPath(bx, ly, 30 * u), th.acc, { row: th.gold, rw: 6, edge: th.cream, ew: 5 });
          tileWord(ctx, th, String(i + 1), bx, ly, 42 * u, { fill: th.cream, outline: true });
          tablet(ctx, th, label, left + 70 * u, ly, size, { left: true });
        } else tablet(ctx, th, label, left, ly, size, { left: true });
      }, { a: 0.3, s: 0.1, d: 0.25, r: 100 });
      // The anchor dot pulses on the device.
      put(i + 1.6, ax, ay, () => {
        const pulse = 1 + Math.sin(t * 3.2 + i * 2) * 0.22;
        tess(ctx, th, circPath(ax, ay, 14 * u * pulse), th.acc, { row: th.cream, rw: 5, edge: th.grout, ew: 4, pat: 0.8 });
        if (tall) tileWord(ctx, th, String(i + 1), ax, ay, 24 * u, { fill: th.cream });
      }, { a: 0.3, s: 0.1, d: 0.2, r: 40 });
    });
  }

  // ---- people: haloed figures with a trade each ----------------------------------------------------
  function person(ctx, th, cx, base, s, idx, hot, t, q) {
    const u = th.u;
    const bob = Math.sin(t * 1.9 + idx * 1.4) * 4 * u;
    const robes = [th.teal, th.coral, th.violet, th.gold, th.emerald, th.lapis];
    const robe = hot ? th.acc : robes[idx % robes.length];
    const bw = s * 0.62, top = base - s * 0.62 + bob, hr = s * 0.15, hy = top - hr * 0.55;
    // Halo.
    const R = hr * 1.95;
    tileStroke(ctx, th, circPath(cx, hy, R), hot ? th.gold : th.cream, hr * 0.5, t * (hot ? 26 : 16) * (idx % 2 ? -1 : 1));
    tess(ctx, th, circPath(cx, hy, R - hr * 0.3), mix(th.wineDeep, th.lapisDeep, 0.5), { edge: null, pat: 0.8 });
    // A short run of halo stones always catches the light; in its turn the whole ring flares.
    const ga = t * 1.5 * (idx % 2 ? -1 : 1) + idx * 1.7;
    tileStroke(ctx, th, (g) => { g.beginPath(); g.arc(cx, hy, R, ga, ga + 0.9); }, th.gleam, hr * 0.5, 0, false);
    if (q > 0) {
      ctx.save(); ctx.globalAlpha *= q;
      tileStroke(ctx, th, circPath(cx, hy, R), th.gleam, hr * 0.5, t * 30, false);
      ctx.restore();
      for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + t; sparkle(ctx, th, cx + Math.cos(a) * R * 1.18, hy + Math.sin(a) * R * 1.18, 16 * u, q, th.gleam); }
    }
    // Robe.
    tess(ctx, th, (g) => {
      g.beginPath(); g.moveTo(cx - bw * 0.64, base); g.lineTo(cx - bw * 0.46, top + bw * 0.32); g.quadraticCurveTo(cx - bw * 0.4, top, cx, top);
      g.quadraticCurveTo(cx + bw * 0.4, top, cx + bw * 0.46, top + bw * 0.32); g.lineTo(cx + bw * 0.64, base); g.closePath();
    }, robe, { row: mix(robe, WHITE, 0.35), rw: 9, edge: th.cream, ew: 6, march: t * 6, pat: 0.95 });
    tess(ctx, th, polyPath([[cx - bw * 0.2, top + 2 * u], [cx, top + bw * 0.42], [cx + bw * 0.2, top + 2 * u]]), th.cream, { edge: th.grout, ew: 3, pat: 0.7 });
    tess(ctx, th, rrPath(cx - bw * 0.5, base - s * 0.2, bw, 14 * u, 4 * u), th.gold, { edge: th.grout, ew: 3, pat: 0.6 });
    // Head.
    const skin = th.skin[(idx * 2 + 1) % th.skin.length];
    tess(ctx, th, circPath(cx, hy, hr), skin, { row: mix(skin, WHITE, 0.2), rw: 5, edge: th.grout, ew: 4, pat: 0.8 });
    const blink = (t * 0.45 + idx * 0.31) % 1 < 0.05 ? 0.15 : 1;
    ctx.save(); ctx.fillStyle = rgba(th.ink);
    for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + sgn * hr * 0.4, hy - hr * 0.05, hr * 0.1, hr * 0.12 * blink, 0, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = rgba(th.ink); ctx.lineWidth = 3.5 * u; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(cx, hy + hr * 0.12, hr * 0.34, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.restore();
    // Each wears their trade.
    const k = idx % 6;
    if (k === 0) { // round glasses
      ctx.save(); ctx.strokeStyle = rgba(th.ink); ctx.lineWidth = 4 * u;
      for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + sgn * hr * 0.4, hy - hr * 0.05, hr * 0.27, 0, TAU); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(cx - hr * 0.13, hy - hr * 0.05); ctx.lineTo(cx + hr * 0.13, hy - hr * 0.05); ctx.stroke(); ctx.restore();
      tess(ctx, th, (g) => { g.beginPath(); g.arc(cx, hy, hr * 1.04, Math.PI * 1.06, Math.PI * 1.94); g.lineTo(cx + hr, hy - hr * 0.5); g.quadraticCurveTo(cx, hy - hr * 1.12, cx - hr, hy - hr * 0.5); g.closePath(); }, th.ink, { edge: null, pat: 0.7 });
    } else if (k === 1) { // beret
      tess(ctx, th, (g) => { g.beginPath(); g.ellipse(cx - hr * 0.1, hy - hr * 0.95, hr * 1.2, hr * 0.5, -0.12, 0, TAU); }, th.lapis, { row: th.lapis, rw: 4, edge: th.cream, ew: 4, pat: 0.8 });
      tess(ctx, th, circPath(cx - hr * 0.1, hy - hr * 1.45, hr * 0.14), th.lapisDeep, { edge: th.cream, ew: 3, pat: 0.6 });
    } else if (k === 2) { // sprout
      const sw = Math.sin(t * 2.3 + idx) * 0.25;
      ctx.save(); ctx.translate(cx, hy - hr * 0.95); ctx.rotate(sw);
      tileStroke(ctx, th, (g) => { g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -hr * 0.9); }, th.emeraldDeep, 6 * u, 0, false);
      tess(ctx, th, leafPath(0, -hr * 0.8, -hr * 0.85, -hr * 1.2, 0.35), th.emerald, { edge: th.emeraldDeep, ew: 3, pat: 0.6 });
      tess(ctx, th, leafPath(0, -hr * 0.8, hr * 0.85, -hr * 1.3, -0.35), th.emerald, { edge: th.emeraldDeep, ew: 3, pat: 0.6 });
      ctx.restore();
    } else if (k === 3) { // scarf
      tess(ctx, th, polyPath([[cx - bw * 0.3, top + 4 * u], [cx + bw * 0.3, top + 4 * u], [cx + bw * 0.34, top + bw * 0.16], [cx + bw * 0.2, top + bw * 0.5], [cx + bw * 0.06, top + bw * 0.16], [cx - bw * 0.34, top + bw * 0.14]]), th.coral, { row: th.cream, rw: 4, edge: th.grout, ew: 4, pat: 0.8 });
    } else if (k === 4) { // headphones
      ctx.save(); ctx.lineCap = "round";
      tileStroke(ctx, th, (g) => { g.beginPath(); g.arc(cx, hy - hr * 0.05, hr * 1.12, Math.PI * 1.02, Math.PI * 1.98); }, th.cream, 9 * u, 0);
      for (const sgn of [-1, 1]) tess(ctx, th, rrPath(cx + sgn * hr * 1.12 - 8 * u, hy - hr * 0.3, 16 * u, hr * 0.7, 6 * u), th.coral, { edge: th.grout, ew: 3, pat: 0.7 });
      ctx.restore();
    } else { // leaf crown
      for (let i = -2; i <= 2; i++) {
        const a = -Math.PI / 2 + i * 0.42, x0 = cx + Math.cos(a) * hr * 0.92, y0 = hy + Math.sin(a) * hr * 0.92;
        tess(ctx, th, leafPath(x0, y0, x0 + Math.cos(a) * hr * 0.7, y0 + Math.sin(a) * hr * 0.7 - 2 * u, 0.4), th.gold, { edge: th.grout, ew: 2.5, pat: 0.5 });
      }
    }
    void q;
  }
  // Every figure has its own trade: past the named badges the rest are given roles the badges do not use.
  const ROLES = ["Producer", "Client", "Sound", "Colourist", "Writer", "Host"];
  function role(badges, i) {
    const named = badges.filter((b) => b && String(b).trim());
    if (i < named.length) return named[i];
    const pool = ROLES.filter((r) => !named.some((b) => String(b).toLowerCase() === r.toLowerCase()));
    return pool[(i - named.length) % pool.length];
  }
  function peopleScene(ctx, S, th, box, p, d, info, ex, put) {
    const u = th.u, t = info.t;
    const n = Math.max(2, Math.min(6, Math.round(d.count)));
    const cols = S.tall && n > 2 ? 2 : n, rows = Math.ceil(n / cols);
    const cw = box.w / cols, chh = box.h / rows;
    const s = Math.min(chh * 0.66, cw * 1.05);
    for (let r = 0; r < rows; r++) {
      const base = box.y + (r + 1) * chh - 104 * u;
      tess(ctx, th, chamfPath(box.x, base + 4 * u, box.w, 24 * u, 10 * u), th.creamShade, { row: th.cream, rw: 8, edge: th.gold, ew: 5, march: t * 14 * (r % 2 ? -1 : 1), pat: 0.8 });
    }
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols), cc = i % cols, inRow = Math.min(cols, n - r * cols);
      const hot = i === Math.min(n - 1, d.highlight);
      const cx = box.x + box.w / 2 + (cc - (inRow - 1) / 2) * cw;
      const base = box.y + (r + 1) * chh - 104 * u;
      const size = s * (hot ? 1.08 : 1);
      // Once all are standing, light runs round each halo in turn.
      const flash = p >= 1 ? clamp(1 - Math.abs(((t * 0.42) % 1) * (n + 1.4) - (i + 0.5)) * 1.3) : 0;
      put(i, cx, base - size * 0.45, () => person(ctx, th, cx, base, size, i, hot, t, flash), { a: 0.06, s: Math.min(0.1, 0.5 / n), d: 0.28, r: 150 });
      const label = role(d.badges, i);
      put(i + 0.5, cx, base + 66 * u, () => {
        tablet(ctx, th, label || "", cx, base + 66 * u, 42 * u, { w: Math.max(150 * u, Math.min(cw - 12 * u, measure(ctx, th, label || "", 42 * u) + 54 * u)), bg: hot ? th.acc : th.cream, ink: hot ? th.cream : th.ink, row: hot ? mix(th.acc, WHITE, 0.3) : th.creamShade });
      }, { a: 0.16, s: Math.min(0.1, 0.5 / n), d: 0.22, r: 80 });
    }
  }

  // ---- process: niches joined by a winding vine of tiles -------------------------------------------
  function icon(ctx, th, kind, cx, cy, s, color, t) {
    const u = th.u, w = Math.max(9 * u, s * 0.085);
    if (kind === "file") {
      tess(ctx, th, polyPath([[cx - s * 0.32, cy - s * 0.44], [cx + s * 0.1, cy - s * 0.44], [cx + s * 0.32, cy - s * 0.22], [cx + s * 0.32, cy + s * 0.44], [cx - s * 0.32, cy + s * 0.44]]), th.cream, { row: th.creamShade, rw: 8, edge: th.grout, ew: 5, pat: 0.8 });
      for (let i = 0; i < 3; i++) tileStroke(ctx, th, (g) => { g.beginPath(); g.moveTo(cx - s * 0.18, cy + (i * 0.14 - 0.06) * s); g.lineTo(cx + s * (i === 2 ? 0.04 : 0.18), cy + (i * 0.14 - 0.06) * s); }, color, w * 0.8, -t * 20, false);
    } else if (kind === "spark") {
      const sp = 1 + Math.sin(t * 3) * 0.08;
      tess(ctx, th, starPath(cx, cy, s * 0.48 * sp, s * 0.14, 4, t * 0.5), th.gold, { row: th.cream, rw: 7, edge: th.grout, ew: 5, pat: 0.8 });
      tess(ctx, th, starPath(cx + s * 0.3, cy - s * 0.3, s * 0.16, s * 0.05, 4, -t), th.cream, { edge: th.grout, ew: 3, pat: 0.5 });
      tess(ctx, th, starPath(cx - s * 0.32, cy + s * 0.28, s * 0.12, s * 0.04, 4, t), th.cream, { edge: th.grout, ew: 3, pat: 0.5 });
    } else if (kind === "eye") {
      tess(ctx, th, (g) => { g.beginPath(); g.moveTo(cx - s * 0.46, cy); g.quadraticCurveTo(cx, cy - s * 0.46, cx + s * 0.46, cy); g.quadraticCurveTo(cx, cy + s * 0.46, cx - s * 0.46, cy); g.closePath(); }, th.cream, { row: th.creamShade, rw: 8, edge: th.grout, ew: 5, pat: 0.8 });
      const look = Math.sin(t * 1.4) * s * 0.06;
      tess(ctx, th, circPath(cx + look, cy, s * 0.17), th.teal, { row: th.lapis, rw: 5, edge: th.grout, ew: 4, pat: 0.7 });
      tess(ctx, th, circPath(cx + look, cy, s * 0.06), th.ink, { edge: null, pat: 0 });
    } else {
      tess(ctx, th, circPath(cx, cy, s * 0.4), th.emerald, { row: th.emeraldDeep, rw: 8, edge: th.cream, ew: 6, march: t * 12, pat: 0.8 });
      tileStroke(ctx, th, (g) => { g.beginPath(); g.moveTo(cx - s * 0.2, cy + s * 0.02); g.lineTo(cx - s * 0.05, cy + s * 0.17); g.lineTo(cx + s * 0.22, cy - s * 0.14); }, th.cream, w * 1.2, 0, false);
    }
  }
  const bez = (a, c1, c2, b, k) => { const m = 1 - k; return [m * m * m * a[0] + 3 * m * m * k * c1[0] + 3 * m * k * k * c2[0] + k * k * k * b[0], m * m * m * a[1] + 3 * m * m * k * c1[1] + 3 * m * k * k * c2[1] + k * k * k * b[1]]; };
  function processScene(ctx, S, th, box, p, d, info, ex, put) {
    const u = th.u, t = info.t, tall = S.tall;
    const n = d.steps.length;
    const kinds = ["file", "spark", "eye", "check"];
    const cells = [];
    if (!tall) {
      const cw = Math.min(430 * u, box.w / n - 190 * u), ch = box.h - 34 * u, gx = (box.w - n * cw) / (n + 1);
      for (let i = 0; i < n; i++) cells.push({ x: box.x + gx + i * (cw + gx), y: box.y + 8 * u, w: cw, h: ch });
    } else {
      const cw = box.w * 0.92, ch = (box.h / n) * 0.76, gy = (box.h - n * ch) / (n + 1);
      for (let i = 0; i < n; i++) cells.push({ x: box.x + (box.w - cw) / 2, y: box.y + gy + i * (ch + gy), w: cw, h: ch });
    }
    // Vine first, so the niches overlap its ends.
    for (let i = 0; i < n - 1; i++) {
      const A = cells[i], B = cells[i + 1];
      const a = tall ? [A.x + A.w / 2, A.y + A.h] : [A.x + A.w, A.y + A.h * 0.55], b = tall ? [B.x + B.w / 2, B.y] : [B.x, B.y + B.h * 0.55];
      const c1 = tall ? [a[0] + 90 * u, a[1] + (b[1] - a[1]) * 0.35] : [a[0] + (b[0] - a[0]) * 0.4, a[1] - 70 * u];
      const c2 = tall ? [b[0] - 90 * u, a[1] + (b[1] - a[1]) * 0.65] : [a[0] + (b[0] - a[0]) * 0.6, b[1] + 70 * u];
      put(i + 0.55, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, () => {
        const e = eo(seg(p, 0.2 + i * 0.22, 0.5 + i * 0.22));
        if (e <= 0) return;
        const steps = 36, m = Math.max(2, Math.floor(steps * e));
        tileStroke(ctx, th, (g) => { g.beginPath(); for (let s = 0; s <= m; s++) { const q = bez(a, c1, c2, b, (s / steps)); s ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); } }, th.acc, 15 * u, -t * 44);
        if (e > 0.96) {
          const tip = bez(a, c1, c2, b, 0.985), pre = bez(a, c1, c2, b, 0.93), ang = Math.atan2(tip[1] - pre[1], tip[0] - pre[0]);
          ctx.save(); ctx.translate(b[0], b[1]); ctx.rotate(ang);
          tess(ctx, th, polyPath([[8 * u, 0], [-30 * u, -26 * u], [-30 * u, 26 * u]]), th.acc, { row: th.cream, rw: 5, edge: th.cream, ew: 5, pat: 0.8 });
          ctx.restore();
        }
        // A bead of light travels along the vine.
        const k = (t * 0.5 + i * 0.37) % 1;
        if (k < e) { const q = bez(a, c1, c2, b, k); sparkle(ctx, th, q[0], q[1], 24 * u, 1, th.gleam); }
      }, { grow: true, a: 0, d: 0.1, r: 60 });
    }
    cells.forEach((c, i) => {
      const last = i === n - 1;
      const flash = p >= 1 ? clamp(1 - Math.abs(((t * 0.45) % 1) * (n + 1.4) - (i + 0.5)) * 1.3) : 0;
      const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
      put(i, cx, cy, () => {
        const body = last ? th.emeraldDeep : th.lapisDeep;
        const path = tall ? rrPath(c.x, c.y, c.w, c.h, 40 * u) : archPath(c.x, c.y, c.w, c.h);
        tess(ctx, th, path, body, { row: last ? th.emerald : th.lapis, rw: 12, edge: th.cream, ew: 8, march: t * 12 * (i % 2 ? -1 : 1), big: true });
        const ic = tall ? [c.x + c.h * 0.5, cy] : [cx, c.y + c.h * 0.46], is = tall ? c.h * 0.62 : c.w * 0.62;
        icon(ctx, th, kinds[last ? 3 : i % 3], ic[0], ic[1], is, th.acc, t);
        // Number medallion.
        const nm = tall ? [c.x + 54 * u, c.y + 54 * u] : [cx, c.y + c.h * 0.13];
        tess(ctx, th, circPath(nm[0], nm[1], 50 * u * (1 + flash * 0.1)), th.acc, { row: mix(th.acc, WHITE, 0.3), rw: 8, edge: th.cream, ew: 6, march: -t * 18 });
        if (flash > 0) {
          ctx.save(); ctx.globalAlpha *= flash;
          tileStroke(ctx, th, circPath(nm[0], nm[1], 66 * u), th.gleam, 10 * u, t * 40, false);
          ctx.restore();
          for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU - t * 1.4; sparkle(ctx, th, nm[0] + Math.cos(a) * 84 * u, nm[1] + Math.sin(a) * 84 * u, 18 * u, flash, th.gleam); }
        }
        tileWord(ctx, th, String(i + 1), nm[0], nm[1], 62 * u, { fill: th.cream, fill2: th.gold, outline: true });
        // Label.
        const label = d.steps[i];
        if (tall) tablet(ctx, th, label, c.x + c.w * 0.66, cy, 42 * u, { w: Math.min(c.w * 0.58, measure(ctx, th, label, 42 * u) + 54 * u) });
        else tablet(ctx, th, label, cx, c.y + c.h * 0.87, 42 * u, { w: Math.min(c.w * 0.94, measure(ctx, th, label, 42 * u) + 54 * u) });
      }, { a: 0.04, s: 0.2, d: 0.3, r: 200 });
    });
  }

  // ---- compare: two amphorae filling with tile ----------------------------------------------------
  function amphora(cx, base, W, H) {
    const top = base - H, nw = W * 0.34, lw = W * 0.52;
    return (g) => {
      g.beginPath();
      g.moveTo(cx - lw / 2, top); g.lineTo(cx + lw / 2, top); g.lineTo(cx + nw / 2, top + H * 0.07); g.lineTo(cx + nw / 2, top + H * 0.2);
      g.bezierCurveTo(cx + nw / 2, top + H * 0.32, cx + W / 2, top + H * 0.3, cx + W / 2, top + H * 0.56);
      g.bezierCurveTo(cx + W / 2, top + H * 0.82, cx + W * 0.24, base - H * 0.02, cx + W * 0.17, base);
      g.lineTo(cx - W * 0.17, base);
      g.bezierCurveTo(cx - W * 0.24, base - H * 0.02, cx - W / 2, top + H * 0.82, cx - W / 2, top + H * 0.56);
      g.bezierCurveTo(cx - W / 2, top + H * 0.3, cx - nw / 2, top + H * 0.32, cx - nw / 2, top + H * 0.2);
      g.lineTo(cx - nw / 2, top + H * 0.07); g.closePath();
    };
  }
  function compareScene(ctx, S, th, box, p, d, info, ex, put) {
    const u = th.u, t = info.t, tall = S.tall;
    const Hmax = tall ? box.h * 0.5 : box.h - 150 * u;
    const W = Math.min(tall ? box.w * 0.4 : 400 * u, Hmax * 0.8);
    const H = Math.min(Hmax, W * 1.4);
    const base = tall ? box.y + 130 * u + H : box.y + box.h - 28 * u;
    const cxs = [box.x + box.w * (tall ? 0.26 : 0.2), box.x + box.w * (tall ? 0.74 : 0.8)];
    const vals = [d.leftValue, d.rightValue], labels = [d.left, d.right];
    const mx = Math.max(...vals, 1);
    for (let i = 0; i < 2; i++) {
      const cx = cxs[i], hot = i === 1;
      const body = hot ? th.acc : th.clay;
      const liquid = hot ? th.gold : mix(th.gold, th.clay, 0.35);
      put(i * 2, cx, base - H / 2, (q) => {
        const path = amphora(cx, base, W, H);
        // Stones keep dropping into the mouth and settle with a ripple.
        const drops = [];
        for (let b = 0; b < 4; b++) {
          const k = (t * 0.7 + b / 4 + i * 0.31) % 1;
          const dx = cx + (h1(b * 2.3 + i * 5) - 0.5) * W * 0.22;
          drops.push([dx, k]);
          const yy = base - H - 190 * u + k * 230 * u;
          if (k < 0.83) {
            ctx.save(); ctx.globalAlpha *= clamp(k * 6);
            ctx.translate(dx, yy); ctx.rotate(t * 3 + b);
            const s = (16 + 6 * h1(b + i)) * u;
            ctx.fillStyle = rgba([th.cream, th.gold, th.coral, th.teal][b]); ctx.fillRect(-s / 2, -s / 2, s, s);
            ctx.strokeStyle = rgba(th.grout, 0.9); ctx.lineWidth = 2 * u; ctx.strokeRect(-s / 2, -s / 2, s, s);
            ctx.restore();
          }
        }
        // Handles.
        for (const sgn of [-1, 1]) tileStroke(ctx, th, (g) => { g.beginPath(); g.moveTo(cx + sgn * W * 0.17, base - H * 0.92); g.bezierCurveTo(cx + sgn * W * 0.6, base - H * 0.96, cx + sgn * W * 0.66, base - H * 0.72, cx + sgn * W * 0.4, base - H * 0.68); }, body, 14 * u, t * 10);
        tess(ctx, th, path, shade(body, 0.7), { row: body, rw: 12, edge: th.cream, ew: 8, march: t * 8 * (hot ? 1 : -1), big: true });
        // Liquid: level grows with the value, the surface moves.
        const fill = (vals[i] / mx) * 0.88 * eo(seg(p, 0.22 + i * 0.12, 0.7 + i * 0.12));
        const ly = base - H * 0.05 - (H * 0.9) * fill;
        ctx.save(); path(ctx); ctx.clip();
        const wave = (x) => ly + Math.sin(x * 0.045 + t * 2.6 + i) * 8 * u + Math.sin(x * 0.02 - t * 1.7) * 5 * u;
        tess(ctx, th, (g) => { g.beginPath(); g.moveTo(cx - W, base + 4 * u); for (let x = cx - W; x <= cx + W; x += 12 * u) g.lineTo(x, wave(x)); g.lineTo(cx + W, base + 4 * u); g.closePath(); }, liquid, { row: mix(liquid, WHITE, 0.35), rw: 10, edge: null, march: -t * 30, big: true });
        tileStroke(ctx, th, (g) => { g.beginPath(); for (let x = cx - W; x <= cx + W; x += 12 * u) (x === cx - W ? g.moveTo(x, wave(x)) : g.lineTo(x, wave(x))); }, th.cream, 7 * u, -t * 36, false);
        if (fill > 0.05) for (const [dx, k] of drops) {
          const rp = (k + 0.08) % 1;
          if (rp > 0.45) continue;
          const e = rp / 0.45;
          ctx.save(); ctx.globalAlpha *= 1 - e;
          tileStroke(ctx, th, (g) => { g.beginPath(); g.ellipse(dx, wave(dx), (14 + 70 * e) * u, (5 + 16 * e) * u, 0, 0, TAU); }, th.gleam, 6 * u, 0, false);
          ctx.restore();
        }
        for (let b = 0; b < 6; b++) {
          const k = (t * 0.32 + b / 6 + i * 0.2) % 1;
          const bx = cx + (h1(b * 3.1 + i) - 0.5) * W * 0.5, by = base - 10 * u - (base - ly) * k;
          if (by > ly + 6 * u) tess(ctx, th, circPath(bx, by, (7 + 5 * h1(b)) * u), th.cream, { edge: th.grout, ew: 2.5, pat: 0.4 });
        }
        ctx.restore();
        tess(ctx, th, (g) => { g.beginPath(); g.rect(cx - W * 0.4, base + 2 * u, W * 0.8, 18 * u); }, th.creamShade, { row: th.cream, rw: 6, edge: th.grout, ew: 4, pat: 0.8 });
        void q;
      }, { a: 0.04, s: 0.12, d: 0.3, r: 220 });
      // Value on the vessel and the label above.
      const vstr = M.formatNumber(vals[i] * eo(seg(p, 0.24 + i * 0.12, 0.72 + i * 0.12)), 0, d.prefix, d.suffix);
      const vsize = Math.min(150 * u, (W * 0.84) / Math.max(1.5, vstr.length * 0.62));
      put(i * 2 + 1, cx, base - H * 0.5, () => {
        tablet(ctx, th, vstr, cx, base - H * 0.45 + Math.sin(t * 2 + i) * 5 * u, Math.max(vsize, 96 * u), { hf: 1.35, w: Math.min(W * 1.02, measure(ctx, th, vstr, Math.max(vsize, 96 * u)) + 60 * u), bg: hot ? th.cream : th.cream, ink: hot ? th.acc : th.ink });
      }, { a: 0.2, s: 0.12, d: 0.22, r: 100 });
      put(i * 2 + 0.5, cx, tall ? box.y + 50 * u : base - H - 54 * u, () => {
        tablet(ctx, th, labels[i] || "", cx, tall ? box.y + 50 * u : base - H - 54 * u, 42 * u, { w: Math.max(200 * u, measure(ctx, th, labels[i] || "", 42 * u) + 60 * u), bg: hot ? th.acc : th.cream, ink: hot ? th.cream : th.ink, row: hot ? mix(th.acc, WHITE, 0.3) : th.creamShade });
      }, { a: 0.12, s: 0.12, d: 0.22, r: 80 });
    }
    // The change between them, in a turning medallion.
    const mcx = box.x + box.w / 2, mcy = tall ? base + (box.y + box.h - base) * 0.5 + 6 * u : box.y + box.h * 0.5;
    const mr = tall ? 134 * u : 140 * u;
    const delta = d.leftValue ? Math.round(((d.rightValue - d.leftValue) / d.leftValue) * 100) : 0;
    put(5, mcx, mcy, () => {
      const pulse = 1 + Math.sin(t * 2.6) * 0.03;
      tess(ctx, th, circPath(mcx, mcy, mr * pulse), th.lapisDeep, { row: th.lapis, rw: 14, edge: th.cream, ew: 9, march: t * 16, big: true });
      tileStroke(ctx, th, circPath(mcx, mcy, mr * 0.82), th.gold, 8 * u, -t * 26, false);
      for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + t * 0.6; sparkle(ctx, th, mcx + Math.cos(a) * mr * 1.04, mcy + Math.sin(a) * mr * 1.04, 11 * u, 0.9, th.gleam); }
      const str = `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta)}%`;
      tileWord(ctx, th, str, mcx, mcy, 96 * u, { fill: delta < 0 ? th.gold : th.cream, fill2: th.cream, outline: true, glint: glintAt(th, mcx, 0.3) });
    }, { a: 0.5, s: 0, d: 0.3, r: 160 });
  }

  // ---- the look --------------------------------------------------------------------------------------
  return {
    bg: "#8a6418", panel: "#1f4090", ink: "#fbf1d4", muted: "rgba(251,241,212,0.78)", accent: "#ff7a3d", onAccent: "#2a1a0c",
    rule: "rgba(251,241,212,0.45)", track: "rgba(251,241,212,0.16)",
    display: "'Palatino Linotype', Palatino, 'Book Antiqua', 'Iowan Old Style', Georgia, serif", displayWeight: 700, displayCase: "none", displayTracking: "-0.01em",
    body: "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif", bodyWeight: 600,
    figures: "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif", radius: 22, motion: "wipe", change: "grid",
    kit: { line: 5, fill: "solid", panel: "fill" },
    mos: GOLD_MOS,
    palettes: {
      light: { bg: "#e6dcc4", mos: LIGHT_MOS, accent: "#e0502f" },
      dark: { bg: "#10173a", mos: DARK_MOS, accent: "#ffb23d", onAccent: "#10173a" },
      mono: { bg: "#555", mos: MONO_MOS, accent: "#f2f2f2", onAccent: "#222" },
    },
    textShadow: () => "0 2px 0 rgba(8,16,48,0.85), 0 0 14px rgba(8,16,48,0.6)",
    backdrop: (accent, texture = 1, look) => `${look && look.mos ? look.mos.ground[0] : "#c8962c"}`,
    // The HTML words only hold the layout: every headline is laid in stones on the canvas.
    css: () => `#title-scene .kicker { font-size: 70px !important; letter-spacing: 0.12em; line-height: 1.1; }
      #root .display, #root .kicker { color: transparent !important; text-shadow: none !important; }`,
    // A texture canvas exists only to tell the stage the backdrop is on; the wall itself is drawn by the stage.
    paint: (ctx, W, H) => { ctx.clearRect(0, 0, W, H); },
    keepArt: true,
    overlap: true,
    stage(ctx, S, info) {
      if (!S.paint) return;
      const th = theme(S);
      drawGround(ctx, S, th, info);
      dust(ctx, S, th, info.t);
      drawBorder(ctx, S, th, info.t);
    },
    scenes: { title: statementScene("title"), closing: statementScene("closing"), chart: wrap("chart", chartScene), object: wrap("object", objectScene), people: wrap("people", peopleScene), process: wrap("process", processScene), compare: wrap("compare", compareScene) },
  };
});
