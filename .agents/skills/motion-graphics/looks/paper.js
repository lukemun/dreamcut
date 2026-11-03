// Paper: warm editorial print. Cream stock, serif headlines and terracotta for the text templates.
// On the illustrated explainer it becomes an editorial essay collage: every scene is a fresh sheet of
// grained paper slapped over the last, with a torn, fibrous leading edge. Halftone photo scraps with
// torn borders, newsprint clippings, masking tape, cut-out labels, ransom-cut numbers, a scrolling
// film strip, highlighter sweeps and red marker notes are all drawn here, from original drawings.
// Every frame is a pure function of time: seeded randomness only, no clocks.
window.DreamcutMotion.register("paper", ({ grain, rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const hash = (s) => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
  const R = (key) => rng(hash(key) || 1);
  // Slow, never-repeating drift for things pinned to the board.
  const sway = (t, seed, f = 1) => Math.sin(t * 1.1 * f + seed * 7.3) * 0.62 + Math.sin(t * 0.53 * f + seed * 3.1) * 0.38;

  const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif";
  const COND = "'Avenir Next Condensed', 'Futura', 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif";
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  const font = (g, w, size, fam, italic) => { g.font = `${italic ? "italic " : ""}${w} ${size}px ${fam}`; };

  function lumOf(c) {
    const s = String(c || "");
    let r = 128, gg = 128, b = 128;
    if (s[0] === "#") { const h = s.length === 4 ? s.slice(1).split("").map((x) => x + x).join("") : s.slice(1, 7); const n = parseInt(h, 16); r = (n >> 16) & 255; gg = (n >> 8) & 255; b = n & 255; }
    else { const m = s.match(/rgba?\(([^)]+)\)/); if (m) [r, gg, b] = m[1].split(",").map(Number); }
    return r * 0.3 + gg * 0.59 + b * 0.11;
  }

  // ---- torn and cut paper ---------------------------------------------------------------------------
  // A rectangle of paper centred on 0,0. Torn sides wander and fray; cut sides are scissor-straight.
  const POLY = new Map();
  function tornPts(key, w, h, sides, rough, u) {
    const k = `${key}|${w | 0}|${h | 0}|${sides}|${rough}|${u.toFixed(3)}`;
    let out = POLY.get(k);
    if (out) return out;
    const r = R(k), amp = 5.5 * u * rough, step = 8 * u;
    out = [];
    const edge = (x0, y0, x1, y1, nx, ny, torn) => {
      const L = Math.hypot(x1 - x0, y1 - y0), n = torn ? Math.max(2, Math.ceil(L / step)) : 1;
      let drift = 0;
      for (let i = 0; i < n; i++) {
        const f = i / n;
        let off = (r() - 0.5) * u * 1.1;
        if (torn && i > 0) { drift = drift * 0.72 + (r() - 0.5) * amp; off = drift + (r() - 0.5) * amp * 0.55; }
        out.push(x0 + (x1 - x0) * f + nx * off, y0 + (y1 - y0) * f + ny * off);
      }
    };
    const x0 = -w / 2, y0 = -h / 2, x1 = w / 2, y1 = h / 2;
    edge(x0, y0, x1, y0, 0, -1, sides.includes("t"));
    edge(x1, y0, x1, y1, 1, 0, sides.includes("r"));
    edge(x1, y1, x0, y1, 0, 1, sides.includes("b"));
    edge(x0, y1, x0, y0, -1, 0, sides.includes("l"));
    POLY.set(k, out);
    return out;
  }
  function trace(g, pts) { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); }

  // One piece of paper: a soft cast shadow, a pale fibrous rim where it was torn, the face, then its contents.
  function scrap(g, F, key, x, y, w, h, o = {}) {
    const { u, T } = F, sides = o.sides ?? "trbl", rough = o.rough ?? 1;
    const face = tornPts(key, w, h, sides, rough, u);
    g.save();
    g.translate(x, y);
    if (o.rot) g.rotate(o.rot);
    if (o.s != null && o.s !== 1) g.scale(o.s, o.s);
    if (o.a != null) g.globalAlpha *= clamp(o.a);
    const lift = o.lift ?? 1;
    if (o.shadow !== false) {
      g.save();
      g.shadowColor = T.shadow; g.shadowBlur = 16 * u * lift; g.shadowOffsetX = 2 * u * lift; g.shadowOffsetY = 7 * u * lift;
      trace(g, face); g.fillStyle = o.fill || T.paper2; g.fill();
      g.restore();
    }
    if (sides && o.fibre !== false) {
      const f = 3.2 * u;
      const fl = sides.includes("l") ? f : 0, fr = sides.includes("r") ? f : 0, ft = sides.includes("t") ? f : 0, fb = sides.includes("b") ? f : 0;
      const rim = tornPts(key + "~", w + fl + fr, h + ft + fb, sides, rough * 1.25, u);
      g.save(); g.translate((fr - fl) / 2, (fb - ft) / 2); trace(g, rim); g.fillStyle = T.fibre; g.fill(); g.restore();
    }
    trace(g, face); g.fillStyle = o.fill || T.paper2; g.fill();
    if (o.inner) { g.save(); trace(g, face); g.clip(); o.inner(g, w, h); g.restore(); }
    g.restore();
  }

  // Masking tape with zig-zag torn ends.
  function tape(g, F, x, y, w, rot, seed, a = 1) {
    const { u, T } = F, h = w * 0.3, r = R("tape" + seed), teeth = 5;
    g.save(); g.translate(x, y); g.rotate(rot); g.globalAlpha *= a;
    g.beginPath();
    g.moveTo(-w / 2, -h / 2);
    g.lineTo(w / 2, -h / 2);
    for (let i = 1; i <= teeth; i++) g.lineTo(w / 2 + (i % 2 ? 4 : -1) * u + (r() - 0.5) * 2 * u, -h / 2 + (h * i) / teeth);
    g.lineTo(-w / 2, h / 2);
    for (let i = teeth - 1; i >= 0; i--) g.lineTo(-w / 2 + (i % 2 ? -4 : 1) * u + (r() - 0.5) * 2 * u, -h / 2 + (h * i) / teeth);
    g.closePath();
    g.shadowColor = "rgba(60,40,20,0.12)"; g.shadowBlur = 4 * u; g.shadowOffsetY = 1.5 * u;
    g.fillStyle = T.tape; g.fill();
    g.shadowColor = "transparent";
    g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(-w / 2 + 3 * u, -h / 2 + h * 0.18, w - 6 * u, h * 0.16);
    g.restore();
  }
  function pin(g, F, x, y, col) {
    const { u } = F;
    g.save();
    g.fillStyle = "rgba(40,25,10,0.25)"; g.beginPath(); g.ellipse(x + 6 * u, y + 9 * u, 11 * u, 6 * u, 0.4, 0, TAU); g.fill();
    const gr = g.createRadialGradient(x - 4 * u, y - 4 * u, 1, x, y, 13 * u);
    gr.addColorStop(0, "rgba(255,255,255,0.75)"); gr.addColorStop(0.25, col); gr.addColorStop(1, "rgba(0,0,0,0.55)");
    g.fillStyle = col; g.beginPath(); g.arc(x, y, 12 * u, 0, TAU); g.fill();
    g.fillStyle = gr; g.globalAlpha *= 0.55; g.fill();
    g.restore();
  }

  // ---- marker pen and highlighter ------------------------------------------------------------------
  function inkLine(g, pts, q, color, width) {
    if (q <= 0 || pts.length < 4) return;
    let total = 0;
    for (let i = 2; i < pts.length; i += 2) total += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
    let left = total * clamp(q);
    g.save();
    g.strokeStyle = color; g.lineWidth = width; g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath(); g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) {
      const dx = pts[i] - pts[i - 2], dy = pts[i + 1] - pts[i - 1], d = Math.hypot(dx, dy);
      if (d >= left) { const k = d ? left / d : 0; g.lineTo(pts[i - 2] + dx * k, pts[i - 1] + dy * k); break; }
      left -= d; g.lineTo(pts[i], pts[i + 1]);
    }
    g.stroke();
    g.restore();
  }
  function mCurve(x1, y1, x2, y2, bend, seed, u) {
    const r = R("mc" + seed), L = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / L, ny = (x2 - x1) / L;
    const cx = (x1 + x2) / 2 + nx * bend, cy = (y1 + y2) / 2 + ny * bend, out = [], n = 28;
    for (let i = 0; i <= n; i++) {
      const f = i / n, a = (1 - f) * (1 - f), b = 2 * f * (1 - f), c = f * f, j = Math.sin(f * Math.PI) * 2.2 * u;
      out.push(a * x1 + b * cx + c * x2 + (r() - 0.5) * j, a * y1 + b * cy + c * y2 + (r() - 0.5) * j);
    }
    return out;
  }
  function mOval(cx, cy, rx, ry, seed, u) {
    const r = R("mo" + seed), a0 = -2.2 + r() * 0.5, turns = 1.12, n = 56, out = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n, a = a0 + f * TAU * turns, k = 1 + 0.06 * Math.sin(f * 7 + r()) + f * 0.05;
      out.push(cx + Math.cos(a) * rx * k + (r() - 0.5) * 1.6 * u, cy + Math.sin(a) * ry * k + (r() - 0.5) * 1.6 * u);
    }
    return out;
  }
  function mArrow(g, F, x1, y1, x2, y2, bend, q, seed, col) {
    if (q <= 0) return [];
    const { u } = F, pts = mCurve(x1, y1, x2, y2, bend, seed, u), w = 5.5 * u;
    inkLine(g, pts, span(q, 0, 0.82), col, w);
    const k = span(q, 0.82, 1);
    if (k > 0) {
      const n = pts.length, ang = Math.atan2(pts[n - 1] - pts[n - 5], pts[n - 2] - pts[n - 6]), s = 26 * u;
      for (const side of [-1, 1]) {
        const a = ang + Math.PI + side * 0.5;
        inkLine(g, [pts[n - 2], pts[n - 1], pts[n - 2] + Math.cos(a) * s, pts[n - 1] + Math.sin(a) * s], k, col, w);
      }
    }
    return pts;
  }
  // Highlighter: a translucent, slightly uneven sweep that multiplies into the paper under the words.
  function hilite(g, F, x, y, w, h, q, seed) {
    if (q <= 0) return;
    const r = R("hl" + seed), ww = w * eo(q), u = F.u;
    g.save();
    g.globalCompositeOperation = "multiply";
    g.fillStyle = F.T.hi; g.globalAlpha *= 0.88;
    g.beginPath();
    g.moveTo(x + r() * 6 * u, y + (r() - 0.5) * 4 * u);
    const n = 6;
    for (let i = 1; i <= n; i++) g.lineTo(x + (ww * i) / n, y + (r() - 0.5) * 5 * u);
    g.lineTo(x + ww + 6 * u, y + h + (r() - 0.5) * 4 * u);
    for (let i = n - 1; i >= 0; i--) g.lineTo(x + (ww * i) / n, y + h + (r() - 0.5) * 5 * u);
    g.closePath(); g.fill();
    g.restore();
  }

  // ---- lettering -----------------------------------------------------------------------------------
  function onColor(F, bg) { return lumOf(bg) > 135 ? F.T.text : F.T.onBlack; }
  // A cut-out label: condensed capitals on a scissor-cut slip, slapped down with its words already on it.
  function label(g, F, text, x, y, size, o = {}) {
    text = String(text ?? "").toUpperCase();
    const k = o.k ?? 1;
    if (!text || k <= 0) return null;
    const { u } = F;
    font(g, 700, size, COND); g.letterSpacing = size * 0.03 + "px";
    let tw = g.measureText(text).width;
    if (o.maxW && tw + size * 0.76 > o.maxW) {
      size = Math.max(o.min ?? 42 * u, (size * (o.maxW - size * 0.76)) / tw);
      font(g, 700, size, COND); g.letterSpacing = size * 0.03 + "px";
      tw = g.measureText(text).width;
    }
    const padX = size * 0.38, w = tw + padX * 2, h = size * 1.32;
    const cx = o.align === "center" ? x : o.align === "right" ? x - w / 2 : x + w / 2;
    const s = lerp(1.32, 1, eo(k)), a = clamp(k * 2.5), rot = o.rot ?? 0, bg = o.bg ?? F.T.black;
    scrap(g, F, "lab" + text + (o.seed || 0), cx, y, w, h, { fill: bg, sides: o.torn ? "lr" : "", rot, s, a, lift: 0.7 });
    g.save();
    g.translate(cx, y); g.rotate(rot); g.scale(s, s); g.globalAlpha *= a;
    g.fillStyle = o.fg ?? onColor(F, bg); g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(text, 0, size * 0.05);
    g.restore();
    g.letterSpacing = "0px";
    return { w, h, cx, size };
  }

  const LAY = new Map();
  function wrap(g, text, size, maxW, fam, weight) {
    font(g, weight, size, fam);
    const words = String(text ?? "").split(/\s+/).filter(Boolean), lines = [];
    let cur = "";
    for (const wd of words) {
      const next = cur ? cur + " " + wd : wd;
      if (cur && g.measureText(next).width > maxW) { lines.push(cur); cur = wd; } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines.map((s) => ({ s, w: g.measureText(s).width }));
  }
  function headLayout(g, text, maxW, size, min, maxLines, fam = SERIF, weight = 700) {
    const key = [text, maxW | 0, size | 0, min | 0, maxLines, fam, weight].join("|");
    if (LAY.has(key)) return LAY.get(key);
    let s = size, lines;
    for (;;) {
      lines = wrap(g, text, s, maxW, fam, weight);
      const widest = Math.max(0, ...lines.map((l) => l.w));
      if ((lines.length <= maxLines && widest <= maxW) || s <= min) break;
      s = Math.max(min, s * 0.95);
    }
    const lay = { size: s, lines };
    LAY.set(key, lay);
    return lay;
  }
  const lineH = (lay, u) => lay.size * 1.24 + 8 * u;
  // A headline cut into strips, one torn strip per line, each slapped down with its line already printed.
  function drawHead(g, F, lay, x, y, b, o = {}) {
    const { u, t } = F, sz = lay.size, h = sz * 1.24, padX = sz * 0.34, at = o.at ?? 0.12;
    lay.lines.forEach((ln, i) => {
      const k = span(b, at + i * 0.1, at + i * 0.1 + 0.24);
      if (k <= 0) return;
      const st = o.styles[i % o.styles.length], r = R((o.key || "h") + i + ln.s);
      const w = ln.w + padX * 2, jx = (r() - 0.5) * 22 * u, rot = (r() - 0.5) * 0.028 + sway(t, i + 3, 0.7) * 0.004;
      const cy = y + i * lineH(lay, u) + h / 2, cx = o.align === "center" ? x + jx : x + w / 2 + Math.abs(jx) * 0.5;
      const s = lerp(1.16, 1, eo(k)), a = clamp(k * 3);
      scrap(g, F, (o.key || "h") + "s" + i + ln.s, cx, cy, w, h, { fill: st.bg, sides: "lr", rot, s, a, rough: 1.2 });
      g.save();
      g.translate(cx, cy); g.rotate(rot); g.scale(s, s); g.globalAlpha *= a;
      if (o.hl === i) hilite(g, F, -w / 2 + padX * 0.55, -sz * 0.02, w - padX * 1.1, sz * 0.46, o.hlq ?? 1, (o.key || "h") + i);
      font(g, 700, sz, SERIF);
      g.fillStyle = st.fg; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(ln.s, 0, sz * 0.06);
      g.restore();
    });
    return y + lay.lines.length * lineH(lay, u);
  }
  // Ransom-cut figures: every character on its own scrap, alternating serif and condensed type.
  function ransom(g, F, str, x, y, size, o = {}) {
    const chars = [...String(str)], { u, T, t } = F;
    if (!chars.length) return 0;
    const bgs = o.bgs || [T.paper2, T.black, F.acc, T.news];
    const items = chars.map((ch, i) => {
      const fam = (i + (o.shift || 0)) % 2 ? COND : SERIF, wt = fam === COND ? 800 : 700;
      font(g, wt, size, fam);
      return { ch, fam, wt, w: Math.max(g.measureText(ch).width, size * 0.28) + size * 0.22 };
    });
    const gap = size * 0.04, total = items.reduce((s, it) => s + it.w, 0) + gap * (items.length - 1);
    if (o.maxW && total > o.maxW && size > 30 * u) return ransom(g, F, str, x, y, size * (o.maxW / total), { ...o, maxW: 0 });
    let cx = o.align === "center" ? x - total / 2 : o.align === "right" ? x - total : x;
    items.forEach((it, i) => {
      const r = R("rn" + (o.seed || 0) + "|" + i), bg = bgs[(i + (o.shift || 0)) % bgs.length];
      const k = o.b == null ? 1 : span(o.b, (o.at || 0) + i * 0.05, (o.at || 0) + i * 0.05 + 0.2);
      if (k > 0) {
        const rot = (r() - 0.5) * 0.13 + sway(t, i + (o.seed || 0), 0.8) * 0.012, dy = (r() - 0.5) * size * 0.09, hh = size * 1.12 * (0.94 + r() * 0.14);
        const s = lerp(1.35, 1, eo(k)), a = clamp(k * 3);
        scrap(g, F, "rc" + (o.seed || 0) + i + it.ch + (size | 0), cx + it.w / 2, y + dy, it.w, hh, { fill: bg, sides: r() < 0.5 ? "tb" : "", rot, s, a, lift: 0.8 });
        g.save();
        g.translate(cx + it.w / 2, y + dy); g.rotate(rot); g.scale(s, s); g.globalAlpha *= a;
        font(g, it.wt, size, it.fam);
        g.fillStyle = onColor(F, bg); g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(it.ch, 0, size * 0.07);
        g.restore();
      }
      cx += it.w + gap;
    });
    return total;
  }
  const fmt = (v, d) => window.DreamcutMotion.formatNumber(v, 0, d.prefix || "", d.suffix || "");

  // ---- halftone photographs ------------------------------------------------------------------------
  // Original greyscale drawings, painted small and printed as a halftone dot screen.
  const gr = (v) => `rgb(${v | 0},${v | 0},${v | 0})`;
  const PAINT = {
    camera(g, w, h) {
      const m = Math.min(w, h);
      let gd = g.createLinearGradient(0, 0, 0, h);
      gd.addColorStop(0, gr(228)); gd.addColorStop(0.68, gr(182)); gd.addColorStop(0.68, gr(150)); gd.addColorStop(1, gr(112));
      g.fillStyle = gd; g.fillRect(-w, -h, w * 3, h * 3);
      gd = g.createRadialGradient(w * 0.22, h * 0.15, 0, w * 0.22, h * 0.15, m * 0.8);
      gd.addColorStop(0, "rgba(255,255,255,0.6)"); gd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gd; g.fillRect(0, 0, w, h);
      g.fillStyle = "rgba(0,0,0,0.35)"; g.beginPath(); g.ellipse(w * 0.5, h * 0.96, w * 0.3, h * 0.035, 0, 0, TAU); g.fill();
      g.strokeStyle = gr(38); g.lineWidth = m * 0.03; g.lineCap = "round";
      g.beginPath(); g.moveTo(w * 0.5, h * 0.6); g.lineTo(w * 0.29, h * 0.97); g.moveTo(w * 0.5, h * 0.6); g.lineTo(w * 0.71, h * 0.97); g.stroke();
      g.strokeStyle = gr(80); g.beginPath(); g.moveTo(w * 0.5, h * 0.6); g.lineTo(w * 0.53, h * 0.99); g.stroke();
      gd = g.createLinearGradient(w * 0.34, 0, w * 0.7, 0); gd.addColorStop(0, gr(78)); gd.addColorStop(1, gr(22));
      g.fillStyle = gd; g.fillRect(w * 0.34, h * 0.4, w * 0.34, h * 0.21);
      g.fillStyle = gr(130); g.fillRect(w * 0.34, h * 0.4, w * 0.34, h * 0.012);
      gd = g.createLinearGradient(0, h * 0.45, 0, h * 0.56); gd.addColorStop(0, gr(70)); gd.addColorStop(0.5, gr(18)); gd.addColorStop(1, gr(55));
      g.fillStyle = gd; g.fillRect(w * 0.2, h * 0.452, w * 0.15, h * 0.1);
      g.fillStyle = gr(12); g.beginPath(); g.ellipse(w * 0.2, h * 0.502, w * 0.022, h * 0.066, 0, 0, TAU); g.fill();
      g.strokeStyle = gr(150); g.lineWidth = m * 0.008; g.stroke();
      g.fillStyle = gr(48); g.fillRect(w * 0.68, h * 0.44, w * 0.07, h * 0.06);
      for (const [x, y, r] of [[0.43, 0.27, 0.13], [0.6, 0.255, 0.145]]) {
        const X = w * x, Y = h * y, Rr = m * r;
        g.fillStyle = gr(32); g.beginPath(); g.arc(X, Y, Rr, 0, TAU); g.fill();
        g.strokeStyle = gr(112); g.lineWidth = m * 0.012; g.stroke();
        g.fillStyle = gr(165); g.beginPath(); g.arc(X, Y, Rr * 0.18, 0, TAU); g.fill();
        g.fillStyle = gr(140);
        for (let k = 0; k < 3; k++) { const a = k * (TAU / 3) + 0.4; g.beginPath(); g.arc(X + Math.cos(a) * Rr * 0.55, Y + Math.sin(a) * Rr * 0.55, Rr * 0.2, 0, TAU); g.fill(); }
      }
      g.fillStyle = gr(150); g.beginPath(); g.arc(w * 0.62, h * 0.5, m * 0.022, 0, TAU); g.fill();
      g.beginPath(); g.arc(w * 0.62, h * 0.56, m * 0.014, 0, TAU); g.fill();
    },
    land(g, w, h, v) {
      const r = R("land" + v), m = Math.min(w, h);
      let gd = g.createLinearGradient(0, 0, 0, h * 0.62);
      gd.addColorStop(0, gr(236)); gd.addColorStop(1, gr(196));
      g.fillStyle = gd; g.fillRect(-w, -h, w * 3, h * 3);
      const sx = w * (0.55 + r() * 0.25), sy = h * (0.22 + r() * 0.12);
      gd = g.createRadialGradient(sx, sy, 0, sx, sy, m * 0.3); gd.addColorStop(0, "rgba(255,255,255,1)"); gd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gd; g.fillRect(0, 0, w, h);
      g.fillStyle = gr(255); g.beginPath(); g.arc(sx, sy, m * 0.07, 0, TAU); g.fill();
      for (const [base, top, tone] of [[0.6, 0.3, 152], [0.7, 0.42, 96]]) {
        g.fillStyle = gr(tone); g.beginPath(); g.moveTo(-w * 0.1, h * base);
        for (let x = -0.1; x <= 1.15; x += 0.14) g.lineTo(w * x, h * (top + r() * (base - top)));
        g.lineTo(w * 1.2, h * base); g.lineTo(w * 1.2, h * 1.2); g.lineTo(-w * 0.1, h * 1.2); g.fill();
      }
      gd = g.createLinearGradient(0, h * 0.7, 0, h); gd.addColorStop(0, gr(178)); gd.addColorStop(1, gr(118));
      g.fillStyle = gd; g.fillRect(-w, h * 0.7, w * 3, h);
      g.fillStyle = "rgba(255,255,255,0.55)";
      for (let k = 0; k < 6; k++) g.fillRect(sx - m * (0.08 - k * 0.008), h * (0.73 + k * 0.035), m * (0.16 - k * 0.016), h * 0.012);
      g.fillStyle = gr(40); g.beginPath(); g.moveTo(-w * 0.1, h); g.lineTo(-w * 0.1, h * 0.8); g.quadraticCurveTo(w * 0.2, h * 0.78, w * 0.38, h); g.fill();
      const tx = w * 0.14;
      for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(tx, h * (0.48 + k * 0.08)); g.lineTo(tx - m * (0.06 + k * 0.025), h * (0.62 + k * 0.08)); g.lineTo(tx + m * (0.06 + k * 0.025), h * (0.62 + k * 0.08)); g.fill(); }
    },
    face(g, w, h, v) {
      const r = R("face" + v), m = Math.min(w, h);
      let gd = g.createLinearGradient(0, 0, w, h);
      gd.addColorStop(0, gr(222 - (v % 3) * 18)); gd.addColorStop(1, gr(158 - (v % 2) * 20));
      g.fillStyle = gd; g.fillRect(-w, -h, w * 3, h * 3);
      const cx = w * (0.5 + (r() - 0.5) * 0.06), hy = h * 0.42, rx = m * 0.2, ry = m * 0.25;
      const hairTone = [26, 70, 40, 18, 110, 55][v % 6], clothTone = [48, 92, 130, 36, 70, 150][v % 6];
      if (v % 6 === 1 || v % 6 === 4) { g.fillStyle = gr(hairTone); g.beginPath(); g.ellipse(cx, hy + ry * 0.55, rx * 1.38, ry * 1.45, 0, 0, TAU); g.fill(); }
      g.fillStyle = gr(clothTone); g.beginPath(); g.ellipse(cx, h * 1.04, w * 0.45, h * 0.33, 0, 0, TAU); g.fill();
      g.fillStyle = gr(Math.min(235, clothTone + 70)); g.beginPath(); g.moveTo(cx - rx * 0.6, h * 0.73); g.lineTo(cx, h * 0.86); g.lineTo(cx + rx * 0.6, h * 0.73); g.lineTo(cx + rx * 0.4, h * 0.72); g.lineTo(cx, h * 0.8); g.lineTo(cx - rx * 0.4, h * 0.72); g.fill();
      g.fillStyle = gr(140); g.fillRect(cx - rx * 0.42, hy + ry * 0.6, rx * 0.84, ry * 0.75);
      gd = g.createRadialGradient(cx - rx * 0.35, hy - ry * 0.3, 0, cx, hy, ry * 1.15);
      gd.addColorStop(0, gr(236)); gd.addColorStop(1, gr(128));
      g.fillStyle = gd; g.beginPath(); g.ellipse(cx, hy, rx, ry, 0, 0, TAU); g.fill();
      g.fillStyle = gr(hairTone);
      const style = v % 6;
      g.save(); g.beginPath();
      if (style === 0 || style === 1 || style === 4) { g.ellipse(cx, hy - ry * 0.42, rx * 1.08, ry * 0.68, 0, Math.PI, TAU); g.fill(); }
      else if (style === 2) { g.ellipse(cx, hy - ry * 0.45, rx * 1.05, ry * 0.64, 0, Math.PI, TAU); g.fill(); g.beginPath(); g.arc(cx + rx * 0.1, hy - ry * 1.12, rx * 0.45, 0, TAU); g.fill(); }
      else if (style === 3) { for (let k = 0; k < 9; k++) { const a = Math.PI + (k / 8) * Math.PI; g.beginPath(); g.arc(cx + Math.cos(a) * rx * 0.95, hy - ry * 0.25 + Math.sin(a) * ry * 0.9, rx * 0.34, 0, TAU); g.fill(); } }
      else { g.fillStyle = gr(64); g.ellipse(cx, hy - ry * 0.5, rx * 1.1, ry * 0.7, 0, Math.PI, TAU); g.fill(); g.fillStyle = gr(110); g.fillRect(cx - rx * 1.1, hy - ry * 0.58, rx * 2.2, ry * 0.18); }
      g.restore();
      if (style === 4) { g.fillStyle = gr(hairTone); g.beginPath(); g.ellipse(cx - rx * 0.3, hy - ry * 0.55, rx * 0.8, ry * 0.32, -0.3, 0, TAU); g.fill(); }
      const ey = hy + ry * 0.02;
      g.fillStyle = gr(35);
      for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * rx * 0.4, ey, rx * 0.1, ry * 0.055, 0, 0, TAU); g.fill(); g.fillRect(cx + s * rx * 0.4 - rx * 0.16, ey - ry * 0.2, rx * 0.32, ry * 0.045); }
      g.fillStyle = "rgba(0,0,0,0.22)"; g.beginPath(); g.moveTo(cx + rx * 0.02, ey + ry * 0.06); g.lineTo(cx + rx * 0.14, ey + ry * 0.36); g.lineTo(cx - rx * 0.04, ey + ry * 0.38); g.fill();
      g.strokeStyle = gr(86); g.lineWidth = m * 0.016; g.lineCap = "round"; g.beginPath(); g.arc(cx, ey + ry * 0.36, rx * 0.32, 0.25 * Math.PI, 0.75 * Math.PI); g.stroke();
      if (v % 3 === 1) { g.strokeStyle = gr(24); g.lineWidth = m * 0.014; for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * rx * 0.4, ey, rx * 0.25, 0, TAU); g.stroke(); } g.beginPath(); g.moveTo(cx - rx * 0.15, ey); g.lineTo(cx + rx * 0.15, ey); g.stroke(); }
      gd = g.createLinearGradient(cx - rx, 0, cx + rx * 1.4, 0); gd.addColorStop(0.55, "rgba(0,0,0,0)"); gd.addColorStop(1, "rgba(0,0,0,0.3)");
      g.fillStyle = gd; g.fillRect(0, 0, w, h);
    },
    city(g, w, h, v) {
      const r = R("city" + v);
      const gd = g.createLinearGradient(0, 0, 0, h); gd.addColorStop(0, gr(232)); gd.addColorStop(1, gr(190));
      g.fillStyle = gd; g.fillRect(-w, -h, w * 3, h * 3);
      let x = -w * 0.05;
      while (x < w * 1.05) {
        const bw = w * (0.08 + r() * 0.12), bh = h * (0.3 + r() * 0.5), tone = 50 + r() * 80;
        g.fillStyle = gr(tone); g.fillRect(x, h - bh, bw, bh);
        g.fillStyle = gr(tone + 90);
        for (let yy = h - bh + h * 0.05; yy < h - h * 0.05; yy += h * 0.07) for (let xx = x + bw * 0.15; xx < x + bw * 0.85; xx += bw * 0.25) if (r() > 0.35) g.fillRect(xx, yy, bw * 0.12, h * 0.03);
        x += bw + w * 0.01;
      }
    },
    reel(g, w, h) {
      const m = Math.min(w, h);
      let gd = g.createLinearGradient(0, 0, w, h); gd.addColorStop(0, gr(210)); gd.addColorStop(1, gr(140));
      g.fillStyle = gd; g.fillRect(-w, -h, w * 3, h * 3);
      const cx = w * 0.5, cy = h * 0.5, Rr = m * 0.42;
      g.fillStyle = "rgba(0,0,0,0.3)"; g.beginPath(); g.arc(cx + m * 0.04, cy + m * 0.05, Rr, 0, TAU); g.fill();
      g.fillStyle = gr(48); g.beginPath(); g.arc(cx, cy, Rr, 0, TAU); g.fill();
      g.fillStyle = gr(30); g.beginPath(); g.arc(cx, cy, Rr * 0.78, 0, TAU); g.fill();
      g.strokeStyle = "rgba(255,255,255,0.18)"; g.lineWidth = m * 0.01;
      for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(cx, cy, Rr * (0.4 + k * 0.08), -0.9, 0.1); g.stroke(); }
      g.fillStyle = gr(190);
      for (let k = 0; k < 6; k++) { const a = k * (TAU / 6); g.beginPath(); g.arc(cx + Math.cos(a) * Rr * 0.52, cy + Math.sin(a) * Rr * 0.52, Rr * 0.14, 0, TAU); g.fill(); }
      g.fillStyle = gr(220); g.beginPath(); g.arc(cx, cy, Rr * 0.12, 0, TAU); g.fill();
    },
  };
  const HT = new Map();
  function halftone(F, kind, v, w, h, o = {}) {
    const { u, T } = F, cell = (o.cell ?? 6.4) * u, ink = o.ink || T.dot, paper = o.paper || T.photo;
    w = Math.max(8, Math.round(w)); h = Math.max(8, Math.round(h));
    const key = [kind, v, w, h, cell.toFixed(2), ink, paper].join("|");
    if (HT.has(key)) return HT.get(key);
    const cols = Math.ceil(w / cell) + 2, rows = Math.ceil(h / cell) + 2;
    const src = document.createElement("canvas"); src.width = cols; src.height = rows;
    const sg = src.getContext("2d", { willReadFrequently: true });
    sg.scale(cols / (w + 2 * cell), rows / (h + 2 * cell)); sg.translate(cell, cell);
    PAINT[kind](sg, w, h, v || 0);
    const data = sg.getImageData(0, 0, cols, rows).data;
    const out = document.createElement("canvas"); out.width = w; out.height = h;
    const og = out.getContext("2d");
    og.fillStyle = paper; og.fillRect(0, 0, w, h);
    og.fillStyle = ink; og.beginPath();
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = (r * cols + c) * 4, lum = (data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11) / 255;
      const d = clamp((1 - lum - 0.05) * 1.15);
      if (d < 0.025) continue;
      const x = (c - 0.5) * cell + (r % 2 ? cell / 2 : 0), y = (r - 0.5) * cell, rad = cell * 0.6 * Math.sqrt(d);
      og.moveTo(x + rad, y); og.arc(x, y, rad, 0, TAU);
    }
    og.fill();
    HT.set(key, out);
    return out;
  }
  // A halftone print with a paper border, torn or cut, drifting slowly inside its frame.
  function photo(g, F, key, kind, v, x, y, w, h, o = {}) {
    const { u, T, t } = F, bd = (o.border ?? 14) * u, chin = (o.chin ?? 0) * u;
    const iw = Math.max(8, w - bd * 2), ih = Math.max(8, h - bd * 2 - chin);
    const img = halftone(F, kind, v, iw, ih, o);
    const seed = o.seed || 0;
    scrap(g, F, key, x, y, w, h, { ...o, fill: o.fill || T.paper2, inner: () => {
      const ox = -w / 2 + bd, oy = -h / 2 + bd;
      g.save();
      g.beginPath(); g.rect(ox, oy, iw, ih); g.clip();
      const z = 1.08 + 0.05 * Math.sin(t * 0.32 + seed), px = Math.sin(t * 0.23 + seed * 2) * iw * 0.025, py = Math.cos(t * 0.19 + seed) * ih * 0.02;
      g.translate(ox + iw / 2 + px, oy + ih / 2 + py); g.scale(z, z);
      g.drawImage(img, -iw / 2, -ih / 2, iw, ih);
      g.restore();
      g.strokeStyle = "rgba(30,20,10,0.22)"; g.lineWidth = 1.2 * u; g.strokeRect(ox, oy, iw, ih);
      if (o.extra) o.extra(g, ox, oy, iw, ih);
    } });
  }

  // ---- printed matter ------------------------------------------------------------------------------
  function clipping(g, F, key, x, y, w, h, rot, head, o = {}) {
    const { u, T } = F;
    scrap(g, F, key, x, y, w, h, { fill: T.news, rot, sides: o.sides ?? "trbl", rough: 1.35, inner: () => {
      const pad = 22 * u, r = R("clip" + key);
      let yy = -h / 2 + pad + 10 * u;
      font(g, 600, 15 * u, COND); g.letterSpacing = 3 * u + "px";
      g.fillStyle = T.text; g.globalAlpha *= 0.75; g.textBaseline = "alphabetic"; g.textAlign = "left";
      g.fillText(`THE CUTTING ROOM · NO. ${12 + (hash(key) % 80)}`, -w / 2 + pad, yy);
      g.letterSpacing = "0px"; g.globalAlpha /= 0.75;
      yy += 10 * u; g.fillStyle = T.text; g.fillRect(-w / 2 + pad, yy, w - pad * 2, 1.5 * u);
      const hs = Math.min(36 * u, w * 0.085);
      const lines = wrap(g, head, hs, w - pad * 2, SERIF, 700).slice(0, 3);
      yy += hs * 1.15;
      font(g, 700, hs, SERIF);
      for (const l of lines) { g.fillText(l.s, -w / 2 + pad, yy); yy += hs * 1.08; }
      yy += 6 * u;
      const cols = w > 330 * u ? 2 : 1, cg = 18 * u, cw = (w - pad * 2 - cg * (cols - 1)) / cols;
      for (let c = 0; c < cols; c++) {
        let ly = yy;
        const cx0 = -w / 2 + pad + c * (cw + cg);
        if (c === 0 && o.thumb) {
          const th = cw * 0.62, img = halftone(F, o.thumb, 1, cw, th, { cell: 4 });
          g.drawImage(img, cx0, ly, cw, th); ly += th + 10 * u;
        }
        g.fillStyle = T.text; g.globalAlpha *= 0.3;
        while (ly < h / 2 - 8 * u) {
          const end = r() < 0.12;
          g.fillRect(cx0, ly, end ? cw * (0.3 + r() * 0.5) : cw, 5 * u);
          ly += end ? 22 * u : 12 * u;
        }
        g.globalAlpha /= 0.3;
      }
    } });
  }
  // A strip of film that keeps running: sprockets and frames slide along it.
  function film(g, F, x, y, len, hh, rot, speed, frames, seed) {
    const { u, T, t } = F;
    g.save(); g.translate(x, y); g.rotate(rot);
    g.save(); g.shadowColor = T.shadow; g.shadowBlur = 14 * u; g.shadowOffsetY = 6 * u;
    g.fillStyle = T.film; g.fillRect(-len / 2, -hh / 2, len, hh); g.restore();
    g.save(); g.beginPath(); g.rect(-len / 2, -hh / 2, len, hh); g.clip();
    const sp = hh * 0.2, so = (t * speed) % sp;
    g.fillStyle = T.sprocket;
    for (let xx = -len / 2 - sp + so; xx < len / 2 + sp; xx += sp) {
      g.fillRect(xx, -hh / 2 + hh * 0.06, hh * 0.1, hh * 0.08);
      g.fillRect(xx, hh / 2 - hh * 0.14, hh * 0.1, hh * 0.08);
    }
    const fh = hh * 0.6, fw = fh * 1.42, fg = hh * 0.08, step = fw + fg, shift = t * speed, base = Math.floor(shift / step), fo = shift - base * step;
    for (let j = -1; j * step - fo < len + step; j++) {
      const xx = -len / 2 + j * step + fo - step;
      const idx = ((j - base) % frames.length + frames.length * 1000) % frames.length;
      const [kind, v] = frames[idx];
      g.drawImage(halftone(F, kind, v, fw, fh, { cell: 4, paper: T.photo }), xx, -fh / 2, fw, fh);
    }
    g.restore();
    g.restore();
  }
  // Black-paper silhouettes, cut with scissors, with a thin pale edge where the cut caught the fibres.
  function cutShape(g, F, path, fill, shade) {
    g.save();
    g.lineJoin = "round"; g.strokeStyle = F.T.fibre; g.lineWidth = 6 * F.u;
    g.shadowColor = F.T.shadow; g.shadowBlur = 10 * F.u; g.shadowOffsetX = 2 * F.u; g.shadowOffsetY = 5 * F.u;
    g.stroke(path);
    g.shadowColor = "transparent";
    g.fillStyle = fill; g.fill(path, "evenodd");
    if (shade) { g.save(); g.clip(path, "evenodd"); shade(); g.restore(); }
    g.restore();
  }
  // A printed document cut from a newspaper page: torn edges, a halftone picture, typed lines, a dog-ear.
  function iconDoc(g, F, cx, cy, s) {
    const { u, T } = F, w = s * 0.78, h = s * 0.98;
    scrap(g, F, "icdoc" + (s | 0), cx, cy, w, h, { fill: T.news, sides: "rb", rot: -0.05, lift: 0.9, rough: 1.3, inner: (gg, ww, hh) => {
      const iw = ww * 0.8, ih = hh * 0.34;
      gg.drawImage(halftone(F, "land", 7, iw, ih, { cell: 3.4 }), -iw / 2, -hh * 0.4, iw, ih);
      gg.strokeStyle = "rgba(30,20,10,0.3)"; gg.lineWidth = 1 * u; gg.strokeRect(-iw / 2, -hh * 0.4, iw, ih);
      typed(gg, F, -iw / 2, -hh * 0.03, iw, hh * 0.46, "doc" + (s | 0), { size: Math.max(10, (s * 0.075) / u), lines: 3, head: "SCENE 12" });
      const f = ww * 0.2;
      gg.fillStyle = T.card; gg.beginPath(); gg.moveTo(ww / 2 - f, -hh / 2 - 2); gg.lineTo(ww / 2 + 2, -hh / 2 - 2); gg.lineTo(ww / 2 + 2, -hh / 2 + f); gg.closePath(); gg.fill();
      gg.save(); gg.shadowColor = T.shadow; gg.shadowBlur = 6 * u; gg.shadowOffsetX = -2 * u; gg.shadowOffsetY = 3 * u;
      gg.fillStyle = T.paper2; gg.beginPath(); gg.moveTo(ww / 2 - f, -hh / 2); gg.lineTo(ww / 2, -hh / 2 + f); gg.lineTo(ww / 2 - f, -hh / 2 + f); gg.closePath(); gg.fill(); gg.restore();
    } });
    tape(g, F, cx - w * 0.2, cy - h / 2 + 2 * u, s * 0.42, -0.25, 77);
  }
  // Scissors cut from printed stock: a dot-screened steel blade and a red paper handle on each side.
  function iconScissors(g, F, cx, cy, s, open) {
    const T = F.T, u = F.u, cell = Math.max(3 * u, s * 0.035);
    for (const side of [-1, 1]) {
      g.save(); g.translate(cx, cy); g.rotate(side * open - Math.PI / 2);
      const blade = new Path2D(), grip = new Path2D();
      blade.moveTo(-s * 0.06, -side * s * 0.02);
      blade.quadraticCurveTo(s * 0.2, -side * s * 0.15, s * 0.62, -side * s * 0.01);
      blade.quadraticCurveTo(s * 0.3, side * s * 0.06, -s * 0.06, side * s * 0.05);
      blade.closePath();
      grip.moveTo(-s * 0.05, 0); grip.lineTo(-s * 0.2, side * s * 0.1); grip.lineTo(-s * 0.16, side * s * 0.16); grip.lineTo(-s * 0.02, side * s * 0.06); grip.closePath();
      const hx = -s * 0.3, hy = side * s * 0.2;
      grip.moveTo(hx + s * 0.15, hy); grip.arc(hx, hy, s * 0.15, 0, TAU);
      grip.moveTo(hx + s * 0.085, hy); grip.arc(hx, hy, s * 0.085, 0, TAU, true);
      cutShape(g, F, blade, T.photo, () => dots(g, -s * 0.1, -s * 0.2, s * 0.8, s * 0.4, cell, T.dot, (nx, ny) => 0.12 + nx * 0.55 + (side < 0 ? 0.15 : 0) - Math.abs(ny - 0.5) * 0.3));
      cutShape(g, F, grip, side < 0 ? T.black : F.acc, () => dots(g, -s * 0.48, -s * 0.4, s * 0.5, s * 0.8, cell, side < 0 ? "rgba(255,250,240,0.35)" : T.accDeep, (nx, ny) => side < 0 ? 0.35 - nx * 0.3 : 0.1 + ny * 0.45));
      g.restore();
    }
    g.fillStyle = F.T.fibre; g.beginPath(); g.arc(cx, cy, s * 0.035, 0, TAU); g.fill();
    g.fillStyle = F.T.black; g.beginPath(); g.arc(cx, cy, s * 0.018, 0, TAU); g.fill();
  }
  // A rubber stamp cut from kraft and black card, dot-shaded so it reads as a printed picture.
  function iconStamp(g, F, cx, cy, s, lift) {
    const T = F.T, u = F.u, y = cy - lift * s * 0.22, cell = Math.max(3 * u, s * 0.035);
    const wood = new Path2D(), base = new Path2D();
    wood.arc(cx, y - s * 0.34, s * 0.14, 0, TAU);
    wood.rect(cx - s * 0.06, y - s * 0.24, s * 0.12, s * 0.2);
    base.moveTo(cx - s * 0.32, y + s * 0.12); base.lineTo(cx - s * 0.22, y - s * 0.05); base.lineTo(cx + s * 0.22, y - s * 0.05); base.lineTo(cx + s * 0.32, y + s * 0.12); base.closePath();
    // The stamp's shadow grows as it comes down and tightens when it lands.
    g.save(); g.fillStyle = `rgba(40,25,10,${0.28 - lift * 0.14})`; g.beginPath(); g.ellipse(cx + s * 0.05, cy + s * 0.2, s * (0.3 + lift * 0.12), s * 0.05, 0, 0, TAU); g.fill(); g.restore();
    cutShape(g, F, wood, T.kraft, () => dots(g, cx - s * 0.16, y - s * 0.5, s * 0.32, s * 0.46, cell, T.accDeep, (nx) => 0.08 + nx * 0.5));
    cutShape(g, F, base, T.black, () => dots(g, cx - s * 0.32, y - s * 0.05, s * 0.64, s * 0.17, cell, "rgba(255,250,240,0.4)", (nx) => 0.45 - nx * 0.4));
    scrap(g, F, "icpad" + (s | 0), cx, y + s * 0.15, s * 0.66, s * 0.07, { fill: F.acc, sides: "tb", lift: 0.4 });
  }
  // A rubber-stamp impression with ink that did not quite take everywhere.
  function stampMark(g, F, text, x, y, size, rot, k, col) {
    if (k <= 0) return;
    const { u } = F, s = lerp(1.7, 1, eo(k));
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s); g.globalAlpha *= clamp(k * 3) * 0.92;
    font(g, 800, size, COND); g.letterSpacing = size * 0.08 + "px";
    const tw = g.measureText(text).width, w = tw + size * 0.9, h = size * 1.55;
    g.strokeStyle = col; g.lineWidth = 5 * u; g.strokeRect(-w / 2, -h / 2, w, h);
    g.lineWidth = 2 * u; g.strokeRect(-w / 2 + 9 * u, -h / 2 + 9 * u, w - 18 * u, h - 18 * u);
    g.fillStyle = col; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, size * 0.04, size * 0.06);
    g.letterSpacing = "0px";
    g.globalCompositeOperation = "destination-out";
    const r = R("stamp" + text);
    for (let i = 0; i < 45; i++) { g.beginPath(); g.arc((r() - 0.5) * w, (r() - 0.5) * h, (0.6 + r() * 1.6) * u, 0, TAU); g.fill(); }
    g.restore();
  }

  // A black card bar with pale stripes cut and pasted across it, like a slate's clapper.
  function stripedBar(g, F, x, y, w, h, slant) {
    const p = new Path2D(); p.rect(x, y, w, h);
    cutShape(g, F, p, F.T.black, () => {
      g.fillStyle = F.T.paper2;
      const step = h * 1.5;
      for (let sx = x - h; sx < x + w + h; sx += step * 2) { g.beginPath(); g.moveTo(sx, y + h); g.lineTo(sx + step, y + h); g.lineTo(sx + step + h * slant, y); g.lineTo(sx + h * slant, y); g.closePath(); g.fill(); }
    });
  }
  // A clapper slate cut from black card: chalk-ruled body, a striped arm that keeps lifting and snapping shut.
  function slate(g, F, cx, cy, s, rot, b, seed) {
    const { u, T } = F, per = 1.9, ph = (((b + seed * 0.7) % per) + per) % per;
    const open = ph < 0.55 ? eo(ph / 0.55) : ph < 1.4 ? 1 : 1 - span(ph, 1.4, 1.48), snap = ph - 1.48;
    const jolt = snap >= 0 ? Math.exp(-snap * 8) * Math.sin(snap * 40) * 0.025 : 0;
    g.save(); g.translate(cx, cy); g.rotate(rot + jolt);
    const body = new Path2D(); body.rect(-s / 2, -s * 0.3, s, s * 0.64);
    cutShape(g, F, body, T.black, () => {
      g.strokeStyle = "rgba(246,239,227,0.62)"; g.lineWidth = 2.4 * u;
      g.beginPath(); g.moveTo(-s * 0.46, -s * 0.06); g.lineTo(s * 0.46, -s * 0.06); g.moveTo(-s * 0.46, s * 0.15); g.lineTo(s * 0.46, s * 0.15); g.moveTo(-s * 0.02, -s * 0.06); g.lineTo(-s * 0.02, s * 0.3); g.stroke();
      g.fillStyle = "rgba(246,239,227,0.85)"; g.textAlign = "left"; g.textBaseline = "alphabetic";
      font(g, 700, s * 0.07, COND); g.fillText("ROLL", -s * 0.44, -s * 0.2); g.fillText("SCENE", -s * 0.44, s * 0.02); g.fillText("TAKE", s * 0.02, s * 0.02);
      font(g, 700, s * 0.13, TYPE); g.fillText("A7", -s * 0.22, -s * 0.12); g.fillText("01", -s * 0.42, s * 0.13); g.fillText(String(3 + (Math.floor((b + seed * 0.7) / per) % 6)), s * 0.06, s * 0.13);
      dots(g, -s / 2, -s * 0.3, s, s * 0.64, Math.max(3 * u, s * 0.03), "rgba(255,250,240,0.12)", (nx, ny) => 0.4 - nx * 0.3 - ny * 0.2);
    });
    stripedBar(g, F, -s / 2, -s * 0.4, s, s * 0.1, 0.8);
    g.save(); g.translate(-s / 2, -s * 0.4); g.rotate(-open * 0.42);
    stripedBar(g, F, 0, -s * 0.11, s * 1.01, s * 0.1, -0.8);
    g.restore();
    g.fillStyle = T.fibre; g.beginPath(); g.arc(-s / 2 + s * 0.04, -s * 0.4, s * 0.025, 0, TAU); g.fill();
    if (snap >= 0 && snap < 0.4) for (let k = 0; k < 4; k++) { const a = -Math.PI * (0.18 + k * 0.17); inkLine(g, [s * 0.5 + Math.cos(a) * 20 * u, -s * 0.42 + Math.sin(a) * 20 * u, s * 0.5 + Math.cos(a) * 56 * u, -s * 0.42 + Math.sin(a) * 56 * u], span(snap, 0, 0.12) * (1 - span(snap, 0.28, 0.4)), F.acc, 5 * u); }
    g.restore();
  }
  // A contact sheet: rows of halftone frames on black film stock, with grease-pencil picks on it.
  // Returns each frame's centre and size in board coordinates, so a loupe can travel over them.
  function contactSheet(g, F, key, x, y, w, h, rot, cols, rows, frames, b, o = {}) {
    const { u, T } = F, m = w * 0.045, fw = (w - m * 2) / cols, fh = (h - m * 2) / rows, iw = fw * 0.86, ih = fh * 0.64, cells = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const lx = -w / 2 + m + fw * (c + 0.5), ly = -h / 2 + m + fh * (r + 0.5);
      cells.push({ lx, ly, x: x + lx * Math.cos(rot) - ly * Math.sin(rot), y: y + lx * Math.sin(rot) + ly * Math.cos(rot), kind: frames[(r * cols + c) % frames.length], iw, ih });
    }
    scrap(g, F, key, x, y, w, h, { fill: T.film, sides: "", rot, s: o.s, a: o.a, lift: 1.3, inner: (gg) => {
      for (let r = 0; r < rows; r++) {
        const ry = -h / 2 + m + fh * (r + 0.5), hole = fh * 0.05;
        gg.fillStyle = T.sprocket;
        for (let sx = -w / 2 + m * 0.6; sx < w / 2 - m * 0.6; sx += fw / 6) { gg.fillRect(sx, ry - fh * 0.43, hole * 1.3, hole); gg.fillRect(sx, ry + fh * 0.38, hole * 1.3, hole); }
        gg.fillStyle = "rgba(236,170,70,0.85)"; font(gg, 700, Math.max(11 * u, fh * 0.055), TYPE); gg.textAlign = "left"; gg.textBaseline = "middle";
        for (let c = 0; c < cols; c++) gg.fillText(`${14 + r * cols + c}A ▸`, -w / 2 + m + fw * c + fw * 0.08, ry + fh * 0.36 - hole * 1.6);
      }
      cells.forEach((cl, i) => {
        const [kind, v] = cl.kind, k = span(b, 0.15 + i * 0.07, 0.4 + i * 0.07);
        if (k <= 0) return;
        gg.save(); gg.globalAlpha *= k; gg.translate(cl.lx, cl.ly);
        gg.drawImage(halftone(F, kind, v, iw, ih, { cell: 4.4 }), -iw / 2, -ih / 2, iw, ih);
        gg.restore();
      });
      if (o.pick != null && cells[o.pick]) {
        const c = cells[o.pick], pw = iw / 2 + 12 * u, phh = ih / 2 + 12 * u, r0 = R("pick" + key);
        const pts = [c.lx - pw - 8 * u, c.ly - phh, c.lx + pw, c.ly - phh - 4 * u, c.lx + pw + 3 * u, c.ly + phh, c.lx - pw, c.ly + phh + 3 * u, c.lx - pw + 2 * u, c.ly - phh - 14 * u];
        inkLine(gg, pts.map((p) => p + (r0() - 0.5) * 3 * u), span(b, o.pickAt ?? 1.6, (o.pickAt ?? 1.6) + 0.6), o.pen || F.acc, 7 * u);
      }
      if (o.cross != null && cells[o.cross]) {
        const c = cells[o.cross], q = span(b, o.crossAt ?? 2.6, (o.crossAt ?? 2.6) + 0.4);
        inkLine(gg, [c.lx - iw * 0.4, c.ly - ih * 0.4, c.lx + iw * 0.4, c.ly + ih * 0.4], span(q, 0, 0.5), "rgba(246,239,227,0.9)", 6 * u);
        inkLine(gg, [c.lx + iw * 0.4, c.ly - ih * 0.4, c.lx - iw * 0.4, c.ly + ih * 0.4], span(q, 0.5, 1), "rgba(246,239,227,0.9)", 6 * u);
      }
    } });
    return cells;
  }
  // A photographer's loupe seen from above: a black card ring over a magnified, coarser dot screen.
  function loupe(g, F, x, y, Rr, cell, s = 1) {
    const { u, T } = F;
    g.save(); g.translate(x, y); g.scale(s, s);
    g.save(); g.shadowColor = T.shadow; g.shadowBlur = 30 * u; g.shadowOffsetX = 10 * u; g.shadowOffsetY = 22 * u;
    g.fillStyle = T.photo; g.beginPath(); g.arc(0, 0, Rr + 20 * u, 0, TAU); g.fill(); g.restore();
    g.save(); g.beginPath(); g.arc(0, 0, Rr, 0, TAU); g.clip();
    g.fillStyle = T.film; g.fillRect(-Rr, -Rr, Rr * 2, Rr * 2);
    // Everything under the lens, twice the size: frames, their coarser dot screen, the sprocket holes between.
    const z = 2;
    for (const cl of [].concat(cell || [])) {
      const ox = (x - cl.x) * z, oy = (y - cl.y) * z;
      if (Math.abs(ox) > Rr + cl.iw * 1.4 || Math.abs(oy) > Rr + cl.ih * 1.6) continue;
      g.drawImage(halftone(F, cl.kind[0], cl.kind[1], cl.iw * z, cl.ih * z, { cell: 10 }), -cl.iw - ox, -cl.ih - oy, cl.iw * z, cl.ih * z);
      g.fillStyle = T.sprocket;
      for (let k = -3; k <= 3; k++) for (const sy of [-1, 1]) g.fillRect(-ox + k * cl.iw * 0.33 - 9 * u, -oy + sy * cl.ih * 1.28 - 7 * u, 18 * u, 14 * u);
    }
    const gl = g.createLinearGradient(-Rr, -Rr, Rr, Rr); gl.addColorStop(0, "rgba(255,255,255,0.32)"); gl.addColorStop(0.45, "rgba(255,255,255,0)"); gl.addColorStop(1, "rgba(0,0,0,0.12)");
    g.fillStyle = gl; g.fillRect(-Rr, -Rr, Rr * 2, Rr * 2);
    g.restore();
    const ring = new Path2D(); ring.arc(0, 0, Rr + 22 * u, 0, TAU); ring.moveTo(Rr, 0); ring.arc(0, 0, Rr, 0, TAU, true);
    cutShape(g, F, ring, T.black, () => dots(g, -Rr - 22 * u, -Rr - 22 * u, (Rr + 22 * u) * 2, (Rr + 22 * u) * 2, 4 * u, "rgba(255,250,240,0.3)", (nx, ny) => 0.5 - (nx + ny) * 0.45));
    g.strokeStyle = "rgba(255,255,255,0.55)"; g.lineWidth = 4 * u; g.lineCap = "round"; g.beginPath(); g.arc(0, 0, Rr - 10 * u, -2.6, -1.9); g.stroke();
    g.restore();
  }
  // Glide the loupe from frame to frame, pausing over each; it slides in from the edge first.
  function loupePath(cells, b, from, order, start = 1.0, step = 1.25) {
    const ord = order.filter((i) => i < cells.length);
    if (!ord.length) return null;
    if (b < start) { const e = eio(span(b, start - 0.6, start)), c = cells[ord[0]]; const x = lerp(from[0], c.x, e), y = lerp(from[1], c.y, e); let best = c, bd = Infinity; for (const cl of cells) { const d = Math.hypot(cl.x - x, cl.y - y); if (d < bd) { bd = d; best = cl; } } return { x, y, cell: best, s: 1 + (1 - e) * 0.12 }; }
    const n = Math.floor((b - start) / step), f = (b - start) / step - n, a = cells[ord[n % ord.length]], c = cells[ord[(n + 1) % ord.length]];
    const e = eio(span(f, 0, 0.58)), hover = Math.sin(f * Math.PI) * 0.06;
    return { x: lerp(a.x, c.x, e), y: lerp(a.y, c.y, e) - hover * 60, cell: e < 0.5 ? a : c, s: 1 + hover };
  }
  // The project folder: a tabbed kraft back, prints standing inside, a front flap cut straight across.
  function folder(g, F, cx, cy, w, h, inside, front) {
    const { u, T } = F, top = cy - h / 2, cell = Math.max(3.4 * u, w * 0.008);
    const back = new Path2D();
    back.moveTo(cx - w / 2, top + h * 0.07); back.lineTo(cx - w / 2 + w * 0.03, top); back.lineTo(cx - w / 2 + w * 0.3, top); back.lineTo(cx - w / 2 + w * 0.34, top + h * 0.07);
    back.lineTo(cx + w / 2, top + h * 0.07); back.lineTo(cx + w / 2, cy + h / 2); back.lineTo(cx - w / 2, cy + h / 2); back.closePath();
    cutShape(g, F, back, T.kraft2, () => dots(g, cx - w / 2, top, w, h, cell, T.accDeep, (nx, ny) => 0.06 + ny * 0.22));
    if (inside) inside(top + h * 0.2);
    const ft = top + h * 0.22, fr = new Path2D();
    fr.moveTo(cx - w / 2 - 6 * u, ft + 10 * u); fr.lineTo(cx + w / 2 + 6 * u, ft - 4 * u); fr.lineTo(cx + w / 2 + 2 * u, cy + h / 2 + 4 * u); fr.lineTo(cx - w / 2 - 2 * u, cy + h / 2 + 4 * u); fr.closePath();
    cutShape(g, F, fr, T.kraft, () => {
      dots(g, cx - w / 2, ft, w, h, cell, "rgba(255,248,235,0.4)", (nx, ny) => 0.35 - ny * 0.4 - nx * 0.1);
      g.strokeStyle = "rgba(60,40,20,0.25)"; g.lineWidth = 2 * u; g.beginPath(); g.moveTo(cx - w / 2, ft + h * 0.06); g.lineTo(cx + w / 2, ft + h * 0.05); g.stroke();
    });
    if (front) front(ft);
  }

  // A printed dot screen inside whatever is clipped: dens(nx, ny) gives 0..1 ink over the box.
  function dots(g, x0, y0, w, h, cell, ink, dens) {
    g.save(); g.fillStyle = ink; g.beginPath();
    for (let r = 0, y = y0; y < y0 + h + cell; r++, y += cell) for (let x = x0 + (r % 2 ? cell / 2 : 0); x < x0 + w + cell; x += cell) {
      const d = clamp(dens((x - x0) / w, (y - y0) / h)), rad = cell * 0.56 * Math.sqrt(d);
      if (rad < 0.35) continue;
      g.moveTo(x + rad, y); g.arc(x, y, rad, 0, TAU);
    }
    g.fill(); g.restore();
  }
  // Tiny typed notes for slips and cards, so close up they read as real paper.
  const NOTES = ["re: cut v3", "trim the intro", "music up 2db", "swap shot 4", "love this bit", "too long?", "keep the laugh", "fix colour", "move title", "approved", "cut at 0:12", "one more pass", "drop the logo", "tighter", "louder vo", "nice!"];
  const TYPE = "'Courier New', 'American Typewriter', Courier, monospace";
  function typed(g, F, x, y, w, h, seed, o = {}) {
    const { u, T } = F, r = R("ty" + seed), size = (o.size ?? 15) * u, lh = size * 1.32, col = o.col || T.text;
    g.save(); g.fillStyle = col; g.textAlign = "left"; g.textBaseline = "alphabetic"; g.globalAlpha *= 0.82;
    font(g, 700, size, TYPE);
    let yy = y + size, n = 0;
    while (yy < y + h - size * 0.2 && n < (o.lines ?? 4)) {
      let str = NOTES[(hash(seed) + n * 5 + ((r() * 3) | 0)) % NOTES.length];
      while (str.length > 2 && g.measureText(str).width > w) str = str.slice(0, -1);
      if (n === 0 && o.head) { font(g, 800, size * 1.08, TYPE); g.fillText(o.head, x, yy); font(g, 700, size, TYPE); }
      else g.fillText(str, x + (r() - 0.5) * 2 * u, yy);
      yy += lh; n++;
    }
    // A pen scribble under the type.
    if (o.scribble !== false && yy < y + h) {
      const pts = [], sw = w * (0.4 + r() * 0.4);
      for (let q = 0; q <= 18; q++) pts.push(x + (sw * q) / 18, yy - size * 0.4 + Math.sin(q * 1.7 + r()) * size * 0.32);
      inkLine(g, pts, 1, o.pen || F.acc, 2.2 * u);
    }
    g.restore();
  }

  // ---- the board -----------------------------------------------------------------------------------
  function bands(F, id, v = 0) {
    const { W, H, tall, T, acc } = F;
    const B = (fill, x, y, w, h, rot, sides = "trbl") => ({ fill, x: W * x, y: H * y, w: W * w, h: H * h, rot, sides });
    const L = {
      title: tall ? [B(acc, 0.5, 0.93, 1.3, 0.2, -0.03, "tb"), B(T.kraft, 0.1, 0.04, 0.5, 0.15, 0.05)] : [B(acc, 0.5, 0.95, 1.3, 0.26, 0.025, "tb"), B(T.kraft, 0.08, 0.12, 0.34, 0.34, -0.05), B(T.teal, 0.97, 0.3, 0.1, 0.7, 0.04, "lr")],
      chart: tall ? [B(T.kraft, 0.86, 0.05, 0.6, 0.16, 0.04), B(T.teal, 0.5, 0.97, 1.3, 0.09, -0.02, "tb")] : [B(T.kraft, 0.86, 0.1, 0.42, 0.36, 0.03), B(T.teal, 0.015, 0.6, 0.07, 1.2, -0.01, "lr")],
      object: tall ? [B(acc, 0.5, 0.8, 1.3, 0.34, 0.03, "tb"), B(T.black, 0.08, 0.05, 0.42, 0.14, -0.04)] : [B(acc, 0.8, 0.6, 0.44, 1.1, -0.025, "lr"), B(T.black, 0.08, 0.96, 0.3, 0.2, 0.03)],
      people: tall ? [B(T.kraft, 0.5, 0.62, 1.3, 0.5, -0.03, "tb"), B(acc, 0.92, 0.05, 0.32, 0.14, 0.06)] : [B(T.kraft, 0.5, 0.72, 1.2, 0.42, -0.02, "tb"), B(acc, 0.95, 0.08, 0.22, 0.26, 0.06)],
      process: tall ? [B(T.teal, 0.06, 0.62, 0.22, 1.2, 0.01, "lr"), B(T.kraft, 0.9, 0.05, 0.42, 0.14, -0.04)] : [B(T.teal, 0.5, 0.93, 1.2, 0.3, 0.015, "tb"), B(T.kraft, 0.9, 0.1, 0.34, 0.3, -0.04)],
      compare: tall ? [B(T.black, 0.5, 0.78, 1.3, 0.48, 0.02, "tb"), B(T.kraft, 0.1, 0.05, 0.4, 0.14, -0.05)] : [B(T.black, 0.77, 0.62, 0.56, 0.95, 0.02), B(T.kraft, 0.1, 0.08, 0.3, 0.3, -0.05)],
      closing: tall ? [B(acc, 0.06, 0.4, 0.2, 1.0, 0.02, "lr"), B(T.teal, 0.5, 0.97, 1.3, 0.16, -0.02, "tb")] : [B(acc, 0.05, 0.5, 0.16, 1.2, 0.02, "lr"), B(T.teal, 0.5, 0.98, 1.3, 0.22, -0.02, "tb"), B(T.kraft, 0.93, 0.08, 0.3, 0.3, 0.05)],
    };
    if (id === "closing" && v === 1) return tall ? [B(T.teal, 0.5, 0.36, 1.3, 0.3, 0.05, "tb"), B(T.kraft, 0.86, 0.94, 0.5, 0.2, -0.04)] : [B(T.teal, 0.2, 0.55, 0.3, 1.3, 0.06, "lr"), B(T.kraft, 0.9, 0.12, 0.34, 0.36, -0.05)];
    if (id === "closing" && v === 2) return tall ? [B(T.black, 0.5, 0.5, 1.5, 0.3, -0.2, "tb"), B(acc, 0.12, 0.08, 0.5, 0.16, 0.06)] : [B(T.black, 0.5, 0.52, 1.5, 0.4, -0.13, "tb"), B(acc, 0.94, 0.88, 0.3, 0.34, 0.07)];
    return L[id] || L.title;
  }
  // The sheet itself, cached per scene: grained stock, faint stains and fibres, torn coloured bands.
  const BG = new Map();
  function background(F, st) {
    const { W, H, u, T, tex } = F, pad = 60 * u;
    const key = [st.id, st.i, st.v || 0, W, H, T.key, F.acc, tex].join("|");
    if (BG.has(key)) return BG.get(key);
    const c = document.createElement("canvas"); c.width = W + pad * 2; c.height = H + pad * 2;
    const g = c.getContext("2d");
    g.translate(pad, pad);
    g.fillStyle = T.paper; g.fillRect(-pad, -pad, W + pad * 2, H + pad * 2);
    const r = R("bg" + st.id + st.i);
    for (let i = 0; i < 9; i++) {
      const x = r() * W, y = r() * H, rr = (120 + r() * 380) * u, dark = r() < 0.55;
      const gd = g.createRadialGradient(x, y, 0, x, y, rr);
      gd.addColorStop(0, dark ? `rgba(${T.stain},${0.07 * tex})` : `rgba(255,255,255,${0.1 * tex})`); gd.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gd; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    g.strokeStyle = `rgba(${T.stain},${0.16 * tex})`; g.lineWidth = 1 * u;
    for (let i = 0; i < 140; i++) {
      const x = r() * W, y = r() * H, a = r() * TAU, l = (6 + r() * 16) * u;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.6, y + Math.sin(a + 0.6) * l * 0.6, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    const Fb = { ...F, t: 0 };
    for (const [i, b] of bands(F, st.id, st.v || 0).entries()) scrap(g, Fb, `band${st.id}${i}`, b.x, b.y, b.w, b.h, { fill: b.fill, rot: b.rot, sides: b.sides, rough: 1.5, lift: 1.2 });
    // Small torn bits scattered over the board.
    for (let i = 0; i < 7; i++) {
      const x = r() * W, y = r() * H, w = (40 + r() * 90) * u, h = (24 + r() * 50) * u;
      scrap(g, Fb, `bit${st.id}${i}`, x, y, w, h, { fill: [T.news, T.kraft, T.paper2][i % 3], rot: (r() - 0.5) * 1.2, rough: 1.2, lift: 0.5 });
    }
    BG.set(key, { c, pad });
    return BG.get(key);
  }

  let GRAIN = null;
  function grainTile() {
    if (GRAIN) return GRAIN;
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d"), img = g.createImageData(256, 256), r = rng(23);
    for (let i = 0; i < 256 * 256; i++) { const v = (r() * 255) | 0; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
    return (GRAIN = c);
  }

  // ---- layout helpers ------------------------------------------------------------------------------
  function headSpec(F) {
    const { W, u, tall } = F;
    if (tall) return { x: 64 * u, y: 150 * u, maxW: W - 128 * u, size: 80 * u, min: 66 * u, lines: 3 };
    const sq = W < F.H * 1.3;
    return { x: 96 * u, y: 74 * u, maxW: sq ? W - 192 * u : Math.min(W * 0.6, 1150 * u), size: 80 * u, min: 66 * u, lines: sq ? 3 : 2 };
  }
  function sceneHead(g, F, st, b, text) {
    const sp = headSpec(F), lay = headLayout(g, text, sp.maxW, sp.size, sp.min, sp.lines);
    const bottom = text ? sp.y + lay.lines.length * lineH(lay, F.u) : sp.y;
    return { sp, lay, bottom, draw: () => text && drawHead(g, F, lay, sp.x, sp.y, b, { key: st.id, styles: [{ bg: F.T.black, fg: F.T.onBlack }, { bg: F.T.paper2, fg: F.T.text }, { bg: F.acc, fg: onColor(F, F.acc) }] }) };
  }
  function areaBelow(F, bottom) {
    const { W, H, u, tall } = F, x = (tall ? 70 : 120) * u, y = bottom + (tall ? 70 : 52) * u;
    return { x, y, w: W - x * 2, h: H - y - (tall ? 130 : 62) * u };
  }
  const FRAMES = [["land", 1], ["face", 2], ["camera", 0], ["land", 3], ["face", 4], ["reel", 0], ["city", 2]];

  // ---- pages ---------------------------------------------------------------------------------------
  const PAGES = {};
  // Things dropped on the closing board land one after another and rock to a stop.
  const settle = (b, at) => { const age = b - at; return { k: span(b, at, at + 0.22), wob: age > 0 ? Math.exp(-age * 3.4) * Math.sin(age * 12) : 0, drop: (1 - eo(span(b, at, at + 0.3))) * 60 }; };
  PAGES.title = (g, F, st, b, D) => {
    const { W, H, u, tall, t, T } = F, wide = !tall && W >= H * 1.3;
    const sp = tall ? { x: 70 * u, maxW: W - 140 * u, size: 112 * u, lines: 4 } : wide ? { x: 110 * u, maxW: Math.min(W * 0.44, 860 * u), size: 112 * u, lines: 3 } : { x: 100 * u, maxW: W - 200 * u, size: 100 * u, lines: 3 };
    const lay = headLayout(g, D.heads.title, sp.maxW, sp.size, 66 * u, sp.lines);
    const total = lay.lines.length * lineH(lay, u);
    // The contact sheet of the day's rushes, a loupe roaming it, a slate that keeps clapping.
    let sheetSpec, slateSpec, hy;
    if (wide) {
      clipping(g, F, "t-clip", W * 0.47, -30 * u, 380 * u, 260 * u, 0.06 + sway(t, 1) * 0.005, "Local studio keeps every frame", { thumb: "city" });
      film(g, F, W * 0.74, H * 0.95, W * 0.62, 92 * u, -0.035, 44 * u, FRAMES, 1);
      sheetSpec = { x: W * 0.735, y: H * 0.45, w: 800 * u, h: 580 * u, cols: 3, rows: 2 };
      slateSpec = { x: W * 0.15, y: H * 0.86, s: 250 * u, rot: -0.1 };
      hy = H * 0.5 - total / 2 - 40 * u;
    } else if (tall) {
      film(g, F, W * 0.5, H * 0.965, W * 1.4, 100 * u, -0.05, 44 * u, FRAMES, 1);
      const sw = W * 0.84;
      sheetSpec = { x: W * 0.53, y: H * 0.6, w: sw, h: sw * 1.12, cols: 2, rows: 3 };
      slateSpec = { x: W * 0.24, y: H * 0.865, s: 250 * u, rot: -0.12 };
      hy = H * 0.1 + 40 * u;
    } else {
      film(g, F, W * 0.5, H * 0.955, W * 1.4, 92 * u, -0.05, 44 * u, FRAMES, 1);
      const sw = W * 0.6;
      sheetSpec = { x: W * 0.62, y: H * 0.62, w: sw, h: sw * 0.72, cols: 3, rows: 2 };
      slateSpec = { x: W * 0.18, y: H * 0.78, s: 230 * u, rot: -0.1 };
      hy = H * 0.12 + 40 * u;
    }
    const S0 = sheetSpec, ak = span(b, 0.0, 0.35), rot = 0.03 + sway(t, 2) * 0.006;
    const frames = [["camera", 0], ["land", 6], ["face", 1], ["city", 4], ["face", 4], ["land", 2]];
    const cells = contactSheet(g, F, "t-sheet", S0.x, S0.y - (1 - eo(ak)) * 60 * u, S0.w, S0.h, rot, S0.cols, S0.rows, frames, b, { s: lerp(1.1, 1, eo(ak)), a: ak * 3, pick: 4, pickAt: 1.7, cross: 2, crossAt: 2.7 });
    tape(g, F, S0.x - S0.w * 0.42, S0.y - S0.h * 0.48, 140 * u, -0.6, 1, clamp(ak * 3));
    tape(g, F, S0.x + S0.w * 0.43, S0.y - S0.h * 0.46, 120 * u, 0.55, 2, clamp(ak * 3));
    const sl = slateSpec, sk = settle(b, 0.35);
    if (sk.k > 0) { g.save(); g.globalAlpha *= clamp(sk.k * 3); slate(g, F, sl.x, sl.y - sk.drop * u, sl.s, sl.rot + sk.wob * 0.12 + sway(t, 5) * 0.01, b - 0.6, 1); g.restore(); }
    const Rr = Math.min(cells[0].iw, cells[0].ih) * 0.62, lp = loupePath(cells, b, [W + 200 * u, H + 200 * u], [0, 4, 3, 1, 5, 2], 1.0, 1.3);
    if (lp) loupe(g, F, lp.x, lp.y, Rr, cells, lp.s);
    const kick = label(g, F, D.heads.kicker, sp.x + 6 * u, hy - 58 * u, 42 * u, { k: span(b, 0.05, 0.3), bg: F.acc, rot: -0.02, maxW: sp.maxW });
    if (kick) tape(g, F, sp.x + kick.w - 6 * u, hy - 86 * u, 92 * u, 0.5, 9);
    const last = lay.lines.length - 1;
    const ts = last % 2 ? [{ bg: T.black, fg: T.onBlack }, { bg: T.paper2, fg: T.text }] : [{ bg: T.paper2, fg: T.text }, { bg: T.black, fg: T.onBlack }];
    drawHead(g, F, lay, sp.x, hy + 6 * u, b, { key: "title", at: 0.2, styles: ts, hl: last, hlq: span(b, 0.9, 1.5) });
    // A marker swash under the headline, drawn once the words are down.
    const bx = sp.x + 20 * u, by = hy + total + 30 * u, bw = Math.min(sp.maxW * 0.7, Math.max(...lay.lines.map((l) => l.w)) * 0.8);
    inkLine(g, mCurve(bx, by, bx + bw, by - 14 * u, 16 * u, 7, u), span(b, 1.1, 1.6), F.acc, 7 * u);
  };

  PAGES.chart = (g, F, st, b, D) => {
    const { W, H, u, tall, t, T } = F, d = D.data.chart;
    const head = sceneHead(g, F, st, b, D.heads.chart), A = areaBelow(F, head.bottom);
    if (!tall && W >= H * 1.3) clipping(g, F, "c-clip", W - 230 * u, 150 * u, 420 * u, 330 * u, 0.08 + sway(t, 5) * 0.005, "Approvals climb again this week");
    else clipping(g, F, "c-clip", W * 0.85, 40 * u, 380 * u, 250 * u, -0.1 + sway(t, 5) * 0.005, "Approvals climb again");
    // Graph paper pinned behind the bars.
    scrap(g, F, "c-grid", A.x + A.w / 2, A.y + A.h / 2, A.w + 50 * u, A.h + 24 * u, { fill: T.paper2, rot: -0.01 + sway(t, 6) * 0.002, rough: 0.8, inner: (gg, w, h) => {
      gg.lineWidth = 1 * u;
      for (let x = -w / 2, i = 0; x < w / 2; x += 26 * u, i++) { gg.strokeStyle = i % 5 ? T.grid : T.gridMajor; gg.beginPath(); gg.moveTo(x, -h / 2); gg.lineTo(x, h / 2); gg.stroke(); }
      for (let y = -h / 2, i = 0; y < h / 2; y += 26 * u, i++) { gg.strokeStyle = i % 5 ? T.grid : T.gridMajor; gg.beginPath(); gg.moveTo(-w / 2, y); gg.lineTo(w / 2, y); gg.stroke(); }
    } });
    pin(g, F, A.x + 6 * u, A.y + 4 * u, F.acc);
    pin(g, F, A.x + A.w - 6 * u, A.y + 10 * u, T.teal);
    const n = d.values.length, max = Math.max(...d.values.map((v) => Math.max(0, v)), 1), slot = A.w / n;
    const base = A.y + A.h - 64 * u, bw = Math.min(slot * 0.5, 210 * u), maxH = base - (A.y + 150 * u), ph = 62 * u;
    film(g, F, A.x + A.w / 2, base + 34 * u, A.w + 90 * u, 68 * u, 0, 38 * u, FRAMES, 2);
    const tops = [];
    d.values.forEach((value, i) => {
      const hot = i === d.highlight, cx = A.x + slot * (i + 0.5), Hf = Math.max(14 * u, maxH * (Math.max(0, value) / max));
      const nP = Math.max(1, Math.ceil(Hf / ph)), t0 = 0.12 + i * 0.1, dur = 0.75;
      let shown = 0;
      for (let k = 0; k < nP; k++) {
        const kp = span(b, t0 + (k / nP) * dur, t0 + (k / nP) * dur + 0.16);
        if (kp <= 0) break;
        const pH = k === nP - 1 ? Hf - k * ph : ph, r = R("bp" + i + k);
        const fill = hot ? (k % 2 ? F.acc : T.accDeep) : k % 2 ? T.kraft : T.news;
        const cy = base - k * ph - pH / 2 - (1 - eo(kp)) * 50 * u, top = k === nP - 1;
        scrap(g, F, `bar${i}-${k}-${pH | 0}`, cx + (r() - 0.5) * 10 * u, cy, bw * (0.94 + r() * 0.1), pH + 4 * u, { fill, sides: "tb", rot: (r() - 0.5) * 0.03 + (top ? sway(t, i + 9, 1.3) * 0.02 : 0), a: kp * 3, lift: 0.6, rough: 0.9 });
        shown = Math.min(Hf, (k + eo(kp)) * ph);
      }
      const q = shown / Hf;
      tops.push([cx, base - shown]);
      if (q > 0.02) ransom(g, F, fmt(value * q, d), cx, base - shown - 74 * u, hot ? 112 * u : 96 * u, { align: "center", maxW: slot * 0.92, seed: i * 7 + 1, shift: i });
      label(g, F, d.labels[i], cx, base + 34 * u, 42 * u, { align: "center", k: span(b, 0.5 + i * 0.12, 0.8 + i * 0.12), rot: (R("bl" + i)() - 0.5) * 0.07, maxW: slot * 0.92, bg: hot ? F.acc : T.black });
    });
    const hi = clamp(d.highlight, 0, n - 1), [hx, hyT] = tops[hi] || [0, 0];
    inkLine(g, mOval(hx, hyT - 74 * u, Math.min(slot * 0.5, 150 * u), 82 * u, 11, u), span(b, 1.9, 2.5), F.acc, 6 * u);
    if (hi > 0 && tops[0]) mArrow(g, F, tops[0][0] - slot * 0.2, tops[0][1] - 170 * u, hx - Math.min(slot * 0.5, 150 * u) - 16 * u, hyT - 110 * u, -60 * u, span(b, 2.3, 3.1), 12, F.acc);
    head.draw();
  };

  PAGES.object = (g, F, st, b, D) => {
    const { W, H, u, tall, t, T } = F, d = D.data.object, phone = d.kind === "phone";
    const head = sceneHead(g, F, st, b, D.heads.object), A = areaBelow(F, head.bottom);
    if (!tall && W >= H * 1.3) photo(g, F, "o-pol", "face", 3, W - 170 * u, 150 * u, 250 * u, 290 * u, { rot: 0.12 + sway(t, 3) * 0.008, sides: "", chin: 30, seed: 4 });
    else clipping(g, F, "o-clip", W * 0.86, 40 * u, 360 * u, 240 * u, 0.1 + sway(t, 3) * 0.005, "One folder per film");
    // The device: black card stock for the body, a printed frame on its screen, cut paper clips below.
    let dw, dh, dx, dy;
    if (phone) { dh = tall ? Math.min(A.h * 0.56, A.w * 1.1) : A.h * 0.96; dw = dh * 0.5; dx = tall ? A.x + A.w / 2 : A.x + A.w * 0.22; dy = tall ? A.y + dh / 2 : A.y + A.h / 2; }
    else { dw = tall ? A.w * 0.96 : Math.min(A.w * 0.56, (A.h - 20 * u) / 0.72); dh = dw * 0.62; dx = tall ? A.x + A.w / 2 : A.x + dw / 2 + 10 * u; dy = tall ? A.y + dh / 2 + 10 * u : A.y + (A.h - dw * 0.08) / 2; }
    const rot = -0.012 + sway(t, 8) * 0.003, ap = span(b, 0.1, 0.38);
    if (!phone) {
      const kb = dw * 0.09;
      scrap(g, F, "o-base", dx, dy + dh / 2 + kb / 2, dw * 1.12, kb, { fill: T.kraft, rot, sides: "", a: ap * 3, inner: (gg, w, h) => {
        gg.strokeStyle = "rgba(40,25,10,0.35)"; gg.lineWidth = 1.2 * u;
        for (let k = 1; k < 14; k++) { gg.beginPath(); gg.moveTo(-w / 2 + (w * k) / 14, -h / 2); gg.lineTo(-w / 2 + (w * k) / 14, h * 0.1); gg.stroke(); }
        gg.beginPath(); gg.moveTo(-w / 2, -h * 0.1); gg.lineTo(w / 2, -h * 0.1); gg.stroke();
      } });
    }
    const pad = (phone ? 0.07 : 0.035) * dw;
    const sx = -dw / 2 + pad, sy = -dh / 2 + pad * (phone ? 1.6 : 1), sw = dw - pad * 2, sh = dh - pad * (phone ? 3.2 : 2);
    const img = halftone(F, "land", 5, sw, sh * 0.55, { cell: 5.4 });
    const anchorsLocal = [];
    scrap(g, F, "o-body", dx, dy, dw, dh, { fill: T.black, rot, sides: "", s: lerp(1.08, 1, eo(ap)), a: ap * 3, inner: () => {
      g.fillStyle = T.news; g.fillRect(sx, sy, sw, sh);
      g.save(); g.beginPath(); g.rect(sx, sy, sw, sh * 0.55); g.clip();
      const z = 1.08 + 0.05 * Math.sin(t * 0.35);
      g.translate(sx + sw / 2 + Math.sin(t * 0.27) * sw * 0.025, sy + sh * 0.275); g.scale(z, z); g.drawImage(img, -sw / 2, -sh * 0.275, sw, sh * 0.55);
      g.restore();
      const ty0 = sy + sh * 0.6, th = sh * 0.105, clips = [[0.03, 0.3], [0.36, 0.26], [0.65, 0.31]];
      for (let tr = 0; tr < 3; tr++) {
        const ty = ty0 + tr * (th + sh * 0.025);
        clips.forEach(([cx0, cw], ci) => {
          const k = span(b, 0.55 + tr * 0.12 + ci * 0.08, 0.75 + tr * 0.12 + ci * 0.08);
          if (k <= 0) return;
          const hot = tr === 0 && ci === 1, x0 = sx + sw * (cx0 + tr * 0.02);
          g.fillStyle = hot ? F.acc : [T.kraft, T.teal, T.paper2][(tr + ci) % 3];
          g.fillRect(x0, ty - (1 - eo(k)) * 10 * u, sw * cw * 0.96, th);
          g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(x0, ty + th - 2 * u, sw * cw * 0.96, 2 * u);
        });
      }
      anchorsLocal.push([sx + sw * 0.68, sy + sh * 0.24], [sx + sw * (0.38 + 0.13), ty0 + th / 2], [sx + sw * (0.67 + 0.04 + 0.15), ty0 + 2 * (th + sh * 0.025) + th / 2]);
      // The playhead: a marker line that keeps sweeping across the clips.
      const ph = (b * 0.17) % 1, px = sx + sw * (0.03 + ph * 0.94);
      inkLine(g, [px, ty0 - sh * 0.04, px + 1.5 * u, ty0 + 3 * (th + sh * 0.025)], 1, F.acc, 4 * u);
      g.fillStyle = F.acc; g.beginPath(); g.moveTo(px - 9 * u, ty0 - sh * 0.06); g.lineTo(px + 9 * u, ty0 - sh * 0.06); g.lineTo(px, ty0 - sh * 0.03); g.fill();
    } });
    tape(g, F, dx - dw * 0.42, dy - dh / 2 - 4 * u, 120 * u, -0.5, 21, clamp(ap * 3));
    const toWorld = ([x, y]) => [dx + x * Math.cos(rot) - y * Math.sin(rot), dy + x * Math.sin(rot) + y * Math.cos(rot)];
    const anchors = anchorsLocal.map(toWorld);
    const bgs = [T.black, T.paper2, T.black];
    d.callouts.forEach((text, i) => {
      if (!text || !anchors[i]) return;
      let lx, ly, lab, ax, ay;
      if (!tall) {
        lx = dx + dw / 2 + (phone ? 200 : 120) * u; ly = A.y + A.h * (0.17 + i * 0.32);
        lab = label(g, F, text, lx, ly, 44 * u, { k: span(b, 1.0 + i * 0.35, 1.3 + i * 0.35), bg: bgs[i], rot: (i - 1) * 0.02, maxW: A.x + A.w - lx + 40 * u, seed: i });
        if (lab) { tape(g, F, lx + 10 * u, ly - lab.h * 0.45, 70 * u, -0.6, 30 + i, clamp(span(b, 1.0 + i * 0.35, 1.3 + i * 0.35) * 3)); ax = lx - 18 * u; ay = ly; }
      } else {
        lx = A.x + 20 * u; ly = dy + dh / 2 + (phone ? 100 : 170) * u + i * 165 * u;
        lab = label(g, F, text, lx, ly, 46 * u, { k: span(b, 1.0 + i * 0.35, 1.3 + i * 0.35), bg: bgs[i], rot: (i - 1) * 0.02, maxW: A.w - 160 * u, seed: i });
        if (lab) { ax = lx + lab.w + 18 * u; ay = ly; }
      }
      if (lab) mArrow(g, F, ax, ay, anchors[i][0] + 10 * u, anchors[i][1] + 8 * u, (tall ? -1 : 1) * (i - 1) * 50 * u + 30 * u, span(b, 1.15 + i * 0.35, 1.75 + i * 0.35), 40 + i, tall && i === 2 ? T.black : F.acc);
    });
    head.draw();
  };

  PAGES.people = (g, F, st, b, D) => {
    const { W, H, u, tall, t, T } = F, d = D.data.people;
    const head = sceneHead(g, F, st, b, D.heads.people), A = areaBelow(F, head.bottom);
    if (!tall && W >= H * 1.3) clipping(g, F, "p-clip", W - 240 * u, 140 * u, 400 * u, 300 * u, -0.07 + sway(t, 7) * 0.005, "Review links reach the whole crew", { thumb: "face" });
    else clipping(g, F, "p-clip", W * 0.84, 40 * u, 360 * u, 240 * u, 0.09 + sway(t, 7) * 0.005, "Review links");
    const n = clamp(Math.round(d.count) || 2, 2, 6), hi = Math.min(n - 1, d.highlight ?? 1);
    const cols = tall ? (n <= 2 ? 1 : 2) : n, rows = Math.ceil(n / cols);
    const cellW = A.w / cols, cellH = A.h / rows, cw = Math.min(cellW * 0.8, (cellH - 80 * u) / 1.2), ch = cw * 1.2;
    const cards = [];
    for (let i = 0; i < n; i++) {
      const c = i % cols, rr = Math.floor(i / cols), r = R("pc" + i);
      const rowCount = rr === rows - 1 ? n - rr * cols : cols, offX = ((cols - rowCount) * cellW) / 2;
      const cx = A.x + offX + cellW * (c + 0.5), cy = A.y + cellH * (rr + 0.5) - 26 * u + (i % 2 ? 16 : -16) * u;
      const k = span(b, 0.12 + i * 0.1, 0.38 + i * 0.1), rot = (r() - 0.5) * 0.1 + sway(t, i + 11, 0.9) * 0.012;
      cards.push({ cx, cy, rot, k });
      if (k <= 0) continue;
      const s = lerp(1.25, 1, eo(k)), yy = cy - (1 - eo(k)) * 40 * u;
      if (i === hi) scrap(g, F, "p-back", cx + 10 * u, yy + 6 * u, cw * 1.12, ch * 1.1, { fill: F.acc, rot: rot + 0.07, s, a: k * 3, rough: 1.4 });
      photo(g, F, "p-card" + i, "face", i, cx, yy, cw, ch, { rot, s, a: k * 3, sides: "", border: 14, chin: cw * 0.16 / u, seed: i + 1 });
      tape(g, F, cx + (r() - 0.5) * 20 * u, yy - ch / 2 - 2 * u, Math.min(110 * u, cw * 0.5), (r() - 0.5) * 0.5, 50 + i, clamp(k * 3));
      const name = i < 3 ? d.badges[i] : "";
      if (name) label(g, F, name, cx, yy + ch / 2 - cw * 0.08, 42 * u, { align: "center", k: span(b, 0.75 + i * 0.12, 1.0 + i * 0.12), bg: i === hi ? F.acc : T.black, rot: -rot * 0.6, maxW: Math.max(cw * 1.1, 150 * u), seed: i });
    }
    // The chosen reviewer gets circled; then notes keep popping up as the crew reacts.
    const hc = cards[hi];
    if (hc) inkLine(g, mOval(hc.cx, hc.cy + ch / 2 - cw * 0.08, Math.max(cw * 0.62, 110 * u), 52 * u, 21, u), span(b, 1.6, 2.2), F.acc, 6 * u);
    const period = 0.85, start = 1.2;
    if (b > start) {
      const e = Math.floor((b - start) / period);
      for (let j = Math.max(0, e - 1); j <= e; j++) {
        const age = b - start - j * period, who = (j * 2 + hi) % n, c = cards[who];
        if (!c || age < 0) continue;
        const k = eo(span(age, 0, 0.22)), out = span(age, 1.45, 1.7);
        if (k <= 0 || out >= 1) continue;
        const bx = c.cx + cw * 0.42, by = c.cy - ch / 2 - 40 * u, bwid = 120 * u, bh = 84 * u;
        g.save(); g.translate(bx, by); g.rotate(0.06 * (who % 2 ? 1 : -1)); g.scale(k * (1 - out * 0.3), k * (1 - out * 0.3)); g.globalAlpha *= 1 - out;
        scrap(g, F, "bub", 0, 0, bwid, bh, { fill: T.paper2, sides: "", lift: 0.7 });
        g.fillStyle = T.paper2; g.beginPath(); g.moveTo(-bwid * 0.2, bh / 2 - 2 * u); g.lineTo(-bwid * 0.36, bh / 2 + 26 * u); g.lineTo(-bwid * 0.02, bh / 2 - 2 * u); g.fill();
        const kind = j % 3;
        if (kind === 0) inkLine(g, [-26 * u, 2 * u, -6 * u, 22 * u, 30 * u, -20 * u], span(age, 0.1, 0.4), F.acc, 7 * u);
        else if (kind === 1) { g.fillStyle = T.text; for (let q = 0; q < 3; q++) if (age > 0.12 + q * 0.12) { g.beginPath(); g.arc((q - 1) * 26 * u, 0, 8 * u, 0, TAU); g.fill(); } }
        else { const pts = []; for (let q = 0; q <= 10; q++) { const a = -Math.PI / 2 + (q * TAU) / 10, rr2 = q % 2 ? 12 * u : 28 * u; pts.push(Math.cos(a) * rr2, Math.sin(a) * rr2); } inkLine(g, pts, span(age, 0.1, 0.5), F.acc, 5 * u); }
        g.restore();
      }
    }
    head.draw();
  };

  PAGES.process = (g, F, st, b, D) => {
    const { W, H, u, tall, t, T } = F, d = D.data.process;
    // Approval beats: once the last card is down, the stamp thumps on a steady rhythm through the hold.
    const BEATS = [1.25, 2.1, 2.95, 3.8, 4.65], pbI = BEATS.reduce((a, x, j) => (b >= x ? j : a), -1);
    const pb = pbI >= 0 ? BEATS[pbI] : null, nb = BEATS[pbI + 1], since = pb == null ? 9 : b - pb;
    const shake = Math.exp(-since * 10) * Math.sin(since * 62);
    g.save(); g.translate(shake * 9 * u, Math.abs(shake) * 6 * u);
    const head = sceneHead(g, F, st, b, D.heads.process), A = areaBelow(F, head.bottom);
    if (!tall && W >= H * 1.3) clipping(g, F, "s-clip", W - 230 * u, 150 * u, 400 * u, 310 * u, 0.07 + sway(t, 9) * 0.005, "Nothing lands without a yes");
    else clipping(g, F, "s-clip", W * 0.84, 40 * u, 360 * u, 240 * u, -0.08 + sway(t, 9) * 0.005, "Nothing lands without a yes");
    const n = d.steps.length;
    let cw, ch;
    if (tall) { cw = A.w * 0.84; ch = Math.min((A.h / n) * 0.76, cw * 0.56); } else { cw = (A.w / n) * 0.78; ch = Math.min(A.h * 0.9, cw * 1.08); }
    const cards = [];
    for (let i = 0; i < n; i++) {
      const cx = tall ? A.x + A.w / 2 + (i % 2 ? 36 : -36) * u : A.x + (A.w * (i + 0.5)) / n;
      const cy = tall ? A.y + (A.h * (i + 0.5)) / n : A.y + A.h / 2 + (i % 2 ? 14 : -10) * u;
      const r = R("sc" + i);
      let rot = (r() - 0.5) * 0.07 + sway(t, i + 21, 0.8) * 0.01, lift = 1, cx2 = cx, cy2 = cy;
      // The last card swings on its tape and lifts off the board with each thump.
      if (i === n - 1 && pb != null) {
        const sw = 0.045 * Math.exp(-since * 3.6) * Math.sin(since * 13);
        rot += sw; cx2 = cx - Math.sin(sw) * ch * 0.5; lift = 1 + 1.6 * Math.exp(-since * 4); cy2 = cy - 8 * u * Math.exp(-since * 4);
      }
      cards.push({ cx: cx2, cy: cy2, rot, lift, bx: cx, by: cy });
    }
    // Arrows first so the cards sit on top of their tails.
    const paths = [];
    for (let i = 0; i < n - 1; i++) {
      const A0 = cards[i], B0 = cards[i + 1], q = span(b, 1.1 + i * 0.45, 1.6 + i * 0.45);
      const pts = tall ? [A0.cx + cw * 0.36, A0.cy + ch / 2 + 6 * u, B0.cx + cw * 0.36, B0.cy - ch / 2 - 10 * u] : [A0.cx + cw / 2 + 4 * u, A0.cy - ch * 0.18, B0.cx - cw / 2 - 12 * u, B0.cy - ch * 0.18];
      paths.push(mArrow(g, F, pts[0], pts[1], pts[2], pts[3], (tall ? 46 : -46) * u, q, 60 + i, F.acc));
    }
    cards.forEach((c, i) => {
      const k = span(b, 0.12 + i * 0.15, 0.38 + i * 0.15);
      if (k <= 0) return;
      const s = lerp(1.22, 1, eo(k));
      scrap(g, F, "s-card" + i, c.cx, c.cy - (1 - eo(k)) * 40 * u, cw, ch, { fill: T.card, sides: "", rot: c.rot, s, a: k * 3, lift: c.lift, inner: (gg, w, h) => {
        gg.fillStyle = T.cardRule;
        for (let y = -h / 2 + h * 0.22 + 38 * u; y < h / 2 - 10 * u; y += 38 * u) gg.fillRect(-w / 2, y, w, 1.4 * u);
        gg.fillStyle = F.acc; gg.fillRect(-w / 2, -h / 2 + h * 0.22, w, 2.4 * u);
        const s0 = Math.min(w, h) * (tall ? 0.56 : 0.5), ix = tall ? -w * 0.3 : 0, iy = tall ? h * 0.08 : -h * 0.06;
        if (i === 0) iconDoc(gg, F, ix, iy, s0);
        else if (i === 1 || n === 2) iconScissors(gg, F, ix, iy, s0 * 1.1, 0.12 + 0.2 * (0.5 + 0.5 * Math.sin(t * 3.4)));
        else {
          // The stamp slides to a fresh spot while raised, drops, thumps, and leaves another impression.
          const offs = [[0.12, 0.04], [-0.42, 0.14], [0.46, -0.14], [-0.3, -0.3], [0.3, 0.3]], words = ["OK", "YES", "OK", "GO", "OK"];
          let lift = pb == null ? 1 : since < 0.1 ? 0 : eo(span(since, 0.1, 0.42));
          if (nb != null) { const dn = span(b, nb - 0.24, nb); lift = Math.min(lift, 1 - dn * dn); }
          const from = offs[Math.max(0, pbI) % offs.length], to = offs[(pbI + 1) % offs.length];
          const mv = pb == null ? 1 : eio(span(b, pb + 0.3, (nb ?? pb + 1) - 0.26)), ox = lerp(from[0], to[0], mv), oy = lerp(from[1], to[1], mv);
          for (let j = 0; j <= pbI; j++) stampMark(gg, F, words[j % words.length], ix + offs[j % offs.length][0] * s0, iy + offs[j % offs.length][1] * s0 + s0 * 0.14, 32 * u, -0.2 + (j % 3) * 0.14, span(b, BEATS[j], BEATS[j] + 0.1), F.acc);
          iconStamp(gg, F, ix + ox * s0, iy + oy * s0, s0, lift);
        }
        const lw = tall ? w * 0.52 : w * 0.86, lay = headLayout(gg, String(d.steps[i] || "").toUpperCase(), lw, 46 * u, 42 * u, 2, COND, 700);
        const lx = tall ? w * 0.18 : 0, ly0 = tall ? h * 0.08 - ((lay.lines.length - 1) * lay.size * 1.05) / 2 : h * 0.3 - ((lay.lines.length - 1) * lay.size * 1.05) / 2;
        font(gg, 700, lay.size, COND); gg.fillStyle = T.text; gg.textAlign = "center"; gg.textBaseline = "middle";
        lay.lines.forEach((l, j) => gg.fillText(l.s, lx, ly0 + j * lay.size * 1.05));
      } });
      tape(g, F, c.cx + (i - 1) * 16 * u, c.cy - ch / 2 - 2 * u, 120 * u, (i - 1) * 0.25, 70 + i, clamp(k * 3));
      if (i < n - 1) { const tx = c.cx + cw * 0.3, ty = c.cy - ch * 0.36, tq = span(b, 1.7 + i * 0.75, 2.0 + i * 0.75); inkLine(g, [tx - 26 * u, ty, tx - 6 * u, ty + 24 * u, tx + 34 * u, ty - 30 * u], tq, F.acc, 8 * u); }
      ransom(g, F, String(i + 1), c.cx - cw / 2 + 34 * u, c.cy - ch / 2 + 30 * u, 96 * u, { align: "center", seed: 90 + i, shift: i, b, at: 0.45 + i * 0.18, bgs: [i === n - 1 ? F.acc : T.black] });
    });
    // A little cut-out frame keeps travelling the route, card to card.
    const route = paths.flat();
    if (b > 2.4 && route.length > 4) {
      const pts = route, f = ((b - 2.4) * 0.3) % 1;
      let total = 0; const seg = [];
      for (let i = 2; i < pts.length; i += 2) { const dd = Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]); seg.push(dd); total += dd; }
      let left = total * f, px = pts[0], py = pts[1], ang = 0;
      for (let i = 0; i < seg.length; i++) { if (left <= seg[i]) { const k = seg[i] ? left / seg[i] : 0; px = pts[i * 2] + (pts[i * 2 + 2] - pts[i * 2]) * k; py = pts[i * 2 + 1] + (pts[i * 2 + 3] - pts[i * 2 + 1]) * k; ang = Math.atan2(pts[i * 2 + 3] - pts[i * 2 + 1], pts[i * 2 + 2] - pts[i * 2]); break; } left -= seg[i]; }
      const fade = Math.min(span(f, 0, 0.06), 1 - span(f, 0.94, 1));
      scrap(g, F, "s-token", px, py - 46 * u, 150 * u, 108 * u, { fill: T.film, sides: "", rot: ang * 0.3 + sway(t, 3) * 0.1, a: fade, lift: 1.4, inner: (gg, w, h) => {
        gg.fillStyle = T.sprocket; for (let k = 0; k < 6; k++) { gg.fillRect(-w / 2 + 10 * u + k * 23 * u, -h / 2 + 6 * u, 11 * u, 8 * u); gg.fillRect(-w / 2 + 10 * u + k * 23 * u, h / 2 - 14 * u, 11 * u, 8 * u); }
        const iw = w - 22 * u, ih = h - 40 * u;
        gg.drawImage(halftone(F, "face", 5, iw, ih, { cell: 3.6 }), -iw / 2, -ih / 2, iw, ih);
        gg.fillStyle = F.acc; gg.fillRect(-iw / 2, ih / 2 - 7 * u, iw * f, 7 * u);
      } });
    }
    g.restore();
    head.draw();
  };

  PAGES.compare = (g, F, st, b, D) => {
    const { W, H, u, tall, t, T } = F, d = D.data.compare;
    const head = sceneHead(g, F, st, b, D.heads.compare), A = areaBelow(F, head.bottom);
    if (!tall && W >= H * 1.3) photo(g, F, "m-pol", "reel", 0, W - 170 * u, 140 * u, 250 * u, 270 * u, { rot: -0.1 + sway(t, 13) * 0.008, sides: "", chin: 26, seed: 6 });
    else clipping(g, F, "m-clip", W * 0.84, 40 * u, 360 * u, 240 * u, 0.08 + sway(t, 13) * 0.005, "Tune it, don't retype it");
    const gap = 120 * u, sw = tall ? A.w : (A.w - gap) / 2, sh = tall ? (A.h - gap) / 2 : A.h * 0.96;
    const max = Math.max(d.leftValue, d.rightValue, 1);
    const sides = [[d.left, d.leftValue, T.news, -0.02], [d.right, d.rightValue, F.acc, 0.018]];
    const nums = [], flights = [];
    const fanSide = sides[1], fcx = tall ? A.x + sw / 2 : A.x + sw / 2 + (sw + gap), fcy = tall ? A.y + sh / 2 + (sh + gap) : A.y + A.h / 2;
    const fw = Math.min(sw * 0.46, 420 * u), fan = fanSide ? { x: fcx + sw * 0.2, y: fcy - sh / 2 + sh * (tall ? 0.55 : 0.6), w: fw, h: fw * 0.68 } : null;
    const SLW = Math.min(180 * u, (sw * 0.42 - 40 * u) * 0.62), NSL = Math.min(14, Math.max(d.leftValue > 0 ? 1 : 0, Math.round(d.leftValue)));
    const SDT = clamp((st.hold * 0.55 - 1.0) / Math.max(1, NSL), 0.06, 0.3), flyAt = (j) => Math.max(0.9 + j * SDT + 0.4, st.hold * 0.5 + j * 0.12);
    const drawSlip = (sl) => scrap(g, F, sl.key, sl.px, sl.py, SLW, SLW * 0.64, { fill: sl.fill, sides: "tr", rot: sl.rot, s: sl.s, a: sl.a, lift: sl.lift ?? 0.6, inner: (gg, w, h) => {
      typed(gg, F, -w * 0.42, -h * 0.44, w * 0.84, h * 0.86, sl.key, { size: 14, lines: 3, pen: sl.j % 2 ? F.acc : T.black });
    } });
    sides.forEach(([name, value, fill, baseRot], i) => {
      const cx = tall ? A.x + sw / 2 : A.x + sw / 2 + i * (sw + gap), cy = tall ? A.y + sh / 2 + i * (sh + gap) : A.y + A.h / 2;
      const k = span(b, 0.1 + i * 0.2, 0.38 + i * 0.2);
      if (k <= 0) return;
      const rot = baseRot + sway(t, i + 31, 0.7) * 0.006, s = lerp(1.12, 1, eo(k));
      scrap(g, F, "m-sheet" + i, cx, cy, sw, sh, { fill, rot, s, a: k * 3, rough: 1.3 });
      tape(g, F, cx - sw * 0.38, cy - sh / 2 + 4 * u, 130 * u, -0.4, 80 + i, clamp(k * 3));
      tape(g, F, cx + sw * 0.4, cy - sh / 2 + 6 * u, 110 * u, 0.5, 82 + i, clamp(k * 3));
      const left = cx - sw / 2 + 44 * u, top = cy - sh / 2;
      label(g, F, name, left, top + 78 * u, 44 * u, { k: span(b, 0.5 + i * 0.25, 0.8 + i * 0.25), bg: i ? T.paper2 : T.black, rot: -0.015, maxW: sw - 88 * u, seed: 5 + i });
      if (i === 0) {
        // A messy heap of typed note slips that, through the hold, lift off one by one and fly across
        // to become the approval cards on the other sheet.
        const slips = NSL, sx0 = cx + sw * 0.08, sx1 = cx + sw / 2 - 40 * u;
        const sy0 = top + 150 * u, sy1 = top + sh - 130 * u, slw = SLW, slh = slw * 0.64, sdt = SDT;
        for (let j = 0; j < slips; j++) {
          const r = R("slip" + i + j), land = 0.9 + j * sdt, kq = span(b, land, land + 0.2);
          if (kq <= 0) break;
          const px = sx0 + slw / 2 + r() * Math.max(0, sx1 - sx0 - slw), py = sy0 + slh / 2 + r() * Math.max(0, sy1 - sy0 - slh);
          const rot0 = (r() - 0.5) * 1.1 + sway(t, j + i * 20) * 0.02, fs = flyAt(j);
          const slip = { key: "slip" + i + j, fill: j % 3 === 2 ? T.kraft : T.paper2, px, py: py - (1 - eo(kq)) * 30 * u, rot: rot0, s: lerp(1.3, 1, eo(kq)), a: kq * 3, j };
          if (fan && b > fs && j < slips - 3) {
            const f = span(b, fs, fs + 0.6), e = eio(f);
            if (f >= 1) continue;
            const tx = fan.x + (R("fl" + j)() - 0.5) * 40 * u, ty = fan.y - 10 * u;
            slip.px = lerp(px, tx, e); slip.py = lerp(py, ty, e) + Math.sin(f * Math.PI) * 150 * u; slip.rot = lerp(rot0, rot0 + 2.2 * (j % 2 ? 1 : -1), e) * (1 - e * 0.9);
            slip.s = lerp(1, 0.78, e) * (1 + Math.sin(f * Math.PI) * 0.12); slip.a = 1 - span(f, 0.85, 1); slip.lift = 1 + Math.sin(f * Math.PI) * 2;
            flights.push(slip);
            continue;
          }
          drawSlip(slip);
        }
      } else if (fan) {
        // The approval cards: a pinned, fanned stack that gets a little bump each time a note lands on it.
        const nC = clamp(Math.round(value), 1, 5);
        let bump = 0;
        for (let j = 0; j < NSL - 3; j++) { const ag = b - flyAt(j) - 0.6; if (ag >= 0 && ag < 0.6) bump = Math.max(bump, Math.exp(-ag * 7)); }
        for (let j = 0; j < nC; j++) {
          const kq = span(b, 1.0 + j * 0.22, 1.3 + j * 0.22);
          if (kq <= 0) break;
          const off = j - (nC - 1) / 2, top1 = j === nC - 1;
          const rot = off * 0.11 + sway(t, j + 70, 0.8) * 0.012, x = fan.x + off * fan.w * 0.16, y = fan.y + Math.abs(off) * 10 * u - (top1 ? bump * 10 * u : 0);
          scrap(g, F, "fan" + j, x, y - (1 - eo(kq)) * 40 * u, fan.w, fan.h, { fill: T.card, sides: "", rot, s: lerp(1.25, 1, eo(kq)) * (top1 ? 1 + bump * 0.03 : 1), a: kq * 3, lift: top1 ? 1 + bump : 0.8, inner: (gg, w, h) => {
            gg.fillStyle = T.cardRule; for (let yy = -h / 2 + 50 * u; yy < h / 2 - 6 * u; yy += 30 * u) gg.fillRect(-w / 2, yy, w, 1.3 * u);
            gg.fillStyle = F.acc; gg.fillRect(-w / 2, -h / 2, 12 * u, h);
            typed(gg, F, -w / 2 + 30 * u, -h / 2 + 10 * u, w * 0.62, h - 20 * u, "fan" + j, { size: 17, lines: 4, head: "CARD " + (j + 1) });
            const bx = w / 2 - 70 * u, by = -h / 2 + 22 * u;
            gg.strokeStyle = T.text; gg.lineWidth = 3 * u; gg.strokeRect(bx, by, 44 * u, 44 * u);
            inkLine(gg, [bx + 6 * u, by + 22 * u, bx + 18 * u, by + 36 * u, bx + 46 * u, by - 4 * u], span(b, 1.5 + j * 0.3, 1.75 + j * 0.3), F.acc, 6 * u);
          } });
        }
        if (b > 1.0 + nC * 0.22) pin(g, F, fan.x, fan.y - fan.h * 0.42, T.black);
      }
      const q = eo(span(b, 0.6 + i * 0.25, 1.6 + i * 0.25)), size = Math.min(230 * u, sh * 0.4);
      const ny = top + sh * (tall ? 0.48 : 0.42);
      const nw = ransom(g, F, fmt(value * q, d), left, ny, size, { maxW: sw - 88 * u, seed: 40 + i * 9, shift: i, bgs: i ? [T.paper2, T.black] : [T.paper2, T.black, T.kraft] });
      nums.push([left + nw / 2, ny, nw, size]);
      // A torn strip for the amount, then tally marks that keep being added through the hold.
      const my = top + sh - 70 * u, mw = (sw - 88 * u) * clamp(value / max) * eo(span(b, 0.8 + i * 0.25, 1.8 + i * 0.25));
      g.save(); g.strokeStyle = i ? "rgba(255,255,255,0.5)" : "rgba(40,30,20,0.35)"; g.setLineDash([6 * u, 8 * u]); g.lineWidth = 2 * u;
      g.beginPath(); g.moveTo(left, my); g.lineTo(left + sw - 88 * u, my); g.stroke(); g.restore();
      if (mw > 4 * u) scrap(g, F, "m-meter" + i + ((sw - 88 * u) * clamp(value / max) | 0), left + mw / 2, my, mw, 40 * u, { fill: i ? T.paper2 : T.black, sides: "lr", rot: sway(t, i + 41) * 0.006, lift: 0.6 });
      const marks = Math.round(value) <= 30 ? Math.max(0, Math.round(value)) : 0, ty = ny + size * 0.72, col = i ? T.black : F.acc;
      if (marks) {
        const dt = clamp((st.hold * 0.72 - 1.3) / Math.max(1, Math.min(marks, 25)), 0.07, 0.3);
        let x = left;
        for (let m = 0; m < Math.min(marks, 25); m++) {
          const q2 = span(b, 1.3 + m * dt, 1.3 + m * dt + dt * 0.9), r = R("tm" + i + m);
          if (m % 5 === 4) inkLine(g, [x - 5 * 18 * u + 4 * u, ty + 34 * u, x - 4 * u, ty - 10 * u], q2, col, 5 * u);
          else { inkLine(g, [x + (r() - 0.5) * 3 * u, ty - 16 * u, x + (r() - 0.5) * 4 * u, ty + 38 * u], q2, col, 5 * u); x += 18 * u; }
          if (m % 5 === 4) x += 22 * u;
          if (x > left + sw - 120 * u) break;
        }
      } else inkLine(g, mCurve(left, ty + 10 * u, left + Math.min(nw, sw * 0.7), ty, 10 * u, 33 + i, u), span(b, 1.4, 2.0), col, 6 * u);
    });
    flights.forEach(drawSlip);
    // "vs" chip between the two sheets.
    const vk = span(b, 0.75, 0.95);
    if (vk > 0) {
      const vx = tall ? A.x + A.w * 0.82 : A.x + A.w / 2, vy = tall ? A.y + sh + gap / 2 : A.y + A.h / 2;
      g.save(); g.translate(vx, vy); g.rotate(-0.12 + sway(t, 51) * 0.05); g.scale(lerp(1.5, 1, eo(vk)), lerp(1.5, 1, eo(vk)));
      g.shadowColor = T.shadow; g.shadowBlur = 14 * u; g.shadowOffsetY = 6 * u;
      g.fillStyle = T.paper2; g.beginPath(); g.arc(0, 0, 64 * u, 0, TAU); g.fill(); g.shadowColor = "transparent";
      g.fillStyle = T.black; g.beginPath(); g.arc(0, 0, 56 * u, 0, TAU); g.fill();
      font(g, 800, 52 * u, COND); g.fillStyle = T.onBlack; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("VS", 0, 4 * u);
      g.restore();
    }
    if (nums[1]) { const [nx, ny, nw, size] = nums[1]; inkLine(g, mOval(nx, ny, nw / 2 + 40 * u, size * 0.7, 71, u), span(b, st.hold * 0.5, st.hold * 0.5 + 0.6), T.black, 6 * u); }
    head.draw();
  };

  PAGES.closing = (g, F, st, b, D) => {
    const { W, H, u, tall, t, T } = F, v = st.v || 0, wide = !tall && W >= H * 1.3;
    const text = D.heads.closing;
    const dropPhoto = (key, kind, pv, x, y, pw, ph, rot, at, seed, o = {}) => {
      const S0 = settle(b, at);
      if (S0.k <= 0) return S0;
      photo(g, F, key, kind, pv, x, y - S0.drop * u, pw, ph, { rot: rot + S0.wob * 0.16 + sway(t, seed + 61) * 0.01, s: lerp(1.25, 1, eo(S0.k)), a: S0.k * 3, seed, lift: 1 + Math.abs(S0.wob) * 1.5, ...o });
      if (o.tape !== false) tape(g, F, x + (seed % 2 ? 1 : -1) * pw * 0.34, y - S0.drop * u - ph * 0.46, 110 * u, seed % 2 ? 0.5 : -0.5, 90 + seed, clamp(S0.k * 3));
      return S0;
    };
    const stampAt = (word, x, y, size, rot, at, col) => {
      const S0 = settle(b, at);
      stampMark(g, F, word, x, y, size, rot + S0.wob * 0.05, S0.k * 1.0, col);
    };
    const burst = (x, y, at, col) => { for (let k = 0; k < 5; k++) { const ang = Math.PI * (0.95 + k * 0.14); inkLine(g, [x + Math.cos(ang) * 26 * u, y + Math.sin(ang) * 26 * u, x + Math.cos(ang) * 58 * u, y + Math.sin(ang) * 58 * u], span(b, at + k * 0.06, at + 0.2 + k * 0.06), col, 6 * u); } };

    if (v === 1) {
      // A ruled note card pinned to the board, the line typed onto it; snapshots fanned beside it.
      film(g, F, wide ? W * 0.955 : W * 0.5, wide ? H * 0.5 : H * 0.975, wide ? H * 1.3 : W * 1.3, 96 * u, wide ? Math.PI / 2 + 0.03 : -0.03, 52 * u, FRAMES, 5);
      const hang = wide ? [W * 0.86, H * 0.21] : [W * 0.8, H * 0.1], hs = settle(b, 0.55), swing = 0.07 * Math.sin(t * 1.7) + hs.wob * 0.2;
      if (hs.k > 0) {
        g.save(); g.translate(hang[0], hang[1] - 120 * u); g.rotate(swing); g.globalAlpha *= clamp(hs.k * 3);
        photo(g, F, "e1-reel", "reel", 0, 0, 120 * u + 140 * u, 250 * u, 280 * u, { sides: "", chin: 30, seed: 9 });
        g.restore();
        pin(g, F, hang[0], hang[1] - 110 * u, F.acc);
      }
      const cw = wide ? W * 0.5 : W * 0.86, ch = wide ? H * 0.6 : H * 0.36, cx = wide ? W * 0.54 : W * 0.5, cy = H * 0.5;
      const ck = span(b, -0.3, 0.1), crot = -0.022 + sway(t, 71, 0.6) * 0.004;
      const maxW = cw * 0.8, lay = headLayout(g, text, maxW, (wide ? 128 : 100) * u, 66 * u, 3);
      const lh = lay.size * 1.3, total = lay.lines.length * lh;
      scrap(g, F, "e1-card", cx, cy - (1 - eo(ck)) * 40 * u, cw, ch, { fill: T.card, sides: "", rot: crot, s: lerp(1.1, 1, eo(ck)), a: ck * 3, lift: 1.2, inner: (gg, w, h) => {
        gg.fillStyle = T.cardRule; for (let yy = -h / 2 + 110 * u; yy < h / 2 - 8 * u; yy += lh / 1.5) gg.fillRect(-w / 2, yy, w, 1.5 * u);
        gg.fillStyle = F.acc; gg.fillRect(-w / 2 + 70 * u, -h / 2, 2.5 * u, h);
        font(gg, 700, 24 * u, TYPE); gg.fillStyle = T.text; gg.textAlign = "left"; gg.textBaseline = "alphabetic"; gg.globalAlpha *= 0.8;
        gg.fillText("NOTE  ·  TAKE 01", -w / 2 + 92 * u, -h / 2 + 64 * u); gg.globalAlpha /= 0.8;
        typed(gg, F, -w / 2 + 92 * u, h / 2 - 84 * u, 340 * u, 70 * u, "e1sig", { size: 20, lines: 1, head: "- from the edit room", pen: T.text });
        const y0 = -total / 2 + lay.size * 0.62 + 20 * u, last = lay.lines.length - 1;
        lay.lines.forEach((ln, i) => {
          const q = span(b, 0.1 + i * 0.28, 0.1 + i * 0.28 + 0.34), nch = Math.ceil(ln.s.length * q);
          if (nch <= 0) return;
          const yy = y0 + i * lh;
          if (i === last) hilite(gg, F, -ln.w / 2 - 10 * u, yy - lay.size * 0.12, ln.w + 20 * u, lay.size * 0.46, span(b, 1.15, 1.7), "e1hl");
          font(gg, 700, lay.size, SERIF); gg.fillStyle = T.text; gg.textAlign = "left"; gg.fillText(ln.s.slice(0, nch), -ln.w / 2, yy);
        });
      } });
      pin(g, F, cx, cy - ch / 2 + 30 * u, T.black);
      tape(g, F, cx - cw / 2 + 20 * u, cy + ch / 2 - 10 * u, 130 * u, 0.7, 101, clamp(ck * 3));
      tape(g, F, cx + cw / 2 - 20 * u, cy + ch / 2 - 10 * u, 130 * u, -0.7, 102, clamp(ck * 3));
      const fx = wide ? W * 0.13 : W * 0.24, fy = wide ? H * 0.73 : H * 0.84, pw = (wide ? 250 : 240) * u, ph = pw * 1.22;
      [[1, -0.24, -40], [3, -0.06, 0], [5, 0.13, 40]].forEach(([pv, rot, dx], j) => dropPhoto("e1-fan" + j, "face", pv, fx + dx * u, fy + Math.abs(dx) * 0.4 * u, pw, ph, rot, 0.05 + j * 0.3, j + 3, { sides: "", chin: 34, tape: j === 2 }));
      stampAt("APPROVED", cx + cw * 0.28, cy + ch * 0.36, 40 * u, -0.1, 1.45, F.acc);
      burst(cx + cw * 0.28 + 190 * u, cy + ch * 0.32, 1.7, F.acc);
      mArrow(g, F, fx + pw * 0.5, fy - ph * 0.62, cx - cw / 2 - 20 * u, cy - ch * 0.12, -70 * u, span(b, 1.9, 2.5), 103, T.black);
      return;
    }

    if (v === 2) {
      // A black band slashed across the board, the line pasted along it, prints pinned above and below.
      const ps = wide
        ? [["land", 4, W * 0.16, H * 0.19, 420, 310, -0.09], ["camera", 0, W * 0.84, H * 0.8, 420, 310, 0.07], ["city", 3, W * 0.83, H * 0.14, 300, 220, 0.11]]
        : [["land", 4, W * 0.3, H * 0.12, 460, 340, -0.08], ["camera", 0, W * 0.7, H * 0.84, 460, 340, 0.06], ["city", 3, W * 0.78, H * 0.26, 280, 210, 0.12]];
      film(g, F, wide ? W * 0.28 : W * 0.5, wide ? H * 0.86 : H * 0.7, wide ? W * 0.75 : W * 1.4, 92 * u, -0.13, -48 * u, FRAMES, 6);
      clipping(g, F, "e2-clip", wide ? W * 0.1 : W * 0.18, wide ? H * 0.97 : H * 0.98, 380 * u, 280 * u, 0.06 + sway(t, 77) * 0.005, "The final cut is yours");
      ps.forEach(([kind, pv, x, y, pw, ph, rot], j) => dropPhoto("e2-p" + j, kind, pv, x, y, pw * u, ph * u, rot, 0.0 + j * 0.32, j + 7));
      const ang = -0.13, maxW = wide ? W * 0.7 : W - 140 * u, lay = headLayout(g, text, maxW, (wide ? 112 : 96) * u, 66 * u, 3);
      const total = lay.lines.length * lineH(lay, u), last = lay.lines.length - 1;
      g.save(); g.translate(W / 2, H * 0.52); g.rotate(ang);
      drawHead(g, F, lay, 0, -total / 2, b, { key: "closing2", align: "center", at: 0.1, styles: [{ bg: T.paper2, fg: T.text }, { bg: F.acc, fg: onColor(F, F.acc) }], hl: last % 2 ? null : last, hlq: span(b, 1.1, 1.7) });
      const widest = Math.max(...lay.lines.map((l) => l.w)) + lay.size * 0.68;
      stampAt("PRINT IT", Math.min(widest / 2, maxW / 2) - (wide ? 40 : 190) * u, total / 2 + 64 * u, 46 * u, 0.06, 1.45, T.hi);
      burst(-Math.min(widest / 2, maxW / 2) + 30 * u, total / 2 + 60 * u, 1.75, T.onBlack);
      g.restore();
      const [ox, oy, opw, oph] = [ps[0][2], ps[0][3], ps[0][4] * u, ps[0][5] * u];
      inkLine(g, mOval(ox, oy, opw * 0.42, oph * 0.4, 104, u), span(b, 2.0, 2.6), F.acc, 6 * u);
      return;
    }

    // v0: the project folder slides up from the bottom of the board, its prints rising out of it and bobbing;
    // the line is pasted above it and the folder gets stamped. A film strip runs up the left edge.
    film(g, F, wide ? W * 0.055 : W * 0.5, wide ? H * 0.5 : H * 0.035, wide ? H * 1.3 : W * 1.3, 92 * u, wide ? -Math.PI / 2 + 0.03 : 0.03, 52 * u, FRAMES, 3);
    const maxW = wide ? W * 0.72 : W - 140 * u, lay = headLayout(g, text, maxW, (wide ? 112 : 100) * u, 66 * u, 3);
    const total = lay.lines.length * lineH(lay, u), y0 = wide ? H * 0.1 : H * 0.12, last = lay.lines.length - 1;
    const fw = wide ? 1100 * u : W * 0.9, fh = fw * (wide ? 0.66 : 0.98), fcx = W * 0.5 + (wide ? 30 : 0) * u, fcy = (wide ? Math.max(y0 + total + 150 * u, H * 0.5) : Math.max(y0 + total + 330 * u, H * 0.43)) + fh / 2;
    const fk = span(b, -0.1, 0.4), fdy = (1 - eo(fk)) * 260 * u;
    const sl = settle(b, 0.7), slx = wide ? W * 0.88 : W * 0.72, sly = wide ? H * 0.5 : H * 0.36;
    if (sl.k > 0) { g.save(); g.globalAlpha *= clamp(sl.k * 3); slate(g, F, slx, sly - sl.drop * u, (wide ? 260 : 230) * u, 0.12 + sl.wob * 0.12 + sway(t, 9) * 0.01, b - 1.0, 3); g.restore(); }
    const pol = settle(b, 0.45);
    if (pol.k > 0 && wide) { photo(g, F, "e0-pol", "face", 5, W * 0.14, H * 0.58 - pol.drop * u, 250 * u, 300 * u, { sides: "", chin: 34, rot: -0.11 + pol.wob * 0.15 + sway(t, 12) * 0.01, s: lerp(1.25, 1, eo(pol.k)), a: pol.k * 3, seed: 12 }); tape(g, F, W * 0.14, H * 0.58 - 150 * u - pol.drop * u, 110 * u, 0.2, 140, clamp(pol.k * 3)); }
    if (fk > 0) {
      g.save(); g.translate(0, fdy); g.rotate(sway(t, 15, 0.6) * 0.004);
      const prints = [["land", 6, -0.27, -0.07], ["camera", 0, 0.0, 0.03], ["face", 1, 0.26, 0.09]];
      folder(g, F, fcx, fcy, fw, fh, (inTop) => {
        prints.forEach(([kind, pv, ox, prot], j) => {
          const pw = fw * 0.34, ph = pw * 0.84, k = span(b, 0.3 + j * 0.18, 0.85 + j * 0.18);
          if (k <= 0) return;
          const bob = Math.sin(t * 1.4 + j * 2.1) * 12 * u, rise = ph * 0.74 * eo(k);
          photo(g, F, "e0-pr" + j, kind, pv, fcx + ox * fw, inTop + ph / 2 - rise + bob + 20 * u, pw, ph, { sides: j === 1 ? "t" : "", rot: prot + sway(t, j + 31) * 0.015, seed: j + 20 });
        });
      }, (ft) => {
        scrap(g, F, "e0-tag", fcx - fw * 0.26, ft + fh * (wide ? 0.3 : 0.22), fw * 0.3, fw * 0.15, { fill: T.paper2, sides: "r", rot: -0.03, lift: 0.6, inner: (gg, w, h) => typed(gg, F, -w * 0.42, -h * 0.42, w * 0.84, h * 0.84, "e0tag", { size: 20, lines: 3, head: "PROJECT 01" }) });
        tape(g, F, fcx - fw * 0.4, ft + fh * (wide ? 0.3 : 0.22) - fw * 0.06, 100 * u, -0.6, 141);
        stampMark(g, F, "FINAL CUT", fcx + fw * 0.2, ft + fh * 0.2, 46 * u, -0.08, span(b, 1.5, 1.62), F.acc);
      });
      g.restore();
    }
    const cs = last % 2 ? [{ bg: T.black, fg: T.onBlack }, { bg: T.paper2, fg: T.text }] : [{ bg: T.paper2, fg: T.text }, { bg: T.black, fg: T.onBlack }];
    drawHead(g, F, lay, W / 2, y0, b, { key: "closing", align: "center", at: 0.15, styles: cs, hl: last, hlq: span(b, 1.1, 1.7) });
    const widest = Math.min(Math.max(...lay.lines.map((l) => l.w)) + lay.size * 0.68, maxW);
    burst(W / 2 - widest / 2 - 10 * u, y0 + total * 0.5, 1.75, T.black);
    mArrow(g, F, W / 2 + widest / 2 - 40 * u, y0 + total + 10 * u, fcx + fw * 0.08, fcy - fh / 2 + 10 * u, -50 * u, span(b, 1.9, 2.5), 106, F.acc);
  };

  // ---- the plan, the camera and the sheet change ---------------------------------------------------
  function controls() {
    if (window.__dreamcut && window.__dreamcut.controls) return window.__dreamcut.controls;
    try { if (typeof dc !== "undefined" && dc && dc.controls) return dc.controls; } catch (e) { /* not on this page */ }
    return null;
  }
  let planCache = null, planKey = "";
  function planOf() {
    const c = controls();
    if (!c) return null;
    const key = JSON.stringify(c);
    if (planCache && planKey === key) return planCache;
    let t = 0;
    const shown = [];
    for (const id of ORDER) { const hold = Number(c[`${id}_hold`]) || 0; if (hold > 0) shown.push({ id, start: t, hold }); t += hold; }
    if (!shown.length) return null;
    const change = Number(c.change) || 0.45, D = clamp(change * 1.5, 0.45, 1.3);
    shown.forEach((st, i) => { st.i = i; st.appear = i ? st.start - D * 0.38 : -0.15; });
    // Each explainer closes on its own collage, chosen by the scene it opened with.
    const close = shown.find((st) => st.id === "closing");
    if (close) close.v = { title: 0, object: 0, people: 1, compare: 1, chart: 2, process: 2 }[shown[0].id] ?? 0;
    const data = {
      chart: { labels: [c.bar_1_label, c.bar_2_label, c.bar_3_label, c.bar_4_label], values: [c.bar_1, c.bar_2, c.bar_3, c.bar_4].map(Number), suffix: c.chart_suffix, prefix: "", highlight: Number(c.highlight) - 1 },
      object: { kind: c.device, callouts: [c.callout_1, c.callout_2, c.callout_3] },
      people: { count: c.people_count, badges: [c.badge_1, c.badge_2, c.badge_3], highlight: 1 },
      process: { steps: [c.step_1, c.step_2, c.step_3] },
      compare: { left: c.before_label, leftValue: Number(c.before_value) || 0, right: c.after_label, rightValue: Number(c.after_value) || 0, suffix: c.compare_suffix, prefix: "" },
    };
    const heads = { kicker: c.kicker, title: c.title, chart: c.chart_title, object: c.object_title, people: c.people_title, process: c.process_title, compare: c.compare_title, closing: c.closing };
    planKey = key;
    return (planCache = { shown, data, heads, D, length: t, backdrop: c.backdrop !== false });
  }
  function drawPage(g, F, st, D) {
    const { W, H, u, t } = F, b = t - st.appear;
    g.save();
    // A slow push and drift on each sheet, so no hold is ever still.
    let z = 1.035 + 0.06 * clamp(b / (st.hold + 1.5)), dx = sway(t * 0.5, st.i + 1) * 15 * u, dy = sway(t * 0.45, st.i + 5) * 9 * u;
    // The closing collage keeps travelling: a steady push and a drift across the board to the last frame.
    if (st.id === "closing") { const q = clamp(b / (st.hold + 0.4)); z = 1.03 + 0.035 * q; dx += lerp(1, -1, q) * W * 0.014 * ((st.v || 0) === 1 ? -1 : 1); dy += lerp(0.6, -0.6, q) * H * 0.008; }
    g.translate(W / 2 + dx, H / 2 + dy); g.rotate(sway(t * 0.3, st.i + 2) * 0.004); g.scale(z, z); g.translate(-W / 2, -H / 2);
    if (F.bg) { const bg = background(F, st); g.drawImage(bg.c, -bg.pad, -bg.pad); }
    if (PAGES[st.id]) PAGES[st.id](g, F, st, b, D);
    g.restore();
  }
  // The next sheet slides over the last: a torn, fibrous leading edge, a shadow on the sheet beneath.
  const EDGE = new Map();
  function edgeOf(i, L, u) {
    const key = i + "|" + (L | 0);
    if (EDGE.has(key)) return EDGE.get(key);
    const r = R("edge" + i), out = [], out2 = [];
    let drift = 0;
    for (let s = -80 * u; s <= L + 80 * u; s += 10 * u) {
      drift = drift * 0.8 + (r() - 0.5) * 16 * u;
      const big = Math.sin(s / (L * 0.23) + i * 2) * 30 * u;
      out.push([s, drift + big + (r() - 0.5) * 6 * u]);
      out2.push([s, drift + big - (5 + r() * 9) * u]);
    }
    EDGE.set(key, { out, out2 });
    return EDGE.get(key);
  }
  function sheet(g, F, from, to, k, D) {
    const { W, H, u, T } = F, dirs = ["right", "bottom", "left", "bottom"], dir = dirs[(to.i - 1) % 4];
    const horiz = dir === "right" || dir === "left", L = horiz ? H : W, span0 = horiz ? W : H, m = eio(k);
    const pos = lerp(span0 + 90 * u, -140 * u, m), tilt = (1 - m) * 0.12;
    const map = (p, s) => (dir === "right" ? [p, s] : dir === "left" ? [W - p, s] : dir === "bottom" ? [s, p] : [s, H - p]);
    const E = edgeOf(to.i, L, u);
    const poly = (pts, far = span0 + 400 * u) => {
      g.beginPath();
      pts.forEach(([s, o], j) => { const [x, y] = map(pos + o + tilt * (s - L / 2), s); if (j) g.lineTo(x, y); else g.moveTo(x, y); });
      const [x1, y1] = map(far, L + 80 * u), [x2, y2] = map(far, -80 * u);
      g.lineTo(x1, y1); g.lineTo(x2, y2); g.closePath();
    };
    if (F.bg) { drawPage(g, F, from, D); g.fillStyle = `rgba(${T.stain},${0.12 * m})`; g.fillRect(0, 0, W, H); }
    else { g.save(); poly(E.out, -400 * u); g.clip(); drawPage(g, F, from, D); g.restore(); }
    g.save();
    const sx = dir === "right" ? -1 : dir === "left" ? 1 : 0, sy = dir === "bottom" ? -1 : dir === "top" ? 1 : 0;
    g.shadowColor = "rgba(40,22,8,0.45)"; g.shadowBlur = 34 * u; g.shadowOffsetX = sx * 16 * u; g.shadowOffsetY = sy * 16 * u;
    if (F.bg) { poly(E.out2); g.fillStyle = T.fibre; g.fill(); }
    else {
      // Over footage only the torn paper edge travels: a band between the fibre line and a second tear.
      g.beginPath();
      E.out2.forEach(([s0, o], j) => { const [x, y] = map(pos + o + tilt * (s0 - L / 2), s0); if (j) g.lineTo(x, y); else g.moveTo(x, y); });
      for (let j = E.out.length - 1; j >= 0; j--) { const [s0, o] = E.out[j]; const [x, y] = map(pos + o + 46 * u + tilt * (s0 - L / 2), s0); g.lineTo(x, y); }
      g.closePath(); g.fillStyle = T.paper2; g.fill();
    }
    g.restore();
    g.save();
    poly(E.out); g.clip();
    drawPage(g, F, to, D);
    g.restore();
  }
  function finishFrame(g, F) {
    if (!F.bg || F.tex <= 0) return;
    const { W, H, T, tex } = F;
    g.save();
    g.globalCompositeOperation = "overlay"; g.globalAlpha = T.grain * tex;
    // The grain boils: the paper tooth shifts on a stepped twelve-a-second clock, like re-photographed stock.
    const rb = R("boil" + Math.floor(F.t * 12)), ox = (rb() * 256) | 0, oy = (rb() * 256) | 0;
    g.translate(-ox, -oy);
    g.fillStyle = g.createPattern(grainTile(), "repeat"); g.fillRect(ox, oy, W, H);
    g.restore();
    const gd = g.createRadialGradient(W * 0.5, H * 0.46, Math.min(W, H) * 0.3, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.62);
    gd.addColorStop(0, "rgba(0,0,0,0)"); gd.addColorStop(1, `rgba(${T.stain},${T.vignette * tex})`);
    g.fillStyle = gd; g.fillRect(0, 0, W, H);
  }

  let frame = null;
  function makeF(S, info) {
    const T = S.look.tone || TONE, P = planOf();
    return {
      S, W: S.W, H: S.H, u: S.u, tall: S.tall, T, acc: S.accent, tex: S.look.texture ?? 1, t: info.t, info, plan: P,
      bg: P ? P.backdrop : true,
    };
  }
  const domText = (id) => { const el = document.getElementById(id); return el ? el.textContent : ""; };
  const scene = (id) => (ctx, S, box, p, d, info) => {
    // With the controls known the stage draws every sheet; this only runs when they are unavailable.
    const F = frame;
    if (!F || F.plan || !info || info.exit != null) return;
    const st = { id, i: 0, appear: F.t - info.local, hold: info.hold };
    const D = { data: { [id]: d }, heads: { [id]: domText(`${id}-title`) } };
    ctx.save();
    PAGES[id](ctx, F, st, info.local, D);
    ctx.restore();
  };

  const TONE = {
    key: "o", paper: "#ece3d3", paper2: "#f8f3e9", news: "#ddd5c3", photo: "#efe9dc", card: "#fbfaf5", kraft: "#c4996a", kraft2: "#a57a4c", black: "#26211c", film: "#1d1915", sprocket: "#e9e1d1",
    teal: "#4f7c79", accDeep: "#9d3f2a", text: "#231e19", onBlack: "#f6efe3", hi: "#f2d14a", tape: "rgba(238,228,198,0.8)", fibre: "#fbf8f1", dot: "#2a2420",
    shadow: "rgba(70,44,18,0.3)", stain: "92,62,30", grid: "rgba(70,110,150,0.16)", gridMajor: "rgba(70,110,150,0.32)", cardRule: "rgba(70,110,170,0.3)", grain: 0.13, vignette: 0.26,
  };

  return {
    bg: "#efe7da", panel: "#f8f3ea", ink: "#2b2520", muted: "#7a6e62", accent: "#c4553a", onAccent: "#fff8ef",
    rule: "rgba(43,37,32,0.16)", track: "rgba(43,37,32,0.08)",
    display: "'Iowan Old Style', Georgia, 'Times New Roman', serif", displayWeight: 600, displayCase: "none", displayTracking: "-0.01em",
    body: "'Avenir Next', Avenir, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif", bodyWeight: 500,
    figures: "'Iowan Old Style', Georgia, serif", radius: 18, motion: "rise", kit: { line: 3, fill: "solid", panel: "fill" },
    tone: TONE,
    palettes: {
      light: { bg: "#fbf8f2", panel: "#ffffff", backdrop: (accent, texture = 1) => `${grain(0.05 * texture)}, #fbf8f2`,
        tone: { ...TONE, key: "l", paper: "#f8f4ec", paper2: "#ffffff", news: "#e9e4d8", photo: "#f7f3ea", kraft: "#d6b48a", kraft2: "#bf9765", teal: "#6b9a96", shadow: "rgba(80,55,25,0.2)", grain: 0.09, vignette: 0.12 } },
      dark: { bg: "#231d18", panel: "#2e2620", ink: "#f3ebdf", muted: "#b5a796", accent: "#e0784f", onAccent: "#231d18", rule: "rgba(243,235,223,0.2)", track: "rgba(243,235,223,0.08)",
        backdrop: (accent, texture = 1) => `${grain(0.09 * texture)}, radial-gradient(120% 90% at 50% 40%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.35) 100%), #231d18`,
        tone: { ...TONE, key: "d", paper: "#2b241e", paper2: "#efe7d8", news: "#d3cab7", photo: "#e6dfcf", kraft: "#7d5f40", kraft2: "#5c432b", black: "#120f0c", film: "#0d0b09", teal: "#35514f", accDeep: "#a24a2c",
          shadow: "rgba(0,0,0,0.55)", stain: "8,5,2", fibre: "#e9e1d2", grain: 0.16, vignette: 0.45 } },
      mono: { accent: "#2b2520", onAccent: "#efe7da",
        tone: { ...TONE, key: "m", kraft: "#b8ad9b", kraft2: "#9a8f7d", teal: "#8c8478", accDeep: "#4a423a", hi: "#d9d2c4", cardRule: "rgba(43,37,32,0.18)", grid: "rgba(43,37,32,0.1)", gridMajor: "rgba(43,37,32,0.22)" } },
    },
    backdrop: (accent, texture = 1) => `${grain(0.07 * texture)}, radial-gradient(120% 90% at 50% 40%, rgba(255,250,240,0.0) 55%, rgba(120,82,46,0.16) 100%), #efe7da`,
    // On the illustrated explainer the headlines are cut and pasted on the canvas; the page copies stay as
    // the source of the words. Scoped to that template, so the text templates keep their own type.
    css: () => `#root:has(> #object-scene) .display, #root:has(> #object-scene) .kicker { opacity: 0 !important; }`,
    keepArt: true,
    overlap: true,
    stage(ctx, S, info) {
      const F = (frame = makeF(S, info)), P = F.plan;
      if (!P) {
        if (F.bg) { const bg = background(F, { id: info.scene || "title", i: Math.max(0, info.index) }); ctx.drawImage(bg.c, -bg.pad, -bg.pad); }
        return;
      }
      const t = info.t, sh = P.shown;
      let i = sh.findIndex((st) => t >= st.start && t < st.start + st.hold);
      if (i < 0) i = t < 0 ? 0 : sh.length - 1;
      const next = sh[i + 1];
      let from = null, to = sh[i], k = 1;
      if (next && t >= next.appear) { from = to; to = next; k = (t - next.appear) / P.D; }
      else if (i > 0 && t < to.appear + P.D) { from = sh[i - 1]; k = (t - to.appear) / P.D; }
      ctx.save();
      if (from && k < 1) sheet(ctx, F, from, to, clamp(k), P);
      else drawPage(ctx, F, to, P);
      ctx.restore();
      finishFrame(ctx, F);
    },
    scenes: { chart: scene("chart"), object: scene("object"), people: scene("people"), process: scene("process"), compare: scene("compare") },
  };
});
