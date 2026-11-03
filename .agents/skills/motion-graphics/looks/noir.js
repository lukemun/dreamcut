// Noir: a 1940s night world in silver monochrome. Every scene is a lit set: venetian-blind light bars
// falling across plaster, smoke drifting through the beams, rain, neon flicker and hard pools of lamp
// light. The data lives in the set itself (towers on a skyline, files on a desk, a line-up wall,
// lamplit street corners). Scenes change by snapping a set of blinds shut and open again. A film pass
// adds grain, gate weave, scratches, dust and flicker. All drawings are original; frames are pure
// functions of time (seeded noise only).
window.DreamcutMotion.register("noir", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const fr = (x) => x - Math.floor(x);
  const hs = (n) => fr(Math.sin(n * 127.1 + 311.7) * 43758.5453123);
  const DISP = "'Bodoni 72', 'Bodoni 72 Oldstyle', Didot, 'Bodoni MT', 'Playfair Display', Georgia, serif";
  const TYPE = "'American Typewriter', 'Courier Prime', 'Courier New', Courier, monospace";
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  const DRAWN = new Set(["chart", "object", "people", "process", "compare"]);
  const DEF_HOLDS = { title: 2.4, chart: 3.4, object: 3.6, people: 3.2, process: 3.6, compare: 3.2, closing: 2.4 };

  // ---- buffers and seeded textures ---------------------------------------------------------------
  const BUF = {};
  function buf(key, w, h) {
    let c = BUF[key];
    if (!c) c = BUF[key] = document.createElement("canvas");
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return c;
  }
  // Tileable value noise: drifting smoke, plaster mottling, cloud banks.
  let SMOKE = null;
  function smoke() {
    if (SMOKE) return SMOKE;
    const N = 256, c = document.createElement("canvas");
    c.width = c.height = N;
    const g = c.getContext("2d"), img = g.createImageData(N, N), r = rng(808), acc = new Float32Array(N * N);
    [[4, 0.45], [8, 0.3], [16, 0.17], [32, 0.08]].forEach(([cells, amp]) => {
      const grid = [];
      for (let i = 0; i < cells * cells; i++) grid.push(r());
      const at = (x, y) => grid[(((y % cells) + cells) % cells) * cells + (((x % cells) + cells) % cells)];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const fx = (x / N) * cells, fy = (y / N) * cells, x0 = Math.floor(fx), y0 = Math.floor(fy);
        let tx = fx - x0, ty = fy - y0;
        tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
        const a = at(x0, y0), b = at(x0 + 1, y0), c2 = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
        acc[y * N + x] += amp * ((a * (1 - tx) + b * tx) * (1 - ty) + (c2 * (1 - tx) + d * tx) * ty);
      }
    });
    for (let i = 0; i < N * N; i++) {
      const v = clamp((acc[i] - 0.25) / 0.5) * 255;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return (SMOKE = c);
  }
  let GRAINS = null;
  function grains() {
    if (GRAINS) return GRAINS;
    GRAINS = [];
    for (let k = 0; k < 4; k++) {
      const N = 256, c = document.createElement("canvas");
      c.width = c.height = N;
      const g = c.getContext("2d"), img = g.createImageData(N, N), r = rng(4100 + k * 77);
      for (let i = 0; i < N * N; i++) {
        const v = r(), dev = Math.abs(v - 0.5) * 2;
        const on = v > 0.5 ? 255 : 0;
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = on;
        img.data[i * 4 + 3] = Math.pow(dev, 1.6) * 64;
      }
      g.putImageData(img, 0, 0);
      GRAINS.push(c);
    }
    return GRAINS;
  }
  function smokePat(g, s, ox, oy) {
    const pat = g.createPattern(smoke(), "repeat");
    pat.setTransform(new DOMMatrix([s, 0, 0, s, ox, oy]));
    return pat;
  }

  // ---- tone ---------------------------------------------------------------------------------------
  const TONE = {
    lo: [6, 6, 8], hi: [244, 239, 228], amb: 0.24, lc: "255,249,236", haze: 0.36, light: false, contrast: 1.32, bright: 1.42,
    plate: "rgba(12,12,13,0.9)", plateEdge: "rgba(238,232,220,0.55)", paper: [228, 219, 198], paperInk: "#1c1915", veil: "0,0,0",
  };
  function frameOf(S, info, box) {
    const L = S.look, T = L.tone || TONE, { W, H, u, tall } = S;
    const side = (tall ? 90 : 140) * u;
    const b = box || (tall ? { x: side, y: H * 0.3, w: W - side * 2, h: H * 0.6 } : { x: side, y: H * 0.34, w: W - side * 2, h: H * 0.58 });
    const sh = (v, a = 1) => {
      const k = clamp(v);
      return `rgba(${(T.lo[0] + (T.hi[0] - T.lo[0]) * k) | 0},${(T.lo[1] + (T.hi[1] - T.lo[1]) * k) | 0},${(T.lo[2] + (T.hi[2] - T.lo[2]) * k) | 0},${a})`;
    };
    return {
      S, W, H, u, tall, box: b, T, sh, t: info.t, local: info.local, hold: info.hold || 1,
      lc: (a) => `rgba(${T.lc},${a})`, acc: (a = 1) => hexA(S.accent, a), ink: L.ink, mut: L.muted,
      paper: (k = 1, a = 1) => `rgba(${(T.paper[0] * k) | 0},${(T.paper[1] * k) | 0},${(T.paper[2] * k) | 0},${a})`,
      backdrop: Boolean(S.paint),
    };
  }
  const lb = (F, px) => `blur(${(px * F.u * 0.5).toFixed(2)}px)`;
  // The neon outside never quite holds steady.
  function neon(t) {
    const f = Math.floor(t * 12);
    const dip = hs(f * 0.37 + 2) > 0.92 ? 0.45 : hs(f * 0.11 + 9) > 0.96 ? 0.7 : 1;
    return dip * (0.93 + 0.07 * Math.sin(t * 3.1));
  }

  // ---- drawing helpers ----------------------------------------------------------------------------
  function rr(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function poly(g, pts) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); }
  function txt(g, s, x, y, size, o = {}) {
    s = String(s ?? "");
    if (o.upper) s = s.toUpperCase();
    if (!s) return { w: 0, size };
    const fam = o.font === "disp" ? DISP : TYPE, wt = o.weight || (o.font === "disp" ? 700 : 600);
    const set = (sz) => { g.font = `${o.italic ? "italic " : ""}${wt} ${sz}px ${fam}`; g.letterSpacing = (o.track || 0) * sz + "px"; };
    set(size);
    let w = g.measureText(s).width;
    if (o.maxW && w > o.maxW) {
      const ns = Math.max(o.min || size * 0.7, (size * o.maxW) / w);
      if (ns < size) { size = ns; set(size); w = g.measureText(s).width; }
    }
    if (o.measure) { g.letterSpacing = "0px"; return { w, size }; }
    g.save();
    g.textAlign = o.align || "left"; g.textBaseline = o.base || "alphabetic"; g.fillStyle = o.color || "#fff";
    if (o.glow) { g.shadowColor = o.glowColor || o.color; g.shadowBlur = o.glow; }
    if (o.shadow) { g.shadowColor = o.shadow; g.shadowBlur = o.shadowBlur ?? 10; g.shadowOffsetY = o.shadowY ?? 2; }
    g.fillText(s, x, y);
    g.restore();
    g.letterSpacing = "0px";
    return { w, size };
  }
  const fmt = (target, k, d) => {
    const dec = Math.abs((Number(target) || 0) % 1) > 0.001 ? 1 : 0;
    return window.DreamcutMotion.formatNumber(target * k, dec, (d && d.prefix) || "", (d && d.suffix) || "");
  };
  // Plaster or paper mottling from the smoke tile.
  function mottle(g, F, x, y, w, h, alpha, scale, ox = 0, oy = 0, mode = "overlay") {
    g.save();
    g.globalCompositeOperation = mode; g.globalAlpha = alpha;
    g.fillStyle = smokePat(g, scale * F.u, ox, oy);
    g.fillRect(x, y, w, h);
    g.restore();
  }
  function rain(g, F, o) {
    const { u, t } = F, slant = o.slant ?? 0.16;
    g.save();
    g.strokeStyle = F.T.light ? `rgba(30,30,30,${o.alpha})` : F.lc(o.alpha);
    g.lineWidth = (o.width ?? 1.5) * u; g.lineCap = "round";
    g.beginPath();
    for (let i = 0; i < o.n; i++) {
      const sd = i * 1.37 + (o.seed || 0);
      const sp = (o.speed ?? 1500) * u * (0.75 + 0.5 * hs(sd * 3.1));
      const len = (o.len ?? 38) * u * (0.6 + 0.8 * hs(sd * 5.7));
      const y0 = o.y + fr(hs(sd * 9.1) + (t * sp) / (o.h + len)) * (o.h + len) - len;
      const x0 = o.x + hs(sd * 1.7) * o.w + (y0 - o.y) * slant;
      g.moveTo(x0, y0); g.lineTo(x0 + slant * len, y0 + len);
    }
    g.stroke();
    g.restore();
  }
  // Dust motes turning in a beam.
  function motes(g, F, x, y, w, h, n, seed, alpha) {
    const { u, t } = F;
    g.save();
    g.fillStyle = F.lc(alpha);
    for (let i = 0; i < n; i++) {
      const sd = seed + i * 3.3;
      const px = x + fr(hs(sd) + t * 0.012 * (hs(sd + 1) - 0.4)) * w + Math.sin(t * 0.7 + sd) * 12 * u;
      const py = y + fr(hs(sd + 2) + t * 0.02 * (0.3 + hs(sd + 4))) * h;
      const r = (1 + hs(sd + 5) * 2.2) * u;
      g.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.3 + sd));
      g.beginPath(); g.arc(px, py, r, 0, TAU); g.fill();
    }
    g.restore();
  }

  // ---- light map helpers (drawn into the half-size light buffer, in full-size coordinates) ---------
  // Bars of light thrown through blinds, fading out toward the edge of the throw.
  function blinds(l, F, o) {
    const LBc = l.canvas, B = buf("BL", LBc.width, LBc.height), b = B.getContext("2d");
    b.setTransform(1, 0, 0, 1, 0, 0); b.globalCompositeOperation = "source-over"; b.filter = "none"; b.clearRect(0, 0, B.width, B.height);
    b.setTransform(0.5, 0, 0, 0.5, 0, 0);
    b.transform(1, o.slope || 0, o.skew || 0, 1, o.x, o.y);
    b.filter = lb(F, o.blur ?? 5);
    b.fillStyle = F.lc(o.power);
    b.beginPath();
    const P = o.period, h = P * (o.duty ?? 0.52), s0 = fr((o.shift || 0) / P) * P;
    for (let y = -P + s0; y < o.h; y += P) {
      const y0 = Math.max(0, y), y1 = Math.min(o.h, y + h);
      if (y1 > y0) b.rect(0, y0, o.w, y1 - y0);
    }
    b.fill();
    b.filter = "none"; b.globalCompositeOperation = "destination-in";
    b.translate(o.w / 2, o.h / 2); b.scale(o.w / 2, o.h / 2);
    const gr = b.createRadialGradient(0, 0, 0, 0, 0, 1);
    gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(o.core ?? 0.5, "rgba(0,0,0,1)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    b.fillStyle = gr; b.fillRect(-1.5, -1.5, 3, 3);
    l.save(); l.setTransform(1, 0, 0, 1, 0, 0); l.filter = "none"; l.drawImage(B, 0, 0); l.restore();
  }
  function pool(l, F, x, y, rx, ry, power, soft = 0.5) {
    if (power <= 0) return;
    l.save();
    l.translate(x, y); l.scale(1, ry / rx);
    const gr = l.createRadialGradient(0, 0, 0, 0, 0, rx);
    gr.addColorStop(0, F.lc(power)); gr.addColorStop(soft, F.lc(power * 0.6)); gr.addColorStop(1, F.lc(0));
    l.fillStyle = gr; l.fillRect(-rx, -rx, rx * 2, rx * 2);
    l.restore();
  }
  function cone(l, F, x, y, ang, spread, len, power, w0 = 0, blurPx = 16) {
    if (power <= 0) return;
    l.save();
    l.translate(x, y); l.rotate(ang);
    const gr = l.createLinearGradient(0, 0, len, 0);
    gr.addColorStop(0, F.lc(power)); gr.addColorStop(0.55, F.lc(power * 0.5)); gr.addColorStop(1, F.lc(0));
    l.fillStyle = gr; l.filter = lb(F, blurPx);
    const s = Math.tan(spread) * len;
    l.beginPath(); l.moveTo(0, -w0 / 2); l.lineTo(len, -s - w0 / 2); l.lineTo(len, s + w0 / 2); l.lineTo(0, w0 / 2); l.closePath(); l.fill();
    l.restore();
  }
  // Light blocked by something (a fan blade, a raindrop on the pane): paints ambient back over light.
  function shade(l, F, alpha) { return `rgba(${Math.round(F.T.amb * 255)},${Math.round(F.T.amb * 255)},${Math.round(F.T.amb * 255)},${alpha})`; }
  function rainShadows(l, F, x, y, w, h, n, seed) {
    const { u, t } = F;
    l.save(); l.globalCompositeOperation = "source-over";
    l.fillStyle = shade(l, F, 0.55);
    for (let i = 0; i < n; i++) {
      const sd = seed + i * 2.71;
      const px = x + hs(sd) * w, sp = 60 + hs(sd + 1) * 140;
      const py = y + fr(hs(sd + 2) + (t * sp * u) / h) * h;
      const r = (3 + hs(sd + 3) * 5) * u;
      l.beginPath(); l.ellipse(px, py, r * 0.8, r * 1.3, 0, 0, TAU); l.fill();
      l.fillRect(px - r * 0.25, py - r * 6, r * 0.5, r * 5.4);
    }
    l.restore();
  }

  // Pulls the light map back toward black: keeps type clear of light bars and crushes corners.
  function dark(l, F, x, y, rx, ry, alpha, soft = 0.55) {
    l.save(); l.globalCompositeOperation = "source-over"; l.filter = "none";
    l.translate(x, y); l.scale(1, ry / rx);
    const gr = l.createRadialGradient(0, 0, 0, 0, 0, rx);
    gr.addColorStop(0, `rgba(0,0,0,${alpha})`); gr.addColorStop(soft, `rgba(0,0,0,${alpha * 0.85})`); gr.addColorStop(1, "rgba(0,0,0,0)");
    l.fillStyle = gr; l.fillRect(-rx, -rx, rx * 2, rx * 2);
    l.restore();
  }
  // Headlights of a passing car: a band of blind-light that slides across the room every few seconds.
  function sweep(l, F, o) {
    // Two cars, half a period apart, so a band is always crossing somewhere.
    const { W, u, t } = F, per = o.period ?? 3.2;
    for (const off of [0, 0.5]) {
      const k = fr(t / per + (o.phase || 0) + off), env = Math.pow(Math.sin(Math.PI * k), 0.7) * (off ? 0.75 : 1);
      blinds(l, F, { x: lerp(o.x0 ?? -W * 0.55, o.x1 ?? W * 1.05, k), y: o.y, w: o.w ?? W * 0.5, h: o.h, slope: o.slope ?? 0.22, skew: o.skew ?? -0.35, period: o.p ?? 58 * u, duty: 0.46, power: (o.power ?? 0.55) * env, blur: 4, core: 0.25 });
    }
  }
  // A cigarette's smoke: two ribbons curling up from (x, y), redrawn from time alone.
  function smokeCurl(g, F, x, y, hgt, alpha, seed = 0) {
    const { u, t } = F;
    g.save(); g.lineCap = "round"; g.filter = `blur(${3 * u}px)`;
    for (let k = 0; k < 3; k++) {
      const ph = t * (1.1 + k * 0.23) + seed + k * 2.4;
      g.strokeStyle = F.lc(alpha * (0.9 - k * 0.22)); g.lineWidth = (5 - k) * u;
      g.beginPath();
      for (let s = 0; s <= 36; s++) {
        const q = s / 36, yy = y - q * hgt;
        const xx = x + Math.sin(q * 7 - ph) * (4 + q * q * 46) * u + Math.sin(q * 3.1 + ph * 0.4 + k) * q * 30 * u + q * 26 * u * Math.sin(t * 0.3 + seed);
        if (s) g.lineTo(xx, yy); else g.moveTo(xx, yy);
      }
      g.stroke();
    }
    g.restore();
  }

  // ---- render pipeline: set → light map → multiply → haze → emissive / labels ----------------------
  function render(F, def, p, d, info) {
    const { W, H } = F;
    const A = buf("A", W, H), g = A.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.filter = "none";
    g.clearRect(0, 0, W, H);
    const st = def.set(g, F, p, d, info) || {};
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.filter = "none";
    const LB = buf("L", W / 2, H / 2), l = LB.getContext("2d");
    l.setTransform(1, 0, 0, 1, 0, 0); l.globalCompositeOperation = "source-over"; l.filter = "none"; l.globalAlpha = 1;
    const a8 = Math.round(F.T.amb * 255);
    l.fillStyle = `rgb(${a8},${a8},${a8})`; l.fillRect(0, 0, LB.width, LB.height);
    l.setTransform(0.5, 0, 0, 0.5, 0, 0); l.globalCompositeOperation = "lighter";
    def.light(l, F, p, d, info, st);
    l.setTransform(1, 0, 0, 1, 0, 0); l.globalCompositeOperation = "source-over"; l.filter = "none"; l.globalAlpha = 1;
    let keep = null;
    if (!F.backdrop) { keep = buf("K", W, H); const k = keep.getContext("2d"); k.clearRect(0, 0, W, H); k.drawImage(A, 0, 0); }
    g.globalCompositeOperation = "multiply"; g.drawImage(LB, 0, 0, W, H);
    // Smoke caught in the beams: the light above ambient, broken up by two drifting noise layers.
    const hz = F.T.haze * (st.haze ?? 1) * (F.S.look.texture ?? 1);
    if (hz > 0) {
      const HZ = buf("Z", LB.width, LB.height), z = HZ.getContext("2d");
      z.setTransform(1, 0, 0, 1, 0, 0); z.globalCompositeOperation = "source-over"; z.clearRect(0, 0, HZ.width, HZ.height);
      z.drawImage(LB, 0, 0);
      // Only light above ambient catches the smoke: max(light, ambient) − ambient.
      z.fillStyle = `rgb(${a8},${a8},${a8})`;
      z.globalCompositeOperation = "lighten"; z.fillRect(0, 0, HZ.width, HZ.height);
      z.globalCompositeOperation = "difference"; z.fillRect(0, 0, HZ.width, HZ.height);
      z.globalCompositeOperation = "multiply";
      z.fillStyle = smokePat(z, 2.6 * F.u, F.t * 34 * F.u, -F.t * 10 * F.u); z.fillRect(0, 0, HZ.width, HZ.height);
      z.fillStyle = smokePat(z, 1.4 * F.u, -F.t * 52 * F.u + 90, F.t * 14 * F.u + 40); z.fillRect(0, 0, HZ.width, HZ.height);
      g.globalCompositeOperation = "screen"; g.globalAlpha = clamp(hz);
      g.drawImage(HZ, 0, 0, W, H);
      g.globalAlpha = 1;
    }
    if (keep) { g.globalCompositeOperation = "destination-in"; g.drawImage(keep, 0, 0); }
    g.globalCompositeOperation = "source-over";
    if (def.over) def.over(g, F, p, d, info, st);
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.filter = "none"; g.globalCompositeOperation = "source-over";
    return A;
  }
  // The blinds transition: horizontal slats that snap open on the incoming set (or shut on the outgoing).
  function slats(g, F, k) {
    const { W, H, u } = F, P = (F.tall ? 66 : 60) * u, R = Math.hypot(W, H) / 2 + P;
    g.save(); g.translate(W / 2, H / 2); g.rotate(-0.07);
    g.beginPath();
    for (let y = -R; y < R; y += P) { const h = P * k; g.rect(-R, y + (P - h) / 2, R * 2, h); }
    g.restore();
  }
  function put(ctx, F, A, mode, k, cam) {
    const { W, H } = F;
    let src = A;
    if (mode) {
      const T = buf("T", W, H), t = T.getContext("2d");
      t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = "source-over"; t.clearRect(0, 0, W, H);
      t.drawImage(A, 0, 0);
      t.globalCompositeOperation = mode === "in" ? "destination-in" : "destination-out";
      t.fillStyle = "#000"; slats(t, F, k); t.fill();
      t.globalCompositeOperation = "source-over";
      src = T;
    }
    ctx.save();
    ctx.translate(W / 2 + cam.x, H / 2 + cam.y); ctx.scale(cam.s, cam.s); ctx.translate(-W / 2, -H / 2);
    ctx.filter = `brightness(${F.T.bright ?? 1.4}) contrast(${F.T.contrast ?? 1.3})`;
    ctx.drawImage(src, 0, 0);
    ctx.filter = "none";
    ctx.restore();
    if (mode && k > 0 && k < 1) {
      // Light catching the slat edges as they turn.
      const P = (F.tall ? 66 : 60) * F.u, R = Math.hypot(W, H) / 2 + P, edge = Math.sin(Math.PI * k);
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-0.07);
      ctx.fillStyle = F.lc(0.5 * edge);
      for (let y = -R; y < R; y += P) {
        const h = P * (mode === "in" ? k : k);
        ctx.fillRect(-R, y + (P - h) / 2 - 2 * F.u, R * 2, 2.5 * F.u);
        ctx.fillRect(-R, y + (P + h) / 2, R * 2, 1.5 * F.u);
      }
      ctx.restore();
    }
  }
  const camOf = (F, info, push = 0.09, dir = 1) => {
    const e = clamp(info.local / Math.max(0.2, info.hold), 0, 1.3);
    return { s: 1.025 + push * e, x: (0.5 - e) * 70 * F.u * dir, y: (e - 0.5) * 16 * F.u };
  };

  // ---- worlds -------------------------------------------------------------------------------------
  // A wall with a crown, a chair rail and panelled wainscot.
  function wall(g, F, rail, floor, base = 0.5) {
    const { W, H, u } = F;
    g.fillStyle = F.sh(base); g.fillRect(0, 0, W, H);
    mottle(g, F, 0, 0, W, H, 0.5, 3.4, 0, 0, "overlay");
    g.fillStyle = F.sh(base * 0.66); g.fillRect(0, 0, W, 24 * u);
    g.fillStyle = F.sh(base * 1.25); g.fillRect(0, 24 * u, W, 4 * u);
    if (rail < floor) {
      g.fillStyle = F.sh(base * 0.78); g.fillRect(0, rail, W, floor - rail);
      g.fillStyle = F.sh(base * 1.3); g.fillRect(0, rail, W, 6 * u);
      g.fillStyle = F.sh(base * 0.5); g.fillRect(0, rail + 6 * u, W, 5 * u);
      const pw = 250 * u, ph = floor - rail - 70 * u;
      for (let x = 34 * u; x < W; x += pw + 34 * u) {
        g.lineWidth = 3 * u;
        g.strokeStyle = F.sh(base * 0.45); g.strokeRect(x + 2 * u, rail + 38 * u, pw, ph);
        g.strokeStyle = F.sh(base * 1.15); g.strokeRect(x, rail + 36 * u, pw, ph);
      }
    }
    g.fillStyle = F.sh(0.2); g.fillRect(0, floor, W, H - floor);
    g.fillStyle = F.sh(0.34); g.fillRect(0, floor, W, 18 * u);
    g.fillStyle = F.sh(0.6); g.fillRect(0, floor, W, 3 * u);
    g.strokeStyle = F.sh(0.14); g.lineWidth = 2 * u;
    g.beginPath();
    for (let x = -H; x < W; x += 120 * u) { g.moveTo(x, H); g.lineTo(x + (H - floor) * 1.4, floor + 18 * u); }
    g.stroke();
  }

  // Title: the office. Blind light rakes across the wall, a fan turns in the beams, a frosted door glows
  // from the corridor and someone passes behind the glass.
  function doorOf(F) {
    const { W, H, tall } = F;
    const floor = H * (tall ? 0.94 : 0.92);
    return tall ? { x: W * 0.6, y: H * 0.64, w: W * 0.48, h: floor - H * 0.64, floor } : { x: W * 0.8, y: H * 0.15, w: W * 0.17, h: floor - H * 0.15, floor };
  }
  const office = {
    set(g, F) {
      const { W, H, u, t, tall } = F, D = doorOf(F), rail = H * (tall ? 0.8 : 0.7);
      wall(g, F, rail, D.floor, 0.52);
      // Filing cabinet with a stack of folders on top.
      const cx = tall ? W * 0.04 : W * 0.03, cw = tall ? W * 0.26 : W * 0.12, ctop = tall ? H * 0.74 : H * 0.56;
      g.fillStyle = F.sh(0.42); g.fillRect(cx, ctop, cw, D.floor - ctop);
      g.fillStyle = F.sh(0.62); g.fillRect(cx, ctop, cw, 6 * u);
      const dh = (D.floor - ctop - 20 * u) / 3;
      for (let i = 0; i < 3; i++) {
        const y = ctop + 14 * u + i * dh;
        g.strokeStyle = F.sh(0.28); g.lineWidth = 3 * u; g.strokeRect(cx + 12 * u, y, cw - 24 * u, dh - 10 * u);
        g.fillStyle = F.sh(0.7); g.fillRect(cx + cw / 2 - 30 * u, y + dh * 0.32, 60 * u, 10 * u);
        g.fillStyle = F.sh(0.82); g.fillRect(cx + cw / 2 - 22 * u, y + dh * 0.14, 44 * u, 20 * u);
      }
      for (let i = 0; i < 4; i++) { g.fillStyle = F.sh(i % 2 ? 0.66 : 0.5); g.fillRect(cx + 16 * u + i * 3 * u, ctop - (i + 1) * 13 * u, cw * 0.7, 12 * u); }
      // Wall clock with a ticking second hand.
      const ck = tall ? { x: W * 0.8, y: H * 0.2, r: 70 * u } : { x: W * 0.64, y: H * 0.16, r: 64 * u };
      g.fillStyle = F.sh(0.25); g.beginPath(); g.arc(ck.x, ck.y, ck.r + 8 * u, 0, TAU); g.fill();
      g.fillStyle = F.sh(0.86); g.beginPath(); g.arc(ck.x, ck.y, ck.r, 0, TAU); g.fill();
      g.strokeStyle = F.sh(0.2);
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; g.lineWidth = (i % 3 ? 2 : 4) * u; g.beginPath(); g.moveTo(ck.x + Math.cos(a) * ck.r * 0.8, ck.y + Math.sin(a) * ck.r * 0.8); g.lineTo(ck.x + Math.cos(a) * ck.r * 0.94, ck.y + Math.sin(a) * ck.r * 0.94); g.stroke(); }
      const hand = (a, len, w) => { g.lineWidth = w; g.beginPath(); g.moveTo(ck.x, ck.y); g.lineTo(ck.x + Math.cos(a) * len, ck.y + Math.sin(a) * len); g.stroke(); };
      const sec = Math.floor(t) + eo(fr(t) * 6);
      hand(-Math.PI / 2 + (11.2 / 12) * TAU, ck.r * 0.5, 5 * u);
      hand(-Math.PI / 2 + (47 + t / 60) / 60 * TAU, ck.r * 0.72, 3.5 * u);
      g.strokeStyle = F.sh(0.05); hand(-Math.PI / 2 + (sec / 60) * TAU, ck.r * 0.84, 1.6 * u);
      // The door: frame, lower panel, glass (glass glows in the emissive pass).
      g.fillStyle = F.sh(0.24); g.fillRect(D.x - 18 * u, D.y - 18 * u, D.w + 36 * u, D.h + 18 * u);
      g.fillStyle = F.sh(0.36); g.fillRect(D.x, D.y, D.w, D.h);
      const gy = D.y + D.h * 0.07, gh = D.h * (tall ? 0.5 : 0.42);
      g.strokeStyle = F.sh(0.22); g.lineWidth = 4 * u; g.strokeRect(D.x + D.w * 0.12, gy + gh + D.h * 0.08, D.w * 0.76, D.h * 0.32);
      g.fillStyle = F.sh(0.8); g.beginPath(); g.arc(D.x + D.w * 0.86, gy + gh + D.h * 0.06, 9 * u, 0, TAU); g.fill();
      // A coat stand by the door: trench coat and hat, still swaying from whoever hung them up.
      const cs = tall ? { x: W * 0.45, top: H * 0.68 } : { x: W * 0.742, top: H * 0.3 }, ch = D.floor - cs.top;
      g.fillStyle = F.sh(0.18);
      g.fillRect(cs.x - 5 * u, cs.top, 10 * u, ch);
      poly(g, [[cs.x - 70 * u, D.floor], [cs.x, D.floor - 50 * u], [cs.x + 70 * u, D.floor], [cs.x + 58 * u, D.floor], [cs.x, D.floor - 34 * u], [cs.x - 58 * u, D.floor]]); g.fill();
      g.lineWidth = 6 * u; g.strokeStyle = F.sh(0.18); g.lineCap = "round";
      g.beginPath(); g.moveTo(cs.x, cs.top + 20 * u); g.quadraticCurveTo(cs.x - 40 * u, cs.top + 10 * u, cs.x - 44 * u, cs.top - 12 * u); g.moveTo(cs.x, cs.top + 20 * u); g.quadraticCurveTo(cs.x + 40 * u, cs.top + 10 * u, cs.x + 44 * u, cs.top - 12 * u); g.stroke();
      const sw = Math.sin(t * 1.6) * 0.035 * Math.exp(-t * 0.05) + Math.sin(t * 0.9 + 1) * 0.012;
      g.save(); g.translate(cs.x + 30 * u, cs.top + 18 * u); g.rotate(sw);
      const cl = Math.min(ch * 0.62, 420 * u), cwid = cl * 0.36;
      poly(g, [[-cwid * 0.22, 0], [cwid * 0.22, 0], [cwid * 0.5, cl * 0.25], [cwid * 0.62, cl], [-cwid * 0.5, cl], [-cwid * 0.42, cl * 0.25]]);
      g.fillStyle = F.sh(0.3); g.fill();
      g.strokeStyle = F.sh(0.16); g.lineWidth = 4 * u;
      g.beginPath(); g.moveTo(0, cl * 0.06); g.lineTo(cwid * 0.08, cl); g.moveTo(-cwid * 0.46, cl * 0.42); g.lineTo(cwid * 0.56, cl * 0.42); g.stroke();
      g.fillStyle = F.sh(0.55); for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(cwid * 0.16, cl * (0.2 + i * 0.1), 5 * u, 0, TAU); g.fill(); }
      poly(g, [[-cwid * 0.22, 0], [0, cl * 0.14], [cwid * 0.22, 0], [cwid * 0.1, cl * 0.2], [-cwid * 0.1, cl * 0.2]]); g.fillStyle = F.sh(0.2); g.fill();
      g.restore();
      // The hat, brim tipped.
      g.save(); g.translate(cs.x - 30 * u, cs.top - 6 * u); g.rotate(-0.12 + sw * 0.5);
      g.fillStyle = F.sh(0.14);
      g.beginPath(); g.ellipse(0, 0, 78 * u, 14 * u, 0, 0, TAU); g.fill();
      g.beginPath(); g.moveTo(-46 * u, -2 * u); g.quadraticCurveTo(-50 * u, -60 * u, -10 * u, -58 * u); g.quadraticCurveTo(0, -48 * u, 10 * u, -58 * u); g.quadraticCurveTo(50 * u, -60 * u, 46 * u, -2 * u); g.closePath(); g.fill();
      g.fillStyle = F.sh(0.42); g.fillRect(-46 * u, -16 * u, 92 * u, 10 * u);
      g.restore();
      // An ashtray on the cabinet, a cigarette burning down in it.
      const ash = tall ? { x: cx + cw * 0.72, y: ctop - 4 * u } : { x: W * 0.6, y: H * 0.8 };
      if (!tall) {
        g.fillStyle = F.sh(0.16); g.fillRect(ash.x - 5 * u, ash.y, 10 * u, D.floor - ash.y);
        g.beginPath(); g.ellipse(ash.x, D.floor - 4 * u, 46 * u, 10 * u, 0, 0, TAU); g.fill();
        g.fillStyle = F.sh(0.5); g.fillRect(ash.x - 30 * u, ash.y + 4 * u, 60 * u, 8 * u);
      }
      g.fillStyle = F.sh(0.62); g.beginPath(); g.ellipse(ash.x, ash.y, 40 * u, 10 * u, 0, 0, TAU); g.fill();
      g.fillStyle = F.sh(0.2); g.beginPath(); g.ellipse(ash.x, ash.y - 2 * u, 28 * u, 6 * u, 0, 0, TAU); g.fill();
      g.fillStyle = F.sh(0.9); g.fillRect(ash.x + 8 * u, ash.y - 9 * u, 44 * u, 6 * u);
      return { glass: { x: D.x + D.w * 0.1, y: gy, w: D.w * 0.8, h: gh }, D, ck, cs, ash: { x: ash.x + 54 * u, y: ash.y - 6 * u } };
    },
    light(l, F, p, d, info, st) {
      const { W, H, u, t, tall } = F;
      const n = neon(t);
      blinds(l, F, tall
        ? { x: -W * 0.2, y: H * 0.08, w: W * 1.3, h: H * 0.62, slope: 0.3, skew: -0.2, period: 62 * u, duty: 0.5, power: 0.78 * n, shift: Math.sin(t * 0.3) * 8 * u }
        : { x: -W * 0.1, y: H * 0.02, w: W * 0.86, h: H * 0.86, slope: 0.3, skew: -0.32, period: 66 * u, duty: 0.5, power: 0.8 * n, shift: Math.sin(t * 0.3) * 8 * u });
      // The fan above throws turning blade shadows through the bars.
      const fc = tall ? { x: W * 0.4, y: H * 0.3 } : { x: W * 0.34, y: H * 0.3 }, fl = (tall ? 0.42 : 0.36) * H;
      l.save(); l.globalCompositeOperation = "source-over"; l.filter = lb(F, 18); l.fillStyle = shade(l, F, 0.7);
      for (let k = 0; k < 3; k++) {
        const a = t * 1.25 + (k * TAU) / 3;
        l.save(); l.translate(fc.x, fc.y); l.rotate(a); l.scale(1, 0.55);
        l.beginPath(); l.ellipse(fl * 0.55, 0, fl * 0.48, fl * 0.09, 0, 0, TAU); l.fill();
        l.restore();
      }
      l.restore();
      sweep(l, F, { y: H * 0.05, h: H * 0.85, power: 0.85, period: 2.8, phase: 0.55 });
      rainShadows(l, F, 0, 0, W * 0.8, H * 0.85, 26, 11);
      // The headline sits in shadow: no bars across the letters.
      if (!tall) dark(l, F, W * 0.3, H * 0.5, W * 0.48, H * 0.27, 0.97, 0.62);
      else dark(l, F, W * 0.5, H * 0.42, W * 0.6, H * 0.16, 0.92, 0.6);
      // Corridor light through the frosted glass.
      const gl = st.glass;
      pool(l, F, gl.x + gl.w / 2, gl.y + gl.h / 2, gl.w * 1.6, gl.h * 1.1, 0.35);
      pool(l, F, gl.x + gl.w / 2, st.D.floor + 20 * u, gl.w * 1.8, 60 * u, 0.4);
      pool(l, F, st.ck.x, st.ck.y, st.ck.r * 3, st.ck.r * 3, 0.4);
      // Spill from the corridor catches the coat and hat.
      pool(l, F, st.cs.x + 40 * u, st.cs.top + 160 * u, 230 * u, 360 * u, 0.55 * (0.92 + 0.08 * Math.sin(t * 7.3)));
    },
    over(g, F, p, d, info, st) {
      const { u, t } = F, gl = st.glass;
      g.save();
      rr(g, gl.x, gl.y, gl.w, gl.h, 3 * u); g.clip();
      const glow = g.createRadialGradient(gl.x + gl.w * 0.5, gl.y + gl.h * 0.45, 0, gl.x + gl.w * 0.5, gl.y + gl.h * 0.5, gl.h * 0.8);
      const fl = 0.92 + 0.08 * Math.sin(t * 7.3) * (hs(Math.floor(t * 5)) > 0.8 ? 1 : 0.2);
      glow.addColorStop(0, F.sh(0.95 * fl)); glow.addColorStop(1, F.sh(0.62 * fl));
      g.fillStyle = glow; g.fillRect(gl.x, gl.y, gl.w, gl.h);
      mottle(g, F, gl.x, gl.y, gl.w, gl.h, 0.35, 0.9, 0, 0, "multiply");
      // Someone walks past in the corridor.
      const cyc = 6.5, k = fr(t / cyc + 0.62);
      const sx = gl.x - gl.w * 0.4 + k * gl.w * 1.8, sy = gl.y + gl.h * 0.5;
      g.filter = `blur(${10 * u}px)`; g.fillStyle = F.sh(0.25, 0.75);
      g.beginPath(); g.ellipse(sx, sy - gl.h * 0.12, gl.w * 0.09, gl.w * 0.11, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(sx, sy + gl.h * 0.35, gl.w * 0.22, gl.h * 0.32, 0, 0, TAU); g.fill();
      g.filter = "none";
      // Lettering on the glass, read from inside the office (mirrored).
      g.translate(gl.x + gl.w / 2, gl.y + gl.h * 0.3); g.scale(-1, 1);
      txt(g, "DREAMCUT", 0, 0, gl.w * 0.15, { font: "disp", align: "center", base: "middle", color: F.sh(0.12, 0.85), track: 0.12, maxW: gl.w * 0.86 });
      txt(g, "EDITING ROOM", 0, gl.w * 0.15, 30 * u, { align: "center", base: "middle", color: F.sh(0.12, 0.8), track: 0.2, maxW: gl.w * 0.8 });
      g.restore();
      smokeCurl(g, F, st.ash.x, st.ash.y, F.tall ? 220 * u : 150 * u, 0.42, 1.3);
      g.save(); g.fillStyle = F.lc(0.6 + 0.4 * Math.abs(Math.sin(t * 2.1))); g.shadowColor = F.lc(1); g.shadowBlur = 12 * u;
      g.beginPath(); g.arc(st.ash.x - 2 * u, st.ash.y + 3 * u, 3.5 * u, 0, TAU); g.fill(); g.restore();
      motes(g, F, 0, 0, F.W * 0.75, F.H * 0.85, 40, 3, 0.55);
    },
  };

  // Closing: the window itself. Slats tilt slowly over a wet city; a hotel sign buzzes outside.
  function windowOf(F) {
    const { W, H, tall } = F;
    return tall ? { x: W * 0.12, y: H * 0.635, w: W * 0.76, h: H * 0.135 } : { x: W * 0.46, y: H * 0.06, w: W * 0.48, h: H * 0.32 };
  }
  const windowWorld = {
    set(g, F) {
      const { W, H, u, t, tall } = F, R = windowOf(F);
      wall(g, F, H * 2, H * (tall ? 0.95 : 0.93), 0.4);
      // Outside.
      g.save(); g.beginPath(); g.rect(R.x, R.y, R.w, R.h); g.clip();
      const sky = g.createLinearGradient(0, R.y, 0, R.y + R.h);
      sky.addColorStop(0, F.sh(0.12)); sky.addColorStop(1, F.sh(0.34));
      g.fillStyle = sky; g.fillRect(R.x, R.y, R.w, R.h);
      mottle(g, F, R.x, R.y, R.w, R.h, 0.4, 3, t * 10 * u, 0, "overlay");
      const r = rng(77);
      let x = R.x - 10 * u;
      const wins = [];
      while (x < R.x + R.w) {
        const bw = (40 + r() * 70) * u, bh = R.h * (0.25 + r() * 0.55), top = R.y + R.h - bh;
        g.fillStyle = F.sh(0.05 + r() * 0.08); g.fillRect(x, top, bw, bh);
        if (r() > 0.6) g.fillRect(x + bw * 0.4, top - 30 * u, 3 * u, 30 * u);
        for (let wy = top + 12 * u; wy < R.y + R.h - 8 * u; wy += 18 * u) for (let wx = x + 8 * u; wx < x + bw - 10 * u; wx += 14 * u) if (r() > 0.72) wins.push([wx, wy]);
        x += bw + r() * 6 * u;
      }
      g.fillStyle = F.sh(0.85);
      for (const [wx, wy] of wins) { if (hs(wx * 0.13 + wy + Math.floor(t * 0.5 + hs(wx) * 4)) > 0.25) g.fillRect(wx, wy, 6 * u, 8 * u); }
      g.restore();
      // Frame and mullion.
      g.strokeStyle = F.sh(0.26); g.lineWidth = 22 * u; g.strokeRect(R.x, R.y, R.w, R.h);
      g.fillStyle = F.sh(0.26); g.fillRect(R.x + R.w / 2 - 7 * u, R.y, 14 * u, R.h);
      g.fillStyle = F.sh(0.62); g.fillRect(R.x - 34 * u, R.y + R.h + 10 * u, R.w + 68 * u, 16 * u);
      g.fillStyle = F.sh(0.3); g.fillRect(R.x - 26 * u, R.y + R.h + 26 * u, R.w + 52 * u, 10 * u);
      // Slats, tilting slowly.
      const n = Math.round(R.h / (tall ? 34 : 42) / u), P = R.h / n;
      const tilt = 0.5 + 0.32 * Math.sin(t * 0.55 + 0.6);
      for (let i = 0; i < n; i++) {
        const y = R.y + i * P, th = P * (0.18 + 0.6 * tilt);
        g.fillStyle = F.sh(0.2); g.fillRect(R.x - 6 * u, y, R.w + 12 * u, th);
        g.fillStyle = F.sh(0.55); g.fillRect(R.x - 6 * u, y + th - 2 * u, R.w + 12 * u, 2 * u);
      }
      g.fillStyle = F.sh(0.18); g.fillRect(R.x - 14 * u, R.y - 26 * u, R.w + 28 * u, 26 * u);
      g.strokeStyle = F.sh(0.5); g.lineWidth = 1.5 * u;
      g.beginPath(); for (const fx of [0.25, 0.75]) { g.moveTo(R.x + R.w * fx, R.y); g.lineTo(R.x + R.w * fx, R.y + R.h); } g.stroke();
      const pull = R.x + R.w * 0.92 + Math.sin(t * 0.8) * 3 * u;
      g.beginPath(); g.moveTo(R.x + R.w * 0.92, R.y); g.lineTo(pull, R.y + R.h * 0.8); g.stroke();
      g.fillStyle = F.sh(0.6); g.beginPath(); g.ellipse(pull, R.y + R.h * 0.8 + 10 * u, 5 * u, 10 * u, 0, 0, TAU); g.fill();
      // Desk edge and a typewriter in the foreground.
      const dy = tall ? H * 0.9 : H * 0.84;
      g.fillStyle = F.sh(0.16); g.fillRect(0, dy, W, H - dy);
      g.fillStyle = F.sh(0.5); g.fillRect(0, dy, W, 4 * u);
      const tx = tall ? W * 0.5 : W * 0.73, tw = (tall ? 360 : 400) * u;
      poly(g, [[tx - tw / 2, dy], [tx - tw * 0.44, dy - 90 * u], [tx + tw * 0.44, dy - 90 * u], [tx + tw / 2, dy]]);
      g.fillStyle = F.sh(0.12); g.fill();
      rr(g, tx - tw * 0.42, dy - 128 * u, tw * 0.84, 34 * u, 14 * u); g.fill();
      g.fillStyle = F.sh(0.9); g.fillRect(tx - tw * 0.28, dy - 230 * u, tw * 0.56, 110 * u);
      g.fillStyle = F.sh(0.3);
      for (let i = 0; i < 4; i++) g.fillRect(tx - tw * 0.22, dy - 210 * u + i * 20 * u, tw * (0.3 + 0.12 * hs(i)), 5 * u);
      g.fillStyle = F.sh(0.45);
      for (let row = 0; row < 3; row++) for (let k = 0; k < 9; k++) { g.beginPath(); g.arc(tx - tw * 0.34 + k * tw * 0.085 + row * 8 * u, dy - 70 * u + row * 22 * u, 7 * u, 0, TAU); g.fill(); }
      return { R, dy, tilt };
    },
    light(l, F, p, d, info, st) {
      const { W, H, u, t, tall } = F, R = st.R, n = neon(t);
      l.fillStyle = F.lc(0.85); l.fillRect(R.x, R.y, R.w, R.h);
      pool(l, F, R.x + R.w / 2, R.y + R.h / 2, R.w * 0.9, R.h * 0.8, 0.32);
      const duty = clamp(1 - (0.18 + 0.6 * st.tilt) * 0.95, 0.15, 0.85);
      blinds(l, F, tall
        ? { x: -W * 0.2, y: H * 0.1, w: W * 1.4, h: H * 0.46, slope: -0.18, skew: 0.5, period: 70 * u, duty, power: 0.62 * n }
        : { x: W * 0.02, y: H * 0.34, w: W * 0.82, h: H * 0.66, slope: 0.1, skew: -0.55, period: 74 * u, duty, power: 0.62 * n });
      sweep(l, F, { y: tall ? H * 0.1 : H * 0.36, h: tall ? H * 0.5 : H * 0.62, power: 0.5, period: 2.9, phase: 0.35, slope: 0.1, skew: -0.5 });
      rainShadows(l, F, tall ? 0 : W * 0.05, tall ? H * 0.1 : H * 0.36, tall ? W : W * 0.75, tall ? H * 0.46 : H * 0.6, 22, 41);
      pool(l, F, tall ? W * 0.5 : W * 0.73, st.dy - 150 * u, 380 * u, 140 * u, 0.4);
    },
    over(g, F, p, d, info, st) {
      const { u, t, tall } = F, R = st.R;
      // Hotel sign outside: vertical letters, one tube failing.
      const sx = R.x + R.w * (tall ? 0.84 : 0.8), sy = R.y + R.h * 0.12, sz = (tall ? 34 : 44) * u;
      const letters = "HOTEL".split("");
      g.save(); g.beginPath(); g.rect(R.x, R.y, R.w, R.h); g.clip();
      letters.forEach((ch, i) => {
        const bad = i === 3 && hs(Math.floor(t * 9)) > 0.55;
        const on = neon(t + i * 0.13) * (bad ? 0.15 : 1);
        txt(g, ch, sx, sy + i * sz * 1.1, sz, { font: "disp", align: "center", base: "top", color: F.sh(0.6 + 0.4 * on, 0.35 + 0.65 * on), glow: 22 * u * on, glowColor: F.lc(0.9) });
      });
      rain(g, F, { x: R.x, y: R.y, w: R.w, h: R.h, n: 70, alpha: 0.28, len: 26, slant: 0.06, speed: 900, seed: 5 });
      // Drops running down the pane.
      g.fillStyle = F.lc(0.45);
      for (let i = 0; i < 26; i++) {
        const sd = i * 4.1, x = R.x + hs(sd) * R.w, sp = 0.05 + hs(sd + 1) * 0.12;
        const y = R.y + fr(hs(sd + 2) + t * sp) * R.h;
        g.beginPath(); g.ellipse(x, y, 2.4 * u, 3.6 * u, 0, 0, TAU); g.fill();
      }
      g.restore();
      motes(g, F, 0, F.H * 0.15, F.W * 0.6, F.H * 0.7, 36, 9, 0.5);
    },
  };


  // Closing (when the reel has no office title to bookend): the case file on the desk under the lamp.
  // The approval stamp comes down on the sheet, smoke curls from the ashtray, a loupe works along a
  // strip of negatives and a pocket watch ticks.
  function deskOf(F) {
    const { W, H, u, tall } = F;
    return tall
      ? { fx: W * 0.1, fy: H * 0.66, fw: W * 0.8, fh: H * 0.3, rot: 0.03, strip: { x: W * 0.04, y: H * 0.07, w: W * 0.92, h: 120 * u, rot: -0.05 }, ash: { x: W * 0.8, y: H * 0.27 }, watch: { x: W * 0.2, y: H * 0.27, r: 76 * u }, pen: { x: W * 0.5, y: H * 0.3 } }
      : { fx: W * 0.655, fy: H * 0.1, fw: W * 0.31, fh: H * 0.84, rot: 0.045, strip: { x: W * 0.02, y: H * 0.07, w: W * 0.6, h: 130 * u, rot: -0.04 }, ash: { x: W * 0.12, y: H * 0.86 }, watch: { x: W * 0.47, y: H * 0.85, r: 82 * u }, pen: { x: W * 0.29, y: H * 0.86 } };
  }
  function stampTiming(local) {
    const down = eio(seg(local, 0.55, 0.85)), up = eio(seg(local, 1.05, 1.5));
    return { down, up, inked: local >= 0.85, hit: local - 0.85 };
  }
  const caseDesk = {
    set(g, F, p, d, info) {
      const { W, H, u, t, tall } = F, D = deskOf(F), local = info.local;
      // Desk: dark planks with grain.
      g.fillStyle = F.sh(0.34); g.fillRect(0, 0, W, H);
      const r = rng(311);
      const plank = 150 * u;
      for (let y = 0; y < H; y += plank) {
        g.fillStyle = F.sh(0.28 + r() * 0.1); g.fillRect(0, y, W, plank - 3 * u);
        g.strokeStyle = F.sh(0.22); g.lineWidth = 2 * u; g.beginPath();
        for (let k = 0; k < 5; k++) {
          const yy = y + 18 * u + k * 26 * u, a = (3 + r() * 6) * u, f = 0.003 + r() * 0.004, ph = r() * 9;
          for (let x = 0; x <= W; x += 30 * u) { const v = yy + Math.sin(x * f / u + ph) * a; if (x === 0) g.moveTo(x, v); else g.lineTo(x, v); }
        }
        g.stroke();
        g.fillStyle = F.sh(0.12); g.fillRect(0, y + plank - 3 * u, W, 3 * u);
      }
      mottle(g, F, 0, 0, W, H, 0.45, 3, 0, 0, "overlay");
      // A coffee ring.
      g.strokeStyle = F.sh(0.2, 0.7); g.lineWidth = 7 * u; g.beginPath(); g.arc(tall ? W * 0.62 : W * 0.56, tall ? H * 0.58 : H * 0.2, 64 * u, 0.3, 5.6); g.stroke();
      // Strip of negatives.
      const S0 = D.strip;
      g.save(); g.translate(S0.x, S0.y); g.rotate(S0.rot);
      g.fillStyle = F.sh(0.08); g.fillRect(0, 0, S0.w, S0.h);
      const holeY = [10 * u, S0.h - 22 * u];
      g.fillStyle = F.sh(0.5);
      for (let x = 14 * u; x < S0.w - 14 * u; x += 30 * u) for (const hy of holeY) g.fillRect(x, hy, 14 * u, 12 * u);
      const fw = S0.h * 1.25, frames = [];
      for (let i = 0, x = 20 * u; x + fw < S0.w; i++, x += fw + 16 * u) {
        const fy = 30 * u, fh = S0.h - 60 * u;
        g.fillStyle = F.sh(0.66); g.fillRect(x, fy, fw, fh);
        // Negative images: inverted little scenes (a lamp, a skyline, a figure, a door).
        g.fillStyle = F.sh(0.16);
        const k = i % 4, cx = x + fw / 2, by = fy + fh;
        if (k === 0) { g.fillRect(cx - 3 * u, fy + fh * 0.25, 6 * u, fh * 0.75); g.beginPath(); g.arc(cx, fy + fh * 0.25, 10 * u, 0, TAU); g.fill(); }
        else if (k === 1) { for (let j = 0; j < 6; j++) g.fillRect(x + 6 * u + j * fw / 6, by - fh * (0.3 + hs(j + i) * 0.5), fw / 6 - 4 * u, fh); }
        else if (k === 2) { g.beginPath(); g.arc(cx, fy + fh * 0.35, 9 * u, 0, TAU); g.fill(); g.fillRect(cx - 14 * u, fy + fh * 0.48, 28 * u, fh * 0.52); }
        else { g.fillRect(cx - fw * 0.18, fy + fh * 0.15, fw * 0.36, fh * 0.85); g.fillStyle = F.sh(0.66); g.fillRect(cx - fw * 0.12, fy + fh * 0.22, fw * 0.24, fh * 0.3); }
        frames.push(x + fw / 2);
      }
      g.restore();
      // The case folder, open, with the typed sheet.
      g.save(); g.translate(D.fx + D.fw / 2, D.fy + D.fh / 2); g.rotate(D.rot);
      const hw = D.fw / 2, hh = D.fh / 2;
      g.shadowColor = "rgba(0,0,0,0.7)"; g.shadowBlur = 40 * u; g.shadowOffsetY = 16 * u;
      g.fillStyle = F.paper(0.78); g.fillRect(-hw, -hh, D.fw, D.fh);
      g.shadowColor = "transparent";
      g.fillStyle = F.paper(0.78); g.fillRect(-hw + D.fw * 0.08, -hh - 34 * u, D.fw * 0.36, 40 * u);
      mottle(g, F, -hw, -hh - 34 * u, D.fw, D.fh + 34 * u, 0.3, 1.2, 0, 0, "multiply");
      const sx = -hw + 34 * u, sy = -hh + 44 * u, sw = D.fw - 68 * u, sh = D.fh - 80 * u;
      g.fillStyle = F.paper(1.06); g.fillRect(sx, sy, sw, sh);
      // Typed lines, a header rule, a paper-clipped still and a signature line.
      g.fillStyle = F.sh(0.25);
      g.fillRect(sx + 30 * u, sy + 34 * u, sw * 0.5, 12 * u);
      g.fillRect(sx + 30 * u, sy + 62 * u, sw - 60 * u, 3 * u);
      const ph = { x: sx + sw - 30 * u - sw * 0.36, y: sy + 86 * u, w: sw * 0.36, h: sw * 0.28 };
      const lines = Math.floor((sh - 200 * u) / (30 * u));
      for (let i = 0; i < lines; i++) {
        const y = sy + 96 * u + i * 30 * u;
        const right = y < ph.y + ph.h + 16 * u ? ph.x - 20 * u : sx + sw - 30 * u;
        g.fillRect(sx + 30 * u, y, (right - sx - 30 * u) * (0.6 + 0.4 * hs(i * 3.1)), 8 * u);
      }
      g.fillStyle = F.sh(0.12); g.fillRect(ph.x, ph.y, ph.w, ph.h);
      g.fillStyle = F.sh(0.7); g.beginPath(); g.arc(ph.x + ph.w * 0.7, ph.y + ph.h * 0.3, ph.h * 0.12, 0, TAU); g.fill();
      g.fillStyle = F.sh(0.3); for (let j = 0; j < 5; j++) g.fillRect(ph.x + j * ph.w / 5, ph.y + ph.h * (0.45 + hs(j) * 0.25), ph.w / 5 - 3 * u, ph.h);
      g.strokeStyle = F.sh(0.75); g.lineWidth = 4 * u; g.beginPath(); g.moveTo(ph.x + 20 * u, ph.y - 14 * u); g.lineTo(ph.x + 20 * u, ph.y + 40 * u); g.moveTo(ph.x + 32 * u, ph.y - 14 * u); g.lineTo(ph.x + 32 * u, ph.y + 30 * u); g.stroke();
      g.fillStyle = F.sh(0.3); g.fillRect(sx + 30 * u, sy + sh - 50 * u, sw * 0.45, 3 * u);
      // The approval stamp, inked on impact.
      const T = stampTiming(local), stc = { x: sx + sw * 0.5, y: sy + sh * (tall ? 0.55 : 0.68) };
      if (T.inked) {
        const B = buf("STAMP", 760 * u, 300 * u), b = B.getContext("2d");
        b.setTransform(1, 0, 0, 1, 0, 0); b.globalCompositeOperation = "source-over"; b.clearRect(0, 0, B.width, B.height);
        const ink = "rgba(12,10,9,0.95)";
        const sz = Math.max(46 * u, Math.min(84 * u, (sw - 120 * u) / 5.6));
        b.translate(B.width / 2, B.height / 2);
        const m = txt(b, "APPROVED", 0, 0, sz, { font: "disp", measure: true, track: 0.08 });
        const bw = m.w + 60 * u, bh = sz * 1.55;
        b.strokeStyle = ink; b.lineWidth = 7 * u; b.strokeRect(-bw / 2, -bh / 2, bw, bh);
        b.lineWidth = 2.5 * u; b.strokeRect(-bw / 2 + 12 * u, -bh / 2 + 12 * u, bw - 24 * u, bh - 24 * u);
        txt(b, "APPROVED", 0, 4 * u, sz, { font: "disp", align: "center", base: "middle", color: ink, track: 0.08 });
        b.setTransform(1, 0, 0, 1, 0, 0); b.globalCompositeOperation = "destination-out"; b.globalAlpha = 0.3;
        b.fillStyle = smokePat(b, 0.5 * u, 31, 17); b.fillRect(0, 0, B.width, B.height); b.globalAlpha = 1;
        g.save(); g.translate(stc.x, stc.y); g.rotate(-0.14);
        g.globalAlpha = clamp(0.75 + T.hit * 2); g.drawImage(B, -B.width / 2, -B.height / 2);
        g.restore();
      }
      g.restore();
      // The stamp itself: a turned wooden handle that comes down, presses and lifts away.
      const ca = Math.cos(D.rot), sa = Math.sin(D.rot), cx0 = D.fx + D.fw / 2, cy0 = D.fy + D.fh / 2;
      const wx = cx0 + stc.x * ca - stc.y * sa, wy = cy0 + stc.x * sa + stc.y * ca;
      const lift = (1 - T.down) * 700 * u + T.up * 900 * u, sc = 1 + (1 - T.down) * 0.25 + T.up * 0.3;
      let handle = null;
      if (T.down > 0 && T.up < 1) {
        g.save(); g.translate(wx, wy - lift); g.scale(sc, sc); g.rotate(-0.14);
        g.shadowColor = "rgba(0,0,0,0.6)"; g.shadowBlur = 30 * u; g.shadowOffsetY = 20 * u + lift * 0.05;
        g.fillStyle = F.sh(0.2); g.fillRect(-170 * u, -40 * u, 340 * u, 46 * u);
        g.shadowColor = "transparent";
        g.fillStyle = F.sh(0.5); g.fillRect(-170 * u, -40 * u, 340 * u, 6 * u);
        g.fillStyle = F.sh(0.3);
        poly(g, [[-40 * u, -40 * u], [40 * u, -40 * u], [26 * u, -120 * u], [-26 * u, -120 * u]]); g.fill();
        g.beginPath(); g.ellipse(0, -170 * u, 62 * u, 58 * u, 0, 0, TAU); g.fill();
        g.fillStyle = F.sh(0.7); g.beginPath(); g.ellipse(-18 * u, -188 * u, 18 * u, 12 * u, -0.5, 0, TAU); g.fill();
        g.restore();
        handle = { x: wx, y: wy - lift };
      }
      // Ashtray, pen and pocket watch.
      const A = D.ash;
      g.fillStyle = F.sh(0.62); g.beginPath(); g.ellipse(A.x, A.y, 96 * u, 40 * u, 0, 0, TAU); g.fill();
      g.fillStyle = F.sh(0.16); g.beginPath(); g.ellipse(A.x, A.y - 4 * u, 70 * u, 26 * u, 0, 0, TAU); g.fill();
      g.fillStyle = F.sh(0.4); for (let k = 0; k < 3; k++) { g.save(); g.translate(A.x - 30 * u + k * 22 * u, A.y - 2 * u); g.rotate(0.6 - k * 0.5); g.fillRect(-18 * u, -4 * u, 36 * u, 8 * u); g.restore(); }
      g.save(); g.translate(A.x + 60 * u, A.y - 14 * u); g.rotate(-0.25); g.fillStyle = F.sh(0.95); g.fillRect(0, -6 * u, 96 * u, 12 * u); g.fillStyle = F.sh(0.55); g.fillRect(0, -6 * u, 22 * u, 12 * u); g.restore();
      const P = D.pen, roll = Math.sin(t * 0.7) * 8 * u;
      g.save(); g.translate(P.x + roll, P.y); g.rotate(-0.32 + roll * 0.002 / u);
      g.fillStyle = F.sh(0.1); rr(g, -150 * u, -11 * u, 300 * u, 22 * u, 11 * u); g.fill();
      g.fillStyle = F.sh(0.8); g.fillRect(40 * u, -11 * u, 8 * u, 22 * u); g.fillRect(-120 * u, -14 * u, 70 * u, 5 * u);
      g.fillStyle = F.sh(0.6); poly(g, [[150 * u, -8 * u], [190 * u, 0], [150 * u, 8 * u]]); g.fill();
      g.restore();
      const Wt = D.watch;
      g.strokeStyle = F.sh(0.6); g.lineWidth = 5 * u; g.setLineDash([9 * u, 5 * u]);
      g.beginPath(); g.moveTo(Wt.x, Wt.y - Wt.r); g.bezierCurveTo(Wt.x + 40 * u, Wt.y - Wt.r - 120 * u, Wt.x + 200 * u, Wt.y - 40 * u, Wt.x + 260 * u, Wt.y + 30 * u); g.stroke(); g.setLineDash([]);
      g.fillStyle = F.sh(0.66); g.beginPath(); g.arc(Wt.x, Wt.y, Wt.r + 10 * u, 0, TAU); g.fill();
      g.fillStyle = F.sh(0.92); g.beginPath(); g.arc(Wt.x, Wt.y, Wt.r, 0, TAU); g.fill();
      g.fillStyle = F.sh(0.66); g.fillRect(Wt.x - 10 * u, Wt.y - Wt.r - 26 * u, 20 * u, 18 * u);
      g.strokeStyle = F.sh(0.2);
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; g.lineWidth = (i % 3 ? 2 : 4) * u; g.beginPath(); g.moveTo(Wt.x + Math.cos(a) * Wt.r * 0.78, Wt.y + Math.sin(a) * Wt.r * 0.78); g.lineTo(Wt.x + Math.cos(a) * Wt.r * 0.92, Wt.y + Math.sin(a) * Wt.r * 0.92); g.stroke(); }
      const hand = (a, len, w) => { g.lineWidth = w; g.beginPath(); g.moveTo(Wt.x, Wt.y); g.lineTo(Wt.x + Math.cos(a) * len, Wt.y + Math.sin(a) * len); g.stroke(); };
      hand(-Math.PI / 2 + 0.2 * TAU, Wt.r * 0.5, 5 * u); hand(-Math.PI / 2 + (0.97 + t / 3600) * TAU, Wt.r * 0.72, 3.5 * u);
      const sec = Math.floor(t * 2) / 2 + eo(fr(t * 2) * 5) * 0.5;
      g.strokeStyle = F.sh(0.05); hand(-Math.PI / 2 + (sec / 60) * TAU * 6, Wt.r * 0.84, 1.8 * u);
      return { D, frames, handle, T, ash: { x: A.x + 150 * u, y: A.y - 36 * u } };
    },
    light(l, F, p, d, info, st) {
      const { W, H, u, t, tall } = F, D = st.D;
      const lf = 0.9 + 0.1 * Math.sin(t * 8) * (hs(Math.floor(t * 4) + 7) > 0.7 ? 1 : 0.25);
      const swing = Math.sin(t * 0.9) * 40 * u;
      pool(l, F, D.fx + D.fw * 0.5 + swing, D.fy + D.fh * 0.5, Math.max(D.fw, D.fh) * 0.75, Math.max(D.fw, D.fh) * 0.65, 1.0 * lf, 0.6);
      pool(l, F, D.ash.x + 120 * u, D.ash.y, 420 * u, 200 * u, 0.55 * lf);
      pool(l, F, D.watch.x, D.watch.y, 260 * u, 180 * u, 0.6 * lf);
      pool(l, F, D.strip.x + D.strip.w * 0.5, D.strip.y + D.strip.h * 0.5, D.strip.w * 0.6, 160 * u, 0.5);
      // Loupe light walking along the negatives.
      const lx = D.strip.x + D.strip.w * (0.12 + 0.76 * (0.5 - 0.5 * Math.cos(t * 0.8)));
      pool(l, F, lx, D.strip.y + D.strip.h * 0.5 + (lx - D.strip.x) * Math.tan(D.strip.rot), 150 * u, 110 * u, 0.7);
      st.loupe = lx;
      sweep(l, F, { y: 0, h: H, power: 0.45, period: 3.0, phase: 0.1, slope: 0.18, skew: -0.4 });
      rainShadows(l, F, 0, 0, W, H, 22, 91);
      // The statement sits in a pocket of shadow.
      if (!tall) dark(l, F, W * 0.33, H * 0.5, W * 0.36, H * 0.19, 0.85, 0.6);
      else dark(l, F, W * 0.5, H * 0.47, W * 0.62, H * 0.12, 0.85, 0.6);
    },
    over(g, F, p, d, info, st) {
      const { u, t, tall } = F, D = st.D;
      smokeCurl(g, F, st.ash.x, st.ash.y, tall ? 260 * u : 170 * u, 0.5, 2.2);
      g.save(); g.fillStyle = F.lc(0.6 + 0.4 * Math.abs(Math.sin(t * 2.3))); g.shadowColor = F.lc(1); g.shadowBlur = 14 * u;
      g.beginPath(); g.arc(st.ash.x - 2 * u, st.ash.y + 4 * u, 5 * u, 0, TAU); g.fill(); g.restore();
      // The loupe on the negatives.
      const lx = st.loupe, ly = D.strip.y + D.strip.h * 0.5 + (lx - D.strip.x) * Math.tan(D.strip.rot);
      g.save();
      g.shadowColor = "rgba(0,0,0,0.7)"; g.shadowBlur = 24 * u; g.shadowOffsetY = 12 * u;
      g.strokeStyle = F.sh(0.85); g.lineWidth = 12 * u; g.beginPath(); g.arc(lx, ly, 70 * u, 0, TAU); g.stroke();
      g.shadowColor = "transparent";
      g.fillStyle = F.lc(0.14); g.beginPath(); g.arc(lx, ly, 64 * u, 0, TAU); g.fill();
      g.strokeStyle = F.lc(0.7); g.lineWidth = 3 * u; g.beginPath(); g.arc(lx, ly, 52 * u, 3.6, 4.6); g.stroke();
      g.restore();
      // Impact: a ring of light snaps out from under the stamp.
      if (st.T.hit > 0 && st.T.hit < 0.4) {
        const k = st.T.hit / 0.4, ca = Math.cos(D.rot), sa = Math.sin(D.rot);
        const hx = st.handle ? st.handle.x : D.fx + D.fw / 2, hy = st.handle ? st.handle.y : D.fy + D.fh * 0.6;
        g.save(); g.strokeStyle = F.lc(0.6 * (1 - k)); g.lineWidth = 4 * u;
        g.beginPath(); g.ellipse(hx, hy, 200 * u + k * 160 * u, (60 * u + k * 60 * u), -0.14, 0, TAU); g.stroke();
        g.restore(); void ca; void sa;
      }
      motes(g, F, D.fx - 100 * u, D.fy, D.fw + 200 * u, D.fh, 30, 61, 0.55);
    },
  };

  // ---- chart: towers on a night skyline ----------------------------------------------------------
  function skyline(g, F, seed, base, hMin, hMax, color, wMin, wMax) {
    const r = rng(seed), out = [], u = F.u;
    let x = -30 * u;
    g.fillStyle = color; g.beginPath();
    while (x < F.W + 30 * u) {
      const w = lerp(wMin, wMax, r()) * u, h = lerp(hMin, hMax, r());
      g.rect(x, base - h, w + 1, h + 2);
      if (r() > 0.55) g.rect(x + w * 0.25, base - h - h * 0.1, w * 0.5, h * 0.1 + 1);
      if (r() > 0.75) g.rect(x + w * 0.48, base - h - h * 0.28, 2.5 * u, h * 0.2);
      if (r() > 0.85) { g.moveTo(x + w * 0.2, base - h); g.lineTo(x + w * 0.5, base - h - w * 0.4); g.lineTo(x + w * 0.8, base - h); }
      out.push({ x, w, h });
      x += w + r() * 10 * u;
    }
    g.fill();
    return out;
  }
  function towerPath(g, x, top, bw, base) {
    const h = base - top, s1 = Math.min(bw * 0.5, h * 0.24), s2 = s1 * 0.55, s3 = s1 * 0.24;
    poly(g, [
      [x - bw / 2, base], [x - bw / 2, top + s1], [x - bw * 0.36, top + s1], [x - bw * 0.36, top + s2],
      [x - bw * 0.22, top + s2], [x - bw * 0.22, top + s3], [x - bw * 0.1, top], [x + bw * 0.1, top],
      [x + bw * 0.22, top + s3], [x + bw * 0.22, top + s2], [x + bw * 0.36, top + s2], [x + bw * 0.36, top + s1],
      [x + bw / 2, top + s1], [x + bw / 2, base],
    ]);
    return s1;
  }
  // Bottom edge of a scene's headline, from the layout (transforms ignored), so art can keep clear of it.
  const HEAD = {};
  function headBottom(id, F) {
    if (HEAD[id] !== undefined) return HEAD[id];
    const el = typeof document !== "undefined" && document.getElementById(id);
    if (!el || !el.offsetParent) return F.box.y - 120 * F.u;
    return (HEAD[id] = el.offsetParent.offsetTop + el.offsetTop + el.offsetHeight);
  }
  const chart = {
    set(g, F, p, d) {
      const { W, H, u, t, tall } = F, b = F.box;
      const vals = (d.values || []).map((v) => Math.max(0, Number(v) || 0));
      const n = Math.max(1, vals.length), max = Math.max(...vals, 1);
      const hi = d.highlight >= 0 && d.highlight < n ? d.highlight : -1;
      const base = b.y + b.h - (tall ? 150 : 100) * u;
      const slot = b.w / n, bw = Math.min(slot * 0.46, 210 * u);
      const topLimit = Math.max(b.y + 50 * u, headBottom("chart-title", F) + 230 * u), hmax = base - topLimit;
      const sky = g.createLinearGradient(0, 0, 0, base);
      sky.addColorStop(0, F.sh(0.1)); sky.addColorStop(0.6, F.sh(0.32)); sky.addColorStop(1, F.sh(0.66));
      g.fillStyle = sky; g.fillRect(0, 0, W, base);
      mottle(g, F, 0, 0, W, base, 0.55, 5, t * 9 * u, 0, "overlay");
      const moon = tall ? { x: W * 0.24, y: H * 0.3, r: 58 * u } : { x: W * 0.86, y: H * 0.2, r: 66 * u };
      const far = skyline(g, F, 31, base, (base - b.y) * 0.3, (base - b.y) * 0.85, F.sh(0.3), 50, 120);
      const mid = skyline(g, F, 57, base, (base - b.y) * 0.12, (base - b.y) * 0.48, F.sh(0.2), 70, 150);
      // Street.
      g.fillStyle = F.sh(0.14); g.fillRect(0, base, W, H - base);
      g.fillStyle = F.sh(0.5); g.fillRect(0, base, W, 3 * u);
      g.fillStyle = F.sh(0.24); g.fillRect(0, base + 3 * u, W, 20 * u);
      const towers = [];
      g.save(); g.beginPath(); g.rect(0, 0, W, base); g.clip();
      vals.forEach((v, i) => {
        const grow = eo(seg(p, i * 0.06, 0.34 + i * 0.06));
        const h = Math.max(70 * u, hmax * (v / max)), x = b.x + slot * (i + 0.5), dy = (h + 60 * u) * (1 - grow), top = base - h + dy;
        const hot = i === hi;
        const side = bw * 0.17, bot = base + dy;
        const s1 = Math.min(bw * 0.5, h * 0.24);
        poly(g, [[x - bw / 2 - side, bot], [x - bw / 2 - side, top + s1 + side * 0.35], [x - bw / 2, top + s1], [x - bw / 2, bot]]);
        g.fillStyle = F.sh(0.2); g.fill();
        towerPath(g, x, top, bw, bot);
        const fg = g.createLinearGradient(0, top, 0, bot);
        fg.addColorStop(0, F.sh(hot ? 0.5 : 0.36)); fg.addColorStop(1, F.sh(hot ? 0.82 : 0.66));
        g.fillStyle = fg; g.fill();
        // Piers, spandrels and the crown's banding.
        g.strokeStyle = F.sh(0.26); g.lineWidth = 2 * u; g.beginPath();
        for (let k = 1; k < 6; k++) { const px = x - bw / 2 + (bw * k) / 6; g.moveTo(px, top + s1 + 6 * u); g.lineTo(px, bot); }
        for (let k = 0; k < 4; k++) { const yy = top + s1 * (0.55 + k * 0.12); g.moveTo(x - bw * 0.36, yy); g.lineTo(x + bw * 0.36, yy); }
        g.stroke();
        g.fillStyle = F.sh(0.9); g.fillRect(x + bw / 2 - 3 * u, top + s1, 3 * u, h);
        g.fillStyle = F.sh(0.8); g.fillRect(x - bw * 0.36, top + s1 - 3 * u, bw * 0.72, 3 * u); g.fillRect(x - bw / 2, top + s1, bw, 4 * u);
        g.fillStyle = F.sh(0.4); g.fillRect(x - 1.5 * u, top - 26 * u - h * 0.05, 3 * u, 26 * u + h * 0.05);
        towers.push({ x, top, h, dy, grow, hot, v, label: d.labels[i] || "", i, s1 });
      });
      g.restore();
      return { base, slot, bw, towers, moon, far, mid, hi, max, haze: 1.5 };
    },
    light(l, F, p, d, info, st) {
      const { W, H, u, t } = F;
      pool(l, F, st.moon.x, st.moon.y, W * 0.5, W * 0.4, 0.45);
      // Premiere searchlights far off, and one from the leading tower.
      cone(l, F, W * 0.12, st.base, -Math.PI / 2 + 0.55 * Math.sin(t * 0.9), 0.05, H * 1.4, 0.8, 40 * u, 8);
      cone(l, F, W * 0.94, st.base, -Math.PI / 2 - 0.5 * Math.sin(t * 0.75 + 1.2), 0.05, H * 1.4, 0.75, 40 * u, 8);
      cone(l, F, W * 0.55, st.base, -Math.PI / 2 + 0.7 * Math.sin(t * 0.6 + 2.6), 0.04, H * 1.3, 0.55, 30 * u, 8);
      const hot = st.towers.find((x) => x.hot);
      if (hot && hot.grow > 0.6) cone(l, F, hot.x, hot.top - 160 * u, -Math.PI / 2 + 0.55 * Math.sin(t * 0.85), 0.05, H * 1.2, 0.55 * seg(hot.grow, 0.6, 1), 26 * u, 12);
      const up = l.createLinearGradient(0, st.base, 0, st.base - 340 * u);
      up.addColorStop(0, F.lc(0.5)); up.addColorStop(1, F.lc(0));
      l.fillStyle = up; l.fillRect(0, st.base - 340 * u, W, 340 * u);
      for (let x = 60 * u; x < W; x += 320 * u) pool(l, F, x, st.base + 30 * u, 170 * u, 60 * u, 0.45);
      l.fillStyle = F.lc(0.12); l.fillRect(0, st.base, W, H - st.base);
    },
    over(g, F, p, d, info, st) {
      const { W, H, u, t, tall } = F, b = F.box;
      // Moon and clouds crossing it.
      const m = st.moon;
      g.save();
      g.shadowColor = F.lc(0.8); g.shadowBlur = 50 * u; g.fillStyle = F.sh(0.96);
      g.beginPath(); g.arc(m.x, m.y, m.r, 0, TAU); g.fill();
      g.shadowBlur = 0;
      g.fillStyle = F.sh(0.78, 0.5);
      g.beginPath(); g.arc(m.x - m.r * 0.3, m.y - m.r * 0.15, m.r * 0.22, 0, TAU); g.arc(m.x + m.r * 0.25, m.y + m.r * 0.3, m.r * 0.14, 0, TAU); g.fill();
      g.filter = `blur(${14 * u}px)`;
      for (let i = 0; i < 5; i++) {
        const cw = (260 + hs(i) * 300) * u, span = W + cw * 2;
        const cx = -cw + fr(hs(i + 3) + t * (0.018 + hs(i + 7) * 0.014)) * span, cy = H * (0.1 + hs(i + 11) * 0.22);
        g.fillStyle = F.sh(0.1, 0.55);
        g.beginPath(); g.ellipse(cx, cy, cw * 0.5, 22 * u + hs(i + 5) * 20 * u, 0, 0, TAU); g.fill();
      }
      g.restore();
      // Distant windows.
      g.fillStyle = F.sh(0.75, 0.6);
      st.far.forEach((bd, i) => { for (let k = 0; k < 5; k++) { const s = i * 13 + k; if (hs(s + Math.floor(t * 0.3 + hs(s) * 3)) > 0.6) g.fillRect(bd.x + bd.w * hs(s * 1.3) * 0.8, st.base - bd.h * (0.15 + 0.75 * hs(s * 2.1)), 3 * u, 4 * u); } });
      g.fillStyle = F.sh(0.85, 0.75);
      st.mid.forEach((bd, i) => { for (let k = 0; k < 4; k++) { const s = i * 31 + k + 500; if (hs(s + Math.floor(t * 0.4 + hs(s) * 3)) > 0.55) g.fillRect(bd.x + 6 * u + (bd.w - 16 * u) * hs(s * 1.7), st.base - 8 * u - bd.h * 0.85 * hs(s * 2.3), 5 * u, 6 * u); } });
      // Tower windows: lit floor by floor, flickering as people work late.
      g.save(); g.beginPath(); g.rect(0, 0, W, st.base); g.clip();
      for (const tw of st.towers) {
        if (tw.grow <= 0) continue;
        const cols = Math.max(3, Math.floor((st.bw * 0.84) / (19 * u))), cw = (st.bw * 0.84) / cols;
        const top = tw.top + tw.s1 + 14 * u, bottom = st.base + tw.dy - 12 * u, rows = Math.floor((bottom - top) / (24 * u));
        if (tw.hot) { g.shadowColor = F.acc(0.9); g.shadowBlur = 8 * u; }
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const s = tw.i * 997 + r * 37 + c * 7;
          const on = hs(s + Math.floor(t * 0.45 + hs(s) * 6)) > (tw.hot ? 0.28 : 0.5);
          if (!on) continue;
          const wx = tw.x - st.bw * 0.42 + c * cw + cw * 0.25, wy = top + r * 24 * u;
          g.fillStyle = tw.hot ? F.acc(0.95) : F.sh(0.92, 0.6 + 0.35 * hs(s * 1.7));
          g.fillRect(wx, wy, cw * 0.5, 13 * u);
        }
        g.shadowBlur = 0;
        // Aircraft lamp on the spire.
        const blink = Math.sin(t * 3 + tw.i * 1.7) > 0.4;
        if (blink) { g.fillStyle = F.lc(1); g.shadowColor = F.lc(1); g.shadowBlur = 14 * u; g.beginPath(); g.arc(tw.x, tw.top - 26 * u - tw.h * 0.05, 4.5 * u, 0, TAU); g.fill(); g.shadowBlur = 0; }
      }
      g.restore();
      // Figures: a sign over each roof; the leading tower carries a lit billboard.
      for (const tw of st.towers) {
        if (tw.grow <= 0.02) continue;
        const a = clamp(tw.grow * 2.5);
        g.save(); g.globalAlpha = a;
        const spire = tw.top - 26 * u - tw.h * 0.05;
        if (tw.hot) {
          const ns = txt(g, fmt(tw.v, tw.grow, d), 0, 0, 116 * u, { font: "disp", measure: true, maxW: st.slot * 1.1, min: 96 * u });
          const bwid = Math.max(ns.w + 70 * u, 200 * u), bh = 150 * u, bx = tw.x - bwid / 2, by = spire - bh - 18 * u;
          g.strokeStyle = F.sh(0.4); g.lineWidth = 4 * u; g.beginPath();
          g.moveTo(tw.x - bwid * 0.3, by + bh); g.lineTo(tw.x - bwid * 0.22, spire + 20 * u); g.moveTo(tw.x + bwid * 0.3, by + bh); g.lineTo(tw.x + bwid * 0.22, spire + 20 * u); g.stroke();
          g.fillStyle = F.T.plate; g.fillRect(bx, by, bwid, bh);
          g.strokeStyle = F.acc(0.8); g.lineWidth = 2 * u; g.strokeRect(bx + 10 * u, by + 10 * u, bwid - 20 * u, bh - 20 * u);
          // Chasing bulbs round the frame.
          const per = 2 * (bwid + bh), stepB = 24 * u, nb = Math.floor(per / stepB), chase = Math.floor(t * 9);
          for (let k = 0; k < nb; k++) {
            let s = k * stepB, px, py;
            if (s < bwid) { px = bx + s; py = by; } else if ((s -= bwid) < bh) { px = bx + bwid; py = by + s; } else if ((s -= bh) < bwid) { px = bx + bwid - s; py = by + bh; } else { s -= bwid; px = bx; py = by + bh - s; }
            const lit = (k + chase) % 3 === 0;
            g.fillStyle = lit ? F.lc(1) : F.sh(0.45);
            if (lit) { g.shadowColor = F.lc(1); g.shadowBlur = 10 * u; }
            g.beginPath(); g.arc(px, py, 4.5 * u, 0, TAU); g.fill(); g.shadowBlur = 0;
          }
          txt(g, fmt(tw.v, tw.grow, d), tw.x, by + bh / 2 + 6 * u, 116 * u, { font: "disp", align: "center", base: "middle", color: F.acc(1), glow: 24 * u, glowColor: F.acc(0.7), maxW: st.slot * 1.1, min: 96 * u });
        } else {
          txt(g, fmt(tw.v, tw.grow, d), tw.x, spire - 18 * u, 74 * u, { font: "disp", align: "center", color: F.ink, shadow: "rgba(0,0,0,0.8)", shadowBlur: 14 * u, maxW: st.slot * 0.95, min: 52 * u });
        }
        // Street plate with the label.
        const lw = txt(g, tw.label, 0, 0, 44 * u, { measure: true, maxW: st.slot * 0.92, min: 42 * u });
        const py = st.base + 36 * u;
        g.fillStyle = F.T.plate; g.fillRect(tw.x - lw.w / 2 - 18 * u, py, lw.w + 36 * u, 62 * u);
        g.fillStyle = tw.hot ? F.acc(0.9) : F.T.plateEdge; g.fillRect(tw.x - lw.w / 2 - 18 * u, py, lw.w + 36 * u, 3 * u);
        txt(g, tw.label, tw.x, py + 33 * u, 44 * u, { align: "center", base: "middle", color: tw.hot ? F.acc(1) : F.ink, maxW: st.slot * 0.92, min: 42 * u });
        g.restore();
      }
      // Headlights along the avenue and their streaks on the wet road.
      const ry = st.base + 130 * u;
      if (ry < H - 10 * u) {
        for (let i = 0; i < 4; i++) {
          const dir = i % 2 ? -1 : 1, sp = (260 + hs(i) * 200) * u;
          const x = dir > 0 ? -100 * u + fr(hs(i + 2) + (t * sp) / (W + 200 * u)) * (W + 200 * u) : W + 100 * u - fr(hs(i + 2) + (t * sp) / (W + 200 * u)) * (W + 200 * u);
          const y = ry + (i % 2) * 26 * u;
          if (y > H - 6 * u) continue;
          g.save();
          g.fillStyle = F.lc(dir > 0 ? 0.9 : 0.45); g.shadowColor = F.lc(1); g.shadowBlur = 16 * u;
          g.beginPath(); g.arc(x, y, 5 * u, 0, TAU); g.arc(x - dir * 22 * u, y, 5 * u, 0, TAU); g.fill();
          g.shadowBlur = 0;
          const st2 = g.createLinearGradient(x, y, x - dir * 160 * u, y);
          st2.addColorStop(0, F.lc(0.35)); st2.addColorStop(1, F.lc(0));
          g.fillStyle = st2; g.fillRect(Math.min(x, x - dir * 160 * u), y - 2 * u, 160 * u, 4 * u);
          g.restore();
        }
      }
      rain(g, F, { x: -100 * u, y: 0, w: W + 100 * u, h: H, n: tall ? 170 : 240, alpha: 0.4, len: 50, slant: 0.12, speed: 1700, seed: 2 });
      void b;
    },
  };

  // ---- object: the device on a desk at night -------------------------------------------------------
  function objectLayout(F, d) {
    const { u, tall } = F, b = F.box, phone = d.kind === "phone";
    const L = { phone };
    if (!tall) {
      L.deskY = b.y + b.h * 0.8;
      L.cx = b.x + b.w * 0.3;
      L.tagX = b.x + b.w * 0.6; L.tagW = b.x + b.w - L.tagX + 40 * u;
      L.tagYs = [0, 1, 2].map((i) => b.y + b.h * (0.06 + i * 0.29));
    } else {
      L.deskY = b.y + b.h * 0.42;
      L.cx = b.x + b.w * 0.5;
      L.tagX = b.x + 20 * u; L.tagW = b.w - 40 * u;
      L.tagYs = [0, 1, 2].map((i) => L.deskY + 150 * u + i * 190 * u);
    }
    if (!phone) {
      L.w = tall ? b.w * 0.82 : Math.min(b.w * 0.46, b.h * 1.05);
      L.h = L.w * 0.62;
      L.x = L.cx - L.w / 2; L.y = L.deskY - 16 * u - L.h;
      L.scr = { x: L.x + 22 * u, y: L.y + 22 * u, w: L.w - 44 * u, h: L.h - 44 * u };
    } else {
      L.h = tall ? b.h * 0.36 : b.h * 0.86;
      L.w = L.h * 0.5;
      L.x = L.cx - L.w / 2; L.y = L.deskY - 26 * u - L.h;
      L.scr = { x: L.x + 16 * u, y: L.y + 40 * u, w: L.w - 32 * u, h: L.h - 80 * u };
    }
    return L;
  }
  const object = {
    set(g, F, p, d) {
      const { W, H, u, t, tall } = F, b = F.box, L = objectLayout(F, d);
      // Wall with a framed photograph and a calendar; the desk below.
      g.fillStyle = F.sh(0.42); g.fillRect(0, 0, W, L.deskY);
      mottle(g, F, 0, 0, W, L.deskY, 0.5, 3.6, 0, 0, "overlay");
      g.fillStyle = F.sh(0.3); g.fillRect(0, L.deskY - 40 * u, W, 40 * u);
      const ph = tall ? { x: b.x + b.w * 0.72, y: b.y - 120 * u, w: 150 * u, h: 190 * u } : { x: b.x + b.w * 0.44, y: b.y - 60 * u, w: 140 * u, h: 180 * u };
      g.fillStyle = F.sh(0.2); g.fillRect(ph.x, ph.y, ph.w, ph.h);
      g.fillStyle = F.sh(0.7); g.fillRect(ph.x + 14 * u, ph.y + 14 * u, ph.w - 28 * u, ph.h - 28 * u);
      g.fillStyle = F.sh(0.3);
      g.beginPath(); g.arc(ph.x + ph.w / 2, ph.y + ph.h * 0.42, ph.w * 0.16, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(ph.x + ph.w / 2, ph.y + ph.h - 14 * u, ph.w * 0.3, ph.h * 0.26, 0, Math.PI, TAU); g.fill();
      // Desk.
      g.fillStyle = F.sh(0.32); g.fillRect(0, L.deskY, W, H - L.deskY);
      g.strokeStyle = F.sh(0.24); g.lineWidth = 2 * u; g.beginPath();
      const r = rng(19);
      for (let i = 0; i < 18; i++) {
        const y = L.deskY + 14 * u + r() * (H - L.deskY), a = (4 + r() * 8) * u, f = 0.002 + r() * 0.004;
        for (let x = 0; x <= W; x += 24 * u) { const yy = y + Math.sin(x * f / u + i) * a; if (x === 0) g.moveTo(x, yy); else g.lineTo(x, yy); }
      }
      g.stroke();
      g.fillStyle = F.sh(0.66); g.fillRect(0, L.deskY, W, 4 * u);
      // Papers and a pen.
      const px = tall ? b.x + b.w * 0.05 : b.x - 40 * u, py = L.deskY + (tall ? 30 : 26) * u;
      for (let i = 0; i < 3; i++) { g.save(); g.translate(px + 120 * u, py + 30 * u); g.rotate(-0.08 + i * 0.06); g.fillStyle = F.sh(0.7 + i * 0.07); g.fillRect(-120 * u, -14 * u, 240 * u, 50 * u); g.restore(); }
      g.save(); g.translate(px + 200 * u, py + 26 * u); g.rotate(-0.4); g.fillStyle = F.sh(0.12); rr(g, -70 * u, -6 * u, 140 * u, 12 * u, 6 * u); g.fill(); g.fillStyle = F.sh(0.8); g.fillRect(40 * u, -6 * u, 6 * u, 12 * u); g.restore();
      // Banker's lamp behind the device.
      const lx = tall ? b.x + b.w * 0.06 : b.x + 10 * u, ly = L.deskY - 4 * u, lh = tall ? 300 * u : Math.min(L.deskY - b.y + 10 * u, 440 * u);
      g.fillStyle = F.sh(0.3); g.beginPath(); g.ellipse(lx, ly, 70 * u, 16 * u, 0, 0, TAU); g.fill();
      g.fillStyle = F.sh(0.45); g.fillRect(lx - 6 * u, ly - lh, 12 * u, lh);
      const shx = lx + 30 * u, shy = ly - lh;
      poly(g, [[shx - 110 * u, shy + 30 * u], [shx - 80 * u, shy - 22 * u], [shx + 80 * u, shy - 22 * u], [shx + 110 * u, shy + 30 * u]]);
      const sg2 = g.createLinearGradient(0, shy - 22 * u, 0, shy + 30 * u);
      sg2.addColorStop(0, F.sh(0.8)); sg2.addColorStop(0.3, F.sh(0.5)); sg2.addColorStop(1, F.sh(0.3));
      g.fillStyle = sg2; g.fill();
      g.fillStyle = F.sh(0.9); g.fillRect(shx - 80 * u, shy - 22 * u, 160 * u, 4 * u);
      g.fillStyle = F.sh(0.65); g.fillRect(shx - 110 * u, shy + 26 * u, 220 * u, 5 * u);
      // The device body (its screen is drawn in the emissive pass).
      if (!L.phone) {
        rr(g, L.x, L.y, L.w, L.h, 16 * u); g.fillStyle = F.sh(0.44); g.fill(); g.strokeStyle = F.sh(0.75); g.lineWidth = 3 * u; g.stroke();
        g.fillStyle = F.sh(0.6); g.fillRect(L.x + 16 * u, L.y + 3 * u, L.w - 32 * u, 3 * u);
        poly(g, [[L.x - L.w * 0.05, L.deskY], [L.x + L.w * 1.05, L.deskY], [L.x + L.w, L.deskY - 16 * u], [L.x, L.deskY - 16 * u]]);
        g.fillStyle = F.sh(0.46); g.fill();
        g.fillStyle = F.sh(0.2); g.fillRect(L.x + L.w * 0.42, L.deskY - 8 * u, L.w * 0.16, 4 * u);
      } else {
        rr(g, L.x, L.y, L.w, L.h, 34 * u); g.fillStyle = F.sh(0.28); g.fill();
        g.fillStyle = F.sh(0.6); g.fillRect(L.x + 30 * u, L.y + 3 * u, L.w - 60 * u, 3 * u);
        poly(g, [[L.cx - L.w * 0.3, L.deskY], [L.cx + L.w * 0.3, L.deskY], [L.cx + L.w * 0.18, L.y + L.h - 10 * u], [L.cx - L.w * 0.18, L.y + L.h - 10 * u]]);
        g.fillStyle = F.sh(0.4); g.fill();
      }
      // Coffee cup.
      let cup = null;
      if (!tall) {
        cup = { x: Math.min(L.x + L.w + 90 * u, L.tagX - 70 * u), y: L.deskY + 6 * u };
        g.fillStyle = F.sh(0.6); g.beginPath(); g.ellipse(cup.x, cup.y + 6 * u, 70 * u, 14 * u, 0, 0, TAU); g.fill();
        poly(g, [[cup.x - 46 * u, cup.y - 86 * u], [cup.x + 46 * u, cup.y - 86 * u], [cup.x + 36 * u, cup.y], [cup.x - 36 * u, cup.y]]);
        g.fillStyle = F.sh(0.78); g.fill();
        g.strokeStyle = F.sh(0.78); g.lineWidth = 9 * u; g.beginPath(); g.ellipse(cup.x + 50 * u, cup.y - 48 * u, 18 * u, 24 * u, 0, -1.4, 1.4); g.stroke();
        g.fillStyle = F.sh(0.2); g.beginPath(); g.ellipse(cup.x, cup.y - 86 * u, 46 * u, 9 * u, 0, 0, TAU); g.fill();
      }
      return { L, lamp: { x: shx, y: shy + 30 * u }, cup };
    },
    light(l, F, p, d, info, st) {
      const { W, H, u, t, tall } = F, L = st.L, n = neon(t);
      blinds(l, F, tall
        ? { x: -W * 0.1, y: 0, w: W * 1.3, h: L.deskY, slope: -0.22, skew: 0.3, period: 60 * u, duty: 0.5, power: 0.55 * n }
        : { x: W * 0.35, y: -H * 0.05, w: W * 0.8, h: L.deskY + H * 0.05, slope: -0.26, skew: 0.38, period: 62 * u, duty: 0.5, power: 0.6 * n });
      // The desk lamp's cone and pool.
      const lf = 0.88 + 0.12 * Math.sin(t * 9) * (hs(Math.floor(t * 4)) > 0.7 ? 1 : 0.3);
      sweep(l, F, { y: -H * 0.05, h: L.deskY + H * 0.05, power: 0.6, period: 2.9, phase: 0.3, slope: -0.2, skew: 0.4 });
      cone(l, F, st.lamp.x, st.lamp.y, Math.PI / 2 - 0.42, 0.55, L.deskY - st.lamp.y + 220 * u, 0.95 * lf, 180 * u, 26);
      pool(l, F, st.lamp.x + 220 * u, L.deskY + 50 * u, 520 * u, 140 * u, 0.8 * lf);
      pool(l, F, st.lamp.x, st.lamp.y - 40 * u, 340 * u, 260 * u, 0.35 * lf);
      // The screen's own glow on the desk and wall.
      const sg = 0.35 + 0.15 * seg(p, 0, 0.4);
      pool(l, F, L.cx, L.scr.y + L.scr.h / 2, L.w * 0.95, L.h * 0.95, sg * 0.6);
      pool(l, F, L.cx, L.deskY + 50 * u, L.w * 0.75, 90 * u, sg);
      rainShadows(l, F, tall ? 0 : W * 0.4, 0, tall ? W : W * 0.6, L.deskY, 18, 23);
      for (let i = 0; i < 3; i++) pool(l, F, L.tagX + L.tagW * 0.4, L.tagYs[i] + 46 * u, L.tagW * 0.7, 90 * u, 0.25);
    },
    over(g, F, p, d, info, st) {
      const { W, H, u, t, tall } = F, L = st.L, S = L.scr;
      // Screen: a little night film playing above a timeline.
      g.save();
      rr(g, S.x, S.y, S.w, S.h, (L.phone ? 18 : 6) * u); g.clip();
      g.fillStyle = F.sh(0.24); g.fillRect(S.x, S.y, S.w, S.h);
      const pv = L.phone ? { x: S.x + 12 * u, y: S.y + 14 * u, w: S.w - 24 * u, h: S.h * 0.42 } : { x: S.x + S.w * 0.05, y: S.y + S.h * 0.06, w: S.w * 0.9, h: S.h * 0.5 };
      const sky = g.createLinearGradient(0, pv.y, 0, pv.y + pv.h);
      sky.addColorStop(0, F.sh(0.4)); sky.addColorStop(1, F.sh(0.78));
      g.fillStyle = sky; g.fillRect(pv.x, pv.y, pv.w, pv.h);
      g.fillStyle = F.sh(0.98); g.beginPath(); g.arc(pv.x + pv.w * 0.72, pv.y + pv.h * 0.32, pv.h * 0.14, 0, TAU); g.fill();
      g.fillStyle = F.sh(0.55, 0.8);
      const cx = pv.x + fr(t * 0.05) * (pv.w * 1.4) - pv.w * 0.2;
      g.beginPath(); g.ellipse(cx, pv.y + pv.h * 0.3, pv.w * 0.16, pv.h * 0.06, 0, 0, TAU); g.fill();
      g.fillStyle = F.sh(0.08);
      const roofs = [[0, 0.62], [0.12, 0.5], [0.26, 0.68], [0.38, 0.44], [0.52, 0.58], [0.66, 0.52], [0.8, 0.64], [0.9, 0.48]];
      roofs.forEach(([rx, rh], i) => { const nx = (roofs[i + 1] || [1])[0]; g.fillRect(pv.x + rx * pv.w, pv.y + rh * pv.h, (nx - rx) * pv.w + 1, pv.h); });
      g.fillRect(pv.x + pv.w * 0.44, pv.y + pv.h * 0.3, pv.w * 0.03, pv.h * 0.2);
      g.beginPath(); g.ellipse(pv.x + pv.w * 0.455, pv.y + pv.h * 0.28, pv.w * 0.04, pv.h * 0.05, 0, 0, TAU); g.fill();
      g.strokeStyle = F.sh(0.7, 0.6); g.lineWidth = 2 * u; g.beginPath();
      for (let k = 0; k < 18; k++) { const yy = pv.y + pv.h * 0.4 - k * pv.h * 0.03, xx = pv.x + pv.w * 0.6 + Math.sin(k * 0.6 - t * 2) * pv.w * 0.02 + k * pv.w * 0.006; if (k) g.lineTo(xx, yy); else g.moveTo(xx, yy); }
      g.stroke();
      // Tracks.
      const ty = pv.y + pv.h + (L.phone ? 22 : 18) * u, th = L.phone ? S.h * 0.07 : S.h * 0.1, gap = th * 0.35;
      const rows = [[[0.0, 0.28], [0.3, 0.3, 1], [0.62, 0.36]], [[0.08, 0.36], [0.47, 0.25]], [[0.0, 0.94]]];
      rows.forEach((clips, rI) => clips.forEach(([a, w, hot], i) => {
        const q = eo(seg(p, 0.1 + (rI * 3 + i) * 0.06, 0.3 + (rI * 3 + i) * 0.06));
        if (q <= 0) return;
        const x = pv.x + pv.w * a, y = ty + rI * (th + gap), cw = pv.w * w * q - 4 * u;
        rr(g, x, y, Math.max(2, cw), th, 4 * u);
        g.fillStyle = hot ? F.acc(0.92) : rI === 2 ? F.sh(0.3) : F.sh(0.52); g.fill();
        if (rI === 2) { g.strokeStyle = F.sh(0.7); g.lineWidth = 1.2 * u; g.beginPath(); for (let k = 0; k < cw; k += 5 * u) { const am = th * 0.38 * Math.abs(Math.sin(k * 0.05 / u) * Math.sin(k * 0.013 / u + 1)); g.moveTo(x + k, y + th / 2 - am); g.lineTo(x + k, y + th / 2 + am); } g.stroke(); }
      }));
      const phx = pv.x + pv.w * fr(t * 0.12 + 0.35);
      g.fillStyle = F.acc(1); g.fillRect(phx - 1.5 * u, pv.y + pv.h + 6 * u, 3 * u, 3 * (th + gap) + 12 * u);
      g.beginPath(); g.moveTo(phx - 8 * u, pv.y + pv.h + 2 * u); g.lineTo(phx + 8 * u, pv.y + pv.h + 2 * u); g.lineTo(phx, pv.y + pv.h + 12 * u); g.fill();
      // Screen sheen.
      const sh = g.createLinearGradient(S.x, S.y, S.x + S.w, S.y + S.h);
      sh.addColorStop(0, F.lc(0.12)); sh.addColorStop(0.5, F.lc(0)); sh.addColorStop(1, F.lc(0.05));
      g.fillStyle = sh; g.fillRect(S.x, S.y, S.w, S.h);
      g.restore();
      // Steam over the cup.
      if (st.cup) {
        g.save(); g.strokeStyle = F.lc(0.22); g.lineWidth = 6 * u; g.lineCap = "round"; g.filter = `blur(${3 * u}px)`;
        for (let k = 0; k < 3; k++) {
          g.beginPath();
          for (let s = 0; s <= 20; s++) {
            const yy = st.cup.y - 96 * u - s * 9 * u, ph2 = t * 1.6 + k * 2.1;
            const xx = st.cup.x + (k - 1) * 16 * u + Math.sin(s * 0.35 - ph2) * (6 + s * 0.9) * u;
            if (s) g.lineTo(xx, yy); else g.moveTo(xx, yy);
          }
          g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 0.9 + k);
          g.stroke();
        }
        g.restore();
      }
      // Evidence tags tied to the parts they name.
      const anchors = [[pv.x + pv.w * 0.72, pv.y + pv.h * 0.32], [pv.x + pv.w * 0.45, ty + th / 2], [pv.x + pv.w * 0.5, ty + 2 * (th + gap) + th / 2]];
      [0, 1].forEach((pass) => d.callouts.forEach((label, i) => {
        const q = eo(seg(p, 0.3 + i * 0.16, 0.55 + i * 0.16));
        if (q <= 0) return;
        const hot = i === 1, [ax, ay] = anchors[i];
        const m = txt(g, label || "", 0, 0, 46 * u, { measure: true, maxW: L.tagW - 130 * u, min: 42 * u });
        const tw = Math.min(L.tagW, Math.max(300 * u, m.w + 130 * u)), th2 = 96 * u;
        const tx = L.tagX + (1 - q) * 60 * u, tyy = L.tagYs[i];
        const sway = Math.sin(t * 1.5 + i * 1.9) * 0.06 + Math.sin(t * 3.1 + i) * 0.015;
        const hx = tx + 34 * u, hy = tyy + th2 / 2;
        // String from the hole to the part, sagging.
        g.save(); g.globalAlpha = clamp(q * 1.6);
        if (pass === 0) {
        g.strokeStyle = hot ? F.acc(0.95) : F.sh(0.85, 0.9); g.lineWidth = (hot ? 3 : 2) * u;
        if (hot) { g.shadowColor = F.acc(0.8); g.shadowBlur = 10 * u; }
        const k = eo(seg(q, 0, 0.8)), ex = lerp(hx, ax, k), ey = lerp(hy, ay, k);
        g.beginPath(); g.moveTo(hx, hy); g.quadraticCurveTo((hx + ex) / 2, Math.max(hy, ey) + 70 * u * k, ex, ey); g.stroke();
        g.shadowBlur = 0;
        if (k > 0.95) {
          g.fillStyle = hot ? F.acc(1) : F.sh(0.95);
          g.beginPath(); g.arc(ax, ay, 7 * u, 0, TAU); g.fill();
          if (hot) { g.strokeStyle = F.acc(0.8 - 0.6 * fr(t * 0.8)); g.lineWidth = 2 * u; g.beginPath(); g.arc(ax, ay, 10 * u + fr(t * 0.8) * 26 * u, 0, TAU); g.stroke(); }
        }
        g.restore();
        return;
        }
        // The tag.
        g.translate(hx, hy); g.rotate(sway); g.translate(-hx, -hy);
        g.shadowColor = "rgba(0,0,0,0.55)"; g.shadowBlur = 18 * u; g.shadowOffsetY = 8 * u;
        poly(g, [[tx, tyy + 24 * u], [tx + 24 * u, tyy], [tx + tw, tyy], [tx + tw, tyy + th2], [tx + 24 * u, tyy + th2], [tx, tyy + th2 - 24 * u]]);
        const pg = g.createLinearGradient(tx, tyy, tx + tw, tyy + th2);
        pg.addColorStop(0, F.paper(1.04)); pg.addColorStop(1, F.paper(0.84));
        g.fillStyle = pg; g.fill();
        g.shadowColor = "transparent";
        mottle(g, F, tx, tyy, tw, th2, 0.25, 0.6, i * 40, 0, "multiply");
        g.strokeStyle = F.paper(0.6); g.lineWidth = 2 * u; g.strokeRect(tx + 54 * u, tyy + 10 * u, tw - 64 * u, th2 - 20 * u);
        g.fillStyle = F.sh(0.1); g.beginPath(); g.arc(hx, hy, 9 * u, 0, TAU); g.fill();
        g.strokeStyle = F.paper(0.7); g.lineWidth = 3 * u; g.stroke();
        if (hot) { g.fillStyle = "#1c1915"; g.fillRect(tx + 54 * u, tyy + th2 - 16 * u, tw - 64 * u, 5 * u); }
        txt(g, label || "", tx + 72 * u, hy + 2 * u, 46 * u, { base: "middle", color: F.T.paperInk, maxW: tw - 100 * u, min: 42 * u });
        g.restore();
      }));
      g.save(); g.fillStyle = F.lc(0.95); g.shadowColor = F.lc(1); g.shadowBlur = 30 * u;
      g.beginPath(); g.ellipse(st.lamp.x, st.lamp.y + 2 * u, 90 * u, 7 * u, 0, 0, TAU); g.fill(); g.restore();
      motes(g, F, st.lamp.x - 100 * u, st.lamp.y, 520 * u, L.deskY - st.lamp.y, 30, 17, 0.6);
      void W; void H; void tall;
    },
  };

  // ---- people: the line-up -----------------------------------------------------------------------
  // Original figures, front view. `kind` picks headwear and coat; returns hand height.
  function suspect(g, F, x, base, h, kind, col, detail) {
    const u = F.u, hw = h * 0.065;
    const headY = base - h * 0.885, sh = base - h * 0.79, hem = base - h * (kind % 2 ? 0.36 : 0.3);
    const wide = kind === 1 || kind === 4 ? 1.12 : 1;
    g.fillStyle = col;
    // Legs and shoes.
    g.fillRect(x - h * 0.07, hem - 4 * u, h * 0.055, base - hem);
    g.fillRect(x + h * 0.015, hem - 4 * u, h * 0.055, base - hem);
    g.beginPath(); g.ellipse(x - h * 0.05, base - 5 * u, h * 0.05, h * 0.018, 0, 0, TAU); g.ellipse(x + h * 0.05, base - 5 * u, h * 0.05, h * 0.018, 0, 0, TAU); g.fill();
    // Coat.
    g.beginPath();
    g.moveTo(x - h * 0.05, sh - h * 0.02);
    g.quadraticCurveTo(x - h * 0.15 * wide, sh - h * 0.015, x - h * 0.16 * wide, sh + h * 0.05);
    g.lineTo(x - h * (kind % 2 ? 0.17 : 0.14) * wide, hem);
    g.lineTo(x + h * (kind % 2 ? 0.17 : 0.14) * wide, hem);
    g.lineTo(x + h * 0.16 * wide, sh + h * 0.05);
    g.quadraticCurveTo(x + h * 0.15 * wide, sh - h * 0.015, x + h * 0.05, sh - h * 0.02);
    g.closePath(); g.fill();
    // Arms bent to hold the board at the chest.
    g.lineCap = "round"; g.strokeStyle = col; g.lineWidth = h * 0.055;
    g.beginPath(); g.moveTo(x - h * 0.145 * wide, sh + h * 0.06); g.lineTo(x - h * 0.16 * wide, sh + h * 0.23); g.lineTo(x - h * 0.06, sh + h * 0.3);
    g.moveTo(x + h * 0.145 * wide, sh + h * 0.06); g.lineTo(x + h * 0.16 * wide, sh + h * 0.23); g.lineTo(x + h * 0.06, sh + h * 0.3); g.stroke();
    // Neck and head.
    g.fillRect(x - h * 0.025, headY + hw * 0.8, h * 0.05, sh - headY);
    g.beginPath(); g.ellipse(x, headY, hw * 0.86, hw, 0, 0, TAU); g.fill();
    // Headwear and hair.
    g.beginPath();
    if (kind === 0) { g.ellipse(x + hw * 0.1, headY - hw * 0.7, hw * 1.05, hw * 0.45, -0.08, 0, TAU); g.moveTo(x - hw * 1.1, headY - hw * 0.45); g.ellipse(x - hw * 0.3, headY - hw * 0.42, hw * 1.0, hw * 0.16, 0, 0, TAU); }
    else if (kind === 1) { g.ellipse(x, headY - hw * 0.2, hw * 1.15, hw * 1.05, 0, Math.PI, TAU); g.rect(x - hw * 1.15, headY - hw * 0.2, hw * 0.4, hw * 1.2); g.rect(x + hw * 0.75, headY - hw * 0.2, hw * 0.4, hw * 1.2); }
    else if (kind === 2) { g.ellipse(x - hw * 0.1, headY - hw * 0.7, hw * 0.9, hw * 0.42, 0.15, 0, TAU); }
    else if (kind === 3) { g.ellipse(x + hw * 0.3, headY - hw * 0.75, hw * 1.15, hw * 0.4, 0.2, 0, TAU); g.moveTo(x + hw * 0.3, headY - hw * 1.1); g.arc(x + hw * 0.3, headY - hw * 1.15, hw * 0.12, 0, TAU); }
    else if (kind === 4) { g.rect(x - hw * 0.7, headY - hw * 1.35, hw * 1.4, hw * 0.6); g.ellipse(x, headY - hw * 0.1, hw * 1.05, hw * 0.95, 0, Math.PI, TAU); }
    else { g.ellipse(x, headY - hw * 1.05, hw * 0.55, hw * 0.5, 0, 0, TAU); g.ellipse(x, headY - hw * 0.25, hw * 0.98, hw * 0.9, 0, Math.PI, TAU); }
    g.fill();
    if (detail) {
      g.strokeStyle = detail; g.lineWidth = 2.2 * u;
      g.beginPath();
      g.moveTo(x - h * 0.05, sh - h * 0.015); g.lineTo(x - h * 0.01, sh + h * 0.12); g.moveTo(x + h * 0.05, sh - h * 0.015); g.lineTo(x + h * 0.01, sh + h * 0.12);
      if (kind % 2 === 0) { g.moveTo(x - h * 0.14, hem - h * 0.12); g.lineTo(x + h * 0.14, hem - h * 0.12); }
      g.moveTo(x, sh + h * 0.12); g.lineTo(x, hem);
      g.stroke();
      if (kind === 4) { g.strokeStyle = detail; g.lineWidth = 1 * u; g.beginPath(); for (let k = -3; k <= 3; k++) { g.moveTo(x + k * hw * 0.25, headY - hw * 0.75); g.lineTo(x + k * hw * 0.3, headY + hw * 0.1); } g.stroke(); }
    }
    return sh + h * 0.3;
  }
  function peopleLayout(F, d) {
    const { u, tall } = F, b = F.box;
    const n = Math.max(2, Math.min(6, Math.round(d.count) || 4));
    const floor = tall ? b.y + b.h * 0.97 : F.H * 0.93;
    const slot = b.w / n;
    const fh = Math.min(tall ? b.h * 0.7 : F.H * 0.6, slot * (tall ? 3.1 : 2.8));
    const hi = Math.min(n - 1, Math.max(0, d.highlight ?? 1));
    return { n, floor, slot, fh, hi };
  }
  const people = {
    set(g, F, p, d) {
      const { W, H, u, t, tall } = F, b = F.box, P = peopleLayout(F, d);
      g.fillStyle = F.sh(0.56); g.fillRect(0, 0, W, P.floor);
      mottle(g, F, 0, 0, W, P.floor, 0.45, 3, 0, 0, "overlay");
      // Height lines.
      const ft = P.fh / 6;
      const lines = [];
      for (let k = 2; k <= 9; k++) {
        const y = P.floor - k * ft;
        if (y < 0) break;
        const q = eo(seg(p, 0.02 * k - 0.04, 0.2 + 0.02 * k));
        g.fillStyle = F.sh(0.2); g.fillRect(0, y - (k % 2 ? 1.5 : 3) * u, W * q, (k % 2 ? 3 : 6) * u);
        lines.push({ k, y, q });
        for (let j = 1; j < 4; j++) { g.fillStyle = F.sh(0.34); g.fillRect(0, y + (j * ft) / 4 - 1 * u, W * q * 0.04 + 30 * u, 2 * u); }
      }
      // Floor.
      g.fillStyle = F.sh(0.26); g.fillRect(0, P.floor, W, H - P.floor);
      g.fillStyle = F.sh(0.66); g.fillRect(0, P.floor, W, 4 * u);
      g.strokeStyle = F.sh(0.18); g.lineWidth = 2 * u; g.beginPath();
      for (let x = -W; x < W * 2; x += 90 * u) { g.moveTo(x, P.floor); g.lineTo(x + (x - W / 2) * 0.6, H); }
      g.stroke();
      // Figures.
      const figs = [];
      for (let i = 0; i < P.n; i++) {
        const x = b.x + P.slot * (i + 0.5) + Math.sin(t * 0.7 + i * 2.3) * 3 * u;
        const hh = P.fh * (0.9 + 0.1 * hs(i * 7.7 + 1)) * (1 + 0.004 * Math.sin(t * 1.4 + i));
        const kind = (i * 5 + 1) % 6;
        const hand = suspect(g, F, x, P.floor, hh, kind, F.sh(i === P.hi ? 0.56 : 0.46), F.sh(i === P.hi ? 0.28 : 0.24));
        figs.push({ x, h: hh, hand, i });
      }
      return { P, figs, lines };
    },
    light(l, F, p, d, info, st) {
      const { W, H, u, t, tall } = F, P = st.P;
      // The flashbulb fires from camera left: a hard bloom that settles fast.
      const flashT = info.hold * 0.55, dt = info.local - flashT;
      const fl = dt < 0 ? 0 : dt < 0.04 ? dt / 0.04 : Math.exp(-(dt - 0.04) * 11);
      st.flash = fl;
      // The spotlight steps from suspect to suspect, sliding between them.
      const n = st.figs.length, ph = Math.max(0, info.local - 0.35) / 0.78;
      const i0 = Math.floor(ph) % n, i1 = (i0 + 1) % n, mv = eio(clamp((fr(ph) - 0.55) / 0.45));
      const f0 = st.figs[i0], f1 = st.figs[i1];
      const sx = i1 === 0 ? lerp(f0.x, f0.x + P.slot, mv) : lerp(f0.x, f1.x, mv);
      st.spot = { x: sx, i: mv < 0.5 ? i0 : i1 };
      for (const f of st.figs) {
        const on = seg(p, 0.01 + f.i * 0.035, 0.08 + f.i * 0.035);
        const flick = on > 0 && on < 1 ? (hs(Math.floor(info.local * 20) + f.i) > 0.4 ? 1 : 0.2) : on;
        const hot = f.i === P.hi, pw = (hot ? 0.62 : 0.42) * flick;
        cone(l, F, f.x, -40 * u, Math.PI / 2, 0.11, P.floor + 120 * u, pw * 0.7, 36 * u, 20);
        pool(l, F, f.x, P.floor - f.h * 0.55, P.slot * 0.42, f.h * 0.55, pw * 0.55);
        pool(l, F, f.x, P.floor + 20 * u, P.slot * 0.45, 46 * u, pw * 0.6);
      }
      const sp = seg(info.local, 0.3, 0.6);
      if (sp > 0) {
        cone(l, F, sx, -60 * u, Math.PI / 2, 0.16, P.floor + 160 * u, 1.0 * sp, 50 * u, 16);
        pool(l, F, sx, P.floor - P.fh * 0.5, P.slot * 0.5, P.fh * 0.6, 0.75 * sp);
        pool(l, F, sx, P.floor + 24 * u, P.slot * 0.6, 56 * u, 0.9 * sp);
      }
      if (fl > 0.002) {
        cone(l, F, -W * 0.06, H * 0.2, 0.3, 0.26, W * 0.75, 0.85 * fl, 40 * u, 24);
        pool(l, F, W * 0.04, H * 0.32, W * 0.3, H * 0.45, 0.45 * fl, 0.3);
        st.haze = 1 - 0.75 * fl;
      }
      // Corners fall away to black.
      dark(l, F, W * 0.5, H * 1.08, W * 0.7, H * 0.18, 0.5);
    },
    over(g, F, p, d, info, st) {
      const { W, H, u, t, tall } = F, P = st.P;
      // Height numerals at the wall edge.
      for (const ln of st.lines) {
        if (ln.k % 1 || ln.q < 0.5) continue;
        if (ln.k > 8) continue;
        txt(g, ln.k + "′", 78 * u, ln.y - 10 * u, 58 * u, { font: "disp", color: F.sh(1, ln.q), shadow: "rgba(0,0,0,0.9)", shadowBlur: 12 * u });
        txt(g, ln.k + "′", W - 78 * u, ln.y - 10 * u, 58 * u, { font: "disp", align: "right", color: F.sh(1, ln.q), shadow: "rgba(0,0,0,0.9)", shadowBlur: 12 * u });
      }
      // Rim light: every outline traced from above; the one under the spotlight burns brightest.
      const rimIn = seg(p, 0.04, 0.24);
      if (rimIn > 0) for (const f of st.figs) {
        const near = st.spot ? clamp(1 - Math.abs(st.spot.x - f.x) / (P.slot * 0.7)) * seg(info.local, 0.3, 0.6) : 0;
        rim(g, F, (rg, c) => suspect(rg, F, f.x, P.floor, f.h, (f.i * 5 + 1) % 6, c, null), -4 * u, 6 * u, F.lc(0.95), rimIn * (0.45 + 0.55 * near));
      }
      const hotF = st.figs[P.hi];
      if (hotF) {
        g.save(); g.globalAlpha = 0.5 * seg(p, 0.3, 0.6);
        g.filter = `blur(${30 * u}px)`; g.fillStyle = F.acc(0.25);
        g.beginPath(); g.ellipse(hotF.x, P.floor - hotF.h * 0.5, P.slot * 0.35, hotF.h * 0.55, 0, 0, TAU); g.fill();
        g.restore();
      }
      // Boards held at the chest.
      const sizes = st.figs.map((f) => {
        const label = d.badges[f.i % d.badges.length] || "";
        const m = txt(g, label, 0, 0, 54 * u, { measure: true, maxW: Math.max(P.slot * 0.92, 300 * u), min: 42 * u });
        return { label, w: Math.max(m.w + 56 * u, 230 * u) };
      });
      const crowded = sizes.some((s) => s.w > P.slot * 0.98);
      st.figs.forEach((f, i) => {
        const q = eo(seg(p, 0.07 + i * 0.05, 0.24 + i * 0.05));
        if (q <= 0 || !sizes[i].label) return;
        const hot = i === P.hi, bw = sizes[i].w, bh = 140 * u;
        const by = f.hand - bh * 0.5 + (crowded ? (i % 2 ? 76 : -76) * u : 0) + (1 - q) * 40 * u + Math.sin(t * 1.2 + i * 1.7) * 3 * u;
        g.save(); g.globalAlpha = clamp(q * 1.8);
        g.shadowColor = "rgba(0,0,0,0.6)"; g.shadowBlur = 14 * u; g.shadowOffsetY = 6 * u;
        g.fillStyle = hot ? F.acc(0.95) : F.T.plate; g.fillRect(f.x - bw / 2, by, bw, bh);
        g.shadowColor = "transparent";
        g.strokeStyle = hot ? F.T.plate : F.T.plateEdge; g.lineWidth = 2 * u; g.strokeRect(f.x - bw / 2 + 7 * u, by + 7 * u, bw - 14 * u, bh - 14 * u);
        txt(g, "No. " + (i + 1), f.x, by + 40 * u, 42 * u, { font: "disp", align: "center", base: "middle", color: hot ? F.T.paperInk : F.ink, track: 0.08 });
        g.fillStyle = hot ? "rgba(20,18,16,0.5)" : F.T.plateEdge; g.fillRect(f.x - bw * 0.3, by + 66 * u, bw * 0.6, 2 * u);
        txt(g, sizes[i].label, f.x, by + bh * 0.72, 54 * u, { align: "center", base: "middle", color: hot ? "#141210" : F.ink, maxW: bw - 30 * u, min: 42 * u });
        g.restore();
      });
      if (st.flash > 0.01) {
        // The bulb itself, blooming at the left edge.
        g.save(); g.globalCompositeOperation = "screen";
        const bl = g.createRadialGradient(-30 * u, H * 0.2, 0, -30 * u, H * 0.2, 520 * u * (0.7 + 0.3 * st.flash));
        bl.addColorStop(0, F.lc(st.flash)); bl.addColorStop(0.25, F.lc(0.5 * st.flash)); bl.addColorStop(1, F.lc(0));
        g.fillStyle = bl; g.fillRect(0, 0, W * 0.6, H);
        g.restore();
      }
      motes(g, F, 0, 0, W, P.floor, 44, 29, 0.5);
      void tall; void t;
    },
  };

  // ---- process: three lamps along a wet street -----------------------------------------------------
  function walker(g, F, x, y, wh, col) {
    const u = F.u, ph = x / (40 * u);
    g.save(); g.translate(x, y);
    g.fillStyle = col; g.strokeStyle = col;
    const leg = (a) => { g.save(); g.rotate(a); g.fillRect(-9 * u, -wh * 0.46, 18 * u, wh * 0.46); g.fillRect(-4 * u, -14 * u, 30 * u, 12 * u); g.restore(); };
    g.save(); g.translate(0, -wh * 0.02); leg(Math.sin(ph) * 0.38); leg(-Math.sin(ph) * 0.38); g.restore();
    g.beginPath(); g.moveTo(-wh * 0.13, -wh * 0.42); g.lineTo(-wh * 0.09, -wh * 0.84); g.quadraticCurveTo(0, -wh * 0.9, wh * 0.1, -wh * 0.84); g.lineTo(wh * 0.15, -wh * 0.4); g.closePath(); g.fill();
    g.beginPath(); g.arc(wh * 0.01, -wh * 0.93, wh * 0.065, 0, TAU); g.fill();
    g.lineWidth = 12 * u; g.lineCap = "round";
    g.beginPath(); g.moveTo(wh * 0.06, -wh * 0.78); g.lineTo(wh * 0.14, -wh * 0.64); g.lineTo(wh * 0.12, -wh * 0.98); g.stroke();
    g.lineWidth = 3 * u; g.beginPath(); g.moveTo(wh * 0.12, -wh * 0.6); g.lineTo(wh * 0.12, -wh * 1.18); g.stroke();
    g.beginPath(); g.moveTo(wh * 0.12 - wh * 0.36, -wh * 1.08); g.quadraticCurveTo(wh * 0.12, -wh * 1.48, wh * 0.12 + wh * 0.36, -wh * 1.08);
    for (let k = 3; k >= 0; k--) g.quadraticCurveTo(wh * 0.12 - wh * 0.36 + (k + 0.5) * wh * 0.18, -wh * 1.14, wh * 0.12 - wh * 0.36 + k * wh * 0.18, -wh * 1.08);
    g.fill();
    g.restore();
  }
  // A rounded 1940s sedan in profile (an original, generic shape), facing right.
  function sedan(g, x, y, s, col, hi) {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(0, -60); g.quadraticCurveTo(10, -92, 90, -100); g.quadraticCurveTo(150, -170, 250, -172);
    g.quadraticCurveTo(350, -170, 400, -104); g.quadraticCurveTo(500, -98, 520, -60); g.lineTo(525, 0); g.closePath(); g.fill();
    g.beginPath(); g.ellipse(70, -78, 70, 40, 0, Math.PI, TAU); g.ellipse(440, -76, 72, 40, 0, Math.PI, TAU); g.fill();
    if (hi) {
      g.strokeStyle = hi; g.lineWidth = 3;
      g.beginPath(); g.moveTo(96, -102); g.quadraticCurveTo(150, -168, 250, -170); g.quadraticCurveTo(345, -168, 396, -106); g.stroke();
      g.beginPath(); g.ellipse(440, -76, 72, 40, 0, Math.PI * 1.1, Math.PI * 1.75); g.stroke();
      g.beginPath(); g.ellipse(70, -78, 70, 40, 0, Math.PI * 1.2, Math.PI * 1.8); g.stroke();
      g.lineWidth = 2; g.beginPath(); g.moveTo(10, -58); g.lineTo(515, -58); g.stroke();
      g.fillStyle = hi; g.beginPath(); g.moveTo(170, -108); g.quadraticCurveTo(200, -156, 245, -158); g.lineTo(245, -108); g.closePath();
      g.moveTo(258, -108); g.lineTo(258, -158); g.quadraticCurveTo(320, -154, 360, -108); g.closePath();
      g.globalAlpha = 0.35; g.fill(); g.globalAlpha = 1;
    }
    g.fillStyle = "rgba(0,0,0,1)";
    g.beginPath(); g.arc(80, -4, 46, 0, TAU); g.arc(440, -4, 46, 0, TAU); g.fill();
    if (hi) { g.strokeStyle = hi; g.lineWidth = 4; g.beginPath(); g.arc(80, -4, 22, 0, TAU); g.moveTo(462, -4); g.arc(440, -4, 22, 0, TAU); g.stroke(); }
    g.restore();
  }
  // Light catching the top edge of a dark silhouette.
  function rim(g, F, draw, dx, dy, color, alpha) {
    const { W, H } = F, R = buf("RIM", W, H), rg = R.getContext("2d");
    rg.setTransform(1, 0, 0, 1, 0, 0); rg.globalCompositeOperation = "source-over"; rg.clearRect(0, 0, W, H);
    draw(rg, "#fff");
    rg.globalCompositeOperation = "destination-out"; rg.translate(dx, dy);
    draw(rg, "#fff");
    rg.setTransform(1, 0, 0, 1, 0, 0); rg.globalCompositeOperation = "source-in"; rg.fillStyle = color; rg.fillRect(0, 0, W, H);
    g.save(); g.globalAlpha = alpha; g.drawImage(R, 0, 0); g.restore();
  }
  function streetLayout(F, d) {
    const { u, tall, W } = F, b = F.box;
    const walk = tall ? b.y + b.h * 0.9 : b.y + b.h * 0.8;
    const xs = [0.17, 0.5, 0.83].map((k) => b.x + b.w * k);
    const lampH = (walk - b.y) * (tall ? 0.95 : 0.68), k = (tall ? 1.7 : 2.1) * u;
    // Wide: each step's sign hangs on the wall above its lamp, clear of the headline and the walker.
    const sy = Math.max(walk - lampH - 40 * k - 125 * u, headBottom("process-title", F) + 125 * u);
    const signs = xs.map((x, i) => tall ? { x, y: b.y + 150 * u + i * 220 * u } : { x, y: sy });
    const xs0 = b.x - 160 * u, xs1 = b.x + b.w + 160 * u;
    return { walk, xs, lampH, signs, xs0, xs1, k, foot: walk + (tall ? 140 : 150) * u };
  }
  // When the walker reaches each lamp; the lamp strikes then.
  function walkerX(Lw, F, local, hold) { return lerp(Lw.xs0, Lw.xs1, clamp(local / (hold * 1.02), 0, 1.4)); }
  function strike(Lw, F, i, local, hold) {
    const at = ((Lw.xs[i] - 40 * F.u - Lw.xs0) / (Lw.xs1 - Lw.xs0)) * hold * 1.02, k = local - at;
    if (k < 0) return 0;
    if (k < 0.08) return 0.8;
    if (k < 0.16) return 0.1;
    if (k < 0.22) return 0.7;
    if (k < 0.27) return 0.25;
    return clamp(0.6 + (k - 0.27) * 2);
  }
  const process = {
    set(g, F, p, d, info) {
      const { W, H, u, t, tall } = F, b = F.box, Lw = streetLayout(F, d);
      // Brick facade with windows and a fire escape.
      g.fillStyle = F.sh(0.4); g.fillRect(0, 0, W, Lw.walk);
      g.strokeStyle = F.sh(0.28); g.lineWidth = 2 * u; g.beginPath();
      const bh = 22 * u;
      for (let y = 0, r = 0; y < Lw.walk; y += bh, r++) { g.moveTo(0, y); g.lineTo(W, y); for (let x = (r % 2) * 30 * u; x < W; x += 60 * u) { g.moveTo(x, y); g.lineTo(x, y + bh); } }
      g.stroke();
      mottle(g, F, 0, 0, W, Lw.walk, 0.5, 2.6, 0, 0, "overlay");
      const wins = [];
      const wy = tall ? b.y + b.h * 0.56 : b.y - 30 * u;
      const wposX = tall ? [0.07, 0.36, 0.64, 0.93] : [-0.02, 0.335, 0.665, 1.02];
      for (let k = 0; k < wposX.length; k++) {
        const ww = (tall ? 120 : 150) * u, wh = 170 * u, wx = b.x + b.w * wposX[k] - ww / 2;
        g.fillStyle = F.sh(0.62); g.fillRect(wx - 10 * u, wy + wh, ww + 20 * u, 12 * u);
        g.fillStyle = F.sh(0.12); g.fillRect(wx, wy, ww, wh);
        wins.push({ x: wx, y: wy, w: ww, h: wh, k });
      }
      // A doorway with a step.
      const dx = tall ? W * 0.08 : W * 0.34, dw = 150 * u, dh = 270 * u;
      g.fillStyle = F.sh(0.08); g.fillRect(dx, Lw.walk - dh, dw, dh);
      g.fillStyle = F.sh(0.55); g.fillRect(dx - 14 * u, Lw.walk - dh - 16 * u, dw + 28 * u, 16 * u);
      // Sidewalk, curb, road.
      g.fillStyle = F.sh(0.45); g.fillRect(0, Lw.walk, W, 34 * u);
      g.strokeStyle = F.sh(0.3); g.lineWidth = 2 * u; g.beginPath(); for (let x = 0; x < W; x += 140 * u) { g.moveTo(x, Lw.walk); g.lineTo(x - 20 * u, Lw.walk + 34 * u); } g.stroke();
      g.fillStyle = F.sh(0.7); g.fillRect(0, Lw.walk + 34 * u, W, 6 * u);
      g.fillStyle = F.sh(0.12); g.fillRect(0, Lw.walk + 40 * u, W, H - Lw.walk);
      // Lamp posts.
      Lw.xs.forEach((x) => {
        const top = Lw.walk - Lw.lampH, k = Lw.k;
        g.fillStyle = F.sh(0.24);
        poly(g, [[x - 14 * k, Lw.walk], [x - 9 * k, Lw.walk - 50 * k], [x - 4.5 * k, top + 60 * k], [x + 4.5 * k, top + 60 * k], [x + 9 * k, Lw.walk - 50 * k], [x + 14 * k, Lw.walk]]);
        g.fill();
        g.fillRect(x - 17 * k, Lw.walk - 16 * k, 34 * k, 16 * k);
        g.fillRect(x - 11 * k, Lw.walk - 70 * k, 22 * k, 6 * k);
        poly(g, [[x - 22 * k, top + 60 * k], [x + 22 * k, top + 60 * k], [x + 16 * k, top + 52 * k], [x - 16 * k, top + 52 * k]]); g.fill();
        poly(g, [[x - 20 * k, top + 52 * k], [x + 20 * k, top + 52 * k], [x + 26 * k, top + 4 * k], [x - 26 * k, top + 4 * k]]);
        g.fillStyle = F.sh(0.5); g.fill();
        g.fillStyle = F.sh(0.2);
        g.fillRect(x - 1.5 * k, top + 4 * k, 3 * k, 48 * k);
        poly(g, [[x - 32 * k, top + 4 * k], [x + 32 * k, top + 4 * k], [x, top - 26 * k]]); g.fill();
        g.fillRect(x - 2 * k, top - 40 * k, 4 * k, 16 * k);
        g.fillStyle = F.sh(0.75); g.fillRect(x + 3 * k, top + 60 * k, 2 * k, Lw.lampH - 120 * k);
      });
      // The walker with an umbrella, and a parked car at the kerb.
      const wx = walkerX(Lw, F, info.local, info.hold), wh = (tall ? 300 : 280) * u;
      const car = { x: tall ? W * 0.62 : W * 0.08, y: Lw.walk + (tall ? 150 : 175) * u, s: (tall ? 0.8 : 1) * u };
      sedan(g, car.x, car.y, car.s, F.sh(0.12), F.sh(0.5));
      walker(g, F, wx, Lw.foot, wh, F.sh(0.1));
      // A blade sign bolted to the facade (wide frames only; the tall street keeps its signs clear).
      let neonSign = null;
      if (!tall) {
        const nx = b.x + b.w * 0.925, nh = 300 * u, ny = Lw.walk - 340 * u, nw = 78 * u;
        g.fillStyle = F.sh(0.3); g.fillRect(nx - 60 * u, ny + 30 * u, 60 * u, 6 * u); g.fillRect(nx - 60 * u, ny + nh - 40 * u, 60 * u, 6 * u);
        rr(g, nx - nw / 2, ny, nw, nh, 10 * u); g.fillStyle = F.sh(0.14); g.fill();
        g.strokeStyle = F.sh(0.45); g.lineWidth = 3 * u; rr(g, nx - nw / 2 + 6 * u, ny + 6 * u, nw - 12 * u, nh - 12 * u, 6 * u); g.stroke();
        neonSign = { x: nx, y: ny, w: nw, h: nh };
      }
      return { Lw, wins, wx, wh, car, neon: neonSign };
    },
    light(l, F, p, d, info, st) {
      const { W, H, u, t, tall } = F, Lw = st.Lw;
      st.on = Lw.xs.map((_, i) => strike(Lw, F, i, info.local, info.hold));
      Lw.xs.forEach((x, i) => {
        const on = Math.max(st.on[i], 0.12) * (0.9 + 0.1 * Math.sin(t * 11 + i) * (hs(Math.floor(t * 5) + i) > 0.6 ? 1 : 0.3)), top = Lw.walk - Lw.lampH;
        const pw = i === 2 ? 1 : 0.85;
        cone(l, F, x, top + 40 * Lw.k, Math.PI / 2, 0.38, Lw.lampH + (Lw.foot - Lw.walk) + 60 * u, 0.95 * on * pw, 70 * u, 20);
        pool(l, F, x, Lw.foot, 300 * u, 60 * u, 0.6 * on * pw);
        pool(l, F, x, top + 30 * Lw.k, 260 * u, 260 * u, 0.75 * on * pw);
        pool(l, F, x, Lw.walk + 20 * u, 340 * u, 80 * u, 0.9 * on * pw);
      });
      for (const w of st.wins) if (w.k % 2 === 0 || hs(w.k * 3.3 + Math.floor(t * 0.4 + w.k)) > 0.45) pool(l, F, w.x + w.w / 2, w.y + w.h / 2, w.w * 1.3, w.h * 1.0, 0.3);
      if (st.neon) { const nn = neon(t + 0.4); pool(l, F, st.neon.x, st.neon.y + st.neon.h / 2, 300 * u, st.neon.h * 0.9, 0.42 * nn); pool(l, F, st.neon.x, Lw.walk + 60 * u, 260 * u, 60 * u, 0.25 * nn); }
      rainShadows(l, F, 0, 0, W, Lw.walk, 14, 51);
    },
    over(g, F, p, d, info, st) {
      const { W, H, u, t, tall } = F, Lw = st.Lw;
      // Lit windows with blind slats.
      for (const w of st.wins) {
        if (!(w.k % 2 === 0 || hs(w.k * 3.3 + Math.floor(t * 0.4 + w.k)) > 0.45)) continue;
        g.fillStyle = F.sh(0.7, 0.85); g.fillRect(w.x, w.y, w.w, w.h);
        // Someone pacing behind the blind.
        g.save(); g.beginPath(); g.rect(w.x, w.y, w.w, w.h); g.clip();
        const px = w.x + w.w * (0.5 + 0.62 * Math.sin(t * (0.5 + w.k * 0.13) + w.k * 2)), pb = w.y + w.h;
        g.fillStyle = F.sh(0.22, 0.9);
        g.beginPath(); g.arc(px, pb - w.h * 0.62, w.w * 0.13, 0, TAU); g.fill();
        g.beginPath(); g.moveTo(px - w.w * 0.28, pb); g.quadraticCurveTo(px - w.w * 0.24, pb - w.h * 0.46, px, pb - w.h * 0.48); g.quadraticCurveTo(px + w.w * 0.24, pb - w.h * 0.46, px + w.w * 0.28, pb); g.fill();
        g.restore();
        g.fillStyle = F.sh(0.35, 0.85); for (let y = w.y + 8 * u; y < w.y + w.h; y += 16 * u) g.fillRect(w.x, y, w.w, 7 * u);
      }
      // The walker catches the lamplight on his shoulders and umbrella when he passes under a lamp.
      const near = Math.max(...Lw.xs.map((x, i) => st.on[i] * clamp(1 - Math.abs(st.wx - x) / (260 * u))), 0.25);
      rim(g, F, (rg, c) => walker(rg, F, st.wx, Lw.foot, st.wh, c), -3 * u, 5 * u, F.lc(0.9), near);
      rim(g, F, (rg, c) => sedan(rg, st.car.x, st.car.y, st.car.s, c, null), 0, 6 * u, F.lc(0.6), 0.7);
      // Lantern glass.
      Lw.xs.forEach((x, i) => {
        const on = st.on[i], top = Lw.walk - Lw.lampH, k = Lw.k;
        g.save();
        poly(g, [[x - 17 * k, top + 49 * k], [x + 17 * k, top + 49 * k], [x + 22 * k, top + 7 * k], [x - 22 * k, top + 7 * k]]);
        const glow = on > 0 ? Math.max(on, 0.3) : 0;
        g.fillStyle = on > 0 && i === 2 ? F.acc(0.6 + 0.4 * on) : F.sh(0.3 + 0.7 * glow);
        g.shadowColor = i === 2 && on > 0 ? F.acc(1) : F.lc(1); g.shadowBlur = 40 * u * glow;
        g.fill();
        g.restore();
        // Reflection rippling on the wet road.
        if (on > 0) {
          g.save(); g.globalAlpha = 0.5 * on;
          for (let k = 0; k < 14; k++) {
            const y = Lw.walk + 50 * u + k * 12 * u;
            if (y > H) break;
            const wv = Math.sin(t * 4 + k * 1.3 + i) * 10 * u, wd = (26 - k * 1.2) * u;
            g.fillStyle = i === 2 ? F.acc(0.5 - k * 0.03) : F.lc(0.5 - k * 0.03);
            g.fillRect(x - wd + wv, y, wd * 2, 5 * u);
          }
          g.restore();
        }
      });
      // Signs: numeral and step, brighter once their lamp is lit; arrows join them.
      const signBox = Lw.signs.map((s, i) => {
        const m = txt(g, d.steps[i] || "", 0, 0, 58 * u, { measure: true, maxW: tall ? W * 0.66 : F.box.w / 3 - 50 * u, min: 42 * u });
        const w = Math.max(330 * u, m.w + 70 * u), h = 210 * u;
        const cx = clamp(s.x, 80 * u + w / 2, W - 80 * u - w / 2);
        return { x: cx - w / 2, y: s.y - h / 2, w, h };
      });
      signBox.forEach((sb, i) => {
        const on = st.on[i], appear = eo(seg(p, 0.02 + i * 0.05, 0.22 + i * 0.05));
        if (appear <= 0) return;
        const sway = Math.sin(t * 1.4 + i * 2) * 0.02;
        g.save(); g.globalAlpha = appear;
        g.translate(sb.x + sb.w / 2, sb.y); g.rotate(sway); g.translate(-(sb.x + sb.w / 2), -sb.y);
        g.strokeStyle = F.sh(0.2); g.lineWidth = 3 * u; g.beginPath(); g.moveTo(sb.x + 24 * u, sb.y); g.lineTo(sb.x + sb.w / 2, sb.y - 26 * u); g.lineTo(sb.x + sb.w - 24 * u, sb.y); g.stroke();
        g.shadowColor = "rgba(0,0,0,0.6)"; g.shadowBlur = 16 * u; g.shadowOffsetY = 6 * u;
        g.fillStyle = F.T.plate; g.fillRect(sb.x, sb.y, sb.w, sb.h);
        g.shadowColor = "transparent";
        const lit = 0.55 + 0.45 * on, hot = i === 2;
        g.strokeStyle = hot && on > 0 ? F.acc(0.9) : F.T.plateEdge; g.lineWidth = 2 * u; g.strokeRect(sb.x + 8 * u, sb.y + 8 * u, sb.w - 16 * u, sb.h - 16 * u);
        txt(g, String(i + 1).padStart(2, "0"), sb.x + sb.w / 2, sb.y + 74 * u, 96 * u, { font: "disp", align: "center", base: "middle", color: hot && on > 0 ? F.acc(lit) : F.sh(1, lit), glow: on > 0.5 ? 18 * u : 0, glowColor: F.lc(0.7) });
        txt(g, d.steps[i] || "", sb.x + sb.w / 2, sb.y + 162 * u, 58 * u, { align: "center", base: "middle", color: hot && on > 0 ? F.acc(1) : F.ink, maxW: sb.w - 40 * u, min: 42 * u });
        g.restore();
        if (i < 2) {
          const nb = signBox[i + 1], k = eo(seg(st.on[i + 1] > 0 ? 1 : 0, 0, 1)) * appear;
          const a = tall ? [Math.min(sb.x + sb.w * 0.8, nb.x + nb.w * 0.2), sb.y + sb.h + 8 * u] : [sb.x + sb.w + 14 * u, sb.y + sb.h / 2];
          const bpt = tall ? [Math.min(sb.x + sb.w * 0.8, nb.x + nb.w * 0.2) + 40 * u, nb.y - 34 * u] : [nb.x - 14 * u, nb.y + nb.h / 2];
          const q = Math.min(k, eo(seg(info.local, 0, 0.6)) * 0.35 + (st.on[i + 1] > 0 ? 0.65 : 0));
          if (q > 0) {
            g.save(); g.strokeStyle = F.sh(0.9, 0.85); g.lineWidth = 3 * u; g.setLineDash([14 * u, 9 * u]); g.lineDashOffset = -t * 40 * u;
            const ex = lerp(a[0], bpt[0], q), ey = lerp(a[1], bpt[1], q);
            g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(ex, ey); g.stroke(); g.setLineDash([]);
            if (q > 0.6) { const ang = Math.atan2(bpt[1] - a[1], bpt[0] - a[0]); g.translate(ex, ey); g.rotate(ang); g.beginPath(); g.moveTo(0, 0); g.lineTo(-16 * u, -10 * u); g.lineTo(-16 * u, 10 * u); g.closePath(); g.fillStyle = F.sh(0.9); g.fill(); }
            g.restore();
          }
        }
      });
      if (st.neon) {
        const N = st.neon, letters = "CAFE".split(""), sz = 58 * u;
        letters.forEach((ch, i) => {
          const bad = i === 2 && hs(Math.floor(t * 8) + 3) > 0.6, on = neon(t + 0.4 + i * 0.07) * (bad ? 0.2 : 1);
          txt(g, ch, N.x, N.y + 26 * u + i * sz * 1.12, sz, { font: "disp", align: "center", base: "top", color: F.sh(0.55 + 0.45 * on, 0.4 + 0.6 * on), glow: 26 * u * on, glowColor: F.lc(0.95) });
        });
        // Its reflection breaking up on the wet road.
        g.save(); g.globalAlpha = 0.35 * neon(t + 0.4);
        for (let k = 0; k < 10; k++) { const y = Lw.walk + 56 * u + k * 13 * u; if (y > H) break; const wv = Math.sin(t * 3.4 + k * 1.7) * 9 * u; g.fillStyle = F.lc(0.5 - k * 0.04); g.fillRect(N.x - 16 * u + wv, y, 32 * u, 5 * u); }
        g.restore();
      }
      // The route chalked along the pavement, drawn behind the walker as he goes from lamp to lamp.
      {
        const py = Lw.foot + 6 * u, x0 = Lw.xs[0], x1 = clamp(st.wx, x0, Lw.xs[2]);
        g.save();
        g.strokeStyle = F.lc(0.25); g.lineWidth = 4 * u; g.setLineDash([22 * u, 14 * u]);
        g.beginPath(); g.moveTo(x0, py); g.lineTo(Lw.xs[2], py); g.stroke();
        if (x1 > x0) {
          g.strokeStyle = F.sh(1, 0.95); g.lineWidth = 6 * u; g.lineDashOffset = -t * 60 * u; g.shadowColor = F.lc(0.9); g.shadowBlur = 10 * u;
          g.beginPath(); g.moveTo(x0, py); g.lineTo(x1, py); g.stroke();
        }
        g.setLineDash([]);
        Lw.xs.forEach((x, i) => {
          const on = st.on[i] > 0, hot = i === 2;
          g.fillStyle = on ? (hot ? F.acc(1) : F.lc(1)) : F.sh(0.35); g.shadowBlur = on ? 16 * u : 0;
          g.beginPath(); g.arc(x, py, 11 * u, 0, TAU); g.fill();
          if (on) { const k = fr(t * 0.9 + i * 0.3); g.strokeStyle = hot ? F.acc(1 - k) : F.lc(1 - k); g.lineWidth = 2.5 * u; g.beginPath(); g.ellipse(x, py, 14 * u + k * 46 * u, (14 * u + k * 46 * u) * 0.32, 0, 0, TAU); g.stroke(); }
        });
        g.restore();
      }
      // Rain and splashes.
      rain(g, F, { x: -80 * u, y: 0, w: W + 80 * u, h: H, n: tall ? 150 : 200, alpha: 0.3, len: 40, slant: 0.1, speed: 1600, seed: 8 });
      g.strokeStyle = F.lc(0.35); g.lineWidth = 1.5 * u;
      for (let i = 0; i < 16; i++) {
        const sd = i * 2.9, cyc = 0.7 + hs(sd) * 0.5, k = fr(t / cyc + hs(sd + 1)), x = hs(sd + Math.floor(t / cyc + hs(sd + 1))) * W;
        const y = Lw.walk + 60 * u + hs(sd + 3) * Math.max(10 * u, H - Lw.walk - 70 * u);
        g.globalAlpha = 1 - k; g.beginPath(); g.ellipse(x, y, 6 * u + k * 30 * u, 2 * u + k * 6 * u, 0, 0, TAU); g.stroke();
      }
      g.globalAlpha = 1;
    },
  };

  // ---- compare: two stacks of files under a swinging lamp ----------------------------------------
  function compareLayout(F, d) {
    const { u, tall, W } = F, b = F.box;
    const table = b.y + b.h * (tall ? 0.62 : 0.58);
    const xs = tall ? [b.x + b.w * 0.25, b.x + b.w * 0.75] : [b.x + b.w * 0.31, b.x + b.w * 0.69];
    const sw = tall ? Math.min(b.w * 0.44, 360 * u) : Math.min(b.w * 0.26, 400 * u);
    const ft = 17 * u, room = table - (b.y + (tall ? 30 : 140) * u), maxN = Math.max(4, Math.floor(room / ft));
    const vals = [Math.max(0, Number(d.leftValue) || 0), Math.max(0, Number(d.rightValue) || 0)];
    const mx = Math.max(...vals, 1);
    const counts = vals.map((v) => (v > 0 ? Math.max(1, Math.round((v / mx) * maxN)) : 0));
    return { table, xs, sw, ft, counts, vals, pivot: { x: W / 2, y: 0 }, cord: b.y - (tall ? 40 : 10) * u };
  }
  const compare = {
    set(g, F, p, d, info) {
      const { W, H, u, t, tall } = F, b = F.box, C = compareLayout(F, d);
      g.fillStyle = F.sh(0.38); g.fillRect(0, 0, W, C.table);
      mottle(g, F, 0, 0, W, C.table, 0.5, 3.2, 0, 0, "overlay");
      // A wall map of the city with pins, behind.
      const mp = tall ? { x: b.x + b.w * 0.56, y: b.y - 150 * u, w: b.w * 0.42, h: 180 * u } : { x: b.x + b.w * 0.74, y: b.y - 60 * u, w: b.w * 0.24, h: 210 * u };
      g.fillStyle = F.sh(0.62); g.fillRect(mp.x, mp.y, mp.w, mp.h);
      g.strokeStyle = F.sh(0.4); g.lineWidth = 2 * u; g.beginPath();
      const r = rng(61);
      for (let k = 0; k < 9; k++) { g.moveTo(mp.x + r() * mp.w, mp.y); g.lineTo(mp.x + r() * mp.w, mp.y + mp.h); g.moveTo(mp.x, mp.y + r() * mp.h); g.lineTo(mp.x + mp.w, mp.y + r() * mp.h); }
      g.stroke();
      g.strokeStyle = F.sh(0.25); g.lineWidth = 6 * u; g.beginPath(); g.moveTo(mp.x, mp.y + mp.h * 0.7); g.bezierCurveTo(mp.x + mp.w * 0.3, mp.y + mp.h * 0.4, mp.x + mp.w * 0.6, mp.y + mp.h, mp.x + mp.w, mp.y + mp.h * 0.5); g.stroke();
      g.strokeStyle = F.sh(0.2); g.lineWidth = 6 * u; g.strokeRect(mp.x, mp.y, mp.w, mp.h);
      // Pins joined by string.
      const pins = [0.2, 0.55, 0.8].map((k, i) => [mp.x + mp.w * k, mp.y + mp.h * (0.3 + 0.4 * hs(i + 4))]);
      g.strokeStyle = F.sh(0.85); g.lineWidth = 2 * u; g.beginPath(); pins.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
      pins.forEach(([x, y]) => { g.fillStyle = F.sh(0.95); g.beginPath(); g.arc(x, y, 7 * u, 0, TAU); g.fill(); });
      // Table.
      g.fillStyle = F.sh(0.34); g.fillRect(0, C.table, W, H - C.table);
      g.fillStyle = F.sh(0.62); g.fillRect(0, C.table, W, 4 * u);
      g.fillStyle = F.sh(0.2); g.fillRect(0, C.table + 26 * u, W, 6 * u);
      // Stacks of folders landing one by one.
      const total = C.counts[0] + C.counts[1];
      const stacks = [0, 1].map((s) => {
        const n = C.counts[s], x = C.xs[s], r2 = rng(200 + s * 31);
        let y = C.table, topY = C.table;
        for (let j = 0; j < n; j++) {
          const jitter = (r2() - 0.5) * 22 * u, rot = (r2() - 0.5) * 0.05, tone = [0.34, 0.62, 0.48, 0.74][Math.floor(r2() * 4)], tab = r2();
          const a0 = s === 0 ? (j / Math.max(1, C.counts[0])) * 0.36 : 0.46 + (j / Math.max(1, C.counts[1])) * 0.14;
          const q = seg(p, a0, a0 + 0.1);
          if (q <= 0) break;
          const fall = Math.pow(1 - q, 2) * 260 * u;
          const fy = y - C.ft - fall;
          g.save(); g.translate(x + jitter, fy + C.ft / 2); g.rotate(rot + (1 - q) * 0.2 * (s ? -1 : 1));
          const hw = C.sw / 2, fh2 = C.ft - 1 * u;
          // Pages poking out, the folder's spine, a tab and a lit top edge.
          g.fillStyle = F.sh(0.92); g.fillRect(-hw + 8 * u + tab * 14 * u, -fh2 / 2 + 2 * u, C.sw - 20 * u, fh2 * 0.45);
          g.fillStyle = F.sh(tone); g.fillRect(-hw, -fh2 / 2 + fh2 * 0.4, C.sw, fh2 * 0.6);
          g.fillStyle = F.sh(tone * 0.55); g.fillRect(-hw, fh2 / 2 - 3 * u, C.sw, 3 * u);
          g.fillStyle = F.sh(Math.min(1, tone + 0.3)); g.fillRect(-hw, -fh2 / 2 + fh2 * 0.4, C.sw, 2 * u);
          g.fillStyle = F.sh(tone * 0.85); g.fillRect(-hw + C.sw * (0.12 + tab * 0.6), -fh2 / 2 - 5 * u, 56 * u, 7 * u);
          if (j % 3 === 1) { g.fillStyle = F.sh(0.95); g.fillRect(-hw + C.sw * 0.3, -fh2 / 2 + fh2 * 0.5, C.sw * 0.22, fh2 * 0.32); }
          g.restore();
          y -= C.ft; topY = fy;
        }
        return { x, top: topY, n };
      });
      // Pendant lamp on its cord, swinging.
      const ang = 0.14 * Math.sin(t * 1.15) + 0.025 * Math.sin(t * 2.3);
      const len = C.cord, lx = C.pivot.x + Math.sin(ang) * len, ly = Math.cos(ang) * len;
      g.strokeStyle = F.sh(0.15); g.lineWidth = 3 * u; g.beginPath(); g.moveTo(C.pivot.x, 0); g.lineTo(lx, ly); g.stroke();
      g.save(); g.translate(lx, ly); g.rotate(-ang);
      g.fillStyle = F.sh(0.3); g.beginPath(); g.moveTo(-14 * u, 0); g.lineTo(14 * u, 0); g.lineTo(18 * u, 20 * u); g.lineTo(-18 * u, 20 * u); g.fill();
      g.beginPath(); g.moveTo(-18 * u, 20 * u); g.quadraticCurveTo(-30 * u, 40 * u, -120 * u, 86 * u); g.lineTo(120 * u, 86 * u); g.quadraticCurveTo(30 * u, 40 * u, 18 * u, 20 * u); g.closePath();
      g.fillStyle = F.sh(0.42); g.fill();
      g.fillStyle = F.sh(0.75); g.fillRect(-120 * u, 82 * u, 240 * u, 4 * u);
      g.restore();
      return { C, stacks, lamp: { x: lx, y: ly, ang }, haze: 1.1 };
    },
    light(l, F, p, d, info, st) {
      const { W, H, u, t } = F, C = st.C, L = st.lamp;
      const bx = L.x + Math.sin(L.ang) * 86 * u, by = L.y + Math.cos(L.ang) * 86 * u;
      cone(l, F, bx, by, Math.PI / 2 - L.ang, 0.62, C.table - by + 260 * u, 1.0, 220 * u, 26);
      pool(l, F, bx + Math.tan(L.ang) * (C.table - by), C.table - 60 * u, W * 0.4, 200 * u, 0.7);
      blinds(l, F, { x: -W * 0.1, y: -H * 0.05, w: W * 0.6, h: C.table + H * 0.05, slope: 0.22, skew: -0.3, period: 58 * u, duty: 0.46, power: 0.42 * neon(t) });
      rainShadows(l, F, 0, 0, W * 0.5, C.table, 14, 71);
      for (const s of [0, 1]) pool(l, F, C.xs[s], C.table + 120 * u, C.sw * 0.8, 110 * u, 0.3);
      const tall = F.tall, b = F.box;
      pool(l, F, tall ? b.x + b.w * 0.77 : b.x + b.w * 0.86, tall ? b.y - 60 * u : b.y + 45 * u, 300 * u, 220 * u, 0.45);
      sweep(l, F, { y: -H * 0.05, h: C.table + H * 0.05, power: 0.45, period: 3.0, phase: 0.75 });
    },
    over(g, F, p, d, info, st) {
      const { W, H, u, t, tall } = F, C = st.C, b = F.box, L = st.lamp;
      // Bulb glow.
      const bx = L.x + Math.sin(L.ang) * 80 * u, by = L.y + Math.cos(L.ang) * 80 * u;
      g.save(); g.translate(L.x, L.y); g.rotate(-L.ang);
      g.strokeStyle = F.lc(0.55); g.lineWidth = 2.5 * u;
      g.beginPath(); g.moveTo(18 * u, 20 * u); g.quadraticCurveTo(30 * u, 40 * u, 120 * u, 84 * u); g.stroke();
      g.strokeStyle = F.lc(0.25); g.beginPath(); g.moveTo(-18 * u, 20 * u); g.quadraticCurveTo(-30 * u, 40 * u, -120 * u, 84 * u); g.stroke();
      const ug = g.createLinearGradient(0, 70 * u, 0, 92 * u); ug.addColorStop(0, F.lc(0)); ug.addColorStop(1, F.lc(0.9));
      g.fillStyle = ug; g.beginPath(); g.ellipse(0, 86 * u, 116 * u, 10 * u, 0, 0, TAU); g.fill();
      g.restore();
      g.save(); g.fillStyle = F.lc(1); g.shadowColor = F.lc(1); g.shadowBlur = 40 * u; g.beginPath(); g.ellipse(bx, by, 34 * u, 10 * u, -L.ang, 0, TAU); g.fill(); g.restore();
      motes(g, F, bx - 240 * u, by, 480 * u, C.table - by, 40, 41, 0.7);
      // Each pile thuds down in turn: a puff of dust kicks out from under the last folder to land.
      [0, 1].forEach((sI) => {
        const n = C.counts[sI];
        if (!n) return;
        const a0 = sI === 0 ? ((n - 1) / Math.max(1, n)) * 0.36 : 0.46 + ((n - 1) / Math.max(1, n)) * 0.14;
        const land = info.hold * 0.55 * (a0 + 0.1), k = (info.local - 0.25 - land) / 0.9;
        if (k <= 0 || k >= 1) return;
        g.save(); g.filter = `blur(${6 * u}px)`;
        for (const side of [-1, 1]) {
          g.fillStyle = F.lc(0.35 * (1 - k));
          g.beginPath(); g.ellipse(C.xs[sI] + side * (C.sw * 0.5 + eo(k) * 90 * u), C.table - 10 * u - k * 20 * u, 30 * u + k * 50 * u, 12 * u + k * 14 * u, 0, 0, TAU); g.fill();
        }
        g.restore();
      });
      // Plates on the table front: label and the big figure.
      [[d.left, C.vals[0], 0], [d.right, C.vals[1], 1]].forEach(([label, v, s]) => {
        const q = eo(seg(p, 0.1 + s * 0.25, 0.45 + s * 0.25));
        if (q <= 0) return;
        const hot = s === 1, x = C.xs[s], pw = Math.max(C.sw, 300 * u), py = C.table + 40 * u, ph = Math.min(Math.min(b.y + b.h + 70 * u, H - 20 * u) - py, 280 * u);
        g.save(); g.globalAlpha = clamp(q * 2);
        g.shadowColor = "rgba(0,0,0,0.6)"; g.shadowBlur = 18 * u; g.shadowOffsetY = 8 * u;
        g.fillStyle = F.T.plate; g.fillRect(x - pw / 2, py, pw, ph);
        g.shadowColor = "transparent";
        g.strokeStyle = hot ? F.acc(0.85) : F.T.plateEdge; g.lineWidth = 2 * u; g.strokeRect(x - pw / 2 + 9 * u, py + 9 * u, pw - 18 * u, ph - 18 * u);
        txt(g, label || "", x, py + 54 * u, 52 * u, { align: "center", base: "middle", color: hot ? F.acc(1) : F.ink, maxW: pw - 40 * u, min: 42 * u });
        txt(g, fmt(v, q, d), x, py + Math.min(ph - 22 * u, 215 * u), Math.min(150 * u, ph * 0.62), { font: "disp", align: "center", color: hot ? F.acc(1) : F.ink, glow: hot ? 20 * u : 0, glowColor: F.acc(0.6), maxW: pw - 40 * u, min: 96 * u });
        g.restore();
      });
      // The stamp lands on the second plate.
      const [lv, rv] = C.vals;
      if (lv > 0) {
        const sq = seg(info.local, info.hold * 0.62, info.hold * 0.62 + 0.18);
        if (sq > 0) {
          const pct = Math.round(((rv - lv) / lv) * 100);
          const s = 1 + (1 - eo(sq)) * 0.8, x = C.xs[1] + (F.tall ? 0 : C.sw * 0.62), y = C.table - (F.tall ? 260 : 150) * u;
          g.save(); g.translate(x, y); g.rotate(-0.16); g.scale(s, s); g.globalAlpha = clamp(sq * 3) * 0.95;
          const label = `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%`;
          const m = txt(g, label, 0, 0, 96 * u, { font: "disp", measure: true });
          const w = m.w + 70 * u, h = 136 * u;
          g.strokeStyle = F.acc(1); g.lineWidth = 5 * u; g.strokeRect(-w / 2, -h / 2, w, h);
          g.lineWidth = 2 * u; g.strokeRect(-w / 2 + 9 * u, -h / 2 + 9 * u, w - 18 * u, h - 18 * u);
          txt(g, label, 0, 6 * u, 96 * u, { font: "disp", align: "center", base: "middle", color: F.acc(1) });
          g.restore();
        }
      }
      void tall; void t;
    },
  };

  const WORLDS = { title: office, closing: windowWorld, chart, object, people, process, compare };
  // The window closing bookends the office title; without it the reel ends on the stamped case file.
  const worldOf = (id) => (id === "closing" && !shownList().some((s) => s.id === "title") ? caseDesk : WORLDS[id]);
  const STAGE = { index: -1, scene: null, prev: null };
  function shownList() {
    const c = (window.__dreamcut && window.__dreamcut.controls) || {};
    return ORDER.map((id) => ({ id, hold: Number(c[id + "_hold"] ?? DEF_HOLDS[id]) || 0 })).filter((s) => s.hold > 0);
  }
  function drawer(id) {
    return (ctx, S, box, p, d, info) => {
      const F = frameOf(S, info, box);
      const A = render(F, WORLDS[id], p, d, info);
      let mode = null, k = 1;
      if (info.exit !== undefined) { if (!DRAWN.has(STAGE.scene)) { mode = "out"; k = eio(info.exit); } }
      else if (STAGE.prev && info.local < info.change) { mode = "in"; k = eio(info.local / Math.max(0.01, info.change)); }
      ctx.save(); ctx.globalAlpha = 1;
      put(ctx, F, A, mode, k, camOf(F, info, 0.09, ORDER.indexOf(id) % 2 ? 1 : -1));
      ctx.restore();
    };
  }
  function statement(ctx, S, id, info, mode, k) {
    const F = frameOf(S, info, null);
    const A = render(F, worldOf(id), 1, {}, info);
    put(ctx, F, A, mode, k, camOf(F, info, 0.1, id === "closing" ? -1 : 1));
  }

  return {
    bg: "#121214", panel: "rgba(236,230,218,0.08)", ink: "#f1ece2", muted: "#b9b3a8", accent: "#fff4d8", onAccent: "#121214",
    rule: "rgba(236,230,218,0.7)", track: "rgba(236,230,218,0.12)",
    display: DISP, displayWeight: 700, displayCase: "uppercase", displayTracking: "0.05em",
    body: TYPE, bodyWeight: 500, figures: DISP, radius: 2, motion: "type", change: "fade",
    kit: { line: 2.4, fill: "solid", panel: "fill" }, panelEdge: "rgba(236,230,218,0.4)",
    tone: TONE,
    palettes: {
      // Matinee: a pale, faded silver print. Midnight: crushed blacks, hard light. Mono: neutral greys.
      light: { bg: "#d9d6cf", panel: "rgba(20,18,16,0.06)", ink: "#141311", muted: "#4a4740", accent: "#111010", onAccent: "#f2efe8", rule: "rgba(20,18,16,0.6)", track: "rgba(20,18,16,0.1)", panelEdge: "rgba(20,18,16,0.35)",
        textShadow: () => "0 0 2px rgba(255,255,255,0.7), 0 0 26px rgba(255,255,255,0.85)",
        backdrop: () => "radial-gradient(ellipse at 45% 40%, #ebe8e1 0%, #c9c5bc 100%)",
        tone: { ...TONE, lo: [96, 93, 88], hi: [250, 248, 243], amb: 0.6, haze: 0.25, light: true, contrast: 1.06, bright: 1, plate: "rgba(248,246,240,0.94)", plateEdge: "rgba(20,18,16,0.45)", veil: "255,255,255" } },
      dark: { bg: "#050506", ink: "#ece9e3", muted: "#9d9890",
        backdrop: () => "radial-gradient(ellipse at 45% 40%, #1a1a1c 0%, #020203 100%)",
        tone: { ...TONE, lo: [2, 2, 3], hi: [226, 223, 216], amb: 0.1, haze: 0.5, contrast: 1.3 } },
      mono: { bg: "#111111", ink: "#eeeeee", muted: "#aaaaaa", accent: "#ffffff", onAccent: "#111111", rule: "rgba(238,238,238,0.7)", track: "rgba(238,238,238,0.12)", panelEdge: "rgba(238,238,238,0.4)",
        backdrop: () => "radial-gradient(ellipse at 45% 40%, #2a2a2a 0%, #080808 100%)",
        tone: { ...TONE, lo: [8, 8, 8], hi: [236, 236, 236], lc: "255,255,255", paper: [222, 222, 220], plate: "rgba(12,12,12,0.9)", plateEdge: "rgba(236,236,236,0.55)" } },
    },
    textShadow: () => "0 2px 3px rgba(0,0,0,0.75), 0 0 30px rgba(0,0,0,0.9)",
    backdrop: () => "radial-gradient(ellipse at 45% 40%, #2b2a28 0%, #070707 100%)",
    css: (accent, look) => {
      const r = typeof document !== "undefined" && document.getElementById("root");
      const wide = !r || Number(r.dataset.width || 1920) >= Number(r.dataset.height || 1080);
      // In wide frames the statements keep to a column, clear of the drawn set to their right.
      return (wide ? `#root #title, #root #closing { max-width: 70% !important; }\n` : "") + `#root .kicker { font-family: ${TYPE}; letter-spacing: 0.32em; color: ${look.muted}; }
      #root .display { -webkit-font-smoothing: antialiased; }
      #title-scene .kicker::before { content: ""; display: inline-block; width: 2.4em; height: 2px; margin: 0 0.9em 0.28em 0; background: currentColor; vertical-align: middle; }`;
    },
    // The film pass over everything: grain, flicker, scratches, dust, vignette and gate weave.
    paintOver: true,
    paint: (ctx, W, H, t, accent, look) => {
      ctx.clearRect(0, 0, W, H);
      const u = Math.min(W, H) / 1080, T = look.tone || TONE, f = Math.floor(t * 24), tex = look.texture ?? 1;
      const art = typeof document !== "undefined" && document.getElementById("art");
      if (art) {
        const dx = ((hs(f * 1.3) - 0.5) * 2.4 * u + Math.sin(t * 1.7) * 0.9 * u) * tex, dy = ((hs(f * 2.1 + 4) - 0.5) * 1.8 * u + Math.sin(t * 2.3) * 0.6 * u) * tex;
        art.style.transform = `translate(${dx.toFixed(2)}px,${dy.toFixed(2)}px) scale(1.004)`;
      }
      // Grain clumps change twelve times a second: visible film texture without flooding the encoder.
      const gf = Math.floor(t * 12), G = grains(), pat = ctx.createPattern(G[gf % G.length], "repeat");
      pat.setTransform(new DOMMatrix([2.3 * u, 0, 0, 2.3 * u, hs(gf) * 256, hs(gf + 9) * 256]));
      ctx.fillStyle = pat; ctx.globalAlpha = T.light ? 0.4 : 0.55; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
      const fl = 0.03 + 0.05 * hs(f * 0.77 + 3) * (hs(Math.floor(t * 3) + 1) > 0.7 ? 1 : 0.4);
      ctx.fillStyle = `rgba(0,0,0,${fl})`; ctx.fillRect(0, 0, W, H);
      if (hs(f * 0.53 + 7) > 0.9) { ctx.fillStyle = "rgba(255,255,255,0.025)"; ctx.fillRect(0, 0, W, H); }
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.hypot(W, H) * 0.62);
      vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, `rgba(0,0,0,${T.light ? 0.38 : 0.56})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      // Scratches that run for a few frames.
      const sb = Math.floor(t * 6);
      for (let k = 0; k < 2; k++) {
        if (hs(sb * 3.7 + k) < 0.45) continue;
        const x = hs(sb * 1.9 + k * 5) * W + Math.sin(t * 9 + k) * 3 * u;
        ctx.strokeStyle = hs(sb + k * 2) > 0.5 ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.35)";
        ctx.lineWidth = (0.8 + hs(sb * 2.3 + k) * 1.6) * u;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (hs(sb + k * 9) - 0.5) * 30 * u, H); ctx.stroke();
      }
      // Dust and the odd hair.
      for (let k = 0; k < 7; k++) {
        if (hs(f * 1.1 + k * 13) < 0.5) continue;
        const x = hs(f * 2.7 + k) * W, y = hs(f * 3.1 + k * 7) * H, r = (1.5 + hs(f + k * 3) * 4) * u;
        ctx.fillStyle = hs(f * 4.3 + k) > 0.4 ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.4)";
        ctx.beginPath(); ctx.ellipse(x, y, r, r * (0.5 + hs(k + f) * 0.8), hs(f + k) * 3, 0, TAU); ctx.fill();
      }
      if (hs(f * 0.29 + 21) > 0.93) {
        const x = hs(f * 5.1) * W, y = hs(f * 6.3) * H;
        ctx.strokeStyle = "rgba(0,0,0,0.45)"; ctx.lineWidth = 1.4 * u;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + 40 * u, y - 30 * u, x + 20 * u, y + 50 * u, x + 70 * u, y + 30 * u); ctx.stroke();
      }
    },
    keepArt: true,
    overlap: true,
    stage(ctx, S, info) {
      const list = shownList();
      STAGE.index = info.index; STAGE.scene = info.scene;
      STAGE.prev = info.index > 0 && list[info.index - 1] ? list[info.index - 1].id : null;
      if (!info.scene || !WORLDS[info.scene]) return;
      const prevHold = info.index > 0 && list[info.index - 1] ? list[info.index - 1].hold : 0;
      const crossing = STAGE.prev && !DRAWN.has(STAGE.prev) && info.local < info.change;
      const prevInfo = { ...info, local: prevHold + info.local, hold: prevHold };
      if (!DRAWN.has(info.scene)) {
        if (crossing) {
          statement(ctx, S, STAGE.prev, prevInfo, null, 1);
          statement(ctx, S, info.scene, info, "in", eio(info.local / Math.max(0.01, info.change)));
        } else statement(ctx, S, info.scene, info, null, 1);
        return;
      }
      if (crossing) statement(ctx, S, STAGE.prev, prevInfo, null, 1);
    },
    scenes: { chart: drawer("chart"), object: drawer("object"), people: drawer("people"), process: drawer("process"), compare: drawer("compare") },
  };
});
