// Star Chart: an engraved celestial atlas. A fbm nebula band with dust lanes drifts under a rotating
// celestial sphere (degree ring, graticule, ecliptic, invented constellations). Scenes are drawn as
// chart plates: bars become stars on stems, devices become observatory plates, people become
// constellations, steps are bodies on an orbit, comparisons are engraved dials. The sphere acts as the
// camera: it slides to a new station each scene while parallax stars, marginal degree scales and
// shooting stars keep moving. Every frame is a pure function of time: seeded noise only, no clocks.
window.DreamcutMotion.register("star-chart", ({ rng }) => {
  const M = window.DreamcutMotion;
  const TAU = Math.PI * 2, RAD = Math.PI / 180;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const mod = (a, n) => ((a % n) + n) % n;

  // ---- colour ---------------------------------------------------------------------------------
  function rgb(value) {
    const s = String(value || "");
    if (s[0] === "#") {
      const h = s.length === 4 ? s.slice(1).split("").map((c) => c + c).join("") : s.slice(1, 7);
      const n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (m) return m[1].split(",").slice(0, 3).map(Number);
    return [220, 200, 150];
  }
  const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a, 0, 1)})`;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  const WHITE = [255, 255, 255];

  function themeFrom(look, accent, u) {
    const light = lum(rgb(look.bg)) > 150;
    return {
      light, u, tex: look.texture ?? 1,
      gold: rgb(accent), cyan: rgb(look.cyan), warn: rgb(look.warn), ink: rgb(look.ink), bg: rgb(look.bg),
      star: rgb(look.starCol), neb: look.neb.map(rgb), face: look.body,
      halo: light ? "rgba(240,229,204,0.92)" : "rgba(3,4,22,0.86)",
      inkS: look.ink, mutedS: look.muted, lab: look.display, num: look.figures,
    };
  }

  // ---- buffers, noise ---------------------------------------------------------------------------
  const BUF = {};
  function buf(key, w, h) {
    let c = BUF[key];
    if (!c) c = BUF[key] = document.createElement("canvas");
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return c;
  }
  function h2(x, y, s) {
    let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    n ^= n >>> 16;
    return (n >>> 0) / 4294967296;
  }
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = xf * xf * (3 - 2 * xf), b = yf * yf * (3 - 2 * yf);
    const v00 = h2(xi, yi, s), v10 = h2(xi + 1, yi, s), v01 = h2(xi, yi + 1, s), v11 = h2(xi + 1, yi + 1, s);
    return lerp(lerp(v00, v10, a), lerp(v01, v11, a), b);
  }
  function fbm(x, y, s, oct) {
    let a = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { a += amp * vnoise(x * f + i * 17.3, y * f - i * 9.1, s + i); norm += amp; f *= 2.03; amp *= 0.5; }
    return a / norm;
  }

  // ---- the nebula: a diagonal galactic band with dust lanes, warped slowly by time ---------------
  let NEB_IMG = null;
  function nebula(ctx, W, H, t, th) {
    const gw = Math.round(120 + 90 * th.tex), gh = Math.max(20, Math.round(gw * H / W));
    const c = buf("neb", gw, gh), g = c.getContext("2d");
    if (!NEB_IMG || NEB_IMG.width !== gw || NEB_IMG.height !== gh) NEB_IMG = g.createImageData(gw, gh);
    const data = NEB_IMG.data, asp = W / H;
    const [c0, c1, c2] = th.neb, warm = mix(th.gold, WHITE, 0.25);
    const tall = H > W;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        let nx = (x / gw - 0.5) * (tall ? 1 : asp) * 2.2, ny = (y / gh - 0.5) * (tall ? 1 / asp : 1) * 2.2;
        if (tall) { nx *= 1; }
        const w1 = fbm(nx * 1.3 + t * 0.016, ny * 1.3 - t * 0.011, 3, 3), w2 = fbm(nx * 1.3 - t * 0.013 + 7.3, ny * 1.3 + t * 0.015 + 2.1, 5, 3);
        const px = nx + (w1 - 0.5) * 1.15, py = ny + (w2 - 0.5) * 1.15;
        const dist = (py + (tall ? -0.9 : 0.55) * px - 0.06) / 1.15;
        const band = Math.exp(-(dist * dist) / 0.11);
        const d = fbm(px * 1.7, py * 1.7, 11, 5);
        const amb = smooth(0.46, 0.86, fbm(px * 0.8 + 3, py * 0.8, 21, 3)) * 0.34;
        let dens = band * smooth(0.28, 0.82, d) * 1.55 + amb;
        const dust = smooth(0.5, 0.74, fbm(px * 3.2 + 4, py * 3.2, 31, 4)) * (0.35 + band);
        dens *= 1 - 0.78 * clamp(dust);
        const hue = smooth(0.3, 0.7, fbm(px * 0.9 + 2, py * 0.9 - 3, 41, 2));
        let col = mix(c0, c1, hue);
        col = mix(col, c2, smooth(0.52, 0.8, fbm(px * 1.1 - 5, py * 1.1 + 1, 51, 2)) * 0.85);
        const core = band * smooth(0.62, 0.92, d);
        col = mix(col, warm, core * 0.42);
        const i = (y * gw + x) * 4;
        data[i] = col[0]; data[i + 1] = col[1]; data[i + 2] = col[2];
        data[i + 3] = clamp(dens * (th.light ? 0.5 : 0.92)) * 255;
      }
    }
    g.putImageData(NEB_IMG, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(c, 0, 0, W, H);
    ctx.restore();
  }

  // Fixed faint star dust (seeded), denser along the band; twinkles with time.
  let DUST = null, DUST_KEY = "";
  function dustStars(ctx, W, H, t, th) {
    const key = W + "x" + H;
    if (key !== DUST_KEY) {
      const r = rng(77); DUST = [];
      for (let i = 0; i < 520; i++) {
        let x = r(), y = r();
        if (r() < 0.5) { const s = r(); x = s; y = clamp((H > W ? 0.9 - 0.9 * s : 0.9 - 0.55 * s * (W / H) * 0.6) + (r() - 0.5) * 0.3); }
        DUST.push({ x, y, s: 0.4 + r() * r() * 1.5, ph: r() * TAU, f: 0.5 + r() * 2.2, a: 0.25 + r() * 0.6, k: r() });
      }
      DUST_KEY = key;
    }
    const u = Math.min(W, H) / 1080;
    const n = Math.round(DUST.length * (0.25 + 0.75 * th.tex));
    for (let i = 0; i < n; i++) {
      const s = DUST[i];
      const tw = 0.65 + 0.35 * Math.sin(t * s.f + s.ph);
      const col = s.k < 0.18 ? th.gold : s.k < 0.34 ? th.cyan : th.star;
      ctx.fillStyle = rgba(col, s.a * tw * (th.light ? 0.7 : 1));
      ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.s * u, 0, TAU); ctx.fill();
    }
  }

  // ---- primitives -------------------------------------------------------------------------------
  function glow(ctx, th, x, y, r, col, a = 1) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(mix(col, WHITE, th.light ? 0.15 : 0.6), a));
    g.addColorStop(0.28, rgba(col, 0.5 * a));
    g.addColorStop(1, rgba(col, 0));
    ctx.save();
    if (!th.light) ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }
  // A four-point engraver's star with a soft halo.
  function spark(ctx, th, x, y, r, col, o = {}) {
    const a = o.a ?? 1, rot = o.rot ?? 0, spikes = o.spikes ?? 4;
    if (a <= 0.01 || r <= 0.3) return;
    if (!o.noGlow) glow(ctx, th, x, y, r * 2.6, col, a * 0.85);
    ctx.save();
    ctx.fillStyle = rgba(th.light ? col : mix(col, WHITE, 0.7), a);
    ctx.beginPath();
    for (let k = 0; k < spikes; k++) {
      const ang = rot + (k * TAU) / spikes, long = r * (k % 2 ? 1.05 : 1.95), w = r * 0.15;
      ctx.moveTo(x + Math.cos(ang) * long, y + Math.sin(ang) * long);
      ctx.lineTo(x + Math.cos(ang + 1.5708) * w, y + Math.sin(ang + 1.5708) * w);
      ctx.lineTo(x + Math.cos(ang - 1.5708) * w, y + Math.sin(ang - 1.5708) * w);
      ctx.closePath();
    }
    ctx.fill();
    ctx.fillStyle = rgba(th.light ? mix(col, th.bg, 0.3) : WHITE, a);
    ctx.beginPath(); ctx.arc(x, y, r * 0.24, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function pathLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
  function pathPartial(ctx, pts, f) {
    const total = pathLen(pts), target = total * clamp(f);
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const seglen = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (acc + seglen <= target) { ctx.lineTo(pts[i][0], pts[i][1]); acc += seglen; }
      else { const k = seglen ? (target - acc) / seglen : 0; ctx.lineTo(lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k)); break; }
    }
  }
  function pointAt(pts, f) {
    const total = pathLen(pts), target = total * clamp(f);
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const seglen = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (acc + seglen >= target || i === pts.length - 1) {
        const k = seglen ? clamp((target - acc) / seglen) : 0;
        return [lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k), Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0])];
      }
      acc += seglen;
    }
    return [pts[0][0], pts[0][1], 0];
  }
  function catmull(pts, per = 18) {
    const out = [], n = pts.length;
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
      for (let s = 0; s < per; s++) {
        const t = s / per, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
      }
    }
    out.push(pts[n - 1]);
    return out;
  }
  // A moving light on a path: a bright head and a fading tail.
  function runner(ctx, th, pts, f, col, u, tail = 0.12, size = 7) {
    const head = pointAt(pts, f);
    for (let k = 10; k >= 1; k--) {
      const q = pointAt(pts, mod(f - (tail * k) / 10, 1));
      if (mod(f - (tail * k) / 10, 1) > f && f < tail) continue;
      ctx.fillStyle = rgba(col, 0.5 * (1 - k / 11));
      ctx.beginPath(); ctx.arc(q[0], q[1], size * u * (1 - k / 14), 0, TAU); ctx.fill();
    }
    glow(ctx, th, head[0], head[1], size * u * 4, col, 1);
    ctx.fillStyle = rgba(th.light ? col : WHITE, 1);
    ctx.beginPath(); ctx.arc(head[0], head[1], size * u * 0.5, 0, TAU); ctx.fill();
  }
  function dashed(ctx, a, b, off = 0) { ctx.setLineDash([a, b]); ctx.lineDashOffset = off; ctx.lineCap = "round"; }
  function undash(ctx) { ctx.setLineDash([]); ctx.lineDashOffset = 0; }

  // Engraved degree dial: two rules, ticks and (optionally) numerals, rotated by `rot` degrees.
  function degreeRing(ctx, th, cx, cy, R, rot, o = {}) {
    const u = th.u, a = o.a ?? 1, col = o.col || th.gold, step = o.step ?? 5;
    ctx.save();
    ctx.strokeStyle = rgba(col, 0.9 * a); ctx.lineWidth = (o.w ?? 2) * u;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
    ctx.strokeStyle = rgba(col, 0.45 * a); ctx.lineWidth = 1 * u;
    ctx.beginPath(); ctx.arc(cx, cy, R - (o.gap ?? 16) * u, 0, TAU); ctx.stroke();
    const minor = (o.minor ?? 7) * u, major = (o.major ?? 15) * u;
    ctx.beginPath();
    for (let d = 0; d < 360; d += step) {
      const ang = (d + rot) * RAD, isMajor = d % 30 === 0, len = isMajor ? major : minor;
      const c = Math.cos(ang), s = Math.sin(ang);
      ctx.moveTo(cx + c * R, cy + s * R); ctx.lineTo(cx + c * (R - len), cy + s * (R - len));
    }
    ctx.strokeStyle = rgba(col, 0.75 * a); ctx.lineWidth = 1.2 * u; ctx.stroke();
    if (o.nums) {
      ctx.fillStyle = rgba(col, 0.85 * a); ctx.font = `italic 600 ${(o.numSize ?? 22) * u}px ${th.face}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (let d = 0; d < 360; d += 30) {
        const ang = (d + rot) * RAD, rr = R + (o.numOut ?? 22) * u;
        // Numerals on the lower half turn over so they always read upright, as on a printed chart.
        let ra = mod(ang + Math.PI / 2, TAU); if (ra > Math.PI / 2 && ra < Math.PI * 1.5) ra += Math.PI;
        ctx.save(); ctx.translate(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr); ctx.rotate(ra);
        ctx.fillText(String(d) + "°", 0, 0); ctx.restore();
      }
    }
    ctx.restore();
  }

  // Small-caps engraved label. Returns the drawn width.
  function sc(ctx, th, str, x, y, size, o = {}) {
    ctx.save();
    const text = o.raw ? String(str) : String(str).toUpperCase();
    ctx.font = `${o.italic ? "italic " : ""}${o.weight ?? 700} ${size}px ${o.face || (o.italic ? th.face : th.lab)}`;
    const ls = (o.ls ?? 0.12) * size;
    ctx.letterSpacing = ls + "px";
    const w = ctx.measureText(text).width - ls;
    const align = o.align || "left";
    ctx.textAlign = "left"; ctx.textBaseline = o.base || "alphabetic";
    const x0 = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.globalAlpha *= o.a ?? 1;
    if (o.halo !== false) { ctx.lineJoin = "round"; ctx.lineWidth = size * 0.28; ctx.strokeStyle = th.halo; ctx.strokeText(text, x0, y); }
    ctx.fillStyle = o.color || th.inkS;
    if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = size * 0.5; }
    ctx.fillText(text, x0, y);
    ctx.restore();
    return w;
  }
  function measure(ctx, th, str, size, o = {}) {
    ctx.save();
    ctx.font = `${o.italic ? "italic " : ""}${o.weight ?? 700} ${size}px ${o.face || (o.italic ? th.face : th.lab)}`;
    const ls = (o.ls ?? 0.12) * size; ctx.letterSpacing = ls + "px";
    const w = ctx.measureText(o.raw ? str : String(str).toUpperCase()).width - ls;
    ctx.restore();
    return w;
  }
  // Fit a label to a width: shrink to the minimum, then break on a space into two lines.
  function fitLines(ctx, th, str, size, min, maxW, o = {}) {
    let z = size;
    while (z > min && measure(ctx, th, str, z, o) > maxW) z = Math.max(min, z * 0.94);
    if (measure(ctx, th, str, z, o) <= maxW || !str.includes(" ")) return { lines: [str], size: z };
    const words = str.split(" ");
    let best = null;
    for (let k = 1; k < words.length; k++) {
      const a = words.slice(0, k).join(" "), b = words.slice(k).join(" ");
      const worst = Math.max(measure(ctx, th, a, z, o), measure(ctx, th, b, z, o));
      if (!best || worst < best.worst) best = { lines: [a, b], worst };
    }
    return { lines: best.lines, size: z };
  }
  function numText(ctx, th, str, x, y, size, color, align = "center", maxW = 0) {
    ctx.save();
    let z = size;
    ctx.font = `700 ${z}px ${th.num}`;
    if (maxW) while (z > size * 0.55 && ctx.measureText(str).width > maxW) { z *= 0.94; ctx.font = `700 ${z}px ${th.num}`; }
    ctx.textAlign = align; ctx.textBaseline = "alphabetic";
    ctx.lineJoin = "round"; ctx.lineWidth = z * 0.14; ctx.strokeStyle = th.halo; ctx.strokeText(str, x, y);
    ctx.fillStyle = color; ctx.shadowColor = rgba(th.light ? th.ink : th.gold, 0.45); ctx.shadowBlur = z * 0.25;
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  // ---- the celestial sphere ---------------------------------------------------------------------
  function sproj(lon, lat, rot, tilt) {
    const lo = (lon + rot) * RAD, la = lat * RAD;
    const x = Math.cos(la) * Math.sin(lo), y = Math.sin(la), z = Math.cos(la) * Math.cos(lo);
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    return [x, -(y * ct - z * st), y * st + z * ct];
  }
  function strokeCurve(ctx, pts, cx, cy, R, colFront, colBack, wF, wB) {
    for (const front of [false, true]) {
      ctx.beginPath();
      let pen = false;
      for (const q of pts) {
        const ok = front ? q[2] >= 0 : q[2] < 0;
        if (ok) { const X = cx + q[0] * R, Y = cy + q[1] * R; if (pen) ctx.lineTo(X, Y); else { ctx.moveTo(X, Y); pen = true; } }
        else pen = false;
      }
      ctx.strokeStyle = front ? colFront : colBack; ctx.lineWidth = front ? wF : wB; ctx.stroke();
    }
  }
  const CONS = [
    { name: "The Lantern", lon: 10, lat: 34, pts: [[0, 6], [14, 18], [30, 12], [22, -6], [6, -10], [14, -24]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [3, 5], [4, 5]] },
    { name: "The Loom", lon: 78, lat: 8, pts: [[0, 8], [12, -6], [24, 10], [36, -4], [48, 12], [30, -22]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [3, 5], [1, 5]] },
    { name: "The Key", lon: 145, lat: -18, pts: [[0, 0], [12, 10], [24, 0], [12, -10], [12, -28], [22, -28], [22, -20]], edges: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [4, 6]] },
    { name: "The Weir", lon: 215, lat: 26, pts: [[0, 0], [10, 14], [22, 2], [34, 16], [46, 4]], edges: [[0, 1], [1, 2], [2, 3], [3, 4]] },
    { name: "The Swift", lon: 285, lat: -6, pts: [[0, 10], [14, 2], [28, 8], [40, -8], [20, -14], [8, -4]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 5]] },
  ];
  function sphere(ctx, th, cx, cy, R, rot, tilt, alpha, t, quiet = 1) {
    const u = th.u, gold = th.gold;
    const fa = (th.light ? 0.5 : 0.62) * alpha;
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    // Disc wash: a hint of depth inside the globe.
    const wash = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
    wash.addColorStop(0, rgba(th.cyan, 0.07 * alpha)); wash.addColorStop(1, rgba(th.cyan, 0));
    ctx.fillStyle = wash; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    // Meridians and parallels.
    for (let lon = 0; lon < 360; lon += 20) {
      const pts = []; for (let lat = -90; lat <= 90; lat += 6) pts.push(sproj(lon, lat, rot, tilt));
      strokeCurve(ctx, pts, cx, cy, R, rgba(gold, 0.3 * fa), rgba(gold, 0.07 * fa), 1.1 * u, 0.8 * u);
    }
    for (let lat = -70; lat <= 70; lat += 20) {
      const pts = []; for (let lon = 0; lon <= 360; lon += 6) pts.push(sproj(lon, lat, rot, tilt));
      strokeCurve(ctx, pts, cx, cy, R, rgba(gold, (lat === 0 ? 0.6 : 0.3) * fa), rgba(gold, 0.07 * fa), (lat === 0 ? 2 : 1.1) * u, 0.8 * u);
    }
    const eq = []; for (let lon = 0; lon <= 360; lon += 4) eq.push(sproj(lon, 0, rot, tilt));
    strokeCurve(ctx, eq, cx, cy, R, rgba(gold, 0.7 * fa), rgba(gold, 0.12 * fa), 2.4 * u, 1 * u);
    // Ecliptic: dotted cyan, inclined.
    const ec = [];
    for (let a = 0; a <= 360; a += 3) { const lat = Math.atan(Math.tan(23.4 * RAD) * Math.sin(a * RAD)) / RAD; ec.push(sproj(a, lat, rot, tilt)); }
    dashed(ctx, 2 * u, 10 * u, -t * 8 * u);
    strokeCurve(ctx, ec, cx, cy, R, rgba(th.cyan, 0.8 * fa), rgba(th.cyan, 0.15 * fa), 2.4 * u, 1.2 * u);
    undash(ctx);
    // Constellations riding the sphere.
    for (const con of CONS) {
      const P = con.pts.map((p) => sproj(con.lon + p[0], con.lat + p[1], rot, tilt));
      const vis = P.map((q) => smooth(0.05, 0.4, q[2]));
      ctx.lineWidth = 1.6 * u;
      for (const [a, b] of con.edges) {
        const v = Math.min(vis[a], vis[b]); if (v <= 0.02) continue;
        ctx.strokeStyle = rgba(th.cyan, (0.3 + 0.25 * quiet) * alpha * v); ctx.beginPath();
        ctx.moveTo(cx + P[a][0] * R, cy + P[a][1] * R); ctx.lineTo(cx + P[b][0] * R, cy + P[b][1] * R); ctx.stroke();
      }
      P.forEach((q, i) => {
        if (vis[i] <= 0.02) return;
        const tw = 0.75 + 0.25 * Math.sin(t * 2.1 + i * 1.9 + con.lon);
        spark(ctx, th, cx + q[0] * R, cy + q[1] * R, (5 + (i % 3) * 2.2) * u * tw, i % 2 ? th.gold : th.star, { a: alpha * vis[i] * (0.55 + 0.45 * quiet), rot: t * 0.3 + i, noGlow: vis[i] < 0.5 || quiet < 0.5 });
      });
      const mid = sproj(con.lon + 20, con.lat - 18, rot, tilt), mv = smooth(0.25, 0.6, mid[2]) * quiet;
      if (mv > 0.02) sc(ctx, th, con.name, cx + mid[0] * R, cy + mid[1] * R + 44 * u, 34 * u, { align: "center", italic: true, raw: true, weight: 600, color: rgba(mix(th.gold, WHITE, 0.25), 1), a: alpha * mv, ls: 0.03 });
    }
    // Outer degree ring and a counter-rotating inner one.
    degreeRing(ctx, th, cx, cy, R * 1.06, -rot * 0.6, { a: 0.62 * alpha, step: 2, minor: 7, major: 16, gap: 22, nums: true, numSize: 22, numOut: 24 });
    degreeRing(ctx, th, cx, cy, R * 1.17, rot * 0.35, { a: 0.3 * alpha, step: 5, minor: 5, major: 9, gap: 10, w: 1.2 });
    ctx.restore();
  }

  // ---- armillary: gold rings in 3D around a living core ------------------------------------------
  function rot3(p, ax, ay) {
    let [x, y, z] = p;
    let c = Math.cos(ax), s = Math.sin(ax); [y, z] = [y * c - z * s, y * s + z * c];
    c = Math.cos(ay); s = Math.sin(ay); [x, z] = [x * c + z * s, -x * s + z * c];
    return [x, y, z];
  }
  function armillary(ctx, th, cx, cy, R, t, alpha, build) {
    const u = th.u, spin = t * 0.32 + (1 - build) * 2.2, tilt = -0.42 + 0.05 * Math.sin(t * 0.4);
    const place = (p) => { const q = rot3(p, tilt, spin); const k = 1 + q[2] / (R * 7); return [cx + q[0] * k, cy + q[1] * k, q[2]]; };
    const rings = [
      { r: 1.0, ax: 90 + 23.4, ay: 0, col: th.cyan, w: 4, ticks: 5 },
      { r: 0.94, ax: 90, ay: 0, col: th.gold, w: 6, ticks: 5 },
      { r: 0.9, ax: 0, ay: 0, col: th.gold, w: 4, ticks: 0 },
      { r: 0.9, ax: 0, ay: 90, col: th.gold, w: 4, ticks: 0 },
      { r: 0.66, ax: 90, ay: 0, col: th.gold, w: 2.5, ticks: 0, dash: true },
    ];
    const bodies = [
      { r: 0.66, ax: 90, ay: 0, sp: 0.9, ph: 0.5, size: 15, col: th.gold },
      { r: 0.44, ax: 60, ay: 20, sp: -1.5, ph: 2.3, size: 11, col: th.cyan },
      { r: 0.3, ax: 100, ay: 60, sp: 2.2, ph: 4.1, size: 8, col: th.warn },
    ];
    ctx.save(); ctx.globalAlpha *= alpha * build; ctx.lineCap = "round";
    const drawBodies = (front) => {
      for (const b of bodies) {
        const ang = t * b.sp + b.ph;
        const q0 = rot3([Math.cos(ang) * b.r * R, Math.sin(ang) * b.r * R, 0], b.ax * RAD, b.ay * RAD);
        const q = place(q0);
        if ((q[2] >= 0) !== front) continue;
        const s = (b.size + q[2] / R * 2) * u;
        const g = ctx.createRadialGradient(q[0] - s * 0.35, q[1] - s * 0.35, s * 0.1, q[0], q[1], s);
        g.addColorStop(0, rgba(mix(b.col, WHITE, 0.7), 1)); g.addColorStop(0.6, rgba(b.col, 1)); g.addColorStop(1, rgba(mix(b.col, [0, 0, 20], 0.7), 1));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q[0], q[1], s, 0, TAU); ctx.fill();
      }
    };
    // Orbit paths for the bodies.
    for (const b of bodies) {
      const pts = []; for (let a = 0; a <= 360; a += 5) pts.push(place(rot3([Math.cos(a * RAD) * b.r * R, Math.sin(a * RAD) * b.r * R, 0], b.ax * RAD, b.ay * RAD)));
      dashed(ctx, 2 * u, 9 * u, -t * 6 * u);
      strokeCurve(ctx, pts.map((q) => [(q[0] - cx) / R, (q[1] - cy) / R, q[2]]), cx, cy, R, rgba(b.col, 0.7), rgba(b.col, 0.2), 1.8 * u, 1.2 * u);
      undash(ctx);
    }
    drawBodies(false);
    // Axis rod.
    const top = place([0, -R * 1.12, 0]), bot = place([0, R * 1.12, 0]);
    ctx.strokeStyle = rgba(th.gold, 0.7); ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.lineTo(bot[0], bot[1]); ctx.stroke();
    spark(ctx, th, top[0], top[1], 9 * u, th.gold, { a: 0.9, rot: t });
    for (const ring of rings) {
      const pts = [];
      for (let a = 0; a <= 360; a += 3) pts.push(place(rot3([Math.cos(a * RAD) * ring.r * R, Math.sin(a * RAD) * ring.r * R, 0], ring.ax * RAD, ring.ay * RAD)));
      const norm = pts.map((q) => [(q[0] - cx) / R, (q[1] - cy) / R, q[2]]);
      if (ring.dash) dashed(ctx, 10 * u, 8 * u, -t * 9 * u);
      strokeCurve(ctx, norm, cx, cy, R, rgba(ring.col, 0.95), rgba(ring.col, 0.28), ring.w * u, ring.w * 0.55 * u);
      undash(ctx);
      if (!ring.dash) {
        const inner = pts.map((q) => [(q[0] - cx) / R * 0.965 , (q[1] - cy) / R * 0.965, q[2]]);
        strokeCurve(ctx, inner, cx, cy, R, rgba(mix(ring.col, WHITE, 0.4), 0.5), rgba(ring.col, 0.1), 1.2 * u, 0.8 * u);
      }
      if (ring.ticks) {
        ctx.strokeStyle = rgba(ring.col, 0.7); ctx.lineWidth = 1.4 * u; ctx.beginPath();
        for (let a = 0; a < 360; a += ring.ticks) {
          const l = a % 30 === 0 ? 0.045 : 0.022;
          const A = place(rot3([Math.cos(a * RAD) * ring.r * R, Math.sin(a * RAD) * ring.r * R, 0], ring.ax * RAD, ring.ay * RAD));
          const B = place(rot3([Math.cos(a * RAD) * ring.r * R * (1 + l), Math.sin(a * RAD) * ring.r * R * (1 + l), 0], ring.ax * RAD, ring.ay * RAD));
          if (A[2] > -R * 0.2) { ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
        }
        ctx.stroke();
      }
    }
    // Core: a star with rotating rays.
    glow(ctx, th, cx, cy, R * 0.5, th.gold, 0.55 + 0.1 * Math.sin(t * 2));
    spark(ctx, th, cx, cy, R * 0.12 * (1 + 0.06 * Math.sin(t * 2.6)), th.gold, { a: 1, rot: t * 0.5, spikes: 8, noGlow: true });
    drawBodies(true);
    ctx.restore();
  }

  // ---- stage layers -------------------------------------------------------------------------------
  const ANCH = {
    wide: { title: [0.79, 0.5, 0.46], chart: [0.2, 0.6, 0.56], object: [0.86, 0.34, 0.5], people: [0.5, 0.72, 0.76], process: [0.12, 0.3, 0.54], compare: [0.5, 0.38, 0.64], closing: [0.79, 0.5, 0.46] },
    tall: { title: [0.5, 0.8, 0.34], chart: [0.8, 0.22, 0.5], object: [0.2, 0.76, 0.52], people: [0.5, 0.3, 0.72], process: [0.84, 0.7, 0.56], compare: [0.2, 0.26, 0.58], closing: [0.5, 0.8, 0.34] },
  };
  function sceneList() {
    const ctl = (window.__dreamcut && window.__dreamcut.controls) || {};
    const order = ["title", "chart", "object", "people", "process", "compare", "closing"];
    const dflt = [2.4, 3.4, 3.6, 3.2, 3.6, 3.2, 2.4];
    return order.map((id, i) => ({ id, hold: Number(ctl[id + "_hold"] ?? dflt[i]) })).filter((s) => s.hold > 0);
  }
  function anchor(S, id) {
    const a = (S.tall ? ANCH.tall : ANCH.wide)[id] || [0.5, 0.5, 0.5];
    const base = S.tall ? S.W : S.H;
    return { x: a[0] * S.W, y: a[1] * S.H, r: a[2] * base };
  }
  // The sphere is the camera. A move between stations starts while the old scene inks out and lands
  // after the new one has begun, so the station index is a continuous number: nothing jumps at a cut.
  function camera(S, info) {
    const list = sceneList(), last = Math.max(0, list.length - 1);
    const idx = info.index < 0 ? last : info.index;
    const pre = Math.max(0.6, info.change || 0), post = pre * 1.6;
    let a = idx, b = idx, k = 0;
    if (info.index >= 0 && idx < last && info.local > info.hold - pre) { b = idx + 1; k = eio((info.local - (info.hold - pre)) / (pre + post)); }
    else if (info.index >= 0 && idx > 0 && info.local < post) { a = idx - 1; k = eio((info.local + pre) / (pre + post)); }
    const ida = (list[a] && list[a].id) || "chart", idb = (list[b] && list[b].id) || ida;
    const A = anchor(S, ida), B = anchor(S, idb), st = a + (b - a) * k, u = S.u;
    const statement = (id) => (id === "title" || id === "closing" ? 1 : 0);
    return {
      idx, a, b, k, ida, idb, st,
      cx: lerp(A.x, B.x, k), cy: lerp(A.y, B.y, k), R: lerp(A.r, B.r, k),
      quiet: lerp(statement(ida), statement(idb), smooth(0.2, 0.8, k)),
      x: st * 420 * u + info.t * 11 * u, y: Math.sin(info.t * 0.21) * 36 * u + st * 70 * u,
    };
  }

  function parallaxStars(ctx, S, th, t, cam) {
    const { W, H, u } = S;
    const layers = [{ n: 90, d: 0.08, s: 1.1 }, { n: 56, d: 0.2, s: 1.7 }, { n: 26, d: 0.42, s: 2.6 }];
    const scale = 0.3 + 0.7 * th.tex;
    layers.forEach((L, li) => {
      const r = rng(900 + li);
      const n = Math.round(L.n * scale);
      for (let i = 0; i < n; i++) {
        const fx = r(), fy = r(), ph = r() * TAU, f = 0.7 + r() * 2, kind = r(), sz = (0.55 + r() * 0.9) * L.s * u;
        const x = mod(fx * (W + 200 * u) - cam.x * L.d, W + 200 * u) - 100 * u;
        const y = mod(fy * (H + 200 * u) - cam.y * L.d * 1.5, H + 200 * u) - 100 * u;
        const tw = 0.6 + 0.4 * Math.sin(t * f + ph);
        const col = kind < 0.2 ? th.gold : kind < 0.35 ? th.cyan : th.star;
        if (li === 2 && kind > 0.55) spark(ctx, th, x, y, sz * 2.2, col, { a: tw * 0.9, rot: 0.3 + t * 0.1, noGlow: kind > 0.8 });
        else { ctx.fillStyle = rgba(col, (th.light ? 0.6 : 0.85) * tw); ctx.beginPath(); ctx.arc(x, y, sz, 0, TAU); ctx.fill(); }
      }
    });
  }

  function comets(ctx, S, th, t) {
    const { W, H, u } = S, P = 2.6;
    for (let k = Math.floor(t / P) - 1; k <= Math.floor(t / P); k++) {
      const r = rng(4000 + k * 31);
      const start = k * P + r() * 1.3, dur = 0.85 + r() * 0.4, s = (t - start) / dur;
      if (s <= 0 || s >= 1) continue;
      const x0 = W * (0.3 + 0.7 * r()), y0 = H * 0.5 * r() - 40 * u, ang = (18 + r() * 22) * RAD + Math.PI * 0.0;
      const dirx = -Math.cos(ang), diry = Math.sin(ang), len = (H * 0.5 + 300 * u) * eo(s) * 1.0;
      const hx = x0 + dirx * len, hy = y0 + diry * len, tail = 330 * u * Math.sin(s * Math.PI) + 40 * u;
      const g = ctx.createLinearGradient(hx, hy, hx - dirx * tail, hy - diry * tail);
      const col = r() < 0.5 ? th.gold : th.cyan;
      g.addColorStop(0, rgba(th.light ? col : WHITE, 0.95)); g.addColorStop(0.3, rgba(col, 0.5)); g.addColorStop(1, rgba(col, 0));
      ctx.save(); ctx.strokeStyle = g; ctx.lineWidth = 3.2 * u; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - dirx * tail, hy - diry * tail); ctx.stroke();
      ctx.restore();
      glow(ctx, th, hx, hy, 24 * u, col, 1);
    }
  }

  function motes(ctx, S, th, t) {
    const { W, H, u } = S, r = rng(31337), n = Math.round(30 * (0.3 + 0.7 * th.tex));
    for (let i = 0; i < n; i++) {
      const x0 = r() * W, y0 = r() * H, sp = (6 + r() * 14) * u, ph = r() * TAU, sz = (1.2 + r() * 2.2) * u, sway = (10 + r() * 30) * u;
      const y = mod(y0 - t * sp, H + 40 * u) - 20 * u, x = x0 + Math.sin(t * 0.4 + ph) * sway;
      const a = (0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.3 + ph))) * (th.light ? 0.7 : 1);
      glow(ctx, th, x, y, sz * 5, th.gold, a * 0.6);
    }
  }

  // Neatline with a scrolling degree scale (the margins track the camera).
  function neatline(ctx, S, th, cam) {
    const { W, H, u } = S, m = 30 * u, m2 = m + 14 * u;
    ctx.save();
    ctx.strokeStyle = rgba(th.gold, 0.7); ctx.lineWidth = 2.2 * u; ctx.strokeRect(m, m, W - 2 * m, H - 2 * m);
    ctx.strokeStyle = rgba(th.gold, 0.35); ctx.lineWidth = 1 * u; ctx.strokeRect(m2, m2, W - 2 * m2, H - 2 * m2);
    ctx.beginPath(); ctx.rect(m, m, W - 2 * m, H - 2 * m); ctx.clip();
    const gap = 16 * u;
    ctx.strokeStyle = rgba(th.gold, 0.5); ctx.lineWidth = 1.1 * u;
    ctx.fillStyle = rgba(th.gold, 0.7); ctx.font = `italic 600 ${19 * u}px ${th.face}`; ctx.textBaseline = "alphabetic";
    // top and bottom scales run with cam.x
    const off = mod(cam.x * 0.5, gap * 5);
    const first = Math.floor((m - -off) / gap) - 1;
    ctx.beginPath();
    const k0 = Math.floor((cam.x * 0.5) / gap);
    for (let i = -2; i < Math.ceil(W / gap) + 3; i++) {
      const idx = i + k0, x = i * gap - mod(cam.x * 0.5, gap), major = idx % 5 === 0, len = (major ? 13 : 6) * u;
      ctx.moveTo(x, m); ctx.lineTo(x, m + len); ctx.moveTo(x, H - m); ctx.lineTo(x, H - m - len);
    }
    ctx.stroke();
    ctx.textAlign = "center";
    for (let i = -2; i < Math.ceil(W / gap) + 3; i++) {
      const idx = i + k0; if (idx % 10) continue;
      const x = i * gap - mod(cam.x * 0.5, gap);
      ctx.fillText(String(mod(idx / 10, 24)) + "h", x, m + 34 * u);
      ctx.fillText(String(mod(idx / 10 * 15, 360)) + "°", x, H - m - 20 * u);
    }
    const gy = 16 * u, ky = Math.floor((cam.y * 0.7) / gy);
    ctx.beginPath();
    for (let i = -2; i < Math.ceil(H / gy) + 3; i++) {
      const idx = i + ky, y = i * gy - mod(cam.y * 0.7, gy), major = idx % 5 === 0, len = (major ? 13 : 6) * u;
      ctx.moveTo(m, y); ctx.lineTo(m + len, y); ctx.moveTo(W - m, y); ctx.lineTo(W - m - len, y);
    }
    ctx.stroke();
    ctx.restore();
    // Corner stars.
    for (const [x, y, k] of [[m, m, 0], [W - m, m, 1], [m, H - m, 2], [W - m, H - m, 3]]) spark(ctx, th, x, y, 11 * u, th.gold, { a: 0.9, rot: Math.PI / 4 + k, spikes: 8, noGlow: true });
    ctx.restore();
  }

  function vignette(ctx, S, th) {
    const { W, H } = S;
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, th.light ? "rgba(86,52,20,0.34)" : "rgba(1,2,14,0.62)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  function stage(ctx, S, info) {
    if (!S.paint) return;
    const th = themeFrom(S.look, S.accent, S.u), t = info.t;
    const cam = camera(S, info);
    parallaxStars(ctx, S, th, t, cam);
    // The graticule turns steadily and swings a further 40 degrees with every change of station.
    const rot = t * 4.2 + cam.st * 40 + Math.sin(cam.k * Math.PI) * 6 * (cam.a !== cam.b ? 1 : 0);
    sphere(ctx, th, cam.cx, cam.cy, cam.R, rot, 0.42 + 0.05 * Math.sin(t * 0.3), 1, t, cam.quiet);
    motes(ctx, S, th, t);
    comets(ctx, S, th, t);
    // Title and closing carry the armillary. Leaving the title it sweeps past the camera (grows, spins,
    // thins out) as the sphere slides to the next station; arriving at the closing it assembles.
    let ar = 0, build = 1, grow = 1, spinBoost = 0;
    if (cam.a === cam.b) {
      if (cam.ida === "title") { ar = 1; build = eo(seg(info.local, 0, 1.1)); }
      else if (cam.ida === "closing") ar = 1;
    } else if (cam.ida === "title") {
      ar = 1 - smooth(0.35, 0.9, cam.k); grow = 1 + 0.55 * eio(cam.k); spinBoost = cam.k * 3.2;
    } else if (cam.idb === "closing") {
      ar = smooth(0.04, 0.4, cam.k); build = 0.3 + 0.7 * eo(cam.k);
    }
    if (ar > 0.01) armillary(ctx, th, cam.cx, cam.cy, cam.R * 0.74 * (0.9 + 0.1 * build) * grow, t + spinBoost, ar, build);
    neatline(ctx, S, th, cam);
    vignette(ctx, S, th);
  }

  // ---- scene change: a meridian of the celestial grid sweeps across the plate ---------------------
  // At every change an engraved meridian (double rule, degree ticks, trailing graticule) is drawn down
  // the right margin, then pans right to left across the frame. The outgoing plate stays complete on the
  // unswept side and slides with the grid; the incoming plate is already building on the swept side.
  // Values never run backwards: the old drawing is carried off whole, not un-built.
  const DRAWN = new Set(["chart", "object", "people", "process", "compare"]);
  const ANTIC = 0.5;
  const sweepLen = (change) => Math.max(0.4, Math.min(change || 0.45, 1.2)) * 0.95;
  // Fast off the margin, settling as it leaves: the side where the next headline sets is cleared first.
  const sweepEase = (v) => 1 - Math.pow(1 - clamp(v), 3);
  function neighbours(id) {
    const list = sceneList(), i = list.findIndex((s) => s.id === id);
    return { prev: i > 0 ? list[i - 1].id : null, next: i >= 0 && i < list.length - 1 ? list[i + 1].id : null, last: i === list.length - 1 };
  }
  function meridianGeom(S, k) {
    const { W, H, u } = S, bend = (S.tall ? 0.12 : 0.09) * W;
    const X = lerp(62 * u - bend, W + 90 * u, k);
    const at = (y, off = 0) => X - off + bend * (1 - Math.pow((y - H / 2) / (H * 0.62), 2));
    return { X, bend, at };
  }
  function clipSide(ctx, S, g, keepLeft) {
    const { W, H } = S, pts = [];
    for (let y = -40; y <= H + 40; y += 24) pts.push([g.at(y), y]);
    ctx.beginPath();
    ctx.moveTo(keepLeft ? -60 : W + 60, -40);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    ctx.lineTo(keepLeft ? -60 : W + 60, H + 40);
    ctx.closePath(); ctx.clip();
  }
  function meridian(ctx, S, th, k, drawOn, tt) {
    const { H, u } = S, g = meridianGeom(S, k);
    const a = drawOn * (1 - smooth(0.82, 1, k));
    if (a <= 0.01) return;
    ctx.save(); ctx.lineCap = "round";
    const ylim = lerp(-40, H + 40, drawOn);
    const curve = (off) => { const pts = []; for (let y = -40; y <= ylim; y += 12) pts.push([g.at(y, off), y]); return pts; };
    // Trailing graticule: fainter meridians and short parallels behind the sweep.
    for (let j = 1; j <= 4; j++) {
      ctx.strokeStyle = rgba(th.gold, a * (0.42 - j * 0.08)); ctx.lineWidth = 1.1 * u;
      const c = curve(j * 120 * u); ctx.beginPath(); c.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    }
    ctx.strokeStyle = rgba(th.gold, a * 0.22); ctx.lineWidth = 1 * u; dashed(ctx, 2 * u, 9 * u, -tt * 10 * u);
    for (let y = H * 0.12; y < ylim && y < H * 0.95; y += H * 0.16) { ctx.beginPath(); ctx.moveTo(g.at(y), y); ctx.lineTo(g.at(y, 480 * u), y + 30 * u); ctx.stroke(); }
    undash(ctx);
    // A soft light along the leading edge hides the clip seam.
    const lead = curve(0);
    ctx.strokeStyle = rgba(mix(th.gold, WHITE, 0.4), a * 0.16); ctx.lineWidth = 46 * u;
    ctx.beginPath(); lead.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.strokeStyle = rgba(th.gold, a * 0.95); ctx.lineWidth = 2.8 * u;
    ctx.beginPath(); lead.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    const rail = curve(14 * u);
    ctx.strokeStyle = rgba(th.gold, a * 0.55); ctx.lineWidth = 1.2 * u;
    ctx.beginPath(); rail.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    // Degree ticks between the two rules, numerals every tenth.
    ctx.strokeStyle = rgba(th.gold, a * 0.8); ctx.lineWidth = 1.2 * u; ctx.beginPath();
    for (let i = 0, y = -40; y <= ylim; y += 16 * u, i++) { const L = (i % 5 ? 7 : 14) * u, x = g.at(y); ctx.moveTo(x, y); ctx.lineTo(x - L, y); }
    ctx.stroke();
    ctx.fillStyle = rgba(th.gold, a * 0.9); ctx.font = `italic 600 ${24 * u}px ${th.face}`; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (let i = 0, y = -40; y <= ylim; y += 16 * u, i++) if (i % 10 === 5) ctx.fillText((90 - i * 2) + "°", g.at(y) - 22 * u, y);
    // The comet rides the meridian across, carrying the eye from one plate to the next.
    const cy = lerp(H * 0.22, H * 0.7, eio(k)), cx = g.at(cy);
    for (let s = 8; s >= 1; s--) { const yy = cy - s * 16 * u, xx = g.at(yy); ctx.fillStyle = rgba(th.gold, a * 0.5 * (1 - s / 9)); ctx.beginPath(); ctx.arc(xx, yy, 7 * u * (1 - s / 11), 0, TAU); ctx.fill(); }
    spark(ctx, th, cx, cy, 15 * u, th.gold, { a, rot: tt * 1.4, spikes: 8 });
    ctx.restore();
  }

  // ---- scene wrapper: shared theme, the sweep in and out ----------------------------------------
  const wrap = (id, fn) => (ctx, S, box, p, d, info) => {
    const th = themeFrom(S.look, S.accent, S.u), u = S.u;
    const nb = neighbours(id), b = sweepLen(info.change);
    const exiting = info.exit != null;
    const first = !exiting && Math.abs(info.t - info.local) < 1e-4;
    ctx.save();
    if (exiting) {
      // Outgoing: whole, frozen at its finished state, clipped to the unswept side and panning with the grid.
      const k = sweepEase(seg(info.local - info.hold, 0, b));
      if (k >= 1) { ctx.restore(); return; }
      ctx.save();
      clipSide(ctx, S, meridianGeom(S, k), false);
      ctx.translate(k * 110 * u, 0);
      ctx.globalAlpha *= 1 - smooth(0.5, 0.85, k);
      fn(ctx, S, th, box, 1, d, Object.assign({}, info, { out: k, last: false }), info.t);
      ctx.restore();
      if (!DRAWN.has(nb.next)) meridian(ctx, S, th, k, 1, info.t);
      ctx.restore();
      return;
    }
    // Incoming: the build starts at once and is revealed by the sweep.
    const k = first || !nb.prev ? 1 : sweepEase(seg(info.local, 0, b));
    const pin = first ? p : Math.max(p, clamp((info.local + 0.15) / Math.max(0.6, info.hold * 0.55)));
    ctx.save();
    // After a statement scene there is no plate to carry off, so the new plate builds in full view as the meridian passes.
    if (k < 1 && DRAWN.has(nb.prev)) clipSide(ctx, S, meridianGeom(S, k), true);
    if (k < 1) ctx.translate(-(1 - k) * 110 * u, 0);
    fn(ctx, S, th, box, pin, d, Object.assign({}, info, { out: 0, last: nb.last }), info.t);
    ctx.restore();
    if (k < 1) meridian(ctx, S, th, k, 1, info.t);
    // Anticipation: the meridian inks down the right margin before the change.
    if (nb.next && info.local > info.hold - ANTIC) meridian(ctx, S, th, 0, eo(seg(info.local, info.hold - ANTIC, info.hold)), info.t);
    ctx.restore();
  };

  // ---- chart: stars on stems, joined into a constellation ------------------------------------------
  function chartScene(ctx, S, th, box, p, d, info, tt) {
    const u = S.u, n = d.values.length, max = Math.max(...d.values, 1);
    const tall = S.tall, base = box.y + box.h - 84 * u, topY = box.y + (tall ? 190 : 20) * u;
    const axisW = tall ? 0 : 150 * u, bx = box.x + axisW, bw = box.w - axisW, slot = bw / n;
    const cols = d.values.map((_, i) => bx + slot * (i + 0.5));
    ctx.save(); ctx.lineCap = "round";
    // Magnitude scale on the left axis: an engraved ruler with a star of each magnitude.
    if (!tall) {
      const ax = box.x + 28 * u, ar = eo(seg(p, 0, 0.35)) * 0.6 + 0.4;
      ctx.strokeStyle = rgba(th.gold, 0.85); ctx.lineWidth = 2.4 * u; ctx.beginPath(); ctx.moveTo(ax, base); ctx.lineTo(ax, lerp(base, topY - 30 * u, ar)); ctx.stroke();
      ctx.strokeStyle = rgba(th.gold, 0.45); ctx.lineWidth = 1 * u; ctx.beginPath(); ctx.moveTo(ax + 12 * u, base); ctx.lineTo(ax + 12 * u, lerp(base, topY - 30 * u, ar)); ctx.stroke();
      ctx.strokeStyle = rgba(th.gold, 0.7); ctx.lineWidth = 1.2 * u; ctx.beginPath();
      for (let k = 0; k <= 40; k++) { const y = lerp(base, topY, k / 40); if ((base - y) > (base - topY + 30 * u) * ar) break; ctx.moveTo(ax, y); ctx.lineTo(ax + (k % 10 === 0 ? 24 : k % 5 === 0 ? 16 : 8) * u, y); }
      ctx.stroke();
      for (let k = 1; k <= 4; k++) {
        const y = lerp(base, topY, k / 4), vis = seg(ar, k / 4 * 0.9, k / 4 * 0.9 + 0.1); if (vis <= 0) continue;
        const tw = 0.85 + 0.15 * Math.sin(tt * 2 + k * 1.3);
        spark(ctx, th, ax + 62 * u, y, (4 + k * 3.2) * u * tw, k === 4 ? th.gold : th.star, { a: vis, rot: tt * 0.2 + k, noGlow: k < 3 });
        const val = Math.round(max * k / 4);
        sc(ctx, th, String(val), ax + 92 * u, y + 15 * u, 42 * u, { italic: true, raw: true, weight: 600, color: rgba(th.gold, 0.95), a: vis, ls: 0.02 });
      }
      // A scanning line travels up the scale through the hold.
      const f = mod(tt * 0.32, 1), sy = lerp(base, topY, f);
      ctx.strokeStyle = rgba(th.cyan, 0.5 * Math.sin(f * Math.PI)); ctx.lineWidth = 1.6 * u; ctx.beginPath(); ctx.moveTo(ax - 10 * u, sy); ctx.lineTo(ax + 36 * u, sy); ctx.stroke();
      glow(ctx, th, ax, sy, 16 * u, th.cyan, 0.7 * Math.sin(f * Math.PI));
    }
    // Skeleton: dotted levels and an engraved horizon that are there from the first frame.
    ctx.strokeStyle = rgba(th.gold, 0.22); ctx.lineWidth = 1.2 * u; dashed(ctx, 2 * u, 12 * u, -tt * 6 * u);
    for (let k = 1; k <= 4; k++) { const y = lerp(base, topY, k / 4); ctx.beginPath(); ctx.moveTo(bx, y); ctx.lineTo(bx + bw, y); ctx.stroke(); }
    undash(ctx);
    const hz = eo(seg(p, 0, 0.3)) * 0.65 + 0.35;
    ctx.strokeStyle = rgba(th.gold, 0.85); ctx.lineWidth = 2.6 * u; ctx.beginPath(); ctx.moveTo(bx, base); ctx.lineTo(bx + bw * hz, base); ctx.stroke();
    ctx.strokeStyle = rgba(th.gold, 0.5); ctx.lineWidth = 1.2 * u; ctx.beginPath();
    for (let x = 0, i = 0; x <= bw * hz; x += slot / 8, i++) { ctx.moveTo(bx + x, base); ctx.lineTo(bx + x, base + (i % 8 === 0 ? 20 : 9) * u); }
    ctx.stroke();
    // A large dotted orbit around the whole plate keeps the frame alive.
    ctx.strokeStyle = rgba(th.cyan, 0.2); ctx.lineWidth = 1.4 * u; dashed(ctx, 2 * u, 14 * u, tt * 10 * u);
    ctx.beginPath(); ctx.ellipse(bx + bw / 2, base - (base - topY) * 0.4, bw * 0.53, (base - topY) * 0.68, 0, 0, TAU); ctx.stroke(); undash(ctx);
    const pts = [];
    d.values.forEach((value, i) => {
      const q = eo(seg(p, i * 0.15, i * 0.15 + 0.5)), v = value / max;
      const hot = i === d.highlight, col = hot ? th.gold : th.cyan;
      const x = cols[i], y = base - (base - topY) * v * q, y1 = base - (base - topY) * v;
      // Ghost of the finished bar, there from the first frame.
      ctx.save(); ctx.globalAlpha *= (1 - q * 0.65) * (1 - clamp(info.out * 3)); ctx.strokeStyle = rgba(col, 0.85); ctx.lineWidth = 2 * u; dashed(ctx, 3 * u, 9 * u, -tt * 10 * u);
      ctx.strokeRect(x - Math.min(slot * 0.36, 150 * u) / 2, y1, Math.min(slot * 0.36, 150 * u), base - y1);
      ctx.beginPath(); ctx.arc(x, y1, Math.min((22 + 20 * v) * u, slot * 0.18), 0, TAU); ctx.stroke(); undash(ctx); ctx.restore();
      pts.push([x, base - (base - topY) * v]);
      const colw = Math.min(slot * 0.36, 150 * u);
      // Translucent column with engraved edges.
      const g = ctx.createLinearGradient(0, base, 0, y);
      g.addColorStop(0, rgba(col, 0.02)); g.addColorStop(1, rgba(col, hot ? 0.28 : 0.2));
      ctx.fillStyle = g; ctx.fillRect(x - colw / 2, y, colw, base - y);
      ctx.strokeStyle = rgba(col, 0.55); ctx.lineWidth = 1.4 * u; ctx.beginPath();
      ctx.moveTo(x - colw / 2, base); ctx.lineTo(x - colw / 2, y); ctx.moveTo(x + colw / 2, base); ctx.lineTo(x + colw / 2, y); ctx.stroke();
      // Hatch.
      ctx.save(); ctx.beginPath(); ctx.rect(x - colw / 2, y, colw, base - y); ctx.clip();
      ctx.strokeStyle = rgba(col, 0.2); ctx.lineWidth = 1 * u; ctx.beginPath();
      for (let h = -colw; h < base - y + colw; h += 11 * u) { ctx.moveTo(x - colw / 2 - 4 * u, base - h); ctx.lineTo(x + colw / 2 + 4 * u, base - h - colw); }
      ctx.stroke(); ctx.restore();
      // Stem.
      const sg = ctx.createLinearGradient(0, base, 0, y);
      sg.addColorStop(0, rgba(col, 0.2)); sg.addColorStop(1, rgba(col, 0.95));
      ctx.strokeStyle = sg; ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x, y); ctx.stroke();
      // Hold life: a band of starlight climbs each column, glints twinkle in the hatching.
      if (q > 0.6) {
        const lifeA = seg(q, 0.6, 1);
        ctx.save(); ctx.beginPath(); ctx.rect(x - colw / 2, y, colw, base - y); ctx.clip();
        const f = mod(tt * 0.45 + i * 0.27, 1), ry = lerp(base + 30 * u, y - 30 * u, f), bh = 46 * u;
        const bandG = ctx.createLinearGradient(0, ry - bh, 0, ry + bh);
        bandG.addColorStop(0, rgba(col, 0)); bandG.addColorStop(0.5, rgba(mix(col, WHITE, 0.4), 0.38 * lifeA)); bandG.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = bandG; ctx.fillRect(x - colw / 2, ry - bh, colw, bh * 2);
        const gr = rng(200 + i);
        for (let k = 0; k < 9; k++) {
          const gx = x + (gr() - 0.5) * colw * 0.85, gy = lerp(base, y, gr()), ph = gr() * TAU, tw = Math.max(0, Math.sin(tt * (2.2 + gr() * 2) + ph));
          if (tw > 0.2) spark(ctx, th, gx, gy, (3 + 4 * tw) * u, col, { a: tw * lifeA, rot: ph, noGlow: true });
        }
        ctx.restore();
        glow(ctx, th, x, ry, 14 * u, col, 0.8 * Math.sin(f * Math.PI) * lifeA);
      }
      // Star: ignites as the stem arrives.
      const ig = seg(q, 0.72, 1), pop = back(ig);
      if (ig > 0) {
        // Star and halo scale with the bar's magnitude and never spill past its column.
        const tw = 1 + 0.1 * Math.sin(tt * 2.3 + i * 1.7) + 0.06 * Math.sin(tt * 5.1 + i);
        const r0 = Math.min((16 + 22 * v) * u * (hot ? 1.25 : 1), colw * 0.3);
        const r = r0 * pop * tw, ringR = Math.min(r0 * (1.45 + 0.6 * v), colw * 0.5);
        spark(ctx, th, x, y, r, col, { a: 1, rot: tt * 0.35 + i, spikes: hot ? 8 : 4 });
        ctx.save();
        ctx.strokeStyle = rgba(col, 0.75 * ig); ctx.lineWidth = 1.8 * u; dashed(ctx, 3 * u, 8 * u, -tt * 22 * u * (hot ? -1 : 1));
        ctx.beginPath(); ctx.arc(x, y, ringR * pop, 0, TAU); ctx.stroke(); undash(ctx);
        if (hot) { ctx.strokeStyle = rgba(col, 0.5); ctx.lineWidth = 1.2 * u; ctx.beginPath(); ctx.arc(x, y, Math.min(ringR * 1.35, colw * 0.64) * pop, 0, TAU); ctx.stroke(); }
        const fl = seg(q, 0.8, 1) * (1 - seg(p, i * 0.15 + 0.5, i * 0.15 + 0.75));
        if (fl > 0 && fl < 1) { ctx.strokeStyle = rgba(col, (1 - fl) * 0.8); ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.arc(x, y, ringR * (1 + 0.8 * fl), 0, TAU); ctx.stroke(); }
        // A slow scintillation pulse keeps each settled star breathing within its halo.
        if (q > 0.98) { const f2 = mod(tt * 0.55 + i * 0.31, 1); ctx.strokeStyle = rgba(col, 0.6 * (1 - f2)); ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.arc(x, y, r0 * 0.6 + (ringR - r0 * 0.6) * f2, 0, TAU); ctx.stroke(); }
        ctx.restore();
        const shown = M.formatNumber(value * eo(seg(p, i * 0.15 + 0.15, i * 0.15 + 0.7)), 0, d.prefix, d.suffix);
        numText(ctx, th, shown, x, y - ringR * pop - 22 * u, (hot ? 112 : 96) * u, hot ? rgba(th.gold, 1) : th.inkS, "center", slot * 0.96);
      }
      // Label under the horizon.
      const lab = d.labels[i] || "";
      if (lab) {
        const f = fitLines(ctx, th, lab, 44 * u, 42 * u, slot * 0.92);
        f.lines.forEach((line, li) => sc(ctx, th, line, x, base + (66 + li * 48) * u, f.size, { align: "center", color: hot ? rgba(th.gold, 1) : th.mutedS, a: 0.45 + 0.55 * eo(q) }));
      }
    });
    // Constellation line joins the stars; a light runs along it.
    const lit = eo(seg(p, 0.55, 0.95));
    if (lit > 0 && pts.length > 1) {
      ctx.strokeStyle = rgba(th.cyan, 0.75); ctx.lineWidth = 2.2 * u; dashed(ctx, 4 * u, 9 * u, -tt * 14 * u);
      pathPartial(ctx, pts, lit); ctx.stroke(); undash(ctx);
      if (lit > 0.98) runner(ctx, th, pts, mod(tt * 0.3, 1), th.gold, u, 0.14, 9);
    }
    ctx.restore();
  }

  // ---- object: an observatory plate with a live timeline, leaders to labels --------------------------
  const PLAY = 0.27;
  function screen(ctx, th, sx, sy, sw, sh, p, tt, u, vertical) {
    ctx.save();
    ctx.beginPath(); ctx.rect(sx, sy, sw, sh); ctx.clip();
    const bg = ctx.createLinearGradient(sx, sy, sx + sw, sy + sh);
    bg.addColorStop(0, rgba(th.light ? mix(th.neb[1], th.bg, 0.6) : [8, 8, 34], 1)); bg.addColorStop(1, rgba(th.light ? mix(th.neb[2], th.bg, 0.6) : [12, 24, 52], 1));
    ctx.fillStyle = bg; ctx.fillRect(sx, sy, sw, sh);
    const nb = ctx.createRadialGradient(sx + sw * 0.7, sy + sh * 0.25, 0, sx + sw * 0.7, sy + sh * 0.25, sw * 0.55);
    nb.addColorStop(0, rgba(th.neb[0], 0.55)); nb.addColorStop(1, rgba(th.neb[0], 0)); ctx.fillStyle = nb; ctx.fillRect(sx, sy, sw, sh);
    const r = rng(5);
    for (let i = 0; i < 46; i++) { const x = sx + r() * sw, y = sy + r() * sh, ph = r() * TAU; ctx.fillStyle = rgba(th.star, 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(tt * (1 + r() * 2) + ph))); ctx.fillRect(x, y, 2 * u, 2 * u); }
    // Preview: a little planisphere turning.
    const pv = vertical ? { x: sx + sw * 0.1, y: sy + sh * 0.07, w: sw * 0.8, h: sh * 0.4 } : { x: sx + sw * 0.07, y: sy + sh * 0.1, w: sw * 0.5, h: sh * 0.46 };
    ctx.strokeStyle = rgba(th.gold, 0.7); ctx.lineWidth = 1.6 * u; ctx.strokeRect(pv.x, pv.y, pv.w, pv.h);
    const pr = Math.min(pv.w, pv.h) * 0.4, pcx = pv.x + pv.w / 2, pcy = pv.y + pv.h / 2;
    degreeRing(ctx, th, pcx, pcy, pr, tt * 6, { a: 0.85, step: 10, minor: 4, major: 8, gap: 8, w: 1.4 });
    ctx.strokeStyle = rgba(th.cyan, 0.7); ctx.lineWidth = 1.4 * u;
    ctx.beginPath(); for (let k = 0; k < 5; k++) { const a = tt * 0.5 + k * 1.2566, rr = pr * (0.28 + 0.35 * ((k * 7) % 5) / 5); const X = pcx + Math.cos(a) * rr, Y = pcy + Math.sin(a) * rr; if (k) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); } ctx.stroke();
    spark(ctx, th, pcx, pcy, 9 * u, th.gold, { a: 1, rot: tt, spikes: 8 });
    // Beside the preview: a star catalogue, each entry a star of its magnitude and a stippled leader.
    if (!vertical) for (let k = 0; k < 4; k++) {
      const bx = pv.x + pv.w + sw * 0.06, by = pv.y + (k + 0.5) * pv.h / 4, lw = sw * 0.3;
      const tw = 0.7 + 0.3 * Math.sin(tt * (1.3 + k * 0.5) + k * 2);
      spark(ctx, th, bx + 8 * u, by, (3.5 + (3 - k) * 1.6) * u * tw, k === 1 ? th.gold : th.star, { a: 1, rot: tt * 0.3 + k, noGlow: true });
      const fill = 0.35 + 0.6 * (0.5 + 0.5 * Math.sin(tt * (0.8 + k * 0.3) + k * 1.7));
      ctx.fillStyle = rgba(k === 1 ? th.gold : th.cyan, 0.85);
      for (let x = 0; x < lw * fill; x += 6 * u) ctx.fillRect(bx + 26 * u + x, by - 1 * u, 2 * u, 2 * u);
      ctx.strokeStyle = rgba(th.gold, 0.3); ctx.lineWidth = 1 * u; ctx.beginPath(); ctx.moveTo(bx + 26 * u, by + 9 * u); ctx.lineTo(bx + 26 * u + lw * 0.85, by + 9 * u); ctx.stroke();
    }
    // Timeline: three engraved star tracks. Each lane is a pair of hairlines with stipple; each clip is a
    // constellation segment of stars joined by fine gold line over a stippled band, read by the playhead.
    const ty0 = sy + sh * (vertical ? 0.58 : 0.64), rail = sh * (vertical ? 0.1 : 0.085), gapY = rail * 0.62;
    const clips = [[[0.06, 0.28], [0.38, 0.2], [0.62, 0.3]], [[0.1, 0.18], [0.34, 0.34], [0.74, 0.18]], [[0.06, 0.4], [0.52, 0.22], [0.78, 0.16]]];
    const phx = 0.06 + 0.88 * mod(tt * PLAY, 1);
    for (let t3 = 0; t3 < 3; t3++) {
      const y = ty0 + t3 * (rail + gapY), lane = t3 === 1 ? th.cyan : th.gold;
      ctx.strokeStyle = rgba(th.gold, 0.4); ctx.lineWidth = 1 * u; ctx.beginPath();
      ctx.moveTo(sx + sw * 0.04, y); ctx.lineTo(sx + sw * 0.96, y); ctx.moveTo(sx + sw * 0.04, y + rail); ctx.lineTo(sx + sw * 0.96, y + rail); ctx.stroke();
      ctx.strokeStyle = rgba(th.gold, 0.28); ctx.beginPath();
      for (let x = sx + sw * 0.04; x < sx + sw * 0.96; x += 10 * u) { ctx.moveTo(x, y + rail); ctx.lineTo(x, y + rail - 4 * u); }
      ctx.stroke();
      clips[t3].forEach(([c0, cw], i) => {
        const s = eo(seg(p, 0.2 + t3 * 0.1 + i * 0.07, 0.55 + t3 * 0.1 + i * 0.07)); if (s <= 0) return;
        const x0 = sx + sw * c0, x1 = x0 + sw * cw * s, lit = s > 0.98 && phx >= c0 && phx <= c0 + cw ? 1 : 0;
        // Stipple band between the hairlines.
        const r = rng(60 + t3 * 7 + i);
        ctx.fillStyle = rgba(lane, lit ? 0.75 : 0.42);
        const dots = Math.round(cw * sw * rail / (70 * u * u));
        for (let k = 0; k < dots; k++) { const dx2 = x0 + r() * sw * cw, dy2 = y + 3 * u + r() * (rail - 6 * u), sz = (0.8 + r() * 1.3) * u; if (dx2 <= x1) ctx.fillRect(dx2, dy2, sz, sz); }
        // Constellation segment across the clip.
        const nodes = [], m = 4;
        for (let k = 0; k <= m; k++) { const f = k / m; nodes.push([x0 + sw * cw * f, y + rail * (0.5 + (k % m === 0 ? 0 : (h2(t3, i * 9 + k, 3) - 0.5) * 0.6))]); }
        const vis = nodes.filter((q) => q[0] <= x1 + 0.5);
        ctx.strokeStyle = rgba(lit ? mix(lane, WHITE, 0.4) : lane, lit ? 1 : 0.85); ctx.lineWidth = (lit ? 2 : 1.4) * u; ctx.beginPath();
        vis.forEach(([x, yy], k) => (k ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy))); if (vis.length && x1 > vis[vis.length - 1][0]) { const nx = nodes[vis.length] || nodes[nodes.length - 1]; ctx.lineTo(x1, lerp(vis[vis.length - 1][1], nx[1], (x1 - vis[vis.length - 1][0]) / Math.max(1, nx[0] - vis[vis.length - 1][0]))); } ctx.stroke();
        vis.forEach(([x, yy], k) => spark(ctx, th, x, yy, ((k % m === 0 ? 5.5 : 3.6) + (lit ? 1.5 : 0)) * u * (0.85 + 0.15 * Math.sin(tt * 2.6 + k + i)), k % m === 0 ? th.gold : lane, { a: 1, rot: tt * 0.4 + k, noGlow: !lit }));
        // Engraved brackets at the clip ends.
        ctx.strokeStyle = rgba(th.gold, 0.9); ctx.lineWidth = 1.4 * u; ctx.beginPath();
        ctx.moveTo(x0 + 5 * u, y + 2 * u); ctx.lineTo(x0, y + 2 * u); ctx.lineTo(x0, y + rail - 2 * u); ctx.lineTo(x0 + 5 * u, y + rail - 2 * u);
        if (s > 0.98) { ctx.moveTo(x1 - 5 * u, y + 2 * u); ctx.lineTo(x1, y + 2 * u); ctx.lineTo(x1, y + rail - 2 * u); ctx.lineTo(x1 - 5 * u, y + rail - 2 * u); }
        ctx.stroke();
        if (lit) glow(ctx, th, sx + sw * phx, y + rail / 2, rail * 1.3, lane, 0.6);
      });
    }
    const ph = sx + sw * (0.06 + 0.88 * mod(tt * PLAY, 1));
    ctx.strokeStyle = rgba(th.gold, 0.95); ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.moveTo(ph, ty0 - 12 * u); ctx.lineTo(ph, ty0 + 3 * (rail + gapY)); ctx.stroke();
    ctx.fillStyle = rgba(th.gold, 1); ctx.beginPath(); ctx.moveTo(ph - 8 * u, ty0 - 14 * u); ctx.lineTo(ph + 8 * u, ty0 - 14 * u); ctx.lineTo(ph, ty0 - 2 * u); ctx.fill();
    ctx.restore();
    return { pv, ty0, rail, gapY };
  }
  function objectScene(ctx, S, th, box, p, d, info, tt) {
    const u = S.u, phone = d.kind === "phone", tall = S.tall;
    let dw, dh, dx, dy;
    if (tall) {
      if (phone) { dh = Math.min(box.h * 0.5, box.w * 1.05); dw = dh / 1.95; } else { dw = Math.min(box.w * 0.94, box.h * 0.5 * 1.6); dh = dw * 0.62; }
      dx = box.x + (box.w - dw) / 2; dy = box.y + (box.h * 0.56 - dh) / 2 + 10 * u;
    } else if (phone) { dh = Math.min(box.h * 0.94, box.w * 0.5); dw = dh / 1.95; dx = box.x + box.w * 0.16; dy = box.y + (box.h - dh) / 2; }
    else { dw = Math.min(box.w * 0.56, box.h * 1.2); dh = dw * 0.62; dx = box.x + box.w * 0.02; dy = box.y + (box.h - dh) / 2 - dh * 0.05; }
    const q = eo(seg(p, 0, 0.5)), bob = Math.sin(tt * 1.3) * 5 * u;
    const cx = dx + dw / 2, cy = dy + dh / 2 + bob;
    // Halo and orbit round the plate.
    glow(ctx, th, cx, cy, Math.max(dw, dh) * 0.85, th.cyan, 0.28 * q * (0.8 + 0.2 * Math.sin(tt * 1.7)));
    ctx.save(); ctx.lineWidth = 1.6 * u; ctx.strokeStyle = rgba(th.gold, 0.4); dashed(ctx, 2 * u, 12 * u, tt * 12 * u);
    const orx = dw * 0.72, ory = dh * 0.78;
    ctx.beginPath(); ctx.ellipse(cx, cy, orx, ory, -0.18, 0, TAU); ctx.stroke(); undash(ctx);
    const oa = tt * 0.7, mx = cx + Math.cos(oa) * orx * Math.cos(-0.18) - Math.sin(oa) * ory * Math.sin(-0.18), my = cy + Math.cos(oa) * orx * Math.sin(-0.18) + Math.sin(oa) * ory * Math.cos(-0.18);
    ctx.restore();
    spark(ctx, th, mx, my, 9 * u, th.gold, { a: 0.9 * q, rot: tt });
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(0.92 + 0.08 * q, 0.92 + 0.08 * q); ctx.translate(-cx, -cy + bob);
    ctx.globalAlpha *= clamp(q * 2.5);
    const rad = (phone ? 44 : 20) * u;
    // Body.
    ctx.beginPath(); ctx.roundRect(dx, dy, dw, dh, rad);
    const body = ctx.createLinearGradient(dx, dy, dx + dw, dy + dh); body.addColorStop(0, rgba(th.light ? mix(th.bg, th.ink, 0.15) : [26, 22, 60], 1)); body.addColorStop(1, rgba(th.light ? mix(th.bg, th.ink, 0.3) : [10, 12, 36], 1));
    ctx.fillStyle = body; ctx.shadowColor = rgba(th.gold, 0.35); ctx.shadowBlur = 36 * u; ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = rgba(th.gold, 0.95); ctx.lineWidth = 3.4 * u; ctx.stroke();
    ctx.beginPath(); ctx.roundRect(dx + 9 * u, dy + 9 * u, dw - 18 * u, dh - 18 * u, rad - 6 * u); ctx.strokeStyle = rgba(th.gold, 0.4); ctx.lineWidth = 1.2 * u; ctx.stroke();
    // Bezel scale ticks.
    ctx.strokeStyle = rgba(th.gold, 0.55); ctx.lineWidth = 1 * u; ctx.beginPath();
    for (let x = dx + rad; x < dx + dw - rad; x += 14 * u) { ctx.moveTo(x, dy + 9 * u); ctx.lineTo(x, dy + 16 * u); }
    ctx.stroke();
    const pad = (phone ? 30 : 26) * u;
    const sx = dx + pad, sy = dy + pad * (phone ? 1.5 : 1), sw = dw - pad * 2, sh = dh - pad * (phone ? 2.6 : 2);
    const geom = screen(ctx, th, sx, sy, sw, sh, p, tt, u, phone || tall && false);
    ctx.strokeStyle = rgba(th.gold, 0.8); ctx.lineWidth = 1.6 * u; ctx.strokeRect(sx, sy, sw, sh);
    if (phone) { ctx.fillStyle = rgba(th.gold, 0.8); ctx.beginPath(); ctx.roundRect(cx - 40 * u, dy + 12 * u, 80 * u, 10 * u, 5 * u); ctx.fill(); }
    else {
      ctx.beginPath(); ctx.moveTo(dx - dw * 0.07, dy + dh + dh * 0.07); ctx.lineTo(dx + dw * 1.07, dy + dh + dh * 0.07); ctx.lineTo(dx + dw, dy + dh); ctx.lineTo(dx, dy + dh); ctx.closePath();
      ctx.fillStyle = rgba(th.light ? mix(th.bg, th.ink, 0.25) : [20, 18, 52], 1); ctx.fill(); ctx.strokeStyle = rgba(th.gold, 0.9); ctx.lineWidth = 2.6 * u; ctx.stroke();
      ctx.strokeStyle = rgba(th.gold, 0.5); ctx.lineWidth = 1.2 * u; ctx.beginPath(); ctx.moveTo(cx - dw * 0.1, dy + dh + dh * 0.035); ctx.lineTo(cx + dw * 0.1, dy + dh + dh * 0.035); ctx.stroke();
    }
    ctx.restore();
    // Callouts.
    const { pv, ty0, rail, gapY } = geom;
    const anchors = [[pv.x + pv.w * 0.78, pv.y + pv.h * 0.3], [sx + sw * 0.5, ty0 + rail * 0.5], [sx + sw * 0.2, ty0 + 2 * (rail + gapY) + rail * 0.5]].map((a) => [a[0], a[1] + bob]);
    const nums = ["I", "II", "III"];
    ctx.save(); ctx.lineCap = "round";
    d.callouts.forEach((label, i) => {
      if (!label) return;
      const c = eo(seg(p, 0.4 + i * 0.13, 0.72 + i * 0.13)), [ax, ay] = anchors[i];
      if (c <= 0) return;
      const reticle = (x, y, big) => {
        ctx.save(); ctx.strokeStyle = rgba(th.gold, 0.95); ctx.lineWidth = 2 * u;
        ctx.beginPath(); ctx.arc(x, y, (big ? 13 : 11) * u, 0, TAU); ctx.stroke();
        dashed(ctx, 3 * u, 5 * u, -tt * 20 * u); ctx.beginPath(); ctx.arc(x, y, 21 * u, 0, TAU); ctx.stroke(); undash(ctx);
        spark(ctx, th, x, y, 5 * u, th.gold, { a: 1, rot: tt, noGlow: true }); ctx.restore();
      };
      reticle(ax, ay, false);
      if (!tall) {
        const lx = box.x + box.w * 0.64, ly = box.y + box.h * (0.14 + 0.28 * i);
        const pts = [[ax, ay], [lx - 130 * u, ly], [lx - 26 * u, ly]];
        ctx.strokeStyle = rgba(th.gold, 0.9); ctx.lineWidth = 2 * u; pathPartial(ctx, pts, c); ctx.stroke();
        if (c > 0.97) { runner(ctx, th, pts, mod(tt * 0.45 + i * 0.3, 1), th.gold, u, 0.2, 8); }
        if (c > 0.6) {
          const a = eo(seg(c, 0.6, 1)), maxW = box.x + box.w - lx;
          const f = fitLines(ctx, th, label, 46 * u, 42 * u, maxW);
          sc(ctx, th, nums[i], lx, ly - 34 * u - (f.lines.length - 1) * 24 * u, 34 * u, { italic: true, raw: true, color: rgba(th.gold, 1), a, ls: 0.1 });
          f.lines.forEach((line, li) => sc(ctx, th, line, lx + (1 - a) * 24 * u, ly + 16 * u + li * 50 * u, f.size, { a }));
          ctx.strokeStyle = rgba(th.gold, 0.6 * a); ctx.lineWidth = 1.2 * u; ctx.beginPath(); ctx.moveTo(lx, ly + 28 * u + (f.lines.length - 1) * 50 * u); ctx.lineTo(lx + Math.min(maxW, 300 * u) * a, ly + 28 * u + (f.lines.length - 1) * 50 * u); ctx.stroke();
        }
        if (c > 0.3) sc(ctx, th, nums[i], ax + 30 * u, ay - 22 * u, 26 * u, { italic: true, raw: true, color: rgba(th.gold, 1), a: c });
      } else {
        sc(ctx, th, nums[i], ax + 30 * u, ay - 22 * u, 30 * u, { italic: true, raw: true, color: rgba(th.gold, 1), a: c });
        const ly = box.y + box.h * (0.66 + 0.115 * i), lx = box.x + 70 * u, maxW = box.w - 90 * u;
        if (c > 0.3) {
          const a = eo(seg(c, 0.3, 1));
          ctx.save(); ctx.globalAlpha *= a;
          ctx.strokeStyle = rgba(th.gold, 0.9); ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.arc(box.x + 30 * u, ly - 14 * u, 24 * u, 0, TAU); ctx.stroke();
          dashed(ctx, 2 * u, 6 * u, tt * 14 * u); ctx.beginPath(); ctx.arc(box.x + 30 * u, ly - 14 * u, 32 * u, 0, TAU); ctx.stroke(); undash(ctx);
          sc(ctx, th, nums[i], box.x + 30 * u, ly - 3 * u, 28 * u, { italic: true, raw: true, align: "center", color: rgba(th.gold, 1), halo: false });
          const f = fitLines(ctx, th, label, 46 * u, 42 * u, maxW);
          f.lines.forEach((line, li) => sc(ctx, th, line, lx + (1 - a) * 20 * u, ly + li * 48 * u, f.size));
          ctx.strokeStyle = rgba(th.gold, 0.4); ctx.lineWidth = 1.2 * u; ctx.beginPath(); ctx.moveTo(lx, ly + 22 * u + (f.lines.length - 1) * 48 * u); ctx.lineTo(box.x + box.w, ly + 22 * u + (f.lines.length - 1) * 48 * u); ctx.stroke();
          ctx.restore();
        }
      }
    });
    // Wide: an engraved scale of the cut fills the sky below the labels; its star tracks the playhead.
    if (!tall) {
      const c3 = eo(seg(p, 0.45, 0.85));
      if (c3 > 0) {
        const rx0 = box.x, rx1 = box.x + box.w, ry = box.y + box.h * 0.985, wR = (rx1 - rx0) * c3;
        ctx.strokeStyle = rgba(th.gold, 0.85); ctx.lineWidth = 2.2 * u; ctx.beginPath(); ctx.moveTo(rx0, ry); ctx.lineTo(rx0 + wR, ry); ctx.stroke();
        ctx.strokeStyle = rgba(th.gold, 0.45); ctx.lineWidth = 1 * u; ctx.beginPath(); ctx.moveTo(rx0, ry - 34 * u); ctx.lineTo(rx0 + wR, ry - 34 * u); ctx.stroke();
        ctx.strokeStyle = rgba(th.gold, 0.7); ctx.lineWidth = 1.2 * u; ctx.beginPath();
        for (let k = 0; k <= 96; k++) { const x = rx0 + (rx1 - rx0) * k / 96; if (x > rx0 + wR) break; const L = (k % 12 === 0 ? 30 : k % 4 === 0 ? 18 : 9) * u; ctx.moveTo(x, ry); ctx.lineTo(x, ry - L); }
        ctx.stroke();
        // Alternating filled segments, like a map's scale bar.
        for (let k = 0; k < 16; k++) { const x0 = rx0 + (rx1 - rx0) * k / 16; if (x0 > rx0 + wR) break; if (k % 2 === 0) { ctx.fillStyle = rgba(th.gold, 0.55); ctx.fillRect(x0, ry + 6 * u, Math.min((rx1 - rx0) / 16, rx0 + wR - x0), 8 * u); } }
        ctx.strokeStyle = rgba(th.gold, 0.6); ctx.strokeRect(rx0, ry + 6 * u, wR, 8 * u);
        if (c3 > 0.97) {
          const fx = rx0 + (rx1 - rx0) * (0.06 + 0.88 * mod(tt * PLAY, 1));
          ctx.strokeStyle = rgba(th.gold, 0.9); ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.moveTo(fx, ry - 46 * u); ctx.lineTo(fx, ry + 18 * u); ctx.stroke();
          spark(ctx, th, fx, ry - 52 * u, 11 * u, th.gold, { a: 1, rot: tt * 1.2, spikes: 8 });
        }
      }
      // Under the labels: the current cut as an engraved star track, its stars lighting as the playhead passes.
      const c4 = eo(seg(p, 0.35, 0.75));
      if (c4 > 0) {
        const tx0 = box.x + box.w * 0.64, tx1 = box.x + box.w, ty = box.y + box.h * 0.83, trh = 34 * u;
        ctx.strokeStyle = rgba(th.gold, 0.6); ctx.lineWidth = 1.2 * u; ctx.beginPath();
        ctx.moveTo(tx0, ty - trh / 2); ctx.lineTo(lerp(tx0, tx1, c4), ty - trh / 2); ctx.moveTo(tx0, ty + trh / 2); ctx.lineTo(lerp(tx0, tx1, c4), ty + trh / 2); ctx.stroke();
        const r = rng(808); ctx.fillStyle = rgba(th.gold, 0.4);
        for (let k = 0; k < 140; k++) { const x = lerp(tx0, tx1, r()), y = ty - trh / 2 + 3 * u + r() * (trh - 6 * u); if (x < lerp(tx0, tx1, c4)) ctx.fillRect(x, y, 1.6 * u, 1.6 * u); }
        const nodes = []; for (let k = 0; k <= 9; k++) nodes.push([lerp(tx0 + 14 * u, tx1 - 14 * u, k / 9), ty + (k % 3 === 0 ? 0 : (h2(k, 4, 9) - 0.5) * trh * 0.6)]);
        ctx.strokeStyle = rgba(th.gold, 0.85); ctx.lineWidth = 1.4 * u; pathPartial(ctx, nodes, c4); ctx.stroke();
        const fx = tx0 + (tx1 - tx0) * (0.06 + 0.88 * mod(tt * PLAY, 1));
        nodes.forEach(([x, y], k) => {
          if (x > lerp(tx0, tx1, c4)) return;
          const near = Math.max(0, 1 - Math.abs(x - fx) / (60 * u));
          spark(ctx, th, x, y, ((k % 3 === 0 ? 7 : 4.5) + 5 * near) * u, k % 3 === 0 ? th.gold : th.cyan, { a: 1, rot: tt * 0.5 + k, noGlow: near < 0.2 });
        });
        if (c4 > 0.97) { ctx.strokeStyle = rgba(th.gold, 0.5); ctx.lineWidth = 1.4 * u; ctx.beginPath(); ctx.moveTo(fx, ty - trh); ctx.lineTo(fx, box.y + box.h * 0.985 - 46 * u); ctx.stroke(); }
      }
      // Upper right: an inset planisphere of the preview, a labelled hour dial with its own small constellation.
      const c5 = eo(seg(p, 0.05, 0.45));
      if (c5 > 0) {
        const ir = 118 * u, icx = box.x + box.w - ir - 30 * u, icy = box.y - ir - 34 * u;
        ctx.save(); ctx.globalAlpha *= c5;
        ctx.fillStyle = rgba(th.light ? th.bg : [8, 9, 34], 0.7); ctx.beginPath(); ctx.arc(icx, icy, ir, 0, TAU); ctx.fill();
        degreeRing(ctx, th, icx, icy, ir, -tt * 5, { a: 0.95, step: 5, minor: 6, major: 13, gap: 14, w: 2.2 });
        ctx.strokeStyle = rgba(th.gold, 0.3); ctx.lineWidth = 1 * u;
        for (let k = 1; k <= 2; k++) { ctx.beginPath(); ctx.arc(icx, icy, ir * k / 3, 0, TAU); ctx.stroke(); }
        ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 6 + tt * 0.05; ctx.moveTo(icx + Math.cos(a) * ir * 0.86, icy + Math.sin(a) * ir * 0.86); ctx.lineTo(icx - Math.cos(a) * ir * 0.86, icy - Math.sin(a) * ir * 0.86); } ctx.stroke();
        const cpts = [[-0.5, 0.2], [-0.22, -0.3], [0.12, -0.12], [0.42, -0.42], [0.36, 0.22], [0.02, 0.44]].map(([x, y]) => { const a = tt * 0.12, cs = Math.cos(a), sn = Math.sin(a); return [icx + (x * cs - y * sn) * ir * 0.8, icy + (x * sn + y * cs) * ir * 0.8]; });
        ctx.strokeStyle = rgba(th.cyan, 0.8); ctx.lineWidth = 1.6 * u; pathPartial(ctx, cpts, c5); ctx.stroke();
        cpts.forEach(([x, y], k) => spark(ctx, th, x, y, (k === 3 ? 9 : 5) * u * (0.85 + 0.15 * Math.sin(tt * 2.2 + k)), k === 3 ? th.gold : th.star, { a: 1, rot: tt * 0.3 + k, noGlow: k !== 3 }));
        const ha = -Math.PI / 2 + TAU * mod(tt * PLAY, 1);
        ctx.strokeStyle = rgba(th.gold, 0.95); ctx.lineWidth = 2.4 * u; ctx.beginPath(); ctx.moveTo(icx, icy); ctx.lineTo(icx + Math.cos(ha) * ir * 0.92, icy + Math.sin(ha) * ir * 0.92); ctx.stroke();
        spark(ctx, th, icx, icy, 7 * u, th.gold, { a: 1, rot: tt, noGlow: true });
        sc(ctx, th, "I", icx - ir - 22 * u, icy + 12 * u, 40 * u, { italic: true, raw: true, align: "right", color: rgba(th.gold, 1), ls: 0.04 });
        ctx.restore();
        // Dotted leader from the inset down to callout I's label.
        ctx.strokeStyle = rgba(th.gold, 0.55 * c5); ctx.lineWidth = 1.4 * u; dashed(ctx, 2 * u, 7 * u, -tt * 12 * u);
        ctx.beginPath(); ctx.moveTo(icx, icy + ir + 6 * u); ctx.lineTo(icx, lerp(icy + ir + 6 * u, box.y + box.h * 0.14 - 80 * u, c5)); ctx.stroke(); undash(ctx);
      }
    }
    ctx.restore();
  }

  // ---- people: figures drawn as constellations ------------------------------------------------------
  const FIG = {
    nodes: [[0, -0.9], [0, -0.74], [-0.2, -0.7], [0.2, -0.7], [-0.3, -0.46], [0.3, -0.46], [-0.26, -0.24], [0.26, -0.24], [0, -0.38], [-0.11, -0.36], [0.11, -0.36], [-0.13, -0.18], [0.13, -0.18], [-0.15, 0], [0.15, 0]],
    edges: [[0, 1], [1, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 7], [1, 8], [8, 9], [8, 10], [9, 11], [10, 12], [11, 13], [12, 14], [2, 9], [3, 10]],
  };
  function figurePose(i, hot, tt) {
    const n = FIG.nodes.map((q) => q.slice());
    const sway = Math.sin(tt * 1.1 + i * 1.7);
    const set = (k, x, y) => { n[k][0] = x; n[k][1] = y; };
    if (hot) { set(5, 0.34, -0.8); set(7, 0.3 + Math.sin(tt * 4.2) * 0.07, -1.0); }
    else if (i % 3 === 1) { set(4, -0.36, -0.58); set(6, -0.36 + Math.sin(tt * 2 + i) * 0.03, -0.8); }
    else if (i % 3 === 2) { set(4, -0.44, -0.62); set(6, -0.6, -0.52 + sway * 0.04); set(5, 0.44, -0.62); set(7, 0.6, -0.52 - sway * 0.04); }
    for (const q of n) q[0] += sway * 0.014 * (1 - q[1] * -0.0);
    n[0][1] += Math.sin(tt * 1.6 + i) * 0.012;
    return n;
  }
  function peopleScene(ctx, S, th, box, p, d, info, tt) {
    const u = S.u, n = Math.max(2, Math.min(6, Math.round(d.count)));
    const size = Math.min(box.h * 0.7, (box.w / n) * 1.3), base = box.y + box.h * 0.78;
    const cxs = Array.from({ length: n }, (_, i) => box.x + (box.w / n) * (i + 0.5));
    const hotIdx = Math.min(n - 1, d.highlight);
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
    // Horizon: a shallow engraved arc with ticks.
    const hz = eo(seg(p, 0, 0.35)) * 0.6 + 0.4;
    ctx.strokeStyle = rgba(th.gold, 0.8); ctx.lineWidth = 2.4 * u; ctx.beginPath();
    for (let k = 0; k <= 60; k++) { const f = k / 60, x = box.x + box.w * hz * f, y = base + 16 * u - Math.sin(f * Math.PI) * 26 * u; if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.stroke();
    ctx.strokeStyle = rgba(th.gold, 0.4); ctx.lineWidth = 1.1 * u; ctx.beginPath();
    for (let k = 0; k <= 80; k++) { const f = k / 80, x = box.x + box.w * hz * f, y = base + 16 * u - Math.sin(f * Math.PI) * 26 * u; ctx.moveTo(x, y + 4 * u); ctx.lineTo(x, y + (k % 5 ? 10 : 18) * u); }
    ctx.stroke();
    // Links between neighbours: dotted arcs with travelling light.
    for (let i = 0; i < n - 1; i++) {
      const a = [cxs[i], base - size * 0.9], b = [cxs[i + 1], base - size * 0.9];
      const lift = Math.min(size * 0.5, (b[0] - a[0]) * 0.32);
      const arc = []; for (let k = 0; k <= 30; k++) { const f = k / 30; arc.push([lerp(a[0], b[0], f), lerp(a[1], b[1], f) - Math.sin(f * Math.PI) * lift]); }
      const c = eo(seg(p, 0.5 + i * 0.07, 0.85 + i * 0.07));
      ctx.strokeStyle = rgba(th.cyan, 0.55); ctx.lineWidth = 1.8 * u; dashed(ctx, 2 * u, 9 * u, -tt * 10 * u); pathPartial(ctx, arc, c); ctx.stroke(); undash(ctx);
      if (c > 0.98) runner(ctx, th, arc, mod(tt * 0.33 + i * 0.37, 1), th.cyan, u, 0.25, 5);
    }
    for (let i = 0; i < n; i++) {
      const q0 = eo(seg(p, i * 0.07, i * 0.07 + 0.55)), q = q0, hot = i === hotIdx, col = hot ? th.gold : th.cyan;
      const sz = size * (hot ? 1.08 : 1), cx = cxs[i];
      const pose = figurePose(i, hot, tt);
      const P = pose.map((k) => [cx + k[0] * sz * 0.9, base + k[1] * sz]);
      // Halo ring with an orbiting moon.
      const hr = sz * 0.66, hcy = base - sz * 0.5;
      const ghost = (1 - q) * (1 - clamp(info.out * 4));
      for (const k of [0, 3, 2, 5, 7, 6, 4, 13, 14, 8]) { ctx.fillStyle = rgba(col, 0.8 * ghost); ctx.beginPath(); ctx.arc(P[k][0], P[k][1], 6 * u, 0, TAU); ctx.fill(); }
      ctx.strokeStyle = rgba(col, 0.25 + 0.2 * q); ctx.lineWidth = 1.6 * u; dashed(ctx, 2 * u, 11 * u, tt * 10 * u * (i % 2 ? -1 : 1));
      ctx.beginPath(); ctx.arc(cx, hcy, hr, 0, TAU); ctx.stroke(); undash(ctx);
      if (q > 0.5) { const oa = tt * (0.8 + 0.1 * i) + i * 2; spark(ctx, th, cx + Math.cos(oa) * hr, hcy + Math.sin(oa) * hr, 6 * u, col, { a: 0.9 * q, rot: tt }); }
      // Body wash.
      if (q > 0.2) {
        const bg = ctx.createLinearGradient(0, P[0][1], 0, base);
        bg.addColorStop(0, rgba(col, 0.26 * q)); bg.addColorStop(1, rgba(col, 0.03 * q));
        ctx.fillStyle = bg; ctx.beginPath();
        [2, 3, 10, 12, 14, 13, 11, 9].forEach((k, j) => { if (j) ctx.lineTo(P[k][0], P[k][1]); else ctx.moveTo(P[k][0], P[k][1]); }); ctx.closePath(); ctx.fill();
      }
      // Edges draw on in order.
      ctx.strokeStyle = rgba(col, 0.95); ctx.lineWidth = (hot ? 3.4 : 2.8) * u;
      FIG.edges.forEach(([a, b], e) => {
        const f = eo(seg(q, (e / FIG.edges.length) * 0.65, (e / FIG.edges.length) * 0.65 + 0.3)); if (f <= 0) return;
        ctx.beginPath(); ctx.moveTo(P[a][0], P[a][1]); ctx.lineTo(lerp(P[a][0], P[b][0], f), lerp(P[a][1], P[b][1], f)); ctx.stroke();
      });
      // Head ring and stars at the joints.
      const hr0 = sz * 0.085;
      ctx.strokeStyle = rgba(col, 0.95 * q); ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.arc(P[0][0], P[0][1], hr0 * eo(seg(q, 0, 0.3)), 0, TAU); ctx.stroke();
      pose.forEach((_, k) => {
        const ig = back(seg(q, (k / pose.length) * 0.6, (k / pose.length) * 0.6 + 0.25)); if (ig <= 0) return;
        const tw = 0.8 + 0.2 * Math.sin(tt * 2.4 + k * 1.3 + i);
        spark(ctx, th, P[k][0], P[k][1], (k === 0 ? 11 : [7, 8, 8, 5, 5, 5, 5].indexOf(1) >= 0 ? 6 : 6.5) * u * ig * tw * (hot ? 1.2 : 1), k === 0 || k === 8 ? th.gold : col, { a: 1, rot: tt * 0.4 + k, noGlow: k % 3 === 2 });
      });
      // Name plate under the feet, set in large italic serif so it reads at video size.
      const label = d.badges[i % d.badges.length];
      if (label && q > 0.55) {
        const a = eo(seg(q, 0.55, 1)), size1 = 50 * u, lo = { italic: true, raw: true, weight: 600, ls: 0.01 };
        const f = fitLines(ctx, th, label, size1, 42 * u, box.w / n - 30 * u, lo);
        const tw = Math.max(...f.lines.map((l) => measure(ctx, th, l, f.size, lo)));
        const w = tw + 44 * u, ph = 30 * u + f.lines.length * f.size * 1.05;
        const px = cx - w / 2, py = base + 44 * u + (S.tall && i % 2 ? ph + 16 * u : 0) + (1 - a) * 16 * u;
        ctx.save(); ctx.globalAlpha *= a;
        ctx.beginPath(); ctx.roundRect(px, py, w, ph, 8 * u);
        const pg = ctx.createLinearGradient(0, py, 0, py + ph); pg.addColorStop(0, rgba(th.light ? mix(th.bg, th.ink, 0.1) : [18, 16, 50], 0.92)); pg.addColorStop(1, rgba(th.light ? mix(th.bg, th.ink, 0.2) : [8, 8, 30], 0.92));
        ctx.fillStyle = pg; ctx.fill(); ctx.strokeStyle = rgba(col, 0.95); ctx.lineWidth = 2.2 * u; ctx.stroke();
        ctx.beginPath(); ctx.roundRect(px + 6 * u, py + 6 * u, w - 12 * u, ph - 12 * u, 4 * u); ctx.strokeStyle = rgba(col, 0.4); ctx.lineWidth = 1 * u; ctx.stroke();
        f.lines.forEach((line, li) => sc(ctx, th, line, cx, py + 15 * u + f.size * (0.82 + li * 1.05), f.size, { ...lo, align: "center", color: hot ? rgba(th.gold, 1) : th.inkS, halo: false }));
        ctx.restore();
      }
    }
    // The shared card: one engraved plate above the group, and a constellation line drawn from every
    // figure's head to it, so everyone is visibly looking at the same card.
    const cw = Math.min(box.w * 0.3, 420 * u), chh = cw * 0.42;
    const ccx = box.x + box.w * (S.tall ? 0.5 : 0.56), ccy = S.tall ? box.y + chh * 0.5 + 10 * u : box.y - chh * 0.5 + 22 * u;
    const cq = eo(seg(p, 0.15, 0.55));
    if (cq > 0) {
      const cx0 = ccx - cw / 2, cy0 = ccy - chh / 2 + Math.sin(tt * 1.2) * 4 * u;
      ctx.save(); ctx.globalAlpha *= cq;
      glow(ctx, th, ccx, cy0 + chh / 2, cw * 0.7, th.gold, 0.22 + 0.06 * Math.sin(tt * 1.8));
      ctx.beginPath(); ctx.roundRect(cx0, cy0, cw, chh, 10 * u);
      ctx.fillStyle = rgba(th.light ? mix(th.bg, th.ink, 0.12) : [14, 13, 44], 0.94); ctx.fill();
      ctx.strokeStyle = rgba(th.gold, 1); ctx.lineWidth = 2.6 * u; ctx.stroke();
      ctx.beginPath(); ctx.roundRect(cx0 + 7 * u, cy0 + 7 * u, cw - 14 * u, chh - 14 * u, 6 * u); ctx.strokeStyle = rgba(th.gold, 0.4); ctx.lineWidth = 1 * u; ctx.stroke();
      // Its face: a tiny dial and three star tracks, the same parts as a proposal card.
      const dr = chh * 0.3, dcx = cx0 + chh * 0.48, dcy = cy0 + chh / 2;
      degreeRing(ctx, th, dcx, dcy, dr, tt * 8, { a: 0.95, step: 10, minor: 4, major: 8, gap: 6, w: 1.6 });
      spark(ctx, th, dcx, dcy, 8 * u, th.gold, { a: 1, rot: tt, spikes: 8 });
      const ph2 = mod(tt * PLAY, 1);
      for (let k = 0; k < 3; k++) {
        const ly = cy0 + chh * (0.3 + 0.2 * k), lx0 = cx0 + chh * 0.95, lx1 = cx0 + cw - 20 * u;
        ctx.strokeStyle = rgba(k === 1 ? th.cyan : th.gold, 0.8); ctx.lineWidth = 1.4 * u; ctx.beginPath();
        const pts = []; for (let m = 0; m <= 5; m++) pts.push([lerp(lx0, lx1, m / 5), ly + (m % 5 === 0 ? 0 : (h2(k, m, 7) - 0.5) * 12 * u)]);
        pts.forEach(([x, y], m) => (m ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
        pts.forEach(([x, y], m) => spark(ctx, th, x, y, (m % 5 === 0 ? 4.5 : 3) * u, m % 5 === 0 ? th.gold : th.star, { a: 1, rot: tt * 0.4 + m, noGlow: true }));
      }
      const pxh = lerp(cx0 + chh * 0.95, cx0 + cw - 20 * u, ph2);
      ctx.strokeStyle = rgba(th.gold, 0.95); ctx.lineWidth = 1.8 * u; ctx.beginPath(); ctx.moveTo(pxh, cy0 + chh * 0.2); ctx.lineTo(pxh, cy0 + chh * 0.8); ctx.stroke();
      ctx.restore();
      // Lines from each head to the card's lower edge.
      for (let i = 0; i < n; i++) {
        const hot = i === hotIdx, sz = size * (hot ? 1.08 : 1), cx = cxs[i];
        const head = [cx + figurePose(i, hot, tt)[0][0] * sz * 0.9, base + figurePose(i, hot, tt)[0][1] * sz - sz * 0.09];
        const tgt = [ccx + (i - (n - 1) / 2) * (cw / (n + 1)), cy0 + chh + (S.tall ? 0 : 0)];
        const mid = [lerp(head[0], tgt[0], 0.5) + (i - (n - 1) / 2) * 30 * u, lerp(head[1], tgt[1], 0.55)];
        const line = [head, mid, tgt];
        const lc = eo(seg(p, 0.5 + i * 0.06, 0.82 + i * 0.06));
        if (lc <= 0) continue;
        ctx.strokeStyle = rgba(hot ? th.gold : mix(th.cyan, WHITE, 0.2), 0.95); ctx.lineWidth = 2.4 * u; dashed(ctx, 6 * u, 6 * u, -tt * 14 * u); pathPartial(ctx, line, lc); ctx.stroke(); undash(ctx);
        if (lc > 0.5) spark(ctx, th, mid[0], mid[1], 6 * u * (0.85 + 0.15 * Math.sin(tt * 2.4 + i)), hot ? th.gold : th.star, { a: seg(lc, 0.5, 0.7), rot: tt + i });
        if (lc > 0.98) runner(ctx, th, line, mod(tt * 0.4 + i * 0.23, 1), hot ? th.gold : th.cyan, u, 0.2, 5);
      }
    }
    ctx.restore();
  }

  // ---- process: three bodies along a dotted orbit, a comet travelling between them --------------------
  function body(ctx, th, kind, x, y, R, tt, a, hot) {
    ctx.save(); ctx.globalAlpha *= a;
    if (kind === 0) {
      glow(ctx, th, x, y, R * 2, th.star, 0.35);
      const g = ctx.createRadialGradient(x - R * 0.4, y - R * 0.4, R * 0.1, x, y, R); g.addColorStop(0, "#fff7e2"); g.addColorStop(1, "#b9a98a");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.clip();
      ctx.fillStyle = "rgba(120,104,84,0.45)";
      for (const [cx2, cy2, cr] of [[-0.3, -0.2, 0.2], [0.25, 0.3, 0.16], [0.35, -0.35, 0.1], [-0.2, 0.45, 0.1]]) { ctx.beginPath(); ctx.arc(x + cx2 * R, y + cy2 * R, cr * R, 0, TAU); ctx.fill(); }
      const ph = Math.sin(tt * 0.5) * 0.12;
      ctx.fillStyle = rgba(th.light ? [60, 50, 90] : [6, 6, 30], 0.82); ctx.beginPath(); ctx.arc(x + R * (0.52 + ph), y - R * 0.05, R * 1.02, 0, TAU); ctx.fill();
      ctx.restore();
    } else if (kind === 1) {
      glow(ctx, th, x, y, R * 2.2, th.gold, 0.4);
      ctx.fillStyle = rgba(th.gold, 0.95); ctx.beginPath();
      for (let k = 0; k < 16; k++) { const ang = tt * 0.25 + (k * TAU) / 16, rr = R * (k % 4 === 0 ? 1.0 : k % 2 === 0 ? 0.7 : 0.36); const X = x + Math.cos(ang) * rr, Y = y + Math.sin(ang) * rr; if (k) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); const ang2 = ang + TAU / 32; ctx.lineTo(x + Math.cos(ang2) * R * 0.2, y + Math.sin(ang2) * R * 0.2); }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(th.gold, 0.9); ctx.lineWidth = 2 * th.u; ctx.beginPath(); ctx.arc(x, y, R * 0.55, 0, TAU); ctx.stroke();
      ctx.fillStyle = rgba(th.light ? th.bg : [14, 12, 40], 1); ctx.beginPath(); ctx.arc(x, y, R * 0.18, 0, TAU); ctx.fill();
    } else {
      glow(ctx, th, x, y, R * 3.2, th.warn, 0.45);
      for (let k = 0; k < 28; k++) { const ang = (k * TAU) / 28 + tt * 0.15, L = R * (1.35 + 0.35 * Math.sin(tt * 3 + k * 2.1) + (k % 2) * 0.25); ctx.strokeStyle = rgba(mix(th.gold, th.warn, k % 2 ? 0.7 : 0.1), 0.85); ctx.lineWidth = 2.4 * th.u; ctx.beginPath(); ctx.moveTo(x + Math.cos(ang) * R * 1.05, y + Math.sin(ang) * R * 1.05); ctx.lineTo(x + Math.cos(ang) * L, y + Math.sin(ang) * L); ctx.stroke(); }
      const g = ctx.createRadialGradient(x - R * 0.2, y - R * 0.2, R * 0.05, x, y, R); g.addColorStop(0, "#fffbe8"); g.addColorStop(0.5, rgba(th.gold, 1)); g.addColorStop(1, rgba(th.warn, 1));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  function processScene(ctx, S, th, box, p, d, info, tt) {
    const u = S.u, n = d.steps.length, tall = S.tall;
    const R = Math.min(tall ? box.w * 0.14 : box.h * 0.15, 120 * u);
    const nodes = d.steps.map((_, i) => tall
      ? [box.x + box.w * (i % 2 ? 0.7 : 0.3), box.y + box.h * (0.14 + 0.36 * i)]
      : [box.x + box.w * (0.13 + 0.37 * i), box.y + box.h * (i % 2 ? 0.3 : 0.5)]);
    const path = catmull([[nodes[0][0] - (tall ? 0 : 120 * u), nodes[0][1] - (tall ? 120 * u : 0)], ...nodes, [nodes[n - 1][0] + (tall ? 0 : 120 * u), nodes[n - 1][1] + (tall ? 120 * u : 0)]], 24);
    ctx.save(); ctx.lineCap = "round";
    // Orbit skeleton (always there) and the drawn-on route.
    ctx.strokeStyle = rgba(th.gold, 0.25); ctx.lineWidth = 1.6 * u; dashed(ctx, 2 * u, 12 * u, -tt * 8 * u); pathPartial(ctx, path, 1); ctx.stroke(); undash(ctx);
    const route = eo(seg(p, 0.1, 0.9));
    ctx.strokeStyle = rgba(th.gold, 0.9); ctx.lineWidth = 3 * u; dashed(ctx, 3 * u, 9 * u, -tt * 18 * u); pathPartial(ctx, path, route); ctx.stroke(); undash(ctx);
    // A wider ellipse echoing the route gives depth.
    ctx.strokeStyle = rgba(th.cyan, 0.2); ctx.lineWidth = 1.2 * u; dashed(ctx, 2 * u, 10 * u, tt * 9 * u);
    ctx.beginPath(); ctx.ellipse(box.x + box.w / 2, box.y + box.h / 2, box.w * 0.52, box.h * 0.46, tall ? 1.4 : 0.1, 0, TAU); ctx.stroke(); undash(ctx);
    // Chevrons between nodes.
    for (let i = 0; i < n - 1; i++) {
      const f = (i + 0.5) / (n - 1) * 0.8 + 0.1, [x, y, ang] = pointAt(path, f), a = eo(seg(p, 0.3 + i * 0.25, 0.55 + i * 0.25));
      if (a <= 0) continue;
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.strokeStyle = rgba(th.gold, a); ctx.lineWidth = 3.2 * u; ctx.beginPath(); ctx.moveTo(-10 * u, -14 * u); ctx.lineTo(8 * u, 0); ctx.lineTo(-10 * u, 14 * u); ctx.stroke(); ctx.restore();
    }
    const nums = ["I", "II", "III", "IV"];
    d.steps.forEach((label, i) => {
      const q0 = eo(seg(p, 0.05 + i * 0.22, 0.4 + i * 0.22)), q = 0.3 + 0.7 * q0, [x, y] = nodes[i], last = i === n - 1;
      const bob = Math.sin(tt * 1.4 + i * 1.9) * 6 * u;
      degreeRing(ctx, th, x, y + bob, R * 1.75 * (0.75 + 0.25 * q), tt * (i % 2 ? -7 : 7), { a: q * 0.85, step: 5, minor: 6, major: 12, gap: 14, nums: true, numSize: 19, numOut: 20, col: last ? th.gold : th.cyan });
      ctx.strokeStyle = rgba(th.gold, 0.35 * q); ctx.lineWidth = 1.2 * u; dashed(ctx, 2 * u, 8 * u, tt * 12 * u);
      ctx.beginPath(); ctx.arc(x, y + bob, R * 1.3, 0, TAU); ctx.stroke(); undash(ctx);
      body(ctx, th, i % 3, x, y + bob, R * back(seg(q0, 0, 0.8)) * (1 + 0.025 * Math.sin(tt * 2 + i)), tt, clamp(q0 * 3), last);
      // numeral medallion
      const nx = x - R * 1.35, ny = y + bob - R * 1.25;
      ctx.strokeStyle = rgba(th.gold, q); ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.arc(nx, ny, 34 * u, 0, TAU); ctx.stroke();
      sc(ctx, th, nums[i], nx, ny + 12 * u, 36 * u, { italic: true, raw: true, align: "center", color: rgba(th.gold, 1), a: q, halo: false, ls: 0.04 });
      {
        const a = 0.4 + 0.6 * eo(seg(q0, 0.2, 1));
        const maxW = tall ? box.w * 0.46 : box.w * 0.3;
        const f = fitLines(ctx, th, label, 46 * u, 42 * u, maxW);
        const side = tall ? (i % 2 ? -1 : 1) : 0;
        f.lines.forEach((line, li) => {
          if (tall) sc(ctx, th, line, x + side * (R * 1.9), y + bob + 14 * u + li * 50 * u - (f.lines.length - 1) * 25 * u, f.size, { align: side > 0 ? "left" : "right", a, color: last ? rgba(th.gold, 1) : th.inkS });
          else sc(ctx, th, line, x, y + bob + R * 1.75 + 58 * u + li * 50 * u, f.size, { align: "center", a, color: last ? rgba(th.gold, 1) : th.inkS });
        });
      }
    });
    // The comet makes the rounds for the whole hold.
    if (route > 0.97) runner(ctx, th, path, mod(tt * 0.2, 1), th.gold, u, 0.16, 8);
    ctx.restore();
  }

  // ---- compare: two engraved dials ----------------------------------------------------------------
  function dial(ctx, th, cx, cy, R, frac, q, col, tt, hot, valueText, life) {
    const u = th.u, a0 = 135 * RAD, span = 270 * RAD, hub = R * 0.4;
    ctx.save(); ctx.lineCap = "round";
    const disc = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R);
    disc.addColorStop(0, rgba(col, hot ? 0.2 : 0.14)); disc.addColorStop(1, rgba(col, 0.02));
    ctx.fillStyle = disc; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    degreeRing(ctx, th, cx, cy, R, tt * (6 + 4 * life) * (hot ? -1 : 1), { a: 0.9, step: 5, minor: 8, major: 16, gap: 20, nums: true, numSize: 23, numOut: 26, col, w: 3 });
    degreeRing(ctx, th, cx, cy, R * 0.78, tt * 2 * (hot ? 1 : -1), { a: 0.5, step: 9, minor: 5, major: 5, gap: 8, col, w: 1.4 });
    // Track and value arc.
    const rv = R * 0.64;
    ctx.strokeStyle = rgba(col, 0.2); ctx.lineWidth = 16 * u; ctx.beginPath(); ctx.arc(cx, cy, rv, a0, a0 + span); ctx.stroke();
    const end = a0 + span * frac * q;
    ctx.strokeStyle = rgba(col, 0.95); ctx.lineWidth = 16 * u; ctx.shadowColor = rgba(col, 0.8); ctx.shadowBlur = 22 * u; ctx.beginPath(); ctx.arc(cx, cy, rv, a0, Math.max(a0 + 0.001, end)); ctx.stroke(); ctx.shadowBlur = 0;
    // Radar sweep through the annulus only, so the count in the hub stays clean.
    if (ctx.createConicGradient) {
      const sw = tt * 1.1 * (hot ? 1 : -1), g = ctx.createConicGradient(sw, cx, cy);
      g.addColorStop(0, rgba(col, 0.32)); g.addColorStop(0.16, rgba(col, 0)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 0.78, 0, TAU); ctx.arc(cx, cy, hub, 0, TAU, true); ctx.fill();
    }
    // Hub: an engraved inner ring holding the count.
    ctx.fillStyle = rgba(th.light ? th.bg : [6, 7, 28], 0.72); ctx.beginPath(); ctx.arc(cx, cy, hub, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = 2.4 * u; ctx.beginPath(); ctx.arc(cx, cy, hub, 0, TAU); ctx.stroke();
    ctx.strokeStyle = rgba(col, 0.4); ctx.lineWidth = 1 * u; dashed(ctx, 2 * u, 6 * u, tt * 10 * u * (hot ? 1 : -1)); ctx.beginPath(); ctx.arc(cx, cy, hub - 9 * u, 0, TAU); ctx.stroke(); undash(ctx);
    // Needle: starts at the hub ring and runs out to the scale; it breathes once settled.
    const na = end + (q > 0.95 ? Math.sin(tt * 2.2 + (hot ? 0 : 1.3)) * (0.03 + 0.05 * life) : 0);
    const n0 = hub + 6 * u, n1 = R * 0.8;
    ctx.strokeStyle = rgba(th.light ? th.ink : WHITE, 0.95); ctx.lineWidth = 4 * u;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(na) * n0, cy + Math.sin(na) * n0); ctx.lineTo(cx + Math.cos(na) * n1, cy + Math.sin(na) * n1); ctx.stroke();
    ctx.fillStyle = rgba(col, 1); ctx.beginPath(); ctx.arc(cx + Math.cos(na) * n0, cy + Math.sin(na) * n0, 6 * u, 0, TAU); ctx.fill();
    spark(ctx, th, cx + Math.cos(na) * n1, cy + Math.sin(na) * n1, (10 + 3 * life * Math.sin(tt * 3)) * u, col, { a: 1, rot: tt * 2 });
    // Orbiting moon on the outer ring.
    const oa = tt * 0.6 * (hot ? 1 : -1) + (hot ? 0 : 2); spark(ctx, th, cx + Math.cos(oa) * (R + 6 * u), cy + Math.sin(oa) * (R + 6 * u), 7 * u, col, { a: 0.9, rot: tt });
    // The count sits alone in the hub.
    const z = Math.min(hub * 1.25, 150 * u);
    numText(ctx, th, valueText, cx, cy + z * 0.36, z, hot ? rgba(th.gold, 1) : th.inkS, "center", hub * 1.7);
    ctx.restore();
  }
  function compareScene(ctx, S, th, box, p, d, info, tt) {
    const u = S.u, tall = S.tall;
    const R = tall ? Math.min(box.w * 0.34, box.h * 0.17) : Math.min(box.h * 0.36, box.w * 0.17);
    const max = Math.max(d.leftValue, d.rightValue, 1);
    const pos = tall ? [[box.x + box.w / 2, box.y + box.h * 0.2], [box.x + box.w / 2, box.y + box.h * 0.7]] : [[box.x + box.w * 0.24, box.y + box.h * 0.43], [box.x + box.w * 0.76, box.y + box.h * 0.43]];
    ctx.save(); ctx.lineCap = "round";
    // Connector with a travelling light and a star between.
    const [A, B] = pos, mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    const life = seg(p, 0.85, 1) * (info.last ? 1 : 0.6);
    const arc = []; for (let k = 0; k <= 40; k++) { const f = k / 40; arc.push([lerp(A[0] + (tall ? 0 : R * 1.3), B[0] - (tall ? 0 : R * 1.3), f) + (tall ? Math.sin(f * Math.PI) * 120 * u : 0), lerp(A[1] + (tall ? R * 1.3 : 0), B[1] - (tall ? R * 1.3 : 0), f) - (tall ? 0 : Math.sin(f * Math.PI) * 90 * u)]); }
    const cc = eo(seg(p, 0.35, 0.85));
    ctx.strokeStyle = rgba(th.gold, 0.7); ctx.lineWidth = 2.4 * u; dashed(ctx, 3 * u, 10 * u, -tt * 16 * u); pathPartial(ctx, arc, cc); ctx.stroke(); undash(ctx);
    if (cc > 0.98) { runner(ctx, th, arc, mod(tt * 0.35, 1), th.gold, u, 0.18, 6); const e = arc[arc.length - 1], pe = arc[arc.length - 3]; const ang = Math.atan2(e[1] - pe[1], e[0] - pe[0]); ctx.save(); ctx.translate(e[0], e[1]); ctx.rotate(ang); ctx.strokeStyle = rgba(th.gold, 1); ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.moveTo(-14 * u, -12 * u); ctx.lineTo(2 * u, 0); ctx.lineTo(-14 * u, 12 * u); ctx.stroke(); ctx.restore(); }
    const mp = pointAt(arc, 0.5); spark(ctx, th, mp[0], mp[1], 14 * u * eo(seg(p, 0.5, 0.9)) * (1 + 0.25 * life * Math.sin(tt * 2.4)), th.gold, { a: 1, rot: tt * 0.6, spikes: 8 });
    // Settled: a second, finer constellation line links the two hubs and stars sparkle along it in turn.
    if (life > 0) {
      const arc2 = arc.map(([x, y], k) => { const f = k / (arc.length - 1); return [x, y + (tall ? 0 : Math.sin(f * Math.PI) * 170 * u)].map((v, j) => (tall && j === 0 ? v - Math.sin(f * Math.PI) * 240 * u : v)); });
      ctx.strokeStyle = rgba(th.cyan, 0.55 * life); ctx.lineWidth = 1.6 * u; dashed(ctx, 2 * u, 8 * u, tt * 12 * u); pathPartial(ctx, arc2, life); ctx.stroke(); undash(ctx);
      for (let k = 1; k <= 5; k++) { const f = k / 6, qk = pointAt(arc2, f), tw = Math.max(0, Math.sin(tt * 2.6 - k * 0.9)); if (f < life) spark(ctx, th, qk[0], qk[1], (5 + 6 * tw) * u, k % 2 ? th.cyan : th.gold, { a: 0.4 + 0.6 * tw, rot: tt + k }); }
    }
    [[d.left, d.leftValue, th.cyan, false], [d.right, d.rightValue, th.gold, true]].forEach(([label, value, col, hot], i) => {
      const q = eo(seg(p, i * 0.22, i * 0.22 + 0.62)), [x, y] = pos[i];
      dial(ctx, th, x, y, R * (0.88 + 0.12 * q), value / max, q, col, tt, hot, M.formatNumber(value * q, 0, d.prefix, d.suffix), life);
      // Settled: the winning dial flares on a slow beat, rings rolling out from the bezel.
      if (hot && life > 0) {
        const beat = mod(tt * 0.7, 1), Rr = R * (0.88 + 0.12 * q);
        for (const off of [0, 0.5]) { const f = mod(beat + off, 1); ctx.strokeStyle = rgba(col, 0.55 * (1 - f) * life); ctx.lineWidth = 2.4 * u; ctx.beginPath(); ctx.arc(x, y, Rr * (1.04 + 0.32 * f), 0, TAU); ctx.stroke(); }
      }
      const f = fitLines(ctx, th, label, 48 * u, 42 * u, R * 2.4);
      f.lines.forEach((line, li) => sc(ctx, th, line, x, y + R + (tall ? 84 : 88) * u + li * 50 * u, f.size, { align: "center", a: q, color: hot ? rgba(th.gold, 1) : th.inkS }));
    });
    ctx.restore();
  }

  // ---- tokens ---------------------------------------------------------------------------------------
  return {
    bg: "#070a22", panel: "rgba(14,14,48,0.72)", ink: "#f5ecd5", muted: "rgba(245,236,213,0.78)", accent: "#eac56b", onAccent: "#070a22",
    rule: "rgba(234,197,107,0.5)", track: "rgba(234,197,107,0.14)",
    display: "'Optima', 'Candara', 'Gill Sans', 'Segoe UI', sans-serif", displayWeight: 700, displayCase: "none", displayTracking: "0.01em",
    body: "'Baskerville', 'Hoefler Text', 'Palatino', Georgia, serif", bodyWeight: 600,
    figures: "'Didot', 'Bodoni 72', 'Baskerville', Georgia, serif", radius: 10, motion: "focus", change: "frost",
    kit: { line: 2.5, fill: "glass", panel: "outline" },
    panelEdge: "rgba(234,197,107,0.6)",
    cyan: "#74d9ff", warn: "#ff8068", starCol: "#fff4dc", neb: ["#c2338f", "#5c3fd1", "#1f9fb8"],
    palettes: {
      light: { bg: "#f0e5cb", panel: "rgba(240,229,203,0.82)", ink: "#2b2145", muted: "rgba(43,33,69,0.74)", accent: "#a2641a", onAccent: "#f0e5cb", rule: "rgba(162,100,26,0.5)", track: "rgba(162,100,26,0.14)",
        panelEdge: "rgba(162,100,26,0.6)", cyan: "#1f6f94", warn: "#b5402a", starCol: "#2b2145", neb: ["#c9788f", "#7b6fb8", "#4a9bb0"] },
      dark: { bg: "#03051a", neb: ["#a62a86", "#3d4cd6", "#16a5a0"] },
      mono: { bg: "#0d0e12", ink: "#eeeeee", muted: "rgba(238,238,238,0.78)", accent: "#dcdcdc", onAccent: "#0d0e12", rule: "rgba(220,220,220,0.5)", track: "rgba(220,220,220,0.14)", panelEdge: "rgba(220,220,220,0.6)",
        cyan: "#9aa0aa", warn: "#c8c8c8", starCol: "#f4f4f4", neb: ["#6a6d78", "#4a4d58", "#8a8d98"] },
    },
    textShadow: (accent) => "0 2px 22px rgba(2,3,20,0.85), 0 0 3px rgba(2,3,20,0.6)",
    backdrop: (accent, texture = 1, look) => {
      const light = lum(rgb(look.bg)) > 150;
      const grain = rngGrain(texture);
      return light
        ? `${grain}, radial-gradient(120% 95% at 30% 25%, #f7edd5 0%, #efe3c6 55%, #dccaa0 100%)`
        : `${grain}, radial-gradient(120% 95% at 28% 22%, #14123e 0%, ${look.bg} 55%, #02030f 100%)`;
    },
    css: (accent, look) => {
      const light = lum(rgb(look.bg)) > 150;
      const edge = accent;
      return `#title-scene .kicker { display: flex; align-items: center; gap: 0.7em; zoom: 1.5; font-family: ${look.display}; font-weight: 700; letter-spacing: 0.18em; color: ${light ? accent : "#f6dc97"}; text-shadow: ${light ? "0 1px 0 rgba(255,248,230,0.9)" : "0 1px 10px rgba(2,3,20,0.95), 0 0 2px rgba(2,3,20,0.9)"}; }
      #title-scene .kicker::before { content: ""; width: 2.6em; height: 1.5px; background: linear-gradient(90deg, transparent, ${edge}); }
      #title-scene .kicker::after { content: "\\25C6"; font-size: 0.6em; color: ${edge}; letter-spacing: 0; }
      .scene h2.display::after, #title-scene h1.display::after { content: ""; display: block; width: 5.2em; height: 2px; margin-top: 0.34em; background: linear-gradient(90deg, ${edge}, transparent); }
      #closing::after { content: ""; display: block; width: 4em; height: 2px; margin-top: 0.3em; background: linear-gradient(90deg, ${edge}, transparent); }
      @media (min-aspect-ratio: 1/1) { #title { max-width: 62%; } #closing { max-width: 66%; } }
      #title, #closing, .scene h2.display { text-wrap: balance; }
      .display { color: ${look.ink}; text-shadow: ${light ? "0 1px 0 rgba(255,248,230,0.8)" : "0 2px 22px rgba(2,3,20,0.85), 0 0 3px rgba(2,3,20,0.6)"}; }`;
    },
    // Other templates get the nebula band and its star dust on the texture canvas.
    paint: (ctx, W, H, t, accent, look) => {
      const th = themeFrom(look, accent, Math.min(W, H) / 1080);
      nebula(ctx, W, H, t, th);
      dustStars(ctx, W, H, t, th);
    },
    keepArt: true,
    overlap: true,
    stage,
    scenes: { chart: wrap("chart", chartScene), object: wrap("object", objectScene), people: wrap("people", peopleScene), process: wrap("process", processScene), compare: wrap("compare", compareScene) },
  };

  function rngGrain(texture) {
    return "url(\"data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='6' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 " + (0.05 * texture) + " 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>") + "\")";
  }
});
