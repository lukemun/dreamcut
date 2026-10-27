// Liquid Chrome: a Y2K showroom of mirror metal. A per-pixel environment-mapped metaball creature
// (sky, hard horizon, warm floor, soft boxes, thin-film iridescence) roams a night-blue world of
// chrome gyroscope rings, floating spheres, jellybeans, stars, soap bubbles and glossy desktop
// windows. Each scene is built from chrome tubes, capsules and glass pills; scenes change when a
// wall of liquid metal sweeps across the frame. Every frame is a pure function of time.
window.DreamcutMotion.register("chrome", ({ grain, rng }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const sm = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const NAVY = "#070c34";
  const WHITE = [255, 255, 255];

  // ---- colour --------------------------------------------------------------------------------------
  function rgb(value) {
    const s = String(value || "");
    if (s[0] === "#") {
      const h = s.length === 4 ? s.slice(1).split("").map((c) => c + c).join("") : s.slice(1, 7);
      const n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (m) return m[1].split(",").slice(0, 3).map(Number);
    return [200, 200, 230];
  }
  const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  const CYAN = [90, 214, 255], PINK = [255, 92, 200], LIME = [196, 255, 96], VIOLET = [150, 112, 255], GOLD = [255, 206, 96], SILVER = [190, 206, 244];

  const CUR = { t: 0, index: 0, next: null, scene: null };
  function theme(S) {
    const L = S.look;
    const acc = rgb(S.accent);
    return {
      light: lum(rgb(L.bg)) > 150, acc, accS: S.accent, accL: mix(acc, WHITE, 0.4), accD: mix(acc, [10, 8, 50], 0.5),
      ink: L.ink, inkC: rgb(L.ink), muted: L.muted, u: S.u, tex: L.texture ?? 1, t: CUR.t,
      sky: L.skyTop || [44, 96, 232], mono: L.mono || 0,
    };
  }

  // ---- offscreen buffers -------------------------------------------------------------------------
  const BUF = {};
  function buf(key, w, h) {
    let c = BUF[key];
    if (!c) { c = BUF[key] = document.createElement("canvas"); }
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; c.__img = null; }
    return c;
  }
  let HBUF = new Float32Array(1), HB2 = new Float32Array(1), HB3 = new Float32Array(1);

  // ---- liquid metal: metaballs shaded per pixel with a smooth wrap-around environment ----------------
  // balls: [{ x, y, r }] in canvas px. The field sum(r^2 / d^2) > 1 is the surface; h = sqrt(1 - 1/f) is a
  // hemisphere height for a single ball. The height is box-blurred before normals are taken so merged
  // balls read as one smooth body (no dimples at each ball centre). The reflection vector looks up a soft
  // sky (pale horizon to deep blue), a soft horizon, a warm floor that bounces back to lavender, two soft
  // boxes for the specular and a thin-film rim.
  function blurH(src, tmp, dst, gw, gh, rad) {
    const inv = 1 / (rad * 2 + 1);
    for (let j = 0; j < gh; j++) {
      const row = j * gw; let acc = 0;
      for (let i = -rad; i <= rad; i++) acc += src[row + clamp(i, 0, gw - 1)];
      for (let i = 0; i < gw; i++) {
        tmp[row + i] = acc * inv;
        acc += src[row + Math.min(gw - 1, i + rad + 1)] - src[row + Math.max(0, i - rad)];
      }
    }
    for (let i = 0; i < gw; i++) {
      let acc = 0;
      for (let j = -rad; j <= rad; j++) acc += tmp[clamp(j, 0, gh - 1) * gw + i];
      for (let j = 0; j < gh; j++) {
        dst[j * gw + i] = acc * inv;
        acc += tmp[Math.min(gh - 1, j + rad + 1) * gw + i] - tmp[Math.max(0, j - rad) * gw + i];
      }
    }
  }
  function metal(ctx, th, balls, t, o = {}) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, rs = 0;
    for (const b of balls) {
      const m = b.r * 1.45;
      x0 = Math.min(x0, b.x - m); x1 = Math.max(x1, b.x + m); y0 = Math.min(y0, b.y - m); y1 = Math.max(y1, b.y + m); rs += b.r;
    }
    const ravg = rs / balls.length;
    const cs = o.cs || clamp((x1 - x0) / 340, 1.5 * th.u, 7 * th.u);
    const gw = Math.ceil((x1 - x0) / cs), gh = Math.ceil((y1 - y0) / cs);
    if (gw < 2 || gh < 2 || gw * gh > 260000) return;
    const c = buf(o.key || "metal", gw, gh);
    const g = c.getContext("2d");
    if (!c.__img) c.__img = g.createImageData(gw, gh);
    const img = c.__img, px = img.data;
    if (HBUF.length < gw * gh) { HBUF = new Float32Array(gw * gh); HB2 = new Float32Array(gw * gh); HB3 = new Float32Array(gw * gh); }
    const H = HBUF, n = balls.length;
    for (let j = 0; j < gh; j++) {
      const py = y0 + (j + 0.5) * cs;
      for (let i = 0; i < gw; i++) {
        const pxx = x0 + (i + 0.5) * cs;
        let f = 0;
        for (let k = 0; k < n; k++) { const b = balls[k]; const dx = pxx - b.x, dy = py - b.y; f += (b.r * b.r) / (dx * dx + dy * dy + 1); }
        H[j * gw + i] = f > 1 ? Math.sqrt(Math.max(0, 1 - Math.pow(f, -0.8))) : 0;
      }
    }
    // smoothed height for normals (two box passes ~ gaussian)
    const rad = Math.max(1, Math.round((o.blur ?? 0.1) * ravg / cs));
    blurH(H, HB2, HB3, gw, gh, rad); blurH(HB3, HB2, HB3, gw, gh, Math.max(1, rad >> 1));
    const HS = HB3;
    const tilt = o.tilt ?? 0.14, shift = o.shift ?? 0, ph = o.ph ?? 0, iri = o.iri ?? 0.3;
    const warm = o.warm || th.accL, top = o.top || th.sky;
    const deep = o.deep || [92, 58, 200];
    const hzk = o.horizon ?? 0.32;
    const zk = ravg / (2 * cs);
    const alpha = o.alpha ?? 1;
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const id = j * gw + i, h = H[id], q = id * 4;
        if (h <= 0) { px[q + 3] = 0; continue; }
        const hl = i > 0 ? HS[id - 1] : 0, hr = i < gw - 1 ? HS[id + 1] : 0, hu = j > 0 ? HS[id - gw] : 0, hd = j < gh - 1 ? HS[id + gw] : 0;
        const dzx = (hr - hl) * zk, dzy = (hd - hu) * zk;
        const inv = 1 / Math.sqrt(dzx * dzx + dzy * dzy + 1);
        const nz = inv, nx = -dzx * inv, ny = -dzy * inv;
        const rx = 2 * nz * nx + shift, ry = 2 * nz * ny;
        const e = clamp(-ry * 0.95 + tilt, -1, 1);
        let r, gg, b;
        if (e > 0) {
          // sky: pale near the horizon, deepening to the zenith blue
          const u2 = Math.pow(e, 0.8);
          r = lerp(232, top[0], u2); gg = lerp(246, top[1], u2); b = lerp(255, top[2], u2);
        } else {
          // floor: warm accent near the horizon, violet below, bouncing back to lavender at the very bottom
          const u2 = Math.pow(-e, 0.85);
          const ka = sm(0, 0.3, u2), k2 = sm(0.25, 0.75, u2);
          r = lerp(232, warm[0], ka); gg = lerp(246, warm[1], ka); b = lerp(255, warm[2], ka);
          r = lerp(r, deep[0], k2); gg = lerp(gg, deep[1], k2); b = lerp(b, deep[2], k2);
          const k3 = sm(0.7, 1, u2);
          r = lerp(r, 214, k3 * 0.5); gg = lerp(gg, 206, k3 * 0.5); b = lerp(b, 255, k3 * 0.5);
        }
        // a soft horizon, never black
        const hb = Math.exp(-(e * e) / 0.02) * hzk;
        r = lerp(r, 34, hb); gg = lerp(gg, 44, hb); b = lerp(b, 128, hb);
        // soft boxes: a big key above-right and a thin strip at left
        const s1 = Math.exp(-(((rx - 0.38) / 0.2) ** 2 + ((e - 0.52) / 0.22) ** 2));
        const s2 = 0.65 * Math.exp(-(((rx + 0.6) / 0.09) ** 2 + ((e - 0.2) / 0.34) ** 2));
        const w = Math.min(1, s1 + s2);
        r += (255 - r) * w; gg += (255 - gg) * w; b += (255 - b) * w;
        const fr = 1 - nz;
        const am = iri * Math.pow(clamp(fr * 1.2), 1.2);
        if (am > 0.002) {
          const c0 = 0.5 + 0.5 * Math.cos(TAU * (fr * 1.1 + ph)), c1 = 0.5 + 0.5 * Math.cos(TAU * (fr * 1.1 + ph + 0.33)), c2 = 0.5 + 0.5 * Math.cos(TAU * (fr * 1.1 + ph + 0.66));
          r = r * (1 - am) + (120 + 135 * c0) * am; gg = gg * (1 - am) + (120 + 135 * c1) * am; b = b * (1 - am) + (140 + 115 * c2) * am;
        }
        // a crisp dark outline at the silhouette, a thin bright rim just inside it
        const dark = 1 - clamp(h / 0.1);
        const rim = Math.exp(-(((h - 0.2) / 0.07) ** 2)) * 0.35;
        r = r * (1 - 0.78 * dark) + (255 - r) * rim; gg = gg * (1 - 0.78 * dark) + (255 - gg) * rim; b = b * (1 - 0.7 * dark) + (255 - b) * rim;
        px[q] = r; px[q + 1] = gg; px[q + 2] = b; px[q + 3] = clamp(h * 3.2) * 255 * alpha;
      }
    }
    g.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(c, 0, 0, gw, gh, x0, y0, gw * cs, gh * cs);
    ctx.restore();
  }

  // Small spheres reuse a pre-shaded sprite (a few variants), with a live glint on top.
  const SPR = {};
  function sprite(th, v) {
    const key = v + th.accS;
    if (SPR[key]) return SPR[key];
    const size = 112;
    const c = document.createElement("canvas"); c.width = c.height = size;
    const g = c.getContext("2d");
    const set = [
      { tilt: 0.1, ph: 0.0, warm: th.accL },
      { tilt: 0.3, ph: 0.3, warm: mix(CYAN, WHITE, 0.2), top: [90, 70, 230] },
      { tilt: -0.05, ph: 0.62, warm: mix(GOLD, PINK, 0.4), top: [30, 130, 235] },
      { tilt: 0.18, ph: 0.8, warm: mix(LIME, CYAN, 0.4), top: [60, 70, 220] },
    ][v % 4];
    metal(g, { ...th, u: 1 }, [{ x: size / 2, y: size / 2, r: size * 0.46 }], 0, { ...set, cs: 1.1, key: "spr" });
    return (SPR[key] = c);
  }

  // ---- tubes, capsules, stars, bubbles, pills ------------------------------------------------------
  function envGrad(ctx, th, y0, y1, hy = 0.5, o = {}) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    const h = clamp(hy, 0.3, 0.7);
    const top = o.top || th.sky;
    const warm = o.warm || th.accL;
    g.addColorStop(0, rgba(top)); g.addColorStop(h * 0.55, "#79c4ff"); g.addColorStop(h * 0.93, "#f0fbff");
    g.addColorStop(h, "#0a1040"); g.addColorStop(Math.min(h + 0.045, 0.97), rgba(warm)); g.addColorStop((1 + h) / 2 + 0.03, "#6a3fe0"); g.addColorStop(1, "#d8f4ff");
    return g;
  }
  function rr(ctx, x, y, w, h, r) {
    const q = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + q, y); ctx.arcTo(x + w, y, x + w, y + h, q); ctx.arcTo(x + w, y + h, x, y + h, q);
    ctx.arcTo(x, y + h, x, y, q); ctx.arcTo(x, y, x + w, y, q); ctx.closePath();
  }
  // A chrome tube along any path: dark outline, mirror body, offset highlight, rim light.
  function tube(ctx, th, w, build, o = {}) {
    const y0 = o.y0 ?? 0, y1 = o.y1 ?? th.u * 1080;
    const hy = o.hy ?? 0.5 + 0.06 * Math.sin(CUR.t * 0.9);
    ctx.save();
    ctx.lineCap = o.cap || "round"; ctx.lineJoin = "round";
    build(ctx); ctx.strokeStyle = NAVY; ctx.lineWidth = w; ctx.stroke();
    if (o.cross) {
      // cross-section shading that holds along any direction: rim, sky blue, pale core, hot white line, horizon dark and warm floor
      const k = o.cross;
      const layers = [[0.88, "#2f4fd8"], [0.7, "#8fc4ff"], [0.5, "#eaf8ff"]];
      for (const [f, c] of layers) { build(ctx); ctx.strokeStyle = c; ctx.lineWidth = w * f; ctx.stroke(); }
      ctx.save(); ctx.translate(w * 0.13, w * 0.15); build(ctx); ctx.strokeStyle = "rgba(10,16,64,0.78)"; ctx.lineWidth = w * 0.11; ctx.stroke(); ctx.restore();
      ctx.save(); ctx.translate(w * 0.24, w * 0.26); build(ctx); ctx.strokeStyle = rgba(th.accL, 0.9); ctx.lineWidth = w * 0.1; ctx.stroke(); ctx.restore();
      ctx.save(); ctx.translate(-w * 0.12, -w * 0.15); build(ctx); ctx.strokeStyle = "rgba(255,255,255," + (0.7 * k) + ")"; ctx.lineWidth = w * 0.13; ctx.stroke(); ctx.restore();
    } else {
      build(ctx); ctx.strokeStyle = o.fill || envGrad(ctx, th, y0, y1, hy, o); ctx.lineWidth = w * 0.84; ctx.stroke();
      ctx.translate(-w * 0.08, -w * 0.12);
      build(ctx); ctx.strokeStyle = "rgba(255,255,255,0.62)"; ctx.lineWidth = w * 0.16; ctx.stroke();
    }
    ctx.restore();
    if (o.glow) {
      ctx.save(); ctx.globalCompositeOperation = "lighter"; build(ctx); ctx.strokeStyle = rgba(o.glow, 0.22); ctx.lineWidth = w * 2.2; ctx.lineCap = "round"; ctx.stroke(); ctx.restore();
    }
  }
  // A capsule outline with elliptical end caps (the silhouette the shader below fills).
  function capPath(ctx, x, y, w, h, rad) {
    rad = Math.min(rad, h / 2);
    ctx.beginPath();
    ctx.moveTo(x, y + rad);
    ctx.ellipse(x + w / 2, y + rad, w / 2, rad, 0, Math.PI, TAU);
    ctx.lineTo(x + w, y + h - rad);
    ctx.ellipse(x + w / 2, y + h - rad, w / 2, rad, 0, 0, Math.PI);
    ctx.closePath();
  }
  // A liquid-metal capsule shaded per pixel: a cylinder across, domed caps at each end. The reflected
  // world is bent by the form: a dark horizon band that bows across the body and rises up the flanks,
  // sky above it, the tinted floor below, a key soft box that slides as a specular hot spot, a bright
  // rim just inside the silhouette and thin-film colour at the very edge. Horizon and hot spot drift
  // with time so the metal looks liquid through every hold.
  function capsule(ctx, th, x, y, w, h, tint, o = {}) {
    if (w <= 2 || h <= 2) return;
    const u = th.u, t = CUR.t, ph = o.ph || 0;
    const rad = Math.min(o.r ?? w / 2, w / 2, h / 2);
    const cs = o.cs || Math.max(1.25 * u, w / 84);
    const gw = Math.ceil(w / cs) + 2, gh = Math.ceil(h / cs) + 2;
    if (gw * gh > 320000) return;
    const c = buf(o.key || "cap", gw, gh), g = c.getContext("2d");
    if (!c.__img) c.__img = g.createImageData(gw, gh);
    const img = c.__img, px = img.data;
    const mono = th.mono;
    const top = mono ? [120, 128, 160] : mix(tint, [26, 56, 214], 0.55), warm = mono ? [214, 218, 230] : mix(tint, WHITE, 0.22);
    const deep = mono ? [60, 64, 84] : mix(tint, [26, 12, 96], 0.62);
    const hzc = 0.46 + 0.1 * Math.sin(t * 0.75 + ph * 1.7);          // horizon height along the body
    const ky = 0.5 + 0.22 * Math.sin(t * 0.9 + ph * 2.3);              // key light elevation (slides)
    const kx = 0.42 + 0.08 * Math.sin(t * 0.55 + ph);                  // key light across
    const er = Math.min(w / 2, rad) / cs;
    for (let j = 0; j < gh; j++) {
      const ly = (j - 1 + 0.5) * cs;
      const qy = clamp(ly, rad, h - rad), dy = rad > 0 ? (ly - qy) / rad : 0;
      for (let i = 0; i < gw; i++) {
        const q = (j * gw + i) * 4;
        const lx = (i - 1 + 0.5) * cs, ex = (lx - w / 2) / (w / 2);
        const d2 = ex * ex + dy * dy;
        if (d2 >= 1) { px[q + 3] = 0; continue; }
        const nz = Math.sqrt(1 - d2), nx = ex, ny = dy;
        const rx = 2 * nz * nx, ry = 2 * nz * ny;
        // elevation of the reflected ray: caps tilt it, length bends it, flanks lift the horizon
        let e = -ry * 0.9 + ((hzc * h - ly) / w) * 0.85 - 0.26 * nx * nx;
        e = clamp(e, -1, 1);
        let r, gg, b;
        if (e > 0) {
          const k = Math.pow(e, 0.7);
          r = lerp(236, top[0], k); gg = lerp(248, top[1], k); b = lerp(255, top[2], k);
        } else {
          const k = Math.pow(-e, 0.8), ka = sm(0, 0.28, k), k2 = sm(0.3, 0.85, k);
          r = lerp(232, warm[0], ka); gg = lerp(240, warm[1], ka); b = lerp(255, warm[2], ka);
          r = lerp(r, deep[0], k2); gg = lerp(gg, deep[1], k2); b = lerp(b, deep[2], k2);
          const k3 = sm(0.72, 1, k) * 0.55;
          r = lerp(r, warm[0], k3); gg = lerp(gg, warm[1], k3); b = lerp(b, warm[2], k3);
        }
        // the dark horizon band, bent by the form, and a fainter dark reflection higher in the sky
        const hb = Math.exp(-(e * e) / 0.005) * 0.88;
        r = lerp(r, 12, hb); gg = lerp(gg, 16, hb); b = lerp(b, 70, hb);
        const d2b = Math.exp(-(((e - 0.6) / 0.07) ** 2)) * 0.5;
        r = lerp(r, 20, d2b); gg = lerp(gg, 28, d2b); b = lerp(b, 110, d2b);
        // specular hot spot (key soft box) and a thin strip light on the left flank
        const s1 = Math.exp(-(((rx - kx) / 0.13) ** 2 + ((e - ky) / 0.14) ** 2)) + 0.6 * Math.exp(-(((rx - kx) / 0.05) ** 2 + ((e - ky) / 0.05) ** 2));
        const s2 = 0.7 * Math.exp(-(((rx + 0.78) / 0.09) ** 2)) * sm(-0.35, 0.1, e);
        const sw = Math.min(1, s1 * 1.2 + s2);
        r += (255 - r) * sw; gg += (255 - gg) * sw; b += (255 - b) * sw;
        // fresnel: thin-film colour, a bright rim just inside the edge, then a dark lip
        const fr = 1 - nz;
        const am = 0.32 * sm(0.55, 0.95, fr);
        if (am > 0.002 && !mono) {
          const c0 = 0.5 + 0.5 * Math.cos(TAU * (fr * 1.3 + ph * 0.1 + t * 0.03)), c1 = 0.5 + 0.5 * Math.cos(TAU * (fr * 1.3 + 0.33 + t * 0.03)), c2 = 0.5 + 0.5 * Math.cos(TAU * (fr * 1.3 + 0.66 + t * 0.03));
          r = r * (1 - am) + (120 + 135 * c0) * am; gg = gg * (1 - am) + (120 + 135 * c1) * am; b = b * (1 - am) + (140 + 115 * c2) * am;
        }
        const rim = Math.exp(-(((fr - 0.72) / 0.1) ** 2)) * 0.55;
        r += (255 - r) * rim; gg += (255 - gg) * rim; b += (255 - b) * rim;
        const lip = sm(0.9, 1, fr) * 0.7;
        r *= 1 - lip; gg *= 1 - lip; b *= 1 - lip * 0.8;
        px[q] = r; px[q + 1] = gg; px[q + 2] = b;
        px[q + 3] = 255 * clamp((1 - Math.sqrt(d2)) * er * 1.4 + 0.3);
      }
    }
    g.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(c, 0, 0, gw, gh, x - cs, y - cs, gw * cs, gh * cs);
    capPath(ctx, x, y, w, h, rad); ctx.strokeStyle = NAVY; ctx.lineWidth = 3.6 * u; ctx.stroke();
    ctx.restore();
  }
  function sparkle(ctx, x, y, r, rot, a = 1, col = WHITE) {
    if (r < 0.5 || a <= 0) return;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha *= a;
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.5);
    g.addColorStop(0, rgba(col, 0.55)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; ctx.fillRect(-r * 1.5, -r * 1.5, r * 3, r * 3);
    ctx.globalCompositeOperation = "source-over";
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const a0 = (k * Math.PI) / 2, a1 = a0 + Math.PI / 2;
      const px0 = Math.sin(a0) * r, py0 = -Math.cos(a0) * r, px1 = Math.sin(a1) * r, py1 = -Math.cos(a1) * r;
      if (k === 0) ctx.moveTo(px0, py0);
      const mx = (Math.sin(a0) + Math.sin(a1)) * r * 0.1, my = (-Math.cos(a0) - Math.cos(a1)) * r * 0.1;
      ctx.quadraticCurveTo(mx, my, px1, py1);
    }
    ctx.closePath();
    const sg = ctx.createLinearGradient(0, -r, 0, r);
    sg.addColorStop(0, "#ffffff"); sg.addColorStop(0.5, rgba(mix(col, CYAN, 0.35))); sg.addColorStop(1, "#ffffff");
    ctx.fillStyle = sg; ctx.fill();
    ctx.restore();
  }
  function bubble(ctx, x, y, r, t, ph = 0, a = 1) {
    if (r < 1) return;
    ctx.save(); ctx.globalAlpha *= a;
    const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0.0)"); g.addColorStop(0.8, "rgba(160,200,255,0.06)"); g.addColorStop(1, "rgba(255,255,255,0.28)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    const cols = ["rgba(90,230,255,0.85)", "rgba(255,110,210,0.85)", "rgba(255,240,120,0.8)", "rgba(150,255,170,0.75)"];
    ctx.lineWidth = Math.max(1.4, r * 0.07); ctx.lineCap = "round";
    for (let k = 0; k < 4; k++) { ctx.strokeStyle = cols[k]; ctx.beginPath(); ctx.arc(x, y, r, ph + t * 0.4 + k * 1.57, ph + t * 0.4 + k * 1.57 + 1.45); ctx.stroke(); }
    ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = Math.max(1.6, r * 0.09);
    ctx.beginPath(); ctx.arc(x, y, r * 0.78, Math.PI * 1.12, Math.PI * 1.42); ctx.stroke();
    ctx.restore();
  }
  function font(S, size, fam = "body", weight) {
    const L = S.look;
    return `${weight ?? (fam === "body" ? 800 : L.displayWeight)} ${size}px ${fam === "display" ? L.display : L.body}`;
  }
  function tw(ctx, S, str, size, fam, weight) { ctx.save(); ctx.font = font(S, size, fam, weight); const w = ctx.measureText(String(str)).width; ctx.restore(); return w; }
  // Mirror-metal lettering for numbers: navy outline, light rim, sky and horizon fill.
  function ctext(ctx, S, th, str, x, y, size, o = {}) {
    ctx.save();
    ctx.font = font(S, size, o.fam || "display", 900);
    ctx.textAlign = o.align || "left"; ctx.textBaseline = "alphabetic"; ctx.lineJoin = "round"; ctx.miterLimit = 2;
    if (o.hot) { ctx.shadowColor = rgba(th.acc, 0.85); ctx.shadowBlur = size * 0.35; }
    ctx.strokeStyle = NAVY; ctx.lineWidth = size * 0.17; ctx.strokeText(str, x, y);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = o.hot ? rgba(th.accL) : "#a6d6ff"; ctx.lineWidth = size * 0.085; ctx.strokeText(str, x, y);
    ctx.fillStyle = envGrad(ctx, th, y - size * 0.8, y + size * 0.05, 0.54 + 0.05 * Math.sin(CUR.t * 1.1 + x * 0.003), o.hot ? { warm: th.accL, top: mix(th.acc, [30, 40, 200], 0.3) } : {});
    ctx.fillText(str, x, y);
    ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = Math.max(1.2, size * 0.018); ctx.strokeText(str, x, y);
    ctx.restore();
  }
  // A glossy glass capsule label. Returns its width.
  function pill(ctx, S, th, str, cx, cy, size, o = {}) {
    const u = S.u;
    ctx.save(); ctx.font = font(S, size, "body", 800);
    const padX = size * 0.72, w = ctx.measureText(String(str)).width + padX * 2 + (o.icon ? size * 0.9 : 0), h = size * 1.62;
    const x = o.align === "left" ? cx : o.align === "right" ? cx - w : cx - w / 2, y = cy - h / 2;
    const tint = o.tint || null;
    ctx.shadowColor = "rgba(5,8,40,0.5)"; ctx.shadowBlur = 24 * u; ctx.shadowOffsetY = 10 * u;
    rr(ctx, x, y, w, h, h / 2);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    if (tint) { g.addColorStop(0, rgba(mix(tint, WHITE, 0.75))); g.addColorStop(0.5, rgba(tint)); g.addColorStop(1, rgba(mix(tint, [20, 10, 80], 0.4))); }
    else { g.addColorStop(0, "#ffffff"); g.addColorStop(0.5, "#cfe0ff"); g.addColorStop(0.52, "#aebffa"); g.addColorStop(1, "#eaf2ff"); }
    ctx.fillStyle = g; ctx.fill();
    ctx.shadowColor = "transparent";
    rr(ctx, x, y, w, h, h / 2); ctx.strokeStyle = NAVY; ctx.lineWidth = 3.4 * u; ctx.stroke();
    rr(ctx, x + 3 * u, y + 3 * u, w - 6 * u, h - 6 * u, h / 2); ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 1.6 * u; ctx.stroke();
    ctx.save(); rr(ctx, x, y, w, h, h / 2); ctx.clip();
    const gl = ctx.createLinearGradient(0, y, 0, y + h * 0.5); gl.addColorStop(0, "rgba(255,255,255,0.75)"); gl.addColorStop(1, "rgba(255,255,255,0.05)");
    ctx.fillStyle = gl; ctx.fillRect(x, y, w, h * 0.5);
    // a soft sheen sweeps along
    const k = (((CUR.t * 0.45 + (o.ph || 0)) % 1.6) + 1.6) % 1.6;
    if (k < 1) { const sx = x + (w + h) * k - h; const sg = ctx.createLinearGradient(sx, 0, sx + h, 0); sg.addColorStop(0, "rgba(255,255,255,0)"); sg.addColorStop(0.5, "rgba(255,255,255,0.55)"); sg.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = sg; ctx.fillRect(x, y, w, h); }
    ctx.restore();
    ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillStyle = o.color || NAVY;
    ctx.fillText(String(str), x + padX + (o.icon ? size * 0.9 : 0), cy + size * 0.04);
    if (o.icon) { o.icon(ctx, x + padX + size * 0.4, cy, size * 0.8); }
    ctx.restore();
    return w;
  }

  // ---- camera, mascot anchors -------------------------------------------------------------------------
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  const DEF = { title: 2.4, chart: 3.4, object: 3.6, people: 3.2, process: 3.6, compare: 3.2, closing: 2.4 };
  function shownIds() {
    const c = (window.__dreamcut && window.__dreamcut.controls) || {};
    return ORDER.filter((id) => Number(c[id + "_hold"] ?? DEF[id]) > 0);
  }
  const CAMS = [[0, 0], [-0.16, 0.05], [0.14, -0.05], [-0.1, -0.08], [0.18, 0.04], [-0.14, 0.07], [0.06, 0]];
  function camera(info) {
    const i = Math.max(0, info.index || 0);
    const cur = CAMS[i % CAMS.length], prev = CAMS[(i + CAMS.length - 1) % CAMS.length];
    const b = i > 0 ? eio((info.local || 0) / 0.95) : 1;
    return { x: lerp(prev[0], cur[0], b) + Math.sin(info.t * 0.23) * 0.012, y: lerp(prev[1], cur[1], b) + Math.cos(info.t * 0.19) * 0.01, b };
  }
  // [fx, fy, radius] per scene; radius in 1000-unit px.
  const ANCH = {
    title: { wide: [0.835, 0.64, 160], tall: [0.5, 0.8, 230] },
    chart: { wide: [0.9, 0.56, 118], tall: [0.84, 0.17, 100] },
    object: { wide: [0.9, 0.85, 112], tall: [0.18, 0.9, 100] },
    people: { wide: [0.93, 0.22, 90], tall: [0.86, 0.16, 90] },
    process: { wide: [0.77, 0.85, 80], tall: [0.8, 0.9, 88] },
    compare: { wide: [0.9, 0.3, 110], tall: [0.5, 0.36, 100] },
    closing: { wide: [0.835, 0.64, 160], tall: [0.5, 0.78, 230] },
  };
  function anchor(S, id) { const a = (ANCH[id] || ANCH.title)[S.tall ? "tall" : "wide"]; return [a[0] * S.W, a[1] * S.H, a[2] * S.u]; }

  // ---- world --------------------------------------------------------------------------------------------
  let FLO = null;
  function floaters() {
    if (FLO) return FLO;
    const r = rng(63);
    const kinds = ["sphere", "sphere", "sphere", "sphere", "sphere", "sphere", "star", "star", "star", "star", "star", "bubble", "bubble", "bubble", "bubble", "bubble", "bean", "bean", "bean", "plus", "plus", "ring"];
    FLO = kinds.map((k, i) => ({ i, k, x: r(), y: r(), d: 0.22 + r() * 0.78, s: 0.6 + r() * 0.8, ph: r() * TAU, sp: 0.3 + r() * 0.5, v: i % 4, rot: r() * TAU }));
    return FLO;
  }
  function drawFloater(ctx, S, th, f, t, cam, fade = () => 1) {
    const W = S.W, H = S.H, u = S.u, span = W * 1.3;
    let x = (f.x * 1.2 - 0.1) * W - cam.x * W * f.d * 1.7 + Math.sin(t * f.sp + f.ph) * 34 * u * f.d;
    x = ((x + 0.15 * W) % span + span) % span - 0.15 * W;
    let y = (f.y * 1.1 - 0.05) * H - cam.y * H * f.d * 1.7 + Math.cos(t * f.sp * 0.8 + f.ph) * 26 * u * f.d;
    const spanY = H * 1.2; y = ((y + 0.1 * H) % spanY + spanY) % spanY - 0.1 * H;
    const size = (34 + 64 * f.d) * f.s * u, a = (0.55 + 0.45 * f.d) * fade(x, y, size, f);
    if (a < 0.02) return;
    ctx.save(); ctx.globalAlpha = a;
    if (f.k === "sphere") {
      ctx.drawImage(sprite(th, f.v), x - size, y - size, size * 2, size * 2);
      ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.beginPath(); ctx.arc(x - size * 0.34 + Math.sin(t * 0.8 + f.ph) * size * 0.1, y - size * 0.4, size * 0.1, 0, TAU); ctx.fill();
    } else if (f.k === "star") {
      sparkle(ctx, x, y, size * 0.95 * (0.85 + 0.15 * Math.sin(t * 2.2 + f.ph)), f.rot + t * 0.25 * f.sp, 0.95, f.v % 2 ? CYAN : PINK);
    } else if (f.k === "bubble") {
      bubble(ctx, x, y, size * 0.9, t, f.ph);
    } else if (f.k === "bean") {
      ctx.translate(x, y); ctx.rotate(f.rot + t * 0.3 * (f.v % 2 ? 1 : -1));
      capsule(ctx, th, -size * 0.4, -size * 0.95, size * 0.8, size * 1.9, [CYAN, PINK, LIME, VIOLET][f.v], { ph: f.ph });
    } else if (f.k === "window") {
      ctx.translate(x, y); ctx.rotate(Math.sin(t * 0.3 + f.ph) * 0.06 + (f.v - 1.5) * 0.05);
      const w = size * 4.4, h = size * 2.7;
      rr(ctx, -w / 2, -h / 2, w, h, 16 * u); ctx.fillStyle = "rgba(190,215,255,0.12)"; ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 2.4 * u; ctx.stroke();
      ctx.save(); rr(ctx, -w / 2, -h / 2, w, h, 16 * u); ctx.clip();
      const tg = ctx.createLinearGradient(0, -h / 2, 0, -h / 2 + 34 * u); tg.addColorStop(0, "#f4fbff"); tg.addColorStop(0.5, "#8fb2ff"); tg.addColorStop(0.52, "#2a3fa8"); tg.addColorStop(1, "#bde0ff");
      ctx.fillStyle = tg; ctx.fillRect(-w / 2, -h / 2, w, 34 * u);
      for (let k = 0; k < 3; k++) { ctx.fillStyle = [ "#ff6ccd", "#6ee0ff", "#ffe36c"][k]; ctx.beginPath(); ctx.arc(-w / 2 + (20 + k * 24) * u, -h / 2 + 17 * u, 7 * u, 0, TAU); ctx.fill(); }
      for (let k = 0; k < 3; k++) {
        const bw = (0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.3 + k * 2 + f.ph))) * w * 0.7;
        rr(ctx, -w / 2 + 24 * u, -h / 2 + (58 + k * 34) * u, bw, 16 * u, 8 * u); ctx.fillStyle = rgba([CYAN, PINK, VIOLET][k], 0.8); ctx.fill();
      }
      ctx.restore();
    } else if (f.k === "plus") {
      ctx.translate(x, y); ctx.rotate(t * 0.4 * f.sp + f.rot);
      tube(ctx, th, size * 0.34, (c) => { c.beginPath(); c.moveTo(-size * 0.6, 0); c.lineTo(size * 0.6, 0); c.moveTo(0, -size * 0.6); c.lineTo(0, size * 0.6); }, { y0: -size, y1: size, hy: 0.5 + 0.1 * Math.sin(t + f.ph) });
    } else if (f.k === "ring") {
      ctx.translate(x, y); ctx.rotate(f.rot + t * 0.2); ctx.scale(1, 0.45 + 0.35 * Math.abs(Math.cos(t * 0.5 * f.sp + f.ph)));
      tube(ctx, th, size * 0.34, (c) => { c.beginPath(); c.arc(0, 0, size * 0.82, 0, TAU); }, { y0: -size, y1: size, hy: 0.5 });
    }
    ctx.restore();
  }

  // Gyroscope rings around the creature: the back halves draw behind it, the front halves over it.
  function gyro(ctx, S, th, cx, cy, R, t, front) {
    const rings = [[0.0, 1.0, 0.075], [1.1, 0.86, 0.065], [2.3, 0.73, 0.055]];
    rings.forEach(([ph, sc, wk], i) => {
      const rot = t * (0.16 + i * 0.1) * (i % 2 ? -1 : 1) + ph;
      const tl = Math.abs(Math.cos(t * (0.21 + i * 0.07) + ph * 2));
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(1, 0.16 + 0.5 * tl);
      const rad = R * sc;
      tube(ctx, th, R * wk, (c) => { c.beginPath(); c.arc(0, 0, rad, front ? 0 : Math.PI, front ? Math.PI : TAU); }, { y0: -rad, y1: rad, cap: "butt", hy: 0.5 + 0.1 * Math.sin(t * 0.7 + i), glow: i === 1 ? th.acc : null });
      ctx.restore();
    });
  }

  function aurora(ctx, S, th, t, cam) {
    const W = S.W, H = S.H;
    ctx.save(); ctx.globalCompositeOperation = th.light ? "multiply" : "lighter";
    const cols = [[60, 200, 255], [255, 70, 200], [150, 255, 120]];
    cols.forEach((c, i) => {
      const y0 = H * (0.2 + i * 0.28) - cam.y * H * 0.5;
      ctx.beginPath(); ctx.moveTo(0, y0);
      for (let x = 0; x <= W; x += W / 24) ctx.lineTo(x, y0 + Math.sin(x / W * 5 + t * (0.3 + i * 0.1) + i * 2) * H * 0.07 + Math.sin(x / W * 11 - t * 0.2) * H * 0.02);
      ctx.lineTo(W, y0 + H * 0.3); ctx.lineTo(0, y0 + H * 0.3); ctx.closePath();
      const g = ctx.createLinearGradient(0, y0 - H * 0.1, 0, y0 + H * 0.3);
      g.addColorStop(0, rgba(c, 0)); g.addColorStop(0.35, rgba(c, th.light ? 0.16 : 0.11)); g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g; ctx.fill();
    });
    ctx.restore();
  }

  // The mascot: a merging chrome creature with glossy eyes. Satellites orbit, a drop falls and re-forms.
  function mascotAt(S, info, cam) {
    const ids = shownIds();
    const id = info.scene || ids[ids.length - 1] || "title";
    const prevId = ids[info.index - 1];
    const t = info.t;
    let [ax, ay, ar] = anchor(S, id);
    let stretch = 0, dirx = 1, diry = 0;
    if (prevId && info.index > 0) {
      const [px, py, pr] = anchor(S, prevId);
      const b = eio((info.local || 0) / 0.85);
      ax = lerp(px, ax, b); ay = lerp(py, ay, b); ar = lerp(pr, ar, b); stretch = Math.sin(Math.PI * b);
      dirx = ax - px; diry = ay - py;
    }
    const bob = Math.sin(t * 1.4) * 0.05 * ar;
    ax += -cam.x * S.W * 0.25; ay += bob - cam.y * S.H * 0.25;
    return { ax, ay, R: ar, stretch, dirx, diry, id, prevId };
  }
  function mascot(ctx, S, th, info, cam, M) {
    const t = info.t, u = S.u;
    const { ax, ay, R, stretch, dirx, diry } = M;
    const balls = [{ x: ax, y: ay, r: R }];
    const s1 = t * 0.9 + 0.5, s2 = -t * 0.7 + 2, s3 = t * 1.3 + 4;
    balls.push({ x: ax + Math.cos(s1) * 1.12 * R, y: ay + Math.sin(s1) * 0.6 * R, r: R * (0.38 + 0.05 * Math.sin(t * 2)) });
    balls.push({ x: ax + Math.cos(s2) * 1.0 * R, y: ay + Math.sin(s2) * 0.82 * R, r: R * 0.27 });
    balls.push({ x: ax + Math.cos(s3) * 1.32 * R, y: ay + Math.sin(s3) * 0.5 * R, r: R * 0.17 });
    const dp = (t * 0.33) % 1;
    if (dp < 0.85) { const k = dp / 0.85; balls.push({ x: ax + 0.2 * R + Math.sin(k * 5) * 0.06 * R, y: ay + R * (0.8 + 1.15 * k * k), r: R * lerp(0.26, 0.07, k) }); }
    // soft floor glow and contact shadow
    ctx.save();
    const gl = ctx.createRadialGradient(ax, ay, R * 0.4, ax, ay, R * 2.5);
    gl.addColorStop(0, rgba(th.acc, 0.28)); gl.addColorStop(1, rgba(th.acc, 0));
    ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = gl; ctx.fillRect(ax - R * 2.6, ay - R * 2.6, R * 5.2, R * 5.2);
    ctx.restore();
    ctx.save();
    if (stretch > 0.01) { const ang = Math.atan2(diry, dirx); ctx.translate(ax, ay); ctx.rotate(ang); ctx.scale(1 + 0.16 * stretch, 1 - 0.1 * stretch); ctx.rotate(-ang); ctx.translate(-ax, -ay); }
    metal(ctx, th, balls, t, { key: "hero", shift: Math.sin(t * 0.6) * 0.3, ph: t * 0.04, tilt: 0.16, warm: th.accL });
    // eyes
    const look = [Math.cos(t * 0.5) * 0.35, Math.sin(t * 0.7) * 0.2];
    const blink = (t % 3.4) < 0.13 ? 0.12 : 1;
    for (const sx of [-1, 1]) {
      const ex = ax + sx * R * 0.3 + look[0] * R * 0.08, ey = ay - R * 0.05 + look[1] * R * 0.06;
      ctx.save(); ctx.translate(ex, ey); ctx.scale(1, blink);
      ctx.beginPath(); ctx.ellipse(0, 0, R * 0.115, R * 0.17, 0, 0, TAU);
      const eg = ctx.createLinearGradient(0, -R * 0.17, 0, R * 0.17); eg.addColorStop(0, "#222a78"); eg.addColorStop(1, "#04061c");
      ctx.fillStyle = eg; ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,0.65)"; ctx.lineWidth = 2 * u; ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(-R * 0.035 + look[0] * R * 0.03, -R * 0.07, R * 0.04, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(R * 0.03, R * 0.06, R * 0.02, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(ax, ay + R * 0.2, R * 0.13, 0.15 * Math.PI, 0.85 * Math.PI); ctx.strokeStyle = NAVY; ctx.lineWidth = Math.max(3, R * 0.03); ctx.lineCap = "round"; ctx.stroke();
    ctx.restore();
    sparkle(ctx, ax - R * 0.55, ay - R * 0.62, R * 0.2 * (0.75 + 0.25 * Math.sin(t * 3)), t * 0.5, 0.95, WHITE);
    return { x: ax, y: ay, r: R };
  }

  // Desktop-pill UI props for the statement scenes: all shape, no text.
  function uiProps(ctx, S, th, t, id) {
    const W = S.W, H = S.H, u = S.u;
    const left = (S.tall ? 90 : 140) * u;
    const y = H * (S.tall ? 0.9 : 0.885);
    const pw = (S.tall ? 520 : 560) * u, ph = 56 * u;
    // progress bar with a chrome knob
    const loop = (t * 0.28) % 1.0, fillk = 0.15 + 0.85 * loop;
    rr(ctx, left, y - ph / 2, pw, ph, ph / 2); ctx.fillStyle = "rgba(190,215,255,0.16)"; ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 2.4 * u; ctx.stroke();
    ctx.save(); rr(ctx, left + 5 * u, y - ph / 2 + 5 * u, (pw - 10 * u) * fillk, ph - 10 * u, (ph - 10 * u) / 2);
    const fg = ctx.createLinearGradient(left, 0, left + pw, 0); fg.addColorStop(0, "#5ee0ff"); fg.addColorStop(0.6, "#9a7cff"); fg.addColorStop(1, rgba(th.acc)); ctx.fillStyle = fg; ctx.fill(); ctx.restore();
    ctx.drawImage(sprite(th, 1), left + 5 * u + (pw - 10 * u) * fillk - ph * 0.45, y - ph * 0.62, ph * 1.24, ph * 1.24);
    // toggle
    const tx = left + pw + 54 * u, tww = 120 * u, thh = 56 * u, on = 0.5 + 0.5 * Math.sin(t * 1.6);
    rr(ctx, tx, y - thh / 2, tww, thh, thh / 2); ctx.fillStyle = on > 0.5 ? rgba(th.acc, 0.7) : "rgba(190,215,255,0.2)"; ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = 2.4 * u; ctx.stroke();
    const kx = tx + thh / 2 + (tww - thh) * sm(0.35, 0.65, on);
    ctx.drawImage(sprite(th, 0), kx - thh * 0.55, y - thh * 0.55, thh * 1.1, thh * 1.1);
    // round play button
    const bx = tx + tww + 64 * u, bR = 34 * u + Math.sin(t * 3) * 1.5 * u;
    ctx.drawImage(sprite(th, 3), bx - bR * 1.3, y - bR * 1.3, bR * 2.6, bR * 2.6);
    ctx.beginPath(); ctx.moveTo(bx - bR * 0.28, y - bR * 0.42); ctx.lineTo(bx + bR * 0.5, y); ctx.lineTo(bx - bR * 0.28, y + bR * 0.42); ctx.closePath(); ctx.fillStyle = NAVY; ctx.fill();
  }

  // Where decoration must stay quiet: the headline band and the scene's drawing.
  function zones(S, id) {
    const W = S.W, H = S.H, u = S.u;
    if (id === "title" || id === "closing") return { thin: 1, rects: [S.tall ? [0, H * 0.24, W, H * 0.64] : [0, H * 0.2, W * 0.68, H * 0.74]] };
    const A = area(S);
    return { thin: 0, rects: [[0, H * (S.tall ? 0.08 : 0.04), W * (S.tall ? 1 : 0.62), H * (S.tall ? 0.26 : 0.2)], [A.x0 - 40 * u, A.y0 - 40 * u, A.x1 + 40 * u, A.y1]] };
  }
  function insideness(z, x, y, m) {
    let best = 0;
    for (const [x0, y0, x1, y1] of z.rects) {
      const dx = Math.max(x0 - x, 0, x - x1), dy = Math.max(y0 - y, 0, y - y1);
      best = Math.max(best, 1 - clamp(Math.hypot(dx, dy) / m));
    }
    return best;
  }
  // Headlines (HTML, above the art) are revealed behind the wall during a change, so the outgoing and
  // incoming headings never share the frame.
  const SCENE_IDS = ["title", "chart", "object", "people", "process", "compare", "closing"];
  function headClip(S, info) {
    if (typeof document === "undefined") return;
    const c = Math.max(0.05, info.change || 0.45);
    const sweeping = info.index > 0 && info.local < c && info.scene;
    const pos = sweeping ? sweepPos(S, sweepK(info.local, c, info.scene)) : 0;
    for (const id of SCENE_IDS) {
      const el = document.getElementById(id + "-scene");
      if (!el) continue;
      let v = "none";
      if (sweeping && id === info.scene) {
        const big = 4000;
        if (S.tall) { const y = (pos - el.offsetTop).toFixed(1); v = `polygon(-${big}px ${y}px, ${big}px ${y}px, ${big}px ${big}px, -${big}px ${big}px)`; }
        else { const x = (pos - el.offsetLeft).toFixed(1); v = `polygon(-${big}px -${big}px, ${x}px -${big}px, ${x}px ${big}px, -${big}px ${big}px)`; }
      }
      if (el.style.clipPath !== v) el.style.clipPath = v;
    }
  }
  function stage(ctx, S, info) {
    CUR.t = info.t; CUR.index = info.index; CUR.next = info.next; CUR.scene = info.scene;
    headClip(S, info);
    if (!S.paint) return;
    const th = theme(S);
    const cam = camera(info);
    aurora(ctx, S, th, info.t, cam);
    const M = mascotAt(S, info, cam);
    const statement = (id) => id === "title" || id === "closing";
    // decoration fades out of the headline band and the drawing; headline-only beats drop a third of it
    const zc = zones(S, M.id), zp = M.prevId && info.index > 0 ? zones(S, M.prevId) : zc, zb = camera(info).b;
    const fade = (front) => (x, y, size, f) => {
      const m = size + 60 * S.u;
      const ins = lerp(insideness(zp, x, y, m), insideness(zc, x, y, m), zb);
      const thin = (f.i % 3 === 2) ? lerp(zp.thin, zc.thin, zb) : 0;
      return (1 - (front ? 0.85 : 0.72) * ins) * (1 - thin);
    };
    const gR = M.R * lerp(statement(M.prevId || M.id) ? 1.65 : 1.5, statement(M.id) ? 1.65 : 1.5, zb);
    const F = floaters();
    for (const f of F) if (f.d < 0.62) drawFloater(ctx, S, th, f, info.t, cam, fade(false));
    gyro(ctx, S, th, M.ax, M.ay, gR, info.t, false);
    mascot(ctx, S, th, info, cam, M);
    gyro(ctx, S, th, M.ax, M.ay, gR, info.t, true);
    for (const f of F) if (f.d >= 0.62) drawFloater(ctx, S, th, f, info.t, cam, fade(true));
    if (!statement(info.scene)) {
      const sg = ctx.createLinearGradient(0, 0, 0, S.H * (S.tall ? 0.3 : 0.36));
      sg.addColorStop(0, th.light ? "rgba(255,255,255,0.55)" : "rgba(3,5,30,0.62)"); sg.addColorStop(1, th.light ? "rgba(255,255,255,0)" : "rgba(3,5,30,0)");
      ctx.fillStyle = sg; ctx.fillRect(0, 0, S.W, S.H * 0.4);
    }
    if (statement(info.scene)) {
      uiProps(ctx, S, th, info.t, info.scene);
      // orbiting stars above and below the headline band
      for (let k = 0; k < 4; k++) {
        const a = info.t * 0.4 + k * 1.3;
        sparkle(ctx, S.W * (0.06 + 0.56 * ((k * 0.37 + info.t * 0.02) % 1)), S.H * (0.1 + 0.04 * Math.sin(a * 1.7 + k)) + (k % 2) * S.H * 0.68, (22 + 10 * Math.sin(a * 3)) * S.u, a, 0.9, k % 2 ? CYAN : PINK);
      }
    }
  }

  // ---- scene changes: a wall of liquid metal sweeps across -----------------------------------------------
  function sweepPos(S, s) { return S.tall ? S.H * (1.07 - 1.14 * s) : S.W * (-0.07 + 1.14 * s); }
  // A polished chrome column: cylinder shading across it, sky-to-floor reflection along it, bevelled edges
  // with crisp rim lights, a rippling leading edge and droplets shed behind it.
  function sweepBand(ctx, S, th, s, t) {
    if (s <= 0.001 || s >= 0.999) return;
    const hor = !S.tall, pos = sweepPos(S, s), across = hor ? S.H : S.W, u = S.u;
    const bw = (hor ? S.W : S.H) * 0.12, half = bw / 2;
    const wob = 0.4 + 0.6 * Math.sin(Math.PI * s);
    const lead = (b) => half + (Math.sin(b / across * TAU * 1.6 + t * 5.2) * 0.16 + Math.sin(b / across * TAU * 4.1 - t * 8.3) * 0.06) * bw * wob;
    const trail = (b) => -half + Math.sin(b / across * TAU * 1.1 - t * 3.4 + 1.3) * 0.07 * bw * wob;
    const N = 48, b0 = -40 * u, b1 = across + 40 * u;
    const edge = (fn, c, from, to, off = 0, cont = false) => { for (let k = 0; k <= N; k++) { const bb = lerp(from, to, k / N); const aa = fn(bb) + off; if (k === 0 && !cont) c.moveTo(aa, bb); else c.lineTo(aa, bb); } };
    ctx.save();
    if (hor) ctx.transform(1, 0, 0, 1, pos, 0); else ctx.transform(0, -1, 1, 0, 0, pos);
    // contact shadow thrown ahead onto the outgoing scene
    const shg = ctx.createLinearGradient(half, 0, half + 110 * u, 0);
    shg.addColorStop(0, "rgba(3,4,28,0.5)"); shg.addColorStop(1, "rgba(3,4,28,0)");
    ctx.fillStyle = shg; ctx.fillRect(half - 20 * u, b0, 150 * u, b1 - b0);
    const body = (c) => { c.beginPath(); edge(lead, c, b0, b1); edge(trail, c, b1, b0, 0, true); c.closePath(); };
    // cylinder shading across the column
    body(ctx);
    const cg = ctx.createLinearGradient(-half, 0, half * 1.2, 0);
    const warm = th.accL;
    cg.addColorStop(0, "#151c68"); cg.addColorStop(0.07, "#3d63e0"); cg.addColorStop(0.17, "#eaf7ff"); cg.addColorStop(0.24, "#ffffff");
    cg.addColorStop(0.34, "#a9d4ff"); cg.addColorStop(0.5, "#4e78ea"); cg.addColorStop(0.62, rgba(mix(warm, [120, 90, 240], 0.3)));
    cg.addColorStop(0.74, "#7f5ae6"); cg.addColorStop(0.84, "#d8d0ff"); cg.addColorStop(0.9, "#ffffff"); cg.addColorStop(0.96, "#5a6ad8"); cg.addColorStop(1, "#141a60");
    ctx.fillStyle = cg; ctx.fill();
    // the world reflected along its length: sky above a soft horizon, warm floor below
    ctx.save(); body(ctx); ctx.clip();
    const hy = across * (0.5 + 0.04 * Math.sin(t * 1.3));
    const rg = ctx.createLinearGradient(0, 0, 0, across);
    rg.addColorStop(0, "rgba(40,90,230,0.55)"); rg.addColorStop(hy / across - 0.2, "rgba(150,210,255,0.25)"); rg.addColorStop(hy / across - 0.02, "rgba(240,250,255,0.35)");
    rg.addColorStop(hy / across, "rgba(22,28,100,0.6)"); rg.addColorStop(hy / across + 0.03, rgba(warm, 0.45)); rg.addColorStop(Math.min(0.97, hy / across + 0.3), "rgba(110,70,220,0.4)"); rg.addColorStop(1, "rgba(220,240,255,0.35)");
    ctx.fillStyle = rg; ctx.fillRect(-bw, b0, bw * 2.4, b1 - b0);
    // a glint runs down the column
    const gk = ((t * 0.9) % 1) * (across + 300 * u) - 150 * u;
    const gl = ctx.createLinearGradient(0, gk - 120 * u, 0, gk + 120 * u);
    gl.addColorStop(0, "rgba(255,255,255,0)"); gl.addColorStop(0.5, "rgba(255,255,255,0.55)"); gl.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gl; ctx.fillRect(-bw, gk - 120 * u, bw * 2.4, 240 * u);
    ctx.restore();
    // bevels: navy outline, dark inner edge, bright rim light just inside each edge
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    for (const [fn, sgn] of [[lead, -1], [trail, 1]]) {
      ctx.beginPath(); edge(fn, ctx, b0, b1); ctx.strokeStyle = "#070c34"; ctx.lineWidth = 6 * u; ctx.stroke();
      ctx.beginPath(); edge(fn, ctx, b0, b1, sgn * 7 * u); ctx.strokeStyle = "rgba(255,255,255,0.95)"; ctx.lineWidth = 3.2 * u; ctx.stroke();
      ctx.beginPath(); edge(fn, ctx, b0, b1, sgn * 15 * u); ctx.strokeStyle = "rgba(12,18,80,0.45)"; ctx.lineWidth = 4 * u; ctx.stroke();
      ctx.beginPath(); edge(fn, ctx, b0, b1, sgn * 21 * u); ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 2 * u; ctx.stroke();
    }
    // droplets shed behind, and beads bulging off the leading edge
    const rd = rng(9);
    for (let k = 0; k < 7; k++) {
      const bb = rd() * across, back = bw * (0.75 + rd() * 1.3) * (0.6 + 0.4 * s), r = bw * (0.07 + rd() * 0.08) * (1 - 0.35 * s);
      const aa = -half - back + Math.sin(t * 3 + k) * 6 * u;
      ctx.drawImage(sprite(th, k), aa - r, bb - r, r * 2, r * 2);
    }
    for (let k = 0; k < 3; k++) {
      const bb = across * (0.18 + 0.32 * k) + Math.sin(t * 2 + k) * 30 * u, r = bw * 0.1 * wob;
      ctx.drawImage(sprite(th, k + 1), lead(bb) + r * 0.2, bb - r, r * 2, r * 2);
    }
    ctx.restore();
  }
  // Sweep progress for a scene change. Into a headline-only beat the wall runs faster, so the outgoing
  // drawing is cleared before the headline lands.
  const isStatement = (id) => id === "title" || id === "closing";
  function sweepK(local, c, into) { const k = clamp(local / (isStatement(into) ? c * 0.7 : c)); return 1 - Math.pow(1 - k, 1.8); }
  function wrap(fn) {
    return (ctx, S, box, p, d, info) => {
      const th = theme(S);
      const c = Math.max(0.05, info.change || 0.45);
      const leaving = info.exit !== undefined;
      const arriving = !leaving && CUR.index > 0 && info.local < c;
      const intoStatement = leaving && isStatement(CUR.scene);
      const sp = leaving ? sweepK(info.exit * c, c, CUR.scene) : arriving ? sweepK(info.local, c, null) : 1;
      ctx.save();
      if (leaving || arriving) {
        const pos = sweepPos(S, sp);
        ctx.beginPath();
        if (S.tall) { if (leaving) ctx.rect(0, -10, S.W, pos + 10); else ctx.rect(0, pos, S.W, S.H - pos + 10); }
        else if (leaving) ctx.rect(pos, 0, S.W - pos + 10, S.H); else ctx.rect(-10, 0, pos + 10, S.H);
        ctx.clip();
      }
      // The incoming drawing is already forming while the wall passes: progress gets a head start that
      // eases in over the change, so the frame behind the wall is never empty.
      const lc = Math.max(0, info.local || 0);
      const head = CUR.index > 0 ? 0.42 * sm(0, 1, lc / (c * 1.3)) : lerp(0.3, 0.42, sm(0, 1, lc / 0.6));
      const q = leaving ? 1 : p + (1 - p) * head;
      // into a headline-only beat the old drawing also dims away ahead of the wall
      if (intoStatement) ctx.globalAlpha *= 1 - sm(0, 0.55, info.exit);
      fn(ctx, S, th, q, d, info, Math.max(0, info.t));
      ctx.restore();
      if (arriving || intoStatement) sweepBand(ctx, S, th, sp, info.t);
    };
  }
  function area(S) {
    const u = S.u, tall = S.tall;
    return { u, tall, W: S.W, H: S.H, x0: (tall ? 70 : 130) * u, x1: S.W - (tall ? 70 : 130) * u, y0: S.H * (tall ? 0.31 : 0.33), y1: S.H * (tall ? 0.94 : 0.95) };
  }
  function glow(ctx, x, y, r, col, a = 0.4) {
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
  }
  function bead(ctx, th, x, y, r, col = CYAN) {
    glow(ctx, x, y, r * 3.2, col, 0.45);
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, "#fff"); g.addColorStop(0.55, rgba(mix(col, WHITE, 0.35))); g.addColorStop(1, rgba(col));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  function polylineAt(pts, lens, total, d) {
    const target = clamp(d, 0, 1) * total;
    let i = 1; while (i < lens.length - 1 && lens[i] < target) i++;
    const a = pts[i - 1], b = pts[i], l0 = lens[i - 1], l1 = lens[i];
    const k = l1 > l0 ? (target - l0) / (l1 - l0) : 0;
    return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), Math.atan2(b[1] - a[1], b[0] - a[0])];
  }

  // ---- chart: capsule towers on a mirror floor -----------------------------------------------------------
  function chartScene(ctx, S, th, p, d, info, T) {
    const A = area(S), u = S.u;
    const n = d.values.length, max = Math.max(...d.values, 1);
    const bx0 = A.x0, bx1 = S.tall ? A.x1 : S.W * 0.79;
    const slot = (bx1 - bx0) / n, bw = Math.min(S.tall ? 170 * u : 190 * u, slot * 0.6);
    const floor = A.y0 + (A.y1 - A.y0) * (S.tall ? 0.8 : 0.78), hMax = floor - A.y0 - 130 * u;
    // guide lines scroll sideways
    ctx.save(); ctx.setLineDash([14 * u, 18 * u]); ctx.lineDashOffset = -T * 40 * u; ctx.lineWidth = 2.2 * u; ctx.strokeStyle = "rgba(190,220,255,0.3)";
    for (let k = 1; k <= 3; k++) { const gy = floor - (hMax * k) / 3; ctx.beginPath(); ctx.moveTo(bx0 - 30 * u, gy); ctx.lineTo(bx0 - 30 * u + (bx1 - bx0 + 60 * u) * eo(p * 1.5), gy); ctx.stroke(); }
    ctx.restore();
    // floor: a long chrome rail with a pool of light
    const fl = eo(p * 1.8);
    glow(ctx, (bx0 + bx1) / 2, floor, (bx1 - bx0) * 0.6, th.acc, 0.12);
    tube(ctx, th, 20 * u, (c) => { c.beginPath(); c.moveTo(bx0 - 40 * u, floor); c.lineTo(bx0 - 40 * u + (bx1 - bx0 + 80 * u) * fl, floor); }, { cross: 1 });
    const hot = d.highlight;
    const bars = d.values.map((v, i) => {
      const q = back(seg(p, i * 0.11, i * 0.11 + 0.46)), qq = clamp(q, 0, 1.2);
      const breathe = p >= 1 ? 1 + 0.014 * Math.sin(T * 2.2 + i * 1.3) : 1;
      const h = hMax * (v / max) * qq * breathe;
      const x = bx0 + slot * i + (slot - bw) / 2;
      return { v, i, x, h, qq, hot: i === hot, tint: i === hot ? th.acc : [SILVER, CYAN, VIOLET, LIME, GOLD][i % 5] };
    });
    // reflections
    ctx.save(); ctx.beginPath(); ctx.rect(bx0 - 60 * u, floor + 12 * u, bx1 - bx0 + 120 * u, 150 * u); ctx.clip();
    ctx.globalAlpha = 0.24; ctx.translate(0, floor * 2 + 24 * u); ctx.scale(1, -1);
    for (const b of bars) if (b.h > 4) capsule(ctx, th, b.x, floor - b.h, bw, b.h, b.tint, { ph: b.i });
    ctx.restore();
    // ring behind the highlighted bar
    const hb = bars[hot];
    const orbit = (front) => {
      if (!hb || hb.h < 30 * u) return;
      const cx = hb.x + bw / 2, cy = floor - hb.h * 0.55;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.28);
      tube(ctx, th, 15 * u, (c) => { c.beginPath(); c.ellipse(0, 0, bw * 1.15, bw * 0.34, 0, front ? 0 : Math.PI, front ? Math.PI : TAU); }, { y0: -bw, y1: bw, hy: 0.5, glow: th.acc });
      const a = T * 2.2 + 0.5; const bxx = Math.cos(a) * bw * 1.15, byy = Math.sin(a) * bw * 0.34;
      if ((byy > 0) === front) bead(ctx, th, bxx, byy, 11 * u, th.accL);
      ctx.restore();
    };
    orbit(false);
    for (const b of bars) {
      if (b.h > 2) capsule(ctx, th, b.x, floor - b.h, bw, b.h, b.tint, { ph: b.i });
    }
    orbit(true);
    for (const b of bars) {
      if (b.qq < 0.06) continue;
      const cx = b.x + bw / 2, vs = Math.max(96 * u, Math.min(116 * u, slot * 0.9 / (String(M_fmt(b.v, d)).length * 0.62)));
      ctext(ctx, S, th, M_fmt(b.v * clamp(b.qq), d), cx, floor - b.h - 26 * u, vs, { align: "center", hot: b.hot });
      // label pill under the rail
      const la = eo(seg(p, b.i * 0.11 + 0.2, b.i * 0.11 + 0.5));
      if (la > 0.02) { ctx.save(); ctx.globalAlpha = la; pill(ctx, S, th, d.labels[b.i] || "", cx, floor + 84 * u + (1 - la) * 24 * u, 42 * u, { tint: b.hot ? th.acc : null, color: b.hot ? NAVY : NAVY, ph: b.i }); ctx.restore(); }
      if (b.hot) {
        sparkle(ctx, cx + bw * 0.85, floor - b.h - 70 * u + Math.sin(T * 2) * 6 * u, 40 * u * (0.8 + 0.2 * Math.sin(T * 4)), T * 0.7, 1, th.accL);
        sparkle(ctx, cx - bw * 0.9, floor - b.h * 0.6, 22 * u * (0.7 + 0.3 * Math.sin(T * 3 + 1)), -T * 0.5, 0.9, CYAN);
      }
      // a bead rides the top of every bar
      const rb = 10 * u, bxy = cx + Math.cos(T * 1.6 + b.i) * bw * 0.62, byy = floor - b.h + 14 * u + Math.sin(T * 1.6 + b.i) * 6 * u;
      if (!b.hot) bead(ctx, th, bxy, byy, rb, [CYAN, PINK, LIME, GOLD][b.i % 4]);
    }
    // scattered droplets on the rail so the floor is never still
    for (let k = 0; k < 7; k++) {
      const kk = (T * 0.12 + k / 7) % 1;
      bead(ctx, th, bx0 + (bx1 - bx0) * kk, floor + Math.sin(kk * 20 + k) * 3 * u, (5 + (k % 3) * 2) * u, [CYAN, PINK, GOLD][k % 3]);
    }
    if (d.span) {
      const a = eo(seg(p, 0.5, 0.9)); ctx.save(); ctx.globalAlpha = a * 0.0; ctx.restore();
    }
  }
  function M_fmt(v, d) { return window.DreamcutMotion.formatNumber(v, 0, d.prefix, d.suffix); }

  // ---- object: a floating glossy device with timeline, callouts on chrome tubes ----------------------------
  function objectScene(ctx, S, th, p, d, info, T) {
    const A = area(S), u = S.u, phone = d.kind === "phone";
    const w = phone ? Math.min(A.W * 0.3, (A.y1 - A.y0) * 0.5) : Math.min(S.tall ? A.W * 0.8 : A.W * 0.5, (A.y1 - A.y0) * 1.3);
    const h = phone ? w * 1.95 : w * 0.62;
    const cx = S.tall ? S.W / 2 : A.x0 + w / 2 + 20 * u, cy = S.tall ? A.y0 + (A.y1 - A.y0) * 0.26 : A.y0 + (A.y1 - A.y0) * 0.46;
    const arrive = back(seg(p, 0, 0.45));
    // pedestal glow and shadow
    glow(ctx, cx, cy + h * 0.62, w * 0.9, th.acc, 0.16);
    ctx.save(); ctx.globalAlpha = 0.4 * clamp(arrive); ctx.fillStyle = "rgba(2,4,30,0.8)"; ctx.beginPath(); ctx.ellipse(cx, cy + h * 0.66, w * (0.46 + 0.02 * Math.sin(T * 1.3)), h * 0.05, 0, 0, TAU); ctx.fill(); ctx.restore();
    const device = (c) => {
      c.save(); c.translate(cx, cy + Math.sin(T * 1.3) * 10 * u); c.rotate(Math.sin(T * 0.7) * 0.022); c.scale(arrive, arrive); c.globalAlpha = clamp(arrive * 2);
      const x = -w / 2, y = -h / 2;
      // lid
      rr(c, x, y, w, h, (phone ? 54 : 26) * u);
      c.fillStyle = envGrad(c, th, y, y + h, 0.5 + 0.06 * Math.sin(T * 0.8)); c.fill(); c.strokeStyle = NAVY; c.lineWidth = 5 * u; c.stroke();
      const pad = (phone ? 26 : 30) * u, sx = x + pad, sy = y + pad, sw = w - pad * 2, sh = h - pad * 2;
      rr(c, sx, sy, sw, sh, 12 * u); const sg = c.createLinearGradient(0, sy, 0, sy + sh); sg.addColorStop(0, "#14246e"); sg.addColorStop(1, "#0b0f3c"); c.fillStyle = sg; c.fill();
      c.save(); rr(c, sx, sy, sw, sh, 12 * u); c.clip();
      // preview: an iridescent field with a rolling bead
      const pv = { x: sx + sw * 0.06, y: sy + sh * 0.07, w: sw * 0.88, h: sh * 0.44 };
      const pg = c.createLinearGradient(pv.x, pv.y, pv.x + pv.w, pv.y + pv.h);
      const sh0 = 0.5 + 0.5 * Math.sin(T * 0.8);
      pg.addColorStop(0, rgba(mix(CYAN, VIOLET, sh0))); pg.addColorStop(0.5, rgba(mix(VIOLET, PINK, sh0))); pg.addColorStop(1, rgba(mix(PINK, GOLD, sh0)));
      rr(c, pv.x, pv.y, pv.w, pv.h, 10 * u); c.fillStyle = pg; c.fill();
      c.save(); rr(c, pv.x, pv.y, pv.w, pv.h, 10 * u); c.clip();
      const bxp = pv.x + pv.w * (0.5 + 0.34 * Math.sin(T * 0.9)), byp = pv.y + pv.h * (0.52 + 0.14 * Math.sin(T * 1.7));
      c.drawImage(sprite(th, 1), bxp - pv.h * 0.3, byp - pv.h * 0.3, pv.h * 0.6, pv.h * 0.6);
      for (let k = 0; k < 4; k++) sparkle(c, pv.x + pv.w * ((k * 0.27 + T * 0.05) % 1), pv.y + pv.h * (0.2 + 0.6 * ((k * 0.43) % 1)), 12 * u, T + k, 0.9, WHITE);
      c.restore();
      // three tracks of clips sliding gently, a playhead
      const th0 = sh * 0.1;
      for (let tr = 0; tr < 3; tr++) {
        const ty = sy + sh * 0.58 + tr * (th0 + sh * 0.045);
        const clips = [[0.0, 0.3], [0.33, 0.22], [0.58, 0.34], [0.95, 0.3]];
        clips.forEach(([cx0, cw], k) => {
          const slide = ((cx0 + tr * 0.07 - (T * 0.02) + 1.3) % 1.3) - 0.15;
          const shown = clamp((arrive - 0.35 - k * 0.1 - tr * 0.06) * 3);
          if (shown <= 0) return;
          rr(c, sx + sw * (0.06 + slide * 0.88), ty, sw * cw * 0.88 * shown, th0, 6 * u);
          c.fillStyle = rgba([CYAN, PINK, LIME][tr], 0.92); c.fill();
          c.strokeStyle = "rgba(255,255,255,0.7)"; c.lineWidth = 1.6 * u; c.stroke();
        });
      }
      const px = sx + sw * (0.06 + 0.88 * ((T * 0.11) % 1));
      c.beginPath(); c.moveTo(px, sy + sh * 0.55); c.lineTo(px, sy + sh * 0.97); c.strokeStyle = "#fff"; c.lineWidth = 3 * u; c.stroke();
      c.beginPath(); c.arc(px, sy + sh * 0.55, 8 * u, 0, TAU); c.fillStyle = rgba(th.acc); c.fill();
      // glossy streak across the glass
      const stk = (((T * 0.22) % 1.5) - 0.25);
      c.globalAlpha = 0.16; c.fillStyle = "#fff"; c.beginPath(); const gx = sx + sw * stk;
      c.moveTo(gx, sy); c.lineTo(gx + sw * 0.16, sy); c.lineTo(gx + sw * 0.16 - sh * 0.35, sy + sh); c.lineTo(gx - sh * 0.35, sy + sh); c.closePath(); c.fill(); c.globalAlpha = 1;
      c.restore();
      c.strokeStyle = "rgba(255,255,255,0.6)"; c.lineWidth = 2 * u; rr(c, sx, sy, sw, sh, 12 * u); c.stroke();
      if (!phone) {
        c.beginPath(); c.moveTo(x - w * 0.07, y + h + h * 0.07); c.lineTo(x + w * 1.07, y + h + h * 0.07); c.lineTo(x + w, y + h); c.lineTo(x, y + h); c.closePath();
        c.fillStyle = envGrad(c, th, y + h, y + h * 1.07, 0.3); c.fill(); c.strokeStyle = NAVY; c.lineWidth = 4 * u; c.stroke();
        rr(c, -w * 0.09, y + h + 1 * u, w * 0.18, h * 0.035, 6 * u); c.fillStyle = "rgba(0,0,40,0.6)"; c.fill();
      }
      c.restore();
    };
    // anchors in device space (approx, before wobble)
    const x0 = cx - w / 2, y0 = cy - h / 2;
    const pad = (phone ? 26 : 30) * u, sx = x0 + pad, sy = y0 + pad, sw = w - pad * 2, sh = h - pad * 2;
    const anchors = S.tall ? [[sx + sw * 0.2, sy + sh * 0.9], [sx + sw * 0.5, sy + sh * 0.9], [sx + sw * 0.8, sy + sh * 0.9]] : [[sx + sw * 0.86, sy + sh * 0.2], [sx + sw + 6 * u, sy + sh * 0.775], [sx + sw + 6 * u, sy + sh * 0.92]];
    device(ctx);
    // callouts
    const tint = [CYAN, th.acc, LIME];
    d.callouts.forEach((label, i) => {
      if (!label) return;
      const q = eo(seg(p, 0.3 + i * 0.12, 0.7 + i * 0.1));
      if (q <= 0.005) return;
      const [ax, ay] = anchors[i];
      const lx = S.tall ? S.W * 0.1 : A.x0 + w + (A.x1 - A.x0 - w) * 0.14, ly = S.tall ? A.y0 + (A.y1 - A.y0) * (0.58 + i * 0.14) : A.y0 + (A.y1 - A.y0) * (0.18 + i * 0.3);
      const bob = Math.sin(T * 1.5 + i * 2) * 7 * u;
      const ex = lx - 18 * u, ey = ly + bob;
      const pts = [], lens = [0]; let total = 0;
      for (let k = 0; k <= 30; k++) { const kk = k / 30; const mx = lerp(ax, ex, kk) , my = lerp(ay, ey, kk) + Math.sin(kk * Math.PI) * -50 * u * (i - 1); pts.push([mx, my]); if (k) { total += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); lens.push(total); } }
      const upto = Math.max(2, Math.floor(30 * q));
      tube(ctx, th, 12 * u, (c) => { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k <= upto; k++) c.lineTo(pts[k][0], pts[k][1]); }, { cross: 1, glow: tint[i] });
      bead(ctx, th, ax, ay, 12 * u, tint[i]);
      ctx.drawImage(sprite(th, i), ax - 15 * u, ay - 15 * u, 30 * u, 30 * u);
      if (q > 0.95) { const [mx, my] = polylineAt(pts, lens, total, ((T * 0.45 + i * 0.3) % 1)); bead(ctx, th, mx, my, 7 * u, WHITE); }
      if (q > 0.55) {
        ctx.save(); ctx.globalAlpha = clamp((q - 0.55) * 3); const sc = back(clamp((q - 0.55) * 2.4));
        ctx.translate(ex, ey); ctx.scale(sc, sc); ctx.translate(-ex, -ey);
        const bs = 38 * u;
        ctx.drawImage(sprite(th, i + 1), lx - bs * 1.1 - 0.5 * bs, ey - bs, bs * 2, bs * 2); // number orb on the leader end
        ctx.fillStyle = NAVY; ctx.font = font(S, 40 * u, "display", 900); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(i + 1), lx - bs * 0.6, ey + 2 * u);
        pill(ctx, S, th, label, lx + bs * 0.9, ey, 44 * u, { align: "left", tint: i === 1 ? th.acc : null, ph: i });
        ctx.restore();
      }
    });
    // dimension tick: a small chrome bracket under the device
    ctx.save(); ctx.globalAlpha = 0.6 * eo(seg(p, 0.5, 0.8));
    for (let k = 0; k < 6; k++) { const ky = ((T * 0.2 + k / 6) % 1); bead(ctx, th, cx - w * 0.5 + w * ky, cy + h * 0.66 + Math.sin(ky * 14 + k) * 4 * u, 4 * u, [CYAN, PINK][k % 2]); }
    ctx.restore();
  }

  // ---- people: glossy egg-head crew on spinning pedestals ------------------------------------------------
  function personScene(ctx, S, th, p, d, info, T) {
    const A = area(S), u = S.u;
    const n = Math.max(2, Math.min(6, Math.round(d.count)));
    const right = S.tall ? A.x1 : S.W * 0.86;
    const slot = (right - A.x0) / n;
    const size = Math.min((A.y1 - A.y0) * (S.tall ? 0.34 : 0.56), slot * 1.12);
    const base = S.tall ? A.y0 + (A.y1 - A.y0) * 0.62 : A.y1 - 120 * u;
    const tints = [CYAN, PINK, LIME, VIOLET, GOLD, SILVER];
    const hotI = Math.min(n - 1, d.highlight ?? 1);
    const pos = [];
    for (let i = 0; i < n; i++) pos.push([A.x0 + slot * (i + 0.5), base]);
    // link beams between neighbouring pedestals, with beads travelling
    for (let i = 0; i < n - 1; i++) {
      const q = eo(seg(p, 0.35 + i * 0.08, 0.8));
      if (q <= 0.01) continue;
      const [x1, y1] = pos[i], [x2, y2] = pos[i + 1], my = y1 + size * 0.34;
      const pts = [], lens = [0]; let total = 0;
      for (let k = 0; k <= 24; k++) { const kk = k / 24; const px = lerp(x1, x2, kk), py = lerp(y1, y2, kk) + Math.sin(kk * Math.PI) * (my - y1); pts.push([px, py]); if (k) { total += Math.hypot(px - pts[k - 1][0], py - pts[k - 1][1]); lens.push(total); } }
      const upto = Math.max(2, Math.floor(24 * q));
      tube(ctx, th, 10 * u, (c) => { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k <= upto; k++) c.lineTo(pts[k][0], pts[k][1]); }, { cross: 1, glow: CYAN });
      if (q > 0.9) for (let k = 0; k < 3; k++) { const [bx, by] = polylineAt(pts, lens, total, ((T * 0.3 + k / 3 + i * 0.17) % 1)); bead(ctx, th, bx, by, 7 * u, k % 2 ? PINK : CYAN); }
    }
    for (let i = 0; i < n; i++) {
      const [cx, by] = pos[i];
      const q = back(seg(p, i * 0.09, i * 0.09 + 0.42));
      if (q <= 0.01) continue;
      const hot = i === hotI, tint = hot ? th.acc : tints[i % tints.length];
      const s = size * (hot ? 1.08 : 1) * clamp(q, 0, 1.15);
      const bob = Math.sin(T * 2 + i * 1.3) * 0.02 * size;
      // pedestal: a disc of light with a rotating chrome ring
      glow(ctx, cx, by, s * 0.7, tint, 0.25);
      ctx.save(); ctx.translate(cx, by); ctx.scale(1, 0.2);
      tube(ctx, th, s * 0.07, (c) => { c.beginPath(); c.arc(0, 0, s * 0.46, 0, TAU); }, { y0: -s * 0.5, y1: s * 0.5, hy: 0.5 + 0.1 * Math.sin(T + i) });
      ctx.restore();
      ctx.save(); ctx.translate(cx, by); ctx.scale(1, 0.2); ctx.rotate(T * 1.2 + i);
      ctx.setLineDash([s * 0.06, s * 0.12]); ctx.beginPath(); ctx.arc(0, 0, s * 0.62, 0, TAU); ctx.strokeStyle = rgba(tint, 0.8); ctx.lineWidth = s * 0.03; ctx.stroke(); ctx.restore();
      // arms
      const bodyW = s * 0.56, bodyH = s * 0.5, bodyY = by - bodyH - s * 0.03 + bob;
      const armSw = hot ? Math.sin(T * 5) * 0.5 - 0.7 : Math.sin(T * 1.8 + i) * 0.18;
      for (const sd of [-1, 1]) {
        const sh = [cx + sd * bodyW * 0.46, bodyY + bodyH * 0.28];
        const ang = sd === 1 && hot ? armSw - 1.1 : Math.PI / 2 + sd * (0.35 + Math.sin(T * 1.8 + i + sd) * 0.12);
        const len = s * 0.34, ex2 = sh[0] + Math.cos(sd === 1 && hot ? -1.15 + armSw * 0.4 : ang) * len * (sd === -1 ? -1 : 1) * (sd === 1 && hot ? 1 : 1), ey2 = sh[1] + Math.sin(sd === 1 && hot ? -1.15 + armSw * 0.4 : ang) * len;
        tube(ctx, th, s * 0.1, (c) => { c.beginPath(); c.moveTo(sh[0], sh[1]); c.lineTo(ex2, ey2); }, { cross: 1 });
      }
      // jellybean body
      capsule(ctx, th, cx - bodyW / 2, bodyY, bodyW, bodyH, tint, { ph: i, r: bodyW * 0.46 });
      // head: live chrome sphere, tinted floor colour
      const hr = s * 0.25, hy = bodyY - hr * 0.78;
      metal(ctx, th, [{ x: cx, y: hy, r: hr }], T, { key: "head", cs: Math.max(1.4 * u, hr / 42), warm: mix(tint, WHITE, 0.3), top: mix(tint, [30, 60, 230], 0.5), ph: i * 0.17 + T * 0.03, shift: Math.sin(T * 0.7 + i) * 0.3 });
      ctx.beginPath(); ctx.arc(cx, hy, hr * 0.99, 0, TAU); ctx.strokeStyle = NAVY; ctx.lineWidth = 3.4 * u; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, hy, hr * 0.94, Math.PI * 1.1, Math.PI * 1.6); ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 2.4 * u; ctx.stroke();
      // visor
      ctx.save(); ctx.translate(cx, hy + hr * 0.06); ctx.rotate(Math.sin(T * 0.9 + i) * 0.05);
      rr(ctx, -hr * 0.72, -hr * 0.27, hr * 1.44, hr * 0.56, hr * 0.28);
      const vg = ctx.createLinearGradient(0, -hr * 0.27, 0, hr * 0.29); vg.addColorStop(0, "#2a3796"); vg.addColorStop(0.5, "#0a0e3e"); vg.addColorStop(1, "#050725"); ctx.fillStyle = vg; ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = 2.4 * u; ctx.stroke();
      const bl = ((T + i * 0.7) % 3.1) < 0.12 ? 0.15 : 1;
      for (const sd of [-1, 1]) { ctx.save(); ctx.translate(sd * hr * 0.3 + Math.sin(T * 0.8 + i) * hr * 0.06, 0); ctx.scale(1, bl); ctx.fillStyle = hot ? rgba(th.accL) : "#8cf4ff"; ctx.shadowColor = hot ? th.accS : "#5ee0ff"; ctx.shadowBlur = 14 * u; ctx.beginPath(); ctx.arc(0, 0, hr * 0.11, 0, TAU); ctx.fill(); ctx.restore(); }
      ctx.restore();
      // badge
      const label = i < d.badges.length ? d.badges[i] : "";
      if (label && q > 0.8) {
        const bq = back(seg(q, 0.8, 1)), by2 = hy - hr - 52 * u + Math.sin(T * 1.8 + i * 1.7) * 7 * u;
        ctx.save(); ctx.translate(cx, by2); ctx.scale(bq, bq); ctx.translate(-cx, -by2);
        const bw2 = pill(ctx, S, th, label, cx, by2, 40 * u, { tint: hot ? th.acc : null, ph: i * 0.3 });
        ctx.beginPath(); ctx.moveTo(cx - 10 * u, by2 + 32 * u); ctx.lineTo(cx, by2 + 48 * u); ctx.lineTo(cx + 10 * u, by2 + 32 * u); ctx.closePath(); ctx.fillStyle = hot ? rgba(mix(th.acc, [20, 10, 80], 0.2)) : "#aebffa"; ctx.fill(); ctx.strokeStyle = NAVY; ctx.lineWidth = 3 * u; ctx.stroke();
        void bw2;
        ctx.restore();
      }
      if (hot && q > 0.9) { sparkle(ctx, cx + s * 0.38, hy - hr * 0.2, 26 * u * (0.8 + 0.2 * Math.sin(T * 4)), T, 1, th.accL); sparkle(ctx, cx - s * 0.36, hy + hr * 0.5, 16 * u, -T, 0.9, CYAN); }
    }
  }

  // ---- process: orbs joined by a pipe of flowing light -------------------------------------------------------
  function processScene(ctx, S, th, p, d, info, T) {
    const A = area(S), u = S.u, n = d.steps.length;
    const R = Math.min(S.tall ? 170 * u : 150 * u, (S.tall ? A.W * 0.2 : (A.x1 - A.x0) / n * 0.4));
    const nx0 = Math.max(A.x0 + 120 * u, 48 * u + R * 1.6), nx1 = Math.min(A.x1 - 120 * u, S.W - 48 * u - R * 1.6);
    const nodes = [];
    for (let i = 0; i < n; i++) {
      const k = n > 1 ? i / (n - 1) : 0.5;
      if (S.tall) nodes.push([S.W * (0.5 + (i % 2 ? 0.2 : -0.2)), A.y0 + (A.y1 - A.y0) * (0.1 + 0.78 * k) - 0]);
      else nodes.push([lerp(nx0, nx1, k), A.y0 + (A.y1 - A.y0) * (0.4 + (i % 2 ? 0.14 : -0.1))]);
    }
    // smooth path through the nodes (Catmull-Rom)
    const ctl = [[2 * nodes[0][0] - nodes[1][0], 2 * nodes[0][1] - nodes[1][1]], ...nodes, [2 * nodes[n - 1][0] - nodes[n - 2][0], 2 * nodes[n - 1][1] - nodes[n - 2][1]]];
    const pts = [];
    for (let i = 0; i < ctl.length - 3; i++) for (let k = 0; k < 24; k++) {
      const t = k / 24, a = ctl[i], b = ctl[i + 1], c = ctl[i + 2], dd = ctl[i + 3];
      const f = (j) => 0.5 * ((2 * b[j]) + (-a[j] + c[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - dd[j]) * t * t + (-a[j] + 3 * b[j] - 3 * c[j] + dd[j]) * t * t * t);
      pts.push([f(0), f(1)]);
    }
    pts.push(nodes[n - 1]);
    const lens = [0]; let total = 0; for (let k = 1; k < pts.length; k++) { total += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); lens.push(total); }
    const draw = eo(seg(p, 0, 0.7));
    const upto = Math.max(2, Math.floor((pts.length - 1) * draw));
    tube(ctx, th, 40 * u, (c) => { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k <= upto; k++) c.lineTo(pts[k][0], pts[k][1]); }, { cross: 1, glow: CYAN });
    // light flows inside the pipe
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    const reach = draw * total;
    for (let k = 0; k < 22; k++) {
      const dd = ((T * 0.16 + k / 22) % 1) * total;
      if (dd > reach) continue;
      const [bx, by] = polylineAt(pts, lens, total, dd / total);
      const col = [CYAN, PINK, WHITE, LIME][k % 4];
      ctx.fillStyle = rgba(col, 0.9); ctx.beginPath(); ctx.arc(bx, by, (5 + (k % 3) * 2.5) * u, 0, TAU); ctx.fill();
      glow(ctx, bx, by, 22 * u, col, 0.4);
    }
    ctx.restore();
    // chevrons between orbs ride the pipe
    for (let i = 0; i < n - 1; i++) {
      const dm = polylineAt(pts, lens, total, (lens[Math.min(pts.length - 1, (i * 24) + 12)] / total));
      if (dm[0] === undefined || draw * total < lens[Math.min(pts.length - 1, i * 24 + 12)]) continue;
      ctx.save(); ctx.translate(dm[0], dm[1]); ctx.rotate(dm[2]);
      ctx.beginPath(); ctx.moveTo(-18 * u, -22 * u); ctx.lineTo(18 * u, 0); ctx.lineTo(-18 * u, 22 * u); ctx.lineTo(-8 * u, 0); ctx.closePath();
      ctx.fillStyle = "#fff"; ctx.strokeStyle = NAVY; ctx.lineWidth = 3.4 * u; ctx.stroke(); ctx.fill(); ctx.restore();
    }
    const active = Math.floor((T * 0.62) % n);
    for (let i = 0; i < n; i++) {
      const [cx, cy] = nodes[i];
      const q = back(seg(p, 0.15 + i * 0.18, 0.5 + i * 0.18));
      if (q <= 0.01) continue;
      const on = i === active && p > 0.7, last = i === n - 1;
      const r = R * clamp(q, 0, 1.12) * (on ? 1.05 + 0.02 * Math.sin(T * 6) : 1);
      const tint = last ? th.acc : [CYAN, VIOLET, LIME][i % 3];
      if (on) { for (let k = 0; k < 3; k++) { const ph = ((T * 0.9 + k / 3) % 1); ctx.save(); ctx.globalAlpha = (1 - ph) * 0.6; ctx.beginPath(); ctx.arc(cx, cy, r * (1.1 + ph * 0.45), 0, TAU); ctx.strokeStyle = rgba(tint, 1); ctx.lineWidth = 4 * u; ctx.stroke(); ctx.restore(); } }
      glow(ctx, cx, cy, r * 2, tint, on ? 0.34 : 0.16);
      // chrome ring
      ctx.save(); ctx.translate(cx, cy);
      tube(ctx, th, r * 0.2, (c) => { c.beginPath(); c.arc(0, 0, r, 0, TAU); }, { y0: -r, y1: r, hy: 0.5 + 0.07 * Math.sin(T * 0.9 + i) });
      // glass interior with a drifting colour swirl
      ctx.beginPath(); ctx.arc(0, 0, r * 0.84, 0, TAU); ctx.save(); ctx.clip();
      const ig = ctx.createRadialGradient(-r * 0.2, -r * 0.3, r * 0.1, 0, 0, r * 0.9); ig.addColorStop(0, rgba(mix(tint, WHITE, 0.4), 0.9)); ig.addColorStop(1, rgba(mix(tint, [10, 10, 70], 0.7), 1)); ctx.fillStyle = ig; ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.45;
      for (let k = 0; k < 3; k++) { const a = T * (0.6 + k * 0.2) + k * 2.1 + i; const sg = ctx.createRadialGradient(Math.cos(a) * r * 0.35, Math.sin(a) * r * 0.35, 0, Math.cos(a) * r * 0.35, Math.sin(a) * r * 0.35, r * 0.5); sg.addColorStop(0, rgba([CYAN, PINK, GOLD][k], 0.8)); sg.addColorStop(1, rgba([CYAN, PINK, GOLD][k], 0)); ctx.fillStyle = sg; ctx.fillRect(-r, -r, r * 2, r * 2); }
      ctx.restore();
      processIcon(ctx, i, last ? 3 : i % 3, 0, 0, r * 0.9 * (last ? 1 + 0.025 * Math.sin(T * 2.4) : 1), T, u, eo(seg(p, 0.62 + (i - 2) * 0.18, 0.86 + (i - 2) * 0.18)));
      ctx.restore();
      // number badge
      const bs = r * 0.3;
      ctx.drawImage(sprite(th, i + 1), cx - r * 0.95 - bs, cy - r * 0.95 - bs, bs * 2, bs * 2);
      ctx.fillStyle = NAVY; ctx.font = font(S, bs * 1.05, "display", 900); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(i + 1), cx - r * 0.95, cy - r * 0.95 + 2 * u);
      // label
      const la = eo(seg(p, 0.3 + i * 0.18, 0.62 + i * 0.18));
      if (la > 0.02) { ctx.save(); ctx.globalAlpha = la; pill(ctx, S, th, d.steps[i], cx, cy + r * 1.42 + (1 - la) * 20 * u, 44 * u, { tint: last ? th.acc : null, ph: i * 0.4 }); ctx.restore(); }
    }
  }
  function processIcon(ctx, i, kind, cx, cy, s, T, u, build = 1) {
    ctx.save(); ctx.translate(cx, cy); ctx.lineCap = "round"; ctx.lineJoin = "round";
    const stroke = (w, col) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(); };
    ctx.shadowColor = "rgba(255,255,255,0.9)"; ctx.shadowBlur = 14 * u;
    ctx.beginPath();
    if (kind === 0) { // document with a scanning line
      ctx.moveTo(-s * 0.3, -s * 0.42); ctx.lineTo(s * 0.1, -s * 0.42); ctx.lineTo(s * 0.3, -s * 0.2); ctx.lineTo(s * 0.3, s * 0.42); ctx.lineTo(-s * 0.3, s * 0.42); ctx.closePath();
      for (let k = 0; k < 3; k++) { ctx.moveTo(-s * 0.16, -s * 0.05 + k * s * 0.18); ctx.lineTo(s * 0.16 - k * s * 0.05, -s * 0.05 + k * s * 0.18); }
      stroke(s * 0.075, "#fff");
      const sy = -s * 0.4 + ((T * 0.7) % 1) * s * 0.8; ctx.beginPath(); ctx.moveTo(-s * 0.36, sy); ctx.lineTo(s * 0.36, sy); stroke(s * 0.05, "#7ef4ff");
    } else if (kind === 1) { // a pencil writing a squiggle that keeps drawing itself
      const k = ((T * 0.55) % 1.25) / 1.0, wk = clamp(k);
      const sx0 = -s * 0.36, sx1 = s * 0.3, wy = s * 0.3;
      ctx.beginPath();
      const steps = Math.max(2, Math.floor(28 * wk));
      for (let q = 0; q <= steps; q++) { const qq = (q / 28); const xx = lerp(sx0, sx1, qq), yy = wy + Math.sin(qq * TAU * 1.6) * s * 0.07; if (q === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy); }
      stroke(s * 0.065, "#ffd0f0");
      const tipX = lerp(sx0, sx1, wk), tipY = wy + Math.sin(wk * TAU * 1.6) * s * 0.07;
      ctx.save(); ctx.translate(tipX, tipY); ctx.rotate(-0.85 + Math.sin(T * 9) * 0.04);
      const L = s * 0.62, Wd = s * 0.15;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * 0.13, -Wd / 2); ctx.lineTo(L, -Wd / 2); ctx.lineTo(L, Wd / 2); ctx.lineTo(s * 0.13, Wd / 2); ctx.closePath();
      ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fill(); stroke(s * 0.06, "#fff");
      ctx.beginPath(); ctx.moveTo(L - s * 0.12, -Wd / 2); ctx.lineTo(L - s * 0.12, Wd / 2); ctx.moveTo(s * 0.13, -Wd / 2); ctx.lineTo(s * 0.13, Wd / 2); stroke(s * 0.045, "#fff");
      ctx.restore();
    } else if (kind === 2) { // eye
      ctx.moveTo(-s * 0.46, 0); ctx.quadraticCurveTo(0, -s * 0.46, s * 0.46, 0); ctx.quadraticCurveTo(0, s * 0.46, -s * 0.46, 0); stroke(s * 0.075, "#fff");
      ctx.beginPath(); ctx.arc(Math.sin(T * 1.2) * s * 0.06, 0, s * 0.15, 0, TAU); ctx.fillStyle = "#fff"; ctx.fill();
    } else { // tick that draws once, then holds while a glint runs along it
      const k = clamp(build);
      ctx.moveTo(-s * 0.32, s * 0.02);
      if (k < 0.4) ctx.lineTo(lerp(-s * 0.32, -s * 0.08, k / 0.4), lerp(s * 0.02, s * 0.26, k / 0.4));
      else { ctx.lineTo(-s * 0.08, s * 0.26); ctx.lineTo(lerp(-s * 0.08, s * 0.36, (k - 0.4) / 0.6), lerp(s * 0.26, -s * 0.24, (k - 0.4) / 0.6)); }
      stroke(s * 0.13, "#fff");
      if (k >= 1) {
        const pts = [[-s * 0.32, s * 0.02], [-s * 0.08, s * 0.26], [s * 0.36, -s * 0.24]];
        const gk = ((T * 0.55) % 1.3);
        if (gk < 1) {
          const l1 = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]), l2 = Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]);
          const dd = gk * (l1 + l2), a = dd < l1 ? pts[0] : pts[1], b2 = dd < l1 ? pts[1] : pts[2], kk = dd < l1 ? dd / l1 : (dd - l1) / l2;
          const gx = lerp(a[0], b2[0], kk), gy = lerp(a[1], b2[1], kk);
          ctx.shadowBlur = 0; ctx.globalCompositeOperation = "lighter";
          const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, s * 0.22); gg.addColorStop(0, "rgba(255,255,255,0.95)"); gg.addColorStop(0.4, "rgba(170,240,255,0.5)"); gg.addColorStop(1, "rgba(170,240,255,0)");
          ctx.fillStyle = gg; ctx.fillRect(gx - s * 0.22, gy - s * 0.22, s * 0.44, s * 0.44);
        }
      }
    }
    ctx.restore();
  }

  // ---- compare: two glass vials filling with liquid metal -----------------------------------------------------
  function compareScene(ctx, S, th, p, d, info, T) {
    const A = area(S), u = S.u;
    const vh = (A.y1 - A.y0) * (S.tall ? 0.62 : 0.6), vw = Math.min(S.tall ? 230 * u : 250 * u, (A.x1 - A.x0) * 0.2);
    const c1 = S.tall ? S.W * 0.27 : S.W * 0.27, c2 = S.tall ? S.W * 0.73 : S.W * 0.62;
    const top = S.tall ? A.y0 + 130 * u : A.y0 + 120 * u, bottom = top + vh;
    const max = Math.max(d.leftValue, d.rightValue, 1);
    const liquid = th.mono ? [200, 206, 222] : mix(th.acc, [150, 60, 255], 0.25);
    const pairs = [[c1, d.left, d.leftValue, liquid, false], [c2, d.right, d.rightValue, liquid, true]];
    pairs.forEach(([cx, label, value, tint, hot], i) => {
      const q = back(seg(p, i * 0.18, i * 0.18 + 0.5)), fillQ = eo(seg(p, 0.15 + i * 0.18, 0.75 + i * 0.12));
      if (q <= 0.01) return;
      const x = cx - vw / 2, y = top + (1 - clamp(q)) * 40 * u;
      ctx.save(); ctx.globalAlpha = clamp(q * 2);
      glow(ctx, cx, y + vh * 0.55, vh * 0.7, tint, hot ? 0.24 : 0.12);
      // back glass
      rr(ctx, x, y, vw, vh, vw / 2); ctx.fillStyle = "rgba(200,225,255,0.1)"; ctx.fill();
      // liquid
      ctx.save(); rr(ctx, x + 6 * u, y + 6 * u, vw - 12 * u, vh - 12 * u, vw / 2 - 6 * u); ctx.clip();
      const lh = (vh - 12 * u) * (value / max) * fillQ, ly = y + vh - 6 * u - lh;
      ctx.beginPath(); ctx.moveTo(x, y + vh);
      for (let xx = 0; xx <= vw; xx += vw / 20) ctx.lineTo(x + xx, ly + Math.sin(xx / vw * 6 + T * 3.2 + i * 2) * 7 * u + Math.sin(xx / vw * 11 - T * 2) * 3 * u);
      ctx.lineTo(x + vw, y + vh); ctx.closePath();
      const lc = tint, ldk = mix(tint, [16, 8, 70], 0.55);
      if (lh > 2 * u) { ctx.save(); ctx.clip(); capsule(ctx, th, x + 6 * u, y + 6 * u, vw - 12 * u, vh - 12 * u, tint, { ph: i * 1.7, key: "vial" }); ctx.restore(); }
      // meniscus: a lit surface ellipse with a bright lip and a dark line beneath
      if (lh > 4 * u) {
        const wave = (xx) => ly + Math.sin(xx / vw * 6 + T * 3.2 + i * 2) * 7 * u + Math.sin(xx / vw * 11 - T * 2) * 3 * u;
        const my = wave(vw / 2), er = Math.min(vw * 0.12, lh * 0.5);
        ctx.beginPath(); ctx.ellipse(cx, my, vw / 2, er, 0, 0, TAU);
        const mg = ctx.createLinearGradient(0, my - er, 0, my + er); mg.addColorStop(0, rgba(mix(lc, WHITE, 0.75))); mg.addColorStop(1, rgba(mix(lc, WHITE, 0.25)));
        ctx.fillStyle = mg; ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.95)"; ctx.lineWidth = 4 * u; ctx.beginPath(); ctx.ellipse(cx, my, vw / 2 - 8 * u, er, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
        ctx.strokeStyle = rgba(ldk, 0.9); ctx.lineWidth = 4 * u; ctx.beginPath(); ctx.ellipse(cx, my + 3 * u, vw / 2, er, 0, Math.PI * 0.08, Math.PI * 0.92); ctx.stroke();
      }
      const rg = rng(31 + i);
      for (let k = 0; k < 9; k++) {
        const sx = rg(), sp = 0.12 + rg() * 0.14, r0 = (7 + rg() * 12) * u, ph0 = rg();
        const kk = (T * sp + ph0) % 1, by = y + vh - 8 * u - kk * lh;
        if (lh > 30 * u) bubble(ctx, x + vw * (0.2 + 0.6 * sx) + Math.sin(T * 2 + k) * 6 * u, by, r0, T, k, 0.9);
      }
      ctx.restore();
      // glass sheen and chrome caps
      ctx.save(); rr(ctx, x, y, vw, vh, vw / 2); ctx.clip();
      const sg = ctx.createLinearGradient(x, 0, x + vw, 0); sg.addColorStop(0.08, "rgba(255,255,255,0.0)"); sg.addColorStop(0.16, "rgba(255,255,255,0.55)"); sg.addColorStop(0.26, "rgba(255,255,255,0.0)"); sg.addColorStop(0.82, "rgba(255,255,255,0)"); sg.addColorStop(0.88, "rgba(255,255,255,0.3)"); sg.addColorStop(0.93, "rgba(255,255,255,0)");
      ctx.fillStyle = sg; ctx.fillRect(x, y, vw, vh); ctx.restore();
      rr(ctx, x, y, vw, vh, vw / 2); ctx.strokeStyle = NAVY; ctx.lineWidth = 6 * u; ctx.stroke(); ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 2.4 * u; rr(ctx, x + 4 * u, y + 4 * u, vw - 8 * u, vh - 8 * u, vw / 2 - 4 * u); ctx.stroke();
      // tick marks on the glass
      for (let k = 1; k < 6; k++) { const ty = y + vh * 0.14 + (vh * 0.72 * k) / 6; ctx.beginPath(); ctx.moveTo(x + vw - 8 * u, ty); ctx.lineTo(x + vw - (k % 2 ? 26 : 40) * u, ty); ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 3 * u; ctx.stroke(); }
      // foot disc
      ctx.save(); ctx.translate(cx, y + vh + 10 * u); ctx.scale(1, 0.22);
      tube(ctx, th, vw * 0.16, (c) => { c.beginPath(); c.arc(0, 0, vw * 0.78, 0, TAU); }, { y0: -vw, y1: vw, hy: 0.5 + 0.1 * Math.sin(T + i) });
      ctx.restore();
      ctx.restore();
      // number and label
      ctx.save(); ctx.globalAlpha = clamp(q);
      ctext(ctx, S, th, window.DreamcutMotion.formatNumber(value * clamp(fillQ), 0, d.prefix, d.suffix), cx, y - 22 * u, Math.min(150 * u, vw * 0.85), { align: "center", hot });
      pill(ctx, S, th, label, cx, y + vh + 100 * u, 44 * u, { tint: hot ? th.acc : null, ph: i * 0.5 });
      ctx.restore();
      if (hot && q > 0.9) { sparkle(ctx, cx + vw * 0.7, y + 20 * u + Math.sin(T * 2) * 8 * u, 36 * u * (0.8 + 0.2 * Math.sin(T * 4)), T * 0.7, 1, th.accL); sparkle(ctx, cx - vw * 0.75, y + vh * 0.35, 20 * u, -T * 0.6, 0.9, CYAN); }
    });
    // delta badge between the vials
    const bq = back(seg(p, 0.55, 0.9));
    if (bq > 0.02 && d.leftValue > 0) {
      const pct = Math.round(((d.rightValue - d.leftValue) / d.leftValue) * 100);
      const mx = (c1 + c2) / 2, my = top + vh * 0.5 + Math.sin(T * 1.7) * 10 * u;
      ctx.save(); ctx.translate(mx, my); ctx.scale(bq, bq); ctx.rotate(Math.sin(T * 1.2) * 0.05); ctx.translate(-mx, -my);
      glow(ctx, mx, my, 170 * u, pct < 0 ? CYAN : th.acc, 0.3);
      const dir = pct < 0 ? 1 : -1;
      pill(ctx, S, th, (pct > 0 ? "+" : pct < 0 ? "−" : "") + Math.abs(pct) + "%", mx + 20 * u, my, 56 * u, { tint: pct < 0 ? mix(LIME, CYAN, 0.5) : th.acc, icon: (c, ix, iy, s) => {
        c.beginPath(); c.moveTo(ix - s * 0.4, iy - dir * s * 0.18); c.lineTo(ix, iy + dir * s * 0.28); c.lineTo(ix + s * 0.4, iy - dir * s * 0.18); c.strokeStyle = NAVY; c.lineWidth = s * 0.17; c.lineCap = "round"; c.lineJoin = "round"; c.stroke(); } });
      ctx.restore();
      // bridge: beads travel from the left vial to the right one
      for (let k = 0; k < 5; k++) { const kk = (T * 0.25 + k / 5) % 1; bead(ctx, th, lerp(c1 + vw * 0.7, c2 - vw * 0.7, kk), my + Math.sin(kk * Math.PI) * -70 * u + (kk < 0.5 ? 0 : 0), 6 * u, [CYAN, PINK, WHITE][k % 3]); }
    }
  }

  // ---- look -----------------------------------------------------------------------------------------------------
  const BODY = "'Avenir Next', 'Arial Rounded MT Bold', 'Trebuchet MS', 'Segoe UI', Arial, sans-serif";
  const DISPLAY = "'Arial Rounded MT Bold', 'Avenir Next Heavy', 'Avenir Next', 'Trebuchet MS', 'Segoe UI', Arial, sans-serif";
  return {
    bg: "#070d33", panel: "rgba(190,215,255,0.14)", ink: "#f2f7ff", muted: "rgba(226,236,255,0.82)", accent: "#ff4fb8", onAccent: "#070c34",
    rule: "rgba(200,220,255,0.5)", track: "rgba(255,255,255,0.14)", panelEdge: "rgba(255,255,255,0.6)",
    display: DISPLAY, displayWeight: 800, displayCase: "none", displayTracking: "0.005em",
    body: BODY, bodyWeight: 700, figures: DISPLAY, radius: 36, motion: "rise", change: "fade",
    kit: { line: 3, fill: "solid", panel: "glass" },
    skyTop: [44, 96, 232],
    base: "radial-gradient(70% 55% at 86% 96%, rgba(255,64,190,0.42), rgba(255,64,190,0) 70%), radial-gradient(60% 60% at 8% 6%, rgba(40,200,255,0.3), rgba(40,200,255,0) 70%), radial-gradient(50% 40% at 50% 58%, rgba(120,90,255,0.2), rgba(120,90,255,0) 70%), linear-gradient(180deg, #050a2c 0%, #101057 52%, #2a0e66 100%)",
    palettes: {
      light: { bg: "#e9f0ff", ink: "#0b1450", muted: "rgba(11,20,80,0.74)", accent: "#e0198f", onAccent: "#ffffff", rule: "rgba(11,20,80,0.3)", track: "rgba(11,20,80,0.1)", panel: "rgba(255,255,255,0.5)", panelEdge: "rgba(255,255,255,0.9)",
        base: "radial-gradient(70% 55% at 86% 96%, rgba(255,120,210,0.5), rgba(255,120,210,0) 70%), radial-gradient(60% 60% at 8% 6%, rgba(120,220,255,0.55), rgba(120,220,255,0) 70%), radial-gradient(50% 40% at 50% 58%, rgba(170,150,255,0.35), rgba(170,150,255,0) 70%), linear-gradient(180deg, #f4f8ff 0%, #dfe6ff 52%, #f0dcff 100%)" },
      dark: { bg: "#03051c", base: "radial-gradient(70% 55% at 86% 96%, rgba(255,64,190,0.3), rgba(255,64,190,0) 70%), radial-gradient(60% 60% at 8% 6%, rgba(40,160,255,0.22), rgba(40,160,255,0) 70%), linear-gradient(180deg, #020418 0%, #080a3a 52%, #190846 100%)" },
      mono: { bg: "#14161c", accent: "#e9edf6", onAccent: "#14161c", skyTop: [96, 104, 130], mono: 1, panel: "rgba(210,216,230,0.12)",
        base: "radial-gradient(70% 55% at 86% 96%, rgba(220,226,240,0.2), rgba(220,226,240,0) 70%), radial-gradient(60% 60% at 8% 6%, rgba(160,170,200,0.2), rgba(160,170,200,0) 70%), linear-gradient(180deg, #0d0f14 0%, #1a1d26 52%, #262a36 100%)" },
    },
    textShadow: () => "none",
    backdrop: (accent, texture = 1, look) => `${grain(0.05 * texture)}, ${look.base}`,
    // Headlines become chrome bubble lettering: sky, horizon and warm floor gradient clipped to the glyphs, a navy outline, a glint that slides.
    css: (accent, look) => {
      const light = lum(rgb(look.bg)) > 150;
      const a = rgb(accent);
      const warm = rgba(mix(a, WHITE, 0.4));
      return `.display { color: transparent; -webkit-text-fill-color: transparent; text-shadow: none !important; padding: 0.08em 0.12em 0.16em 0.04em; font-weight: 900;
          -webkit-text-stroke: 0.05em transparent; text-wrap: balance;
          filter: drop-shadow(0.035em 0 0 #070c34) drop-shadow(-0.035em 0 0 #070c34) drop-shadow(0 0.035em 0 #070c34) drop-shadow(0 -0.035em 0 #070c34) drop-shadow(0 0.1em 0.06em rgba(2,4,30,0.7)) drop-shadow(0 0 0.3em ${light ? "rgba(255,255,255,0.7)" : "rgba(110,150,255,0.45)"});
          background-image: linear-gradient(100deg, rgba(255,255,255,0) 38%, rgba(255,255,255,0.95) 50%, rgba(255,255,255,0) 62%),
            linear-gradient(180deg, #ffffff 0%, #ffffff 12%, #d4eeff 24%, #7fbcff 38%, #3462e6 47%, #121864 51%, ${warm} 57%, #ffd6f2 66%, #b072ff 80%, #5a34cc 92%, #241470 100%);
          background-size: 260% 1.04em, 100% 1.04em; background-repeat: repeat-y;
          background-position: var(--glint, 150%) 0.08em, 0 0.08em; -webkit-background-clip: text; background-clip: text; }
        #title, #closing { width: auto !important; max-width: 72%; }
        #title-scene .kicker { align-self: flex-start; padding: 0.5em 1.2em; border-radius: 999px; letter-spacing: 0.14em; color: #070c34; text-shadow: none;
          background: linear-gradient(180deg, #ffffff 0%, #cfe0ff 50%, #aebffa 52%, #eaf2ff 100%); border: 3px solid #070c34; box-shadow: inset 0 0 0 2px rgba(255,255,255,0.85), 0 12px 30px rgba(5,8,40,0.5); font-weight: 800; }`;
    },
    // The texture pass: drifting glitter and a vignette over the whole frame, plus the headline glint.
    paint: (ctx, W, H, t, accent, look) => {
      ctx.clearRect(0, 0, W, H);
      const u = H / 1080;
      const root = document.getElementById("root");
      if (root) root.style.setProperty("--glint", (150 - ((t * 38) % 190)) + "%");
      const r = rng(21);
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (let k = 0; k < 70; k++) {
        const x = r() * W, y = r() * H, ph = r() * TAU, sp = 0.6 + r() * 1.6, s = (2 + r() * 5) * u;
        const a = Math.max(0, Math.sin(t * sp + ph)); if (a < 0.35) continue;
        ctx.strokeStyle = `rgba(255,255,255,${a * 0.85})`; ctx.lineWidth = Math.max(1, 1.4 * u); ctx.beginPath();
        ctx.moveTo(x - s * 1.8 * a, y); ctx.lineTo(x + s * 1.8 * a, y); ctx.moveTo(x, y - s * 1.8 * a); ctx.lineTo(x, y + s * 1.8 * a); ctx.stroke();
      }
      ctx.restore();
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
      v.addColorStop(0, "rgba(2,3,24,0)"); v.addColorStop(1, "rgba(2,3,24,0.42)"); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    },
    paintOver: true,
    keepArt: true,
    overlap: true,
    stage,
    scenes: { chart: wrap(chartScene), object: wrap(objectScene), people: wrap(personScene), process: wrap(processScene), compare: wrap(compareScene) },
  };
});
