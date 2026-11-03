// Vapor: a dusk-lit retro-futurist dream. A camera drifts across one wide world (a sliced sun sinking
// behind faceted ridges, a colonnade at the horizon, a scrolling neon grid, pastel stratus, floating
// marble orbs and wireframe solids, a dolphin leaping from the grid) while each scene is a stack of
// bevelled desktop windows with its own contents. Scenes end by powering off like a tube and the world
// slides on under a tracking glitch and a light sweep. Every frame is a pure function of time.
window.DreamcutMotion.register("vapor", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const ei = (v) => Math.pow(clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, t) => a + (b - a) * t;
  const fract = (v) => v - Math.floor(v);
  const JP = "'Hiragino Kaku Gothic ProN','Hiragino Sans','Yu Gothic','Noto Sans JP',sans-serif";

  // ---- colour --------------------------------------------------------------------------------------
  const hx = (h) => { const n = parseInt(String(h).slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const toHex = (c) => "#" + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
  const mixh = (a, b, t) => { const A = hx(a), B = hx(b); return toHex([lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)]); };
  const A = (h, a) => hexA(h, a);

  function theme(S) {
    const L = S.look;
    return {
      u: S.u, tex: L.texture ?? 1, hot: S.accent, ink: L.ink,
      sky: L.sky, skyB: L.skyB, sunA: L.sunA, sunM: L.sunM, sunB: L.sunB, gv: L.gridV, gh: L.gridH,
      ridge: L.ridge, ridgeLine: L.ridgeLine, floor: L.floorCols, glow: L.horizonGlow,
      pink: L.cols[0], cyan: L.cols[1], mint: L.cols[2], yellow: L.cols[3], violet: L.cols[4],
      winFace: L.winFace, winFace2: L.winFace2, winInk: L.winInk, winT: L.winT, screen: L.screen, hard: L.hard, marble: L.marble,
    };
  }

  // ---- buffers -------------------------------------------------------------------------------------
  const BUF = {};
  function buf(key, w, h) {
    let c = BUF[key];
    if (!c) c = BUF[key] = document.createElement("canvas");
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return c;
  }
  let NOISE = null;
  function noiseTile() {
    if (NOISE) return NOISE;
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    const img = g.createImageData(256, 256);
    const r = rng(23);
    for (let i = 0; i < img.data.length; i += 4) { const v = r() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    return (NOISE = c);
  }
  const SCAN = {};
  function scanPattern(ctx, u) {
    const key = Math.round(u * 100);
    if (SCAN[key]) return SCAN[key];
    const c = document.createElement("canvas");
    const h = Math.max(3, Math.round(4 * u));
    c.width = 4; c.height = h;
    const g = c.getContext("2d");
    g.fillStyle = "rgba(8,0,24,0.55)"; g.fillRect(0, 0, 4, Math.max(1, Math.round(h * 0.4)));
    return (SCAN[key] = ctx.createPattern(c, "repeat"));
  }

  // ---- plan: scene list and the camera that glides between them ------------------------------------
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  const DEFAULT_HOLDS = [2.4, 3.4, 3.6, 3.2, 3.6, 3.2, 2.4];
  let PLAN = null, PLAN_KEY = "";
  function plan() {
    const ctl = (window.__dreamcut && window.__dreamcut.controls) || {};
    const holds = ORDER.map((id, i) => Number(ctl[`${id}_hold`] ?? DEFAULT_HOLDS[i]));
    const key = holds.join(",");
    if (PLAN && key === PLAN_KEY) return PLAN;
    let t = 0;
    const shown = [];
    ORDER.forEach((id, i) => { if (holds[i] > 0) shown.push({ id, start: t, hold: holds[i] }); t += holds[i]; });
    PLAN_KEY = key;
    return (PLAN = { shown, n: Math.max(1, shown.length), length: t });
  }
  const GLIDE = 0.85;
  function camera(info) {
    const P = plan();
    let pos = 0, gl = 0, q = -1;
    for (let i = 1; i < P.shown.length; i++) {
      const a = P.shown[i].start - 0.32;
      const s = seg(info.t, a, a + GLIDE);
      pos += eio(s);
      if (s > 0 && s < 1) { gl = Math.sin(Math.PI * s); q = s; }
    }
    const n = P.n;
    const mood = n > 1 ? Math.sin((Math.PI * pos) / (n - 1)) : 0;
    return { pos, gl, q, mood, n, P };
  }
  const tab = (arr, pos) => { const i = Math.floor(pos), f = pos - i; return lerp(arr[i % arr.length], arr[(i + 1) % arr.length], f); };

  // ---- text ----------------------------------------------------------------------------------------
  function fontOf(S, k, size, weight) {
    const fam = k === "d" ? S.look.display : k === "j" ? JP : S.look.body;
    return `${weight || (k === "d" ? 900 : 700)} ${size}px ${fam}`;
  }
  // chroma: draws a cyan and a pink ghost either side of the glyphs (the tape's colour fringing).
  function T(ctx, S, th, str, x, y, size, o = {}) {
    ctx.save();
    ctx.font = fontOf(S, o.font || "b", size, o.weight);
    ctx.textAlign = o.align || "left"; ctx.textBaseline = o.base || "alphabetic";
    if ("letterSpacing" in ctx) ctx.letterSpacing = (o.spacing || 0) + "px";
    const s = o.upper ? String(str).toUpperCase() : String(str);
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    if (o.chroma) {
      const a = o.chroma * size * 0.045 + 0.8;
      ctx.fillStyle = A(th.cyan, 0.9); ctx.fillText(s, x - a, y);
      ctx.fillStyle = A(th.pink, 0.9); ctx.fillText(s, x + a, y + a * 0.2);
    }
    if (o.glow) { ctx.shadowColor = o.glowColor || o.color || th.hot; ctx.shadowBlur = o.glow; }
    ctx.fillStyle = o.color || th.ink; ctx.fillText(s, x, y);
    ctx.restore();
  }
  function measure(ctx, S, str, size, k = "b", weight) { ctx.save(); ctx.font = fontOf(S, k, size, weight); const w = ctx.measureText(str).width; ctx.restore(); return w; }
  function lines2(ctx, S, str, size, maxW, k = "b", weight) {
    if (measure(ctx, S, str, size, k, weight) <= maxW) return [str];
    const words = String(str).split(" ");
    for (let i = words.length - 1; i >= 1; i--) {
      const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
      if (measure(ctx, S, a, size, k, weight) <= maxW && measure(ctx, S, b, size, k, weight) <= maxW) return [a, b];
    }
    return [str];
  }

  // ---- drawing primitives --------------------------------------------------------------------------
  function rr(ctx, x, y, w, h, r) {
    const q = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + q, y); ctx.arcTo(x + w, y, x + w, y + h, q); ctx.arcTo(x + w, y + h, x, y + h, q);
    ctx.arcTo(x, y + h, x, y, q); ctx.arcTo(x, y, x + w, y, q); ctx.closePath();
  }
  function neon(ctx, color, width, glow) {
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = glow; ctx.lineWidth = width;
    ctx.stroke(); ctx.shadowBlur = 0; ctx.lineWidth = width * 0.45; ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.stroke();
    ctx.restore();
  }
  function glowDot(ctx, x, y, r, c) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.25, A(c, 0.9)); g.addColorStop(1, A(c, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
  }
  function sparkle(ctx, x, y, r, color, rot = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.beginPath();
    ctx.moveTo(0, -r); ctx.quadraticCurveTo(r * 0.08, -r * 0.08, r, 0); ctx.quadraticCurveTo(r * 0.08, r * 0.08, 0, r);
    ctx.quadraticCurveTo(-r * 0.08, r * 0.08, -r, 0); ctx.quadraticCurveTo(-r * 0.08, -r * 0.08, 0, -r); ctx.closePath();
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = r * 0.8; ctx.fill();
    ctx.restore();
  }

  // A bevelled desktop window: hard offset shadow, raised face, gradient title bar and three buttons.
  // Returns the content rectangle inside it.
  function win(ctx, S, th, x, y, w, h, title, o = {}) {
    const u = S.u, tb = (o.tb ?? 48) * u, bz = 4 * u;
    ctx.save();
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    ctx.fillStyle = A(th.hard, 0.78); ctx.fillRect(x + 11 * u, y + 11 * u, w, h);
    if (o.dark) {
      const g = ctx.createLinearGradient(x, y, x, y + h);
      const fa = o.face ?? 1; g.addColorStop(0, `rgba(34,10,86,${0.9 * fa})`); g.addColorStop(1, `rgba(14,4,42,${0.92 * fa})`);
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = th.cyan; ctx.lineWidth = 3 * u; ctx.shadowColor = th.cyan; ctx.shadowBlur = 14 * u; ctx.strokeRect(x, y, w, h);
      ctx.shadowBlur = 0; ctx.strokeStyle = A(th.pink, 0.9); ctx.lineWidth = 2 * u; ctx.strokeRect(x + 7 * u, y + 7 * u, w - 14 * u, h - 14 * u);
    } else {
      const g = ctx.createLinearGradient(x, y, x + w * 0.3, y + h);
      g.addColorStop(0, th.winFace); g.addColorStop(1, th.winFace2);
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.fillRect(x, y, w, bz * 0.7); ctx.fillRect(x, y, bz * 0.7, h);
      ctx.fillStyle = A(th.hard, 0.55); ctx.fillRect(x, y + h - bz, w, bz); ctx.fillRect(x + w - bz, y, bz, h);
    }
    // Title bar.
    const tg = ctx.createLinearGradient(x, 0, x + w, 0);
    tg.addColorStop(0, th.winT[0]); tg.addColorStop(1, th.winT[1]);
    ctx.fillStyle = tg; ctx.fillRect(x + bz, y + bz, w - bz * 2, tb);
    ctx.fillStyle = "rgba(255,255,255,0.28)"; ctx.fillRect(x + bz, y + bz, w - bz * 2, tb * 0.34);
    if (title) T(ctx, S, th, title, x + bz + 16 * u, y + bz + tb / 2 + 1 * u, 34 * u, { font: "b", color: "#ffffff", base: "middle", weight: 700, upper: true, spacing: 1 * u });
    const bs = tb - 14 * u;
    for (let k = 0; k < 3; k++) {
      const bx = x + w - bz - 8 * u - (k + 1) * (bs + 6 * u) + 6 * u;
      ctx.fillStyle = th.winFace; ctx.fillRect(bx, y + bz + 7 * u, bs, bs);
      ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.fillRect(bx, y + bz + 7 * u, bs, 2 * u); ctx.fillRect(bx, y + bz + 7 * u, 2 * u, bs);
      ctx.fillStyle = A(th.hard, 0.6); ctx.fillRect(bx, y + bz + 7 * u + bs - 2 * u, bs, 2 * u); ctx.fillRect(bx + bs - 2 * u, y + bz + 7 * u, 2 * u, bs);
      ctx.strokeStyle = th.winInk; ctx.lineWidth = 3 * u; ctx.beginPath();
      if (k === 0) { ctx.moveTo(bx + bs * 0.25, bx * 0 + y + bz + 7 * u + bs * 0.25); ctx.lineTo(bx + bs * 0.75, y + bz + 7 * u + bs * 0.75); ctx.moveTo(bx + bs * 0.75, y + bz + 7 * u + bs * 0.25); ctx.lineTo(bx + bs * 0.25, y + bz + 7 * u + bs * 0.75); }
      else if (k === 1) { ctx.rect(bx + bs * 0.27, y + bz + 7 * u + bs * 0.27, bs * 0.46, bs * 0.46); }
      else { ctx.moveTo(bx + bs * 0.25, y + bz + 7 * u + bs * 0.72); ctx.lineTo(bx + bs * 0.75, y + bz + 7 * u + bs * 0.72); }
      ctx.stroke();
    }
    ctx.restore();
    return { x: x + bz + 4 * u, y: y + bz + tb + 6 * u, w: w - bz * 2 - 8 * u, h: h - bz * 2 - tb - 10 * u };
  }

  // A perspective checkerboard strip; `shift` slides the tiles sideways.
  function checker(ctx, x, y, w, h, cols, rows, shift, c1, c2, inset = 0.1) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + w * inset, y); ctx.lineTo(x + w - w * inset, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.clip();
    const sh = fract(shift / 2) * 2;
    for (let r = 0; r < rows; r++) {
      const v0 = r / rows, v1 = (r + 1) / rows;
      const xl0 = x + w * inset * (1 - v0), xr0 = x + w - w * inset * (1 - v0), xl1 = x + w * inset * (1 - v1), xr1 = x + w - w * inset * (1 - v1);
      for (let c = -2; c < cols + 2; c++) {
        const u0 = (c - sh) / cols, u1 = (c + 1 - sh) / cols;
        ctx.beginPath();
        ctx.moveTo(lerp(xl0, xr0, u0), y + h * v0); ctx.lineTo(lerp(xl0, xr0, u1), y + h * v0);
        ctx.lineTo(lerp(xl1, xr1, u1), y + h * v1); ctx.lineTo(lerp(xl1, xr1, u0), y + h * v1); ctx.closePath();
        ctx.fillStyle = ((c + r) & 1) === 0 ? c1 : c2; ctx.fill();
      }
    }
    ctx.restore();
  }

  // ---- wireframe solids ----------------------------------------------------------------------------
  const PHI = (1 + Math.sqrt(5)) / 2;
  function solid(vs, d2) {
    const es = [];
    for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) {
      const d = (vs[i][0] - vs[j][0]) ** 2 + (vs[i][1] - vs[j][1]) ** 2 + (vs[i][2] - vs[j][2]) ** 2;
      if (Math.abs(d - d2) < 0.01) es.push([i, j]);
    }
    return { vs, es };
  }
  const SOLIDS = {
    cube: solid([[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], 4),
    octa: solid([[1.3, 0, 0], [-1.3, 0, 0], [0, 1.3, 0], [0, -1.3, 0], [0, 0, 1.3], [0, 0, -1.3]], 3.38),
    ico: solid([[0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI], [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0], [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]].map((v) => v.map((c) => c * 0.62)), 4 * 0.62 * 0.62),
  };
  function wire(ctx, th, kind, cx, cy, size, t, color, o = {}) {
    const sol = SOLIDS[kind] || SOLIDS.cube;
    const ax = t * (o.sx ?? 0.7) + (o.ph ?? 0), ay = t * (o.sy ?? 1.0) + (o.ph ?? 0) * 1.7;
    const ca = Math.cos(ax), sa = Math.sin(ax), cb = Math.cos(ay), sb = Math.sin(ay);
    const pts = sol.vs.map(([x, y, z]) => {
      const y1 = y * ca - z * sa, z1 = y * sa + z * ca;
      const x2 = x * cb + z1 * sb, z2 = -x * sb + z1 * cb;
      const k = 1 / (1 + z2 * 0.16);
      return [cx + x2 * size * 0.5 * k, cy + y1 * size * 0.5 * k, z2];
    });
    ctx.save();
    if (o.fill) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.7);
      g.addColorStop(0, A(color, 0.28)); g.addColorStop(1, A(color, 0));
      ctx.fillStyle = g; ctx.fillRect(cx - size, cy - size, size * 2, size * 2);
    }
    ctx.lineCap = "round";
    for (const [i, j] of sol.es) {
      const depth = (pts[i][2] + pts[j][2]) / 2;
      ctx.globalAlpha = (o.alpha ?? 1) * clamp(0.62 - depth * 0.2, 0.25, 1);
      ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[j][0], pts[j][1]);
      ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, size * 0.02); ctx.shadowColor = color; ctx.shadowBlur = size * 0.1; ctx.stroke();
    }
    ctx.shadowBlur = 0;
    for (const p of pts) { ctx.globalAlpha = (o.alpha ?? 1) * 0.9; ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(1.8, size * 0.026), 0, TAU); ctx.fill(); }
    ctx.restore();
  }

  // ---- marble: column, orb with ring ----------------------------------------------------------------
  const VEINS = (() => { const r = rng(77); return Array.from({ length: 6 }, () => [r(), r(), r(), r(), r()]); })();
  function column(ctx, S, th, x, base, w, h, o = {}) {
    const u = S.u;
    ctx.save();
    ctx.translate(x, base); if (o.rot) ctx.rotate(o.rot);
    const capH = w * 0.36, baseH = w * 0.24, shaftH = h - capH - baseH;
    const sw = w * 0.7, tw = w * 0.62;
    const topY = -(baseH + shaftH);
    // shaft
    const sg = ctx.createLinearGradient(-sw / 2, 0, sw / 2, 0);
    sg.addColorStop(0, th.marble[2]); sg.addColorStop(0.18, th.marble[0]); sg.addColorStop(0.5, th.marble[1]); sg.addColorStop(0.82, th.marble[0]); sg.addColorStop(1, th.marble[3]);
    ctx.beginPath(); ctx.moveTo(-sw / 2, -baseH); ctx.lineTo(sw / 2, -baseH);
    if (o.broken) {
      const pts = [[tw / 2, topY + shaftH * 0.1], [tw * 0.2, topY + shaftH * 0.02 + shaftH * 0.1], [tw * 0.05, topY + shaftH * 0.16], [-tw * 0.18, topY - shaftH * 0.04 + shaftH * 0.1], [-tw / 2, topY + shaftH * 0.2]];
      for (const p of pts) ctx.lineTo(p[0], p[1]);
    } else { ctx.lineTo(tw / 2, topY); ctx.lineTo(-tw / 2, topY); }
    ctx.closePath(); ctx.fillStyle = sg; ctx.fill();
    ctx.save(); ctx.clip();
    // flutes and veins
    ctx.lineWidth = Math.max(1, 2 * u);
    for (let k = 1; k < 7; k++) {
      const fx = -sw / 2 + (sw * k) / 7;
      ctx.strokeStyle = A(th.hard, 0.16); ctx.beginPath(); ctx.moveTo(fx, topY); ctx.lineTo(fx * (sw / tw) * 0 + fx * 1.0, -baseH); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.moveTo(fx + 3 * u, topY); ctx.lineTo(fx + 3 * u, -baseH); ctx.stroke();
    }
    for (const v of VEINS) {
      ctx.strokeStyle = A(th.violet, 0.2); ctx.lineWidth = Math.max(1, 1.6 * u);
      ctx.beginPath(); ctx.moveTo(-sw / 2 + v[0] * sw, -baseH - v[1] * shaftH * 0.2);
      ctx.bezierCurveTo(-sw / 2 + v[2] * sw, topY + shaftH * 0.7, -sw / 2 + v[3] * sw, topY + shaftH * 0.4, -sw / 2 + v[4] * sw, topY); ctx.stroke();
    }
    // rim light, cyan from the left and pink from the right; `glint` slides a band down the shaft.
    const rl = ctx.createLinearGradient(-sw / 2, 0, sw / 2, 0);
    rl.addColorStop(0, A(th.cyan, 0.5)); rl.addColorStop(0.3, A(th.cyan, 0)); rl.addColorStop(0.7, A(th.pink, 0)); rl.addColorStop(1, A(th.pink, 0.55));
    ctx.fillStyle = rl; ctx.fillRect(-sw / 2, topY, sw, shaftH);
    if (o.glint != null) {
      const gy = topY + shaftH * fract(o.glint);
      const gg = ctx.createLinearGradient(0, gy - shaftH * 0.16, 0, gy + shaftH * 0.16);
      gg.addColorStop(0, "rgba(255,255,255,0)"); gg.addColorStop(0.5, "rgba(255,255,255,0.65)"); gg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gg; ctx.fillRect(-sw / 2, topY, sw, shaftH);
    }
    ctx.restore();
    // base slabs
    ctx.fillStyle = sg;
    ctx.fillRect(-w * 0.46, -baseH * 0.55, w * 0.92, baseH * 0.55); ctx.fillRect(-w * 0.52, -baseH * 0.08 - 0.001, w * 1.04, baseH * 0.08 + 0.001);
    ctx.fillRect(-w * 0.4, -baseH, w * 0.8, baseH * 0.45);
    ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fillRect(-w * 0.46, -baseH * 0.55, w * 0.92, 2 * u);
    if (!o.broken) {
      // capital: echinus, abacus and a pair of volutes
      const cy = topY - capH * 0.5;
      ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(-tw / 2, topY); ctx.lineTo(tw / 2, topY); ctx.lineTo(w * 0.5, cy); ctx.lineTo(-w * 0.5, cy); ctx.closePath(); ctx.fill();
      ctx.fillRect(-w * 0.56, cy - capH * 0.4, w * 1.12, capH * 0.4);
      ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fillRect(-w * 0.56, cy - capH * 0.4, w * 1.12, 2 * u);
      for (const sgn of [-1, 1]) {
        ctx.strokeStyle = A(th.violet, 0.8); ctx.lineWidth = Math.max(1.5, 2.5 * u);
        ctx.beginPath(); const vx = sgn * w * 0.4, vy = cy - capH * 0.02;
        for (let a = 0; a < 9; a += 0.35) { const rad = w * 0.11 * (1 - a / 10); const px = vx + Math.cos(a * sgn * -1 + 0.6) * rad * 1, py = vy + Math.sin(a * sgn * -1 + 0.6) * rad; if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function orb(ctx, S, th, cx, cy, r, t, o = {}) {
    const tilt = (o.tilt ?? -0.38) + Math.sin(t * 0.7 + (o.ph || 0)) * 0.08;
    const rx = r * 1.75, ry = r * 0.46;
    const ring = (a0, a1) => {
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, tilt, a0, a1);
      const g = ctx.createLinearGradient(cx - rx, cy, cx + rx, cy);
      g.addColorStop(0, th.cyan); g.addColorStop(0.5, th.pink); g.addColorStop(1, th.yellow);
      ctx.strokeStyle = g; ctx.lineWidth = r * 0.12; ctx.lineCap = "round"; ctx.shadowColor = th.pink; ctx.shadowBlur = r * 0.3; ctx.stroke(); ctx.shadowBlur = 0;
    };
    ctx.save();
    ring(Math.PI, TAU);
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.42, r * 0.05, cx, cy, r);
    g.addColorStop(0, "#ffffff"); g.addColorStop(0.35, th.marble[0]); g.addColorStop(0.75, th.marble[3]); g.addColorStop(1, th.marble[2]);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip();
    const bands = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    bands.addColorStop(0, A(th.cyan, 0.35)); bands.addColorStop(0.45, A(th.cyan, 0)); bands.addColorStop(0.62, A(th.pink, 0)); bands.addColorStop(1, A(th.pink, 0.45));
    ctx.fillStyle = bands; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.strokeStyle = A(th.violet, 0.22); ctx.lineWidth = Math.max(1.2, r * 0.02);
    for (let k = 0; k < 3; k++) { const o2 = Math.sin(t * 0.4 + k) * r * 0.1; ctx.beginPath(); ctx.moveTo(cx - r, cy - r * 0.2 + k * r * 0.35 + o2); ctx.bezierCurveTo(cx - r * 0.3, cy - r * 0.5 + k * r * 0.3, cx + r * 0.2, cy + r * 0.2 + k * r * 0.3, cx + r, cy - r * 0.1 + k * r * 0.4); ctx.stroke(); }
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(cx - r * 0.36, cy - r * 0.46, r * 0.14, r * 0.08, -0.7, 0, TAU); ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fill();
    ring(0, Math.PI);
    // a bead of light circling the ring
    const a = t * 1.3 + (o.ph || 0), bx = cx + Math.cos(a) * rx * Math.cos(tilt) - Math.sin(a) * ry * Math.sin(tilt), by = cy + Math.cos(a) * rx * Math.sin(tilt) + Math.sin(a) * ry * Math.cos(tilt);
    if (Math.sin(a) > -0.1) glowDot(ctx, bx, by, r * 0.1, "#ffffff");
    ctx.restore();
  }

  function cloud(ctx, S, th, x, y, s, a) {
    ctx.save(); ctx.globalAlpha *= a;
    const bars = [[0.0, 0.0, 1.0], [0.18, 0.22, 0.7], [-0.1, 0.44, 0.9], [0.28, 0.66, 0.5]];
    const h = s * 0.14;
    for (const [dx, dy, wf] of bars) {
      const g = ctx.createLinearGradient(0, y + dy * s * 0.5, 0, y + dy * s * 0.5 + h);
      g.addColorStop(0, th.yellow); g.addColorStop(0.45, th.pink); g.addColorStop(1, th.violet);
      rr(ctx, x + dx * s, y + dy * s * 0.5, s * wf, h, h / 2); ctx.fillStyle = g; ctx.fill();
    }
    ctx.restore();
  }

  function dolphin(ctx, S, th, x, y, s, rot, o = {}) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale((o.flip || 1) * s / 100, s / 100);
    ctx.beginPath();
    ctx.moveTo(-50, 8); ctx.bezierCurveTo(-30, -16, 0, -24, 30, -11); ctx.bezierCurveTo(44, -6, 58, -3, 68, 3);
    ctx.bezierCurveTo(58, 7, 44, 9, 30, 13); ctx.bezierCurveTo(10, 24, -22, 20, -50, 8);
    ctx.moveTo(-50, 8); ctx.bezierCurveTo(-60, 2, -66, -8, -72, -12); ctx.bezierCurveTo(-68, -2, -66, 4, -63, 8);
    ctx.bezierCurveTo(-66, 14, -68, 22, -74, 28); ctx.bezierCurveTo(-64, 24, -58, 18, -50, 8);
    ctx.moveTo(4, -19); ctx.quadraticCurveTo(-4, -38, -22, -40); ctx.quadraticCurveTo(-14, -28, -12, -15);
    ctx.moveTo(12, 14); ctx.quadraticCurveTo(10, 30, -4, 36); ctx.quadraticCurveTo(-2, 24, -2, 18);
    const g = ctx.createLinearGradient(-70, -30, 70, 30);
    g.addColorStop(0, o.a || th.pink); g.addColorStop(0.5, o.b || th.violet); g.addColorStop(1, o.c || th.cyan);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.shadowColor = th.cyan; ctx.shadowBlur = 14; ctx.stroke();
    ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(48, -1, 2.2, 0, TAU); ctx.fillStyle = "#12043a"; ctx.fill();
    ctx.restore();
  }

  // ---- the world: sky, sun, ridges, colonnade, grid, drifting props ----------------------------------
  const STARS = (() => { const r = rng(5); return Array.from({ length: 120 }, () => [r(), r(), 0.6 + r() * 1.8, r() * TAU, r()]); })();
  const RIDGE = (() => { const r = rng(31); const pts = []; for (let i = 0; i < 64; i++) pts.push(0.25 + r() * 0.75); return pts; })();
  const FLANK = [
    ["col", "octa"], ["ico", "col"], ["ring", "cube"], ["colB", "ring"], ["cube", "col"], ["octa", "ico"], ["col", "ring"],
  ];
  const MID = (() => { const r = rng(91); return Array.from({ length: 28 }, (_, i) => ({ k: Math.floor(i / 4), dx: (r() - 0.5) * 1.0, y: 0.1 + r() * 0.36, kind: ["cube", "octa", "ico"][i % 3], size: 0.05 + r() * 0.04, ph: r() * 6, hue: i % 4 })); })();

  function sun(ctx, S, th, x, cy, D, t, h0, sky0) {
    const r = D / 2;
    // halo
    const hg = ctx.createRadialGradient(x, cy, r * 0.5, x, cy, r * 2.3);
    hg.addColorStop(0, A(th.pink, 0.55)); hg.addColorStop(0.5, A(th.violet, 0.18)); hg.addColorStop(1, A(th.violet, 0));
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, S.W, h0); ctx.clip(); ctx.fillStyle = hg; ctx.fillRect(x - r * 2.4, cy - r * 2.4, r * 4.8, r * 4.8);
    const pulse = 1 + 0.012 * Math.sin(t * 1.4);
    const sb = buf("sun", D, D), g = sb.getContext("2d");
    g.globalCompositeOperation = "source-over"; g.clearRect(0, 0, D, D);
    const grad = g.createLinearGradient(0, 0, 0, D);
    grad.addColorStop(0, th.sunA); grad.addColorStop(0.5, th.sunM); grad.addColorStop(1, th.sunB);
    g.fillStyle = grad; g.beginPath(); g.arc(r, r, r, 0, TAU); g.fill();
    g.globalCompositeOperation = "destination-out";
    const N = 9, phase = fract(t * 0.1);
    for (let j = -1; j < N; j++) {
      const base = (j + phase) / N;
      if (base < 0) continue;
      const yy = D * (0.3 + base * 0.7), gap = D * 0.085 * Math.pow(base, 1.1);
      if (gap > 0.6) g.fillRect(0, yy, D, gap);
    }
    ctx.translate(x, cy); ctx.scale(pulse, pulse); ctx.drawImage(sb, -r, -r);
    ctx.restore();
  }

  function world(ctx, S, th, info, cam) {
    const W = S.W, H = S.H, u = S.u, t = info.t, m = cam.mood, pos = cam.pos;
    const h0 = H * (0.56 + 0.025 * Math.sin(pos * 1.7)) - (S.tall ? H * 0.02 : 0);
    // sky
    const sky = [0, 1, 2, 3].map((i) => mixh(th.sky[i], th.skyB[i], m * 0.85));
    const sg = ctx.createLinearGradient(0, 0, 0, h0);
    sg.addColorStop(0, sky[0]); sg.addColorStop(0.45, sky[1]); sg.addColorStop(0.8, sky[2]); sg.addColorStop(1, sky[3]);
    ctx.fillStyle = sg; ctx.fillRect(0, 0, W, h0 + 2);
    // stars, sparkles, a shooting star
    for (let i = 0; i < STARS.length; i++) {
      const s = STARS[i];
      const x = ((s[0] * W * 1.6 - pos * W * 0.08) % (W * 1.6) + W * 1.6) % (W * 1.6) - W * 0.3;
      if (x < -10 || x > W + 10) continue;
      const y = s[1] * h0 * 0.82;
      const tw = 0.55 + 0.45 * Math.sin(t * (1.2 + s[4] * 2.4) + s[3]);
      const a = (0.18 + 0.7 * m + 0.1 * s[4]) * tw;
      if (s[4] > 0.82) sparkle(ctx, x, y, s[2] * 4.2 * u, A("#ffffff", clamp(a)), 0);
      else { ctx.fillStyle = A("#ffffff", clamp(a)); ctx.fillRect(x, y, s[2] * u * 1.5, s[2] * u * 1.5); }
    }
    {
      const per = 5.2, ph = fract((t + 1.1) / per), id = Math.floor((t + 1.1) / per);
      if (ph < 0.17) {
        const q = ph / 0.17, sx = W * (0.12 + 0.5 * fract(id * 0.37)), sy = h0 * (0.05 + 0.18 * fract(id * 0.61));
        const hx2 = sx + q * W * 0.34, hy2 = sy + q * W * 0.12, len = 240 * u;
        const g = ctx.createLinearGradient(hx2 - len, hy2 - len * 0.35, hx2, hy2);
        g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(255,255,255,0.95)");
        ctx.strokeStyle = g; ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.moveTo(hx2 - len, hy2 - len * 0.35); ctx.lineTo(hx2, hy2); ctx.stroke();
        glowDot(ctx, hx2, hy2, 5 * u, "#ffffff");
      }
    }
    // sun
    const D = S.tall ? Math.min(W * 0.66, H * 0.3) : Math.min(W * 0.46, H * 0.56);
    const sxArr = Array.from({ length: cam.n }, (_, i) => (i === 0 || i === cam.n - 1 ? 0.76 : [0.3, 0.68, 0.36, 0.64, 0.4][(i - 1) % 5]));
    const sx = W * tab(sxArr, pos) + Math.sin(t * 0.3) * 6 * u;
    const scy = h0 - D * (0.12 + 0.18 * (1 - m * 0.9)) + D * 0.5 * (m * 0.5);
    sun(ctx, S, th, sx, scy, D, t, h0);
    // stratus drifting right, wrapping
    const CL = [[0.1, 0.36, 520, 0.8], [0.55, 0.22, 380, 0.7], [0.8, 0.44, 640, 0.85], [0.3, 0.52, 300, 0.55], [1.05, 0.3, 440, 0.65]];
    CL.forEach(([cx, cy, sz, al], i) => {
      const span = W + sz * u * 1.8;
      const x = ((cx * W + t * (14 + i * 6) * u - pos * W * 0.22) % span + span) % span - sz * u * 0.9;
      cloud(ctx, S, th, x, h0 * cy, sz * u, al * (0.6 + 0.4 * (1 - m)));
    });
    // ridges
    const rw = W * 3.4, rstep = rw / (RIDGE.length - 1), roff = -pos * W * 0.3;
    const ridgeH = H * 0.2;
    const rg = ctx.createLinearGradient(0, h0 - ridgeH, 0, h0);
    rg.addColorStop(0, mixh(th.ridge, th.violet, 0.25)); rg.addColorStop(1, th.ridge);
    ctx.beginPath(); ctx.moveTo(-20, h0 + 2);
    const pts = [];
    for (let i = 0; i < RIDGE.length; i++) { const x = roff + i * rstep; pts.push([x, h0 - RIDGE[i] * ridgeH]); }
    for (const [x, y] of pts) ctx.lineTo(x, y);
    ctx.lineTo(roff + rw, h0 + 2); ctx.closePath(); ctx.fillStyle = rg; ctx.fill();
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = A(th.ridgeLine, 0.85); ctx.lineWidth = 2.2 * u; ctx.shadowColor = th.ridgeLine; ctx.shadowBlur = 12 * u; ctx.stroke(); ctx.shadowBlur = 0;
    // faceted shading lines on each peak
    ctx.strokeStyle = A(th.ridgeLine, 0.22); ctx.lineWidth = 1.5 * u; ctx.beginPath();
    for (let i = 1; i < pts.length - 1; i += 2) { ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i][0] + rstep * 0.35, h0); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i][0] - rstep * 0.2, h0); }
    ctx.stroke();
    // colonnade on the horizon with a travelling highlight
    {
      const cs = W * 0.15, cnt = 12, span = cs * cnt, ch = H * 0.15, cw = ch * 0.34;
      for (let i = 0; i < cnt; i++) {
        const x = ((i * cs - pos * W * 0.42) % span + span) % span - cs;
        const glint = fract((t * 0.35) - x / (W * 1.4));
        column(ctx, S, th, x, h0 + 4 * u, cw, ch * (i % 5 === 3 ? 0.78 : 1), { broken: i % 5 === 3, glint: glint < 0.5 ? glint * 2 : null });
      }
    }
    // the floor
    const fg = ctx.createLinearGradient(0, h0, 0, H);
    fg.addColorStop(0, mixh(th.floor[0], th.glow, 0.22)); fg.addColorStop(0.18, th.floor[0]); fg.addColorStop(1, th.floor[1]);
    ctx.fillStyle = fg; ctx.fillRect(0, h0, W, H - h0);
    const hg = ctx.createLinearGradient(0, h0, 0, h0 + (H - h0) * 0.22);
    hg.addColorStop(0, A(th.glow, 0.75)); hg.addColorStop(1, A(th.glow, 0));
    ctx.fillStyle = hg; ctx.fillRect(0, h0, W, (H - h0) * 0.22);
    // the sun's reflection: a shimmering column of light on the grid
    {
      const rg2 = ctx.createLinearGradient(0, h0, 0, H);
      rg2.addColorStop(0, A(th.pink, 0.5)); rg2.addColorStop(1, A(th.pink, 0));
      ctx.save(); ctx.beginPath(); ctx.rect(0, h0, W, H - h0); ctx.clip(); ctx.fillStyle = rg2;
      for (let k = 0; k < 14; k++) {
        const v = (k + fract(t * 0.25)) / 14, y = h0 + (H - h0) * Math.pow(v, 1.9), hh = (H - h0) * 0.02 * (0.4 + v * 1.4);
        const ww = D * (0.35 + v * 0.55) * (0.8 + 0.2 * Math.sin(t * 2 + k * 1.9));
        ctx.globalAlpha = (1 - v) * 0.85; ctx.fillRect(sx - ww / 2, y, ww, hh);
      }
      ctx.restore();
    }
    const vx = W / 2 + (sx - W / 2) * 0.15;
    ctx.save(); ctx.beginPath(); ctx.rect(0, h0, W, H - h0); ctx.clip();
    const gh = (a, wd, color) => { ctx.strokeStyle = A(color, a); ctx.lineWidth = wd; ctx.stroke(); };
    // depth lines scrolling towards the viewer
    const NZ = 16, zph = fract(t * 0.3);
    ctx.beginPath();
    for (let k = 0; k < NZ; k++) { const d = (k + zph) / NZ, y = h0 + (H - h0) * Math.pow(d, 2.3); ctx.moveTo(0, y); ctx.lineTo(W, y); }
    gh(0.3, 7 * u, th.gh); ctx.shadowBlur = 0;
    ctx.beginPath();
    for (let k = 0; k < NZ; k++) { const d = (k + zph) / NZ, y = h0 + (H - h0) * Math.pow(d, 2.3); ctx.moveTo(0, y); ctx.lineTo(W, y); }
    gh(0.95, 2.2 * u, th.gh);
    const sp = W * 0.1, J = Math.ceil(W / sp) + 14, off = (pos * W * 0.55) % sp;
    ctx.beginPath();
    for (let j = 0; j < J; j++) { const xb = W / 2 + (j - J / 2) * sp - off * 1.0 + Math.sin(t * 0.4) * 0; ctx.moveTo(vx + (xb - W / 2) * 0.02, h0); ctx.lineTo(xb + (xb - W / 2) * 1.2, H); }
    gh(0.3, 7 * u, th.gv);
    ctx.beginPath();
    for (let j = 0; j < J; j++) { const xb = W / 2 + (j - J / 2) * sp - off; ctx.moveTo(vx + (xb - W / 2) * 0.02, h0); ctx.lineTo(xb + (xb - W / 2) * 1.2, H); }
    gh(0.9, 2 * u, th.gv);
    ctx.restore();
    // horizon line
    ctx.beginPath(); ctx.moveTo(0, h0); ctx.lineTo(W, h0); neon(ctx, th.glow, 3 * u, 18 * u);

    // the dolphin leaps out of the grid every few seconds
    {
      const per = 6.4, ph0 = fract((t + 0.8) / per), id = Math.floor((t + 0.8) / per);
      const dur = 0.4;
      if (ph0 < dur) {
        const q = ph0 / dur, dirn = id % 2 ? -1 : 1;
        const x0 = W * (dirn > 0 ? 0.08 + 0.12 * fract(id * 0.43) : 0.92 - 0.12 * fract(id * 0.43)), x1 = x0 + dirn * W * 0.5;
        const yw = h0 + (H - h0) * 0.07, ap = H * (S.tall ? 0.12 : 0.27);
        const x = lerp(x0, x1, q), y = yw - 4 * ap * q * (1 - q);
        const ang = Math.atan2(-4 * ap * (1 - 2 * q), Math.abs(x1 - x0));
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, yw + 1); ctx.clip();
        dolphin(ctx, S, th, x, y, 150 * u, dirn > 0 ? ang : -ang, { flip: dirn });
        ctx.restore();
        for (const [ex, k] of [[x0, 0], [x1, 1]]) {
          const rs = k === 0 ? seg(q, 0, 0.5) : seg(q, 0.85, 1.6);
          if (rs > 0) for (let r = 0; r < 3; r++) { const rq = clamp(rs - r * 0.18); if (rq > 0 && rq < 1) { ctx.beginPath(); ctx.ellipse(ex, yw, (40 + rq * 150) * u, (8 + rq * 26) * u, 0, 0, TAU); ctx.strokeStyle = A(th.cyan, (1 - rq) * 0.8); ctx.lineWidth = 3 * u; ctx.stroke(); } }
        }
        // droplets
        for (let k = 0; k < 10; k++) {
          const e = k < 5 ? 0 : 1, qq = e === 0 ? q : q - 0.85; if (qq < 0 || qq > 0.5) continue;
          const px = (e ? x1 : x0) + (k % 5 - 2) * 14 * u * (1 + qq * 3), py = yw - (60 + (k % 3) * 24) * u * Math.sin(Math.PI * clamp(qq * 2.4)) ;
          ctx.fillStyle = A("#ffffff", 0.9 * (1 - qq * 2)); ctx.beginPath(); ctx.arc(px, py, 3 * u, 0, TAU); ctx.fill();
        }
      }
    }

    // mid props: small solids drifting at half speed
    for (const o of MID) {
      const x = W / 2 + (o.k - pos) * W * 0.6 + o.dx * W, y = H * (S.tall ? o.y * 0.8 : o.y);
      if (x < -120 * u || x > W + 120 * u) continue;
      const colr = [th.cyan, th.pink, th.mint, th.yellow][o.hue];
      wire(ctx, th, o.kind, x, y + Math.sin(t * 0.9 + o.ph) * 10 * u, Math.max(H, W * 0.6) * o.size, t, colr, { ph: o.ph, alpha: 0.7 });
    }
    // near props at the frame edges, plus one big piece that sweeps through at each change
    const P = cam.P;
    for (let k = 0; k < cam.n; k++) {
      const pair = FLANK[k % FLANK.length];
      [[-1, pair[0]], [1, pair[1]]].forEach(([side, kind], si) => {
        const x = W / 2 + (k - pos) * W + side * W * 0.485;
        if (x < -300 * u || x > W + 300 * u) return;
        const ph = k * 1.9 + si * 3.1, bob = Math.sin(t * 0.8 + ph) * 16 * u;
        const sc = (S.tall ? 0.74 : 1);
        if (kind === "col" || kind === "colB") {
          const ch = H * (S.tall ? 0.42 : 0.62) ;
          const bx = x, by = H * 0.98 + bob * 0.3;
          ctx.save(); ctx.fillStyle = A(th.hard, 0.45); ctx.beginPath(); ctx.ellipse(bx, H * 0.985, 130 * u * sc, 20 * u, 0, 0, TAU); ctx.fill(); ctx.restore();
          column(ctx, S, th, bx, by, 210 * u * sc, ch, { broken: kind === "colB", rot: side * 0.03 + Math.sin(t * 0.5 + ph) * 0.012, glint: t * 0.18 + ph });
        } else if (kind === "ring") orb(ctx, S, th, x, H * (S.tall ? 0.78 : 0.62) + bob, 120 * u * sc, t, { ph, tilt: -0.4 * side });
        else wire(ctx, th, kind, x, H * (S.tall ? 0.8 : 0.58) + bob, 280 * u * sc, t, [th.cyan, th.pink][si], { ph, fill: true, sx: 0.5, sy: 0.8 });
      });
      // a pair of floating bars in the far corner for density
    }
    for (let k = 0; k < cam.n - 1; k++) {
      const x = W / 2 - (pos - (k + 0.5)) * W * 1.85;
      if (x < -420 * u || x > W + 420 * u) continue;
      const kind = k % 3;
      if (kind === 0) orb(ctx, S, th, x, H * 0.5, 190 * u, t * 2.2, { ph: k, tilt: -0.2 });
      else if (kind === 1) column(ctx, S, th, x, H * 1.02, 280 * u, H * 1.0, { rot: (x - W / 2) * 0.0004, glint: t });
      else wire(ctx, th, "ico", x, H * 0.5, 520 * u, t * 2, th.pink, { fill: true, sx: 1.2, sy: 1.6, ph: k });
    }
  }

  // ---- full-frame passes: scrims, marquee, statement window, VHS ----------------------------------
  function scrims(ctx, S, th, info) {
    const W = S.W, H = S.H, u = S.u;
    // darken behind the headline and soften the drawing area so the art always reads on the busy world
    const drawn = info.scene && info.scene !== "title" && info.scene !== "closing";
    if (drawn) {
      const g = ctx.createLinearGradient(0, 0, 0, H * (S.tall ? 0.3 : 0.4));
      g.addColorStop(0, A(th.hard, 0.78)); g.addColorStop(1, A(th.hard, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * (S.tall ? 0.3 : 0.4));
      const cx = W / 2, cy = H * (S.tall ? 0.62 : 0.64);
      const rg = ctx.createRadialGradient(cx, cy, H * 0.05, cx, cy, W * 0.62);
      rg.addColorStop(0, A(th.hard, 0.5)); rg.addColorStop(1, A(th.hard, 0));
      ctx.save(); ctx.translate(cx, cy); ctx.scale(1, S.tall ? 1.5 : 0.62); ctx.translate(-cx, -cy); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H * 2); ctx.restore();
    }
  }

  function marquee(ctx, S, th, t, scene) {
    const W = S.W, H = S.H, u = S.u, h = 72 * u, y = H - h;
    ctx.save();
    const g = ctx.createLinearGradient(0, y, 0, H);
    g.addColorStop(0, A(th.hard, 0.86)); g.addColorStop(1, A(th.hard, 0.96));
    ctx.fillStyle = g; ctx.fillRect(0, y, W, h);
    ctx.fillStyle = th.cyan; ctx.shadowColor = th.cyan; ctx.shadowBlur = 12 * u; ctx.fillRect(0, y, W, 3 * u); ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.rect(0, y + 3 * u, W - 330 * u, h); ctx.clip();
    const str = "◆ ドリームカット ◆ DREAMCUT ◆ 夢の編集 ◆ DREAM EDIT ◆ 永遠の夕暮れ ◆ ";
    ctx.font = fontOf(S, "j", 44 * u, 700);
    const sw = ctx.measureText(str).width, off = (t * 120 * u) % sw;
    ctx.fillStyle = A(th.pink, 0.95); ctx.textBaseline = "middle";
    for (let x = -off; x < W; x += sw) ctx.fillText(str, x, y + h / 2 + 3 * u);
    ctx.restore();
    // tape counter with a blinking record dot
    ctx.save(); ctx.fillStyle = A(th.hard, 1); ctx.fillRect(W - 330 * u, y + 3 * u, 330 * u, h);
    ctx.fillStyle = th.cyan; ctx.fillRect(W - 330 * u, y + 3 * u, 3 * u, h);
    if (Math.floor(t * 2) % 2 === 0) { ctx.fillStyle = "#ff3a5c"; ctx.shadowColor = "#ff3a5c"; ctx.shadowBlur = 12 * u; ctx.beginPath(); ctx.arc(W - 296 * u, y + h / 2 + 2 * u, 12 * u, 0, TAU); ctx.fill(); }
    ctx.restore();
    const tt = Math.floor(t * 30), pad = (n) => String(n).padStart(2, "0");
    T(ctx, S, th, `${pad(Math.floor(t / 60))}:${pad(Math.floor(t % 60))}:${pad(tt % 30)}`, W - 20 * u, y + h / 2 + 4 * u, 44 * u, { font: "b", align: "right", base: "middle", color: th.cyan });
  }

  // The title and closing card: a tinted glass window the headline sits in.
  function statementWindow(ctx, S, th, info, kind, exitQ) {
    const W = S.W, H = S.H, u = S.u, t = info.t;
    const side = (S.tall ? 90 : 140) * u;
    const x = side * 0.5, w = W - side;
    const y = H * (S.tall ? 0.2 : 0.16), h = H * (S.tall ? 0.6 : 0.66);
    const arrive = kind === "closing" ? back(seg(info.local, 0, 0.55)) : 1;
    const sx = 1 + exitQ * 0.04, sy = Math.max(0.015, 1 - ei(exitQ));
    ctx.save();
    ctx.translate(W / 2, y + h * 0.62); ctx.scale(sx * arrive, sy * arrive); ctx.translate(-W / 2, -(y + h * 0.62));
    ctx.globalAlpha *= clamp(1 - exitQ * 0.7);
    const inner = win(ctx, S, th, x, y, w, h, kind === "closing" ? "fin.exe" : "dreamcut.exe", { dark: true, face: 0.12 });
    { const lg = ctx.createLinearGradient(inner.x, 0, inner.x + inner.w, 0); lg.addColorStop(0, "rgba(10,2,34,0.62)"); lg.addColorStop(0.55, "rgba(10,2,34,0.34)"); lg.addColorStop(1, "rgba(10,2,34,0)"); ctx.fillStyle = lg; ctx.fillRect(inner.x, inner.y, inner.w, inner.h); }
    // inside: a faint perspective grid that keeps sliding, and a loading strip along the bottom
    ctx.save(); ctx.beginPath(); ctx.rect(inner.x, inner.y, inner.w, inner.h); ctx.clip();
    ctx.strokeStyle = A(th.cyan, 0.13); ctx.lineWidth = 2 * u; ctx.beginPath();
    const gy0 = inner.y + inner.h * 0.55;
    for (let k = 0; k < 12; k++) { const d = (k + fract(t * 0.35)) / 12, yy = gy0 + (inner.y + inner.h - gy0) * d * d; ctx.moveTo(inner.x, yy); ctx.lineTo(inner.x + inner.w, yy); }
    for (let k = -10; k <= 10; k++) { ctx.moveTo(inner.x + inner.w / 2 + k * 6 * u, gy0); ctx.lineTo(inner.x + inner.w / 2 + k * 120 * u, inner.y + inner.h); }
    ctx.stroke();
    ctx.restore();
    const by = inner.y + inner.h - 62 * u, bw = inner.w - 120 * u, bx = inner.x + 60 * u, nseg = 28;
    const fill = kind === "closing" ? 1 : seg(info.local, 0.2, Math.max(1.2, info.hold * 0.8));
    for (let k = 0; k < nseg; k++) {
      const lit = k / nseg < fill, sx2 = bx + (bw / nseg) * k;
      ctx.fillStyle = lit ? A(k % 2 ? th.pink : th.cyan, 0.5 + 0.5 * Math.sin(t * 5 - k * 0.5) ** 2) : A("#ffffff", 0.08);
      ctx.fillRect(sx2, by, bw / nseg - 5 * u, 22 * u);
    }
    T(ctx, S, th, "ドリームカット", inner.x + inner.w - 28 * u, inner.y + 52 * u, 44 * u, { font: "j", align: "right", color: A(th.cyan, 0.9) });
    // corner sparkles keep the card alive through the hold
    for (let k = 0; k < 4; k++) sparkle(ctx, inner.x + inner.w * (0.1 + 0.8 * fract(k * 0.37 + 0.1)), inner.y + inner.h * (0.2 + 0.5 * fract(k * 0.61)), (10 + 8 * Math.sin(t * 2.4 + k * 1.7) ** 2) * u, A("#ffffff", 0.9), t * 0.6 + k);
    ctx.restore();
  }

  function post(ctx, S, th, info, cam) {
    const W = S.W, H = S.H, u = S.u, t = info.t, tex = th.tex, gl = cam.gl;
    if (tex <= 0.01 && gl <= 0.01) return;
    const sn = buf("snap", W, H), g = sn.getContext("2d");
    g.clearRect(0, 0, W, H); g.drawImage(ctx.canvas, 0, 0);
    const r = rng(7000 + Math.floor(t * 24));
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // horizontal tearing: a few strips slip sideways, many more at a scene change
    const strips = Math.round((1 + 9 * gl) * (0.4 + 0.6 * tex));
    for (let k = 0; k < strips; k++) {
      const y = r() * H, hh = (6 + r() * (28 + 50 * gl)) * u, dx = (r() - 0.5) * 2 * (6 + 70 * gl) * u * (0.4 + 0.6 * tex);
      ctx.drawImage(sn, 0, y, W, hh, dx, y, W, hh);
    }
    // tracking band rolling down the tape
    const by = ((t * 0.09) % 1.3 - 0.15) * H, bh = 70 * u;
    ctx.drawImage(sn, 0, by, W, bh, (8 + 20 * gl) * u * tex, by, W, bh);
    const bg = ctx.createLinearGradient(0, by, 0, by + bh);
    bg.addColorStop(0, "rgba(255,255,255,0)"); bg.addColorStop(0.5, `rgba(255,255,255,${0.13 * tex})`); bg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = bg; ctx.fillRect(0, by, W, bh);
    for (let k = 0; k < 40 * tex; k++) { ctx.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.45})`; ctx.fillRect(r() * W, by + r() * bh, (4 + r() * 22) * u, 1.5 * u); }
    // colour ghost while the camera moves
    if (gl > 0.04) {
      ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = 0.34 * gl * tex;
      ctx.drawImage(sn, 14 * u * gl, 0); ctx.globalAlpha = 0.22 * gl * tex; ctx.drawImage(sn, -12 * u * gl, 3 * u);
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
      // a light sweep races across with the world
      const sxx = lerp(W * 1.2, -W * 0.2, cam.q), sw = W * 0.18;
      const lg = ctx.createLinearGradient(sxx - sw, 0, sxx + sw, 0);
      lg.addColorStop(0, A(th.cyan, 0)); lg.addColorStop(0.35, A(th.cyan, 0.5)); lg.addColorStop(0.5, "rgba(255,255,255,0.9)"); lg.addColorStop(0.65, A(th.pink, 0.55)); lg.addColorStop(1, A(th.pink, 0));
      ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.4 * Math.sin(Math.PI * cam.q); ctx.fillStyle = lg; ctx.fillRect(sxx - sw, 0, sw * 2, H);
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    }
    // scanlines, animated grain, vignette
    ctx.globalAlpha = 0.4 * tex; ctx.fillStyle = scanPattern(ctx, u); ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.09 * tex; ctx.globalCompositeOperation = "overlay";
    const nz = noiseTile(), ox = Math.floor(r() * 256), oy = Math.floor(r() * 256);
    for (let x = -ox; x < W; x += 256) for (let y = -oy; y < H; y += 256) ctx.drawImage(nz, x, y);
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.78);
    vg.addColorStop(0, "rgba(10,0,30,0)"); vg.addColorStop(1, `rgba(10,0,30,${0.5 * tex})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // ---- scene wrapper: arrival glitch, tube power-off on the way out -------------------------------
  function wrap(fn) {
    return (ctx, S, box, p, d, info) => {
      const th = theme(S), cam = camera(info), P = cam.P;
      const exitQ = (P.shown[P.shown.length - 1].id === (SCENEOF(info, P) || "")) ? 0 : seg(info.local, info.hold - info.change, info.hold);
      const u = S.u, lt = info.local;
      ctx.save();
      const arrive = 1 - seg(lt, 0, 0.35);
      ctx.translate(Math.sin(lt * 70) * 14 * u * arrive * th.tex, 0);
      if (exitQ > 0) {
        const cx = box.x + box.w / 2, cy = box.y + box.h * 0.5;
        ctx.translate(cx, cy); ctx.scale(1 + exitQ * 0.05, Math.max(0.012, 1 - Math.pow(exitQ, 2.2))); ctx.translate(-cx, -cy);
        ctx.globalAlpha *= clamp(1 - Math.pow(exitQ, 3) * 0.4);
      }
      fn(ctx, S, th, box, d, info, lt);
      ctx.restore();
      post(ctx, S, th, info, cam);
    };
  }
  const SCENEOF = (info) => { const P = plan(); for (const s of P.shown) if (info.t >= s.start - 1e-6 && info.t < s.start + s.hold) return s.id; return null; };

  // ---- scenes --------------------------------------------------------------------------------------
  function pillar(ctx, S, th, x, base, w, h, dx, dy, a, b, t, i, hot) {
    const u = S.u;
    if (h < 1) return;
    ctx.save();
    // side face and top face
    ctx.beginPath(); ctx.moveTo(x + w, base); ctx.lineTo(x + w + dx, base + dy); ctx.lineTo(x + w + dx, base + dy - h); ctx.lineTo(x + w, base - h); ctx.closePath();
    ctx.fillStyle = mixh(b, "#000000", 0.4); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x, base - h); ctx.lineTo(x + w, base - h); ctx.lineTo(x + w + dx, base + dy - h); ctx.lineTo(x + dx, base + dy - h); ctx.closePath();
    ctx.fillStyle = mixh(a, "#ffffff", 0.5); ctx.fill();
    // front face
    const g = ctx.createLinearGradient(x, base - h, x, base);
    g.addColorStop(0, a); g.addColorStop(1, b);
    ctx.fillStyle = g; ctx.fillRect(x, base - h, w, h);
    ctx.save(); ctx.beginPath(); ctx.rect(x, base - h, w, h); ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.lineWidth = 2 * u;
    for (let k = 1; k < 6; k++) { ctx.beginPath(); ctx.moveTo(x + (w * k) / 6, base - h); ctx.lineTo(x + (w * k) / 6, base); ctx.stroke(); }
    const sy = base - ((t * 0.5 + i * 0.21) % 1.5) * h * 1.3 + h * 0.15;
    const sg = ctx.createLinearGradient(0, sy - 46 * u, 0, sy + 46 * u);
    sg.addColorStop(0, "rgba(255,255,255,0)"); sg.addColorStop(0.5, "rgba(255,255,255,0.5)"); sg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sg; ctx.fillRect(x, sy - 46 * u, w, 92 * u);
    ctx.restore();
    // neon edges
    ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x, base - h); ctx.lineTo(x + dx, base - h + dy); ctx.lineTo(x + w + dx, base - h + dy); ctx.lineTo(x + w, base - h); ctx.lineTo(x, base - h);
    neon(ctx, hot ? th.yellow : th.cyan, 3 * u, hot ? 22 * u : 10 * u);
    ctx.restore();
  }

  function chartScene(ctx, S, th, b, d, info, lt) {
    const u = S.u, t = info.t, n = d.values.length, max = Math.max(...d.values, 1);
    const stripH = 100 * u, sw = b.w / n;
    const baseY = b.y + b.h - stripH * 0.38;
    const Hmax = Math.min(b.h * 0.8, baseY - b.y - 150 * u);
    const bw = Math.min(sw * 0.54, 250 * u), dx = bw * 0.24, dy = -bw * 0.15;
    // the plinth strip
    const sa = back(seg(lt, 0, 0.5));
    ctx.save(); ctx.globalAlpha *= clamp(sa);
    checker(ctx, b.x - 30 * u, b.y + b.h - stripH, b.w + 60 * u, stripH, 30, 3, t * 0.6, A("#ffffff", 0.88), A(th.violet, 0.9), 0.06);
    ctx.beginPath(); ctx.moveTo(b.x - 30 * u + 0.06 * (b.w + 60 * u), b.y + b.h - stripH); ctx.lineTo(b.x + b.w + 30 * u - 0.06 * (b.w + 60 * u), b.y + b.h - stripH); neon(ctx, th.pink, 3 * u, 14 * u);
    ctx.restore();
    // axis guides
    ctx.save(); ctx.setLineDash([14 * u, 12 * u]); ctx.lineDashOffset = -t * 40 * u; ctx.strokeStyle = A(th.cyan, 0.35 * eo(seg(lt, 0.1, 0.6))); ctx.lineWidth = 2 * u;
    for (let k = 1; k <= 3; k++) { const y = baseY - (Hmax * k) / 4 * 1.0; ctx.beginPath(); ctx.moveTo(b.x, y); ctx.lineTo(b.x + b.w * eo(seg(lt, 0.1, 0.7)), y); ctx.stroke(); }
    ctx.restore();
    d.values.forEach((v, i) => {
      const hot = i === d.highlight;
      const q = eo(seg(lt, 0.1 + i * 0.09, 0.9 + i * 0.09)), bq = back(seg(lt, 0.1 + i * 0.09, 0.9 + i * 0.09));
      const h = Hmax * (v / max) * clamp(bq, 0, 1.06);
      const x = b.x + sw * i + (sw - bw) / 2 - dx / 2;
      const cols = hot ? [th.yellow, th.hot] : [[th.cyan, th.violet], [th.mint, th.cyan], [th.pink, th.violet]][i % 3];
      if (hot && q > 0.2) {
        const gg = ctx.createRadialGradient(x + bw / 2, baseY - h * 0.5, 0, x + bw / 2, baseY - h * 0.5, bw * 1.6);
        gg.addColorStop(0, A(th.hot, 0.45 + 0.15 * Math.sin(t * 3))); gg.addColorStop(1, A(th.hot, 0));
        ctx.fillStyle = gg; ctx.fillRect(x - bw * 1.5, baseY - h - bw, bw * 4, h + bw * 2);
      }
      {
        // the slot is outlined before the pillar fills it
        const fh = Hmax * (v / max);
        ctx.save(); ctx.setLineDash([12 * u, 9 * u]); ctx.lineDashOffset = -t * 30 * u; ctx.strokeStyle = A(cols[0], 0.55 * (1 - q * 0.8) * clamp(sa)); ctx.lineWidth = 2.5 * u;
        ctx.strokeRect(x, baseY - fh, bw, fh); ctx.beginPath(); ctx.moveTo(x, baseY - fh); ctx.lineTo(x + dx, baseY - fh + dy); ctx.lineTo(x + bw + dx, baseY - fh + dy); ctx.lineTo(x + bw, baseY - fh); ctx.stroke(); ctx.restore();
      }
      pillar(ctx, S, th, x, baseY, bw, h, dx, dy, cols[0], cols[1], t, i, hot);
      {
        const lw0 = Math.max(sw * 0.78, 150 * u);
        ctx.save(); ctx.globalAlpha *= clamp(sa);
        rr(ctx, x + (bw + dx) / 2 - lw0 / 2, b.y + b.h - stripH * 0.88, lw0, 64 * u, 8 * u); ctx.fillStyle = A(th.hard, 0.92); ctx.fill();
        ctx.strokeStyle = hot ? th.yellow : th.cyan; ctx.lineWidth = 2.5 * u; ctx.stroke();
        T(ctx, S, th, d.labels[i] || "", x + (bw + dx) / 2, b.y + b.h - stripH * 0.88 + 33 * u, 44 * u, { font: "b", align: "center", base: "middle", color: hot ? th.yellow : "#ffffff" });
        ctx.restore();
      }
      if (q > 0.08) {
        const size = Math.max(96 * u, Math.min(122 * u, sw * 0.34));
        const num = S.look.__fmt ? "" : "";
        const txt = window.DreamcutMotion.formatNumber(v * q, 0, d.prefix, d.suffix);
        const jx = hot ? Math.sin(t * 9 + i) * 1.2 * u : 0;
        T(ctx, S, th, txt, x + (bw + dx) / 2 + jx, baseY - h - 26 * u + dy, size, { font: "d", align: "center", color: hot ? th.yellow : "#ffffff", chroma: 1, glow: hot ? 24 * u : 0, glowColor: th.hot, alpha: clamp(q * 3) });
      }
      if (hot && q > 0.7) {
        // a ring circles the winning pillar, an arrow bobs above it
        const rcx = x + (bw + dx) / 2, rcy = baseY - h - 170 * u - Math.sin(t * 2) * 8 * u + dy;
        if (rcy > b.y - 40 * u) {
          const a = t * 2.4;
          ctx.save(); ctx.translate(rcx, rcy); ctx.beginPath(); ctx.ellipse(0, 0, bw * 0.62, bw * 0.17, -0.2, Math.PI, TAU); neon(ctx, th.pink, 4 * u, 14 * u);
          ctx.beginPath(); ctx.ellipse(0, 0, bw * 0.62, bw * 0.17, -0.2, 0, Math.PI); neon(ctx, th.cyan, 4 * u, 14 * u);
          glowDot(ctx, Math.cos(a) * bw * 0.62, Math.sin(a) * bw * 0.17, 7 * u, "#ffffff"); ctx.restore();
        }
      }
      // sparkles drifting up the pillar tops
      if (q > 0.9) sparkle(ctx, x + bw * (0.2 + 0.6 * fract(i * 0.37 + t * 0.2)), baseY - h - (30 + 60 * fract(t * 0.4 + i * 0.31)) * u, 9 * u * (1 - fract(t * 0.4 + i * 0.31)) + 2 * u, A("#ffffff", 0.9), t);
    });
  }

  function miniScreen(ctx, S, th, x, y, w, h, t, o = {}) {
    // a tiny editor: sunset preview over a timeline with a playhead that keeps travelling
    const u = S.u;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = th.screen; ctx.fillRect(x, y, w, h);
    const pw = w * 0.84, ph = h * 0.46, px = x + w * 0.08, py = y + h * 0.07;
    const sg = ctx.createLinearGradient(0, py, 0, py + ph);
    sg.addColorStop(0, th.sky[1]); sg.addColorStop(0.6, th.sky[2]); sg.addColorStop(1, th.sky[3]);
    ctx.fillStyle = sg; ctx.fillRect(px, py, pw, ph * 0.66);
    const sr = ph * 0.3;
    ctx.save(); ctx.beginPath(); ctx.rect(px, py, pw, ph * 0.66); ctx.clip();
    const sgr = ctx.createLinearGradient(0, py + ph * 0.1, 0, py + ph * 0.66); sgr.addColorStop(0, th.sunA); sgr.addColorStop(1, th.sunB);
    ctx.fillStyle = sgr; ctx.beginPath(); ctx.arc(px + pw * 0.5 + Math.sin(t * 0.6) * pw * 0.05, py + ph * 0.52, sr, 0, TAU); ctx.fill();
    ctx.fillStyle = th.screen; for (let k = 0; k < 4; k++) ctx.fillRect(px, py + ph * (0.38 + k * 0.07) + fract(t * 0.2) * ph * 0.07, pw, ph * 0.01 * (k + 1));
    ctx.restore();
    ctx.fillStyle = th.floor[0]; ctx.fillRect(px, py + ph * 0.66, pw, ph * 0.34);
    ctx.strokeStyle = A(th.gv, 0.9); ctx.lineWidth = 1.5 * u; ctx.beginPath();
    for (let k = -4; k <= 4; k++) { ctx.moveTo(px + pw / 2 + k * 3 * u, py + ph * 0.66); ctx.lineTo(px + pw / 2 + k * pw * 0.12, py + ph); }
    for (let k = 0; k < 4; k++) { const yy = py + ph * (0.66 + 0.34 * Math.pow((k + fract(t * 0.5)) / 4, 1.8)); ctx.moveTo(px, yy); ctx.lineTo(px + pw, yy); }
    ctx.stroke();
    ctx.strokeStyle = A(th.cyan, 0.9); ctx.lineWidth = 2.5 * u; ctx.strokeRect(px, py, pw, ph);
    // tracks
    const ty0 = y + h * 0.6, th2 = h * 0.085, tg = h * 0.045;
    const clips = [[0.0, 0.34, th.pink], [0.4, 0.2, th.cyan], [0.64, 0.3, th.yellow], [0.1, 0.26, th.violet], [0.42, 0.4, th.mint], [0.0, 0.2, th.cyan], [0.3, 0.3, th.pink], [0.66, 0.24, th.violet]];
    for (let r = 0; r < 3; r++) {
      const yy = ty0 + r * (th2 + tg);
      ctx.fillStyle = "rgba(255,255,255,0.07)"; ctx.fillRect(px, yy, pw, th2);
      const cl = r === 0 ? clips.slice(0, 3) : r === 1 ? clips.slice(3, 5) : clips.slice(5);
      for (const [cx, cw, color] of cl) {
        const a = o.build == null ? 1 : eo(seg(o.build, 0.2 + r * 0.15 + cx * 0.4, 0.55 + r * 0.15 + cx * 0.4));
        ctx.fillStyle = color; ctx.fillRect(px + pw * cx, yy, pw * cw * a, th2);
        ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fillRect(px + pw * cx, yy, pw * cw * a, th2 * 0.3);
      }
    }
    const phx = px + pw * (0.04 + 0.92 * fract(t * 0.16));
    ctx.fillStyle = "#ffffff"; ctx.shadowColor = th.hot; ctx.shadowBlur = 8 * u; ctx.fillRect(phx - 1.5 * u, ty0 - h * 0.03, 3 * u, 3 * (th2 + tg) + h * 0.04);
    ctx.beginPath(); ctx.moveTo(phx - 7 * u, ty0 - h * 0.04); ctx.lineTo(phx + 7 * u, ty0 - h * 0.04); ctx.lineTo(phx, ty0 - h * 0.005); ctx.closePath(); ctx.fillStyle = th.hot; ctx.fill();
    ctx.restore();
    return { prev: [px, py, pw, ph], tracks: [px, ty0, pw, 3 * th2 + 2 * tg], phx };
  }

  function arrowCursor(ctx, x, y, s, th) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 1.55); ctx.lineTo(0.38, 1.2); ctx.lineTo(0.64, 1.8); ctx.lineTo(0.9, 1.68); ctx.lineTo(0.64, 1.1); ctx.lineTo(1.1, 1.1); ctx.closePath();
    ctx.fillStyle = "#ffffff"; ctx.fill(); ctx.lineWidth = 0.12; ctx.strokeStyle = "#1a0a40"; ctx.lineJoin = "round"; ctx.stroke();
    ctx.restore();
  }

  function cd(ctx, th, cx, cy, r, t) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 1.4);
    const g = ctx.createConicGradient(0, 0, 0);
    [th.pink, th.cyan, th.yellow, th.violet, th.mint, th.pink].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.arc(0, 0, r * 0.2, 0, TAU, true); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, TAU); ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.stroke();
    ctx.restore();
  }

  function objectScene(ctx, S, th, b, d, info, lt) {
    const u = S.u, t = info.t, phone = d.kind === "phone", tall = S.tall;
    // device
    let dw, dh, dx0, dy0;
    if (phone) { dh = Math.min(b.h * (tall ? 0.52 : 0.96), 600 * u); dw = dh * 0.52; dx0 = tall ? b.x + (b.w - dw) / 2 : b.x + b.w * 0.22; dy0 = b.y + (tall ? 20 * u : (b.h - dh) / 2); }
    else { dw = Math.min(b.w * (tall ? 0.96 : 0.5), b.h * 1.0); dh = dw * 0.78; dx0 = tall ? b.x + (b.w - dw) / 2 : b.x + b.w * 0.02; dy0 = b.y + (tall ? 10 * u : (b.h - dh) / 2 - 24 * u); }
    const a = back(seg(lt, 0, 0.55));
    const bob = Math.sin(t * 1.3) * 6 * u;
    const cx = dx0 + dw / 2, cy = dy0 + dh / 2;
    // spinning disc tucked behind the base
    ctx.save(); ctx.globalAlpha *= clamp(a);
    cd(ctx, th, dx0 + dw * (phone ? -0.3 : 0.96), dy0 + dh * (phone ? 0.78 : 0.86), dh * 0.2, t);
    cd(ctx, th, dx0 + dw * (phone ? 1.3 : 0.04), dy0 + dh * (phone ? 0.2 : 0.96), dh * 0.12, -t * 1.1);
    ctx.restore();
    ctx.save(); ctx.translate(cx, cy + bob); ctx.scale(clamp(a, 0, 1.04), clamp(a, 0, 1.04)); ctx.translate(-cx, -cy);
    // body
    const pad = (phone ? 24 : 34) * u;
    ctx.fillStyle = A(th.hard, 0.75); rr(ctx, dx0 + 12 * u, dy0 + 12 * u, dw, dh, (phone ? 52 : 26) * u); ctx.fill();
    const bg = ctx.createLinearGradient(dx0, dy0, dx0 + dw, dy0 + dh);
    bg.addColorStop(0, th.winFace); bg.addColorStop(1, th.winFace2);
    rr(ctx, dx0, dy0, dw, dh, (phone ? 52 : 26) * u); ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 3 * u; ctx.strokeStyle = "rgba(255,255,255,0.95)"; ctx.stroke();
    const scr = { x: dx0 + pad, y: dy0 + pad, w: dw - pad * 2, h: dh - pad * 2 - (phone ? 0 : 34 * u) };
    rr(ctx, scr.x - 5 * u, scr.y - 5 * u, scr.w + 10 * u, scr.h + 10 * u, 14 * u); ctx.fillStyle = A(th.hard, 1); ctx.fill();
    ctx.save(); rr(ctx, scr.x, scr.y, scr.w, scr.h, 10 * u); ctx.clip();
    const geo = miniScreen(ctx, S, th, scr.x, scr.y, scr.w, scr.h, t, { build: lt });
    // wandering cursor that clicks now and then
    const cyc = fract(t * 0.2), pts = [[0.7, 0.3], [0.5, 0.68], [0.25, 0.86], [0.7, 0.3]];
    const seg2 = Math.min(2, Math.floor(cyc * 3)), f = eio(fract(cyc * 3));
    const px2 = lerp(pts[seg2][0], pts[seg2 + 1][0], f), py2 = lerp(pts[seg2][1], pts[seg2 + 1][1], f);
    arrowCursor(ctx, scr.x + scr.w * px2, scr.y + scr.h * py2, 20 * u, th);
    if (f > 0.9 || f < 0.06) { ctx.beginPath(); ctx.arc(scr.x + scr.w * px2, scr.y + scr.h * py2, 24 * u * (f < 0.06 ? 0.5 + f * 8 : 1.6 - f * 0.6), 0, TAU); ctx.strokeStyle = A("#ffffff", 0.8); ctx.lineWidth = 2.5 * u; ctx.stroke(); }
    // reflection on the glass
    const rg = ctx.createLinearGradient(scr.x, scr.y, scr.x + scr.w * 0.6, scr.y + scr.h * 0.6);
    rg.addColorStop(0, "rgba(255,255,255,0.18)"); rg.addColorStop(0.5, "rgba(255,255,255,0)");
    ctx.fillStyle = rg; ctx.fillRect(scr.x, scr.y, scr.w, scr.h);
    ctx.restore();
    if (!phone) {
      // chin with LEDs and a vent, then a neck and foot
      const ly = dy0 + dh - pad * 0.55 - 6 * u;
      for (let k = 0; k < 3; k++) { ctx.fillStyle = [th.mint, th.pink, th.cyan][k]; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 3 + k * 2) ** 2; ctx.beginPath(); ctx.arc(dx0 + dw - pad - 14 * u - k * 28 * u, ly, 7 * u, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1; ctx.fillStyle = A(th.hard, 0.35); for (let k = 0; k < 6; k++) ctx.fillRect(dx0 + pad + k * 14 * u, ly - 8 * u, 6 * u, 16 * u);
      ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(cx - dw * 0.1, dy0 + dh); ctx.lineTo(cx + dw * 0.1, dy0 + dh); ctx.lineTo(cx + dw * 0.14, dy0 + dh + 30 * u); ctx.lineTo(cx - dw * 0.14, dy0 + dh + 30 * u); ctx.closePath(); ctx.fill();
      rr(ctx, cx - dw * 0.3, dy0 + dh + 24 * u, dw * 0.6, 22 * u, 10 * u); ctx.fillStyle = bg; ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.stroke();
    }
    ctx.restore();
    // callouts: bevelled windows with leaders that carry a pulse
    const anchors = [[geo.prev[0] + geo.prev[2] * 0.72, geo.prev[1] + geo.prev[3] * 0.34], [geo.tracks[0] + geo.tracks[2] * 0.5, geo.tracks[1] + geo.tracks[3] * 0.5], [geo.tracks[0] + geo.tracks[2] * 0.12, geo.tracks[1] + geo.tracks[3] * 0.9]];
    const n = d.callouts.length;
    const wx = tall ? b.x : b.x + b.w * 0.57, ww = tall ? b.w : b.w * 0.43;
    const wh = 132 * u, gap = tall ? 32 * u : (b.h - n * wh) / (n + 0.4);
    const wy0 = tall ? dy0 + dh + 110 * u : b.y + gap * 0.6;
    d.callouts.forEach((label, i) => {
      if (!label) return;
      const q = back(seg(lt, 0.3 + i * 0.15, 0.8 + i * 0.15)), sq = eo(seg(lt, 0.3 + i * 0.15, 0.8 + i * 0.15));
      if (q <= 0) return;
      const wy = wy0 + i * (wh + gap), wwid = ww * (0.9 + 0.1 * i % 2);
      const ax = anchors[i][0], ay = anchors[i][1] + bob;
      const ex = tall ? wx + 40 * u : wx, ey = tall ? wy : wy + wh / 2;
      const mx = tall ? ax : (ax + ex) / 2;
      ctx.save();
      ctx.beginPath(); ctx.moveTo(ax, ay);
      if (tall) { ctx.lineTo(ax, ey - 10 * u - 0); ctx.lineTo(ex, ey - 10 * u); } else { ctx.lineTo(mx, ay); ctx.lineTo(mx, ey); ctx.lineTo(ex, ey); }
      ctx.setLineDash([22 * u, 10 * u]); ctx.lineDashOffset = -t * 60 * u; ctx.globalAlpha *= sq; neon(ctx, [th.pink, th.cyan, th.yellow][i % 3], 4 * u, 12 * u);
      ctx.setLineDash([]);
      const rp = 0.4 + 0.6 * fract(t * 0.5 + i * 0.3);
      ctx.beginPath(); ctx.arc(ax, ay, (10 + 22 * rp) * u, 0, TAU); ctx.strokeStyle = A("#ffffff", (1 - rp) * 0.8); ctx.lineWidth = 3 * u; ctx.stroke();
      glowDot(ctx, ax, ay, 8 * u, [th.pink, th.cyan, th.yellow][i % 3]);
      ctx.restore();
      ctx.save(); ctx.translate(wx + wwid / 2, wy + wh / 2); ctx.scale(clamp(q, 0, 1.05), clamp(q, 0, 1.05)); ctx.translate(-(wx + wwid / 2), -(wy + wh / 2));
      const inner = win(ctx, S, th, wx, wy, wwid, wh, `note_0${i + 1}`, { tb: 40 * u / u });
      const fs = Math.min(48 * u, 0.0 + (wwid - 60 * u) / Math.max(7, label.length) * 1.7);
      T(ctx, S, th, label, inner.x + 22 * u, inner.y + inner.h / 2, Math.max(44 * u, fs), { font: "b", base: "middle", color: th.winInk, weight: 800 });
      ctx.restore();
    });
  }

  function character(ctx, S, th, cx, base, s, t, i, hot, q) {
    const u = S.u;
    const jacket = [th.pink, th.cyan, th.violet, th.mint, th.yellow][i % 5];
    const skin = ["#ffd9c2", "#e0a98a", "#a86b4a", "#f3c9ff", "#7a4a34"][(i * 2 + 1) % 5];
    const bob = Math.sin(t * 2.2 + i * 1.7) * s * 0.012, sway = Math.sin(t * 1.4 + i) * 0.03;
    ctx.save(); ctx.translate(cx, base); ctx.scale(q, q);
    ctx.globalAlpha *= clamp(q * 2);
    // pedestal
    ctx.save(); ctx.scale(1, 0.2);
    const pg = ctx.createRadialGradient(0, 0, s * 0.05, 0, 0, s * 0.5);
    pg.addColorStop(0, A(th.hard, 0.8)); pg.addColorStop(1, A(th.violet, 0.9));
    ctx.beginPath(); ctx.arc(0, 0, s * 0.46, 0, TAU); ctx.fillStyle = pg; ctx.fill();
    const rim = ctx.createConicGradient(t * 1.5, 0, 0);
    rim.addColorStop(0, th.pink); rim.addColorStop(0.5, th.cyan); rim.addColorStop(1, th.pink);
    ctx.lineWidth = s * 0.05; ctx.strokeStyle = rim; ctx.stroke(); ctx.restore();
    ctx.translate(0, bob); ctx.rotate(sway);
    const legH = s * 0.2, torso = s * 0.4, headR = s * 0.115;
    // legs and shoes
    for (const sg of [-1, 1]) {
      rr(ctx, sg * s * 0.075 - s * 0.045, -legH, s * 0.09, legH, s * 0.04); ctx.fillStyle = "#24104f"; ctx.fill();
      ctx.beginPath(); ctx.ellipse(sg * s * 0.075 + sg * s * 0.02, -s * 0.012, s * 0.07, s * 0.03, 0, 0, TAU); ctx.fillStyle = "#ffffff"; ctx.fill();
      ctx.fillStyle = hot ? th.yellow : th.pink; ctx.fillRect(sg * s * 0.075 + sg * s * 0.02 - s * 0.05, -s * 0.014, s * 0.1, s * 0.012);
    }
    // arms behind the jacket
    const sy = -legH - torso * 0.9;
    const armSwing = Math.sin(t * 2.2 + i * 1.7 + 1) * s * 0.025;
    const wave = hot ? Math.sin(t * 6) * s * 0.05 : 0;
    ctx.lineCap = "round"; ctx.lineWidth = s * 0.085; ctx.strokeStyle = mixh(jacket, "#000000", 0.2);
    ctx.beginPath(); ctx.moveTo(-s * 0.23, sy); ctx.lineTo(-s * 0.3, sy + torso * 0.55 + armSwing); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 0.23, sy);
    const hand = hot ? [s * 0.4 + wave * 0.4, sy - torso * 0.5 + wave] : [s * 0.3, sy + torso * 0.55 - armSwing];
    ctx.lineTo(hand[0], hand[1]); ctx.stroke();
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(-s * 0.3, sy + torso * 0.62 + armSwing, s * 0.045, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(hand[0], hand[1] + (hot ? -s * 0.02 : s * 0.02), s * 0.045, 0, TAU); ctx.fill();
    // torso: a jacket with a bright stripe
    const tg = ctx.createLinearGradient(-s * 0.25, 0, s * 0.25, 0);
    tg.addColorStop(0, mixh(jacket, "#ffffff", 0.25)); tg.addColorStop(1, mixh(jacket, "#000000", 0.25));
    ctx.beginPath(); ctx.moveTo(-s * 0.19, -legH); ctx.lineTo(-s * 0.25, sy + s * 0.05); ctx.quadraticCurveTo(-s * 0.24, sy - s * 0.03, 0, sy - s * 0.03); ctx.quadraticCurveTo(s * 0.24, sy - s * 0.03, s * 0.25, sy + s * 0.05); ctx.lineTo(s * 0.19, -legH); ctx.closePath();
    ctx.fillStyle = tg; ctx.fill(); ctx.lineWidth = Math.max(2, 3 * u); ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.fillRect(-s * 0.012, sy, s * 0.024, torso * 0.9);
    ctx.fillStyle = hot ? th.yellow : "#ffffff"; ctx.fillRect(-s * 0.2, -legH - s * 0.03, s * 0.4, s * 0.03);
    // head
    const hy = sy - headR * 1.2;
    ctx.fillStyle = skin; ctx.fillRect(-s * 0.03, sy - s * 0.05, s * 0.06, s * 0.07);
    const style = i % 5;
    ctx.fillStyle = ["#2a1050", "#ff7ad9", "#1a0a30", "#5b3b1e", "#e9e0ff"][style];
    if (style === 3) { ctx.beginPath(); ctx.arc(0, hy - headR * 0.1, headR * 1.45, 0, TAU); ctx.fill(); }
    if (style === 1) { ctx.beginPath(); ctx.arc(0, hy - headR * 1.25, headR * 0.5, 0, TAU); ctx.fill(); }
    if (style === 2) { for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(k * headR * 0.45 - headR * 0.3, hy - headR * 0.6); ctx.lineTo(k * headR * 0.45, hy - headR * (1.5 + (k % 2 ? 0.2 : 0))); ctx.lineTo(k * headR * 0.45 + headR * 0.3, hy - headR * 0.6); ctx.fill(); } }
    const hg = ctx.createRadialGradient(-headR * 0.3, hy - headR * 0.3, headR * 0.1, 0, hy, headR * 1.1);
    hg.addColorStop(0, mixh(skin, "#ffffff", 0.35)); hg.addColorStop(1, skin);
    ctx.beginPath(); ctx.arc(0, hy, headR, 0, TAU); ctx.fillStyle = hg; ctx.fill();
    ctx.fillStyle = ["#2a1050", "#ff7ad9", "#1a0a30", "#5b3b1e", "#e9e0ff"][style];
    if (style === 0) { ctx.beginPath(); ctx.arc(0, hy - headR * 0.1, headR * 1.08, Math.PI * 1.02, Math.PI * 1.98); ctx.lineTo(headR * 1.0, hy + headR * 0.2); ctx.lineTo(headR * 0.7, hy - headR * 0.4); ctx.lineTo(-headR * 0.7, hy - headR * 0.4); ctx.lineTo(-headR * 1.0, hy + headR * 0.2); ctx.fill(); }
    if (style === 4) { ctx.beginPath(); ctx.arc(0, hy - headR * 0.15, headR * 1.05, Math.PI, TAU); ctx.fill(); ctx.fillRect(-headR * 0.2, hy - headR * 0.35, headR * 1.7, headR * 0.16); }
    // visor with a sliding glint
    const vx = -headR * 0.92, vw = headR * 1.84, vy = hy - headR * 0.25, vh = headR * 0.5;
    const vg = ctx.createLinearGradient(vx, vy, vx + vw, vy + vh);
    vg.addColorStop(0, th.cyan); vg.addColorStop(0.5, th.violet); vg.addColorStop(1, th.pink);
    rr(ctx, vx, vy, vw, vh, vh * 0.45); ctx.fillStyle = vg; ctx.fill();
    ctx.save(); rr(ctx, vx, vy, vw, vh, vh * 0.45); ctx.clip();
    const gx = vx + vw * (fract(t * 0.4 + i * 0.23) * 1.6 - 0.3);
    ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.beginPath(); ctx.moveTo(gx, vy); ctx.lineTo(gx + headR * 0.28, vy); ctx.lineTo(gx + headR * 0.08, vy + vh); ctx.lineTo(gx - headR * 0.2, vy + vh); ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.arc(0, hy + headR * 0.38, headR * 0.28, 0.15 * Math.PI, 0.85 * Math.PI); ctx.lineWidth = Math.max(2, headR * 0.07); ctx.strokeStyle = "#5a1a4a"; ctx.stroke();
    if (i % 2 === 0) {
      ctx.beginPath(); ctx.arc(0, hy - headR * 0.05, headR * 1.12, Math.PI * 1.03, Math.PI * 1.97); ctx.lineWidth = headR * 0.2; ctx.strokeStyle = "#ffffff"; ctx.stroke();
      for (const sg of [-1, 1]) { rr(ctx, sg * headR * 1.1 - headR * 0.2, hy - headR * 0.3, headR * 0.4, headR * 0.7, headR * 0.15); ctx.fillStyle = th.pink; ctx.fill(); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.max(1.5, 2 * u); ctx.stroke(); }
    }
    if (hot) {
      ctx.save(); ctx.translate(0, hy - headR * 1.9); ctx.scale(1, 0.28); ctx.rotate(t * 2);
      ctx.beginPath(); ctx.arc(0, 0, headR * 1.15, 0, TAU); ctx.setLineDash([headR * 0.5, headR * 0.3]); ctx.strokeStyle = th.yellow; ctx.lineWidth = headR * 0.2; ctx.shadowColor = th.yellow; ctx.shadowBlur = 16 * u; ctx.stroke(); ctx.restore();
    }
    ctx.restore();
  }

  function peopleScene(ctx, S, th, b, d, info, lt) {
    const u = S.u, t = info.t, tall = S.tall;
    const n = Math.max(2, Math.min(6, Math.round(d.count)));
    const stripH = 90 * u;
    const s = Math.min(b.h * (tall ? 0.46 : 0.66), (b.w / n) * 1.28);
    const base = b.y + b.h - stripH * 0.4;
    const sa = back(seg(lt, 0, 0.45));
    ctx.save(); ctx.globalAlpha *= clamp(sa);
    checker(ctx, b.x - 30 * u, b.y + b.h - stripH, b.w + 60 * u, stripH, 30, 3, -t * 0.5, A("#ffffff", 0.85), A(th.cyan, 0.85), 0.06);
    ctx.beginPath(); ctx.moveTo(b.x + 20 * u, b.y + b.h - stripH); ctx.lineTo(b.x + b.w - 20 * u, b.y + b.h - stripH); neon(ctx, th.cyan, 3 * u, 14 * u);
    ctx.restore();
    const hotI = Math.min(n - 1, d.highlight ?? 1);
    // spotlight beam on the highlighted person
    {
      const cx = b.x + (b.w / n) * (hotI + 0.5) + Math.sin(t * 0.8) * 20 * u, q = eo(seg(lt, 0.4, 1.0));
      const bg = ctx.createLinearGradient(0, b.y - 80 * u, 0, base);
      bg.addColorStop(0, A(th.yellow, 0)); bg.addColorStop(1, A(th.yellow, 0.34 * q));
      ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(cx - 36 * u, b.y - 80 * u); ctx.lineTo(cx + 36 * u, b.y - 80 * u); ctx.lineTo(cx + s * 0.55, base); ctx.lineTo(cx - s * 0.55, base); ctx.closePath(); ctx.fill();
    }
    for (let i = 0; i < n; i++) {
      const q = back(seg(lt, 0.05 + i * 0.07, 0.6 + i * 0.07));
      if (q <= 0) continue;
      const cx = b.x + (b.w / n) * (i + 0.5), hot = i === hotI;
      const sz = s * (hot ? 1.08 : 1);
      character(ctx, S, th, cx, base, sz, t, i, hot, clamp(q, 0, 1.05));
      const label = d.badges[i % d.badges.length];
      if (q > 0.6 && label) {
        const fs = 44 * u, tw = measure(ctx, S, label, fs, "b", 800), bw = tw + 56 * u, bh = 74 * u;
        const by = base - sz * 1.2 - bh - 16 * u + Math.sin(t * 2 + i) * 6 * u;
        const bx = clamp(cx - bw / 2, b.x - 40 * u, b.x + b.w + 40 * u - bw);
        ctx.save(); ctx.globalAlpha *= clamp((q - 0.6) * 4);
        ctx.fillStyle = A(th.hard, 0.8); ctx.fillRect(bx + 8 * u, by + 8 * u, bw, bh);
        const g = ctx.createLinearGradient(bx, by, bx, by + bh); g.addColorStop(0, hot ? th.yellow : "#ffffff"); g.addColorStop(1, hot ? th.pink : th.winFace2);
        ctx.fillStyle = g; ctx.fillRect(bx, by, bw, bh); ctx.strokeStyle = th.winInk; ctx.lineWidth = 3 * u; ctx.strokeRect(bx, by, bw, bh);
        ctx.beginPath(); ctx.moveTo(cx - 14 * u, by + bh); ctx.lineTo(cx + 14 * u, by + bh); ctx.lineTo(cx, by + bh + 18 * u); ctx.closePath(); ctx.fillStyle = hot ? th.pink : th.winFace2; ctx.fill(); ctx.stroke();
        T(ctx, S, th, label, bx + bw / 2, by + bh / 2 + 2 * u, fs, { font: "b", align: "center", base: "middle", color: th.winInk, weight: 800 });
        ctx.restore();
      }
      if (hot && q > 0.9) for (let k = 0; k < 3; k++) {
        const ph = fract(t * 0.5 + k / 3), nx = cx + sz * 0.5 + Math.sin(ph * 6 + k) * 18 * u, ny = base - sz * (0.7 + ph * 0.5);
        T(ctx, S, th, k % 2 ? "♪" : "♫", nx, ny, 48 * u, { font: "b", color: [th.pink, th.cyan, th.yellow][k], alpha: Math.sin(Math.PI * ph), glow: 10 * u });
      }
    }
  }

  function icon(ctx, S, th, kind, cx, cy, s, t, color) {
    const u = S.u;
    ctx.save(); ctx.translate(cx, cy); ctx.lineWidth = Math.max(3, s * 0.05); ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (kind === 0) {
      // a folder of frames with a scanning line
      ctx.beginPath(); ctx.moveTo(-s * 0.5, -s * 0.28); ctx.lineTo(-s * 0.18, -s * 0.28); ctx.lineTo(-s * 0.08, -s * 0.38); ctx.lineTo(s * 0.5, -s * 0.38); ctx.lineTo(s * 0.5, s * 0.4); ctx.lineTo(-s * 0.5, s * 0.4); ctx.closePath();
      ctx.fillStyle = A(color, 0.28); ctx.fill(); ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12 * u; ctx.stroke(); ctx.shadowBlur = 0;
      for (let k = 0; k < 3; k++) { ctx.strokeStyle = "#ffffff"; ctx.beginPath(); ctx.moveTo(-s * 0.32, -s * 0.12 + k * s * 0.16); ctx.lineTo(s * 0.3 - (k === 2 ? s * 0.25 : 0), -s * 0.12 + k * s * 0.16); ctx.stroke(); }
      const sy = -s * 0.3 + fract(t * 0.6) * s * 0.7; ctx.fillStyle = A("#ffffff", 0.5); ctx.fillRect(-s * 0.5, sy, s, 4 * u);
    } else if (kind === 1) {
      ctx.rotate(Math.sin(t * 1.6) * 0.25);
      ctx.beginPath(); ctx.moveTo(-s * 0.4, s * 0.4); ctx.lineTo(s * 0.18, -s * 0.18); ctx.strokeStyle = color; ctx.lineWidth = s * 0.09; ctx.shadowColor = color; ctx.shadowBlur = 14 * u; ctx.stroke();
      ctx.shadowBlur = 0; ctx.rotate(-Math.sin(t * 1.6) * 0.25);
      const pulse = 0.75 + 0.25 * Math.sin(t * 4);
      sparkle(ctx, s * 0.26, -s * 0.28, s * 0.3 * pulse, th.yellow, t * 0.8); sparkle(ctx, -s * 0.1, -s * 0.34, s * 0.14 * (1.1 - pulse * 0.4), "#ffffff", 0); sparkle(ctx, s * 0.44, s * 0.04, s * 0.12 * pulse, th.cyan, 0);
    } else {
      // a monitor with a check that draws itself over and over
      ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12 * u; rr(ctx, -s * 0.46, -s * 0.38, s * 0.92, s * 0.64, s * 0.06); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-s * 0.18, s * 0.4); ctx.lineTo(s * 0.18, s * 0.4); ctx.moveTo(0, s * 0.26); ctx.lineTo(0, s * 0.4); ctx.stroke(); ctx.shadowBlur = 0;
      const q = eio(seg(fract(t * 0.5), 0.1, 0.55));
      ctx.beginPath(); const p0 = [-s * 0.22, -s * 0.06], p1 = [-s * 0.05, s * 0.11], p2 = [s * 0.26, -s * 0.22];
      ctx.moveTo(p0[0], p0[1]);
      if (q < 0.4) ctx.lineTo(lerp(p0[0], p1[0], q / 0.4), lerp(p0[1], p1[1], q / 0.4)); else { ctx.lineTo(p1[0], p1[1]); const f = (q - 0.4) / 0.6; ctx.lineTo(lerp(p1[0], p2[0], f), lerp(p1[1], p2[1], f)); }
      ctx.strokeStyle = th.mint; ctx.lineWidth = s * 0.09; ctx.shadowColor = th.mint; ctx.shadowBlur = 14 * u; ctx.stroke();
    }
    ctx.restore();
  }

  function processScene(ctx, S, th, b, d, info, lt) {
    const u = S.u, t = info.t, n = d.steps.length, tall = S.tall;
    const gap = tall ? 70 * u : 110 * u;
    const ww = tall ? b.w * 0.92 : (b.w - gap * (n - 1)) / n;
    const wh = tall ? (b.h - gap * (n - 1)) / n : Math.min(b.h * 0.88, ww * 0.96);
    const active = Math.floor(t * 0.5) % n, ap = fract(t * 0.5);
    const pos = (i) => ({ x: tall ? b.x + (b.w - ww) / 2 : b.x + i * (ww + gap), y: tall ? b.y + i * (wh + gap) : b.y + (b.h - wh) / 2 });
    // cables first, so windows sit on top
    for (let i = 0; i < n - 1; i++) {
      const a = pos(i), c = pos(i + 1), q = eo(seg(lt, 0.25 + i * 0.2, 0.75 + i * 0.2));
      if (q <= 0) continue;
      const x1 = tall ? a.x + ww / 2 : a.x + ww + 6 * u, y1 = tall ? a.y + wh + 6 * u : a.y + wh / 2;
      const x2 = tall ? c.x + ww / 2 : c.x - 6 * u, y2 = tall ? c.y - 6 * u : c.y + wh / 2;
      ctx.save(); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(lerp(x1, x2, q), lerp(y1, y2, q));
      ctx.setLineDash([18 * u, 12 * u]); ctx.lineDashOffset = -t * 70 * u; neon(ctx, th.pink, 5 * u, 16 * u); ctx.setLineDash([]);
      if (q > 0.95) {
        const ang = Math.atan2(y2 - y1, x2 - x1);
        ctx.translate(x2, y2); ctx.rotate(ang); ctx.beginPath(); ctx.moveTo(-26 * u, -16 * u); ctx.lineTo(0, 0); ctx.lineTo(-26 * u, 16 * u); neon(ctx, th.cyan, 5 * u, 14 * u);
      }
      ctx.restore();
      // packets of light travelling the cable
      for (let k = 0; k < 3; k++) {
        const f = fract(t * 0.55 + k / 3 + i * 0.2);
        if (f * 1.0 > q) continue;
        glowDot(ctx, lerp(x1, x2, f), lerp(y1, y2, f), 9 * u, [th.yellow, th.cyan, th.mint][k]);
      }
    }
    for (let i = 0; i < n; i++) {
      const q = back(seg(lt, 0.04 + i * 0.14, 0.55 + i * 0.14));
      if (q <= 0) continue;
      const { x, y } = pos(i), isA = i === active && lt > 0.9;
      ctx.save(); const cx = x + ww / 2, cy = y + wh / 2; ctx.translate(cx, cy); ctx.scale(clamp(q, 0, 1.05), clamp(q, 0, 1.05)); ctx.translate(-cx, -cy);
      if (isA) { ctx.shadowColor = th.yellow; ctx.shadowBlur = 36 * u; ctx.fillStyle = A(th.yellow, 0.01); ctx.fillRect(x, y, ww, wh); ctx.shadowBlur = 0; }
      const inner = win(ctx, S, th, x, y, ww, wh, `step_0${i + 1}`);
      ctx.save(); ctx.beginPath(); ctx.rect(inner.x, inner.y, inner.w, inner.h); ctx.clip();
      ctx.fillStyle = th.screen; ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
      // faint grid inside the window, sliding
      ctx.strokeStyle = A(th.cyan, 0.12); ctx.lineWidth = 2 * u; ctx.beginPath();
      for (let k = 0; k < 14; k++) { const gx = inner.x + ((k * 60 * u + t * 20 * u) % (inner.w + 60 * u)); ctx.moveTo(gx, inner.y); ctx.lineTo(gx, inner.y + inner.h); }
      for (let k = 0; k < 10; k++) { const gy = inner.y + k * 60 * u; ctx.moveTo(inner.x, gy); ctx.lineTo(inner.x + inner.w, gy); }
      ctx.stroke();
      const isz = tall ? inner.h * 0.5 : inner.h * 0.44;
      const ix = tall ? inner.x + inner.w * 0.2 : inner.x + inner.w / 2, iy = tall ? inner.y + inner.h * 0.44 : inner.y + inner.h * 0.3;
      const col = i === n - 1 ? th.mint : [th.cyan, th.pink][i % 2];
      icon(ctx, S, th, Math.min(i, 2) === 2 || i === n - 1 ? 2 : i, ix, iy, isz, t + i, col);
      // label, wrapped to two lines before it would shrink under 44px
      const lw = tall ? inner.w * 0.58 : inner.w - 36 * u, lx = tall ? inner.x + inner.w * 0.42 : inner.x + inner.w / 2;
      const fs = 46 * u, ls = lines2(ctx, S, d.steps[i], fs, lw, "b", 800);
      ls.forEach((ln, k) => T(ctx, S, th, ln, lx, tall ? inner.y + inner.h * 0.38 + (k - (ls.length - 1) / 2) * fs * 1.15 : inner.y + inner.h * 0.62 + k * fs * 1.15, fs, { font: "b", align: tall ? "left" : "center", base: "middle", color: "#ffffff", weight: 800 }));
      // chunky progress bar fills on the active step and loops
      const by = inner.y + inner.h - 44 * u, bx = inner.x + 24 * u, bw = inner.w - 48 * u, ns = 16;
      const fillN = isA ? ap : (i < active ? 1 : (lt > 1.2 ? 0.0 : 0));
      for (let k = 0; k < ns; k++) { const lit = k / ns < fillN; ctx.fillStyle = lit ? A(col, 0.95) : "rgba(255,255,255,0.1)"; ctx.fillRect(bx + (bw / ns) * k, by, bw / ns - 5 * u, 20 * u); }
      ctx.restore();
      ctx.restore();
      if (isA) {
        ctx.save(); ctx.strokeStyle = th.yellow; ctx.lineWidth = 4 * u; ctx.setLineDash([22 * u, 14 * u]); ctx.lineDashOffset = -t * 80 * u; ctx.shadowColor = th.yellow; ctx.shadowBlur = 14 * u;
        ctx.strokeRect(x - 12 * u, y - 12 * u, ww + 24 * u, wh + 24 * u); ctx.restore();
      }
    }
  }

  function compareScene(ctx, S, th, b, d, info, lt) {
    const u = S.u, t = info.t, tall = S.tall;
    const gap = tall ? 150 * u : 210 * u;
    const ww = tall ? b.w : (b.w - gap) / 2, wh = tall ? (b.h - gap) / 2 : b.h * 0.92;
    const mx = Math.max(d.leftValue, d.rightValue, 1);
    const sides = [[d.left, d.leftValue, false], [d.right, d.rightValue, true]];
    sides.forEach(([label, value, hot], i) => {
      const q = back(seg(lt, 0.04 + i * 0.16, 0.6 + i * 0.16)), vq = eo(seg(lt, 0.3 + i * 0.16, 1.3 + i * 0.16));
      if (q <= 0) return;
      const x = tall ? b.x : b.x + i * (ww + gap), y = tall ? b.y + i * (wh + gap) : b.y + (b.h - wh) / 2;
      ctx.save(); const cx = x + ww / 2, cy = y + wh / 2; ctx.translate(cx, cy); ctx.scale(clamp(q, 0, 1.05), clamp(q, 0, 1.05)); ctx.translate(-cx, -cy);
      const inner = win(ctx, S, th, x, y, ww, wh, hot ? "after.exe" : "before.exe");
      ctx.save(); ctx.beginPath(); ctx.rect(inner.x, inner.y, inner.w, inner.h); ctx.clip();
      ctx.fillStyle = th.screen; ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
      // slow sweeping light across the screen
      const sw2 = fract(t * 0.22 + i * 0.4);
      const lg = ctx.createLinearGradient(inner.x + inner.w * (sw2 * 1.6 - 0.4), 0, inner.x + inner.w * (sw2 * 1.6 - 0.1), 0);
      lg.addColorStop(0, "rgba(255,255,255,0)"); lg.addColorStop(0.5, A(hot ? th.pink : th.cyan, 0.2)); lg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = lg; ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
      const fsL = 46 * u;
      T(ctx, S, th, label, inner.x + 28 * u, inner.y + 52 * u, fsL, { font: "b", base: "middle", color: hot ? th.yellow : th.cyan, weight: 800 });
      const big = Math.min(tall ? 150 * u : 190 * u, inner.h * 0.4);
      const num = window.DreamcutMotion.formatNumber(value * vq, 0, d.prefix, d.suffix);
      T(ctx, S, th, num, inner.x + 28 * u, inner.y + inner.h * 0.58, Math.max(96 * u, big), { font: "d", base: "middle", color: hot ? th.yellow : "#ffffff", chroma: 1, glow: hot ? 26 * u : 0, glowColor: th.hot });
      // an oscilloscope trace: ragged for many re-prompts, calm for a few dial turns
      {
        const wx0 = tall ? inner.x + inner.w * 0.5 : inner.x + inner.w * 0.44, wx1 = inner.x + inner.w - 30 * u, wy = inner.y + inner.h * 0.5, amp = inner.h * 0.14 * (value / mx * 0.8 + 0.2);
        ctx.beginPath();
        for (let k = 0; k <= 90; k++) {
          const f = k / 90, x2 = lerp(wx0, wx1, f), env = Math.sin(Math.PI * f) ** 0.6;
          const y2 = hot ? Math.sin(f * 9 - t * 3) * amp * 0.55 * env : (Math.sin(f * 23 - t * 7) * 0.6 + Math.sin(f * 41 + t * 11) * 0.4 + Math.sin(f * 7 - t * 2) * 0.5) * amp * env;
          if (k) ctx.lineTo(x2, wy + y2); else ctx.moveTo(x2, wy + y2);
        }
        neon(ctx, hot ? th.mint : th.hot, 4 * u, 14 * u);
        ctx.strokeStyle = A(th.cyan, 0.25); ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.moveTo(wx0, wy); ctx.lineTo(wx1, wy); ctx.stroke();
      }
      // segmented level meter
      const ns = 22, by = inner.y + inner.h - 74 * u, bx = inner.x + 28 * u, bw = inner.w - 56 * u, litN = (value / mx) * ns * vq;
      for (let k = 0; k < ns; k++) {
        const lit = k + 1 <= litN + 0.001, flick = !lit && k < litN + 2 && Math.sin(t * 14 + k * 3 + i) > 0.7;
        const c = k > ns * 0.75 ? th.hot : k > ns * 0.45 ? th.yellow : (hot ? th.mint : th.cyan);
        ctx.fillStyle = lit ? c : flick ? A(c, 0.35) : "rgba(255,255,255,0.1)";
        if (lit) { ctx.shadowColor = c; ctx.shadowBlur = 10 * u; }
        ctx.fillRect(bx + (bw / ns) * k, by, bw / ns - 5 * u, 34 * u); ctx.shadowBlur = 0;
      }
      const pk = (value / mx) * ns * vq, bob = Math.abs(Math.sin(t * 3 + i * 2)) * 0.8;
      ctx.fillStyle = "#ffffff"; ctx.fillRect(bx + (bw / ns) * Math.min(ns - 1, pk + bob), by - 10 * u, bw / ns - 5 * u, 6 * u);
      ctx.restore(); ctx.restore();
    });
    // the bridge: a spinning badge with the change between the two
    const lv = d.leftValue, rv = d.rightValue;
    if (lv) {
      const pct = Math.round(((rv - lv) / lv) * 100), q = back(seg(lt, 0.75, 1.3));
      if (q > 0) {
        const cx = tall ? b.x + b.w / 2 : b.x + ww + gap / 2, cy = tall ? b.y + wh + gap / 2 : b.y + b.h / 2;
        const r = (tall ? 62 : 70) * u;
        ctx.save(); ctx.translate(cx, cy); ctx.scale(clamp(q, 0, 1.05), clamp(q, 0, 1.05));
        ctx.rotate(t * 1.2); ctx.beginPath(); ctx.arc(0, 0, r * 1.45, 0, TAU); ctx.setLineDash([r * 0.3, r * 0.22]); neon(ctx, th.cyan, 4 * u, 14 * u); ctx.setLineDash([]); ctx.rotate(-t * 1.2);
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); const g = ctx.createLinearGradient(-r, -r, r, r); g.addColorStop(0, th.yellow); g.addColorStop(1, th.hot); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 4 * u; ctx.strokeStyle = "#ffffff"; ctx.stroke();
        const pulse = 1 + 0.06 * Math.sin(t * 4);
        ctx.scale(pulse, pulse);
        ctx.beginPath(); const dn = pct < 0 ? 1 : -1; ctx.moveTo(-r * 0.4, -dn * r * 0.1); ctx.lineTo(0, dn * r * 0.38); ctx.lineTo(r * 0.4, -dn * r * 0.1); ctx.moveTo(0, dn * r * 0.38); ctx.lineTo(0, -dn * r * 0.42); ctx.lineWidth = r * 0.14; ctx.strokeStyle = th.winInk; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();
        ctx.restore();
        const txt = `${pct > 0 ? "+" : pct < 0 ? "-" : ""}${Math.abs(pct)}%`, fs = 62 * u;
        const tw = measure(ctx, S, txt, fs, "d") + 44 * u, py = tall ? cy - 43 * u : cy + r * 1.75;
        ctx.save(); ctx.globalAlpha *= clamp(q);
        const pcx = tall ? cx + r * 1.7 + tw / 2 : cx;
        ctx.fillStyle = A(th.hard, 0.9); rr(ctx, pcx - tw / 2, py, tw, 86 * u, 12 * u); ctx.fill(); ctx.strokeStyle = th.yellow; ctx.lineWidth = 3 * u; ctx.stroke();
        T(ctx, S, th, txt, pcx, py + 46 * u, fs, { font: "d", align: "center", base: "middle", color: th.yellow, chroma: 0.8 });
        ctx.restore();
      }
    }
  }

  // ---- the stage ------------------------------------------------------------------------------------
  function stage(ctx, S, info) {
    const th = theme(S), cam = camera(info);
    world(ctx, S, th, info, cam);
    scrims(ctx, S, th, info);
    const P = cam.P;
    // The title card and the closing card are windows drawn here; they power off with their headline.
    if (info.scene === "title" || info.scene === "closing") {
      const exitQ = info.scene === "closing" || info.index >= P.shown.length - 1 ? 0 : seg(info.local, info.hold - info.change, info.hold);
      statementWindow(ctx, S, th, info, info.scene, exitQ);
    }
    marquee(ctx, S, th, info.t, info.scene);
    if (!info.scene || info.scene === "title" || info.scene === "closing") post(ctx, S, th, info, cam);
  }

  const light = {
    bg: "#f1e6ff", panel: "rgba(255,255,255,0.7)", ink: "#2b0f5c", muted: "rgba(43,15,92,0.78)", accent: "#ff2f9e", onAccent: "#ffffff",
    rule: "rgba(43,15,92,0.4)", track: "rgba(43,15,92,0.12)",
    sky: ["#7fe0ff", "#b9c4ff", "#ffbfe3", "#ffe7b5"], skyB: ["#6aa8ff", "#a98cff", "#ff9fcf", "#ffd2a1"], sunA: "#fff7a8", sunM: "#ffc16e", sunB: "#ff7fb8",
    gridV: "#2a8bff", gridH: "#ff3fa4", ridge: "#9b86ff", ridgeLine: "#ffffff", floorCols: ["#cbb2ff", "#7d68e0"], horizonGlow: "#ff8fd0",
    cols: ["#ff4fa8", "#18a9ff", "#00d68f", "#ffc926", "#8a5cff"],
    winFace: "#fff3ff", winFace2: "#e3d2ff", winInk: "#2b1060", winT: ["#ff4fa8", "#8a5cff"], screen: "#1d0c4e", hard: "#3b1c8a",
    marble: ["#f3ecff", "#ffffff", "#bda9f2", "#d8c8ff"],
    textShadow: () => "0.05em 0 0 rgba(24,169,255,0.8), -0.05em 0 0 rgba(255,79,168,0.8), 0 0 22px rgba(255,255,255,0.7)",
  };
  const dark = {
    bg: "#050014", ink: "#f2fbff", muted: "rgba(242,251,255,0.8)", accent: "#37ffe4", onAccent: "#050014", rule: "rgba(55,255,228,0.55)",
    sky: ["#02000f", "#0e0240", "#2b0766", "#6a1a9a"], skyB: ["#000008", "#06093a", "#10256e", "#1d5aa0"], sunA: "#aaf4ff", sunM: "#7a8cff", sunB: "#d046ff",
    gridV: "#00ffd5", gridH: "#8a5cff", ridge: "#0b0636", ridgeLine: "#00ffd5", floorCols: ["#12063a", "#04010f"], horizonGlow: "#7a3cff",
    cols: ["#ff4fd8", "#2bd9ff", "#37ffb0", "#fff27a", "#9c6bff"],
    winFace: "#cfd9ff", winFace2: "#a7b4f2", winInk: "#0d1040", winT: ["#00c8ff", "#8a5cff"], screen: "#07031c", hard: "#020010", marble: ["#cfd7ff", "#f4f7ff", "#6a76c8", "#98a4e8"],
  };
  const mono = {
    bg: "#101014", ink: "#f4f4fa", muted: "rgba(244,244,250,0.78)", accent: "#ffffff", onAccent: "#101014", rule: "rgba(255,255,255,0.5)",
    sky: ["#0c0c10", "#25252e", "#4a4a58", "#8a8a9a"], skyB: ["#050508", "#16161c", "#34343e", "#62626f"], sunA: "#ffffff", sunM: "#d0d0dc", sunB: "#8a8a9a",
    gridV: "#e8e8f4", gridH: "#9a9aaa", ridge: "#1a1a22", ridgeLine: "#e8e8f4", floorCols: ["#2a2a34", "#0c0c10"], horizonGlow: "#c8c8d8",
    cols: ["#f2f2fa", "#c8c8d8", "#a0a0b4", "#e8e8f0", "#7c7c90"],
    winFace: "#e6e6f0", winFace2: "#b8b8c8", winInk: "#16161c", winT: ["#6a6a7c", "#a0a0b4"], screen: "#0a0a0e", hard: "#050507", marble: ["#e6e6f0", "#ffffff", "#8a8a9a", "#b8b8c8"],
  };

  return {
    bg: "#14062f", panel: "rgba(46,16,104,0.8)", ink: "#fff1fe", muted: "rgba(255,241,254,0.8)", accent: "#ff5fc8", onAccent: "#14062f",
    rule: "rgba(1,205,254,0.6)", track: "rgba(255,255,255,0.14)",
    display: "'Arial Black', 'Futura', 'Helvetica Neue', Arial, sans-serif", displayWeight: 900, displayCase: "uppercase", displayTracking: "0.03em",
    body: "'Courier New', Menlo, Courier, monospace", bodyWeight: 700, figures: "'Arial Black', 'Futura', Arial, sans-serif",
    radius: 4, motion: "glow", change: "scan", kit: { line: 3, fill: "solid", panel: "fill" },
    panelEdge: "rgba(1,205,254,0.7)",
    sky: ["#12053a", "#3a0f78", "#c0368f", "#f28a63"], skyB: ["#03021f", "#150a5c", "#3b2fb0", "#6d4bd8"], sunA: "#fff15a", sunM: "#ff9a52", sunB: "#ff2d95",
    gridV: "#17e3ff", gridH: "#ff4fd0", ridge: "#2a0b66", ridgeLine: "#17e3ff", floorCols: ["#3a0d6e", "#10042e"], horizonGlow: "#ff3fb0",
    cols: ["#ff71ce", "#01cdfe", "#05ffa1", "#fffb96", "#b967ff"],
    winFace: "#e0d2ff", winFace2: "#b9a2f5", winInk: "#26104f", winT: ["#ff71ce", "#8f5cff"], screen: "#150843", hard: "#0a0222",
    marble: ["#efe6ff", "#ffffff", "#a98fe0", "#cdbcf5"],
    // Headlines set straight on this look's backdrop, where its ink and accent (meant for panels) do not read.
    displayAccent: { light: "#731547" },
    displayInk: { original: "#ffffff" },
    palettes: { light, dark, mono },
    textShadow: () => "0.05em 0 0 rgba(1,205,254,0.9), -0.05em 0 0 rgba(255,113,206,0.9), 0 0 24px rgba(10,0,40,0.65)",
    backdrop: (accent, texture, look) => `linear-gradient(180deg, ${look.sky[0]} 0%, ${look.sky[1]} 28%, ${look.sky[2]} 48%, ${look.sky[3]} 56%, ${look.floorCols[0]} 57%, ${look.floorCols[1]} 100%)`,
    css: (accent, look) => {
      const root = document.getElementById("root");
      const u = Math.min(Number(root && root.dataset.width) || 1920, Number(root && root.dataset.height) || 1080) / 1080;
      const lightPal = parseInt(String(look.bg).slice(1, 3), 16) > 200;
      return `.kicker { font-size: ${44 * u}px !important; letter-spacing: 0.08em; align-self: flex-start; padding: 0.22em 0.7em; background: linear-gradient(90deg, ${look.cols[0]}, ${look.winT[1]}); color: #ffffff; text-shadow: none;
        border: ${3 * u}px solid #ffffff; box-shadow: ${8 * u}px ${8 * u}px 0 ${look.cols[1]}; }
      .display { -webkit-text-stroke: 0; }
      #title-scene .display, #closing-scene .display { padding-left: 0.1em; ${lightPal ? "" : "filter: drop-shadow(0 0 18px rgba(255,95,200,0.35));"} }`;
    },
    keepArt: true,
    overlap: false,
    stage,
    scenes: { chart: wrap(chartScene), object: wrap(objectScene), people: wrap(peopleScene), process: wrap(processScene), compare: wrap(compareScene) },
  };
});
