// X-Ray: a radiograph lightbox world. Near-black films hang on a glowing viewer. Everything on a film is
// painted as density into a separate layer, then exposed onto the emulsion through soft blur passes, so
// subjects read as translucent masses with bright dense cores and blurred falloff; overlaps add up like
// real film. The emulsion carries mottled fog, crawling grain, scratches and edge print. Lead markers and
// a grease pencil annotate on top. Each scene is a page (masthead film + main film) that slides with the
// viewer, and the scene's DOM headline is pinned to its page, developing out of fog as it arrives.
// Every frame is a pure function of time: seeded noise only, no clocks.
window.DreamcutMotion.register("x-ray", ({ rng }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const inout = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const back = (v) => { v = clamp(v); const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const HAND = "'Bradley Hand', 'Marker Felt', 'Segoe Print', 'Comic Sans MS', cursive";
  const COND = "'Avenir Next Condensed', 'DIN Condensed', 'Roboto Condensed', 'Arial Narrow', sans-serif";
  const MONO = "'SF Mono', 'Menlo', 'Consolas', 'DejaVu Sans Mono', monospace";
  const PITCH = 1.12;
  const WHITE = [255, 255, 255];

  function rgb(value) {
    if (Array.isArray(value)) return value;
    const s = String(value || "");
    if (s[0] === "#") {
      const h = s.length === 4 ? s.slice(1).split("").map((c) => c + c).join("") : s.slice(1, 7);
      const n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (m) return m[1].split(",").slice(0, 3).map(Number);
    return [200, 200, 220];
  }
  const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

  // Shared state written by the stage each frame and read by the scene drawers.
  let CUR = { cam: 0, index: 0, local: 0, change: 0.45, scene: null, hold: 0 };

  function theme(S, t) {
    const L = S.look, x = L.xr;
    return {
      S, t, u: S.u, W: S.W, H: S.H, tall: S.tall, tex: L.texture ?? 1,
      lb: rgb(x.lb), lb2: rgb(x.lb2), film: x.film, fog: x.fog, bone: x.bone, rim: x.rim, red: rgb(x.red), dark: x.dark,
      acc: rgb(S.accent), accS: S.accent, pale: x.pale, light: x.light, ink: L.ink, onAccent: L.onAccent,
    };
  }

  // ---- the density layer ------------------------------------------------------------------------------
  // While a film's content is drawn, density goes to DENS (an offscreen layer) and annotations are queued
  // in DEFER so they land on top of the exposed density, not under it.
  let LAYER = null, DENS = null, DEFER = null;
  function layer(W, H) {
    if (!LAYER || LAYER.width !== W || LAYER.height !== H) { LAYER = document.createElement("canvas"); LAYER.width = W; LAYER.height = H; }
    return LAYER.getContext("2d");
  }
  function ink(g) { if (DENS) { DENS.setTransform(g.getTransform()); return DENS; } return g; }
  const deferable = (fn) => function (g, ...args) {
    if (DEFER) {
      const m = g.getTransform(), al = g.globalAlpha;
      DEFER.push(() => { g.save(); g.setTransform(m); g.globalAlpha = al; fn(g, ...args); g.restore(); });
      return;
    }
    return fn(g, ...args);
  };

  // ---- primitives -----------------------------------------------------------------------------------
  function rr(g, x, y, w, h, r) {
    const q = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath();
    g.moveTo(x + q, y); g.arcTo(x + w, y, x + w, y + h, q); g.arcTo(x + w, y + h, x, y + h, q);
    g.arcTo(x, y + h, x, y, q); g.arcTo(x, y, x + w, y, q); g.closePath();
  }
  // Density stroke: a wide faint body and a denser core; the exposure blur gives the falloff.
  function xr(g, th, w, a, col, build) {
    if (a <= 0.003) return;
    const c0 = ink(g);
    c0.save();
    c0.globalCompositeOperation = "lighter"; c0.lineCap = "round"; c0.lineJoin = "round";
    const c = col || th.bone;
    for (const [k, al] of [[2.6, 0.1], [1, 0.42]]) { c0.lineWidth = w * k; c0.strokeStyle = rgba(c, al * a); build(c0); c0.stroke(); }
    c0.restore();
  }
  // Density mass: a translucent fill. Overlapping fills add up into brighter, denser cores.
  function xf(g, th, a, col, build) {
    if (a <= 0.003) return;
    const c0 = ink(g);
    c0.save(); c0.globalCompositeOperation = "lighter"; c0.fillStyle = rgba(col || th.bone, a); build(c0); c0.fill(); c0.restore();
  }
  // Remove density (a void inside a mass, or a clear window behind type).
  function cut(g, a, build, blur = 0) {
    if (!DENS) return;
    const c0 = ink(g);
    c0.save(); c0.globalCompositeOperation = "destination-out"; if (blur > 0) c0.filter = `blur(${blur.toFixed(1)}px)`;
    c0.fillStyle = `rgba(0,0,0,${a})`; build(c0); c0.fill(); c0.restore();
  }
  function disc(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); }
  function glowDot(g, x, y, r, col, a = 1) {
    const c0 = ink(g);
    c0.save(); c0.globalCompositeOperation = "lighter";
    const gr = c0.createRadialGradient(x, y, 0, x, y, r * 3);
    gr.addColorStop(0, rgba(WHITE, a)); gr.addColorStop(0.25, rgba(col, 0.8 * a)); gr.addColorStop(1, rgba(col, 0));
    c0.fillStyle = gr; c0.fillRect(x - r * 3, y - r * 3, r * 6, r * 6); c0.restore();
  }

  // Text. `q` reveals left to right like a pen writing; `maxW` shrinks to fit.
  const txt = deferable(function (g, s, x, y, size, o = {}) {
    s = String(s);
    g.save();
    const fam = o.font || HAND, wt = o.weight || "700";
    g.font = `${wt} ${size}px ${fam}`;
    let sz = size, w = g.measureText(s).width;
    if (o.maxW && w > o.maxW) { sz = Math.max(size * 0.5, size * o.maxW / w); g.font = `${wt} ${sz}px ${fam}`; w = g.measureText(s).width; }
    const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    const q = o.q ?? 1;
    if (q <= 0) { g.restore(); return; }
    if (q < 1) { g.beginPath(); g.rect(x0 - 12, y - sz * 1.4, (w + 24) * q, sz * 2.2); g.clip(); }
    if (o.rot) { g.translate(x0, y); g.rotate(o.rot); g.translate(-x0, -y); }
    g.textAlign = "left"; g.textBaseline = o.base || "alphabetic";
    if (o.glow) { g.shadowColor = o.glowColor || o.color; g.shadowBlur = o.glow; }
    g.fillStyle = o.color || "#fff";
    g.fillText(s, x0, y);
    if (o.wax) { g.shadowBlur = 0; g.globalAlpha *= 0.35; g.fillText(s, x0 + 1.2, y + 0.8); }
    g.restore();
  });
  // A lead marker: a bright plate with dark lettering.
  const plate = deferable(function (g, th, s, cx, cy, size, color, a = 1) {
    const u = th.u;
    g.save(); g.font = `700 ${size}px ${COND}`;
    const w = g.measureText(s).width + size * 0.9, h = size * 1.45;
    g.globalAlpha *= a;
    g.shadowColor = rgba(color, 0.9); g.shadowBlur = 20 * u;
    rr(g, cx - w / 2, cy - h / 2, w, h, 7 * u); g.fillStyle = rgba(color, 1); g.fill();
    g.shadowBlur = 0;
    g.fillStyle = th.dark; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(s, cx, cy + size * 0.04);
    g.restore();
  });
  // Grease pencil: a wobbling stroke drawn from 0 to q of its length.
  const waxLine = deferable(function (g, pts, w, color, q = 1, seed = 1) {
    if (q <= 0 || pts.length < 2) return;
    const r = rng(seed * 31 + 5);
    let total = 0; const seg = [];
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); total += l; }
    const left = total * clamp(q);
    g.save(); g.lineCap = "round"; g.lineJoin = "round";
    const base = g.globalAlpha;
    for (const [k, al, off] of [[1, 0.88, 0], [0.5, 0.5, w * 0.22]]) {
      g.lineWidth = w * k; g.strokeStyle = color; g.globalAlpha = base * al; g.beginPath();
      let rem = left;
      for (let i = 0; i < pts.length; i++) {
        const [x, y] = pts[i];
        const jx = (r() - 0.5) * w * 0.35 + off, jy = (r() - 0.5) * w * 0.35;
        if (i === 0) { g.moveTo(x + jx, y + jy); continue; }
        const l = seg[i - 1];
        if (rem >= l) { g.lineTo(x + jx, y + jy); rem -= l; }
        else { const f = rem / Math.max(0.0001, l), px = pts[i - 1][0], py = pts[i - 1][1]; g.lineTo(lerp(px, x, f) + jx, lerp(py, y, f) + jy); break; }
      }
      g.stroke();
    }
    g.restore();
  });
  function waxEllipse(g, cx, cy, rx, ry, w, color, q, seed = 1, turns = 1.12) {
    const r = rng(seed * 17 + 3), ph = r() * TAU, pts = [];
    const n = 48;
    for (let i = 0; i <= n; i++) {
      const a = ph + (i / n) * TAU * turns, grow = 1 + (i / n) * 0.06 + Math.sin(a * 2.3 + seed) * 0.025;
      pts.push([cx + Math.cos(a) * rx * grow, cy + Math.sin(a) * ry * grow]);
    }
    waxLine(g, pts, w, color, q, seed);
  }
  // A curved arrow; the head lands once the shaft is nearly drawn.
  function waxArrow(g, x1, y1, x2, y2, bend, w, color, q, seed = 1) {
    const mx = (x1 + x2) / 2 - (y2 - y1) * bend, my = (y1 + y2) / 2 + (x2 - x1) * bend, pts = [];
    for (let i = 0; i <= 24; i++) { const k = i / 24; pts.push([(1 - k) * (1 - k) * x1 + 2 * (1 - k) * k * mx + k * k * x2, (1 - k) * (1 - k) * y1 + 2 * (1 - k) * k * my + k * k * y2]); }
    waxLine(g, pts, w, color, Math.min(1, q * 1.15), seed);
    if (q > 0.86) {
      const k = 0.94, bx = (1 - k) * (1 - k) * x1 + 2 * (1 - k) * k * mx + k * k * x2, by = (1 - k) * (1 - k) * y1 + 2 * (1 - k) * k * my + k * k * y2;
      const a = Math.atan2(y2 - by, x2 - bx), hl = w * 5;
      waxLine(g, [[x2 - Math.cos(a - 0.5) * hl, y2 - Math.sin(a - 0.5) * hl], [x2, y2], [x2 - Math.cos(a + 0.5) * hl, y2 - Math.sin(a + 0.5) * hl]], w, color, span(q, 0.86, 1), seed + 1);
    }
  }

  // ---- film ---------------------------------------------------------------------------------------
  let NOISE = null, BLOT = null;
  function noiseTile() {
    if (NOISE) return NOISE;
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d"), img = g.createImageData(256, 256), r = rng(5);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.pow(r(), 2.2) * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    return (NOISE = c);
  }
  // Uneven emulsion density: soft blotches of fog, seamless so it can tile.
  function blotTile() {
    if (BLOT) return BLOT;
    const c = document.createElement("canvas"); c.width = c.height = 512;
    const g = c.getContext("2d"), r = rng(91);
    for (let i = 0; i < 70; i++) {
      const x = r() * 512, y = r() * 512, rad = 30 + r() * 170, a = 0.05 + r() * 0.22;
      for (const ox of [-512, 0, 512]) for (const oy of [-512, 0, 512]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = gr; g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
      }
    }
    return (BLOT = c);
  }
  function metalClip(g, th, x, y) {
    const u = th.u, w = 64 * u, h = 40 * u;
    g.save();
    g.shadowColor = "rgba(0,0,0,0.4)"; g.shadowBlur = 8 * u; g.shadowOffsetY = 4 * u;
    g.beginPath(); g.moveTo(x - w * 0.5, y - h * 0.55); g.lineTo(x + w * 0.5, y - h * 0.55); g.lineTo(x + w * 0.36, y + h * 0.45); g.lineTo(x - w * 0.36, y + h * 0.45); g.closePath();
    const gr = g.createLinearGradient(x - w / 2, y, x + w / 2, y);
    gr.addColorStop(0, "#7d8794"); gr.addColorStop(0.3, "#e4eaf0"); gr.addColorStop(0.55, "#9aa4b0"); gr.addColorStop(1, "#5f6873");
    g.fillStyle = gr; g.fill(); g.shadowBlur = 0;
    g.strokeStyle = "rgba(20,28,40,0.55)"; g.lineWidth = 1.5 * u; g.stroke();
    g.beginPath(); g.arc(x, y - h * 0.12, 5.5 * u, 0, TAU); g.fillStyle = "rgba(20,28,40,0.6)"; g.fill();
    g.restore();
  }
  // Base fog: the film is never flat black; density pools unevenly and drifts.
  function baseFog(g, th, R, o) {
    const u = th.u, t = th.t, seed = o.seed || 1;
    g.save(); g.globalCompositeOperation = "lighter";
    const cx = R.x + R.w * (0.35 + 0.3 * ((seed * 0.37) % 1)), cy = R.y + R.h * (0.4 + 0.2 * ((seed * 0.61) % 1));
    const fg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(R.w, R.h) * 0.8);
    fg.addColorStop(0, rgba(th.fog, o.lite ? 0.1 : 0.12)); fg.addColorStop(1, rgba(th.fog, 0));
    g.fillStyle = fg; g.fillRect(R.x, R.y, R.w, R.h);
    const tile = blotTile(), sc = (o.lite ? 1.1 : 1.6) * u * 1.4, ts = 512 * sc;
    const ox = R.x - ((seed * 137 + t * 3 * u) % ts) - ts * 0.2, oy = R.y - ((seed * 71) % ts);
    g.globalAlpha = (o.lite ? 0.12 : 0.17) * (0.4 + 0.6 * th.tex);
    for (let x = ox; x < R.x + R.w; x += ts) for (let y = oy; y < R.y + R.h; y += ts) g.drawImage(tile, x, y, ts, ts);
    g.restore();
  }
  function overlay(g, th, R, o) {
    const u = th.u, t = th.t, tex = th.tex;
    g.save(); g.globalCompositeOperation = "lighter";
    const r = rng((o.seed || 1) * 7 + 3);
    if (tex > 0.02) {
      // Grain that crawls: fine speckle plus a clumped pass at twice the size.
      const k = Math.floor(t * 12), ox = (k * 37) % 256, oy = (k * 91) % 256;
      const pat = g.createPattern(noiseTile(), "repeat");
      g.globalAlpha = (o.lite ? 0.1 : 0.16) * tex;
      g.translate(-ox, -oy); g.fillStyle = pat; g.fillRect(R.x + ox, R.y + oy, R.w, R.h); g.translate(ox, oy);
      if (!o.lite) {
        g.globalAlpha = 0.07 * tex;
        g.save(); g.translate(R.x - oy, R.y - ox); g.scale(2.2, 2.2); g.fillStyle = pat; g.fillRect(0, 0, R.w / 2.2 + 256, R.h / 2.2 + 256); g.restore();
      }
      g.globalAlpha = 1;
    }
    if (!o.lite) {
      // Scratches that flicker, long hairlines, dust that twinkles.
      const n = Math.round(9 * tex);
      for (let i = 0; i < n; i++) {
        const x = R.x + r() * R.w, y0 = R.y + r() * R.h, len = (40 + r() * 220) * u, sl = (r() - 0.5) * 0.5, a = 0.05 + r() * 0.1, fl = 0.55 + 0.45 * Math.sin(t * 1.3 + i * 2.1);
        g.strokeStyle = rgba(WHITE, a * fl); g.lineWidth = (0.6 + r() * 0.8) * u; g.beginPath(); g.moveTo(x, y0); g.quadraticCurveTo(x + len * sl * 0.3, y0 + len * 0.5, x + len * sl, y0 + len); g.stroke();
      }
      for (let i = 0; i < Math.round(2 * tex); i++) {
        const x = R.x + R.w * (0.15 + r() * 0.7) + Math.sin(t * 0.7 + i) * 3 * u, a = 0.06 + 0.05 * Math.sin(t * 2.3 + i * 3);
        g.strokeStyle = rgba(WHITE, a); g.lineWidth = 0.8 * u; g.beginPath(); g.moveTo(x, R.y);
        for (let y = R.y; y <= R.y + R.h; y += 40 * u) g.lineTo(x + Math.sin(y * 0.01 + i) * 4 * u, y);
        g.stroke();
      }
      const dn = Math.round(22 * tex);
      for (let i = 0; i < dn; i++) {
        const x = R.x + r() * R.w, y = R.y + r() * R.h, rad = (0.8 + r() * 2) * u, ph = r() * 6, sp = 0.6 + r() * 1.8;
        const a = (0.1 + r() * 0.3) * Math.max(0, Math.sin(t * sp + ph));
        g.fillStyle = rgba(WHITE, a); disc(g, x, y, rad); g.fill();
      }
    }
    // A read-out band sweeps down the film every few seconds.
    const per = 3.6, ph = (((th.t + (o.scan || 0)) % per) + per) % per / per;
    const sy = R.y - R.h * 0.2 + R.h * 1.4 * ph, bh = R.h * 0.24;
    const gr = g.createLinearGradient(0, sy - bh, 0, sy + bh);
    gr.addColorStop(0, "rgba(150,190,230,0)"); gr.addColorStop(0.5, `rgba(160,200,240,${o.lite ? 0.04 : 0.06})`); gr.addColorStop(1, "rgba(150,190,230,0)");
    g.fillStyle = gr; g.fillRect(R.x, sy - bh, R.w, bh * 2);
    g.restore();
  }
  // Edge print: the stock code and frame numbers burnt into the film margin.
  function edgePrint(g, th, R, seed) {
    const u = th.u, size = 15 * u;
    g.save(); g.font = `600 ${size}px ${MONO}`; g.textBaseline = "middle";
    g.fillStyle = "rgba(255,186,110,0.42)";
    const y = R.y + 14 * u, step = 360 * u;
    for (let i = 0, x = R.x + 26 * u; x < R.x + R.w - 120 * u; i++, x += step) {
      g.fillText(`▸ XR-400  ${String(seed * 7 + i).padStart(3, "0")}A  SAFETY`, x, y);
    }
    // Notch code at the corner.
    g.fillStyle = "rgba(255,186,110,0.3)";
    for (let i = 0; i < 4; i++) g.fillRect(R.x + R.w - (30 + i * 12) * u, R.y + 8 * u, 6 * u, (i % 2 ? 8 : 14) * u);
    g.restore();
  }
  // Device-space bounds of a (possibly transformed) rect, for clearing and exposing the layer.
  function bounds(g, r, pad, W, H) {
    const m = g.getTransform(), xs = [], ys = [];
    for (const [x, y] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) { xs.push(m.a * x + m.c * y + m.e); ys.push(m.b * x + m.d * y + m.f); }
    const x0 = Math.max(0, Math.floor(Math.min(...xs) - pad)), y0 = Math.max(0, Math.floor(Math.min(...ys) - pad));
    const x1 = Math.min(W, Math.ceil(Math.max(...xs) + pad)), y1 = Math.min(H, Math.ceil(Math.max(...ys) + pad));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  // Expose the density layer onto the film: a wide soft halo, a body, then a near-sharp core.
  function expose(g, th, bb, lite) {
    if (bb.w <= 0 || bb.h <= 0) return;
    const u = th.u, a0 = g.globalAlpha;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "lighter";
    const passes = lite ? [[9 * u, 0.9], [2.2 * u, 0.85]] : [[26 * u, 0.75], [7 * u, 0.85], [1.6 * u, 0.8]];
    for (const [b, al] of passes) {
      g.filter = `blur(${b.toFixed(1)}px)`; g.globalAlpha = a0 * al;
      g.drawImage(LAYER, bb.x, bb.y, bb.w, bb.h, bb.x, bb.y, bb.w, bb.h);
    }
    g.restore();
  }
  // A sheet of film: acetate rim, black emulsion, exposed density, annotations, texture, clips.
  function film(g, th, r, o, draw) {
    const u = th.u, b = (o.border ?? 13) * u;
    g.save();
    if (o.rot) { g.translate(r.x + r.w / 2, r.y + r.h / 2); g.rotate(o.rot); g.translate(-(r.x + r.w / 2), -(r.y + r.h / 2)); }
    g.save(); g.shadowColor = "rgba(8,18,34,0.5)"; g.shadowBlur = 38 * u; g.shadowOffsetY = 14 * u; rr(g, r.x, r.y, r.w, r.h, 16 * u); g.fillStyle = rgba(th.rim, 1); g.fill(); g.restore();
    const gr = g.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    gr.addColorStop(0, rgba(mix(th.rim, WHITE, 0.4), 1)); gr.addColorStop(0.5, rgba(th.rim, 1)); gr.addColorStop(1, rgba(mix(th.rim, [0, 0, 0], 0.3), 1));
    rr(g, r.x, r.y, r.w, r.h, 16 * u); g.fillStyle = gr; g.fill();
    const R = { x: r.x + b, y: r.y + b, w: r.w - 2 * b, h: r.h - 2 * b };
    rr(g, R.x, R.y, R.w, R.h, 6 * u); g.fillStyle = th.film; g.fill();
    g.save(); rr(g, R.x, R.y, R.w, R.h, 6 * u); g.clip();
    baseFog(g, th, R, o);
    if (draw && !DENS) {
      const bb = bounds(g, R, 4 * u, th.W, th.H);
      const lc = layer(th.W, th.H);
      lc.setTransform(1, 0, 0, 1, 0, 0); lc.clearRect(bb.x, bb.y, bb.w, bb.h);
      lc.save(); lc.setTransform(g.getTransform()); rr(lc, R.x, R.y, R.w, R.h, 6 * u); lc.clip();
      DENS = lc; DEFER = [];
      draw(R);
      const queued = DEFER; DENS = null; DEFER = null;
      lc.restore();
      expose(g, th, bb, o.lite);
      if (!o.lite) edgePrint(g, th, R, o.seed || 1);
      overlay(g, th, R, o);
      for (const f of queued) f();
    } else {
      overlay(g, th, R, o);
    }
    g.restore();
    rr(g, R.x, R.y, R.w, R.h, 6 * u); g.strokeStyle = "rgba(0,0,0,0.55)"; g.lineWidth = 2 * u; g.stroke();
    if (o.clips !== false) { metalClip(g, th, r.x + r.w * 0.2, r.y + 2 * u); metalClip(g, th, r.x + r.w * 0.8, r.y + 2 * u); }
    g.restore();
    return R;
  }

  // ---- specimens: radiographs of original subjects ---------------------------------------------------
  function nautilus(g, th, cx, cy, s, t, a) {
    const turns = 3.1, tm = turns * TAU, k = Math.log(1 / 0.05) / tm, rot = t * 0.06;
    const rad = (th2) => s * Math.exp(-k * (tm - th2));
    const pt = (th2, f = 1) => [cx + Math.cos(th2 + rot) * rad(th2) * f, cy + Math.sin(th2 + rot) * rad(th2) * f];
    // Mass: each whorl fills its own loop, so the inner turns stack into a dense bright core.
    for (let w = 0; w < 3; w++) {
      const hi = tm - w * TAU, lo = hi - TAU;
      xf(g, th, 0.13 * a, th.bone, (c) => { c.beginPath(); for (let i = 0; i <= 60; i++) { const p = pt(lo + (hi - lo) * (i / 60)); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); } c.closePath(); });
    }
    xf(g, th, 0.3 * a, th.bone, (c) => disc(c, pt(0.6)[0], pt(0.6)[1], s * 0.07));
    // Shell wall: thick and dense, brighter where it curls back on itself.
    xr(g, th, Math.max(2, s * 0.03), a * 0.8, th.bone, (c) => { c.beginPath(); for (let i = 0; i <= 160; i++) { const p = pt((i / 160) * tm); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); } });
    for (let i = 0; i < 24; i++) {
      const th2 = tm - 0.4 - i * 0.42; if (th2 < 1) break;
      const p1 = pt(th2), p2 = pt(th2 - TAU * 0.98);
      const gl = 0.55 + 0.45 * Math.sin(t * 1.7 - i * 0.55);
      xr(g, th, Math.max(1.4, s * 0.012), a * 0.7 * gl, th.bone, (c) => { c.beginPath(); c.moveTo(p1[0], p1[1]); c.quadraticCurveTo((p1[0] + p2[0]) / 2 + (cy - p1[1]) * 0.05, (p1[1] + p2[1]) / 2 + (p1[0] - cx) * 0.05, p2[0], p2[1]); });
    }
  }
  function fish(g, th, cx, cy, s, t, a) {
    const n = 24, amp = s * 0.04, body = (k) => [cx - s * 0.5 + k * s * 0.82, cy + Math.sin(k * 5 - t * 2.2) * amp * k];
    const prof = (k) => s * 0.13 * Math.sin(Math.PI * clamp(k * 0.9 + 0.08)) * (1 - 0.35 * k);
    const outline = (c, f) => { c.beginPath(); for (let i = 0; i <= 24; i++) { const k = i / 24, p = body(k); c.lineTo(p[0], p[1] - prof(k) * f); } for (let i = 24; i >= 0; i--) { const k = i / 24, p = body(k); c.lineTo(p[0], p[1] + prof(k) * f); } c.closePath(); };
    xf(g, th, 0.1 * a, th.bone, (c) => outline(c, 1));
    xf(g, th, 0.08 * a, th.bone, (c) => outline(c, 0.55));
    xr(g, th, Math.max(2, s * 0.014), a * 0.9, th.bone, (c) => { c.beginPath(); for (let i = 0; i <= 24; i++) { const k = i / 24, p = body(k); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); } });
    for (let i = 1; i < n; i++) {
      const k = i / n, p = body(k), hh = prof(k) * 0.55;
      xr(g, th, Math.max(1.4, s * 0.008), a * 0.7, th.bone, (c) => { c.beginPath(); c.moveTo(p[0], p[1] - hh * 0.35); c.lineTo(p[0], p[1] + hh * 0.35); });
      if (i > 5 && i < 16) for (const sg of [-1, 1]) xr(g, th, Math.max(1, s * 0.004), a * 0.5, th.bone, (c) => { c.beginPath(); c.moveTo(p[0], p[1]); c.quadraticCurveTo(p[0] + s * 0.03, p[1] + sg * prof(k) * 0.55, p[0] + s * 0.05, p[1] + sg * prof(k) * 0.95); });
    }
    const head = body(0.04);
    xf(g, th, 0.22 * a, th.bone, (c) => { c.beginPath(); c.ellipse(head[0] + s * 0.07, head[1], s * 0.1, s * 0.085, 0, 0, TAU); });
    cut(g, 0.7 * a, (c) => disc(c, head[0] + s * 0.04, head[1] - s * 0.02, s * 0.022));
    const tail = body(1), wag = Math.sin(-t * 2.2 + 5) * 0.28;
    xf(g, th, 0.08 * a, th.bone, (c) => { c.beginPath(); c.moveTo(tail[0], tail[1]); for (let i = -4; i <= 4; i++) c.lineTo(tail[0] + Math.cos(i * 0.16 + wag) * s * 0.17, tail[1] + Math.sin(i * 0.16 + wag) * s * 0.17); c.closePath(); });
    for (let i = -4; i <= 4; i++) xr(g, th, Math.max(1, s * 0.004), a * 0.5, th.bone, (c) => { c.beginPath(); c.moveTo(tail[0], tail[1]); c.lineTo(tail[0] + Math.cos(i * 0.16 + wag) * s * 0.17, tail[1] + Math.sin(i * 0.16 + wag) * s * 0.17); });
  }
  function leaf(g, th, cx, cy, s, t, a) {
    const rot = -0.5 + Math.sin(t * 0.4) * 0.05, cs = Math.cos(rot), sn = Math.sin(rot);
    const P = (x, y) => [cx + (x * cs - y * sn) * s, cy + (x * sn + y * cs) * s];
    const halfw = (x) => 0.2 * Math.sin(Math.PI * clamp(x)) * (1 - 0.3 * x) + 0.01;
    const blade = (c, f) => { c.beginPath(); for (let i = 0; i <= 30; i++) { const x = i / 30, p = P(x - 0.5, -halfw(x) * f); c.lineTo(p[0], p[1]); } for (let i = 30; i >= 0; i--) { const x = i / 30, p = P(x - 0.5, halfw(x) * f); c.lineTo(p[0], p[1]); } c.closePath(); };
    xf(g, th, 0.12 * a, th.bone, (c) => blade(c, 1));
    xf(g, th, 0.08 * a, th.bone, (c) => blade(c, 0.5));
    xr(g, th, Math.max(2, s * 0.02), a, th.bone, (c) => { c.beginPath(); const p0 = P(-0.58, 0), p1 = P(0.5, 0); c.moveTo(p0[0], p0[1]); c.lineTo(p1[0], p1[1]); });
    for (let i = 1; i < 11; i++) {
      const x = i / 11, gl = 0.6 + 0.4 * Math.sin(t * 1.5 - i * 0.6);
      for (const sg of [-1, 1]) xr(g, th, Math.max(1, s * 0.007), a * 0.6 * gl, th.bone, (c) => { c.beginPath(); const p0 = P(x - 0.5, 0), p1 = P(x - 0.5 + 0.12, sg * halfw(x + 0.12) * 0.92); c.moveTo(p0[0], p0[1]); c.quadraticCurveTo(...P(x - 0.5 + 0.02, sg * halfw(x) * 0.5), p1[0], p1[1]); });
    }
  }
  // A key: metal is the densest thing on a film, so it burns nearly white.
  function keyS(g, th, cx, cy, s, t, a) {
    const rot = 0.35 + Math.sin(t * 0.5) * 0.04;
    g.save(); g.translate(cx, cy); g.rotate(rot);
    xf(g, th, 0.42 * a, th.bone, (c) => disc(c, -s * 0.34, 0, s * 0.17));
    cut(g, 0.95, (c) => disc(c, -s * 0.34, 0, s * 0.075));
    xf(g, th, 0.42 * a, th.bone, (c) => { c.beginPath(); c.rect(-s * 0.18, -s * 0.03, s * 0.64, s * 0.06); });
    xf(g, th, 0.42 * a, th.bone, (c) => { c.beginPath(); c.moveTo(s * 0.28, s * 0.02); c.lineTo(s * 0.28, s * 0.1); c.lineTo(s * 0.33, s * 0.13); c.lineTo(s * 0.37, s * 0.08); c.lineTo(s * 0.41, s * 0.15); c.lineTo(s * 0.46, s * 0.1); c.lineTo(s * 0.46, s * 0.02); c.closePath(); });
    xr(g, th, Math.max(1.2, s * 0.006), a * 0.6, th.bone, (c) => { c.beginPath(); c.moveTo(-s * 0.12, -s * 0.008); c.lineTo(s * 0.44, -s * 0.008); });
    xr(g, th, Math.max(1.4, s * 0.01), a * 0.5, th.bone, (c) => disc(c, -s * 0.34, 0, s * 0.165));
    g.restore();
  }
  const SPECIMENS = [nautilus, fish, leaf, keyS];

  // ---- the lightbox, the wall of films -------------------------------------------------------------
  function lightbox(g, th) {
    const { W, H, u, t } = th;
    const gr = g.createRadialGradient(W * 0.5 + Math.sin(t * 0.35) * W * 0.07, H * 0.42 + Math.cos(t * 0.27) * H * 0.04, 0, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.62);
    gr.addColorStop(0, rgba(th.lb, 1)); gr.addColorStop(1, rgba(th.lb2, 1));
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.save(); g.globalCompositeOperation = "lighter";
    const bandW = 260 * u, gap = W / 5.5;
    for (let k = -1; k < 8; k++) {
      const x = ((k * gap + t * 22 * u) % (gap * 8)) - gap;
      const b = g.createLinearGradient(x - bandW, 0, x + bandW, 0);
      b.addColorStop(0, "rgba(255,255,255,0)"); b.addColorStop(0.5, `rgba(255,255,255,${0.1 + 0.03 * Math.sin(t * 2.1 + k)})`); b.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = b; g.fillRect(x - bandW, 0, bandW * 2, H);
    }
    g.restore();
    const r = rng(77), dn = Math.round(40 * th.tex);
    for (let i = 0; i < dn; i++) {
      const sp = (6 + r() * 14) * u, x = (r() * W + t * sp * 0.6) % W, y = ((r() * H - t * sp) % H + H) % H, rad = (1 + r() * 2.6) * u, ph = r() * 6;
      g.fillStyle = `rgba(30,50,80,${(0.1 + 0.2 * r()) * (0.5 + 0.5 * Math.sin(t * 0.9 + ph))})`; disc(g, x, y, rad); g.fill();
    }
    const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    v.addColorStop(0, "rgba(10,24,44,0)"); v.addColorStop(1, `rgba(10,24,44,${th.light ? 0.2 : 0.5})`);
    g.fillStyle = v; g.fillRect(0, 0, W, H);
  }
  function decor(g, th, cover) {
    const { W, H, u, t } = th;
    const moving = Math.abs(CUR.cam - Math.round(CUR.cam)) > 0.001;
    const rows = th.tall
      ? [{ y: 0.05, h: 0.28, par: 0.5, sp: 10 }, { y: 0.62, h: 0.34, par: 0.34, sp: -7 }, { y: 0.9, h: 0.3, par: 0.62, sp: 9 }]
      : [{ y: 0.08, h: 0.46, par: 0.5, sp: 10 }, { y: 0.56, h: 0.5, par: 0.34, sp: -7 }, { y: 0.88, h: 0.34, par: 0.62, sp: 9 }];
    rows.forEach((row, ri) => {
      const sp = 560 * u, off = -CUR.cam * W * PITCH * row.par + t * row.sp * u;
      const k0 = Math.floor((-off - 500 * u) / sp), k1 = Math.ceil((W - off + 200 * u) / sp);
      for (let k = k0; k <= k1; k++) {
        const hsh = Math.abs(Math.sin(k * 12.9898 + ri * 78.233)) % 1;
        const w = (300 + hsh * 140) * u, h = row.h * H, x = k * sp + off + hsh * 90 * u, y = row.y * H;
        if (!moving && x > cover.x + 6 * u && x + w < cover.x + cover.w - 6 * u && y > cover.y && y + h < cover.y + cover.h) continue;
        if (x > W + 40 * u || x + w < -40 * u) continue;
        const kind = ((k % 4) + 4) % 4;
        film(g, th, { x, y, w, h }, { seed: 31 + ri * 9 + (((k % 7) + 7) % 7), rot: ((((k % 5) + 5) % 5) - 2) * 0.016, lite: true, scan: ri * 1.1 + k, border: 11, clips: ri !== 1 }, (R) => {
          SPECIMENS[kind](g, th, R.x + R.w * 0.5, R.y + R.h * 0.5, Math.min(R.w, R.h) * (kind === 1 ? 1.15 : 0.62), t + k * 3, 0.8);
        });
      }
    });
  }
  function ecg(g, th, x0, x1, y, amp, a, col) {
    const sp = 140 * th.u, per = 360 * th.u, g2 = (v, c, w) => Math.exp(-Math.pow((v - c) / w, 2));
    xr(g, th, 2.6 * th.u, a, col || th.bone, (c) => {
      c.beginPath();
      for (let x = x0; x <= x1; x += 3 * th.u) {
        const p = (((x - th.t * sp) / per) % 1 + 1) % 1;
        const v = 0.1 * g2(p, 0.2, 0.04) - 0.16 * g2(p, 0.46, 0.011) + g2(p, 0.5, 0.013) - 0.26 * g2(p, 0.54, 0.014) + 0.22 * g2(p, 0.75, 0.06);
        x === x0 ? c.moveTo(x, y - v * amp) : c.lineTo(x, y - v * amp);
      }
    });
  }
  function wedge(g, th, x, y, w, h, q, horizontal) {
    // Calibration step wedge: steps from dense to clear.
    const n = 9;
    for (let i = 0; i < n; i++) {
      const k = span(q, i / n * 0.6, i / n * 0.6 + 0.4);
      if (k <= 0) continue;
      const a = lerp(0.85, 0.06, i / (n - 1)) * (0.85 + 0.15 * Math.sin(th.t * 1.8 - i * 0.7)) * k;
      xf(g, th, a, th.bone, (c) => { c.beginPath(); if (horizontal) c.rect(x + (w / n) * i, y, w / n - 2 * th.u, h); else c.rect(x, y + (h / n) * i, w, h / n - 2 * th.u); });
    }
  }
  function layout(th, box) {
    const u = th.u, tall = th.tall, H = th.H;
    const main = { x: box.x - 40 * u, y: box.y - 10 * u, w: box.w + 80 * u, h: box.h + 28 * u };
    const mast = tall ? { x: main.x, y: 84 * u, w: main.w, h: 382 * u } : { x: main.x, y: 44 * u, w: main.w, h: 264 * u };
    const stmt = tall ? { x: main.x, y: 84 * u, w: main.w, h: H - 84 * u - 100 * u } : { x: main.x, y: 64 * u, w: main.w, h: H - 64 * u - 72 * u };
    return { main, mast, stmt };
  }
  let BOX = null;

  // ---- headlines pinned to their films ----------------------------------------------------------------
  // The template's headline is DOM text. The look reads its laid-out geometry once, slides it with its
  // page (CSS `translate`, which the template's own transform tweens leave alone), clears density behind
  // it, develops it out of fog on arrival and keeps a copy on the film while it leaves.
  let PREPPED = false;
  const GEO = {};
  function prepDom() {
    if (PREPPED || typeof document === "undefined") return;
    PREPPED = true;
    for (const id of ["title", "closing"]) {
      const el = document.getElementById(id);
      if (el && el.textContent) el.textContent = el.textContent.replace(/([.!?])\s+(?=\S)/g, "$1\n");
    }
  }
  function geo(id) {
    if (GEO[id] !== undefined) return GEO[id];
    const el = typeof document !== "undefined" && document.getElementById(id);
    if (!el || !el.textContent.trim()) return (GEO[id] = null);
    const sc = el.parentElement, cs = getComputedStyle(el), size = parseFloat(cs.fontSize) || 60;
    const G = {
      id, x: sc.offsetLeft + el.offsetLeft, y: sc.offsetTop + el.offsetTop, w: el.offsetWidth, h: el.offsetHeight, size,
      font: `${cs.fontWeight} ${size}px ${cs.fontFamily}`, ls: cs.letterSpacing && cs.letterSpacing !== "normal" ? cs.letterSpacing : "0px",
      lh: parseFloat(cs.lineHeight) || size * 1.04, padL: parseFloat(cs.paddingLeft) || 0, padT: parseFloat(cs.paddingTop) || 0,
      upper: cs.textTransform === "uppercase", kicker: id === "kicker", lines: [],
    };
    const c = document.createElement("canvas").getContext("2d");
    c.font = G.font; c.letterSpacing = G.ls;
    // Lines exactly as the browser broke them: group words by the top of their box (transforms keep order).
    const node = el.firstChild, raw = el.textContent, words = [];
    if (node && node.nodeType === 3) {
      const re = /\S+/g; let m;
      const range = document.createRange();
      while ((m = re.exec(raw))) { range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length); const r = range.getClientRects()[0]; words.push([m[0], r ? r.top : 0]); }
    }
    let top = null, line = [];
    for (const [w, tp] of words) {
      if (top !== null && Math.abs(tp - top) > size * 0.4) { G.lines.push(line.join(" ")); line = []; }
      if (!line.length) top = tp;
      line.push(w);
    }
    if (line.length) G.lines.push(line.join(" "));
    if (G.upper) G.lines = G.lines.map((l) => l.toUpperCase());
    G.lineW = G.lines.map((l) => c.measureText(l).width);
    return (GEO[id] = G);
  }
  const HEADS = (id) => (id === "title" ? ["kicker", "title"] : id === "closing" ? ["closing"] : [`${id}-title`]);
  // Clear density behind the headline so type always sits on clean emulsion.
  function clearHead(g, ids, a) {
    for (const id of ids) {
      const G = geo(id); if (!G) continue;
      G.lines.forEach((_, i) => cut(g, a, (c) => { c.beginPath(); c.rect(G.x - 30, G.y + i * G.lh - 10, G.lineW[i] + 60, G.lh + 20); }, 22));
    }
  }
  function drawHead(g, th, G, alpha, blur, fog) {
    if (alpha <= 0.004) return;
    const u = th.u;
    g.save();
    if (fog > 0.004) {
      // Fog-to-clear: a milky exposure over the type that clears as it develops.
      g.save(); g.globalCompositeOperation = "lighter"; g.filter = `blur(${(26 * u).toFixed(1)}px)`; g.fillStyle = rgba([150, 180, 210], 0.32 * fog);
      G.lines.forEach((_, i) => g.fillRect(G.x - 20 * u, G.y + i * G.lh, (G.kicker ? G.w : G.lineW[i]) + 40 * u, G.lh));
      g.restore();
    }
    if (blur > 0.2) g.filter = `blur(${blur.toFixed(1)}px)`;
    g.globalAlpha *= alpha;
    if (G.kicker) {
      g.shadowColor = th.accS; g.shadowBlur = 22 * u;
      rr(g, G.x, G.y, G.w, G.h, 6 * u); g.fillStyle = th.accS; g.fill(); g.shadowBlur = 0;
      g.font = G.font; g.letterSpacing = G.ls; g.textBaseline = "middle"; g.fillStyle = th.onAccent;
      g.fillText(G.lines[0] || "", G.x + G.padL, G.y + G.h / 2);
    } else {
      g.font = G.font; g.letterSpacing = G.ls; g.textBaseline = "middle"; g.fillStyle = th.ink;
      g.shadowColor = "rgba(110,170,255,0.5)"; g.shadowBlur = 18 * u;
      G.lines.forEach((l, i) => g.fillText(l, G.x + G.padL, G.y + G.padT + i * G.lh + G.lh / 2));
    }
    g.restore();
  }
  // Called from inside a page's film draw: queued, so it lands over the exposed density.
  const headLayer = deferable(function (g, th, ids, local, hold, change, entrance, last) {
    ids.forEach((id, i) => {
      const G = geo(id); if (!G) return;
      // Arrival: the DOM type fades in (expo-out); a fogged exposure stands in for it from the first frame.
      const k = (local - i * 0.12) / Math.max(0.05, entrance);
      const dev = k <= 0 ? 1 : Math.pow(2, -10 * clamp(k));
      if (dev > 0.01) drawHead(g, th, G, 0.95 * dev, (3 + 7 * dev) * th.u, dev);
      // Departure: as the DOM type frosts away (1 - k²), a sharp copy stays on the film and leaves with it.
      if (!last && local > hold - change) drawHead(g, th, G, local >= hold ? 1 : Math.pow(clamp((local - (hold - change)) / Math.max(0.01, change)), 2), 0, 0);
    });
  });

  function masthead(g, th, L, sc, local, H) {
    const u = th.u;
    film(g, th, L.mast, { seed: 3 + H.j * 2, scan: 1.3 + H.j }, (R) => {
      const t = th.t;
      fish(g, th, R.x + ((t * 40 * u + R.w * 0.2 + H.j * 300 * u) % (R.w * 1.5)) - R.w * 0.2, R.y + R.h * 0.55, R.h * 1.25, t, 0.22);
      nautilus(g, th, R.x + R.w * 0.88, R.y + R.h * 0.5, R.h * 0.78, t + 4 + H.j, 0.32);
      ecg(g, th, R.x, R.x + R.w, R.y + R.h - 34 * u, 30 * u, 0.55);
      wedge(g, th, R.x + R.w - 340 * u, R.y + R.h - 26 * u, 300 * u, 10 * u, 1, true);
      clearHead(g, HEADS(sc.id), 0.8);
      headLayer(g, th, HEADS(sc.id), local, sc.hold, H.change, H.entrance, H.last);
    });
  }

  // ---- title and closing statements -----------------------------------------------------------------
  function statement(g, th, L, sc, local, H) {
    const u = th.u, t = th.t, closing = sc.id === "closing", tall = th.tall;
    film(g, th, L.stmt, { seed: closing ? 9 : 5, scan: closing ? 2.2 : 0 }, (R) => {
      const m = Math.min(R.w, R.h);
      if (!closing) {
        nautilus(g, th, R.x + R.w * (tall ? 0.6 : 0.79), R.y + R.h * (tall ? 0.76 : 0.52), m * (tall ? 0.56 : 0.5), t, 0.85);
        fish(g, th, R.x + ((t * 55 * u + R.w * 0.1) % (R.w * 1.5)) - R.w * 0.25, R.y + R.h * (tall ? 0.16 : 0.84), Math.min(R.w * 0.6, 640 * u), t, 0.5);
        leaf(g, th, R.x + R.w * (tall ? 0.18 : 0.12), R.y + R.h * (tall ? 0.88 : 0.2), 240 * u, t, 0.5);
      } else {
        // Key low on the right, the signed-off tick high on the right: both clear of the type and of each other.
        keyS(g, th, R.x + R.w * (tall ? 0.6 : 0.83), R.y + R.h * (tall ? 0.82 : 0.7), m * (tall ? 0.5 : 0.44), t, 0.9);
        leaf(g, th, R.x + R.w * (tall ? 0.22 : 0.58), R.y + R.h * (tall ? 0.9 : 0.14), 260 * u, t + 2, 0.5);
        nautilus(g, th, R.x + R.w * (tall ? 0.16 : 0.1), R.y + R.h * (tall ? 0.16 : 0.84), 230 * u, -t, 0.5);
      }
      ecg(g, th, R.x, R.x + R.w, R.y + R.h - 60 * u, 52 * u, 0.62, closing ? th.acc : th.bone);
      wedge(g, th, R.x + 30 * u, R.y + R.h - 28 * u, Math.min(380 * u, R.w * 0.4), 12 * u, 1, true);
      clearHead(g, HEADS(sc.id), 0.85);
      if (closing) {
        const q = eo(span(local, 0.4, 1.5));
        const bx = R.x + R.w * (tall ? 0.78 : 0.86), by = R.y + R.h * (tall ? 0.2 : 0.25), s = 110 * u;
        waxLine(g, [[bx - s * 0.5, by], [bx - s * 0.12, by + s * 0.42], [bx + s * 0.62, by - s * 0.5]], 16 * u, th.accS, q, 7);
        const pulse = 0.5 + 0.5 * Math.sin(t * 3);
        waxEllipse(g, bx, by, s * (0.95 + 0.05 * pulse), s * (0.95 + 0.05 * pulse), 6 * u, rgba(th.red, 0.9), q, 4);
      }
      headLayer(g, th, HEADS(sc.id), local, sc.hold, H.change, H.entrance, H.last);
    });
  }

  // ---- scene: chart ---------------------------------------------------------------------------------
  function drawChart(g, th, L, box, p, d, t) {
    const u = th.u, tall = th.tall;
    film(g, th, L.main, { seed: 11, scan: 0.4 }, (R) => {
      nautilus(g, th, R.x + R.w * 0.58, R.y + R.h * 0.42, Math.min(R.w, R.h) * 0.52, t, 0.5);
      leaf(g, th, R.x + R.w * 0.9, R.y + R.h * 0.2, 240 * u, t, 0.45);
      fish(g, th, R.x + R.w * 0.62, R.y + R.h * 0.2, Math.min(R.w * 0.5, 700 * u), t, 0.35);
      const n = d.values.length, max = Math.max(...d.values, 1);
      const wedgeW = (tall ? 54 : 66) * u, wx = R.x + 32 * u;
      const x0 = wx + wedgeW + 70 * u, x1 = R.x + R.w - 44 * u, slot = (x1 - x0) / n, bw = slot * 0.58;
      const baseY = R.y + R.h - (tall ? 150 : 120) * u, Hmax = baseY - R.y - 200 * u;
      // The plot area is masked clear of the background specimens so the bars read cleanly.
      cut(g, 0.92, (c) => { c.beginPath(); c.rect(x0 - 30 * u, R.y + 30 * u, x1 - x0 + 60 * u, baseY - R.y + 110 * u); }, 40 * u);
      wedge(g, th, wx, R.y + 40 * u, wedgeW, R.h - 120 * u, span(p, 0, 0.5), false);
      xr(g, th, 3 * u, 0.9, th.bone, (c) => { c.beginPath(); c.moveTo(x0 - 20 * u, baseY); c.lineTo(x0 - 20 * u + (x1 - x0 + 20 * u) * eo(span(p, 0, 0.3)), baseY); });
      g.save(); g.globalCompositeOperation = "lighter"; g.fillStyle = rgba(th.bone, 0.3);
      const stp = 24 * u, off = (t * 20 * u) % stp;
      for (let x = x0 - off; x < x1; x += stp) if (x >= x0 - 20 * u) g.fillRect(x, baseY + 6 * u, 2 * u, ((Math.round((x + off) / stp) % 4) === 0 ? 14 : 7) * u);
      g.restore();
      // The densitometer cursor sweeps across the plot and lifts what it crosses.
      const cur = x0 + (x1 - x0) * ((t * 0.27) % 1);
      xr(g, th, 1.8 * u, 0.5, th.bone, (c) => { c.beginPath(); c.moveTo(cur, baseY - Hmax - 60 * u); c.lineTo(cur, baseY + 4 * u); });
      glowDot(g, cur, baseY - Hmax - 60 * u, 6 * u, th.bone, 0.9);
      d.values.forEach((value, i) => {
        const q = eo(span(p * 1.5, (i / n) * 0.55, (i / n) * 0.55 + 0.45));
        const cx = x0 + slot * (i + 0.5), hot = i === d.highlight;
        const h = Hmax * (value / max) * q;
        const col = hot ? th.acc : th.bone;
        const near = Math.exp(-Math.pow((cur - cx) / (slot * 0.9), 2));
        const segH = (tall ? 32 : 36) * u, cnt = Math.floor(h / segH), rem = h - cnt * segH;
        const glow = 0.7 + 0.3 * near;
        // A column of dense blocks, like stacked vertebrae, with a bright core down the middle.
        for (let s = 0; s <= cnt; s++) {
          const hh = s === cnt ? rem - 6 * u : segH - 6 * u;
          if (hh < 4 * u) continue;
          const y = baseY - (s + 1) * segH + (s === cnt ? segH - rem : 0) + 3 * u;
          const shim = 0.85 + 0.15 * Math.sin(t * 2.6 - s * 0.7 + i);
          xf(g, th, 0.24 * glow * shim, col, (c) => rr(c, cx - bw / 2, y, bw, hh, 10 * u));
          xf(g, th, 0.16 * glow, col, (c) => rr(c, cx - bw * 0.3, y + hh * 0.18, bw * 0.6, hh * 0.64, 8 * u));
          xr(g, th, 2 * u, 0.4 * glow, col, (c) => rr(c, cx - bw / 2, y, bw, hh, 10 * u));
        }
        if (h > 6 * u) xf(g, th, 0.1 * glow, col, (c) => rr(c, cx - bw * 0.62, baseY - h - 8 * u, bw * 1.24, h + 8 * u, 16 * u));
        if (q > 0.04) {
          const num = window.DreamcutMotion.formatNumber(value * q, 0, d.prefix, d.suffix);
          txt(g, num, cx, baseY - h - 24 * u, hot ? 128 * u : 96 * u, { font: MONO, color: hot ? th.accS : th.pale, align: "center", maxW: slot * 1.05, glow: 22 * u, glowColor: hot ? th.accS : "rgb(120,180,255)", weight: "700" });
          txt(g, d.labels[i] || "", cx, baseY + 70 * u, 50 * u, { color: hot ? th.accS : th.pale, align: "center", maxW: slot * 0.95, wax: true, q: span(q, 0.2, 0.8) });
        }
        if (hot) {
          const cq = eo(span(p, 0.62, 0.92));
          waxEllipse(g, cx, baseY - h - 82 * u, Math.max(slot * 0.52, 120 * u), 98 * u, 7 * u, rgba(th.red, 0.95), cq, 3);
          waxArrow(g, cx + slot * 0.95, baseY - h - 230 * u, cx + slot * 0.4, baseY - h - 130 * u, 0.25, 6 * u, rgba(th.red, 0.95), eo(span(p, 0.8, 1)), 9);
        }
      });
    });
  }

  // ---- scene: object (a laptop or phone, x-rayed) ---------------------------------------------------
  function gearPath(c, cx, cy, r, teeth, rot) {
    c.beginPath();
    const n = teeth * 4;
    for (let i = 0; i <= n; i++) { const k = i % 4, ang = rot + (i / n) * TAU, rr2 = k === 1 || k === 2 ? r : r * 0.8; c.lineTo(cx + Math.cos(ang) * rr2, cy + Math.sin(ang) * rr2); }
    c.closePath();
  }
  function gear(g, th, cx, cy, r, teeth, rot, a, w) {
    xf(g, th, 0.36 * a, th.bone, (c) => gearPath(c, cx, cy, r, teeth, rot));
    cut(g, 0.9, (c) => disc(c, cx, cy, r * 0.16));
    for (let i = 0; i < 5; i++) { const ang = rot + (i / 5) * TAU + 0.6; cut(g, 0.7, (c) => disc(c, cx + Math.cos(ang) * r * 0.5, cy + Math.sin(ang) * r * 0.5, r * 0.13)); }
    xr(g, th, w, a * 0.45, th.bone, (c) => gearPath(c, cx, cy, r, teeth, rot));
    xr(g, th, w * 0.8, a * 0.6, th.bone, (c) => disc(c, cx, cy, r * 0.24));
  }
  function fan(g, th, cx, cy, r, t, a) {
    xr(g, th, 2.4 * th.u, a * 0.7, th.bone, (c) => disc(c, cx, cy, r));
    for (let i = 0; i < 7; i++) {
      const ang = t * 6 + (i / 7) * TAU;
      xf(g, th, 0.2 * a, th.bone, (c) => { c.beginPath(); c.moveTo(cx, cy); c.quadraticCurveTo(cx + Math.cos(ang - 0.2) * r * 0.9, cy + Math.sin(ang - 0.2) * r * 0.9, cx + Math.cos(ang + 0.45) * r * 0.78, cy + Math.sin(ang + 0.45) * r * 0.78); c.closePath(); });
    }
    xf(g, th, 0.45 * a, th.bone, (c) => disc(c, cx, cy, r * 0.18));
  }
  function chip(g, th, x, y, w, h, a, t, seed) {
    xf(g, th, 0.2 * a, th.bone, (c) => rr(c, x, y, w, h, 3 * th.u));
    const n = Math.max(3, Math.round(w / (12 * th.u)));
    xr(g, th, 1.4 * th.u, a * 0.6, th.bone, (c) => { c.beginPath(); for (let i = 0; i < n; i++) { const px = x + (w / n) * (i + 0.5); c.moveTo(px, y - 6 * th.u); c.lineTo(px, y); c.moveTo(px, y + h); c.lineTo(px, y + h + 6 * th.u); } });
    const pl = 0.5 + 0.5 * Math.sin(t * 2.4 + seed);
    xf(g, th, (0.25 + 0.25 * pl) * a, th.bone, (c) => rr(c, x + w * 0.25, y + h * 0.25, w * 0.5, h * 0.5, 2 * th.u));
  }
  function screwDot(g, th, x, y, a) { xf(g, th, 0.6 * a, th.bone, (c) => disc(c, x, y, 7 * th.u)); }
  // Screen contents: a preview, sliders and three tracks of clips with a play-head. Returns anchor points.
  function screenUI(g, th, S0, q, t, a) {
    const u = th.u;
    const pv = { x: S0.x + S0.w * 0.05, y: S0.y + S0.h * 0.08, w: S0.w * 0.56, h: S0.h * 0.46 };
    xf(g, th, 0.12 * a, th.acc, (c) => rr(c, pv.x, pv.y, pv.w, pv.h, 6 * u));
    xr(g, th, 2.4 * u, a * 0.6, th.acc, (c) => rr(c, pv.x, pv.y, pv.w, pv.h, 6 * u));
    nautilus(g, th, pv.x + pv.w * 0.5, pv.y + pv.h * 0.5, pv.h * 0.42, t, 0.8 * a);
    const sl = { x: S0.x + S0.w * 0.67, y: S0.y + S0.h * 0.1, w: S0.w * 0.28 };
    for (let i = 0; i < 4; i++) {
      const y = sl.y + i * S0.h * 0.115, kq = span(q, 0.2 + i * 0.05, 0.6 + i * 0.05);
      xr(g, th, 2.4 * u, a * 0.7 * kq, th.bone, (c) => { c.beginPath(); c.moveTo(sl.x, y); c.lineTo(sl.x + sl.w, y); });
      const kx = sl.x + sl.w * (0.5 + 0.38 * Math.sin(t * 0.9 + i * 1.7));
      xf(g, th, 0.55 * a * kq, th.bone, (c) => disc(c, kx, y, 10 * u));
    }
    const ty0 = S0.y + S0.h * 0.62, th2 = S0.h * 0.1, clips = [[0.05, 0.3], [0.38, 0.22], [0.64, 0.3]], anchors = [[pv.x + pv.w * 0.78, pv.y + pv.h * 0.28]];
    for (let r = 0; r < 3; r++) {
      const y = ty0 + r * (th2 + S0.h * 0.04);
      clips.forEach(([cx0, cw], i) => {
        const sh = span(q, 0.3 + i * 0.1 + r * 0.05, 0.65 + i * 0.1 + r * 0.05);
        if (sh <= 0) return;
        const x = S0.x + S0.w * (cx0 + r * 0.04), w = S0.w * cw * sh, hot = r === 0 && i === 1;
        const col = hot ? th.acc : th.bone;
        xf(g, th, (hot ? 0.4 : 0.18) * a, col, (c) => rr(c, x, y, w, th2, 4 * u));
        xr(g, th, 1.8 * u, (hot ? 0.8 : 0.4) * a, col, (c) => rr(c, x, y, w, th2, 4 * u));
        if (hot) anchors.push([x + S0.w * cw * 0.5, y + th2 * 0.5]);
        if (r === 2 && i === 0) anchors.push([x + S0.w * cw * 0.5, y + th2 * 0.5]);
      });
    }
    const ph = S0.x + S0.w * (0.06 + 0.88 * ((t * 0.16) % 1));
    xr(g, th, 2.4 * u, 0.9 * a, th.red, (c) => { c.beginPath(); c.moveTo(ph, S0.y + S0.h * 0.58); c.lineTo(ph, S0.y + S0.h * 0.97); });
    glowDot(g, ph, S0.y + S0.h * 0.58, 5 * u, th.red, 0.9 * a);
    return anchors;
  }
  function laptop(g, th, cx, cy, dw, q, t) {
    const u = th.u, sh = dw * 0.46, bh = dw * 0.25, gap = dw * 0.035, top = cy - (sh + gap + bh) / 2;
    const scr = { x: cx - dw / 2, y: top, w: dw, h: sh };
    const ghost = 0.3 + 0.7 * span(q, 0, 0.3);
    // Plastic and glass are thin density; the frame edges are denser.
    xf(g, th, 0.08 * ghost, th.bone, (c) => rr(c, scr.x, scr.y, scr.w, scr.h, 16 * u));
    xr(g, th, 5 * u, ghost * 0.5, th.bone, (c) => rr(c, scr.x, scr.y, scr.w, scr.h, 16 * u));
    const ins = 22 * u, S0 = { x: scr.x + ins, y: scr.y + ins, w: scr.w - ins * 2, h: scr.h - ins * 2 };
    xf(g, th, 0.05 * ghost, th.bone, (c) => rr(c, S0.x, S0.y, S0.w, S0.h, 6 * u));
    xf(g, th, 0.5 * ghost, th.bone, (c) => disc(c, cx, scr.y + ins * 0.5, 4 * u));
    const anchors = screenUI(g, th, S0, q, t, ghost);
    const by = scr.y + sh + gap, base = { x: cx - dw * 0.53, y: by, w: dw * 1.06, h: bh };
    xf(g, th, 0.35 * ghost, th.bone, (c) => { c.beginPath(); for (const hx of [-0.3, 0.3]) c.rect(cx + dw * hx - dw * 0.045, scr.y + sh - 4 * u, dw * 0.09, gap + 8 * u); });
    xf(g, th, 0.08 * ghost, th.bone, (c) => rr(c, base.x, base.y, base.w, base.h, 16 * u));
    xr(g, th, 5 * u, ghost * 0.5, th.bone, (c) => rr(c, base.x, base.y, base.w, base.h, 16 * u));
    const k1 = span(q, 0.15, 0.55), k2 = span(q, 0.3, 0.7), k3 = span(q, 0.4, 0.8);
    fan(g, th, base.x + base.w * 0.14, base.y + base.h * 0.5, base.h * 0.3, t, 0.9 * k1);
    const bat = { x: base.x + base.w * 0.3, y: base.y + base.h * 0.18, w: base.w * 0.38, h: base.h * 0.64 };
    xr(g, th, 2.4 * u, 0.6 * k2, th.bone, (c) => rr(c, bat.x, bat.y, bat.w, bat.h, 6 * u));
    for (let i = 0; i < 6; i++) {
      const cw = bat.w / 6, wave = 0.4 + 0.6 * Math.max(0, Math.sin(t * 2.2 - i * 0.8));
      xf(g, th, 0.26 * k2 * wave, th.bone, (c) => rr(c, bat.x + cw * i + 3 * u, bat.y + 4 * u, cw - 6 * u, bat.h - 8 * u, 3 * u));
    }
    chip(g, th, base.x + base.w * 0.76, base.y + base.h * 0.2, base.w * 0.12, base.h * 0.34, 0.9 * k3, t, 1);
    chip(g, th, base.x + base.w * 0.9, base.y + base.h * 0.58, base.w * 0.06, base.h * 0.22, 0.8 * k3, t, 2);
    chip(g, th, base.x + base.w * 0.74, base.y + base.h * 0.64, base.w * 0.1, base.h * 0.18, 0.8 * k3, t, 3);
    xr(g, th, 3 * u, 0.5 * k1, th.bone, (c) => { c.beginPath(); c.moveTo(base.x + base.w * 0.2, base.y + base.h * 0.3); c.bezierCurveTo(base.x + base.w * 0.26, base.y + base.h * 0.05, base.x + base.w * 0.7, base.y + base.h * 0.02, base.x + base.w * 0.76, base.y + base.h * 0.3); });
    for (const [sx, sy] of [[0.03, 0.14], [0.97, 0.14], [0.03, 0.86], [0.97, 0.86]]) screwDot(g, th, base.x + base.w * sx, base.y + base.h * sy, 0.8 * k3);
    return anchors;
  }
  function phone(g, th, cx, cy, ph, q, t) {
    const u = th.u, pw = ph * 0.49, x = cx - pw / 2, y = cy - ph / 2, ghost = 0.3 + 0.7 * span(q, 0, 0.3);
    xf(g, th, 0.08 * ghost, th.bone, (c) => rr(c, x, y, pw, ph, 40 * u));
    xr(g, th, 5 * u, ghost * 0.5, th.bone, (c) => rr(c, x, y, pw, ph, 40 * u));
    const k = span(q, 0.15, 0.6);
    xf(g, th, 0.16 * k, th.bone, (c) => rr(c, x + pw * 0.16, y + ph * 0.55, pw * 0.68, ph * 0.3, 10 * u));
    for (let i = 0; i < 4; i++) xr(g, th, 1.6 * u, 0.4 * k * (0.6 + 0.4 * Math.sin(t * 2.4 - i)), th.bone, (c) => { disc(c, cx, y + ph * 0.92, (18 + i * 9) * u); });
    xf(g, th, 0.5 * k, th.bone, (c) => { disc(c, x + pw * 0.22, y + ph * 0.045, 9 * u); disc(c, x + pw * 0.34, y + ph * 0.045, 9 * u); });
    const ins = 22 * u, S0 = { x: x + ins, y: y + ins + ph * 0.03, w: pw - ins * 2, h: ph - ins * 2 - ph * 0.05 };
    const pv = { x: S0.x + S0.w * 0.08, y: S0.y + S0.h * 0.06, w: S0.w * 0.84, h: S0.h * 0.34 };
    xf(g, th, 0.12 * ghost, th.acc, (c) => rr(c, pv.x, pv.y, pv.w, pv.h, 8 * u));
    xr(g, th, 2.4 * u, ghost * 0.6, th.acc, (c) => rr(c, pv.x, pv.y, pv.w, pv.h, 8 * u));
    nautilus(g, th, pv.x + pv.w * 0.5, pv.y + pv.h * 0.5, pv.h * 0.42, t, 0.8 * ghost);
    const anchors = [[pv.x + pv.w * 0.8, pv.y + pv.h * 0.3]];
    const th2 = S0.h * 0.065, ty0 = S0.y + S0.h * 0.5;
    for (let r = 0; r < 5; r++) {
      const yy = ty0 + r * (th2 + S0.h * 0.03);
      [[0.08, 0.34], [0.46, 0.26], [0.74, 0.18]].forEach(([cx0, cw], i) => {
        const sh = span(q, 0.3 + i * 0.1 + r * 0.04, 0.65 + i * 0.1 + r * 0.04);
        if (sh <= 0) return;
        const xx = S0.x + S0.w * (cx0 + (r % 2) * 0.03), ww = S0.w * cw * sh, hot = r === 1 && i === 1;
        const col = hot ? th.acc : th.bone;
        xf(g, th, (hot ? 0.4 : 0.18) * ghost, col, (c) => rr(c, xx, yy, ww, th2, 4 * u));
        if (hot) anchors.push([xx + S0.w * cw * 0.5, yy + th2 * 0.5]);
        if (r === 4 && i === 0) anchors.push([xx + S0.w * cw * 0.5, yy + th2 * 0.5]);
      });
    }
    const pyy = S0.y + S0.h * (0.46 + 0.5 * ((t * 0.15) % 1));
    xr(g, th, 2.4 * u, 0.8 * ghost, th.red, (c) => { c.beginPath(); c.moveTo(S0.x + 4 * u, pyy); c.lineTo(S0.x + S0.w - 4 * u, pyy); });
    return anchors;
  }
  function drawObject(g, th, L, box, p, d, t) {
    const u = th.u, tall = th.tall, isPhone = d.kind === "phone";
    film(g, th, L.main, { seed: 17, scan: 1.8 }, (R) => {
      fish(g, th, R.x + R.w * (tall ? 0.5 : 0.82), R.y + R.h * (tall ? 0.94 : 0.9), (tall ? 620 : 540) * u, t, 0.35);
      nautilus(g, th, R.x + R.w * (tall ? 0.5 : 0.82), R.y + R.h * (tall ? 0.7 : 0.45), Math.min(R.w, R.h) * (tall ? 0.34 : 0.36), t, 0.3);
      leaf(g, th, R.x + R.w * (tall ? 0.12 : 0.55), R.y + R.h * (tall ? 0.62 : 0.1), 230 * u, t, 0.35);
      keyS(g, th, R.x + R.w * (tall ? 0.86 : 0.93), R.y + R.h * 0.12, 190 * u, t, 0.45);
      const q = clamp(p * 1.5);
      const cx = R.x + R.w * (tall ? 0.5 : isPhone ? 0.3 : 0.33), cy = R.y + R.h * (tall ? 0.3 : 0.5);
      const dw = isPhone ? (tall ? Math.min(R.h * 0.5, R.w * 1.5) : R.h * 0.86) : tall ? R.w * 0.86 : Math.min(R.w * 0.5, R.h * 1.05);
      // Callout labels sit on clear emulsion.
      const labelX = tall ? R.x + 120 * u : R.x + R.w * 0.665;
      if (!tall) cut(g, 0.85, (c) => { c.beginPath(); c.rect(labelX - 60 * u, R.y + 20 * u, R.x + R.w - labelX + 60 * u, R.h * 0.8); }, 30 * u);
      const anchors = isPhone ? phone(g, th, cx, cy, dw, q, t) : laptop(g, th, cx, cy, dw, q, t);
      // The viewer loupe wanders over the device and lifts its density.
      const lx = cx + Math.sin(t * 0.6) * dw * 0.28, ly = cy + Math.cos(t * 0.45) * dw * (isPhone ? 0.34 : 0.14), lr = (isPhone ? dw * 0.14 : dw * 0.12);
      const la = span(q, 0.5, 0.8);
      xf(g, th, 0.12 * la, th.bone, (c) => disc(c, lx, ly, lr));
      xr(g, th, 3 * u, 0.55 * la, th.bone, (c) => disc(c, lx, ly, lr));
      const rank = d.callouts.map((_, i) => d.callouts.filter((__, j) => anchors[Math.min(j, anchors.length - 1)][0] < anchors[Math.min(i, anchors.length - 1)][0] || (anchors[Math.min(j, anchors.length - 1)][0] === anchors[Math.min(i, anchors.length - 1)][0] && j < i)).length);
      d.callouts.forEach((label, i) => {
        if (!label) return;
        const a = anchors[Math.min(i, anchors.length - 1)];
        const k = eo(span(p, 0.36 + i * 0.13, 0.62 + i * 0.13));
        const ly2 = tall ? R.y + R.h * (0.66 + rank[i] * 0.12) : R.y + R.h * (0.22 + i * 0.28);
        waxEllipse(g, a[0], a[1], 34 * u, 30 * u, 5.5 * u, rgba(th.red, 0.95), span(k, 0, 0.5), 20 + i);
        waxArrow(g, a[0] + (tall ? 0 : 30 * u), a[1] + (tall ? 30 * u : 0), labelX - 24 * u, ly2 - 14 * u, tall ? 0.06 : 0.18, 5 * u, th.accS, span(k, 0.3, 1), 40 + i);
        if (k > 0.2) {
          plate(g, th, String(i + 1), labelX - 4 * u, ly2 - 14 * u, 34 * u, th.acc, span(k, 0.2, 0.5));
          txt(g, label, labelX + 44 * u, ly2, 56 * u, { color: th.accS, wax: true, q: span(k, 0.45, 1), maxW: tall ? R.w - 230 * u : R.x + R.w - labelX - 86 * u, glow: 10 * u });
        }
      });
    });
  }

  // ---- scene: people (radiographs of whole figures) -------------------------------------------------
  // A long bone: a shaft with bright cortical walls and knobbed ends (two condyles), all as density.
  function longBone(g, th, p1, p2, w, a, col) {
    const dx = p2[0] - p1[0], dy = p2[1] - p1[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    const mid = 0.72;
    xf(g, th, 0.2 * a, col, (c) => {
      c.beginPath();
      c.moveTo(p1[0] + nx * w * 0.5, p1[1] + ny * w * 0.5);
      c.quadraticCurveTo((p1[0] + p2[0]) / 2 + nx * w * 0.5 * mid, (p1[1] + p2[1]) / 2 + ny * w * 0.5 * mid, p2[0] + nx * w * 0.5, p2[1] + ny * w * 0.5);
      c.lineTo(p2[0] - nx * w * 0.5, p2[1] - ny * w * 0.5);
      c.quadraticCurveTo((p1[0] + p2[0]) / 2 - nx * w * 0.5 * mid, (p1[1] + p2[1]) / 2 - ny * w * 0.5 * mid, p1[0] - nx * w * 0.5, p1[1] - ny * w * 0.5);
      c.closePath();
    });
    // Cortex: the two walls of the shaft are denser than the marrow between them.
    for (const s of [-1, 1]) xr(g, th, w * 0.16, a * 0.55, col, (c) => { c.beginPath(); c.moveTo(p1[0] + s * nx * w * 0.4, p1[1] + s * ny * w * 0.4); c.quadraticCurveTo((p1[0] + p2[0]) / 2 + s * nx * w * 0.4 * mid, (p1[1] + p2[1]) / 2 + s * ny * w * 0.4 * mid, p2[0] + s * nx * w * 0.4, p2[1] + s * ny * w * 0.4); });
    for (const [p, dir] of [[p1, -1], [p2, 1]]) {
      const ex = p[0] + dir * dx / l * w * 0.15, ey = p[1] + dir * dy / l * w * 0.15;
      xf(g, th, 0.2 * a, col, (c) => { c.beginPath(); c.arc(ex + nx * w * 0.3, ey + ny * w * 0.3, w * 0.48, 0, TAU); c.arc(ex - nx * w * 0.3, ey - ny * w * 0.3, w * 0.48, 0, TAU); });
    }
  }
  function skeleton(g, th, cx, base, H, pose, t, hot, seed, a) {
    const u = th.u, y = (f) => base - f * H, breath = Math.sin(t * 1.5 + seed) * 0.5 + 0.5, sway = Math.sin(t * 0.8 + seed * 2) * H * 0.006;
    const x = (f) => cx + f * H + sway * (1 - Math.min(1, Math.abs(f) * 4));
    const wave = Math.sin(t * 3 + seed) * 0.03;
    const col = hot ? mix(th.acc, WHITE, 0.25) : th.bone;
    const J = {
      head: [x(0), y(0.93)], shL: [x(-0.115), y(0.82)], shR: [x(0.115), y(0.82)],
      hipL: [x(-0.06), y(0.47)], hipR: [x(0.06), y(0.47)], knL: [x(-0.07), y(0.26)], knR: [x(0.07), y(0.26)], anL: [x(-0.075), y(0.045)], anR: [x(0.075), y(0.045)],
    };
    const A = { ...J, ...[
      { eL: [x(-0.16), y(0.64)], wL: [x(-0.17), y(0.46)], eR: [x(0.16), y(0.64)], wR: [x(0.17), y(0.46)] },
      { eL: [x(-0.16), y(0.64)], wL: [x(-0.17), y(0.46)], eR: [x(0.2), y(0.84 + wave)], wR: [x(0.21 + wave), y(1.0 + wave)] },
      { eL: [x(-0.21), y(0.63)], wL: [x(-0.09), y(0.53)], eR: [x(0.21), y(0.63)], wR: [x(0.09), y(0.53)] },
      { eL: [x(-0.145), y(0.63)], wL: [x(0.06), y(0.68)], eR: [x(0.145), y(0.63)], wR: [x(-0.06), y(0.71)] },
    ][pose % 4] };
    // Soft tissue: one silhouette, so it never doubles up where limbs meet; the exposure blurs its edge.
    const tis = ink(g);
    tis.save(); tis.globalCompositeOperation = "lighter"; tis.lineCap = "round"; tis.lineJoin = "round";
    tis.strokeStyle = rgba(col, 0.09 * a); tis.lineWidth = H * 0.085; tis.beginPath();
    for (const s of ["L", "R"]) { tis.moveTo(...A["sh" + s]); tis.lineTo(...A["e" + s]); tis.lineTo(...A["w" + s]); tis.moveTo(...A["hip" + s]); tis.lineTo(...A["kn" + s]); tis.lineTo(...A["an" + s]); }
    tis.moveTo(x(0), y(0.9)); tis.lineTo(x(0), y(0.8));
    tis.moveTo(x(-0.07), y(0.78)); tis.lineTo(x(-0.065), y(0.5)); tis.moveTo(x(0.07), y(0.78)); tis.lineTo(x(0.065), y(0.5));
    tis.moveTo(x(-0.04), y(0.78)); tis.lineTo(x(0.04), y(0.5));
    tis.stroke();
    tis.fillStyle = rgba(col, 0.09 * a); tis.beginPath(); tis.ellipse(J.head[0], J.head[1], 0.068 * H, 0.078 * H, 0, 0, TAU); tis.fill();
    tis.restore();
    // Skull: cranium dome, cheek and jaw, eye sockets and nasal cavity as voids, a row of teeth.
    const hx = J.head[0], hy = J.head[1];
    xf(g, th, 0.3 * a, col, (c) => { c.beginPath(); c.ellipse(hx, hy - 0.012 * H, 0.054 * H, 0.058 * H, 0, 0, TAU); });
    xf(g, th, 0.24 * a, col, (c) => { c.beginPath(); c.moveTo(hx - 0.042 * H, hy + 0.005 * H); c.quadraticCurveTo(hx - 0.04 * H, hy + 0.06 * H, hx, hy + 0.066 * H); c.quadraticCurveTo(hx + 0.04 * H, hy + 0.06 * H, hx + 0.042 * H, hy + 0.005 * H); c.closePath(); });
    xr(g, th, 0.007 * H, a * 0.6, col, (c) => { c.beginPath(); c.arc(hx, hy - 0.012 * H, 0.052 * H, Math.PI * 1.05, Math.PI * 1.95); });
    cut(g, 0.75, (c) => { c.beginPath(); c.ellipse(hx - 0.019 * H, hy + 0.004 * H, 0.014 * H, 0.012 * H, 0, 0, TAU); c.ellipse(hx + 0.019 * H, hy + 0.004 * H, 0.014 * H, 0.012 * H, 0, 0, TAU); });
    cut(g, 0.6, (c) => { c.beginPath(); c.moveTo(hx, hy + 0.014 * H); c.lineTo(hx - 0.007 * H, hy + 0.03 * H); c.lineTo(hx + 0.007 * H, hy + 0.03 * H); c.closePath(); });
    xf(g, th, 0.3 * a, col, (c) => { c.beginPath(); for (let i = -3; i <= 3; i++) c.rect(hx + i * 0.0062 * H - 0.0025 * H, hy + 0.042 * H, 0.005 * H, 0.009 * H); });
    // Spine: vertebral bodies with clear discs between them.
    for (let i = 0; i < 17; i++) {
      const f = lerp(0.87, 0.5, i / 16), wv = 0.011 * H * (1 + i * 0.035);
      xf(g, th, 0.3 * a, col, (c) => rr(c, x(0) - wv, y(f) - 0.008 * H, wv * 2, 0.015 * H, 0.004 * H));
    }
    // Clavicles, sternum and a breathing ribcage of dense curved ribs.
    xr(g, th, 0.011 * H, a * 0.8, col, (c) => { c.beginPath(); c.moveTo(A.shL[0], A.shL[1]); c.quadraticCurveTo(x(-0.05), y(0.835), x(-0.01), y(0.825)); c.moveTo(A.shR[0], A.shR[1]); c.quadraticCurveTo(x(0.05), y(0.835), x(0.01), y(0.825)); });
    xf(g, th, 0.18 * a, col, (c) => rr(c, x(0) - 0.012 * H, y(0.81), 0.024 * H, 0.12 * H, 0.008 * H));
    for (let i = 0; i < 9; i++) {
      const f = 0.8 - i * 0.027, wd = (0.075 + Math.sin((i / 8) * Math.PI) * 0.02 + breath * 0.005) * H;
      for (const s of [-1, 1]) xr(g, th, 0.0085 * H, a * 0.55, col, (c) => { c.beginPath(); c.moveTo(x(0) + s * 0.012 * H, y(f)); c.bezierCurveTo(x(0) + s * wd * 0.8, y(f + 0.022), x(0) + s * wd * 1.05, y(f - 0.01), x(0) + s * wd * 0.85, y(f - 0.055)); });
    }
    // Scapulae: faint triangles behind the ribs.
    for (const s of [-1, 1]) xf(g, th, 0.08 * a, col, (c) => { c.beginPath(); c.moveTo(x(s * 0.1), y(0.81)); c.lineTo(x(s * 0.04), y(0.79)); c.lineTo(x(s * 0.075), y(0.7)); c.closePath(); });
    // Pelvis: iliac wings, sacrum, and the two obturator voids.
    xf(g, th, 0.26 * a, col, (c) => { c.beginPath(); c.moveTo(x(-0.015), y(0.54)); c.bezierCurveTo(x(-0.07), y(0.58), x(-0.105), y(0.55), x(-0.095), y(0.5)); c.quadraticCurveTo(x(-0.08), y(0.45), x(-0.04), y(0.43)); c.lineTo(x(-0.012), y(0.425)); c.lineTo(x(0.012), y(0.425)); c.lineTo(x(0.04), y(0.43)); c.quadraticCurveTo(x(0.08), y(0.45), x(0.095), y(0.5)); c.bezierCurveTo(x(0.105), y(0.55), x(0.07), y(0.58), x(0.015), y(0.54)); c.closePath(); });
    xf(g, th, 0.14 * a, col, (c) => { c.beginPath(); c.moveTo(x(-0.02), y(0.55)); c.lineTo(x(0.02), y(0.55)); c.lineTo(x(0), y(0.47)); c.closePath(); });
    cut(g, 0.55, (c) => { c.beginPath(); c.ellipse(x(-0.032), y(0.445), 0.014 * H, 0.011 * H, 0.3, 0, TAU); c.ellipse(x(0.032), y(0.445), 0.014 * H, 0.011 * H, -0.3, 0, TAU); });
    // Limbs: humerus, paired forearm bones, femur, paired shin bones, hands and feet.
    for (const s of ["L", "R"]) {
      longBone(g, th, A["sh" + s], A["e" + s], 0.024 * H, a, col);
      const e = A["e" + s], wr = A["w" + s], dx = wr[0] - e[0], dy = wr[1] - e[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * 0.007 * H, ny = dx / l * 0.007 * H;
      longBone(g, th, [e[0] + nx, e[1] + ny], [wr[0] + nx, wr[1] + ny], 0.012 * H, a, col);
      longBone(g, th, [e[0] - nx, e[1] - ny], [wr[0] - nx, wr[1] - ny], 0.012 * H, a, col);
      for (let f = 0; f < 4; f++) { const fa = Math.atan2(dy, dx) + (f - 1.5) * 0.2; xr(g, th, 0.006 * H, a * 0.6, col, (c) => { c.beginPath(); c.moveTo(wr[0] + Math.cos(fa) * 0.012 * H, wr[1] + Math.sin(fa) * 0.012 * H); c.lineTo(wr[0] + Math.cos(fa) * 0.05 * H, wr[1] + Math.sin(fa) * 0.05 * H); }); }
      longBone(g, th, A["hip" + s], A["kn" + s], 0.03 * H, a, col);
      const kn = A["kn" + s], an = A["an" + s];
      longBone(g, th, [kn[0] - 0.006 * H, kn[1] + 0.01 * H], [an[0] - 0.004 * H, an[1]], 0.02 * H, a, col);
      longBone(g, th, [kn[0] + 0.012 * H, kn[1] + 0.02 * H], [an[0] + 0.01 * H, an[1]], 0.009 * H, a, col);
      xf(g, th, 0.22 * a, col, (c) => disc(c, kn[0], kn[1] - 0.004 * H, 0.012 * H));
      const fd = s === "L" ? -1 : 1;
      xf(g, th, 0.2 * a, col, (c) => { c.beginPath(); c.moveTo(an[0] - fd * 0.012 * H, an[1] - 0.004 * H); c.lineTo(an[0] + fd * 0.065 * H, an[1] + 0.02 * H); c.lineTo(an[0] + fd * 0.06 * H, an[1] + 0.032 * H); c.lineTo(an[0] - fd * 0.018 * H, an[1] + 0.03 * H); c.closePath(); });
    }
    if (hot) {
      // A heart lamp pulses in the chest of the highlighted figure: the brightest density on the film.
      const beat = Math.pow(Math.max(0, Math.sin(t * 5.2)), 6);
      glowDot(g, x(-0.022), y(0.71), 0.028 * H * (1 + beat * 0.45), th.acc, a * (0.55 + 0.45 * beat));
    }
  }
  function drawPeople(g, th, L, box, p, d, t) {
    const u = th.u, tall = th.tall;
    film(g, th, L.main, { seed: 23, scan: 2.6 }, (R) => {
      const n = Math.max(2, Math.min(6, Math.round(d.count)));
      nautilus(g, th, R.x + R.w * 0.5, R.y + R.h * 0.5, Math.min(R.w, R.h) * 0.6, t, 0.16);
      leaf(g, th, R.x + R.w * 0.94, R.y + R.h * 0.12, 200 * u, t, 0.25);
      const base = R.y + R.h - 64 * u;
      const size = Math.min(R.h * (tall ? 0.56 : 0.66), (R.w / n) * (tall ? 2.1 : 1.9));
      xr(g, th, 2.6 * u, 0.7, th.bone, (c) => { c.beginPath(); c.moveTo(R.x + 30 * u, base + 12 * u); c.lineTo(R.x + 30 * u + (R.w - 60 * u) * eo(span(p, 0, 0.35)), base + 12 * u); });
      g.save(); g.globalCompositeOperation = "lighter"; g.fillStyle = rgba(th.bone, 0.3);
      const stp = 26 * u, off = (t * 18 * u) % stp;
      for (let x = R.x + 30 * u - off; x < R.x + R.w - 30 * u; x += stp) if (x >= R.x + 30 * u) g.fillRect(x, base + 20 * u, 2 * u, 10 * u);
      g.restore();
      const hotI = Math.min(n - 1, 1);
      for (let i = 0; i < n; i++) {
        const q = eo(span(p * 1.5, (i / n) * 0.5, (i / n) * 0.5 + 0.45));
        const cx = R.x + (R.w / n) * (i + 0.5), hot = i === hotI;
        const hh = size * (hot ? 1.04 : 1);
        g.save(); g.translate(0, (1 - q) * hh * 0.12);
        skeleton(g, th, cx, base, hh, hot ? 1 : [0, 2, 3][i % 3], t, hot, i * 1.7 + 0.5, clamp(q * 1.6) * (hot ? 1 : 0.9));
        g.restore();
        // Each figure gets its own role; figures beyond the named roles stay unlabelled rather than repeat one.
        const label = d.badges[i];
        if (q > 0.55 && label) {
          const by = base - hh * 1.04 - 56 * u, k = back(span(q, 0.55, 0.95));
          g.save(); g.translate(cx, by); g.scale(k, k); g.translate(-cx, -by);
          plate(g, th, label, cx, by, 46 * u, hot ? th.acc : [215, 232, 250], clamp(k * 1.5));
          g.restore();
        }
        if (hot) {
          const cq = eo(span(p, 0.6, 0.95));
          waxEllipse(g, cx, base - hh * 0.5, hh * 0.3, hh * 0.54, 7 * u, rgba(th.red, 0.95), cq, 12);
          const pr = (t * 0.7) % 1;
          xr(g, th, 2.6 * u, 0.5 * (1 - pr) * cq, th.acc, (c) => { c.beginPath(); c.ellipse(cx, base - hh * 0.5, hh * (0.3 + pr * 0.12), hh * (0.54 + pr * 0.12), 0, 0, TAU); });
        }
      }
    });
  }

  // ---- scene: process (films on the viewer, joined by grease-pencil arrows) -------------------------
  function sheets(g, th, cx, cy, s, t, a) {
    const u = th.u;
    for (let i = 2; i >= 0; i--) {
      const bob = i === 0 ? Math.sin(t * 1.6) * s * 0.02 : 0;
      g.save(); g.translate(cx + (i - 1) * s * 0.07, cy + (i - 1) * s * 0.05 + bob); g.rotate((i - 1) * 0.09 + (i === 0 ? Math.sin(t * 0.9) * 0.02 : 0));
      xf(g, th, 0.14 * a, th.bone, (c) => rr(c, -s * 0.27, -s * 0.34, s * 0.54, s * 0.68, 6 * u));
      xr(g, th, 3 * u, a * (i === 0 ? 0.6 : 0.35), th.bone, (c) => rr(c, -s * 0.27, -s * 0.34, s * 0.54, s * 0.68, 6 * u));
      if (i === 0) {
        for (let k = 0; k < 5; k++) xf(g, th, 0.3 * a, th.bone, (c) => rr(c, -s * 0.19, -s * 0.215 + k * s * 0.1, s * (k % 2 ? 0.24 : 0.36), s * 0.03, 3 * u));
        xf(g, th, 0.45 * a, th.acc, (c) => { c.beginPath(); c.moveTo(s * 0.1, -s * 0.34); c.lineTo(s * 0.1, -s * 0.16); c.lineTo(s * 0.18, -s * 0.22); c.lineTo(s * 0.26, -s * 0.16); c.lineTo(s * 0.26, -s * 0.34); c.closePath(); });
      }
      g.restore();
    }
  }
  function gears(g, th, cx, cy, s, t, a) {
    const r1 = s * 0.25, r2 = s * 0.17;
    gear(g, th, cx - s * 0.12, cy + s * 0.05, r1, 11, t * 0.8, a, 2.6 * th.u);
    gear(g, th, cx + s * 0.2, cy - s * 0.17, r2, 8, -t * 0.8 * (11 / 8) + 0.3, a, 2.4 * th.u);
    glowDot(g, cx + s * 0.2, cy - s * 0.17, 4 * th.u, th.acc, a * (0.6 + 0.4 * Math.sin(t * 3)));
  }
  function seal(g, th, cx, cy, s, t, a) {
    const u = th.u;
    xf(g, th, 0.14 * a, th.acc, (c) => disc(c, cx, cy, s * 0.3));
    xr(g, th, 5 * u, a * 0.6, th.bone, (c) => disc(c, cx, cy, s * 0.3));
    xr(g, th, 12 * u, a * 0.9, th.acc, (c) => { c.beginPath(); c.moveTo(cx - s * 0.13, cy + s * 0.01); c.lineTo(cx - s * 0.03, cy + s * 0.11); c.lineTo(cx + s * 0.15, cy - s * 0.1); });
    for (let i = 0; i < 2; i++) { const pr = ((t * 0.5 + i * 0.5) % 1); xr(g, th, 2.6 * u, a * (1 - pr) * 0.6, th.acc, (c) => disc(c, cx, cy, s * (0.3 + pr * 0.2))); }
    for (let i = 0; i < 12; i++) { const ang = (i / 12) * TAU + t * 0.3; xf(g, th, 0.35 * a, th.bone, (c) => disc(c, cx + Math.cos(ang) * s * 0.37, cy + Math.sin(ang) * s * 0.37, s * 0.02)); }
  }
  function tape(g, th, cx, cy, w, h, a) {
    const u = th.u;
    g.save(); g.globalAlpha = a; g.translate(cx, cy); g.rotate(-0.012);
    g.beginPath();
    const n = 14;
    g.moveTo(-w / 2, -h / 2 + 2 * u);
    for (let i = 0; i <= n; i++) g.lineTo(-w / 2 + (w * i) / n, -h / 2 + ((i % 2) ? 2 : -1) * u);
    g.lineTo(w / 2 + 3 * u, 0);
    for (let i = n; i >= 0; i--) g.lineTo(-w / 2 + (w * i) / n, h / 2 + ((i % 2) ? -2 : 1) * u);
    g.closePath();
    g.shadowColor = "rgba(20,30,50,0.3)"; g.shadowBlur = 8 * u; g.shadowOffsetY = 3 * u;
    g.fillStyle = th.light ? "rgba(246,236,200,0.95)" : "rgba(226,214,176,0.93)"; g.fill();
    g.restore();
  }
  function drawProcess(g, th, L, box, p, d, t) {
    const u = th.u, n = d.steps.length, vertical = box.h > box.w;
    const gapA = (vertical ? 64 : 120) * u;
    const cw = vertical ? box.w * 0.88 : Math.min((box.w + 80 * u - gapA * (n - 1)) / n, box.h * 0.9);
    const ch = vertical ? Math.min((box.h - gapA * (n - 1)) / n - 70 * u, cw * 0.8) : Math.min(box.h * 0.74, cw * 1.05);
    const kinds = [sheets, gears, seal];
    const totalW = cw * n + gapA * (n - 1), totalH = ch * n + (gapA + 70 * u) * (n - 1);
    const x0 = vertical ? box.x + (box.w - cw) / 2 : box.x + (box.w - totalW) / 2;
    const y0 = vertical ? box.y + (box.h - totalH) / 2 : box.y + (box.h - ch - 80 * u) / 2 + 10 * u;
    const pos = (i) => vertical ? { x: x0, y: y0 + i * (ch + gapA + 70 * u) } : { x: x0 + i * (cw + gapA), y: y0 };
    for (let i = 0; i < n; i++) {
      const q = back(span(p * 1.5, (i / n) * 0.5, (i / n) * 0.5 + 0.4));
      const { x, y } = pos(i);
      const k = Math.max(0.0001, q);
      g.save(); g.translate(x + cw / 2, y + ch / 2); g.scale(k, k); g.translate(-(x + cw / 2), -(y + ch / 2));
      g.globalAlpha = clamp(q * 2);
      film(g, th, { x, y, w: cw, h: ch }, { seed: 41 + i * 5, scan: i * 1.2 }, (R) => {
        SPECIMENS[(i * 2 + 2) % 4](g, th, R.x + R.w * 0.5, R.y + R.h * 0.5, Math.min(R.w, R.h) * (((i * 2 + 2) % 4) === 1 ? 1.2 : 0.7), t + i, 0.2);
        const kind = i === n - 1 ? seal : kinds[i % 2];
        kind(g, th, R.x + R.w * 0.5, R.y + R.h * 0.52, Math.min(R.w, R.h) * 1.0, t + i * 0.7, 1);
        txt(g, String(i + 1).padStart(2, "0"), R.x + 22 * u, R.y + 96 * u, 80 * u, { font: MONO, color: i === n - 1 ? th.accS : th.pale, glow: 20 * u, glowColor: i === n - 1 ? th.accS : "rgb(120,180,255)" });
        // A bright beam crosses the card continuously.
        const bx = R.x + R.w * (((t * 0.35 + i * 0.3) % 1.4) - 0.2);
        g.save(); g.globalCompositeOperation = "lighter";
        const bg = g.createLinearGradient(bx - 50 * u, 0, bx + 50 * u, 0); bg.addColorStop(0, "rgba(170,205,240,0)"); bg.addColorStop(0.5, "rgba(190,215,240,0.1)"); bg.addColorStop(1, "rgba(170,205,240,0)");
        g.fillStyle = bg; g.fillRect(R.x, R.y, R.w, R.h); g.restore();
      });
      g.restore();
      const tq = span(q, 0.6, 1);
      if (tq > 0) {
        const ty = y + ch + 46 * u, tw = Math.min(cw * 1.02, 560 * u);
        tape(g, th, x + cw / 2, ty, tw, 70 * u, clamp(tq * 2));
        txt(g, d.steps[i], x + cw / 2, ty + 4 * u, 50 * u, { font: COND, color: th.dark, align: "center", base: "middle", maxW: tw - 50 * u, weight: "700", q: tq });
      }
      if (i < n - 1) {
        const a = eo(span(p, 0.3 + i * 0.22, 0.6 + i * 0.22));
        const pa = pos(i), pb = pos(i + 1);
        const ax = vertical ? pa.x + cw / 2 : pa.x + cw + 12 * u, ay = vertical ? pa.y + ch + 80 * u : pa.y + ch / 2;
        const bx2 = vertical ? pb.x + cw / 2 : pb.x - 12 * u, by2 = vertical ? pb.y - 14 * u : pb.y + ch / 2;
        waxArrow(g, ax, ay, bx2, by2, vertical ? 0 : -0.12, 11 * u, rgba(th.red, 0.95), a, 60 + i);
        if (a > 0.95) {
          const k2 = (t * 0.6 + i * 0.4) % 1, mx = (ax + bx2) / 2 - (by2 - ay) * (vertical ? 0 : -0.12), my = (ay + by2) / 2 + (bx2 - ax) * (vertical ? 0 : -0.12);
          const px = (1 - k2) * (1 - k2) * ax + 2 * (1 - k2) * k2 * mx + k2 * k2 * bx2, py = (1 - k2) * (1 - k2) * ay + 2 * (1 - k2) * k2 * my + k2 * k2 * by2;
          glowDot(g, px, py, 7 * u, th.red, 0.9);
        }
      }
    }
  }

  // ---- scene: compare (a dense stack of exposures against a sparse one) -----------------------------
  // Each take is a translucent film frame with a head-and-shoulders subject; fanned frames overlap, so a
  // stack of many burns into a bright dense mass while a few stay thin.
  function frameStack(g, th, cx, cy, fw, fh, count, q, t, col, local, hold, seed) {
    const u = th.u, n = Math.max(1, Math.min(14, Math.round(count)));
    const spread = fw * 0.13;
    const pulseOn = span(local, Math.max(0.8, hold - 2.2), Math.max(1, hold - 1.8));
    for (let k = 0; k < n; k++) {
      const kq = eo(span(q, (k / n) * 0.7, (k / n) * 0.7 + 0.3));
      if (kq <= 0) continue;
      const off = (k - (n - 1) / 2), rot = off * 0.045 + Math.sin(t * 0.6 + k + seed) * 0.006;
      const px = cx + off * spread, py = cy + (1 - kq) * fh * 0.3 + Math.abs(off) * spread * 0.18;
      // A slow density pulse runs through the stack during the hold.
      const pulse = 1 + 0.6 * pulseOn * Math.pow(Math.max(0, Math.sin(t * 2.2 - k * 0.55)), 4);
      const a = kq * pulse;
      g.save(); g.translate(px, py); g.rotate(rot);
      xf(g, th, 0.028 * a, col, (c) => rr(c, -fw / 2, -fh / 2, fw, fh, 8 * u));
      xr(g, th, 2.4 * u, 0.3 * a, col, (c) => rr(c, -fw / 2, -fh / 2, fw, fh, 8 * u));
      const sx = Math.sin(k * 1.9 + seed) * fw * 0.06;
      xf(g, th, 0.045 * a, col, (c) => { c.beginPath(); c.ellipse(sx, -fh * 0.1, fw * 0.14, fw * 0.17, 0, 0, TAU); });
      xf(g, th, 0.04 * a, col, (c) => { c.beginPath(); c.moveTo(sx - fw * 0.34, fh * 0.46); c.quadraticCurveTo(sx - fw * 0.32, fh * 0.1, sx, fh * 0.1); c.quadraticCurveTo(sx + fw * 0.32, fh * 0.1, sx + fw * 0.34, fh * 0.46); c.closePath(); });
      for (const yy of [-fh * 0.44, fh * 0.44]) xf(g, th, 0.08 * a, col, (c) => { c.beginPath(); for (let s = 0; s < 6; s++) c.rect(-fw * 0.42 + s * fw * 0.15, yy - 4 * u, fw * 0.07, 8 * u); });
      g.restore();
    }
  }
  // Grease-pencil tally marks, one per take, built through the hold.
  function tally(g, th, x, y, count, q, col, seed) {
    const u = th.u, n = Math.max(0, Math.min(15, Math.round(count))), hgt = 58 * u, step = 20 * u, gap = 30 * u;
    for (let i = 0; i < n; i++) {
      const grp = Math.floor(i / 5), inG = i % 5, k = span(q, i / n * 0.85, i / n * 0.85 + 0.15);
      if (k <= 0) continue;
      const gx = x + grp * (step * 4 + gap + 20 * u);
      if (inG < 4) waxLine(g, [[gx + inG * step, y], [gx + inG * step + 2 * u, y + hgt]], 6 * u, col, k, seed + i);
      else waxLine(g, [[gx - 12 * u, y + hgt * 0.8], [gx + step * 3 + 12 * u, y + hgt * 0.2]], 6 * u, col, k, seed + i);
    }
  }
  function drawCompare(g, th, L, box, p, d, t, local, hold) {
    const u = th.u, vertical = box.h > box.w * 1.1;
    const gap = 70 * u, mainW = box.w + 80 * u;
    const cw = vertical ? mainW : (mainW - gap) / 2, ch = vertical ? (box.h - gap) / 2 : box.h * 0.97;
    const items = [[d.left, d.leftValue, th.bone], [d.right, d.rightValue, th.acc]];
    items.forEach(([label, value, col], i) => {
      const q = eo(span(p * 1.5, i * 0.2, i * 0.2 + 0.5));
      const x = vertical ? box.x - 40 * u : box.x - 40 * u + i * (cw + gap), y = vertical ? box.y - 10 * u + i * (ch + gap) : box.y - 10 * u + (box.h - ch) / 2 + 6 * u;
      const k = Math.max(0.0001, back(span(p * 1.5, i * 0.2, i * 0.2 + 0.4)));
      g.save(); g.translate(x + cw / 2, y + ch / 2); g.scale(k, k); g.translate(-(x + cw / 2), -(y + ch / 2)); g.globalAlpha = clamp(k * 1.6);
      film(g, th, { x, y, w: cw, h: ch }, { seed: 51 + i * 7, scan: i * 1.7 }, (R) => {
        SPECIMENS[i === 0 ? 1 : 2](g, th, R.x + R.w * 0.5, R.y + R.h * 0.5, Math.min(R.w, R.h) * (i === 0 ? 1.4 : 0.8), t + i * 3, 0.14);
        const stackW = R.w * (vertical ? 0.44 : 0.48), nMax = Math.min(14, Math.max(1, Math.round(Math.max(d.leftValue, d.rightValue))));
        const fw = Math.min(stackW / (1 + 0.13 * (nMax - 1)), R.h * 0.46), fh = fw * 1.3;
        const scx = R.x + R.w * (vertical ? 0.26 : 0.27), scy = R.y + R.h * 0.52;
        frameStack(g, th, scx, scy, fw, fh, value, q, t, col, local, hold, 3 + i * 5);
        const tx = R.x + R.w * (vertical ? 0.54 : 0.56), avail = R.x + R.w - tx - 30 * u;
        txt(g, label, tx, R.y + (vertical ? 92 : 100) * u, 58 * u, { color: i ? th.accS : th.pale, wax: true, q: span(q, 0.2, 0.8), maxW: avail });
        const numSize = Math.max(96 * u, Math.min(vertical ? 170 * u : 200 * u, avail / 1.6));
        const ny = R.y + R.h * (vertical ? 0.55 : 0.56);
        txt(g, window.DreamcutMotion.formatNumber(value * q, 0, d.prefix, d.suffix), tx, ny, numSize, { font: MONO, color: i ? th.accS : th.pale, glow: 26 * u, glowColor: i ? th.accS : "rgb(120,180,255)", maxW: avail });
        // Annotation build through the hold: tally one mark per take under the number.
        const tq = span(local, 0.9 + i * 0.3, Math.max(1.6, hold - 0.4));
        tally(g, th, tx + 6 * u, ny + 62 * u, value, tq, i ? th.accS : rgba(WHITE, 0.85), 90 + i * 20);
        if (i === 1) {
          const cq = eo(span(p, 0.6, 0.95));
          waxEllipse(g, tx + numSize * 0.4, ny - numSize * 0.34, numSize * 0.85, numSize * 0.62, 7 * u, rgba(th.red, 0.95), cq, 5);
        }
      });
      g.restore();
    });
    const aq = eo(span(p, 0.55, 0.9));
    const ax = vertical ? box.x + box.w / 2 : box.x - 40 * u + cw - 8 * u, ay = vertical ? box.y - 10 * u + ch - 16 * u : box.y + box.h * 0.1;
    const bx = vertical ? ax + 90 * u : ax + gap + 16 * u, by = vertical ? ay + gap + 26 * u : ay;
    waxArrow(g, ax, ay, bx, by, vertical ? 0.5 : -0.9, 8 * u, rgba(th.red, 0.95), aq, 77);
  }

  // ---- camera, wiring ------------------------------------------------------------------------------
  function camOf(info) {
    const i = Math.max(0, info.index);
    if (info.index > 0 && info.local < info.change) return i - 1 + inout(info.local / Math.max(0.01, info.change));
    return i;
  }
  let SHOWN = null;
  function shownList() {
    if (SHOWN) return SHOWN;
    const ctl = (typeof window !== "undefined" && window.__dreamcut && window.__dreamcut.controls) || {};
    const order = ["title", "chart", "object", "people", "process", "compare", "closing"];
    const defaults = { title: 2.4, chart: 3.4, object: 3.6, people: 3.2, process: 3.6, compare: 3.2, closing: 2.4 };
    SHOWN = order.map((id) => ({ id, hold: Number(ctl[id + "_hold"] ?? defaults[id]) })).filter((s) => s.hold > 0);
    return SHOWN;
  }
  function entranceOf() {
    const ctl = (typeof window !== "undefined" && window.__dreamcut && window.__dreamcut.controls) || {};
    return Number(ctl.entrance ?? 0.7);
  }
  const DRAW = { chart: drawChart, object: drawObject, people: drawPeople, process: drawProcess, compare: drawCompare };
  const wrap = (id) => (ctx, S, box, p, d, info) => {
    BOX = box;
    const exiting = info.exit !== undefined;
    const idx = CUR.index - (exiting ? 1 : 0);
    const dx = (idx - CUR.cam) * S.W * PITCH;
    if (Math.abs(dx) > S.W * 1.1) return;
    const th = theme(S, info.t);
    const L = layout(th, box);
    ctx.save(); ctx.translate(dx, 0);
    ctx.globalAlpha = 1;
    DRAW[id](ctx, th, L, box, exiting ? 1 : p, d, info.t, info.local, info.hold);
    ctx.restore();
    if (info.local < info.change || exiting) sweep(ctx, th);
  };
  let SWEPT = -1;
  function sweep(g, th) {
    // A sheen crosses the viewer while it slides (once per frame; outgoing and incoming both call this).
    if (SWEPT === th.t) return; SWEPT = th.t;
    const k = clamp(CUR.local / Math.max(0.01, CUR.change)), W = th.W, H = th.H;
    const f = Math.sin(Math.PI * k);
    if (f <= 0.01) return;
    g.save(); g.globalCompositeOperation = "lighter";
    const x = lerp(W * 1.2, -W * 0.2, k), gr = g.createLinearGradient(x - W * 0.3, 0, x + W * 0.3, 0);
    gr.addColorStop(0, "rgba(200,230,255,0)"); gr.addColorStop(0.5, `rgba(220,240,255,${0.22 * f})`); gr.addColorStop(1, "rgba(200,230,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, W, H); g.restore();
  }

  const XR = (over = {}) => ({
    lb: "#f3f8ff", lb2: "#9db8d6", film: "#030405", fog: [52, 64, 78], bone: [200, 220, 240], rim: [128, 148, 172], red: "#ff5d4a", dark: "#07121f", pale: "#e8f1fb", light: false, ...over,
  });
  const halo = (c) => () => `0 0 18px ${c}, 0 2px 3px rgba(0,0,0,0.7)`;

  return {
    bg: "#cfe0f2", panel: "rgba(3,4,6,0.85)", ink: "#eef4fb", muted: "#9db8d6", accent: "#ffd84a", onAccent: "#07121f",
    rule: "rgba(190,220,255,0.5)", track: "rgba(190,220,255,0.12)",
    display: COND, displayWeight: 700, displayCase: "uppercase", displayTracking: "0.045em",
    body: COND, bodyWeight: 600, figures: MONO, radius: 8, motion: "focus", change: "frost",
    kit: { line: 2.4, fill: "glass", panel: "glass" },
    xr: XR(),
    keepArt: true, overlap: true,
    palettes: {
      // Daylight viewer: warm paper-white light. Dark room: dim viewer. Mono: greyscale film.
      light: { bg: "#f6f1e4", ink: "#f6f9ff", accent: "#ffbd1f", xr: XR({ lb: "#fffdf4", lb2: "#cfc7b2", light: true, rim: [150, 160, 172], red: "#ee4b3a" }) },
      dark: { bg: "#1b2a40", xr: XR({ lb: "#4a6b94", lb2: "#0f1c2e", film: "#010203", rim: [88, 104, 126], fog: [40, 50, 62] }) },
      mono: { bg: "#d9d9d9", ink: "#f4f4f4", muted: "#b0b0b0", accent: "#f2f2f2", onAccent: "#111111", xr: XR({ lb: "#f2f2f2", lb2: "#9b9b9b", film: "#040404", fog: [56, 56, 56], bone: [214, 214, 214], rim: [132, 132, 132], red: "#b8b8b8", dark: "#111111", pale: "#f0f0f0" }) },
    },
    textShadow: halo("rgba(110,170,255,0.5)"),
    backdrop: (accent, texture, look) => (look && look.bg) || "#cfe0f2",
    css: (accent, look) => `#title-scene .kicker { align-self: flex-start; padding: 0.3em 0.85em; border-radius: 6px; background: ${accent}; color: ${look.onAccent}; text-shadow: none; letter-spacing: 0.16em; box-shadow: 0 0 22px ${accent}; }
#title, #closing { white-space: pre-line; text-wrap: balance; }
.scene h2.display { text-wrap: balance; }`,
    // The viewer is drawn by the stage; this only marks the backdrop as on.
    paint: (ctx) => { ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); },
    stage(ctx, S, info) {
      prepDom();
      const th = theme(S, info.t);
      CUR = { cam: camOf(info), index: Math.max(0, info.index), local: info.local, change: info.change, scene: info.scene, hold: info.hold };
      const shown = shownList();
      const L = layout(th, BOX || { x: (S.tall ? 90 : 140) * S.u, y: (S.tall ? S.H * 0.3 : S.H * 0.34), w: S.W - (S.tall ? 180 : 280) * S.u, h: S.tall ? S.H * 0.6 : S.H * 0.58 });
      if (S.paint) { lightbox(ctx, th); decor(ctx, th, L.main); }
      const page = (j) => (j - CUR.cam) * S.W * PITCH;
      // Pin each scene's DOM headline to its page so type always travels with its film.
      if (typeof document !== "undefined") shown.forEach((sc, j) => { const el = document.getElementById(sc.id + "-scene"); if (el) el.style.translate = `${page(j).toFixed(2)}px 0px`; });
      if (info.index < 0 || !info.scene) return;
      const pages = [info.index];
      if (info.index > 0 && info.local < info.change) pages.unshift(info.index - 1);
      for (const j of pages) {
        const sc = shown[j]; if (!sc) continue;
        const dx = page(j);
        if (Math.abs(dx) > S.W * 1.15) continue;
        const local = j === info.index ? info.local : sc.hold + info.local;
        const H = { j, change: info.change, entrance: entranceOf(), last: j === shown.length - 1 };
        ctx.save(); ctx.translate(dx, 0);
        if (sc.id === "title" || sc.id === "closing") statement(ctx, th, L, sc, local, H);
        else masthead(ctx, th, L, sc, local, H);
        ctx.restore();
      }
      SWEPT = -1;
    },
    scenes: { chart: wrap("chart"), object: wrap("object"), people: wrap("people"), process: wrap("process"), compare: wrap("compare") },
  };
});
