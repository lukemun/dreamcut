// Watercolor: a sheet of cold-press paper where every scene is painted wet-in-wet. A graphite
// underdrawing goes down first, then layered low-alpha washes bloom outward from where the brush
// touched, pooling darker at their edges, granulating and leaving white paper for highlights.
// Between scenes a broad clear-water glaze sweeps across the sheet, lifts the old painting and
// dries back off it, leaving a tide line. Each scene keeps moving while it holds: water stirs in
// the rinse jars, a paper boat sails, people sway and blink, clouds drift, film runs along a river.
// All motifs are original. Frames are pure functions of time; texture is seeded.
window.DreamcutMotion.register("watercolor", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const inout = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const frac = (v) => v - Math.floor(v);
  const HAND = "'Bradley Hand', 'Segoe Print', 'Noteworthy', 'Comic Sans MS', cursive";
  const NOTE = "'Noteworthy', 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive";
  const HEX = /^#[0-9a-f]{6}$/i;
  const rgbOf = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, k) => { const A = rgbOf(a), B = rgbOf(b); return "#" + A.map((v, i) => Math.round(lerp(v, B[i], k)).toString(16).padStart(2, "0")).join(""); };
  const al = (hex, a) => hexA(hex, a);
  const canvas = (w, h) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
  const PIGS = ["blue", "teal", "ochre", "violet", "green", "sienna"];
  const DRAWN = new Set(["chart", "object", "people", "process", "compare"]);

  // ---- geometry ------------------------------------------------------------------------------------
  function resample(pts, closed, seg) {
    const out = [];
    const n = pts.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = pts[i], b = pts[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(L / seg));
      for (let j = 0; j < k; j++) out.push([lerp(a[0], b[0], j / k), lerp(a[1], b[1], j / k)]);
    }
    if (!closed) out.push(pts[n - 1].slice());
    return out;
  }
  const gauss = (r) => (r() + r() + r() + r() - 2) * 0.85;
  // Midpoint displacement: every edge gets a new, pushed-out or pulled-in midpoint.
  function deform(r, P, depth, amt) {
    for (let d = 0; d < depth; d++) {
      const out = [];
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
        const k = 0.5 + (r() - 0.5) * 0.3, g = gauss(r) * amt;
        out.push(a, [a[0] + dx * k - (dy / L) * g * L, a[1] + dy * k + (dx / L) * g * L]);
      }
      P = out;
    }
    return P;
  }
  // Chaikin corner cutting: a wet edge wanders smoothly; it does not tear.
  function smooth(P, it = 2) {
    for (let k = 0; k < it; k++) {
      const out = [];
      for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
      P = out;
    }
    return P;
  }
  function blob(cx, cy, rx, ry, seed, wob = 0.16, n = 56) {
    const r = rng(seed), hs = [];
    for (let k = 2; k <= 6; k++) hs.push([k, (r() * 2 - 1) * wob / Math.sqrt(k - 1), r() * TAU]);
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      let f = 1;
      for (const [k, amp, ph] of hs) f += amp * Math.sin(k * a + ph);
      out.push([cx + Math.cos(a) * rx * f, cy + Math.sin(a) * ry * f]);
    }
    return out;
  }
  function arcPts(cx, cy, r, a0, a1, n = 8) {
    const out = [];
    for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    return out;
  }
  function rrect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    return [...arcPts(x + r, y + r, r, Math.PI, Math.PI * 1.5), ...arcPts(x + w - r, y + r, r, Math.PI * 1.5, TAU), ...arcPts(x + w - r, y + h - r, r, 0, Math.PI / 2), ...arcPts(x + r, y + h - r, r, Math.PI / 2, Math.PI)];
  }
  function polyPath(g, P) { g.beginPath(); P.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); }
  function centroid(P) { let x = 0, y = 0; for (const p of P) { x += p[0]; y += p[1]; } return [x / P.length, y / P.length]; }

  // ---- texture tiles -------------------------------------------------------------------------------
  const tileSets = {};
  function tilesFor(dark) {
    const key = dark ? "d" : "l";
    if (tileSets[key]) return tileSets[key];
    const r = rng(dark ? 515 : 313), N = 256;
    const gran = canvas(N, N), gg = gran.getContext("2d");
    const ink = dark ? "255,255,255" : "20,14,30";
    for (let i = 0; i < 420; i++) {
      const x = r() * N, y = r() * N, cl = 1 + Math.floor(r() * 5);
      for (let j = 0; j < cl; j++) {
        gg.fillStyle = `rgba(${ink},${0.25 + r() * 0.6})`;
        gg.beginPath(); gg.arc(x + (r() - 0.5) * 6, y + (r() - 0.5) * 6, 0.4 + r() * 0.9, 0, TAU); gg.fill();
      }
    }
    // Coarser flocculation: pigment that clumps into visible grains (ultramarine, earths).
    const gran2 = canvas(N, N), g2 = gran2.getContext("2d");
    for (let i = 0; i < 260; i++) {
      const x = r() * N, y = r() * N, cl = 3 + Math.floor(r() * 9);
      for (let j = 0; j < cl; j++) {
        g2.fillStyle = `rgba(${ink},${0.2 + r() * 0.55})`;
        g2.beginPath(); g2.arc(x + (r() - 0.5) * 12, y + (r() - 0.5) * 12, 0.7 + r() * 1.7, 0, TAU); g2.fill();
      }
    }
    const holes = canvas(N, N), hg = holes.getContext("2d");
    for (let i = 0; i < 260; i++) { hg.fillStyle = `rgba(0,0,0,${0.3 + r() * 0.7})`; hg.beginPath(); hg.arc(r() * N, r() * N, 0.6 + r() * 1.8, 0, TAU); hg.fill(); }
    hg.lineCap = "round";
    for (let i = 0; i < 26; i++) {
      hg.strokeStyle = `rgba(0,0,0,${0.3 + r() * 0.5})`; hg.lineWidth = 0.8 + r() * 1.6;
      const x = r() * N, y = r() * N, a = (r() - 0.5) * 0.6, l = 6 + r() * 22;
      hg.beginPath(); hg.moveTo(x, y); hg.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); hg.stroke();
    }
    return (tileSets[key] = { gran, gran2, holes, pats: new Map() });
  }
  // ---- cold-press tooth ------------------------------------------------------------------------------
  // One seamless height map of the paper's tooth. The sheet is lit from it (bumps catch light, pits fall
  // in shadow), and every wash uses the same map: pigment sinks into the pits and is thin on the bumps.
  const toothSets = {};
  function tooth() {
    if (toothSets.t) return toothSets.t;
    const N = 256, r = rng(4242), hgt = new Float32Array(N * N);
    for (const [rad, w] of [[1, 0.28], [2, 0.42], [5, 0.3]]) {
      let f = new Float32Array(N * N);
      for (let i = 0; i < N * N; i++) f[i] = r();
      f = wrapBlur(wrapBlur(f, N, rad), N, rad);
      let lo = 1, hi = 0;
      for (let i = 0; i < N * N; i++) { lo = Math.min(lo, f[i]); hi = Math.max(hi, f[i]); }
      for (let i = 0; i < N * N; i++) hgt[i] += (w * (f[i] - lo)) / Math.max(1e-6, hi - lo);
    }
    const mk = (fn) => { const c = canvas(N, N), g = c.getContext("2d"), img = g.createImageData(N, N); for (let i = 0; i < N * N; i++) { const [v, a] = fn(i); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = a; } g.putImageData(img, 0, 0); return c; };
    const ss = (e0, e1, x) => { const k = clamp((x - e0) / (e1 - e0)); return k * k * (3 - 2 * k); };
    const pits = mk((i) => [0, Math.round(ss(0.52, 0.22, hgt[i]) * 255)]);
    const bumps = mk((i) => [0, Math.round(ss(0.5, 0.78, hgt[i]) * 255)]);
    // Light from the upper left: the slope of the height map shades each bump.
    const lit = (dark) => mk((i) => {
      const x = i % N, y = (i / N) | 0, dx = hgt[y * N + ((x + 1) % N)] - hgt[y * N + ((x - 1 + N) % N)], dy = hgt[((y + 1) % N) * N + x] - hgt[((y - 1 + N) % N) * N + x];
      const l = clamp(0.5 - (dx + dy) * 2.6 + (hgt[i] - 0.5) * 0.35, 0, 1);
      return dark ? [Math.round(l * 70), 255] : [Math.round(218 + l * 37), 255];
    });
    return (toothSets.t = { pits, bumps, lit, N, cache: {} });
  }
  function litTile(dark) { const T = tooth(); return T.cache[dark] || (T.cache[dark] = T.lit(dark)); }

  function pat(g, set, name) {
    let m = set.pats.get(g);
    if (!m) { m = {}; set.pats.set(g, m); }
    return m[name] || (m[name] = g.createPattern(set[name], "repeat"));
  }

  // ---- pigment noise ---------------------------------------------------------------------------------
  // Seamless fractal noise (random values blurred with wrap-around), kept as an alpha map. It drives
  // where pigment pooled, where a second colour ran in, where the wet edge broke up.
  function wrapBlur(src, N, rad) {
    const out = new Float32Array(N * N), out2 = new Float32Array(N * N), d = rad * 2 + 1;
    for (let y = 0; y < N; y++) { let s = 0; for (let k = -rad; k <= rad; k++) s += src[y * N + ((k + N) % N)]; for (let x = 0; x < N; x++) { out[y * N + x] = s / d; s += src[y * N + ((x + rad + 1) % N)] - src[y * N + ((x - rad + N) % N)]; } }
    for (let x = 0; x < N; x++) { let s = 0; for (let k = -rad; k <= rad; k++) s += out[((k + N) % N) * N + x]; for (let y = 0; y < N; y++) { out2[y * N + x] = s / d; s += out[((y + rad + 1) % N) * N + x] - out[((y - rad + N) % N) * N + x]; } }
    return out2;
  }
  const noiseTiles = {};
  function noiseTile(kind, v = 0) {
    const nk = kind + v;
    if (noiseTiles[nk]) return noiseTiles[nk];
    const N = 256, r = rng((kind === "a" ? 9101 : 9202) + v * 577), sum = new Float32Array(N * N);
    // Each variant mixes its octaves differently, so lifts and pools never repeat one silhouette.
    const octs = kind === "a" ? [[[22, 0.55], [9, 0.3], [3, 0.15]], [[30, 0.45], [12, 0.35], [4, 0.2]], [[16, 0.6], [6, 0.28], [2, 0.12]], [[26, 0.4], [14, 0.4], [5, 0.2]]][v % 4] : [[5, 0.55], [2, 0.45]];
    for (const [rad, w] of octs) {
      let f = new Float32Array(N * N);
      for (let i = 0; i < N * N; i++) f[i] = r();
      f = wrapBlur(wrapBlur(f, N, rad), N, rad);
      let lo = 1, hi = 0;
      for (let i = 0; i < N * N; i++) { lo = Math.min(lo, f[i]); hi = Math.max(hi, f[i]); }
      for (let i = 0; i < N * N; i++) sum[i] += (w * (f[i] - lo)) / Math.max(1e-6, hi - lo);
    }
    const c = canvas(N, N), g = c.getContext("2d"), img = g.createImageData(N, N);
    for (let i = 0; i < N * N; i++) { const v = clamp((sum[i] - 0.3) / 0.45), sv = v * v * (3 - 2 * v); img.data[i * 4 + 3] = Math.round(sv * 255); }
    g.putImageData(img, 0, 0);
    return (noiseTiles[nk] = c);
  }
  let NZ = null, RM = null, FE = null;
  function grow(cv, w, h) { return !cv || cv.width < w || cv.height < h ? canvas(Math.max(w, cv ? cv.width : 0), Math.max(h, cv ? cv.height : 0)) : cv; }
  function reset(s) { s.setTransform(1, 0, 0, 1, 0, 0); s.globalCompositeOperation = "source-over"; s.globalAlpha = 1; s.filter = "none"; }
  // A tinted noise field the size of a wash, at scale `sc` and offset (ox, oy) in tile pixels.
  function noiseInto(w, h, kind, color, sc, ox, oy, v = 0, rot = 0) {
    NZ = grow(NZ, w, h);
    const s = NZ.getContext("2d");
    reset(s); s.clearRect(0, 0, NZ.width, NZ.height);
    if (!s.__pats || s.__cv !== NZ) { s.__pats = {}; s.__cv = NZ; }
    const pk = kind + (v % 4);
    const p = s.__pats[pk] || (s.__pats[pk] = s.createPattern(noiseTile(kind, v % 4), "repeat"));
    const diag = Math.hypot(w, h) / sc + 4;
    s.save(); s.translate(w / 2, h / 2); s.rotate(rot); s.scale(sc, sc); s.translate(-ox, -oy); s.fillStyle = p; s.fillRect(ox - diag, oy - diag, diag * 2, diag * 2); s.restore();
    s.globalCompositeOperation = "source-in"; s.fillStyle = color; s.fillRect(0, 0, w, h);
    return NZ;
  }
  // The band just inside a wash's edge where pigment collected as it dried, broken up by noise.
  function rimInto(base, x0, y0, w, h, px, color, r) {
    RM = grow(RM, w, h);
    const s = RM.getContext("2d");
    reset(s); s.clearRect(0, 0, RM.width, RM.height);
    s.translate(-x0, -y0); s.fillStyle = "#000"; polyPath(s, base); s.fill();
    s.globalCompositeOperation = "destination-out"; s.filter = `blur(${px}px)`; polyPath(s, base); s.fill();
    s.setTransform(1, 0, 0, 1, 0, 0); s.filter = "none";
    s.globalAlpha = 0.6; s.drawImage(noiseInto(w, h, "b", "#000", 1 + r() * 0.8, r() * 256, r() * 256, 0, r() * TAU), 0, 0, w, h, 0, 0, w, h);
    s.globalAlpha = 1; s.globalCompositeOperation = "source-in"; s.fillStyle = color; s.fillRect(0, 0, w, h);
    return RM;
  }

  // ---- a wash ---------------------------------------------------------------------------------------
  // Painted once into its own canvas: faint, slightly different layers with feathered edges, a second
  // colour run in wet-in-wet, darker pools and paler lifts across the shape, pigment collected in a
  // dark wet edge, cauliflower backruns, granulation and specks of paper left white. With `line`, a
  // pencil underdrawing of the shape, slightly off register, comes with it.
  // How strongly a pigment granulates: blues, violets and earths settle into the tooth; warm stains stay smooth.
  function granOf(hex) {
    if (!HEX.test(hex || "")) return 1;
    const [R, G, B] = rgbOf(hex), mx = Math.max(R, G, B), mn = Math.min(R, G, B), sat = mx ? (mx - mn) / mx : 0;
    let k = 0.55;
    if (B > R) k += 0.9 * Math.min(1, (B - R) / 120);
    if (R > G && G > B && sat < 0.75 && mx < 210) k += 0.55; // earths: sienna, umber
    if (R > B && G > B * 1.2 && mx > 200) k -= 0.2; // ochres and yellows stay smooth
    return clamp(k, 0.35, 1.5);
  }
  // A line whose weight swells and thins as the hand presses, stroked segment by segment.
  function varStroke(g, P, closed, w, r, alphaJit = 0) {
    const n = P.length, m = closed ? n : n - 1;
    if (m < 1) return;
    let pr = 0.5 + r() * 0.5, tgt = r();
    const a0 = g.globalAlpha;
    g.lineCap = "round";
    for (let i = 0; i < m; i++) {
      if (i % 5 === 0) tgt = r();
      pr = pr * 0.8 + tgt * 0.2;
      const a = P[i], b = P[(i + 1) % n];
      g.lineWidth = w * (0.3 + 1.4 * pr);
      if (alphaJit) g.globalAlpha = a0 * (1 - alphaJit + alphaJit * pr);
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    }
    g.globalAlpha = a0;
  }
  // The hand's wobble along a closed outline: each point is pushed along its normal by a few seeded
  // waves at brush-sized wavelengths, so no edge is a clean geometric curve.
  function handWobble(P, amp, seed, u) {
    const R = resample(P, true, 6 * u), n = R.length, r = rng(seed * 5 + 17);
    let per = 0;
    for (let i = 0; i < n; i++) per += Math.hypot(R[(i + 1) % n][0] - R[i][0], R[(i + 1) % n][1] - R[i][1]);
    const waves = [[140, 1], [60, 0.5], [26, 0.18]].map(([len, w]) => [Math.max(2, Math.round(per / (len * u))), w * amp * (0.7 + r() * 0.6), r() * TAU]);
    return R.map((p, i) => {
      const a = R[(i - 1 + n) % n], b = R[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, s = i / n;
      let e = 0;
      for (const [k, w, ph] of waves) e += w * Math.sin(TAU * k * s + ph);
      return [p[0] - (dy / d) * e, p[1] + (dx / d) * e];
    });
  }
  // A closed line laid in runs: pressure swells and lifts, and here and there the line breaks off entirely.
  function brokenStroke(g, P, w, r, gap = 0.2) {
    const n = P.length, a0 = g.globalAlpha;
    let pr = 0.5, tgt = r(), on = true, run = 4 + Math.floor(r() * 30);
    g.lineCap = "round";
    for (let i = 0; i < n; i++) {
      if (--run <= 0) { on = !on || r() > gap; run = on ? 6 + Math.floor(r() * 40) : 2 + Math.floor(r() * 8); }
      if (i % 4 === 0) tgt = r();
      pr = pr * 0.78 + tgt * 0.22;
      if (!on) continue;
      const A = P[i], B = P[(i + 1) % n];
      g.lineWidth = w * (0.2 + 1.7 * pr * pr); g.globalAlpha = a0 * (0.35 + 0.65 * pr);
      g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke();
    }
    g.globalAlpha = a0;
  }
  // Ink drawn over a painted part: a loose contour, thin where the light falls (upper left) and heavy on
  // the shadow side, lifting off in places, a little off register from the wash.
  function inkLine(g, F, P, w, seed, a = 0.75) {
    const r = rng(seed), n = P.length, u = F.u, [cx, cy] = centroid(P), dx0 = (r() - 0.5) * 3 * u, dy0 = (r() - 0.5) * 3 * u, a0 = g.globalAlpha;
    let pr = 0.6, tgt = 0.6, on = true, run = 10 + Math.floor(r() * 30);
    g.lineCap = "round";
    for (let i = 0; i < n; i++) {
      if (--run <= 0) { on = !on || r() > 0.25; run = on ? 10 + Math.floor(r() * 36) : 1 + Math.floor(r() * 5); }
      if (i % 5 === 0) tgt = 0.3 + r() * 0.9;
      pr = pr * 0.8 + tgt * 0.2;
      if (!on) continue;
      const A = P[i], B = P[(i + 1) % n], mx = (A[0] + B[0]) / 2 - cx, my = (A[1] + B[1]) / 2 - cy, ml = Math.hypot(mx, my) || 1;
      const shadow = 0.5 + 0.5 * ((mx + my) / ml) * 0.7071;
      g.lineWidth = w * (0.35 + 1.5 * shadow) * pr; g.globalAlpha = a0 * a * (0.5 + 0.5 * shadow);
      g.beginPath(); g.moveTo(A[0] + dx0, A[1] + dy0); g.lineTo(B[0] + dx0, B[1] + dy0); g.stroke();
    }
    g.globalAlpha = a0;
  }
  function makeWash(F, pts, o = {}) {
    const u = F.u, T = F.T, seed = o.seed || 1, r = rng(seed), rough = o.rough ?? 0.5;
    // Two scales of wander: a slow drift of the wet edge, then a finer ragged break where it met the tooth.
    const base0 = smooth(deform(r, smooth(deform(r, resample(pts, true, (o.seg ?? 30) * u), 1, rough * 0.22), 1), 1, rough * 0.07), 1);
    const base = o.wobble === 0 ? base0 : handWobble(base0, (o.wobble ?? (1.4 + rough * 3)) * u, seed, u);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of base) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const pad = (20 + rough * 30) * u;
    x0 = Math.floor(x0 - pad); y0 = Math.floor(y0 - pad); x1 = Math.ceil(x1 + pad); y1 = Math.ceil(y1 + pad);
    const c = canvas(x1 - x0, y1 - y0), g = c.getContext("2d"), w = c.width, h = c.height;
    g.translate(-x0, -y0);
    const color = o.color, layers = o.layers ?? 12, a = o.a ?? 0.5, deep = F.deep(color), dens = Math.min(1, a * 1.5);
    const big = Math.max(w, h), small = Math.min(w, h), sc = clamp((big / 256) * 0.5, 0.45, 5);
    const softPx = Math.max(o.soft ?? 0, 1.4) * u, gk = granOf(color);
    // Every noise pass picks its own variant, offset and angle, so no two washes share a pattern.
    const nz = (kind, col, scl) => noiseInto(w, h, kind, col, scl, r() * 256, r() * 256, Math.floor(r() * 4), r() * TAU);
    const hues = [T.violet, T.ochre, T.rose, T.teal, T.sky, T.sienna, T.blue, T.green];
    const color2 = o.color2 || mix(color, hues[(seed * 7 + 3) % hues.length], 0.62);
    const [ccx, ccy] = centroid(base);
    // Wet-into-wet bleeds: at a few points the wet edge let pigment creep out in feathered fingers.
    const nBleed = o.bleeds ?? (small > 110 * u ? 2 : small > 60 * u ? 1 : 0);
    for (let b = 0; b < nBleed; b++) {
      const v = base[Math.floor(r() * base.length)], dx = v[0] - ccx, dy = v[1] - ccy, dl = Math.hypot(dx, dy) || 1;
      const L = pad * (0.5 + r() * 0.35), col = r() < 0.6 ? color2 : color;
      g.filter = `blur(${2.2 * u}px)`; g.fillStyle = col;
      for (let f = 0; f < 3; f++) {
        const fa = Math.atan2(dy, dx) + (r() - 0.5) * 1.1, steps = 5;
        for (let s2 = 0; s2 < steps; s2++) {
          const q = (s2 + 1) / steps, rr = (1 - q * 0.75) * (5 + r() * 6) * u;
          g.globalAlpha = a * 0.32 * (1 - q * 0.6);
          g.beginPath(); g.arc(v[0] + Math.cos(fa) * L * q, v[1] + Math.sin(fa) * L * q, rr, 0, TAU); g.fill();
        }
      }
    }
    g.filter = "none";
    // Feathered spread: where the paper was still damp the wash crept out past its edge in a soft
    // fringe, only along some stretches of the edge (masked by noise), never as an even glow.
    const feather = o.feather ?? (small > 40 * u ? 1 : 0);
    if (feather > 0) {
      FE = grow(FE, w, h);
      const s = FE.getContext("2d");
      reset(s); s.clearRect(0, 0, FE.width, FE.height);
      s.translate(-x0, -y0); s.filter = `blur(${Math.min(pad * 0.45, 5 * u + small * 0.02)}px)`; s.fillStyle = color; polyPath(s, base); s.fill();
      s.setTransform(1, 0, 0, 1, 0, 0); s.filter = "none"; s.globalCompositeOperation = "destination-in";
      s.drawImage(noiseInto(w, h, "a", "#000", sc * (0.4 + r() * 0.4), r() * 256, r() * 256, Math.floor(r() * 4), r() * TAU), 0, 0, w, h, 0, 0, w, h);
      s.globalCompositeOperation = "destination-out"; s.translate(-x0, -y0); s.fillStyle = "#000"; polyPath(s, base); s.fill();
      g.globalAlpha = Math.min(1, a * 0.9 * feather); g.drawImage(FE, 0, 0, w, h, x0, y0, w, h);
      g.globalAlpha = 1;
    }
    for (let i = 0; i < layers; i++) {
      g.globalAlpha = Math.min(1, (a * 2.2) / layers);
      g.fillStyle = i % 3 === 1 ? mix(color, deep, 0.2) : i % 3 === 2 ? mix(color, T.lite, 0.14) : color;
      g.filter = i % 2 ? `blur(${softPx}px)` : "none";
      const sh = 1 - r() * 0.025;
      polyPath(g, smooth(deform(r, base.filter((_, j) => j % 2 === 0), 1, rough * 0.12), 1).map(([x, y]) => [ccx + (x - ccx) * sh, ccy + (y - ccy) * sh])); g.fill();
    }
    g.filter = "none"; g.fillStyle = color;
    g.globalAlpha = Math.min(1, a * 0.85); polyPath(g, base); g.fill();
    // A second colour charged in while wet: it drifts through the wash in soft runs.
    g.globalCompositeOperation = "source-atop"; g.globalAlpha = o.vary ?? 0.6;
    g.drawImage(nz("a", color2, sc * (0.7 + r() * 0.6)), 0, 0, w, h, x0, y0, w, h);
    g.globalAlpha = (o.vary ?? 0.6) * 0.5;
    g.drawImage(nz("a", mix(color, T.lite, 0.4), sc * (0.5 + r() * 0.5)), 0, 0, w, h, x0, y0, w, h);
    // Where colour met colour: one soft bleed of the second hue from an edge into the body.
    if (small > 60 * u) {
      const v = base[Math.floor(r() * base.length)];
      g.save(); polyPath(g, base); g.clip(); g.globalCompositeOperation = "source-over";
      g.globalAlpha = 0.45 * a; g.filter = `blur(${Math.max(6, small * 0.08)}px)`; g.fillStyle = color2;
      polyPath(g, blob(lerp(v[0], ccx, 0.25), lerp(v[1], ccy, 0.25), small * (0.18 + r() * 0.12), small * (0.14 + r() * 0.1), Math.floor(r() * 1e6), 0.3, 24)); g.fill();
      g.restore(); g.filter = "none";
    }
    // Wet-in-wet charges: on a big wash, more pigment of several hues was dropped into the wet paper and
    // spread in soft clouds, so the wash reads as mixed colour with a range of darks, not one tint.
    const charges = o.charges ?? (small > 260 * u ? 6 : small > 150 * u ? 4 : small > 90 * u ? 2 : 0);
    if (charges > 0) {
      const color3 = mix(color, hues[(seed * 3 + 5) % hues.length], 0.5);
      const pal = [deep, color2, color3, mix(deep, T.ink, 0.3), color2, mix(color, T.lite, 0.5)];
      g.save(); polyPath(g, base); g.clip(); g.globalCompositeOperation = "source-over";
      for (let k = 0; k < charges; k++) {
        const bx = lerp(x0 + pad, x1 - pad, r()), by = lerp(y0 + pad, y1 - pad, 0.15 + r() * 0.85);
        const rx = (x1 - x0 - pad * 2) * (0.1 + r() * 0.22), ry = (y1 - y0 - pad * 2) * (0.12 + r() * 0.28);
        g.globalAlpha = Math.min(1, a * (0.45 + r() * 0.55)); g.filter = `blur(${Math.max(4 * u, Math.min(rx, ry) * 0.3)}px)`; g.fillStyle = pal[k % pal.length];
        polyPath(g, blob(bx, by, rx, ry, Math.floor(r() * 1e6), 0.35, 28)); g.fill();
      }
      g.filter = "none"; g.restore();
    }
    // Wet-into-wet shading: the shadow side was charged with deeper pigment while the light side was still
    // wet, so the two meet in a soft, feathered blend with fingers of colour running across, never a seam.
    // o.shade = { x, y, ang, amt }: the blend runs through (x, y); the shadow lies toward angle `ang`.
    if (o.shade) {
      const S2 = o.shade, nx = Math.cos(S2.ang), ny = Math.sin(S2.ang), tx = -ny, ty = nx, BIG = Math.hypot(w, h) * 2, line = [];
      const sr = rng(seed * 11 + 5), ph1 = sr() * TAU, ph2 = sr() * TAU;
      for (let k = 0; k <= 40; k++) {
        const s2 = (k / 40 - 0.5) * BIG, off = Math.sin(s2 / (small * 0.22) + ph1) * small * 0.05 + Math.sin(s2 / (small * 0.07) + ph2) * small * 0.018;
        line.push([S2.x + tx * s2 + nx * off, S2.y + ty * s2 + ny * off]);
      }
      const half = [...line, [line[40][0] + nx * BIG, line[40][1] + ny * BIG], [line[0][0] + nx * BIG, line[0][1] + ny * BIG]];
      g.save(); polyPath(g, base); g.clip(); g.globalCompositeOperation = "source-over";
      // The light side dried paler: pigment lifted off in a broad soft sweep.
      const lightHalf = [...line, [line[40][0] - nx * BIG, line[40][1] - ny * BIG], [line[0][0] - nx * BIG, line[0][1] - ny * BIG]];
      g.globalCompositeOperation = "destination-out"; g.globalAlpha = Math.min(1, (S2.amt ?? 0.5) * 0.4); g.filter = `blur(${Math.max(10 * u, small * 0.14)}px)`;
      polyPath(g, lightHalf.map(([px, py]) => [px - nx * small * 0.1, py - ny * small * 0.1])); g.fill();
      g.globalCompositeOperation = "source-over";
      g.fillStyle = mix(deep, T.ink, 0.25);
      g.globalAlpha = Math.min(1, (S2.amt ?? 0.5) * 0.85); g.filter = `blur(${Math.max(8 * u, small * 0.1)}px)`; polyPath(g, half); g.fill();
      g.globalAlpha = Math.min(1, (S2.amt ?? 0.5) * 0.55); g.filter = `blur(${Math.max(3 * u, small * 0.035)}px)`;
      polyPath(g, half.map(([px, py]) => [px + nx * small * 0.08, py + ny * small * 0.08])); g.fill();
      // Fingers where the wetter side ran back into the drier one, and a few pools of the second hue.
      g.filter = `blur(${Math.max(3 * u, small * 0.02)}px)`;
      for (let k = 0; k < 7; k++) {
        const q = line[6 + Math.floor(sr() * 28)], L2 = small * (0.06 + sr() * 0.12), an = S2.ang + Math.PI + (sr() - 0.5) * 1.2;
        g.globalAlpha = (S2.amt ?? 0.5) * 0.35; g.strokeStyle = k % 3 ? deep : color2; g.lineCap = "round"; g.lineWidth = small * (0.02 + sr() * 0.03);
        g.beginPath(); g.moveTo(q[0], q[1]); g.quadraticCurveTo(q[0] + Math.cos(an + 0.4) * L2 * 0.5, q[1] + Math.sin(an + 0.4) * L2 * 0.5, q[0] + Math.cos(an) * L2, q[1] + Math.sin(an) * L2); g.stroke();
      }
      g.filter = "none"; g.restore();
    }
    // Horizontal wet bands: a loaded brush dragged across, leaving streaks of deeper and paler water.
    const bands = o.bands ?? 0;
    if (bands > 0) {
      g.save(); polyPath(g, base); g.clip(); g.globalCompositeOperation = "source-over";
      for (let k = 0; k < bands; k++) {
        const by = lerp(y0 + pad, y1 - pad, (k + 0.3 + r() * 0.4) / bands), bh = (y1 - y0) * (0.04 + r() * 0.07), bx0 = x0 + (x1 - x0) * r() * 0.3, bx1 = x1 - (x1 - x0) * r() * 0.3;
        const pts2 = [];
        for (let j = 0; j <= 10; j++) pts2.push([lerp(bx0, bx1, j / 10), by + Math.sin(j * 1.3 + k) * bh * 0.4]);
        g.globalAlpha = Math.min(1, a * (0.6 + r() * 0.6)); g.filter = `blur(${Math.max(2 * u, bh * 0.3)}px)`;
        g.strokeStyle = k % 3 === 2 ? mix(color, T.lite, 0.55) : k % 2 ? color2 : deep; g.lineCap = "round"; g.lineWidth = bh;
        g.beginPath(); pts2.forEach(([px, py], j) => (j ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
      }
      g.filter = "none"; g.restore();
    }
    // Uneven drying: darker pools add pigment, paler lifts take it away, at two scales.
    const mott = o.mott ?? 0.8;
    g.save(); polyPath(g, base); g.clip();
    g.globalCompositeOperation = "source-over"; g.globalAlpha = mott * 0.55 * dens;
    g.drawImage(nz("a", deep, sc * (0.6 + r() * 0.5)), 0, 0, w, h, x0, y0, w, h);
    if (small > 90 * u) { g.globalAlpha = mott * 0.35 * dens; g.drawImage(nz("a", mix(deep, T.ink, 0.25), sc * (0.22 + r() * 0.2)), 0, 0, w, h, x0, y0, w, h); }
    // Pigment settles toward the low side of a wet wash.
    const gr = g.createLinearGradient(0, lerp(y0, y1, 0.35), 0, y1 - pad);
    gr.addColorStop(0, al(deep, 0)); gr.addColorStop(1, al(deep, 0.32 * mott * dens));
    g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(x0, y0, w, h);
    g.restore();
    g.globalCompositeOperation = "destination-out"; g.globalAlpha = mott * 0.13;
    g.drawImage(nz("a", "#000", sc * (0.8 + r() * 0.7)), 0, 0, w, h, x0, y0, w, h);
    // Light falls across the wash: it dries paler toward one side in a soft graded lift with no edge,
    // its direction, reach and strength different for every wash.
    const cx = ccx, cy = ccy, lift = o.lift ?? 0.2;
    if (lift > 0) {
      const ang = r() * TAU, reach = Math.max(x1 - x0, y1 - y0) * (0.35 + r() * 0.35);
      const lx = ccx + Math.cos(ang) * (x1 - x0) * 0.22, ly = ccy + Math.sin(ang) * (y1 - y0) * 0.22;
      const lg = g.createRadialGradient(lx, ly, 0, lx, ly, reach);
      lg.addColorStop(0, "rgba(0,0,0,1)"); lg.addColorStop(0.45 + r() * 0.2, "rgba(0,0,0,0.35)"); lg.addColorStop(1, "rgba(0,0,0,0)");
      g.globalCompositeOperation = "destination-out"; g.globalAlpha = lift * (0.25 + r() * 0.3);
      g.save(); g.translate(lx, ly); g.rotate(r() * TAU); g.scale(1, 0.45 + r() * 0.5); g.translate(-lx, -ly); g.fillStyle = lg; g.fillRect(x0 - w, y0 - h, w * 3, h * 3); g.restore();
    }
    // A rounded thing (a sun, a fruit) is shaded as a graded wash: paler where the light strikes it,
    // pigment settled deeper on the far side.
    if (o.shine) {
      const sx = lerp(x0, x1, 0.36), sy = lerp(y0, y1, 0.34), R = Math.max(x1 - x0, y1 - y0) * 0.55;
      g.save(); polyPath(g, base); g.clip();
      const dg = g.createRadialGradient(sx, sy, R * 0.25, sx, sy, R * 1.05);
      dg.addColorStop(0, al(deep, 0)); dg.addColorStop(1, al(deep, 0.5 * o.shine));
      g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.fillStyle = dg; g.fillRect(x0, y0, w, h);
      const hg = g.createRadialGradient(sx, sy, 0, sx, sy, R * 0.55);
      hg.addColorStop(0, al(T.lite, 0.75 * o.shine)); hg.addColorStop(1, al(T.lite, 0));
      g.fillStyle = hg; g.fillRect(x0, y0, w, h);
      g.restore();
    }
    // Pigment collects where the wash dried: a hard dark line right at the edge, a softer band inside.
    // Three bands: a hard dark line where the bead of water dried, a pooled band of pigment just inside it
    // whose width wanders with the noise, and a faint wide halo where the drying pulled colour outward.
    const edge = (o.edge ?? 0.8) * Math.min(1, a * 1.6 + 0.45), rimW = clamp(small * 0.07, 4 * u, 30 * u);
    g.save(); polyPath(g, base); g.clip(); g.globalCompositeOperation = "source-over";
    g.globalAlpha = Math.min(1, edge * 1.1); g.drawImage(rimInto(base, x0, y0, w, h, rimW * 0.16, mix(deep, T.ink, 0.3), r), 0, 0, w, h, x0, y0, w, h);
    g.globalAlpha = Math.min(1, edge * 0.8); g.drawImage(RM, 0, 0, w, h, x0, y0, w, h);
    g.globalAlpha = Math.min(1, edge * 0.75); g.drawImage(rimInto(base, x0, y0, w, h, rimW * 0.55, mix(color, deep, 0.7), r), 0, 0, w, h, x0, y0, w, h);
    g.globalAlpha = edge * 0.3; g.drawImage(rimInto(base, x0, y0, w, h, rimW * 1.8, mix(color, deep, 0.45), r), 0, 0, w, h, x0, y0, w, h);
    // The bead line itself, broken where the water thinned and heavier where it pooled.
    // (Unfiltered: a filter on each short segment would cost a layer per segment.)
    g.strokeStyle = mix(deep, T.ink, 0.25); g.lineJoin = "round"; g.filter = "none";
    g.globalAlpha = Math.min(1, edge * 0.7); brokenStroke(g, base, 2.4 * u, r, 0.22);
    g.filter = "none"; g.restore();
    // A single cauliflower backrun, only where asked for: water crept back into the drying wash and
    // pushed pigment into a frilled ring. Its size, stretch, angle and strength differ every time.
    const nb = Math.min(3, o.backrun ?? o.blooms ?? (o.shine ? 0 : small > 320 * u ? 2 : small > 130 * u ? 1 : 0));
    for (let b = 0; b < nb; b++) {
      const bx = lerp(x0 + pad * 1.5, x1 - pad * 1.5, 0.15 + r() * 0.7), by = lerp(y0 + pad * 1.5, y1 - pad * 1.5, 0.15 + r() * 0.7);
      polyPath(g, base);
      if (!g.isPointInPath(bx - x0, by - y0)) continue; // Outside the wash: skip, keeping the seeded sequence stable.
      const rad = Math.min(small * (0.06 + r() * 0.12), (26 + r() * 50) * u), rot = r() * TAU, st = 0.35 + r() * 0.75;
      const ringP = smooth(deform(r, resample(blob(0, 0, rad, rad * st, Math.floor(r() * 1e6), 0.38, 22), true, 6 * u), 3, 0.5), 1)
        .map(([px, py]) => [bx + px * Math.cos(rot) - py * Math.sin(rot), by + px * Math.sin(rot) + py * Math.cos(rot)]);
      g.globalCompositeOperation = "destination-out"; g.globalAlpha = 0.22 + r() * 0.22; g.filter = `blur(${(2 + r() * 4) * u}px)`;
      polyPath(g, ringP); g.fill();
      g.globalCompositeOperation = "source-atop"; g.globalAlpha = 0.5 + r() * 0.3; g.filter = "none"; g.strokeStyle = deep;
      varStroke(g, ringP, true, 2.6 * u, r, 0.8);
      // Its frilled outer fringe: pigment pushed out in a second, fainter ring.
      g.globalAlpha = 0.22 + r() * 0.15; g.filter = "none"; varStroke(g, ringP.map(([px, py]) => [bx + (px - bx) * 1.18, by + (py - by) * 1.18]), true, 4 * u, r, 0.9);
    }
    g.filter = "none";
    const TL = tilesFor(F.T.dark);
    const gran = (o.gran ?? 0.7) * F.tex * gk;
    if (gran > 0) { // Pigment settled into the paper's tooth where the wash pooled, more for the granulating hues.
      FE = grow(FE, w, h);
      const s = FE.getContext("2d"), gs = 1 + r() * 1.4;
      reset(s); s.clearRect(0, 0, FE.width, FE.height);
      s.globalAlpha = Math.min(1, gran * 0.75);
      s.save(); s.translate(-r() * 256, -r() * 256); s.scale(gs, gs); s.fillStyle = pat(s, TL, "gran"); s.fillRect(0, 0, (w + 512) / gs, (h + 512) / gs); s.restore();
      if (gk > 0.7) { s.globalAlpha = Math.min(1, gran * 0.6); s.save(); s.translate(-r() * 256, -r() * 256); s.rotate(r() * TAU); s.fillStyle = pat(s, TL, "gran2"); s.fillRect(-w - 256, -h - 256, w * 3 + 512, h * 3 + 512); s.restore(); }
      s.globalAlpha = 1; s.globalCompositeOperation = "source-in"; s.fillStyle = mix(deep, T.ink, 0.2); s.fillRect(0, 0, w, h);
      // Only where pigment pooled: settled grain gathers in patches, the lighter passages stay smooth.
      s.globalCompositeOperation = "destination-in"; s.drawImage(noiseInto(w, h, "a", "#000", sc * (0.35 + r() * 0.4), r() * 256, r() * 256, Math.floor(r() * 4), r() * TAU), 0, 0, w, h, 0, 0, w, h);
      g.globalCompositeOperation = "source-atop"; g.globalAlpha = 0.85; g.drawImage(FE, 0, 0, w, h, x0, y0, w, h);
      g.globalAlpha = Math.min(1, gran * 0.28);
      g.drawImage(noiseInto(w, h, "b", deep, 0.6 + r() * 0.5, r() * 256, r() * 256, 0, r() * TAU), 0, 0, w, h, x0, y0, w, h);
    }
    // The tooth: pigment sank into the pits of the cold-press sheet and stayed thin over the bumps, so
    // the paper's grain shows through every wash.
    const tk = (o.tooth ?? 1) * F.tex;
    if (tk > 0) {
      const TT = tooth(), ts = 1.5 * u;
      g.save(); g.globalCompositeOperation = "source-atop"; g.globalAlpha = Math.min(1, 0.55 * tk * (0.6 + 0.4 * gk));
      FE = grow(FE, w, h);
      const s = FE.getContext("2d");
      reset(s); s.clearRect(0, 0, FE.width, FE.height);
      s.save(); s.translate(-x0 % (TT.N * ts), -y0 % (TT.N * ts)); s.scale(ts, ts); s.fillStyle = s.createPattern(TT.pits, "repeat"); s.fillRect(-TT.N, -TT.N, w / ts + TT.N * 2, h / ts + TT.N * 2); s.restore();
      s.globalCompositeOperation = "source-in"; s.fillStyle = mix(deep, T.ink, 0.15); s.fillRect(0, 0, w, h);
      g.drawImage(FE, 0, 0, w, h, x0, y0, w, h);
      g.restore();
      g.save(); g.globalCompositeOperation = "destination-out"; g.globalAlpha = Math.min(1, 0.42 * tk);
      g.translate(x0 - (x0 % (TT.N * ts)), y0 - (y0 % (TT.N * ts))); g.scale(ts, ts); g.fillStyle = g.createPattern(TT.bumps, "repeat"); g.fillRect(-TT.N, -TT.N, w / ts + TT.N * 2, h / ts + TT.N * 2);
      g.restore();
    }
    const holes = (o.holes ?? 0.25) * F.tex;
    if (holes > 0) {
      g.globalCompositeOperation = "destination-out"; g.globalAlpha = holes;
      g.save(); g.translate(r() * 200, r() * 200); g.rotate((r() - 0.5) * 0.6); g.fillStyle = pat(g, TL, "holes"); g.fillRect(x0 - 400, y0 - 400, w + 800, h + 800); g.restore();
    }
    let sk = null;
    if (o.line) { const dx = (r() - 0.5) * 12 * u, dy = (r() - 0.5) * 10 * u; sk = sketch(F, pts.map(([x, y]) => [x + dx, y + dy]), true, seed * 3 + 1); }
    return { c, x: x0, y: y0, w, h, seed: seed * 7 + 3, deep, cx, cy, pts: base, color, sk };
  }
  // Drawing first, then paint: the pencil line runs on over the first part of k, the wash spreads in
  // after it, and the graphite stays readable through the transparent paint.
  function paint(g, F, sp, k, ox, oy, lead = 0.4) {
    if (!sp || k <= 0) return;
    if (!sp.sk) { show(g, F, sp, k, ox, oy); return; }
    show(g, F, sp, span(k, lead * 0.55, 1), ox, oy);
    pencil(g, F, [sp.sk], clamp(k / lead), { alpha: 0.55 });
  }

  // Paint a wash on: it spreads from where the brush touched with a ragged, darker wet front.
  let scratch = null;
  function ring(g, cx, cy, R, seed, u = 1) {
    const r = rng(seed), hs = [], fine = [];
    for (let k = 3; k <= 11; k++) hs.push([k, (r() * 2 - 1) * 0.11 / Math.sqrt(k - 2), r() * TAU]);
    // However large the spread, its wet front stays ragged at the scale of a brush: fixed-size wobbles.
    for (const [len, amp] of [[150, 16], [62, 8], [26, 3.5]]) fine.push([Math.max(3, Math.round((TAU * R) / (len * u))), amp * u * (0.7 + r() * 0.6), r() * TAU]);
    g.beginPath();
    const N = Math.min(900, Math.max(96, Math.ceil((TAU * R) / (8 * u))));
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * TAU;
      let f = 1, e = 0;
      for (const [k, amp, ph] of hs) f += amp * Math.sin(k * a + ph);
      for (const [k, amp, ph] of fine) e += amp * Math.sin(k * a + ph);
      const x = cx + Math.cos(a) * (R * f + e), y = cy + Math.sin(a) * (R * f + e);
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
  }
  function show(g, F, sp, k, ox, oy) {
    if (!sp || k <= 0) return;
    if (k >= 1) { g.drawImage(sp.c, sp.x, sp.y); return; }
    if (!scratch || scratch.width < sp.w || scratch.height < sp.h) scratch = canvas(Math.max(sp.w, scratch ? scratch.width : 0), Math.max(sp.h, scratch ? scratch.height : 0));
    const s = scratch.getContext("2d");
    s.setTransform(1, 0, 0, 1, 0, 0); s.globalCompositeOperation = "source-over"; s.globalAlpha = 1; s.filter = "none";
    s.clearRect(0, 0, sp.w + 2, sp.h + 2);
    const lx = (ox ?? sp.x + sp.w / 2) - sp.x, ly = (oy ?? sp.y + sp.h / 2) - sp.y;
    const R = Math.max(Math.hypot(lx, ly), Math.hypot(sp.w - lx, ly), Math.hypot(lx, sp.h - ly), Math.hypot(sp.w - lx, sp.h - ly)) * 1.3;
    const rad = R * (1 - Math.pow(1 - k, 2));
    ring(s, lx, ly, rad, sp.seed, F.u); s.fillStyle = "#000"; s.fill();
    s.globalCompositeOperation = "source-in"; s.drawImage(sp.c, 0, 0);
    // The wet front: a bead of pigment-laden water pushed ahead of the brush, with darker water pooling
    // just behind it and a glassy sheen over the paint that has not soaked in yet.
    s.globalCompositeOperation = "source-atop"; s.globalAlpha = 0.4 * (1 - k * 0.7);
    s.filter = `blur(${7 * F.u}px)`; ring(s, lx, ly, rad - 10 * F.u, sp.seed, F.u); s.strokeStyle = sp.deep; s.lineWidth = 26 * F.u; s.stroke(); s.filter = "none";
    s.globalAlpha = 0.65 * (1 - k * 0.6);
    ring(s, lx, ly, rad, sp.seed, F.u); s.strokeStyle = sp.deep; s.lineWidth = 5 * F.u; s.stroke();
    if (rad > 20 * F.u) { s.globalAlpha = 0.45 * (1 - k); const sg = s.createRadialGradient(lx - rad * 0.2, ly - rad * 0.25, 0, lx, ly, rad); sg.addColorStop(0, al(F.T.lite, 0.8)); sg.addColorStop(0.7, al(F.T.lite, 0.25)); sg.addColorStop(1, al(F.T.lite, 0)); s.fillStyle = sg; s.fillRect(0, 0, sp.w, sp.h); }
    g.drawImage(scratch, 0, 0, sp.w, sp.h, sp.x, sp.y, sp.w, sp.h);
  }

  // ---- pencil, brush and lettering -----------------------------------------------------------------
  function sketch(F, pts, closed, seed, over = 7) {
    const r = rng(seed), u = F.u;
    let P = resample(closed ? [...pts, pts[0]] : pts, false, 9 * u);
    if (P.length > 1 && over > 0) { // A pencil overshoots its corners a little.
      const [a, b] = [P[0], P[1]], [y, z] = [P[P.length - 2], P[P.length - 1]];
      const la = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, lz = Math.hypot(z[0] - y[0], z[1] - y[1]) || 1;
      P.unshift([a[0] - ((b[0] - a[0]) / la) * over * u, a[1] - ((b[1] - a[1]) / la) * over * u]);
      P.push([z[0] + ((z[0] - y[0]) / lz) * over * u, z[1] + ((z[1] - y[1]) / lz) * over * u]);
    }
    let wx = 0, wy = 0;
    P = P.map(([x, y]) => { wx = wx * 0.72 + (r() - 0.5) * 1.8 * u; wy = wy * 0.72 + (r() - 0.5) * 1.8 * u; return [x + wx, y + wy]; });
    // Hand pressure: the line presses and lifts along its length and tapers off at each end.
    let pr = 0.6, tgt = 0.6;
    const Wt = P.map((_, i) => { if (i % 6 === 0) tgt = 0.35 + r() * 0.95; pr = pr * 0.82 + tgt * 0.18; const e = Math.min(i, P.length - 1 - i); return pr * Math.min(1, 0.35 + e * 0.22); });
    let len = 0;
    for (let i = 1; i < P.length; i++) len += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    return { P, len, Wt };
  }
  function partial(g, L, q) {
    if (q <= 0) return;
    let left = L.len * q;
    const lw = g.lineWidth, W = L.Wt;
    if (!W) {
      g.beginPath(); g.moveTo(L.P[0][0], L.P[0][1]);
      for (let i = 1; i < L.P.length; i++) {
        const a = L.P[i - 1], b = L.P[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (d >= left) { const k = d ? left / d : 0; g.lineTo(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k); break; }
        left -= d; g.lineTo(b[0], b[1]);
      }
      g.stroke();
      return;
    }
    // Varying weight: each short run is stroked at the pressure recorded for it.
    for (let i = 1; i < L.P.length; i++) {
      const a = L.P[i - 1], b = L.P[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const k = d >= left ? (d ? left / d : 0) : 1;
      g.lineWidth = lw * (W[i - 1] + W[i]) * 0.5 * 1.25;
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k); g.stroke();
      if (d >= left) break;
      left -= d;
    }
    g.lineWidth = lw;
  }
  // Graphite lines, drawn one after another as q runs, with a second fainter pass for grain.
  function pencil(g, F, list, q, o = {}) {
    if (q <= 0 || !list.length) return;
    const n = list.length, u = F.u;
    g.save();
    g.lineCap = "round"; g.lineJoin = "round";
    g.strokeStyle = o.color || F.T.pencil;
    const base = g.globalAlpha;
    for (let i = 0; i < n; i++) {
      const k = span(q, (i / n) * 0.55, (i / n) * 0.55 + 0.45);
      g.globalAlpha = base * (o.alpha ?? 0.62); g.lineWidth = (o.width ?? 1.7) * u; partial(g, list[i], k);
      g.save(); g.translate(1.6 * u, -1.1 * u); g.globalAlpha = base * (o.alpha ?? 0.62) * 0.4; g.lineWidth = 1 * u; partial(g, list[i], k); g.restore();
    }
    g.restore();
  }
  // A brush stroke along a path: a ribbon that swells and tapers, laid in two faint passes.
  function brush(g, F, pts, w, color, alpha, q, seed = 1) {
    if (q <= 0 || pts.length < 2) return;
    const u = F.u, P = resample(pts, false, 6 * u);
    let len = 0; const cum = [0];
    for (let i = 1; i < P.length; i++) { len += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); cum.push(len); }
    const end = len * clamp(q);
    for (let pass = 0; pass < 2; pass++) {
      const r = rng(seed * 13 + pass), L = [], R = [];
      for (let i = 0; i < P.length && cum[i] <= end; i++) {
        const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
        const s = cum[i] / Math.max(1, len), taper = Math.pow(Math.sin(Math.PI * clamp(0.06 + s * 0.88)), 0.45);
        const ww = (w / 2) * taper * (pass ? 0.72 : 1) * (0.86 + r() * 0.28);
        L.push([P[i][0] - (dy / d) * ww, P[i][1] + (dx / d) * ww]); R.push([P[i][0] + (dy / d) * ww, P[i][1] - (dx / d) * ww]);
      }
      if (L.length < 2) return;
      g.save(); g.globalAlpha *= alpha * (pass ? 0.6 : 0.55); g.fillStyle = color;
      polyPath(g, [...L, ...R.reverse()]); g.fill();
      if (!pass) { g.globalAlpha = Math.min(1, g.globalAlpha * 0.9); g.strokeStyle = F.deep(color); g.lineWidth = 1.1 * u; g.stroke(); }
      g.restore();
    }
  }
  // Dry brush: a few thin, broken bristle tracks along a path, each tapering at both ends, no outline.
  function drybrush(g, F, pts, w, color, alpha, seed) {
    const r = rng(seed), P = resample(pts, false, 6 * F.u), n = P.length;
    if (n < 3) return;
    g.save(); g.fillStyle = color;
    const a0 = g.globalAlpha;
    for (let k = 0; k < 6; k++) {
      const off = (r() - 0.5) * w, bw = w * (0.08 + r() * 0.14), i0 = Math.floor(r() * n * 0.3), i1 = n - 1 - Math.floor(r() * n * 0.35);
      if (i1 - i0 < 2) continue;
      const Lp = [], Rp = [];
      for (let i = i0; i <= i1; i++) {
        const A = P[Math.max(0, i - 1)], B = P[Math.min(n - 1, i + 1)], dx = B[0] - A[0], dy = B[1] - A[1], d = Math.hypot(dx, dy) || 1;
        const s2 = (i - i0) / (i1 - i0), ww = bw * Math.pow(Math.sin(Math.PI * s2), 0.6) * (0.6 + r() * 0.6), nx = -dy / d, ny = dx / d;
        Lp.push([P[i][0] + nx * (off + ww), P[i][1] + ny * (off + ww)]); Rp.push([P[i][0] + nx * (off - ww), P[i][1] + ny * (off - ww)]);
      }
      g.globalAlpha = a0 * alpha * (0.45 + r() * 0.55);
      polyPath(g, [...Lp, ...Rp.reverse()]); g.fill();
    }
    g.restore();
  }
  const MC = canvas(4, 4).getContext("2d");
  function measure(s, size, font = HAND, weight = 700) { MC.font = `${weight} ${size}px ${font}`; return MC.measureText(String(s ?? "")).width; }
  // Hand lettering in ink, one medium with the headings: each word is lettered in turn with the same
  // nib pressure, bleed and dry-brush breaks. q reveals it word by word, left to right.
  function write(g, F, s, x, y, size, o = {}) {
    s = String(s ?? "");
    const q = o.q ?? 1;
    if (!s || q <= 0) return 0;
    let w = measure(s, size);
    if (o.maxW && w > o.maxW) { size = Math.max(o.min || size * 0.7, (size * o.maxW) / w); w = measure(s, size); }
    const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    const color = o.color || F.T.ink, total = s.length;
    let seed = 0;
    for (const ch of s) seed = (seed * 31 + ch.charCodeAt(0)) % 100003;
    g.save(); g.globalAlpha *= o.alpha ?? 1;
    let cum = 0;
    s.split(" ").forEach((wd, i) => {
      if (wd) {
        const qw = span(q, (cum / total) * 0.85, ((cum + wd.length) / total) * 0.85 + 0.15);
        if (qw > 0) drawInk(g, F, inkWord(F, wd, size, color, seed + i, false), x0 + measure(s.slice(0, cum), size), y, qw, seed + i);
      }
      cum += wd.length + 1;
    });
    g.restore();
    return w;
  }
  const fmt = (target, k, d) => { const dec = Math.abs((Number(target) || 0) % 1) > 0.001 ? 1 : 0; return window.DreamcutMotion.formatNumber((Number(target) || 0) * k, dec, (d && d.prefix) || "", (d && d.suffix) || ""); };
  function dot(g, x, y, r, color, a = 1) { g.save(); g.globalAlpha *= a; g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.restore(); }
  function soft(g, x, y, r, color, a) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, al(color, a)); gr.addColorStop(1, al(color, 0));
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function birds(g, F, x, y, n, scale, seed) {
    const { u, t, T } = F, r = rng(seed);
    g.save(); g.strokeStyle = al(T.ink, 0.7); g.lineCap = "round"; g.lineJoin = "round";
    for (let i = 0; i < n; i++) {
      const bx = x + (r() - 0.3) * 160 * u * scale + t * 22 * u * scale, by = y + (r() - 0.5) * 70 * u * scale + Math.sin(t * 1.2 + i) * 6 * u;
      const s = (12 + r() * 8) * u * scale, f = Math.sin(t * 7 + i * 1.9) * 0.55;
      g.lineWidth = 2.2 * u * scale;
      g.beginPath(); g.moveTo(bx - s, by - s * (0.35 + f)); g.quadraticCurveTo(bx - s * 0.4, by - s * 0.2, bx, by); g.quadraticCurveTo(bx + s * 0.4, by - s * 0.2, bx + s, by - s * (0.35 + f)); g.stroke();
    }
    g.restore();
  }
  // A folded paper boat with its shadow on the water.
  function boat(g, F, x, y, s, rot, a = 1) {
    const { u, T } = F;
    g.save(); g.translate(x, y); g.rotate(rot); g.globalAlpha *= a;
    g.fillStyle = al(T.blue, 0.22); g.beginPath(); g.ellipse(0, s * 0.34, s * 0.95, s * 0.12, 0, 0, TAU); g.fill();
    const hull = [[-s * 0.95, -s * 0.05], [s * 0.95, -s * 0.05], [s * 0.62, s * 0.3], [-s * 0.62, s * 0.3]];
    const sail = [[-s * 0.5, -s * 0.05], [s * 0.05, -s * 0.85], [s * 0.5, -s * 0.05]];
    g.fillStyle = T.boat; polyPath(g, hull); g.fill(); polyPath(g, sail); g.fill();
    g.fillStyle = al(T.grey, 0.32); polyPath(g, [[s * 0.05, -s * 0.85], [s * 0.5, -s * 0.05], [s * 0.05, -s * 0.05]]); g.fill();
    polyPath(g, [[s * 0.2, s * 0.3], [s * 0.62, s * 0.3], [s * 0.95, -s * 0.05], [s * 0.45, -s * 0.05]]); g.fill();
    g.strokeStyle = al(T.pencil, 0.7); g.lineWidth = 1.4 * u; g.lineJoin = "round";
    polyPath(g, hull); g.stroke(); polyPath(g, sail); g.stroke();
    g.beginPath(); g.moveTo(s * 0.05, -s * 0.85); g.lineTo(s * 0.05, -s * 0.05); g.stroke();
    g.restore();
  }
  function cloudShape(cx, cy, w, h, seed) {
    const out = [], r = rng(seed), bumps = 5;
    for (let i = 0; i <= bumps; i++) { const x = cx - w / 2 + (w * i) / bumps; out.push(...arcPts(x, cy - h * (0.15 + r() * 0.35) * Math.sin(Math.PI * (i / bumps) * 0.9 + 0.15), h * (0.32 + r() * 0.2), Math.PI, TAU, 6)); }
    out.push([cx + w / 2 + h * 0.3, cy + h * 0.25], [cx - w / 2 - h * 0.3, cy + h * 0.25]);
    return out;
  }

  // ---- caches -----------------------------------------------------------------------------------------
  const CACHE = new Map();
  function cached(key, build) {
    if (CACHE.has(key)) { const v = CACHE.get(key); CACHE.delete(key); CACHE.set(key, v); return v; }
    const v = build();
    CACHE.set(key, v);
    while (CACHE.size > 14) CACHE.delete(CACHE.keys().next().value);
    return v;
  }
  const keyOf = (F, id, a, d) => `${id}|${F.W}x${F.H}|${F.T.paper}|${F.T.blue}|${F.A}|${F.tex}|${a ? [a.x, a.y, a.w, a.h].map(Math.round).join(",") : ""}|${JSON.stringify(d || null)}`;
  const buildWin = (hold) => clamp(hold * 0.62, 1.2, 2.6);


  // A dried wash that keeps creeping outward: scaled about its own centre while it is drawn.
  function spread(g, sp, s, fn) { g.save(); g.translate(sp.cx, sp.cy); g.scale(s, s); g.translate(-sp.cx, -sp.cy); fn(); g.restore(); }

  // ---- pigment drops: through every hold a loaded brush flicks drops that land, spatter and bloom ----
  // spots: { x, y, r (px at 1080), at (fraction of the hold), color? }
  function dropsBuild(F, spots, seed) {
    const { u, T } = F, r = rng(seed);
    return spots.map((s, i) => {
      const col = s.color || T[PIGS[(seed + i) % PIGS.length]], R = s.r * u, spat = [];
      for (let k = 0; k < 8; k++) { const ang = r() * TAU, dd = R * (1.25 + r() * 1.5); spat.push({ x: s.x + Math.cos(ang) * dd, y: s.y + Math.sin(ang) * dd * 0.8, r: (2 + r() * 6) * u * Math.min(1.6, s.r / 26) }); }
      return { ...s, col, R, spat, sp: makeWash(F, blob(s.x, s.y, R, R * (0.75 + r() * 0.4), seed * 31 + i, 0.22, 40), { color: col, a: 0.58, rough: 0.6, layers: 8, edge: 1, seed: seed * 31 + i, lift: 0.35, holes: 0.12, blooms: 1, seg: 12 }) };
    });
  }
  function drops(g, F, D, local, hold) {
    const { u, t, T } = F;
    for (const s of D) {
      const at = s.at * hold, k = span(local, at, at + 1.4);
      if (local > at - 0.3 && local < at) { const f = (local - (at - 0.3)) / 0.3; dot(g, s.x, s.y - (1 - f * f) * 160 * u, 6 * u, s.col, 0.85); }
      if (k <= 0) continue;
      show(g, F, s.sp, ease(k), s.x, s.y);
      const kk = ease(span(k, 0, 0.25));
      g.save(); g.lineWidth = 1.2 * u; g.strokeStyle = al(F.deep(s.col), 0.5);
      for (const p of s.spat) {
        const x = s.x + (p.x - s.x) * kk, y = s.y + (p.y - s.y) * kk;
        dot(g, x, y, p.r * kk, s.col, 0.55); g.beginPath(); g.arc(x, y, p.r * kk, 0, TAU); g.stroke();
      }
      g.restore();
      if (k < 1) soft(g, s.x - s.R * 0.2, s.y - s.R * 0.25, s.R * 0.9, T.lite, 0.35 * (1 - k)); // still wet: a sheen that dulls as it dries
    }
  }

  // ---- headlines on the page ----------------------------------------------------------------------
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
  // ---- headlines lettered in ink on the paper -------------------------------------------------------
  // The page lays the headline out (wrapping, fitting, position); the words themselves are lettered on
  // the painting, one after another, with the nib's pressure, a little bleed and dry-brush breaks.
  const wordCache = {}, INK = new Map();
  function wordsOf(id) {
    if (wordCache[id]) return wordCache[id];
    const el = document.getElementById(id), root = document.getElementById("root"), node = el && el.firstChild;
    if (!node || node.nodeType !== 3 || !root) return (wordCache[id] = []);
    // Measure untransformed: the page's own entrances and exits may be mid-tween on this frame.
    const held = [];
    for (let n = el; n && n !== root; n = n.parentElement) { held.push([n, n.style.transform]); n.style.transform = "none"; }
    const scale = root.getBoundingClientRect().width / (Number(root.dataset.width) || 1920) || 1, rr = root.getBoundingClientRect();
    const cs = getComputedStyle(el), upper = cs.textTransform === "uppercase", txt = node.textContent, out = [], range = document.createRange(), re = /\S+/g;
    let m;
    while ((m = re.exec(txt))) {
      range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
      const r = [...range.getClientRects()].find((q) => q.width > 1);
      if (r) out.push({ s: upper ? m[0].toUpperCase() : m[0], x: (r.left - rr.left) / scale, y: (r.top - rr.top) / scale, w: r.width / scale, h: r.height / scale, spaced: parseFloat(cs.letterSpacing) > 0 });
    }
    for (const [n, tr] of held) n.style.transform = tr;
    return (wordCache[id] = out);
  }
  const SPACE = 0.1; // the kicker's letter spacing, in em
  function textW(s, size, spaced) { return spaced ? [...s].reduce((w, ch) => w + measure(ch, size) + size * SPACE, -size * SPACE) : measure(s, size); }
  function inkWord(F, s, size, color, seed, spaced) {
    const key = `${s}|${size.toFixed(1)}|${color}|${seed}|${spaced}|${F.T.paper}|${F.tex}`;
    if (INK.has(key)) return INK.get(key);
    if (INK.size > 80) INK.delete(INK.keys().next().value);
    const built = (() => {
      const { u, T } = F, r = rng(seed), tw = textW(s, size, spaced), pad = Math.ceil(size * 0.45);
      MC.font = `700 ${size}px ${HAND}`;
      const mt = MC.measureText(s), asc = mt.fontBoundingBoxAscent || size * 0.9, desc = mt.fontBoundingBoxDescent || size * 0.3;
      const W2 = Math.ceil(tw + pad * 2), H2 = Math.ceil(asc + desc + pad * 2), ox = pad, oy = pad + asc;
      const A = canvas(W2, H2), g = A.getContext("2d");
      g.font = `700 ${size}px ${HAND}`; g.textBaseline = "alphabetic"; g.lineJoin = "round";
      const put = (fn) => { if (!spaced) { fn(s, ox); return; } let x = ox; for (const ch of s) { fn(ch, x); x += measure(ch, size) + size * SPACE; } };
      const deep = F.deep(color);
      // Ink bleeding into the damp paper around each stroke.
      g.filter = `blur(${Math.max(1.4, size * 0.05)}px)`; g.globalAlpha = 0.4; g.fillStyle = color; put((c, x) => g.fillText(c, x, oy));
      g.filter = "none";
      // The nib's pressure: ink density swells and thins along the word.
      const pg = g.createLinearGradient(ox, 0, ox + tw, 0);
      const stops = 3 + Math.floor(tw / (size * 0.9));
      for (let k = 0; k <= stops; k++) { const p = r(); pg.addColorStop(k / stops, al(mix(color, deep, p * 0.45), 0.72 + p * 0.28)); }
      g.globalAlpha = 1; g.fillStyle = pg; put((c, x) => g.fillText(c, x, oy));
      if (size < 64 * u) { g.strokeStyle = pg; g.lineWidth = size * 0.04; put((c, x) => g.strokeText(c, x, oy)); } // small labels carry a heavier nib
      // Ink pooled and dried at the edge of each stroke.
      g.strokeStyle = deep; g.globalAlpha = 0.5; g.lineWidth = Math.max(0.9, size * 0.016); put((c, x) => g.strokeText(c, x, oy));
      g.globalAlpha = 0.3; g.fillStyle = deep; put((c, x) => g.fillText(c, x + 1.2 * u, oy + 0.8 * u));
      // Dry-brush breaks: the nib skipped across the tooth in fine streaks along the stroke direction.
      g.globalCompositeOperation = "destination-out"; g.lineCap = "round";
      const nStreak = Math.round(tw / (size * 0.35) * F.tex);
      for (let k = 0; k < nStreak; k++) {
        const sx = ox + r() * tw, sy = oy - asc * (0.1 + r() * 0.8), len = size * (0.25 + r() * 0.6), ang = -0.35 + (r() - 0.5) * 0.3;
        g.globalAlpha = 0.35 + r() * 0.45; g.lineWidth = (0.6 + r() * 1.3) * u;
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len); g.stroke();
      }
      const TL = tilesFor(T.dark);
      g.globalAlpha = 0.3 * F.tex; g.fillStyle = pat(g, TL, "holes"); g.save(); g.translate(r() * 200, r() * 200); g.fillRect(-200, -200, W2 + 400, H2 + 400); g.restore();
      g.globalCompositeOperation = "source-atop"; g.globalAlpha = 0.35 * F.tex; g.fillStyle = pat(g, TL, "gran"); g.fillRect(0, 0, W2, H2);
      // Paper kept clear around the letters so they read over any wash.
      const c = canvas(W2, H2), h = c.getContext("2d");
      h.font = g.font; h.lineJoin = "round"; h.filter = `blur(${Math.max(2, size * 0.07)}px)`; h.strokeStyle = T.paper; h.fillStyle = T.paper; h.lineWidth = size * 0.12; h.globalAlpha = 0.5;
      if (!spaced) { h.strokeText(s, ox, oy); h.fillText(s, ox, oy); } else { let x = ox; for (const ch of s) { h.strokeText(ch, x, oy); h.fillText(ch, x, oy); x += measure(ch, size) + size * SPACE; } }
      h.filter = "none"; h.globalAlpha = 1; h.drawImage(A, 0, 0);
      return { c, ox, oy, tw, size, asc, desc };
    })();
    INK.set(key, built);
    return built;
  }
  // One word: the nib moves left to right, its wet front darker until it dries behind it.
  function letterWord(g, F, wd, q, color, seed) {
    if (q <= 0 || !g) return;
    const fit = 100 * wd.w / Math.max(1, textW(wd.s, 100, wd.spaced)), size = clamp(fit, 12, 400);
    const I = inkWord(F, wd.s, size, color, seed, wd.spaced);
    drawInk(g, F, I, wd.x, wd.y + (wd.h - (I.asc + I.desc)) / 2 + I.asc, q, seed);
  }
  function drawInk(g, F, I, xLeft, base, q, seed) {
    const x = xLeft - I.ox, y = base - I.oy, size = I.size;
    if (q >= 1) { g.drawImage(I.c, x, y); return; }
    const H2 = I.c.height, xf = x + I.ox * 0.6 + (I.tw + I.ox * 0.8) * q, front = (yy) => xf + (yy - base) * 0.28 + Math.sin(yy * 0.13 + seed) * size * 0.03;
    g.save(); g.beginPath(); g.moveTo(x - 2, y); for (let k = 0; k <= 8; k++) { const yy = y + (H2 * k) / 8; g.lineTo(front(yy), yy); } g.lineTo(x - 2, y + H2); g.closePath(); g.clip();
    g.drawImage(I.c, x, y);
    g.beginPath(); g.rect(xf - size * 0.6, y, size * 0.9, H2); g.clip(); // still-wet ink just behind the nib
    g.globalAlpha *= 0.5; g.drawImage(I.c, x, y);
    g.restore();
  }
  // The scene's headline, lettered word by word from `start`; returns when it finishes.
  function headline(g, F, sceneId, local, start) {
    const ids = sceneId === "title" ? ["kicker", "title"] : sceneId === "closing" ? ["closing"] : [`${sceneId}-title`];
    const c = controls(), e = c && Number(c.entrance) > 0 ? Number(c.entrance) : 0.7;
    let t0 = start;
    ids.forEach((id, n) => {
      const words = wordsOf(id);
      if (!words.length) return;
      const total = words.reduce((s, w) => s + w.s.length + 1.5, 0), D = clamp(e * 1.4 + words.length * 0.1, 0.8, 1.8);
      const color = id === "kicker" ? (F.T.dark ? F.A : mix(F.A, F.T.ink, 0.45)) : F.T.ink;
      let cum = 0;
      words.forEach((wd, i) => {
        const a0 = t0 + (D * cum) / total, a1 = a0 + (D * (wd.s.length + 1.5)) / total + 0.08;
        cum += wd.s.length + 1.5;
        letterWord(g, F, wd, span(local, a0, a1), color, 7000 + n * 97 + i * 13);
      });
      t0 += D * (id === "kicker" ? 0.55 : 1);
    });
    return t0;
  }
  function areaOf(F, id) {
    const { W, H, u, tall } = F, side = (tall ? 90 : 140) * u;
    const b = tall ? { x: side, y: H * 0.3, w: W - side * 2, h: H * 0.6 } : { x: side, y: H * 0.34, w: W - side * 2, h: H * 0.58 };
    const lines = headLines(`${id}-title`);
    if (!lines.length) return b;
    const bottom = Math.max(...lines.map((l) => l.y + l.h));
    const top = Math.min(b.y, Math.max(bottom + (tall ? 70 : 50) * u, H * 0.19));
    return { x: b.x, y: top, w: b.w, h: H - (tall ? 110 : 60) * u - top };
  }

  // ---- the plan: which scenes play (read from the template's controls) ------------------------------
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  let planCache = null;
  function controls() {
    if (window.__dreamcut && window.__dreamcut.controls) return window.__dreamcut.controls;
    try { if (typeof dc !== "undefined" && dc && dc.controls) return dc.controls; } catch (e) { /* not on this page */ }
    return null;
  }
  function planOf() {
    if (planCache) return planCache.c ? planCache : null;
    const c = controls();
    if (!c) { planCache = { c: null }; return null; }
    let t = 0;
    const shown = [];
    for (const id of ORDER) { const hold = Number(c[`${id}_hold`]) || 0; if (hold > 0) shown.push({ id, start: t, hold }); t += hold; }
    const data = {
      chart: { labels: [c.bar_1_label, c.bar_2_label, c.bar_3_label, c.bar_4_label], values: [c.bar_1, c.bar_2, c.bar_3, c.bar_4], suffix: c.chart_suffix, prefix: "", highlight: Number(c.highlight) - 1, span: c.chart_title },
      object: { kind: c.device, callouts: [c.callout_1, c.callout_2, c.callout_3], span: "" },
      people: { count: c.people_count, badges: [c.badge_1, c.badge_2, c.badge_3], highlight: 1 },
      process: { steps: [c.step_1, c.step_2, c.step_3] },
      compare: { left: c.before_label, leftValue: c.before_value, right: c.after_label, rightValue: c.after_value, suffix: c.compare_suffix, prefix: "" },
    };
    return (planCache = { c, shown, data, length: t });
  }

  // =====================================================================================================
  // Scenes. Each draws into the frame layer from its own clock (`local` seconds into the scene).
  // =====================================================================================================

  // ---- chart: rinse jars filling with pigment water ---------------------------------------------------
  function chartBuild(F, a, d) {
    const { u, T } = F, n = Math.max(1, d.values.length);
    const vals = d.values.map((v) => Math.max(0, Number(v) || 0)), max = Math.max(...vals, 1e-6);
    const hot = Number.isInteger(d.highlight) && d.highlight >= 0 && d.highlight < n ? d.highlight : -1;
    const shelfY = a.y + a.h - (F.tall ? 150 : 128) * u, slot = a.w / n;
    const jw = Math.min(slot * (F.tall ? 0.68 : 0.54), 290 * u);
    const jh = Math.max(180 * u, Math.min(shelfY - a.y - 150 * u, F.tall ? 820 * u : 560 * u));
    const top = shelfY - jh;
    const wall = makeWash(F, blob(a.x + a.w * 0.42, top + jh * 0.55, a.w * 0.46, jh * 0.5, 11, 0.16), { color: mix(mix(T.ochre, T.rose, 0.3), T.paper, 0.25), a: 0.2, rough: 0.9, layers: 12, lift: 0.4, backrun: 1, edge: 0.5, seed: 12, soft: 10 });
    const wall2 = makeWash(F, blob(a.x + a.w * 0.8, top + jh * 0.3, a.w * 0.22, jh * 0.4, 14, 0.2), { color: T.sky, a: 0.2, rough: 0.9, layers: 10, lift: 0.5, blooms: 2, edge: 0.5, seed: 15, soft: 10 });
    const shelf = makeWash(F, [[a.x - 70 * u, shelfY - 2 * u], [a.x + a.w + 70 * u, shelfY - 6 * u], [a.x + a.w + 60 * u, shelfY + 26 * u], [a.x - 60 * u, shelfY + 22 * u]], { color: T.sienna, a: 0.62, rough: 0.6, layers: 10, edge: 0.9, gran: 0.7, seed: 13 });
    const pen = [sketch(F, [[a.x - 50 * u, shelfY], [a.x + a.w + 50 * u, shelfY - 4 * u]], false, 5)];
    const jars = vals.map((v, i) => {
      const cx = a.x + slot * (i + 0.5), L = cx - jw / 2, R = cx + jw / 2, rb = jw * 0.2;
      const level = shelfY - 18 * u - (jh - 70 * u) * (v / max);
      const glassPts = [[L - 7 * u, top], [L - 7 * u, top + 12 * u], [L, top + 26 * u], ...arcPts(L + rb, shelfY - rb, rb, Math.PI, Math.PI / 2), ...arcPts(R - rb, shelfY - rb, rb, Math.PI / 2, 0), [R, top + 26 * u], [R + 7 * u, top + 12 * u], [R + 7 * u, top]];
      const i7 = 9 * u, ri = Math.max(4 * u, rb - i7);
      const waterPts = [[L + i7, level], ...arcPts(L + i7 + ri, shelfY - i7 - ri, ri, Math.PI, Math.PI / 2), ...arcPts(R - i7 - ri, shelfY - i7 - ri, ri, Math.PI / 2, 0), [R - i7, level]];
      const col = i === hot ? F.A : T[PIGS[i % PIGS.length]];
      // Graduations etched on the inside of the glass, and the water line, all kept within the walls.
      const jpen = [sketch(F, glassPts.map(([px, py]) => [px - 4 * u, py + 3 * u]), false, 30 + i), sketch(F, [[L + 16 * u, level + 5 * u], [R - 16 * u, level + 2 * u]], false, 70 + i, 0)];
      for (let m = 1; m <= 4; m++) { const my = shelfY - 18 * u - (jh - 70 * u) * (m / 4); jpen.push(sketch(F, [[R - (m % 2 ? 26 : 38) * u, my], [R - 13 * u, my]], false, 50 + i * 5 + m, 0)); }
      return {
        cx, L, R, level, col, v, pen: jpen,
        glass: makeWash(F, glassPts, { color: mix(T.sky, T.paper, 0.35), a: 0.24, rough: 0.14, layers: 7, edge: 1, lift: 0.75, seed: 20 + i, seg: 16, gran: 0.2 }),
        water: makeWash(F, waterPts, { color: col, a: 0.74, rough: 0.3, layers: 10, edge: 1, gran: 1, lift: 0.18, mott: 1, vary: 0.8, charges: 4, seed: 40 + i, seg: 18 }),
        shadow: makeWash(F, blob(cx + jw * 0.22, shelfY + 6 * u, jw * 0.72, 13 * u, 60 + i, 0.08), { color: T.grey, a: 0.32, rough: 0.4, layers: 6, edge: 0.4, seed: 60 + i }),
      };
    });
    let brushArt = null;
    if (hot >= 0) {
      const len = Math.min(jh * 0.98, 560 * u), J = jars[hot];
      brushArt = {
        handle: makeWash(F, [[-6 * u, -len], [6 * u, -len], [9 * u, -len * 0.3], [-9 * u, -len * 0.3]], { color: T.rose === F.A ? T.sienna : mix(T.sienna, T.rose, 0.35), a: 0.8, rough: 0.12, layers: 6, edge: 1, seed: 71, seg: 14, lift: 0.1 }),
        ferrule: makeWash(F, [[-9 * u, -len * 0.3], [9 * u, -len * 0.3], [8 * u, -len * 0.2], [-8 * u, -len * 0.2]], { color: T.grey, a: 0.7, rough: 0.1, layers: 5, edge: 1, seed: 72, seg: 10 }),
        tip: makeWash(F, [[-8 * u, -len * 0.2], [8 * u, -len * 0.2], [3 * u, -6 * u], [0, 0], [-3 * u, -6 * u]], { color: mix(T.ink, J.col, 0.4), a: 0.75, rough: 0.12, layers: 5, edge: 1, seed: 73, seg: 10 }),
      };
    }
    // A pale wash laid across the top of the sheet behind the headline, and a painter's test strip:
    // one swatch of each jar's pigment, the way a colour is tried before it goes in the water.
    const band = makeWash(F, [[-120 * u, -60 * u], [F.W * 0.72, -60 * u], [F.W * 0.66, a.y * 0.55], [F.W * 0.4, a.y * 0.82], [F.W * 0.12, a.y * 0.7], [-120 * u, a.y * 0.9]], { color: mix(T.ochre, T.paper, 0.35), color2: mix(T.rose, T.paper, 0.3), a: 0.2, rough: 1, layers: 10, edge: 0.55, lift: 0.3, vary: 0.9, seed: 16, soft: 10 });
    const swW = F.tall ? 70 * u : 92 * u, swX = F.tall ? F.W * 0.5 : F.W * 0.6, swY = F.tall ? a.y - 40 * u : Math.max(60 * u, a.y * 0.5);
    const swatches = F.tall ? [] : jars.map((J, i) => ({ x: swX + i * swW * 1.12, y: swY, col: J.col, sp: makeWash(F, [[swX + i * swW * 1.12, swY - swW * 0.32], [swX + i * swW * 1.12 + swW, swY - swW * 0.38], [swX + i * swW * 1.12 + swW * 0.96, swY + swW * 0.34], [swX + i * swW * 1.12 + swW * 0.04, swY + swW * 0.3]], { color: J.col, a: 0.55 + i * 0.05, rough: 0.9, layers: 7, edge: 1, gran: 1, seed: 17 + i, seg: 10, line: true, lift: 0.5 }) }));
    const drp = dropsBuild(F, [{ x: a.x + a.w * 0.97, y: F.H * 0.11, r: 26, at: 0.42 }, { x: a.x + a.w * 0.86, y: F.H * 0.06, r: 15, at: 0.6 }, { x: a.x - 70 * u, y: top + jh * 0.45, r: 20, at: 0.75 }, { x: a.x + a.w + 60 * u, y: top + jh * 0.7, r: 18, at: 0.88 }], 90);
    return { shelfY, top, jw, jh, slot, wall, wall2, shelf, jars, brushArt, hot, pen, drp, band, swatches, swW };
  }
  function chart(g, F, a, d, local, hold) {
    const C = cached(keyOf(F, "chart", a, d), () => chartBuild(F, a, d));
    const { u, t, T } = F, tt = local / buildWin(hold);
    spread(g, C.wall, 1 + 0.07 * (local / Math.max(1, hold)) + 0.012 * Math.sin(t * 0.9), () => show(g, F, C.wall, 0.3 + tt / 0.5, C.wall.cx, C.wall.cy));
    spread(g, C.wall2, 1 + 0.09 * (local / Math.max(1, hold)) + 0.015 * Math.sin(t * 1.1 + 1), () => show(g, F, C.wall2, span(tt, 0.1, 0.6), C.wall2.cx, C.wall2.cy));
    spread(g, C.band, 1 + 0.025 * Math.sin(t * 0.6), () => show(g, F, C.band, 0.45 + tt / 0.5, 0, 0));
    C.swatches.forEach((W2, i) => { // swatches tried one by one; each keeps drying, its sheen dulling
      const q = span(tt, 0.15 + i * 0.1, 0.5 + i * 0.1);
      paint(g, F, W2.sp, q, W2.x, W2.y);
      if (q > 0) soft(g, W2.x + C.swW * (0.3 + 0.4 * frac(t * 0.15 + i * 0.25)), W2.y - C.swW * 0.05, C.swW * 0.35, T.lite, 0.25 + 0.12 * Math.sin(t * 1.3 + i));
    });
    show(g, F, C.shelf, 0.2 + tt / 0.45, a.x, C.shelfY);
    pencil(g, F, C.pen, clamp(0.3 + tt / 0.4));
    drops(g, F, C.drp, local, hold);
    C.jars.forEach((J, i) => {
      const s0 = 0.04 + i * 0.09, kg = span(tt, s0 + 0.1, s0 + 0.42), K = inout(span(tt, s0 + 0.18, s0 + 0.95));
      show(g, F, J.shadow, kg, J.cx, C.shelfY);
      show(g, F, J.glass, kg, J.cx, C.top);
      if (i === C.hot && C.brushArt && K > 0.4) {
        // The brush stirs: its tip circles the bottom of the jar while the handle rocks.
        const B = C.brushArt, side = C.hot === C.jars.length - 1 ? -1 : 1, st = t * 2.2;
        const ang = -side * 0.3 + 0.2 * Math.sin(st), sx = J.cx + C.jw * (0.08 * side + 0.2 * Math.cos(st)), sy = C.shelfY - 30 * u - 16 * u * (1 + Math.sin(st));
        g.save(); g.translate(sx, sy); g.rotate(ang); g.globalAlpha *= span(K, 0.4, 0.8);
        for (const sp of [B.handle, B.ferrule, B.tip]) g.drawImage(sp.c, sp.x, sp.y);
        g.restore();
      }
      if (K > 0) {
        // The surface: a wobbling meniscus that climbs the glass at both walls, sloshing harder while it rises.
        const rising = 1 - K, surf = lerp(C.shelfY, J.level, K), amp = (i === C.hot ? 12 : 9) * u * (0.65 + 0.35 * Math.sin(t * 1.3 + i)) * (1 + rising * 0.8), tilt = (i === C.hot ? 0.08 : 0.05) * Math.sin(t * 1.5 + i * 1.3);
        const men = 16 * u, mw = C.jw * 0.09;
        const wave = (x) => surf + (x - J.cx) * tilt + Math.sin(x * 0.045 / u + t * 2.4 + i) * amp + Math.sin(x * 0.11 / u - t * 1.7) * amp * 0.4 - men * (Math.exp(-Math.max(0, x - J.L) / mw) + Math.exp(-Math.max(0, J.R - x) / mw));
        g.save();
        g.beginPath(); g.moveTo(J.L - 24 * u, C.shelfY + 40 * u);
        for (let x = J.L - 24 * u; x <= J.R + 24 * u; x += 6 * u) g.lineTo(x, wave(x));
        g.lineTo(J.R + 24 * u, C.shelfY + 40 * u); g.closePath(); g.clip();
        g.drawImage(J.water.c, J.water.x, J.water.y);
        g.beginPath(); g.rect(J.L + 10 * u, surf - 8 * u, J.R - J.L - 20 * u, C.shelfY - surf - 4 * u); g.clip();
        const depth = C.shelfY - surf;
        for (let k = 0; k < 3; k++) { // Pigment curling through the water.
          const px = J.cx + Math.sin(t * 1.1 + k * 2.1 + i) * C.jw * 0.26, py = surf + depth * (0.4 + 0.3 * Math.sin(t * 0.8 + k * 1.7 + i * 0.8));
          soft(g, px, py, C.jw * (0.26 + 0.1 * Math.sin(t * 1.4 + k)), k === 1 ? mix(J.col, T.lite, 0.5) : F.deep(J.col), 0.4);
        }
        // A ribbon of pigment swirling round, pulled by the current (faster where the brush stirs).
        const spin = t * (i === C.hot ? 2.2 : 0.9) + i * 1.7, swirl = [];
        for (let k = 0; k <= 14; k++) { const s2 = k / 14, an = spin + s2 * 3.6, rr = C.jw * (0.12 + 0.2 * s2); swirl.push([J.cx + Math.cos(an) * rr, surf + depth * 0.55 + Math.sin(an) * rr * 0.35 * Math.min(1, depth / (C.jw * 0.8))]); }
        drybrush(g, F, swirl, 16 * u, F.deep(J.col), 0.45, 95 + i);
        g.strokeStyle = al(T.paper, 0.7); g.lineWidth = 1.6 * u;
        for (let b = 0; b < 5; b++) { // Bubbles rise and burst at the surface.
          const run = Math.max(30 * u, depth - 26 * u), y = C.shelfY - 20 * u - frac(t * 0.32 + b * 0.23 + i * 0.11) * run;
          const x = J.L + C.jw * (0.22 + 0.56 * frac(b * 0.37 + i * 0.19)) + Math.sin(t * 2 + b) * 4 * u;
          g.beginPath(); g.arc(x, y, (2.5 + (b % 3) * 1.6) * u, 0, TAU); g.stroke();
        }
        g.restore();
        { // Colour blooms upward ahead of the water: feathered plumes of pigment rising into the clear glass.
          g.save(); g.beginPath(); g.rect(J.L + 9 * u, C.top + 30 * u, J.R - J.L - 18 * u, surf - C.top - 30 * u + 4 * u); g.clip();
          const reach = 40 * u + rising * 110 * u, bg2 = g.createLinearGradient(0, surf, 0, surf - reach);
          bg2.addColorStop(0, al(J.col, 0.4 + rising * 0.2)); bg2.addColorStop(1, al(J.col, 0));
          g.fillStyle = bg2; g.fillRect(J.L, surf - reach, J.R - J.L, reach + 6 * u);
          for (let k = 0; k < 4; k++) { // tendrils drifting up and dissolving
            const ph = frac(t * 0.35 + k * 0.27 + i * 0.13), px = J.L + C.jw * (0.2 + 0.6 * frac(k * 0.41 + i * 0.29)) + Math.sin(t * 1.3 + k) * 8 * u;
            soft(g, px, surf - ph * reach * 1.1, (14 + ph * 26) * u, J.col, (0.3 + rising * 0.3) * (1 - ph));
          }
          g.restore();
        }
        g.save(); g.strokeStyle = al(F.deep(J.col), 0.55); g.lineWidth = 2.6 * u; g.beginPath();
        for (let x = J.L + 10 * u; x <= J.R - 10 * u; x += 5 * u) (x === J.L + 10 * u ? g.moveTo(x, wave(x)) : g.lineTo(x, wave(x)));
        g.stroke(); g.restore();
      }
      if (kg > 0) { // Paper left white for the glint on the glass.
        g.save(); g.globalAlpha *= kg * 0.8; g.strokeStyle = al(T.lite, 0.85); g.lineCap = "round";
        g.lineWidth = 7 * u; g.beginPath(); g.moveTo(J.L + C.jw * 0.16, C.top + 46 * u); g.lineTo(J.L + C.jw * 0.15, C.shelfY - 44 * u); g.stroke();
        g.lineWidth = 3 * u; g.beginPath(); g.moveTo(J.L + C.jw * 0.27, C.top + 60 * u); g.lineTo(J.L + C.jw * 0.26, C.top + 60 * u + C.jh * 0.18); g.stroke();
        g.restore();
      }
      g.save(); g.translate(-3 * u, 2 * u); pencil(g, F, J.pen, span(tt, s0 - 0.04, s0 + 0.22), { alpha: 0.8, width: 2 }); g.restore();
      if (K > 0) write(g, F, fmt(J.v, K, d), J.cx, C.top - 30 * u, 104 * u, { align: "center", maxW: C.slot * 0.94, min: 70 * u, color: i === C.hot ? F.deep(F.A) : T.ink });
      write(g, F, d.labels[i], J.cx, C.shelfY + (F.tall ? 112 : 104) * u, 72 * u, { align: "center", q: span(tt, s0 + 0.25, s0 + 0.55), maxW: C.slot * 0.96, min: 54 * u, color: F.deep(T.ink) });
    });
  }

  // ---- object: a painted laptop or phone with a live edit on screen -------------------------------------
  function objectBuild(F, a, d) {
    const { u, T, tall } = F, phone = d.kind === "phone";
    let x, y, w, h, pad, lx, ly, maxW, below = false;
    if (!phone) {
      w = tall ? a.w * 0.94 : Math.min(a.w * 0.62, a.h * 1.36); h = w * 0.6;
      x = tall ? a.x + (a.w - w) / 2 : a.x;
      y = tall ? a.y + 24 * u : a.y + Math.max(0, (a.h - h * 1.14) / 2);
      pad = w * 0.035;
    } else {
      h = tall ? Math.min(a.h * 0.86, a.w * 0.5 * 2) : a.h * 0.98; w = h * 0.5;
      x = tall ? a.x + a.w * 0.02 : a.x + a.w * 0.14; y = a.y + (a.h - h) / 2;
      pad = w * 0.07;
    }
    if (tall && !phone) { below = true; lx = a.x + 70 * u; ly = [0, 1, 2].map((i) => y + h * 1.1 + 150 * u + i * 128 * u); maxW = a.x + a.w - lx; }
    else { lx = phone ? x + w + (tall ? 70 : 150) * u : x + w + 120 * u; ly = [0, 1, 2].map((i) => a.y + a.h * (tall ? 0.2 + i * 0.3 : 0.12 + i * 0.27)); maxW = a.x + a.w - lx; }
    const s = { x: x + pad, y: y + pad * (phone ? 1.6 : 1), w: w - pad * 2, h: h - pad * (phone ? 3.2 : 2) };
    const pv = { x: s.x + s.w * 0.05, y: s.y + s.h * 0.06, w: s.w * 0.9, h: s.h * (phone ? 0.42 : 0.47) };
    const tY = pv.y + pv.h + s.h * 0.08, th = s.h * (phone ? 0.085 : 0.1), tg = s.h * 0.035;
    const tr = { x: pv.x, y: tY, w: pv.w, h: th * 3 + tg * 2 };
    const clipsAt = [[0.04, 0.3], [0.38, 0.25], [0.67, 0.29]];
    const clips = [];
    for (let k = 0; k < 3; k++) clipsAt.forEach(([cx, cw], j) => {
      const hot = k === 0 && j === 1, X = tr.x + tr.w * (cx + k * 0.025), Wd = tr.w * cw * (k === 2 ? 0.95 : 1), Y = tY + k * (th + tg);
      // Each clip is its own brush daub: loaded at one end, dragged dry at the other, a little askew.
      const rot = (((k * 3 + j) * 0.618) % 1 - 0.5) * 0.05, ccx = X + Wd / 2, ccy = Y + th / 2;
      const daub = rrect(X, Y + th * 0.04, Wd, th * 0.92, th * 0.46).map(([px, py]) => { const dx = px - ccx, dy = (py - ccy) * (1 - 0.18 * ((px - X) / Wd)); return [ccx + dx * Math.cos(rot) - dy * Math.sin(rot), ccy + dx * Math.sin(rot) + dy * Math.cos(rot)]; });
      clips.push({ k, j, hot, x: X, y: Y, w: Wd, h: th, sp: makeWash(F, daub, { color: hot ? F.A : T[["blue", "ochre", "teal", "violet", "green", "sienna", "rose", "blue", "teal"][k * 3 + j]], a: hot ? 0.66 : 0.48, rough: 0.8, layers: 7, edge: 1, seed: 300 + k * 3 + j, seg: 9, lift: 0.3, gran: 0.9, mott: 0.9, vary: 0.7, blooms: 0, bleeds: 1, holes: 0.35, soft: 2 }) });
    });
    const baseY = y + h, deskY = phone ? y + h + 10 * u : y + h * 1.09;
    const anchors = [[pv.x + pv.w * 0.7, pv.y + pv.h * 0.38], [clips[1].x + clips[1].w * 0.5, clips[1].y + th / 2], [clips[6].x + clips[6].w * 0.4, clips[6].y + th / 2]];
    const lid = makeWash(F, rrect(x, y, w, h, (phone ? 46 : 18) * u), { color: mix(T.grey, T.violet, 0.3), a: 0.5, rough: 0.12, layers: 9, edge: 1, seed: 201, seg: 22, lift: 0.4, gran: 0.6 });
    const screen = makeWash(F, rrect(s.x, s.y, s.w, s.h, (phone ? 24 : 8) * u), { color: T.night, color2: mix(T.night, T.violet, 0.5), a: 0.64, rough: 0.28, layers: 9, edge: 1, seed: 202, seg: 16, lift: 0.32, gran: 1, mott: 0.9, vary: 0.55, blooms: 2, bleeds: 0, holes: 0.3 });
    const sky = makeWash(F, rrect(pv.x, pv.y, pv.w, pv.h, 6 * u), { color: T.sky, a: 0.6, rough: 0.14, layers: 8, edge: 0.5, seed: 203, seg: 18, lift: 0.45, holes: 0.1 });
    const sun = makeWash(F, blob(pv.x + pv.w * 0.76, pv.y + pv.h * 0.3, pv.h * 0.13, pv.h * 0.13, 204, 0.05, 30), { color: T.ochre, a: 0.75, rough: 0.2, layers: 6, edge: 0.8, seed: 204, seg: 10 });
    const hillA = makeWash(F, [[pv.x, pv.y + pv.h * 0.62], [pv.x + pv.w * 0.25, pv.y + pv.h * 0.5], [pv.x + pv.w * 0.55, pv.y + pv.h * 0.66], [pv.x + pv.w * 0.8, pv.y + pv.h * 0.55], [pv.x + pv.w, pv.y + pv.h * 0.64], [pv.x + pv.w, pv.y + pv.h], [pv.x, pv.y + pv.h]], { color: T.teal, a: 0.55, rough: 0.3, layers: 7, edge: 0.8, seed: 205, seg: 14 });
    const hillB = makeWash(F, [[pv.x, pv.y + pv.h * 0.8], [pv.x + pv.w * 0.4, pv.y + pv.h * 0.7], [pv.x + pv.w, pv.y + pv.h * 0.86], [pv.x + pv.w, pv.y + pv.h], [pv.x, pv.y + pv.h]], { color: T.green, a: 0.62, rough: 0.3, layers: 7, edge: 0.8, seed: 206, seg: 14, gran: 0.7 });
    const base = phone ? null : makeWash(F, [[x - w * 0.07, baseY + h * 0.09], [x + w * 1.07, baseY + h * 0.09], [x + w, baseY], [x, baseY]], { color: mix(T.grey, T.paper, 0.3), a: 0.5, rough: 0.12, layers: 8, edge: 1, seed: 207, seg: 18, gran: 0.5 });
    const desk = makeWash(F, blob(x + w / 2, deskY + 24 * u, (phone ? w * 1.1 : w * 0.72), 54 * u, 208, 0.12), { color: mix(T.sienna, T.ochre, 0.3), a: 0.32, rough: 0.8, layers: 10, edge: 0.6, seed: 208, blooms: 1 });
    const halo = makeWash(F, blob(x + w * 0.52, y + h * 0.48, w * (phone ? 1.05 : 0.68), h * (phone ? 0.55 : 0.72), 209, 0.18), { color: mix(T.sky, T.violet, 0.3), a: 0.18, rough: 0.9, layers: 10, edge: 0.4, lift: 0.6, seed: 209, blooms: 2, soft: 10 });
    const pen = [sketch(F, rrect(x, y, w, h, (phone ? 46 : 18) * u), true, 211), sketch(F, rrect(s.x, s.y, s.w, s.h, 8 * u), true, 212), sketch(F, rrect(pv.x, pv.y, pv.w, pv.h, 4 * u), true, 213)];
    for (let k = 0; k < 3; k++) pen.push(sketch(F, [[tr.x, tY + k * (th + tg) + th + tg / 2], [tr.x + tr.w, tY + k * (th + tg) + th + tg / 2]], false, 220 + k));
    if (!phone) {
      pen.push(sketch(F, [[x - w * 0.07, baseY + h * 0.09], [x + w * 1.07, baseY + h * 0.09], [x + w, baseY], [x, baseY]], true, 214));
      for (let r = 0; r < 2; r++) pen.push(sketch(F, [[x + w * (0.06 + r * 0.02), baseY + h * (0.03 + r * 0.03)], [x + w * (0.94 - r * 0.02), baseY + h * (0.03 + r * 0.03)]], false, 216 + r));
    }
    // A porcelain mixing palette in the free corner, its wells loaded, and a brush that keeps working them.
    let pal = null;
    const palRoom = below && a.y + a.h - 105 * u - 82 * u > ly[2] + 50 * u;
    if (!tall || palRoom) {
      const pcx = a.x + a.w - (tall ? 230 : 190) * u, pcy = a.y + a.h - 105 * u, prx = 175 * u, pry = 82 * u;
      const wells = [0, 1, 2, 3, 4].map((k) => { const ang = Math.PI * (0.92 + k * 0.29); return { x: pcx + Math.cos(ang) * prx * 0.62, y: pcy + Math.sin(ang) * pry * 0.5 + pry * 0.1, col: T[["blue", "ochre", "rose", "teal", "violet"][k]] }; });
      pal = {
        cx: pcx, cy: pcy, rx: prx, ry: pry, wells,
        dish: makeWash(F, blob(pcx, pcy, prx, pry, 260, 0.1, 48), { color: mix(T.grey, T.paper, 0.55), a: 0.42, rough: 0.2, layers: 8, edge: 1, lift: 0.5, seed: 260, seg: 16, line: true }),
        shadow: makeWash(F, blob(pcx + 24 * u, pcy + pry * 0.9, prx * 0.95, 16 * u, 261, 0.08), { color: T.grey, a: 0.3, rough: 0.4, layers: 6, edge: 0.4, seed: 261 }),
        paints: wells.map((wl, k) => makeWash(F, blob(wl.x, wl.y, 34 * u, 22 * u, 262 + k, 0.12, 28), { color: wl.col, a: 0.78, rough: 0.25, layers: 6, edge: 1, seed: 262 + k, seg: 8, line: true })),
      };
    }
    const drp = dropsBuild(F, tall ? [{ x: a.x + a.w * 0.9, y: a.y + a.h * 0.95, r: 24, at: 0.5 }, { x: a.x + a.w * 0.1, y: a.y + a.h * 0.97, r: 16, at: 0.75 }]
      : [{ x: a.x + a.w * 0.95, y: a.y + a.h * 0.06, r: 28, at: 0.4 }, { x: a.x + a.w * 0.85, y: a.y - 70 * u, r: 16, at: 0.58 }, { x: a.x + a.w * 0.99, y: a.y + a.h * 0.42, r: 18, at: 0.76 }, { x: lx + 40 * u, y: a.y + a.h * 0.86, r: 15, at: 0.9 }], 280);
    // The callouts' side of the sheet: a pale wash behind them, and under each label a swatch of colour.
    const side = below ? null : makeWash(F, blob(lx + maxW * 0.42, a.y + a.h * 0.42, maxW * 0.62, a.h * 0.52, 270, 0.2), { color: mix(T.rose, T.ochre, 0.35), color2: mix(T.sky, T.violet, 0.3), a: 0.15, rough: 1, layers: 10, edge: 0.5, lift: 0.5, vary: 0.9, seed: 270, soft: 10 });
    const tags = (d.callouts || []).map((label, i) => {
      if (!label) return null;
      const ww = Math.min(maxW, measure(label, 50 * u)), X = lx - 30 * u, Y = ly[i] - 52 * u, Wd = ww + 64 * u, Hd = 76 * u;
      return makeWash(F, [[X, Y + 6 * u], [X + Wd * 0.5, Y - 4 * u], [X + Wd, Y + 8 * u], [X + Wd - 10 * u, Y + Hd], [X + Wd * 0.4, Y + Hd + 6 * u], [X + 8 * u, Y + Hd - 4 * u]], { color: mix([F.A, T.sky, T.ochre][i], T.paper, 0.45), a: 0.3, rough: 0.9, layers: 8, edge: 0.9, lift: 0.4, seed: 275 + i, seg: 14, line: true });
    });
    return { phone, x, y, w, h, s, pv, tr, th, clips, anchors, lid, screen, sky, sun, hillA, hillB, base, desk, halo, pen, lx, ly, maxW, below, pal, drp, side, tags };
  }
  function object(g, F, a, d, local, hold) {
    const O = cached(keyOf(F, "object", a, d), () => objectBuild(F, a, d));
    const { u, t, T } = F, tt = local / buildWin(hold);
    show(g, F, O.halo, 0.3 + tt / 0.5, O.halo.cx, O.halo.cy);
    if (O.side) spread(g, O.side, 1 + 0.04 * (local / Math.max(1, hold)) + 0.015 * Math.sin(t * 0.8), () => show(g, F, O.side, 0.35 + tt / 0.5, O.side.cx, O.side.cy));
    show(g, F, O.desk, 0.25 + tt / 0.5, O.desk.cx, O.desk.cy);
    // Pencil first, then the washes flood in from where the brush lands on each part.
    g.save(); g.translate(-4 * u, 3 * u); pencil(g, F, O.pen, clamp(tt / 0.3), { alpha: 0.75 }); g.restore();
    show(g, F, O.lid, span(tt, 0.2, 0.55), O.x + O.w * 0.15, O.y + O.h * 0.2);
    show(g, F, O.base, span(tt, 0.26, 0.6), O.x + O.w * 0.2, O.y + O.h);
    show(g, F, O.screen, span(tt, 0.3, 0.62), O.s.x + O.s.w * 0.3, O.s.y + O.s.h * 0.3);
    const pv = O.pv;
    g.save(); g.beginPath(); g.rect(pv.x, pv.y, pv.w, pv.h); g.clip();
    show(g, F, O.sky, span(tt, 0.34, 0.62), pv.x, pv.y);
    show(g, F, O.sun, span(tt, 0.4, 0.62), O.sun.cx, O.sun.cy);
    if (tt > 0.3) { // Clouds drift across the little painting on the screen.
      g.save(); g.globalAlpha *= span(tt, 0.3, 0.6);
      for (let j = 0; j < 2; j++) {
        const cx = pv.x - pv.w * 0.2 + frac(t * 0.035 + j * 0.5) * pv.w * 1.4, cy = pv.y + pv.h * (0.2 + j * 0.16);
        soft(g, cx, cy, pv.h * 0.14, T.lite, 0.75); soft(g, cx + pv.h * 0.12, cy + pv.h * 0.02, pv.h * 0.11, T.lite, 0.7); soft(g, cx - pv.h * 0.1, cy + pv.h * 0.03, pv.h * 0.09, T.lite, 0.65);
      }
      g.restore();
    }
    show(g, F, O.hillA, span(tt, 0.4, 0.66), pv.x, pv.y + pv.h);
    show(g, F, O.hillB, span(tt, 0.44, 0.7), pv.x + pv.w, pv.y + pv.h);
    if (tt > 0.5) birds(g, F, pv.x + pv.w * 0.2 + Math.sin(t * 0.3) * pv.w * 0.1, pv.y + pv.h * 0.3, 2, pv.h / (300 * u), 231);
    g.restore();
    O.clips.forEach((c, i) => show(g, F, c.sp, span(tt, 0.42 + i * 0.03, 0.66 + i * 0.03), c.x, c.y + c.h / 2));
    if (tt > 0.55) { // The playhead keeps running over the tracks.
      const k = frac(0.08 + local * 0.075), px = O.tr.x + O.tr.w * k;
      g.save(); g.globalAlpha *= span(tt, 0.55, 0.8);
      g.strokeStyle = al(T.lite, 0.9); g.lineWidth = 3 * u; g.beginPath(); g.moveTo(px, O.tr.y - 12 * u); g.lineTo(px, O.tr.y + O.tr.h + 10 * u); g.stroke();
      g.fillStyle = F.A; g.beginPath(); g.moveTo(px - 9 * u, O.tr.y - 22 * u); g.lineTo(px + 9 * u, O.tr.y - 22 * u); g.lineTo(px, O.tr.y - 9 * u); g.closePath(); g.fill();
      g.restore();
    }
    drops(g, F, O.drp, local, hold);
    if (O.pal) { // The palette: the brush dips from well to well and stirs.
      const P = O.pal, pk = span(tt, 0.35, 0.75);
      show(g, F, P.shadow, pk, P.cx, P.cy + P.ry);
      paint(g, F, P.dish, pk, P.cx, P.cy);
      P.paints.forEach((sp, k) => paint(g, F, sp, span(tt, 0.45 + k * 0.05, 0.8 + k * 0.05), P.wells[k].x, P.wells[k].y));
      if (tt > 0.6) {
        const cyc = local * 0.9, wi = Math.floor(cyc) % 5, f = frac(cyc), A = P.wells[wi], B = P.wells[(wi + 1) % 5];
        const mv = inout(span(f, 0.62, 1)), lift = Math.sin(Math.PI * mv) * 60 * u, sw = (1 - mv) * (f < 0.62 ? 1 : 0);
        const tx = lerp(A.x, B.x, mv) + Math.cos(t * 9) * 12 * u * sw, ty = lerp(A.y, B.y, mv) - lift + Math.sin(t * 9) * 6 * u * sw;
        const ang = -1.05 + 0.08 * Math.sin(t * 2), Lh = 230 * u;
        g.save(); g.globalAlpha *= span(tt, 0.6, 0.8);
        if (sw > 0) { g.strokeStyle = al(F.deep(A.col), 0.5); g.lineWidth = 2 * u; g.beginPath(); g.ellipse(A.x, A.y, 20 * u, 11 * u, 0, t * 6, t * 6 + 4); g.stroke(); }
        const ex = tx + Math.cos(ang) * Lh, ey = ty + Math.sin(ang) * Lh, mx = tx + Math.cos(ang) * Lh * 0.18, my = ty + Math.sin(ang) * Lh * 0.18;
        brush(g, F, [[mx, my], [ex, ey]], 12 * u, T.sienna, 1, 1, 290);
        brush(g, F, [[tx + Math.cos(ang) * Lh * 0.12, ty + Math.sin(ang) * Lh * 0.12], [mx + Math.cos(ang) * 14 * u, my + Math.sin(ang) * 14 * u]], 13 * u, T.grey, 1, 1, 291);
        brush(g, F, [[tx, ty], [tx + Math.cos(ang) * Lh * 0.13, ty + Math.sin(ang) * Lh * 0.13]], 14 * u, mix(T.ink, A.col, 0.5), 1, 1, 292);
        g.restore();
      }
    }
    const labels = d.callouts || [];
    O.anchors.forEach(([ax, ay], i) => {
      const c = span(tt, 0.45 + i * 0.12, 0.8 + i * 0.12), label = labels[i];
      if (c <= 0 || !label) return;
      const tx = O.lx - 26 * u, ty = O.ly[i] - 15 * u;
      const pts = [];
      if (O.below) { // Down past the laptop, then along the left margin, so no leader crosses another label.
        const vx = O.lx - 46 * u - i * 15 * u, ky = O.ly[0] - 95 * u + i * 12 * u;
        for (let k = 0; k <= 16; k++) { const s = k / 16; pts.push([(1 - s) * (1 - s) * ax + 2 * (1 - s) * s * ax + s * s * vx, (1 - s) * (1 - s) * ay + 2 * (1 - s) * s * ky + s * s * ky]); }
        for (let k = 1; k <= 8; k++) { const s = k / 8; pts.push([vx + (tx - vx) * s * s, ky + (ty - ky) * (1 - (1 - s) * (1 - s))]); }
      } else {
        const ctrl = [(ax + tx) / 2, ay];
        for (let k = 0; k <= 24; k++) { const s = k / 24; pts.push([(1 - s) * (1 - s) * ax + 2 * (1 - s) * s * ctrl[0] + s * s * tx, (1 - s) * (1 - s) * ay + 2 * (1 - s) * s * ctrl[1] + s * s * ty]); }
      }
      brush(g, F, pts, 5 * u, T.ink, 0.85, span(c, 0, 0.6), 240 + i);
      const pulse = 1 + 0.18 * Math.sin(t * 3 + i * 1.3);
      dot(g, ax, ay, 15 * u * pulse, F.A, 0.3); dot(g, ax, ay, 7.5 * u, F.A, 0.95);
      if (c > 0.55) dot(g, tx, ty, 6 * u, T.ink, span(c, 0.55, 0.7));
      const q = span(c, 0.45, 1), ww = Math.min(O.maxW, measure(label, 50 * u));
      if (O.tags[i]) paint(g, F, O.tags[i], span(c, 0.3, 0.9), O.lx, O.ly[i] - 15 * u, 0.3);
      brush(g, F, [[O.lx - 8 * u, O.ly[i] + 14 * u], [O.lx + ww + 12 * u, O.ly[i] + 10 * u]], 16 * u, F.A, 0.45, q, 250 + i);
      write(g, F, label, O.lx, O.ly[i], 50 * u, { q, maxW: O.maxW, min: 40 * u });
    });
  }

  // ---- people: a row of painted folk with speech tags ---------------------------------------------------
  // A tapered limb: a rounded capsule from (x0, y0) to (x1, y1).
  function capsule(x0, y0, x1, y1, w0, w1) {
    const ang = Math.atan2(y1 - y0, x1 - x0);
    return [...arcPts(x1, y1, w1 / 2, ang - Math.PI / 2, ang + Math.PI / 2, 8), ...arcPts(x0, y0, w0 / 2, ang + Math.PI / 2, ang + Math.PI * 1.5, 8)];
  }
  // Lay one part into a figure: first knock out whatever lies beneath it, so overlapping parts never
  // double their alpha, then lay its wash and ink its contour. Later parts hide earlier contours, as
  // in one continuous drawing.
  function inlay(fg, F, sp, o = {}) {
    fg.save();
    if (o.erase !== false) { fg.globalCompositeOperation = "destination-out"; fg.fillStyle = "#000"; polyPath(fg, sp.pts); fg.fill(); }
    fg.globalCompositeOperation = "source-over"; fg.drawImage(sp.c, sp.x, sp.y);
    if (o.ink !== false) {
      fg.strokeStyle = o.inkColor || mix(sp.deep, F.T.ink, 0.55); fg.lineJoin = "round";
      inkLine(fg, F, resample(sp.pts, true, 5 * F.u), (o.inkW ?? 2.6) * F.u, (sp.seed || 1) + 77, o.inkA ?? 0.85);
    }
    fg.restore();
  }
  function personBuild(F, i, fh, coat, skin, hair, style) {
    const { u, T } = F, s = 1000 + i * 37;
    const hr = fh * 0.13, hy = -fh + hr, sy = hy + hr * 1.05, bw = fh * 0.5, sw = fh * 0.32, hem = -fh * 0.075, cuffY = -fh * 0.34;
    const ox = fh * 0.64, oy = fh * 1.24, fc = canvas(fh * 1.28, fh * 1.34), fg = fc.getContext("2d");
    fg.translate(ox, oy);
    const lead = []; // the underdrawing that runs on before the paint goes in
    const put = (sp, o = {}) => { inlay(fg, F, sp, o); if (o.ink !== false) lead.push(sketch(F, sp.pts, true, sp.seed + 91, 4)); return sp; };
    put(makeWash(F, blob(0, 2 * u, bw * 0.8, 12 * u, s, 0.06), { color: T.grey, a: 0.3, rough: 0.3, layers: 5, edge: 0.4, seed: s, bleeds: 0 }), { erase: false, ink: false });
    // Leg and boot in one shape, toe turned out.
    const q = fh * 0.036, bootC = mix(T.ink, T.sienna, 0.3);
    for (const side of [-1, 1]) {
      const x = side * bw * 0.17, P0 = [[-q, hem - fh * 0.03], [q, hem - fh * 0.03], [q * 1.1, -fh * 0.045], [q * 2.5, -fh * 0.03], [q * 2.9, -fh * 0.004], [-q * 1.2, 0], [-q * 1.15, -fh * 0.04]];
      put(makeWash(F, P0.map(([px, py]) => [x + side * px, py]), { color: bootC, color2: mix(T.ink, coat, 0.4), a: 0.72, rough: 0.2, layers: 6, edge: 1, seed: s + 10 + side, seg: 6, bleeds: 0, blooms: 0, lift: 0.2 }));
    }
    if (style.hair === "long") put(makeWash(F, [...arcPts(0, hy, hr * 1.16, Math.PI, TAU, 14), [hr * 1.2, hy + hr * 1.5], [hr * 0.7, hy + hr * 1.75], [-hr * 0.7, hy + hr * 1.75], [-hr * 1.2, hy + hr * 1.5]], { color: hair, a: 0.7, rough: 0.16, layers: 6, edge: 1, seed: s + 20, seg: 9, gran: 0.5, bleeds: 0 }));
    // The robe and its hanging left sleeve are one silhouette, painted as one wash.
    const robe = [
      [-sw * 0.22, sy], [-sw * 0.42, sy + sw * 0.1], [-sw * 0.54, sy + sw * 0.32], [-bw * 0.5, -fh * 0.52], [-bw * 0.6, cuffY + fh * 0.012], [-bw * 0.4, cuffY + fh * 0.022],
      [-bw * 0.33, -fh * 0.46], [-bw * 0.37, -fh * 0.28], [-bw * 0.52, hem - fh * 0.01],
      [-bw * 0.3, hem + fh * 0.014], [-bw * 0.1, hem - fh * 0.004], [bw * 0.1, hem + fh * 0.012], [bw * 0.3, hem - fh * 0.002], [bw * 0.52, hem - fh * 0.012],
      [bw * 0.37, -fh * 0.28], [bw * 0.33, -fh * 0.48], [sw * 0.54, sy + sw * 0.32], [sw * 0.42, sy + sw * 0.1], [sw * 0.22, sy], [0, sy + sw * 0.14],
    ];
    put(makeWash(F, robe, { color: coat, a: 0.64, rough: 0.2, layers: 9, edge: 1, blooms: 2, gran: 0.75, lift: 0.3, seed: s + 1, seg: 12, mott: 1, vary: 0.75, bleeds: 1 }));
    // Paper lifted out while the robe was wet: a pale streak down the lit side and along a fold.
    fg.save(); fg.globalCompositeOperation = "destination-out"; fg.lineCap = "round";
    for (const [x0, y0, x1, y1, wd, al0] of [[-bw * 0.3, sy + sw * 0.5, -bw * 0.36, hem - fh * 0.06, fh * 0.035, 0.5], [-bw * 0.12, -fh * 0.42, -bw * 0.16, hem - fh * 0.04, fh * 0.018, 0.4]]) {
      fg.globalAlpha = al0; fg.filter = `blur(${fh * 0.012}px)`; fg.lineWidth = wd;
      fg.beginPath(); fg.moveTo(x0, y0); fg.quadraticCurveTo(x0 - wd, (y0 + y1) / 2, x1, y1); fg.stroke();
    }
    fg.filter = "none"; fg.restore();
    // A glaze down the shaded side and along the sleeve fold: meant to layer, so it is not knocked out.
    inlay(fg, F, makeWash(F, [[bw * 0.08, hem], [bw * 0.5, hem], [bw * 0.36, -fh * 0.3], [sw * 0.42, sy + sw * 0.32], [bw * 0.1, -fh * 0.38]], { color: F.deep(coat), a: 0.2, rough: 0.3, layers: 6, edge: 0.3, seed: s + 21, seg: 14, bleeds: 0, blooms: 0 }), { erase: false, ink: false });
    if (style.scarf) put(makeWash(F, [[-sw * 0.52, sy + sw * 0.16], [sw * 0.52, sy + sw * 0.16], [sw * 0.44, sy + sw * 0.42], [sw * 0.1, sy + sw * 0.46], [sw * 0.2, sy + fh * 0.2], [-sw * 0.02, sy + fh * 0.21], [-sw * 0.06, sy + sw * 0.46], [-sw * 0.44, sy + sw * 0.42]], { color: style.scarf, a: 0.72, rough: 0.16, layers: 6, edge: 1, seed: s + 7, seg: 10, bleeds: 0 }));
    put(makeWash(F, blob(-bw * 0.5, cuffY + fh * 0.045, hr * 0.3, hr * 0.32, s + 5, 0.06, 16), { color: skin, a: 0.7, rough: 0.12, layers: 5, edge: 0.9, seed: s + 6, seg: 6, bleeds: 0, blooms: 0 }));
    put(makeWash(F, blob(0, hy, hr, hr * 1.05, s + 8, 0.03, 36), { color: skin, color2: mix(skin, T.rose, 0.5), a: 0.62, rough: 0.12, layers: 7, edge: 0.85, seed: s + 8, seg: 10, gran: 0.25, lift: 0.3, vary: 0.4, bleeds: 0 }));
    const hs = style.hair;
    if (hs === "beret") put(makeWash(F, [...arcPts(hr * 0.12, hy - hr * 0.66, hr * 1.12, Math.PI * 1.02, Math.PI * 1.98, 12).map(([px, py]) => [px, hy - hr * 0.66 + (py - (hy - hr * 0.66)) * 0.5]), [hr * 1.1, hy - hr * 0.52], [-hr * 0.9, hy - hr * 0.5], ...arcPts(hr * 0.2, hy - hr * 1.28, hr * 0.12, Math.PI, TAU, 4)], { color: style.hat, a: 0.78, rough: 0.14, layers: 6, edge: 1, seed: s + 9, seg: 9, bleeds: 0 }));
    else {
      if (hs === "bun") put(makeWash(F, blob(0, hy - hr * 1.15, hr * 0.42, hr * 0.38, s + 11, 0.05, 20), { color: hair, a: 0.78, rough: 0.14, layers: 5, edge: 1, seed: s + 11, seg: 8, bleeds: 0 }));
      const cap = [...arcPts(0, hy, hr * 1.1, Math.PI * 1.02, Math.PI * 1.98, 14), [hr * 0.98, hy - hr * 0.08], [hr * 0.35, hy - hr * 0.42], [-hr * 0.15, hy - hr * 0.32], [-hr * 0.98, hy - hr * 0.08]];
      put(makeWash(F, cap, { color: hair, a: 0.74, rough: 0.16, layers: 6, edge: 1, seed: s + 9, seg: 9, gran: 0.5, bleeds: 0 }));
    }
    // The free right arm, sleeve and hand, painted once in its own frame so it can swing; a mask of
    // its silhouette knocks the robe out beneath it wherever it moves.
    const L = fh * 0.29, ax = -fh * 0.22, ay = -fh * 0.22, ac = canvas(L + fh * 0.5, fh * 0.44), am = canvas(ac.width, ac.height);
    const sleeve = makeWash(F, capsule(0, 0, L, 0, fh * 0.115, fh * 0.088), { color: mix(coat, F.deep(coat), 0.3), a: 0.7, rough: 0.14, layers: 6, edge: 1, seed: s + 30, seg: 8, bleeds: 0, blooms: 0, gran: 0.6 });
    const hand = makeWash(F, blob(L + hr * 0.14, 0, hr * 0.3, hr * 0.28, s + 31, 0.05, 16), { color: skin, a: 0.72, rough: 0.12, layers: 5, edge: 0.9, seed: s + 32, seg: 6, bleeds: 0, blooms: 0 });
    const acx = ac.getContext("2d"), amx = am.getContext("2d");
    acx.translate(-ax, -ay); amx.translate(-ax, -ay);
    inlay(acx, F, sleeve); inlay(acx, F, hand);
    amx.fillStyle = "#000"; polyPath(amx, sleeve.pts); amx.fill(); polyPath(amx, hand.pts); amx.fill();
    return { fig: { c: fc, x: -ox, y: -oy, w: fc.width, h: fc.height, seed: s, deep: F.deep(coat) }, ox, oy, buf: canvas(fc.width, fc.height), lead, arm: { c: ac, mask: am, x: ax, y: ay, L: L + hr * 0.14 }, hr, hy, sy, bw, sw, fh };
  }
  function peopleBuild(F, a, d) {
    const { u, T, tall } = F, n = Math.max(2, Math.min(6, Math.round(Number(d.count) || 4)));
    const hot = Math.min(n - 1, Number.isInteger(d.highlight) ? d.highlight : 1);
    const rows = tall && n > 3 ? 2 : 1, per = Math.ceil(n / rows);
    const slot = a.w / per, tagRoom = 150 * u;
    const rowH = a.h / rows;
    const fh = Math.min(rowH - tagRoom - 70 * u, slot * 1.5, 470 * u);
    const grounds = rows === 1 ? [a.y + a.h - 54 * u] : [a.y + rowH - 60 * u, a.y + a.h - 50 * u];
    const styles = ["cap", "beret", "bun", "long", "cap", "beret"];
    const people = [];
    for (let i = 0; i < n; i++) {
      const row = rows === 1 ? 0 : Math.floor(i / per), inRow = rows === 1 ? n : (row === 0 ? per : n - per), col = i - row * per;
      const cx = a.x + (a.w / inRow) * (col + 0.5), ground = grounds[row];
      const isHot = i === hot, coat = isHot ? F.A : T[PIGS[(i + 1) % PIGS.length]];
      const st = { hair: styles[i % styles.length], hat: T[["rose", "violet", "teal"][i % 3]] === coat ? T.ochre : T[["rose", "violet", "teal"][i % 3]], scarf: isHot ? T.ochre : i % 3 === 2 ? T.rose : null, raise: isHot };
      const P = personBuild(F, i, fh * (isHot ? 1.06 : 1), coat, T.skin[i % T.skin.length], T.hair[i % T.hair.length], st);
      // Each named role gets its own speech tag; a figure past the named roles gets a tag with a painted tick.
      const badges = d.badges || [], label = i < badges.length ? String(badges[i] || "") : "", icon = i >= badges.length;
      const size = 58 * u, tw = icon ? 70 * u : Math.min(measure(label, size), slot * 0.84);
      const ty = ground - P.fh - 70 * u, bw2 = tw + 90 * u, bh2 = 100 * u;
      const box2 = rrect(cx - bw2 / 2, ty - 58 * u, bw2, bh2, 38 * u);
      const tag = label || icon ? makeWash(F, [...box2.slice(0, 27), [cx + 14 * u, ty + 42 * u], [cx - 2 * u, ty + 66 * u], [cx - 8 * u, ty + 42 * u], ...box2.slice(27)], { color: mix(coat, T.paper, 0.74), a: 0.5, rough: 0.2, layers: 7, edge: 0.9, seed: 1500 + i, seg: 12, lift: 0.3, line: true, tooth: 0.5 }) : null;
      // A small thought-bubble that paints in beside the tag whenever this person speaks.
      const side = col === inRow - 1 ? -1 : 1, chx = cx + side * (bw2 / 2 + 8 * u), chy = ty - 92 * u;
      const chat = makeWash(F, [...blob(chx, chy, 46 * u, 30 * u, 1570 + i, 0.08, 30).slice(0, 30)], { color: mix(T[PIGS[(i + 3) % PIGS.length]], T.paper, 0.55), a: 0.6, rough: 0.25, layers: 6, edge: 1, seed: 1570 + i, seg: 10, lift: 0.15, line: true, feather: 0.6 });
      const puff = [0, 1].map((k) => makeWash(F, blob(lerp(chx, cx + side * bw2 * 0.3, 0.45 + k * 0.3), lerp(chy + 30 * u, ty - 50 * u, 0.45 + k * 0.3), (10 - k * 3) * u, (8 - k * 2) * u, 1580 + i * 2 + k, 0.08, 14), { color: mix(T[PIGS[(i + 3) % PIGS.length]], T.paper, 0.5), a: 0.6, rough: 0.2, layers: 4, edge: 1, seed: 1580 + i * 2 + k, seg: 5, feather: 0 }));
      people.push({ ...P, cx, ground, isHot, coat, label, icon, tag, ty, tw, size, slot: a.w / inRow, i, style: st, chat, puff, chx, chy, tick: sketch(F, [[cx - 26 * u, ty - 6 * u], [cx - 7 * u, ty + 15 * u], [cx + 28 * u, ty - 30 * u]], false, 1550 + i) });
    }
    const lands = grounds.map((gy, r) => ({
      hills: makeWash(F, [[a.x - 120 * u, gy], [a.x - 120 * u, gy - fh * 0.5], [a.x + a.w * 0.2, gy - fh * 0.78], [a.x + a.w * 0.45, gy - fh * 0.55], [a.x + a.w * 0.72, gy - fh * 0.85], [a.x + a.w + 120 * u, gy - fh * 0.5], [a.x + a.w + 120 * u, gy]], { color: mix(T.teal, T.paper, 0.35), a: 0.3, rough: 0.8, layers: 10, edge: 0.6, lift: 0.4, seed: 1600 + r, blooms: 2, soft: 8 }),
      grass: makeWash(F, [[a.x - 110 * u, gy - 12 * u], [a.x + a.w + 110 * u, gy - 18 * u], [a.x + a.w + 100 * u, gy + 38 * u], [a.x - 100 * u, gy + 34 * u]], { color: T.green, a: 0.55, rough: 0.7, layers: 9, edge: 0.9, gran: 0.7, seed: 1610 + r }),
      pen: sketch(F, [[a.x - 60 * u, gy - 2 * u], [a.x + a.w + 60 * u, gy - 6 * u]], false, 1620 + r),
      gy,
    }));
    const clouds = [0, 1].map((k) => makeWash(F, cloudShape(0, 0, 230 * u, 70 * u, 1700 + k), { color: mix(T.sky, T.paper, 0.2), a: 0.3, rough: 0.5, layers: 8, edge: 0.6, lift: 0.4, seed: 1700 + k }));
    const drp = dropsBuild(F, [{ x: a.x + a.w * 0.5, y: a.y + 10 * u, r: 20, at: 0.5 }, { x: a.x + a.w * 0.98, y: a.y + a.h * 0.3, r: 24, at: 0.68 }, { x: a.x + a.w * 0.02, y: a.y + a.h * 0.32, r: 18, at: 0.86 }], 1900);
    return { people, lands, clouds, fh, drp };
  }
  function people(g, F, a, d, local, hold) {
    const Pp = cached(keyOf(F, "people", a, d), () => peopleBuild(F, a, d));
    const { u, t, T } = F, tt = local / buildWin(hold);
    Pp.clouds.forEach((c, k) => {
      const x = a.x - 200 * u + frac(0.15 + k * 0.5 + t * 0.032) * (a.w + 400 * u), y = a.y + (k ? 0.12 : 0.04) * a.h;
      g.save(); g.translate(x, y); g.globalAlpha *= clamp(0.3 + tt / 0.5); g.drawImage(c.c, c.x, c.y); g.restore();
    });
    Pp.lands.forEach((L) => {
      show(g, F, L.hills, 0.3 + tt / 0.5, a.x + a.w / 2, L.gy);
      show(g, F, L.grass, 0.25 + tt / 0.45, a.x, L.gy);
      pencil(g, F, [L.pen], clamp(0.3 + tt / 0.3));
    });
    drops(g, F, Pp.drp, local, hold);
    const nP = Pp.people.length, tk0 = buildWin(hold) * 0.7, CYC = 1.05, talkT = (local - tk0) / CYC, talk = local > tk0 ? Math.floor(talkT) % nP : -1, talkF = frac(talkT);
    for (const P of Pp.people) {
      const s0 = 0.12 + P.i * 0.07, k = span(tt, s0, s0 + 0.5);
      if (k <= 0) continue;
      const talking = P.i === talk, hop = talking ? Math.abs(Math.sin(t * 5.5)) * 7 * u : 0;
      const sway = 0.025 * Math.sin(t * 1.3 + P.i * 1.7), breathe = 1 + 0.016 * Math.sin(t * 2.1 + P.i), skew = 0.06 * Math.sin(t * 1.7 + P.i * 2.3);
      // Every head nods on its own beat; whoever is talking nods along with the words.
      const nod = (talking ? 0.09 * Math.sin(t * 7) : 0.045 * Math.sin(t * 1.9 + P.i * 1.3)) + 0.02 * Math.sin(t * 0.7 + P.i);
      // The arm's angle: hanging and swinging, lifted to gesture while its owner talks, or waving a brush.
      const shx = P.sw * 0.46, shy = P.sy + P.sw * 0.28, rest = Math.atan2(-P.fh * 0.36 - shy, P.bw * 0.47 - shx);
      const up = talking ? 0.5 + 0.5 * Math.sin(t * 3) : 0;
      const ang = P.style.raise ? -0.95 + 0.3 * Math.sin(t * 2.6) : lerp(rest + 0.07 * Math.sin(t * 1.7 + P.i), -0.35 + 0.25 * Math.sin(t * 4), up * span(k, 0.8, 1));
      const B = P.buf, bg = B.getContext("2d");
      bg.setTransform(1, 0, 0, 1, 0, 0); bg.globalCompositeOperation = "source-over"; bg.globalAlpha = 1; bg.clearRect(0, 0, B.width, B.height);
      bg.drawImage(P.fig.c, 0, 0);
      bg.translate(P.ox + shx, P.oy + shy); bg.rotate(ang);
      bg.globalCompositeOperation = "destination-out"; bg.drawImage(P.arm.mask, P.arm.x, P.arm.y);
      bg.globalCompositeOperation = "source-over"; bg.drawImage(P.arm.c, P.arm.x, P.arm.y);
      g.save(); g.translate(P.cx, P.ground - hop); g.rotate(sway); g.transform(1, 0, skew, 1, 0, 0); g.scale(1, breathe);
      const neckY = P.sy + P.hr * 0.12, headAt = () => { g.translate(0, neckY); g.rotate(nod); g.translate(0, -neckY); };
      if (k < 1) show(g, F, { c: B, x: P.fig.x, y: P.fig.y, w: B.width, h: B.height, seed: P.fig.seed, deep: P.fig.deep }, span(k, 0.22, 1), 0, -P.fh * 0.45);
      else { // Body, then the head turned about the neck.
        g.save(); g.beginPath(); g.rect(P.fig.x, neckY, B.width, B.height); g.clip(); g.drawImage(B, P.fig.x, P.fig.y); g.restore();
        g.save(); g.beginPath(); g.rect(P.fig.x, P.fig.y, B.width, neckY - P.fig.y + 0.5); g.clip(); headAt(); g.drawImage(B, P.fig.x, P.fig.y); g.restore();
      }
      pencil(g, F, P.lead, clamp(k / 0.5), { alpha: 0.55 * (1 - span(k, 0.7, 1)) });
      const f = span(k, 0.6, 1);
      if (f > 0) {
        g.globalAlpha *= f;
        g.save(); if (k >= 1) headAt();
        const blink = frac(t * 0.31 + P.i * 0.23) < 0.04;
        const ex = P.hr * 0.36, ey = P.hy + P.hr * 0.08;
        // Wet highlight left as bare paper on the brow, and cheeks dropped in wet so they bloom with a soft rim.
        const hr0 = P.hr;
        g.save(); g.fillStyle = al(T.lite, 0.8); g.filter = `blur(${hr0 * 0.05}px)`;
        g.beginPath(); g.ellipse(-hr0 * 0.36, P.hy - hr0 * 0.42, hr0 * 0.24, hr0 * 0.11, -0.55, 0, TAU); g.fill();
        g.globalAlpha *= 0.7; g.beginPath(); g.ellipse(-hr0 * 0.62, P.hy - hr0 * 0.1, hr0 * 0.06, hr0 * 0.14, 0.2, 0, TAU); g.fill();
        g.restore();
        for (const sx of [-1, 1]) {
          const chx = sx * hr0 * 0.56, chy = P.hy + hr0 * 0.4, cr = hr0 * (0.2 + 0.015 * Math.sin(t * 0.9 + P.i + sx));
          soft(g, chx, chy, cr * 1.5, T.rose, 0.42);
          g.save(); g.strokeStyle = al(F.deep(T.rose), 0.3); g.lineWidth = 1.6 * u; g.filter = `blur(${0.8 * u}px)`;
          g.beginPath(); for (let j = 0; j <= 18; j++) { const an = (j / 18) * TAU, rr = cr * (1 + 0.14 * Math.sin(an * 3 + P.i * 2 + sx) + 0.07 * Math.sin(an * 7 + sx)); const px = chx + Math.cos(an) * rr, py = chy + Math.sin(an) * rr * 0.8; j ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke(); g.restore();
        }
        // Loose ink over the head: a contour heavier on the shadow side and lifting off at the brow, a nose
        // tick and a few hair strokes, all a little off register from the paint.
        g.save(); g.strokeStyle = mix(T.ink, F.deep(T.skin[P.i % T.skin.length]), 0.3); g.lineCap = "round";
        const hp = [];
        for (let j = 0; j <= 40; j++) { const an = 0.15 * Math.PI + (j / 40) * 1.55 * Math.PI, rr = hr0 * (1.01 + 0.025 * Math.sin(an * 5 + P.i)); hp.push([1.5 * u + Math.cos(an) * rr, P.hy + 1.2 * u + Math.sin(an) * rr * 1.04]); }
        for (let j = 0; j < hp.length - 1; j++) { const an = 0.15 * Math.PI + (j / 40) * 1.55 * Math.PI, sh = 0.5 + 0.5 * Math.cos(an - Math.PI * 0.25); g.lineWidth = (0.8 + 3.2 * sh * sh) * u; g.globalAlpha = 0.45 + 0.45 * sh; g.beginPath(); g.moveTo(hp[j][0], hp[j][1]); g.lineTo(hp[j + 1][0], hp[j + 1][1]); g.stroke(); }
        g.globalAlpha = 0.7; g.lineWidth = 2.4 * u; g.beginPath(); g.moveTo(hr0 * 0.04, P.hy + hr0 * 0.12); g.quadraticCurveTo(hr0 * 0.14, P.hy + hr0 * 0.24, hr0 * 0.02, P.hy + hr0 * 0.27); g.stroke();
        g.globalAlpha = 0.55; g.lineWidth = 1.6 * u;
        for (let j = 0; j < 3; j++) { const x0 = -hr0 * (0.5 - j * 0.32); g.beginPath(); g.moveTo(x0, P.hy - hr0 * 0.62); g.quadraticCurveTo(x0 + hr0 * 0.12, P.hy - hr0 * 0.4, x0 + hr0 * 0.2, P.hy - hr0 * (0.34 + j * 0.03)); g.stroke(); }
        g.restore();
        g.fillStyle = T.ink; g.strokeStyle = T.ink; g.lineCap = "round";
        for (const sx of [-1, 1]) {
          if (blink) { g.lineWidth = 2.6 * u; g.beginPath(); g.moveTo(sx * ex - 6 * u, ey); g.lineTo(sx * ex + 6 * u, ey); g.stroke(); }
          else { g.beginPath(); g.ellipse(sx * ex, ey, 4.6 * u, 6 * u, 0, 0, TAU); g.fill(); g.fillStyle = al(T.lite, 0.9); g.beginPath(); g.arc(sx * ex - 1.4 * u, ey - 2 * u, 1.5 * u, 0, TAU); g.fill(); g.fillStyle = T.ink; }
          g.save(); g.globalAlpha *= 0.6; g.lineWidth = 1.8 * u; g.beginPath(); g.moveTo(sx * ex - 7 * u, ey - 11 * u); g.quadraticCurveTo(sx * ex, ey - 14 * u - sx * 1 * u, sx * ex + 7 * u, ey - 10 * u); g.stroke(); g.restore();
        }
        if (talking) { g.beginPath(); g.ellipse(0, P.hy + P.hr * 0.42, P.hr * 0.16, P.hr * (0.06 + 0.1 * Math.abs(Math.sin(t * 11))), 0, 0, TAU); g.fill(); }
        else { g.lineWidth = 2 * u; g.beginPath(); g.arc(0, P.hy + P.hr * 0.3, P.hr * 0.24, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke(); }
        g.restore();
        if (P.style.raise) { // The highlighted painter waves a brush.
          const ex2 = shx + Math.cos(ang) * P.arm.L, ey2 = shy + Math.sin(ang) * P.arm.L, ba = ang - 0.6, bl = P.fh * 0.2;
          brush(g, F, [[ex2 - Math.cos(ba) * bl * 0.3, ey2 - Math.sin(ba) * bl * 0.3], [ex2 + Math.cos(ba) * bl * 0.6, ey2 + Math.sin(ba) * bl * 0.6]], 6 * u, T.sienna, 1, 1, 1805);
          brush(g, F, [[ex2 + Math.cos(ba) * bl * 0.6, ey2 + Math.sin(ba) * bl * 0.6], [ex2 + Math.cos(ba) * bl * 0.95, ey2 + Math.sin(ba) * bl * 0.95]], 11 * u, T.ink, 0.8, 1, 1810);
        }
      }
      g.restore();
      if (P.tag) {
        const q = span(tt, s0 + 0.3, s0 + 0.6), bob = Math.sin(t * 1.6 + P.i * 0.9) * 5 * u, pop = talking ? 1 + 0.05 * Math.abs(Math.sin(t * 5.5)) : 1;
        g.save(); g.translate(P.cx, P.ty + bob); g.scale(pop, pop); g.translate(-P.cx, -P.ty);
        paint(g, F, P.tag, q, P.cx, P.ty, 0.3);
        if (P.icon) { g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = F.deep(F.A); g.lineWidth = 10 * u; partial(g, P.tick, span(q, 0.02, 0.6)); }
        else write(g, F, P.label, P.cx, P.ty + P.size * 0.34, P.size, { align: "center", q: span(q, 0.02, 0.75), maxW: P.slot * 0.84, min: 50 * u, halo: false, color: P.isHot ? F.deep(F.A) : F.deep(T.ink) });
        g.restore();
      }
      if (talking) { // The speaker's bubble paints in, puffs first, then dots written one by one; it dries off at the end.
        const out = 1 - span(talkF, 0.82, 1);
        g.save(); g.globalAlpha *= out;
        P.puff.forEach((sp, j) => show(g, F, sp, span(talkF, j * 0.06, 0.12 + j * 0.06), sp.cx, sp.cy));
        paint(g, F, P.chat, span(talkF, 0.08, 0.42), P.chx, P.chy, 0.3);
        for (let j = 0; j < 3; j++) { const dq = span(talkF, 0.32 + j * 0.1, 0.42 + j * 0.1); if (dq > 0) dot(g, P.chx + (j - 1) * 22 * u, P.chy + Math.sin(t * 6 + j) * 2 * u, 7 * u * ease(dq), T.ink, 0.85); }
        g.restore();
      }
    }
  }

  // ---- process: stepping stones across a stream, a paper boat sailing past --------------------------------
  function processBuild(F, a, d) {
    const { u, T, tall } = F, steps = d.steps || [], n = Math.max(1, steps.length);
    const stones = [];
    let water, streaks = [], hop = [], boatPath;
    if (!tall) {
      const yc = a.y + a.h * 0.42, bh = a.h * 0.52, rx = Math.min((a.w / n) * 0.3, 200 * u), ry = rx * 0.5;
      for (let i = 0; i < n; i++) stones.push({ cx: a.x + a.w * ((i + 0.5) / n), cy: yc - ry * 0.1, rx, ry, lx: a.x + a.w * ((i + 0.5) / n), ly: yc + bh / 2 + 70 * u, align: "center", maxW: (a.w / n) * 0.94 });
      const top = [], bot = [];
      for (let k = 0; k <= 16; k++) { const x = lerp(a.x - 140 * u, a.x + a.w + 140 * u, k / 16); top.push([x, yc - bh / 2 + Math.sin(k * 1.3) * 16 * u]); bot.push([x, yc + bh / 2 + Math.sin(k * 1.7 + 1) * 14 * u]); }
      water = [...top, ...bot.reverse()];
      for (let k = 0; k < 6; k++) { const y = yc - bh * 0.36 + (k / 5) * bh * 0.72, x0 = a.x + a.w * (0.05 + ((k * 0.37) % 0.5)); streaks.push([[x0, y], [x0 + a.w * (0.25 + (k % 3) * 0.08), y + 4 * u]]); }
      for (let i = 0; i < n - 1; i++) { const A = stones[i], B = stones[i + 1], pts = []; for (let k = 0; k <= 20; k++) { const s = k / 20; pts.push([lerp(A.cx + A.rx * 0.85, B.cx - B.rx * 0.85, s), A.cy - A.ry * 0.9 - Math.sin(Math.PI * s) * A.ry * 1.5]); } hop.push(pts); }
      boatPath = (k) => [lerp(a.x - 80 * u, a.x + a.w + 80 * u, k), yc + bh * 0.3];
    } else {
      const xc = a.x + a.w * 0.3, bw = a.w * 0.46, rx = Math.min(a.w * 0.2, 190 * u), ry = rx * 0.5;
      for (let i = 0; i < n; i++) { const cy = a.y + a.h * ((i + 0.5) / n); stones.push({ cx: xc, cy, rx, ry, lx: xc + rx + 50 * u, ly: cy + 16 * u, align: "left", maxW: a.x + a.w - (xc + rx + 50 * u) }); }
      const left = [], right = [];
      for (let k = 0; k <= 16; k++) { const y = lerp(a.y - 80 * u, a.y + a.h + 60 * u, k / 16), m = Math.sin(k * 0.8) * 30 * u; left.push([xc - bw / 2 + m, y]); right.push([xc + bw / 2 + m + Math.sin(k * 1.3) * 10 * u, y]); }
      water = [...left, ...right.reverse()];
      for (let k = 0; k < 6; k++) { const x = xc - bw * 0.36 + (k / 5) * bw * 0.72, y0 = a.y + a.h * (0.05 + ((k * 0.37) % 0.5)); streaks.push([[x, y0], [x + 4 * u, y0 + a.h * (0.2 + (k % 3) * 0.06)]]); }
      for (let i = 0; i < n - 1; i++) { const A = stones[i], B = stones[i + 1], pts = []; for (let k = 0; k <= 20; k++) { const s = k / 20; pts.push([A.cx - A.rx * 0.9 - Math.sin(Math.PI * s) * A.rx * 0.6, lerp(A.cy + A.ry * 0.5, B.cy - B.ry * 0.7, s)]); } hop.push(pts); }
      boatPath = (k) => [xc + bw * 0.24, lerp(a.y - 60 * u, a.y + a.h + 40 * u, k)];
    }
    const waterSp = makeWash(F, water, { color: mix(T.sky, T.blue, 0.25), color2: mix(T.teal, T.sky, 0.3), a: 0.5, rough: 0.7, layers: 12, edge: 0.95, lift: 0.25, bands: tall ? 0 : 7, backrun: 1, gran: 0.95, vary: 0.8, seed: 2001 });
    const half = Math.floor(water.length / 2), bankPen = [sketch(F, water.slice(0, half).map(([x, y]) => [x + 5 * u, y - 4 * u]), false, 2005), sketch(F, water.slice(half).map(([x, y]) => [x - 3 * u, y + 5 * u]), false, 2006)];
    // The near bank under the step names, with pebbles; it fills the foot of the frame.
    let bank = null, pebbles = [];
    if (!tall) {
      const by = water[water.length - 1][1] + 6 * u, bot = F.H + 40 * u;
      bank = makeWash(F, [[a.x - 160 * u, by + 4 * u], [a.x + a.w * 0.3, by - 8 * u], [a.x + a.w * 0.62, by + 10 * u], [a.x + a.w + 160 * u, by - 6 * u], [a.x + a.w + 160 * u, bot], [a.x - 160 * u, bot]], { color: mix(T.ochre, T.green, 0.35), color2: mix(T.sienna, T.ochre, 0.4), a: 0.4, rough: 0.8, layers: 10, edge: 0.8, gran: 0.9, lift: 0.3, seed: 2007, soft: 6 });
      const pr = rng(2008);
      for (let k = 0; k < 7; k++) { const px = a.x + a.w * ((k + 0.5) / 7) + (pr() - 0.5) * 40 * u, py = Math.min(F.H - 40 * u, by + (F.H - by) * (0.68 + pr() * 0.2)), rr = (18 + pr() * 16) * u; pebbles.push(makeWash(F, blob(px, py, rr * 1.4, rr, 2009 + k, 0.12, 24), { color: T[["grey", "violet", "sienna"][k % 3]], a: 0.55, rough: 0.3, layers: 6, edge: 1, seed: 2009 + k, seg: 8, line: true, gran: 1 })); }
    }
    void streaks;
    // The far bank: a pale meadow wash above the stream with a row of rounded bushes along its edge.
    let far = null, bushes = [];
    if (!tall) {
      const ty = water[0][1], fy = a.y - 20 * u;
      far = makeWash(F, [[a.x - 170 * u, fy + 20 * u], [a.x + a.w * 0.35, fy], [a.x + a.w * 0.7, fy + 26 * u], [a.x + a.w + 170 * u, fy + 6 * u], [a.x + a.w + 170 * u, ty + 30 * u], [a.x - 170 * u, ty + 30 * u]], { color: mix(T.green, T.ochre, 0.45), color2: mix(T.sky, T.green, 0.4), a: 0.2, rough: 1, layers: 10, edge: 0.5, lift: 0.35, mott: 0.6, vary: 0.9, seed: 2400, soft: 10 });
      const br = rng(2401);
      for (let k = 0; k < 9; k++) {
        const bx = a.x - 60 * u + (a.w + 120 * u) * ((k + 0.2 + br() * 0.6) / 9), rr = (34 + br() * 34) * u;
        bushes.push({ ph: br() * TAU, sp: makeWash(F, blob(bx, ty - rr * 0.7, rr * 1.25, rr, 2410 + k, 0.2, 30), { color: T[["green", "teal", "green", "ochre"][k % 4]], color2: mix(T.teal, T.blue, 0.4), a: 0.42, rough: 0.6, layers: 8, edge: 1, gran: 0.9, lift: 0.3, seed: 2410 + k, seg: 10, line: k % 2 === 0 }) });
      }
    } else { // Tall: a pale meadow on the right bank behind the step names.
      const half2 = Math.floor(water.length / 2), edgeX = Math.max(...water.slice(half2).map(([x]) => x));
      far = makeWash(F, [[edgeX - 30 * u, a.y - 60 * u], [F.W + 120 * u, a.y - 90 * u], [F.W + 120 * u, F.H + 80 * u], [edgeX - 30 * u, F.H + 80 * u]], { color: mix(T.green, T.ochre, 0.5), color2: mix(T.sky, T.green, 0.4), a: 0.16, rough: 1, layers: 10, edge: 0.45, lift: 0.4, mott: 0.6, vary: 0.9, seed: 2402, soft: 10 });
    }
    // Dry-brush current marks: short, broken, tapered strokes that ride the stream between the stones.
    const cr = rng(2011), currents = [];
    for (let k = 0; k < 11; k++) currents.push({ lane: -0.4 + cr() * 0.8, off: cr(), len: (130 + cr() * 170) * u, w: (14 + cr() * 14) * u, seed: 2012 + k, sp: 0.04 + cr() * 0.035 });
    stones.forEach((S, i) => {
      S.body = makeWash(F, blob(S.cx, S.cy, S.rx, S.ry, 2110 + i, 0.1, 48), { color: mix(T.grey, T[["violet", "sienna", "blue"][i % 3]], 0.3), color2: mix(T.sienna, T.grey, 0.4), a: 0.64, rough: 0.35, layers: 10, edge: 1, gran: 1.8, holes: 0.25, lift: 0.25, vary: 0.7, seed: 2110 + i, seg: 16, line: true, bleeds: 1 });
      S.crack = sketch(F, [[S.cx - S.rx * 0.1, S.cy - S.ry * 0.7], [S.cx + S.rx * 0.05, S.cy - S.ry * 0.2], [S.cx - S.rx * 0.02, S.cy + S.ry * 0.3]], false, 2115 + i);
      S.top = makeWash(F, blob(S.cx - S.rx * 0.38, S.cy - S.ry * 0.42, S.rx * 0.34, S.ry * 0.22, 2120 + i, 0.15, 30), { color: T.lite, a: 0.22 + (i % 3) * 0.06, rough: 0.6, layers: 6, edge: 0.2, seed: 2120 + i, gran: 0, lift: 0, feather: 0 });
      S.moss = makeWash(F, blob(S.cx + S.rx * 0.5, S.cy + S.ry * 0.45, S.rx * 0.32, S.ry * 0.28, 2130 + i, 0.2, 24), { color: T.green, a: 0.5, rough: 0.5, layers: 6, edge: 0.8, seed: 2130 + i, gran: 0.8 });
      const s = S.ry * 1.2, ix = S.cx, iy = S.cy - S.ry * 0.35;
      S.icon = { ix, iy, s, kind: i === n - 1 ? "seal" : i === 0 ? "sheet" : "brush" };
      if (S.icon.kind === "sheet") { S.sheet = makeWash(F, rrect(ix - s * 0.34, iy - s * 0.5, s * 0.68, s * 0.86, 6 * u), { color: T.lite, a: 0.9, rough: 0.12, layers: 6, edge: 0.6, seed: 2140 + i, seg: 10, gran: 0 }); S.lines = [0, 1, 2, 3].map((k) => sketch(F, [[ix - s * 0.22, iy - s * 0.28 + k * s * 0.17], [ix + s * (k === 3 ? 0.04 : 0.2), iy - s * 0.28 + k * s * 0.17]], false, 2150 + k)); }
      if (S.icon.kind === "seal") S.seal = makeWash(F, blob(ix, iy, s * 0.4, s * 0.4, 2160 + i, 0.07, 30), { color: F.A, a: 0.8, rough: 0.25, layers: 8, edge: 1, seed: 2160 + i, seg: 9, gran: 0.4 });
      S.num = makeWash(F, blob(S.cx - S.rx * 0.95, S.cy - S.ry * 1.05, 30 * u, 28 * u, 2170 + i, 0.08, 24), { color: mix(F.A, T.paper, 0.45), a: 0.6, rough: 0.2, layers: 6, edge: 1, seed: 2170 + i, seg: 8 });
    });
    // Reeds along the banks and lily pads drifting on the current.
    const reeds = [], pads = [];
    const r = rng(2300);
    const banks = tall ? [[water[0][0], 0], [water[water.length - 1][0], 1]] : null;
    for (let k = 0; k < (tall ? 10 : 14); k++) {
      if (!tall) { const top = k % 2 === 0, x = a.x - 40 * u + r() * (a.w + 80 * u), wy = top ? water[0][1] : water[water.length - 1][1]; reeds.push({ x, y: (top ? a.y + a.h * 0.42 - a.h * 0.26 : a.y + a.h * 0.42 + a.h * 0.26) + (r() - 0.5) * 10 * u, h: (50 + r() * 70) * u, ph: r() * TAU }); void wy; }
      else { const left = k % 2 === 0, y = a.y + r() * a.h; reeds.push({ x: left ? a.x + a.w * 0.3 - a.w * 0.23 : a.x + a.w * 0.3 + a.w * 0.23, y, h: (45 + r() * 60) * u, ph: r() * TAU }); }
    }
    void banks;
    for (let k = 0; k < 4; k++) {
      const pr = (26 + r() * 18) * u, notch = r() * TAU;
      const pts = [];
      for (let j = 0; j <= 20; j++) { const ang = notch + 0.35 + (j / 20) * (TAU - 0.7); pts.push([Math.cos(ang) * pr, Math.sin(ang) * pr * 0.55]); }
      pts.push([0, 0]);
      pads.push({ sp: makeWash(F, pts, { color: mix(T.green, T.teal, 0.3), a: 0.62, rough: 0.2, layers: 5, edge: 1, seed: 2310 + k, seg: 6 }), off: r(), lane: r() });
    }
    const drp = dropsBuild(F, tall ? [{ x: a.x + a.w * 0.85, y: a.y + a.h * 0.04, r: 22, at: 0.45 }, { x: a.x + a.w * 0.92, y: a.y + a.h * 0.9, r: 16, at: 0.8 }]
      : [{ x: a.x + a.w * 0.08, y: a.y + a.h * 0.02, r: 20, at: 0.42 }, { x: a.x + a.w * 0.93, y: a.y + a.h * 0.05, r: 26, at: 0.62 }, { x: a.x + a.w * 0.5, y: a.y + a.h * 0.98, r: 18, at: 0.85 }], 2500);
    return { stones, waterSp, currents, hop, boatPath, steps, reeds, pads, bank, pebbles, bankPen, drp, far, bushes };
  }
  function process(g, F, a, d, local, hold) {
    const Pr = cached(keyOf(F, "process", a, d), () => processBuild(F, a, d));
    const { u, t, T, tall } = F, tt = local / buildWin(hold);
    if (Pr.bank) show(g, F, Pr.bank, 0.3 + tt / 0.5, a.x + a.w / 2, F.H);
    if (Pr.far) show(g, F, Pr.far, 0.3 + tt / 0.5, Pr.far.cx, a.y);
    Pr.bushes.forEach((B, k) => { // the bushes lean in the breeze
      const sp = B.sp, lean = Math.sin(t * 1.1 + B.ph) * 0.025;
      g.save(); g.translate(sp.cx, sp.y + sp.h * 0.8); g.transform(1, 0, lean, 1, 0, 0); g.translate(-sp.cx, -(sp.y + sp.h * 0.8));
      paint(g, F, sp, span(tt, 0.15 + k * 0.03, 0.55 + k * 0.03), sp.cx, sp.y + sp.h); g.restore();
    });
    Pr.pebbles.forEach((sp, k) => paint(g, F, sp, span(tt, 0.3 + k * 0.05, 0.7 + k * 0.05), sp.cx, sp.cy));
    show(g, F, Pr.waterSp, 0.3 + tt / 0.5, tall ? Pr.waterSp.cx : a.x, tall ? a.y : Pr.waterSp.cy);
    pencil(g, F, Pr.bankPen, clamp(0.1 + tt / 0.35), { alpha: 0.5 });
    drops(g, F, Pr.drp, local, hold);
    { // Current marks ride downstream, kept off the stones.
      const wv = Pr.waterSp;
      g.save(); g.beginPath(); g.rect(wv.x, wv.y, wv.w, wv.h);
      for (const S of Pr.stones) g.ellipse(S.cx, S.cy + S.ry * 0.25, S.rx * 1.12, S.ry * 1.5, 0, 0, TAU);
      g.clip("evenodd");
      Pr.currents.forEach((c, k) => {
        const ph = frac(c.off + t * c.sp), along = (tall ? a.y - 200 * u : a.x - 200 * u) + ph * ((tall ? a.h : a.w) + 400 * u);
        const pts = [];
        for (let j = 0; j <= 6; j++) { const sA = along + (j / 6) * c.len, lat = c.lane * (tall ? wv.w : wv.h) + Math.sin(sA * 0.012 / u + k) * 6 * u; pts.push(tall ? [wv.cx + lat, sA] : [sA, wv.cy + lat]); }
        g.globalAlpha = span(tt, 0.2 + k * 0.02, 0.5) * Math.sin(Math.PI * ph) * 0.85;
        drybrush(g, F, pts, c.w, mix(T.blue, T.ink, 0.25), 0.5, c.seed);
        drybrush(g, F, pts.map(([x, y]) => (tall ? [x - c.w * 0.9, y + c.len * 0.2] : [x + c.len * 0.2, y - c.w * 0.9])), c.w * 0.6, T.lite, 0.6, c.seed + 50);
      });
      g.restore();
    }
    g.save(); g.strokeStyle = al(T.lite, 0.75); g.lineCap = "round"; // Glints riding the current.
    for (let k = 0; k < 14; k++) {
      const ph = frac(t * 0.22 + k * 0.137), wv = Pr.waterSp;
      const x = tall ? wv.x + wv.w * (0.2 + ((k * 0.29) % 0.6)) : a.x - 60 * u + ph * (a.w + 120 * u), y = tall ? a.y - 40 * u + ph * (a.h + 80 * u) : wv.y + wv.h * (0.22 + ((k * 0.31) % 0.56));
      g.globalAlpha = span(tt, 0.3, 0.6) * Math.sin(Math.PI * ph) * 0.8; g.lineWidth = 2.4 * u;
      g.beginPath(); if (tall) { g.moveTo(x, y); g.lineTo(x, y + 30 * u); } else { g.moveTo(x, y); g.quadraticCurveTo(x + 18 * u, y - 5 * u, x + 38 * u, y); } g.stroke();
    }
    g.restore();
    Pr.pads.forEach((pd) => { // Lily pads ride the current.
      const k = frac(pd.off + t * 0.012);
      const x = tall ? a.x + a.w * 0.3 + (pd.lane - 0.5) * a.w * 0.3 : a.x - 60 * u + k * (a.w + 120 * u);
      const y = tall ? a.y - 40 * u + k * (a.h + 80 * u) : a.y + a.h * 0.42 + (pd.lane - 0.5) * a.h * 0.38;
      g.save(); g.translate(x, y); g.rotate(Math.sin(t * 0.4 + pd.off * 9) * 0.3); g.globalAlpha *= span(tt, 0.3, 0.6); g.drawImage(pd.sp.c, pd.sp.x, pd.sp.y); g.restore();
    });
    // The boat sails the whole scene long.
    const bk = clamp((local + 0.4) / (hold + 0.9)), [bx, by] = Pr.boatPath(bk), bs = 52 * u;
    Pr.stones.forEach((S, i) => {
      const s0 = 0.08 + i * 0.12, k = span(tt, s0, s0 + 0.35);
      if (k > 0) { // The stone's reflection: its own painting mirrored and broken by the ripples.
        const by = S.cy + S.ry * 0.78, sp = S.body, n2 = 9, sh = (S.ry * 1.1) / n2;
        for (let j = 0; j < n2; j++) {
          const yy = by + j * sh, dx = Math.sin(t * 2.2 + j * 0.9 + i) * (2 + j * 1.3) * u;
          g.save(); g.beginPath(); g.rect(sp.x - 30 * u, yy, sp.w + 60 * u, sh + 0.6); g.clip();
          g.globalAlpha *= k * 0.4 * (1 - j / n2);
          g.translate(dx, by); g.scale(1, -0.62); g.translate(0, -by); g.drawImage(sp.c, sp.x, sp.y); g.restore();
        }
      }
      for (let j = 0; j < 2; j++) { // Ripples ring out from each stone.
        const ph = frac(t * 0.42 + i * 0.31 + j * 0.5);
        g.save(); g.globalAlpha *= k * (1 - ph) * 0.6; g.strokeStyle = T.lite; g.lineWidth = 2.4 * u;
        g.beginPath(); g.ellipse(S.cx, S.cy + S.ry * 0.3, S.rx * (1.02 + ph * 0.55), S.ry * (0.75 + ph * 0.45), 0, 0, TAU); g.stroke(); g.restore();
      }
      paint(g, F, S.body, k, S.cx - S.rx * 0.3, S.cy - S.ry * 0.3);
      if (k > 0.3) { // The wet underside darkens toward the waterline.
        g.save(); polyPath(g, S.body.pts); g.clip();
        const sg = g.createLinearGradient(0, S.cy - S.ry * 0.1, 0, S.cy + S.ry * 1.05), sc2 = mix(T.violet, T.ink, 0.35);
        sg.addColorStop(0, al(sc2, 0)); sg.addColorStop(0.6, al(sc2, 0.18)); sg.addColorStop(1, al(sc2, 0.42));
        g.globalAlpha *= span(k, 0.3, 1); g.fillStyle = sg; g.fillRect(S.cx - S.rx * 1.3, S.cy - S.ry * 1.3, S.rx * 2.6, S.ry * 2.6); g.restore();
      }
      pencil(g, F, [S.crack], span(k, 0.5, 1), { alpha: 0.45 });
      show(g, F, S.moss, span(k, 0.4, 1), S.cx + S.rx * 0.5, S.cy + S.ry * 0.45);
      show(g, F, S.top, span(k, 0.5, 1), S.cx, S.cy - S.ry * 0.3);
      const ki = span(tt, s0 + 0.2, s0 + 0.5), I = S.icon;
      if (I.kind === "sheet") { show(g, F, S.sheet, ki, I.ix, I.iy); pencil(g, F, S.lines, span(ki, 0.3, 1), { color: T.ink, alpha: 0.6, width: 2.2 }); }
      else if (I.kind === "brush") {
        const sw = [[I.ix - I.s * 0.45, I.iy + I.s * 0.18], [I.ix - I.s * 0.15, I.iy - I.s * 0.1], [I.ix + I.s * 0.1, I.iy + I.s * 0.14], [I.ix + I.s * 0.38, I.iy - I.s * 0.12]];
        brush(g, F, sw, I.s * 0.2, T.ochre, 0.9, ki, 2200 + i);
        if (ki > 0.3) {
          const wob = Math.sin(t * 2) * 0.06, hx = I.ix + I.s * 0.38, hy = I.iy - I.s * 0.12;
          g.save(); g.globalAlpha *= span(ki, 0.3, 0.7); g.translate(hx, hy); g.rotate(-0.8 + wob);
          g.strokeStyle = T.sienna; g.lineCap = "round"; g.lineWidth = I.s * 0.08; g.beginPath(); g.moveTo(I.s * 0.12, 0); g.lineTo(I.s * 0.62, 0); g.stroke();
          g.strokeStyle = T.grey; g.lineWidth = I.s * 0.09; g.beginPath(); g.moveTo(I.s * 0.05, 0); g.lineTo(I.s * 0.14, 0); g.stroke();
          brush(g, F, [[-I.s * 0.04, 0], [I.s * 0.06, 0]], I.s * 0.1, T.ink, 0.9, 1, 2210);
          g.restore();
        }
      } else if (I.kind === "seal") {
        show(g, F, S.seal, ki, I.ix, I.iy);
        if (ki > 0.4) { g.save(); g.strokeStyle = T.lite; g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = I.s * 0.09; const L = sketch(F, [[I.ix - I.s * 0.18, I.iy + I.s * 0.01], [I.ix - I.s * 0.04, I.iy + I.s * 0.15], [I.ix + I.s * 0.2, I.iy - I.s * 0.15]], false, 2220); partial(g, L, span(ki, 0.4, 0.9)); g.restore(); }
      }
      show(g, F, S.num, span(tt, s0 + 0.15, s0 + 0.4), S.num.cx, S.num.cy);
      if (span(tt, s0 + 0.15, s0 + 0.4) > 0) write(g, F, String(i + 1), S.num.cx, S.num.cy + 17 * u, 50 * u, { align: "center", halo: false, alpha: span(tt, s0 + 0.2, s0 + 0.4) });
      write(g, F, Pr.steps[i], S.lx, S.ly, 72 * u, { align: S.align, q: span(tt, s0 + 0.3, s0 + 0.6), maxW: S.maxW, min: 54 * u, color: F.deep(T.ink) });
    });
    Pr.hop.forEach((pts, i) => { // A dotted brush trail hops from stone to stone.
      const q = span(tt, 0.3 + i * 0.14, 0.6 + i * 0.14);
      if (q <= 0) return;
      const n = Math.floor(pts.length * q);
      for (let k = 1; k < n; k += 2) dot(g, pts[k][0], pts[k][1], 5.5 * u, F.A, 0.75);
      if (q >= 1) {
        const A = pts[pts.length - 3], B = pts[pts.length - 1], ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
        brush(g, F, [[B[0] - Math.cos(ang - 0.5) * 22 * u, B[1] - Math.sin(ang - 0.5) * 22 * u], B, [B[0] - Math.cos(ang + 0.5) * 22 * u, B[1] - Math.sin(ang + 0.5) * 22 * u]], 6 * u, F.A, 0.9, 1, 2230 + i);
      }
    });
    Pr.reeds.forEach((rd, k) => { // Reeds lean in the breeze.
      const q = span(tt, 0.15 + (k % 5) * 0.05, 0.5 + (k % 5) * 0.05);
      if (q <= 0) return;
      const sway = Math.sin(t * 1.4 + rd.ph) * 0.12, tipX = rd.x + Math.sin(sway) * rd.h, tipY = rd.y - Math.cos(sway) * rd.h;
      brush(g, F, [[rd.x, rd.y], [lerp(rd.x, tipX, 0.5) + 4 * u, lerp(rd.y, tipY, 0.5)], [tipX, tipY]], 7 * u, T.green, 0.85, q, 2400 + k);
      if (k % 3 === 0 && q >= 1) { g.save(); g.fillStyle = al(T.sienna, 0.85); g.beginPath(); g.ellipse(lerp(rd.x, tipX, 0.82), lerp(rd.y, tipY, 0.82), 5 * u, 13 * u, sway, 0, TAU); g.fill(); g.restore(); }
    });
    if (local > 0.1) {
      const bob = Math.sin(t * 2.3) * 4 * u, rot = Math.sin(t * 2.3 + 1) * 0.06;
      g.save(); g.globalAlpha *= span(local, 0.1, 0.6); g.strokeStyle = al(T.lite, 0.8); g.lineWidth = 2 * u;
      for (let w = 1; w <= 3; w++) { // A wake trailing behind it.
        const wx = tall ? bx : bx - bs * (0.9 + w * 0.5), wy = tall ? by - bs * (0.5 + w * 0.5) : by + bs * 0.3;
        g.globalAlpha *= 0.8; g.beginPath(); g.moveTo(wx - 12 * u, wy + (tall ? 0 : 0)); g.lineTo(wx + 12 * u, wy); g.stroke();
      }
      g.restore();
      boat(g, F, bx, by + bob, bs, rot, span(local, 0.1, 0.6));
    }
  }

  // ---- compare: two painted hills, each as tall as its number ----------------------------------------------
  function compareBuild(F, a, d) {
    const { u, T } = F, L = Math.max(0, Number(d.leftValue) || 0), R = Math.max(0, Number(d.rightValue) || 0), max = Math.max(L, R, 1e-6);
    const base = a.y + a.h - 90 * u, maxH = Math.max(120 * u, base - a.y - 250 * u);
    const hills = [[L, 0.27, T.blue], [R, 0.73, F.A]].map(([v, fx, col], i) => {
      const cx = a.x + a.w * fx, hw = a.w * 0.22, h = Math.min(maxH, hw * 2.3) * Math.max(0.16, v / max), top = [];
      // A hand-drawn silhouette: the summit set off-centre, a shoulder on one flank, a lumpy skyline, so it
      // reads as a hill someone painted rather than a curve.
      const hr2 = rng(3300 + i), skew = 0.85 + hr2() * 0.3, sh = 0.3 + hr2() * 0.35, ph = hr2() * TAU, NK = 48;
      for (let k = 0; k <= NK; k++) {
        const s = k / NK, x = cx - hw + s * hw * 2, ss = Math.pow(s, skew);
        let c = Math.pow(Math.sin(Math.PI * ss), 1.25);
        c += 0.12 * Math.exp(-Math.pow((s - sh) / 0.09, 2)) * Math.sin(Math.PI * s);
        c *= 1 + 0.07 * Math.sin(s * 7 + ph) + 0.05 * Math.sin(s * 13 + ph * 1.3) + 0.025 * Math.sin(s * 31 + ph * 2);
        top.push([x, base - h * Math.min(1.08, c) - Math.sin(Math.PI * s) * 4 * u * Math.sin(s * 57 + ph)]);
      }
      const body = [...top, [cx + hw, base + 8 * u], [cx - hw, base + 8 * u]];
      let pi = 0;
      top.forEach((p, k) => { if (p[1] < top[pi][1]) pi = k; });
      const pk = top[pi];
      const trees = [];
      for (let k = 0; k < 3; k++) { const s = 0.2 + k * 0.28, x = cx - hw + s * hw * 2, y = base - h * Math.pow(Math.sin(Math.PI * s), 1.5) * 0.45; trees.push({ x, y, s: Math.max(18 * u, Math.min(34 * u, h * 0.09)) }); }
      return {
        v, cx, hw, h, pk, col, trees,
        body: makeWash(F, body, { color: mix(col, T.paper, i ? 0.1 : 0.2), color2: i ? mix(col, T.ochre, 0.5) : mix(col, T.teal, 0.55), a: 0.56, rough: 0.35, wobble: 4, layers: 11, edge: 1, blooms: 2, gran: 0.95, lift: 0.35, vary: 0.85, mott: 1, seed: 3000 + i, seg: 14, line: true, shade: { x: pk[0] + hw * 0.06, y: pk[1] + h * 0.35, ang: -0.4, amt: 1 } }),
        tree: trees.map((tr, k) => makeWash(F, blob(tr.x, tr.y - tr.s, tr.s * 0.6, tr.s, 3020 + i * 5 + k, 0.1, 20), { color: T.green, a: 0.7, rough: 0.3, layers: 5, edge: 1, seed: 3020 + i * 5 + k, seg: 8 })),
        pen: [sketch(F, top, false, 3040 + i), sketch(F, [[pk[0], pk[1]], [pk[0], pk[1] - 100 * u]], false, 3050 + i)],
      };
    });
    const ground = makeWash(F, [[a.x - 100 * u, base - 4 * u], [a.x + a.w + 100 * u, base - 10 * u], [a.x + a.w + 90 * u, base + 30 * u], [a.x - 90 * u, base + 26 * u]], { color: mix(T.ochre, T.green, 0.4), a: 0.5, rough: 0.7, layers: 9, edge: 0.9, gran: 0.7, seed: 3060 });
    const sky = makeWash(F, blob(a.x + a.w / 2, a.y + a.h * 0.35, a.w * 0.6, a.h * 0.4, 3070, 0.15), { color: mix(T.sky, T.paper, 0.2), a: 0.2, rough: 0.9, layers: 10, edge: 0.4, lift: 0.6, seed: 3070, blooms: 2, soft: 10 });
    const clouds = [0, 1, 2].map((k) => makeWash(F, cloudShape(0, 0, (180 + k * 40) * u, (54 + k * 8) * u, 3080 + k), { color: mix(T.sky, T.grey, 0.2), a: 0.28, rough: 0.5, layers: 8, edge: 0.6, lift: 0.4, seed: 3080 + k }));
    // A low sun over the smaller hill, where the sky would otherwise stand empty.
    const sunR = Math.min(a.h * 0.13, 110 * u), sunP = { x: a.x + a.w * 0.9, y: a.y + a.h * 0.3 };
    const sun = makeWash(F, blob(sunP.x, sunP.y, sunR, sunR, 3100, 0.04, 40), { color: T.ochre, color2: mix(T.ochre, T.rose, 0.6), a: 0.62, rough: 0.3, layers: 9, edge: 1, seed: 3100, seg: 12, line: true, shine: 0.7, charges: 0, lift: 0, vary: 0.3, mott: 0.35 });
    const sunHalo = makeWash(F, blob(sunP.x, sunP.y, sunR * 2.1, sunR * 1.7, 3101, 0.2), { color: mix(T.rose, T.ochre, 0.5), a: 0.2, rough: 0.9, layers: 10, edge: 0.5, lift: 0.5, seed: 3101, soft: 10 });
    const drp = dropsBuild(F, [{ x: a.x + a.w * 0.06, y: a.y + a.h * 0.12, r: 20, at: 0.55 }, { x: a.x + a.w * 0.6, y: a.y + a.h * 0.06, r: 16, at: 0.72 }, { x: a.x + a.w * 0.5, y: base - 40 * u, r: 22, at: 0.88 }], 3200);
    return { hills, ground, sky, clouds, base, maxH, sun, sunHalo, sunP, sunR, drp };
  }
  function compare(g, F, a, d, local, hold) {
    const Cm = cached(keyOf(F, "compare", a, d), () => compareBuild(F, a, d));
    const { u, t, T } = F, tt = local / buildWin(hold);
    spread(g, Cm.sky, 1 + 0.06 * (local / Math.max(1, hold)) + 0.012 * Math.sin(t * 0.8), () => show(g, F, Cm.sky, 0.3 + tt / 0.5, Cm.sky.cx, Cm.sky.cy));
    Cm.clouds.forEach((c, k) => {
      const x = a.x - 220 * u + frac(0.1 + k * 0.37 + t * (0.03 + k * 0.008)) * (a.w + 440 * u), y = a.y + a.h * (0.05 + k * 0.1);
      g.save(); g.translate(x, y); g.globalAlpha *= clamp(0.3 + tt / 0.5); g.drawImage(c.c, c.x, c.y); g.restore();
    });
    spread(g, Cm.sunHalo, 1 + 0.05 * Math.sin(t * 1.2), () => show(g, F, Cm.sunHalo, 0.3 + tt / 0.5, Cm.sunP.x, Cm.sunP.y));
    if (tt > 0.3) { // Brushed rays turning slowly round the sun.
      g.save(); g.globalAlpha *= span(tt, 0.3, 0.6) * 0.75;
      for (let k = 0; k < 9; k++) {
        const an = t * 0.35 + (k / 9) * TAU, r0 = Cm.sunR * (1.25 + 0.08 * Math.sin(t * 2 + k)), r1 = r0 + Cm.sunR * (0.35 + 0.15 * Math.sin(t * 1.6 + k * 2));
        brush(g, F, [[Cm.sunP.x + Math.cos(an) * r0, Cm.sunP.y + Math.sin(an) * r0], [Cm.sunP.x + Math.cos(an + 0.08) * r1, Cm.sunP.y + Math.sin(an + 0.08) * r1]], 10 * u, mix(T.ochre, T.rose, 0.3), 0.9, 1, 3110 + k);
      }
      g.restore();
    }
    g.save(); g.translate(0, Math.sin(t * 0.7) * 6 * u); paint(g, F, Cm.sun, span(tt, 0.05, 0.5), Cm.sunP.x, Cm.sunP.y); g.restore();
    show(g, F, Cm.ground, 0.25 + tt / 0.45, a.x, Cm.base);
    if (tt > 0.25) { // Grass tufts along the ground, bending in the wind that moves the clouds.
      g.save(); g.globalAlpha *= span(tt, 0.25, 0.6);
      for (let k = 0; k < 26; k++) {
        const gx = a.x - 40 * u + ((k * 0.381) % 1) * (a.w + 80 * u), gh = (26 + ((k * 37) % 30)) * u, bend = Math.sin(t * 2.1 + gx * 0.006 / u) * 0.35 + 0.15;
        for (let b = -1; b <= 1; b++) { const ba = -Math.PI / 2 + b * 0.35 + bend; brush(g, F, [[gx + b * 5 * u, Cm.base + 6 * u], [gx + b * 5 * u + Math.cos(ba) * gh * 0.5, Cm.base + 6 * u + Math.sin(ba) * gh * 0.5], [gx + b * 5 * u + Math.cos(ba + bend * 0.3) * gh, Cm.base + 6 * u + Math.sin(ba + bend * 0.3) * gh]], 5 * u, mix(T.green, T.ink, 0.15), 0.8, 1, 3130 + k * 3 + b); }
      }
      g.restore();
    }
    drops(g, F, Cm.drp, local, hold);
    const labels = [d.left, d.right];
    Cm.hills.forEach((Hh, i) => {
      const s0 = 0.08 + i * 0.16, k = span(tt, s0, s0 + 0.5), K = ease(span(tt, s0 + 0.05, s0 + 0.55));
      paint(g, F, Hh.body, k, Hh.pk[0] - Hh.hw * 0.3, Cm.base - Hh.h * 0.4, 0.35);
      if (k > 0.5) { // A cloud's shadow slides over the hill.
        g.save(); polyPath(g, Hh.body.pts); g.clip(); g.globalAlpha *= span(k, 0.5, 1);
        const sx = Hh.cx - Hh.hw * 1.6 + frac(t * 0.09 + i * 0.5) * Hh.hw * 3.2;
        soft(g, sx, Cm.base - Hh.h * 0.55, Hh.hw * 0.55, F.deep(Hh.col), 0.3); g.restore();
      }
      Hh.tree.forEach((sp, j) => { const tr = Hh.trees[j]; g.save(); g.translate(tr.x, tr.y); g.rotate(0.11 * Math.sin(t * 1.8 + j + i)); g.translate(-tr.x, -tr.y); show(g, F, sp, span(k, 0.5 + j * 0.1, 0.9 + j * 0.1), tr.x, tr.y); g.restore(); });
      g.save(); g.translate(-4 * u, 3 * u); pencil(g, F, Hh.pen, clamp(tt / 0.3 - i * 0.25)); g.restore();
      const fq = span(tt, s0 + 0.35, s0 + 0.6);
      if (fq > 0) { // A pennant on the summit, fluttering.
        const px = Hh.pk[0], py = Hh.pk[1] - 100 * u, fl = 84 * u, fhh = 48 * u, top = [], bot = [];
        for (let j = 0; j <= 12; j++) { const s = j / 12, wv = Math.sin(t * 6 - s * 5 + i) * 11 * u * s; top.push([px + fl * s * fq * (0.92 + 0.08 * Math.cos(t * 6 - s * 5)), py + wv]); bot.push([px + fl * s * fq * (0.92 + 0.08 * Math.cos(t * 6 - s * 5)), py + fhh * (1 - s * 0.85) + wv]); }
        const tri = [...top, ...bot.reverse()];
        g.save(); g.globalAlpha *= 0.82; g.fillStyle = i ? F.A : T.ink; polyPath(g, tri); g.fill(); g.strokeStyle = F.deep(i ? F.A : T.ink); g.lineWidth = 1.5 * u; g.stroke(); g.restore();
      }
      if (K > 0) write(g, F, fmt(Hh.v, K, d), Hh.pk[0], Hh.pk[1] - 128 * u, 124 * u, { align: "center", maxW: a.w * 0.42, min: 80 * u, color: i ? F.deep(F.A) : T.ink });
      write(g, F, labels[i], Hh.cx, Cm.base + 76 * u, 50 * u, { align: "center", q: span(tt, s0 + 0.3, s0 + 0.6), maxW: a.w * 0.44, min: 40 * u });
    });
    if (tt > 0.4) birds(g, F, a.x + a.w * 0.38 + local * 30 * u, a.y + a.h * 0.16 + Math.sin(t * 0.7) * 20 * u, 3, 1.2, 3090);
  }

  // ---- title and closing: whole-frame paintings under the statement ---------------------------------------
  function filmPath(F) {
    const { W, H, tall } = F;
    const ctrl = tall ? [[-0.1, 0.9], [0.3, 0.82], [0.75, 0.95], [1.1, 0.86]] : [[-0.06, 0.88], [0.32, 0.79], [0.66, 0.95], [1.06, 0.83]];
    const P = [];
    for (let k = 0; k <= 120; k++) {
      const s = k / 120, m = 1 - s;
      const x = m * m * m * ctrl[0][0] + 3 * m * m * s * ctrl[1][0] + 3 * m * s * s * ctrl[2][0] + s * s * s * ctrl[3][0];
      const y = m * m * m * ctrl[0][1] + 3 * m * m * s * ctrl[1][1] + 3 * m * s * s * ctrl[2][1] + s * s * s * ctrl[3][1];
      P.push([x * W, y * H]);
    }
    const cum = [0];
    for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    return { P, cum, len: cum[cum.length - 1] };
  }
  function along(path, s) {
    const { P, cum } = path;
    let i = 1;
    while (i < P.length - 1 && cum[i] < s) i++;
    const a = P[i - 1], b = P[i], k = clamp((s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]));
    return { x: lerp(a[0], b[0], k), y: lerp(a[1], b[1], k), ang: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  }
  function titleBuild(F) {
    const { W, H, u, T, tall } = F;
    const sun = { x: W * (tall ? 0.78 : 0.86), y: H * (tall ? 0.13 : 0.19), r: Math.min(W, H) * (tall ? 0.13 : 0.12) };
    const hz = H * (tall ? 0.76 : 0.7);
    const film = filmPath(F), fw = 76 * u;
    const L = [], R = [];
    film.P.forEach((p, i) => { const q = along(film, film.cum[i]); L.push([p[0] - Math.sin(q.ang) * fw / 2, p[1] + Math.cos(q.ang) * fw / 2]); R.push([p[0] + Math.sin(q.ang) * fw / 2, p[1] - Math.cos(q.ang) * fw / 2]); });
    return {
      sun, hz, film, fw,
      mid: makeWash(F, [[-100 * u, H * 0.14], [W * 0.5, H * 0.12], [W + 100 * u, H * 0.16], [W + 100 * u, H * 0.66], [W * 0.6, H * 0.6], [W * 0.25, H * 0.66], [-100 * u, H * 0.62]], { color: mix(T.ochre, T.paper, 0.45), color2: mix(T.rose, T.paper, 0.4), a: 0.16, rough: 1, layers: 10, edge: 0.35, lift: 0.15, mott: 0.5, vary: 0.9, blooms: 3, seed: 4008, soft: 14 }),
      sky: makeWash(F, [[-100 * u, -100 * u], [W + 100 * u, -100 * u], [W + 100 * u, H * (tall ? 0.2 : 0.17)], [W * 0.7, H * (tall ? 0.24 : 0.23)], [W * 0.42, H * (tall ? 0.17 : 0.15)], [W * 0.15, H * (tall ? 0.22 : 0.2)], [-100 * u, H * 0.16]], { color: mix(T.sky, T.paper, 0.1), color2: mix(T.rose, T.violet, 0.3), a: 0.3, rough: 1, layers: 12, edge: 0.6, lift: 0.25, backrun: 1, vary: 0.8, seed: 4007, soft: 10 }),
      halo: makeWash(F, blob(sun.x, sun.y, sun.r * 2, sun.r * 1.8, 4001, 0.2), { color: mix(T.rose, T.ochre, 0.4), a: 0.22, rough: 1, layers: 12, edge: 0.5, lift: 0.5, blooms: 2, seed: 4001, soft: 12 }),
      disc: makeWash(F, blob(sun.x, sun.y, sun.r, sun.r, 4002, 0.04, 48), { color: T.ochre, color2: mix(T.ochre, T.rose, 0.35), a: 0.66, rough: 0.35, layers: 10, edge: 1, gran: 0.4, seed: 4002, seg: 14, shine: 0.7, charges: 0, lift: 0, vary: 0.3, mott: 0.35 }),
      far: makeWash(F, [[-80 * u, hz + 40 * u], [-80 * u, hz - H * 0.05], [W * 0.18, hz - H * 0.1], [W * 0.4, hz - H * 0.03], [W * 0.62, hz - H * 0.12], [W * 0.85, hz - H * 0.04], [W + 80 * u, hz - H * 0.08], [W + 80 * u, hz + 40 * u]], { color: mix(T.violet, T.sky, 0.4), color2: mix(T.blue, T.rose, 0.35), a: 0.4, rough: 0.9, layers: 12, edge: 1, lift: 0.25, mott: 1, vary: 0.8, seed: 4003 }),
      near: makeWash(F, [[-80 * u, H + 60 * u], [-80 * u, hz + H * 0.03], [W * 0.22, hz - H * 0.02], [W * 0.5, hz + H * 0.06], [W * 0.78, hz + H * 0.0], [W + 80 * u, hz + H * 0.05], [W + 80 * u, H + 60 * u]], { color: T.green, color2: mix(T.green, T.ochre, 0.55), a: 0.5, rough: 0.9, layers: 12, edge: 1, gran: 1, vary: 0.85, mott: 1, charges: 7, bands: 4, seed: 4004 }),
      ground: makeWash(F, [[-80 * u, H + 60 * u], [-80 * u, H * 0.9], [W * 0.5, H * 0.94], [W + 80 * u, H * 0.88], [W + 80 * u, H + 60 * u]], { color: mix(T.ochre, T.sienna, 0.3), a: 0.4, rough: 0.9, layers: 10, edge: 0.8, gran: 0.7, seed: 4005 }),
      ribbon: makeWash(F, [...L, ...R.reverse()], { color: T.dark ? mix(T.violet, T.grey, 0.4) : T.night, a: 0.7, rough: 0.25, layers: 9, edge: 1, gran: 0.8, seed: 4006, seg: 18, lift: 0.15 }),
      clouds: [0, 1].map((k) => makeWash(F, cloudShape(0, 0, (260 + k * 60) * u, (72 + k * 10) * u, 4010 + k), { color: mix(T.sky, T.grey, 0.2), a: 0.26, rough: 0.6, layers: 9, edge: 0.6, lift: 0.4, seed: 4010 + k })),
      pen: [sketch(F, [[0, hz], [W, hz - 6 * u]], false, 4020), sketch(F, arcPts(sun.x - 5 * u, sun.y + 4 * u, sun.r * 1.03, 0, TAU, 40), false, 4021), sketch(F, film.P.map(([x, y]) => [x, y - 4 * u]), false, 4022),
        sketch(F, [[0, hz - H * 0.05], [W * 0.18, hz - H * 0.1 - 4 * u], [W * 0.4, hz - H * 0.03], [W * 0.62, hz - H * 0.12 - 3 * u], [W * 0.85, hz - H * 0.04], [W, hz - H * 0.08]], false, 4023),
        sketch(F, [[0, hz + H * 0.03], [W * 0.22, hz - H * 0.02 + 4 * u], [W * 0.5, hz + H * 0.06], [W * 0.78, hz + 3 * u], [W, hz + H * 0.05]], false, 4024)],
      drp: dropsBuild(F, [{ x: W * 0.62, y: H * 0.06, r: 18, at: 0.3 }, { x: W * 0.06, y: H * 0.08, r: 24, at: 0.55 }, { x: W * 0.4, y: H * 0.1, r: 14, at: 0.8 }], 4040),
    };
  }
  function filmRun(g, F, B, reveal, speed) {
    const { u, t, T } = F, path = B.film, len = path.len, upto = len * reveal;
    const holeGap = 26 * u, frameGap = 104 * u, shift = t * speed * u;
    g.save();
    g.fillStyle = al(T.lite, 0.85);
    for (let s = frac(shift / holeGap) * holeGap; s < upto; s += holeGap) {
      const p = along(path, s);
      for (const side of [-1, 1]) {
        g.save(); g.translate(p.x - Math.sin(p.ang) * side * B.fw * 0.36, p.y + Math.cos(p.ang) * side * B.fw * 0.36); g.rotate(p.ang);
        g.fillRect(-5 * u, -4 * u, 10 * u, 8 * u); g.restore();
      }
    }
    const first = Math.floor(-shift / frameGap) - 1;
    for (let k = first; ; k++) {
      const s = k * frameGap + shift;
      if (s > upto) break;
      if (s < -frameGap) continue;
      const p = along(path, clamp(s, 0, len));
      if (s < 0) continue;
      const pig = T[PIGS[((k % PIGS.length) + PIGS.length) % PIGS.length]];
      g.save(); g.translate(p.x, p.y); g.rotate(p.ang);
      g.fillStyle = al(T.lite, 0.92); g.fillRect(-36 * u, -24 * u, 72 * u, 48 * u);
      g.fillStyle = al(pig, 0.5); g.fillRect(-32 * u, -20 * u, 64 * u, 40 * u);
      g.fillStyle = al(F.deep(pig), 0.55); g.beginPath(); g.moveTo(-32 * u, 20 * u); g.lineTo(-12 * u, 2 * u); g.lineTo(4 * u, 12 * u); g.lineTo(18 * u, -2 * u); g.lineTo(32 * u, 12 * u); g.lineTo(32 * u, 20 * u); g.closePath(); g.fill();
      dot(g, 18 * u, -9 * u, 5 * u, T.ochre, 0.85);
      g.restore();
    }
    g.restore();
  }
  function title(g, F, a, d, local, hold) {
    const B = cached(keyOf(F, "title"), () => titleBuild(F));
    const { u, t, W, H } = F;
    show(g, F, B.mid, 0.35 + local / 1.2, W * 0.3, H * 0.4);
    show(g, F, B.sky, 0.35 + local / 1.2, W * 0.4, 0);
    show(g, F, B.halo, 0.35 + local / 1.2, B.sun.x, B.sun.y);
    B.clouds.forEach((c, k) => {
      const x = -300 * u + frac(0.35 + k * 0.45 + t * 0.035) * (W + 600 * u), y = H * (F.tall ? 0.24 + k * 0.08 : 0.12 + k * 0.12);
      g.save(); g.translate(x, y); g.globalAlpha *= clamp(0.4 + local / 0.8); g.drawImage(c.c, c.x, c.y); g.restore();
    });
    show(g, F, B.disc, 0.3 + local / 1.0, B.sun.x - B.sun.r * 0.3, B.sun.y - B.sun.r * 0.3);
    show(g, F, B.far, 0.3 + local / 1.1, W * 0.6, B.hz);
    show(g, F, B.near, span(local, 0, 1.3) * 0.7 + 0.3, W * 0.25, B.hz + H * 0.1);
    show(g, F, B.ground, span(local, 0.1, 1.4) * 0.75 + 0.25, W * 0.5, H);
    const fr = clamp(0.3 + local / 1.3);
    show(g, F, B.ribbon, fr, 0, B.film.P[0][1]);
    filmRun(g, F, B, fr, 46);
    pencil(g, F, B.pen, clamp(0.35 + local / 0.9), { alpha: 0.5 });
    drops(g, F, B.drp, local, hold);
    birds(g, F, W * (F.tall ? 0.3 : 0.55), H * (F.tall ? 0.16 : 0.12), 4, 1.1, 4030);
    void a; void d; void hold;
  }
  function closingBuild(F) {
    const { W, H, u, T, tall } = F;
    const hz = H * (tall ? 0.74 : 0.72), sun = { x: W * (tall ? 0.7 : 0.8), y: hz, r: Math.min(W, H) * 0.14 };
    return {
      hz, sun,
      sky: makeWash(F, [[-100 * u, -100 * u], [W + 100 * u, -100 * u], [W + 100 * u, H * 0.2], [W * 0.66, H * 0.16], [W * 0.38, H * 0.24], [W * 0.12, H * 0.18], [-100 * u, H * 0.22]], { color: mix(T.sky, T.paper, 0.1), color2: mix(T.rose, T.ochre, 0.35), a: 0.3, rough: 1, layers: 12, edge: 0.6, lift: 0.25, blooms: 3, vary: 0.85, seed: 5005, soft: 10 }),
      mid: makeWash(F, [[-100 * u, H * 0.16], [W * 0.5, H * 0.14], [W + 100 * u, H * 0.18], [W + 100 * u, hz - H * 0.1], [W * 0.5, hz - H * 0.06], [-100 * u, hz - H * 0.12]], { color: mix(T.rose, T.paper, 0.45), color2: mix(T.ochre, T.paper, 0.3), a: 0.16, rough: 1, layers: 10, edge: 0.35, lift: 0.15, mott: 0.5, vary: 0.9, blooms: 3, seed: 5007, soft: 14 }),
      dusk: makeWash(F, [[-100 * u, hz + 4 * u], [-100 * u, hz - H * 0.2], [W * 0.5, hz - H * 0.15], [W + 100 * u, hz - H * 0.22], [W + 100 * u, hz + 4 * u]], { color: mix(T.rose, T.ochre, 0.4), color2: mix(T.violet, T.rose, 0.4), a: 0.22, rough: 1, layers: 10, edge: 0.4, lift: 0.3, vary: 0.8, seed: 5006, soft: 12 }),
      drp: dropsBuild(F, [{ x: W * 0.94, y: H * 0.07, r: 22, at: 0.35 }, { x: W * 0.05, y: H * 0.1, r: 18, at: 0.6 }, { x: W * 0.55, y: H * 0.05, r: 14, at: 0.85 }], 5060),
      clouds: [0, 1].map((k) => makeWash(F, cloudShape(0, 0, (240 + k * 70) * u, (66 + k * 12) * u, 5050 + k), { color: mix(T.sky, T.rose, 0.25), a: 0.24, rough: 0.6, layers: 9, edge: 0.6, lift: 0.4, seed: 5050 + k })),
      glow: makeWash(F, blob(sun.x, hz - H * 0.02, W * 0.3, H * 0.13, 5001, 0.15), { color: mix(T.ochre, T.rose, 0.45), a: 0.3, rough: 1, layers: 12, edge: 0.6, lift: 0.45, blooms: 3, seed: 5001, soft: 12 }),
      disc: makeWash(F, [...arcPts(sun.x, sun.y, sun.r, Math.PI, TAU, 30)], { color: mix(T.ochre, T.rose, 0.25), a: 0.66, rough: 0.3, layers: 10, edge: 1, gran: 0.4, seed: 5002, seg: 14, shine: 0.7, charges: 0, lift: 0, vary: 0.3, mott: 0.35 }),
      shore: makeWash(F, [[-80 * u, hz + 6 * u], [-80 * u, hz - H * 0.06], [W * 0.14, hz - H * 0.09], [W * 0.32, hz - H * 0.03], [W * 0.45, hz], [W * 0.45, hz + 6 * u]], { color: mix(T.violet, T.blue, 0.4), a: 0.45, rough: 0.8, layers: 10, edge: 0.9, gran: 0.6, seed: 5003 }),
      water: makeWash(F, [[-80 * u, hz], [W + 80 * u, hz - 4 * u], [W + 80 * u, H + 80 * u], [-80 * u, H + 80 * u]], { color: mix(T.blue, T.sky, 0.45), color2: mix(T.teal, T.violet, 0.4), a: 0.46, rough: 0.8, layers: 12, edge: 0.8, lift: 0.25, bands: 9, backrun: 1, gran: 0.9, vary: 0.8, seed: 5004 }),
      // Pigment dropped into the wet sky: it keeps spreading through the whole hold.
      blooms: [[0.2, 0.2, T.violet], [0.55, 0.3, T.rose], [0.36, 0.5, T.ochre], [0.88, 0.42, T.violet]].map(([fx, fy, col], k) => makeWash(F, blob(W * fx, H * fy, W * 0.09, H * 0.07, 5070 + k, 0.25), { color: mix(col, T.paper, 0.3), a: 0.16, rough: 1, layers: 9, edge: 0.7, lift: 0.4, seed: 5070 + k, soft: 10, blooms: 1 })),
      sunBloom: makeWash(F, blob(sun.x, hz - sun.r * 0.15, sun.r * 1.55, sun.r * 1.25, 5080, 0.18), { color: mix(T.ochre, T.rose, 0.3), a: 0.24, rough: 1, layers: 10, edge: 0.8, lift: 0.5, seed: 5080, soft: 12, backrun: 1 }),
      pen: [sketch(F, [[0, hz], [W, hz - 4 * u]], false, 5010), sketch(F, arcPts(sun.x + 5 * u, sun.y - 3 * u, sun.r * 1.02, Math.PI, TAU, 30), false, 5011), sketch(F, [[0, hz - H * 0.06 - 3 * u], [W * 0.14, hz - H * 0.09 + 3 * u], [W * 0.32, hz - H * 0.03], [W * 0.45, hz + 2 * u]], false, 5012)],
    };
  }
  function closing(g, F, a, d, local, hold) {
    const B = cached(keyOf(F, "closing"), () => closingBuild(F));
    const { u, t, W, H, T } = F;
    show(g, F, B.sky, 0.35 + local / 1.1, W * 0.3, 0);
    B.clouds.forEach((c, k) => {
      const x = -320 * u + frac(0.55 + k * 0.4 + t * 0.03) * (W + 640 * u), y = H * (F.tall ? 0.28 + k * 0.08 : 0.14 + k * 0.13);
      g.save(); g.translate(x, y); g.globalAlpha *= clamp(0.4 + local / 0.8); g.drawImage(c.c, c.x, c.y); g.restore();
    });
    const pr = clamp(local / Math.max(1, hold));
    // The washes stay wet: each breathes and drifts a little, and dropped pigment keeps blooming outward.
    g.save(); g.translate(Math.sin(t * 0.35) * 10 * u, 0); spread(g, B.mid, 1 + 0.02 * Math.sin(t * 0.5), () => show(g, F, B.mid, 0.3 + local / 1.1, W * 0.6, H * 0.4)); g.restore();
    B.blooms.forEach((sp, k) => spread(g, sp, 0.55 + 0.6 * ease(span(local, k * 0.25, hold + 0.6)) + 0.03 * Math.sin(t * 0.7 + k), () => show(g, F, sp, 0.4 + local / 0.8, sp.cx, sp.cy)));
    g.save(); g.translate(-Math.sin(t * 0.3 + 1) * 12 * u, 0); spread(g, B.dusk, 1 + 0.025 * Math.sin(t * 0.45 + 2), () => show(g, F, B.dusk, 0.3 + local / 1.1, W * 0.5, B.hz)); g.restore();
    spread(g, B.glow, 1 + 0.05 * pr + 0.03 * Math.sin(t * 0.9), () => show(g, F, B.glow, 0.35 + local / 1.1, B.sun.x, B.hz));
    drops(g, F, B.drp, local, hold);
    // The sun: a soft bloom bleeding out around a wet disc, its edge pulsing as the water spreads.
    spread(g, B.sunBloom, 0.9 + 0.12 * pr + 0.05 * Math.sin(t * 1.1), () => show(g, F, B.sunBloom, 0.3 + local / 0.8, B.sun.x, B.hz));
    { const k2 = clamp(0.3 + local / 0.9); g.save(); g.globalAlpha *= 0.45 * k2; g.filter = `blur(${(9 + 4 * Math.sin(t * 1.3)) * u}px)`; spread(g, B.disc, 1.07 + 0.02 * Math.sin(t * 1.3), () => g.drawImage(B.disc.c, B.disc.x, B.disc.y)); g.restore(); }
    show(g, F, B.disc, 0.3 + local / 0.9, B.sun.x, B.hz);
    show(g, F, B.shore, 0.3 + local / 1.0, 0, B.hz);
    show(g, F, B.water, 0.3 + local / 1.1, W * 0.5, B.hz);
    { // Bands of the water wash slide against each other, so the surface shimmers like wet paint.
      const wv = B.water;
      for (let k = 0; k < 7; k++) {
        const y0 = B.hz + (H - B.hz) * (k / 7), hh = (H - B.hz) / 7 + 1, dx = Math.sin(t * (0.5 + k * 0.08) + k * 1.7) * (8 + k * 3) * u;
        g.save(); g.beginPath(); g.rect(0, y0, W, hh); g.clip(); g.globalAlpha *= clamp(0.3 + local / 1.1) * 0.28; g.drawImage(wv.c, wv.x + dx, wv.y); g.restore();
      }
    }
    g.save(); // The sun's reflection shivers on the water.
    for (let k = 0; k < 9; k++) {
      const y = B.hz + 18 * u + k * 22 * u, w = B.sun.r * (1.3 - k * 0.11) * (0.8 + 0.2 * Math.sin(t * 2.2 + k * 1.7));
      g.globalAlpha = clamp(0.3 + local / 0.8) * (0.55 - k * 0.04);
      brush(g, F, [[B.sun.x - w / 2 + Math.sin(t * 1.3 + k) * 10 * u, y], [B.sun.x + w / 2 + Math.sin(t * 1.3 + k) * 10 * u, y + 2 * u]], 8 * u, mix(T.ochre, T.lite, 0.3), 1, 1, 5020 + k);
    }
    g.restore();
    g.save(); g.strokeStyle = al(T.lite, 0.6); g.lineWidth = 2 * u; g.lineCap = "round";
    for (let k = 0; k < 10; k++) { const x = W * frac(k * 0.137 + t * 0.012), y = B.hz + (40 + ((k * 53) % 200)) * u * (H / 1080 / u); g.globalAlpha = 0.5 * (0.5 + 0.5 * Math.sin(t * 1.8 + k)); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 34 * u, y); g.stroke(); }
    g.restore();
    const bk = (local + 0.5) / (hold + 1.2), bx = lerp(W * 0.08, W * 0.5, bk), by = B.hz + (H - B.hz) * 0.45 + Math.sin(t * 2.1) * 4 * u;
    boat(g, F, bx, by, 54 * u, Math.sin(t * 2.1 + 1) * 0.06, clamp(0.3 + local / 0.6));
    pencil(g, F, B.pen, clamp(0.2 + local / 0.7), { alpha: 0.5 });
    birds(g, F, W * (F.tall ? 0.18 : 0.3), H * (F.tall ? 0.2 : 0.16), 5, 1.15, 5030);
    void a; void d;
  }

  const DRAW = { title, chart, object, people, process, compare, closing };

  // ---- paper, ambient washes, and the glaze between scenes ------------------------------------------------
  function paperCanvas(F) {
    return cached(`paper|${F.W}x${F.H}|${F.T.paper}|${F.tex}`, () => {
      const { W, H, u, T } = F, c = canvas(W, H), g = c.getContext("2d"), r = rng(77);
      g.fillStyle = T.paper; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 40; i++) { soft(g, r() * W, r() * H, (120 + r() * 420) * u, r() < 0.4 ? T.deep : T.lite, (0.1 + r() * 0.18) * F.tex); }
      const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
      v.addColorStop(0, al(T.deep, 0)); v.addColorStop(1, al(T.deep, 0.26 * F.tex)); g.fillStyle = v; g.fillRect(0, 0, W, H);
      return { c };
    }).c;
  }
  function ambientBuild(F) {
    const { W, H, u, T } = F;
    const drops = [];
    const r = rng(88);
    for (let i = 0; i < 16; i++) {
      const corner = i % 2, x = corner ? W * (0.84 + r() * 0.14) : W * (0.02 + r() * 0.1), y = corner ? H * (0.02 + r() * 0.14) : H * (0.82 + r() * 0.16), s = (3 + r() * 9) * u;
      drops.push(makeWash(F, blob(x, y, s, s * (0.8 + r() * 0.4), 6100 + i, 0.15, 16), { color: T[["blue", "rose", "ochre", "teal"][i % 4]], a: 0.55, rough: 0.3, layers: 4, edge: 1, seed: 6100 + i, seg: 4, holes: 0 }));
    }
    return {
      tr: makeWash(F, blob(W * 1.02, -H * 0.02, W * 0.17, H * 0.22, 6001, 0.22), { color: mix(T.sky, T.violet, 0.2), a: 0.26, rough: 1, layers: 12, edge: 0.6, lift: 0.4, blooms: 2, seed: 6001, soft: 10 }),
      bl: makeWash(F, blob(-W * 0.02, H * 1.02, W * 0.16, H * 0.2, 6002, 0.22), { color: mix(T.ochre, T.rose, 0.2), a: 0.24, rough: 1, layers: 12, edge: 0.6, lift: 0.4, blooms: 2, seed: 6002, soft: 10 }),
      drops,
    };
  }
  function ambient(ctx, F) {
    const A = cached(`amb|${F.W}x${F.H}|${F.T.paper}|${F.T.blue}|${F.tex}`, () => ambientBuild(F)), { t, u } = F;
    ctx.save();
    ctx.globalAlpha = F.tex;
    ctx.drawImage(A.tr.c, A.tr.x + Math.sin(t * 0.21) * 6 * u, A.tr.y + Math.cos(t * 0.17) * 5 * u);
    ctx.drawImage(A.bl.c, A.bl.x + Math.cos(t * 0.19) * 6 * u, A.bl.y + Math.sin(t * 0.23) * 5 * u);
    for (const d of A.drops) ctx.drawImage(d.c, d.x, d.y);
    ctx.restore();
  }
  // Clear water sweeps in across the sheet (phase 0 to 0.5), then dries back off it (0.5 to 1).
  function wipeX(F, k, y, seed) { const { W, H, u } = F; return lerp(-0.3 * W, 1.3 * W, k) + (y - H / 2) * 0.28 + Math.sin(y * 0.011 / u + seed) * 26 * u + Math.sin(y * 0.031 / u + seed * 2) * 11 * u + Math.sin(y * 0.083 / u + seed * 5) * 5 * u + Math.sin(y * 0.197 / u + seed * 3) * 2.4 * u; }
  const WN = 120;
  function frontPts(F, k, seed) { const { H, u } = F, pts = []; for (let i = 0; i <= WN; i++) { const y = -60 * u + (i / WN) * (H + 120 * u); pts.push([wipeX(F, k, y, seed), y]); } return pts; }
  // The moving edge of the new sheet is a deckled paper edge, not a mask: on the old painting it casts a
  // soft shadow and its wet pigment bleeds out in feathers and beads; on its own side a pale fibrous
  // strip of paper shows where the deckle lifts. Each side is drawn with the painting it belongs to.
  function wipeFringe(ctx, F, k, oldSide) {
    if (k <= 0.001 || k >= 0.999) return;
    const { W, u, T } = F, pts = frontPts(F, k, 4), r = rng(oldSide ? 611 : 612), s = Math.sin(Math.PI * k);
    ctx.save();
    polyPath(ctx, [[oldSide ? 2 * W : -W, pts[0][1]], ...pts, [oldSide ? 2 * W : -W, pts[WN][1]]]); ctx.clip();
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    const line = (dx, wdt) => { ctx.lineWidth = wdt; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x + dx, y) : ctx.moveTo(x + dx, y))); ctx.stroke(); };
    if (oldSide) {
      ctx.strokeStyle = mix(T.ink, T.deep, 0.3); ctx.filter = `blur(${8 * u}px)`; ctx.globalAlpha = 0.3; line(10 * u, 26 * u);
      ctx.filter = `blur(${2.5 * u}px)`; ctx.globalAlpha = 0.28; line(4 * u, 6 * u);
      ctx.filter = `blur(${3 * u}px)`; ctx.fillStyle = mix(T.blue, T.glaze, 0.4);
      for (let i = 0; i < 26; i++) { // wet pigment feathering out ahead of the edge
        const p0 = pts[Math.floor(r() * WN)], L = (14 + r() * 46) * u, ang = (r() - 0.5) * 1.2;
        for (let j = 1; j <= 4; j++) { const q = j / 4; ctx.globalAlpha = 0.22 * (1 - q * 0.7) * (0.5 + s * 0.5); ctx.beginPath(); ctx.arc(p0[0] + Math.cos(ang) * L * q, p0[1] + Math.sin(ang) * L * q, (6 - q * 4) * u * (0.6 + r()), 0, TAU); ctx.fill(); }
      }
      ctx.filter = "none";
    } else {
      ctx.strokeStyle = T.lite; ctx.globalAlpha = 0.85; varStroke(ctx, pts.map(([x, y]) => [x - 3 * u, y]), false, 6 * u, rng(613), 0.6);
      ctx.strokeStyle = mix(T.deep, T.pencil, 0.3); ctx.globalAlpha = 0.45; varStroke(ctx, pts.map(([x, y]) => [x - 1 * u, y]), false, 1.6 * u, rng(614), 0.7);
      ctx.strokeStyle = T.lite; ctx.lineWidth = 1.2 * u; // paper fibres pulled from the torn edge
      for (let i = 0; i < 70; i++) { const p0 = pts[Math.floor(r() * WN)], L = (5 + r() * 14) * u, ang = Math.PI + (r() - 0.5) * 1.6; ctx.globalAlpha = 0.5 + r() * 0.4; ctx.beginPath(); ctx.moveTo(p0[0] - 2 * u, p0[1]); ctx.quadraticCurveTo(p0[0] + Math.cos(ang) * L * 0.5, p0[1] + Math.sin(ang) * L * 0.5 + 3 * u, p0[0] + Math.cos(ang) * L, p0[1] + Math.sin(ang) * L); ctx.stroke(); }
      ctx.strokeStyle = mix(T.blue, T.glaze, 0.3); ctx.filter = `blur(${4 * u}px)`; ctx.globalAlpha = 0.25; line(-14 * u, 14 * u); ctx.filter = "none";
    }
    ctx.restore();
  }
  // The drying front doubles as the cut: the old painting stays ahead of it, the new one is behind it.
  function wipeClip(ctx, F, k, ahead) {
    const { W } = F, pts = frontPts(F, k, 4);
    polyPath(ctx, [[ahead ? 2 * W : -W, pts[0][1]], ...pts, [ahead ? 2 * W : -W, pts[WN][1]]]); ctx.clip();
  }
  // A wet wash sweeping across: only a band of fresh water trails the front, led by a ragged edge of
  // pigment, so the painting behind it stays crisp instead of fogging over.
  function flood(ctx, F, phase) {
    if (phase <= 0 || phase >= 1) return;
    const { W, u, T } = F, col = T.glaze, N = WN, lead = mix(T.blue, col, 0.35);
    const wet = phase < 0.5, k = inout(wet ? phase * 2 : (phase - 0.5) * 2);
    const front = frontPts(F, k, wet ? 1 : 4);
    const bandW = W * (wet ? 0.16 : 0.12), strength = wet ? Math.min(1, k * 4) : 1 - k * 0.6;
    ctx.save();
    ctx.fillStyle = col;
    for (let j = 1; j <= 4; j++) { // fresh water, thickest just behind the front
      const back = front.map(([x, y]) => [x - bandW * (j / 4) - Math.sin(y * 0.017 / u + j) * 10 * u, y]);
      ctx.globalAlpha = 0.07 * strength; polyPath(ctx, [...front, ...back.reverse()]); ctx.fill();
    }
    // The leading edge: pigment carried in the water piles up there, broken and uneven.
    ctx.strokeStyle = lead; ctx.lineJoin = "round"; ctx.globalAlpha = 0.65 * strength;
    varStroke(ctx, front, false, 4 * u, rng(Math.floor(phase * 7) + 31), 0.5);
    ctx.globalAlpha = 0.22 * strength; ctx.lineWidth = 14 * u; ctx.filter = `blur(${5 * u}px)`;
    ctx.beginPath(); front.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.filter = "none";
    const r = rng(41); // beads of pigment caught along the front
    ctx.fillStyle = lead;
    for (let i = 0; i < 18; i++) { const p0 = front[Math.floor(r() * N)], rr = (2 + r() * 5) * u; ctx.globalAlpha = 0.5 * strength; ctx.beginPath(); ctx.arc(p0[0] - r() * 18 * u, p0[1] + (r() - 0.5) * 30 * u, rr, 0, TAU); ctx.fill(); }
    ctx.restore();
  }

  // ---- frame assembly -------------------------------------------------------------------------------------
  let frame = null, layerC = null;
  function layer(F) {
    if (!layerC || layerC.width !== F.W || layerC.height !== F.H) layerC = canvas(F.W, F.H);
    const g = layerC.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.filter = "none";
    g.clearRect(0, 0, F.W, F.H);
    return g;
  }
  function runScene(ctx, F, id, d, local, hold, exit) {
    const draw = DRAW[id];
    if (!draw) return;
    const a = DRAWN.has(id) ? areaOf(F, id) : null;
    const g = layer(F);
    // Each painting is already under way when the drying front uncovers it, so no scene opens on bare paper.
    const pre = a ? Math.min(0.5, buildWin(hold) * 0.2) : 0;
    draw(g, F, a, d || {}, local + pre, hold);
    const leaving = exit !== undefined, chg = F.info.change;
    const entering = !leaving && chg > 0 && F.info.scene === id && F.info.index > 0 && local < chg;
    // A slow drift over the sheet all scene long, as if the camera leans in while the paint dries.
    const pr = local / Math.max(0.01, hold), z = 1.05 + 0.05 * pr + (leaving ? 0.015 * exit : 0), dx = (0.5 - pr) * 48 * F.u, dy = Math.sin(local * 0.9) * 7 * F.u;
    const kf = leaving ? inout(exit) : entering ? inout(local / chg) : -1;
    ctx.save();
    if (leaving) wipeClip(ctx, F, kf, true);
    else if (entering) wipeClip(ctx, F, kf, false);
    ctx.save();
    ctx.translate(F.W / 2 + dx, F.H * 0.56 + dy); ctx.scale(z, z); ctx.translate(-F.W / 2, -F.H * 0.56);
    ctx.drawImage(layerC, 0, 0);
    ctx.restore();
    // The headline is lettered on this painting and leaves with it, under the same drying front.
    const end = headline(ctx, F, id, local, headStart(F, id));
    if (id === "closing") underline(ctx, F, local, end);
    ctx.restore();
    if (kf >= 0) wipeFringe(ctx, F, kf, leaving);
    const ch = F.info.change;
    if (leaving) flood(ctx, F, 0.5 + 0.5 * exit);
    else if (ch > 0 && F.info.scene === id && F.info.next) flood(ctx, F, span(local, hold - ch, hold) * 0.5);
  }
  function headStart(F, id) { const P = planOf(); return P && P.shown.length && P.shown[0].id === id ? 0.15 : (F.info.change || 0.45) * 0.35; }
  // A brushed underline under the closing's key words (the last two, or one on a short line), once written.
  function underline(g, F, local, end) {
    const words = wordsOf("closing");
    if (!words.length) return;
    const yl = Math.max(...words.map((w) => w.y)), row = words.filter((w) => w.y > yl - 4), n = words.length >= 4 && row.length >= 2 ? 2 : 1, key = row.slice(-n);
    const x0 = key[0].x, x1 = key[key.length - 1].x + key[key.length - 1].w, y = key[0].y + key[0].h * 0.9, u = F.u;
    brush(g, F, [[x0 - 10 * u, y + 6 * u], [lerp(x0, x1, 0.5), y - 5 * u], [x1 + 14 * u, y + 2 * u]], 20 * u, F.A, 0.85, span(local, end + 0.05, end + 0.55), 5040);
  }
  function makeFrame(S, info) {
    const look = S.look, T = look.tone;
    const F = { S, W: S.W, H: S.H, u: S.u, tall: S.tall, T, info, t: info.t, tex: look.texture ?? 1, A: HEX.test(S.accent) ? S.accent : T.rose };
    F.deep = (c) => (T.dark ? mix(c, "#ffffff", 0.32) : mix(c, "#1b1430", 0.4));
    return F;
  }
  const wrap = (id) => (ctx, S, box, p, d, info) => {
    const F = frame;
    if (!F) return;
    runScene(ctx, F, id, d, info.local, info.hold, info.exit);
  };

  const TONE = {
    paper: "#fbf6ea", deep: "#eadcc2", lite: "#fffef9", ink: "#2a2c55", pencil: "#5d5752", night: "#2e3563", boat: "#fffdf7", glaze: "#9fb8cf", dark: false,
    blue: "#3c5fa6", sky: "#7ea6cf", sienna: "#b5643a", ochre: "#d9a23f", green: "#6a9a4f", teal: "#3d8a8f", rose: "#c4506b", violet: "#6a5797", grey: "#8a8798",
    skin: ["#ebb38a", "#c98a5e", "#8f5b3b", "#f1c8a2"], hair: ["#3b2a22", "#7a4526", "#24263a", "#a8682e"],
  };
  const tones = {
    light: { ...TONE, paper: "#fbfaf6", deep: "#ece6da", lite: "#ffffff", ink: "#24304f", night: "#26315a", glaze: "#a9c3dc", blue: "#3f6fc0", sky: "#8bbbe6", sienna: "#c8703f", ochre: "#ebb44a", green: "#73ad55", teal: "#3e9ca0", rose: "#d65477", violet: "#7461ad" },
    dark: { ...TONE, paper: "#1d2131", deep: "#121522", lite: "#3a4058", ink: "#f3ebd8", pencil: "#bdb6a8", night: "#0d1020", boat: "#efe8d6", glaze: "#5f7da0", dark: true,
      blue: "#7ea2e6", sky: "#96c2ea", sienna: "#e39c6e", ochre: "#f1c66b", green: "#96c57f", teal: "#79c6c6", rose: "#f08ba3", violet: "#ab98de", grey: "#a6a8bc", skin: ["#f0c29c", "#d79d72", "#a87352", "#f5d6b6"], hair: ["#d9c7b4", "#e0a070", "#c9c9e0", "#f0c070"] },
    mono: { ...TONE, paper: "#f3ecdf", deep: "#e0d1b8", ink: "#3a2a1e", pencil: "#6d5f52", night: "#4a3626", glaze: "#b9a68c",
      blue: "#5d4838", sky: "#a48c72", sienna: "#7c5437", ochre: "#b39260", green: "#6f5b45", teal: "#614f3f", rose: "#8c5b3d", violet: "#503f33", grey: "#9b8f83", skin: ["#d9bc9a", "#c4a07c", "#a07c5c", "#e3caa8"], hair: ["#3a2a1e", "#5a3f2a", "#2e2218", "#7a5a3a"] },
  };
  const halo = (paper, ink) => () => `0 0 1px ${al(ink, 0.35)}, 0 0 18px ${paper}, 0 0 36px ${al(paper, 0.9)}`;
  const backdrop = (T) => () => `radial-gradient(45% 55% at 96% 4%, ${al(T.sky, 0.28)}, ${al(T.sky, 0)} 70%), radial-gradient(42% 50% at 3% 97%, ${al(T.ochre, 0.26)}, ${al(T.ochre, 0)} 70%), radial-gradient(30% 36% at 97% 96%, ${al(T.rose, 0.16)}, ${al(T.rose, 0)} 70%), radial-gradient(120% 100% at 50% 50%, ${T.paper} 55%, ${T.deep} 100%)`;
  // Cold-press tooth laid over everything, headlines included.
  const paperTiles = {};
  function paperTile(dark) {
    if (paperTiles[dark]) return paperTiles[dark];
    // A seamless tile: random values blurred with wrap-around, so the tooth has no repeat seams.
    const N = 256, r = rng(dark ? 919 : 717);
    let A = new Float32Array(N * N).map(() => r());
    const blur = (src, rad) => {
      const out = new Float32Array(N * N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        let s = 0;
        for (let k = -rad; k <= rad; k++) s += src[y * N + ((x + k + N) % N)];
        out[y * N + x] = s / (rad * 2 + 1);
      }
      const out2 = new Float32Array(N * N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        let s = 0;
        for (let k = -rad; k <= rad; k++) s += out[((y + k + N) % N) * N + x];
        out2[y * N + x] = s / (rad * 2 + 1);
      }
      return out2;
    };
    const big = blur(blur(A, 3), 3), small = blur(A, 1);
    let lo = 1, hi = 0;
    for (let i = 0; i < N * N; i++) { lo = Math.min(lo, big[i]); hi = Math.max(hi, big[i]); }
    const c = canvas(N, N), g = c.getContext("2d"), img = g.createImageData(N, N);
    for (let i = 0; i < N * N; i++) {
      const bump = (big[i] - lo) / Math.max(1e-6, hi - lo), fine = small[i] - 0.5, v = bump * 0.7 + fine * 0.9 + (A[i] - 0.5) * 0.25;
      const shade = dark ? Math.max(0, Math.min(255, Math.round(v * 34))) : Math.max(0, Math.min(255, Math.round(255 - (1 - v) * 19)));
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = shade; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return (paperTiles[dark] = c);
  }

  return {
    bg: TONE.paper, panel: "rgba(255,253,246,0.55)", ink: TONE.ink, muted: "#6b6680", accent: "#c4506b", onAccent: "#fffdf6",
    rule: "rgba(42,44,85,0.45)", track: "rgba(42,44,85,0.1)",
    display: HAND, displayWeight: 700, displayTracking: "0", displayStyle: "normal",
    body: HAND, bodyWeight: 700, figures: HAND, radius: 22,
    motion: "write", change: "fade",
    kit: { line: 2.6, fill: "glass", panel: "fill" },
    panelEdge: "rgba(42,44,85,0.3)",
    tone: TONE,
    keepArt: true,
    overlap: true,
    palettes: {
      light: { bg: tones.light.paper, ink: tones.light.ink, accent: "#d65477", tone: tones.light, textShadow: halo(tones.light.paper, tones.light.ink), backdrop: backdrop(tones.light), panel: "rgba(255,255,255,0.6)" },
      dark: { bg: tones.dark.paper, ink: tones.dark.ink, muted: "#b7b0c8", accent: "#f08ba3", onAccent: "#1d2131", rule: "rgba(243,235,216,0.45)", track: "rgba(243,235,216,0.12)", panel: "rgba(58,64,88,0.55)", panelEdge: "rgba(243,235,216,0.3)",
        tone: tones.dark, dark: true, textShadow: halo(tones.dark.paper, tones.dark.ink), backdrop: backdrop(tones.dark) },
      mono: { bg: tones.mono.paper, ink: tones.mono.ink, muted: "#7a6a5a", accent: "#7c5437", onAccent: "#f3ecdf", rule: "rgba(58,42,30,0.45)", track: "rgba(58,42,30,0.1)", tone: tones.mono, textShadow: halo(tones.mono.paper, tones.mono.ink), backdrop: backdrop(tones.mono) },
    },
    textShadow: halo(TONE.paper, TONE.ink),
    backdrop: backdrop(TONE),
    css: (accent, look) => `#root > canvas:not(#art) { mix-blend-mode: ${look.dark ? "screen" : "multiply"}; }
      #art ~ .scene .display { text-wrap: balance; }
      #title-scene .kicker { font-weight: 700; letter-spacing: 0.1em; }
      #art ~ .scene .display, #art ~ .scene .kicker { color: transparent !important; text-shadow: none !important; -webkit-text-stroke: 0 !important; }`,
    paintOver: true,
    // The paper's tooth: drawn once per canvas size and palette, then left alone.
    paint(ctx, W, H, t, accent, look) {
      const key = `${W}x${H}:${look.bg}:${look.texture ?? 1}`;
      if (ctx.canvas.__wc === key) return;
      ctx.canvas.__wc = key;
      ctx.clearRect(0, 0, W, H);
      // Cold-press tooth, lit from the upper left, at the same scale the washes settle into.
      const tu = (Math.min(W, H) / 1080) * 1.5, TT = tooth();
      ctx.save(); ctx.scale(tu, tu); ctx.fillStyle = ctx.createPattern(litTile(Boolean(look.dark)), "repeat");
      const tx = look.texture ?? 1;
      ctx.globalAlpha = (look.dark ? 0.5 : 1) * tx;
      ctx.fillRect(0, 0, W / tu + TT.N, H / tu + TT.N);
      ctx.restore();
      // A finer fibre pass on top so the sheet never looks like one repeated tile.
      ctx.save(); ctx.globalAlpha = (look.dark ? 0.25 : 0.45) * tx; ctx.fillStyle = ctx.createPattern(paperTile(Boolean(look.dark)), "repeat"); ctx.fillRect(0, 0, W, H); ctx.restore();
    },
    stage(ctx, S, info) {
      const F = (frame = makeFrame(S, info));
      // The kicker is lettered larger than the page sets it; size it before any word is measured.
      const kk = document.getElementById("kicker");
      if (kk && !kk.__wc) { kk.__wc = 1; kk.style.setProperty("font-size", Math.round(48 * S.u) + "px", "important"); }
      if (S.paint) ctx.drawImage(paperCanvas(F), 0, 0);
      const P = planOf();
      let scene = info.scene, local = info.local, hold = info.hold;
      if (!scene && P && P.shown.length && info.t >= P.length - 1e-6) { // Past the last frame: hold the last painting.
        const last = P.shown[P.shown.length - 1];
        scene = last.id; local = info.t - last.start; hold = last.hold;
        F.info = { ...info, scene, local, hold, next: null };
        if (S.paint && DRAWN.has(scene)) ambient(ctx, F);
        runScene(ctx, F, scene, P.data[scene], local, hold);
        return;
      }
      if (S.paint && DRAWN.has(scene)) ambient(ctx, F);
      if (scene === "title" || scene === "closing") runScene(ctx, F, scene, null, local, hold);
      const prev = P && info.index > 0 ? P.shown[info.index - 1] : null;
      if (prev && prev.id === "title" && local < info.change) runScene(ctx, F, "title", null, prev.hold + local, prev.hold, clamp(local / Math.max(0.01, info.change)));
    },
    scenes: { chart: wrap("chart"), object: wrap("object"), people: wrap("people"), process: wrap("process"), compare: wrap("compare") },
  };
});
