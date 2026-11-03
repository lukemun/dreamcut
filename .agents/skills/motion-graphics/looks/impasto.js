// Impasto: an oil painting of a harbour at first light, laid on in short thick strokes. Every mark
// is a dab with a lit ridge on the side facing the light and a shadow on the other, so the whole
// frame reads as relief paint. Sky and sea follow a flow field that swirls around a sun climbing
// over the reel; a lighthouse beam sweeps, gulls cross, sails bob and the foreground reeds sway
// through every hold. Scenes are palette-knife slabs and paint-built objects (squeezed bars with
// curled peaks, a device that shows a tiny painted harbour, smocked painters with brush trails,
// swirl medallions joined by a ribbon of paint, jars that fill). Between scenes a loaded brush
// is dragged across the frame: the old section stays ahead of the brush and the next is revealed
// behind it. All motifs are original. Frames are pure functions of time.
window.DreamcutMotion.register("impasto", ({ rng }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const smooth = (a, b, v) => { const k = clamp((v - a) / (b - a)); return k * k * (3 - 2 * k); };
  const inout = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const lerp = (a, b, k) => a + (b - a) * k;
  const fract = (v) => v - Math.floor(v);
  const hash = (a, b = 0) => fract(Math.sin(a * 127.1 + b * 311.7 + 7.13) * 43758.5453);
  const SERIF = "'Rockwell Extra Bold', 'Rockwell', 'Cooper Black', 'Georgia', serif";
  const DRAWN = ["chart", "object", "people", "process", "compare"];

  // ---- noise ----------------------------------------------------------------------------------------
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
  }
  const fbm = (x, y) => vnoise(x, y) * 0.62 + vnoise(x * 2.1 + 5, y * 2.1 + 9) * 0.38;

  // ---- colour ---------------------------------------------------------------------------------------
  const hexRGB = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const rgb = (c, a) => (a === undefined ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`);
  const CREAM = [255, 246, 220], DEEP = [20, 12, 46];
  const ramp = (stops, v) => {
    v = clamp(v);
    for (let i = 1; i < stops.length; i++) if (v <= stops[i][0]) return mix(stops[i - 1][1], stops[i][1], (v - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0] || 1));
    return stops[stops.length - 1][1];
  };
  const stopsOf = (list) => list.map(([p, h]) => [p, hexRGB(h)]);
  const hexA = (hex, a) => rgb(hexRGB(hex), a);

  // Per-frame state shared by the stage and the scene drawers.
  const cur = { relief: 1, s: null, phase: null, S: null, info: null, T: null };
  let cache = new Map();

  // ---- the dab: one thick stroke with a lit ridge and a shadow ----------------------------------------
  // (-0.62, -0.78) points toward the light, so ridges sit up-left and shadows fall down-right.
  const LX = -0.62, LY = -0.78;
  // A loaded brush stroke: a blunt landing blob that swells, then tapers to a dry, lifted tail. The body
  // bends a little, carries ridged bristle grooves in lighter and darker paint, a lit lip on the side
  // facing the light and a cast shadow on the other. Every stroke's profile is seeded from its position.
  const PROF = [[-0.03, 0.0], [0.0, 0.66], [0.08, 0.94], [0.3, 1.0], [0.62, 0.9], [0.84, 0.6], [1.0, 0.16]];
  function bodyPath(g, x0, y0, dx, dy, nx, ny, L, hw, bend, taper, ox, oy) {
    g.beginPath();
    for (let i = 0; i < PROF.length; i++) {
      const [f, w0] = PROF[i], w = (f > 0.6 ? w0 * taper + (1 - taper) * w0 * 0.55 : w0) * hw, b = Math.sin(clamp(f) * Math.PI) * bend;
      const cx = x0 + dx * L * f + nx * b + ox, cy = y0 + dy * L * f + ny * b + oy;
      if (i === 0) g.moveTo(cx + nx * w, cy + ny * w); else g.lineTo(cx + nx * w, cy + ny * w);
    }
    for (let i = PROF.length - 1; i >= 0; i--) {
      const [f, w0] = PROF[i], w = (f > 0.6 ? w0 * taper + (1 - taper) * w0 * 0.55 : w0) * hw * 0.92, b = Math.sin(clamp(f) * Math.PI) * bend;
      const cx = x0 + dx * L * f + nx * b + ox, cy = y0 + dy * L * f + ny * b + oy;
      g.lineTo(cx - nx * w, cy - ny * w);
    }
    g.closePath();
  }
  // A stroke's look is fixed by its seed, so a moving stroke keeps the same grooves and highlight.
  const WARM = [255, 206, 140], COOL = [86, 92, 190];
  function dab(g, x, y, ang, len, wid, c, grow = 1, alpha = 1, seed) {
    if (grow <= 0 || alpha <= 0 || len <= 0) return;
    const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
    const x0 = x - dx * len * 0.5, y0 = y - dy * len * 0.5, L = len * grow;
    const sd = seed === undefined ? hash(Math.round(x / (wid * 3 + 2)) + len * 0.37, Math.round(y / (wid * 3 + 2)) + wid * 0.71) : fract(Math.sin(seed * 12.9898 + 4.1) * 43758.5453);
    const sd2 = fract(sd * 7.31), sd3 = fract(sd * 13.7), sd4 = fract(sd * 29.3);
    const R = cur.relief, hw = wid * 0.5;
    const bend = (sd - 0.5) * wid * 0.55, taper = 0.55 + sd2 * 0.45;
    if (alpha < 1) g.globalAlpha *= alpha;
    const at = (f, across) => { const b = Math.sin(clamp(f) * Math.PI) * bend; return [x0 + dx * L * f + nx * (across + b), y0 + dy * L * f + ny * (across + b)]; };
    const seg = (f0, f1, a0, a1) => { const p0 = at(f0, a0), pm = at((f0 + f1) / 2, (a0 + a1) / 2 + bend * 0.05), p1 = at(f1, a1); g.beginPath(); g.moveTo(p0[0], p0[1]); g.quadraticCurveTo(pm[0], pm[1], p1[0], p1[1]); g.stroke(); };
    if (L < wid * 0.9) {
      // A blob: a round dollop of paint with a swirl groove and a lit crescent.
      const r = Math.max(L, wid) * 0.5;
      if (R > 0.02) { const o = r * 0.16 * R; g.fillStyle = rgb(mix(c, DEEP, 0.34 * R + 0.06)); g.beginPath(); g.arc(x - LX * o, y - LY * o, r * 1.03, 0, TAU); g.fill(); }
      g.fillStyle = rgb(c); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      if (R > 0.02 && r > 3) {
        const la = Math.atan2(LY, LX);
        g.lineCap = "round";
        g.strokeStyle = rgb(mix(c, DEEP, 0.2 * R)); g.lineWidth = Math.max(0.8, r * 0.12);
        g.beginPath(); g.arc(x, y, r * 0.52, la + Math.PI * 0.4 + sd * 2, la + Math.PI * 1.5 + sd * 2); g.stroke();
        g.strokeStyle = rgb(mix(c, CREAM, (0.25 + 0.3 * sd4) * R)); g.lineWidth = Math.max(1, r * 0.18);
        g.beginPath(); g.arc(x, y, r * 0.7, la - 0.6 - sd2 * 0.4, la + 0.4 + sd3 * 0.4); g.stroke();
      }
      if (alpha < 1) g.globalAlpha /= alpha;
      return;
    }
    // cast shadow (down-right of the stroke)
    if (R > 0.02) {
      const o = wid * 0.17 * R;
      g.fillStyle = rgb(mix(c, DEEP, 0.34 * R + 0.06));
      bodyPath(g, x0, y0, dx, dy, nx, ny, L, hw * 1.04, bend, taper, -LX * o, -LY * o); g.fill();
    }
    g.fillStyle = rgb(c);
    bodyPath(g, x0, y0, dx, dy, nx, ny, L, hw, bend, taper, 0, 0); g.fill();
    if (wid > 5) {
      // wet-on-wet: a second tone dragged into part of the stroke
      const c2 = mix(c, sd4 > 0.5 ? WARM : COOL, 0.16 + 0.18 * sd3), f0 = 0.08 + sd * 0.3, off = (sd2 - 0.5) * hw * 0.9;
      g.fillStyle = rgb(c2);
      bodyPath(g, x0 + dx * L * f0, y0 + dy * L * f0, dx, dy, nx, ny, L * (0.45 + 0.35 * sd3), hw * (0.35 + 0.2 * sd2), bend * 0.6, taper, nx * off, ny * off); g.fill();
    }
    if (R > 0.02 && wid > 3.5) {
      g.lineCap = "round";
      // a few bristle grooves of different lengths and weights
      const nG = wid > 16 ? 2 + (sd3 > 0.5 ? 1 : 0) : wid > 8 ? 1 + (sd3 > 0.6 ? 1 : 0) : 1;
      for (let k = 0; k < nG; k++) {
        const across = (fract(sd * (k + 3) * 5.1) - 0.5) * 1.15 * hw;
        const f0 = 0.04 + fract(sd2 * (k + 1) * 2.3) * 0.3, f1 = Math.min(0.97, f0 + 0.3 + fract(sd3 * (k + 2) * 3.7) * 0.55);
        g.strokeStyle = rgb(mix(c, DEEP, (0.16 + 0.16 * fract(sd * (k + 7) * 1.9)) * R + 0.03));
        g.lineWidth = Math.max(0.7, wid * (0.045 + 0.06 * fract(sd4 * (k + 5) * 2.7)));
        seg(f0, f1, across, across * 0.8);
      }
      // one ridge catching the light, on the side facing it, at its own place and strength
      const side = nx * LX + ny * LY > 0 ? 1 : -1, acr = side * hw * (0.2 + 0.45 * sd2);
      const hs = (0.12 + 0.5 * sd4 * sd4) * R;
      g.strokeStyle = rgb(mix(c, CREAM, hs));
      g.lineWidth = Math.max(0.9, wid * (0.07 + 0.1 * sd));
      const h0 = 0.04 + 0.2 * sd3, h1 = Math.min(0.92, h0 + 0.25 + 0.5 * sd);
      seg(h0, h1, acr, acr * 0.85);
      // broken, dry bristle ends trailing off the tail
      if (wid > 6) {
        g.strokeStyle = rgb(mix(c, DEEP, 0.06)); g.lineWidth = Math.max(0.8, wid * 0.11);
        const nf = 2 + (sd2 > 0.5 ? 1 : 0);
        for (let k = 0; k < nf; k++) { const ac = (k / (nf - 1) - 0.5) * hw * 0.7; seg(0.8, 0.98 + 0.12 * fract(sd * (k + 2) * 4.3), ac, ac * 1.4); }
      }
      // where the brush landed, a little ridge of paint
      if (wid > 8 && sd2 > 0.3) {
        const p = at(0.07, side * hw * 0.3);
        g.fillStyle = rgb(mix(c, CREAM, (0.3 + 0.3 * sd) * R));
        g.beginPath(); g.ellipse(p[0], p[1], wid * 0.1, wid * 0.2, ang, 0, TAU); g.fill();
      }
    }
    if (alpha < 1) g.globalAlpha /= alpha;
  }

  // A dragged line of paint along a polyline: overlapping loaded strokes that follow the path, each with
  // a cast shadow, bristle grooves that bend with the path and a lit lip. p draws it on from the start.
  function ridgeLine(g, pts, wid, color, p = 1, step) {
    if (p <= 0 || pts.length < 2) return;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = cum[cum.length - 1];
    if (total <= 0.5) return;
    const upto = total * clamp(p), R = cur.relief;
    let seg = 1;
    const at = (sv) => {
      if (sv < cum[seg - 1]) seg = 1;
      while (seg < cum.length - 1 && cum[seg] < sv) seg++;
      const a = pts[seg - 1], b = pts[seg], l = cum[seg] - cum[seg - 1] || 1e-6, f = clamp((sv - cum[seg - 1]) / l);
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, (b[0] - a[0]) / l, (b[1] - a[1]) / l];
    };
    const line = (P, across, ox, oy) => {
      g.beginPath();
      for (let i = 0; i < P.length; i++) { const q = P[i], x = q[0] - q[3] * across + ox, y = q[1] + q[2] * across + oy; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
    };
    g.lineCap = "round"; g.lineJoin = "round";
    let a = 0, k = 0;
    const base = Math.max(wid * 2.4, (step || wid) * 2.8), chunks = [];
    while (a < upto - 0.5 && k < 400) {
      const cl = base * (0.75 + hash(k, 3 + wid) * 0.8), b = Math.min(upto, a + cl);
      const c = typeof color === "function" ? color(k, (a + b) / 2 / total) : color;
      const wv = wid * (0.9 + hash(k, 5) * 0.16), dsv = clamp(wv * 0.55, 2, 12);
      const P = [];
      seg = 1;
      for (let sv = a; sv < b; sv += dsv) P.push(at(sv));
      P.push(at(b));
      if (P.length < 2) P.push(at(Math.min(total, b + 1)));
      chunks.push({ P, c, wv, k });
      if (b >= upto) break;
      a = b - wv * 0.45; k++;
    }
    // one shadow under the whole line, then the strokes, then their grooves and lit lips
    if (R > 0.02) for (const { P, c, wv } of chunks) { const o = wv * 0.18 * R; g.strokeStyle = rgb(mix(c, DEEP, 0.38 * R + 0.08)); g.lineWidth = wv * 1.04; line(P, 0, -LX * o, -LY * o); }
    for (const { P, c, wv } of chunks) { g.strokeStyle = rgb(c); g.lineWidth = wv; line(P, 0, 0, 0); }
    if (R > 0.02) for (const { P, c, wv, k: kk } of chunks) {
      if (wv <= 3.5) continue;
      const nB = wv > 12 ? 3 : 1, n = P.length;
      for (let j = 0; j < nB; j++) {
        const across = (-0.32 + (0.64 * (j + 0.5)) / nB) * wv, dark = (j + kk) % 2 === 0;
        const s0 = Math.floor(hash(kk * 7 + j, 11) * n * 0.25), s1 = Math.max(s0 + 2, Math.ceil(n * (0.6 + hash(kk * 5 + j, 13) * 0.4)));
        g.strokeStyle = rgb(dark ? mix(c, DEEP, (0.14 + 0.16 * hash(kk * 3 + j, 19)) * R + 0.03) : mix(c, CREAM, (0.08 + 0.2 * hash(kk * 5 + j, 23)) * R));
        g.lineWidth = Math.max(0.8, wv * (dark ? 0.06 + 0.06 * hash(kk + j, 29) : 0.07));
        line(P.slice(s0, s1), across, 0, 0);
      }
      const mid = P[Math.floor(n / 2)], side = -mid[3] * LX + mid[2] * LY > 0 ? 1 : -1;
      g.strokeStyle = rgb(mix(c, CREAM, (0.2 + 0.3 * hash(kk, 31)) * R)); g.lineWidth = Math.max(1, wv * (0.08 + 0.08 * hash(kk, 37)));
      line(P.slice(0, Math.max(2, Math.ceil(n * (0.55 + hash(kk, 17) * 0.35)))), side * wv * 0.33, 0, 0);
    }
  }
  const spline = (P, seg = 8) => {
    const out = [];
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || P[i + 1];
      for (let k = 0; k < seg; k++) {
        const t = k / seg, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    out.push(P[P.length - 1].slice());
    return out;
  };

  // ---- filled shapes made of strokes (strokes are cached per shape; drawing is a pure function of p) -----
  // shape: { w, h, inside(x,y), ang(x,y), order(x,y) 0..1 }; sizes: { len, wid, step }
  function strokesFor(key, shape, sz) {
    let hit = cache.get(key);
    if (hit) return hit;
    if (cache.size > 160) cache = new Map();
    const r = rng(hash(key.length, key.charCodeAt(2) || 1) * 1e6 + 11);
    const list = [];
    const sx = sz.step * 1.0, sy = sz.sy || sz.wid * 0.55;
    for (let y = 0; y <= shape.h + sy; y += sy) {
      for (let x = 0; x <= shape.w + sx; x += sx) {
        const px = x + (r() - 0.5) * sx * 0.9, py = y + (r() - 0.5) * sy * 0.9;
        if (!shape.inside(px, py)) continue;
        list.push({ x: px, y: py, a: shape.ang(px, py) + (r() - 0.5) * 0.5, l: sz.len * (0.8 + r() * 0.5), w: sz.wid * (0.85 + r() * 0.3), o: shape.order(px, py), j: r(), ph: r() * TAU });
      }
    }
    list.sort((p, q) => p.j - q.j);
    cache.set(key, list);
    return list;
  }
  function paintShape(g, key, shape, sz, colorFn, p, wob = 0, T = 0) {
    if (p <= 0) return;
    const list = strokesFor(key, shape, sz);
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const k = clamp((p - s.o * 0.72) / 0.28);
      if (k <= 0) continue;
      dab(g, s.x, s.y, s.a + (wob ? Math.sin(T * 2.2 + s.ph) * wob : 0), s.l, s.w, colorFn(s, i), ease(k), clamp(k * 3));
    }
  }
  const rrIn = (w, h, r) => (x, y) => {
    if (x < 0 || y < 0 || x > w || y > h) return false;
    const cx = x < r ? r : x > w - r ? w - r : x, cy = y < r ? r : y > h - r ? h - r : y;
    return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
  };
  const pick = (cols, s, spread = 0.18) => { const c = cols[Math.floor(s.j * 997) % cols.length]; return mix(c, s.j > 0.5 ? CREAM : DEEP, Math.abs(s.j - 0.5) * spread); };

  // ---- lettering on paint ------------------------------------------------------------------------------
  function say(g, str, x, y, size, o = {}) {
    str = String(str ?? "");
    if (!str || (o.q !== undefined && o.q <= 0)) return 0;
    g.save();
    g.font = `800 ${size}px ${SERIF}`;
    let w = g.measureText(str).width;
    if (o.maxW && w > o.maxW) { size = Math.max(o.min || size * 0.7, (size * o.maxW) / w); g.font = `800 ${size}px ${SERIF}`; w = g.measureText(str).width; }
    g.textAlign = o.align || "left"; g.textBaseline = o.base || "middle";
    if (o.q !== undefined && o.q < 1) g.globalAlpha *= clamp(o.q);
    g.lineJoin = "round";
    if (o.outline) { g.lineWidth = size * (o.ow || 0.17); g.strokeStyle = o.outline; g.strokeText(str, x, y); }
    if (o.shadow) { g.fillStyle = o.shadow; g.fillText(str, x + size * 0.045, y + size * 0.06); }
    g.fillStyle = o.color;
    g.fillText(str, x, y);
    if (o.lit) { g.globalCompositeOperation = "lighter"; g.fillStyle = "rgba(255,240,200,0.16)"; g.fillText(str, x - size * 0.02, y - size * 0.03); }
    g.restore();
    return w;
  }
  const num = (v, k, d) => window.DreamcutMotion.formatNumber(v * k, Math.abs((Number(v) || 0) % 1) > 0.001 ? 1 : 0, (d && d.prefix) || "", (d && d.suffix) || "");
  const measure = (g, str, size) => { g.save(); g.font = `800 ${size}px ${SERIF}`; const w = g.measureText(String(str)).width; g.restore(); return w; };

  // Inner lit and shadowed edges for a clipped shape: the current clip is the outline.
  function edgeRelief(g, trace, u, wd = 7) {
    g.save();
    g.lineJoin = "round";
    g.lineWidth = wd * u;
    g.strokeStyle = "rgba(20,10,40,0.34)"; g.save(); g.translate(-2.5 * u, -3.2 * u); trace(); g.stroke(); g.restore();
    g.strokeStyle = "rgba(255,246,222,0.45)"; g.save(); g.translate(2.2 * u, 3 * u); trace(); g.stroke(); g.restore();
    g.restore();
  }
  // A palette-knife slab: wide flat strokes laid left to right, with a drop shadow and a moving sheen.
  function slab(g, T, x, y, w, h, q, o = {}) {
    if (q <= 0 || w < 4 || h < 4) return;
    const tone = cur.S.look.tone, u = cur.S.u;
    const r = Math.min(h * 0.32, 34 * u);
    g.save();
    g.translate(x, y);
    if (o.rot) g.rotate(o.rot);
    g.globalAlpha *= clamp(q * 4);
    const cols = o.cols || tone.slab;
    const reach = w * clamp(q * 1.12);
    g.beginPath(); g.roundRect(8 * u, 14 * u, reach, h, r); g.fillStyle = "rgba(8,5,26,0.5)"; g.fill();
    g.save();
    g.beginPath(); g.roundRect(0, 0, w, h, r); g.clip();
    g.fillStyle = rgb(mix(cols[0], DEEP, 0.12)); g.fillRect(0, 0, reach, h);
    const shape = { w, h, inside: () => true, ang: (px, py) => (vnoise(px * 0.01, py * 0.03) - 0.5) * 0.16, order: (px) => px / w };
    const wid = clamp(h * 0.3, 13 * u, 26 * u);
    paintShape(g, `slab|${w | 0}|${h | 0}|${wid | 0}`, shape, { len: Math.min(w * 0.6, 100 * u), wid, step: Math.min(w * 0.3, 44 * u) }, (s) => pick(cols, s, o.spread ?? 0.1), q);
    if (q > 0.7) {
      const sx = ((T * 0.22 + (x / 1920)) % 1.8 - 0.4) * w;
      const gr = g.createLinearGradient(sx - 90 * u, 0, sx + 90 * u, h);
      gr.addColorStop(0, "rgba(255,248,220,0)"); gr.addColorStop(0.5, "rgba(255,248,220,0.2)"); gr.addColorStop(1, "rgba(255,248,220,0)");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }
    edgeRelief(g, () => { g.beginPath(); g.roundRect(0, 0, w, h, r); }, u, 6);
    g.restore();
    g.restore();
  }
  // Text carried by a slab; it is drawn with the slab so a slab is never shown blank.
  function tag(g, T, str, x, y, size, maxW, q, o = {}) {
    const u = cur.S.u, tone = cur.S.look.tone;
    const fs = Math.max(size, 42 * u) * 1.4;
    const w = Math.min(maxW, measure(g, str, fs) + 70 * u), h = fs * 1.55;
    const left = o.align === "right" ? x - w : o.align === "center" ? x - w / 2 : x;
    slab(g, T, left, y - h / 2, w, h, q, o);
    say(g, str, left + w / 2, y + fs * 0.04, fs, { align: "center", color: o.color || rgb(tone.slabInk), outline: "rgba(255,248,226,0.97)", ow: 0.16, maxW: w - 52 * u, min: 54 * u, q: clamp((q - 0.45) * 2.4) });
    return { x: left, y: y - h / 2, w, h };
  }
  const bigNum = (g, str, x, y, size, color, q = 1, align = "center", maxW) =>
    say(g, str, x, y, size, { align, color, outline: rgb(cur.S.look.tone.outline), shadow: "rgba(8,5,26,0.5)", lit: true, q, maxW, min: 96 * cur.S.u });

  // ---- the world -----------------------------------------------------------------------------------------
  // Each section is painted at its own hour: the sky is tinted, the sun (or the moon) sits somewhere new and
  // the view slowly pushes in. At the very start and end of a piece the world settles on one shared view.
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  const VARS = {
    title: { sx: 0.78, sh: 0.38, tint: [255, 140, 90], tk: 0.0, night: 0, drift: -1, push: 0.04 },
    chart: { sx: 0.24, sh: 0.78, tint: [118, 176, 238], tk: 0.48, night: 0, drift: 1, push: 0.035 },
    object: { sx: 0.6, sh: 0.98, tint: [255, 196, 112], tk: 0.4, night: 0, drift: -1, push: 0.03 },
    people: { sx: 0.36, sh: 1.04, tint: [92, 196, 214], tk: 0.46, night: 0, drift: 1, push: 0.04 },
    process: { sx: 0.86, sh: 0.3, tint: [214, 62, 132], tk: 0.36, night: 0, drift: -1, push: 0.04 },
    compare: { sx: 0.5, sh: 0.2, tint: [255, 112, 44], tk: 0.38, night: 0, drift: 1, push: 0.03 },
    closing: { sx: 0.7, sh: 0.86, tint: [40, 50, 140], tk: 0.42, night: 1, drift: -1, push: 0.035 },
  };
  const ANCHOR = { sx: 0.76, sh: 0.34, tint: [255, 140, 90], tk: 0, night: 0, drift: 0, push: 0 };
  const NIGHT = [12, 16, 56], MOON = [226, 234, 255];
  const lerpV = (a, b, k) => ({ sx: lerp(a.sx, b.sx, k), sh: lerp(a.sh, b.sh, k), tint: mix(a.tint, b.tint, k), tk: lerp(a.tk, b.tk, k), night: lerp(a.night, b.night, k), drift: lerp(a.drift, b.drift, k), push: lerp(a.push, b.push, k) });
  function shownIds() {
    const c = typeof window !== "undefined" && window.__dreamcut && window.__dreamcut.controls;
    return c ? ORDER.filter((id) => Number(c[id + "_hold"]) > 0) : null;
  }
  // The scene at a neighbouring index, when the piece's controls can tell us.
  function sceneAt(info, idx) {
    if (idx === info.index) return info.scene;
    if (idx === info.index + 1) return info.next;
    const ids = shownIds();
    return ids && ids[info.index] === info.scene ? ids[idx] || null : null;
  }
  function variantFor(scene, info) {
    const v = VARS[scene] || ANCHOR;
    const aw = Math.max(1 - smooth(0, 0.9, info.t), smooth(info.length - 0.9, info.length, info.t));
    return lerpV(v, ANCHOR, aw);
  }
  function tintOf(V, T) {
    if (!T.mono) return V.tint;
    const l = V.tint[0] * 0.3 + V.tint[1] * 0.55 + V.tint[2] * 0.15;
    return [l, l, l];
  }

  let grid = null;
  // One persistent field of strokes: finer in the far sky and near the horizon, chunkier in the near sea.
  function makeGrid(W, H, u, hor) {
    const cell = 24 * u, r = rng(2718), list = [], pad = 230 * u;
    const depth = (y) => (y < hor ? lerp(0.92, 0.6, Math.pow(clamp(y / hor), 1.4)) : lerp(0.6, 1.7, Math.pow(clamp((y - hor) / (H - hor)), 0.9)));
    let y = -cell;
    while (y < H + cell * 1.5) {
      const d = depth(y), c = cell * d;
      for (let x = -pad; x < W + pad; x += c * 1.02) {
        const big = r();
        list.push({ x: x + (r() - 0.3) * c, y: y + (r() - 0.5) * c * 0.8, d, j: r(), k: r(), l: (1.0 + big * big * 2.4 + r() * 0.5) * c, w: (0.55 + r() * 0.4 + big * 0.32) * c * 0.92, ph: r() * TAU, z: r() * 0.7 + big * 0.3 });
      }
      y += c * 0.74;
    }
    list.sort((a, b) => a.z - b.z);
    return { key: `${W}x${H}x${hor | 0}`, list, cell, pad };
  }
  function geom(S, V, k) {
    const { W, H } = S;
    const hor = H * (S.tall ? 0.57 : 0.6);
    const sunR = H * 0.078 * (1 - V.night * 0.15);
    const sx = S.tall ? lerp(0.24, 0.78, clamp((V.sx - 0.2) / 0.66)) : V.sx;
    const sunX = W * sx;
    const sunY = hor + sunR * 0.3 - V.sh * H * 0.3 - H * 0.035 * k;
    const side = (S.tall ? 90 : 140) * S.u;
    const box = S.tall ? { x: side, y: H * 0.3, w: W - side * 2, h: H * 0.6 } : { x: side, y: H * 0.34, w: W - side * 2, h: H * 0.58 };
    return { W, H, hor, sunX, sunY, sunR, box, lx: W * (S.tall ? 0.9 : 0.925), ly: hor + H * 0.075, V };
  }
  const calmAt = (x, y, calm, G, u) => {
    if (calm <= 0) return 0;
    const b = G.box, dx = Math.max(b.x - 40 * u - x, 0, x - (b.x + b.w + 40 * u)), dy = Math.max(b.y - 34 * u - y, 0, y - (b.y + b.h + 34 * u));
    return calm * (1 - smooth(0, 110 * u, Math.hypot(dx, dy)));
  };
  const sunCol = (T, V, v) => mix(ramp(T.sunS, v), MOON, V.night * 0.8);
  function worldRGB(x, y, t, G, T, calm) {
    const { hor, sunX, sunY, sunR, W, H, V } = G;
    let c;
    if (y < hor) {
      const v = y / hor;
      c = ramp(T.skyS, v + (vnoise(x * 0.004 + t * 0.012, y * 0.012) - 0.5) * 0.12);
      const cl = smooth(0.52, 0.8, fbm(x * 0.0027 - t * 0.03, y * 0.011 + 3));
      c = mix(c, T.cloud, cl * 0.45 * (0.25 + v) * (1 - V.night * 0.6));
      c = mix(c, G.tint, V.tk * (1 - v * 0.45));
      if (V.night) c = mix(c, NIGHT, V.night * 0.62 * (1 - v * 0.35));
      const dx = x - sunX, dy = y - sunY, d = Math.hypot(dx, dy);
      const glow = Math.exp(-Math.pow(d / (sunR * 3.4), 2));
      const rings = 0.5 + 0.5 * Math.sin(d / (sunR * 0.3) - t * 0.9);
      c = mix(c, sunCol(T, V, rings * 0.7 + 0.15), glow * (0.78 - V.night * 0.3));
      if (d < sunR * 1.02) c = sunCol(T, V, 0.55 + rings * 0.45);
      // The lighthouse beam: a pale wedge swinging from the lamp.
      const ba = Math.atan2(y - G.ly, x - G.lx), bd = Math.hypot(x - G.lx, y - G.ly);
      const sw = -(Math.PI - 0.5) - 0.42 * Math.sin(t * 0.6);
      const wedge = Math.exp(-Math.pow((ba - sw) / 0.11, 2)) * smooth(0, 120, bd) * (1 - smooth(W * 0.35, W * 0.8, bd));
      c = mix(c, T.beam, wedge * 0.5 * (1 - V.night * 0.35));
      c = mix(c, T.haze, smooth(0.8, 1, v) * 0.3 * (1 - V.night * 0.5));
    } else {
      const v = (y - hor) / (H - hor);
      c = ramp(T.seaS, v + (vnoise(x * 0.006, y * 0.01) - 0.5) * 0.12);
      const wv = Math.sin(x * 0.012 + v * 9 - t * 0.8 + vnoise(x * 0.004, y * 0.01) * 3);
      c = mix(c, T.foam, smooth(0.7, 0.96, wv) * 0.5 * (1 - v * 0.55));
      c = mix(c, G.tint, V.tk * 0.5);
      if (V.night) c = mix(c, NIGHT, V.night * 0.5);
      const vis = smooth(hor - sunR * 0.2, hor - sunR * 2, sunY) * 0.5 + smooth(hor + sunR, hor - sunR * 0.4, sunY) * 0.5;
      const ref = Math.exp(-Math.pow((x - sunX) / (sunR * (1.2 + v * 2.6)), 2)) * (0.45 + 0.55 * Math.sin(y * 0.075 - t * 1.6 + x * 0.03)) * (1 - v * 0.5) * vis;
      c = mix(c, sunCol(T, V, 0.45 + ref * 0.5), clamp(ref) * 0.85);
      const fy = H * 0.935 - H * 0.026 * Math.sin(x * 0.0042 + 1.2) - H * 0.012 * Math.sin(x * 0.011);
      if (y > fy) c = mix(mix(ramp(T.hillS, fbm(x * 0.006, y * 0.02)), NIGHT, V.night * 0.4), c, 0.06);
    }
    // Behind a diagram the paint is glazed over: darker, smoother and closer to one colour.
    if (calm > 0) c = mix(c, mix([c[0] * 0.55, c[1] * 0.5, c[2] * 0.62], T.glaze, 0.5), calm * 0.62);
    return c;
  }
  function worldAng(x, y, t, G) {
    const { hor, sunX, sunY, sunR } = G;
    if (y >= hor) {
      // Strokes run along the wave crests (the lines of constant phase of the swell in worldRGB).
      const k1 = 0.012, k2 = 9 / Math.max(1, G.H - hor), ph = x * k1 + (y - hor) * k2 - t * 0.8;
      return Math.atan2(-k1, k2) + Math.sin(ph) * 0.2 + (vnoise(x * 0.004, y * 0.006) - 0.5) * 0.35;
    }
    const b = (vnoise(x * 0.0017 - t * 0.015, y * 0.0021) - 0.5) * 2.2 + Math.sin(y * 0.01 + t * 0.2) * 0.1;
    let vx = Math.cos(b), vy = Math.sin(b);
    const dx = x - sunX, dy = y - sunY, d = Math.hypot(dx, dy) + 1e-6;
    const w = Math.exp(-Math.pow(d / (sunR * 4.4), 2)) * 3.4, a = Math.atan2(dy, dx) + Math.sin(t * 0.35 + d * 0.01) * 0.1;
    vx += Math.cos(a) * w; vy += Math.sin(a) * w;
    const ex = G.W * (G.sunX > G.W * 0.5 ? 0.27 : 0.72), ey = G.H * 0.22, d2 = Math.hypot(x - ex, y - ey) + 1e-6, w2 = Math.exp(-Math.pow(d2 / (G.H * 0.17), 2)) * 1.6;
    const a2 = Math.atan2(y - ey, x - ex) - Math.PI / 2 + Math.sin(t * 0.3) * 0.12;
    vx += Math.cos(a2) * w2; vy += Math.sin(a2) * w2;
    return Math.atan2(vy, vx);
  }

  // Ridged paint polygons for the small things in the world: sails, hulls, the lighthouse.
  function poly(g, pts, c, wid, T, wob) {
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (const [x, y] of pts) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
    const inside = (x, y) => { let c2 = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c2 = !c2; } return c2; };
    let k = 0;
    for (let y = miny + wid * 0.4; y < maxy; y += wid * 0.7) {
      for (let x = minx + wid * 0.5; x < maxx; x += wid * 1.3) {
        k++;
        const px = x + (hash(k, 1) - 0.5) * wid * 0.5, py = y + (hash(k, 2) - 0.5) * wid * 0.3;
        if (inside(px, py)) dab(g, px, py, (hash(k, 4) - 0.5) * 0.3 + (wob || 0), wid * 1.5, wid, mix(c, hash(k, 6) > 0.5 ? CREAM : DEEP, hash(k, 7) * 0.16), 1, 1, k * 1.37);
      }
    }
  }
  function boat(g, x, y, s, t, ph, tone) {
    const bob = Math.sin(t * 1.6 + ph) * 0.05;
    g.save(); g.translate(x, y + Math.sin(t * 1.3 + ph) * 3 * s); g.rotate(bob);
    poly(g, [[-26 * s, 0], [26 * s, 0], [18 * s, 12 * s], [-18 * s, 12 * s]], tone.hull, 5.5 * s, t);
    poly(g, [[0, -4 * s], [0, -62 * s], [26 * s, -6 * s]], tone.sail, 5.5 * s, t, 0.5);
    poly(g, [[-3 * s, -4 * s], [-3 * s, -46 * s], [-22 * s, -6 * s]], mix(tone.sail, tone.hull, 0.3), 5 * s, t, -0.5);
    g.restore();
  }
  function lighthouse(g, G, u, t, tone) {
    const x = G.lx, y = G.ly + G.H * 0.045, s = u * 0.95;
    for (let i = 0; i < 16; i++) dab(g, x + (hash(i, 1) - 0.5) * 150 * s, y + 3 * s + hash(i, 2) * 14 * s, (hash(i, 3) - 0.5) * 0.3, 44 * s, 15 * s, mix(tone.rock, DEEP, hash(i, 4) * 0.4), 1, 1, i * 3.1);
    poly(g, [[x - 15 * s, y], [x + 15 * s, y], [x + 9 * s, y - 118 * s], [x - 9 * s, y - 118 * s]], CREAM, 7 * s, t);
    for (const [a, b] of [[0.18, 0.34], [0.52, 0.68]]) poly(g, [[x - lerp(15, 9, a) * s, y - 118 * a * s], [x + lerp(15, 9, a) * s, y - 118 * a * s], [x + lerp(15, 9, b) * s, y - 118 * b * s], [x - lerp(15, 9, b) * s, y - 118 * b * s]], tone.stripe, 7 * s, t);
    poly(g, [[x - 14 * s, y - 118 * s], [x + 14 * s, y - 118 * s], [x + 14 * s, y - 132 * s], [x - 14 * s, y - 132 * s]], DEEP, 6 * s, t);
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);
    dab(g, x, y - 144 * s, 0, 22 * s, 20 * s, mix(tone.beam, CREAM, 0.4 + pulse * 0.5), 1, 1, 7.7);
    for (let i = 0; i < 6; i++) dab(g, x, y - 144 * s, (i / 6) * TAU + t * 0.8, 40 * s * (0.7 + pulse * 0.5), 5 * s, tone.beam, 1, 0.55, 40 + i);
  }
  function gull(g, x, y, s, flap, c, sd) {
    const w = Math.sin(flap) * 0.55;
    dab(g, x - 16 * s, y + w * 6 * s, -0.5 + w, 34 * s, 7 * s, c, 1, 1, sd);
    dab(g, x + 16 * s, y + w * 6 * s, 0.5 - w, 34 * s, 7 * s, c, 1, 1, sd + 0.5);
  }
  const wrapX = (x, W, pad) => { const per = W + pad * 2; return (((x + pad) % per) + per) % per - pad; };

  // A smooth underpainting so no bare ground shows between strokes: the world sampled on a coarse grid and
  // stretched over the frame (with smoothing), then laid under the strokes.
  let up = null;
  function underpaint(ctx, S, G, t, T, calm) {
    const { W, H, u } = S, step = 16 * u, pad = 60 * u;
    const gw = Math.ceil((W + pad * 2) / step) + 1, gh = Math.ceil((H + pad * 2) / step) + 1;
    if (!up || up.w !== gw || up.h !== gh) {
      const cv = document.createElement("canvas"); cv.width = gw; cv.height = gh;
      const g2 = cv.getContext("2d");
      up = { cv, g: g2, w: gw, h: gh, img: g2.createImageData(gw, gh) };
    }
    const d = up.img.data;
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const x = -pad + i * step, y = -pad + j * step, c = worldRGB(x, y, t, G, T, calmAt(x, y, calm, G, u)), o = (j * gw + i) * 4;
      const sh = 0.9 + 0.1 * vnoise(x * 0.02, y * 0.02);
      d[o] = c[0] * sh; d[o + 1] = c[1] * sh; d[o + 2] = c[2] * sh; d[o + 3] = 255;
    }
    up.g.putImageData(up.img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(up.cv, -pad - step / 2, -pad - step / 2, gw * step, gh * step);
  }

  // The whole painted world for one section: underpainting, the moving stroke field, sun or moon, the
  // lighthouse, boats, gulls and reeds, all under a slow camera push.
  function drawWorld(ctx, S, info, V, k, calm, rays) {
    const T = S.look.tone, { W, H, u } = S, t = info.t, R0 = cur.R0;
    const G = geom(S, V, k);
    G.tint = tintOf(V, T);
    if (!grid || grid.key !== `${W}x${H}x${G.hor | 0}`) grid = makeGrid(W, H, u, G.hor);
    ctx.save();
    const zs = 1 + V.push * smooth(0, 1, k), tx = V.drift * 30 * u * k;
    ctx.translate(W / 2 + tx, G.hor); ctx.scale(zs, zs); ctx.translate(-W / 2, -G.hor);
    underpaint(ctx, S, G, t, T, calm);
    for (const m of grid.list) {
      const sea = m.y > G.hor;
      let x = wrapX(m.x + (sea ? -12 : 5) * u * m.d * t, W, grid.pad);
      const a = worldAng(x, m.y, t, G) + (m.j - 0.5) * 0.5;
      const sway = Math.sin(t * 0.7 + m.ph) * 2.4 * u * m.d;
      x += Math.cos(a) * sway;
      const y = m.y + Math.sin(a) * sway;
      if (x < -m.l || x > W + m.l) continue;
      const kc = calmAt(x, y, calm, G, u);
      const c = worldRGB(x, y, t, G, T, kc);
      cur.relief = R0 * (1 - 0.55 * kc);
      dab(ctx, x, y, a, m.l * (sea ? 1.25 : 1), m.w, mix(c, m.k > 0.5 ? CREAM : DEEP, Math.abs(m.k - 0.5) * 0.24 * (1 - 0.5 * kc)), 1, 1 - 0.4 * kc, m.j * 977 + m.k * 13);
    }
    cur.relief = R0;
    // The sun (or the moon): rings of short strokes that turn against each other, clipped by the horizon.
    if (G.sunY < G.hor + G.sunR) {
      ctx.save();
      ctx.beginPath(); ctx.rect(-W, -H, W * 3, G.hor + H + 2 * u); ctx.clip();
      const beat = Math.pow(Math.max(0, Math.sin(t * 2.2)), 6), sr = G.sunR * (1 + 0.05 * beat);
      let ring = 0;
      for (let rr = sr * 0.12; rr <= sr * 1.02; rr += sr * 0.17, ring++) {
        const len = 22 * u, cnt = Math.max(5, Math.round((TAU * rr) / (len * 0.85))), dir = ring % 2 ? 1 : -1;
        for (let q = 0; q < cnt; q++) {
          const an = (q / cnt) * TAU + dir * t * (0.3 - ring * 0.025) + ring;
          dab(ctx, G.sunX + Math.cos(an) * rr, G.sunY + Math.sin(an) * rr, an + Math.PI / 2, len, 14 * u, mix(sunCol(T, V, 0.35 + 0.65 * hash(ring * 7 + q, 3)), CREAM, 0.1 + 0.25 * (1 - rr / sr) * hash(q, 8) + beat * 0.15), 1, 1, ring * 61 + q);
        }
      }
      ctx.restore();
    }
    // Stars come out at dawn and at night.
    const starW = 0.3 + V.night * 0.7;
    for (let i = 0; i < 52; i++) {
      const sx0 = hash(i, 21) * W, sy0 = hash(i, 22) * G.hor * 0.55, tw = 0.5 + 0.5 * Math.sin(t * (1.4 + hash(i, 3)) + i * 2.3);
      if (hash(i, 23) > 0.25) dab(ctx, sx0, sy0, i, (9 + 8 * hash(i, 4)) * u, 6 * u, mix(sunCol(T, V, 0.8), CREAM, 0.6), 1, tw * 0.85 * starW, 300 + i);
    }
    // Title and closing: the sun throws long rays that breathe, with a flare on each beat.
    if (rays > 0) {
      const beat = Math.pow(Math.max(0, Math.sin(t * 2.2)), 6);
      ctx.save(); ctx.beginPath(); ctx.rect(-W, -H, W * 3, G.hor + H + 6 * u); ctx.clip();
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU + t * 0.06, r0 = G.sunR * (1.28 + 0.1 * Math.sin(t * 1.2 + i)), len = G.sunR * (0.7 + 0.8 * hash(i, 2)) * (0.9 + 0.12 * Math.sin(t * 1.1 + i * 1.7) + 0.3 * beat);
        dab(ctx, G.sunX + Math.cos(a) * (r0 + len / 2), G.sunY + Math.sin(a) * (r0 + len / 2), a, len, 22 * u, mix(sunCol(T, V, 0.35 + hash(i, 5) * 0.6), CREAM, 0.1 + beat * 0.2), 1, 0.9 * rays * (1 - V.night * 0.45), 500 + i);
      }
      for (let i = 0; i < 24; i++) {
        const a = ((i + 0.5) / 24) * TAU + t * 0.06, r0 = G.sunR * 1.2, len = G.sunR * 0.42;
        dab(ctx, G.sunX + Math.cos(a) * (r0 + len / 2), G.sunY + Math.sin(a) * (r0 + len / 2), a, len, 16 * u, mix(sunCol(T, V, 0.1 + hash(i, 9) * 0.4), CREAM, 0.05), 1, 0.85 * rays * (1 - V.night * 0.45), 600 + i);
      }
      ctx.restore();
    }
    lighthouse(ctx, G, u, t, T);
    // Boats drift along the horizon at their own pace.
    const bp = 160 * u;
    boat(ctx, wrapX(W * 0.32 + t * 16 * u, W, bp), G.hor + H * 0.045, u * 0.9, t, 0.5, T);
    boat(ctx, wrapX(W * (S.tall ? 0.8 : 0.58) - t * 11 * u, W, bp), G.hor + H * 0.07, u * 1.15, t, 2.1, T);
    boat(ctx, wrapX(W * (S.tall ? 0.45 : 0.44) + t * 9 * u, W, bp), G.hor + H * 0.035, u * 0.7, t, 4.2, T);
    for (let i = 0; i < 5; i++) {
      const sp = 0.026 + i * 0.006, gx = ((t * sp + i * 0.23) % 1.25 - 0.12) * W;
      const gy = H * (0.2 + 0.07 * i % 0.28) + Math.sin(t * 0.9 + i * 1.7) * 26 * u + (S.tall ? H * 0.04 : 0);
      gull(ctx, gx, gy, u * (0.8 + (i % 3) * 0.22), t * 5.5 + i * 1.3, T.gull, 700 + i);
    }
    // Reeds along the foreground sway in the wind.
    const nR = Math.round((W + 120 * u) / (12 * u));
    for (let i = 0; i < nR; i++) {
      const x = -60 * u + (i + 0.5) * ((W + 120 * u) / nR) + (hash(i, 3) - 0.5) * 16 * u, h = (46 + hash(i, 4) * 70) * u;
      const base = H * 0.965 - H * 0.02 * Math.sin(x * 0.004 + 1.2) + hash(i, 5) * 14 * u;
      const sw = Math.sin(t * 1.3 + x * 0.013 + hash(i, 6) * 2) * 0.2;
      const c = mix(mix(T.reed, hash(i, 8) > 0.6 ? T.reedHi : DEEP, hash(i, 9) * 0.4), NIGHT, V.night * 0.35);
      dab(ctx, x + Math.sin(sw) * h * 0.5, base - h * 0.5, -Math.PI / 2 + sw, h, 11 * u, c, 1, 1, 900 + i);
    }
    ctx.restore();
    return G;
  }

  // ---- the scene change: one loaded brush dragged across the frame -------------------------------------------
  // The head is a ragged ridge of thick yellow paint; behind it the stroke thins into broken dry-brush streaks
  // over the next section, which it has just revealed. Ahead of the head the old section is still showing.
  const brushW = (W) => W * 0.13;
  // The first half of the drag keeps pace with the old headline's exit (which clears left to right with an
  // accelerating ease); the second half carries the brush off the right edge with its tail.
  function brushFront(W, H, s) {
    const B = brushW(W), X = s < 0.5 ? lerp(-B * 0.5, W * 1.05, Math.pow(s * 2, 1.5)) : lerp(W * 1.05, W + B * 2.8, ease((s - 0.5) * 2));
    return (y) => X - (y - H / 2) * 0.2;
  }
  function brushDrag(g, S, s) {
    const { W, H, u } = S, T = S.look.tone, front = brushFront(W, H, s), B = brushW(W);
    const rowH = 7.5 * u, n = Math.ceil(H / rowH) + 2, R = cur.R0;
    const yel = (v) => mix(ramp(T.sunS, v), CREAM, 0.08);
    g.save();
    g.lineCap = "round";
    const rows = [];
    for (let k = 0; k < n; k++) {
      const y = (k - 1) * rowH + (hash(k, 1) - 0.5) * rowH * 0.5;
      const prof = 0.45 + 0.55 * Math.sin(Math.PI * clamp(y / H));
      const head = front(y) + (hash(k, 2) - 0.5) * 30 * u + Math.sin(k * 0.61) * 12 * u + Math.sin(k * 0.23 + 1) * 16 * u;
      const L = B * (0.9 + 1.7 * hash(k, 3)) * prof;
      rows.push({ k, y, head, L, c: yel(0.2 + 0.75 * hash(k, 4)), lw: rowH * (1.5 + hash(k, 5) * 0.6) });
    }
    // cast shadow of the ridge falling ahead onto the old section
    for (const r of rows) { g.strokeStyle = rgb(DEEP, 0.32 * R); g.lineWidth = r.lw * 1.2; g.beginPath(); g.moveTo(r.head, r.y + 4 * u); g.lineTo(r.head + 16 * u, r.y + 6 * u); g.stroke(); }
    for (const r of rows) {
      const loaded = r.L * (0.32 + 0.16 * hash(r.k, 6));
      // the dry tail: broken dashes that get sparser and fainter toward the start of the drag
      let x = r.head - r.L, q = 0;
      while (x < r.head - loaded && q < 14) {
        const f = clamp((x - (r.head - r.L)) / Math.max(1, r.L - loaded));
        const len = r.L * (0.05 + 0.12 * hash(r.k * 13 + q, 7)) * (0.5 + f);
        const gap = r.L * 0.07 * (1 - f) * hash(r.k * 7 + q, 8);
        const x2 = Math.min(r.head - loaded + 2, x + len);
        g.strokeStyle = rgb(mix(r.c, DEEP, 0.08), 0.25 + 0.6 * f); g.lineWidth = r.lw * (0.45 + 0.55 * f);
        g.beginPath(); g.moveTo(x, r.y); g.lineTo(x2, r.y); g.stroke();
        x = x2 + gap; q++;
      }
      // the loaded body
      g.strokeStyle = rgb(r.c); g.lineWidth = r.lw;
      g.beginPath(); g.moveTo(r.head - loaded, r.y); g.lineTo(r.head, r.y); g.stroke();
      // wet-on-wet: a streak of a second tone mixed into some rows
      if (hash(r.k, 9) > 0.62) { g.strokeStyle = rgb(mix(r.c, hash(r.k, 10) > 0.5 ? hexRGB(S.accent) : CREAM, 0.35)); g.lineWidth = r.lw * 0.55; g.beginPath(); g.moveTo(r.head - loaded * (0.4 + 0.5 * hash(r.k, 11)), r.y + r.lw * 0.1); g.lineTo(r.head - loaded * 0.05, r.y + r.lw * 0.1); g.stroke(); }
    }
    // bristle grooves and the odd ridge catching the light
    for (const r of rows) {
      const loaded = r.L * (0.32 + 0.16 * hash(r.k, 6));
      g.strokeStyle = rgb(mix(r.c, DEEP, 0.3 * R + 0.06)); g.lineWidth = Math.max(1, r.lw * 0.16);
      const g0 = r.head - loaded * (0.5 + 0.8 * hash(r.k, 12));
      g.beginPath(); g.moveTo(g0, r.y + r.lw * 0.42); g.lineTo(r.head - 6 * u, r.y + r.lw * 0.42); g.stroke();
      if (hash(r.k, 13) > 0.55) {
        g.strokeStyle = rgb(mix(r.c, CREAM, 0.3 + 0.35 * hash(r.k, 14) * R)); g.lineWidth = Math.max(1, r.lw * 0.2);
        g.beginPath(); g.moveTo(r.head - loaded * (0.3 + 0.6 * hash(r.k, 15)), r.y - r.lw * 0.3); g.lineTo(r.head - loaded * 0.08, r.y - r.lw * 0.3); g.stroke();
      }
    }
    // the ragged head: paint pushed up into a ridge, lit on top and shadowed on its leading face
    for (const r of rows) {
      const rr = r.lw * (0.75 + 0.5 * hash(r.k, 16));
      g.fillStyle = rgb(mix(r.c, DEEP, 0.28 * R + 0.05)); g.beginPath(); g.ellipse(r.head + rr * 0.35, r.y + rr * 0.15, rr * 1.15, rr * 0.72, 0, 0, TAU); g.fill();
      g.fillStyle = rgb(mix(r.c, CREAM, 0.12)); g.beginPath(); g.ellipse(r.head, r.y, rr * 1.1, rr * 0.66, 0, 0, TAU); g.fill();
      if (hash(r.k, 17) > 0.4) { g.fillStyle = rgb(mix(r.c, CREAM, 0.5 * R + 0.1)); g.beginPath(); g.ellipse(r.head - rr * 0.35, r.y - rr * 0.28, rr * 0.5, rr * 0.2, -0.2, 0, TAU); g.fill(); }
    }
    g.restore();
  }
  function clipSide(g, S, s, behind) {
    const { W, H } = S, front = brushFront(W, H, s), e = W * 0.4;
    g.beginPath();
    if (behind) { g.moveTo(-e, 0); g.lineTo(front(0) + 6, 0); g.lineTo(front(H) + 6, H); g.lineTo(-e, H); }
    else { g.moveTo(front(0) - 6, 0); g.lineTo(W * 3, 0); g.lineTo(W * 3, H); g.lineTo(front(H) - 6, H); }
    g.closePath();
    g.clip();
  }

  const calmFor = (scene) => (DRAWN.includes(scene) ? 1 : 0);
  function stage(ctx, S, info) {
    cur.S = S; cur.info = info; cur.T = info.t;
    cur.R0 = cur.relief = 0.2 + 0.8 * S.look.texture;
    let s = null, phase = null;
    if (info.next && info.local >= info.hold - info.change) { s = (info.local - (info.hold - info.change)) / (2 * info.change); phase = "out"; }
    else if (info.index > 0 && info.local < info.change) { s = 0.5 + info.local / (2 * info.change); phase = "in"; }
    cur.s = s === null ? null : clamp(s); cur.phase = phase;
    const k = clamp(info.local / Math.max(0.01, info.hold));
    const V = variantFor(info.scene, info);
    cur.G = geom(S, V, k);
    if (!S.paint) return;
    const { W, H } = S, T = S.look.tone;
    ctx.save();
    ctx.fillStyle = rgb(T.base); ctx.fillRect(0, 0, W, H);
    const calmCur = calmFor(info.scene) * lerp(0.6, 1, smooth(0, 0.6, info.local));
    const raysCur = DRAWN.includes(info.scene) ? 0 : info.scene === "closing" ? 1 : 0.85;
    if (s === null) drawWorld(ctx, S, info, V, k, calmCur, raysCur);
    else {
      const other = sceneAt(info, phase === "out" ? info.index + 1 : info.index - 1);
      const Vo = variantFor(other || info.scene, info);
      const calmO = other ? calmFor(other) : calmCur, raysO = other ? (DRAWN.includes(other) ? 0 : other === "closing" ? 1 : 0.85) : raysCur;
      const fresh = phase === "out" ? [Vo, 0, calmO * 0.6, raysO] : [V, k, calmCur, raysCur];
      const old = phase === "out" ? [V, k, calmCur, raysCur] : [Vo, 1, calmO, raysO];
      ctx.save(); clipSide(ctx, S, cur.s, true); drawWorld(ctx, S, info, ...fresh); ctx.restore();
      ctx.save(); clipSide(ctx, S, cur.s, false); drawWorld(ctx, S, info, ...old); ctx.restore();
    }
    ctx.restore();
  }

  // ---- headlines: a painted ground laid under the words as they wipe in, with a brush leading the wipe ------
  const lineCache = new Map();
  function headLines(id, S) {
    const key = `${id}|${S.W}x${S.H}`;
    if (lineCache.has(key)) return lineCache.get(key);
    if (typeof document === "undefined") return [];
    const el = document.getElementById(id), root = document.getElementById("root");
    if (!el || !root || !el.textContent) return [];
    const er = el.getBoundingClientRect(), scale = root.getBoundingClientRect().width / S.W || 1;
    let ox = 0, oy = 0, nd = el;
    while (nd && nd !== root) { ox += nd.offsetLeft; oy += nd.offsetTop; nd = nd.offsetParent; }
    const range = document.createRange(); range.selectNodeContents(el);
    const by = new Map();
    for (const r of range.getClientRects()) {
      if (r.width < 2) continue;
      const ky = Math.round((r.top + r.height / 2) / (r.height * 0.5 || 1));
      const l = by.get(ky) || { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
      l.x0 = Math.min(l.x0, r.left); l.x1 = Math.max(l.x1, r.right); l.y0 = Math.min(l.y0, r.top); l.y1 = Math.max(l.y1, r.bottom);
      by.set(ky, l);
    }
    const lines = [...by.values()].sort((a, b) => a.y0 - b.y0).map((l) => ({ x: ox + (l.x0 - er.left) / scale, y: oy + (l.y0 - er.top) / scale, w: (l.x1 - l.x0) / scale, h: (l.y1 - l.y0) / scale }));
    if (lines.length) lineCache.set(key, lines);
    return lines;
  }
  function headPlate(g, S, id, local, statement) {
    const lines = headLines(id, S);
    if (!lines.length) return;
    const u = S.u, T = S.look.tone, t = cur.T, n = lines.length;
    const pr = 1 - Math.pow(1 - clamp(local / 0.75), 4);
    const ground = mix(T.glaze, DEEP, 0.3), acc = hexRGB(S.accent);
    lines.forEach((l, li) => {
      const q = clamp(pr * n - li);
      if (q <= 0) return;
      const x0 = l.x - 30 * u, x1 = l.x + l.w + 36 * u, yc = l.y + l.h * 0.55, hh = l.h * 0.84;
      g.save(); g.globalAlpha *= 0.8;
      for (let r = 0; r < 3; r++) {
        const yy = yc + (r - 1) * hh * 0.3, j = (hash(li * 3 + r, 2) - 0.5) * 18 * u;
        ridgeLine(g, [[x0 + j, yy], [lerp(x0, x1, 0.5), yy + (r - 1) * 3 * u], [x1 - j, yy + 2 * u]], hh * 0.42, (kk) => mix(ground, kk % 3 === 0 ? CREAM : DEEP, 0.06 + 0.04 * (kk % 2)), q, hh * 0.5);
      }
      g.restore();
      // a soft travelling sheen over the wet ground
      const sh = fract(t * 0.32 + li * 0.27);
      if (q >= 1) dab(g, lerp(x0, x1, sh), yc - hh * 0.18, -0.05, Math.min(260 * u, (x1 - x0) * 0.3), hh * 0.18, mix(ground, CREAM, 0.35), 1, 0.35 * Math.sin(sh * Math.PI), 1100 + li);
      // the brush that lays it, riding the front of the wipe
      if (q > 0 && q < 1) {
        const bx = lerp(x0, x1, q);
        for (let b = 0; b < 5; b++) dab(g, bx - 40 * u, yc + (b - 2) * hh * 0.2, 0, 80 * u, hh * 0.22, mix(acc, CREAM, 0.15 + 0.12 * (b % 2)), 1, 1, 1200 + b);
        dab(g, bx + 8 * u, yc, 0, hh * 0.5, hh * 1.0, mix(acc, CREAM, 0.25), 1, 1, 1210);
      }
    });
    // A second beat: an accent stroke is painted under the last line, then light runs along it.
    const last = lines[n - 1], ul = clamp((local - (statement ? 0.85 : 0.7)) / 0.55);
    if (ul > 0) {
      const y = last.y + last.h * 1.02, x0 = last.x - 6 * u, x1 = last.x + Math.min(last.w, statement ? last.w : 520 * u);
      const pts = []; for (let i = 0; i <= 12; i++) { const f = i / 12; pts.push([lerp(x0, x1, f), y + Math.sin(f * 5 + 1) * 4 * u - f * 6 * u]); }
      ridgeLine(g, pts, (statement ? 15 : 11) * u, (kk, f) => mix(acc, CREAM, 0.12 + 0.3 * Math.pow(Math.max(0, Math.sin((f * 3 - t * 0.9) * Math.PI)), 8)), ease(ul), 18 * u);
    }
  }

  // ---- scene wrapper: each side of the brush shows its own section; the brush is painted on top --------------
  const wrap = (fn, head) => (ctx, S, box, p, d, info) => {
    const exitCall = info.exit !== undefined, s = cur.s;
    ctx.save();
    if (s !== null) clipSide(ctx, S, s, !(exitCall || cur.phase === "out"));
    headPlate(ctx, S, head, exitCall ? 9 : info.local, !fn);
    if (fn) fn(ctx, S, box, exitCall ? 1 : 1 - Math.pow(1 - clamp(p), 2.3), d, info);
    ctx.restore();
    if (s !== null && !exitCall) brushDrag(ctx, S, s);
  };
  const stag = (p, i, n, spread = 0.55) => ease((p - (i / Math.max(1, n)) * spread) / (1 - spread));

  // ---- chart: bars squeezed from the tube, each ending in a curl ---------------------------------------------
  function chart(g, S, box, p, d, info) {
    const u = S.u, T = info.t, tone = S.look.tone, n = d.values.length, max = Math.max(...d.values, 1);
    const labelH = 120 * u, base = box.y + box.h - labelH - 10 * u, maxH = Math.max(120 * u, box.h - labelH - 215 * u);
    slab(g, T, box.x - 20 * u, base + 6 * u, box.w + 40 * u, labelH + 4 * u, ease(p * 4), { tag: "ground", spread: 0.06 });
    const tops = [];
    for (let i = 0; i < n; i++) {
      const q = stag(p, i, n), bw = (box.w / n) * 0.52, cx = box.x + (box.w / n) * (i + 0.5);
      const full = maxH * (d.values[i] / max) + 1, h = full * ease(q), hot = i === d.highlight;
      const col = hot ? hexRGB(S.accent) : tone.bars[i % tone.bars.length];
      g.save(); g.translate(cx - bw / 2, base - full);
      g.beginPath(); g.roundRect(0, 0, bw, full, 12 * u); g.clip();
      g.fillStyle = rgb(mix(col, DEEP, 0.3)); g.fillRect(0, full - h, bw, h + 2);
      const shape = { w: bw, h: full, inside: (x, y) => x >= -6 && x <= bw + 6 && y >= 0 && y <= full + 10, ang: (x, y) => -Math.PI / 2 + Math.sin(x * 0.05 + i) * 0.12 + Math.sin(T * 1.6 + y * 0.02 + i) * 0.03, order: (x, y) => 1 - y / full };
      paintShape(g, `bar|${bw | 0}|${full | 0}`, shape, { len: 78 * u, wid: 20 * u, step: 14 * u, sy: 38 * u }, (s) => pick([col, mix(col, CREAM, 0.14), mix(col, DEEP, 0.12)], s, 0.2), ease(q));
      // A glint climbing the bar.
      const gl = (T * 0.55 + i * 0.27) % 1, gy = full * (1 - gl);
      if (q > 0.98 && gy > full - h) dab(g, bw * 0.22, gy, -Math.PI / 2, 90 * u, 9 * u, mix(col, CREAM, 0.6), 1, Math.sin(gl * Math.PI) * 0.8);
      edgeRelief(g, () => { g.beginPath(); g.roundRect(0, 0, bw, full, 12 * u); }, u, 7);
      g.restore();
      const settled = smooth(0.96, 1, q), slosh = settled * (Math.sin(T * 2.3 + i * 1.4) * 9 + Math.sin(T * 3.7 + i) * 4) * u;
      const ty = base - h + slosh;
      if (settled > 0) {
        // the wet top surface slops from side to side, and a drip runs down the bar on its own beat
        const surf = []; for (let k = 0; k <= 10; k++) { const fx = k / 10; surf.push([cx - bw / 2 + 6 * u + (bw - 12 * u) * fx, ty + Math.sin(T * 2.3 + i * 1.4 + fx * 3) * 7 * u * settled]); }
        ridgeLine(g, surf, 14 * u, (k) => mix(col, CREAM, 0.3 + (k % 2) * 0.15), 1);
        const df = fract(T * 0.42 + i * 0.29), dx2 = cx + bw * (hash(i, 31) - 0.5) * 0.5, dl = Math.min(h * 0.6, 260 * u) * ease(df / 0.7);
        if (df < 0.92) { ridgeLine(g, [[dx2, ty + 4 * u], [dx2, ty + 4 * u + dl]], 11 * u, mix(col, CREAM, 0.2), 1); dab(g, dx2, ty + 8 * u + dl, Math.PI / 2, 18 * u, 17 * u, mix(col, CREAM, 0.12), 1, 1 - smooth(0.75, 0.92, df)); }
      }
      if (q > 0 && q < 1) {
        // paint pours in from above while the bar fills, thinning as it finishes
        const thin = 1 - smooth(0.8, 1, q), top0 = base - maxH - 150 * u;
        ridgeLine(g, [[cx + Math.sin(T * 3 + i) * 3 * u, top0], [cx, ty - 4 * u]], 18 * u * thin + 2 * u, (k) => mix(col, k % 2 ? CREAM : DEEP, 0.1), 1, 14 * u);
        for (let b = 0; b < 4; b++) { const a = -Math.PI / 2 + (b - 1.5) * 0.6 + Math.sin(T * 5 + b) * 0.2; dab(g, cx + Math.cos(a) * 26 * u, ty + Math.sin(a) * 14 * u, a, 22 * u, 10 * u, mix(col, CREAM, 0.25), 1, thin, 1300 + i * 7 + b); }
      }
      if (q > 0) {
        // the curl on top
        const pts = [];
        for (let k = 0; k <= 26; k++) { const a = (k / 26) * TAU * 1.35 + 0.4 + Math.sin(T * 1.8 + i) * 0.35 + T * 0.5, r = (bw * 0.5) * (1 - k / 30); pts.push([cx + Math.cos(a) * r * 0.9, ty - bw * 0.1 - (k / 26) * bw * 0.26 + Math.sin(a) * r * 0.42]); }
        ridgeLine(g, pts, 12 * u, (k) => mix(col, CREAM, 0.22 + (k % 3) * 0.1), clamp(q * 1.6));
        tops.push([cx, ty - bw * 0.3]);
        bigNum(g, num(d.values[i], ease(q), d), cx, ty - bw * 0.3 - 66 * u, 100 * u, hot ? "#fff6dc" : rgb(CREAM), 1, "center", bw * 1.5);
      }
      if (q > 0) say(g, d.labels[i] || "", cx, base + 6 * u + labelH * 0.52, 53 * u, { align: "center", color: rgb(tone.slabInk), outline: "rgba(255,248,226,0.97)", ow: 0.16, maxW: (box.w / n) * 0.9, min: 46 * u });
    }
    // A ribbon of paint links the peaks, with light travelling along it.
    if (tops.length === n && n > 1) {
      const rp = clamp((p - 0.87) / 0.13);
      const path = spline(tops, 10);
      const lift = path.map(([x, y]) => [x, y + Math.sin(T * 1.8 + x * 0.008) * 11 * u]);
      ridgeLine(g, lift, 10 * u, (k, f) => mix(hexRGB(S.accent), CREAM, 0.35 + 0.35 * Math.sin((f * 6 - T * 2.4) * 1)), rp);
      // while it is being laid, a loaded brush tip leads the line
      if (rp > 0 && rp < 1) { const tip = lift[Math.min(lift.length - 1, Math.floor(rp * (lift.length - 1)))]; dab(g, tip[0], tip[1], 0, 26 * u, 24 * u, mix(hexRGB(S.accent), CREAM, 0.2), 1, 1, 1400); }
    }
  }

  // ---- object: a device that shows a tiny painted harbour, with three slab callouts ------------------------
  function miniHarbour(g, x, y, w, h, T, tone, p) {
    const cell = Math.max(10, w / 40), hor = h * 0.58;
    g.save(); g.beginPath(); g.roundRect(x, y, w, h, 12); g.clip();
    g.fillStyle = rgb(tone.base); g.fillRect(x, y, w, h);
    let k = 0;
    for (let yy = -cell; yy < h + cell; yy += cell * 0.8) for (let xx = -cell; xx < w + cell; xx += cell * 1.2) {
      k++;
      const px = xx + hash(k, 1) * cell, py = yy + hash(k, 2) * cell * 0.7;
      if (hash(k, 9) > p * 1.4 - 0.2) continue;
      const v = py / h; let c;
      if (py < hor) { c = ramp(tone.skyS, v / 0.6); const d = Math.hypot(px - w * 0.7, py - hor * 0.8); c = mix(c, ramp(tone.sunS, 0.6 + 0.4 * Math.sin(d * 0.08 - T * 2)), Math.exp(-Math.pow(d / (h * 0.32), 2)) * 0.9); }
      else { c = ramp(tone.seaS, (py - hor) / (h - hor)); c = mix(c, tone.foam, smooth(0.78, 0.97, Math.sin(px * 0.09 + py * 0.1 - T * 2.4)) * 0.5); }
      const a = py < hor ? Math.sin(px * 0.05 + T * 0.8) * 0.5 : Math.sin(px * 0.09 - T * 1.8) * 0.2;
      dab(g, x + px, y + py, a, cell * 1.9, cell * 0.85, mix(c, hash(k, 4) > 0.5 ? CREAM : DEEP, hash(k, 5) * 0.2));
    }
    g.restore();
  }
  function object(g, S, box, p, d, info) {
    const u = S.u, T = info.t, tone = S.look.tone, phone = d.kind === "phone", tall = S.tall;
    let dw, dh, dx, dy;
    if (phone) { dh = tall ? box.h * 0.5 : box.h * 0.9; dw = dh / 1.95; dx = tall ? box.x + (box.w - dw) / 2 : box.x + box.w * 0.14; dy = box.y + (tall ? 6 * u : (box.h - dh) / 2 - 8 * u); }
    else { dw = tall ? box.w * 0.9 : Math.min(box.w * 0.6, box.h * 1.3); dh = dw * 0.62; dx = tall ? box.x + (box.w - dw) / 2 : box.x + box.w * 0.04; dy = box.y + (tall ? 30 * u : (box.h - dh) / 2 - 24 * u); }
    const q = ease(p * 1.5), pad = (phone ? 22 : 26) * u;
    // body
    g.save(); g.globalAlpha *= clamp(p * 4);
    g.save(); g.translate(dx, dy + (1 - q) * 16 * u);
    g.beginPath(); g.roundRect(10 * u, 16 * u, dw, dh, 26 * u); g.fillStyle = "rgba(8,5,26,0.5)"; g.fill();
    g.save(); g.beginPath(); g.roundRect(0, 0, dw, dh, 26 * u); g.clip();
    g.fillStyle = rgb(mix(tone.device[2], DEEP, 0.2)); g.fillRect(0, 0, dw * clamp(p * 4), dh);
    paintShape(g, `dev|${dw | 0}|${dh | 0}`, { w: dw, h: dh, inside: () => true, ang: (x, y) => (phone ? Math.PI / 2 : 0) + (vnoise(x * 0.02, y * 0.02) - 0.5) * 0.3, order: (x, y) => (x + y) / (dw + dh) }, { len: 56 * u, wid: 20 * u, step: 34 * u }, (s) => pick(tone.device, s, 0.3), ease(p * 2.6));
    edgeRelief(g, () => { g.beginPath(); g.roundRect(0, 0, dw, dh, 26 * u); }, u, 8);
    g.restore();
    g.restore();
    const sx = dx + pad, sy = dy + pad, sw = dw - pad * 2, sh = dh - pad * 2 - (phone ? 0 : 0);
    const tlH = sh * 0.34, mh = sh - tlH;
    miniHarbour(g, sx, sy, sw, mh, T, tone, clamp((p - 0.1) / 0.5));
    // timeline band: a dark painted ground with three tracks of dragged clips and a travelling playhead
    const ty0 = sy + mh + 6 * u, th0 = tlH - 6 * u, phF = 0.04 + fract(T * 0.38) * 0.92, ph = sx + sw * phF;
    g.save();
    g.beginPath(); g.roundRect(sx, ty0, sw, th0, 10 * u); g.clip();
    g.fillStyle = rgb(mix(tone.base, DEEP, 0.55)); g.fillRect(sx, ty0, sw * clamp(p * 3), th0);
    g.translate(sx, ty0);
    paintShape(g, `tl|${sw | 0}|${th0 | 0}`, { w: sw, h: th0, inside: () => true, ang: (x, y) => (vnoise(x * 0.02, y * 0.05) - 0.5) * 0.22, order: (x) => x / sw }, { len: 70 * u, wid: 15 * u, step: 40 * u },
      (st) => pick([mix(tone.base, DEEP, 0.5), mix(tone.device[2], DEEP, 0.45), mix(tone.base, DEEP, 0.3)], st, 0.25), clamp(p * 2.4));
    edgeRelief(g, () => { g.beginPath(); g.roundRect(0, 0, sw, th0, 10 * u); }, u, 6);
    g.restore();
    const clips = [[0.04, 0.34], [0.42, 0.22], [0.68, 0.28]];
    for (let r = 0; r < 3; r++) clips.forEach(([cx, cw], i) => {
      const k = clamp((p - 0.35 - i * 0.07 - r * 0.04) * 4); if (k <= 0) return;
      const yy = ty0 + th0 * (0.2 + r * 0.29), xx = sx + sw * (cx + r * 0.03), x2 = xx + sw * cw * k;
      const col = hexRGB(r === 1 && i === 1 ? S.accent : "#" + [0x8f7bd0, 0x58b6c2, 0xe9b44c][i].toString(16).padStart(6, "0"));
      const under = k >= 1 && ph >= xx && ph <= x2;
      const lift = under ? -4 * u : 0, glow = under ? 0.32 : 0;
      ridgeLine(g, [[xx, yy + lift], [x2, yy + lift]], Math.max(10 * u, th0 * 0.17) * (under ? 1.12 : 1), (kk, f) => mix(col, kk % 2 ? CREAM : DEEP, 0.08 + glow * (kk % 2 ? 1 : 0.1)), 1, 16 * u);
    });
    // playhead: a dragged vertical line with a blob of paint for a head
    g.save(); g.globalAlpha *= clamp(p * 3);
    ridgeLine(g, [[ph, ty0 - 4 * u], [ph, sy + sh]], 8 * u, mix(hexRGB(S.accent), CREAM, 0.45), 1);
    dab(g, ph, ty0 - 8 * u, Math.PI / 2, 22 * u, 22 * u, hexRGB(S.accent));
    g.restore();
    // a little boat crosses the preview in step with the playhead
    if (p > 0.4) { g.save(); g.beginPath(); g.rect(sx, sy, sw, mh); g.clip(); boat(g, sx + sw * phF, sy + mh * 0.62, sw / 640, T, 1.3, tone); g.restore(); }
    g.restore();
    if (!phone && p > 0.1) { // laptop base
      const by = dy + dh + 6 * u, bw = dw * 1.12, bx = dx - dw * 0.06;
      g.save(); g.globalAlpha *= clamp(p * 3);
      ridgeLine(g, [[bx, by + 10 * u], [bx + bw, by + 10 * u]], 22 * u, tone.device[1], clamp(p * 2.2), 26 * u);
      g.restore();
    }
    // callouts
    const anchors = [[sx + sw * 0.74, sy + mh * 0.34], [sx + sw * 0.9, sy + mh + 6 * u + (tlH - 6 * u) * 0.47], [sx + sw * 0.7, sy + mh + 6 * u + (tlH - 6 * u) * 0.74]];
    const slabH = 42 * 1.4 * u * 1.55;
    for (const pass of [0, 1]) d.callouts.forEach((label, i) => {
      const c = stag(clamp((p - 0.3) / 0.7), i, 3, 0.5);
      if (c <= 0 || !label) return;
      const [ax, ay] = anchors[i];
      let lx, ly, align;
      if (tall) { lx = box.x + 12 * u; ly = dy + dh + (phone ? 20 : 70) * u + slabH / 2 + i * (slabH + 22 * u); align = "left"; }
      else { lx = box.x + box.w; ly = box.y + box.h * (0.2 + i * 0.28); align = "right"; }
      const tw = Math.min(box.w * (tall ? 0.8 : 0.4), measure(g, label, 42 * 1.4 * u) + 70 * u);
      const sl = align === "right" ? lx - tw : lx;
      const ex = tall ? sl + tw - 26 * u : sl - 10 * u, ey = ly;
      if (pass === 0) {
      const path = spline([[ax, ay], [lerp(ax, ex, 0.5), lerp(ay, ey, 0.5) + (tall ? 0 : -10 * u)], [ex, ey]], 10);
      ridgeLine(g, path, 11 * u, (k) => mix(hexRGB(S.accent), CREAM, 0.1 + 0.28 * Math.sin(k * 0.7 - T * 4) ** 2), clamp(c * 1.7));
      // anchor with expanding ring
      const rr = (T * 0.9 + i * 0.33) % 1;
      dab(g, ax, ay, 0, 6 * u, 24 * u, mix(hexRGB(S.accent), CREAM, 0.3));
      for (let a = 0; a < 8; a++) { const an = (a / 8) * TAU; dab(g, ax + Math.cos(an) * (24 + rr * 40) * u, ay + Math.sin(an) * (24 + rr * 40) * u, an + Math.PI / 2, 12 * u, 7 * u, CREAM, 1, (1 - rr) * c); }
      }
      if (pass === 1 && c > 0.5) {
        // once placed, the labels take turns: each one swells and the ring at its anchor flares
        const bump = smooth(0.98, 1, c) * Math.pow(Math.max(0, Math.sin(fract(T * 0.7 - i / 3) * Math.PI)), 6);
        g.save(); g.translate(lx, ly + Math.sin(T * 1.7 + i * 2) * 5 * u); g.rotate(Math.sin(T * 1.3 + i) * 0.018); g.scale(1 + 0.08 * bump, 1 + 0.08 * bump); g.translate(-lx, -ly);
        tag(g, T, label, lx, ly, 42 * u, box.w * (tall ? 0.8 : 0.4), clamp((c - 0.5) * 2.4), { align, tag: "co" + i });
        g.restore();
        if (bump > 0.05) for (let a = 0; a < 10; a++) { const an = (a / 10) * TAU + T; dab(g, ax + Math.cos(an) * (30 + bump * 26) * u, ay + Math.sin(an) * (30 + bump * 26) * u, an, 22 * u, 10 * u, mix(hexRGB(S.accent), CREAM, 0.4), 1, bump); }
      }
    });
  }

  // ---- people: smocked painters on a jetty, one painting in the air -----------------------------------------
  function painter(g, S, T, i, cx, feet, s, cloth, hot, item, q) {
    const tone = S.look.tone, u = S.u, bob = Math.sin(T * 2.1 + i * 1.3) * 3 * u * (hot ? 1.6 : 1);
    const skin = tone.skin[i % tone.skin.length], skinLit = mix(skin, CREAM, 0.4), skinDark = mix(mix(skin, [150, 60, 70], 0.35), DEEP, 0.18);
    const trouser = mix(cloth, DEEP, 0.5), boot = [86, 52, 40];
    g.save(); g.translate(cx, feet + (1 - q) * s * 0.3); g.globalAlpha *= clamp(q * 2.4);
    const sc = (v) => v * s;
    const sleeve = mix(cloth, CREAM, 0.08);
    // legs: vertical strokes, lit on the left; boots built from a few strokes with a toe highlight
    const step = item === 0 ? Math.max(0, Math.sin(T * 1.9 + i)) * 0.03 : 0;
    for (const [lx2, lit] of [[-0.085, 0.18], [0.085, -0.05]]) {
      for (let k = 0; k < 3; k++) dab(g, sc(lx2 + (k - 1) * 0.03), -sc(0.11), Math.PI / 2 + (k - 1) * 0.06, sc(0.17), sc(0.045), mix(trouser, lit > 0 ? CREAM : DEEP, Math.abs(lit) + k * 0.04), clamp(q * 2));
    }
    for (const [bx2, dir] of [[-0.11, -1], [0.11, 1]]) {
      const lift = dir === 1 ? step : 0;
      dab(g, sc(bx2 + dir * 0.03), -sc(0.035 + lift), dir === 1 ? -lift * 3 : Math.PI, sc(0.2), sc(0.085), boot, clamp(q * 2));
      dab(g, sc(bx2 + dir * 0.075), -sc(0.05 + lift), dir === 1 ? -0.2 : Math.PI + 0.2, sc(0.08), sc(0.045), mix(boot, CREAM, 0.35), clamp(q * 2));
      dab(g, sc(bx2 + dir * 0.02), -sc(0.0 + lift), dir === 1 ? 0 : Math.PI, sc(0.2), sc(0.022), mix(boot, DEEP, 0.5), clamp(q * 2));
    }
    // smock: strokes run down the body
    const BH = 0.52;
    const body = { w: sc(0.62), h: sc(BH), inside: (x, y) => { const f = y / sc(BH), hw = lerp(0.16, 0.29, f) * s; return y >= 0 && y <= sc(BH) && Math.abs(x - sc(0.31)) < hw; }, ang: (x, y) => Math.PI / 2 + (x - sc(0.31)) * 0.012 / (s / 300) * 0.4 + Math.sin(y * 0.04) * 0.1, order: (x, y) => 1 - y / sc(BH) };
    g.save(); g.translate(-sc(0.31), -sc(0.66) + bob * 0.4);
    const smock = () => { g.beginPath(); g.moveTo(sc(0.31) - sc(0.16), 0); g.lineTo(sc(0.31) + sc(0.16), 0); g.quadraticCurveTo(sc(0.31) + sc(0.27), sc(BH * 0.5), sc(0.31) + sc(0.3), sc(BH)); g.quadraticCurveTo(sc(0.31), sc(BH) + sc(0.03), sc(0.31) - sc(0.3), sc(BH)); g.quadraticCurveTo(sc(0.31) - sc(0.27), sc(BH * 0.5), sc(0.31) - sc(0.16), 0); g.closePath(); };
    g.globalAlpha *= clamp(q * 1.6);
    smock(); g.fillStyle = rgb(mix(cloth, DEEP, 0.18)); g.fill(); smock(); g.clip();
    paintShape(g, `body|${s | 0}`, body, { len: sc(0.2), wid: sc(0.075), step: sc(0.07) }, (st) => mix(pick([cloth, mix(cloth, CREAM, 0.16), mix(cloth, DEEP, 0.16)], st, 0.2), st.x < sc(0.31) ? CREAM : DEEP, Math.abs(st.x - sc(0.31)) / sc(0.3) * 0.22), clamp(q * 1.3), 0.03, T);
    edgeRelief(g, smock, u, 6);
    g.restore();
    ridgeLine(g, [[-sc(0.13), -sc(0.32) + bob * 0.4], [sc(0.13), -sc(0.32) + bob * 0.4]], sc(0.05), mix(cloth, CREAM, 0.5), clamp(q * 2 - 0.6));
    // head: strokes curve around the skull, lit up-left and shadowed down-right
    const turn = item === 0 ? Math.sin(T * 1.9 + i) * 0.5 : item === 2 ? Math.sin(T * 1.2 + i) * 0.3 : 0;
    const hy = -sc(0.8) + bob, hr = sc(0.16);
    const head = { w: hr * 2, h: hr * 2.1, inside: (x, y) => Math.hypot((x - hr) / 1, (y - hr * 1.05) / 1.05) < hr, ang: (x, y) => Math.PI / 2 + ((x - hr) / hr) * 0.75, order: (x, y) => Math.hypot(x - hr, y - hr) / hr };
    g.save(); g.translate(-hr, hy - hr * 1.05);
    const skull = () => { g.beginPath(); g.ellipse(hr, hr * 1.05, hr, hr * 1.1, 0, 0, TAU); };
    g.globalAlpha *= clamp(q * 1.8); skull(); g.fillStyle = rgb(skin); g.fill(); skull(); g.clip();
    paintShape(g, `head|${s | 0}`, head, { len: sc(0.11), wid: sc(0.055), step: sc(0.05) }, (st) => {
      const l = ((st.x - hr) * LX + (st.y - hr) * LY) / hr;
      return l > 0 ? mix(skin, skinLit, clamp(l * 1.4) * 0.8) : mix(skin, skinDark, clamp(-l * 1.4) * 0.85);
    }, clamp(q * 1.6));
    edgeRelief(g, skull, u, 5);
    g.restore();
    // ear on the shadow side and neck
    dab(g, sc(0.15), hy + sc(0.02), Math.PI / 2, sc(0.07), sc(0.045), skinDark, clamp(q * 2));
    dab(g, 0, hy + hr * 1.02, Math.PI / 2, sc(0.09), sc(0.075), mix(skinDark, skin, 0.4), clamp(q * 2));
    // hair or beret, laid in strokes
    g.save(); g.translate(sc(0.02), hy - hr * 0.95); g.rotate(-0.16 + turn * 0.08);
    const hat = hot ? hexRGB(S.accent) : mix(cloth, DEEP, 0.3);
    for (let k = 0; k < 7; k++) { const a = -Math.PI + (k / 6) * Math.PI; dab(g, Math.cos(a) * hr * 0.8, Math.sin(a) * hr * 0.35 + hr * 0.05, a + Math.PI / 2 + Math.PI / 2, sc(0.13), sc(0.07), mix(hat, k < 3 ? CREAM : DEEP, 0.12 + (k % 2) * 0.08)); }
    dab(g, 0, -hr * 0.45, -Math.PI / 2, sc(0.07), sc(0.04), mix(hat, DEEP, 0.4));
    g.restore();
    // face: brows, eyes with a glint, a nose shadow, warm cheek strokes and a mouth
    const fx = turn * sc(0.035), blink = fract(T * 0.33 + i * 0.21) > 0.94, raise = (item === 0 ? Math.max(0, Math.sin(T * 1.9 + i)) : 0.3) * sc(0.015);
    for (const ex of [-0.062, 0.062]) {
      dab(g, sc(ex) + fx, hy - sc(0.06) - raise, ex < 0 ? -0.18 : 0.18, sc(0.06), sc(0.018), mix(hat, DEEP, 0.5));
      if (blink) dab(g, sc(ex) + fx, hy - sc(0.01), 0, sc(0.05), sc(0.014), DEEP);
      else { dab(g, sc(ex) + fx, hy - sc(0.01), Math.PI / 2, sc(0.036), sc(0.03), DEEP); dab(g, sc(ex) + fx - sc(0.008), hy - sc(0.02), 0, sc(0.01), sc(0.01), CREAM); }
      dab(g, sc(ex * 1.5) + fx, hy + sc(0.05), 0.15, sc(0.06), sc(0.03), mix(skin, [230, 110, 100], 0.45), 1, 0.75);
    }
    dab(g, fx + sc(0.014), hy + sc(0.02), Math.PI / 2 + 0.2, sc(0.06), sc(0.022), skinDark);
    const smile = item === 0 ? 0.5 + 0.5 * Math.sin(T * 1.9 + i) : 0.6;
    ridgeLine(g, spline([[-sc(0.05) + fx, hy + sc(0.075)], [fx, hy + sc(0.075) + sc(0.03) * smile], [sc(0.05) + fx, hy + sc(0.075)]], 5), sc(0.016), [120, 40, 50], clamp(q * 2 - 0.5), sc(0.014));
    // arms and the one thing each character is doing
    const sh = [sc(0.2), -sc(0.56) + bob * 0.5];
    const lsh = [-sc(0.2), -sc(0.56) + bob * 0.5];
    const arm = (from, hand, bendX) => ridgeLine(g, [from, [lerp(from[0], hand[0], 0.5) + bendX, lerp(from[1], hand[1], 0.5) + sc(0.06)], hand], sc(0.075), sleeve, clamp(q * 2 - 0.5), sc(0.06));
    const handDab = (h) => { dab(g, h[0], h[1], 0.4, sc(0.06), sc(0.06), skin); dab(g, h[0] - sc(0.01), h[1] - sc(0.012), 0.4, sc(0.03), sc(0.02), skinLit); };
    if (item === 1 || hot) {
      // the painter: right hand traces a loop in the air and leaves a paint trail
      const P = (tt) => [sc(0.5) + Math.cos(tt * 2.2) * sc(0.3), -sc(0.78) + Math.sin(tt * 3.1) * sc(0.2) - sc(0.04)];
      const hand = P(T + i);
      arm(sh, hand, sc(0.06));
      const tr = [];
      for (let k = 18; k >= 0; k--) tr.push(P(T + i - k * 0.05));
      for (let k = 0; k < tr.length - 1; k++) {
        const f = k / tr.length;
        dab(g, tr[k][0], tr[k][1], Math.atan2(tr[k + 1][1] - tr[k][1], tr[k + 1][0] - tr[k][0]), sc(0.085), sc(0.05) * (0.4 + f * 0.7), mix([255, 120, 170], [255, 226, 110], f), 1, f * clamp(q * 2));
      }
      ridgeLine(g, [hand, [hand[0] + sc(0.09), hand[1] - sc(0.11)]], sc(0.03), [110, 70, 44], 1, sc(0.03));
      handDab(hand);
      dab(g, hand[0] + sc(0.1), hand[1] - sc(0.125), -0.9, sc(0.05), sc(0.045), hexRGB(S.accent));
    } else if (item === 0) {
      // the director: sweeps the right arm out to point at the work, then brings it back
      const gst = smooth(-0.2, 0.8, Math.sin(T * 1.9 + i));
      const hand = [lerp(sc(0.27), sc(0.58), gst), lerp(-sc(0.34), -sc(0.86), gst) + bob * 0.6];
      arm(sh, hand, sc(0.08) * (1 - gst));
      handDab(hand);
      ridgeLine(g, [hand, [hand[0] + sc(0.09) * gst, hand[1] - sc(0.04) * gst]], sc(0.03), skin, gst, sc(0.03));
      // and keeps the palette in the other hand
      const lh = [-sc(0.3), -sc(0.4) + bob * 0.6];
      arm(lsh, lh, -sc(0.08));
      g.save(); g.translate(lh[0] - sc(0.07), lh[1] - sc(0.05)); g.rotate(-0.4 + Math.sin(T * 1.8 + i) * 0.08);
      poly(g, [[-sc(0.17), 0], [-sc(0.1), -sc(0.09)], [sc(0.1), -sc(0.1)], [sc(0.18), -sc(0.01)], [sc(0.12), sc(0.08)], [-sc(0.1), sc(0.08)]], [214, 170, 110], sc(0.045), T);
      [[-0.1, -0.02, [235, 80, 70]], [-0.02, -0.05, [250, 205, 80]], [0.06, -0.03, [70, 170, 190]], [0.1, 0.02, [150, 110, 210]]].forEach(([x, y, c], k) => dab(g, sc(x), sc(y) + Math.sin(T * 2.4 + k) * sc(0.006), 0.3, sc(0.05), sc(0.04), c));
      g.restore();
      handDab(lh);
    } else {
      // the agent: holds a painted gear and turns its crank
      const gc = [-sc(0.36), -sc(0.5) + bob * 0.6], gr = sc(0.15), rot = T * 1.6 + i;
      for (let k = 0; k < 8; k++) { const a = rot + (k / 8) * TAU; dab(g, gc[0] + Math.cos(a) * gr * 1.08, gc[1] + Math.sin(a) * gr * 1.08, a, sc(0.075), sc(0.06), mix([200, 160, 90], k % 2 ? CREAM : DEEP, 0.15)); }
      const ring = []; for (let k = 0; k <= 24; k++) { const a = rot + (k / 24) * TAU; ring.push([gc[0] + Math.cos(a) * gr * 0.82, gc[1] + Math.sin(a) * gr * 0.82]); }
      ridgeLine(g, ring, sc(0.07), (k) => mix([214, 176, 96], k % 2 ? CREAM : DEEP, 0.14), clamp(q * 2 - 0.4));
      for (let k = 0; k < 4; k++) { const a = rot + (k / 4) * TAU; ridgeLine(g, [gc, [gc[0] + Math.cos(a) * gr * 0.75, gc[1] + Math.sin(a) * gr * 0.75]], sc(0.035), [176, 136, 70], 1); }
      dab(g, gc[0], gc[1], rot, sc(0.06), sc(0.06), hexRGB(S.accent));
      arm(lsh, [gc[0] + sc(0.06), gc[1] + sc(0.1)], -sc(0.04));
      handDab([gc[0] + sc(0.06), gc[1] + sc(0.1)]);
      const crank = [gc[0] + Math.cos(rot) * gr * 0.6, gc[1] + Math.sin(rot) * gr * 0.6];
      arm(sh, crank, sc(0.1));
      handDab(crank);
    }
    g.restore();
  }
  function people(g, S, box, p, d, info) {
    const u = S.u, T = info.t, tone = S.look.tone, n = Math.max(2, Math.min(6, Math.round(d.count)));
    const cols = S.tall ? Math.min(n, 3) : n, rows = Math.ceil(n / cols), sw = box.w / cols, sh = box.h / rows;
    const s = Math.min(380 * u, (sh - 150 * u) / 1.14, sw * (S.tall ? 0.82 : 1.15));
    for (let r = 0; r < rows; r++) {
      const feet = box.y + sh * (r + 1) - 36 * u;
      slab(g, T, box.x - 20 * u, feet - 6 * u, box.w + 40 * u, 56 * u, ease(p * 4), { tag: "jetty" + r, cols: tone.plank });
    }
    for (let i = 0; i < n; i++) {
      const q = stag(p, i, n), r = Math.floor(i / cols), c = i % cols, inRow = r === rows - 1 ? n - cols * r : cols;
      const cx = box.x + (box.w / inRow) * (c + 0.5), feet = box.y + sh * (r + 1) - 36 * u;
      const hot = i === Math.min(n - 1, 1);
      const cloth = hot ? hexRGB(S.accent) : tone.cloth[i % tone.cloth.length];
      painter(g, S, T, i, cx, feet, s, cloth, hot, i % 3, q);
      const label = i < d.badges.length ? d.badges[i] : "";
      if (q > 0.7 && label) {
        const sway = Math.sin(T * 1.4 + i * 1.1) * 0.03, py = feet - s * 1.12 - 62 * u;
        const bw = Math.min(sw * 0.92, measure(g, label, 50 * u) + 70 * u), bh = 50 * u * 1.55;
        g.save(); g.translate(cx, py - 52 * u); g.rotate(sway);
        ridgeLine(g, [[-bw * 0.32, 0], [-bw * 0.32, 52 * u]], 6 * u, [90, 60, 40], 1);
        ridgeLine(g, [[bw * 0.32, 0], [bw * 0.32, 52 * u]], 6 * u, [90, 60, 40], 1);
        tag(g, T, label, 0, 52 * u + bh / 2, 42 * u, sw * 0.92, clamp((q - 0.7) * 4), { align: "center", tag: "bd" + i });
        g.restore();
      }
    }
  }

  // ---- process: swirl medallions joined by a ribbon of paint -----------------------------------------------
  function icon(g, kind, cx, cy, R, c, T) {
    const wd = R * 0.1, P = (pts, close) => { const a = close ? pts.concat([pts[0]]) : pts; ridgeLine(g, a.map(([x, y]) => [cx + x * R, cy + y * R]), wd, c, 1, wd * 0.9); };
    if (kind === 0) { P([[-0.3, -0.42], [0.1, -0.42], [0.3, -0.2], [0.3, 0.42], [-0.3, 0.42]], true); P([[0.1, -0.42], [0.1, -0.2], [0.3, -0.2]]); P([[-0.15, 0.02], [0.15, 0.02]]); P([[-0.15, 0.2], [0.1, 0.2]]); }
    else if (kind === 1) { const k = 1 + Math.sin(T * 3) * 0.08; P([[0, -0.46 * k], [0.1, -0.1], [0.46 * k, 0], [0.1, 0.1], [0, 0.46 * k], [-0.1, 0.1], [-0.46 * k, 0], [-0.1, -0.1]], true); }
    else if (kind === 2) { const pts = []; for (let i = 0; i <= 14; i++) { const x = -0.46 + (i / 14) * 0.92; pts.push([x, -Math.sqrt(Math.max(0, 1 - (x / 0.46) ** 2)) * 0.28]); } for (let i = 14; i >= 0; i--) { const x = -0.46 + (i / 14) * 0.92; pts.push([x, Math.sqrt(Math.max(0, 1 - (x / 0.46) ** 2)) * 0.28]); } P(pts); dab(g, cx + Math.sin(T * 1.3) * R * 0.05, cy, 0, R * 0.04, R * 0.2, c); }
    else P([[-0.34, 0.02], [-0.1, 0.28], [0.36, -0.28]]);
  }
  function process(g, S, box, p, d, info) {
    const u = S.u, T = info.t, tone = S.look.tone, n = d.steps.length, vertical = S.tall || box.h > box.w;
    const slot = vertical ? box.h / n : box.w / n;
    const R = vertical ? Math.min(box.w * 0.24, slot * 0.34) : Math.min(slot * 0.26, box.h * 0.27);
    const cs = [], paths = [];
    // a bead of wet paint travels the rope from the first step to the last, and each step swells as it arrives
    const BF = fract(T * 0.42) * (n - 1), bIdx = Math.min(n - 2, Math.floor(BF)), bF = BF - bIdx;
    const ropeDone = stag(p, n - 2 + 0.55, n, 0.6) > 0.99;
    const arrive = (i) => !ropeDone ? 0 : (i === bIdx + 1 ? smooth(0.8, 1, bF) : 0) + (i === bIdx ? 1 - smooth(0, 0.4, bF) : 0);
    for (let i = 0; i < n; i++) cs.push(vertical ? [box.x + box.w * (i % 2 ? 0.66 : 0.34), box.y + slot * (i + 0.5) - 20 * u] : [box.x + slot * (i + 0.5), box.y + box.h * 0.42]);
    // ribbon first, so medallions sit on it
    for (let i = 0; i < n - 1; i++) {
      const a = stag(p, i + 0.55, n, 0.6); if (a <= 0) continue;
      const [x1, y1] = cs[i], [x2, y2] = cs[i + 1];
      const pts = vertical ? [[x1, y1 + R], [lerp(x1, x2, 0.2), lerp(y1, y2, 0.5)], [lerp(x1, x2, 0.8), lerp(y1, y2, 0.5)], [x2, y2 - R]] : [[x1 + R * 0.96, y1 - R * 0.2], [lerp(x1, x2, 0.5), y1 - R * (i % 2 ? -0.62 : 0.78)], [x2 - R * 0.96, y2 - R * 0.2]];
      const path = spline(pts, 12);
      paths[i] = path;
      ridgeLine(g, path, 15 * u, (k, f) => mix(hexRGB(S.accent), [255, 214, 120], f), a);
      if (a > 0.99) {
        for (let k = 0; k < 3; k++) { const f = (T * 0.45 + k / 3 + i * 0.2) % 1, pt = path[Math.floor(f * (path.length - 1))]; dab(g, pt[0], pt[1], 0, 14 * u, 16 * u, [255, 240, 190], 1, Math.sin(f * Math.PI)); }
        const e = path[path.length - 1], q2 = path[path.length - 3], an = Math.atan2(e[1] - q2[1], e[0] - q2[0]);
        for (const sg of [-1, 1]) ridgeLine(g, [[e[0], e[1]], [e[0] - Math.cos(an + sg * 0.6) * 44 * u, e[1] - Math.sin(an + sg * 0.6) * 44 * u]], 13 * u, hexRGB(S.accent), 1);
      }
    }
    if (ropeDone && paths[bIdx]) {
      const path = paths[bIdx];
      for (let k = 7; k >= 0; k--) {
        const f = clamp(bF - k * 0.025), pt = path[Math.floor(f * (path.length - 1))];
        dab(g, pt[0], pt[1], T * 2 + k, (34 - k * 3) * u, (34 - k * 3.4) * u, mix([255, 236, 170], hexRGB(S.accent), k / 8), 1, 1 - k / 9);
      }
    }
    for (let i = 0; i < n; i++) {
      const q = stag(p, i, n, 0.6); if (q <= 0) continue;
      const [cx, cy] = cs[i], ar = arrive(i), on = ar > 0.15, lit = 1 + 0.07 * ar;
      g.save(); g.globalAlpha *= clamp(q * 3);
      const base = i === n - 1 ? hexRGB(S.accent) : tone.bars[i % tone.bars.length];
      if (on) for (let a = 0; a < 24; a++) { const an = (a / 24) * TAU + T * 0.6; dab(g, cx + Math.cos(an) * R * (1.22 + 0.12 * ar), cy + Math.sin(an) * R * (1.22 + 0.12 * ar), an + Math.PI / 2, 26 * u, 12 * u, [255, 225, 130], 1, ar * (0.5 + 0.5 * Math.sin(T * 5 + a))); }
      g.save(); g.translate(cx, cy); g.scale(lit, lit); g.translate(-R, -R);
      const shape = { w: R * 2, h: R * 2, inside: (x, y) => Math.hypot(x - R, y - R) < R, ang: (x, y) => Math.atan2(y - R, x - R) + Math.PI / 2, order: (x, y) => Math.hypot(x - R, y - R) / R };
      paintShape(g, `med|${R | 0}`, shape, { len: R * 0.34, wid: R * 0.14, step: R * 0.12 }, (s, k) => { const ring = Math.hypot(s.x - R, s.y - R) / R, th = Math.atan2(s.y - R, s.x - R); return mix(base, hash(Math.floor(ring * 5), 1) > 0.5 ? CREAM : DEEP, 0.2 + 0.2 * Math.sin(th * 2 + ring * 8 - T * 1.4) ** 2); }, ease(q), 0.08, T);
      g.restore();
      // rim of the medallion
      const rim = []; for (let k = 0; k <= 40; k++) { const a = (k / 40) * TAU; rim.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]); }
      ridgeLine(g, rim, R * 0.1, (k) => mix([255, 226, 150], CREAM, hash(k, 4)), clamp(q * 1.6));
      if (q > 0.4) icon(g, i === n - 1 ? 3 : i % 3, cx, cy, R * 0.9, CREAM, T);
      // number badge
      if (q > 0.5) { const bx = cx - R * 0.78, by = cy - R * 0.78; dab(g, bx, by, 0, 4 * u, 62 * u, DEEP); dab(g, bx, by, 0, 4 * u, 52 * u, [255, 200, 90]); say(g, String(i + 1), bx, by + 2 * u, 46 * u, { align: "center", color: rgb(tone.slabInk) }); }
      g.restore();
      const lw = vertical ? box.w * 0.54 : slot * 0.86;
      if (q > 0.45) tag(g, T, d.steps[i], vertical ? cx + (i % 2 ? -(R + 20 * u) : R + 20 * u) * 0 : cx, vertical ? cy + R + 52 * u : cy + R + 92 * u, 44 * u, lw, clamp((q - 0.45) * 2), { align: "center", tag: "st" + i });
    }
  }

  // ---- compare: two jars of paint that fill ------------------------------------------------------------------
  function jar(g, S, T, x, y, w, h, level, color, q, i) {
    const u = S.u;
    const lid = h * 0.1, bodyY = y + lid, bodyH = h - lid;
    // paint inside
    const fillH = bodyH * 0.92 * level * ease(q), top = bodyY + bodyH - fillH - 6 * u;
    g.save();
    g.beginPath(); g.roundRect(x + 8 * u, bodyY + 6 * u, w - 16 * u, bodyH - 10 * u, 26 * u); g.clip();
    g.fillStyle = "rgba(220,235,255,0.14)"; g.fillRect(x, bodyY, w, bodyH);
    if (fillH > 4) {
      const iw = w - 16 * u;
      g.save(); g.beginPath(); g.rect(x, top - 2 * u, w, fillH + 30 * u); g.clip(); g.translate(x + 8 * u, top);
      const shape = { w: iw, h: fillH + 10 * u, inside: () => true, ang: (px, py) => Math.PI / 2 + Math.sin(px * 0.02 + py * 0.01) * 0.3, order: (px, py) => 1 - py / (fillH + 10 * u) };
      paintShape(g, `jar|${iw | 0}|${(fillH / 8) | 0}`, shape, { len: 74 * u, wid: 22 * u, step: 16 * u, sy: 40 * u }, (s) => pick([color, mix(color, CREAM, 0.14), mix(color, DEEP, 0.14)], s, 0.25), 1, 0.04, T);
      g.restore();
      // the wavy lit surface
      const pts = []; for (let k = 0; k <= 16; k++) { const px = x + 10 * u + ((w - 20 * u) * k) / 16; const stir = Math.cos(T * 2.2 + i * 1.7) * (k / 16 - 0.5) * 2; pts.push([px, top + Math.sin(T * 2.6 + k * 0.7 + i) * 7 * u + stir * 9 * u * ease(q)]); }
      ridgeLine(g, pts, 13 * u, mix(color, CREAM, 0.5), 1, 18 * u);
      // bubbles rise
      for (let b = 0; b < 5; b++) { const f = (T * 0.32 + b * 0.21 + i * 0.13) % 1; dab(g, x + w * (0.22 + 0.14 * b) + Math.sin(f * 9 + b) * 8 * u, top + fillH * (1 - f), 0, 4 * u, (14 + b * 3) * u, mix(color, CREAM, 0.7), 1, Math.sin(f * Math.PI) * 0.9); }
    }
    g.restore();
    // glass and lid
    const rim = []; const r = 26 * u;
    rim.push([x + w * 0.19, bodyY + 2 * u]); rim.push([x + w * 0.08, bodyY + 14 * u]); rim.push([x + 6 * u, bodyY + 44 * u]); rim.push([x + 4 * u, bodyY + bodyH - r]); rim.push([x + r, bodyY + bodyH]); rim.push([x + w - r, bodyY + bodyH]); rim.push([x + w - 4 * u, bodyY + bodyH - r]); rim.push([x + w - 6 * u, bodyY + 44 * u]); rim.push([x + w * 0.92, bodyY + 14 * u]); rim.push([x + w * 0.81, bodyY + 2 * u]);
    ridgeLine(g, spline(rim, 6), 11 * u, (k) => mix([190, 215, 240], CREAM, hash(k, 2) * 0.6), clamp(q * 1.8));
    if (q > 0.2) { const mouth = []; for (let k = 0; k <= 20; k++) { const a = (k / 20) * TAU; mouth.push([x + w / 2 + Math.cos(a) * w * 0.31, bodyY + 2 * u + Math.sin(a) * lid * 0.32]); } ridgeLine(g, mouth, 10 * u, (k) => mix([200, 222, 244], CREAM, hash(k, 6) * 0.6), clamp(q * 2)); }
    // a long highlight on the glass
    if (q > 0.5) dab(g, x + 22 * u, bodyY + bodyH * 0.45, Math.PI / 2, bodyH * 0.4, 9 * u, [235, 245, 255], 1, 0.55);
    // a brush handle stirs the paint in slow circles
    if (q > 0.6 && fillH > 20 * u) {
      const ang = T * 2.2 + i * 1.7, tipX = x + w / 2 + Math.cos(ang) * w * 0.24, tipY = top + Math.min(fillH * 0.45, 90 * u) + Math.sin(ang) * 10 * u;
      const topX = x + w / 2 + Math.cos(ang) * w * 0.1 + w * 0.12, topY = y - Math.min(h * 0.16, 40 * u);
      ridgeLine(g, [[topX, topY], [tipX, tipY]], 15 * u, (k) => mix([150, 96, 58], k % 2 ? CREAM : DEEP, 0.12), clamp((q - 0.6) * 4));
      ridgeLine(g, [[lerp(topX, tipX, 0.62), lerp(topY, tipY, 0.62)], [tipX, tipY]], 17 * u, mix(color, CREAM, 0.1), clamp((q - 0.6) * 4));
      for (let k = 0; k < 6; k++) { const a2 = ang - k * 0.35; dab(g, x + w / 2 + Math.cos(a2) * w * 0.26, top + 2 * u + Math.sin(a2) * 5 * u, a2 + Math.PI / 2, 26 * u, 9 * u, mix(color, CREAM, 0.45), 1, (1 - k / 6) * 0.9); }
    }
  }
  const tone = (S) => S.look.tone;
  function compare(g, S, box, p, d, info) {
    const u = S.u, T = info.t, tn = S.look.tone, tall = S.tall || box.h > box.w * 1.1;
    const maxV = Math.max(d.leftValue, d.rightValue, 1);
    [[d.left, d.leftValue, tn.bars[0]], [d.right, d.rightValue, hexRGB(S.accent)]].forEach(([label, value, color], i) => {
      const q = stag(p, i, 2, 0.4); if (q <= 0) return;
      const slotW = tall ? box.w : box.w / 2 - 20 * u, slotH = tall ? box.h / 2 - 14 * u : box.h;
      const sx = tall ? box.x : box.x + i * (box.w / 2 + 20 * u), sy = tall ? box.y + i * (box.h / 2 + 14 * u) : box.y;
      const jh = Math.min(slotH - 12 * u, tall ? slotH : box.h * 0.96), jw = Math.min(jh * 0.62, slotW * 0.4);
      jar(g, S, T, sx + 10 * u, sy + (slotH - jh) / 2, jw, jh, value / maxV, color, q, i);
      const tx = sx + jw + 56 * u, tw = slotW - jw - 70 * u;
      const ny = sy + slotH * 0.5 - 14 * u;
      bigNum(g, num(value, ease(q), d), tx, ny, Math.min(170 * u, slotH * 0.42), i ? "#fff3cf" : rgb(CREAM), clamp((q - 0.1) * 3), "left", tw);
      tag(g, T, label, tx, ny + Math.min(170 * u, slotH * 0.42) * 0.62 + 40 * u, 44 * u, tw, clamp((q - 0.3) * 2.2), { align: "left", tag: "cmp" + i });
      // a sparkle that orbits the winning jar
      if (i && q > 0.9) for (let k = 0; k < 6; k++) { const a = T * 1.6 + (k / 6) * TAU; dab(g, tx + tw * 0.5 + Math.cos(a) * tw * 0.52, ny - slotH * 0.22 + Math.sin(a * 1.3) * 26 * u, a, 18 * u, 9 * u, [255, 226, 130], 1, 0.4 + 0.6 * Math.sin(a * 2) ** 2); }
    });
  }

  // ---- palettes ----------------------------------------------------------------------------------------------
  const TONE = {
    base: [26, 20, 70], glaze: [24, 14, 60], outline: "#1a0f2c",
    skyS: stopsOf([[0, "#1a1650"], [0.3, "#3d2a84"], [0.55, "#a63f86"], [0.8, "#ef7a52"], [1, "#ffc470"]]),
    sunS: stopsOf([[0, "#f47b2c"], [0.5, "#ffc33d"], [1, "#fff1b3"]]), cloud: hexRGB("#f1a6c0"), beam: hexRGB("#fff3c4"), haze: hexRGB("#ffd49a"),
    seaS: stopsOf([[0, "#2a8d9e"], [0.45, "#1d5f8d"], [1, "#16285e"]]), foam: hexRGB("#d6efe8"),
    hillS: stopsOf([[0, "#112a1d"], [0.5, "#24533a"], [1, "#3d7a48"]]), reed: hexRGB("#244d33"), reedHi: hexRGB("#8fb858"),
    hull: hexRGB("#7a3a2a"), sail: hexRGB("#fbe9c4"), rock: hexRGB("#3a3a5a"), stripe: hexRGB("#d6452f"), gull: hexRGB("#f8f1e0"),
    slab: [hexRGB("#f7e8c0"), hexRGB("#f1d9a0"), hexRGB("#fff3d6"), hexRGB("#f6c7a0")], slabInk: hexRGB("#22101e"),
    bars: [hexRGB("#6f8bd8"), hexRGB("#39b0b4"), hexRGB("#e5ae45"), hexRGB("#b87ad0")],
    device: [hexRGB("#4a4fa0"), hexRGB("#5d63b8"), hexRGB("#3b3f86")],
    skin: [hexRGB("#f0c098"), hexRGB("#c98a66"), hexRGB("#f6d2b0"), hexRGB("#a06a4e")],
    cloth: [hexRGB("#3fa6a3"), hexRGB("#8a63c9"), hexRGB("#5f8ae0"), hexRGB("#e0a63f"), hexRGB("#4ea870"), hexRGB("#d86a9a")],
    plank: [hexRGB("#b27a4a"), hexRGB("#9a653c"), hexRGB("#c48b5a")], lid: hexRGB("#d4a843"),
  };
  const withTone = (o) => ({ ...TONE, ...o });
  const LIGHT = withTone({
    base: [150, 190, 220], glaze: [34, 70, 120], outline: "#18385e",
    skyS: stopsOf([[0, "#5fa6e0"], [0.4, "#8dc6ee"], [0.75, "#f6d6c0"], [1, "#ffe6b0"]]),
    sunS: stopsOf([[0, "#ffb347"], [0.5, "#ffe27a"], [1, "#fffbe0"]]), cloud: hexRGB("#fff2ee"), beam: hexRGB("#fffbe0"), haze: hexRGB("#fff0d0"),
    seaS: stopsOf([[0, "#52c0c0"], [0.5, "#2a8ab5"], [1, "#1c4f8a"]]), foam: hexRGB("#f0fbf6"),
    hillS: stopsOf([[0, "#1e5a38"], [0.5, "#3b8a4c"], [1, "#6fb45a"]]), reed: hexRGB("#2f7a45"), reedHi: hexRGB("#c3e070"),
  });
  const DARK = withTone({
    base: [8, 10, 34], glaze: [6, 8, 28], outline: "#05061a",
    skyS: stopsOf([[0, "#050722"], [0.45, "#101a52"], [0.8, "#2a3a8a"], [1, "#6a7cc0"]]),
    sunS: stopsOf([[0, "#9db4e8"], [0.5, "#dce8ff"], [1, "#ffffff"]]), cloud: hexRGB("#4a5aa8"), beam: hexRGB("#e8f0ff"), haze: hexRGB("#6a7cc0"),
    seaS: stopsOf([[0, "#25508a"], [0.5, "#12307a"], [1, "#080f3c"]]), foam: hexRGB("#a8c4f0"),
    hillS: stopsOf([[0, "#06140e"], [0.5, "#0f2e20"], [1, "#1c4a30"]]), reed: hexRGB("#12301f"), reedHi: hexRGB("#4a8a58"), gull: hexRGB("#d8e4ff"),
    slab: [hexRGB("#dfe6f6"), hexRGB("#c9d4ee"), hexRGB("#f2f6ff")], slabInk: hexRGB("#0a0e24"),
  });
  const MONO = withTone({
    mono: true,
    base: [30, 30, 30], glaze: [14, 14, 14], outline: "#0c0c0c",
    skyS: stopsOf([[0, "#161616"], [0.5, "#3c3c3c"], [0.85, "#8a8a8a"], [1, "#cfcfcf"]]),
    sunS: stopsOf([[0, "#b0b0b0"], [0.5, "#e6e6e6"], [1, "#ffffff"]]), cloud: hexRGB("#7a7a7a"), beam: hexRGB("#f4f4f4"), haze: hexRGB("#c4c4c4"),
    seaS: stopsOf([[0, "#6a6a6a"], [0.5, "#3a3a3a"], [1, "#1a1a1a"]]), foam: hexRGB("#e0e0e0"),
    hillS: stopsOf([[0, "#101010"], [0.5, "#262626"], [1, "#444444"]]), reed: hexRGB("#262626"), reedHi: hexRGB("#8a8a8a"),
    hull: hexRGB("#3a3a3a"), sail: hexRGB("#efefef"), rock: hexRGB("#3a3a3a"), stripe: hexRGB("#6a6a6a"), gull: hexRGB("#f2f2f2"),
    slab: [hexRGB("#efefef"), hexRGB("#dcdcdc"), hexRGB("#f8f8f8")], slabInk: hexRGB("#181818"),
    bars: [hexRGB("#8a8a8a"), hexRGB("#b4b4b4"), hexRGB("#6a6a6a"), hexRGB("#9a9a9a")], device: [hexRGB("#555555"), hexRGB("#6a6a6a"), hexRGB("#444444")],
    skin: [hexRGB("#d8d8d8"), hexRGB("#a0a0a0"), hexRGB("#e8e8e8"), hexRGB("#808080")], cloth: [hexRGB("#6a6a6a"), hexRGB("#9a9a9a"), hexRGB("#4a4a4a"), hexRGB("#b4b4b4")],
    plank: [hexRGB("#8a8a8a"), hexRGB("#707070"), hexRGB("#9c9c9c")], lid: hexRGB("#c0c0c0"),
  });

  const halo = (ol) => () => `0 0.05em 0 ${ol}, 0 0 0.35em rgba(10,6,30,0.55)`;
  return {
    bg: "#1a1446", panel: "rgba(255,246,220,0.1)", ink: "#fff3d2", muted: "#f0c99a", accent: "#ff6a3d", onAccent: "#fff6dc",
    rule: "rgba(255,246,220,0.7)", track: "rgba(255,246,220,0.14)",
    display: SERIF, displayWeight: 800, displayTracking: "0.005em", body: SERIF, bodyWeight: 700, figures: SERIF, radius: 20,
    motion: "wipe", change: "grid", kit: { line: 5, fill: "solid", panel: "fill" },
    panelEdge: "rgba(255,246,220,0.5)",
    tone: TONE, keepArt: true, overlap: true,
    palettes: {
      light: { bg: "#bcd8ee", ink: "#fffaf0", muted: "#2a4a7a", accent: "#e8452a", tone: LIGHT, textShadow: halo("#18385e") },
      dark: { bg: "#080b26", ink: "#e9f0ff", muted: "#9db4e8", accent: "#ff8a5c", tone: DARK, textShadow: halo("#05061a") },
      mono: { bg: "#202020", ink: "#f4f4f4", muted: "#bdbdbd", accent: "#ffffff", onAccent: "#101010", tone: MONO, textShadow: halo("#0c0c0c") },
    },
    // Headlines are lettered in dragged paint: the fill is a horizontal brush drag with bristle grooves
    // (stretched noise in a lighter and a darker tone over the ink), a lit ridge along the top edge of
    // each letter, a thick dark rim built up around it and a small cast shadow under the ridge.
    css: (accent, look) => {
      const ink = hexRGB(look.ink), ol = look.tone.outline;
      const dark = mix(ink, DEEP, 0.34), lite = mix(ink, [255, 255, 255], 0.7);
      const f = (v) => (v / 255).toFixed(3);
      const streak = (c, a, b, seed) => "url(\"data:image/svg+xml," + encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='720' height='120'><filter id='g' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.0035 0.34' numOctaves='3' seed='${seed}' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 ${f(c[0])}  0 0 0 0 ${f(c[1])}  0 0 0 0 ${f(c[2])}  ${a} 0 0 0 ${b}'/></filter><rect width='100%' height='100%' filter='url(#g)'/></svg>`) + "\")";
      const fill = [
        "linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 38%, rgba(0,0,0,0) 62%, rgba(20,10,40,0.2) 100%)",
        streak(dark, 5, -2.55, 7), streak(lite, -5, 2.3, 3),
        `linear-gradient(${rgb(ink)}, ${rgb(ink)})`,
      ].join(", ");
      const rim = (w) => `drop-shadow(${w}em 0 0 ${ol}) drop-shadow(-${w}em 0 0 ${ol}) drop-shadow(0 ${w}em 0 ${ol}) drop-shadow(0 -${w}em 0 ${ol})`;
      return `
      .display { text-wrap: balance; text-shadow: none; color: transparent; -webkit-text-fill-color: transparent;
        background-image: ${fill}; background-size: 100% 100%, 7.5em 1.25em, 6.2em 1.1em, 100% 100%; background-repeat: no-repeat, repeat, repeat, no-repeat;
        -webkit-background-clip: text; background-clip: text; padding: 0 0.06em;
        filter: drop-shadow(-0.012em -0.03em 0 rgba(255,250,232,0.95)) ${rim(0.034)} ${rim(0.022)} drop-shadow(0.05em 0.07em 0 rgba(8,5,26,0.6)); }
      .kicker { text-shadow: none; color: #fff6dc; scale: 1.55; transform-origin: 0 100%; letter-spacing: 0.1em;
        filter: drop-shadow(0 -0.03em 0 rgba(255,250,232,0.8)) ${rim(0.05)} ${rim(0.035)} drop-shadow(0.05em 0.07em 0 rgba(8,5,26,0.55)); }
    `;
    },
    textShadow: halo("#1a0f2c"),
    backdrop: () => "#1a1446",
    paint: (ctx, W, H) => { ctx.clearRect(0, 0, W, H); },
    stage,
    scenes: { title: wrap(null, "title"), chart: wrap(chart, "chart-title"), object: wrap(object, "object-title"), people: wrap(people, "people-title"), process: wrap(process, "process-title"), compare: wrap(compare, "compare-title"), closing: wrap(null, "closing") },
  };
});
