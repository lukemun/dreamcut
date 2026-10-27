// Keynote: a launch stage. A black studio with a glossy reflective floor, light slats on the back wall,
// sweeping beams and drifting dust. Every scene is a lit product render standing on that floor: a
// machined jog-dial puck with an LED ring (title, closing), liquid-light glass tubes (chart), a device
// with a live editor on its screen (object), glossy figurines on pedestals (people), hovering glass tiles
// over pads joined by a light rail (process) and two plinths (compare). Specular sweeps cross every
// object, the camera pushes in through each hold and slides the stage sideways at each change.
// Every frame is a pure function of time: seeded noise only, no clocks.
window.DreamcutMotion.register("keynote", ({ hexA, rng }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const seg = (p, a, b) => clamp((p - a) / Math.max(1e-6, b - a));
  const stagger = (p, i, n, spread = 0.5) => eo((p - (i / Math.max(1, n)) * spread) / (1 - spread));
  const fract = (v) => v - Math.floor(v);

  // ---- colour ------------------------------------------------------------------------------------
  function rgb(value) {
    const s = String(value || "");
    if (s[0] === "#") {
      const h = s.length === 4 ? s.slice(1).split("").map((c) => c + c).join("") : s.slice(1, 7);
      const n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (m) return m[1].split(",").slice(0, 3).map(Number);
    return [200, 200, 210];
  }
  const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a)})`;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  // Rotate a colour's hue (degrees) to find a partner for gradients.
  function shift(c, deg) {
    const a = (deg * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a), k = (1 - cs) / 3, q = Math.sqrt(1 / 3) * sn;
    const m0 = cs + k, m1 = k - q, m2 = k + q;
    return [c[0] * m0 + c[1] * m1 + c[2] * m2, c[0] * m2 + c[1] * m0 + c[2] * m1, c[0] * m1 + c[1] * m2 + c[2] * m0].map((v) => clamp(v, 0, 255));
  }
  const WHITE = [255, 255, 255], BLACK = [0, 0, 0];

  function theme(S) {
    const L = S.look;
    const bg = rgb(L.bg), light = lum(bg) > 150, acc = rgb(S.accent), ink = rgb(L.ink);
    const acc2 = mix(shift(acc, -50), WHITE, 0.1);
    return {
      light, bg, acc, acc2, ink, muted: rgb(L.muted), u: S.u, tex: L.texture ?? 1,
      onAccent: L.onAccent || (lum(acc) > 170 ? "#111216" : "#ffffff"),
      wallTop: light ? mix(bg, WHITE, 0.6) : mix(bg, BLACK, 0.6),
      wallLow: light ? mix(bg, [214, 217, 226], 0.7) : mix(mix(bg, acc, 0.08), WHITE, 0.02),
      floorFar: light ? mix(bg, WHITE, 0.3) : mix(mix(bg, acc, 0.05), WHITE, 0.035),
      floorNear: light ? mix(bg, [190, 194, 204], 0.75) : mix(bg, BLACK, 0.75),
      metalDark: light ? [170, 174, 186] : [16, 17, 21], metalLit: light ? [253, 253, 255] : [176, 180, 192],
      glass: light ? [232, 234, 241] : [9, 10, 13], screen: light ? [246, 247, 250] : [10, 11, 15],
      panel: light ? [255, 255, 255] : [24, 26, 33],
      figure: light ? [236, 237, 242] : [52, 55, 66],
      add: light ? "source-over" : "lighter",
      hi: (a) => (light ? rgba(ink, a * 0.6) : rgba(WHITE, a)),
    };
  }

  // ---- controls and layout -----------------------------------------------------------------------
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  const DEF = { title: 2.4, chart: 3.4, object: 3.6, people: 3.2, process: 3.6, compare: 3.2, closing: 2.4 };
  const ctl = () => (window.__dreamcut && window.__dreamcut.controls) || {};
  const holdOf = (id) => Number(ctl()[id + "_hold"] ?? DEF[id]);
  const shownIds = () => ORDER.filter((id) => holdOf(id) > 0);
  const onStage = () => ctl().backdrop !== false;

  // Bottom edge of a scene's headline, read once from the laid-out page (no transforms involved).
  const MEAS = {};
  function headBottom(S, id) {
    const el = document.getElementById(id === "title" ? "title" : id === "closing" ? "closing" : id + "-title");
    if (!el || !el.parentElement) return S.H * 0.3;
    const key = id + "|" + el.textContent + "|" + el.style.fontSize + "|" + S.W + "x" + S.H;
    if (MEAS[key] != null) return MEAS[key];
    const v = el.parentElement.offsetTop + el.offsetTop + el.offsetHeight;
    return (MEAS[key] = v > 0 ? v : S.H * 0.3);
  }
  function area(S, box, id) {
    const u = S.u;
    const top = headBottom(S, id) + (S.tall ? 70 : 44) * u;
    const floor = S.H * (S.tall ? 0.83 : 0.81);
    return { x: box.x, w: box.w, y: top, floor, h: floor - top };
  }

  // ---- buffers, noise ----------------------------------------------------------------------------
  const BUF = {};
  function buf(key, w, h) {
    let c = BUF[key];
    if (!c) c = BUF[key] = document.createElement("canvas");
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return c;
  }
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
  let MOTES = null;
  function motes() {
    if (MOTES) return MOTES;
    const r = rng(41);
    MOTES = Array.from({ length: 80 }, () => ({ x: r(), y: r(), s: 0.8 + r() * 2.6, vx: 4 + r() * 10, vy: 6 + r() * 14, w: 0.6 + r() * 1.8, ph: r() * TAU, d: 0.3 + r() * 0.7 }));
    return MOTES;
  }

  // ---- camera ------------------------------------------------------------------------------------
  // A change is a light blade: a vertical sheet of light sweeps right to left across the stage while the
  // camera pans with it. The outgoing set is cut off left of the blade, the incoming one stands right of
  // it, so the two never overlap. The sweep starts `change` before the boundary (as the old headline
  // leaves) and ends just after it, so the new headline lands over its own set. Each hold dollies in and
  // drifts sideways so nothing ever sits still.
  const CUR = { index: 0, scene: null, local: 0, change: 0.45, t: 0, hold: 1, next: null, prev: null };
  const D = (S) => (S.tall ? S.W * 1.05 : S.W * 0.62);
  const PAN = (S) => D(S) * 0.42;
  const isStatement = (id) => id === "title" || id === "closing" || !id;
  function view(ctx, S, ox, s, oy = 0) {
    const py = S.H * 0.62;
    ctx.translate(S.W / 2 + ox, py + oy);
    ctx.scale(s, s);
    ctx.translate(-S.W / 2, -py);
  }
  // Progress of the blade for a scene leaving ("out": tau measured from its end) or arriving ("in").
  function wipe(S, info, role) {
    const CH = Math.max(0.2, info.change || 0.45), L = CH * 1.5;
    const tau = role === "out" ? info.local - info.hold : info.local;
    const g = eio((tau + CH) / L);
    return { tau, g, bx: S.W * (1 - g) };
  }
  function roleOf(info) {
    if (info.exit !== undefined) return "out";
    if (info.pre) return "in";
    if (CUR.next && info.local > info.hold - info.change) return "out";
    if (CUR.index > 0 && info.local < info.change * 0.5) return "in";
    return "hold";
  }
  // Camera for a scene: a slow dolly and drift through the hold, panning with the blade at a change.
  function shot(S, info, role) {
    const k = clamp(info.local / Math.max(0.5, info.hold));
    const kk = k;
    let ox = (0.5 - kk) * S.W * 0.042, s = 1 + 0.075 * kk, oy = (0.5 - kk) * S.H * 0.036, alpha = 1, clip = null, skip = false;
    if (role === "out") { const w = wipe(S, info, "out"); ox -= w.g * PAN(S); clip = [0, w.bx]; skip = w.bx <= 1; }
    else if (role === "in") { const w = wipe(S, info, "in"); ox += (1 - w.g) * PAN(S); clip = [w.bx, S.W]; skip = w.bx >= S.W - 1; }
    else if (CUR.index <= 0) alpha = 0.55 + 0.45 * eo(info.local / 0.35);
    return { ox, s, oy, alpha, clip, skip };
  }
  function frame(ctx, S, cam) {
    ctx.globalAlpha *= cam.alpha;
    if (cam.clip) { ctx.beginPath(); ctx.rect(cam.clip[0], -20, cam.clip[1] - cam.clip[0], S.H + 40); ctx.clip(); }
    view(ctx, S, cam.ox, cam.s, cam.oy);
  }
  // Where the blade is this frame (null when no change is running).
  function bladeNow(S) {
    const CH = CUR.change;
    if (CUR.index > 0 && CUR.local < CH * 0.5) return wipe(S, { local: CUR.local, hold: CUR.hold, change: CH }, "in");
    if (CUR.next && CUR.local > CUR.hold - CH) return wipe(S, { local: CUR.local, hold: CUR.hold, change: CH }, "out");
    return null;
  }

  // ---- primitives --------------------------------------------------------------------------------
  function rr(ctx, x, y, w, h, r) {
    const q = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + q, y); ctx.arcTo(x + w, y, x + w, y + h, q); ctx.arcTo(x + w, y + h, x, y + h, q);
    ctx.arcTo(x, y + h, x, y, q); ctx.arcTo(x, y, x + w, y, q); ctx.closePath();
  }
  // Front face of a vertical cylinder between y0 (bottom ellipse centre) and y1 (top ellipse centre).
  function sidePath(ctx, cx, y0, y1, r, ry) {
    ctx.beginPath();
    ctx.moveTo(cx - r, y1); ctx.lineTo(cx - r, y0);
    ctx.ellipse(cx, y0, r, ry, 0, Math.PI, 0, true);
    ctx.lineTo(cx + r, y1);
    ctx.ellipse(cx, y1, r, ry, 0, 0, Math.PI, false);
    ctx.closePath();
  }
  function metalGrad(ctx, th, x0, x1, dark = th.metalDark, lit = th.metalLit, rim = th.acc) {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, rgba(mix(dark, lit, 0.15)));
    g.addColorStop(0.16, rgba(mix(dark, lit, 0.7)));
    g.addColorStop(0.3, rgba(lit));
    g.addColorStop(0.5, rgba(mix(dark, lit, 0.32)));
    g.addColorStop(0.82, rgba(dark));
    g.addColorStop(0.95, rgba(mix(dark, mix(lit, rim, 0.35), 0.55)));
    g.addColorStop(1, rgba(mix(dark, lit, 0.25)));
    return g;
  }
  // A specular band sweeping left to right across (x, y, w, h); call inside a clip.
  function sweep(ctx, th, x, y, w, h, t, period, offset, strength = 1) {
    const k = seg(fract((t + offset) / period), 0, 0.3);
    if (k <= 0 || k >= 1) return;
    const bx = x - w * 0.35 + w * 1.7 * eio(k), bw = Math.max(w, h) * 0.16;
    ctx.save();
    ctx.globalCompositeOperation = th.add;
    const g = ctx.createLinearGradient(bx - bw, y, bx + bw, y + bw * 0.6);
    const c = th.light ? WHITE : WHITE;
    g.addColorStop(0, rgba(c, 0)); g.addColorStop(0.5, rgba(c, (th.light ? 0.55 : 0.3) * strength)); g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
  // A solid cylinder standing on `base`; returns its top-face centre and radius.
  function cylinder(ctx, S, th, cx, base, r, h, o = {}) {
    const ry = r * (o.tilt ?? 0.27), top = base - h;
    sidePath(ctx, cx, base, top, r, ry);
    ctx.fillStyle = metalGrad(ctx, th, cx - r, cx + r, o.dark, o.lit, o.rim);
    ctx.fill();
    if (o.band) { // An emissive band around the side.
      ctx.save(); sidePath(ctx, cx, base, top, r, ry); ctx.clip();
      ctx.globalCompositeOperation = th.add;
      ctx.beginPath(); ctx.ellipse(cx, top + h * 0.55, r, ry, 0, 0, Math.PI);
      ctx.lineWidth = Math.max(2, h * 0.14); ctx.strokeStyle = rgba(o.bandColor || th.acc, o.band); ctx.stroke();
      ctx.restore();
    }
    if (o.t !== undefined) { ctx.save(); sidePath(ctx, cx, base, top, r, ry); ctx.clip(); sweep(ctx, th, cx - r, top - ry, r * 2, h + ry * 2, o.t, o.period || 3.4, o.offset || 0, 0.9); ctx.restore(); }
    ctx.beginPath(); ctx.ellipse(cx, top, r, ry, 0, 0, TAU);
    const tc = o.top || th.glass;
    const g = ctx.createRadialGradient(cx - r * 0.3, top - ry * 0.5, 0, cx, top, r * 1.1);
    g.addColorStop(0, rgba(mix(tc, WHITE, th.light ? 0.5 : 0.12))); g.addColorStop(1, rgba(tc));
    ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, top, r, ry, 0, 0.1, Math.PI - 0.1);
    ctx.lineWidth = Math.max(1, 1.6 * S.u); ctx.strokeStyle = th.hi(0.55); ctx.stroke();
    if (o.ring) {
      ctx.save(); ctx.globalCompositeOperation = th.add;
      ctx.beginPath(); ctx.ellipse(cx, top, r * 0.86, ry * 0.86, 0, 0, TAU);
      ctx.lineWidth = 3 * S.u; ctx.strokeStyle = rgba(o.ringColor || th.acc, o.ring);
      ctx.shadowColor = rgba(o.ringColor || th.acc, o.ring); ctx.shadowBlur = 14 * S.u; ctx.stroke();
      ctx.restore();
    }
    return { top, ry };
  }
  // Light pooling on the floor.
  function pool(ctx, th, cx, cy, rx, ry, c, a) {
    if (a <= 0.002) return;
    ctx.save();
    ctx.globalCompositeOperation = th.add;
    ctx.translate(cx, cy); ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, rgba(mix(c, WHITE, 0.25), a)); g.addColorStop(0.45, rgba(c, a * 0.4)); g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g; ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
    ctx.restore();
  }
  function shadow(ctx, th, cx, cy, rx, ry, a = 1) {
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, `rgba(0,0,0,${(th.light ? 0.28 : 0.7) * a})`); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
    ctx.restore();
  }
  // Mirror whatever `draw` paints into the glossy floor below `floorY`, fading with depth.
  function reflect(ctx, S, th, floorY, draw) {
    if (!onStage()) return;
    const b = buf("refl", S.W, S.H), g = b.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.filter = "none";
    g.clearRect(0, 0, S.W, S.H);
    const m = ctx.getTransform();
    g.setTransform(m);
    g.translate(0, floorY * 2); g.scale(1, -1);
    draw(g);
    g.setTransform(1, 0, 0, 1, 0, 0);
    const sy = m.d * floorY + m.f;
    g.globalCompositeOperation = "destination-in";
    const gr = g.createLinearGradient(0, sy, 0, sy + S.H * 0.24);
    gr.addColorStop(0, `rgba(0,0,0,${th.light ? 0.22 : 0.34})`); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, S.W, S.H);
    g.globalCompositeOperation = "source-over";
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(b, 0, 0); ctx.restore();
  }

  // ---- type --------------------------------------------------------------------------------------
  function font(S, size, weight = 600, fam = "body") {
    const f = fam === "display" ? S.look.display : fam === "figures" ? S.look.figures : S.look.body;
    return `${weight} ${Math.round(size)}px ${f}`;
  }
  function textW(ctx, S, s, size, weight, fam) { ctx.save(); ctx.font = font(S, size, weight, fam); const w = ctx.measureText(String(s)).width; ctx.restore(); return w; }
  function fitSize(ctx, S, s, size, maxW, min, weight, fam) {
    let z = size;
    while (z > min && textW(ctx, S, s, z, weight, fam) > maxW) z = Math.max(min, z * 0.95);
    return z;
  }
  function txt(ctx, S, s, x, y, size, o = {}) {
    ctx.save();
    ctx.font = font(S, size, o.weight ?? 600, o.fam || "body");
    ctx.textAlign = o.align || "center"; ctx.textBaseline = o.base || "alphabetic";
    if (o.track) { try { ctx.letterSpacing = o.track * size + "px"; } catch (err) { /* older canvas */ } }
    if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = o.blur || 24 * S.u; }
    ctx.fillStyle = o.color || "#fff";
    ctx.fillText(String(s), x, y);
    ctx.restore();
  }
  // A label of at least 42px; wraps onto two lines when one will not fit.
  function label(ctx, S, th, s, x, y, maxW, o = {}) {
    if (!s) return;
    const u = S.u, base = (o.size || 46) * u, min = 42 * u, weight = o.weight ?? 600;
    let z = fitSize(ctx, S, s, base, maxW, min, weight);
    let lines = [String(s)];
    if (textW(ctx, S, s, z, weight) > maxW) {
      const words = String(s).split(/\s+/);
      let best = null;
      for (let k = 1; k < words.length; k++) {
        const a = words.slice(0, k).join(" "), b = words.slice(k).join(" ");
        const w = Math.max(textW(ctx, S, a, z, weight), textW(ctx, S, b, z, weight));
        if (!best || w < best.w) best = { w, l: [a, b] };
      }
      if (best) lines = best.l;
    }
    const lh = z * 1.12, dy = o.base === "middle" ? -((lines.length - 1) * lh) / 2 : o.up ? -(lines.length - 1) * lh : 0;
    lines.forEach((l, i) => txt(ctx, S, l, x, y + dy + i * lh, z, { ...o, weight }));
  }
  // A big figure with a lit gradient: the accent one glows.
  function figureText(ctx, S, th, s, x, y, size, hot, align = "center") {
    ctx.save();
    ctx.font = font(S, size, 700, "figures");
    ctx.textAlign = align; ctx.textBaseline = "alphabetic";
    try { ctx.letterSpacing = -0.02 * size + "px"; } catch (err) { /* older canvas */ }
    const g = ctx.createLinearGradient(0, y - size * 0.8, 0, y);
    if (hot) { g.addColorStop(0, rgba(mix(th.acc2, WHITE, th.light ? 0 : 0.45))); g.addColorStop(1, rgba(th.light ? mix(th.acc, BLACK, 0.1) : th.acc)); }
    else { g.addColorStop(0, rgba(th.ink)); g.addColorStop(1, rgba(mix(th.ink, th.muted, 0.8))); }
    if (hot && !th.light) { ctx.shadowColor = rgba(th.acc, 0.7); ctx.shadowBlur = size * 0.32; }
    ctx.fillStyle = g;
    ctx.fillText(String(s), x, y);
    ctx.restore();
  }
  const fmt = (v, prefix, suffix) => window.DreamcutMotion.formatNumber(v, 0, prefix, suffix);

  // ---- the stage ---------------------------------------------------------------------------------
  function backdrop(ctx, S, th, info, camX) {
    const { W, H, u } = S, t = info.t;
    const hz = H * 0.6;
    const on = 0.6 + 0.4 * eo(t / 0.9);
    let g = ctx.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, rgba(th.wallTop)); g.addColorStop(1, rgba(th.wallLow));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, hz + 1);
    // Key light washing the back wall, breathing slowly.
    ctx.save();
    ctx.globalCompositeOperation = th.add;
    ctx.translate(W / 2, hz - H * 0.06); ctx.scale(1, 0.55);
    g = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 0.6);
    const breathe = 0.85 + 0.15 * Math.sin(t * 0.9);
    g.addColorStop(0, rgba(mix(th.acc, WHITE, 0.35), (th.light ? 0.1 : 0.24) * on * breathe)); g.addColorStop(0.5, rgba(th.acc, (th.light ? 0.04 : 0.08) * on)); g.addColorStop(1, rgba(th.acc, 0));
    ctx.fillStyle = g; ctx.fillRect(-W * 0.6, -W * 0.6, W * 1.2, W * 1.2);
    ctx.restore();
    // Light slats on the back wall: a slow wave travels along them.
    const sp = 132 * u, par = camX * 0.35;
    ctx.save();
    ctx.globalCompositeOperation = th.add;
    for (let k = Math.floor(par / sp) - 1; k <= Math.floor((par + W) / sp) + 1; k++) {
      const x = k * sp - par;
      const wave = Math.pow(0.5 + 0.5 * Math.sin(t * 1.15 - k * 0.6), 3);
      const edge = clamp(1 - Math.abs(x - W / 2) / (W * 0.72));
      const a = (th.light ? 0.08 : 0.16) * (0.25 + 0.75 * wave) * on * edge;
      if (a < 0.003) continue;
      const y0 = hz * 0.1, y1 = hz - 14 * u;
      const sg = ctx.createLinearGradient(0, y0, 0, y1);
      const c = th.light ? th.ink : mix(th.acc, WHITE, 0.55);
      sg.addColorStop(0, rgba(c, 0)); sg.addColorStop(0.55, rgba(c, a)); sg.addColorStop(1, rgba(c, a * 0.3));
      ctx.fillStyle = sg; ctx.fillRect(x - 3 * u, y0, 6 * u, y1 - y0);
      const hg = ctx.createLinearGradient(x - 26 * u, 0, x + 26 * u, 0);
      hg.addColorStop(0, rgba(c, 0)); hg.addColorStop(0.5, rgba(c, a * 0.22)); hg.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = hg; ctx.fillRect(x - 26 * u, y0 + (y1 - y0) * 0.3, 52 * u, (y1 - y0) * 0.7);
    }
    ctx.restore();
    // Floor.
    g = ctx.createLinearGradient(0, hz, 0, H);
    g.addColorStop(0, rgba(th.floorFar)); g.addColorStop(1, rgba(th.floorNear));
    ctx.fillStyle = g; ctx.fillRect(0, hz, W, H - hz);
    // Horizon: a fine lit edge where the floor meets the wall.
    ctx.save();
    ctx.globalCompositeOperation = th.add;
    const hl = ctx.createLinearGradient(0, 0, W, 0);
    hl.addColorStop(0, rgba(th.acc, 0)); hl.addColorStop(0.5, rgba(mix(th.acc, WHITE, 0.3), (th.light ? 0.18 : 0.45) * on)); hl.addColorStop(1, rgba(th.acc, 0));
    ctx.fillStyle = hl; ctx.fillRect(0, hz - 1 * u, W, 2 * u);
    const hb = ctx.createLinearGradient(0, hz - 50 * u, 0, hz + 60 * u);
    hb.addColorStop(0, rgba(th.acc, 0)); hb.addColorStop(0.45, rgba(th.acc, (th.light ? 0.03 : 0.07) * on)); hb.addColorStop(1, rgba(th.acc, 0));
    ctx.fillStyle = hb; ctx.fillRect(0, hz - 50 * u, W, 110 * u);
    ctx.restore();
    // Floor seams in perspective; they travel with the camera.
    ctx.save();
    ctx.strokeStyle = th.light ? rgba(th.ink, 0.06) : rgba(WHITE, 0.045);
    ctx.lineWidth = Math.max(1, 1.2 * u);
    const sp2 = 260 * u, off = ((camX % sp2) + sp2) % sp2;
    ctx.beginPath();
    for (let x = -W * 1.5 - off; x < W * 2.5; x += sp2) { const vx = W / 2 + (x - W / 2) * 0.06; ctx.moveTo(vx, hz); ctx.lineTo(W / 2 + (x - W / 2) * 1.0, H * 1.25); }
    for (let j = 1; j < 9; j++) { const y = hz + (H - hz) * (1 - 1 / (1 + j * j * 0.08)); ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    ctx.restore();
    // Beams from the rig above, swaying; dust drifts through them.
    const beams = [];
    for (let b = 0; b < 3; b++) {
      const span = W * 1.5;
      const bx = ((W * (0.18 + 0.32 * b) - camX * 0.5) % span + span) % span - W * 0.25;
      const sway = Math.sin(t * 0.35 + b * 2.1) * 0.1 + (b - 1) * 0.12;
      beams.push({ bx, sway });
      if (th.light) continue;
      const len = H * 1.05, half = 0.12;
      const x2 = bx + Math.sin(sway - half) * len, x3 = bx + Math.sin(sway + half) * len;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const bg = ctx.createLinearGradient(bx, 0, bx + Math.sin(sway) * len * 0.6, len * 0.8);
      const a = 0.075 * on * (0.8 + 0.2 * Math.sin(t * 1.7 + b));
      bg.addColorStop(0, rgba(mix(th.acc, WHITE, 0.6), a)); bg.addColorStop(0.7, rgba(mix(th.acc, WHITE, 0.4), a * 0.3)); bg.addColorStop(1, rgba(th.acc, 0));
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.moveTo(bx - 14 * u, -20 * u); ctx.lineTo(bx + 14 * u, -20 * u); ctx.lineTo(x3, len); ctx.lineTo(x2, len); ctx.closePath(); ctx.fill();
      ctx.restore();
      pool(ctx, th, bx + Math.sin(sway) * H * 0.88, H * 0.9, 220 * u, 40 * u, mix(th.acc, WHITE, 0.5), 0.07 * on);
    }
    // Dust motes.
    ctx.save();
    ctx.globalCompositeOperation = th.add;
    const span = W * 1.6;
    for (const m of motes()) {
      const x = (((m.x * span + t * m.vx * u - camX * 0.6 * m.d) % span) + span) % span - W * 0.3;
      const y = ((((m.y * H - t * m.vy * u) % H) + H) % H);
      let inBeam = 0;
      for (const bm of beams) { const cxb = bm.bx + Math.sin(bm.sway) * y; inBeam = Math.max(inBeam, clamp(1 - Math.abs(x - cxb) / (60 * u + y * 0.14))); }
      const tw = 0.5 + 0.5 * Math.sin(t * m.w * 2 + m.ph);
      const a = (th.light ? 0.12 : 0.1 + 0.5 * inBeam) * tw * on * m.d;
      if (a < 0.01) continue;
      ctx.beginPath(); ctx.arc(x, y, m.s * u, 0, TAU);
      ctx.fillStyle = th.light ? rgba(th.ink, a * 0.5) : rgba(WHITE, a); ctx.fill();
    }
    ctx.restore();
  }

  // Finish over everything: the flare across a change, vignette and grain.
  function fore(ctx, S, th) {
    const { W, H, u } = S;
    const bl = bladeNow(S);
    if (bl && bl.g > 0 && bl.g < 1) {
      // The light blade: a bright core, a wide soft sheet, a flare where it meets the floor and a streak
      // along the horizon.
      const x = bl.bx, a = Math.min(1, Math.sin(Math.PI * bl.g) * 1.6) * (th.light ? 0.5 : 1);
      const c = mix(th.acc, WHITE, 0.55), hz = H * 0.6, fy = H * 0.84;
      ctx.save();
      ctx.globalCompositeOperation = th.add;
      let g = ctx.createLinearGradient(x - 260 * u, 0, x + 260 * u, 0);
      g.addColorStop(0, rgba(th.acc, 0)); g.addColorStop(0.42, rgba(th.acc, 0.12 * a)); g.addColorStop(0.5, rgba(c, 0.32 * a)); g.addColorStop(0.58, rgba(th.acc2, 0.12 * a)); g.addColorStop(1, rgba(th.acc2, 0));
      ctx.fillStyle = g; ctx.fillRect(x - 260 * u, 0, 520 * u, H);
      g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, rgba(WHITE, 0.25 * a)); g.addColorStop(0.55, rgba(WHITE, 0.95 * a)); g.addColorStop(1, rgba(WHITE, 0.4 * a));
      ctx.fillStyle = g; ctx.fillRect(x - 2.5 * u, 0, 5 * u, H);
      ctx.fillStyle = rgba(c, 0.5 * a); ctx.fillRect(x - 9 * u, 0, 18 * u, H);
      const fl = ctx.createLinearGradient(0, 0, W, 0);
      fl.addColorStop(0, rgba(c, 0)); fl.addColorStop(clamp(x / W), rgba(c, 0.7 * a)); fl.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = fl; ctx.fillRect(0, hz - 1.5 * u, W, 3 * u);
      ctx.translate(x, fy); ctx.scale(1, 0.12);
      const r = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 0.32);
      r.addColorStop(0, rgba(c, 0.7 * a)); r.addColorStop(0.3, rgba(th.acc, 0.25 * a)); r.addColorStop(1, rgba(th.acc, 0));
      ctx.fillStyle = r; ctx.fillRect(-W * 0.32, -W * 0.32, W * 0.64, W * 0.64);
      ctx.restore();
    }
    if (th.tex <= 0 || !onStage()) return;
    ctx.save();
    const v = ctx.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.42, W / 2, H * 0.5, Math.hypot(W, H) * 0.62);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, `rgba(0,0,0,${(th.light ? 0.14 : 0.6) * th.tex})`);
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    const f = Math.floor(CUR.t * 24), r = rng(f * 7919 + 17);
    ctx.translate(-r() * 200, -r() * 200);
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = 0.07 * th.tex;
    ctx.fillStyle = ctx.createPattern(noise(), "repeat");
    ctx.fillRect(0, 0, W + 200, H + 200);
    ctx.restore();
  }

  // ---- the hero: a machined jog-dial puck with an LED ring -----------------------------------------
  function puck(ctx, S, th, cx, cy, r, t, o = {}) {
    const u = S.u, ry = r * (o.tilt ?? 0.3), h = r * 0.3, lit = o.lit ?? 1, ring = o.ring ?? 1;
    // Side.
    sidePath(ctx, cx, cy + h, cy, r, ry);
    ctx.fillStyle = metalGrad(ctx, th, cx - r, cx + r);
    ctx.fill();
    ctx.save();
    sidePath(ctx, cx, cy + h, cy, r, ry); ctx.clip();
    // Fine machined grooves.
    ctx.strokeStyle = th.light ? "rgba(0,0,0,0.06)" : "rgba(0,0,0,0.35)"; ctx.lineWidth = Math.max(1, u);
    for (let k = 1; k < 5; k++) { ctx.beginPath(); ctx.ellipse(cx, cy + h * (0.12 + k * 0.08), r, ry, 0, 0, Math.PI); ctx.stroke(); }
    ctx.globalCompositeOperation = th.add;
    ctx.beginPath(); ctx.ellipse(cx, cy + h * 0.72, r, ry, 0, 0, Math.PI);
    ctx.lineWidth = Math.max(2, h * 0.07); ctx.strokeStyle = rgba(th.acc, 0.9 * lit);
    ctx.shadowColor = rgba(th.acc, lit); ctx.shadowBlur = 18 * u; ctx.stroke();
    ctx.shadowBlur = 0;
    sweep(ctx, th, cx - r, cy - ry, r * 2, h + ry * 2, t, 3.6, 0.6, 1);
    ctx.restore();
    // Top face, drawn in circle space.
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(1, ry / r);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
    let g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, 0, 0, 0, r);
    g.addColorStop(0, rgba(mix(th.glass, WHITE, th.light ? 0.6 : 0.1))); g.addColorStop(1, rgba(th.glass));
    ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, r - 3 * u, 0, TAU);
    ctx.lineWidth = 5 * u; ctx.strokeStyle = metalGrad(ctx, th, -r, r); ctx.stroke();
    // LED ring segments; a bright comet runs round once lit.
    const N = 44, rr0 = r * 0.8, comet = fract(t * 0.42) * N;
    ctx.lineCap = "butt"; ctx.lineWidth = r * 0.075;
    for (let k = 0; k < N; k++) {
      const a0 = -Math.PI / 2 + (k / N) * TAU, a1 = a0 + (TAU / N) * 0.68;
      const on = clamp(ring * N - k);
      ctx.beginPath(); ctx.arc(0, 0, rr0, a0, a1);
      ctx.strokeStyle = th.light ? rgba(th.ink, 0.1) : "rgba(255,255,255,0.06)"; ctx.stroke();
      if (on <= 0) continue;
      let dk = Math.abs(k - comet); dk = Math.min(dk, N - dk);
      const b = on * (0.55 + 0.45 * Math.exp(-(dk * dk) / 10)) * (0.35 + 0.65 * lit);
      const c = mix(th.acc, th.acc2, k / N);
      ctx.save(); ctx.globalCompositeOperation = th.add;
      ctx.strokeStyle = rgba(mix(c, WHITE, 0.2 * b), b); ctx.shadowColor = rgba(c, b); ctx.shadowBlur = 16 * u;
      ctx.stroke(); ctx.restore();
    }
    // Knurled dial that turns slowly.
    const spin = t * 0.35;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.56, 0, TAU);
    g = ctx.createLinearGradient(Math.cos(spin) * -r * 0.56, Math.sin(spin) * -r * 0.56, Math.cos(spin) * r * 0.56, Math.sin(spin) * r * 0.56);
    g.addColorStop(0, rgba(th.metalLit)); g.addColorStop(0.45, rgba(th.metalDark)); g.addColorStop(0.75, rgba(mix(th.metalDark, th.metalLit, 0.6))); g.addColorStop(1, rgba(th.metalDark));
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = th.light ? "rgba(0,0,0,0.18)" : "rgba(0,0,0,0.5)"; ctx.lineWidth = Math.max(1, 1.4 * u);
    ctx.beginPath();
    for (let k = 0; k < 96; k++) { const a = spin + (k / 96) * TAU; ctx.moveTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5); ctx.lineTo(Math.cos(a) * r * 0.56, Math.sin(a) * r * 0.56); }
    ctx.stroke();
    // Centre cap with a turning indicator and a play mark.
    ctx.beginPath(); ctx.arc(0, 0, r * 0.4, 0, TAU);
    g = ctx.createRadialGradient(-r * 0.12, -r * 0.16, 0, 0, 0, r * 0.4);
    g.addColorStop(0, rgba(mix(th.glass, WHITE, th.light ? 0.7 : 0.16))); g.addColorStop(1, rgba(th.glass));
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = th.add;
    ctx.beginPath(); ctx.arc(Math.cos(spin * 2.2 - 1) * r * 0.31, Math.sin(spin * 2.2 - 1) * r * 0.31, r * 0.03, 0, TAU);
    ctx.fillStyle = rgba(th.acc2, 0.5 + 0.5 * lit); ctx.shadowColor = rgba(th.acc2); ctx.shadowBlur = 12 * u; ctx.fill();
    const tr = r * 0.13;
    ctx.beginPath(); ctx.moveTo(-tr * 0.6, -tr); ctx.lineTo(tr * 1.0, 0); ctx.lineTo(-tr * 0.6, tr); ctx.closePath();
    ctx.fillStyle = rgba(mix(th.acc, WHITE, 0.3), 0.25 + 0.75 * lit); ctx.shadowColor = rgba(th.acc); ctx.shadowBlur = 20 * u * lit; ctx.fill();
    ctx.restore();
    // Gloss and the specular sweep across the face.
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip();
    g = ctx.createRadialGradient(-r * 0.4, -r * 0.55, 0, -r * 0.4, -r * 0.55, r * 0.8);
    g.addColorStop(0, `rgba(255,255,255,${th.light ? 0.4 : 0.1})`); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(-r, -r, r * 2, r * 2);
    sweep(ctx, th, -r, -r, r * 2, r * 2, t, 3.6, 0.45, 0.7);
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(cx, cy, r, ry, 0, 0.08, Math.PI - 0.08);
    ctx.lineWidth = Math.max(1, 1.6 * u); ctx.strokeStyle = th.hi(0.6); ctx.stroke();
  }

  // Orbit rings on the floor around a hero, with glints travelling along them.
  function floorRings(ctx, S, th, cx, cy, r, t, a) {
    const u = S.u;
    ctx.save();
    ctx.globalCompositeOperation = th.add;
    [1.3, 1.62, 2.0].forEach((k, i) => {
      const rx = r * k, ry = rx * 0.2, dir = i % 2 ? -1 : 1;
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
      ctx.lineWidth = Math.max(1, 1.3 * u); ctx.strokeStyle = th.light ? rgba(th.ink, 0.1 * a) : rgba(WHITE, 0.07 * a); ctx.stroke();
      for (let s = 0; s < 3; s++) {
        const a0 = dir * t * (0.5 - i * 0.1) + (s * TAU) / 3 + i;
        ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, a0, a0 + 0.55);
        ctx.lineWidth = 2.4 * u; ctx.strokeStyle = rgba(i === 1 ? th.acc2 : th.acc, 0.55 * a); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx + Math.cos(a0 + 0.55) * rx, cy + Math.sin(a0 + 0.55) * ry, 3.5 * u, 0, TAU);
        ctx.fillStyle = rgba(mix(th.acc, WHITE, 0.6), 0.9 * a); ctx.fill();
      }
    });
    ctx.restore();
  }

  // ---- title and closing ---------------------------------------------------------------------------
  // The title shows the puck hero head-on. The closing never repeats that shot: it either opens the puck
  // into an exploded stack seen from above, or lifts its light ring into a giant halo over a small puck
  // seen from a low camera. The closing words pick which, so neighbouring films differ.
  function closingKind() {
    const s = String(ctl().closing || "");
    let h = 0;
    for (let i = 0; i < s.length; i++) h += s.charCodeAt(i);
    return h % 2 ? "halo" : "exploded";
  }
  function statement(ctx, S, th, info) {
    const { W, H, u } = S, t = info.t, local = info.local;
    const cam = shot(S, info, roleOf(info));
    if (cam.skip) return;
    const tb = headBottom(S, info.scene);
    const top = tb + 40 * u, bottom = H * (S.tall ? 0.86 : 0.93);
    ctx.save();
    frame(ctx, S, cam);
    if (info.scene === "closing") {
      if (closingKind() === "halo") haloStage(ctx, S, th, info, top, bottom);
      else explodedStage(ctx, S, th, info, top, bottom);
      ctx.restore();
      return;
    }
    const r = clamp((bottom - top) / 1.12, 110 * u, S.tall ? W * 0.4 : W * 0.25);
    const contact = Math.min(bottom, top + r * 1.08 + Math.max(0, bottom - top - r * 1.08) * 0.6);
    const rise = eo(local / 1.1);
    const lift = (1 - rise) * 80 * u;
    const gap = r * 0.12 + Math.sin(t * 1.25) * 7 * u;
    const cx = W / 2, cy = contact - gap - 0.6 * r + lift;
    const lit = seg(local, 0.1, 0.9);
    const ring = eio(seg(local, 0.2, Math.max(1, info.hold * 0.72)));
    // Light rays fanning out from behind the hero.
    if (!th.light) {
      const a = 0.05 * lit;
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (let k = 0; k < 16; k++) {
        const ang = (k / 16) * TAU + t * 0.08, w = 0.05 + 0.03 * Math.sin(k * 1.7);
        const len = W * 0.7;
        const g = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, len);
        g.addColorStop(0, rgba(mix(th.acc, WHITE, 0.4), a)); g.addColorStop(1, rgba(th.acc, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, len, ang - w, ang + w); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    floorRings(ctx, S, th, cx, contact, r, t, 0.35 + 0.65 * lit);
    pool(ctx, th, cx, contact, r * 1.8, r * 0.3, th.acc, 0.3 * lit);
    // Ripples spread across the floor once the ring is lit.
    if (ring > 0.6) {
      ctx.save(); ctx.globalCompositeOperation = th.add;
      for (let k = 0; k < 2; k++) {
        const ph = fract(t / 1.6 + k * 0.5), rx = r * (1.05 + ph * 1.8);
        ctx.beginPath(); ctx.ellipse(cx, contact, rx, rx * 0.2, 0, 0, TAU);
        ctx.lineWidth = 2.5 * u; ctx.strokeStyle = rgba(th.acc, 0.4 * (1 - ph) * seg(ring, 0.6, 1)); ctx.stroke();
      }
      ctx.restore();
    }
    shadow(ctx, th, cx, contact, r * 1.05, r * 0.16, 1 - clamp(gap / (r * 0.4)) * 0.4);
    const P = (g) => puck(g, S, th, cx, cy, r, t, { lit, ring });
    reflect(ctx, S, th, contact, P);
    P(ctx);
    ctx.restore();
  }

  // LED segments round an ellipse, a comet running round; `part` limits them to the back or front half.
  function ledRing(ctx, S, th, cx, cy, rx, ry, t, on, o = {}) {
    const u = S.u, N = o.n || 44, comet = fract(t * (o.speed || 0.42)) * N, lw = o.width || rx * 0.075;
    ctx.save();
    ctx.lineCap = "butt";
    for (let k = 0; k < N; k++) {
      const a0 = -Math.PI / 2 + (k / N) * TAU + (o.spin || 0), a1 = a0 + (TAU / N) * 0.68, am = (a0 + a1) / 2;
      const front = Math.sin(am) > 0;
      if (o.part === "back" && front) continue;
      if (o.part === "front" && !front) continue;
      const lit = clamp(on * N - k);
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, a0, a1);
      ctx.lineWidth = lw * (o.part ? (front ? 1.15 : 0.75) : 1);
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = th.light ? rgba(th.ink, 0.1) : "rgba(255,255,255,0.06)"; ctx.stroke();
      if (lit <= 0) continue;
      let dk = Math.abs(k - comet); dk = Math.min(dk, N - dk);
      let dk2 = Math.abs(k - fract(comet / N + 0.5) * N); dk2 = Math.min(dk2, N - dk2);
      const b = lit * (0.5 + 0.5 * Math.exp(-(dk * dk) / 10) + (o.twin ? 0.4 * Math.exp(-(dk2 * dk2) / 10) : 0)) * (o.part === "back" ? 0.65 : 1);
      const c = mix(th.acc, th.acc2, (k / N + (o.hue || 0)) % 1);
      ctx.globalCompositeOperation = th.add;
      ctx.strokeStyle = rgba(mix(c, WHITE, 0.2 * b), clamp(b)); ctx.shadowColor = rgba(c, clamp(b)); ctx.shadowBlur = 16 * u;
      ctx.stroke(); ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  // Closing A: the puck opened into an exploded stack, seen from above, breathing apart and together.
  function explodedStage(ctx, S, th, info, top, bottom) {
    const { W, u } = S, t = info.t, local = info.local;
    const tilt = 0.5;
    const r = clamp((bottom - top) / 2.6, 100 * u, S.tall ? W * 0.36 : W * 0.21);
    const cx = W / 2, contact = bottom - r * tilt;
    const open = eio(seg(local, -0.4, 1.0));
    const sep = r * (0.14 + 0.28 * open + 0.07 * Math.sin(t * 1.6) * open);
    const bodyH = r * 0.24;
    const y0 = contact - bodyH, y1 = y0 - sep, y2 = y1 - sep, y3 = y2 - sep * 0.9;
    const spin = t * 0.45;
    floorRings(ctx, S, th, cx, contact, r * 1.1, t, 1);
    pool(ctx, th, cx, contact, r * 2, r * 0.4, th.acc, 0.32);
    shadow(ctx, th, cx, contact, r * 1.1, r * tilt * 0.6);
    const body = (g) => cylinder(g, S, th, cx, contact, r, bodyH, { tilt, band: 0.9, t, ring: 0.5, period: 3.6 });
    reflect(ctx, S, th, contact, body);
    body(ctx);
    // A light column rising through the stack, bright pulses travelling up it.
    ctx.save(); ctx.globalCompositeOperation = th.add;
    const cTop = y3 - r * 0.9, cw = r * 0.14;
    let g = ctx.createLinearGradient(cx - cw, 0, cx + cw, 0);
    g.addColorStop(0, rgba(th.acc, 0)); g.addColorStop(0.5, rgba(mix(th.acc, WHITE, 0.5), 0.35 * open)); g.addColorStop(1, rgba(th.acc, 0));
    ctx.fillStyle = g; ctx.fillRect(cx - cw, cTop, cw * 2, y0 - cTop);
    for (let k = 0; k < 3; k++) {
      const f = fract(t * 0.6 + k / 3), y = y0 - f * (y0 - cTop);
      const rg = ctx.createRadialGradient(cx, y, 0, cx, y, cw * 1.6);
      rg.addColorStop(0, rgba(WHITE, 0.6 * Math.sin(Math.PI * f) * open)); rg.addColorStop(1, rgba(th.acc, 0));
      ctx.fillStyle = rg; ctx.fillRect(cx - cw * 1.6, y - cw * 1.6, cw * 3.2, cw * 3.2);
    }
    // Exploded-view guides between the layers, with ticks running along them.
    ctx.setLineDash([6 * u, 8 * u]); ctx.lineWidth = 1.6 * u; ctx.strokeStyle = th.hi(0.3 * open);
    ctx.beginPath();
    [[r * 0.98, y0, y1], [r * 0.6, y1, y2], [r * 0.4, y2, y3]].forEach(([dx, a, b]) => { ctx.moveTo(cx - dx, a); ctx.lineTo(cx - dx, b); ctx.moveTo(cx + dx, a); ctx.lineTo(cx + dx, b); });
    ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    // Ring plate: a glass disc carrying the LED ring.
    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, y1 + 7 * u, r, r * tilt, 0, 0, TAU); ctx.fillStyle = rgba(mix(th.metalDark, th.metalLit, 0.35), 0.9); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, y1, r, r * tilt, 0, 0, TAU);
    g = ctx.createRadialGradient(cx - r * 0.3, y1 - r * tilt * 0.4, 0, cx, y1, r);
    g.addColorStop(0, rgba(mix(th.glass, WHITE, th.light ? 0.6 : 0.14), 0.92)); g.addColorStop(1, rgba(th.glass, 0.92));
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 3 * u; ctx.strokeStyle = metalGrad(ctx, th, cx - r, cx + r); ctx.stroke();
    ctx.restore();
    ledRing(ctx, S, th, cx, y1, r * 0.8, r * 0.8 * tilt, t, open, { width: r * 0.075, twin: true });
    // Dial and cap.
    cylinder(ctx, S, th, cx, y2 + r * 0.08, r * 0.6, r * 0.08, { tilt, t, offset: 0.9 });
    ctx.save(); ctx.translate(cx, y2); ctx.scale(1, tilt);
    ctx.strokeStyle = th.light ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.55)"; ctx.lineWidth = Math.max(1, 1.4 * u);
    ctx.beginPath();
    for (let k = 0; k < 90; k++) { const a = spin + (k / 90) * TAU; ctx.moveTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5); ctx.lineTo(Math.cos(a) * r * 0.58, Math.sin(a) * r * 0.58); }
    ctx.stroke();
    ctx.globalCompositeOperation = th.add;
    ctx.beginPath(); ctx.arc(Math.cos(spin * 2) * r * 0.42, Math.sin(spin * 2) * r * 0.42, r * 0.035, 0, TAU);
    ctx.fillStyle = rgba(th.acc2); ctx.shadowColor = rgba(th.acc2); ctx.shadowBlur = 14 * u; ctx.fill();
    ctx.restore();
    cylinder(ctx, S, th, cx, y3 + r * 0.06, r * 0.4, r * 0.06, { tilt, ring: 0.85, t, offset: 1.7 });
    ctx.save(); ctx.translate(cx, y3); ctx.scale(1, tilt); ctx.globalCompositeOperation = th.add;
    const tr = r * 0.13;
    ctx.beginPath(); ctx.moveTo(-tr * 0.6, -tr); ctx.lineTo(tr, 0); ctx.lineTo(-tr * 0.6, tr); ctx.closePath();
    ctx.fillStyle = rgba(mix(th.acc, WHITE, 0.3)); ctx.shadowColor = rgba(th.acc); ctx.shadowBlur = 22 * u; ctx.fill();
    ctx.restore();
    // Glints orbiting the stack.
    ctx.save(); ctx.globalCompositeOperation = th.add;
    for (let k = 0; k < 8; k++) {
      const a = t * 0.7 + (k / 8) * TAU, y = y1 - sep * 0.5 + Math.sin(k * 2.3) * sep;
      const x = cx + Math.cos(a) * r * 1.35, yy = y + Math.sin(a) * r * 1.35 * tilt;
      const near = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(a));
      ctx.beginPath(); ctx.arc(x, yy, (2 + 2.5 * near) * u, 0, TAU);
      ctx.fillStyle = rgba(mix(th.acc, WHITE, 0.6), 0.8 * near * open); ctx.fill();
    }
    ctx.restore();
  }

  // Closing B: the light ring lifted off into a giant halo over a small puck, from a low camera.
  function haloStage(ctx, S, th, info, top, bottom) {
    const { W, u } = S, t = info.t, local = info.local;
    const on = eio(seg(local, -0.4, 1.1));
    const contact = bottom - 16 * u;
    const pr = clamp((bottom - top) * 0.36, 80 * u, S.tall ? W * 0.24 : W * 0.14);
    const cx = W / 2;
    const RX = Math.min(W * (S.tall ? 0.44 : 0.36), (bottom - top) * 1.7);
    const rx = pr * 0.8 + (RX - pr * 0.8) * on, ry = rx * 0.2;
    const hyT = top + (contact - top) * 0.36;
    const hy = contact - pr * 0.4 + (hyT - (contact - pr * 0.4)) * on + Math.sin(t * 0.9) * 8 * u;
    const spin = t * 0.25;
    // A light curtain falls from the halo to its footprint on the floor.
    ctx.save(); ctx.globalCompositeOperation = th.add;
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * TAU + spin * 0.5, x = cx + Math.cos(a) * rx, y = hy + Math.sin(a) * ry, fy = contact + Math.sin(a) * ry * 0.7;
      const al = (0.08 + 0.07 * Math.sin(t * 2.2 + k * 1.3)) * on * (th.light ? 0.6 : 1);
      const lg = ctx.createLinearGradient(0, y, 0, fy);
      lg.addColorStop(0, rgba(mix(th.acc, WHITE, 0.4), al)); lg.addColorStop(1, rgba(th.acc, 0));
      ctx.strokeStyle = lg; ctx.lineWidth = 3 * u;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(cx + Math.cos(a) * rx * 1.02, fy); ctx.stroke();
    }
    ctx.beginPath(); ctx.ellipse(cx, contact, rx * 1.02, ry * 0.7, 0, 0, TAU);
    ctx.lineWidth = 3 * u; ctx.strokeStyle = rgba(th.acc, 0.35 * on); ctx.shadowColor = rgba(th.acc); ctx.shadowBlur = 18 * u; ctx.stroke();
    ctx.restore();
    pool(ctx, th, cx, contact, rx * 1.1, ry * 1.1, th.acc, 0.22 * on);
    // Back half of the halo, its metal carrier, the puck, then the front half.
    const carrier = (g, part) => {
      g.save(); g.beginPath(); g.ellipse(cx, hy + 8 * u, rx * 1.04, ry * 1.04, 0, part === "back" ? Math.PI : 0, part === "back" ? TAU : Math.PI);
      g.lineWidth = 10 * u; g.strokeStyle = metalGrad(g, th, cx - rx, cx + rx); g.stroke(); g.restore();
    };
    carrier(ctx, "back");
    // A lens of light spans the halo: a soft membrane with slow spokes and rings rippling outward.
    ctx.save(); ctx.globalCompositeOperation = th.add;
    ctx.beginPath(); ctx.ellipse(cx, hy, rx, ry, 0, 0, TAU); ctx.clip();
    ctx.translate(cx, hy); ctx.scale(1, ry / rx);
    const mg = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    mg.addColorStop(0, rgba(mix(th.acc, WHITE, 0.5), 0.2 * on)); mg.addColorStop(0.6, rgba(th.acc, 0.06 * on)); mg.addColorStop(1, rgba(th.acc2, 0.14 * on));
    ctx.fillStyle = mg; ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
    ctx.lineWidth = 4 * u;
    for (let k = 0; k < 28; k++) { const a = (k / 28) * TAU + spin * 0.8; ctx.beginPath(); ctx.moveTo(Math.cos(a) * rx * 0.12, Math.sin(a) * rx * 0.12); ctx.lineTo(Math.cos(a) * rx, Math.sin(a) * rx); ctx.strokeStyle = rgba(th.acc, (0.05 + 0.05 * Math.sin(k * 2.1 + t * 1.5)) * on); ctx.stroke(); }
    for (let k = 0; k < 3; k++) { const f = fract(t * 0.4 + k / 3); ctx.beginPath(); ctx.arc(0, 0, rx * f, 0, TAU); ctx.strokeStyle = rgba(mix(th.acc, WHITE, 0.3), 0.25 * Math.sin(Math.PI * f) * on); ctx.stroke(); }
    ctx.restore();
    ledRing(ctx, S, th, cx, hy, rx, ry, t, on, { n: 96, width: 14 * u, part: "back", spin, speed: 0.3, twin: true });
    ledRing(ctx, S, th, cx, hy - 10 * u, rx * 0.84, ry * 0.84, t, on, { n: 72, width: 6 * u, part: "back", spin: -spin * 1.6, speed: -0.45, hue: 0.5 });
    const gap = pr * 0.1 + Math.sin(t * 1.2) * 5 * u, cy = contact - pr * 0.3 - gap;
    shadow(ctx, th, cx, contact, pr * 1.1, pr * 0.14);
    const P = (g) => puck(g, S, th, cx, cy, pr, t, { tilt: 0.2, lit: 1, ring: 1 - 0.6 * on });
    reflect(ctx, S, th, contact, P);
    P(ctx);
    // The beam linking the puck to the halo.
    ctx.save(); ctx.globalCompositeOperation = th.add;
    const bw = pr * 0.5, bg = ctx.createLinearGradient(cx - bw, 0, cx + bw, 0);
    bg.addColorStop(0, rgba(th.acc, 0)); bg.addColorStop(0.5, rgba(mix(th.acc, WHITE, 0.4), 0.22 * on)); bg.addColorStop(1, rgba(th.acc, 0));
    ctx.fillStyle = bg; ctx.fillRect(cx - bw, hy, bw * 2, cy - hy);
    ctx.restore();
    carrier(ctx, "front");
    ledRing(ctx, S, th, cx, hy, rx, ry, t, on, { n: 96, width: 14 * u, part: "front", spin, speed: 0.3, twin: true });
    ledRing(ctx, S, th, cx, hy - 10 * u, rx * 0.84, ry * 0.84, t, on, { n: 72, width: 6 * u, part: "front", spin: -spin * 1.6, speed: -0.45, hue: 0.5 });
    // Specular glint racing round the front of the halo.
    ctx.save(); ctx.globalCompositeOperation = th.add;
    const ga = fract(t * 0.35) * Math.PI;
    const gx = cx + Math.cos(ga) * rx, gy = hy + Math.sin(ga) * ry;
    const rg = ctx.createRadialGradient(gx, gy, 0, gx, gy, 60 * u);
    rg.addColorStop(0, rgba(WHITE, 0.8 * on)); rg.addColorStop(1, rgba(WHITE, 0));
    ctx.fillStyle = rg; ctx.fillRect(gx - 60 * u, gy - 60 * u, 120 * u, 120 * u);
    ctx.restore();
  }

  // ---- shared transition wrapper -------------------------------------------------------------------
  const DATA = {};
  function wrap(fn, id) {
    return (ctx, S, box, p, d, info) => {
      const th = theme(S);
      if (!info.pre) DATA[id] = d;
      const leaving = info.exit !== undefined;
      const cam = shot(S, info, roleOf(info));
      if (!cam.skip) {
        const A = area(S, box, id);
        // Objects stand on the stage as the blade reveals them; their builds run across most of the hold.
        const dur = Math.max(1.2, info.hold - info.change - 0.3);
        const build = leaving ? 1 : clamp((info.local + info.change * 0.6) / dur);
        ctx.save();
        frame(ctx, S, cam);
        fn(ctx, S, th, A, build, d, info.t, info.local, info);
        ctx.restore();
      }
      if (!info.pre && (!leaving || isStatement(CUR.scene))) fore(ctx, S, th);
    };
  }
  // What a scene shows, for drawing it ahead of its start (the template hands drawers the same).
  function dataOf(id) {
    if (DATA[id]) return DATA[id];
    const c = ctl();
    if (id === "chart") return { labels: [c.bar_1_label, c.bar_2_label, c.bar_3_label, c.bar_4_label], values: [c.bar_1, c.bar_2, c.bar_3, c.bar_4].map((v) => Number(v) || 0), suffix: c.chart_suffix, prefix: "", highlight: Number(c.highlight) - 1 };
    if (id === "object") return { kind: c.device, callouts: [c.callout_1, c.callout_2, c.callout_3] };
    if (id === "people") return { count: c.people_count ?? 4, badges: [c.badge_1, c.badge_2, c.badge_3], highlight: 1 };
    if (id === "process") return { steps: [c.step_1, c.step_2, c.step_3] };
    return { left: c.before_label, leftValue: Number(c.before_value) || 0, right: c.after_label, rightValue: Number(c.after_value) || 0, suffix: c.compare_suffix, prefix: "" };
  }
  function boxOf(S) {
    const side = (S.tall ? 90 : 140) * S.u;
    return S.tall ? { x: side, y: S.H * 0.3, w: S.W - side * 2, h: S.H * 0.6 } : { x: side, y: S.H * 0.34, w: S.W - side * 2, h: S.H * 0.58 };
  }

  // ---- chart: glass tubes filling with liquid light ----------------------------------------------
  function tube(ctx, S, th, cx, base, r, h, level, col, t, seed, hot, boost = 0) {
    const u = S.u, ry = r * 0.27, top = base - h, lv = base - h * clamp(level);
    sidePath(ctx, cx, base, top, r, ry);
    ctx.fillStyle = th.light ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.035)"; ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, top, r, ry, 0, Math.PI, TAU);
    ctx.lineWidth = Math.max(1, 1.5 * u); ctx.strokeStyle = th.hi(0.2); ctx.stroke();
    if (level > 0.003) {
      ctx.save();
      ctx.globalCompositeOperation = th.add;
      sidePath(ctx, cx, base, lv, r * 0.96, ry * 0.96);
      const g = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
      g.addColorStop(0, rgba(col, 0.3)); g.addColorStop(0.3, rgba(mix(col, WHITE, 0.3), 0.9)); g.addColorStop(0.6, rgba(col, 0.7)); g.addColorStop(1, rgba(col, 0.25));
      ctx.fillStyle = g; ctx.fill();
      // Bubbles rising through the light.
      const R = rng(seed * 977 + 5);
      for (let k = 0; k < 16; k++) {
        const bx = cx + (R() * 2 - 1) * r * 0.7, sp = 0.25 + R() * 0.45, ph = R(), sz = (1.6 + R() * 3.2) * u;
        const y = base - fract(t * sp + ph) * (base - lv);
        if (y < lv + ry || y > base) continue;
        ctx.beginPath(); ctx.arc(bx + Math.sin(t * 3 + k) * 3 * u, y, sz, 0, TAU);
        ctx.fillStyle = rgba(mix(col, WHITE, 0.7), 0.55); ctx.fill();
      }
      if (boost > 0.02) { // The scanner's sheen running up through the liquid.
        sidePath(ctx, cx, base, lv, r * 0.96, ry * 0.96);
        const sg = ctx.createLinearGradient(0, base, 0, lv);
        const f = fract(t * 1.3 + seed * 0.3);
        sg.addColorStop(0, rgba(WHITE, 0)); sg.addColorStop(clamp(f - 0.15), rgba(WHITE, 0)); sg.addColorStop(f, rgba(WHITE, 0.45 * boost)); sg.addColorStop(clamp(f + 0.15), rgba(WHITE, 0)); sg.addColorStop(1, rgba(WHITE, 0));
        ctx.fillStyle = sg; ctx.fill();
        ctx.fillStyle = rgba(mix(col, WHITE, 0.4), 0.25 * boost); ctx.fill();
      }
      ctx.beginPath(); ctx.ellipse(cx, lv, r * 0.96, ry * 0.96, 0, 0, TAU);
      ctx.fillStyle = rgba(mix(col, WHITE, 0.5), 0.92); ctx.fill();
      const gl = ctx.createRadialGradient(cx, lv, 0, cx, lv, r * 2.6);
      gl.addColorStop(0, rgba(col, (hot ? 0.45 : 0.16) + 0.25 * boost)); gl.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = gl; ctx.fillRect(cx - r * 2.6, lv - r * 2.6, r * 5.2, r * 5.2);
      ctx.restore();
    }
    // Glass edges and highlights.
    const hg = ctx.createLinearGradient(0, top, 0, base);
    hg.addColorStop(0, th.hi(0.45)); hg.addColorStop(1, th.hi(0.06));
    ctx.fillStyle = hg; rr(ctx, cx - r * 0.76, top + ry * 0.6, r * 0.09, h - ry * 0.6, r * 0.045); ctx.fill();
    ctx.fillStyle = th.hi(0.12); ctx.fillRect(cx + r * 0.84, top, Math.max(1, 1.5 * u), h);
    ctx.beginPath(); ctx.moveTo(cx - r, top); ctx.lineTo(cx - r, base); ctx.moveTo(cx + r, top); ctx.lineTo(cx + r, base);
    ctx.lineWidth = Math.max(1, 1.4 * u); ctx.strokeStyle = th.hi(0.16); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, top, r, ry, 0, 0, Math.PI);
    ctx.lineWidth = Math.max(1, 2 * u); ctx.strokeStyle = th.hi(0.4); ctx.stroke();
    ctx.save(); sidePath(ctx, cx, base, top, r, ry); ctx.clip(); sweep(ctx, th, cx - r, top - ry, r * 2, h + ry * 2, t, 3.2, seed * 0.22, 0.8); ctx.restore();
  }
  function chartScene(ctx, S, th, A, p, d, t) {
    const u = S.u, n = d.values.length, max = Math.max(...d.values.map((v) => Math.abs(v)), 1);
    const slot = A.w / n;
    const r = Math.min(slot * 0.25, (S.tall ? 92 : 104) * u);
    const baseH = 24 * u, floor = A.floor;
    const tubeH = Math.max(150 * u, floor - baseH - A.y - (S.tall ? 170 : 150) * u);
    const xs = (i) => A.x + slot * (i + 0.5);
    const cool = th.light ? mix(th.ink, th.muted, 0.6) : mix(mix(th.acc, WHITE, 0.6), [170, 178, 196], 0.6);
    const level = (i) => clamp((Math.abs(d.values[i]) / max) * stagger(p, i, n, 0.45) + Math.sin(t * 2.2 + i) * 0.006 * stagger(p, i, n, 0.45));
    // A scanner of light sweeps across the tubes again and again; each tube flares as it passes.
    const scanX = A.x - slot * 0.5 + fract(t / 2.2) * (A.w + slot);
    const boost = (i) => Math.exp(-Math.pow((xs(i) - scanX) / (slot * 0.38), 2)) * (0.4 + 0.6 * clamp(p * 1.5));
    if (!th.light) {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const sg = ctx.createLinearGradient(scanX - slot * 0.5, 0, scanX + slot * 0.5, 0);
      sg.addColorStop(0, rgba(th.acc2, 0)); sg.addColorStop(0.5, rgba(mix(th.acc2, WHITE, 0.4), 0.1)); sg.addColorStop(1, rgba(th.acc2, 0));
      ctx.fillStyle = sg; ctx.fillRect(scanX - slot * 0.5, A.y - 60 * u, slot, floor - A.y + 60 * u);
      ctx.fillStyle = rgba(mix(th.acc2, WHITE, 0.5), 0.35); ctx.fillRect(scanX - 1.5 * u, A.y - 60 * u, 3 * u, floor - A.y + 60 * u);
      ctx.restore();
      pool(ctx, th, scanX, floor, slot * 0.6, r * 0.3, th.acc2, 0.25);
    }
    d.values.forEach((_, i) => { const hot = i === d.highlight; pool(ctx, th, xs(i), floor, r * (hot ? 3.4 : 2.2), r * (hot ? 0.6 : 0.4), hot ? th.acc : cool, (hot ? 0.32 : 0.1) * (0.4 + 0.6 * level(i))); });
    const solid = (g) => {
      d.values.forEach((_, i) => {
        const hot = i === d.highlight;
        shadow(g, th, xs(i), floor, r * 1.5, r * 0.3);
        cylinder(g, S, th, xs(i), floor, r * 1.28, baseH, { ring: hot ? 0.9 : 0.25, ringColor: hot ? th.acc : cool });
        tube(g, S, th, xs(i), floor - baseH, r, tubeH, level(i), hot ? th.acc : cool, t, i + 1, hot, boost(i));
      });
    };
    reflect(ctx, S, th, floor, solid);
    solid(ctx);
    d.values.forEach((value, i) => {
      const hot = i === d.highlight, q = stagger(p, i, n, 0.45);
      const ny = floor - baseH - tubeH - r * 0.27 - 26 * u;
      const s = fmt(value * q, d.prefix, d.suffix);
      const size = fitSize(ctx, S, s, hot ? 116 * u : 64 * u, slot * 0.96, hot ? 72 * u : 44 * u, 700, "figures");
      const b = boost(i);
      figureText(ctx, S, th, s, xs(i), ny - b * 8 * u, size, hot);
      if (hot && p > 0.9) { // A ping rises off the winning tube's surface.
        ctx.save(); ctx.globalCompositeOperation = th.add;
        const f = fract(t / 1.3), lv = floor - baseH - tubeH * level(i);
        ctx.beginPath(); ctx.ellipse(xs(i), lv - f * 40 * u, r * (1 + f * 1.4), r * 0.27 * (1 + f * 1.4), 0, 0, TAU);
        ctx.lineWidth = 2.5 * u; ctx.strokeStyle = rgba(th.acc, (1 - f) * 0.8); ctx.stroke(); ctx.restore();
      }
      label(ctx, S, th, d.labels[i] || "", xs(i), floor + r * 0.36 + 58 * u, slot * 0.92, { color: rgba(th.ink, hot ? 1 : 0.72 + 0.28 * b), size: 44 });
    });
  }

  // ---- object: a device rendered as a product, its screen running a live editor --------------------
  // The screen is a lit panel: toolbar, a playing preview with the proposed change outlined, a card
  // whose dial a cursor is dragging, and a timeline whose proposed clip glows. Scanlines, an inner
  // vignette and glass reflections of the stage give it depth.
  function screenUI(ctx, S, th, x, y, w, h, t, p, tallForm) {
    const u = S.u, pad = Math.max(6 * u, w * 0.025), L = th.light;
    const soft = (a) => (L ? rgba(th.ink, a) : `rgba(255,255,255,${a})`);
    let g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, rgba(mix(th.screen, th.acc, L ? 0.03 : 0.08))); g.addColorStop(1, rgba(th.screen));
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    // Toolbar.
    const tb = Math.max(14 * u, h * 0.065);
    ctx.fillStyle = L ? rgba(th.ink, 0.05) : "rgba(255,255,255,0.04)"; ctx.fillRect(x, y, w, tb);
    ctx.fillStyle = soft(0.08); ctx.fillRect(x, y + tb, w, Math.max(1, u));
    for (let k = 0; k < 3; k++) { ctx.fillStyle = soft(k === 0 ? 0.3 : 0.14); rr(ctx, x + pad + k * w * 0.07, y + tb * 0.3, w * 0.055, tb * 0.4, tb * 0.2); ctx.fill(); }
    ctx.fillStyle = soft(0.1); rr(ctx, x + w * 0.42, y + tb * 0.22, w * 0.16, tb * 0.56, tb * 0.28); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w * 0.435, y + tb / 2, tb * 0.13, 0, TAU); ctx.fillStyle = rgba(th.acc, 0.6 + 0.4 * Math.sin(t * 4)); ctx.fill();
    ctx.fillStyle = soft(0.3); rr(ctx, x + w * 0.45, y + tb * 0.42, w * 0.1, tb * 0.16, tb * 0.08); ctx.fill();
    ctx.fillStyle = rgba(th.acc, 0.85); rr(ctx, x + w - pad - w * 0.08, y + tb * 0.25, w * 0.08, tb * 0.5, tb * 0.25); ctx.fill();
    const y0 = y + tb + pad;
    const pv = tallForm ? { x: x + pad, y: y0 + h * 0.02, w: w - pad * 2, h: h * 0.28 } : { x: x + pad, y: y0, w: w * 0.58, h: h * 0.5 };
    // Preview: dawn over layered hills, clouds drifting, the proposed change outlined.
    ctx.save(); rr(ctx, pv.x, pv.y, pv.w, pv.h, 6 * u); ctx.clip();
    g = ctx.createLinearGradient(0, pv.y, 0, pv.y + pv.h);
    g.addColorStop(0, rgba(mix(th.acc2, BLACK, 0.55))); g.addColorStop(0.6, rgba(mix(th.acc, WHITE, 0.3))); g.addColorStop(1, rgba(mix(th.acc, BLACK, 0.2)));
    ctx.fillStyle = g; ctx.fillRect(pv.x, pv.y, pv.w, pv.h);
    const sunX = pv.x + pv.w * 0.62, sunY = pv.y + pv.h * (0.66 - 0.16 * (0.5 + 0.5 * Math.sin(t * 0.6)));
    let sg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, pv.h * 0.6);
    sg.addColorStop(0, "rgba(255,240,210,0.55)"); sg.addColorStop(1, "rgba(255,240,210,0)");
    ctx.fillStyle = sg; ctx.fillRect(pv.x, pv.y, pv.w, pv.h);
    ctx.beginPath(); ctx.arc(sunX, sunY, pv.h * 0.13, 0, TAU); ctx.fillStyle = "rgba(255,248,226,0.97)"; ctx.fill();
    for (let k = 0; k < 4; k++) {
      const cxp = pv.x + fract(k * 0.29 + t * 0.03 * (1 + k * 0.3)) * pv.w * 1.3 - pv.w * 0.15, cyp = pv.y + pv.h * (0.14 + k * 0.08);
      ctx.beginPath(); ctx.ellipse(cxp, cyp, pv.w * 0.09, pv.h * 0.025, 0, 0, TAU); ctx.ellipse(cxp + pv.w * 0.04, cyp - pv.h * 0.02, pv.w * 0.05, pv.h * 0.025, 0, 0, TAU);
      ctx.fillStyle = "rgba(255,255,255,0.22)"; ctx.fill();
    }
    [[0.6, 0.5, 0.45, 8], [0.72, 0.8, 0.62, 16], [0.84, 1.1, 0.78, 30]].forEach(([yy, sh, dark, speed], k) => {
      ctx.beginPath(); ctx.moveTo(pv.x, pv.y + pv.h);
      for (let s2 = 0; s2 <= 32; s2++) { const xx = pv.x + (pv.w * s2) / 32; ctx.lineTo(xx, pv.y + pv.h * yy - Math.sin(s2 * 0.55 + t * speed * 0.04 + k * 2) * pv.h * 0.05 * sh); }
      ctx.lineTo(pv.x + pv.w, pv.y + pv.h); ctx.closePath(); ctx.fillStyle = rgba(mix(th.acc2, BLACK, dark)); ctx.fill();
    });
    // Safe-area brackets.
    ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = Math.max(1, 1.2 * u);
    const bi = pv.w * 0.05, bl = pv.w * 0.04;
    ctx.beginPath();
    [[pv.x + bi, pv.y + bi, 1, 1], [pv.x + pv.w - bi, pv.y + bi, -1, 1], [pv.x + bi, pv.y + pv.h - bi * 1.4, 1, -1], [pv.x + pv.w - bi, pv.y + pv.h - bi * 1.4, -1, -1]].forEach(([bx, by, sx, sy]) => { ctx.moveTo(bx + sx * bl, by); ctx.lineTo(bx, by); ctx.lineTo(bx, by + sy * bl); });
    ctx.stroke();
    // The proposed change, outlined and breathing.
    const ch = { x: pv.x + pv.w * 0.18, y: pv.y + pv.h * 0.3, w: pv.w * 0.34, h: pv.h * 0.36 };
    ctx.save(); ctx.globalCompositeOperation = th.add;
    ctx.setLineDash([8 * u, 6 * u]); ctx.lineDashOffset = -t * 30 * u;
    ctx.lineWidth = 2.2 * u; ctx.strokeStyle = rgba(mix(th.acc, WHITE, 0.4), 0.75 + 0.25 * Math.sin(t * 3));
    rr(ctx, ch.x, ch.y, ch.w, ch.h, 4 * u); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = rgba(th.acc, 0.1 + 0.06 * Math.sin(t * 3)); ctx.fill();
    ctx.restore();
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(pv.x, pv.y + pv.h - 6 * u, pv.w, 6 * u);
    ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.fillRect(pv.x, pv.y + pv.h - 6 * u, pv.w * fract(t * 0.12), 6 * u);
    ctx.restore();
    // The card: header, two dials (a cursor drags the first), an easing curve, Apply.
    const cd = tallForm ? { x: x + pad, y: pv.y + pv.h + pad, w: w - pad * 2, h: h * 0.22 } : { x: pv.x + pv.w + pad, y: pv.y, w: x + w - pad - (pv.x + pv.w + pad), h: pv.h };
    rr(ctx, cd.x, cd.y, cd.w, cd.h, 8 * u);
    g = ctx.createLinearGradient(0, cd.y, 0, cd.y + cd.h);
    g.addColorStop(0, rgba(mix(th.panel, WHITE, L ? 0 : 0.05))); g.addColorStop(1, rgba(th.panel));
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = th.add;
    ctx.lineWidth = Math.max(1, 1.6 * u); ctx.strokeStyle = rgba(th.acc, 0.55 + 0.35 * Math.sin(t * 2)); ctx.shadowColor = rgba(th.acc); ctx.shadowBlur = 14 * u; ctx.stroke();
    ctx.restore();
    const lx = cd.x + cd.w * 0.09, lw = cd.w * 0.82, rh = cd.h;
    ctx.beginPath(); ctx.arc(lx + rh * 0.03, cd.y + rh * 0.12, rh * 0.03, 0, TAU); ctx.fillStyle = rgba(th.acc); ctx.fill();
    ctx.fillStyle = soft(0.75); rr(ctx, lx + rh * 0.09, cd.y + rh * 0.1, lw * 0.55, rh * 0.045, rh * 0.022); ctx.fill();
    ctx.fillStyle = soft(0.22); rr(ctx, lx, cd.y + rh * 0.2, lw * 0.9, rh * 0.032, rh * 0.016); ctx.fill();
    rr(ctx, lx, cd.y + rh * 0.26, lw * 0.62, rh * 0.032, rh * 0.016); ctx.fill();
    const k1 = 0.3 + 0.45 * (0.5 - 0.5 * Math.cos(t * 1.4)), k2 = 0.62 + 0.08 * Math.sin(t * 0.7);
    let knob1 = null;
    [[0.38, k1], [0.48, k2]].forEach(([ry2, kk], j) => {
      const sy = cd.y + rh * ry2, kx = lx + lw * kk;
      ctx.fillStyle = soft(0.3); rr(ctx, lx, sy - rh * 0.012, lw * 0.18, rh * 0.024, rh * 0.012); ctx.fill();
      const sx0 = lx + lw * 0.24, sw = lw * 0.76, kx2 = sx0 + sw * kk;
      ctx.fillStyle = soft(0.14); rr(ctx, sx0, sy - rh * 0.012, sw, rh * 0.024, rh * 0.012); ctx.fill();
      ctx.fillStyle = rgba(j ? th.acc2 : th.acc); rr(ctx, sx0, sy - rh * 0.012, kx2 - sx0, rh * 0.024, rh * 0.012); ctx.fill();
      ctx.beginPath(); ctx.arc(kx2, sy, rh * 0.038, 0, TAU); ctx.fillStyle = "#fff"; ctx.fill();
      if (!j) { knob1 = [kx2, sy]; ctx.save(); ctx.globalCompositeOperation = th.add; ctx.beginPath(); ctx.arc(kx2, sy, rh * 0.07, 0, TAU); ctx.fillStyle = rgba(th.acc, 0.3); ctx.fill(); ctx.restore(); }
      void kx;
    });
    // Easing curve with a dot riding it.
    const gc = { x: lx, y: cd.y + rh * 0.56, w: lw, h: rh * 0.16 };
    ctx.fillStyle = soft(0.05); rr(ctx, gc.x, gc.y, gc.w, gc.h, 4 * u); ctx.fill();
    ctx.beginPath();
    for (let s2 = 0; s2 <= 30; s2++) { const f = s2 / 30, e = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2; const px = gc.x + gc.w * f, py = gc.y + gc.h * (0.9 - 0.8 * e * (0.6 + 0.4 * k1)); s2 ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.lineWidth = 2 * u; ctx.strokeStyle = rgba(mix(th.acc, WHITE, 0.3)); ctx.stroke();
    { const f = fract(t * 0.5), e = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2; ctx.beginPath(); ctx.arc(gc.x + gc.w * f, gc.y + gc.h * (0.9 - 0.8 * e * (0.6 + 0.4 * k1)), 4 * u, 0, TAU); ctx.fillStyle = "#fff"; ctx.fill(); }
    const ap = { x: lx, y: cd.y + rh * 0.8, w: lw, h: rh * 0.11 };
    ctx.save(); rr(ctx, ap.x, ap.y, ap.w, ap.h, ap.h / 2); ctx.clip();
    g = ctx.createLinearGradient(ap.x, 0, ap.x + ap.w, 0);
    g.addColorStop(0, rgba(th.acc)); g.addColorStop(1, rgba(mix(th.acc, th.acc2, 0.5)));
    ctx.fillStyle = g; ctx.fillRect(ap.x, ap.y, ap.w, ap.h);
    sweep(ctx, th, ap.x, ap.y, ap.w, ap.h, t, 2.2, 0.3, 1.4);
    ctx.fillStyle = rgba(WHITE, 0.85); rr(ctx, ap.x + ap.w * 0.4, ap.y + ap.h * 0.38, ap.w * 0.2, ap.h * 0.24, ap.h * 0.12); ctx.fill();
    ctx.restore();
    // Timeline: track headers, ruler, title, picture (with thumbnails), sound and caption tracks.
    const tl = { x: x + pad, y: Math.max(pv.y + pv.h, tallForm ? cd.y + cd.h : 0) + pad, w: w - pad * 2 };
    tl.h = y + h - pad - tl.y;
    const hw = tl.w * 0.075, tx = tl.x + hw + pad * 0.5, tw = tl.x + tl.w - tx;
    ctx.fillStyle = L ? rgba(th.ink, 0.04) : "rgba(255,255,255,0.03)"; rr(ctx, tl.x, tl.y, tl.w, tl.h, 5 * u); ctx.fill();
    const rows = 4, th4 = tl.h / (rows + 0.7);
    ctx.fillStyle = soft(0.2);
    for (let k = 0; k <= 32; k++) ctx.fillRect(tx + (tw * k) / 32, tl.y + 2 * u, Math.max(1, u), th4 * (k % 4 ? 0.2 : 0.4));
    const R = rng(77);
    const anchors = {};
    const tint = [mix(th.acc2, th.screen, 0.35), mix(th.ink, th.screen, L ? 0.72 : 0.7), mix(th.acc2, th.screen, 0.55), mix(th.ink, th.screen, L ? 0.82 : 0.8)];
    for (let tr = 0; tr < rows; tr++) {
      const ty = tl.y + th4 * 0.6 + tr * th4, chh = th4 * 0.8;
      // Header: a small glyph and a name bar.
      ctx.fillStyle = soft(0.28); rr(ctx, tl.x + hw * 0.14, ty + chh * 0.3, chh * 0.4, chh * 0.4, 2 * u); ctx.fill();
      ctx.fillStyle = soft(0.16); rr(ctx, tl.x + hw * 0.14 + chh * 0.55, ty + chh * 0.42, hw * 0.4, chh * 0.16, chh * 0.08); ctx.fill();
      let cxp = tx + R() * tw * 0.04;
      for (let k = 0; k < 5 && cxp < tx + tw; k++) {
        const cw = Math.min(tw * (tr === 3 ? 0.08 + R() * 0.08 : 0.13 + R() * 0.2), tx + tw - cxp);
        const hot = tr === 1 && k === 1;
        const grow = clamp(0.4 + p * 1.2 - k * 0.12), ww = cw * grow;
        if (ww < 2 * u) { cxp += cw + tw * 0.01; continue; }
        if (hot) { // The proposed clip glows from within.
          ctx.save(); ctx.globalCompositeOperation = th.add;
          const bg = ctx.createRadialGradient(cxp + ww / 2, ty + chh / 2, 0, cxp + ww / 2, ty + chh / 2, ww * 0.9);
          bg.addColorStop(0, rgba(th.acc, 0.35 + 0.15 * Math.sin(t * 3))); bg.addColorStop(1, rgba(th.acc, 0));
          ctx.fillStyle = bg; ctx.fillRect(cxp - ww * 0.4, ty - chh, ww * 1.8, chh * 3);
          ctx.restore();
        }
        rr(ctx, cxp, ty, ww, chh, 4 * u);
        ctx.fillStyle = hot ? rgba(mix(th.acc, WHITE, 0.08)) : rgba(tint[tr]); ctx.fill();
        if (tr === 1) { // Picture thumbnails.
          ctx.save(); rr(ctx, cxp, ty, ww, chh, 4 * u); ctx.clip();
          const fw = chh * 1.5;
          for (let f = cxp + 2 * u; f < cxp + ww; f += fw) {
            const tg = ctx.createLinearGradient(0, ty, 0, ty + chh);
            tg.addColorStop(0, rgba(mix(hot ? th.acc : th.acc2, WHITE, 0.35), hot ? 0.5 : 0.35)); tg.addColorStop(1, rgba(mix(th.acc2, BLACK, 0.5), hot ? 0.4 : 0.5));
            ctx.fillStyle = tg; ctx.fillRect(f, ty + 2 * u, fw - 2 * u, chh - 4 * u);
            ctx.beginPath(); ctx.moveTo(f, ty + chh * 0.75); ctx.lineTo(f + fw * 0.35, ty + chh * 0.5); ctx.lineTo(f + fw * 0.7, ty + chh * 0.68); ctx.lineTo(f + fw - 2 * u, ty + chh * 0.55); ctx.lineTo(f + fw - 2 * u, ty + chh - 2 * u); ctx.lineTo(f, ty + chh - 2 * u); ctx.closePath();
            ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.fill();
          }
          ctx.restore();
        }
        if (tr === 2) { // Waveform.
          ctx.fillStyle = L ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.5)";
          for (let s2 = 0; s2 < ww - 6 * u; s2 += 4 * u) { const a = 0.15 + 0.75 * Math.abs(Math.sin(s2 * 0.11 + k * 3) * Math.cos(s2 * 0.037 + k)); ctx.fillRect(cxp + 3 * u + s2, ty + chh * 0.5 - chh * 0.4 * a, 2 * u, chh * 0.8 * a); }
        }
        if (tr === 0 || tr === 3) { ctx.fillStyle = soft(0.5); rr(ctx, cxp + 6 * u, ty + chh * 0.4, ww * 0.5, chh * 0.2, chh * 0.1); ctx.fill(); }
        if (hot) {
          ctx.save(); ctx.globalCompositeOperation = th.add;
          rr(ctx, cxp, ty, ww, chh, 4 * u);
          ctx.lineWidth = 2.5 * u; ctx.strokeStyle = rgba(mix(th.acc, WHITE, 0.5), 0.8 + 0.2 * Math.sin(t * 3)); ctx.shadowColor = rgba(th.acc); ctx.shadowBlur = 22 * u; ctx.stroke();
          ctx.restore();
          anchors.clip = [cxp + ww * 0.5, ty + chh * 0.5];
        }
        if (tr === 2 && k === 0) anchors.track = [cxp + ww * 0.35, ty + chh * 0.5];
        cxp += cw + tw * 0.01;
      }
    }
    const phx = tx + tw * fract(t * 0.12);
    ctx.save(); ctx.globalCompositeOperation = th.add;
    ctx.fillStyle = rgba(th.acc, 0.25); ctx.fillRect(phx - 5 * u, tl.y, 10 * u, tl.h);
    ctx.restore();
    ctx.fillStyle = rgba(mix(th.acc, WHITE, 0.3)); ctx.fillRect(phx - 1 * u, tl.y, 2.5 * u, tl.h);
    ctx.beginPath(); ctx.moveTo(phx - 7 * u, tl.y); ctx.lineTo(phx + 7 * u, tl.y); ctx.lineTo(phx, tl.y + 9 * u); ctx.closePath(); ctx.fill();
    // The cursor dragging the first dial.
    if (knob1) {
      const [kx, ky] = knob1, cs = Math.max(14 * u, rh * 0.09);
      ctx.save(); ctx.translate(kx + cs * 0.15, ky + cs * 0.1);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, cs); ctx.lineTo(cs * 0.28, cs * 0.75); ctx.lineTo(cs * 0.5, cs * 1.1); ctx.lineTo(cs * 0.62, cs * 1.04); ctx.lineTo(cs * 0.42, cs * 0.7); ctx.lineTo(cs * 0.75, cs * 0.7); ctx.closePath();
      ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = Math.max(1, 1.4 * u); ctx.strokeStyle = "rgba(0,0,0,0.75)"; ctx.stroke();
      ctx.restore();
    }
    // Screen finish: scanlines and an inner vignette.
    ctx.fillStyle = L ? "rgba(0,0,0,0.025)" : "rgba(0,0,0,0.18)";
    for (let yy = y; yy < y + h; yy += 3 * u) ctx.fillRect(x, yy, w, Math.max(1, u * 0.8));
    const vg = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.35, x + w / 2, y + h / 2, Math.hypot(w, h) * 0.6);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, L ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.4)");
    ctx.fillStyle = vg; ctx.fillRect(x, y, w, h);
    anchors.preview = [ch.x + ch.w * 0.5, ch.y + ch.h * 0.5];
    if (!anchors.clip) anchors.clip = [tx + tw * 0.4, tl.y + th4 * 2];
    if (!anchors.track) anchors.track = [tx + tw * 0.15, tl.y + th4 * 3];
    return anchors;
  }
  // Glass over a screen: the stage's beams reflected as slow slanted streaks, a diagonal sheen and a sweep.
  function glassOver(ctx, S, th, sx, sy, sw, sh, t) {
    ctx.save();
    ctx.globalCompositeOperation = th.add;
    for (let k = 0; k < 3; k++) {
      const cx = sx + sw * (fract(0.15 + k * 0.33 + t * 0.025) * 1.4 - 0.2), wd = sw * (0.06 + 0.04 * k);
      const g = ctx.createLinearGradient(cx - wd, 0, cx + wd, 0);
      g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, `rgba(255,255,255,${th.light ? 0.08 : 0.05})`); g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.save(); ctx.translate(cx, sy); ctx.transform(1, 0, -0.35, 1, 0, 0); ctx.translate(-cx, -sy);
      ctx.fillStyle = g; ctx.fillRect(cx - wd, sy, wd * 2, sh); ctx.restore();
    }
    ctx.restore();
    const g = ctx.createLinearGradient(sx, sy, sx + sw * 0.6, sy + sh);
    g.addColorStop(0, "rgba(255,255,255,0.1)"); g.addColorStop(0.5, "rgba(255,255,255,0.025)"); g.addColorStop(0.51, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(sx, sy, sw, sh);
    sweep(ctx, th, sx, sy, sw, sh, t, 3.8, 0.9, 0.6);
  }
  function laptop(ctx, S, th, x, y, w, t, p) {
    const u = S.u, h = w * 0.62, depth = w * 0.13, lip = 12 * u;
    // Base deck in perspective, then the lid standing on it.
    const by = y + h, bx0 = x, bx1 = x + w, fx0 = x - w * 0.07, fx1 = x + w * 1.07, fy = by + depth;
    ctx.beginPath(); ctx.moveTo(bx0, by); ctx.lineTo(bx1, by); ctx.lineTo(fx1, fy); ctx.lineTo(fx0, fy); ctx.closePath();
    let g = ctx.createLinearGradient(0, by, 0, fy);
    g.addColorStop(0, rgba(mix(th.metalDark, th.metalLit, 0.25))); g.addColorStop(1, rgba(mix(th.metalDark, th.metalLit, 0.55)));
    ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = th.light ? "rgba(0,0,0,0.1)" : "rgba(0,0,0,0.45)";
    for (let row = 0; row < 3; row++) {
      const v0 = 0.14 + row * 0.24, v1 = v0 + 0.17;
      const ya = by + depth * v0, yb = by + depth * v1;
      const la = bx0 + (fx0 - bx0) * v0, ra = bx1 + (fx1 - bx1) * v0, lb = bx0 + (fx0 - bx0) * v1, rb = bx1 + (fx1 - bx1) * v1;
      const keys = 14;
      for (let k = 0; k < keys; k++) {
        const f0 = 0.08 + (k / keys) * 0.84, f1 = f0 + 0.84 / keys - 0.008;
        ctx.beginPath(); ctx.moveTo(la + (ra - la) * f0, ya); ctx.lineTo(la + (ra - la) * f1, ya); ctx.lineTo(lb + (rb - lb) * f1, yb); ctx.lineTo(lb + (rb - lb) * f0, yb); ctx.closePath(); ctx.fill();
      }
    }
    ctx.beginPath(); ctx.moveTo(fx0, fy); ctx.lineTo(fx1, fy); ctx.lineTo(fx1 - 6 * u, fy + lip); ctx.lineTo(fx0 + 6 * u, fy + lip); ctx.closePath();
    ctx.fillStyle = metalGrad(ctx, th, fx0, fx1); ctx.fill();
    ctx.fillStyle = th.hi(0.5); ctx.fillRect(fx0, fy - 0.5 * u, fx1 - fx0, 1.5 * u);
    // Lid.
    rr(ctx, x, y, w, h, 18 * u);
    g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, rgba(mix(th.metalDark, th.metalLit, 0.45))); g.addColorStop(0.5, rgba(th.metalDark)); g.addColorStop(1, rgba(mix(th.metalDark, th.metalLit, 0.3)));
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2 * u; ctx.strokeStyle = th.hi(0.35); ctx.stroke();
    const b = w * 0.026, sx = x + b, sy = y + b, sw = w - b * 2, sh = h - b * 2.2;
    ctx.save(); rr(ctx, sx, sy, sw, sh, 8 * u); ctx.clip();
    const anchors = screenUI(ctx, S, th, sx, sy, sw, sh, t, p, false);
    glassOver(ctx, S, th, sx, sy, sw, sh, t);
    ctx.restore();
    // The screen's light spills onto the deck.
    ctx.save(); ctx.globalCompositeOperation = th.add;
    ctx.beginPath(); ctx.moveTo(bx0, by); ctx.lineTo(bx1, by); ctx.lineTo(fx1, fy); ctx.lineTo(fx0, fy); ctx.closePath(); ctx.clip();
    const sp = ctx.createRadialGradient(x + w / 2, by, 0, x + w / 2, by, w * 0.55);
    sp.addColorStop(0, rgba(mix(th.acc, WHITE, 0.3), th.light ? 0.08 : 0.22 + 0.04 * Math.sin(t * 3))); sp.addColorStop(1, rgba(th.acc, 0));
    ctx.fillStyle = sp; ctx.fillRect(fx0, by, fx1 - fx0, depth);
    ctx.restore();
    return { anchors, contact: fy + lip, left: fx0, right: fx1 };
  }
  function phone(ctx, S, th, x, y, w, t, p) {
    const u = S.u, h = w * 2.05, r = w * 0.16;
    rr(ctx, x - 4 * u, y - 4 * u, w + 8 * u, h + 8 * u, r + 4 * u);
    ctx.fillStyle = metalGrad(ctx, th, x - 4 * u, x + w + 4 * u); ctx.fill();
    ctx.fillStyle = rgba(th.metalLit, 0.7);
    rr(ctx, x + w + 2 * u, y + h * 0.22, 5 * u, h * 0.1, 2 * u); ctx.fill();
    rr(ctx, x + w + 2 * u, y + h * 0.35, 5 * u, h * 0.06, 2 * u); ctx.fill();
    rr(ctx, x, y, w, h, r); ctx.fillStyle = "#050507"; ctx.fill();
    const b = w * 0.045, sx = x + b, sy = y + b, sw = w - b * 2, sh = h - b * 2;
    ctx.save(); rr(ctx, sx, sy, sw, sh, r * 0.78); ctx.clip();
    const anchors = screenUI(ctx, S, th, sx, sy, sw, sh, t, p, true);
    glassOver(ctx, S, th, sx, sy, sw, sh, t);
    ctx.restore();
    ctx.beginPath(); ctx.arc(x + w / 2, y + b + sh * 0.025, w * 0.03, 0, TAU); ctx.fillStyle = "#000"; ctx.fill();
    return { anchors, contact: y + h + 4 * u, left: x, right: x + w };
  }
  function objectScene(ctx, S, th, A, p, d, t) {
    const u = S.u, isPhone = d.kind === "phone";
    const floor = A.floor, bob = Math.sin(t * 1.2) * 6 * u;
    let dev, devW, devX, devY, labelsAbove = false;
    if (isPhone) {
      const hMax = (floor - A.y) * 0.92;
      devW = Math.min(hMax / 2.05, A.w * (S.tall ? 0.42 : 0.24));
      devX = A.x + A.w * (S.tall ? 0.26 : 0.3) - devW / 2;
      devY = floor - 30 * u - devW * 2.05;
    } else if (S.tall) {
      devW = Math.min(A.w * 0.86, (floor - A.y) * 0.5);
      devX = A.x + (A.w - devW) / 2;
      devY = floor - devW * (0.62 + 0.13) - 12 * u;
      labelsAbove = true;
    } else {
      devW = Math.min(A.w * 0.54, (floor - A.y - 10 * u) / 0.77);
      devX = A.x + A.w * 0.06;
      devY = floor - devW * 0.77;
    }
    const lift = (1 - eo(p * 3)) * 30 * u;
    const drawDev = (g) => (isPhone ? phone(g, S, th, devX, devY + bob + lift, devW, t, p) : laptop(g, S, th, devX, devY + bob + lift, devW, t, p));
    const cx = devX + devW / 2;
    pool(ctx, th, cx, floor, devW * 0.9, devW * 0.12, th.acc, 0.22);
    shadow(ctx, th, cx, floor, devW * (isPhone ? 0.7 : 0.62), devW * 0.06);
    reflect(ctx, S, th, floor, drawDev);
    dev = drawDev(ctx);
    // Callouts: a pulsing anchor, a leader, then the words.
    const pts = [dev.anchors.preview, dev.anchors.clip, dev.anchors.track];
    const right = A.x + A.w;
    // Once all three are in, attention steps from callout to callout: the lit one reads brightest.
    const cOn = seg(p, 0.85, 1), cs = Math.max(0, t) / 1.15, cPos = (Math.floor(cs) % 3) + eio(clamp((fract(cs) - 0.7) / 0.3));
    const hlOf = (i) => { let dd = Math.abs(cPos - i); if (i === 0) dd = Math.min(dd, Math.abs(cPos - 3)); return 1 - cOn * (1 - clamp(1 - dd)); };
    d.callouts.forEach((words, i) => {
      if (!words) return;
      const c = stagger(p, i, 3, 0.5), hl = hlOf(i);
      const [ax, ay] = pts[i];
      let lx, ly, maxW, align = "left";
      if (labelsAbove) { lx = A.x + 20 * u; ly = A.y + 40 * u + i * ((devY - A.y - 60 * u) / 3); maxW = A.w - 40 * u; }
      else { lx = dev.right + (isPhone ? 110 : 90) * u; ly = A.y + (floor - A.y) * (0.16 + i * 0.3); maxW = right - lx; }
      ctx.save(); ctx.globalCompositeOperation = th.add;
      const pr = fract(t * 0.8 + i * 0.33);
      ctx.beginPath(); ctx.arc(ax, ay, (8 + pr * (22 + 20 * hl * cOn)) * u, 0, TAU); ctx.lineWidth = (2 + hl * cOn) * u; ctx.strokeStyle = rgba(th.acc, (1 - pr) * (0.5 + 0.4 * hl) * clamp(c * 3)); ctx.stroke();
      ctx.restore();
      ctx.beginPath(); ctx.arc(ax, ay, 7 * u, 0, TAU); ctx.fillStyle = rgba(mix(th.acc, WHITE, 0.3), clamp(c * 3)); ctx.fill();
      ctx.beginPath(); ctx.arc(ax, ay, 3 * u, 0, TAU); ctx.fillStyle = "#fff"; ctx.fill();
      if (c <= 0) return;
      const ex = labelsAbove ? Math.max(lx + 40 * u, Math.min(ax, lx + maxW * 0.6)) : lx - 26 * u;
      const ey = labelsAbove ? ly + 34 * u : ly;
      const mx = labelsAbove ? ex : ex - 40 * u;
      const k = eo(c);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      const seg1 = clamp(k * 1.6), seg2 = clamp(k * 1.6 - 0.6);
      ctx.lineTo(ax + (mx - ax) * seg1, ay + (ey - ay) * seg1);
      if (seg2 > 0) ctx.lineTo(mx + (ex - mx) * seg2, ey);
      ctx.lineWidth = 2 * u; ctx.strokeStyle = th.hi(0.35 + 0.4 * hl); ctx.stroke();
      const ta = seg(c, 0.55, 1);
      if (ta > 0) {
        ctx.save(); ctx.globalAlpha *= ta;
        const sz = fitSize(ctx, S, words, 50 * u, maxW, 42 * u, 600);
        label(ctx, S, th, words, lx + (1 - ta) * 20 * u + hl * cOn * 8 * u, ly, maxW, { align, base: "middle", size: sz / u, color: rgba(th.ink, 0.6 + 0.4 * hl) });
        ctx.fillStyle = rgba(th.acc, 0.5 + 0.5 * hl); ctx.fillRect(lx, ly + sz * 0.62 + (textW(ctx, S, words, sz, 600) > maxW ? sz * 0.56 : 0), Math.min(maxW, (90 + 110 * hl * cOn) * u) * ta, 3 * u);
        ctx.restore();
      }
    });
  }

  // ---- people: glossy figurines on pedestals under follow spots -----------------------------------
  function figurine(ctx, S, th, cx, base, fh, hot, t, i, lit) {
    const u = S.u, pr = fh * 0.3, ph = fh * 0.075;
    const c0 = hot ? th.acc : th.figure;
    cylinder(ctx, S, th, cx, base, pr, ph, { ring: (hot ? 0.95 : 0.2) * lit, ringColor: hot ? th.acc : th.acc2, t, offset: i * 0.4, period: 4 });
    const fb = base - ph;
    const bob = Math.sin(t * 1.6 + i * 1.3) * fh * 0.012;
    const tilt = Math.sin(t * 0.9 + i * 2.1) * 0.06;
    const vary = [1, 0.94, 1.04, 0.97, 1.02, 0.95][i % 6];
    const bh = fh * 0.5 * vary, wb = fh * 0.4, ws = fh * 0.26;
    const top = fb - bh + bob;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - wb / 2, fb);
    ctx.bezierCurveTo(cx - wb / 2, fb - bh * 0.45, cx - ws / 2, fb - bh * 0.7 + bob, cx - ws * 0.42, top + bh * 0.06);
    ctx.quadraticCurveTo(cx, top - bh * 0.07, cx + ws * 0.42, top + bh * 0.06);
    ctx.bezierCurveTo(cx + ws / 2, fb - bh * 0.7 + bob, cx + wb / 2, fb - bh * 0.45, cx + wb / 2, fb);
    ctx.ellipse(cx, fb, wb / 2, wb * 0.13, 0, 0, Math.PI, false);
    ctx.closePath();
    const dark = mix(c0, BLACK, th.light ? 0.25 : 0.65), litc = mix(c0, WHITE, hot ? 0.35 : th.light ? 0.6 : 0.4);
    const g = ctx.createLinearGradient(cx - wb / 2, 0, cx + wb / 2, 0);
    g.addColorStop(0, rgba(mix(dark, litc, 0.2))); g.addColorStop(0.28, rgba(litc)); g.addColorStop(0.55, rgba(mix(dark, litc, 0.45))); g.addColorStop(0.88, rgba(dark)); g.addColorStop(1, rgba(mix(dark, th.acc2, 0.5)));
    ctx.fillStyle = g; ctx.fill();
    ctx.globalAlpha *= 0.35 + 0.65 * lit;
    ctx.clip();
    sweep(ctx, th, cx - wb, top - fh * 0.3, wb * 2, fh, t, 3.4, i * 0.37, 0.8);
    ctx.restore();
    // Collar light.
    ctx.save(); ctx.globalCompositeOperation = th.add;
    ctx.beginPath(); ctx.ellipse(cx, top + bh * 0.08, ws * 0.36, ws * 0.08, 0, 0, TAU);
    ctx.lineWidth = 3 * u; ctx.strokeStyle = rgba(hot ? mix(th.acc, WHITE, 0.4) : th.acc2, (hot ? 0.9 : 0.45) * lit); ctx.shadowColor = rgba(th.acc); ctx.shadowBlur = 10 * u; ctx.stroke();
    ctx.restore();
    // Head.
    const hr = fh * 0.13, hx = cx + tilt * hr * 1.5, hy = top - hr * 1.05;
    let hg = ctx.createRadialGradient(hx - hr * 0.4, hy - hr * 0.45, hr * 0.05, hx, hy, hr * 1.1);
    hg.addColorStop(0, rgba(mix(litc, WHITE, 0.4))); hg.addColorStop(0.5, rgba(mix(dark, litc, 0.55))); hg.addColorStop(1, rgba(dark));
    ctx.beginPath(); ctx.arc(hx, hy, hr, 0, TAU); ctx.fillStyle = hg; ctx.fill();
    // A visor band; it glows on the highlighted figure.
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(tilt);
    ctx.beginPath(); ctx.ellipse(0, hr * 0.05, hr * 0.82, hr * 0.26, 0, 0, TAU);
    ctx.fillStyle = hot ? rgba(mix(th.acc, WHITE, 0.15), 0.4 + 0.6 * lit) : th.light ? "rgba(30,32,40,0.75)" : "rgba(6,7,10,0.85)"; ctx.fill();
    if (hot) { ctx.globalCompositeOperation = th.add; ctx.shadowColor = rgba(th.acc); ctx.shadowBlur = 18 * u; ctx.fill(); }
    ctx.globalCompositeOperation = "source-over"; ctx.shadowBlur = 0;
    const sx = -hr * 0.6 + fract(t * 0.5 + i * 0.3) * hr * 1.2;
    ctx.beginPath(); ctx.ellipse(sx, hr * 0.0, hr * 0.12, hr * 0.06, 0, 0, TAU); ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(hx - hr * 0.35, hy - hr * 0.5, hr * 0.22, hr * 0.12, -0.5, 0, TAU); ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.fill();
    return hy - hr;
  }
  function peopleScene(ctx, S, th, A, p, d, t) {
    const u = S.u, n = Math.max(2, Math.min(6, Math.round(d.count)));
    const floor = A.floor, two = S.tall && n > 3;
    const cols = two ? Math.ceil(n / 2) : n, slot = A.w / cols;
    const fh = Math.min((floor - A.y - (two ? 560 : 130) * S.u) / 0.9, slot * (two ? 1.15 : 1.25));
    const hot = Math.min(n - 1, d.highlight);
    // On a tall frame a crowd stands in two rows: the back row raised and smaller.
    const backN = Math.floor(n / 2);
    const pos = (i) => !two ? { x: A.x + slot * (i + 0.5), base: floor, s: 1 } : i % 2 ? { x: A.x + (A.w * (Math.floor(i / 2) + 0.5)) / backN, base: floor - 420 * u, s: 0.82 } : { x: A.x + slot * (Math.floor(i / 2) + 0.5), base: floor, s: 1 };
    const xs = (i) => pos(i).x;
    const order = [...Array(n).keys()].sort((a, b) => pos(a).base - pos(b).base);
    // A follow spot steps from figure to figure and back; whoever it lands on lights up with their badge.
    const m = Math.max(1, 2 * (n - 1)), fs = Math.max(0, t) / 0.85, vOf = (k) => { const q = ((k % m) + m) % m; return q < n ? q : m - q; };
    const fa = vOf(Math.floor(fs)), fb = vOf(Math.floor(fs) + 1), fm = eio(clamp((fract(fs) - 0.55) / 0.45));
    const follow = xs(fa) + (xs(fb) - xs(fa)) * fm;
    const spotOf = (i) => Math.exp(-Math.pow((xs(i) - follow) / (slot * 0.4), 2)) * (0.3 + 0.7 * seg(p, 0.3, 0.8));
    // Every figure gets its own role: missing ones are filled from a cast list, never repeated.
    const roles = d.badges.filter(Boolean).slice(0, n);
    for (const r of ["Producer", "Colorist", "Client", "Sound", "Writer", "Editor", "Director", "Agent"]) { if (roles.length >= n) break; if (!roles.includes(r)) roles.push(r); }
    // Spots from the rig: the highlighted figure keeps its own, a follow spot roams the rest.
    for (let i = 0; i < n; i++) {
      const q = stagger(p, i, n, 0.5);
      const boost = spotOf(i);
      const a = (i === hot ? 0.16 + 0.12 * boost : 0.04 + 0.2 * boost) * (0.3 + 0.7 * q);
      if (!th.light) {
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        const g = ctx.createLinearGradient(0, A.y - 200 * u, 0, floor);
        g.addColorStop(0, rgba(mix(i === hot ? th.acc : th.acc2, WHITE, 0.5), a)); g.addColorStop(1, rgba(i === hot ? th.acc : th.acc2, a * 0.15));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(xs(i) - 16 * u, -10 * u); ctx.lineTo(xs(i) + 16 * u, -10 * u); ctx.lineTo(xs(i) + fh * 0.42, pos(i).base); ctx.lineTo(xs(i) - fh * 0.42, pos(i).base); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      pool(ctx, th, xs(i), pos(i).base, fh * 0.75 * pos(i).s, fh * 0.13, i === hot ? th.acc : th.acc2, (i === hot ? 0.35 : 0.08 + 0.3 * boost) * (0.3 + 0.7 * q));
    }
    const heads = [];
    const solid = (g) => {
      for (const i of order) {
        const q = stagger(p, i, n, 0.5), P = pos(i);
        if (g !== ctx && P.base !== floor) continue;
        shadow(g, th, P.x, P.base, fh * 0.42 * P.s, fh * 0.07 * P.s);
        heads[i] = figurine(g, S, th, P.x, P.base, fh * P.s * (i === hot ? 1.06 : 1), i === hot, t, i, (0.3 + 0.7 * q) * (0.75 + 0.25 * Math.max(spotOf(i), i === hot ? 1 : 0)));
      }
    };
    reflect(ctx, S, th, floor, solid);
    solid(ctx);
    // Badges pop in with their words already set.
    for (let i = 0; i < n; i++) {
      const words = roles[i];
      const q = seg(stagger(p, i, n, 0.5), 0.35, 1), sp = spotOf(i);
      if (!words || q <= 0) continue;
      const size = fitSize(ctx, S, words, 44 * u, slot * 1.6, 42 * u, 650);
      const bw = textW(ctx, S, words, size, 650) + 52 * u, bh = size * 1.6;
      const stack = !two && bw > slot * 0.96 && i % 2 ? bh + 16 * u : 0;
      const bx = xs(i), by = heads[i] - 34 * u - bh - stack + Math.sin(t * 1.4 + i) * 4 * u;
      ctx.save();
      ctx.globalAlpha *= clamp(q * 2);
      const s = (0.7 + 0.3 * back(q)) * (1 + 0.08 * sp);
      ctx.translate(bx, by + bh / 2); ctx.scale(s, s); ctx.translate(-bx, -(by + bh / 2));
      rr(ctx, bx - bw / 2, by, bw, bh, bh / 2);
      if (i === hot) {
        const g = ctx.createLinearGradient(bx - bw / 2, by, bx + bw / 2, by + bh);
        g.addColorStop(0, rgba(mix(th.acc, WHITE, 0.15))); g.addColorStop(1, rgba(mix(th.acc, th.acc2, 0.4)));
        ctx.fillStyle = g; if (!th.light) { ctx.shadowColor = rgba(th.acc, 0.7); ctx.shadowBlur = 26 * u; }
      } else ctx.fillStyle = th.light ? "rgba(255,255,255,0.92)" : "rgba(22,24,31,0.88)";
      ctx.fill(); ctx.shadowBlur = 0;
      ctx.lineWidth = 1.5 * u; ctx.strokeStyle = th.hi(i === hot ? 0.5 : 0.22); ctx.stroke();
      if (sp > 0.05 && i !== hot) { ctx.save(); ctx.globalCompositeOperation = th.add; ctx.lineWidth = 2.5 * u; ctx.strokeStyle = rgba(th.acc2, sp); ctx.shadowColor = rgba(th.acc2, sp); ctx.shadowBlur = 20 * u; ctx.stroke(); ctx.restore(); }
      ctx.beginPath(); ctx.moveTo(bx - 9 * u, by + bh); ctx.lineTo(bx, by + bh + 10 * u); ctx.lineTo(bx + 9 * u, by + bh); ctx.closePath(); ctx.fill();
      txt(ctx, S, words, bx, by + bh / 2 + size * 0.05, size, { base: "middle", weight: 650, color: i === hot ? th.onAccent : rgba(th.ink) });
      ctx.restore();
    }
  }

  // ---- process: glass tiles hovering over pads, joined by a light rail ----------------------------
  function stepIcon(ctx, S, th, kind, s, t, color, a) {
    const u = S.u;
    ctx.save();
    ctx.globalCompositeOperation = th.add;
    ctx.strokeStyle = rgba(color, a); ctx.fillStyle = rgba(color, a);
    ctx.lineWidth = Math.max(2, s * 0.06); ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.shadowColor = rgba(color, a); ctx.shadowBlur = 14 * u;
    if (kind === 0) { // A film frame being scanned.
      rr(ctx, -s * 0.4, -s * 0.3, s * 0.8, s * 0.6, s * 0.06); ctx.stroke();
      for (let k = 0; k < 5; k++) { ctx.fillRect(-s * 0.32 + k * s * 0.16, -s * 0.25, s * 0.07, s * 0.06); ctx.fillRect(-s * 0.32 + k * s * 0.16, s * 0.19, s * 0.07, s * 0.06); }
      const y = -s * 0.14 + fract(t * 0.7) * s * 0.28;
      ctx.beginPath(); ctx.moveTo(-s * 0.46, y); ctx.lineTo(s * 0.46, y); ctx.stroke();
    } else if (kind === 1) { // Two cards, the front one gaining a mark.
      ctx.globalAlpha *= 0.5; rr(ctx, -s * 0.28, -s * 0.38, s * 0.62, s * 0.5, s * 0.06); ctx.stroke(); ctx.globalAlpha /= 0.5;
      rr(ctx, -s * 0.36, -s * 0.22, s * 0.62, s * 0.5, s * 0.06); ctx.stroke();
      const k = 0.5 + 0.5 * Math.sin(t * 2);
      ctx.beginPath(); ctx.moveTo(-s * 0.24, -s * 0.06); ctx.lineTo(-s * 0.24 + s * 0.38 * k, -s * 0.06); ctx.moveTo(-s * 0.24, s * 0.08); ctx.lineTo(s * 0.02, s * 0.08); ctx.stroke();
    } else { // A ring closing round a check.
      const k = 0.75 + 0.25 * Math.sin(t * 1.5);
      ctx.beginPath(); ctx.arc(0, 0, s * 0.36, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.16, 0); ctx.lineTo(-s * 0.04, s * 0.12); ctx.lineTo(s * 0.18, -s * 0.12); ctx.stroke();
    }
    ctx.restore();
  }
  function processScene(ctx, S, th, A, p, d, t) {
    const u = S.u, n = d.steps.length;
    const vertical = S.tall;
    const floor = A.floor;
    const rows = [];
    for (let i = 0; i < n; i++) {
      if (vertical) {
        const rowH = (floor - A.y) / n;
        rows.push({ x: A.x + A.w * 0.26, base: A.y + rowH * (i + 1) - 10 * u, r: Math.min(A.w * 0.17, rowH * 0.36) });
      } else {
        rows.push({ x: A.x + A.w * ((i + 0.5) / n), base: floor, r: Math.min((A.w / n) * 0.26, (floor - A.y) * 0.22) });
      }
    }
    const padH = 24 * u;
    // Once built, a spotlight steps 01 → 02 → 03 and round again: the lit step lifts, glows and reads
    // brightest while the others settle back.
    const on = seg(p, 0.45, 0.8);
    const sStep = Math.max(0, t) / 1.0, step = Math.floor(sStep), mv = eio(clamp((fract(sStep) - 0.62) / 0.38));
    const pos = (step % n) + mv;
    const hitOf = (i) => { let dd = Math.abs(pos - i); if (i === 0) dd = Math.min(dd, Math.abs(pos - n)); return on * clamp(1 - dd); };
    const railY = (row) => row.base - padH * 0.5;
    ctx.save();
    ctx.globalCompositeOperation = th.add;
    for (let i = 0; i < n - 1; i++) {
      const a = rows[i], b = rows[i + 1], k = stagger(p, i + 0.5, n, 0.5);
      if (k <= 0) continue;
      const x0 = vertical ? a.x - a.r * 1.15 : a.x + a.r, y0 = vertical ? railY(a) : railY(a);
      const x1 = vertical ? b.x - b.r * 1.15 : b.x - b.r, y1 = railY(b);
      ctx.beginPath(); ctx.moveTo(x0, y0);
      if (vertical) ctx.bezierCurveTo(x0 - a.r * 0.5, y0, x1 - b.r * 0.5, y1, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k);
      else ctx.lineTo(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k);
      ctx.lineWidth = 3 * u; ctx.strokeStyle = rgba(th.acc, 0.5); ctx.shadowColor = rgba(th.acc); ctx.shadowBlur = 12 * u; ctx.stroke();
      ctx.shadowBlur = 0;
      if (k >= 1 && p > 0.7) { // Chevrons moving along the rail.
        for (let c = 0; c < 3; c++) {
          const f = fract(t * 0.8 + c / 3), x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * f;
          const ang = Math.atan2(y1 - y0, x1 - x0) + (vertical ? Math.PI * 0 : 0);
          ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
          ctx.beginPath(); ctx.moveTo(-8 * u, -9 * u); ctx.lineTo(2 * u, 0); ctx.lineTo(-8 * u, 9 * u);
          ctx.lineWidth = 3 * u; ctx.strokeStyle = rgba(mix(th.acc, WHITE, 0.5), Math.sin(Math.PI * f)); ctx.stroke();
          ctx.restore();
        }
      }
    }
    ctx.restore();
    const solid = (g) => {
      rows.forEach((row, i) => {
        if (vertical && g !== ctx && i !== n - 1) return;
        const q = stagger(p, i, n, 0.5);
        const hit = hitOf(i);
        shadow(g, th, row.x, row.base, row.r * 1.25, row.r * 0.24);
        cylinder(g, S, th, row.x, row.base, row.r, padH, { ring: 0.25 + 0.5 * q + 0.25 * hit, band: 0.3 * q + 0.6 * hit, t, offset: i * 0.5 });
        // The tile hovering above, turning slowly.
        const ts = row.r * (vertical ? 1.3 : 2.2) * (1 + 0.1 * hit), hover = Math.sin(t * 1.3 + i * 1.7) * 8 * u;
        const ty = row.base - padH - row.r * 0.27 - ts * 0.5 - (vertical ? 30 : 60) * u + hover + (1 - q) * 50 * u - hit * 30 * u;
        const turn = 0.8 + 0.2 * Math.cos(t * 0.8 + i * 1.4);
        g.save();
        g.globalAlpha *= 0.3 + 0.7 * clamp(q * 1.6);
        g.translate(row.x, ty); g.scale(turn * (0.85 + 0.15 * q), 0.85 + 0.15 * q);
        const edge = (1 - turn) * ts * 0.6;
        rr(g, -ts / 2 + edge, -ts / 2, ts, ts, ts * 0.2); g.fillStyle = rgba(th.metalLit, 0.4); g.fill();
        rr(g, -ts / 2, -ts / 2, ts, ts, ts * 0.2);
        const tg = g.createLinearGradient(-ts / 2, -ts / 2, ts / 2, ts / 2);
        tg.addColorStop(0, rgba(mix(th.glass, WHITE, th.light ? 0.6 : 0.14))); tg.addColorStop(1, rgba(th.glass));
        g.fillStyle = tg; g.fill();
        g.lineWidth = 2 * u; g.strokeStyle = th.hi(0.35 + 0.4 * hit); g.stroke();
        if (hit > 0.01) { g.save(); g.globalCompositeOperation = th.add; g.lineWidth = 3 * u; g.strokeStyle = rgba(th.acc, hit); g.shadowColor = rgba(th.acc, hit); g.shadowBlur = 28 * u; g.stroke(); g.restore(); }
        g.save(); rr(g, -ts / 2, -ts / 2, ts, ts, ts * 0.2); g.clip(); sweep(g, th, -ts / 2, -ts / 2, ts, ts, t, 3.0, i * 0.6, 0.9); g.restore();
        stepIcon(g, S, th, Math.min(i, 2), ts * 0.78, t, mix(th.acc, th.acc2, i / Math.max(1, n - 1)), 0.55 + 0.45 * Math.max(hit, i === n - 1 ? 0.6 : 0));
        g.restore();
        row.tileTop = ty - ts / 2 * (0.85 + 0.15 * q);
        // Ripple when the pulse lands.
        if (hit > 0.05) {
          g.save(); g.globalCompositeOperation = th.add;
          g.beginPath(); g.ellipse(row.x, row.base, row.r * (1.1 + (1 - hit) * 0.6), row.r * 0.3 * (1.1 + (1 - hit) * 0.6), 0, 0, TAU);
          g.lineWidth = 2.5 * u; g.strokeStyle = rgba(th.acc, hit * 0.8); g.stroke(); g.restore();
        }
      });
    };
    rows.forEach((row, i) => {
      const hit = hitOf(i);
      pool(ctx, th, row.x, row.base, row.r * (2.2 + 0.8 * hit), row.r * (0.45 + 0.15 * hit), th.acc, 0.12 + 0.12 * stagger(p, i, n, 0.5) + 0.3 * hit);
      if (hit > 0.01 && !th.light) { // The spotlight on the lit step.
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        const g = ctx.createLinearGradient(0, 0, 0, row.base);
        g.addColorStop(0, rgba(mix(th.acc, WHITE, 0.6), 0.2 * hit)); g.addColorStop(1, rgba(th.acc, 0.05 * hit));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(row.x - 18 * u, -20 * u); ctx.lineTo(row.x + 18 * u, -20 * u); ctx.lineTo(row.x + row.r * 1.5, row.base); ctx.lineTo(row.x - row.r * 1.5, row.base); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    });
    reflect(ctx, S, th, vertical ? rows[n - 1].base : floor, solid);
    solid(ctx);
    rows.forEach((row, i) => {
      const q = seg(stagger(p, i, n, 0.5), 0.3, 1);
      if (q <= 0) return;
      const hit = hitOf(i), dim = 0.6 + 0.4 * Math.max(hit, 1 - on);
      ctx.save(); ctx.globalAlpha *= q;
      const num = String(i + 1).padStart(2, "0");
      if (vertical) {
        const lx = A.x + A.w * 0.52, maxW = A.x + A.w - lx;
        txt(ctx, S, num, lx, row.base - row.r * 0.9, 44 * u, { align: "left", fam: "figures", weight: 700, color: rgba(th.acc) });
        label(ctx, S, th, d.steps[i], lx, row.base - row.r * 0.9 + 64 * u, maxW, { align: "left", size: 48, color: rgba(th.ink, dim) });
      } else {
        txt(ctx, S, num, row.x, row.tileTop - 22 * u, (44 + 16 * hit) * u, { fam: "figures", weight: 700, color: rgba(mix(th.acc, WHITE, 0.4 * hit)), glow: hit > 0.05 && !th.light ? rgba(th.acc, hit) : undefined });
        label(ctx, S, th, d.steps[i], row.x, row.base + row.r * 0.27 + 60 * u, (A.w / n) * 0.94, { size: 48, color: rgba(th.ink, dim) });
      }
      ctx.restore();
    });
  }

  // ---- compare: a ghosted stack of every step against one lit platter --------------------------------
  // The first value stands as a tall stack of glass discs, one per step (a scan climbs it); the second is
  // a single breathing platter. A wide arc of light joins them, with discs riding it from stack to platter.
  function disc(ctx, S, th, cx, y, r, dh, a, glow) {
    const ry = r * 0.27;
    ctx.save();
    sidePath(ctx, cx, y + dh, y, r, ry);
    const sg = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
    sg.addColorStop(0, rgba(th.acc2, (th.light ? 0.2 : 0.08) * a)); sg.addColorStop(0.3, rgba(WHITE, (th.light ? 0.6 : 0.16) * a)); sg.addColorStop(1, rgba(th.acc2, (th.light ? 0.15 : 0.04) * a));
    ctx.fillStyle = sg; ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, y, r, ry, 0, 0, TAU);
    ctx.fillStyle = th.light ? rgba(th.glass, 0.6 * a) : rgba(mix(mix(th.glass, th.acc2, 0.12), WHITE, 0.1), 0.55 * a); ctx.fill();
    ctx.lineWidth = Math.max(1, 1.6 * S.u); ctx.strokeStyle = th.hi(0.5 * a); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, y + dh, r, ry, 0, 0, Math.PI); ctx.strokeStyle = th.hi(0.18 * a); ctx.stroke();
    if (glow > 0.01) {
      ctx.globalCompositeOperation = th.add;
      sidePath(ctx, cx, y + dh, y, r, ry);
      ctx.fillStyle = rgba(th.acc2, 0.45 * glow); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx, y, r, ry, 0, 0, TAU);
      ctx.lineWidth = 3 * S.u; ctx.strokeStyle = rgba(mix(th.acc2, WHITE, 0.4), glow); ctx.shadowColor = rgba(th.acc2, glow); ctx.shadowBlur = 16 * S.u; ctx.stroke();
    }
    ctx.restore();
  }
  function compareScene(ctx, S, th, A, p, d, t) {
    const u = S.u, floor = A.floor;
    const xs = [A.x + A.w * 0.28, A.x + A.w * 0.72];
    const r = Math.min(A.w * 0.15, 240 * u);
    const numSize = Math.min(170 * u, A.w * 0.17);
    const hMin = 50 * u, hMax = Math.max(hMin * 2, (floor - A.y) * (S.tall ? 0.86 : 1) - numSize - 40 * u);
    const big = Math.max(Math.abs(d.leftValue), Math.abs(d.rightValue), 1);
    const vals = [d.leftValue, d.rightValue], words = [d.left, d.right];
    const q = [stagger(p, 0, 2, 0.35), stagger(p, 1, 2, 0.35)];
    const hs = vals.map((v) => hMin + (hMax - hMin) * (Math.abs(v) / big));
    // The stack: one disc per step (at most 16), arriving bottom to top as the count runs.
    const N = Math.max(1, Math.min(16, Math.round(Math.abs(d.leftValue)) || 1));
    const base0 = 22 * u, pitch = (hs[0] - base0) / N, dh = Math.max(4 * u, pitch * 0.62);
    const shown = q[0] * N;
    const scan = fract(t / 1.8) * (N + 2) - 1;
    const topL = floor - base0 - pitch * Math.max(1, shown);
    // The platter breathes.
    const breathe = 1 + 0.035 * Math.sin(t * 2.4);
    const plinthH = Math.max(40 * u, hs[1] * q[1]);
    const topR = floor - plinthH;
    pool(ctx, th, xs[0], floor, r * 2.2, r * 0.4, th.acc2, 0.12);
    pool(ctx, th, xs[1], floor, r * 3 * breathe, r * 0.55, th.acc, 0.34 * (0.4 + 0.6 * q[1]));
    // The arc of light from the stack's top to the platter.
    const a0 = [xs[0] + r * 0.6, topL - r * 0.1], a1 = [xs[1] - r * 0.85, topR - r * 0.12];
    const cpx = (a0[0] + a1[0]) / 2, cpy = Math.min(a0[1], a1[1]) - Math.max(90 * u, (floor - A.y) * 0.22);
    const at = (f) => [(1 - f) * (1 - f) * a0[0] + 2 * (1 - f) * f * cpx + f * f * a1[0], (1 - f) * (1 - f) * a0[1] + 2 * (1 - f) * f * cpy + f * f * a1[1]];
    const arcOn = seg(p, 0.2, 0.7);
    ctx.save(); ctx.globalCompositeOperation = th.add;
    ctx.beginPath();
    for (let s = 0; s <= 48; s++) { const f = (s / 48) * arcOn, [x, y] = at(f); s ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.lineWidth = 16 * u; ctx.strokeStyle = rgba(th.acc, 0.08); ctx.stroke();
    ctx.lineWidth = 3 * u; ctx.strokeStyle = rgba(mix(th.acc, WHITE, 0.3), 0.55); ctx.shadowColor = rgba(th.acc); ctx.shadowBlur = 14 * u; ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.setLineDash([2 * u, 14 * u]); ctx.lineDashOffset = -t * 60 * u; ctx.lineWidth = 3 * u; ctx.strokeStyle = rgba(WHITE, 0.6 * arcOn); ctx.stroke(); ctx.setLineDash([]);
    // Discs ride the arc, shrinking into the platter.
    if (arcOn >= 1) {
      for (let k = 0; k < 4; k++) {
        const f = fract(t * 0.45 + k / 4), [x, y] = at(f), rr2 = r * (0.42 - 0.3 * f);
        ctx.beginPath(); ctx.ellipse(x, y, rr2, rr2 * 0.27, 0, 0, TAU);
        ctx.fillStyle = rgba(mix(th.acc2, th.acc, f), 0.3 * Math.sin(Math.PI * f)); ctx.fill();
        ctx.lineWidth = 2 * u; ctx.strokeStyle = rgba(mix(mix(th.acc2, th.acc, f), WHITE, 0.4), 0.9 * Math.sin(Math.PI * f)); ctx.stroke();
      }
    }
    // Chevrons along the floor between the two.
    const cy = floor - 20 * u, xa = xs[0] + r * 1.15, xb = xs[1] - r * 1.15;
    for (let c = 0; c < 6; c++) {
      const f = fract(t * 0.55 + c / 6), x = xa + (xb - xa) * f;
      ctx.beginPath(); ctx.moveTo(x - 14 * u, cy - 18 * u); ctx.lineTo(x + 6 * u, cy); ctx.lineTo(x - 14 * u, cy + 18 * u);
      ctx.lineWidth = 4 * u; ctx.strokeStyle = rgba(mix(th.acc, WHITE, 0.3), Math.sin(Math.PI * f) * 0.8 * clamp(p * 2)); ctx.stroke();
    }
    ctx.restore();
    const solid = (g) => {
      shadow(g, th, xs[0], floor, r * 1.3, r * 0.26);
      shadow(g, th, xs[1], floor, r * 1.3, r * 0.26);
      cylinder(g, S, th, xs[0], floor, r * 1.12, base0, { ring: 0.3, ringColor: th.acc2, t, offset: 0.2 });
      const full = Math.floor(shown), part = shown - full;
      for (let k = 0; k < Math.min(N, full + 1); k++) {
        const a = k < full ? 1 : part;
        if (a <= 0.01) continue;
        const y = floor - base0 - pitch * (k + 1) + (1 - a) * -30 * u;
        const glow = Math.max(0, 1 - Math.abs(scan - k)) * seg(p, 0.5, 0.8);
        disc(g, S, th, xs[0], y, r * 0.95, dh, (0.55 + 0.45 * a) * a, glow);
      }
      cylinder(g, S, th, xs[1], floor, r * 1.1, 26 * u, { ring: 0.9, t, offset: 1.1 });
      tube(g, S, th, xs[1], floor - 26 * u, r * 0.92, Math.max(10 * u, plinthH - 26 * u), 1, th.acc, t, 9, true);
      // The platter on top.
      const pr = r * 1.08 * breathe;
      cylinder(g, S, th, xs[1], topR, pr, 14 * u, { ring: 0.7 + 0.3 * Math.sin(t * 2.4), band: 0.8, t, offset: 0.4 });
    };
    reflect(ctx, S, th, floor, solid);
    solid(ctx);
    // A halo breathing over the platter, sparks lifting off it.
    ctx.save(); ctx.globalCompositeOperation = th.add;
    const hb = 0.5 + 0.5 * Math.sin(t * 2.4);
    ctx.beginPath(); ctx.ellipse(xs[1], topR - 14 * u, r * (1.25 + 0.15 * hb), r * 0.34 * (1.25 + 0.15 * hb), 0, 0, TAU);
    ctx.lineWidth = 3 * u; ctx.strokeStyle = rgba(th.acc, (0.3 + 0.4 * hb) * q[1]); ctx.shadowColor = rgba(th.acc); ctx.shadowBlur = 20 * u; ctx.stroke();
    ctx.shadowBlur = 0;
    const R = rng(31);
    for (let k = 0; k < 22; k++) {
      const ph = R(), sx = xs[1] + (R() * 2 - 1) * r * 0.9, sp = 0.35 + R() * 0.4;
      const f = fract(t * sp + ph), y = topR - 14 * u - f * 180 * u;
      ctx.beginPath(); ctx.arc(sx + Math.sin(t * 2 + k) * 8 * u, y, (1.5 + R() * 2.5) * u, 0, TAU);
      ctx.fillStyle = rgba(mix(th.acc, WHITE, 0.5), (1 - f) * 0.8 * q[1]); ctx.fill();
    }
    ctx.restore();
    const tops = [topL - r * 0.27, topR - 14 * u - r * 0.3];
    [0, 1].forEach((i) => {
      const s = fmt(vals[i] * q[i], d.prefix, d.suffix);
      const size = fitSize(ctx, S, s, numSize, A.w * 0.4, 96 * u, 700, "figures");
      figureText(ctx, S, th, s, xs[i], tops[i] - 26 * u - (i ? 6 * u * hb : 0), size, i === 1);
      label(ctx, S, th, words[i], xs[i], floor + r * 0.27 + 58 * u, A.w * 0.44, { size: 46, color: rgba(th.ink, i ? 1 : 0.72) });
    });
  }

  const SCENES = { chart: wrap(chartScene, "chart"), object: wrap(objectScene, "object"), people: wrap(peopleScene, "people"), process: wrap(processScene, "process"), compare: wrap(compareScene, "compare") };

  return {
    bg: "#0d0e12", panel: "#17181e", ink: "#f4f4f6", muted: "#8b8e99", accent: "#7f9cff", onAccent: "#0d0e12",
    rule: "rgba(244,244,246,0.14)", track: "rgba(244,244,246,0.07)",
    display: "'Avenir Next', Avenir, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif", displayWeight: 700, displayCase: "none", displayTracking: "-0.02em",
    body: "'Avenir Next', Avenir, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif", bodyWeight: 500,
    figures: "'Avenir Next', Avenir, 'Segoe UI', Arial, sans-serif", radius: 22, motion: "focus", kit: { line: 3, fill: "solid", panel: "fill" },
    palettes: {
      light: { bg: "#f6f6f8", panel: "#ffffff", ink: "#111216", muted: "#6b6e78", accent: "#3d5afe", onAccent: "#ffffff", rule: "rgba(17,18,22,0.14)", track: "rgba(17,18,22,0.06)",
        backdrop: (accent) => `radial-gradient(70% 60% at 82% 12%, ${hexA(accent, 0.12)} 0%, rgba(246,246,248,0) 70%), #f6f6f8` },
      dark: { bg: "#050507", backdrop: (accent) => `radial-gradient(60% 50% at 50% 0%, ${hexA(accent, 0.18)} 0%, rgba(5,5,7,0) 70%), #050507` },
      mono: { accent: "#f4f4f6", onAccent: "#0d0e12" },
    },
    backdrop: (accent) => `radial-gradient(70% 60% at 82% 12%, ${hexA(accent, 0.22)} 0%, rgba(13,14,18,0) 70%), radial-gradient(60% 50% at 10% 100%, ${hexA(accent, 0.10)} 0%, rgba(13,14,18,0) 70%), #0d0e12`,
    // On the illustrated stage only: headlines centred over the product, lit with a soft gradient.
    css: (accent, look) => {
      const R = "#root:has(> #art)";
      const ink = rgb(look.ink), light = lum(rgb(look.bg)) > 150, acc = rgb(accent);
      let s = `${R} #title-scene, ${R} #closing-scene { justify-content: flex-start; align-items: center; text-align: center; top: 10%; bottom: auto; }
        ${R} .scene:not(.statement) { align-items: center; text-align: center; }`;
      if (onStage()) {
        s += `${R} .display { background: linear-gradient(180deg, ${rgba(ink)} 35%, ${rgba(mix(ink, light ? [110, 114, 126] : [128, 132, 148], 0.6))} 100%);
            -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; text-shadow: none; padding-bottom: 0.08em; }
          ${R} .kicker { background: linear-gradient(90deg, ${rgba(acc)}, ${rgba(mix(shift(acc, -50), WHITE, 0.1))}); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; text-shadow: none; }`;
      }
      return s;
    },
    keepArt: true,
    overlap: true,
    stage(ctx, S, info) {
      const th = theme(S);
      const ids = shownIds();
      const prev = info.index > 0 ? ids[info.index - 1] : null;
      Object.assign(CUR, { index: info.index, scene: info.scene, local: info.local, change: info.change, t: info.t, hold: info.hold, next: info.next, prev });
      // The stage pans with the blade: one step of D per scene, continuous across each change.
      const bl = bladeNow(S);
      let camX = Math.max(0, info.index) * D(S);
      if (bl && CUR.index > 0 && info.local < info.change * 0.5) camX -= (1 - bl.g) * D(S);
      else if (bl) camX += bl.g * D(S);
      camX += info.t * S.W * 0.012;
      if (onStage()) backdrop(ctx, S, th, info, camX);
      // The next set is already standing right of the blade before the boundary.
      if (info.next && info.local > info.hold - info.change) {
        const nx = info.next, ni = { t: info.t, local: info.local - info.hold, hold: holdOf(nx), change: info.change, scene: nx, pre: true };
        if (nx === "closing") statement(ctx, S, th, ni);
        else if (SCENES[nx]) SCENES[nx](ctx, S, boxOf(S), 1, dataOf(nx), ni);
      }
      // The title has no drawer of its own, so its hero leaves from here as the next scene arrives.
      if (prev === "title" && info.local < info.change) {
        const hold = holdOf("title");
        statement(ctx, S, th, { scene: "title", t: info.t, local: hold + info.local, hold, change: info.change, exit: clamp(info.local / Math.max(0.01, info.change)) });
      }
      if (info.scene === "title" || info.scene === "closing") statement(ctx, S, th, info);
      // The finish goes on last: here, unless a scene drawer still runs after the stage this frame.
      const leaveRuns = prev && !isStatement(prev) && info.local < info.change;
      if (isStatement(info.scene) && !leaveRuns) fore(ctx, S, th);
    },
    scenes: SCENES,
  };
});
