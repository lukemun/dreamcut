// Linocut: a single relief print, pulled full-bleed on rice paper. A night landscape is gouged out
// of black ink: wind lines carved in parallel rows (wider near the edges, finer in the middle, so the
// carving itself makes the tone), rolling hills with contour cuts and grass flicks over a red
// reduction band. Every scene is carved into that block: tapered gouge strokes with chiselled edges,
// a red layer that lands slightly out of register and settles, salty ink and paper fibre. Between
// scenes an inked brayer rolls across the block and leaves the next print behind it. Every motif is
// original. Frames are pure functions of time.
window.DreamcutMotion.register("linocut", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const inout = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const s = 1.5; return 1 + (s + 1) * Math.pow(v - 1, 3) + s * Math.pow(v - 1, 2); };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const fract = (v) => v - Math.floor(v);
  const hash = (a, b = 0) => {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const DISP = "Rockwell, 'Rockwell Extra Bold', 'Clarendon', 'Roboto Slab', Georgia, serif";
  const LAB = "'DIN Condensed', 'Avenir Next Condensed', 'Roboto Condensed', 'Arial Narrow', Impact, sans-serif";
  const HEADS = { title: ["kicker", "title"], chart: ["chart-title"], object: ["object-title"], people: ["people-title"], process: ["process-title"], compare: ["compare-title"], closing: ["closing"] };

  // The frame's colours: the ink block, the carved paper, the red reduction layer.
  let C = { field: "#1c1815", cut: "#efe4cc", red: "#d0472c", onRed: "#f4ead3", paper: "#ebdfc5", roll: "#2d2621" };

  // ---- polylines ---------------------------------------------------------------------------------
  function seg(x1, y1, x2, y2, step) {
    const n = Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / step) + 1), out = [];
    for (let i = 0; i < n; i++) { const k = i / (n - 1); out.push([lerp(x1, x2, k), lerp(y1, y2, k)]); }
    return out;
  }
  function quad(x1, y1, cx, cy, x2, y2, step) {
    const n = Math.max(3, Math.ceil((Math.hypot(cx - x1, cy - y1) + Math.hypot(x2 - cx, y2 - cy)) / step) + 1), out = [];
    for (let i = 0; i < n; i++) { const k = i / (n - 1), a = (1 - k) * (1 - k), b = 2 * k * (1 - k), c = k * k; out.push([a * x1 + b * cx + c * x2, a * y1 + b * cy + c * y2]); }
    return out;
  }
  function cubic(x1, y1, ax, ay, bx, by, x2, y2, step) {
    const n = Math.max(4, Math.ceil((Math.hypot(ax - x1, ay - y1) + Math.hypot(bx - ax, by - ay) + Math.hypot(x2 - bx, y2 - by)) / step) + 1), out = [];
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1), m = 1 - k;
      out.push([m * m * m * x1 + 3 * m * m * k * ax + 3 * m * k * k * bx + k * k * k * x2, m * m * m * y1 + 3 * m * m * k * ay + 3 * m * k * k * by + k * k * k * y2]);
    }
    return out;
  }
  function arc(cx, cy, rx, ry, a0, a1, step) {
    const n = Math.max(4, Math.ceil((Math.abs(a1 - a0) * Math.max(rx, ry)) / step) + 1), out = [];
    for (let i = 0; i < n; i++) { const a = lerp(a0, a1, i / (n - 1)); out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
    return out;
  }
  const ring = (cx, cy, r, step, a0 = -Math.PI / 2) => arc(cx, cy, r, r, a0, a0 + TAU, step);
  function chain(...lists) {
    const out = [];
    for (const l of lists) for (let i = 0; i < l.length; i++) if (!(out.length && i === 0 && Math.hypot(l[0][0] - out[out.length - 1][0], l[0][1] - out[out.length - 1][1]) < 0.5)) out.push(l[i]);
    return out;
  }
  function rrPts(x, y, w, h, r, step) {
    r = Math.max(0.5, Math.min(r, w / 2, h / 2));
    return chain(seg(x + r, y, x + w - r, y, step), arc(x + w - r, y + r, r, r, -Math.PI / 2, 0, step), seg(x + w, y + r, x + w, y + h - r, step),
      arc(x + w - r, y + h - r, r, r, 0, Math.PI / 2, step), seg(x + w - r, y + h, x + r, y + h, step), arc(x + r, y + h - r, r, r, Math.PI / 2, Math.PI, step),
      seg(x, y + h - r, x, y + r, step), arc(x + r, y + r, r, r, Math.PI, Math.PI * 1.5, step));
  }
  function along(pts, f) {
    let L = 0;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(L); }
    const d = L * clamp(f);
    for (let i = 1; i < pts.length; i++) if (cum[i] >= d) {
      const k = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
      return [lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k), Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0])];
    }
    const a = pts[pts.length - 1];
    return [a[0], a[1], 0];
  }
  // Split a polyline into dashes of `dash` length with `gap` between, keeping the first q of its length.
  function dashes(pts, dash, gap, q = 1) {
    const out = [];
    let cur = [pts[0]], d = 0, on = true, left = dash, total = 0;
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const end = L * q;
    for (let i = 1; i < pts.length && total < end; i++) {
      let [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      let segL = Math.hypot(x1 - x0, y1 - y0);
      while (segL > 0 && total < end) {
        const step = Math.min(segL, left, end - total), k = step / segL;
        const nx = lerp(x0, x1, k), ny = lerp(y0, y1, k);
        if (on) cur.push([nx, ny]);
        x0 = nx; y0 = ny; segL -= step; left -= step; total += step; d += step;
        if (left <= 1e-6) {
          if (on && cur.length > 1) out.push(cur);
          on = !on; left = on ? dash : gap; cur = [[x0, y0]];
        }
      }
    }
    if (on && cur.length > 1) out.push(cur);
    return out;
  }

  // ---- the gouge ---------------------------------------------------------------------------------
  // One carved stroke: it enters thin, swells to the gouge's width, and lifts out with a longer taper.
  // Its edges are chiselled (seeded, fixed to the stroke) and q carves only its first part.
  function carve(g, pts, w, o = {}) {
    const q = o.q ?? 1, n = pts.length;
    if (q <= 0 || n < 2 || w <= 0.25) return;
    const cum = new Array(n);
    cum[0] = 0;
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const L = cum[n - 1];
    if (L <= 0.5) return;
    const end = L * Math.min(1, q);
    const ts = (o.t0 ?? 1.4) * w, te = (o.t1 ?? 2.4) * w, jit = o.jit ?? 0.24, seed = o.seed ?? 1, off = o.off ?? 0;
    const lx = [], ly = [], rx = [], ry = [];
    for (let i = 0; i < n; i++) {
      let d = cum[i], x = pts[i][0], y = pts[i][1];
      if (d > end) {
        const k = (end - cum[i - 1]) / Math.max(1e-6, d - cum[i - 1]);
        x = lerp(pts[i - 1][0], x, k); y = lerp(pts[i - 1][1], y, k); d = end;
      }
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      const s = ts > 0 ? Math.min(1, d / ts) : 1, e = te > 0 ? Math.min(1, (L - d) / te) : 1;
      const head = q < 1 ? Math.min(1, (end - d) / (w * 1.1) + 0.3) : 1;
      const j = 1 + (hash(seed, Math.round((d + off) / 5)) - 0.5) * 2 * jit;
      const hw = Math.max(0, w * Math.sqrt(s) * Math.pow(e, 0.65) * head * j) / 2;
      lx.push(x - ty * hw); ly.push(y + tx * hw); rx.push(x + ty * hw); ry.push(y - tx * hw);
      if (d >= end) break;
    }
    g.beginPath();
    g.moveTo(lx[0], ly[0]);
    for (let i = 1; i < lx.length; i++) g.lineTo(lx[i], ly[i]);
    for (let i = rx.length - 1; i >= 0; i--) g.lineTo(rx[i], ry[i]);
    g.closePath();
    g.fillStyle = o.color || C.cut;
    g.fill();
  }
  const ringCarve = (g, F, x, y, r, w, o = {}) => carve(g, ring(x, y, r, F.st, o.a0), w, { t0: 0, t1: 0, ...o });

  // Clear the sky carving from round a shape, so the block reads as cut around it.
  function knock(g, build, halo) {
    g.save();
    build(g);
    g.fillStyle = C.field;
    if (halo) { g.lineWidth = halo; g.strokeStyle = C.field; g.lineJoin = "round"; g.stroke(); }
    g.fill();
    g.restore();
  }
  // The red block prints first and lands a little out of register, settling as it arrives.
  function reg(g, F, k, fn) {
    const off = 1 - ease(k);
    g.save();
    g.translate((2.6 + off * 18) * F.u, (-1.8 - off * 12) * F.u);
    g.globalAlpha *= clamp(k * 3);
    fn();
    g.restore();
  }
  const circle = (x, y, r) => (g) => { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); };

  // ---- lettering -----------------------------------------------------------------------------------
  function font(g, size, kind) { g.font = `700 ${size}px ${kind === "num" ? DISP : LAB}`; }
  function measure(g, s, size, kind = "lab", track = 0.05) {
    font(g, size, kind);
    g.letterSpacing = track * size + "px";
    const w = g.measureText(String(s ?? "").toUpperCase()).width;
    g.letterSpacing = "0px";
    return w;
  }
  // Cut letters: condensed capitals (or slab figures) revealed left to right as the carver works.
  function say(g, s, x, y, size, o = {}) {
    s = String(s ?? "");
    if (o.upper !== false) s = s.toUpperCase();
    const q = o.q ?? 1;
    if (!s || q <= 0) return 0;
    const kind = o.kind || "lab", track = o.track ?? (kind === "num" ? 0.01 : 0.05);
    let sz = size;
    font(g, sz, kind);
    g.letterSpacing = track * sz + "px";
    let w = g.measureText(s).width;
    if (o.maxW && w > o.maxW) {
      sz = Math.max(o.min ?? sz * 0.8, (sz * o.maxW) / w);
      font(g, sz, kind);
      g.letterSpacing = track * sz + "px";
      w = g.measureText(s).width;
    }
    const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    g.save();
    if (q < 1) { g.beginPath(); g.rect(x0 - 12, y - sz * 1.6, (w + 24) * q, sz * 3.2); g.clip(); }
    g.textAlign = "left";
    g.textBaseline = o.base || "alphabetic";
    if (o.halo !== false) { g.lineWidth = sz * 0.3; g.lineJoin = "round"; g.strokeStyle = C.field; g.strokeText(s, x0, y); }
    g.fillStyle = o.color || C.cut;
    g.fillText(s, x0, y);
    g.restore();
    g.letterSpacing = "0px";
    return w;
  }
  const tally = (target, k, d) => {
    const dec = Math.abs((Number(target) || 0) % 1) > 0.001 ? 1 : 0;
    return window.DreamcutMotion.formatNumber((Number(target) || 0) * k, dec, (d && d.prefix) || "", (d && d.suffix) || "");
  };

  // ---- shared carved motifs ------------------------------------------------------------------------
  function wavy(F, x1, x2, y, amp, seed) {
    const out = [];
    for (let x = x1; x <= x2 + 0.1; x += F.st) out.push([x, y + Math.sin(x * 0.019 / F.u + seed * 1.7) * amp + Math.sin(x * 0.047 / F.u + seed) * amp * 0.35]);
    return out;
  }
  function star(g, F, x, y, s, seed) {
    if (s < 2) return;
    carve(g, seg(x, y - s, x, y + s, F.st * 0.6), s * 0.34, { seed, t0: 1.2, t1: 1.2, jit: 0.1 });
    carve(g, seg(x - s * 0.8, y, x + s * 0.8, y, F.st * 0.6), s * 0.3, { seed: seed + 1, t0: 1.2, t1: 1.2, jit: 0.1 });
  }
  function bird(g, F, x, y, s, flap, seed) {
    const lift = s * (0.15 + 0.55 * (flap * 0.5 + 0.5));
    carve(g, quad(x, y, x - s * 0.45, y - lift * 1.1, x - s, y - lift * 0.4, F.st * 0.6), s * 0.2, { seed, t0: 0.4, t1: 2.2 });
    carve(g, quad(x, y, x + s * 0.45, y - lift * 1.1, x + s, y - lift * 0.4, F.st * 0.6), s * 0.2, { seed: seed + 3, t0: 0.4, t1: 2.2 });
  }
  function inZones(x, y, zones, pad = 0) {
    for (const z of zones) if (x > z.x - pad && x < z.x + z.w + pad && y > z.y - pad && y < z.y + z.h + pad) return true;
    return false;
  }
  function birds(g, F, lt, y0, y1, n, seed, zones) {
    const { W, u } = F, lane = W + 320 * u;
    for (let i = 0; i < n; i++) {
      const speed = (46 + 34 * hash(seed, i)) * u;
      const x = W + 160 * u - fract((lt * speed + hash(seed, i + 9) * lane) / lane) * lane;
      const y = lerp(y0, y1, hash(seed, i + 3)) + Math.sin(lt * 1.4 + i * 2) * 10 * u;
      if (inZones(x, y, zones, 40 * u)) continue;
      // Each bird keeps its number when another is hidden behind the words.
      if (F.S.piece) F.S.piece("bird-" + (i + 1));
      bird(g, F, x, y, (24 + 12 * hash(seed, i + 5)) * u, Math.sin(lt * 7.5 + i * 2.3), seed * 7 + i);
    }
  }

  // ---- the block: sky carving, hills, border, paper ------------------------------------------------
  let SKY = null, skyKey = "";
  function skyRows(F) {
    const key = `${F.W}x${F.H}`;
    if (SKY && skyKey === key) return SKY;
    const { W, H, u, tall } = F, rows = [], gap = (tall ? 22 : 20) * u;
    for (let y = 34 * u, r = 0; y < H - 40 * u; y += gap, r++) {
      const tone = clamp(Math.pow(Math.abs(y / H - 0.48) / 0.5, 1.5));
      const period = W + 700 * u, list = [], rr = rng(1000 + r * 7);
      let x = rr() * 120 * u;
      while (x < period - 90 * u) {
        const len = (50 + rr() * 250) * u * (0.7 + tone * 0.5), gx = (26 + rr() * 120 * (1.25 - tone)) * u;
        if (x + len > period - 30 * u) break;
        list.push([x, len, rr()]);
        x += len + gx;
      }
      rows.push({ y, r, tone, period, list, speed: (7 + rr() * 10) * u, w: (1.5 + 5.6 * tone) * u });
    }
    skyKey = key;
    return (SKY = rows);
  }
  function cutOut(a, b, y, pad, zones) {
    let parts = [[a, b]];
    for (const z of zones) {
      if (y + pad < z.y || y - pad > z.y + z.h) continue;
      const next = [];
      for (const [p0, p1] of parts) {
        if (p1 <= z.x || p0 >= z.x + z.w) { next.push([p0, p1]); continue; }
        if (p0 < z.x) next.push([p0, z.x]);
        if (p1 > z.x + z.w) next.push([z.x + z.w, p1]);
      }
      parts = next;
    }
    return parts;
  }
  // Wind lines carved in drifting rows; stars twinkle in the open sky.
  function sky(g, F, zones, t, avoid) {
    const { W, H, u } = F, rows = skyRows(F), wave = (x, r) => Math.sin((x / W) * TAU * 1.1 + r * 0.55) * 7 * u;
    for (const row of rows) {
      const shift = t * row.speed;
      row.list.forEach(([x0, len, h], idx) => {
        const xa = (((x0 - shift) % row.period) + row.period) % row.period - 350 * u, xb = xa + len;
        if (xb < -20 || xa > W + 20) return;
        for (const [a, b] of cutOut(xa, xb, row.y, row.w + 10 * u, zones)) {
          if (b - a < 20 * u) continue;
          const pts = [];
          for (let x = a; x <= b + 0.1; x += F.st * 1.4) pts.push([x, row.y + wave(x, row.r)]);
          if (pts.length < 2) pts.push([b, row.y + wave(b, row.r)]);
          carve(g, pts, row.w * (0.72 + h * 0.56), { seed: row.r * 131 + idx, off: a - xa, t0: 2.2, t1: 3 });
        }
      });
    }
    const r = rng(404);
    for (let i = 0; i < 16; i++) {
      const x = r() * W, y = (60 + r() * 0.5 * H) * 1, ph = r() * TAU, sz = (9 + r() * 10) * u;
      if (inZones(x, y, zones, 30 * u) || (avoid && x > avoid.x - 30 * u && x < avoid.x + avoid.w + 30 * u && y > avoid.y - 30 * u)) continue;
      const tw = 0.55 + 0.45 * Math.sin(t * (1.6 + r() * 1.4) + ph);
      knock(g, circle(x, y, sz * 1.5), 0);
      star(g, F, x, y, sz * tw, 900 + i);
    }
  }
  // Two ranges of hills: a red reduction band behind, a black range in front with contour cuts and grass.
  function hills(g, F, t) {
    const { W, H, u, tall } = F, step = 9 * u;
    const bs = t * 14 * u, fs = t * 30 * u;
    const by = H - (tall ? 160 : 110) * u, fy = H - (tall ? 96 : 62) * u;
    const backY = (x) => by + Math.sin(((x + bs) / W) * TAU * 1.15 + 0.6) * 22 * u + Math.sin(((x + bs) * 0.0057) / u + 2) * 9 * u;
    const frontY = (x) => fy + Math.sin(((x + fs) / W) * TAU * 1.7 + 2.1) * 16 * u + Math.sin(((x + fs) * 0.011) / u) * 6 * u;
    const line = (fn, dy) => { const out = []; for (let x = -20 * u; x <= W + 20 * u; x += step) out.push([x, fn(x) + dy]); return out; };
    // Red band, printed first.
    g.save();
    g.translate(2.6 * u, -1.8 * u);
    g.beginPath(); g.moveTo(-30 * u, H + 10);
    for (let x = -30 * u; x <= W + 30 * u; x += step) g.lineTo(x, backY(x));
    g.lineTo(W + 30 * u, H + 10); g.closePath();
    g.fillStyle = C.red; g.fill();
    g.restore();
    for (let k = 1; k <= 3; k++) carve(g, line(backY, (6 + k * 11) * u), (5 - k) * u * 0.9 + 1.2 * u, { seed: 60 + k, t0: 0, t1: 0, jit: 0.3 });
    carve(g, line(backY, -1 * u), 3.2 * u, { seed: 59, t0: 0, t1: 0, color: C.field });
    // Front range, black, with contour cuts following the crest.
    g.beginPath(); g.moveTo(-30 * u, H + 10);
    for (let x = -30 * u; x <= W + 30 * u; x += step) g.lineTo(x, frontY(x));
    g.lineTo(W + 30 * u, H + 10); g.closePath();
    g.fillStyle = C.field; g.fill();
    carve(g, line(frontY, 2 * u), 5.5 * u, { seed: 70, t0: 0, t1: 0 });
    for (let k = 1; k <= 6; k++) carve(g, line(frontY, (6 + k * 12) * u), Math.max(1.2, 4.2 - k * 0.5) * u, { seed: 70 + k, t0: 0, t1: 0, jit: 0.35 });
    // Grass flicks fixed to the moving hills.
    const pitch = 34 * u;
    for (let wx = Math.floor(fs / pitch) * pitch - pitch; wx < fs + W + pitch; wx += pitch) {
      const x = wx - fs, k = Math.round(wx / pitch), y = frontY(x) + 2 * u;
      if (hash(k, 3) < 0.35) continue;
      const hgt = (14 + hash(k, 5) * 18) * u, sw = Math.sin(t * 2.1 + k * 0.7) * 5 * u;
      for (let b = -1; b <= 1; b++) carve(g, quad(x + b * 5 * u, y, x + b * 7 * u, y - hgt * 0.6, x + b * 12 * u + sw, y - hgt * (b ? 0.8 : 1), F.st * 0.5), 3.4 * u, { seed: k * 5 + b, t0: 0.2, t1: 2.6 });
    }
  }

  let TEX = null, texKey = "";
  function textures(F) {
    const key = `${F.W}x${F.H}:${C.paper}:${C.field}`;
    if (TEX && texKey === key) return TEX;
    const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
    const salt = mk(420, 420), sg = salt.getContext("2d"), r = rng(29);
    sg.fillStyle = C.paper;
    for (let i = 0; i < 2600; i++) {
      const x = r() * 420, y = r() * 420, s = Math.pow(r(), 3) * 2.1 + 0.35;
      sg.globalAlpha = 0.25 + r() * 0.6;
      sg.beginPath(); sg.ellipse(x, y, s, s * (0.45 + r() * 0.7), r() * TAU, 0, TAU); sg.fill();
    }
    for (let i = 0; i < 46; i++) {
      const cx = r() * 420, cy = r() * 420, rad = 4 + r() * 12;
      for (let k = 0; k < 34; k++) {
        const a = r() * TAU, d = Math.sqrt(r()) * rad, s = 0.3 + r() * 1.1;
        sg.globalAlpha = 0.3 + r() * 0.5;
        sg.beginPath(); sg.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, s, 0, TAU); sg.fill();
      }
    }
    const fleck = mk(420, 420), fg = fleck.getContext("2d"), r3 = rng(53);
    fg.fillStyle = C.field;
    for (let i = 0; i < 260; i++) { fg.globalAlpha = 0.15 + r3() * 0.4; fg.beginPath(); fg.arc(r3() * 420, r3() * 420, 0.4 + Math.pow(r3(), 4) * 2, 0, TAU); fg.fill(); }
    fg.strokeStyle = C.field; fg.lineWidth = 0.6;
    for (let i = 0; i < 90; i++) { const x = r3() * 420, y = r3() * 420, a = r3() * TAU, l = 6 + r3() * 18; fg.globalAlpha = 0.06 + r3() * 0.08; fg.beginPath(); fg.moveTo(x, y); fg.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); fg.stroke(); }
    const mot = mk(Math.ceil(F.W / 8), Math.ceil(F.H / 8)), mg = mot.getContext("2d"), r2 = rng(77);
    mg.filter = "blur(5px)";
    mg.fillStyle = C.paper;
    for (let i = 0; i < 80; i++) { mg.globalAlpha = 0.2 + r2() * 0.5; mg.beginPath(); mg.ellipse(r2() * mot.width, r2() * mot.height, 3 + r2() * 22, 2 + r2() * 12, r2() * TAU, 0, TAU); mg.fill(); }
    // Paper margin with a ragged block edge.
    const { W, H, u } = F, m = 15 * u, edge = new Path2D();
    edge.rect(-10, -10, W + 20, H + 20);
    const pts = [], jag = (k) => (hash(k, 11) - 0.5) * 5 * u + (hash(k >> 2, 13) - 0.5) * 5 * u, st = 12 * u;
    let k = 0;
    for (let x = m; x < W - m; x += st) pts.push([x, m + jag(k++)]);
    for (let y = m; y < H - m; y += st) pts.push([W - m + jag(k++), y]);
    for (let x = W - m; x > m; x -= st) pts.push([x, H - m + jag(k++)]);
    for (let y = H - m; y > m; y -= st) pts.push([m + jag(k++), y]);
    edge.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts) edge.lineTo(x, y);
    edge.closePath();
    texKey = key;
    return (TEX = { salt, fleck, mot, edge, pat: new WeakMap() });
  }
  function pattern(g, X, name) {
    let byCtx = X.pat.get(g);
    if (!byCtx) { byCtx = {}; X.pat.set(g, byCtx); }
    return byCtx[name] || (byCtx[name] = g.createPattern(X[name], "repeat"));
  }
  // The carved border, the paper margin round the block, then salty ink, mottling and fibre.
  function finish(g, F) {
    const { W, H, u } = F, tex = F.S.look.texture, X = textures(F);
    carve(g, rrPts(34 * u, 34 * u, W - 68 * u, H - 68 * u, 6 * u, F.st * 2), 3.4 * u, { t0: 0, t1: 0, seed: 17, jit: 0.3 });
    g.save();
    g.fillStyle = C.paper;
    g.fill(X.edge, "evenodd");
    g.restore();
    if (tex <= 0) return;
    g.save();
    g.globalAlpha = 0.09 * tex;
    g.drawImage(X.mot, 0, 0, W, H);
    g.globalAlpha = 0.9 * tex;
    g.fillStyle = pattern(g, X, "salt"); g.fillRect(0, 0, W, H);
    g.globalAlpha = 0.6 * tex;
    g.fillStyle = pattern(g, X, "fleck"); g.fillRect(0, 0, W, H);
    g.restore();
  }

  // ---- the brayer: an inked roller crosses the block and leaves the next print behind ---------------
  function roller(g, F, rx, m, dur) {
    const { H, u } = F, RW = 124 * u, x0 = rx - RW / 2;
    // Shadow ahead of the roller on the paper.
    const sh = g.createLinearGradient(x0 + RW, 0, x0 + RW + 70 * u, 0);
    sh.addColorStop(0, "rgba(0,0,0,0.45)"); sh.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = sh; g.fillRect(x0 + RW, 0, 70 * u, H);
    // Lino chips spraying off behind it.
    for (let j = 0; j < 22; j++) {
      const f = (j + 0.5) / 22, age = (m - f) * dur;
      if (age <= 0 || age > 0.7) continue;
      const cx = f * F.W - age * (160 + 120 * hash(j, 2)) * u, cy = hash(j, 4) * H + age * age * 520 * u - age * 90 * u, a = age * 9 + j;
      carve(g, arc(cx, cy, 8 * u, 8 * u, a, a + 2.6, F.st * 0.4), 3.6 * u, { seed: 2000 + j, t0: 0.4, t1: 1.2 });
    }
    g.fillStyle = C.roll; g.fillRect(x0, -20, RW, H + 40);
    // Ridges turn as it rolls; the highlight stays put.
    const rot = rx / (RW / 2);
    for (let j = 0; j < 12; j++) {
      const th = (j * TAU) / 12 + rot, c = Math.cos(th);
      if (c <= 0.08) continue;
      const x = rx + Math.sin(th) * RW * 0.44;
      carve(g, seg(x, -10, x, H + 10, F.st * 4), 4.6 * u * c, { t0: 0, t1: 0, seed: 3000 + j, jit: 0.35, color: C.field });
    }
    carve(g, seg(rx - RW * 0.24, -10, rx - RW * 0.24, H + 10, F.st * 4), 10 * u, { t0: 0, t1: 0, seed: 3100, jit: 0.3 });
    carve(g, seg(rx - RW * 0.08, -10, rx - RW * 0.08, H + 10, F.st * 4), 3 * u, { t0: 0, t1: 0, seed: 3101, jit: 0.4 });
    carve(g, seg(x0 + 2 * u, -10, x0 + 2 * u, H + 10, F.st * 4), 4 * u, { t0: 0, t1: 0, seed: 3102, color: C.cut });
    carve(g, seg(x0 + RW - 2 * u, -10, x0 + RW - 2 * u, H + 10, F.st * 4), 4 * u, { t0: 0, t1: 0, seed: 3103, color: C.cut });
  }

  // ---- chart: a row of carved stalks; the highlighted one in red, flowering ---------------------------
  function flower(g, F, x, y, r, lt) {
    if (r <= 0.5) return;
    const { u } = F, rot = lt * 0.45;
    knock(g, circle(x, y, r * 1.25), 10 * u);
    reg(g, F, clamp(r / 30), () => {
      for (let k = 0; k < 7; k++) {
        const a = rot + (k * TAU) / 7;
        g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.5, r * 0.25, a, 0, TAU);
        g.fillStyle = C.red; g.fill();
      }
    });
    for (let k = 0; k < 7; k++) {
      const a = rot + (k * TAU) / 7;
      carve(g, seg(x + Math.cos(a) * r * 0.36, y + Math.sin(a) * r * 0.36, x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95, F.st * 0.5), 3.2 * u, { seed: 500 + k, t0: 0.5, t1: 2 });
    }
    knock(g, circle(x, y, r * 0.3), 0);
    ringCarve(g, F, x, y, r * 0.3, 3 * u, { seed: 510 });
  }
  function bud(g, F, x, y, r, ph) {
    if (r <= 0.5) return;
    const { u } = F, tilt = Math.sin(ph * 1.6) * 0.12;
    g.save(); g.translate(x, y); g.rotate(tilt);
    const shape = (gg) => { gg.beginPath(); gg.moveTo(0, -r * 1.5); gg.quadraticCurveTo(r * 1.1, -r * 0.3, 0, r); gg.quadraticCurveTo(-r * 1.1, -r * 0.3, 0, -r * 1.5); };
    knock(g, shape, 10 * u);
    carve(g, chain(quad(0, -r * 1.5, r * 1.1, -r * 0.3, 0, r, F.st * 0.5), quad(0, r, -r * 1.1, -r * 0.3, 0, -r * 1.5, F.st * 0.5)), 3.4 * u, { t0: 0, t1: 0, seed: 520 });
    carve(g, seg(0, r * 0.7, 0, -r * 0.9, F.st * 0.5), 2.6 * u, { seed: 521 });
    g.restore();
  }
  function chart(g, F, A, p, d, lt) {
    const { u, tall } = F;
    const vals = (d.values || []).map((v) => Math.max(0, Number(v) || 0));
    const n = Math.max(1, vals.length), max = Math.max(...vals, 1);
    const hi = d.highlight >= 0 && d.highlight < n ? d.highlight : -1;
    const R = tall ? { x: A.x, y: A.y, w: A.w, h: 250 * u } : { x: A.x + A.w * 0.68, y: A.y, w: A.w * 0.32, h: A.h };
    const Q = tall ? { x: A.x, y: A.y + 300 * u, w: A.w, h: A.h - 300 * u } : { x: A.x, y: A.y, w: A.w * 0.62, h: A.h };
    const base = Q.y + Q.h - 70 * u, slot = Q.w / n, bw = Math.min(slot * 0.46, 150 * u), topMin = Q.y + 150 * u;
    // Furrowed soil under the row.
    knock(g, (gg) => { gg.beginPath(); gg.rect(Q.x - 20 * u, base - 4 * u, Q.w + 40 * u, 44 * u); }, 0);
    for (let k = 0; k < 3; k++) carve(g, wavy(F, Q.x - 10 * u, Q.x + Q.w + 10 * u, base + (6 + k * 12) * u, 3 * u, k + 1), (5.5 - k * 1.3) * u, { q: span(p, k * 0.05, 0.3 + k * 0.05), seed: 300 + k, t0: 2, t1: 2 });
    let hot = null;
    vals.forEach((v, i) => {
      const cx = Q.x + slot * (i + 0.5), g0 = ease(span(p, 0.06 + i * 0.09, 0.5 + i * 0.09));
      say(g, d.labels[i] || "", cx, base + 76 * u, 44 * u, { align: "center", q: span(p, 0.12 + i * 0.08, 0.4 + i * 0.08), maxW: slot * 0.94, min: 42 * u });
      if (g0 <= 0) return;
      const full = Math.max(44 * u, (base - topMin) * (v / max)), h = full * g0;
      const isHot = i === hi, sway = Math.sin(lt * 1.3 + i * 1.7) * 7 * u * g0;
      const top = base - h, tw = bw * 0.8;
      const L = cubic(cx - bw / 2, base, cx - bw / 2, base - h * 0.5, cx - tw / 2 + sway * 0.5, top + h * 0.3, cx - tw / 2 + sway, top + 16 * u, F.st);
      const Rr = cubic(cx + bw / 2, base, cx + bw / 2, base - h * 0.5, cx + tw / 2 + sway * 0.5, top + h * 0.3, cx + tw / 2 + sway, top + 16 * u, F.st);
      const crown = quad(cx - tw / 2 + sway, top + 16 * u, cx + sway, top - 14 * u, cx + tw / 2 + sway, top + 16 * u, F.st);
      const body = (gg) => { gg.beginPath(); L.forEach(([x, y], k) => (k ? gg.lineTo(x, y) : gg.moveTo(x, y))); crown.forEach(([x, y]) => gg.lineTo(x, y)); for (let k = Rr.length - 1; k >= 0; k--) gg.lineTo(Rr[k][0], Rr[k][1]); gg.closePath(); };
      knock(g, body, 18 * u);
      if (isHot) reg(g, F, g0, () => { body(g); g.fillStyle = C.red; g.fill(); });
      // Chevron leaves carved up the stalk; a glint climbs them through the hold.
      g.save(); body(g); g.clip();
      const N = Math.max(0, Math.floor((h - 26 * u) / (24 * u)));
      for (let j = 0; j < N; j++) {
        const y = base - 20 * u - j * 24 * u, k = (base - y) / Math.max(1, h), sx = sway * k * k;
        const glint = Math.max(0, 1 - Math.abs(fract(lt * 0.42 + i * 0.27) * (N + 6) - j) / 2.2);
        const ww = (3.6 + 2.6 * glint) * u, half = bw * 0.38 * (1 - 0.16 * k);
        carve(g, seg(cx + sx - half, y + 7 * u, cx + sx, y - 9 * u, F.st * 0.4), ww, { seed: i * 97 + j, t0: 0.7, t1: 1.4, color: C.cut });
        carve(g, seg(cx + sx + half, y + 7 * u, cx + sx, y - 9 * u, F.st * 0.4), ww, { seed: i * 97 + j + 40, t0: 0.7, t1: 1.4, color: C.cut });
      }
      g.restore();
      const edge = isHot ? C.field : C.cut;
      carve(g, L, 4.6 * u, { t0: 0, t1: 1.2, seed: 330 + i, color: edge });
      carve(g, Rr, 4.6 * u, { t0: 0, t1: 1.2, seed: 340 + i, color: edge });
      carve(g, crown, 4.6 * u, { t0: 1, t1: 1, seed: 350 + i, color: edge });
      const bx = cx + sway, by = top - 14 * u;
      if (isHot) flower(g, F, bx, by - 30 * u, 40 * u * back(span(p, 0.45 + i * 0.04, 0.75 + i * 0.04)), lt);
      else bud(g, F, bx, by - 14 * u, 18 * u * g0, lt + i);
      say(g, tally(v, g0, d), cx, top - (isHot ? 92 : 50) * u, (isHot ? 62 : 52) * u, { align: "center", kind: "num", color: isHot ? C.red : C.cut });
      if (isHot) hot = { cx: bx, top: top - 150 * u, v, label: d.labels[i] || "" };
    });
    if (!hot) return;
    // The readout: the highlighted figure carved large, with a gouged arrow to its stalk.
    const rq = span(p, 0.45, 0.8);
    if (rq <= 0) return;
    const lx = R.x + 24 * u, ly = tall ? R.y + 64 * u : R.y + R.h * 0.22, ny = tall ? R.y + 214 * u : ly + 180 * u;
    say(g, hot.label, lx, ly, 46 * u, { q: rq, maxW: R.w - 48 * u, min: 42 * u, color: C.cut });
    let nw = 0;
    reg(g, F, rq, () => { nw = say(g, tally(hot.v, ease(span(p, 0.5, 0.95)), d), lx, ny, 150 * u, { kind: "num", color: C.red, maxW: R.w - (tall ? 380 : 48) * u, min: 96 * u }); });
    carve(g, wavy(F, lx, lx + Math.max(nw, 160 * u), ny + 26 * u, 2 * u, 3), 6 * u, { q: span(p, 0.6, 0.85), seed: 360 });
    carve(g, wavy(F, lx + 20 * u, lx + Math.max(nw, 160 * u) * 0.8, ny + 44 * u, 2 * u, 4), 3 * u, { q: span(p, 0.66, 0.9), seed: 361 });
    star(g, F, lx + Math.max(nw, 160 * u) + 40 * u, ny - 110 * u, (12 + 6 * Math.sin(lt * 3)) * u, 362);
    const sx = tall ? lx + Math.max(nw, 160 * u) + 60 * u : lx - 26 * u, sy = tall ? ny - 40 * u : ny - 60 * u;
    const ex = hot.cx + (tall ? 0 : 70 * u), ey = tall ? hot.top - 10 * u : hot.top + 60 * u;
    const pts = tall ? quad(sx, sy, sx + 40 * u, ey - 40 * u, ex + 70 * u, ey, F.st) : quad(sx, sy, lerp(sx, ex, 0.5), Math.min(sy, ey) - 120 * u, ex, ey, F.st);
    const aq = span(p, 0.62, 0.9);
    carve(g, pts, 6 * u, { q: aq, seed: 370, t0: 1, t1: 0.5 });
    if (aq >= 1) {
      const a = Math.atan2(pts[pts.length - 1][1] - pts[pts.length - 3][1], pts[pts.length - 1][0] - pts[pts.length - 3][0]);
      const hx = pts[pts.length - 1][0], hy = pts[pts.length - 1][1], s = 26 * u;
      carve(g, seg(hx, hy, hx - Math.cos(a - 0.5) * s, hy - Math.sin(a - 0.5) * s, F.st * 0.5), 6 * u, { seed: 371, t0: 0.3, t1: 1.2 });
      carve(g, seg(hx, hy, hx - Math.cos(a + 0.5) * s, hy - Math.sin(a + 0.5) * s, F.st * 0.5), 6 * u, { seed: 372, t0: 0.3, t1: 1.2 });
    }
  }

  // ---- object: the device carved out of the block, its screen cleared to paper -----------------------
  function badge(g, F, x, y, n, q, lt, i) {
    if (q <= 0) return;
    const { u } = F, r = 34 * u * back(q);
    const ph = fract(lt * 0.55 + i * 0.33);
    if (q >= 1) ringCarve(g, F, x, y, r * (1.15 + ph * 0.8), 5 * u * (1 - ph), { seed: 600 + i });
    knock(g, circle(x, y, r * 1.12), 0);
    reg(g, F, q, () => { circle(x, y, r)(g); g.fillStyle = C.red; g.fill(); });
    ringCarve(g, F, x, y, r * 1.02, 3.4 * u, { seed: 610 + i, color: C.field });
    say(g, String(n), x, y + 2 * u, 44 * u, { align: "center", base: "middle", kind: "num", color: C.onRed, halo: false, q: span(q, 0.5, 1) });
  }
  function object(g, F, A, p, d, lt) {
    const { u, tall } = F, phone = d.kind === "phone";
    let dw, dh, x, y;
    if (!tall) {
      if (phone) { dh = A.h * 0.96; dw = dh * 0.52; x = A.x + A.w * 0.12; }
      else { dw = Math.min(A.w * 0.52, A.h * 1.28); dh = dw * 0.6; x = A.x + 10 * u; }
      y = A.y + (A.h - dh * (phone ? 1 : 1.12)) / 2;
    } else {
      if (phone) { dh = A.h * 0.52; dw = dh * 0.52; } else { dw = A.w * 0.94; dh = dw * 0.6; }
      x = A.x + (A.w - dw) / 2; y = A.y + 10 * u;
    }
    const devBottom = y + dh * (phone ? 1 : 1.12), r = (phone ? 46 : 22) * u, q0 = span(p, 0, 0.3);
    knock(g, (gg) => { gg.beginPath(); gg.roundRect(x, y, dw, dh, r); }, 20 * u);
    if (!phone) {
      const base = (gg) => { gg.beginPath(); gg.moveTo(x - dw * 0.07, devBottom); gg.lineTo(x + dw * 1.07, devBottom); gg.lineTo(x + dw, y + dh + 4 * u); gg.lineTo(x, y + dh + 4 * u); gg.closePath(); };
      knock(g, base, 18 * u);
      carve(g, chain(seg(x, y + dh + 4 * u, x - dw * 0.07, devBottom, F.st), seg(x - dw * 0.07, devBottom, x + dw * 1.07, devBottom, F.st), seg(x + dw * 1.07, devBottom, x + dw, y + dh + 4 * u, F.st)), 5 * u, { q: q0, t0: 0, t1: 0, seed: 403 });
      const kq = span(p, 0.2, 0.45), kh = devBottom - y - dh;
      for (let row = 0; row < 2; row++) {
        const yy = y + dh + kh * (0.38 + row * 0.3), inset = dw * (0.02 + row * 0.03);
        for (let k = 0; k < 14; k++) {
          const xx = lerp(x + inset, x + dw - inset, (k + 0.15) / 14);
          if (k / 14 > kq) break;
          carve(g, seg(xx, yy, xx + dw / 14 * 0.6, yy, F.st), 3.2 * u, { seed: 410 + row * 20 + k, t0: 0.6, t1: 0.6 });
        }
      }
    }
    carve(g, rrPts(x, y, dw, dh, r, F.st), 6.5 * u, { q: q0, t0: 0, t1: 0, seed: 401 });
    carve(g, rrPts(x + 12 * u, y + 12 * u, dw - 24 * u, dh - 24 * u, r * 0.7, F.st), 2.4 * u, { q: span(p, 0.08, 0.36), t0: 0, t1: 0, seed: 402 });
    const pad = (phone ? 26 : 30) * u, sx = x + pad, sy = y + pad * (phone ? 2 : 1), sw = dw - pad * 2, sh = dh - pad * (phone ? 4 : 2);
    if (phone) carve(g, seg(x + dw / 2 - 30 * u, y + pad, x + dw / 2 + 30 * u, y + pad, F.st), 6 * u, { q: q0, seed: 404, t0: 0.5, t1: 0.5 });
    const pv = { x: sx + sw * 0.06, y: sy + sh * 0.06, w: sw * 0.88, h: sh * (phone ? 0.4 : 0.44) };
    const tTop = pv.y + pv.h + sh * 0.07, tGap = sh * 0.04, th = (sy + sh * 0.95 - tTop - tGap * 2) / 3;
    const CL = [[0.0, 0.33], [0.37, 0.25], [0.66, 0.3]];
    const clipBox = (t, i) => { const [a, w] = CL[i], s = t * 0.035; return { x: sx + sw * (0.05 + (a + s) * 0.9), y: tTop + t * (th + tGap), w: sw * 0.9 * w * (1 - s * 0.6), h: th }; };
    const clear = span(p, 0.1, 0.42);
    if (clear > 0) {
      g.save();
      g.beginPath(); g.rect(sx - 4, sy - 4, (sw + 8) * clear, sh + 8); g.clip();
      g.beginPath(); g.roundRect(sx, sy, sw, sh, 10 * u); g.fillStyle = C.cut; g.fill();
      // The preview: a tiny print of the same night, in red.
      const pq = span(p, 0.28, 0.55);
      if (pq > 0) {
        reg(g, F, pq, () => { g.beginPath(); g.roundRect(pv.x, pv.y, pv.w, pv.h, 6 * u); g.fillStyle = C.red; g.fill(); });
        g.save(); g.beginPath(); g.rect(pv.x, pv.y, pv.w, pv.h); g.clip();
        const mx = pv.x + pv.w * (0.7 + 0.06 * Math.sin(lt * 0.5)), my = pv.y + pv.h * 0.34;
        g.beginPath(); g.arc(mx, my, pv.h * 0.15, 0, TAU); g.fillStyle = C.cut; g.fill();
        for (let k = 0; k < 3; k++) carve(g, seg(pv.x + pv.w * (0.06 + k * 0.1) + fract(lt * 0.08 + k * 0.3) * pv.w * 0.3, pv.y + pv.h * (0.18 + k * 0.12), pv.x + pv.w * (0.26 + k * 0.1) + fract(lt * 0.08 + k * 0.3) * pv.w * 0.3, pv.y + pv.h * (0.18 + k * 0.12), F.st * 0.6), 3 * u, { seed: 420 + k, color: C.cut });
        g.beginPath(); g.moveTo(pv.x, pv.y + pv.h);
        for (let k = 0; k <= 24; k++) { const xx = pv.x + (pv.w * k) / 24; g.lineTo(xx, pv.y + pv.h * (0.7 + 0.1 * Math.sin(k * 0.7 + lt * 0.6))); }
        g.lineTo(pv.x + pv.w, pv.y + pv.h); g.closePath(); g.fillStyle = C.field; g.fill();
        g.restore();
      }
      for (let t = 0; t < 3; t++) for (let i = 0; i < 3; i++) {
        const b = clipBox(t, i), shown = span(p, 0.32 + i * 0.07 + t * 0.04, 0.5 + i * 0.07 + t * 0.04);
        if (shown <= 0) continue;
        const red = t === 0 && i === 1;
        const draw = () => { g.beginPath(); g.roundRect(b.x, b.y, b.w * shown, b.h, 5 * u); g.fillStyle = red ? C.red : C.field; g.fill(); };
        if (red) reg(g, F, shown, draw); else draw();
        g.save(); g.beginPath(); g.rect(b.x, b.y, b.w * shown, b.h); g.clip();
        for (let k = 0; k < b.w / (14 * u) + 2; k++) { const xx = b.x + k * 14 * u; carve(g, seg(xx, b.y + b.h, xx + b.h * 0.6, b.y, F.st * 0.6), 2.2 * u, { seed: 430 + t * 30 + i * 9 + k, t0: 0, t1: 0, color: C.cut }); }
        g.restore();
      }
      if (p > 0.5) {
        const phx = sx + sw * (0.05 + 0.9 * fract(lt * 0.16)), py0 = tTop - tGap, py1 = sy + sh * 0.97;
        carve(g, seg(phx, py0, phx, py1, F.st), 4 * u, { t0: 0, t1: 0.5, seed: 450, color: C.field });
        g.beginPath(); g.moveTo(phx - 11 * u, py0 - 12 * u); g.lineTo(phx + 11 * u, py0 - 12 * u); g.lineTo(phx, py0 + 4 * u); g.closePath(); g.fillStyle = C.red; g.fill();
      }
      g.restore();
      if (clear < 1) { // The chisel's ragged front where the screen is still being cleared.
        const ex = sx + (sw + 8) * clear - 4;
        for (let k = 0; k < 10; k++) { const yy = sy + (sh * (k + 0.5)) / 10; carve(g, seg(ex - 18 * u, yy - 8 * u, ex + 4 * u, yy + 4 * u, F.st * 0.5), 6 * u, { seed: 460 + k, t0: 0.4, t1: 1.6 }); }
      }
    }
    // Callouts.
    const red = clipBox(0, 1), low = clipBox(2, 0);
    const anchors = [[pv.x + pv.w * 0.4, pv.y + pv.h * 0.36], [red.x + red.w * 0.5, red.y + red.h * 0.5], [low.x + low.w * 0.4, low.y + low.h * 0.5]];
    d.callouts.forEach((label, i) => {
      const c = span(p, 0.42 + i * 0.12, 0.68 + i * 0.12);
      if (c <= 0) return;
      const [ax, ay] = anchors[i];
      if (!tall) {
        const lx = Math.max(x + dw * (phone ? 1 : 1.07) + 150 * u, A.x + A.w * (phone ? 0.5 : 0.6)), ly = A.y + A.h * (0.18 + i * 0.32);
        const ex = lx - 90 * u;
        carve(g, chain(seg(ax, ay, ex, ly, F.st), seg(ex, ly, lx - 24 * u, ly, F.st)), 4.4 * u, { q: c, seed: 470 + i, t0: 0, t1: 1 });
        badge(g, F, ax, ay, i + 1, c, lt, i);
        if (label) {
          const w = say(g, label, lx, ly, 48 * u, { base: "middle", q: span(c, 0.5, 1), maxW: A.x + A.w - lx, min: 42 * u });
          carve(g, wavy(F, lx, lx + w, ly + 34 * u, 1.5 * u, i + 5), 3.4 * u, { q: span(c, 0.6, 1), seed: 480 + i });
        }
      } else {
        badge(g, F, ax, ay, i + 1, c, lt, i);
        const ly = devBottom + 110 * u + i * 130 * u, bx = A.x + 50 * u;
        badge(g, F, bx, ly, i + 1, c, lt + 0.4, i + 3);
        if (label) {
          const w = say(g, label, bx + 64 * u, ly, 48 * u, { base: "middle", q: span(c, 0.4, 1), maxW: A.w - 130 * u, min: 42 * u });
          carve(g, wavy(F, bx + 64 * u, bx + 64 * u + w, ly + 34 * u, 1.5 * u, i + 5), 3.4 * u, { q: span(c, 0.6, 1), seed: 480 + i });
        }
      }
    });
  }

  // ---- people: carved folk figures, each with its own hair and cloth ----------------------------------
  function folk(g, F, cx, base, h, i, hot, q, lt) {
    const { u } = F;
    const rise = (1 - q) * h * 0.4, breathe = 1 + Math.sin(lt * 1.9 + i * 1.3) * 0.014;
    g.save();
    g.beginPath(); g.rect(cx - h, base - h * 1.7, h * 2, h * 1.7 + 3 * u); g.clip();
    g.translate(cx, base + rise); g.scale(1, breathe); g.translate(-cx, -base);
    const hr = h * 0.13, shY = base - h + hr * 2.5, bw = h * 0.42, hem = h * 0.54;
    const bodyPts = chain(seg(cx - hem / 2, base, cx - bw / 2, shY + bw * 0.3, F.st), quad(cx - bw / 2, shY + bw * 0.3, cx - bw / 2, shY, cx - bw * 0.15, shY, F.st * 0.5),
      seg(cx - bw * 0.15, shY, cx + bw * 0.15, shY, F.st), quad(cx + bw * 0.15, shY, cx + bw / 2, shY, cx + bw / 2, shY + bw * 0.3, F.st * 0.5), seg(cx + bw / 2, shY + bw * 0.3, cx + hem / 2, base, F.st));
    const body = (gg) => { gg.beginPath(); bodyPts.forEach(([x, y], k) => (k ? gg.lineTo(x, y) : gg.moveTo(x, y))); gg.closePath(); };
    const hx = cx, hy = base - h + hr * 1.1;
    knock(g, body, 16 * u);
    knock(g, circle(hx, hy, hr * 1.25), 16 * u);
    if (hot) reg(g, F, q, () => { body(g); g.fillStyle = C.red; g.fill(); });
    // Cloth: parallel cuts, each figure its own weave.
    g.save(); body(g); g.clip();
    const kind = i % 4, top = shY + bw * 0.25;
    if (kind === 0) for (let y = top, k = 0; y < base; y += 15 * u, k++) carve(g, seg(cx - hem, y, cx + hem, y + 4 * u, F.st), lerp(2.2, 5.5, (y - top) / (base - top)) * u, { seed: 700 + i * 50 + k, t0: 0, t1: 0, jit: 0.3 });
    else if (kind === 1) for (let x = cx - hem / 2, k = 0; x < cx + hem / 2; x += 17 * u, k++) carve(g, quad(x, shY, x + (x - cx) * 0.25, (shY + base) / 2, x + (x - cx) * 0.35, base, F.st), 3.6 * u, { seed: 700 + i * 50 + k, t0: 0, t1: 0, jit: 0.3 });
    else if (kind === 2) for (let y = top + 10 * u, k = 0; y < base + 20 * u; y += 24 * u, k++) for (let x = cx - hem / 2 - 10 * u, m = 0; x < cx + hem / 2 + 10 * u; x += 32 * u, m++) carve(g, chain(seg(x, y, x + 16 * u, y - 12 * u, F.st * 0.5), seg(x + 16 * u, y - 12 * u, x + 32 * u, y, F.st * 0.5)), 3.4 * u, { seed: 700 + i * 50 + k * 7 + m, t0: 0.5, t1: 0.5 });
    else for (let y = top + 8 * u, k = 0; y < base; y += 20 * u, k++) for (let x = cx - hem / 2 + ((k % 2) * 10 + 6) * u, m = 0; x < cx + hem / 2; x += 20 * u, m++) carve(g, seg(x, y, x + 5 * u, y + 3 * u, F.st * 0.3), 5 * u, { seed: 700 + i * 50 + k * 7 + m, t0: 0.4, t1: 0.4 });
    g.restore();
    carve(g, bodyPts, 5 * u, { t0: 0, t1: 0, seed: 760 + i, color: hot ? C.field : C.cut });
    // Arms.
    const armC = hot ? C.field : C.cut;
    carve(g, quad(cx - bw * 0.36, shY + bw * 0.22, cx - bw * 0.5, shY + h * 0.24, cx - bw * 0.4, shY + h * 0.42, F.st * 0.6), 4 * u, { seed: 770 + i, color: armC });
    if (!hot) carve(g, quad(cx + bw * 0.36, shY + bw * 0.22, cx + bw * 0.5, shY + h * 0.24, cx + bw * 0.4, shY + h * 0.42, F.st * 0.6), 4 * u, { seed: 780 + i, color: armC });
    else {
      const a = -0.95 + Math.sin(lt * 4.6) * 0.3, L = h * 0.36, ax = cx + bw * 0.4, ay = shY + bw * 0.22;
      const ex = ax + Math.cos(a) * L, ey = ay + Math.sin(a) * L;
      const arm = (gg) => { gg.beginPath(); gg.moveTo(ax, ay); gg.lineTo(ex, ey); gg.lineWidth = h * 0.11; gg.lineCap = "round"; };
      g.save(); arm(g); g.strokeStyle = C.field; g.lineWidth = h * 0.11 + 16 * u; g.stroke(); g.restore();
      reg(g, F, q, () => { arm(g); g.strokeStyle = C.red; g.stroke(); });
      knock(g, circle(ex, ey, h * 0.065), 0);
      ringCarve(g, F, ex, ey, h * 0.065, 3.4 * u, { seed: 790 });
      carve(g, seg(ax + Math.cos(a) * 10 * u, ay + Math.sin(a) * 10 * u, ex - Math.cos(a) * h * 0.08, ey - Math.sin(a) * h * 0.08, F.st * 0.5), 3 * u, { seed: 791 });
    }
    // Head, tilting a little as they listen.
    const tilt = Math.sin(lt * 1.2 + i * 2.1) * 0.07;
    g.save(); g.translate(hx, hy + hr); g.rotate(tilt); g.translate(-hx, -(hy + hr));
    const hair = i % 4;
    if (hair === 3) { // Long hair, behind the head.
      const sh = (gg) => { gg.beginPath(); gg.arc(hx, hy, hr * 1.18, Math.PI * 0.95, Math.PI * 2.05); gg.lineTo(hx + hr * 1.1, hy + hr * 1.4); gg.lineTo(hx - hr * 1.1, hy + hr * 1.4); gg.closePath(); };
      knock(g, sh, 0);
      carve(g, arc(hx, hy, hr * 1.18, hr * 1.18, Math.PI * 0.95, Math.PI * 2.05, F.st * 0.5), 4 * u, { seed: 800 + i, t0: 0, t1: 0 });
      for (const sgn of [-1, 1]) for (let k = 0; k < 3; k++) carve(g, seg(hx + sgn * hr * (0.95 + k * 0.1), hy + hr * 0.2, hx + sgn * hr * (0.95 + k * 0.1), hy + hr * 1.35, F.st * 0.5), 2.6 * u, { seed: 810 + k + (sgn > 0 ? 5 : 0) });
    }
    if (hair === 2) for (let k = 0; k < 7; k++) { // Curls.
      const a = Math.PI * (1.02 + (k * 0.96) / 6), x = hx + Math.cos(a) * hr * 0.98, y = hy + Math.sin(a) * hr * 0.98;
      knock(g, circle(x, y, hr * 0.32), 0);
      carve(g, arc(x, y, hr * 0.3, hr * 0.3, a - 1.6, a + 1.6, F.st * 0.4), 3.2 * u, { seed: 820 + k, t0: 0, t1: 0 });
    }
    if (hair === 0) { // A bun.
      const by = hy - hr * 1.12;
      knock(g, circle(hx, by, hr * 0.46), 0);
      ringCarve(g, F, hx, by, hr * 0.46, 3.6 * u, { seed: 830 });
      carve(g, arc(hx, by, hr * 0.24, hr * 0.24, 0, 4.5, F.st * 0.4), 2.6 * u, { seed: 831 });
    }
    knock(g, circle(hx, hy, hr), 0);
    ringCarve(g, F, hx, hy, hr, 4.6 * u, { seed: 840 + i });
    const blink = fract((lt + i * 0.71) / 3.3) < 0.045;
    for (const sgn of [-1, 1]) {
      const ex = hx + sgn * hr * 0.38, ey = hy - hr * 0.05;
      if (blink) carve(g, seg(ex - hr * 0.13, ey, ex + hr * 0.13, ey, F.st * 0.3), 3 * u, { seed: 850 + sgn, t0: 0.5, t1: 0.5 });
      else carve(g, seg(ex, ey - hr * 0.15, ex, ey + hr * 0.12, F.st * 0.3), 4.2 * u, { seed: 852 + sgn, t0: 0.6, t1: 0.6 });
    }
    carve(g, arc(hx, hy + hr * 0.1, hr * 0.42, hr * 0.34, 0.45, Math.PI - 0.45, F.st * 0.3), 3.2 * u, { seed: 856, t0: 0.6, t1: 0.6 });
    if (hair === 1) { // A cap with a brim and stitched cuts.
      const cy = hy - hr * 0.18;
      const cap = (gg) => { gg.beginPath(); gg.arc(hx, cy, hr * 1.04, Math.PI, TAU); gg.lineTo(hx + hr * 1.6, cy); gg.lineTo(hx + hr * 1.6, cy + hr * 0.18); gg.lineTo(hx - hr * 1.04, cy + hr * 0.18); gg.closePath(); };
      knock(g, cap, 6 * u);
      carve(g, chain(arc(hx, cy, hr * 1.04, hr * 1.04, Math.PI, TAU, F.st * 0.5), seg(hx + hr * 1.04, cy, hx + hr * 1.6, cy + hr * 0.1, F.st * 0.5)), 4 * u, { seed: 860, t0: 0, t1: 0.6 });
      carve(g, seg(hx - hr * 0.9, cy - hr * 0.3, hx + hr * 0.9, cy - hr * 0.3, F.st * 0.4), 2.6 * u, { seed: 861, t0: 0.5, t1: 0.5 });
      carve(g, seg(hx, cy - hr * 1.0, hx, cy - hr * 0.35, F.st * 0.3), 2.6 * u, { seed: 862, t0: 0.5, t1: 0.5 });
    }
    if (hair !== 1) carve(g, arc(hx, hy, hr * 0.82, hr * 0.82, Math.PI * 1.12, Math.PI * 1.88, F.st * 0.4), 3 * u, { seed: 870 + i });
    g.restore();
    g.restore();
  }
  function ribbon(g, F, s, cx, cy, hot, q) {
    if (q <= 0 || !s) return;
    const { u } = F, size = 42 * u, tw = measure(g, s, size), bw = tw + 64 * u, bh = 64 * u;
    g.save();
    g.beginPath(); g.rect(cx - bw / 2 - 40 * u, cy - bh, (bw + 80 * u) * q, bh * 2); g.clip();
    const sh = (gg) => {
      gg.beginPath(); gg.moveTo(cx - bw / 2 - 24 * u, cy - bh / 2); gg.lineTo(cx + bw / 2 + 24 * u, cy - bh / 2); gg.lineTo(cx + bw / 2 + 6 * u, cy);
      gg.lineTo(cx + bw / 2 + 24 * u, cy + bh / 2); gg.lineTo(cx - bw / 2 - 24 * u, cy + bh / 2); gg.lineTo(cx - bw / 2 - 6 * u, cy); gg.closePath();
    };
    knock(g, sh, 12 * u);
    if (hot) reg(g, F, q, () => { sh(g); g.fillStyle = C.red; g.fill(); });
    else { sh(g); g.fillStyle = C.cut; g.fill(); }
    const line = hot ? C.onRed : C.field;
    carve(g, seg(cx - bw / 2 - 4 * u, cy - bh / 2 + 9 * u, cx + bw / 2 + 4 * u, cy - bh / 2 + 9 * u, F.st), 2.4 * u, { seed: 900, color: line, t0: 1, t1: 1 });
    carve(g, seg(cx - bw / 2 - 4 * u, cy + bh / 2 - 9 * u, cx + bw / 2 + 4 * u, cy + bh / 2 - 9 * u, F.st), 2.4 * u, { seed: 901, color: line, t0: 1, t1: 1 });
    say(g, s, cx, cy + 3 * u, size, { align: "center", base: "middle", color: line, halo: false });
    g.restore();
  }
  function people(g, F, A, p, d, lt) {
    const { u } = F, n = clamp(Math.round(Number(d.count) || 4), 2, 6);
    const slot = A.w / n, base = A.y + A.h - 4 * u, stag = slot < 260 * u;
    const h = Math.min(A.h - (stag ? 230 : 160) * u, slot * 1.9, 480 * u);
    const hiI = Math.min(n - 1, d.highlight ?? 1);
    for (let i = 0; i < n; i++) {
      const q = ease(span(p, 0.04 + i * 0.08, 0.4 + i * 0.08));
      if (q <= 0) continue;
      const cx = A.x + slot * (i + 0.5);
      carve(g, wavy(F, cx - h * 0.36, cx + h * 0.36, base + 6 * u, 1.5 * u, i), 5 * u, { q, seed: 950 + i });
      folk(g, F, cx, base, h * (i === hiI ? 1.05 : 1), i, i === hiI, q, lt);
    }
    for (let i = 0; i < n; i++) {
      const label = d.badges[i % d.badges.length], qb = span(p, 0.32 + i * 0.08, 0.56 + i * 0.08);
      const hh = h * (i === hiI ? 1.05 : 1), bob = Math.sin(lt * 1.6 + i) * 4 * u;
      ribbon(g, F, label, A.x + slot * (i + 0.5), base - hh - 56 * u - (stag && i % 2 ? 76 * u : 0) + bob, i === hiI, qb);
    }
  }

  // ---- process: carved medallions on a stitched path, an ink drop travelling between them ---------------
  function icon(g, F, kind, x, y, s, q, lt) {
    if (q <= 0) return;
    const { u } = F, w = Math.max(4 * u, s * 0.07);
    if (kind === 0) { // A film frame with a hill inside.
      const fw = s * 0.62, fh = s * 0.44;
      carve(g, rrPts(x - fw / 2, y - fh / 2, fw, fh, 8 * u, F.st * 0.6), w, { q, t0: 0, t1: 0, seed: 1000 });
      for (let k = 0; k < 5; k++) for (const yy of [y - fh / 2 + fh * 0.14, y + fh / 2 - fh * 0.14]) {
        const xx = x - fw * 0.36 + (k * fw * 0.72) / 4;
        if (k / 5 < q) carve(g, seg(xx - 5 * u, yy, xx + 5 * u, yy, F.st * 0.3), w * 0.9, { seed: 1001 + k, t0: 0.3, t1: 0.3 });
      }
      const mt = [[x - fw * 0.32, y + fh * 0.2], [x - fw * 0.1, y - fh * 0.12], [x + fw * 0.04, y + fh * 0.04], [x + fw * 0.17, y - fh * 0.06], [x + fw * 0.32, y + fh * 0.2]];
      carve(g, chain(...mt.slice(1).map((pt, k) => seg(mt[k][0], mt[k][1], pt[0], pt[1], F.st * 0.4))), w * 0.8, { q: span(q, 0.4, 1), seed: 1010, t0: 0.5, t1: 0.5 });
    } else if (kind === 1) { // A palm gouge pushing through the block, a chip curling off its blade.
      const a = -0.6 + Math.sin(lt * 2.2) * 0.06, ca = Math.cos(a), sa = Math.sin(a);
      const tx = x + s * 0.3, ty = y + s * 0.12, P = (d, n = 0) => [tx - ca * d - sa * n, ty - sa * d + ca * n];
      const [bx, by] = P(s * 0.66);
      g.save(); g.beginPath(); g.ellipse(bx, by, s * 0.2, s * 0.15, a, 0, TAU); g.fillStyle = C.cut; g.globalAlpha *= clamp(q * 3); g.fill(); g.restore();
      carve(g, seg(...P(s * 0.5), ...P(s * 0.4), F.st * 0.3), s * 0.17, { q, seed: 1020, t0: 0.1, t1: 0.1, jit: 0.1 });
      carve(g, seg(...P(s * 0.38), ...P(0), F.st * 0.3), s * 0.075, { q: span(q, 0.2, 0.7), seed: 1021, t0: 0.2, t1: 1.2 });
      const ph = 0.45 + 0.55 * fract(lt * 0.7), [cx, cy] = P(-s * 0.08, -s * 0.14);
      carve(g, arc(cx, cy, s * 0.13, s * 0.13, a + Math.PI * 0.5, a + Math.PI * (0.5 + 1.6 * ph), F.st * 0.3), w * 0.85, { q: span(q, 0.6, 1), seed: 1022, t0: 0.3, t1: 1.4 });
      carve(g, seg(...P(s * 0.02, s * 0.1), ...P(s * 0.62, s * 0.1), F.st * 0.4), w * 0.7, { q: span(q, 0.7, 1), seed: 1023, t0: 2, t1: 1 });
    } else { // A tick.
      carve(g, chain(seg(x - s * 0.3, y + s * 0.02, x - s * 0.08, y + s * 0.24, F.st * 0.5), seg(x - s * 0.08, y + s * 0.24, x + s * 0.34, y - s * 0.26, F.st * 0.5)), w * 1.7, { q, seed: 1030, t0: 1, t1: 1.6 });
    }
  }
  function process(g, F, A, p, d, lt) {
    const { u, tall } = F, steps = d.steps, n = steps.length;
    let r;
    const pos = [];
    if (!tall) { r = Math.min(A.h * 0.25, (A.w / n) * 0.24); for (let i = 0; i < n; i++) pos.push([A.x + (A.w * (i + 0.5)) / n, A.y + A.h * 0.4]); }
    else { r = Math.min((A.h / n) * 0.3, A.w * 0.19); for (let i = 0; i < n; i++) pos.push([A.x + r + 20 * u, A.y + (A.h * (i + 0.5)) / n]); }
    const paths = [];
    for (let i = 0; i < n - 1; i++) {
      const [x1, y1] = pos[i], [x2, y2] = pos[i + 1];
      const pts = tall ? cubic(x1, y1 + r + 22 * u, x1 + r * 1.4, y1 + r * 1.6, x2 + r * 1.4, y2 - r * 1.6, x2, y2 - r - 28 * u, F.st)
        : cubic(x1 + r + 24 * u, y1, x1 + r + (x2 - x1 - 2 * r) * 0.35, y1 - r * 0.8, x2 - r - (x2 - x1 - 2 * r) * 0.35, y2 + r * 0.8, x2 - r - 30 * u, y2, F.st);
      paths.push(pts);
      const q = span(p, 0.28 + i * 0.16, 0.52 + i * 0.16);
      dashes(pts, 30 * u, 16 * u, q).forEach((dsh, k) => carve(g, dsh, 6 * u, { seed: 1100 + i * 40 + k, t0: 0.6, t1: 1 }));
      if (q >= 1) {
        const [hx, hy] = pts[pts.length - 1], a = Math.atan2(hy - pts[pts.length - 3][1], hx - pts[pts.length - 3][0]), s = 26 * u;
        carve(g, seg(hx, hy, hx - Math.cos(a - 0.55) * s, hy - Math.sin(a - 0.55) * s, F.st * 0.4), 6 * u, { seed: 1180 + i, t0: 0.3, t1: 1.2 });
        carve(g, seg(hx, hy, hx - Math.cos(a + 0.55) * s, hy - Math.sin(a + 0.55) * s, F.st * 0.4), 6 * u, { seed: 1190 + i, t0: 0.3, t1: 1.2 });
      }
    }
    // The traveller: an ink drop running the path, then resting at the last stop.
    let ripple = -1, rk = 0;
    const tq = span(p, 0.8, 1);
    let drop = null;
    if (tq > 0 && paths.length) {
      const s = fract(lt * 0.24 + 0.6);
      if (s < 0.8) {
        const k = (s / 0.8) * paths.length, pi = Math.min(paths.length - 1, Math.floor(k)), f = k - pi;
        drop = along(paths[pi], f);
        if (pi > 0 && f < 0.35) { ripple = pi; rk = f / 0.35; }
      } else { ripple = n - 1; rk = (s - 0.8) / 0.2; }
    }
    pos.forEach(([x, y], i) => {
      const q = span(p, 0.04 + i * 0.16, 0.34 + i * 0.16);
      if (q <= 0) return;
      const last = i === n - 1, s = back(q), rr = r * s;
      if (ripple === i) ringCarve(g, F, x, y, r * (1.14 + rk * 0.5), 7 * u * (1 - rk), { seed: 1200 + i });
      knock(g, circle(x, y, rr * 1.06), 18 * u);
      if (last) reg(g, F, q, () => { circle(x, y, rr)(g); g.fillStyle = C.red; g.fill(); });
      const lc = last ? C.onRed : C.cut;
      ringCarve(g, F, x, y, rr, 7 * u, { q, seed: 1210 + i, color: C.cut });
      ringCarve(g, F, x, y, rr * 0.8, 2.8 * u, { q: span(q, 0.2, 1), seed: 1220 + i, color: lc });
      const rot = lt * 0.22 * (i % 2 ? -1 : 1), ticks = 30;
      for (let k = 0; k < ticks; k++) {
        if (k / ticks > q) break;
        const a = rot + (k * TAU) / ticks;
        carve(g, seg(x + Math.cos(a) * rr * 0.84, y + Math.sin(a) * rr * 0.84, x + Math.cos(a) * rr * 0.95, y + Math.sin(a) * rr * 0.95, F.st * 0.3), (k % 5 ? 2.6 : 4.4) * u, { seed: 1230 + k, t0: 0.4, t1: 0.4, color: lc });
      }
      g.save();
      if (last) { g.fillStyle = C.onRed; }
      const prev = C.cut;
      if (last) C.cut = C.onRed;
      icon(g, F, last ? 2 : i % 2, x, y, rr * 1.22, span(p, 0.18 + i * 0.16, 0.44 + i * 0.16), lt);
      C.cut = prev;
      g.restore();
      const lq = span(q, 0.5, 1);
      if (!tall) {
        say(g, String(i + 1).padStart(2, "0"), x, y - r - 30 * u, 46 * u, { align: "center", kind: "num", color: C.red, q: lq });
        say(g, steps[i], x, y + r + 78 * u, 48 * u, { align: "center", maxW: (A.w / n) * 0.94, min: 42 * u, q: lq });
      } else {
        const lx = x + r + 56 * u;
        say(g, String(i + 1).padStart(2, "0"), lx, y - 20 * u, 46 * u, { kind: "num", color: C.red, q: lq });
        say(g, steps[i], lx, y + 44 * u, 50 * u, { maxW: A.x + A.w - lx, min: 42 * u, q: lq });
      }
    });
    if (drop) {
      const [x, y, a] = drop, s = 22 * u * back(tq);
      g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2);
      const dr = (gg) => { gg.beginPath(); gg.moveTo(0, -s * 1.6); gg.quadraticCurveTo(s * 1.1, 0, 0, s); gg.quadraticCurveTo(-s * 1.1, 0, 0, -s * 1.6); };
      knock(g, dr, 10 * u);
      dr(g); g.fillStyle = C.red; g.fill();
      carve(g, seg(-s * 0.3, -s * 0.2, -s * 0.15, s * 0.4, F.st * 0.2), 3 * u, { seed: 1250 });
      g.restore();
    }
  }

  // ---- compare: two printing plates, tallies gouged one stroke at a time ------------------------------
  function compare(g, F, A, p, d, lt) {
    const { u, tall } = F;
    const Lv = Math.max(0, Number(d.leftValue) || 0), Rv = Math.max(0, Number(d.rightValue) || 0), mx = Math.max(Lv, Rv, 1);
    const scale = mx <= 30 ? 1 : 30 / mx;
    const gap = (tall ? 130 : 190) * u;
    const pw = tall ? A.w : (A.w - gap) / 2, ph = tall ? (A.h - gap) / 2 : A.h * 0.94;
    [[d.left, Lv, 0], [d.right, Rv, 1]].forEach(([label, v, i]) => {
      const x = tall ? A.x : A.x + i * (pw + gap), y = tall ? A.y + i * (ph + gap) : A.y + (A.h - ph) / 2;
      const q = span(p, i * 0.22, 0.38 + i * 0.22);
      if (q <= 0) return;
      const tc = i ? C.onRed : C.cut;
      knock(g, (gg) => { gg.beginPath(); gg.rect(x, y, pw, ph); }, 18 * u);
      if (i) reg(g, F, q, () => { g.fillStyle = C.red; g.fillRect(x, y, pw, ph); });
      // Tone carved in parallel rows: wide cuts at the foot of the plate, thinning to nothing up top,
      // drifting slowly as the ink settles so the plate never sits still.
      g.save(); g.beginPath(); g.rect(x + 18 * u, y + 18 * u, pw - 36 * u, ph - 36 * u); g.clip();
      const rowGap = 17 * u, drift = fract(lt * 0.12 + i * 0.37) * rowGap;
      for (let yy = y + ph * 0.42 + drift, k = 0; yy < y + ph; yy += rowGap, k++) {
        const f = (yy - (y + ph * 0.42)) / (ph * 0.58), wd = (0.8 + 6.5 * f * f) * u;
        if (wd < 1 * u) continue;
        const pts = [];
        for (let xx = x; xx <= x + pw + 0.1; xx += F.st * 1.6) pts.push([xx, yy + Math.sin(xx * 0.012 / u + k * 0.9 + lt * 0.6) * 4 * u]);
        const qq = span(q, 0.3 + f * 0.3, 0.7 + f * 0.3);
        carve(g, pts, wd, { q: qq, seed: 1360 + i * 60 + k, t0: 2, t1: 3, jit: 0.35, color: i ? C.field : C.cut });
      }
      g.restore();
      carve(g, rrPts(x, y, pw, ph, 4 * u, F.st), 6.5 * u, { q, t0: 0, t1: 0, seed: 1300 + i });
      carve(g, rrPts(x + 15 * u, y + 15 * u, pw - 30 * u, ph - 30 * u, 3 * u, F.st), 2.4 * u, { q: span(q, 0.2, 1), t0: 0, t1: 0, seed: 1310 + i, color: tc });
      for (const [cx, cy] of [[x + 15 * u, y + 15 * u], [x + pw - 15 * u, y + 15 * u], [x + 15 * u, y + ph - 15 * u], [x + pw - 15 * u, y + ph - 15 * u]]) {
        if (q >= 1) { knock(g, circle(cx, cy, 11 * u), 0); if (i) { circle(cx, cy, 11 * u)(g); g.fillStyle = C.red; g.fill(); } ringCarve(g, F, cx, cy, 8 * u, 2.6 * u, { seed: 1320, color: tc }); }
      }
      say(g, label, x + 44 * u, y + 88 * u, 50 * u, { q: span(q, 0.4, 1), maxW: pw - 88 * u, min: 42 * u, color: tc, halo: false });
      const cq = ease(span(p, 0.2 + i * 0.22, 0.72 + i * 0.22));
      const size = Math.min(250 * u, ph * 0.38, pw * 0.42), nx = x + 40 * u, ny = y + 112 * u + size * 0.86;
      say(g, tally(v, cq, d), nx, ny, size, { kind: "num", color: tc, halo: false, maxW: pw * 0.5, min: 96 * u, q: span(q, 0.3, 0.6) > 0 ? 1 : 0 });
      // A pile of pulled prints, one sheet per count, on the right of the plate.
      const m = Math.round(v * scale), mm = Math.max(1, Math.round(mx * scale)), shown = m * cq;
      const sx0 = x + pw * 0.56, sw = pw * 0.36, py1 = y + ph - 46 * u, py0 = y + 120 * u, per = Math.min(46 * u, (py1 - py0) / mm);
      const top = Math.ceil(shown - 1e-6) - 1;
      for (let j = 0; j <= top; j++) {
        const kq = clamp(shown - j), drop = (1 - ease(kq)) * 90 * u;
        const xo = (hash(j, i + 7) - 0.5) * sw * 0.14, sy = py1 - (j + 1) * per - drop, sh = Math.max(6 * u, per * 0.78);
        const lift = j === top && kq >= 1 ? Math.sin(lt * 2.3 + i) * 0.035 : (hash(j, i + 3) - 0.5) * 0.03;
        g.save(); g.translate(sx0 + xo + sw / 2, sy + sh / 2); g.rotate(lift); g.globalAlpha *= clamp(kq * 2.5);
        g.fillStyle = C.paper; g.fillRect(-sw / 2, -sh / 2, sw, sh);
        g.strokeStyle = C.field; g.lineWidth = 2.4 * u; g.strokeRect(-sw / 2, -sh / 2, sw, sh);
        if (sh > 14 * u) carve(g, seg(-sw * 0.38, 0, sw * (0.1 + 0.25 * hash(j, i)), 0, F.st), Math.min(5 * u, sh * 0.22), { seed: 1350 + j, color: C.field, t0: 1, t1: 1 });
        g.restore();
      }
      // Tallies, gouged one stroke per count under the figure.
      const tx = nx + 6 * u, tyTop = ny + 46 * u, bottom = y + ph - 40 * u;
      const mg = 15 * u, gw = mg * 4 + 30 * u, cap = Math.max(1, Math.floor((pw * 0.5 - 50 * u) / gw));
      const rows = Math.max(1, Math.ceil(m / 5 / cap)), mh = Math.max(24 * u, Math.min(80 * u, (bottom - tyTop) / rows - 16 * u));
      const glintAt = fract(lt * 0.35 + i * 0.5) * (m + 6) - 3;
      for (let j = 0; j < m; j++) {
        const kq = clamp(shown - j);
        if (kq <= 0) break;
        const grp = Math.floor(j / 5), r5 = j % 5, row = Math.floor(grp / cap), col = grp % cap;
        const gx = tx + col * gw, gy = tyTop + row * (mh + 16 * u), gl = 1 + 0.45 * Math.max(0, 1 - Math.abs(glintAt - j) / 1.6);
        if (r5 < 4) { const xx = gx + r5 * mg; carve(g, seg(xx, gy, xx + (hash(j, i) - 0.5) * 6 * u, gy + mh, F.st * 0.6), 5.4 * u * gl, { q: kq, seed: 1400 + i * 100 + j, t0: 0.6, t1: 1, color: tc }); }
        else carve(g, seg(gx - 9 * u, gy + mh * 0.82, gx + 3 * mg + 9 * u, gy + mh * 0.16, F.st * 0.6), 5.4 * u * gl, { q: kq, seed: 1400 + i * 100 + j, t0: 0.6, t1: 1, color: tc });
      }
    });
    // A carved arrow between the plates, nudging toward the second.
    const aq = span(p, 0.32, 0.58);
    if (aq > 0) {
      const cx = tall ? A.x + A.w / 2 : A.x + pw + gap / 2, cy = tall ? A.y + ph + gap / 2 : A.y + A.h / 2;
      const len = gap * 0.78, wd = 34 * u, nudge = Math.sin(lt * 3.1) * 8 * u;
      g.save(); g.translate(cx, cy); if (tall) g.rotate(Math.PI / 2); g.translate(nudge, 0); g.scale(back(aq), back(aq));
      const pts = [[-len / 2, -wd / 2], [len * 0.1, -wd / 2], [len * 0.1, -wd * 1.15], [len / 2, 0], [len * 0.1, wd * 1.15], [len * 0.1, wd / 2], [-len / 2, wd / 2]];
      const sh = (gg) => { gg.beginPath(); pts.forEach(([x, y], k) => (k ? gg.lineTo(x, y) : gg.moveTo(x, y))); gg.closePath(); };
      knock(g, sh, 14 * u);
      carve(g, chain(...pts.map((pt, k) => seg(pt[0], pt[1], pts[(k + 1) % pts.length][0], pts[(k + 1) % pts.length][1], F.st * 0.5))), 4.4 * u, { t0: 0, t1: 0, seed: 1500 });
      for (let k = -1; k <= 1; k++) carve(g, seg(-len / 2 + 12 * u, k * wd * 0.24, len * 0.08, k * wd * 0.24, F.st * 0.5), 2.6 * u, { seed: 1501 + k, t0: 1, t1: 1 });
      g.restore();
    }
  }

  // ---- statements: the moon, the birds, a growing branch ------------------------------------------------
  function moon(g, F, x, y, r, q, lt, kind) {
    const { u } = F;
    for (let k = 0; k < 3; k++) {
      const ph = fract(lt * 0.28 + k / 3), w = 6.5 * u * (1 - ph) * clamp(q * 2);
      if (w > 0.6 * u) ringCarve(g, F, x, y, r * (1.14 + ph * 0.8), w, { seed: 1600 + k });
    }
    if (q <= 0) return;
    const s = back(q), rr = r * s;
    knock(g, circle(x, y, rr * 1.07), 0);
    reg(g, F, q, () => { circle(x, y, rr)(g); g.fillStyle = C.red; g.fill(); });
    g.save(); circle(x, y, rr)(g); g.clip();
    if (kind === "crescent") {
      for (let k = 0; k < 4; k++) carve(g, arc(x, y, rr * (0.9 - k * 0.085), rr * (0.9 - k * 0.085), Math.PI * 0.35, Math.PI * 1.35, F.st * 0.6), (4.4 - k * 0.8) * u, { seed: 1610 + k });
      const ox = x + rr * 0.36, oy = y - rr * 0.2;
      circle(ox, oy, rr * 0.86)(g); g.fillStyle = C.field; g.fill();
      for (let k = 0; k < 3; k++) { const a = 0.6 + k * 1.1 + lt * 0.05; ringCarve(g, F, ox + Math.cos(a) * rr * 0.4, oy + Math.sin(a) * rr * 0.4, rr * (0.07 + k * 0.025), 2.4 * u, { seed: 1620 + k }); }
    } else {
      for (let k = 0; k < 9; k++) {
        const yy = y - rr * 0.15 + k * rr * 0.14 + fract(lt * 0.15) * rr * 0.14;
        carve(g, seg(x - rr, yy, x + rr, yy, F.st), (1.6 + 1.1 * k) * u, { seed: 1630 + k, t0: 0, t1: 0 });
      }
      for (let k = 0; k < 3; k++) ringCarve(g, F, x - rr * 0.35 + k * rr * 0.3, y - rr * 0.45 + (k % 2) * rr * 0.2, rr * (0.08 + k * 0.03), 2.6 * u, { seed: 1640 + k });
    }
    g.restore();
  }
  function branch(g, F, x0, y0, x1, y1, q, lt, flip) {
    const { u } = F, sway = Math.sin(lt * 1.1) * 0.03;
    g.save(); g.translate(x0, y0); g.rotate(sway * (flip ? -1 : 1)); g.translate(-x0, -y0);
    const mx = lerp(x0, x1, 0.15), my = lerp(y0, y1, 0.75), stem = quad(x0, y0, mx, my, x1, y1, F.st);
    carve(g, stem, 11 * u, { q, seed: 1700, t0: 0.4, t1: 3 });
    for (let k = 0; k < 9; k++) {
      const f = 0.14 + k * 0.095;
      const lq = back(span(q, f, f + 0.18));
      if (lq <= 0) continue;
      const [lx, ly, a] = along(stem, f), side = k % 2 ? 1 : -1, la = a + side * (0.95 + Math.sin(lt * 1.7 + k) * 0.08);
      const L = (54 + 18 * hash(k, 1)) * u * lq, W2 = L * 0.36;
      g.save(); g.translate(lx, ly); g.rotate(la);
      const leaf = (gg) => { gg.beginPath(); gg.moveTo(0, 0); gg.quadraticCurveTo(L * 0.5, -W2, L, 0); gg.quadraticCurveTo(L * 0.5, W2, 0, 0); };
      knock(g, leaf, 8 * u);
      if (k % 3 === 1) reg(g, F, lq, () => { leaf(g); g.fillStyle = C.red; g.fill(); });
      carve(g, chain(quad(0, 0, L * 0.5, -W2, L, 0, F.st * 0.5), quad(L, 0, L * 0.5, W2, 0, 0, F.st * 0.5)), 3.4 * u, { t0: 0, t1: 0, seed: 1710 + k, color: k % 3 === 1 ? C.field : C.cut });
      carve(g, seg(L * 0.08, 0, L * 0.8, 0, F.st * 0.4), 2.4 * u, { seed: 1720 + k, color: k % 3 === 1 ? C.onRed : C.cut });
      g.restore();
    }
    for (let k = 0; k < 3; k++) {
      const bq = back(span(q, 0.7 + k * 0.08, 0.9 + k * 0.08));
      if (bq <= 0) continue;
      const [bx, by] = along(stem, 0.55 + k * 0.17), r = 13 * u * bq, yy = by - 26 * u + Math.sin(lt * 2.4 + k) * 3 * u;
      knock(g, circle(bx + 18 * u, yy, r * 1.3), 0);
      circle(bx + 18 * u, yy, r)(g); g.fillStyle = C.red; g.fill();
      carve(g, arc(bx + 18 * u, yy, r * 0.55, r * 0.55, 3.6, 4.8, F.st * 0.2), 2.4 * u, { seed: 1730 + k, color: C.onRed });
    }
    g.restore();
  }
  const zoneBottom = (zones, H) => (zones.length ? Math.max(...zones.map((z) => z.y + z.h)) : H * 0.6);
  function titleBack(g, F, local, zones) {
    const { W, u, tall } = F;
    moon(g, F, tall ? W - 250 * u : W - 330 * u, tall ? 330 * u : 250 * u, tall ? 130 * u : 150 * u, span(local, 0.05, 0.85), local, "crescent");
  }
  // A strip of film, carved: rails, sprocket holes and frames, scrolled by `off`, between x0 and x1.
  function filmStrip(g, F, x0, x1, y, hh, off, seed) {
    const { u } = F;
    if (x1 - x0 < 2) return;
    knock(g, (gg) => { gg.beginPath(); gg.rect(x0, y - hh / 2, x1 - x0, hh); }, 12 * u);
    g.save(); g.beginPath(); g.rect(x0, y - hh / 2 - 10 * u, x1 - x0, hh + 20 * u); g.clip();
    const pitch = 128 * u, sp = 30 * u;
    for (let x = x0 - (((off % pitch) + pitch) % pitch); x < x1; x += pitch) {
      const k = Math.round((x + off) / pitch), fx = x + 10 * u, fw = pitch - 20 * u, fy = y - hh * 0.3, fh = hh * 0.6;
      if (k % 3 === 1) { g.fillStyle = C.red; g.fillRect(fx + 2 * u, fy + 2 * u, fw, fh); }
      carve(g, rrPts(fx, fy, fw, fh, 4 * u, F.st), 3.2 * u, { seed: seed + k, t0: 0, t1: 0 });
      const hc = k % 3 === 1 ? C.field : C.cut;
      carve(g, [[fx + fw * 0.12, fy + fh * 0.8], [fx + fw * 0.35, fy + fh * 0.42], [fx + fw * 0.5, fy + fh * 0.62], [fx + fw * 0.68, fy + fh * 0.36], [fx + fw * 0.9, fy + fh * 0.8]].reduce((acc, pt, j, arr) => (j ? chain(acc, seg(arr[j - 1][0], arr[j - 1][1], pt[0], pt[1], F.st * 0.4)) : acc), [[fx + fw * 0.12, fy + fh * 0.8]]), 3 * u, { seed: seed + 50 + k, color: hc, t0: 0.5, t1: 0.5 });
      if (k % 2) { g.beginPath(); g.arc(fx + fw * 0.76, fy + fh * 0.26, fh * 0.1, 0, TAU); g.fillStyle = hc; g.fill(); }
    }
    for (let x = x0 - (((off % sp) + sp) % sp); x < x1; x += sp) for (const yy of [y - hh / 2 + 6 * u, y + hh / 2 - 16 * u]) { g.fillStyle = C.cut; g.beginPath(); g.roundRect(x + 9 * u, yy, 12 * u, 10 * u, 2 * u); g.fill(); }
    g.restore();
    carve(g, seg(x0, y - hh / 2, x1, y - hh / 2, F.st * 2), 4 * u, { seed: seed + 90, t0: 0, t1: 0 });
    carve(g, seg(x0, y + hh / 2, x1, y + hh / 2, F.st * 2), 4 * u, { seed: seed + 91, t0: 0, t1: 0 });
  }
  // Carved shears: dark blades with a bevel cut, red handle loops, opening on `open` radians.
  function shears(g, F, px, py, ang, open, len) {
    const { u } = F;
    for (const sgn of [-1, 1]) { // Handles first, so the blades lie over them.
      const ha = ang + Math.PI + sgn * open * 0.5, hx = px + Math.cos(ha) * len * 0.62, hy = py + Math.sin(ha) * len * 0.62, R = len * 0.2;
      carve(g, seg(px, py, hx - Math.cos(ha) * R * 0.8, hy - Math.sin(ha) * R * 0.8, F.st * 0.5), 26 * u, { seed: 1800 + sgn, t0: 0, t1: 0, color: C.field, jit: 0.05 });
      carve(g, seg(px, py, hx - Math.cos(ha) * R * 0.8, hy - Math.sin(ha) * R * 0.8, F.st * 0.5), 5 * u, { seed: 1802 + sgn, t0: 1, t1: 1 });
      knock(g, circle(hx, hy, R * 1.15), 10 * u);
      g.save(); g.beginPath(); g.arc(hx, hy, R, 0, TAU); g.arc(hx, hy, R * 0.56, 0, TAU, true); g.translate(2.6 * u, -1.8 * u); g.fillStyle = C.red; g.fill(); g.restore();
      ringCarve(g, F, hx, hy, R * 1.02, 4.4 * u, { seed: 1804 + sgn });
      ringCarve(g, F, hx, hy, R * 0.56, 3.4 * u, { seed: 1806 + sgn });
      ringCarve(g, F, hx, hy, R * 0.78, 2.2 * u, { seed: 1808 + sgn, color: C.onRed });
    }
    for (const sgn of [-1, 1]) {
      const a = ang + sgn * open * 0.5, ca = Math.cos(a), sa = Math.sin(a), P = (d, n) => [px + ca * d - sa * n * sgn, py + sa * d + ca * n * sgn];
      const pts = [P(-14 * u, -16 * u), P(len * 0.9, -5 * u), P(len, 0), P(len * 0.55, 15 * u), P(-14 * u, 18 * u)];
      knock(g, (gg) => { gg.beginPath(); pts.forEach(([x, y], k) => (k ? gg.lineTo(x, y) : gg.moveTo(x, y))); gg.closePath(); }, 10 * u);
      carve(g, chain(...pts.map((pt, k) => seg(pt[0], pt[1], pts[(k + 1) % pts.length][0], pts[(k + 1) % pts.length][1], F.st * 0.5))), 3.6 * u, { seed: 1810 + sgn, t0: 0, t1: 0 });
      carve(g, seg(...P(len * 0.08, 4 * u), ...P(len * 0.84, 2 * u), F.st * 0.5), 3 * u, { seed: 1812 + sgn, t0: 1, t1: 3 });
      for (let k = 0; k < 4; k++) carve(g, seg(...P(len * (0.18 + k * 0.14), 8 * u), ...P(len * (0.24 + k * 0.14), 13 * u), F.st * 0.2), 2.4 * u, { seed: 1814 + k + sgn * 5, t0: 0.4, t1: 0.4 });
    }
    knock(g, circle(px, py, 15 * u), 0);
    ringCarve(g, F, px, py, 13 * u, 3.6 * u, { seed: 1820 });
    carve(g, seg(px - 7 * u, py, px + 7 * u, py, F.st * 0.2), 3 * u, { seed: 1821, t0: 0.4, t1: 0.4 });
  }
  // The title's cutting bench: film scrolls in from the right, the shears snip it, and each cut frame falls away.
  function cuttingBench(g, F, local, zones, q) {
    const { W, H, u, tall } = F, zb = zoneBottom(zones, H);
    const y = clamp(Math.max(zb + (tall ? 360 : 150) * u, H * (tall ? 0.74 : 0.7)), 0, H - (tall ? 280 : 210) * u);
    // Place the bench (and size the shears) so the shears' whole reach stays clear of the headline.
    const hits = (bx, sc) => {
      const px = bx + 30 * u * sc, py = y - 147 * u * sc, box = { x: px - 110 * u * sc, y: py - 215 * u * sc, w: 250 * u * sc, h: y - py + 215 * u * sc };
      return zones.some((z) => box.x < z.x + z.w + 24 * u && box.x + box.w > z.x - 24 * u && box.y < z.y + z.h + 24 * u && box.y + box.h > z.y - 24 * u);
    };
    let bx = tall ? W * 0.42 : W * 0.6, sc = 1;
    search: for (const s of [1, 0.86, 0.72, 0.6]) for (let f = tall ? 0.42 : 0.6; f <= (tall ? 0.72 : 0.86); f += 0.02) if (!hits(W * f, s)) { bx = W * f; sc = s; break search; }
    const hh = 92 * u, v = 120 * u, T = 1.7;
    const enter = (1 - ease(q)) * (W - bx + 60 * u);
    const ph = fract(local / T), cyc = Math.floor(local / T), off = local * v;
    if (F.S.piece) F.S.piece("film");
    filmStrip(g, F, bx + enter, W + 40 * u, y, hh, off, 1900);
    if (q >= 1) {
      filmStrip(g, F, bx - v * T * ph, bx, y, hh, off, 1900);
      if (cyc > 0 || local > T) { // The frame cut on the last snip, tumbling down.
        const tau = ph * T, Lp = v * T, fx = bx - Lp / 2 - tau * 40 * u, fy = y + tau * tau * 330 * u, rot = -tau * 1.4;
        if (fy < H + 200 * u) { if (F.S.piece) F.S.piece("offcut"); g.save(); g.translate(fx, fy); g.rotate(rot); g.translate(-fx, -y); filmStrip(g, F, bx - Lp, bx, y, hh, cyc * T * v, 1900); g.restore(); }
      }
    }
    const open = q < 1 ? 0.5 : ph < 0.78 ? lerp(0.06, 0.62, ease(ph / 0.78)) : lerp(0.62, 0.06, ease((ph - 0.78) / 0.22));
    const ang = Math.PI / 2 + 0.2, d = 150 * u * sc, len = 250 * u * sc;
    const px = bx - Math.cos(ang) * d + (1 - ease(q)) * 420 * u, py = y - Math.sin(ang) * d;
    if (F.S.piece) F.S.piece("shears");
    g.save(); g.globalAlpha *= clamp(q * 3);
    shears(g, F, px, py, ang, open, len);
    g.restore();
  }
  function titleFront(g, F, local, zones) {
    const { u, tall } = F;
    birds(g, F, local + 3, tall ? 160 * u : 100 * u, tall ? 520 * u : 300 * u, 4, 31, zones);
    cuttingBench(g, F, local, zones, span(local, 0.1, 1.0));
  }
  function closingBack(g, F, local, hold, zones) {
    const { W, H, u, tall } = F;
    const rise = ease(span(local, 0, hold));
    if (F.S.piece) F.S.piece("moon");
    moon(g, F, tall ? W - 230 * u : W - 340 * u, H - (tall ? 300 : 210) * u - rise * 50 * u, tall ? 140 * u : 160 * u, span(local, 0.05, 0.9), local, "full");
  }
  function closingFront(g, F, local, hold, zones) {
    const { W, H, u, tall } = F, zb = zoneBottom(zones, H);
    const low = H - (tall ? 200 : 150) * u, top = Math.max(zb + 50 * u, low - 380 * u);
    if (F.S.piece) F.S.piece("branch");
    if (low - top > 100 * u) branch(g, F, -10 * u, H - 40 * u, W * (tall ? 0.48 : 0.3), top, span(local, 0.1, 1.6), local, false);
    birds(g, F, local + 11, tall ? 160 * u : 80 * u, tall ? 480 * u : 240 * u, 3, 47, zones);
  }

  // ---- the plan, the layout and the frame --------------------------------------------------------------
  const DRAW = { chart, object, people, process, compare };
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  let planCache = null, planKey = "";
  function controls() {
    if (window.__dreamcut && window.__dreamcut.controls) return window.__dreamcut.controls;
    try { if (typeof dc !== "undefined" && dc && dc.controls) return dc.controls; } catch (e) { /* not on this page */ }
    return null;
  }
  function planOf(F) {
    const c = controls();
    if (!c) return null;
    const key = `${F.W}x${F.H}`;
    if (planCache && planKey === key) return planCache;
    let t = 0;
    const shown = [];
    for (const id of ORDER) { const hold = Number(c[`${id}_hold`]) || 0; if (hold > 0) shown.push({ id, start: t, hold }); t += hold; }
    if (!shown.length) return null;
    const data = {
      chart: { labels: [c.bar_1_label, c.bar_2_label, c.bar_3_label, c.bar_4_label], values: [c.bar_1, c.bar_2, c.bar_3, c.bar_4], suffix: c.chart_suffix, prefix: "", highlight: Number(c.highlight) - 1 },
      object: { kind: c.device, callouts: [c.callout_1, c.callout_2, c.callout_3] },
      people: { count: c.people_count, badges: [c.badge_1, c.badge_2, c.badge_3], highlight: 1 },
      process: { steps: [c.step_1, c.step_2, c.step_3] },
      compare: { left: c.before_label, leftValue: c.before_value, right: c.after_label, rightValue: c.after_value, suffix: c.compare_suffix, prefix: "" },
    };
    planKey = key;
    return (planCache = { shown, data, change: Number(c.change) || 0.45, length: t });
  }
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
    return (lineCache[id] = out);
  }
  function zonesOf(F, id) {
    const { u } = F, out = [];
    for (const h of HEADS[id] || []) for (const l of headLines(h)) out.push({ x: l.x - (h === "kicker" ? 40 : 28) * u, y: l.y - (h === "kicker" ? 16 : 6) * u, w: l.w + (h === "kicker" ? 80 : 56) * u, h: l.h + (h === "kicker" ? 32 : 12) * u });
    return out;
  }
  function areaOf(F, id) {
    const { W, H, u, tall } = F, side = (tall ? 90 : 140) * u, lines = headLines(`${id}-title`);
    const bottom = lines.length ? Math.max(...lines.map((l) => l.y + l.h)) : H * (tall ? 0.3 : 0.34) - 64 * u;
    const top = Math.max(bottom + (tall ? 70 : 60) * u, H * 0.2);
    return { x: side, y: top, w: W - side * 2, h: H - (tall ? 175 : 140) * u - top };
  }
  // Statement art is its scene's piece when the graphic is split; the block around it stays the world.
  function art(F, id, draw) {
    const S = F.S;
    if (S.pieceScope) S.pieceScope(id);
    draw();
    if (S.pieceScope) S.pieceScope("world");
  }
  // One scene's print: the block's sky and hills, then its carving.
  function station(g, F, id, local, hold, zones) {
    const paint = Boolean(F.S.paint), A = DRAW[id] ? areaOf(F, id) : null;
    // The carving starts under the brayer, so a print is already half cut when it is revealed.
    if (F.plan) local += clamp(F.plan.change, 0.32, 0.9) + 0.55;
    if (paint) { g.fillStyle = C.field; g.fillRect(0, 0, F.W, F.H); sky(g, F, zones, F.t, A); }
    if (id === "title") art(F, id, () => titleBack(g, F, local, zones));
    if (id === "closing") art(F, id, () => closingBack(g, F, local, hold, zones));
    if (paint) hills(g, F, F.t);
    if (DRAW[id]) {
      const p = clamp(local / Math.min(2.6, Math.max(1, hold * 0.65)));
      DRAW[id](g, F, A, p, F.plan ? F.plan.data[id] : F.fallback, local);
    } else if (id === "title") art(F, id, () => titleFront(g, F, local, zones));
    else if (id === "closing") art(F, id, () => closingFront(g, F, local, hold, zones));
  }
  function transition(F) {
    const P = F.plan, t = F.t;
    const A = clamp(P.change, 0.32, 0.9), B = A * 0.9;
    for (let k = 1; k < P.shown.length; k++) {
      const T = P.shown[k].start;
      if (t >= T - A && t < T + B) { const m = inout((t - (T - A)) / (A + B)); return { a: P.shown[k - 1], b: P.shown[k], m, rx: lerp(-90 * F.u, F.W + 90 * F.u, m), dur: A + B }; }
    }
    return null;
  }
  let frame = null;
  function makeFrame(S, info) {
    const look = S.look;
    C = { field: look.bg, cut: look.ink, red: S.accent, onRed: look.onAccent, paper: look.paper || look.ink, roll: look.roll || look.bg };
    const F = { S, W: S.W, H: S.H, u: S.u, tall: S.tall, info, t: info.t, st: 7 * S.u };
    F.plan = planOf(F);
    return F;
  }
  function render(ctx, F) {
    const P = F.plan, t = F.t, paint = Boolean(F.S.paint);
    const tr = transition(F);
    if (!tr) {
      let st = P.shown.find((s) => t >= s.start && t < s.start + s.hold);
      if (!st) st = t <= 0 ? P.shown[0] : P.shown[P.shown.length - 1];
      station(ctx, F, st.id, t - st.start, st.hold, zonesOf(F, st.id));
    } else {
      const zones = [...zonesOf(F, tr.a.id), ...zonesOf(F, tr.b.id)];
      ctx.save(); ctx.beginPath(); ctx.rect(tr.rx, 0, F.W - tr.rx + 10, F.H); ctx.clip();
      station(ctx, F, tr.a.id, t - tr.a.start, tr.a.hold, zones);
      ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(-10, 0, tr.rx + 10, F.H); ctx.clip();
      station(ctx, F, tr.b.id, t - tr.b.start, tr.b.hold, zones);
      ctx.restore();
    }
    if (paint) finish(ctx, F);
    if (tr) roller(ctx, F, tr.rx, tr.m, tr.dur);
  }
  // Without the template's controls (another page), each scene draws itself into the template's box.
  const scene = (id) => (ctx, S, box, p, d, info) => {
    const F = frame;
    if (!F || F.plan || F.info.scene !== id) return;
    DRAW[id](ctx, F, areaOf(F, id), p, d, info ? info.local : 0);
    if (S.paint) finish(ctx, F);
  };

  const SALT = (tex) => "url(\"data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='s' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='29' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -13 0 0 0 ${(8.3 + (1 - tex) * 6).toFixed(2)}'/></filter><rect width='100%' height='100%' filter='url(#s)'/></svg>`) + "\")";

  return {
    bg: "#1c1815", panel: "#1c1815", ink: "#efe4cc", muted: "#c9b998", accent: "#d0472c", onAccent: "#f4ead3",
    rule: "rgba(239,228,204,0.75)", track: "rgba(239,228,204,0.14)",
    display: DISP, displayWeight: 700, displayCase: "uppercase", displayTracking: "0.02em",
    body: LAB, bodyWeight: 700, figures: DISP, radius: 4, motion: "wipe", change: "grid",
    kit: { line: 3.4, fill: "solid", panel: "fill" }, panelEdge: "rgba(239,228,204,0.8)",
    paper: "#ebdfc5", roll: "#2e2722",
    keepArt: true,
    overlap: true,
    palettes: {
      // Positive: black cuts on cream stock. Midnight: a deeper block, oxblood reduction. Mono: one black block, a grey reduction.
      light: { bg: "#ece2cc", panel: "#ece2cc", ink: "#1e1a17", muted: "#5f5548", accent: "#c4422a", onAccent: "#f6efe0", rule: "rgba(30,26,23,0.7)", track: "rgba(30,26,23,0.1)", panelEdge: "rgba(30,26,23,0.6)", paper: "#f6f0e2", roll: "#d8ccb3" },
      dark: { bg: "#0e0c0b", panel: "#0e0c0b", ink: "#d8c9ab", muted: "#a8987a", accent: "#a33520", onAccent: "#ecdfc5", rule: "rgba(216,201,171,0.7)", track: "rgba(216,201,171,0.12)", paper: "#d2c3a4", roll: "#211c19" },
      mono: { bg: "#1a1a19", panel: "#1a1a19", ink: "#ece8de", muted: "#b3aea3", accent: "#9c978d", onAccent: "#161615", rule: "rgba(236,232,222,0.7)", track: "rgba(236,232,222,0.12)", paper: "#e6e1d5", roll: "#2a2a28" },
    },
    textShadow: () => "none",
    backdrop: (accent, texture, look) => (look ? look.bg : "#1c1815"),
    // Headlines print with salty ink; the kicker is a red reduction label.
    css: (accent, look) => {
      const tex = look.texture ?? 1, salt = SALT(tex);
      const mask = tex > 0.04 ? `-webkit-mask-image: ${salt}; mask-image: ${salt}; -webkit-mask-size: 300px 300px; mask-size: 300px 300px;` : "";
      return `#root .display { ${mask} }
        #title-scene .kicker { font-size: 44px !important; align-self: flex-start; background: ${accent}; color: ${look.onAccent}; padding: 0.36em 0.95em 0.24em; letter-spacing: 0.22em;
          text-shadow: none; font-family: ${LAB}; font-weight: 700; transform: rotate(-1.2deg); ${mask} }`;
    },
    // The block is drawn by the stage; this pass only marks the backdrop as on.
    paint: (ctx, W, H) => { ctx.clearRect(0, 0, W, H); },
    stage(ctx, S, info) {
      const F = (frame = makeFrame(S, info));
      if (F.plan) { render(ctx, F); return; }
      // Fallback without the plan: the current scene's block, its statement art, and the scene drawer adds the rest.
      const id = info.scene || "title";
      if (S.paint) { ctx.fillStyle = C.field; ctx.fillRect(0, 0, F.W, F.H); sky(ctx, F, zonesOf(F, id), F.t, DRAW[id] ? areaOf(F, id) : null); hills(ctx, F, F.t); }
      if (id === "title") art(F, id, () => { titleBack(ctx, F, info.local, zonesOf(F, id)); titleFront(ctx, F, info.local, zonesOf(F, id)); });
      if (id === "closing") art(F, id, () => { closingBack(ctx, F, info.local, info.hold, zonesOf(F, id)); closingFront(ctx, F, info.local, info.hold, zonesOf(F, id)); });
      if (!DRAW[id] && S.paint) finish(ctx, F);
    },
    scenes: { chart: scene("chart"), object: scene("object"), people: scene("people"), process: scene("process"), compare: scene("compare") },
  };
});
