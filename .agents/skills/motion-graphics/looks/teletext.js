// Teletext: the whole frame is one page of a made-up information service ("Dreamtext"). A grid of
// character cells carries a hand-built 5x7 bitmap font (with double-height headlines), seven flat colours,
// and 2x3 block-mosaic graphics (separated "sixels"). A header row with a ticking clock and page number,
// a Fastext bar, a scrolling mosaic tape and a news ticker frame every page; a drifting mosaic plasma fills
// the background. Scenes are pages: a page change hunts for the next page number and loads row by row
// under a scan line while the old page lingers below it. Original TV-headed characters ("tuner folk"),
// icons and pages throughout. A CRT pass (scanlines, rolling bar, tracking glitches, vignette) sits on top.
// Frames are pure functions of time: seeded values only.
window.DreamcutMotion.register("teletext", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const mod = (a, n) => ((a % n) + n) % n;
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  // ---- colour --------------------------------------------------------------------------------------
  const hex = (c) => { const n = parseInt(String(c).slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgb = (c, a = 1) => { const [r, g, b] = hex(c); return `rgba(${r},${g},${b},${a})`; };
  const mix = (a, b, k) => { const x = hex(a), y = hex(b); return `rgb(${(x[0] + (y[0] - x[0]) * k) | 0},${(x[1] + (y[1] - x[1]) * k) | 0},${(x[2] + (y[2] - x[2]) * k) | 0})`; };
  const lumOf = (c) => { const [r, g, b] = hex(c); return r * 0.3 + g * 0.59 + b * 0.11; };

  // ---- the bitmap font: 5x7 dots, capitals only (as on a real page) -----------------------------
  const RAW = {
    A: "01110/10001/10001/11111/10001/10001/10001", B: "11110/10001/10001/11110/10001/10001/11110",
    C: "01110/10001/10000/10000/10000/10001/01110", D: "11100/10010/10001/10001/10001/10010/11100",
    E: "11111/10000/10000/11110/10000/10000/11111", F: "11111/10000/10000/11110/10000/10000/10000",
    G: "01110/10001/10000/10111/10001/10001/01111", H: "10001/10001/10001/11111/10001/10001/10001",
    I: "01110/00100/00100/00100/00100/00100/01110", J: "00111/00010/00010/00010/00010/10010/01100",
    K: "10001/10010/10100/11000/10100/10010/10001", L: "10000/10000/10000/10000/10000/10000/11111",
    M: "10001/11011/10101/10101/10001/10001/10001", N: "10001/11001/10101/10011/10001/10001/10001",
    O: "01110/10001/10001/10001/10001/10001/01110", P: "11110/10001/10001/11110/10000/10000/10000",
    Q: "01110/10001/10001/10001/10101/10010/01101", R: "11110/10001/10001/11110/10100/10010/10001",
    S: "01111/10000/10000/01110/00001/00001/11110", T: "11111/00100/00100/00100/00100/00100/00100",
    U: "10001/10001/10001/10001/10001/10001/01110", V: "10001/10001/10001/10001/10001/01010/00100",
    W: "10001/10001/10001/10101/10101/11011/10001", X: "10001/10001/01010/00100/01010/10001/10001",
    Y: "10001/10001/01010/00100/00100/00100/00100", Z: "11111/00001/00010/00100/01000/10000/11111",
    0: "01110/10001/10011/10101/11001/10001/01110", 1: "00100/01100/00100/00100/00100/00100/01110",
    2: "01110/10001/00001/00010/00100/01000/11111", 3: "11110/00001/00001/01110/00001/00001/11110",
    4: "00010/00110/01010/10010/11111/00010/00010", 5: "11111/10000/11110/00001/00001/10001/01110",
    6: "00110/01000/10000/11110/10001/10001/01110", 7: "11111/00001/00010/00100/01000/01000/01000",
    8: "01110/10001/10001/01110/10001/10001/01110", 9: "01110/10001/10001/01111/00001/00010/01100",
    ".": "00000/00000/00000/00000/00000/01100/01100", ",": "00000/00000/00000/00000/01100/00100/01000",
    ":": "00000/01100/01100/00000/01100/01100/00000", "!": "00100/00100/00100/00100/00100/00000/00100",
    "?": "01110/10001/00001/00010/00100/00000/00100", "-": "00000/00000/00000/11111/00000/00000/00000",
    "+": "00000/00100/00100/11111/00100/00100/00000", "/": "00001/00001/00010/00100/01000/10000/10000",
    "%": "11001/11001/00010/00100/01000/10011/10011", "#": "01010/01010/11111/01010/11111/01010/01010",
    "'": "00100/00100/01000/00000/00000/00000/00000", ">": "10000/01000/00100/00010/00100/01000/10000",
    "<": "00001/00010/00100/01000/00100/00010/00001", "(": "00010/00100/01000/01000/01000/00100/00010",
    ")": "01000/00100/00010/00010/00010/00100/01000", "=": "00000/00000/11111/00000/11111/00000/00000",
    "*": "00000/10101/01110/11111/01110/10101/00000", "&": "01100/10010/10100/01000/10101/10010/01101",
    "\"": "01010/01010/01010/00000/00000/00000/00000",
  };
  const FONT = {};
  for (const k of Object.keys(RAW)) FONT[k] = RAW[k].split("/").map((r) => parseInt(r, 2));
  const ALIAS = { "·": ".", "•": ".", "’": "'", "‘": "'", "–": "-", "—": "-", "×": "X", "→": ">", "←": "<", "$": "S", "“": "\"", "”": "\"", "_": "-", "…": "." };
  const glyphOf = (ch) => FONT[ch] || FONT[ALIAS[ch]] || (ch === " " ? null : FONT["?"]);
  const textW = (s, d) => (String(s).length ? String(s).length * 6 * d - d : 0);

  // Round-edged rectangles so neighbouring blocks never show seams.
  const rc = (g, x, y, w, h) => {
    const a = Math.round(x), b = Math.round(y), c = Math.round(x + w), e = Math.round(y + h);
    if (c > a && e > b) g.rect(a, b, c - a, e - b);
  };
  const R = (g, x, y, w, h, col) => { g.fillStyle = col; g.beginPath(); rc(g, x, y, w, h); g.fill(); };
  function glyphs(g, s, n, x0, y, d, vs, col, cull) {
    g.fillStyle = col; g.beginPath();
    for (let i = 0; i < n; i++) {
      const px = x0 + i * 6 * d;
      if (cull && (px + 6 * d < cull[0] || px > cull[1])) continue;
      const rows = glyphOf(s[i]);
      if (!rows) continue;
      for (let r = 0; r < 7; r++) {
        const bits = rows[r];
        if (!bits) continue;
        const y0 = y + r * d * vs, y1 = y + (r + 1) * d * vs;
        let c = 0;
        while (c < 5) {
          if ((bits >> (4 - c)) & 1) {
            let e = c + 1;
            while (e < 5 && (bits >> (4 - e)) & 1) e++;
            rc(g, px + c * d, y0, (e - c) * d, y1 - y0);
            c = e;
          } else c++;
        }
      }
    }
    g.fill();
  }
  // Text on dots of size d (7d tall at vs 1). q reveals characters; o.back paints a band behind the text.
  function txt(g, s, x, y, d, col, o = {}) {
    s = String(s ?? "").toUpperCase();
    const vs = o.vs || 1, w = textW(s, d);
    let n = s.length;
    if (o.q !== undefined) n = Math.min(n, Math.floor(s.length * o.q + 1e-6));
    const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    if (o.back && n > 0) { const bw = textW(s.slice(0, n), d); R(g, x0 - d * 1.6, y - d * 1.2 * vs, bw + d * 3.2, 7 * d * vs + d * 2.4 * vs, o.back); }
    if (n <= 0) return w;
    if (o.shadow) glyphs(g, s, n, x0 + d * 0.7, y + d * 0.7 * vs, d, vs, o.shadow, o.cull);
    glyphs(g, s, n, x0, y, d, vs, col, o.cull);
    return w;
  }
  function wrapLines(s, d, maxW) {
    const per = Math.max(1, Math.floor((maxW + d) / (6 * d)));
    const words = String(s).toUpperCase().split(/\s+/).filter(Boolean), lines = [];
    let cur = "";
    for (const w of words) {
      if (!cur) cur = w;
      else if ((cur + " " + w).length <= per) cur += " " + w;
      else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  }
  // The biggest dot size (not below dmin) at which the text fits in maxLines lines of maxW.
  function fitText(s, d0, dmin, maxW, maxLines) {
    for (let d = d0; d >= dmin - 1e-6; d -= 0.2) {
      const lines = wrapLines(s, d, maxW);
      if (lines.length <= maxLines && lines.every((l) => textW(l, d) <= maxW + 1)) return { d, lines };
    }
    return { d: dmin, lines: wrapLines(s, dmin, maxW) };
  }
  const fmt = (v, d, k = 1) => window.DreamcutMotion.formatNumber(v * k, Math.abs((Number(v) || 0) % 1) > 0.001 ? 1 : 0, (d && d.prefix) || "", (d && d.suffix) || "");

  // ---- mosaic helpers ----------------------------------------------------------------------------
  // Six-bit masks of a 2x3 block: 1 TL, 2 TR, 4 ML, 8 MR, 16 BL, 32 BR.
  const CHK_A = 25, CHK_B = 38, FULL = 63, TOP = 7 + 0 * 8 + 8 - 8 + 0, STRIPE = 51;
  function mos(g, F, x, y, mask, col, gap = 0) {
    g.fillStyle = col; g.beginPath();
    for (let b = 0; b < 6; b++) if ((mask >> b) & 1) rc(g, x + (b & 1) * F.sx + gap, y + (b >> 1) * F.sy + gap, F.sx - gap * 2, F.sy - gap * 2);
    g.fill();
  }
  const batch = () => {
    const m = new Map();
    return {
      add(col, x, y, w, h) { let a = m.get(col); if (!a) m.set(col, (a = [])); a.push(x, y, w, h); },
      flush(g) { for (const [col, a] of m) { g.fillStyle = col; g.beginPath(); for (let i = 0; i < a.length; i += 4) rc(g, a[i], a[i + 1], a[i + 2], a[i + 3]); g.fill(); } },
    };
  };

  // ---- the page grid -----------------------------------------------------------------------------
  function mk(g, S, info) {
    const { W, H, u } = S;
    const rows = S.tall ? 34 : 25, ch = H / rows, sy = ch / 3, sx = sy * 1.15, cw = sx * 2;
    const cols = Math.floor(W / cw), x0 = (W - cols * cw) / 2;
    const T = S.look.tele;
    return {
      g, S, W, H, u, tall: S.tall, rows, ch, sy, sx, cw, cols, x0, T, info, t: info.t, accent: S.accent,
      solid: Boolean(S.paint), tex: S.look.texture ?? 1, d: cw / 6.3, gap: Math.max(1, 1.1 * u),
      fgOn: (c) => (lumOf(c) > 135 ? T.dark : T.light),
    };
  }
  const THEME = { title: "blue", chart: "green", object: "cyan", people: "magenta", process: "yellow", compare: "red", closing: "blue" };
  const PAGE = { title: 101, chart: 102, object: 103, people: 104, process: 105, compare: 106, closing: 199 };
  const FAST = {
    title: ["BACK", "INDEX", "START", "NEXT"], chart: ["BACK", "INDEX", "CHART", "NEXT"], object: ["BACK", "INDEX", "PARTS", "NEXT"],
    people: ["BACK", "INDEX", "CREW", "NEXT"], process: ["BACK", "INDEX", "STEPS", "NEXT"], compare: ["BACK", "INDEX", "VERSUS", "NEXT"], closing: ["BACK", "INDEX", "END", "HOME"],
  };
  let frameNext = null; // the next scene id, set by the stage each frame before the scenes draw
  const loadLine = (F, k) => F.ch * 2 + (F.H - F.ch * 3) * eio(k);

  // ---- background: a drifting plasma of mosaic dither ---------------------------------------------
  function plasma(F, theme) {
    const { g, T, cols, rows, cw, ch, x0, t } = F;
    const A = T[theme] || T.blue, B = T.blue;
    const k = 0.35 + 0.65 * F.tex;
    const bA = batch(), bB = batch(), bC = batch();
    const aCol = rgb(A, 0.3 * k), aCol2 = rgb(A, 0.16 * k), bCol = rgb(B, 0.42 * k);
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 0; c < cols; c++) {
        const v = Math.sin(c * 0.31 + t * 0.9) + Math.sin(r * 0.43 - t * 0.7) + Math.sin((c + r) * 0.2 + t * 0.5) + Math.sin(Math.hypot(c - cols * 0.5, r - rows * 0.6) * 0.35 - t * 1.1);
        const x = x0 + c * cw, y = r * ch;
        let mask = 0, col = null;
        if (v > 1.9) { mask = (c + r) & 1 ? CHK_B : CHK_A; col = bA; }
        else if (v > 0.8) { mask = (c + r) & 1 ? 33 : 12; col = bC; }
        else if (v < -1.9) { mask = (c + r) & 1 ? CHK_A : CHK_B; col = bB; }
        if (!mask) continue;
        for (let b = 0; b < 6; b++) if ((mask >> b) & 1) col.add(col === bA ? aCol : col === bC ? aCol2 : bCol, x + (b & 1) * F.sx, y + (b >> 1) * F.sy, F.sx, F.sy);
      }
    }
    bA.flush(g); bB.flush(g); bC.flush(g);
  }

  // Marching lights round a rectangle: every third dot lit, sliding with time.
  function chase(F, x, y, w, h, c1, c2, speed = 6, step) {
    const { g, t, sx, sy } = F, s = step || F.cw;
    const pts = [];
    const nx = Math.max(2, Math.round(w / s)), ny = Math.max(2, Math.round(h / s));
    for (let i = 0; i < nx; i++) pts.push([x + (w * i) / nx, y]);
    for (let i = 0; i < ny; i++) pts.push([x + w, y + (h * i) / ny]);
    for (let i = 0; i < nx; i++) pts.push([x + w - (w * i) / nx, y + h]);
    for (let i = 0; i < ny; i++) pts.push([x, y + h - (h * i) / ny]);
    const off = Math.floor(t * speed), bA = batch();
    pts.forEach(([px, py], i) => {
      const k = mod(i - off, 3);
      bA.add(k === 0 ? c1 : k === 1 ? c2 : rgb(c2, 0.28), px - sx * 0.5, py - sy * 0.5, sx, sy);
    });
    bA.flush(g);
  }
  // A page board: a dark panel with a chasing frame, behind a scene's drawing.
  function board(F, box, c1, c2) {
    if (!F.solid) return;
    const { g, T, cw } = F;
    R(g, box.x - cw * 0.2, box.y - cw * 0.2, box.w + cw * 0.4, box.h + cw * 0.4, rgb(T.bg, 0.86));
    chase(F, box.x - cw * 0.2, box.y - cw * 0.2, box.w + cw * 0.4, box.h + cw * 0.4, c1 || T.cyan, c2 || T.white, 7, F.cw * 1.2);
  }

  // ---- chrome: header, tapes, border, ticker, Fastext -------------------------------------------
  const MARQUEE = "DREAMTEXT  *  EVERY CARD IS YOURS TO APPROVE  *  TUNE ANY DIAL  *  UNDO ANYTIME  *  PAGE 100 FOR THE INDEX  *  ";
  function tape(F, row, dir, cols4) {
    const { g, cw, ch, x0, cols, t } = F;
    const step = Math.floor(t * 9 * dir);
    const b = batch();
    for (let c = 0; c < cols; c++) {
      const idx = mod(Math.floor((c + step) / 2), cols4.length);
      const mask = mod(c + step, 2) ? CHK_B : CHK_A;
      const full = mod(c + Math.floor(step / 3), 7) === 0;
      const col = cols4[idx];
      const m = full ? FULL : mask;
      const x = x0 + c * cw, y = row * ch;
      for (let k = 0; k < 6; k++) if ((m >> k) & 1) b.add(col, x + (k & 1) * F.sx, y + (k >> 1) * F.sy, F.sx, F.sy);
    }
    b.flush(g);
  }
  function chrome(F, theme, local, sweeping) {
    const { g, T, cw, ch, x0, cols, rows, t, d, W } = F;
    const info = F.info, id = info.scene;
    const pg = id ? PAGE[id] || 100 : 100;
    const top = (ch - 7 * d) / 2;
    if (F.solid) R(g, 0, 0, W, ch, T.bar);
    const hunting = sweeping;
    const rolled = hunting ? "1" + String(Math.floor(t * 31) % 100).padStart(2, "0") : String(pg);
    txt(g, "P" + pg, x0 + cw * 0.5, top, d, hunting ? T.yellow : T.white);
    const name = "DREAMTEXT";
    const secs = (37 + Math.floor(t)) % 60;
    const clock = "19:42/" + String(secs).padStart(2, "0");
    if (F.tall) {
      txt(g, name, x0 + cw * 5, top, d, T.yellow);
      txt(g, clock, x0 + cols * cw - cw * 0.5, top, d, T.cyan, { align: "right" });
    } else {
      txt(g, name + " " + rolled, x0 + cw * 6, top, d, hunting ? T.white : T.yellow);
      txt(g, "FRI 23 OCT", x0 + cw * Math.floor(cols * 0.47), top, d, T.green);
      txt(g, clock, x0 + cols * cw - cw * 0.5, top, d, T.cyan, { align: "right" });
    }
    // The mosaic tape under the header.
    tape(F, 1, 1, [T[theme] || T.blue, T.white, T.magenta, T.cyan, T.yellow, T.blue]);
    if (F.tall) tape(F, rows - 4, -1, [T.cyan, T.blue, T.magenta, T[theme] || T.blue, T.white]);
    // The ticker.
    const ty = (rows - 2) * ch;
    if (F.solid) R(g, 0, ty, W, ch, rgb(T.blue, 0.55));
    const per = textW(MARQUEE, d) + 6 * d;
    const off = mod(t * 110, per);
    const cols3 = [T.yellow, T.white, T.cyan];
    for (let k = -1; k < 2; k++) txt(g, MARQUEE, -off + k * per, ty + (ch - 7 * d) / 2, d, cols3[mod(k, 3)], { cull: [-20, W + 20] });
    // The Fastext bar.
    const fy = (rows - 1) * ch, names = FAST[id] || FAST.title, cc = [T.red, T.green, T.yellow, T.cyan];
    const bw = (cols * cw) / 4;
    cc.forEach((col, i) => {
      const lit = i === 3 && (info.next && info.hold && local > info.hold - info.change * 3) ? (Math.floor(t * 5) % 2 === 0) : true;
      R(g, x0 + i * bw + F.gap, fy, bw - F.gap * 2, ch, lit ? col : mix(col, T.bg, 0.55));
      txt(g, names[i], x0 + i * bw + bw / 2, fy + (ch - 7 * d) / 2, d, T.dark, { align: "center" });
    });
  }
  function border(F, theme) {
    const { g, T, cw, ch, x0, cols, rows, t } = F;
    const bc = F.tall ? 1 : 3;
    const pal = [T[theme] || T.blue, T.blue, T.white, T.magenta];
    const b = batch();
    for (let r = 2; r < rows - 3; r++) {
      for (let k = 0; k < bc; k++) {
        for (const side of [0, 1]) {
          const c = side ? cols - 1 - k : k;
          const dir = side ? -1 : 1;
          const ph = mod(r * 2 + k * 3 + Math.floor(t * 5 * dir), 8);
          const col = pal[ph < 3 ? 0 : ph < 5 ? 1 : ph < 6 ? 2 : 3];
          const mask = ph === 5 ? FULL : mod(r + k, 2) ? CHK_B : CHK_A;
          const x = x0 + c * cw, y = r * ch;
          for (let m = 0; m < 6; m++) if ((mask >> m) & 1) b.add(col, x + (m & 1) * F.sx, y + (m >> 1) * F.sy, F.sx, F.sy);
        }
      }
    }
    b.flush(g);
  }
  // The scan bar of a page change: a bright row of static with a ragged trail of garbage rows.
  function scanBar(F, y, k) {
    const { g, T, cols, cw, x0, ch, t } = F;
    const r = rng(Math.floor(t * 30) + 11), b = batch();
    const cs = [T.white, T.cyan, T.yellow, T.magenta, T.green];
    for (let c = 0; c < cols; c++) {
      b.add(rng(c * 7 + Math.floor(t * 40))() > 0.45 ? T.white : T.cyan, x0 + c * cw, y - F.sy, cw, F.sy * 2);
    }
    for (let row = 1; row <= 3; row++) {
      for (let c = 0; c < cols; c++) {
        if (r() > 0.38 + row * 0.15) continue;
        const mask = Math.floor(r() * 62) + 1, col = cs[Math.floor(r() * cs.length)];
        for (let m = 0; m < 6; m++) if ((mask >> m) & 1) b.add(rgb(col, 0.8 - row * 0.18), x0 + c * cw + (m & 1) * F.sx, y + F.sy + (row - 1) * F.sy * 1.4 + (m >> 1) * F.sy * 0.46, F.sx, F.sy * 0.44);
      }
    }
    b.flush(g);
  }

  // ---- the headline: double-height letters on a colour band, typed in and deleted out ------------
  const headCache = {};
  function headSpec(F, id) {
    const key = `${id}:${F.W}x${F.H}`;
    if (headCache[key]) return headCache[key];
    const get = (n) => { const el = document.getElementById(n); return el ? el.textContent || "" : ""; };
    const side = (F.tall ? 90 : 140) * F.u, maxW = F.W - side * 2;
    const statement = id === "title" || id === "closing";
    let spec;
    if (statement) {
      const text = id === "title" ? get("title") : get("closing");
      const fit = fitText(text, (F.tall ? 120 : 132) * F.u / 10.5, 6.4 * F.u, maxW - 6 * F.u * 2, F.tall ? 3 : 2);
      spec = { statement: true, lines: fit.lines, d: fit.d, vs: 1.5, kicker: id === "title" ? get("kicker").toUpperCase() : "", maxW, side };
    } else {
      const text = get(`${id}-title`);
      const fit = fitText(text, 8 * F.u, 6.4 * F.u, maxW - 6 * 6.4 * F.u * 0.5, F.tall ? 3 : 2);
      spec = { statement: false, lines: fit.lines, d: fit.d, vs: 1.5, kicker: "", maxW, side };
    }
    return (headCache[key] = spec);
  }
  function headline(F) {
    const { g, T, info, u } = F, id = info.scene;
    if (!id || !info.hold) return;
    const sp = headSpec(F, id);
    const d = sp.d, vs = sp.vs, bandH = 7 * d * vs + 3 * d, gapY = d * 0.7;
    const kd = 5.7 * u, kicker = sp.kicker;
    const kH = kicker ? 7 * kd + 24 * u : 0;
    const blockH = kH + sp.lines.length * bandH + (sp.lines.length - 1) * gapY;
    const y0 = sp.statement ? (F.H - blockH) / 2 : (F.tall ? 170 : 96) * u;
    const [bandName, fg] = [THEME[id], null];
    const band = T[bandName] || T.blue;
    const ink = F.fgOn(band);
    const local = info.local, hold = info.hold, change = info.change;
    const totalChars = kicker.length + sp.lines.reduce((s, l) => s + l.length, 0);
    const typed = Math.floor(Math.max(0, local - 0.02) * 110);
    const outk = info.next ? span(local, hold - change, hold) : 0;
    const shown = Math.min(typed, Math.ceil(totalChars * (1 - outk)));
    let used = 0, lastEnd = null;
    const place = (s, x, y, dd, v, col, bandCol, centered) => {
      const n = clamp(shown - used, 0, s.length);
      used += s.length;
      if (n <= 0) return;
      const w = textW(s, dd);
      const left = centered ? F.W / 2 - w / 2 : sp.side;
      const bw = textW(s.slice(0, n), dd);
      if (bandCol) R(g, left - dd * 2, y - dd * 1.2 * v, bw + dd * 4, 7 * dd * v + dd * 2.4 * v, bandCol);
      glyphs(g, s, n, left, y, dd, v, col);
      lastEnd = { x: left + bw + dd * 0.8, y, d: dd, vs: v, done: n >= s.length, col };
    };
    let y = y0;
    if (kicker) { place(kicker, 0, y, kd, 1, F.accent, null, sp.statement); y += kH; }
    sp.lines.forEach((line) => { place(line, 0, y + d * 1.2 * vs * 0.5, d, vs, ink, band, sp.statement); y += bandH + gapY; });
    // The cursor: a block that keeps blinking at the end of the text.
    if (lastEnd && shown > 0 && (!lastEnd.done || shown >= totalChars) && Math.floor(F.t * 2.4) % 2 === 0 && outk < 0.95) {
      R(g, lastEnd.x, lastEnd.y, 4.4 * lastEnd.d, 7 * lastEnd.d * lastEnd.vs, lastEnd.col === F.accent ? F.accent : ink);
    }
  }
  function headBlock(F, id) {
    const sp = headSpec(F, id), d = sp.d;
    const bandH = 7 * d * sp.vs + 3 * d, gapY = d * 0.7, kH = sp.kicker ? 7 * 5.7 * F.u + 24 * F.u : 0;
    const h = kH + sp.lines.length * bandH + (sp.lines.length - 1) * gapY;
    return { top: (F.H - h) / 2, bottom: (F.H + h) / 2, h };
  }

  // ---- the page furniture under each headline ------------------------------------------------------
  // A strap line in double-height type, a row of page-index keys (the next page's key flashes as the page
  // ends), and a page tile with a live signal meter in the top-right corner beside the headline.
  const STRAP = {
    chart: (d) => { const v = (d.values || []).map(Number), hi = d.highlight >= 0 && d.highlight < v.length ? d.highlight : v.indexOf(Math.max(...v)); return `TOP: ${String((d.labels || [])[hi] || "").toUpperCase()}`; },
    object: (d) => `${(d.callouts || []).filter(Boolean).length} PARTS TO KNOW`,
    people: (d) => `${Math.max(2, Math.min(6, Math.round(d.count || 3)))} ON THE CREW`,
    process: (d) => `${(d.steps || []).filter(Boolean).length} STEPS IN ORDER`,
    compare: (d) => `${String(d.left || "").toUpperCase()} > ${String(d.right || "").toUpperCase()}`,
  };
  const INDEX = [101, 102, 103, 104, 105, 106, 199];
  function furniture(F, box, id, d, info, rv) {
    const { g, T, u, cw, sx, sy, t } = F, acc = F.accent;
    const sp = headSpec(F, id), hd = sp.d, vsH = sp.vs;
    const bandH = 7 * hd * vsH + 3 * hd, gapY = hd * 0.7, y0 = (F.tall ? 170 : 96) * u;
    const lineTop = (k) => y0 + k * (bandH + gapY) + hd * 0.6 * vsH - hd * 1.2 * vsH;
    const headBottom = lineTop(sp.lines.length - 1) + 7 * hd * vsH + 2.4 * hd * vsH;
    const theme = T[THEME[id]] || T.cyan, pg = PAGE[id];
    const exiting = info.exit !== undefined;
    // the page tile, top right, level with the first headline band
    const tileH = 7 * hd * vsH + 2.4 * hd * vsH, nd = (tileH - 2.4 * hd) / (7 * 1.5);
    const tileW = textW(String(pg), nd) + nd * 3 + sx * 7;
    const tileX = F.W - sp.side - tileW, headRight = sp.side + textW(sp.lines[0], hd) + hd * 6;
    if (tileX > headRight + cw) {
      const ty = lineTop(0), tq = eo(span(rv, 0, 0.3));
      R(g, tileX, ty, tileW, tileH * tq, "#000000");
      chase(F, tileX, ty, tileW, tileH * tq, theme, T.white, 6, cw * 0.8);
      if (tq >= 1) {
        txt(g, String(pg), tileX + nd * 1.5, ty + (tileH - 7 * nd * 1.5) / 2, nd, acc, { vs: 1.5 });
        // a signal meter: four rising columns, their level breathing with time
        const mx = tileX + tileW - sx * 6, lvl = 1 + Math.floor(mod(t * 2.2, 4)) + (Math.sin(t * 7) > 0.6 ? 0 : 0), mb = batch();
        for (let c = 0; c < 4; c++) {
          const hgt = Math.round(((c + 1) / 4) * (tileH - sy * 2.4) / sy);
          for (let r = 0; r < hgt; r++) mb.add(c < lvl ? (c === 3 ? T.green : c === 2 ? T.yellow : T.white) : rgb(T.blue, 0.7), mx + c * sx * 1.25, ty + tileH - sy * 1.2 - (r + 1) * sy, sx - F.gap, sy - F.gap);
        }
        mb.flush(g);
      }
    }
    // the strap row: between the headline and the page board
    const top = headBottom + sy * 1.2, bottom = box.y - cw * 0.2 - sy * 1.6, room = bottom - top;
    const sd = 6.4 * u;
    const vs = room >= 7 * sd * 2 + sd ? 2 : room >= 7 * sd + sd * 0.5 ? 1 : 0;
    if (!vs) return;
    const rowH = 7 * sd * vs, ry = top + (room - rowH) / 2;
    const left = sp.side, right = F.W - sp.side;
    // page-index keys on the right
    const kd = 6 * u, kw = textW("199", kd) + kd * 3, kg = kd * 1.4, keysW = INDEX.length * (kw + kg) - kg;
    const strapMax = right - left - (F.tall ? 0 : keysW + cw * 2) - sx * 4;
    const text = (STRAP[id] ? STRAP[id](d) : "").trim();
    const fit = fitText(text, sd, 6 * u, strapMax - sd * 6, 1);
    const line = fit.lines[0] || "", q = span(rv, 0.05, 0.45);
    // marker: a mosaic arrow, then the strap typed in, then a block cursor that keeps blinking
    const ab = batch();
    for (let r = 0; r < 3; r++) for (let c = 0; c <= r; c++) { ab.add(theme, left + c * sx, ry + rowH / 2 - (3 - r) * sy, sx - F.gap, sy - F.gap); ab.add(theme, left + c * sx, ry + rowH / 2 + (2 - r) * sy, sx - F.gap, sy - F.gap); }
    ab.flush(g);
    const tx = left + sx * 4.5, tyy = ry + (rowH - 7 * fit.d * vs) / 2;
    txt(g, line, tx, tyy, fit.d, theme, { q, vs });
    const shown = Math.floor(line.length * q + 1e-6);
    if (Math.floor(t * 2.4) % 2 === 0 || shown < line.length) R(g, tx + textW(line.slice(0, shown), fit.d) + fit.d * (shown ? 1.2 : 0), tyy, fit.d * 4.4, 7 * fit.d * vs, T.white);
    if (F.tall) return;
    const kx0 = right - keysW, ky = ry + (rowH - (7 * kd + kd * 2.4)) / 2, kh = 7 * kd + kd * 2.4;
    const nextPg = frameNext ? PAGE[frameNext] : null;
    const late = !exiting && nextPg && info.local > info.hold - 1.4;
    INDEX.forEach((n, i) => {
      const x = kx0 + i * (kw + kg), cur = n === pg, nxt = late && n === nextPg;
      const flash = nxt && Math.floor(t * 6) % 2 === 0;
      const bg = cur ? theme : flash ? acc : nxt ? rgb(acc, 0.35) : rgb(T.blue, 0.55);
      R(g, x, ky, kw, kh, bg);
      txt(g, String(n), x + kw / 2, ky + kd * 1.2, kd, cur || flash ? F.fgOn(bg.startsWith("#") ? bg : T.blue) : T.white, { align: "center" });
    });
    // a pointer under the keys: rests under this page, then runs to the next page's key as the page ends
    const ci = Math.max(0, INDEX.indexOf(pg)), ni = nextPg ? INDEX.indexOf(nextPg) : -1;
    const run = late && ni >= 0 ? eio(span(info.local, info.hold - 1.4, info.hold - 0.7)) : 0;
    const pi = lerp(ci, ni >= 0 ? ni : ci, run), px = kx0 + pi * (kw + kg) + kw / 2;
    const pb = batch();
    for (let r = 0; r < 2; r++) for (let c = -r; c <= r; c++) pb.add(late ? acc : T.white, px + c * sx - sx / 2, ky + kh + sy * 0.4 + r * sy, sx - F.gap, sy - F.gap);
    pb.flush(g);
  }

  // ---- the tuner folk: original TV-headed characters ------------------------------------------
  // Drawn in units of pu: about 14 wide and 29 tall, feet on `base`.
  function tuner(F, cx, base, pu, o = {}) {
    const { g, T, t } = F, i = o.i || 0;
    const casing = o.casing || T.cyan, glow = o.glow || T.green, body = o.body || T.blue, mood = o.mood || "happy";
    const bob = Math.round(Math.sin(t * 3.1 + i * 1.7) * 1.2) * 0.5;
    const by = base + bob * pu * (o.still ? 0 : 1);
    const P = (x, y, w, h, col) => R(g, cx + x * pu, by + y * pu, w * pu, h * pu, col);
    const dark = mix(casing, "#000000", 0.45);
    const step = o.walk ? Math.floor(t * 4 + i) % 2 : 0;
    // legs and shoes
    P(-3, -4, 2, 4 - (step ? 1 : 0), mix(body, "#000000", 0.4)); P(1, -4, 2, 4 - (step ? 0 : 1), mix(body, "#000000", 0.4));
    P(-4, -1 - (step ? 1 : 0), 3, 1, T.white); P(1, -1 - (step ? 0 : 1), 3, 1, T.white);
    // torso, belt, dial
    P(-4, -11, 8, 7, body); P(-4, -6, 8, 1, mix(body, "#000000", 0.35)); P(-1, -10, 2, 2, T.yellow); P(1.2, -9.4, 1.2, 1.2, T.red);
    // arms
    if (o.wave) {
      const hand = Math.round(Math.sin(t * 9 + i)) * 0.5;
      P(-6, -10, 2, 5, body); P(4, -14, 2, 6, body); P(4 + hand, -16, 2, 2, T.white);
    } else if (o.cheer) {
      const up = Math.round(Math.sin(t * 7 + i) * 0.5 + 0.5);
      P(-6, -14 - up, 2, 6, body); P(4, -14 - (1 - up), 2, 6, body); P(-6, -16 - up, 2, 2, T.white); P(4, -16 - (1 - up), 2, 2, T.white);
    } else {
      P(-6, -10, 2, 5, body); P(4, -10, 2, 5, body); P(-6, -5, 2, 1.4, T.white); P(4, -5, 2, 1.4, T.white);
    }
    // head: a little television
    P(-6, -21, 12, 10, casing); P(-6, -21, 12, 1, mix(casing, "#ffffff", 0.35)); P(-6, -12, 12, 1, dark);
    P(5, -19, 0.8, 6, dark);
    P(-5, -20, 10, 8, "#06060c");
    // screen glow, a scan line running down it, and a flicker of snow
    P(-5, -20, 10, 8, rgb(glow, 0.1));
    const sl = mod(Math.floor(t * 6 + i * 3), 9);
    if (sl < 8) P(-5, -20 + sl, 10, 0.7, rgb(glow, 0.3));
    const rr = rng(Math.floor(t * 12) + i * 91);
    for (let k = 0; k < 3; k++) P(-5 + Math.floor(rr() * 10), -20 + Math.floor(rr() * 8), 1, 1, rgb(T.white, 0.35));
    const blink = mod(t + i * 0.77, 3.4) < 0.13;
    const look = Math.round(Math.sin(t * 0.9 + i * 2)) * 0.5;
    if (blink) { P(-3 + look, -17.4, 2, 0.7, glow); P(1 + look, -17.4, 2, 0.7, glow); }
    else { P(-3 + look, -18, 2, 2, glow); P(1 + look, -18, 2, 2, glow); }
    if (mood === "happy") { P(-2.5, -15, 1, 1, glow); P(1.5, -15, 1, 1, glow); P(-1.5, -14, 3, 1, glow); }
    else if (mood === "sad") { P(-1.5, -15, 3, 1, glow); P(-2.5, -14, 1, 1, glow); P(1.5, -14, 1, 1, glow); const tr = mod(t * 1.6 + i, 1); P(2.5, -17 + tr * 4, 1, 1, rgb(T.cyan, 1 - tr)); }
    else { P(-1, -15.5, 2, 2, glow); }
    // antenna
    const tw = Math.round(Math.sin(t * 5 + i * 2)) * 0.5;
    const kind = (o.antenna ?? i) % 4;
    P(-1, -22, 2, 1, dark);
    if (kind === 0) {
      for (let k = 0; k < 4; k++) { P(-2 - k, -23 - k, 1, 1, T.white); P(1 + k, -23 - k, 1, 1, T.white); }
      P(-6.5 + tw, -27.5, 2, 2, T.yellow); P(4.5 - tw, -27.5, 2, 2, T.yellow);
    } else if (kind === 1) {
      P(-0.5, -28, 1, 6, T.white); P(-1.5, -30, 3, 2, Math.floor(t * 3 + i) % 2 ? T.red : T.yellow);
    } else if (kind === 2) {
      P(-0.5, -25, 1, 3, T.white);
      const open = Math.floor(t * 2 + i) % 2;
      P(-3.5, -28, 7, 1, T.white); P(-2.5, -27, 5, 1, T.white); P(-1.5, -26, 3, 1, T.white); P(-0.5 + (open ? 1 : -1), -29.5, 1, 1.4, T.yellow);
    } else {
      P(-0.5, -25, 1, 3, T.white); P(-3.5, -29, 7, 1, T.white); P(-3.5, -25, 7, 1, T.white); P(-3.5, -28, 1, 3, T.white); P(2.5, -28, 1, 3, T.white);
      P(-0.5, -27.5, 1, 1, Math.floor(t * 4 + i) % 2 ? T.yellow : T.red);
    }
    return { tipX: cx, tipY: by - 28 * pu, headY: by - 21 * pu, w: 14 * pu };
  }
  // Signal rings: expanding rings of mosaic dots rising from an antenna.
  function rings(F, x, y, col, seed, maxR) {
    const { g, t, sx, sy } = F, b = batch();
    for (let k = 0; k < 3; k++) {
      const ph = mod(t * 0.55 + seed * 0.3 + k / 3, 1), r = ph * maxR;
      if (r < sx) continue;
      const n = Math.max(8, Math.round(r / 5));
      for (let a = 0; a < n; a++) {
        const ang = (a / n) * TAU;
        const px = Math.round((x + Math.cos(ang) * r * 1.0) / sx) * sx, py = Math.round((y - Math.abs(Math.sin(ang)) * r * 0.9) / sy) * sy;
        if (Math.sin(ang) > 0.1) continue;
        b.add(rgb(col, 0.75 * (1 - ph)), px, py, sx, sy);
      }
    }
    b.flush(g);
  }

  // ---- stage decor for the statement pages -------------------------------------------------------
  const BARS = ["white", "yellow", "cyan", "green", "magenta", "red", "blue"];
  function testBars(F, y, h, t) {
    const { g, T, cw, W, x0, ch, sx, sy } = F;
    const bw = cw * 4, off = mod(t * 70, bw * 7);
    const rowsN = Math.max(1, Math.floor(h / sy));
    const b = batch();
    for (let x = -bw * 2; x < W + bw; x += bw) {
      const idx = mod(Math.floor((x + off) / bw), 7);
      const col = T[BARS[idx]];
      const ramp = (r) => (r === rowsN - 1 ? 0.45 : 1);
      for (let r = 0; r < rowsN; r++) {
        const edge = mod(Math.floor((x + off) / sx), 2);
        for (let c = 0; c < Math.round(bw / sx); c++) {
          const px = x + c * sx;
          if (px + sx < 0 || px > W) continue;
          const dither = r >= rowsN - 2 && (c + r + Math.floor(t * 4)) % 2 === 0;
          if (dither) continue;
          b.add(col, px, y + r * sy, sx - F.gap, sy - F.gap);
        }
      }
    }
    b.flush(g);
  }
  function equalizer(F, y, h, t) {
    const { g, T, cw, x0, cols, sy, sx } = F;
    const b = batch();
    const cs = [T.green, T.green, T.yellow, T.red];
    for (let c = 0; c < cols; c += 1) {
      const k = Math.sin(c * 0.5 + t * 3.2) * 0.5 + Math.sin(c * 1.3 - t * 2.1) * 0.3 + 0.55 + 0.1 * Math.sin(t * 9 + c);
      const n = Math.max(1, Math.round(clamp(k) * (h / sy)));
      for (let r = 0; r < n; r++) {
        const col = cs[Math.min(3, Math.floor((r / (h / sy)) * 4))];
        b.add(col, x0 + c * cw + sx * 0.1, y + h - (r + 1) * sy, cw - sx * 0.2, sy - F.gap);
      }
      b.add(T.white, x0 + c * cw + sx * 0.1, y + h - (n + 1) * sy, cw - sx * 0.2, sy - F.gap);
    }
    b.flush(g);
  }
  // The page area inside the mosaic side border: figures walk behind the border blocks, never over them.
  function inner(F) { const bc = F.tall ? 1 : 3; return { l: F.x0 + bc * F.cw, r: F.x0 + (F.cols - bc) * F.cw }; }
  function clipInner(F) { const I = inner(F); F.g.save(); F.g.beginPath(); F.g.rect(I.l, 0, I.r - I.l, F.H); F.g.clip(); return I; }
  function decorTitle(F) {
    const { g, T, t, ch, W, H, u, tall } = F;
    const blk = headBlock(F, "title");
    const y1 = ch * 2.4, y2 = blk.top - ch * 0.7;
    if (y2 - y1 > ch * 2) {
      const h = Math.min(y2 - y1, ch * (tall ? 7 : 3.5));
      const y = y1 + (y2 - y1 - h) / 2;
      testBars(F, y, h, t);
      // grey ramp under the bars: mosaic stairs sliding sideways
      const b = batch(), n = Math.floor(F.cols);
      for (let c = 0; c < n; c++) {
        const lvl = mod(c + Math.floor(t * 6), 14) / 13;
        const mask = lvl < 0.25 ? 33 : lvl < 0.5 ? (mod(c, 2) ? CHK_A : CHK_B) : lvl < 0.75 ? 55 : FULL;
        for (let m = 0; m < 6; m++) if ((mask >> m) & 1) b.add(T.white, F.x0 + c * F.cw + (m & 1) * F.sx, y + h + F.sy * 0.6 + (m >> 1) * F.sy, F.sx, F.sy);
      }
      b.flush(g);
    }
    const y3 = blk.bottom + ch * 0.9, y4 = H - ch * 3.2;
    if (y4 - y3 > ch * 3) {
      const gh = y4 - y3, pu = Math.min(gh * 0.84 / 30, (tall ? 17 : 9.5) * u);
      const n = tall ? 4 : 9, base = y4 - ch * 0.5;
      const I = clipInner(F);
      // the road: a strip of mosaic dashes
      const b = batch();
      for (let c = 0; c < F.cols; c++) {
        const on = mod(c - Math.floor(t * 8), 4) < 2;
        b.add(on ? T.yellow : T.blue, F.x0 + c * F.cw, base + 3 * u, F.cw - F.gap, F.sy * 0.9);
      }
      b.flush(g);
      for (let k = 0; k < n; k++) {
        const span2 = I.r - I.l + 16 * pu * 2;
        const x = I.l + mod(k * (span2 / n) + t * 46 * u, span2) - 16 * pu;
        const cols2 = [T.cyan, T.magenta, T.yellow, T.green, T.red, T.white];
        const gl = [T.green, T.cyan, T.red, T.yellow, T.magenta, T.green];
        const c = tuner(F, x, base, pu, { i: k, casing: cols2[k % 6], glow: gl[k % 6], body: [T.blue, T.red, T.blue, T.magenta][k % 4], walk: true, antenna: k, mood: k % 3 === 2 ? "o" : "happy" });
        if (k % 2 === 0) rings(F, c.tipX, c.tipY, cols2[k % 6], k, pu * 8);
      }
      g.restore();
    }
  }
  function decorClosing(F) {
    const { g, T, t, ch, W, H, u, tall } = F;
    const blk = headBlock(F, "closing");
    const y1 = ch * 2.4, y2 = blk.top - ch * 0.7;
    // confetti falls behind everything, all the way to the last frame
    const b = batch(), cs = [T.yellow, T.cyan, T.magenta, T.green, T.red, T.white];
    for (let k = 0; k < 70; k++) {
      const sp = 60 + hash(k) * 110, x = F.x0 + hash(k + 40) * F.cols * F.cw, y = mod(hash(k + 90) * H + t * sp * u, H - ch * 4) + ch * 2.2;
      const sz = (hash(k + 7) > 0.5 ? 1 : 2) * F.sx * 0.9;
      b.add(cs[k % 6], Math.round(x / F.sx) * F.sx, Math.round(y / F.sy) * F.sy, sz, sz * (hash(k + 3) > 0.5 ? 1 : 1.5));
    }
    b.flush(g);
    if (y2 - y1 > ch * 2) {
      const h = Math.min(y2 - y1, ch * (tall ? 8 : 4));
      equalizer(F, y1 + (y2 - y1 - h) / 2, h, t);
    }
    const y3 = blk.bottom + ch * 0.9, y4 = H - ch * 3.2;
    if (y4 - y3 > ch * 3) {
      const gh = y4 - y3, pu = Math.min(gh * 0.84 / 31, (tall ? 17 : 10) * u);
      const n = tall ? 4 : 7, base = y4 - ch * 0.5;
      const I = clipInner(F);
      const bb = batch();
      for (let c = 0; c < F.cols; c++) bb.add(mod(c + Math.floor(t * 5), 6) < 3 ? T.green : T.cyan, F.x0 + c * F.cw, base + 3 * u, F.cw - F.gap, F.sy * 0.9);
      bb.flush(g);
      const cols2 = [T.yellow, T.cyan, T.magenta, T.green, T.red, T.white, T.yellow];
      for (let k = 0; k < n; k++) {
        const x = I.l + (I.r - I.l) * ((k + 0.5) / n);
        const c = tuner(F, x, base - Math.abs(Math.round(Math.sin(t * 5 + k * 0.9) * 0.9)) * pu * 1.5, pu, { i: k, still: true, casing: cols2[k], glow: [T.green, T.cyan, T.yellow][k % 3], body: [T.blue, T.red, T.magenta][k % 3], cheer: true, antenna: k + 1, mood: "happy" });
        rings(F, c.tipX, c.tipY, cols2[k], k, pu * 9);
      }
      g.restore();
    }
  }

  // ---- scenes ---------------------------------------------------------------------------------------
  // Every scene page loads under the scan line; the outgoing page lingers below it.
  function gate(fn, id) {
    return (ctx, S, box, p, d, info) => {
      const F = mk(ctx, S, info);
      const exiting = info.exit !== undefined;
      const first = info.t - info.local < 0.001;
      ctx.save();
      let rv;
      if (exiting) {
        const lim = loadLine(F, info.exit);
        ctx.beginPath(); ctx.rect(0, lim + F.ch * 0.6, F.W, F.H); ctx.clip();
        ctx.globalAlpha = 0.92 * (1 - info.exit * 0.7);
        rv = 1;
      } else {
        if (!first && info.local < info.change) {
          const lim = loadLine(F, info.local / Math.max(0.01, info.change));
          ctx.beginPath(); ctx.rect(0, 0, F.W, lim - F.ch * 0.2); ctx.clip();
        }
        rv = clamp((info.local - 0.02) / Math.min(1.15, Math.max(0.6, info.hold * 0.35)));
      }
      fn(F, box, d, rv, info);
      if (F.solid) furniture(F, box, id, d, info, exiting ? 1 : rv);
      ctx.restore();
    };
  }

  // Draw a poly-line of thick mosaic dashes; q is how much of it is drawn. Returns a point part-way along it.
  function path(F, pts, q, col, bulb, bulbCol) {
    const { g, sx, sy } = F, b = batch();
    let total = 0;
    const lens = [];
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); lens.push(l); total += l; }
    let left = total * q, at = null;
    const bulbAt = bulb === undefined ? -1 : total * bulb;
    let run = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], L = lens[i - 1];
      const n = Math.max(1, Math.floor(L / (sx * 0.9)));
      for (let k = 0; k <= n; k++) {
        const s = (k / n) * L;
        if (s > left) break;
        const x = ax + ((bx - ax) * k) / n, y = ay + ((by - ay) * k) / n;
        b.add(col, x - sx * 0.35, y - sy * 0.3, sx * 0.7, sy * 0.6);
        if (bulbAt >= 0 && Math.abs(run + s - bulbAt) < sx * 0.6) at = [x, y];
      }
      left -= L; run += L;
      if (left <= 0) break;
    }
    b.flush(g);
    if (at && bulbCol) R(g, at[0] - sx * 0.8, at[1] - sy * 0.8, sx * 1.6, sy * 1.6, bulbCol);
    return total;
  }

  // chart ----------------------------------------------------------------------------------------------
  function chartScene(F, box, d, rv, info) {
    const { g, T, u, sx, sy, cw, ch } = F, t = info.t, acc = F.accent;
    const vals = (d.values || []).map((v) => Math.max(0, Number(v) || 0));
    const n = Math.max(1, vals.length), max = Math.max(...vals, 1);
    const hi = d.highlight >= 0 && d.highlight < n ? d.highlight : vals.indexOf(Math.max(...vals));
    const stack = box.h > box.w * 0.9;
    board(F, box, T.green, T.white);
    const R0 = stack ? { x: box.x + cw, y: box.y + cw, w: box.w - cw * 2, h: box.h * 0.3 } : { x: box.x + box.w * 0.675, y: box.y + cw, w: box.w * 0.325 - cw, h: box.h - cw * 2 };
    const Pa = stack ? { x: box.x + cw, y: box.y + box.h * 0.34, w: box.w - cw * 2, h: box.h * 0.66 - cw } : { x: box.x + cw, y: box.y + cw, w: box.w * 0.65 - cw, h: box.h - cw * 2 };
    const vd = 7 * u, ld = 6.4 * u;
    const base = Pa.y + Pa.h - (7 * ld + 26 * u), top = Pa.y + 7 * vd + 36 * u, plotH = base - top;
    // gridlines
    const gq = span(rv, 0, 0.3), gb = batch();
    for (let j = 1; j <= 4; j++) {
      const y = base - (plotH * j) / 4;
      for (let x = Pa.x; x < Pa.x + Pa.w * gq; x += sx * 2) gb.add(rgb(T.blue, 0.9), x, y - sy * 0.2, sx, sy * 0.4);
    }
    gb.flush(g);
    const slot = Pa.w / n, nC = Math.max(3, Math.floor((slot * 0.6) / sx)), barPx = nC * sx;
    const scanX = Pa.x + mod(t * 0.45, 1.25) * Pa.w * 1.1 - Pa.w * 0.05;
    // base line
    const bl = batch();
    for (let x = Pa.x; x < Pa.x + Pa.w * span(rv, 0, 0.25); x += sx) bl.add(T.white, x, base + 2 * u, sx - 1, sy * 0.5);
    bl.flush(g);
    let hot = null;
    vals.forEach((v, i) => {
      const s0 = i * 0.1, k = eo(span(rv, s0, s0 + 0.5));
      const isHot = i === hi, A = isHot ? acc : T[["cyan", "green", "magenta", "red"][i % 4]];
      const Ad = mix(A, T.bg, 0.45), Al = mix(A, "#ffffff", 0.5);
      const cx = Pa.x + slot * (i + 0.5), bx = cx - barPx / 2;
      const hpx = plotH * (v / max) * k, nR = Math.floor(hpx / sy);
      const b = batch();
      for (let j = 0; j < nR; j++) {
        const y = base - (j + 1) * sy;
        for (let c = 0; c < nC; c++) {
          const x = bx + c * sx;
          const topRows = j >= nR - 2 && k >= 0.999;
          if (topRows && (c + j + Math.floor(t * 7)) % 2 === 0 && j < nR - 1) continue;
          let col = j % 5 === 4 ? Ad : A;
          if (c === 0) col = Al; else if (c === nC - 1) col = Ad;
          if (j === nR - 1) col = Al;
          if (Math.abs(x + sx / 2 - scanX) < sx * 1.8) col = "#ffffff";
          b.add(col, x, y, sx - F.gap, sy - F.gap);
        }
      }
      b.flush(g);
      if (k > 0.03) {
        const vs = fmt(v, d, k), blink = isHot && rv >= 1 && Math.floor(t * 2) % 2 === 0;
        txt(g, vs, cx, base - hpx - 7 * vd - 10 * u, vd, blink ? T.dark : isHot ? acc : T.white, { align: "center", back: blink ? acc : null });
      }
      const lab = String(d.labels[i] || "");
      const lf = fitText(lab, ld, 6 * u, slot * 0.96, 1);
      txt(g, lab, cx, base + 22 * u, lf.d, isHot ? acc : T.white, { align: "center", q: span(rv, s0 + 0.15, s0 + 0.45) });
      if (isHot) {
        hot = { cx, hpx, v, label: lab };
        if (rv >= 0.9) for (let m = 0; m < 6; m++) {
          const ph = mod(t * 0.9 + m * 0.17, 1), side = m % 2 ? 1 : -1;
          R(g, side > 0 ? bx + barPx + sx * 0.4 : bx - sx * 1.4, base - ph * hpx, sx, sy, rgb(T.white, 1 - ph));
        }
      }
    });
    // readout panel
    const rq = span(rv, 0, 0.22), vq = span(rv, 0.2, 0.85);
    R(g, R0.x, R0.y, R0.w, R0.h * rq, rgb(T.dark, 0.9));
    if (rq > 0.2) chase(F, R0.x, R0.y, R0.w, R0.h * rq, acc, T.white, 8, cw * 1.1);
    if (hot && rq > 0.9) {
      const ix = R0.x + cw * 1.4, iw = R0.w - cw * 2.8;
      // lamp and label
      const live = Math.floor(t * 1.6) % 2 === 0;
      R(g, R0.x + R0.w - cw * 1.4 - 4 * 6.4 * u * 6 - 9 * u, R0.y + cw * 1.3 + 8 * u, 18 * u, 18 * u, live ? T.red : mix(T.red, T.bg, 0.6));
      txt(g, "LIVE", R0.x + R0.w - cw * 1.4, R0.y + cw * 1.3, 6.4 * u, T.white, { align: "right" });
      const lf = fitText(hot.label, 6.4 * u, 5.4 * u, iw * (stack ? 0.5 : 0.6), 1);
      txt(g, hot.label, ix, R0.y + cw * 1.3, lf.d, acc, { q: span(vq, 0, 0.3) });
      const ns = fmt(hot.v, d, eo(vq));
      const nd = Math.max(13.8 * u, Math.min(15 * u, (stack ? iw * 0.55 : iw) / (ns.length * 6)));
      const nBlink = rv >= 1 && Math.floor(t * 2.2) % 3 === 0;
      txt(g, fmt(hot.v, d, eo(vq)), ix, R0.y + cw * 1.3 + 7 * 6.4 * u + 26 * u, nd, nBlink ? T.white : acc, { shadow: rgb(T.blue, 0.9) });
      const others = vals.filter((_, i) => i !== hi), mean = others.length ? others.reduce((s, v) => s + v, 0) / others.length : 0;
      const pct = mean > 0 ? Math.round(((hot.v - mean) / mean) * 100) : 0;
      const vx = stack ? R0.x + R0.w * 0.56 : ix, vy = stack ? R0.y + cw * 1.3 + 7 * 6.4 * u + 26 * u : R0.y + cw * 1.3 + 7 * 6.4 * u + 26 * u + 7 * nd + 34 * u;
      const vsTxt = `${pct >= 0 ? "+" : ""}${pct}% VS MEAN`;
      const vf = fitText(vsTxt, 6.4 * u, 5.4 * u, stack ? R0.x + R0.w - cw * 1.2 - vx : iw, 1);
      txt(g, vsTxt, vx, vy, vf.d, T.cyan, { q: span(vq, 0.4, 0.8) });
      // segmented meter with a bright segment sliding along it
      const my = vy + 7 * vf.d + 26 * u, segs = stack ? 12 : 16, sw = ((stack ? R0.x + R0.w - cw * 1.2 - vx : iw)) / segs;
      const fill = (hot.v / max) * span(vq, 0.3, 1), b = batch();
      for (let m = 0; m < segs; m++) {
        const on = m / segs < fill, glint = on && mod(m - Math.floor(t * 9), segs) < 2;
        b.add(glint ? "#ffffff" : on ? (m > segs * 0.75 ? T.yellow : T.green) : rgb(T.blue, 0.8), vx + m * sw, my, sw - 5 * u, 24 * u);
      }
      b.flush(g);
      // little histogram of every value, with a marker bouncing along it
      if (!stack) {
        const hy = my + 70 * u, hh = R0.y + R0.h - cw * 1.2 - hy;
        if (hh > 60 * u) {
          const hb = batch(), bwid = Math.min(cw * 2, iw / (n * 1.6));
          vals.forEach((v, i) => {
            const hx = ix + (iw / n) * i, hgt = Math.max(sy, (hh * v) / max) * eo(span(rv, 0.5 + i * 0.05, 0.9 + i * 0.05));
            const col = i === hi ? acc : T[["cyan", "green", "magenta", "red"][i % 4]];
            const rowsN = Math.floor(hgt / sy);
            for (let r = 0; r < rowsN; r++) hb.add(col, hx, hy + hh - (r + 1) * sy, bwid - F.gap, sy - F.gap);
          });
          hb.flush(g);
          const mk2 = Math.floor(mod(t * 1.5, n));
          R(g, ix + (iw / n) * mk2 + bwid / 2 - sx * 0.6, hy + hh + 6 * u, sx * 1.2, sy * 0.7, T.white);
        }
      }
      // an arrow bouncing up beside the number
      const ay = stack ? R0.y + R0.h - cw * 1.8 : R0.y + R0.h - cw * 1.2 - sy * 8, bounce = Math.round(Math.sin(t * 6) * 1.2) * sy;
      if (pct >= 0 && rv >= 1) {
        const ax = R0.x + R0.w - cw * 2.2, b2 = batch();
        for (let r = 0; r < 5; r++) for (let c = -r; c <= r; c++) b2.add(T.green, ax + c * sx, ay + bounce + r * sy, sx - F.gap, sy - F.gap);
        for (let r = 5; r < 8; r++) for (let c = -1; c <= 1; c++) b2.add(T.green, ax + c * sx, ay + bounce + r * sy, sx - F.gap, sy - F.gap);
        b2.flush(g);
      }
    }
  }

  // object -----------------------------------------------------------------------------------------
  function sky(F, x, y, w, h, t) {
    const { g, T, sx, sy } = F;
    const cols = Math.max(4, Math.floor(w / sx)), rowsN = Math.max(3, Math.floor(h / sy)), b = batch();
    const bands = [T.blue, T.blue, T.magenta, T.red, T.yellow];
    const sunT = mod(t * 0.07, 1), scx = cols * (0.1 + 0.8 * sunT), scy = rowsN * (0.62 - 0.4 * Math.sin(Math.PI * sunT)), sr = rowsN * 0.2;
    for (let c = 0; c < cols; c++) {
      const ridge = rowsN * (0.18 + 0.16 * (0.5 + 0.5 * Math.sin(c * 0.33 + t * 2.4)) + 0.08 * Math.sin(c * 0.9 + 2 - t * 1.6));
      for (let r = 0; r < rowsN; r++) {
        if (r >= rowsN - ridge) continue;
        const f = r / rowsN * 4.2;
        let bi = Math.floor(f), fr = f - bi;
        if (fr > 0.82 && (c + r) % 2 === 0) bi += 1;
        let col = bands[Math.min(4, bi)];
        const dx = (c - scx) * 1.15, dy = r - scy, dd = dx * dx + dy * dy;
        if (dd < sr * sr * 0.45) col = T.white; else if (dd < sr * sr) col = T.yellow;
        b.add(col, x + c * sx, y + r * sy, sx - F.gap, sy - F.gap);
      }
    }
    b.flush(g);
  }
  function objectScene(F, box, d, rv, info) {
    const { g, T, u, sx, sy, cw, ch } = F, t = info.t, acc = F.accent;
    const phone = d.kind === "phone", stack = box.h > box.w * 0.9;
    board(F, box, T.cyan, T.white);
    const dev = stack ? { x: box.x + cw, y: box.y + cw, w: box.w - cw * 2, h: box.h * 0.56 } : { x: box.x + cw, y: box.y + cw, w: box.w * 0.55 - cw, h: box.h - cw * 2 - 20 * u };
    let w, h;
    if (phone) { h = Math.min(dev.h * 0.97, dev.w * 1.9); w = h * 0.5; }
    else { w = Math.min(dev.w, (dev.h - 20 * u) / 0.67); h = w * 0.6; }
    const dx = dev.x + (dev.w - w) / 2, dy = dev.y + (dev.h - (phone ? h : h + w * 0.07)) / 2;
    const q = eo(span(rv, 0, 0.4));
    // shell
    const bz = sx * (phone ? 1.6 : 1.4);
    const shell = batch();
    const rowsN = Math.floor((h * q) / sy);
    for (let r = 0; r < rowsN; r++) {
      const y = dy + r * sy, edge = r < 1 || r >= Math.floor(h / sy) - 1;
      const cols = Math.floor(w / sx);
      for (let c = 0; c < cols; c++) {
        const border = c < 2 || c >= cols - 2 || r < 2 || r >= Math.floor(h / sy) - 2;
        if (!border) continue;
        const shade = (c + r) % 2 === 0 || r < 1 || c < 1;
        if (phone && ((r < 2 && (c < 2 || c >= cols - 2)) || (r >= Math.floor(h / sy) - 2 && (c < 2 || c >= cols - 2)))) continue;
        shell.add(shade ? T.white : mix(T.white, T.blue, 0.35), dx + c * sx, y, sx - F.gap * 0.5, sy - F.gap * 0.5);
      }
    }
    shell.flush(g);
    const S0 = { x: dx + bz, y: dy + bz * (phone ? 1.5 : 1), w: w - bz * 2, h: h - bz * (phone ? 3 : 2) };
    R(g, S0.x, S0.y, S0.w, S0.h * q, "#050509");
    if (!phone) {
      const bb = batch(), cols = Math.floor((w * 1.1) / sx);
      for (let k = 0; k < 3; k++) {
        const inset = (3 - k) * sx * 0.3;
        for (let c = 0; c < cols; c++) bb.add(k === 0 ? T.white : k === 1 ? mix(T.white, T.blue, 0.4) : mix(T.white, T.blue, 0.7), dx - w * 0.05 + c * sx + inset, dy + h + k * sy * 0.9, sx - F.gap * 0.5, sy * 0.9);
      }
      bb.flush(g);
      R(g, dx + w * 0.5 - sx * 4, dy + h, sx * 8, sy * 0.9, T.blue);
    }
    // the screen: a live preview and a timeline
    let anchors = [[0, 0], [0, 0], [0, 0]];
    if (q > 0.85) {
      const pad = sx * 0.8, pv = { x: S0.x + pad, y: S0.y + pad, w: S0.w - pad * 2, h: S0.h * (phone ? 0.46 : 0.5) };
      sky(F, pv.x, pv.y, pv.w * span(rv, 0.25, 0.55), pv.h, t);
      if (rv > 0.55) chase(F, pv.x + pv.w * 0.5, pv.y + sy, pv.w * 0.47, pv.h - sy * 2, acc, T.white, 5, cw * 0.9);
      const tl = { x: S0.x + pad, y: pv.y + pv.h + sy * 1.4, w: S0.w - pad * 2 };
      // ruler
      const rb = batch();
      for (let x = 0, i = 0; x < tl.w * span(rv, 0.35, 0.6); x += sx * 2, i++) rb.add(T.white, tl.x + x, tl.y, sx * 0.6, i % 4 === 0 ? sy * 1.2 : sy * 0.6);
      rb.flush(g);
      const th = sy * 2, trk = (i) => tl.y + sy * 2 + i * (th + sy);
      const ph = tl.x + mod(t * 0.28, 1) * tl.w;
      const clipsDef = [[[0, 0.2, 0], [0.22, 0.27, 1], [0.51, 0.49, 0]], [[0.06, 0.3, 0], [0.4, 0.34, 0]]];
      const cc = [T.cyan, T.magenta];
      clipsDef.forEach((row, r) => row.forEach(([a, wf, hotClip], i) => {
        const cq = span(rv, 0.4 + (r * 3 + i) * 0.07, 0.62 + (r * 3 + i) * 0.07);
        if (cq <= 0) return;
        const x = tl.x + tl.w * a, cwid = tl.w * wf * cq - 4 * u, inside = ph >= x && ph <= x + cwid;
        const col = hotClip ? acc : cc[r];
        const cb = batch(), nx = Math.floor(cwid / sx);
        for (let c = 0; c < nx; c++) for (let k = 0; k < 2; k++) {
          const stripe = (c + k + (hotClip ? Math.floor(t * 6) : 0)) % 4 === 0;
          cb.add(inside ? "#ffffff" : stripe && hotClip ? T.white : k === 1 ? mix(col, T.bg, 0.3) : col, x + c * sx, trk(r) + k * sy, sx - F.gap, sy - F.gap);
        }
        cb.flush(g);
        if (hotClip) anchors[1] = [x + cwid * 0.5, trk(r) + sy];
      }));
      // audio meter
      const wy = trk(2) + th / 2, wb = batch(), nW = Math.floor((tl.w * span(rv, 0.55, 0.85)) / sx);
      for (let c = 0; c < nW; c += 1) {
        const hh = (Math.abs(Math.sin(c * 0.7 + t * 6)) * 0.6 + 0.4 * Math.abs(Math.sin(c * 0.19 - t * 3))) * th * 0.9;
        wb.add(c * sx + tl.x < ph ? T.green : mix(T.green, T.bg, 0.5), tl.x + c * sx, wy - hh / 2, sx - F.gap, Math.max(sy * 0.5, hh));
      }
      wb.flush(g);
      // playhead
      if (rv > 0.55) {
        const yb = tl.y, ye = trk(2) + th + sy * 0.4;
        R(g, ph - sx * 0.3, yb, sx * 0.6, ye - yb, T.red);
        const tb = batch(); for (let k = 0; k < 3; k++) for (let c = -2 + k; c <= 2 - k; c++) tb.add(T.red, ph + c * sx * 0.6 - sx * 0.3, yb - (3 - k) * sy * 0.7, sx * 0.6, sy * 0.7);
        tb.flush(g);
      }
      anchors[0] = [pv.x + pv.w * 0.78, pv.y + pv.h * 0.32];
      anchors[2] = [tl.x + tl.w * 0.8, wy];
      if (!anchors[1][0]) anchors[1] = [tl.x + tl.w * 0.35, trk(0) + sy];
    }
    // callouts
    const colors = [T.cyan, acc, T.magenta];
    const labels = (d.callouts || []).slice(0, 3);
    const lx = stack ? box.x + cw * 4.5 : box.x + box.w * 0.595;
    const maxW = (stack ? box.w - cw * 9 : box.x + box.w - cw * 1.6 - lx - cw * 3.5);
    const lay = labels.map((s) => fitText(s || "", 6.4 * u, 6 * u, maxW - 5.2 * 6.4 * u, 2));
    const heights = lay.map((f) => 7 * f.d * f.lines.length + (f.lines.length - 1) * f.d * 2 + f.d * 3);
    const region = stack ? { y: box.y + box.h * 0.62, h: box.h * 0.35 } : { y: box.y + cw * 1.5, h: box.h - cw * 5.5 };
    const gapY = Math.max(cw * 0.6, (region.h - heights.reduce((s, v) => s + v, 0)) / Math.max(1, labels.length - 1));
    let yy = region.y;
    labels.forEach((label, i) => {
      const cq = span(rv, 0.4 + i * 0.1, 0.7 + i * 0.1);
      const f = lay[i], hgt = heights[i], ly = yy;
      yy += hgt + Math.min(gapY, cw * 3);
      if (cq <= 0 || !label) return;
      const col = colors[i], ink = F.fgOn(col);
      const chipX = lx + cw * 2.6, chipW = Math.max(...f.lines.map((l) => textW(l, f.d))) + f.d * 8.6;
      const mid = ly + hgt / 2, endX = chipX - cw * 0.3;
      const xe = stack ? dev.x + dev.w - cw * (0.7 + i * 1.1) : lx - cw * (1.6 - i * 0.5) + (i === 1 ? -cw * 0.4 : 0);
      const pts = stack ? [anchors[i], [xe, anchors[i][1]], [xe, mid], [chipX + chipW + cw * 0.3, mid]] : [anchors[i], [xe, anchors[i][1]], [xe, mid], [endX, mid]];
      const total = path(F, pts, span(cq, 0, 0.6), col, rv >= 1 ? mod(t * 0.6 + i * 0.3, 1) : undefined, "#ffffff");
      if (rv > 0.5) { const blink = Math.floor(t * 3 + i) % 2 === 0; R(g, anchors[i][0] - sx, anchors[i][1] - sy, sx * 2, sy * 2, blink ? "#ffffff" : col); }
      const tq = span(cq, 0.55, 1);
      // number tab then the label on a colour band
      // once built, the callouts take turns: the active one's tab lights and a cursor blinks after its text
      const isAct = rv >= 1 && i === Math.floor(mod(info.local * 1.3, labels.length));
      R(g, lx - cw * 0.2, ly, cw * 2.3 * (tq > 0 ? 1 : 0), hgt, isAct ? col : T.white);
      if (tq > 0) txt(g, String(i + 1), lx + cw * 0.95, ly + (hgt - 7 * f.d) / 2, f.d, isAct ? ink : T.dark, { align: "center" });
      const bandW = chipW * eo(tq);
      R(g, chipX, ly, bandW, hgt, col);
      const qq = span(tq, 0, 0.7);
      f.lines.forEach((l, k) => txt(g, l, chipX + f.d * 1.7, ly + f.d * 1.5 + k * (7 * f.d + f.d * 2), f.d, ink, { q: qq }));
      if (isAct && Math.floor(t * 4) % 2 === 0) {
        const k = f.lines.length - 1, lw = textW(f.lines[k], f.d);
        R(g, chipX + f.d * 2.7 + lw, ly + f.d * 1.5 + k * (7 * f.d + f.d * 2), f.d * 4.4, 7 * f.d, ink);
      }
    });
    // page footer
    if (!stack && rv > 0.7) {
      const fd = 6 * u, s2 = "PRESS 1 2 3 FOR DETAIL", rx = box.x + box.w - cw * 1.4, fy = box.y + box.h - cw * 1.6 - 9 * u;
      txt(g, s2, rx, fy, fd, T.cyan, { align: "right", q: span(rv, 0.7, 1) });
      if (rv >= 1) { const a = Math.floor(mod(info.local * 1.3, Math.max(1, labels.length))); const x1 = rx - textW(s2, fd) + (6 + a * 2) * 6 * fd; R(g, x1 - fd, fy - fd, 7 * fd, 9 * fd, colors[a]); txt(g, String(a + 1), x1, fy, fd, T.dark); }
    }
  }

  // people -------------------------------------------------------------------------------------------
  function peopleScene(F, box, d, rv, info) {
    const { g, T, u, sx, sy, cw, ch } = F, t = info.t, acc = F.accent;
    const n = Math.max(2, Math.min(6, Math.round(d.count || 3)));
    board(F, box, T.magenta, T.white);
    const slot = (box.w - cw * 2) / n, pu = Math.min((slot * 0.8) / 14, (box.h * 0.6) / 30);
    const base = box.y + box.h * 0.85, left = box.x + cw;
    // skyline behind: dim mosaic towers drifting past
    const sk = batch(), step = Math.floor(t * 2);
    for (let c = 0; c < Math.floor((box.w - cw * 2) / (sx * 3)); c++) {
      const cc = c + step, hgt = Math.floor(2 + hash(cc * 3.7) * 9) * sy;
      const x = left + c * sx * 3;
      sk.add(rgb(T.blue, 0.65), x, base - hgt, sx * 3 - F.gap, hgt);
      if (hash(cc + 9) > 0.55) sk.add(rgb(T.yellow, 0.6), x + sx, base - hgt + sy, sx, sy);
    }
    sk.flush(g);
    // ground: moving stripes
    const gb = batch();
    for (let c = 0; c < Math.floor((box.w - cw * 2) / sx); c++) {
      const on = mod(c - Math.floor(t * 8), 6) < 3;
      gb.add(on ? T.green : mix(T.green, T.bg, 0.6), left + c * sx, base + 2 * u, sx - F.gap, sy * 0.9);
      gb.add(on ? mix(T.green, T.bg, 0.6) : T.cyan, left + c * sx, base + 2 * u + sy, sx - F.gap, sy * 0.7);
    }
    gb.flush(g);
    const cas = [T.cyan, T.magenta, T.green, T.white, T.red, T.cyan], gl = [T.green, T.cyan, T.yellow, T.magenta, T.green, T.red];
    const hotI = Math.min(n - 1, d.highlight ?? 1);
    const tags = [], tagD = 6.2 * u;
    for (let i = 0; i < n; i++) {
      const s0 = (i / n) * 0.45, k = span(rv, s0, s0 + 0.35);
      const cx = left + slot * (i + 0.5);
      const hot = i === hotI;
      const bh = 29 * pu;
      if (k > 0) {
        g.save();
        // the character loads from the top down under a scan line
        g.beginPath(); g.rect(cx - pu * 12, base - bh - pu * 4, pu * 24, (bh + pu * 6) * k); g.clip();
        const c = tuner(F, cx, base, pu, { i, casing: hot ? acc : cas[i % 6], glow: hot ? T.cyan : gl[i % 6], body: hot ? T.red : [T.blue, T.magenta, T.blue][i % 3], wave: hot, antenna: i, mood: hot ? "happy" : i % 4 === 3 ? "o" : "happy" });
        rings(F, c.tipX, c.tipY, hot ? acc : cas[i % 6], i, pu * 9);
        g.restore();
        if (k < 1) R(g, cx - pu * 8, base - bh + (bh + pu * 6) * k - pu * 4, pu * 16, Math.max(2, sy * 0.5), T.white);
        if (hot && rv > 0.6) for (let m = 0; m < 4; m++) {
          const ph = mod(t * 1.1 + m * 0.25, 1), ang = m * 1.6 + 0.7, rr = pu * (9 + 3 * Math.sin(m));
          const sxp = cx + Math.cos(ang) * rr * 1.1, syp = base - 18 * pu + Math.sin(ang) * rr * 1.2;
          if (ph < 0.6) { R(g, sxp - sx * 0.5, syp - sy * 1.5, sx, sy * 3, T.yellow); R(g, sxp - sx * 1.5, syp - sy * 0.5, sx * 3, sy, T.yellow); }
        }
      }
      tags.push({ cx, k, hot, i });
    }
    // name tags: alternate heights so long ones can use the next slot's width
    // Figures beyond the given badges take their own roles, so the cast never repeats a name.
    const given = (d.badges || []).map((b) => String(b || "").trim()).filter(Boolean);
    const spare = ["YOU", "REVIEWER", "CLIENT", "VIEWER", "PRODUCER", "SOUND"].filter((r) => !given.some((b) => b.toUpperCase() === r));
    const labels = Array.from({ length: n }, (_, i) => (i < given.length ? given[i] : spare[(i - given.length) % spare.length]));
    const rowH = 7 * tagD + tagD * 3.2, alt = n >= 4;
    const rowOf = (i) => (n >= 5 && F.tall ? i % 3 : alt ? i % 2 : 0);
    const place = (i, cx) => {
      const label = String(labels[i] || "");
      const lf = fitText(label, tagD, 6 * u, slot * (alt ? (F.tall ? 2.6 : 1.9) : 0.95), 1);
      const w2 = textW(label, lf.d) + lf.d * 3.2;
      return { label, lf, w2, ty: box.y + cw * 0.9 + rowOf(i) * (rowH + cw * 0.3), bx: clamp(cx - w2 / 2, box.x + cw * 0.4, box.x + box.w - cw * 0.4 - w2) };
    };
    tags.forEach(({ cx, k, hot, i }) => {
      const P = place(i, cx);
      if (!P.label || k < 0.8) return;
      const col = hot ? acc : cas[i % 6], ly0 = P.ty + 7 * P.lf.d + P.lf.d * 2.6, ly1 = base - 31 * pu, lb = batch();
      for (let y = ly0 + sy * 0.5; y < ly1; y += sy * 1.6) lb.add(rgb(col, 0.9), cx - sx * 0.3, y, sx * 0.6, sy * 0.8);
      lb.flush(g);
    });
    tags.forEach(({ cx, k, hot, i }) => {
      const P = place(i, cx);
      if (!P.label || k < 0.8) return;
      const tq = span(rv, 0.45 + i * 0.05, 0.8 + i * 0.05);
      const col = hot ? acc : cas[i % 6], ink = F.fgOn(col);
      R(g, P.bx, P.ty, P.w2 * eo(tq), 7 * P.lf.d + P.lf.d * 2.6, col);
      txt(g, P.label, P.bx + P.lf.d * 1.6, P.ty + P.lf.d * 1.3, P.lf.d, ink, { q: span(tq, 0.2, 1) });
    });
  }

  // process ----------------------------------------------------------------------------------------
  function icon(F, kind, cx, cy, pu, t, col, live) {
    const { g, T } = F;
    const P = (x, y, w, h, c) => R(g, cx + x * pu, cy + y * pu, w * pu, h * pu, c);
    if (kind === "doc") {
      for (let r = 0; r < 14; r++) {
        const w = r < 3 ? 8 + r : 11;
        P(-5.5, -7 + r, r < 3 ? 8 + r : 11, 1, r === 0 || r === 13 ? T.white : T.white);
      }
      P(-4.5, -6, 9, 12, "#06060c"); P(-5.5, -7, 3, 3, "#06060c"); P(-4, -6.5, 2, 2, mix(T.white, T.blue, 0.5));
      for (let k = 0; k < 4; k++) {
        const len = 1 + Math.floor(mod(t * (live ? 6 : 2.5) + k * 3, 9));
        P(-3.5, -3 + k * 2.5, Math.min(7.5, len), 1, k === 1 ? T.yellow : col);
      }
      if (Math.floor(t * 3) % 2 === 0) P(-3.5, 6.6, 1, 1, T.white);
    } else if (kind === "spark") {
      const big = 6 + Math.round(Math.sin(t * 5) * 1.2);
      P(-0.5, -big, 1.6, big * 2 + 1.6, col); P(-big, -0.5, big * 2 + 1.6, 1.6, col);
      const dg = 3 + Math.round(Math.sin(t * 5 + 1.5) * 1);
      for (let k = 1; k <= dg; k++) { P(k - 0.5, -k - 0.5, 1.2, 1.2, T.white); P(-k - 0.5, k - 0.5, 1.2, 1.2, T.white); P(k - 0.5, k - 0.5, 1.2, 1.2, T.white); P(-k - 0.5, -k - 0.5, 1.2, 1.2, T.white); }
      P(-1.5, -1.5, 3.6, 3.6, T.white);
      for (let k = 0; k < 4; k++) { const a = t * 1.8 + (k * TAU) / 4, rr = 9; P(Math.round(Math.cos(a) * rr) - 0.5, Math.round(Math.sin(a) * rr * 0.8) - 0.5, 1.4, 1.4, k % 2 ? T.cyan : T.magenta); }
    } else if (kind === "eye") {
      const wd = [4, 8, 11, 13, 11, 8, 4];
      const blink = mod(t, 3.2) < 0.15;
      wd.forEach((w, r) => { const rr = blink ? Math.min(r, 6 - r) : 0; if (blink && r !== 3) return; P(-w / 2, -3.5 + r, w, 1, T.white); });
      if (!blink) {
        const ix = Math.round(Math.sin(t * 1.4) * 2.4);
        P(ix - 2.5, -2.5, 5, 5, col); P(ix - 1, -1, 2, 2, "#06060c"); P(ix + 0.5, -2, 1, 1, T.white);
      }
      P(-7, -6, 14, 1, mix(col, T.bg, 0.2)); P(-7, 4.5, 14, 1, mix(col, T.bg, 0.5));
    } else {
      const pts = [[-6, 0], [-5, 1], [-4, 2], [-3, 3], [-2, 4], [-1, 3], [0, 2], [1, 1], [2, 0], [3, -1], [4, -2], [5, -3], [6, -4]];
      const pulse = 0.85 + 0.15 * Math.sin(t * 6);
      pts.forEach(([x, y], k) => { P(x - 1, y - 1.4, 2.2, 2.4, col); if (live && mod(Math.floor(t * 14), 14) === k) P(x - 1, y - 1.4, 2.2, 2.4, T.white); });
      const ra = mod(t * 0.9, 1);
      const rr = 8 + ra * 3, nr = 22;
      for (let k = 0; k < nr; k++) { const a = (k / nr) * TAU; P(Math.cos(a) * rr - 0.5, Math.sin(a) * rr - 0.5, 1, 1, rgb(col, (1 - ra) * 0.9)); }
    }
  }
  function processScene(F, box, d, rv, info) {
    const { g, T, u, sx, sy, cw, ch } = F, t = info.t, acc = F.accent;
    const steps = (d.steps || []).slice(0, 4), n = Math.max(1, steps.length);
    const stack = box.h > box.w * 0.9;
    board(F, box, T.yellow, T.white);
    const gap = stack ? ch * 1.5 : cw * 3.4;
    const pad = cw * 1;
    const cwid = stack ? box.w - pad * 2 : (box.w - pad * 2 - gap * (n - 1)) / n;
    const chgt = stack ? (box.h - pad * 2 - gap * (n - 1) - ch * 0.4) / n : box.h - pad * 2 - ch * 2;
    const active = Math.floor(mod(t * 0.85, n));
    const kinds = ["doc", "spark", "eye"];
    for (let i = 0; i < n; i++) {
      const k = span(rv, i * 0.12, i * 0.12 + 0.4);
      const x = stack ? box.x + pad : box.x + pad + i * (cwid + gap), y = stack ? box.y + pad + i * (chgt + gap) : box.y + pad;
      const isAct = rv >= 1 && i === active, last = i === n - 1;
      const col = [T.cyan, T.magenta, T.yellow, T.green][i % 4];
      if (k <= 0) continue;
      const hh = chgt * eo(k);
      R(g, x, y, cwid, hh, rgb(T.dark, 0.95));
      chase(F, x, y, cwid, hh, isAct ? acc : col, T.white, isAct ? 12 : 5, cw);
      if (k < 0.3) continue;
      // header strip: step number and a page tag
      R(g, x + sx * 1.5, y + sy * 1.5, cwid - sx * 3, ch * 1.05, col);
      const ink = F.fgOn(col);
      txt(g, "STEP " + (i + 1), x + cw * 0.8, y + sy * 1.5 + (ch * 1.05 - 7 * F.d * 1.1) / 2, F.d * 1.1, ink);
      txt(g, "P" + (200 + i + 1), x + cwid - cw * 0.8, y + sy * 1.5 + (ch * 1.05 - 7 * F.d * 1.1) / 2, F.d * 1.1, ink, { align: "right" });
      // the icon sits above the label, clear of the progress bar
      const ld = 6.4 * u;
      const stripEnd = y + sy * 1.5 + ch * 1.05, barTop = y + chgt - sy * (stack ? 2.4 : 3.6);
      const lw = stack ? cwid * 0.56 : cwid - cw * 1.6;
      const lf = fitText(steps[i] || "", ld, 6 * u, lw, 2);
      const lblH = 7 * lf.d * lf.lines.length + (lf.lines.length - 1) * lf.d * 2;
      const lyy = stack ? y + (stripEnd - y + barTop - y) / 2 - lblH / 2 : barTop - sy * 1.6 - lblH;
      const topY = stripEnd + sy * (stack ? 0.6 : 2), botY = stack ? barTop - sy * 0.8 : lyy - sy * 2;
      const iconPu = Math.max(3 * u, Math.min((stack ? cwid * 0.3 : cwid * 0.52) / 14, (botY - topY) / (stack ? 12 : 15)));
      const icx = stack ? x + cwid * 0.2 : x + cwid / 2, icy = (topY + botY) / 2;
      icon(F, last ? "check" : kinds[i % 3], icx, icy, iconPu, t, last ? T.green : col, isAct);
      const lx = stack ? x + cwid * 0.4 : x + cwid / 2, align = stack ? "left" : "center";
      lf.lines.forEach((l, kk) => txt(g, l, lx, lyy + kk * (7 * lf.d + lf.d * 2), lf.d, T.white, { align, q: span(k, 0.45, 0.9), back: isAct ? rgb(col, 0.35) : null }));
      // a segmented progress bar along the bottom of each card, running while it is the active one
      const px = x + cw * 0.8, pw = cwid - cw * 1.6, py = y + chgt - sy * 3, segs = 14, pb = batch();
      for (let m = 0; m < segs; m++) {
        const fill = isAct ? mod(t * 0.85, 1) : i < active ? 1 : 0;
        pb.add(m / segs < fill ? (m === Math.floor(fill * segs) ? "#ffffff" : col) : rgb(T.blue, 0.7), px + (pw / segs) * m, py, pw / segs - 4 * u, sy * 1.6);
      }
      pb.flush(g);
      // arrows to the next card: chevrons marching
      if (i < n - 1) {
        const aq = span(rv, i * 0.12 + 0.3, i * 0.12 + 0.55);
        if (aq > 0) {
          const cb = batch();
          for (let m = 0; m < 3; m++) {
            const ph = mod(t * 1.8 - m * 0.33, 1);
            const col2 = ph < 0.5 ? acc : T.white;
            const cxp = stack ? x + cwid / 2 : x + cwid + gap / 2, cyp = stack ? y + chgt + gap / 2 : y + chgt / 2;
            const off = (m - 1) * (stack ? sy * 3.2 : sx * 3.2);
            for (let r = -3; r <= 3; r++) {
              const a = 3 - Math.abs(r);
              if (stack) cb.add(col2, cxp + r * sx, cyp + off - a * sy * 0.9, sx - F.gap, sy - F.gap);
              else cb.add(col2, cxp + off - a * sx * 0.6, cyp + r * sy, sx - F.gap, sy - F.gap);
            }
          }
          cb.flush(g);
        }
      }
    }
    // a page-wide loading strip
    const sy2 = box.y + box.h - ch * 1.35, lb = batch(), segs = Math.floor((box.w - pad * 2) / cw);
    const head = Math.floor(mod(t * 14, segs));
    for (let m = 0; m < segs; m++) lb.add(mod(head - m, segs) < 5 ? (mod(head - m, segs) === 0 ? "#ffffff" : T.yellow) : rgb(T.blue, 0.8), box.x + pad + m * cw, sy2, cw - F.gap, sy * 0.9);
    lb.flush(g);
  }

  // compare ----------------------------------------------------------------------------------------
  function compareScene(F, box, d, rv, info) {
    const { g, T, u, sx, sy, cw, ch } = F, t = info.t, acc = F.accent;
    const stack = box.h > box.w * 1.1;
    board(F, box, T.red, T.white);
    const gap = stack ? ch * 3.4 : cw * 8, pad = cw;
    const pw = stack ? box.w - pad * 2 : (box.w - pad * 2 - gap) / 2, ph = stack ? (box.h - pad * 2 - gap) / 2 : box.h - pad * 2;
    const max = Math.max(d.leftValue, d.rightValue, 1);
    const items = [[d.left, d.leftValue, T.white, "sad"], [d.right, d.rightValue, acc, "happy"]];
    items.forEach(([label, value, col, mood], i) => {
      const k = span(rv, i * 0.12, i * 0.12 + 0.3), x = stack ? box.x + pad : box.x + pad + i * (pw + gap), y = stack ? box.y + pad + i * (ph + gap) : box.y + pad;
      if (k <= 0) return;
      const hh = ph * eo(k);
      R(g, x, y, pw, hh, rgb(T.dark, 0.95));
      chase(F, x, y, pw, hh, col, i ? T.white : T.blue, i ? 10 : 4, cw);
      if (k < 0.5) return;
      const ink = F.fgOn(col), vq = span(rv, 0.2 + i * 0.1, 0.8 + i * 0.1);
      const ld = 6.4 * u, lf = fitText(label || "", ld, 6 * u, pw - cw * 2.6, 1);
      const lw = textW(label || "", lf.d) * Math.min(1, vq * 3) + lf.d * 3.4;
      R(g, x + cw * 0.8, y + cw * 0.8, lw, 7 * lf.d + lf.d * 2.6, col);
      txt(g, label, x + cw * 0.8 + lf.d * 1.7, y + cw * 0.8 + lf.d * 1.3, lf.d, ink, { q: span(vq, 0, 0.4) });
      const ns = fmt(value, d, eo(vq));
      const textArea = stack ? pw * 0.58 : pw * 0.6;
      const nd = Math.max(13.8 * u, Math.min(17 * u, textArea / (fmt(value, d).length * 6)));
      const flick = rv >= 1 && i === 1 && Math.floor(t * 2.5) % 4 === 0;
      txt(g, ns, x + cw * 0.9, y + cw * 0.8 + 7 * lf.d + 34 * u, nd, flick ? T.white : col, { shadow: rgb(T.blue, 0.9) });
      // one token per unit (scaled), the last one blinking
      {
        const tokens = clamp(Math.round((value / max) * 20), 1, 20), tz = sx * 2.2, per = Math.max(4, Math.floor(textArea / (tz * 1.35)));
        const ty0 = y + cw * 0.8 + 7 * lf.d + 34 * u + 7 * nd + 22 * u, tb = batch();
        const shown = Math.floor(tokens * eo(span(vq, 0.2, 1)));
        for (let m = 0; m < shown; m++) {
          const rr = Math.floor(m / per), cc = m % per, lastOne = m === shown - 1 && rv >= 1;
          if (ty0 + rr * tz * 1.35 + tz > y + ph - sy * 5.6) continue;
          tb.add(lastOne && Math.floor(t * 3) % 2 ? T.white : col, x + cw * 0.9 + cc * tz * 1.35, ty0 + rr * tz * 1.35, tz, tz);
        }
        tb.flush(g);
      }
      // segmented meter with a glint
      const segs = 16, mx = x + cw * 0.9, mw = textArea + cw * 0.6, my = y + ph - sy * 4.4, fill = (value / max) * eo(vq), mb = batch();
      for (let m = 0; m < segs; m++) {
        const on = m / segs < fill, glint = on && rv >= 1 && mod(m - Math.floor(t * 10 + i * 5), segs) < 2;
        mb.add(glint ? "#ffffff" : on ? col : rgb(T.blue, 0.8), mx + (mw / segs) * m, my, mw / segs - 5 * u, sy * 2.4);
      }
      mb.flush(g);
      // the reaction: an original tuner, glum on the left and delighted on the right
      const pu = Math.min((stack ? pw * 0.3 : pw * 0.3) / 14, (ph * 0.7) / 30);
      const cx = x + pw - (stack ? pw * 0.2 : pw * 0.2), by = y + ph - sy * 6.5;
      if (k >= 1 || k > 0.8) {
        g.save(); g.beginPath(); g.rect(cx - 12 * pu, by - 32 * pu, 24 * pu, 34 * pu * clamp(vq * 1.3)); g.clip();
        const tun = tuner(F, cx, by - (i && rv >= 1 ? Math.abs(Math.round(Math.sin(t * 5) * 1)) * pu * 1.2 : 0), pu, { i: i + 2, still: Boolean(i), casing: i ? acc : T.cyan, glow: i ? T.green : T.cyan, body: i ? T.red : T.blue, mood, cheer: Boolean(i), antenna: i ? 0 : 1 });
        if (i) rings(F, tun.tipX, tun.tipY, acc, 2, pu * 8);
        g.restore();
      }
    });
    // the change between them: a starburst kept inside the gap, with the percentage counting up on a
    // solid black double-height panel at its heart
    const bq = span(rv, 0.62, 0.9);
    if (bq > 0) {
      const delta = d.leftValue ? Math.round(((d.rightValue - d.leftValue) / d.leftValue) * 100) : null;
      const cq = eo(span(rv, 0.7, 1));
      const label = delta === null ? "NEW" : `${delta >= 0 ? "+" : ""}${Math.round(delta * cq)}%`;
      const full = delta === null ? "NEW" : `${delta >= 0 ? "+" : ""}${delta}%`;
      const bx = stack ? box.x + box.w / 2 : box.x + pad + pw + gap / 2, by = stack ? box.y + pad + ph + gap / 2 : box.y + box.h * 0.46;
      const vs = 1.6, maxPW = stack ? box.w * 0.6 : gap - cw * 1.3, maxPH = stack ? gap * 0.84 : ph * 0.5;
      const bd = Math.max(5 * u, Math.min(13.8 * u, (maxPW - 0) / (full.length * 6 + 3), maxPH / (7 * vs + 3)));
      const pwid = textW(full, bd) + bd * 4, phgt = 7 * bd * vs + bd * 3;
      const rx = (stack ? Math.min(box.w * 0.46, pwid / 2 + cw * 3) : gap / 2 - sx * 0.4) * eo(bq), ry = (stack ? gap / 2 - sy * 0.4 : phgt / 2 + cw * 3.2) * eo(bq);
      const spin = Math.floor(t * 4) % 2, b = batch();
      for (let r = -Math.ceil(ry / sy); r <= Math.ceil(ry / sy); r++) for (let c = -Math.ceil(rx / sx); c <= Math.ceil(rx / sx); c++) {
        const dx = c * sx, dy = r * sy, dist = Math.hypot(dx / Math.max(1, rx), dy / Math.max(1, ry)), ang = Math.atan2(dy / ry, dx / rx);
        const spike = 0.74 + 0.26 * Math.cos(ang * 8 + (spin ? 0.4 : 0));
        if (dist < spike) b.add(dist < 0.6 ? acc : mix(acc, T.red, 0.5), bx + dx - sx / 2, by + dy - sy / 2, sx - F.gap * 0.5, sy - F.gap * 0.5);
      }
      b.flush(g);
      const pq = eo(span(bq, 0.3, 0.8));
      if (pq > 0) {
        R(g, bx - (pwid / 2) * pq, by - phgt / 2, pwid * pq, phgt, T.bg === "#e8e3d0" ? T.dark : "#000000");
        if (pq > 0.9) chase(F, bx - pwid / 2, by - phgt / 2, pwid, phgt, acc, T.white, 9, cw * 0.8);
        if (pq >= 1) {
          const lit = rv >= 1 && Math.floor(t * 2.5) % 5 === 0;
          txt(g, label, bx, by - (7 * bd * vs) / 2, bd, lit ? "#ffffff" : acc, { align: "center", vs });
        }
      }
    }
  }

  // ---- the CRT pass --------------------------------------------------------------------------------
  function crt(g, W, H, t, look) {
    g.clearRect(0, 0, W, H);
    const u = Math.min(W, H) / 1080, T = look.tele;
    const per = Math.max(3, Math.round(4 * u));
    g.fillStyle = T.scan;
    g.beginPath();
    for (let y = 0; y < H; y += per) g.rect(0, y + per - Math.max(1, Math.round(per * 0.5)), W, Math.max(1, Math.round(per * 0.5)));
    g.fill();
    // a slow rolling bar
    const ry = (mod(t * 0.09, 1.5) - 0.25) * H, rh = H * 0.2;
    const gr = g.createLinearGradient(0, ry, 0, ry + rh);
    gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.5, `rgba(255,255,255,${T.roll})`); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, ry, W, rh);
    // snow
    const r = rng(Math.floor(t * 24) + 5);
    g.fillStyle = "rgba(255,255,255,0.08)";
    g.beginPath();
    for (let i = 0; i < 90; i++) g.rect(Math.floor(r() * W), Math.floor(r() * H), Math.max(1, 2 * u), Math.max(1, 2 * u));
    g.fill();
    // tracking glitches: a displaced bright band with colour fringes
    const kk = Math.floor(t / 2.3), ph = t - kk * 2.3;
    if (hash(kk + 3) > 0.3 && ph < 0.16) {
      const y = hash(kk + 9) * H * 0.8 + H * 0.05, h = (10 + hash(kk + 5) * 26) * u, off = (hash(kk + 1) - 0.5) * 60 * u;
      g.fillStyle = "rgba(255,255,255,0.1)"; g.fillRect(0, y, W, h);
      g.fillStyle = "rgba(255,0,60,0.16)"; g.fillRect(off, y, W * 0.5, h * 0.4);
      g.fillStyle = "rgba(0,200,255,0.16)"; g.fillRect(W * 0.5 - off, y + h * 0.5, W * 0.5, h * 0.4);
    }
    // vignette and rounded glass corners
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.55)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    const rad = 34 * u;
    g.fillStyle = "#000"; g.beginPath(); g.rect(0, 0, W, H);
    g.moveTo(rad, 0); g.arcTo(W, 0, W, H, rad); g.arcTo(W, H, 0, H, rad); g.arcTo(0, H, 0, 0, rad); g.arcTo(0, 0, W, 0, rad); g.closePath();
    g.fill("evenodd");
  }

  const TELE = {
    bg: "#000000", bar: "#06061a", dark: "#05050a", light: "#ffffff",
    red: "#ff2b2b", green: "#1fe65c", yellow: "#ffe81a", blue: "#2a3bff", magenta: "#ff45f0", cyan: "#22eeee", white: "#f4f4ee",
    scan: "rgba(0,0,0,0.3)", roll: 0.045,
  };
  const halo = () => "none";

  return {
    bg: TELE.bg, panel: "rgba(255,255,255,0.06)", ink: TELE.white, muted: "#9aa0d0", accent: TELE.yellow, onAccent: "#000000",
    rule: "rgba(255,255,255,0.5)", track: "rgba(255,255,255,0.1)",
    display: "Menlo, 'Courier New', monospace", displayWeight: 700, displayCase: "uppercase", displayTracking: "0.02em",
    body: "Menlo, 'Courier New', monospace", bodyWeight: 700, figures: "Menlo, 'Courier New', monospace",
    radius: 0, motion: "type", change: "grid", kit: { line: 3, fill: "solid", panel: "outline" },
    tele: TELE,
    keepArt: true, overlap: true,
    palettes: {
      // Daylight: dark colours on a cream page. Navy: the blue-screen service. Green: a single-phosphor monitor.
      light: {
        bg: "#e8e3d0", ink: "#14142a", muted: "#555878", accent: "#c4140f", onAccent: "#ffffff", rule: "rgba(20,20,42,0.6)", track: "rgba(20,20,42,0.1)",
        backdrop: () => "#e8e3d0",
        tele: { ...TELE, bg: "#e8e3d0", bar: "#d9d3bb", dark: "#14142a", light: "#fffdf2", red: "#c4140f", green: "#0b8a3b", yellow: "#d9a400", blue: "#1f2fcf", magenta: "#b01fa5", cyan: "#0a8fa0", white: "#14142a", scan: "rgba(40,30,0,0.12)", roll: 0.07 },
      },
      dark: {
        bg: "#00002a", backdrop: () => "#00002a",
        tele: { ...TELE, bg: "#00002a", bar: "#000014", blue: "#4a5bff" },
      },
      mono: {
        bg: "#020b05", ink: "#d8ffe2", muted: "#4f9c68", accent: "#b6ff9e", onAccent: "#00140a", rule: "rgba(120,255,160,0.5)", track: "rgba(120,255,160,0.12)",
        backdrop: () => "#020b05",
        tele: { ...TELE, bg: "#020b05", bar: "#03150a", dark: "#00140a", light: "#d8ffe2", red: "#3fb862", green: "#35e06a", yellow: "#b6ff9e", blue: "#1a7a3c", magenta: "#5fd486", cyan: "#8fffc0", white: "#e0ffe8", scan: "rgba(0,12,4,0.34)" },
      },
    },
    css() {
      // The headlines are drawn in the page's bitmap font by the stage; the live text stays for the layout.
      return ".display,.kicker{color:transparent !important;text-shadow:none !important;}";
    },
    textShadow: halo,
    backdrop: (accent, tex, look) => look.tele.bg,
    paintOver: true,
    paint(ctx, W, H, t, accent, look) { crt(ctx, W, H, t, look); },
    stage(ctx, S, info) {
      const F = mk(ctx, S, info);
      const id = info.scene, theme = THEME[id] || "blue";
      const sweeping = Boolean(id) && info.index > 0 && info.local < info.change;
      const k = sweeping ? info.local / Math.max(0.01, info.change) : 1;
      const lim = sweeping ? loadLine(F, k) : F.H;
      if (F.solid) {
        ctx.fillStyle = F.T.bg; ctx.fillRect(0, 0, F.W, F.H);
        plasma(F, theme);
        border(F, theme);
      }
      if (F.solid && id) {
        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, F.W, sweeping ? lim - F.ch * 0.2 : F.H); ctx.clip();
        if (id === "title") decorTitle(F);
        else if (id === "closing") decorClosing(F);
        ctx.restore();
      }
      frameNext = info.next;
      if (F.solid) chrome(F, theme, info.local, (sweeping && info.local < info.change * 0.55) || (info.index === 0 && info.local < 0.3));
      if (id) headline(F);
      if (sweeping) scanBar(F, lim, k);
    },
    scenes: { chart: gate(chartScene, "chart"), object: gate(objectScene, "object"), people: gate(peopleScene, "people"), process: gate(processScene, "process"), compare: gate(compareScene, "compare") },
  };
});
