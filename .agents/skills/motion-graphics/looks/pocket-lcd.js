// Pocket LCD: the whole frame is the glass of a handheld dot-matrix player. Everything is drawn on a
// coarse grid of lit cells in four olive-greens (one cell = 8px at 1080 tall), so type is a hand-built
// 5x7 bitmap font and every sprite, icon, hill and wave is plotted cell by cell. A thin bezel, the visible
// pixel grid, a faint refresh shimmer and ghost trails behind fast movers finish the screen. Scenes are
// stages in a little game: scenery scrolls the whole time, an original hero ("Pip") hops through the
// data, and scene changes are pixel wipes (ordered dither, shutters, diamond iris, ragged scan).
// All characters and icons are original. Frames are pure functions of time: seeded values only.
window.DreamcutMotion.register("pocket-lcd", ({ rng }) => {
  const TAU = Math.PI * 2, PI = Math.PI;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const ei = (v) => Math.pow(clamp(v), 2);
  const eio = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };
  const bk = (v) => { v = clamp(v); const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const mod = (a, n) => ((a % n) + n) % n;
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  const HEADS = { title: ["kicker", "title"], chart: ["chart-title"], object: ["object-title"], people: ["people-title"], process: ["process-title"], compare: ["compare-title"], closing: ["closing"] };

  // ---- tone ----------------------------------------------------------------------------------------
  // c[0] is the lit "paper" of the screen, c[3] the darkest cell. Art is written in these four indexes.
  const TONE = {
    c: ["#cfdc9b", "#94b367", "#4d7448", "#1b3727"], bezel: "#383a4d", bezelHi: "#52556e", bezelLo: "#22232f",
    grid: "rgba(27,55,39,0.2)", gridHi: "rgba(255,255,230,0.07)", glass: "rgba(255,255,230,0.5)", ghost: "darken", shade: "27,55,39",
  };
  let COL = TONE.c, TN = TONE;

  // ---- grid buffers and plotting ------------------------------------------------------------------
  const BUFS = {};
  function pair(key, w, h) {
    let p = BUFS[key];
    if (!p) {
      p = BUFS[key] = { cv: document.createElement("canvas"), kv: document.createElement("canvas") };
      p.c = p.cv.getContext("2d"); p.k = p.kv.getContext("2d");
    }
    if (p.cv.width !== w || p.cv.height !== h) { p.cv.width = w; p.cv.height = h; p.kv.width = w; p.kv.height = h; }
    for (const g of [p.c, p.k]) { g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.clearRect(0, 0, w, h); g.imageSmoothingEnabled = false; }
    return p;
  }
  let D = null, NOINK = false;
  // A lit rectangle of cells in colour index i. Dark cells also go in the ink mask that casts the pixel shadow.
  function R(x, y, w, h, i) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    if (w <= 0 || h <= 0) return;
    D.c.fillStyle = COL[i]; D.c.fillRect(x, y, w, h);
    if (!NOINK) { if (i >= 2) { D.k.fillStyle = "#000"; D.k.fillRect(x, y, w, h); } else D.k.clearRect(x, y, w, h); }
  }
  const PX = (x, y, i) => R(x, y, 1, 1, i);
  function disc(cx, cy, r, i) {
    cx = Math.round(cx); cy = Math.round(cy);
    for (let dy = -r; dy <= r; dy++) { const hw = Math.round(Math.sqrt(Math.max(0, r * r + 0.4 - dy * dy))); R(cx - hw, cy + dy, hw * 2 + 1, 1, i); }
  }
  function ell(cx, cy, rx, ry, i) {
    cx = Math.round(cx); cy = Math.round(cy);
    for (let dy = -ry; dy <= ry; dy++) { const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 + 0.2 / Math.max(1, ry) - (dy * dy) / (ry * ry)))); R(cx - hw, cy + dy, hw * 2 + 1, 1, i); }
  }
  function ring(cx, cy, r, i, th = 1) { disc(cx, cy, r, i); disc(cx, cy, r - th, -1 === i ? 0 : 0); }
  function line(x0, y0, x1, y1, i, th = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, guard = 0;
    for (;;) {
      R(x0, y0, th, th, i);
      if ((x0 === x1 && y0 === y1) || guard++ > 600) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  const DPAT = {};
  function pat(lvl, ia, ib) {
    const key = lvl + ":" + COL[ia] + COL[ib];
    let c = DPAT[key];
    if (!c) {
      c = DPAT[key] = document.createElement("canvas"); c.width = c.height = 4;
      const g = c.getContext("2d"), B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = COL[B4[y * 4 + x] < lvl ? ib : ia]; g.fillRect(x, y, 1, 1); }
    }
    return D.c.createPattern(c, "repeat");
  }
  // A transparent tile with paper-coloured cells wherever the Bayer level is below lvl (used to blank a layer).
  const CPAT = {};
  function clearPat(lvl) {
    const key = lvl + ":" + COL[0];
    let c = CPAT[key];
    if (!c) {
      c = CPAT[key] = document.createElement("canvas"); c.width = c.height = 4;
      const g = c.getContext("2d"), B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
      g.fillStyle = COL[0];
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (B4[y * 4 + x] < lvl) g.fillRect(x, y, 1, 1);
    }
    return c;
  }
  // A vertical ordered-dither gradient from colour ia (top) to ib (bottom).
  function grad(x, y, w, h, ia, ib) {
    const n = Math.max(1, Math.min(17, h));
    for (let k = 0; k < n; k++) {
      const y0 = y + Math.floor((h * k) / n), y1 = y + Math.floor((h * (k + 1)) / n);
      D.c.fillStyle = pat(Math.round((16 * (k + 0.5)) / n), ia, ib); D.c.fillRect(x, y0, w, y1 - y0);
    }
  }
  // A flat dither tile (level 0..16) over a rectangle.
  function dither(x, y, w, h, lvl, ia, ib) { D.c.fillStyle = pat(lvl, ia, ib); D.c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  // Sprites from rows of digits: 0-3 colour indexes, '.' empty.
  function spr(rows, x, y, flip) {
    rows.forEach((row, r) => {
      const n = row.length;
      for (let c = 0; c < n;) {
        const ch = row[flip ? n - 1 - c : c];
        if (ch === ".") { c++; continue; }
        let e = c + 1;
        while (e < n && row[flip ? n - 1 - e : e] === ch) e++;
        R(x + c, y + r, e - c, 1, Number(ch));
        c = e;
      }
    });
  }

  // ---- bitmap font: 5x7 cells, uppercase only -------------------------------------------------------
  const FONT = {
    A: ".###./#...#/#...#/#####/#...#/#...#/#...#", B: "####./#...#/#...#/####./#...#/#...#/####.", C: ".###./#...#/#..../#..../#..../#...#/.###.",
    D: "###../#..#./#...#/#...#/#...#/#..#./###..", E: "#####/#..../#..../####./#..../#..../#####", F: "#####/#..../#..../####./#..../#..../#....",
    G: ".###./#...#/#..../#.###/#...#/#...#/.###.", H: "#...#/#...#/#...#/#####/#...#/#...#/#...#", I: ".###./..#../..#../..#../..#../..#../.###.",
    J: "..###/...#./...#./...#./...#./#..#./.##..", K: "#...#/#..#./#.#../##.../#.#../#..#./#...#", L: "#..../#..../#..../#..../#..../#..../#####",
    M: "#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#", N: "#...#/##..#/#.#.#/#..##/#...#/#...#/#...#", O: ".###./#...#/#...#/#...#/#...#/#...#/.###.",
    P: "####./#...#/#...#/####./#..../#..../#....", Q: ".###./#...#/#...#/#...#/#.#.#/#..#./.##.#", R: "####./#...#/#...#/####./#.#../#..#./#...#",
    S: ".####/#..../#..../.###./....#/....#/####.", T: "#####/..#../..#../..#../..#../..#../..#..", U: "#...#/#...#/#...#/#...#/#...#/#...#/.###.",
    V: "#...#/#...#/#...#/#...#/#...#/.#.#./..#..", W: "#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#", X: "#...#/#...#/.#.#./..#../.#.#./#...#/#...#",
    Y: "#...#/#...#/.#.#./..#../..#../..#../..#..", Z: "#####/....#/...#./..#../.#.../#..../#####",
    0: ".###./#...#/#..##/#.#.#/##..#/#...#/.###.", 1: "..#../.##../..#../..#../..#../..#../.###.", 2: ".###./#...#/....#/...#./..#../.#.../#####",
    3: "#####/...#./..#../...#./....#/#...#/.###.", 4: "...#./..##./.#.#./#..#./#####/...#./...#.", 5: "#####/#..../####./....#/....#/#...#/.###.",
    6: "..##./.#.../#..../####./#...#/#...#/.###.", 7: "#####/....#/...#./..#../.#.../.#.../.#...", 8: ".###./#...#/#...#/.###./#...#/#...#/.###.",
    9: ".###./#...#/#...#/.####/....#/...#./.##..",
    ".": "...../...../...../...../...../.##../.##..", ",": "...../...../...../...../.##../.##../.#...", "!": "..#../..#../..#../..#../..#../...../..#..",
    "?": ".###./#...#/....#/...#./..#../...../..#..", ":": "...../.##../.##../...../.##../.##../.....", "-": "...../...../...../.###./...../...../.....",
    "+": "...../..#../..#../#####/..#../..#../.....", "%": "##..#/##.#./...#./..#../.#.../.#.##/#..##", "/": "....#/....#/...#./..#../.#.../#..../#....",
    "'": "..#../..#../.#.../...../...../...../.....", "(": "...#./..#../.#.../.#.../.#.../..#../...#.", ")": ".#.../..#../...#./...#./...#./..#../.#...",
    "=": "...../...../#####/...../#####/...../.....", "#": ".#.#./#####/.#.#./.#.#./#####/.#.#./.....", "*": "...../#.#.#/.###./#####/.###./#.#.#/.....",
    "&": ".##../#..#./#.#../.#.../#.#.#/#..#./.##.#", ">": "#..../.#.../..#../...#./..#../.#.../#....", "<": "....#/...#./..#../.#.../..#../...#./....#",
    "$": "..#../.####/#.#../.###./..#.#/####./..#..", "\"": ".#.#./.#.#./...../...../...../...../.....", "_": "...../...../...../...../...../...../#####",
    "~": "...../...../.#..#/#.##./...../...../.....", "@": ".###./#...#/#.###/#.#.#/#.###/#..../.###.", "x": "...../#...#/.#.#./..#../.#.#./#...#/.....",
  };
  const GL = {};
  function runs(ch) {
    let g = GL[ch];
    if (g) return g;
    g = GL[ch] = [];
    const rows = (FONT[ch] || FONT["?"]).split("/");
    rows.forEach((row, r) => { for (let c = 0; c < 5;) { if (row[c] !== "#") { c++; continue; } let e = c; while (e < 5 && row[e] === "#") e++; g.push([r, c, e - c]); c = e; } });
    return g;
  }
  const tw = (s, sc) => (s.length ? s.length * 6 * sc - sc : 0);
  function pass(s, x, y, sc, i, n, o) {
    for (let k = 0; k < n; k++) {
      const ch = s[k];
      if (ch === " ") continue;
      const yy = y + (o.wave != null ? Math.round(Math.sin(o.wave + k * 0.8) * (o.amp || 1)) : 0);
      for (const [r, c, l] of runs(ch)) R(x + k * 6 * sc + c * sc, yy + r * sc, l * sc, sc, i);
    }
  }
  // Draw text; `o.n` shows only the first n characters; halo and shadow are colour indexes.
  function T(s, x, y, sc, i, o = {}) {
    s = String(s ?? "").toUpperCase();
    const w = tw(s, sc);
    if (o.align === "c") x -= Math.floor(w / 2); else if (o.align === "r") x -= w;
    const n = o.n == null ? s.length : Math.min(s.length, Math.max(0, Math.floor(o.n)));
    if (o.shadow != null) pass(s, x + Math.max(1, sc >> 1), y + Math.max(1, sc >> 1), sc, o.shadow, n, o);
    if (o.halo != null) {
      const h = sc >= 3 ? 2 : 1;
      for (const [dx, dy] of [[-h, 0], [h, 0], [0, -h], [0, h], [-h, -h], [h, -h], [-h, h], [h, h]]) pass(s, x + dx, y + dy, sc, o.halo, n, o);
    }
    pass(s, x, y, sc, i, n, o);
    return w;
  }
  function wrap(s, maxW, sc, maxLines) {
    const per = Math.max(1, Math.floor((maxW + sc) / (6 * sc)));
    const words = String(s ?? "").toUpperCase().split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = "";
    for (let w of words) {
      while (w.length > per) { if (cur) { lines.push(cur); cur = ""; } lines.push(w.slice(0, per)); w = w.slice(per); }
      const nx = cur ? cur + " " + w : w;
      if (nx.length > per) { if (cur) lines.push(cur); cur = w; } else cur = nx;
    }
    if (cur) lines.push(cur);
    if (maxLines && lines.length > maxLines) { lines.length = maxLines; const l = lines[maxLines - 1]; lines[maxLines - 1] = l.slice(0, Math.max(0, per - 2)) + ".."; }
    return lines;
  }
  // Text drawn straight onto the main canvas in px cells (bezel lettering).
  function bezelText(ctx, s, x, y, k, color) {
    ctx.fillStyle = color;
    s = String(s).toUpperCase();
    for (let n = 0; n < s.length; n++) { if (s[n] === " ") continue; for (const [r, c, l] of runs(s[n])) ctx.fillRect(Math.round(x + n * 6 * k + c * k), Math.round(y + r * k), l * k, k); }
  }
  const dom = (id) => { const el = document.getElementById(id); return el ? el.textContent || "" : ""; };

  // ---- original sprites and icons -----------------------------------------------------------------
  // Pip: a round sprout-topped blob. x is its centre, y the ground under its feet.
  function pip(x, y, t, o = {}) {
    const f = o.f || 1, sq = o.sq || 0, seed = o.seed || 0;
    const mv = o.walk ? Math.floor(t * 9) % 2 : 0;
    const rx = 5 + sq, ry = 5 - sq, cy = Math.round(y - 3 - ry);
    const sw = Math.round(Math.sin(t * 3 + seed));
    R(x + sw, cy - ry - 3, 1, 3, 3); R(x + sw + 1, cy - ry - 4, 3, 2, 3); R(x + sw + 1, cy - ry - 3, 2, 1, 2);
    if (!o.air) { R(x - 4 + mv, y - 1, 3, 2, 3); R(x + 1 - mv, y - 1, 3, 2, 3); } else { R(x - 3, y - 1, 2, 2, 3); R(x + 1, y - 1, 2, 2, 3); }
    ell(x, cy, rx + 1, ry + 1, 3); ell(x, cy, rx, ry, 1);
    ell(x, cy + 1, Math.max(1, rx - 2), Math.max(1, ry - 3), 0);
    R(x - 3, cy - ry + 1, 3, 1, 0); R(x - 4, cy - ry + 2, 1, 1, 0);
    const blink = mod(t + seed, 3.3) < 0.14, ex = x + f * 2;
    R(ex - 2, cy - 1, 1, blink ? 1 : 2, 3); R(ex + 1, cy - 1, 1, blink ? 1 : 2, 3);
    R(ex - 3, cy + 1, 1, 1, 2); R(ex + 2, cy + 1, 1, 1, 2);
    if (o.happy) R(ex - 1, cy + 2, 2, 1, 3);
  }
  // Blip: a boxy bot with an antenna and a screen face.
  function blip(x, y, t, o = {}) {
    const mv = Math.floor(t * 8 + (o.seed || 0)) % 2, f = o.f || 1;
    R(x - 4, y - 11, 9, 8, 3); R(x - 3, y - 10, 7, 6, 1); R(x - 3, y - 10, 7, 1, 0);
    R(x - 2, y - 8, 5, 3, 3); R(x - 1 + f, y - 7, 1, 1, 0); R(x + 1 + f, y - 7, 1, 1, 0);
    R(x, y - 14, 1, 3, 3); R(x - 1, y - 15, 3, 2, mod(Math.floor(t * 3), 2) ? 0 : 2); R(x - 1, y - 15, 3, 1, 3);
    R(x - 3 + mv, y - 3, 2, 3, 3); R(x + 2 - mv, y - 3, 2, 3, 3);
  }
  function snail(x, y, t) {
    const sw = Math.round(Math.sin(t * 2));
    R(x - 6, y - 2, 13, 2, 3); R(x - 5, y - 3, 6, 1, 3); R(x + 4 + sw, y - 6, 1, 4, 3); R(x + 6 + sw, y - 6, 1, 4, 3);
    disc(x - 1, y - 6, 4, 3); disc(x - 1, y - 6, 3, 2); R(x - 2, y - 7, 2, 2, 3); R(x - 1, y - 6, 1, 1, 1);
  }
  function bird(x, y, t, seed = 0) {
    const up = Math.floor(t * 5 + seed) % 2 === 0;
    if (up) { PX(x - 2, y - 1, 3); PX(x - 1, y, 3); PX(x, y, 3); PX(x + 1, y, 3); PX(x + 2, y - 1, 3); } else { PX(x - 2, y + 1, 3); PX(x - 1, y, 3); PX(x, y, 3); PX(x + 1, y, 3); PX(x + 2, y + 1, 3); }
  }
  const HEART = [".33.33.", "3003003", "3000003", ".30003.", "..303..", "...3..."];
  const STAR = ["....3....", "...303...", "...303...", "333303333", ".3000003.", "..30003..", "..30303..", ".303.303.", ".33...33."];
  const heart = (x, y, c) => { spr(HEART, x, y); if (c != null) { R(x + 1, y + 1, 1, 1, c); } };
  const star = (x, y) => spr(STAR, x - 4, y - 4);
  function coin(x, y, t, seed = 0) {
    const ph = Math.floor(mod(t * 6 + seed, 6)), wd = [3, 2, 1, 0, 1, 2][ph];
    R(x - wd - 1, y - 3, wd * 2 + 3, 7, 3); R(x - wd, y - 2, wd * 2 + 1, 5, 0); if (wd > 0) R(x, y - 1, 1, 3, 2);
  }
  function icoEye(x, y, t) { ell(x, y, 9, 5, 3); ell(x, y, 8, 4, 0); disc(x + Math.round(Math.sin(t * 2.4) * 2), y, 3, 3); R(x - 1 + Math.round(Math.sin(t * 2.4) * 2), y - 1, 1, 1, 0); }
  function icoPen(x, y, t) {
    const b = Math.round(Math.sin(t * 5) * 1);
    line(x - 4, y + 4 + b, x + 5, y - 5 + b, 3, 3); line(x - 3, y + 4 + b, x + 5, y - 4 + b, 0, 1);
    R(x - 7, y + 6 + b, 3, 3, 3); PX(x - 6, y + 7 + b, 2); R(x + 5, y - 8 + b, 4, 3, 3); R(x + 6, y - 7 + b, 2, 1, 1);
    R(x - 9, y + 10, 6 + ((Math.floor(t * 6) % 4) * 3), 1, 3);
  }
  function icoCheck(x, y, t) {
    disc(x, y, 9, 3); disc(x, y, 7, 0);
    const k = seg(mod(t, 1.6), 0.1, 0.5);
    line(x - 4, y, x - 1, y + 3, 3, 2);
    if (k > 0.3) line(x - 1, y + 3, x - 1 + Math.round(5 * seg(k, 0.3, 1)), y + 3 - Math.round(6 * seg(k, 0.3, 1)), 3, 2);
  }
  const arrow = (x, y, dir, c = 3) => { for (let k = 0; k < 4; k++) R(dir > 0 ? x + k : x - k, y - 3 + k, 1, 7 - k * 2, c); };

  // A framed plate: dark outline with clipped corners, light fill.
  function plate(x, y, w, h, fill = 0, edge = 3) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    if (w < 3 || h < 3) return;
    R(x + 1, y, w - 2, 1, edge); R(x + 1, y + h - 1, w - 2, 1, edge); R(x, y + 1, 1, h - 2, edge); R(x + w - 1, y + 1, 1, h - 2, edge);
    R(x + 1, y + 1, w - 2, h - 2, fill);
    if (fill === 0 && h > 6) R(x + 2, y + h - 2, w - 4, 1, 1);
  }

  // ---- scenery ------------------------------------------------------------------------------------
  let BG = true;
  function cloud(x, y, g, c) { disc(x - 4, y + 1, 3 + g, c); disc(x + 3, y - 1, 4 + g, c); disc(x + 9, y + 1, 3 + g, c); R(x - 7 - g, y + 1, 19 + g * 2, 3 + g, c); }
  function sunDisc(x, y, t, r = 8) {
    disc(x, y, r + 2, 1); disc(x, y, r, 0);
    for (let i = 0; i < 12; i++) { const a = t * 0.35 + (i * TAU) / 12, r0 = r + 4, r1 = r + 4 + (i % 2 ? 2 : 5); line(x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * r1, y + Math.sin(a) * r1, 0); }
  }
  function silhouette(L, base, amp, f1, f2, speed, t, ci, outline, off = 0) {
    for (let x = 0; x < L.sw; x++) {
      const y = Math.round(base - amp * (0.55 + 0.45 * Math.sin((x + t * speed + off) * f1) ) - amp * 0.5 * Math.sin((x + t * speed + off) * f2 + 1.3));
      R(x, y, 1, L.sh - y, ci);
      if (outline != null) R(x, y, 1, 1, outline);
    }
  }
  function horizon(L, k) { return Math.round(L.sh * (L.vert ? Math.max(0.5, k + 0.1) : k)); }

  function meadow(t, L, v) {
    if (!BG) return;
    const { sw, sh } = L, hy = horizon(L, 0.6);
    NOINK = true;
    grad(0, 0, sw, hy + 2, 1, 0);
    sunDisc(Math.round(sw * (v ? 0.2 : 0.82)), Math.round(hy * 0.4 + Math.sin(t * 0.6) * 1.3), t, 9);
    const r = rng(7 + v);
    for (let i = 0; i < 4; i++) { const sp = 3 + i * 1.3, x = mod(r() * (sw + 60) - t * sp, sw + 60) - 30, y = 8 + r() * hy * 0.5; cloud(x, y, 0, 2); cloud(x, y, -0 , 0); R(x - 7, y + 4, 19, 1, 1); }
    silhouette(L, hy - 1, 7, 0.045, 0.11, 4, t, 1, 2, v * 40);
    if (v) {
      // A park: round trees scroll past the back hills.
      for (let i = 0; i < 9; i++) {
        const x = mod(i * 31 + 9 - t * 8, sw + 40) - 20, h = 9 + (i % 3) * 3;
        R(x, hy - h + 2, 2, h, 3); disc(x + 1, hy - h, 6 + (i % 2), 3); disc(x + 1, hy - h, 5 + (i % 2), i % 2 ? 2 : 1);
        R(x - 2, hy - h - 2, 3, 1, 0);
      }
    }
    silhouette(L, hy + 9, 5, 0.06, 0.14, 9, t, 2, 3, 70);
    const gy = hy + 14;
    R(0, gy, sw, sh - gy, 3);
    for (let x = -8; x < sw + 8; x += 7) { const xx = Math.round(mod(x - t * 18, sw + 14) - 7); R(xx, gy + 2 + ((x / 7 + 3) % 3) * 3, 3, 1, 2); R(xx + 1, gy - 1, 1, 2, 2); R(xx + 3, gy, 1, 1, 2); }
    for (let i = 0; i < 6; i++) { const x = Math.round(mod(i * 41 + 12 - t * 18, sw + 30) - 15), b = Math.round(Math.sin(t * 3 + i) * 1); disc(x, gy - 2 + b, 2, 0); PX(x, gy - 2 + b, 1); R(x, gy, 1, 3, 2); }
    for (let i = 0; i < 3; i++) bird(mod(i * 83 + 30 + t * (9 + i * 3), sw + 40) - 20, 12 + i * 7 + Math.sin(t * 1.4 + i) * 3, t, i);
    NOINK = false;
  }
  let MOON = null;
  function city(t, L, seed) {
    if (!BG) return;
    const { sw, sh } = L, hy = horizon(L, 0.66);
    NOINK = true;
    grad(0, 0, sw, hy, 3, 2);
    const r = rng(31 + seed);
    for (let i = 0; i < 46; i++) { const x = Math.floor(r() * sw), y = Math.floor(r() * hy * 0.8), ph = r() * 6; if (Math.sin(t * 2.5 + ph * 2) > -0.55) PX(x, y, i % 4 === 0 ? 0 : 1); if (i % 11 === 0 && Math.sin(t * 2.5 + ph) > 0.4) { R(x - 1, y, 3, 1, 0); R(x, y - 1, 1, 3, 0); } }
    const mx = MOON ? MOON[0] : Math.round(sw * 0.84), my = MOON ? MOON[1] : Math.round(hy * 0.3);
    disc(mx, my, 8, 0); disc(mx + 4, my - 2, 7, 3);
    for (let k = 0; k < 3; k++) PX(mx - 4 + k * 2, my + 4 - k, 1);
    for (let layer = 0; layer < 2; layer++) {
      const ci = layer ? 3 : 2, period = 150 + layer * 40, sp = 4 + layer * 6, rr = rng(5 + layer + seed * 3);
      let x = -mod(t * sp, period);
      const base = hy + 3, out = [];
      while (x < sw + 30) {
        const w = 11 + Math.floor(rr() * 13), h = 18 + Math.floor(rr() * 30) + layer * 6;
        out.push([x, w, h]);
        x += w + 1;
        if (x - (-mod(t * sp, period)) > period) break;
      }
      for (let rep = 0; rep < 3; rep++) for (const [bx, w, h] of out) {
        const X = Math.round(bx + rep * period);
        if (X > sw || X + w < 0) continue;
        R(X, base - h, w, h + sh, ci); if (layer === 0) R(X, base - h, w, 1, 1);
        if (w > 12 && h > 28) R(X + (w >> 1), base - h - 3, 1, 3, 3);
        const wcols = Math.floor((w - 2) / 3), wrows = Math.floor((h - 3) / 4);
        for (let cx = 0; cx < wcols; cx++) for (let cr = 0; cr < wrows; cr++) {
          const hh = hash(X * 0.31 + cx * 7.3 + cr * 3.1 + layer * 5 + Math.floor((t + hash(cx + cr)) / 2.2) * (hash(cx * 3 + cr) > 0.82 ? 1 : 0));
          if (hh > 0.45) R(X + 2 + cx * 3, base - h + 3 + cr * 4, 2, 2, layer ? 1 : 0);
        }
      }
    }
    R(0, hy + 14, sw, sh, 3);
    for (let x = 0; x < sw; x += 6) R(Math.round(mod(x - t * 14, sw)), hy + 17 + ((x / 6) % 2) * 4, 3, 1, 2);
    NOINK = false;
  }
  function gear(cx, cy, r, teeth, a, ci, hub) {
    disc(cx, cy, r, ci);
    for (let i = 0; i < teeth; i++) { const an = a + (i * TAU) / teeth; R(cx + Math.cos(an) * (r + 1) - 1, cy + Math.sin(an) * (r + 1) - 1, 3, 3, ci); }
    disc(cx, cy, Math.max(1, r - 3), hub); disc(cx, cy, 2, ci);
    for (let k = 0; k < 3; k++) { const an = a * 1.0 + (k * TAU) / 3; R(cx + Math.cos(an) * (r - 3) * 0.7, cy + Math.sin(an) * (r - 3) * 0.7, 1, 1, ci); }
  }
  function lab(t, L) {
    if (!BG) return;
    const { sw, sh } = L;
    NOINK = true;
    R(0, 0, sw, sh, 1);
    for (let y = 3; y < sh; y += 6) for (let x = 3; x < sw; x += 6) R(x, y, 1, 1, 2);
    // Shelves of jars along the top, gears at the sides, pipe with bubbles along the floor.
    const sy = L.vert ? Math.round(sh * 0.2) : 24;
    R(0, sy + 8, sw, 2, 3);
    for (let i = 0; i < 14; i++) { const x = 6 + i * 17; if (x > sw - 8) break; const h = 5 + (i * 7) % 5; R(x, sy + 8 - h, 7, h, 3); R(x + 1, sy + 8 - h + 1, 5, h - 1, i % 2 ? 0 : 1); if (i % 3 === 0) R(x + 1, sy + 8 - h + 1 + Math.round(1 + Math.sin(t * 2 + i) * 1), 5, 1, 2); }
    gear(8, sh - 30, 13, 8, t * 0.8, 2, 1); gear(sw - 8, sh - 34, 15, 9, -t * 0.7, 2, 1); gear(sw - 30, sh - 14, 9, 7, t * 1.2 + 0.4, 3, 1); gear(30, sh - 12, 8, 7, -t * 1.4 + 0.2, 3, 1);
    const py = sh - 20;
    R(0, py, sw, 3, 3); R(0, py + 1, sw, 1, 1);
    for (let k = 0; k < 9; k++) { const x = Math.round(mod(k * 29 - t * 20, sw + 10) - 4); disc(x, py + 1, 1, 0); }
    for (let k = 0; k < 7; k++) { const x = 13 + k * 33, y = Math.round(py - 3 - mod(t * 9 + k * 5, 14)); if (x < sw) { PX(x, y, 3); PX(x + 1, y - 1, 3); } }
    NOINK = false;
  }
  function sea(t, L) {
    if (!BG) return;
    const { sw, sh } = L, hy = horizon(L, 0.46);
    NOINK = true;
    grad(0, 0, sw, hy, 1, 0);
    sunDisc(Math.round(sw * 0.16), Math.round(hy * 0.5), t, 8);
    const r = rng(19);
    for (let i = 0; i < 3; i++) { const x = mod(r() * (sw + 60) - t * (2.5 + i), sw + 60) - 30; cloud(x, 6 + i * 6, 0, 0); R(x - 7, 10 + i * 6, 19, 1, 1); }
    R(0, hy, sw, sh - hy, 1);
    for (let row = 0; row < sh - hy; row += 3) {
      const y = hy + row, sp = 3 + row * 0.5, rr = rng(row + 3);
      if (row % 6 === 0) R(0, y, sw, 1, 2);
      for (let x = -10; x < sw + 10; x += 9 + Math.floor(rr() * 7)) { const xx = Math.round(mod(x + t * sp * (row % 2 ? 1 : -1), sw + 20) - 10); R(xx, y + 1, 3 + (row >> 3), 1, 0); }
    }
    R(Math.round(sw * 0.62), hy - 3, 20, 3, 2); R(Math.round(sw * 0.62) + 3, hy - 6, 12, 3, 2);
    for (let i = 0; i < 3; i++) bird(mod(i * 80 + 40 - t * (10 + i * 2), sw + 40) - 20, 8 + i * 5 + Math.sin(t * 1.6 + i) * 3, t, i);
    NOINK = false;
  }
  function dunes(t, L) {
    if (!BG) return;
    const { sw, sh } = L, hy = horizon(L, 0.52);
    NOINK = true;
    grad(0, 0, sw, hy + 4, 1, 0);
    sunDisc(Math.round(sw * 0.76), Math.round(hy * 0.62), t, 10);
    const r = rng(3);
    for (let i = 0; i < 3; i++) { const x = mod(r() * (sw + 60) - t * (3 + i), sw + 60) - 30; cloud(x, 6 + i * 5, 0, 0); R(x - 7, 10 + i * 5, 19, 1, 1); }
    silhouette(L, hy + 2, 8, 0.03, 0.07, 3, t, 1, 2, 20);
    silhouette(L, hy + 12, 7, 0.04, 0.09, 6, t, 2, 3, 90);
    R(0, hy + 22, sw, sh, 1);
    silhouette(L, hy + 24, 4, 0.05, 0.12, 12, t, 2, 3, 150);
    for (let i = 0; i < 5; i++) { const x = Math.round(mod(i * 52 + 14 - t * 12, sw + 40) - 20), y = hy + 24 + (i % 2) * 8, h = 9 + (i % 3) * 3; R(x, y - h, 3, h, 3); R(x - 3, y - h + 3, 1, 5, 3); R(x - 3, y - h + 7, 4, 1, 3); R(x + 5, y - h + 1, 1, 6, 3); R(x + 3, y - h + 6, 3, 1, 3); R(x + 1, y - h + 1, 1, h - 2, 2); }
    NOINK = false;
  }

  // ---- header, hud ---------------------------------------------------------------------------------
  function header(f, ids) {
    const { L } = f, local = f.local;
    const text = ids.map(dom).join(" ");
    const w = L.sw - 8, tx = 15, maxL = L.vert ? 3 : 2;
    const lines = wrap(text, w - tx - 5, 1, maxL);
    const ph = 7 + lines.length * 7 + (lines.length - 1) * 3, y = 3;
    plate(4, y, w, ph, 0, 3);
    R(5, y + 1, w - 2, 1, 1);
    const typed = Math.floor(clamp((local - 0.02) / 0.5) * (lines.join("").length + 3));
    let used = 0;
    lines.forEach((ln, i) => { T(ln, 4 + tx, y + 4 + i * 10, 1, 3, { n: typed - used, shadow: 1 }); used += ln.length; });
    const done = typed >= lines.join("").length;
    if (!done || mod(f.t, 0.8) < 0.5) {
      const ln = lines[Math.min(lines.length - 1, Math.max(0, lines.findIndex((l, i) => lines.slice(0, i + 1).join("").length >= typed)))] || "";
      const upto = typed - lines.slice(0, lines.indexOf(ln)).join("").length;
      const cx = 4 + tx + clamp(upto, 0, ln.length) * 6, cyl = y + 4 + Math.max(0, lines.indexOf(ln)) * 10;
      R(cx, cyl, 4, 7, 3);
    }
    coin(4 + 7, y + (ph >> 1), f.t);
    const mx = 4 + w - 8;
    for (let k = 0; k < 3; k++) { const a = mod(f.t * 2.4 - k * 0.5, 3); R(mx - k * 4, y + (ph >> 1) - 2, 2, 5, a < 1 ? 3 : 1); }
    for (let x = 6; x < w - 2; x += 6) R(4 + 2 + Math.round(mod(x + f.t * 16, w - 4)) - 1, y + ph - 2, 3, 1, 2);
    return y + ph + 4;
  }
  function hud(F, L, t, P, i) {
    D = F; NOINK = false;
    const y = L.sh - 11, w = L.sw;
    R(0, y, w, 11, 3); R(0, y, w, 1, 2);
    const n = P ? P.shown.length : 1, k = P ? i + 1 : 1;
    for (let h = 0; h < 3; h++) heart(3 + h * 9, y + 3 + (mod(Math.floor(t * 2) + h, 3) === 0 ? -1 : 0), 0);
    const lab = L.vert ? k + "/" + n : "STAGE " + k + "/" + n;
    // The counter flips with the wipe: a quick inverse flash marks the new stage.
    const flash = P && P.flash > 0;
    if (flash) R(31, y + 1, tw(lab, 1) + 4, 9, 0);
    T(lab, 33, y + 2, 1, flash ? 3 : 0);
    const bx = 33 + tw(lab, 1) + 8, bw = w - bx - 34;
    if (bw > 20) {
      R(bx, y + 4, bw, 3, 2);
      const frac = P ? clamp(t / P.length) : 0.5;
      R(bx, y + 4, Math.round(bw * frac), 3, 0);
      if (P) for (const s of P.shown) R(bx + Math.round((bw * s.start) / P.length), y + 3, 1, 5, 0);
      // A tiny runner rides the bar, kept inside the HUD strip so it never covers the scene.
      const rx = bx + Math.round(bw * frac), st = Math.floor(t * 8) % 2;
      R(rx - 2, y + 2, 5, 5, 0); R(rx - 1, y + 3, 3, 3, 1); PX(rx + 1, y + 3, 3); R(rx, y + 1, 1, 1, 0); PX(rx + 1, y + 1 - st, 0);
      R(rx - 2 + st, y + 7, 2, 1, 0); R(rx + 1 - st, y + 7, 2, 1, 0);
    }
    // Battery: cells drain and refill.
    const bt = w - 24;
    R(bt, y + 2, 18, 7, 0); R(bt + 1, y + 3, 16, 5, 3); R(bt + 18, y + 4, 2, 3, 0);
    const lit = 1 + Math.floor(mod(t * 0.9, 4));
    for (let c = 0; c < 4; c++) if (c < lit) R(bt + 2 + c * 4, y + 4, 3, 3, 0);
  }

  // ---- layout ---------------------------------------------------------------------------------------
  function layout(S) {
    const G = Math.max(2, Math.round(8 * S.u)), B = S.paint ? 5 : 0;
    const sw = Math.floor(S.W / G) - 2 * B, sh = Math.floor(S.H / G) - 2 * B;
    return { G, B, sw, sh, ox: Math.floor((S.W - sw * G) / 2), oy: Math.floor((S.H - sh * G) / 2), vert: sw < sh * 1.25 };
  }

  // ---- scenes ----------------------------------------------------------------------------------------
  const SC = {};
  const DEFAULTS = {
    chart: { labels: ["Mon", "Tue", "Wed", "Thu"], values: [12, 19, 27, 41], suffix: "", prefix: "", highlight: 3 },
    object: { kind: "laptop", callouts: ["Live preview", "The proposed clip", "Your original track"] },
    people: { count: 4, badges: ["Editor", "Producer", "Client"], highlight: 1 },
    process: { steps: ["Read the cut", "Draft the change", "You approve"] },
    compare: { left: "Re-prompts", leftValue: 9, right: "Dial changes", rightValue: 2, suffix: "", prefix: "" },
  };
  const fmtNum = (v, prefix, suffix) => window.DreamcutMotion.formatNumber(v, 0, prefix || "", suffix || "").toUpperCase();

  // Title: a meadow level with the title bobbing over it and a parade along the ground.
  SC.title = (f) => {
    const { L, t, local } = f;
    meadow(t, L, 0);
    const gy = horizon(L, 0.6) + 14;
    const kick = dom("kicker"), title = dom("title");
    let sc = 3, lines;
    for (; sc >= 1; sc--) { lines = wrap(title, L.sw - 16, sc, L.vert ? 5 : 3); if (lines.length * (7 * sc + 3 * sc) <= L.sh * (L.vert ? 0.5 : 0.52) && !lines.some((l) => l.endsWith(".."))) break; }
    sc = Math.max(1, sc);
    const th = lines.length * 10 * sc - 3 * sc, kw = Math.min(L.sw - 12, tw(kick.toUpperCase(), 1) + 18);
    const block = 14 + 7 + th, y0 = Math.round(Math.max(5, (gy - 4 - block) * 0.5 + 2));
    const kq = clamp(local / 0.45);
    plate(Math.round((L.sw - kw) / 2), y0, kw * eo(kq), 14, 0, 3);
    if (kq > 0.5) T(kick, L.sw >> 1, y0 + 4, 1, 3, { align: "c", n: kick.length * seg(kq, 0.5, 1) + 1 });
    const total = lines.join("").length, shown = Math.floor(seg(local, 0.15, 0.95) * (total + 1));
    let used = 0;
    lines.forEach((ln, i) => {
      T(ln, L.sw >> 1, y0 + 21 + i * 10 * sc, sc, 3, { align: "c", n: shown - used, halo: 0, shadow: 1, wave: t * 3.2 + i, amp: sc > 1 ? 1 : 1 });
      used += ln.length;
    });
    // Parade on the ground.
    for (let i = 0; i < 5; i++) {
      const sp = 11 + (i % 3) * 2, x = Math.round(mod(i * (L.sw / 4.2) + 8 + t * sp, L.sw + 40) - 20);
      if (i % 3 === 0) pip(x, gy + 8 + (i % 2) * 4, t, { walk: true, f: 1, seed: i, happy: true });
      else if (i % 3 === 1) blip(x, gy + 8 + (i % 2) * 4, t, { seed: i });
      else snail(x, gy + 9, t + i);
    }
    // Spinning coins and a START chevron keep the lower half moving.
    for (let i = 0; i < 5; i++) coin(Math.round(L.sw * (0.12 + i * 0.19)), Math.round(gy - 11 + Math.sin(t * 2 + i) * 2), t, i * 0.7);
  };

  SC.chart = (f) => {
    const { L, t, local, p } = f, d = f.data;
    MOON = [L.vert ? L.sw - 14 : 16, L.vert ? 34 : 32];
    city(t, L, 1);
    MOON = null;
    const top = header(f, HEADS.chart);
    const n = d.values.length, max = Math.max(...d.values, 1);
    const base = L.sh - 24, topLimit = top + 27, maxH = base - topLimit;
    const bw = Math.min(L.vert ? 20 : 31, Math.floor((L.sw - 24) / (n * 1.4))), gap = Math.round(bw * (L.vert ? 0.42 : 0.5));
    const tot = n * bw + (n - 1) * gap, x0 = Math.round((L.sw - tot) / 2);
    // Axis ticks and dotted guides behind the bars.
    for (let g = 1; g <= 4; g++) { const y = base - Math.round((maxH * g) / 4); for (let x = 3; x < L.sw - 3; x += 4) R(x + (g % 2) * 2, y, 1, 1, 1); R(2, y, 3, 1, 0); }
    R(0, base, L.sw, L.sh - base, 3); R(0, base, L.sw, 1, 2);
    for (let x = 0; x < L.sw; x += 8) R(Math.round(mod(x - t * 12, L.sw)), base + 4 + ((x >> 3) % 2) * 4, 4, 1, 2);
    const tops = [];
    d.values.forEach((v, i) => {
      const q = bk(seg(p, (i / n) * 0.5, (i / n) * 0.5 + 0.5)), full = Math.round((maxH * v) / max);
      const hh = Math.max(q > 0.02 ? 2 : 0, Math.round(full * q / 4) * 4), x = x0 + i * (bw + gap), hot = i === d.highlight;
      tops.push({ x: x + bw / 2, y: base - Math.round(full * clamp(q, 0, 1.05)) });
      if (hh <= 0) return;
      const y = base - hh;
      R(x - 1, y - 1, bw + 2, hh + 1, 3);
      R(x, y, bw, hh, hot ? 0 : 1);
      if (hot) {
        const off = Math.floor(t * 12);
        for (let yy = y + 2; yy < base; yy++) for (let sx = 0; sx < bw + 8; sx += 8) { const px = x + sx + mod(off - yy, 8) - 8; const a = Math.max(x, px), b = Math.min(x + bw, px + 3); if (b > a) R(a, yy, b - a, 1, 3); }
        R(x, y, bw, 2, 3); R(x, y + 2, 1, hh - 2, 3); R(x + bw - 1, y + 2, 1, hh - 2, 3);
      } else {
        for (let yy = y + 4; yy < base; yy += 4) R(x, yy, bw, 1, 2);
        R(x + 2, y + 2, 2, Math.max(0, hh - 4), 0);
        const sh = mod(t * 22 + i * 17, hh + 26) - 8; if (sh >= 0 && sh < hh - 1) R(x + 5, base - sh - 2, bw - 8, 2, 0);
      }
      const val = fmtNum(v * clamp(q, 0, 1), d.prefix, d.suffix), ns = tw(val, 2) <= bw + gap - 2 ? 2 : 1;
      T(val, Math.round(x + bw / 2), y - (ns === 2 ? 17 : 11), ns, 3, { align: "c", halo: 0, shadow: 1 });
      const lb = wrap(d.labels[i] || "", bw + gap - 2, 1, 1)[0] || "";
      T(lb, Math.round(x + bw / 2), base + 6, 1, 0, { align: "c" });
      if (hot && q > 0.9) { star(Math.round(x + bw / 2 + tw(val, ns) / 2 + 8), y - (ns === 2 ? 9 : 6) - Math.round(Math.abs(Math.sin(t * 4)) * 2)); }
    });
    // Pip patrols the ground line: it walks from gap to gap between the bars and stops in each gap to cheer,
    // so it never stands on a numeral or a day label.
    if (tops.length) {
      const stops = [x0 - Math.round(gap * 0.6) - 2];
      for (let i = 0; i < n - 1; i++) stops.push(x0 + i * (bw + gap) + bw + Math.round(gap / 2));
      stops.push(x0 + tot + Math.round(gap * 0.6) + 2);
      const seq = []; for (let i = 0; i < stops.length; i++) seq.push(i); for (let i = stops.length - 2; i > 0; i--) seq.push(i);
      const step = 0.95, tt = Math.max(0, local - 0.15), k = Math.floor(tt / step), e = (tt % step) / step;
      const a = stops[seq[k % seq.length]], b = stops[seq[(k + 1) % seq.length]];
      const walk = e > 0.45, ee = eio((e - 0.45) / 0.55), px = a + (b - a) * (walk ? ee : 0);
      const hop = !walk && e > 0.12 && e < 0.38 ? Math.round(Math.sin(seg(e, 0.12, 0.38) * PI) * 5) : 0;
      pip(Math.round(px), base - hop, t, { walk, air: hop > 0, f: walk ? (b >= a ? 1 : -1) : (b >= a ? 1 : -1), happy: true, sq: hop > 0 ? -1 : 0 });
      if (!walk && hop > 0) { for (let s = 0; s < 3; s++) PX(Math.round(px) - 6 + s * 6, base - 20 - hop - (s % 2) * 2, 0); }
    }
    for (let i = 0; i < 5; i++) coin(Math.round(mod(i * 49 + 20 - t * 7, L.sw + 20) - 5), Math.round(topLimit - 4 + Math.sin(t * 1.8 + i) * 3), t, i);
  };

  // A little screen full of timeline, drawn inside the glass rect. Returns anchor points for callouts.
  function screenUI(x, y, w, h, t, q) {
    R(x, y, w, h, 0);
    R(x, y, w, 5, 2); for (let k = 0; k < 3; k++) R(x + 2 + k * 4, y + 2, 2, 2, 0);
    R(x + w - 12, y + 2, 9, 1, 0);
    const pw = w - 6, ph = Math.round((h - 7) * 0.56), px = x + 3, py = y + 7;
    R(px - 1, py - 1, pw + 2, ph + 2, 3);
    grad(px, py, pw, ph, 1, 0);
    disc(px + pw - 9, py + 8, 4, 0); disc(px + pw - 9, py + 8, 5, 1); disc(px + pw - 9, py + 8, 3, 0);
    for (let i = 0; i < pw; i += 1) { const yy = Math.round(py + ph - 5 - 3 * Math.sin((i + t * 14) * 0.18)); R(px + i, yy, 1, py + ph - yy, 2); }
    R(px, py + ph - 3, pw, 3, 3);
    pip(Math.round(px + pw * 0.35 + Math.sin(t * 1.4) * pw * 0.12), py + ph - 3 - Math.max(0, Math.round(Math.sin(t * 6) * 3)), t, { walk: true, f: Math.cos(t * 1.4) > 0 ? 1 : -1 });
    if (Math.floor(t * 2) % 2) disc(px + 4, py + 4, 1, 3);
    const ty = py + ph + 3, th = y + h - ty - 2, rows = 3, rh = Math.max(4, Math.floor((th - 4) / rows) - 1);
    for (let k = 0; k < pw; k += 6) { R(px + Math.round(mod(k - t * 6, pw)), ty, 1, 2, 2); }
    const anchors = { prev: [px + pw / 2, py + ph / 2], clip: [0, 0], track: [0, 0] };
    for (let r = 0; r < rows; r++) {
      const ry = ty + 3 + r * (rh + 1), rr = rng(11 + r * 5);
      R(px, ry, pw, rh, r === 0 ? 1 : 0); R(px, ry + rh, pw, 1, 2);
      let cx = -Math.round(mod(t * (r === 0 ? 5 : 3), 80));
      for (let c = 0; c < 8; c++) {
        const cw = 12 + Math.floor(rr() * 18), s0 = cx, e0 = cx + cw; cx += cw + 3 + Math.floor(rr() * 4);
        if (e0 < 0 || s0 > pw) continue;
        const a0 = Math.max(0, s0), a1 = Math.min(pw, e0);
        if (r === 0 && c === 2) {
          R(px + a0, ry, a1 - a0, rh, 3);
          for (let sx = a0; sx < a1; sx++) if (mod(sx + Math.floor(t * 14), 6) < 2) R(px + sx, ry + 1, 1, rh - 2, 0);
          anchors.clip = [px + (a0 + a1) / 2, ry + rh / 2];
        } else { R(px + a0, ry, a1 - a0, rh, r === 0 ? 2 : 1); R(px + a0, ry, a1 - a0, 1, 3); if (a1 - a0 > 4) R(px + a0 + 1, ry + 2, Math.min(a1 - a0 - 2, 5), 1, 0); }
        if (r === 2 && c === 1) anchors.track = [px + (a0 + a1) / 2, ry + rh / 2];
      }
    }
    const phx = px + Math.round(mod(t * 13 + 20, pw)), top = py + ph + 1;
    R(phx, top, 1, y + h - top - 2, 3); R(phx - 1, top, 3, 2, 3);
    return anchors;
  }
  function deviceFrame(kind, x, y, w, h, t) {
    if (kind === "phone") {
      R(x - 3, y - 3, w + 6, h + 6, 3); R(x - 2, y - 2, w + 4, 1, 2);
      R(x + (w >> 1) - 5, y - 1, 10, 2, 3);
      R(x + w + 3, y + 10, 1, 8, 3);
      return screenUI(x, y, w, h, t);
    }
    R(x - 3, y - 3, w + 6, h + 6, 3); R(x - 2, y - 2, w + 4, 1, 2);
    const a = screenUI(x, y, w, h, t);
    // Hinge, base and a keyboard whose keys flicker.
    R(x - 8, y + h + 3, w + 16, 3, 2); R(x - 8, y + h + 3, w + 16, 1, 3);
    R(x - 14, y + h + 6, w + 28, 8, 3); R(x - 13, y + h + 7, w + 26, 1, 1);
    const rr = Math.floor(t * 7);
    for (let r = 0; r < 2; r++) for (let k = 0; k < Math.floor((w + 20) / 5); k++) R(x - 10 + k * 5, y + h + 8 + r * 3, 4, 2, hash(k * 3 + r * 7 + rr * 1.7) > 0.9 ? 0 : 1);
    R(x + (w >> 1) - 5, y + h + 12, 10, 1, 2);
    return a;
  }
  function leader(ax, ay, bx, by, t, i) {
    const dx = bx - ax, dy = by - ay, n = Math.max(1, Math.round(Math.hypot(dx, dy) / 3));
    for (let k = 0; k <= n; k++) { const q = k / n; if ((k + Math.floor(t * 6)) % 2 === 0) R(ax + dx * q, ay + dy * q, 2, 2, 3); }
    const bl = Math.floor(t * 3 + i) % 2;
    disc(bx, by, 3, 3); disc(bx, by, 2, bl ? 0 : 1);
  }
  SC.object = (f) => {
    const { L, t, local, p } = f, d = f.data;
    lab(t, L);
    const top = header(f, HEADS.object);
    const phone = d.kind === "phone", vert = L.vert;
    const q = bk(seg(p, 0, 0.4));
    let dx, dy, dw, dh;
    if (phone) { dw = vert ? 40 : 42; dh = vert ? 72 : 76; dx = vert ? Math.round(L.sw / 2 - dw / 2) : 32; dy = vert ? top + 12 : Math.round(top + (L.sh - 12 - top - dh) / 2); }
    else { dw = vert ? Math.min(84, L.sw - 40) : 92; dh = Math.round(dw * 0.6); dx = vert ? Math.round(L.sw / 2 - dw / 2) : 15; dy = vert ? top + 10 : Math.round(top + (L.sh - 12 - top - dh - 14) / 2); }
    const bob = Math.round(Math.sin(t * 1.5) * 1);
    const slide = Math.round((1 - eo(q)) * 40);
    D.c.save(); D.k.save(); D.c.translate(0, slide + bob); D.k.translate(0, slide + bob);
    const a = deviceFrame(d.kind, dx, dy, dw, dh, t);
    D.c.restore(); D.k.restore();
    const anchors = [a.prev, a.clip, a.track].map((pt) => [pt[0], pt[1] + slide + bob]);
    const n = Math.min(3, d.callouts.length);
    const pws = vert ? L.sw - 16 : Math.min(112, L.sw - dx - dw - 26);
    const plans = d.callouts.slice(0, n).map((txt) => { const lines = wrap(txt || "", pws - 22, 1, 3); return { txt: txt || "", lines, ph: 8 + lines.length * 7 + (lines.length - 1) * 3 + 3 }; });
    const sumH = plans.reduce((a2, pl) => a2 + pl.ph, 0), freeH = vert ? 0 : (L.sh - 17 - top - 2) - sumH, gapH = vert ? 4 : Math.max(3, Math.floor(freeH / (n + 1)));
    let cursor = vert ? dy + dh + 26 : top + 2 + gapH;
    plans.forEach((pl, i) => {
      const cq = seg(p, 0.3 + i * 0.16, 0.62 + i * 0.16), { txt, lines, ph } = pl;
      const px = vert ? 8 : L.sw - pws - 7, py = cursor, pw = pws;
      cursor += ph + gapH;
      if (cq <= 0) return;
      const ay = py + (ph >> 1);
      if (cq > 0.5) leader(vert ? px + 6 : px, vert ? py : ay, anchors[i][0], anchors[i][1], t, i);
      plate(px, py, pw * eo(cq), ph, 0, 3);
      if (cq > 0.35) {
        disc(px + 8, ay, 5, 3); T(String(i + 1), px + 8, ay - 3, 1, 0, { align: "c" });
        let used = 0; const shown = Math.floor(seg(cq, 0.35, 1) * (txt.length + 2));
        lines.forEach((ln, k) => { T(ln, px + 17, py + 5 + k * 10, 1, 3, { n: shown - used }); used += ln.length; });
        if (shown < txt.length || mod(t, 0.8) < 0.45) R(px + pw - 7, py + 4, 3, 7, 3);
      }
    });
    // Floating sparks over the bench.
    for (let i = 0; i < 6; i++) { const sx = Math.round(mod(i * 41 + 12 + t * 6, L.sw)), sy = Math.round(L.sh - 24 - mod(t * 12 + i * 9, 50)); if (hash(i + Math.floor(t * 3)) > 0.3) { PX(sx, sy, 0); PX(sx + 1, sy, 0); PX(sx, sy - 1, 0); } }
  };

  // A person: round head, a hairstyle by index, shirt and a waving arm.
  function person(x, y, k, t, o = {}) {
    const hot = o.hot, bob = Math.round(Math.sin(t * 3 + k * 1.3) * 1 + (hot ? Math.abs(Math.sin(t * 4)) * -2 : 0));
    y += bob;
    // legs and shoes
    R(x - 5, y - 6, 4, 6, 3); R(x + 1, y - 6, 4, 6, 3); R(x - 6, y - 1, 5, 2, 3); R(x + 1, y - 1, 5, 2, 3);
    // torso
    R(x - 8, y - 20, 17, 15, 3); R(x - 7, y - 19, 15, 13, k % 2 ? 2 : 1);
    if (k % 3 === 0) for (let s = 0; s < 3; s++) R(x - 7, y - 17 + s * 4, 15, 1, 3);
    else if (k % 3 === 1) R(x - 1, y - 19, 3, 13, 0);
    else { R(x - 7, y - 12, 15, 2, 0); }
    R(x - 3, y - 20, 7, 2, 0); R(x - 1, y - 18, 3, 1, 0);
    R(x + 2, y - 15, 4, 3, 0); R(x + 2, y - 15, 4, 1, 3);
    // arms
    R(x - 11, y - 18, 3, 11, 3); R(x - 10, y - 17, 1, 9, k % 2 ? 2 : 1);
    const w = Math.floor(t * 4 + k) % 2;
    if (hot || w) { R(x + 9, y - 25, 3, 9, 3); R(x + 10, y - 24, 1, 7, 0); R(x + 8 + w, y - 28, 5, 4, 3); R(x + 9 + w, y - 27, 3, 2, 0); }
    else { R(x + 9, y - 18, 3, 11, 3); R(x + 10, y - 17, 1, 9, k % 2 ? 2 : 1); }
    // head
    R(x - 2, y - 24, 5, 4, 3);
    disc(x, y - 31, 8, 3); disc(x, y - 31, 7, 0); R(x + 2, y - 27, 5, 3, 1);
    const hair = [() => { R(x - 7, y - 39, 15, 4, 3); R(x - 8, y - 36, 3, 4, 3); R(x + 6, y - 36, 3, 3, 3); }, () => { for (let s = -3; s <= 3; s += 3) R(x + s * 2 - 1, y - 43 + Math.abs(s), 3, 6, 3); R(x - 7, y - 38, 15, 3, 3); },
      () => { R(x - 8, y - 40, 17, 6, 2); R(x - 8, y - 40, 17, 1, 3); R(x - 8, y - 35, 17, 1, 3); disc(x, y - 42, 2, 3); disc(x, y - 42, 1, 0); },
      () => { R(x - 7, y - 39, 15, 4, 3); disc(x + 1, y - 43, 4, 3); R(x - 8, y - 36, 2, 7, 3); R(x + 7, y - 36, 2, 7, 3); },
      () => { R(x - 7, y - 39, 15, 4, 3); R(x - 9, y - 37, 3, 14, 3); R(x + 7, y - 37, 3, 14, 3); },
      () => { R(x - 8, y - 40, 17, 5, 3); R(x - 3, y - 36, 14, 2, 3); R(x - 8, y - 39, 17, 1, 1); }][k % 6];
    hair();
    const blink = mod(t + k * 0.9, 3.2) < 0.13;
    R(x - 4, y - 32, 2, blink ? 1 : 3, 3); R(x + 2, y - 32, 2, blink ? 1 : 3, 3);
    if (k % 6 === 1 || k % 6 === 4) { R(x - 6, y - 33, 5, 1, 3); R(x + 1, y - 33, 5, 1, 3); }
    if (hot) { R(x - 3, y - 27, 7, 1, 3); R(x - 4, y - 28, 1, 1, 3); R(x + 4, y - 28, 1, 1, 3); } else R(x - 2, y - 27, 5, 1, 3);
    R(x - 6, y - 29, 2, 1, 2); R(x + 5, y - 29, 2, 1, 2);
  }
  SC.people = (f) => {
    const { L, t, p } = f, d = f.data;
    meadow(t, L, 1);
    const top = header(f, HEADS.people);
    const n = Math.max(2, Math.min(6, Number(d.count) || 4));
    const cols = L.vert ? (n <= 3 ? n : Math.ceil(n / 2)) : n, rows = Math.ceil(n / cols);
    const areaTop = top + 1, areaBot = L.sh - 13;
    const cw = (L.sw - 10) / cols, rh = (areaBot - areaTop) / rows;
    for (let i = 0; i < n; i++) {
      const col = i % cols, row = Math.floor(i / cols), cx = Math.round(5 + cw * (col + 0.5));
      const hot = i === d.highlight, q = bk(seg(p, i * 0.1, 0.45 + i * 0.1));
      const podH = 29 + (hot ? 4 : 0) + ((i * 5) % 3);
      const baseY = Math.round(areaTop + rh * (row + 1)), podTop = baseY - podH;
      const slide = Math.round((1 - eo(q)) * 60);
      const pw = Math.min(Math.round(cw) - 3, 52), x0 = cx - (pw >> 1), yT = podTop + slide;
      R(x0, yT, pw, podH + 2, 3); R(x0 + 1, yT + 1, pw - 2, podH, hot ? 0 : 1); R(x0 + 1, yT + 1, pw - 2, 2, hot ? 1 : 0);
      for (let b = 0; b < pw - 4; b += 8) R(x0 + 2 + b, yT + podH - 4 + ((b >> 3) % 2) * 2, 5, 1, 2);
      person(cx, yT, i, t, { hot });
      if (hot && q > 0.6) { const by = podTop - 54 + Math.round(Math.sin(t * 5) * 2); for (let s2 = 0; s2 < 4; s2++) R(cx - 3 + s2, by + s2, 7 - s2 * 2, 1, 3); R(cx - 1, by - 3, 3, 3, 3); star(cx - 16, by + Math.round(Math.sin(t * 3) * 2)); star(cx + 16, by + 3 + Math.round(Math.cos(t * 3) * 2)); }
      const lbl = d.badges[i] || ["You", "Guest", "Viewer"][i - 3] || "";
      if (lbl) {
        const lines = wrap(lbl, pw - 4, 1, 2), ph = 6 + lines.length * 7 + (lines.length - 1) * 3 + 1, lw = Math.min(pw - 2, Math.max(...lines.map((l) => tw(l, 1))) + 8);
        const lx = cx - (lw >> 1), ly = yT + 6;
        plate(lx, ly, lw * eo(seg(q, 0.3, 1)), ph, hot ? 3 : 0, 3);
        if (q > 0.45) { const nshow = Math.ceil(seg(q, 0.45, 0.85) * lbl.length) + 1; let used = 0; lines.forEach((ln, k) => { T(ln, cx, ly + 4 + k * 10, 1, hot ? 0 : 3, { align: "c", n: nshow - used }); used += ln.length; }); }
      }
    }
    // Speech bubbles drift over the scene.
    for (let i = 0; i < 4; i++) { const x = Math.round(mod(i * 57 + 25 + t * 10, L.sw)), y = Math.round(top + 3 + Math.sin(t * 2 + i) * 2 + (i % 2) * 5); plate(x, y, 14, 8, 0, 3); for (let k = 0; k < 3; k++) PX(x + 3 + k * 3, y + 3 + (Math.floor(t * 4 + k + i) % 3 === k ? -1 : 0), 3); }
  };

  SC.process = (f) => {
    const { L, t, p } = f, d = f.data;
    dunes(t, L);
    const top = header(f, HEADS.process);
    const n = Math.min(3, d.steps.length), vert = L.vert;
    const nodes = [], area = L.sh - 16 - top;
    for (let i = 0; i < n; i++) {
      if (vert) nodes.push([Math.round(L.sw * (i % 2 === 0 ? 0.27 : 0.72)), Math.round(top + 18 + (area - 36) * (i / Math.max(1, n - 1)))]);
      else nodes.push([Math.round(L.sw * (0.17 + (0.66 * i) / Math.max(1, n - 1))), Math.round(top + area * 0.42)]);
    }
    // Path: dotted road with moving chevrons, drawn on as the scene builds.
    // The route builds straight away so the scene is never empty while the wipe clears.
    const pe = clamp(f.local / Math.max(0.9, f.hold * 0.42)), reveal = seg(pe, 0.15, 0.85);
    for (let i = 0; i < n - 1; i++) {
      const a = nodes[i], b = nodes[i + 1], seq = clamp(reveal * (n - 1) - i), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (seq <= 0) continue;
      const m = Math.round(len / 3);
      for (let k = 0; k <= m * seq; k++) { const q = k / m, x = a[0] + (b[0] - a[0]) * q, y = a[1] + (b[1] - a[1]) * q; R(x - 1, y - 2, 3, 5, 3); R(x - 1, y - 1, 3, 3, 1); }
      for (let k = 0; k < 3; k++) { const q = mod(t * 0.4 + k / 3 + i * 0.17, 1) * seq, x = a[0] + (b[0] - a[0]) * q, y = a[1] + (b[1] - a[1]) * q; if (q < seq - 0.02) { R(x - 1, y - 1, 3, 3, 0); } }
    }
    // Pip travels the nodes: a pause on each, a hop between.
    const th = Math.max(0, f.local - 0.3 - f.hold * 0.5 * 0.55), cyc = 1.1, tot = Math.max(1, n - 1), k = Math.floor(th / cyc), ph = (th % cyc) / cyc;
    const dir = Math.floor(k / tot) % 2 ? -1 : 1, seg0 = k % tot, ia = dir > 0 ? seg0 : n - 1 - seg0, ib = dir > 0 ? seg0 + 1 : n - 2 - seg0;
    let active = ia;
    // In the closing beat the highlight follows the signal along the route (see below).
    const built = 0.245 + Math.max(0.6, f.hold * 0.55), bt = f.local - built + 0.25;
    if (bt > 0 && n > 1) { const cy0 = mod(bt, 1.5); active = cy0 < 1.0 ? Math.round(eio(cy0) * (n - 1)) : n - 1; }
    nodes.forEach((nd, i) => {
      const q = bk(seg(pe, i * 0.15, 0.4 + i * 0.15));
      if (q <= 0) return;
      const r = Math.round(14 * clamp(q, 0, 1.15)), act = i === active && f.local > 0.5, press = act ? Math.abs(Math.round(Math.sin(t * 5) * 1)) : 0;
      disc(nd[0], nd[1] + 3, r + 2, 3); disc(nd[0], nd[1] + press, r + 2, 3); disc(nd[0], nd[1] + press, r, act && Math.floor(t * 4) % 2 ? 1 : 0);
      if (r > 8) {
        if (i === 0) icoEye(nd[0], nd[1] + press, t); else if (i === 1) icoPen(nd[0], nd[1] + press, t); else icoCheck(nd[0], nd[1] + press, t);
        disc(nd[0] - r + 2, nd[1] - r + 2, 6, 3); disc(nd[0] - r + 2, nd[1] - r + 2, 4, 0); T(String(i + 1), nd[0] - r + 2, nd[1] - r - 1, 1, 3, { align: "c" });
      }
      const lines = wrap(d.steps[i] || "", vert ? Math.round(L.sw * 0.4) : 62, 1, 3);
      if (q > 0.7) {
        const lw = Math.max(...lines.map((l) => tw(l, 1))) + 10, lh = 6 + lines.length * 7 + (lines.length - 1) * 3 + 2;
        let lx, ly;
        if (vert) { lx = i % 2 === 0 ? nd[0] + 20 : nd[0] - 20 - lw; ly = nd[1] - (lh >> 1); } else { lx = nd[0] - (lw >> 1); ly = nd[1] + 22; }
        plate(lx, ly, lw, lh, act ? 3 : 0, 3);
        lines.forEach((ln, kk) => T(ln, lx + (lw >> 1), ly + 4 + kk * 10, 1, act ? 0 : 3, { align: "c" }));
      }
    });
    const A = nodes[ia], B = nodes[Math.max(0, Math.min(n - 1, ib))];
    if (f.local < 0.3 + f.hold * 0.5 * 0.55) pip(nodes[0][0], nodes[0][1] - 17 + Math.round(Math.abs(Math.sin(t * 5)) * -2), t, { f: 1, happy: true });
    else {
      const air = ph > 0.3, ee = clamp((ph - 0.3) / 0.7), px = A[0] + (B[0] - A[0]) * ee, py = A[1] - 16 + (B[1] - A[1]) * ee - (air ? Math.sin(ee * PI) * 6 : 0);
      pip(Math.round(px), Math.round(py), t, { f: B[0] >= A[0] ? 1 : -1, air, sq: air ? -1 : 0, happy: true });
      if (!(bt > 0)) active = ph > 0.85 ? ib : ia;
    }
    // Final beat, once the route is built: a bright signal runs the road from step 1 to the last step on a loop.
    // Each node it passes rings out, and arriving at the end sets off a burst of cells over the check.
    if (bt > 0 && n > 1) {
      const per = 1.5, run = 1.0, cyc = mod(bt, per), qq = clamp(cyc / run), legs = n - 1, pos = eio(qq) * legs;
      // The road charges up behind the signal: its cells light from dark to bright, then blink once full.
      const full = cyc >= run, blinkOn = !full || Math.floor((cyc - run) * 10) % 2 === 0;
      if (blinkOn) for (let l = 0; l < legs; l++) {
        const fq = clamp(pos - l); if (fq <= 0) continue;
        const a3 = nodes[l], b3 = nodes[l + 1], m = Math.round(Math.hypot(b3[0] - a3[0], b3[1] - a3[1]) / 3);
        for (let k2 = 0; k2 <= m * fq; k2++) {
          const q = k2 / m, x = a3[0] + (b3[0] - a3[0]) * q, y = a3[1] + (b3[1] - a3[1]) * q;
          if (Math.hypot(x - a3[0], y - a3[1]) < 18 || Math.hypot(x - b3[0], y - b3[1]) < 18) continue;
          R(x - 1, y - 3, 3, 7, 3); R(x - 1, y - 2, 3, 5, k2 % 2 ? 0 : 1);
        }
      }
      if (cyc < run) {
        for (let s = 0; s < 6; s++) {
          const ps = Math.max(0, pos - s * 0.06), l2 = Math.min(legs - 1, Math.floor(ps)), q2 = ps - l2, a3 = nodes[l2], b3 = nodes[l2 + 1];
          const sx = a3[0] + (b3[0] - a3[0]) * q2, sy = a3[1] + (b3[1] - a3[1]) * q2;
          R(sx - (s ? 1 : 2), sy - (s ? 1 : 2), s ? 3 : 5, s ? 3 : 5, s === 0 ? 3 : s < 3 ? 0 : 1);
        }
      }
      for (let i = 0; i < n; i++) {
        const at = (i / legs) * run * 0.92, age = cyc - at;
        if (age < 0 || age > 0.55) continue;
        const rad = 17 + Math.round(eo(age / 0.55) * 14), m = 28, ci = age < 0.2 ? 3 : age < 0.38 ? 2 : 1;
        for (let k2 = 0; k2 < m; k2++) { if ((k2 + Math.floor(age * 20)) % 2) continue; const an = (k2 * TAU) / m; if (Math.sin(an) * rad > 15) continue; R(nodes[i][0] + Math.cos(an) * rad - 1, nodes[i][1] + Math.sin(an) * rad - 1, 3, 3, ci); }
      }
      const ea = cyc - run * 0.92;
      if (ea > 0 && ea < 0.5) {
        const E = nodes[n - 1], r2 = rng(Math.floor(bt / per) + 5);
        for (let k2 = 0; k2 < 26; k2++) { const an = -PI * r2(), sp = 14 + r2() * 22, x = E[0] + Math.cos(an) * sp * eo(ea / 0.5), y = E[1] - 4 + Math.sin(an) * sp * eo(ea / 0.5) + 20 * ea * ea; R(x, y, 3, 3, k2 % 3 === 0 ? 0 : 3); }
      }
    }
    for (let i = 0; i < 4; i++) coin(Math.round(mod(i * 64 + 16 - t * 8, L.sw + 20) - 5), Math.round(top + 4 + Math.sin(t * 2 + i) * 3 + (i % 2) * 5), t, i);
  };

  function crate(x, y, t, k) {
    R(x, y, 13, 11, 3); R(x + 1, y + 1, 11, 9, 1); R(x + 1, y + 1, 11, 1, 0); R(x + 1, y + 1, 1, 9, 0);
    line(x + 2, y + 2, x + 10, y + 8, 2); line(x + 10, y + 2, x + 2, y + 8, 2); R(x + 5, y + 4, 3, 3, 3);
  }
  SC.compare = (f) => {
    const { L, t, p } = f, d = f.data;
    sea(t, L);
    const top = header(f, HEADS.compare);
    const a = Number(d.leftValue) || 0, b = Number(d.rightValue) || 0, mx = Math.max(a, b, 1), vert = L.vert;
    const half = vert ? 48 : Math.min(54, Math.floor((L.sw - 150) / 2)), cx = L.sw >> 1, fy = L.sh - 30;
    const maxC = vert ? 8 : 4, na = a > 0 ? Math.max(1, Math.round((a / mx) * maxC)) : 0, nb = b > 0 ? Math.max(1, Math.round((b / mx) * maxC)) : 0;
    const settle = bk(seg(p, 0.35, 1));
    // Hold beat: once the beam has landed, it gets a light "tune" nudge every 1.6 s and settles again
    // with a damped rock; the light side's crate hops and the result badge flashes.
    const built = 0.245 + Math.max(0.6, f.hold * 0.55), bt = f.local - built;
    const tick = bt > 0 ? mod(bt, 1.6) : -1, rock = tick >= 0 ? Math.exp(-tick * 3.2) * Math.sin(tick * 13) : 0;
    const target = clamp((a - b) / mx, -1, 1) * 0.17 * settle;
    const th = target + rock * 0.11 + Math.sin(t * 2.3) * 0.012;
    const hopR = tick >= 0 && tick < 0.4 ? Math.round(Math.sin((tick / 0.4) * PI) * 8) : 0;
    const yAt = (x) => fy - 4 - (x - cx) * Math.tan(th);
    // Each nudge sends rings across the water from the pivot's foot.
    for (let w = 0; w < 2; w++) {
      const age = tick - w * 0.25; if (tick < 0 || age < 0 || age > 1.2) continue;
      const rx = 22 + eo(age / 1.2) * (vert ? 50 : 80), ry = rx * 0.16, ci = age < 0.5 ? 3 : age < 0.9 ? 2 : 0;
      for (let k = 0; k < 40; k++) { if ((k + w) % 2) continue; const an = (k * TAU) / 40; R(cx + Math.cos(an) * rx - 1, fy + 15 + Math.sin(an) * ry, 3, 1, ci); }
    }
    for (let r = 0; r < 16; r++) R(cx - r - 1, fy + r - 2, 2 * r + 3, 1, 3);
    for (let r = 3; r < 14; r++) R(cx - r + 2, fy + r - 1, 2 * r - 3, 1, r % 4 === 0 ? 2 : 1);
    R(cx - 20, fy + 14, 41, 3, 3);
    const xl = cx - half, xr = cx + half;
    line(xl, yAt(xl), xr, yAt(xr), 3, 5); line(xl, yAt(xl) + 1, xr, yAt(xr) + 1, 1, 3);
    const stack = (xc, count, side) => {
      for (let j = 0; j < count; j++) {
        const q = seg(p, 0.1 + j * 0.07 + side * 0.04, 0.4 + j * 0.07 + side * 0.04);
        if (q <= 0) continue;
        const fall = Math.round((1 - bk(q)) * -(50 + j * 6));
        const lift = side === (a >= b ? 1 : 0) ? hopR : 0;
        crate(xc - 6, Math.round(yAt(xc) - 11 * (j + 1) + fall - lift), t, j);
      }
    };
    stack(xl + 14, na, 0); stack(xr - 14, nb, 1);
    const num = (v, cxn, ny, label, hot) => {
      const q = seg(p, 0.15, 0.7), val = fmtNum(v * clamp(q, 0, 1), d.prefix, d.suffix), sc = tw(val, 3) <= (vert ? 56 : 70) ? 3 : 2;
      T(val, cxn, ny, sc, 3, { align: "c", halo: 0, shadow: 1 });
      const lw0 = vert ? 56 : 62, per0 = Math.floor((lw0 + 1) / 6), lab2 = String(label ?? "").split(/\s+/).some((w) => w.length > per0) ? String(label).replace(/-/g, "- ") : label;
      const lines = wrap(lab2, lw0, 1, 2), lw = Math.max(...lines.map((l) => tw(l, 1)), 10) + 10, lh = 6 + lines.length * 7 + (lines.length - 1) * 3 + 2, ly = ny + 7 * sc + 4;
      plate(cxn - (lw >> 1), ly, lw, lh, hot ? 3 : 0, 3);
      lines.forEach((ln, k) => T(ln, cxn, ly + 4 + k * 10, 1, hot ? 0 : 3, { align: "c" }));
    };
    if (vert) { num(a, xl + 14, top + 4, d.left, false); num(b, xr - 14, top + 4, d.right, true); }
    else { num(a, 34, top + 12, d.left, false); num(b, L.sw - 34, top + 12, d.right, true); }
    if (a > 0 && a !== b && seg(p, 0.55, 0.9) > 0) {
      const pct = Math.round(((b - a) / a) * 100), s2 = (pct > 0 ? "+" : "") + pct + "%", bw = tw(s2, 2) + 12, by = vert ? Math.round(top + 66) : top + 6 + Math.round(Math.sin(t * 3) * 1);
      const fl = tick >= 0 && tick < 0.6 && Math.floor(tick * 10) % 2 === 0;
      plate(cx - (bw >> 1), by, bw, 20, fl ? 3 : 0, 3); T(s2, cx, by + 3, 2, fl ? 0 : 3, { align: "c" });
      for (let k = 0; k < 3; k++) { const q = mod(t * 1.6 + k / 3, 1); const yy = pct < 0 ? by + 23 + Math.round(q * 9) : by + 32 - Math.round(q * 9); R(cx - 1, yy, 3, 2, 3); R(cx - 2, yy + (pct < 0 ? 2 : -1), 5, 1, 3); }
    }
    for (let j = 0; j < 2; j++) { const fj = mod(t + j * 1.2, 2.4) / 2.4; if (fj < 0.5) { const q = fj / 0.5, dir = j ? -1 : 1, x = Math.round(L.sw * (j ? 0.86 : 0.12) + dir * (q * 16 - 8)), y0f = L.sh - 17, y = Math.round(y0f - Math.sin(q * PI) * 14); R(x - 3, y, 6, 3, 3); R(dir > 0 ? x - 6 : x + 3, y - 1, 3, 5, 3); PX(dir > 0 ? x + 1 : x - 2, y + 1, 0); if (q < 0.15 || q > 0.85) { R(x - 5, y0f + 2, 3, 1, 0); R(x + 3, y0f + 2, 3, 1, 0); PX(x - 1, y0f, 0); } } }
    // Pip rides the beam on the heavy side of the pivot, pacing a few cells and hopping with each nudge.
    const pxp = Math.round(cx - 7 + Math.sin(t * 1.1) * 3), moving = Math.abs(Math.cos(t * 1.1)) > 0.3;
    pip(pxp, Math.round(yAt(pxp)) - hopR, t, { f: Math.cos(t * 1.1) > 0 ? 1 : -1, happy: true, walk: moving && !hopR, air: hopR > 0 });
    if (tick >= 0 && tick < 0.5) { const q = tick / 0.5, sx = Math.round(L.sw - 34); for (let k = 0; k < 8; k++) { const an = (k * TAU) / 8, rr = 9 + q * 11; R(sx + Math.cos(an) * rr - 1, top + 20 + Math.sin(an) * rr * 0.7 - 1, 2, 2, q < 0.5 ? 3 : 2); } }
  };

  // Closing: night sky with fireworks, the line in big pixels and the crew bouncing along the ground.
  SC.closing = (f) => {
    const { L, t, local } = f;
    MOON = [L.sw - 16, 10];
    city(t, L, 2);
    MOON = null;
    const gy = horizon(L, 0.66) + 14;
    for (let b = 0; b < 4; b++) {
      const per = 1.7, ph = mod(t + b * 0.43, per), idx = Math.floor((t + b * 0.43) / per), age = ph / per;
      const cx = Math.round(L.sw * (0.12 + hash(idx * 3 + b) * 0.76)), cy = Math.round(L.sh * (0.14 + hash(idx * 5 + b * 2) * 0.26));
      if (age < 0.22) { const q = age / 0.22; R(cx, Math.round(gy - 6 - (gy - cy) * eo(q)), 1, 3, 0); continue; }
      const a2 = (age - 0.22) / 0.78, n = 16;
      for (let k = 0; k < n; k++) {
        const ang = (k * TAU) / n + hash(idx + b) * 6, sp = 22 + (k % 2) * 9, x = cx + Math.cos(ang) * sp * eo(a2), y = cy + Math.sin(ang) * sp * eo(a2) + 22 * a2 * a2;
        R(x, y, a2 < 0.5 ? 2 : 1, a2 < 0.5 ? 2 : 1, a2 < 0.6 ? 0 : 1);
        if (a2 < 0.55) R(x - Math.cos(ang) * 3, y - Math.sin(ang) * 3, 1, 1, 1);
      }
    }
    const text = dom("closing");
    let sc = 3, lines;
    for (; sc >= 1; sc--) { lines = wrap(text, L.sw - 16, sc, L.vert ? 5 : 3); if (lines.length * 10 * sc <= L.sh * 0.5 && !lines.some((l) => l.endsWith(".."))) break; }
    sc = Math.max(1, sc);
    const th = lines.length * 10 * sc - 3 * sc, y0 = Math.round(Math.max(6, (gy - th) * 0.42)), total = lines.join("").length, shown = Math.floor(seg(local, 0.1, 0.9) * (total + 1));
    // A dark marquee plate with a dithered rim keeps the line off the lit skyline; its border lights chase.
    const pwid = Math.max(...lines.map((l) => tw(l, sc))) + 6 * sc + 4, px0 = (L.sw >> 1) - (pwid >> 1), py0 = y0 - 3 * sc - 1, ph0 = th + 6 * sc + 2;
    const pq = eo(seg(local, 0, 0.18)), pw2 = Math.round(pwid * pq);
    if (pw2 > 4) {
      const pxa = (L.sw >> 1) - (pw2 >> 1);
      dither(pxa - 3, py0 - 3, pw2 + 6, ph0 + 6, 8, 2, 3);
      R(pxa - 1, py0 - 1, pw2 + 2, ph0 + 2, 1); R(pxa, py0, pw2, ph0, 3);
      if (pq >= 1) { const per2 = 2 * (pwid + ph0); for (let k = 0; k < per2; k += 4) { if (Math.floor(k / 4 + t * 10) % 3) continue; let x = px0 - 1, y = py0 - 1; if (k < pwid + 1) x += k; else if (k < pwid + ph0 + 2) { x += pwid + 1; y += k - pwid - 1; } else if (k < 2 * pwid + ph0 + 3) { x += pwid + 1 - (k - pwid - ph0 - 2); y += ph0 + 1; } else y += ph0 + 1 - (k - 2 * pwid - ph0 - 3); R(x, y, 1, 1, 0); } }
    }
    let used = 0;
    lines.forEach((ln, i) => { T(ln, L.sw >> 1, y0 + i * 10 * sc, sc, 0, { align: "c", n: shown - used, shadow: 2, wave: t * 3 + i, amp: 1 }); used += ln.length; });
    R(0, gy, L.sw, L.sh - gy, 3);
    for (let i = 0; i < 6; i++) {
      const x = Math.round(L.sw * (0.1 + i * 0.16)), j = Math.abs(Math.sin(t * 5 + i * 0.9)), y = gy + 9 - Math.round(j * 6);
      if (i % 3 === 0) pip(x, y, t, { air: j > 0.2, happy: true, f: i % 2 ? -1 : 1, seed: i });
      else if (i % 3 === 1) blip(x, y, t, { seed: i });
      else { person(x, y + 3, i, t, { hot: i === 2 }); }
    }
    for (let i = 0; i < 24; i++) { const x = Math.round(mod(hash(i) * L.sw + Math.sin(t + i) * 4, L.sw)), y = Math.round(mod(hash(i + 9) * L.sh + t * (10 + (i % 5) * 4), L.sh)); R(x, y, 2, 1, i % 3); }
  };

  // ---- compositing: render a scene with ghost trails, wipe between scenes, light the glass ---------
  function planOf() {
    let c = null;
    if (window.__dreamcut && window.__dreamcut.controls) c = window.__dreamcut.controls;
    else { try { if (typeof dc !== "undefined" && dc && dc.controls) c = dc.controls; } catch (e) { /* not on the template page */ } }
    if (!c) return null;
    let t = 0;
    const shown = [];
    for (const id of ORDER) { const hold = Number(c[`${id}_hold`]) || 0; if (hold > 0) shown.push({ id, start: t, hold, i: shown.length }); t += hold; }
    if (!shown.length) return null;
    return {
      shown, length: t, change: Number(c.change) || 0.45, entrance: Number(c.entrance) || 0.7,
      data: {
        chart: { labels: [c.bar_1_label, c.bar_2_label, c.bar_3_label, c.bar_4_label], values: [c.bar_1, c.bar_2, c.bar_3, c.bar_4].map(Number), suffix: c.chart_suffix, prefix: "", highlight: Number(c.highlight) - 1 },
        object: { kind: c.device, callouts: [c.callout_1, c.callout_2, c.callout_3] },
        people: { count: c.people_count, badges: [c.badge_1, c.badge_2, c.badge_3], highlight: 1 },
        process: { steps: [c.step_1, c.step_2, c.step_3] },
        compare: { left: c.before_label, leftValue: c.before_value, right: c.after_label, rightValue: c.after_value, suffix: c.compare_suffix, prefix: "" },
      },
    };
  }
  function drawPass(tgt, L, spec, dt) {
    D = tgt; NOINK = false;
    const local = spec.local - dt, hold = spec.hold;
    const p = clamp((local - 0.245) / Math.max(0.6, hold * 0.55));
    const f = { L, t: spec.t - dt, local, hold, p, data: spec.data };
    SC[spec.id](f);
  }
  function renderInto(tgt, L, spec) {
    drawPass(tgt, L, spec, 0);
    const ghost = pair("ghost", L.sw, L.sh), tex = TN.tex;
    // Character scenes stay crisp: their sprites bob every frame, and a trail there only softens edges.
    (spec.id === "people" || spec.id === "closing" ? [] : [[0.06, 0.14]]).forEach(([dt, a]) => {
      const g = pair("ghost", L.sw, L.sh);
      drawPass(g, L, spec, dt);
      tgt.c.save(); tgt.c.globalCompositeOperation = TN.ghost; tgt.c.globalAlpha = a * (0.25 + 0.75 * tex); tgt.c.drawImage(g.cv, 0, 0); tgt.c.restore();
    });
    void ghost;
  }
  const THR = {};
  function thrMap(kind, L) {
    const key = kind + ":" + L.sw + "x" + L.sh;
    if (THR[key]) return THR[key];
    const a = new Float32Array(L.sw * L.sh), B8 = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];
    for (let y = 0; y < L.sh; y++) for (let x = 0; x < L.sw; x++) {
      let v;
      if (kind === 0) v = (B8[(y & 7) * 8 + (x & 7)] + 0.5) / 64 * 0.7 + (x / L.sw) * 0.3;
      else if (kind === 1) { const c = Math.floor(x / 7); v = clamp((y / L.sh) * 0.55 + hash(c * 1.7 + 3) * 0.45); }
      else if (kind === 2) { const dx = Math.abs(x - L.sw / 2) / (L.sw / 2), dy = Math.abs(y - L.sh / 2) / (L.sh / 2); v = clamp(Math.max(dx, dy * 1.2) * 0.62 + (dx + dy) * 0.19); }
      else v = clamp((x / L.sw) * 0.72 + hash(y * 2.3 + 1) * 0.28);
      a[y * L.sw + x] = v * 0.96 + 0.02;
    }
    return (THR[key] = a);
  }
  function applyMask(tgt, L, kind, k) {
    const th = thrMap(kind, L), n = L.sw * L.sh;
    const m = document.createElement("canvas"); m.width = L.sw; m.height = L.sh;
    const mg = m.getContext("2d"), mi = mg.createImageData(L.sw, L.sh), e = document.createElement("canvas"); e.width = L.sw; e.height = L.sh;
    const eg = e.getContext("2d"), ei2 = eg.createImageData(L.sw, L.sh);
    const edge = hexToRgb(COL[3]);
    for (let i = 0; i < n; i++) {
      const v = th[i];
      if (v <= k) { mi.data[i * 4 + 3] = 255; if (v > k - 0.035) { ei2.data[i * 4] = edge[0]; ei2.data[i * 4 + 1] = edge[1]; ei2.data[i * 4 + 2] = edge[2]; ei2.data[i * 4 + 3] = 255; } }
    }
    mg.putImageData(mi, 0, 0); eg.putImageData(ei2, 0, 0);
    for (const g of [tgt.c, tgt.k]) { g.save(); g.globalCompositeOperation = "destination-in"; g.drawImage(m, 0, 0); g.restore(); }
    tgt.c.drawImage(e, 0, 0);
    tgt.k.save(); tgt.k.globalCompositeOperation = "source-over"; tgt.k.drawImage(e, 0, 0); tgt.k.restore();
  }
  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

  function bezel(ctx, S, L, t) {
    const { W, H, u } = S, x0 = L.ox, y0 = L.oy, sw = L.sw * L.G, sh = L.sh * L.G;
    const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
    g.addColorStop(0, TN.bezelHi); g.addColorStop(0.5, TN.bezel); g.addColorStop(1, TN.bezelLo);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(0, 0, W, 2 * u);
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(0, H - 2 * u, W, 2 * u);
    // Recess around the glass.
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(x0 - 5 * u, y0 - 5 * u, sw + 10 * u, sh + 10 * u);
    ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(x0 - 5 * u, y0 + sh + 3 * u, sw + 10 * u, 2 * u);
    // Power lamp, lettering and screws.
    const ly = y0 / 2, glow = 0.8 + 0.2 * Math.sin(t * 2.2);
    const lg = ctx.createRadialGradient(x0 + 24 * u, ly, 0, x0 + 24 * u, ly, 22 * u);
    lg.addColorStop(0, `rgba(255,120,90,${0.55 * glow})`); lg.addColorStop(1, "rgba(255,80,60,0)");
    ctx.fillStyle = lg; ctx.fillRect(x0, ly - 24 * u, 50 * u, 48 * u);
    ctx.fillStyle = TN.led; ctx.beginPath(); ctx.arc(x0 + 24 * u, ly, 6 * u, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.fillRect(x0 + 22 * u, ly - 3 * u, 2 * u, 2 * u);
    const k = Math.max(2, Math.round(3 * u));
    bezelText(ctx, "POWER", x0 + 40 * u, ly - 3.5 * k, k, "rgba(255,255,255,0.45)");
    const label = "4-SHADE DOT MATRIX";
    bezelText(ctx, label, W / 2 - (label.length * 6 * k) / 2, ly - 3.5 * k, k, "rgba(255,255,255,0.5)");
    for (let i = 0; i < 5; i++) { ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(x0 + sw - 20 * u - i * 8 * u, y0 + sh + 8 * u, 3 * u, 20 * u - i * 2 * u); }
    bezelText(ctx, "POCKET LCD", x0 + 8 * u, y0 + sh + 5 * u + (y0 - 5 * u - 3.5 * k) / 2 - 4 * u, k, "rgba(255,255,255,0.4)");
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    for (const [cx, cy] of [[16 * u, 16 * u], [W - 16 * u, 16 * u], [16 * u, H - 16 * u], [W - 16 * u, H - 16 * u]]) { ctx.beginPath(); ctx.arc(cx, cy, 5 * u, 0, TAU); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fillRect(cx - 3 * u, cy - u * 0.5, 6 * u, u); ctx.fillStyle = "rgba(0,0,0,0.5)"; }
  }
  let SHAD = null;
  function blit(ctx, S, L, F, t, P) {
    const { ox, oy, sw, sh, G } = L, W = sw * G, H = sh * G;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (S.paint) bezel(ctx, S, L, t);
    if (S.paint) { ctx.beginPath(); ctx.rect(ox, oy, W, H); ctx.clip(); }
    ctx.drawImage(F.cv, 0, 0, sw, sh, ox, oy, W, H);
    // Pixel shadows: the dark cells' silhouette, nudged down and right, shows only on the lit cells beside them.
    if (!SHAD) SHAD = document.createElement("canvas");
    if (SHAD.width !== W || SHAD.height !== H) { SHAD.width = W; SHAD.height = H; }
    const sg = SHAD.getContext("2d");
    sg.setTransform(1, 0, 0, 1, 0, 0); sg.globalCompositeOperation = "source-over"; sg.clearRect(0, 0, W, H); sg.imageSmoothingEnabled = false;
    const off = Math.max(2, Math.round(G * 0.4));
    sg.drawImage(F.kv, 0, 0, sw, sh, off, off, W, H);
    sg.globalCompositeOperation = "destination-out"; sg.drawImage(F.kv, 0, 0, sw, sh, 0, 0, W, H);
    sg.globalCompositeOperation = "source-in"; sg.fillStyle = `rgba(${TN.shade},1)`; sg.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.34 * (0.25 + 0.75 * TN.tex);
    ctx.drawImage(SHAD, ox, oy);
    ctx.globalAlpha = 1;
    if (S.paint) {
      const sgd = ctx.createLinearGradient(0, oy, 0, oy + 4 * G);
      sgd.addColorStop(0, "rgba(0,0,0,0.3)"); sgd.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = sgd; ctx.fillRect(ox, oy, W, 4 * G);
      const sgl = ctx.createLinearGradient(ox, 0, ox + 3 * G, 0);
      sgl.addColorStop(0, "rgba(0,0,0,0.22)"); sgl.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = sgl; ctx.fillRect(ox, oy, 3 * G, H);
    }
    ctx.restore();
  }

  let GRIDT = null, GRIDK = "";
  function paint(ctx, W, H, t, accent, look) {
    ctx.clearRect(0, 0, W, H);
    const u = Math.min(W, H) / 1080, G = Math.max(2, Math.round(8 * u)), B = 5;
    const tn = (look && look.tone) || TONE;
    const sw = Math.floor(W / G) - 2 * B, sh = Math.floor(H / G) - 2 * B, x0 = Math.floor((W - sw * G) / 2), y0 = Math.floor((H - sh * G) / 2), w = sw * G, h = sh * G;
    const key = G + tn.grid + tn.gridHi;
    if (!GRIDT || GRIDK !== key) {
      GRIDT = document.createElement("canvas"); GRIDT.width = GRIDT.height = G; GRIDK = key;
      const g = GRIDT.getContext("2d"), lw = Math.max(1, Math.round(G * 0.16));
      g.fillStyle = tn.grid; g.fillRect(0, G - lw, G, lw); g.fillRect(G - lw, 0, lw, G);
      g.fillStyle = tn.gridHi; g.fillRect(0, 0, G - lw, 1); g.fillRect(0, 0, 1, G - lw);
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
    ctx.translate(x0, y0);
    ctx.fillStyle = ctx.createPattern(GRIDT, "repeat"); ctx.fillRect(0, 0, w, h);
    // A faint refresh band crawls down the glass.
    const by = mod(t * 0.09, 1.3) * h * 1.3 - h * 0.2;
    const bg = ctx.createLinearGradient(0, by - h * 0.12, 0, by + h * 0.12);
    bg.addColorStop(0, "rgba(255,255,230,0)"); bg.addColorStop(0.5, "rgba(255,255,230,0.06)"); bg.addColorStop(1, "rgba(255,255,230,0)");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    // Edge falloff and a drifting glare.
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    vg.addColorStop(0, "rgba(10,24,14,0)"); vg.addColorStop(1, "rgba(10,24,14,0.3)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
    const gx = mod(t * 0.04, 1.6) * w * 1.6 - w * 0.4;
    const gg = ctx.createLinearGradient(gx - w * 0.1, 0, gx + w * 0.1, h);
    gg.addColorStop(0, "rgba(255,255,255,0)"); gg.addColorStop(0.5, "rgba(255,255,255,0.05)"); gg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gg; ctx.fillRect(0, 0, w, h);
    ctx.restore();
    // Dust on the glass (seeded) and a hard glint on the screen's top-left corner.
    const r = rng(77);
    ctx.fillStyle = "rgba(255,255,240,0.18)";
    for (let i = 0; i < 18; i++) { const dx = x0 + r() * w, dy = y0 + r() * h, s = 1 + r() * 2; ctx.fillRect(dx, dy, s * u, s * u); }
    ctx.fillStyle = tn.glass; ctx.fillRect(x0 + 6 * u, y0 + 4 * u, 46 * u, 2 * u); ctx.fillRect(x0 + 4 * u, y0 + 6 * u, 2 * u, 22 * u);
  }

  function stage(ctx, S, info) {
    TN = S.look.tone || TONE;
    TN.tex = S.look.texture ?? 1;
    TN.led = S.accent;
    COL = TN.c;
    BG = Boolean(S.paint);
    const L = layout(S), P = planOf();
    let cur, i = 0;
    if (P) {
      i = info.scene ? Math.max(0, info.index) : P.shown.length - 1;
      const sc = P.shown[Math.min(i, P.shown.length - 1)], local = info.scene ? info.local : sc.hold;
      cur = { id: sc.id, local, hold: sc.hold, t: info.t, data: P.data[sc.id] };
      if (!info.scene) cur.t = sc.start + sc.hold;
      cur.start = sc.start;
    } else {
      if (!info.scene) return;
      cur = { id: info.scene, local: info.local, hold: info.hold, t: info.t, data: DEFAULTS[info.scene] };
    }
    const F = pair("F", L.sw, L.sh);
    const T1 = pair("T1", L.sw, L.sh);
    renderInto(T1, L, cur);
    let hudI = i;
    if (P) P.flash = 0;
    if (P && i > 0 && cur.local < P.change) {
      const k = eio(cur.local / P.change), pv = P.shown[i - 1];
      const T0 = pair("T0", L.sw, L.sh);
      renderInto(T0, L, { id: pv.id, local: pv.hold + cur.local, hold: pv.hold, t: cur.t, data: P.data[pv.id] });
      applyMask(T1, L, (i - 1) % 4, k * 1.12);
      F.c.drawImage(T0.cv, 0, 0); F.k.drawImage(T0.kv, 0, 0);
      // The outgoing layout is cleared to blank cells as the wipe runs, so none of its labels linger.
      const lv = Math.round(clamp(k * 1.7) * 16);
      if (lv > 0) { const pt = F.c.createPattern(clearPat(lv), "repeat"); F.c.fillStyle = pt; F.c.fillRect(0, 0, L.sw, L.sh); F.k.save(); F.k.globalCompositeOperation = "destination-out"; F.k.fillStyle = F.k.createPattern(clearPat(lv), "repeat"); F.k.fillRect(0, 0, L.sw, L.sh); F.k.restore(); }
      F.c.drawImage(T1.cv, 0, 0); F.k.drawImage(T1.kv, 0, 0);
      if (k < 0.5) hudI = i - 1; else if (k < 0.8) P.flash = 1;
    } else { F.c.drawImage(T1.cv, 0, 0); F.k.drawImage(T1.kv, 0, 0); }
    if (BG) hud(F, L, info.t, P, hudI);
    blit(ctx, S, L, F, info.t, P);
  }

  const mk = (c) => ({ ...TONE, ...c });
  return {
    bg: "#cfdc9b", panel: "rgba(27,55,39,0.08)", ink: "#1b3727", muted: "#4d7448", accent: "#e8503a", onAccent: "#ffffff",
    rule: "#4d7448", track: "rgba(27,55,39,0.12)",
    display: "'Courier New', Menlo, monospace", displayWeight: 800, displayCase: "uppercase", displayTracking: "0.06em",
    body: "'Courier New', Menlo, monospace", bodyWeight: 700, figures: "'Courier New', Menlo, monospace", radius: 0,
    motion: "type", change: "fade", kit: { line: 4, fill: "solid", panel: "outline" },
    tone: TONE, keepArt: true, overlap: true,
    palettes: {
      // Daylight: pale stock and a lighter plastic body. Backlit: bright cells on a dark screen. Grey: a plain monochrome panel.
      light: { bg: "#e5edc7", ink: "#2a4a35", muted: "#5f8c58", rule: "#5f8c58", tone: mk({ c: ["#e5edc7", "#adc67f", "#628d5a", "#2a4a35"], bezel: "#c8c4d4", bezelHi: "#e8e5f0", bezelLo: "#a09bb2", grid: "rgba(42,74,53,0.18)", glass: "rgba(255,255,255,0.7)" }) },
      dark: { bg: "#0f2118", ink: "#b5eeb0", muted: "#4f9a62", rule: "#4f9a62", tone: mk({ c: ["#0f2118", "#1e4231", "#52a066", "#b9f2b2"], bezel: "#16171f", bezelHi: "#2a2c3a", bezelLo: "#0b0b10", grid: "rgba(0,0,0,0.38)", gridHi: "rgba(160,255,170,0.04)", glass: "rgba(200,255,210,0.25)", ghost: "lighten", shade: "0,0,0" }) },
      mono: { bg: "#e8e8e4", ink: "#1c1c1c", muted: "#626260", rule: "#626260", tone: mk({ c: ["#e8e8e4", "#aaaaa6", "#626260", "#1c1c1c"], bezel: "#46474c", bezelHi: "#62636a", bezelLo: "#2a2b2f", grid: "rgba(28,28,28,0.2)", shade: "28,28,28" }) },
    },
    css: () => "#root .display, #root .kicker { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; }",
    backdrop: (accent, texture, look) => (look && look.tone ? look.tone.c[0] : "#cfdc9b"),
    paintOver: true, paint, stage,
    scenes: { chart: () => {}, object: () => {}, people: () => {}, process: () => {}, compare: () => {} },
  };
});
