// Cut Paper: a layered paper diorama of a harbour coast. Every element is a separate cut or torn sheet
// with fibre, a lit edge and a soft drop shadow onto the sheet behind; torn edges show a white core.
// Sky, scalloped sun, clouds hung on threads, far headlands with houses and a film-strip windmill,
// four rocking sea sheets and two foreground swells sit at different depths, so the camera's pan from
// station to station reads as parallax. Stations: a lighthouse point, pilings that rise as bars, a
// paper laptop on an island with swinging luggage tags, townsfolk popping up behind a pier with signs,
// three islands linked by a sailing boat, and two stacks of torn strips for a comparison. Headlines are
// cut-paper letters that drop in, sway through the hold and lift away. All drawings are original.
// Frames are pure functions of time: seeded noise only.
window.DreamcutMotion.register("cut-paper", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const inout = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const stag = (p, i, n, spread = 0.5) => clamp((p - (i / Math.max(1, n)) * spread) / (1 - spread));
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return x - Math.floor(x); };
  const FONT = "Futura, 'Century Gothic', 'Avenir Next', 'Trebuchet MS', sans-serif";
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  const HEADS = { title: ["kicker", "title"], chart: ["chart-title"], object: ["object-title"], people: ["people-title"], process: ["process-title"], compare: ["compare-title"], closing: ["closing"] };
  const PITCH = 1.32;

  // ---- noise and colour ------------------------------------------------------------------------------
  const NZ = (() => { const r = rng(2417); const a = new Float32Array(4096); for (let i = 0; i < a.length; i++) a[i] = r(); return a; })();
  const jag = (x, s) => NZ[(Math.floor(x) + s * 131) & 4095] - 0.5;
  const smooth = (x, s) => { const i = Math.floor(x), f = x - i, a = NZ[(i + s * 57) & 4095], b = NZ[(i + 1 + s * 57) & 4095]; return a + (b - a) * f * f * (3 - 2 * f); };
  function hexRgb(h) {
    h = String(h || "");
    if (h[0] !== "#") { const m = h.match(/rgba?\(([^)]+)\)/); return m ? m[1].split(",").slice(0, 3).map(Number) : [128, 128, 128]; }
    if (h.length === 4) h = "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    const n = parseInt(h.slice(1, 7), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const shade = (h, k) => { const c = hexRgb(h), tg = k > 0 ? 255 : 0, a = Math.abs(k); return `rgb(${c.map((v) => Math.round(v + (tg - v) * a)).join(",")})`; };
  const lum = (h) => { const [r, g, b] = hexRgb(h); return 0.299 * r + 0.587 * g + 0.114 * b; };

  // ---- paper textures ----------------------------------------------------------------------------------
  let tiles = null, tileKey = "";
  function makeTiles(T) {
    const r = rng(733);
    const fib = document.createElement("canvas"); fib.width = fib.height = 320;
    const f = fib.getContext("2d");
    for (let i = 0; i < 1400; i++) { f.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.05 + r() * 0.09})` : `rgba(0,0,0,${0.03 + r() * 0.06})`; f.fillRect(r() * 320, r() * 320, 0.7 + r() * 1.4, 0.7 + r() * 1.4); }
    f.lineCap = "round";
    // Fibres wrap across the tile edges so the repeat never shows a seam.
    for (let i = 0; i < 150; i++) {
      const x = r() * 320, y = r() * 320, a = r() * TAU, l = 5 + r() * 16;
      f.strokeStyle = r() < 0.65 ? `rgba(255,255,255,${0.1 + r() * 0.14})` : `rgba(0,0,0,${0.04 + r() * 0.05})`;
      f.lineWidth = 0.5 + r() * 0.8;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const ox = x + dx * 320, oy = y + dy * 320;
        f.beginPath(); f.moveTo(ox, oy); f.quadraticCurveTo(ox + Math.cos(a + 0.6) * l * 0.6, oy + Math.sin(a + 0.6) * l * 0.6, ox + Math.cos(a) * l, oy + Math.sin(a) * l); f.stroke();
      }
    }
    const grain = document.createElement("canvas"); grain.width = grain.height = 220;
    const gg = grain.getContext("2d");
    for (let i = 0; i < 4200; i++) { gg.fillStyle = r() < 0.5 ? `rgba(255,250,240,${0.04 + r() * 0.07})` : `rgba(40,30,20,${0.03 + r() * 0.06})`; gg.fillRect(r() * 220, r() * 220, 1, 1); }
    const blot = document.createElement("canvas"); blot.width = blot.height = 512;
    const bg = blot.getContext("2d");
    for (let i = 0; i < 28; i++) {
      const x = r() * 512, y = r() * 512, rad = 40 + r() * 160, light = r() < 0.5;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const gr = bg.createRadialGradient(x + dx * 512, y + dy * 512, 0, x + dx * 512, y + dy * 512, rad);
        gr.addColorStop(0, light ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)"); gr.addColorStop(1, "rgba(0,0,0,0)");
        bg.fillStyle = gr; bg.fillRect(x + dx * 512 - rad, y + dy * 512 - rad, rad * 2, rad * 2);
      }
    }
    return { fib, grain, blot, pats: new Map() };
  }
  function pat(g, name) {
    let set = tiles.pats.get(g);
    if (!set) { set = {}; tiles.pats.set(g, set); }
    if (!set[name]) set[name] = g.createPattern(tiles[name], "repeat");
    return set[name];
  }

  // ---- paper pieces ----------------------------------------------------------------------------------
  // One cut sheet: soft shadow onto what is behind, a lit cut edge, and optional fibre inside.
  function piece(g, F, path, color, o = {}) {
    const { u } = F, sh = o.sh ?? 1;
    g.save();
    if (sh > 0) {
      g.shadowColor = `rgba(${F.T.shadow},${Math.min(0.6, F.T.shadowA * Math.min(1.4, sh))})`;
      g.shadowBlur = 10 * u * sh; g.shadowOffsetX = 3 * u * sh; g.shadowOffsetY = 5 * u * sh;
    }
    g.fillStyle = color; g.fill(path);
    g.restore();
    if (o.edge !== false) { g.save(); g.lineWidth = (o.edgeW ?? 1.5) * u; g.strokeStyle = o.edgeColor || `rgba(255,255,255,${F.T.edge})`; g.stroke(path); g.restore(); }
    if (o.fibre && F.tex > 0) {
      g.save(); g.clip(path); g.globalAlpha *= F.tex * (o.fa ?? 1); g.fillStyle = pat(g, "fib");
      const b = o.fibre; g.fillRect(b.x, b.y, b.w, b.h); g.restore();
    }
  }
  const rr = (x, y, w, h, r) => { const p = new Path2D(); p.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2))); return p; };
  const circ = (x, y, r) => { const p = new Path2D(); p.arc(x, y, Math.max(0.1, r), 0, TAU); return p; };
  const poly = (pts) => { const p = new Path2D(); pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); p.closePath(); return p; };
  // A torn rectangle: every edge ragged at paper-fibre scale.
  function torn(F, x, y, w, h, seed, amp = 2.4) {
    const { u } = F, a = amp * u, st = 5 * u, p = new Path2D();
    const edge = (x1, y1, x2, y2, s, first) => {
      const L = Math.hypot(x2 - x1, y2 - y1), n = Math.max(2, Math.ceil(L / st)), nx = (y2 - y1) / L, ny = -(x2 - x1) / L;
      for (let i = 0; i <= n; i++) {
        const k = i / n, j = i === 0 || i === n ? 0 : jag(i + s * 17, s) * a * 2;
        const px = lerp(x1, x2, k) + nx * j, py = lerp(y1, y2, k) + ny * j;
        if (first && i === 0) p.moveTo(px, py); else p.lineTo(px, py);
      }
    };
    edge(x, y, x + w, y, seed, true); edge(x + w, y, x + w, y + h, seed + 1); edge(x + w, y + h, x, y + h, seed + 2); edge(x, y + h, x, y, seed + 3);
    p.closePath();
    return p;
  }
  // A torn piece with its white core showing along the rip.
  function tornPiece(g, F, x, y, w, h, seed, color, o = {}) {
    const { u } = F;
    piece(g, F, torn(F, x - 2.5 * u, y - 3 * u, w + 5 * u, h + 5 * u, seed + 40, 2.8), F.T.core, { sh: o.sh ?? 1, edge: false });
    piece(g, F, torn(F, x, y, w, h, seed, 2.2), color, { sh: 0, fibre: o.fibre ? { x: x - 4, y: y - 4, w: w + 8, h: h + 8 } : null, edge: false });
  }
  function words(g, F, s, x, y, size, o = {}) {
    s = String(s ?? "");
    if (!s) return 0;
    g.save();
    g.font = `${o.weight || 700} ${size}px ${FONT}`;
    g.letterSpacing = (o.track || 0) * size + "px";
    let w = g.measureText(s).width;
    if (o.maxW && w > o.maxW) { size = Math.max(o.min || size * 0.7, (size * o.maxW) / w); g.font = `${o.weight || 700} ${size}px ${FONT}`; g.letterSpacing = (o.track || 0) * size + "px"; w = g.measureText(s).width; }
    g.textAlign = o.align || "left"; g.textBaseline = o.base || "alphabetic"; g.fillStyle = o.color || F.T.ink;
    g.fillText(s, x, y);
    g.restore();
    return w;
  }
  function measure(g, s, size, track = 0) {
    g.save(); g.font = `700 ${size}px ${FONT}`; g.letterSpacing = track * size + "px";
    const w = g.measureText(String(s ?? "")).width; g.restore(); return w;
  }

  // ---- the plan: which scenes play, when, and where each sits along the coast ---------------------
  let planCache = null, planKey = "";
  function controls() {
    if (window.__dreamcut && window.__dreamcut.controls) return window.__dreamcut.controls;
    try { if (typeof dc !== "undefined" && dc && dc.controls) return dc.controls; } catch (e) { /* not on this page */ }
    return null;
  }
  function planOf(F) {
    const c = controls();
    if (!c) return null;
    const key = `${F.W}x${F.H}`;
    if (planCache && planKey === key) return planCache;
    let t = 0;
    const shown = [];
    for (const id of ORDER) { const hold = Number(c[`${id}_hold`]) || 0; if (hold > 0) shown.push({ id, start: t, hold }); t += hold; }
    if (!shown.length) return null;
    shown.forEach((st, i) => { st.i = i; st.x = i * F.PX; });
    const data = {
      chart: { labels: [c.bar_1_label, c.bar_2_label, c.bar_3_label, c.bar_4_label], values: [c.bar_1, c.bar_2, c.bar_3, c.bar_4].map((v) => Number(v) || 0), suffix: c.chart_suffix || "", prefix: "", highlight: Number(c.highlight) - 1 },
      object: { kind: c.device, callouts: [c.callout_1, c.callout_2, c.callout_3] },
      people: { count: Number(c.people_count) || 3, badges: [c.badge_1, c.badge_2, c.badge_3], highlight: 1 },
      process: { steps: [c.step_1, c.step_2, c.step_3] },
      compare: { left: c.before_label, leftValue: Number(c.before_value) || 0, right: c.after_label, rightValue: Number(c.after_value) || 0, suffix: c.compare_suffix || "", prefix: "" },
    };
    planKey = key;
    return (planCache = { shown, data, change: Number(c.change) || 0.45, entrance: Number(c.entrance) || 0.7, length: t });
  }

  // ---- camera ----------------------------------------------------------------------------------------
  function holdCam(F, st, tt) { const k = clamp((tt - st.start) / st.hold); return { x: st.x + F.W * 0.035 * k, z: 1 + 0.02 * k }; }
  function panWindow(P, k) {
    const A = P.shown[k - 1], B = P.shown[k], T = B.start;
    return [Math.max(A.start + A.hold * 0.45, T - P.change * 1.1), Math.min(T + 0.55, T + B.hold * 0.25)];
  }
  function camera(F) {
    const P = F.plan, t = F.t, bob = Math.sin(t * 0.7) * 3 * F.u;
    if (!P) return { x: 0, y: bob, z: 1 + 0.02 * clamp(F.info.local / Math.max(0.01, F.info.hold)) };
    const sh = P.shown;
    let i = sh.findIndex((st) => t >= st.start && t < st.start + st.hold);
    if (i < 0) i = t <= 0 ? 0 : sh.length - 1;
    const pan = (A, B, a, b) => {
      const m = inout((t - a) / (b - a)), ca = holdCam(F, A, a), cb = holdCam(F, B, b);
      return { x: lerp(ca.x, cb.x, m), z: lerp(ca.z, cb.z, m) * (1 - 0.07 * Math.sin(Math.PI * m)) };
    };
    const inW = i > 0 ? panWindow(P, i) : null, outW = i < sh.length - 1 ? panWindow(P, i + 1) : null;
    let cam;
    if (inW && t < inW[1]) cam = pan(sh[i - 1], sh[i], inW[0], inW[1]);
    else if (outW && t >= outW[0]) cam = pan(sh[i], sh[i + 1], outW[0], outW[1]);
    else {
      cam = holdCam(F, sh[i], t);
      if (i === sh.length - 1) {
        const st = sh[i], d = Math.min(2.4, st.hold * 0.6), k = inout((t - (st.start + st.hold - d)) / d);
        cam.z = lerp(cam.z, 0.9, k); cam.x += F.W * 0.04 * k;
      }
    }
    cam.y = bob;
    return cam;
  }
  // Enter a depth layer: zoom about the frame centre, then shift by the camera scaled by depth.
  function layer(g, F, d, dy = 0) {
    const { W, H, cam } = F;
    g.save(); g.translate(W / 2, H / 2); g.scale(cam.z, cam.z); g.translate(-W / 2 - cam.x * d, -H / 2 + cam.y * d + dy);
  }
  function viewX(F, d) { const { W, cam } = F, hw = W / 2 / cam.z; return [cam.x * d + W / 2 - hw, cam.x * d + W / 2 + hw]; }
  // The set assembles itself as the reel opens: sheets slide up into their slots, clouds lower on threads.
  const rise = (F, d) => (1 - ease((F.t + 0.35) / 1.25)) * F.H * 0.32 * d;
  const lower = (F) => -(1 - ease((F.t + 0.35) / 1.4)) * F.H * 0.3;

  // ---- the world -------------------------------------------------------------------------------------
  function sky(g, F) {
    const { W, H, T, u } = F;
    const gr = g.createLinearGradient(0, 0, 0, F.hz + 30 * u);
    gr.addColorStop(0, T.sky[0]); gr.addColorStop(0.55, T.sky[1]); gr.addColorStop(1, T.sky[2]);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    if (F.tex > 0) {
      g.save(); g.globalAlpha = F.tex;
      g.fillStyle = pat(g, "blot"); g.fillRect(0, 0, W, H);
      g.fillStyle = pat(g, "fib"); g.fillRect(0, 0, W, H);
      g.restore();
    }
    // Soft bands of lighter paper laid across the sky.
    for (let k = 0; k < 3; k++) {
      const y = F.hz - (0.12 + k * 0.17) * (F.hz) - F.cam.x * 0, x0 = -F.cam.x * (0.02 + k * 0.01) % (W * 2);
      const p = new Path2D();
      p.moveTo(-50, y + 30 * u);
      for (let x = -50; x <= W + 50; x += 14 * u) p.lineTo(x, y + Math.sin((x - x0) / (W * 0.4) + k * 2) * 18 * u + jag((x - x0) / (5 * u), 300 + k) * 2.5 * u);
      p.lineTo(W + 50, y + 60 * u); p.lineTo(-50, y + 60 * u); p.closePath();
      g.save(); g.globalAlpha = 0.16; piece(g, F, p, T.skyBand, { sh: 0.6, edge: false }); g.restore();
    }
    if (T.stars) {
      const r = rng(55);
      for (let i = 0; i < 46; i++) {
        const x = r() * W, y = r() * F.hz * 0.85, s = (4 + r() * 6) * u * (0.75 + 0.25 * Math.sin(F.t * (1 + r() * 2) + i));
        const p = poly([[x, y - s], [x + s * 0.28, y - s * 0.28], [x + s, y], [x + s * 0.28, y + s * 0.28], [x, y + s], [x - s * 0.28, y + s * 0.28], [x - s, y], [x - s * 0.28, y - s * 0.28]]);
        piece(g, F, p, T.cloud, { sh: 0.3, edge: false });
      }
    }
  }
  function sun(g, F) {
    const { W, u, T, t, tall } = F;
    layer(g, F, 0.04, lower(F) * 0.6);
    const R = (tall ? 105 : 118) * u, cx = W * (tall ? 0.76 : 0.79), cy = F.hz - (tall ? 0.1 : 0.2) * F.H;
    const rays = 14, rot = t * 0.07;
    for (let k = 0; k < rays; k++) {
      const a = rot + (k / rays) * TAU, w = 0.11, r1 = R * 1.08, r2 = R * (k % 2 ? 1.62 : 1.92) * (1 + 0.03 * Math.sin(t * 1.5 + k));
      const p = poly([[cx + Math.cos(a - w) * r1, cy + Math.sin(a - w) * r1], [cx + Math.cos(a) * r2, cy + Math.sin(a) * r2], [cx + Math.cos(a + w) * r1, cy + Math.sin(a + w) * r1]]);
      piece(g, F, p, k % 2 ? T.sun : T.sunRay, { sh: 0.6 });
    }
    // A scalloped outer disc, then a smaller disc cut from lighter stock.
    const sc = new Path2D(), n = 22;
    for (let k = 0; k <= n * 2; k++) { const a = -rot * 0.6 + (k / (n * 2)) * TAU, r = k % 2 ? R * 1.06 : R * 0.98; k ? sc.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : sc.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    sc.closePath();
    piece(g, F, sc, T.sun, { sh: 1, fibre: { x: cx - R * 1.1, y: cy - R * 1.1, w: R * 2.2, h: R * 2.2 } });
    piece(g, F, circ(cx - R * 0.08, cy - R * 0.08, R * 0.74), T.sunCore, { sh: 0.8, fibre: { x: cx - R, y: cy - R, w: R * 2, h: R * 2 } });
    g.restore();
  }
  function cloudPath(x, y, w, seed) {
    const p = new Path2D(), n = 4 + Math.floor(hash(seed) * 3);
    p.moveTo(x - w / 2, y);
    for (let k = 0; k < n; k++) {
      const cx = x - w / 2 + (w * (k + 0.5)) / n, r = (w / n) * (0.62 + hash(seed + k) * 0.4) * (k === 0 || k === n - 1 ? 0.8 : 1.15);
      p.arc(cx, y - r * 0.15, r, Math.PI, 0);
    }
    p.lineTo(x + w / 2, y); p.closePath();
    return p;
  }
  function clouds(g, F) {
    const { u, T, t, H, tall } = F, d = 0.18, sp = 820 * u, drift = t * 9 * u;
    layer(g, F, d, lower(F));
    const [x0, x1] = viewX(F, d);
    for (let k = Math.floor((x0 - drift) / sp) - 1; k <= Math.ceil((x1 - drift) / sp) + 1; k++) {
      const s = k * 7 + 3, cx = k * sp + hash(s) * sp * 0.45 + drift, cy = H * ((tall ? 0.05 : 0.09) + hash(s + 1) * (tall ? 0.16 : 0.2)), w = (230 + hash(s + 2) * 200) * u;
      const ax = cx + (hash(s + 3) - 0.5) * w * 0.3;
      g.save();
      g.translate(ax, -20 * u); g.rotate(Math.sin(t * 0.6 + k) * 0.014); g.translate(-ax, 20 * u);
      g.beginPath(); g.moveTo(ax, -20 * u); g.lineTo(ax, cy - w * 0.18); g.strokeStyle = T.thread; g.lineWidth = 1.3 * u; g.stroke();
      g.save(); g.translate(7 * u, 9 * u); piece(g, F, cloudPath(cx, cy, w, s), T.cloudShade, { sh: 0.7, edge: false }); g.restore();
      piece(g, F, cloudPath(cx, cy, w, s), T.cloud, { sh: 0.5, fibre: { x: cx - w / 2, y: cy - w * 0.4, w, h: w * 0.45 } });
      g.restore();
    }
    g.restore();
  }
  // Low banks of flat torn cloud along the horizon, half hidden by the headlands, sliding slowly.
  function cloudBank(g, F) {
    const { u, T, t } = F, d = 0.1, sp = 640 * u, drift = t * 6 * u;
    layer(g, F, d, lower(F) * 0.4);
    const [x0, x1] = viewX(F, d);
    for (let k = Math.floor((x0 - drift) / sp) - 1; k <= Math.ceil((x1 - drift) / sp) + 1; k++) {
      const s = k * 11 + 900, w = (420 + hash(s) * 380) * u, h = (34 + hash(s + 1) * 26) * u;
      const cx = k * sp + hash(s + 2) * sp * 0.5 + drift, by = F.hz - (70 + hash(s + 3) * 110) * u + Math.sin(t * 0.5 + k) * 3 * u;
      const p = new Path2D(), n = 7 + Math.floor(hash(s + 4) * 5);
      p.moveTo(cx - w / 2, by);
      for (let j = 0; j < n; j++) {
        const a = cx - w / 2 + (w * j) / n, b = a + w / n, r = (b - a) / 2, lift = h * (0.35 + 0.65 * Math.sin(Math.PI * (j + 0.5) / n)) * (0.7 + hash(s + j * 3) * 0.5);
        p.bezierCurveTo(a, by - lift * 1.2, b, by - lift * 1.2, b, by - (j === n - 1 ? 0 : r * 0.1));
      }
      p.closePath();
      g.save(); g.translate(5 * u, 6 * u); piece(g, F, p, T.cloudShade, { sh: 0.4, edge: false }); g.restore();
      piece(g, F, p, k & 1 ? T.cloud : shade(T.cloud, -0.04), { sh: 0.3, fibre: { x: cx - w / 2, y: by - h * 1.4, w, h: h * 1.5 }, fa: 0.8 });
    }
    g.restore();
  }
  function gull(g, F, x, y, s, ph, color) {
    const flap = Math.sin(F.t * 7 + ph);
    const wing = (dir) => {
      const p = new Path2D(), tipY = y - s * (0.15 + flap * 0.5), mid = y - s * (0.45 + flap * 0.25);
      p.moveTo(x, y + s * 0.06);
      p.quadraticCurveTo(x + dir * s * 0.45, mid, x + dir * s * 1.1, tipY);
      p.quadraticCurveTo(x + dir * s * 0.5, mid + s * 0.3, x, y + s * 0.2);
      p.closePath();
      return p;
    };
    piece(g, F, wing(-1), color, { sh: 0.35, edge: false });
    piece(g, F, wing(1), color, { sh: 0.35, edge: false });
    const b = new Path2D(); b.ellipse(x, y + s * 0.05, s * 0.32, s * 0.12, 0, 0, TAU);
    piece(g, F, b, color, { sh: 0.35, edge: false });
  }
  function gulls(g, F) {
    const { W, H, u, T, t } = F;
    for (let k = 0; k < 4; k++) {
      const sp = W + 500 * u, v = (60 + hash(k + 90) * 50) * u;
      const x = ((hash(k + 70) * sp + t * v - F.cam.x * 0.45) % sp + sp) % sp - 250 * u;
      const y = H * (F.tall ? 0.36 : 0.2) + hash(k + 80) * H * 0.14 + Math.sin(t * 1.3 + k) * 12 * u;
      gull(g, F, x, y, (18 + hash(k + 60) * 12) * u, k * 1.7, T.gull);
    }
  }
  function hillY(F, x, s, base, amp) {
    const { u } = F;
    return base - u * (amp[0] + amp[1] * smooth(x / (430 * u), s) + amp[2] * smooth(x / (140 * u), s + 3)) + jag(x / (4 * u), s) * 2.2 * u;
  }
  function headland(g, F) {
    const { u, T, t } = F;
    const sheets = [{ d: 0.26, s: 11, amp: [34, 120, 34], col: T.far[0] }, { d: 0.4, s: 23, amp: [6, 70, 22], col: T.far[1] }];
    sheets.forEach((S, si) => {
      layer(g, F, S.d, rise(F, S.d));
      const [x0, x1] = viewX(F, S.d), base = F.hz + 6 * u, st = 4 * u, p = new Path2D(), core = new Path2D();
      for (let x = x0 - st; x <= x1 + st; x += st) {
        const y = hillY(F, x, S.s, base, S.amp), yc = y - 3.5 * u + jag(x / st, S.s + 9) * 2 * u;
        x === x0 - st ? (p.moveTo(x, y), core.moveTo(x, yc)) : (p.lineTo(x, y), core.lineTo(x, yc));
      }
      for (const q of [p, core]) { q.lineTo(x1 + st, F.H * 1.5); q.lineTo(x0 - st, F.H * 1.5); q.closePath(); }
      piece(g, F, core, T.core, { sh: 0.6, edge: false });
      piece(g, F, p, S.col, { sh: 0, edge: false, fibre: { x: x0, y: F.hz - 260 * u, w: x1 - x0, h: 400 * u } });
      if (si === 1) {
        // Houses and the odd film-strip windmill along the near headland.
        const sp = 560 * u;
        for (let k = Math.floor(x0 / sp) - 1; k <= Math.ceil(x1 / sp) + 1; k++) {
          const h = hash(k * 3 + 5);
          if (h < 0.35) continue;
          const hx = k * sp + hash(k + 8) * sp * 0.5;
          if (h > 0.82) { const sx = hx - F.cam.x * S.d, sunX = F.W * (F.tall ? 0.76 : 0.79); if (Math.abs(sx - sunX) < 260 * u) continue; windmill(g, F, hx, hillY(F, hx, S.s, base, S.amp) + 6 * u, 1.25, t * 0.9 + k); continue; }
          const m = 1 + Math.floor(hash(k + 2) * 3);
          for (let j = 0; j < m; j++) {
            const x = hx + j * 46 * u, y = hillY(F, x + 16 * u, S.s, base, S.amp) + 8 * u, w = (30 + hash(k + j) * 14) * u, hh = (24 + hash(k + j + 1) * 16) * u;
            piece(g, F, rr(x, y - hh, w, hh + 6 * u, 1 * u), T.house[(k + j) % T.house.length], { sh: 0.5, edge: false });
            piece(g, F, poly([[x - 4 * u, y - hh], [x + w / 2, y - hh - w * 0.55], [x + w + 4 * u, y - hh]]), T.roof[(k + j) % T.roof.length], { sh: 0.5, edge: false });
            g.fillStyle = T.window; g.fillRect(x + w * 0.35, y - hh * 0.65, w * 0.3, hh * 0.3);
          }
        }
      }
      g.restore();
    });
  }
  function windmill(g, F, x, y, s, a) {
    const { u, T } = F, h = 120 * u * s, w = 34 * u * s;
    piece(g, F, poly([[x - w / 2, y], [x - w * 0.3, y - h], [x + w * 0.3, y - h], [x + w / 2, y]]), T.house[0], { sh: 0.5 });
    piece(g, F, poly([[x - w * 0.42, y - h], [x, y - h - w * 0.6], [x + w * 0.42, y - h]]), T.roof[0], { sh: 0.4 });
    const cx = x, cy = y - h - w * 0.15, L = 78 * u * s, bw = 18 * u * s;
    for (let k = 0; k < 4; k++) {
      g.save(); g.translate(cx, cy); g.rotate(a + (k * Math.PI) / 2);
      piece(g, F, rr(-bw / 2, -L, bw, L - 6 * u * s, 2 * u), T.house[1], { sh: 0.5, edge: false });
      g.fillStyle = T.film;
      for (let j = 0; j < 6; j++) { g.fillRect(-bw / 2 + 2.5 * u * s, -L + 5 * u * s + j * (L / 6.4), 3 * u * s, 4 * u * s); g.fillRect(bw / 2 - 5.5 * u * s, -L + 5 * u * s + j * (L / 6.4), 3 * u * s, 4 * u * s); }
      g.restore();
    }
    piece(g, F, circ(cx, cy, 6 * u * s), T.roof[0], { sh: 0.4 });
  }
  // A sea sheet: a rocking torn top edge with its white core showing, carried at its own depth.
  function seaSheet(g, F, d, base, amp, len, speed, seed, color, foam = true) {
    const { u, t, H } = F;
    layer(g, F, d, rise(F, d));
    const [x0, x1] = viewX(F, d), st = 4 * u, p = new Path2D(), core = new Path2D();
    for (let x = x0 - st * 2; x <= x1 + st * 2; x += st) {
      const w = amp * Math.sin((x / len) * TAU + t * speed + seed) + amp * 0.45 * Math.sin((x / (len * 0.43)) * TAU - t * speed * 1.37 + seed * 1.7);
      const y = base + w + jag(x / st, seed) * 2.2 * u, yc = base + w - (1.5 + 3.5 * d) * u + jag(x / st, seed + 5) * 2.2 * u * Math.min(1, d + 0.2);
      x === x0 - st * 2 ? (p.moveTo(x, y), core.moveTo(x, yc)) : (p.lineTo(x, y), core.lineTo(x, yc));
    }
    for (const q of [p, core]) { q.lineTo(x1 + st * 2, H * 1.6); q.lineTo(x0 - st * 2, H * 1.6); q.closePath(); }
    if (foam) piece(g, F, core, F.T.core, { sh: 0.7 + d * 0.6, edge: false });
    piece(g, F, p, color, { sh: foam ? 0 : 0.8, edge: false, fibre: { x: x0, y: base - 30 * u, w: x1 - x0, h: H * 1.2 - base + 30 * u } });
    return [x0, x1];
  }
  function boat(g, F, x, y, s, ph, hull, sail, o = {}) {
    const { u, T, t } = F, k = s * u;
    g.save(); g.translate(x, y + Math.sin(t * 1.8 + ph) * 4 * k); g.rotate(Math.sin(t * 1.4 + ph) * 0.05);
    if (o.flip) g.scale(-1, 1);
    const belly = 10 * k * (1 + 0.25 * Math.sin(t * 2.3 + ph));
    // Mast, then a mainsail and a jib with wind in them.
    piece(g, F, rr(-2.5 * k, -150 * k, 5 * k, 150 * k, 2 * k), T.woodDark, { sh: 0.5, edge: false });
    const main = new Path2D(); main.moveTo(4 * k, -142 * k); main.quadraticCurveTo(4 * k + 52 * k + belly, -70 * k, 80 * k, -16 * k); main.lineTo(4 * k, -16 * k); main.closePath();
    piece(g, F, main, sail, { sh: 0.6, fibre: { x: 0, y: -150 * k, w: 90 * k, h: 140 * k } });
    const jib = new Path2D(); jib.moveTo(-4 * k, -128 * k); jib.quadraticCurveTo(-30 * k - belly * 0.7, -60 * k, -58 * k, -16 * k); jib.lineTo(-4 * k, -16 * k); jib.closePath();
    piece(g, F, jib, shade(sail, -0.08), { sh: 0.6 });
    const fl = new Path2D(); const fw = Math.sin(t * 6 + ph) * 3 * k;
    fl.moveTo(0, -150 * k); fl.lineTo(-24 * k, -144 * k + fw); fl.lineTo(0, -138 * k); fl.closePath();
    piece(g, F, fl, F.acc, { sh: 0.3, edge: false });
    const hp = new Path2D(); hp.moveTo(-82 * k, -16 * k); hp.lineTo(90 * k, -16 * k); hp.quadraticCurveTo(70 * k, 22 * k, 30 * k, 22 * k); hp.lineTo(-52 * k, 22 * k); hp.quadraticCurveTo(-72 * k, 18 * k, -82 * k, -16 * k); hp.closePath();
    piece(g, F, hp, hull, { sh: 1, fibre: { x: -90 * k, y: -20 * k, w: 180 * k, h: 50 * k } });
    piece(g, F, rr(-74 * k, -12 * k, 158 * k, 7 * k, 3 * k), T.cream, { sh: 0.2, edge: false });
    g.restore();
  }
  function distantBoats(g, F) {
    const { u, T, t } = F, d = 0.6, sp = 1100 * u;
    layer(g, F, d, rise(F, d));
    const [x0, x1] = viewX(F, d), drift = t * 12 * u;
    for (let k = Math.floor((x0 - drift) / sp) - 1; k <= Math.ceil((x1 - drift) / sp) + 1; k++) {
      if (hash(k + 400) < 0.4) continue;
      const x = k * sp + hash(k + 401) * sp * 0.6 + drift, y = F.hz + (F.H - F.hz) * 0.12 + 4 * u;
      boat(g, F, x, y, 0.32, k, T.hulls[k & 1 ? 1 : 0], T.cream);
    }
    g.restore();
  }
  function buoy(g, F, x, y, s, ph) {
    const { u, T, t } = F, k = s * u;
    g.save(); g.translate(x, y + Math.sin(t * 2 + ph) * 5 * k); g.rotate(Math.sin(t * 1.6 + ph) * 0.09);
    piece(g, F, poly([[-30 * k, 0], [-16 * k, -86 * k], [16 * k, -86 * k], [30 * k, 0]]), F.acc, { sh: 1, fibre: { x: -30 * k, y: -90 * k, w: 60 * k, h: 90 * k } });
    piece(g, F, poly([[-24 * k, -30 * k], [-20 * k, -54 * k], [20 * k, -54 * k], [24 * k, -30 * k]]), T.cream, { sh: 0.2, edge: false });
    piece(g, F, rr(-14 * k, -110 * k, 28 * k, 24 * k, 4 * k), T.ink, { sh: 0.4 });
    const on = 0.5 + 0.5 * Math.sin(t * 3 + ph);
    g.save(); g.globalAlpha *= 0.4 + on * 0.6; piece(g, F, circ(0, -120 * k, 11 * k), T.lamp, { sh: 0, edge: false }); g.restore();
    piece(g, F, rr(-40 * k, -6 * k, 80 * k, 16 * k, 8 * k), T.ink, { sh: 0.6 });
    g.restore();
  }
  function rock(g, F, x, y, w, seed, color) {
    const { u } = F, p = new Path2D(), n = 9;
    p.moveTo(x - w / 2, y + 20 * u);
    for (let k = 0; k <= n; k++) { const a = Math.PI + (k / n) * Math.PI, r = w / 2 * (0.75 + hash(seed + k) * 0.3); p.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.62); }
    p.lineTo(x + w / 2, y + 20 * u); p.closePath();
    piece(g, F, p, color, { sh: 1, fibre: { x: x - w / 2, y: y - w * 0.4, w, h: w * 0.5 } });
  }
  // Between stations: a bobbing buoy, a rock with a perched gull, a moored boat.
  function fillers(g, F) {
    const { W, H, u, T, PX } = F, n = F.plan ? F.plan.shown.length : 1, [x0, x1] = viewX(F, 1);
    for (let i = -2; i <= n + 1; i++) {
      const x = i * PX + W + (PX - W) / 2;
      if (x < x0 - 400 * u || x > x1 + 400 * u) continue;
      const kind = ((i % 3) + 3) % 3, base = H - (F.tall ? 150 : 115) * u;
      if (kind === 0) buoy(g, F, x, base, 1.1, i);
      else if (kind === 1) { rock(g, F, x, base + 10 * u, 230 * u, i * 9, T.rock); gull(g, F, x + 10 * u, base - 56 * u, 22 * u, i, T.gull); }
      else boat(g, F, x, base, 0.85, i * 2.3, T.hulls[1], T.cream);
      if (i < 0 || i >= n) { // beyond the ends of the coast: more of the harbour
        boat(g, F, x - PX * 0.38, base - 10 * u, 0.7, i * 3.1, T.hulls[0], T.cream, { flip: true });
        rock(g, F, x + PX * 0.34, base + 14 * u, 320 * u, i * 5 + 3, T.rock);
      }
    }
  }
  function reeds(g, F) {
    const { u, T, t, H, PX } = F, d = 1.65;
    layer(g, F, d, rise(F, d));
    const [x0, x1] = viewX(F, d), n = F.plan ? F.plan.shown.length : 1;
    for (let i = -1; i <= n; i++) {
      const x = (i + 0.5) * PX * d + PX * 0.5;
      if (x < x0 - 500 * u || x > x1 + 500 * u) continue;
      const base = H + 30 * u;
      rock(g, F, x, base - 20 * u, 520 * u, i * 13 + 1, T.front[1]);
      for (let k = 0; k < 9; k++) {
        const bx = x - 220 * u + k * 52 * u + hash(i * 9 + k) * 20 * u, h = (180 + hash(i * 9 + k + 3) * 160) * u, sw = Math.sin(t * 1.4 + k) * 14 * u;
        const p = new Path2D(); p.moveTo(bx - 12 * u, base); p.quadraticCurveTo(bx - 4 * u + sw * 0.5, base - h * 0.6, bx + sw, base - h); p.quadraticCurveTo(bx + 8 * u + sw * 0.5, base - h * 0.55, bx + 12 * u, base); p.closePath();
        piece(g, F, p, k % 2 ? T.reed[0] : T.reed[1], { sh: 1.2, edge: false });
      }
    }
    g.restore();
  }

  // ---- station props ---------------------------------------------------------------------------------
  function plank(g, F, x, y, w, h, seed = 1) {
    const { u, T, H } = F;
    for (let px = x + 50 * u; px < x + w - 30 * u; px += 250 * u) piece(g, F, rr(px, y + h - 10 * u, 34 * u, H - y, 4 * u), T.woodDark, { sh: 0.8, edge: false });
    piece(g, F, torn(F, x, y, w, h, seed, 1.4), T.wood, { sh: 1.2, fibre: { x, y, w, h } });
    g.save(); g.globalAlpha *= 0.55;
    piece(g, F, rr(x + 10 * u, y + h * 0.48, w - 20 * u, 3 * u, 1 * u), T.woodDark, { sh: 0, edge: false });
    g.restore();
  }
  function island(g, F, cx, y, w, seed) {
    const { u, T, t } = F, top = w * 0.2, p = new Path2D(), core = new Path2D(), st = 5 * u;
    for (let x = cx - w / 2; x <= cx + w / 2; x += st) {
      const k = (x - cx) / (w / 2), yy = y - top * Math.pow(Math.max(0, 1 - k * k), 0.6) + jag(x / st, seed) * 2 * u;
      x === cx - w / 2 ? (p.moveTo(x, yy), core.moveTo(x, yy - 4 * u)) : (p.lineTo(x, yy), core.lineTo(x, yy - 4 * u + jag(x / st, seed + 4) * 2 * u));
    }
    for (const q of [p, core]) { q.lineTo(cx + w / 2, y + 70 * u); q.lineTo(cx - w / 2, y + 70 * u); q.closePath(); }
    piece(g, F, core, T.core, { sh: 1, edge: false });
    piece(g, F, p, T.sand, { sh: 0, edge: false, fibre: { x: cx - w / 2, y: y - top, w, h: top + 70 * u } });
    for (let k = 0; k < 3; k++) {
      const gx = cx + (k - 1) * w * 0.26 + (hash(seed + k) - 0.5) * 30 * u, gy = y - top * Math.pow(Math.max(0, 1 - Math.pow((gx - cx) / (w / 2), 2)), 0.6) + 6 * u;
      for (let b = 0; b < 4; b++) {
        const sw = Math.sin(t * 1.8 + b + k) * 5 * u, h = (34 + b * 7) * u, bx = gx + (b - 1.5) * 9 * u;
        piece(g, F, poly([[bx - 6 * u, gy], [bx + sw + (b - 1.5) * 6 * u, gy - h], [bx + 6 * u, gy]]), b % 2 ? T.grass[0] : T.grass[1], { sh: 0.5, edge: false });
      }
    }
  }
  function flag(g, F, x, y, w, h, ph, color) {
    const { t } = F, n = 8, top = [], bot = [];
    for (let k = 0; k <= n; k++) {
      const f = k / n, off = Math.sin(t * 6 - f * 4 + ph) * h * 0.14 * f;
      top.push([x + w * f, y + off]); bot.push([x + w * f - (k === n ? w * 0.18 : 0), y + h + off]);
    }
    const p = new Path2D(); top.forEach(([a, b], i) => (i ? p.lineTo(a, b) : p.moveTo(a, b)));
    const mid = [x + w * 0.78, y + h / 2 + Math.sin(t * 6 - 4 + ph) * h * 0.14];
    p.lineTo(mid[0], mid[1]); for (let k = n; k >= 0; k--) p.lineTo(bot[k][0], bot[k][1]); p.closePath();
    piece(g, F, p, color, { sh: 0.6 });
  }
  function tagShape(F, x, y, w, h) {
    const { u } = F, c = h * 0.32, p = new Path2D();
    p.moveTo(x + c, y); p.lineTo(x + w - 8 * u, y); p.quadraticCurveTo(x + w, y, x + w, y + 8 * u); p.lineTo(x + w, y + h - 8 * u); p.quadraticCurveTo(x + w, y + h, x + w - 8 * u, y + h);
    p.lineTo(x + c, y + h); p.lineTo(x, y + h - c); p.lineTo(x, y + c); p.closePath();
    return p;
  }

  // ---- stations ----------------------------------------------------------------------------------------
  function lighthouse(g, F, x, base, h) {
    const { u, T, t } = F, w = h * 0.2;
    rock(g, F, x, base + 18 * u, w * 3.4, 77, T.rock);
    rock(g, F, x + w * 1.1, base + 30 * u, w * 1.8, 78, shade(T.rock, -0.12));
    const top = base - h, tw = w * 0.62;
    const at = (k) => [lerp(w / 2, tw / 2, k), lerp(base, top, k)];
    piece(g, F, poly([[x - w / 2, base], [x - tw / 2, top], [x + tw / 2, top], [x + w / 2, base]]), T.cream, { sh: 1.2, fibre: { x: x - w, y: top, w: w * 2, h } });
    for (let s = 0; s < 4; s++) {
      const k0 = 0.12 + s * 0.22, k1 = k0 + 0.1, [a0, y0] = at(k0), [a1, y1] = at(k1);
      piece(g, F, poly([[x - a0, y0], [x - a1, y1], [x + a1, y1], [x + a0, y0]]), F.acc, { sh: 0.25, edge: false });
    }
    piece(g, F, rr(x - tw * 0.18, base - h * 0.42, tw * 0.36, h * 0.07, 6 * u), T.ink, { sh: 0.2, edge: false });
    piece(g, F, rr(x - tw * 0.85, top - 10 * u, tw * 1.7, 18 * u, 3 * u), T.ink, { sh: 0.8 });
    // The lamp room; a vellum beam swings across the sky behind the headlines.
    const lw = tw * 0.9, lh = h * 0.13, ly = top - 10 * u - lh;
    const sweep = Math.sin(t * 0.8) * 0.55, glow = 0.65 + 0.35 * Math.sin(t * 2.4);
    g.save(); g.globalAlpha *= 0.32 * glow;
    const bm = new Path2D(), L = F.W * 0.9, bx = x, by = ly + lh / 2;
    bm.moveTo(bx, by); bm.lineTo(bx + Math.cos(Math.PI + sweep - 0.09) * L, by + Math.sin(Math.PI + sweep - 0.09) * L); bm.lineTo(bx + Math.cos(Math.PI + sweep + 0.09) * L, by + Math.sin(Math.PI + sweep + 0.09) * L); bm.closePath();
    piece(g, F, bm, T.beam, { sh: 0, edge: false });
    g.restore();
    piece(g, F, rr(x - lw / 2, ly, lw, lh, 4 * u), T.lamp, { sh: 0.6 });
    g.fillStyle = T.ink; for (let k = 1; k < 3; k++) g.fillRect(x - lw / 2 + (lw * k) / 3 - 1.5 * u, ly, 3 * u, lh);
    piece(g, F, poly([[x - lw * 0.62, ly], [x, ly - lh * 0.95], [x + lw * 0.62, ly]]), F.acc, { sh: 0.8 });
    piece(g, F, circ(x, ly - lh * 0.95, 6 * u), T.ink, { sh: 0.4 });
  }
  function titleStation(g, F) {
    const { W, H, u, T, t, tall } = F;
    lighthouse(g, F, W * (tall ? 0.74 : 0.8), H - (tall ? 190 : 130) * u, H * (tall ? 0.3 : 0.44));
    boat(g, F, W * (tall ? 0.3 : 0.4) + Math.sin(t * 0.3) * 40 * u, H - (tall ? 190 : 120) * u, tall ? 1.15 : 1.05, 0.4, T.hulls[0], T.cream);
    if (tall) boat(g, F, W * 0.22 + Math.sin(t * 0.25) * 30 * u, H * 0.6, 0.75, 1.9, T.hulls[1], T.cream);
    buoy(g, F, W * (tall ? 0.12 : 0.18), H - (tall ? 170 : 108) * u, 0.85, 2);
  }
  function closingStation(g, F) {
    const { W, H, u, T, t, tall } = F;
    const base = H - (tall ? 520 : 150) * u;
    for (let k = 0; k < 4; k++) piece(g, F, rr(W * (0.12 + k * 0.22), base + 40 * u, 26 * u, H, 4 * u), T.woodDark, { sh: 0.8, edge: false });
    plank(g, F, W * 0.04, base, W * 0.92, 60 * u, 9);
    // A boathouse at the end of the pier with a lit window and a flag.
    const hx = W * (tall ? 0.5 : 0.66), hw = (tall ? 380 : 340) * u, hh = (tall ? 300 : 230) * u;
    // Bunting from a pole on the pier to the boathouse eaves, each pennant swaying on the line.
    const px0 = W * (tall ? 0.12 : 0.14), py0 = base - hh * 1.25, px1 = hx + 10 * u, py1 = base - hh + 10 * u;
    piece(g, F, rr(px0 - 5 * u, py0 - 10 * u, 10 * u, base - py0 + 10 * u, 3 * u), T.woodDark, { sh: 0.8, edge: false });
    const sagAt = (k) => [lerp(px0, px1, k), lerp(py0, py1, k) + Math.sin(k * Math.PI) * 60 * u];
    g.beginPath(); for (let k = 0; k <= 20; k++) { const [bx, by] = sagAt(k / 20); k ? g.lineTo(bx, by) : g.moveTo(bx, by); }
    g.strokeStyle = T.thread; g.lineWidth = 2 * u; g.stroke();
    const flags = tall ? 7 : 10, cols = [F.acc, T.flag2, T.teal, T.cream, T.plum];
    for (let k = 1; k < flags; k++) {
      const [bx, by] = sagAt(k / flags), sw = Math.sin(t * 2.4 + k * 0.9) * 0.18, fs = 34 * u;
      g.save(); g.translate(bx, by); g.rotate(sw);
      piece(g, F, poly([[-fs * 0.5, 0], [fs * 0.5, 0], [0, fs * 1.1]]), cols[k % cols.length], { sh: 0.6 });
      g.restore();
    }
    piece(g, F, rr(hx, base - hh, hw, hh + 6 * u, 3 * u), T.house[1], { sh: 1.2, fibre: { x: hx, y: base - hh, w: hw, h: hh } });
    piece(g, F, poly([[hx - 26 * u, base - hh], [hx + hw / 2, base - hh - hw * 0.42], [hx + hw + 26 * u, base - hh]]), F.acc, { sh: 1 });
    const lit = 0.75 + 0.25 * Math.sin(t * 2.2);
    g.save(); g.globalAlpha *= lit; piece(g, F, rr(hx + hw * 0.14, base - hh * 0.72, hw * 0.28, hh * 0.3, 4 * u), T.lamp, { sh: 0.3 }); g.restore();
    piece(g, F, rr(hx + hw * 0.58, base - hh * 0.62, hw * 0.24, hh * 0.62, 4 * u), T.ink, { sh: 0.3 });
    piece(g, F, rr(hx + hw * 0.8, base - hh - hw * 0.42 - 70 * u, 5 * u, 90 * u, 2 * u), T.woodDark, { sh: 0.4, edge: false });
    flag(g, F, hx + hw * 0.8 + 5 * u, base - hh - hw * 0.42 - 70 * u, 60 * u, 36 * u, 1, T.flag2);
    boat(g, F, W * (tall ? 0.28 : 0.3) + Math.sin(t * 0.4) * 30 * u, H - (tall ? 150 : 96) * u, tall ? 1.3 : 1, 1.3, T.hulls[1], T.cream);
    if (tall) { boat(g, F, W * 0.72 - Math.sin(t * 0.35) * 30 * u, H - 330 * u, 0.9, 2.1, T.hulls[0], T.cream, { flip: true }); buoy(g, F, W * 0.88, H - 140 * u, 0.9, 3); }
    else buoy(g, F, W * 0.06, H - 100 * u, 0.8, 3);
    for (let k = 0; k < 3; k++) gull(g, F, W * (0.2 + k * 0.08) + Math.sin(t * 0.8 + k) * 30 * u, H * (tall ? 0.42 : 0.4) + Math.sin(t * 1.6 + k * 2) * 14 * u, 22 * u, k, T.gull);
  }

  // Pilings rise out of the water as bars; each carries its value on a paper disc.
  function chartStation(g, F, a, p, d) {
    const { u, T, t } = F, dockY = a.y + a.h, plankH = 74 * u;
    plank(g, F, a.x - 50 * u, dockY, a.w + 100 * u, plankH, 3);
    const n = d.values.length, max = Math.max(...d.values.map(Math.abs), 1), gap = a.w * 0.07, bw = (a.w - gap * (n + 1)) / n;
    const room = 200 * u, maxH = Math.max(80 * u, a.h - room);
    for (let i = 0; i < n; i++) {
      const q = stag(p, i, n, 0.5), hq = back(q), v = d.values[i], hot = i === d.highlight;
      const x = a.x + gap + i * (bw + gap), cx = x + bw / 2, bob = Math.sin(t * 1.6 + i * 1.3) * 3 * u;
      const h = maxH * clamp(v / max) * hq, top = dockY - h + bob;
      const col = hot ? F.acc : T.bar[i % T.bar.length];
      if (q > 0) {
        g.save(); g.translate(cx, dockY); g.rotate((hash(i + 31) - 0.5) * 0.02); g.translate(-cx, -dockY);
        const body = new Path2D(); body.roundRect(x, top, bw, h + 6 * u, [bw * 0.16, bw * 0.16, 0, 0]);
        piece(g, F, body, col, { sh: 1.2, fibre: { x, y: top, w: bw, h: h + 6 * u } });
        // Strips of darker stock glued across the piling.
        g.save(); g.clip(body);
        for (let s = 1; s < 5; s++) { const sy = top + h * (s / 5); if (sy > top + 30 * u) piece(g, F, torn(F, x - 6 * u, sy, bw + 12 * u, 12 * u, i * 7 + s, 1), shade(col, -0.14), { sh: 0.5, edge: false }); }
        g.restore();
        g.restore();
        // The value disc rides the piling up.
        const r = Math.min(Math.max(bw * 0.5, 74 * u), (bw + gap) * 0.49, 92 * u), dy = top - r * 0.62, pop = back(span(q, 0, 0.5));
        g.save(); g.translate(cx, dy); g.scale(pop, pop); g.rotate(Math.sin(t * 1.2 + i) * 0.04);
        if (hot) { g.save(); g.translate(r * 0.15, -r * 0.9); piece(g, F, rr(-3 * u, -r * 0.8, 6 * u, r * 0.8, 2 * u), T.woodDark, { sh: 0.5, edge: false }); flag(g, F, 3 * u, -r * 0.8, r * 0.9, r * 0.5, i, T.flag2); g.restore(); }
        piece(g, F, circ(0, 0, r + 5 * u), T.core, { sh: 1 });
        piece(g, F, circ(0, 0, r), hot ? F.acc : T.cream, { sh: 0, fibre: { x: -r, y: -r, w: r * 2, h: r * 2 } });
        const label = (d.prefix || "") + Math.round(v * clamp(q * 1.15)) + (d.suffix || "");
        words(g, F, label, 0, r * 0.06, Math.max(r * 1.15, 96 * u), { align: "center", base: "middle", color: hot ? F.onAcc : T.ink, maxW: r * 1.75, min: 60 * u });
        g.restore();
      }
      const lq = span(q, 0.1, 0.5);
      if (lq > 0 && d.labels[i]) { g.save(); g.globalAlpha *= lq; words(g, F, d.labels[i], cx, dockY + plankH * 0.5 + (1 - ease(lq)) * 20 * u, 46 * u, { align: "center", base: "middle", color: T.onWood, maxW: bw + gap * 0.8, min: 42 * u }); g.restore(); }
    }
  }

  // A paper laptop (or phone) on a sandy island; three luggage tags hang on threads from its parts.
  function objectStation(g, F, a, p, d) {
    const { u, T, t, tall } = F, phone = d.kind === "phone";
    const dockY = a.y + a.h;
    let dw, dh, dx, dy;
    if (tall) { dw = phone ? a.w * 0.42 : a.w * 0.86; dh = phone ? dw * 1.85 : dw * 0.6; dx = a.x + (phone ? a.w * 0.06 : (a.w - dw) / 2); dy = a.y + (phone ? 0 : 20 * u); }
    else { dw = phone ? Math.min(a.w * 0.24, a.h * 0.46) : Math.min(a.w * 0.55, a.h * 1.2); dh = phone ? dw * 1.85 : dw * 0.6; dx = a.x + (phone ? a.w * 0.16 : 0); dy = phone ? a.y + (a.h - dh) * 0.4 : a.y + (a.h - dh * 1.12) * 0.45; }
    island(g, F, dx + dw / 2, dockY + 30 * u, Math.max(dw * 1.5, 560 * u), 61);
    const open = phone ? 1 : 0.12 + 0.88 * back(span(p, 0, 0.3));
    const hinge = dy + dh;
    // The base of the laptop: a deck of cut keys.
    if (!phone) {
      const bp = poly([[dx - dw * 0.07, hinge + dh * 0.12], [dx + dw * 1.07, hinge + dh * 0.12], [dx + dw, hinge], [dx, hinge]]);
      piece(g, F, bp, T.device[1], { sh: 1.2, fibre: { x: dx - dw * 0.1, y: hinge, w: dw * 1.2, h: dh * 0.12 } });
      g.fillStyle = shade(T.device[1], -0.18);
      for (let r = 0; r < 2; r++) for (let k = 0; k < 14; k++) g.fillRect(dx + dw * (0.04 + k * 0.067) + r * dw * 0.012, hinge + dh * (0.025 + r * 0.04), dw * 0.05, dh * 0.026);
    }
    g.save(); g.translate(0, hinge); g.scale(1, open); g.translate(0, -hinge);
    const R = (phone ? 34 : 16) * u;
    piece(g, F, rr(dx, dy, dw, dh, R), T.device[0], { sh: 1.4, fibre: { x: dx, y: dy, w: dw, h: dh } });
    const pad = (phone ? 16 : 20) * u, sx = dx + pad, sy = dy + pad * (phone ? 2.2 : 1), sw = dw - pad * 2, sh = dh - pad * (phone ? 4.4 : 2);
    piece(g, F, rr(sx, sy, sw, sh, 8 * u), T.screen, { sh: 0.4 });
    // On screen: a little cut-paper preview (sun and rocking waves), then three tracks of clip strips.
    const pv = { x: sx + sw * 0.06, y: sy + sh * 0.06, w: sw * 0.88, h: sh * (phone ? 0.38 : 0.44) };
    g.save(); g.beginPath(); g.roundRect(pv.x, pv.y, pv.w, pv.h, 6 * u); g.clip();
    g.fillStyle = T.sky[1]; g.fillRect(pv.x, pv.y, pv.w, pv.h);
    piece(g, F, circ(pv.x + pv.w * 0.72, pv.y + pv.h * 0.42, pv.h * 0.2), T.sun, { sh: 0.4 });
    for (let w = 0; w < 3; w++) {
      const wp = new Path2D(), by = pv.y + pv.h * (0.55 + w * 0.15);
      wp.moveTo(pv.x - 10, pv.y + pv.h + 10);
      for (let x = pv.x - 10; x <= pv.x + pv.w + 10; x += 6 * u) wp.lineTo(x, by + Math.sin(x / (pv.w * 0.18) + t * 2 + w * 1.4) * pv.h * 0.035);
      wp.lineTo(pv.x + pv.w + 10, pv.y + pv.h + 10); wp.closePath();
      piece(g, F, wp, T.sea[w + 1], { sh: 0.5, edge: false });
    }
    boat(g, F, pv.x + pv.w * (0.25 + 0.1 * Math.sin(t * 0.7)), pv.y + pv.h * 0.66, pv.h / (380 * u), 0.2, T.hulls[0], T.cream);
    g.restore();
    const tr = 3, th = sh * (phone ? 0.08 : 0.1), ty0 = pv.y + pv.h + sh * 0.07;
    const clips = [[0.04, 0.3], [0.37, 0.24], [0.64, 0.3]];
    for (let r = 0; r < tr; r++) {
      const ty = ty0 + r * (th + sh * 0.035);
      clips.forEach(([cx0, cw], i) => {
        const k = ease(span(p, 0.25 + i * 0.08 + r * 0.05, 0.5 + i * 0.08 + r * 0.05));
        if (k <= 0) return;
        const xx = sx + sw * (cx0 + r * 0.02) + (1 - k) * sw * 0.3;
        piece(g, F, rr(xx, ty, sw * cw * 0.96, th, 3 * u), r === 0 && i === 1 ? F.acc : T.clip[(r + i) % T.clip.length], { sh: 0.3, edge: false });
      });
    }
    const ph = sx + sw * (0.04 + 0.9 * ((t * 0.16) % 1)), phTop = ty0 - 10 * u, phBot = ty0 + tr * (th + sh * 0.035);
    if (p > 0.4) { piece(g, F, rr(ph - 2 * u, phTop, 4 * u, phBot - phTop, 2 * u), F.acc, { sh: 0.3, edge: false }); piece(g, F, poly([[ph - 9 * u, phTop - 10 * u], [ph + 9 * u, phTop - 10 * u], [ph, phTop + 2 * u]]), F.acc, { sh: 0.3, edge: false }); }
    g.restore();
    const anchors = [[pv.x + pv.w * 0.72, pv.y + pv.h * 0.42], [sx + sw * 0.49, ty0 + th * 0.5], [sx + sw * 0.2, ty0 + 2 * (th + sh * 0.035) + th * 0.5]]
      .map(([ax, ay]) => [ax, hinge - (hinge - ay) * open]);
    // Tags: a column to the right (wide) or below the device (tall).
    const n = d.callouts.length;
    d.callouts.forEach((label, i) => {
      const c = stag(p, i + 0.6, n + 0.6, 0.55);
      if (c <= 0 || !label) return;
      const size = 46 * u, tw = Math.min(measure(g, label, size) + 110 * u, tall ? a.w * 0.62 : a.w * 0.4), thh = 92 * u;
      let hx, hy;
      if (tall) { hx = phone ? a.x + a.w * 0.56 : a.x + a.w * 0.1 + (i % 2) * a.w * 0.24; hy = phone ? a.y + a.h * (0.12 + i * 0.27) : dy + dh * 1.25 + 70 * u + i * (a.h - dh * 1.25 - 70 * u) / 3.1; }
      else { hx = a.x + a.w * (phone ? 0.5 : 0.64) + (i % 2) * 30 * u; hy = a.y + a.h * (0.12 + i * 0.3); }
      const [ax, ay] = anchors[i], k = ease(span(c, 0, 0.6));
      // Thread from a pushpin on the device to the tag's hole.
      const ex = lerp(ax, hx + 26 * u, k), ey = lerp(ay, hy + thh / 2, k), sag = 40 * u * (0.6 + 0.4 * Math.sin(t * 1.3 + i));
      g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo((ax + ex) / 2, Math.max(ay, ey) + sag, ex, ey);
      g.strokeStyle = T.string; g.lineWidth = 2.4 * u; g.stroke();
      piece(g, F, circ(ax, ay, 9 * u), F.acc, { sh: 0.6 });
      if (c < 0.35) return;
      const swing = Math.sin(t * 1.5 + i * 1.9) * 0.035 + (1 - back(span(c, 0.35, 1))) * 0.5;
      g.save(); g.translate(hx + 26 * u, hy + thh / 2); g.rotate(swing); g.translate(-hx - 26 * u, -hy - thh / 2);
      piece(g, F, tagShape(F, hx, hy, tw, thh), T.tag[i % T.tag.length], { sh: 1.1, fibre: { x: hx, y: hy, w: tw, h: thh } });
      piece(g, F, circ(hx + 26 * u, hy + thh / 2, 13 * u), T.core, { sh: 0, edge: false });
      g.save(); g.lineWidth = 3 * u; g.strokeStyle = shade(T.tag[i % T.tag.length], -0.2); g.stroke(circ(hx + 26 * u, hy + thh / 2, 13 * u)); g.restore();
      words(g, F, label, hx + 58 * u, hy + thh / 2 + 2 * u, size, { base: "middle", color: T.ink, maxW: tw - 76 * u, min: 42 * u });
      g.restore();
    });
  }

  // Townsfolk pop up behind a pier on sticks, holding signs with their roles.
  function person(g, F, x, base, s, i, hot, cloth, label, sq, slotW) {
    const { u, T, t } = F, bw = s * 0.44, bh = s * 0.56, hr = s * 0.17, skin = T.skin[i % T.skin.length], hair = T.hair[(i * 3 + 1) % T.hair.length];
    const lean = Math.sin(t * 1.3 + i * 1.1) * 0.03, hcy = -bh - hr * 0.85;
    g.save(); g.translate(x, base); g.rotate(lean);
    // The sign on its stick, behind the head.
    const signY = hcy - hr - 46 * u;
    if (label && sq > 0) {
      const size = 44 * u, sw = Math.min(Math.max(measure(g, label, size) + 52 * u, 150 * u), slotW * 0.97), shh = 80 * u;
      piece(g, F, rr(-4 * u, signY, 8 * u, -signY - bh * 0.5, 3 * u), T.woodDark, { sh: 0.6, edge: false });
      g.save(); g.translate(0, signY); g.rotate(Math.sin(t * 1.5 + i) * 0.045); g.scale(1, back(sq));
      piece(g, F, rr(-sw / 2 - 4 * u, -shh - 4 * u, sw + 8 * u, shh + 8 * u, 10 * u), T.core, { sh: 1 });
      piece(g, F, rr(-sw / 2, -shh, sw, shh, 8 * u), hot ? F.acc : T.cream, { sh: 0, fibre: { x: -sw / 2, y: -shh, w: sw, h: shh } });
      words(g, F, label, 0, -shh / 2 + 2 * u, size, { align: "center", base: "middle", color: hot ? F.onAcc : T.ink, maxW: sw - 26 * u, min: 42 * u });
      g.restore();
    }
    const body = new Path2D();
    body.moveTo(-bw / 2, 30 * u); body.lineTo(-bw * 0.44, -bh + bw * 0.3); body.quadraticCurveTo(-bw * 0.42, -bh, -bw * 0.16, -bh);
    body.lineTo(bw * 0.16, -bh); body.quadraticCurveTo(bw * 0.42, -bh, bw * 0.44, -bh + bw * 0.3); body.lineTo(bw / 2, 30 * u); body.closePath();
    piece(g, F, body, cloth, { sh: 1.1, fibre: { x: -bw / 2, y: -bh, w: bw, h: bh + 30 * u } });
    piece(g, F, poly([[-bw * 0.16, -bh], [0, -bh + bw * 0.24], [bw * 0.16, -bh]]), T.cream, { sh: 0.2, edge: false });
    piece(g, F, rr(-hr * 0.35, -bh - hr * 0.5, hr * 0.7, hr * 0.7, 3 * u), shade(skin, -0.1), { sh: 0, edge: false });
    // Hair behind the head for long styles.
    const style = i % 5;
    if (style === 1) piece(g, F, rr(-hr * 1.08, hcy - hr * 0.6, hr * 2.16, hr * 1.9, hr * 0.7), hair, { sh: 0.6 });
    piece(g, F, circ(0, hcy, hr), skin, { sh: 0.8 });
    if (style === 0) { const hp = new Path2D(); hp.arc(0, hcy - hr * 0.08, hr * 1.04, Math.PI * 1.02, Math.PI * 1.98); hp.closePath(); piece(g, F, hp, hair, { sh: 0.4 }); }
    else if (style === 1) { const hp = new Path2D(); hp.arc(0, hcy - hr * 0.1, hr * 1.06, Math.PI, 0); hp.lineTo(hr * 0.4, hcy - hr * 0.3); hp.lineTo(-hr * 0.9, hcy - hr * 0.1); hp.closePath(); piece(g, F, hp, hair, { sh: 0.4 }); }
    else if (style === 2) { piece(g, F, circ(0, hcy - hr * 1.15, hr * 0.42), hair, { sh: 0.5 }); const hp = new Path2D(); hp.arc(0, hcy - hr * 0.05, hr * 1.03, Math.PI * 1.05, Math.PI * 1.95); hp.closePath(); piece(g, F, hp, hair, { sh: 0.4 }); }
    else if (style === 3) { for (let k = 0; k < 6; k++) { const a = Math.PI * (1.05 + k * 0.18); piece(g, F, circ(Math.cos(a) * hr * 0.92, hcy + Math.sin(a) * hr * 0.92, hr * 0.34), hair, { sh: 0.3, edge: false }); } }
    else { const cap = new Path2D(); cap.arc(0, hcy - hr * 0.1, hr * 1.02, Math.PI, 0); cap.closePath(); piece(g, F, cap, T.capC, { sh: 0.4 }); piece(g, F, rr(-hr * 0.2, hcy - hr * 0.22, hr * 1.5, hr * 0.22, hr * 0.1), shade(T.capC, -0.15), { sh: 0.3, edge: false }); }
    g.fillStyle = T.ink;
    const blink = ((t * 0.6 + i * 0.37) % 1) < 0.04 ? 0.25 : 1;
    for (const ex of [-0.38, 0.38]) { g.beginPath(); g.ellipse(ex * hr, hcy + hr * 0.08, hr * 0.09, hr * 0.11 * blink, 0, 0, TAU); g.fill(); }
    g.save(); g.globalAlpha *= 0.35; g.fillStyle = T.blush; g.beginPath(); g.arc(-hr * 0.55, hcy + hr * 0.4, hr * 0.16, 0, TAU); g.arc(hr * 0.55, hcy + hr * 0.4, hr * 0.16, 0, TAU); g.fill(); g.restore();
    // Arms: hands on the stick; the highlighted one waves with the other.
    const sh = [bw * 0.38, -bh + bw * 0.24], armL = s * 0.3, aw = bw * 0.2;
    const arm = (sx, ang) => {
      g.save(); g.translate(sx, sh[1]); g.rotate(ang);
      piece(g, F, rr(-aw / 2, 0, aw, armL, aw / 2), shade(cloth, -0.1), { sh: 0.6, edge: false });
      piece(g, F, circ(0, armL, aw * 0.62), skin, { sh: 0.4, edge: false });
      g.restore();
    };
    arm(-sh[0], hot ? 2.6 + Math.sin(t * 6 + i) * 0.4 : 0.55 + Math.sin(t * 1.1 + i) * 0.04);
    arm(sh[0], -0.55 - Math.sin(t * 1.1 + i) * 0.04);
    g.restore();
  }
  function peopleStation(g, F, a, p, d) {
    const { u, T, t, tall } = F, n = Math.max(2, Math.min(6, Math.round(d.count))), plankH = 70 * u;
    const rows = tall && n > 3 ? [Math.ceil(n / 2), Math.floor(n / 2)] : [n];
    let idx = 0;
    rows.forEach((m, ri) => {
      const two = rows.length > 1, scale = two && ri === 0 ? 0.84 : 1;
      const dockY = two ? (ri === 0 ? a.y + a.h * 0.5 : a.y + a.h) : a.y + a.h;
      const rowH = two ? a.h * 0.5 : a.h, slotW = a.w / m;
      const s = Math.min((rowH - 150 * u) * 0.95 * scale, slotW * 1.25);
      const start = idx;
      g.save();
      g.beginPath(); g.rect(a.x - 400 * u, -F.H, a.w + 800 * u, dockY + 30 * u + F.H); g.clip();
      for (let j = 0; j < m; j++) {
        const i = start + j, q = stag(p, i, n, 0.55), hot = i === Math.min(n - 1, d.highlight);
        if (q <= 0) continue;
        const cx = a.x + slotW * (j + 0.5), bob = Math.sin(t * 2.2 + i * 1.7) * 3 * u;
        const off = (1 - back(q)) * s * 1.15;
        const cloth = hot ? F.acc : T.cloth[i % T.cloth.length];
        person(g, F, cx, dockY + 26 * u + off + bob, s * (hot ? 1.04 : 1), i, hot, cloth, d.badges[i % d.badges.length], span(q, 0.55, 1), slotW);
      }
      g.restore();
      idx += m;
      plank(g, F, a.x - 60 * u, dockY, a.w + 120 * u, plankH, 5 + ri);
    });
  }

  // Three islands with signboards; a sailing boat carries the work from one to the next.
  function icon(g, F, kind, cx, cy, s) {
    const { u, T, t } = F;
    if (kind === 0) { // a page from the cut, with a folded corner
      const w = s * 0.7, h = s * 0.9, x = cx - w / 2, y = cy - h / 2, f = w * 0.3;
      piece(g, F, poly([[x, y], [x + w - f, y], [x + w, y + f], [x + w, y + h], [x, y + h]]), T.paperWhite, { sh: 0.8 });
      piece(g, F, poly([[x + w - f, y], [x + w - f, y + f], [x + w, y + f]]), shade(T.paperWhite, -0.15), { sh: 0.3, edge: false });
      for (let k = 0; k < 4; k++) piece(g, F, rr(x + w * 0.16, y + h * (0.36 + k * 0.14), w * (k === 3 ? 0.4 : 0.66), h * 0.05, 2 * u), k === 1 ? F.acc : T.ink, { sh: 0, edge: false });
    } else if (kind === 1) { // scissors snipping
      const open = 0.22 + 0.16 * Math.sin(t * 5);
      for (const sgn of [-1, 1]) {
        g.save(); g.translate(cx, cy); g.rotate(sgn * open - Math.PI / 4);
        piece(g, F, poly([[-s * 0.06, -s * 0.02 * sgn], [s * 0.56, -s * 0.03 * sgn], [s * 0.06, s * 0.1 * sgn]]), T.blade, { sh: 0.7 });
        const ring = new Path2D(); ring.arc(-s * 0.3, s * 0.12 * sgn, s * 0.17, 0, TAU); ring.arc(-s * 0.3, s * 0.12 * sgn, s * 0.09, 0, TAU, true);
        g.save(); piece(g, F, ring, sgn > 0 ? F.acc : T.teal, { sh: 0.6, edge: false }); g.restore();
        piece(g, F, rr(-s * 0.2, -s * 0.03 + s * 0.04 * sgn, s * 0.22, s * 0.06, s * 0.03), sgn > 0 ? F.acc : T.teal, { sh: 0.3, edge: false });
        g.restore();
      }
      piece(g, F, circ(cx, cy, s * 0.04), T.ink, { sh: 0.2, edge: false });
    } else { // a rosette seal with a check
      const sp = new Path2D(), n = 16, rot = t * 0.4;
      for (let k = 0; k <= n * 2; k++) { const ang = rot + (k / (n * 2)) * TAU, r = k % 2 ? s * 0.46 : s * 0.4; k ? sp.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r) : sp.moveTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r); }
      sp.closePath();
      piece(g, F, sp, F.acc, { sh: 0.9 });
      piece(g, F, circ(cx, cy, s * 0.32), T.cream, { sh: 0.3 });
      const ck = poly([[cx - s * 0.18, cy], [cx - s * 0.06, cy + s * 0.13], [cx + s * 0.2, cy - s * 0.14], [cx + s * 0.14, cy - s * 0.19], [cx - s * 0.06, cy + s * 0.02], [cx - s * 0.13, cy - s * 0.05]]);
      piece(g, F, ck, T.teal, { sh: 0.4, edge: false });
    }
  }
  function wrap(g, s, size, maxW) {
    const ws = String(s || "").split(/\s+/).filter(Boolean), lines = [];
    let cur = "";
    for (const w of ws) { const next = cur ? cur + " " + w : w; if (cur && measure(g, next, size) > maxW) { lines.push(cur); cur = w; } else cur = next; }
    if (cur) lines.push(cur);
    return lines;
  }
  function processStation(g, F, a, p, d) {
    const { u, T, t, tall } = F, n = d.steps.length, dockY = a.y + a.h;
    const isl = [], boards = [];
    for (let i = 0; i < n; i++) {
      if (tall) {
        const rowH = a.h / n, by = a.y + i * rowH, bh = rowH - 64 * u, bw = a.w * 0.7;
        boards.push({ x: a.x, y: by, w: bw, h: bh });
        isl.push({ x: a.x + a.w * 0.86, y: by + bh * 0.72, w: 210 * u });
      } else {
        const cx = a.x + a.w * ((i + 0.5) / n), bw = Math.min(a.w / n - 60 * u, 440 * u), bh = Math.min(a.h - 120 * u, 360 * u);
        boards.push({ x: cx - bw / 2, y: a.y + 6 * u, w: bw, h: bh });
        isl.push({ x: cx, y: dockY + 28 * u, w: Math.min(a.w / n * 0.8, 420 * u) });
      }
    }
    // The route over the water, revealed ahead of the boat.
    const route = (k) => {
      const f = clamp(k) * (n - 1), i = Math.min(n - 2, Math.floor(f)), m = f - i, A = isl[i], B = isl[i + 1];
      if (tall) return [lerp(A.x, B.x, m) + Math.sin(m * Math.PI) * -60 * u, lerp(A.y, B.y, m) + 30 * u];
      return [lerp(A.x, B.x, m), lerp(A.y, B.y, m) - 6 * u + Math.sin(m * Math.PI) * 26 * u];
    };
    for (let i = 0; i < n; i++) island(g, F, isl[i].x, isl[i].y, isl[i].w, 80 + i * 7);
    const bk = ease(span(p, 0.05, 0.95));
    g.save(); g.setLineDash([14 * u, 12 * u]); g.lineDashOffset = -t * 30 * u; g.strokeStyle = T.route; g.lineWidth = 4 * u; g.lineCap = "round";
    g.beginPath(); for (let k = 0; k <= 60; k++) { const kk = (k / 60) * clamp(bk + 0.12); const [x, y] = route(kk); k ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); g.restore();
    for (let i = 0; i < n; i++) {
      const q = i === 0 ? ease(span(p, 0, 0.18)) : ease(span(bk, (i - 0.35) / (n - 1), (i - 0.05) / (n - 1)));
      if (q <= 0) continue;
      const b = boards[i], last = i === n - 1;
      const sway = Math.sin(t * 1.2 + i * 1.4) * 0.012, off = (1 - back(q)) * 90 * u;
      g.save(); g.globalAlpha *= clamp(q * 3);
      g.translate(b.x + b.w / 2, b.y + b.h + off); g.rotate(sway + (1 - q) * 0.15); g.translate(-b.x - b.w / 2, -b.y - b.h);
      if (!tall) piece(g, F, rr(b.x + b.w / 2 - 7 * u, b.y + b.h - 10 * u, 14 * u, isl[i].y - isl[i].w * 0.12 - b.y - b.h + 10 * u, 4 * u), T.woodDark, { sh: 0.8, edge: false });
      else piece(g, F, rr(b.x + b.w - 30 * u, b.y + b.h * 0.6, isl[i].x - b.x - b.w + 30 * u, 12 * u, 4 * u), T.woodDark, { sh: 0.8, edge: false });
      tornPiece(g, F, b.x, b.y, b.w, b.h, 120 + i * 5, last ? T.boardHot : T.cream, { fibre: true });
      const nr = 30 * u;
      piece(g, F, circ(b.x + 30 * u + nr, b.y + 30 * u + nr, nr), F.acc, { sh: 0.6 });
      words(g, F, String(i + 1), b.x + 30 * u + nr, b.y + 30 * u + nr + 2 * u, 40 * u, { align: "center", base: "middle", color: F.onAcc });
      const kind = last ? 2 : i % 2;
      const size = 46 * u;
      if (tall) {
        const is = Math.min(b.h * 0.7, 190 * u);
        icon(g, F, kind, b.x + 30 * u + is * 0.6, b.y + b.h * 0.55, is);
        const tx = b.x + 60 * u + is * 1.2, lines = wrap(g, d.steps[i], size, b.x + b.w - tx - 24 * u).slice(0, 2);
        lines.forEach((L, k) => words(g, F, L, tx, b.y + b.h / 2 + (k - (lines.length - 1) / 2) * size * 1.12, size, { base: "middle", maxW: b.x + b.w - tx - 20 * u, min: 42 * u }));
      } else {
        const is = Math.min(b.h * 0.42, b.w * 0.46);
        icon(g, F, kind, b.x + b.w / 2, b.y + b.h * 0.42, is);
        const lines = wrap(g, d.steps[i], size, b.w - 40 * u).slice(0, 2);
        lines.forEach((L, k) => words(g, F, L, b.x + b.w / 2, b.y + b.h - 24 * u - (lines.length - 1 - k) * size * 1.12, size, { align: "center", maxW: b.w - 30 * u, min: 42 * u }));
      }
      g.restore();
    }
    // The boat: wake ripples, then the hull, heading for the next island.
    const [bx, by] = route(bk);
    for (let k = 0; k < 3; k++) {
      const ph = (t * 0.8 + k / 3) % 1;
      g.save(); g.globalAlpha *= (1 - ph) * 0.7; g.strokeStyle = T.core; g.lineWidth = 3 * u;
      g.beginPath(); g.ellipse(bx - 40 * u - ph * 60 * u, by + 14 * u, 30 * u + ph * 40 * u, 6 * u + ph * 4 * u, 0, 0, TAU); g.stroke(); g.restore();
    }
    boat(g, F, bx, by + 10 * u, tall ? 0.85 : 0.8, 0.7, T.hulls[0], T.cream);
  }

  // Two stacks of torn strips, one strip per step of value, each crowned with its count.
  function compareStation(g, F, a, p, d) {
    const { u, T, t, tall } = F, dockY = a.y + a.h, plankH = 74 * u;
    plank(g, F, a.x - 50 * u, dockY, a.w + 100 * u, plankH, 7);
    const maxV = Math.max(Math.abs(d.leftValue), Math.abs(d.rightValue), 1);
    const sw = tall ? a.w * 0.4 : Math.min(a.w * 0.3, 470 * u), maxH = Math.min(a.h - 250 * u, 820 * u);
    const sides = [[d.left, d.leftValue, T.stackA], [d.right, d.rightValue, [F.acc, shade(F.acc, 0.22)]]];
    const centers = tall ? [a.x + a.w * 0.25, a.x + a.w * 0.75] : [a.x + a.w * 0.25, a.x + a.w * 0.75];
    sides.forEach(([label, value, cols], si) => {
      const cx = centers[si], q = stag(p, si, 2, 0.35);
      const H0 = maxH * clamp(Math.abs(value) / maxV), L = Math.max(1, Math.round(H0 / (46 * u))), lh = H0 / L;
      let top = dockY;
      for (let j = 0; j < L; j++) {
        const k = span(q, (j / L) * 0.7, (j / L) * 0.7 + 0.22);
        if (k <= 0) break;
        const drop = (1 - back(k)) * 140 * u, wob = Math.sin(t * 1.5 + j * 0.8 + si) * 2 * u;
        const y = dockY - (j + 1) * lh - drop, x = cx - sw / 2 + (hash(j + si * 30) - 0.5) * 16 * u + wob;
        g.save(); g.globalAlpha *= clamp(k * 3);
        tornPiece(g, F, x, y, sw, lh + 4 * u, j * 11 + si * 97, cols[j % 2], { fibre: true, sh: 0.9 });
        g.restore();
        top = Math.min(top, y);
      }
      // The count rides on a card at the top of the stack.
      const cq = span(q, 0, 0.3);
      if (cq > 0) {
        const num = (d.prefix || "") + Math.round(value * clamp(q * 1.1)) + (d.suffix || ""), size = (tall ? 132 : 150) * u;
        const cw = Math.max(measure(g, num, size) + 80 * u, sw * 0.62), ch = size * 1.22, cy = top - ch - 22 * u;
        g.save(); g.translate(cx, cy + ch); g.rotate(Math.sin(t * 1.3 + si * 2) * 0.03); g.scale(back(cq), back(cq)); g.translate(-cx, -cy - ch);
        tornPiece(g, F, cx - cw / 2, cy, cw, ch, 300 + si, si ? T.cream : T.paperWhite, { fibre: true });
        words(g, F, num, cx, cy + ch * 0.54, size, { align: "center", base: "middle", color: si ? F.acc : T.ink, maxW: cw - 30 * u, min: 96 * u });
        g.restore();
      }
      const lq = span(q, 0.05, 0.4);
      if (lq > 0 && label) { g.save(); g.globalAlpha *= lq; words(g, F, label, cx, dockY + plankH * 0.5, 46 * u, { align: "center", base: "middle", color: T.onWood, maxW: a.w * 0.46, min: 42 * u }); g.restore(); }
    });
    // A cut arrow swims from the first stack toward the second.
    const aq = span(p, 0.45, 0.8);
    if (aq > 0) {
      const ax = a.x + a.w * 0.5 + Math.sin(t * 2.2) * 10 * u, ay = dockY - maxH * 0.3, s = (tall ? 70 : 90) * u;
      g.save(); g.globalAlpha *= aq; g.translate(ax, ay); g.scale(ease(aq), ease(aq));
      piece(g, F, poly([[-s, -s * 0.22], [s * 0.2, -s * 0.22], [s * 0.2, -s * 0.55], [s, 0], [s * 0.2, s * 0.55], [s * 0.2, s * 0.22], [-s, s * 0.22]]), T.teal, { sh: 1 });
      g.restore();
    }
  }
  const DRAW = { chart: chartStation, object: objectStation, people: peopleStation, process: processStation, compare: compareStation };

  // ---- headlines as cut-paper letters ------------------------------------------------------------------
  const layoutCache = {};
  function sideOf(F) { return (F.tall ? 90 : 140) * F.u; }
  function dockTop(F) { return F.H - (F.tall ? 250 : 176) * F.u; }
  function textOf(id) { const el = document.getElementById(id); return el ? el.textContent || "" : ""; }
  function domSize(id) { const el = document.getElementById(id); return el ? parseFloat(el.style.fontSize) || 0 : 0; }
  function layout(g, F, scene) {
    const key = `${scene}:${F.W}x${F.H}`;
    if (layoutCache[key]) return layoutCache[key];
    const { u, W, H, tall } = F, side = sideOf(F), out = { lines: [], kicker: null, bottom: 0 };
    if (scene === "title" || scene === "closing") {
      const id = scene === "title" ? "title" : "closing", s = textOf(id);
      const maxW = tall ? W - side * 2 : W * 0.6;
      let size = clamp(domSize(id) || 128 * u, 92 * u, (tall ? 124 : 132) * u), lines = wrap(g, s, size, maxW);
      while ((lines.length > 3 || lines.some((L) => measure(g, L, size) > maxW)) && size > 70 * u) { size *= 0.94; lines = wrap(g, s, size, maxW); }
      let y = H * (tall ? 0.085 : scene === "title" ? 0.12 : 0.14);
      if (scene === "title" && textOf("kicker")) { out.kicker = { text: textOf("kicker").toUpperCase(), x: side, y, size: 40 * u }; y += 40 * u * 2.1; }
      lines.forEach((L) => { out.lines.push({ text: L, x: side, y: y + size * 0.92, size }); y += size * 1.12; });
      out.bottom = y;
    } else {
      const id = `${scene}-title`, s = textOf(id), maxW = W - side * 2;
      let size = Math.max(66 * u, Math.min(domSize(id) || 72 * u, (tall ? 84 : 78) * u)), lines = wrap(g, s, size, maxW);
      while (lines.length > 2 && size > 66 * u) { size = Math.max(66 * u, size * 0.94); lines = wrap(g, s, size, maxW); }
      let y = (tall ? 160 : 86) * u;
      lines.forEach((L) => { out.lines.push({ text: L, x: side, y: y + size * 0.92, size }); y += size * 1.12; });
      out.bottom = y;
    }
    return (layoutCache[key] = out);
  }
  function areaOf(g, F, id) {
    const L = layout(g, F, id), side = sideOf(F), top = L.bottom + (F.tall ? 80 : 54) * F.u, bottom = dockTop(F);
    return { x: side, y: top, w: F.W - side * 2, h: Math.max(160 * F.u, bottom - top) };
  }
  function letters(g, F, scene, local, hold, last) {
    const { u, T, t } = F, L = layout(g, F, scene), change = F.plan ? F.plan.change : 0.45;
    const multi = scene === "title" || scene === "closing";
    const cycle = [T.ink, F.acc, T.teal, T.plum];
    const total = L.lines.reduce((n, l) => n + l.text.length, 0) || 1, step = Math.min(0.03, 0.85 / total);
    const exitAt = hold - change, t0 = scene === "title" ? 0.1 : 0.04;
    // The kicker: a torn strip that slides in, with the words printed on it.
    if (L.kicker) {
      const k = ease(span(local, t0, t0 + 0.5)), e = last ? 0 : ease(span(local, exitAt, exitAt + change * 0.8));
      if (k > 0 && e < 1) {
        const K = L.kicker, w = measure(g, K.text, K.size, 0.1) + 56 * u, h = K.size * 1.7;
        g.save(); g.globalAlpha *= 1 - e; g.translate(-(1 - k) * (w + K.x + 40 * u), -e * 120 * u);
        g.translate(K.x, K.y + h / 2); g.rotate(-0.02 + Math.sin(t * 1.2) * 0.006); g.translate(-K.x, -K.y - h / 2);
        tornPiece(g, F, K.x - 14 * u, K.y, w, h, 501, T.strip, { fibre: true });
        words(g, F, K.text, K.x + 14 * u, K.y + h / 2 + 2 * u, K.size, { base: "middle", color: F.acc, track: 0.1 });
        g.restore();
      }
    }
    let gi = 0, wi = 0;
    for (const line of L.lines) {
      g.save();
      g.font = `700 ${line.size}px ${FONT}`;
      const chars = Array.from(line.text);
      let prefix = "";
      for (const ch of chars) {
        const x0 = g.measureText(prefix).width; prefix += ch;
        const cw = g.measureText(prefix).width - x0;
        if (ch === " ") { wi++; gi++; continue; }
        const st = t0 + 0.08 + gi * step, k = clamp((local - st) / 0.5);
        const e = last ? 0 : clamp((local - exitAt - gi * step * 0.4) / (change * 0.7));
        gi++;
        if (k <= 0 || e >= 1) continue;
        const sgn = hash(gi * 3.1) < 0.5 ? -1 : 1, size = line.size;
        const cx = line.x + x0 + cw / 2, cy = line.y - size * 0.34;
        const dy = -(1 - back(k)) * size * 1.1 + Math.sin(t * 2.1 + gi * 0.9) * 1.6 * u - e * e * size * 2.4;
        const rot = (hash(gi * 7.7) - 0.5) * 0.09 + (1 - k) * 0.6 * sgn + Math.sin(t * 1.7 + gi * 0.7) * 0.022 + e * sgn * 0.9;
        g.save();
        g.globalAlpha *= clamp(k * 4) * (1 - e);
        g.translate(cx, cy + dy); g.rotate(rot); g.translate(-cx, -cy);
        g.textAlign = "center"; g.textBaseline = "alphabetic"; g.lineJoin = "round";
        g.shadowColor = `rgba(${T.shadow},${T.shadowA * 1.1})`; g.shadowBlur = 9 * u; g.shadowOffsetX = 3 * u; g.shadowOffsetY = 6 * u;
        g.strokeStyle = T.core; g.lineWidth = size * 0.17; g.strokeText(ch, cx, line.y);
        g.shadowColor = "transparent";
        g.fillStyle = multi ? cycle[wi % cycle.length] : T.ink;
        g.fillText(ch, cx, line.y);
        g.restore();
      }
      wi++;
      g.restore();
    }
  }

  // ---- frame -------------------------------------------------------------------------------------------
  let frame = null;
  function makeFrame(ctx, S, info) {
    const { W, H, u } = S, look = S.look, T = look.tone;
    const key = `${W}x${H}:${T.sky[0]}`;
    if (!tiles || tileKey !== key) { tiles = makeTiles(T); tileKey = key; }
    const accent = S.accent;
    const F = {
      S, W, H, u, tall: S.tall, T, info, t: info.t, PX: W * PITCH, tex: look.texture, acc: accent,
      onAcc: lum(accent) > 168 ? T.ink : "#fff8ec", hz: H * (S.tall ? 0.38 : 0.5),
    };
    F.plan = planOf(F);
    F.cam = camera(F);
    return F;
  }
  function world(ctx, F, backdrop) {
    const { H, u, tall } = F;
    if (backdrop) {
      sky(ctx, F); sun(ctx, F); cloudBank(ctx, F); clouds(ctx, F); headland(ctx, F);
      gulls(ctx, F);
      seaSheet(ctx, F, 0.55, F.hz + 4 * u, 3 * u, 260 * u, 0.9, 1, F.T.sea[0]); ctx.restore();
      distantBoats(ctx, F);
      seaSheet(ctx, F, 0.7, F.hz + (H - F.hz) * 0.24, 5 * u, 320 * u, 1.1, 2, F.T.sea[1]); ctx.restore();
      seaSheet(ctx, F, 0.85, F.hz + (H - F.hz) * 0.5, 7 * u, 380 * u, 1.25, 3, F.T.sea[2]); ctx.restore();
      seaSheet(ctx, F, 0.95, F.hz + (H - F.hz) * 0.72, 8 * u, 420 * u, 1.35, 4, F.T.sea[3]); ctx.restore();
    }
    layer(ctx, F, 1, rise(F, 1));
    if (backdrop) fillers(ctx, F);
    const P = F.plan, [x0, x1] = viewX(F, 1);
    if (P) {
      for (const st of P.shown) {
        if (st.x > x1 + 100 * u || st.x + F.W < x0 - 100 * u) continue;
        const local = F.t - st.start, p = local < 0 ? 0 : clamp((local - 0.04) / Math.min(2.4, st.hold * 0.6));
        ctx.save(); ctx.translate(st.x, 0);
        if (DRAW[st.id]) DRAW[st.id](ctx, F, areaOf(ctx, F, st.id), p, P.data[st.id]);
        else if (st.id === "title") titleStation(ctx, F);
        else if (st.id === "closing") closingStation(ctx, F);
        ctx.restore();
      }
    } else if (F.info.scene === "title") titleStation(ctx, F);
    else if (F.info.scene === "closing") closingStation(ctx, F);
    ctx.restore();
    if (backdrop) {
      seaSheet(ctx, F, 1.2, H - (tall ? 100 : 72) * u, 10 * u, 400 * u, 1.5, 5, F.T.front[0]); ctx.restore();
      seaSheet(ctx, F, 1.45, H - (tall ? 40 : 24) * u, 12 * u, 540 * u, 1.7, 6, F.T.front[1]); ctx.restore();
      reeds(ctx, F);
    }
  }
  function overlay(ctx, F) {
    const { W, H, T } = F;
    if (F.tex > 0) { ctx.save(); ctx.globalAlpha = F.tex; ctx.fillStyle = pat(ctx, "grain"); ctx.fillRect(0, 0, W, H); ctx.restore(); }
    const gr = ctx.createRadialGradient(W * 0.38, H * 0.3, 0, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.62);
    gr.addColorStop(0, `rgba(255,244,220,${T.warm})`); gr.addColorStop(0.55, "rgba(0,0,0,0)"); gr.addColorStop(1, `rgba(${T.shadow},${T.vignette})`);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  }
  function headlines(ctx, F) {
    const P = F.plan;
    if (P) {
      for (const st of P.shown) {
        const local = F.t - st.start;
        if (local < 0 || local > st.hold + 0.01) continue;
        letters(ctx, F, st.id, local, st.hold, st.i === P.shown.length - 1);
      }
    } else if (F.info.scene) letters(ctx, F, F.info.scene, F.info.local, F.info.hold, F.info.next == null);
  }

  // The full set for templates without the illustrated stage: drawn on the texture canvas, drifting.
  function paintSet(ctx, W, H, t, accent, look) {
    const S = { W, H, u: Math.min(W, H) / 1080, tall: H > W * 1.15, look, accent };
    const F = makeFrame(ctx, S, { t, local: t, hold: 10, scene: null, index: 0 });
    F.plan = null; F.cam = { x: t * 30 * F.u, y: Math.sin(t * 0.7) * 3 * F.u, z: 1 };
    world(ctx, F, true);
    overlay(ctx, F);
  }

  const TONE = {
    sky: ["#7db6cf", "#b8d8da", "#f6dcb1"], skyBand: "#fff4dc", stars: false,
    sun: "#efa13e", sunRay: "#f6c463", sunCore: "#fbe2a0", cloud: "#fffaf0", cloudShade: "#e3d3ba", thread: "rgba(60,50,40,0.35)",
    far: ["#86ab9f", "#5f8f88"], house: ["#f4e7cb", "#f1d9b5", "#d9e3d6"], roof: ["#c8553f", "#3f6f78", "#b3843f"], window: "#3a4a55", film: "#2a2f38",
    sea: ["#4b9db0", "#358399", "#2a6d85", "#215b72"], front: ["#1b4b60", "#133a4b"],
    core: "#fdf8ec", sand: "#ecc78e", grass: ["#7c9a4b", "#5f8040"], wood: "#b8784b", woodDark: "#7f4c30", onWood: "#fff3df", rock: "#6f7f86",
    ink: "#1f2f4c", cream: "#fff4df", paperWhite: "#fffaf1", strip: "#fff4df", teal: "#17707a", plum: "#7a3f6c", flag2: "#f2b33d",
    bar: ["#8cc5bd", "#f2c46b", "#a9c9e3", "#e9b8a8"], stackA: ["#8cc5bd", "#6faea7"], clip: ["#8cc5bd", "#f2c46b", "#a9c9e3"],
    device: ["#2c3e57", "#c9d3dc"], screen: "#16263a", tag: ["#fff4df", "#fbe6c4", "#e6f0ea"], string: "#c0392b",
    cloth: ["#3f8a8f", "#e2a93b", "#7a4f8a", "#5b7fb5", "#a3b85a", "#c77a56"], skin: ["#f1c9a5", "#d79f72", "#a86b45", "#7b4a2e", "#f3d6b8"],
    hair: ["#2b2420", "#6b3d24", "#c98b3c", "#3b2b4a", "#9b5a3a"], capC: "#2f5d7c", blush: "#e86a5a",
    hulls: ["#c8553f", "#2f6f8f"], gull: "#fffaf2", lamp: "#ffd76a", beam: "#fff2c4", route: "rgba(255,250,236,0.9)", steel: "#cfd8df", blade: "#56677a",
    boardHot: "#fff0d6", reed: ["#24413a", "#2e5247"],
    shadow: "24,34,48", shadowA: 0.34, edge: 0.3, warm: 0.12, vignette: 0.3,
  };
  const LIGHT = { ...TONE, sky: ["#9fd4ea", "#cdeaf0", "#fbf1d6"], sea: ["#6cc0cf", "#4fa9bd", "#3a92aa", "#2d7d97"], front: ["#236a83", "#1a576d"], far: ["#a5c8b7", "#7fae9f"], warm: 0.16, vignette: 0.16, shadowA: 0.28 };
  const DARK = {
    ...TONE, sky: ["#0e2340", "#1f3d5e", "#4b6684"], skyBand: "#9fb6d0", stars: true, sun: "#e9e2c8", sunRay: "rgba(233,226,200,0.18)", sunCore: "#f8f1d9",
    cloud: "#c3cfdb", cloudShade: "#8193a8", thread: "rgba(200,210,225,0.25)", far: ["#2f4c60", "#233d4f"], house: ["#c9c0ad", "#b9ae98", "#a8b3ad"], window: "#ffd56a",
    sea: ["#24506a", "#1d445c", "#173a4f", "#123044"], front: ["#0c2333", "#081925"], core: "#dfe6ea", sand: "#b89a6c", rock: "#4b5961", gull: "#dfe7ee",
    beam: "#fff2b8", shadow: "4,8,16", shadowA: 0.5, edge: 0.18, warm: 0.04, vignette: 0.45, reed: ["#0f2027", "#16302f"],
  };
  const MONO = {
    ...TONE, sky: ["#cfcfcb", "#e3e2dd", "#f2f1ec"], skyBand: "#ffffff", sun: "#bdbcb6", sunRay: "#d6d5cf", sunCore: "#e9e8e3", cloud: "#fbfbf8", cloudShade: "#d2d1cb",
    far: ["#b3b2ad", "#9a9994"], house: ["#efeeea", "#e2e1dc", "#d4d3ce"], roof: ["#6a6a66", "#55554f", "#7d7c77"],
    sea: ["#8d8c88", "#7a7975", "#686763", "#575652"], front: ["#454541", "#363633"], sand: "#d9d8d2", grass: ["#7a7a75", "#62625d"], wood: "#8a8984", woodDark: "#5d5c58", rock: "#76756f",
    teal: "#4a4a46", plum: "#3a3a37", flag2: "#cfcfc9", bar: ["#b9b8b2", "#cfcec8", "#a9a8a2", "#c4c3bd"], stackA: ["#b9b8b2", "#a5a49e"], clip: ["#b9b8b2", "#cfcec8", "#a9a8a2"],
    cloth: ["#6d6d68", "#9a9a94", "#55554f", "#7f7f79", "#b0b0aa", "#8a8a84"], skin: ["#e4e3de", "#d1d0cb", "#bdbcb7", "#a9a8a3", "#efeee9"], hair: ["#2d2d2b", "#4a4a47", "#6a6a66", "#3b3b38", "#5a5a56"],
    hulls: ["#4a4a46", "#7a7a75"], lamp: "#f2f1ea", string: "#2d2d2b", capC: "#4a4a46", blush: "#8a8a86", reed: ["#3a3a37", "#4a4a46"], device: ["#3a3a37", "#c9c8c2"], screen: "#2a2a28", tag: ["#f6f5f1", "#ebeae5", "#e0dfda"], cream: "#f6f5f1", strip: "#f6f5f1", boardHot: "#ebeae5", bar: ["#b9b8b2", "#cfcec8", "#a9a8a2", "#c4c3bd"],
  };

  return {
    bg: "#b8d8da", panel: "#fff4df", ink: "#1f2f4c", muted: "#4f6a7a", accent: "#e0533c", onAccent: "#fff8ec",
    rule: "rgba(31,47,76,0.6)", track: "rgba(31,47,76,0.12)",
    display: FONT, displayWeight: 700, displayTracking: "0em", body: FONT, bodyWeight: 600, figures: FONT, radius: 14,
    motion: "rise", change: "fade", kit: { line: 3, fill: "solid", panel: "fill" },
    tone: TONE,
    keepArt: true,
    textShadow: () => "0 0 0 #fdf8ec, 2px 2px 0 #fdf8ec, -2px -2px 0 #fdf8ec, 2px -2px 0 #fdf8ec, -2px 2px 0 #fdf8ec, 4px 7px 10px rgba(24,34,48,0.35)",
    palettes: {
      light: { bg: "#cdeaf0", tone: LIGHT, backdrop: () => "#cdeaf0" },
      dark: { bg: "#1f3d5e", ink: "#f3ede0", muted: "#a9bccc", panel: "#24506a", tone: DARK, backdrop: () => "#1f3d5e" },
      mono: { bg: "#e3e2dd", ink: "#2d2d2b", muted: "#6a6a66", accent: "#2d2d2b", onAccent: "#f2f1ec", panel: "#fbfbf8", tone: MONO, backdrop: () => "#e3e2dd" },
    },
    backdrop: (accent, texture, look) => (look && look.tone ? look.tone.sky[1] : "#b8d8da"),
    // On the illustrated stage the letters are cut and drawn on the canvas; the page text stays for layout and access.
    css: () => `#root:has(#art) .display, #root:has(#art) .kicker { color: transparent !important; text-shadow: none !important; -webkit-text-stroke: 0 !important; }
      #root:not(:has(#art)) .display { font-family: ${FONT}; font-weight: 700; }`,
    paint: (ctx, W, H, t, accent, look) => {
      ctx.clearRect(0, 0, W, H);
      if (document.getElementById("art")) return;
      paintSet(ctx, W, H, t, accent, look);
    },
    stage(ctx, S, info) {
      const F = (frame = makeFrame(ctx, S, info));
      ctx.save();
      world(ctx, F, Boolean(S.paint));
      if (S.paint) overlay(ctx, F);
      headlines(ctx, F);
      ctx.restore();
    },
    // The stage draws every station so finished ones stay on the coast as the camera moves on.
    scenes: {
      chart: (ctx, S, box, p, d) => fallback(ctx, "chart", p, d), object: (ctx, S, box, p, d) => fallback(ctx, "object", p, d),
      people: (ctx, S, box, p, d) => fallback(ctx, "people", p, d), process: (ctx, S, box, p, d) => fallback(ctx, "process", p, d),
      compare: (ctx, S, box, p, d) => fallback(ctx, "compare", p, d),
    },
  };
  function fallback(ctx, id, p, d) {
    const F = frame;
    if (!F || F.plan || F.info.scene !== id) return;
    layer(ctx, F, 1);
    DRAW[id](ctx, F, areaOf(ctx, F, id), p, d);
    ctx.restore();
  }
});
