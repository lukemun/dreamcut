// Outrun: an eighties night drive. A violet sky, a banded sun sinking into the horizon and a
// neon grid floor rolling toward the viewer; words strike on like tubes.
// On the Illustrated Explainer it becomes a whole world: wireframe ridges, a neon city, drifting
// sunset clouds, palms streaming past, light trails on the grid. Every scene is a neon object standing
// on the floor; scene changes are a burst of speed that carries the old object past the camera while
// the next one rises out of the horizon. Frames are pure functions of time (seeded noise, no clocks).
window.DreamcutMotion.register("outrun", ({ hexA, rng }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const ei = (v) => Math.pow(clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, t) => a + (b - a) * t;
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
    return [255, 62, 165];
  }
  const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const WHITE = [255, 255, 255], BLACK = [0, 0, 0];

  function theme(S) {
    const L = S.look;
    const acc = rgb(S.accent);
    const bg = rgb(L.bg);
    return {
      u: S.u, acc, bg, tex: L.texture ?? 1,
      second: rgb(L.second || "#3ff0ff"), gold: rgb(L.gold || "#ffd23f"), ink: rgb(L.ink),
      sky: (L.sky || []).map(rgb), sun: (L.sun || []).map(rgb),
      night: mix(bg, BLACK, 0.45), world: Boolean(S.paint),
    };
  }
  const chromeStops = (th) => [
    [0, mix(th.second, WHITE, 0.92)], [0.3, mix(th.second, WHITE, 0.55)], [0.49, mix(th.second, th.bg, 0.15)],
    [0.52, mix(th.bg, BLACK, 0.3)], [0.57, th.acc], [0.8, mix(th.gold, th.acc, 0.25)], [1, mix(th.gold, WHITE, 0.6)],
  ];

  // ---- buffers and texture -------------------------------------------------------------------------
  let NOISE = null, SCAN = null;
  function noise() {
    if (NOISE) return NOISE;
    const c = document.createElement("canvas");
    c.width = c.height = 200;
    const g = c.getContext("2d");
    const img = g.createImageData(200, 200);
    const r = rng(27);
    for (let i = 0; i < img.data.length; i += 4) { const v = r() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    return (NOISE = c);
  }
  function scanlines() {
    if (SCAN) return SCAN;
    const c = document.createElement("canvas");
    c.width = 4; c.height = 4;
    const g = c.getContext("2d");
    g.fillStyle = "rgba(0,0,0,1)"; g.fillRect(0, 0, 4, 1.4);
    return (SCAN = c);
  }

  // ---- primitives --------------------------------------------------------------------------------
  function rr(ctx, x, y, w, h, r) {
    const q = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + q, y); ctx.arcTo(x + w, y, x + w, y + h, q); ctx.arcTo(x + w, y + h, x, y + h, q);
    ctx.arcTo(x, y + h, x, y, q); ctx.arcTo(x, y, x + w, y, q); ctx.closePath();
  }
  // A neon tube along the current path: a wide haze, a coloured body and a near-white core.
  function tube(ctx, col, w, a = 1) {
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.strokeStyle = rgba(col, 0.13 * a); ctx.lineWidth = w * 5.5; ctx.stroke();
    ctx.strokeStyle = rgba(col, 0.42 * a); ctx.lineWidth = w * 2.4; ctx.stroke();
    ctx.strokeStyle = rgba(mix(col, WHITE, 0.6), 0.98 * a); ctx.lineWidth = w; ctx.stroke();
  }
  function glowDot(ctx, x, y, r, col, a = 1) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
    g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.25, rgba(mix(col, WHITE, 0.4), 0.9 * a));
    g.addColorStop(0.55, rgba(col, 0.3 * a)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
  }
  function sparkle(ctx, x, y, r, a = 1) {
    if (r <= 0 || a <= 0) return;
    ctx.save();
    ctx.globalAlpha *= a;
    glowDot(ctx, x, y, r * 0.35, [255, 230, 255]);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r * 0.16, y); ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r * 0.16, y); ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.moveTo(x - r * 0.7, y); ctx.quadraticCurveTo(x, y, x, y - r * 0.1); ctx.quadraticCurveTo(x, y, x + r * 0.7, y);
    ctx.quadraticCurveTo(x, y, x, y + r * 0.1); ctx.quadraticCurveTo(x, y, x - r * 0.7, y);
    ctx.fill();
    ctx.restore();
  }
  const font = (S, size, weight = 800, fam = "display", italic = true) => `${italic ? "italic " : ""}${weight} ${size}px ${fam === "display" ? S.look.display : S.look.body}`;

  // Chrome lettering: a glow, a short extrusion, a sky-to-sunset chrome fill and a bright rim.
  function chrome(ctx, S, th, s, x, y, size, align = "center", maxW = 1e9, minSize = 0) {
    const u = S.u;
    let z = size;
    ctx.font = font(S, z);
    while (z > Math.max(minSize, size * 0.55) && ctx.measureText(s).width > maxW) { z *= 0.95; ctx.font = font(S, z); }
    ctx.textAlign = align; ctx.textBaseline = "alphabetic";
    ctx.save();
    ctx.shadowColor = rgba(th.acc, 0.9); ctx.shadowBlur = 34 * u;
    ctx.fillStyle = rgba(mix(th.acc, th.bg, 0.3), 0.95);
    ctx.fillText(s, x + 5 * u, y + 6 * u);
    ctx.shadowBlur = 0;
    for (let k = 5; k >= 1; k--) { ctx.fillStyle = rgba(mix(th.acc, th.bg, 0.45 + k * 0.06)); ctx.fillText(s, x + k * u, y + k * 1.2 * u); }
    const g = ctx.createLinearGradient(0, y - z * 0.76, 0, y + z * 0.04);
    for (const [o, c] of chromeStops(th)) g.addColorStop(o, rgba(c));
    ctx.fillStyle = g; ctx.fillText(s, x, y);
    ctx.lineWidth = Math.max(1, 1.6 * u); ctx.strokeStyle = "rgba(255,255,255,0.65)"; ctx.strokeText(s, x, y);
    ctx.restore();
    return { w: ctx.measureText(s).width, z };
  }
  // Tube lettering for labels. Shrinks to 42px (at 1080) before wrapping onto a second line.
  function tubeText(ctx, S, s, x, y, size, col, align = "center", maxW = 1e9, o = {}) {
    const u = S.u;
    s = String(s || "");
    if (o.upper !== false) s = s.toUpperCase();
    const min = 42 * u;
    let z = size;
    const w8 = o.weight || 700;
    ctx.font = font(S, z, w8, "body");
    while (z > min && ctx.measureText(s).width > maxW) { z = Math.max(min, z * 0.95); ctx.font = font(S, z, w8, "body"); }
    let lines = [s];
    if (ctx.measureText(s).width > maxW && s.includes(" ")) {
      const words = s.split(" ");
      let best = null;
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
        const m = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
        if (!best || m < best.m) best = { m, l: [a, b] };
      }
      lines = best.l;
    }
    const lh = z * 1.08;
    const width = Math.max(...lines.map((l) => ctx.measureText(l).width));
    ctx.save();
    ctx.textAlign = align; ctx.textBaseline = "middle";
    lines.forEach((l, i) => {
      const yy = y + (i - (lines.length - 1) / 2) * lh;
      ctx.shadowColor = rgba(col, 0.95); ctx.shadowBlur = 18 * u;
      ctx.fillStyle = rgba(mix(col, WHITE, 0.72));
      ctx.fillText(l, x, yy);
      ctx.shadowBlur = 6 * u;
      ctx.fillText(l, x, yy);
    });
    ctx.restore();
    return { w: width, h: lh * lines.length, z, lines: lines.length };
  }
  // A tag: dark glass plate, neon border and tube lettering, all arriving together.
  function tag(ctx, S, th, s, x, y, size, col, align = "center", maxW = 1e9) {
    const u = S.u;
    const padX = 26 * u, padY = 16 * u;
    // Measure first so plate and words share one frame.
    ctx.save();
    ctx.globalAlpha = 0;
    const m = tubeText(ctx, S, s, 0, 0, size, col, "left", maxW - padX * 2);
    ctx.restore();
    const w = m.w + padX * 2, h = m.h + padY * 2;
    const x0 = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    ctx.save();
    rr(ctx, x0, y - h / 2, w, h, 10 * u);
    const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
    g.addColorStop(0, rgba(mix(th.bg, BLACK, 0.2), 0.92)); g.addColorStop(1, rgba(mix(th.bg, col, 0.18), 0.92));
    ctx.fillStyle = g; ctx.fill();
    tube(ctx, col, 2 * u, 0.9);
    ctx.restore();
    tubeText(ctx, S, s, x0 + padX, y, m.z, col, "left", 1e9);
    return { x: x0, y: y - h / 2, w, h };
  }

  // ---- world geometry ------------------------------------------------------------------------------
  function geo(S) {
    const { W, H, tall } = S;
    const hy = H * (tall ? 0.6 : 0.6);
    const R = tall ? W * 0.27 : Math.min(W, H) * 0.215;
    return { W, H, hy, vx: W * 0.5, R, sx: tall ? W * 0.66 : W * 0.735, u: S.u };
  }
  // Pull a point toward the vanishing point: depth for prisms and portals.
  const toward = (G, x, y, k) => [x + (G.vx - x) * k, y + (G.hy - y) * k];

  // ---- timing: which scenes run, and the "drive" between them ---------------------------------------
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  const DEF = [2.4, 3.4, 3.6, 3.2, 3.6, 3.2, 2.4];
  function shownList() {
    const c = (window.__dreamcut && window.__dreamcut.controls) || {};
    return ORDER.map((id, i) => ({ id, hold: Number(c[id + "_hold"] ?? DEF[i]) })).filter((s) => s.hold > 0);
  }
  const LIFT = { title: 1, closing: 1.08 };
  const liftOf = (id) => LIFT[id] ?? 0.42;
  const PRE = 0.3;
  const FRAME = { steps: 0, boost: 0, lift: 1, t: 0, scene: null, index: 0, local: 0, foreLater: false };
  function camera(S, info) {
    const list = shownList();
    let idx = info.index, scene = info.scene, local = info.local, hold = info.hold, next = info.next;
    if (idx < 0 && list.length) { idx = list.length - 1; scene = list[idx].id; hold = list[idx].hold; local = hold; next = null; }
    idx = Math.max(0, idx);
    const ch = info.change, T = PRE + ch;
    let steps = idx, g = -1, from = scene, to = scene;
    if (next && local > hold - PRE) { g = (local - (hold - PRE)) / T; steps = idx + eio(g); to = next; }
    else if (idx > 0 && local < ch) { g = (local + PRE) / T; steps = idx - 1 + eio(g); from = list[idx - 1] ? list[idx - 1].id : scene; }
    let lift = lerp(liftOf(from), liftOf(to), g >= 0 ? eio(g) : 0);
    if (idx === 0) lift = lerp(0.15, lift, eo(local / 1.8));
    Object.assign(FRAME, { steps, boost: g >= 0 ? Math.sin(Math.PI * clamp(g)) : 0, lift, t: info.t, scene, index: idx, local, hold });
  }

  // ---- the world -------------------------------------------------------------------------------------
  function sky(ctx, S, th, G, t) {
    const { W, H, u } = S;
    const g = ctx.createLinearGradient(0, 0, 0, G.hy);
    g.addColorStop(0, rgba(th.sky[0] || th.bg)); g.addColorStop(0.62, rgba(th.sky[1] || th.bg)); g.addColorStop(1, rgba(th.sky[2] || th.acc));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, G.hy + 2);
    // Fine horizontal sky bands near the horizon, the period's printed-gradient look.
    ctx.save();
    for (let i = 0; i < 9; i++) {
      const y = G.hy - (i * i * 3.2 + 6) * u;
      ctx.fillStyle = rgba(mix(th.sky[2] || th.acc, th.acc, 0.4), 0.16 - i * 0.014);
      ctx.fillRect(0, y, W, (5 - i * 0.4) * u);
    }
    ctx.restore();
    // Stars: twinkle in place; a burst of speed stretches them into short streaks.
    const r = rng(101);
    ctx.save();
    const streak = FRAME.boost * 26 * u;
    for (let i = 0; i < 190; i++) {
      const x = r() * W, y = Math.pow(r(), 1.5) * G.hy * 0.82, s = (0.6 + r() * 1.8) * u, ph = r() * TAU, sp = 1 + r() * 3;
      const a = (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * sp + ph))) * (1 - y / G.hy * 0.7);
      ctx.fillStyle = `rgba(255,240,255,${a})`;
      if (streak > 1) {
        const dx = x - G.vx, dy = y - G.hy, d = Math.hypot(dx, dy) || 1;
        ctx.strokeStyle = `rgba(255,240,255,${a * 0.8})`; ctx.lineWidth = s;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (dx / d) * streak * (d / W + 0.3), y + (dy / d) * streak * (d / W + 0.3)); ctx.stroke();
      } else ctx.fillRect(x - s / 2, y - s / 2, s, s);
      if (i % 37 === 0) sparkle(ctx, x, y, 9 * u * (0.5 + 0.5 * Math.sin(t * 1.7 + ph)), 0.9);
    }
    ctx.restore();
    // A shooting star every few seconds.
    const period = 2.9, k = Math.floor(t / period), f = (t - k * period) / 0.8;
    if (f < 1) {
      const q = rng(500 + k);
      const x0 = W * (0.15 + q() * 0.6), y0 = G.hy * (0.05 + q() * 0.25), len = (420 + q() * 260) * u, ang = 0.32 + q() * 0.25;
      const hx = x0 + Math.cos(ang) * len * eo(f), hy2 = y0 + Math.sin(ang) * len * eo(f);
      const tl = len * 0.45 * (1 - f * 0.6);
      const gr = ctx.createLinearGradient(hx, hy2, hx - Math.cos(ang) * tl, hy2 - Math.sin(ang) * tl);
      gr.addColorStop(0, `rgba(255,255,255,${1 - f})`); gr.addColorStop(1, "rgba(255,255,255,0)");
      ctx.save(); ctx.strokeStyle = gr; ctx.lineWidth = 2.6 * u; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(hx, hy2); ctx.lineTo(hx - Math.cos(ang) * tl, hy2 - Math.sin(ang) * tl); ctx.stroke();
      sparkle(ctx, hx, hy2, 14 * u, 1 - f);
      ctx.restore();
    }
  }

  function clouds(ctx, S, th, G, t, front) {
    const { W, u } = S;
    const r = rng(front ? 303 : 202);
    const n = front ? 5 : 7;
    ctx.save();
    for (let i = 0; i < n; i++) {
      const len = (front ? 260 + r() * 420 : 380 + r() * 600) * u, th0 = (front ? 5 + r() * 9 : 8 + r() * 16) * u;
      const y = G.hy * (front ? 0.5 + r() * 0.38 : 0.16 + r() * 0.5), v = (6 + r() * 14) * u * (front ? 1.6 : 1);
      const span = W + len * 2;
      const x = ((((r() * span + t * v) % span) + span) % span) - len;
      const g = ctx.createLinearGradient(x, 0, x + len, 0);
      const c = front ? mix(th.bg, BLACK, 0.35) : mix(th.acc, th.gold, r() * 0.6);
      const a = front ? 0.82 : 0.16 + r() * 0.2;
      g.addColorStop(0, rgba(c, 0)); g.addColorStop(0.25, rgba(c, a)); g.addColorStop(0.75, rgba(c, a)); g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g;
      rr(ctx, x, y, len, th0, th0 / 2); ctx.fill();
      // Lit underside on the far clouds.
      if (!front) { ctx.fillStyle = rgba(mix(th.gold, WHITE, 0.3), a * 0.6); ctx.fillRect(x + len * 0.2, y + th0 - 1.5 * u, len * 0.6, 1.5 * u); }
    }
    ctx.restore();
  }

  function sun(ctx, S, th, G, t) {
    const u = S.u, R = G.R;
    const cy = G.hy - R * (FRAME.lift * 0.5 - 0.18);
    const cx = G.sx;
    ctx.save();
    // Bloom behind the disc.
    const halo = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, R * 2.6);
    halo.addColorStop(0, rgba(th.sun[1] || th.gold, 0.5)); halo.addColorStop(0.4, rgba(th.acc, 0.18)); halo.addColorStop(1, rgba(th.acc, 0));
    ctx.fillStyle = halo; ctx.fillRect(cx - R * 2.6, cy - R * 2.6, R * 5.2, R * 5.2);
    ctx.beginPath(); ctx.rect(0, 0, S.W, G.hy); ctx.clip();
    const g = ctx.createLinearGradient(0, cy - R, 0, cy + R);
    g.addColorStop(0, rgba(th.sun[0] || th.gold)); g.addColorStop(0.5, rgba(th.sun[1] || th.gold)); g.addColorStop(1, rgba(th.sun[2] || th.acc));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    // Bands roll slowly downward and thicken toward the horizon; cut with the sky colour behind them.
    ctx.beginPath(); ctx.arc(cx, cy, R + 1, 0, TAU); ctx.clip();
    const sk = ctx.createLinearGradient(0, cy - R, 0, G.hy);
    sk.addColorStop(0, rgba(th.sky[1] || th.bg)); sk.addColorStop(1, rgba(th.sky[2] || th.acc));
    ctx.fillStyle = sk;
    const roll = fract(t * 0.18);
    for (let i = -1; i < 9; i++) {
      const f = (i + roll) / 8;
      if (f < 0) continue;
      const y = cy - R * 0.45 + f * R * 1.5;
      const hgt = (1.2 + f * f * 20) * u;
      ctx.fillRect(cx - R - 2, y, R * 2 + 4, hgt);
    }
    ctx.restore();
  }

  // Wireframe ridges: a fixed seeded profile, meshed with ribs fanning toward the viewer and contours.
  function ridges(ctx, S, th, G, t, layer) {
    const { W, H, u } = S;
    const far = layer === 0;
    const r = rng(far ? 71 : 72);
    const step = (far ? 64 : 86) * u, n = Math.ceil((W * 1.5) / step) + 2;
    const amp = H * (far ? 0.2 : 0.13);
    const pts = [];
    for (let i = 0; i < n; i++) pts.push(Math.pow(r(), 1.7) * 0.85 + (i % (far ? 5 : 4) === 0 ? 0.3 : 0));
    const drift = t * (far ? 3 : 7) * u;
    const off = drift % step, i0 = Math.floor(drift / step);
    const ridge = [];
    for (let j = -1; j * step < W + step * 2; j++) {
      const x = j * step - off;
      const v = pts[(((j + i0) % n) + n) % n];
      // A valley where the sun sets, so the banded half of the disc stays visible.
      const dv = Math.abs(x - G.sx) / (G.R * 1.25);
      const valley = 0.12 + 0.88 * clamp(dv * dv * 0.8);
      ridge.push([x, G.hy - amp * v * valley * (far ? 1 : 0.95)]);
    }
    const baseOf = ([x]) => [x + (x - G.vx) * 0.14, G.hy];
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ridge[0][0], G.hy);
    for (const p of ridge) ctx.lineTo(p[0], p[1]);
    ctx.lineTo(ridge[ridge.length - 1][0], G.hy);
    ctx.closePath();
    const fill = ctx.createLinearGradient(0, G.hy - amp, 0, G.hy);
    fill.addColorStop(0, rgba(mix(th.bg, th.acc, far ? 0.14 : 0.08), 1)); fill.addColorStop(1, rgba(mix(th.bg, BLACK, 0.3), 1));
    ctx.fillStyle = fill; ctx.fill();
    ctx.clip();
    const col = far ? mix(th.acc, th.bg, 0.45) : mix(th.second, th.acc, 0.55);
    ctx.strokeStyle = rgba(col, far ? 0.45 : 0.6);
    ctx.lineWidth = (far ? 1.2 : 1.5) * u;
    ctx.beginPath();
    for (const p of ridge) { const b = baseOf(p); ctx.moveTo(p[0], p[1]); ctx.lineTo(b[0], b[1]); }
    for (const f of [0.22, 0.45, 0.68, 0.86]) {
      ridge.forEach((p, i) => { const b = baseOf(p); const x = lerp(p[0], b[0], f), y = lerp(p[1], b[1], f); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    }
    ctx.stroke();
    ctx.restore();
    // Bright crest line.
    ctx.save();
    ctx.beginPath();
    ridge.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    tube(ctx, far ? mix(th.acc, th.bg, 0.3) : th.second, (far ? 1.1 : 1.6) * u, far ? 0.45 : 0.75);
    ctx.restore();
  }

  // A neon city on the left of the horizon, windows flickering on and off.
  function city(ctx, S, th, G, t) {
    const { W, u } = S;
    const r = rng(88);
    const right = W * (S.tall ? 0.36 : 0.42);
    const flick = Math.floor(t * 2.5);
    let x = -20 * u;
    let i = 0;
    ctx.save();
    while (x < right) {
      const w = (34 + r() * 60) * u, h = (26 + Math.pow(r(), 1.4) * 120) * u * (1 - x / right * 0.55);
      const y = G.hy - h;
      ctx.fillStyle = rgba(mix(th.bg, BLACK, 0.25));
      ctx.fillRect(x, y, w - 4 * u, h);
      ctx.strokeStyle = rgba(th.acc, 0.35); ctx.lineWidth = 1.2 * u; ctx.strokeRect(x, y, w - 4 * u, h);
      // Windows.
      const q = rng(900 + i * 13 + flick * 7);
      for (let wy = y + 8 * u; wy < G.hy - 8 * u; wy += 11 * u) {
        for (let wx = x + 6 * u; wx < x + w - 12 * u; wx += 10 * u) {
          if (q() < 0.34) { ctx.fillStyle = rgba(q() < 0.6 ? th.gold : th.second, 0.55 + q() * 0.4); ctx.fillRect(wx, wy, 4 * u, 5 * u); }
        }
      }
      // An antenna light on the taller towers.
      if (h > 90 * u) {
        ctx.strokeStyle = rgba(th.acc, 0.6); ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y - 22 * u); ctx.stroke();
        glowDot(ctx, x + w / 2, y - 22 * u, 3 * u, th.acc, 0.5 + 0.5 * Math.sin(t * 3 + i));
      }
      x += w; i++;
    }
    ctx.restore();
  }

  function floor(ctx, S, th, G, t) {
    const { W, H, u } = S;
    ctx.save();
    const g = ctx.createLinearGradient(0, G.hy, 0, H);
    g.addColorStop(0, rgba(mix(th.bg, th.acc, 0.35))); g.addColorStop(0.18, rgba(mix(th.bg, BLACK, 0.1))); g.addColorStop(1, rgba(th.night));
    ctx.fillStyle = g; ctx.fillRect(0, G.hy, W, H - G.hy);
    ctx.beginPath(); ctx.rect(0, G.hy, W, H - G.hy); ctx.clip();
    // The sun's reflection: shimmering streaks under the disc.
    const D = H - G.hy;
    for (let k = 0; k < 22; k++) {
      const f = k / 22, y = G.hy + Math.pow(f, 1.6) * D * 0.55;
      const w = G.R * (0.9 - f * 0.5) * (0.55 + 0.45 * Math.sin(t * 2.2 + k * 1.7));
      ctx.fillStyle = rgba(mix(th.sun[1] || th.gold, th.acc, f), 0.32 * (1 - f));
      ctx.fillRect(G.sx + (G.sx - G.vx) * f * 0.3 - w, y, w * 2, (2 + f * 5) * u);
    }
    // Grid. Speed bursts at scene changes are folded into the roll so it never jumps.
    const G2 = W / 8.5;
    const phase = t * 1.1 + FRAME.steps * 3.4;
    const path = new Path2D();
    for (let i = -14; i <= 14; i++) { path.moveTo(G.vx + i * G2 * 0.02, G.hy); path.lineTo(G.vx + i * G2 * 1.25, H + 4); }
    const C = D * 1.25;
    const rows = [];
    for (let k = 0; k < 44; k++) {
      const d = k + 1 - fract(phase);
      const y = G.hy + C / (d + 0.25);
      if (y > H + 4 || y < G.hy) continue;
      rows.push(y);
    }
    ctx.lineCap = "round";
    ctx.strokeStyle = rgba(th.acc, 0.14); ctx.lineWidth = 6 * u; ctx.stroke(path);
    ctx.strokeStyle = rgba(mix(th.acc, WHITE, 0.25), 0.85); ctx.lineWidth = 1.7 * u; ctx.stroke(path);
    for (const y of rows) {
      const a = clamp((y - G.hy) / (D * 0.16));
      ctx.strokeStyle = rgba(th.acc, 0.14 * a); ctx.lineWidth = 7 * u * (0.3 + 0.7 * (y - G.hy) / D);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      ctx.strokeStyle = rgba(mix(th.acc, WHITE, 0.25), 0.9 * a); ctx.lineWidth = 1.8 * u * (0.4 + 0.8 * (y - G.hy) / D);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    // Light trails racing along grid lanes toward the viewer.
    const lanes = [-5, -2, 3, 6, -8, 9];
    lanes.forEach((lane, i) => {
      const per = 1.7 + i * 0.37;
      const f = fract((t + FRAME.steps * 0.9) / per + i * 0.31);
      const dHead = 28 * Math.pow(1 - f, 2.2), dTail = dHead + 1.2 + 2 * (1 - f);
      const yh = G.hy + C / (dHead + 0.25), yt = G.hy + C / (dTail + 0.25);
      const xh = G.vx + lane * G2 * 1.25 * ((yh - G.hy) / D) * 0.5, xt = G.vx + lane * G2 * 1.25 * ((yt - G.hy) / D) * 0.5;
      const col = i % 2 ? th.gold : th.second;
      ctx.beginPath(); ctx.moveTo(xt, yt); ctx.lineTo(xh, yh);
      tube(ctx, col, 1.5 * u * (0.4 + (yh - G.hy) / D), 0.75 * clamp(f * 5));
    });
    ctx.restore();
    // The horizon seam.
    const hz = ctx.createLinearGradient(0, G.hy - 16 * u, 0, G.hy + 16 * u);
    hz.addColorStop(0, rgba(th.acc, 0)); hz.addColorStop(0.5, rgba(mix(th.acc, WHITE, 0.5), 0.95)); hz.addColorStop(1, rgba(th.acc, 0));
    ctx.fillStyle = hz; ctx.fillRect(0, G.hy - 16 * u, W, 32 * u);
  }

  // A palm: tapered trunk with ring marks, drooping fronds, all silhouette with a neon rim.
  function palm(ctx, th, x, yb, h, lean, sway, a, u) {
    if (a <= 0 || h < 8) return;
    ctx.save();
    ctx.globalAlpha *= a;
    const cx = x + lean * h * 0.28, cy = yb - h;
    const kx = x + lean * h * 0.04, ky = yb - h * 0.5;
    const pt = (s) => [(1 - s) * (1 - s) * x + 2 * (1 - s) * s * kx + s * s * cx, (1 - s) * (1 - s) * yb + 2 * (1 - s) * s * ky + s * s * cy];
    const left = [], right = [];
    for (let i = 0; i <= 14; i++) {
      const s = i / 14, [px, py] = pt(s), [qx, qy] = pt(Math.min(1, s + 0.02));
      const dx = qx - px, dy = qy - py, d = Math.hypot(dx, dy) || 1;
      const w = h * (0.034 - 0.016 * s);
      left.push([px - (dy / d) * w, py + (dx / d) * w]); right.push([px + (dy / d) * w, py - (dx / d) * w]);
    }
    const dark = rgba(mix(th.bg, BLACK, 0.55));
    ctx.beginPath();
    left.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath(); ctx.fillStyle = dark; ctx.fill();
    ctx.beginPath(); right.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    tube(ctx, th.acc, Math.max(1, h * 0.004), 0.75);
    ctx.strokeStyle = rgba(th.acc, 0.35); ctx.lineWidth = Math.max(1, h * 0.003);
    ctx.beginPath();
    for (let i = 1; i < 14; i++) { ctx.moveTo(left[i][0], left[i][1]); ctx.lineTo(right[i][0], right[i][1]); }
    ctx.stroke();
    // Fronds: feathered leaves that arc out from the crown and droop under their own weight.
    const N = 9;
    for (let i = 0; i < N; i++) {
      const ang = -Math.PI * 0.97 + (i / (N - 1)) * Math.PI * 0.94 + Math.sin(sway + i * 0.7) * 0.07 + lean * 0.12;
      const L = h * (0.42 + 0.1 * Math.sin(i * 2.3 + 1));
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const droop = L * (0.2 + 0.62 * Math.abs(ca));
      const mx = cx + ca * L * 0.55, my = cy + sa * L * 0.55 - L * 0.08 * Math.abs(ca);
      const ex = cx + ca * L, ey = cy + sa * L * 0.45 + droop;
      const at = (s2) => [(1 - s2) * (1 - s2) * cx + 2 * (1 - s2) * s2 * mx + s2 * s2 * ex, (1 - s2) * (1 - s2) * cy + 2 * (1 - s2) * s2 * my + s2 * s2 * ey];
      const top = [], bot = [];
      for (let j = 0; j <= 12; j++) {
        const s2 = j / 12, [px, py] = at(s2), [qx, qy] = at(Math.min(1, s2 + 0.04));
        const dx = qx - px, dy = qy - py, dd = Math.hypot(dx, dy) || 1;
        const nx = -dy / dd, ny = dx / dd;
        const w = L * 0.12 * Math.sin(Math.PI * Math.min(1, s2 * 1.15)) * (j % 2 ? 1.35 : 0.7);
        const sgn = ny > 0 ? 1 : -1;
        top.push([px - nx * w * 0.5 * sgn, py - ny * w * 0.5 * sgn]);
        bot.push([px + nx * w * sgn + w * 0.15 * ca, py + ny * w * sgn + w * 0.5]);
      }
      ctx.beginPath();
      top.forEach((q2, j) => (j ? ctx.lineTo(q2[0], q2[1]) : ctx.moveTo(q2[0], q2[1])));
      for (let j = bot.length - 1; j >= 0; j--) ctx.lineTo(bot[j][0], bot[j][1]);
      ctx.closePath();
      ctx.fillStyle = dark; ctx.fill();
      ctx.strokeStyle = rgba(i % 2 ? th.second : th.acc, 0.35); ctx.lineWidth = Math.max(1, h * 0.002); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(mx, my, ex, ey);
      tube(ctx, i % 2 ? th.second : th.acc, Math.max(1, h * 0.003), 0.75);
    }
    ctx.restore();
  }
  // Palms stand on both sides of the drive and stream past: each scene change moves them one slot nearer.
  function palms(ctx, S, th, G, t) {
    const { W, H, u, tall } = S;
    const q = FRAME.steps * 1.5 + t * 0.16;
    const items = [];
    for (let side = -1; side <= 1; side += 2) {
      for (let k = 0; k < 4; k++) {
        const z = 0.8 + ((((k * 1.5 + (side > 0 ? 0.75 : 0) - q) % 6) + 6) % 6);
        items.push({ side, z, k });
      }
    }
    items.sort((a, b) => b.z - a.z);
    for (const it of items) {
      const z = it.z;
      const px = G.vx + it.side * W * (tall ? 0.8 : 0.74) / z;
      const yb = G.hy + (H - G.hy) * 1.05 / z;
      const h = H * (tall ? 0.42 : 0.7) / z;
      const a = clamp((z - 0.8) / 0.35) * clamp((6.6 - z) / 1.2);
      palm(ctx, th, px, yb, h, -it.side * 0.35, t * 1.2 + it.k * 1.9 + it.side, a, u);
    }
  }

  // Film finish over the art: scanlines, grain, a slow tracking band and a vignette.
  function fore(ctx, S, th, t) {
    if (!th.world || th.tex <= 0) return;
    const { W, H, u } = S;
    ctx.save();
    ctx.globalAlpha = 0.16 * th.tex;
    ctx.fillStyle = ctx.createPattern(scanlines(), "repeat");
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    ctx.save();
    const f = Math.floor(t * 24), r = rng(f * 7919 + 5);
    ctx.translate(-r() * 200, -r() * 200);
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = 0.07 * th.tex;
    ctx.fillStyle = ctx.createPattern(noise(), "repeat");
    ctx.fillRect(0, 0, W + 200, H + 200);
    ctx.restore();
    // Tracking band drifting down the picture.
    const by = (fract(t * 0.09) * 1.3 - 0.15) * H;
    ctx.save();
    const bg = ctx.createLinearGradient(0, by - 30 * u, 0, by + 30 * u);
    bg.addColorStop(0, "rgba(255,255,255,0)"); bg.addColorStop(0.5, `rgba(255,220,255,${0.06 * th.tex})`); bg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = bg; ctx.fillRect(0, by - 30 * u, W, 60 * u);
    const rr2 = rng(f * 31 + 9);
    for (let i = 0; i < 5; i++) { ctx.fillStyle = `rgba(255,255,255,${0.08 * th.tex * rr2()})`; ctx.fillRect(rr2() * W, by + (rr2() - 0.5) * 40 * u, (60 + rr2() * 240) * u, 1.5 * u); }
    ctx.restore();
    const vg = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.78);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, `rgba(4,0,14,${0.55 * th.tex})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }

  // ---- shared object parts -----------------------------------------------------------------------------
  // A neon glass prism standing on the floor: back frame, side face toward the vanishing point, front face.
  function prism(ctx, S, th, G, x, y, w, h, k, col, o = {}) {
    const u = S.u;
    const P = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    const B = P.map(([px, py]) => toward(G, px, py, k));
    const a = o.alpha ?? 1;
    ctx.save();
    // Side faces that face us.
    const faces = [];
    if (G.vx > x + w) faces.push([1, 2]); else if (G.vx < x) faces.push([3, 0]);
    if (G.hy > y + h) faces.push([2, 3]); else if (G.hy < y) faces.push([0, 1]);
    for (const [i, j] of faces) {
      ctx.beginPath(); ctx.moveTo(P[i][0], P[i][1]); ctx.lineTo(P[j][0], P[j][1]); ctx.lineTo(B[j][0], B[j][1]); ctx.lineTo(B[i][0], B[i][1]); ctx.closePath();
      ctx.fillStyle = rgba(mix(col, th.bg, 0.55), 0.55 * a); ctx.fill();
    }
    ctx.beginPath(); B.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
    for (let i = 0; i < 4; i++) { ctx.moveTo(P[i][0], P[i][1]); ctx.lineTo(B[i][0], B[i][1]); }
    tube(ctx, col, 1.4 * u, 0.55 * a);
    ctx.beginPath(); ctx.rect(x, y, w, h);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, rgba(mix(col, th.bg, 0.55), (o.fill ?? 0.55) * a)); g.addColorStop(1, rgba(mix(th.bg, BLACK, 0.3), (o.fill ?? 0.55) * a * 0.9));
    ctx.fillStyle = g; ctx.fill();
    tube(ctx, col, (o.line ?? 2.4) * u, a);
    ctx.restore();
    return { P, B };
  }
  // A floor reflection of whatever `draw` paints above the base line: mirrored, faded, clipped to the floor.
  function reflect(ctx, S, base, draw, a = 0.28) {
    ctx.save();
    ctx.beginPath(); ctx.rect(0, base, S.W, S.H - base); ctx.clip();
    ctx.translate(0, base * 2); ctx.scale(1, -1);
    ctx.globalAlpha *= a;
    draw();
    ctx.restore();
  }
  const fmt = (v, target, prefix, suffix) => window.DreamcutMotion.formatNumber(v, Number.isInteger(Number(target)) ? 0 : 1, prefix || "", suffix || "");
  // Small line icons drawn as tubes.
  function icon(ctx, S, name, x, y, s, col, a = 1, t = 0) {
    const u = S.u;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    if (name === "scan") {
      ctx.arc(-s * 0.08, -s * 0.08, s * 0.28, 0, TAU);
      ctx.moveTo(s * 0.13, s * 0.13); ctx.lineTo(s * 0.36, s * 0.36);
      const w = Math.sin(t * 3) * s * 0.05;
      ctx.moveTo(-s * 0.26, -s * 0.08); ctx.lineTo(-s * 0.16, -s * 0.08 - s * 0.1 - w); ctx.lineTo(-s * 0.04, -s * 0.08 + s * 0.1 + w); ctx.lineTo(s * 0.08, -s * 0.08);
    } else if (name === "spark") {
      ctx.moveTo(s * 0.3, -s * 0.36); ctx.lineTo(-s * 0.22, s * 0.16); ctx.lineTo(-s * 0.3, s * 0.36); ctx.lineTo(-s * 0.1, s * 0.28); ctx.lineTo(s * 0.4, -s * 0.24); ctx.closePath();
      const r = s * (0.08 + 0.03 * Math.sin(t * 5));
      ctx.moveTo(-s * 0.3, -s * 0.3 - r); ctx.lineTo(-s * 0.3, -s * 0.3 + r); ctx.moveTo(-s * 0.3 - r, -s * 0.3); ctx.lineTo(-s * 0.3 + r, -s * 0.3);
    } else if (name === "check") {
      ctx.moveTo(-s * 0.32, 0); ctx.lineTo(-s * 0.08, s * 0.24); ctx.lineTo(s * 0.36, -s * 0.24);
    }
    tube(ctx, col, Math.max(2, s * 0.045) * (u ? 1 : 1), a);
    ctx.restore();
  }

  // ---- scenes ------------------------------------------------------------------------------------------
  // Every scene stands on the floor. Arriving, it grows out of the vanishing point; leaving, it rushes
  // past the camera and fades, while the grid surges and the palms stream by.
  function wrap(fn) {
    return (ctx, S, box, p, d, info) => {
      const th = theme(S), G = geo(S);
      const leaving = info.exit !== undefined;
      let s, a;
      if (leaving) { s = 1 + 1.1 * ei(info.exit); a = 1 - eo(info.exit * 1.7); }
      else {
        const q = FRAME.index > 0 ? eo(info.local / (info.change + 0.35)) : eo(info.local / 0.6);
        s = 0.42 + 0.58 * q; a = clamp(q * 1.5);
      }
      ctx.save();
      ctx.translate(G.vx, G.hy); ctx.scale(s, s); ctx.translate(-G.vx, -G.hy);
      ctx.globalAlpha *= a;
      // Builds run across most of the hold, so the data keeps arriving well after the object lands.
      const build = leaving ? 1 : clamp((info.local - 0.12) / Math.max(0.9, (info.hold - 0.5) * 0.7));
      fn(ctx, S, th, G, box, build, d, info.t, info.local);
      ctx.restore();
      if (!leaving || FRAME.foreLater) fore(ctx, S, th, info.t);
    };
  }

  // Chart: four LED towers rising from the grid, values in chrome, the highlighted tower firing a beam.
  function chartScene(ctx, S, th, G, box, p, d, t) {
    const u = S.u, tall = S.tall;
    const n = 4;
    const vals = d.values.slice(0, n).map((v) => Math.max(0, Number(v) || 0));
    const max = Math.max(1e-6, ...vals);
    const base = box.y + box.h * (tall ? 0.8 : 0.82);
    const top = box.y + (tall ? 150 : 120) * u;
    const slot = box.w / n, bw = slot * (tall ? 0.56 : 0.46);
    const hi = d.highlight;
    const towers = vals.map((v, i) => {
      const q = eo(seg(p, 0.04 + i * 0.1, 0.5 + i * 0.1));
      const full = Math.max(30 * u, (base - top) * (v / max));
      return { i, v, q, x: box.x + slot * (i + 0.5) - bw / 2, h: Math.max(18 * u, full * (0.3 + 0.7 * q)), col: i === hi ? th.second : th.acc };
    });
    const drawTower = (T, mirror) => {
      const y = base - T.h;
      prism(ctx, S, th, G, T.x, y, bw, T.h, 0.07, T.col, { fill: 0.4, alpha: T.i === hi ? 1 : 0.85 });
      // LED cells.
      const cell = 22 * u, gap = 7 * u, inset = 12 * u;
      const cells = Math.floor((T.h - inset) / (cell + gap));
      const scanY = fract(t * 0.55 + T.i * 0.23);
      for (let c = 0; c < cells; c++) {
        const cy = base - inset - (c + 1) * (cell + gap) + gap;
        const f = c / Math.max(1, cells - 1);
        const near = Math.max(0, 1 - Math.abs(f - scanY) * 6);
        const flick = c === cells - 1 ? 0.55 + 0.45 * Math.sin(t * 9 + T.i * 2) : 1;
        ctx.fillStyle = rgba(mix(T.col, WHITE, 0.15 + near * 0.6), (0.38 + 0.4 * f + near * 0.3) * flick);
        ctx.fillRect(T.x + inset, cy, bw - inset * 2, cell);
      }
      if (!mirror) {
        // A cap that glows like a lit tube.
        ctx.beginPath(); ctx.moveTo(T.x - 8 * u, y); ctx.lineTo(T.x + bw + 8 * u, y);
        tube(ctx, mix(T.col, WHITE, 0.3), 4 * u, 0.9 + 0.1 * Math.sin(t * 6 + T.i));
      }
    };
    // Floor pads and their pulse rings.
    for (const T of towers) {
      const cx = T.x + bw / 2;
      ctx.save();
      ctx.beginPath(); ctx.ellipse(cx, base + 6 * u, bw * 0.75, 16 * u, 0, 0, TAU);
      tube(ctx, T.col, 2 * u, 0.7);
      if (T.i === hi) {
        for (let k = 0; k < 2; k++) {
          const f = fract(t * 0.7 + k * 0.5);
          ctx.beginPath(); ctx.ellipse(cx, base + 6 * u, bw * (0.75 + f * 0.8), 16 * u * (1 + f * 0.8), 0, 0, TAU);
          ctx.strokeStyle = rgba(T.col, 0.6 * (1 - f)); ctx.lineWidth = 2.5 * u; ctx.stroke();
        }
      }
      ctx.restore();
    }
    reflect(ctx, S, base + 12 * u, () => towers.forEach((T) => drawTower(T, true)), 0.22);
    // The beam from the highlighted tower, drawn behind it.
    const H0 = towers[hi];
    if (H0) {
      const bx = H0.x + bw / 2, by = base - H0.h;
      const qa = seg(p, 0.55, 0.75);
      if (qa > 0) {
        const g = ctx.createLinearGradient(0, by, 0, 0);
        g.addColorStop(0, rgba(mix(H0.col, WHITE, 0.4), 0.5 * qa)); g.addColorStop(1, rgba(H0.col, 0));
        ctx.fillStyle = g;
        const bwid = bw * (0.3 + 0.05 * Math.sin(t * 7));
        ctx.beginPath(); ctx.moveTo(bx - bwid / 2, by); ctx.lineTo(bx + bwid / 2, by); ctx.lineTo(bx + bwid * 1.4, 0); ctx.lineTo(bx - bwid * 1.4, 0); ctx.closePath(); ctx.fill();
      }
    }
    towers.forEach((T) => drawTower(T, false));
    // A dashed level line at the highlighted value, marching.
    if (H0 && p > 0.6) {
      const ly = base - H0.h;
      ctx.save();
      ctx.setLineDash([14 * u, 12 * u]); ctx.lineDashOffset = -t * 60 * u;
      ctx.beginPath(); ctx.moveTo(box.x - 20 * u, ly); ctx.lineTo(box.x + box.w + 20 * u, ly);
      ctx.strokeStyle = rgba(H0.col, 0.55 * seg(p, 0.6, 0.8)); ctx.lineWidth = 2 * u; ctx.stroke();
      ctx.restore();
    }
    // Labels on the floor and values in chrome.
    for (const T of towers) {
      const cx = T.x + bw / 2;
      const la = 0.55 + 0.45 * clamp(T.q * 2);
      ctx.save(); ctx.globalAlpha *= la;
      tubeText(ctx, S, d.labels[T.i], cx, base + (tall ? 70 : 62) * u, 44 * u, T.i === hi ? th.second : mix(th.acc, WHITE, 0.2), "center", slot - 16 * u);
      const big = T.i === hi ? (tall ? 104 : 116) * u : (tall ? 96 : 100) * u;
      chrome(ctx, S, th, fmt(T.v * T.q, T.v, d.prefix, d.suffix), cx, base - T.h - 26 * u, big, "center", slot - 10 * u, 60 * u);
      if (T.i === hi) sparkle(ctx, cx + bw * 0.42, base - T.h - big * 0.85, 22 * u * (0.6 + 0.4 * Math.sin(t * 2.6)), seg(p, 0.6, 0.8));
      ctx.restore();
    }
  }

  // The editor screen used by the object scene: a live preview of a tiny sunset, a timeline with the
  // proposed clip pulsing and the original track underneath. Returns the callout anchor points.
  function editorScreen(ctx, S, th, x, y, w, h, p, t, phone) {
    const u = S.u;
    ctx.save();
    rr(ctx, x, y, w, h, 12 * u); ctx.clip();
    const bg = ctx.createLinearGradient(0, y, 0, y + h);
    bg.addColorStop(0, rgba(mix(th.bg, BLACK, 0.4))); bg.addColorStop(1, rgba(mix(th.bg, th.acc, 0.12)));
    ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
    // CRT power-on: a bright line opens into the picture.
    const on = eo(seg(p, 0, 0.18));
    const pad = 14 * u;
    const pv = phone ? { x: x + pad, y: y + pad * 3, w: w - pad * 2, h: h * 0.4 } : { x: x + pad, y: y + pad, w: w * 0.62, h: h * 0.56 };
    const tlY = phone ? pv.y + pv.h + pad * 2 : pv.y + pv.h + pad;
    const tl = { x: x + pad, y: tlY, w: w - pad * 2, h: y + h - pad - tlY };
    ctx.save();
    ctx.translate(0, (y + h / 2) * (1 - on)); ctx.scale(1, Math.max(0.02, on));
    // Preview: a miniature drive.
    ctx.save();
    rr(ctx, pv.x, pv.y, pv.w, pv.h, 8 * u); ctx.clip();
    const hz = pv.y + pv.h * 0.62;
    const sk = ctx.createLinearGradient(0, pv.y, 0, hz);
    sk.addColorStop(0, rgba(th.sky[0] || th.bg)); sk.addColorStop(1, rgba(th.sky[2] || th.acc));
    ctx.fillStyle = sk; ctx.fillRect(pv.x, pv.y, pv.w, hz - pv.y);
    const sr = pv.h * 0.3, scx = pv.x + pv.w * 0.5;
    const sg = ctx.createLinearGradient(0, hz - sr, 0, hz);
    sg.addColorStop(0, rgba(th.sun[0] || th.gold)); sg.addColorStop(1, rgba(th.sun[2] || th.acc));
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(scx, hz, sr, Math.PI, 0); ctx.fill();
    ctx.fillStyle = rgba(th.sky[2] || th.acc);
    for (let i = 0; i < 4; i++) { const f = fract(i / 4 + t * 0.25); ctx.fillRect(scx - sr, hz - sr * 0.55 + f * sr * 0.55, sr * 2, (1 + f * 4) * u); }
    ctx.fillStyle = rgba(th.night); ctx.fillRect(pv.x, hz, pv.w, pv.y + pv.h - hz);
    ctx.strokeStyle = rgba(th.acc, 0.9); ctx.lineWidth = 1.4 * u; ctx.beginPath();
    for (let i = -8; i <= 8; i++) { ctx.moveTo(scx + i * pv.w * 0.008, hz); ctx.lineTo(scx + i * pv.w * 0.12, pv.y + pv.h); }
    for (let k = 0; k < 8; k++) { const dd = k + 1 - fract(t * 1.4); const yy = hz + (pv.y + pv.h - hz) * 1.2 / (dd + 0.2); if (yy < pv.y + pv.h) { ctx.moveTo(pv.x, yy); ctx.lineTo(pv.x + pv.w, yy); } }
    ctx.stroke();
    ctx.restore();
    ctx.beginPath(); rr(ctx, pv.x, pv.y, pv.w, pv.h, 8 * u); tube(ctx, th.second, 1.6 * u, 0.8);
    // Play badge in the preview corner.
    ctx.fillStyle = rgba(WHITE, 0.9); ctx.beginPath();
    const pbx = pv.x + 22 * u, pby = pv.y + pv.h - 22 * u;
    ctx.moveTo(pbx - 6 * u, pby - 8 * u); ctx.lineTo(pbx + 9 * u, pby); ctx.lineTo(pbx - 6 * u, pby + 8 * u); ctx.fill();
    // Inspector dials on the laptop.
    if (!phone) {
      const ix = pv.x + pv.w + pad, iw = x + w - pad - ix;
      for (let i = 0; i < 4; i++) {
        const yy = pv.y + 18 * u + i * (pv.h - 30 * u) / 4;
        ctx.fillStyle = rgba(th.ink, 0.18); ctx.fillRect(ix, yy + 10 * u, iw, 4 * u);
        const kx = ix + iw * (0.5 + 0.38 * Math.sin(t * (0.9 + i * 0.3) + i * 1.7));
        ctx.fillStyle = rgba(i % 2 ? th.second : th.acc, 0.9); ctx.fillRect(ix, yy + 10 * u, kx - ix, 4 * u);
        glowDot(ctx, kx, yy + 12 * u, 5 * u, i % 2 ? th.second : th.acc);
        ctx.fillStyle = rgba(th.ink, 0.35); ctx.fillRect(ix, yy - 4 * u, iw * 0.45, 5 * u);
      }
    }
    // Timeline: ruler, the proposed lane (one clip pulsing), the original track with its waveform.
    const rows = 3, rh = (tl.h - 18 * u) / rows;
    ctx.strokeStyle = rgba(th.ink, 0.25); ctx.lineWidth = 1 * u; ctx.beginPath();
    for (let i = 0; i <= 20; i++) { const xx = tl.x + (tl.w * i) / 20; ctx.moveTo(xx, tl.y); ctx.lineTo(xx, tl.y + (i % 5 ? 5 : 10) * u); }
    ctx.stroke();
    const r = rng(phone ? 41 : 42);
    const anchors = {};
    for (let row = 0; row < rows; row++) {
      let cx = tl.x;
      const yy = tl.y + 18 * u + row * rh;
      let j = 0;
      while (cx < tl.x + tl.w - 20 * u) {
        const cw = Math.min(tl.w * (0.16 + r() * 0.24), tl.x + tl.w - cx);
        const col = row === 0 ? th.second : row === 1 ? th.acc : th.gold;
        const hot = row === 0 && j === 1;
        const shown = seg(p, 0.15 + row * 0.08 + j * 0.03, 0.3 + row * 0.08 + j * 0.03);
        if (shown > 0) {
          ctx.save(); ctx.globalAlpha *= shown;
          rr(ctx, cx + 2 * u, yy + 3 * u, cw - 6 * u, rh - 8 * u, 5 * u);
          ctx.fillStyle = rgba(col, hot ? 0.55 + 0.25 * Math.sin(t * 5) : 0.28); ctx.fill();
          ctx.lineWidth = (hot ? 2.4 : 1.2) * u; ctx.strokeStyle = rgba(mix(col, WHITE, 0.4), hot ? 1 : 0.7);
          if (hot) { ctx.setLineDash([8 * u, 6 * u]); ctx.lineDashOffset = -t * 40 * u; }
          ctx.stroke(); ctx.setLineDash([]);
          if (row === 2) {
            ctx.strokeStyle = rgba(mix(col, WHITE, 0.5), 0.8); ctx.lineWidth = 1.2 * u; ctx.beginPath();
            for (let k = 6 * u; k < cw - 10 * u; k += 4 * u) { const am = (0.2 + 0.8 * Math.abs(Math.sin(k * 0.07 / u + j))) * (rh - 18 * u) / 2; ctx.moveTo(cx + k, yy + rh / 2 - am); ctx.lineTo(cx + k, yy + rh / 2 + am - 4 * u); }
            ctx.stroke();
          }
          ctx.restore();
        }
        if (hot) anchors.clip = [cx + cw / 2, yy + rh / 2];
        if (row === 2 && j === 0) anchors.track = [cx + cw * 0.7, yy + rh / 2];
        cx += cw; j++;
      }
    }
    // Playhead sweeping.
    const ph = tl.x + fract(t * 0.16) * tl.w;
    ctx.beginPath(); ctx.moveTo(ph, tl.y); ctx.lineTo(ph, tl.y + tl.h);
    tube(ctx, WHITE, 1.6 * u, 0.85);
    ctx.restore();
    // Phosphor scanlines and a rolling refresh bar.
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    for (let yy = y; yy < y + h; yy += 4 * u) ctx.fillRect(x, yy, w, 1.2 * u);
    const rb = y + fract(t * 0.35) * h;
    ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.fillRect(x, rb, w, 26 * u);
    ctx.restore();
    anchors.preview = [pv.x + pv.w * 0.78, pv.y + pv.h * 0.3];
    if (!anchors.clip) anchors.clip = [tl.x + tl.w * 0.35, tl.y + 18 * u + rh / 2];
    if (!anchors.track) anchors.track = [tl.x + tl.w * 0.15, tl.y + 18 * u + rh * 2.5];
    return anchors;
  }

  // Object: a neon wireframe laptop (or handheld) on the grid, its screen live, three callouts.
  function objectScene(ctx, S, th, G, box, p, d, t) {
    const u = S.u, tall = S.tall;
    const phone = d.kind === "phone";
    let sx, sy, sw, sh, base;
    if (phone) {
      sh = tall ? box.h * 0.56 : box.h * 0.92; sw = sh * 0.52;
      sx = tall ? box.x + box.w / 2 - sw / 2 : box.x + box.w * 0.22 - sw / 2 + 40 * u; sy = box.y + (tall ? 10 * u : 0);
      base = sy + sh;
    } else {
      sw = tall ? box.w * 0.94 : box.w * 0.5; sh = sw * 0.6;
      sx = tall ? box.x + box.w * 0.03 : box.x + 30 * u; sy = box.y + (tall ? 10 * u : 0);
      base = sy + sh + (tall ? 80 : 90) * u;
    }
    const bob = Math.sin(t * 1.3) * 4 * u;
    sy += bob;
    // Floor glow and reflection of the body.
    const body = () => {
      if (phone) {
        prism(ctx, S, th, G, sx - 16 * u, sy - 16 * u, sw + 32 * u, sh + 32 * u, 0.035, th.acc, { fill: 0.7, line: 3 });
      } else {
        prism(ctx, S, th, G, sx - 18 * u, sy - 18 * u, sw + 36 * u, sh + 36 * u, 0.03, th.acc, { fill: 0.7, line: 3 });
        // The keyboard deck in perspective.
        const y0 = sy + sh + 18 * u, y1 = base;
        const l0 = sx - 18 * u, r0 = sx + sw + 18 * u, l1 = sx - 70 * u, r1 = sx + sw + 70 * u;
        ctx.beginPath(); ctx.moveTo(l0, y0); ctx.lineTo(r0, y0); ctx.lineTo(r1, y1); ctx.lineTo(l1, y1); ctx.closePath();
        const g = ctx.createLinearGradient(0, y0, 0, y1);
        g.addColorStop(0, rgba(mix(th.bg, th.acc, 0.2), 0.9)); g.addColorStop(1, rgba(mix(th.bg, BLACK, 0.3), 0.9));
        ctx.fillStyle = g; ctx.fill();
        tube(ctx, th.acc, 2.6 * u);
        ctx.strokeStyle = rgba(th.second, 0.45); ctx.lineWidth = 1.2 * u; ctx.beginPath();
        for (let rI = 1; rI < 5; rI++) { const f = rI / 5; const yy = lerp(y0, y1, f * 0.8); ctx.moveTo(lerp(l0, l1, f * 0.8) + 30 * u, yy); ctx.lineTo(lerp(r0, r1, f * 0.8) - 30 * u, yy); }
        for (let cI = 1; cI < 14; cI++) { const f = cI / 14; ctx.moveTo(lerp(l0, r0, f), y0 + 6 * u); ctx.lineTo(lerp(l1, r1, f), lerp(y0, y1, 0.8)); }
        ctx.stroke();
        // Trackpad.
        const tw = sw * 0.22, tx = sx + sw / 2 - tw / 2;
        ctx.beginPath(); ctx.rect(tx, lerp(y0, y1, 0.84), tw, (y1 - y0) * 0.12); tube(ctx, th.second, 1.4 * u, 0.6);
      }
    };
    ctx.save();
    ctx.beginPath(); ctx.ellipse(sx + sw / 2, base + 8 * u, sw * 0.62, 20 * u, 0, 0, TAU);
    ctx.fillStyle = rgba(th.acc, 0.12); ctx.fill(); tube(ctx, th.acc, 1.6 * u, 0.5);
    ctx.restore();
    reflect(ctx, S, base + 10 * u, body, 0.2);
    body();
    const A = editorScreen(ctx, S, th, sx, sy, sw, sh, p, t, phone);
    // Callouts.
    const pts = [A.preview, A.clip, A.track];
    const cols = [th.second, th.acc, th.gold];
    const avail = tall ? box.w : box.x + box.w - (sx + sw + 160 * u);
    const lay = pts.map((pt, i) => {
      const q = eo(seg(p, 0.42 + i * 0.14, 0.62 + i * 0.14));
      const ly = tall ? base + (95 + i * 132) * u : box.y + box.h * (0.12 + i * 0.3);
      const lx = tall ? box.x : sx + sw + 150 * u;
      return { pt, i, q, lx, ly };
    });
    // Leaders first, so every tag's plate sits over any line that passes behind it.
    for (const L of lay) {
      if (L.q <= 0) continue;
      const { pt, i, q, lx, ly } = L;
      ctx.save();
      ctx.globalAlpha *= clamp(q * 1.4);
      ctx.beginPath(); ctx.moveTo(pt[0], pt[1]);
      if (tall) ctx.lineTo(pt[0], lerp(pt[1], ly, q));
      else { const ex = lx - 40 * u, mx2 = lerp(pt[0], ex, 0.5); ctx.lineTo(mx2, pt[1]); ctx.lineTo(lerp(mx2, ex, q), lerp(pt[1], ly, q)); }
      tube(ctx, cols[i], 2 * u, 0.9);
      if (tall && q > 0.95) { ctx.beginPath(); ctx.moveTo(pt[0], ly); ctx.lineTo(box.x + 40 * u, ly); tube(ctx, cols[i], 2 * u, 0.9); }
      ctx.restore();
      glowDot(ctx, pt[0], pt[1], 7 * u * (1 + 0.3 * Math.sin(t * 4 + i)), cols[i], clamp(q * 2));
    }
    for (const L of lay) {
      if (L.q <= 0.55) continue;
      ctx.save(); ctx.globalAlpha *= seg(L.q, 0.55, 1);
      tag(ctx, S, th, d.callouts[L.i], L.lx, L.ly, 46 * u, cols[L.i], "left", tall ? box.w * 0.8 : avail);
      ctx.restore();
    }
  }

  // An original bust in neon: six head-and-hair designs, shades with a travelling glint, a small bob.
  function bust(ctx, S, th, cx, cy, s, v, col, t, i) {
    const u = S.u;
    const by = cy + Math.sin(t * 2.2 + i * 1.3) * 3 * u;
    const dark = rgba(mix(th.bg, BLACK, 0.35));
    ctx.save();
    // Shoulders and collar.
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.48, by + s * 0.62);
    ctx.quadraticCurveTo(cx - s * 0.46, by + s * 0.26, cx - s * 0.14, by + s * 0.2);
    ctx.lineTo(cx + s * 0.14, by + s * 0.2);
    ctx.quadraticCurveTo(cx + s * 0.46, by + s * 0.26, cx + s * 0.48, by + s * 0.62);
    ctx.fillStyle = dark; ctx.fill(); tube(ctx, col, 2.2 * u);
    ctx.beginPath(); ctx.moveTo(cx - s * 0.12, by + s * 0.2); ctx.lineTo(cx, by + s * 0.36); ctx.lineTo(cx + s * 0.12, by + s * 0.2);
    tube(ctx, col, 1.6 * u, 0.8);
    // Neck and head.
    ctx.beginPath(); ctx.rect(cx - s * 0.07, by + s * 0.05, s * 0.14, s * 0.17); ctx.fillStyle = dark; ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, by - s * 0.1, s * 0.19, s * 0.24, 0, 0, TAU);
    ctx.fillStyle = dark; ctx.fill(); tube(ctx, col, 2.2 * u);
    // Hair.
    ctx.beginPath();
    if (v === 0) { // swept quiff
      ctx.moveTo(cx - s * 0.2, by - s * 0.14); ctx.quadraticCurveTo(cx - s * 0.24, by - s * 0.4, cx - s * 0.02, by - s * 0.42);
      ctx.quadraticCurveTo(cx + s * 0.22, by - s * 0.5, cx + s * 0.26, by - s * 0.32); ctx.quadraticCurveTo(cx + s * 0.12, by - s * 0.34, cx + s * 0.2, by - s * 0.14);
      ctx.quadraticCurveTo(cx, by - s * 0.3, cx - s * 0.2, by - s * 0.14);
    } else if (v === 1) { // big curls
      for (let k = 0; k < 7; k++) { const a = Math.PI + (k / 6) * Math.PI; const px = cx + Math.cos(a) * s * 0.22, py = by - s * 0.14 + Math.sin(a) * s * 0.26; ctx.moveTo(px + s * 0.09, py); ctx.arc(px, py, s * 0.09, 0, TAU); }
    } else if (v === 2) { // long side-swept
      ctx.moveTo(cx - s * 0.21, by + s * 0.12); ctx.quadraticCurveTo(cx - s * 0.3, by - s * 0.4, cx + s * 0.05, by - s * 0.38);
      ctx.quadraticCurveTo(cx + s * 0.3, by - s * 0.3, cx + s * 0.24, by + s * 0.14); ctx.moveTo(cx - s * 0.12, by - s * 0.3); ctx.quadraticCurveTo(cx + s * 0.05, by - s * 0.18, cx + s * 0.2, by - s * 0.22);
    } else if (v === 3) { // top bun
      ctx.arc(cx, by - s * 0.42, s * 0.08, 0, TAU); ctx.moveTo(cx - s * 0.19, by - s * 0.14); ctx.quadraticCurveTo(cx, by - s * 0.44, cx + s * 0.19, by - s * 0.14);
    } else if (v === 4) { // cap with brim
      ctx.moveTo(cx - s * 0.2, by - s * 0.2); ctx.quadraticCurveTo(cx, by - s * 0.48, cx + s * 0.2, by - s * 0.2); ctx.lineTo(cx + s * 0.36, by - s * 0.19); ctx.lineTo(cx + s * 0.2, by - s * 0.15); ctx.closePath();
    } else { // spikes
      for (let k = 0; k < 5; k++) { const x0 = cx - s * 0.16 + k * s * 0.08; ctx.moveTo(x0 - s * 0.04, by - s * 0.3); ctx.lineTo(x0, by - s * (0.46 + (k % 2) * 0.06)); ctx.lineTo(x0 + s * 0.04, by - s * 0.3); }
    }
    ctx.fillStyle = rgba(mix(col, th.bg, 0.6)); ctx.fill(); tube(ctx, col, 2 * u);
    // Shades with a glint, or eyes that blink.
    if (v % 3 !== 1) {
      ctx.beginPath(); rr(ctx, cx - s * 0.17, by - s * 0.14, s * 0.34, s * 0.09, s * 0.03);
      const g = ctx.createLinearGradient(0, by - s * 0.14, 0, by - s * 0.05);
      g.addColorStop(0, rgba(th.sun[0] || th.gold)); g.addColorStop(1, rgba(th.acc));
      ctx.fillStyle = g; ctx.fill();
      const gl = fract(t * 0.45 + i * 0.27);
      if (gl < 0.3) {
        ctx.save(); ctx.clip();
        const gx = cx - s * 0.2 + (gl / 0.3) * s * 0.4;
        ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.beginPath(); ctx.moveTo(gx, by - s * 0.14); ctx.lineTo(gx + s * 0.04, by - s * 0.14); ctx.lineTo(gx - s * 0.01, by - s * 0.05); ctx.lineTo(gx - s * 0.05, by - s * 0.05); ctx.fill();
        ctx.restore();
      }
    } else {
      const blink = fract(t * 0.4 + i * 0.3) < 0.05 ? 0.15 : 1;
      ctx.fillStyle = rgba(mix(col, WHITE, 0.6));
      ctx.beginPath(); ctx.ellipse(cx - s * 0.07, by - s * 0.1, s * 0.022, s * 0.03 * blink, 0, 0, TAU); ctx.ellipse(cx + s * 0.07, by - s * 0.1, s * 0.022, s * 0.03 * blink, 0, 0, TAU); ctx.fill();
    }
    ctx.beginPath(); ctx.moveTo(cx - s * 0.05, by + s * 0.03); ctx.quadraticCurveTo(cx, by + s * 0.06, cx + s * 0.05, by + s * 0.03);
    tube(ctx, col, 1.4 * u, 0.8);
    ctx.restore();
  }

  // People: an arcade line-up of player cards; a selector hops between them.
  function peopleScene(ctx, S, th, G, box, p, d, t) {
    const u = S.u, tall = S.tall;
    const n = Math.max(2, Math.min(6, Math.round(d.count || 4)));
    const perRow = tall && n > 3 ? Math.ceil(n / 2) : n;
    const rowsN = Math.ceil(n / perRow);
    const gap = 34 * u;
    const labelH = 96 * u;
    const cw = Math.min((tall ? 300 : 330) * u, (box.w - gap * (perRow - 1)) / perRow);
    const ch = Math.min(cw * 1.3, (box.h - labelH * rowsN - 40 * u) / rowsN);
    const cols = [th.acc, th.second, th.gold];
    const sel = Math.floor(t / 0.85) % n, sf = eio(clamp(fract(t / 0.85) / 0.3));
    const cards = [];
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / perRow), inRow = row < rowsN - 1 ? perRow : n - perRow * (rowsN - 1);
      const k = i - row * perRow;
      const totalW = inRow * cw + (inRow - 1) * gap;
      const x = box.x + (box.w - totalW) / 2 + k * (cw + gap);
      const y = box.y + 10 * u + row * (ch + labelH + 20 * u);
      cards.push({ i, x, y });
    }
    const hi = d.highlight ?? 1;
    cards.forEach((c) => {
      const q = back(seg(p, 0.02 + c.i * 0.07, 0.32 + c.i * 0.07));
      const col = c.i === hi ? th.second : cols[c.i % 3] === th.second ? th.acc : cols[c.i % 3];
      ctx.save();
      const cx = c.x + cw / 2, cy = c.y + ch;
      ctx.translate(cx, cy); ctx.scale(1, Math.max(0.05, q)); ctx.translate(-cx, -cy);
      ctx.globalAlpha *= clamp(q * 1.5);
      prism(ctx, S, th, G, c.x, c.y, cw, ch, 0.04, col, { fill: 0.94, line: c.i === hi ? 3 : 2.2 });
      // Inside: a little sunset and grid behind each player.
      ctx.save();
      ctx.beginPath(); ctx.rect(c.x + 3 * u, c.y + 3 * u, cw - 6 * u, ch - 6 * u); ctx.clip();
      const hz = c.y + ch * 0.68;
      const sg = ctx.createRadialGradient(cx, hz, 0, cx, hz, cw * 0.5);
      sg.addColorStop(0, rgba(col, 0.45)); sg.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = sg; ctx.fillRect(c.x, c.y, cw, ch);
      ctx.strokeStyle = rgba(col, 0.4); ctx.lineWidth = 1.2 * u; ctx.beginPath();
      for (let k = -5; k <= 5; k++) { ctx.moveTo(cx + k * cw * 0.02, hz); ctx.lineTo(cx + k * cw * 0.18, c.y + ch); }
      for (let k = 0; k < 6; k++) { const dd = k + 1 - fract(t * 0.9 + c.i * 0.2); const yy = hz + (ch * 0.32) * 1.1 / (dd + 0.1); if (yy < c.y + ch) { ctx.moveTo(c.x, yy); ctx.lineTo(c.x + cw, yy); } }
      ctx.stroke();
      bust(ctx, S, th, cx, c.y + ch * 0.5, Math.min(cw * 0.95, ch * 0.78), c.i % 6, col, t, c.i);
      ctx.restore();
      // Player number in the corner.
      ctx.font = font(S, 30 * u, 800); ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillStyle = rgba(mix(col, WHITE, 0.6)); ctx.shadowColor = rgba(col); ctx.shadowBlur = 10 * u;
      ctx.fillText(`P${c.i + 1}`, c.x + 14 * u, c.y + 12 * u);
      ctx.restore();
      // Name plate under the card.
      const lq = seg(p, 0.25 + c.i * 0.07, 0.45 + c.i * 0.07);
      if (lq > 0) {
        ctx.save(); ctx.globalAlpha *= lq;
        tag(ctx, S, th, d.badges[c.i % d.badges.length], cx, c.y + ch + labelH * 0.52, 42 * u, col, "center", cw + gap - 6 * u);
        ctx.restore();
      }
    });
    // The selector: neon corner brackets gliding from card to card, with a blinking arrow.
    if (p > 0.3) {
      const a = cards[(sel + n - 1) % n], b = cards[sel];
      const x = lerp(a.x, b.x, sf), y = lerp(a.y, b.y, sf);
      const m = 14 * u, L = 34 * u;
      ctx.save(); ctx.globalAlpha *= seg(p, 0.3, 0.45);
      ctx.beginPath();
      const x0 = x - m, y0 = y - m, x1 = x + cw + m, y1 = y + ch + m;
      ctx.moveTo(x0, y0 + L); ctx.lineTo(x0, y0); ctx.lineTo(x0 + L, y0);
      ctx.moveTo(x1 - L, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + L);
      ctx.moveTo(x1, y1 - L); ctx.lineTo(x1, y1); ctx.lineTo(x1 - L, y1);
      ctx.moveTo(x0 + L, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - L);
      tube(ctx, th.gold, 3 * u);
      if (fract(t * 2) < 0.6) {
        const ax = x + cw / 2, ay = y0 - 20 * u + Math.sin(t * 6) * 4 * u;
        ctx.beginPath(); ctx.moveTo(ax - 14 * u, ay - 16 * u); ctx.lineTo(ax + 14 * u, ay - 16 * u); ctx.lineTo(ax, ay); ctx.closePath();
        ctx.fillStyle = rgba(mix(th.gold, WHITE, 0.4)); ctx.fill(); tube(ctx, th.gold, 1.6 * u);
      }
      ctx.restore();
    }
  }

  // Process: three hex portals on the grid joined by a laser track; a comet runs the track and lights each.
  function processScene(ctx, S, th, G, box, p, d, t) {
    const u = S.u, tall = S.tall;
    const names = ["scan", "spark", "check"];
    const cols = [th.second, th.acc, th.gold];
    const R = tall ? Math.min(125 * u, box.h * 0.105) : Math.min(150 * u, box.w * 0.095);
    const pts = [0, 1, 2].map((i) => tall
      ? [box.x + R + 30 * u, box.y + R + 30 * u + i * (box.h - R * 2 - 60 * u) / 2]
      : [box.x + box.w * (0.17 + i * 0.33), box.y + box.h * 0.4]);
    const hex = (cx, cy, r, rot = 0) => { ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = rot + (k / 6) * TAU + Math.PI / 6; const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); };
    // Track.
    const lit = (i) => seg(p, 0.12 + i * 0.25, 0.3 + i * 0.25);
    ctx.save();
    for (let i = 0; i < 2; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
      const a0 = [x0 + ux * R * 1.1, y0 + uy * R * 1.1], a1 = [x1 - ux * R * 1.1, y1 - uy * R * 1.1];
      ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]);
      ctx.strokeStyle = rgba(th.acc, 0.25); ctx.lineWidth = 10 * u; ctx.lineCap = "round"; ctx.stroke();
      const f = lit(i + 1);
      if (f > 0) { ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(lerp(a0[0], a1[0], eo(f)), lerp(a0[1], a1[1], eo(f))); tube(ctx, cols[i + 1], 3 * u); }
      // Chevrons marching along.
      const seglen = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]);
      const cnt = Math.floor(seglen / (46 * u));
      for (let k = 0; k < cnt; k++) {
        const s = fract(k / cnt + t * 0.4);
        const cx = lerp(a0[0], a1[0], s), cy = lerp(a0[1], a1[1], s), c = 11 * u;
        ctx.beginPath(); ctx.moveTo(cx - ux * c - uy * c, cy - uy * c + ux * c); ctx.lineTo(cx, cy); ctx.lineTo(cx - ux * c + uy * c, cy - uy * c - ux * c);
        ctx.strokeStyle = rgba(mix(th.acc, WHITE, 0.4), 0.5 * Math.sin(Math.PI * s)); ctx.lineWidth = 3 * u; ctx.stroke();
      }
    }
    ctx.restore();
    pts.forEach(([cx, cy], i) => {
      const q = back(seg(p, 0.02 + i * 0.06, 0.25 + i * 0.06));
      const L = lit(i);
      const col = cols[i];
      ctx.save();
      ctx.translate(cx, cy); ctx.scale(q, q); ctx.translate(-cx, -cy);
      ctx.globalAlpha *= clamp(q * 1.5);
      // Pylon to the floor and its reflection pad.
      const floorY = tall ? cy + R * 1.1 : box.y + box.h * 0.74;
      if (!tall) {
        ctx.beginPath(); ctx.moveTo(cx, cy + R); ctx.lineTo(cx, floorY);
        ctx.strokeStyle = rgba(col, 0.35 + 0.4 * L); ctx.lineWidth = 3 * u; ctx.stroke();
        ctx.beginPath(); ctx.ellipse(cx, floorY, R * 0.7, 14 * u, 0, 0, TAU); tube(ctx, col, 2 * u, 0.4 + 0.5 * L);
      }
      // Extruded hexagon.
      const back2 = toward(G, cx, cy, 0.06);
      hex(back2[0], back2[1], R * 0.94); tube(ctx, col, 1.4 * u, 0.4 + 0.3 * L);
      hex(cx, cy, R);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      g.addColorStop(0, rgba(mix(col, th.bg, 0.5), 0.5 + 0.4 * L)); g.addColorStop(1, rgba(mix(th.bg, BLACK, 0.3), 0.9));
      ctx.fillStyle = g; ctx.fill();
      tube(ctx, col, (2.4 + L * 1.2) * u, 0.45 + 0.55 * L);
      // Rotating outer dashes once lit.
      if (L > 0) {
        ctx.save(); ctx.globalAlpha *= L;
        ctx.setLineDash([R * 0.18, R * 0.12]); ctx.lineDashOffset = -t * 40 * u * (i % 2 ? -1 : 1);
        hex(cx, cy, R * 1.16, t * 0.2 * (i % 2 ? -1 : 1));
        ctx.strokeStyle = rgba(mix(col, WHITE, 0.3), 0.75); ctx.lineWidth = 2.4 * u; ctx.stroke();
        ctx.restore();
      }
      icon(ctx, S, names[i], cx, cy + R * 0.05, R * 1.05, col, 0.35 + 0.65 * L, t);
      // Step number in chrome above.
      chrome(ctx, S, th, String(i + 1).padStart(2, "0"), cx, cy - R * 1.22, 64 * u, "center");
      ctx.restore();
      // Label.
      const la = seg(p, 0.1 + i * 0.25, 0.25 + i * 0.25);
      if (la > 0) {
        ctx.save(); ctx.globalAlpha *= la;
        if (tall) tubeText(ctx, S, d.steps[i], cx + R * 1.5, cy, 50 * u, col, "left", box.x + box.w - (cx + R * 1.5));
        else tubeText(ctx, S, d.steps[i], cx, box.y + box.h * 0.74 + 62 * u, 48 * u, col, "center", box.w * 0.31);
        ctx.restore();
      }
    });
    // The comet: once the portals are lit it keeps lapping the track.
    if (p > 0.15) {
      const f = p < 0.8 ? clamp((p - 0.12) / 0.62) : fract((t * 0.42));
      const total = 2, s = f * total, k = Math.min(1, Math.floor(s)), fr = s - k;
      const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
      const hx = lerp(x0, x1, fr), hy = lerp(y0, y1, fr);
      const tl = 0.12;
      const tx = lerp(x0, x1, Math.max(0, fr - tl)), ty = lerp(y0, y1, Math.max(0, fr - tl));
      ctx.save();
      const gr = ctx.createLinearGradient(tx, ty, hx, hy);
      gr.addColorStop(0, rgba(th.gold, 0)); gr.addColorStop(1, rgba(mix(th.gold, WHITE, 0.5), 0.95));
      ctx.strokeStyle = gr; ctx.lineWidth = 8 * u; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
      glowDot(ctx, hx, hy, 11 * u, th.gold);
      ctx.restore();
    }
  }

  // Compare: two arcade score cabinets, a sparking VS between, the better one lit brighter.
  function compareScene(ctx, S, th, G, box, p, d, t) {
    const u = S.u, tall = S.tall;
    const lv = Math.max(0, Number(d.leftValue) || 0), rv = Math.max(0, Number(d.rightValue) || 0);
    const mx = Math.max(1e-6, lv, rv);
    const panels = tall
      ? [{ x: box.x, y: box.y, w: box.w, h: box.h * 0.4 }, { x: box.x, y: box.y + box.h * 0.56, w: box.w, h: box.h * 0.4 }]
      : [{ x: box.x + box.w * 0.02, y: box.y, w: box.w * 0.38, h: box.h * 0.8 }, { x: box.x + box.w * 0.6, y: box.y, w: box.w * 0.38, h: box.h * 0.8 }];
    const items = [
      { label: d.left, v: lv, col: mix(th.acc, th.bg, 0.15), dim: true },
      { label: d.right, v: rv, col: th.second, dim: false },
    ];
    panels.forEach((P, i) => {
      const it = items[i];
      const q = back(seg(p, 0.02 + i * 0.12, 0.3 + i * 0.12));
      const cx = P.x + P.w / 2, cy = P.y + P.h;
      const flick = it.dim ? (fract(t * 0.7) < 0.06 ? 0.45 : 1) : 1;
      ctx.save();
      ctx.translate(cx, cy); ctx.scale(1, Math.max(0.05, q)); ctx.translate(-cx, -cy);
      ctx.globalAlpha *= clamp(q * 1.5);
      reflect(ctx, S, P.y + P.h + 8 * u, () => prism(ctx, S, th, G, P.x, P.y, P.w, P.h, 0.05, it.col, { fill: 0.6 }), 0.18);
      prism(ctx, S, th, G, P.x, P.y, P.w, P.h, 0.05, it.col, { fill: 0.92, line: it.dim ? 2.2 : 3.2, alpha: flick });
      // Marquee stripes across the top.
      ctx.save(); ctx.beginPath(); ctx.rect(P.x, P.y, P.w, P.h); ctx.clip();
      for (let k = 0; k < 4; k++) { ctx.fillStyle = rgba(k % 2 ? th.acc : th.gold, 0.22); ctx.fillRect(P.x, P.y + 14 * u + k * 9 * u, P.w, 4 * u); }
      ctx.restore();
      const cnt = it.v * eo(seg(p, 0.15 + i * 0.12, 0.7 + i * 0.12));
      tubeText(ctx, S, it.label, cx, P.y + (tall ? 80 : 90) * u, 46 * u, it.col, "center", P.w - 40 * u);
      chrome(ctx, S, th, fmt(cnt, it.v, d.prefix, d.suffix), cx, P.y + P.h * (tall ? 0.7 : 0.6), (tall ? 150 : 170) * u, "center", P.w - 50 * u, 96 * u);
      // LED meter.
      const cells = 12, mw = P.w - 70 * u, mx0 = P.x + 35 * u, my = P.y + P.h - (tall ? 60 : 80) * u, cwid = mw / cells;
      const on = (it.v / mx) * cells * eo(seg(p, 0.15 + i * 0.12, 0.7 + i * 0.12));
      for (let k = 0; k < cells; k++) {
        const lit = k < on - 0.01;
        const shimmer = lit ? 0.7 + 0.3 * Math.sin(t * 6 + k * 0.6) : 0.15;
        ctx.fillStyle = rgba(lit ? mix(it.col, WHITE, k / cells * 0.4) : th.ink, shimmer * (lit ? 1 : 0.6));
        ctx.fillRect(mx0 + k * cwid + 3 * u, my, cwid - 6 * u, 26 * u);
      }
      ctx.restore();
    });
    // VS badge with a flickering bolt.
    const vx = tall ? box.x + box.w / 2 : box.x + box.w * 0.5, vy = tall ? box.y + box.h * 0.48 : box.y + box.h * 0.4;
    const qv = back(seg(p, 0.3, 0.5));
    if (qv > 0) {
      ctx.save();
      ctx.translate(vx, vy); ctx.scale(qv, qv); ctx.translate(-vx, -vy);
      const b = rng(Math.floor(t * 12) + 3);
      ctx.beginPath();
      let yy = vy - 120 * u, xx = vx;
      ctx.moveTo(xx, yy);
      while (yy < vy + 120 * u) { yy += 30 * u; xx = vx + (b() - 0.5) * 50 * u; ctx.lineTo(xx, yy); }
      tube(ctx, th.gold, 2.4 * u, 0.5 + 0.5 * b());
      chrome(ctx, S, th, "VS", vx, vy + 36 * u, 104 * u, "center");
      ctx.restore();
    }
    // Change badge on the better cabinet.
    if (lv > 0) {
      const pct = Math.round(((rv - lv) / lv) * 100);
      const qb = back(seg(p, 0.7, 0.88));
      if (qb > 0) {
        const P = panels[1];
        const bx = tall ? P.x + P.w - 30 * u : P.x + P.w - 20 * u, by = P.y - 10 * u;
        ctx.save(); ctx.translate(bx, by); ctx.scale(qb, qb); ctx.translate(-bx, -by);
        tag(ctx, S, th, `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%`, bx, by, 48 * u, th.gold, "right");
        ctx.restore();
        sparkle(ctx, bx - 8 * u, by - 34 * u, 20 * u * (0.6 + 0.4 * Math.sin(t * 3)), qb);
      }
    }
  }

  // Closing: an approval mark stamped over the sun, rings pulsing out and sparks rising.
  function closingArt(ctx, S, th, G, info) {
    const u = S.u, t = info.t, local = info.local;
    const R = G.R;
    const cx = G.sx, cy = G.hy - R * (FRAME.lift * 0.5 - 0.18);
    const q = back(seg(local, 0.25, 0.85));
    if (q <= 0) return;
    ctx.save();
    for (let k = 0; k < 3; k++) {
      const f = fract(t * 0.5 + k / 3);
      ctx.beginPath(); ctx.arc(cx, cy, R * (0.75 + f * 0.9), 0, TAU);
      ctx.strokeStyle = rgba(th.second, 0.55 * (1 - f) * clamp(q)); ctx.lineWidth = 3 * u; ctx.stroke();
    }
    ctx.translate(cx, cy); ctx.scale(q, q); ctx.translate(-cx, -cy);
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.62, 0, TAU);
    ctx.fillStyle = rgba(mix(th.bg, BLACK, 0.2), 0.55); ctx.fill();
    tube(ctx, th.second, 4 * u);
    ctx.setLineDash([R * 0.08, R * 0.06]); ctx.lineDashOffset = -t * 50 * u;
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.72, 0, TAU); ctx.strokeStyle = rgba(mix(th.second, WHITE, 0.4), 0.7); ctx.lineWidth = 2.4 * u; ctx.stroke();
    ctx.setLineDash([]);
    icon(ctx, S, "check", cx, cy, R * 1.1, th.second, 1, t);
    ctx.restore();
    // Rising sparks.
    const r = rng(77);
    ctx.save();
    for (let i = 0; i < 26; i++) {
      const sp = 0.25 + r() * 0.4, ph = r(), x0 = cx + (r() - 0.5) * R * 2.6;
      const f = fract(t * sp + ph);
      const y = G.hy - f * G.hy * 0.8, x = x0 + Math.sin(t * 2 + i) * 14 * u;
      glowDot(ctx, x, y, (2 + r() * 3) * u, i % 2 ? th.gold : th.acc, (1 - f) * clamp(q));
    }
    ctx.restore();
  }

  return {
    // Headlines set straight on this look's backdrop, where its ink and accent (meant for panels) do not read.
    displayInk: { light: "#14062e" },
    displayAccent: { light: "#662c47" },
    bg: "#14062e", panel: "rgba(24,8,52,0.9)", ink: "#fff4fb", muted: "#d9a8e6", accent: "#ff3ea5", onAccent: "#14062e",
    rule: "rgba(255,62,165,0.85)", track: "rgba(255,244,251,0.1)",
    display: "Futura, 'Avenir Next', 'Trebuchet MS', sans-serif", displayWeight: 800, displayCase: "uppercase", displayTracking: "0.02em",
    displayStyle: "italic",
    body: "'Avenir Next', Avenir, 'Segoe UI', Arial, sans-serif", bodyWeight: 600,
    figures: "Futura, 'Avenir Next', 'Trebuchet MS', sans-serif", radius: 6, motion: "glow", change: "scan", kit: { line: 3, fill: "solid", panel: "fill", glow: 16 },
    panelEdge: "rgba(255,62,165,0.7)",
    palettes: {
      // Day: a pastel dusk. Night: midnight blue with cyan. Mono: one green phosphor colour.
      light: { bg: "#2b1d5c", ink: "#ffffff", muted: "#ffd4f0", accent: "#ff6fb1", sky: ["#4b3a9a", "#c46bd1", "#ffb38a"], sun: ["#fff6a8", "#ffb06b", "#ff6f9d"], second: "#6ff5ff", gold: "#ffe08a" },
      dark: { bg: "#050a1f", muted: "#8fb4ff", accent: "#22e4ff", onAccent: "#050a1f", rule: "rgba(34,228,255,0.85)", sky: ["#02040e", "#0a1b4a", "#1d3f8f"], sun: ["#bff8ff", "#38c8ff", "#5b3dff"], second: "#ff4fd8", gold: "#b8a4ff" },
      mono: { bg: "#031208", ink: "#d8ffe0", muted: "#5fbf78", accent: "#39ff6a", onAccent: "#031208", rule: "rgba(57,255,106,0.85)", sky: ["#010703", "#031a0b", "#073d18"], sun: ["#d8ffe0", "#39ff6a", "#0c8a33"], second: "#a8ffbc", gold: "#e4ffe9" },
    },
    textShadow: (accent) => `0 0 6px ${hexA(accent, 0.55)}, 0 0 22px ${hexA(accent, 0.35)}`,
    sky: ["#0b0322", "#2a0a55", "#7a1a7a"], sun: ["#ffe66b", "#ff8a3d", "#ff2e88"], second: "#3ff0ff", gold: "#ffd23f",
    backdrop: () => "#14062e",
    // Only the Illustrated Explainer (the template with an #art canvas) gets chrome lettering, a script
    // kicker and statements lifted into the sky; the other templates keep the look as it was.
    css: (accent, look) => {
      const th = { acc: rgb(accent), second: rgb(look.second || "#3ff0ff"), gold: rgb(look.gold || "#ffd23f"), bg: rgb(look.bg) };
      const stops = chromeStops(th).map(([o, c]) => `${rgba(c)} ${(o * 1.04).toFixed(3)}em`).join(", ");
      const A = "#root:has(> #art)";
      return `${A} .statement { top: 9%; bottom: auto; justify-content: flex-start; }
      ${A} .display { background: repeating-linear-gradient(180deg, ${stops}); -webkit-background-clip: text; background-clip: text;
        -webkit-text-fill-color: transparent; color: transparent; text-shadow: none; -webkit-text-stroke: 1.2px rgba(255,255,255,0.6); padding-right: 0.12em; }
      ${A} #title-scene .kicker { font-family: 'Brush Script MT', 'Segoe Script', 'Snell Roundhand', cursive; font-style: italic; font-weight: 400; text-transform: none;
        letter-spacing: 0.01em; color: ${rgba(mix(rgb(accent), WHITE, 0.45))}; transform: rotate(-4deg) scale(1.9); transform-origin: left bottom; align-self: flex-start;
        text-shadow: 0 0 6px ${hexA(accent, 0.9)}, 0 0 18px ${hexA(accent, 0.7)}, 0 0 38px ${hexA(accent, 0.45)}; }`;
    },
    paint: (ctx, W, H, t, accent, look) => {
      // The Illustrated Explainer draws its own full world over this canvas; skip the duplicate work.
      const host = ctx.canvas.parentNode;
      if (host && host.querySelector && host.querySelector("#art")) { ctx.clearRect(0, 0, W, H); return; }
      const u = Math.min(W, H) / 1080;
      // Tall canvases set the horizon lower so centred copy clears the sun.
      const horizon = H * (H > W * 1.15 ? 0.74 : 0.64);
      ctx.clearRect(0, 0, W, H);
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, look.sky[0]); sky.addColorStop(0.7, look.sky[1]); sky.addColorStop(1, look.sky[2]);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, horizon);
      ctx.fillStyle = look.bg;
      ctx.fillRect(0, horizon, W, H - horizon);
      // The sun: a warm gradient disc, cut by bands that thicken toward the horizon.
      // Half set and off to the right, so headlines read clear of it.
      const r = Math.min(W, H) * 0.17;
      const cx = W > H ? W * 0.8 : W * 0.72, cy = horizon - r * 0.08;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, horizon); ctx.clip();
      const sun = ctx.createLinearGradient(0, cy - r, 0, cy + r);
      sun.addColorStop(0, look.sun[0]); sun.addColorStop(0.55, look.sun[1]); sun.addColorStop(1, look.sun[2]);
      ctx.shadowColor = "rgba(255,120,90,0.65)"; ctx.shadowBlur = 60 * u;
      ctx.fillStyle = sun;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = "destination-out";
      for (let i = 0; i < 6; i++) {
        const y = cy + r * (0.05 + i * 0.17);
        ctx.fillRect(cx - r, y, r * 2, (2 + i * 2.6) * u);
      }
      ctx.restore();
      // The floor: verticals fan out from a vanishing point; horizontals roll forward with time.
      ctx.save();
      ctx.beginPath(); ctx.rect(0, horizon, W, H - horizon); ctx.clip();
      ctx.strokeStyle = hexA(accent, 0.75);
      ctx.shadowColor = hexA(accent, 0.9); ctx.shadowBlur = 10 * u;
      ctx.lineWidth = 2 * u;
      const vx = W * 0.5;
      for (let i = -14; i <= 14; i++) {
        ctx.beginPath(); ctx.moveTo(vx + i * W * 0.012, horizon); ctx.lineTo(vx + i * W * 0.16, H); ctx.stroke();
      }
      const phase = (t * 0.55) % 1;
      for (let k = 0; k < 14; k++) {
        const z = (k + phase) / 14;
        const y = horizon + (H - horizon) * Math.pow(z, 2.2);
        ctx.globalAlpha = Math.min(1, z * 2.4);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      ctx.restore();
      // Horizon line glow.
      const glow = ctx.createLinearGradient(0, horizon - 10 * u, 0, horizon + 10 * u);
      glow.addColorStop(0, "rgba(255,62,165,0)"); glow.addColorStop(0.5, hexA(accent, 0.9)); glow.addColorStop(1, "rgba(255,62,165,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, horizon - 10 * u, W, 20 * u);
    },
    keepArt: true,
    overlap: true,
    stage(ctx, S, info) {
      const th = theme(S), G = geo(S);
      camera(S, info);
      const t = info.t;
      const drawn = FRAME.scene && FRAME.scene !== "title" && FRAME.scene !== "closing";
      // When a drawer-less scene (the closing) is crossing with the outgoing drawing, the outgoing
      // drawer lays the film finish last so it sits over both.
      FRAME.foreLater = !drawn && info.index > 0 && info.local < info.change;
      if (th.world) {
        sky(ctx, S, th, G, t);
        clouds(ctx, S, th, G, t, false);
        sun(ctx, S, th, G, t);
        clouds(ctx, S, th, G, t, true);
        ridges(ctx, S, th, G, t, 0);
        city(ctx, S, th, G, t);
        ridges(ctx, S, th, G, t, 1);
        floor(ctx, S, th, G, t);
        palms(ctx, S, th, G, t);
      }
      if (FRAME.scene === "closing") closingArt(ctx, S, th, G, { ...info, local: FRAME.local });
      if (!drawn && !FRAME.foreLater) fore(ctx, S, th, t);
    },
    scenes: { chart: wrap(chartScene), object: wrap(objectScene), people: wrap(peopleScene), process: wrap(processScene), compare: wrap(compareScene) },
  };
});
