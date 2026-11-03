// Deep Sea: a bioluminescent abyss. Near-black water, drifting marine snow in three parallax
// layers, haze of living light, a seafloor garden of sea pens, tube worms and a smoking vent.
// Every element is drawn in additive light: glowing pyrosome columns for a chart, a lit
// observation pod for an object, helmeted divers for people, a current of light carrying a
// messenger fish between three stations, and two swirling bait balls for a comparison. Scenes
// sit along a current; each change is a glide with the water igniting behind a travelling front.
// Every frame is a pure function of time: seeded noise only, no clocks.
window.DreamcutMotion.register("deep-sea", ({ grain, rng }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const stag = (p, i, n, spread = 0.5) => eo((p - (i / Math.max(1, n)) * spread) / (1 - spread));
  const fract = (v) => v - Math.floor(v);
  const wrapN = (v, m) => ((v % m) + m) % m;

  // ---- colour -------------------------------------------------------------------------------------
  function rgb(value) {
    const s = String(value || "");
    if (s[0] === "#") {
      const h = s.length === 4 ? s.slice(1).split("").map((c) => c + c).join("") : s.slice(1, 7);
      const n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (m) return m[1].split(",").slice(0, 3).map(Number);
    return [120, 240, 255];
  }
  const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const WHITE = [255, 255, 255];

  function theme(S) {
    const L = S.look;
    const g = (L.glows || []).map(rgb);
    while (g.length < 4) g.push(rgb(S.accent));
    return {
      u: S.u, tex: L.texture ?? 1, acc: rgb(S.accent), ink: rgb(L.ink), inkS: L.ink, muted: L.muted,
      g1: g[0], g2: g[1], g3: g[2], warm: g[3], water: (L.water || ["#0a2a47", "#04152b", "#01050c"]).map(rgb),
      rock: rgb(L.rock || "#02070d"),
    };
  }

  // ---- light primitives ---------------------------------------------------------------------------
  // A cached radial glow sprite per colour, stamped additively: the medium's basic mark.
  const SPR = {};
  function sprite(c) {
    const key = (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0);
    if (SPR[key]) return SPR[key];
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const g = cv.getContext("2d");
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, rgba(mix(c, WHITE, 0.8), 1));
    gr.addColorStop(0.1, rgba(mix(c, WHITE, 0.35), 0.9));
    gr.addColorStop(0.28, rgba(c, 0.38));
    gr.addColorStop(0.6, rgba(c, 0.08));
    gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (SPR[key] = cv);
  }
  function glow(ctx, x, y, r, c, a = 1) {
    if (a <= 0.003 || r <= 0.2) return;
    const ga = ctx.globalAlpha, op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = ga * Math.min(1, a);
    ctx.drawImage(sprite(c), x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = ga; ctx.globalCompositeOperation = op;
  }
  // Stroke the current path as living light: a wide faint halo, a body and a hot core.
  function lum(ctx, c, w, a = 1) {
    if (a <= 0.003) return;
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = rgba(c, 0.08 * a); ctx.lineWidth = w * 8; ctx.stroke();
    ctx.strokeStyle = rgba(c, 0.26 * a); ctx.lineWidth = w * 3; ctx.stroke();
    ctx.strokeStyle = rgba(mix(c, WHITE, 0.45), 0.92 * a); ctx.lineWidth = w; ctx.stroke();
    ctx.globalCompositeOperation = op;
  }
  // A translucent membrane: the current path filled faintly with light.
  function membrane(ctx, c, a = 0.08) {
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = rgba(c, a); ctx.fill();
    ctx.globalCompositeOperation = op;
  }
  // A dark solid (rock, hull) that hides what is behind it.
  function solid(ctx, c, a = 1) { ctx.fillStyle = rgba(c, a); ctx.fill(); }
  function rr(ctx, x, y, w, h, r) {
    const q = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + q, y); ctx.arcTo(x + w, y, x + w, y + h, q); ctx.arcTo(x + w, y + h, x, y + h, q);
    ctx.arcTo(x, y + h, x, y, q); ctx.arcTo(x, y, x + w, y, q); ctx.closePath();
  }

  // ---- type ---------------------------------------------------------------------------------------
  function font(S, size, weight, fam = "body") {
    const L = S.look;
    const f = fam === "display" ? L.display : fam === "figures" ? L.figures : L.body;
    return `${weight ?? (fam === "body" ? 600 : L.displayWeight)} ${size}px ${f}`;
  }
  // Glowing type: the letters carry a soft halo of their own colour.
  function txt(ctx, S, th, s, x, y, size, o = {}) {
    s = String(s ?? "");
    if (!s) return 0;
    ctx.save();
    let z = size;
    ctx.font = font(S, z, o.weight, o.fam);
    if (o.max) while (z > size * 0.55 && ctx.measureText(s).width > o.max) { z *= 0.95; ctx.font = font(S, z, o.weight, o.fam); }
    if (o.max && ctx.measureText(s).width > o.max) {
      while (s.length > 1 && ctx.measureText(s + "…").width > o.max) s = s.slice(0, -1);
      s += "…";
    }
    try { ctx.letterSpacing = o.track ? `${o.track * z}px` : "0px"; } catch (err) { /* older canvas */ }
    ctx.textAlign = o.align || "left"; ctx.textBaseline = o.base || "middle";
    const c = o.color || th.ink;
    const gc = o.glowColor || c;
    // A dark halo first, so flora and trails behind never cut through the letters.
    if (o.halo !== false) {
      const dk = th.water[2];
      ctx.fillStyle = rgba(dk, 0.9); ctx.strokeStyle = rgba(dk, 0.75);
      ctx.shadowColor = rgba(dk, 0.95); ctx.shadowBlur = z * 0.7;
      ctx.lineWidth = z * 0.2; ctx.lineJoin = "round";
      ctx.strokeText(s, x, y); ctx.fillText(s, x, y);
    }
    ctx.fillStyle = rgba(c, 1);
    // Bloom: a wide soft pass, a body glow and a tight hot edge.
    ctx.shadowColor = rgba(gc, 0.55); ctx.shadowBlur = z * 0.9;
    ctx.fillText(s, x, y);
    ctx.shadowColor = rgba(gc, 0.9); ctx.shadowBlur = z * (o.glow ?? 0.32);
    ctx.fillText(s, x, y);
    ctx.shadowBlur = z * 0.08; ctx.shadowColor = rgba(mix(gc, WHITE, 0.4), 0.95);
    ctx.fillText(s, x, y);
    const w = ctx.measureText(s).width;
    ctx.restore();
    return w;
  }
  function textW(ctx, S, s, size, o = {}) { ctx.save(); ctx.font = font(S, size, o.weight, o.fam); const w = ctx.measureText(String(s)).width; ctx.restore(); return w; }
  const fmt = (v, d) => window.DreamcutMotion.formatNumber(v, Number.isInteger(Number(d.ref)) ? 0 : 1, d.prefix, d.suffix);

  // ---- noise --------------------------------------------------------------------------------------
  let NOISE = null;
  function noise() {
    if (NOISE) return NOISE;
    const c = document.createElement("canvas");
    c.width = c.height = 200;
    const g = c.getContext("2d");
    const img = g.createImageData(200, 200);
    const r = rng(23);
    for (let i = 0; i < img.data.length; i += 4) { const v = r() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    return (NOISE = c);
  }

  // ---- seeded populations -------------------------------------------------------------------------
  function particles(seed, n) {
    const r = rng(seed);
    return Array.from({ length: n }, () => ({ x: r(), y: r(), s: r(), ph: r() * TAU, k: r() }));
  }
  const SNOW = [particles(101, 280), particles(202, 120), particles(303, 22)];
  const MOTES = particles(707, 40);
  const FLARE = particles(404, 260);
  const SCHOOL = particles(505, 16);
  const SWARM = particles(606, 80);

  // ---- the camera: scenes sit along a current ----------------------------------------------------
  // The world drifts slowly all the time; each scene change glides one station along. `FRAME`
  // holds what the stage worked out this frame so the drawers share one camera.
  const FRAME = { t: 0, index: 0, local: 0, hold: 0, change: 0.45, camX: 0, vel: 0, glide: 1 };
  const DRIFT = 22;
  function stationGap(S) { return S.tall ? S.W * 0.95 : S.W * 0.62; }
  function cameraAt(S, t, index, local, change) {
    const D = stationGap(S), u = S.u;
    const g = index > 0 ? eio(local / Math.max(0.01, change)) : 1;
    const x = t * DRIFT * u + D * (Math.max(0, index - 1) + (index > 0 ? g : 0));
    // Velocity in px per second, for streaking snow during a glide.
    const gv = index > 0 && local < change ? (D / Math.max(0.01, change)) * 1.5 * Math.sin(Math.PI * clamp(local / change)) : 0;
    return { x, vel: DRIFT * u + gv, glide: g };
  }
  // Offset and fade for a scene drawing: incoming slides in from up-current, outgoing slides away.
  function sceneShift(S, info) {
    // Drawings sit a full frame apart, so the glide is one clean pan: never two drawings on top of each other.
    const D = S.W * 1.04;
    if (info.exit !== undefined) {
      // Front-loaded, so the old drawing is mostly gone before the new headline has focused.
      const g = eo(info.exit);
      return { dx: -D * g, a: 1 - eo(seg(info.exit, 0, 0.3)), blur: 10 * S.u * seg(info.exit, 0, 0.3) };
    }
    if (FRAME.index > 0 && info.local < info.change) {
      const g = eo(info.local / Math.max(0.01, info.change));
      return { dx: D * (1 - g), a: 0.35 + 0.65 * eo(seg(info.local, 0, info.change * 0.45)), blur: 5 * S.u * (1 - g) };
    }
    return { dx: 0, a: 1, blur: 0 };
  }

  // ---- the world ----------------------------------------------------------------------------------
  function water(ctx, S, th, t) {
    const { W, H } = S;
    const deep = clamp(FRAME.index * 0.08);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgba(mix(th.water[0], th.water[1], deep)));
    g.addColorStop(0.45, rgba(th.water[1]));
    g.addColorStop(1, rgba(th.water[2]));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // A memory of the surface far above: a pale bloom at the top, breathing slowly.
    const top = ctx.createRadialGradient(W * 0.42, -H * 0.25, 0, W * 0.42, -H * 0.25, Math.max(W, H) * 0.9);
    top.addColorStop(0, rgba(mix(th.g1, th.water[0], 0.4), 0.16 * (1 - deep) * (0.85 + 0.15 * Math.sin(t * 0.5))));
    top.addColorStop(1, rgba(th.g1, 0));
    ctx.fillStyle = top; ctx.fillRect(0, 0, W, H);
  }
  // Clouds of living light: large soft blooms in three colours that drift with slow parallax.
  function haze(ctx, S, th, t, camX) {
    const { W, H } = S;
    const cols = [th.g1, th.g2, th.g3, th.g2];
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 4; i++) {
      const span = W * 1.8;
      const x = wrapN(i * W * 0.47 + W * 0.2 - camX * 0.07 + Math.sin(t * 0.11 + i) * 60 * S.u, span) - W * 0.4;
      const y = H * (0.25 + 0.17 * i) + Math.sin(t * 0.17 + i * 2) * 40 * S.u;
      const r = Math.max(W, H) * (0.32 + 0.06 * (i % 2));
      const a = 0.1 * (0.75 + 0.25 * Math.sin(t * 0.4 + i * 1.7));
      const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rgba(cols[i], a)); gr.addColorStop(0.5, rgba(cols[i], a * 0.35)); gr.addColorStop(1, rgba(cols[i], 0));
      ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = op;
  }
  // A lantern ray: a broad original winged creature whose rims carry rows of photophores.
  function ray(ctx, th, x, y, s, flap, col, a) {
    ctx.save();
    ctx.translate(x, y);
    const f = Math.sin(flap) * 0.22;
    const wing = (side) => {
      ctx.moveTo(0, -s * 0.12);
      ctx.bezierCurveTo(side * s * 0.35, -s * 0.2, side * s * 0.7, -s * (0.05 + f), side * s * 1.0, s * (0.02 - f * 1.4));
      ctx.bezierCurveTo(side * s * 0.72, s * 0.08, side * s * 0.4, s * 0.2, 0, s * 0.28);
    };
    ctx.beginPath(); wing(-1); wing(1);
    membrane(ctx, col, 0.05 * a);
    // Head fins curling forward.
    ctx.moveTo(-s * 0.08, -s * 0.13); ctx.quadraticCurveTo(-s * 0.14, -s * 0.24, -s * 0.06, -s * 0.28);
    ctx.moveTo(s * 0.08, -s * 0.13); ctx.quadraticCurveTo(s * 0.14, -s * 0.24, s * 0.06, -s * 0.28);
    // Gill rows on the belly.
    for (let k = 0; k < 4; k++) { ctx.moveTo(-s * 0.1, s * (0.0 + k * 0.04)); ctx.lineTo(-s * 0.05, s * (0.0 + k * 0.04)); ctx.moveTo(s * 0.1, s * (0.0 + k * 0.04)); ctx.lineTo(s * 0.05, s * (0.0 + k * 0.04)); }
    lum(ctx, col, Math.max(1, s * 0.006), a * 0.7);
    // Tail.
    ctx.beginPath(); ctx.moveTo(0, s * 0.26);
    ctx.quadraticCurveTo(s * 0.06 * Math.sin(flap * 0.7), s * 0.6, -s * 0.05 * Math.sin(flap * 0.5), s * 0.95);
    lum(ctx, col, Math.max(1, s * 0.004), a * 0.5);
    // Photophore rows along each wing rim.
    for (const side of [-1, 1]) {
      for (let k = 1; k <= 9; k++) {
        const q = k / 10;
        const px = side * s * q * 0.98, py = -s * (0.12 - q * 0.1) - s * f * q * q * 1.2 + s * 0.05;
        glow(ctx, px, py, s * 0.035, k % 3 ? col : th.g3, a * (0.5 + 0.5 * Math.sin(flap * 1.3 + k)));
      }
    }
    // Eyes: two warm points.
    glow(ctx, -s * 0.06, -s * 0.06, s * 0.03, th.warm, a);
    glow(ctx, s * 0.06, -s * 0.06, s * 0.03, th.warm, a);
    ctx.restore();
  }
  function farRay(ctx, S, th, t) {
    const { W, H, u } = S;
    const period = 26;
    const k = Math.floor(t / period);
    const f = fract(t / period);
    const r = rng(k * 131 + 7);
    const y = H * (0.18 + r() * 0.3);
    const x = W * 1.25 - f * W * 1.6;
    ray(ctx, th, x, y + Math.sin(t * 0.6) * 20 * u, (150 + r() * 60) * u, t * 1.4, th.g2, 0.28);
  }
  // Comb jellies: original egg-shaped ctenophores whose comb rows shimmer as travelling rainbow
  // beads, trailing two feathered tentacles. Two depth layers drift with their own parallax.
  const COMBS = [particles(808, 7), particles(909, 5)];
  function combJelly(ctx, th, x, y, s, t, ph, a, tilt) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(tilt);
    const sq = 1 + 0.06 * Math.sin(t * 1.6 + ph);
    const rx = s * 0.42 / sq, ry = s * 0.62 * sq;
    // Tentacles first, behind the body.
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(side * rx * 0.35, ry * 0.6);
      let px = side * rx * 0.35, py = ry * 0.6;
      for (let k = 1; k <= 10; k++) {
        const q = k / 10;
        const nx = side * rx * (0.35 + q * 0.9) + Math.sin(t * 1.2 + ph + q * 5) * s * 0.18 * q;
        const ny = ry * 0.6 + q * s * 2.1;
        ctx.lineTo(nx, ny);
        if (k % 2 === 0) { ctx.moveTo(nx, ny); ctx.lineTo(nx + side * s * 0.1, ny - s * 0.05); ctx.moveTo(nx, ny); }
        px = nx; py = ny;
      }
      lum(ctx, th.g1, Math.max(0.6, s * 0.012), a * 0.35);
      glow(ctx, px, py, s * 0.06, th.g3, a * 0.6);
    }
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
    membrane(ctx, th.g1, 0.07 * a);
    lum(ctx, th.g1, Math.max(0.8, s * 0.018), a * 0.55);
    // Eight comb rows as meridians; beads of colour run down them.
    const cols = [th.g1, th.g2, th.g3, th.warm];
    for (let r = 0; r < 4; r++) {
      const m = -0.75 + r * 0.5;
      ctx.beginPath();
      for (let k = 0; k <= 12; k++) { const v = -Math.PI / 2 + (k / 12) * Math.PI; const ex = Math.cos(v) * rx * m, ey = Math.sin(v) * ry * 0.92; if (k) ctx.lineTo(ex, ey); else ctx.moveTo(ex, ey); }
      lum(ctx, th.g1, Math.max(0.5, s * 0.008), a * 0.3);
      for (let k = 0; k < 6; k++) {
        const f = fract(k / 6 + t * 0.55 + ph * 0.1 + r * 0.12);
        const v = -Math.PI / 2 + f * Math.PI;
        glow(ctx, Math.cos(v) * rx * m, Math.sin(v) * ry * 0.92, s * 0.075, cols[(k + r + Math.floor(t * 2)) % 4], a * 0.85 * Math.sin(Math.PI * f));
      }
    }
    glow(ctx, 0, -ry * 0.75, s * 0.12, th.warm, a * (0.6 + 0.4 * Math.sin(t * 2.4 + ph)));
    ctx.restore();
  }
  function combs(ctx, S, th, t, camX, layer) {
    const { W, H, u } = S;
    const par = layer ? 0.55 : 0.22;
    const size = (layer ? 46 : 26) * u;
    const alpha = layer ? 0.6 : 0.32;
    for (const p of COMBS[layer]) {
      const span = W + 400 * u;
      const x = wrapN(p.x * span - camX * par - t * (8 + p.s * 10) * u, span) - 200 * u;
      const y = H * (0.1 + p.y * 0.55) + Math.sin(t * 0.45 + p.ph) * 34 * u;
      combJelly(ctx, th, x, y, size * (0.75 + p.s * 0.6), t, p.ph, alpha * (0.6 + 0.4 * Math.sin(t * 0.7 + p.ph * 3)), Math.sin(t * 0.3 + p.ph) * 0.25 - 0.15);
    }
  }
  // A siphonophore: a long colonial chain of lit beads that snakes slowly across the far water.
  function siphonophore(ctx, S, th, t, camX) {
    const { W, H, u } = S;
    const period = 21;
    const k = Math.floor((t + 4) / period), f = fract((t + 4) / period);
    const r = rng(k * 59 + 17);
    const y0 = H * (0.14 + r() * 0.32);
    const head = -W * 0.5 + f * W * 2.1;
    const len = W * 0.55, n = 46;
    ctx.beginPath();
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const q = i / n;
      const x = head - q * len;
      const y = y0 + Math.sin(q * 6 - t * 0.9) * 40 * u + q * 30 * u;
      pts.push([x, y]);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    // It recedes while a statement holds the frame, so it never threads through the big words.
    const sa = FRAME.scene === "title" || FRAME.scene === "closing" ? 0.3 : 1;
    ctx.save(); ctx.globalAlpha *= sa;
    lum(ctx, th.g2, 1.1 * u, 0.3);
    pts.forEach(([x, y], i) => {
      const pulse = Math.pow(0.5 + 0.5 * Math.sin(i * 0.5 - t * 3.5), 3);
      glow(ctx, x, y, (5 + pulse * 7) * u * (i === 0 ? 2.4 : 1), i % 5 === 0 ? th.g3 : th.g2, 0.25 + 0.55 * pulse);
      if (i % 3 === 1) { ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 6 * u, y + 30 * u, x - 4 * u + Math.sin(t * 2 + i) * 8 * u, y + 64 * u); lum(ctx, th.g2, 0.7 * u, 0.18); }
    });
    ctx.restore();
  }
  // Faint shafts of the surface far above, swaying; they dim as the dive goes deeper.
  function shafts(ctx, S, th, t) {
    const { W, H } = S;
    const deep = clamp(FRAME.index * 0.1);
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 5; i++) {
      const x = W * (0.12 + i * 0.21) + Math.sin(t * 0.21 + i * 1.9) * W * 0.04;
      const w = W * (0.035 + 0.02 * ((i * 7) % 3));
      const a = (0.05 + 0.03 * Math.sin(t * 0.5 + i * 2.3)) * (1 - deep * 0.7) * th.tex;
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.85);
      g.addColorStop(0, rgba(th.g1, a)); g.addColorStop(1, rgba(th.g1, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x - w * 0.4, 0); ctx.lineTo(x + w * 0.4, 0); ctx.lineTo(x + w * 1.6 + W * 0.08, H * 0.85); ctx.lineTo(x - w * 0.2 + W * 0.08, H * 0.85); ctx.closePath(); ctx.fill();
    }
    ctx.globalCompositeOperation = op;
  }
  // Far ridge: a pale silhouette with distant colonies glinting along its crest.
  function ridgeY(S, wx) { return S.H * (S.tall ? 0.8 : 0.76) + Math.sin(wx * 0.0021) * 46 * S.u + Math.sin(wx * 0.0057 + 1.3) * 22 * S.u + Math.sin(wx * 0.013) * 8 * S.u; }
  function ridge(ctx, S, th, t, camX) {
    const { W, H, u } = S;
    const off = camX * 0.25;
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 20; x += 20 * u) ctx.lineTo(x, ridgeY(S, x + off));
    ctx.lineTo(W, H); ctx.closePath();
    const g = ctx.createLinearGradient(0, H * 0.7, 0, H);
    g.addColorStop(0, rgba(mix(th.water[1], th.g1, 0.07), 0.95)); g.addColorStop(1, rgba(th.water[2], 1));
    ctx.fillStyle = g; ctx.fill();
    ctx.beginPath();
    for (let x = 0; x <= W + 20; x += 20 * u) { const y = ridgeY(S, x + off); if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    lum(ctx, th.g1, 1.2 * u, 0.22);
    const step = 140 * u;
    const first = Math.floor(off / step);
    for (let k = first; k < first + W / step + 2; k++) {
      const r = rng(k * 71 + 3);
      if (r() < 0.45) continue;
      const x = k * step - off + r() * step;
      const y = ridgeY(S, x + off) - 4 * u;
      glow(ctx, x, y, (10 + r() * 14) * u, r() < 0.7 ? th.g1 : th.g3, 0.35 + 0.3 * Math.sin(t * (0.8 + r()) + k));
    }
  }
  // Marine snow: three parallax layers drifting down; the near layer streaks during a glide.
  function snow(ctx, S, th, t, camX, layer) {
    const { W, H, u } = S;
    const P = SNOW[layer];
    const par = [0.18, 0.45, 1.25][layer];
    const size = [1.6, 2.6, 7][layer] * u;
    const fall = [9, 16, 30][layer] * u;
    const alpha = [0.45, 0.6, 0.32][layer] * (0.55 + 0.45 * th.tex);
    const streak = FRAME.vel * par * 0.05;
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    for (const p of P) {
      const x = wrapN(p.x * (W + 200 * u) - camX * par + Math.sin(t * 0.4 + p.ph) * 14 * u, W + 200 * u) - 100 * u;
      const y = wrapN(p.y * (H + 100 * u) + t * fall * (0.6 + p.s), H + 100 * u) - 50 * u;
      const tw = 0.55 + 0.45 * Math.sin(t * (1 + p.k * 2) + p.ph);
      const c = p.k < 0.75 ? th.g1 : p.k < 0.9 ? th.g3 : th.g2;
      const r = size * (0.6 + p.s);
      if (streak > 3 * u) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + streak * (0.6 + p.s), y);
        ctx.strokeStyle = rgba(c, alpha * tw * 0.6); ctx.lineWidth = r * 0.8; ctx.lineCap = "round"; ctx.stroke();
      }
      ctx.globalAlpha = alpha * tw;
      ctx.drawImage(sprite(c), x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = op;
  }
  // Mid-water drifters: larger coloured lights that pulse and wander with gentle parallax.
  function motes(ctx, S, th, t, camX) {
    const { W, H, u } = S;
    const cols = [th.g1, th.g2, th.g3, th.warm];
    for (const p of MOTES) {
      const x = wrapN(p.x * (W + 300 * u) - camX * 0.6 + Math.sin(t * 0.3 + p.ph) * 40 * u, W + 300 * u) - 150 * u;
      const y = H * (0.08 + p.y * 0.72) + Math.sin(t * 0.5 + p.ph * 2) * 30 * u;
      const pulse = Math.pow(0.5 + 0.5 * Math.sin(t * (0.8 + p.k) + p.ph), 2);
      const c = cols[Math.floor(p.k * 4) % 4];
      glow(ctx, x, y, (10 + p.s * 16) * u * (0.8 + 0.4 * pulse), c, 0.25 + 0.55 * pulse);
      // A faint trailing wisp.
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 18 * u, y + 20 * u + Math.sin(t + p.ph) * 8 * u, x + 6 * u, y + 46 * u * (0.5 + p.s));
      lum(ctx, c, 0.8 * u, 0.25 * pulse);
    }
  }
  // A small lanternfish: a slim outline with a row of photophores along the belly.
  function fish(ctx, th, x, y, s, dir, col, a, wig = 0) {
    ctx.save();
    ctx.translate(x, y); ctx.scale(dir, 1); ctx.rotate(wig * 0.08);
    ctx.beginPath();
    ctx.moveTo(-s, 0);
    ctx.quadraticCurveTo(-s * 0.2, -s * 0.42, s * 0.7, -s * 0.05);
    ctx.quadraticCurveTo(s * 0.95, 0, s * 0.7, s * 0.06);
    ctx.quadraticCurveTo(-s * 0.2, s * 0.4, -s, 0);
    ctx.moveTo(-s * 0.9, 0); ctx.lineTo(-s * 1.35, -s * (0.3 + wig * 0.1)); ctx.lineTo(-s * 1.3, s * (0.3 - wig * 0.1)); ctx.closePath();
    membrane(ctx, col, 0.06 * a);
    lum(ctx, col, Math.max(0.8, s * 0.06), a * 0.6);
    for (let k = 0; k < 4; k++) glow(ctx, -s * 0.5 + k * s * 0.32, s * 0.16, s * 0.18, k === 3 ? th.warm : col, a * 0.9);
    glow(ctx, s * 0.5, -s * 0.06, s * 0.14, th.warm, a);
    ctx.restore();
  }
  function school(ctx, S, th, t, scale = 1, alpha = 0.55) {
    const { W, H, u } = S;
    const period = 17;
    const f = fract((t + 6) / period);
    const k = Math.floor((t + 6) / period);
    const r = rng(k * 37 + 11);
    const y0 = H * (0.2 + r() * 0.35);
    const dir = r() < 0.5 ? -1 : 1;
    const cx = dir < 0 ? W * 1.2 - f * W * 1.5 : -W * 0.2 + f * W * 1.5;
    for (const p of SCHOOL) {
      const x = cx + (p.x - 0.5) * 360 * u * scale + Math.sin(t * 1.3 + p.ph) * 12 * u;
      const y = y0 + (p.y - 0.5) * 150 * u * scale + Math.sin(t * 0.9 + p.x * 6 + f * 8) * 18 * u;
      fish(ctx, th, x, y, (10 + p.s * 6) * u * scale, dir, th.g1, alpha, Math.sin(t * 9 + p.ph));
    }
  }
  // The near seafloor: a dark shelf with a living garden, scrolling with the camera.
  function floorY(S, wx) { return S.H * (S.tall ? 0.94 : 0.925) + Math.sin(wx * 0.004) * 14 * S.u + Math.sin(wx * 0.011 + 2) * 7 * S.u; }
  function seaPen(ctx, th, x, y, h, t, ph, col, a) {
    const sw = Math.sin(t * 0.9 + ph) * h * 0.12;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + sw * 0.3, y - h * 0.5, x + sw, y - h);
    lum(ctx, col, Math.max(1, h * 0.018), a * 0.8);
    for (let k = 3; k <= 10; k++) {
      const q = k / 10;
      const px = x + sw * q * q, py = y - h * q;
      const len = h * 0.16 * Math.sin(Math.PI * q);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - len, py - len * 0.5 + sw * 0.05); ctx.moveTo(px, py); ctx.lineTo(px + len, py - len * 0.5 + sw * 0.05);
      lum(ctx, col, Math.max(0.8, h * 0.008), a * 0.45);
      glow(ctx, px - len, py - len * 0.5, h * 0.03, col, a * (0.4 + 0.6 * Math.max(0, Math.sin(t * 2.2 - q * 6 + ph))));
      glow(ctx, px + len, py - len * 0.5, h * 0.03, col, a * (0.4 + 0.6 * Math.max(0, Math.sin(t * 2.2 - q * 6 + ph + 1))));
    }
  }
  function tubeWorms(ctx, th, x, y, s, t, ph, a) {
    for (let k = 0; k < 5; k++) {
      const tx = x + (k - 2) * s * 0.28, h = s * (0.5 + 0.5 * Math.sin(k * 2.3 + ph) ** 2);
      ctx.beginPath(); ctx.moveTo(tx, y); ctx.quadraticCurveTo(tx + Math.sin(k) * s * 0.1, y - h * 0.6, tx + Math.sin(t * 0.7 + k) * s * 0.06, y - h);
      ctx.strokeStyle = rgba(mix(th.rock, th.g1, 0.12)); ctx.lineWidth = s * 0.09; ctx.lineCap = "round"; ctx.stroke();
      const cx = tx + Math.sin(t * 0.7 + k) * s * 0.06, cy = y - h;
      const open = 0.6 + 0.4 * Math.sin(t * 1.6 + k * 1.1 + ph);
      for (let j = 0; j < 5; j++) {
        const ang = -Math.PI / 2 + (j - 2) * 0.42 * open;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ang) * s * 0.16, cy + Math.sin(ang) * s * 0.16);
        lum(ctx, k % 2 ? th.g2 : th.warm, Math.max(0.8, s * 0.02), a * 0.7);
      }
      glow(ctx, cx, cy - s * 0.05, s * 0.12, k % 2 ? th.g2 : th.warm, a * 0.6 * open);
    }
  }
  function vent(ctx, S, th, x, y, s, t, a) {
    const u = S.u;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.32, y); ctx.lineTo(x - s * 0.2, y - s * 0.55); ctx.lineTo(x - s * 0.12, y - s * 0.62); ctx.lineTo(x - s * 0.1, y - s);
    ctx.lineTo(x + s * 0.08, y - s); ctx.lineTo(x + s * 0.12, y - s * 0.7); ctx.lineTo(x + s * 0.24, y - s * 0.5); ctx.lineTo(x + s * 0.34, y); ctx.closePath();
    solid(ctx, th.rock);
    lum(ctx, th.warm, 1.2 * u, a * 0.35);
    glow(ctx, x, y - s, s * 0.3, th.warm, a * (0.55 + 0.2 * Math.sin(t * 3)));
    // Shimmering plume of warm motes rising and spreading.
    for (let k = 0; k < 14; k++) {
      const f = fract(t * 0.18 + k / 14);
      const px = x + Math.sin(f * 7 + k) * s * 0.25 * f + f * s * 0.3;
      const py = y - s - f * s * 2.4;
      glow(ctx, px, py, s * (0.06 + f * 0.12), k % 3 ? th.warm : th.g2, a * 0.4 * (1 - f));
    }
  }
  function seafloor(ctx, S, th, t, camX) {
    const { W, H, u } = S;
    const off = camX;
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 16; x += 16 * u) ctx.lineTo(x, floorY(S, x + off));
    ctx.lineTo(W, H); ctx.closePath();
    solid(ctx, th.rock);
    ctx.beginPath();
    for (let x = 0; x <= W + 16; x += 16 * u) { const y = floorY(S, x + off); if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    lum(ctx, th.g1, 1.4 * u, 0.3);
    const step = 230 * u;
    const first = Math.floor((off - 200 * u) / step);
    for (let k = first; k < first + W / step + 3; k++) {
      const r = rng(k * 977 + 5);
      const x = k * step - off + r() * step * 0.7;
      const y = floorY(S, x + off) + 2 * u;
      const kind = r();
      if (kind < 0.42) seaPen(ctx, th, x, y, (70 + r() * 90) * u, t, k * 1.7, r() < 0.6 ? th.g1 : th.g2, 0.75);
      else if (kind < 0.72) tubeWorms(ctx, th, x, y, (60 + r() * 30) * u, t, k, 0.8);
      else if (kind < 0.8) vent(ctx, S, th, x, y, (90 + r() * 40) * u, t + k, 0.8);
      else {
        // A cluster of glowing polyps.
        for (let j = 0; j < 6; j++) { const px = x + (r() - 0.5) * 80 * u; glow(ctx, px, floorY(S, px + off) - r() * 10 * u, (6 + r() * 8) * u, r() < 0.5 ? th.g3 : th.g1, 0.5 + 0.4 * Math.sin(t * 2 + j + k)); }
      }
    }
  }
  // The change: a travelling front ignites the water as the current carries us to the next scene.
  function flare(ctx, S, th, info) {
    if (!info.scene) return;
    let tc = null;
    if (info.index > 0 && info.local < info.change + 0.6) tc = info.local;
    else if (info.next && info.local > info.hold - 0.35) tc = info.local - info.hold;
    if (tc === null) return;
    const { W, H, u } = S;
    const span = info.change + 0.95;
    const w = clamp((tc + 0.35) / span);
    if (w <= 0 || w >= 1) return;
    const front = W * (1.15 - 1.45 * eio(w));
    const band = ctx.createLinearGradient(front - W * 0.18, 0, front + W * 0.3, 0);
    band.addColorStop(0, rgba(th.g1, 0)); band.addColorStop(0.35, rgba(th.g1, 0.09 * Math.sin(Math.PI * w)));
    band.addColorStop(1, rgba(th.g1, 0));
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = band; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = op;
    for (const p of FLARE) {
      const x = p.x * W, y = p.y * H;
      const dx = x - front;
      if (dx < -40 * u) continue;
      const b = Math.exp(-dx / (W * 0.16)) * (dx < 0 ? clamp(1 + dx / (40 * u)) : 1);
      if (b < 0.03) continue;
      glow(ctx, x + Math.sin(tc * 3 + p.ph) * 6 * u, y, (4 + p.s * 10) * u, p.k < 0.7 ? th.g1 : p.k < 0.88 ? th.g3 : th.acc, b * 0.9 * (1 - w * 0.4));
    }
  }
  function vignette(ctx, S, th) {
    const { W, H } = S;
    const g = ctx.createRadialGradient(W / 2, H * 0.48, Math.min(W, H) * 0.35, W / 2, H * 0.5, Math.max(W, H) * 0.78);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, `rgba(0,0,0,${0.55 * (0.5 + 0.5 * th.tex)})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  function grainPass(ctx, S, th, t) {
    if (th.tex <= 0) return;
    ctx.save();
    const f = Math.floor(t * 24);
    const r = rng(f * 7919 + 3);
    ctx.translate(-r() * 200, -r() * 200);
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = 0.07 * th.tex;
    ctx.fillStyle = ctx.createPattern(noise(), "repeat");
    ctx.fillRect(0, 0, S.W + 200, S.H + 200);
    ctx.restore();
  }
  // Everything nearer the camera than the scene: big soft motes, the vignette and grain.
  function fore(ctx, S, th, t) {
    if (!S.paint) return;
    snow(ctx, S, th, t, FRAME.camX, 2);
    vignette(ctx, S, th);
    grainPass(ctx, S, th, t);
  }
  function world(ctx, S, th, t, camX, info) {
    water(ctx, S, th, t);
    haze(ctx, S, th, t, camX);
    shafts(ctx, S, th, t);
    farRay(ctx, S, th, t);
    snow(ctx, S, th, t, camX, 0);
    combs(ctx, S, th, t, camX, 0);
    siphonophore(ctx, S, th, t, camX);
    ridge(ctx, S, th, t, camX);
    school(ctx, S, th, t, 0.8, 0.4);
    snow(ctx, S, th, t, camX, 1);
    combs(ctx, S, th, t, camX, 1);
    motes(ctx, S, th, t, camX);
    seafloor(ctx, S, th, t, camX);
    if (info) flare(ctx, S, th, info);
  }

  // ---- shared scene parts -------------------------------------------------------------------------
  // A rocky ledge the scene's subjects stand on: a dark mass with a lit rim and glowing lichens.
  function ledge(ctx, S, th, x0, x1, y, t, seed = 1) {
    const u = S.u;
    const r = rng(seed);
    const pts = [];
    for (let x = x0 - 40 * u; x <= x1 + 40 * u; x += 34 * u) pts.push([x, y + (r() - 0.5) * 14 * u + Math.sin(x * 0.01) * 6 * u]);
    ctx.beginPath(); ctx.moveTo(x0 - 80 * u, y + 120 * u);
    ctx.lineTo(x0 - 60 * u, y + 20 * u);
    for (const [x, yy] of pts) ctx.lineTo(x, yy);
    ctx.lineTo(x1 + 60 * u, y + 20 * u); ctx.lineTo(x1 + 80 * u, y + 120 * u); ctx.closePath();
    const g = ctx.createLinearGradient(0, y, 0, y + 120 * u);
    g.addColorStop(0, rgba(th.rock, 1)); g.addColorStop(1, rgba(th.rock, 0));
    ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); pts.forEach(([x, yy], i) => (i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy)));
    lum(ctx, th.g1, 1.6 * u, 0.4);
    for (let i = 0; i < pts.length; i += 2) glow(ctx, pts[i][0], pts[i][1] + 3 * u, (5 + r() * 7) * u, r() < 0.7 ? th.g1 : th.g3, 0.35 + 0.35 * Math.sin(t * 1.7 + i));
  }
  // Rising bubbles from a point, cycling.
  function bubbles(ctx, S, th, x, y, t, n = 3, h = 160, col, a = 1, seed = 0) {
    const u = S.u;
    for (let k = 0; k < n; k++) {
      const f = fract(t * 0.45 + k / n + seed * 0.13);
      const bx = x + Math.sin(f * 9 + k + seed) * 8 * u, by = y - f * h * u;
      const r = (3 + k * 1.5 + f * 4) * u;
      ctx.beginPath(); ctx.arc(bx, by, r, 0, TAU);
      lum(ctx, col || th.g1, 1.2 * u, a * 0.55 * (1 - f) * clamp(f * 6));
    }
  }

  // ---- chart: pyrosome columns --------------------------------------------------------------------
  function chartScene(ctx, S, th, A, b, d, t) {
    const u = S.u, n = d.values.length;
    const max = Math.max(...d.values, 1);
    const base = A.y + A.h - 84 * u;
    const top = A.y + 130 * u;
    const slot = A.w / n;
    // Faint current lines across the scale, carrying plankton.
    for (let k = 1; k <= 3; k++) {
      const y = base - (base - top) * (k / 3);
      ctx.save(); ctx.setLineDash([2 * u, 16 * u]); ctx.lineDashOffset = -t * 30 * u;
      ctx.beginPath(); ctx.moveTo(A.x, y); ctx.lineTo(A.x + A.w, y);
      lum(ctx, th.g1, 1.2 * u, 0.18 * clamp(b * 3));
      ctx.restore();
    }
    ledge(ctx, S, th, A.x, A.x + A.w, base, t, 3);
    d.values.forEach((value, i) => {
      const q = stag(b, i, n, 0.45);
      const hot = i === d.highlight;
      const col = hot ? th.acc : th.g1;
      const cx = A.x + slot * (i + 0.5);
      const tw = Math.min(slot * 0.4, 150 * u);
      const full = Math.max(tw * 1.1, (base - top) * (value / max));
      const stub = tw * 0.7;
      const h = stub + (full - stub) * q;
      const sway = Math.sin(t * 0.9 + i * 1.3) * 14 * u * (h / (base - top));
      const yTop = base - h;
      // Body: a soft capsule leaning with the current.
      ctx.beginPath();
      ctx.moveTo(cx - tw / 2, base);
      ctx.quadraticCurveTo(cx - tw / 2, base - h * 0.5, cx - tw / 2 + sway, yTop + tw / 2);
      ctx.arc(cx + sway, yTop + tw / 2, tw / 2, Math.PI, 0);
      ctx.quadraticCurveTo(cx + tw / 2, base - h * 0.5, cx + tw / 2, base);
      const a = hot ? 1 : 0.8;
      membrane(ctx, col, 0.07 * a);
      lum(ctx, col, 2.4 * u, a * (0.5 + 0.5 * clamp(q * 3)));
      // Photophores in staggered rows; a pulse climbs the column.
      const rowH = 26 * u;
      const rows = Math.max(1, Math.floor((h - tw * 0.3) / rowH));
      for (let rI = 0; rI < rows; rI++) {
        const y = base - rowH * (rI + 0.7);
        const f = (base - y) / h;
        const sx = sway * f * f;
        const pulse = Math.pow(0.5 + 0.5 * Math.sin(rI * 0.55 - t * 4.2 + i), 3);
        const cols = rI % 2 ? [-0.25, 0.25] : [-0.32, 0, 0.32];
        for (const c of cols) glow(ctx, cx + sx + c * tw, y, (7 + pulse * 6) * u, col, a * (0.35 + 0.65 * pulse) * clamp(q * 2 + 0.25));
      }
      // Feathery crown of filaments at the mouth.
      const mx = cx + sway, my = yTop + tw * 0.1;
      for (let k = 0; k < 7; k++) {
        const ang = -Math.PI / 2 + (k - 3) * 0.32 + Math.sin(t * 1.4 + k + i) * 0.12;
        const len = tw * (0.45 + 0.15 * Math.sin(t * 2 + k * 2));
        ctx.beginPath(); ctx.moveTo(mx, my);
        ctx.quadraticCurveTo(mx + Math.cos(ang) * len * 0.5, my + Math.sin(ang) * len * 0.5 - 6 * u, mx + Math.cos(ang) * len, my + Math.sin(ang) * len);
        lum(ctx, col, 1.3 * u, a * 0.55);
        glow(ctx, mx + Math.cos(ang) * len, my + Math.sin(ang) * len, 6 * u, k % 2 ? col : th.g3, a * 0.8);
      }
      bubbles(ctx, S, th, mx, my - tw * 0.4, t + i * 0.7, 3, 130, col, a, i);
      // Value above, label below.
      const vs = Math.min(96 * u, slot * 0.36);
      ctx.save(); ctx.globalAlpha *= clamp(q * 5);
      txt(ctx, S, th, fmt(value * eo(q), { ref: value, prefix: d.prefix, suffix: d.suffix }), mx, yTop - tw * 0.55 - 30 * u, vs, { align: "center", fam: "figures", weight: 600, color: hot ? mix(th.acc, WHITE, 0.25) : th.ink, glowColor: col, max: slot * 0.92 });
      ctx.restore();
      ctx.save(); ctx.globalAlpha *= clamp(b * 4);
      txt(ctx, S, th, d.labels[i] || "", cx, base + 54 * u, 42 * u, { align: "center", color: rgb(S.look.muted), glowColor: th.g1, glow: 0.2, max: slot * 0.92 });
      ctx.restore();
    });
    // A small school weaves between the columns.
    const f = fract(t * 0.07);
    for (let k = 0; k < 7; k++) {
      const x = A.x - 100 * u + (A.w + 200 * u) * fract(f + k * 0.018);
      const y = top + (base - top) * 0.45 + Math.sin(x * 0.006 + t) * 70 * u + (k % 3) * 22 * u;
      fish(ctx, th, x, y, 13 * u, 1, th.g3, 0.7, Math.sin(t * 10 + k));
    }
  }

  // ---- object: an observation pod with a lit viewport --------------------------------------------
  function screen(ctx, S, th, x, y, w, h, t, on, hot) {
    const u = S.u;
    rr(ctx, x, y, w, h, 14 * u);
    solid(ctx, mix(th.water[2], th.g1, 0.04));
    ctx.save();
    rr(ctx, x, y, w, h, 14 * u); ctx.clip();
    ctx.globalAlpha *= on;
    const pad = w * 0.06;
    const pv = { x: x + pad, y: y + pad, w: w - pad * 2, h: h * 0.44 };
    // Preview: a tiny lit reef with a fish crossing.
    rr(ctx, pv.x, pv.y, pv.w, pv.h, 8 * u);
    const g = ctx.createLinearGradient(0, pv.y, 0, pv.y + pv.h);
    g.addColorStop(0, rgba(mix(th.water[0], th.g1, 0.25))); g.addColorStop(1, rgba(th.water[2]));
    ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); ctx.moveTo(pv.x, pv.y + pv.h);
    for (let i = 0; i <= 20; i++) ctx.lineTo(pv.x + pv.w * i / 20, pv.y + pv.h * (0.78 + 0.08 * Math.sin(i * 0.9 + 1)));
    ctx.lineTo(pv.x + pv.w, pv.y + pv.h); ctx.closePath(); solid(ctx, th.rock);
    for (let i = 0; i < 5; i++) glow(ctx, pv.x + pv.w * (0.12 + i * 0.19), pv.y + pv.h * (0.8 + 0.05 * Math.sin(i * 0.9 + 1)), 10 * u, i % 2 ? th.g2 : th.g1, 0.7 + 0.3 * Math.sin(t * 2 + i));
    fish(ctx, th, pv.x + pv.w * fract(t * 0.16), pv.y + pv.h * 0.42 + Math.sin(t * 2) * 6 * u, Math.max(8 * u, pv.h * 0.09), 1, th.g1, 0.95, Math.sin(t * 9));
    rr(ctx, pv.x, pv.y, pv.w, pv.h, 8 * u); lum(ctx, hot, 1.6 * u, 0.8);
    // Three tracks of clips.
    const ty0 = pv.y + pv.h + h * 0.08, th3 = (y + h - pad - ty0) / 3;
    const clips = [[[0, 0.3], [0.33, 0.28], [0.64, 0.3]], [[0.05, 0.42], [0.5, 0.44]], [[0, 0.22], [0.25, 0.35], [0.63, 0.31]]];
    clips.forEach((row, ri) => row.forEach(([cx0, cw], ci) => {
      const cxp = x + pad + (w - pad * 2) * cx0, cwp = (w - pad * 2) * cw - 6 * u;
      const cy = ty0 + ri * th3 + 3 * u, ch = th3 - 8 * u;
      const isHot = ri === 0 && ci === 1;
      rr(ctx, cxp, cy, cwp, ch, 5 * u);
      membrane(ctx, isHot ? hot : ri === 2 ? th.g3 : th.g1, isHot ? 0.35 : 0.14);
      lum(ctx, isHot ? hot : ri === 2 ? th.g3 : th.g1, 1.3 * u, isHot ? 1 : 0.6);
      if (ri === 2) { ctx.beginPath(); for (let k = 4; k < cwp - 4; k += 7 * u) { const a = ch * 0.35 * Math.abs(Math.sin(k * 0.08 + ci)); ctx.moveTo(cxp + k, cy + ch / 2 - a); ctx.lineTo(cxp + k, cy + ch / 2 + a); } lum(ctx, th.g3, 0.8 * u, 0.5); }
    }));
    // Playhead.
    const ph = x + pad + (w - pad * 2) * fract(t * 0.11);
    ctx.beginPath(); ctx.moveTo(ph, ty0 - 6 * u); ctx.lineTo(ph, y + h - pad * 0.6);
    lum(ctx, th.warm, 1.8 * u, 0.9);
    glow(ctx, ph, ty0 - 6 * u, 9 * u, th.warm, 1);
    ctx.restore();
    // Glass glint and rim.
    rr(ctx, x, y, w, h, 14 * u); lum(ctx, th.g1, 2 * u, 0.5 + 0.5 * on);
    return { pv, ty0, th3, pad };
  }
  // A translucent hull: the path filled with dim water, a fresnel band of light along the top and
  // bottom, and a soft inner bloom, so the craft reads as lit glass rather than a black cut-out.
  function glassFill(ctx, th, top, bottom, a = 1, inner) {
    ctx.save();
    ctx.fillStyle = rgba(mix(th.water[2], th.water[1], 0.35), 0.66 * a); ctx.fill();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, rgba(th.g1, 0.24 * a)); g.addColorStop(0.18, rgba(th.g1, 0.09 * a));
    g.addColorStop(0.55, rgba(th.g2, 0.025 * a)); g.addColorStop(0.88, rgba(th.g1, 0.07 * a)); g.addColorStop(1, rgba(th.g1, 0.16 * a));
    ctx.fillStyle = g; ctx.fill();
    if (inner) {
      const r = ctx.createRadialGradient(inner[0], inner[1], 0, inner[0], inner[1], inner[2]);
      r.addColorStop(0, rgba(inner[3] || th.g1, 0.14 * a)); r.addColorStop(1, rgba(inner[3] || th.g1, 0));
      ctx.fillStyle = r; ctx.fill();
    }
    ctx.restore();
  }
  function porthole(ctx, S, th, x, y, r, t, ph) {
    const u = S.u;
    ctx.beginPath(); ctx.arc(x, y, r * 1.28, 0, TAU);
    glassFill(ctx, th, y - r, y + r, 0.9); lum(ctx, th.g1, 1.4 * u, 0.7);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    ctx.save();
    const g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, 0, x, y, r);
    const fl = 0.8 + 0.2 * Math.sin(t * 2.3 + ph);
    g.addColorStop(0, rgba(mix(th.warm, WHITE, 0.4), 0.85 * fl)); g.addColorStop(0.6, rgba(th.warm, 0.35 * fl)); g.addColorStop(1, rgba(th.warm, 0.08));
    ctx.fillStyle = g; ctx.fill(); ctx.restore();
    lum(ctx, th.warm, 1.2 * u, 0.8);
    ctx.beginPath(); ctx.arc(x, y, r * 0.72, Math.PI * 1.1, Math.PI * 1.45); lum(ctx, WHITE, 1 * u, 0.7);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; glow(ctx, x + Math.cos(a) * r * 1.14, y + Math.sin(a) * r * 1.14, 3.5 * u, th.g1, 0.55 + 0.35 * Math.sin(t * 3 + k + ph)); }
    glow(ctx, x, y, r * 2.4, th.warm, 0.22 * fl);
  }
  // The observation sub: a teardrop of lit glass with seams and rivets, a rounded sail with a
  // periscope beacon, swept cruciform tail fins, bow planes, portholes and a ducted propeller.
  function pod(ctx, S, th, cx, cy, w, t, b, hot) {
    const u = S.u, h = w * 0.5;
    const on = b < 0.2 ? 0.45 + 0.4 * (Math.sin(b * 140) > 0 ? 1 : 0) : 1;
    const L = cx - w * 0.5, Rt = cx + w * 0.47;
    // Headlamp beam from the nose, sweeping slowly.
    const nx = L + w * 0.01, ny = cy + h * 0.08;
    const ang = Math.PI + 0.2 + Math.sin(t * 0.6) * 0.12;
    const len = w * 0.75;
    for (let k = 1; k <= 14; k++) {
      const f = k / 14;
      glow(ctx, nx + Math.cos(ang) * len * f, ny + Math.sin(ang) * len * f, len * 0.07 + len * 0.26 * f, th.warm, 0.11 * (1 - f * 0.8) * (0.3 + 0.7 * on));
    }
    for (let k = 0; k < 16; k++) {
      const p = SWARM[k];
      const f = fract(p.x + t * 0.05 * (0.5 + p.s));
      const spread = (p.y - 0.5) * 0.44;
      glow(ctx, nx + Math.cos(ang + spread) * len * f, ny + Math.sin(ang + spread) * len * f + Math.sin(t + k) * 6 * u, (3 + p.s * 4) * u, th.warm, 0.8 * (1 - f) * on);
    }
    const hullPath = () => {
      ctx.beginPath();
      ctx.moveTo(L, cy);
      ctx.bezierCurveTo(L, cy - h * 0.56, cx - w * 0.26, cy - h * 0.5, cx, cy - h * 0.5);
      ctx.bezierCurveTo(cx + w * 0.24, cy - h * 0.5, cx + w * 0.4, cy - h * 0.28, Rt, cy - h * 0.1);
      ctx.lineTo(Rt, cy + h * 0.1);
      ctx.bezierCurveTo(cx + w * 0.4, cy + h * 0.28, cx + w * 0.24, cy + h * 0.5, cx, cy + h * 0.5);
      ctx.bezierCurveTo(cx - w * 0.26, cy + h * 0.5, L, cy + h * 0.56, L, cy);
      ctx.closePath();
    };
    const fin = (pts) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); };
    // Tail fins behind the hull: upper and lower swept planes.
    for (const sgn of [-1, 1]) {
      fin([[cx + w * 0.37, cy + sgn * h * 0.27], [cx + w * 0.455, cy + sgn * h * 0.5], [cx + w * 0.505, cy + sgn * h * 0.49], [cx + w * 0.485, cy + sgn * h * 0.08]]);
      glassFill(ctx, th, cy - h * 0.5, cy + h * 0.5, 0.9);
      lum(ctx, th.g1, 1.6 * u, 0.75);
      // Rib lines in each fin.
      ctx.beginPath();
      for (let k = 1; k <= 2; k++) { const f = k / 3; ctx.moveTo(cx + w * (0.39 + 0.09 * f), cy + sgn * h * (0.25 - 0.1 * f)); ctx.lineTo(cx + w * (0.46 + 0.04 * f), cy + sgn * h * 0.48); }
      lum(ctx, th.g1, 0.8 * u, 0.35);
      glow(ctx, cx + w * 0.48, cy + sgn * h * 0.5, 7 * u, th.g3, 0.6 + 0.4 * Math.sin(t * 4 + sgn));
    }
    // Hull.
    hullPath();
    glassFill(ctx, th, cy - h * 0.5, cy + h * 0.5, 1, [cx - w * 0.04, cy, w * 0.45]);
    // Inner rim, inset: the thickness of the glass.
    ctx.save(); ctx.translate(cx, cy); ctx.scale(0.95, 0.9); ctx.translate(-cx, -cy); hullPath(); ctx.restore();
    lum(ctx, th.g1, 0.9 * u, 0.28);
    hullPath(); lum(ctx, th.g1, 2.4 * u, 0.9);
    // Specular streak along the crown.
    ctx.beginPath(); ctx.moveTo(L + w * 0.08, cy - h * 0.3); ctx.bezierCurveTo(L + w * 0.14, cy - h * 0.44, cx - w * 0.15, cy - h * 0.45, cx + w * 0.08, cy - h * 0.43);
    lum(ctx, mix(th.g1, WHITE, 0.6), 1.4 * u, 0.55);
    // Panel seams with rivets that twinkle.
    for (const [sx, bow] of [[cx - w * 0.36, -1], [cx + w * 0.3, 1]]) {
      const half = h * 0.5 * Math.sqrt(Math.max(0.05, 1 - Math.pow((sx - cx) / (w * 0.52), 2)));
      ctx.beginPath(); ctx.moveTo(sx, cy - half * 0.96); ctx.quadraticCurveTo(sx + bow * w * 0.03, cy, sx, cy + half * 0.96);
      lum(ctx, th.g1, 0.9 * u, 0.4);
      for (let k = 0; k < 9; k++) {
        const f = (k + 0.5) / 9, yy = cy - half * 0.9 + half * 1.8 * f;
        const xx = sx + bow * w * 0.03 * 2 * f * (1 - f) * 2 + 7 * u;
        glow(ctx, xx, yy, 3.6 * u, k % 3 ? th.g1 : th.g3, 0.35 + 0.5 * Math.pow(0.5 + 0.5 * Math.sin(t * 2.6 - k * 0.8 + sx), 3));
      }
    }
    // Rivet line along the keel.
    for (let k = 0; k < 22; k++) {
      const f = (k + 0.5) / 22, xx = L + w * 0.08 + (Rt - L - w * 0.14) * f;
      const half = h * 0.5 * Math.sqrt(Math.max(0, 1 - Math.pow((xx - cx) / (w * 0.52), 2)));
      glow(ctx, xx, cy + half * 0.8, 3 * u, th.g1, 0.3 + 0.3 * Math.sin(t * 1.8 + k * 0.6));
    }
    // Bow plane, swept back from the nose.
    fin([[cx - w * 0.36, cy + h * 0.06], [cx - w * 0.43, cy + h * 0.2], [cx - w * 0.3, cy + h * 0.17], [cx - w * 0.27, cy + h * 0.08]]);
    glassFill(ctx, th, cy, cy + h * 0.2, 0.9); lum(ctx, th.g1, 1.4 * u, 0.7);
    // Sail: a rounded tower with lit windows, a periscope and a pulsing beacon.
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.15, cy - h * 0.47);
    ctx.bezierCurveTo(cx - w * 0.14, cy - h * 0.66, cx - w * 0.1, cy - h * 0.75, cx - w * 0.03, cy - h * 0.75);
    ctx.lineTo(cx + w * 0.07, cy - h * 0.75);
    ctx.quadraticCurveTo(cx + w * 0.12, cy - h * 0.74, cx + w * 0.19, cy - h * 0.46);
    ctx.closePath();
    glassFill(ctx, th, cy - h * 0.75, cy - h * 0.46, 1); lum(ctx, th.g1, 1.8 * u, 0.85);
    for (let k = 0; k < 3; k++) {
      rr(ctx, cx - w * 0.07 + k * w * 0.045, cy - h * 0.67, w * 0.028, h * 0.06, 3 * u);
      membrane(ctx, th.warm, 0.35 + 0.2 * Math.sin(t * 1.7 + k)); lum(ctx, th.warm, 0.9 * u, 0.7);
    }
    const mast = cx + w * 0.04, mastTop = cy - h * 0.88;
    ctx.beginPath(); ctx.moveTo(mast, cy - h * 0.75); ctx.lineTo(mast, mastTop); ctx.lineTo(mast - w * 0.03, mastTop);
    lum(ctx, th.g1, 1.4 * u, 0.7);
    const bp = 0.5 + 0.5 * Math.sin(t * 5);
    glow(ctx, mast, mastTop - 4 * u, (10 + bp * 12) * u, th.acc, 0.6 + 0.4 * bp);
    ctx.beginPath(); ctx.arc(mast, mastTop - 4 * u, (14 + fract(t * 0.9) * 46) * u, 0, TAU); lum(ctx, th.acc, 1.2 * u, 0.5 * (1 - fract(t * 0.9)));
    // Nose lamp housing.
    ctx.beginPath(); ctx.arc(nx + w * 0.02, ny, h * 0.06, 0, TAU); glassFill(ctx, th, ny - h * 0.06, ny + h * 0.06, 1); lum(ctx, th.warm, 1.4 * u, 0.9);
    glow(ctx, nx, ny, 20 * u, th.warm, 0.6 + 0.4 * on);
    // Portholes: one at the bow, one aft.
    porthole(ctx, S, th, L + w * 0.1, cy - h * 0.13, h * 0.065, t, 0);
    porthole(ctx, S, th, cx + w * 0.375, cy - h * 0.02, h * 0.07, t, 2);
    // Ducted propeller: a lit shroud, four blades turning in perspective, a blur disc and wash.
    const px = cx + w * 0.52, py = cy, pr = h * 0.27;
    ctx.beginPath(); ctx.moveTo(Rt, cy); ctx.lineTo(px, cy); lum(ctx, th.g1, 2 * u, 0.7);
    ctx.beginPath(); ctx.ellipse(px, py, pr * 0.2, pr, 0, 0, TAU);
    membrane(ctx, th.g3, 0.06);
    const blades = [];
    for (let k = 0; k < 4; k++) { const a = t * 9 + (k * TAU) / 4; blades.push([a, Math.cos(a)]); }
    blades.sort((p, q) => p[1] - q[1]);
    for (const [a, facing] of blades) {
      const tipY = py + Math.sin(a) * pr * 0.92, tipX = px + Math.cos(a) * pr * 0.18;
      const wid = pr * 0.32 * (0.35 + 0.65 * Math.abs(facing));
      const nxp = -Math.sin(a), nyp = Math.cos(a);
      ctx.beginPath(); ctx.moveTo(px, py);
      ctx.quadraticCurveTo((px + tipX) / 2 + nxp * wid * 0.25 + 8 * u, (py + tipY) / 2 + nyp * wid, tipX, tipY);
      ctx.quadraticCurveTo((px + tipX) / 2 - nxp * wid * 0.1, (py + tipY) / 2 - nyp * wid * 0.25, px, py);
      const lit = 0.45 + 0.55 * (0.5 + 0.5 * facing);
      membrane(ctx, th.g3, 0.18 * lit); lum(ctx, th.g3, 1.2 * u, 0.75 * lit);
    }
    glow(ctx, px, py, 9 * u, mix(th.g3, WHITE, 0.4), 1);
    // Shroud ring in front of the blades.
    ctx.beginPath(); ctx.ellipse(px + 4 * u, py, pr * 0.24, pr * 1.06, 0, 0, TAU); lum(ctx, th.g1, 1.8 * u, 0.85);
    ctx.beginPath(); ctx.ellipse(px + 4 * u, py, pr * 0.24, pr * 1.06, 0, -Math.PI / 2, Math.PI / 2); lum(ctx, th.g1, 3 * u, 0.25);
    for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU + t * 0.6; glow(ctx, px + 4 * u + Math.cos(a) * pr * 0.24, py + Math.sin(a) * pr * 1.06, 3.5 * u, th.g1, 0.4 + 0.4 * Math.sin(t * 4 + k)); }
    // Wash: spiralling motes and small bubbles streaming aft.
    for (let k = 0; k < 14; k++) {
      const f = fract(t * 0.7 + k / 14);
      const sx = px + pr * 0.4 + f * w * 0.22, sy = py + Math.sin(f * 14 + k * 2 + t * 6) * pr * (0.5 - f * 0.25);
      glow(ctx, sx, sy, (3 + 4 * (1 - f)) * u, k % 3 ? th.g1 : th.g3, 0.7 * (1 - f));
    }
    // Running lights along the belly.
    for (let k = 0; k < 9; k++) {
      const xx = cx - w * 0.3 + (k / 8) * w * 0.58;
      const half = h * 0.5 * Math.sqrt(Math.max(0, 1 - Math.pow((xx - cx) / (w * 0.52), 2)));
      glow(ctx, xx, cy + half * 0.97, 7 * u, k % 2 ? th.g1 : th.g3, 0.4 + 0.6 * Math.pow(0.5 + 0.5 * Math.sin(t * 3 - k * 0.7), 2));
    }
    // Viewport screen on the flank.
    const sw = w * 0.52, sh = h * 0.56;
    const sx0 = cx - sw * 0.6, sy0 = cy - sh * 0.52;
    const sc = screen(ctx, S, th, sx0, sy0, sw, sh, t, on, hot);
    bubbles(ctx, S, th, cx + w * 0.02, cy - h * 0.76, t, 4, 180, th.g1, 0.9, 2);
    return { sx: sx0, sy: sy0, sw, sh, ...sc };
  }
  function bell(ctx, S, th, cx, cy, w, t, b, hot) {
    const u = S.u, h = w * 1.45;
    const on = b < 0.2 ? 0.45 + 0.4 * (Math.sin(b * 140) > 0 ? 1 : 0) : 1;
    const top = cy - h / 2;
    // Tether rising out of frame.
    ctx.beginPath(); ctx.moveTo(cx, top - w * 0.2);
    ctx.quadraticCurveTo(cx + Math.sin(t * 0.5) * 20 * u, top - w * 0.45, cx + Math.sin(t * 0.4 + 1) * 30 * u, top - w * 0.8);
    lum(ctx, th.g1, 1.6 * u, 0.5);
    glow(ctx, cx + Math.sin(t * 0.4 + 1) * 30 * u, top - w * 0.8, 10 * u, th.g1, 0.8);
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.5, cy + h * 0.5);
    ctx.lineTo(cx - w * 0.5, top + w * 0.5);
    ctx.arc(cx, top + w * 0.5, w * 0.5, Math.PI, 0);
    ctx.lineTo(cx + w * 0.5, cy + h * 0.5); ctx.closePath();
    glassFill(ctx, th, top, cy + h * 0.5, 1, [cx, cy, w * 0.7]); lum(ctx, th.g1, 2.4 * u, 0.85);
    glow(ctx, cx, top - w * 0.02, (12 + 8 * Math.sin(t * 5)) * u, th.acc, 0.8);
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(cx + side * w * 0.58, cy + h * 0.25, w * 0.08, w * 0.14, 0, 0, TAU); solid(ctx, th.rock); lum(ctx, th.g1, 1.6 * u, 0.6);
      for (let k = 0; k < 2; k++) { const a = t * 12 + k * Math.PI; ctx.beginPath(); ctx.moveTo(cx + side * w * 0.58 - Math.cos(a) * w * 0.07, cy + h * 0.25); ctx.lineTo(cx + side * w * 0.58 + Math.cos(a) * w * 0.07, cy + h * 0.25); lum(ctx, th.g3, 1.4 * u, 0.6); }
    }
    for (let k = 0; k < 7; k++) glow(ctx, cx - w * 0.4 + k * w * 0.8 / 6, cy + h * 0.47, 7 * u, k % 2 ? th.g1 : th.g3, 0.4 + 0.6 * Math.pow(0.5 + 0.5 * Math.sin(t * 3 - k * 0.7), 2));
    const sw = w * 0.74, sh = h * 0.62;
    const sc = screen(ctx, S, th, cx - sw / 2, top + w * 0.36, sw, sh, t, on, hot);
    bubbles(ctx, S, th, cx + w * 0.35, top + w * 0.15, t, 4, 160, th.g1, 0.9, 5);
    return { sx: cx - sw / 2, sy: top + w * 0.36, sw, sh, ...sc };
  }
  function objectScene(ctx, S, th, A, b, d, t) {
    const u = S.u, tall = S.tall, phone = d.kind === "phone";
    const bob = Math.sin(t * 1.1) * 9 * u;
    let r, labels;
    if (!tall) {
      const vw = phone ? Math.min(A.w * 0.24, A.h * 0.5) : Math.min(A.w * 0.56, A.h * 1.3);
      const vx = A.x + (phone ? A.w * 0.3 : A.w * 0.32), vy = A.y + A.h * (phone ? 0.52 : 0.53) + bob;
      r = phone ? bell(ctx, S, th, vx, vy, vw, t, b, th.acc) : pod(ctx, S, th, vx, vy, vw, t, b, th.acc);
      const lx = A.x + A.w * (phone ? 0.56 : 0.69);
      labels = d.callouts.map((_, i) => ({ x: lx, y: A.y + A.h * (0.13 + i * 0.28), max: A.x + A.w - lx - 40 * u }));
    } else {
      const vw = phone ? A.w * 0.42 : A.w * 0.86;
      const vx = A.x + A.w * (phone ? 0.5 : 0.52), vy = A.y + (phone ? A.h * 0.3 : A.h * 0.24) + bob;
      r = phone ? bell(ctx, S, th, vx, vy, vw, t, b, th.acc) : pod(ctx, S, th, vx, vy, vw, t, b, th.acc);
      labels = d.callouts.map((_, i) => ({ x: A.x + 70 * u, y: A.y + A.h * (phone ? 0.66 : 0.6) + i * 128 * u, max: A.w - 110 * u }));
    }
    const anchors = [
      [r.pv.x + r.pv.w * 0.7, r.pv.y + r.pv.h * 0.4],
      [r.sx + r.pad + (r.sw - r.pad * 2) * 0.47, r.ty0 + r.th3 * 0.5],
      [r.sx + r.pad + (r.sw - r.pad * 2) * 0.12, r.ty0 + r.th3 * 2.5],
    ];
    d.callouts.forEach((label, i) => {
      const c = stag(b, i, 3, 0.5);
      if (c <= 0 || !label) return;
      const [ax, ay] = anchors[i];
      const L = labels[i];
      const ex = L.x - 26 * u, ey = L.y;
      const mx = tall ? ax : (ax + ex) / 2, my = tall ? (ay + ey) / 2 : ey;
      // A dotted trail of light, drawn on, with pulses travelling out to the label.
      const pt = (f) => { const a = (1 - f) * (1 - f), bb = 2 * (1 - f) * f, cc = f * f; return [a * ax + bb * mx + cc * ex, a * ay + bb * my + cc * ey]; };
      const steps = 28;
      for (let k = 0; k <= steps * c; k++) {
        const [px, py] = pt(k / steps);
        glow(ctx, px, py, 5 * u, th.acc, 0.55);
      }
      for (let k = 0; k < 2; k++) {
        const f = fract(t * 0.5 + k * 0.5);
        if (f > c) continue;
        const [px, py] = pt(f);
        glow(ctx, px, py, 14 * u, mix(th.acc, WHITE, 0.3), 0.9);
      }
      const pr = fract(t * 0.8 + i * 0.3);
      ctx.beginPath(); ctx.arc(ax, ay, (8 + pr * 20) * u, 0, TAU); lum(ctx, th.acc, 1.6 * u, 0.8 * (1 - pr));
      glow(ctx, ax, ay, 14 * u, th.acc, 1);
      if (c > 0.6) {
        ctx.save(); ctx.globalAlpha *= seg(c, 0.6, 1);
        glow(ctx, ex, ey, 18 * u, th.acc, 1);
        txt(ctx, S, th, label, L.x + 8 * u, ey + 2 * u, 46 * u, { weight: 600, glowColor: th.g1, max: L.max });
        ctx.restore();
      }
    });
  }

  // ---- people: a team of divers -------------------------------------------------------------------
  // A sleeve or leg of the suit: an outlined tube of lit glass with bellows rings along it.
  function sleeve(ctx, th, pts, wd, col, a, rings = 3) {
    const path = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.quadraticCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1]); };
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
    path(); ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = rgba(col, 0.1 * a); ctx.lineWidth = wd * 1.6; ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
    path(); ctx.strokeStyle = rgba(mix(col, WHITE, 0.3), 0.9 * a); ctx.lineWidth = wd; ctx.stroke();
    path(); ctx.strokeStyle = rgba(mix(th.water[1], col, 0.2), 0.9); ctx.lineWidth = wd * 0.78; ctx.stroke();
    path(); ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = rgba(col, 0.08 * a); ctx.lineWidth = wd * 0.3; ctx.stroke(); ctx.globalCompositeOperation = "source-over";
    ctx.restore();
    for (let k = 1; k <= rings; k++) {
      const f = k / (rings + 1), g = 1 - f;
      const x = g * g * pts[0][0] + 2 * g * f * pts[1][0] + f * f * pts[2][0], y = g * g * pts[0][1] + 2 * g * f * pts[1][1] + f * f * pts[2][1];
      const dx = 2 * g * (pts[1][0] - pts[0][0]) + 2 * f * (pts[2][0] - pts[1][0]), dy = 2 * g * (pts[1][1] - pts[0][1]) + 2 * f * (pts[2][1] - pts[1][1]);
      const l = Math.hypot(dx, dy) || 1, nx = -dy / l * wd * 0.42, ny = dx / l * wd * 0.42;
      ctx.beginPath(); ctx.moveTo(x - nx, y - ny); ctx.lineTo(x + nx, y + ny);
      lum(ctx, col, wd * 0.07, a * 0.55);
    }
  }
  // A helmeted diver drawn in light. `k` picks the kit: 0 lantern, 1 lit slate, 2 torch beam,
  // 3 sample jar; the helmet faceplate varies too (cross grille, triple port, bars, cage).
  function diver(ctx, S, th, x, base, s, col, lit, t, k, lantern) {
    const u = S.u;
    const kit = k % 4;
    const bobY = Math.sin(t * 1.3 + k * 1.7) * 6 * u;
    const lean = Math.sin(t * 0.8 + k) * 0.03;
    const y0 = base + bobY;
    const a = 0.16 + 0.84 * lit;
    const w = Math.max(1.2 * u, s * 0.012);
    const hr = s * 0.15, hy = y0 - s + hr;
    const sh = hy + hr * 0.9, hip = y0 - s * 0.36, bw = s * 0.36;
    const fl = 0.75 + 0.25 * Math.sin(t * 7 + k * 3) * Math.sin(t * 3.1 + k);
    // Light cast on the seabed: a pool under the lamp hand (or a beam for the torch).
    const handX = x - bw * 0.8, handY = sh + s * 0.28 + Math.sin(t * 1.1 + k) * s * 0.02;
    if (lit > 0.05) {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const lx = kit === 2 ? handX - s * 0.22 : handX;
      const pg = ctx.createRadialGradient(lx, base, 0, lx, base, s * 0.62);
      pg.addColorStop(0, rgba(kit === 1 ? col : th.warm, 0.34 * lit * fl)); pg.addColorStop(0.5, rgba(kit === 1 ? col : th.warm, 0.1 * lit * fl)); pg.addColorStop(1, rgba(th.warm, 0));
      ctx.fillStyle = pg; ctx.beginPath(); ctx.ellipse(lx, base + 4 * u, s * 0.62, s * 0.1, 0, 0, TAU); ctx.fill();
      if (kit === 2) {
        const bg = ctx.createLinearGradient(handX, handY, lx, base);
        bg.addColorStop(0, rgba(th.warm, 0.32 * lit)); bg.addColorStop(1, rgba(th.warm, 0.04 * lit));
        ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(handX - 6 * u, handY + s * 0.03); ctx.lineTo(lx - s * 0.2, base); ctx.lineTo(lx + s * 0.22, base); ctx.lineTo(handX + 6 * u, handY + s * 0.03); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    ctx.save();
    ctx.translate(x, y0); ctx.rotate(lean); ctx.translate(-x, -y0);
    // Air hose: from the helmet back, rising in a lazy coil toward the surface.
    ctx.beginPath(); ctx.moveTo(x + hr * 0.85, hy + hr * 0.25);
    ctx.bezierCurveTo(x + hr * 2.1 + Math.sin(t * 0.9 + k) * hr * 0.15, hy - hr * 0.1, x + hr * 2.0, sh - s * 0.02, x + bw * 0.46, sh + s * 0.03);
    ctx.lineWidth = s * 0.03; ctx.strokeStyle = rgba(mix(th.water[2], col, 0.12), 0.9); ctx.lineCap = "round"; ctx.stroke();
    lum(ctx, col, w * 0.8, a * 0.6);
    // Tank behind.
    rr(ctx, x + bw * 0.24, sh + s * 0.02, bw * 0.4, s * 0.3, bw * 0.18);
    glassFill(ctx, th, sh, sh + s * 0.32, a); lum(ctx, col, w, a * 0.6);
    glow(ctx, x + bw * 0.44, sh + s * 0.04, s * 0.022, th.warm, a * (0.5 + 0.5 * Math.sin(t * 2 + k)));
    // Legs: bellows-ringed with weighted, glowing boots.
    for (const side of [-1, 1]) {
      const stride = Math.sin(t * 1.3 + k * 1.7 + side) * s * 0.015;
      sleeve(ctx, th, [[x + side * bw * 0.24, hip - s * 0.02], [x + side * bw * 0.3, hip + s * 0.14], [x + side * bw * 0.27 + stride, y0 - s * 0.08]], s * 0.13, col, a, 3);
      rr(ctx, x + side * bw * 0.27 + stride - s * 0.075 + side * s * 0.02, y0 - s * 0.085, s * 0.15, s * 0.085, s * 0.025);
      glassFill(ctx, th, y0 - s * 0.085, y0, a); lum(ctx, col, w, a * 0.9);
      ctx.beginPath(); ctx.moveTo(x + side * bw * 0.27 + stride - s * 0.06 + side * s * 0.02, y0 - s * 0.004); ctx.lineTo(x + side * bw * 0.27 + stride + s * 0.06 + side * s * 0.02, y0 - s * 0.004);
      lum(ctx, th.warm, w * 0.9, a * 0.7);
    }
    // Suit body.
    ctx.beginPath();
    ctx.moveTo(x - bw / 2, hip);
    ctx.quadraticCurveTo(x - bw * 0.62, sh + s * 0.08, x - bw * 0.36, sh);
    ctx.lineTo(x + bw * 0.36, sh);
    ctx.quadraticCurveTo(x + bw * 0.62, sh + s * 0.08, x + bw / 2, hip);
    ctx.closePath();
    glassFill(ctx, th, sh, hip, a, [x - bw * 0.3, sh + s * 0.2, bw * 0.8, th.warm]); lum(ctx, col, w * 1.2, a);
    // Breastplate: a collar arc of bolts around the neck.
    ctx.beginPath(); ctx.ellipse(x, sh + s * 0.005, bw * 0.46, s * 0.075, 0, 0, Math.PI);
    glassFill(ctx, th, sh, sh + s * 0.08, a); lum(ctx, col, w, a * 0.85);
    for (let j = 0; j < 7; j++) { const an = (j / 6) * Math.PI; glow(ctx, x + Math.cos(an) * bw * 0.4, sh + Math.sin(an) * s * 0.06, s * 0.016, j % 3 ? col : th.warm, a * (0.55 + 0.45 * Math.sin(t * 2.2 + j + k))); }
    // Chest weights and a stitched seam.
    for (const side of [-1, 1]) { rr(ctx, x + side * bw * 0.22 - bw * 0.09, sh + s * 0.12, bw * 0.18, s * 0.1, s * 0.015); lum(ctx, col, w * 0.7, a * 0.55); }
    // Belt with photophore studs.
    for (let j = 0; j < 5; j++) glow(ctx, x - bw * 0.36 + j * bw * 0.18, hip - s * 0.03, s * 0.03, j === 2 ? th.warm : col, a * (0.5 + 0.5 * Math.sin(t * 3 + j + k)));
    // Arms: the lamp arm reaches out, the other rests on the hip.
    sleeve(ctx, th, [[x - bw * 0.42, sh + s * 0.05], [x - bw * 0.8, sh + s * 0.1], [handX, handY]], s * 0.085, col, a, 2);
    sleeve(ctx, th, [[x + bw * 0.42, sh + s * 0.05], [x + bw * 0.66, sh + s * 0.2], [x + bw * 0.5, hip - s * 0.02]], s * 0.085, col, a, 2);
    ctx.beginPath(); ctx.arc(handX, handY, s * 0.03, 0, TAU); glassFill(ctx, th, handY - 8, handY + 8, a); lum(ctx, col, w * 0.8, a * 0.8);
    // What each diver carries.
    if (kit === 0) {
      const lx = handX, ly = handY + s * 0.08;
      ctx.beginPath(); ctx.moveTo(handX, handY); ctx.lineTo(lx, ly - s * 0.035); lum(ctx, col, w * 0.7, a * 0.6);
      rr(ctx, lx - s * 0.035, ly - s * 0.035, s * 0.07, s * 0.095, s * 0.02); glassFill(ctx, th, ly - s * 0.04, ly + s * 0.06, a); lum(ctx, th.warm, w * 0.8, a * 0.9);
      ctx.beginPath(); ctx.moveTo(lx - s * 0.035, ly); ctx.lineTo(lx + s * 0.035, ly); ctx.moveTo(lx, ly - s * 0.035); ctx.lineTo(lx, ly + s * 0.06); lum(ctx, th.warm, w * 0.5, a * 0.5);
      glow(ctx, lx, ly + s * 0.015, s * (lantern ? 0.24 : 0.17) * fl, th.warm, lit);
    } else if (kit === 1) {
      // A lit slate showing a tiny timeline.
      const sx = handX - s * 0.1, sy = handY - s * 0.02, sw2 = s * 0.16, sh2 = s * 0.11;
      rr(ctx, sx, sy, sw2, sh2, s * 0.012); glassFill(ctx, th, sy, sy + sh2, a, [sx + sw2 / 2, sy + sh2 / 2, sw2, col]); lum(ctx, col, w * 0.9, a);
      for (let r = 0; r < 3; r++) { ctx.beginPath(); ctx.moveTo(sx + sw2 * 0.12, sy + sh2 * (0.28 + r * 0.24)); ctx.lineTo(sx + sw2 * (0.5 + 0.3 * ((r + 1) % 2)), sy + sh2 * (0.28 + r * 0.24)); lum(ctx, r === 1 ? th.warm : col, w * 0.9, a * 0.8); }
      const phx = sx + sw2 * (0.12 + 0.76 * fract(t * 0.3 + k * 0.2));
      ctx.beginPath(); ctx.moveTo(phx, sy + sh2 * 0.15); ctx.lineTo(phx, sy + sh2 * 0.85); lum(ctx, WHITE, w * 0.6, a * 0.8);
      glow(ctx, sx + sw2 / 2, sy + sh2 / 2, s * 0.15, col, lit * 0.45);
    } else if (kit === 2) {
      // A torch pointed at the seabed.
      ctx.save(); ctx.translate(handX, handY); ctx.rotate(0.9);
      rr(ctx, -s * 0.02, -s * 0.02, s * 0.1, s * 0.04, s * 0.01); glassFill(ctx, th, -s * 0.02, s * 0.02, a); lum(ctx, col, w * 0.8, a * 0.9);
      ctx.restore();
      glow(ctx, handX + s * 0.04, handY + s * 0.06, s * 0.1 * fl, th.warm, lit);
    } else {
      // A sample jar holding a captured light.
      const jx = handX, jy = handY + s * 0.075;
      rr(ctx, jx - s * 0.04, jy - s * 0.045, s * 0.08, s * 0.1, s * 0.02); glassFill(ctx, th, jy - s * 0.05, jy + s * 0.06, a); lum(ctx, col, w * 0.8, a * 0.9);
      const dx = Math.sin(t * 2.3 + k) * s * 0.015, dy = Math.cos(t * 1.9 + k) * s * 0.02;
      glow(ctx, jx + dx, jy + s * 0.01 + dy, s * 0.06, th.g3, lit * (0.7 + 0.3 * fl));
      glow(ctx, jx + dx, jy + s * 0.01 + dy, s * 0.02, WHITE, lit);
    }
    // Helmet: a glass dome with a collar of bolts and a faceplate that differs per diver.
    ctx.beginPath(); ctx.arc(x, hy, hr, 0, TAU);
    glassFill(ctx, th, hy - hr, hy + hr, a, [x - hr * 0.3, hy - hr * 0.3, hr * 1.2]); lum(ctx, col, w * 1.3, a);
    ctx.beginPath(); ctx.arc(x, hy, hr * 1.06, Math.PI * 0.2, Math.PI * 0.8); lum(ctx, col, w * 0.8, a * 0.6);
    const fx = x - hr * 0.18, fy = hy + hr * 0.05, fr = hr * 0.55;
    ctx.beginPath(); ctx.arc(fx, fy, fr, 0, TAU);
    ctx.save(); const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr);
    fg.addColorStop(0, rgba(th.warm, 0.22 * a * fl)); fg.addColorStop(1, rgba(col, 0.06 * a)); ctx.fillStyle = fg; ctx.globalCompositeOperation = "lighter"; ctx.fill(); ctx.restore();
    lum(ctx, col, w * 0.9, a * 0.85);
    const helm = k % 4;
    ctx.beginPath();
    if (helm === 0) { ctx.moveTo(fx - fr, fy); ctx.lineTo(fx + fr, fy); ctx.moveTo(fx, fy - fr); ctx.lineTo(fx, fy + fr); }
    else if (helm === 2) { for (let j = -1; j <= 1; j++) { const gx = fx + j * fr * 0.45; const hh = Math.sqrt(1 - Math.pow(j * 0.45, 2)) * fr; ctx.moveTo(gx, fy - hh); ctx.lineTo(gx, fy + hh); } }
    else if (helm === 3) { for (let j = -1; j <= 1; j++) { const gy = fy + j * fr * 0.45; const ww = Math.sqrt(1 - Math.pow(j * 0.45, 2)) * fr; ctx.moveTo(fx - ww, gy); ctx.lineTo(fx + ww, gy); } ctx.moveTo(fx, fy - fr); ctx.lineTo(fx, fy + fr); }
    if (helm !== 1) lum(ctx, col, w * 0.7, a * 0.75);
    if (helm === 1) {
      // Two small side ports beside the main faceplate.
      for (const [ox, oy] of [[hr * 0.55, -hr * 0.45], [hr * 0.62, hr * 0.38]]) { ctx.beginPath(); ctx.arc(x + ox, hy + oy, hr * 0.2, 0, TAU); lum(ctx, col, w * 0.7, a * 0.8); glow(ctx, x + ox, hy + oy, hr * 0.18, th.warm, a * 0.5 * fl); }
    }
    ctx.beginPath(); ctx.arc(fx, fy, fr * 0.78, Math.PI * 1.15, Math.PI * 1.5); lum(ctx, WHITE, w * 0.9, a * 0.6);
    for (let j = 0; j < 6; j++) { const an = Math.PI * (0.12 + j * 0.15); glow(ctx, x + Math.cos(an) * hr * 0.9, hy + Math.sin(an) * hr * 0.9, s * 0.02, col, a); }
    // Crest lamp on top.
    rr(ctx, x - s * 0.02, hy - hr * 1.12, s * 0.04, hr * 0.18, s * 0.01); lum(ctx, col, w * 0.7, a * 0.7);
    glow(ctx, x, hy - hr * 1.1, s * 0.05, kit === 1 ? col : th.warm, a * (0.6 + 0.4 * Math.sin(t * 4 + k)));
    ctx.restore();
    // Bubbles rising from the exhaust valve, always.
    bubbles(ctx, S, th, x - hr * 0.9, hy - hr * 0.2 + bobY, t + k * 0.37, 4, s / u * 0.7, col, 0.35 + 0.65 * lit, k);
    return { headY: hy - hr * 1.15 + bobY, x };
  }
  function peopleScene(ctx, S, th, A, b, d, t) {
    const u = S.u, tall = S.tall;
    const n = Math.max(2, Math.min(6, Math.round(d.count)));
    const perRow = tall ? Math.min(3, n) : n;
    const rows = Math.ceil(n / perRow);
    const rowH = (A.h - 20 * u) / rows;
    for (let row = 0; row < rows; row++) {
      const inRow = Math.min(perRow, n - row * perRow);
      const base = A.y + rowH * (row + 1) - 40 * u;
      const slot = A.w / perRow;
      const x0 = A.x + (A.w - slot * inRow) / 2;
      ledge(ctx, S, th, x0 + slot * 0.1, x0 + slot * (inRow - 0.1), base + 4 * u, t, 11 + row);
      const s = Math.min(rowH - 150 * u, slot * 1.5, 470 * u);
      for (let j = 0; j < inRow; j++) {
        const i = row * perRow + j;
        const q = stag(b, i, n, 0.55);
        const hot = i === Math.min(n - 1, d.highlight);
        const cx = x0 + slot * (j + 0.5);
        const col = hot ? th.acc : j % 2 ? th.g1 : mix(th.g1, th.g3, 0.5);
        const ss = s * (hot ? 1.06 : 0.97 + 0.03 * ((i * 7) % 3));
        const r = diver(ctx, S, th, cx, base, ss, col, q, t, i, hot);
        // Each diver gets its own role; extra divers beyond the named roles stay unlabelled rather than repeat one.
        const label = i < d.badges.length ? d.badges[i] : "";
        if (label && q > 0.55) {
          const qa = seg(q, 0.55, 1);
          const size = 42 * u;
          const tw = Math.min(textW(ctx, S, label, size, { weight: 600 }), slot - 70 * u);
          const bw = tw + 60 * u, bh = 70 * u;
          const by = r.headY - bh - 46 * u + Math.sin(t * 1.2 + i) * 5 * u;
          ctx.save(); ctx.globalAlpha *= qa;
          ctx.translate(0, (1 - eo(qa)) * 20 * u);
          ctx.beginPath(); ctx.moveTo(cx, by + bh); ctx.lineTo(cx, r.headY - 6 * u); lum(ctx, col, 1.2 * u, 0.5);
          rr(ctx, cx - bw / 2, by, bw, bh, bh / 2);
          solid(ctx, th.water[2], 0.7); membrane(ctx, col, 0.1); lum(ctx, col, 1.8 * u, 0.85);
          txt(ctx, S, th, label, cx, by + bh / 2 + 2 * u, size, { align: "center", weight: 600, color: hot ? mix(th.acc, WHITE, 0.35) : th.ink, glowColor: col, max: slot - 70 * u });
          ctx.restore();
        }
      }
    }
  }

  // ---- process: a current of light between three stations ---------------------------------------
  function stationIcon(ctx, S, th, kind, cx, cy, s, col, a, t) {
    const u = S.u, w = Math.max(1.5 * u, s * 0.035);
    ctx.beginPath();
    if (kind === 0) {
      // A chambered spiral shell.
      for (let k = 0; k <= 80; k++) {
        const ang = k * 0.13, rad = s * 0.04 * Math.exp(ang * 0.2);
        const px = cx + Math.cos(ang + t * 0.2) * rad, py = cy + Math.sin(ang + t * 0.2) * rad;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      lum(ctx, col, w, a);
      for (let k = 2; k < 8; k++) {
        const ang = k * 1.3, rad = s * 0.04 * Math.exp(ang * 0.2);
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(ang + t * 0.2) * rad * 0.78, cy + Math.sin(ang + t * 0.2) * rad * 0.78); ctx.lineTo(cx + Math.cos(ang + t * 0.2) * rad, cy + Math.sin(ang + t * 0.2) * rad);
        lum(ctx, col, w * 0.7, a * 0.7);
      }
      glow(ctx, cx, cy, s * 0.08, th.warm, a);
    } else if (kind === 1) {
      // A squid sketching a line of light with one arm.
      const sy = cy - s * 0.12 + Math.sin(t * 1.4) * s * 0.03;
      ctx.moveTo(cx, sy - s * 0.36);
      ctx.quadraticCurveTo(cx + s * 0.16, sy - s * 0.1, cx + s * 0.12, sy + s * 0.08);
      ctx.lineTo(cx - s * 0.12, sy + s * 0.08);
      ctx.quadraticCurveTo(cx - s * 0.16, sy - s * 0.1, cx, sy - s * 0.36);
      ctx.moveTo(cx - s * 0.1, sy - s * 0.24); ctx.lineTo(cx - s * 0.2, sy - s * 0.16); ctx.lineTo(cx - s * 0.11, sy - s * 0.1);
      ctx.moveTo(cx + s * 0.1, sy - s * 0.24); ctx.lineTo(cx + s * 0.2, sy - s * 0.16); ctx.lineTo(cx + s * 0.11, sy - s * 0.1);
      membrane(ctx, col, 0.1 * a); lum(ctx, col, w, a);
      for (let k = 0; k < 5; k++) {
        const ox = cx - s * 0.1 + k * s * 0.05;
        ctx.beginPath(); ctx.moveTo(ox, sy + s * 0.08);
        ctx.quadraticCurveTo(ox + Math.sin(t * 3 + k) * s * 0.05, sy + s * 0.2, ox + Math.sin(t * 2 + k) * s * 0.06, sy + s * 0.28);
        lum(ctx, col, w * 0.7, a * 0.8);
      }
      // The sketched line.
      const f = fract(t * 0.35);
      ctx.beginPath();
      for (let k = 0; k <= 30 * f; k++) { const px = cx - s * 0.3 + (k / 30) * s * 0.6, py = cy + s * 0.32 + Math.sin(k * 0.6) * s * 0.04; if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
      lum(ctx, th.warm, w * 0.8, a * (1 - seg(f, 0.85, 1)));
      glow(ctx, cx - s * 0.04, sy - s * 0.06, s * 0.04, th.warm, a);
      glow(ctx, cx + s * 0.04, sy - s * 0.06, s * 0.04, th.warm, a);
    } else {
      // An open clam holding a glowing pearl: the approval.
      const open = 0.5 + 0.12 * Math.sin(t * 1.2);
      ctx.moveTo(cx - s * 0.32, cy + s * 0.08);
      ctx.quadraticCurveTo(cx, cy + s * 0.4, cx + s * 0.32, cy + s * 0.08); ctx.closePath();
      lum(ctx, col, w, a);
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.32, cy + s * 0.06);
      ctx.quadraticCurveTo(cx - s * 0.1, cy - s * 0.42 * open - s * 0.05, cx + s * 0.32, cy + s * 0.06 - s * 0.2 * open);
      lum(ctx, col, w, a);
      for (let k = 1; k < 5; k++) { ctx.beginPath(); ctx.moveTo(cx - s * 0.1 + k * s * 0.08, cy + s * 0.27 - k * 0.01 * s); ctx.lineTo(cx - s * 0.04 + k * s * 0.05, cy + s * 0.12); lum(ctx, col, w * 0.5, a * 0.5); }
      const pp = 0.8 + 0.2 * Math.sin(t * 3);
      glow(ctx, cx, cy + s * 0.04, s * 0.22 * pp, mix(th.acc, WHITE, 0.4), a);
      glow(ctx, cx, cy + s * 0.04, s * 0.09, WHITE, a);
    }
  }
  function processScene(ctx, S, th, A, b, d, t) {
    const u = S.u, tall = S.tall, n = d.steps.length;
    const R = tall ? Math.min(A.w * 0.17, 140 * u) : Math.min(A.w * 0.105, A.h * 0.25, 160 * u);
    const P = [];
    for (let i = 0; i < n; i++) {
      if (tall) P.push([A.x + A.w * (i % 2 ? 0.66 : 0.34), A.y + A.h * (0.13 + i * 0.36)]);
      else P.push([A.x + A.w * (0.15 + i * 0.35), A.y + A.h * (0.4 + (i % 2 ? -0.06 : 0.04))]);
    }
    // Path through the stations as a chain of curves bowing with the current.
    const curve = [];
    for (let i = 0; i < n - 1; i++) {
      const [x1, y1] = P[i], [x2, y2] = P[i + 1];
      const bow = (i % 2 ? -1 : 1) * (tall ? 140 : 120) * u;
      const c1 = tall ? [x1 + bow, (y1 + y2) / 2] : [(x1 + x2) / 2, Math.min(y1, y2) - bow];
      for (let k = 0; k <= 40; k++) {
        const f = k / 40, a = (1 - f) * (1 - f), bb = 2 * (1 - f) * f, cc = f * f;
        curve.push([a * x1 + bb * c1[0] + cc * x2, a * y1 + bb * c1[1] + cc * y2]);
      }
    }
    const at = (f) => curve[Math.max(0, Math.min(curve.length - 1, Math.round(f * (curve.length - 1))))];
    const m = eio(seg(b, 0.08, 0.92));
    // The faint whole path, then the lit part up to the messenger.
    ctx.save(); ctx.setLineDash([3 * u, 14 * u]); ctx.lineDashOffset = -t * 40 * u;
    ctx.beginPath(); curve.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    lum(ctx, th.g1, 1.6 * u, 0.35);
    ctx.restore();
    const litN = Math.round(m * (curve.length - 1));
    if (litN > 1) {
      ctx.beginPath(); for (let k = 0; k <= litN; k++) (k ? ctx.lineTo(curve[k][0], curve[k][1]) : ctx.moveTo(curve[k][0], curve[k][1]));
      lum(ctx, th.g1, 2.6 * u, 0.7);
    }
    // Particles streaming along the lit current.
    for (let k = 0; k < 24; k++) {
      const f = fract(t * 0.12 + k / 24);
      if (f > m) continue;
      const [px, py] = at(f);
      glow(ctx, px + Math.sin(t * 2 + k) * 6 * u, py + Math.cos(t * 1.7 + k) * 6 * u, (5 + (k % 3) * 3) * u, k % 4 ? th.g1 : th.g3, 0.8);
    }
    for (let i = 0; i < n; i++) {
      const sf = i / Math.max(1, n - 1);
      const q = i === 0 ? 0.45 + 0.55 * eo(seg(b, 0, 0.2)) : 0.3 + 0.7 * eo(seg(m, sf - 0.06, sf + 0.02));
      const [cx, cy] = P[i];
      const last = i === n - 1;
      const col = last ? th.acc : th.g1;
      const breathe = 1 + 0.02 * Math.sin(t * 1.5 + i);
      // Bubble ring with a slow ring of photophores.
      ctx.beginPath(); ctx.arc(cx, cy, R * breathe, 0, TAU);
      solid(ctx, th.water[2], 0.55); membrane(ctx, col, 0.04 + 0.06 * q);
      lum(ctx, col, 2.4 * u, 0.25 + 0.75 * q);
      for (let k = 0; k < 14; k++) {
        const ang = (k / 14) * TAU + t * 0.25 * (i % 2 ? -1 : 1);
        glow(ctx, cx + Math.cos(ang) * R * 1.12, cy + Math.sin(ang) * R * 1.12, 6 * u, k % 3 ? col : th.g3, (0.2 + 0.6 * q) * (0.5 + 0.5 * Math.sin(t * 2 + k)));
      }
      stationIcon(ctx, S, th, last ? 2 : i % 2, cx, cy, R * 1.25, col, 0.25 + 0.75 * q, t);
      if (last && q > 0.9) for (let k = 0; k < 2; k++) {
        const pr = fract(t * 0.6 + k * 0.5);
        ctx.beginPath(); ctx.arc(cx, cy, R * (1.15 + pr * 0.5), 0, TAU); lum(ctx, th.acc, 1.6 * u, 0.6 * (1 - pr));
      }
      ctx.save(); ctx.globalAlpha *= 0.35 + 0.65 * q;
      txt(ctx, S, th, String(i + 1).padStart(2, "0"), cx - R * 0.95, cy - R * 0.95, 42 * u, { align: "center", fam: "figures", color: mix(col, WHITE, 0.2), glowColor: col });
      const lw = tall ? A.w * 0.62 : A.w * 0.3;
      txt(ctx, S, th, d.steps[i] || "", cx, cy + R + 66 * u, 44 * u, { align: "center", weight: 600, color: last ? mix(th.acc, WHITE, 0.35) : th.ink, glowColor: col, max: lw });
      ctx.restore();
    }
    // The messenger fish carries the light along.
    const [fx, fy] = at(Math.min(0.999, m));
    const [gx, gy] = at(Math.min(1, m + 0.01));
    const settle = b >= 1 ? Math.sin(t * 1.2) * 14 * u : 0;
    glow(ctx, fx, fy + settle, 46 * u, th.warm, 0.35);
    fish(ctx, th, fx, fy - 20 * u + settle, 26 * u, gx >= fx ? 1 : -1, th.warm, 1, Math.sin(t * 10));
  }

  // ---- compare: two bait balls --------------------------------------------------------------------
  function compareScene(ctx, S, th, A, b, d, t, e = 0) {
    const u = S.u, tall = S.tall;
    const gap = (tall ? 60 : 110) * u;
    const vertical = tall;
    const cw = vertical ? A.w : (A.w - gap) / 2, ch = vertical ? (A.h - gap) / 2 : A.h * 0.92;
    const max = Math.max(d.leftValue, d.rightValue, 1);
    // The smaller count wins (fewer rounds is better); its pool settles into formation at the end.
    const win = d.rightValue <= d.leftValue ? 1 : 0;
    const pools = [[d.left, d.leftValue, th.g2], [d.right, d.rightValue, th.acc]];
    pools.forEach(([label, value, col], i) => {
      // Both pools fill together; the counts simply run at their own pace.
      const q = eo(clamp((b - i * 0.05) / 0.7));
      const winner = i === win;
      const dim = winner ? 1 : 1 - 0.45 * e;
      const x = vertical ? A.x : A.x + i * (cw + gap), y = vertical ? A.y + i * (ch + gap) : A.y + (A.h - ch) / 2;
      // Frame: a faint lit outline with photophores at the corners; the winner's brightens at the end.
      ctx.save(); ctx.globalAlpha *= (0.8 + 0.2 * clamp(q * 2.5)) * (winner ? 1 : 1 - 0.3 * e);
      rr(ctx, x, y, cw, ch, 40 * u);
      solid(ctx, th.water[2], 0.45); membrane(ctx, col, 0.035 + (winner ? 0.04 * e : 0));
      lum(ctx, col, (1.6 + (winner ? 1.2 * e : 0)) * u, 0.55 + (winner ? 0.4 * e : 0));
      for (const [px, py] of [[x + 40 * u, y], [x + cw - 40 * u, y], [x + 40 * u, y + ch], [x + cw - 40 * u, y + ch]]) glow(ctx, px, py, (12 + (winner ? 10 * e : 0)) * u, col, 0.6 + 0.4 * Math.sin(t * 2 + px));
      txt(ctx, S, th, label, x + 46 * u, y + 74 * u, 46 * u, { weight: 600, color: i ? mix(th.acc, WHITE, 0.3) : th.ink, glowColor: col, max: cw - 92 * u });
      ctx.restore();
      // Bait ball: fish circle a shared centre; the count follows the value. At the end the winner's
      // school tightens into one clean ring and the other loosens and dims.
      const bx = x + cw * (vertical ? 0.72 : 0.68), by = y + ch * (vertical ? 0.42 : 0.42);
      const R = Math.min(cw * (vertical ? 0.24 : 0.28), ch * (vertical ? 0.3 : 0.27));
      const N = Math.round(8 + 62 * (value / max));
      const shown = Math.round(Math.min(N, 6) + (N - Math.min(N, 6)) * q);
      // A dormant glow holds the pool's centre before its fish arrive.
      glow(ctx, bx, by, R * (0.9 + 0.1 * Math.sin(t * 1.5 + i)), col, (0.14 + 0.06 * Math.sin(t * 1.5 + i)) * dim + (winner ? 0.12 * e : 0));
      const dir = i ? 1 : -1;
      for (let k = 0; k < shown; k++) {
        const p = SWARM[k % SWARM.length];
        const sp = (0.5 + p.s * 0.5) * (i ? 1.1 : 0.7);
        const ang = p.ph + t * sp * dir;
        const rad = R * (0.35 + 0.65 * p.x) * (winner ? 1 : 1 + 0.18 * e);
        const tilt = (p.y - 0.5) * 0.9;
        let px = bx + Math.cos(ang) * rad, py = by + Math.sin(ang) * rad * (0.45 + 0.35 * p.k) + Math.sin(ang) * tilt * R * 0.3;
        let head = Math.sin(ang) * dir < 0 ? 1 : -1;
        if (winner && e > 0) {
          const ra = (k / Math.max(1, shown)) * TAU + t * 0.9 * dir;
          const fx = bx + Math.cos(ra) * R * 0.72, fy = by + Math.sin(ra) * R * 0.5;
          px += (fx - px) * e; py += (fy - py) * e;
          if (e > 0.5) head = Math.sin(ra) * dir < 0 ? 1 : -1;
        }
        fish(ctx, th, px, py, (13 + p.s * 8) * u, head, col, dim, Math.sin(t * 11 + k));
      }
      // Big glowing number.
      const ns = Math.min(170 * u, ch * 0.3, cw * 0.3);
      const pop = winner ? 1 + 0.1 * e * (1 + 0.15 * Math.sin(t * 3)) : 1;
      const nx = x + 46 * u, ny = y + ch * 0.44;
      ctx.save(); ctx.globalAlpha *= (0.5 + 0.5 * clamp(q * 5)) * (winner ? 1 : 1 - 0.5 * e);
      ctx.translate(nx, ny); ctx.scale(pop, pop); ctx.translate(-nx, -ny);
      txt(ctx, S, th, fmt(value * q, { ref: value, prefix: d.prefix, suffix: d.suffix }), nx, ny, ns, { fam: "figures", weight: 600, color: i ? mix(th.acc, WHITE, 0.3) : mix(th.g2, WHITE, 0.5), glowColor: col, max: cw * 0.5 });
      ctx.restore();
      if (winner && e > 0.05) for (let k = 0; k < 2; k++) {
        const pr = fract(t * 0.6 + k * 0.5);
        ctx.beginPath(); ctx.arc(nx + ns * 0.28, ny, ns * (0.45 + pr * 0.45), 0, TAU); lum(ctx, col, 1.6 * u, 0.55 * (1 - pr) * e);
      }
      // Dot track: one lit node per round, joined by a thread of light as the count passes each.
      const tx0 = x + 60 * u, tx1 = x + cw - 60 * u, ty = y + ch * (vertical ? 0.76 : 0.72);
      const nodes = Math.max(1, Math.min(12, Math.round(value)));
      const litN = (value * q) * (nodes / Math.max(1, value));
      const step = nodes > 1 ? (tx1 - tx0) / (nodes - 1) : 0;
      const nodeX = (k) => nodes > 1 ? tx0 + step * k : (tx0 + tx1) / 2;
      ctx.save(); ctx.globalAlpha *= clamp(q * 4 + 0.35) * dim;
      ctx.save(); ctx.setLineDash([2 * u, 12 * u]); ctx.lineDashOffset = -t * 30 * u * dir;
      ctx.beginPath(); ctx.moveTo(tx0 - 20 * u, ty); ctx.lineTo(tx1 + 20 * u, ty); lum(ctx, col, 1.2 * u, 0.3);
      ctx.restore();
      const litEnd = nodes > 1 ? nodeX(Math.max(0, litN - 1)) : nodeX(0);
      if (litN > 0.05) {
        ctx.beginPath(); ctx.moveTo(tx0, ty); ctx.lineTo(Math.max(tx0, litEnd), ty); lum(ctx, col, (2 + (winner ? 1.2 * e : 0)) * u, 0.8);
        // A pulse runs back and forth along the lit thread.
        const pf = 0.5 - 0.5 * Math.cos(t * 1.6 + i * 2);
        glow(ctx, tx0 + (Math.max(tx0, litEnd) - tx0) * pf, ty, 16 * u, mix(col, WHITE, 0.3), 0.8);
      }
      const nr = Math.min(20 * u, Math.max(8 * u, step * 0.22 || 20 * u));
      for (let k = 0; k < nodes; k++) {
        const on = clamp(litN - k);
        const px = nodeX(k), py = ty + Math.sin(t * 2 + k * 0.7 + i) * 3 * u;
        ctx.beginPath(); ctx.arc(px, py, nr, 0, TAU);
        solid(ctx, th.water[2], 0.7); membrane(ctx, col, 0.05 + 0.25 * on);
        lum(ctx, col, 1.4 * u, 0.3 + 0.6 * on);
        glow(ctx, px, py, nr * (0.9 + 0.5 * on), on > 0 ? mix(col, WHITE, 0.25) : col, on > 0 ? 0.35 + 0.65 * on * (0.85 + 0.15 * Math.sin(t * 4 - k)) : 0.15);
      }
      ctx.restore();
      // Photophore meter along the bottom.
      const mx = x + 46 * u, my = y + ch - 56 * u, mw = cw - 92 * u;
      const dots = 20, lit = (value / max) * q * dots;
      for (let k = 0; k < dots; k++) {
        const on = clamp(lit - k);
        const px = mx + (mw * (k + 0.5)) / dots;
        glow(ctx, px, my, (6 + 6 * on) * u, on > 0 ? col : th.g1, (on > 0 ? (0.5 + 0.5 * on) * (0.8 + 0.2 * Math.sin(t * 4 - k * 0.5)) : 0.18) * dim);
      }
    });
    // A current carrying motes from the first pool to the second.
    const q2 = eo(clamp((b - 0.05) / 0.7));
    if (q2 > 0) {
      const x1 = vertical ? A.x + A.w * 0.5 : A.x + cw - 10 * u, y1 = vertical ? A.y + ch - 10 * u : A.y + A.h * 0.5;
      const x2 = vertical ? x1 : A.x + cw + gap + 10 * u, y2 = vertical ? A.y + ch + gap + 10 * u : y1;
      for (let k = 0; k < 8; k++) {
        const f = fract(t * 0.5 + k / 8);
        glow(ctx, x1 + (x2 - x1) * f, y1 + (y2 - y1) * f + Math.sin(f * TAU + k) * 10 * u, 7 * u, th.g1, q2 * Math.sin(Math.PI * f));
      }
    }
  }

  // ---- statements: title and closing --------------------------------------------------------------
  const MEASURE = {};
  function measure(S, id) {
    const el = document.getElementById(id);
    if (!el) return null;
    const key = id + "|" + el.textContent + "|" + el.style.fontSize + "|" + S.W;
    if (MEASURE[key]) return MEASURE[key];
    const c = document.createElement("canvas").getContext("2d");
    const size = parseFloat(el.style.fontSize) || 110 * S.u;
    const maxW = parseFloat(el.style.width) || S.W * 0.8;
    c.font = font(S, size, S.look.displayWeight, "display");
    try { c.letterSpacing = (parseFloat(S.look.displayTracking) || 0) * size + "px"; } catch (err) { /* older canvas */ }
    const words = String(el.textContent).split(/\s+/).filter(Boolean);
    const breakAt = (limit) => {
      const out = [];
      let line = "";
      for (const w of words) { const next = line ? line + " " + w : w; if (line && c.measureText(next).width > limit) { out.push(line); line = w; } else line = next; }
      if (line) out.push(line);
      return out;
    };
    // The headline is set with balanced lines; find the narrowest width that keeps the line count.
    let lines = breakAt(maxW);
    if (lines.length > 1) {
      let lo = Math.max(...words.map((w) => c.measureText(w).width)), hi = maxW;
      for (let k = 0; k < 18; k++) { const mid = (lo + hi) / 2; if (breakAt(mid).length > lines.length) lo = mid; else hi = mid; }
      lines = breakAt(hi);
    }
    const w = Math.max(1, ...lines.map((l) => c.measureText(l).width));
    let h = lines.length * size * 1.04;
    if (id === "title") { const k = document.getElementById("kicker"); if (k && k.textContent) h += (parseFloat(k.style.fontSize) || 30 * S.u) * 1.6 + (parseFloat(k.style.marginBottom) || 24 * S.u); }
    const side = parseFloat(el.parentElement && el.parentElement.style.paddingLeft) || 140 * S.u;
    return (MEASURE[key] = { x: side, y: (S.H - h) / 2, w, h, size });
  }
  function statement(ctx, S, th, info, shift) {
    const { W, H, u, tall } = S;
    const t = info.t, local = info.local;
    const R = measure(S, info.scene) || { x: 140 * u, y: H * 0.4, w: W * 0.5, h: H * 0.2 };
    const closing = info.scene === "closing";
    ctx.save();
    ctx.translate(shift.dx, 0);
    ctx.globalAlpha *= shift.a;
    if (shift.blur > 0.4) ctx.filter = `blur(${shift.blur.toFixed(1)}px)`;
    const q = 0.35 + 0.65 * eo(local / 1.2);
    // A halo of plankton gathers around the words as they arrive.
    const cx = R.x + R.w / 2, cy = R.y + R.h / 2;
    for (let k = 0; k < 46; k++) {
      const p = FLARE[k];
      const ang = p.ph + t * (0.12 + p.s * 0.1);
      const rx = R.w / 2 + (60 + p.x * 140) * u, ry = R.h / 2 + (50 + p.y * 110) * u;
      const f = 1.6 - 0.6 * q;
      glow(ctx, cx + Math.cos(ang) * rx * f, cy + Math.sin(ang) * ry * f, (3 + p.s * 7) * u, p.k < 0.7 ? th.g1 : th.g3, (0.25 + 0.5 * q) * (0.5 + 0.5 * Math.sin(t * 2 + k)));
    }
    if (!closing) {
      // A great lantern ray glides through the open water beside the title.
      const free = tall ? { x: W * 0.55, y: Math.max(300 * u, R.y * 0.5) } : { x: W * 0.74, y: Math.min(H * 0.27, R.y - 60 * u) };
      const s = tall ? Math.min(W * 0.34, R.y * 0.42) : Math.min(W * 0.17, 330 * u);
      const glide = local * 22 * u;
      ray(ctx, th, free.x + 60 * u - glide, free.y + Math.sin(t * 0.7) * 24 * u, Math.max(120 * u, s), t * 1.5, th.g1, 0.85 * eo(local / 0.6 + 0.4));
      // Lanternfish school crossing below.
      school(ctx, S, th, t + 9, 1.1, 0.7);
    } else {
      // Closing: a slow vortex of living light around a pearl rising from an opening clam.
      // The vortex keeps entirely clear of the words: its own column beside them when there is room,
      // otherwise the open water below the baseline. Its widest reach is about 1.3 × vr.
      const room = W - (R.x + R.w);
      const base = R.y + R.h;
      const side = !tall && room > 520 * u;
      let vx, vy, vr;
      if (side) {
        vr = Math.min((room / 2 - 40 * u) / 1.3, 300 * u);
        vx = R.x + R.w + room / 2 + 10 * u;
        vy = Math.max(R.y + R.h * 0.5, base + 30 * u - vr * 0.62);
      } else {
        const below = H * (tall ? 0.93 : 0.9) - base;
        vr = tall ? Math.min(W * 0.3, below * 0.55) : Math.min(W * 0.16, below * 0.6, 300 * u);
        vx = tall ? W / 2 : W * 0.72;
        vy = base + vr * 0.55 * 1.3 + 30 * u;
      }
      const gather = 0.75 + 0.25 * eo(local / 1.6);
      for (let arm = 0; arm < 3; arm++) {
        ctx.beginPath();
        for (let k = 0; k <= 60; k++) {
          const f = k / 60;
          const rad = vr * (0.1 + 0.95 * f) * (1.7 - 0.7 * gather);
          const ang = f * 5.5 + (arm * TAU) / 3 + t * (0.9 - f * 0.5);
          const px = vx + Math.cos(ang) * rad, py = vy + Math.sin(ang) * rad * 0.55;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        lum(ctx, arm === 0 ? th.acc : arm === 1 ? th.g1 : th.g3, 1.6 * u, 0.45 * gather);
      }
      glow(ctx, vx, vy, vr * 0.5, th.acc, 0.25 * gather);
      for (let k = 0; k < 220; k++) {
        const p = FLARE[k % FLARE.length];
        const arm = k % 3;
        const rad = vr * (0.12 + 0.88 * p.x) * (1.7 - 0.7 * gather);
        const ang = p.x * 5.5 + (arm * TAU) / 3 + t * (0.9 - p.x * 0.5);
        glow(ctx, vx + Math.cos(ang) * rad, vy + Math.sin(ang) * rad * 0.55, (5 + p.s * 10) * u, arm === 0 ? th.acc : arm === 1 ? th.g1 : th.g3, gather * (0.4 + 0.6 * Math.sin(t * 2 + k)));
      }
      const open = eo(seg(local, 0.3, 1.3));
      const clamY = vy + vr * 0.62;
      const s = vr * 0.75;
      ctx.beginPath(); ctx.moveTo(vx - s * 0.5, clamY); ctx.quadraticCurveTo(vx, clamY + s * 0.42, vx + s * 0.5, clamY); ctx.closePath();
      glassFill(ctx, th, clamY, clamY + s * 0.25, 1, [vx, clamY + s * 0.1, s * 0.5, th.acc]); lum(ctx, th.acc, 2.2 * u, 0.9);
      for (let k = 1; k < 6; k++) { ctx.beginPath(); ctx.moveTo(vx, clamY + s * 0.2); ctx.lineTo(vx - s * 0.5 + k * s / 6, clamY + 1 * u); lum(ctx, th.acc, 0.8 * u, 0.4); }
      ctx.beginPath(); ctx.moveTo(vx - s * 0.5, clamY - 2 * u); ctx.quadraticCurveTo(vx - s * 0.1, clamY - s * (0.1 + 0.55 * open), vx + s * 0.5, clamY - s * 0.3 * open);
      lum(ctx, th.acc, 2.2 * u, 0.9);
      const rise = eo(seg(local, 0.6, 2.0));
      const py = clamY - s * 0.1 - rise * vr * 0.6 + Math.sin(t * 1.4) * 8 * u;
      const pp = 0.85 + 0.15 * Math.sin(t * 3);
      // Shaft of light from the pearl.
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const sg = ctx.createLinearGradient(0, py, 0, py - vr * 0.7);
      sg.addColorStop(0, rgba(th.acc, 0.22 * open)); sg.addColorStop(1, rgba(th.acc, 0));
      ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(vx - 20 * u, py); ctx.lineTo(vx - 70 * u, py - vr * 0.7); ctx.lineTo(vx + 70 * u, py - vr * 0.7); ctx.lineTo(vx + 20 * u, py); ctx.closePath(); ctx.fill();
      ctx.restore();
      glow(ctx, vx, py, 80 * u * pp * open, mix(th.acc, WHITE, 0.3), open);
      glow(ctx, vx, py, 26 * u * open, WHITE, open);
      for (let k = 0; k < 2; k++) {
        const pr = fract(t * 0.5 + k * 0.5);
        ctx.beginPath(); ctx.arc(vx, py, 40 * u + pr * Math.min(160 * u, vr * 0.7), 0, TAU); lum(ctx, th.acc, 1.6 * u, 0.55 * (1 - pr) * open);
      }
    }
    ctx.restore();
  }

  // ---- scene wrapper ------------------------------------------------------------------------------
  function area(S, box) {
    const u = S.u;
    return S.tall ? { x: box.x - 20 * u, y: box.y - 30 * u, w: box.w + 40 * u, h: box.h + 60 * u } : { x: box.x - 30 * u, y: box.y - 30 * u, w: box.w + 60 * u, h: box.h + 50 * u };
  }
  function wrap(fn) {
    return (ctx, S, box, p, d, info) => {
      const th = theme(S);
      const leaving = info.exit !== undefined;
      const sh = sceneShift(S, info);
      ctx.save();
      ctx.translate(sh.dx, 0);
      ctx.globalAlpha *= sh.a;
      // An opening scene (no title before it) surfaces out of the water instead of being there at frame 0.
      if (!leaving && FRAME.index === 0) {
        const f = eo(seg(info.local, 0.05, 0.7));
        ctx.globalAlpha *= f;
        if (f < 0.98) ctx.filter = `blur(${(8 * S.u * (1 - f)).toFixed(1)}px)`;
      }
      if (sh.blur > 0.4) ctx.filter = `blur(${sh.blur.toFixed(1)}px)`;
      // Builds run over most of the hold; the scene's habitat is in place from the first frame.
      const build = leaving ? 1 : clamp((info.local - 0.15) / Math.max(0.9, info.hold * 0.62));
      // A closing beat for the last part of the hold, so a scene ends on a gesture, not a freeze.
      const end = leaving ? 1 : seg(info.local, info.hold * 0.62, info.hold * 0.9);
      fn(ctx, S, th, area(S, box), build, d, info.t, eio(end));
      ctx.restore();
      if (!leaving) fore(ctx, S, th, info.t);
    };
  }

  // Headline bloom: a hot white edge, a body glow in the light colour and a wide second-colour bloom.
  const bloom = (a, b) => `0 0 2px rgba(255,255,255,0.85), 0 0 7px rgba(${a},0.95), 0 0 18px rgba(${a},0.7), 0 0 40px rgba(${a},0.5), 0 0 80px rgba(${b},0.4), 0 0 140px rgba(${b},0.22)`;
  const LOOK = {
    bg: "#020b18", panel: "rgba(120,240,255,0.06)", ink: "#eafcff", muted: "#9fc4d6", accent: "#ff6fd8", onAccent: "#020b18",
    rule: "rgba(111,243,255,0.45)", track: "rgba(111,243,255,0.12)",
    // Optima: a flared humanist face with the calm of a field journal; it carries a bloom well.
    display: "Optima, Candara, 'Segoe UI', 'Avenir Next', sans-serif", displayWeight: 600, displayCase: "none", displayTracking: "0.025em",
    body: "Optima, Candara, 'Segoe UI', 'Avenir Next', sans-serif", bodyWeight: 600,
    figures: "Optima, Candara, 'Segoe UI', 'Avenir Next', sans-serif", radius: 36, motion: "focus", change: "frost",
    kit: { line: 2.4, glow: 18, fill: "glass", panel: "outline" },
    panelEdge: "rgba(111,243,255,0.5)",
    water: ["#082743", "#020f22", "#000309"], glows: ["#6ff3ff", "#a08bff", "#5dffb8", "#ffbf6b"], rock: "#01060c",
    textShadow: () => bloom("111,243,255", "160,139,255"),
    palettes: {
      // Twilight: the lit upper deep, teal-blue with amber lures. Abyss: black water, green light.
      // Moonlit: silver light on graphite water.
      light: { bg: "#0e4a68", ink: "#f4feff", muted: "#bfe6f2", accent: "#ffd166", onAccent: "#062033", panelEdge: "rgba(190,250,255,0.6)",
        water: ["#2a86ad", "#0f4a6a", "#05243a"], glows: ["#b6fbff", "#8fd3ff", "#9dffd0", "#ffd166"], rock: "#041c2c",
        textShadow: () => bloom("182,251,255", "143,211,255") },
      dark: { bg: "#000604", ink: "#e8fff4", muted: "#8fcfb4", accent: "#4fd8ff", onAccent: "#000604", panelEdge: "rgba(77,255,176,0.5)",
        water: ["#03140f", "#010906", "#000201"], glows: ["#4dffb0", "#2fe6ff", "#b9ff5c", "#ffa94d"], rock: "#000302",
        textShadow: () => bloom("77,255,176", "47,230,255") },
      mono: { bg: "#06080b", ink: "#f2f6fa", muted: "#a7b0bb", accent: "#ffffff", onAccent: "#06080b", panelEdge: "rgba(220,230,240,0.45)",
        water: ["#1a2028", "#0a0d11", "#020304"], glows: ["#dfe8f2", "#a9b4c2", "#c9d3df", "#f5f0e6"], rock: "#030405",
        textShadow: () => bloom("223,232,242", "169,180,194") },
    },
    backdrop: (accent, texture = 1, look) => {
      const w = (look && look.water) || ["#0b2d4c", "#03132a", "#01040b"];
      return `${grain(0.06 * texture)}, linear-gradient(180deg, ${w[0]} 0%, ${w[1]} 45%, ${w[2]} 100%)`;
    },
    css: (accent, look) => `#title-scene .kicker { display: inline-flex; align-items: center; gap: 0.8em; letter-spacing: 0.22em; color: ${look.ink};
        text-shadow: 0 0 10px ${accent}, 0 0 26px ${accent}; }
      #title-scene .kicker::before { content: ""; width: 0.55em; height: 0.55em; border-radius: 50%; background: #ffffff;
        box-shadow: 0 0 0.4em #ffffff, 0 0 0.9em ${accent}, 0 0 1.8em ${accent}; }
      #root .display { color: ${look.ink}; }
      #title, #closing, #root h2.display { text-wrap: balance; }`,
    // Other templates get the water, snow and seafloor on the texture canvas.
    paint: (ctx, W, H, t, accent, look) => {
      ctx.clearRect(0, 0, W, H);
      if (document.getElementById("art")) return; // The illustrated template draws the world on its stage.
      const S = { W, H, u: Math.min(W, H) / 1080, tall: H > W * 1.15, look, accent, paint: true };
      const th = theme(S);
      FRAME.vel = DRIFT * S.u; FRAME.index = 0;
      const camX = t * DRIFT * S.u;
      world(ctx, S, th, t, camX, null);
      snow(ctx, S, th, t, camX, 2);
      vignette(ctx, S, th);
    },
    keepArt: true,
    overlap: true,
    stage(ctx, S, info) {
      const th = theme(S);
      const index = Math.max(0, info.index);
      const cam = cameraAt(S, info.t, index, info.local, info.change);
      Object.assign(FRAME, { scene: info.scene, t: info.t, index, local: info.local, hold: info.hold, change: info.change, camX: cam.x, vel: cam.vel, glide: cam.glide });
      if (!S.paint) return;
      world(ctx, S, th, info.t, cam.x, info);
      // The title has no drawer, so its art leaves here as the first scene arrives.
      const ctl = (window.__dreamcut && window.__dreamcut.controls) || {};
      const titleHold = Number(ctl.title_hold ?? 2.4);
      if (index === 1 && titleHold > 0 && info.local < info.change) {
        const sh = sceneShift(S, { exit: clamp(info.local / Math.max(0.01, info.change)) });
        statement(ctx, S, th, { ...info, scene: "title", local: titleHold + info.local, hold: titleHold }, sh);
      }
      if (info.scene === "title" || info.scene === "closing") {
        const sh = info.scene === "closing" ? sceneShift(S, { local: info.local, change: info.change }) : { dx: 0, a: 1, blur: 0 };
        statement(ctx, S, th, info, sh);
        fore(ctx, S, th, info.t);
      }
    },
    scenes: { chart: wrap(chartScene), object: wrap(objectScene), people: wrap(peopleScene), process: wrap(processScene), compare: wrap(compareScene) },
  };
  return LOOK;
});
