// Cross-Stitch: a sampler worked on aida cloth in a wooden hoop. Every picture, label and number is built
// from real cross stitches on the cloth's own grid (two thread-twist diagonals with a shadow), stitched
// row by row behind a needle that trails its thread. Scenes are pattern charts: a faint printed ghost of
// the chart sits on the cloth first, the thread fills it in, then the finished piece keeps moving (bobbing
// figures, swaying flowers, a travelling playhead, drifting clouds, a second needle sewing a seam, chasing
// diamonds in the border). A scene change slides the hoop along the cloth while the old piece is unpicked.
// All motifs are original. Frames are pure functions of time; texture uses seeded rng only.
window.DreamcutMotion.register("cross-stitch", ({ rng }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const sm = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };
  const fmod = (a, n) => ((a % n) + n) % n;
  const SERIF = "'Georgia', 'Times New Roman', serif";

  // ---- colour ----------------------------------------------------------------------------------------
  const RGB = new Map();
  function rgb(h) { let r = RGB.get(h); if (!r) { const n = parseInt(h.slice(1), 16); r = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; RGB.set(h, r); } return r; }
  function mix(a, b, k) {
    const A = rgb(a), B = rgb(b);
    return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, "0")).join("");
  }
  const CC = new WeakMap();
  function colors(S) {
    let c = CC.get(S.look);
    if (c && c.acc === S.accent) return c;
    const T = S.look.thr, bg = S.look.bg;
    c = { ...T, acc: S.accent, bg, tint: (col, k) => mix(col, bg, k) };
    c.sky = c.tint(T.teal, 0.68); c.blush = c.tint(T.pink, 0.4); c.cloud = c.tint(T.grey, 0.35);
    c.felt = c.tint(T.gold, 0.62); c.leaf = mix(T.green, "#000000", 0.18);
    CC.set(S.look, c);
    return c;
  }
  const CS = (S) => Math.max(8, Math.round(14 * S.u));
  const hoopR = (S) => Math.hypot(S.W, S.H) * 0.455;

  // ---- pixel lettering (5x7), the cross-stitch alphabet --------------------------------------------------
  const FONT = {};
  const def = (ch, rows) => { FONT[ch] = rows.split(" "); };
  def("A", "01110 10001 10001 11111 10001 10001 10001"); def("B", "11110 10001 10001 11110 10001 10001 11110");
  def("C", "01110 10001 10000 10000 10000 10001 01110"); def("D", "11110 10001 10001 10001 10001 10001 11110");
  def("E", "11111 10000 10000 11110 10000 10000 11111"); def("F", "11111 10000 10000 11110 10000 10000 10000");
  def("G", "01110 10001 10000 10111 10001 10001 01111"); def("H", "10001 10001 10001 11111 10001 10001 10001");
  def("I", "01110 00100 00100 00100 00100 00100 01110"); def("J", "00111 00010 00010 00010 00010 10010 01100");
  def("K", "10001 10010 10100 11000 10100 10010 10001"); def("L", "10000 10000 10000 10000 10000 10000 11111");
  def("M", "10001 11011 10101 10101 10001 10001 10001"); def("N", "10001 11001 10101 10011 10001 10001 10001");
  def("O", "01110 10001 10001 10001 10001 10001 01110"); def("P", "11110 10001 10001 11110 10000 10000 10000");
  def("Q", "01110 10001 10001 10001 10101 10010 01101"); def("R", "11110 10001 10001 11110 10100 10010 10001");
  def("S", "01111 10000 10000 01110 00001 00001 11110"); def("T", "11111 00100 00100 00100 00100 00100 00100");
  def("U", "10001 10001 10001 10001 10001 10001 01110"); def("V", "10001 10001 10001 10001 10001 01010 00100");
  def("W", "10001 10001 10001 10101 10101 11011 10001"); def("X", "10001 10001 01010 00100 01010 10001 10001");
  def("Y", "10001 10001 01010 00100 00100 00100 00100"); def("Z", "11111 00001 00010 00100 01000 10000 11111");
  def("0", "01110 10001 10011 10101 11001 10001 01110"); def("1", "00100 01100 00100 00100 00100 00100 01110");
  def("2", "01110 10001 00001 00010 00100 01000 11111"); def("3", "11110 00001 00001 01110 00001 00001 11110");
  def("4", "00010 00110 01010 10010 11111 00010 00010"); def("5", "11111 10000 11110 00001 00001 10001 01110");
  def("6", "00110 01000 10000 11110 10001 10001 01110"); def("7", "11111 00001 00010 00100 01000 01000 01000");
  def("8", "01110 10001 10001 01110 10001 10001 01110"); def("9", "01110 10001 10001 01111 00001 00010 01100");
  def(".", "00 00 00 00 00 11 11"); def(",", "00 00 00 00 00 11 10"); def("!", "1 1 1 1 1 0 1"); def("?", "01110 10001 00001 00110 00100 00000 00100");
  def(":", "0 1 0 0 0 1 0"); def("-", "000 000 000 111 000 000 000"); def("'", "1 1 0 0 0 0 0"); def("+", "00000 00100 00100 11111 00100 00100 00000");
  def("%", "11001 11010 00010 00100 01000 01011 10011"); def("/", "00001 00001 00010 00100 01000 10000 10000");
  def("&", "01100 10010 10100 01000 10101 10010 01101"); def("(", "01 10 10 10 10 10 01"); def(")", "10 01 01 01 01 01 10");
  def("$", "00100 01111 10100 01110 00101 11110 00100"); def("×", "00000 10001 01010 00100 01010 10001 00000");
  def(" ", "000 000 000 000 000 000 000");
  const glyph = (ch) => FONT[ch] || FONT[" "];
  function tw(str) { let w = 0; for (const ch of str) w += glyph(ch)[0].length + 1; return Math.max(0, w - 1); }
  function wrap(str, maxCells) {
    const out = []; let row = "";
    for (const word of String(str ?? "").toUpperCase().split(/\s+/).filter(Boolean)) {
      const next = row ? row + " " + word : word;
      if (row && tw(next) > maxCells) { out.push(row); row = word; } else row = next;
    }
    if (row) out.push(row);
    return out;
  }

  // ---- stitches: a two-thread cross with twist, highlight and shadow, cached by colour and size ----------
  const SPR = new Map();
  function spr(color, p, v, half) {
    p = Math.round(p * 4) / 4;
    const key = color + p + v + (half ? "h" : "f");
    let s = SPR.get(key);
    if (s) return s;
    const size = Math.ceil(p * 1.7), c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d"), m = p * 0.4;
    const cx = size / 2 + [0, 0.03, -0.03][v] * p, cy = size / 2 + [0, -0.025, 0.03][v] * p;
    const dark = mix(color, "#150c08", 0.34), lite = mix(color, "#ffffff", 0.42);
    const seg = (dir, ox, oy) => { g.beginPath(); g.moveTo(cx - m + ox, cy + dir * m + oy); g.lineTo(cx + m + ox, cy - dir * m + oy); };
    g.lineCap = "round"; g.strokeStyle = "rgba(20,10,5,0.3)"; g.lineWidth = p * 0.34;
    seg(1, p * 0.05, p * 0.09); g.stroke();
    if (!half) { seg(-1, p * 0.05, p * 0.09); g.stroke(); }
    const one = (dir, tone) => {
      g.lineCap = "round"; g.lineWidth = p * 0.37; g.strokeStyle = dark; seg(dir, 0, 0); g.stroke();
      g.lineWidth = p * 0.29; g.strokeStyle = tone; seg(dir, 0, 0); g.stroke();
      g.lineCap = "butt"; g.setLineDash([p * 0.04, p * 0.1]); g.lineWidth = p * 0.27; g.strokeStyle = "rgba(10,5,0,0.17)"; seg(dir, 0, 0); g.stroke(); g.setLineDash([]);
      g.lineCap = "round"; g.lineWidth = Math.max(1, p * 0.075); g.strokeStyle = lite; seg(dir, -dir * p * 0.05, -p * 0.05); g.stroke();
    };
    one(1, color);
    if (!half) one(-1, mix(color, "#ffffff", 0.08));
    SPR.set(key, c);
    return c;
  }
  const vOf = (x, y, p) => fmod(Math.round(x / p) * 7 + Math.round(y / p) * 13, 3);
  function put(g, x, y, color, p, half) {
    const s = spr(color, p, vOf(x, y, p), half);
    g.drawImage(s, Math.round(x - (s.width - p) / 2), Math.round(y - (s.height - p) / 2));
  }
  function textNow(g, str, x, y, p, color, o = {}) {
    str = String(str).toUpperCase();
    const total = tw(str), w = total * p, q = o.q ?? 1;
    let cx = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x, col = 0;
    for (const ch of str) {
      const rows = glyph(ch);
      for (let r = 0; r < rows.length; r++) for (let k = 0; k < rows[r].length; k++) {
        if (rows[r][k] === "1" && col + k < q * total) put(g, cx + (col + k) * p, y + r * p, color, p, false);
      }
      col += rows[0].length + 1;
    }
    return w;
  }

  // ---- pattern charts: groups of stitches, revealed in order over a window of the scene's progress -----
  function newPat(def0) {
    const P = { groups: [] };
    let G = null, M = null;
    P.setDef = (pitch, ox, oy) => { def0 = { pitch, ox, oy }; };
    P.group = (t0, t1, o = {}) => {
      G = { t0, t1, p: o.pitch || def0.pitch, ox: o.ox ?? def0.ox, oy: o.oy ?? def0.oy, items: [], order: o.order || "row", move: o.move, show: o.show, clip: o.clip, lead: o.lead !== false, cx: o.cx || 0, cy: o.cy || 0 };
      M = new Map(); P.groups.push(G);
      return G;
    };
    P.c = (i, j, col) => {
      if (!G || !col) return;
      i = Math.round(i); j = Math.round(j);
      const k = i + "|" + j, at = M.get(k);
      if (at !== undefined) G.items[at][2] = col; else { M.set(k, G.items.length); G.items.push([i, j, col]); }
    };
    P.rect = (i, j, w, h, col) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) P.c(i + x, j + y, col); };
    P.frame = (i, j, w, h, col, th = 1) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < th || y < th || x >= w - th || y >= h - th) P.c(i + x, j + y, col); };
    P.disc = (ci, cj, r, col, fn) => { const R = Math.ceil(r); for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) if (x * x + y * y <= r * r) P.c(ci + x, cj + y, fn ? fn(x, y) : col); };
    P.ring = (ci, cj, r, col, th = 1) => { const R = Math.ceil(r); for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) { const d = Math.hypot(x, y); if (d <= r && d > r - th) P.c(ci + x, cj + y, col); } };
    P.line = (i0, j0, i1, j1, col, dash) => {
      i0 = Math.round(i0); j0 = Math.round(j0); i1 = Math.round(i1); j1 = Math.round(j1);
      const dx = Math.abs(i1 - i0), dy = -Math.abs(j1 - j0), sx = i0 < i1 ? 1 : -1, sy = j0 < j1 ? 1 : -1;
      let err = dx + dy, n = 0;
      for (;;) {
        if (!dash || n % (dash[0] + dash[1]) < dash[0]) P.c(i0, j0, col);
        if (i0 === i1 && j0 === j1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; i0 += sx; }
        if (e2 <= dx) { err += dx; j0 += sy; }
        n++;
      }
    };
    P.bmp = (rows, pal, i, j, o = {}) => {
      const s = o.scale || 1;
      rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          const col = pal[row[x]];
          if (!col) continue;
          const xx = o.flip ? row.length - 1 - x : x;
          P.rect(i + xx * s, j + y * s, s, s, col);
        }
      });
    };
    // Lettering; `color` may be a list that cycles word by word.
    P.text = (str, i, j, color, align) => {
      str = String(str).toUpperCase();
      const w = tw(str);
      let x = align === "center" ? i - Math.floor(w / 2) : align === "right" ? i - w : i, word = 0;
      for (const ch of str) {
        const rows = glyph(ch);
        if (ch === " ") { word++; x += rows[0].length + 1; continue; }
        const col = Array.isArray(color) ? color[word % color.length] : color;
        for (let r = 0; r < rows.length; r++) for (let k = 0; k < rows[r].length; k++) if (rows[r][k] === "1") P.c(x + k, j + r, col);
        x += rows[0].length + 1;
      }
      return w;
    };
    P.done = () => {
      const mx = Math.max(1, ...P.groups.map((g) => g.t1));
      if (mx > 1) for (const g of P.groups) { g.t0 /= mx; g.t1 /= mx; }
      for (const g of P.groups) {
        const o = g.order, it = g.items;
        const key = o === "col" ? (a, b) => a[0] - b[0] || a[1] - b[1] : o === "up" ? (a, b) => b[1] - a[1] || a[0] - b[0]
          : o === "diag" ? (a, b) => a[0] + a[1] - (b[0] + b[1]) || a[0] - b[0]
          : o === "rad" ? (a, b) => Math.hypot(a[0] - g.cx, a[1] - g.cy) - Math.hypot(b[0] - g.cx, b[1] - g.cy)
          : o === "none" ? () => 0 : (a, b) => a[1] - b[1] || a[0] - b[0];
        it.sort(key);
        g.n = it.length;
        g.x = it.map((s) => g.ox + s[0] * g.p); g.y = it.map((s) => g.oy + s[1] * g.p); g.col = it.map((s) => s[2]);
        g.sf = it.map((s, k) => spr(s[2], g.p, vOf(g.x[k], g.y[k], g.p), false));
        g.sh = it.map((s, k) => spr(s[2], g.p, vOf(g.x[k], g.y[k], g.p), true));
        g.off = g.n ? (g.sf[0].width - g.p) / 2 : 0;
        g.items = null;
      }
      return P;
    };
    return P;
  }

  // Draw a chart up to progress pp. Returns the stitch the needle is working on.
  function drawPat(g, pat, pp, t, ghost) {
    let lead = null;
    for (const G of pat.groups) {
      const n = G.n;
      if (!n) continue;
      const prog = span(pp, G.t0, G.t1), f = prog * n;
      if (G.show && !G.show(t)) continue;
      if (prog <= 0 && !ghost) continue;
      let dx = 0, dy = 0;
      if (G.move) { const m = G.move(t); dx = Math.round(m[0]); dy = Math.round(m[1]); }
      const p = G.p, off = G.off, clip = G.clip;
      let last = "";
      for (let k = 0; k < n; k++) {
        const x = G.x[k] + dx, y = G.y[k] + dy, m = f - k;
        if (clip && !clip(x + p / 2, y + p / 2)) continue;
        if (m <= 0) {
          if (!ghost) break;
          if (G.col[k] !== last) { g.fillStyle = G.col[k]; last = G.col[k]; }
          g.globalAlpha = 0.17;
          g.fillRect(x + p * 0.27, y + p * 0.27, p * 0.46, p * 0.46);
          g.globalAlpha = 1;
          continue;
        }
        g.drawImage(m < 0.5 ? G.sh[k] : G.sf[k], Math.round(x - off), Math.round(y - off));
      }
      if (G.lead && prog > 0 && f < n + 0.5 && !(G.move)) {
        const k = Math.min(n - 1, Math.floor(f));
        lead = { x: G.x[k] + G.p / 2, y: G.y[k] + G.p / 2, color: G.col[k], done: prog >= 1 };
      }
    }
    return lead;
  }

  // ---- the hoop, the table, the cloth ------------------------------------------------------------------
  let cloth = null, clothKey = "", mottle = null, mottleKey = "", table = null, tableKey = "";
  const pats = new WeakMap();
  function clothTile(S) {
    const cs = CS(S), tex = 0.4 + 0.6 * S.look.texture, key = [S.look.bg, cs, tex].join();
    if (cloth && key === clothKey) return cloth;
    clothKey = key;
    const cols = 48, rows = 32, c = document.createElement("canvas");
    c.width = cols * cs; c.height = rows * cs;
    const g = c.getContext("2d"), r = rng(77), bg = S.look.bg, dk = mix(bg, "#000000", 0.4 * tex);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const v = (r() - 0.5) * 0.09 * tex, x = i * cs, y = j * cs;
      g.fillStyle = mix(bg, v > 0 ? "#ffffff" : "#000000", Math.abs(v)); g.fillRect(x, y, cs, cs);
      // The woven block: lighter threads crossing, with a hole at each corner.
      g.fillStyle = mix(bg, "#ffffff", 0.16 * tex); g.fillRect(x + cs * 0.14, y + cs * 0.1, cs * 0.72, cs * 0.34);
      g.fillStyle = mix(bg, "#000000", 0.05 * tex); g.fillRect(x + cs * 0.1, y + cs * 0.56, cs * 0.8, cs * 0.3);
      g.fillStyle = dk; const h = Math.max(1.4, cs * 0.12);
      g.fillRect(x - h / 2, y - h / 2, h, h);
      g.fillStyle = mix(bg, "#000000", 0.14 * tex); g.fillRect(x + cs * 0.1, y, cs * 0.04, cs); g.fillRect(x, y + cs * 0.5, cs, cs * 0.04);
    }
    g.lineWidth = 1;
    for (let k = 0; k < 220; k++) {
      const x = r() * c.width, y = r() * c.height, a = r() < 0.5 ? 0 : Math.PI / 2, l = (5 + r() * 12) * cs / 14;
      g.strokeStyle = r() < 0.5 ? `rgba(255,255,255,${0.2 * tex})` : `rgba(60,40,20,${0.12 * tex})`;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    return (cloth = c);
  }
  function mottleLayer(S) {
    const key = [S.W, S.H, S.look.bg, S.look.texture].join();
    if (mottle && key === mottleKey) return mottle;
    mottleKey = key;
    const c = document.createElement("canvas"); c.width = S.W; c.height = S.H;
    const g = c.getContext("2d"), r = rng(5), tex = S.look.texture;
    for (let k = 0; k < 26; k++) {
      const x = r() * S.W, y = r() * S.H, rad = (120 + r() * 380) * S.u, lite = r() < 0.5;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, lite ? `rgba(255,252,240,${0.1 * tex})` : `rgba(110,80,40,${0.07 * tex})`); gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    const Ri = hoopR(S), cx = S.W / 2, cy = S.H / 2;
    const v = g.createRadialGradient(cx, cy, Ri * 0.66, cx, cy, Ri);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, `rgba(30,18,6,${0.1 + 0.2 * tex})`);
    g.fillStyle = v; g.fillRect(0, 0, S.W, S.H);
    return (mottle = c);
  }
  function tableLayer(S) {
    const key = [S.W, S.H, S.look.table].join();
    if (table && key === tableKey) return table;
    tableKey = key;
    const c = document.createElement("canvas"); c.width = S.W; c.height = S.H;
    const g = c.getContext("2d"), r = rng(31), base = S.look.table;
    g.fillStyle = base; g.fillRect(0, 0, S.W, S.H);
    for (let k = 0; k < 340; k++) {
      const y = r() * S.H, x = r() * S.W, l = (200 + r() * 700) * S.u;
      g.strokeStyle = r() < 0.5 ? mix(base, "#000000", 0.1 + r() * 0.2) : mix(base, "#ffffff", 0.05 + r() * 0.08);
      g.globalAlpha = 0.5; g.lineWidth = (0.6 + r() * 2) * S.u;
      g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + l * 0.3, y + (r() - 0.5) * 14 * S.u, x + l * 0.6, y + (r() - 0.5) * 14 * S.u, x + l, y + (r() - 0.5) * 6 * S.u); g.stroke();
    }
    g.globalAlpha = 1;
    return (table = c);
  }
  function hoopRing(g, S) {
    const { W, H, u } = S, cx = W / 2, cy = H / 2, Ri = hoopR(S), Ro = Ri + 54 * u, w = S.look.wood;
    g.save();
    g.shadowColor = "rgba(0,0,0,0.55)"; g.shadowBlur = 34 * u; g.shadowOffsetY = 16 * u;
    g.fillStyle = "#000"; g.beginPath(); g.arc(cx, cy, Ro, 0, TAU); g.arc(cx, cy, Ri, 0, TAU, true); g.fill("evenodd");
    g.restore();
    const gr = g.createRadialGradient(cx, cy, Ri, cx, cy, Ro);
    gr.addColorStop(0, mix(w, "#000000", 0.5)); gr.addColorStop(0.1, mix(w, "#ffffff", 0.34)); gr.addColorStop(0.3, mix(w, "#ffffff", 0.14));
    gr.addColorStop(0.62, w); gr.addColorStop(0.9, mix(w, "#000000", 0.32)); gr.addColorStop(1, mix(w, "#000000", 0.6));
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, Ro, 0, TAU); g.arc(cx, cy, Ri, 0, TAU, true); g.fill("evenodd");
    const r = rng(8);
    g.lineWidth = Math.max(1, 1.2 * u);
    for (let k = 0; k < 90; k++) {
      const rad = Ri + (0.1 + 0.8 * r()) * (Ro - Ri), a0 = r() * TAU, l = (0.04 + r() * 0.2);
      g.strokeStyle = r() < 0.5 ? "rgba(70,40,10,0.18)" : "rgba(255,240,200,0.14)";
      g.beginPath(); g.arc(cx, cy, rad, a0, a0 + l); g.stroke();
    }
    g.strokeStyle = "rgba(255,245,215,0.55)"; g.lineWidth = 2 * u; g.beginPath(); g.arc(cx, cy, Ri + 1.5 * u, 0, TAU); g.stroke();
    // The tightening screw and its brass bracket.
    const th = S.tall ? -1.08 : S.W > S.H * 1.15 ? -0.49 : -0.8;
    g.save(); g.translate(cx, cy); g.rotate(th);
    const bg2 = g.createLinearGradient(0, -30 * u, 0, 30 * u);
    bg2.addColorStop(0, "#f1d98c"); bg2.addColorStop(0.5, "#b88a2c"); bg2.addColorStop(1, "#6e4e14");
    g.fillStyle = bg2; g.strokeStyle = "rgba(60,35,5,0.7)"; g.lineWidth = 2 * u;
    g.beginPath(); g.rect(Ri - 8 * u, -30 * u, Ro - Ri + 56 * u, 60 * u); g.fill(); g.stroke();
    g.fillStyle = "#a07722"; g.beginPath(); g.arc(Ro + 28 * u, 0, 22 * u, 0, TAU); g.fill(); g.stroke();
    g.strokeStyle = "rgba(40,25,5,0.8)"; g.lineWidth = 4 * u; g.beginPath(); g.moveTo(Ro + 14 * u, -9 * u); g.lineTo(Ro + 42 * u, 9 * u); g.stroke();
    g.restore();
  }
  function clipHoop(g, S) { g.beginPath(); g.arc(S.W / 2, S.H / 2, hoopR(S) - 3 * S.u, 0, TAU); g.clip(); }

  // ---- the needle, its thread, and the second needle that sews a seam --------------------------------
  function needle(g, S, x, y, color, t, alpha, busy) {
    const u = S.u, dirx = 0.616, diry = -0.788, L = 150 * u, jab = busy ? Math.sin(t * 28) * 6 * u : 0;
    const tx = x - dirx * jab, ty = y - diry * jab, ex = tx + dirx * L, ey = ty + diry * L;
    g.save(); g.globalAlpha *= alpha; g.lineCap = "round";
    const ax = S.W + 120 * u, ay = ey + (S.H - ey) * 0.5 + 60 * u;
    const sag = 90 * u + 30 * u * Math.sin(t * 2.2 + x * 0.01);
    g.strokeStyle = "rgba(20,10,5,0.25)"; g.lineWidth = 7 * u;
    g.beginPath(); g.moveTo(ex + 5 * u, ey + 8 * u); g.quadraticCurveTo((ex + ax) / 2 + 5 * u, Math.max(ey, ay) + sag + 8 * u, ax, ay + 8 * u); g.stroke();
    g.strokeStyle = mix(color, "#150c08", 0.3); g.lineWidth = 6.5 * u;
    g.beginPath(); g.moveTo(ex, ey); g.quadraticCurveTo((ex + ax) / 2, Math.max(ey, ay) + sag, ax, ay); g.stroke();
    g.strokeStyle = color; g.lineWidth = 4.2 * u; g.stroke();
    g.strokeStyle = mix(color, "#ffffff", 0.45); g.lineWidth = 1.3 * u; g.stroke();
    g.strokeStyle = "rgba(20,10,5,0.28)"; g.lineWidth = 8 * u;
    g.beginPath(); g.moveTo(tx + 5 * u, ty + 9 * u); g.lineTo(ex + 5 * u, ey + 9 * u); g.stroke();
    const ng = g.createLinearGradient(tx, ty, ex, ey);
    ng.addColorStop(0, "#8f95a3"); ng.addColorStop(0.35, "#f4f6fb"); ng.addColorStop(0.7, "#aeb4c2"); ng.addColorStop(1, "#7a8090");
    g.strokeStyle = ng; g.lineWidth = 7.5 * u; g.beginPath(); g.moveTo(tx, ty); g.lineTo(ex, ey); g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.7)"; g.lineWidth = 1.6 * u; g.beginPath(); g.moveTo(tx + dirx * 8 * u, ty + diry * 8 * u); g.lineTo(ex - dirx * 22 * u, ey - diry * 22 * u); g.stroke();
    g.fillStyle = "rgba(40,30,30,0.85)"; g.beginPath(); g.ellipse(ex - dirx * 14 * u, ey - diry * 14 * u, 2.2 * u, 7 * u, 0.65, 0, TAU); g.fill();
    g.restore();
  }

  // The seam: a running stitch along the foot of the piece, sewn lap after lap by a second needle.
  function seam(g, S, t) {
    const { W, H, u } = S, cs = CS(S), p = cs / 2, C = colors(S), y = Math.round((H - 58 * u) / p) * p;
    const x0 = Math.round(Math.max(110 * u, 0) / p) * p, n = Math.floor((W - 2 * x0) / p), gap = 22, rate = 26;
    const clock = t * rate, lap = Math.floor(clock / (n + gap)), cur = clock - lap * (n + gap);
    const cyc = [C.teal, C.gold, C.plum, C.orange];
    const colorOf = (L) => cyc[fmod(L, cyc.length)];
    for (let k = 0; k < n; k++) {
      if (k % 7 > 4) continue;
      const done = k < cur;
      if (!done && lap === 0) { g.globalAlpha = 0.17; g.fillStyle = C.grey; g.fillRect(x0 + k * p + p * 0.27, y + p * 0.27, p * 0.46, p * 0.46); g.globalAlpha = 1; continue; }
      put(g, x0 + k * p, y, done ? colorOf(lap) : colorOf(lap - 1), p, false);
    }
    return { x: x0 + Math.min(cur, n) * p, y: y + p / 2, color: colorOf(lap), live: cur < n };
  }

  // A border of diamonds whose colours chase around the hoop.
  function border(g, S, t) {
    const { W, H, u } = S, cs = CS(S), p = cs / 2, C = colors(S), ph = Math.floor(t * 2.4);
    const cyc = [C.red, C.gold, C.teal, C.plum];
    const diamond = (x, y, m, vertical) => {
      const col = cyc[fmod(m - ph, 4)];
      const cell = (a, b, c2) => put(g, vertical ? x + b * p : x + a * p, vertical ? y + a * p : y + b * p, c2, p, false);
      cell(2, 0, col); cell(1, 1, col); cell(3, 1, col); cell(2, 2, col); cell(2, 1, C.white);
    };
    const top = Math.round(26 * u / p) * p, bot = Math.round((H - 26 * u) / p) * p - 3 * p, lx = Math.round(26 * u / p) * p, rx = Math.round((W - 26 * u) / p) * p - 3 * p;
    for (let x = Math.round(70 * u / p) * p, m = 0; x < W - 60 * u; x += 4 * p, m++) { diamond(x, top, m, false); diamond(x, bot, m, false); }
    for (let y = Math.round(150 * u / p) * p, m = 0; y < H - 130 * u; y += 4 * p, m++) { diamond(lx, y, m + 1, true); diamond(rx, y, m + 2, true); }
  }

  // Loose fibres drifting over the cloth.
  function fibers(g, S, t) {
    const r = rng(404), { W, H, u } = S, C = colors(S), tex = S.look.texture;
    const keys = [C.red, C.gold, C.teal, C.grey, C.plum];
    g.save(); g.lineCap = "round";
    for (let k = 0; k < Math.round(16 * tex); k++) {
      const x0 = r() * W, y0 = r() * H, vx = (6 + r() * 14) * u, vy = (r() - 0.5) * 8 * u, ph = r() * TAU, col = keys[k % keys.length], l = (26 + r() * 34) * u, a = r() * TAU;
      const x = fmod(x0 + t * vx, W + 120 * u) - 60 * u, y = y0 + t * vy + Math.sin(t * 0.9 + ph) * 18 * u, wob = Math.sin(t * 1.4 + ph) * 12 * u;
      g.strokeStyle = col; g.globalAlpha = 0.55; g.lineWidth = 1.7 * u;
      g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + Math.cos(a) * l * 0.4, y + wob, x + Math.cos(a) * l * 0.7, y - wob, x + Math.cos(a) * l, y + Math.sin(a) * l * 0.3); g.stroke();
    }
    g.restore();
  }

  // ---- small drawings -------------------------------------------------------------------------------
  const FLOWER = [".ppp.", "ppypp", "pyyyp", "ppypp", ".ppp."];
  const FLOWER7 = ["..ppp..", ".ppppp.", "pppyppp", "ppyyypp", "pppyppp", ".ppppp.", "..ppp.."];
  const HEART = [".rr...rr.", "rWrr.rrrr", "rrrrrrrrr", "rrrrrrrrr", ".rrrrrrr.", "..rrrrr..", "...rrr...", "....r...."];
  const STAR = ["...y...", "...y...", "..yyy..", "yyyyyyy", "..yyy..", "...y...", "...y..."];
  const LADY = ["..kkk..", ".rkrkr.", "rrrkrrr", "rkrrrkr", ".rrkrr."];
  const FLY_OPEN = ["bb...bb", "bbb.bbb", ".bbkbb.", "bbb.bbb", "bb...bb"];
  const FLY_SHUT = ["..b.b..", "..bkb..", "..bkb..", "..bkb..", "...k..."];
  const CLOUD = ["....www.....", "..wwwwwww.ww", ".wwwwwwwwwww", "wwwwwwwwwwww", ".wwwwwwwwww."];
  const CUP = ["cccccc...", "cccccc.hh", "cccccc..h", "cccccc.hh", ".cccc...."];
  const SCISSORS_OPEN = ["..........ss", ".........ss.", "........ss..", "..oo...ss...", ".o..o.ss....", ".o..oss.....", ".o..oo......", "..oo.sss....", "......sss...", ".......sss..", "........sss."];
  const SCISSORS_SHUT = ["...........s", "..........ss", "..oo....sss.", ".o..o.sss...", ".o..osss....", ".o..ooo.....", "..oo.ss.....", "......s.....", "............", "............", "............"];
  const hash = (a, b) => fmod(Math.imul(a + 17, 73856093) ^ Math.imul(b + 91, 19349663), 1000) / 1000;

  // A row of flowers on stems along the foot of a scene: stems and leaves are fixed, the heads sway.
  function meadow(P, C, ox, oy, cs, i0, i1, jb, t0, t1, seed) {
    const r = rng(seed), list = [], heads = [C.pink, C.gold, C.red, C.plum, C.orange, C.acc];
    for (let i = i0 + 1; i < i1 - 5; i += 5 + Math.floor(r() * 3)) list.push({ i, h: 3 + Math.floor(r() * 5), col: heads[Math.floor(r() * heads.length)] });
    P.group(t0, t1, { ox, oy, pitch: cs, order: "up", lead: false });
    for (let i = i0; i < i1; i++) { P.c(i, jb, C.green); if (hash(i, seed) > 0.55) P.c(i, jb - 1, C.leaf); }
    list.forEach((f) => {
      for (let k = 1; k <= f.h; k++) P.c(f.i + 1, jb - k, C.green);
      P.c(f.i, jb - 2, C.leaf); P.c(f.i + 2, jb - 3, C.leaf); P.c(f.i - 1, jb - 2, C.leaf); P.c(f.i + 3, jb - 3, C.leaf);
    });
    [0, 1].forEach((alt) => {
      P.group(t0, t1, { ox, oy, pitch: cs, order: "up", lead: false, show: (t) => (Math.floor(t * 1.7) % 2 === alt) });
      list.forEach((f) => P.bmp(FLOWER, { p: f.col, y: C.white }, f.i - 1 + alt, jb - f.h - 5, {}));
    });
  }

  // A swag of little flags on a string, fluttering in two beats.
  function bunting(P, C, ox, oy, cs, i0, i1, j0, amp, t0, t1) {
    const n = i1 - i0, swag = (i) => j0 + Math.round(Math.sin(((i - i0) / n) * Math.PI) * amp), flags = [C.red, C.gold, C.teal, C.pink, C.plum, C.orange];
    P.group(t0, t1, { ox, oy, pitch: cs / 2, order: "col", lead: false });
    for (let i = i0 * 2; i < i1 * 2; i++) P.c(i, 2 * swag(i / 2), C.ink);
    [0, 1].forEach((alt) => {
      P.group(t0, t1, { ox, oy, pitch: cs, order: "col", lead: false, show: (t) => Math.floor(t * 1.9) % 2 === alt });
      for (let f = i0 + 2, k = 0; f < i1 - 2; f += 5, k++) {
        const top = swag(f) + 1, col = flags[k % flags.length];
        for (let y = 0; y < 3; y++) for (let x = 0; x < 4 - y; x++) P.c(f + x + (y > 1 ? alt : 0), top + y, col);
      }
    });
  }

  // A small person, 14 cells wide and 24 tall, from skin, hair, shirt and trousers.
  function person(P, C, i, j, o, bobbing, t0, t1, hot) {
    const grp = (extra) => P.group(t0, t1, { order: "row", move: bobbing, ...extra });
    const sk = o.skin, hr = o.hair, sh = o.shirt, pn = o.pants, sh2 = mix(sh, "#ffffff", 0.3);
    grp({ lead: true });
    for (let y = 0; y < 10; y++) for (let x = 0; x < 14; x++) { const dx = (x - 6.5) / 4.7, dy = (y - 5) / 4.9; if (dx * dx + dy * dy <= 1) P.c(i + x, j + y, sk); }
    const style = o.style;
    for (let y = 0; y < 10; y++) for (let x = 0; x < 14; x++) {
      const dx = (x - 6.5) / 4.7, dy = (y - 5) / 4.9;
      if (dx * dx + dy * dy > 1) continue;
      if (style === 4) { if (y <= 1) P.c(i + x, j + y, o.hat); continue; }
      if (y <= 2 || (y === 3 && (x <= 3 || x >= 10))) P.c(i + x, j + y, hr);
    }
    if (style === 1) for (let y = 4; y < 13; y++) { P.c(i + 2, j + y, hr); P.c(i + 3, j + y, hr); P.c(i + 10, j + y, hr); P.c(i + 11, j + y, hr); }
    if (style === 2) P.disc(i + 6.5, j - 1, 2.3, hr);
    if (style === 3) for (let a = 0; a < 14; a++) P.c(i + 6.5 + Math.cos(a / 14 * TAU) * 6, j + 4.5 + Math.sin(a / 14 * TAU) * 6 - 0.5, hr);
    if (style === 4) { P.rect(i + 1, j + 2, 12, 1, o.hat); P.rect(i + 10, j + 3, 4, 1, o.hat); }
    P.c(i + 6, j + 10, sk); P.c(i + 7, j + 10, sk);
    for (let y = 11; y <= 18; y++) for (let x = 3; x < 11; x++) P.c(i + x, j + y, (y - 11) % 3 === 2 ? sh2 : sh);
    P.c(i + 6, j + 11, C.white); P.c(i + 7, j + 11, C.white);
    for (let y = 11; y <= 16; y++) { const c2 = y <= 14 ? sh : sk; P.c(i + 1, j + y, c2); P.c(i + 2, j + y, c2); if (!hot) { P.c(i + 11, j + y, c2); P.c(i + 12, j + y, c2); } }
    for (let y = 19; y <= 22; y++) { for (let x = 3; x <= 5; x++) P.c(i + x, j + y, pn); for (let x = 8; x <= 10; x++) P.c(i + x, j + y, pn); }
    for (let x = 2; x <= 5; x++) P.c(i + x, j + 23, C.ink); for (let x = 8; x <= 11; x++) P.c(i + x, j + 23, C.ink);
    P.c(i + 3, j + 7, C.blush); P.c(i + 10, j + 7, C.blush); P.c(i + 5, j + 7, C.ink); P.c(i + 8, j + 7, C.ink); P.c(i + 6, j + 8, C.ink); P.c(i + 7, j + 8, C.ink);
    // Eyes blink; the highlighted figure waves.
    P.group(t0, t1, { order: "row", move: bobbing, lead: false, show: (t) => fmod(t + o.ph, 4.2) > 0.2 });
    P.c(i + 4, j + 5, C.ink); P.c(i + 9, j + 5, C.ink); P.c(i + 4, j + 4, C.white); P.c(i + 9, j + 4, C.white);
    P.group(t0, t1, { order: "row", move: bobbing, lead: false, show: (t) => fmod(t + o.ph, 4.2) <= 0.2 });
    P.c(i + 3, j + 5, C.ink); P.c(i + 4, j + 5, C.ink); P.c(i + 9, j + 5, C.ink); P.c(i + 10, j + 5, C.ink);
    if (hot) {
      [0, 1].forEach((alt) => {
        P.group(t0, t1, { order: "row", move: bobbing, lead: false, show: (t) => (Math.floor(t * 2.6) % 2 === alt) });
        if (alt) for (let y = 3; y <= 12; y++) { const c2 = y <= 6 ? sk : sh; P.c(i + 12, j + y, c2); P.c(i + 13, j + y, c2); }
        else for (let y = 11; y <= 16; y++) { const c2 = y <= 14 ? sh : sk; P.c(i + 11, j + y, c2); P.c(i + 12, j + y, c2); }
      });
    }
  }

  // ---- scene layout ------------------------------------------------------------------------------------
  function layout(S, box) {
    const cs = CS(S), ox = Math.round(box.x / cs) * cs, oy = Math.round(box.y / cs) * cs;
    return { cs, ox, oy, nx: Math.floor((box.x + box.w - ox) / cs), ny: Math.floor((box.y + box.h - oy) / cs), tall: box.h > box.w, lp: cs * 0.62 };
  }
  const boxTop = (S) => (S.tall ? S.H * 0.3 : S.H * 0.34);

  // ---- chart: ribbons of woven stripes growing from the ground, with sprouts between ----------------------
  function chartPat(S, L, d) {
    const { cs, nx, ny, ox, oy, lp } = L, C = colors(S), half = cs / 2;
    const P = newPat({ ox, oy, pitch: cs });
    const n = d.values.length, max = Math.max(...d.values, 1);
    const yb = ny - 7, maxH = yb - 11, slot = nx / n, bw = clamp(Math.floor(slot * 0.5), 8, 18);
    const cols = [C.teal, C.gold, C.orange, C.plum, C.green, C.pink];
    const bars = d.values.map((v, i) => ({ v, i, h: Math.max(4, Math.round((maxH * Math.max(0, v)) / max)), left: Math.round(slot * i + (slot - bw) / 2), t0: 0.1 + i * 0.15, t1: 0.1 + i * 0.15 + 0.3 }));
    P.group(0, 0.22, { pitch: half, order: "col", lead: false });
    for (const f of [0.34, 0.67, 1]) P.line(0, 2 * (yb - Math.round(maxH * f)) + 1, 2 * nx, 2 * (yb - Math.round(maxH * f)) + 1, C.grey, [1, 2]);
    P.group(0, 0.3, { pitch: half, order: "col", lead: false });
    P.line(0, 2 * yb + 1, 2 * nx, 2 * yb + 1, C.ink);
    bars.forEach((b) => { const c0 = 2 * (b.left + Math.floor(bw / 2)); P.line(c0, 2 * yb + 2, c0, 2 * yb + 5, C.ink); });
    bars.forEach((b) => {
      const hot = b.i === d.highlight, A = hot ? C.acc : cols[b.i % cols.length], D = mix(A, "#120a06", 0.28), Lt = mix(A, "#ffffff", 0.4);
      P.group(b.t0, b.t1, { order: "up" });
      for (let y = 0; y < b.h; y++) for (let x = 0; x < bw; x++) {
        const edge = x === 0 || x === bw - 1 || y === b.h - 1;
        const pat = hot ? (x % 4 === 2 && y % 4 === 1 ? C.white : A) : ((x + y) % 6 < 3 ? Lt : A);
        P.c(b.left + x, yb - 1 - y, edge ? D : pat);
      }
      const lab = String(d.labels[b.i] ?? "");
      P.group(b.t0 + 0.25, b.t1 + 0.3, { pitch: lp, ox: ox + (b.left + bw / 2) * cs, oy: oy + (yb + 2) * cs, order: "col" });
      P.text(lab, 0, 0, hot ? C.acc : C.ink, "center");
    });
    P.group(0.4, 0.9, { order: "up", lead: false });
    for (let i = 0; i < nx; i++) if (hash(i, 3) > 0.45) { P.c(i, yb - 1, C.green); if (hash(i, 8) > 0.6) P.c(i, yb - 2, C.leaf); }
    // Sprouts in the gaps between the bars.
    const sp = [];
    for (let i = 1; i < n; i++) { const cx = Math.round(slot * i), h = 4 + (i * 3) % 3; sp.push({ cx, h, col: [C.pink, C.red, C.gold][i % 3] }); }
    P.group(0.5, 0.95, { order: "up", lead: false });
    sp.forEach((s) => { for (let k = 1; k <= s.h; k++) P.c(s.cx, yb - 1 - k, C.green); P.c(s.cx - 1, yb - 3, C.leaf); P.c(s.cx + 1, yb - 4, C.leaf); });
    [0, 1].forEach((alt) => {
      P.group(0.5, 0.95, { order: "up", lead: false, show: (t) => (Math.floor(t * 1.8) % 2 === alt) });
      sp.forEach((s) => P.bmp(FLOWER, { p: s.col, y: C.white }, s.cx - 2 + alt, yb - 1 - s.h - 5, {}));
    });
    P.done(); P.bars = bars; P.meta = { yb, bw, n, slot };
    return P;
  }
  function chartDyn(g, S, L, pp, t, d, P) {
    const { cs, nx, ny, ox, oy } = L, C = colors(S), { yb, bw } = P.meta;
    const dec = d.values.some((v) => Math.abs(v % 1) > 0.001) ? 1 : 0;
    P.bars.forEach((b) => {
      const q = span(pp, b.t0, b.t1);
      if (q <= 0) return;
      const hot = b.i === d.highlight, top = yb - Math.round(b.h * ease(q));
      const bounce = hot && q >= 1 ? Math.round(Math.sin(t * 4.4) * 0.5 + 0.5) * -cs * 0.5 : 0;
      textNow(g, window.DreamcutMotion.formatNumber(b.v * ease(q), dec, d.prefix || "", d.suffix || ""), ox + (b.left + bw / 2) * cs, oy + (top - 9) * cs + bounce, cs, hot ? C.acc : C.ink, { align: "center" });
      if (hot && q >= 1) for (let k = 0; k < 6; k++) {
        const a = t * 1.5 + (k * TAU) / 6, rx = (bw / 2 + 4) * cs, ry = 6 * cs;
        put(g, ox + (b.left + bw / 2) * cs + Math.cos(a) * rx - 2 * cs, oy + (top - 6) * cs + Math.sin(a) * ry - 2 * cs, k % 2 ? C.gold : C.pink, cs * 0.5, false);
      }
    });
    // A ladybug crossing the foot of the chart and a butterfly over it.
    const lx = fmod(t * 3.4, nx + 12) - 6;
    if (pp > 0.6) {
      const hop = Math.floor(t * 6) % 2;
      const P2 = newPat({ ox, oy, pitch: cs * 0.7 });
      P2.group(0, 1); P2.bmp(LADY, { k: C.ink, r: C.red }, 0, 0); P2.done();
      drawPat(g, { groups: P2.groups.map((G) => ({ ...G, x: G.x.map((x) => x + ox + lx * cs), y: G.y.map((y) => y + oy + (yb - 4 + hop * 0.3) * cs) })) }, 1, t, false);
      const bx = nx * 0.5 + Math.sin(t * 0.55) * nx * 0.34, by = ny * 0.34 + Math.sin(t * 0.93 + 1) * ny * 0.14;
      const P3 = newPat({ ox, oy, pitch: cs * 0.7 });
      P3.group(0, 1); P3.bmp(Math.floor(t * 6) % 2 ? FLY_OPEN : FLY_SHUT, { b: C.orange, k: C.ink }, 0, 0); P3.done();
      drawPat(g, { groups: P3.groups.map((G) => ({ ...G, x: G.x.map((x) => x + ox + Math.round(bx) * cs), y: G.y.map((y) => y + oy + Math.round(by) * cs) })) }, 1, t, false);
    }
    twinkle(g, S, L, t, 14, 21, (i, j) => P.bars.some((b) => i > b.left - 3 && i < b.left + bw + 3 && j > yb - b.h - 11) || j > yb - 1);
  }
  // Sparkles that fade in and out on empty cloth.
  function twinkle(g, S, L, t, count, seed, blocked) {
    const { cs, nx, ny, ox, oy } = L, C = colors(S), r = rng(seed), cyc = [C.gold, C.pink, C.teal, C.white];
    for (let k = 0; k < count; k++) {
      const i = 1 + Math.floor(r() * (nx - 2)), j = 1 + Math.floor(r() * (ny - 2)), ph = r() * TAU, col = cyc[k % 4];
      if (blocked(i, j)) continue;
      const a = Math.max(0, Math.sin(t * 2.1 + ph));
      if (a < 0.12) continue;
      g.save(); g.globalAlpha = a;
      const p = cs * 0.5, x = ox + i * cs, y = oy + j * cs;
      put(g, x, y, col, p, false); put(g, x - p, y, col, p, false); put(g, x + p, y, col, p, false); put(g, x, y - p, col, p, false); put(g, x, y + p, col, p, false);
      g.restore();
    }
  }

  // ---- object: a laptop (or phone) with a live timeline, callouts and a steaming cup ------------------------
  function objectPat(S, L, d) {
    const { cs, nx, ny, ox, oy, lp, tall } = L, C = colors(S), half = cs / 2, phone = d.kind === "phone";
    const P = newPat({ ox, oy, pitch: cs });
    let dw, dh, i0, j0;
    if (phone) { dw = 20; dh = tall ? 44 : 34; i0 = tall ? Math.round((nx - dw) / 2) : 16; j0 = 1; }
    else { dw = tall ? Math.min(nx - 8, 46) : 58; dh = tall ? Math.round(dw * 0.58) : 33; i0 = tall ? Math.round((nx - dw) / 2) : 2; j0 = 1; }
    const sx = i0 + 2, sy = j0 + 2, sw = dw - 4, sh = dh - 4, deskY = j0 + dh + (phone ? 2 : 3);
    // Desk.
    P.group(0, 0.2, { order: "col", lead: false });
    P.rect(0, deskY, nx, 1, mix(C.brown, "#ffffff", 0.3)); P.rect(0, deskY + 1, nx, 3, C.brown);
    // Body.
    P.group(0.05, 0.3, { order: "diag" });
    P.frame(i0, j0, dw, dh, C.ink, 2);
    if (!phone) { P.rect(i0 - 4, j0 + dh, dw + 8, 3, mix(C.grey, "#ffffff", 0.2)); P.rect(i0 + Math.floor(dw / 2) - 5, j0 + dh, 10, 1, C.grey); P.rect(i0 - 4, j0 + dh + 2, dw + 8, 1, mix(C.grey, "#000000", 0.2)); }
    else { P.rect(i0 + Math.floor(dw / 2) - 3, j0 + 1, 6, 1, C.grey); }
    P.group(0.2, 0.5, { order: "row" });
    P.rect(sx, sy, sw, sh, C.white);
    // Screen content.
    const inspW = phone ? 0 : Math.round(sw * 0.27), pvX = phone ? 1 : inspW + 3, pvW = sw - pvX - (phone ? 1 : 2), pvH = Math.round(sh * (phone ? 0.42 : 0.52));
    const tlY = pvH + 4, trk = phone ? 2 : 3;
    P.group(0.4, 0.62, { order: "row" });
    const pvx = sx + pvX, pvy = sy + 2;
    P.rect(pvx, pvy, pvW, pvH, C.sky);
    for (let x = 0; x < pvW; x++) {
      const h1 = Math.round(pvH * 0.62 + Math.sin(x * 0.28) * 1.6), h2 = Math.round(pvH * 0.78 + Math.sin(x * 0.4 + 2) * 1.2);
      for (let y = h1; y < pvH; y++) P.c(pvx + x, pvy + y, mix(C.green, C.sky, 0.35));
      for (let y = h2; y < pvH; y++) P.c(pvx + x, pvy + y, C.green);
    }
    P.frame(pvx - 1, pvy - 1, pvW + 2, pvH + 2, C.ink, 1);
    P.disc(pvx + Math.round(pvW * 0.76), pvy + 4, 2.4, C.gold);
    P.group(0.4, 0.62, { order: "row", lead: false, show: (t) => Math.floor(t * 2) % 2 === 0 });
    const sunI = pvx + Math.round(pvW * 0.76), sunJ = pvy + 4;
    for (const [a, b] of [[0, -4], [0, 4], [-4, 0], [4, 0]]) P.c(sunI + a, sunJ + b, C.gold);
    P.group(0.4, 0.62, { order: "row", lead: false, show: (t) => Math.floor(t * 2) % 2 === 1 });
    for (const [a, b] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) P.c(sunI + a, sunJ + b, C.gold);
    if (!phone) {
      P.group(0.45, 0.65, { order: "row" });
      for (let k = 0; k < 3; k++) { const y = sy + 3 + k * 4; P.rect(sx + 1, y, 6 + (k % 2) * 2, 1, C.ink); P.line(2 * (sx + 1), 2 * (y + 2) + 1, 2 * (sx + inspW - 1), 2 * (y + 2) + 1, C.grey); }
    } else {
      P.group(0.45, 0.65, { order: "row" });
      for (let k = 0; k < 2; k++) { const y = sy + pvH + 4 + k * 3; P.line(2 * (sx + 1), 2 * y + 1, 2 * (sx + sw - 1), 2 * y + 1, C.grey); }
    }
    // Timeline: ruler and three tracks of clips.
    P.group(0.55, 0.85, { order: "diag" });
    const ry = sy + tlY - 1;
    for (let x = 1; x < sw - 1; x += 4) P.c(sx + x, ry, C.ink);
    const clips = [[[0.03, 0.27, C.teal], [0.31, 0.25, C.gold], [0.59, 0.38, C.plum]], [[0.1, 0.33, C.orange], [0.46, 0.32, C.acc]], [[0.03, 0.94, C.grey]]];
    const proposed = { x: Math.round(sw * 0.46), w: Math.round(sw * 0.32), y: sy + tlY + 1 * trk }, last = { x: Math.round(sw * 0.7), y: sy + tlY + 2 * trk };
    clips.forEach((row, k) => {
      const y = sy + tlY + k * trk;
      row.forEach(([a, w, col], m) => {
        const x = sx + Math.round(sw * a), cw = Math.round(sw * w);
        P.rect(x, y, cw, 2, col); P.rect(x, y, cw, 1, mix(col, "#ffffff", 0.35));
        if (k === 2) for (let q = 2; q < cw - 1; q += 2) P.c(x + q, y + 1 - (hash(q, m) > 0.5 ? 1 : 0), mix(col, "#000000", 0.35));
        if (k === 1 && m === 1) for (let q = 0; q < cw; q += 2) P.c(x + q, y - 1, C.acc);
      });
    });
    // Callouts: dotted leaders from parts of the screen to numbered labels.
    const anchors = [[pvx + Math.round(pvW * 0.45), pvy + Math.round(pvH * 0.35)], [sx + proposed.x + Math.round(proposed.w / 2), proposed.y + 1], [sx + last.x, last.y + 1]];
    const y0 = tall ? deskY + 6 : 1, labelX = tall ? 8 : i0 + dw + 8, slotH = tall ? Math.min(15, (ny - 13 - y0) / 3) : 9.5;
    const chars = Math.floor(((nx - labelX - 7) * cs) / (6 * lp));
    d.callouts.forEach((label, k) => {
      const by = Math.round(y0 + k * slotH), t0 = 0.62 + k * 0.1, [ax, ay] = anchors[k];
      P.group(t0, t0 + 0.2, { pitch: half, order: "diag", lead: true });
      P.line(2 * ax, 2 * ay, 2 * (labelX + 1), 2 * (by + 3), C.acc, [2, 1]);
      P.group(t0 + 0.1, t0 + 0.3, { order: "rad", cx: labelX + 3, cy: by + 3 });
      P.disc(ax, ay, 1.5, C.acc);
      P.disc(labelX + 1, by + 3, 3.1, C.acc);
      P.group(t0 + 0.12, t0 + 0.32, { pitch: lp, ox: ox + (labelX + 1) * cs - 2.5 * lp, oy: oy + (by + 3) * cs - 3.5 * lp, order: "col" });
      P.text(String(k + 1), 0, 0, C.white);
      const lines = wrap(label, Math.max(5, chars) * 6 - 1);
      P.group(t0 + 0.15, t0 + 0.42, { pitch: lp, ox: ox + (labelX + 6) * cs, oy: oy + by * cs, order: "col" });
      lines.slice(0, 3).forEach((ln, m) => P.text(ln, 0, m * 8, C.ink));
    });
    // A cup on the desk, and a pot of ivy.
    const cupX = nx - 11;
    P.group(0.7, 0.9, { order: "up", lead: false });
    P.bmp(CUP, { c: C.red, h: C.red }, cupX, deskY - 5, { scale: 1 });
    P.bmp(["cccccc", "ccwwcc"], { c: C.red, w: C.white }, cupX, deskY - 5);
    const potX = tall ? 4 : nx - 24;
    P.rect(potX, deskY - 3, 6, 3, C.orange); P.rect(potX - 1, deskY - 4, 8, 1, mix(C.orange, "#ffffff", 0.3));
    [0, 1].forEach((alt) => {
      P.group(0.7, 0.95, { order: "up", lead: false, show: (t) => Math.floor(t * 1.4) % 2 === alt });
      for (let k = 0; k < 5; k++) { P.c(potX + 3 + (k % 2 ? alt : 0), deskY - 5 - k, C.green); P.c(potX + 1 - alt, deskY - 6 - k, k % 2 ? C.leaf : C.green); P.c(potX + 5 + alt, deskY - 7 - k, k % 2 ? C.green : C.leaf); }
    });
    if (tall) meadow(P, C, ox, oy, cs, 0, nx, ny - 2, 0.6, 0.95, 61);
    P.done();
    P.meta = { sx, sy, sw, sh, tlY, trk, inspW, pvX, deskY, cupX, phone };
    return P;
  }
  function objectDyn(g, S, L, pp, t, d, P) {
    const { cs, ox, oy } = L, C = colors(S), m = P.meta;
    if (pp < 0.85) return;
    const q = span(pp, 0.85, 1);
    g.save(); g.globalAlpha = q;
    // Playhead sweeps the timeline.
    const px = m.sx + 2 + Math.floor(fmod(t * 0.2, 1) * (m.sw - 5));
    for (let y = m.tlY - 1; y < m.sh - 1; y++) put(g, ox + px * cs, oy + (m.sy + y) * cs, C.red, cs, false);
    put(g, ox + (px - 1) * cs, oy + (m.sy + m.tlY - 2) * cs, C.red, cs, false); put(g, ox + (px + 1) * cs, oy + (m.sy + m.tlY - 2) * cs, C.red, cs, false);
    // Sliders and the cursor.
    if (!m.phone) for (let k = 0; k < 3; k++) {
      const kx = m.sx + 2 + Math.round((Math.sin(t * (0.9 + k * 0.4) + k * 2) * 0.5 + 0.5) * (m.inspW - 5));
      put(g, ox + kx * cs, oy + (m.sy + 5 + k * 4) * cs, C.acc, cs * 0.9, false);
    }
    // Steam rising off the cup.
    for (let k = 0; k < 3; k++) for (let s = 0; s < 4; s++) {
      const rise = fmod(t * 2.2 + k * 1.3 + s * 0.9, 5), sxp = m.cupX + 1 + k * 2 + Math.round(Math.sin(t * 1.6 + k + rise) * 1.2);
      const a = Math.sin((rise / 5) * Math.PI) * 0.7;
      g.globalAlpha = q * a; put(g, ox + sxp * cs, oy + (m.deskY - 7 - Math.round(rise)) * cs, C.grey, cs * 0.5, false);
    }
    g.restore();
    twinkle(g, S, L, t, 8, 33, (i, j) => (i < m.pvX + 56 && j < m.deskY + 4) && !(i > m.sx + m.sw + 6 && j > 28) || j >= m.deskY - 6 && i > L.nx - 30);
  }

  // ---- people: a row of little sewn figures under bunting ------------------------------------------------
  function peoplePat(S, L, d) {
    const { cs, nx, ny, ox, oy, lp } = L, C = colors(S), half = cs / 2;
    const P = newPat({ ox, oy, pitch: cs });
    const n = clamp(Math.round(d.count), 2, 6), base = ny - 4, slot = nx / n;
    // Ground.
    P.group(0, 0.2, { order: "col", lead: false });
    for (let i = 0; i < nx; i++) { P.rect(i, base + 1, 1, 3, hash(i, 2) > 0.5 ? C.green : C.leaf); if (hash(i, 6) > 0.7) P.c(i, base, C.green); }
    // Bunting: a swag of little flags, fluttering.
    const swag = (i) => 1 + Math.round(Math.sin((i / nx) * Math.PI) * 3);
    P.group(0, 0.3, { pitch: half, order: "col", lead: false });
    for (let i = 0; i < nx * 2; i += 1) P.c(i, 2 * swag(i / 2) , C.ink);
    const flags = [C.red, C.gold, C.teal, C.pink, C.plum, C.orange];
    [0, 1].forEach((alt) => {
      P.group(0.1, 0.4, { order: "col", lead: false, show: (t) => Math.floor(t * 1.9) % 2 === alt });
      for (let f = 2, k = 0; f < nx - 2; f += 5, k++) {
        const top = swag(f) + 1, col = flags[k % flags.length];
        for (let y = 0; y < 3; y++) for (let x = 0; x < 4 - y; x++) P.c(f + x + (y > 1 ? alt : 0), top + y, col);
      }
    });
    const skins = S.look.thr.skins, hairs = [C.ink, C.brown, C.orange, C.plum, C.gold, C.ink];
    const shirts = [C.teal, C.pink, C.gold, C.plum, C.orange, C.green], pants = [C.ink, C.brown, C.plum, C.ink, C.teal, C.brown];
    const figs = [], tallRows = L.tall && n >= 3, rowsN = tallRows ? [Math.floor(n / 2), n - Math.floor(n / 2)] : [n];
    const feet = oy + (base + 1) * cs;
    for (let k = 0; k < n; k++) {
      const row = tallRows ? (k < rowsN[0] ? 0 : 1) : 0, idx = tallRows && row === 1 ? k - rowsN[0] : k, c = rowsN[row], slot = (nx * cs) / c;
      const fp = tallRows ? Math.min(1.2 * cs, slot / 15) : cs, baseY = feet - (tallRows && row === 0 ? 34 * fp : 0);
      const fx = ox + slot * (idx + 0.5) - 7 * fp, fy = baseY - 24 * fp;
      const hot = k === Math.min(n - 1, d.highlight ?? 1), t0 = 0.12 + k * 0.12, t1 = t0 + 0.34;
      const ph = k * 1.3, bob = (t) => [0, Math.sin(t * 3.1 + ph) > 0.35 ? -fp : 0];
      const o = { skin: skins[k % skins.length], hair: hairs[k % hairs.length], shirt: hot ? C.acc : shirts[k % shirts.length], pants: pants[k % pants.length], style: k % 5, hat: C.red, ph };
      P.setDef(fp, fx, fy);
      person(P, C, 0, 0, o, bob, t0, t1, hot);
      figs.push({ hot, fp, fx, fy, bob, t1 });
      // Name chip above the head, its lettering sized to the slot.
      const label = String(d.badges[k % d.badges.length] ?? ""), tl = tw(label.toUpperCase()), cp = clamp((slot - 3 * fp) / Math.max(1, tl), 6.2 * fp / cs, lp * fp / cs);
      const wcells = Math.ceil((tl * cp) / fp) + 3, ci = Math.round(7 - wcells / 2), cj = -8 - (!tallRows && n >= 5 && k % 2 ? 7 : 0);
      P.group(t1 - 0.1, t1 + 0.25, { order: "row", move: bob });
      P.rect(ci, cj, wcells, 6, hot ? mix(C.acc, "#ffffff", 0.78) : C.tint(C.gold, 0.5)); P.frame(ci, cj, wcells, 6, hot ? C.acc : C.ink, 1);
      for (let x = 1; x < wcells - 1; x += 2) P.c(ci + x, cj - 1, hot ? C.acc : C.ink);
      P.group(t1 - 0.1, t1 + 0.25, { pitch: cp, ox: fx + (ci + wcells / 2) * fp, oy: fy + cj * fp + (6 * fp - 7 * cp) / 2, order: "col", move: bob });
      P.text(label, 0, 0, hot ? C.acc : C.ink, "center");
    }
    // Hearts float up from the highlighted figure.
    const hotFig = figs.find((f) => f.hot);
    P.setDef(hotFig.fp, hotFig.fx, hotFig.fy);
    for (let k = 0; k < 3; k++) {
      P.group(0.7, 0.9, { order: "row", lead: false, show: (t) => fmod(t * 0.5 + k / 3, 1) < 0.85, move: (t) => [Math.sin(t * 2 + k) * hotFig.fp * 1.2, -fmod(t * 0.5 + k / 3, 1) * 9 * hotFig.fp] });
      P.bmp(HEART, { r: C.red, W: C.white }, 14, -5, { scale: 1 });
    }
    P.done();
    P.meta = { base, figs };
    return P;
  }
  function peopleDyn(g, S, L, pp, t, d, P) {
    const { cs, nx, ny } = L;
    twinkle(g, S, L, t, 12, 17, (i, j) => j < 8 || j > P.meta.base - 34);
    // A butterfly wandering through.
    if (pp > 0.5) {
      const C = colors(S), { ox, oy } = L, bx = nx * 0.5 + Math.sin(t * 0.4) * nx * 0.42, by = ny * 0.45 + Math.sin(t * 0.8) * ny * 0.18;
      const P3 = newPat({ ox, oy, pitch: cs * 0.7 });
      P3.group(0, 1); P3.bmp(Math.floor(t * 7) % 2 ? FLY_OPEN : FLY_SHUT, { b: C.pink, k: C.ink }, 0, 0); P3.done();
      drawPat(g, { groups: P3.groups.map((G) => ({ ...G, x: G.x.map((x) => x + ox + Math.round(bx) * cs), y: G.y.map((y) => y + oy + Math.round(by) * cs) })) }, 1, t, false);
    }
  }

  // ---- process: appliqué patches joined by a marching running stitch ----------------------------------------
  function processPat(S, L, d) {
    const { cs, nx, ny, ox, oy, lp } = L, C = colors(S), half = cs / 2;
    const P = newPat({ ox, oy, pitch: cs });
    const n = d.steps.length, horiz = nx >= ny, gapc = horiz ? 8 : 9;
    const pw = horiz ? Math.floor((nx - (n - 1) * gapc) / n) : nx - 2;
    const ph = horiz ? ny - 2 : Math.floor((ny - (n - 1) * gapc) / n);
    const tints = [C.teal, C.gold, C.pink, C.plum];
    const kinds = d.steps.map((_, i) => (i === n - 1 ? "check" : ["file", "spark", "eye"][i % 3]));
    const cells = [];
    for (let k = 0; k < n; k++) {
      const i0 = horiz ? 1 + k * (pw + gapc) : 1, j0 = horiz ? 1 : k * (ph + gapc), t0 = 0.05 + k * 0.17, t1 = t0 + 0.3, base = tints[k % tints.length], last = k === n - 1;
      const edge = last ? C.acc : C.ink;
      P.group(t0, t1, { order: "diag" });
      P.rect(i0, j0, pw, ph, mix(base, C.bg, 0.72));
      // Blanket-stitch edge: ticks stand out all round the patch.
      P.frame(i0, j0, pw, ph, edge, 1);
      for (let x = 1; x < pw - 1; x += 2) { P.c(i0 + x, j0 - 1, edge); P.c(i0 + x, j0 + ph, edge); }
      for (let y = 1; y < ph - 1; y += 2) { P.c(i0 - 1, j0 + y, edge); P.c(i0 + pw, j0 + y, edge); }
      const ci = horiz ? i0 + Math.floor(pw / 2) : i0 + 12, cj = horiz ? j0 + 15 : j0 + Math.floor(ph / 2);
      icon(P, C, kinds[k], ci, cj, t0 + 0.12, t1 + 0.1);
      P.group(t0 + 0.05, t0 + 0.3, { order: "col" });
      P.text(String(k + 1), i0 + 2, j0 + 2, last ? C.acc : C.ink);
      const chars = Math.floor(((horiz ? pw - 3 : pw - 26) * cs) / (6 * lp)), lines = wrap(d.steps[k], Math.max(5, chars) * 6 - 1).slice(0, 3);
      const lx = horiz ? ox + (i0 + pw / 2) * cs : ox + (i0 + 26) * cs, ly = horiz ? oy + (j0 + ph - 3) * cs - lines.length * 8 * lp : oy + (j0 + Math.floor(ph / 2)) * cs - (lines.length * 8 * lp) / 2;
      P.group(t0 + 0.2, t1 + 0.3, { pitch: lp, ox: lx, oy: ly, order: "col" });
      lines.forEach((ln, m) => P.text(ln, 0, m * 8, C.ink, horiz ? "center" : "left"));
      cells.push({ i0, j0, ci, cj, pw, ph, kind: kinds[k], k });
    }
    // Arrow heads between patches.
    for (let k = 0; k < n - 1; k++) {
      const a = cells[k], i = horiz ? a.i0 + pw + 1 : a.i0 + Math.floor(pw / 2), j = horiz ? a.j0 + 15 : a.j0 + ph + 1, t0 = 0.2 + k * 0.17;
      P.group(t0, t0 + 0.2, { order: "diag", lead: true });
      if (horiz) { P.c(i + gapc - 4, j - 2, C.acc); P.c(i + gapc - 3, j - 1, C.acc); P.c(i + gapc - 2, j, C.acc); P.c(i + gapc - 3, j + 1, C.acc); P.c(i + gapc - 4, j + 2, C.acc); }
      else { P.c(i - 2, j + gapc - 4, C.acc); P.c(i - 1, j + gapc - 3, C.acc); P.c(i, j + gapc - 2, C.acc); P.c(i + 1, j + gapc - 3, C.acc); P.c(i + 2, j + gapc - 4, C.acc); }
    }
    if (!horiz) meadow(P, C, ox, oy, cs, 0, nx, ny - 1, 0.7, 0.95, 77);
    P.done(); P.meta = { cells, horiz, gapc, n };
    return P;
  }
  // Pictures on the patches: a page of writing, a sparkle, an eye, a tick.
  function icon(P, C, kind, ci, cj, t0, t1) {
    P.group(t0, t1, { order: "row" });
    if (kind === "file") {
      P.rect(ci - 5, cj - 7, 11, 15, C.white); P.frame(ci - 5, cj - 7, 11, 15, C.ink, 1);
      P.rect(ci + 2, cj - 7, 4, 4, C.ink); P.c(ci + 1, cj - 6, C.grey); P.c(ci + 1, cj - 5, C.grey); P.c(ci + 2, cj - 4, C.grey);
    } else if (kind === "spark") {
      P.bmp(["....y....", "....y....", "...yyy...", "...yyy...", "yyyyyyyyy", "...yyy...", "...yyy...", "....y....", "....y...."], { y: C.gold }, ci - 4, cj - 4, { scale: 1 });
      P.c(ci - 4, cj - 4, C.white);
      P.bmp(STAR, { y: C.pink }, ci + 5, cj - 8, {}); P.bmp(["..y..", ".yyy.", "yyyyy", ".yyy.", "..y.."], { y: C.teal }, ci - 9, cj + 3, {});
    } else if (kind === "eye") {
      for (let x = -8; x <= 8; x++) { const h = Math.round(Math.sqrt(Math.max(0, 1 - (x / 8.5) ** 2)) * 5); P.rect(ci + x, cj - h, 1, h * 2 + 1, C.white); P.c(ci + x, cj - h, C.ink); P.c(ci + x, cj + h, C.ink); }
      P.rect(ci - 9, cj, 1, 1, C.ink); P.rect(ci + 9, cj, 1, 1, C.ink);
      P.group(t0, t1, { order: "rad", cx: ci, cy: cj, move: (t) => [Math.round(Math.sin(t * 1.3)) * 2, Math.round(Math.sin(t * 0.8 + 1) * 0.6)] });
      P.disc(ci, cj, 3.6, C.teal); P.disc(ci, cj, 1.6, C.ink); P.c(ci - 1, cj - 2, C.white);
    } else {
      P.disc(ci, cj, 8, C.paleG || C.tint(C.green, 0.4)); P.ring(ci, cj, 8.4, C.green, 1.4);
      P.line(ci - 4, cj, ci - 1, cj + 4, C.green); P.line(ci - 1, cj + 4, ci + 5, cj - 4, C.green); P.line(ci - 3, cj, ci, cj + 4, C.green); P.line(ci, cj + 4, ci + 6, cj - 4, C.green);
    }
  }
  function processDyn(g, S, L, pp, t, d, P) {
    const { cs, ox, oy } = L, C = colors(S), m = P.meta, p2 = cs * 0.5;
    P.meta.cells.forEach((c) => {
      const q = span(pp, 0.3 + c.k * 0.17, 0.6 + c.k * 0.17);
      if (q < 1) return;
      if (c.kind === "file") {
        for (let r = 0; r < 4; r++) {
          const w = Math.round(2 + 6 * clamp(fmod(t * 0.7 - r * 0.28, 2.2) * 0.9, 0, 1)); // lines typed in turn
          for (let x = 0; x < w; x++) put(g, ox + (c.ci - 3 + x) * cs, oy + (c.cj - 3 + r * 2.4 | 0) * cs, r === 1 ? C.acc : C.ink, p2 * 2 * 0.8, false);
        }
        if (Math.floor(t * 2.4) % 2) put(g, ox + (c.ci + 4) * cs, oy + (c.cj + 5) * cs, C.acc, cs * 0.8, false);
      } else if (c.kind === "spark" || c.kind === "check") {
        for (let k = 0; k < 6; k++) {
          const a = t * 1.1 + (k * TAU) / 6, r2 = (c.kind === "check" ? 12 : 11) + Math.sin(t * 2 + k) * 1.2;
          g.save(); g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 3 + k * 2);
          put(g, ox + (c.ci + Math.cos(a) * r2) * cs, oy + (c.cj + Math.sin(a) * r2 * 0.8) * cs, k % 2 ? C.gold : C.pink, cs * 0.6, false);
          g.restore();
        }
      }
    });
    // Running stitch marches along each arrow.
    for (let k = 0; k < m.n - 1; k++) {
      const a = m.cells[k], b = m.cells[k + 1], q = span(pp, 0.2 + k * 0.17, 0.42 + k * 0.17);
      if (q <= 0) continue;
      const x0 = m.horiz ? a.i0 + a.pw + 1 : a.i0 + Math.floor(a.pw / 2), y0 = m.horiz ? a.j0 + 15 : a.j0 + a.ph + 1;
      const len = (m.gapc - 2) * 2, ph = Math.floor(t * 6);
      for (let s = 0; s < len * q; s++) {
        if ((s + ph) % 4 > 1) continue;
        put(g, ox + (m.horiz ? x0 : y0 * 0 + x0) * cs + (m.horiz ? s * p2 : 0), oy + (m.horiz ? y0 : y0) * cs + (m.horiz ? 0 : s * p2), C.acc, p2, false);
      }
    }
    twinkle(g, S, L, t, 8, 5, () => false);
  }

  // ---- compare: a snarl of thread against a bloom, each on an appliqué card ----------------------------------
  function comparePat(S, L, d) {
    const { cs, nx, ny, ox, oy, lp } = L, C = colors(S), half = cs / 2;
    const P = newPat({ ox, oy, pitch: cs });
    const vertical = ny > nx * 1.1, gap = vertical ? 8 : 9;
    const cw = vertical ? nx - 2 : Math.floor((nx - gap) / 2), ch = vertical ? Math.floor((ny - gap) / 2) : ny - 2;
    const cards = [];
    [[d.left, d.leftValue, C.grey, false], [d.right, d.rightValue, C.acc, true]].forEach(([label, value, col, good], k) => {
      const i0 = vertical ? 1 : 1 + k * (cw + gap), j0 = vertical ? k * (ch + gap) : 1, t0 = 0.05 + k * 0.25, t1 = t0 + 0.34;
      const edge = good ? C.acc : C.ink;
      P.group(t0, t1, { order: "diag" });
      P.rect(i0, j0, cw, ch, good ? mix(C.acc, C.bg, 0.8) : mix(C.grey, C.bg, 0.7));
      P.frame(i0, j0, cw, ch, edge, 1);
      for (let x = 1; x < cw - 1; x += 2) { P.c(i0 + x, j0 - 1, edge); P.c(i0 + x, j0 + ch, edge); }
      for (let y = 1; y < ch - 1; y += 2) { P.c(i0 - 1, j0 + y, edge); P.c(i0 + cw, j0 + y, edge); }
      const lp2 = Math.min(cs * 0.78, ((cw - 6) * cs) / Math.max(1, tw(String(label).toUpperCase())));
      P.group(t0 + 0.1, t1, { pitch: lp2, ox: ox + (i0 + 3) * cs, oy: oy + (j0 + 3) * cs, order: "col" });
      P.text(String(label), 0, 0, good ? C.acc : C.ink);
      // Meter track.
      const my = j0 + ch - 7, mw = cw - 6;
      P.group(t0 + 0.2, t1 + 0.1, { order: "col" });
      P.rect(i0 + 3, my, mw, 3, C.tint(C.grey, 0.45)); P.frame(i0 + 3, my, mw, 3, C.grey, 1);
      // The picture: a knot of tangled thread, or a flower in bloom.
      const mi = i0 + cw - (vertical ? 20 : 24), mj = j0 + (vertical ? 9 : 10);
      if (!good) {
        for (let alt = 0; alt < 3; alt++) {
          P.group(t0 + 0.15, t1 + 0.1, { order: "none", lead: alt === 0, show: (t) => Math.floor(t * 3.4) % 3 === alt });
          const r = rng(300 + alt * 17); let px = mi + 9, pj = mj + 9;
          for (let s = 0; s < 14; s++) { const nxp = mi + 2 + Math.floor(r() * 18), nyp = mj + 1 + Math.floor(r() * 17); P.line(px, pj, nxp, nyp, s % 3 === 0 ? C.ink : s % 3 === 1 ? C.grey : C.red); px = nxp; pj = nyp; }
        }
      } else {
        P.group(t0 + 0.15, t1 + 0.1, { order: "rad", cx: mi + 9, cy: mj + 7 });
        for (let y = 0; y < 10; y++) P.c(mi + 9, mj + 7 + y, C.green);
        P.bmp(["..g...", ".ggg..", "..g..."], { g: C.leaf }, mi + 5, mj + 14, {}); P.bmp(["..g...", ".ggg..", "..g..."], { g: C.green }, mi + 10, mj + 12, { flip: true });
        [0, 1].forEach((alt) => {
          P.group(t0 + 0.15, t1 + 0.1, { order: "rad", cx: mi + 9, cy: mj + 7, lead: false, show: (t) => Math.floor(t * 1.6) % 2 === alt });
          P.bmp(FLOWER7, { p: alt ? C.pink : C.acc, y: C.gold }, mi + 6, mj + 4, { scale: 2 });
        });
      }
      cards.push({ i0, j0, my, mw, value, good, col, k, t0, t1, mi, mj });
    });
    // An arrow between the cards.
    P.group(0.35, 0.55, { order: "diag" });
    const ax = vertical ? Math.floor(nx / 2) : 1 + cw + Math.floor(gap / 2), ay = vertical ? ch + Math.floor(gap / 2) : Math.floor(ch / 2);
    if (vertical) { P.line(ax, ay - 3, ax, ay + 3, C.acc); P.line(ax - 3, ay, ax, ay + 3, C.acc); P.line(ax + 3, ay, ax, ay + 3, C.acc); }
    else { P.line(ax - 3, ay, ax + 3, ay, C.acc); P.line(ax, ay - 3, ax + 3, ay, C.acc); P.line(ax, ay + 3, ax + 3, ay, C.acc); }
    P.done();
    P.meta = { cards, vertical, ax, ay, cw, ch };
    return P;
  }
  function compareDyn(g, S, L, pp, t, d, P) {
    const { cs, ox, oy, lp } = L, C = colors(S), m = P.meta, top = Math.max(d.leftValue, d.rightValue, 1);
    m.cards.forEach((c) => {
      const q = span(pp, c.t0 + 0.1, c.t1 + 0.35);
      const str = window.DreamcutMotion.formatNumber(c.value * ease(q), Math.abs(c.value % 1) > 0.001 ? 1 : 0, d.prefix || "", d.suffix || "");
      const full = window.DreamcutMotion.formatNumber(c.value, Math.abs(c.value % 1) > 0.001 ? 1 : 0, d.prefix || "", d.suffix || "");
      const pitch = Math.min(cs * 2, ((m.cw * 0.55 - 2) * cs) / Math.max(6, tw(full.toUpperCase()))), x = ox + (c.i0 + 3) * cs, y = oy + (c.j0 + (m.vertical ? 14 : 13)) * cs;
      textNow(g, str, x, y, Math.max(cs, pitch), c.good ? C.acc : C.ink, {});
      // The meter fills; a lighter stitch runs along it.
      const fillW = Math.round(c.mw * (c.value / top) * ease(span(pp, c.t0 + 0.25, c.t1 + 0.4)));
      for (let i = 1; i < fillW - 1; i++) {
        const shine = fmod(i - t * 14, 22) < 3;
        put(g, ox + (c.i0 + 3 + i) * cs, oy + (c.my + 0) * cs, shine ? mix(c.good ? C.acc : C.grey, "#ffffff", 0.5) : (c.good ? C.acc : C.grey), cs, false);
        put(g, ox + (c.i0 + 3 + i) * cs, oy + (c.my + 1) * cs, c.good ? C.acc : C.grey, cs, false); put(g, ox + (c.i0 + 3 + i) * cs, oy + (c.my + 2) * cs, c.good ? mix(C.acc, "#000000", 0.2) : mix(C.grey, "#000000", 0.2), cs, false);
      }
      if (c.good && q >= 1) for (let k = 0; k < 5; k++) {
        const a = t * 1.2 + (k * TAU) / 5; g.save(); g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 3 + k);
        put(g, ox + (c.mi + 9 + Math.cos(a) * 12) * cs, oy + (c.mj + 7 + Math.sin(a) * 9) * cs, k % 2 ? C.gold : C.pink, cs * 0.6, false); g.restore();
      }
    });
    // The arrow pulses.
    const pulse = Math.floor(t * 3) % 2;
    if (pp > 0.5) put(g, ox + (m.ax + 4 + pulse) * cs, oy + m.ay * cs, C.acc, cs * 0.8, false);
    twinkle(g, S, L, t, 6, 11, () => true);
  }

  // ---- title and closing: the cover and the finished piece ---------------------------------------------------
  const plan = () => {
    const c = (window.__dreamcut && window.__dreamcut.controls) || (typeof dc !== "undefined" && dc && dc.controls) || null;
    if (!c) return null;
    const out = [];
    for (const id of ["title", "chart", "object", "people", "process", "compare", "closing"]) if ((Number(c[`${id}_hold`]) || 0) > 0) out.push(id);
    return out;
  };
  const textOf = (id) => { const el = document.getElementById(id); return el ? el.textContent.trim() : ""; };
  const memo = (S, key, make) => {
    let m = pats.get(S.look);
    if (!m) { m = new Map(); pats.set(S.look, m); }
    const full = [S.W, S.H, S.look.bg, S.accent, S.look.ink, key].join("|");
    let v = m.get(full);
    if (!v) { v = make(); m.set(full, v); }
    return v;
  };

  // Words of a heading as stitched lettering, wrapped to the page and centred in the band above the scene.
  function headPat(S, id, text) {
    return memo(S, "head:" + id + ":" + text, () => {
      const cs = CS(S), C = colors(S), side = Math.round((S.tall ? 90 : 140) * S.u / cs) * cs;
      let hp = cs, lines = wrap(text, Math.floor((S.W - side * 2) / hp));
      while (lines.length > (S.tall ? 3 : 2) && hp > cs * 0.7) { hp *= 0.92; lines = wrap(text, Math.floor((S.W - side * 2) / hp)); }
      const top = S.tall ? 150 * S.u : 40 * S.u, bot = Math.round(boxTop(S) / cs) * cs - 2 * cs, blockH = lines.length * 8 * hp - hp;
      const y0 = Math.round((top + (bot - top - blockH) / 2) / cs) * cs;
      const P = newPat({ ox: side, oy: y0, pitch: hp });
      const cyc = [C.ink, C.acc, C.ink, C.teal, C.ink, C.plum];
      lines.forEach((ln, k) => {
        P.group(k * 0.45, k * 0.45 + 0.55, { order: "col" });
        // Colour by word, continuing across lines.
        const before = lines.slice(0, k).join(" ").split(" ").filter(Boolean).length;
        P.text(ln, 0, k * 8, cyc.slice(before % cyc.length).concat(cyc.slice(0, before % cyc.length)));
      });
      P.done();
      const widest = Math.max(...lines.map((l) => tw(l))) * hp;
      P.meta = { x: side, y: y0 + blockH, w: widest, hp };
      return P;
    });
  }
  function headWave(g, S, hd, t, q) {
    if (q < 1) return;
    const C = colors(S), p = CS(S) * 0.5, y0 = hd.meta.y + 2 * CS(S), cyc = [C.acc, C.gold, C.teal, C.plum];
    const n = Math.floor(hd.meta.w / p);
    for (let i = 0; i < n; i++) put(g, hd.meta.x + i * p, y0 + Math.round(Math.sin(i * 0.42 - t * 3.2) * 1.5) * p, cyc[Math.floor((i + t * 6) / 5) % 4 | 0] || cyc[0], p, false);
  }

  // A round sampler window: sky, hills, a sun with turning rays, clouds sailing past, a potted sprout.
  function windowMotif(P, C, cs, ci, cj, R, t0, t1) {
    const clip = { cx: ci * cs + cs / 2, cy: cj * cs + cs / 2, r: (R - 2) * cs };
    const inside = (x, y) => Math.hypot(x - clip.cx, y - clip.cy) < clip.r;
    P.group(t0, t0 + 0.25, { order: "rad", cx: ci, cy: cj });
    P.ring(ci, cj, R, C.ink, 2);
    for (let a = 0; a < 40; a++) P.c(ci + Math.cos((a / 40) * TAU) * (R + 2.2), cj + Math.sin((a / 40) * TAU) * (R + 2.2), a % 2 ? C.gold : C.pink);
    P.group(t0 + 0.05, t1, { order: "up", lead: false });
    P.disc(ci, cj, R - 2, null, (x, y) => mix(C.sky, mix(C.gold, "#ffffff", 0.6), clamp((y + R) / (2 * R))));
    P.group(t0 + 0.2, t1, { order: "up" });
    for (let x = -R; x <= R; x++) {
      const h1 = Math.round(R * 0.12 + Math.sin(x * 0.2) * 2.4), h2 = Math.round(R * 0.5 + Math.sin(x * 0.27 + 2) * 1.8);
      for (let y = h1; y <= R; y++) if (Math.hypot(x, y) <= R - 2) P.c(ci + x, cj + y, y >= h2 ? C.green : mix(C.green, C.sky, 0.4));
    }
    [0, 1].forEach((alt) => {
      P.group(t0 + 0.2, t1, { order: "rad", cx: ci - 8, cy: cj - 10, lead: false, show: (t) => Math.floor(t * 2.2) % 2 === alt });
      const sx = ci - Math.round(R * 0.4), sy = cj - Math.round(R * 0.45);
      P.disc(sx, sy, 3.3, C.gold);
      const rays = alt ? [[-6, 0], [6, 0], [0, -6], [0, 6], [-5, -5]] : [[-5, -5], [5, -5], [-5, 5], [5, 5], [0, -7]];
      rays.forEach(([a, b]) => { P.c(sx + a, sy + b, C.gold); P.c(sx + Math.round(a * 0.8), sy + Math.round(b * 0.8), C.gold); });
    });
    for (let k = 0; k < 2; k++) {
      P.group(t0 + 0.25, t1, { order: "row", lead: false, clip: inside, move: (t) => [fmod(t * (1.8 + k * 0.7) + k * R, 2 * R + 14) * cs - (R + 7) * cs, 0] });
      P.bmp(CLOUD, { w: C.white }, ci, cj - Math.round(R * (0.55 - k * 0.22)), { scale: 1 });
    }
    // The sprout.
    const px = ci + Math.round(R * 0.35), pyb = cj + R - 5;
    P.group(t0 + 0.35, t1, { order: "up", lead: false });
    P.rect(px - 3, pyb - 3, 7, 3, C.orange); P.rect(px - 4, pyb - 4, 9, 1, mix(C.orange, "#ffffff", 0.3));
    for (let k = 0; k < 8; k++) P.c(px, pyb - 4 - k, C.green);
    P.c(px - 1, pyb - 7, C.leaf); P.c(px - 2, pyb - 8, C.leaf); P.c(px + 1, pyb - 9, C.leaf); P.c(px + 2, pyb - 10, C.leaf);
    [0, 1].forEach((alt) => {
      P.group(t0 + 0.4, t1, { order: "up", lead: false, show: (t) => Math.floor(t * 1.6) % 2 === alt });
      P.bmp(FLOWER, { p: C.pink, y: C.gold }, px - 2 + alt, pyb - 16, {});
    });
    for (const G of P.groups) if (G.t0 >= t0 && !G.clip) G.clip = inside;
  }

  function titlePat(S) {
    return memo(S, "title:" + textOf("kicker") + "|" + textOf("title"), () => {
      const cs = CS(S), C = colors(S), { W, H, u } = S, tall = S.tall, lp = cs * 0.62;
      const side = Math.round((tall ? 90 : 140) * u / cs) * cs, P = newPat({ ox: 0, oy: 0, pitch: cs });
      const textW = tall ? W - side * 2 : W * 0.46;
      let hp = cs, lines = wrap(textOf("title"), Math.floor(textW / hp));
      const maxH = tall ? H * 0.34 : H * 0.62;
      while (lines.length * 8 * hp > maxH && hp > cs * 0.7) { hp *= 0.93; lines = wrap(textOf("title"), Math.floor(textW / hp)); }
      const kick = textOf("kicker").toUpperCase(), kh = kick ? 8 * lp + 2.4 * cs : 0, blockH = kh + lines.length * 8 * hp;
      const y0 = Math.round((tall ? 200 * u : (H - blockH) / 2) / cs) * cs;
      let k0 = 0;
      if (kick) {
        P.group(0, 0.22, { pitch: lp, ox: side, oy: y0, order: "col" });
        P.text(kick, 0, 0, C.teal); k0 = 1;
      }
      const cyc = [C.ink, C.acc, C.ink, C.teal, C.ink, C.plum];
      lines.forEach((ln, k) => {
        P.group(0.1 + k * 0.2, 0.34 + k * 0.2, { pitch: hp, ox: side, oy: y0 + kh + k * 8 * hp, order: "col" });
        const before = lines.slice(0, k).join(" ").split(" ").filter(Boolean).length;
        P.text(ln, 0, 0, cyc.slice(before % cyc.length).concat(cyc.slice(0, before % cyc.length)));
      });
      const R = Math.round((tall ? W * 0.4 : Math.min(H * 0.29, W * 0.15)) / cs), ci = tall ? Math.round(W / 2 / cs) : Math.round(W * 0.775 / cs), cj = tall ? Math.round(H * 0.62 / cs) : Math.round(H * 0.5 / cs);
      windowMotif(P, C, cs, ci, cj, R, 0.15, 0.85);
      meadow(P, C, 0, 0, cs, 0, Math.floor(W / cs), Math.floor(H / cs) - 7, 0.02, 0.35, 9);
      bunting(P, C, 0, 0, cs, 6, Math.floor(W / cs) - 6, 4, 3, 0.02, 0.3);
      P.done(); P.meta = { ci, cj, R, cs, widest: Math.max(1, ...lines.map((l) => tw(l))) * hp, y0, kh, hp, lines: lines.length };
      return P;
    });
  }
  function closingPat(S) {
    return memo(S, "closing:" + textOf("closing"), () => {
      const cs = CS(S), C = colors(S), { W, H, u } = S, tall = S.tall;
      const side = Math.round((tall ? 90 : 140) * u / cs) * cs, P = newPat({ ox: 0, oy: 0, pitch: cs });
      const textW = tall ? W - side * 2 : W * 0.48;
      let hp = cs, lines = wrap(textOf("closing"), Math.floor(textW / hp));
      const maxH = tall ? H * 0.34 : H * 0.62;
      while (lines.length * 8 * hp > maxH && hp > cs * 0.7) { hp *= 0.93; lines = wrap(textOf("closing"), Math.floor(textW / hp)); }
      const blockH = lines.length * 8 * hp, y0 = Math.round((tall ? 220 * u : (H - blockH) / 2) / cs) * cs;
      const cyc = [C.ink, C.acc, C.ink, C.plum, C.ink, C.teal];
      lines.forEach((ln, k) => {
        P.group(0.05 + k * 0.22, 0.3 + k * 0.22, { pitch: hp, ox: side, oy: y0 + k * 8 * hp, order: "col" });
        const before = lines.slice(0, k).join(" ").split(" ").filter(Boolean).length;
        P.text(ln, 0, 0, cyc.slice(before % cyc.length).concat(cyc.slice(0, before % cyc.length)));
      });
      const ci = tall ? Math.round(W / 2 / cs) : Math.round(W * 0.76 / cs), cj = tall ? Math.round(H * 0.68 / cs) : Math.round(H * 0.46 / cs), k3 = tall ? 4 : 3;
      const hx = ci - Math.round((9 * k3) / 2), hy = cj - Math.round((8 * k3) / 2);
      P.group(0.15, 0.7, { order: "up" });
      P.bmp(HEART, { r: C.acc, W: C.white }, hx, hy, { scale: k3 });
      [0, 1].forEach((alt) => {
        P.group(0.15, 0.7, { order: "rad", cx: ci, cy: cj, lead: false, show: (t) => (alt === 0) === (fmod(t, 0.9) < 0.55) });
        if (alt === 1) P.ring(ci, cj + 1, 9 * k3 / 2 + 2.6, mix(C.acc, "#ffffff", 0.4), 1);
        else P.ring(ci, cj + 1, 9 * k3 / 2 + 1.4, C.gold, 1);
      });
      // Little stitched flowers circle the heart.
      for (let k = 0; k < 10; k++) {
        const col = [C.gold, C.teal, C.pink, C.plum, C.orange][k % 5];
        P.group(0.4 + k * 0.03, 0.9, { order: "row", lead: false, move: (t) => [(Math.cos(t * 0.7 + (k * TAU) / 10) * (tall ? 19 : 22)) * cs, (Math.sin(t * 0.7 + (k * TAU) / 10) * (tall ? 16 : 15)) * cs] });
        P.bmp(FLOWER, { p: col, y: C.white }, ci - 2, cj - 2, {});
      }
      // Scissors snip the thread.
      const sx = tall ? ci + 10 : ci + 14, sy = tall ? cj + 20 : cj + 12;
      [0, 1].forEach((alt) => {
        P.group(0.6, 0.95, { order: "row", lead: false, show: (t) => Math.floor(t * 2.2) % 2 === alt });
        P.bmp(alt ? SCISSORS_OPEN : SCISSORS_SHUT, { o: C.red, s: C.grey }, sx, sy, {});
      });
      P.group(0.6, 0.95, { order: "col", lead: false });
      for (let k = 0; k < 8; k++) P.c(sx - k, sy + 5 + Math.round(Math.sin(k * 0.8) * 1.5), C.acc);
      meadow(P, C, 0, 0, cs, 0, Math.floor(W / cs), Math.floor(H / cs) - 7, 0.02, 0.35, 19);
      bunting(P, C, 0, 0, cs, 6, Math.floor(W / cs) - 6, 4, 3, 0.02, 0.3);
      P.done(); P.meta = { ci, cj, k3 };
      return P;
    });
  }

  // ---- the stage: table, hoop and cloth, then the headings and the cover/closing art -------------------------
  const shiftOf = (S) => Math.round(S.W * 0.5 / CS(S)) * CS(S);
  function stageOffsets(S, info) {
    const sh = shiftOf(S), idx = info.index || 0, change = Math.max(0.01, info.change || 0.45);
    const e = idx > 0 && info.local < change ? sm(info.local / change) : 1;
    const scroll = idx > 0 ? idx - 1 + e : 0;
    const t = info.t, dx = Math.round(Math.sin(t * 0.41) * 0.65 * CS(S)), dy = Math.round(Math.sin(t * 0.27 + 1) * 0.5 * CS(S));
    return { cloth: -scroll * sh + dx, dx, dy, enter: idx > 0 ? (1 - e) * sh : 0, exit: e, sh, alpha: idx > 0 && info.local < change ? sm(info.local / (change * 0.75)) : 1 };
  }

  function stage(ctx, S, info) {
    const { W, H, u } = S, cs = CS(S), t = info.t, off = stageOffsets(S, info);
    const C = colors(S);
    ctx.save();
    if (S.paint) {
      ctx.drawImage(tableLayer(S), 0, 0);
      ctx.save(); clipHoop(ctx, S);
      const tile = clothTile(S), tx = fmod(off.cloth, tile.width), ty = fmod(off.dy, tile.height);
      ctx.translate(tx - tile.width, ty - tile.height);
      ctx.fillStyle = ctx.createPattern(tile, "repeat"); ctx.fillRect(0, 0, W + 2 * tile.width, H + 2 * tile.height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1; ctx.drawImage(mottleLayer(S), 0, 0);
      ctx.restore();
      hoopRing(ctx, S);
    }
    // Everything stitched is clipped to the inside of the hoop and rides on the cloth.
    ctx.save(); clipHoop(ctx, S);
    ctx.save(); ctx.translate(off.dx, off.dy); border(ctx, S, t); ctx.restore();
    const ids = plan(), idx = info.index || 0;
    const draw = (id, pp, ox, exiting) => {
      ctx.save(); ctx.translate(ox + off.dx, off.dy);
      if (!exiting) ctx.globalAlpha = off.alpha;
      let lead = null;
      if (id === "title") { const P = titlePat(S); lead = drawPat(ctx, P, pp, t, !exiting); titleDyn(ctx, S, P, pp, t); }
      else if (id === "closing") { const P = closingPat(S); lead = drawPat(ctx, P, pp, t, !exiting); closingDyn(ctx, S, P, pp, t); }
      else if (id) {
        const hd = headPat(S, id, textOf(`${id}-title`));
        lead = drawPat(ctx, hd, exiting ? pp : span(pp, 0, 1), t, !exiting);
        headWave(ctx, S, hd, t, pp);
      }
      ctx.restore();
      return lead && !lead.done ? { x: lead.x + ox + off.dx, y: lead.y + off.dy, color: lead.color } : null;
    };
    let needleAt = null;
    if (ids && idx > 0 && info.local < Math.max(0.01, info.change || 0.45)) draw(ids[idx - 1], 1 - clamp(info.local / Math.max(0.01, info.change || 0.45)), -off.sh * sm(clamp(info.local / Math.max(0.01, info.change || 0.45))), true);
    if (info.scene) {
      const heading = info.scene !== "title" && info.scene !== "closing";
      needleAt = draw(info.scene, heading ? clamp(info.local / 1.0) : clamp(info.local / 2.2), off.enter, false);
    }
    ctx.restore();
    // The second needle, sewing the seam, and the needle on the heading or cover.
    ctx.save(); clipHoop(ctx, S);
    ctx.save(); ctx.translate(off.dx, off.dy); fibers(ctx, S, t); const sm2 = seam(ctx, S, t); ctx.restore();
    ctx.restore();
    ctx.save(); ctx.translate(off.dx, off.dy);
    needle(ctx, S, sm2.x, sm2.y, sm2.color, t, 1, sm2.live);
    ctx.restore();
    if (needleAt) needle(ctx, S, needleAt.x, needleAt.y, needleAt.color, t, 1, true);
    ctx.restore();
  }
  function titleDyn(g, S, P, pp, t) {
    const { ci, cj, R, cs } = P.meta, C = colors(S);
    if (pp < 0.9) return;
    for (let k = 0; k < 4; k++) {
      const a = t * 0.8 + (k * TAU) / 4 + 0.7, rr = R + 6;
      g.save(); g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 2.4 + k * 1.7);
      put(g, (ci + Math.cos(a) * rr) * cs, (cj + Math.sin(a) * rr * 0.9) * cs, k % 2 ? C.gold : C.pink, cs * 0.6, false); g.restore();
    }
    const L0 = { cs, nx: Math.floor(S.W / cs), ny: Math.floor(S.H / cs), ox: 0, oy: 0 };
    twinkle(g, S, L0, t, 22, 3, (i, j) => (i * cs > S.W * 0.52 - 1 && Math.hypot(i - ci, j - cj) < R + 8) || j > L0.ny - 9 || (S.tall && j < 12));
    const bx = fmod(t * 4, L0.nx + 20) - 10, by = L0.ny - 14 + Math.round(Math.sin(t * 1.3) * 3);
    const P3 = newPat({ ox: 0, oy: 0, pitch: cs });
    P3.group(0, 1); P3.bmp(Math.floor(t * 7) % 2 ? FLY_OPEN : FLY_SHUT, { b: C.orange, k: C.ink }, 0, 0); P3.done();
    drawPat(g, { groups: P3.groups.map((G) => ({ ...G, x: G.x.map((x) => x + bx * cs), y: G.y.map((y) => y + by * cs) })) }, 1, t, false);
  }
  function closingDyn(g, S, P, pp, t) {
    const cs = CS(S), C = colors(S), L0 = { cs, nx: Math.floor(S.W / cs), ny: Math.floor(S.H / cs), ox: 0, oy: 0 };
    const { ci, cj } = P.meta;
    twinkle(g, S, L0, t, 28, 8, (i, j) => (i * cs < S.W * 0.5 && !S.tall) || j > L0.ny - 9 || Math.hypot(i - ci, j - cj) < 12);
    for (let k = 0; k < 7; k++) {
      const ph = fmod(t * 0.45 + k / 7, 1), x = ci + Math.sin(k * 2.3) * 24 + Math.sin(t + k) * 2, y = cj - 24 + ph * 50;
      g.save(); g.globalAlpha = Math.sin(ph * Math.PI);
      put(g, x * cs, y * cs, [C.gold, C.pink, C.teal, C.acc][k % 4], cs * 0.6, false); g.restore();
    }
  }

  // ---- scene drawers ------------------------------------------------------------------------------------
  function sceneDrawer(id, build, dyn) {
    return (ctx, S, box, p, d, info) => {
      const L = layout(S, box), t = info.t, exiting = info.exit !== undefined, off = stageOffsets(S, { ...info, index: exiting ? 0 : (info.t - info.local > 0.01 ? 1 : 0), change: info.change });
      const key = `${id}|${L.cs}|${L.ox}|${L.oy}|${L.nx}|${L.ny}|${JSON.stringify(d)}`;
      const P = memo(S, key, () => build(S, L, d));
      const pp = exiting ? 1 - info.exit : p;
      const ex = exiting ? -shiftOf(S) * sm(info.exit) : off.enter;
      ctx.save(); clipHoop(ctx, S); ctx.translate(ex + off.dx, off.dy);
      if (!exiting) ctx.globalAlpha = off.alpha;
      const lead = drawPat(ctx, P, pp, t, !exiting);
      if (dyn) dyn(ctx, S, L, pp, t, d, P);
      ctx.restore();
      if (lead) {
        ctx.save(); ctx.translate(ex + off.dx, off.dy);
        needle(ctx, S, lead.x, lead.y, lead.color, t, lead.done ? clamp(1 - (info.local - info.hold * 0.55) / 0.5) : 1, !lead.done);
        ctx.restore();
      }
    };
  }

  // ---- tokens -----------------------------------------------------------------------------------------
  const SKINS = ["#f1c7a4", "#d99f72", "#a96f47", "#7b4c30", "#efb69e"];
  const THR = { ink: "#26335f", red: "#cd3a4b", teal: "#2b9a93", gold: "#e8b23a", orange: "#e3802d", pink: "#ec8fa8", green: "#4a9a49", brown: "#7d4e2e", grey: "#9c9eb0", white: "#faf5e8", plum: "#7a4a9b", skins: SKINS };
  return {
    bg: "#e9dfc6", panel: "#f1e8d2", ink: "#26335f", muted: "#7d6f58", accent: "#cd3a4b", onAccent: "#faf5e8", rule: "#bda982", track: "#d9cdb0",
    display: SERIF, displayWeight: 700, displayCase: "uppercase", displayTracking: "0.04em", body: SERIF, bodyWeight: 600, figures: SERIF, radius: 0,
    motion: "type", change: "fade", kit: { line: 3, fill: "solid", panel: "fill" },
    thr: THR, table: "#5a3d27", wood: "#c8995a", keepArt: true, overlap: true,
    palettes: {
      light: { bg: "#f6f3ec", panel: "#ffffff", muted: "#8a8478", rule: "#cfc7b6", track: "#e6e0d2", table: "#8a7a62", wood: "#e2c08b", thr: { ...THR, ink: "#1f2c57", red: "#c92f45", teal: "#1f8f8a", gold: "#e3a82c", white: "#ffffff" } },
      dark: { bg: "#232846", panel: "#2d3354", ink: "#f3ead3", muted: "#a7a9c4", rule: "#4b5180", track: "#343a63", onAccent: "#232846", accent: "#ff6b7d", table: "#14101c", wood: "#8a6238",
        thr: { ink: "#f3ead3", red: "#ff6b7d", teal: "#4fd1c5", gold: "#ffcf5a", orange: "#ff9a4a", pink: "#ff9fbd", green: "#7ed06f", brown: "#c18a5a", grey: "#a9acc4", white: "#fff6e4", plum: "#b98af0", skins: SKINS } },
      mono: { bg: "#e8e4da", panel: "#f4f1e8", ink: "#262626", muted: "#6c6a62", accent: "#262626", onAccent: "#e8e4da", rule: "#b7b2a4", track: "#d6d1c4", table: "#4d4a44", wood: "#a29c8e",
        thr: { ink: "#262626", red: "#4a4a4a", teal: "#6e6e6e", gold: "#8d8d8d", orange: "#5c5c5c", pink: "#a5a5a5", green: "#777777", brown: "#3a3a3a", grey: "#b4b4b4", white: "#f6f6f4", plum: "#555555", skins: ["#c9c9c9", "#aaaaaa", "#8a8a8a", "#6c6c6c", "#b9b9b9"] } },
    },
    // Headings are stitched by the stage; the page's own text stays in the markup, unseen.
    css: () => ".display, .kicker { color: transparent !important; text-shadow: none !important; -webkit-text-fill-color: transparent !important; }",
    backdrop: (accent, texture, look) => look.bg,
    paint: (ctx, W, H) => { ctx.clearRect(0, 0, W, H); },
    stage,
    scenes: {
      chart: sceneDrawer("chart", chartPat, chartDyn), object: sceneDrawer("object", objectPat, objectDyn), people: sceneDrawer("people", peoplePat, peopleDyn),
      process: sceneDrawer("process", processPat, processDyn), compare: sceneDrawer("compare", comparePat, compareDyn),
    },
  };
});
