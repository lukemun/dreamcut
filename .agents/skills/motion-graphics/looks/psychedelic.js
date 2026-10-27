// Psychedelic: a late-sixties concert poster. The whole frame is liquid contour bands in vibrating
// complementary inks, each scene a new field (expanding rings, flowing waves, a spiral, a rising-sun
// fan, rivers, merging ovals, star rings) that an inked iris opens onto at every change. Scenes are
// drawn in the same medium: thick plum keylines, cream stickers, swelling bubble figures, melting lava
// columns, groovy dancing folk, a rainbow road and rainbow-arch gauges. Grain and a printed vignette
// sit over everything. Every frame is a pure function of time.
window.DreamcutMotion.register("psychedelic", ({ hexA, rng }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const easeIn = (v) => Math.pow(clamp(v), 2.2);
  const easeInOut = (v) => { const x = clamp(v); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const pop = (v) => { const x = clamp(v); if (x >= 1) return 1; const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const stag = (p, i, n, spread = 0.55) => clamp((p - (i / Math.max(1, n)) * spread) / (1 - spread));
  const rgb = (hex) => { const n = parseInt(String(hex).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

  // ---- inks ---------------------------------------------------------------------------------------
  function scheme(k, ink, cream, extra = {}) {
    return {
      ink, cream, inks: k,
      skin: extra.skin || ["#ffcf9e", "#c98a5a", "#8a5a3b", "#f2b38a", "#e7a46f", "#6e4630"],
      bands: extra.bands || {
        opening: [ink],
        title: [k.pink, k.lime],
        chart: [k.orange, k.blue, k.orange, k.purple],
        object: [k.yellow, k.purple],
        people: [k.pink, k.orange, k.yellow, k.lime, k.blue, k.purple],
        process: [k.red, k.lime, k.pink, k.lime],
        compare: [k.blue, k.orange, k.pink, k.yellow],
        closing: [k.pink, k.orange, k.yellow, k.lime, k.blue, k.purple],
      },
      headFill: extra.headFill || k.yellow,
      closeFill: extra.closeFill || k.pink,
    };
  }
  const ORIGINAL = { pink: "#ff2e93", lime: "#b6f000", orange: "#ff7a00", blue: "#2f46ff", purple: "#7b2fd6", yellow: "#ffd21f", red: "#e8202a", teal: "#00c2b8" };
  const PASTEL = { pink: "#ff9fcd", lime: "#d4ff7f", orange: "#ffbe7d", blue: "#98afff", purple: "#c7a3ff", yellow: "#fff08f", red: "#ff9696", teal: "#8ff0e4" };
  const NEON = { pink: "#ff2bd6", lime: "#39ff14", orange: "#ff8a00", blue: "#1fd1ff", purple: "#b14bff", yellow: "#f7ff00", red: "#ff2b4a", teal: "#00ffc8" };
  const BLACK = "#140421";
  const MONO = { pink: "#c8156e", lime: "#f2a1c6", orange: "#e0569a", blue: "#8a0c4b", purple: "#a3105c", yellow: "#ffd9ea", red: "#c8156e", teal: "#f2a1c6" };
  const MONO_PAPER = "#fff0d8";

  // ---- the contour field ----------------------------------------------------------------------------
  // Each scene's background is a scalar field drawn as bands: floor(value) picks the ink, band edges
  // get a plum keyline. Values are sampled on a coarse grid and interpolated per pixel, so edges stay
  // crisp at full resolution. Coordinates are centred and divided by the short side.
  // Two passes of domain warp: a slow broad swirl, then a finer ripple on top, so bands marble.
  function warp(x, y, t, k) {
    const a = x + k * (Math.sin(2.3 * y + 0.7 * t + 1.3) + 0.5 * Math.sin(4.1 * y - 3.3 * x - 1.1 * t));
    const b = y + k * (Math.sin(2.1 * x - 0.6 * t + 0.4) + 0.5 * Math.sin(3.7 * x + 2.9 * y + 0.9 * t));
    const f = k * 0.35;
    return [a + f * Math.sin(6.3 * b - 1.3 * t + 2.1), b + f * Math.sin(5.7 * a + 1.1 * t)];
  }
  const FIELDS = {
    opening: { fn: () => 0 },
    title: { fn: (x, y, t) => { const [a, b] = warp(x, y, t, 0.13); return Math.hypot(a, b * 1.1) * 17 - t * 1.5; } },
    chart: { fn: (x, y, t) => { const [a, b] = warp(x, y, t, 0.22); return (a * 0.55 + b * 0.85) * 16 + 1.1 * Math.sin(a * 5 + t * 1.4) - t * 1.1; } },
    object: { seam: true, fn: (x, y, t, S) => {
      const cx = S.tall ? -0.12 : -0.42, cy = S.tall ? 0.28 : 0.18;
      const [a, b] = warp(x - cx, y - cy, t, 0.08);
      return Math.atan2(b, a) / TAU * 4 + Math.log(Math.hypot(a, b) + 0.03) * 7 - t * 1.3;
    } },
    people: { seam: true, fn: (x, y, t, S) => {
      const dx = x, dy = y - (S.tall ? 1.15 : 0.95);
      const r = Math.hypot(dx, dy);
      return Math.atan2(dx, -dy) / TAU * 48 + 0.9 * Math.sin(r * 11 - t * 2.4) + t * 0.4;
    } },
    process: { fn: (x, y, t) => { const [a, b] = warp(x, y, t, 0.12); return b * 17 + 1.3 * Math.sin(a * 3.4 - t * 1.6) + 0.6 * Math.sin(a * 7.1 + t); } },
    compare: { fn: (x, y, t, S) => {
      const [a, b] = warp(x, y, t, 0.05);
      const p = S.tall ? [0, -0.06, 0, 0.47] : [-0.38, 0.19, 0.38, 0.19];
      return Math.log(Math.hypot(a - p[0], b - p[1]) * Math.hypot(a - p[2], b - p[3]) + 0.06) * 5.4 - t * 1.4;
    } },
    closing: { fn: (x, y, t) => { const [a, b] = warp(x, y, t, 0.06); const r = Math.hypot(a, b), g = Math.atan2(b, a); return r * (1 + 0.075 * Math.cos(10 * g + t * 1.5)) * 16 - t * 1.5; } },
  };

  const GRID = 4;
  let cache = null;
  function buffers(W, H, ctx) {
    if (cache && cache.W === W && cache.H === H) return cache;
    const nx = Math.ceil(W / GRID) + 2, ny = Math.ceil(H / GRID) + 2;
    const image = ctx.createImageData(W, H);
    cache = { W, H, nx, ny, image, out: new Uint32Array(image.data.buffer),
      F1: new Float32Array(nx * ny), G1: new Float32Array(nx * ny), F2: new Float32Array(nx * ny), G2: new Float32Array(nx * ny), M: new Float32Array(nx * ny) };
    return cache;
  }
  function sampleField(id, S, t, F, G, B) {
    const f = FIELDS[id] || FIELDS.title;
    const { nx, ny } = B, m = Math.min(S.W, S.H);
    for (let j = 0; j < ny; j++) {
      const y = (j * GRID - S.H / 2) / m;
      for (let i = 0; i < nx; i++) F[j * nx + i] = f.fn((i * GRID - S.W / 2) / m, y, t, S);
    }
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        let dx = F[j * nx + Math.min(nx - 1, i + 1)] - F[j * nx + Math.max(0, i - 1)];
        let dy = F[Math.min(ny - 1, j + 1) * nx + i] - F[Math.max(0, j - 1) * nx + i];
        if (f.seam) { if (Math.abs(dx) > 0.5) dx -= Math.round(dx); if (Math.abs(dy) > 0.5) dy -= Math.round(dy); }
        G[k] = Math.max(1e-5, Math.hypot(dx, dy) / (2 * GRID));
      }
    }
    return Boolean(f.seam);
  }
  function paletteOf(list) {
    const c = list.map(rgb);
    return { n: c.length, r: c.map((v) => v[0]), g: c.map((v) => v[1]), b: c.map((v) => v[2]) };
  }

  // Paint the field. During a change the next field arrives one of three ways: an inked iris from the
  // centre, a liquid sweep in which the old bands bend and join into the new field before the colours
  // turn, or a ripple that spreads from the scene's hero with echo rings behind its front.
  function drawField(ctx, S, t, idA, idB, tr) {
    const B = buffers(S.W, S.H, ctx);
    const psy = S.look.psy;
    const seamA = sampleField(idA, S, t, B.F1, B.G1, B);
    const seamB = idB ? sampleField(idB, S, t, B.F2, B.G2, B) : false;
    const pa = paletteOf(psy.bands[idA] || psy.bands.title), pb = paletteOf(idB ? psy.bands[idB] || psy.bands.title : ["#000000"]);
    const ink = rgb(psy.ink), cream = rgb(psy.cream);
    const { nx, ny, out, F1, G1, F2, G2, M } = B;
    const W = S.W, H = S.H, u = S.u;
    const half = 3 * u;
    const kind = tr ? tr.kind : null;
    const rw = (kind === "sweep" ? 5 : 7) * u, gap = 64 * u, echo = 3.2 * u;
    if (idB) {
      const { cx, cy, e } = tr;
      const far = Math.max(Math.hypot(cx, cy), Math.hypot(W - cx, cy), Math.hypot(cx, H - cy), Math.hypot(W - cx, H - cy)) * 1.15;
      const range = W * 0.82 + H * 0.57, front = -260 * u + e * (range + 520 * u);
      const blend = !seamA && !seamB, bw = 260 * u;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const k = j * nx + i, x = i * GRID, y = j * GRID;
        let m;
        if (kind === "sweep") m = x * 0.82 + y * 0.57 - front + 50 * u * Math.sin(y / (110 * u) + t * 3) + 30 * u * Math.sin(x / (170 * u) - t * 2);
        else {
          const dx = x - cx, dy = y - cy, a = Math.atan2(dy, dx), wob = kind === "ripple" ? 0.025 : 0.06;
          m = Math.hypot(dx, dy) - e * far * (1 + wob * Math.sin(6 * a + t * 3) + wob * 0.5 * Math.sin(11 * a - t * 4));
        }
        M[k] = m;
        if (kind === "sweep" && blend) {
          const w = clamp(0.5 - m / (2 * bw));
          if (w > 0 && w < 1) { const f = F1[k] + (F2[k] - F1[k]) * w, g = G1[k] + (G2[k] - G1[k]) * w; F1[k] = F2[k] = f; G1[k] = G2[k] = g; }
        }
      }
    }
    const inv = 1 / GRID;
    let p = 0;
    for (let py = 0; py < H; py++) {
      const gy = py * inv, j = gy | 0, fy = gy - j, row = j * nx;
      for (let px = 0; px < W; px++, p++) {
        const gx = px * inv, i = gx | 0, fx = gx - i, k = row + i;
        let useB = false, s = 1e9;
        if (idB) {
          const m0 = M[k] + (M[k + 1] - M[k]) * fx, m1 = M[k + nx] + (M[k + nx + 1] - M[k + nx]) * fx;
          s = m0 + (m1 - m0) * fy;
          useB = s < 0;
        }
        const F = useB ? F2 : F1, G = useB ? G2 : G1, P = useB ? pb : pa;
        let a = F[k], b = F[k + 1], c = F[k + nx], d = F[k + nx + 1];
        if (useB ? seamB : seamA) {
          if (Math.abs(b - a) > 0.5) b -= Math.round(b - a);
          if (Math.abs(c - a) > 0.5) c -= Math.round(c - a);
          if (Math.abs(d - a) > 0.5) d -= Math.round(d - a);
        }
        const top = a + (b - a) * fx, v = top + (c + (d - c) * fx - top) * fy;
        const band = Math.floor(v), fr = v - band, dd = fr < 0.5 ? fr : 1 - fr;
        const dist = dd / G[k];
        const idx = ((band % P.n) + P.n) % P.n;
        // A little darker toward each keyline, like ink pooling at the edge of a print.
        const shade = dist < 14 * u ? 0.86 + 0.14 * (dist / (14 * u)) : 1;
        let r = P.r[idx] * shade, g = P.g[idx] * shade, bl = P.b[idx] * shade;
        let al = half + 0.5 - dist;
        if (P.n === 1) al = 0;
        if (al > 0) { al = al > 1 ? 1 : al; r += (ink[0] - r) * al; g += (ink[1] - g) * al; bl += (ink[2] - bl) * al; }
        if (s < 1e8) {
          const as = Math.abs(s);
          if (as < rw + 0.5) {
            const e = clamp(rw + 0.5 - as);
            r += (ink[0] - r) * e; g += (ink[1] - g) * e; bl += (ink[2] - bl) * e;
            if (kind !== "sweep") {
              const ci = clamp(rw * 0.42 + 0.5 - as);
              if (ci > 0) { r += (cream[0] - r) * ci; g += (cream[1] - g) * ci; bl += (cream[2] - bl) * ci; }
            }
          } else if (kind === "ripple" && s < 0 && s > -gap * 3.5) {
            const mm = (-s) % gap, de = mm < gap - mm ? mm : gap - mm;
            const e = clamp(echo + 0.5 - de) * (1 - (-s) / (gap * 3.5));
            if (e > 0) { r += (ink[0] - r) * e; g += (ink[1] - g) * e; bl += (ink[2] - bl) * e; }
          }
        }
        out[p] = 0xff000000 | ((bl & 255) << 16) | ((g & 255) << 8) | (r & 255);
      }
    }
    ctx.putImageData(B.image, 0, 0);
  }

  // ---- drawing helpers -------------------------------------------------------------------------------
  const P = (S) => S.look.psy;
  const LW = (S) => 6 * S.u;
  function inked(ctx, S, fillColor, lw) {
    ctx.save();
    if (fillColor) { ctx.fillStyle = fillColor; ctx.fill(); }
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.strokeStyle = P(S).ink; ctx.lineWidth = lw ?? LW(S); ctx.stroke();
    ctx.restore();
  }
  // A shape with a hard offset shadow in a second ink, then its own fill and keyline.
  function sticker(ctx, S, path, fillColor, shadow, off) {
    const o = off ?? 9 * S.u;
    ctx.save(); ctx.translate(o, o); path(); inked(ctx, S, shadow || P(S).ink); ctx.restore();
    path(); inked(ctx, S, fillColor);
  }
  function scallop(ctx, cx, cy, r, n, depth, rot = 0) {
    ctx.beginPath();
    const steps = n * 10;
    for (let s = 0; s <= steps; s++) {
      const a = rot + (s / steps) * TAU;
      const rr = r * (1 - depth + depth * Math.abs(Math.cos(((a - rot) * n) / 2)));
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
  function circle(ctx, cx, cy, r) { ctx.beginPath(); ctx.arc(cx, cy, Math.max(0, r), 0, TAU); }
  function pill(ctx, x, y, w, h) {
    const r = h / 2;
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(x + r, y + h); ctx.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5); ctx.closePath();
  }
  // A sunburst of flame-like wavy rays, alternating inks.
  function burst(ctx, S, cx, cy, r0, r1, n, rot, colors, wave = 0.25) {
    for (let k = 0; k < n; k++) {
      const a = rot + (k / n) * TAU, hw = (TAU / n) * 0.36, bend = wave * (TAU / n);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a - hw) * r0, cy + Math.sin(a - hw) * r0);
      ctx.quadraticCurveTo(cx + Math.cos(a - hw * 0.2 + bend) * (r0 + r1) * 0.52, cy + Math.sin(a - hw * 0.2 + bend) * (r0 + r1) * 0.52, cx + Math.cos(a + bend * 0.6) * r1, cy + Math.sin(a + bend * 0.6) * r1);
      ctx.quadraticCurveTo(cx + Math.cos(a + hw * 1.2 + bend) * (r0 + r1) * 0.5, cy + Math.sin(a + hw * 1.2 + bend) * (r0 + r1) * 0.5, cx + Math.cos(a + hw) * r0, cy + Math.sin(a + hw) * r0);
      ctx.closePath();
      inked(ctx, S, colors[k % colors.length], LW(S) * 0.75);
    }
  }
  function sparkle(ctx, S, x, y, r, color, rot = 0) {
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = rot + (k / 8) * TAU, rr = k % 2 ? r * 0.3 : r;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    inked(ctx, S, color, Math.max(2, LW(S) * 0.55));
  }
  function heart(ctx, S, x, y, s, color) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.35);
    ctx.bezierCurveTo(x - s * 0.9, y - s * 0.2, x - s * 0.45, y - s * 0.85, x, y - s * 0.38);
    ctx.bezierCurveTo(x + s * 0.45, y - s * 0.85, x + s * 0.9, y - s * 0.2, x, y + s * 0.35);
    inked(ctx, S, color, Math.max(2, LW(S) * 0.55));
  }
  function font(S, kind, size) {
    if (kind === "body") return `800 ${size}px ${S.look.body}`;
    return `${S.look.displayWeight} ${size}px ${S.look.figures}`;
  }
  // Swelling bubble figures: a dark extruded drop, a fat plum keyline, then the fill.
  function bubbleText(ctx, S, str, x, y, size, fillColor, opts = {}) {
    const { align = "center", baseline = "middle", kind = "figures", drop = 0.08, dropColor, maxW } = opts;
    let sz = size;
    ctx.save();
    ctx.font = font(S, kind, sz);
    if (maxW) while (sz > size * 0.55 && ctx.measureText(str).width > maxW) { sz *= 0.94; ctx.font = font(S, kind, sz); }
    ctx.textAlign = align; ctx.textBaseline = baseline; ctx.lineJoin = "round";
    const ink = P(S).ink;
    const d = sz * drop, steps = 5;
    ctx.lineWidth = sz * 0.16; ctx.strokeStyle = ink; ctx.fillStyle = ink;
    for (let k = steps; k >= 1; k--) { const o = (d * k) / steps; ctx.strokeText(str, x + o, y + o); ctx.fillText(str, x + o, y + o); }
    if (dropColor) { ctx.lineWidth = sz * 0.08; ctx.strokeStyle = dropColor; ctx.fillStyle = dropColor; ctx.strokeText(str, x + d * 0.55, y + d * 0.55); ctx.fillText(str, x + d * 0.55, y + d * 0.55); }
    ctx.lineWidth = sz * 0.16; ctx.strokeStyle = ink; ctx.strokeText(str, x, y);
    ctx.fillStyle = fillColor; ctx.fillText(str, x, y);
    ctx.restore();
    return sz;
  }
  // A poster label: a ribbon scroll with notched tails (or a hand-drawn balloon), lettered in the
  // headline face. `grow` scales only the container; the words land at full size once it is open.
  function tag(ctx, S, str, x, y, size, opts = {}) {
    const { align = "center", shadow, maxW, tail, grow = 1, t = 0 } = opts;
    if (grow <= 0 || !str) return null;
    const u = S.u, ink = P(S).ink, cream = P(S).cream, tint = shadow || P(S).inks.pink;
    ctx.save();
    let sz = size;
    ctx.font = font(S, "figures", sz);
    const pad = tail ? 1.2 : 1.5;
    if (maxW) while (sz > 42 * u && ctx.measureText(str).width + sz * pad > maxW) { sz *= 0.95; ctx.font = font(S, "figures", sz); }
    const tw = ctx.measureText(str).width;
    const w = tw + sz * (tail ? 1.0 : 0.9), h = sz * 1.5;
    const x0 = align === "left" ? x : align === "right" ? x - w : x - w / 2, cx = x0 + w / 2;
    const g = 0.72 + 0.28 * pop(grow);
    ctx.globalAlpha *= clamp(grow * 6);
    ctx.save();
    ctx.translate(cx, y); ctx.scale(g, g); ctx.rotate(Math.sin(t * 1.7 + x * 0.01) * 0.02);
    if (tail) {
      // A wobbling speech balloon with a curled tail.
      const rx = w / 2 + sz * 0.2, ry = h * 0.62;
      const shape = (o) => {
        ctx.beginPath();
        for (let k = 0; k <= 72; k++) {
          const a = (k / 72) * TAU, wob = 1 + 0.035 * Math.sin(a * 7 + t * 2.5);
          const px = o + Math.cos(a) * rx * wob, py = o + Math.sin(a) * ry * wob;
          if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.closePath();
        ctx.moveTo(o - rx * 0.18, o + ry * 0.86); ctx.quadraticCurveTo(o - rx * 0.12, o + ry * 1.5, o - rx * 0.32, o + ry * 1.62);
        ctx.quadraticCurveTo(o + rx * 0.05, o + ry * 1.45, o + rx * 0.12, o + ry * 0.9);
      };
      shape(8 * u); inked(ctx, S, tint);
      shape(0); inked(ctx, S, cream);
      ctx.fillStyle = cream; ctx.beginPath(); ctx.ellipse(0, ry * 0.72, rx * 0.24, ry * 0.2, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-rx * 0.62, -ry * 0.3, rx * 0.12, ry * 0.12, -0.6, Math.PI * 1.1, Math.PI * 1.8);
      ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 4 * u; ctx.lineCap = "round"; ctx.stroke();
    } else {
      // Ribbon tails tuck behind the body, notched at their outer ends.
      const tl = h * 0.62, dy = h * 0.26;
      for (const side of [-1, 1]) {
        const ex = side * (w / 2 + tl), ix = side * (w / 2 - h * 0.2);
        ctx.beginPath();
        ctx.moveTo(ix, -h / 2 + dy); ctx.lineTo(ex, -h / 2 + dy); ctx.lineTo(ex - side * h * 0.3, dy * 0.5 + h * 0.08); ctx.lineTo(ex, h / 2 + dy); ctx.lineTo(ix, h / 2 + dy); ctx.closePath();
        inked(ctx, S, tint, LW(S) * 0.8);
        ctx.beginPath(); ctx.moveTo(side * w / 2, h / 2); ctx.lineTo(side * (w / 2 - h * 0.2), h / 2 + dy); ctx.lineTo(side * (w / 2 - h * 0.2), h / 2); ctx.closePath();
        inked(ctx, S, ink, LW(S) * 0.5);
      }
      const body = (o) => {
        ctx.beginPath();
        for (let xx = -w / 2; xx <= w / 2 + 0.1; xx += w / 24) ctx.lineTo(o + xx, o - h / 2 + Math.sin(xx / (h * 0.5) + t * 2) * h * 0.035);
        for (let xx = w / 2; xx >= -w / 2 - 0.1; xx -= w / 24) ctx.lineTo(o + xx, o + h / 2 + Math.sin(xx / (h * 0.5) + t * 2 + 1) * h * 0.035);
        ctx.closePath();
      };
      body(7 * u); inked(ctx, S, ink);
      body(0); inked(ctx, S, cream);
      ctx.beginPath(); ctx.rect(-w / 2 + h * 0.14, -h / 2 + h * 0.14, w - h * 0.28, h - h * 0.28);
      ctx.save(); ctx.setLineDash([2 * u, 9 * u]); ctx.lineCap = "round"; ctx.strokeStyle = hexA(ink, 0.55); ctx.lineWidth = 3.5 * u; ctx.stroke(); ctx.restore();
    }
    // The words travel with their label from its first frame.
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    ctx.fillStyle = tint; ctx.fillText(str, sz * 0.05, sz * 0.1);
    ctx.fillStyle = ink; ctx.fillText(str, 0, sz * 0.05);
    ctx.restore();
    ctx.restore();
    return { x: x0, y: y - h / 2, w, h };
  }

  // ---- poster lettering ------------------------------------------------------------------------------
  // Headlines are drawn here, glyph by glyph: swelling letters on an arch, a split-fountain fill, a fat
  // plum keyline and a two-ink drop. The DOM headline stays in the page, hidden, as the source of words.
  const HEAD_IDS = { title: "title", chart: "chart-title", object: "object-title", people: "people-title", process: "process-title", compare: "compare-title", closing: "closing" };
  function domText(id) { const el = typeof document !== "undefined" && document.getElementById(id); return el ? (el.textContent || "").replace(/\s+/g, " ").trim() : ""; }
  function mix(a, b, f) { const x = rgb(a), y = rgb(b); return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * f).toString(16).padStart(2, "0")).join(""); }
  // Split words into n lines with the narrowest widest line.
  function balance(ctx, words, n) {
    const wd = (list) => ctx.measureText(list.join(" ")).width;
    if (n <= 1 || words.length < 2) return [words.join(" ")];
    let best = null, bestW = 1e9;
    const rec = (start, left, acc) => {
      if (left === 1) { const line = words.slice(start); const all = [...acc, line]; const m = Math.max(...all.map(wd)); if (m < bestW) { bestW = m; best = all; } return; }
      for (let e = start + 1; e <= words.length - left + 1; e++) rec(e, left - 1, [...acc, words.slice(start, e)]);
    };
    rec(0, Math.min(n, words.length), []);
    return best.map((l) => l.join(" "));
  }
  const layouts = {};
  function headLayout(ctx, S, id) {
    const text = domText(HEAD_IDS[id]);
    if (!text) return null;
    const key = `${id}|${S.W}x${S.H}|${text}`;
    if (layouts[key]) return layouts[key];
    const u = S.u, statement = id === "title" || id === "closing";
    const maxW = statement ? S.W * (S.tall ? 0.8 : 0.66) : S.W - (S.tall ? 190 : 340) * u;
    const maxLines = statement ? 3 : S.tall ? 3 : 2;
    const words = text.split(" ");
    let size = (statement ? (S.tall ? 136 : 150) : (S.tall ? 100 : 118)) * u, lines = [text];
    ctx.save();
    for (let tries = 0; tries < 40; tries++) {
      ctx.font = font(S, "figures", size);
      let ok = null;
      const first = statement && (text.length > 16 || words.length > 3) ? 2 : 1;
      for (let n = Math.min(first, words.length); n <= Math.min(maxLines, words.length); n++) {
        const ls = balance(ctx, words, n);
        if (Math.max(...ls.map((l) => ctx.measureText(l).width)) * 1.12 <= maxW) { ok = ls; break; }
      }
      if (ok) { lines = ok; break; }
      size *= 0.95;
    }
    ctx.font = font(S, "figures", size);
    const widths = lines.map((l) => ctx.measureText(l).width * 1.12);
    ctx.restore();
    const lineH = size * 1.1, textH = lines.length * lineH;
    const L = { lines, size, lineH, textH, wide: Math.max(...widths), statement };
    if (!statement) {
      L.top = (S.tall ? 64 : 30) * u;
      L.h = textH + size * 0.5;
      L.cy = L.top + L.h / 2;
      L.bottom = L.top + L.h * 1.24 + 12 * u; // the ribbon tails hang below the body
    }
    layouts[key] = L;
    return L;
  }
  const LETTERS = (S, id) => {
    const k = P(S).inks;
    return ({ title: [k.yellow, k.orange, S.accent], chart: [k.yellow, k.orange, k.blue], object: [k.pink, k.pink, k.purple, "solid"], people: [k.blue, k.blue, k.yellow, "solid"],
      process: [k.orange, k.red, k.blue], compare: [k.yellow, k.orange, k.purple], closing: [k.pink, k.purple, k.yellow] })[id] || [k.yellow, k.orange, S.accent];
  };
  function posterText(ctx, S, L, cx, cy, o) {
    const { t = 0, arch = 0.05, bulge = 0.12, colors, reveal = 99, stagger = 0.03, wobble = 0, outline = 0.24 } = o;
    const size = L.size, ink = P(S).ink;
    const [c1, c2raw, drop, mode] = colors;
    const solid = mode === "solid", c2 = solid ? c1 : c2raw;
    const c0 = solid ? mix(c1, "#ffffff", 0.32) : mix(c1, "#ffffff", 0.5);
    ctx.save();
    ctx.font = font(S, "figures", size);
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round"; ctx.miterLimit = 2;
    const glyphs = [];
    let gi = 0;
    L.lines.forEach((line, li) => {
      const chars = [...line], ws = chars.map((ch) => ctx.measureText(ch).width);
      const raw = ws.reduce((a, b) => a + b, 0);
      let acc = 0;
      const sc = ws.map((w) => { const nx = ((acc + w / 2) / raw) * 2 - 1; acc += w; return 1 + bulge * (1 - nx * nx); });
      const total = ws.reduce((a, w, i) => a + w * sc[i], 0) * 0.98;
      let x = cx - total / 2;
      const ly = cy + (li - (L.lines.length - 1) / 2) * L.lineH;
      chars.forEach((ch, i) => {
        const w = ws[i] * sc[i] * 0.98, gx = x + w / 2, nx = (gx - cx) / (total / 2);
        x += w;
        const yo = -arch * size * (1 - nx * nx) * (total / (L.size * 6));
        const rot = Math.atan((2 * arch * size * nx * (total / (L.size * 6))) / (total / 2));
        const swell = sc[i] * (1 + (0.045 + wobble * 0.6) * Math.sin(t * 3.2 - gi * 0.55));
        const r = clamp((reveal - gi * stagger) / 0.32);
        gi++;
        if (ch === " " || r <= 0) return;
        glyphs.push({ ch, x: gx, y: ly + yo - (1 - pop(r)) * size * 0.7 + wobble * size * 0.6 * Math.sin(t * 2.6 + gi * 0.7), rot: rot + wobble * Math.sin(t * 2.2 + gi * 1.3), s: swell, a: clamp(r * 3) });
      });
    });
    const each = (fn) => glyphs.forEach((g) => { ctx.save(); ctx.globalAlpha *= g.a; ctx.translate(g.x, g.y); ctx.rotate(g.rot); ctx.scale(g.s, g.s); fn(g); ctx.restore(); });
    const d = size * 0.075;
    each((g) => { ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.lineWidth = size * outline; ctx.strokeText(g.ch, d * 1.6, d * 1.75); ctx.fillText(g.ch, d * 1.6, d * 1.75); });
    each((g) => { ctx.strokeStyle = drop; ctx.lineWidth = size * outline; ctx.strokeText(g.ch, d * 0.85, d * 0.95); });
    each((g) => { ctx.strokeStyle = ink; ctx.lineWidth = size * outline; ctx.strokeText(g.ch, 0, 0); });
    each((g) => {
      const gr = ctx.createLinearGradient(0, -size * 0.48, 0, size * 0.36);
      gr.addColorStop(0, c0); gr.addColorStop(solid ? 0.3 : 0.44, c0); gr.addColorStop(solid ? 0.31 : 0.45, c1); gr.addColorStop(0.78, c1); gr.addColorStop(0.79, c2); gr.addColorStop(1, c2);
      ctx.fillStyle = gr; ctx.strokeStyle = gr; ctx.lineWidth = size * 0.035; ctx.strokeText(g.ch, 0, 0); ctx.fillText(g.ch, 0, 0);
    });
    ctx.restore();
  }
  // A scroll banner: notched tails, a wavy cream body with a hard shadow and a dotted inner border.
  function banner(ctx, S, cx, top, w, h, grow, t, tint) {
    const u = S.u, ink = P(S).ink, g = pop(grow);
    if (g <= 0) return;
    const bw = w * (0.25 + 0.75 * g), x0 = cx - bw / 2, x1 = cx + bw / 2;
    const tl = h * 0.42, dy = h * 0.22;
    for (const side of [-1, 1]) {
      const edge = side < 0 ? x0 : x1, ex = edge + side * tl, ix = edge - side * h * 0.25;
      ctx.beginPath();
      ctx.moveTo(ix, top + dy); ctx.lineTo(ex, top + dy); ctx.lineTo(ex - side * h * 0.28, top + dy + h * 0.5); ctx.lineTo(ex, top + h + dy); ctx.lineTo(ix, top + h + dy); ctx.closePath();
      sticker(ctx, S, () => { ctx.beginPath(); ctx.moveTo(ix, top + dy); ctx.lineTo(ex, top + dy); ctx.lineTo(ex - side * h * 0.28, top + dy + h * 0.5); ctx.lineTo(ex, top + h + dy); ctx.lineTo(ix, top + h + dy); ctx.closePath(); }, tint, ink, 8 * u);
      ctx.beginPath(); ctx.moveTo(edge, top + h); ctx.lineTo(edge - side * h * 0.25, top + h + dy); ctx.lineTo(edge - side * h * 0.25, top + h); ctx.closePath(); inked(ctx, S, ink, LW(S) * 0.6);
    }
    const body = () => {
      ctx.beginPath();
      for (let x = x0; x <= x1 + 0.1; x += bw / 40) ctx.lineTo(x, top + Math.sin((x - cx) / (h * 0.7) + t * 2) * h * 0.04);
      for (let x = x1; x >= x0 - 0.1; x -= bw / 40) ctx.lineTo(x, top + h + Math.sin((x - cx) / (h * 0.7) + t * 2 + 1.2) * h * 0.04);
      ctx.closePath();
    };
    sticker(ctx, S, body, P(S).cream, ink, 12 * u);
    // Dotted border inside, like a printed frame.
    ctx.save();
    ctx.beginPath(); ctx.rect(x0 + h * 0.13, top + h * 0.13, bw - h * 0.26, h - h * 0.26);
    ctx.setLineDash([0.1, 16 * u]); ctx.lineCap = "round"; ctx.strokeStyle = tint; ctx.lineWidth = 7 * u; ctx.stroke();
    ctx.restore();
  }
  // A scalloped cloud cartouche: a rounded slab whose rim is a ring of soft bumps.
  function cloud(ctx, cx, cy, w, h, t, bumps = 28) {
    ctx.beginPath();
    for (let k = 0; k <= 240; k++) {
      const a = (k / 240) * TAU, c = Math.cos(a), s = Math.sin(a);
      const sc = 1 + 0.035 * (Math.abs(Math.cos((a * bumps) / 2)) - 0.6) + 0.012 * Math.sin(a * 3 + t * 1.5);
      const px = cx + Math.sign(c) * Math.pow(Math.abs(c), 0.55) * (w / 2) * sc, py = cy + Math.sign(s) * Math.pow(Math.abs(s), 0.55) * (h / 2) * sc;
      if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath();
  }
  // A scene headline on its banner, unrolling in and lifting away with the scene.
  function sceneHead(ctx, S, id, info) {
    const L = headLayout(ctx, S, id);
    if (!L) return;
    const local = info.local, q = info.exit || 0;
    const w = L.wide + L.size * 1.1;
    const g = 0.55 + 0.45 * pop(clamp(local / 0.32));
    ctx.save();
    ctx.globalAlpha *= clamp(local / 0.08);
    if (q > 0) { ctx.globalAlpha *= 1 - clamp((q - 0.6) / 0.4); ctx.translate(0, -(L.bottom + 40 * S.u) * easeIn(q)); }
    // Plaque and words arrive together, as one piece.
    ctx.translate(S.W / 2, L.cy); ctx.scale(g, g); ctx.rotate((1 - g) * 0.12); ctx.translate(-S.W / 2, -L.cy);
    const cols = LETTERS(S, id);
    banner(ctx, S, S.W / 2, L.top, w, L.h, 1, info.t, cols[2]);
    posterText(ctx, S, L, S.W / 2, L.cy + L.size * 0.02, { t: info.t, arch: 0.05, bulge: 0.14, colors: cols, wobble: 0.012 });
    ctx.restore();
  }
  // The title and closing statements: big arched lettering on a cartouche.
  function statement(ctx, S, id, info) {
    const L = headLayout(ctx, S, id);
    if (!L) return;
    const u = S.u, t = info.t, k = P(S).inks, local = info.local, q = info.exit || 0;
    const vis = 0.5 + 0.5 * pop(clamp(local / 0.38));
    const kicker = id === "title" ? domText("kicker") : "";
    const cw = L.wide + L.size * (id === "title" ? 1.5 : 1.3), ch = L.textH + L.size * (kicker ? 1.55 : 1.25);
    const cx = S.W / 2, cy = S.H / 2 + (kicker ? L.size * 0.12 : 0);
    ctx.save();
    ctx.globalAlpha *= clamp(local / 0.08);
    if (q > 0) { const z = 1 - 0.9 * easeIn(q); ctx.globalAlpha *= 1 - clamp((q - 0.6) / 0.4); ctx.translate(cx, cy); ctx.rotate(0.1 * easeIn(q)); ctx.scale(z, z); ctx.translate(-cx, -cy); }
    // A radiating halo of long rays turning behind the plaque.
    const hr = Math.max(cw, ch) * 0.62 * (0.7 + 0.3 * vis) * (1 + 0.04 * Math.sin(t * 3));
    ctx.save(); ctx.globalAlpha *= 0.92;
    burst(ctx, S, cx, cy, hr * 0.3, hr * 1.25, 28, t * 0.25, id === "title" ? [k.yellow, k.orange, P(S).cream, k.lime] : [k.yellow, k.pink, P(S).cream, k.orange], 0.18);
    ctx.restore();
    ctx.translate(cx, cy); ctx.scale(vis, vis); ctx.rotate(Math.sin(t * 1.3) * 0.012); ctx.translate(-cx, -cy);
    if (id === "title") {
      cloud(ctx, cx + 16 * u, cy + 16 * u, cw, ch, t); inked(ctx, S, k.purple);
      cloud(ctx, cx, cy, cw, ch, t); inked(ctx, S, P(S).cream, LW(S) * 1.2);
      cloud(ctx, cx, cy, cw * 0.93, ch * 0.88, t + 1, 34); inked(ctx, S, null, 3 * u);
    } else {
      const shape = (dx, dy, sc = 1) => {
        ctx.beginPath();
        for (let s2 = 0; s2 <= 120; s2++) {
          const a = (s2 / 120) * TAU, c = Math.cos(a), sn = Math.sin(a);
          const e = 1 + 0.035 * Math.sin(5 * a + t * 1.6) + 0.02 * Math.sin(9 * a - t * 2);
          const px = cx + dx + Math.sign(c) * Math.pow(Math.abs(c), 0.6) * cw / 2 * e * sc, py = cy + dy + Math.sign(sn) * Math.pow(Math.abs(sn), 0.6) * ch / 2 * e * sc;
          if (s2) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.closePath();
      };
      shape(16 * u, 16 * u); inked(ctx, S, k.purple);
      shape(0, 0); inked(ctx, S, P(S).cream, LW(S) * 1.2);
      shape(0, 0, 0.93); inked(ctx, S, null, 3 * u);
    }
    // A sheen that slides across the plaque every couple of seconds.
    {
      const sx = cx - cw * 0.7 + ((t * 0.45) % 1) * cw * 1.4;
      ctx.save();
      if (id === "title") cloud(ctx, cx, cy, cw * 0.97, ch * 0.95, t); else { ctx.beginPath(); ctx.ellipse(cx, cy, cw * 0.48, ch * 0.46, 0, 0, TAU); }
      ctx.clip();
      ctx.translate(sx, cy); ctx.rotate(0.35);
      ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.fillRect(-18 * u, -ch, 26 * u, ch * 2); ctx.fillRect(18 * u, -ch, 9 * u, ch * 2);
      ctx.restore();
    }
    // Flowers bloom around the rim in turn, each opening and turning.
    const blooms = 10, cols = [k.yellow, k.lime, k.pink, k.orange, k.blue];
    for (let i = 0; i < blooms; i++) {
      const a = (i / blooms) * TAU + 0.3, c = Math.cos(a), sn = Math.sin(a);
      const bx = cx + Math.sign(c) * Math.pow(Math.abs(c), 0.6) * cw * 0.5, by = cy + Math.sign(sn) * Math.pow(Math.abs(sn), 0.6) * ch * 0.5;
      const open = pop(clamp((local - 0.1 - i * 0.06) / 0.4)) * (0.85 + 0.25 * Math.max(0, Math.sin(t * 2.4 - i * 0.9)));
      if (open <= 0) continue;
      const r = 40 * u * open;
      scallop(ctx, bx, by, r, 7, 0.45, t * (i % 2 ? 0.9 : -0.9) + i); inked(ctx, S, cols[i % cols.length], LW(S) * 0.7);
      circle(ctx, bx, by, r * 0.36); inked(ctx, S, i % 2 ? k.pink : k.orange, 3 * u);
      circle(ctx, bx - r * 0.1, by - r * 0.1, r * 0.1); ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.fill();
    }
    const tcy = cy + (kicker ? L.size * 0.2 : 0);
    posterText(ctx, S, L, cx, tcy, { t, arch: id === "title" ? 0.16 : 0.08, bulge: 0.24, colors: LETTERS(S, id), wobble: 0.03, outline: 0.27 });
    if (kicker) tag(ctx, S, kicker, cx, cy - ch / 2 + 6 * u, 46 * u, { shadow: k.lime, grow: 1, t, maxW: cw });
    ctx.restore();
  }

  // Smooth path through points (Catmull-Rom), sampled into a polyline with cumulative lengths.
  function spline(points, per = 24) {
    const out = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
      for (let s = 0; s < per; s++) {
        const t = s / per, t2 = t * t, t3 = t2 * t;
        out.push([
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
        ]);
      }
    }
    out.push(points[points.length - 1]);
    const len = [0];
    for (let i = 1; i < out.length; i++) len.push(len[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
    return { pts: out, len, total: len[len.length - 1] };
  }
  function along(sp, d) {
    const L = clamp(d, 0, sp.total);
    let i = 1;
    while (i < sp.len.length - 1 && sp.len[i] < L) i++;
    const a = sp.pts[i - 1], b = sp.pts[i], seg = sp.len[i] - sp.len[i - 1] || 1, f = (L - sp.len[i - 1]) / seg;
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, Math.atan2(b[1] - a[1], b[0] - a[0])];
  }
  function polyTo(ctx, sp, upTo) {
    ctx.beginPath();
    ctx.moveTo(sp.pts[0][0], sp.pts[0][1]);
    for (let i = 1; i < sp.pts.length && sp.len[i] <= upTo; i++) ctx.lineTo(sp.pts[i][0], sp.pts[i][1]);
    const e = along(sp, upTo); ctx.lineTo(e[0], e[1]);
  }
  // A striped tube along a path: keyline, then each stripe narrower than the last.
  function tube(ctx, S, sp, upTo, width, colors) {
    if (upTo <= 0) return;
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
    polyTo(ctx, sp, upTo);
    ctx.strokeStyle = P(S).ink; ctx.lineWidth = width + LW(S) * 2; ctx.stroke();
    const n = colors.length;
    for (let k = 0; k < n; k++) {
      const w = width * (1 - k / n);
      ctx.strokeStyle = colors[k]; ctx.lineWidth = w; ctx.stroke();
    }
    ctx.restore();
  }
  // A wobbly noodle line from a to b, drawn on to fraction f, as an inked double tube.
  function noodle(ctx, S, ax, ay, bx, by, f, color, t, seed) {
    const pts = [];
    const n = 40, dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    for (let i = 0; i <= n; i++) {
      const s = i / n, w = Math.sin(s * Math.PI) * (10 * S.u) * Math.sin(s * 9 + t * 4 + seed);
      pts.push([ax + dx * s + nx * w, ay + dy * s + ny * w]);
    }
    const sp = spline(pts, 2);
    tube(ctx, S, sp, sp.total * clamp(f), 9 * S.u, [color]);
  }

  // Shared frame state: the stage runs first each frame, so scenes know whether they leave.
  let frame = { next: null, local: 0, hold: 1, change: 0.45, t: 0 };
  function leaving() {
    if (!frame.next) return 0;
    return clamp((frame.local - (frame.hold - frame.change)) / Math.max(0.01, frame.change));
  }
  // Scenes leave by swelling down into the change; the art scales about its box centre and fades late.
  // The illustration area starts under the scene's banner, so the diagram uses the whole frame.
  function withExit(fn, id) {
    return (ctx, S, box, p, d, info) => {
      const L = headLayout(ctx, S, id);
      const top = L ? Math.max(L.bottom + 24 * S.u, box.y - 120 * S.u) : box.y;
      const area = { x: box.x, y: top, w: box.w, h: box.y + box.h - top };
      const q = info.exit || 0;
      ctx.save();
      if (q > 0) {
        const s = 1 - 0.95 * easeIn(q), cx = area.x + area.w / 2, cy = area.y + area.h / 2;
        ctx.globalAlpha *= 1 - clamp((q - 0.8) / 0.2);
        ctx.translate(cx, cy); ctx.rotate(-0.08 * easeIn(q)); ctx.scale(s, s); ctx.translate(-cx, -cy);
      }
      // Builds land quickly so a scene is full within its first second or so.
      fn(ctx, S, area, Math.max(p, ease(clamp((info.local - 0.05) / 1.3))), d, info);
      ctx.restore();
      sceneHead(ctx, S, id, info);
    };
  }
  // Once a scene has built, an accent passes from item to item for the rest of the hold:
  // 0 most of the time, rising to 1 and back while it is item i's turn.
  function turn(t, i, n, p, rate = 1.15) {
    const on = clamp((p - 0.92) * 12);
    if (on <= 0) return 0;
    const ph = t * rate, k = Math.floor(ph) % n;
    return k === i ? Math.sin((ph % 1) * Math.PI) * on : 0;
  }
  // Full-frame pieces (the ground) ignore the exit's scale but keep its fade.
  function flat(ctx, draw) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); draw(); ctx.restore(); }
  // A glossy cream glint on a bulbous shape.
  function shine(ctx, S, x, y, r, a0 = Math.PI * 1.1, a1 = Math.PI * 1.45) {
    ctx.save(); ctx.lineCap = "round"; ctx.strokeStyle = "rgba(255,250,235,0.85)"; ctx.lineWidth = Math.max(3, r * 0.16);
    ctx.beginPath(); ctx.arc(x, y, r * 0.72, a0, a1); ctx.stroke();
    ctx.fillStyle = "rgba(255,250,235,0.85)"; circle(ctx, x + Math.cos(a1 + 0.28) * r * 0.72, y + Math.sin(a1 + 0.28) * r * 0.72, r * 0.08); ctx.fill();
    ctx.restore();
  }
  function floaters(ctx, S, box, t, seed, count, kinds) {
    const r = rng(seed), k = P(S).inks;
    const colors = [k.yellow, k.pink, k.lime, k.orange, k.blue, k.teal];
    for (let i = 0; i < count; i++) {
      const x0 = box.x + r() * box.w, speed = 0.08 + r() * 0.1, ph = r(), size = (16 + r() * 18) * S.u, kind = kinds[i % kinds.length], col = colors[i % colors.length];
      const life = (t * speed + ph) % 1;
      const y = box.y + box.h * (1 - life * 1.15);
      const x = x0 + Math.sin(t * 1.3 + i) * 24 * S.u;
      ctx.save(); ctx.globalAlpha *= clamp(Math.min(life * 5, (1 - life) * 5));
      if (kind === "heart") heart(ctx, S, x, y, size * 1.3, col);
      else sparkle(ctx, S, x, y, size, col, t * 1.5 + i);
      ctx.restore();
    }
  }

  // ---- chart: melting lava columns -------------------------------------------------------------------
  function ground(ctx, S, y, t, colors, amp) {
    const { W, H } = S, u = S.u;
    const band = 26 * u;
    for (let k = 0; k < colors.length; k++) { // each lower stripe lies over the one above it
      ctx.beginPath();
      const yy = y + k * band;
      ctx.moveTo(-20, H + 20);
      for (let x = -20; x <= W + 20; x += 16) ctx.lineTo(x, yy + Math.sin(x / (170 * u) + t * 1.2 + k * 0.6) * amp);
      ctx.lineTo(W + 20, H + 20); ctx.closePath();
      inked(ctx, S, colors[k], LW(S) * 0.8);
    }
  }
  function columnPath(ctx, x, w, base, h, t, i, u) {
    const rx = w / 2, ry = Math.min(rx, h), top = base - h;
    const wob = (y) => Math.sin(y / (60 * u) + t * 2.4 + i * 1.7) * w * 0.045;
    ctx.beginPath();
    ctx.moveTo(x + wob(base), base);
    for (let y = base; y > top + ry; y -= 14 * u) ctx.lineTo(x + wob(y), y);
    ctx.ellipse(x + rx + wob(top + ry), top + ry, rx, ry, 0, Math.PI, 0);
    for (let y = top + ry; y < base; y += 14 * u) ctx.lineTo(x + w + wob(y), y);
    ctx.lineTo(x + w + wob(base), base);
    ctx.closePath();
  }
  function chart(ctx, S, box, p, d, info) {
    const u = S.u, t = info.t, k = P(S).inks;
    const n = d.values.length, max = Math.max(...d.values, 1);
    const base = box.y + box.h - 70 * u;
    flat(ctx, () => ground(ctx, S, base, t, [k.purple, k.yellow, k.pink], 9 * u));
    floaters(ctx, S, { x: box.x, y: box.y - 40 * u, w: box.w, h: box.h * 0.8 }, t, 31, 7, ["spark"]);
    const slot = box.w / n, w = Math.min(slot * 0.6, 250 * u);
    const stripeSets = [[k.orange, k.yellow, k.pink], [k.blue, k.teal, k.lime], [k.purple, k.pink, k.orange], [k.red, k.yellow, k.lime]];
    const room = box.h - 70 * u - 175 * u;
    for (let i = 0; i < n; i++) {
      const q = stag(p, i, n, 0.5), hot = i === d.highlight;
      if (q <= 0) continue;
      const g = pop(q), pz = turn(t, i, n, p);
      const h = Math.max(10 * u, (room * (d.values[i] / max) * g + 30 * u) * (1 + 0.06 * pz));
      const x = box.x + slot * (i + 0.5) - w / 2;
      const set = hot ? [S.accent, k.yellow, k.pink] : stripeSets[i % stripeSets.length];
      // Offset shadow, then the stripes flowing upward inside the column.
      ctx.save(); ctx.translate(10 * u, 10 * u); columnPath(ctx, x, w, base, h, t, i, u); ctx.fillStyle = P(S).ink; ctx.fill(); ctx.restore();
      ctx.save();
      columnPath(ctx, x, w, base, h, t, i, u); ctx.clip();
      ctx.fillStyle = set[0]; ctx.fillRect(x - w, base - h - 20, w * 3, h + 40);
      const sh = 34 * u, scroll = (t * 70 * u) % (sh * 2);
      for (let y = base + sh * 2 - scroll; y > base - h - sh * 2; y -= sh * 2) {
        ctx.beginPath();
        for (let xx = x - 10; xx <= x + w + 10; xx += 8) ctx.lineTo(xx, y + Math.sin(xx / (28 * u) + t * 3 + i) * 7 * u);
        for (let xx = x + w + 10; xx >= x - 10; xx -= 8) ctx.lineTo(xx, y - sh + Math.sin(xx / (28 * u) + t * 3 + i + 0.8) * 7 * u);
        ctx.closePath();
        ctx.fillStyle = set[1 + ((Math.round((y - base) / (sh * 2)) % 2 + 2) % 2)];
        ctx.fill();
        ctx.lineWidth = 2.6 * u; ctx.strokeStyle = P(S).ink; ctx.stroke();
      }
      // The melting cap: cream with drips that stretch and recover.
      const capH = Math.min(h * 0.5, w * 0.42), top = base - h;
      ctx.beginPath();
      ctx.moveTo(x - 10, top - 10); ctx.lineTo(x + w + 10, top - 10); ctx.lineTo(x + w + 10, top + capH * 0.7);
      const drips = 3;
      // Each drip swells for a second, lets a drop go, and shrinks back.
      const dripPhase = (dI) => (t * 0.62 + dI * 0.37 + i * 0.23) % 1;
      const dripLen = (dI) => { const ph = dripPhase(dI); return capH * (0.7 + 1.1 * (ph < 0.6 ? easeInOut(ph / 0.6) : 1 - easeInOut((ph - 0.6) / 0.4))); };
      for (let dI = drips; dI >= 0; dI--) {
        const cx = x + (w * (dI + 0.5)) / (drips + 1);
        const L = dripLen(dI);
        ctx.lineTo(cx + w * 0.09, top + capH * 0.7);
        ctx.lineTo(cx + w * 0.09, top + L - w * 0.06);
        ctx.arc(cx, top + L - w * 0.06, w * 0.09, 0, Math.PI);
        ctx.lineTo(cx - w * 0.09, top + capH * 0.7);
      }
      ctx.lineTo(x - 10, top + capH * 0.7); ctx.closePath();
      ctx.fillStyle = hot ? P(S).cream : k.yellow === set[1] ? k.lime : P(S).cream;
      ctx.fill(); ctx.lineWidth = LW(S) * 0.7; ctx.strokeStyle = P(S).ink; ctx.stroke();
      for (let dI = 0; dI <= drips; dI++) {
        const ph = dripPhase(dI);
        if (ph < 0.6) continue;
        const cx = x + (w * (dI + 0.5)) / (drips + 1), fall = (ph - 0.6) / 0.4;
        const dy = top + capH * 1.8 + (h - capH * 1.8) * fall * fall;
        if (dy > base - 8 * u) continue;
        ctx.beginPath(); ctx.moveTo(cx, dy - w * 0.11); ctx.quadraticCurveTo(cx + w * 0.07, dy, cx, dy + w * 0.05); ctx.quadraticCurveTo(cx - w * 0.07, dy, cx, dy - w * 0.11);
        ctx.fillStyle = ctx.fillStyle; inked(ctx, S, hot ? P(S).cream : k.yellow === set[1] ? k.lime : P(S).cream, LW(S) * 0.5);
      }
      ctx.restore();
      // Inner contour and a long gloss streak down the left of the column.
      ctx.save(); columnPath(ctx, x, w, base, h, t, i, u); ctx.clip();
      columnPath(ctx, x, w, base, h, t, i, u); ctx.strokeStyle = hexA(P(S).ink, 0.28); ctx.lineWidth = 22 * u; ctx.stroke();
      if (h > w) { ctx.beginPath(); ctx.roundRect(x + w * 0.13, base - h + w * 0.55, w * 0.09, Math.max(0, h - w * 0.75), w * 0.05); ctx.fillStyle = "rgba(255,250,235,0.6)"; ctx.fill(); }
      ctx.restore();
      columnPath(ctx, x, w, base, h, t, i, u); inked(ctx, S, null, LW(S) * 1.1);
      if (h > w * 0.6) shine(ctx, S, x + w / 2, base - h + w / 2, w * 0.4);
      if (pz > 0.05) for (let j = 0; j < 6; j++) { const a = -Math.PI / 2 + (j - 2.5) * 0.45, rr = w * (0.55 + 0.5 * pz); sparkle(ctx, S, x + w / 2 + Math.cos(a) * rr, base - h + w * 0.3 + Math.sin(a) * rr, 20 * u * pz, [k.yellow, P(S).cream, k.lime][j % 3], t * 3 + j); }
      // Value: swelling figures above, the highlight inside a spinning sunburst medallion.
      const vy = base - h - 92 * u;
      const value = M().formatNumber(d.values[i] * clamp(q * 1.2), 0, d.prefix, d.suffix);
      if (hot) {
        const R = Math.min(slot * 0.5, 120 * u) * pop(clamp(q * 1.3 - 0.2));
        burst(ctx, S, x + w / 2, vy, R * 0.62, R * 1.08, 16, t * 0.6, [k.yellow, k.pink, k.orange, k.lime], 0.3);
        circle(ctx, x + w / 2, vy, R * 0.7); inked(ctx, S, P(S).cream, LW(S));
        bubbleText(ctx, S, value, x + w / 2, vy + 4 * u, 104 * u * (1 + 0.15 * pz), S.accent, { maxW: R * 1.5 });
      } else {
        bubbleText(ctx, S, value, x + w / 2, vy + 6 * u, 100 * u * (1 + 0.15 * pz), P(S).cream, { maxW: slot * 0.95, dropColor: set[0] });
      }
      tag(ctx, S, d.labels[i] || "", x + w / 2, base + 62 * u, 44 * u, { shadow: hot ? S.accent : set[0], maxW: slot * 0.92, grow: clamp((q - 0.25) / 0.5), t });
    }
  }

  // ---- object: a device with a swirl screen, three dials and noodle callouts --------------------------
  function knob(ctx, S, x, y, r, color, angle) {
    const k = P(S).inks;
    scallop(ctx, x, y, r * 1.18, 10, 0.12, angle * 0.3); inked(ctx, S, k.yellow, LW(S) * 0.7);
    circle(ctx, x, y, r * 0.86); inked(ctx, S, color, LW(S) * 0.7);
    ctx.save(); ctx.lineCap = "round"; ctx.strokeStyle = P(S).ink; ctx.lineWidth = Math.max(4, r * 0.2);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(angle) * r * 0.66, y + Math.sin(angle) * r * 0.66); ctx.stroke();
    ctx.restore();
    circle(ctx, x, y, r * 0.2); inked(ctx, S, P(S).cream, LW(S) * 0.5);
    shine(ctx, S, x, y, r * 0.8);
  }
  function object(ctx, S, box, p, d, info) {
    const u = S.u, t = info.t, k = P(S).inks, phone = d.kind === "phone";
    let w, h, cx, cy;
    if (phone) {
      w = S.tall ? box.w * 0.38 : Math.min(box.w * 0.24, box.h * 0.5); h = w * 1.9;
      cx = box.x + box.w * (S.tall ? 0.28 : 0.3); cy = box.y + box.h * (S.tall ? 0.42 : 0.5);
    } else {
      w = S.tall ? box.w * 0.86 : Math.min(box.w * 0.48, box.h * 1.15); h = w * 0.6;
      cx = box.x + (S.tall ? box.w * 0.5 : box.w * 0.3); cy = box.y + (S.tall ? box.h * 0.26 : box.h * 0.44);
    }
    const q = pop(clamp(p * 1.6));
    // Once built, the dials are turned one at a time: Look, then Colour, then Timing, round again.
    // Each turn changes the screen: Look swaps the pattern, Colour the inks, Timing rushes the rings.
    const ph = Math.max(0, info.local - 1.5) * 0.85, kk = Math.floor(ph), act = ph > 0 ? kk % 3 : -1, f = ph % 1;
    const turns = (i) => (kk > i ? Math.floor((kk - 1 - i) / 3) + 1 : 0) + (act === i ? easeInOut(f / 0.8) : 0);
    const settled = (i) => Math.floor(turns(i) + 0.5);
    // Behind it: a rainbow bullseye with a scalloped rim, turning, and orbiting sparkles.
    const R = Math.max(w, h) * 0.78 * ease(p * 2);
    const rings = [k.pink, k.orange, k.yellow, k.lime, k.blue, k.purple];
    for (let i = 0; i < rings.length; i++) {
      const rr = R * (1 - i * 0.13);
      if (rr <= 0) continue;
      scallop(ctx, cx, cy, rr, 18 - i * 2, 0.07, t * (i % 2 ? 0.35 : -0.35)); inked(ctx, S, rings[i], LW(S) * 0.7);
    }
    for (let i = 0; i < 6; i++) { const a = t * 0.7 + (i / 6) * TAU; sparkle(ctx, S, cx + Math.cos(a) * R * 1.08, cy + Math.sin(a) * R * 1.08, 24 * u, [k.yellow, k.cream, k.lime][i % 3] || P(S).cream, t * 2 + i); }
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(Math.sin(t * 1.4) * 0.025); ctx.scale(q, q); ctx.translate(-cx, -cy);
    const x = cx - w / 2, y = cy - h / 2;
    const bodyPath = () => { ctx.beginPath(); ctx.roundRect(x, y, w, h, (phone ? 0.16 : 0.06) * w); };
    sticker(ctx, S, bodyPath, P(S).cream, k.purple, 14 * u);
    const pad = (phone ? 0.08 : 0.05) * w;
    const sx = x + pad, sy = y + pad * (phone ? 1.6 : 1), sw = w - pad * 2, sh = h - pad * (phone ? 3.2 : 2);
    ctx.save();
    ctx.beginPath(); ctx.roundRect(sx, sy, sw, sh, 0.05 * w); ctx.clip();
    // The screen: a little ring field of its own, flowing out from the top.
    const scx = sx + sw * (phone || S.tall ? 0.5 : 0.36), scy = sy + sh * (phone ? 0.2 : S.tall ? 0.3 : 0.5), ringW = 26 * u;
    const inksets = [[k.purple, k.pink, k.orange, k.yellow], [k.blue, k.lime, k.teal, k.yellow], [k.red, k.orange, k.yellow, k.pink]];
    const sc = inksets[settled(1) % 3], mode = settled(0) % 3;
    const travel = t * 60 * u + ringW * 5 * turns(2);
    const off = travel % (ringW * sc.length), shift = Math.floor(travel / ringW);
    ctx.fillStyle = sc[0]; ctx.fillRect(sx, sy, sw, sh);
    for (let r = Math.hypot(sw, sh) + ringW * 4 + off, j = 0; r > 0; r -= ringW, j++) {
      if (mode === 0) circle(ctx, scx + Math.sin(t + r / (90 * u)) * 10 * u, scy, r);
      else if (mode === 1) scallop(ctx, scx, scy, r, 12, 0.12, t * 0.6 + r * 0.004);
      else { ctx.beginPath(); ctx.ellipse(scx, scy, r * 1.3, r * 0.8, t * 0.4 + r * 0.003, 0, TAU); }
      ctx.fillStyle = sc[((j - shift) % sc.length + sc.length) % sc.length]; ctx.fill();
      ctx.lineWidth = 2.5 * u; ctx.strokeStyle = P(S).ink; ctx.stroke();
    }
    // A bright flash across the screen at the middle of each turn.
    if (act >= 0 && f < 0.8) { ctx.fillStyle = `rgba(255,255,255,${(0.45 * Math.sin((f / 0.8) * Math.PI)).toFixed(3)})`; ctx.fillRect(sx, sy, sw, sh); }
    ctx.restore();
    ctx.beginPath(); ctx.roundRect(sx, sy, sw, sh, 0.05 * w); inked(ctx, S, null, LW(S));
    if (phone) { pill(ctx, cx - w * 0.14, y + pad * 0.45, w * 0.28, pad * 0.6); inked(ctx, S, P(S).ink, 2 * u); }
    else {
      // The base of the laptop: a keyboard deck with a row of round keys.
      const by = y + h, bh = h * 0.14;
      ctx.beginPath(); ctx.moveTo(x - w * 0.07, by + bh); ctx.lineTo(x + w * 1.07, by + bh); ctx.lineTo(x + w * 1.02, by); ctx.lineTo(x - w * 0.02, by); ctx.closePath();
      inked(ctx, S, k.pink);
      for (let i = 0; i < 9; i++) { circle(ctx, x + w * (0.1 + i * 0.1), by + bh * 0.5, bh * 0.2); inked(ctx, S, P(S).cream, 2.5 * u); }
    }
    // Three dials on the screen, each sweeping as if being tuned.
    const kr = phone ? sw * 0.17 : sh * 0.12;
    const anchors = [];
    const knobColors = [k.pink, k.lime, k.blue];
    for (let i = 0; i < 3; i++) {
      const kq = pop(stag(p, i, 3, 0.5));
      const rowKnobs = !phone && S.tall;
      const kx = phone ? sx + sw * 0.5 : rowKnobs ? sx + sw * (0.2 + i * 0.3) : sx + sw * 0.8, ky = phone ? sy + sh * (0.5 + i * 0.17) : rowKnobs ? sy + sh * 0.74 : sy + sh * (0.2 + i * 0.3);
      anchors.push([kx, ky]);
      if (kq <= 0) continue;
      const hot = act === i ? Math.sin(clamp(f / 0.8) * Math.PI) : 0;
      if (hot > 0) { for (let j = 0; j < 8; j++) { const a = (j / 8) * TAU + t * 2; sparkle(ctx, S, kx + Math.cos(a) * kr * 1.7, ky + Math.sin(a) * kr * 1.7, 13 * u * hot, [k.yellow, P(S).cream][j % 2], t * 3 + j); } }
      knob(ctx, S, kx, ky, kr * kq * (1 + 0.22 * hot), knobColors[i], -Math.PI * 0.75 + i * 0.9 + turns(i) * Math.PI * 0.9 + Math.sin(t * 1.6 + i * 2) * 0.12);
    }
    ctx.restore();
    // Map the anchors through the device's swell so the noodles meet the dials.
    const mapped = anchors.map(([ax, ay]) => {
      const a = Math.sin(t * 1.4) * 0.025, dx = (ax - cx) * q, dy = (ay - cy) * q;
      return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
    });
    const labelX = phone ? (S.tall ? box.x + box.w * 0.56 : box.x + box.w * 0.55) : (S.tall ? box.x + box.w * 0.08 : box.x + box.w * 0.64);
    const spots = d.callouts.map((label, i) => {
      const c = stag(p, i, 3, 0.45);
      const tallRow = S.tall && !phone;
      const ly = tallRow ? box.y + box.h * (0.6 + i * 0.13) : box.y + box.h * (0.16 + i * 0.32);
      const tx = tallRow ? mapped[i][0] : labelX + Math.sin(i * 1.7) * 30 * u;
      const hot = act === i ? Math.sin(clamp(f / 0.8) * Math.PI) : 0;
      return { label, c, hot, ly: ly + Math.sin(t * 2 + i * 1.3) * 8 * u - 18 * u * hot, tx, align: tallRow ? "center" : "left" };
    });
    spots.forEach((o, i) => { if (o.c > 0 && o.label) noodle(ctx, S, mapped[i][0], mapped[i][1], o.tx, o.ly, ease(o.c * 1.3), knobColors[i], t, i * 2); });
    spots.forEach((o, i) => {
      if (o.c <= 0 || !o.label) return;
      circle(ctx, mapped[i][0], mapped[i][1], 9 * u); inked(ctx, S, P(S).cream, 3 * u);
      if (o.c > 0.4) {
        // Keep centred labels inside the frame; leave room for the ribbon tails.
        let x = o.tx + (o.align === "left" ? 40 * u : 0);
        if (o.align === "center") { ctx.save(); ctx.font = font(S, "figures", 50 * u); const hw = (ctx.measureText(o.label).width + 45 * u) / 2 + 60 * u; ctx.restore(); x = clamp(x, box.x + hw, box.x + box.w - hw); }
        tag(ctx, S, o.label, x, o.ly, 50 * u * (1 + 0.12 * o.hot), { align: o.align, shadow: knobColors[i], maxW: o.align === "center" ? box.w - 120 * u : S.W - x - 110 * u, grow: (o.c - 0.4) / 0.6, t });
      }
    });
  }

  // ---- people: groovy folk dancing on a striped hill ---------------------------------------------------
  // An original dancing figure: a bell poncho with its own print, one of four hair styles, one of
  // three poses and one of five expressions. `jump` is its turn in the dance.
  function figure(ctx, S, cx, base, size, i, t, q, hot, jump = 0) {
    const u = S.u, k = P(S).inks, ink = P(S).ink, cream = P(S).cream;
    const bodies = [k.orange, k.purple, k.teal, k.red, k.blue, k.lime];
    const trims = [k.yellow, k.lime, k.pink, k.yellow, k.orange, k.pink];
    const hairs = [k.purple, k.orange, "#5a2a12", k.pink, "#2a1608", k.yellow];
    const skin = P(S).skin[i % P(S).skin.length];
    const body = hot ? S.accent : bodies[i % bodies.length], trim = trims[i % trims.length], hair = hairs[i % hairs.length];
    const bob = -Math.abs(Math.sin(t * 3.1 + i * 1.1)) * size * 0.07 - jump * size * 0.18;
    const sway = Math.sin(t * 1.55 + i * 0.9) * 0.09;
    ctx.save();
    ctx.translate(cx, base + (1 - pop(q)) * size * 0.5);
    ctx.scale(pop(q), pop(q));
    ctx.translate(0, bob); ctx.rotate(sway);
    // Squash a little on landing, stretch while in the air.
    ctx.scale(1 - jump * 0.04, 1 + jump * 0.05);
    const sh = -size * 0.56, bw = size * 0.66, hr = size * 0.17, hy = sh - hr * 0.95;
    const pose = i % 3;
    for (const side of [-1, 1]) {
      const wave = Math.sin(t * 4.2 + i * 1.3 + side * 1.2);
      let ex, ey, mx, my;
      if (pose === 0 || jump > 0.3) { ex = side * bw * (0.62 + 0.12 * wave); ey = sh - size * (0.32 + 0.1 * jump) + wave * size * 0.16; mx = side * bw * 0.7; my = sh + size * 0.02; }
      else if (pose === 1 && side > 0) { ex = bw * 0.36; ey = sh + size * 0.3; mx = bw * 0.72; my = sh + size * 0.12; } // hand on hip
      else if (pose === 1) { ex = -bw * (0.5 + 0.15 * wave); ey = sh - size * 0.36 + wave * size * 0.12; mx = -bw * 0.62; my = sh - size * 0.02; }
      else { ex = side * bw * (0.8 + 0.1 * wave); ey = sh + size * (0.02 + 0.2 * wave * side); mx = side * bw * 0.5; my = sh + size * 0.12; } // out to the sides
      ctx.save(); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(side * bw * 0.22, sh + size * 0.08); ctx.quadraticCurveTo(mx, my, ex, ey);
      ctx.strokeStyle = ink; ctx.lineWidth = size * 0.11 + LW(S) * 1.6; ctx.stroke();
      ctx.strokeStyle = trim; ctx.lineWidth = size * 0.11; ctx.stroke();
      ctx.strokeStyle = hexA(ink, 0.35); ctx.lineWidth = 2.5 * u; ctx.setLineDash([size * 0.02, size * 0.03]); ctx.stroke();
      ctx.restore();
      circle(ctx, ex, ey, size * 0.055); inked(ctx, S, skin, LW(S) * 0.7);
    }
    const bodyPath = () => {
      ctx.beginPath();
      ctx.moveTo(-bw / 2, 0); ctx.quadraticCurveTo(-bw * 0.42, sh * 0.5, -bw * 0.26, sh + size * 0.04);
      ctx.quadraticCurveTo(0, sh - size * 0.06, bw * 0.26, sh + size * 0.04);
      ctx.quadraticCurveTo(bw * 0.42, sh * 0.5, bw / 2, 0); ctx.quadraticCurveTo(0, size * 0.05, -bw / 2, 0); ctx.closePath();
    };
    bodyPath(); ctx.fillStyle = body; ctx.fill();
    ctx.save(); bodyPath(); ctx.clip();
    const print = i % 4;
    if (print === 0) {
      for (let s2 = 0; s2 < 3; s2++) {
        const y = sh * (0.2 + s2 * 0.28);
        ctx.beginPath();
        for (let x = -bw; x <= bw; x += 6) ctx.lineTo(x, y + Math.sin(x / (size * 0.06) + t * 3 + s2) * size * 0.018);
        for (let x = bw; x >= -bw; x -= 6) ctx.lineTo(x, y + size * 0.05 + Math.sin(x / (size * 0.06) + t * 3 + s2) * size * 0.018);
        ctx.closePath(); ctx.fillStyle = s2 === 1 ? cream : trim; ctx.fill(); ctx.lineWidth = 2.5 * u; ctx.strokeStyle = ink; ctx.stroke();
      }
    } else if (print === 1) { // polka dots
      for (let r = 0; r < 6; r++) for (let c = -4; c <= 4; c++) {
        const x = c * size * 0.11 + (r % 2) * size * 0.055, y = -size * 0.06 - r * size * 0.09;
        circle(ctx, x, y, size * 0.026); inked(ctx, S, r % 2 ? trim : cream, 2 * u);
      }
    } else if (print === 2) { // chevrons
      for (let r = 0; r < 4; r++) {
        const y = -size * 0.06 - r * size * 0.12;
        ctx.beginPath();
        for (let x = -bw, z = 0; x <= bw; x += size * 0.07, z++) ctx.lineTo(x, y + (z % 2 ? -1 : 1) * size * 0.03);
        ctx.save(); ctx.lineJoin = "miter"; ctx.strokeStyle = ink; ctx.lineWidth = size * 0.05; ctx.stroke(); ctx.strokeStyle = r % 2 ? cream : trim; ctx.lineWidth = size * 0.03; ctx.stroke(); ctx.restore();
      }
    } else { // daisies
      const rr = rng(40 + i);
      for (let f = 0; f < 7; f++) {
        const x = (rr() - 0.5) * bw * 0.9, y = sh * (0.12 + rr() * 0.8);
        scallop(ctx, x, y, size * 0.045, 5, 0.5, t * 0.5 + f); inked(ctx, S, cream, 2 * u);
        circle(ctx, x, y, size * 0.014); ctx.fillStyle = trim; ctx.fill();
      }
    }
    // Fringe along the hem and a collar.
    ctx.save(); ctx.strokeStyle = ink; ctx.lineWidth = 2.5 * u; ctx.lineCap = "round";
    for (let x = -bw * 0.46; x <= bw * 0.46; x += size * 0.035) { ctx.beginPath(); ctx.moveTo(x, -size * 0.015); ctx.lineTo(x + Math.sin(t * 4 + x) * 2 * u, -size * 0.055); ctx.stroke(); }
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(-bw * 0.2, sh + size * 0.03); ctx.quadraticCurveTo(0, sh + size * 0.14, bw * 0.2, sh + size * 0.03); ctx.quadraticCurveTo(0, sh + size * 0.05, -bw * 0.2, sh + size * 0.03); inked(ctx, S, trim, 2.5 * u);
    ctx.restore();
    bodyPath(); inked(ctx, S, null);
    // Hair behind the head, one of four styles, with strand lines.
    const style = i % 4;
    const strands = (fn) => { ctx.save(); ctx.strokeStyle = hexA(ink, 0.6); ctx.lineWidth = 2.5 * u; ctx.lineCap = "round"; fn(); ctx.restore(); };
    if (style === 0) {
      scallop(ctx, 0, hy - hr * 0.15, hr * 1.62, 11, 0.16, t * 0.2); inked(ctx, S, hair);
      strands(() => { for (let a = 0; a < 11; a++) { const an = t * 0.2 + (a / 11) * TAU; ctx.beginPath(); ctx.arc(Math.cos(an) * hr * 1.3, hy - hr * 0.15 + Math.sin(an) * hr * 1.3, hr * 0.18, an + 1, an + 3); ctx.stroke(); } });
    } else if (style === 1) {
      ctx.beginPath(); ctx.moveTo(-hr * 1.15, hy + hr * 1.6);
      for (let y = hy + hr * 1.6; y > hy - hr * 0.2; y -= 4) ctx.lineTo(-hr * 1.15 + Math.sin(y / (hr * 0.25) + t * 2) * hr * 0.12, y);
      ctx.arc(0, hy - hr * 0.1, hr * 1.18, Math.PI, 0);
      for (let y = hy - hr * 0.2; y < hy + hr * 1.6; y += 4) ctx.lineTo(hr * 1.15 + Math.sin(y / (hr * 0.25) + t * 2 + 1) * hr * 0.12, y);
      ctx.closePath(); inked(ctx, S, hair);
      strands(() => { for (const sd of [-1, 1]) for (let l = 0; l < 2; l++) { ctx.beginPath(); for (let y = hy + hr * 0.2; y < hy + hr * 1.5; y += 4) ctx.lineTo(sd * hr * (0.95 - l * 0.12) + Math.sin(y / (hr * 0.25) + t * 2 + l) * hr * 0.08, y); ctx.stroke(); } });
    } else if (style === 2) {
      ctx.beginPath(); ctx.ellipse(0, hy - hr * 0.9, hr * 1.0, hr * 1.5, 0, 0, TAU); inked(ctx, S, hair);
      ctx.save(); ctx.beginPath();
      for (let s2 = 0; s2 < 60; s2++) { const a = s2 * 0.32, r = hr * 0.9 * (1 - s2 / 60); const px = Math.cos(a + t) * r * 0.8, py = hy - hr * 1.0 + Math.sin(a + t) * r; if (s2) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
      ctx.strokeStyle = ink; ctx.lineWidth = 3 * u; ctx.stroke(); ctx.restore();
    } else {
      circle(ctx, 0, hy - hr * 0.18, hr * 1.14); inked(ctx, S, hair);
    }
    circle(ctx, 0, hy, hr); inked(ctx, S, skin);
    if (style === 3) { // a headband with three small blossoms
      ctx.beginPath(); ctx.arc(0, hy + hr * 0.1, hr * 1.02, Math.PI * 1.08, Math.PI * 1.92); ctx.save(); ctx.lineCap = "round"; ctx.strokeStyle = ink; ctx.lineWidth = hr * 0.34; ctx.stroke(); ctx.strokeStyle = k.lime; ctx.lineWidth = hr * 0.2; ctx.stroke(); ctx.restore();
      for (let f = -1; f <= 1; f++) { const a = -Math.PI / 2 + f * 0.62; scallop(ctx, Math.cos(a) * hr * 1.02, hy + hr * 0.1 + Math.sin(a) * hr * 1.02, hr * 0.3, 5, 0.45, t); inked(ctx, S, [k.pink, k.yellow, k.orange][f + 1], 2.5 * u); }
    }
    // Gloss on the head.
    ctx.save(); ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = Math.max(3, hr * 0.1); ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(0, hy, hr * 0.74, Math.PI * 1.15, Math.PI * 1.4); ctx.stroke(); ctx.restore();
    // Face: five expressions; the highlight beams with closed eyes and a big grin.
    const face = hot ? 5 : i % 5;
    ctx.save(); ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineCap = "round"; ctx.lineWidth = Math.max(3, hr * 0.12);
    const dotEye = (x) => { circle(ctx, x, hy - hr * 0.08, hr * 0.12); ctx.fillStyle = ink; ctx.fill(); circle(ctx, x + hr * 0.04, hy - hr * 0.12, hr * 0.04); ctx.fillStyle = "#ffffff"; ctx.fill(); ctx.fillStyle = ink; };
    const arcEye = (x) => { ctx.beginPath(); ctx.arc(x, hy - hr * 0.02, hr * 0.16, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); };
    const grin = () => { ctx.beginPath(); ctx.arc(0, hy + hr * 0.14, hr * 0.42, 0.1 * Math.PI, 0.9 * Math.PI); ctx.closePath(); ctx.fillStyle = "#ffffff"; ctx.fill(); ctx.stroke(); ctx.fillStyle = ink; };
    if (face === 0) { dotEye(-hr * 0.38); dotEye(hr * 0.38); ctx.beginPath(); ctx.arc(0, hy + hr * 0.18, hr * 0.36, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke(); }
    else if (face === 1) { arcEye(-hr * 0.38); arcEye(hr * 0.38); ctx.beginPath(); ctx.ellipse(0, hy + hr * 0.45, hr * 0.17, hr * (0.2 + 0.06 * Math.sin(t * 6 + i)), 0, 0, TAU); ctx.fillStyle = ink; ctx.fill(); ctx.beginPath(); ctx.ellipse(0, hy + hr * 0.55, hr * 0.1, hr * 0.06, 0, 0, TAU); ctx.fillStyle = k.pink; ctx.fill(); }
    else if (face === 2) { dotEye(-hr * 0.38); dotEye(hr * 0.38); grin(); }
    else if (face === 3) { dotEye(-hr * 0.38); arcEye(hr * 0.38); ctx.beginPath(); ctx.arc(0, hy + hr * 0.18, hr * 0.36, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke(); ctx.beginPath(); ctx.ellipse(hr * 0.08, hy + hr * 0.52, hr * 0.1, hr * 0.12, 0, 0, Math.PI); ctx.fillStyle = k.pink; ctx.fill(); ctx.stroke(); }
    else if (face === 4) { for (const x of [-hr * 0.38, hr * 0.38]) { ctx.restore(); sparkle(ctx, S, x, hy - hr * 0.08, hr * 0.2, k.yellow, t * 2); ctx.save(); ctx.strokeStyle = ink; ctx.lineCap = "round"; ctx.lineWidth = Math.max(3, hr * 0.12); } grin(); }
    else { arcEye(-hr * 0.38); arcEye(hr * 0.38); grin(); }
    for (const side of [-1, 1]) { circle(ctx, side * hr * 0.62, hy + hr * 0.3, hr * 0.15); ctx.fillStyle = hexA(k.pink, 0.75); ctx.fill(); }
    ctx.restore();
    ctx.restore();
  }
  function people(ctx, S, box, p, d, info) {
    const u = S.u, t = info.t, k = P(S).inks;
    const n = Math.max(2, Math.min(6, Math.round(d.count)));
    const base = box.y + box.h * 0.94;
    floaters(ctx, S, { x: box.x - 60 * u, y: box.y - 60 * u, w: box.w + 120 * u, h: box.h * 0.9 }, t, 77, 9, ["heart", "spark", "spark"]);
    const rows = S.tall && n > 3 ? 2 : 1;
    const slot = box.w / Math.ceil(n / rows);
    // Leave headroom for the speech balloons above the (back-row) heads.
    const head = 64 * u + 70 * u;
    const size = Math.min(rows > 1 ? (box.h * 0.94 - head) / 2.62 : (box.h * 0.94 - head) / 1.3, slot * (rows > 1 ? 0.95 : 1.1));
    const hi = Math.min(n - 1, d.highlight);
    // Where each figure stands: in tall frames a back row stands up the hill behind the front row.
    const spot = (i) => {
      if (rows === 1) return { cx: box.x + slot * (i + 0.5), base, back: false };
      const back = i % 2 === 1, idx = Math.floor(i / 2), count = back ? Math.floor(n / 2) : Math.ceil(n / 2);
      const w = box.w / count;
      return { cx: box.x + w * (idx + 0.5) + (back ? w * 0.12 : -w * 0.06), base: back ? base - size * 1.36 : base, back };
    };
    const order = [...Array(n).keys()].sort((a, b) => (spot(b).back ? 1 : 0) - (spot(a).back ? 1 : 0));
    const frontHill = () => flat(ctx, () => ground(ctx, S, base - 10 * u, t, [k.lime, k.blue, k.yellow, k.pink], 12 * u));
    if (rows > 1) flat(ctx, () => ground(ctx, S, base - size * 1.36 - 10 * u, t + 1.7, [k.orange, k.purple, k.teal], 10 * u));
    else frontHill();
    let hill = rows === 1;
    for (const i of order) {
      if (!hill && !spot(i).back) { frontHill(); hill = true; }
      const q = stag(p, i, n, 0.5), hot = i === hi;
      if (q <= 0) continue;
      const { cx, base } = spot(i);
      const sz = size * (hot ? 1.1 : 1);
      if (hot) { // a sunburst halo behind the one in the spotlight
        const hy = base - sz * 0.56 - sz * 0.17 * 0.95;
        const r = sz * 0.5 * pop(q);
        burst(ctx, S, cx, hy, r * 0.45, r, 18, t * 0.5, [k.yellow, S.accent, k.lime], 0.32);
      }
      figure(ctx, S, cx, base, sz, i, t, q, hot, turn(t, i, n, p));
    }
    if (!hill) frontHill();
    // Speech-bubble badges over the first three heads.
    for (let i = 0; i < Math.min(3, n); i++) {
      const q = stag(p, i, n, 0.5), label = d.badges[i];
      if (q < 0.75 || !label) continue;
      const hot = i === hi, sz = size * (hot ? 1.1 : 1);
      const { cx, base: b0 } = spot(i), by = b0 - sz * 1.2 - 64 * u + Math.sin(t * 2.4 + i) * 10 * u - sz * 0.15 * turn(t, i, n, p);
      tag(ctx, S, label, cx, by, 46 * u, { tail: true, shadow: hot ? S.accent : [k.blue, k.purple, k.orange][i % 3], maxW: Math.max(slot * 1.1, 220 * u), grow: (q - 0.75) / 0.25, t: t + i });
    }
  }

  // ---- process: three medallions along a rainbow road ---------------------------------------------------
  function stepIcon(ctx, S, kind, x, y, s, t) {
    const k = P(S).inks, u = S.u;
    if (kind === 0) { // a film reel with a trailing strip
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.8);
      circle(ctx, 0, 0, s * 0.42); inked(ctx, S, k.blue);
      for (let h = 0; h < 5; h++) { const a = (h / 5) * TAU; circle(ctx, Math.cos(a) * s * 0.24, Math.sin(a) * s * 0.24, s * 0.08); inked(ctx, S, P(S).cream, 3 * u); }
      circle(ctx, 0, 0, s * 0.07); inked(ctx, S, k.yellow, 3 * u);
      circle(ctx, 0, 0, s * 0.36); ctx.save(); ctx.setLineDash([2 * u, 7 * u]); inked(ctx, S, null, 2.5 * u); ctx.restore();
      ctx.restore();
      shine(ctx, S, x, y, s * 0.5);
    } else if (kind === 1) { // a card with a sparkle
      ctx.save(); ctx.translate(x, y); ctx.rotate(-0.12 + Math.sin(t * 2) * 0.05);
      ctx.beginPath(); ctx.roundRect(-s * 0.36, -s * 0.28, s * 0.72, s * 0.56, s * 0.08); inked(ctx, S, k.lime);
      ctx.beginPath(); ctx.roundRect(-s * 0.36 + 6 * u, -s * 0.28 + 6 * u, s * 0.72 - 12 * u, s * 0.14, s * 0.04); inked(ctx, S, k.pink, 3 * u);
      for (let l = 0; l < 3; l++) { ctx.beginPath(); ctx.moveTo(-s * 0.22, -s * 0.02 + l * s * 0.1); ctx.lineTo(s * (0.2 - l * 0.08), -s * 0.02 + l * s * 0.1); inked(ctx, S, null, 4 * u); }
      ctx.save(); ctx.strokeStyle = "rgba(255,250,235,0.85)"; ctx.lineWidth = 4 * u; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-s * 0.3, s * 0.2); ctx.lineTo(-s * 0.3, -s * 0.05); ctx.stroke(); ctx.restore();
      ctx.restore();
      sparkle(ctx, S, x + s * 0.34, y - s * 0.3, s * 0.2, k.yellow, t * 2);
    } else { // a swelling check
      ctx.save(); ctx.translate(x, y); const sc = 1 + Math.sin(t * 3) * 0.05; ctx.scale(sc, sc);
      ctx.beginPath(); ctx.moveTo(-s * 0.34, 0); ctx.lineTo(-s * 0.1, s * 0.24); ctx.lineTo(s * 0.36, -s * 0.26);
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.strokeStyle = P(S).ink; ctx.lineWidth = s * 0.24; ctx.stroke(); ctx.strokeStyle = S.accent; ctx.lineWidth = s * 0.13; ctx.stroke();
      ctx.restore();
    }
  }
  function process(ctx, S, box, p, d, info) {
    const u = S.u, t = info.t, k = P(S).inks, n = d.steps.length;
    const tall = S.tall;
    const R = tall ? Math.min(box.w * 0.18, box.h / n * 0.32) : Math.min(box.w / n * 0.29, box.h * 0.31);
    const centers = d.steps.map((_, i) => tall
      ? [box.x + box.w * (i % 2 ? 0.74 : 0.26), box.y + box.h * ((i + 0.5) / n) - 30 * u]
      : [box.x + box.w * ((i + 0.5) / n), box.y + box.h * 0.4 + (i % 2 ? 40 : -20) * u]);
    const pts = tall
      ? [[centers[0][0] - box.w * 0.5, box.y - 200 * u], ...centers, [centers[n - 1][0] + box.w * 0.5, S.H + 200 * u]]
      : [[-120 * u, centers[0][1] + 140 * u], ...centers, [S.W + 120 * u, centers[n - 1][1] - 120 * u]];
    const sp = spline(pts, 30);
    const reveal = ease(p * 1.15) * sp.total;
    tube(ctx, S, sp, reveal, 74 * u, [k.purple, k.blue, k.lime, k.yellow, k.orange, k.pink]);
    // Marching dashes down the middle of the road.
    if (reveal > 0) {
      ctx.save(); polyTo(ctx, sp, reveal); ctx.setLineDash([22 * u, 26 * u]); ctx.lineDashOffset = -t * 90 * u;
      ctx.lineCap = "round"; ctx.strokeStyle = P(S).cream; ctx.lineWidth = 7 * u; ctx.stroke(); ctx.restore();
    }
    // Station positions along the road, so each pops in as the road arrives.
    const at = centers.map((c) => { let best = 0, bd = 1e9; sp.pts.forEach((q, i) => { const dd = Math.hypot(q[0] - c[0], q[1] - c[1]); if (dd < bd) { bd = dd; best = sp.len[i]; } }); return best; });
    const medal = [[k.pink, k.yellow], [k.orange, k.lime], [S.accent, k.yellow]];
    // Once the road is built, a card token travels it station to station and ends in a check stamp,
    // on a 3-second loop: stops at each station, glides between them, then the stamp lands on the last.
    const live = Math.max(0, info.local - 1.6), cyc = live % 3, on = live > 0;
    const legs = [[0, 0.3, 0, 0], [0.3, 0.9, 0, 1], [0.9, 1.2, 1, 1], [1.2, 1.8, 1, 2], [1.8, 3, 2, 2]];
    let tokenD = at[0];
    for (const [a0, a1, from, to] of legs) if (cyc >= a0 && cyc < a1) tokenD = at[Math.min(n - 1, from)] + (at[Math.min(n - 1, to)] - at[Math.min(n - 1, from)]) * easeInOut((cyc - a0) / (a1 - a0));
    centers.forEach(([x, y], i) => {
      const q = clamp((reveal - at[i] + R * 0.6) / (R * 2.2));
      if (q <= 0) return;
      const pz = on ? clamp(1 - Math.abs(tokenD - at[i]) / (R * 1.1)) : 0;
      const s = pop(q) * (1 + 0.12 * pz);
      const r = R * s;
      burst(ctx, S, x, y, r * 0.8, r * (1.32 + 0.12 * pz), 14, t * (i % 2 ? -0.5 : 0.5) + pz * 0.6, [medal[i % 3][1], medal[i % 3][0], P(S).cream], 0.28);
      scallop(ctx, x + 8 * u, y + 8 * u, r * 0.98, 14, 0.1, t * 0.3); inked(ctx, S, P(S).ink);
      scallop(ctx, x, y, r * 0.98, 14, 0.1, t * 0.3); inked(ctx, S, medal[i % 3][0]);
      // A ring of cream studs around the face, then the face with its own inner keyline.
      for (let j = 0; j < 14; j++) { const a = t * 0.3 + (j / 14) * TAU; circle(ctx, x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85, r * 0.045); inked(ctx, S, P(S).cream, 2 * u); }
      circle(ctx, x, y, r * 0.72); inked(ctx, S, P(S).cream);
      circle(ctx, x, y, r * 0.63); ctx.save(); ctx.setLineDash([3 * u, 9 * u]); ctx.lineCap = "round"; inked(ctx, S, null, 3 * u); ctx.restore();
      shine(ctx, S, x, y, r * 0.95, Math.PI * 1.05, Math.PI * 1.35);
      stepIcon(ctx, S, i === n - 1 ? 2 : i % 2, x, y, r * 1.05, t + i);
      // A numbered token on the rim.
      const nx = x - r * 0.78, ny = y - r * 0.72;
      circle(ctx, nx, ny, r * 0.3); inked(ctx, S, k.purple);
      bubbleText(ctx, S, String(i + 1), nx, ny + 2 * u, r * 0.42, P(S).cream, { drop: 0.04 });
      if (q > 0.35) {
        const lx = tall ? (i % 2 ? x - R * 1.5 : x + R * 1.5) : x, ly = tall ? y + Math.sin(t * 2 + i) * 5 * u : y + R * 1.45 + 40 * u + Math.sin(t * 2 + i) * 5 * u;
        tag(ctx, S, d.steps[i], lx, ly, 48 * u, { align: tall ? (i % 2 ? "right" : "left") : "center", shadow: medal[i % 3][0], maxW: tall ? box.w * 0.58 : box.w / n * 0.86, grow: (q - 0.35) / 0.65, t: t + i });
      }
    });
    if (on) {
      // The token: a little card riding the road, trailing sparkles; it fades as the stamp lands.
      const fade = 1 - clamp((cyc - 2.5) / 0.4), lead = along(sp, tokenD);
      for (let j = 4; j >= 1; j--) { const e = along(sp, tokenD - j * 30 * u); ctx.save(); ctx.globalAlpha *= fade * (1 - j * 0.2); sparkle(ctx, S, e[0], e[1], (24 - j * 3) * u, k.yellow, t * 4 + j); ctx.restore(); }
      ctx.save(); ctx.globalAlpha *= fade; ctx.translate(lead[0], lead[1] - 46 * u - Math.abs(Math.sin(t * 7)) * 10 * u); ctx.rotate(Math.sin(t * 5) * 0.15);
      ctx.beginPath(); ctx.roundRect(-38 * u, -27 * u, 76 * u, 54 * u, 9 * u); inked(ctx, S, P(S).cream);
      ctx.beginPath(); ctx.roundRect(-30 * u, -19 * u, 60 * u, 13 * u, 4 * u); inked(ctx, S, k.pink, 3 * u);
      for (let l = 0; l < 2; l++) { ctx.beginPath(); ctx.moveTo(-26 * u, 4 * u + l * 11 * u); ctx.lineTo((22 - l * 14) * u, 4 * u + l * 11 * u); inked(ctx, S, null, 4 * u); }
      ctx.restore();
      // The stamp slams down on the last station and holds, with a shock ring of sparkles.
      if (cyc >= 1.8 && cyc < 2.95) {
        const sq = clamp((cyc - 1.8) / 0.22), [x, y] = centers[n - 1], sz = R * 0.95 * (1.9 - 0.9 * pop(sq));
        const alpha = 1 - clamp((cyc - 2.7) / 0.25);
        ctx.save(); ctx.globalAlpha *= alpha * clamp(sq * 4);
        ctx.translate(x + R * 0.5, y - R * 0.45); ctx.rotate(-0.25);
        circle(ctx, 0, 0, sz * 0.62); inked(ctx, S, S.accent, LW(S) * 1.1);
        circle(ctx, 0, 0, sz * 0.5); ctx.save(); ctx.setLineDash([4 * u, 8 * u]); inked(ctx, S, null, 4 * u); ctx.restore();
        ctx.beginPath(); ctx.moveTo(-sz * 0.26, 0); ctx.lineTo(-sz * 0.06, sz * 0.2); ctx.lineTo(sz * 0.3, -sz * 0.22);
        ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = P(S).ink; ctx.lineWidth = sz * 0.2; ctx.stroke(); ctx.strokeStyle = P(S).cream; ctx.lineWidth = sz * 0.1; ctx.stroke();
        ctx.restore();
        if (sq >= 1) { const ring = clamp((cyc - 2.02) / 0.5); for (let j = 0; j < 10; j++) { const a = (j / 10) * TAU, rr = R * (0.9 + 1.0 * ease(ring)); ctx.save(); ctx.globalAlpha *= 1 - ring; sparkle(ctx, S, x + R * 0.5 + Math.cos(a) * rr, y - R * 0.45 + Math.sin(a) * rr, 20 * u, [k.yellow, P(S).cream, k.lime][j % 3], j); ctx.restore(); } }
      }
    }
  }

  // ---- compare: two rainbow-arch gauges --------------------------------------------------------------
  function gauge(ctx, S, cx, by, R, frac, q, colors, label, value, hot, t, d) {
    const u = S.u, k = P(S).inks;
    const bands = colors.length, inner = R * 0.42, bw = (R - inner) / bands;
    const sweep = Math.PI * clamp(frac) * d.sweep;
    // Offset shadow, then the empty cream track.
    ctx.beginPath(); ctx.arc(cx + 10 * u, by + 10 * u, R, Math.PI, 0); ctx.arc(cx + 10 * u, by + 10 * u, inner, 0, Math.PI, true); ctx.closePath(); inked(ctx, S, P(S).ink);
    ctx.beginPath(); ctx.arc(cx, by, R, Math.PI, 0); ctx.arc(cx, by, inner, 0, Math.PI, true); ctx.closePath(); inked(ctx, S, P(S).cream);
    for (let b = 0; b < bands; b++) {
      const r1 = R - b * bw, r0 = r1 - bw;
      const wob = Math.sin(t * 3 + b) * 0.02;
      ctx.beginPath(); ctx.arc(cx, by, r1, Math.PI, Math.PI + Math.max(0, sweep + wob)); ctx.arc(cx, by, r0, Math.PI + Math.max(0, sweep + wob), Math.PI, true); ctx.closePath();
      if (sweep > 0.01) inked(ctx, S, colors[b], LW(S) * 0.6);
    }
    ctx.beginPath(); ctx.arc(cx, by, R, Math.PI, 0); ctx.arc(cx, by, inner, 0, Math.PI, true); ctx.closePath(); inked(ctx, S, null, LW(S) * 1.1);
    // The needle: a pointer outside the rim riding the fill's edge, quivering once it arrives.
    if (sweep > 0.02) {
      const a = Math.PI + sweep + (d.sweep >= 1 ? Math.sin(t * 9) * 0.025 : 0);
      ctx.save(); ctx.translate(cx + Math.cos(a) * (R + 20 * u), by + Math.sin(a) * (R + 20 * u)); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(-26 * u, 0); ctx.lineTo(22 * u, -20 * u); ctx.quadraticCurveTo(34 * u, 0, 22 * u, 20 * u); ctx.closePath(); inked(ctx, S, hot ? S.accent : colors[0], LW(S) * 0.8);
      circle(ctx, 18 * u, 0, 7 * u); inked(ctx, S, P(S).cream, 3 * u);
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(cx, by, inner, Math.PI, 0); ctx.closePath(); inked(ctx, S, P(S).cream, LW(S) * 0.9);
    shine(ctx, S, cx, by, R * 0.97, Math.PI * 1.08, Math.PI * 1.32);
    // The number swells in the mouth of the arch; the label sits below.
    const shown = M().formatNumber(value * d.sweep, 0, d.prefix, d.suffix);
    bubbleText(ctx, S, shown, cx, by - inner * 0.4, Math.min(118 * u, inner * 0.88) * (1 + 0.1 * d.pulse), hot ? S.accent : colors[0], { baseline: "middle", maxW: inner * 1.9, dropColor: hot ? k.yellow : colors[2] });
    tag(ctx, S, label, cx, by + 66 * u, 48 * u, { shadow: hot ? S.accent : colors[1], maxW: R * 2.0, grow: clamp((q - 0.3) / 0.5), t });
  }
  function compare(ctx, S, box, p, d, info) {
    const u = S.u, t = info.t, k = P(S).inks;
    const vertical = box.h > box.w * 1.1;
    const max = Math.max(d.leftValue, d.rightValue, 1);
    const sets = [
      { label: d.left, value: d.leftValue, colors: [k.purple, k.blue, k.teal, k.lime], hot: false },
      { label: d.right, value: d.rightValue, colors: [k.pink, k.orange, k.yellow, k.lime], hot: true },
    ];
    const cells = sets.map((_, i) => vertical
      ? { cx: box.x + box.w / 2, cy: box.y + (box.h / 2) * i, w: box.w, h: box.h / 2 }
      : { cx: box.x + (box.w / 2) * (i + 0.5), cy: box.y, w: box.w / 2, h: box.h });
    sets.forEach((s, i) => {
      const q = stag(p, i, 2, 0.4);
      if (q <= 0) return;
      const c = cells[i];
      const R = Math.min(c.w * 0.4, c.h * 0.56) * pop(clamp(q * 1.6));
      const by = c.cy + c.h * (vertical ? 0.66 : 0.66);
      // Each fill sweeps up to its count over the first part of the hold.
      const sweep = easeInOut(clamp((info.local - 0.35 - i * 0.35) / 1.5));
      // The winner bounces once it has arrived; the other sways.
      const settledW = clamp((sweep - 0.98) * 50);
      const hop = s.hot ? -Math.abs(Math.sin(t * 3.4)) * 16 * u * settledW : 0;
      ctx.save(); ctx.translate(0, hop);
      if (!s.hot) { ctx.translate(c.cx, by); ctx.rotate(Math.sin(t * 1.8) * 0.02); ctx.translate(-c.cx, -by); }
      if (s.hot) { // the winning side gets a turning, pulsing sunburst and a pop of sparkles
        burst(ctx, S, c.cx, by - R * 0.2, R * 0.9, R * (1.32 + 0.1 * Math.sin(t * 4)), 22, t * 0.5, [k.yellow, S.accent, k.lime, k.orange], 0.3);
        const pq = clamp((q - 0.8) / 0.2);
        for (let j = 0; j < 7 && pq > 0; j++) { const a = Math.PI + (j / 6) * Math.PI, rr = R * (1.2 + 0.25 * ease(pq)); sparkle(ctx, S, c.cx + Math.cos(a) * rr, by - R * 0.2 + Math.sin(a) * rr, 22 * u * (1 - 0.4 * Math.sin(t * 5 + j)), [k.yellow, P(S).cream, k.lime][j % 3], t + j); }
      }
      gauge(ctx, S, c.cx, by, R, s.value / max, q, s.colors, s.label, s.value, s.hot, t, { ...d, sweep, pulse: settledW * Math.max(0, Math.sin(t * 3.4 + i * Math.PI)) });
      ctx.restore();
    });
    // A bulbous "vs" between them.
    const vq = pop(clamp(p * 2 - 0.4));
    if (vq > 0) {
      const vx = vertical ? box.x + box.w * 0.86 : box.x + box.w / 2, vy = vertical ? box.y + box.h * 0.5 : box.y + box.h * 0.5;
      ctx.save(); ctx.translate(vx, vy); ctx.rotate(-0.12 + Math.sin(t * 2) * 0.06); ctx.scale(vq, vq);
      scallop(ctx, 0, 0, 62 * u, 9, 0.18, t * 0.5); inked(ctx, S, k.yellow);
      bubbleText(ctx, S, "vs", 0, 2 * u, 56 * u, k.pink, { drop: 0.05 });
      ctx.restore();
    }
  }

  // ---- stage decor for the statement scenes ------------------------------------------------------------
  function titleDecor(ctx, S, info, vis) {
    const u = S.u, t = info.t, k = P(S).inks, m = Math.min(S.W, S.H);
    const corners = [[0, 0], [S.W, 0], [0, S.H], [S.W, S.H]];
    const sets = [[k.yellow, k.orange], [k.lime, k.blue], [k.orange, k.pink], [k.purple, k.yellow]];
    corners.forEach(([x, y], i) => {
      const r = m * 0.24 * pop(clamp(vis * 1.3 - i * 0.08));
      if (r <= 0) return;
      burst(ctx, S, x, y, r * 0.45, r * (1 + 0.06 * Math.sin(t * 3 + i)), 16, t * (i % 2 ? 0.7 : -0.7), sets[i], 0.32);
      scallop(ctx, x, y, r * 0.5, 12, 0.12, -t * 0.3); inked(ctx, S, P(S).cream);
      circle(ctx, x, y, r * 0.32); inked(ctx, S, sets[i][1]);
    });
    const r = rng(11);
    for (let i = 0; i < 10; i++) {
      const x = r() * S.W, y = r() * S.H, s = (18 + r() * 22) * u;
      if (Math.abs(x - S.W / 2) < S.W * 0.4 && Math.abs(y - S.H / 2) < S.H * 0.36) continue; // keep clear of the words
      const tw = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7);
      ctx.save(); ctx.globalAlpha *= vis; sparkle(ctx, S, x, y, s * (0.6 + tw * 0.6), [P(S).cream, k.yellow, k.lime][i % 3], t + i); ctx.restore();
    }
  }
  function closingDecor(ctx, S, info, vis) {
    const u = S.u, t = info.t, k = P(S).inks, W = S.W, H = S.H;
    // Rainbow arches rising from the lower corners.
    const arch = [k.pink, k.orange, k.yellow, k.lime, k.blue, k.purple];
    for (const [x, dir] of [[0, 1], [W, -1]]) {
      const R = Math.min(W, H) * 0.42 * pop(vis);
      for (let b = 0; b < arch.length; b++) {
        const r = R * (1 - b * 0.12);
        if (r <= 0) continue;
        circle(ctx, x, H + 20 * u, r); inked(ctx, S, arch[b], LW(S) * 0.8);
      }
      sparkle(ctx, S, x + dir * R * 0.5, H - R * 0.95, 30 * u, P(S).cream, t * 2);
    }
  }

  // Where each scene's hero sits (fractions of the frame), for the ripple change.
  const HERO = (S) => ({
    title: [0.5, 0.5], closing: [0.5, 0.5], chart: [0.62, 0.62], process: [0.5, 0.55], people: [0.5, 0.74],
    object: S.tall ? [0.5, 0.42] : [0.3, 0.58], compare: S.tall ? [0.5, 0.74] : [0.75, 0.66],
  });
  const M = () => window.DreamcutMotion;
  const base = scheme(ORIGINAL, "#2a0f3d", "#fff1d0");

  return {
    bg: "#ff2e93", panel: "#fff1d0", ink: "#2a0f3d", muted: "#5b2a7a", accent: "#ff2e93", onAccent: "#2a0f3d",
    rule: "rgba(42,15,61,0.9)", track: "rgba(42,15,61,0.12)",
    display: "'Cooper Black', 'Cooper Std', 'Bookman Old Style', 'ITC Bookman', Georgia, serif", displayWeight: 900, displayCase: "none", displayTracking: "-0.005em",
    body: "'Arial Rounded MT Bold', 'Arial Rounded MT', 'Avenir Next', 'Segoe UI', Arial, sans-serif", bodyWeight: 800,
    figures: "'Cooper Black', 'Cooper Std', 'Bookman Old Style', Georgia, serif", radius: 26, motion: "rise", change: "lift",
    kit: { line: 5, fill: "solid", panel: "fill" },
    keepArt: true,
    psy: base,
    palettes: {
      // Light: day-glo pastels. Dark: a blacklight poster, neon on black. Mono: one magenta ink on cream.
      light: { bg: "#ff9fcd", panel: "#fffaf0", ink: "#3b1d5e", muted: "#6b4a8e", accent: "#ff5fae", onAccent: "#3b1d5e", psy: scheme(PASTEL, "#3b1d5e", "#fffaf0", { headFill: "#fffaf0", closeFill: "#ff5fae" }) },
      dark: { bg: BLACK, panel: "#fff6e0", ink: "#05010a", muted: "#b14bff", accent: "#ff2bd6", onAccent: "#05010a", psy: scheme(NEON, "#05010a", "#fff6e0", {
        bands: {
          opening: ["#05010a"], title: [NEON.pink, BLACK, NEON.lime, BLACK], chart: [NEON.orange, BLACK, NEON.blue, BLACK], object: [NEON.yellow, BLACK, NEON.purple, BLACK],
          people: [NEON.pink, BLACK, NEON.lime, BLACK, NEON.blue, BLACK], process: [NEON.red, BLACK, NEON.lime, BLACK], compare: [NEON.blue, BLACK, NEON.pink, BLACK],
          closing: [NEON.pink, BLACK, NEON.yellow, BLACK, NEON.teal, BLACK],
        }, headFill: NEON.yellow, closeFill: NEON.pink }) },
      mono: { bg: MONO.pink, panel: MONO_PAPER, ink: "#3a0622", muted: "#8a0c4b", accent: "#c8156e", onAccent: MONO_PAPER, psy: scheme(MONO, "#3a0622", MONO_PAPER, {
        skin: ["#ffd9ea", "#f2a1c6", "#e0569a"],
        bands: {
          opening: ["#3a0622"], title: [MONO.pink, MONO_PAPER], chart: [MONO.blue, MONO.yellow, MONO.orange, MONO.yellow], object: [MONO.pink, MONO_PAPER],
          people: [MONO.pink, MONO_PAPER, MONO.lime, MONO_PAPER, MONO.blue, MONO_PAPER], process: [MONO.orange, MONO_PAPER], compare: [MONO.blue, MONO.yellow, MONO.pink, MONO.yellow],
          closing: [MONO.pink, MONO_PAPER, MONO.orange, MONO_PAPER, MONO.blue, MONO_PAPER],
        }, headFill: MONO_PAPER, closeFill: MONO.pink }) },
    },
    // Headlines are lettered on the canvas; the DOM copies stay in the page as the source of the words.
    css: () => `#root .display, #root .kicker { opacity: 0 !important; }`,
    backdrop: (accent, texture, look) => (look ? look.psy.bands.title[0] : "#ff2e93"),
    // Over everything: fixed paper grain and a soft inked vignette.
    paintOver: true,
    paint: (ctx, W, H, t, accent, look) => {
      ctx.clearRect(0, 0, W, H);
      if (!look._grain) {
        const c = document.createElement("canvas"); c.width = c.height = 256;
        const g = c.getContext("2d"), img = g.createImageData(256, 256), r = rng(7);
        for (let i = 0; i < 256 * 256; i++) {
          const v = r(), dark = v < 0.5;
          img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = dark ? 20 : 255;
          img.data[i * 4 + 3] = Math.floor(Math.abs(v - 0.5) * 2 * 70);
        }
        g.putImageData(img, 0, 0);
        look._grain = c;
      }
      // The grain belongs to the paper, so it stays put while the inks move over it.
      ctx.save();
      ctx.scale(2, 2);
      ctx.fillStyle = ctx.createPattern(look._grain, "repeat");
      ctx.globalAlpha = 0.2;
      ctx.fillRect(0, 0, W / 2 + 256, H / 2 + 256);
      ctx.restore();
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.56);
      v.addColorStop(0, hexA(look.psy.ink, 0)); v.addColorStop(1, hexA(look.psy.ink, 0.34));
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    },
    stage: (ctx, S, info) => {
      frame = { next: info.next, local: info.local, hold: info.hold, change: info.change, t: info.t };
      const id = info.scene || "title";
      if (S.paint) { // over footage, the scenes and headlines draw alone
        const fieldId = FIELDS[id] ? id : "title";
        // The first scene opens on the full field with its bands rushing outward, then settling.
        const tf = info.index === 0 ? info.t - 2.6 * (1 - ease(info.local / 1.1)) : info.t;
        let idB = null, tr = null;
        if (info.next && info.local > info.hold - info.change) {
          idB = FIELDS[info.next] ? info.next : "title";
          const kind = ["ripple", "iris", "sweep"][info.index % 3];
          const [hx, hy] = (kind === "ripple" ? HERO(S)[id] : null) || [0.5, 0.5];
          tr = { kind, e: easeInOut((info.local - (info.hold - info.change)) / Math.max(0.01, info.change)), cx: hx * S.W, cy: hy * S.H };
        }
        drawField(ctx, S, tf, fieldId, idB, tr);
      }
    },
    overlap: true,
    scenes: {
      // The statements draw as scenes too, so they cross into the next scene like the others.
      title: (ctx, S, box, p, d, info) => {
        const q = info.exit || 0, vis = ease(clamp(info.local / 0.5)) * (1 - easeIn(q));
        if (S.paint && vis > 0) titleDecor(ctx, S, info, vis);
        statement(ctx, S, "title", info);
      },
      closing: (ctx, S, box, p, d, info) => {
        const vis = ease(clamp(info.local / 0.5));
        if (S.paint && vis > 0) closingDecor(ctx, S, info, vis);
        statement(ctx, S, "closing", info);
      },
      chart: withExit(chart, "chart"), object: withExit(object, "object"), people: withExit(people, "people"), process: withExit(process, "process"), compare: withExit(compare, "compare") },
  };
});
