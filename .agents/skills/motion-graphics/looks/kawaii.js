// Kawaii: a pastel sticker-meadow world drawn in chibi illustration. Every shape is a flat pastel fill
// with an even plum outline and one hard cel shadow; dot-and-star patterns cover the sky, sunrise rays
// turn slowly behind rolling hills, and a cast of original characters (rice-cake blobs, a clapperboard
// buddy, star sprites and chibi people) lives in it. Headlines are bouncy outlined lettering drawn on the
// canvas; scenes change through a wave of pastel bubbles that pops in and out.
// Every frame is a pure function of time: seeded hashes only, no clocks.
window.DreamcutMotion.register("kawaii", ({ grain, rng }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const ei = (v) => Math.pow(clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v, s = 1.9) => { v = clamp(v); const c3 = s + 1; return 1 + c3 * Math.pow(v - 1, 3) + s * Math.pow(v - 1, 2); };
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const bump = (v) => (v > 0 && v < 1 ? Math.sin(Math.PI * v) : 0);
  const CIN = 0.9; // share of the change spent building the bubble wall

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
    return [200, 180, 220];
  }
  const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  const SHADE = {};
  function shadeOf(th, fill) {
    const key = th.line + fill + th.shadeK;
    if (!SHADE[key]) SHADE[key] = rgba(mix(rgb(fill), rgb(th.line), th.shadeK));
    return SHADE[key];
  }

  function theme(S) {
    const L = S.look;
    const f = L.fills;
    return {
      u: S.u, S, line: L.line, lw: 5 * S.u, shadeK: L.shadeK ?? 0.2, acc: S.accent, accRGB: rgb(S.accent),
      sky: L.sky, ray: L.ray, dot: L.dot, twinkle: L.twinkle, hill: L.hill, f, cheek: L.cheek, iris: L.iris,
      skin: L.skin, hair: L.hairs, screen: L.screen, tex: L.texture ?? 1, night: Boolean(L.night),
      cycle: [f.mint, f.lav, f.sky, f.butter, f.peach, f.pink],
      onAcc: lum(rgb(S.accent)) > 185 ? L.line : "#ffffff",
      drop: rgba(mix(rgb(S.accent), rgb(L.line), 0.45)),
    };
  }

  // ---- buffers, grain ------------------------------------------------------------------------------
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
    const c = buf("noise", 200, 200);
    const g = c.getContext("2d");
    const img = g.createImageData(200, 200);
    const r = rng(20);
    for (let i = 0; i < img.data.length; i += 4) { const v = 96 + r() * 160; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    return (NOISE = c);
  }

  // ---- path builders (no beginPath: the painter owns it) --------------------------------------------
  const pRR = (x, y, w, h, r) => (c) => {
    const q = Math.max(0, Math.min(r, w / 2, h / 2));
    c.moveTo(x + q, y); c.arcTo(x + w, y, x + w, y + h, q); c.arcTo(x + w, y + h, x, y + h, q);
    c.arcTo(x, y + h, x, y, q); c.arcTo(x, y, x + w, y, q); c.closePath();
  };
  const pEll = (cx, cy, rx, ry, rot = 0) => (c) => { c.moveTo(cx + Math.cos(rot) * rx, cy + Math.sin(rot) * rx); c.ellipse(cx, cy, rx, ry, rot, 0, TAU); c.closePath(); };
  const pStar = (cx, cy, R, r, rot = -Math.PI / 2, n = 5) => (c) => {
    const pts = [];
    for (let i = 0; i < n * 2; i++) { const a = rot + (i * Math.PI) / n, rad = i % 2 ? r : R; pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]); }
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const m0 = mid(pts[0], pts[1]);
    c.moveTo(m0[0], m0[1]);
    for (let i = 1; i <= pts.length; i++) {
      const p = pts[i % pts.length], nx = mid(p, pts[(i + 1) % pts.length]);
      c.arcTo(p[0], p[1], nx[0], nx[1], i % 2 ? r * 0.22 : R * 0.16);
    }
    c.closePath();
  };
  const pHeart = (cx, cy, s) => (c) => {
    c.moveTo(cx, cy + s * 0.42);
    c.bezierCurveTo(cx - s * 0.62, cy + s * 0.02, cx - s * 0.46, cy - s * 0.56, cx, cy - s * 0.24);
    c.bezierCurveTo(cx + s * 0.46, cy - s * 0.56, cx + s * 0.62, cy + s * 0.02, cx, cy + s * 0.42);
    c.closePath();
  };
  const pScallop = (cx, cy, R, n = 16, rot = 0, depth = 0.1) => (c) => {
    for (let i = 0; i <= n; i++) {
      const a = rot + (i / n) * TAU, x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
      if (i === 0) { c.moveTo(x, y); continue; }
      const am = rot + ((i - 0.5) / n) * TAU;
      c.quadraticCurveTo(cx + Math.cos(am) * R * (1 + depth * 2), cy + Math.sin(am) * R * (1 + depth * 2), x, y);
    }
    c.closePath();
  };

  // A flat pastel fill, one hard cel shadow on the side away from the light, an optional gloss and an
  // even plum outline: the medium's single shape painter.
  function blob(ctx, th, path, fill, o = {}) {
    const u = th.u;
    ctx.save();
    ctx.beginPath(); path(ctx); ctx.fillStyle = fill; ctx.fill();
    const sx = o.sx ?? 9 * u, sy = o.sy ?? 8 * u;
    if (o.cel !== false && (sx || sy)) {
      ctx.save();
      ctx.beginPath(); path(ctx); ctx.clip();
      ctx.beginPath(); ctx.rect(-1e5, -1e5, 2e5, 2e5); ctx.translate(-sx, -sy); path(ctx); ctx.translate(sx, sy);
      ctx.fillStyle = o.shade || shadeOf(th, fill); ctx.fill("evenodd");
      ctx.restore();
    }
    if (o.gloss) {
      ctx.save(); ctx.beginPath(); path(ctx); ctx.clip();
      const g = o.gloss;
      ctx.fillStyle = "rgba(255,255,255,0.78)";
      ctx.beginPath(); ctx.ellipse(g[0], g[1], g[2], g[3], g[4] ?? -0.6, 0, TAU); ctx.fill();
      if (g[5]) { ctx.beginPath(); ctx.arc(g[0] + g[2] * 1.5, g[1] + g[3] * 0.6, g[3] * 0.45, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
    if (o.dots) { // polka dots inside the shape
      ctx.save(); ctx.beginPath(); path(ctx); ctx.clip();
      const [x0, y0, w0, h0, step, rr] = o.dots;
      ctx.fillStyle = o.dotColor || "rgba(255,255,255,0.42)";
      ctx.beginPath();
      for (let j = 0, y = y0; y < y0 + h0 + step; j++, y += step * 0.87) for (let x = x0 + (j % 2) * step / 2; x < x0 + w0 + step; x += step) { ctx.moveTo(x + rr, y); ctx.arc(x, y, rr, 0, TAU); }
      ctx.fill(); ctx.restore();
    }
    if (o.line !== false) {
      ctx.beginPath(); path(ctx);
      ctx.lineWidth = o.lw ?? th.lw; ctx.strokeStyle = th.line; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke();
    }
    ctx.restore();
  }
  function shadowEll(ctx, th, x, y, rx, ry, a = 0.16) {
    ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = th.line; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill(); ctx.restore();
  }
  function pop(ctx, q, cx, cy) { const s = Math.max(0.001, q); ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy); }

  // ---- little decorations ---------------------------------------------------------------------------
  function sparkle(ctx, th, x, y, r, color, o = {}) {
    if (r <= 0.5) return;
    ctx.save(); ctx.translate(x, y); ctx.rotate(o.rot || 0);
    ctx.beginPath();
    ctx.moveTo(0, -r); ctx.quadraticCurveTo(r * 0.12, -r * 0.12, r, 0); ctx.quadraticCurveTo(r * 0.12, r * 0.12, 0, r);
    ctx.quadraticCurveTo(-r * 0.12, r * 0.12, -r, 0); ctx.quadraticCurveTo(-r * 0.12, -r * 0.12, 0, -r); ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    if (o.line) { ctx.lineWidth = Math.max(2, r * 0.16); ctx.strokeStyle = th.line; ctx.lineJoin = "round"; ctx.stroke(); }
    ctx.restore();
  }
  function heart(ctx, th, x, y, s, color, o = {}) {
    if (s <= 1) return;
    blob(ctx, th, pHeart(x, y, s), color, { sx: s * 0.1, sy: s * 0.08, lw: o.lw ?? Math.max(2.5 * th.u, s * 0.08), gloss: o.gloss === false ? null : [x - s * 0.22, y - s * 0.16, s * 0.1, s * 0.06, -0.7], line: o.line });
  }
  function flower(ctx, th, x, y, s, color, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    const path = (c) => { for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU - Math.PI / 2; const px = Math.cos(a) * s * 0.42, py = Math.sin(a) * s * 0.42; c.moveTo(px + s * 0.34, py); c.arc(px, py, s * 0.34, 0, TAU); } };
    blob(ctx, th, path, color, { sx: s * 0.06, sy: s * 0.06, lw: 3.2 * th.u });
    blob(ctx, th, pEll(0, 0, s * 0.26, s * 0.26), th.f.butter, { cel: false, lw: 3.2 * th.u });
    ctx.restore();
  }
  function loopArrow(ctx, th, x, y, r, rot, color) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.beginPath(); ctx.arc(0, 0, r, 0.3, TAU - 0.6);
    ctx.lineCap = "round"; ctx.lineWidth = r * 0.62; ctx.strokeStyle = th.line; ctx.stroke();
    ctx.lineWidth = r * 0.34; ctx.strokeStyle = color; ctx.stroke();
    const ax = Math.cos(TAU - 0.6) * r, ay = Math.sin(TAU - 0.6) * r;
    ctx.beginPath(); ctx.moveTo(ax + r * 0.55, ay - r * 0.1); ctx.lineTo(ax - r * 0.05, ay + r * 0.55); ctx.lineTo(ax - r * 0.25, ay - r * 0.45); ctx.closePath();
    ctx.fillStyle = color; ctx.lineJoin = "round"; ctx.lineWidth = r * 0.14; ctx.strokeStyle = th.line; ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // ---- faces and characters (all original) ---------------------------------------------------------
  // A chibi face: big glossy eyes (or happy arcs / dizzy spirals), blush ovals and a tiny mouth.
  function face(ctx, th, cx, cy, s, t, o = {}) {
    const mood = o.mood || "happy", seed = o.seed || 0;
    const ex = s * (o.gap ?? 0.19), er = s * (o.eye ?? 0.075);
    const lw = Math.max(2.5 * th.u, er * 0.42);
    const lx = (o.lx || 0) * er * 0.4, ly = (o.ly || 0) * er * 0.4;
    const period = 2.9 + (seed % 5) * 0.41;
    const blink = mood === "happy" && ((t + seed * 1.37) % period) < 0.13;
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = th.line; ctx.fillStyle = th.line; ctx.lineWidth = lw;
    ctx.save(); ctx.globalAlpha *= 0.8; ctx.fillStyle = th.cheek;
    for (const sg of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + sg * (ex + er * 1.25), cy + er * 1.25, er * 1.05, er * 0.58, 0, 0, TAU); ctx.fill(); }
    ctx.restore();
    for (const sg of [-1, 1]) {
      const x = cx + sg * ex + lx, y = cy + ly;
      if (mood === "joy" || (mood === "wink" && sg > 0)) {
        ctx.beginPath(); ctx.arc(x, y + er * 0.55, er * 0.95, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      } else if (mood === "dizzy") {
        ctx.beginPath();
        for (let a = 0; a < TAU * 2.2; a += 0.3) { const rr = er * (0.1 + (a / (TAU * 2.2)) * 0.95); const px = x + Math.cos(a + t * 5 * sg) * rr, py = y + Math.sin(a + t * 5 * sg) * rr; a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
        ctx.lineWidth = lw * 0.8; ctx.stroke(); ctx.lineWidth = lw;
      } else if (blink) {
        ctx.beginPath(); ctx.moveTo(x - er * 0.9, y + er * 0.1); ctx.quadraticCurveTo(x, y + er * 0.6, x + er * 0.9, y + er * 0.1); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.ellipse(x, y, er * 0.86, er * 1.14, 0, 0, TAU); ctx.fill();
        ctx.save(); ctx.clip(); ctx.fillStyle = th.iris; ctx.beginPath(); ctx.ellipse(x, y + er * 0.8, er * 0.95, er * 0.66, 0, 0, TAU); ctx.fill(); ctx.restore();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath(); ctx.arc(x - er * 0.28, y - er * 0.42, er * 0.36, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(x + er * 0.3, y + er * 0.36, er * 0.15, 0, TAU); ctx.fill();
        ctx.fillStyle = th.line;
      }
    }
    const my = cy + er * 1.15;
    if (o.mouth === "open" || mood === "wow") {
      ctx.beginPath(); ctx.moveTo(cx - er * 0.62, my - er * 0.15); ctx.quadraticCurveTo(cx, my + er * 1.5, cx + er * 0.62, my - er * 0.15); ctx.closePath(); ctx.fill();
      ctx.save(); ctx.clip(); ctx.fillStyle = th.cheek; ctx.beginPath(); ctx.ellipse(cx, my + er * 0.75, er * 0.42, er * 0.3, 0, 0, TAU); ctx.fill(); ctx.restore();
    } else if (mood === "dizzy") {
      ctx.beginPath(); ctx.moveTo(cx - er * 0.7, my + er * 0.1);
      for (let k = 1; k <= 4; k++) ctx.quadraticCurveTo(cx - er * 0.7 + (k - 0.5) * er * 0.35, my + (k % 2 ? -er * 0.25 : er * 0.45), cx - er * 0.7 + k * er * 0.35, my + er * 0.1);
      ctx.stroke();
    } else {
      const r = er * 0.3;
      ctx.beginPath(); ctx.arc(cx - r, my, r, 0, Math.PI); ctx.moveTo(cx + r * 2, my); ctx.arc(cx + r, my, r, 0, Math.PI); ctx.stroke();
    }
    if (o.sweat) {
      const sx = cx + s * 0.42, sy = cy - s * 0.12 + ((t * 0.8) % 1) * s * 0.08;
      ctx.beginPath(); ctx.moveTo(sx, sy - er * 1.2); ctx.quadraticCurveTo(sx + er * 0.9, sy + er * 0.2, sx, sy + er * 0.55); ctx.quadraticCurveTo(sx - er * 0.9, sy + er * 0.2, sx, sy - er * 1.2);
      ctx.fillStyle = th.f.sky; ctx.fill(); ctx.lineWidth = lw * 0.7; ctx.stroke();
    }
    ctx.restore();
  }

  // A rice-cake blob: squishy dome body, leaf sprout, nub arms. Breathes; can hop and wave.
  function mochi(ctx, th, x, y, s, t, o = {}) {
    const u = th.u, seed = o.seed ?? 0;
    const hopA = o.hop ?? 0;
    const ph = (t * (o.hopRate ?? 1.5) + seed * 0.37) % 1;
    const lift = hopA > 0 ? Math.sin(ph * Math.PI) : 0;
    const land = hopA > 0 ? clamp(1 - Math.min(ph, 1 - ph) * 7) : 0;
    const sq = 1 + 0.035 * Math.sin(t * 2.6 + seed * 1.9) - 0.13 * land * hopA * 4 + 0.07 * lift * Math.min(1, hopA * 4);
    const w = s / Math.sqrt(Math.max(0.6, sq)), h = s * 0.82 * sq;
    const by = y - lift * s * hopA - (o.lift || 0);
    if (o.shadow !== false) shadowEll(ctx, th, x, y + 3 * u, w * 0.46 * (1 - lift * hopA), s * 0.07);
    const fill = o.color || th.f.white;
    const arm = (sg, up) => {
      const ax = x + sg * w * 0.47, ay = by - h * (up ? 0.62 : 0.3);
      const rot = up ? sg * (0.5 + Math.sin(t * 9 + seed) * 0.35) : sg * 0.3;
      blob(ctx, th, pEll(ax + (up ? sg * w * 0.06 : 0), ay, w * 0.12, w * 0.085, rot), fill, { sx: w * 0.02, sy: w * 0.02, lw: 4 * u });
    };
    const wave = o.arms === "wave", cheer = o.arms === "up";
    if (o.arms) { arm(-1, cheer); arm(1, cheer || wave); }
    const body = (c) => {
      c.moveTo(x - w / 2, by - h * 0.3);
      c.bezierCurveTo(x - w / 2, by - h * 1.04, x + w / 2, by - h * 1.04, x + w / 2, by - h * 0.3);
      c.bezierCurveTo(x + w / 2, by + h * 0.01, x + w * 0.3, by, x, by);
      c.bezierCurveTo(x - w * 0.3, by, x - w / 2, by + h * 0.01, x - w / 2, by - h * 0.3);
      c.closePath();
    };
    blob(ctx, th, body, fill, { sx: w * 0.07, sy: h * 0.07, gloss: [x - w * 0.24, by - h * 0.72, w * 0.09, h * 0.05, -0.6, true] });
    if (o.sprout !== false) {
      const sway = Math.sin(t * 2.2 + seed) * 0.25;
      const bx = x + w * 0.04, bt = by - h * 0.85;
      const tx = bx + Math.sin(sway) * s * 0.14, ty = bt - Math.cos(sway) * s * 0.14;
      ctx.save(); ctx.beginPath(); ctx.moveTo(bx, bt + 2 * u); ctx.quadraticCurveTo(bx, ty + s * 0.04, tx, ty); ctx.lineWidth = 4 * u; ctx.strokeStyle = th.line; ctx.lineCap = "round"; ctx.stroke(); ctx.restore();
      blob(ctx, th, pEll(tx - s * 0.07, ty, s * 0.08, s * 0.04, -0.5 + sway), th.f.mint, { sx: 2 * u, sy: 2 * u, lw: 3.5 * u });
      blob(ctx, th, pEll(tx + s * 0.07, ty - s * 0.01, s * 0.08, s * 0.04, 0.5 + sway), th.f.mint, { sx: 2 * u, sy: 2 * u, lw: 3.5 * u });
    }
    face(ctx, th, x, by - h * 0.44, w, t, { mood: o.mood, seed, mouth: o.mouth, sweat: o.sweat, lx: o.lx, ly: o.ly, eye: 0.078 });
    return { top: by - h * 0.9, cx: x };
  }

  // A clapperboard buddy: striped clap stick that snaps shut, stubby feet, face on the slate.
  function clapper(ctx, th, x, y, s, t, o = {}) {
    const u = th.u, seed = o.seed || 0;
    const bob = Math.abs(Math.sin(t * 2.3 + seed)) * s * 0.035;
    const bw = s, bh = s * 0.68, leg = s * 0.11;
    const bx = x - bw / 2, top = y - leg - bh - bob;
    shadowEll(ctx, th, x, y + 3 * u, bw * 0.48, s * 0.06);
    for (const sg of [-1, 1]) blob(ctx, th, pRR(x + sg * bw * 0.22 - s * 0.06, top + bh - 6 * u, s * 0.12, leg + 6 * u + bob, s * 0.05), th.f.lav, { cel: false, lw: 4 * u });
    const ph = (t * (o.rate ?? 0.75) + seed * 0.3) % 1;
    const open = ph < 0.78 ? 0.55 * eo(ph / 0.78) : 0.55 * (1 - ei((ph - 0.78) / 0.22));
    // Waving arm behind the slate.
    const ang = -0.9 + Math.sin(t * 7 + seed) * 0.35;
    blob(ctx, th, pEll(x + bw * 0.52 + Math.cos(ang) * s * 0.08, top + bh * 0.55 + Math.sin(ang) * s * 0.12, s * 0.07, s * 0.1, ang), th.f.white, { sx: 2 * u, sy: 2 * u, lw: 4 * u });
    blob(ctx, th, pEll(x - bw * 0.53, top + bh * 0.62, s * 0.065, s * 0.09, 0.4), th.f.white, { sx: 2 * u, sy: 2 * u, lw: 4 * u });
    const slate = pRR(bx, top, bw, bh, s * 0.1);
    blob(ctx, th, slate, o.color || th.f.lav, { sx: s * 0.06, sy: s * 0.05, gloss: [bx + bw * 0.2, top + bh * 0.42, bw * 0.06, bh * 0.04, -0.5] });
    // Striped band on the slate top.
    ctx.save(); ctx.beginPath(); slate(ctx); ctx.clip();
    ctx.fillStyle = th.f.white; ctx.fillRect(bx, top, bw, bh * 0.22);
    ctx.fillStyle = th.line;
    for (let k = -1; k < 7; k++) { const sx0 = bx + k * bw * 0.18; ctx.beginPath(); ctx.moveTo(sx0, top + bh * 0.22); ctx.lineTo(sx0 + bw * 0.09, top + bh * 0.22); ctx.lineTo(sx0 + bw * 0.16, top); ctx.lineTo(sx0 + bw * 0.07, top); ctx.closePath(); ctx.fill(); }
    ctx.fillRect(bx, top + bh * 0.22, bw, 4 * u);
    ctx.restore();
    face(ctx, th, x, top + bh * 0.6, bw * 0.95, t, { mood: o.mood, seed: seed + 3 });
    // The hinged clap stick.
    ctx.save(); ctx.translate(bx + 4 * u, top + 2 * u); ctx.rotate(-open);
    const stick = pRR(-4 * u, -s * 0.17, bw * 1.0, s * 0.16, s * 0.04);
    blob(ctx, th, stick, th.f.white, { sx: 3 * u, sy: 3 * u, cel: false, line: false });
    ctx.save(); ctx.beginPath(); stick(ctx); ctx.clip(); ctx.fillStyle = th.acc;
    for (let k = -1; k < 7; k++) { const sx0 = k * bw * 0.18; ctx.beginPath(); ctx.moveTo(sx0, 0); ctx.lineTo(sx0 + bw * 0.09, 0); ctx.lineTo(sx0 + bw * 0.16, -s * 0.17); ctx.lineTo(sx0 + bw * 0.07, -s * 0.17); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    ctx.beginPath(); stick(ctx); ctx.lineWidth = th.lw; ctx.strokeStyle = th.line; ctx.lineJoin = "round"; ctx.stroke();
    ctx.restore();
    if (ph < 0.12 || ph > 0.97) { // snap lines
      ctx.save(); ctx.strokeStyle = th.line; ctx.lineWidth = 4 * u; ctx.lineCap = "round";
      for (let k = 0; k < 3; k++) { const a = -0.9 + k * 0.45; const r0 = s * 0.12, r1 = s * 0.24; ctx.beginPath(); ctx.moveTo(bx + bw + Math.cos(a) * r0, top + Math.sin(a) * r0); ctx.lineTo(bx + bw + Math.cos(a) * r1, top + Math.sin(a) * r1); ctx.stroke(); }
      ctx.restore();
    }
  }

  // A five-point star sprite with a face, tilting as it floats.
  function starBuddy(ctx, th, x, y, R, t, o = {}) {
    const seed = o.seed || 0;
    ctx.save(); ctx.translate(x, y + Math.sin(t * 1.8 + seed) * R * 0.12); ctx.rotate(Math.sin(t * 1.3 + seed) * 0.16);
    blob(ctx, th, pStar(0, 0, R, R * 0.56), o.color || th.f.butter, { sx: R * 0.1, sy: R * 0.1, gloss: [-R * 0.3, -R * 0.28, R * 0.1, R * 0.06, -0.7] });
    face(ctx, th, 0, R * 0.1, R * 1.05, t, { mood: o.mood || "happy", seed: seed + 7, eye: 0.085, gap: 0.2 });
    ctx.restore();
  }

  // A chibi person: oversized head, six original hair styles, nub arms (one may wave), stubby legs.
  function chibi(ctx, th, x, y, s, t, o = {}) {
    const u = th.u, seed = o.seed || 0, k = o.k ?? 0;
    const style = o.hair ?? k % 6;
    const hc = o.hairColor || th.hair[k % th.hair.length];
    const skin = o.skin || th.skin[(k * 3 + 1) % th.skin.length];
    const shirt = o.shirt || th.cycle[k % th.cycle.length];
    const ph = (t * 1.4 + seed * 0.31) % 1;
    const hopA = o.hop ?? 0;
    const lift = hopA * Math.sin(ph * Math.PI) * s * 0.18;
    const bob = Math.abs(Math.sin(t * 2.4 + seed * 1.3)) * s * 0.014 + lift + (o.lift || 0);
    const r = s * 0.29;
    const hx = x, hy = y - s + r - bob;
    const tilt = Math.sin(t * 1.5 + seed) * 0.06;
    shadowEll(ctx, th, x, y + 3 * u, s * 0.2 * (1 - hopA * 0.3), s * 0.035);
    const bodyTop = hy + r * 0.86, legTop = y - s * 0.13 - bob;
    // Legs.
    for (const sg of [-1, 1]) blob(ctx, th, pRR(x + sg * s * 0.075 - s * 0.045, legTop - 4 * u, s * 0.09, s * 0.13 + 4 * u + (bob - lift) * 0, s * 0.04), th.f.lav, { cel: false, lw: 4 * u });
    // Arms (behind the body edge).
    const wave = o.wave ? Math.sin(t * 8 + seed) * 0.35 : 0;
    const armL = o.cheer ? 2.4 : 0.35, armR = o.cheer ? 2.4 : o.wave ? 2.5 + wave : 0.35;
    for (const [sg, a] of [[-1, armL], [1, armR]]) {
      const sx0 = x + sg * s * 0.12, sy0 = bodyTop + s * 0.07;
      ctx.save(); ctx.translate(sx0, sy0); ctx.rotate(sg < 0 ? a : -a);
      blob(ctx, th, pRR(-s * 0.04, -s * 0.02, s * 0.08, s * 0.17, s * 0.04), shirt, { sx: 2 * u, sy: 2 * u, lw: 4 * u });
      blob(ctx, th, pEll(0, s * 0.165, s * 0.045, s * 0.045), skin, { cel: false, lw: 3.5 * u });
      ctx.restore();
    }
    // Body: a soft bell.
    const body = (c) => {
      c.moveTo(x - s * 0.12, bodyTop);
      c.quadraticCurveTo(x - s * 0.13, legTop, x - s * 0.18, legTop + s * 0.015);
      c.quadraticCurveTo(x, legTop + s * 0.04, x + s * 0.18, legTop + s * 0.015);
      c.quadraticCurveTo(x + s * 0.13, legTop, x + s * 0.12, bodyTop);
      c.quadraticCurveTo(x, bodyTop - s * 0.03, x - s * 0.12, bodyTop);
      c.closePath();
    };
    blob(ctx, th, body, shirt, { sx: s * 0.03, sy: s * 0.02, lw: 4.5 * u });
    blob(ctx, th, pEll(x, bodyTop + s * 0.02, s * 0.06, s * 0.025), th.f.white, { cel: false, lw: 3.5 * u });
    // Head group (tilts at the neck).
    ctx.save(); ctx.translate(hx, hy + r); ctx.rotate(tilt); ctx.translate(-hx, -(hy + r));
    const hb = (path) => blob(ctx, th, path, hc, { sx: r * 0.08, sy: r * 0.06, lw: 4.5 * u });
    if (style === 0) hb(pRR(hx - r * 1.2, hy - r * 0.7, r * 2.4, r * 1.75, r * 0.75));
    if (style === 1) { hb(pEll(hx - r * 0.82, hy - r * 0.8, r * 0.42, r * 0.42)); hb(pEll(hx + r * 0.82, hy - r * 0.8, r * 0.42, r * 0.42)); }
    if (style === 3) { const sw = Math.sin(t * 3 + seed) * 0.22; hb(pEll(hx + r * 1.05 + Math.sin(sw) * r * 0.3, hy + r * 0.2, r * 0.36, r * 0.8, 0.25 + sw)); }
    if (style === 5) hb((c) => { for (let i = 0; i < 9; i++) { const a = Math.PI * (0.85 + (i / 8) * 1.3); const px = hx + Math.cos(a) * r * 1.02, py = hy + Math.sin(a) * r * 1.0 - r * 0.05; c.moveTo(px + r * 0.36, py); c.arc(px, py, r * 0.36, 0, TAU); } for (const sg of [-1, 1]) { c.moveTo(hx + sg * r * 1.0 + r * 0.32, hy + r * 0.35); c.arc(hx + sg * r * 1.0, hy + r * 0.35, r * 0.32, 0, TAU); } });
    blob(ctx, th, pEll(hx, hy, r * 1.04, r), skin, { sx: r * 0.1, sy: r * 0.08 });
    // Front hair.
    const bangs = (c, spiky) => {
      if (spiky) { // soft rounded tufts, not a jagged crown
        const a0 = Math.PI * 0.93, span = Math.PI * 1.14, N = 6;
        c.moveTo(hx + Math.cos(a0) * r * 1.09, hy + Math.sin(a0) * r * 1.09 - r * 0.02);
        for (let i = 0; i < N; i++) {
          const am = a0 + ((i + 0.5) / N) * span, a1 = a0 + ((i + 1) / N) * span;
          const tip = [hx + Math.cos(am) * r * 1.3, hy + Math.sin(am) * r * 1.3 - r * 0.02];
          const end = [hx + Math.cos(a1) * r * 1.07, hy + Math.sin(a1) * r * 1.07 - r * 0.02];
          c.arcTo(tip[0], tip[1], end[0], end[1], r * 0.16);
          c.quadraticCurveTo(lerp(tip[0], end[0], 0.7) + Math.cos(a1) * r * 0.02, lerp(tip[1], end[1], 0.7), end[0], end[1]);
        }
      } else {
        c.moveTo(hx - r * 1.064, hy + r * 0.2);
        c.arc(hx, hy - r * 0.02, r * 1.09, Math.PI * 0.93, Math.PI * 2.07);
      }
      // A soft fringe: three rounded locks across the forehead.
      c.quadraticCurveTo(hx + r * 0.95, hy - r * 0.18, hx + r * 0.72, hy - r * 0.3);
      const xs = [0.72, 0.24, -0.24, -0.72];
      for (let i = 1; i < xs.length; i++) c.quadraticCurveTo(hx + r * (xs[i - 1] + xs[i]) / 2, hy + r * 0.04, hx + r * xs[i], hy - r * 0.3);
      c.quadraticCurveTo(hx - r * 0.95, hy - r * 0.18, hx - r * 1.064, hy + r * 0.2);
      c.closePath();
    };
    if (style === 4) {
      const hat = o.hatColor || th.f.pink;
      for (const sg of [-1, 1]) blob(ctx, th, pEll(hx + sg * r * 0.92, hy - r * 0.02, r * 0.22, r * 0.3), hc, { cel: false, lw: 4 * u });
      const pomY = hy - r * 1.3 - Math.abs(Math.sin(t * 3 + seed)) * r * 0.08;
      blob(ctx, th, pEll(hx, pomY, r * 0.26, r * 0.26), th.f.white, { sx: r * 0.05, sy: r * 0.05, lw: 4 * u });
      blob(ctx, th, (c) => { c.moveTo(hx - r * 1.12, hy - r * 0.18); c.arc(hx, hy - r * 0.2, r * 1.12, Math.PI, TAU); c.closePath(); }, hat, { sx: r * 0.1, sy: r * 0.06, dots: [hx - r * 1.2, hy - r * 1.4, r * 2.4, r * 1.3, r * 0.32, r * 0.06] });
      blob(ctx, th, pRR(hx - r * 1.18, hy - r * 0.36, r * 2.36, r * 0.34, r * 0.17), shadeOf(th, hat), { cel: false, lw: 4.5 * u });
    } else if (style === 5) {
      blob(ctx, th, (c) => { for (let i = 0; i < 5; i++) { const px = hx + r * (-0.8 + i * 0.4), py = hy - r * 0.6 - (i % 2) * r * 0.12; c.moveTo(px + r * 0.3, py); c.arc(px, py, r * 0.3, 0, TAU); } c.moveTo(hx + r, hy - r * 0.4); c.arc(hx, hy - r * 0.4, r * 0.98, 0, Math.PI, true); }, hc, { sx: r * 0.06, sy: r * 0.06, lw: 4.5 * u });
    } else {
      blob(ctx, th, (c) => bangs(c, style === 2), hc, { sx: r * 0.08, sy: r * 0.08, lw: 4.5 * u, gloss: [hx - r * 0.45, hy - r * 0.7, r * 0.22, r * 0.07, -0.4] });
      // Rim light along the crown, clipped to the hair.
      ctx.save(); ctx.beginPath(); bangs(ctx, style === 2); ctx.clip();
      ctx.beginPath(); ctx.arc(hx, hy - r * 0.02, r * 0.92, Math.PI * 1.12, Math.PI * 1.62);
      ctx.lineWidth = r * 0.08; ctx.lineCap = "round"; ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.stroke();
      ctx.restore();
      if (style === 1 || style === 3) { ctx.save(); ctx.fillStyle = th.acc; ctx.strokeStyle = th.line; ctx.lineWidth = 3.5 * u; ctx.beginPath(); ctx.arc(hx + r * 0.78, hy - r * 0.68, r * 0.13, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore(); }
    }
    face(ctx, th, hx, hy + r * 0.28, r * 1.9, t, { mood: o.mood, seed: seed + k, eye: 0.085, gap: 0.2, mouth: o.mouth });
    ctx.restore();
    return { top: hy - r * 1.3, cx: x };
  }

  // ---- type ----------------------------------------------------------------------------------------
  const fnt = (S, size) => `${S.look.displayWeight} ${size}px ${S.look.display}`;
  function wrapLines(ctx, S, s, size, maxW) {
    ctx.save(); ctx.font = fnt(S, size);
    const words = String(s || "").split(/\s+/).filter(Boolean);
    const lines = []; let line = "";
    for (const w of words) { const n = line ? line + " " + w : w; if (line && ctx.measureText(n).width > maxW) { lines.push(line); line = w; } else line = n; }
    if (line) lines.push(line);
    ctx.restore();
    return lines;
  }
  // Wraps to the same number of lines as a greedy wrap, but at the narrowest width that keeps that count,
  // so no word is stranded alone on the last line.
  const BAL = {};
  function balanced(ctx, S, s, size, maxW) {
    const key = s + "|" + size + "|" + Math.round(maxW);
    if (BAL[key]) return BAL[key];
    const first = wrapLines(ctx, S, s, size, maxW);
    let out = first;
    if (first.length > 1) {
      let lo = maxW * 0.3, hi = maxW;
      for (let k = 0; k < 14; k++) { const mid = (lo + hi) / 2; if (wrapLines(ctx, S, s, size, mid).length > first.length) lo = mid; else hi = mid; }
      out = wrapLines(ctx, S, s, size, hi);
    }
    return (BAL[key] = out);
  }
  function textW(ctx, S, s, size) { ctx.save(); ctx.font = fnt(S, size); const w = ctx.measureText(String(s)).width; ctx.restore(); return w; }
  const LAYOUT = {};
  // Chunky sticker lettering: a coloured drop, a thick plum outline, then the fill. Letters pop in one by one
  // and ride a gentle wave through the hold.
  function chunky(ctx, S, th, lines, x, y, size, o = {}) {
    const lh = (o.lh ?? 1.1) * size;
    ctx.save();
    ctx.font = fnt(S, size); ctx.textBaseline = "alphabetic"; ctx.textAlign = "left"; ctx.lineJoin = "round"; ctx.miterLimit = 2;
    const key = lines.join("\n") + "|" + size + "|" + (o.align || "left");
    let glyphs = LAYOUT[key];
    if (!glyphs) {
      glyphs = []; let k = 0;
      lines.forEach((ln, li) => {
        const w = ctx.measureText(ln).width;
        const off = o.align === "center" ? -w / 2 : o.align === "right" ? -w : 0;
        for (let i = 0; i < ln.length; i++) {
          if (ln[i] === " ") continue;
          const a = ctx.measureText(ln.slice(0, i)).width, cw = ctx.measureText(ln[i]).width;
          glyphs.push({ ch: ln[i], dx: off + a, cx: off + a + cw / 2, li, k: k++ });
        }
      });
      LAYOUT[key] = glyphs;
    }
    const N = Math.max(1, glyphs.length), q = o.q ?? 1;
    const sw = size * (o.stroke ?? 0.2), drop = size * (o.drop ?? 0.09);
    const poses = glyphs.map((g) => {
      const a = (g.k / N) * 0.6;
      const qi = q >= 1 ? 1 : back(seg(q, a, a + 0.4), 2.4);
      const wave = o.t != null ? Math.sin(o.t * 3.1 - g.k * 0.5) * size * 0.03 : 0;
      return { qi, wave, by: y + g.li * lh };
    });
    for (let pass = 0; pass < 3; pass++) {
      glyphs.forEach((g, i) => {
        const { qi, wave, by } = poses[i];
        if (qi <= 0.002) return;
        const cy = by - size * 0.35;
        ctx.save();
        ctx.translate(x + g.cx, cy + wave); ctx.scale(qi, qi); ctx.rotate((1 - qi) * (g.k % 2 ? 0.5 : -0.5)); ctx.translate(-(x + g.cx), -cy);
        if (pass === 0) {
          if (o.dropColor !== null) { ctx.lineWidth = sw; ctx.strokeStyle = o.dropColor || th.drop; ctx.fillStyle = o.dropColor || th.drop; ctx.strokeText(g.ch, x + g.dx, by + drop); ctx.fillText(g.ch, x + g.dx, by + drop); }
        } else if (pass === 1) { ctx.lineWidth = sw; ctx.strokeStyle = o.outline || th.line; ctx.strokeText(g.ch, x + g.dx, by); }
        else { ctx.fillStyle = o.fill || "#ffffff"; ctx.fillText(g.ch, x + g.dx, by); }
        ctx.restore();
      });
    }
    ctx.restore();
  }
  // A sticker tag: white (or coloured) pill, plum outline, hard drop, text that arrives with the pill.
  function tag(ctx, S, th, s, cx, cy, size, o = {}) {
    const u = th.u;
    s = String(s ?? "");
    if (!s) return 0;
    let z = size;
    let w = textW(ctx, S, s, z);
    const minZ = Math.max(42 * u, size * 0.8);
    if (o.max && w + z * 1.3 > o.max) { z = Math.max(minZ, z * (o.max - z * 1.3) / Math.max(1, w)); w = textW(ctx, S, s, z); }
    const h = z * 1.55, bw = w + z * 1.25;
    const x0 = o.align === "left" ? cx : o.align === "right" ? cx - bw : cx - bw / 2;
    const q = o.q ?? 1;
    if (q <= 0.01) return bw;
    ctx.save();
    pop(ctx, q, x0 + bw / 2, cy);
    blob(ctx, th, pRR(x0, cy - h / 2 + z * 0.14, bw, h, h / 2), th.line, { cel: false, line: false });
    blob(ctx, th, pRR(x0, cy - h / 2, bw, h, h / 2), o.fill || th.f.white, { sx: 0, sy: z * 0.1, lw: 4.5 * u });
    ctx.font = fnt(S, z); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = o.color || th.line;
    ctx.fillText(s, x0 + bw / 2, cy + z * 0.06);
    ctx.restore();
    return bw;
  }
  const fmt = (v, ref, d) => window.DreamcutMotion.formatNumber(v, Number.isInteger(Number(ref)) ? 0 : 1, d.prefix, d.suffix);

  // ---- the world ------------------------------------------------------------------------------------
  // m: the scene's second beat (0..1) once its drawing has built; after: seconds past that beat.
  const FRAME = { t: 0, index: 0, scroll: 0, staged: false, handled: -1, m: 0, after: 0, gaps: [] };
  function beatOf(local, end, buildEnd) {
    const b1 = Math.max(buildEnd + 0.4, end - 0.05);
    FRAME.m = seg(local, buildEnd, b1);
    FRAME.after = Math.max(0, local - b1);
  }
  const floorY = (S) => S.H * 0.885;

  function sky(ctx, S, th, t) {
    const { W, H, u } = S;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, th.sky[0]); g.addColorStop(0.55, th.sky[1]); g.addColorStop(1, th.sky[2]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // Sunrise rays turning slowly from behind the hills.
    const cx = W / 2, cy = floorY(S) - 40 * u, R = Math.hypot(W, H);
    ctx.save(); ctx.fillStyle = th.ray;
    const n = 18, a0 = t * 0.06;
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const a = a0 + (i / n) * TAU; ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a, a + (TAU / n) * 0.5); ctx.closePath(); }
    ctx.fill(); ctx.restore();
    // Dot-and-star pattern drifting on a diagonal.
    const step = 58 * u, ox = (t * 14 * u) % (step * 2), oy = (t * 9 * u) % (step * 2);
    ctx.save();
    ctx.fillStyle = th.dot;
    ctx.beginPath();
    const stars = [];
    for (let j = -2, y = -step * 2 + oy; y < H + step; j++, y += step) {
      for (let i = -2, x = -step * 2 + ox + (j % 2 ? step / 2 : 0); x < W + step; i++, x += step) {
        const id = (i + 40) * 131 + (j + 40) * 17 + Math.floor((ox / step)) * 0;
        if (((i + j * 3) % 7 + 7) % 7 === 0) { stars.push([x, y, hash(id)]); continue; }
        ctx.moveTo(x + 3.6 * u, y); ctx.arc(x, y, 3.6 * u, 0, TAU);
      }
    }
    ctx.fill();
    for (const [x, y, hh] of stars) { const tw = 0.55 + 0.45 * Math.sin(t * 2.4 + hh * 20); sparkle(ctx, th, x, y, 9 * u * tw, th.twinkle); }
    ctx.restore();
  }
  function hillY(S, wx, layer) {
    const u = S.u, base = floorY(S);
    if (layer === 0) return base - 120 * u + Math.sin(wx / (260 * u)) * 46 * u + Math.sin(wx / (120 * u) + 2) * 14 * u;
    return base - 6 * u + Math.sin(wx / (330 * u) + 1) * 12 * u + Math.sin(wx / (150 * u)) * 5 * u;
  }
  function hills(ctx, S, th, t) {
    const { W, H, u } = S;
    const sc = FRAME.scroll;
    for (const layer of [0, 1]) {
      const off = sc * (layer ? 1 : 0.45);
      const path = (c) => { c.moveTo(-20 * u, H + 20 * u); for (let x = -20 * u; x <= W + 20 * u; x += 16 * u) c.lineTo(x, hillY(S, x + off, layer)); c.lineTo(W + 20 * u, H + 20 * u); c.closePath(); };
      blob(ctx, th, path, th.hill[layer], { sx: 22 * u, sy: -10 * u, dots: layer ? null : [0, floorY(S) - 200 * u, W, 260 * u, 46 * u, 4 * u], dotColor: "rgba(255,255,255,0.35)" });
      if (layer === 0) {
        // Little round trees on the far hills.
        for (let i = -1; i < 9; i++) {
          const wx = Math.floor(off / (260 * u)) * 260 * u + i * 260 * u + hash(i + Math.floor(off / (260 * u))) * 80 * u;
          const x = wx - off; if (x < -80 * u || x > W + 80 * u) continue;
          if (FRAME.gaps.some(([g0, g1]) => x > g0 && x < g1)) continue; // keep props clear of labels
          const y = hillY(S, wx, 0) + 6 * u, r = 30 * u + hash(Math.round(wx / u)) * 14 * u;
          blob(ctx, th, pRR(x - 6 * u, y - r * 0.6, 12 * u, r * 0.9, 5 * u), th.f.peach, { cel: false, lw: 4 * u });
          blob(ctx, th, pEll(x, y - r * 1.1 + Math.sin(t * 1.6 + wx) * 2 * u, r * 0.8, r * 0.75), th.f.mint, { sx: r * 0.14, sy: r * 0.1, lw: 4 * u, gloss: [x - r * 0.3, y - r * 1.35, r * 0.18, r * 0.1, -0.6] });
        }
      }
    }
    // Flowers, tufts and a mushroom along the near meadow, swaying.
    const step = 118 * u, first = Math.floor(sc / step) - 1;
    for (let i = first; i < first + Math.ceil(W / step) + 3; i++) {
      const hh = hash(i * 3.1), x = i * step - sc + hh * 50 * u;
      const y = hillY(S, x + sc, 1) + 14 * u + hash(i * 7.7) * 30 * u;
      if (y > H + 20 * u) continue;
      const sway = Math.sin(t * 2 + i * 0.9) * 0.18;
      if (hh < 0.55) {
        ctx.save(); ctx.strokeStyle = th.line; ctx.lineWidth = 4 * u; ctx.lineCap = "round";
        const fx = x + Math.sin(sway) * 26 * u, fy = y - 26 * u;
        ctx.beginPath(); ctx.moveTo(x, y + 6 * u); ctx.quadraticCurveTo(x, fy + 8 * u, fx, fy); ctx.stroke(); ctx.restore();
        flower(ctx, th, fx, fy, (22 + hh * 14) * u, th.cycle[(i % 6 + 6) % 6 === 3 ? 5 : (i % 6 + 6) % 6], sway + t * 0.3);
      } else if (hh < 0.85) {
        ctx.save(); ctx.strokeStyle = th.line; ctx.lineWidth = 4 * u; ctx.lineCap = "round"; ctx.beginPath();
        for (let b = -1; b <= 1; b++) { ctx.moveTo(x + b * 8 * u, y); ctx.quadraticCurveTo(x + b * 10 * u, y - 14 * u, x + b * 16 * u + Math.sin(sway) * 10 * u, y - (22 - Math.abs(b) * 6) * u); }
        ctx.stroke(); ctx.restore();
      } else {
        blob(ctx, th, pRR(x - 9 * u, y - 26 * u, 18 * u, 28 * u, 7 * u), th.f.white, { cel: false, lw: 4 * u });
        blob(ctx, th, (c) => { c.moveTo(x - 30 * u, y - 22 * u); c.quadraticCurveTo(x - 30 * u, y - 58 * u, x, y - 58 * u); c.quadraticCurveTo(x + 30 * u, y - 58 * u, x + 30 * u, y - 22 * u); c.closePath(); }, th.f.pink, { sx: 6 * u, sy: 4 * u, lw: 4 * u, dots: [x - 30 * u, y - 60 * u, 60 * u, 40 * u, 18 * u, 4 * u], dotColor: "rgba(255,255,255,0.9)" });
      }
    }
  }
  // Soap bubbles rising, twinkles and hearts drifting: the air is never still.
  function air(ctx, S, th, t) {
    const { W, H, u } = S;
    ctx.save();
    for (let i = 0; i < 12; i++) {
      const sp = 40 + hash(i) * 50, r = (12 + hash(i + 9) * 22) * u;
      const y = H - ((t * sp * u + hash(i + 3) * H * 1.3) % (H * 1.3));
      const x = hash(i + 5) * W + Math.sin(t * 1.2 + i) * 24 * u;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
      ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fill();
      ctx.lineWidth = 3 * u; ctx.strokeStyle = rgba(rgb(th.line), 0.35); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, r * 0.62, -2.6, -1.7); ctx.lineWidth = 3.5 * u; ctx.strokeStyle = "rgba(255,255,255,0.95)"; ctx.lineCap = "round"; ctx.stroke();
    }
    for (let i = 0; i < 16; i++) {
      const x = hash(i * 2.3 + 1) * W, y = hash(i * 4.1 + 2) * H * 0.7;
      const tw = Math.pow(Math.max(0, Math.sin(t * 1.9 + i * 1.7)), 2);
      sparkle(ctx, th, x, y, (10 + hash(i) * 12) * u * tw, i % 3 ? "#ffffff" : th.f.butter, { rot: t * 0.5 });
    }
    ctx.restore();
  }
  function finish(ctx, S, th) {
    const { W, H, u } = S;
    if (!S.paint) return;
    ctx.save();
    if (th.tex > 0) {
      ctx.globalCompositeOperation = "soft-light";
      ctx.globalAlpha = 0.32 * th.tex;
      const pat = ctx.createPattern(noise(), "repeat");
      ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.globalAlpha = 1;
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, rgba(rgb(th.line), 0.13 * (0.4 + 0.6 * th.tex)));
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  // Bunting strung across the top for the title and closing.
  function bunting(ctx, S, th, t, q) {
    const { W, u } = S;
    if (q <= 0) return;
    const y0 = (S.tall ? 70 : 34) * u, sag = (S.tall ? 90 : 80) * u + Math.sin(t * 1.3) * 6 * u;
    const at = (k) => [lerp(-30 * u, W + 30 * u, k), y0 + 4 * sag * k * (1 - k)];
    ctx.save();
    ctx.beginPath(); for (let k = 0; k <= 1.0001; k += 0.02) { const [x, y] = at(k); k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.lineWidth = 4 * u; ctx.strokeStyle = th.line; ctx.stroke();
    const n = Math.max(7, Math.round(W / (120 * u)));
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n, [x, y] = at(k);
      const qi = back(seg(q, i / n * 0.5, i / n * 0.5 + 0.5));
      if (qi <= 0) continue;
      const fw = 70 * u, fh = 84 * u;
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 2.2 + i * 0.8) * 0.09); ctx.scale(1, qi);
      const col = th.cycle[i % th.cycle.length];
      blob(ctx, th, (c) => { c.moveTo(-fw / 2, 0); c.lineTo(fw / 2, 0); c.quadraticCurveTo(fw * 0.18, fh * 0.55, 0, fh); c.quadraticCurveTo(-fw * 0.18, fh * 0.55, -fw / 2, 0); c.closePath(); }, col, { sx: 7 * u, sy: 0, lw: 4 * u, dots: i % 2 ? [-fw / 2, 0, fw, fh, 20 * u, 4 * u] : null });
      if (i % 2 === 0) sparkle(ctx, th, 0, fh * 0.36, 12 * u, "#ffffff");
      ctx.restore();
    }
    ctx.restore();
  }

  // ---- headlines ------------------------------------------------------------------------------------
  function headInfo(S, scene) {
    const el = document.getElementById(scene + "-title");
    if (!el) return null;
    const u = S.u;
    const size = Math.max(66 * u, parseFloat(el.style.fontSize) || 72 * u);
    const side = parseFloat(el.parentElement && el.parentElement.style.paddingLeft) || (S.tall ? 90 : 140) * u;
    const top = parseFloat(el.parentElement && el.parentElement.style.top) || (S.tall ? 170 : 96) * u;
    return { text: el.textContent || "", size, side, top };
  }
  // Where a scene's headline ends, however many lines it wraps to.
  function headBottom(ctx, S, scene) {
    const hi = headInfo(S, scene);
    if (!hi || !hi.text) return null;
    const lines = balanced(ctx, S, hi.text, hi.size, S.W - hi.side * 2);
    return hi.top + hi.size * (1.1 * lines.length + 0.15);
  }
  function headline(ctx, S, th, scene, local, t) {
    const hi = headInfo(S, scene);
    if (!hi || !hi.text) return;
    const lines = balanced(ctx, S, hi.text, hi.size, S.W - hi.side * 2);
    const q = clamp((local + 0.18) / 0.75);
    chunky(ctx, S, th, lines, hi.side, hi.top + hi.size * 0.86, hi.size, { q, t });
    // A star sprite keeps the free top corner company when the headline leaves room.
    const lw = Math.max(...lines.map((l) => textW(ctx, S, l, hi.size)));
    const room = S.W - hi.side * 2 - lw;
    if (room > 280 * S.u) {
      const R = Math.min(70 * S.u, room * 0.2);
      const x = S.W - hi.side - R * 1.4, y = hi.top + hi.size * 0.5;
      const qq = back(seg(local, 0.3, 0.8));
      if (qq > 0) {
        ctx.save(); pop(ctx, qq, x, y);
        starBuddy(ctx, th, x, y, R, t, { seed: 4, color: FRAME.index % 2 ? th.f.butter : th.f.pink });
        sparkle(ctx, th, x - R * 1.5, y - R * 0.6, R * 0.32 * (0.6 + 0.4 * Math.sin(t * 3)), th.f.butter, { line: true });
        sparkle(ctx, th, x + R * 1.25, y + R * 0.8, R * 0.24 * (0.6 + 0.4 * Math.sin(t * 3 + 2)), "#ffffff", { line: true });
        ctx.restore();
      }
    }
  }

  // ---- the changes ---------------------------------------------------------------------------------
  // Each change has its own carrier: a polka-dot ribbon pair sweeps across on a slant, a bank of cloud
  // friends rolls down the sky, a heart opens from the middle, or (once) the whole frame fills with
  // bubbles that pop away from the centre. The two scenes are clipped either side of the carrier, so
  // the new one is already building as it is revealed.
  function kindOf(a, z) {
    if (z === "closing") return a === "compare" ? "ribbon" : "bubbles";
    return { people: "clouds", chart: "clouds", object: "ribbon", process: "ribbon", compare: "heart" }[z] || "clouds";
  }
  function windows(P, ch) {
    const sh = P.shown, out = [];
    for (let j = 0; j < sh.length - 1; j++) {
      const a = sh[j], z = sh[j + 1], type = kindOf(a.id, z.id);
      const D = Math.max(0.3, Math.min(Math.max(0.8, ch * 1.9) * (type === "bubbles" ? 1.2 : 1), a.hold * 0.42, z.hold * 0.42));
      const pre = D * (type === "bubbles" ? 0.5 : 0.5);
      out.push({ from: j, to: j + 1, B: z.start, pre, post: D - pre, D, type, dir: j % 2 });
    }
    return out;
  }
  const sweep = (p) => 0.35 * clamp(p) + 0.65 * eio(p);
  function ribbonGeom(S, tr, p) {
    const { W, H, u } = S;
    const slope = tr.dir ? -0.36 : 0.36, bw = 250 * u;
    const reach = bw * 1.2 + Math.abs(slope) * H / 2 + 60 * u;
    const k = sweep(p);
    const ex = tr.dir ? lerp(W + reach, -reach, k) : lerp(-reach, W + reach, k);
    return { slope, bw, ex, sg: tr.dir ? -1 : 1 };
  }
  const cloudEdge = (S, p) => lerp(-260 * S.u, S.H + 300 * S.u, sweep(p));
  const heartSize = (S, p) => (2.2 * Math.max(S.W, S.H) + 0.2 * Math.min(S.W, S.H)) * Math.pow(clamp(p), 1.5);
  function clipFor(ctx, S, tr, p, incoming) {
    const { W, H } = S, m = 60 * S.u;
    ctx.beginPath();
    if (tr.type === "ribbon") {
      const g = ribbonGeom(S, tr, p), xa = g.ex + g.slope * (-m - H / 2), xb = g.ex + g.slope * (H + m - H / 2);
      const left = incoming === (g.sg > 0);
      if (left) { ctx.moveTo(-m, -m); ctx.lineTo(xa, -m); ctx.lineTo(xb, H + m); ctx.lineTo(-m, H + m); }
      else { ctx.moveTo(xa, -m); ctx.lineTo(W + m, -m); ctx.lineTo(W + m, H + m); ctx.lineTo(xb, H + m); }
      ctx.closePath(); ctx.clip();
    } else if (tr.type === "clouds") {
      const ey = cloudEdge(S, p);
      if (incoming) ctx.rect(-m, -m, W + 2 * m, ey + m); else ctx.rect(-m, ey, W + 2 * m, H - ey + m);
      ctx.clip();
    } else if (tr.type === "heart") {
      const s = heartSize(S, p);
      if (incoming) { pHeart(W / 2, H * 0.52, Math.max(1, s))(ctx); ctx.clip(); }
      else { ctx.rect(-m, -m, W + 2 * m, H + 2 * m); pHeart(W / 2, H * 0.52, Math.max(1, s))(ctx); ctx.clip("evenodd"); }
    }
  }
  // A wavy-edged ribbon band in its own frame: x across the band, y along it.
  function ribbonBand(ctx, th, x0, w, L, fill, t, seed, o = {}) {
    const u = th.u, amp = 9 * u;
    const path = (c) => {
      c.moveTo(x0 - w / 2 + Math.sin(-L / (70 * u) + t * 7 + seed) * amp, -L);
      for (let y = -L; y <= L; y += 24 * u) c.lineTo(x0 - w / 2 + Math.sin(y / (70 * u) + t * 7 + seed) * amp, y);
      for (let y = L; y >= -L; y -= 24 * u) c.lineTo(x0 + w / 2 + Math.sin(y / (70 * u) + t * 7 + seed + 1.3) * amp, y);
      c.closePath();
    };
    blob(ctx, th, path, fill, { sx: o.sh ?? 14 * u, sy: 0, lw: 6 * u, dots: o.dots ? [x0 - w, -L, w * 2, L * 2, 40 * u, 6 * u] : null, dotColor: "rgba(255,255,255,0.75)" });
    if (o.stitch) {
      ctx.save(); ctx.setLineDash([12 * u, 14 * u]); ctx.lineDashOffset = -t * 120 * u; ctx.lineWidth = 3.5 * u; ctx.strokeStyle = "rgba(255,255,255,0.9)";
      for (const sg of [-1, 1]) { ctx.beginPath(); for (let y = -L; y <= L; y += 24 * u) { const x = x0 + sg * (w / 2 - 16 * u) + Math.sin(y / (70 * u) + t * 7 + seed + (sg > 0 ? 1.3 : 0)) * amp; y === -L ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke(); }
      ctx.restore();
    }
  }
  function ribbonOver(ctx, S, th, tr, p, t) {
    const { W, H, u } = S;
    const g = ribbonGeom(S, tr, p);
    const L = H * 0.75 + 200 * u, ang = -Math.atan(g.slope);
    ctx.save(); ctx.translate(g.ex, H / 2); ctx.rotate(ang);
    // The trailing ribbon first, then the lead ribbon over the seam between the two scenes.
    ribbonBand(ctx, th, -g.sg * g.bw * 0.62, g.bw * 0.5, L, th.f.butter, t, 2, { stitch: true, sh: 10 * u });
    ribbonBand(ctx, th, g.sg * g.bw * 0.5, g.bw * 0.26, L, th.f.mint, t, 4, { sh: 6 * u });
    ribbonBand(ctx, th, 0, g.bw * 0.72, L, th.acc, t, 0, { dots: true });
    // Hearts and sparkles stream along the lead ribbon.
    for (let k = 0; k < 9; k++) {
      const y = -L + (((k / 9) * 2 * L + t * 520 * u) % (2 * L));
      if (k % 3 === 0) sparkle(ctx, th, 0, y, 26 * u * (0.8 + 0.2 * Math.sin(t * 9 + k)), th.f.butter, { line: true, rot: t * 2 + k });
      else heart(ctx, th, 0, y, 46 * u, k % 2 ? th.f.white : th.f.pink, { lw: 3.5 * u, gloss: false });
    }
    ctx.restore();
    // A star friend rides the ribbon across, sparkles trailing behind on the new scene's side.
    const ry = H * (tr.dir ? 0.66 : 0.34) + Math.sin(t * 5) * 18 * u, rx = g.ex + g.slope * (ry - H / 2);
    for (let k = 1; k <= 6; k++) {
      const tx = rx - g.sg * (g.bw * 0.5 + k * 56 * u), ty = ry + Math.sin(t * 6 + k) * 22 * u;
      sparkle(ctx, th, tx, ty, (30 - k * 3.5) * u * (0.7 + 0.3 * Math.sin(t * 10 + k)), k % 2 ? "#ffffff" : th.f.butter, { line: true, rot: t * 3 + k });
    }
    ctx.save(); ctx.translate(rx, ry); ctx.rotate(Math.sin(t * 7) * 0.2); ctx.translate(-rx, -ry);
    starBuddy(ctx, th, rx, ry, 84 * u, t, { seed: 6, color: th.f.butter, mood: "joy" });
    ctx.restore();
  }
  function cloudsOver(ctx, S, th, tr, p, t) {
    const { W, H, u } = S;
    const ey = cloudEdge(S, p), lw = 6 * u;
    const step = 150 * u, drift = (t * 60 * u) % step;
    const puffs = [];
    for (let k = -2; k < W / step + 3; k++) {
      const id = k + Math.floor(t * 60 * u / step) * 0;
      const x = k * step + drift * (tr.dir ? -1 : 1);
      puffs.push([x, ey - 70 * u + Math.sin(k * 1.7 + t * 3) * 14 * u, (120 + hash(k * 3.3) * 40) * u, 0]);
      puffs.push([x + step / 2, ey + 55 * u + Math.sin(k * 2.3 + t * 2.6) * 12 * u, (95 + hash(k * 5.1) * 30) * u, 1]);
    }
    const path = (c) => { for (const [x, y, r] of puffs) { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); } };
    ctx.save(); ctx.beginPath(); path(ctx); ctx.lineWidth = lw * 2; ctx.strokeStyle = th.line; ctx.lineJoin = "round"; ctx.stroke(); ctx.restore();
    ctx.save(); ctx.beginPath(); path(ctx); ctx.fillStyle = th.f.white; ctx.fill(); ctx.clip();
    ctx.fillStyle = shadeOf(th, th.f.white); ctx.beginPath();
    for (const [x, y, r, row] of puffs) if (row) { ctx.moveTo(x + r, y + r * 0.35); ctx.arc(x, y + r * 0.35, r, 0, TAU); }
    ctx.fill();
    ctx.fillStyle = th.f.lav; ctx.globalAlpha = 0.35; ctx.fillRect(-10 * u, ey + 120 * u, W + 20 * u, 200 * u); ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    for (const [x, y, r, row] of puffs) if (!row) { ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.5, r * 0.18, r * 0.08, -0.5, 0, TAU); ctx.fill(); }
    ctx.restore();
    // Sleepy and cheerful faces on some of the puffs; a rice-cake friend surfs the top of the bank.
    puffs.forEach(([x, y, r, row], i) => { if (!row && (i / 2) % 3 === 1 && x > -r && x < W + r) face(ctx, th, x, y + r * 0.1, r * 0.9, t, { mood: i % 4 ? "happy" : "joy", seed: 40 + i, eye: 0.07 }); });
    const mx = W * (tr.dir ? 0.7 : 0.3) + Math.sin(t * 2) * 30 * u;
    mochi(ctx, th, mx, ey - 150 * u, 130 * u, t, { color: th.f.pink, arms: "up", mood: "joy", seed: 11, hop: 0.2, hopRate: 2.4, shadow: false });
    // Hearts drizzle from the underside onto the old scene.
    for (let k = 0; k < 10; k++) {
      const ph = ((t * 1.6 + hash(k * 2.2)) % 1), x = hash(k * 7.9) * W + Math.sin(t * 3 + k) * 20 * u;
      const y = ey + 150 * u + ph * 260 * u;
      ctx.save(); ctx.globalAlpha *= clamp((1 - ph) * 2); heart(ctx, th, x, y, 34 * u, th.cycle[k % 6], { lw: 3 * u, gloss: false }); ctx.restore();
    }
  }
  function heartOver(ctx, S, th, tr, p, t) {
    const { W, H, u } = S;
    const s = heartSize(S, p), cx = W / 2, cy = H * 0.52;
    if (s < 4 * u) return;
    const w = Math.min(1, s / (300 * u));
    ctx.save(); ctx.beginPath(); pHeart(cx, cy, s)(ctx); ctx.lineJoin = "round";
    ctx.lineWidth = 64 * u * w; ctx.strokeStyle = th.line; ctx.stroke();
    ctx.lineWidth = 50 * u * w; ctx.strokeStyle = th.acc; ctx.stroke();
    ctx.lineWidth = 16 * u * w; ctx.strokeStyle = th.f.pink; ctx.setLineDash([1, 34 * u]); ctx.lineCap = "round"; ctx.lineDashOffset = -t * 160 * u;
    ctx.strokeStyle = "rgba(255,255,255,0.95)"; ctx.stroke();
    ctx.restore();
    // Sparkles and little hearts burst outward with the opening heart.
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * TAU + t * 0.8, rr = s * 0.36 + 40 * u + (k % 2) * 30 * u;
      const x = cx + Math.cos(a) * rr * 1.1, y = cy - s * 0.04 + Math.sin(a) * rr * 0.9;
      if (k % 2) sparkle(ctx, th, x, y, 26 * u * (0.7 + 0.3 * Math.sin(t * 9 + k)), k % 4 === 1 ? th.f.butter : "#ffffff", { line: true, rot: a });
      else heart(ctx, th, x, y, 44 * u, th.cycle[k % 6], { lw: 3.5 * u, gloss: false });
    }
  }
  // The one full bubble cover: bubbles roll in on a diagonal, wobble while they hold, then pop away
  // from the centre outward, each one swelling, shrinking and fading with a little burst.
  function bubblesOver(ctx, S, th, tr, t) {
    const { W, H, u } = S;
    const t0 = tr.B - tr.pre, hold0 = 0.08;
    const k = clamp((t - t0) / tr.pre), q = clamp((t - tr.B - hold0) / Math.max(0.05, tr.post - hold0));
    const cell = 180 * u, rowH = cell * 0.866;
    const cols = Math.ceil(W / cell) + 2, rows = Math.ceil(H / rowH) + 2;
    const dirX = tr.dir ? -1 : 1, half = Math.hypot(W / 2, H / 2);
    ctx.save();
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = (i - 0.5 + (j % 2) * 0.5) * cell, y = (j - 0.5) * rowH;
        const d = clamp(0.65 * (dirX > 0 ? x / W : 1 - x / W) + 0.35 * (y / H));
        const lin = seg(k, d * 0.6, d * 0.6 + 0.4);
        if (lin <= 0) continue;
        const dn = clamp(Math.hypot(x - W / 2, y - H / 2) / half);
        const lq = seg(q, dn * 0.62, dn * 0.62 + 0.38);
        if (lq >= 1) continue;
        const swell = 1 + 0.14 * Math.sin(Math.PI * clamp(lq / 0.35));
        const shrink = 1 - eio(seg(lq, 0.3, 1));
        const wob = 0.045 * Math.sin(t * 9 + i * 1.7 + j * 2.3);
        const r = cell * 0.63 * back(lin, 2.2) * swell * shrink;
        if (r < 2 * u) continue;
        const al = 1 - seg(lq, 0.5, 1);
        ctx.save(); ctx.globalAlpha *= al;
        const col = th.cycle[(i * 2 + j * 3) % th.cycle.length];
        const gx = Math.sin(t * 3 + i) * r * 0.05;
        blob(ctx, th, pEll(x, y, r * (1 + wob), r * (1 - wob)), col, { sx: r * 0.12, sy: r * 0.12, lw: 5 * u, gloss: [x - r * 0.38 + gx, y - r * 0.42, r * 0.16, r * 0.09, -0.7] });
        const kind = (i * 7 + j * 5) % 6, tw = 0.75 + 0.25 * Math.sin(t * 8 + i * 2 + j);
        if (r > cell * 0.3) {
          if (kind === 0) heart(ctx, th, x, y + r * 0.04, r * 0.5 * (0.92 + 0.08 * tw), th.f.white, { gloss: false });
          else if (kind === 3) sparkle(ctx, th, x, y, r * 0.36 * tw, th.f.white, { line: true, rot: Math.sin(t * 2 + i) * 0.3 });
          else if (kind === 5) { ctx.fillStyle = "rgba(255,255,255,0.65)"; for (let m = 0; m < 3; m++) { ctx.beginPath(); ctx.arc(x + (m - 1) * r * 0.3, y + r * 0.1 + Math.sin(t * 6 + m) * r * 0.03, r * 0.08, 0, TAU); ctx.fill(); } }
        }
        ctx.restore();
        if (lq > 0.3) { // the pop: short strokes flying out from the bubble's rim
          const pk = seg(lq, 0.3, 1), R0 = cell * 0.63 * (0.55 + 0.6 * eo(pk));
          ctx.save(); ctx.globalAlpha *= 1 - pk; ctx.strokeStyle = th.line; ctx.lineWidth = 6 * u; ctx.lineCap = "round"; ctx.beginPath();
          for (let m = 0; m < 6; m++) { const a = (m / 6) * TAU + i + j; ctx.moveTo(x + Math.cos(a) * R0, y + Math.sin(a) * R0); ctx.lineTo(x + Math.cos(a) * (R0 + 26 * u), y + Math.sin(a) * (R0 + 26 * u)); }
          ctx.stroke(); ctx.restore();
        }
      }
    }
    ctx.restore();
  }
  function overFor(ctx, S, th, tr, p, t) {
    if (tr.type === "ribbon") ribbonOver(ctx, S, th, tr, p, t);
    else if (tr.type === "clouds") cloudsOver(ctx, S, th, tr, p, t);
    else if (tr.type === "heart") heartOver(ctx, S, th, tr, p, t);
  }

  // ---- plan: which scenes play, so the last frame can rest on the closing ----------------------------
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  const DEF = { title_hold: 2.4, chart_hold: 3.4, object_hold: 3.6, people_hold: 3.2, process_hold: 3.6, compare_hold: 3.2, closing_hold: 2.4 };
  function ctl() { return (window.__dreamcut && window.__dreamcut.controls) || {}; }
  function plan() {
    const c = ctl();
    const shown = []; let at = 0;
    for (const id of ORDER) { const hold = Number(c[id + "_hold"] ?? DEF[id + "_hold"]); if (hold > 0) { shown.push({ id, start: at, hold }); at += hold; } }
    return { shown, length: at };
  }
  function dataOf() {
    const c = ctl();
    return {
      chart: { labels: [c.bar_1_label, c.bar_2_label, c.bar_3_label, c.bar_4_label], values: [c.bar_1, c.bar_2, c.bar_3, c.bar_4].map(Number), suffix: c.chart_suffix || "", prefix: "", highlight: Number(c.highlight ?? 4) - 1 },
      object: { kind: c.device, callouts: [c.callout_1, c.callout_2, c.callout_3] },
      people: { count: Number(c.people_count ?? 4), badges: [c.badge_1, c.badge_2, c.badge_3], highlight: 1 },
      process: { steps: [c.step_1, c.step_2, c.step_3] },
      compare: { left: c.before_label, leftValue: Number(c.before_value), right: c.after_label, rightValue: Number(c.after_value), suffix: c.compare_suffix || "", prefix: "" },
    };
  }
  function boxOf(S) {
    const { W, H, u, tall } = S;
    const side = (tall ? 90 : 140) * u;
    return tall ? { x: side, y: H * 0.3, w: W - side * 2, h: H * 0.6 } : { x: side, y: H * 0.34, w: W - side * 2, h: H * 0.58 };
  }

  // ---- statements -----------------------------------------------------------------------------------
  function statementText(S, id) {
    const el = document.getElementById(id);
    if (!el) return null;
    const u = S.u;
    return { text: el.textContent || "", size: Math.max(66 * u, parseFloat(el.style.fontSize) || 120 * u), maxW: parseFloat(el.style.width) || S.W - (S.tall ? 180 : 280) * u };
  }
  function titleArt(ctx, S, th, local, t) {
    const { W, H, u, tall } = S;
    const G = floorY(S);
    bunting(ctx, S, th, t, eo((local + 0.4) / 0.8));
    const T = statementText(S, "title");
    const lines = T ? balanced(ctx, S, T.text, T.size, T.maxW) : [];
    const kick = (document.getElementById("kicker") || {}).textContent || "";
    const kz = Math.max(42 * u, 44 * u);
    const lh = T ? T.size * 1.1 : 0;
    const blockH = lines.length * lh + (kick ? kz * 2.4 : 0);
    const cy = H * (tall ? 0.38 : 0.41);
    let y = cy - blockH / 2;
    band(ctx, S, th, t, local, y - 24 * u);
    // Cast first, so the words sit in front of everything; it shrinks when the words run low.
    cast(ctx, S, th, t, local, G, false, clamp((G - (y + blockH) - 30 * u) / (310 * u), 0.55, 1));
    if (kick) { tag(ctx, S, th, kick.toUpperCase(), W / 2, y + kz * 0.8, kz, { q: back(seg(local, -0.25, 0.3)), fill: th.acc, color: th.onAcc }); y += kz * 2.4; }
    if (T) chunky(ctx, S, th, lines, W / 2, y + T.size * 0.86, T.size, { align: "center", q: clamp((local + 0.22) / 0.95), t });
  }
  function closingArt(ctx, S, th, local, t) {
    const { W, H, u, tall } = S;
    const G = floorY(S);
    bunting(ctx, S, th, t, 1);
    confetti(ctx, S, th, t, local);
    const T = statementText(S, "closing");
    const lines = T ? balanced(ctx, S, T.text, T.size, T.maxW) : [];
    const lh = T ? T.size * 1.1 : 0;
    const cy = H * (tall ? 0.4 : 0.42);
    const y = cy - (lines.length * lh) / 2;
    band(ctx, S, th, t, local + 0.6, y - 24 * u);
    cast(ctx, S, th, t, local, G, true, clamp((G - (y + lines.length * lh) - 30 * u) / (330 * u), 0.55, 1));
    if (!T) return;
    chunky(ctx, S, th, lines, W / 2, y + T.size * 0.86, T.size, { align: "center", q: clamp((local - 0.05) / 0.85), t });
  }
  // The band between the bunting and the words: puffy cloud friends drift and hearts flutter down through it.
  function band(ctx, S, th, t, local, yBot) {
    const { W, u, tall } = S;
    const yTop = (tall ? 70 : 34) * u + (tall ? 90 : 80) * u * 0.55 + 84 * u;
    const hb = yBot - yTop;
    if (hb < 70 * u) return;
    const cloud = (x, y, w, i) => {
      const h = w * 0.5, lw = 4.5 * u;
      const puffs = [[-0.32, 0.12, 0.3], [-0.08, -0.12, 0.42], [0.22, -0.04, 0.36], [0.4, 0.16, 0.24], [0.02, 0.18, 0.3]];
      const path = (c) => { for (const [px, py, pr] of puffs) { c.moveTo(x + px * w + pr * w, y + py * w); c.arc(x + px * w, y + py * w, pr * w, 0, TAU); } };
      ctx.save(); ctx.beginPath(); path(ctx); ctx.lineWidth = lw * 2; ctx.strokeStyle = th.line; ctx.lineJoin = "round"; ctx.stroke(); ctx.restore();
      ctx.save(); ctx.beginPath(); path(ctx); ctx.fillStyle = th.f.white; ctx.fill(); ctx.clip();
      ctx.fillStyle = shadeOf(th, th.f.white); ctx.beginPath(); ctx.ellipse(x + w * 0.06, y + h * 0.62, w * 0.62, h * 0.3, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.beginPath(); ctx.ellipse(x - w * 0.14, y - w * 0.36, w * 0.1, w * 0.045, -0.5, 0, TAU); ctx.fill();
      ctx.restore();
      face(ctx, th, x + w * 0.02, y + w * 0.06, w * 0.62, t, { mood: i % 2 ? "joy" : "happy", seed: 30 + i, eye: 0.075 });
    };
    // Clouds hang below the bunting's sag wherever they drift, and shrink to fit above the words.
    const y0 = (tall ? 70 : 34) * u, sag = (tall ? 90 : 80) * u;
    const buntBottom = (x) => { const k = clamp((x + 30 * u) / (W + 60 * u)); return y0 + 4 * (sag + 6 * u) * k * (1 - k) + 90 * u; };
    const xs = tall ? [] : [0.12, 0.35, 0.65, 0.88]; // tall frames keep the star sprites there instead
    xs.forEach((fx, i) => {
      const qi = back(seg(local + 0.3, 0.15 + i * 0.1, 0.6 + i * 0.1));
      if (qi <= 0) return;
      const x = fx * W + Math.sin(t * 0.5 + i * 1.9) * 34 * u;
      const bb = buntBottom(x) + 10 * u;
      const w = Math.min(190 * u, (yBot - bb) / 1.08) * (i % 2 ? 0.86 : 1);
      if (w < 80 * u) return;
      const y = bb + w * 0.56 + (Math.sin(t * 1.3 + i) * 0.5 + 0.5) * Math.max(0, Math.min(14 * u, yBot - bb - w * 1.06));
      ctx.save(); pop(ctx, qi, x, y); cloud(x, y, w, i); ctx.restore();
    });
    for (let i = 0; i < 14; i++) {
      const sp = 0.32 + hash(i * 2.9) * 0.3, ph = (t * sp + hash(i * 7.3)) % 1;
      const y = yTop - 20 * u + ph * (hb + 40 * u), x = hash(i * 4.7) * W + Math.sin(t * 1.7 + i) * 26 * u;
      ctx.save(); ctx.globalAlpha *= clamp(ph * 5) * clamp((1 - ph) * 4) * clamp(local * 2 + 0.4);
      if (i % 3) heart(ctx, th, x, y, (22 + hash(i) * 14) * u, th.cycle[i % th.cycle.length], { lw: 3 * u, gloss: false });
      else sparkle(ctx, th, x, y, 14 * u, th.f.butter, { line: true, rot: t + i });
      ctx.restore();
    }
  }
  function confetti(ctx, S, th, t, local) {
    const { W, H, u } = S;
    const n = 46;
    for (let i = 0; i < n; i++) {
      const sp = 120 + hash(i * 1.7) * 160;
      const start = hash(i * 9.1) * 1.4;
      const tt = local - start * 0.6;
      const y = -60 * u + ((tt * sp * u + hash(i * 3.3) * H) % (H + 120 * u));
      if (tt < -0.6) continue;
      const x = hash(i * 5.3) * W + Math.sin(t * 2 + i) * 30 * u;
      const col = th.cycle[i % th.cycle.length];
      const kind = i % 3, rot = t * (1 + hash(i) * 3) + i;
      if (kind === 0) sparkle(ctx, th, x, y, 16 * u, col, { line: true, rot });
      else if (kind === 1) heart(ctx, th, x, y, 30 * u, col, { lw: 3.5 * u });
      else { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); blob(ctx, th, pRR(-14 * u, -7 * u, 28 * u, 14 * u, 7 * u), col, { cel: false, lw: 3.5 * u }); ctx.restore(); }
    }
  }
  // The recurring cast on the meadow: they pop up for the title and cheer at the close.
  function cast(ctx, S, th, t, local, G, cheer, cs = 1) {
    const { W, u, tall } = S;
    const q = (i) => back(seg(local + 0.35, i * 0.09, i * 0.09 + 0.55));
    // Second beat on the title: once the words land, a hop runs along the crew left to right, each one
    // puffing a heart at the top of their jump.
    const order = tall ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 6, 3, 4, 5];
    const put = (i, x, fn) => {
      const qi = q(i); if (qi <= 0) return;
      const hp = cheer ? 0 : seg(local, 0.95 + order.indexOf(i) * 0.15, 1.33 + order.indexOf(i) * 0.15), hk = bump(hp);
      ctx.save(); pop(ctx, qi * cs, x, G);
      if (hp > 0 && hp < 1) { const sq = Math.max(0, -Math.cos(hp * TAU)) * (1 - hk); ctx.translate(x, G); ctx.scale(1 + 0.08 * sq, 1 - 0.08 * sq); ctx.translate(-x, -G); ctx.translate(0, -hk * 70 * u); }
      fn(); ctx.restore();
      if (hp > 0.35 && hp < 1) { const hq2 = seg(hp, 0.35, 1); ctx.save(); ctx.globalAlpha *= clamp((1 - hq2) * 2.5); heart(ctx, th, x + 30 * u * cs, G - (330 + hq2 * 110) * u * cs, 40 * u * back(seg(hq2, 0, 0.4)), i % 2 ? th.acc : th.f.pink, { lw: 3.5 * u }); ctx.restore(); }
    };
    if (tall) {
      put(0, W * 0.2, () => clapper(ctx, th, W * 0.2, G, 200 * u, t, { seed: 1, mood: cheer ? "joy" : "happy" }));
      put(1, W * 0.5, () => chibi(ctx, th, W * 0.5, G + 4 * u, 360 * u, t, { k: 1, hair: 1, wave: !cheer, cheer, hop: cheer ? 0.6 : 0, mood: cheer ? "joy" : "happy", seed: 2 }));
      put(2, W * 0.8, () => mochi(ctx, th, W * 0.8, G, 170 * u, t, { color: th.f.pink, hop: cheer ? 0.3 : 0.08, arms: cheer ? "up" : "wave", mood: cheer ? "joy" : "happy", seed: 3 }));
      const R = 74 * u;
      put(3, W * 0.78, () => starBuddy(ctx, th, W * 0.78, S.H * 0.18, R, t, { seed: 2 }));
      put(4, W * 0.2, () => starBuddy(ctx, th, W * 0.22, S.H * 0.22, R * 0.75, t, { seed: 5, color: th.f.pink, mood: "joy" }));
      put(5, W * 0.5, () => heart(ctx, th, W * 0.5 + Math.sin(t * 1.4) * 30 * u, S.H * 0.6 + Math.sin(t * 2) * 10 * u, 56 * u, th.acc));
      return;
    }
    put(0, W * 0.1, () => clapper(ctx, th, W * 0.1, G, 190 * u, t, { seed: 1, mood: cheer ? "joy" : "happy" }));
    put(1, W * 0.23, () => chibi(ctx, th, W * 0.23, G + 4 * u, 300 * u, t, { k: 0, hair: 0, wave: !cheer, cheer, hop: cheer ? 0.5 : 0, mood: cheer ? "joy" : "happy", seed: 2 }));
    put(2, W * 0.345, () => mochi(ctx, th, W * 0.345, G, 140 * u, t, { color: th.f.pink, hop: cheer ? 0.35 : 0.1, arms: cheer ? "up" : null, mood: cheer ? "joy" : "happy", seed: 3 }));
    put(3, W * 0.655, () => mochi(ctx, th, W * 0.655, G, 150 * u, t, { color: th.f.mint, hop: cheer ? 0.3 : 0, arms: "wave", mood: "happy", seed: 6 }));
    put(4, W * 0.77, () => chibi(ctx, th, W * 0.77, G + 4 * u, 300 * u, t, { k: 3, hair: 4, cheer, hop: cheer ? 0.5 : 0, mood: cheer ? "joy" : "happy", seed: 8 }));
    put(5, W * 0.9, () => chibi(ctx, th, W * 0.9, G + 4 * u, 270 * u, t, { k: 2, hair: 3, wave: true, mood: "happy", seed: 9 }));
    put(6, W * 0.5, () => starBuddy(ctx, th, W * 0.5, G - 70 * u, 58 * u, t, { seed: 3, color: th.f.butter, mood: cheer ? "joy" : "happy" }));
  }

  // ---- scenes ---------------------------------------------------------------------------------------
  function area(S, box) { const u = S.u; return { x: box.x, y: box.y - 10 * u, w: box.w, h: floorY(S) - box.y + 10 * u }; }

  // Bars are jelly towers with faces; a blob rides the highlighted one; a sticker badge shows its value.
  function chartScene(ctx, S, th, A, b, d, t) {
    const u = S.u, tall = S.tall, G = floorY(S);
    const vals = d.values.map((v) => (Number.isFinite(v) ? v : 0));
    const n = vals.length, max = Math.max(...vals, 1);
    const hot = clamp(d.highlight, 0, n - 1);
    const bars = tall ? { x: A.x, w: A.w, top: A.y + A.h * 0.42 } : { x: A.x, w: A.w * 0.6, top: A.y + 110 * u };
    const slot = bars.w / n, bw = slot * 0.6;
    const maxH = G - bars.top;
    // Shelf the towers stand on.
    blob(ctx, th, pRR(bars.x - 10 * u, G - 6 * u, bars.w + 20 * u, 30 * u, 15 * u), th.f.cream, { sx: 0, sy: 8 * u, lw: 4.5 * u });
    const tops = [];
    const cyc = [th.f.mint, th.f.lav, th.f.sky, th.f.butter, th.f.peach];
    const m = FRAME.m;
    const reactP = (i) => seg(m, 0.02 + i * 0.13, 0.3 + i * 0.13);
    vals.forEach((v, i) => {
      const q = eo(seg(b, 0.04 + i * 0.1, 0.5 + i * 0.1));
      const rp = reactP(i), rc = bump(rp);
      // Second beat: each tower stretches up in turn, gasps, and puffs a heart.
      const wob = (1 + 0.014 * Math.sin(t * 3.2 + i * 1.3)) * (1 + 0.2 * rc * Math.cos(rp * Math.PI * 0.6));
      const hgt = Math.max(0, maxH * (v / max) * q * wob - (i === hot ? 120 * u * q : 0) * 0);
      const w = bw / Math.sqrt(wob);
      const x = bars.x + slot * (i + 0.5) - w / 2, y0 = G - hgt;
      tops.push([x + w / 2, y0]);
      if (hgt < 4 * u) return;
      const rad = Math.min(w * 0.42, hgt);
      const col = i === hot ? th.acc : cyc[i % cyc.length];
      const path = (c) => { c.moveTo(x, G); c.lineTo(x, y0 + rad); c.arcTo(x, y0, x + rad, y0, rad); c.lineTo(x + w - rad, y0); c.arcTo(x + w, y0, x + w, y0 + rad, rad); c.lineTo(x + w, G); c.closePath(); };
      blob(ctx, th, path, col, { sx: w * 0.13, sy: 0, dots: [x, y0, w, hgt, w * 0.3, w * 0.045], dotColor: "rgba(255,255,255,0.32)" });
      ctx.save(); ctx.beginPath(); path(ctx); ctx.clip();
      blob(ctx, th, pRR(x + w * 0.12, y0 + rad * 0.55, w * 0.1, Math.max(0, hgt - rad * 0.9), w * 0.05), "rgba(255,255,255,0.6)", { cel: false, line: false });
      ctx.restore();
      if (hgt > w * 0.75) face(ctx, th, x + w / 2, y0 + Math.min(hgt * 0.42, w * 0.5), w * 0.82, t, { mood: rc > 0.25 ? "wow" : i === hot ? "happy" : "joy", seed: i * 2, eye: 0.08 });
      if (rp > 0 && rp < 1) {
        const hy2 = y0 - 40 * u - eo(rp) * 120 * u;
        ctx.save(); ctx.globalAlpha *= clamp((1 - rp) * 3);
        heart(ctx, th, x + w + 18 * u + Math.sin(rp * 9) * 8 * u, hy2, 40 * u * back(seg(rp, 0, 0.35)), i === hot ? th.f.pink : th.acc, { lw: 3.5 * u });
        sparkle(ctx, th, x - 16 * u, y0 - 20 * u - eo(rp) * 60 * u, 16 * u * rc, th.f.butter, { line: true });
        ctx.restore();
      }
      const tq = back(seg(q, 0.15, 0.5));
      if (i !== hot) tag(ctx, S, th, fmt(v * q, v, d), x + w / 2, y0 - 64 * u, 44 * u, { q: tq, max: slot * 0.98 });
      const lab = d.labels[i] || "";
      const labQ = back(seg(b, 0.2 + i * 0.05, 0.42 + i * 0.05));
      if (lab && labQ > 0) { ctx.save(); pop(ctx, labQ, x + w / 2, G + 52 * u); chunky(ctx, S, th, [lab], x + w / 2, G + 66 * u, 42 * u, { align: "center", fill: th.line, outline: "#ffffff", dropColor: null, stroke: 0.24 }); ctx.restore(); }
    });
    // A dotted arrow drawn from the first tower to the highlight.
    if (hot > 0 && tops[hot] && !tall) {
      const a = tops[0], z = tops[hot];
      const p0 = [a[0], a[1] - 110 * u], p2 = [z[0] - bw * 0.2, z[1] - 150 * u];
      const p1 = [(p0[0] + p2[0]) / 2, Math.min(p0[1], p2[1]) - 120 * u];
      const qa = eo(seg(b, 0.55, 0.85));
      if (qa > 0) {
        ctx.save(); ctx.beginPath();
        for (let s = 0; s <= qa + 1e-4; s += 0.02) { const m = 1 - s; const px = m * m * p0[0] + 2 * m * s * p1[0] + s * s * p2[0], py = m * m * p0[1] + 2 * m * s * p1[1] + s * s * p2[1]; s === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
        ctx.setLineDash([1, 20 * u]); ctx.lineDashOffset = -t * 50 * u; ctx.lineCap = "round"; ctx.lineWidth = 11 * u; ctx.strokeStyle = th.line; ctx.stroke();
        ctx.restore();
        if (qa > 0.95) heart(ctx, th, p2[0], p2[1] + 12 * u, 40 * u * back(seg(b, 0.8, 0.95)), th.acc);
      }
    }
    // The rider on the highlighted tower.
    const ht = tops[hot];
    const rq = back(seg(b, 0.55, 0.8));
    if (ht && rq > 0) { ctx.save(); pop(ctx, rq, ht[0], ht[1]); mochi(ctx, th, ht[0], ht[1] + 2 * u, Math.min(bw * 0.8, 130 * u), t, { color: th.f.white, hop: 0.22, arms: "up", mood: "joy", seed: 5, lift: bump(seg(m, 0.42 + hot * 0.02, 0.72)) * 90 * u }); ctx.restore(); }
    // The sticker badge.
    const bd = tall ? { cx: A.x + A.w / 2, cy: A.y + A.h * 0.17, r: Math.min(A.w * 0.3, A.h * 0.16) } : { cx: A.x + A.w * 0.82, cy: A.y + A.h * 0.44, r: Math.min(A.w * 0.17, A.h * 0.36) };
    const bq = back(seg(b, 0.35, 0.7));
    if (bq > 0) {
      const { cx, cy, r } = bd;
      // Second beat: once the towers have reacted, the badge squash-pops and throws sparkles.
      const kp = seg(m, 0.6, 0.92), wob2 = Math.sin(kp * Math.PI * 3) * (1 - kp) * (kp > 0 && kp < 1 ? 1 : 0);
      if (kp > 0 && kp < 1) {
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * TAU + 0.3, rr = r * (1.05 + eo(kp) * 0.75);
          ctx.save(); ctx.globalAlpha *= clamp((1 - kp) * 2.5);
          if (k % 2) heart(ctx, th, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 30 * u, th.acc, { lw: 3 * u, gloss: false });
          else sparkle(ctx, th, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 20 * u, th.f.butter, { line: true, rot: a });
          ctx.restore();
        }
      }
      ctx.save(); pop(ctx, bq, cx, cy); ctx.translate(cx, cy); ctx.rotate(Math.sin(t * 0.9) * 0.05); ctx.scale((1 + 0.2 * wob2) * (1 + 0.1 * bump(kp)), (1 - 0.16 * wob2) * (1 + 0.1 * bump(kp))); ctx.translate(-cx, -cy);
      for (let k = 0; k < 5; k++) { const a = t * 0.7 + (k / 5) * TAU; sparkle(ctx, th, cx + Math.cos(a) * r * 1.3, cy + Math.sin(a) * r * 1.15, r * 0.1 * (0.7 + 0.3 * Math.sin(t * 4 + k)), k % 2 ? th.f.white : th.f.butter, { line: true, rot: a }); }
      blob(ctx, th, pScallop(cx, cy, r, 18, t * 0.15, 0.06), th.f.butter, { sx: r * 0.06, sy: r * 0.06, gloss: [cx - r * 0.5, cy - r * 0.55, r * 0.12, r * 0.06, -0.7] });
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r * 0.82, 0, TAU); ctx.setLineDash([12 * u, 12 * u]); ctx.lineDashOffset = t * 20 * u; ctx.lineWidth = 4 * u; ctx.strokeStyle = th.line; ctx.stroke(); ctx.restore();
      const hv = vals[hot];
      const nq = eo(seg(b, 0.04 + hot * 0.1, 0.5 + hot * 0.1));
      const numZ = Math.max(96 * u, Math.min(r * 0.62, 150 * u));
      const num = fmt(hv * nq, hv, d);
      const nz = Math.min(numZ, (r * 1.5) / Math.max(1, textW(ctx, S, num, 1) * 1.06));
      chunky(ctx, S, th, [num], cx, cy + nz * 0.3, Math.max(96 * u, nz), { align: "center", fill: th.acc, q: 1, t });
      tag(ctx, S, th, d.labels[hot] || "", cx, cy - r * 0.52, 42 * u, { q: back(seg(b, 0.45, 0.75)), max: r * 1.4 });
      ctx.restore();
    }
  }

  // The device is a character too: a laptop (or phone) with a little face, an editor playing on its
  // screen and speech-bubble callouts tied to its parts.
  function screenUI(ctx, S, th, x, y, w, h, t, b, vertical) {
    const u = S.u;
    ctx.save(); ctx.beginPath(); pRR(x, y, w, h, 16 * u)(ctx); ctx.clip();
    ctx.fillStyle = th.screen; ctx.fillRect(x, y, w, h);
    const pv = vertical ? { x: x + w * 0.07, y: y + h * 0.06, w: w * 0.86, h: h * 0.4 } : { x: x + w * 0.05, y: y + h * 0.07, w: w * 0.9, h: h * 0.5 };
    // Preview: a tiny world playing.
    ctx.save(); ctx.beginPath(); pRR(pv.x, pv.y, pv.w, pv.h, 12 * u)(ctx); ctx.clip();
    const g = ctx.createLinearGradient(0, pv.y, 0, pv.y + pv.h); g.addColorStop(0, th.f.sky); g.addColorStop(1, th.f.white);
    ctx.fillStyle = g; ctx.fillRect(pv.x, pv.y, pv.w, pv.h);
    const rr0 = pv.h * 0.5;
    ctx.save(); ctx.globalAlpha = 0.5; for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.arc(pv.x + pv.w * 0.5, pv.y + pv.h * 1.05, rr0 * (1.25 - k * 0.12), Math.PI, TAU); ctx.lineWidth = rr0 * 0.12; ctx.strokeStyle = th.cycle[k]; ctx.stroke(); } ctx.restore();
    const sunX = pv.x + pv.w * 0.78, sunY = pv.y + pv.h * 0.3 + Math.sin(t * 1.6) * 4 * u;
    starBuddy(ctx, th, sunX, sunY, pv.h * 0.16, t, { seed: 11 });
    blob(ctx, th, (c) => { c.moveTo(pv.x - 10 * u, pv.y + pv.h + 10 * u); c.quadraticCurveTo(pv.x + pv.w * 0.3, pv.y + pv.h * 0.55, pv.x + pv.w * 0.62, pv.y + pv.h * 0.82); c.quadraticCurveTo(pv.x + pv.w * 0.85, pv.y + pv.h * 0.7, pv.x + pv.w + 10 * u, pv.y + pv.h * 0.85); c.lineTo(pv.x + pv.w + 10 * u, pv.y + pv.h + 10 * u); c.closePath(); }, th.f.mint, { sx: 6 * u, sy: 0, lw: 4 * u });
    const m = FRAME.m, sw = seg(m, 0.12, 0.58), land = seg(m, 0.58, 0.9);
    const hx = pv.x + pv.w * (0.3 + 0.08 * Math.sin(t * 1.1));
    mochi(ctx, th, hx, pv.y + pv.h * 0.86, pv.h * 0.3, t, { color: th.f.pink, hop: 0.4, hopRate: 1.8, seed: 9, sprout: true, lift: bump(land) * pv.h * 0.32, mood: land > 0 && land < 1 ? "joy" : "happy" });
    ctx.restore();
    blob(ctx, th, pRR(pv.x, pv.y, pv.w, pv.h, 12 * u), "rgba(0,0,0,0)", { cel: false, lw: 4 * u });
    // Tracks of clips; one proposed clip in the accent; a heart playhead sweeping.
    const tr = vertical ? { x: x + w * 0.07, y: pv.y + pv.h + h * 0.06, w: w * 0.86, h: h * 0.36 } : { x: x + w * 0.05, y: pv.y + pv.h + h * 0.07, w: w * 0.9, h: h * 0.3 };
    const rows = 3, rh = tr.h / rows * 0.7;
    const clips = [[[0, 0.3], [0.34, 0.3], [0.68, 0.32]], [[0.06, 0.4], [0.5, 0.42]], [[0, 0.55], [0.6, 0.4]]];
    const anchors = [];
    // Second beat: the proposed clip lifts out of its slot and trades places with the next clip while the
    // playhead sweeps across, then lands with a sparkle and the preview reacts.
    for (let r0 = 0; r0 < rows; r0++) {
      const ry0 = tr.y + r0 * (tr.h / rows);
      (r0 === 0 ? [0, 2, 1] : clips[r0].map((_, i) => i)).forEach((i) => {
        let [c0, cw] = clips[r0][i];
        const sq = eo(seg(b, 0.05 + r0 * 0.08 + i * 0.05, 0.35 + r0 * 0.08 + i * 0.05));
        if (sq <= 0) return;
        const prop = r0 === 0 && i === 1;
        let ry = ry0;
        if (prop) { c0 = lerp(0.34, 0.7, eio(sw)); ry -= bump(sw) * rh * 1.8; }
        else if (r0 === 0 && i === 2) { c0 = lerp(0.68, 0.34, eio(sw)); ry += bump(sw) * rh * 0.2; }
        const cx = tr.x + tr.w * c0, cwid = tr.w * cw * sq;
        const col = prop ? th.acc : [th.f.lav, th.f.mint, th.f.peach][r0];
        const pulse = prop ? 1 + 0.04 * Math.sin(t * 5) : 1;
        ctx.save(); pop(ctx, pulse, cx + cwid / 2, ry + rh / 2);
        blob(ctx, th, pRR(cx, ry, cwid, rh, rh / 2), col, { sx: 4 * u, sy: 3 * u, lw: 4 * u, dots: prop ? [cx, ry, cwid, rh, rh * 0.55, rh * 0.09] : null });
        ctx.restore();
        if (prop) anchors[1] = [cx + cwid / 2, ry + rh / 2];
        if (r0 === 2 && i === 0) anchors[2] = [cx + cwid * 0.4, ry + rh / 2];
        if (prop && land > 0 && land < 1) {
          for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU, rr = rh * (0.6 + eo(land) * 1.1); sparkle(ctx, th, cx + cwid / 2 + Math.cos(a) * (cwid * 0.3 + rr), ry + rh / 2 + Math.sin(a) * rr, rh * 0.32 * (1 - land), k % 2 ? th.f.butter : "#ffffff", { line: true, rot: a }); }
        }
      });
    }
    const ph = tr.x + tr.w * ((0.02 + 0.96 * seg(m, 0.05, 0.85) + FRAME.after * 0.2) % 1);
    ctx.save(); ctx.beginPath(); ctx.moveTo(ph, tr.y - 8 * u); ctx.lineTo(ph, tr.y + tr.h); ctx.lineWidth = 4 * u; ctx.strokeStyle = th.line; ctx.lineCap = "round"; ctx.stroke(); ctx.restore();
    heart(ctx, th, ph, tr.y - 14 * u, 30 * u, th.acc, { lw: 3.5 * u });
    ctx.restore();
    anchors[0] = [pv.x + pv.w * 0.62, pv.y + pv.h * 0.4];
    anchors[1] = anchors[1] || [tr.x + tr.w * 0.5, tr.y + rh / 2];
    anchors[2] = anchors[2] || [tr.x + tr.w * 0.2, tr.y + tr.h * 0.8];
    return anchors;
  }
  function bubbleCallout(ctx, S, th, label, bx, by, bw, size, q, side, col, iconK, t) {
    const u = S.u;
    if (q <= 0) return null;
    const lines = wrapLines(ctx, S, label, size, bw - size * 2.6);
    const lh = size * 1.12;
    const h = lines.length * lh + size * 1.0;
    const w = Math.min(bw, Math.max(...lines.map((l) => textW(ctx, S, l, size))) + size * 2.9);
    const x = side === "left" ? bx : bx - w / 2, y = by - h / 2;
    const tail = side === "left" ? [x, by] : [x + w * 0.3, y];
    ctx.save(); pop(ctx, q, tail[0], tail[1]);
    const path = (c) => {
      pRR(x, y, w, h, Math.min(h / 2, 34 * u))(c);
      if (side === "left") { c.moveTo(x + 4 * u, by - 18 * u); c.lineTo(x - 26 * u, by + 4 * u); c.lineTo(x + 4 * u, by + 18 * u); c.closePath(); }
      else { c.moveTo(x + w * 0.3 - 18 * u, y + 4 * u); c.lineTo(x + w * 0.3 - 4 * u, y - 26 * u); c.lineTo(x + w * 0.3 + 18 * u, y + 4 * u); c.closePath(); }
    };
    blob(ctx, th, pRR(x, y + 8 * u, w, h, Math.min(h / 2, 34 * u)), rgba(rgb(th.line), 0.25), { cel: false, line: false });
    ctx.save(); ctx.beginPath(); path(ctx); ctx.lineWidth = th.lw * 2; ctx.strokeStyle = th.line; ctx.lineJoin = "round"; ctx.stroke(); ctx.restore();
    blob(ctx, th, path, col, { sx: 0, sy: 7 * u, line: false });
    // Icon chip.
    const ir = size * 0.62, ix = x + size * 0.5 + ir, iy = y + h / 2;
    blob(ctx, th, pEll(ix, iy, ir, ir), th.f.white, { cel: false, lw: 4 * u });
    ctx.save(); ctx.fillStyle = th.line; ctx.strokeStyle = th.line; ctx.lineWidth = 4 * u; ctx.lineJoin = "round"; ctx.lineCap = "round";
    if (iconK === 0) { ctx.beginPath(); ctx.moveTo(ix - ir * 0.25, iy - ir * 0.38); ctx.lineTo(ix + ir * 0.42, iy); ctx.lineTo(ix - ir * 0.25, iy + ir * 0.38); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    else if (iconK === 1) sparkle(ctx, th, ix, iy, ir * 0.62 * (0.85 + 0.15 * Math.sin(t * 5)), th.acc, { line: true });
    else { ctx.strokeRect(ix - ir * 0.5, iy - ir * 0.34, ir, ir * 0.68); for (let k = 0; k < 3; k++) ctx.fillRect(ix - ir * 0.42 + k * ir * 0.33, iy - ir * 0.2, ir * 0.16, ir * 0.4); }
    ctx.restore();
    ctx.font = fnt(S, size); ctx.fillStyle = th.line; ctx.textBaseline = "middle"; ctx.textAlign = "left";
    lines.forEach((l, i) => ctx.fillText(l, ix + ir + size * 0.45, y + size * 0.5 + lh * (i + 0.5) + size * 0.04));
    ctx.restore();
    return tail;
  }
  function objectScene(ctx, S, th, A, b, d, t) {
    const u = S.u, tall = S.tall, G = floorY(S);
    const phone = d.kind === "phone";
    const dev = tall ? { x: A.x, y: A.y, w: A.w, h: A.h * 0.5 } : { x: A.x, y: A.y, w: A.w * 0.56, h: A.h };
    const dq = back(seg(b, 0, 0.22), 1.4);
    let anchors, devRect = null;
    const devBottom = tall ? dev.y + dev.h : G;
    ctx.save(); pop(ctx, 0.85 + 0.15 * dq, dev.x + dev.w / 2, devBottom);
    if (tall && phone) blob(ctx, th, pRR(dev.x + dev.w * 0.08, devBottom - 4 * u, dev.w * 0.84, 34 * u, 17 * u), th.f.cream, { sx: 0, sy: 8 * u, lw: 4.5 * u });
    if (phone) {
      const ph = Math.min(dev.h - 80 * u, (tall ? dev.h : dev.h) * 0.98), pw = ph * 0.52;
      const px = dev.x + dev.w / 2 - pw / 2, py = devBottom - 40 * u - ph;
      for (const sg of [-1, 1]) blob(ctx, th, pRR(dev.x + dev.w / 2 + sg * pw * 0.22 - 14 * u, py + ph - 10 * u, 28 * u, 52 * u, 12 * u), th.f.lav, { cel: false, lw: 4 * u });
      mochi(ctx, th, px + pw * 0.95, py + 40 * u, 110 * u, t, { color: th.f.mint, hop: 0.12, seed: 4, arms: "wave" });
      blob(ctx, th, pRR(px, py, pw, ph, pw * 0.16), th.f.white, { sx: pw * 0.05, sy: pw * 0.04, gloss: [px + pw * 0.15, py + ph * 0.08, pw * 0.05, ph * 0.02, -0.4] });
      blob(ctx, th, pRR(px + pw * 0.36, py + ph * 0.025, pw * 0.28, ph * 0.025, ph * 0.0125), th.line, { cel: false, line: false });
      anchors = screenUI(ctx, S, th, px + pw * 0.07, py + ph * 0.07, pw * 0.86, ph * 0.74, t, b, true);
      devRect = [px, py, pw, ph];
      face(ctx, th, px + pw / 2, py + ph * 0.89, pw * 0.5, t, { seed: 12, eye: 0.06 });
    } else {
      const lidW = Math.min(dev.w * 0.92, (devBottom - dev.y + 10 * u) / 0.74), lidH = lidW * 0.66;
      const lx = dev.x + (dev.w - lidW) / 2, ly = devBottom - 44 * u - lidH;
      mochi(ctx, th, lx + lidW * 0.88, ly + 26 * u, 120 * u, t, { color: th.f.mint, hop: 0.12, seed: 4, arms: "wave" });
      blob(ctx, th, pRR(lx, ly, lidW, lidH, 34 * u), th.f.white, { sx: 12 * u, sy: 10 * u, gloss: [lx + lidW * 0.08, ly + lidH * 0.08, lidW * 0.03, lidH * 0.02, -0.4] });
      anchors = screenUI(ctx, S, th, lx + 24 * u, ly + 24 * u, lidW - 48 * u, lidH - 96 * u, t, b, false);
      face(ctx, th, lx + lidW / 2, ly + lidH - 44 * u, 210 * u, t, { seed: 12, eye: 0.075 });
      devRect = [lx, ly, lidW, lidH];
      const deck = (c) => { c.moveTo(lx - lidW * 0.07, devBottom - 6 * u); c.lineTo(lx + lidW * 1.07, devBottom - 6 * u); c.lineTo(lx + lidW, devBottom - 44 * u); c.lineTo(lx, devBottom - 44 * u); c.closePath(); };
      blob(ctx, th, deck, th.f.lav, { sx: 0, sy: -8 * u });
      ctx.save(); ctx.fillStyle = rgba(rgb(th.line), 0.35); for (let k = 0; k < 14; k++) { ctx.beginPath(); ctx.arc(lx + lidW * (0.12 + k * 0.058), devBottom - 26 * u, 4 * u, 0, TAU); ctx.fill(); } ctx.restore();
    }
    ctx.restore();
    // Callouts.
    const cols = [th.f.pink, th.f.mint, th.f.lav];
    const size = 44 * u;
    d.callouts.forEach((label, i) => {
      if (!label) return;
      const c = back(seg(b, 0.3 + i * 0.14, 0.62 + i * 0.14));
      // Second beat: each bubble hops in turn as the playhead reaches its part.
      const cb = bump(seg(FRAME.m, 0.2 + i * 0.24, 0.48 + i * 0.24));
      const bob = Math.sin(t * 2 + i * 1.6) * 6 * u - cb * 46 * u;
      let bx, by, side;
      if (tall) { bx = A.x + 60 * u; by = dev.y + dev.h + 130 * u + i * (A.h * 0.5 - 150 * u) / 3 + 40 * u + bob; side = "left"; }
      else { bx = A.x + A.w * 0.62; by = A.y + A.h * (0.15 + i * 0.32) + bob; side = "left"; }
      const tailAt = tall ? [bx - 26 * u, by] : [bx - 26 * u, by];
      const lq = eo(seg(b, 0.25 + i * 0.14, 0.5 + i * 0.14));
      const an = anchors[i];
      if (lq > 0 && an && !tall) {
        ctx.save();
        if (devRect) { ctx.beginPath(); ctx.rect(-1e4, -1e4, 2e4, 2e4); pRR(devRect[0] - 2 * u, devRect[1] - 2 * u, devRect[2] + 4 * u, devRect[3] + 4 * u, 34 * u)(ctx); ctx.clip("evenodd"); }
        ctx.beginPath();
        const ex = lerp(an[0], tailAt[0], lq), ey = lerp(an[1], tailAt[1], lq);
        if (tall) { ctx.moveTo(an[0], an[1]); ctx.quadraticCurveTo(an[0], lerp(an[1], ey, 0.8), ex, ey); }
        else { ctx.moveTo(an[0], an[1]); ctx.quadraticCurveTo(lerp(an[0], ex, 0.6), an[1], ex, ey); }
        ctx.setLineDash([1, 18 * u]); ctx.lineDashOffset = -t * 40 * u; ctx.lineCap = "round"; ctx.lineWidth = 10 * u; ctx.strokeStyle = th.line; ctx.stroke();
        ctx.restore();
        const pr = 1 + 0.18 * Math.sin(t * 5 + i);
        blob(ctx, th, pEll(an[0], an[1], 13 * u * pr, 13 * u * pr), th.acc, { cel: false, lw: 4 * u });
      }
      bubbleCallout(ctx, S, th, label, bx, by, tall ? A.w - 80 * u : A.w * 0.38, size, c * (1 + 0.1 * cb), side, cols[i % 3], i, t);
      if (cb > 0.3) for (let k = 0; k < 3; k++) sparkle(ctx, th, bx - 40 * u + k * 30 * u, by - 70 * u - k * 14 * u, 20 * u * cb, k % 2 ? th.f.butter : "#ffffff", { line: true, rot: t + k });
      if (tall && an && c > 0) { // numbered pips tie each bubble to its part
        const pr = 26 * u * (1 + 0.12 * Math.sin(t * 5 + i));
        for (const [px, py, q2] of [[an[0], an[1], lq], [bx - 6 * u, by - 40 * u, c]]) {
          if (q2 <= 0) continue;
          ctx.save(); pop(ctx, q2, px, py);
          blob(ctx, th, pEll(px, py, pr, pr), th.acc, { sx: 3 * u, sy: 3 * u, lw: 4 * u });
          ctx.font = fnt(S, 34 * u); ctx.fillStyle = th.onAcc; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(i + 1), px, py + 2 * u);
          ctx.restore();
        }
      }
    });
  }

  // A row of chibi people on the meadow, each with a name bubble; the highlighted one waves.
  // A puffy cloud friend with a face, for the open sky above a scene.
  function cloudFriend(ctx, th, x, y, w, t, i, u) {
    const h = w * 0.5, lw = 4.5 * u;
    const puffs = [[-0.32, 0.12, 0.3], [-0.08, -0.12, 0.42], [0.22, -0.04, 0.36], [0.4, 0.16, 0.24], [0.02, 0.18, 0.3]];
    const path = (c) => { for (const [px, py, pr] of puffs) { c.moveTo(x + px * w + pr * w, y + py * w); c.arc(x + px * w, y + py * w, pr * w, 0, TAU); } };
    ctx.save(); ctx.beginPath(); path(ctx); ctx.lineWidth = lw * 2; ctx.strokeStyle = th.line; ctx.lineJoin = "round"; ctx.stroke(); ctx.restore();
    ctx.save(); ctx.beginPath(); path(ctx); ctx.fillStyle = th.f.white; ctx.fill(); ctx.clip();
    ctx.fillStyle = shadeOf(th, th.f.white); ctx.beginPath(); ctx.ellipse(x + w * 0.06, y + h * 0.62, w * 0.62, h * 0.3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.beginPath(); ctx.ellipse(x - w * 0.14, y - w * 0.36, w * 0.1, w * 0.045, -0.5, 0, TAU); ctx.fill();
    ctx.restore();
    face(ctx, th, x + w * 0.02, y + w * 0.06, w * 0.62, t, { mood: i % 2 ? "joy" : "happy", seed: 40 + i, eye: 0.075 });
  }
  function peopleScene(ctx, S, th, A, b, d, t) {
    const u = S.u, tall = S.tall, G = floorY(S);
    const n = Math.max(2, Math.min(6, Math.round(d.count || 4)));
    // Cloud friends drift through the open sky between the headline and the name tags; a little rain of
    // hearts falls from the one over the highlighted person.
    {
      const hbot = headBottom(ctx, S, "people");
      const yTop = hbot != null ? hbot : A.y - 200 * u;
      const yBot = A.y + (tall ? -20 : 30) * u;
      const hb = yBot - yTop;
      if (hb > 110 * u) {
        const w = Math.min(190 * u, hb * 1.1);
        const xs = tall ? [0.28, 0.74] : [0.36, 0.64, 0.9];
        xs.forEach((fx, i) => {
          const q = back(seg(b, 0.3 + i * 0.1, 0.62 + i * 0.1));
          if (q <= 0) return;
          const x = S.W * fx + Math.sin(t * 0.45 + i * 2.1) * 60 * u;
          const y = yTop + hb * 0.5 + Math.sin(t * 1.1 + i * 1.7) * Math.min(12 * u, hb * 0.08);
          ctx.save(); pop(ctx, q, x, y); cloudFriend(ctx, th, x, y, w * (i % 2 ? 0.82 : 1), t, i, u); ctx.restore();
          for (let k = 0; k < 3; k++) {
            const ph = (t * 0.7 + k / 3 + i * 0.29) % 1;
            ctx.save(); ctx.globalAlpha *= q * clamp(ph * 6) * clamp((1 - ph) * 3);
            heart(ctx, th, x + (k - 1) * w * 0.22 + Math.sin(t * 2 + k) * 6 * u, y + w * 0.3 + ph * hb * 0.45, 16 * u, k % 2 ? th.acc : th.f.pink, { lw: 2.5 * u, gloss: false });
            ctx.restore();
          }
        });
      }
    }
    const hotI = Math.min(n - 1, d.highlight ?? 1);
    const rowsN = tall && n > 2 ? 2 : 1;
    const per = Math.ceil(n / rowsN);
    const spots = [];
    for (let i = 0; i < n; i++) {
      const row = rowsN === 2 ? (i < per ? 0 : 1) : 0;
      const inRow = rowsN === 2 ? (row === 0 ? per : n - per) : n;
      const j = rowsN === 2 ? (row === 0 ? i : i - per) : i;
      const slot = A.w / inRow;
      const s = rowsN === 2 ? Math.min(A.h * 0.36, slot * 1.05) : Math.min(A.h * 0.76, slot * 1.12);
      const base = rowsN === 2 ? (row === 0 ? G - A.h * 0.5 : G) : G;
      spots.push({ x: A.x + slot * (j + 0.5), base, s, row });
    }
    if (rowsN === 2) { // a riser for the back row
      const ry = G - A.h * 0.5;
      blob(ctx, th, pRR(A.x - 20 * u, ry - 6 * u, A.w + 40 * u, 46 * u, 23 * u), th.f.cream, { sx: 0, sy: 10 * u, lw: 4.5 * u, dots: [A.x, ry, A.w, 40 * u, 26 * u, 4 * u], dotColor: rgba(rgb(th.line), 0.12) });
    }
    const order = spots.map((sp, i) => i).sort((a, b2) => spots[a].row - spots[b2].row);
    const roles = d.badges.filter(Boolean);
    const M = FRAME.m;
    // Each person reacts as their tag lands (wave, blink, hop; the highlighted one puffs hearts), then the
    // reactions come round again in turn through the hold.
    const kinds = ["wave", "heart", "blink", "hop", "wave", "blink"];
    for (const i of order) {
      const sp = spots[i];
      const q = back(seg(b, 0.02 + i * 0.08, 0.36 + i * 0.08), 1.6);
      if (q <= 0) continue;
      const hot = i === hotI;
      const kind = hot ? "heart" : kinds[i % kinds.length] === "heart" ? "hop" : kinds[i % kinds.length];
      const landB = 0.42 + i * 0.08;
      const r1 = seg(b, landB, landB + 0.16), r2 = seg(M, 0.08 + (i / n) * 0.62, 0.08 + (i / n) * 0.62 + 0.3);
      const rp = r1 > 0 && r1 < 1 ? r1 : r2, rc = bump(rp);
      const s = sp.s * (hot ? 1.06 : 1);
      const lift = kind === "hop" ? rc * s * 0.16 : kind === "heart" ? rc * s * 0.08 : kind === "blink" ? rc * s * 0.03 : 0;
      const squash = kind === "hop" || kind === "heart" ? Math.max(0, -Math.cos(rp * Math.PI * 2)) * (rp > 0 && rp < 1 ? 1 : 0) : 0;
      ctx.save(); pop(ctx, q, sp.x, sp.base);
      if (squash) { ctx.translate(sp.x, sp.base); ctx.scale(1 + 0.06 * squash * (1 - rc), 1 - 0.06 * squash * (1 - rc)); ctx.translate(-sp.x, -sp.base); }
      chibi(ctx, th, sp.x, sp.base, s, t, { k: i, hair: [0, 4, 1, 2, 5, 3][i % 6], wave: hot || (kind === "wave" && rc > 0), cheer: kind === "hop" && rc > 0.3, mood: kind === "blink" && rc > 0.1 ? "joy" : hot && rc > 0.2 ? "wink" : i % 3 === 2 && !rc ? "happy" : "happy", mouth: rc > 0.4 && kind !== "blink" ? "open" : undefined, seed: i * 3 + 1, hop: hot ? 0.1 : 0, lift });
      ctx.restore();
      if (kind === "heart" && rp > 0 && rp < 1) { // a puff of hearts from the head
        for (let k = 0; k < 6; k++) {
          const a = -Math.PI / 2 + (k - 2.5) * 0.42, rr = s * (0.22 + eo(rp) * 0.42);
          ctx.save(); ctx.globalAlpha *= clamp((1 - rp) * 3);
          heart(ctx, th, sp.x + Math.cos(a) * rr * 1.1, sp.base - s * 0.72 - lift + Math.sin(a) * rr * 0.8, 34 * u * back(seg(rp, 0, 0.4)), k % 2 ? th.acc : th.f.pink, { lw: 3.5 * u });
          ctx.restore();
        }
      }
      if (kind === "blink" && rc > 0.2) sparkle(ctx, th, sp.x + s * 0.34, sp.base - s * 0.86, 22 * u * rc, th.f.butter, { line: true, rot: t });
      const label = i < roles.length ? roles[i] : "";
      const lq = back(seg(b, 0.3 + i * 0.08, 0.55 + i * 0.08));
      const by = sp.base - s * 1.1 - 40 * u + Math.sin(t * 2.2 + i) * 5 * u;
      if (label && lq > 0) {
        const slotW = A.w / (rowsN === 2 ? Math.max(per, n - per) : n);
        tag(ctx, S, th, label, sp.x, by, 42 * u, { q: lq, fill: hot ? th.acc : th.f.white, color: hot ? th.onAcc : th.line, max: slotW * 0.98 });
      } else if (!label && lq > 0) { // more people than roles: a heart sticker, never a repeated name
        ctx.save(); pop(ctx, lq, sp.x, by); heart(ctx, th, sp.x, by, 58 * u, th.f.pink); ctx.restore();
      }
      if (hot && lq > 0) {
        for (let k = 0; k < 3; k++) {
          const ph2 = ((t * 0.6 + k / 3) % 1);
          heart(ctx, th, sp.x + s * 0.32 + Math.sin(ph2 * 6 + k) * 12 * u, sp.base - s * (0.5 + ph2 * 0.6), 30 * u * (1 - ph2 * 0.5), th.acc, { lw: 3.5 * u });
        }
        sparkle(ctx, th, sp.x - s * 0.36, sp.base - s * 0.86, 18 * u * (0.7 + 0.3 * Math.sin(t * 4)), th.f.butter, { line: true });
      }
    }
  }

  // Three sticker medallions along a dotted trail; a blob hops from one to the next as each step lands.
  function stepIcon(ctx, S, th, k, cx, cy, s, t, stamp = 1) {
    const u = S.u;
    if (k === 0) { // magnifier with a smiling lens
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.sin(t * 1.5) * 0.12);
      blob(ctx, th, (c) => { c.moveTo(s * 0.18, s * 0.18); c.lineTo(s * 0.46, s * 0.46); }, "rgba(0,0,0,0)", { cel: false, lw: s * 0.16 });
      blob(ctx, th, pEll(-s * 0.06, -s * 0.06, s * 0.32, s * 0.32), th.f.sky, { sx: s * 0.05, sy: s * 0.05, lw: s * 0.07, gloss: [-s * 0.18, -s * 0.2, s * 0.08, s * 0.04, -0.7] });
      face(ctx, th, -s * 0.06, -s * 0.02, s * 0.5, t, { seed: 21, eye: 0.08 });
      ctx.restore();
    } else if (k === 1) { // pencil with sparkles
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(0.75 + Math.sin(t * 2.4) * 0.1);
      blob(ctx, th, pRR(-s * 0.12, -s * 0.42, s * 0.24, s * 0.62, s * 0.05), th.f.butter, { sx: s * 0.05, sy: 0, lw: s * 0.06 });
      blob(ctx, th, pRR(-s * 0.12, -s * 0.52, s * 0.24, s * 0.14, s * 0.06), th.f.pink, { cel: false, lw: s * 0.06 });
      blob(ctx, th, (c) => { c.moveTo(-s * 0.12, s * 0.2); c.lineTo(s * 0.12, s * 0.2); c.lineTo(0, s * 0.44); c.closePath(); }, th.f.peach, { cel: false, lw: s * 0.06 });
      ctx.restore();
      sparkle(ctx, th, cx + s * 0.34, cy - s * 0.3, s * 0.13 * (0.7 + 0.3 * Math.sin(t * 5)), th.f.butter, { line: true });
      sparkle(ctx, th, cx - s * 0.36, cy + s * 0.32, s * 0.09 * (0.7 + 0.3 * Math.sin(t * 5 + 2)), "#ffffff", { line: true });
    } else { // an empty dotted heart until the approval stamp slams a filled one into it, then a check
      const hs = s * 0.84;
      ctx.save(); ctx.beginPath(); pHeart(cx, cy + s * 0.02, hs)(ctx);
      ctx.setLineDash([2, s * 0.09]); ctx.lineDashOffset = -t * 30 * th.u; ctx.lineCap = "round"; ctx.lineWidth = s * 0.06; ctx.strokeStyle = rgba(rgb(th.line), 0.45); ctx.stroke(); ctx.restore();
      if (stamp > 0) {
        const bt = 1 + 0.06 * Math.max(0, Math.sin(t * 6)) * seg(stamp, 0.9, 1);
        const sc = stamp >= 1 ? 1 : lerp(1.9, 1, back(seg(stamp, 0, 0.55), 2.6));
        ctx.save(); ctx.globalAlpha *= clamp(stamp * 4); ctx.translate(cx, cy); ctx.rotate((1 - eo(seg(stamp, 0, 0.55))) * -0.4); ctx.translate(-cx, -cy);
        heart(ctx, th, cx, cy + s * 0.02, hs * bt * sc, th.acc, { lw: s * 0.06 });
        ctx.restore();
        const ck = seg(stamp, 0.5, 0.85);
        if (ck > 0) {
          const pts = [[cx - s * 0.17, cy - s * 0.02], [cx - s * 0.04, cy + s * 0.1], [cx + s * 0.2, cy - s * 0.14]];
          const L1 = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]), L2 = Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]);
          const len = ck * (L1 + L2);
          ctx.save(); ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
          if (len <= L1) ctx.lineTo(lerp(pts[0][0], pts[1][0], len / L1), lerp(pts[0][1], pts[1][1], len / L1));
          else { ctx.lineTo(pts[1][0], pts[1][1]); const f2 = (len - L1) / L2; ctx.lineTo(lerp(pts[1][0], pts[2][0], f2), lerp(pts[1][1], pts[2][1], f2)); }
          ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = s * 0.14; ctx.strokeStyle = th.line; ctx.stroke(); ctx.lineWidth = s * 0.07; ctx.strokeStyle = "#ffffff"; ctx.stroke(); ctx.restore();
        }
      }
    }
  }
  function processScene(ctx, S, th, A, b, d, t) {
    const u = S.u, tall = S.tall;
    const steps = d.steps.slice(0, 3);
    const n = steps.length;
    const st = [];
    for (let i = 0; i < n; i++) {
      if (tall) st.push({ x: A.x + A.w * (i % 2 ? 0.7 : 0.3), y: A.y + A.h * (0.18 + i * 0.32), r: Math.min(A.w * 0.19, A.h * 0.12) });
      else st.push({ x: A.x + A.w * ((i + 0.5) / n), y: A.y + A.h * 0.42, r: Math.min(A.w / n * 0.3, A.h * 0.25) });
    }
    const rev = (i) => back(seg(b, 0.04 + i * 0.24, 0.3 + i * 0.24), 1.7);
    // A striped rainbow arches over the route from the first step to the last, painting itself in as the
    // steps arrive; a sparkle keeps sliding along its crest through the hold.
    if (n > 1) {
      // Wide: it spans first step to last. Tall: it hangs between two cloud friends above the first step.
      const a = tall ? { x: S.W * 0.17, y: st[0].y - st[0].r - 70 * u } : st[0], z = tall ? { x: S.W * 0.83 } : st[n - 1];
      const cx = (a.x + z.x) / 2, cy = tall ? a.y : a.y + a.r * 0.15, rx = (z.x - a.x) / 2;
      const hbot = headBottom(ctx, S, "process");
      const topLimit = hbot != null ? hbot + 20 * u : A.y - 160 * u;
      const ry = Math.max(80 * u, Math.min(rx * 0.62, cy - topLimit - 70 * u));
      const bandW = 24 * u, cols5 = [th.f.pink, th.f.peach, th.f.butter, th.f.mint, th.f.sky, th.f.lav];
      const rq = eio(seg(b, 0.08, 0.7));
      if (rq > 0) {
        const a0 = Math.PI, a1 = Math.PI + Math.PI * rq;
        const outer = cols5.length * bandW;
        ctx.save();
        ctx.beginPath(); ctx.ellipse(cx, cy, rx + outer / 2 + 5 * u, ry + outer / 2 + 5 * u, 0, a0, a1); ctx.ellipse(cx, cy, Math.max(1, rx - outer / 2 - 5 * u), Math.max(1, ry - outer / 2 - 5 * u), 0, a1, a0, true); ctx.closePath();
        ctx.fillStyle = th.line; ctx.fill();
        cols5.forEach((col, k) => {
          const off = outer / 2 - (k + 0.5) * bandW;
          ctx.beginPath(); ctx.ellipse(cx, cy, rx + off, ry + off, 0, a0, a1);
          ctx.lineWidth = bandW + 0.6 * u; ctx.strokeStyle = col; ctx.lineCap = "butt"; ctx.stroke();
        });
        // One cel shadow along the inner edge, a gloss stroke near the top and polka dots riding the bands.
        ctx.beginPath(); ctx.ellipse(cx, cy, rx - outer / 2 + bandW * 0.3, ry - outer / 2 + bandW * 0.3, 0, a0, a1);
        ctx.lineWidth = bandW * 0.6; ctx.strokeStyle = rgba(rgb(th.line), 0.16); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(cx, cy, rx + outer / 2 - bandW * 0.45, ry + outer / 2 - bandW * 0.45, 0, Math.max(a0, Math.PI * 1.18), Math.min(a1, Math.PI * 1.42));
        ctx.lineWidth = 6 * u; ctx.lineCap = "round"; ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        for (let k = 0; k < cols5.length; k += 2) {
          const off = outer / 2 - (k + 0.5) * bandW;
          for (let j = 0; j < 22; j++) {
            const ang = Math.PI + ((j + 0.5 + (k % 4) * 0.25) / 22) * Math.PI;
            if (ang > a1) break;
            ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * (rx + off), cy + Math.sin(ang) * (ry + off), 3.6 * u, 0, TAU); ctx.fill();
          }
        }
        ctx.restore();
        // The painting tip, then the sparkle that skates the crest back and forth.
        const tipA = rq < 1 ? a1 : Math.PI + Math.PI * (0.5 + 0.42 * Math.sin(t * 0.9));
        const sx = cx + Math.cos(tipA) * (rx + outer / 2 + 6 * u), sy = cy + Math.sin(tipA) * (ry + outer / 2 + 6 * u);
        sparkle(ctx, th, sx, sy, (24 + 6 * Math.sin(t * 7)) * u, th.f.butter, { line: true, rot: t * 2 });
        for (let k = 1; k <= 3; k++) {
          const ta = tipA - 0.07 * k * (rq < 1 ? 1 : Math.cos(t * 0.9));
          sparkle(ctx, th, cx + Math.cos(ta) * (rx + outer / 2 + 14 * u), cy + Math.sin(ta) * (ry + outer / 2 + 14 * u), (12 - k * 2.5) * u, "#ffffff", { line: true, rot: t * 3 + k });
        }
      }
      if (tall) {
        [a.x, z.x].forEach((x, i) => {
          const q = back(seg(b, 0.04 + i * 0.5, 0.3 + i * 0.5));
          if (q <= 0) return;
          const y = cy - 10 * u + Math.sin(t * 1.2 + i * 2) * 8 * u;
          ctx.save(); pop(ctx, q, x, y); cloudFriend(ctx, th, x, y, 170 * u, t, i + 2, u); ctx.restore();
        });
      }
    }
    // Dotted trail arrows.
    for (let i = 0; i < n - 1; i++) {
      const a = st[i], z = st[i + 1];
      const qa = eo(seg(b, 0.2 + i * 0.24, 0.4 + i * 0.24));
      if (qa <= 0) continue;
      const ang = Math.atan2(z.y - a.y, z.x - a.x);
      const p0 = [a.x + Math.cos(ang) * (a.r + 30 * u), a.y + Math.sin(ang) * (a.r + 30 * u)];
      const p2 = [z.x - Math.cos(ang) * (z.r + 40 * u), z.y - Math.sin(ang) * (z.r + 40 * u)];
      const nx = -Math.sin(ang), ny = Math.cos(ang), bend = (tall ? 1 : -1) * 60 * u * (i % 2 ? -1 : 1);
      const p1 = [(p0[0] + p2[0]) / 2 + nx * bend, (p0[1] + p2[1]) / 2 + ny * bend];
      ctx.save(); ctx.beginPath();
      let end = p0, prev = p0;
      for (let s = 0; s <= qa + 1e-4; s += 0.02) { const m = 1 - s; const px = m * m * p0[0] + 2 * m * s * p1[0] + s * s * p2[0], py = m * m * p0[1] + 2 * m * s * p1[1] + s * s * p2[1]; s === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); prev = end; end = [px, py]; }
      ctx.setLineDash([1, 20 * u]); ctx.lineDashOffset = -t * 50 * u; ctx.lineCap = "round"; ctx.lineWidth = 12 * u; ctx.strokeStyle = th.line; ctx.stroke();
      ctx.restore();
      if (qa > 0.9) {
        const aa = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
        ctx.save(); ctx.translate(end[0], end[1]); ctx.rotate(aa);
        blob(ctx, th, (c) => { c.moveTo(18 * u, 0); c.lineTo(-14 * u, -18 * u); c.lineTo(-8 * u, 0); c.lineTo(-14 * u, 18 * u); c.closePath(); }, th.acc, { cel: false, lw: 4.5 * u });
        ctx.restore();
      }
    }
    const cols = [th.f.sky, th.f.butter, th.f.pink];
    // The hopper reaches the middle step as the drawing builds; its second beat is the hop to the last step,
    // which it stamps with a heart.
    const M = FRAME.m;
    const prog = n > 1 ? (n - 1) * (0.5 * eio(seg(b, 0.15, 0.95)) + 0.5 * eio(seg(M, 0.02, 0.4))) : 0;
    const stampK = seg(M, 0.4, 0.78);
    st.forEach((m, i) => {
      const q = rev(i);
      if (q <= 0) return;
      const active = i === Math.min(n - 1, Math.round(prog));
      const wv = bump(seg(M, 0.76 + i * 0.07, 0.93 + i * 0.07)); // a closing ripple along the steps
      const pulse = (1 + (active ? 0.035 * Math.sin(t * 6) : 0)) * (1 + 0.14 * wv);
      ctx.save(); pop(ctx, q * pulse, m.x, m.y);
      blob(ctx, th, pScallop(m.x, m.y, m.r, 16, t * 0.2 + i, 0.07), cols[i % 3], { sx: m.r * 0.07, sy: m.r * 0.07, gloss: [m.x - m.r * 0.52, m.y - m.r * 0.55, m.r * 0.12, m.r * 0.06, -0.7] });
      blob(ctx, th, pEll(m.x, m.y, m.r * 0.72, m.r * 0.72), th.f.white, { sx: m.r * 0.05, sy: m.r * 0.05, lw: 4.5 * u });
      const thud = i === n - 1 ? bump(seg(stampK, 0.15, 0.5)) : 0;
      if (thud) { ctx.translate(m.x, m.y); ctx.scale(1 + 0.12 * thud, 1 - 0.1 * thud); ctx.translate(-m.x, -m.y); }
      stepIcon(ctx, S, th, i === n - 1 ? 2 : i, m.x, m.y, m.r * 1.0, t + i, i === n - 1 ? stampK : 1);
      // Number pip.
      const px = m.x - m.r * 0.78, py = m.y - m.r * 0.72;
      blob(ctx, th, pEll(px, py, 34 * u, 34 * u), th.acc, { sx: 4 * u, sy: 4 * u, lw: 4.5 * u });
      ctx.font = fnt(S, 42 * u); ctx.fillStyle = th.onAcc; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(i + 1), px, py + 3 * u);
      ctx.restore();
      const lab = steps[i] || "";
      const lq = back(seg(b, 0.14 + i * 0.24, 0.38 + i * 0.24));
      if (tall) {
        const toRight = i % 2 === 0;
        tag(ctx, S, th, lab, toRight ? m.x + m.r + 40 * u : m.x - m.r - 40 * u, m.y + m.r * 0.15, 44 * u, { q: lq, align: toRight ? "left" : "right", max: A.w - m.r * 2 - A.w * 0.12 - 40 * u });
      } else tag(ctx, S, th, lab, m.x, m.y + m.r + 74 * u, 44 * u, { q: lq, max: A.w / n * 0.96 });
    });
    // The hopper.
    const i0 = Math.min(n - 2, Math.floor(prog)), f = n > 1 ? prog - i0 : 0;
    const a = st[Math.max(0, i0)], z = st[Math.min(n - 1, i0 + 1)];
    const ef = eio(f);
    const hx = lerp(a.x, z.x, ef), hy = lerp(a.y - a.r * 1.04, z.y - z.r * 1.04, ef) - Math.sin(Math.PI * f) * 200 * u;
    const hq = back(seg(b, 0.1, 0.3));
    if (hq > 0) { ctx.save(); pop(ctx, hq, hx, hy); mochi(ctx, th, hx, hy, 104 * u, t, { color: th.f.white, hop: f > 0.02 && f < 0.98 ? 0 : 0.18, arms: prog >= n - 1.02 ? "up" : "wave", mood: prog >= n - 1.02 ? "joy" : "happy", seed: 7 }); ctx.restore(); }
    // The stamp lands: a ring of sparkles, then hearts keep floating up from the last step.
    const last = st[n - 1];
    const ring = seg(stampK, 0.15, 0.7);
    if (last && ring > 0 && ring < 1) {
      for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU, rr = last.r * (1.05 + eo(ring) * 0.6); sparkle(ctx, th, last.x + Math.cos(a) * rr, last.y + Math.sin(a) * rr, 22 * u * (1 - ring), k % 2 ? th.f.butter : "#ffffff", { line: true, rot: a }); }
    }
    if (last && stampK > 0.3) {
      for (let k = 0; k < 4; k++) {
        const ph2 = (((t - 0) * 0.55 + k / 4) % 1);
        ctx.save(); ctx.globalAlpha *= clamp((1 - ph2) * 2) * clamp((stampK - 0.3) * 4);
        heart(ctx, th, last.x + last.r * (0.7 + 0.25 * Math.sin(ph2 * 7 + k)) * (k % 2 ? 1 : -1), last.y - last.r * (0.5 + ph2 * 1.0), 34 * u * (1 - ph2 * 0.4), k % 2 ? th.acc : th.f.pink, { lw: 3.5 * u });
        ctx.restore();
      }
    }
  }

  // Before and after as two sticker cards: a dizzy blob circled by retry loops, a joyful one by sparkles.
  function compareScene(ctx, S, th, A, b, d, t) {
    const u = S.u, tall = S.tall, G = floorY(S);
    const gap = tall ? 130 * u : 170 * u;
    const cw = tall ? A.w : (A.w - gap) / 2, ch = tall ? (A.h - gap - 30 * u) / 2 : A.h - 70 * u;
    const maxV = Math.max(Math.abs(d.leftValue) || 0, Math.abs(d.rightValue) || 0, 1);
    const sides = [[d.left, d.leftValue, th.f.lav, false], [d.right, d.rightValue, th.acc, true]];
    const cards = [];
    sides.forEach(([label, value, col, good], i) => {
      const x = tall ? A.x : A.x + i * (cw + gap), y = tall ? A.y + 10 * u + i * (ch + gap) : A.y + 10 * u;
      cards.push({ x, y });
      const q = back(seg(b, 0.02 + i * 0.16, 0.34 + i * 0.16), 1.5);
      if (q <= 0) return;
      ctx.save(); pop(ctx, q, x + cw / 2, y + ch);
      ctx.translate(x + cw / 2, y + ch / 2); ctx.rotate((i ? 1 : -1) * 0.012 + Math.sin(t * 1.2 + i) * 0.006); ctx.translate(-(x + cw / 2), -(y + ch / 2));
      blob(ctx, th, pRR(x, y + 12 * u, cw, ch, 40 * u), rgba(rgb(th.line), 0.22), { cel: false, line: false });
      blob(ctx, th, pRR(x, y, cw, ch, 40 * u), th.f.white, { sx: 12 * u, sy: 10 * u, dots: [x, y, cw, ch, 44 * u, 3.5 * u], dotColor: rgba(rgb(th.line), 0.07) });
      const band = 100 * u;
      ctx.save(); ctx.beginPath(); pRR(x, y, cw, ch, 40 * u)(ctx); ctx.clip();
      blob(ctx, th, pRR(x - 10 * u, y - 10 * u, cw + 20 * u, band + 10 * u, 0), col, { cel: false, lw: 5 * u, dots: [x, y, cw, band, 30 * u, 4 * u] });
      ctx.restore();
      blob(ctx, th, pRR(x, y, cw, ch, 40 * u), "rgba(0,0,0,0)", { cel: false });
      chunky(ctx, S, th, [String(label || "")], x + 34 * u, y + band * 0.68, Math.max(44 * u, Math.min(52 * u, (cw - 80 * u) / Math.max(1, textW(ctx, S, String(label || ""), 1)))), { q: seg(b, 0.1 + i * 0.16, 0.4 + i * 0.16), dropColor: null, stroke: 0.22 });
      const vq = eo(seg(b, 0.15 + i * 0.16, 0.65 + i * 0.16));
      const numZ = Math.max(96 * u, Math.min(ch * (tall ? 0.42 : 0.32), 190 * u));
      chunky(ctx, S, th, [fmt(value * vq, value, d)], x + 40 * u, y + band + (ch - band) * (tall ? 0.6 : 0.5), numZ, { fill: good ? th.acc : th.f.lav, q: 1, t: t + i });
      // Pips.
      const np = 10, pf = Math.round(((Math.abs(value) || 0) / maxV) * np * vq);
      const pr = Math.min(18 * u, (cw * (tall ? 0.5 : 0.8)) / np / 2.6);
      for (let k = 0; k < np; k++) {
        const px = x + 40 * u + pr + k * pr * 2.6, py = y + ch - 50 * u;
        const on = k < pf;
        if (on) heart(ctx, th, px, py + Math.sin(t * 4 + k * 0.6) * 2 * u, pr * 2.1, good ? th.acc : th.f.lav, { lw: 3.5 * u, gloss: false });
        else blob(ctx, th, pEll(px, py, pr * 0.45, pr * 0.45), rgba(rgb(th.line), 0.18), { cel: false, line: false });
      }
      // The reacting blob.
      const ms = tall ? Math.min(ch * 0.5, cw * 0.3) : Math.min(cw * 0.42, ch * 0.52);
      const mx = x + cw - ms * 0.72 - 30 * u, my = tall ? y + ch - 40 * u : y + ch - 100 * u;
      const mq = back(seg(b, 0.25 + i * 0.16, 0.55 + i * 0.16));
      if (mq > 0) {
        ctx.save(); pop(ctx, mq, mx, my);
        if (!good) {
          mochi(ctx, th, mx, my, ms, t, { color: th.f.lav, mood: "dizzy", sweat: true, seed: 2, arms: "up", sprout: true });
          for (let k = 0; k < 3; k++) { const a = t * 2.2 + (k / 3) * TAU; loopArrow(ctx, th, mx + Math.cos(a) * ms * 0.72, my - ms * 0.48 + Math.sin(a) * ms * 0.22, ms * 0.1, a * 1.5, th.f.white); }
        } else {
          mochi(ctx, th, mx, my, ms, t, { color: th.f.pink, mood: "joy", seed: 4, arms: "up", hop: 0.16 });
          for (let k = 0; k < 4; k++) { const a = -t * 1.4 + (k / 4) * TAU; sparkle(ctx, th, mx + Math.cos(a) * ms * 0.75, my - ms * 0.45 + Math.sin(a) * ms * 0.4, ms * 0.09 * (0.7 + 0.3 * Math.sin(t * 5 + k)), k % 2 ? th.f.butter : "#ffffff", { line: true, rot: a }); }
        }
        ctx.restore();
      }
      ctx.restore();
    });
    // The arrow badge between.
    const aq = back(seg(b, 0.3, 0.55));
    if (aq > 0) {
      const cx = tall ? A.x + A.w / 2 : A.x + cw + gap / 2, cy = tall ? A.y + 10 * u + ch + gap / 2 : A.y + 10 * u + ch * 0.45;
      const r = Math.min(gap * 0.46, 72 * u);
      const nud = Math.sin(t * 4) * 6 * u;
      ctx.save(); pop(ctx, aq, cx, cy);
      blob(ctx, th, pScallop(cx, cy, r, 12, t * 0.4, 0.08), th.f.butter, { sx: r * 0.08, sy: r * 0.08 });
      ctx.translate(cx + (tall ? 0 : nud), cy + (tall ? nud : 0)); ctx.rotate(tall ? Math.PI / 2 : 0);
      blob(ctx, th, (c) => { c.moveTo(-r * 0.45, -r * 0.14); c.lineTo(r * 0.05, -r * 0.14); c.lineTo(r * 0.05, -r * 0.36); c.lineTo(r * 0.5, 0); c.lineTo(r * 0.05, r * 0.36); c.lineTo(r * 0.05, r * 0.14); c.lineTo(-r * 0.45, r * 0.14); c.closePath(); }, th.acc, { sx: 3 * u, sy: 3 * u, lw: 4.5 * u });
      ctx.restore();
    }
  }

  // One scene at its own effective clock: art, then its headline.
  const CORE = { chart: chartScene, object: objectScene, people: peopleScene, process: processScene, compare: compareScene };
  function drawScene(ctx, S, th, id, hold, L, E, t, i) {
    FRAME.index = i;
    if (id === "title") { titleArt(ctx, S, th, L, t); return; }
    if (id === "closing") { closingArt(ctx, S, th, L, t); return; }
    const fn = CORE[id];
    if (!fn) return;
    const bEnd = Math.max(0.9, Math.min(hold * 0.55, 1.9));
    const b = 0.24 + 0.76 * clamp(L / bEnd);
    beatOf(L, E, bEnd * 0.62);
    fn(ctx, S, th, area(S, boxOf(S)), b, dataOf()[id], t);
    headline(ctx, S, th, id, L, t);
  }
  // The stage composes every frame itself (both scenes and the change); these drawers only run when a
  // template has no stage.
  function wrap(id) {
    return (ctx, S, box, p, d, info) => {
      if (FRAME.staged && FRAME.handled === info.t) return;
      const th = theme(S);
      drawScene(ctx, S, th, id, info.hold, info.local + 0.2, info.hold + 0.2, info.t, 1);
      finish(ctx, S, th);
    };
  }
  const SCENES = { chart: wrap("chart"), object: wrap("object"), people: wrap("people"), process: wrap("process"), compare: wrap("compare") };

  const LIGHT_SKY = ["#fde9f3", "#fff5ea", "#fffaf2"];
  return {
    bg: "#fde7f1", panel: "#ffffff", ink: "#5a3b6b", muted: "rgba(90,59,107,0.72)", accent: "#ff6fae", onAccent: "#ffffff",
    rule: "rgba(90,59,107,0.35)", track: "rgba(90,59,107,0.12)",
    display: "'Arial Rounded MT Bold', 'Varela Round', 'Nunito', 'Quicksand', 'Avenir Next', 'Segoe UI', Arial, sans-serif", displayWeight: 700, displayCase: "none", displayTracking: "0em",
    body: "'Arial Rounded MT Bold', 'Varela Round', 'Nunito', 'Avenir Next', 'Segoe UI', Arial, sans-serif", bodyWeight: 700,
    figures: "'Arial Rounded MT Bold', 'Varela Round', 'Nunito', 'Avenir Next', Arial, sans-serif", radius: 32, motion: "pop", change: "lift",
    kit: { line: 4, fill: "solid", panel: "fill" }, panelEdge: "#5a3b6b",
    line: "#5a3b6b", shadeK: 0.2,
    sky: ["#e6dcff", "#ffe2ee", "#fff0e0"], ray: "rgba(255,255,255,0.3)", dot: "rgba(90,59,107,0.13)", twinkle: "#ffffff",
    hill: ["#c9efdc", "#a3e3c3"], cheek: "#ff9cc0", iris: "#9a7be0", screen: "#efe9ff",
    fills: { pink: "#ffb1cf", mint: "#a8ebd0", lav: "#cfbcff", butter: "#ffe394", sky: "#acdcff", peach: "#ffc9ab", white: "#fffafd", cream: "#fff3e4" },
    skin: ["#ffe2d0", "#f7c9a8", "#dba27d", "#a8714f"],
    hairs: ["#7a4f3e", "#b79cf0", "#ff9fc6", "#6c4a80", "#f2b867", "#7fcfb4"],
    // Headlines set straight on this look's backdrop, where its ink and accent (meant for panels) do not read.
    displayAccent: { original: "#a64871", light: "#b3556d" },
    palettes: {
      // Light: a whiter, cream-and-mint morning. Dark: a pastel night meadow. Mono: soft greys and charcoal line.
      light: { bg: "#fffaf3", ink: "#4b3a5e", muted: "rgba(75,58,94,0.72)", accent: "#ff7a9c", line: "#4b3a5e", panelEdge: "#4b3a5e", rule: "rgba(75,58,94,0.3)", track: "rgba(75,58,94,0.1)",
        sky: ["#e8fbf3", "#fffaf1", "#fff1f4"], ray: "rgba(255,255,255,0.55)", dot: "rgba(75,58,94,0.1)", hill: ["#dcf5e8", "#b9ecd2"], screen: "#f2f7ff" },
      dark: { bg: "#2a2154", ink: "#fff3fa", muted: "rgba(255,243,250,0.75)", accent: "#ff8cc6", onAccent: "#2a1838", line: "#22163a", panelEdge: "#22163a", rule: "rgba(255,243,250,0.3)", track: "rgba(255,243,250,0.14)", night: true, shadeK: 0.28,
        sky: ["#231c4c", "#43317a", "#7a4c8c"], ray: "rgba(255,210,250,0.06)", dot: "rgba(255,240,255,0.16)", twinkle: "#fff3b8", hill: ["#3f5f8f", "#4f8c90"], cheek: "#ff86b6", iris: "#6f55c9", screen: "#3a2e6e",
        fills: { pink: "#ff9fc6", mint: "#8fe0c3", lav: "#b9a3ff", butter: "#ffdc7a", sky: "#93cdfb", peach: "#ffb995", white: "#fff4fb", cream: "#ffe9d6" } },
      mono: { bg: "#efeff2", ink: "#2b2b33", muted: "rgba(43,43,51,0.7)", accent: "#4a4a55", onAccent: "#ffffff", line: "#2b2b33", panelEdge: "#2b2b33", rule: "rgba(43,43,51,0.3)", track: "rgba(43,43,51,0.1)", shadeK: 0.16,
        sky: ["#f3f3f6", "#ececf0", "#e2e2e8"], ray: "rgba(255,255,255,0.5)", dot: "rgba(43,43,51,0.1)", twinkle: "#ffffff", hill: ["#e0e0e6", "#cacbd2"], cheek: "#cfcfd6", iris: "#6d6d78", screen: "#f4f4f7",
        fills: { pink: "#e9e9ee", mint: "#d6d7dd", lav: "#c4c5cd", butter: "#f6f6f8", sky: "#dddde3", peach: "#cfd0d6", white: "#ffffff", cream: "#f5f5f7" },
        skin: ["#f2f2f4", "#e2e2e6", "#cfcfd5", "#b4b4bc"], hairs: ["#55555f", "#8a8a94", "#a9a9b2", "#3c3c45", "#6f6f79", "#9a9aa3"] },
    },
    textShadow: () => "0 4px 0 rgba(255,255,255,0.85)",
    backdrop: (accent, texture = 1, look) => {
      const s = (look && look.sky) || LIGHT_SKY;
      return `${grain(0.035 * texture)}, linear-gradient(180deg, ${s[0]} 0%, ${s[1]} 55%, ${s[2]} 100%)`;
    },
    // The illustrated template draws its own bouncy lettering on the canvas; other templates get sticker type.
    css: (accent, look) => {
      const line = look.line || "#5a3b6b";
      const ring = [[0, 1], [0.7, 0.7], [1, 0], [0.7, -0.7], [0, -1], [-0.7, -0.7], [-1, 0], [-0.7, 0.7]].map(([x, y]) => `${(x * 0.06).toFixed(3)}em ${(y * 0.06).toFixed(3)}em 0 ${line}`).join(", ");
      return `#root:has(> #art) .display, #root:has(> #art) .kicker { opacity: 0 !important; }
      #root:not(:has(> #art)) .display { color: #ffffff; text-shadow: ${ring}, 0 0.12em 0 ${line}; }
      #root:not(:has(> #art)) .kicker { align-self: flex-start; padding: 0.4em 1em; border-radius: 999px; background: ${accent}; color: #ffffff; text-shadow: none; border: 0.12em solid ${line}; box-shadow: 0 0.18em 0 ${line}; }`;
    },
    // Other templates get the pastel sky on the texture canvas; this one draws its own stage.
    paint: (ctx, W, H, t, accent, look) => {
      ctx.clearRect(0, 0, W, H);
      if (FRAME.staged || document.getElementById("art")) return;
      const S = { W, H, u: Math.min(W, H) / 1080, look, accent, tall: H > W * 1.15, paint: true };
      const th = theme(S);
      FRAME.scroll = t * 18 * S.u;
      sky(ctx, S, th, t); hills(ctx, S, th, t); air(ctx, S, th, t);
    },
    keepArt: true,
    overlap: false,
    stage(ctx, S, info) {
      FRAME.staged = true; FRAME.handled = -1;
      const th = theme(S), u = S.u;
      const P = plan(), sh = P.shown, n = sh.length;
      const t = info.t, ch = Math.max(0.05, info.change || 0.45);
      FRAME.t = t;
      if (!n) { if (S.paint) { FRAME.scroll = t * 18 * u; sky(ctx, S, th, t); hills(ctx, S, th, t); air(ctx, S, th, t); } finish(ctx, S, th); return; }
      const WS = windows(P, ch);
      let cur = info.index;
      if (cur < 0) cur = t >= P.length ? n - 1 : 0;
      const tr = WS.find((w) => t >= w.B - w.pre && t < w.B + w.post) || null;
      // Each scene runs on its own clock from the moment its change begins, so it is building as it
      // is revealed; it settles once the next change begins.
      const vs = (i) => sh[i].start - (i > 0 ? WS[i - 1].pre : 0) - (i > 0 ? 0.2 : 0);
      const se = (i) => (i < n - 1 ? WS[i].B - WS[i].pre : sh[i].start + sh[i].hold);
      const draw = (i) => drawScene(ctx, S, th, sh[i].id, sh[i].hold, t - vs(i), se(i) - vs(i), t, i);
      const p = tr ? clamp((t - (tr.B - tr.pre)) / tr.D) : 0;
      // The meadow pans a stretch with every change, carried along by the sweep.
      const idxEff = !tr ? cur : tr.type === "bubbles" ? (t < tr.B ? tr.from : tr.to) : tr.from + eio(p);
      FRAME.scroll = idxEff * 760 * u + t * 18 * u;
      const bx = boxOf(S);
      const gapsOf = (id) => (id === "chart" || id === "process" ? [[bx.x - 80 * u, bx.x + bx.w + 80 * u]] : id === "object" && !S.tall ? [[bx.x + bx.w * 0.55, bx.x + bx.w + 90 * u]] : []);
      FRAME.gaps = tr ? gapsOf(sh[tr.from].id).concat(gapsOf(sh[tr.to].id)) : gapsOf(sh[cur].id);
      if (S.paint) { sky(ctx, S, th, t); hills(ctx, S, th, t); air(ctx, S, th, t); }
      if (!tr) draw(cur);
      else if (tr.type === "bubbles") { draw(t < tr.B ? tr.from : tr.to); bubblesOver(ctx, S, th, tr, t); }
      else {
        ctx.save(); clipFor(ctx, S, tr, p, false); draw(tr.from); ctx.restore();
        ctx.save(); clipFor(ctx, S, tr, p, true); draw(tr.to); ctx.restore();
        overFor(ctx, S, th, tr, p, t);
      }
      finish(ctx, S, th);
      FRAME.handled = t;
    },
    scenes: SCENES,
  };
});
