// Bitmap Paint: the whole video is one low-resolution paint-program window ("Dabber"). Everything is
// rasterised by hand into a small software framebuffer (about 3 screen pixels per bit), so lines, discs,
// letters and dithered fills are hard-edged and aliased by construction, then scaled up without smoothing.
// The window chrome (title bar, menus, toolbox, palette, scroll bars, status line) is live; each scene is
// a different page in the document with its own scenery, tool cursor and animation; scene changes are
// paint-program operations (leaky flood fill, airbrush sweep, venetian blinds, select-all dissolve...).
// All drawings are original. Frames are pure functions of time: hashing only, no clocks and no unseeded randomness.
window.DreamcutMotion.register("bitmap-paint", () => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const smooth = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const FONT = "Verdana, 'DejaVu Sans', Geneva, sans-serif";
  const HEADF = "'Arial Black', 'Helvetica Neue', Verdana, sans-serif";
  const fmtNum = (v, d) => window.DreamcutMotion.formatNumber(v, 0, (d && d.prefix) || "", (d && d.suffix) || "");

  // Deterministic hash in [0,1).
  const hsh = (a, b = 0, c = 0) => {
    let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };

  // 8x8 ordered-dither thresholds.
  const BAY = (() => {
    const m = (n) => {
      if (n === 1) return [[0]];
      const h = m(n / 2), s = n / 2, r = [];
      for (let y = 0; y < n; y++) { r.push([]); for (let x = 0; x < n; x++) r[y][x] = h[y % s][x % s] * 4 + [[0, 2], [3, 1]][y < s ? 0 : 1][x < s ? 0 : 1]; }
      return r;
    };
    const a = m(8), o = new Float32Array(64);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) o[y * 8 + x] = (a[y][x] + 0.5) / 64;
    return o;
  })();

  // ---- colours -------------------------------------------------------------------------------------
  const PKC = {};
  const pk = (hex) => {
    if (PKC[hex] !== undefined) return PKC[hex];
    const n = parseInt(String(hex).slice(1, 7), 16) || 0;
    return (PKC[hex] = (0xff000000 | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0);
  };
  const hexOf = (n) => "#" + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v.toString(16).padStart(2, "0")).join("");
  const mixHex = (a, b, k) => {
    const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
    const ch = (s) => Math.round(lerp((x >> s) & 255, (y >> s) & 255, k));
    return hexOf((ch(16) << 16) | (ch(8) << 8) | ch(0));
  };
  const PACK = new WeakMap();
  const packPal = (P, accent) => {
    const key = P;
    let r = PACK.get(key);
    if (!r || r.__accent !== accent) {
      r = { __accent: accent };
      for (const k in P) if (typeof P[k] === "string" && P[k][0] === "#") r[k] = pk(P[k]);
      r.accent = pk(accent);
      r.__accent = accent;
      // Swatch ramp for the palette bar.
      const base = ["ink", "g3", "g2", "g1", "white", "red", "orange", "yellow", "lime", "green", "teal", "sky", "blue", "navy", "violet", "magenta", "brown", "peach"].map((k) => P[k]);
      base.push(accent, P.hillMid);
      const sw = [];
      for (let i = 0; i < 32; i++) sw.push(pk(i < 20 ? base[i] : mixHex(base[(i * 7) % 20], base[(i * 3 + 5) % 20], 0.5)));
      r.swatches = sw;
      PACK.set(key, r);
    }
    return r;
  };

  const ORIG = {
    ink: "#1b1630", white: "#fffdf5", page: "#f8f0dc", dot: "#e6d9ba", chrome: "#cdc7dc", hi: "#f6f3fb", lo: "#8a83a2", dk: "#2e2850",
    titleA: "#2b3db5", titleB: "#6b9bf2", titleText: "#ffffff",
    red: "#e63950", orange: "#ff8c1a", yellow: "#ffd426", lime: "#8bdc3c", green: "#1e9f5a", teal: "#16b3ad", sky: "#55c6ff", blue: "#2f5fe0",
    navy: "#1c2470", violet: "#8e44d6", magenta: "#ff4fae", brown: "#8c4f2b", peach: "#ffc8a2",
    g1: "#e4e0ee", g2: "#a29cb5", g3: "#5b5472",
    skyA: "#bfe6ff", skyB: "#ffe9cf", skyC: "#ffc6d8", hillFar: "#e2cdf2", hillMid: "#b88ad8", hillNear: "#35b08a", sea1: "#46b6f0", sea2: "#2f7fe0",
    panel: "#e8e4f2", desk: "#a85f33", ui: "#2e2850",
  };
  const LIGHT = {
    ...ORIG, ink: "#2a2548", page: "#fffdf9", dot: "#efe9db", chrome: "#eeeaf6", hi: "#ffffff", lo: "#aaa3c4", dk: "#4a4373", titleA: "#7a8cf0", titleB: "#c3cfff",
    red: "#f2667a", orange: "#ffa24d", yellow: "#ffe266", lime: "#a6e66a", green: "#46bf80", teal: "#4cd0c8", sky: "#86d6ff", blue: "#6a8ef0",
    navy: "#4452a8", violet: "#b07ae8", magenta: "#ff85c6", brown: "#b57a55", peach: "#ffd9bd", g1: "#f0edf7", g2: "#c1bcd3", g3: "#7a7394",
    skyA: "#d6f0ff", skyB: "#fff3e0", skyC: "#ffd9e6", hillFar: "#ece0f7", hillMid: "#cfb2e8", hillNear: "#6fcaa8", sea1: "#7ccbf5", sea2: "#5b9cee", panel: "#f4f1fa", desk: "#c98a5c", ui: "#4a4373",
  };
  const DARK = {
    ...ORIG, ink: "#f6f1ff", white: "#fbf6ff", page: "#1c1840", dot: "#2d2766", chrome: "#3b3566", hi: "#6a62a0", lo: "#221d46", dk: "#0d0a22", titleA: "#7a2fd0", titleB: "#ff4fae", titleText: "#ffffff",
    red: "#ff4d6a", orange: "#ff9a2e", yellow: "#ffe14a", lime: "#9cf04a", green: "#2fd17a", teal: "#28e0d0", sky: "#5ad2ff", blue: "#5b86ff",
    navy: "#12165a", violet: "#b06cff", magenta: "#ff5cc0", brown: "#b9774a", peach: "#ffbe96", g1: "#4a4380", g2: "#6e66a8", g3: "#a79fd8",
    skyA: "#1b1450", skyB: "#4a2a86", skyC: "#a63a86", hillFar: "#4c3a8e", hillMid: "#3a2c78", hillNear: "#1f8f72", sea1: "#2a2f8a", sea2: "#4a5de0", panel: "#2f2a58", desk: "#7a4526", ui: "#0d0a22",
  };
  const MONO = {
    ...ORIG, ink: "#000000", white: "#ffffff", page: "#ffffff", dot: "#d8d8d8", chrome: "#ffffff", hi: "#ffffff", lo: "#808080", dk: "#000000", titleA: "#000000", titleB: "#9a9a9a", titleText: "#ffffff",
    red: "#505050", orange: "#7a7a7a", yellow: "#f0f0f0", lime: "#c8c8c8", green: "#444444", teal: "#8a8a8a", sky: "#d0d0d0", blue: "#383838",
    navy: "#202020", violet: "#606060", magenta: "#767676", brown: "#4c4c4c", peach: "#e4e4e4", g1: "#e8e8e8", g2: "#a8a8a8", g3: "#585858",
    skyA: "#ffffff", skyB: "#e8e8e8", skyC: "#c8c8c8", hillFar: "#dcdcdc", hillMid: "#8c8c8c", hillNear: "#4c4c4c", sea1: "#b0b0b0", sea2: "#686868", panel: "#f4f4f4", desk: "#585858", ui: "#202020",
  };

  // ---- the software framebuffer ----------------------------------------------------------------------
  const GL = new Map();
  let scratch = null;
  function glyph(str, size, weight, font) {
    const key = font + "|" + weight + "|" + size + "|" + str;
    let e = GL.get(key);
    if (e) return e;
    if (!scratch) { scratch = document.createElement("canvas"); scratch.getContext("2d", { willReadFrequently: true }); }
    const sc = scratch.getContext("2d", { willReadFrequently: true });
    sc.font = `${weight} ${size}px ${font}`;
    const w = Math.ceil(sc.measureText(str).width) + 2, h = Math.ceil(size * 1.4), base = Math.ceil(size * 1.08);
    scratch.width = w; scratch.height = h;
    sc.font = `${weight} ${size}px ${font}`;
    sc.textBaseline = "alphabetic"; sc.fillStyle = "#000";
    sc.fillText(str, 1, base);
    const d = sc.getImageData(0, 0, w, h).data, m = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) m[i] = d[i * 4 + 3] > 105 ? 1 : 0;
    e = { w, h, m, base };
    GL.set(key, e);
    return e;
  }

  class FB {
    constructor(w, h) { this.w = w; this.h = h; this.buf = new Uint32Array(w * h); this.cx0 = 0; this.cy0 = 0; this.cx1 = w; this.cy1 = h; this.cv = null; }
    clear() { this.buf.fill(0); this.cx0 = 0; this.cy0 = 0; this.cx1 = this.w; this.cy1 = this.h; }
    setClip(x, y, w, h) { this.cx0 = Math.max(0, Math.round(x)); this.cy0 = Math.max(0, Math.round(y)); this.cx1 = Math.min(this.w, Math.round(x + w)); this.cy1 = Math.min(this.h, Math.round(y + h)); }
    clipGet() { return [this.cx0, this.cy0, this.cx1, this.cy1]; }
    clipSet(a) { [this.cx0, this.cy0, this.cx1, this.cy1] = a; }
    px(x, y, c, lv) {
      x = Math.round(x); y = Math.round(y);
      if (x < this.cx0 || x >= this.cx1 || y < this.cy0 || y >= this.cy1) return;
      if (lv !== undefined && BAY[((y & 7) << 3) | (x & 7)] >= lv) return;
      this.buf[y * this.w + x] = c;
    }
    spanH(y, x0, x1, c, lv) {
      if (y < this.cy0 || y >= this.cy1) return;
      const a = Math.max(this.cx0, x0), b = Math.min(this.cx1 - 1, x1);
      if (a > b) return;
      const row = y * this.w;
      if (lv === undefined) { for (let x = a; x <= b; x++) this.buf[row + x] = c; }
      else { const br = (y & 7) << 3; for (let x = a; x <= b; x++) if (BAY[br | (x & 7)] < lv) this.buf[row + x] = c; }
    }
    rect(x, y, w, h, c, lv) { x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h); for (let j = 0; j < h; j++) this.spanH(y + j, x, x + w - 1, c, lv); }
    frame(x, y, w, h, c, th = 1) { this.rect(x, y, w, th, c); this.rect(x, y + h - th, w, th, c); this.rect(x, y, th, h, c); this.rect(x + w - th, y, th, h, c); }
    bevel(x, y, w, h, face, hi, lo, sunk) {
      this.rect(x, y, w, h, face);
      this.rect(x, y, w, 1, sunk ? lo : hi); this.rect(x, y, 1, h, sunk ? lo : hi);
      this.rect(x, y + h - 1, w, 1, sunk ? hi : lo); this.rect(x + w - 1, y, 1, h, sunk ? hi : lo);
    }
    line(x0, y0, x1, y1, c, th = 1, q = 1, dash) {
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx - dy, x = x0, y = y0;
      const steps = Math.floor(Math.max(dx, dy) * q), o = -(th >> 1);
      for (let i = 0; i <= steps; i++) {
        if (!dash || ((i + dash[2]) % (dash[0] + dash[1]) + dash[0] + dash[1]) % (dash[0] + dash[1]) < dash[0]) {
          if (th === 1) this.px(x, y, c); else this.rect(x + o, y + o, th, th, c);
        }
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x += sx; }
        if (e2 < dx) { err += dx; y += sy; }
      }
    }
    path(pts, c, th = 1, q = 1) {
      let tot = 0; const L = [];
      for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); L.push(l); tot += l; }
      let left = tot * q;
      for (let i = 1; i < pts.length && left > 0; i++) {
        const k = Math.min(1, left / Math.max(0.0001, L[i - 1]));
        this.line(pts[i - 1][0], pts[i - 1][1], lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k), c, th);
        left -= L[i - 1];
      }
    }
    disc(cx, cy, r, c, lv) {
      cx = Math.round(cx); cy = Math.round(cy);
      const r2 = r * r + r * 0.6, n = Math.ceil(r);
      for (let dy = -n; dy <= n; dy++) { const v = r2 - dy * dy; if (v < 0) continue; const hx = Math.floor(Math.sqrt(v)); this.spanH(cy + dy, cx - hx, cx + hx, c, lv); }
    }
    ring(cx, cy, r, c, th = 1) {
      cx = Math.round(cx); cy = Math.round(cy);
      const R2 = r * r + r * 0.6, ri = r - th, r2 = ri > 0 ? ri * ri + ri * 0.6 : -1, n = Math.ceil(r);
      for (let dy = -n; dy <= n; dy++) {
        const v = R2 - dy * dy; if (v < 0) continue;
        const ho = Math.floor(Math.sqrt(v)), vi = r2 - dy * dy;
        if (vi < 0) this.spanH(cy + dy, cx - ho, cx + ho, c);
        else { const hi = Math.floor(Math.sqrt(vi)); this.spanH(cy + dy, cx - ho, cx - hi - 1, c); this.spanH(cy + dy, cx + hi + 1, cx + ho, c); }
      }
    }
    ell(cx, cy, rx, ry, c, lv) {
      cx = Math.round(cx); cy = Math.round(cy);
      const n = Math.ceil(ry);
      for (let dy = -n; dy <= n; dy++) { const k = 1 - (dy * dy) / ((ry + 0.5) * (ry + 0.5)); if (k < 0) continue; const hx = Math.floor(rx * Math.sqrt(k) + 0.5); this.spanH(cy + dy, cx - hx, cx + hx, c, lv); }
    }
    ellRing(cx, cy, rx, ry, c, th = 1) {
      cx = Math.round(cx); cy = Math.round(cy);
      const n = Math.ceil(ry);
      for (let dy = -n; dy <= n; dy++) {
        const k = 1 - (dy * dy) / ((ry + 0.5) * (ry + 0.5)); if (k < 0) continue;
        const ho = Math.floor(rx * Math.sqrt(k) + 0.5);
        const ky = 1 - (dy * dy) / Math.max(0.25, (ry - th + 0.5) * (ry - th + 0.5));
        if (ky < 0 || rx - th <= 0) this.spanH(cy + dy, cx - ho, cx + ho, c);
        else { const hi = Math.floor((rx - th) * Math.sqrt(ky) + 0.5); this.spanH(cy + dy, cx - ho, cx - hi - 1, c); this.spanH(cy + dy, cx + hi + 1, cx + ho, c); }
      }
    }
    poly(pts, c, lv) {
      let y0 = Infinity, y1 = -Infinity;
      for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
      const n = pts.length;
      for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
        const yy = y + 0.5, xs = [];
        for (let i = 0; i < n; i++) {
          const a = pts[i], b = pts[(i + 1) % n];
          if (a[1] === b[1]) continue;
          if (yy >= Math.min(a[1], b[1]) && yy < Math.max(a[1], b[1])) xs.push(a[0] + ((yy - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
        }
        xs.sort((p, q) => p - q);
        for (let i = 0; i + 1 < xs.length; i += 2) { const a = Math.round(xs[i]); this.spanH(y, a, Math.max(a, Math.round(xs[i + 1]) - 1), c, lv); }
      }
    }
    outline(pts, c, th = 1) { for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; this.line(a[0], a[1], b[0], b[1], c, th); } }
    dgrad(x, y, w, h, c1, c2, vert, l0, l1) {
      x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
      for (let j = 0; j < h; j++) {
        const yy = y + j; if (yy < this.cy0 || yy >= this.cy1) continue;
        for (let i = 0; i < w; i++) {
          const xx = x + i; if (xx < this.cx0 || xx >= this.cx1) continue;
          const k = vert ? (h > 1 ? j / (h - 1) : 0) : (w > 1 ? i / (w - 1) : 0);
          this.buf[yy * this.w + xx] = BAY[((yy & 7) << 3) | (xx & 7)] < l0 + (l1 - l0) * k ? c1 : c2;
        }
      }
    }
    spray(cx, cy, r, c, n, seed) {
      for (let i = 0; i < n; i++) {
        const a = hsh(i, seed, 11) * TAU, d = r * Math.pow(hsh(i, seed, 12), 1.5);
        this.px(cx + Math.cos(a) * d, cy + Math.sin(a) * d, c);
      }
    }
    sprite(rows, map, x, y, flip) {
      x = Math.round(x); y = Math.round(y);
      for (let j = 0; j < rows.length; j++) { const row = rows[j]; for (let i = 0; i < row.length; i++) { const ch = row[flip ? row.length - 1 - i : i]; const c = map[ch]; if (c) this.px(x + i, y + j, c); } }
    }
    textW(str, size, weight = 700) { return glyph(String(str ?? ""), Math.max(5, Math.round(size)), weight, FONT).w; }
    blit(gl, x0, y0, col) {
      for (let j = 0; j < gl.h; j++) {
        let i = 0;
        while (i < gl.w) {
          if (!gl.m[j * gl.w + i]) { i++; continue; }
          let k = i; while (k < gl.w && gl.m[j * gl.w + k]) k++;
          this.spanH(y0 + j, x0 + i, x0 + k - 1, col);
          i = k;
        }
      }
    }
    // y is the vertical centre of the line; align is "l", "c" or "r"; q reveals the first part of the string.
    text(str, x, y, size, col, o = {}) {
      str = String(str ?? "");
      if (!str) return 0;
      size = Math.max(5, Math.round(size));
      const wt = o.w || 700, gl = glyph(str, size, wt, FONT);
      let x0 = x;
      if (o.align === "c") x0 = x - Math.floor(gl.w / 2); else if (o.align === "r") x0 = x - gl.w;
      x0 = Math.round(x0);
      const y0 = Math.round(y - gl.base + size * 0.36);
      let sub = gl;
      if (o.q !== undefined && o.q < 1) { const n = Math.ceil(str.length * clamp(o.q)); if (n <= 0) return gl.w; sub = glyph(str.slice(0, n), size, wt, FONT); }
      if (o.sh !== undefined) this.blit(sub, x0 + 1, y0 + 1, o.sh);
      this.blit(sub, x0, y0, col);
      return gl.w;
    }
    present(ctx, px, onebit) {
      if (onebit) {
        const b = this.buf, bl = onebit[0], wh = onebit[1];
        for (let i = 0; i < b.length; i++) {
          const c = b[i]; if (!c) continue;
          const lum = ((c & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + ((c >> 16) & 255) * 0.11) / 255;
          const x = i % this.w, y = (i / this.w) | 0;
          b[i] = lum > BAY[((y & 7) << 3) | (x & 7)] * 0.92 + 0.04 ? wh : bl;
        }
      }
      if (!this.cv) {
        this.cv = document.createElement("canvas"); this.cv.width = this.w; this.cv.height = this.h;
        this.cx = this.cv.getContext("2d"); this.img = new ImageData(new Uint8ClampedArray(this.buf.buffer), this.w, this.h);
      }
      this.cx.putImageData(this.img, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.cv, 0, 0, this.w, this.h, 0, 0, this.w * px, this.h * px);
    }
  }

  // ---- per-render memo: buffers, layout, measured headlines ------------------------------------------
  const MEMO = new WeakMap();
  function memo(S) {
    let C = MEMO.get(S);
    if (C) return C;
    const px = Math.max(2, Math.round(3 * S.u));
    const w = Math.ceil(S.W / px), h = Math.ceil(S.H / px), tall = S.tall;
    const L = { w, h, tall, px, title: { x: 2, y: 2, w: w - 4, h: 14 }, menu: { x: 2, y: 16, w: w - 4, h: 11 } };
    if (!tall) {
      L.tools = { x: 3, y: 28, w: 22, h: h - 38 - 28 };
      L.view = { x: 26, y: 28, w: w - 26 - 12, h: h - 38 - 28 };
      L.vscroll = { x: w - 12, y: 28, w: 9, h: L.view.h };
      L.hscroll = { x: 26, y: h - 38, w: L.view.w, h: 8 };
    } else {
      L.tools = { x: 3, y: 28, w: w - 6, h: 18 };
      L.view = { x: 3, y: 47, w: w - 3 - 12, h: h - 38 - 47 };
      L.vscroll = { x: w - 12, y: 47, w: 9, h: L.view.h };
      L.hscroll = { x: 3, y: h - 38, w: L.view.w, h: 8 };
    }
    L.pal = { x: 3, y: h - 30, w: w - 6, h: 16 };
    L.status = { x: 3, y: h - 13, w: w - 6, h: 10 };
    C = { px, w, h, L, stage: new FB(w, h), layer: new FB(w, h), heads: {} };
    MEMO.set(S, C);
    return C;
  }
  function headBox(C, S, id) {
    if (C.heads[id]) return C.heads[id];
    let r = { x: (S.tall ? 90 : 140) * S.u, y: (S.tall ? 170 : 96) * S.u, w: 900 * S.u, h: 80 * S.u };
    try {
      const el = document.getElementById(id);
      if (el) {
        const sc = el.parentElement, cs = getComputedStyle(sc), range = document.createRange();
        range.selectNodeContents(el);
        const rc = range.getBoundingClientRect();
        r = { x: parseFloat(cs.paddingLeft) || r.x, y: sc.offsetTop + el.offsetTop, w: Math.min(rc.width || r.w, S.W), h: el.offsetHeight || r.h };
      }
    } catch (e) { /* keep the estimate */ }
    C.heads[id] = r;
    return r;
  }

  // ---- little pieces of scenery ----------------------------------------------------------------------
  function twinkle(g, x, y, ph, col) {
    const f = Math.floor(ph * 4) & 3, a = [0, 1, 2, 1][f];
    g.px(x, y, col);
    for (let i = 1; i <= a; i++) { g.px(x + i, y, col); g.px(x - i, y, col); g.px(x, y + i, col); g.px(x, y - i, col); }
    if (f === 2) { g.px(x + 1, y + 1, col); g.px(x - 1, y - 1, col); g.px(x + 1, y - 1, col); g.px(x - 1, y + 1, col); }
  }
  function sparkle(g, x, y, s, col, ink) {
    const pts = [[0, -s], [s * 0.26, -s * 0.26], [s, 0], [s * 0.26, s * 0.26], [0, s], [-s * 0.26, s * 0.26], [-s, 0], [-s * 0.26, -s * 0.26]].map(([a, b]) => [x + a, y + b]);
    if (ink !== undefined) g.outline(pts, ink);
    g.poly(pts, col);
  }
  function cloud(g, x, y, s, col, sh) {
    g.ell(x, y + 4 * s, 13 * s, 3.5 * s, sh);
    g.ell(x, y + 2 * s, 13 * s, 4.5 * s, col);
    g.disc(x - 6 * s, y, 5 * s, col); g.disc(x + 1 * s, y - 3 * s, 7 * s, col); g.disc(x + 8 * s, y, 5 * s, col);
  }
  function sunburst(g, cx, cy, r0, r1, n, a0, col, lv) {
    const hw = (TAU / n) * 0.24;
    for (let k = 0; k < n; k++) {
      const a = a0 + (k * TAU) / n;
      g.poly([[cx + Math.cos(a - hw) * r0, cy + Math.sin(a - hw) * r0], [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1], [cx + Math.cos(a + hw) * r0, cy + Math.sin(a + hw) * r0]], col, lv);
    }
  }
  const wander = (t, pts, seg = 1.35, ph = 0) => {
    const f = t / seg + ph, i = Math.floor(f), k = f - i, n = pts.length;
    const a = pts[((i % n) + n) % n], b = pts[(((i + 1) % n) + n) % n], e = smooth(k * 1.35);
    return { x: lerp(a[0], b[0], e), y: lerp(a[1], b[1], e), click: k > 0.8 && k < 0.92, k };
  };
  const ARROW = [
    "X", "XX", "X.X", "X..X", "X...X", "X....X", "X.....X", "X......X", "X.......X", "X........X", "X.....XXXXX", "X..X..X", "X.X X..X", "XX  X..X", "X    X..X", "     X..X", "      XX",
  ];
  const BUCKET = [
    ".....XXXXX....", "....X.....X...", "...X.......X..", "..XXXXXXXXXXX.", ".XwwwwwwwwwwwX", "XbbbbbbbbbbbbX", "XbbwbbbbbbbbbX", "XbbwbbbbbbbbbX", ".XbbbbbbbbbbX.", ".XbbbbbbbbbbX.", "..XbbbbbbbbX..", "...XXXXXXXX...",
  ];
  function cursor(X, kind, x, y, extra = {}) {
    const { g, c } = X;
    x = Math.round(x); y = Math.round(y);
    if (extra.click) { g.ring(x, y, 4 + Math.round(extra.k * 12 % 8), c.accent, 1); }
    if (kind === "bucket") {
      g.sprite(BUCKET, { X: c.ink, w: c.white, b: extra.color || c.blue }, x - 7, y - 14);
      const drip = Math.floor(X.t * 6) & 1;
      g.rect(x + 5, y - 3, 2, 6 + drip, extra.color || c.accent);
      g.px(x + 5, y + 4 + drip, extra.color || c.accent);
    } else if (kind === "spray") {
      g.rect(x - 3, y - 4, 7, 11, c.ink); g.rect(x - 2, y - 3, 5, 9, c.g2); g.rect(x - 2, y - 3, 1, 9, c.white);
      g.rect(x - 2, y - 7, 5, 3, c.ink); g.rect(x - 1, y - 6, 3, 1, c.red); g.rect(x - 1, y - 8, 1, 1, c.ink);
      g.spray(x - 6, y - 8, 7, extra.color || c.accent, 14, Math.floor(X.t * 12));
    } else if (kind === "pencil") {
      g.line(x, y, x + 10, y - 10, c.ink, 5); g.line(x + 1, y - 1, x + 10, y - 10, c.yellow, 3); g.px(x, y, c.ink); g.px(x + 1, y, c.ink); g.px(x, y - 1, c.ink);
      g.line(x + 9, y - 9, x + 11, y - 11, c.red, 3);
    } else if (kind === "cross") {
      g.rect(x - 4, y, 9, 1, c.ink); g.rect(x, y - 4, 1, 9, c.ink); g.px(x, y, c.white);
    } else {
      g.sprite(ARROW, { X: c.ink, ".": c.white }, x, y);
    }
  }

  function winFrame(X, r, title, body) {
    const { g, c } = X;
    g.rect(r.x + 2, r.y + 2, r.w, r.h, c.ink, 0.55);
    g.rect(r.x, r.y, r.w, r.h, c.ink);
    g.rect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, body === undefined ? c.white : body);
    g.dgrad(r.x + 1, r.y + 1, r.w - 2, 10, c.titleB, c.titleA, false, 0.05, 1);
    g.rect(r.x + 1, r.y + 11, r.w - 2, 1, c.ink);
    g.text(title, r.x + 5, r.y + 6, 8, c.titleText, { sh: c.ink });
    g.rect(r.x + r.w - 11, r.y + 2, 8, 8, c.chrome); g.frame(r.x + r.w - 11, r.y + 2, 8, 8, c.ink);
    g.line(r.x + r.w - 9, r.y + 4, r.x + r.w - 6, r.y + 7, c.ink); g.line(r.x + r.w - 6, r.y + 4, r.x + r.w - 9, r.y + 7, c.ink);
    return { x: r.x + 1, y: r.y + 12, w: r.w - 2, h: r.h - 13 };
  }
  const stagger = (p, i, n, spreadv = 0.55) => ease(((p * 0.8 + 0.28) - (i / Math.max(1, n)) * spreadv) / (1 - spreadv));

  // ---- window chrome ---------------------------------------------------------------------------------
  const FILES = { title: "landscape.bmp", chart: "bars.bmp", object: "device.bmp", people: "crew.bmp", process: "steps.bmp", compare: "versus.bmp", closing: "saved.bmp" };
  const TOOLNAME = ["Select", "Pencil", "Brush", "Bucket", "Airbrush", "Eraser", "Line", "Box", "Oval", "Text", "Picker", "Zoom"];
  const TOOLFOR = { title: 4, chart: 3, object: 0, people: 2, process: 6, compare: 8, closing: 9 };
  const SWFOR = { title: 7, chart: 18, object: 11, people: 5, process: 8, compare: 15, closing: 7 };
  function toolIcon(g, c, k, cx, cy) {
    const ink = c.ink;
    switch (k) {
      case 0: g.frame(cx - 5, cy - 4, 11, 9, ink); for (let i = -4; i < 6; i += 4) { g.px(cx + i, cy - 4, c.chrome); g.px(cx - 5, cy + i - 1, c.chrome); } break;
      case 1: g.line(cx - 4, cy + 4, cx + 4, cy - 4, ink, 2); g.px(cx - 5, cy + 5, ink); g.px(cx + 4, cy - 4, c.yellow); break;
      case 2: g.line(cx - 1, cy + 1, cx + 5, cy - 5, ink, 2); g.ell(cx - 3, cy + 3, 3, 2, c.accent); g.ellRing(cx - 3, cy + 3, 3, 2, ink); break;
      case 3: g.sprite(["..XXX..", ".X...X.", "XXXXXXX", "XwwwwwX", "XbbbbbX", ".XbbbX.", "..XXX.."], { X: ink, w: c.white, b: c.blue }, cx - 3, cy - 3); break;
      case 4: g.rect(cx - 1, cy - 1, 4, 6, ink); g.rect(cx - 1, cy - 3, 3, 2, ink); for (const [a, b] of [[-4, -3], [-5, 0], [-3, -5], [-6, -2], [-4, 1]]) g.px(cx + a, cy + b, c.accent); break;
      case 5: g.poly([[cx - 5, cy + 1], [cx, cy - 4], [cx + 5, cy + 1], [cx, cy + 5]], c.peach); g.outline([[cx - 5, cy + 1], [cx, cy - 4], [cx + 5, cy + 1], [cx, cy + 5]], ink); break;
      case 6: g.line(cx - 5, cy + 4, cx + 5, cy - 4, ink, 1); g.px(cx - 5, cy + 5, ink); g.px(cx + 5, cy - 5, ink); break;
      case 7: g.frame(cx - 5, cy - 3, 11, 7, ink, 1); break;
      case 8: g.ellRing(cx, cy, 5, 4, ink, 1); break;
      case 9: g.text("A", cx, cy, 12, ink, { align: "c" }); break;
      case 10: g.line(cx - 4, cy + 4, cx + 1, cy - 1, ink, 1); g.disc(cx + 3, cy - 3, 2, ink); g.px(cx + 3, cy - 3, c.white); break;
      default: g.ring(cx - 1, cy - 1, 3, ink, 1); g.line(cx + 1, cy + 1, cx + 5, cy + 5, ink, 2);
    }
  }
  function drawChrome(X, scene) {
    const { g, c, L, t } = X;
    g.rect(0, 0, L.w, L.h, c.chrome);
    g.rect(0, 0, L.w, 1, c.hi); g.rect(0, 0, 1, L.h, c.hi); g.rect(0, L.h - 1, L.w, 1, c.dk); g.rect(L.w - 1, 0, 1, L.h, c.dk);
    // Title bar with a shine that sweeps across.
    const tb = L.title;
    g.dgrad(tb.x, tb.y, tb.w, tb.h, c.titleB, c.titleA, false, 0.05, 1);
    const sx = tb.x + ((t * 26) % (tb.w + 60)) - 30;
    for (let k = 0; k < 3; k++) for (let j = 0; j < tb.h; j++) g.px(sx + k * 3 - j * 0.6, tb.y + j, c.white, 0.5);
    g.sprite(["XXXXXXXXX", "XrrybbggX", "XrrybbggX", "XvvooppvX", "XXXXXXXXX"].map((r) => r), { X: c.ink, r: c.red, y: c.yellow, b: c.sky, g: c.lime, v: c.violet, o: c.orange, p: c.magenta }, tb.x + 3, tb.y + 4);
    g.text("DABBER 1.0  -  " + (FILES[scene] || "untitled.bmp") + (Math.floor(t * 0.7) % 2 ? " *" : ""), tb.x + 16, tb.y + 8, 9, c.titleText, { sh: c.ink });
    for (let i = 0; i < 3; i++) {
      const bx = tb.x + tb.w - 12 * (3 - i) - 1;
      g.bevel(bx, tb.y + 2, 11, 10, c.chrome, c.hi, c.dk);
      if (i === 0) g.rect(bx + 3, bx * 0 + tb.y + 8, 5, 2, c.ink);
      if (i === 1) g.frame(bx + 2, tb.y + 4, 7, 6, c.ink, 1);
      if (i === 2) { g.line(bx + 3, tb.y + 4, bx + 7, tb.y + 9, c.ink); g.line(bx + 7, tb.y + 4, bx + 3, tb.y + 9, c.ink); }
    }
    // Menu bar.
    const mn = L.menu, items = ["File", "Edit", "View", "Image", "Colors", "Help"], hov = Math.floor(t / 1.3) % items.length;
    let mx = mn.x + 5;
    items.forEach((s, i) => {
      const w = g.textW(s, 8, 600);
      if (i === hov) g.rect(mx - 3, mn.y + 1, w + 6, mn.h - 2, c.dk);
      g.text(s, mx, mn.y + 6, 8, i === hov ? c.white : c.ink, { w: 600 });
      mx += w + 12;
    });
    g.rect(mn.x, mn.y + mn.h - 1, mn.w, 1, c.lo);
    // Toolbox.
    const active = TOOLFOR[scene] ?? 1, tl = L.tools;
    for (let i = 0; i < 12; i++) {
      let bx, by, bw = 20, bh = 16;
      if (!L.tall) { bx = tl.x + 1; by = tl.y + 1 + i * 17; } else { bw = Math.floor((tl.w - 2) / 12); bh = 16; bx = tl.x + 1 + i * bw; by = tl.y + 1; bw -= 1; }
      const on = i === active;
      g.bevel(bx, by, bw, bh, on ? c.page : c.chrome, c.hi, c.lo, on);
      toolIcon(g, c, i, bx + (bw >> 1) + (on ? 1 : 0), by + (bh >> 1) + (on ? 1 : 0));
    }
    if (!L.tall) {
      const oy = tl.y + 1 + 12 * 17 + 4;
      g.bevel(tl.x + 1, oy, 20, 60, c.white, c.hi, c.lo, true);
      const sel = Math.floor(t * 1.2) % 6;
      for (let k = 0; k < 6; k++) {
        const cx = tl.x + 6 + (k % 2) * 10, cy = oy + 7 + Math.floor(k / 2) * 18;
        if (k === sel) g.rect(cx - 4, cy - 6, 9, 14, c.dk, 0.4);
        g.disc(cx, cy, 1 + (k >> 1) + (k % 2 ? 0 : 0), c.ink);
      }
    }
    // Palette bar.
    const pb = L.pal;
    const fgI = SWFOR[scene] ?? 7;
    g.rect(pb.x + 1, pb.y + 3, 10, 9, c.white); g.frame(pb.x + 1, pb.y + 3, 10, 9, c.ink);
    g.rect(pb.x + 5, pb.y + 6, 10, 9, c.swatches[fgI]); g.frame(pb.x + 5, pb.y + 6, 10, 9, c.ink);
    const cols = clamp(Math.floor((pb.w - 20 - (L.tall ? 6 : 170)) / 10), 12, 32);
    for (let k = 0; k < cols * 2; k++) {
      const col = k % cols, row = Math.floor(k / cols), sx2 = pb.x + 19 + col * 10, sy2 = pb.y + 1 + row * 8;
      const sc = c.swatches[(col + row * 3) % 32];
      g.rect(sx2, sy2, 9, 7, sc); g.frame(sx2, sy2, 9, 7, c.lo);
      if (row === 0 && col === fgI % cols && Math.floor(t * 3) % 2) g.frame(sx2 - 1, sy2 - 1, 11, 9, c.ink);
    }
    if (!L.tall) {
      const bx = pb.x + 19 + cols * 10 + 8, bw = pb.w - (bx - pb.x) - 28;
      g.bevel(bx, pb.y + 1, bw, 14, c.white, c.hi, c.lo, true);
      for (let i = 0; i < bw - 2; i++) { const col = c.swatches[5 + Math.floor((i * 0.5 + t * 14) % 14)]; g.rect(bx + 1 + i, pb.y + 2, 1, 12, col); }
      for (let i = 0; i < 3; i++) { const on = hsh(Math.floor(t * 4), i, 5) > 0.45; g.rect(pb.x + pb.w - 20 + i * 6, pb.y + 6, 4, 4, on ? c.lime : c.g3); g.frame(pb.x + pb.w - 20 + i * 6, pb.y + 6, 4, 4, c.ink); }
    }
    // Status line.
    const st = L.status, nx = Math.round(180 + 160 * Math.sin(t * 0.9) + 40 * Math.sin(t * 2.3)), ny = Math.round(120 + 90 * Math.sin(t * 0.7 + 1) + 20 * Math.sin(t * 3.1));
    g.bevel(st.x, st.y, 78, st.h, c.chrome, c.hi, c.lo, true); g.text(TOOLNAME[active], st.x + 4, st.y + 6, 8, c.ink, { w: 600 });
    g.bevel(st.x + 80, st.y, 100, st.h, c.chrome, c.hi, c.lo, true); g.text("x " + String(nx).padStart(3, "0") + "  y " + String(ny).padStart(3, "0"), st.x + 84, st.y + 6, 8, c.ink, { w: 600 });
    g.bevel(st.x + 182, st.y, st.w - 182, st.h, c.chrome, c.hi, c.lo, true);
    const seg = Math.floor((st.w - 196) / 4);
    for (let i = 0; i < 12 && 12 * 5 < st.w - 190; i++) g.rect(st.x + 188 + i * 5, st.y + 3, 4, 4, ((i + Math.floor(t * 6)) % 12) < 5 ? c.accent : c.g2);
    void seg;
    // Scroll bars.
    const vs = L.vscroll, hs = L.hscroll;
    g.dgrad(vs.x, vs.y, vs.w, vs.h, c.white, c.g1, true, 0.5, 0.5);
    g.bevel(vs.x, vs.y, vs.w, 9, c.chrome, c.hi, c.lo); g.bevel(vs.x, vs.y + vs.h - 9, vs.w, 9, c.chrome, c.hi, c.lo);
    g.poly([[vs.x + 4, vs.y + 3], [vs.x + 7, vs.y + 6], [vs.x + 2, vs.y + 6]], c.ink); g.poly([[vs.x + 4, vs.y + vs.h - 3], [vs.x + 7, vs.y + vs.h - 6], [vs.x + 2, vs.y + vs.h - 6]], c.ink);
    const ty = vs.y + 9 + Math.round((0.5 + 0.5 * Math.sin(t * 0.45)) * (vs.h - 18 - 40));
    g.bevel(vs.x, ty, vs.w, 40, c.chrome, c.hi, c.lo);
    g.dgrad(hs.x, hs.y, hs.w, hs.h, c.white, c.g1, true, 0.5, 0.5);
    g.bevel(hs.x, hs.y, 9, hs.h, c.chrome, c.hi, c.lo); g.bevel(hs.x + hs.w - 9, hs.y, 9, hs.h, c.chrome, c.hi, c.lo);
    const tx = hs.x + 9 + Math.round((0.5 + 0.5 * Math.sin(t * 0.33 + 2)) * (hs.w - 18 - 90));
    g.bevel(tx, hs.y, 90, hs.h, c.chrome, c.hi, c.lo);
    g.bevel(vs.x, hs.y, 9, hs.h, c.chrome, c.hi, c.lo);
  }

  // ---- shared page parts ------------------------------------------------------------------------------
  function pageBase(X) {
    const { g, c, L, t, T } = X, V = L.view;
    g.setClip(V.x, V.y, V.w, V.h);
    g.rect(V.x, V.y, V.w, V.h, c.page);
    // Paper grain and a pixel grid that drifts slowly diagonally (secondary motion under every scene).
    const off = Math.floor(t * 4);
    for (let y = V.y - 8; y < V.y + V.h + 8; y += 8) for (let x = V.x - 8; x < V.x + V.w + 8; x += 8) {
      const gx = x + (off % 8), gy = y + (off % 8);
      g.px(gx, gy, c.dot); if (((x + y) >> 3) % 3 === 0) { g.px(gx + 1, gy, c.dot); g.px(gx, gy + 1, c.dot); g.px(gx - 1, gy, c.dot); g.px(gx, gy - 1, c.dot); }
    }
    const n = Math.round(60 * (0.3 + 0.7 * T));
    for (let i = 0; i < n; i++) g.px(V.x + hsh(i, 1, 3) * V.w, V.y + hsh(i, 2, 3) * V.h, c.dot);
  }
  // Marching ants and handles around the headline: it reads as a selected text object.
  function headFrame(X, hb) {
    const { g, c, t, L } = X, px = L.px;
    const x0 = Math.round((hb.x - 12) / px), y0 = Math.round((hb.y - 10) / px), x1 = Math.round((hb.x + hb.w + 18) / px), y1 = Math.round((hb.y + hb.h + 8) / px);
    const ph = Math.floor(t * 8);
    for (const [a, b, cc, d] of [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]]) { g.line(a, b, cc, d, c.white, 1); g.line(a, b, cc, d, c.ink, 1, 1, [3, 3, ph]); }
    for (const [hx, hy] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [(x0 + x1) >> 1, y0], [(x0 + x1) >> 1, y1], [x0, (y0 + y1) >> 1], [x1, (y0 + y1) >> 1]]) { g.rect(hx - 2, hy - 2, 5, 5, c.white); g.frame(hx - 2, hy - 2, 5, 5, c.ink); }
    return y1;
  }
  // Doodles in the margins beside the art.
  function margins(X, A) {
    const { g, c, t, L, T } = X, V = L.view;
    const cols = [c.accent, c.yellow, c.sky, c.lime, c.orange, c.violet, c.magenta, c.teal];
    const strips = [[V.x + 2, A.x - 3], [A.x + A.w + 3, V.x + V.w - 2]];
    strips.forEach(([xa, xb], s) => {
      const w = xb - xa; if (w < 6) return;
      const n = Math.round((L.tall ? 16 : 14) * (0.4 + 0.6 * T));
      for (let i = 0; i < n; i++) {
        const x = xa + 2 + hsh(i, s, 21) * (w - 4), y = V.y + 6 + hsh(i, s, 22) * (V.h - 12), kind = Math.floor(hsh(i, s, 23) * 4), col = cols[Math.floor(hsh(i, s, 24) * cols.length)];
        const ph = t * (0.8 + hsh(i, s, 25)) + hsh(i, s, 26) * 4;
        if (kind === 0) twinkle(g, x, y, ph, col);
        else if (kind === 1) { const r = 2 + Math.round(1 + Math.sin(ph * 2)); g.ring(x, y + Math.round(Math.sin(ph) * 2), r, col, 1); }
        else if (kind === 2) { const y2 = y + Math.round(Math.sin(ph * 1.5) * 3); g.poly([[x, y2 - 3], [x + 3, y2 + 2], [x - 3, y2 + 2]], col); g.outline([[x, y2 - 3], [x + 3, y2 + 2], [x - 3, y2 + 2]], c.ink); }
        else { const sx2 = x + Math.round(Math.sin(ph) * 2); g.path([[sx2 - 3, y - 2], [sx2 - 1, y + 1], [sx2 + 1, y - 2], [sx2 + 3, y + 1]], col, 1); }
      }
    });
  }
  function artRect(X, hb) {
    const { L, S } = X, px = L.px;
    const xs = Math.round((S.tall ? 90 : 140) * S.u / px), V = L.view;
    const y0 = Math.max(V.y + 10, Math.ceil((hb.y + hb.h) / px) + 9);
    return { x: xs, y: y0, w: L.w - xs * 2, h: V.y + V.h - 4 - y0 };
  }

  // ---- transitions: paint-program operations ---------------------------------------------------------
  const trKind = (T0) => Math.floor(hsh(Math.round(T0 * 50), 3, 9) * 6) % 6;
  function maskFn(kind, V, tr, T0) {
    const vx = V.x, vy = V.y, vw = V.w, vh = V.h, k0 = hsh(Math.round(T0 * 50), 5, 1);
    if (kind === 0) return (x, y) => BAY[((y & 7) << 3) | (x & 7)] < tr * 1.02 ? 1 : 0;
    if (kind === 1) {
      const ox = vx + vw * (0.2 + 0.6 * k0), oy = vy + vh * 0.28, far = Math.hypot(Math.max(ox - vx, vx + vw - ox), Math.max(oy - vy, vy + vh - oy)), k = k0 * 6;
      return (x, y) => {
        const dx = x - ox, dy = y - oy, th = Math.atan2(dy, dx);
        const R = tr * far * 2.2 * (0.5 + 0.1 * Math.sin(3 * th + k) + 0.07 * Math.sin(5 * th + 2 * k) + 0.04 * Math.sin(11 * th)) * (1 + 0.45 * Math.max(0, Math.sin(th)));
        const d = Math.hypot(dx, dy);
        return d < R ? (d > R - 2 ? 2 : 1) : 0;
      };
    }
    if (kind === 2) return (x, y) => {
      const col = Math.floor((x - vx) / 6), t2 = clamp((tr - hsh(col, 1, 2) * 0.35) / 0.65), lim = vh * t2;
      const d = y - vy; return d < lim ? (d > lim - 2 ? 2 : 1) : 0;
    };
    if (kind === 3) {
      const cx = vx + vw / 2, cy = vy + vh / 2, R = (Math.max(vw, vh) * 0.72) * tr;
      return (x, y) => { const dx = Math.abs(x - cx), dy = Math.abs(y - cy), d = Math.max(dx, dy * 1.1, (dx + dy * 1.1) * 0.72); return d < R ? (d > R - 2 ? 2 : 1) : 0; };
    }
    if (kind === 4) {
      const xf = vx + (vw + 26) * tr;
      return (x, y) => (x < xf - 26 * hsh(x, y, 3) ? 1 : 0);
    }
    const f = (vw + 0.6 * vh + 18) * tr;
    return (x, y) => { const s = x - vx + (y - vy) * 0.6, lim = f - (y % 6 < 3 ? 0 : 8); return s < lim ? (s > lim - 2 ? 2 : 1) : 0; };
  }
  function transDecor(X, kind, tr, pre, T0) {
    const { g, c, L, t } = X, V = L.view;
    g.setClip(V.x, V.y, V.w, V.h);
    const k0 = hsh(Math.round(T0 * 50), 5, 1);
    if (kind === 1) {
      const ox = V.x + V.w * (0.2 + 0.6 * k0), oy = V.y + V.h * 0.28;
      const e = pre === null ? 1 : ease(pre);
      const bx = lerp(ox - 90, ox, e), by = lerp(oy - 60, oy - 4, e);
      if (pre === null) { const w2 = Math.max(1, Math.round(4 * (1 - tr))); g.rect(ox + 5, by + 2, w2, oy - by + 4, c.accent); g.ring(ox, oy + 2, 3 + Math.round(tr * 8), c.accent, 2); }
      cursor(X, "bucket", bx, by + 4, { color: c.accent });
    } else if (kind === 4) {
      const xf = V.x + (V.w + 26) * (pre === null ? tr : 0);
      const yy = V.y + V.h * (0.5 + 0.34 * Math.sin((pre === null ? tr : 0) * 14));
      const x = pre === null ? xf : lerp(V.x - 30, V.x + 6, ease(pre));
      g.spray(x - 10, yy, 22, c.accent, 70, Math.floor(t * 14));
      cursor(X, "spray", x, yy, { color: c.accent });
    } else if (kind === 5) {
      const f = (V.w + 0.6 * V.h + 18) * (pre === null ? tr : 0), y = V.y + V.h * 0.5;
      const x = pre === null ? V.x + f - (y - V.y) * 0.6 : lerp(V.x - 20, V.x + 6, ease(pre));
      cursor(X, "pencil", x, y);
    } else if (pre !== null || (tr > 0 && tr < 1)) {
      const ph = Math.floor(t * 10), x0 = V.x + 2, y0 = V.y + 2, x1 = V.x + V.w - 3, y1 = V.y + V.h - 3;
      if (pre === null || Math.floor(pre * 10) % 2 === 0) {
        for (const [a, b, cc, d] of [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]]) { g.line(a, b, cc, d, c.white, 1); g.line(a, b, cc, d, c.ink, 1, 1, [3, 3, ph]); }
        for (const [hx, hy] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) { g.rect(hx - 2, hy - 2, 5, 5, c.white); g.frame(hx - 2, hy - 2, 5, 5, c.ink); }
      }
    }
  }
  function applyMask(X, fn, mode) {
    const { g, L, c } = X, V = L.view, buf = g.buf, w = g.w;
    for (let y = V.y; y < V.y + V.h; y++) {
      const row = y * w;
      for (let x = V.x; x < V.x + V.w; x++) {
        const i = row + x; if (!buf[i]) continue;
        const m = fn(x, y);
        if (mode === "in") { if (!m) buf[i] = 0; else if (m === 2) buf[i] = c.accent; } else if (m) buf[i] = 0;
      }
    }
  }

  // ---- scene context ------------------------------------------------------------------------------------
  function frameOf(S, ctx, p, d, info, id) {
    const C = memo(S), P = S.look.pal, c = packPal(P, S.accent), L = C.L;
    const exit = info.exit !== undefined;
    const T0 = exit ? info.t - (info.local - info.hold) : info.t - info.local;
    const first = !exit && T0 < 0.001;
    const hb = headBox(C, S, id + "-title");
    const X = { S, ctx, C, g: C.layer, P, c, L, p, d, t: info.t, local: info.local, hold: info.hold, change: info.change, u: S.u, tall: S.tall, T: S.look.texture, id, hb, T0, px: C.px, onebit: S.look.onebit ? [pk(P.ink), pk(P.white)] : null };
    X.A = artRect(X, hb);
    X.mode = exit ? "out" : !first && info.local < info.change ? "in" : null;
    X.tr = exit ? smooth(info.exit) : X.mode === "in" ? smooth(info.local / Math.max(0.01, info.change)) : 0;
    X.pre = !exit && info.local > info.hold - info.change ? clamp((info.local - (info.hold - info.change)) / Math.max(0.01, info.change)) : null;
    X.preT0 = info.t + (info.hold - info.local);
    return X;
  }
  function sceneOf(id, draw) {
    return (ctx, S, box, p, d, info) => {
      const X = frameOf(S, ctx, p, d, info, id);
      const { g, L } = X;
      g.clear();
      if (!S.paint) { g.setClip(0, 0, g.w, g.h); } else { pageBase(X); }
      margins(X, X.A);
      if (S.paint) headFrame(X, X.hb);
      draw(X);
      g.setClip(L.view.x, L.view.y, L.view.w, L.view.h);
      if (X.mode) {
        const T0 = X.T0, kind = trKind(T0);
        applyMask(X, maskFn(kind, L.view, X.tr, T0), X.mode);
        transDecor(X, kind, X.tr, null, T0);
      } else if (X.pre !== null) transDecor(X, trKind(X.preT0), 0, X.pre, X.preT0);
      g.clipSet([0, 0, g.w, g.h]);
      g.present(ctx, X.px, X.onebit);
    };
  }

  // ---- chart ----------------------------------------------------------------------------------------------
  function trophy(g, c, cx, by, s, t) {
    const P = (pts) => pts.map(([x, y]) => [cx + x * s, by + y * s]);
    g.ring(cx - 11 * s, by - 24 * s, 5 * s, c.ink, 2); g.ring(cx + 11 * s, by - 24 * s, 5 * s, c.ink, 2);
    g.ring(cx - 11 * s, by - 24 * s, 4 * s, c.orange, 1); g.ring(cx + 11 * s, by - 24 * s, 4 * s, c.orange, 1);
    const cup = P([[-10, -34], [10, -34], [8, -14], [3, -9], [-3, -9], [-8, -14]]);
    g.poly(cup, c.yellow); g.poly(P([[2, -34], [10, -34], [8, -14], [3, -9], [2, -9]]), c.orange, 0.55); g.poly(P([[-8, -32], [-5, -32], [-5, -17], [-7, -16]]), c.white, 0.7);
    g.outline(cup, c.ink);
    g.rect(cx - 2 * s, by - 9 * s, 4 * s, 6 * s, c.orange); g.frame(cx - 2 * s, by - 9 * s, 4 * s, 6 * s, c.ink);
    g.rect(cx - 8 * s, by - 3 * s, 16 * s, 4 * s, c.brown); g.frame(cx - 8 * s, by - 3 * s, 16 * s, 4 * s, c.ink);
    g.rect(cx - 11 * s, by + 1 * s, 22 * s, 4 * s, c.violet); g.frame(cx - 11 * s, by + 1 * s, 22 * s, 4 * s, c.ink);
    sparkle(g, cx, by - 24 * s, 4 * s, c.white, c.ink);
    twinkle(g, cx - 7 * s + Math.round(((t * 10) % 34) * 0.5 * (s > 1.4 ? 1 : 0.6)), by - 30 * s, t * 3, c.white);
  }
  function scenic(X, r) {
    const { g, c, t } = X;
    g.rect(r.x, r.y, r.w, r.h, c.ink);
    const b = { x: r.x + 2, y: r.y + 2, w: r.w - 4, h: r.h - 4 }, old = g.clipGet();
    g.setClip(b.x, b.y, b.w, b.h);
    g.dgrad(b.x, b.y, b.w, b.h, c.skyB, c.skyA, true, 0, 1.1);
    const cx = b.x + b.w / 2, gy = b.y + b.h - 12;
    sunburst(g, cx, b.y + b.h * 0.58, 6, Math.max(b.w, b.h), 16, t * 0.14, c.yellow, 0.4);
    for (let i = 0; i < 3; i++) { const x = b.x + ((hsh(i, 1, 5) * 300 + t * (4 + i * 2)) % (b.w + 50)) - 25, y = b.y + 8 + i * (b.h * 0.14); cloud(g, x, y, 0.8 + 0.3 * i, c.white, c.g1); }
    for (let x = b.x; x < b.x + b.w; x++) { const ry = gy - 4 * Math.sin((x - b.x) * 0.06 + 1) - 3 * Math.sin((x - b.x) * 0.15); g.rect(x, ry, 1, b.y + b.h - ry, c.hillNear); g.px(x, ry, c.ink); }
    g.rect(b.x, gy + 6, b.w, 3, c.green, 0.6);
    for (let i = 0; i < 7; i++) { const x = b.x + 6 + i * (b.w - 12) / 6, sw = Math.round(Math.sin(t * 2 + i) * 1.2); g.line(x, gy + 4, x + sw, gy - 2 + (i % 2), c.ink); g.disc(x + sw, gy - 3 + (i % 2), 1, [c.red, c.yellow, c.magenta][i % 3]); }
    trophy(g, c, cx, gy + 4, Math.max(1.2, Math.min(2.2, b.h / 70, b.w / 60)), t);
    for (let i = 0; i < 6; i++) twinkle(g, b.x + 6 + hsh(i, 3, 3) * (b.w - 12), b.y + 6 + hsh(i, 4, 3) * (b.h * 0.6), t * 1.4 + i * 0.37, i % 2 ? c.white : c.accent);
    g.clipSet(old);
  }
  function drawChart(X) {
    const { g, c, A, d, p, t, tall } = X;
    const win = !tall ? { x: A.x, y: A.y, w: Math.round(A.w * 0.7), h: A.h } : { x: A.x, y: A.y, w: A.w, h: Math.round(A.h * 0.66) };
    const side = !tall ? { x: win.x + win.w + 8, y: A.y, w: A.w - win.w - 8, h: A.h } : { x: A.x, y: win.y + win.h + 8, w: A.w, h: A.h - win.h - 8 };
    scenic(X, side);
    const b = winFrame(X, win, "bars.bmp");
    const px0 = b.x + 10, pw = b.w - 18, base = b.y + b.h - 24, top = b.y + 6;
    for (let k = 1; k <= 4; k++) { const y = base - Math.round(((base - top) * k) / 4.4); g.line(px0 - 3, y, px0 + pw, y, c.dot, 1, 1, [1, 2, 0]); g.rect(px0 - 4, y, 3, 1, c.g2); }
    const n = d.values.length, max = Math.max(...d.values, 1), maxH = base - top - 40, slot = pw / n, bw = Math.round(slot * 0.5), dx = Math.max(5, Math.round(bw * 0.2)), dy = Math.round(dx * 0.7);
    const cols = [c.sky, c.lime, c.orange, c.violet, c.teal, c.peach];
    const fronts = [];
    d.values.forEach((value, i) => {
      const q = ease(((p * 0.9 + 0.12) - i * 0.15) / 0.5), full = Math.round((maxH * value) / max), hf = Math.round(full * q);
      const x = Math.round(px0 + slot * i + (slot - bw - dx) / 2), hot = i === d.highlight, col = hot ? c.accent : cols[i % cols.length];
      // Ghost outline of the finished bar until paint reaches it.
      if (q < 1) { g.line(x, base - full, x + bw, base - full, c.g2, 1, 1, [2, 2, Math.floor(t * 8)]); g.line(x, base - full, x, base, c.g2, 1, 1, [2, 2, Math.floor(t * 8)]); g.line(x + bw, base - full, x + bw, base, c.g2, 1, 1, [2, 2, Math.floor(t * 8)]); }
      if (hf > 0) {
        const topY = base - hf;
        for (let xx = 0; xx < bw; xx++) { const wob = q < 0.999 ? Math.round(Math.sin(xx * 0.9 + t * 7) * 1.4 * (1 - q)) : 0; g.rect(x + xx, topY - wob, 1, hf + wob, col); }
        g.rect(x + 1, topY, 2, hf, c.white, 0.55); g.rect(x + bw - 3, topY, 3, hf, c.ink, 0.4);
        if (hot && q > 0.99) for (let yy = 0; yy < hf; yy++) if ((yy + Math.floor(t * 26)) % 28 < 2) g.rect(x + 3, topY + yy, bw - 7, 1, c.white, 0.65);
        const tp = [[x, topY], [x + dx, topY - dy], [x + bw + dx, topY - dy], [x + bw, topY]];
        g.poly(tp, col); g.poly(tp, c.white, 0.5);
        const sd = [[x + bw, topY], [x + bw + dx, topY - dy], [x + bw + dx, base - dy], [x + bw, base]];
        g.poly(sd, col); g.poly(sd, c.ink, 0.5);
        g.outline(tp, c.ink); g.outline(sd, c.ink); g.frame(x, topY, bw + 1, hf + 1, c.ink);
        if (hot && q > 0.99) { twinkle(g, x + bw + dx + 3, topY - dy - 4, t * 2.2, c.yellow); twinkle(g, x - 4, topY + 6, t * 1.7 + 1, c.white); }
      }
      fronts.push({ x: x + bw / 2, y: base - hf, q });
      const label = fmtNum(value * q, d);
      g.text(label, x + (bw + dx) / 2, base - hf - 20, 32, hot ? c.accent : c.ink, { align: "c", sh: hot ? c.ink : undefined });
      g.text(d.labels[i] || "", x + (bw + dx) / 2, base + 12, 14, c.ink, { align: "c" });
    });
    // Axis.
    g.rect(px0 - 4, base, Math.round((pw + 8) * ease(p * 3)), 2, c.ink); g.rect(px0 - 4, top - 2, 2, base - top + 4, c.ink);
    // Leak: paint escapes the hot bar and drips onto the floor of the plot.
    const hi = clamp(d.highlight, 0, n - 1), hotF = fronts[hi];
    if (hotF && hotF.q > 0.5) {
      const x0 = Math.round(px0 + slot * hi + (slot - bw - dx) / 2) + bw + dx, y0 = base - Math.round((maxH * d.values[hi]) / max) * 0.45;
      for (let k = 0; k < 3; k++) { const ph = (t * 0.8 + k / 3) % 1, yy = y0 + ph * ph * (base - y0), xx = x0 + 1 + Math.round(Math.sin(k * 2 + t) * 1); g.rect(xx, yy, 2, 3, c.accent); g.px(xx, yy - 1, c.accent); }
      g.ell(x0 + 3, base - 1, 6 + Math.round(2 * Math.sin(t * 2)), 2, c.accent); g.ellRing(x0 + 3, base - 1, 7, 2, c.ink);
    }
    // Cursor: pours paint at the bar being filled, then roams over the bar tops.
    const roam = wander(t, fronts.map((f) => [f.x + 3, f.y - 8]), 1.4), cur = clamp(Math.floor(span(p, 0, 0.85) * n), 0, n - 1);
    const front = fronts[cur], w = 1 - span(p, 0.82, 0.98);
    const cx = lerp(roam.x, front.x, w), cy = lerp(roam.y, front.y - 20, w);
    cursor(X, w > 0.5 ? "bucket" : "arrow", cx, cy, { color: c.accent, click: roam.click && w < 0.5, k: roam.k });
  }

  // ---- object ---------------------------------------------------------------------------------------------
  function screenArt(X, r, phone) {
    const { g, c, t, p } = X;
    g.rect(r.x, r.y, r.w, r.h, c.ui);
    const vertical = r.h > r.w * 1.15, pad = 3;
    const pv = vertical ? { x: r.x + pad, y: r.y + pad + 6, w: r.w - pad * 2, h: Math.round(r.h * 0.4) } : { x: r.x + pad, y: r.y + pad + 6, w: Math.round(r.w * 0.62), h: Math.round(r.h * 0.5) };
    // Menu strip.
    g.rect(r.x, r.y, r.w, 6, c.dk);
    for (let i = 0; i < 5; i++) g.rect(r.x + 4 + i * 9, r.y + 2, 6, 2, i === Math.floor(t * 0.8) % 5 ? c.white : c.g2);
    // Preview: a tiny sunrise.
    g.rect(pv.x - 1, pv.y - 1, pv.w + 2, pv.h + 2, c.ink);
    g.dgrad(pv.x, pv.y, pv.w, pv.h, c.skyC, c.sky, true, 0, 1);
    const sunx = pv.x + ((t * 6) % (pv.w + 16)) - 8, suny = pv.y + pv.h * 0.55 - Math.sin(((sunx - pv.x) / pv.w) * Math.PI) * pv.h * 0.3;
    const old = g.clipGet(); g.setClip(pv.x, pv.y, pv.w, pv.h);
    g.disc(sunx, suny, Math.max(3, pv.h * 0.14), c.yellow);
    cloud(g, pv.x + ((t * 3 + 20) % (pv.w + 30)) - 15, pv.y + pv.h * 0.2, 0.55, c.white, c.g1);
    for (let x = 0; x < pv.w; x++) g.rect(pv.x + x, pv.y + pv.h - 5 - Math.round(2 * Math.sin(x * 0.2 + 1) + 1.5 * Math.sin(x * 0.07)), 1, 9, c.hillNear);
    g.clipSet(old);
    // Media bin.
    const bin = vertical ? { x: pv.x, y: pv.y + pv.h + 4, w: pv.w, h: 11 } : { x: pv.x + pv.w + 4, y: pv.y, w: r.w - pv.w - pad * 2 - 4, h: pv.h };
    if (vertical) for (let i = 0; i < 4; i++) { g.rect(bin.x + i * (bin.w / 4), bin.y, bin.w / 4 - 2, bin.h, [c.red, c.lime, c.orange, c.violet][i]); if (i === Math.floor(t * 1.5) % 4) g.frame(bin.x + i * (bin.w / 4) - 1, bin.y - 1, bin.w / 4, bin.h + 2, c.white); }
    else for (let i = 0; i < 3; i++) { const yy = bin.y + i * (bin.h / 3); g.rect(bin.x, yy, bin.w, bin.h / 3 - 2, [c.red, c.lime, c.orange][i]); g.rect(bin.x + 2, yy + 2, 8, 3, c.white, 0.7); if (i === Math.floor(t * 1.5) % 3) g.frame(bin.x - 1, yy - 1, bin.w + 2, bin.h / 3, c.white); }
    // Timeline: ruler, three tracks, playhead.
    const tlY = (vertical ? bin.y + bin.h + 5 : pv.y + pv.h + 6), tl = { x: r.x + pad, y: tlY, w: r.w - pad * 2, h: r.y + r.h - pad - tlY };
    g.rect(tl.x, tl.y, tl.w, 5, c.dk);
    for (let x = 0; x < tl.w; x += 6) g.rect(tl.x + x, tl.y + 3, 1, 2, c.g2);
    const th = Math.max(4, Math.floor((tl.h - 8) / 3)), anchors = [];
    const clips = [[[0.04, 0.32], [0.4, 0.2], [0.66, 0.3]], [[0.1, 0.22], [0.36, 0.34], [0.74, 0.2]], [[0.02, 0.5], [0.58, 0.38]]];
    clips.forEach((row, ti) => row.forEach(([cx, cw], i) => {
      const shown = clamp((p * 2.2 - ti * 0.25 - i * 0.2) * 2);
      const hot = ti === 0 && i === 1, ww = Math.round(tl.w * cw * shown);
      if (ww <= 0) return;
      const yy = tl.y + 7 + ti * (th + 2), xx = tl.x + Math.round(tl.w * cx);
      g.rect(xx, yy, ww, th, hot ? c.accent : [c.sky, c.lime, c.peach][ti]); g.frame(xx, yy, ww, th, c.ink);
      if (ww > 8) g.rect(xx + 2, yy + 1, Math.min(ww - 4, 8), 1, c.white, 0.8);
      if (hot) anchors[1] = [xx + ww / 2, yy + th / 2];
      if (ti === 2 && i === 0) anchors[2] = [xx + 6, yy + th / 2];
    }));
    const ph = tl.x + ((t * 0.22) % 1) * tl.w;
    g.rect(Math.round(ph), tl.y, 1, tl.h, c.red); g.poly([[ph - 2, tl.y], [ph + 3, tl.y], [ph + 0.5, tl.y + 4]], c.red);
    anchors[0] = [pv.x + pv.w * 0.72, pv.y + pv.h * 0.3];
    if (!anchors[1]) anchors[1] = [tl.x + tl.w * 0.5, tl.y + 10];
    if (!anchors[2]) anchors[2] = [tl.x + 6, tl.y + 7 + 2 * (th + 2) + th / 2];
    g.frame(r.x, r.y, r.w, r.h, c.ink);
    return anchors;
  }
  function plant(g, c, x, y, t) {
    g.rect(x - 6, y - 10, 12, 10, c.brown); g.frame(x - 6, y - 10, 12, 10, c.ink); g.rect(x - 7, y - 12, 14, 3, c.orange); g.frame(x - 7, y - 12, 14, 3, c.ink);
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.55 + Math.sin(t * 1.6 + i) * 0.1, L = 14 + (i % 2) * 5; g.line(x, y - 12, x + Math.cos(a) * L, y - 12 + Math.sin(a) * L, c.ink, 3); g.line(x, y - 12, x + Math.cos(a) * L, y - 12 + Math.sin(a) * L, c.green, 1); }
  }
  function mug(g, c, x, y, t) {
    g.rect(x - 5, y - 10, 10, 10, c.white); g.frame(x - 5, y - 10, 10, 10, c.ink); g.ring(x + 6, y - 5, 3, c.ink, 1); g.rect(x - 4, y - 9, 8, 2, c.brown);
    g.rect(x - 4, y - 6, 2, 5, c.red, 0.5);
    for (let i = 0; i < 3; i++) { const ph = (t * 0.7 + i / 3) % 1; g.px(x - 2 + i * 2 + Math.round(Math.sin(ph * 6 + i) * 2), y - 12 - ph * 14, c.white); g.px(x - 2 + i * 2 + Math.round(Math.sin(ph * 6 + i) * 2), y - 13 - ph * 14, c.g2); }
  }
  function leader(g, c, pts, q, t) {
    g.path(pts, c.ink, 3, q);
    g.path(pts, c.accent, 1, q);
    if (q > 0.99) { const e = pts[pts.length - 1]; g.disc(e[0], e[1], 3, c.accent); g.ring(e[0], e[1], 3 + Math.round(Math.abs(Math.sin(t * 3)) * 3), c.accent, 1); }
  }
  function drawObject(X) {
    const { g, c, A, d, p, t, tall } = X, phone = d.kind === "phone";
    const deskH = 14, deskY = tall ? A.y + Math.round(A.h * 0.62) : A.y + A.h - deskH;
    // Wall and desk.
    g.rect(A.x, A.y, A.w, deskY - A.y, c.peach, 0.2);
    for (let y = A.y + 4; y < deskY; y += 9) for (let x = A.x + ((y / 9) % 2 ? 4 : 0); x < A.x + A.w; x += 9) g.px(x, y, c.peach);
    g.rect(A.x, deskY, A.w, deskH, c.desk); g.rect(A.x, deskY, A.w, 2, c.peach); g.rect(A.x, deskY + 2, A.w, 1, c.ink); g.rect(A.x, deskY + 5, A.w, deskH - 5, c.ink, 0.3);
    for (let i = 0; i < 14; i++) g.rect(A.x + hsh(i, 1, 7) * A.w, deskY + 5 + hsh(i, 2, 7) * 7, 6 + hsh(i, 3, 7) * 10, 1, c.ink, 0.5);
    g.frame(A.x, deskY, A.w, deskH, c.ink);
    // Device.
    let dev, scr;
    if (!phone) {
      const sh = tall ? Math.round(A.h * 0.46) : deskY - A.y - 22, sw = Math.min(Math.round(sh / 0.62), Math.round(A.w * (tall ? 0.94 : 0.56)));
      const shh = Math.round(sw * 0.62);
      dev = { x: tall ? A.x + Math.round((A.w - sw) / 2) : A.x + 8, y: deskY - shh - 16, w: sw, h: shh };
      g.ell(dev.x + dev.w / 2, deskY + 3, dev.w * 0.55, 3, c.ink, 0.4);
      g.poly([[dev.x - 8, deskY - 3], [dev.x + dev.w + 8, deskY - 3], [dev.x + dev.w + 2, dev.y + dev.h + 4], [dev.x - 2, dev.y + dev.h + 4]], c.g1); g.outline([[dev.x - 8, deskY - 3], [dev.x + dev.w + 8, deskY - 3], [dev.x + dev.w + 2, dev.y + dev.h + 4], [dev.x - 2, dev.y + dev.h + 4]], c.ink);
      for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) g.rect(dev.x + 6 + i * ((dev.w - 12) / 8), dev.y + dev.h + 6 + j * 4, Math.max(3, (dev.w - 12) / 8 - 2), 2, hsh(Math.floor(t * 5), i + j * 8, 4) > 0.93 ? c.accent : c.g2);
      g.rect(dev.x - 3, dev.y - 3, dev.w + 6, dev.h + 7, c.g2); g.frame(dev.x - 3, dev.y - 3, dev.w + 6, dev.h + 7, c.ink);
      g.rect(dev.x - 2, dev.y - 2, dev.w + 4, 1, c.white, 0.7);
      scr = { x: dev.x, y: dev.y, w: dev.w, h: dev.h };
    } else {
      const h = tall ? Math.round(A.h * 0.4) : deskY - A.y - 6, w = Math.round(h * 0.52);
      dev = { x: tall ? A.x + Math.round(A.w / 2 - w / 2) : A.x + Math.round(A.w * 0.12), y: deskY - h - 3, w, h };
      g.poly([[dev.x + w / 2 - 10, deskY], [dev.x + w / 2 + 10, deskY], [dev.x + w / 2 + 4, dev.y + h - 4], [dev.x + w / 2 - 4, dev.y + h - 4]], c.g2); g.outline([[dev.x + w / 2 - 10, deskY], [dev.x + w / 2 + 10, deskY], [dev.x + w / 2 + 4, dev.y + h - 4], [dev.x + w / 2 - 4, dev.y + h - 4]], c.ink);
      g.rect(dev.x - 3, dev.y - 3, w + 6, h + 6, c.ink); g.rect(dev.x - 2, dev.y - 2, w + 4, h + 4, c.g3); g.rect(dev.x + w / 2 - 4, dev.y - 1, 8, 1, c.g1);
      scr = { x: dev.x + 1, y: dev.y + 1, w: w - 2, h: h - 2 };
    }
    if (!tall) {
      const cx0 = Math.max(dev.x + dev.w + 36, A.x + A.w - 150), cy0 = deskY - 56, cw0 = A.x + A.w - cx0 - 4;
      g.rect(cx0, cy0, cw0, 46, c.brown); g.rect(cx0 + 2, cy0 + 2, cw0 - 4, 42, c.peach); g.frame(cx0, cy0, cw0, 46, c.ink, 2);
      for (let i = 0; i < 40; i++) g.px(cx0 + 3 + hsh(i, 1, 71) * (cw0 - 6), cy0 + 3 + hsh(i, 2, 71) * 40, c.brown);
      for (let i = 0; i < 5; i++) {
        const nx = cx0 + 6 + i * ((cw0 - 24) / 4), ny = cy0 + 6 + (i % 2) * 14 + Math.round(Math.sin(t * 1.5 + i) * 1), nc = [c.yellow, c.sky, c.lime, c.magenta, c.white][i];
        g.rect(nx + 1, ny + 1, 16, 16, c.ink, 0.5); g.rect(nx, ny, 16, 16, nc); g.frame(nx, ny, 16, 16, c.ink);
        for (let k = 0; k < 3; k++) g.rect(nx + 3, ny + 5 + k * 4, 6 + ((i + k) % 3) * 2, 1, c.ink);
        g.disc(nx + 8, ny + 1, 1, c.red);
      }
    }
    // Props.
    plant(g, c, tall ? A.x + 12 : A.x + A.w - 18, deskY + 2, t);
    mug(g, c, tall ? A.x + A.w - 14 : dev.x + dev.w + 24, deskY + 2, t);
    g.sprite(["XXXXXXX", "XwwwwwX", "XwXXXwX", "XwwwwwX", "XbbbbbX", "XbXXbbX", "XXXXXXX"], { X: c.ink, w: c.white, b: c.blue }, tall ? A.x + 30 : dev.x + dev.w + 52, deskY - 5);
    const anchors = screenArt(X, scr, phone);
    // Callouts.
    const tagCols = [c.sky, c.yellow, c.peach];
    const n = d.callouts.length;
    const sizes = d.callouts.map((s) => g.textW(s, 14) + 12);
    d.callouts.forEach((label, i) => {
      const q = stagger(p, i, n, 0.5), tw = sizes[i], th = 18;
      let tx, ty;
      if (!tall) { tx = Math.max(dev.x + dev.w + 26, A.x + A.w - tw - 2); ty = A.y + 8 + i * Math.round((deskY - A.y - 30) / n); } else { tx = A.x + A.w - tw - 2 - (i % 2) * 0; ty = deskY + deskH + 8 + i * Math.round((A.y + A.h - deskY - deskH - 12) / n); }
      const [ax, ay] = anchors[i] || anchors[0];
      const xm = dev.x + dev.w + 8 + i * 5, pts = [[tx, ty + th / 2], [xm, ty + th / 2], [xm, ay], [ax, ay]];
      leader(g, c, pts, ease(q * 1.6), t);
      if (q > 0.45) {
        const bob = Math.round(Math.sin(t * 2.2 + i * 1.7) * 1);
        g.rect(tx + 2, ty + bob + 2, tw, th, c.ink, 0.6); g.rect(tx, ty + bob, tw, th, tagCols[i % 3]); g.frame(tx, ty + bob, tw, th, c.ink);
        g.text(label, tx + 6, ty + bob + th / 2 + 1, 14, c.ink, { q: span(q, 0.45, 0.9) });
        g.rect(tx + 2, ty + bob + 2, 3, 3, c.white, 0.8);
      }
    });
    const pos = wander(t, [[anchors[0][0], anchors[0][1]], [anchors[1][0], anchors[1][1]], [anchors[2][0], anchors[2][1]]], 1.5);
    cursor(X, "arrow", pos.x + 2, pos.y + 2, { click: pos.click, k: pos.k });
  }

  // ---- people ---------------------------------------------------------------------------------------------
  function person(g, c, cx, by, s, col, idx, t, hot, seed) {
    const bw = Math.round(s * 0.6), bh = Math.round(s * 0.84), bob = Math.round(Math.sin(t * 2.2 + seed) * Math.max(1, s * 0.012)), cy = by - 4 - Math.round(bh / 2) + bob;
    const er = Math.max(2, Math.round(s * 0.05));
    g.ell(cx, by + 1, bw * 0.62, Math.max(2, s * 0.03), c.ink, 0.45);
    for (const sx of [-1, 1]) { g.ell(cx + sx * bw * 0.24, by - 2, Math.max(3, s * 0.07), 3, c.ink); g.ell(cx + sx * bw * 0.24, by - 3, Math.max(2, s * 0.06), 2, c.brown); }
    // Arms: the right one waves.
    const sh = [cx - bw / 2 + 2, cy + bh * 0.02], sh2 = [cx + bw / 2 - 2, cy + bh * 0.02];
    g.line(sh[0], sh[1], sh[0] - s * 0.1, sh[1] + s * 0.2, c.ink, 5); g.line(sh[0], sh[1], sh[0] - s * 0.1, sh[1] + s * 0.2, col, 3);
    const wa = -0.9 + Math.sin(t * 5 + seed) * 0.5, ex = sh2[0] + Math.cos(wa) * s * 0.27, ey = sh2[1] + Math.sin(wa) * s * 0.27;
    g.line(sh2[0], sh2[1], ex, ey, c.ink, 5); g.line(sh2[0], sh2[1], ex, ey, col, 3); g.disc(ex, ey, Math.max(2, s * 0.035), c.peach); g.ring(ex, ey, Math.max(2, s * 0.035), c.ink, 1);
    g.ell(cx, cy, bw / 2 + 1, bh / 2 + 1, c.ink); g.ell(cx, cy, bw / 2, bh / 2, col);
    g.ell(cx + bw * 0.12, cy + bh * 0.18, bw * 0.28, bh * 0.22, c.white, 0.4);
    g.ell(cx - bw * 0.25, cy - bh * 0.12, 2, bh * 0.22, c.white, 0.75);
    // Face.
    const fy = cy - bh * 0.18, blink = (t * 0.9 + seed * 0.37) % 3.2 > 3.05, look = Math.round(Math.sin(t * 0.8 + seed));
    for (const sx of [-1, 1]) {
      const ex2 = cx + sx * bw * 0.2;
      if (blink) g.line(ex2 - er, fy, ex2 + er, fy, c.ink, 2); else { g.disc(ex2, fy, er, c.white); g.ring(ex2, fy, er, c.ink, 1); g.disc(ex2 + look, fy + 1, Math.max(1, er * 0.5), c.ink); }
      g.disc(ex2 + sx * er * 0.9, fy + er * 2, Math.max(2, er * 0.8), c.magenta, 0.5);
    }
    const mw = Math.max(3, Math.round(bw * 0.12));
    for (let i = -mw; i <= mw; i++) g.px(cx + i, fy + er * 2.6 - Math.round((i * i) / (mw * 1.6)) + 1, c.ink);
    // Accessory.
    const a = idx % 6;
    if (a === 0) { g.ell(cx, cy - bh / 2 + 3, bw * 0.4, Math.max(5, s * 0.08), c.red); g.ellRing(cx, cy - bh / 2 + 3, bw * 0.4, Math.max(5, s * 0.08), c.ink); g.rect(cx - bw * 0.42, cy - bh / 2 + 3, bw * 0.84, 3, c.white); g.disc(cx, cy - bh / 2 - Math.max(4, s * 0.07) + 1, 3, c.yellow); }
    else if (a === 1) { g.ellRing(cx, cy - bh * 0.18, bw * 0.55, bh * 0.4, c.ink, 2); g.disc(cx - bw * 0.55, fy + 2, Math.max(3, s * 0.05), c.violet); g.disc(cx + bw * 0.55, fy + 2, Math.max(3, s * 0.05), c.violet); }
    else if (a === 2) { for (const sx of [-1, 1]) g.ring(cx + sx * bw * 0.2, fy, er + 3, c.ink, 1); g.line(cx - bw * 0.2 + er + 3, fy, cx + bw * 0.2 - er - 3, fy, c.ink); }
    else if (a === 3) { const ty = cy - bh / 2; g.line(cx, ty, cx + 3, ty - s * 0.14, c.ink, 2); g.disc(cx + 3, ty - s * 0.14 - 2, 3, Math.floor(t * 3) % 2 ? c.red : c.yellow); g.ring(cx + 3, ty - s * 0.14 - 2, 3, c.ink, 1); }
    else if (a === 4) { g.ell(cx, cy - bh / 2 + 3, bw * 0.38, Math.max(4, s * 0.07), c.blue); g.ellRing(cx, cy - bh / 2 + 3, bw * 0.38, Math.max(4, s * 0.07), c.ink); g.rect(cx + 2, cy - bh / 2 + 4, bw * 0.5, 3, c.blue); g.frame(cx + 2, cy - bh / 2 + 4, bw * 0.5, 3, c.ink); }
    else { const by2 = cy + bh * 0.22; g.poly([[cx, by2], [cx - bw * 0.22, by2 - 5], [cx - bw * 0.22, by2 + 5]], c.magenta); g.poly([[cx, by2], [cx + bw * 0.22, by2 - 5], [cx + bw * 0.22, by2 + 5]], c.magenta); g.disc(cx, by2, 2, c.yellow); }
    return { top: cy - bh / 2 - 4 };
  }
  function wrapLines(g, str, maxW, size) {
    if (g.textW(str, size) <= maxW) return [str];
    const words = str.split(" ");
    if (words.length < 2) return [str];
    let best = [str, ""], bs = 1e9;
    for (let i = 1; i < words.length; i++) { const a = words.slice(0, i).join(" "), b = words.slice(i).join(" "), m = Math.max(g.textW(a, size), g.textW(b, size)); if (m < bs) { bs = m; best = [a, b]; } }
    return best;
  }
  function drawPeople(X) {
    const { g, c, A, d, p, t, tall } = X;
    const n = clamp(Math.round(d.count), 2, 6), floorY = A.y + Math.round(A.h * 0.8);
    // Stage: wall, curtains, spotlights, floor.
    g.dgrad(A.x, A.y, A.w, floorY - A.y, c.skyB, c.skyC, true, 0, 1);
    for (let y = A.y + 3; y < floorY; y += 6) for (let x = A.x + ((y / 6) % 2 ? 3 : 0); x < A.x + A.w; x += 6) g.px(x, y, c.white);
    g.rect(A.x, floorY, A.w, A.y + A.h - floorY, c.desk);
    for (let i = 0; i < 40; i++) { const x = A.x + (i * A.w) / 40; g.line(A.x + A.w / 2 + (x - A.x - A.w / 2) * 0.35, floorY, x, A.y + A.h, c.ink, 1); }
    for (let r = 0; r < 4; r++) g.line(A.x, floorY + r * r * 2 + 3, A.x + A.w, floorY + r * r * 2 + 3, c.ink, 1);
    g.rect(A.x, floorY, A.w, 2, c.ink);
    for (const side of [0, 1]) {
      const cw = 15, x0 = side ? A.x + A.w - cw : A.x;
      for (let xx = 0; xx < cw; xx++) {
        const f = (xx + (side ? 2 : 0)) % 5, hem = Math.round(Math.sin(t * 1.4 + xx * 0.7 + side) * 1.5);
        g.rect(x0 + xx, A.y, 1, floorY - A.y + hem, f < 2 ? c.red : c.magenta); if (f === 3) g.rect(x0 + xx, A.y, 1, floorY - A.y + hem, c.ink, 0.4);
      }
      g.rect(side ? x0 : x0 + cw - 1, A.y, 1, floorY - A.y, c.ink);
    }
    g.rect(A.x, A.y, A.w, 4, c.red); g.rect(A.x, A.y + 4, A.w, 1, c.ink);
    for (let k = 0; k < 2; k++) {
      const sx = A.x + A.w * (0.3 + 0.4 * k), tx = sx + Math.sin(t * 0.8 + k * 2.2) * A.w * 0.18;
      g.poly([[sx - 3, A.y + 5], [sx + 3, A.y + 5], [tx + 22, floorY + 4], [tx - 22, floorY + 4]], c.yellow, 0.3);
      g.ell(tx, floorY + 6, 24, 4, c.yellow, 0.55);
      g.rect(sx - 4, A.y + 5, 8, 4, c.ink);
    }
    // Crew.
    const cols = tall && n > 3 ? Math.ceil(n / 2) : n, rows = Math.ceil(n / cols), slotW = A.w / cols;
    const s0 = Math.min(slotW * 1.12, rows > 1 ? A.h * 0.36 : A.h * 0.6);
    const bodyCols = [c.sky, c.accent, c.lime, c.orange, c.violet, c.teal];
    const order = [];
    for (let r = 0; r < rows; r++) for (let i = 0; i < cols; i++) { const idx = r * cols + i; if (idx < n) order.push({ idx, r, i, inRow: Math.min(cols, n - r * cols) }); }
    order.forEach(({ idx, r, i, inRow }) => {
      const q = stagger(p, idx, n, 0.5), k = rows > 1 ? 0.8 + 0.2 * r : 1, s = Math.round(s0 * k), hot = idx === Math.min(n - 1, d.highlight);
      const cx = A.x + (A.w / inRow) * (i + 0.5), by = (rows > 1 ? floorY + 12 - (rows - 1 - r) * Math.round(A.h * 0.3) : floorY + 14) + Math.round((1 - q) * 12);
      const col = hot ? c.accent : bodyCols[idx % bodyCols.length];
      const old = g.clipGet();
      g.setClip(old[0], old[1], old[2] - old[0], Math.max(1, by + 6 - old[1]));
      const info = person(g, c, cx, by, Math.round(s * (hot ? 1.06 : 1)), col, idx, t, hot, idx * 1.7);
      g.clipSet(old);
      if (hot) { sparkle(g, cx + Math.round(Math.sin(t * 1.5) * 4), info.top - 22 - Math.round(Math.abs(Math.sin(t * 3)) * 3), 7, c.yellow, c.ink); for (let k2 = 0; k2 < 4; k2++) { const a = t * 1.2 + (k2 * TAU) / 4; twinkle(g, cx + Math.cos(a) * s * 0.5, info.top + s * 0.4 + Math.sin(a) * s * 0.18, t * 2 + k2 * 0.3, c.white); } }
      const label = d.badges[idx % d.badges.length];
      if (label && q > 0.6) {
        const lines = wrapLines(g, label, Math.max(60, slotW - 4), 14), tw = Math.max(...lines.map((l) => g.textW(l, 14))) + 10, th = lines.length * 16 + 4;
        const ty = info.top - th - 8 - (hot ? 10 : 0), tx = Math.round(cx - tw / 2);
        g.rect(tx + 2, ty + 2, tw, th, c.ink, 0.55); g.rect(tx, ty, tw, th, hot ? c.accent : c.white); g.frame(tx, ty, tw, th, c.ink);
        g.poly([[cx - 3, ty + th], [cx + 4, ty + th], [cx, ty + th + 4]], hot ? c.accent : c.white); g.line(cx - 3, ty + th, cx, ty + th + 4, c.ink); g.line(cx + 4, ty + th, cx, ty + th + 4, c.ink);
        lines.forEach((l, li) => g.text(l, cx, ty + 10 + li * 16, 14, hot ? X.S.look.onAccent : c.ink, { align: "c", q: span(q, 0.6, 1) }));
      }
    });
    for (let i = 0; i < 26; i++) { const y = A.y + ((hsh(i, 2, 8) * A.h + t * (9 + hsh(i, 3, 8) * 10)) % A.h), x = A.x + 18 + hsh(i, 1, 8) * (A.w - 36) + Math.sin(t * 2 + i) * 2; g.rect(x, y, 2, 3, [c.yellow, c.sky, c.magenta, c.lime][i % 4]); }
    const pos = wander(t, order.map((o) => [A.x + (A.w / o.inRow) * (o.i + 0.5) + 6, floorY - 10]), 1.5);
    cursor(X, "arrow", pos.x, pos.y, { click: pos.click, k: pos.k });
  }

  // ---- process --------------------------------------------------------------------------------------------
  function traces(X, A) {
    const { g, c, t, T } = X;
    const n = Math.round(22 * (0.4 + 0.6 * T));
    for (let i = 0; i < n; i++) {
      const x0 = A.x + hsh(i, 1, 31) * A.w, y0 = A.y + hsh(i, 2, 31) * A.h, mx = x0 + (hsh(i, 3, 31) - 0.5) * 120, my = y0 + (hsh(i, 4, 31) - 0.5) * 80;
      const pts = [[x0, y0], [mx, y0], [mx, my], [mx + (hsh(i, 5, 31) - 0.5) * 60, my]];
      g.path(pts, c.g1, 2);
      g.path(pts, c.g2, 1);
      const e = pts[3]; g.disc(e[0], e[1], 2, c.g2); g.disc(e[0], e[1], 1, Math.floor(t * 2 + i) % 3 === 0 ? c.accent : c.white);
      const k = (t * 0.35 + hsh(i, 6, 31)) % 1; let tot = 0; const Ls = []; for (let j = 1; j < 4; j++) { const l = Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]); Ls.push(l); tot += l; }
      let left = tot * k; for (let j = 1; j < 4; j++) { if (left <= Ls[j - 1]) { const f = left / Math.max(1, Ls[j - 1]); g.rect(lerp(pts[j - 1][0], pts[j][0], f) - 1, lerp(pts[j - 1][1], pts[j][1], f) - 1, 3, 3, c.accent); break; } left -= Ls[j - 1]; }
    }
  }
  function stepIcon(X, kind, r, t) {
    const { g, c } = X, cx = r.x + r.w / 2, cy = r.y + r.h / 2, s = Math.min(r.w, r.h);
    if (kind === 0) {
      const pw = s * 0.5, ph = s * 0.66, x = cx - pw / 2, y = cy - ph / 2;
      const pts = [[x, y], [x + pw * 0.7, y], [x + pw, y + pw * 0.3], [x + pw, y + ph], [x, y + ph]];
      g.poly(pts, c.white); g.outline(pts, c.ink); g.poly([[x + pw * 0.7, y], [x + pw * 0.7, y + pw * 0.3], [x + pw, y + pw * 0.3]], c.g2); g.outline([[x + pw * 0.7, y], [x + pw * 0.7, y + pw * 0.3], [x + pw, y + pw * 0.3]], c.ink);
      for (let i = 0; i < 5; i++) { const L = (pw - 8) * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 2.4 + i * 1.3))); g.rect(x + 4, y + pw * 0.4 + 4 + i * (ph - pw * 0.4 - 8) / 5, L, 2, [c.sky, c.accent, c.lime, c.orange, c.violet][i]); }
      const mx = cx + Math.sin(t * 1.3) * pw * 0.6 + 6, my = cy + Math.cos(t * 1.7) * ph * 0.3 + 4;
      g.ring(mx, my, s * 0.13, c.ink, 2); g.disc(mx, my, s * 0.1, c.sky, 0.5); g.line(mx + s * 0.1, my + s * 0.1, mx + s * 0.22, my + s * 0.22, c.ink, 3);
    } else if (kind === 1) {
      g.disc(cx + s * 0.18, cy - s * 0.18, s * 0.22, c.yellow, 0.35);
      g.line(cx - s * 0.3, cy + s * 0.3, cx + s * 0.16, cy - s * 0.16, c.ink, 5); g.line(cx - s * 0.3, cy + s * 0.3, cx + s * 0.16, cy - s * 0.16, c.brown, 3);
      g.line(cx + s * 0.1, cy - s * 0.1, cx + s * 0.18, cy - s * 0.18, c.white, 3);
      sparkle(g, cx + s * 0.22, cy - s * 0.22, s * (0.17 + 0.04 * Math.sin(t * 4)), c.yellow, c.ink);
      for (let i = 0; i < 5; i++) { const a = t * 1.4 + (i * TAU) / 5, rr = s * (0.3 + 0.05 * Math.sin(t * 2 + i)); twinkle(g, cx + s * 0.12 + Math.cos(a) * rr, cy - s * 0.12 + Math.sin(a) * rr * 0.8, t * 2 + i * 0.3, [c.accent, c.sky, c.white, c.lime, c.orange][i]); }
    } else {
      const bw = s * 0.52, x = cx - bw / 2, y = cy - bw / 2 + 2;
      g.rect(x + 2, y + 2, bw, bw, c.ink, 0.5); g.rect(x, y, bw, bw, c.white); g.frame(x, y, bw, bw, c.ink, 2);
      const q = clamp(((t * 0.55) % 1.6) / 0.9);
      g.path([[x + bw * 0.2, y + bw * 0.55], [x + bw * 0.42, y + bw * 0.78], [x + bw * 0.82, y + bw * 0.22]], c.green, 4, q);
      const ph = (t * 0.6) % 1;
      g.ring(cx, cy + 2, bw * 0.6 + ph * s * 0.28, c.accent, 1); g.ring(cx, cy + 2, bw * 0.6 + ((ph + 0.5) % 1) * s * 0.28, c.accent, 1);
    }
  }
  function drawProcess(X) {
    const { g, c, A, d, p, t, tall } = X;
    traces(X, A);
    const n = d.steps.length, gap = tall ? 24 : 28;
    const cw = tall ? A.w : Math.floor((A.w - gap * (n - 1)) / n), ch = tall ? Math.floor((A.h - gap * (n - 1)) / n) : Math.min(A.h, 220);
    const y0 = tall ? A.y : A.y + Math.round((A.h - ch) / 2);
    const rects = [];
    for (let i = 0; i < n; i++) {
      const q = stagger(p, i, n, 0.55), r = { x: tall ? A.x : A.x + i * (cw + gap), y: tall ? A.y + i * (ch + gap) : y0, w: cw, h: ch };
      rects.push(r);
      if (q <= 0) { g.frame(r.x, r.y, r.w, r.h, c.ink, 1); g.line(r.x, r.y, r.x + r.w, r.y, c.white, 1, 1, [3, 3, Math.floor(t * 8)]); continue; }
      const old = g.clipGet();
      g.setClip(r.x - 1, r.y - 1, r.w + 6, Math.max(1, Math.round((r.h + 4) * q)));
      const b = winFrame(X, r, "step " + String(i + 1).padStart(2, "0"));
      const horiz = r.w > r.h * 1.25, lines = wrapLines(g, d.steps[i], horiz ? r.w * 0.52 : r.w - 10, 14), lh = lines.length * 16 + 6;
      const ir = horiz ? { x: b.x + 4, y: b.y + 4, w: Math.min(b.h - 8, b.w * 0.4), h: b.h - 8 } : { x: b.x + 4, y: b.y + 4, w: b.w - 8, h: b.h - lh - 10 };
      g.rect(ir.x, ir.y, ir.w, ir.h, c.skyB, 0.6); g.frame(ir.x, ir.y, ir.w, ir.h, c.g2);
      const o2 = g.clipGet(); g.setClip(ir.x, ir.y, ir.w, ir.h);
      stepIcon(X, i % 3, ir, t + i * 0.6);
      g.clipSet(o2);
      const lx = horiz ? ir.x + ir.w + (b.x + b.w - ir.x - ir.w) / 2 : b.x + b.w / 2, ly = horiz ? b.y + b.h / 2 - ((lines.length - 1) * 16) / 2 : b.y + b.h - lh / 2 - 2;
      lines.forEach((l, li) => g.text(l, lx, ly + li * 16 + 1, 14, i === n - 1 ? c.accent : c.ink, { align: "c", sh: i === n - 1 ? c.ink : undefined }));
      g.text(String(i + 1), b.x + b.w - 8, b.y + 10, 12, c.accent, { align: "c", sh: c.ink });
      g.clipSet(old);
    }
    for (let i = 0; i < n - 1; i++) {
      const a = stagger(p, i + 0.55, n, 0.55), r = rects[i], r2 = rects[i + 1];
      const [x0, y0b, x1, y1] = tall ? [r.x + r.w / 2, r.y + r.h + 3, r2.x + r2.w / 2, r2.y - 4] : [r.x + r.w + 3, r.y + r.h / 2, r2.x - 4, r2.y + r2.h / 2];
      g.line(x0, y0b, x1, y1, c.ink, 4, a); g.line(x0, y0b, x1, y1, c.accent, 2, a, [3, 2, -Math.floor(t * 10)]);
      if (a > 0.95) { if (tall) g.poly([[x1 - 6, y1 - 6], [x1 + 6, y1 - 6], [x1, y1 + 2]], c.accent); else g.poly([[x1 - 6, y1 - 6], [x1 - 6, y1 + 6], [x1 + 2, y1]], c.accent); }
      const k = (t * 0.5 + i * 0.4) % 1, px2 = lerp(x0, x1, k), py2 = lerp(y0b, y1, k) - Math.round(Math.abs(Math.sin(k * Math.PI)) * 4);
      if (a > 0.95) { g.rect(px2 - 4, py2 - 4, 9, 9, c.yellow); g.frame(px2 - 4, py2 - 4, 9, 9, c.ink); g.px(px2, py2, c.accent); }
    }
    const tip = rects.map((r) => [r.x + r.w / 2, r.y + r.h / 2]);
    const pos = wander(t, tip, 1.6);
    cursor(X, "arrow", pos.x + 6, pos.y + 6, { click: pos.click, k: pos.k });
  }

  // ---- compare --------------------------------------------------------------------------------------------
  function drawCompare(X) {
    const { g, c, A, d, p, t, tall } = X;
    const gap = tall ? 22 : 30, wcard = tall ? A.w : Math.floor((A.w - gap) / 2), hcard = tall ? Math.floor((A.h - gap) / 2) : Math.min(A.h, 230);
    const y0 = tall ? A.y : A.y + Math.round((A.h - hcard) / 2);
    const max = Math.max(d.leftValue, d.rightValue, 1);
    [[d.left, d.leftValue, 0], [d.right, d.rightValue, 1]].forEach(([label, value, i]) => {
      const q = stagger(p, i, 2, 0.4), r = { x: tall ? A.x : A.x + i * (wcard + gap), y: tall ? A.y + i * (hcard + gap) : y0, w: wcard, h: hcard };
      if (q <= 0) { g.frame(r.x, r.y, r.w, r.h, c.ink, 1); g.line(r.x, r.y, r.x + r.w, r.y, c.white, 1, 1, [3, 3, Math.floor(t * 8)]); return; }
      const old = g.clipGet();
      g.setClip(r.x - 1, r.y - 1, r.w + 6, Math.max(1, Math.round((r.h + 4) * q)));
      const b = winFrame(X, r, i ? "after.bmp" : "before.bmp", i ? c.white : c.g1);
      if (i) g.dgrad(b.x, b.y, b.w, b.h, c.white, c.skyA, true, 0, 1.2); else g.dgrad(b.x, b.y, b.w, b.h, c.g1, c.g2, true, 0, 1.1);
      const hot = i === 1, col = hot ? c.accent : c.g3, lw = Math.round(b.w * 0.5), gy = b.y + b.h - 13;
      // Ground strip: flowers in the good version, bare dirt and puddles in the other.
      for (let x = 0; x < b.w; x++) { const ry = gy - Math.round(1.6 * Math.sin(x * 0.15 + i)); g.rect(b.x + x, ry, 1, b.y + b.h - ry, hot ? c.lime : c.g2); g.px(b.x + x, ry, c.ink); }
      for (let k = 0; k < 9; k++) {
        const fx = b.x + 8 + (k * (b.w - 16)) / 8, sw = Math.round(Math.sin(t * 2 + k * 1.1) * 1.3);
        if (hot) { g.line(fx, gy + 2, fx + sw, gy - 6 - (k % 3) * 2, c.ink); g.disc(fx + sw, gy - 7 - (k % 3) * 2, 2, [c.red, c.yellow, c.magenta][k % 3]); g.px(fx + sw, gy - 7 - (k % 3) * 2, c.white); }
        else if (k % 3 === 1) g.ellRing(fx, gy + 5, 5 + Math.round(Math.sin(t * 2 + k)), 1, c.blue);
      }
      // Left column: label, number, meter.
      g.text(label, b.x + 8, b.y + 14, 14, hot ? c.accent : c.ink, { sh: hot ? c.ink : undefined });
      const numSize = Math.min(70, Math.floor(b.h * 0.4)), ny = b.y + 24 + numSize * 0.55;
      g.text(fmtNum(value * q, d), b.x + 8, ny, numSize, col, { sh: c.ink });
      const my = Math.round(b.y + b.h * 0.6), mw = lw - 6, segs = 12, on = Math.round(segs * (value / max) * ease(p * 1.3));
      for (let k = 0; k < segs; k++) { const sx = b.x + 8 + Math.round((k * mw) / segs), sw = Math.floor(mw / segs) - 1; g.rect(sx, my, sw, 13, k < on ? (hot ? c.accent : c.g2) : c.white); g.frame(sx, my, sw, 13, c.ink); if (k < on) g.rect(sx + 1, my + 1, Math.max(1, sw - 2), 3, c.white, 0.6); }
      // Tokens standing on the ground.
      const cnt = clamp(Math.round(value), 1, 14), tcols = Math.max(3, Math.min(7, Math.floor((lw - 4) / 16)));
      for (let k = 0; k < cnt; k++) {
        const col2 = k % tcols, row = Math.floor(k / tcols), tx = b.x + 8 + col2 * 16, ty = gy - 4 - (row + 1) * 15 + Math.round(Math.sin(t * 3 + k * 1.7) * (hot ? 1.5 : 0.5));
        if (k / cnt > q + 0.05) continue;
        g.rect(tx, ty, 14, 14, hot ? [c.yellow, c.lime, c.sky, c.orange, c.magenta][k % 5] : c.g2); g.frame(tx, ty, 14, 14, c.ink); g.rect(tx + 2, ty + 2, 5, 2, c.white, 0.8);
      }
      // Right column: weather.
      const wx = b.x + lw + (b.w - lw) / 2 + 4, wy = b.y + b.h * 0.36;
      if (hot) {
        sunburst(g, wx, wy, 20, 38, 12, t * 0.5, c.yellow, 0.85); g.disc(wx, wy, 19, c.yellow); g.ring(wx, wy, 19, c.ink, 1); g.disc(wx - 6, wy - 4, 2, c.ink); g.disc(wx + 6, wy - 4, 2, c.ink);
        for (let k = -5; k <= 5; k++) g.px(wx + k, wy + 9 - Math.round((k * k) / 7), c.ink);
        g.disc(wx - 11, wy + 3, 3, c.magenta, 0.5); g.disc(wx + 11, wy + 3, 3, c.magenta, 0.5);
        for (let k = 0; k < 5; k++) twinkle(g, wx + Math.cos(t * 0.8 + k * 1.3) * 42, wy + Math.sin(t * 1.1 + k * 1.9) * 26, t * 2 + k * 0.4, [c.accent, c.sky, c.lime, c.orange, c.white][k]);
      } else {
        cloud(g, wx, wy - 6, 2, c.g2, c.g3); g.ellRing(wx, wy - 2, 26, 8, c.ink);
        for (let k = 0; k < 9; k++) { const ph = (t * 1.1 + k / 9) % 1, rx = wx - 26 + k * 6 + Math.round(ph * 2); g.rect(rx, wy + 12 + ph * 44, 1, 4, c.blue); g.px(rx - 1, wy + 16 + ph * 44, c.sky); }
      }
      g.clipSet(old);
    });
    // The "vs" burst between the cards.
    const mx = tall ? A.x + A.w / 2 : A.x + wcard + gap / 2, my2 = tall ? A.y + hcard + gap / 2 : y0 + hcard / 2, vq = ease(span(p, 0.35, 0.7));
    if (vq > 0) {
      const R = Math.round(17 * vq + Math.sin(t * 6) * 1);
      sunburst(g, mx, my2, R * 0.6, R * 1.35, 10, -t * 0.9, c.yellow); g.disc(mx, my2, R, c.accent); g.ring(mx, my2, R, c.ink, 2);
      g.text("vs", mx, my2 + 1, Math.round(15 * vq), X.S.look.onAccent, { align: "c" });
    }
    const pos = wander(t, [[A.x + wcard * 0.5, y0 + hcard * 0.6], [mx, my2 + 24], [A.x + (tall ? 0.5 * wcard : wcard + gap + wcard * 0.5), tall ? A.y + hcard + gap + hcard * 0.6 : y0 + hcard * 0.6]], 1.6);
    cursor(X, "arrow", pos.x, pos.y, { click: pos.click, k: pos.k });
  }

  // ---- stage: the window, plus the title and closing pages ---------------------------------------------
  function titleArt(X) {
    const { g, c, L, t, T } = X, V = L.view;
    g.setClip(V.x, V.y, V.w, V.h);
    const hz = Math.round(V.y + V.h * (L.tall ? 0.7 : 0.76)), a1 = Math.round(V.h * 0.36);
    g.dgrad(V.x, V.y, V.w, a1, c.skyB, c.skyA, true, 0, 1);
    g.dgrad(V.x, V.y + a1, V.w, hz - V.y - a1, c.skyC, c.skyB, true, 0, 1);
    const sx = V.x + V.w * (L.tall ? 0.7 : 0.72), sy = hz - 4 + 3 * Math.sin(t * 0.5);
    sunburst(g, sx, sy, 28, 70, 20, t * 0.12, c.yellow, 0.3); sunburst(g, sx, sy, 28, 52, 20, -t * 0.09 + 0.1, c.orange, 0.3);
    g.disc(sx, sy, 28, c.orange); g.disc(sx, sy, 26, c.yellow); g.disc(sx - 6, sy - 7, 17, c.white, 0.5);
    for (let i = 0; i < 5; i++) { const x = V.x - 30 + ((hsh(i, 1, 41) * 1000 + t * (3 + i * 1.3)) % (V.w + 60)), y = V.y + 12 + hsh(i, 2, 41) * V.h * 0.32; cloud(g, x, y, 0.8 + hsh(i, 3, 41) * 0.9, c.white, c.g1); }
    for (let i = 0; i < 3; i++) {
      const x = V.x - 15 + ((t * 14 * (0.8 + i * 0.2) + i * 80) % (V.w + 30)), y = V.y + V.h * 0.17 + Math.sin(t * 1.7 + i) * 3 + i * 9, w = Math.floor(t * 5 + i) % 2;
      g.path([[x - 5, y + (w ? -3 : 1)], [x, y], [x + 5, y + (w ? -3 : 1)]], c.ink, 1);
    }
    // Hills and sea.
    for (let x = 0; x < V.w; x++) { const ry = hz - 6 - 10 * Math.sin(x * 0.03 + 1) - 6 * Math.sin(x * 0.071 + 2); g.rect(V.x + x, ry, 1, hz + 4 - ry, c.hillFar); g.px(V.x + x, ry, c.hillMid); }
    g.rect(V.x, hz + 4, V.w, V.y + V.h - hz - 4, c.sea1);
    g.dgrad(V.x, hz + 4, V.w, V.y + V.h - hz - 4, c.sea2, c.sea1, true, 0, 1);
    for (let k = 0; k < 9; k++) { const y = hz + 8 + k * 7 + k * k * 0.3; if (y > V.y + V.h) break; g.line(V.x, y, V.x + V.w, y, c.white, 1, 1, [5 + k, 8 + k, -Math.floor(t * (6 + k * 1.2))]); }
    const n = Math.round(30 * (0.4 + 0.6 * T)); for (let i = 0; i < n; i++) if (hsh(Math.floor(t * 5) + i, i, 6) > 0.5) twinkle(g, V.x + hsh(i, 1, 44) * V.w, hz + 10 + hsh(i, 2, 44) * (V.y + V.h - hz - 14), hsh(Math.floor(t * 5), i, 8) * 4, c.white);
    // Sailboat.
    const bx = V.x + V.w * 0.42 + 14 * Math.sin(t * 0.3), by = hz + 30 + Math.sin(t * 1.3) * 1.6, rock = Math.sin(t * 1.3) * 0.5;
    g.poly([[bx - 18, by], [bx + 18, by], [bx + 12, by + 8], [bx - 12, by + 8]], c.brown); g.outline([[bx - 18, by], [bx + 18, by], [bx + 12, by + 8], [bx - 12, by + 8]], c.ink);
    g.rect(bx - 1, by - 34, 2, 34, c.ink);
    g.poly([[bx + 2, by - 32 + rock], [bx + 2, by - 4], [bx + 24 + Math.sin(t * 2) * 1.5, by - 4]], c.accent); g.outline([[bx + 2, by - 32], [bx + 2, by - 4], [bx + 24, by - 4]], c.ink);
    g.poly([[bx - 3, by - 28], [bx - 3, by - 4], [bx - 16, by - 4]], c.white); g.outline([[bx - 3, by - 28], [bx - 3, by - 4], [bx - 16, by - 4]], c.ink);
    g.rect(bx + 1, by - 36, 7, 3, c.red);
    g.line(bx - 20, by + 10, bx + 20, by + 10, c.white, 1, 1, [3, 3, Math.floor(t * 8)]);
    // Foreground banks with flowers.
    for (const [x0, w0] of [[V.x, V.w * 0.2], [V.x + V.w * 0.84, V.w * 0.16]]) {
      for (let x = 0; x < w0; x++) { const ry = V.y + V.h - 16 - 10 * Math.sin((x / w0) * Math.PI) + 4 * Math.sin(x * 0.2); g.rect(x0 + x, ry, 1, V.y + V.h - ry, c.hillNear); g.px(x0 + x, ry, c.ink); }
      for (let i = 0; i < 6; i++) { const fx = x0 + 6 + (i * (w0 - 12)) / 5, fy = V.y + V.h - 20 - 6 * Math.sin((i / 5) * Math.PI) + (i % 2) * 3, sw = Math.round(Math.sin(t * 2 + i * 1.3 + x0) * 1.4); g.line(fx, fy + 6, fx + sw, fy, c.ink); g.disc(fx + sw, fy - 1, 2, [c.red, c.yellow, c.magenta][i % 3]); g.px(fx + sw, fy - 1, c.white); }
    }
    // Airbrush haze around the sun and a spray cursor roaming over it.
    const seed = Math.floor(t * 10);
    g.spray(sx, sy - 6, 60, c.yellow, Math.round(110 * (0.4 + 0.6 * T)), seed);
    const pos = wander(t, [[sx - 40, sy - 30], [sx, sy - 56], [sx + 44, sy - 24], [sx + 10, sy + 6]], 1.4);
    g.spray(pos.x - 6, pos.y - 7, 12, c.accent, 24, seed + 3);
    cursor(X, "spray", pos.x, pos.y, { color: c.accent });
  }
  function closingArt(X, S) {
    const { g, c, L, t, T } = X, V = L.view, C = memo(S);
    g.setClip(V.x, V.y, V.w, V.h);
    g.rect(V.x, V.y, V.w, V.h, c.teal); g.rect(V.x, V.y, V.w, V.h, c.green, 0.5);
    for (let y = V.y; y < V.y + V.h; y += 2) for (let x = V.x + (y % 4 ? 1 : 0); x < V.x + V.w; x += 2) g.px(x, y, c.hillNear);
    for (let i = 0; i < 7; i++) {
      const cx = V.x + V.w * [0.1, 0.9, 0.3, 0.72, 0.5, 0.06, 0.94][i], cy = V.y + V.h * [0.16, 0.14, 0.88, 0.86, 0.1, 0.8, 0.78][i], per = 2.2 + (i % 4) * 0.3, k = ((t + i * 0.7) % per) / per, R = 6 + 44 * ease(k), col = [c.yellow, c.magenta, c.sky, c.lime, c.orange, c.white, c.accent][i];
      for (let s = 0; s < 20; s++) { const a = (s * TAU) / 20 + i, rr = R * (0.85 + 0.15 * (s % 2)), sx2 = cx + Math.cos(a) * rr, sy2 = cy + Math.sin(a) * rr + k * k * 12; if (k < 0.85 || s % 2) { g.line(cx + Math.cos(a) * rr * 0.72, cy + Math.sin(a) * rr * 0.72 + k * k * 8, sx2, sy2, col, 1); g.rect(sx2 - 1, sy2 - 1, 3, 3, col); g.rect(cx + Math.cos(a) * rr * 0.8, cy + Math.sin(a) * rr * 0.8 + k * k * 9, 2, 2, c.white); } }
      if (k < 0.12) g.disc(cx, cy, 8 * (1 - k * 8), c.white); else if (k < 0.5) g.ring(cx, cy, R * 0.45, col, 1);
    }
    for (let k = 0; k < 8; k++) { const o = ((t * 9 + k * 34) % 300) - 40; g.poly([[V.x + o, V.y + V.h], [V.x + o + 12, V.y + V.h], [V.x + o + 12 + V.h * 0.5, V.y], [V.x + o + V.h * 0.5, V.y]], c.sky, 0.22); }
    for (let i = 0; i < 48; i++) { const x = V.x + hsh(i, 1, 51) * V.w + Math.sin(t * 2 + i) * 3, y = V.y + ((hsh(i, 2, 51) * V.h + t * (14 + hsh(i, 3, 51) * 18)) % (V.h + 8)) - 4; g.rect(x, y, 2, 3 + (i % 2), [c.yellow, c.magenta, c.sky, c.white, c.orange, c.lime][i % 6]); }
    // Floppy disks bobbing in the margins.
    for (let i = 0; i < 3; i++) {
      const x = V.x + V.w * [0.14, 0.5, 0.86][i], y = V.y + V.h * [0.9, 0.08, 0.9][i] + Math.sin(t * 1.6 + i * 2) * 3;
      g.rect(x - 8, y - 8, 17, 17, c.blue); g.frame(x - 8, y - 8, 17, 17, c.ink); g.rect(x - 5, y - 8, 11, 7, c.g1); g.rect(x - 4, y + 1, 9, 8, c.white); g.rect(x + 2, y - 7, 2, 5, c.ink);
    }
    const hb = headBox(C, S, "closing"), px = L.px;
    const pr = { x: Math.max(V.x + 4, Math.round((hb.x - 12) / px)), y: Math.max(V.y + 4, Math.round(hb.y / px) - 19), w: 0, h: 0 };
    pr.w = Math.min(V.x + V.w - 4, Math.round((hb.x + hb.w + 18) / px)) - pr.x; pr.h = Math.min(V.y + V.h - 4, Math.round((hb.y + hb.h) / px) + 30) - pr.y;
    const b = winFrame(X, pr, "Dabber says", c.panel);
    const by = b.y + b.h - 17;
    g.rect(b.x + 6, by, 26, 11, c.white); g.frame(b.x + 6, by, 26, 11, c.ink);
    g.sprite(["XXXXXXXXX", "X.rrrrr.X", "X.......X", "X.XXXXX.X", "X.X...X.X", "X.XXXXX.X", "XXXXXXXXX"], { X: c.ink, ".": c.g1, r: c.red }, b.x + 8, by + 2 - 1);
    const pw = Math.max(40, b.w - 110);
    g.bevel(b.x + 38, by + 1, pw, 10, c.white, c.hi, c.lo, true);
    for (let k = 0; k < Math.floor((pw - 4) / 5); k++) g.rect(b.x + 40 + k * 5, by + 3, 4, 6, (k + Math.floor(t * 8)) % 9 === 0 ? c.white : c.accent);
    const press = Math.floor(t * 0.9) % 3 === 0 && (t * 0.9) % 1 > 0.5;
    g.bevel(b.x + b.w - 50, by - 1, 42, 13, c.chrome, c.hi, c.lo, press); g.text("OK", b.x + b.w - 29 + (press ? 1 : 0), by + 6 + (press ? 1 : 0), 9, c.ink, { align: "c" });
    g.frame(b.x + b.w - 52, by - 3, 46 + 4, 17, c.ink, 1);
    g.clipSet(V ? [V.x, V.y, V.x + V.w, V.y + V.h] : [0, 0, g.w, g.h]);
    for (let i = 0; i < 10; i++) twinkle(g, V.x + hsh(i, 1, 61) * V.w, V.y + hsh(i, 2, 61) * V.h, t * 1.6 + i * 0.37, i % 2 ? c.white : c.yellow);
    void T;
  }
  function stage(ctx, S, info) {
    if (!S.paint) return;
    const C = memo(S), P = S.look.pal, c = packPal(P, S.accent), g = C.stage;
    g.clear();
    const X = { S, ctx, C, g, P, c, L: C.L, t: info.t, T: S.look.texture, tall: S.tall, px: C.px };
    const sc = info.scene;
    drawChrome(X, sc || (info.t > 0.5 ? "closing" : "title"));
    const V = C.L.view;
    g.setClip(V.x, V.y, V.w, V.h);
    const closing = sc === "closing" || (!sc && info.t > 0.5);
    if (sc === "title" || (!sc && !closing) || (info.index === 1 && info.local < info.change + 0.05 && sc !== "closing")) titleArt(X);
    else if (closing) closingArt(X, S);
    else g.rect(V.x, V.y, V.w, V.h, c.page);
    g.clipSet([0, 0, g.w, g.h]);
    g.present(ctx, C.px, S.look.onebit ? [pk(P.ink), pk(P.white)] : null);
  }

  const css = (accent, look) => `
    .display { font-family: ${HEADF}; font-weight: 900; letter-spacing: 0.005em; text-shadow: 3px 3px 0 ${accent}; }
    .kicker { font-family: ${FONT}; font-weight: 800; letter-spacing: 0.12em; background: ${accent}; color: ${look.onAccent}; padding: 0.14em 0.6em 0.12em; align-self: flex-start; text-shadow: none; box-shadow: 3px 3px 0 ${look.ink}; }
  `;

  const paletteTokens = (P, extra) => ({ bg: P.page, panel: P.panel, ink: P.ink, muted: P.g3, rule: P.ink, track: P.g1, pal: P, textShadow: () => "none", backdrop: () => P.page, ...extra });
  return {
    ...paletteTokens(ORIG, {}),
    accent: "#e8247e", onAccent: "#ffffff",
    display: HEADF, displayWeight: 900, displayTracking: "0.005em", body: FONT, bodyWeight: 700, figures: FONT, radius: 0,
    motion: "type", change: "grid", kit: { line: 3, fill: "solid", panel: "fill" },
    keepArt: true, overlap: true,
    palettes: {
      light: { ...paletteTokens(LIGHT, {}), accent: "#e0529a", onAccent: "#ffffff" },
      dark: { ...paletteTokens(DARK, {}), accent: "#ff5cc0", onAccent: "#1c1840" },
      mono: { ...paletteTokens(MONO, {}), accent: "#000000", onAccent: "#ffffff", onebit: true },
    },
    css,
    paint: (ctx, W, H) => { ctx.clearRect(0, 0, W, H); },
    stage,
    scenes: { chart: sceneOf("chart", drawChart), object: sceneOf("object", drawObject), people: sceneOf("people", drawPeople), process: sceneOf("process", drawProcess), compare: sceneOf("compare", drawCompare) },
  };
});
