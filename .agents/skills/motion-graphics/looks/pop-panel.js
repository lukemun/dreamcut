// Pop Panel: a printed comic page. Every scene is one inked panel on cream newsprint: flat primaries
// laid down slightly off register, Ben-Day dot fields that drift and swell, thick tapering brush
// outlines, lettered caption boxes, speech balloons and block-letter sound effects. A small original
// cast (an editor with a blunt bob, their crew, and a walking clapperboard) acts out each idea. The
// reader's eye slides panel to panel across the page. All art is original; frames are pure functions
// of time (seeded noise only, no clocks).
window.DreamcutMotion.register("pop-panel", ({ rng }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const seg = (v, a, b) => clamp((v - a) / (b - a));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const lerp = (a, b, k) => a + (b - a) * k;
  const LET = "'Avenir Next Condensed', 'Futura', 'Helvetica Neue', 'Arial Narrow', sans-serif";
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];

  // ---- colour ----------------------------------------------------------------------------------------
  function rgb(value) {
    const s = String(value || "#000");
    if (s[0] === "#") {
      const h = s.length === 4 ? s.slice(1).split("").map((c) => c + c).join("") : s.slice(1, 7);
      const n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const m = s.match(/rgba?\(([^)]+)\)/);
    return m ? m[1].split(",").slice(0, 3).map(Number) : [0, 0, 0];
  }
  const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mix = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;

  let T = null; // the frame's palette and scale, set by the stage
  let REG = [0, 0]; // colour plates print slightly off the ink plate

  function theme(S) {
    const pop = S.look.pop;
    const c = (k) => rgb(pop[k]);
    const th = {
      u: S.u, tex: S.look.texture ?? 1, W: S.W, H: S.H, tall: S.tall, square: !S.tall && S.W < S.H * 1.25,
      paper: c("paper"), page: c("page"), ink: c("ink"), white: c("white"), yellow: c("yellow"), blue: c("blue"), cyan: c("cyan"),
      pink: c("pink"), orange: c("orange"), green: c("green"), grey: c("grey"), red: rgb(S.accent), mono: Boolean(pop.mono),
      hair: { black: c("hairBlack"), brown: c("hairBrown"), red: c("hairRed"), blond: c("hairBlond") },
      skins: pop.skins.map(([a, b]) => [rgb(a), rgb(b)]),
    };
    th.shade = (col, k = 0.38) => mix(col, th.ink, k);
    th.tint = (col, k = 0.6) => mix(col, th.white, k);
    return th;
  }

  // ---- controls and the scene plan -----------------------------------------------------------------
  function controls() {
    if (window.__dreamcut && window.__dreamcut.controls) return window.__dreamcut.controls;
    try { if (typeof dc !== "undefined" && dc && dc.controls) return dc.controls; } catch (e) { /* not on this page */ }
    return null;
  }
  let planCache = null;
  function plan() {
    if (planCache) return planCache;
    const c = controls();
    if (!c) return null;
    let t = 0;
    const shown = [];
    for (const id of ORDER) { const hold = Number(c[`${id}_hold`]) || 0; if (hold > 0) shown.push({ id, start: t, hold }); t += hold; }
    return (planCache = { shown, c });
  }
  const HEAD = { title: "title", kicker: "kicker", chart: "chart_title", object: "object_title", people: "people_title", process: "process_title", compare: "compare_title", closing: "closing" };
  const DOM = { title: "title", kicker: "kicker", chart: "chart-title", object: "object-title", people: "people-title", process: "process-title", compare: "compare-title", closing: "closing" };
  function words(id) {
    const P = plan();
    if (P && P.c[HEAD[id]] !== undefined) return String(P.c[HEAD[id]] ?? "");
    const el = document.getElementById(DOM[id]);
    return el ? el.textContent || "" : "";
  }

  // ---- point lists ---------------------------------------------------------------------------------
  class Pts {
    constructor() { this.a = []; }
    get last() { return this.a[this.a.length - 1]; }
    M(x, y) { this.a.push([x, y]); return this; }
    L(x, y) { this.a.push([x, y]); return this; }
    Q(cx, cy, x, y, n = 14) {
      const [x0, y0] = this.last;
      for (let i = 1; i <= n; i++) { const k = i / n, m = 1 - k; this.a.push([m * m * x0 + 2 * m * k * cx + k * k * x, m * m * y0 + 2 * m * k * cy + k * k * y]); }
      return this;
    }
    C(ax, ay, bx, by, x, y, n = 18) {
      const [x0, y0] = this.last;
      for (let i = 1; i <= n; i++) {
        const k = i / n, m = 1 - k;
        this.a.push([m * m * m * x0 + 3 * m * m * k * ax + 3 * m * k * k * bx + k * k * k * x, m * m * m * y0 + 3 * m * m * k * ay + 3 * m * k * k * by + k * k * k * y]);
      }
      return this;
    }
    A(cx, cy, rx, ry, a0, a1, n = 24) { for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; this.a.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return this; }
  }
  const P = () => new Pts();
  function ellipse(cx, cy, rx, ry, n = 48, wob = 0, seed = 0) {
    const a = [];
    for (let i = 0; i < n; i++) { const t = (i / n) * TAU, k = 1 + wob * Math.sin(t * 3 + seed) * 0.5 + wob * Math.sin(t * 5 + seed * 2) * 0.5; a.push([cx + Math.cos(t) * rx * k, cy + Math.sin(t) * ry * k]); }
    return a;
  }
  function rrect(x, y, w, h, r, n = 6) {
    r = Math.max(0.01, Math.min(r, w / 2, h / 2));
    const p = P();
    p.A(x + w - r, y + r, r, r, -Math.PI / 2, 0, n).A(x + w - r, y + h - r, r, r, 0, Math.PI / 2, n);
    p.A(x + r, y + h - r, r, r, Math.PI / 2, Math.PI, n).A(x + r, y + r, r, r, Math.PI, Math.PI * 1.5, n);
    return p.a;
  }
  const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  function capsule(x1, y1, x2, y2, r) {
    const a = Math.atan2(y2 - y1, x2 - x1), p = P();
    p.A(x2, y2, r, r, a - Math.PI / 2, a + Math.PI / 2, 10).A(x1, y1, r, r, a + Math.PI / 2, a + Math.PI * 1.5, 10);
    return p.a;
  }
  function star(cx, cy, r1, r2, n, rot = 0, seed = 0) {
    const a = [], R = rng(seed + 7);
    for (let i = 0; i < n * 2; i++) {
      const t = rot + (i / (n * 2)) * TAU, r = i % 2 ? r2 : r1 * (seed ? 0.82 + R() * 0.36 : 1);
      a.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
    }
    return a;
  }
  // Densify straight edges so the brush outline can swell along them.
  function dense(pts, step) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length], d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(d / step));
      for (let k = 0; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
    }
    return out;
  }
  function trace(ctx, pts) { ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); }
  function bbox(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  // ---- printing ------------------------------------------------------------------------------------
  // A flat colour plate, printed a hair off the ink plate.
  function flat(ctx, pts, col, alpha = 1) {
    ctx.save(); ctx.translate(REG[0], REG[1]);
    ctx.beginPath(); trace(ctx, pts); ctx.fillStyle = css(col, alpha); ctx.fill();
    ctx.restore();
  }
  // Ben-Day dots on a 45-degree lattice; r(xn, yn) gives each dot's radius as a share of the pitch.
  function dots(ctx, x, y, w, h, step, col, r, drift = [0, 0], alpha = 1) {
    if (w <= 0 || h <= 0) return;
    const row = step * 0.5, ox = ((drift[0] % step) + step) % step, oy = ((drift[1] % (row * 2)) + row * 2) % (row * 2);
    ctx.save(); ctx.translate(REG[0], REG[1]);
    ctx.beginPath();
    let j = 0;
    for (let yy = y - row * 2 + oy; yy < y + h + row; yy += row, j++) {
      const sh = (j % 2) * step * 0.5;
      for (let xx = x - step + ox + sh; xx < x + w + step; xx += step) {
        const rr = r((xx - x) / w, (yy - y) / h) * step;
        if (rr < 0.35) continue;
        ctx.moveTo(xx + rr, yy); ctx.arc(xx, yy, rr, 0, TAU);
      }
    }
    ctx.fillStyle = css(col, alpha); ctx.fill();
    ctx.restore();
  }
  // Shade inside a shape: dots grow toward the side away from the light (lower right).
  function shadeIn(ctx, pts, col, step, amt = 0.5, base = 0, dir = [0.6, 0.8]) {
    const b = bbox(pts), cx = b.x + b.w / 2, cy = b.y + b.h / 2, R = Math.max(b.w, b.h) / 2 || 1;
    ctx.save(); ctx.beginPath(); trace(ctx, pts); ctx.clip();
    dots(ctx, b.x, b.y, b.w, b.h, step, col, (xn, yn) => {
      const d = ((b.x + xn * b.w - cx) * dir[0] + (b.y + yn * b.h - cy) * dir[1]) / R;
      return clamp(base + amt * clamp(d * 0.9 + 0.15), 0, 0.62);
    });
    ctx.restore();
  }
  function signedArea(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; a += x0 * y1 - x1 * y0; } return a / 2; }
  // A closed brush outline: thin where the light falls, swelling on the shadow side.
  function inkRing(ctx, pts, w, col) {
    const n = pts.length;
    if (n < 3) return;
    const sg = signedArea(pts) > 0 ? 1 : -1, outer = [], inner = [];
    for (let i = 0; i < n; i++) {
      const [ax, ay] = pts[(i - 1 + n) % n], [bx, by] = pts[(i + 1) % n], [x, y] = pts[i];
      let nx = (by - ay) * sg, ny = -(bx - ax) * sg;
      const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
      const k = w * (0.5 + 0.95 * clamp(nx * 0.55 + ny * 0.83));
      outer.push([x + nx * k * 0.62, y + ny * k * 0.62]); inner.push([x - nx * k * 0.38, y - ny * k * 0.38]);
    }
    ctx.beginPath();
    ctx.moveTo(outer[0][0], outer[0][1]); for (let i = 1; i < n; i++) ctx.lineTo(outer[i][0], outer[i][1]); ctx.closePath();
    ctx.moveTo(inner[n - 1][0], inner[n - 1][1]); for (let i = n - 2; i >= 0; i--) ctx.lineTo(inner[i][0], inner[i][1]); ctx.closePath();
    ctx.fillStyle = css(col || T.ink); ctx.fill("nonzero");
  }
  // An open brush stroke that tapers at both ends; q draws only its first part.
  function inkLine(ctx, pts, w, col, q = 1, taper = [0.3, 0.3]) {
    if (q <= 0 || pts.length < 2) return;
    const L = [0];
    for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const tot = L[L.length - 1] || 1, end = tot * q, left = [], right = [];
    for (let i = 0; i < pts.length; i++) {
      if (L[i] > end && i > 0) break;
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
      const s = L[i] / tot, f = Math.min(taper[0] ? s / taper[0] : 1, taper[1] ? (1 - s) / taper[1] : 1, 1);
      const hw = (w / 2) * (0.18 + 0.82 * Math.sin((Math.PI / 2) * clamp(f)));
      left.push([pts[i][0] + nx * hw, pts[i][1] + ny * hw]); right.push([pts[i][0] - nx * hw, pts[i][1] - ny * hw]);
    }
    if (left.length < 2) return;
    ctx.beginPath(); ctx.moveTo(left[0][0], left[0][1]);
    for (let i = 1; i < left.length; i++) ctx.lineTo(left[i][0], left[i][1]);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath(); ctx.fillStyle = css(col || T.ink); ctx.fill();
  }
  // Fill, dot-shade and ink one shape.
  function blob(ctx, pts, col, o = {}) {
    if (col) flat(ctx, pts, col, o.alpha ?? 1);
    if (o.shade !== false && col) shadeIn(ctx, pts, o.shadeCol || T.shade(col, 0.42), o.step || 11 * T.u, o.amt ?? 0.42, o.base ?? 0);
    if (o.ink !== false) inkRing(ctx, o.dense ? dense(pts, o.dense) : pts, o.w ?? 5 * T.u, o.inkCol);
  }
  // Alternating wedges from a point, turning slowly.
  function rays(ctx, cx, cy, n, rot, col, R, alpha = 1) {
    ctx.save(); ctx.translate(REG[0], REG[1]); ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a0 = rot + (i / n) * TAU, a1 = a0 + (TAU / n) * 0.5;
      ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R); ctx.lineTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R); ctx.closePath();
    }
    ctx.fillStyle = css(col, alpha); ctx.fill(); ctx.restore();
  }
  // A fat comic arrow along a curve, filled and inked.
  function fatArrow(ctx, pts, w, col, q = 1) {
    if (q <= 0.02) return;
    const L = [0];
    for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const end = L[L.length - 1] * q, keep = [];
    for (let i = 0; i < pts.length; i++) { if (L[i] <= end) keep.push(pts[i]); else { const k = (end - L[i - 1]) / (L[i] - L[i - 1]); keep.push([lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k)]); break; } }
    if (keep.length < 2) return;
    const head = w * 1.25, tip = keep[keep.length - 1];
    let k = keep.length - 1;
    while (k > 0 && Math.hypot(tip[0] - keep[k][0], tip[1] - keep[k][1]) < head) k--;
    const base = keep[k], ang = Math.atan2(tip[1] - base[1], tip[0] - base[0]);
    const shaft = keep.slice(0, k + 1), left = [], right = [];
    shaft.forEach((p, i) => {
      const a = shaft[Math.max(0, i - 1)], b = shaft[Math.min(shaft.length - 1, i + 1)];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const m = Math.hypot(nx, ny) || 1; nx /= m; ny /= m;
      if (shaft.length === 1) { nx = -Math.sin(ang); ny = Math.cos(ang); }
      const hw = (w / 2) * (0.55 + 0.45 * (i / Math.max(1, shaft.length - 1)));
      left.push([p[0] + nx * hw, p[1] + ny * hw]); right.push([p[0] - nx * hw, p[1] - ny * hw]);
    });
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    const poly = [...left, [base[0] + nx * w, base[1] + ny * w], tip, [base[0] - nx * w, base[1] - ny * w], ...right.reverse()];
    blob(ctx, poly, col, { amt: 0.3, w: 4.5 * T.u });
  }

  // ---- lettering -----------------------------------------------------------------------------------
  const font = (size, kind = "cap") => `${kind === "plain" ? "" : "italic "}${kind === "num" ? 800 : kind === "plain" ? 700 : 800} ${size}px ${LET}`;
  function measure(ctx, s, size, kind) { ctx.font = font(size, kind); return ctx.measureText(s).width; }
  function wrap(ctx, text, size, maxW, kind) {
    const ws = String(text || "").toUpperCase().split(/\s+/).filter(Boolean), lines = [];
    let cur = "";
    for (const w of ws) {
      const tryL = cur ? cur + " " + w : w;
      if (!cur || measure(ctx, tryL, size, kind) <= maxW) cur = tryL; else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  }
  const fitCache = new Map();
  function fit(ctx, text, maxW, maxLines, maxSize, minSize, kind = "cap") {
    const key = [text, maxW | 0, maxLines, maxSize | 0, minSize | 0, kind].join("|");
    if (fitCache.has(key)) return fitCache.get(key);
    let size = maxSize, lines;
    for (;;) {
      lines = wrap(ctx, text, size, maxW, kind);
      const widest = Math.max(...lines.map((l) => measure(ctx, l, size, kind)));
      if ((lines.length <= maxLines && widest <= maxW) || size <= minSize) break;
      size = Math.max(minSize, size * 0.94);
    }
    const widths = lines.map((l) => measure(ctx, l, size, kind));
    const out = { size, lines, widths, w: Math.max(...widths) };
    fitCache.set(key, out);
    return out;
  }
  function say(ctx, s, x, y, size, o = {}) {
    s = String(s ?? "");
    if (o.upper !== false) s = s.toUpperCase();
    ctx.font = font(size, o.kind || "cap");
    let w = ctx.measureText(s).width;
    ctx.save();
    ctx.textAlign = o.align || "center"; ctx.textBaseline = o.base || "middle";
    ctx.translate(x, y);
    if (o.maxW && w > o.maxW) { ctx.scale(o.maxW / w, 1); w = o.maxW; }
    if (o.stroke) { ctx.lineJoin = "round"; ctx.lineWidth = o.stroke; ctx.strokeStyle = css(o.strokeCol || T.ink); ctx.strokeText(s, 0, 0); }
    ctx.fillStyle = css(o.color || T.ink); ctx.fillText(s, 0, 0);
    ctx.restore();
    return w;
  }
  // Block lettering: a hard extruded shadow, a fat ink outline and dot shading in the letters.
  const BLOCK = new Map();
  function blockLine(text, size, fill, depthCol) {
    const key = [text, size | 0, fill.join(), depthCol.join(), T.ink.join()].join("|");
    if (BLOCK.has(key)) return BLOCK.get(key);
    const u = T.u, ol = Math.max(5 * u, size * 0.075), depth = Math.round(size * 0.1), pad = ol + 6 * u;
    const m = document.createElement("canvas").getContext("2d");
    m.font = font(size, "cap");
    const tw = m.measureText(text).width;
    const cw = Math.ceil(tw + pad * 2 + depth + size * 0.2), ch = Math.ceil(size * 1.25 + pad * 2 + depth);
    const c = document.createElement("canvas"); c.width = cw; c.height = ch;
    const g = c.getContext("2d");
    g.font = font(size, "cap"); g.textBaseline = "middle"; g.textAlign = "left"; g.lineJoin = "round";
    const x0 = pad + size * 0.05, y0 = pad + size * 0.62;
    for (let d = depth; d >= 1; d--) {
      g.lineWidth = ol * 2; g.strokeStyle = css(T.ink); g.strokeText(text, x0 + d * 0.75, y0 + d);
      g.fillStyle = css(depthCol); g.fillText(text, x0 + d * 0.75, y0 + d);
    }
    g.lineWidth = ol * 2; g.strokeStyle = css(T.ink); g.strokeText(text, x0, y0);
    // Letter faces with dot shading, built on their own layer so the dots stay inside the letters.
    const f = document.createElement("canvas"); f.width = cw; f.height = ch;
    const fg = f.getContext("2d");
    fg.font = font(size, "cap"); fg.textBaseline = "middle"; fg.textAlign = "left";
    fg.fillStyle = css(fill); fg.fillText(text, x0, y0);
    fg.globalCompositeOperation = "source-atop";
    const save = REG; REG = [0, 0];
    dots(fg, 0, y0 - size * 0.5, cw, size, Math.max(7, size * 0.09), mix(fill, T.ink, 0.28), (xn, yn) => clamp((yn - 0.35) * 0.75, 0, 0.5));
    REG = save;
    fg.fillStyle = "rgba(255,255,255,0.55)"; fg.fillRect(0, y0 - size * 0.42, cw, size * 0.07);
    g.drawImage(f, 0, 0);
    const out = { c, w: cw, h: ch, cx: x0 + tw / 2, cy: y0 };
    BLOCK.set(key, out);
    return out;
  }
  function drawBlock(ctx, b, x, y, sc = 1, rot = 0, alpha = 1) {
    if (sc <= 0.01 || alpha <= 0) return;
    ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc);
    ctx.drawImage(b.c, -b.cx, -b.cy); ctx.restore();
  }
  // A sound effect: block letters that slam in and keep jittering.
  function sfx(ctx, text, x, y, size, rot, k, t, fill, depth) {
    if (k <= 0) return;
    const b = blockLine(text, size, fill || T.yellow, depth || T.red);
    const sc = back(k) * (1 + 0.035 * Math.sin(t * 9 + x));
    drawBlock(ctx, b, x, y, sc, rot + 0.02 * Math.sin(t * 5.3 + y), clamp(k * 4));
  }

  // A caption box: yellow, inked, lettered. Measured first so it never shows empty.
  function capLayout(ctx, text, x, y, maxW, size, min, lines = 3, kind = "cap") {
    const padX = size * 0.42, padY = size * 0.26;
    const f = fit(ctx, text, maxW - padX * 2, lines, size, min, kind), lh = f.size * 1.08;
    return { x, y, w: f.w + padX * 2, h: f.lines.length * lh + padY * 2, f, lh, padX, padY };
  }
  function drawCap(ctx, L, k, o = {}) {
    if (k <= 0) return;
    const u = T.u;
    ctx.save();
    const sc = 0.86 + 0.14 * back(seg(k, 0, 1));
    ctx.translate(L.x + L.w / 2, L.y + L.h / 2); ctx.rotate(o.rot || 0); ctx.scale(sc, sc); ctx.translate(-L.x - L.w / 2, -L.y - L.h / 2);
    ctx.globalAlpha *= clamp(k * 3);
    const box = dense(rect(L.x, L.y, L.w, L.h), 40 * u);
    flat(ctx, box, o.fill || T.yellow);
    if (o.dots !== false) { ctx.save(); ctx.beginPath(); trace(ctx, box); ctx.clip(); dots(ctx, L.x, L.y, L.w, L.h, 9 * u, T.shade(o.fill || T.yellow, 0.18), (xn, yn) => clamp(yn * 0.28, 0, 0.25)); ctx.restore(); }
    inkRing(ctx, box, (o.ink || 5.5) * u);
    L.f.lines.forEach((line, i) => say(ctx, line, L.x + L.padX, L.y + L.padY + L.lh * (i + 0.5) + L.f.size * 0.04, L.f.size, { align: "left", color: o.color || T.ink, maxW: L.w - L.padX * 1.6 }));
    ctx.restore();
  }
  // A speech balloon, rounded or shouting, with a tail to the speaker.
  function balloon(ctx, cx, cy, text, o) {
    const u = T.u, k = o.k ?? 1;
    if (k <= 0) return null;
    const f = o.icon ? null : fit(ctx, text, o.maxW, o.lines || 2, o.size, o.min || 42 * u);
    const lh = f ? f.size * 1.05 : 0;
    const tw = f ? f.w : o.size * 1.4, th = f ? f.lines.length * lh : o.size * 1.4;
    const rx = tw / 2 + (o.spiky ? 70 : 46) * u, ry = th / 2 + (o.spiky ? 56 : 34) * u;
    const pts = [];
    const n = o.spiky ? 22 : 64, R = rng(o.seed || 3);
    const ta = Math.atan2((o.tail[1] - cy) / ry, (o.tail[0] - cx) / rx);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      let da = Math.atan2(Math.sin(a - ta), Math.cos(a - ta));
      if (!o.spiky && Math.abs(da) < 0.2) continue;
      const c = Math.cos(a), s = Math.sin(a);
      const ex = Math.sign(c) * Math.pow(Math.abs(c), 0.78), ey = Math.sign(s) * Math.pow(Math.abs(s), 0.78);
      const rr = o.spiky ? (i % 2 ? 0.86 : 1.12 + R() * 0.12) : 1 + 0.02 * Math.sin(a * 4 + (o.t || 0) * 2);
      pts.push([cx + ex * rx * rr, cy + ey * ry * rr, a]);
    }
    if (!o.spiky) {
      let ins = pts.findIndex((p) => p[2] > ta + 0.2);
      if (ins < 0) ins = 0;
      const base = (a) => [cx + Math.cos(a) * rx * 0.98, cy + Math.sin(a) * ry * 0.98];
      pts.splice(ins, 0, [...base(ta - 0.17), 0], [o.tail[0], o.tail[1], 0], [...base(ta + 0.17), 0]);
    } else {
      // A jagged tail: the nearest spike reaches out to the speaker.
      let best = 0, bd = Infinity;
      pts.forEach((p, i) => { const d = Math.hypot(p[0] - o.tail[0], p[1] - o.tail[1]); if (i % 2 === 0 && d < bd) { bd = d; best = i; } });
      pts[best] = [o.tail[0], o.tail[1], 0];
    }
    const shape = pts.map(([x, y]) => [x, y]);
    const sc = back(k) * (1 + 0.012 * Math.sin((o.t || 0) * 3.1 + cx * 0.01));
    ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
    const fill = o.fill || T.white;
    flat(ctx, shape, fill);
    if (o.spiky) shadeIn(ctx, shape, T.shade(fill, 0.2), 10 * u, 0.28);
    inkRing(ctx, shape, 5 * u);
    if (f) f.lines.forEach((line, i) => say(ctx, line, cx, cy - th / 2 + lh * (i + 0.5) + f.size * 0.04, f.size, { color: o.color || T.ink, maxW: o.maxW }));
    else if (o.icon) icon(ctx, o.icon, cx, cy, o.size, o.t || 0);
    ctx.restore();
    return { rx, ry };
  }
  function icon(ctx, kind, x, y, s, t) {
    const u = T.u;
    if (kind === "heart") {
      const b = 1 + 0.08 * Math.sin(t * 6);
      const p = P().M(x, y + s * 0.42 * b).C(x - s * 0.9 * b, y - s * 0.1, x - s * 0.4 * b, y - s * 0.75 * b, x, y - s * 0.25 * b).C(x + s * 0.4 * b, y - s * 0.75 * b, x + s * 0.9 * b, y - s * 0.1, x, y + s * 0.42 * b).a;
      blob(ctx, p, T.red, { w: 4 * u });
    } else if (kind === "star") {
      blob(ctx, star(x, y, s * 0.55, s * 0.24, 5, -Math.PI / 2 + Math.sin(t * 2) * 0.15), T.yellow, { w: 4 * u });
    } else if (kind === "check") {
      inkLine(ctx, [[x - s * 0.4, y], [x - s * 0.1, y + s * 0.32], [x + s * 0.45, y - s * 0.38]], 16 * u, T.green, 1, [0.1, 0.2]);
    } else if (kind === "bang") {
      inkLine(ctx, [[x, y - s * 0.5], [x, y + s * 0.12]], 18 * u, T.red, 1, [0, 0.5]);
      ctx.beginPath(); ctx.arc(x, y + s * 0.36, 8 * u, 0, TAU); ctx.fillStyle = css(T.red); ctx.fill();
    }
  }
  function sparkle(ctx, x, y, r, k, col) {
    if (k <= 0 || r <= 0) return;
    const s = Math.sin(Math.PI * clamp(k)) * r;
    if (s < 1) return;
    blob(ctx, star(x, y, s, s * 0.28, 4, Math.PI / 4 * k), col || T.white, { shade: false, w: 3 * T.u });
  }

  // ---- the cast --------------------------------------------------------------------------------------
  // Six original people, told apart by hair, colour and props. Index 0 is the editor who leads the story.
  const CAST = [
    { hair: "bob", hc: "black", skin: 0, shirt: "cyan", eye: "blue", lips: true, earring: true },
    { hair: "quiff", hc: "brown", skin: 2, shirt: "yellow", eye: "brown", glasses: true },
    { hair: "puff", hc: "black", skin: 3, shirt: "pink", eye: "brown", lips: true },
    { hair: "beret", hc: "red", skin: 1, shirt: "blue", eye: "green", stripes: true },
    { hair: "long", hc: "blond", skin: 0, shirt: "green", eye: "blue", lips: true },
    { hair: "bun", hc: "brown", skin: 2, shirt: "orange", eye: "brown", glasses: true },
  ];
  const EYES = { blue: [52, 120, 214], brown: [120, 72, 40], green: [60, 150, 90] };
  function headShape(s) {
    const a = [];
    for (let i = 0; i < 56; i++) { const t = (i / 56) * TAU, sn = Math.sin(t); a.push([0.78 * s * Math.cos(t) * (1 - 0.16 * Math.max(0, sn)), 0.95 * s * sn + (sn > 0 ? 0.04 * s * sn : 0)]); }
    return a;
  }
  // A bust standing on `base` (the bottom of the torso). A: t, blink, talk, mood, look, tilt, brow, arm, sweat.
  function person(ctx, x, base, s, sp, A = {}) {
    const u = T.u, w = clamp(0.065 * s, 2.5 * u, 7.5 * u), t = A.t || 0;
    const [skin, skinDot] = T.skins[sp.skin % T.skins.length];
    const hairC = T.hair[sp.hc] || T.hair.black, shirt = A.shirt || T[sp.shirt] || T.blue;
    ctx.save(); ctx.translate(x, base + (A.bob ?? Math.sin(t * 2.4 + x * 0.01) * 0.03 * s));
    // Torso, collar and stripes.
    const neck = rect(-0.3 * s, -1.7 * s, 0.6 * s, 0.5 * s);
    flat(ctx, neck, skin); shadeIn(ctx, neck, skinDot, 8 * u, 0.3, 0.12);
    inkLine(ctx, [[-0.3 * s, -1.7 * s], [-0.3 * s, -1.25 * s]], w, null, 1, [0, 0]);
    inkLine(ctx, [[0.3 * s, -1.7 * s], [0.3 * s, -1.25 * s]], w, null, 1, [0, 0]);
    const torso = P().M(-1.4 * s, 0.4 * s).L(-1.4 * s, 0).C(-1.4 * s, -0.85 * s, -1.08 * s, -1.32 * s, -0.42 * s, -1.38 * s).L(0.42 * s, -1.38 * s).C(1.08 * s, -1.32 * s, 1.4 * s, -0.85 * s, 1.4 * s, 0).L(1.4 * s, 0.4 * s).a;
    flat(ctx, torso, shirt);
    if (sp.stripes) { ctx.save(); ctx.beginPath(); trace(ctx, torso); ctx.clip(); for (let yy = -1.3 * s; yy < 0.4 * s; yy += 0.3 * s) flat(ctx, rect(-1.5 * s, yy, 3 * s, 0.13 * s), T.white); ctx.restore(); }
    shadeIn(ctx, torso, T.shade(shirt, 0.45), 10 * u, 0.5);
    inkRing(ctx, torso, w);
    const collar = [[-0.42 * s, -1.38 * s], [-0.05 * s, -0.98 * s], [0.42 * s, -1.38 * s]];
    flat(ctx, [[-0.32 * s, -1.38 * s], [0, -1.08 * s], [0.32 * s, -1.38 * s]], skin);
    inkLine(ctx, collar, w * 0.9, null, 1, [0.15, 0.15]);
    // Arm (pointing, waving or holding up a sign).
    if (A.arm) arm(ctx, s, skin, skinDot, shirt, A.arm, w);
    // Head.
    ctx.save(); ctx.translate(0, -2.35 * s); ctx.rotate(A.tilt || 0);
    hairBack(ctx, s, sp, hairC, w);
    for (const side of [-1, 1]) { const ear = ellipse(side * 0.76 * s, 0.05 * s, 0.14 * s, 0.2 * s, 18); blob(ctx, ear, skin, { shadeCol: skinDot, w: w * 0.8, amt: 0.3 }); }
    const head = headShape(s);
    flat(ctx, head, skin);
    shadeIn(ctx, head, skinDot, Math.max(6, 9 * u * (s / (110 * u))) , 0.32, 0.16);
    // Blush.
    for (const side of [-1, 1]) flat(ctx, ellipse(side * 0.42 * s, 0.28 * s, 0.14 * s, 0.07 * s, 16), T.tint(T.red, 0.45), 0.55);
    inkRing(ctx, head, w);
    face(ctx, s, sp, A, w, t);
    hairFront(ctx, s, sp, hairC, w, t);
    if (sp.glasses) for (const side of [-1, 1]) { const g = ellipse(side * 0.32 * s, -0.04 * s, 0.24 * s, 0.2 * s, 28); ctx.save(); flat(ctx, g, T.white, 0.25); ctx.restore(); inkRing(ctx, g, w * 0.8); }
    if (sp.glasses) inkLine(ctx, [[-0.09 * s, -0.08 * s], [0.09 * s, -0.08 * s]], w * 0.8, null, 1, [0, 0]);
    if (sp.earring) for (const side of [-1, 1]) blob(ctx, star(side * 0.78 * s, 0.33 * s, 0.13 * s, 0.05 * s, 5, -Math.PI / 2 + Math.sin(t * 3) * 0.3), T.yellow, { w: w * 0.5, shade: false });
    if (A.sweat) { const k = (t * 0.8) % 1; const dy = k * 0.5 * s; const d = P().M(0.62 * s, -0.55 * s + dy).Q(0.78 * s, -0.25 * s + dy, 0.62 * s, -0.18 * s + dy).Q(0.46 * s, -0.25 * s + dy, 0.62 * s, -0.55 * s + dy).a; blob(ctx, d, T.cyan, { w: w * 0.6, shade: false, alpha: 1 - k * 0.6 }); }
    ctx.restore();
    ctx.restore();
  }
  function arm(ctx, s, skin, skinDot, shirt, a, w) {
    const sx = (a.side || 1) * 1.02 * s, sy = -1.12 * s;
    const hx = a.x, hy = a.y;
    const ex = lerp(sx, hx, 0.5) + (a.side || 1) * 0.25 * s, ey = lerp(sy, hy, 0.5) + 0.15 * s;
    const up = capsule(sx, sy, ex, ey, 0.27 * s), lo = capsule(ex, ey, hx, hy, 0.23 * s);
    blob(ctx, up, shirt, { w });
    blob(ctx, lo, shirt, { w });
    const ang = Math.atan2(hy - ey, hx - ex);
    if (a.point) {
      const fx = hx + Math.cos(ang) * 0.38 * s, fy = hy + Math.sin(ang) * 0.38 * s;
      blob(ctx, capsule(hx, hy, fx, fy, 0.075 * s), skin, { shadeCol: skinDot, w: w * 0.7, amt: 0.2 });
    }
    const hand = ellipse(hx, hy, 0.2 * s, 0.17 * s, 20);
    blob(ctx, hand, skin, { shadeCol: skinDot, w: w * 0.8, amt: 0.25 });
    if (a.wave) for (let i = 0; i < 3; i++) { const aa = ang - 0.9 + i * 0.9; inkLine(ctx, [[hx + Math.cos(aa) * 0.32 * s, hy + Math.sin(aa) * 0.32 * s], [hx + Math.cos(aa) * 0.5 * s, hy + Math.sin(aa) * 0.5 * s]], w * 0.8, null, 1, [0.2, 0.4]); }
  }
  function face(ctx, s, sp, A, w, t) {
    const u = T.u;
    const blink = A.blink ?? (((t + sp.skin * 0.7 + (sp.hair.length * 0.37)) % 3.1) < 0.12 ? 1 : 0);
    const lx = (A.look ? A.look[0] : 0) * 0.06 * s, ly = (A.look ? A.look[1] : 0) * 0.04 * s;
    for (const side of [-1, 1]) {
      const ex = side * 0.32 * s, ey = -0.04 * s;
      const open = 1 - blink;
      if (open > 0.1) {
        const white = ellipse(ex, ey, 0.19 * s, 0.13 * s * open, 24);
        flat(ctx, white, T.white);
        ctx.save(); ctx.beginPath(); trace(ctx, white); ctx.clip();
        ctx.beginPath(); ctx.arc(ex + lx, ey + ly, 0.1 * s, 0, TAU); ctx.fillStyle = css(EYES[sp.eye] || EYES.brown); ctx.fill();
        ctx.beginPath(); ctx.arc(ex + lx, ey + ly, 0.05 * s, 0, TAU); ctx.fillStyle = css(T.ink); ctx.fill();
        ctx.beginPath(); ctx.arc(ex + lx - 0.035 * s, ey + ly - 0.035 * s, 0.025 * s, 0, TAU); ctx.fillStyle = "#fff"; ctx.fill();
        ctx.restore();
      }
      // Upper lid line (thick) and lower lid hint.
      const lid = P().A(ex, ey + 0.01 * s, 0.21 * s, 0.15 * s * Math.max(0.15, open), Math.PI * 1.05, Math.PI * 1.95, 14).a;
      inkLine(ctx, lid, w * 1.1, null, 1, [0.2, 0.15]);
      if (sp.lips) inkLine(ctx, [[ex + side * 0.19 * s, ey - 0.05 * s], [ex + side * 0.27 * s, ey - 0.12 * s]], w * 0.6, null, 1, [0, 0.6]);
      // Brows.
      const br = (A.brow || 0) * 0.08 * s, ang = (A.mood ?? 1) < 0 ? side * 0.22 : 0;
      const by = -0.3 * s - br;
      inkLine(ctx, [[ex - 0.18 * s, by + 0.03 * s - ang * 0.2 * s * side], [ex, by - 0.03 * s], [ex + 0.18 * s, by + 0.02 * s + ang * 0.2 * s * side]], w * 1.15, sp.hc === "blond" ? T.shade(T.hair.blond, 0.4) : null, 1, [0.3, 0.4]);
    }
    // Nose.
    inkLine(ctx, [[0.02 * s, 0.02 * s], [0.1 * s, 0.22 * s], [-0.03 * s, 0.26 * s]], w * 0.75, null, 1, [0.4, 0.3]);
    // Mouth: talking, smiling, flat or frowning.
    const my = 0.5 * s, talk = A.talk || 0;
    if (talk > 0.05) {
      const m = ellipse(0, my, 0.17 * s, (0.05 + 0.1 * talk) * s, 24);
      flat(ctx, m, [90, 20, 24]);
      ctx.save(); ctx.beginPath(); trace(ctx, m); ctx.clip(); flat(ctx, ellipse(0.02 * s, my + 0.1 * s, 0.12 * s, 0.07 * s, 16), [226, 96, 104]); ctx.restore();
      inkRing(ctx, m, w * 0.8);
      if (sp.lips) inkRing(ctx, ellipse(0, my, 0.2 * s, (0.07 + 0.1 * talk) * s, 24), w * 0.4, T.red);
    } else {
      const mood = A.mood ?? 1;
      if (mood > 1.5) {
        const g = P().M(-0.22 * s, my - 0.04 * s).Q(0, my + 0.36 * s, 0.22 * s, my - 0.04 * s).a;
        flat(ctx, g, T.white); inkRing(ctx, g, w * 0.8);
      } else {
        const c = mood * 0.12 * s;
        const pts = P().M(-0.2 * s, my - c * 0.4).Q(0, my + c, 0.2 * s, my - c * 0.4).a;
        if (sp.lips) inkLine(ctx, pts, w * 1.6, T.red, 1, [0.2, 0.2]);
        inkLine(ctx, pts, w, null, 1, [0.25, 0.25]);
      }
    }
  }
  function hairBack(ctx, s, sp, col, w) {
    if (sp.hair === "puff") blob(ctx, ellipse(0, -0.5 * s, 1.18 * s, 1.08 * s, 64, 0.06, 2), col, { w, amt: 0.35 });
    else if (sp.hair === "bob") blob(ctx, rrect(-1.0 * s, -1.05 * s, 2.0 * s, 1.55 * s, 0.6 * s), col, { w, amt: 0.35, dense: 20 * T.u });
    else if (sp.hair === "long") {
      const p = P().M(-0.9 * s, -0.7 * s).C(-1.25 * s, 0.2 * s, -0.9 * s, 0.8 * s, -1.2 * s, 1.5 * s).L(1.2 * s, 1.5 * s).C(0.9 * s, 0.8 * s, 1.25 * s, 0.2 * s, 0.9 * s, -0.7 * s).Q(0, -1.35 * s, -0.9 * s, -0.7 * s).a;
      blob(ctx, p, col, { w, amt: 0.3 });
    } else if (sp.hair === "bun") blob(ctx, ellipse(0, -1.12 * s, 0.4 * s, 0.34 * s, 28), col, { w, amt: 0.35 });
  }
  function shine(ctx, pts, w) { inkLine(ctx, pts, w, T.tint(T.blue, 0.35), 1, [0.4, 0.4]); }
  function hairFront(ctx, s, sp, col, w, t) {
    const u = T.u;
    if (sp.hair === "bob") {
      const p = P().M(-0.86 * s, 0.1 * s).C(-0.95 * s, -0.7 * s, -0.6 * s, -1.08 * s, 0, -1.08 * s).C(0.6 * s, -1.08 * s, 0.95 * s, -0.7 * s, 0.86 * s, 0.1 * s).L(0.7 * s, 0.1 * s).L(0.68 * s, -0.42 * s).L(-0.68 * s, -0.42 * s).L(-0.7 * s, 0.1 * s).a;
      blob(ctx, p, col, { w, amt: 0.25 });
      shine(ctx, P().M(-0.5 * s, -0.8 * s).Q(-0.1 * s, -0.98 * s, 0.3 * s, -0.88 * s).a, 0.07 * s);
    } else if (sp.hair === "quiff") {
      const p = P().M(-0.8 * s, -0.05 * s).C(-0.9 * s, -0.9 * s, -0.3 * s, -1.25 * s, 0.35 * s, -1.3 * s).Q(0.9 * s, -1.32 * s, 0.95 * s, -1.0 * s).Q(0.7 * s, -1.05 * s, 0.72 * s, -0.9 * s).Q(0.86 * s, -0.5 * s, 0.8 * s, -0.15 * s).Q(0.55 * s, -0.55 * s, 0.1 * s, -0.62 * s).Q(-0.5 * s, -0.55 * s, -0.66 * s, -0.1 * s).a;
      blob(ctx, p, col, { w, amt: 0.3 });
      inkLine(ctx, P().M(-0.3 * s, -0.8 * s).Q(0.2 * s, -1.12 * s, 0.7 * s, -1.08 * s).a, w * 0.7, null, 1);
    } else if (sp.hair === "puff") {
      const p = P().M(-0.78 * s, -0.25 * s).Q(-0.5 * s, -0.75 * s, 0, -0.72 * s).Q(0.5 * s, -0.75 * s, 0.78 * s, -0.25 * s).L(0.85 * s, -0.9 * s).L(-0.85 * s, -0.9 * s).a;
      blob(ctx, p, col, { w: w * 0.6, amt: 0.35, ink: false });
      inkLine(ctx, P().M(-0.78 * s, -0.25 * s).Q(-0.5 * s, -0.75 * s, 0, -0.72 * s).Q(0.5 * s, -0.75 * s, 0.78 * s, -0.25 * s).a, w, null, 1, [0.1, 0.1]);
    } else if (sp.hair === "beret") {
      const tuft = P().M(-0.78 * s, 0).Q(-0.85 * s, -0.5 * s, -0.55 * s, -0.7 * s).L(0.55 * s, -0.7 * s).Q(0.85 * s, -0.5 * s, 0.78 * s, 0).Q(0.6 * s, -0.4 * s, 0, -0.5 * s).Q(-0.6 * s, -0.4 * s, -0.78 * s, 0).a;
      blob(ctx, tuft, col, { w, amt: 0.3 });
      ctx.save(); ctx.translate(-0.05 * s, -0.86 * s); ctx.rotate(-0.18 + Math.sin(t * 1.7) * 0.03);
      blob(ctx, ellipse(0, 0, 0.98 * s, 0.34 * s, 40), T.red, { w, amt: 0.4 });
      blob(ctx, capsule(0, -0.34 * s, 0, -0.48 * s, 0.06 * s), T.red, { w: w * 0.6, shade: false });
      ctx.restore();
    } else if (sp.hair === "long") {
      const p = P().M(-0.82 * s, 0.2 * s).C(-0.9 * s, -0.8 * s, -0.4 * s, -1.08 * s, 0.02 * s, -1.02 * s).Q(-0.3 * s, -0.6 * s, -0.66 * s, 0.2 * s).a;
      const q = P().M(0.82 * s, 0.2 * s).C(0.9 * s, -0.8 * s, 0.4 * s, -1.08 * s, 0.02 * s, -1.02 * s).Q(0.3 * s, -0.6 * s, 0.66 * s, 0.2 * s).a;
      blob(ctx, p, col, { w, amt: 0.25 }); blob(ctx, q, col, { w, amt: 0.25 });
    } else if (sp.hair === "bun") {
      const p = P().M(-0.8 * s, -0.1 * s).C(-0.85 * s, -0.85 * s, -0.4 * s, -1.0 * s, 0, -1.0 * s).C(0.4 * s, -1.0 * s, 0.85 * s, -0.85 * s, 0.8 * s, -0.1 * s).Q(0.6 * s, -0.62 * s, 0, -0.66 * s).Q(-0.6 * s, -0.62 * s, -0.8 * s, -0.1 * s).a;
      blob(ctx, p, col, { w, amt: 0.3 });
      inkLine(ctx, [[-0.3 * s, -1.0 * s], [0.3 * s, -1.0 * s]], w * 0.8, T.red, 1, [0.1, 0.1]);
    }
  }
  // The walking clapperboard: a slate body with big eyes, stubby legs and a striped clapper that snaps.
  function slate(ctx, x, base, s, A = {}) {
    const u = T.u, w = clamp(0.07 * s, 2.5 * u, 7 * u), t = A.t || 0;
    const body = [26, 28, 36];
    const hop = A.hop ? Math.abs(Math.sin(t * 5)) * 0.16 * s : 0;
    ctx.save(); ctx.translate(x, base - hop);
    // Legs.
    const step = Math.sin(t * 5) * 0.08 * s;
    for (const side of [-1, 1]) {
      inkLine(ctx, [[side * 0.35 * s, -0.25 * s], [side * 0.38 * s + side * step, -0.02 * s]], 0.12 * s, null, 1, [0, 0]);
      blob(ctx, ellipse(side * 0.44 * s + side * step, 0, 0.18 * s, 0.09 * s, 18), T.red, { w: w * 0.7, amt: 0.3 });
    }
    // Arms.
    const arms = A.arms || [[-1.15 * s, -0.75 * s + Math.sin(t * 3) * 0.06 * s], [1.15 * s, -0.75 * s - Math.sin(t * 3) * 0.06 * s]];
    arms.forEach(([hx, hy], i) => {
      const sx = (i ? 1 : -1) * 0.8 * s, sy = -0.72 * s;
      inkLine(ctx, P().M(sx, sy).Q((sx + hx) / 2, Math.min(sy, hy) - 0.18 * s, hx, hy, 10).a, 0.1 * s, null, 1, [0, 0]);
      blob(ctx, ellipse(hx, hy, 0.15 * s, 0.14 * s, 18), T.white, { w: w * 0.7, amt: 0.25 });
    });
    const bp = rrect(-0.8 * s, -1.25 * s, 1.6 * s, 1.05 * s, 0.08 * s, 4);
    flat(ctx, bp, body); inkRing(ctx, dense(bp, 16 * u), w);
    // Chalk lines on the slate.
    for (let i = 0; i < 2; i++) inkLine(ctx, [[-0.6 * s, -0.42 * s + i * 0.14 * s], [(i ? 0.1 : 0.55) * s, -0.42 * s + i * 0.14 * s]], 0.045 * s, [230, 230, 220], 1, [0.1, 0.1]);
    // Eyes and mouth.
    const blink = ((t + 0.9) % 2.7) < 0.12 ? 0.15 : 1;
    for (const side of [-1, 1]) {
      const e = ellipse(side * 0.3 * s, -0.86 * s, 0.19 * s, 0.21 * s * blink, 22);
      flat(ctx, e, T.white); inkRing(ctx, e, w * 0.6);
      if (blink > 0.5) { ctx.beginPath(); ctx.arc(side * 0.3 * s + (A.look ? A.look[0] : 0.4) * 0.07 * s, -0.86 * s + (A.look ? A.look[1] : 0) * 0.06 * s, 0.085 * s, 0, TAU); ctx.fillStyle = css(T.ink); ctx.fill(); }
    }
    const talk = A.talk || 0;
    if (talk > 0.05) { const m = ellipse(0, -0.6 * s, 0.13 * s, 0.05 * s + 0.07 * s * talk, 18); flat(ctx, m, [200, 50, 60]); inkRing(ctx, m, w * 0.5, T.white); }
    else inkLine(ctx, P().M(-0.16 * s, -0.63 * s).Q(0, -0.5 * s, 0.16 * s, -0.63 * s).a, 0.05 * s, T.white, 1, [0.2, 0.2]);
    // The striped band and the hinged clapper on top.
    stripes(ctx, rect(-0.8 * s, -1.42 * s, 1.6 * s, 0.17 * s), -0.8 * s, -1.42 * s, s, w);
    const clap = A.clap ?? 0;
    ctx.save(); ctx.translate(-0.8 * s, -1.44 * s); ctx.rotate(-clap * 0.55);
    stripes(ctx, rect(0, -0.19 * s, 1.62 * s, 0.19 * s), 0, -0.19 * s, s, w);
    ctx.beginPath(); ctx.arc(0, -0.02 * s, 0.05 * s, 0, TAU); ctx.fillStyle = css(T.yellow); ctx.fill();
    ctx.restore();
    ctx.restore();
  }
  function stripes(ctx, pts, x, y, s, w) {
    flat(ctx, pts, T.white);
    ctx.save(); ctx.beginPath(); trace(ctx, pts); ctx.clip();
    for (let i = -1; i < 10; i++) flat(ctx, [[x + i * 0.3 * s, y + 0.2 * s], [x + i * 0.3 * s + 0.15 * s, y + 0.2 * s], [x + i * 0.3 * s + 0.27 * s, y - 0.02 * s], [x + i * 0.3 * s + 0.12 * s, y - 0.02 * s]], T.ink);
    ctx.restore();
    inkRing(ctx, dense(pts, 14 * T.u), w * 0.8);
  }

  // ---- props -----------------------------------------------------------------------------------------
  function filmStrip(ctx, x, y, w, h, t, speed = 60) {
    const u = T.u, fr = h * 1.25, off = ((t * speed * u) % fr + fr) % fr;
    const band = rect(x, y, w, h);
    flat(ctx, band, [32, 30, 38]);
    ctx.save(); ctx.beginPath(); trace(ctx, band); ctx.clip();
    const cols = [T.cyan, T.yellow, T.pink, T.orange, T.green];
    for (let i = -1, k = 0; x + i * fr - off < x + w; i++, k++) {
      const fx = x + i * fr - off + fr * 0.1;
      const cell = rect(fx, y + h * 0.2, fr * 0.8, h * 0.6);
      const c = cols[((i % 5) + 5 + Math.floor(t * speed * u / fr)) % 5];
      flat(ctx, cell, c);
      ctx.beginPath(); ctx.arc(fx + fr * 0.55, y + h * 0.38, h * 0.08, 0, TAU); ctx.fillStyle = css(T.white, 0.9); ctx.fill();
      flat(ctx, [[fx, y + h * 0.8], [fx + fr * 0.3, y + h * 0.5], [fx + fr * 0.55, y + h * 0.8]], T.shade(c, 0.4));
      for (let k2 = 0; k2 < 3; k2++) for (const yy of [y + h * 0.09, y + h * 0.91]) { ctx.fillStyle = css(T.paper); ctx.fillRect(fx + k2 * fr * 0.3, yy - h * 0.035, fr * 0.14, h * 0.07); }
    }
    ctx.restore();
    inkRing(ctx, dense(band, 30 * u), 4.5 * u);
  }
  function cloud(cx, cy, w, h, t) {
    const pts = [], n = 80;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, bump = Math.abs(Math.sin(a * 4.5 + 0.4)) * 0.16 + 0.88;
      pts.push([cx + Math.cos(a) * w * 0.5 * bump, cy + Math.sin(a) * h * 0.5 * bump * (Math.sin(a) > 0 ? 0.8 : 1) + Math.sin(t * 1.4 + a) * 1.5]);
    }
    return pts;
  }

  // ---- the page --------------------------------------------------------------------------------------
  function panelRect() { const m = 26 * T.u; return { x: m, y: m, w: T.W - m * 2, h: T.H - m * 2 }; }
  // Each scene's panel ground: a light plate, slow rays and a drifting, breathing Ben-Day field.
  const GROUNDS = {
    title: { base: "yellow", dot: "red", ray: "orange", focal: [0.5, 0.45] },
    chart: { base: "white", dot: "cyan", ray: null, focal: [0.95, 0.05] },
    object: { base: "white", dot: "pink", ray: "pink", focal: [0.32, 0.5] },
    people: { base: "yellow", dot: "orange", ray: "white", focal: [0.5, 0.1] },
    process: { base: "paper", dot: "blue", ray: null, focal: [0.5, 0.5] },
    compare: { base: "white", dot: "blue", ray: null, focal: [0.5, 0.5] },
    closing: { base: "yellow", dot: "red", ray: "orange", focal: [0.5, 0.42] },
  };
  function ground(ctx, id, B, t, o = {}) {
    const u = T.u, G = GROUNDS[id] || GROUNDS.chart, tex = T.tex;
    const base = G.base === "white" ? T.tint(T[G.dot], 0.86) : G.base === "paper" ? T.paper : T.tint(T[G.base], 0.25);
    flat(ctx, rect(B.x - 10 * u, B.y - 10 * u, B.w + 20 * u, B.h + 20 * u), base);
    const fx = B.x + B.w * (G.focal[0] + 0.04 * Math.sin(t * 0.6)), fy = B.y + B.h * (G.focal[1] + 0.04 * Math.cos(t * 0.5));
    if (G.ray) rays(ctx, fx, fy, 22, t * 0.12, T.tint(T[G.ray], G.ray === "white" ? 0 : 0.35), Math.hypot(B.w, B.h), G.ray === "white" ? 0.45 : 0.5);
    const R = Math.hypot(B.w, B.h) * 0.75;
    const breathe = 0.06 * Math.sin(t * 1.3);
    dots(ctx, B.x, B.y, B.w, B.h, (o.step || 22) * u, T[G.dot], (xn, yn) => {
      const d = Math.hypot(B.x + xn * B.w - fx, B.y + yn * B.h - fy) / R;
      return clamp(0.04 + (d + breathe) * 0.52, 0, 0.46);
    }, [t * 9 * u, t * 4 * u], o.alpha ?? (0.55 + 0.45 * tex));
  }
  // The gutter: cream page between panels, with the faint dot gain of a cheap press.
  function page(ctx, t) {
    const u = T.u;
    ctx.fillStyle = css(T.page); ctx.fillRect(0, 0, T.W, T.H);
  }
  function frame(ctx, B) {
    const u = T.u;
    inkRing(ctx, dense(rect(B.x, B.y, B.w, B.h), 60 * u), 9 * u);
  }

  // ---- per-frame state -------------------------------------------------------------------------------
  const CUR = { index: 0, scene: null, local: 0, change: 0.45, prev: null, k: 1, dir: [1, 0] };
  function panelOffset(entering, exitK) {
    const D = [T.W, T.H];
    if (entering) { const k = CUR.k; return [CUR.dir[0] * D[0] * (1 - k), CUR.dir[1] * D[1] * (1 - k)]; }
    const k = eio(exitK); return [-CUR.dir[0] * D[0] * k, -CUR.dir[1] * D[1] * k];
  }
  // Run one panel: offset for the slide, a small settle on arrival, the ground, the art, then the ink frame.
  function inPanel(ctx, S, id, off, local, fn) {
    const B = panelRect(), u = T.u;
    ctx.save();
    ctx.translate(off[0], off[1]);
    const settle = CUR.index > 0 && off[0] === 0 && off[1] === 0 ? (1 - eo(seg(local, CUR.change, CUR.change + 0.4))) * 0.03 : 0;
    if (settle > 0) { ctx.translate(T.W / 2, T.H / 2); ctx.scale(1 + settle, 1 + settle); ctx.translate(-T.W / 2, -T.H / 2); }
    ctx.save();
    ctx.beginPath(); ctx.rect(B.x, B.y, B.w, B.h); ctx.clip();
    if (S.paint) ground(ctx, id, B, CUR.t);
    fn(B);
    ctx.restore();
    if (S.paint) frame(ctx, B);
    ctx.restore();
  }
  // The headline caption in the panel's top-left corner.
  function headCap(ctx, id, B, local) {
    const u = T.u;
    const maxW = T.tall ? B.w - 60 * u : Math.min(B.w * 0.66, 1250 * u);
    const L = capLayout(ctx, words(id), B.x + 30 * u, B.y + 28 * u, maxW, (T.tall ? 74 : 70) * u, 66 * u, T.tall ? 3 : 2);
    return L;
  }

  // ---- scenes ----------------------------------------------------------------------------------------
  const fmt = (v, target, d) => window.DreamcutMotion.formatNumber(v, Math.abs((Number(target) || 0) % 1) > 0.001 ? 1 : 0, (d && d.prefix) || "", (d && d.suffix) || "");

  function titleScene(ctx, B, local, hold, t) {
    const u = T.u, tall = T.tall;
    const cx = B.x + B.w / 2, cy = B.y + B.h * (tall ? 0.44 : T.square ? 0.36 : 0.44);
    // The cast at the foot of the panel, cheering the title on.
    const s1 = (tall ? 175 : T.square ? 105 : 150) * u;
    const mx = tall ? B.x + B.w * 0.3 : B.x + (T.square ? 190 : 300) * u, mb = B.y + B.h + 0.3 * s1;
    person(ctx, mx, mb, s1, CAST[0], { t, look: [0.6, -1], arm: { side: 1, x: 1.6 * s1, y: -3.2 * s1 + Math.sin(t * 4) * 0.1 * s1, point: true }, mood: 2, brow: 1 });
    const sx = tall ? B.x + B.w * 0.74 : B.x + B.w - (T.square ? 170 : 260) * u, ss = (tall ? 170 : T.square ? 120 : 175) * u;
    const clap = Math.max(0, Math.sin(t * 5.2)) ** 6 > 0.5 ? 0 : 1 - Math.pow(Math.abs(Math.sin(t * 2.6)), 8);
    slate(ctx, sx, B.y + B.h - 40 * u, ss, { t, clap: 0.2 + 0.8 * Math.abs(Math.sin(t * 2.6)) ** 3, hop: true, look: [-0.6, -0.5], arms: [[-1.2 * ss, -1.3 * ss + Math.sin(t * 6) * 0.1 * ss], [1.1 * ss, -0.6 * ss]] });
    if (Math.abs(Math.sin(t * 2.6)) < 0.18 && local > 0.3) sfx(ctx, "SNAP!", sx - 0.2 * ss, B.y + B.h - 40 * u - 2.1 * ss, 54 * u, -0.15, 1, t, T.white, T.red);
    // Title lettering, one block line at a time, then a slow bounce.
    const f = fit(ctx, words("title"), B.w * (tall ? 0.86 : 0.8), tall ? 4 : 3, (tall ? 140 : 150) * u, 70 * u);
    const lh = f.size * 1.08, top = cy - (f.lines.length * lh) / 2;
    const kick = words("kicker");
    if (kick) ribbon(ctx, kick, cx, top - 70 * u, seg(local, 0, 0.3), t);
    f.lines.forEach((line, i) => {
      const k = seg(local, 0.08 + i * 0.12, 0.5 + i * 0.12);
      const b = blockLine(line, f.size, T.yellow, T.red);
      const sc = (0.75 + 0.25 * back(k)) * (1 + 0.012 * Math.sin(t * 2.2 + i));
      drawBlock(ctx, b, cx, top + lh * (i + 0.5), sc, -0.035 + 0.008 * Math.sin(t * 1.6 + i * 1.3), clamp(0.35 + k * 3));
    });
    // Sparkles around the lettering, popping in turn.
    const R = rng(41);
    for (let i = 0; i < 7; i++) {
      const px = cx + (R() - 0.5) * B.w * 0.85, py = top + (R() - 0.3) * f.lines.length * lh * 1.3, ph = R();
      sparkle(ctx, px, py, (26 + R() * 26) * u, ((t * 0.7 + ph) % 1), i % 2 ? T.white : T.cyan);
    }
  }
  function ribbon(ctx, text, cx, cy, k, t) {
    const u = T.u, size = 44 * u;
    const tw = Math.min(measure(ctx, String(text).toUpperCase(), size, "cap"), T.W * 0.7);
    const w = tw + 90 * u, h = 78 * u;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.035 + 0.006 * Math.sin(t * 1.9)); ctx.scale(0.8 + 0.2 * back(k), 0.8 + 0.2 * back(k)); ctx.globalAlpha *= clamp(0.3 + k * 3);
    for (const sd of [-1, 1]) {
      const tail = [[sd * (w / 2 - 20 * u), -h / 2 + 22 * u], [sd * (w / 2 + 70 * u), -h / 2 + 22 * u], [sd * (w / 2 + 40 * u), 22 * u], [sd * (w / 2 + 70 * u), h / 2 + 22 * u], [sd * (w / 2 - 20 * u), h / 2 + 22 * u]];
      blob(ctx, tail, T.shade(T.red, 0.3), { w: 4.5 * u });
    }
    const body = dense(rect(-w / 2, -h / 2, w, h), 30 * u);
    blob(ctx, body, T.red, { w: 5 * u, amt: 0.25 });
    say(ctx, text, 0, 3 * u, size, { color: T.white, maxW: tw });
    ctx.restore();
  }

  function chartScene(ctx, B, local, t, d) {
    const u = T.u, tall = T.tall;
    const cap = headCap(ctx, "chart", B, local);
    const vals = (d.values || []).map((v) => Math.max(0, Number(v) || 0)), n = Math.max(1, vals.length), max = Math.max(...vals, 1);
    const hi = d.highlight >= 0 && d.highlight < n ? d.highlight : -1;
    const top = cap.y + cap.h + 40 * u;
    const C = tall ? { x: B.x + 50 * u, y: top + 610 * u, w: B.w - 100 * u, h: B.y + B.h - 40 * u - (top + 610 * u) }
      : { x: B.x + 60 * u, y: top + 30 * u, w: B.w * (T.square ? 0.56 : 0.62), h: B.y + B.h - 40 * u - top - 30 * u };
    const R = tall ? { x: B.x + 40 * u, y: top, w: B.w - 80 * u, h: 540 * u } : { x: C.x + C.w + 40 * u, y: top - 20 * u, w: B.x + B.w - (C.x + C.w + 40 * u) - 30 * u, h: B.y + B.h - top + 20 * u };
    // Floor: a stage band with the labels.
    const floorY = C.y + C.h - 92 * u;
    const floor = rect(C.x - 40 * u, floorY, C.w + 80 * u, 400 * u);
    flat(ctx, floor, T.yellow); shadeIn(ctx, floor, T.shade(T.yellow, 0.25), 12 * u, 0.3);
    inkLine(ctx, [[C.x - 60 * u, floorY], [C.x + C.w + 60 * u, floorY]], 9 * u, null, 1, [0.05, 0.05]);
    const slot = C.w / n, bw = Math.min(slot * 0.52, 220 * u), dx = bw * 0.24, dy = -bw * 0.17;
    const Hmax = floorY - C.y - 130 * u;
    // A burst behind the winning bar, up before the bars rise so the panel opens full.
    if (hi >= 0) {
      const bk = back(seg(local, 0, 0.35)), hcx = C.x + slot * (hi + 0.5), hcy = floorY - Hmax * 0.62;
      const br = Math.min(slot * 0.95, Hmax * 0.62) * bk * (1 + 0.03 * Math.sin(t * 3.4));
      if (br > 2) {
        rays(ctx, hcx, hcy, 14, -t * 0.22, T.tint(T.yellow, 0.2), br * 1.6, 0.55);
        blob(ctx, star(hcx, hcy, br, br * 0.74, 16, t * 0.08, 9), T.yellow, { amt: 0.3, w: 6 * u });
      }
    }
    // A shout over the shortest bar keeps the open sky busy while the bars climb and hold.
    let lo = 0; vals.forEach((v, i) => { if (v < vals[lo]) lo = i; });
    if (n > 1 && lo !== hi) {
      const word = vals[hi] >= vals[lo] * 2 ? "WOW!" : "UP!";
      const sx = C.x + slot * (lo + 0.5) + (lo === 0 ? 30 * u : 0), sy = floorY - Hmax * (vals[lo] / max) - 230 * u + Math.sin(t * 1.7) * 10 * u;
      sfx(ctx, word, sx, Math.max(C.y + 90 * u, sy), Math.min(110 * u, slot * 0.5), -0.12, seg(local, 0.25, 0.5), t, T.white, T.blue);
      for (let k = 0; k < 4; k++) { const a = -Math.PI * 0.85 + k * 0.38, rr = 120 * u + 14 * u * Math.sin(t * 6 + k); inkLine(ctx, [[sx + Math.cos(a) * rr, Math.max(C.y + 90 * u, sy) + Math.sin(a) * rr * 0.7], [sx + Math.cos(a) * (rr + 50 * u), Math.max(C.y + 90 * u, sy) + Math.sin(a) * (rr + 50 * u) * 0.7]], 6 * u, null, seg(local, 0.35, 0.6), [0, 0.5]); }
    }
    let hot = null;
    vals.forEach((v, i) => {
      const q = back(seg(local, 0.1 + i * 0.16, 0.85 + i * 0.16));
      const cx = C.x + slot * (i + 0.5), x = cx - bw / 2;
      const idle = q >= 0.99 ? 1 + 0.012 * Math.sin(t * 2.6 + i * 1.7) : 1;
      const h = Math.max(6 * u, Hmax * (v / max) * q * idle), y = floorY - h;
      const isHot = i === hi, col = isHot ? T.red : i % 2 ? T.blue : T.cyan;
      const side = [[x + bw, y], [x + bw + dx, y + dy], [x + bw + dx, floorY + dy * 0.2], [x + bw, floorY]];
      const topF = [[x, y], [x + dx, y + dy], [x + bw + dx, y + dy], [x + bw, y]];
      const front = dense(rect(x, y, bw, h), 30 * u);
      blob(ctx, side, T.shade(col, 0.35), { amt: 0.6, base: 0.12, w: 5 * u });
      blob(ctx, topF, T.tint(col, 0.45), { amt: 0.2, w: 5 * u });
      blob(ctx, front, col, { amt: 0.4, w: 6 * u });
      // Shine stripe down the front.
      if (h > 30 * u) flat(ctx, rect(x + bw * 0.14, y + 14 * u, bw * 0.08, h - 28 * u), T.white, 0.55);
      // Motion lines while it shoots up.
      const rise = seg(local, 0.1 + i * 0.16, 0.7 + i * 0.16);
      if (rise > 0 && rise < 1) for (let k = 0; k < 3; k++) inkLine(ctx, [[x + bw * (0.2 + k * 0.3), y - 30 * u - k * 8 * u], [x + bw * (0.2 + k * 0.3), y - 90 * u - k * 14 * u]], 5 * u, null, 1 - rise);
      // Value tag.
      const tq = seg(local, 0.35 + i * 0.16, 0.6 + i * 0.16);
      if (tq > 0) {
        const label = fmt(v * clamp(q), v, d), size = 46 * u;
        const tw = Math.max(measure(ctx, label, size, "num") + 40 * u, 90 * u), th = 66 * u;
        const ty = y + dy - 24 * u - th;
        ctx.save(); ctx.translate(cx + dx / 2, ty + th / 2); ctx.scale(back(tq), back(tq));
        blob(ctx, dense(rect(-tw / 2, -th / 2, tw, th), 30 * u), isHot ? T.yellow : T.white, { amt: 0.15, w: 5 * u });
        say(ctx, label, 0, 3 * u, size, { kind: "num", maxW: tw - 20 * u });
        ctx.restore();
      }
      say(ctx, d.labels[i] || "", cx, floorY + 50 * u, 44 * u, { maxW: slot * 0.92 });
      if (isHot) hot = { cx: cx + dx / 2, y: y + dy, v, label: d.labels[i] || "", q };
    });
    // The editor holds up the highlighted figure on a sign.
    const s = (tall ? 120 : 130) * u;
    const px = tall ? R.x + R.w * 0.72 : R.x + R.w * 0.55, pb = tall ? R.y + R.h + 10 * u : B.y + B.h + 0.35 * s;
    const sw = tall ? R.w * 0.62 : Math.min(R.w * 0.96, 560 * u), sh = tall ? 330 * u : 330 * u;
    const hand = [-0.9 * s, -3.3 * s + Math.sin(t * 2.3) * 0.08 * s];
    const sq = back(seg(local, 0.55, 1.05));
    const signCX = tall ? R.x + sw / 2 + 10 * u : px + hand[0], signY = tall ? R.y + 10 * u : Math.max(R.y + 40 * u, pb + hand[1] - 0.6 * s - sh);
    if (tall) person(ctx, px, pb, s, CAST[0], { t, look: [-1, -0.4], arm: { side: -1, x: -1.35 * s, y: -2.2 * s, point: true }, mood: 2 });
    else {
      // Stick from the hand to the sign.
      const rock = Math.sin(t * 2.1) * 0.05;
      ctx.save(); ctx.translate(px + hand[0], pb + hand[1]); ctx.rotate(rock); ctx.translate(-(px + hand[0]), -(pb + hand[1]));
      const st = rect(px + hand[0] - 9 * u, signY + sh - 10 * u, 18 * u, pb + hand[1] - signY - sh + 20 * u);
      blob(ctx, st, [196, 140, 80], { amt: 0.3, w: 4 * u });
      sign(ctx, signCX - sw / 2, signY, sw, sh, hot, sq, d, t);
      ctx.restore();
      person(ctx, px, pb, s, CAST[0], { t, look: [-0.8, -0.6], arm: { side: -1, x: hand[0], y: hand[1] }, mood: hot ? 2 : 1, talk: local > 0.6 && local < 1.6 ? Math.abs(Math.sin(t * 9)) : 0 });
    }
    if (tall) sign(ctx, signCX - sw / 2, signY, sw, sh, hot, sq, d, t);
    // Sparkles on the winning bar.
    if (hot) for (let i = 0; i < 3; i++) sparkle(ctx, hot.cx + (i - 1) * 70 * u, hot.y - 150 * u - (i % 2) * 40 * u, 28 * u, (t * 0.9 + i * 0.33) % 1, T.yellow);
    drawCap(ctx, cap, 1);
  }
  function sign(ctx, x, y, w, h, hot, k, d, t) {
    const u = T.u;
    if (k <= 0 || !hot) return;
    ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.scale(k, k); ctx.rotate(-0.03); ctx.translate(-(x + w / 2), -(y + h / 2));
    const board = dense(rect(x, y, w, h), 40 * u);
    blob(ctx, board, T.white, { amt: 0.18, w: 7 * u });
    flat(ctx, rect(x + 16 * u, y + 16 * u, w - 32 * u, 70 * u), T.yellow);
    say(ctx, hot.label, x + w / 2, y + 54 * u, 46 * u, { maxW: w - 60 * u });
    const val = fmt(hot.v * clamp(hot.q), hot.v, d);
    say(ctx, val, x + w / 2, y + h * 0.64, Math.min(150 * u, h * 0.48), { kind: "num", color: T.red, maxW: w - 50 * u, stroke: 0 });
    ctx.restore();
  }

  function objectScene(ctx, B, local, t, d) {
    const u = T.u, tall = T.tall, phone = d.kind === "phone";
    const cap = headCap(ctx, "object", B, local);
    const top = cap.y + cap.h + 40 * u;
    const A = { x: B.x + 50 * u, y: top, w: B.w - 100 * u, h: B.y + B.h - 40 * u - top };
    // Device geometry.
    let dev;
    if (!tall) {
      const dw = phone ? Math.min(A.h * 0.5, 420 * u) : Math.min(A.w * 0.56, A.h * 1.35);
      const dh = phone ? dw * 1.9 : dw * 0.62;
      dev = { x: A.x + (phone ? A.w * 0.22 : 20 * u), y: A.y + (A.h - dh * (phone ? 1 : 1.1)) / 2, w: dw, h: Math.min(dh, A.h - 20 * u) };
    } else {
      const dw = phone ? Math.min(A.w * 0.5, 460 * u) : A.w * 0.92;
      const dh = phone ? dw * 1.8 : dw * 0.62;
      dev = { x: A.x + (A.w - dw) / 2, y: A.y + 10 * u, w: dw, h: dh };
    }
    // Pop burst behind the device.
    const bcx = dev.x + dev.w / 2, bcy = dev.y + dev.h / 2;
    blob(ctx, star(bcx, bcy, Math.max(dev.w, dev.h) * 0.66 * (1 + 0.02 * Math.sin(t * 3)), Math.max(dev.w, dev.h) * 0.5, 18, t * 0.05, 5), T.yellow, { amt: 0.25, w: 6 * u });
    const scr = device(ctx, dev, phone, t, local);
    // Callouts: lettered boxes joined to the screen by brush pointers.
    const labels = d.callouts || [];
    const anchors = [scr.preview, scr.hotClip, scr.track];
    labels.forEach((label, i) => {
      if (!label) return;
      const k = seg(local, 0.3 + i * 0.3, 0.6 + i * 0.3);
      const bx = tall ? A.x + 20 * u : dev.x + dev.w + (phone ? 160 : 120) * u;
      const maxW = tall ? A.w - 60 * u : A.x + A.w - bx;
      const tStart = dev.y + dev.h + (phone ? 60 : 120) * u, tStep = Math.max(175 * u, (A.y + A.h - tStart - 150 * u) / 3);
      const by = tall ? tStart + i * tStep : A.y + A.h * (0.04 + i * 0.27);
      const L = capLayout(ctx, label, bx + (tall ? 100 : 64) * u, by, maxW - 80 * u, (tall ? 54 : 46) * u, 42 * u, 2, "cap");
      const [ax, ay] = anchors[i];
      if (k > 0) {
        const ex = tall ? L.x - 84 * u : L.x - 62 * u, ey = L.y + L.h / 2;
        const mx = tall ? Math.min(ax, ex) - 40 * u : (ax + ex) / 2, my = tall ? (ay + ey) / 2 : Math.min(ay, ey) - 30 * u;
        const path = P().M(ex, ey).Q(mx, my, ax, ay, 20).a;
        inkLine(ctx, path, 9 * u, null, eo(k * 1.4), [0.05, 0.4]);
        if (k > 0.6) { blob(ctx, ellipse(ax, ay, 13 * u, 13 * u, 16), T.red, { shade: false, w: 4 * u }); }
        // Number disc.
        const nx = L.x - 46 * u, ny = L.y + L.h / 2;
        ctx.save(); ctx.translate(nx, ny); ctx.scale(back(k), back(k));
        blob(ctx, ellipse(0, 0, 32 * u, 32 * u, 24), T.red, { amt: 0.2, w: 4.5 * u });
        say(ctx, String(i + 1), 0, 2 * u, 40 * u, { color: T.white, kind: "num" });
        ctx.restore();
      }
      const float = Math.sin(t * 1.8 + i * 1.9) * 4 * u;
      drawCap(ctx, { ...L, y: L.y + float }, k, { fill: i === 1 ? T.yellow : T.white, rot: (i - 1) * 0.012 });
    });
    // A pointing hand clicks the proposed clip again and again.
    const cyc = (t * 0.7) % 1, press = cyc > 0.55 && cyc < 0.68 ? 1 : 0;
    const [hx0, hy0] = scr.hotClip;
    const hx = hx0 + 40 * u + (1 - eo(seg(cyc, 0, 0.5))) * 120 * u, hy = hy0 + 30 * u + (1 - eo(seg(cyc, 0, 0.5))) * 90 * u + press * 8 * u;
    pointer(ctx, hx, hy, 70 * u);
    if (press || (cyc > 0.68 && cyc < 0.85)) {
      for (let i = 0; i < 5; i++) { const a = -Math.PI * 0.95 + i * 0.32; inkLine(ctx, [[hx0 + Math.cos(a) * 34 * u, hy0 + Math.sin(a) * 34 * u], [hx0 + Math.cos(a) * 64 * u, hy0 + Math.sin(a) * 64 * u]], 6 * u, null, 1, [0, 0.5]); }
      sfx(ctx, "CLICK!", hx0 - 40 * u, hy0 - 120 * u, 52 * u, -0.12, seg(cyc, 0.55, 0.62), t, T.white, T.red);
    }
    if (!T.square) slate(ctx, B.x + B.w - 150 * u, B.y + B.h - 18 * u, 112 * u, { t, hop: true, look: [-1, -0.4], clap: Math.abs(Math.sin(t * 2.2)) ** 2 * 0.8, arms: [[-1.3 * 112 * u, -1.25 * 112 * u + Math.sin(t * 5) * 8 * u], [1.1 * 112 * u, -0.7 * 112 * u]] });
    drawCap(ctx, cap, 1);
  }
  function pointer(ctx, x, y, s) {
    const u = T.u;
    const p = P().M(x, y).L(x + s * 0.12, y + s * 0.92).L(x + s * 0.32, y + s * 0.7).L(x + s * 0.52, y + s * 1.05).L(x + s * 0.66, y + s * 0.98).L(x + s * 0.46, y + s * 0.64).L(x + s * 0.76, y + s * 0.6).a;
    blob(ctx, p, T.white, { amt: 0.25, w: 5 * u });
  }
  // A laptop or phone drawn in ink, its screen running a tiny edit with a moving playhead.
  function device(ctx, D, phone, t, local) {
    const u = T.u, w = 7 * u;
    const body = [196, 204, 214];
    const outer = rrect(D.x, D.y, D.w, D.h, (phone ? 44 : 18) * u);
    blob(ctx, outer, body, { amt: 0.4, w, dense: 30 * u });
    const pad = (phone ? 22 : 26) * u;
    const S = { x: D.x + pad, y: D.y + pad + (phone ? 20 * u : 0), w: D.w - pad * 2, h: D.h - pad * 2 - (phone ? 40 * u : 0) };
    const screen = rrect(S.x, S.y, S.w, S.h, 8 * u);
    flat(ctx, screen, [28, 34, 58]);
    inkRing(ctx, dense(screen, 30 * u), 4 * u);
    if (!phone) {
      const deck = [[D.x - D.w * 0.07, D.y + D.h + D.h * 0.1], [D.x + D.w * 1.07, D.y + D.h + D.h * 0.1], [D.x + D.w, D.y + D.h], [D.x, D.y + D.h]];
      blob(ctx, dense(deck, 30 * u), T.tint(body, 0.2), { amt: 0.35, w });
      flat(ctx, rect(D.x + D.w * 0.42, D.y + D.h + D.h * 0.025, D.w * 0.16, D.h * 0.035), T.shade(body, 0.2));
    }
    // Preview frame: a little original scene with a bobbing sun.
    const pv = { x: S.x + S.w * 0.06, y: S.y + S.h * 0.06, w: S.w * 0.88, h: S.h * (phone ? 0.42 : 0.5) };
    const pvr = rect(pv.x, pv.y, pv.w, pv.h);
    flat(ctx, pvr, T.cyan);
    ctx.save(); ctx.beginPath(); trace(ctx, pvr); ctx.clip();
    dots(ctx, pv.x, pv.y, pv.w, pv.h, 12 * u, T.shade(T.cyan, 0.2), (xn, yn) => clamp(yn * 0.4, 0, 0.4));
    const sunY = pv.y + pv.h * (0.35 + 0.06 * Math.sin(t * 1.6));
    blob(ctx, star(pv.x + pv.w * 0.72, sunY, pv.h * 0.2, pv.h * 0.14, 12, t * 0.6), T.yellow, { amt: 0.2, w: 3.5 * u });
    blob(ctx, [[pv.x - 10 * u, pv.y + pv.h + 10 * u], [pv.x + pv.w * 0.3, pv.y + pv.h * 0.45], [pv.x + pv.w * 0.6, pv.y + pv.h + 10 * u]], T.red, { amt: 0.35, w: 4 * u });
    blob(ctx, [[pv.x + pv.w * 0.35, pv.y + pv.h + 10 * u], [pv.x + pv.w * 0.62, pv.y + pv.h * 0.58], [pv.x + pv.w + 10 * u, pv.y + pv.h + 10 * u]], T.green, { amt: 0.35, w: 4 * u });
    ctx.restore();
    inkRing(ctx, dense(pvr, 30 * u), 4 * u);
    // Tracks.
    const ty0 = pv.y + pv.h + S.h * 0.08, th = S.h * (phone ? 0.08 : 0.1), gap = S.h * 0.04;
    const rows = [[[0, 0.28, 0], [0.31, 0.3, 2], [0.64, 0.34, 0]], [[0.05, 0.4, 1], [0.48, 0.46, 1]], [[0, 1, 3]]];
    let hotClip = null, track = null;
    rows.forEach((clips, r) => clips.forEach(([a, cw, kind]) => {
      const x = S.x + S.w * 0.06 + S.w * 0.88 * a, y = ty0 + r * (th + gap), ww = S.w * 0.88 * cw - 6 * u;
      const rr = rect(x, y, ww, th);
      if (kind === 2) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 5);
        flat(ctx, rr, mix(T.red, T.yellow, pulse * 0.4)); inkRing(ctx, dense(rr, 20 * u), 4.5 * u, T.yellow);
        hotClip = [x + ww / 2, y + th / 2];
      } else if (kind === 3) {
        flat(ctx, rr, T.tint(T.green, 0.3));
        ctx.beginPath();
        for (let i = 0; i <= 80; i++) { const xx = x + (ww * i) / 80, a2 = (Math.sin(i * 0.9) * 0.6 + Math.sin(i * 0.37) * 0.4) * th * 0.36; ctx.moveTo(xx, y + th / 2 - Math.abs(a2)); ctx.lineTo(xx, y + th / 2 + Math.abs(a2)); }
        ctx.strokeStyle = css(T.shade(T.green, 0.5)); ctx.lineWidth = 2.5 * u; ctx.stroke();
        inkRing(ctx, dense(rr, 20 * u), 3.5 * u);
        track = [x + ww * 0.3, y + th / 2];
      } else { flat(ctx, rr, kind ? T.pink : T.blue); inkRing(ctx, dense(rr, 20 * u), 3.5 * u); }
    }));
    // Playhead sweeps the tracks continuously.
    const ph = S.x + S.w * 0.06 + S.w * 0.88 * ((t * 0.16 + 0.1) % 1);
    flat(ctx, rect(ph - 2.5 * u, ty0 - 16 * u, 5 * u, 3 * (th + gap) + 10 * u), T.yellow);
    blob(ctx, [[ph - 12 * u, ty0 - 26 * u], [ph + 12 * u, ty0 - 26 * u], [ph, ty0 - 10 * u]], T.yellow, { shade: false, w: 3 * u });
    return { preview: [pv.x + pv.w * 0.5, pv.y + pv.h * 0.45], hotClip, track };
  }

  function peopleScene(ctx, B, local, t, d) {
    const u = T.u, tall = T.tall;
    const cap = headCap(ctx, "people", B, local);
    const n = Math.max(2, Math.min(6, Math.round(Number(d.count) || 4)));
    const hi = Math.min(n - 1, d.highlight ?? 1);
    const rows = tall && n > 3 ? 2 : 1, per = Math.ceil(n / rows);
    const top = cap.y + cap.h + 30 * u;
    const order = [];
    for (let i = 0; i < n; i++) order.push(i);
    const speaker = Math.floor(t * 0.9) % n;
    const ICONS = ["heart", "star", "check"];
    const drawRow = (r) => {
      const ids = order.slice(r * per, r * per + per), m = ids.length;
      const slot = (B.w - 60 * u) / per;
      const s = Math.min(slot * 0.34, (tall ? 125 : 150) * u, (B.y + B.h - top) / (rows === 2 ? 7.6 : 4.9));
      const base = rows === 2 && r === 0 ? top + (B.y + B.h - top) * 0.52 : B.y + B.h + 0.25 * s;
      if (rows === 2 && r === 0) {
        // A balcony rail the back row stands behind.
        const rail = rect(B.x - 10 * u, base - 0.55 * s, B.w + 20 * u, 1.2 * s);
        blob(ctx, dense(rail, 50 * u), T.red, { amt: 0.35, w: 7 * u });
        for (let k = 0; k < 14; k++) flat(ctx, rect(B.x + k * B.w / 13 - 8 * u, base - 0.45 * s, 16 * u, 1 * s), T.shade(T.red, 0.35));
      }
      ids.forEach((i, j) => {
        const cx = B.x + 30 * u + slot * (j + 0.5) + (per - m) * slot * 0.5;
        const sp = CAST[i % CAST.length], isHot = i === hi;
        const k = seg(local, 0.05 + i * 0.12, 0.4 + i * 0.12);
        const rise = (1 - eo(k)) * 0.6 * s;
        const ss = s * (isHot ? 1.08 : 1);
        if (!(rows === 2 && r === 0)) person(ctx, cx, base + rise, ss, sp, { t, look: [i < n / 2 ? 0.5 : -0.5, -0.3], talk: i === speaker && local > 0.5 ? Math.abs(Math.sin(t * 10)) : 0, mood: isHot ? 2 : 1, shirt: isHot ? T.red : null });
        else { ctx.save(); ctx.beginPath(); ctx.rect(B.x - 20 * u, B.y - 20 * u, B.w + 40 * u, base - 0.55 * s - B.y + 20 * u); ctx.clip(); person(ctx, cx, base + rise, ss, sp, { t, look: [0, 0.2], talk: i === speaker && local > 0.5 ? Math.abs(Math.sin(t * 10)) : 0, mood: isHot ? 2 : 1, shirt: isHot ? T.red : null }); ctx.restore(); }
        // Their balloon: a role for the first three, a reaction for the rest.
        const bk = seg(local, 0.3 + i * 0.18, 0.6 + i * 0.18);
        const headTop = base - 3.45 * ss;
        const alt = slot < 400 * u && !tall ? (j % 2) * 120 * u : 0;
        const label = i < 3 ? d.badges[i] : "";
        const by = headTop - (label ? 95 : 80) * u - alt;
        const tail = [cx + 0.25 * ss, base - 2.0 * ss];
        if (label) balloon(ctx, cx, by, label, { k: bk, tail: [cx + 0.15 * ss, headTop + 0.25 * ss], size: 44 * u, maxW: Math.max(slot * 0.9, 200 * u), spiky: isHot, fill: isHot ? T.yellow : T.white, t, seed: i + 2 });
        else balloon(ctx, cx, by, "", { k: bk, tail: [cx + 0.15 * ss, headTop + 0.25 * ss], icon: ICONS[(i - 3) % 3], size: 46 * u, t, seed: i + 2 });
        void tail;
      });
    };
    for (let r = 0; r < rows; r++) drawRow(r);
    drawCap(ctx, cap, 1);
  }

  function processScene(ctx, B, local, t, d) {
    const u = T.u, tall = T.tall;
    const cap = headCap(ctx, "process", B, local);
    const top = cap.y + cap.h + 36 * u;
    const A = { x: B.x + 36 * u, y: top, w: B.w - 72 * u, h: B.y + B.h - 36 * u - top };
    const n = 3, g = (tall ? 70 : 80) * u;
    const cells = [];
    for (let i = 0; i < n; i++) {
      if (tall) { const h = (A.h - g * 2) / 3; cells.push({ x: A.x, y: A.y + i * (h + g), w: A.w, h }); }
      else { const w = (A.w - g * 2) / 3; cells.push({ x: A.x + i * (w + g), y: A.y, w, h: A.h }); }
    }
    const COLS = ["cyan", "yellow", "pink"];
    const active = Math.min(2, Math.floor(seg(local, 0, 2.2) * 3));
    cells.forEach((c, i) => {
      const k = seg(local, 0.05 + i * 0.4, 0.35 + i * 0.4);
      const slam = (1 - back(k)) * 0.08;
      ctx.save();
      ctx.translate(c.x + c.w / 2, c.y + c.h / 2); ctx.scale(1 + slam, 1 + slam); ctx.translate(-(c.x + c.w / 2), -(c.y + c.h / 2));
      const cr = rect(c.x, c.y, c.w, c.h);
      ctx.save(); ctx.beginPath(); trace(ctx, cr); ctx.clip();
      const col = T[COLS[i]];
      flat(ctx, cr, T.tint(col, 0.75));
      rays(ctx, c.x + c.w / 2, c.y + c.h * 0.4, 16, t * 0.15 * (i % 2 ? -1 : 1), T.tint(col, 0.45), Math.hypot(c.w, c.h), 0.6);
      dots(ctx, c.x, c.y, c.w, c.h, 16 * u, col, (xn, yn) => clamp(0.05 + Math.hypot(xn - 0.5, yn - 0.4) * 0.6 + 0.05 * Math.sin(t * 2 + i), 0, 0.42), [t * 6 * u, 0]);
      // Illustration area and caption area.
      const ill = tall ? { x: c.x, y: c.y, w: c.w * 0.5, h: c.h } : { x: c.x, y: c.y, w: c.w, h: c.h * 0.66 };
      stepArt(ctx, i, ill, t, i === active, local);
      ctx.restore();
      inkRing(ctx, dense(cr, 50 * u), (i === active ? 9 : 7) * u, i === active ? T.red : null);
      // Step number disc and lettered caption.
      const label = d.steps[i] || "";
      const L = tall ? capLayout(ctx, label, c.x + c.w * 0.52, c.y + c.h * 0.5 - 60 * u, c.w * 0.46, 48 * u, 42 * u, 3)
        : capLayout(ctx, label, c.x + 18 * u, c.y + c.h * 0.7, c.w - 36 * u, 48 * u, 42 * u, 2);
      if (tall) L.y = c.y + (c.h - L.h) / 2 + 20 * u;
      else L.y = c.y + c.h - L.h - 22 * u;
      drawCap(ctx, L, seg(local, 0.1 + i * 0.4, 0.4 + i * 0.4), { fill: T.white });
      const nk = seg(local, 0.15 + i * 0.4, 0.45 + i * 0.4);
      if (nk > 0) {
        const nx = tall ? L.x + 40 * u : c.x + 56 * u, ny = tall ? L.y - 52 * u : c.y + 56 * u;
        ctx.save(); ctx.translate(nx, ny); ctx.scale(back(nk), back(nk)); ctx.rotate(Math.sin(t * 2 + i) * 0.06);
        blob(ctx, star(0, 0, 50 * u, 36 * u, 10, 0, 0), i === active ? T.red : T.yellow, { amt: 0.2, w: 4.5 * u });
        say(ctx, String(i + 1), 0, 3 * u, 50 * u, { kind: "num", color: i === active ? T.white : T.ink });
        ctx.restore();
      }
      ctx.restore();
      // Arrows in the gutters.
      if (i < n - 1) {
        const ak = seg(local, 0.3 + i * 0.4, 0.6 + i * 0.4);
        const wob = Math.sin(t * 4 + i) * 5 * u;
        const pts = tall ? P().M(c.x + c.w * 0.5, c.y + c.h - 30 * u).Q(c.x + c.w * 0.5 + 30 * u + wob, c.y + c.h + g / 2, c.x + c.w * 0.5, c.y + c.h + g + 30 * u, 14).a
          : P().M(c.x + c.w - 30 * u, c.y + c.h * 0.4).Q(c.x + c.w + g / 2, c.y + c.h * 0.4 - 50 * u + wob, c.x + c.w + g + 30 * u, c.y + c.h * 0.4, 14).a;
        fatArrow(ctx, pts, 30 * u, T.red, eo(ak));
      }
    });
    drawCap(ctx, cap, 1);
  }
  // The three step drawings: a film reader, a drafting slate and a sign-off stamp.
  function stepArt(ctx, i, A, t, on, local = 9) {
    const u = T.u, s = Math.min(A.w, A.h);
    const cx = A.x + A.w / 2;
    if (i === 0) {
      const ps = s * 0.2;
      person(ctx, A.x + A.w * 0.3, A.y + A.h + 0.1 * ps, ps, CAST[0], { t, look: [0.8, 0.9], tilt: 0.06, arm: { side: 1, x: 1.7 * ps, y: -1.25 * ps }, mood: 1, brow: 0.5 });
      const sy0 = A.y + A.h * 0.79 - s * 0.1;
      filmStrip(ctx, A.x - 20 * u, sy0, A.w + 40 * u, s * 0.2, t, on ? 90 : 40);
      // Magnifier sweeping along the strip.
      const mx = A.x + A.w * (0.66 + 0.1 * Math.sin(t * 1.4)), my = sy0 + s * 0.1, r = s * 0.13;
      inkLine(ctx, [[mx + r * 0.7, my - r * 0.7], [mx + r * 1.6, my - r * 1.6]], r * 0.36, [120, 70, 40], 1, [0, 0]);
      const lens = ellipse(mx, my, r, r, 36);
      flat(ctx, lens, T.white, 0.35);
      inkRing(ctx, lens, r * 0.16);
      inkLine(ctx, P().A(mx, my, r * 0.65, r * 0.65, Math.PI * 1.1, Math.PI * 1.45, 8).a, r * 0.12, T.white, 1, [0.3, 0.3]);
    } else if (i === 1) {
      // A card being drafted, scribbles re-drawing every couple of seconds.
      const cw = A.w * 0.5, ch = cw * 0.72, cxl = A.x + A.w * 0.5, cyl = A.y + A.h * 0.42;
      ctx.save(); ctx.translate(cxl, cyl); ctx.rotate(-0.06);
      const card = dense(rect(-cw / 2, -ch / 2, cw, ch), 30 * u);
      blob(ctx, card, T.white, { amt: 0.15, w: 5 * u });
      const cyc = (t * 0.5) % 1;
      const scr = [];
      for (let k = 0; k < 4; k++) { const yy = -ch * 0.3 + k * ch * 0.18; for (let j = 0; j <= 10; j++) scr.push([-cw * 0.38 + (cw * 0.76 * j) / 10 * (k === 3 ? 0.6 : 1), yy + Math.sin(j * 1.9 + k) * 5 * u]); }
      inkLine(ctx, scr, 5 * u, T.blue, cyc, [0, 0]);
      const tip = scr[Math.min(scr.length - 1, Math.floor(cyc * (scr.length - 1)))];
      ctx.restore();
      const px = cxl + tip[0] * Math.cos(-0.06) - tip[1] * Math.sin(-0.06), py = cyl + tip[0] * Math.sin(-0.06) + tip[1] * Math.cos(-0.06);
      const ss = s * 0.2, PL = s * 0.42, pa = 0.65;
      const hx = px + Math.cos(pa) * PL * 0.55, hy = py + Math.sin(pa) * PL * 0.55;
      const sxl = A.x + A.w * 0.8, sbl = A.y + A.h - 4 * u;
      slate(ctx, sxl, sbl, ss, { t, look: [-0.8, -0.6], clap: 0.15 + 0.15 * Math.sin(t * 3), arms: [[hx - sxl, hy - sbl], [1.1 * ss, -0.8 * ss + Math.sin(t * 4) * 0.08 * ss]] });
      pencil(ctx, px, py, PL, pa);
    } else {
      // A rubber stamp thumping a check onto the cut.
      // The stamp hovers until its panel is lettered, then thumps on a steady beat.
      const t0 = 1.05, tl = Math.max(0, local - t0), live = local > t0;
      const cyc = (tl * 0.75 + 0.65) % 1, down = !live ? 0.15 * (0.5 + 0.5 * Math.sin(t * 3)) : cyc < 0.35 ? eo(cyc / 0.35) : cyc < 0.45 ? 1 : 1 - eo((cyc - 0.45) / 0.55);
      const cw = A.w * 0.56, ch = cw * 0.62, x0 = cx - cw / 2, y0 = A.y + A.h * 0.55;
      blob(ctx, dense(rect(x0, y0, cw, ch), 30 * u), T.white, { amt: 0.15, w: 5 * u });
      const printed = live && (tl * 0.75 + 0.65 > 1.35 || cyc > 0.35 && tl * 0.75 + 0.65 > 1);
      if (printed) {
        ctx.save(); ctx.translate(cx, y0 + ch / 2); ctx.rotate(-0.12);
        inkRing(ctx, dense(rect(-cw * 0.32, -ch * 0.32, cw * 0.64, ch * 0.64), 20 * u), 6 * u, T.red);
        inkLine(ctx, [[-cw * 0.16, 0], [-cw * 0.04, ch * 0.16], [cw * 0.2, -ch * 0.2]], 16 * u, T.red, 1, [0.1, 0.2]);
        ctx.restore();
      }
      const sy = y0 + ch * 0.5 - (1 - down) * A.h * 0.38;
      const sw = cw * 0.62;
      blob(ctx, rrect(cx - sw / 2, sy - 40 * u, sw, 40 * u, 6 * u), T.shade(T.red, 0.2), { amt: 0.3, w: 5 * u });
      blob(ctx, rect(cx - sw * 0.12, sy - 140 * u, sw * 0.24, 100 * u), [150, 96, 52], { amt: 0.35, w: 5 * u });
      blob(ctx, ellipse(cx, sy - 160 * u, sw * 0.26, 40 * u, 28), [120, 70, 40], { amt: 0.35, w: 5 * u });
      if (live && down > 0.95) {
        for (let k = 0; k < 6; k++) { const a = Math.PI + (k / 5) * Math.PI; inkLine(ctx, [[cx + Math.cos(a) * sw * 0.65, y0 + ch * 0.5 + Math.sin(a) * 60 * u], [cx + Math.cos(a) * sw * 0.9, y0 + ch * 0.5 + Math.sin(a) * 100 * u]], 6 * u, null, 1, [0, 0.5]); }
        sfx(ctx, "THUNK!", cx + sw * 0.15, A.y + A.h * 0.18, 56 * u, 0.1, 1, t, T.white, T.red);
      }
    }
  }
  function pencil(ctx, x, y, L, a = -0.85) {
    const u = T.u, ux = Math.cos(a), uy = Math.sin(a), w = L * 0.13, nx = -uy, ny = ux;
    const tipLen = L * 0.16;
    const b0 = [x + ux * tipLen, y + uy * tipLen], b1 = [x + ux * L, y + uy * L];
    const shaft = [[b0[0] + nx * w / 2, b0[1] + ny * w / 2], [b1[0] + nx * w / 2, b1[1] + ny * w / 2], [b1[0] - nx * w / 2, b1[1] - ny * w / 2], [b0[0] - nx * w / 2, b0[1] - ny * w / 2]];
    blob(ctx, dense(shaft, 20 * u), T.yellow, { amt: 0.35, w: 4.5 * u });
    const e0 = [x + ux * L * 0.86, y + uy * L * 0.86];
    blob(ctx, [[e0[0] + nx * w / 2, e0[1] + ny * w / 2], [b1[0] + nx * w / 2, b1[1] + ny * w / 2], [b1[0] - nx * w / 2, b1[1] - ny * w / 2], [e0[0] - nx * w / 2, e0[1] - ny * w / 2]], T.pink, { amt: 0.3, w: 4.5 * u });
    blob(ctx, [[b0[0] + nx * w / 2, b0[1] + ny * w / 2], [x, y], [b0[0] - nx * w / 2, b0[1] - ny * w / 2]], [236, 200, 150], { amt: 0.2, w: 4 * u });
  }

  function compareScene(ctx, B, local, t, d) {
    const u = T.u, tall = T.tall;
    const cap = headCap(ctx, "compare", B, local);
    const top = cap.y + cap.h + 26 * u;
    const lv = Number(d.leftValue) || 0, rv = Number(d.rightValue) || 0;
    // Split the panel with a lightning seam; each half gets its own weather.
    const mid = tall ? top + (B.y + B.h - top) / 2 : B.x + B.w / 2;
    const seam = [];
    const R = rng(17);
    for (let i = 0; i <= 10; i++) {
      const k = i / 10, j = (i % 2 ? 1 : -1) * 34 * u * (0.7 + R() * 0.6);
      seam.push(tall ? [B.x - 20 * u + (B.w + 40 * u) * k, mid + j] : [mid + j, B.y - 20 * u + (B.h + 40 * u) * k]);
    }
    const halfA = tall ? [[B.x - 30 * u, B.y - 30 * u], [B.x + B.w + 30 * u, B.y - 30 * u], ...seam.slice().reverse()] : [[B.x - 30 * u, B.y - 30 * u], ...seam, [B.x - 30 * u, B.y + B.h + 30 * u]];
    const halfB = tall ? [...seam, [B.x + B.w + 30 * u, B.y + B.h + 30 * u], [B.x - 30 * u, B.y + B.h + 30 * u]] : [[B.x + B.w + 30 * u, B.y - 30 * u], ...seam.slice().reverse(), [B.x + B.w + 30 * u, B.y + B.h + 30 * u]];
    // Before: a grey, rained-on half.
    ctx.save(); ctx.beginPath(); trace(ctx, halfA); ctx.clip();
    flat(ctx, halfA, T.tint(T.grey, 0.45));
    dots(ctx, B.x, B.y, B.w, B.h, 20 * u, T.grey, (xn, yn) => clamp(0.1 + yn * 0.3 + 0.04 * Math.sin(t * 1.5), 0, 0.4), [0, t * 10 * u]);
    ctx.restore();
    // After: a sunny half.
    ctx.save(); ctx.beginPath(); trace(ctx, halfB); ctx.clip();
    flat(ctx, halfB, T.tint(T.yellow, 0.2));
    const L0 = tall ? { x: B.x, y: top, w: B.w, h: mid - top } : { x: B.x, y: top, w: mid - B.x, h: B.y + B.h - top };
    const R0 = tall ? { x: B.x, y: mid, w: B.w, h: B.y + B.h - mid } : { x: mid, y: top, w: B.x + B.w - mid, h: B.y + B.h - top };
    const sunC = tall ? [R0.x + R0.w * 0.32, R0.y + R0.h * 0.42] : [R0.x + R0.w * 0.5, R0.y + R0.h * 0.3];
    rays(ctx, sunC[0], sunC[1], 20, t * 0.2, T.tint(T.orange, 0.3), Math.hypot(B.w, B.h), 0.55);
    dots(ctx, B.x, B.y, B.w, B.h, 20 * u, T.orange, (xn, yn) => clamp(0.05 + Math.hypot(B.x + xn * B.w - sunC[0], B.y + yn * B.h - sunC[1]) / B.w * 0.6, 0, 0.42), [t * 8 * u, 0]);
    ctx.restore();
    // The seam itself.
    inkLine(ctx, seam, 22 * u, T.white, 1, [0, 0]);
    inkLine(ctx, seam.map(([x, y]) => [x + 9 * u, y + 9 * u]), 8 * u, null, 1, [0, 0]);
    inkLine(ctx, seam.map(([x, y]) => [x - 9 * u, y - 9 * u]), 8 * u, null, 1, [0, 0]);
    // Halves: cloud with rain over a frazzled person; sun over a grinning one.
    const sides = [
      { b: L0, v: lv, label: d.left, k: seg(local, 0.1, 1.1), hot: false },
      { b: R0, v: rv, label: d.right, k: seg(local, 0.5, 1.5), hot: true },
    ];
    sides.forEach((sd, i) => {
      const b = sd.b;
      const big = Math.min((tall ? 130 : 150) * u, b.w * 0.2);
      const pc = tall ? [b.x + b.w * 0.32, b.y + b.h * 0.42] : [b.x + b.w * 0.5, b.y + b.h * 0.3];
      const ps = (tall ? 115 : 132) * u;
      const pX = tall ? b.x + b.w * 0.78 : b.x + b.w * (i ? 0.62 : 0.38), pB = tall ? b.y + b.h + 0.3 * ps : B.y + B.h + 0.35 * ps;
      // The character below the weather, kept inside its own half.
      ctx.save(); ctx.beginPath(); trace(ctx, i ? halfB : halfA); ctx.clip();
      person(ctx, pX, pB, ps, CAST[i ? 4 : 1], { t, mood: i ? 2 : -1, sweat: !i, look: tall ? [-0.8, -0.6] : [i ? -0.5 : 0.5, -1], brow: i ? 1 : -0.5, arm: i ? { side: 1, x: 1.45 * ps, y: -3.3 * ps + Math.sin(t * 5) * 0.12 * ps, wave: true } : null });
      ctx.restore();
      if (!i) {
        // Rain.
        const RR = rng(5);
        for (let k = 0; k < 16; k++) {
          const rx = pc[0] + (RR() - 0.5) * big * 3.2, ph = RR(), len = 40 * u;
          const y0 = pc[1] + big * 0.5, span = (tall ? b.h * 0.55 : b.h * 0.6);
          const yy = y0 + ((t * 1.3 + ph) % 1) * span;
          const dr = 13 * u, drop = P().M(rx, yy - dr * 2.2).Q(rx + dr * 1.1, yy - dr * 0.2, rx, yy + dr).Q(rx - dr * 1.1, yy - dr * 0.2, rx, yy - dr * 2.2, 8).a;
          void len; blob(ctx, drop, T.cyan, { shade: false, w: 3.2 * u });
        }
        const cl = cloud(pc[0], pc[1], Math.max(big * 3.6, measure(ctx, fmt(lv, lv, d), big, "num") + 140 * u), big * 2.1, t);
        blob(ctx, cl, T.tint(T.grey, 0.15), { amt: 0.4, w: 7 * u });
      } else {
        const r = Math.max(big * 1.35, (measure(ctx, fmt(rv, rv, d), big, "num") + 80 * u) / 2);
        blob(ctx, star(pc[0], pc[1], r * 1.32 * (1 + 0.03 * Math.sin(t * 4)), r * 1.05, 16, -t * 0.25), T.orange, { amt: 0.3, w: 6 * u });
        blob(ctx, ellipse(pc[0], pc[1], r, r, 56), T.yellow, { amt: 0.3, w: 7 * u });
        for (let k = 0; k < 3; k++) sparkle(ctx, pc[0] + (k - 1) * r * 1.2, pc[1] - r * 1.25 + (k % 2) * 30 * u, 30 * u, (t * 0.8 + k * 0.37) % 1, T.white);
      }
      const num = fmt(sd.v * eo(sd.k), sd.v, d);
      const bump = 1 + 0.025 * Math.sin(t * 3 + i * 2);
      ctx.save(); ctx.translate(pc[0], pc[1] + 4 * u); ctx.scale(bump, bump);
      say(ctx, num, 0, 0, big, { kind: "num", color: i ? T.red : T.ink, maxW: big * 3.2, stroke: i ? 0 : 0 });
      ctx.restore();
      // Label caption on the half.
      const Lb = capLayout(ctx, sd.label || "", 0, 0, tall ? b.w * 0.5 : b.w * 0.7, 48 * u, 42 * u, 2);
      Lb.x = tall ? b.x + b.w - Lb.w - 40 * u : pc[0] - Lb.w / 2;
      Lb.y = tall ? b.y + 40 * u + (i ? 30 * u : 0) : pc[1] - big * 1.05 - Lb.h - (i ? 70 : 40) * u;
      if (!tall) Lb.y = Math.max(Lb.y, b.y + 10 * u);
      drawCap(ctx, Lb, seg(local, 0.05 + i * 0.4, 0.35 + i * 0.4), { fill: i ? T.yellow : T.white, rot: i ? 0.02 : -0.02 });
    });
    drawCap(ctx, cap, 1);
  }

  function closingScene(ctx, B, local, hold, t) {
    const u = T.u, tall = T.tall;
    const cx = B.x + B.w / 2;
    // Confetti falling for as long as the panel is up.
    const R = rng(77), cols = [T.cyan, T.pink, T.yellow, T.white, T.green];
    for (let i = 0; i < 40; i++) {
      const x0 = B.x + R() * B.w, ph = R(), sp = 0.18 + R() * 0.18, sz = (10 + R() * 12) * u;
      const y = B.y - 40 * u + (((t * sp + ph) % 1) * (B.h + 80 * u)), x = x0 + Math.sin(t * 2 + i) * 30 * u;
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * 3 + i);
      blob(ctx, rect(-sz / 2, -sz / 3, sz, sz * 0.66), cols[i % cols.length], { shade: false, w: 2.5 * u });
      ctx.restore();
    }
    // High five at the foot of the panel.
    const s = (tall ? 175 : 140) * u, base = B.y + B.h + 0.3 * s;
    const meet = [cx, base - 3.75 * s + Math.sin(t * 3) * 0.05 * s];
    const mx = cx - 1.9 * s, sx = cx + 1.6 * s, ss = 1.25 * s;
    person(ctx, mx, base, s, CAST[0], { t, mood: 2, look: [1, -0.6], arm: { side: 1, x: meet[0] - mx - 0.15 * s, y: meet[1] - base }, brow: 1 });
    slate(ctx, sx, B.y + B.h - 30 * u, ss, { t, clap: 0.3 + 0.3 * Math.sin(t * 4), look: [-1, -0.6], arms: [[meet[0] - sx + 0.15 * s, meet[1] - (B.y + B.h - 30 * u)], [1.1 * ss, -0.7 * ss + Math.sin(t * 6) * 0.1 * ss]] });
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    blob(ctx, star(meet[0], meet[1] - 10 * u, (70 + 12 * pulse) * u, 34 * u, 9, t * 0.5, 3), T.yellow, { amt: 0.2, w: 5 * u });
    // Closing line as block lettering.
    const f = fit(ctx, words("closing"), B.w * (tall ? 0.86 : 0.8), tall ? 4 : 3, (tall ? 130 : 140) * u, 70 * u);
    const lh = f.size * 1.08, cy = B.y + B.h * (tall ? 0.38 : 0.32), top = cy - (f.lines.length * lh) / 2;
    f.lines.forEach((line, i) => {
      const k = seg(local, 0.05 + i * 0.12, 0.45 + i * 0.12);
      const b = blockLine(line, f.size, T.white, T.blue);
      drawBlock(ctx, b, cx, top + lh * (i + 0.5), (0.75 + 0.25 * back(k)) * (1 + 0.012 * Math.sin(t * 2 + i)), 0.025 * Math.sin(t * 1.3 + i), clamp(0.35 + k * 3));
    });
    for (let i = 0; i < 4; i++) sparkle(ctx, cx + (i - 1.5) * B.w * 0.24, top - 40 * u + (i % 2) * (f.lines.length * lh + 80 * u), 34 * u, (t * 0.75 + i * 0.27) % 1, T.white);
  }

  const SCENES = { chart: chartScene, object: objectScene, people: peopleScene, process: processScene, compare: compareScene };
  const DATA = (c) => ({
    chart: { labels: [c.bar_1_label, c.bar_2_label, c.bar_3_label, c.bar_4_label], values: [c.bar_1, c.bar_2, c.bar_3, c.bar_4], suffix: c.chart_suffix, prefix: "", highlight: Number(c.highlight) - 1 },
  });
  void DATA;
  let STAGE_S = null;
  const scene = (id) => (ctx, S, box, p, d, info = {}) => {
    if (!T || STAGE_S !== S) { T = theme(S); STAGE_S = S; }
    const exiting = info.exit !== undefined;
    const off = panelOffset(!exiting, info.exit || 0);
    const local = info.local ?? 0;
    inPanel(ctx, S, id, off, exiting ? local : CUR.local, (B) => SCENES[id](ctx, B, local, CUR.t, d));
  };
  function staticPanel(ctx, S, id, off, local, hold) {
    inPanel(ctx, S, id, off, local, (B) => (id === "title" ? titleScene(ctx, B, local, hold, CUR.t) : closingScene(ctx, B, local, hold, CUR.t)));
  }

  // Newsprint over everything: specks, fibres and a little yellowing, multiplied onto the page.
  let NEWS = null;
  function newsprint(W, H, look) {
    const key = `${W}x${H}:${look.pop.paper}`;
    if (NEWS && NEWS.key === key) return NEWS.c;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d");
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, W, H);
    const R = rng(23), u = Math.min(W, H) / 1080;
    for (let i = 0; i < (W * H) / 900; i++) { const a = 0.04 + R() * 0.1; g.fillStyle = `rgba(90,70,40,${a})`; g.fillRect(R() * W, R() * H, (0.8 + R() * 1.6) * u, (0.8 + R() * 1.6) * u); }
    g.lineCap = "round";
    for (let i = 0; i < 260; i++) { const x = R() * W, y = R() * H, a = R() * TAU, l = (6 + R() * 20) * u; g.strokeStyle = `rgba(120,95,60,${0.06 + R() * 0.08})`; g.lineWidth = 0.8 * u; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.6, y + Math.sin(a + 0.6) * l * 0.6, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    const gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    gr.addColorStop(0, "rgba(255,240,200,0)"); gr.addColorStop(1, "rgba(214,180,120,0.32)");
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    NEWS = { key, c };
    return c;
  }

  const POP = {
    paper: "#f6eedb", page: "#efe4c8", ink: "#141317", white: "#fffaf0", yellow: "#ffd23a", blue: "#2f6fd0", cyan: "#4cc0ee", pink: "#f06ea6",
    orange: "#f8952c", green: "#45b26b", grey: "#8d97a8", hairBlack: "#22223a", hairBrown: "#6e3b1e", hairRed: "#d4532a", hairBlond: "#f2c24f",
    skins: [["#ffd8bf", "#f08a7e"], ["#f2b48a", "#d9705e"], ["#b9764a", "#8e4a32"], ["#7a4a2c", "#55301c"]],
  };
  const text = (ink) => () => "none";

  return {
    // Headlines set straight on this look's backdrop, where its ink and accent (meant for panels) do not read.
    displayInk: { dark: "#fffaf0" },
    bg: "#efe4c8", panel: "#fffaf0", ink: "#141317", muted: "#5a5348", accent: "#e8402f", onAccent: "#fffaf0",
    rule: "#141317", track: "rgba(20,19,23,0.12)",
    display: LET, displayWeight: 800, displayCase: "uppercase", displayTracking: "0.01em", displayStyle: "italic",
    body: LET, bodyWeight: 700, figures: LET, radius: 6, motion: "pop", change: "slide",
    kit: { line: 5, fill: "solid", panel: "fill" }, panelEdge: "#141317",
    pop: POP,
    palettes: {
      // Fresh print: white stock and brighter plates. Night edition: a midnight page. Mono: one-ink newsprint.
      light: { bg: "#fbf8f1", panel: "#ffffff", accent: "#ec3b5c", pop: { ...POP, paper: "#ffffff", page: "#f7f3ea", white: "#ffffff", yellow: "#ffe15a", cyan: "#62d0f5", pink: "#ff86b8", blue: "#3b7fe0" } },
      dark: { bg: "#151833", panel: "#fffaf0", accent: "#ff4f3a", muted: "#c9c4b8", pop: { ...POP, page: "#151833", paper: "#232a52", yellow: "#ffcc26", cyan: "#2fb6ea", blue: "#3a63d6", grey: "#6b7590" } },
      mono: { bg: "#efefea", panel: "#ffffff", accent: "#141317", muted: "#55554f", pop: { ...POP, mono: true, paper: "#f2f2ee", page: "#e6e6e0", white: "#ffffff", yellow: "#d8d8d2", blue: "#6f6f6f", cyan: "#a8a8a4", pink: "#bdbdb8", orange: "#9a9a96", green: "#8a8a86", grey: "#b0b0aa", hairBlack: "#2a2a2a", hairBrown: "#4a4a4a", hairRed: "#6a6a6a", hairBlond: "#c8c8c2", skins: [["#f0f0ec", "#9a9a96"], ["#dcdcd6", "#8a8a86"], ["#b8b8b2", "#707070"], ["#909090", "#5a5a5a"]] } },
    },
    textShadow: text(),
    backdrop: (accent, texture = 1, look) => {
      const p = (look && look.pop) || POP;
      return `radial-gradient(circle at 50% 50%, ${p.cyan}55 22%, transparent 24%) 0 0 / 22px 22px, radial-gradient(circle at 50% 50%, ${p.cyan}55 22%, transparent 24%) 11px 11px / 22px 22px, ${p.paper}`;
    },
    css: () => `#root:has(> #art) .display, #root:has(> #art) .kicker { opacity: 0 !important; }
      #root > canvas:not(#art) { mix-blend-mode: multiply; }`,
    paintOver: true,
    paint: (ctx, W, H, t, accent, look) => { ctx.clearRect(0, 0, W, H); ctx.drawImage(newsprint(W, H, look), 0, 0); },
    keepArt: true,
    overlap: true,
    stage(ctx, S, info) {
      T = theme(S); STAGE_S = S;
      const u = T.u;
      REG = [2.6 * u * T.tex, -1.8 * u * T.tex];
      const P0 = plan();
      CUR.index = info.index; CUR.scene = info.scene; CUR.local = info.local; CUR.change = info.change || 0.45; CUR.t = info.t;
      CUR.prev = P0 && info.index > 0 && P0.shown[info.index - 1] ? P0.shown[info.index - 1] : null;
      CUR.k = info.index > 0 && info.local < CUR.change ? eio(info.local / CUR.change) : 1;
      // Panels read across, then down the page: odd scenes slide in from the right, even ones from below.
      CUR.dir = info.index % 2 ? [1, 0] : [0, 1];
      if (S.paint) page(ctx, info.t);
      // Speed streaks in the gutter while the page slides.
      if (S.paint && CUR.k < 1) {
        const R = rng(info.index + 3), a = 1 - Math.abs(CUR.k - 0.5) * 2;
        ctx.save(); ctx.globalAlpha = 0.5 * a;
        for (let i = 0; i < 18; i++) {
          const along = R(), len = (120 + R() * 260) * u, wdt = (3 + R() * 5) * u;
          if (CUR.dir[0]) { const y = along * T.H, x = T.W * (1 - CUR.k) + (R() - 0.5) * 120 * u; inkLine(ctx, [[x, y], [x + len, y]], wdt, null, 1); }
          else { const x = along * T.W, y = T.H * (1 - CUR.k) + (R() - 0.5) * 120 * u; inkLine(ctx, [[x, y], [x, y + len]], wdt, null, 1); }
        }
        ctx.restore();
      }
      const isStatic = (id) => id === "title" || id === "closing";
      if (CUR.prev && CUR.k < 1 && isStatic(CUR.prev.id)) {
        staticPanel(ctx, S, CUR.prev.id, panelOffset(false, clamp(info.local / CUR.change)), CUR.prev.hold + info.local, CUR.prev.hold);
      }
      if (info.scene && isStatic(info.scene)) staticPanel(ctx, S, info.scene, panelOffset(true), info.local, info.hold);
    },
    scenes: { chart: scene("chart"), object: scene("object"), people: scene("people"), process: scene("process"), compare: scene("compare") },
  };
});
