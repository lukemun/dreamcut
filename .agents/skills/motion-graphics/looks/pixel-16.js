// 16-Bit: an original side-scrolling pixel world. Everything is drawn on a 320 x 180 grid (180 x 320
// when tall) and upscaled with hard edges: a banded, dithered morning sky, parallax mountains with
// waterfalls, a hill village with a turning windmill, a river, a meadow and a fenced path that scroll
// past at different speeds. Lettering is an original 5 x 7 bitmap face typed into wood-framed
// parchment dialog boxes. Scenes are stations along the road: the camera dashes between them while a
// checker dither dissolves one drawing into the next. A small clapperboard sprite of our own design
// walks, hops and cheers through the scenes. Frames are pure functions of time: hashed noise only.
window.DreamcutMotion.register("pixel-16", () => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const seg = (v, a, b) => clamp((v - a) / (b - a));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const R = Math.round, F = Math.floor;
  const fract = (v) => v - Math.floor(v);
  const mod = (a, n) => ((a % n) + n) % n;
  const hash = (n) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453123);
  // Falls in, lands, and settles after one small rebound.
  const land = (v) => { v = clamp(v); if (v < 0.55) { const a = v / 0.55; return a * a; } const b = (v - 0.55) / 0.45; return 1 - Math.sin(b * Math.PI) * 0.14 * (1 - b * 0.3); };

  // ---- colour -----------------------------------------------------------------------------------------
  function rgb(value) {
    const s = String(value || "");
    if (s[0] === "#") {
      const h = s.length === 4 ? s.slice(1).split("").map((c) => c + c).join("") : s.slice(1, 7);
      const n = parseInt(h, 16) || 0;
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const m = s.match(/rgba?\(([^)]+)\)/);
    return m ? m[1].split(",").slice(0, 3).map(Number) : [128, 128, 128];
  }
  const hex = (c) => "#" + c.map((v) => clamp(R(v), 0, 255).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]); };
  const lum = (c) => { const x = rgb(c); return x[0] * 0.3 + x[1] * 0.59 + x[2] * 0.11; };
  const alpha = (c, a) => { const x = rgb(c); return `rgba(${x[0]},${x[1]},${x[2]},${a})`; };

  // ---- worlds (one colour table per palette, about forty colours each) ---------------------------------
  const MORNING = {
    id: "morning", night: false,
    sky: ["#245a7e", "#2d7194", "#3f8aa8", "#62a8b8", "#93c8c0", "#cfe3bd", "#f4dca6"],
    sun: "#fffbe6", sunHalo: "#fde9b0", cloud: "#fffdf5", cloudS: "#e3ece6", cloudD: "#bfd4d4", bird: "#2f4a5c",
    mtnFar: "#7fa4b4", mtnFarL: "#a2c0c8", mtnNear: "#5a8a92", mtnNearL: "#79a6a4", snow: "#f4f8f4",
    hillBack: "#3f8f63", hillBackL: "#5aa86a", hillFront: "#5fae5c", hillFrontL: "#86c867",
    treeD: "#245c3f", tree: "#33804a", treeL: "#5ea956", trunk: "#6a4630",
    roof: "#c4523e", roofD: "#8e3a30", wall: "#f1e4c4", wallD: "#cdb88f", window: "#3d5a6e",
    river: "#3a86b8", riverL: "#6fb5dc", foam: "#e8f7fb",
    meadow: "#7cbf58", meadowL: "#9fd468", grass: "#4f9a45", grassD: "#37743a", flowerA: "#fff6e8", flowerB: "#f4a7b9",
    path: "#d2a36a", pathL: "#e6c08a", pathD: "#a87b4c", stone: "#9c9a92", stoneL: "#c9c5b8", stoneD: "#6e6b66",
    outline: "#2b1d2a", ink: "#3b2633", paper: "#f8eed6", paperHi: "#fffaea", paperShade: "#ecd9b2", paperDeep: "#d6bb8c",
    wood: "#9a6438", woodL: "#c08850", woodD: "#5e3a22", gold: "#f4c34f", goldL: "#fff0a8",
    mote: "#fff8d0", screen: "#1e2433", screenL: "#2e3850", screenHi: "#46557a", metal: "#c5c9d4", metalL: "#e6e9ef", metalD: "#8a8f9e",
    slate: "#3a4256", slateL: "#58637c", white: "#f6f3ea", green: "#4fa64a", smoke: "#ece8e0",
    skins: ["#f2c7a0", "#d9a074", "#a8704a", "#7a4a2e", "#f6d8bc"],
    hairs: ["#3a2a22", "#c6762c", "#e8c766", "#6a3a2a", "#2b2b3a", "#b84a3a"],
    shirts: ["#4f7fc4", "#5aa86a", "#e0a03a", "#8a5cb0", "#3fa7a0", "#d06a8a"],
    pants: ["#3e4a6a", "#5b4636", "#2f3b4e"],
  };
  const NOON = {
    ...MORNING, id: "noon",
    sky: ["#3f8fd8", "#55a0e0", "#6db2e8", "#8ac4ee", "#a9d5f2", "#cbe6f5", "#eaf5f4"],
    sun: "#ffffff", sunHalo: "#fff7cc", cloud: "#ffffff", cloudS: "#e8f1f8", cloudD: "#c9dceb", bird: "#34506e",
    mtnFar: "#93b4d0", mtnFarL: "#b6cde0", mtnNear: "#6f9cb8", mtnNearL: "#8fb7cc", snow: "#ffffff",
    hillBack: "#4f9e5e", hillBackL: "#6cb86a", hillFront: "#73bf5e", hillFrontL: "#9ad66c",
    treeD: "#2f6e45", tree: "#3f9150", treeL: "#6cbc5c",
    meadow: "#8ccc5e", meadowL: "#addf70",
    outline: "#2a2433", ink: "#2d2838", paper: "#fffaf0", paperHi: "#ffffff", paperShade: "#f1e6cf", paperDeep: "#dcc8a2",
    wood: "#b07a48", woodL: "#d29c62", woodD: "#74502e",
  };
  const NIGHT = {
    ...MORNING, id: "night", night: true,
    sky: ["#0a0e2a", "#10173a", "#17214a", "#1f2c5a", "#283a68", "#334a76", "#405a84"],
    sun: "#f2f0dc", sunHalo: "#8fa0c8", cloud: "#4a5a88", cloudS: "#3a4878", cloudD: "#2c3866", bird: "#0c1020",
    mtnFar: "#2a3a64", mtnFarL: "#36497a", mtnNear: "#1f2d50", mtnNearL: "#2a3c62", snow: "#c8d2ea",
    hillBack: "#1b3a44", hillBackL: "#224a52", hillFront: "#21474a", hillFrontL: "#2c5a56",
    treeD: "#0f2228", tree: "#163238", treeL: "#21463f", trunk: "#2a2024",
    roof: "#6a3040", roofD: "#4a2030", wall: "#5a5a78", wallD: "#44445e", window: "#ffd36a",
    river: "#1c3a66", riverL: "#3e6aa0", foam: "#a8c4ee",
    meadow: "#24504a", meadowL: "#2d6052", grass: "#1a3c3a", grassD: "#122c2c", flowerA: "#cfd8f0", flowerB: "#9a7ac8",
    path: "#4e4458", pathL: "#625670", pathD: "#3a3244", stone: "#76768e", stoneL: "#9a9ab0", stoneD: "#4a4a60",
    outline: "#0c0a18", ink: "#2c2230", paper: "#f2e6c8", paperHi: "#fbf2da", paperShade: "#e0cca2", paperDeep: "#c4a878",
    wood: "#7a4e30", woodL: "#9c6a40", woodD: "#4a2e1c", mote: "#e8ff9a", smoke: "#6a7090",
  };
  const SEPIA = {
    id: "sepia", night: false,
    sky: ["#7a5c3c", "#8a6a45", "#9a7a52", "#ab8c60", "#bc9e6f", "#d0b483", "#e4cc9c"],
    sun: "#fbf3de", sunHalo: "#ecdcb4", cloud: "#f7ecd0", cloudS: "#e4d2a8", cloudD: "#ccb07e", bird: "#3d2b1c",
    mtnFar: "#a8875a", mtnFarL: "#bc9e6f", mtnNear: "#8a6a45", mtnNearL: "#9e7e54", snow: "#f4e6c8",
    hillBack: "#6e5235", hillBackL: "#82633f", hillFront: "#8a6a45", hillFrontL: "#a8875a",
    treeD: "#3d2b1c", tree: "#5e4430", treeL: "#82633f", trunk: "#2b1f17",
    roof: "#5e3a24", roofD: "#3d2516", wall: "#e8d6a8", wallD: "#ccb07e", window: "#3d2b1c",
    river: "#6e5235", riverL: "#a8875a", foam: "#f4e6c8",
    meadow: "#a08050", meadowL: "#b8985f", grass: "#82633f", grassD: "#5e4430", flowerA: "#f7ecd0", flowerB: "#d8bf8e",
    path: "#ccb07e", pathL: "#e0c896", pathD: "#a8875a", stone: "#a89a86", stoneL: "#cfc2a8", stoneD: "#6e6252",
    outline: "#22180f", ink: "#2b1f17", paper: "#f7ecd0", paperHi: "#fdf6e2", paperShade: "#e8d6a8", paperDeep: "#ccb07e",
    wood: "#82633f", woodL: "#a8875a", woodD: "#4a3423", gold: "#e0c070", goldL: "#f7ecd0",
    mote: "#fdf6e2", screen: "#2b1f17", screenL: "#4a3423", screenHi: "#6e5235", metal: "#cfc2a8", metalL: "#ede2c8", metalD: "#8f7f66",
    slate: "#3d2b1c", slateL: "#5e4430", white: "#f7ecd0", green: "#6e5235", smoke: "#e8d6a8",
    skins: ["#e8d0a8", "#d4b48a", "#b8946a", "#8f6e4c", "#f0dcb8"],
    hairs: ["#2b1f17", "#5e4430", "#a8875a", "#3d2b1c", "#22180f", "#6e5235"],
    shirts: ["#82633f", "#6e5235", "#a8875a", "#5e4430", "#94744c", "#b8985f"],
    pants: ["#3d2b1c", "#4a3423", "#2b1f17"],
  };

  // ---- an original 5 x 7 bitmap face --------------------------------------------------------------------
  const FONT_SRC = `
A .###. #...# #...# ##### #...# #...# #...#
B ####. #...# #...# ####. #...# #...# ####.
C .###. #...# #.... #.... #.... #...# .###.
D ####. #...# #...# #...# #...# #...# ####.
E ##### #.... #.... ####. #.... #.... #####
F ##### #.... #.... ####. #.... #.... #....
G .###. #...# #.... #.### #...# #...# .####
H #...# #...# #...# ##### #...# #...# #...#
I .###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.
J ..### ...#. ...#. ...#. ...#. #..#. .##..
K #...# #..#. #.#.. ##... #.#.. #..#. #...#
L #.... #.... #.... #.... #.... #.... #####
M #...# ##.## #.#.# #.#.# #...# #...# #...#
N #...# ##..# #.#.# #..## #...# #...# #...#
O .###. #...# #...# #...# #...# #...# .###.
P ####. #...# #...# ####. #.... #.... #....
Q .###. #...# #...# #...# #.#.# #..#. .##.#
R ####. #...# #...# ####. #.#.. #..#. #...#
S .#### #.... #.... .###. ....# ....# ####.
T ##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..
U #...# #...# #...# #...# #...# #...# .###.
V #...# #...# #...# #...# #...# .#.#. ..#..
W #...# #...# #...# #.#.# #.#.# #.#.# .#.#.
X #...# #...# .#.#. ..#.. .#.#. #...# #...#
Y #...# #...# .#.#. ..#.. ..#.. ..#.. ..#..
Z ##### ....# ...#. ..#.. .#... #.... #####
0 .###. #...# #..## #.#.# ##..# #...# .###.
1 ..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.
2 .###. #...# ....# ...#. ..#.. .#... #####
3 ####. ....# ....# .###. ....# ....# ####.
4 ...#. ..##. .#.#. #..#. ##### ...#. ...#.
5 ##### #.... ####. ....# ....# #...# .###.
6 .###. #.... #.... ####. #...# #...# .###.
7 ##### ....# ...#. ..#.. .#... .#... .#...
8 .###. #...# #...# .###. #...# #...# .###.
9 .###. #...# #...# .#### ....# ....# .###.
. ..... ..... ..... ..... ..... .##.. .##..
, ..... ..... ..... ..... .##.. ..#.. .#...
! ..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..
? .###. #...# ....# ...#. ..#.. ..... ..#..
' ..#.. ..#.. .#... ..... ..... ..... .....
" .#.#. .#.#. ..... ..... ..... ..... .....
- ..... ..... ..... .###. ..... ..... .....
+ ..... ..#.. ..#.. ##### ..#.. ..#.. .....
% ##..# ##..# ...#. ..#.. .#... #..## #..##
: ..... .##.. .##.. ..... .##.. .##.. .....
; ..... .##.. .##.. ..... .##.. ..#.. .#...
/ ....# ....# ...#. ..#.. .#... #.... #....
& .##.. #..#. #.#.. .#... #.#.# #..#. .##.#
( ...#. ..#.. .#... .#... .#... ..#.. ...#.
) .#... ..#.. ...#. ...#. ...#. ..#.. .#...
# .#.#. .#.#. ##### .#.#. ##### .#.#. .#.#.
$ ..#.. .#### #.#.. .###. ..#.# ####. ..#..
= ..... ..... ##### ..... ##### ..... .....
< ...#. ..#.. .#... #.... .#... ..#.. ...#.
> .#... ..#.. ...#. ....# ...#. ..#.. .#...
_ ..... ..... ..... ..... ..... ..... #####
* ..... #.#.# .###. ##### .###. #.#.# .....
@ .###. #...# #.### #.#.# #.### #.... .###.
× ..... #...# .#.#. ..#.. .#.#. #...# .....`;
  const GLYPH = {};
  for (const line of FONT_SRC.trim().split("\n")) {
    const parts = line.trim().split(/\s+/);
    const ch = parts[0], rows = parts.slice(1);
    const lit = [];
    rows.forEach((row, y) => { for (let x = 0; x < 5; x++) if (row[x] === "#") lit.push([x, y]); });
    GLYPH[ch] = lit;
  }
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/→/g, ">").replace(/…/g, "...");
  const tw = (s, sc) => { const n = norm(s).length; return n ? (n * 6 - 1) * sc : 0; };
  const charsFor = (wpx, sc) => Math.max(1, F((wpx + sc) / (6 * sc)));
  function txt(g, s, x, y, sc, color, shadow) {
    s = norm(s); x = R(x); y = R(y);
    const pass = (ox, oy, c) => {
      g.fillStyle = c;
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (ch === " ") continue;
        const gl = GLYPH[ch] || GLYPH["?"];
        const bx = x + i * 6 * sc + ox;
        for (const [gx, gy] of gl) g.fillRect(bx + gx * sc, y + oy + gy * sc, sc, sc);
      }
    };
    if (shadow) pass(1, 1, shadow);
    pass(0, 0, color);
  }
  function wrap(s, maxChars) {
    const words = norm(s).split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = "";
    for (let w of words) {
      while (w.length > maxChars) { if (cur) { lines.push(cur); cur = ""; } lines.push(w.slice(0, maxChars)); w = w.slice(maxChars); }
      if (!w) continue;
      if (!cur) cur = w;
      else if ((cur + " " + w).length <= maxChars) cur += " " + w;
      else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  }
  // True when every word fits a line whole and the words need no more than maxLines lines.
  const fits = (s, maxChars, maxLines) => norm(s).split(/\s+/).every((w) => w.length <= maxChars) && wrap(s, maxChars).length <= maxLines;
  // Typewriter over wrapped lines; centred lines are placed by their full width so nothing shifts.
  function typeLines(g, lines, x, y, sc, lh, n, color, shadow, width = 0) {
    let left = n;
    lines.forEach((ln, i) => {
      if (left <= 0) return;
      const part = ln.slice(0, left);
      left -= ln.length + 1;
      const lx = width ? x + R((width - tw(ln, sc)) / 2) : x;
      txt(g, part, lx, y + i * lh, sc, color, shadow);
    });
  }
  const totalChars = (lines) => lines.reduce((a, l) => a + l.length + 1, 0);

  // ---- buffers, patterns, primitives -----------------------------------------------------------------------
  const BUF = {};
  function layer(key, G) {
    let c = BUF[key];
    if (!c) c = BUF[key] = document.createElement("canvas");
    if (c.width !== G.LW || c.height !== G.LH) { c.width = G.LW; c.height = G.LH; }
    const g = c.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, c.width, c.height);
    return g;
  }
  function blit(ctx, g, G) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(g.canvas, 0, 0, G.LW * G.px, G.LH * G.px);
    ctx.restore();
  }
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const PAT = {};
  let PATCTX = null;
  function pat(color, level, cell = 1) {
    level = clamp(R(level), 0, 16);
    const key = color + "|" + level + "|" + cell;
    if (PAT[key]) return PAT[key];
    const c = document.createElement("canvas");
    c.width = c.height = 4 * cell;
    const x = c.getContext("2d");
    x.fillStyle = color;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (BAYER[j * 4 + i] < level) x.fillRect(i * cell, j * cell, cell, cell);
    if (!PATCTX) PATCTX = document.createElement("canvas").getContext("2d");
    return (PAT[key] = PATCTX.createPattern(c, "repeat"));
  }
  function rect(g, x, y, w, h, c) {
    const x0 = R(x), y0 = R(y), x1 = R(x + w), y1 = R(y + h);
    if (x1 <= x0 || y1 <= y0) return;
    g.fillStyle = c;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  const dfill = (g, x, y, w, h, c, level, cell = 1) => rect(g, x, y, w, h, pat(c, level, cell));
  function disc(g, cx, cy, r, style) {
    g.fillStyle = style;
    cx = R(cx); cy = R(cy); r = Math.max(0, R(r));
    for (let dy = -r; dy <= r; dy++) {
      const hw = F(Math.sqrt(Math.max(0, r * r - dy * dy)) + 0.35);
      g.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
    }
  }
  function line(g, x0, y0, x1, y1, c, dash = 0, phase = 0, upto = 1) {
    x0 = R(x0); y0 = R(y0); x1 = R(x1); y1 = R(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    const steps = Math.max(dx, -dy), limit = F(steps * upto);
    let err = dx + dy, i = 0;
    g.fillStyle = c;
    for (;;) {
      if (i > limit) break;
      if (!dash || mod(F((i + phase) / dash), 2) === 0) g.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
      i++;
    }
  }
  function bmp(g, rows, x, y, color, sc = 1) {
    g.fillStyle = color;
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === "#") g.fillRect(R(x) + i * sc, R(y) + j * sc, sc, sc); });
  }
  const ICONS = {
    heart: [".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."],
    check: ["......#", ".....##", "#...##.", "##.##..", ".###...", "..#...."],
    star: ["...#...", "..###..", "#######", ".#####.", "..###..", ".##.##.", "##...##"],
    bang: ["..##...", "..##...", "..##...", "..##...", "..##...", ".......", "..##..."],
    note: ["..####.", "..#..#.", "..#..#.", "..#..#.", "###.###", "###.###"],
  };
  const SPR = {};
  // A sprite drawn once into its own canvas, with a one-pixel outline grown round its silhouette.
  function sprite(key, w, h, draw, outline) {
    if (SPR[key]) return SPR[key];
    const make = () => { const c = document.createElement("canvas"); c.width = w + 2; c.height = h + 2; return c; };
    const body = make(), b = body.getContext("2d");
    b.translate(1, 1); draw(b);
    const out = make(), o = out.getContext("2d");
    if (outline) {
      const sil = make(), s = sil.getContext("2d");
      s.drawImage(body, 0, 0); s.globalCompositeOperation = "source-in"; s.fillStyle = outline; s.fillRect(0, 0, w + 2, h + 2);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) o.drawImage(sil, dx, dy);
    }
    o.drawImage(body, 0, 0);
    return (SPR[key] = out);
  }

  // ---- theme, grid ------------------------------------------------------------------------------------------
  let PK = "", PC = null;
  function theme(S) {
    const Wd = S.look.world || MORNING;
    const key = Wd.id + "|" + S.accent;
    if (PK === key) return PC;
    const acc = /^#[0-9a-f]{3,8}$/i.test(String(S.accent)) ? S.accent : "#e2503c";
    const light = lum(acc) > 168;
    PC = {
      ...Wd, key, acc, accL: mix(acc, "#ffffff", 0.45), accD: mix(acc, Wd.outline, 0.42),
      onAcc: light ? Wd.outline : "#fff8ea", accText: light ? mix(acc, Wd.outline, 0.55) : acc,
      shadow: alpha(Wd.outline, 0.35), slateD: mix(Wd.slate, Wd.outline, 0.5),
    };
    PK = key;
    return PC;
  }
  function grid(S) {
    const px = Math.min(S.W, S.H) / 180;
    const LW = Math.ceil(S.W / px - 0.001), LH = Math.ceil(S.H / px - 0.001);
    return { px, LW, LH, tall: S.H > S.W * 1.15, narrow: LW < 260 };
  }
  const dom = (id) => { const el = typeof document !== "undefined" && document.getElementById(id); return el ? el.textContent || "" : ""; };
  function controls() { return (typeof window !== "undefined" && window.__dreamcut && window.__dreamcut.controls) || {}; }
  function fmt(target, k, prefix, suffix) {
    const v = Number(target) || 0;
    const dec = Math.min(2, (String(v).split(".")[1] || "").length);
    const cur = v * k;
    const fixed = Math.abs(cur).toFixed(dec);
    const [whole, frac] = fixed.split(".");
    return (cur < 0 ? "-" : "") + (prefix || "") + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (frac ? "." + frac : "") + (suffix || "");
  }

  // ---- frames and plaques ---------------------------------------------------------------------------------------
  // The dialog frame: dark outline with cut corners, a wooden rail, brass rivets and parchment inside.
  function frame(g, P, x, y, w, h, fill) {
    x = R(x); y = R(y); w = R(w); h = R(h);
    rect(g, x + 2, y + 2, w, h, P.shadow);
    rect(g, x + 1, y, w - 2, h, P.outline); rect(g, x, y + 1, w, h - 2, P.outline);
    rect(g, x + 1, y + 1, w - 2, h - 2, P.wood);
    rect(g, x + 2, y + 1, w - 4, 1, P.woodL);
    rect(g, x + 2, y + h - 2, w - 4, 1, P.woodD);
    rect(g, x + 3, y + 3, w - 6, h - 6, P.woodD);
    rect(g, x + 4, y + 4, w - 8, h - 8, fill || P.paper);
    if (!fill) {
      rect(g, x + 4, y + 4, w - 8, 1, P.paperHi);
      if (h > 16) { dfill(g, x + 4, y + h - 8, w - 8, 2, P.paperShade, 6); rect(g, x + 4, y + h - 6, w - 8, 2, P.paperShade); }
    }
    for (const [rx, ry] of [[x + 1, y + 1], [x + w - 3, y + 1], [x + 1, y + h - 3], [x + w - 3, y + h - 3]]) { rect(g, rx, ry, 2, 2, P.gold); rect(g, rx, ry, 1, 1, P.goldL); }
  }
  function plaque(g, P, x, y, w, h, fill) {
    x = R(x); y = R(y); w = R(w); h = R(h);
    rect(g, x + 1, y + 1, w, h, P.shadow);
    rect(g, x, y + 1, w, h - 2, P.outline); rect(g, x + 1, y, w - 2, h, P.outline);
    rect(g, x + 1, y + 1, w - 2, h - 2, fill === P.acc ? P.accD : P.woodL);
    rect(g, x + 2, y + 2, w - 4, h - 4, fill || P.paper);
    rect(g, x + 2, y + 2, w - 4, 1, fill === P.acc ? P.accL : P.paperHi);
  }
  // A wrapped label on its own plaque, centred on cx. Returns the plaque's box.
  const lineH = (sc) => (sc === 1 ? 9 : 7 * sc + 3);
  const padW = (sc) => (sc === 1 ? 8 : 12);
  const boxH = (n, sc) => n * lineH(sc) + (sc === 1 ? 4 : 5);
  function label(g, P, words, cx, y, maxW, o = {}) {
    const sc = o.sc || 1;
    const lines = o.lines || wrap(words, charsFor(maxW - padW(sc), sc)).slice(0, o.maxLines || 3);
    const w = Math.max(...lines.map((l) => tw(l, sc))) + padW(sc);
    const h = boxH(lines.length, sc);
    const x = R(cx - w / 2);
    const fill = o.fill || P.paper;
    plaque(g, P, x, y, w, h, fill);
    const ink = o.ink || (fill === P.acc ? P.onAcc : P.ink);
    lines.forEach((ln, i) => txt(g, ln, x + R((w - tw(ln, sc)) / 2), y + (sc === 1 ? 3 : 4) + i * lineH(sc), sc, ink));
    return { x, y, w, h };
  }
  function sparkle(g, x, y, size, color) {
    x = R(x); y = R(y);
    rect(g, x, y, 1, 1, color);
    if (size > 0) { rect(g, x - size, y, size * 2 + 1, 1, color); rect(g, x, y - size, 1, size * 2 + 1, color); }
  }
  // The scene headline, typed into a dialog box across the top of the frame.
  let HL = null;
  function headline(g, G, P, text, local) {
    const x = 8, y = G.narrow ? 12 : 7;
    const maxW = G.LW - x * 2, sc = 2, lh = 9 * sc + 1;
    const lines = wrap(text, charsFor(maxW - 14, sc));
    const wText = Math.max(...lines.map((l) => tw(l, sc)));
    const w = Math.min(maxW, Math.max(wText + 15, F(maxW * 0.45)));
    const h = lines.length * lh + 11;
    // Headlines swap as whole blocks on their own layer: the outgoing box folds shut before the
    // incoming one opens, so two titles never share the dissolve.
    if (HL) {
      g = HL.g;
      if (HL.exit != null) {
        // Replaced by the next scene's headline: the box stays and its words change, like a dialog page.
        if (HL.replaced) return y + h;
        // Otherwise (before a statement) it stays whole and checker-dithers away with its scene.
        frame(g, P, x, y, w, h);
        typeLines(g, lines, x + 7, y + 7, sc, lh, 999, P.ink, P.paperDeep);
        return y + h;
      }
    }
    const hh = HL && HL.page ? h : Math.max(9, R(h * eo(seg(local, 0, 0.16))));
    frame(g, P, x, y, w, hh);
    g.save(); g.beginPath(); g.rect(x + 4, y + 4, w - 8, hh - 8); g.clip();
    const n = F(local * 55) + 2;
    typeLines(g, lines, x + 7, y + 7, sc, lh, n, P.ink, P.paperDeep);
    g.restore();
    if (n > totalChars(lines) + 3 && hh >= h) bmp(g, ["#####", ".###.", "..#.."], x + w - 12, y + h - 9 + (F(local * 3) % 2), P.accText);
    return y + h;
  }

  // ---- the hero: a small walking clapperboard ------------------------------------------------------------------
  function hero(g, P, cx, baseY, o = {}) {
    const frame4 = o.frame ?? -1, dir = o.dir ?? 1, open = clamp(o.open ?? 0), arms = o.arms ?? 0, look = o.look ?? dir;
    const L = R(cx) - 7, T = R(baseY) - 18, O = P.outline;
    // Legs and feet: a four-step walk, the lifted leg one pixel shorter.
    const st = frame4 < 0 ? -1 : frame4 % 4;
    const off = st === 0 ? 1 : st === 2 ? -1 : 0;
    const legs = [[L + 4 - off * dir, st === 2 ? 1 : 0], [L + 8 + off * dir, st === 0 ? 1 : 0]];
    for (const [lx, lift] of legs) { rect(g, lx, T + 15, 2, 2 - lift, O); rect(g, lx + (dir > 0 ? 0 : -1), T + 17 - lift, 3, 1, O); }
    // Board.
    rect(g, L, T + 4, 14, 11, O);
    rect(g, L + 1, T + 5, 12, 9, P.slate);
    rect(g, L + 1, T + 13, 12, 1, P.slateD);
    for (let c = 0; c < 12; c++) { rect(g, L + 1 + c, T + 5, 1, 1, F(c / 2) % 2 ? P.white : P.slateL); rect(g, L + 1 + c, T + 6, 1, 1, F((c + 1) / 2) % 2 ? P.white : P.slateL); }
    // Eyes, blinking now and then; pupils look where the hero is heading.
    const blink = o.blink ?? false;
    const pxo = look < 0 ? 0 : look > 0 ? 2 : 1;
    for (const ex of [L + 3, L + 8]) {
      if (blink) rect(g, ex, T + 9, 3, 1, P.white);
      else { rect(g, ex, T + 8, 3, 3, P.white); rect(g, ex + pxo, T + 9, 1, 2, O); }
    }
    rect(g, L + 2, T + 11, 1, 1, P.accL); rect(g, L + 11, T + 11, 1, 1, P.accL);
    rect(g, L + 6, T + 11, 2, 1, open > 0.3 ? P.acc : O);
    if (open > 0.3) rect(g, L + 6, T + 12, 2, 1, P.accD);
    // Clapper stick, hinged at the left; it lifts when the hero talks or jumps.
    const k = open * 0.42;
    for (let c = 0; c < 14; c++) {
      const dy = -R(c * k);
      rect(g, L + c, T + 1 + dy, 1, 1, O);
      rect(g, L + c, T + 2 + dy, 1, 1, F(c / 3) % 2 ? P.white : P.acc);
      rect(g, L + c, T + 3 + dy, 1, 1, O);
    }
    rect(g, L - 1, T + 2, 1, 2, O);
    rect(g, L, T + 3, 2, 2, P.gold);
    // Arms with little white mitts.
    const armDown = (sx, side) => { rect(g, sx, T + 9, 1, 3, O); rect(g, sx + side, T + 11, 2, 2, P.white); };
    const armUp = (sx, side) => { rect(g, sx, T + 4, 1, 4, O); rect(g, sx + side, T + 2, 2, 2, P.white); };
    if (arms === 1) { armUp(L - 1, -2); armUp(L + 14, 1); }
    else if (arms === 2) { armDown(L - 1, -2); armUp(L + 14, 1); }
    else if (arms === 3) { armDown(L - 1, -2); rect(g, L + 14, T + 7, 2, 1, O); rect(g, L + 16, T + 6, 2, 2, P.white); }
    else { armDown(L - 1, -2); armDown(L + 14, 1); }
  }
  const blinkAt = (t, seed) => fract(t * 0.31 + hash(seed) ) < 0.045;

  // ---- villagers ---------------------------------------------------------------------------------------------------
  const VARIANTS = [
    { skin: 0, hair: 0, style: 0, shirt: 0, pants: 0 }, { skin: 2, hair: 1, style: 1, shirt: 1, pants: 1 },
    { skin: 1, hair: 3, style: 4, shirt: 2, pants: 2 }, { skin: 3, hair: 4, style: 5, shirt: 3, pants: 0 },
    { skin: 4, hair: 2, style: 2, shirt: 4, pants: 1 }, { skin: 1, hair: 5, style: 3, shirt: 5, pants: 2 },
  ];
  function personSprite(P, vi, blink, wave, hi) {
    const key = `${P.key}|p${vi}${blink ? 1 : 0}${wave}${hi ? 1 : 0}`;
    return sprite(key, 15, 30, (b) => {
      const v = VARIANTS[vi % VARIANTS.length];
      const skin = P.skins[v.skin], skinD = mix(skin, P.outline, 0.25), hair = P.hairs[v.hair], hairL = mix(hair, "#ffffff", 0.25);
      const shirt = hi ? P.acc : P.shirts[v.shirt], shirtD = mix(shirt, P.outline, 0.3), pants = P.pants[v.pants], shoe = mix(P.outline, "#000000", 0.2);
      const O = P.outline, hy = 3;
      rect(b, 3, 22, 3, 6, pants); rect(b, 8, 22, 3, 6, pants); rect(b, 6, 22, 2, 1, pants);
      rect(b, 2, 28, 4, 2, shoe); rect(b, 8, 28, 4, 2, shoe);
      rect(b, 2, 13, 10, 9, shirt); rect(b, 10, 13, 2, 9, shirtD); rect(b, 5, 13, 4, 1, P.white); rect(b, 2, 21, 10, 1, shirtD);
      rect(b, 0, 14, 2, 7, shirt); rect(b, 0, 21, 2, 2, skin);
      if (wave === 1) { rect(b, 12, 7, 2, 7, shirtD); rect(b, 12, 5, 2, 2, skin); }
      else if (wave === 2) { rect(b, 12, 9, 2, 5, shirtD); rect(b, 13, 7, 2, 2, skin); }
      else { rect(b, 12, 14, 2, 7, shirtD); rect(b, 12, 21, 2, 2, skin); }
      rect(b, 3, hy, 8, 10, skin); rect(b, 2, hy + 1, 10, 8, skin); rect(b, 3, hy + 9, 8, 1, skinD);
      if (blink) { rect(b, 4, hy + 6, 2, 1, O); rect(b, 8, hy + 6, 2, 1, O); }
      else { rect(b, 5, hy + 5, 1, 2, O); rect(b, 8, hy + 5, 1, 2, O); }
      rect(b, 6, hy + 8, 2, 1, skinD);
      rect(b, 3, hy + 7, 1, 1, mix(skin, P.acc, 0.35)); rect(b, 10, hy + 7, 1, 1, mix(skin, P.acc, 0.35));
      switch (v.style) {
        case 1: rect(b, 3, hy - 1, 8, 1, hair); rect(b, 2, hy, 10, 3, hair); rect(b, 1, hy + 2, 2, 11, hair); rect(b, 11, hy + 2, 2, 11, hair); break;
        case 2: rect(b, 3, hy - 1, 8, 1, hair); rect(b, 2, hy, 10, 3, hair); rect(b, 2, hy + 3, 1, 3, hair); rect(b, 11, hy + 3, 1, 3, hair); rect(b, 5, hy - 3, 4, 3, hair); break;
        case 3: rect(b, 2, hy, 10, 2, hair); for (const s of [2, 5, 8, 11]) { rect(b, s, hy - 2, 1, 2, hair); rect(b, s - 1, hy - 1, 1, 1, hair); } rect(b, 2, hy + 2, 1, 2, hair); break;
        case 4: { const cap = P.shirts[(v.shirt + 2) % P.shirts.length]; rect(b, 2, hy - 1, 10, 3, cap); rect(b, 3, hy - 2, 8, 1, cap); rect(b, 8, hy + 2, 6, 1, mix(cap, O, 0.3)); rect(b, 2, hy + 2, 1, 3, hair); break; }
        case 5: rect(b, 1, hy - 1, 12, 4, hair); rect(b, 1, hy + 3, 2, 4, hair); rect(b, 11, hy + 3, 2, 4, hair);
          for (let i = 0; i < 6; i++) rect(b, 2 + i * 2, hy + (i % 2), 1, 1, mix(hair, O, 0.35)); break;
        default: rect(b, 3, hy - 1, 8, 1, hair); rect(b, 2, hy, 10, 3, hair); rect(b, 2, hy + 3, 1, 3, hair); rect(b, 11, hy + 3, 1, 2, hair);
      }
      rect(b, 4, hy, 3, 1, hairL);
    }, P.outline);
  }

  // ---- the world ------------------------------------------------------------------------------------------------------
  function ridge(x, seed, period, oct) {
    let h = 0, a = 1, n = 1, tot = 0;
    for (let k = 0; k < oct; k++) { h += a * Math.sin(TAU * (n * x / period) + hash(seed + k * 7.3) * TAU); tot += a; a *= 0.5; n = n * 2 + 1; }
    return h / tot;
  }
  function sky(g, G, P) {
    const cols = P.sky, hz = R(G.LH * 0.68);
    const ws = [1.6, 1.35, 1.15, 1, 0.85, 0.72, 0.62];
    const sum = ws.reduce((a, b) => a + b, 0);
    let y = 0;
    cols.forEach((c, i) => {
      const h = i === cols.length - 1 ? G.LH - y : R(hz * ws[i] / sum);
      rect(g, 0, y, G.LW, h, c);
      if (i > 0) { dfill(g, 0, y - 3, G.LW, 1, c, 3); dfill(g, 0, y - 2, G.LW, 1, c, 7); dfill(g, 0, y - 1, G.LW, 1, c, 11); }
      y += h;
    });
  }
  function stars(g, G, P, t) {
    for (let i = 0; i < 80; i++) {
      const x = hash(i * 3.1) * G.LW, y = hash(i * 5.7 + 2) * G.LH * 0.55;
      const b = Math.sin(t * (1.5 + hash(i) * 2) + i * 1.3);
      if (b < -0.4) continue;
      sparkle(g, x, y, b > 0.85 && i % 3 === 0 ? 1 : 0, b > 0.5 ? P.white : P.sunHalo);
    }
  }
  function sun(g, G, P, t) {
    const x = R(G.LW * (G.narrow ? 0.28 : 0.2)), y = R(G.LH * 0.15 - Math.min(5, t * 0.3));
    const pulse = F(t * 2) % 2;
    disc(g, x, y, 16 + pulse, pat(P.sunHalo, 3));
    disc(g, x, y, 13, pat(P.sunHalo, 8));
    disc(g, x, y, 10, P.sun);
    if (P.night) { rect(g, x - 4, y - 2, 3, 2, P.sunHalo); rect(g, x + 2, y + 3, 3, 2, P.sunHalo); rect(g, x + 3, y - 5, 2, 1, P.sunHalo); rect(g, x - 1, y + 6, 2, 1, P.sunHalo); }
    else {
      disc(g, x - 3, y - 3, 3, P.white);
      for (let k = 0; k < 12; k++) {
        const a = k * TAU / 12 + t * 0.25, r0 = 18 + (k % 2) * 2 + pulse;
        rect(g, x + Math.cos(a) * r0, y + Math.sin(a) * r0, 1, 1, P.sunHalo);
      }
    }
  }
  function cloudSprite(P, i) {
    const w = 34 + F(hash(i + 11) * 34), h = 16;
    return sprite(`${P.id}|cl${i}`, w, h, (b) => {
      const n = 3 + F(hash(i + 12) * 3);
      const puffs = [];
      for (let k = 0; k < n; k++) { const r = 4 + F(hash(i * 9 + k) * 4); puffs.push([R(r + (w - 2 * r) * (k + 0.5) / n), h - 3 - r + F(hash(i + k * 3) * 2), r]); }
      for (const [cx, cy, r] of puffs) disc(b, cx, cy + 2, r, P.cloudD);
      for (const [cx, cy, r] of puffs) disc(b, cx, cy + 1, r, P.cloudS);
      for (const [cx, cy, r] of puffs) disc(b, cx, cy, r - 1, P.cloud);
      rect(b, 2, h - 2, w - 4, 2, P.cloudD);
    });
  }
  function clouds(g, G, P, t, cx) {
    const N = G.narrow ? 5 : 7, span = G.LW + 160;
    for (let i = 0; i < N; i++) {
      const s = cloudSprite(P, i);
      const x = mod(hash(i * 2.3) * span - t * (1.5 + hash(i + 5) * 2.5) - cx * 0.03 * (1 + hash(i + 1)), span) - 80;
      const y = R(G.LH * (0.04 + 0.34 * hash(i + 9)));
      g.drawImage(s, R(x), y);
    }
  }
  function birds(g, G, P, t) {
    if (P.night) return;
    const ph = fract(t / 10 + 0.12);
    const x0 = -30 + ph * (G.LW + 60), y0 = G.LH * 0.24 + Math.sin(ph * TAU * 2) * 5;
    const V = [[0, 0], [-6, -3], [-6, 3], [-12, -6], [-12, 6]];
    V.forEach(([ox, oy], i) => {
      const x = R(x0 + ox), y = R(y0 + oy), up = (F(t * 7) + i) % 2;
      g.fillStyle = P.bird;
      g.fillRect(x - 1, y, 3, 1);
      if (up) { g.fillRect(x - 2, y - 1, 1, 1); g.fillRect(x + 2, y - 1, 1, 1); g.fillRect(x - 3, y - 2, 1, 1); g.fillRect(x + 3, y - 2, 1, 1); }
      else { g.fillRect(x - 2, y + 1, 1, 1); g.fillRect(x + 2, y + 1, 1, 1); }
    });
  }
  function mountains(g, G, P, t, ox, near) {
    const base = R(G.LH * (near ? 0.72 : 0.68)), amp = near ? 26 : 40, period = near ? 420 : 560, seed = near ? 21 : 7;
    const col = near ? P.mtnNear : P.mtnFar, lit = near ? P.mtnNearL : P.mtnFarL;
    const o = R(ox);
    const top = (wx) => {
      const v = 1 - Math.abs(ridge(wx, seed, period, 3));
      return R(base - amp * (0.55 * v * v + 0.45 * (0.5 + 0.5 * ridge(wx, seed + 50, period, 2))));
    };
    let y = top(o - 1);
    for (let X = 0; X < G.LW; X++) {
      const y1 = top(X + o + 1), yy = top(X + o);
      rect(g, X, yy, 1, base + 40 - yy, col);
      if (y1 < yy || yy < y) { const run = Math.min(9, base - yy); rect(g, X, yy, 1, run, lit); dfill(g, X, yy + run, 1, 3, lit, 6); }
      if (!near && yy < base - amp * 0.7) rect(g, X, yy, 1, 2 + ((X + o) % 3 === 0 ? 1 : 0), P.snow);
      rect(g, X, yy, 1, 1, mix(lit, P.snow, near ? 0.15 : 0.35));
      y = yy;
    }
    if (near) {
      // Waterfalls pour down the near range, their stripes running from time alone.
      for (let k = F((o - 40) / 300); k <= F((o + G.LW + 40) / 300); k++) {
        const wx = k * 300 + 140, X = wx - o;
        const yTop = top(wx) + 5, yBot = base + 4;
        if (yBot - yTop < 6) continue;
        rect(g, X - 1, yTop, 6, yBot - yTop, P.river);
        for (let yy = yTop; yy < yBot; yy++) {
          const s = mod(yy - F(t * 22), 5);
          rect(g, X, yy, 4, 1, s < 2 ? P.foam : P.riverL);
          if (s === 3) rect(g, X + 1, yy, 1, 1, P.foam);
        }
        dfill(g, X - 4, yBot - 3, 12, 4, P.foam, 6 + (F(t * 6) % 2) * 4);
      }
    }
  }
  function cottage(g, P, X, y, t, k) {
    rect(g, X - 8, y - 10, 16, 11, P.outline);
    rect(g, X - 7, y - 9, 14, 10, P.wall); rect(g, X + 5, y - 9, 2, 10, P.wallD);
    rect(g, X - 2, y - 5, 4, 6, P.woodD);
    const win = P.night ? (Math.sin(t * 1.3 + k) > -0.6 ? P.window : mix(P.window, P.wall, 0.4)) : P.window;
    rect(g, X + 2, y - 8, 3, 3, win); rect(g, X - 6, y - 8, 3, 3, win);
    if (P.night) { dfill(g, X + 1, y - 9, 5, 5, P.window, 4); dfill(g, X - 7, y - 9, 5, 5, P.window, 4); }
    rect(g, X + 3, y - 19, 3, 6, P.outline); rect(g, X + 4, y - 18, 1, 5, P.stoneD);
    for (let j = 0; j < 7; j++) rect(g, X - (3 + j) - 1, y - 16 + j, 8 + 2 * j, 1, j === 6 ? P.roofD : j === 0 ? P.outline : P.roof);
    for (let i = 0; i < 3; i++) {
      const ph = fract(t * 0.35 + i / 3 + hash(k) * 0.3);
      const sx = X + 4 + R(ph * 6 + Math.sin(ph * 6 + k) * 1.2), sy = y - 20 - R(ph * 16);
      disc(g, sx, sy, ph < 0.45 ? 1 : 2, ph > 0.7 ? pat(P.smoke, 7) : P.smoke);
    }
  }
  function windmill(g, P, X, y, t, k) {
    for (let j = 0; j < 22; j++) {
      const hw = 3 + F(j / 8);
      rect(g, X - hw - 1, y - 22 + j, 2 * hw + 3, 1, P.outline);
      rect(g, X - hw, y - 22 + j, 2 * hw + 1, 1, P.wall);
      rect(g, X + hw - 1, y - 22 + j, 2, 1, P.wallD);
    }
    rect(g, X - 1, y - 5, 3, 5, P.woodD);
    for (let j = 0; j < 4; j++) rect(g, X - 1 - j, y - 26 + j, 3 + 2 * j, 1, j === 0 ? P.outline : P.roof);
    const hx = X, hy = y - 21, a = t * 1.25 + k;
    for (let b = 0; b < 4; b++) {
      const ang = a + b * TAU / 4, c = Math.cos(ang), s = Math.sin(ang);
      line(g, hx, hy, hx + c * 14, hy + s * 14, P.woodD);
      const px = -s * 2.4, py = c * 2.4;
      line(g, hx + c * 5 + px, hy + s * 5 + py, hx + c * 14 + px, hy + s * 14 + py, P.white);
      line(g, hx + c * 14, hy + s * 14, hx + c * 14 + px, hy + s * 14 + py, P.woodD);
    }
    rect(g, hx - 1, hy - 1, 2, 2, P.gold);
  }
  function tree(g, P, X, y, kind, t, k) {
    const sway = R(Math.sin(t * 1.7 + k * 1.3) * 0.7);
    if (kind === 1) {
      rect(g, X, y - 4, 2, 4, P.trunk);
      for (let tier = 0; tier < 3; tier++) {
        const ty = y - 5 - tier * 4;
        for (let r = 0; r < 6; r++) {
          const hw = (r >> 1) + 2 - tier;
          rect(g, X + 1 - hw + (tier === 2 ? sway : 0), ty - 6 + r, hw * 2, 1, r === 0 && tier === 2 ? P.treeL : P.treeD);
          rect(g, X + 1 - hw + (tier === 2 ? sway : 0), ty - 6 + r, Math.max(1, hw - 1), 1, P.tree);
        }
      }
    } else {
      rect(g, X, y - 6, 2, 6, P.trunk);
      const r = 5 + (k % 2);
      disc(g, X + 1 + sway, y - 10, r + 1, P.treeD);
      disc(g, X + 1 + sway, y - 10, r, P.tree);
      disc(g, X - 1 + sway, y - 12, r - 2, P.treeL);
      dfill(g, X - r + 2 + sway, y - 7, r * 2 - 2, 2, P.treeD, 8);
    }
  }
  function hills(g, G, P, t, cx) {
    const LW = G.LW, LH = G.LH;
    // Back hill with the village.
    const o1 = R(cx * 0.22), b1 = R(LH * 0.8);
    const top1 = (wx) => R(b1 - 7 - 13 * (0.5 + 0.5 * ridge(wx, 33, 300, 3)));
    for (let X = 0; X < LW; X++) { const y = top1(X + o1); rect(g, X, y, 1, LH - y, P.hillBack); rect(g, X, y, 1, 2, P.hillBackL); }
    for (let k = F((o1 - 60) / 9); k <= F((o1 + LW + 60) / 9); k++) {
      if (hash(k * 1.7) < 0.55) continue;
      const wx = k * 9, X = wx - o1, y = top1(wx);
      disc(g, X, y + 1, 2 + F(hash(k) * 2), P.treeD); rect(g, X - 1, y - 1, 2, 1, P.tree);
    }
    for (let k = F((o1 - 80) / 520); k <= F((o1 + LW + 80) / 520); k++) {
      const wx = k * 520 + 230, X = wx - o1;
      cottage(g, P, X, top1(wx) + 2, t, k);
      cottage(g, P, X + 22, top1(wx + 22) + 2, t, k + 0.5);
      windmill(g, P, X + 46, top1(wx + 46) + 2, t, k);
    }
    // Front hill with its own trees.
    const o2 = R(cx * 0.34), b2 = R(LH * 0.835);
    const top2 = (wx) => R(b2 - 4 - 9 * (0.5 + 0.5 * ridge(wx, 44, 240, 3)));
    for (let X = 0; X < LW; X++) { const y = top2(X + o2); rect(g, X, y, 1, LH - y, P.hillFront); rect(g, X, y, 1, 2, P.hillFrontL); dfill(g, X, y + 2, 1, 2, P.hillFrontL, 6); }
    for (let k = F((o2 - 30) / 15); k <= F((o2 + LW + 30) / 15); k++) {
      const h = hash(k * 3.1);
      if (h < 0.42) continue;
      const wx = k * 15 + R(hash(k + 0.5) * 7), X = wx - o2;
      tree(g, P, X, top2(wx) + 2, h > 0.8 ? 1 : 0, t, k);
    }
  }
  function river(g, G, P, t, cx) {
    const y = R(G.LH * 0.835), o = cx * 0.5;
    rect(g, 0, y, G.LW, 7, P.river);
    rect(g, 0, y, G.LW, 1, P.grassD);
    rect(g, 0, y + 1, G.LW, 1, P.riverL);
    for (let i = 0; i < 30; i++) {
      const X = mod(hash(i) * G.LW * 2 - o - t * (7 + hash(i + 2) * 7), G.LW + 10) - 5;
      const yy = y + 2 + F(hash(i + 4) * 4), len = 2 + F(hash(i + 6) * 4);
      if (Math.sin(t * 4 + i * 1.7) > -0.3) rect(g, X, yy, len, 1, i % 3 ? P.riverL : P.foam);
    }
    return y + 7;
  }
  function meadow(g, G, P, t, cx, y0) {
    const pt = R(G.LH * 0.925), o = R(cx * 0.7);
    rect(g, 0, y0, G.LW, pt - y0, P.meadow);
    rect(g, 0, y0, G.LW, 1, P.grassD); dfill(g, 0, y0 + 1, G.LW, 2, P.grass, 8);
    dfill(g, 0, pt - 4, G.LW, 2, P.meadowL, 6);
    for (let k = F((o - 10) / 11); k <= F((o + G.LW + 10) / 11); k++) {
      const X = k * 11 + R(hash(k * 1.3) * 9) - o, yy = y0 + 4 + F(hash(k + 1.1) * Math.max(1, pt - y0 - 8));
      if (hash(k * 2.9) < 0.45) { rect(g, X, yy, 1, 2, P.grassD); rect(g, X + 2, yy + 1, 1, 1, P.grassD); continue; }
      const c = hash(k + 2.2) < 0.5 ? P.flowerA : P.flowerB, sw = Math.sin(t * 2.2 + k) > 0.55 ? 1 : 0;
      rect(g, X, yy + 1, 1, 3, P.grassD);
      rect(g, X - 1 + sw, yy, 3, 1, c); rect(g, X + sw, yy - 1, 1, 3, c); rect(g, X + sw, yy, 1, 1, P.gold);
    }
    return pt;
  }
  function road(g, G, P, t, cx, pt) {
    const o = R(cx), LW = G.LW, LH = G.LH;
    rect(g, 0, pt, LW, LH - pt, P.path);
    for (let X = 0; X < LW; X++) {
      const wx = X + o;
      const h = (mod(wx, 7) < 3 ? 2 : 1) + (hash(F(wx / 3)) > 0.6 ? 1 : 0);
      rect(g, X, pt, 1, h, P.grass); rect(g, X, pt + h, 1, 1, P.pathD);
      if (mod(wx, 23) < 12) rect(g, X, pt + 6, 1, 1, P.pathD);
      if (mod(wx + 9, 31) < 14) rect(g, X, pt + 10, 1, 1, P.pathL);
    }
    for (let k = F((o - 10) / 13); k <= F((o + LW + 10) / 13); k++) {
      const X = k * 13 + R(hash(k * 4.1) * 10) - o, y = pt + 4 + F(hash(k + 7.7) * Math.max(1, LH - pt - 6));
      rect(g, X, y, 2, 1, P.stoneL); rect(g, X, y + 1, 2, 1, P.stoneD);
    }
    // A fence along the verge.
    for (let k = F((o - 50) / 44); k <= F((o + LW + 50) / 44); k++) {
      const X = k * 44 - o;
      rect(g, X + 2, pt - 5, 42, 1, P.woodL); rect(g, X + 2, pt - 4, 42, 1, P.woodD);
      rect(g, X - 1, pt - 9, 4, 10, P.outline); rect(g, X, pt - 8, 2, 9, P.wood); rect(g, X, pt - 8, 1, 9, P.woodL);
    }
  }
  function motes(g, G, P, t, cx) {
    for (let i = 0; i < 24; i++) {
      const X = mod(hash(i * 1.9) * G.LW * 1.6 + t * (2 + hash(i + 1) * 4) - cx * 0.5, G.LW + 10) - 5;
      const Y = G.LH * (0.22 + 0.62 * hash(i + 2.5)) + Math.sin(t * 1.1 + i * 2) * 5;
      const on = Math.sin(t * 2.6 + i * 1.9);
      if (on < 0.1) continue;
      if (P.night) { disc(g, X, Y, 2, pat(P.mote, 4)); rect(g, X, Y, 1, 1, P.mote); }
      else sparkle(g, X, Y, on > 0.85 ? 1 : 0, P.mote);
    }
  }
  // A patchwork hot-air balloon drifting through the middle sky.
  function balloon(g, P, X, Y, r, t, k) {
    X = R(X); Y = R(Y + Math.sin(t * 1.1 + k) * 2);
    const cols = [P.acc, P.paper, P.gold, P.paper];
    disc(g, X, Y, r + 1, P.outline);
    for (let dy = -r; dy <= r; dy++) {
      const hw = F(Math.sqrt(Math.max(0, r * r - dy * dy)) + 0.35);
      for (let dx = -hw; dx <= hw; dx++) {
        const band = F(((dx / Math.max(1, hw)) + 1) * 2.5);
        rect(g, X + dx, Y + dy, 1, 1, cols[band % cols.length]);
      }
    }
    disc(g, X - R(r * 0.4), Y - R(r * 0.4), Math.max(1, R(r * 0.25)), alpha(P.white, 0.6));
    for (let j = 0; j < 3; j++) rect(g, X - R(r * 0.6) + j, Y + r + j, R(r * 1.2) - 2 * j + 1, 1, P.outline);
    line(g, X - 3, Y + r + 2, X - 2, Y + r + 7, P.outline); line(g, X + 3, Y + r + 2, X + 2, Y + r + 7, P.outline);
    rect(g, X - 3, Y + r + 7, 7, 5, P.outline); rect(g, X - 2, Y + r + 8, 5, 3, P.wood); rect(g, X - 2, Y + r + 8, 5, 1, P.woodL);
    if (F(t * 3 + k) % 3 === 0) { rect(g, X - 1, Y + r + 4, 2, 2, P.gold); rect(g, X, Y + r + 3, 1, 1, P.goldL); }
  }
  function lowClouds(g, G, P, t, cx) {
    const span = G.LW + 120;
    for (let i = 0; i < 4; i++) {
      const s = cloudSprite(P, i + 20);
      const x = mod(hash(i * 4.7 + 1) * span - t * (5 + i * 1.5) - cx * 0.1, span) - 60;
      g.drawImage(s, R(x), R(G.LH * (0.46 + 0.1 * hash(i + 31))));
    }
  }
  function world(g, G, P, t, cx) {
    sky(g, G, P);
    if (P.night) stars(g, G, P, t);
    sun(g, G, P, t);
    clouds(g, G, P, t, cx);
    birds(g, G, P, t);
    mountains(g, G, P, t, cx * 0.06, false);
    {
      const span = G.LW + 80;
      balloon(g, P, mod(G.LW * 0.78 - t * 3 - cx * 0.05, span) - 40, G.LH * 0.5 - t * 0.4, 8, t, 1);
      balloon(g, P, mod(G.LW * 0.3 - t * 2 - cx * 0.04, span) - 40, G.LH * 0.36 + Math.sin(t * 0.4) * 3, 5, t, 2);
    }
    lowClouds(g, G, P, t, cx);
    mountains(g, G, P, t, cx * 0.13, true);
    hills(g, G, P, t, cx);
    const y0 = river(g, G, P, t, cx);
    const pt = meadow(g, G, P, t, cx, y0);
    road(g, G, P, t, cx, pt);
    motes(g, G, P, t, cx);
  }
  // The road camera drifts and dashes ahead at every scene change.
  function camX(info, G) {
    const ch = Math.max(0.1, info.change || 0.45);
    let i = info.index, local = info.local;
    if (i < 0) { const c = controls(); i = ["title_hold", "chart_hold", "object_hold", "people_hold", "process_hold", "compare_hold", "closing_hold"].filter((k) => Number(c[k] ?? 1) > 0).length - 1; local = 99; }
    let k = Math.max(0, i);
    if (i >= 1 && local < ch) k = i - 1 + eio((local + 0.15 * ch) / (1.15 * ch));
    else if (info.next && info.hold - local < 0.15 * ch) k = i + eio((local - (info.hold - 0.15 * ch)) / (1.15 * ch));
    return info.t * 5 + k * G.LW * 0.62;
  }

  // ---- the checker-dither change -------------------------------------------------------------------------------------
  // Cells of a 4 x 4 ordered dither sweep left to right: "out" removes the cells "in" keeps, so the two
  // drawings exchange pixel for pixel.
  function dither(g, G, e, mode) {
    // The mask is built whole first: destination-in clears everything outside the shape it draws.
    const m = layer("mask", G);
    const strips = 10, sw = Math.ceil(G.LW / strips);
    for (let s = 0; s < strips; s++) {
      const lv = clamp(e * 1.7 - (s / (strips - 1)) * 0.7) * 16;
      m.fillStyle = pat("#000000", lv, 2);
      m.fillRect(s * sw, 0, sw, G.LH);
    }
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = mode === "out" ? "destination-out" : "destination-in";
    g.drawImage(m.canvas, 0, 0);
    g.restore();
  }

  // ---- scene: chart (a row of brick towers) ----------------------------------------------------------------------------
  function brickRow(g, x, y, w, r, C, shine) {
    rect(g, x, y, w, 6, shine ? C[1] : C[0]);
    rect(g, x, y, w, 1, shine ? "#ffffff" : C[1]);
    rect(g, x, y + 5, w, 1, C[2]);
    for (let jx = x + (r % 2 ? 4 : 8); jx < x + w - 1; jx += 8) rect(g, jx, y + 1, 1, 4, C[2]);
  }
  function tower(g, P, cx, deckY, w, rows, shown, fall, hi, t) {
    const x = R(cx - w / 2), b0 = deckY - 4;
    const C = hi ? [P.acc, P.accL, P.accD] : [P.stone, P.stoneL, P.stoneD];
    rect(g, x - 3, deckY - 4, w + 6, 4, P.outline); rect(g, x - 2, deckY - 3, w + 4, 3, P.stoneD); rect(g, x - 2, deckY - 3, w + 4, 1, P.stone);
    if (shown > 0) {
      rect(g, x - 1, b0 - shown * 6 - 1, w + 2, shown * 6 + 1, P.outline);
      const shine = shown >= rows ? F(fract(t * 0.7 + cx * 0.01) * (rows + 8)) : -1;
      for (let r = 0; r < shown; r++) brickRow(g, x, b0 - (r + 1) * 6, w, r, C, hi && r === shine);
    }
    if (fall > 0 && shown < rows) {
      const yT = b0 - (shown + 1) * 6, yy = R(yT - (1 - eo(fall)) * 34);
      rect(g, x - 1, yy - 1, w + 2, 8, P.outline); brickRow(g, x, yy, w, shown, C, false);
    }
    if (shown >= rows) {
      const ty = b0 - rows * 6;
      const ms = w >= 20 ? [x, x + R(w / 2) - 2, x + w - 4] : [x, x + w - 4];
      for (const mx of ms) { rect(g, mx - 1, ty - 5, 6, 6, P.outline); rect(g, mx, ty - 4, 4, 4, C[0]); rect(g, mx, ty - 4, 4, 1, C[1]); }
    }
  }
  function chartScene(g, G, P, B, d, L) {
    const lc = L.local, t = L.t;
    const hb = headline(g, G, P, d.span || dom("chart-title"), lc);
    const vals = d.values.map((v) => Math.max(0, Number(v) || 0));
    const n = vals.length, max = Math.max(1e-6, ...vals);
    const hi = Number.isFinite(d.highlight) && d.highlight >= 0 && d.highlight < n ? d.highlight : -1;
    const top = Math.max(R(B.y), hb + 5), ground = R(B.y + B.h);
    const slot = B.w / n;
    const lab = d.labels.map((s) => wrap(s, charsFor(slot - 8, 1)).slice(0, 2));
    const labH = Math.max(1, ...lab.map((a) => a.length)) * 9 + 4;
    const labY = ground - labH, deckY = labY - 4;
    rect(g, B.x - 6, deckY, B.w + 12, 4, P.outline); rect(g, B.x - 5, deckY + 1, B.w + 10, 2, P.wood); rect(g, B.x - 5, deckY + 1, B.w + 10, 1, P.woodL);
    const tw0 = Math.max(12, Math.min(34, F(slot * 0.56 / 2) * 2));
    const maxH = Math.max(18, deckY - 4 - (top + 34));
    let heroAt = null;
    // Towers rise one after another across the whole hold, each counting its value up as it builds.
    const span = Math.max(1.2, L.hold - (L.change || 0.45) - 0.55);
    const dur = Math.min(1.1, span * 0.42), step = n > 1 ? (span - dur - 0.05) / (n - 1) : 0;
    const times = vals.map((_, i) => [0.05 + i * step, 0.05 + i * step + dur]);
    vals.forEach((v, i) => {
      const cx = R(B.x + slot * (i + 0.5)), isHi = i === hi;
      const rows = Math.max(1, R((maxH * v / max) / 6));
      const [t0, t1] = times[i];
      const q = seg(lc, t0, t1);
      const built = q * rows, shown = Math.min(rows, F(built + 1e-6));
      tower(g, P, cx, deckY, tw0, rows, shown, built - shown, isHi, t);
      const topY = deckY - 4 - Math.max(1, Math.min(rows, built)) * 6 - (q >= 1 ? 0 : 0);
      const final = fmt(v, 1, d.prefix, d.suffix);
      const sc = isHi && tw(final, 3) <= slot - 8 ? 3 : tw(final, 2) <= slot - 8 ? 2 : 1;
      const nh = 7 * sc + 6, nw = tw(final, sc) + 8, ny = topY - 7 - nh;
      plaque(g, P, cx - nw / 2, ny, nw, nh, isHi ? P.acc : P.paper);
      const str = fmt(v, eo(q), d.prefix, d.suffix);
      txt(g, str, cx - tw(str, sc) / 2, ny + 3, sc, isHi ? P.onAcc : P.ink, sc > 1 ? (isHi ? P.accD : P.paperDeep) : null);
      label(g, P, "", cx, labY, slot, { lines: lab[i] });
      if (isHi) {
        heroAt = { cx, t1, ny, nw, nh };
        if (q >= 1) for (let s = 0; s < 4; s++) {
          const ph = fract(t * 0.9 + s * 0.25);
          const a = s * 1.7 + 0.6;
          sparkle(g, cx + Math.cos(a) * (nw / 2 + 6), ny + nh / 2 + Math.sin(a) * (nh / 2 + 5) - ph * 6, ph < 0.5 ? 1 : 0, ph < 0.7 ? P.goldL : P.gold);
        }
      }
    });
    // The hero walks the deck from tower to tower, cheering each one up, and hops at the tallest.
    {
      const sideX = (i) => Math.min(B.x + B.w - 4, R(B.x + slot * (i + 0.5) + tw0 / 2 + 6));
      let hx = sideX(0) - 30, walking = true, cur = 0;
      for (let i = 0; i < n; i++) {
        const [t0, t1] = times[i];
        const from = i === 0 ? sideX(0) - 30 : sideX(i - 1);
        if (lc < t0 + 0.25) { hx = from + (sideX(i) - from) * eio(seg(lc, t0 - Math.max(0.3, step * 0.6) + 0.25, t0 + 0.25)); walking = lc > t0 - Math.max(0.3, step * 0.6) + 0.25; cur = i; break; }
        hx = sideX(i); walking = false; cur = i;
      }
      const lastDone = lc > times[n - 1][1];
      const atHi = hi >= 0 && cur === hi;
      const jp = fract(Math.max(0, lc - times[cur][1]) / 0.7);
      const cheer = !walking && lc > times[cur][1];
      const jy = cheer && (atHi || lastDone) && jp < 0.4 ? R(Math.sin(jp / 0.4 * Math.PI) * 6) : 0;
      hero(g, P, R(hx), deckY - jy, { frame: walking ? F(lc * 9) : -1, arms: walking ? 0 : jy > 0 ? 1 : cheer ? 2 : 3, open: walking ? 0 : (F(lc * 8) % 2), look: walking ? 1 : -1, blink: blinkAt(t, 3) });
    }
  }

  // ---- scene: object (a pixel laptop or phone running a tiny editor) ---------------------------------------------------
  function screenUI(g, P, sx, sy, sw, sh, phone, t, lc) {
    rect(g, sx, sy, sw, sh, P.screen);
    rect(g, sx, sy, sw, 3, P.screenL);
    for (let i = 0; i < 3; i++) rect(g, sx + 2 + i * 3, sy + 1, 1, 1, i === 0 ? P.acc : P.screenHi);
    const px0 = sx + 3, py0 = sy + 5;
    const pw = phone ? sw - 6 : R(sw * 0.6), ph = phone ? R(sh * 0.36) : R(sh * 0.5);
    // Preview: a tiny looping landscape with its own sun.
    rect(g, px0 - 1, py0 - 1, pw + 2, ph + 2, P.screenHi);
    rect(g, px0, py0, pw, R(ph * 0.55), P.sky[2]);
    rect(g, px0, py0 + R(ph * 0.55), pw, ph - R(ph * 0.55), P.sky[5]);
    disc(g, px0 + 4 + fract(t * 0.18) * (pw - 8), py0 + R(ph * 0.35) + R(Math.sin(t * 1.3) * 1.5), 2, P.sun);
    for (let X = 0; X < pw; X++) {
      const hy = py0 + ph - 3 - R(2 + 2 * Math.sin((X + t * 12) / 6));
      rect(g, px0 + X, hy, 1, py0 + ph - hy, P.hillFront);
      rect(g, px0 + X, hy, 1, 1, P.hillFrontL);
    }
    rect(g, px0, py0 + ph - 2, pw, 2, P.path);
    hero(g, P, px0 + R(pw * 0.5), py0 + ph - 1 - (F(t * 4) % 2), { frame: F(t * 8), look: 1 });
    // Dials: a side panel on the laptop, two rows under the preview on the phone.
    // Dials: someone keeps tweaking them, each knob gliding to a new setting in turn.
    const dialV = (i) => {
      const per = 1.15, ph = lc / per + i * 0.37, k = F(ph);
      const a = 0.15 + 0.7 * hash(k * 7.3 + i * 3.1), b = 0.15 + 0.7 * hash((k + 1) * 7.3 + i * 3.1);
      return a + (b - a) * eio(seg(fract(ph), 0.1, 0.65));
    };
    const dials = phone ? { x: px0 + 1, y: py0 + ph + 4, w: pw - 2, rows: 2, gap: 6 } : { x: px0 + pw + 5, y: py0 + 3, w: sx + sw - (px0 + pw + 5) - 4, rows: 4, gap: Math.max(6, F((ph - 2) / 4)) };
    for (let i = 0; i < dials.rows; i++) {
      const yy = dials.y + i * dials.gap;
      const v = dialV(i), kx = dials.x + R(v * (dials.w - 4));
      rect(g, dials.x, yy, dials.w, 2, P.screenHi);
      rect(g, dials.x, yy, kx - dials.x, 2, i === 0 ? P.acc : P.riverL);
      for (let m = 0; m <= 4; m++) rect(g, dials.x + R(m * (dials.w - 1) / 4), yy + 3, 1, 1, P.screenHi);
      rect(g, kx - 1, yy - 2, 5, 6, P.outline); rect(g, kx, yy - 1, 3, 4, i === 0 ? P.accL : P.metalL); rect(g, kx, yy - 1, 3, 1, P.white);
    }
    // Timeline: the proposed clip on its own track over the original clips; it resizes with the first dial.
    const tlx = sx + 3, tlw = sw - 6, tly = sy + sh - R(sh * 0.34), tlh = sy + sh - 3 - tly;
    const th = Math.max(3, F((tlh - 2) / 2));
    rect(g, tlx, tly, tlw, th, P.screenL); rect(g, tlx, tly + th + 2, tlw, th, P.screenL);
    const ax = tlx + R(tlw * 0.22), aw = Math.max(6, R(tlw * (0.16 + 0.42 * dialV(0))));
    const phx = tlx + R(fract(lc * 0.4 + 0.05) * tlw);
    const playing = phx >= ax && phx < ax + aw;
    rect(g, ax, tly, aw, th, playing ? P.accL : P.acc);
    const blink = F(t * 4) % 2;
    rect(g, ax, tly, aw, 1, blink ? P.accL : P.white); rect(g, ax, tly + th - 1, aw, 1, P.accD);
    rect(g, ax + aw - 1, tly, 1, th, P.white);
    rect(g, ax + 2, tly + R(th / 2) - 1, 3, 1, P.white); rect(g, ax + 3, tly + R(th / 2) - 2, 1, 3, P.white);
    const segs = [[0, 0.24], [0.26, 0.58], [0.6, 0.83], [0.85, 1]];
    segs.forEach(([a, b], i) => rect(g, tlx + R(tlw * a), tly + th + 2, R(tlw * (b - a)), th, i % 2 ? P.slateL : P.mtnNear));
    for (let k = 0; k < tlw; k += 3) rect(g, tlx + k, tly + th + 2 + th - 1, 1, 1, P.screenHi);
    rect(g, phx, tly - 2, 2, tlh + 3, P.white); rect(g, phx - 1, tly - 4, 4, 2, P.white); rect(g, phx, tly - 5, 2, 1, P.white);
    return {
      targets: [[px0 + R(pw * 0.72), py0 + R(ph * 0.3)], [ax + R(aw / 2), tly + R(th / 2)], [tlx + R(tlw * 0.72), tly + th + 2 + R(th / 2)]],
    };
  }
  function objectScene(g, G, P, B, d, L) {
    const lc = L.local, t = L.t;
    const hb = headline(g, G, P, dom("object-title"), lc);
    const top = Math.max(R(B.y), hb + 7), bottom = R(B.y + B.h);
    const phone = d.kind === "phone";
    const calls = d.callouts.slice(0, 3);
    const stack = G.narrow;
    const CS0 = 2;
    const estPhone = R((bottom - top - 20) * 0.56) + 16;
    const colW = stack ? B.w : phone ? Math.min(200, R(B.w - estPhone - 30)) : Math.min(176, R(B.w * 0.5));
    const maxL = 2;
    const CS = calls.every((c) => fits(c, charsFor(colW - 26, CS0), maxL)) ? CS0 : 1;
    const lines = calls.map((c) => wrap(c, charsFor(colW - 26, CS)).slice(0, CS === 1 ? 3 : maxL));
    const hts = lines.map((l) => boxH(l.length, CS));
    const stackH = hts.reduce((a, b) => a + b + 5, 0);
    const area = stack ? { x: B.x, y: top, w: B.w, h: bottom - top - stackH - 8 } : { x: B.x, y: top, w: B.w - colW - 14, h: bottom - top };
    let sw, sh;
    if (phone) { sh = Math.max(30, area.h - 20); sw = R(sh * 0.56); if (sw > area.w - 16) { sw = area.w - 16; sh = R(sw / 0.56); } }
    else { sw = Math.min(area.w - 12, R((area.h - 16) * 1.62)); sh = R(sw / 1.62); }
    sw = Math.max(24, sw); sh = Math.max(18, sh);
    const sx = R(area.x + (area.w - sw) / 2), sy0 = R(area.y + Math.max(4, (area.h - sh - (phone ? 12 : 14)) / 2) + (phone ? 6 : 4));
    const drop = seg(lc, 0, 0.38);
    const sy = sy0 - R((1 - land(drop)) * 40 / 2) * 2;
    // Table under the device: present from the first frame.
    const deskY = phone ? sy0 + sh + 7 : sy0 + sh + 10;
    if (!phone) {
      rect(g, sx - 22, deskY, sw + 44, 5, P.outline); rect(g, sx - 21, deskY + 1, sw + 42, 3, P.wood); rect(g, sx - 21, deskY + 1, sw + 42, 1, P.woodL);
      const legH = Math.min(bottom, area.y + area.h) - deskY - 5;
      if (legH > 3) for (const lx of [sx - 16, sx + sw + 12]) { rect(g, lx - 1, deskY + 5, 5, legH, P.outline); rect(g, lx, deskY + 5, 3, legH, P.woodD); }
    } else {
      line(g, sx + 4, sy0 + sh, sx - 6, deskY + 10, P.woodD); line(g, sx + sw - 4, sy0 + sh, sx + sw + 6, deskY + 10, P.woodD);
      rect(g, sx - 10, deskY, sw + 20, 4, P.outline); rect(g, sx - 9, deskY + 1, sw + 18, 2, P.wood);
    }
    // Device body.
    if (phone) {
      rect(g, sx - 4, sy - 7, sw + 8, sh + 14, P.outline);
      rect(g, sx - 3, sy - 8, sw + 6, sh + 16, P.outline);
      rect(g, sx - 3, sy - 6, sw + 6, sh + 12, P.slate); rect(g, sx - 3, sy - 6, sw + 6, 1, P.slateL);
      rect(g, sx + R(sw / 2) - 4, sy - 4, 8, 1, P.screenHi);
      rect(g, sx + R(sw / 2) - 5, sy + sh + 3, 10, 1, P.slateL);
    } else {
      rect(g, sx - 5, sy - 5, sw + 10, sh + 10, P.outline);
      rect(g, sx - 4, sy - 4, sw + 8, sh + 8, P.metal); rect(g, sx - 4, sy - 4, sw + 8, 1, P.metalL);
      rect(g, sx - 2, sy - 2, sw + 4, sh + 4, P.slateD);
      rect(g, sx + R(sw / 2), sy - 3, 1, 1, P.screenHi);
      for (let j = 0; j < 6; j++) {
        const ext = 4 + j * 2;
        rect(g, sx - 4 - ext + 4, sy + sh + 5 + j, sw + 8 + (ext - 4) * 2, 1, j === 0 ? P.metalL : j === 5 ? P.metalD : P.metal);
      }
      rect(g, sx - 11, sy + sh + 5, 1, 6, P.outline); rect(g, sx + sw + 10, sy + sh + 5, 1, 6, P.outline); rect(g, sx - 10, sy + sh + 11, sw + 20, 1, P.outline);
      for (let k = 0; k < F((sw + 4) / 4); k++) rect(g, sx + k * 4, sy + sh + 7 + (k % 2), 2, 1, P.metalD);
    }
    const ui = screenUI(g, P, sx, sy, sw, sh, phone, t, lc);
    // Screen switch-on: a bright line opens into the picture.
    const so = seg(lc, 0.22, 0.48);
    if (so < 1) {
      const band = R(sh / 2 * eo(so));
      rect(g, sx, sy, sw, R(sh / 2) - band, P.slateD); rect(g, sx, sy + R(sh / 2) + band, sw, sh - R(sh / 2) - band, P.slateD);
      rect(g, sx, sy + R(sh / 2) - band, sw, 1, P.white); rect(g, sx, sy + R(sh / 2) + band, sw, 1, P.white);
    }
    if (drop >= 0.6 && drop < 1) { dfill(g, sx - 10, deskY - 3, 8, 3, P.white, 8); dfill(g, sx + sw + 2, deskY - 3, 8, 3, P.white, 8); }
    // Callouts with numbered badges and marching leader lines.
    let cy = stack ? bottom - stackH + 5 : 0;
    // Callouts arrive one at a time across the hold; the newest is lit, then the focus cycles.
    const cStep = Math.max(0.35, (L.hold - (L.change || 0.45) - 1.3) / Math.max(1, calls.length - 1));
    const cAt = calls.map((_, i) => 0.55 + i * cStep);
    const allIn = lc > cAt[calls.length - 1] + 0.5;
    const active = allIn ? F((lc - cAt[calls.length - 1] - 0.5) / 0.7) % calls.length : Math.max(0, cAt.filter((a) => lc >= a).length - 1);
    let heroTo = null;
    calls.forEach((c, i) => {
      const q = seg(lc, cAt[i], cAt[i] + 0.4);
      if (q <= 0) return;
      const h = hts[i];
      const w = Math.max(...lines[i].map((l) => tw(l, CS))) + 26;
      let x, y;
      if (stack) { x = R(B.x + (B.w - w) / 2); y = cy; cy += h + 5; }
      else {
        const gapY = Math.max(2, (bottom - top - hts.reduce((a2, b2) => a2 + b2, 0)) / (calls.length + 1));
        x = R(B.x + B.w - colW + (colW - w) / 2); y = R(top + gapY * (i + 1) + hts.slice(0, i).reduce((a2, b2) => a2 + b2, 0));
      }
      const off = R((1 - eo(q)) * 18);
      if (stack) y += off; else x += off;
      const [tx, ty] = ui.targets[i];
      const ax = stack ? x + w : x - 1, ay = y + R(h / 2);
      if (q > 0.4) {
        const k = seg(q, 0.4, 1);
        if (stack) {
          // Elbow round the right-hand gutter so leaders never cross the other plaques.
          const gx = R(Math.min(G.LW - 4, B.x + B.w + 6) - i * 3);
          const pts = [[ax, ay], [gx, ay], [gx, ty], [tx, ty]];
          const lens = pts.slice(1).map((pt, j) => Math.abs(pt[0] - pts[j][0]) + Math.abs(pt[1] - pts[j][1]));
          let left = k * lens.reduce((a, b) => a + b, 0);
          for (let j = 0; j < 3 && left > 0; j++) {
            const f = Math.min(1, left / Math.max(1, lens[j]));
            line(g, pts[j][0], pts[j][1], pts[j + 1][0], pts[j + 1][1], P.outline, 3, -lc * 14, f);
            line(g, pts[j][0] + 1, pts[j][1] + 1, pts[j + 1][0] + 1, pts[j + 1][1] + 1, i === active ? P.gold : P.goldL, 3, -lc * 14, f);
            left -= lens[j];
          }
        } else {
          line(g, ax, ay, tx, ty, P.outline, 3, -lc * 14, k);
          line(g, ax, ay + 1, tx, ty + 1, i === active ? P.gold : P.goldL, 3, -lc * 14, k);
        }
      }
      const on = i === active;
      if (q >= 1) {
        const b = F(lc * 4 + i) % 2, r = on ? 3 + b : 2;
        rect(g, tx - r, ty - r, 2 * r + 1, 2 * r + 1, P.outline); rect(g, tx - r + 1, ty - r + 1, 2 * r - 1, 2 * r - 1, b ? P.gold : P.goldL);
        if (on) rect(g, tx, ty, 1, 1, P.white);
      }
      plaque(g, P, x, y, w, h, on ? P.paperHi : P.paper);
      if (on && q >= 1 && F(lc * 4) % 2 === 0) { rect(g, x - 1, y - 1, w + 2, 1, P.gold); rect(g, x - 1, y + h, w + 2, 1, P.gold); }
      rect(g, x + 2, y + 2, 15, h - 4, i === 1 ? P.acc : P.wood);
      const ns = h >= 18 ? 2 : 1;
      txt(g, String(i + 1), x + (ns === 2 ? 5 : 7), y + R((h - 7 * ns) / 2), ns, i === 1 ? P.onAcc : P.paper);
      lines[i].forEach((ln, j) => txt(g, ln, x + 21, y + 4 + j * lineH(CS), CS, P.ink));
      if (on) heroTo = tx;
    });
    // The hero walks along the desk to stand under whichever part is being explained.
    {
      const hy = deskY;
      const lo = sx - 14, hi = sx + sw + 12;
      const goal = heroTo == null ? lo : clamp(heroTo, lo, hi);
      // Ease towards the goal from the previous goal over the first 0.45 s after each change.
      const prevI = allIn ? (active + calls.length - 1) % calls.length : active - 1;
      const since = allIn ? fract((lc - cAt[calls.length - 1] - 0.5) / 0.7) * 0.7 : lc - cAt[active];
      const prevGoal = prevI < 0 ? lo : clamp(ui.targets[prevI][0], lo, hi);
      const k = eio(seg(since, 0, 0.45));
      const hx = prevGoal + (goal - prevGoal) * k;
      const walking = k > 0 && k < 1 && Math.abs(goal - prevGoal) > 2;
      const hop = !walking && since < 0.75 ? R(Math.sin(seg(since, 0.45, 0.75) * Math.PI) * 5) : 0;
      hero(g, P, R(hx), hy - hop, { frame: walking ? F(lc * 9) : -1, dir: goal >= prevGoal ? 1 : -1, look: goal >= prevGoal ? 1 : -1, arms: walking ? 0 : hop > 0 ? 1 : 3, open: walking ? 0 : 1, blink: blinkAt(t, 4) });
    }
  }

  // ---- scene: people (villagers drop in under their name boards) ------------------------------------------------------
  function voteBubble(g, P, bx, by, kind, pop) {
    const s = pop ? 1 : 0;
    rect(g, bx - s, by - s, 13 + 2 * s, 11 + 2 * s, P.outline); rect(g, bx + 1 - s, by - 1 - s, 11 + 2 * s, 13 + 2 * s, P.outline);
    rect(g, bx + 1 - s, by - s, 11 + 2 * s, 11 + 2 * s, P.white);
    rect(g, bx - 1, by + 11, 2, 3, P.outline); rect(g, bx, by + 10, 2, 2, P.white);
    bmp(g, ICONS[kind], bx + 3, by + 2, kind === "check" ? P.green : kind === "star" ? P.gold : P.acc);
  }
  function peopleScene(g, G, P, B, d, L) {
    const lc = L.local, t = L.t;
    const hb = headline(g, G, P, dom("people-title"), lc);
    const n = clamp(R(Number(d.count) || 3), 1, 6);
    const hiI = Math.min(n - 1, d.highlight ?? 1);
    const ground = R(B.y + B.h) - 3;
    const spacing = Math.min(B.w / n, G.narrow ? 46 : 56);
    const x0 = B.x + B.w / 2 - spacing * (n - 1) / 2;
    // A mown strip of meadow for them to stand on.
    rect(g, B.x - 4, ground - 1, B.w + 8, 4, P.outline);
    rect(g, B.x - 3, ground, B.w + 6, 2, P.grass); dfill(g, B.x - 3, ground, B.w + 6, 1, P.meadowL, 8);
    for (let k = 0; k < F(B.w / 9); k++) { const X = R(B.x + k * 9 + hash(k) * 5); const c = k % 3 ? P.flowerA : P.flowerB; rect(g, X, ground - 2, 1, 2, P.grassD); rect(g, X - 1, ground - 3, 3, 1, c); }
    // Votes go round one person at a time across the hold.
    const v0 = 0.85, vs = Math.max(0.22, (L.hold - (L.change || 0.45) - v0 - 0.05) / n);
    const voteAt = Array.from({ length: n }, (_, i) => v0 + i * vs);
    const votes = voteAt.filter((a) => lc >= a).length;
    const allIn = votes >= n;
    const landT = voteAt[n - 1];
    const people = [];
    for (let i = 0; i < n; i++) {
      const cx = R(x0 + i * spacing);
      const q = seg(lc, i * 0.085, 0.42 + i * 0.085);
      const landed = q >= 1;
      const yoff = R((1 - land(q)) * 80);
      const vq = lc - voteAt[i];
      const jump = vq >= 0 && vq < 0.32 ? R(Math.sin(vq / 0.32 * Math.PI) * 7) : allIn && fract((lc - landT) / 0.9 + i * 0.2) < 0.18 ? 2 : 0;
      const bob = landed && !jump ? F(lc * 2.1 + i * 0.5) % 2 : 0;
      const blink = blinkAt(t, i + 10);
      const wave = vq >= 0 && vq < 0.5 ? 1 : i === hiI && landed && allIn ? 1 + (F(lc * 4) % 2) : 0;
      const spr = personSprite(P, i, blink, wave, i === hiI);
      const by = ground - yoff - jump;
      dfill(g, cx - 6, ground - 1, 13, 2, P.outline, R(8 * clamp(q * 1.5)) - (jump > 3 ? 4 : 0));
      g.drawImage(spr, cx - 8, by - 31 + bob);
      if (q > 0.5 && q < 0.85) { const r = R((q - 0.5) * 20); dfill(g, cx - 8 - r, ground - 3, 4, 3, P.white, 8); dfill(g, cx + 5 + r, ground - 3, 4, 3, P.white, 8); }
      people.push({ cx, headTop: ground - 29, q, landed, by });
    }
    // Name boards above the first three, each on the lowest row that leaves its neighbours clear.
    const bsc = G.narrow ? 1 : 2;
    const placed = [];
    const maxW = G.narrow ? 74 : 110;
    const pulse = allIn ? 1 - seg(fract((lc - landT) / 0.6), 0, 0.5) : 0;
    for (let i = 0; i < Math.min(3, n); i++) {
      const p = people[i];
      const words = d.badges[i];
      if (!words) continue;
      const lines = wrap(words, charsFor(maxW - padW(bsc), bsc)).slice(0, 2);
      const w = Math.max(...lines.map((l) => tw(l, bsc))) + padW(bsc), h = boxH(lines.length, bsc);
      let row = 0;
      for (;;) { const x = p.cx - w / 2; if (!placed.some((o) => o.row === row && x < o.x + o.w + 2 && x + w + 2 > o.x)) break; row++; }
      const y = p.headTop - 6 - h - row * (h + 3);
      placed.push({ x: p.cx - w / 2, w, row, y, h });
      const pq = seg(p.q, 0.75, 1);
      if (pq <= 0) continue;
      const isHi = i === hiI;
      const lift = isHi && pulse > 0 ? R(pulse * 2) : 0;
      const yy = y - R((1 - eo(pq)) * 6) - lift;
      line(g, p.cx, yy + h, p.cx, p.headTop - 3, P.woodD);
      const fill = isHi ? (pulse > 0.5 ? P.accL : P.acc) : P.paper;
      label(g, P, "", p.cx, yy, maxW, { lines, sc: bsc, fill, ink: isHi ? P.onAcc : P.ink });
      if (isHi && allIn) for (let s = 0; s < 6; s++) { const a = s * TAU / 6 + lc * 2; sparkle(g, p.cx + Math.cos(a) * (w / 2 + 6), yy + h / 2 + Math.sin(a) * (h / 2 + 5), pulse > 0.4 ? 1 : 0, s % 2 ? P.gold : P.goldL); }
    }
    // The vote bubbles: each pops as its owner jumps, then stays with a gentle bob.
    for (let i = 0; i < n; i++) {
      const vq = lc - voteAt[i];
      if (vq < 0 || !people[i].landed) continue;
      const p = people[i];
      const kind = i === hiI ? "star" : ["check", "heart", "check", "note", "check", "heart"][i % 6];
      voteBubble(g, P, p.cx + 6, p.by - 34 + (F(lc * 2 + i) % 2), kind, vq < 0.1);
      if (vq < 0.3) for (let s = 0; s < 4; s++) { const a = s * TAU / 4 + 0.6; sparkle(g, p.cx + 12 + Math.cos(a) * (6 + vq * 30), p.by - 29 + Math.sin(a) * (6 + vq * 30), 1, P.goldL); }
    }
    // A wooden tally board in the open sky counts the votes as they land.
    {
      const sc = 3, total = String(n), str = votes + "/" + total;
      const bw = Math.max(tw(n + "/" + n, sc) + 20, n * 9 + 14), bh = 7 * sc + 22;
      const minY = hb + 6, maxY = ground - 29 - 22;
      if (maxY - minY >= bh) {
        let bx = n > 3 ? (people[3].cx + people[n - 1].cx) / 2 : B.x + B.w * 0.78;
        const clash = placed.filter((o) => o.y < minY + bh + 4);
        for (const o of clash) if (bx - bw / 2 < o.x + o.w + 6 && bx + bw / 2 > o.x - 6) bx = o.x + o.w + 6 + bw / 2;
        bx = clamp(bx, B.x + bw / 2, B.x + B.w - bw / 2);
        const by = R(minY + (maxY - minY - bh) * 0.35);
        const x = R(bx - bw / 2);
        const sw = R(Math.sin(t * 1.6) * 0.6);
        line(g, x + 6, by + bh, x + 6, maxY + 6, P.woodD); line(g, x + bw - 7, by + bh, x + bw - 7, maxY + 6, P.woodD);
        frame(g, P, x + sw, by, bw, bh, P.slate);
        const popN = votes > 0 && lc - voteAt[votes - 1] < 0.12 ? 1 : 0;
        txt(g, str, x + sw + R((bw - tw(str, sc)) / 2), by + 5 - popN, sc, allIn ? P.goldL : P.white, P.outline);
        for (let i = 0; i < n; i++) {
          const lx = x + sw + R((bw - n * 9 + 2) / 2) + i * 9, ly = by + bh - 11;
          rect(g, lx, ly, 7, 5, P.outline);
          rect(g, lx + 1, ly + 1, 5, 3, i < votes ? (i === hiI ? P.gold : P.green) : P.slateD);
          if (i < votes && F(lc * 3 + i) % 3 === 0) rect(g, lx + 1, ly + 1, 2, 1, P.white);
        }
      }
    }
    // The hero trots along the front, arriving at each voter just as they vote.
    {
      const stand = (i) => people[i].cx + 13;
      let hx = B.x - 10, walking = true;
      if (lc < voteAt[0]) hx = B.x - 10 + (stand(0) - B.x + 10) * eio(seg(lc, 0.2, voteAt[0] - 0.05));
      else if (!allIn || lc < landT + 0.3) {
        const i = Math.min(n - 1, votes - 1);
        const nx = i + 1 < n ? stand(i + 1) : stand(i);
        const k = i + 1 < n ? eio(seg(lc, voteAt[i] + 0.12, voteAt[i + 1] - 0.03)) : 1;
        hx = stand(i) + (nx - stand(i)) * k; walking = k > 0 && k < 1;
      } else { hx = stand(n - 1); walking = false; }
      if (lc < voteAt[0]) walking = lc > 0.2;
      const jp = fract(Math.max(0, lc - landT - 0.3) / 0.6), jy = allIn && !walking && jp < 0.4 ? R(Math.sin(jp / 0.4 * Math.PI) * 6) : 0;
      hero(g, P, R(hx), ground - jy, { frame: walking ? F(lc * 9) : -1, look: walking ? 1 : -1, arms: walking ? 0 : jy > 0 ? 1 : 3, open: walking ? 0 : 1, blink: blinkAt(t, 6) });
    }
  }

  // ---- scene: process (the hero walks the road past three stations) ---------------------------------------------------
  function stationIcon(g, P, kind, x, y, lit, t, lc) {
    const O = P.outline;
    if (kind === 0) {
      rect(g, x + 1, y + 3, 15, 11, O); rect(g, x + 2, y + 4, 13, 9, P.sky[2]);
      for (let k = 0; k < 6; k++) { rect(g, x + 2 + k * 2 + 1, y + 4, 1, 1, P.white); rect(g, x + 2 + k * 2 + 1, y + 12, 1, 1, P.white); }
      rect(g, x + 3, y + 9, 11, 3, P.hillFront);
      const bob = lit ? R(Math.sin(t * 3) * 1.5) : 0, mx = x + 10 + bob, my = y + 8 - bob;
      line(g, mx + 3, my + 3, mx + 6, my + 6, P.woodD); line(g, mx + 4, my + 3, mx + 7, my + 6, P.woodD);
      disc(g, mx, my, 4, O); disc(g, mx, my, 3, P.riverL); rect(g, mx - 2, my - 2, 1, 2, P.white);
    } else if (kind === 1) {
      rect(g, x + 1, y + 1, 12, 15, O); rect(g, x + 2, y + 2, 10, 13, P.paperHi);
      const prog = lit ? fract(lc * 0.5) : 0.5;
      for (let r = 0; r < 4; r++) { const len = lit ? R(clamp(prog * 4 - r) * 8) : 8; rect(g, x + 3, y + 4 + r * 3, len, 1, P.slateL); }
      const wob = lit ? R(Math.sin(t * 9) * 1) : 0;
      const tipx = x + 4 + R((lit ? clamp(prog * 4 - F(prog * 4)) : 0.5) * 7) + wob, tipy = y + 4 + Math.min(3, F(prog * 4)) * 3;
      line(g, tipx, tipy, tipx + 6, tipy - 8, O); line(g, tipx + 1, tipy, tipx + 7, tipy - 8, P.white); line(g, tipx + 2, tipy - 1, tipx + 8, tipy - 9, O);
      rect(g, tipx, tipy, 1, 1, P.ink);
    } else {
      const pop = lit ? R(Math.max(0, 1 - (lc % 1.6) * 4) * 2) : 0;
      rect(g, x + 3, y + 11, 3, 6, P.accD); rect(g, x + 11, y + 11, 3, 6, P.accD);
      disc(g, x + 8, y + 8, 8 + pop, O); disc(g, x + 8, y + 8, 7 + pop, P.acc); disc(g, x + 8, y + 8, 5 + pop, P.accL); disc(g, x + 8, y + 8, 4 + pop, P.acc);
      bmp(g, ICONS.check, x + 5, y + 5, P.white);
    }
  }
  function processScene(g, G, P, B, d, L) {
    const lc = L.local, t = L.t;
    const hb = headline(g, G, P, dom("process-title"), lc);
    const top = Math.max(R(B.y), hb + 6), bottom = R(B.y + B.h) - 1;
    const steps = d.steps.slice(0, 3);
    const N = Math.max(1, steps.length);
    const ts = 30, slot = 20, gap = 6;
    const rowH = (bottom - top) / N;
    // Three ledges step down the frame like a staircase; the hero hops from one station to the next.
    let LS = 2;
    const maxLabelW = B.w - slot - ts - gap - 24;
    let lines = steps.map((s) => wrap(s, charsFor(maxLabelW - padW(LS), LS)).slice(0, 3));
    if (lines.some((l) => boxH(l.length, LS) > rowH - 6) || steps.some((st) => !fits(st, charsFor(maxLabelW - padW(2), 2), 3))) { LS = 1; lines = steps.map((s) => wrap(s, charsFor(maxLabelW - padW(1), 1)).slice(0, 3)); }
    const lw = lines.map((l) => Math.max(...l.map((x) => tw(x, LS))) + padW(LS));
    const contentW = slot + ts + gap + Math.max(...lw);
    const off = N > 1 ? clamp((B.w - contentW) / (N - 1), 0, 44) : 0;
    const span = Math.max(1.2, L.hold - (L.change || 0.45) - 1.0);
    const a = steps.map((_, i) => 0.35 + (N > 1 ? i * span / (N - 1) : 0));
    const rows = steps.map((_, i) => {
      const x = R(B.x + (B.w - contentW - off * (N - 1)) / 2 + i * off);
      const ledge = R(top + rowH * (i + 1) - 4);
      return { x, ledge, px: x + slot, py: ledge - ts - 1, heroX: x + 9 };
    });
    rows.forEach((r, i) => {
      const lit = lc >= a[i];
      // The ledge: a run of stone bricks with a grassy lip.
      const lx = r.x - 4, lwid = contentW + 8;
      rect(g, lx - 1, r.ledge - 1, lwid + 2, 6, P.outline);
      for (let k = 0; k < lwid; k += 8) { rect(g, lx + k, r.ledge, 7, 4, lit ? P.stoneL : P.stone); rect(g, lx + k, r.ledge + 3, 7, 1, P.stoneD); }
      rect(g, lx, r.ledge, lwid, 1, P.grass);
      for (let k = 2; k < lwid; k += 5) rect(g, lx + k, r.ledge - 1 - ((k + i) % 3 === 0 ? 1 : 0), 1, 1, P.grass);
      // Station plaque and icon.
      const fx = r.px, fy = r.py;
      plaque(g, P, fx, fy, ts, ts, lit ? P.paper : P.paperShade);
      if (lit) { const gc = F(lc * 4 + i) % 2 ? P.gold : P.goldL; rect(g, fx + 1, fy + 1, ts - 2, 1, gc); rect(g, fx + 1, fy + ts - 2, ts - 2, 1, gc); rect(g, fx + 1, fy + 1, 1, ts - 2, gc); rect(g, fx + ts - 2, fy + 1, 1, ts - 2, gc); }
      stationIcon(g, P, i, fx + 6, fy + 6, lit, t, lc - a[i]);
      if (!lit) dfill(g, fx + 2, fy + 2, ts - 4, ts - 4, P.paperShade, 9);
      disc(g, fx + 1, fy + 1, 6, P.outline); disc(g, fx + 1, fy + 1, 5, lit ? P.acc : P.stone);
      txt(g, String(i + 1), fx - 1, fy - 2, 1, lit ? P.onAcc : P.paper);
      const bq = seg(lc, a[i], a[i] + 0.45);
      if (bq > 0 && bq < 1) for (let k = 0; k < 8; k++) { const ang = k * TAU / 8, rr = 16 + bq * 12; sparkle(g, fx + ts / 2 + Math.cos(ang) * rr, fy + ts / 2 + Math.sin(ang) * rr, bq < 0.5 ? 1 : 0, k % 2 ? P.gold : P.goldL); }
      // Label: dim until the hero reaches it, then it lights and nudges in.
      const h = boxH(lines[i].length, LS);
      const nudge = lit ? R((1 - eo(seg(lc, a[i], a[i] + 0.3))) * 8) : 0;
      const last = i === N - 1;
      const fill = !lit ? P.paperShade : last ? P.acc : P.paper;
      const ink = !lit ? P.stoneD : last ? P.onAcc : P.ink;
      label(g, P, "", fx + ts + gap + lw[i] / 2 + nudge, R(fy + ts / 2 - h / 2), maxLabelW, { lines: lines[i], sc: LS, fill, ink });
      // A marching dotted trail shows the hop to the next ledge once this station is done.
      if (i < N - 1 && lc >= a[i] + 0.2) {
        const r2 = rows[i + 1];
        const k = seg(lc, a[i] + 0.2, a[i + 1] - 0.4);
        for (let s = 0; s < 10; s++) {
          const u = s / 9; if (u > k) break;
          if ((s + F(lc * 6)) % 2) continue;
          const xx = r.heroX + (r2.heroX - r.heroX) * u, yy = r.ledge - 10 + (r2.ledge - r.ledge) * u - Math.sin(u * Math.PI) * 14;
          rect(g, xx, yy, 2, 2, lc >= a[i + 1] ? P.gold : P.paperDeep);
        }
      }
    });
    // The hero: walks in along the first ledge, hops down at each station, celebrates at the last.
    let hx, hy, walking = false, air = false;
    const hopD = 0.42;
    if (lc < a[0]) { const k = seg(lc, 0, a[0]); hx = rows[0].heroX - 34 * (1 - k); hy = rows[0].ledge; walking = k < 1; }
    else {
      hx = rows[N - 1].heroX; hy = rows[N - 1].ledge;
      for (let i = 0; i < N; i++) {
        if (i + 1 < N && lc < a[i + 1]) {
          const k = seg(lc, a[i + 1] - hopD, a[i + 1]);
          const r1 = rows[i], r2 = rows[i + 1];
          hx = r1.heroX + (r2.heroX - r1.heroX) * k;
          hy = r1.ledge + (r2.ledge - r1.ledge) * k - Math.sin(k * Math.PI) * 16;
          air = k > 0 && k < 1;
          break;
        }
      }
    }
    const done = lc >= a[N - 1] + 0.2;
    const jp = fract(Math.max(0, lc - a[N - 1] - 0.2) / 0.7), jy = done && jp < 0.4 ? R(Math.sin(jp / 0.4 * Math.PI) * 6) : 0;
    const idle = !walking && !air && !done;
    hero(g, P, R(hx), R(hy) - jy, { frame: walking ? F(lc * 9) : -1, dir: 1, look: 1, arms: air || jy > 0 ? 1 : done ? 2 : idle ? 3 : 0, open: air || jy > 0 || idle ? 1 : 0, blink: blinkAt(t, 5) });
  }

  // ---- scene: compare (two block stacks on pedestals) -----------------------------------------------------------------
  function compareScene(g, G, P, B, d, L) {
    const lc = L.local, t = L.t;
    const hb = headline(g, G, P, dom("compare-title"), lc);
    const top = Math.max(R(B.y), hb + 6), ground = R(B.y + B.h);
    const vals = [Math.max(0, Number(d.leftValue) || 0), Math.max(0, Number(d.rightValue) || 0)];
    const max = Math.max(1e-6, ...vals);
    const colW = B.w * 0.36;
    const xs = [R(B.x + B.w * 0.25), R(B.x + B.w * 0.75)];
    const labs = [d.left, d.right].map((s) => wrap(s, charsFor((G.narrow ? B.w * 0.48 : colW) - 8, 1)).slice(0, 2));
    const labH = Math.max(...labs.map((l) => l.length)) * 9 + 4;
    const labY = ground - labH, pedY = labY - 9;
    const finals = vals.map((v) => fmt(v, 1, d.prefix, d.suffix));
    const sc = Math.min(...finals.map((f) => (tw(f, 3) <= colW ? 3 : tw(f, 2) <= colW ? 2 : 1)));
    const numH = 7 * sc;
    const bh = 7, bw = Math.min(30, F(colW * 0.55 / 2) * 2);
    const maxBlocks = Math.max(2, F((pedY - (top + numH + 16)) / bh));
    const qs = [seg(lc, 0.05, 1.05), seg(lc, 0.95, 1.75)];
    const tops = [];
    // A level-clear finale: fireworks keep bursting over the stacks once the count lands.
    const fin = 2.35;
    if (lc > fin) {
      const cols = [P.goldL, P.acc, P.white, P.riverL, P.flowerB];
      for (let b = 0; b < 3; b++) {
        const cyc = (lc - fin) / 0.75 + b / 3, k = F(cyc), ph = fract(cyc);
        const bx = B.x + B.w * (0.15 + 0.7 * hash(k * 3.7 + b)), by = top + 6 + (ground - top) * 0.3 * hash(k * 5.1 + b + 2);
        if (ph < 0.25) { rect(g, bx, by + (1 - ph / 0.25) * 30, 1, 3, P.goldL); continue; }
        const e = (ph - 0.25) / 0.75, rr = 4 + eo(e) * 16, c = cols[(k + b) % cols.length];
        for (let s = 0; s < 10; s++) { const a = s * TAU / 10; const px = bx + Math.cos(a) * rr, py = by + Math.sin(a) * rr + e * e * 6; if (e < 0.7) sparkle(g, px, py, e < 0.35 ? 1 : 0, c); else if (s % 2) rect(g, px, py, 1, 1, c); }
      }
    }
    vals.forEach((v, side) => {
      const cx = xs[side], nb = v > 0 ? Math.max(1, R(v / max * maxBlocks)) : 0;
      const q = qs[side], built = q * nb, shown = Math.min(nb, F(built + 1e-6)), fall = built - shown;
      const C = side ? [P.acc, P.accL, P.accD] : [P.stone, P.stoneL, P.stoneD];
      // Pedestal.
      rect(g, cx - bw / 2 - 5, pedY, bw + 10, 9, P.outline); rect(g, cx - bw / 2 - 4, pedY + 1, bw + 8, 7, P.wood); rect(g, cx - bw / 2 - 4, pedY + 1, bw + 8, 1, P.woodL); rect(g, cx - bw / 2 - 4, pedY + 6, bw + 8, 2, P.woodD);
      const x = R(cx - bw / 2);
      const shine = shown >= nb ? F(fract(t * 0.8) * (nb + 6)) : -1;
      for (let r = 0; r < shown; r++) {
        const wob = side === 0 && r >= shown - 2 && shown >= nb ? R(Math.sin(t * 8 + r * 2) * 0.8) : 0;
        const y = pedY - (r + 1) * bh;
        rect(g, x - 1 + wob, y - 1, bw + 2, bh + 1, P.outline);
        rect(g, x + wob, y, bw, bh, side && r === shine ? C[1] : C[0]);
        rect(g, x + wob, y, bw, 1, side && r === shine ? "#ffffff" : C[1]);
        rect(g, x + wob, y + bh - 1, bw, 1, C[2]);
        rect(g, x + wob + bw - 2, y + 1, 1, bh - 2, C[2]);
        if (side === 0 && r % 2 === 0) { rect(g, x + wob + 4 + (r * 5) % (bw - 8), y + 2, 1, 2, C[2]); rect(g, x + wob + 5 + (r * 5) % (bw - 8), y + 4, 1, 1, C[2]); }
      }
      if (fall > 0 && shown < nb) { const yy = R(pedY - (shown + 1) * bh - (1 - eo(fall)) * 30); rect(g, x - 1, yy - 1, bw + 2, bh + 1, P.outline); rect(g, x, yy, bw, bh, C[0]); rect(g, x, yy, bw, 1, C[1]); }
      const stackTop = pedY - nb * bh;
      tops.push(stackTop);
      const str = fmt(vals[side], eo(q), d.prefix, d.suffix);
      const fw = tw(finals[side], sc) + 10, ny = stackTop - numH - 12;
      plaque(g, P, cx - fw / 2, ny, fw, numH + 7, side ? P.acc : P.paper);
      txt(g, str, cx - tw(str, sc) / 2, ny + 4, sc, side ? P.onAcc : P.ink, side ? P.accD : P.paperDeep);
      label(g, P, "", cx, labY, B.w * 0.48, { lines: labs[side], fill: side ? P.acc : P.paper });
      if (side === 1 && q >= 1) for (let s = 0; s < 3; s++) { const ph = fract(t * 0.8 + s / 3); sparkle(g, cx + (s - 1) * (bw / 2 + 4), stackTop - ph * 14 + 6, ph < 0.5 ? 1 : 0, ph < 0.6 ? P.goldL : P.gold); }
    });
    // The arrow and the change between them.
    const hiTop = Math.min(tops[0], tops[1]), mx = R(B.x + B.w / 2), my = R(Math.max(hiTop + 24, hiTop + (pedY - hiTop) * 0.35));
    const aq = seg(lc, 1.2, 1.55);
    if (aq > 0) {
      for (let c = 0; c < 3; c++) {
        const on = (F(t * 7) - c + 30) % 3 === 0;
        bmp(g, ["##...", ".##..", "..##.", "...##", "..##.", ".##..", "##..."], mx - 9 + c * 6, my - 3, on ? P.accText : P.woodD);
      }
      if (vals[0] > 0) {
        const pct = R((vals[1] - vals[0]) / vals[0] * 100);
        const cq = seg(lc, 1.55, 2.3), cur = R(pct * eo(cq));
        const fs = (pct > 0 ? "+" : "") + pct + "%", s = (cur > 0 ? "+" : "") + cur + "%";
        const w = tw(fs, 2) + 12, lit = cq >= 1;
        const pop = lit && lc - 2.3 < 0.15 ? 1 : 0, bob = lit ? F(lc * 2) % 2 : 0;
        plaque(g, P, mx - w / 2 - pop, my - 30 - pop - bob, w + 2 * pop, 21 + 2 * pop, lit ? P.acc : P.paper);
        txt(g, s, mx - tw(s, 2) / 2, my - 26 - bob, 2, lit ? P.onAcc : P.ink, lit ? P.accD : P.paperDeep);
      }
    }
    // The hero watches the right-hand stack land, then cheers.
    // The hero watches the stone stack, marches over to the red one, then cheers through the finale.
    {
      const x0 = xs[0] + bw / 2 + 12, x1 = xs[1] - bw / 2 - 12;
      const k = seg(lc, 1.3, 2.3);
      const walking = k > 0 && k < 1;
      const hx = x0 + (x1 - x0) * eio(k);
      const done = lc > fin;
      const jp = fract(Math.max(0, lc - fin) / 0.6), jy = done && jp < 0.42 ? R(Math.sin(jp / 0.42 * Math.PI) * 8) : 0;
      hero(g, P, R(hx), pedY + 9 - jy, { frame: walking ? F(lc * 9) : -1, dir: 1, arms: walking ? 0 : done ? (jy > 0 ? 1 : 2) : 3, open: walking ? 0 : 1, look: walking || done ? 1 : -1, blink: blinkAt(t, 8) });
      if (done && jy > 3) for (let s = 0; s < 5; s++) { const a = -Math.PI / 2 + (s - 2) * 0.5; sparkle(g, hx + Math.cos(a) * 12, pedY - 12 - jy + Math.sin(a) * 9, 1, s % 2 ? P.gold : P.goldL); }
    }
  }

  // ---- statements: title and closing ---------------------------------------------------------------------------------------
  const eob = (v) => { v = clamp(v); const c = 1.9; return 1 + (c + 1) * Math.pow(v - 1, 3) + c * Math.pow(v - 1, 2); };
  function cursorAt(lines, n) {
    let left = n;
    for (let i = 0; i < lines.length; i++) {
      if (left <= lines[i].length) return { li: i, ci: Math.max(0, left) };
      left -= lines[i].length + 1;
    }
    return { li: lines.length - 1, ci: lines[lines.length - 1].length };
  }
  function statement(g, G, P, kind, local, t, o = {}) {
    const text = dom(kind === "title" ? "title" : "closing");
    const kicker = kind === "title" ? dom("kicker") : "";
    const hold = Math.max(1, o.hold || 2.4);
    const maxW = G.LW - (G.narrow ? 20 : 44);
    let sc = 3, lines = wrap(text, charsFor(maxW - 22, 3));
    if (lines.length > (G.narrow ? 4 : 3)) { sc = 2; lines = wrap(text, charsFor(maxW - 22, 2)); }
    const lh = 9 * sc + 2;
    const wText = Math.max(...lines.map((l) => tw(l, sc)));
    const kw = kicker ? tw(kicker, 1) + 12 : 0;
    const w = Math.max(wText + 24, kicker ? kw + 40 : 0), h = lines.length * lh + 16;
    const x = R((G.LW - w) / 2), y = R(G.LH * (G.narrow ? 0.36 : 0.38) - h / 2);
    const closing = o.close != null;
    const open = closing ? 1 : eo(seg(local, 0, 0.18));
    const hh = Math.max(10, R(h * open)), yy = y + R((h - hh) / 2);
    frame(g, P, x, yy, w, hh);
    // Typed at a pace that fills the first half of the hold, with a blinking block cursor.
    const T = totalChars(lines), typeEnd = Math.max(0.7, hold * 0.55);
    const n = closing ? T : F(2 + seg(local, 0.05, typeEnd) * T);
    g.save(); g.beginPath(); g.rect(x + 4, yy + 4, w - 8, hh - 8); g.clip();
    typeLines(g, lines, x + 12, y + 9, sc, lh, n, P.ink, P.paperDeep, w - 24);
    const typed = n >= T;
    if (!closing && hh >= h) {
      const { li, ci } = cursorAt(lines, Math.min(n, T - 1));
      const ln = lines[li], lx = x + 12 + R((w - 24 - tw(ln, sc)) / 2);
      const cx = lx + ci * 6 * sc + (typed ? 0 : 0), cy = y + 9 + li * lh;
      if (!typed) rect(g, cx, cy, sc * 4, sc * 7, F(local * 8) % 2 ? P.accText : P.acc);
    }
    g.restore();
    if (typed && !closing && hh >= h) bmp(g, ["#####", ".###.", "..#.."], x + w - 13, y + h - 9 + (F(local * 3) % 2), P.accText);
    if (kicker) {
      const kq = seg(local, 0.04, 0.42), off = closing ? 0 : R((1 - eob(kq)) * (x + kw + 30));
      if (closing || kq > 0) {
        const bob = !closing && kq >= 1 && F(local * 2) % 2 ? 1 : 0;
        plaque(g, P, x + 10 - off, yy - 9 - bob, kw, 13, P.acc);
        txt(g, kicker, x + 16 - off, yy - 6 - bob, 1, P.onAcc);
      }
    }
    if (closing) return;
    // The hero springs up from the road onto the box, walks along it with the cursor, then cheers.
    const pt = R(G.LH * 0.925);
    const left = x + (kicker ? kw + 26 : 22), right = x + w - 22;
    const sx = Math.max(8, x - 6);
    const hopA = 0.08, hopB = 0.62;
    if (local < hopB) {
      const k = seg(local, hopA, hopB);
      const crouch = local < hopA ? 1 : 0;
      const hx = sx + (left - sx) * eio(k), hy = pt + (yy - pt) * k - Math.sin(k * Math.PI) * 26 + crouch;
      hero(g, P, R(hx), R(hy), { arms: k > 0 && k < 1 ? 1 : 0, open: k > 0 ? 1 : 0, look: 1, blink: blinkAt(t, 1) });
      if (k > 0 && k < 0.3) dfill(g, sx - 7, pt - 3, 14, 3, P.white, 8);
    } else if (!typed) {
      const k = seg(n / T, 0, 1);
      const hx = Math.max(left, left + (right - left) * k);
      const moving = local < typeEnd;
      hero(g, P, R(hx), yy, { frame: moving ? F(local * 9) : -1, arms: 0, open: F(local * 9) % 2, look: 1, blink: blinkAt(t, 1) });
    } else {
      const since = Math.max(0, local - Math.max(hopB, typeEnd));
      const jp = fract(since / 0.62), jy = jp < 0.45 ? R(Math.sin(jp / 0.45 * Math.PI) * 7) : 0;
      hero(g, P, right, yy - jy, { arms: jy > 0 ? 1 : 2, open: jy > 0 ? 1 : 0, look: -1, blink: blinkAt(t, 1) });
      if (jy > 0) for (let s = 0; s < 4; s++) { const a = s * TAU / 4 + since * 3; sparkle(g, right + Math.cos(a) * 12, yy - 12 - jy + Math.sin(a) * 8, 1, s % 2 ? P.gold : P.goldL); }
    }
    if (kind !== "title") {
      const cols = [P.acc, P.gold, P.sky[3], P.green, P.white, P.flowerB];
      for (let burst = 0; burst < 2; burst++) {
        const bt = fract(local / 1.3 + burst * 0.5), ox = burst ? x + w - 4 : x + 4, oy = yy;
        for (let i = 0; i < 12; i++) {
          const ang = -Math.PI / 2 + (hash(i + burst * 20) - 0.5) * 1.8, sp = 40 + hash(i * 3 + burst) * 40;
          const px = ox + Math.cos(ang) * sp * bt, py = oy + Math.sin(ang) * sp * bt + 60 * bt * bt;
          if (bt < 0.92) rect(g, px, py, (i + F(local * 8)) % 2 ? 2 : 1, 2, cols[i % cols.length]);
        }
      }
    }
  }

  // ---- registration ------------------------------------------------------------------------------------------------------------
  let CUR = { index: 0 };
  // The scene shown before scene `index`, from the template's own hold controls.
  function prevScene(index) {
    const c = controls();
    const ids = ["title", "chart", "object", "people", "process", "compare", "closing"];
    const shown = ids.filter((id) => Number(c[id + "_hold"] ?? 1) > 0);
    return shown[index - 1] || null;
  }
  function wrapScene(fn) {
    return (ctx, S, box, p, d, info) => {
      const G = grid(S), P = theme(S);
      const out = info.exit != null;
      const g = layer(out ? "out" : "in", G);
      const B = { x: box.x / G.px, y: box.y / G.px, w: box.w / G.px, h: box.h / G.px };
      // The opening scene starts already under way, so its first frame is never an empty box.
      const lead = (out ? CUR.index === 1 : CUR.index === 0) ? 0.35 : 0;
      const hg = layer(out ? "hlout" : "hlin", G);
      const drawn = (id) => id === "chart" || id === "object" || id === "people" || id === "process" || id === "compare";
      HL = { g: hg, exit: out ? info.exit : null, replaced: out && drawn(CUR.scene), page: !out && CUR.index > 0 && drawn(prevScene(CUR.index)) };
      const HLR = HL.replaced;
      try { fn(g, G, P, B, d, { t: info.t, local: info.local + lead, hold: info.hold, change: info.change, exit: info.exit }); }
      finally { HL = null; }
      if (out) { dither(g, G, info.exit, "out"); if (!HLR) dither(hg, G, Math.min(1, info.exit * 1.25), "out"); }
      else if (CUR.index > 0 && info.local < info.change) dither(g, G, info.local / Math.max(0.01, info.change), "in");
      blit(ctx, g, G);
      blit(ctx, hg, G);
    };
  }
  const look = (W, extra) => ({
    bg: W.sky[0], panel: W.paper, ink: W.ink, muted: mix(W.ink, W.paper, 0.35), rule: W.woodD, track: W.paperShade, onAccent: "#fff8ea",
    world: W, ...extra,
  });
  return {
    ...look(MORNING, { accent: "#e2503c" }),
    display: "'Silkscreen', 'VT323', 'Courier New', monospace", displayWeight: 700, displayCase: "uppercase", displayTracking: "0.04em",
    body: "'Silkscreen', 'VT323', 'Courier New', monospace", bodyWeight: 700, figures: "'Courier New', monospace",
    radius: 0, motion: "type", change: "fade", kit: { line: 3, fill: "solid", panel: "fill" },
    palettes: {
      // Noon: bright midday sky and white parchment. Night: moonlit valley, fireflies and lit windows. Mono: sepia.
      light: look(NOON, { accent: "#e2503c" }),
      dark: look(NIGHT, { accent: "#f2604a" }),
      mono: look(SEPIA, { accent: "#8a3a1a", onAccent: "#f7ecd0" }),
    },
    textShadow: () => "none",
    backdrop: (accent, texture, lk) => ((lk && lk.world) || MORNING).sky[0],
    // The page's own lettering is replaced by the bitmap face drawn into the art.
    css: () => "#root:has(> canvas#art) .scene .display, #root:has(> canvas#art) .scene .kicker { color: transparent !important; -webkit-text-fill-color: transparent !important; -webkit-text-stroke: 0 !important; text-shadow: none !important; }",
    // Texture pass over everything: soft CRT scanlines on the pixel rows and a dark vignette.
    paint(ctx, W, H) {
      const key = W + "x" + H;
      if (ctx.canvas.__px16 === key) return;
      ctx.canvas.__px16 = key;
      ctx.clearRect(0, 0, W, H);
      const px = Math.min(W, H) / 180;
      ctx.fillStyle = "rgba(12,6,22,0.17)";
      for (let y = 0; y < H; y += px) ctx.fillRect(0, Math.round(y + px * 0.66), W, Math.max(1, Math.round(px * 0.34)));
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.hypot(W, H) * 0.62);
      v.addColorStop(0, "rgba(12,6,22,0)"); v.addColorStop(1, "rgba(12,6,22,0.3)");
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    },
    paintOver: true,
    keepArt: true,
    overlap: true,
    stage(ctx, S, info) {
      const G = grid(S), P = theme(S);
      CUR = info;
      if (S.paint) { const g = layer("world", G); world(g, G, P, info.t, camX(info, G)); blit(ctx, g, G); }
      // The title has no drawer, so it dithers out here as the next scene dithers in.
      const ctl = controls();
      const ch = Math.max(0.01, info.change);
      if (info.index === 1 && Number(ctl.title_hold ?? 2.4) > 0 && info.local < ch * 0.6) {
        // The title box folds shut as one block before the next headline opens.
        const g = layer("tout", G);
        statement(g, G, P, "title", 30 + info.local, info.t, { close: 1, hold: Number(ctl.title_hold ?? 2.4) });
        dither(g, G, info.local / (ch * 0.6), "out");
        blit(ctx, g, G);
      }
      if (info.scene === "title" || info.scene === "closing") {
        const g = layer("stmt", G);
        const local = info.local + (info.index === 0 ? 0.2 : -ch * 0.7);
        if (local >= 0) statement(g, G, P, info.scene, local, info.t, { hold: info.hold });
        blit(ctx, g, G);
      }
    },
    scenes: { chart: wrapScene(chartScene), object: wrapScene(objectScene), people: wrapScene(peopleScene), process: wrapScene(processScene), compare: wrapScene(compareScene) },
  };
});
