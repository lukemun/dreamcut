// Swiss: an International Typographic Style poster in motion. Off-white printed stock with a visible
// column grid, black grotesque set flush left, one red, hard rules, folios and a running index.
// Every scene is a poster set on the same grid: bar charts as solid slabs, a flat pictogram device,
// pictogram people, numbered steps, comparison slabs. Scenes change with grid shutters: the columns
// close in red and black one after another, left to right, and open again on the next poster.
// Under the text templates the base tokens alone keep the look. Frames are pure functions of time.
window.DreamcutMotion.register("swiss", ({ rng, hexA }) => {
  const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const expo = (v) => { v = clamp(v); return v >= 1 ? 1 : 1 - Math.pow(2, -10 * v); };
  const inout = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const ctl = () => (window.__dreamcut && window.__dreamcut.controls) || {};
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  const DEF = [2.4, 3.4, 3.6, 3.2, 3.6, 3.2, 2.4];
  const NAMES = { title: "Intro", chart: "Data", object: "Object", people: "People", process: "Process", compare: "Compare", closing: "End" };

  let F = null;

  // ---- type --------------------------------------------------------------------------------------
  // Grotesque set flush left; it arrives with a hard wipe from the left, never as an empty box.
  function say(g, s, x, y, size, o = {}) {
    s = String(s ?? "");
    const q = o.q ?? 1;
    if (!s || q <= 0) return 0;
    const wt = o.w || 700, u = F.u;
    const set = (sz) => {
      g.font = `${wt} ${sz}px ${FONT}`;
      g.letterSpacing = (o.track ?? (sz > 80 * u ? -0.035 : sz > 40 * u ? -0.012 : 0.01)) * sz + "px";
    };
    set(size);
    let w = g.measureText(s).width;
    if (o.maxW && w > o.maxW) { size = Math.max(o.min || size * 0.6, (size * o.maxW) / w); set(size); w = g.measureText(s).width; }
    const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    g.textAlign = "left";
    g.textBaseline = o.base || "alphabetic";
    g.fillStyle = o.color || F.ink(1);
    if (q < 1) {
      const k = expo(q);
      g.save(); g.beginPath(); g.rect(x0 - 6 * u, y - size * 1.6, (w + 12 * u) * k, size * 3.2); g.clip();
      g.fillText(s, x0 - (1 - k) * 34 * u, y);
      g.restore();
    } else g.fillText(s, x0, y);
    g.letterSpacing = "0px";
    return w;
  }
  function measure(g, s, size, wt = 700) {
    g.font = `${wt} ${size}px ${FONT}`;
    g.letterSpacing = (size > 80 * F.u ? -0.035 : size > 40 * F.u ? -0.012 : 0.01) * size + "px";
    const w = g.measureText(String(s ?? "")).width;
    g.letterSpacing = "0px";
    return w;
  }
  // Up to two flush-left lines; shrinks (not below min) when two lines are not enough.
  function lines(g, s, size, maxW, min, wt = 700) {
    const words = String(s ?? "").split(/\s+/).filter(Boolean);
    for (let sz = size; ; sz = Math.max(min, sz * 0.92)) {
      const out = [];
      let cur = "";
      for (const w of words) {
        const next = cur ? cur + " " + w : w;
        if (cur && measure(g, next, sz, wt) > maxW) { out.push(cur); cur = w; } else cur = next;
      }
      if (cur) out.push(cur);
      if ((out.length <= 2 && out.every((l) => measure(g, l, sz, wt) <= maxW)) || sz <= min) return { rows: out.slice(0, 2), size: sz };
    }
  }
  function sayLines(g, s, x, y, size, maxW, o = {}) {
    const L = lines(g, s, size, maxW, o.min || 42 * F.u, o.w || 700);
    L.rows.forEach((row, i) => say(g, row, x, y + i * L.size * 1.08, L.size, { ...o, maxW, q: o.q === undefined ? 1 : span(o.q, i * 0.15, 0.85 + i * 0.15) }));
    return L.rows.length * L.size * 1.08;
  }
  const dec = (v) => (Math.abs((Number(v) || 0) % 1) > 0.001 ? 1 : 0);
  const num = (v, target, d) => window.DreamcutMotion.formatNumber(v, dec(target), (d && d.prefix) || "", (d && d.suffix) || "");
  const niceStep = (x) => { const p = Math.pow(10, Math.floor(Math.log10(Math.max(x, 1e-6)))), m = x / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };

  // ---- drawing primitives -----------------------------------------------------------------------
  function rect(g, x, y, w, h, color) { if (w <= 0 || h <= 0) return; g.fillStyle = color; g.fillRect(x, y, w, h); }
  // A solid slab wiped on from one side as q runs.
  function slab(g, x, y, w, h, color, q, from = "left") {
    if (q <= 0) return;
    const k = expo(q);
    if (from === "left") rect(g, x, y, w * k, h, color);
    else if (from === "bottom") rect(g, x, y + h * (1 - k), w, h * k, color);
    else if (from === "top") rect(g, x, y, w, h * k, color);
    else rect(g, x + w * (1 - k), y, w * k, h, color);
  }
  function poly(g, pts, q, color, lw) {
    if (q <= 0 || pts.length < 2) return;
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let left = total * clamp(q);
    g.strokeStyle = color; g.lineWidth = lw; g.lineCap = "butt"; g.lineJoin = "miter"; g.setLineDash([]);
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], d = Math.hypot(bx - ax, by - ay);
      if (d >= left) { const k = d ? left / d : 0; g.lineTo(ax + (bx - ax) * k, ay + (by - ay) * k); break; }
      left -= d; g.lineTo(bx, by);
    }
    g.stroke();
  }
  // Diagonal print stripes inside a rectangle, drifting with time.
  function stripes(g, x, y, w, h, step, off, color, lw) {
    if (w <= 0 || h <= 0) return;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.strokeStyle = color; g.lineWidth = lw; g.setLineDash([]);
    g.beginPath();
    const o = ((off % step) + step) % step;
    for (let k = -h - step + o; k < w + step; k += step) { g.moveTo(x + k, y + h); g.lineTo(x + k + h, y); }
    g.stroke(); g.restore();
  }
  function dot(g, x, y, r, color) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = color; g.fill(); }
  // The sheet's one round form: a disc with concentric arc segments sweeping over it at their own
  // speeds, a hairline hand and an outer tick ring. o.disc / o.ring colour it; o.rings fades the arcs.
  function dial(g, cx, cy, r, t, q, o = {}) {
    if (q <= 0 || r <= 0) return;
    const k = expo(q), u = F.u, R = r * k;
    dot(g, cx, cy, R, o.disc || F.red(1));
    const ra = (o.rings ?? 1) * k;
    if (ra > 0) {
      g.save(); g.globalAlpha *= ra; g.lineCap = "butt"; g.setLineDash([]);
      const SP = [0.9, -1.4, 2.1], PH = [0.3, 2.2, 4.1];
      for (let i = 0; i < 3; i++) {
        const rr = R * (0.8 - i * 0.2), a0 = t * SP[i] + PH[i], len = TAU * (0.2 + 0.16 * Math.sin(t * (0.7 + i * 0.3) + i * 1.7));
        g.strokeStyle = o.ring || F.ink(1); g.lineWidth = R * 0.085;
        g.beginPath(); g.arc(cx, cy, rr, a0, a0 + len * span(q, 0.3 + i * 0.15, 0.8 + i * 0.1)); g.stroke();
      }
      const ha = -Math.PI / 2 + t * 0.5;
      g.strokeStyle = o.hand || F.paper(1); g.lineWidth = Math.max(2 * u, R * 0.025);
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ha) * R * 0.94, cy + Math.sin(ha) * R * 0.94); g.stroke();
      dot(g, cx, cy, R * 0.07, o.ring || F.ink(1));
      g.restore();
    }
    if (o.ticks) {
      const n = 36, cur = Math.floor(t * 6) % n;
      for (let i = 0; i < n; i++) {
        if (i / n > span(q, 0.2, 0.9)) break;
        const a = -Math.PI / 2 + (i / n) * TAU, maj = i % 9 === 0, r0 = r * 1.1, r1 = r * (maj ? 1.24 : 1.17);
        g.strokeStyle = i === cur ? F.red(1) : F.ink(maj ? 0.9 : 0.5); g.lineWidth = (i === cur ? 5 : maj ? 3.5 : 2) * u;
        g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
      }
    }
  }
  function tri(g, x, y, s, ang, color) {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.beginPath(); g.moveTo(s * 0.6, 0); g.lineTo(-s * 0.4, -s * 0.55); g.lineTo(-s * 0.4, s * 0.55); g.closePath();
    g.fillStyle = color; g.fill(); g.restore();
  }

  // ---- the grid, the paper and the running furniture ----------------------------------------------
  function sideOf() { return (F.tall ? 90 : 140) * F.u; }
  function headY() { return (F.tall ? 120 : 58) * F.u; }
  function footY() { return F.H - (F.tall ? 100 : 54) * F.u; }
  function grid() {
    const n = F.tall ? 6 : 12, side = sideOf(), gut = (F.tall ? 20 : 24) * F.u, cw = (F.W - side * 2 - gut * (n - 1)) / n;
    return { n, side, gut, cw, x: (i) => side + i * (cw + gut) };
  }
  function shownList() {
    const c = ctl();
    return ORDER.map((id, i) => ({ id, hold: Number(c[id + "_hold"] ?? DEF[i]) })).filter((s) => s.hold > 0);
  }

  let tiles = null, tileKey = "";
  function makeTiles() {
    const r = rng(83), n = 256;
    const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
    const dark = mk(n, n), lite = mk(n, n);
    for (const [cv, rgb, amt] of [[dark, [0, 0, 0], 0.16], [lite, [255, 255, 255], 0.12]]) {
      const x = cv.getContext("2d"), im = x.createImageData(n, n);
      for (let i = 0; i < n * n; i++) {
        const v = r(), a = v > 0.82 ? (v - 0.82) / 0.18 : 0;
        im.data[i * 4] = rgb[0]; im.data[i * 4 + 1] = rgb[1]; im.data[i * 4 + 2] = rgb[2]; im.data[i * 4 + 3] = Math.round(a * amt * 255);
      }
      x.putImageData(im, 0, 0);
    }
    // Soft mottling of the stock: a few large, faint blotches.
    const mott = mk(64, 36), mx = mott.getContext("2d");
    for (let i = 0; i < 64 * 36; i++) { const v = r(); mx.fillStyle = `rgba(${v > 0.5 ? "255,255,255" : "0,0,0"},${Math.abs(v - 0.5) * 0.5})`; mx.fillRect(i % 64, Math.floor(i / 64), 1, 1); }
    // Fibres: short hairlines scattered through the sheet.
    const fib = mk(512, 512), fx = fib.getContext("2d");
    fx.lineWidth = 1;
    for (let i = 0; i < 70; i++) {
      const x = r() * 512, y = r() * 512, a = r() * TAU, l = 6 + r() * 18;
      fx.strokeStyle = `rgba(0,0,0,${0.05 + r() * 0.06})`;
      fx.beginPath(); fx.moveTo(x, y); fx.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); fx.stroke();
    }
    return { dark, lite, mott, fib };
  }
  function paper(g) {
    const { W, H } = F;
    g.fillStyle = F.BG; g.fillRect(0, 0, W, H);
    if (F.tex <= 0) return;
    g.save();
    g.globalAlpha = 0.16 * F.tex;
    g.imageSmoothingEnabled = true;
    g.filter = `blur(${24 * F.u}px)`;
    g.drawImage(tiles.mott, -40 * F.u, -40 * F.u, W + 80 * F.u, H + 80 * F.u);
    g.filter = "none";
    g.globalAlpha = F.tex;
    g.fillStyle = g.createPattern(tiles.fib, "repeat"); g.fillRect(0, 0, W, H);
    g.restore();
  }
  // The print's finish over everything: grain and a faint uneven ink density at the edges.
  function finish(g) {
    if (!F.backdrop || F.tex <= 0) return;
    const { W, H } = F;
    g.save();
    g.globalAlpha = F.tex;
    g.fillStyle = g.createPattern(tiles.dark, "repeat"); g.fillRect(0, 0, W, H);
    g.fillStyle = g.createPattern(tiles.lite, "repeat"); g.translate(97, 41); g.fillRect(-97, -41, W, H);
    g.setTransform(1, 0, 0, 1, 0, 0);
    const gr = g.createRadialGradient(W * 0.5, H * 0.46, Math.min(W, H) * 0.3, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.62);
    gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, F.dark ? "rgba(0,0,0,0.3)" : "rgba(60,50,30,0.07)");
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.restore();
  }
  function world(g) {
    const { W, H, u, tall, info } = F, G = grid(), side = G.side, hy = headY(), fy = footY();
    // Column guides, as on the designer's layout sheet.
    g.fillStyle = F.ink(0.045);
    for (let i = 0; i < G.n; i++) { const x = G.x(i); g.fillRect(x, hy + 14 * u, 1.2 * u, fy - hy - 28 * u); g.fillRect(x + G.cw - 1.2 * u, hy + 14 * u, 1.2 * u, fy - hy - 28 * u); }
    // Baseline ticks down the left margin.
    g.fillStyle = F.ink(0.22);
    for (let y = hy + 40 * u, k = 0; y < fy - 20 * u; y += 24 * u, k++) g.fillRect(side - (k % 4 ? 18 : 30) * u, y, (k % 4 ? 8 : 14) * u, 1.4 * u);
    // Running head: a heavy rule, the folio and the current section.
    rect(g, side, hy, W - side * 2, 4 * u, F.ink(1));
    say(g, "DreamCut", side, hy - 14 * u, 22 * u, { w: 700 });
    say(g, tall ? "Explainer" : "Explainer — set in one grid", G.x(tall ? 2 : 3), hy - 14 * u, 22 * u, { w: 400, color: F.ink(0.8) });
    const list = shownList(), idx = Math.max(0, info.index), cur = list[idx];
    if (cur) {
      const q = info.index > 0 ? span(info.local, 0.1, 0.6) : 1;
      const w2 = measure(g, NAMES[cur.id], 22 * u, 400);
      say(g, NAMES[cur.id], W - side, hy - 14 * u, 22 * u, { w: 400, align: "right", q });
      say(g, String(idx + 1).padStart(2, "0"), W - side - w2 - 14 * u, hy - 14 * u, 22 * u, { w: 700, align: "right", color: F.red(1), q });
    }
    // Running index at the foot: every section, the current one filling as it plays.
    rect(g, side, fy, W - side * 2, 2 * u, F.ink(0.9));
    const n = list.length, segW = (W - side * 2) / Math.max(1, n);
    list.forEach((s, i) => {
      const x = side + segW * i;
      const past = i < idx, now = i === idx;
      if (past) rect(g, x, fy - 3 * u, segW - 8 * u, 8 * u, F.ink(1));
      if (now) { rect(g, x, fy - 3 * u, segW - 8 * u, 8 * u, F.ink(0.12)); rect(g, x, fy - 3 * u, (segW - 8 * u) * clamp(info.local / Math.max(0.1, info.hold)), 8 * u, F.red(1)); }
      if (segW > 120 * u || now) {
        const nw = say(g, String(i + 1).padStart(2, "0"), x, fy + 32 * u, 20 * u, { w: 700, color: now ? F.red(1) : F.ink(0.85) });
        if (segW > 150 * u) say(g, NAMES[s.id], x + nw + 10 * u, fy + 32 * u, 20 * u, { w: 400, color: F.ink(now ? 0.95 : 0.6) });
      }
    });
    // Margin line, set vertically.
    g.save(); g.translate(side * 0.42, fy - 10 * u); g.rotate(-Math.PI / 2);
    say(g, "A local, file-backed video editor  ·  Fig. " + String(idx + 1).padStart(2, "0"), 0, 0, 18 * u, { w: 400, color: F.ink(0.55), base: "middle", track: 0.08 });
    g.restore();
    // Registration marks.
    for (const [x, y] of [[side * 0.42, hy], [W - side * 0.42, hy], [W - side * 0.42, fy]]) {
      g.strokeStyle = F.ink(0.5); g.lineWidth = 1.2 * u; g.setLineDash([]);
      g.beginPath(); g.arc(x, y, 9 * u, 0, TAU); g.moveTo(x - 16 * u, y); g.lineTo(x + 16 * u, y); g.moveTo(x, y - 16 * u); g.lineTo(x, y + 16 * u); g.stroke();
    }
  }

  // ---- scene changes: grid shutters ---------------------------------------------------------------
  // Each column closes (top down or bottom up, alternately) and opens again; under it the old poster
  // gives way to the new one at the moment it is shut. Columns run left to right.
  function shutterCols() { const n = F.tall ? 6 : 12; return { n, w: F.W / n }; }
  function off(i) { return (i * 0.9 * F.change) / (shutterCols().n - 1); }
  // Restrict drawing to columns already turned over ("new") or not yet ("old"); false: nothing to draw.
  function clipCols(g, which) {
    const T = F.bIn;
    if (T == null) return which === "new";
    const { n, w } = shutterCols();
    if (F.t >= T + off(n - 1)) return which === "new";
    g.beginPath();
    let any = false;
    for (let i = 0; i < n; i++) {
      const done = F.t >= T + off(i);
      if ((which === "new") === done) { g.rect(i * w - 0.5, 0, w + 1, F.H); any = true; }
    }
    if (any) g.clip();
    return any;
  }
  function shutters(g) {
    const { n, w } = shutterCols(), D = 0.42 * F.change, H = F.H, u = F.u, t = F.t;
    for (const T of [F.bIn, F.bOut]) {
      if (T == null) continue;
      for (let i = 0; i < n; i++) {
        const s = T + off(i);
        let y0, y1, lead;
        if (t >= s - D && t < s) { const k = inout((t - (s - D)) / D); y0 = 0; y1 = H * k; lead = y1; }
        else if (t >= s && t < s + D) { const k = inout((t - s) / D); y0 = H * k; y1 = H; lead = y0; }
        else continue;
        if (i % 2) { const a = H - y1, b = H - y0; y0 = a; y1 = b; lead = H - lead; }
        const black = i % 4 === 3;
        rect(g, i * w, y0, w + 0.6, y1 - y0, black ? F.ink(1) : F.red(1));
        const lh = 10 * u;
        rect(g, i * w, clamp(lead - lh / 2, y0, y1 - lh), w + 0.6, Math.min(lh, y1 - y0), black ? F.red(1) : F.ink(1));
      }
    }
  }
  function cover(g) {
    if (F.covered) return;
    F.covered = true;
    shutters(g);
    finish(g);
  }

  // ---- layout -------------------------------------------------------------------------------------
  const lineCache = {};
  function headLines(id) {
    if (lineCache[id]) return lineCache[id];
    const el = document.getElementById(id), root = document.getElementById("root");
    if (!el || !root || !el.firstChild) return [];
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
    if (out.length) lineCache[id] = out;
    return out;
  }
  function areaOf(id) {
    const { W, H, u, tall } = F, side = sideOf();
    const b = tall ? { x: side, y: H * 0.3, w: W - side * 2, h: H * 0.6 } : { x: side, y: H * 0.34, w: W - side * 2, h: H * 0.58 };
    const ls = headLines(id + "-title");
    let top = b.y;
    if (ls.length) { const bottom = Math.max(...ls.map((l) => l.y + l.h)); top = Math.min(b.y, Math.max(bottom + (tall ? 70 : 52) * u, H * (tall ? 0.18 : 0.21))); }
    const bottom = footY() - (tall ? 70 : 46) * u;
    return { x: b.x, y: top, w: b.w, h: bottom - top };
  }

  // ---- chart: solid slabs on a ruled scale, a readout column and a share grid ----------------------
  // The build ends at this local time; after it each drawer plays a second beat through the hold.
  const built = (hold) => 0.08 + Math.max(0.6, Math.min(1.7, hold * 0.5));
  function chart(g, a, p, d, local, hold) {
    const { u, tall, t } = F;
    const vals = (d.values || []).map((v) => Math.max(0, Number(v) || 0));
    const n = Math.max(1, vals.length), max = Math.max(...vals, 1e-6), sum = vals.reduce((s, v) => s + v, 0);
    const hi = Number.isFinite(d.highlight) && d.highlight >= 0 && d.highlight < n ? d.highlight : vals.indexOf(Math.max(...vals));
    const stepV = niceStep(max / 4), topV = Math.max(stepV, Math.ceil(max / stepV) * stepV);
    const P = tall
      ? { x: a.x + 76 * u, y: a.y + 90 * u, w: a.w - 76 * u, h: a.h * 0.64 - 180 * u }
      : { x: a.x + 84 * u, y: a.y + 86 * u, w: a.w * 0.64 - 84 * u, h: a.h - 86 * u - 96 * u };
    const R = tall ? { x: a.x, y: P.y + P.h + 120 * u, w: a.w, h: a.y + a.h - (P.y + P.h + 120 * u) } : { x: a.x + a.w * 0.69, y: a.y, w: a.w * 0.31, h: a.h };
    const base = P.y + P.h;
    const slot = P.w / n, bw = Math.min(slot * 0.66, 230 * u);
    const barX = (i) => P.x + slot * i + (slot - bw) / 2;
    // Second beat: the reading line stops on each bar in turn (the highlight last) and the readout follows it.
    const B = built(hold), order = [...vals.keys()].filter((i) => i !== hi).concat([hi]);
    const dwell = Math.max(0.45, (hold - B - 0.15) / order.length);
    const tour = local - B;
    let from = hi, to = hi, mk = 1, since = 9;
    if (tour > 0 && n > 1) {
      const j = Math.min(order.length - 1, Math.floor(tour / dwell));
      from = j === 0 ? hi : order[j - 1]; to = order[j];
      const lt = tour - j * dwell;
      mk = inout(lt / 0.32); since = lt;
    }
    const focus = to;
    // Scale: hairlines with small figures in the margin column.
    for (let v = 0, i = 0; v <= topV + 1e-9; v += stepV, i++) {
      const y = base - (v / topV) * P.h, q = span(p, 0.02 + i * 0.04, 0.3 + i * 0.04);
      if (i) slab(g, P.x - 24 * u, y, P.w + 24 * u, 1.4 * u, F.ink(0.22), q);
      say(g, num(v, stepV, d), a.x, y + 8 * u, 24 * u, { w: 500, color: F.ink(0.62), q });
    }
    let hot = null;
    vals.forEach((v, i) => {
      const x = barX(i), k = expo(span(p, 0.08 + i * 0.07, 0.5 + i * 0.07));
      const h = Math.max(6 * u, (v / topV) * P.h) * k, isHot = i === hi, col = isHot ? F.red(1) : F.ink(1);
      rect(g, x, base - h, bw, h, col);
      if (isHot) { stripes(g, x, base - h, bw, h, 26 * u, t * 34 * u, F.paper(0.22), 6 * u); hot = { x, v, h, label: d.labels[i] || "" }; }
      // The bar under the reading line gets a red frame and its figure turns red.
      const isF = tour > 0 && i === focus && !isHot ? expo(span(since, 0.2, 0.45)) : 0;
      if (isF > 0) { g.strokeStyle = F.red(1); g.lineWidth = 6 * u; g.strokeRect(x - 9 * u, base - h - 9 * u, bw + 18 * u, (h + 9 * u) * isF); }
      if (k > 0.02) say(g, num(v * k, v, d), x, base - h - 18 * u, 52 * u, { color: isF > 0.5 ? F.red(1) : col, maxW: slot - 10 * u, min: 42 * u });
      say(g, d.labels[i] || "", x, base + 62 * u, 42 * u, { color: isF > 0.5 ? F.red(1) : F.ink(1), q: span(p, 0.25 + i * 0.06, 0.55 + i * 0.06), maxW: slot - 16 * u, min: 42 * u });
    });
    slab(g, P.x - 24 * u, base, P.w + 24 * u, 5 * u, F.ink(1), span(p, 0, 0.3));
    // The reading line: a red hairline, a dot where it meets a top, a dashed level to the scale.
    const sk = span(p, 0.65, 0.85);
    if (sk > 0) {
      const cx = (i) => barX(i) + bw / 2;
      const sx = lerp(cx(from), cx(to), mk) + (mk >= 1 ? Math.sin(t * 5) * 3 * u : 0);
      const fv = lerp(vals[from], vals[to], mk), y = base - Math.max(6 * u, (fv / topV) * P.h);
      g.globalAlpha *= sk;
      rect(g, sx - 1.5 * u, P.y - 40 * u, 3 * u, P.h + 40 * u, F.red(1));
      g.strokeStyle = F.red(0.9); g.lineWidth = 2 * u; g.setLineDash([8 * u, 7 * u]); g.lineDashOffset = -t * 24 * u;
      g.beginPath(); g.moveTo(P.x - 24 * u, y); g.lineTo(sx, y); g.stroke(); g.setLineDash([]); g.lineDashOffset = 0;
      dot(g, sx, y, 11 * u, F.red(1)); dot(g, sx, y, 4.5 * u, F.paper(1));
      tri(g, sx, P.y - 50 * u, 22 * u, Math.PI / 2, F.red(1));
      g.globalAlpha /= sk;
    }
    if (!hot) return;
    // Readout column: it reads the focused bar.
    // The readout keeps the previous bar's text until the new one wipes over it, so it is never blank.
    const swap = tour > 0 && since < 0.18, fi = swap ? from : focus, fvRaw = vals[fi], flabel = d.labels[fi] || "";
    const rq = span(p, 0.35, 0.6), sw = tour > 0 && !swap ? span(since, 0.18, 0.5) : 1;
    slab(g, R.x, R.y, R.w, 5 * u, F.ink(1), rq);
    if (tour > 0 && since < 0.5) rect(g, R.x, R.y - 4 * u, R.w * expo(since / 0.5), 13 * u, F.red(1));
    const others = vals.filter((_, i) => i !== fi), mean = others.length ? others.reduce((s, v) => s + v, 0) / others.length : 0;
    const pct = mean > 0 ? Math.round(((fvRaw - mean) / mean) * 100) : null;
    const prevV = swap ? vals[fi] : vals[from];
    const share = sum > 0 ? lerp(prevV, fvRaw, ease(sw)) / sum : 0;
    const vk = ease(span(p, 0.4, 0.8)), shown = tour > 0 ? lerp(prevV, fvRaw, ease(sw)) : hot.v * vk;
    const shareTxt = `${Math.round((sum > 0 ? fvRaw / sum : 0) * 100)}% of the total`;
    const fcol = fi === hi ? F.red(1) : F.ink(1);
    if (!tall) {
      say(g, flabel, R.x, R.y + 66 * u, 42 * u, { q: tour > 0 ? sw : rq, maxW: R.w, min: 42 * u });
      say(g, num(shown, fvRaw, d), R.x - 6 * u, R.y + 250 * u, 172 * u, { q: rq > 0 ? 1 : 0, color: fcol, maxW: R.w, min: 96 * u });
      slab(g, R.x, R.y + 300 * u, R.w, 2 * u, F.ink(0.9), span(p, 0.5, 0.7));
      if (pct !== null) {
        const pw = say(g, `${pct >= 0 ? "+" : "−"}${Math.abs(pct)}%`, R.x, R.y + 382 * u, 66 * u, { q: tour > 0 ? sw : span(p, 0.55, 0.8) });
        say(g, "vs. the rest", R.x + pw + 16 * u, R.y + 382 * u, 30 * u, { w: 400, color: F.ink(0.7), q: tour > 0 ? sw : span(p, 0.6, 0.85), maxW: R.w - pw - 16 * u, min: 22 * u });
      }
      shareGrid(g, R.x, R.y + 430 * u, R.w, Math.min(R.h - 520 * u, 200 * u), share, p, t);
      say(g, shareTxt, R.x, Math.min(R.y + R.h - 10 * u, R.y + 430 * u + Math.min(R.h - 520 * u, 200 * u) + 70 * u), 42 * u, { q: tour > 0 ? (swap ? 1 : span(since, 0.3, 0.7)) : span(p, 0.7, 0.95), maxW: R.w, min: 32 * u });
    } else {
      const half = R.w * 0.52;
      say(g, flabel, R.x, R.y + 66 * u, 42 * u, { q: tour > 0 ? sw : rq, maxW: half, min: 42 * u });
      say(g, num(shown, fvRaw, d), R.x - 4 * u, R.y + 236 * u, 160 * u, { q: rq > 0 ? 1 : 0, color: fcol, maxW: half, min: 96 * u });
      if (pct !== null) say(g, `${pct >= 0 ? "+" : "−"}${Math.abs(pct)}% vs. the rest`, R.x, R.y + 316 * u, 42 * u, { q: tour > 0 ? sw : span(p, 0.55, 0.8), maxW: half, min: 32 * u });
      const gx = R.x + half + 30 * u, gw = R.w - half - 30 * u;
      shareGrid(g, gx, R.y + 40 * u, gw, Math.min(220 * u, R.h - 160 * u), share, p, t);
      say(g, shareTxt, gx, R.y + 40 * u + Math.min(220 * u, R.h - 160 * u) + 62 * u, 42 * u, { q: tour > 0 ? (swap ? 1 : span(since, 0.3, 0.7)) : span(p, 0.7, 0.95), maxW: gw, min: 30 * u });
    }
  }
  // Twenty squares, one per five percent; the highlighted share fills in red, a cursor walks the rest.
  function shareGrid(g, x, y, w, h, share, p, t) {
    const u = F.u, cols = 10, rows = 2, gap = 8 * u, s = Math.min((w - gap * (cols - 1)) / cols, (h - gap) / rows);
    const filled = share * 20, cur = Math.floor(t * 2.2) % 20;
    for (let i = 0; i < 20; i++) {
      const cx = x + (i % cols) * (s + gap), cy = y + Math.floor(i / cols) * (s + gap), q = span(p, 0.45 + i * 0.012, 0.6 + i * 0.012);
      if (q <= 0) continue;
      const k = expo(q), ss = s * k;
      const part = clamp(filled - i);
      if (part > 0) { if (part < 1) { g.strokeStyle = F.ink(0.35); g.lineWidth = 2 * u; g.strokeRect(cx + u, cy + s - ss + u, s - 2 * u, ss - 2 * u); } rect(g, cx, cy + s - ss * part, s, ss * part, F.red(1)); }
      else { g.strokeStyle = F.ink(0.35); g.lineWidth = 2 * u; g.strokeRect(cx + u, cy + s - ss + u, s - 2 * u, ss - 2 * u); }
      if (p > 0.9 && i === cur) { g.strokeStyle = F.ink(1); g.lineWidth = 3 * u; g.strokeRect(cx - 5 * u, cy - 5 * u, s + 10 * u, s + 10 * u); }
    }
  }

  // ---- object: a flat pictogram device, its screen playing an edit, keyed callouts ----------------
  function screenEdit(g, I, q, t, phone, lit = -1, lk = 0) {
    const u = F.u;
    rect(g, I.x, I.y, I.w, I.h, F.paper(1));
    const pv = { x: I.x + I.w * 0.06, y: I.y + I.h * 0.07, w: I.w * 0.88, h: I.h * (phone ? 0.42 : 0.5) };
    const q1 = span(q, 0, 0.4);
    // The preview: a small poster of its own, a red disc gliding over a black slab and two rules.
    g.save(); g.beginPath(); g.rect(pv.x, pv.y, pv.w * expo(q1), pv.h); g.clip();
    rect(g, pv.x, pv.y, pv.w, pv.h, F.ink(0.06));
    rect(g, pv.x + pv.w * 0.08, pv.y + pv.h * 0.56, pv.w * 0.5, pv.h * 0.2, F.ink(1));
    if (lit === 0) { rect(g, pv.x + pv.w * 0.08, pv.y + pv.h * 0.56, pv.w * 0.5 * expo(lk), pv.h * 0.2, F.red(1)); rect(g, pv.x, pv.y, pv.w, pv.h, F.red(0.1 * lk)); }
    rect(g, pv.x + pv.w * 0.08, pv.y + pv.h * 0.84, pv.w * 0.84, 3 * u, F.ink(0.8));
    rect(g, pv.x + pv.w * 0.08, pv.y + pv.h * 0.14, pv.w * 0.3, 3 * u, F.ink(0.8));
    const dx = pv.x + pv.w * (0.55 + 0.25 * Math.sin(t * 1.3)), dy = pv.y + pv.h * (0.42 + 0.14 * Math.sin(t * 2.1 + 1));
    dot(g, dx, dy, Math.min(pv.w, pv.h) * 0.2, F.red(1));
    g.restore();
    // Timeline: a ruler, two tracks of clips (one proposed, in red) and a waveform.
    const tl = { x: pv.x, y: pv.y + pv.h + I.h * 0.07, w: pv.w };
    const th = I.h * (phone ? 0.075 : 0.085), gap = th * 0.45;
    const q2 = span(q, 0.25, 0.75);
    for (let k = 0; k <= 24; k++) { if (k / 24 > expo(q2)) break; rect(g, tl.x + (tl.w * k) / 24, tl.y - (k % 4 ? 6 : 12) * u, 1.6 * u, (k % 4 ? 6 : 12) * u, F.ink(0.6)); }
    const rows = [[[0, 0.24], [0.26, 0.3], [0.58, 0.42]], [[0.08, 0.22, 1], [0.34, 0.36]]];
    const anchors = {};
    rows.forEach((clips, r) => clips.forEach(([s0, w0, hot], i) => {
      const y = tl.y + 10 * u + r * (th + gap), x = tl.x + tl.w * s0, w = tl.w * w0 - 5 * u;
      const k = span(q2, (r * 3 + i) * 0.1, 0.5 + (r * 3 + i) * 0.1);
      slab(g, x, y, w, th, hot ? F.red(1) : F.ink(1), k);
      if (lit === 2 && r === 0 && !hot) slab(g, x, y, w, th, F.red(1), lk);
      if (lit === 1 && hot) stripes(g, x, y, w, th, 18 * u, t * 40 * u, F.paper(0.35), 5 * u);
      if (hot) { anchors.clip = [x + w * 0.5, y + th / 2]; anchors.clipR = [x, y, w, th]; }
      if (r === 0 && i === 1) anchors.track = [x + w * 0.5, y + th / 2];
    }));
    const wy = tl.y + 10 * u + 2 * (th + gap) + th / 2, bars = 48;
    for (let k = 0; k < bars; k++) {
      if (k / bars > span(q, 0.5, 0.9)) break;
      const a = (0.35 + 0.65 * Math.abs(Math.sin(k * 0.73) * Math.cos(k * 0.21))) * th * 0.5;
      rect(g, tl.x + (tl.w * k) / bars, wy - a, (tl.w / bars) * 0.55, a * 2, F.ink(0.7));
    }
    if (q > 0.7) {
      const px = tl.x + tl.w * ((t * 0.12 + 0.2) % 1);
      rect(g, px - 1.5 * u, tl.y - 14 * u, 3 * u, wy + th * 0.6 - tl.y + 14 * u, F.red(1));
      tri(g, px, tl.y - 20 * u, 18 * u, Math.PI / 2, F.red(1));
    }
    anchors.preview = [pv.x + pv.w * 0.32, pv.y + pv.h * 0.66];
    anchors.regions = [[pv.x, pv.y, pv.w, pv.h], anchors.clipR, [tl.x, tl.y + 10 * u, tl.w, th]];
    // The lit region gets a red frame with corner keys.
    const R = lit >= 0 && anchors.regions[lit];
    if (R && lk > 0) {
      const m = 10 * u, e = expo(lk);
      g.strokeStyle = F.red(1); g.lineWidth = 5 * u; g.setLineDash([]);
      g.strokeRect(R[0] - m, R[1] - m, (R[2] + m * 2) * e, R[3] + m * 2);
      for (const [cx, cy] of [[R[0] - m, R[1] - m], [R[0] + R[2] + m, R[1] - m], [R[0] - m, R[1] + R[3] + m], [R[0] + R[2] + m, R[1] + R[3] + m]]) if (e > 0.9) rect(g, cx - 7 * u, cy - 7 * u, 14 * u, 14 * u, F.red(1));
    }
    return anchors;
  }
  function object(g, a, p, d, local, hold) {
    const { u, tall, t } = F, phone = d.kind === "phone";
    // Second beat: each callout lights in turn, with its leader and its region of the device.
    const B = built(hold), dur = Math.max(0.5, (hold - B - 0.1) / 3), tour = local - B;
    const lit = tour > 0 && tour < dur * 3 ? Math.floor(tour / dur) : -1;
    const lk = lit >= 0 ? clamp((tour - lit * dur) / 0.25) * (1 - clamp((tour - (lit + 1) * dur + 0.12) / 0.12)) : 0;
    const settled = tour >= dur * 3;
    const DESC = ["Plays the result as you tune it", "Drafted by the agent, in red", "Stays as it is until you apply"];
    const D = tall ? { x: a.x, y: a.y, w: a.w, h: a.h * 0.6 } : { x: a.x, y: a.y + 10 * u, w: a.w * 0.6, h: a.h - 20 * u };
    let body, I;
    if (phone) {
      const h = D.h - 20 * u, w = Math.min(h * 0.5, D.w * 0.6);
      body = { x: D.x + (tall ? (D.w - w) / 2 : D.w * 0.18), y: D.y + 10 * u, w, h };
      I = { x: body.x + 16 * u, y: body.y + 54 * u, w: w - 32 * u, h: h - 100 * u };
    } else {
      const w = Math.min(D.w * 0.92, (D.h - 50 * u) * 1.55), h = w / 1.55;
      body = { x: D.x + (D.w - w) / 2 + (tall ? 0 : 20 * u), y: D.y + (D.h - h - 46 * u) / 2, w, h };
      I = { x: body.x + 20 * u, y: body.y + 20 * u, w: w - 40 * u, h: h - 40 * u };
    }
    const bq = span(p, 0, 0.3);
    slab(g, body.x, body.y, body.w, body.h, F.ink(1), bq, "bottom");
    if (!phone) {
      const k = expo(span(p, 0.1, 0.35));
      g.fillStyle = F.ink(1); g.beginPath();
      const bx = body.x - 50 * u, by = body.y + body.h, bw2 = body.w + 100 * u;
      g.moveTo(body.x + body.w / 2 - (bw2 / 2) * k, by); g.lineTo(body.x + body.w / 2 + (bw2 / 2) * k, by);
      g.lineTo(body.x + body.w / 2 + (bw2 / 2 - 24 * u) * k, by + 34 * u); g.lineTo(body.x + body.w / 2 - (bw2 / 2 - 24 * u) * k, by + 34 * u); g.closePath(); g.fill();
      if (k > 0.5) rect(g, body.x + body.w / 2 - 70 * u, by, 140 * u, 9 * u, F.paper(0.9));
      void bx;
    } else if (bq > 0.6) rect(g, body.x + body.w / 2 - 40 * u, body.y + 24 * u, 80 * u, 9 * u, F.paper(0.85));
    let anchors = null;
    if (bq > 0.3) anchors = screenEdit(g, I, span(p, 0.08, 0.6), t, phone, lit, lk);
    if (!anchors) return;
    const keys = [anchors.preview, anchors.clip, anchors.track];
    if (!tall) {
      const C = { x: a.x + a.w * 0.66, w: a.w * 0.34 }, rowH = (a.h - 20 * u) / 3;
      keys.forEach((pt, i) => {
        const q = span(p, 0.42 + i * 0.12, 0.72 + i * 0.12);
        if (q <= 0) return;
        const ry = a.y + 10 * u + rowH * i, on = i === lit, dim = lit >= 0 && !on;
        const col = on || settled || lit < 0 ? (i === 1 || on ? F.red(1) : F.ink(1)) : F.ink(0.35);
        slab(g, C.x, ry, C.w, 4 * u, F.ink(1), q);
        if (on) rect(g, C.x, ry - 4 * u, C.w * expo(lk), 13 * u, F.red(1));
        if (on) { rect(g, C.x - 8 * u, ry + 22 * u, 66 * u, 76 * u * expo(lk), F.red(1)); say(g, String(i + 1), C.x + 25 * u, ry + 82 * u, 64 * u, { color: F.paper(1), q, align: "center" }); }
        else say(g, String(i + 1), C.x, ry + 82 * u, 64 * u, { color: dim ? F.ink(0.45) : F.red(1), q });
        const lh = sayLines(g, d.callouts[i] || "", C.x + 76 * u, ry + 74 * u, 46 * u, C.w - 76 * u, { q, min: 42 * u, color: dim ? F.ink(0.55) : F.ink(1) });
        say(g, DESC[i], C.x + 76 * u, ry + 74 * u + lh + 6 * u, 30 * u, { w: 400, color: on ? F.red(1) : F.ink(dim ? 0.45 : 0.7), q: span(q, 0.4, 1), maxW: C.w - 76 * u, min: 24 * u });
        // Orthogonal leader from the device to the row.
        const ex = C.x - 26 * u, ly = ry + 58 * u, elbow = body.x + body.w + 40 * u + i * 26 * u;
        const pts = [[pt[0], pt[1]], [elbow, pt[1]], [elbow, ly], [ex, ly]];
        poly(g, pts, span(q, 0, 0.7), col, (on ? 6 : 3) * u);
        dot(g, pt[0], pt[1], (on ? 15 : 11) * u * expo(q), col); dot(g, pt[0], pt[1], 4.5 * u * expo(q), F.paper(1));
        if (q > 0.7) rect(g, ex - 4 * u, ly - 7 * u, 14 * u, 14 * u, col);
        // A square runs down the lit leader.
        const pk = on ? clamp((tour - lit * dur) / Math.max(0.3, dur * 0.8)) : settled ? ((t * 0.6 - i / 3) % 1 + 1) % 1 : -1;
        if (pk >= 0 && pk <= 1) {
          const L = pts.slice(1).reduce((s, b, j) => s + Math.hypot(b[0] - pts[j][0], b[1] - pts[j][1]), 0);
          let left = L * ease(pk);
          for (let j = 1; j < pts.length; j++) {
            const sl = Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]);
            if (left <= sl) { const k = sl ? left / sl : 0; rect(g, lerp(pts[j - 1][0], pts[j][0], k) - 8 * u, lerp(pts[j - 1][1], pts[j][1], k) - 8 * u, 16 * u, 16 * u, F.red(1)); break; }
            left -= sl;
          }
        }
      });
    } else {
      const top = D.y + D.h + 40 * u, rowH = (a.y + a.h - top) / 3;
      keys.forEach((pt, i) => {
        const q = span(p, 0.42 + i * 0.12, 0.72 + i * 0.12);
        if (q <= 0) return;
        const ry = top + rowH * i, on = i === lit, col = i === 1 || on ? F.red(1) : F.ink(1);
        if (on) rect(g, a.x, ry - 4 * u, a.w * expo(lk), 13 * u, F.red(1));
        slab(g, a.x, ry, a.w, 4 * u, F.ink(1), q);
        say(g, String(i + 1), a.x, ry + 82 * u, 64 * u, { color: F.red(1), q });
        sayLines(g, d.callouts[i] || "", a.x + 80 * u, ry + 74 * u, 48 * u, a.w - 80 * u, { q, min: 42 * u });
        const r = 26 * u * expo(q) * (1 + 0.08 * Math.sin(t * 3 + i * 2));
        dot(g, pt[0], pt[1], r, col);
        say(g, String(i + 1), pt[0], pt[1] + 1 * u, 30 * u, { align: "center", base: "middle", color: F.paper(1), q: q > 0.5 ? 1 : 0 });
      });
    }
  }

  // ---- people: pictogram figures on a ground rule, a review dot travelling over their heads --------
  function figure(g, cx, base, fh, color, q, nod) {
    if (q <= 0) return;
    const r = fh * 0.12, bw = fh * 0.36, armW = bw * 0.17, gap = bw * 0.06;
    const headY = base - fh + r - nod, torsoY = base - fh + r * 2 + fh * 0.04, torsoH = fh * 0.4, legY = torsoY + torsoH + fh * 0.015;
    g.save();
    g.beginPath(); g.rect(cx - fh, base - (fh + 20 * F.u) * expo(q), fh * 2, (fh + 20 * F.u) * expo(q) + 2); g.clip();
    g.fillStyle = color;
    g.beginPath(); g.arc(cx, headY, r, 0, TAU); g.fill();
    const tx = cx - bw / 2, rr = bw * 0.3;
    g.beginPath(); g.moveTo(tx, torsoY + rr); g.arcTo(tx, torsoY, tx + rr, torsoY, rr); g.lineTo(tx + bw - rr, torsoY); g.arcTo(tx + bw, torsoY, tx + bw, torsoY + rr, rr); g.lineTo(tx + bw, torsoY + torsoH); g.lineTo(tx, torsoY + torsoH); g.closePath(); g.fill();
    g.fillRect(tx - gap - armW, torsoY + rr * 0.6, armW, torsoH * 0.95);
    g.fillRect(tx + bw + gap, torsoY + rr * 0.6, armW, torsoH * 0.95);
    const lw = bw * 0.42;
    g.fillRect(tx, legY, lw, base - legY);
    g.fillRect(tx + bw - lw, legY, lw, base - legY);
    g.restore();
  }
  const ROLES = ["Reviewer", "Client", "Narrator", "Designer", "Assistant"];
  function people(g, a, p, d, local, hold) {
    const { u, tall, t } = F;
    const n = clamp(Math.round(Number(d.count) || 4), 1, 8), rows = tall && n > 3 ? 2 : 1, per = Math.ceil(n / rows);
    const hiI = Number.isFinite(d.highlight) ? d.highlight : 1;
    const groupRoom = 150 * u, rowH = (a.h - groupRoom) / rows, labelRoom = 120 * u, lineRoom = 70 * u;
    const fh = Math.min(rowH - labelRoom - lineRoom - 20 * u, (a.w / per) * 1.5);
    // Staging: the figures rise one after another; the marker stops over each while its name sets.
    const st = Math.min(0.42, (hold * 0.5) / n), rise = (i) => 0.12 + i * st;
    const staged = rise(n - 1) + 0.45;
    const slots = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / per), inRow = Math.min(per, n - r * per), c = i - r * per, sw = a.w / per;
      const cx = a.x + sw * c + sw / 2 + ((per - inRow) * sw) / 2, base = a.y + lineRoom + fh + 10 * u + r * rowH;
      slots.push({ cx, base, r, sw });
    }
    for (let r = 0; r < rows; r++) {
      const base = a.y + lineRoom + fh + 10 * u + r * rowH;
      slab(g, a.x, base, a.w, 5 * u, F.ink(1), span(local, 0, 0.5));
      const ly = base - fh - 36 * u;
      slab(g, a.x, ly, a.w, 2 * u, F.ink(0.5), span(local, 0.1, 0.6));
    }
    // Marker position, in figure units: it steps with the staging, then walks the row and back.
    let mpos;
    if (local < staged) { const i = clamp(Math.floor((local - 0.12) / st), 0, n - 1), lt = (local - 0.12) - i * st; mpos = i - 1 + (i === 0 ? 1 : inout(lt / (st * 0.6))); }
    else { const w = (local - staged) * 0.9; mpos = (n - 1) * (0.5 + 0.5 * Math.cos(w * TAU / Math.max(2, n * 0.7))); }
    slots.forEach((s, i) => {
      const q = span(local, rise(i), rise(i) + 0.4), isHot = i === hiI;
      const near = Math.max(0, 1 - Math.abs(mpos - i));
      const nod = Math.sin(near * Math.PI / 2) * 10 * u;
      // Until a figure rises, its place is held by a pale print of it.
      if (q < 1) figure(g, s.cx, s.base, fh, F.ink(0.07), span(local, 0, 0.35), 0);
      figure(g, s.cx, s.base, fh, isHot ? F.red(1) : F.ink(1), q, q >= 1 ? nod : 0);
      const ly = s.base - fh - 36 * u;
      if (q > 0.3) rect(g, s.cx - 2 * u, ly - 10 * u, 4 * u, 20 * u, F.ink(0.7));
      const name = (d.badges && d.badges[i]) || ROLES[(i - 3 + ROLES.length * 4) % ROLES.length];
      const lq = span(local, rise(i) + 0.2, rise(i) + 0.55), lx = s.cx - Math.min(s.sw * 0.45, fh * 0.42);
      if (isHot) slab(g, lx + 40 * u, s.base + 24 * u, 46 * u, 10 * u, F.red(1), lq);
      say(g, String(i + 1).padStart(2, "0"), lx, s.base + 42 * u, 24 * u, { w: 700, color: isHot ? F.red(1) : F.ink(0.6), q: lq });
      say(g, name, lx, s.base + 96 * u, 44 * u, { q: lq, maxW: s.sw - 20 * u, min: 42 * u, color: isHot ? F.red(1) : F.ink(1) });
    });
    // The marker on the review line.
    {
      const i0 = clamp(Math.floor(mpos), 0, n - 1), i1 = Math.min(n - 1, i0 + 1), k = clamp(mpos - i0);
      const A = slots[i0], Bs = slots[i1], same = A.r === Bs.r;
      const x = same ? lerp(A.cx, Bs.cx, k) : k < 0.5 ? A.cx : Bs.cx, base = same ? A.base : k < 0.5 ? A.base : Bs.base;
      const y = base - fh - 36 * u, mq = span(local, 0.1, 0.4);
      if (mq > 0) {
        g.globalAlpha *= mq;
        rect(g, x - 1.5 * u, y, 3 * u, 22 * u, F.red(1));
        dot(g, x, y, 16 * u, F.red(1));
        dot(g, x, y, 6 * u, F.paper(1));
        g.globalAlpha /= mq;
      }
    }
    // The group bracket under the names: it draws across the row while the count runs up.
    const last = slots[n - 1], gy = last.base + labelRoom + 34 * u;
    if (gy + 60 * u < a.y + a.h + 40 * u) {
      const gq = span(local, staged - 0.1, staged + 0.6), x0 = a.x, x1 = a.x + a.w;
      if (gq > 0) {
        const e = expo(gq);
        rect(g, x0, gy - 22 * u, 5 * u, 22 * u * e, F.ink(1));
        rect(g, x0, gy, (x1 - x0) * e, 5 * u, F.ink(1));
        if (e > 0.98) rect(g, x1 - 5 * u, gy - 22 * u, 5 * u, 22 * u, F.ink(1));
        const cnt = Math.max(1, Math.round(n * ease(span(local, staged, staged + 0.6))));
        const lbl = `${cnt} ${cnt === 1 ? "person" : "people"}, 1 file`;
        const tw = say(g, lbl, x0, gy + 62 * u, 46 * u, { q: span(local, staged + 0.05, staged + 0.45) });
        // A file key at the end of the line: a sheet with a turned corner, its lines filling.
        const fx = x0 + tw + 34 * u, fy0 = gy + 22 * u, fw = 34 * u, fhh = 46 * u, fq = span(local, staged + 0.3, staged + 0.7);
        if (fq > 0) {
          g.save(); g.beginPath(); g.rect(fx - 4 * u, fy0 - 4 * u, (fw + 8 * u) * expo(fq), fhh + 8 * u); g.clip();
          g.fillStyle = F.red(1); g.beginPath(); g.moveTo(fx, fy0); g.lineTo(fx + fw - 12 * u, fy0); g.lineTo(fx + fw, fy0 + 12 * u); g.lineTo(fx + fw, fy0 + fhh); g.lineTo(fx, fy0 + fhh); g.closePath(); g.fill();
          const lines = 1 + (Math.floor((local - staged) * 3) % 4 + 4) % 4;
          for (let k = 0; k < lines; k++) rect(g, fx + 7 * u, fy0 + 18 * u + k * 6 * u, fw - 14 * u, 3 * u, F.paper(1));
          g.restore();
        }
        // Ticks along the bracket, one under each figure, lighting as the marker passes.
        slots.forEach((s, i) => { if (s.r === rows - 1 && s.cx <= x0 + (x1 - x0) * e) rect(g, s.cx - 2.5 * u, gy - 14 * u, 5 * u, 14 * u, Math.abs(mpos - i) < 0.5 ? F.red(1) : F.ink(1)); });
        // Each person's changes run along the bracket into the one file, again and again.
        if (e > 0.98) slots.forEach((s, i) => {
          const ph = (((local - staged) * 0.45 + i * 0.37) % 1 + 1) % 1, x = lerp(s.cx, fx + fw / 2, inout(ph));
          rect(g, x - 8 * u, gy - 6 * u, 16 * u, 17 * u, i === hiI ? F.red(1) : F.ink(1));
        });
      }
    }
  }

  // ---- process: three numbered columns, pictograms, a flow line with a moving marker ---------------
  function pictogram(g, kind, x, y, s, active, t, q) {
    if (q <= 0) return;
    const u = F.u, k = expo(q);
    g.save(); g.beginPath(); g.rect(x - 10 * u, y - 10 * u, (s + 20 * u) * k, s + 20 * u); g.clip();
    const ink = F.ink(1), red = F.red(1);
    if (kind === 0) {
      g.strokeStyle = ink; g.lineWidth = 7 * u; g.strokeRect(x + s * 0.12, y + 3 * u, s * 0.76, s - 6 * u);
      const L = [0.62, 0.48, 0.62, 0.36, 0.55], cur = active ? Math.floor(t * 2.4) % L.length : 1;
      L.forEach((w, i) => rect(g, x + s * 0.24, y + s * (0.18 + i * 0.14), s * w * 0.85, s * 0.06, i === cur ? red : ink));
    } else if (kind === 1) {
      rect(g, x, y + s * 0.62, s, 7 * u, ink);
      const m = active ? 0.5 - 0.5 * Math.cos(t * 2.2) : 0.5;
      rect(g, x + s * 0.06, y + s * 0.73, s * 0.88 * m, s * 0.1, red);
      g.save(); g.translate(x + s * 0.06 + s * 0.88 * m, y + s * 0.6); g.rotate(-Math.PI / 4);
      rect(g, -s * 0.07, -s * 0.72, s * 0.14, s * 0.62, ink);
      g.fillStyle = ink; g.beginPath(); g.moveTo(-s * 0.07, -s * 0.1); g.lineTo(s * 0.07, -s * 0.1); g.lineTo(0, 0); g.closePath(); g.fill();
      g.restore();
    } else {
      dial(g, x + s / 2, y + s / 2, s * 0.46, t, 1, { disc: active ? red : ink, ring: active ? ink : F.paper(0.9), rings: active ? 0.9 : 0.5, hand: "rgba(0,0,0,0)" });
      const ck = active ? span((t * 0.8) % 1, 0, 0.5) : 1;
      poly(g, [[x + s * 0.27, y + s * 0.52], [x + s * 0.44, y + s * 0.68], [x + s * 0.74, y + s * 0.34]], ck, F.paper(1), 13 * u);
    }
    g.restore();
  }
  // A strip of eight cells under each step: done steps are solid, the active one fills cell by cell.
  function frames(g, x, y, w, h, i, act, ph, q) {
    if (q <= 0 || h < 16 * F.u) return;
    const u = F.u, n = 8, gap = 8 * u, s = Math.min(h, (w - gap * (n - 1)) / n), on = Math.floor(ph * n + 0.0001);
    for (let k = 0; k < n; k++) {
      if (k / n > expo(q)) break;
      const cx = x + k * (s + gap);
      if (i < act || (i === act && k < on)) rect(g, cx, y, s, s, i === act ? F.red(1) : F.ink(1));
      else if (i === act && k === on) { rect(g, cx, y + s * (1 - ((ph * n) % 1)), s, s * ((ph * n) % 1), F.red(1)); g.strokeStyle = F.red(1); g.lineWidth = 2.5 * u; g.strokeRect(cx + u, y + u, s - 2 * u, s - 2 * u); }
      else { g.strokeStyle = F.ink(0.35); g.lineWidth = 2 * u; g.strokeRect(cx + u, y + u, s - 2 * u, s - 2 * u); }
    }
  }
  function process(g, a, p, d, local) {
    const { u, tall, t } = F;
    const steps = (d.steps || []).slice(0, 3);
    while (steps.length < 3) steps.push("");
    // The active step: during the build it follows the build; afterwards it cycles.
    const live = p >= 1;
    const cyc = 3.0, act = live ? Math.floor(((local - 0) / (cyc / 3)) % 3) : Math.min(2, Math.floor(p * 3));
    const ph = live ? ((local / (cyc / 3)) % 1) : (p * 3) % 1;
    if (!tall) {
      const gap = 56 * u, cw = (a.w - gap * 2) / 3, flowY = a.y + a.h - 40 * u;
      steps.forEach((s, i) => {
        const x = a.x + i * (cw + gap), q = span(p, 0.06 + i * 0.16, 0.42 + i * 0.16), on = i === act;
        slab(g, x, a.y, cw, 5 * u, F.ink(1), q);
        if (on && q > 0) rect(g, x, a.y - 4 * u, cw * expo(ph), 13 * u, F.red(1));
        say(g, String(i + 1), x - 10 * u, a.y + 250 * u, 260 * u, { color: on ? F.red(1) : F.ink(1), q });
        pictogram(g, i, x + cw - 170 * u, a.y + 56 * u, 160 * u, on && live, t, span(q, 0.3, 1));
        sayLines(g, s, x, a.y + 360 * u, 56 * u, cw - 10 * u, { q: span(q, 0.3, 1), min: 42 * u });
        say(g, `Step ${i + 1} of 3`, x, a.y + 522 * u, 24 * u, { w: 400, color: F.ink(0.6), q: span(q, 0.5, 1) });
        frames(g, x, a.y + 552 * u, cw, Math.min(56 * u, a.y + a.h - 110 * u - (a.y + 552 * u)), i, act, ph, span(q, 0.4, 1));
      });
      // Flow line with arrowheads and the marker.
      const x0 = a.x, x1 = a.x + a.w;
      slab(g, x0, flowY, x1 - x0, 4 * u, F.ink(1), span(p, 0.1, 0.7));
      for (let i = 0; i < 3; i++) {
        const nx = a.x + i * (cw + gap);
        if (span(p, 0.1, 0.7) * (x1 - x0) > nx - x0) rect(g, nx, flowY - 12 * u, 28 * u, 28 * u, i === act ? F.red(1) : F.ink(1));
        if (i < 2 && span(p, 0.1, 0.7) * (x1 - x0) > nx + cw - x0) tri(g, nx + cw + gap / 2, flowY + 2 * u, 34 * u, 0, F.ink(1));
      }
      const mx = a.x + act * (cw + gap) + (cw + gap) * ease(ph) * (act < 2 ? 1 : 0.9);
      // Work items ride the flow line all the time: small squares, red once they pass the active step.
      const fl = span(p, 0.1, 0.7) * (x1 - x0), sp = 110 * u, o = (t * 120 * u) % sp;
      for (let x = x0 + o; x < x0 + fl - 20 * u; x += sp) {
        const passed = x < a.x + act * (cw + gap) + cw;
        rect(g, x - 9 * u, flowY - 26 * u, 18 * u, 18 * u, passed ? F.red(1) : F.ink(0.8));
      }
      if (p > 0.1) { rect(g, Math.min(mx, x1) - 40 * u, flowY - 3 * u, 80 * u, 10 * u, F.red(1)); }
    } else {
      const rowH = a.h / 3;
      steps.forEach((s, i) => {
        const y = a.y + i * rowH, q = span(p, 0.06 + i * 0.16, 0.42 + i * 0.16), on = i === act;
        slab(g, a.x, y, a.w, 5 * u, F.ink(1), q);
        if (on && q > 0) rect(g, a.x, y - 4 * u, a.w * expo(ph), 13 * u, F.red(1));
        say(g, String(i + 1), a.x - 8 * u, y + 200 * u, 210 * u, { color: on ? F.red(1) : F.ink(1), q });
        pictogram(g, i, a.x + a.w - 150 * u, y + 46 * u, 140 * u, on && live, t, span(q, 0.3, 1));
        sayLines(g, s, a.x + 170 * u, y + 100 * u, 52 * u, a.w - 170 * u - 180 * u, { q: span(q, 0.3, 1), min: 42 * u });
        frames(g, a.x + 170 * u, y + Math.min(300 * u, rowH - 110 * u), a.w - 170 * u, 52 * u, i, act, ph, span(q, 0.4, 1));
        if (i < 2) tri(g, a.x + 60 * u, y + rowH - 40 * u, 34 * u, Math.PI / 2, i === act ? F.red(1) : F.ink(1));
      });
    }
  }

  // ---- compare: two slabs on a measured scale with a bracket and the change between them -----------
  function compare(g, a, p, d, local, hold) {
    const { u, tall, t } = F;
    const L = Math.max(0, Number(d.leftValue) || 0), Rv = Math.max(0, Number(d.rightValue) || 0), max = Math.max(L, Rv, 1e-6);
    const pct = L > 0 ? Math.round(((Rv - L) / L) * 100) : null;
    const rowsD = [{ label: d.left, v: L, col: F.ink(1) }, { label: d.right, v: Rv, col: F.red(1) }];
    const B = built(hold), tb = local - B;
    // The unit for the scale: "Clicks per change" measures clicks; otherwise a word-like suffix, if any.
    const tm = /^\s*([A-Za-z]+)\s+per\b/.exec(String(ctl().compare_title || "")), sf = String(d.suffix || "").trim();
    const unit = tm ? tm[1].toLowerCase() : /^[A-Za-z]{2,}$/.test(sf) ? sf.toLowerCase() : "";
    if (!tall) {
      const rowH = (a.h - 20 * u) / 2, bx = a.x + a.w * 0.34, bmax = a.w * 0.42, brk = bx + bmax + 40 * u;
      const stepV = niceStep(max / 4), topV = Math.max(stepV, Math.ceil(max / stepV) * stepV);
      const ends = [];
      rowsD.forEach((r, i) => {
        const y = a.y + i * rowH, q = span(p, 0.05 + i * 0.18, 0.45 + i * 0.18), k = ease(span(p, 0.15 + i * 0.18, 0.65 + i * 0.18));
        slab(g, a.x, y, bx - a.x - 40 * u, 5 * u, F.ink(1), q);
        say(g, r.label, a.x, y + 70 * u, 46 * u, { q, maxW: bx - a.x - 50 * u, min: 42 * u });
        say(g, num(r.v * k, r.v, d), a.x - 6 * u, y + 250 * u, 160 * u, { color: r.col, q: q > 0 ? 1 : 0, maxW: bx - a.x - 50 * u, min: 96 * u });
        const bh = Math.min(180 * u, rowH * 0.52), by = y + 250 * u - bh, bw = Math.max(8 * u, (bmax * r.v) / topV) * k;
        rect(g, bx, by, bw, bh, r.col);
        stripes(g, bx, by, bw, bh, 30 * u, (i ? -1 : 1) * t * 40 * u, F.paper(0.2), 7 * u);
        // A measured scale under each slab: ticks, figures and the unit.
        const sq = span(p, 0.2 + i * 0.18, 0.7 + i * 0.18);
        slab(g, bx, y + 262 * u, bmax, 2 * u, F.ink(0.6), sq);
        const steps = Math.round(topV / stepV);
        for (let s2 = 0; s2 <= steps * 2; s2++) {
          const f = s2 / (steps * 2); if (f > expo(sq) + 0.001) break;
          const major = s2 % 2 === 0, tx = bx + bmax * f;
          rect(g, tx - u, y + 262 * u, 2 * u, (major ? 22 : 11) * u, F.ink(major ? 0.8 : 0.45));
          const lastM = s2 === steps * 2;
          if (major) say(g, num((s2 / 2) * stepV, stepV, d) + (lastM && unit ? " " + unit : ""), lastM ? tx + 2 * u : tx, y + 318 * u, 30 * u, { w: lastM ? 700 : 500, color: F.ink(lastM ? 0.85 : 0.65), align: s2 === 0 ? "left" : lastM ? "right" : "center" });
        }
        ends.push([bx + bw, by + bh / 2]);
      });
      // Second beat: lead-ins run from each slab to the bracket, the bracket draws down, then the change stamps in.
      const lq = span(tb, 0, 0.45), vq = span(tb, 0.3, 0.75), mq = span(tb, 0.7, 0.85), stq = span(tb, 0.8, 1.05);
      if (lq > 0) {
        g.strokeStyle = F.ink(0.85); g.lineWidth = 2.5 * u; g.setLineDash([10 * u, 8 * u]); g.lineDashOffset = 0;
        g.beginPath();
        for (const [x, y] of ends) { g.moveTo(x, y); g.lineTo(lerp(x, brk, expo(lq)), y); }
        g.stroke(); g.setLineDash([]);
        // Bracket arms at both ends meet the lead-ins.
        for (const [, y] of ends) if (lq >= 1) rect(g, brk - 22 * u, y - 2.5 * u, 24 * u, 5 * u, F.ink(1));
      }
      const y0 = ends[0][1], y1 = ends[1][1], my = (y0 + y1) / 2;
      if (vq > 0) rect(g, brk - 2.5 * u, y0 - 2.5 * u, 5 * u, (y1 - y0 + 5 * u) * expo(vq), F.ink(1));
      if (mq > 0) rect(g, brk, my - 2.5 * u, 30 * u * expo(mq), 5 * u, F.ink(1));
      // A red square travels the short lead-in to the bracket and on to the mark, again and again.
      if (tb > 1.05) {
        const ph = ((tb - 1.05) * 0.7) % 1, [ex, ey] = ends[1];
        const legs = [[ex, ey, brk, ey], [brk, ey, brk, my]], l0 = brk - ex, l1 = ey - my, Lt = l0 + l1;
        let dd = Lt * inout(ph);
        const [x0, yy0, x1, yy1] = dd <= l0 ? legs[0] : legs[1]; if (dd > l0) dd -= l0;
        const len = dd <= Math.hypot(x1 - x0, yy1 - yy0) ? dd : 0, kk = Math.hypot(x1 - x0, yy1 - yy0) ? len / Math.hypot(x1 - x0, yy1 - yy0) : 0;
        rect(g, lerp(x0, x1, kk) - 7 * u, lerp(yy0, yy1, kk) - 7 * u, 14 * u, 14 * u, F.red(1));
      }
      if (pct !== null && stq > 0) {
        const txt = `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%`, lx = brk + 50 * u, sw = a.x + a.w - lx;
        let sz = 132 * u; const mw = measure(g, txt, sz); if (mw > sw) sz = Math.max(96 * u, sz * sw / mw);
        const w = measure(g, txt, sz), sc = 1 + 0.35 * (1 - expo(stq));
        g.save(); g.translate(lx + w / 2, my); g.scale(sc, sc);
        g.globalAlpha *= clamp(stq * 3);
        say(g, txt, -w / 2, sz * 0.36, sz, { color: F.red(1) });
        g.restore();
        // The stamp leaves a rule and a word under the figure.
        const rq = span(tb, 1.05, 1.5);
        slab(g, lx, my + sz * 0.5 + 6 * u, w, 8 * u, F.red(1), rq);
        say(g, unit ? (pct < 0 ? "fewer " : "more ") + unit : pct < 0 ? "lower" : "higher", lx, my + sz * 0.5 + 66 * u, 42 * u, { q: span(tb, 1.15, 1.6), maxW: sw, min: 32 * u });
      }
    } else {
      const rowH = (a.h - 230 * u) / 2;
      const ends = [];
      rowsD.forEach((r, i) => {
        const y = a.y + i * rowH, q = span(p, 0.05 + i * 0.18, 0.45 + i * 0.18), k = ease(span(p, 0.15 + i * 0.18, 0.65 + i * 0.18));
        slab(g, a.x, y, a.w, 5 * u, F.ink(1), q);
        say(g, r.label, a.x, y + 70 * u, 46 * u, { q, maxW: a.w, min: 42 * u });
        say(g, num(r.v * k, r.v, d), a.x - 6 * u, y + 240 * u, 150 * u, { color: r.col, q: q > 0 ? 1 : 0, maxW: a.w, min: 96 * u });
        const bh = Math.min(150 * u, rowH * 0.25), by = y + 280 * u, bmx = a.w * 0.86, stepV = niceStep(max / 4), topV = Math.max(stepV, Math.ceil(max / stepV) * stepV);
        const bw = Math.max(8 * u, (bmx * r.v) / topV) * k;
        rect(g, a.x, by, bw, bh, r.col);
        stripes(g, a.x, by, bw, bh, 28 * u, (i ? -1 : 1) * t * 40 * u, F.paper(0.2), 6 * u);
        const sq = span(p, 0.2 + i * 0.18, 0.7 + i * 0.18), steps = Math.round(topV / stepV), sy = by + bh + 14 * u;
        slab(g, a.x, sy, bmx, 2 * u, F.ink(0.6), sq);
        for (let s2 = 0; s2 <= steps; s2++) {
          const f = s2 / steps; if (f > expo(sq) + 0.001) break;
          const tx = a.x + bmx * f, lastM = s2 === steps;
          rect(g, tx - u, sy, 2 * u, 20 * u, F.ink(0.8));
          say(g, num(s2 * stepV, stepV, d) + (lastM && unit ? " " + unit : ""), lastM ? tx + 2 * u : tx, sy + 62 * u, 32 * u, { w: lastM ? 700 : 500, color: F.ink(lastM ? 0.85 : 0.65), align: s2 === 0 ? "left" : lastM ? "right" : "center" });
        }
        ends.push([a.x + bw, by + bh / 2]);
      });
      if (pct !== null) {
        const y = a.y + a.h - 200 * u, q = span(tb, 0, 0.4), stq = span(tb, 0.4, 0.65);
        slab(g, a.x, y, a.w, 5 * u, F.ink(1), q);
        // A dashed drop line from the short slab's end to the change.
        const [ex, ey] = ends[1];
        if (q > 0) { g.strokeStyle = F.ink(0.85); g.lineWidth = 2.5 * u; g.setLineDash([10 * u, 8 * u]); g.beginPath(); g.moveTo(ex + 14 * u, ey); g.lineTo(ex + 14 * u, lerp(ey, y, expo(q))); g.stroke(); g.setLineDash([]); }
        if (stq > 0) {
          const txt = `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%`;
          let sz = 150 * u; const mw = measure(g, txt, sz); if (mw > a.w * 0.7) sz = Math.max(96 * u, sz * a.w * 0.7 / mw);
          const w = measure(g, txt, sz), sc = 1 + 0.35 * (1 - expo(stq));
          g.save(); g.translate(a.x + w / 2, y + 170 * u - sz * 0.36); g.scale(sc, sc); g.globalAlpha *= clamp(stq * 3);
          say(g, txt, -w / 2, sz * 0.36, sz, { color: F.red(1) }); g.restore();
          const m = 0.5 - 0.5 * Math.cos(t * 2.4);
          tri(g, a.x + w + 60 * u, y + 110 * u + (m - 0.5) * 30 * u, 50 * u * expo(stq), pct < 0 ? Math.PI / 2 : -Math.PI / 2, F.ink(1));
          say(g, unit ? (pct < 0 ? "fewer " : "more ") + unit : pct < 0 ? "lower" : "higher", a.x + w + 110 * u, y + 130 * u, 42 * u, { q: span(tb, 0.7, 1.1), maxW: a.w - w - 110 * u, min: 32 * u });
        }
        if (tb > 1.0) { const ph = ((tb - 1.0) * 0.8) % 1; rect(g, ex + 7 * u, lerp(ey, y, inout(ph)) - 7 * u, 14 * u, 14 * u, F.red(1)); }
      }
    }
  }

  // ---- statements: the title and closing posters around the set headline ---------------------------
  function bands(id) {
    const { u, H } = F, ids = id === "title" ? ["kicker", "title"] : ["closing"];
    const ls = ids.flatMap((k) => headLines(k));
    const top = ls.length ? Math.min(...ls.map((l) => l.y)) : H * 0.4, bottom = ls.length ? Math.max(...ls.map((l) => l.y + l.h)) : H * 0.6;
    const right = ls.length ? Math.max(...ls.map((l) => l.x + l.w)) : F.W * 0.6;
    return { a: [headY() + 40 * u, top - 46 * u], b: [bottom + 56 * u, footY() - 40 * u], right };
  }
  // A timeline set as a typographic object: a ruler, three tracks of slabs and a running playhead.
  function tracks(g, x, y0, w, h, q, t, seed, settled, accentRow) {
    const u = F.u, r = rng(seed), rows = Math.max(3, Math.min(7, Math.floor((h - 70 * u) / (88 * u)))), rh = Math.min(70 * u, (h - 70 * u) / rows - 14 * u), gap = 14 * u, top = y0 + 52 * u;
    if (rh < 12 * u) return;
    const rq = span(q, 0, 0.5);
    for (let k = 0; k <= 48; k++) {
      if (k / 48 > expo(rq)) break;
      const tx = x + (w * k) / 48, major = k % 8 === 0;
      rect(g, tx, top - (major ? 26 : 12) * u - 8 * u, 2 * u, (major ? 26 : 12) * u, F.ink(major ? 0.9 : 0.5));
      if (major) say(g, "0:" + String(k / 8 * 2).padStart(2, "0"), tx + 8 * u, top - 22 * u, 20 * u, { w: 500, color: F.ink(0.7) });
    }
    for (let row = 0; row < rows; row++) {
      let cx = x + (settled ? 0 : r() * 60 * u);
      const yy = top + row * (rh + gap);
      let i = 0;
      while (cx < x + w - 40 * u) {
        const cw = Math.min(x + w - cx, (settled ? 160 + r() * 260 : 90 + r() * 320) * u);
        const k = expo(span(q, 0.1 + row * 0.1 + i * 0.04, 0.45 + row * 0.1 + i * 0.04));
        const hot = row === accentRow && i === 1;
        if (k > 0) rect(g, cx + (1 - k) * 80 * u, yy, Math.max(0, cw - 8 * u) * k, rh, hot ? F.red(1) : row >= rows - (rows > 4 ? 2 : 1) ? F.ink(0.55) : F.ink(1));
        cx += cw + (settled ? 0 : r() * 40 * u);
        i++;
      }
    }
    const ph = span(q, 0.5, 0.8);
    if (ph > 0) {
      const px = x + w * ((t * 0.21 + 0.12) % 1), bot = top + rows * (rh + gap);
      g.globalAlpha *= ph;
      rect(g, px - 2 * u, top - 46 * u, 4 * u, bot - top + 46 * u, F.red(1));
      rect(g, px - 2 * u, top - 84 * u, 132 * u, 38 * u, F.red(1));
      const secs = ((px - x) / w) * 12;
      say(g, `0:${String(Math.floor(secs)).padStart(2, "0")}:${String(Math.floor((secs % 1) * 30)).padStart(2, "0")}`, px + 10 * u, top - 56 * u, 22 * u, { color: F.paper(1), w: 700 });
      g.globalAlpha /= ph;
    }
  }
  function statement(g, id, local, hold) {
    const { u, W, tall, t } = F, G = grid(), B = bands(id);
    const q = clamp(0.2 + local / 1.3);
    const [a0, a1] = B.a, [b0, b1] = B.b;
    // Upper band: a red block of frame lines on the right columns, a black square key and a set of info columns.
    const bh = a1 - a0;
    if (bh > 80 * u) {
      const bx = tall ? G.x(2) : G.x(7), bw = W - G.side - bx;
      const k = expo(span(q, 0, 0.45));
      g.save(); g.beginPath(); g.rect(bx, a0, bw * k, bh); g.clip();
      rect(g, bx, a0, bw, bh, F.red(1));
      // Frame lines rule in one after another through the whole hold, the newest in black.
      const step = 22 * u, nL = Math.max(1, Math.floor(bh / step) - 1), sp = Math.max(0.6, hold - 0.9) / nL;
      for (let j = 0; j < nL; j++) {
        const lk2 = expo(span(local, 0.45 + j * sp, 0.45 + j * sp + 0.4)), newest = local < 0.45 + (j + 1) * sp + 0.2 && local >= 0.45 + j * sp;
        if (lk2 > 0) rect(g, bx + bw * 0.42, a0 + step * (j + 1), bw * 0.58 * lk2, (newest ? 4 : 2) * u, newest ? F.ink(0.9) : F.paper(0.45));
      }
      g.restore();
      const sq = Math.min(bh * 0.62, bw * 0.42), sx = bx - sq * 0.3, sy = a1 - sq;
      slab(g, sx, sy, sq, sq, F.ink(1), span(q, 0.2, 0.6), "bottom");
      if (span(q, 0.4, 0.8) > 0) {
        const dq = span(local, 0.25, 1.1), ck = id === "title" ? 0 : span(local, Math.max(0.5, hold - 1.1), Math.max(0.9, hold - 0.5));
        dial(g, sx + sq / 2, sy + sq / 2, sq * 0.38, t, dq, { rings: 1 - ck * 0.75 });
        if (ck > 0) poly(g, [[sx + sq * 0.3, sy + sq * 0.52], [sx + sq * 0.45, sy + sq * 0.66], [sx + sq * 0.72, sy + sq * 0.36]], ck, F.paper(1), sq * 0.08);
      }
      // A slowly turning rule pinned to the block's corner: the one oblique line on the sheet.
      const ang = Math.PI + 0.42 + 0.08 * Math.sin(t * 0.6);
      g.save(); g.translate(bx + bw, a0 + bh); g.rotate(ang);
      rect(g, 0, -4 * u, Math.min(bw * 0.62, bh * 1.1) * expo(span(q, 0.3, 0.8)), 8 * u, F.ink(1));
      g.restore();
      if (!tall && bx - G.side > 400 * u) {
        const info = id === "title" ? [["DreamCut", "Local video editor"], ["Explainer", "Series 01"], ["Format", "16 : 9  ·  30 fps"]] : [["DreamCut", "Local video editor"], ["Status", "Ready for review"], ["Next", "Open the card"]];
        info.forEach(([h1, h2], i) => {
          const ix = G.x(i * 2), iq = span(q, 0.2 + i * 0.1, 0.6 + i * 0.1);
          if (ix + 200 * u > sx - 20 * u) return;
          slab(g, ix, a0, G.cw * 2 - 10 * u, 2 * u, F.ink(0.9), iq);
          if (id !== "title") slab(g, ix, a0 - 3 * u, G.cw * 2 - 10 * u, 8 * u, F.red(1), span(local, 0.6 + i * Math.max(0.2, (hold - 1.2) / 3), 0.95 + i * Math.max(0.2, (hold - 1.2) / 3)));
          say(g, h1, ix, a0 + 34 * u, 22 * u, { w: 700, q: iq });
          say(g, h2, ix, a0 + 62 * u, 22 * u, { w: 400, q: iq, color: F.ink(0.75) });
        });
        const nq = span(q, 0.3, 0.7);
        say(g, id === "title" ? "01" : String(shownList().length).padStart(2, "0"), G.side - 8 * u, a1 - 10 * u, Math.min(220 * u, bh * 0.7), { color: id === "title" ? F.red(1) : F.ink(1), q: nq });
      }
    }
    // Under the closing line, a red rule draws in to settle the sheet.
    if (id !== "title" && b1 - b0 > 120 * u) slab(g, G.side, b0 - 34 * u, Math.min(B.right, W - G.side) - G.side, 8 * u, F.red(1), span(local, hold * 0.45, hold - 0.15));
    // Lower band: the timeline.
    if (b1 - b0 > 120 * u) tracks(g, G.side, b0, W - G.side * 2, b1 - b0, span(q, 0.15, 1), t, id === "title" ? 7 : 19, id !== "title", id === "title" ? 0 : 1);
  }

  const DRAW = { chart, object, people, process, compare };
  const wrap = (id) => (ctx, S, box, p, d, inf) => {
    if (!F) return;
    const leaving = !!inf && inf.exit !== undefined;
    const local = inf ? inf.local : 0, hold = inf ? inf.hold : 3;
    // The look's own build clock: drawing starts on the first frame the columns open.
    const pp = leaving ? 1 : clamp((local - 0.08) / Math.max(0.6, Math.min(1.7, hold * 0.5)));
    ctx.save();
    if (clipCols(ctx, leaving ? "old" : "new")) DRAW[id](ctx, areaOf(id), pp, d || {}, local, hold);
    ctx.restore();
    if (!leaving || F.coverInLeave) cover(ctx);
  };

  return {
    bg: "#f5f5f2", panel: "#ffffff", ink: "#111111", muted: "#6b6b6b", accent: "#e2231a", onAccent: "#ffffff",
    rule: "rgba(17,17,17,0.9)", track: "rgba(17,17,17,0.07)",
    display: FONT, displayWeight: 700, displayCase: "none", displayTracking: "-0.035em",
    body: FONT, bodyWeight: 400,
    figures: FONT, radius: 0, motion: "wipe", kit: { line: 4, fill: "solid", panel: "fill" },
    palettes: {
      light: { bg: "#ffffff", backdrop: () => "#ffffff" },
      dark: { bg: "#111111", panel: "#1c1c1c", ink: "#f5f5f2", muted: "#9a9a9a", rule: "rgba(245,245,242,0.9)", track: "rgba(245,245,242,0.08)", backdrop: () => "#111111" },
      mono: { accent: "#111111", onAccent: "#f5f5f2" },
    },
    backdrop: () => "#f5f5f2",
    // Only the illustrated explainer has the art canvas; there the kicker gets a red key square.
    css: (accent) => `#art ~ #title-scene .kicker::before { content: ""; display: inline-block; width: 0.62em; height: 0.62em; margin: 0 0.6em 0.06em 0; background: ${accent}; vertical-align: baseline; }
      #art ~ .scene .display { letter-spacing: -0.04em; line-height: 0.98; }`,
    keepArt: true,
    overlap: true,
    stage(ctx, S, info) {
      const L = S.look, c = ctl();
      const key = `${S.W}x${S.H}`;
      if (!tiles || tileKey !== key) { tiles = makeTiles(); tileKey = key; }
      const titleHold = Number(c.title_hold ?? DEF[0]);
      F = {
        S, W: S.W, H: S.H, u: S.u, tall: S.tall, info, t: info.t, change: Math.max(0.1, info.change || 0.45),
        ink: (a) => hexA(L.ink, a), red: (a) => hexA(S.accent, a), paper: (a) => hexA(L.bg, a), BG: L.bg,
        dark: parseInt(String(L.bg).slice(1, 3), 16) < 90,
        tex: L.texture ?? 1, backdrop: c.backdrop !== false,
        bIn: info.index > 0 ? info.t - info.local : null,
        bOut: info.next ? info.t - info.local + info.hold : null,
        covered: false, coverInLeave: false,
      };
      const g = ctx;
      if (F.backdrop) paper(g);
      world(g);
      const stmt = (id) => id === "title" || id === "closing";
      const prevStmt = info.index === 1 && titleHold > 0 && info.scene !== "title";
      // The title has no drawer, so its poster gives way here when the next scene begins.
      if (prevStmt && info.local < F.change * 0.75 + 0.01) { g.save(); if (clipCols(g, "old")) statement(g, "title", titleHold + info.local, titleHold); g.restore(); }
      if (stmt(info.scene)) { g.save(); if (clipCols(g, "new")) statement(g, info.scene, info.local, info.hold); g.restore(); }
      const hasDrawer = info.scene && !stmt(info.scene);
      const leaveComing = info.index > 0 && !prevStmt && info.local < F.change;
      F.coverInLeave = !hasDrawer && leaveComing;
      if (!hasDrawer && !leaveComing) cover(g);
    },
    scenes: { chart: wrap("chart"), object: wrap("object"), people: wrap("people"), process: wrap("process"), compare: wrap("compare") },
  };
});
