// Beige Desktop: an invented late-90s putty-beige desktop. A dithered dusk wallpaper, bevelled chrome windows,
// a bitmap face drawn pixel by pixel, a taskbar with a ticking clock, desktop icons, and a cursor that opens,
// clicks and minimises every scene's window. All art is drawn on a logical grid of 3 px cells (640x360 at
// 1080p) so every edge stays aliased. Scenes cross by minimising one window into the taskbar while the next
// opens out of its button. Frames are pure functions of time; seeded noise only.
window.DreamcutMotion.register("beige-desktop", ({ rng }) => {
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const R = (g, x, y, w, h, c) => { if (w <= 0 || h <= 0) return; g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

  // ---- colour --------------------------------------------------------------------------------------
  const rgbOf = (hex) => { const n = parseInt(String(hex).slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const hx = (a) => "#" + a.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
  const mixc = (a, b, t) => { const A = rgbOf(a), B = rgbOf(b); return hx([lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)]); };

  const BASE = {
    chrome: "#d5ccb6", hi: "#fffdf3", lite: "#ece5d2", sh: "#9b927d", dk: "#47412f", ink: "#1d1a14", paper: "#faf6e8", grid: "#d7cfb8",
    titleA: "#59296d", titleB: "#a9498b", titleI: "#847c69", titleJ: "#b8b09b", titleT: "#fff7e2", sel: "#2c3b94", selT: "#ffffff",
    desk: ["#26325b", "#2e406f", "#3a5181", "#4966a0", "#5f80ae", "#7c9bc4"], star: "#d2ddf3",
    lcd: "#b6c695", lcdInk: "#223019", c: ["#3e8e5c", "#e0a82e", "#c7466b", "#3b7ec2"],
    yellow: "#f0c24a", yellowD: "#b0832a", blue: "#2f4a9a", red: "#c93c2e", green: "#3a9a52", skin: ["#f2c9a0", "#dba477", "#a9724b", "#704729"],
    shirt: ["#3b7ec2", "#c7466b", "#3e8e5c", "#e0a82e", "#7a4fb0", "#d0702f"],
  };
  const pal = (o) => ({ ...BASE, ...o });
  const LOOK_ORIG = { bg: "#26325b", panel: "#faf6e8", ink: "#1d1a14", muted: "#47412f", accent: "#e0582f", onAccent: "#ffffff", rule: "#9b927d", track: "#d7cfb8", pal: pal({}) };
  const LOOK_LIGHT = { bg: "#5f9c8e", panel: "#ffffff", ink: "#1d1a14", muted: "#47412f", accent: "#d9461f", onAccent: "#ffffff", rule: "#9b927d", track: "#e0d9c4",
    pal: pal({ chrome: "#e8e1cc", hi: "#ffffff", lite: "#f4efe0", sh: "#a8a08a", paper: "#ffffff", grid: "#e0d9c4", titleA: "#7b3f8c", titleB: "#d06aa5", sel: "#3a4cb5",
      desk: ["#5a9788", "#6aa698", "#7cb4a7", "#90c2b6", "#a6d0c6", "#c0e0d8"], star: "#ffffff", lcd: "#c4d4a2" }) };
  const LOOK_DARK = { bg: "#05070f", panel: "#1f1c19", ink: "#f2e9d3", muted: "#cfc4aa", accent: "#ff7a45", onAccent: "#1d1a14", rule: "#24211d", track: "#2e2a26",
    pal: pal({ chrome: "#3d3934", hi: "#827a6c", lite: "#5c564c", sh: "#24211d", dk: "#0a0908", ink: "#f2e9d3", paper: "#1c1916", grid: "#2f2b26", titleA: "#7e3f95", titleB: "#c8549f", titleI: "#4b463e", titleJ: "#68625a",
      sel: "#4658cc", desk: ["#04060d", "#080d1c", "#0d1530", "#142043", "#1c2d5a", "#26407a"], star: "#9fb4e8", lcd: "#1f2c1a", lcdInk: "#a6e98a", c: ["#46a870", "#e8b43c", "#d9547c", "#4a8fd8"], yellow: "#d9a93a", yellowD: "#8c6a1f" }) };
  const LOOK_MONO = { bg: "#1c1c1c", panel: "#f4f4f4", ink: "#111111", muted: "#333333", accent: "#101010", onAccent: "#ffffff", rule: "#8a8a8a", track: "#dddddd",
    pal: pal({ chrome: "#cecece", hi: "#ffffff", lite: "#e7e7e7", sh: "#8a8a8a", dk: "#2b2b2b", ink: "#111111", paper: "#f4f4f4", grid: "#d4d4d4", titleA: "#1e1e1e", titleB: "#6a6a6a", titleI: "#808080", titleJ: "#b0b0b0", titleT: "#ffffff", sel: "#1e1e1e",
      desk: ["#161616", "#262626", "#3a3a3a", "#525252", "#6c6c6c", "#8c8c8c"], star: "#e0e0e0", lcd: "#cfcfcf", lcdInk: "#161616", c: ["#505050", "#8a8a8a", "#2a2a2a", "#b4b4b4"],
      yellow: "#bdbdbd", yellowD: "#707070", blue: "#3a3a3a", red: "#222222", green: "#555555", skin: ["#e4e4e4", "#c4c4c4", "#8a8a8a", "#505050"], shirt: ["#505050", "#8a8a8a", "#2a2a2a", "#b4b4b4", "#666666", "#9a9a9a"] }) };

  // ---- the bitmap face: 5x7 capitals, digits and marks ---------------------------------------------
  const FONT = {
    A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [28, 18, 17, 17, 17, 18, 28], E: [31, 16, 16, 30, 16, 16, 31],
    F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12],
    K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31], M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
    P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
    U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 27, 17], X: [17, 17, 10, 4, 10, 17, 17], Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
    0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31], 3: [30, 1, 1, 14, 1, 1, 30], 4: [2, 6, 10, 18, 31, 2, 2],
    5: [31, 16, 30, 1, 1, 17, 14], 6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14], 9: [14, 17, 17, 15, 1, 2, 12],
    ".": [0, 0, 0, 0, 0, 12, 12], ",": [0, 0, 0, 0, 12, 4, 8], ":": [0, 12, 12, 0, 12, 12, 0], ";": [0, 12, 12, 0, 12, 4, 8], "!": [4, 4, 4, 4, 4, 0, 4], "?": [14, 17, 1, 2, 4, 0, 4],
    "-": [0, 0, 0, 31, 0, 0, 0], "+": [0, 4, 4, 31, 4, 4, 0], "/": [1, 1, 2, 4, 8, 16, 16], "%": [24, 25, 2, 4, 8, 19, 3], "'": [4, 4, 8, 0, 0, 0, 0], '"': [10, 10, 10, 0, 0, 0, 0],
    "(": [2, 4, 8, 8, 8, 4, 2], ")": [8, 4, 2, 2, 2, 4, 8], "#": [10, 10, 31, 10, 31, 10, 10], "&": [12, 18, 20, 8, 21, 18, 13], "=": [0, 0, 31, 0, 31, 0, 0], "*": [0, 4, 21, 14, 21, 4, 0],
    ">": [8, 4, 2, 1, 2, 4, 8], "<": [2, 4, 8, 16, 8, 4, 2], _: [0, 0, 0, 0, 0, 0, 31], "@": [14, 17, 23, 21, 23, 16, 14], $: [4, 15, 20, 14, 5, 30, 4], "−": [0, 0, 0, 31, 0, 0, 0], " ": [0, 0, 0, 0, 0, 0, 0],
  };
  const RUNS = {};
  const runsOf = (ch) => {
    let r = RUNS[ch];
    if (r) return r;
    const rows = FONT[ch] || FONT["?"];
    r = [];
    for (let y = 0; y < 7; y++) { let x = 0; while (x < 5) { if (rows[y] & (16 >> x)) { let l = 1; while (x + l < 5 && rows[y] & (16 >> (x + l))) l++; r.push([x, y, l]); x += l; } else x++; } }
    return (RUNS[ch] = r);
  };
  const tw = (s, sc) => (String(s).length ? String(s).length * 6 * sc - sc : 0);
  function txt(F, s, x, y, sc, col, o = {}) {
    s = String(s ?? "").toUpperCase();
    const n = s.length, q = o.q ?? 1;
    if (!n || q <= 0) return 0;
    const g = F.g, w = n * 6 * sc - sc, show = q >= 1 ? n : Math.ceil(n * q);
    let x0 = o.align === "center" ? x - Math.floor(w / 2) : o.align === "right" ? x - w : x;
    x0 = Math.round(x0); y = Math.round(y);
    if (o.base === "mid") y -= Math.floor((7 * sc) / 2);
    for (const pass of o.shadow ? [[1, 1, o.shadow], [0, 0, col]] : [[0, 0, col]]) {
      g.fillStyle = pass[2];
      g.beginPath();
      for (let i = 0; i < show; i++) {
        const cx = x0 + i * 6 * sc + pass[0], c = s[i];
        if (c === " ") continue;
        for (const [rx, ry, rl] of runsOf(c)) g.rect(cx + rx * sc, y + ry * sc + pass[1], rl * sc, sc);
      }
      g.fill();
    }
    return w;
  }
  const wrapWords = (words, mc) => {
    const lines = [];
    let cur = "";
    for (const w of words) {
      if (!cur) cur = w; else if ((cur + " " + w).length <= mc) cur += " " + w; else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  // ---- pixel primitives ----------------------------------------------------------------------------
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const PATS = new Map();
  function pat(g, col, lvl) {
    const key = col + "|" + lvl;
    let p = PATS.get(key);
    if (!p) {
      const c = document.createElement("canvas");
      c.width = c.height = 4;
      const x = c.getContext("2d");
      x.fillStyle = col;
      for (let i = 0; i < 16; i++) if (BAYER[i] < lvl) x.fillRect(i % 4, (i / 4) | 0, 1, 1);
      p = g.createPattern(c, "repeat");
      PATS.set(key, p);
    }
    return p;
  }
  const dith = (g, x, y, w, h, col, lvl) => { if (lvl <= 0 || w <= 0 || h <= 0) return; g.fillStyle = pat(g, col, Math.round(lvl)); g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  // Raised or sunken two-line bevel.
  function bev(F, x, y, w, h, sunk, fillc) {
    const P = F.P, g = F.g;
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const [o1, o2, i1, i2] = sunk ? [P.sh, P.hi, P.dk, P.lite] : [P.hi, P.dk, P.lite, P.sh];
    if (fillc !== null) R(g, x, y, w, h, fillc ?? P.chrome);
    R(g, x, y, w - 1, 1, o1); R(g, x, y, 1, h - 1, o1); R(g, x, y + h - 1, w, 1, o2); R(g, x + w - 1, y, 1, h, o2);
    R(g, x + 1, y + 1, w - 3, 1, i1); R(g, x + 1, y + 1, 1, h - 3, i1); R(g, x + 1, y + h - 2, w - 2, 1, i2); R(g, x + w - 2, y + 1, 1, h - 2, i2);
  }
  const outline = (g, x, y, w, h, c) => { R(g, x, y, w, 1, c); R(g, x, y + h - 1, w, 1, c); R(g, x, y, 1, h, c); R(g, x + w - 1, y, 1, h, c); };
  // Pixel line, batched into one path so it stays aliased and cheap.
  function bline(g, x0, y0, x1, y1, col, t = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, guard = 0;
    g.fillStyle = col;
    g.beginPath();
    for (;;) {
      g.rect(x0, y0, t, t);
      if ((x0 === x1 && y0 === y1) || guard++ > 2000) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    g.fill();
  }
  // A dotted rectangle whose dashes crawl (selection marquee).
  function ants(g, x, y, w, h, t, c1, c2) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const ph = Math.floor(t * 10);
    outline(g, x, y, w, h, c2);
    g.fillStyle = c1;
    g.beginPath();
    let i = 0;
    const put = (px, py) => { if (((i++ + ph) >> 1) & 1) g.rect(px, py, 1, 1); };
    for (let k = 0; k < w; k++) put(x + k, y);
    for (let k = 1; k < h; k++) put(x + w - 1, y + k);
    for (let k = w - 2; k >= 0; k--) put(x + k, y + h - 1);
    for (let k = h - 2; k > 0; k--) put(x, y + k);
    g.fill();
  }
  // A dotted line whose dots travel from a to b.
  function trail(g, ax, ay, bx, by, t, col, gap = 4) {
    const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.floor(L / gap));
    g.fillStyle = col;
    g.beginPath();
    const off = (t * 9) % gap;
    for (let i = 0; i < n; i++) { const k = (i * gap + off) / L; if (k > 1) continue; g.rect(Math.round(lerp(ax, bx, k)), Math.round(lerp(ay, by, k)), 1, 1); }
    g.fill();
  }
  const dom = (id) => { const el = typeof document !== "undefined" && document.getElementById(id); return el ? el.textContent || "" : ""; };
  const fmt = (v, pre = "", suf = "") => window.DreamcutMotion.formatNumber(v, 0, pre, suf);
  const pipe = (s) => String(s || "");

  // ---- the scene plan: which scenes play, so the taskbar can hold a button for each ----------------
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  const DEF_HOLD = { title: 2.4, chart: 3.4, object: 3.6, people: 3.2, process: 3.6, compare: 3.2, closing: 2.4 };
  const NAMES = { title: "WELCOME", chart: "PLOTTER", object: "DESK", people: "LOBBY", process: "WIZARD", compare: "SCORES", closing: "GOODBYE" };
  function plan() {
    const c = (window.__dreamcut && window.__dreamcut.controls) || {};
    const ids = ORDER.filter((id) => Number(c[id + "_hold"] ?? DEF_HOLD[id]) > 0);
    return { ids, ctl: c, hold: (id) => Number(c[id + "_hold"] ?? DEF_HOLD[id]) };
  }

  // ---- frame context: logical grid, palette, layout ------------------------------------------------
  function frame(ctx, S) {
    const px = Math.max(1, Math.round(3 * S.u));
    const LW = Math.ceil(S.W / px), LH = Math.ceil(S.H / px);
    const shape = S.tall ? "tall" : S.wide ? "wide" : "square";
    const F = { g: ctx, S, P: S.look.pal || BASE, acc: S.accent, px, LW, LH, shape, tall: S.tall, wide: S.wide, plan: plan() };
    const tbH = 17;
    F.tb = { x: 0, y: LH - tbH, w: LW, h: tbH };
    F.win = shape === "wide" ? { x: 38, y: 8, w: LW - 76, h: LH - tbH - 6 - 8 }
      : shape === "tall" ? { x: 10, y: 60, w: LW - 20, h: LH - tbH - 6 - 60 }
      : { x: 8, y: 8, w: LW - 16, h: LH - tbH - 6 - 8 };
    ctx.save();
    ctx.setTransform(px, 0, 0, px, 0, 0);
    ctx.imageSmoothingEnabled = false;
    return F;
  }
  const done = (F) => F.g.restore();
  // Geometry of a window's parts from its outer rect.
  function parts(r, o = {}) {
    const tb = { x: r.x + 3, y: r.y + 3, w: r.w - 6, h: 13 };
    const mb = o.menu ? { x: tb.x, y: tb.y + tb.h + 1, w: tb.w, h: 11 } : null;
    const st = o.status ? { x: tb.x, y: r.y + r.h - 3 - 11, w: tb.w, h: 11 } : null;
    const top = (mb ? mb.y + mb.h : tb.y + tb.h) + 1;
    const bottom = st ? st.y - 1 : r.y + r.h - 3;
    return { tb, mb, st, cl: { x: tb.x, y: top, w: tb.w, h: bottom - top } };
  }
  const btnRect = (F, id) => {
    const i = Math.max(0, F.plan.ids.indexOf(id)), n = Math.max(1, F.plan.ids.length);
    const x0 = 58, x1 = F.LW - (F.tall ? 46 : 64) - 2, bw = Math.min(70, Math.floor((x1 - x0) / n) - 2);
    return { x: x0 + i * (bw + 2), y: F.tb.y + 3, w: bw, h: 12 };
  };

  // ---- sprites -------------------------------------------------------------------------------------
  function disc(g, cx, cy, r, c) {
    g.fillStyle = c;
    g.beginPath();
    for (let dy = -r; dy <= r; dy++) { const dx = Math.floor(Math.sqrt(r * r + 0.5 - dy * dy)); g.rect(cx - dx, cy + dy, dx * 2 + 1, 1); }
    g.fill();
  }
  // 16x16 desktop icons.
  function icon(F, kind, x, y, t = 0) {
    const g = F.g, P = F.P, ink = P.ink;
    x = Math.round(x); y = Math.round(y);
    if (kind === "folder") {
      R(g, x + 1, y + 3, 6, 3, P.yellowD); R(g, x + 1, y + 5, 14, 10, P.yellow); R(g, x + 1, y + 5, 14, 1, mixc(P.yellow, "#ffffff", 0.55)); R(g, x + 1, y + 13, 14, 2, P.yellowD);
      outline(g, x, y + 2, 16, 14, ink); R(g, x + 3, y + 8, 10, 1, P.yellowD); R(g, x + 3, y + 10, 7, 1, P.yellowD);
    } else if (kind === "disk") {
      R(g, x + 1, y + 1, 14, 14, P.blue); R(g, x + 4, y + 1, 8, 5, P.titleJ); R(g, x + 9, y + 2, 2, 3, P.blue); R(g, x + 3, y + 8, 10, 7, P.paper);
      R(g, x + 4, y + 10, 8, 1, P.sh); R(g, x + 4, y + 12, 6, 1, P.sh); outline(g, x, y, 16, 16, ink);
    } else if (kind === "bin") {
      R(g, x + 4, y + 5, 8, 10, P.titleJ); R(g, x + 3, y + 3, 10, 2, P.sh); R(g, x + 6, y + 1, 4, 2, P.sh);
      for (let i = 0; i < 3; i++) R(g, x + 6 + i * 2, y + 6, 1, 8, P.sh);
      outline(g, x + 3, y + 5, 10, 11, ink); R(g, x + 3, y + 3, 10, 1, ink);
    } else if (kind === "pad") {
      R(g, x + 2, y + 1, 12, 14, P.paper); R(g, x + 2, y + 1, 12, 3, F.acc);
      for (let i = 0; i < 4; i++) R(g, x + 4, y + 6 + i * 2, 8 - (i === 3 ? 3 : 0), 1, P.sh);
      outline(g, x + 1, y, 14, 16, ink);
    } else if (kind === "chip") {
      for (let i = 0; i < 4; i++) { R(g, x + 4 + i * 2, y, 1, 2, P.sh); R(g, x + 4 + i * 2, y + 14, 1, 2, P.sh); R(g, x, y + 4 + i * 2, 2, 1, P.sh); R(g, x + 14, y + 4 + i * 2, 2, 1, P.sh); }
      R(g, x + 2, y + 2, 12, 12, P.dk); R(g, x + 4, y + 4, 8, 8, P.sel); R(g, x + 6, y + 6, 4, 4, P.c[1]); outline(g, x + 2, y + 2, 12, 12, ink);
    } else if (kind === "cd") {
      disc(g, x + 8, y + 8, 7, P.titleJ); disc(g, x + 8, y + 8, 5, mixc(P.titleJ, "#ffffff", 0.5)); R(g, x + 3, y + 4, 4, 2, P.c[3]); R(g, x + 9, y + 10, 4, 2, P.c[2]); disc(g, x + 8, y + 8, 2, P.chrome); disc(g, x + 8, y + 8, 1, ink);
    }
  }
  // 9x9 title and taskbar marks.
  function mini(F, kind, x, y) {
    const g = F.g, P = F.P, ink = P.ink;
    x = Math.round(x); y = Math.round(y);
    if (kind === "bars") { R(g, x, y + 5, 2, 4, P.c[0]); R(g, x + 3, y + 2, 2, 7, P.c[1]); R(g, x + 6, y + 4, 2, 5, F.acc); R(g, x, y + 8, 9, 1, ink); }
    else if (kind === "pc") { R(g, x + 1, y, 7, 6, P.titleJ); R(g, x + 2, y + 1, 5, 4, P.sel); R(g, x + 3, y + 6, 3, 1, P.sh); R(g, x + 1, y + 7, 7, 2, P.chrome); outline(g, x + 1, y, 7, 6, ink); }
    else if (kind === "ppl") { R(g, x + 1, y + 1, 3, 3, P.skin[0]); R(g, x, y + 4, 5, 5, P.c[3]); R(g, x + 5, y + 2, 3, 3, P.skin[2]); R(g, x + 4, y + 5, 5, 4, P.c[1]); }
    else if (kind === "gear") { R(g, x + 1, y + 1, 7, 7, P.sh); R(g, x + 3, y + 3, 3, 3, P.chrome); for (const [a, b] of [[4, 0], [4, 8], [0, 4], [8, 4]]) R(g, x + a, y + b, 1, 1, P.sh); outline(g, x + 1, y + 1, 7, 7, ink); }
    else if (kind === "cmp") { R(g, x, y + 1, 4, 7, P.c[2]); R(g, x + 5, y + 1, 4, 7, P.c[0]); R(g, x, y + 8, 9, 1, ink); }
    else if (kind === "star") { R(g, x + 3, y, 3, 9, F.acc); R(g, x, y + 3, 9, 3, F.acc); R(g, x + 3, y + 3, 3, 3, P.yellow); }
    else if (kind === "doc") { R(g, x + 1, y, 7, 9, P.paper); R(g, x + 2, y + 2, 5, 1, P.sh); R(g, x + 2, y + 4, 5, 1, P.sh); R(g, x + 2, y + 6, 3, 1, P.sh); outline(g, x + 1, y, 7, 9, ink); }
  }
  // Dialog icons, 14x14.
  function glyph(F, kind, x, y, t = 0) {
    const g = F.g, P = F.P, ink = P.ink;
    x = Math.round(x); y = Math.round(y);
    if (kind === "warn") {
      for (let i = 0; i < 12; i++) { const fl = Math.floor(i / 2); R(g, x + 6 - fl, y + 1 + i, 2 + fl * 2, 1, P.yellow); R(g, x + 6 - fl, y + 1 + i, 1, 1, ink); R(g, x + 7 + fl, y + 1 + i, 1, 1, ink); }
      R(g, x + 1, y + 13, 13, 1, ink); R(g, x + 6, y + 5, 2, 4, ink); R(g, x + 6, y + 10, 2, 2, ink);
    } else if (kind === "info") {
      disc(g, x + 7, y + 7, 6, P.c[3]); R(g, x + 6, y + 3, 2, 2, "#ffffff"); R(g, x + 6, y + 6, 2, 5, "#ffffff");
    } else if (kind === "err") {
      disc(g, x + 7, y + 7, 6, P.red); for (let i = 0; i < 6; i++) { R(g, x + 4 + i, y + 4 + i, 2, 1, "#ffffff"); R(g, x + 9 - i, y + 4 + i, 2, 1, "#ffffff"); }
    } else if (kind === "ok") {
      disc(g, x + 7, y + 7, 6, P.green); R(g, x + 3, y + 7, 2, 2, "#ffffff"); R(g, x + 5, y + 9, 2, 2, "#ffffff"); for (let i = 0; i < 5; i++) R(g, x + 7 + i, y + 8 - i, 2, 1, "#ffffff");
    } else if (kind === "hour") {
      const sand = (t * 0.7) % 1;
      R(g, x + 2, y, 10, 1, ink); R(g, x + 2, y + 13, 10, 1, ink);
      for (let i = 0; i < 6; i++) { R(g, x + 3 + i, y + 1 + i, 8 - i * 2, 1, "#f5f0e0"); R(g, x + 3 + i, y + 12 - i, 8 - i * 2, 1, "#f5f0e0"); }
      for (let i = 0; i < 6; i++) { R(g, x + 2 + i, y + 1 + i, 1, 1, ink); R(g, x + 11 - i, y + 1 + i, 1, 1, ink); R(g, x + 2 + i, y + 12 - i, 1, 1, ink); R(g, x + 11 - i, y + 12 - i, 1, 1, ink); }
      R(g, x + 4, y + 2, 6, Math.round(3 * (1 - sand)), P.yellowD); R(g, x + 6, y + 6, 2, 3, P.yellowD); R(g, x + 5, y + 12 - Math.round(3 * sand), 4, Math.round(3 * sand) + 1, P.yellowD);
    } else if (kind === "file") {
      R(g, x + 2, y, 8, 14, P.paper); R(g, x + 8, y, 2, 2, P.sh); R(g, x + 4, y + 4, 4, 1, P.sh); R(g, x + 4, y + 6, 5, 1, P.sh); R(g, x + 4, y + 8, 3, 1, P.sh); outline(g, x + 2, y, 9, 14, ink);
    } else if (kind === "spark") {
      const k = 1 + Math.round(Math.sin(t * 6) * 0.9);
      R(g, x + 6, y + 1, 2, 12, F.acc); R(g, x + 1, y + 6, 12, 2, F.acc); R(g, x + 3, y + 3, 2, 2, P.yellow); R(g, x + 9, y + 3, 2, 2, P.yellow); R(g, x + 3, y + 9, 2, 2, P.yellow); R(g, x + 9, y + 9, 2, 2, P.yellow); R(g, x + 6 - k, y + 6 - k, 2 + k * 2, 2 + k * 2, "#ffffff");
    } else if (kind === "eye") {
      R(g, x + 1, y + 5, 12, 5, P.paper); R(g, x + 3, y + 3, 8, 2, P.paper); R(g, x + 3, y + 10, 8, 2, P.paper); outline(g, x + 1, y + 3, 12, 9, ink); R(g, x + 5, y + 5, 4, 5, P.sel); R(g, x + 6, y + 6, 2, 2, ink);
    }
  }
  // Pixel people on a 16x24 grid, drawn at integer scale s from (x, y) top-left.
  function person(F, v, x, y, s, t, o = {}) {
    const g = F.g, P = F.P, skin = P.skin[v.skin % 4], hair = v.hair, shirt = o.shirt || P.shirt[v.shirt % 6];
    const B = (a, b, w, h, c) => R(g, x + a * s, y + b * s, w * s, h * s, c);
    const blink = Math.floor(t * 1.7 + v.skin * 0.7) % 5 === 0 && ((t * 1.7 + v.skin * 0.7) % 1) < 0.16;
    // Hair behind the head.
    if (v.style === 0) B(3, 1, 10, 9, hair); else if (v.style === 1) { B(4, 2, 8, 2, hair); B(4, 0, 1, 2, hair); B(7, 0, 2, 2, hair); B(11, 0, 1, 2, hair); }
    else if (v.style === 2) { B(4, 2, 8, 3, hair); B(6, 0, 4, 3, hair); } else if (v.style === 3) { B(3, 3, 10, 2, v.cap); B(4, 1, 8, 3, v.cap); } else B(4, 2, 8, 2, hair);
    // Head, neck, shoulders and arms.
    B(4, 3, 8, 8, skin); B(7, 11, 2, 2, skin);
    B(2, 13, 12, 9, shirt); B(1, 14, 2, 6, shirt); B(13, 14, 2, 6, shirt); B(4, 13, 8, 1, mixc(shirt, "#ffffff", 0.35)); B(6, 13, 4, 2, P.paper);
    B(2, 21, 12, 1, mixc(shirt, "#000000", 0.25));
    const wave = o.wave ? Math.sin(t * 8) > 0 : false;
    if (o.wave) { B(13, 8 + (wave ? 0 : 1), 2, 6, shirt); B(13, 6 + (wave ? 0 : 1), 2, 2, skin); } else { B(1, 20, 2, 2, skin); B(13, 20, 2, 2, skin); }
    // Hair in front, face.
    if (v.style === 0) { B(3, 2, 10, 3, hair); B(3, 5, 2, 5, hair); B(11, 5, 2, 5, hair); } else if (v.style === 1) B(4, 3, 8, 1, hair);
    else if (v.style === 2) B(4, 3, 8, 1, hair); else if (v.style === 3) { B(3, 5, 11, 1, v.cap); B(4, 3, 8, 2, v.cap); } else B(4, 3, 8, 1, hair);
    if (blink) { B(5, 7, 2, 1, P.ink); B(9, 7, 2, 1, P.ink); } else { B(5, 6, 2, 2, P.ink); B(9, 6, 2, 2, P.ink); B(5, 6, 1, 1, "#ffffff"); B(9, 6, 1, 1, "#ffffff"); }
    const talk = o.talk && Math.sin(t * 11) > 0;
    if (talk) B(7, 9, 2, 2, "#7a1f1f"); else B(6, 9, 4, 1, "#8a3b2f");
    B(4, 8, 1, 1, mixc(skin, "#e0709a", 0.45)); B(11, 8, 1, 1, mixc(skin, "#e0709a", 0.45));
    if (v.acc === 1) { outline(g, x + 4.5 * s - 0.5 * s, y + 5 * s, 3.5 * s, 3 * s, P.ink); outline(g, x + 8 * s, y + 5 * s, 3.5 * s, 3 * s, P.ink); B(7, 6, 1, 1, P.ink); }
    if (v.acc === 2) { B(3, 3, 1, 5, P.dk); B(12, 3, 1, 5, P.dk); B(3, 2, 10, 1, P.dk); B(2, 6, 2, 3, P.dk); B(1, 9, 5, 1, P.dk); B(1, 8, 1, 1, P.dk); }
    if (v.acc === 3) { B(10, 15, 3, 3, P.paper); B(10, 15, 3, 1, F.acc); }
  }
  // The pointer: an arrow, or an hourglass when the machine is busy.
  const ARROW = ["X", "XX", "X.X", "X..X", "X...X", "X....X", "X.....X", "X......X", "X.......X", "X........X", "X.....XXXXX", "X..X..X", "X.X X..X", "XX  X..X", "X    X..X", "     XXXX"];
  function pointer(F, x, y, down, busy, t) {
    const g = F.g;
    x = Math.round(x); y = Math.round(y);
    if (busy) { glyph(F, "hour", x - 1, y - 1, t); return; }
    if (down) { g.fillStyle = F.P.titleT; g.fillRect(x - 3, y - 1, 2, 1); g.fillRect(x - 1, y - 3, 1, 2); g.fillRect(x - 2, y - 2, 1, 1); }
    ARROW.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) { const c = row[i]; if (c === "X") R(g, x + i, y + j, 1, 1, "#000000"); else if (c === ".") R(g, x + i, y + j, 1, 1, "#ffffff"); }
    });
  }
  function cursorAt(pts, loc) {
    const last = pts[pts.length - 1];
    let x = last.x, y = last.y;
    if (loc <= pts[0].t) { x = pts[0].x; y = pts[0].y; }
    else for (let i = 1; i < pts.length; i++) {
      if (loc < pts[i].t) {
        const a = pts[i - 1], b = pts[i], k = eio((loc - a.t) / Math.max(0.01, b.t - a.t));
        x = lerp(a.x, b.x, k); y = lerp(a.y, b.y, k) - Math.sin(k * Math.PI) * 5;
        break;
      }
    }
    const down = pts.some((p) => p.c && Math.abs(loc - p.t) < 0.14);
    return { x, y, down };
  }

  // ---- window chrome -------------------------------------------------------------------------------
  function titleBar(F, tb, title, active, kind) {
    const g = F.g, P = F.P;
    const a = active ? P.titleA : P.titleI, b = active ? P.titleB : P.titleJ, bands = 10;
    for (let i = 0; i < bands; i++) { const x0 = tb.x + Math.floor((tb.w * i) / bands), x1 = tb.x + Math.floor((tb.w * (i + 1)) / bands); R(g, x0, tb.y, x1 - x0, tb.h, mixc(a, b, Math.pow(i / (bands - 1), 1.3))); }
    if (kind) mini(F, kind, tb.x + 3, tb.y + 2);
    const room = tb.w - 14 - 38;
    txt(F, title, tb.x + (kind ? 14 : 4), tb.y + 3, 1, P.titleT, { q: Math.min(1, Math.floor((room + 1) / 6) / Math.max(1, String(title).length)) });
    const by = tb.y + 2, close = { x: tb.x + tb.w - 12, y: by, w: 10, h: 9 }, mx = { x: close.x - 12, y: by, w: 10, h: 9 }, mn = { x: mx.x - 11, y: by, w: 10, h: 9 };
    for (const r of [mn, mx, close]) bev(F, r.x, r.y, r.w, r.h, false);
    R(g, mn.x + 2, mn.y + 6, 5, 2, P.ink);
    outline(g, mx.x + 2, mx.y + 2, 6, 5, P.ink); R(g, mx.x + 2, mx.y + 2, 6, 2, P.ink);
    for (let i = 0; i < 5; i++) { R(g, close.x + 2 + i, close.y + 2 + i, 2, 1, P.ink); R(g, close.x + 6 - i, close.y + 2 + i, 2, 1, P.ink); }
    return { min: mn, max: mx, close };
  }
  // A window: bevel, title bar, optional menu and status bars, sunken paper client. Returns its parts.
  function chrome(F, r, title, o = {}) {
    const P = F.P, g = F.g;
    bev(F, r.x, r.y, r.w, r.h, false);
    const pt = parts(r, o);
    const bt = titleBar(F, pt.tb, title, o.active !== false, o.kind);
    if (pt.mb) {
      let x = pt.mb.x + 4;
      for (const m of o.menu) { txt(F, m, x, pt.mb.y + 2, 1, P.ink); x += tw(m, 1) + 9; }
      R(g, pt.mb.x, pt.mb.y + pt.mb.h, pt.mb.w, 1, P.sh);
    }
    bev(F, pt.cl.x, pt.cl.y, pt.cl.w, pt.cl.h, true, o.fill ?? P.paper);
    pt.btn = bt;
    return pt;
  }
  function statusBar(F, st, text, t, ok) {
    const P = F.P, g = F.g;
    bev(F, st.x, st.y, st.w - 78, st.h, true, P.chrome);
    txt(F, text, st.x + 4, st.y + 2, 1, P.ink);
    const mq = { x: st.x + st.w - 76, y: st.y, w: 40, h: st.h };
    bev(F, mq.x, mq.y, mq.w, mq.h, true, P.chrome);
    for (let i = 0; i < 4; i++) { const k = ((t * 2.2 + i * 0.28) % 1.2); if (k < 1) R(g, mq.x + 3 + Math.floor(k * 30), mq.y + 3, 5, 5, F.acc); }
    bev(F, st.x + st.w - 36, st.y, 36, st.h, true, P.chrome);
    txt(F, ok || "OK", st.x + st.w - 18, st.y + 2, 1, P.ink, { align: "center" });
  }
  function button(F, r, label, o = {}) {
    const P = F.P, g = F.g, sc = o.sc || 1;
    if (o.down) { bev(F, r.x, r.y, r.w, r.h, true, o.fill); } else bev(F, r.x, r.y, r.w, r.h, false, o.fill);
    const col = o.col || P.ink, off = o.down ? 1 : 0;
    if (label) txt(F, label, r.x + r.w / 2 + off, r.y + r.h / 2 - (7 * sc) / 2 + off + (sc > 1 ? 0 : 0.5), sc, col, { align: "center" });
    if (o.focus) { g.fillStyle = P.ink; g.beginPath(); for (let i = 3; i < r.w - 3; i += 2) { g.rect(r.x + i, r.y + 3, 1, 1); g.rect(r.x + i, r.y + r.h - 4, 1, 1); } for (let j = 3; j < r.h - 3; j += 2) { g.rect(r.x + 3, r.y + j, 1, 1); g.rect(r.x + r.w - 4, r.y + j, 1, 1); } g.fill(); }
  }
  // A progress bar of solid blocks.
  function meter(F, r, q, col, o = {}) {
    const g = F.g, P = F.P;
    bev(F, r.x, r.y, r.w, r.h, true, o.back ?? P.paper);
    const bw = o.block || 5, inner = r.w - 4, n = Math.floor(inner / (bw + 1)), lit = Math.round(n * clamp(q));
    for (let i = 0; i < lit; i++) R(g, r.x + 2 + i * (bw + 1), r.y + 2, bw, r.h - 4, col || P.sel);
  }
  // Headline: bitmap capitals typed into a window, last word selected once complete.
  function headline(F, cl, text, loc, o = {}) {
    const words = String(text || "").toUpperCase().split(/\s+/).filter(Boolean);
    const wmax = (o.w ?? cl.w) - 14, maxLines = o.lines ?? (F.tall ? 4 : 2);
    let sc = 2, lines = words.length ? [words.join(" ")] : [""];
    for (const s of o.scales || [4, 3, 2]) {
      const mc = Math.floor((wmax + s) / (6 * s));
      const L = wrapWords(words, mc);
      sc = s; lines = L;
      if (L.length <= maxLines && L.every((l) => l.length <= mc)) break;
    }
    const total = words.join(" ").length, lh = 7 * sc + 4;
    const tq = clamp((loc - (o.at ?? 0.04)) / Math.min(0.9, 0.15 + total * 0.022));
    const shown = Math.ceil(total * tq);
    const x0 = (o.x ?? cl.x) + 7, y0 = (o.y ?? cl.y) + 6;
    let used = 0, endX = x0, endY = y0;
    lines.forEach((line, i) => {
      const k = clamp(shown - used, 0, line.length);
      const y = y0 + i * lh;
      const full = k >= line.length;
      const lastLine = i === lines.length - 1;
      const sp = line.lastIndexOf(" ") + 1;
      if (full && lastLine && tq >= 1 && o.select !== false) {
        const wx = x0 + sp * 6 * sc, ww = tw(line.slice(sp), sc);
        R(F.g, wx - 2, y - 2, ww + 4, 7 * sc + 4, F.P.sel);
        txt(F, line.slice(0, sp), x0, y, sc, F.P.ink, { shadow: mixc(F.P.paper, F.P.ink, 0.22) });
        txt(F, line.slice(sp), wx, y, sc, F.P.selT);
      } else txt(F, line, x0, y, sc, F.P.ink, { q: k / Math.max(1, line.length), shadow: mixc(F.P.paper, F.P.ink, 0.22) });
      if (k > 0 && k <= line.length) { endX = x0 + k * 6 * sc; endY = y; }
      used += line.length + 1;
    });
    if (tq < 1 || Math.floor(loc * 2.4) % 2 === 0) { if (!(tq >= 1 && o.select !== false)) R(F.g, endX, endY, Math.max(2, sc * 3), 7 * sc, F.P.ink); }
    return { bottom: y0 + lines.length * lh - 4, sc, lines: lines.length };
  }

  // ---- the desktop world ---------------------------------------------------------------------------
  const WP = new Map();
  function wallpaper(F) {
    const key = F.LW + "x" + F.LH + F.P.desk.join("");
    let c = WP.get(key);
    if (c) return c;
    c = document.createElement("canvas");
    c.width = F.LW; c.height = F.LH;
    const x = c.getContext("2d"), id = x.createImageData(F.LW, F.LH), cols = F.P.desk.map(rgbOf), L = cols.length, rnd = rng(1995);
    for (let yy = 0; yy < F.LH; yy++) for (let xx = 0; xx < F.LW; xx++) {
      const v = (yy / (F.LH - 1)) * (L - 1), i = Math.min(L - 2, Math.floor(v)), f = v - i;
      let k = f > (BAYER[(yy & 3) * 4 + (xx & 3)] + 0.5) / 16 ? i + 1 : i;
      if ((xx + yy) % 26 === 0 || (((xx - yy) % 26) + 26) % 26 === 0) k = Math.min(L - 1, k + 1);
      const o = (yy * F.LW + xx) * 4, col = cols[k];
      id.data[o] = col[0]; id.data[o + 1] = col[1]; id.data[o + 2] = col[2]; id.data[o + 3] = 255;
    }
    const star = rgbOf(F.P.star);
    for (let i = 0; i < 160; i++) {
      const sx = Math.floor(rnd() * F.LW), sy = Math.floor(rnd() * F.LH * 0.62), o = (sy * F.LW + sx) * 4;
      id.data[o] = star[0]; id.data[o + 1] = star[1]; id.data[o + 2] = star[2];
    }
    x.putImageData(id, 0, 0);
    WP.set(key, c);
    return c;
  }
  function mystify(F, t) {
    const { g, P, LW, LH } = F;
    for (let n = 0; n < 2; n++) for (let j = 5; j >= 0; j--) {
      const tt = t - j * 0.11, vs = [];
      for (let v = 0; v < 4; v++) vs.push([LW / 2 + (LW / 2 - 6) * Math.sin(tt * (0.31 + 0.09 * v + 0.04 * n) + v * 1.9 + n * 2.3), LH * 0.46 + (LH * 0.42) * Math.cos(tt * (0.27 + 0.07 * v + 0.05 * n) + v * 1.3 + n * 0.9)]);
      const col = mixc(n ? P.star : P.desk[5], P.desk[2], j / 5.5);
      for (let v = 0; v < 4; v++) { const a = vs[v], b = vs[(v + 1) % 4]; bline(g, a[0], a[1], b[0], b[1], col); }
    }
  }
  const ICONS = [["folder", "CLIPS"], ["disk", "DISK A"], ["bin", "TRASH"], ["pad", "NOTES"], ["chip", "CPU"], ["cd", "DISC"], ["folder", "ARCHIVE"]];
  function desktopIcons(F, t) {
    const { g, P } = F;
    const sel = Math.floor(t / 1.25) % ICONS.length, hop = (t % 1.25) < 0.16;
    ICONS.forEach(([kind, name], i) => {
      let x, y;
      if (F.shape === "wide") { x = 11; y = 8 + i * 41; } else if (F.shape === "tall") { x = 10 + i * 48; y = 4; if (i > 6) return; } else return;
      const on = i === sel, by = y + (on && hop ? -1 : 0);
      if (on) { dith(g, x - 3, by - 2, 22, 30, P.sel, 8); }
      icon(F, kind, x, by, t);
      const w = tw(name, 1), cx = x + 8;
      if (on) R(g, cx - Math.floor(w / 2) - 2, by + 19, w + 4, 9, P.sel);
      txt(F, name, cx, by + 20, 1, on ? P.selT : P.titleT, { align: "center", shadow: on ? undefined : P.dk });
    });
  }
  function widgets(F, t) {
    const { g, P } = F;
    let x, y, row;
    if (F.shape === "wide") { x = F.LW - 34; y = 8; row = false; } else if (F.shape === "tall") { x = F.LW - 40; y = 6; row = true; } else return;
    // Analog clock.
    bev(F, x, y, 30, 30, false);
    disc(g, x + 15, y + 15, 12, P.paper);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; R(g, x + 15 + Math.round(Math.sin(a) * 10), y + 15 - Math.round(Math.cos(a) * 10), 1, 1, P.ink); }
    const am = (t / 12) * Math.PI * 2, ah = (t / 144) * Math.PI * 2 + 2.2, as = (t / 4) * Math.PI * 2;
    bline(g, x + 15, y + 15, x + 15 + Math.sin(ah) * 5, y + 15 - Math.cos(ah) * 5, P.ink);
    bline(g, x + 15, y + 15, x + 15 + Math.sin(am) * 9, y + 15 - Math.cos(am) * 9, P.ink);
    bline(g, x + 15, y + 15, x + 15 + Math.sin(as) * 10, y + 15 - Math.cos(as) * 10, F.acc);
    if (row) return;
    // Level meter.
    const my = y + 36;
    bev(F, x, my, 30, 30, true, P.lcd);
    for (let i = 0; i < 5; i++) { const h = 4 + Math.round((0.5 + 0.5 * Math.sin(t * (2.1 + i * 0.7) + i * 1.9)) * 17); R(g, x + 3 + i * 5, my + 26 - h, 4, h, P.lcdInk); }
    // Sticky note with a scribble that keeps writing.
    const ny = my + 36;
    R(g, x, ny, 30, 32, P.yellow); R(g, x, ny + 29, 30, 3, P.yellowD); R(g, x + 12, ny - 2, 6, 4, F.acc);
    const w = Math.floor(((t * 0.35) % 1) * 4);
    for (let i = 0; i < 5; i++) R(g, x + 3, ny + 6 + i * 4, i < w + 1 ? 16 + ((i * 7) % 9) : 0, 1, P.yellowD);
    // Floppy LED.
    const led = Math.floor(t * 7) % 3 === 0;
    bev(F, x, ny + 38, 30, 16, true, P.chrome);
    txt(F, "HDD", x + 3, ny + 42, 1, P.ink);
    R(g, x + 22, ny + 42, 5, 5, led ? P.c[0] : P.dk);
  }
  function taskbar(F, t, active) {
    const { g, P, tb } = F;
    R(g, tb.x, tb.y, tb.w, tb.h, P.chrome); R(g, tb.x, tb.y, tb.w, 1, P.hi); R(g, tb.x, tb.y + 1, tb.w, 1, P.lite);
    button(F, { x: 2, y: tb.y + 3, w: 50, h: 12 }, null);
    mini(F, "star", 5, tb.y + 4);
    txt(F, "BEGIN", 17, tb.y + 6, 1, P.ink);
    R(g, 54, tb.y + 3, 1, 12, P.sh); R(g, 55, tb.y + 3, 1, 12, P.hi);
    const kinds = { title: "star", chart: "bars", object: "pc", people: "ppl", process: "gear", compare: "cmp", closing: "doc" };
    for (const id of F.plan.ids) {
      const r = btnRect(F, id), on = id === active;
      bev(F, r.x, r.y, r.w, r.h, on, on ? mixc(P.chrome, "#ffffff", 0.35) : P.chrome);
      if (on) dith(g, r.x + 2, r.y + 2, r.w - 4, r.h - 4, "#ffffff", 5);
      mini(F, kinds[id], r.x + 3 + (on ? 1 : 0), r.y + 2 + (on ? 1 : 0));
      if (r.w >= 46) txt(F, NAMES[id], r.x + 14 + (on ? 1 : 0), r.y + 3 + (on ? 1 : 0), 1, P.ink, { q: Math.min(1, Math.floor((r.w - 15) / 6) / NAMES[id].length) });
    }
    const tw0 = F.tall ? 44 : 62, tx = F.LW - tw0 - 2;
    bev(F, tx, tb.y + 3, tw0, 12, true, P.chrome);
    const mins = (41 + Math.floor(t * 0.85)) % 60;
    txt(F, `9:${String(mins).padStart(2, "0")}`, F.LW - 12, tb.y + 6, 1, P.ink, { align: "right" });
    if (!F.tall) { R(g, tx + 4, tb.y + 7, 4, 5, P.sh); R(g, tx + 8, tb.y + 6, 2, 7, P.sh); const led = Math.floor(t * 6) % 4 === 0; R(g, tx + 15, tb.y + 8, 3, 3, led ? F.acc : P.sh); }
  }
  // The room under every scene.
  function desktop(F, info) {
    const { g } = F;
    g.drawImage(wallpaper(F), 0, 0);
    mystify(F, info.t);
    desktopIcons(F, info.t);
    widgets(F, info.t);
    taskbar(F, info.t, info.scene);
  }

  // ---- window life: open from the taskbar, melt, minimise back ------------------------------------
  const lerpRect = (a, b, k) => ({ x: Math.round(lerp(a.x, b.x, k)), y: Math.round(lerp(a.y, b.y, k)), w: Math.round(lerp(a.w, b.w, k)), h: Math.round(lerp(a.h, b.h, k)) });
  // Ghost outlines trail the window as it travels, like the old zoom-rectangles.
  function ghosts(F, from, to, k, t) {
    for (const d of [0.22, 0.12]) {
      const r = lerpRect(from, to, clamp(k - d));
      if (r.w > 3 && r.h > 3) ants(F.g, r.x, r.y, r.w, r.h, t, F.P.titleT, F.P.ink);
    }
  }
  const HEAD = { chart: "chart-title", object: "object-title", people: "people-title", process: "process-title", compare: "compare-title" };
  const KIND = { title: "star", chart: "bars", object: "pc", people: "ppl", process: "gear", compare: "cmp", closing: "doc" };
  const MENUS = { chart: ["FILE", "EDIT", "DATA", "VIEW", "HELP"], object: ["FILE", "VIEW", "TOOLS", "HELP"], people: ["ROOM", "PEOPLE", "VIEW", "HELP"], process: ["FILE", "STEPS", "VIEW", "HELP"], compare: ["FILE", "COMPARE", "VIEW", "HELP"] };
  const PLACE = { chart: "PLOTTER.APP", object: "DESK.APP", people: "LOBBY.APP", process: "WIZARD.APP", compare: "SCORES.APP" };

  function scene(id, body, status) {
    return (ctx, S, box, p, d, info) => {
      const F = frame(ctx, S);
      const { P } = F, exit = info.exit, loc = info.local, hold = info.hold;
      p = clamp(p * 1.6);
      const btn = btnRect(F, id), bc = { x: btn.x + btn.w / 2, y: btn.y + btn.h / 2 };
      let r = F.win, full = true, melt = 0, go = null;
      if (exit == null) { const o = eo(loc / 0.2); if (o < 1) { r = lerpRect(btn, F.win, o); full = false; go = [btn, F.win, o]; } }
      else { melt = span(exit, 0, 0.28); const z = eo(span(exit, 0.28, 1)); if (z > 0) { r = lerpRect(F.win, btn, z); full = false; go = [F.win, btn, z]; } }
      if (go) ghosts(F, go[0], go[1], go[2], loc);
      let pts = null;
      if (full) {
        const pt = chrome(F, r, PLACE[id], { menu: MENUS[id], status: true, kind: KIND[id] });
        const hd = headline(F, pt.cl, dom(HEAD[id]) || (d && d.span) || "", loc);
        const A = { x: pt.cl.x + 5, y: hd.bottom + 8, w: pt.cl.w - 10, h: pt.cl.y + pt.cl.h - 5 - (hd.bottom + 8) };
        statusBar(F, pt.st, status(d, loc, p), loc);
        F.g.save(); F.g.beginPath(); F.g.rect(pt.cl.x, pt.cl.y, pt.cl.w, pt.cl.h); F.g.clip();
        pts = body(F, A, p, d, info, pt);
        F.g.restore();
        if (melt > 0) dith(F.g, pt.cl.x, pt.cl.y, pt.cl.w, pt.cl.h, P.chrome, Math.round(melt * 16));
        pts = [{ t: 0, x: bc.x, y: bc.y }, ...(pts || []).map((q) => ({ ...q, t: clamp(q.t, 0.4, hold - 0.4) })), { t: hold - 0.12, x: pt.btn.min.x + 5, y: pt.btn.min.y + 4, c: 1 }];
      } else if (r.w > 12 && r.h > 8) {
        const pt = chrome(F, r, PLACE[id], { kind: KIND[id], fill: P.chrome });
        if (r.h > 20) R(F.g, pt.cl.x + 1, pt.cl.y + 1, pt.cl.w - 2, pt.cl.h - 2, P.chrome);
      } else bev(F, r.x, r.y, Math.max(4, r.w), Math.max(4, r.h), false);
      if (exit == null || exit < 0.3) {
        const base = pts || [{ t: 0, x: bc.x, y: bc.y }, { t: 0.5, x: F.win.x + F.win.w / 2, y: F.win.y + 60 }];
        const cu = cursorAt(base, exit == null ? loc : loc);
        pointer(F, cu.x, cu.y, cu.down, F._busy, loc);
      }
      done(F);
    };
  }
  const stagger = (p, i, n, spread = 0.5) => eo((p - (i / Math.max(1, n)) * spread) / (1 - spread));

  // ---- chart: a plotter window ---------------------------------------------------------------------
  function chartBody(F, A, p, d, info) {
    const { g, P } = F, loc = info.local, hold = info.hold;
    const n = d.values.length, max = Math.max(...d.values, 1), hl = clamp(d.highlight | 0, 0, n - 1);
    const side = A.w > A.h * 1.2;
    const gp = side ? { x: A.x, y: A.y, w: Math.round(A.w * 0.62), h: A.h } : { x: A.x, y: A.y, w: A.w, h: Math.round(A.h * 0.56) };
    const rp = side ? { x: gp.x + gp.w + 6, y: A.y, w: A.w - gp.w - 6, h: A.h } : { x: A.x, y: gp.y + gp.h + 6, w: A.w, h: A.h - gp.h - 6 };
    bev(F, gp.x, gp.y, gp.w, gp.h, true, P.paper);
    const ix = gp.x + 25, iy = gp.y + 9, iw = gp.w - 25 - 8, ih = gp.h - 9 - 25;
    for (let k = 0; k <= 4; k++) {
      const y = iy + ih - Math.round((ih * k) / 4);
      g.fillStyle = P.grid; g.beginPath(); for (let x = ix; x < ix + iw; x += 2) g.rect(x, y, 1, 1); g.fill();
      txt(F, String(Math.round((max * k) / 4)), ix - 4, y - 3, 1, P.sh, { align: "right" });
    }
    R(g, ix - 1, iy, 1, ih + 1, P.ink); R(g, ix - 1, iy + ih, iw + 1, 1, P.ink);
    const slot = iw / n, bw = Math.min(Math.floor(slot * 0.58), 64);
    let hot = null;
    d.values.forEach((v, i) => {
      const qi = stagger(p, i, n, 0.5), isHot = i === hl;
      const col = isHot ? F.acc : P.c[i % 4];
      const bx = Math.round(ix + slot * i + (slot - bw) / 2);
      const live = qi >= 1 ? Math.round(Math.sin(loc * 2.3 + i * 1.7) * 0.9) : 0;
      const bh = Math.max(0, Math.round(ih * 0.8 * (v / max) * qi) + live), by = iy + ih - bh;
      if (qi < 1) { const gh = Math.round(ih * 0.8 * (v / max)); dith(g, bx, iy + ih - gh, bw, gh, col, 4); outline(g, bx, iy + ih - gh, bw, gh, mixc(col, P.paper, 0.55)); }
      if (bh > 1) {
        R(g, bx, by, bw, bh, col);
        R(g, bx, by, bw, 1, mixc(col, "#ffffff", 0.55)); R(g, bx, by, 1, bh, mixc(col, "#ffffff", 0.4)); R(g, bx + bw - 1, by, 1, bh, mixc(col, "#000000", 0.4));
        for (let y = by + 4; y < by + bh - 1; y += 4) R(g, bx + 1, y, bw - 2, 1, mixc(col, "#000000", 0.28));
        if (isHot && qi >= 1) { const sh = Math.floor(loc * 9) % Math.max(4, Math.floor(bh / 4)); R(g, bx + 2, by + 2 + sh * 4, bw - 4, 2, mixc(col, "#ffffff", 0.5)); }
      }
      if (qi > 0.25) {
        const sc = 2, vs = fmt(v * qi, d.prefix, d.suffix), s2 = tw(vs, sc) <= slot - 2 ? sc : 1;
        txt(F, vs, bx + bw / 2, by - 3 - 7 * s2, s2, isHot ? F.acc : P.ink, { align: "center" });
      }
      { const lb = pipe(d.labels[i]), l2 = tw(lb, 2) <= slot - 2 ? 2 : 1;
        txt(F, lb, ix + slot * i + slot / 2, iy + ih + 5, l2, P.ink, { align: "center", q: 1 }); }
      if (isHot) hot = { x: bx + bw / 2, y: by, bx, by, bw, bh, qi };
    });
    if (hot && hot.qi >= 1) ants(g, hot.bx - 3, Math.max(iy - 1, hot.by - 18), hot.bw + 6, Math.min(hot.bh + 19, ih + 1), loc, P.ink, P.paper);
    // The readout: a segment-style LCD with the highlighted value counting up.
    const lh = side ? Math.min(66, Math.round(rp.h * 0.42)) : Math.min(60, Math.round(rp.h * 0.45));
    bev(F, rp.x, rp.y, rp.w, lh, true, P.lcd);
    const val = d.values[hl] * eo(span(p, 0.3, 0.95)), vs = fmt(val, d.prefix, d.suffix), full = fmt(d.values[hl], d.prefix, d.suffix);
    txt(F, pipe(d.labels[hl]), rp.x + 5, rp.y + 5, 1, P.lcdInk);
    let sc = 5; while (sc > 3 && tw(full, sc) > rp.w - 10) sc--;
    const ghost = full.replace(/[0-9]/g, "8");
    txt(F, ghost, rp.x + rp.w - 6, rp.y + lh - 6 - 7 * sc, sc, mixc(P.lcd, P.lcdInk, 0.13), { align: "right" });
    txt(F, vs, rp.x + rp.w - 6, rp.y + lh - 6 - 7 * sc, sc, P.lcdInk, { align: "right" });
    if (Math.floor(loc * 2) % 2 === 0) R(g, rp.x + rp.w - 9, rp.y + 5, 4, 4, P.lcdInk);
    // Change since the first bar.
    const first = d.values.find((v) => v > 0);
    let y = rp.y + lh + 5;
    if (first && n > 1) {
      const pct = Math.round((d.values[hl] / first - 1) * 100), s = (pct >= 0 ? "+" : "-") + Math.abs(pct) + "%";
      const bq = span(p, 0.62, 0.8), bs = tw(s, 3) <= rp.w - 8 ? 3 : 2, bh = 7 * bs + 6;
      if (bq > 0) {
        const bwid = Math.round((tw(s, bs) + 12) * bq);
        bev(F, rp.x, y, bwid, bh, false, F.acc);
        if (bq >= 1) txt(F, s, rp.x + 6, y + 3, bs, F.S.look.onAccent, {});
      }
      y += bh + 5;
    }
    // Trend strip with a scanner sweeping it.
    const tb = { x: rp.x, y: rp.y + rp.h - 17, w: rp.w, h: 17 };
    const sp = { x: rp.x, y, w: rp.w, h: Math.max(18, tb.y - 5 - y) };
    bev(F, sp.x, sp.y, sp.w, sp.h, true, P.paper);
    const pts = d.values.map((v, i) => [sp.x + 6 + (i * (sp.w - 12)) / Math.max(1, n - 1), sp.y + sp.h - 5 - ((sp.h - 10) * v) / max]);
    for (let i = 0; i < n - 1; i++) bline(g, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], P.grid);
    const drawn = span(p, 0.3, 1) * (n - 1);
    for (let i = 0; i < n - 1; i++) { const k = clamp(drawn - i); if (k > 0) bline(g, pts[i][0], pts[i][1], lerp(pts[i][0], pts[i + 1][0], k), lerp(pts[i][1], pts[i + 1][1], k), P.ink); }
    pts.forEach((q, i) => { if (drawn >= i - 0.05) R(g, q[0] - 1, q[1] - 1, 3, 3, i === hl ? F.acc : P.ink); });
    const sx = sp.x + 4 + ((loc * 0.45) % 1) * (sp.w - 8);
    g.fillStyle = mixc(P.paper, F.acc, 0.35); g.fillRect(Math.round(sx), sp.y + 2, 1, sp.h - 4);
    // Chart-type buttons: one stays pressed and the pressed one moves on.
    const bwid = Math.floor((rp.w - 6) / 3), pressed = Math.floor(loc / 1.3) % 3;
    ["bars", "cmp", "doc"].forEach((k, i) => { const r = { x: tb.x + i * (bwid + 3), y: tb.y, w: bwid, h: tb.h }; button(F, r, null, { down: i === pressed }); mini(F, k, r.x + r.w / 2 - 4 + (i === pressed ? 1 : 0), r.y + 4 + (i === pressed ? 1 : 0)); });
    const tbx = tb.x + (bwid + 3) * 2 + bwid / 2;
    return [
      { t: hold * 0.3, x: hot ? hot.x : gp.x + 30, y: hot ? hot.y - 4 : gp.y + 30 }, { t: hold * 0.48, x: hot ? hot.x + 4 : gp.x + 30, y: hot ? hot.y + 6 : gp.y + 30, c: 1 },
      { t: hold * 0.72, x: tbx, y: tb.y + 8, c: 1 },
    ];
  }

  // ---- object: a desk with a monitor, a tower and notes pinned to its parts ------------------------
  function screenUI(F, sr, p, loc) {
    const { g, P } = F;
    R(g, sr.x, sr.y, sr.w, sr.h, P.desk[1]);
    const pv = { x: sr.x + 3, y: sr.y + 3, w: sr.w - 6, h: Math.round(sr.h * 0.5) };
    for (let i = 0; i < 5; i++) R(g, pv.x, pv.y + Math.floor((pv.h * i) / 5), pv.w, Math.ceil(pv.h / 5), P.desk[1 + i]);
    const sx = pv.x + 4 + ((loc * 0.12) % 1) * (pv.w - 14);
    disc(g, Math.round(sx + 4), pv.y + Math.round(pv.h * 0.45), Math.max(3, Math.round(pv.h * 0.16)), P.yellow);
    R(g, pv.x, pv.y + pv.h - 5, pv.w, 5, P.c[0]); R(g, pv.x + 6, pv.y + pv.h - 9, 8, 4, P.c[0]);
    outline(g, pv.x - 1, pv.y - 1, pv.w + 2, pv.h + 2, P.ink);
    const th = Math.max(4, Math.floor((sr.h - pv.h - 12) / 3) - 1), ty0 = pv.y + pv.h + 4;
    const rows = [[[0.04, 0.3, P.c[0]], [0.38, 0.24, P.c[3]], [0.66, 0.3, P.c[1]]], [[0.1, 0.2, P.c[2]], [0.34, 0.36, F.acc], [0.74, 0.2, P.c[3]]], [[0.0, 0.52, P.titleJ], [0.56, 0.4, P.sh]]];
    const anch = [];
    rows.forEach((row, j) => row.forEach(([a, w, col], i) => {
      const k = span(p, 0.15 + j * 0.15 + i * 0.1, 0.4 + j * 0.15 + i * 0.1);
      const x = sr.x + 3 + Math.round((sr.w - 6) * a), ww = Math.round((sr.w - 6) * w * k), y = ty0 + j * (th + 1);
      R(g, x, y, ww, th, col); R(g, x, y, ww, 1, mixc(col, "#ffffff", 0.45));
      if (j === 1 && i === 1) { anch[1] = [x + (sr.w - 6) * w * 0.5, y + th / 2]; if (k >= 1) ants(g, x - 1, y - 1, ww + 2, th + 2, loc, "#ffffff", P.ink); }
      if (j === 2 && i === 0) anch[2] = [x + 8, y + th / 2];
    }));
    anch[0] = [pv.x + pv.w * 0.7, pv.y + pv.h * 0.3];
    const ph = sr.x + 3 + ((loc * 0.2) % 1) * (sr.w - 6);
    R(g, Math.round(ph), pv.y + pv.h + 1, 1, sr.h - pv.h - 5, "#ffffff");
    return anch;
  }
  function objectBody(F, A, p, d, info) {
    const { g, P } = F, loc = info.local, hold = info.hold, side = A.w > A.h * 1.2, phone = d.kind === "phone";
    const mw = phone ? 76 : side ? Math.min(176, Math.round(A.h * 0.82)) : Math.min(180, Math.round(A.w * 0.6)), mh = phone ? 132 : Math.round(mw * 0.86);
    const mx = A.x + 6, my = side ? A.y + Math.max(2, Math.round((A.h - mh - 30) / 2)) : A.y + 2;
    const open = eo(span(p, 0, 0.3));
    let anch;
    // Desk surface line.
    const deskY = my + mh + (phone ? 6 : 24);
    R(g, A.x, deskY + 14, A.w, 1, P.sh);
    if (!phone) {
      // Monitor shell.
      bev(F, mx, my, mw, mh, false);
      R(g, mx + 6, my + 6, mw - 12, mh - 24, P.dk); bev(F, mx + 6, my + 6, mw - 12, mh - 24, true, P.dk);
      const sr = { x: mx + 10, y: my + 10, w: mw - 20, h: mh - 32 };
      anch = screenUI(F, sr, p, loc);
      dith(g, sr.x, sr.y, sr.w, sr.h, P.hi, 2);
      R(g, mx + 8, my + mh - 11, 10, 3, P.dk); R(g, mx + mw - 20, my + mh - 11, 4, 4, Math.floor(loc * 1.6) % 2 ? P.c[0] : P.dk); R(g, mx + mw - 14, my + mh - 11, 4, 4, P.dk);
      for (let i = 0; i < 6; i++) R(g, mx + mw / 2 - 12 + i * 4, my + mh - 11, 2, 4, P.sh);
      R(g, mx + mw / 2 - 12, my + mh, 24, 6, P.chrome); outline(g, mx + mw / 2 - 12, my + mh, 24, 6, P.sh);
      bev(F, mx + mw / 2 - 28, my + mh + 6, 56, 5, false);
      // Keyboard.
      const kx = mx + 4, ky = my + mh + 16, kw = mw - 8;
      bev(F, kx, ky, kw, 14, false);
      const flash = Math.floor(loc * 9);
      for (let r2 = 0; r2 < 3; r2++) for (let c2 = 0; c2 < Math.floor((kw - 8) / 5); c2++) R(g, kx + 4 + c2 * 5, ky + 2 + r2 * 4, 4, 3, (c2 * 7 + r2 * 3 + flash) % 11 === 0 ? F.acc : P.hi);
    } else {
      bev(F, mx, my, mw, mh, false);
      R(g, mx + 12, my - 14, 6, 14, P.dk); R(g, mx + 12, my - 17, 6, 3, Math.floor(loc * 2) % 2 ? F.acc : P.dk);
      bev(F, mx + 7, my + 8, mw - 14, 56, true, P.dk);
      const sr = { x: mx + 10, y: my + 11, w: mw - 20, h: 50 };
      anch = screenUI(F, sr, p, loc);
      for (let r2 = 0; r2 < 4; r2++) for (let c2 = 0; c2 < 3; c2++) { const lit = (r2 * 3 + c2 + Math.floor(loc * 5)) % 7 === 0; R(g, mx + 12 + c2 * 19, my + 72 + r2 * 12, 14, 8, lit ? F.acc : P.hi); outline(g, mx + 12 + c2 * 19, my + 72 + r2 * 12, 14, 8, P.sh); }
    }
    // Tower with a floppy slot, tray and blinking lights.
    const tx = mx + mw + 12, tww = side ? 44 : 50, thh = Math.min(mh + 8, side ? A.h - 30 : 140), ty = side ? deskY + 14 - thh : my + mh - thh + 12;
    if (!phone) {
      bev(F, tx, ty, tww, thh, false);
      R(g, tx + 6, ty + 8, tww - 12, 3, P.dk); R(g, tx + 6, ty + 16, tww - 12, 9, P.titleJ); outline(g, tx + 6, ty + 16, tww - 12, 9, P.sh);
      R(g, tx + 6, ty + 30, tww - 12, 2, P.dk);
      for (let i = 0; i < 5; i++) R(g, tx + 6, ty + 40 + i * 3, tww - 12, 1, P.sh);
      const hddOn = Math.floor(loc * 8) % 3 === 0;
      R(g, tx + 6, ty + thh - 12, 4, 4, P.c[0]); R(g, tx + 13, ty + thh - 12, 4, 4, hddOn ? F.acc : P.dk); R(g, tx + tww - 14, ty + thh - 14, 8, 8, P.chrome); outline(g, tx + tww - 14, ty + thh - 14, 8, 8, P.sh);
      // Mug with rising steam.
      const mugx = tx + tww + 12, mugy = deskY + 14 - 14;
      R(g, mugx, mugy, 12, 14, P.paper); outline(g, mugx, mugy, 12, 14, P.ink); outline(g, mugx + 12, mugy + 3, 4, 7, P.ink); R(g, mugx + 2, mugy + 2, 8, 2, P.yellowD); R(g, mugx + 3, mugy + 6, 6, 1, F.acc);
      g.fillStyle = mixc(P.paper, P.sh, 0.4);
      g.beginPath();
      for (let i = 0; i < 4; i++) { const k = (loc * 0.7 + i * 0.25) % 1; g.rect(Math.round(mugx + 4 + (i % 2) * 3 + Math.sin(k * 9 + i) * 2), Math.round(mugy - 3 - k * 16), 2, 2); }
      g.fill();
    }
    // Notes.
    const n = d.callouts.length, hasSide = side || phone;
    const cx = hasSide ? tx + tww + (phone ? 20 : 38) : A.x, cw = hasSide ? A.x + A.w - cx : A.w;
    const chh = 41, cgap = 7;
    const cy0 = hasSide ? A.y + Math.max(0, Math.round((A.h - n * chh - (n - 1) * cgap) / 2)) : Math.max(A.y + mh + 44, A.y + A.h - n * chh - (n - 1) * cgap - 2);
    const pts = [];
    d.callouts.forEach((label, i) => {
      const q = stagger(p, i, n, 0.5);
      if (q <= 0 || !label) return;
      const w0 = Math.max(60, Math.round(cw * eo(q))), y = cy0 + i * (chh + cgap);
      const sc = tw(label.toUpperCase(), 2) + 24 <= cw - 8 ? 2 : 1;
      const pt = chrome(F, { x: cx, y, w: w0, h: chh }, "NOTE " + (i + 1), { kind: "doc", active: i === Math.floor(loc / 1.1) % n });
      if (q >= 0.95) {
        glyph(F, "info", pt.cl.x + 3, pt.cl.y + Math.floor((pt.cl.h - 14) / 2), loc);
        txt(F, label, pt.cl.x + 21, pt.cl.y + Math.floor((pt.cl.h - 7 * sc) / 2), sc, P.ink);
        // Leader from the note to the part it describes.
        const a = anch[i], lx = hasSide ? cx - 8 - i * 5 : A.x + A.w - 6 - (n - i) * 6, ly = y + chh / 2;
        const aq = span(q, 0.7, 1);
        if (hasSide) { trail(g, a[0], a[1], lx, a[1], loc, F.acc); trail(g, lx, a[1], lx, ly, loc, F.acc); trail(g, lx, ly, cx, ly, loc, F.acc); }
        else { trail(g, a[0], a[1], a[0], A.y + mh + 38 - i * 3, loc, F.acc); }
        const on = Math.floor(loc * 4 + i) % 2;
        outline(g, Math.round(a[0]) - 3, Math.round(a[1]) - 3, 7, 7, on ? F.acc : P.titleT); R(g, Math.round(a[0]) - 1, Math.round(a[1]) - 1, 3, 3, F.acc);
        if (aq > 0 && i === 1) pts.push({ x: cx + 30, y: y + chh / 2 });
      }
    });
    return [{ t: hold * 0.3, x: mx + mw * 0.6, y: my + mh * 0.3 }, { t: hold * 0.5, x: anch[1][0] + 2, y: anch[1][1] + 2, c: 1 }, { t: hold * 0.74, x: cx + 40, y: cy0 + chh * 1.5 + cgap, c: 1 }];
  }

  // ---- people: a lobby of pixel portraits ----------------------------------------------------------
  const VARS = [
    { skin: 0, hair: "#3a2a1e", style: 0, shirt: 0, acc: 0 }, { skin: 2, hair: "#1a1410", style: 1, shirt: 1, acc: 1 }, { skin: 1, hair: "#8a4a1f", style: 2, shirt: 2, acc: 2 },
    { skin: 3, hair: "#222222", style: 3, cap: "#c7466b", shirt: 3, acc: 0 }, { skin: 0, hair: "#c9a14a", style: 4, shirt: 4, acc: 1 }, { skin: 2, hair: "#5a2a3a", style: 0, shirt: 5, acc: 3 },
  ];
  function peopleBody(F, A, p, d, info) {
    const { g, P } = F, loc = info.local, hold = info.hold;
    const n = Math.max(2, Math.min(6, Math.round(d.count))), hl = Math.min(n - 1, d.highlight | 0);
    const cols = F.shape === "wide" ? n : n <= 2 ? n : 2, rows = Math.ceil(n / cols), gap = 6;
    const sw = Math.floor((A.w - gap * (cols - 1)) / cols), sh = Math.floor((A.h - gap * (rows - 1)) / rows);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const col = i % cols, row = Math.floor(i / cols), x = A.x + col * (sw + gap), y = A.y + row * (sh + gap), hot = i === hl;
      const q = stagger(p, i, n, 0.55), fh = sh - 22;
      if (q <= 0) continue;
      // Portrait frame with a dusk backdrop and a floor stripe.
      bev(F, x, y, sw, fh, true, P.desk[2]);
      g.save(); g.beginPath(); g.rect(x + 2, y + 2, sw - 4, fh - 4); g.clip();
      for (let k = 0; k < 4; k++) R(g, x + 2, y + 2 + Math.floor(((fh - 4) * k) / 5), sw - 4, Math.ceil((fh - 4) / 5), P.desk[1 + k]);
      R(g, x + 2, y + fh - 2 - Math.round(fh * 0.16), sw - 4, Math.round(fh * 0.16), mixc(P.desk[3], "#000000", 0.25));
      for (let s = 0; s < 6; s++) R(g, x + 6 + ((s * 37 + i * 11) % Math.max(10, sw - 12)), y + 5 + ((s * 13) % Math.max(6, Math.round(fh * 0.4))), 1, 1, P.star);
      const sc = Math.max(2, Math.floor(Math.min((sw - 14) / 16, (fh - 6) / 24)));
      const bob = q >= 1 ? (Math.floor(loc * 2.2 + i * 0.6) % 2 ? 0 : 1) : 0, px0 = x + Math.floor((sw - 16 * sc) / 2), py0 = y + fh - 2 - 24 * sc + Math.round((1 - q) * fh) + bob;
      person(F, VARS[i % 6], px0, py0, sc, loc + i * 0.37, { wave: hot, talk: hot && q >= 1, shirt: hot ? F.acc : undefined });
      g.restore();
      // Online lamp.
      R(g, x + sw - 8, y + 4, 4, 4, Math.floor(loc * 1.5 + i) % 3 ? P.c[0] : P.dk);
      // Name plate.
      const label = pipe(d.badges[i % d.badges.length]), py = y + fh + 3;
      if (q > 0.6) {
        bev(F, x, py, sw, 19, false, hot ? F.acc : P.chrome);
        const s2 = tw(label.toUpperCase(), 2) <= sw - 8 ? 2 : 1;
        txt(F, label, x + sw / 2, py + Math.floor((19 - 7 * s2) / 2), s2, hot ? F.S.look.onAccent : P.ink, { align: "center", q: span(q, 0.7, 1) });
      }
      if (hot && q >= 1) {
        ants(g, x - 2, y - 2, sw + 4, fh + 4 + 22, loc, "#ffffff", P.ink);
        // A chat bubble with typing dots.
        const bw = 34, bx = Math.min(x + sw - bw - 2, x + Math.floor(sw / 2) + 4), by = y + 6;
        bev(F, bx, by, bw, 17, false, P.paper);
        for (let k = 0; k < 3; k++) { const on = Math.floor(loc * 4) % 4 === k + 1 || Math.floor(loc * 4) % 4 === 0; R(g, bx + 7 + k * 8, by + 6 + (on ? -1 : 1), 4, 4, P.ink); }
        R(g, bx + 8, by + 17, 3, 3, P.paper);
      }
      pts.push({ x: x + sw / 2, y: y + fh * 0.6, hot });
    }
    const a = pts.find((q) => !q.hot) || pts[0], h = pts.find((q) => q.hot) || pts[0];
    return [{ t: hold * 0.28, x: a.x, y: a.y }, { t: hold * 0.46, x: h.x + 6, y: h.y, c: 1 }, { t: hold * 0.7, x: pts[pts.length - 1].x, y: pts[pts.length - 1].y + 8, c: 1 }];
  }

  // ---- process: three wizard pages with a progress bar that keeps cycling --------------------------
  function bigGlyph(F, kind, x, y, t) { const g = F.g; g.save(); g.translate(Math.round(x), Math.round(y)); g.scale(2, 2); glyph(F, kind, 0, 0, t); g.restore(); }
  function processBody(F, A, p, d, info) {
    const { g, P } = F, loc = info.local, hold = info.hold;
    const n = d.steps.length, horiz = A.w > A.h * 1.1, gap = horiz ? 24 : 20, barH = 30;
    const area = { x: A.x, y: A.y, w: A.w, h: A.h - barH - 6 };
    const ww = horiz ? Math.floor((area.w - gap * (n - 1)) / n) : area.w, wh = horiz ? area.h : Math.floor((area.h - gap * (n - 1)) / n);
    const cyc = loc < 0.7 ? -1 : (loc - 0.7) / 1.15, ia = cyc < 0 ? -1 : Math.floor(cyc) % (n + 1), fr = cyc < 0 ? 0 : cyc % 1;
    const fill = (i) => (ia > i || ia === n ? 1 : ia === i ? fr : 0);
    const kinds = ["file", "spark", "eye", "ok"], pts = [];
    F._busy = false;
    for (let i = 0; i < n; i++) {
      const x = horiz ? area.x + i * (ww + gap) : area.x, y = horiz ? area.y : area.y + i * (wh + gap), q = stagger(p, i, n, 0.6);
      const w0 = ww, active = q >= 0.95 && (ia === i || ia === n);
      const pt = chrome(F, { x, y, w: w0, h: wh }, `STEP ${i + 1} OF ${n}`, { kind: "gear", active });
      if (q < 0.95) { glyph(F, "hour", pt.cl.x + pt.cl.w / 2 - 7, pt.cl.y + pt.cl.h / 2 - 7, loc + i * 0.4); continue; }
      const cl = pt.cl, st = Math.min(i, n - 1) === n - 1 ? 3 : i % 3, gl = st;
      const lines = wrapWords(String(d.steps[i]).toUpperCase().split(/\s+/), Math.max(6, Math.floor((horiz ? cl.w - 10 : cl.w - 82) / 12)));
      if (horiz) {
        txt(F, String(i + 1), cl.x + 8, cl.y + 8, 5, active ? F.acc : P.sh, { shadow: active ? mixc(P.paper, P.ink, 0.2) : undefined });
        bigGlyph(F, kinds[gl], cl.x + cl.w - 36, cl.y + 8 + (active ? Math.round(Math.sin(loc * 7)) : 0), loc);
        lines.slice(0, 3).forEach((ln, k) => txt(F, ln, cl.x + 6, cl.y + 52 + k * 17, 2, P.ink));
        meter(F, { x: cl.x + 5, y: cl.y + cl.h - 18, w: cl.w - 10, h: 12 }, fill(i), active ? F.acc : P.sel, { block: 4 });
        const top = cl.y + 52 + Math.min(3, lines.length) * 17 + 4, rowsN = Math.min(4, Math.floor((cl.y + cl.h - 24 - top) / 12));
        for (let k = 0; k < rowsN; k++) {
          const ry = top + k * 12, ticked = fill(i) > (k + 0.5) / rowsN;
          bev(F, cl.x + 6, ry, 9, 9, true, P.paper);
          if (ticked) { R(g, cl.x + 8, ry + 4, 2, 2, P.green); R(g, cl.x + 10, ry + 3, 1, 1, P.green); R(g, cl.x + 11, ry + 2, 1, 1, P.green); R(g, cl.x + 9, ry + 5, 2, 2, P.green); }
          R(g, cl.x + 19, ry + 3, 26 + ((i * 5 + k * 13) % 44), 3, ticked ? P.sh : P.grid);
          if (active && ia === i && k === Math.floor(fill(i) * rowsN)) R(g, cl.x + 19, ry + 3, 26 + ((i * 5 + k * 13) % 44), 3, F.acc);
        }
      } else {
        txt(F, String(i + 1), cl.x + 8, cl.y + 8, 5, active ? F.acc : P.sh, { shadow: active ? mixc(P.paper, P.ink, 0.2) : undefined });
        bigGlyph(F, kinds[gl], cl.x + 12, cl.y + cl.h - 40 + (active ? Math.round(Math.sin(loc * 7)) : 0), loc);
        lines.slice(0, 3).forEach((ln, k) => txt(F, ln, cl.x + 60, cl.y + 10 + k * 17, 2, P.ink));
        meter(F, { x: cl.x + 56, y: cl.y + cl.h - 20, w: cl.w - 62, h: 12 }, fill(i), active ? F.acc : P.sel, { block: 4 });
      }
      if (fill(i) >= 1) glyph(F, "ok", cl.x + cl.w - 18, cl.y + cl.h - 36 + (horiz ? 0 : -4), loc);
      if (active && ia === i) { F._busy = true; pts.push({ x: x + w0 - 26, y: y + 30 }); }
      // Arrow to the next page, dots travelling.
      if (i < n - 1) {
        const a = stagger(p, i + 0.7, n, 0.6);
        if (a > 0) {
          const hot = ia > i || ia === n;
          if (horiz) { const ay = y + wh / 2, ax = x + ww + 3, bx = x + ww + gap - 4; trail(g, ax, ay, bx, ay, loc, hot ? F.acc : P.titleT, 3); R(g, bx - 1, ay - 3, 1, 7, hot ? F.acc : P.titleT); R(g, bx, ay - 2, 1, 5, hot ? F.acc : P.titleT); R(g, bx + 1, ay - 1, 1, 3, hot ? F.acc : P.titleT); R(g, bx + 2, ay, 1, 1, hot ? F.acc : P.titleT); }
          else { const ax = x + ww / 2, ay = y + wh + 3, by = y + wh + gap - 4; trail(g, ax, ay, ax, by, loc, hot ? F.acc : P.titleT, 3); R(g, ax - 3, by - 1, 7, 1, hot ? F.acc : P.titleT); R(g, ax - 2, by, 5, 1, hot ? F.acc : P.titleT); R(g, ax - 1, by + 1, 3, 1, hot ? F.acc : P.titleT); }
        }
      }
    }
    // Overall bar with its percentage.
    const total = ia < 0 ? 0 : ia >= n ? 1 : (ia + fr) / n, by = A.y + A.h - barH, bq = span(p, 0.5, 0.8);
    if (bq > 0) {
      const s = Math.round(total * 100) + "%", pw = tw("100%", 4) + 4;
      meter(F, { x: A.x, y: by + 4, w: Math.round((A.w - pw - 10) * bq), h: 22 }, total, ia === n ? P.green : F.acc, { block: 6 });
      txt(F, s, A.x + A.w, by + 1, 4, ia === n ? P.green : P.ink, { align: "right", shadow: mixc(P.paper, P.ink, 0.2) });
    }
    return [{ t: hold * 0.3, x: area.x + ww * 0.5, y: area.y + wh * 0.5 }, { t: hold * 0.55, x: A.x + A.w - 40, y: by + 12, c: 1 }, { t: hold * 0.72, x: area.x + area.w * 0.5, y: area.y + area.h * 0.5, c: 1 }];
  }

  // ---- compare: two result windows, a pile of error boxes against one clean check -----------------
  function miniDialog(F, x, y, label, t) {
    const P = F.P;
    bev(F, x, y, 34, 19, false);
    R(F.g, x + 3, y + 3, 28, 3, P.titleA); glyph(F, "err", x + 3, y + 7, t); R(F.g, x + 4, y + 8, 4, 4, P.red);
    R(F.g, x + 14, y + 8, 14, 1, P.sh); R(F.g, x + 14, y + 11, 10, 1, P.sh); R(F.g, x + 22, y + 14, 8, 3, P.hi);
  }
  function compareBody(F, A, p, d, info) {
    const { g, P } = F, loc = info.local, hold = info.hold, horiz = A.w > A.h * 1.1, gap = 24, bottom = 30;
    const area = { x: A.x, y: A.y, w: A.w, h: A.h - bottom - 4 };
    const ww = horiz ? Math.floor((area.w - gap) / 2) : area.w, wh = horiz ? area.h : Math.floor((area.h - gap) / 2);
    const items = [[d.left, d.leftValue, P.c[2], false], [d.right, d.rightValue, F.acc, true]], mx = Math.max(d.leftValue, d.rightValue, 1);
    const pts = [];
    items.forEach(([label, value, color, good], i) => {
      const x = horiz ? area.x + i * (ww + gap) : area.x, y = horiz ? area.y : area.y + i * (wh + gap), q = stagger(p, i, 2, 0.4);
      const w0 = ww;
      const pt = chrome(F, { x, y, w: w0, h: wh }, good ? "AFTER.RES" : "BEFORE.RES", { kind: good ? "cmp" : "doc", active: good });
      if (q < 0.95) { glyph(F, "hour", pt.cl.x + pt.cl.w / 2 - 7, pt.cl.y + pt.cl.h / 2 - 7, loc + i * 0.4); return; }
      const cl = pt.cl, c = eo(span(p, 0.2 + i * 0.1, 0.85)), vs = fmt(value * c, d.prefix, d.suffix);
      txt(F, pipe(label), cl.x + 7, cl.y + 6, tw(pipe(label).toUpperCase(), 2) <= cl.w - 12 ? 2 : 1, good ? F.acc : P.ink);
      let sc = 5; while (sc > 3 && tw(fmt(value, d.prefix, d.suffix), sc) > cl.w * 0.55) sc--;
      txt(F, vs, cl.x + 7, cl.y + 28, sc, good ? F.acc : P.ink, { shadow: mixc(P.paper, P.ink, 0.2) });
      meter(F, { x: cl.x + 6, y: cl.y + cl.h - 19, w: cl.w - 12, h: 13 }, (value / mx) * c, color, { block: 4 });
      // Activity bars along the middle of the page keep moving.
      { const sy0 = cl.y + 28 + 7 * sc + 8, sh0 = cl.y + cl.h - 25 - sy0, nb = 18, bwid = Math.max(2, Math.floor((cl.w - 14) / nb) - 1);
        if (sh0 > 12) for (let k = 0; k < nb; k++) { const h0 = Math.round(sh0 * (0.2 + 0.8 * Math.abs(Math.sin(k * 1.7 + i * 2.1 + loc * (good ? 1.1 : 2.6)))) * clamp(0.15 + (value / mx) * 0.85) * c); R(g, cl.x + 7 + k * (bwid + 1), sy0 + sh0 - h0, bwid, h0, k % 5 === Math.floor(loc * 4) % 5 ? (good ? P.green : P.red) : mixc(color, P.paper, 0.35)); }
      }
      // The right half of the page: error boxes piling up, or one clean tick.
      const zx = cl.x + Math.round(cl.w * 0.58), zw = cl.x + cl.w - zx - 4;
      if (!good) {
        const k = Math.max(1, Math.min(5, Math.round(value)));
        for (let j = 0; j < k; j++) { if (j / k > c) continue; const jx = zx + 2 + j * Math.floor(Math.max(4, (zw - 38) / Math.max(1, k - 1))) + (Math.floor(loc * 3 + j) % 3 === 0 ? 1 : 0), jy = cl.y + 8 + j * 7; if (jx + 34 < cl.x + cl.w) miniDialog(F, jx, jy, "", loc); }
      } else {
        const gy = cl.y + Math.max(6, Math.floor((cl.h - 44) / 2) - 6), gx = zx + Math.floor((zw - 42) / 2);
        g.save(); g.translate(gx, gy); g.scale(3, 3); glyph(F, "ok", 0, 0, loc); g.restore();
        for (let s = 0; s < 6; s++) { const k = (loc * 1.1 + s * 0.17) % 1; if (Math.floor(k * 6) % 2 === 0) R(g, gx + [-4, 40, 44, -2, 22, 36][s], gy + [6, 4, 34, 36, -6, 44][s] - Math.round(k * 3), 2, 2, s % 2 ? P.yellow : "#ffffff"); }
      }
      pts.push({ x: x + w0 * 0.6, y: y + wh * 0.7 });
    });
    // The change stamp.
    const l = d.leftValue, r = d.rightValue, pct = Math.round(((r - l) / Math.max(1, Math.abs(l))) * 100), s = (pct >= 0 ? "+" : "-") + Math.abs(pct) + "%";
    const sy = A.y + A.h - bottom, sq = span(p, 0.7, 0.88);
    if (sq > 0) {
      const ww2 = tw(s, 3) + 14, sx = A.x + Math.round((A.w - ww2) / 2);
      bev(F, sx, sy + 2, ww2, 26, false, F.acc);
      txt(F, s, sx + 7, sy + 5, 3, F.S.look.onAccent);
      if (sq >= 1) {
        const arrowX = (k) => k;
        for (const side of [-1, 1]) { const bx0 = sx + (side < 0 ? -10 : ww2 + 4); g.fillStyle = Math.floor(loc * 4) % 2 ? F.acc : P.ink; for (let j = 0; j < 3; j++) R(g, bx0 + (side < 0 ? 6 - j * 3 : j * 3), sy + 9 + 0, 1, 12, g.fillStyle); }
        trail(g, A.x + 6, sy + 15, sx - 14, sy + 15, loc, P.titleT, 3); trail(g, sx + ww2 + 12, sy + 15, A.x + A.w - 6, sy + 15, loc, P.titleT, 3);
      }
    }
    return [{ t: hold * 0.3, x: (pts[0] || { x: A.x + 40 }).x, y: (pts[0] || { y: A.y + 80 }).y }, { t: hold * 0.5, x: (pts[1] || pts[0] || { x: A.x + A.w - 40 }).x, y: (pts[1] || pts[0] || { y: A.y + 80 }).y, c: 1 }, { t: hold * 0.72, x: A.x + A.w / 2, y: sy + 14, c: 1 }];
  }

  // ---- statements: title and closing dialogs among a cascade of pop-ups ----------------------------
  const POPS = [
    { kind: "warn", head: "NOTICE", a: "TOO MUCH BEIGE.", b: "CONTINUE?", btn: true },
    { kind: "hour", head: "PLEASE WAIT", a: "COPYING 41 FILES", bar: true },
    { kind: "info", head: "DISK STATUS", a: "DISK A: 87% FULL", b: "CLIPS: 12 NEW", bar: true },
    { kind: "ok", head: "SAVED", a: "ALL CHANGES KEPT", b: "NO LOSS.", btn: true },
    { kind: "file", head: "INBOX", a: "1 NEW PROPOSAL", b: "REVIEW IT?", btn: true },
  ];
  const POS = {
    wide: [[0.085, 0.07], [0.69, 0.1], [0.075, 0.7], [0.69, 0.67], [0.4, 0.84]],
    tall: [[0.03, 0.15], [0.46, 0.2], [0.04, 0.72], [0.42, 0.66], [0.2, 0.85]],
    square: [[0.03, 0.06], [0.56, 0.1], [0.04, 0.7], [0.55, 0.68], [0.3, 0.83]],
  };
  function popup(F, i, loc, exit) {
    const P = F.P, pp = POPS[i], pos = POS[F.shape][i], w = 140, h = 48, x = Math.round(pos[0] * F.LW), y = Math.round(pos[1] * F.LH);
    const q = exit != null ? 0.999 * (1 - span(exit, 0, 0.55)) : clamp((loc - (0.15 + i * 0.26)) / 0.22);
    if (q <= 0) return;
    const k = q < 1 ? [0.45, 0.75][Math.floor(q * 2)] : 1, rw = Math.round(w * k), rh = Math.round(h * k), rx = x + Math.round((w - rw) / 2), ry = y + Math.round((h - rh) / 2);
    const pt = chrome(F, { x: rx, y: ry, w: rw, h: rh }, pp.head, { kind: "doc", active: false, fill: P.chrome });
    if (q < 1) return;
    const cl = pt.cl, jig = Math.floor(loc * 5 + i) % 7 === 0 ? 1 : 0;
    R(F.g, cl.x + 1, cl.y + 1, cl.w - 2, cl.h - 2, P.chrome);
    glyph(F, pp.kind, cl.x + 4, cl.y + 4 + jig, loc + i);
    txt(F, pp.a, cl.x + 22, cl.y + 6, 1, P.ink);
    if (pp.b) txt(F, pp.b, cl.x + 22, cl.y + 16, 1, P.ink);
    if (pp.bar) meter(F, { x: cl.x + 22, y: cl.y + (pp.b ? 23 : 17), w: cl.w - 28, h: 8 }, ((loc * 0.4 + i * 0.3) % 1), P.sel, { block: 3 });
    if (pp.btn) button(F, { x: cl.x + cl.w - 31, y: cl.y + cl.h - 14, w: 27, h: 11 }, "OK", { focus: false });
  }
  function statement(F, id, loc, hold, exit) {
    const P = F.P, g = F.g, isTitle = id === "title";
    const btn = btnRect(F, id), text = dom(isTitle ? "title" : "closing"), kick = isTitle ? dom("kicker") : "";
    const iw = F.wide ? 384 : F.tall ? F.LW - 40 : F.LW - 36;
    const words = text.toUpperCase().split(/\s+/).filter(Boolean);
    let sc = 2, lines = [text];
    for (const s of [5, 4, 3, 2]) { const mc = Math.floor((iw - 14 + s) / (6 * s)); const L = wrapWords(words, mc); sc = s; lines = L; if (L.length <= (F.tall ? 4 : 3) && L.every((l) => l.length <= mc)) break; }
    const headH = lines.length * (7 * sc + 4) - 4, ih = 3 + 13 + 1 + 6 + 13 + headH + 12 + 14 + 8 + 17 + 8 + 3;
    const dlg = { x: Math.round((F.LW - iw) / 2) + (F.wide ? 0 : 0), y: Math.round((F.tb.y - ih) / 2), w: iw, h: ih };
    let r = dlg, full = true, melt = 0, go = null;
    if (id === "closing" || !isTitle) { const o = eo(loc / 0.2); if (o < 1) { r = lerpRect(btn, dlg, o); full = false; go = [btn, dlg, o]; } }
    if (exit != null) { melt = span(exit, 0, 0.28); const z = eo(span(exit, 0.28, 1)); if (z > 0) { r = lerpRect(dlg, btn, z); full = false; go = [dlg, btn, z]; } }
    for (let i = 0; i < POPS.length; i++) popup(F, i, loc, exit);
    if (go) ghosts(F, go[0], go[1], go[2], loc);
    let pts = null;
    if (full) {
      const pt = chrome(F, r, isTitle ? "WELCOME" : "GOODBYE", { kind: isTitle ? "star" : "doc" });
      const cl = pt.cl;
      let y = cl.y + 6;
      if (isTitle ? kick : true) {
        const tag = isTitle ? kick.toUpperCase() : "SESSION SAVED", tg = tw(tag, 1) + 18;
        bev(F, cl.x + 7, y, Math.min(tg, cl.w - 14), 13, true, P.lite);
        mini(F, isTitle ? "star" : "doc", cl.x + 10, y + 2);
        txt(F, tag, cl.x + 22, y + 3, 1, P.ink, { q: clamp((loc - 0.05) / 0.4) });
      }
      y += 17;
      const hd = headline(F, cl, text, loc, { y, w: cl.w, scales: [5, 4, 3, 2], lines: F.tall ? 4 : 3, at: 0.15 });
      y = hd.bottom + 12;
      // Progress row.
      const prog = isTitle ? clamp(loc / (hold * 0.85)) : eo(span(loc, 0.5, hold * 0.62));
      const doneRow = prog >= 1;
      txt(F, isTitle ? (doneRow ? "READY" : "OPENING...") : (doneRow ? "ALL CHANGES SAVED" : "SAVING..."), cl.x + 7, y + 4, 1, P.ink);
      const mxw = tw("ALL CHANGES SAVED", 1) + 14;
      meter(F, { x: cl.x + 7 + mxw, y, w: cl.w - 14 - mxw, h: 13 }, isTitle ? (doneRow ? 1 : prog) : prog, doneRow ? P.green : F.acc, { block: 4 });
      y += 22;
      const b1 = { x: cl.x + cl.w - 100, y: y, w: 46, h: 17 }, b2 = { x: cl.x + cl.w - 51, y: y, w: 46, h: 17 };
      const clickT = isTitle ? hold * 0.7 : hold * 0.62, down = Math.abs(loc - clickT) < 0.14;
      button(F, b1, isTitle ? "OPEN" : "SAVE", { down, focus: true });
      button(F, b2, isTitle ? "LATER" : "EXIT");
      if (melt > 0) dith(g, cl.x, cl.y, cl.w, cl.h, P.chrome, Math.round(melt * 16));
      const startPt = isTitle ? { t: 0, x: F.LW * 0.72, y: F.LH * 0.62 } : { t: 0, x: btn.x + btn.w / 2, y: btn.y + btn.h / 2 };
      pts = [startPt, { t: hold * 0.38, x: cl.x + cl.w * 0.55, y: cl.y + cl.h * 0.45 }, { t: clickT, x: b1.x + 22, y: b1.y + 8, c: 1 }];
      if (isTitle) pts.push({ t: hold - 0.12, x: pt.btn.min.x + 5, y: pt.btn.min.y + 4, c: 1 });
      else pts.push({ t: clickT + 0.6, x: b1.x + 30, y: b1.y + 14 });
      F._hold = hold;
    } else if (r.w > 12 && r.h > 8) {
      const pt = chrome(F, r, isTitle ? "WELCOME" : "GOODBYE", { kind: isTitle ? "star" : "doc", fill: P.chrome });
    }
    if (exit == null || exit < 0.3) {
      const base = pts || [{ t: 0, x: btn.x + 20, y: btn.y + 6 }, { t: 1, x: F.LW / 2, y: F.LH / 2 }];
      const cu = cursorAt(base, loc);
      // After the last click the hand rests but never freezes.
      const idle = !isTitle && loc > hold * 0.62 + 0.6 ? 1 : 0;
      pointer(F, cu.x + idle * Math.round(Math.sin(loc * 2.4) * 2), cu.y + idle * Math.round(Math.cos(loc * 1.9) * 1), cu.down, false, loc);
    }
  }

  // ---- finish pass: scanlines, a rolling bar, vignette and speckle ---------------------------------
  function paint(ctx, W, H, t) {
    ctx.clearRect(0, 0, W, H);
    const px = Math.max(1, Math.round((3 * Math.min(W, H)) / 1080));
    ctx.fillStyle = "rgba(18,14,8,0.16)";
    for (let y = 0; y < H; y += px) ctx.fillRect(0, y + px - 1, W, 1);
    const by = (((t * 0.09) % 1.4) - 0.2) * H, bh = H * 0.2, gr = ctx.createLinearGradient(0, by, 0, by + bh);
    gr.addColorStop(0, "rgba(255,250,225,0)"); gr.addColorStop(0.5, "rgba(255,250,225,0.07)"); gr.addColorStop(1, "rgba(255,250,225,0)");
    ctx.fillStyle = gr; ctx.fillRect(0, by, W, bh);
    ctx.fillStyle = `rgba(255,255,255,${0.012 + 0.012 * Math.sin(t * 53)})`; ctx.fillRect(0, 0, W, H);
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    v.addColorStop(0, "rgba(14,8,2,0)"); v.addColorStop(1, "rgba(14,8,2,0.34)");
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    const r = rng(1000 + Math.floor(t * 14));
    ctx.fillStyle = "rgba(255,248,225,0.16)";
    for (let i = 0; i < 70; i++) ctx.fillRect(Math.floor(r() * W), Math.floor(r() * H), px, px);
  }

  const sceneStatus = {
    chart: (d, loc) => `PLOTTING ${d.values.length} BARS`, object: (d) => "3 NOTES PINNED", people: (d) => `${Math.round(d.count)} ONLINE`, process: (d) => `${d.steps.length} STEPS QUEUED`, compare: () => "2 RESULTS OPEN",
  };

  return {
    bg: LOOK_ORIG.bg, panel: LOOK_ORIG.panel, ink: LOOK_ORIG.ink, muted: LOOK_ORIG.muted, accent: LOOK_ORIG.accent, onAccent: LOOK_ORIG.onAccent, rule: LOOK_ORIG.rule, track: LOOK_ORIG.track, pal: LOOK_ORIG.pal,
    display: "'Courier New', Courier, monospace", displayWeight: 700, displayCase: "uppercase", displayTracking: "0.02em",
    body: "'Courier New', Courier, monospace", bodyWeight: 700, figures: "'Courier New', Courier, monospace", radius: 0, motion: "type", change: "fade", kit: { line: 3, fill: "solid", panel: "fill" },
    palettes: { light: LOOK_LIGHT, dark: LOOK_DARK, mono: LOOK_MONO },
    textShadow: () => "none",
    backdrop: (accent, texture, look) => ((look && look.pal) || BASE).desk[0],
    // The page's own lettering gives way to the bitmap face drawn into the art.
    css: () => "#root:has(> canvas#art) .scene .display, #root:has(> canvas#art) .scene .kicker { color: transparent !important; -webkit-text-fill-color: transparent !important; -webkit-text-stroke: 0 !important; text-shadow: none !important; }",
    paint,
    paintOver: true,
    keepArt: true,
    overlap: true,
    stage(ctx, S, info) {
      const F = frame(ctx, S);
      desktop(F, info);
      const ch = Math.max(0.01, info.change), pl = F.plan, th = pl.hold("title");
      if (info.scene === "title") statement(F, "title", info.local + 0.55, info.hold + 0.55, null);
      else if (info.scene === "closing") statement(F, "closing", info.local, info.hold, null);
      else if (info.index === 1 && th > 0 && info.local < ch && pl.ids[0] === "title") statement(F, "title", th + 0.55 + info.local, th + 0.55, clamp(info.local / ch));
      done(F);
    },
    scenes: {
      chart: scene("chart", chartBody, sceneStatus.chart), object: scene("object", objectBody, sceneStatus.object), people: scene("people", peopleBody, sceneStatus.people),
      process: scene("process", processBody, sceneStatus.process), compare: scene("compare", compareBody, sceneStatus.compare),
    },
  };
});
