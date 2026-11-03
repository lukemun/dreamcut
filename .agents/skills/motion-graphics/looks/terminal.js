// Terminal: a phosphor CRT workstation. Text templates get black glass, phosphor mono and type-on
// lettering. The illustrated explainer gets the whole machine: a moulded housing around curved glass,
// a status row of scene "windows", gutters that keep counting, and every scene drawn in text mode as
// lit character cells (block-cell bar stacks, a dithered device screen, pixel-sprite people, a piped
// job runner, dot-matrix figures). The picture blooms, bows with barrel distortion, fringes red/blue,
// and a hum bar rolls through it. A beam wipe clears each scene as the next types in.
// All drawings are original. Frames are pure functions of time.
window.DreamcutMotion.register("terminal", ({ hexA }) => {
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const span = (v, a, b) => clamp((v - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const MONO = "Menlo, Consolas, 'DejaVu Sans Mono', 'Courier New', monospace";
  // A pure integer hash: the same inputs give the same value on every frame and every machine.
  const hash = (a, b = 0) => {
    let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35);
    h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2d); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  };
  function rgbOf(v) {
    const s = String(v || "");
    if (s[0] === "#") {
      const hx = s.length === 4 ? s.slice(1).split("").map((c) => c + c).join("") : s.slice(1, 7);
      const n = parseInt(hx, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const m = s.match(/rgba?\(([^)]+)\)/);
    return m ? m[1].split(",").slice(0, 3).map(Number) : [77, 255, 143];
  }
  const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mixc = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  const decimals = (v) => (Math.abs((Number(v) || 0) % 1) > 0.001 ? 1 : 0);
  const fmtN = (v, d) => window.DreamcutMotion.formatNumber(v, decimals(v), (d && d.prefix) || "", (d && d.suffix) || "");
  const tally = (v, k, d) => window.DreamcutMotion.formatNumber(v * k, decimals(v), (d && d.prefix) || "", (d && d.suffix) || "");
  const niceStep = (x) => { const p = Math.pow(10, Math.floor(Math.log10(Math.max(x, 1e-6)))), m = x / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };
  const SPIN = ["|", "/", "-", "\\"];

  // ---- text-mode lettering ---------------------------------------------------------------------------
  const font = (g, size, weight = 400) => { g.font = `${weight} ${size}px ${MONO}`; };
  function txt(g, s, x, y, size, color, o = {}) {
    font(g, size, o.weight || 400);
    g.fillStyle = color; g.textAlign = o.align || "left"; g.textBaseline = o.base || "alphabetic";
    g.fillText(String(s), x, y);
    return g.measureText(String(s)).width;
  }
  const tw = (g, s, size, weight = 400) => { font(g, size, weight); return g.measureText(String(s)).width; };
  function fitSize(g, s, maxW, size, min, weight = 400) {
    let z = size;
    while (z > min && tw(g, s, z, weight) > maxW) z = Math.max(min, z * 0.94);
    return z;
  }
  // Characters arrive one at a time behind a block cursor; the first one shows on the first frame.
  function typed(g, F, s, x, y, size, q, color, o = {}) {
    s = String(s ?? "");
    if (q <= 0 || !s) return 0;
    const n = Math.min(s.length, Math.ceil(s.length * clamp(q)));
    const weight = o.weight || 400;
    const full = tw(g, s, size, weight);
    const x0 = o.align === "center" ? x - full / 2 : o.align === "right" ? x - full : x;
    const w = txt(g, s.slice(0, n), x0, y, size, color, { weight, base: o.base });
    if (q < 1 || (o.cursor && Math.floor(F.t * 2.4) % 2 === 0)) {
      g.fillStyle = o.cursorColor || color;
      const top = o.base === "middle" ? y - size * 0.48 : y - size * 0.8;
      g.fillRect(x0 + w + size * 0.08, top, size * 0.55, size * 0.95);
    }
    return w;
  }
  // Reverse video: a lit block with the letters cut out of it.
  function tag(g, s, x, y, size, back, fore, o = {}) {
    font(g, size, o.weight || 700);
    const w = g.measureText(String(s)).width, pad = o.pad ?? size * 0.35, h = size * 1.3;
    const x0 = o.align === "center" ? x - (w + pad * 2) / 2 : o.align === "right" ? x - w - pad * 2 : x;
    g.fillStyle = back; g.fillRect(x0, y - h / 2, w + pad * 2, h);
    g.fillStyle = fore; g.textAlign = "left"; g.textBaseline = "middle";
    g.fillText(String(s), x0 + pad, y + size * 0.05);
    return w + pad * 2;
  }

  // Dot-matrix figures, 5x7 cells; unlit cells glow faintly so the matrix reads as hardware.
  const DM = {
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"], "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"], "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"], "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
    "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"], "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"], "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
    ",": ["00", "00", "00", "00", "00", "01", "10"], ".": ["00", "00", "00", "00", "00", "11", "11"],
    "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"], "-": ["0000", "0000", "0000", "1111", "0000", "0000", "0000"],
    "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"], "$": ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
    "k": ["10000", "10000", "10010", "10100", "11000", "10100", "10010"], "x": ["00000", "00000", "10001", "01010", "00100", "01010", "10001"],
    "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"], " ": ["000", "000", "000", "000", "000", "000", "000"],
  };
  const dmUnits = (s) => { let n = 0; for (const ch of String(s)) n += (DM[ch] ? DM[ch][0].length : 4) + 1; return Math.max(1, n - 1); };
  function dm(g, s, x, y, ds, on, off, align = "left") {
    s = String(s);
    const total = dmUnits(s) * ds;
    let cx = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
    const dot = ds * 0.8;
    for (const ch of s) {
      const G = DM[ch];
      if (!G) { txt(g, ch, cx, y + ds * 6.9, ds * 7.3, on, { weight: 700 }); cx += 5 * ds; continue; }
      for (let r = 0; r < 7; r++) for (let c = 0; c < G[r].length; c++) {
        const lit = G[r][c] === "1";
        if (!lit && !off) continue;
        g.fillStyle = lit ? on : off; g.fillRect(cx + c * ds, y + r * ds, dot, dot);
      }
      cx += (G[0].length + 1) * ds;
    }
    return total;
  }

  // Strokes that draw on part-way.
  function tracePts(g, pts, q) {
    if (q <= 0 || pts.length < 2) return;
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let left = total * clamp(q);
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], d = Math.hypot(bx - ax, by - ay);
      if (left >= d) { g.lineTo(bx, by); left -= d; } else { const k = d ? left / d : 0; g.lineTo(ax + (bx - ax) * k, ay + (by - ay) * k); break; }
    }
    g.stroke();
  }
  const traceRect = (g, x, y, w, h, q) => tracePts(g, [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]], q);
  const pen = (g, color, w, dash, off = 0) => { g.strokeStyle = color; g.lineWidth = w; g.setLineDash(dash || []); g.lineDashOffset = off; g.lineCap = "butt"; g.lineJoin = "miter"; };

  // ---- canvases and colour -----------------------------------------------------------------------------
  const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  let L1 = null, L2 = null, SB = null, TN = null, sizeKey = "";
  function ensure(W, H) {
    const key = `${W}x${H}`;
    if (key === sizeKey) return;
    sizeKey = key; L1 = mk(W, H); L2 = mk(W, H); SB = mk(Math.ceil(W / 4), Math.ceil(H / 4)); TN = mk(W, H);
  }
  const patterns = {};
  function pattern(g, name, u, build) {
    const key = `${name}:${u.toFixed(3)}`;
    if (!patterns[key]) patterns[key] = g.createPattern(build(), "repeat");
    return patterns[key];
  }
  function toneOf(look, accent) {
    const B = rgbOf(look.bg), light = lum(B) > 140;
    return {
      light, B, P: rgbOf(accent), I: rgbOf(look.ink), D: rgbOf(look.muted),
      shell: light ? ["#e3dcc8", "#cfc7b0", "#ada58e"] : ["#2b2d28", "#1b1d19", "#0c0d0b"],
    };
  }
  const screenOf = (W, H, u) => { const m = 30 * u; return { x: m, y: m, w: W - m * 2, h: H - m * 2, r: 58 * u }; };
  // The glass opening: rounded corners and sides that bow outward, as a tube face does.
  function screenPath(g, s, b) {
    const { x, y, w, h, r } = s;
    g.beginPath();
    g.moveTo(x + r, y); g.quadraticCurveTo(x + w / 2, y - b, x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.quadraticCurveTo(x + w + b, y + h / 2, x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.quadraticCurveTo(x + w / 2, y + h + b, x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.quadraticCurveTo(x - b, y + h / 2, x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }

  // ---- the plan: which scenes play, read from the template's controls ----------------------------------
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  const TAB = { title: "boot", chart: "stats", object: "device", people: "crew", process: "pipe", compare: "diff", closing: "exit" };
  const CMD = { title: "boot --fast", chart: "stats --plot", object: "inspect --device", people: "crew --online", process: "run --steps 3", compare: "diff before after", closing: "save && exit" };
  const HEADS = { title: ["kicker", "title"], chart: ["chart-title"], object: ["object-title"], people: ["people-title"], process: ["process-title"], compare: ["compare-title"], closing: ["closing"] };
  function controls() {
    if (window.__dreamcut && window.__dreamcut.controls) return window.__dreamcut.controls;
    try { if (typeof dc !== "undefined" && dc && dc.controls) return dc.controls; } catch (e) { /* not on this page */ }
    return null;
  }
  let planCache;
  function planOf() {
    if (planCache !== undefined) return planCache;
    const c = controls();
    if (!c) return (planCache = null);
    let t = 0;
    const shown = [];
    for (const id of ORDER) { const hold = Number(c[`${id}_hold`]) || 0; if (hold > 0) shown.push({ id, start: t, hold }); t += hold; }
    return (planCache = { shown, length: t, entrance: Number(c.entrance) || 0.7, change: Number(c.change) || 0.45 });
  }

  // Positions of each headline line on the page, read once from the layout (transforms ignored).
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
    out.box = { x: ox, w: el.offsetWidth, chars: Math.max(4, Math.min(40, (el.textContent || "").length)) };
    return (lineCache[id] = out);
  }
  // A small signal monitor beside a short headline (wide frames only).
  function monOf(F, id) {
    if (F.tall || !HEADS[id] || id === "title" || id === "closing") return null;
    const lines = headLines(`${id}-title`);
    if (!lines.length) return null;
    const right = Math.max(...lines.map((l) => l.x + l.w)), side = 140 * F.u;
    if (right > F.W - side - 520 * F.u) return null;
    return { x: F.W - side - 440 * F.u, y: lines[0].y + 2 * F.u, w: 440 * F.u, h: 132 * F.u };
  }
  // The drawing area for a scene: from just under its headline (and monitor) to the prompt row.
  function areaOf(F, id) {
    const { W, H, u, tall } = F, side = (tall ? 90 : 140) * u;
    let top = tall ? H * 0.3 : H * 0.34;
    const lines = headLines(`${id}-title`);
    if (lines.length) top = Math.min(top, Math.max(Math.max(...lines.map((l) => l.y + l.h)) + (tall ? 64 : 50) * u, H * 0.17));
    const mon = monOf(F, id);
    if (mon) top = Math.max(top, mon.y + mon.h + 34 * u);
    const bottom = H - (tall ? 210 : 100) * u;
    return { x: side, y: top, w: W - side * 2, h: bottom - top };
  }

  let FR = null;
  const col = (F, k, a = 1) => rgba(F.T[k], a);

  // ---- the machine: housing, glass and the always-on chrome --------------------------------------------
  function housing(ctx, F) {
    const { W, H, u, T } = F, s = F.scr;
    ctx.save();
    const gr = ctx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, T.shell[0]); gr.addColorStop(0.5, T.shell[1]); gr.addColorStop(1, T.shell[2]);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    // Moulded texture: fine speckle in the plastic.
    ctx.globalAlpha = 0.5 * F.S.look.texture;
    ctx.fillStyle = pattern(ctx, "speck" + T.light, u, () => {
      const c = mk(96, 96), x = c.getContext("2d");
      for (let i = 0; i < 520; i++) { const a = hash(i, 7), b = hash(i, 11), v = hash(i, 13); x.fillStyle = v > 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.12)"; x.fillRect(a * 96, b * 96, 1, 1); }
      return c;
    });
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    // A bevelled lip round the glass: lit from above, shadowed below.
    const lip = ctx.createLinearGradient(0, s.y - 20 * u, 0, s.y + s.h + 20 * u);
    lip.addColorStop(0, T.light ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.16)");
    lip.addColorStop(0.5, "rgba(0,0,0,0.25)");
    lip.addColorStop(1, T.light ? "rgba(70,60,40,0.45)" : "rgba(0,0,0,0.75)");
    screenPath(ctx, { ...s, x: s.x - 9 * u, y: s.y - 9 * u, w: s.w + 18 * u, h: s.h + 18 * u, r: s.r + 9 * u }, F.bow);
    ctx.strokeStyle = lip; ctx.lineWidth = 7 * u; ctx.stroke();
    // The tube face.
    screenPath(ctx, s, F.bow);
    ctx.fillStyle = rgba(T.B); ctx.fill();
    const glow = ctx.createRadialGradient(F.W * 0.5, F.H * 0.46, 0, F.W * 0.5, F.H * 0.5, Math.hypot(W, H) * 0.55);
    glow.addColorStop(0, rgba(T.P, T.light ? 0.03 : 0.07)); glow.addColorStop(1, rgba(T.P, 0));
    ctx.fillStyle = glow; ctx.fill();
    ctx.restore();
  }

  function chrome(g, F) {
    const { u, t, tall, info, W } = F, sc = F.scr, P = F.plan;
    const fs = (tall ? 19 : 21) * u, y = sc.y + 30 * u;
    // Status row: a reverse tag, the scene windows (current one lit), a running timecode.
    let x = sc.x + 44 * u;
    x += tag(g, "DCUT", x, y, fs, col(F, "P"), col(F, "B")) + 18 * u;
    const idx = P ? P.shown.findIndex((s) => s.id === info.scene) : -1;
    if (P && info.scene) {
      if (!tall) {
        P.shown.forEach((st, i) => {
          const label = `${i + 1}:${TAB[st.id]}`;
          if (st.id === info.scene) x += tag(g, label + "*", x, y, fs, col(F, "I", 0.9), col(F, "B"), { weight: 700 }) + 14 * u;
          else x += txt(g, label, x, y, fs, col(F, i < idx ? "I" : "D", i < idx ? 0.7 : 0.8), { base: "middle" }) + 22 * u;
        });
      } else {
        txt(g, `[${idx + 1}/${P.shown.length}] ${TAB[info.scene]}`, x, y, fs, col(F, "I", 0.9), { base: "middle", weight: 700 });
      }
    }
    const fr = Math.floor(t * 30), p2 = (n) => String(n).padStart(2, "0");
    txt(g, `${SPIN[Math.floor(t * 8) % 4]} ${p2(Math.floor(fr / 1800))}:${p2(Math.floor(fr / 30) % 60)}:${p2(fr % 30)}`, sc.x + sc.w - 44 * u, y, fs, col(F, "I", 0.85), { align: "right", base: "middle" });
    pen(g, col(F, "D", 0.55), 1.5 * u, [10 * u, 8 * u], -t * 24 * u);
    g.beginPath(); g.moveTo(sc.x + 40 * u, sc.y + 54 * u); g.lineTo(sc.x + sc.w - 40 * u, sc.y + 54 * u); g.stroke();
    g.setLineDash([]);
    // Left gutter: line numbers that keep counting as the session logs.
    const pitch = 34 * u, y0 = sc.y + (tall ? 150 : 104) * u, rows = Math.floor((sc.h - (tall ? 330 : 190) * u) / pitch), base = Math.floor(t * 2.4);
    const lit = Math.floor(t * 2.4) % Math.max(1, rows);
    for (let r = 0; r < rows; r++) {
      const n = String(base + r + 1).padStart(tall ? 3 : 4, "0");
      txt(g, n, sc.x + 14 * u, y0 + r * pitch, (tall ? 15 : 17) * u, col(F, r === lit ? "P" : "D", r === lit ? 0.95 : 0.4));
    }
    // Right gutter: twin level meters.
    const cells = tall ? 30 : 20, ch = 15 * u, mh = cells * ch, my = sc.y + sc.h / 2 + mh / 2, mx = sc.x + sc.w - (tall ? 22 : 34) * u;
    for (let k = 0; k < 2; k++) {
      const lv = clamp(0.5 + 0.28 * Math.sin(t * (1.6 + k * 0.7) + k) + 0.22 * (hash(Math.floor(t * 9), k) - 0.5));
      const on = Math.round(lv * cells), peak = Math.round(clamp(lv + 0.12 + 0.05 * Math.sin(t * 0.7 + k)) * cells);
      for (let i = 0; i < cells; i++) {
        const hot = i >= cells - 4;
        g.fillStyle = i < on ? col(F, hot ? "P" : "I", hot ? 1 : 0.7) : i === peak ? col(F, "P", 0.9) : col(F, "D", 0.12);
        g.fillRect(mx + k * 11 * u, my - (i + 1) * ch + 2 * u, 8 * u, ch - 4 * u);
      }
    }
    // Prompt row: the command for this scene types, then the cursor waits.
    const by = sc.y + sc.h - (tall ? 46 : 24) * u, pfs = (tall ? 24 : 23) * u;
    let px = sc.x + 44 * u;
    px += txt(g, "dc:~$ ", px, by, pfs, col(F, "P"), { weight: 700 });
    const cmd = info.scene ? CMD[info.scene] : "";
    typed(g, F, cmd, px, by, pfs, span(info.local, 0.05, 0.6), col(F, "I", 0.95), { cursor: true, cursorColor: col(F, "P") });
    // Activity strip at the right of the prompt.
    const n = tall ? 22 : 30, bw = 7 * u, sx = sc.x + sc.w - 44 * u - n * (bw + 4 * u);
    for (let k = 0; k < n; k++) {
      const v = 0.25 + 0.75 * hash(k + Math.floor(t * 10), 3) * (0.6 + 0.4 * Math.sin(k * 0.5 + t * 3));
      g.fillStyle = col(F, k > n - 6 ? "P" : "I", 0.75);
      const h = Math.max(3 * u, v * 26 * u);
      g.fillRect(sx + k * (bw + 4 * u), by - h, bw, h);
    }
    if (!tall) txt(g, "30fps  proxy ok", sx - 24 * u, by, 19 * u, col(F, "D", 0.9), { align: "right" });
    if (tall) {
      // A ticker scrolls above the prompt in tall frames, where the foot of the screen has room.
      const ty = by - 62 * u, msg = "  preview live  ·  30 fps  ·  proxies ready  ·  timeline.json saved  ·  waiting for review  ·", mw = tw(g, msg, 20 * u);
      g.save(); g.beginPath(); g.rect(sc.x + 40 * u, ty - 30 * u, sc.w - 80 * u, 40 * u); g.clip();
      const off = (t * 70 * u) % mw;
      for (let k = -1; k < 3; k++) txt(g, msg, sc.x + 40 * u - off + k * mw, ty, 20 * u, col(F, "D", 0.9));
      g.restore();
      pen(g, col(F, "D", 0.4), 1.2 * u, [4 * u, 6 * u]);
      g.beginPath(); g.moveTo(sc.x + 40 * u, ty - 36 * u); g.lineTo(sc.x + sc.w - 40 * u, ty - 36 * u); g.stroke(); g.setLineDash([]);
    }
    // Signal monitor beside a short headline.
    const mon = info.scene && monOf(F, info.scene);
    if (mon) {
      const q = span(info.local, 0.1, 0.45);
      pen(g, col(F, "D", 0.7), 1.5 * u);
      traceRect(g, mon.x, mon.y, mon.w, mon.h, q);
      if (q > 0.5) {
        txt(g, "SIG", mon.x + 14 * u, mon.y + 26 * u, 18 * u, col(F, "D"), { weight: 700 });
        txt(g, `${(62 + 30 * Math.abs(Math.sin(t * 0.9))).toFixed(1)}%`, mon.x + mon.w - 14 * u, mon.y + 26 * u, 18 * u, col(F, "I", 0.9), { align: "right" });
        const mid = mon.y + mon.h * 0.6, x0 = mon.x + 14 * u, x1 = mon.x + mon.w - 14 * u;
        pen(g, col(F, "D", 0.3), 1 * u, [2 * u, 6 * u]);
        g.beginPath(); g.moveTo(x0, mid); g.lineTo(x1, mid); g.stroke(); g.setLineDash([]);
        g.beginPath();
        for (let i = 0; i <= 90; i++) {
          const k = i / 90, xx = lerp(x0, x1, k) * 1, ph = k * 26 - t * 6;
          const env = Math.exp(-Math.pow(((k - ((t * 0.35) % 1.4) + 0.2) * 6), 2));
          const yy = mid - (Math.sin(ph) * 10 + Math.sin(ph * 0.37 + t) * 8 + env * 28 * Math.sin(ph * 3)) * u;
          i ? g.lineTo(xx, yy) : g.moveTo(xx, yy);
        }
        pen(g, col(F, "P"), 2.2 * u); g.stroke();
      }
    }
  }

  // A text-mode window round each scene: traced outline, bright corner brackets, a reverse name tab.
  function win(g, F, A, local, name) {
    const u = F.u, q = ease(local / 0.35);
    pen(g, col(F, "P", 0.45), 2 * u);
    traceRect(g, A.x, A.y, A.w, A.h, q);
    const c = 26 * u;
    pen(g, col(F, "P"), 4 * u);
    for (const [x, y, dx, dy] of [[A.x, A.y, 1, 1], [A.x + A.w, A.y, -1, 1], [A.x, A.y + A.h, 1, -1], [A.x + A.w, A.y + A.h, -1, -1]]) {
      g.beginPath(); g.moveTo(x + dx * c * q, y); g.lineTo(x, y); g.lineTo(x, y + dy * c * q); g.stroke();
    }
    if (q > 0.3) {
      tag(g, ` ${name} `, A.x + 36 * u, A.y, 21 * u, col(F, "P"), col(F, "B"));
      const meta = `rx ${String(Math.floor(F.t * 37) % 10000).padStart(4, "0")}`;
      const mw = tw(g, meta, 19 * u) + 20 * u;
      g.fillStyle = col(F, "B"); g.fillRect(A.x + A.w - 40 * u - mw, A.y - 14 * u, mw, 28 * u);
      txt(g, meta, A.x + A.w - 50 * u, A.y, 19 * u, col(F, "D"), { align: "right", base: "middle" });
    }
  }
  const inner = (F, A, top = 46) => { const u = F.u, pad = 34 * u; return { x: A.x + pad, y: A.y + top * u, w: A.w - pad * 2, h: A.h - top * u - pad }; };

  // ---- scenes ----------------------------------------------------------------------------------------
  // Stats: bars are stacks of lit cells that climb one cell at a time; a readout holds the chosen bar in
  // dot-matrix figures over a log that keeps tailing.
  function chart(g, F, A, d, info) {
    const { u, t, tall } = F, local = info.local, build = span(local, 0.12, 0.12 + Math.min(2.2, info.hold * 0.6));
    win(g, F, A, local, "stats.dat");
    const I = inner(F, A);
    const vals = d.values.map((v) => Math.max(0, Number(v) || 0)), n = vals.length;
    const max = Math.max(...vals, 1), arg = vals.indexOf(Math.max(...vals));
    const hi = Number.isInteger(d.highlight) && d.highlight >= 0 && d.highlight < n ? d.highlight : arg;
    const C = tall ? { x: I.x, y: I.y, w: I.w, h: I.h * 0.6 } : { x: I.x, y: I.y, w: I.w * 0.64, h: I.h };
    const R = tall ? { x: I.x, y: I.y + I.h * 0.6 + 40 * u, w: I.w, h: I.h * 0.4 - 40 * u } : { x: I.x + I.w * 0.64 + 50 * u, y: I.y, w: I.w * 0.36 - 50 * u, h: I.h };
    const axisW = 80 * u, labH = 80 * u, valH = 74 * u, base = C.y + C.h - labH, top = C.y + valH, ph = base - top;
    const step = niceStep(max / 4), ymax = Math.ceil(max / step) * step;
    for (let k = 0; k * step <= ymax + 1e-9; k++) {
      const y = base - ph * ((k * step) / ymax), q = span(local, k * 0.05, 0.3 + k * 0.05);
      pen(g, col(F, "D", k ? 0.32 : 0.8), (k ? 1.2 : 2) * u, k ? [3 * u, 9 * u] : []);
      tracePts(g, [[C.x + axisW, y], [C.x + C.w, y]], q);
      if (q > 0.2) txt(g, fmtN(k * step, d), C.x + axisW - 14 * u, y, 20 * u, col(F, "D"), { align: "right", base: "middle" });
    }
    g.setLineDash([]);
    const slot = (C.w - axisW) / n, bw = Math.min(slot * 0.6, 230 * u), slabH = 17 * u, gap = 5 * u, slabs = Math.floor(ph / slabH);
    vals.forEach((v, i) => {
      const qi = ease(span(build, i * 0.13, i * 0.13 + 0.55)), cx = C.x + axisW + slot * (i + 0.5), x = cx - bw / 2, hot = i === hi;
      const total = v > 0 ? Math.max(1, Math.round((ph * v) / ymax / slabH)) : 0, shown = Math.round(total * qi);
      for (let s = 0; s < slabs; s++) {
        const y = base - (s + 1) * slabH + gap / 2;
        if (s < shown) {
          const flick = s === shown - 1 ? 0.75 + 0.25 * hash(Math.floor(t * 12), i) : 1;
          g.fillStyle = s === shown - 1 && qi < 1 ? rgba(mixc(F.T.P, [255, 255, 255], F.T.light ? 0 : 0.6)) : col(F, hot ? "P" : "I", (hot ? 1 : 0.72) * flick);
        } else g.fillStyle = col(F, "D", 0.09);
        g.fillRect(x, y, bw, slabH - gap);
      }
      if (qi > 0) txt(g, tally(v, qi, d), cx, base - shown * slabH - 18 * u, 44 * u, col(F, hot ? "P" : "I"), { align: "center", weight: 700 });
      const lab = String(d.labels[i] ?? ""), ls = fitSize(g, lab, slot * 0.9, 42 * u, 32 * u, 700), lq = span(local, 0.1 + i * 0.08, 0.5 + i * 0.08);
      if (lq > 0 && lab) {
        if (hot && lq >= 1) tag(g, lab, cx, base + 44 * u, ls, col(F, "P"), col(F, "B"), { align: "center" });
        else typed(g, F, lab, cx, base + 44 * u, ls, lq, col(F, hot ? "P" : "I", 0.85), { align: "center", base: "middle", weight: 700 });
      }
    });
    // A read head sweeps the bars while the scene holds; the mean line marches.
    if (build > 0.4) {
      const k = ((local * 0.42) % 1), sx = C.x + axisW + k * (C.w - axisW);
      g.fillStyle = col(F, "P", 0.07); g.fillRect(sx - 30 * u, top, 60 * u, ph);
      g.fillStyle = col(F, "P", 0.8); g.fillRect(sx - 1.5 * u, top, 3 * u, ph);
      const mean = vals.reduce((a, b) => a + b, 0) / n, my = base - ph * ((mean * ease(span(build, 0.4, 0.8))) / ymax);
      pen(g, col(F, "I", 0.7), 2 * u, [14 * u, 10 * u], -t * 40 * u);
      g.beginPath(); g.moveTo(C.x + axisW, my); g.lineTo(C.x + C.w, my); g.stroke(); g.setLineDash([]);
      txt(g, "avg", C.x + C.w - 6 * u, my - 10 * u, 20 * u, col(F, "I", 0.85), { align: "right" });
    }
    // Readout.
    const rq = span(local, 0.2, 0.6), sum = vals.reduce((a, b) => a + b, 0);
    const colW = tall ? R.w * 0.5 - 20 * u : R.w;
    if (rq > 0) {
      txt(g, "> selected", R.x, R.y + 12 * u, 21 * u, col(F, "D"), { base: "middle" });
      const lab = String(d.labels[hi] ?? ""), ls = fitSize(g, lab, colW, 44 * u, 32 * u, 700);
      typed(g, F, lab, R.x, R.y + 62 * u, ls, span(local, 0.25, 0.7), col(F, "P"), { base: "middle", weight: 700 });
      const s = tally(vals[hi], ease(span(build, hi * 0.13, hi * 0.13 + 0.6)), d), ds = Math.max(9 * u, Math.min(16 * u, colW / dmUnits(s)));
      dm(g, s, R.x, R.y + 108 * u, ds, col(F, "P"), col(F, "D", 0.1));
      const pct = sum ? Math.round((vals[hi] / sum) * 100) : 0;
      txt(g, `${pct}% of ${fmtN(sum, d)} total`, R.x, R.y + 108 * u + ds * 7 + 40 * u, 22 * u, col(F, "I", 0.8));
    }
    // Log tail.
    const lines = vals.map((v, i) => `${String(d.labels[i] || `#${i + 1}`).slice(0, 8).padEnd(8)} ${fmtN(v, d).padStart(6)} ${"#".repeat(Math.max(1, Math.round((v / max) * 8)))}`);
    lines.push(`sum  ${fmtN(sum, d)}`, `mean ${fmtN(Math.round((sum / n) * 10) / 10, d)}`, `peak ${d.labels[arg] || ""}`, `rows ${n}  ok`);
    const lx = tall ? R.x + R.w * 0.5 + 20 * u : R.x, ly0 = tall ? R.y + 10 * u : R.y + 108 * u + 16 * 7 * u + 100 * u, ly1 = R.y + R.h, pitch = 31 * u;
    const rows = Math.max(0, Math.floor((ly1 - ly0) / pitch));
    if (rows > 0 && local > 0.3) {
      if (!tall) { pen(g, col(F, "D", 0.5), 1.2 * u, [4 * u, 6 * u]); g.beginPath(); g.moveTo(R.x, ly0 - 30 * u); g.lineTo(R.x + R.w, ly0 - 30 * u); g.stroke(); g.setLineDash([]); }
      const rate = 2.6, f = (local - 0.3) * rate, count = Math.floor(f) + 1;
      for (let r = 0; r < Math.min(rows, count); r++) {
        const k = count - Math.min(rows, count) + r, newest = k === count - 1;
        const s = lines[k % lines.length];
        typed(g, F, s, lx, ly0 + r * pitch, 21 * u, newest ? clamp((f % 1) * 2.5) : 1, col(F, newest ? "P" : "I", newest ? 1 : 0.62));
      }
    }
  }

  // Ordered dither, as a text-mode screen fakes tone.
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function dither(g, F, R, rev, hotColor) {
    const { u, t } = F, cell = 8 * u, cols = Math.floor(R.w / cell), rows = Math.floor(R.h / cell), shownRows = Math.floor(rows * clamp(rev));
    const sunX = 0.66 + 0.1 * Math.sin(t * 0.45), sunY = 0.34 + 0.06 * Math.sin(t * 0.3);
    g.fillStyle = hotColor;
    for (let r = 0; r < shownRows; r++) {
      const ny = r / rows;
      for (let c = 0; c < cols; c++) {
        const nx = c / cols;
        let v = 0.08 + 0.32 * ny;
        const ds = Math.hypot((nx - sunX) * 1.7, ny - sunY);
        v += ds < 0.11 ? 1 : 0.32 * Math.exp(-ds * 5);
        const h1 = 0.6 + 0.07 * Math.sin(nx * 7 + 1.3 + t * 0.15) + 0.025 * Math.sin(nx * 23);
        const h2 = 0.78 + 0.05 * Math.sin(nx * 5 - t * 0.5) + 0.02 * Math.sin(nx * 17 + t);
        if (ny > h1) v = 0.42 + 0.12 * Math.sin(nx * 31);
        if (ny > h2) v = 0.18 + 0.5 * Math.max(0, Math.sin(nx * 60 + ny * 20 - t * 3)) * (ny - h2) * 4;
        if (v > (BAYER[(r % 4) * 4 + (c % 4)] + 0.5) / 16) g.fillRect(R.x + c * cell, R.y + r * cell, cell - 2 * u, cell - 2 * u);
      }
    }
    if (rev < 1) { g.fillStyle = col(F, "P"); g.fillRect(R.x, R.y + shownRows * cell, R.w, 3 * u); g.fillStyle = hotColor; }
  }

  // Device: a laptop or phone traced in line-work; its screen shows a dithered live picture over a
  // three-track timeline with a moving playhead. Leaders march out to typed labels.
  function object(g, F, A, d, info) {
    const { u, t, tall } = F, local = info.local, build = span(local, 0.1, 0.1 + Math.min(2.4, info.hold * 0.62));
    const phone = d.kind === "phone";
    win(g, F, A, local, phone ? "phone.scan" : "laptop.scan");
    const I = inner(F, A, 54);
    const Dv = tall ? { x: I.x, y: I.y, w: I.w, h: I.h * 0.56 } : { x: I.x, y: I.y, w: I.w * 0.56, h: I.h };
    let dev;
    if (phone) { const h = Dv.h * 0.96, w = Math.min(h * 0.52, Dv.w * 0.6); dev = { x: Dv.x + (Dv.w - w) / (tall ? 1.4 : 2), y: Dv.y + (Dv.h - h) / 2, w, h }; }
    else { const w = Math.min(Dv.w * (tall ? 0.8 : 0.96), Dv.h * 1.25), h = w * 0.62; dev = { x: tall ? Dv.x + Dv.w - w : Dv.x + (Dv.w - w) / 2, y: Dv.y + (Dv.h - h * 1.24) / 2, w, h }; }
    const qo = ease(span(local, 0, 0.6)), bez = (phone ? 22 : 20) * u;
    pen(g, col(F, "I", 0.85), 3 * u); traceRect(g, dev.x, dev.y, dev.w, dev.h, qo);
    pen(g, col(F, "I", 0.45), 1.5 * u); traceRect(g, dev.x + 7 * u, dev.y + 7 * u, dev.w - 14 * u, dev.h - 14 * u, qo);
    const S = { x: dev.x + bez, y: dev.y + bez, w: dev.w - bez * 2, h: dev.h - bez * 2 };
    if (!phone) {
      // The deck: a keyboard of cells; keys light as someone types.
      const ky = dev.y + dev.h, kh = dev.h * 0.2, ox = dev.w * 0.06;
      pen(g, col(F, "I", 0.85), 3 * u);
      tracePts(g, [[dev.x, ky], [dev.x + dev.w, ky], [dev.x + dev.w + ox, ky + kh], [dev.x - ox, ky + kh], [dev.x, ky]], qo);
      const kr = 4, kc = 16;
      for (let r = 0; r < kr; r++) for (let c = 0; c < kc; c++) {
        const k = r * kc + c;
        if (span(local, 0.2 + k * 0.004, 0.3 + k * 0.004) <= 0) continue;
        const rowW = lerp(dev.w * 0.9, dev.w * 1.02, (r + 0.5) / kr), x0 = dev.x + (dev.w - rowW) / 2, kw = rowW / kc;
        const yk = ky + kh * 0.12 + r * (kh * 0.76 / kr);
        g.fillStyle = hash(k, Math.floor(t * 9)) > 0.93 ? col(F, "P") : col(F, "D", 0.45);
        g.fillRect(x0 + c * kw + 2 * u, yk + 2 * u, kw - 4 * u, kh * 0.76 / kr - 4 * u);
      }
    } else {
      g.fillStyle = col(F, "I", 0.6); g.fillRect(dev.x + dev.w / 2 - 30 * u, dev.y + 9 * u, 60 * u, 5 * u);
    }
    // Screen: preview, inspector and tracks.
    const Pv = phone ? { x: S.x + S.w * 0.06, y: S.y + S.h * 0.06, w: S.w * 0.88, h: S.h * 0.4 } : { x: S.x + S.w * 0.04, y: S.y + S.h * 0.06, w: S.w * 0.6, h: S.h * 0.52 };
    if (local > 0.15) {
      dither(g, F, Pv, span(local, 0.15, 0.9), col(F, "P", 0.9));
      pen(g, col(F, "I", 0.55), 1.5 * u); traceRect(g, Pv.x - 4 * u, Pv.y - 4 * u, Pv.w + 8 * u, Pv.h + 8 * u, 1);
    }
    const Ins = phone ? { x: Pv.x, y: Pv.y + Pv.h + 14 * u, w: Pv.w, h: S.h * 0.06 } : { x: Pv.x + Pv.w + S.w * 0.04, y: Pv.y, w: S.w * 0.28, h: Pv.h };
    const insRows = phone ? 1 : 6;
    for (let r = 0; r < insRows; r++) {
      if (span(local, 0.3 + r * 0.06, 0.5) <= 0) continue;
      const yy = Ins.y + (r + 0.5) * (Ins.h / insRows), lw = Ins.w * (0.35 + 0.3 * hash(r, 5));
      g.fillStyle = col(F, "D", 0.7); g.fillRect(Ins.x, yy - 4 * u, lw * 0.45, 8 * u);
      g.fillStyle = col(F, "D", 0.25); g.fillRect(Ins.x + Ins.w * 0.5, yy - 2 * u, Ins.w * 0.5, 4 * u);
      const kx = Ins.x + Ins.w * (0.5 + 0.5 * (0.5 + 0.4 * Math.sin(t * (0.6 + r * 0.17) + r)));
      g.fillStyle = col(F, r === 2 ? "P" : "I", 0.9); g.fillRect(kx - 5 * u, yy - 9 * u, 10 * u, 18 * u);
    }
    const Tr = phone ? { x: S.x + S.w * 0.06, y: S.y + S.h * 0.6, w: S.w * 0.88, h: S.h * 0.32 } : { x: S.x + S.w * 0.04, y: S.y + S.h * 0.66, w: S.w * 0.92, h: S.h * 0.28 };
    const CL = [[[0.0, 0.3], [0.33, 0.24], [0.6, 0.34]], [[0.05, 0.42], [0.5, 0.2], [0.74, 0.22]], [[0.0, 0.18], [0.22, 0.5], [0.76, 0.24]]];
    const th = Tr.h / 3;
    let hotClip = null, trackAnchor = null;
    CL.forEach((row, r) => row.forEach(([a, w], i) => {
      const q = span(local, 0.35 + r * 0.1 + i * 0.06, 0.6 + r * 0.1 + i * 0.06);
      if (q <= 0) return;
      const x = Tr.x + a * Tr.w, y = Tr.y + r * th + 3 * u, cw = w * Tr.w * ease(q) - 4 * u, h = th - 6 * u, hot = r === 0 && i === 1;
      if (hot) { g.fillStyle = col(F, "P", 0.85 + 0.15 * Math.sin(t * 5)); g.fillRect(x, y, cw, h); hotClip = [x + (w * Tr.w) / 2, y + h / 2]; }
      else { g.fillStyle = col(F, "I", 0.22); g.fillRect(x, y, cw, h); pen(g, col(F, "I", 0.7), 1.5 * u); g.strokeRect(x, y, cw, h); }
      if (r === 2 && i === 1) trackAnchor = [x + 30 * u, y + h / 2];
    }));
    if (local > 0.5) {
      const phx = Tr.x + ((t * 0.11) % 1) * Tr.w;
      g.fillStyle = col(F, "P"); g.fillRect(phx - 1.5 * u, Tr.y - 12 * u, 3 * u, Tr.h + 14 * u);
      g.beginPath(); g.moveTo(phx - 8 * u, Tr.y - 18 * u); g.lineTo(phx + 8 * u, Tr.y - 18 * u); g.lineTo(phx, Tr.y - 8 * u); g.closePath(); g.fill();
    }
    // Callouts.
    const anchors = [[Pv.x + Pv.w * 0.72, Pv.y + Pv.h * 0.32], hotClip || [Tr.x + Tr.w * 0.45, Tr.y + th / 2], trackAnchor || [Tr.x + Tr.w * 0.3, Tr.y + th * 2.5]];
    const lx = tall ? I.x + 96 * u : I.x + I.w * 0.63, labW = tall ? I.w - 96 * u : I.w * 0.37;
    const lyOf = (i) => (tall ? Dv.y + Dv.h + 80 * u + i * ((I.y + I.h - (Dv.y + Dv.h) - 110 * u) / 3) : I.y + I.h * (0.16 + i * 0.32));
    d.callouts.forEach((label, i) => {
      const q = span(build, 0.22 + i * 0.16, 0.46 + i * 0.16);
      if (q <= 0 || !label) return;
      const [ax, ay] = anchors[i], ly = lyOf(i);
      const pulse = 1 + 0.25 * Math.sin(t * 4 + i * 2), rr = 13 * u * pulse;
      pen(g, col(F, "P"), 2.5 * u);
      g.strokeRect(ax - rr, ay - rr, rr * 2, rr * 2);
      g.fillStyle = col(F, "P"); g.fillRect(ax - 4 * u, ay - 4 * u, 8 * u, 8 * u);
      const pts = tall ? [[ax, ay], [I.x + 30 * u + i * 20 * u, ay], [I.x + 30 * u + i * 20 * u, ly], [lx - 16 * u, ly]]
        : [[ax, ay], [Dv.x + Dv.w + 40 * u + i * 26 * u, ay], [Dv.x + Dv.w + 40 * u + i * 26 * u, ly], [lx - 16 * u, ly]];
      pen(g, col(F, "P", 0.9), 3 * u, [3 * u, 7 * u], -t * 36 * u);
      g.lineCap = "round";
      tracePts(g, pts, q);
      g.setLineDash([]);
      const tq = span(build, 0.36 + i * 0.16, 0.56 + i * 0.16);
      if (tq > 0) {
        const tagW = tag(g, `0${i + 1}`, lx, ly, 24 * u, col(F, "P"), col(F, "B"));
        const size = fitSize(g, label, labW - tagW - 30 * u, 44 * u, 34 * u, 700);
        typed(g, F, label, lx + tagW + 18 * u, ly, size, tq, col(F, "I"), { base: "middle", weight: 700, cursor: i === 2, cursorColor: col(F, "P") });
      }
    });
  }

  // People: original pixel sprites, decoded row by row out of static, idling and blinking; one is
  // speaking. A bus line underneath carries packets between them.
  const SPR = {};
  function spriteOf(i) {
    const key = i % 4;
    if (SPR[key]) return SPR[key];
    const rows = ["............", "............", "...######...", "..########..", "..##e##e##..", "..########..", "..#m####m#..", "..##mmmm##..",
      "...######...", ".....##.....", "..########..", ".##########.", "############", "############"].map((r) => r.split(""));
    const HAIR = [
      { 1: "...hhhhhh...", 2: "..hhhhhhhh.." },
      { 1: "...hhhhhh...", 2: "..hhhhhhhh..", 3: ".hh......hh.", 4: ".h........h.", 5: ".h........h.", 6: ".h........h.", 7: ".h........h.", 8: ".hh......hh." },
      { 0: ".....hh.....", 1: "..hhhhhhhh..", 2: ".hhhhhhhhhh.", 3: ".h........h." },
      { 0: "...h.hh.h...", 1: "..hhhhhhhh..", 2: ".hhhhhhhhhh.", 3: ".hh......hh." },
    ][key];
    for (const [r, s] of Object.entries(HAIR)) s.split("").forEach((ch, c) => { if (ch === "h") rows[r][c] = "h"; });
    if (key % 2) { rows[10][5] = "m"; rows[10][6] = "m"; rows[11][5] = "m"; rows[11][6] = "m"; }
    return (SPR[key] = rows);
  }
  function people(g, F, A, d, info) {
    const { u, t, tall } = F, local = info.local, build = span(local, 0.1, 0.1 + Math.min(2.2, info.hold * 0.6));
    win(g, F, A, local, "crew.who");
    const I = inner(F, A, 50);
    const n = Math.max(2, Math.min(6, Math.round(Number(d.count) || 4)));
    const hi = Math.min(n - 1, d.highlight ?? 1);
    const cols = tall ? (n <= 2 ? 2 : n <= 4 ? 2 : 3) : n, rws = Math.ceil(n / cols);
    const cw = I.w / cols, chh = I.h / rws;
    const px = Math.max(5 * u, Math.min((cw * 0.62) / 12, (chh - 200 * u) / 14));
    const sw = px * 12, sh = px * 14;
    const badges = d.badges.filter((b) => b != null);
    if (local > 0.2) {
      const up = Math.floor(F.t + 754), p2 = (v) => String(v).padStart(2, "0");
      typed(g, F, `${n} online · 1 talking`, I.x, I.y + 8 * u, 21 * u, span(local, 0.2, 0.7), col(F, "I", 0.8), { base: "middle" });
      txt(g, `uptime ${p2(Math.floor(up / 3600))}:${p2(Math.floor(up / 60) % 60)}:${p2(up % 60)}`, I.x + I.w, I.y + 8 * u, 21 * u, col(F, "D"), { align: "right", base: "middle" });
    }
    for (let i = 0; i < n; i++) {
      const c = i % cols, r = Math.floor(i / cols), cx = I.x + cw * (c + 0.5);
      const block = 30 * u + sh + 16 * u + 26 * u + 18 * u + 52 * u;
      const top = I.y + chh * r + (chh - block - 30 * u) / 2;
      const q = span(build, i * 0.1, i * 0.1 + 0.42), hot = i === hi;
      if (q <= 0 && local < 0.05) continue;
      const body = col(F, hot ? "P" : "I", hot ? 1 : 0.85), hair = col(F, hot ? "P" : "D", hot ? 0.55 : 0.95);
      // status row
      const on = Math.floor(t * 1.6 + i * 0.7) % 4 !== 0;
      g.fillStyle = col(F, "P", on ? 1 : 0.25); g.fillRect(cx - sw / 2, top + 6 * u, 12 * u, 12 * u);
      txt(g, hot ? "talking" : "online", cx - sw / 2 + 20 * u, top + 12 * u, 18 * u, col(F, hot ? "P" : "D"), { base: "middle" });
      const spr = spriteOf(i), resolved = Math.floor(14 * ease(q));
      const bob = Math.round(Math.sin(t * 1.9 + i * 1.3)) * px * 0.5, sy = top + 30 * u + bob, sx = cx - sw / 2;
      const blink = (t * 0.29 + i * 0.237) % 1 < 0.05;
      const fr = Math.floor(t * 20);
      for (let rr = 0; rr < 14; rr++) for (let cc = 0; cc < 12; cc++) {
        const ch = spr[rr][cc];
        if (ch === "." || ch === "m" || (ch === "e" && !blink)) continue;
        if (rr >= resolved) {
          if (hash(rr * 12 + cc + i * 211, fr) > 0.55) { g.fillStyle = col(F, "D", 0.35); g.fillRect(sx + cc * px, sy + rr * px, px - 1.5 * u, px - 1.5 * u); }
          continue;
        }
        // Hair is drawn as half-height scan cells so it reads as a different texture from skin.
        if (ch === "h") { g.fillStyle = hair; g.fillRect(sx + cc * px, sy + rr * px + ((cc + rr) % 2 ? px * 0.45 : 0), px - 1.5 * u, px * 0.5); continue; }
        g.fillStyle = body;
        g.fillRect(sx + cc * px, sy + rr * px, px - 1.5 * u, px - 1.5 * u);
      }
      if (resolved < 14 && q > 0) { g.fillStyle = col(F, "P"); g.fillRect(sx - 6 * u, sy + resolved * px, sw + 12 * u, 2 * u); }
      const hy = top + 30 * u + sh + 16 * u + 13 * u;
      if (q > 0.3) txt(g, `usr0${i + 1}`, cx, hy, 20 * u, col(F, "D"), { align: "center", base: "middle" });
      const label = badges.length ? String(badges[i % badges.length]) : "", by = hy + 18 * u + 34 * u;
      const lq = span(build, 0.22 + i * 0.1, 0.5 + i * 0.1);
      if (label && lq > 0) {
        const size = fitSize(g, label, cw * 0.88, 42 * u, 32 * u, 700);
        if (hot && lq >= 1) tag(g, label, cx, by, size, col(F, "P"), col(F, "B"), { align: "center" });
        else typed(g, F, label, cx, by, size, lq, col(F, "I"), { align: "center", base: "middle", weight: 700 });
      }
      // The speaker's bubble: a live waveform.
      if (hot && q >= 1) {
        const bw2 = 120 * u, bh = 60 * u;
        let bx = sx + sw + 10 * u;
        if (bx + bw2 > I.x + I.w) bx = sx - 10 * u - bw2;
        const byy = sy - 6 * u;
        pen(g, col(F, "P"), 2.5 * u); g.strokeRect(bx, byy, bw2, bh);
        g.beginPath(); const tx = bx < sx ? bx + bw2 : bx; g.moveTo(tx, byy + bh * 0.6); g.lineTo(tx + (bx < sx ? 16 : -16) * u, byy + bh * 0.9); g.lineTo(tx, byy + bh * 0.85); g.stroke();
        for (let k = 0; k < 8; k++) {
          const hh = (0.25 + 0.75 * Math.abs(Math.sin(t * 7 + k * 1.1) * Math.sin(t * 2.3 + k))) * (bh - 20 * u);
          g.fillStyle = col(F, "P"); g.fillRect(bx + 12 * u + k * 12.5 * u, byy + bh / 2 - hh / 2, 7 * u, hh);
        }
      }
    }
    // Bus lines under each row with packets.
    for (let r = 0; r < rws; r++) {
      const inRow = Math.min(cols, n - r * cols);
      if (inRow < 2) continue;
      const y = I.y + chh * (r + 1) - 26 * u, x0 = I.x + cw * 0.5, x1 = I.x + cw * (inRow - 0.5);
      const q = span(build, 0.35, 0.7);
      pen(g, col(F, "D", 0.7), 2 * u, [8 * u, 6 * u]);
      tracePts(g, [[x0, y], [x1, y]], q); g.setLineDash([]);
      if (q >= 1) for (let k = 0; k < 3; k++) {
        const f = (t * 0.22 + k / 3 + r * 0.17) % 1, x = lerp(x0, x1, k % 2 ? 1 - f : f);
        g.fillStyle = col(F, "P"); g.fillRect(x - 7 * u, y - 7 * u, 14 * u, 14 * u);
      }
      for (let c = 0; c < inRow; c++) { g.fillStyle = col(F, "D", 0.9); g.fillRect(I.x + cw * (c + 0.5) - 4 * u, y - 4 * u, 8 * u, 8 * u); }
    }
  }

  // Process: a job runner. Three steps in traced boxes; each spins, fills its cell bar and stamps OK
  // in turn, while packets flow down the pipes and the log types each result.
  const ICONS = [
    ["....#....", "....#....", "....#....", "..#.#.#..", "...###...", "....#....", "#.......#", "#.......#", "#########"],
    ["..#...#..", "..#...#..", ".###..#..", ".###..#..", "..#..###.", "..#..###.", "..#...#..", "..#...#..", "..#...#.."],
    ["#########", "#.......#", "#......##", "#.....#.#", "##...#..#", "#.#.#...#", "#..#....#", "#.......#", "#########"],
  ];
  function icon(g, k, x, y, s, color) {
    const G = ICONS[k % 3], p = s / 9;
    g.fillStyle = color;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (G[r][c] === "#") g.fillRect(x + c * p, y + r * p, p - 1.5, p - 1.5);
  }
  function wrapWords(g, s, maxW, size, weight) {
    const words = String(s).split(/\s+/).filter(Boolean), out = [];
    let line = "";
    for (const w of words) { const next = line ? line + " " + w : w; if (line && tw(g, next, size, weight) > maxW) { out.push(line); line = w; } else line = next; }
    if (line) out.push(line);
    return out;
  }
  function process(g, F, A, d, info) {
    const { u, t, tall } = F, local = info.local, build = span(local, 0.1, 0.1 + Math.min(2.6, info.hold * 0.68));
    win(g, F, A, local, "pipeline.sh");
    const I = inner(F, A, 50);
    const steps = d.steps.map((s) => String(s ?? "")), n = steps.length;
    const logH = (tall ? 150 : 104) * u, B = { x: I.x, y: I.y, w: I.w, h: I.h - logH };
    const gap = (tall ? 70 : 120) * u;
    const bw = tall ? B.w : (B.w - gap * (n - 1)) / n, bh = tall ? (B.h - gap * (n - 1)) / n : Math.min(B.h * 0.92, bw * 1.05);
    const box = (i) => (tall ? { x: B.x, y: B.y + i * (bh + gap), w: bw, h: bh } : { x: B.x + i * (bw + gap), y: B.y + (B.h - bh) / 2, w: bw, h: bh });
    const run = (i) => span(build, 0.06 + i * 0.3, 0.06 + i * 0.3 + 0.26);
    for (let i = 0; i < n; i++) {
      const b = box(i), r = run(i), done = r >= 1, active = r > 0 && !done, last = i === n - 1;
      const qo = ease(span(local, i * 0.08, 0.35 + i * 0.08));
      pen(g, active || (done && last) ? col(F, "P") : done ? col(F, "P", 0.6) : col(F, "D", 0.7), (active || (done && last) ? 3.5 : 2) * u);
      traceRect(g, b.x, b.y, b.w, b.h, qo);
      if (qo < 0.3) continue;
      const hy = b.y + 34 * u;
      txt(g, `[${i + 1}/${n}]`, b.x + 22 * u, hy, 22 * u, col(F, active || done ? "P" : "D"), { base: "middle", weight: 700 });
      if (done) tag(g, last ? "DONE" : "OK", b.x + b.w - 20 * u, hy, 22 * u, col(F, "P"), col(F, "B"), { align: "right" });
      else if (active) txt(g, `${SPIN[Math.floor(t * 10) % 4]} RUN`, b.x + b.w - 22 * u, hy, 22 * u, col(F, "P"), { align: "right", base: "middle", weight: 700 });
      else txt(g, "WAIT", b.x + b.w - 22 * u, hy, 22 * u, col(F, "D"), { align: "right", base: "middle" });
      const iconColor = col(F, done || active ? "P" : "D", done || active ? 1 : 0.6);
      const lq = span(local, 0.12 + i * 0.1, 0.6 + i * 0.1), labColor = col(F, done || active ? "I" : "D", done || active ? 1 : 0.95);
      const barY = b.y + b.h - 46 * u;
      if (!tall) {
        const is = Math.min(b.w * 0.26, b.h * 0.24);
        icon(g, last ? 2 : i, b.x + (b.w - is) / 2, b.y + 70 * u, is, iconColor);
        let size = 52 * u, lines = wrapWords(g, steps[i], b.w - 50 * u, size, 700);
        while (size > 38 * u && (lines.length > 2 || lines.some((l) => tw(g, l, size, 700) > b.w - 50 * u))) { size *= 0.94; lines = wrapWords(g, steps[i], b.w - 50 * u, size, 700); }
        const ly = b.y + 70 * u + is + 34 * u + size * 0.5;
        let used = 0;
        const total = lines.join(" ").length;
        lines.forEach((l, k) => { const share = l.length / Math.max(1, total), q = clamp((lq - used) / Math.max(0.01, share)); used += share; typed(g, F, l, b.x + b.w / 2, ly + k * size * 1.12, size, q, labColor, { align: "center", base: "middle", weight: 700 }); });
      } else {
        const is = Math.min(b.h * 0.5, 120 * u);
        icon(g, last ? 2 : i, b.x + 30 * u, b.y + (b.h - is) / 2 + 6 * u, is, iconColor);
        const size = fitSize(g, steps[i], b.w - is - 100 * u, 56 * u, 38 * u, 700);
        typed(g, F, steps[i], b.x + is + 64 * u, b.y + b.h * 0.48, size, lq, labColor, { base: "middle", weight: 700 });
      }
      // Cell progress bar; a bright cell runs through it once full.
      const cells = 20, bx0 = b.x + 22 * u, bwid = b.w - 44 * u - 70 * u, cwid = bwid / cells;
      const litN = Math.floor(cells * r), shimmer = Math.floor((t * 14 + i * 7) % (cells + 8));
      for (let k = 0; k < cells; k++) {
        g.fillStyle = k < litN ? (done && k === shimmer ? rgba(mixc(F.T.P, [255, 255, 255], F.T.light ? 0 : 0.6)) : col(F, "P", done ? 0.8 : 1)) : col(F, "D", 0.14);
        g.fillRect(bx0 + k * cwid, barY - 10 * u, cwid - 4 * u, 20 * u);
      }
      txt(g, `${String(Math.round(r * 100)).padStart(3, " ")}%`, b.x + b.w - 22 * u, barY, 22 * u, col(F, done || active ? "P" : "D"), { align: "right", base: "middle" });
      // Pipe to the next step.
      if (i < n - 1) {
        const nb = box(i + 1), pq = span(local, 0.25 + i * 0.1, 0.55 + i * 0.1);
        const a = tall ? [b.x + b.w * 0.5, b.y + b.h + 8 * u] : [b.x + b.w + 10 * u, b.y + b.h / 2];
        const z = tall ? [nb.x + nb.w * 0.5, nb.y - 8 * u] : [nb.x - 10 * u, nb.y + nb.h / 2];
        const off = 7 * u;
        pen(g, col(F, done ? "P" : "D", done ? 0.9 : 0.6), 2 * u);
        for (const s of [-1, 1]) tracePts(g, tall ? [[a[0] + s * off, a[1]], [z[0] + s * off, z[1]]] : [[a[0], a[1] + s * off], [z[0], z[1] + s * off]], pq);
        if (pq >= 1) {
          g.fillStyle = col(F, done ? "P" : "D");
          g.beginPath();
          if (tall) { g.moveTo(z[0] - 16 * u, z[1] - 14 * u); g.lineTo(z[0] + 16 * u, z[1] - 14 * u); g.lineTo(z[0], z[1] + 2 * u); }
          else { g.moveTo(z[0] - 14 * u, z[1] - 16 * u); g.lineTo(z[0] - 14 * u, z[1] + 16 * u); g.lineTo(z[0] + 2 * u, z[1]); }
          g.fill();
          if (done || active) for (let k = 0; k < 3; k++) {
            const f = (t * 0.9 + k / 3) % 1, px = lerp(a[0], z[0] - (tall ? 0 : 16 * u), f), py = lerp(a[1], z[1] - (tall ? 16 * u : 0), f);
            g.fillStyle = col(F, "P"); g.fillRect(px - 5 * u, py - 5 * u, 10 * u, 10 * u);
          }
        }
      }
    }
    // Log.
    const ly = I.y + I.h - logH + 44 * u, pitch = 34 * u, maxRows = tall ? 3 : 2;
    pen(g, col(F, "D", 0.5), 1.2 * u, [4 * u, 6 * u]);
    tracePts(g, [[I.x, ly - 32 * u], [I.x + I.w, ly - 32 * u]], span(local, 0.2, 0.6)); g.setLineDash([]);
    const log = [];
    for (let i = 0; i < n; i++) {
      const r = run(i);
      if (r > 0) log.push({ s: `> [${i + 1}] ${steps[i].toLowerCase()} ${".".repeat(4)} ${r >= 1 ? `ok  ${(0.4 + i * 0.3 + (steps[i].length % 5) * 0.1).toFixed(1)}s` : SPIN[Math.floor(t * 10) % 4]}`, q: span(build, 0.06 + i * 0.3, 0.16 + i * 0.3), hot: r < 1 });
    }
    if (run(n - 1) >= 1) log.push({ s: `> all ${n} steps ok · watching for changes ${SPIN[Math.floor(t * 6) % 4]}`, q: clamp((build - 0.92) * 12.5), hot: true });
    log.slice(-maxRows).forEach((e, k) => typed(g, F, e.s, I.x, ly + k * pitch, 23 * u, e.q, col(F, e.hot ? "P" : "I", e.hot ? 1 : 0.75)));
  }

  // Compare: two panels as a diff. Dot-matrix totals count up, cell meters fill, trend columns scroll,
  // and a chevron marquee runs from before to after with the change typed under it.
  function compare(g, F, A, d, info) {
    const { u, t, tall } = F, local = info.local, build = span(local, 0.1, 0.1 + Math.min(2.2, info.hold * 0.6));
    win(g, F, A, local, "diff.log");
    const I = inner(F, A, 50);
    const gapC = (tall ? 150 : 220) * u;
    const pw = tall ? I.w : (I.w - gapC) / 2, ph = tall ? (I.h - gapC) / 2 : I.h;
    const L = Number(d.leftValue) || 0, Rv = Number(d.rightValue) || 0, vmax = Math.max(Math.abs(L), Math.abs(Rv), 1);
    [[d.left, L, "-"], [d.right, Rv, "+"]].forEach(([label, value, sign], i) => {
      const P = tall ? { x: I.x, y: I.y + i * (ph + gapC), w: pw, h: ph } : { x: I.x + i * (pw + gapC), y: I.y, w: pw, h: ph };
      const hot = i === 1, q = ease(span(build, i * 0.25, i * 0.25 + 0.6)), qo = ease(span(local, i * 0.1, 0.4 + i * 0.1));
      pen(g, col(F, hot ? "P" : "D", hot ? 1 : 0.8), (hot ? 3 : 2) * u); traceRect(g, P.x, P.y, P.w, P.h, qo);
      if (qo < 0.3) return;
      const lab = `${sign} ${label ?? ""}`, ls = fitSize(g, lab, P.w - 60 * u, 44 * u, 34 * u, 700), lq = span(local, 0.15 + i * 0.12, 0.6 + i * 0.12);
      if (hot && lq >= 1) tag(g, lab, P.x + 26 * u, P.y + 50 * u, ls, col(F, "P"), col(F, "B"));
      else typed(g, F, lab, P.x + 30 * u, P.y + 50 * u, ls, lq, col(F, hot ? "P" : "I"), { base: "middle", weight: 700 });
      const s = tally(value, q, d), ds = Math.max(9 * u, Math.min(17 * u, (P.w - 70 * u) / dmUnits(s), (P.h * 0.3) / 7));
      dm(g, s, P.x + 30 * u, P.y + 100 * u, ds, col(F, hot ? "P" : "I", hot ? 1 : 0.85), col(F, "D", 0.1));
      // Trend columns scroll one step at a time.
      const tTop = P.y + 100 * u + ds * 7 + 34 * u, mY = P.y + P.h - 56 * u, tH = mY - 40 * u - tTop;
      if (tH > 30 * u) {
        const cols = Math.floor((P.w - 60 * u) / (16 * u)), shift = Math.floor(t * 6), lvl = Math.abs(value) / vmax;
        for (let k = 0; k < cols; k++) {
          const kk = k + shift, trend = lerp(hot ? 0.9 : 0.35, lvl, k / cols);
          const h = clamp(trend * 0.6 + 0.2 * hash(kk, i + 5)) * tH * 0.85 * clamp(q * 1.6 - k / cols * 0.6);
          if (h <= 0) continue;
          g.fillStyle = col(F, hot ? "P" : "I", k === cols - 1 ? 1 : 0.45);
          g.fillRect(P.x + 30 * u + k * 16 * u, tTop + tH - h, 9 * u, h);
        }
      }
      const cells = 24, cw = (P.w - 60 * u) / cells, lit = Math.round(cells * (Math.abs(value) / vmax) * q);
      for (let k = 0; k < cells; k++) {
        const end = k === lit - 1 && Math.floor(t * 3) % 2 === 0;
        g.fillStyle = k < lit ? (end ? rgba(mixc(F.T[hot ? "P" : "I"], [255, 255, 255], F.T.light ? 0 : 0.5)) : col(F, hot ? "P" : "I", hot ? 1 : 0.7)) : col(F, "D", 0.14);
        g.fillRect(P.x + 30 * u + k * cw, mY - 12 * u, cw - 5 * u, 24 * u);
      }
    });
    // Chevron marquee and the change.
    const cx = tall ? I.x + I.w / 2 : I.x + pw + gapC / 2, cy = tall ? I.y + ph + gapC / 2 : I.y + I.h * 0.42;
    const cq = span(local, 0.3, 0.7);
    if (cq > 0) for (let k = 0; k < 3; k++) {
      const on = (Math.floor(t * 6) % 4) === k, s = 20 * u, o = (k - 1) * 34 * u;
      pen(g, col(F, on ? "P" : "D", on ? 1 : 0.6), 5 * u); g.lineCap = "square";
      g.beginPath();
      if (tall) { g.moveTo(cx - 60 * u + o - s, cy - s * 0.6); g.lineTo(cx - 60 * u + o, cy + s * 0.6); g.lineTo(cx - 60 * u + o + s, cy - s * 0.6); }
      else { g.moveTo(cx + o - s * 0.6, cy - s); g.lineTo(cx + o + s * 0.6, cy); g.lineTo(cx + o - s * 0.6, cy + s); }
      g.stroke();
    }
    const dq = span(build, 0.75, 0.95);
    if (dq > 0) {
      const delta = L ? `${Rv - L >= 0 ? "+" : ""}${Math.round(((Rv - L) / Math.abs(L)) * 100)}%` : `${Rv - L >= 0 ? "+" : ""}${fmtN(Rv - L, d)}`;
      if (tall) typed(g, F, delta, cx + 10 * u, cy, 44 * u, dq, col(F, "P"), { base: "middle", weight: 700 });
      else { typed(g, F, delta, cx, cy + 80 * u, 44 * u, dq, col(F, "P"), { align: "center", base: "middle", weight: 700 }); txt(g, "change", cx, cy + 128 * u, 20 * u, col(F, "D"), { align: "center", base: "middle" }); }
    }
  }

  // Title: a fast boot log above the headline and a memory test below it.
  function band(F, ids) {
    const lines = ids.flatMap((id) => headLines(id));
    if (!lines.length) return { top: F.H * 0.4, bottom: F.H * 0.6 };
    return { top: Math.min(...lines.map((l) => l.y)), bottom: Math.max(...lines.map((l) => l.y + l.h)) };
  }
  function bootLog(g, F, list, x, y0, y1, local, rate) {
    const { u } = F, pitch = 36 * u, fs = 23 * u, rows = Math.max(0, Math.floor((y1 - y0) / pitch));
    if (!rows) return;
    const started = list.filter((_, k) => local >= k * rate).length;
    const first = Math.max(0, started - rows);
    const dotX = x + Math.min(F.scr.w * 0.42, 680 * u);
    for (let k = first; k < started; k++) {
      const [name, status] = list[k], y = y0 + (k - first) * pitch, q = span(local, k * rate, k * rate + rate * 1.4);
      const w = typed(g, F, name, x, y, fs, q, col(F, k === 0 ? "P" : "I", k === 0 ? 1 : 0.8), { weight: k === 0 ? 700 : 400 });
      if (q >= 1 && status) {
        const lead = Math.max(0, Math.floor((dotX - x - w - 20 * u) / (fs * 0.6)));
        txt(g, " " + ".".repeat(lead), x + w, y, fs, col(F, "D", 0.7));
        const sq = span(local, k * rate + rate * 1.4, k * rate + rate * 2.2);
        if (sq > 0) { if (status === "ok") txt(g, "ok", dotX + 10 * u, y, fs, col(F, "P"), { weight: 700 }); else tag(g, status, dotX + 10 * u, y - fs * 0.32, fs * 0.9, col(F, "P"), col(F, "B")); }
      }
    }
  }
  // A small system panel of cell meters, for the empty side of the boot and save logs.
  function sysBox(g, F, x, y, w, local, name, rows) {
    const { u, t } = F, rh = 48 * u, h = 58 * u + rows.length * rh, q = ease(span(local, 0.1, 0.5));
    pen(g, col(F, "D", 0.7), 1.5 * u); traceRect(g, x, y, w, h, q);
    if (q < 0.4) return h;
    tag(g, ` ${name} `, x + 24 * u, y, 19 * u, col(F, "P"), col(F, "B"));
    rows.forEach(([label, fn], i) => {
      const yy = y + 44 * u + i * rh + rh / 2, v = clamp(fn(t)) * span(local, 0.2 + i * 0.1, 0.7 + i * 0.1);
      txt(g, label, x + 24 * u, yy, 20 * u, col(F, "I", 0.8), { base: "middle", weight: 700 });
      const cells = 18, bx = x + 110 * u, bwid = w - 110 * u - 100 * u, cw = bwid / cells, lit = Math.round(v * cells);
      for (let k = 0; k < cells; k++) { g.fillStyle = k < lit ? col(F, k >= cells - 4 ? "P" : "I", k >= cells - 4 ? 1 : 0.7) : col(F, "D", 0.14); g.fillRect(bx + k * cw, yy - 9 * u, cw - 4 * u, 18 * u); }
      txt(g, `${String(Math.round(v * 100)).padStart(3, " ")}%`, x + w - 24 * u, yy, 20 * u, col(F, "P"), { align: "right", base: "middle" });
    });
    return h;
  }
  // Wide: beside the log. Tall: under it, when the space above the headline allows.
  function sysPlace(F, b, logLines, side) {
    const { u, W } = F;
    if (!F.tall) return b.top - 44 * u - (F.scr.y + 92 * u) > 210 * u ? { x: W - side - 560 * u, y: F.scr.y + 92 * u, w: 560 * u } : null;
    const y = F.scr.y + 170 * u + logLines * 36 * u + 30 * u;
    return b.top - 60 * u - y > 210 * u ? { x: side, y, w: W - side * 2 } : null;
  }
  function titleArt(g, F, A, d, info) {
    const { u, t, W, H, tall } = F, local = info.local, side = (tall ? 90 : 140) * u, b = band(F, ["kicker", "title"]);
    bootLog(g, F, [["DCUT/OS 2.6 · phosphor console", ""], ["probe display", `${W}x${H}`], ["mount ~/projects", "ok"], ["read timeline.json", "ok"], ["link agent", "ok"], ["preview runtime", "ok"], ["review queue", "ready"]],
      side, F.scr.y + (tall ? 170 : 110) * u, b.top - 44 * u, local, 0.16);
    const sb1 = sysPlace(F, b, 7, side); if (sb1) sysBox(g, F, sb1.x, sb1.y, sb1.w, local, "sys", [
      ["cpu", (tt) => 0.35 + 0.3 * Math.abs(Math.sin(tt * 1.3)) + 0.15 * hash(Math.floor(tt * 6), 1)],
      ["mem", (tt) => 0.62 + 0.05 * Math.sin(tt * 0.8)],
      ["net", (tt) => 0.2 + 0.6 * Math.abs(Math.sin(tt * 2.1 + 1)) * hash(Math.floor(tt * 5), 2)]]);
    // Memory test: a raster of cells fills, then twinkles while a sweep keeps running.
    const y0 = b.bottom + (tall ? 90 : 64) * u, y1 = H - (tall ? 240 : 110) * u;
    if (y1 - y0 < 90 * u) return;
    const k = span(local, 0, 1.5), c = (tall ? 22 : 20) * u;
    const cols = Math.floor((W - side * 2) / c), rows = Math.max(1, Math.min(tall ? 12 : 7, Math.floor((y1 - y0 - 56 * u) / c))), total = cols * rows;
    txt(g, "MEM TEST", side, y0 + 10 * u, 21 * u, col(F, "D"), { weight: 700, base: "middle" });
    txt(g, `${String(Math.floor(k * 640)).padStart(3, " ")}K${k >= 1 ? "  ok" : ""}`, W - side, y0 + 10 * u, 21 * u, col(F, k >= 1 ? "P" : "I"), { align: "right", base: "middle", weight: 700 });
    const filled = Math.floor(total * k), fr = Math.floor(t * 8), sweep = Math.floor((local * 16) % (cols + 10));
    for (let i = 0; i < total; i++) {
      const cx = i % cols, cy = Math.floor(i / cols), x = side + cx * c, y = y0 + 40 * u + cy * c;
      let fill;
      if (i < filled) fill = hash(i, fr) > 0.95 || (k >= 1 && cx === sweep) ? col(F, "P") : col(F, "I", 0.42);
      else if (i === filled) fill = rgba(mixc(F.T.P, [255, 255, 255], F.T.light ? 0 : 0.6));
      else fill = hash(i, fr * 3 + 1) > 0.7 ? col(F, "D", 0.3) : col(F, "D", 0.08);
      g.fillStyle = fill; g.fillRect(x, y, c - 5 * u, c - 5 * u);
    }
  }
  // Closing: the session saves above the line; below it a standby trace keeps sweeping to the end.
  function closingArt(g, F, A, d, info) {
    const { u, t, W, H, tall } = F, local = info.local, side = (tall ? 90 : 140) * u, b = band(F, ["closing"]);
    bootLog(g, F, [["save timeline.json", "ok"], ["write history", "ok"], ["checksum", "a3f9·e1c0"], ["session", "saved"]], side, F.scr.y + (tall ? 170 : 110) * u, b.top - 44 * u, local, 0.2);
    const sb2 = sysPlace(F, b, 4, side); if (sb2) sysBox(g, F, sb2.x, sb2.y, sb2.w, local, "write", [
      ["disk", (tt) => clamp(span(tt - F.info.t + local, 0.2, 1.6)) * (0.9 + 0.1 * Math.sin(tt * 3))],
      ["sync", (tt) => clamp(span(tt - F.info.t + local, 0.5, 1.8))],
      ["idle", (tt) => 0.3 + 0.2 * Math.sin(tt * 1.1)]]);
    const y0 = b.bottom + (tall ? 90 : 60) * u, y1 = H - (tall ? 240 : 110) * u;
    if (y1 - y0 < 80 * u) return;
    const mid = (y0 + y1) / 2, amp = Math.min(70 * u, (y1 - y0) * 0.36), x0 = side, x1 = W - side, q = span(local, 0.1, 0.8);
    pen(g, col(F, "D", 0.35), 1.2 * u, [2 * u, 10 * u]);
    for (const yy of [mid - amp, mid, mid + amp]) { g.beginPath(); g.moveTo(x0, yy); g.lineTo(x1, yy); g.stroke(); }
    for (let k = 0; k <= 12; k++) { const xx = lerp(x0, x1, k / 12); g.beginPath(); g.moveTo(xx, mid - amp - 10 * u); g.lineTo(xx, mid + amp + 10 * u); g.stroke(); }
    g.setLineDash([]);
    // The trace and two fading afterimages: phosphor persistence.
    for (const [lag, a] of [[0.24, 0.18], [0.12, 0.4], [0, 1]]) {
      const tt = t - lag, head = ((local - lag) * 0.45) % 1;
      g.beginPath();
      const N = 180;
      for (let i = 0; i <= N * q; i++) {
        const k = i / N, xx = lerp(x0, x1, k), dist = Math.abs(k - head);
        const yy = mid - amp * (0.22 * Math.sin(k * 14 - tt * 2.2) + 0.3 * Math.sin(k * 41 - tt * 5) * Math.exp(-dist * 5) + 0.75 * Math.exp(-Math.pow(dist * 22, 2)) * Math.sin(k * 120));
        i ? g.lineTo(xx, yy) : g.moveTo(xx, yy);
      }
      pen(g, col(F, "P", a), (lag ? 2 : 3) * u); g.lineJoin = "round"; g.stroke();
    }
    tag(g, Math.floor(t * 1.5) % 2 ? "STANDBY" : "STANDBY ", x0, y0 - 6 * u, 20 * u, col(F, "P"), col(F, "B"));
  }

  // ---- the picture: barrel distortion, bloom and fringe, then the headline cursor --------------------
  function barrel(F) {
    const { W, H, u, t } = F, kx = 0.032, ky = 0.02;
    const a = L1.getContext("2d"), b = L2.getContext("2d");
    b.setTransform(1, 0, 0, 1, 0, 0); b.globalAlpha = 1; b.globalCompositeOperation = "source-over"; b.clearRect(0, 0, W, H);
    const band = Math.max(6, Math.round(H / 150)), fr = Math.floor(t * 30);
    for (let y = 0; y < H; y += band) {
      const ny = (y + band / 2 - H / 2) / (H / 2), s = 1 - kx * ny * ny, w = W * s, hh = Math.min(band + 1, H - y);
      let x = (W - w) / 2 + Math.sin(y * 0.031 + t * 7.3) * 0.6 * u;
      if (F.tear > 0) x += (hash(Math.floor(y / band), fr) - 0.5) * 2 * F.tear * Math.exp(-Math.pow((y - F.tearY) / (110 * u), 2));
      b.drawImage(L1, 0, y, W, hh, x, y, w, hh);
    }
    a.setTransform(1, 0, 0, 1, 0, 0); a.globalAlpha = 1; a.globalCompositeOperation = "source-over"; a.clearRect(0, 0, W, H);
    const bandX = Math.max(6, Math.round(W / 180));
    for (let x = 0; x < W; x += bandX) {
      const nx = (x + bandX / 2 - W / 2) / (W / 2), s = 1 - ky * nx * nx, h = H * s, ww = Math.min(bandX + 1, W - x);
      a.drawImage(L2, x, 0, ww, H, x, (H - h) / 2, ww, h);
    }
  }
  function composite(ctx, F) {
    if (F.done) return;
    F.done = true;
    const { W, H, u, T, S } = F, g = F.g;
    if (F.beam !== null) {
      // The beam that clears the outgoing scene.
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
      const gr = g.createLinearGradient(0, F.beam - 50 * u, 0, F.beam + 4 * u);
      gr.addColorStop(0, rgba(T.P, 0)); gr.addColorStop(1, rgba(T.P, 0.22));
      g.fillStyle = gr; g.fillRect(F.scr.x, F.beam - 50 * u, F.scr.w, 54 * u);
      g.fillStyle = rgba(mixc(T.P, [255, 255, 255], T.light ? 0 : 0.5)); g.fillRect(F.scr.x, F.beam - 2 * u, F.scr.w, 4 * u);
      g.restore();
    }
    barrel(F);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = "none";
    if (S.paint) { screenPath(ctx, F.scr, F.bow); ctx.clip(); }
    if (!T.light) {
      const sb = SB.getContext("2d");
      sb.setTransform(1, 0, 0, 1, 0, 0); sb.clearRect(0, 0, SB.width, SB.height);
      sb.filter = `blur(${(3 * u).toFixed(2)}px)`; sb.drawImage(L1, 0, 0, SB.width, SB.height); sb.filter = "none";
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.9; ctx.drawImage(SB, 0, 0, W, H);
      const tn = TN.getContext("2d");
      for (const [c, dx] of [["rgb(255,40,80)", -2.4 * u], ["rgb(40,150,255)", 2.4 * u]]) {
        tn.setTransform(1, 0, 0, 1, 0, 0); tn.globalCompositeOperation = "source-over"; tn.clearRect(0, 0, W, H); tn.drawImage(L1, 0, 0);
        tn.globalCompositeOperation = "source-in"; tn.fillStyle = c; tn.fillRect(0, 0, W, H);
        ctx.globalAlpha = 0.26; ctx.drawImage(TN, dx, 0);
      }
    }
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    ctx.drawImage(L1, 0, 0);
    ctx.restore();
    headCursor(ctx, F);
  }
  // A block cursor that rides the headline's type-on edge, then blinks after the last letter.
  function headCursor(ctx, F) {
    const { info, u, t } = F, P = F.plan;
    if (!info.scene || !P) return;
    const ids = HEADS[info.scene], id = ids[ids.length - 1], lines = headLines(id);
    if (!lines.length || !lines.box) return;
    const isLast = P.shown.length && P.shown[P.shown.length - 1].id === info.scene;
    if (!isLast && info.local > info.hold - P.change) return;
    const k = clamp((info.local - (ids.length > 1 ? 0.12 : 0)) / P.entrance);
    if (k <= 0) return;
    const ks = Math.floor(k * lines.box.chars) / lines.box.chars, last = lines[lines.length - 1];
    const edge = lines.box.x + lines.box.w * ks, end = last.x + last.w + 10 * u;
    const x = ks >= 1 || edge > end ? end : edge;
    if (ks >= 1 && Math.floor(t * 2.4) % 2) return;
    ctx.save();
    ctx.fillStyle = rgba(F.T.P, 0.92);
    if (!F.T.light) { ctx.shadowColor = rgba(F.T.P, 0.8); ctx.shadowBlur = 16 * u; }
    ctx.fillRect(x, last.y + last.h * 0.12, last.h * 0.46, last.h * 0.76);
    ctx.restore();
  }

  const wrap = (id, fn) => (ctx, S, box, p, d, info = {}) => {
    const F = FR;
    if (!F) return;
    const g = F.g, leaving = info.exit !== undefined;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (F.beam !== null) { g.beginPath(); if (leaving) g.rect(0, F.beam, F.W, F.H - F.beam); else g.rect(0, 0, F.W, F.beam); g.clip(); }
    if (leaving) g.globalAlpha = 1 - 0.45 * info.exit;
    const A = id === "title" || id === "closing" ? null : areaOf(F, id);
    try { fn(g, F, A, d || {}, { local: info.local || 0, hold: info.hold || 1, change: info.change || 0.45 }); } finally { g.restore(); }
    if (!leaving) composite(ctx, F);
  };

  // The overlay above the type: scanlines, a rolling hum bar, flicker, curvature shading and glare.
  function overlay(ctx, W, H, t, accent, look) {
    ctx.clearRect(0, 0, W, H);
    if (!document.getElementById("people-scene")) return;
    const u = Math.min(W, H) / 1080, s = screenOf(W, H, u), light = lum(rgbOf(look.bg)) > 140;
    ctx.save();
    screenPath(ctx, s, 8 * u); ctx.clip();
    const period = Math.max(3, Math.round(4 * u));
    ctx.fillStyle = pattern(ctx, "scan" + light + period, u, () => {
      const c = mk(4, period), x = c.getContext("2d");
      for (let y = 0; y < period; y++) { const v = 0.5 - 0.5 * Math.cos(((y + 0.5) / period) * Math.PI * 2); x.fillStyle = `rgba(0,0,0,${(light ? 0.07 : 0.3) * v})`; x.fillRect(0, y, 4, 1); }
      return c;
    });
    ctx.fillRect(s.x, s.y - 10 * u, s.w, s.h + 20 * u);
    // Hum bar: a soft bright band rolling down the tube.
    const roll = (t / 5.2) % 1, hy = s.y - 260 * u + roll * (s.h + 520 * u);
    const hb = ctx.createLinearGradient(0, hy - 150 * u, 0, hy + 150 * u);
    const hc = light ? "0,0,0" : "255,255,255";
    hb.addColorStop(0, `rgba(${hc},0)`); hb.addColorStop(0.5, `rgba(${hc},${light ? 0.035 : 0.05})`); hb.addColorStop(1, `rgba(${hc},0)`);
    ctx.fillStyle = hb; ctx.fillRect(s.x, hy - 150 * u, s.w, 300 * u);
    // Flicker and the flash of a switch between scenes.
    const P = planOf();
    let flash = 0;
    if (P) for (const st of P.shown) if (st.start > 0 && t >= st.start) flash = Math.max(flash, Math.exp(-(t - st.start) / 0.07));
    ctx.fillStyle = light ? `rgba(0,0,0,${0.012 + 0.02 * hash(Math.floor(t * 30), 9)})` : `rgba(0,0,0,${0.02 + 0.035 * hash(Math.floor(t * 30), 9)})`;
    ctx.fillRect(s.x, s.y - 10 * u, s.w, s.h + 20 * u);
    if (flash > 0.01) { ctx.fillStyle = rgba(rgbOf(accent), 0.08 * flash); ctx.fillRect(s.x, s.y - 10 * u, s.w, s.h + 20 * u); }
    // Curvature: darker toward the edges and corners of the glass.
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.hypot(W, H) * 0.56);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, `rgba(0,0,0,${light ? 0.16 : 0.6})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    // Glare: a soft window reflection high on the left and a thin rim highlight.
    const gl = ctx.createRadialGradient(W * 0.24, H * 0.16, 0, W * 0.24, H * 0.16, Math.min(W, H) * 0.55);
    gl.addColorStop(0, `rgba(255,255,255,${light ? 0.14 : 0.055})`); gl.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H);
    ctx.restore();
    ctx.save();
    screenPath(ctx, s, 8 * u); ctx.clip();
    screenPath(ctx, s, 8 * u);
    ctx.shadowColor = "rgba(0,0,0,0.85)"; ctx.shadowBlur = 40 * u; ctx.lineWidth = 16 * u; ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.stroke();
    ctx.restore();
    ctx.save();
    screenPath(ctx, s, 8 * u);
    ctx.lineWidth = 1.5 * u; ctx.strokeStyle = light ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.09)"; ctx.stroke();
    ctx.restore();
  }

  return {
    bg: "#090c0a", panel: "#101511", ink: "#cdf5cf", muted: "#5f8a64", accent: "#4dff8f", onAccent: "#06120a",
    rule: "rgba(77,255,143,0.35)", track: "rgba(205,245,207,0.08)",
    display: MONO, displayWeight: 700, displayCase: "none", displayTracking: "-0.01em",
    body: MONO, bodyWeight: 400,
    figures: "Menlo, Consolas, 'DejaVu Sans Mono', monospace", radius: 4, motion: "type", kit: { line: 2.5, fill: "none", panel: "outline", glow: 6 },
    palettes: {
      light: { bg: "#f3f1e8", panel: "#e9e6d8", ink: "#1d2a1f", muted: "#5d6b5f", accent: "#1f8a4c", onAccent: "#f3f1e8", rule: "rgba(31,138,76,0.4)", track: "rgba(29,42,31,0.08)", backdrop: () => "#f3f1e8" },
      dark: { ink: "#ffcf7a", muted: "#a07a3c", accent: "#ffb000", onAccent: "#120c02", rule: "rgba(255,176,0,0.35)", track: "rgba(255,207,122,0.08)" },
      mono: { ink: "#e6e6e6", muted: "#8a8a8a", accent: "#ffffff", onAccent: "#090c0a", rule: "rgba(255,255,255,0.3)" },
    },
    backdrop: (accent, texture = 1) => `repeating-linear-gradient(0deg, rgba(255,255,255,${0.025 * texture}) 0px, rgba(255,255,255,${0.025 * texture}) 2px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 4px), radial-gradient(90% 80% at 50% 45%, ${hexA(accent, 0.07)} 0%, rgba(9,12,10,0) 70%), #090c0a`,
    // Illustrated explainer only (scoped by its people scene, so the text templates stay as they were):
    // headlines glow with a red/blue fringe and the kicker becomes a reverse-video tag.
    css: (accent, look) => {
      const light = lum(rgbOf(look.bg)) > 140, P = rgbOf(accent);
      const R = "#root:has(#people-scene)";
      return `${R} .display { color: ${look.ink}; text-shadow: ${light ? `0 0 1px ${rgba(P, 0.4)}` : `0 0 2px ${rgba(P, 0.9)}, 0 0 22px ${rgba(P, 0.5)}, -2px 0 0 rgba(255,40,80,0.28), 2px 0 0 rgba(40,150,255,0.28)`}; }
      ${R} .kicker { align-self: flex-start; padding: 0.22em 0.55em; letter-spacing: 0.08em; background: ${accent}; color: ${look.bg}; text-shadow: none; box-shadow: ${light ? "none" : `0 0 24px ${rgba(P, 0.55)}`}; }`;
    },
    // The texture pass sits above the type in the illustrated explainer and draws nothing elsewhere.
    paint: overlay,
    paintOver: true,
    keepArt: true,
    overlap: true,
    stage(ctx, S, info) {
      const { W, H, u } = S;
      ensure(W, H);
      const P = planOf();
      const F = (FR = {
        S, W, H, u, tall: S.tall, T: toneOf(S.look, S.accent), info, t: info.t, scr: screenOf(W, H, u), bow: 8 * u,
        plan: P ? { ...P, change: info.change ?? P.change } : null, done: false, beam: null, tear: 0, tearY: H / 2,
      });
      const g = (F.g = L1.getContext("2d"));
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.filter = "none"; g.setLineDash([]);
      g.clearRect(0, 0, W, H);
      if (info.index > 0 && info.local < info.change) {
        F.beam = lerp(F.scr.y + 60 * u, F.scr.y + F.scr.h - 40 * u, eio(info.local / Math.max(0.01, info.change)));
        F.tearY = F.beam;
      }
      if (info.index > 0 && info.local < 0.3) F.tear = 26 * u * (1 - info.local / 0.3);
      if (S.paint) {
        housing(ctx, F);
        // Phosphor dot mask: the faint cell grid the characters sit on.
        g.save();
        g.fillStyle = pattern(g, "dots" + F.T.light + S.accent, u, () => {
          const c = mk(Math.round(16 * u), Math.round(16 * u)), x = c.getContext("2d");
          x.fillStyle = rgba(F.T.P, F.T.light ? 0.08 : 0.06); x.fillRect(0, 0, Math.max(1, 2 * u), Math.max(1, 2 * u));
          return c;
        });
        g.fillRect(F.scr.x, F.scr.y, F.scr.w, F.scr.h);
        g.restore();
      }
      chrome(g, F);
      if (!info.scene) composite(ctx, F);
    },
    scenes: {
      title: wrap("title", titleArt), chart: wrap("chart", chart), object: wrap("object", object), people: wrap("people", people),
      process: wrap("process", process), compare: wrap("compare", compare), closing: wrap("closing", closingArt),
    },
  };
});
