// Neon Sign: a rain-wet alley wall at night. Every element is a bent glass tube on a clear acrylic
// backer: white-hot cores inside coloured halos, unlit glass that shows grey before it strikes,
// black-painted jumper sections, electrodes and standoffs, cables running up to a wall conduit.
// The light washes the wet brick, falls into a rippling puddle and flickers like real gas. Scene
// changes are a whip pan along the wall: the old sign sputters and dies as the next one strikes on.
// Every frame is a pure function of time: seeded hashes only, no clocks.
window.DreamcutMotion.register("neon-sign", ({ grain, rng }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const hash = (n) => {
    let x = Math.imul(Math.floor(n) ^ 0x9e3779b9, 0x85ebca6b);
    x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  };

  // ---- colour ------------------------------------------------------------------------------------
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
    return [255, 80, 160];
  }
  const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  const WHITE = [255, 255, 255];

  function theme(S) {
    const L = S.look;
    const day = lum(rgb(L.bg)) > 150;
    const tb = (L.tubes || ["#38f0ff", "#ffb340", "#a66bff", "#7dff6b", "#ff5537"]).map(rgb);
    return {
      day, acc: rgb(S.accent), c1: tb[0], c2: tb[1], c3: tb[2], c4: tb[3], warn: tb[4], u: S.u, tex: L.texture ?? 1,
      glass: day ? "rgba(60,48,70,0.2)" : "rgba(190,200,228,0.15)", glassHi: day ? "rgba(255,255,255,0.6)" : "rgba(232,238,255,0.22)",
      paint: day ? "#26222b" : "#09080b", ink: rgb(L.ink),
    };
  }

  // ---- buffers ------------------------------------------------------------------------------------
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
    c.width = c.height = 192;
    const g = c.getContext("2d");
    const img = g.createImageData(192, 192);
    const r = rng(19);
    for (let i = 0; i < img.data.length; i += 4) { const v = r() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    return (NOISE = c);
  }

  // Per-frame state: the quarter-size glow buffer every lit tube also strokes into, and whether the
  // frame's light, reflection and weather have been laid yet.
  const GK = 4;
  const FR = { g: null, posted: false, index: 0, scene: null, shown: [], postInExit: false, t: 0 };
  function setG(ctx) {
    const m = ctx.getTransform();
    FR.g.setTransform(m.a / GK, m.b / GK, m.c / GK, m.d / GK, m.e / GK, m.f / GK);
  }
  function glowPath(ctx, P, col, a, w) {
    if (!FR.g || a <= 0.004) return;
    const g = FR.g;
    setG(ctx);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = clamp(a * ctx.globalAlpha);
    g.lineCap = "round"; g.lineJoin = "round";
    g.strokeStyle = rgba(col); g.lineWidth = w; g.stroke(P);
  }
  function glowErase(ctx, P, w) {
    if (!FR.g) return;
    const g = FR.g;
    setG(ctx);
    g.globalCompositeOperation = "destination-out"; g.globalAlpha = 1; g.lineWidth = w; g.stroke(P);
    g.globalCompositeOperation = "source-over";
  }

  // ---- flicker ------------------------------------------------------------------------------------
  // Striking: dim stutters, a dark beat, then full. `q` runs 0→1 over the strike.
  function strike(q, seed, t) {
    if (q <= 0) return 0;
    if (q >= 1) return 1;
    const h = hash(seed * 131 + Math.floor(t * 22));
    if (q < 0.55) return h > 0.5 ? 0.3 + 0.6 * q : 0.03;
    return h > 0.18 ? 0.75 + 0.25 * q : 0.25;
  }
  // The hum of a lit tube: a faint shimmer and now and then a dropout; `bad` tubes drop out often.
  function hum(t, seed, bad = false) {
    const f = Math.floor(t * 18);
    const h = hash(f * 7 + seed * 977);
    if (bad) { const burst = hash(Math.floor(t * 1.4) * 13 + seed) > 0.45; if (burst && h > 0.55) return 0.12 + 0.3 * hash(f + seed); }
    else if (h > 0.985) return 0.45;
    return 0.95 + 0.05 * Math.sin(t * 9.1 + seed * 2.3);
  }
  // The whip pan runs on one clock that starts a moment before the cut and ends with the change, so the
  // old sign is already sliding away and dimming when the next headline strikes on.
  const preOf = (hold) => Math.min(0.35, hold * 0.3);
  const panG = (since, pre, change) => eio((pre + since) / (pre + change));
  // Power dying as a sign leaves (g is the pan's progress): sputters, then dark glass.
  function powerDown(e, t, seed) {
    const base = 1 - seg(e, 0.15, 0.72);
    if (base <= 0) return 0;
    const h = hash(Math.floor(t * 26) * 3 + seed);
    return base * (h > 0.4 ? 1 : 0.15);
  }

  // ---- tube geometry ------------------------------------------------------------------------------
  function mk(pts, closed = false) {
    if (!pts || pts.length < 2) return null;
    const p = closed ? [...pts, pts[0]] : pts;
    const cum = [0];
    for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
    const path = new Path2D();
    path.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i++) path.lineTo(p[i][0], p[i][1]);
    if (closed) path.closePath();
    return { pts: p, cum, len: cum[cum.length - 1] || 1, closed, path };
  }
  const lerpPt = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  function ptAt(T, f) {
    const d = clamp(f) * T.len;
    for (let i = 0; i < T.pts.length - 1; i++) {
      if (T.cum[i + 1] >= d) return lerpPt(T.pts[i], T.pts[i + 1], (d - T.cum[i]) / (T.cum[i + 1] - T.cum[i] || 1));
    }
    return T.pts[T.pts.length - 1];
  }
  function sub(T, f0, f1) {
    const a = clamp(f0) * T.len, b = clamp(f1) * T.len;
    if (b - a < 0.5) return null;
    const P = new Path2D();
    let started = false;
    for (let i = 0; i < T.pts.length - 1; i++) {
      const c0 = T.cum[i], c1 = T.cum[i + 1];
      if (c1 < a) continue;
      if (c0 > b) break;
      const L = c1 - c0 || 1;
      const p0 = lerpPt(T.pts[i], T.pts[i + 1], (Math.max(a, c0) - c0) / L), p1 = lerpPt(T.pts[i], T.pts[i + 1], (Math.min(b, c1) - c0) / L);
      if (!started) { P.moveTo(p0[0], p0[1]); started = true; }
      P.lineTo(p1[0], p1[1]);
    }
    return P;
  }
  function rrPts(x, y, w, h, r) {
    r = Math.max(0.5, Math.min(r, w / 2, h / 2));
    const p = [];
    const corner = (cx, cy, a0) => { for (let i = 0; i <= 8; i++) { const a = a0 + (i / 8) * (Math.PI / 2); p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
    corner(x + w - r, y + r, -Math.PI / 2); corner(x + w - r, y + h - r, 0); corner(x + r, y + h - r, Math.PI / 2); corner(x + r, y + r, Math.PI);
    return p;
  }
  function arcPts(cx, cy, rx, ry, a0, a1, n = 36) {
    const p = [];
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); p.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
    return p;
  }
  function bezPts(a, b, c, d, n = 28) {
    const p = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, m = 1 - t;
      p.push([m * m * m * a[0] + 3 * m * m * t * b[0] + 3 * m * t * t * c[0] + t * t * t * d[0], m * m * m * a[1] + 3 * m * m * t * b[1] + 3 * m * t * t * c[1] + t * t * t * d[1]]);
    }
    return p;
  }
  function starPts(cx, cy, r) {
    const p = [];
    for (let i = 0; i <= 32; i++) {
      const a = (i / 32) * TAU - Math.PI / 2, k = Math.pow(Math.abs(Math.cos(a * 2)), 3);
      const rr = r * (0.22 + 0.78 * k);
      p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    return p;
  }

  // ---- drawing in the medium ----------------------------------------------------------------------
  // A tube: grey glass always; when lit, a coloured sleeve, a white-hot core and a halo into the glow
  // buffer. `to`/`from` light only part of its length (gas filling), `block` paints jumper sections black.
  function tube(ctx, S, th, T, col, lit, o = {}) {
    if (!T) return;
    const u = S.u, w = (o.w ?? 8) * u;
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (o.glass !== false) {
      ctx.lineWidth = w; ctx.strokeStyle = th.glass; ctx.stroke(T.path);
      ctx.lineWidth = Math.max(1, w * 0.24); ctx.strokeStyle = th.glassHi; ctx.stroke(T.path);
    }
    const a = clamp(lit);
    if (a > 0.004) {
      const partial = (o.to !== undefined && o.to < 0.999) || (o.from || 0) > 0.001;
      const P = partial ? sub(T, o.from || 0, o.to ?? 1) : T.path;
      if (P) {
        ctx.lineWidth = w; ctx.strokeStyle = rgba(th.day ? mix(col, [20, 10, 30], 0.12) : mix(col, WHITE, 0.1), th.day ? a : a * 0.95); ctx.stroke(P);
        ctx.lineWidth = w * (o.core ?? 0.42);
        ctx.strokeStyle = th.day ? rgba(mix(col, WHITE, 0.55), a) : rgba(mix(col, WHITE, 0.7 + 0.25 * a), clamp(a * 1.15)); ctx.stroke(P);
        glowPath(ctx, P, col, a * (o.glow ?? 1), w * 2.4);
      }
    }
    if (o.block) {
      for (const [f0, f1] of o.block) {
        const P = sub(T, f0, f1);
        if (!P) continue;
        ctx.lineWidth = w * 1.12; ctx.strokeStyle = th.paint; ctx.stroke(P);
        ctx.lineWidth = Math.max(1, w * 0.18); ctx.strokeStyle = th.day ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.09)"; ctx.stroke(P);
        glowErase(ctx, P, w * 2.6);
      }
    }
    if (o.ends && !T.closed) { electrode(ctx, S, th, T.pts[0], T.pts[1], w); electrode(ctx, S, th, T.pts[T.pts.length - 1], T.pts[T.pts.length - 2], w); }
    ctx.restore();
  }
  // The dark capped end of a tube, with the lead going back into the backer.
  function electrode(ctx, S, th, p, q, w) {
    const dx = p[0] - q[0], dy = p[1] - q[1], d = Math.hypot(dx, dy) || 1;
    const ex = p[0] + (dx / d) * w * 0.9, ey = p[1] + (dy / d) * w * 0.9;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth = w * 1.25; ctx.strokeStyle = th.day ? "#3a3540" : "#141218";
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.lineWidth = Math.max(1, w * 0.22); ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.stroke();
    ctx.restore();
  }
  // A travelling bright pulse along a lit tube (chasers on arrows and rails).
  function pulse(ctx, S, th, T, f, len, col, a = 1, w = 8) {
    if (!T || a <= 0.01) return;
    const P = sub(T, f - len, f);
    if (!P) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth = w * S.u * 0.62; ctx.strokeStyle = rgba(th.day ? mix(col, WHITE, 0.4) : mix(col, WHITE, 0.92), a); ctx.stroke(P);
    glowPath(ctx, P, mix(col, WHITE, 0.3), a * 1.2, w * S.u * 3.2);
    ctx.restore();
  }
  function spark(ctx, S, th, x, y, r, col, a) {
    if (a <= 0.01) return;
    ctx.save();
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
    g.addColorStop(0, rgba(WHITE, a)); g.addColorStop(0.3, rgba(mix(col, WHITE, 0.5), a * 0.8)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r * 2.6, y - r * 2.6, r * 5.2, r * 5.2);
    ctx.restore();
    if (FR.g) { const P = new Path2D(); P.arc(x, y, r * 0.8, 0, TAU); setG(ctx); FR.g.globalAlpha = clamp(a * ctx.globalAlpha); FR.g.fillStyle = rgba(col); FR.g.fill(P); }
  }

  // Neon lettering: the glyphs are stroked as tubes over grey glass, with a white core.
  function nfont(S, size, weight, fam) { return `${weight} ${size}px ${fam === "fig" ? S.look.figures : S.look.display}`; }
  function ntext(ctx, S, th, s, x, y, size, col, lit, o = {}) {
    s = String(s ?? "");
    if (!s) return { w: 0, z: size };
    const u = S.u, weight = o.weight ?? 500, fam = o.fam;
    ctx.save();
    let z = size;
    ctx.font = nfont(S, z, weight, fam);
    const min = o.min ?? Math.min(size, 42 * u);
    if (o.max) {
      while (z > min && ctx.measureText(s).width > o.max) { z *= 0.95; ctx.font = nfont(S, z, weight, fam); }
      if (ctx.measureText(s).width > o.max) { while (s.length > 1 && ctx.measureText(s + "…").width > o.max) s = s.slice(0, -1); s += "…"; }
    }
    ctx.textAlign = o.align || "left"; ctx.textBaseline = o.base || "middle";
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    const lw = Math.max(2 * u, z * (o.lw ?? 0.05));
    ctx.lineWidth = lw * 1.5; ctx.strokeStyle = th.glass; ctx.strokeText(s, x, y);
    const a = clamp(lit);
    if (a > 0.004) {
      ctx.lineWidth = lw; ctx.strokeStyle = rgba(th.day ? mix(col, [20, 10, 30], 0.4) : col, a); ctx.strokeText(s, x, y);
      ctx.fillStyle = th.day ? rgba(mix(col, [20, 10, 30], 0.15), a) : rgba(mix(col, WHITE, 0.8 + 0.2 * a), clamp(a * 1.1)); ctx.fillText(s, x, y);
      if (FR.g) {
        const g = FR.g;
        setG(ctx);
        g.globalAlpha = clamp(a * ctx.globalAlpha * (o.glow ?? 1)); g.font = ctx.font; g.textAlign = ctx.textAlign; g.textBaseline = ctx.textBaseline;
        g.lineJoin = "round"; g.lineWidth = lw * 3.2; g.strokeStyle = rgba(col); g.strokeText(s, x, y);
      }
    } else { ctx.fillStyle = th.glass; ctx.fillText(s, x, y); }
    const w = ctx.measureText(s).width;
    ctx.restore();
    return { w, z };
  }
  function textW(S, s, size, weight = 500, fam) { const c = buf("meas", 4, 4).getContext("2d"); c.font = nfont(S, size, weight, fam); return c.measureText(String(s)).width; }
  const fmt = (v, ref, suffix = "") => (Number.isInteger(Number(ref)) ? Math.round(v).toLocaleString("en-US") : v.toFixed(1)) + (suffix || "");

  // A clear acrylic backer: faint face, bright cut edges, four standoffs, and cables up to the conduit.
  function backer(ctx, S, th, x, y, w, h, o = {}) {
    const u = S.u, r = 26 * u;
    ctx.save();
    if (o.cables !== false && S.paint) {
      const cy = conduitY(S);
      for (const fx of o.cablesAt || [0.86]) {
        const cx = x + w * fx;
        ctx.beginPath(); ctx.moveTo(cx, y + 10 * u);
        ctx.bezierCurveTo(cx + 26 * u, y - (y - cy) * 0.35, cx - 30 * u, cy + (y - cy) * 0.3, cx + 8 * u, cy + 8 * u);
        ctx.lineWidth = 5 * u; ctx.strokeStyle = th.day ? "#3b3640" : "#060508"; ctx.stroke();
        ctx.lineWidth = 1.4 * u; ctx.strokeStyle = th.day ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.08)"; ctx.stroke();
      }
    }
    const P = new Path2D(); const pts = rrPts(x, y, w, h, r); P.moveTo(pts[0][0], pts[0][1]); pts.forEach((p) => P.lineTo(p[0], p[1])); P.closePath();
    ctx.fillStyle = th.day ? "rgba(255,255,255,0.22)" : "rgba(220,230,255,0.035)"; ctx.fill(P);
    // Drop shadow of the panel's edge on the wall.
    ctx.save(); ctx.translate(10 * u, 16 * u); ctx.lineWidth = 3 * u; ctx.strokeStyle = th.day ? "rgba(40,30,50,0.12)" : "rgba(0,0,0,0.35)"; ctx.stroke(P); ctx.restore();
    const edge = ctx.createLinearGradient(x, y, x + w, y + h);
    edge.addColorStop(0, th.day ? "rgba(255,255,255,0.9)" : "rgba(220,230,255,0.28)"); edge.addColorStop(0.5, th.day ? "rgba(255,255,255,0.35)" : "rgba(220,230,255,0.07)"); edge.addColorStop(1, th.day ? "rgba(255,255,255,0.7)" : "rgba(220,230,255,0.18)");
    ctx.lineWidth = 2 * u; ctx.strokeStyle = edge; ctx.stroke(P);
    // A long specular glint across the acrylic.
    ctx.save(); ctx.clip(P);
    const gx = x + w * (0.15 + 0.7 * ((FR.t * 0.05 + x * 0.0003) % 1));
    const gl = ctx.createLinearGradient(gx - 80 * u, y, gx + 80 * u, y + h * 0.4);
    gl.addColorStop(0, "rgba(255,255,255,0)"); gl.addColorStop(0.5, th.day ? "rgba(255,255,255,0.25)" : "rgba(220,230,255,0.05)"); gl.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gl; ctx.fillRect(x, y, w, h);
    ctx.restore();
    for (const [sx, sy] of [[x + 22 * u, y + 22 * u], [x + w - 22 * u, y + 22 * u], [x + 22 * u, y + h - 22 * u], [x + w - 22 * u, y + h - 22 * u]]) {
      const g = ctx.createRadialGradient(sx - 3 * u, sy - 3 * u, 0, sx, sy, 9 * u);
      g.addColorStop(0, th.day ? "#ffffff" : "#c9ccd6"); g.addColorStop(1, th.day ? "#8d8794" : "#2a2a32");
      ctx.beginPath(); ctx.arc(sx, sy, 8 * u, 0, TAU); ctx.fillStyle = g; ctx.fill();
    }
    ctx.restore();
  }
  // Little clips that hold a tube off the backer.
  function clips(ctx, S, th, T, n) {
    if (!T) return;
    const u = S.u;
    ctx.save();
    ctx.lineCap = "round";
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n, a = ptAt(T, f), b = ptAt(T, Math.min(1, f + 0.01));
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2;
      ctx.lineWidth = 3.4 * u; ctx.strokeStyle = th.day ? "rgba(60,55,70,0.7)" : "rgba(10,10,14,0.9)";
      ctx.beginPath(); ctx.moveTo(a[0] - Math.cos(ang) * 9 * u, a[1] - Math.sin(ang) * 9 * u); ctx.lineTo(a[0] + Math.cos(ang) * 9 * u, a[1] + Math.sin(ang) * 9 * u); ctx.stroke();
    }
    ctx.restore();
  }

  // ---- icons bent from tube ------------------------------------------------------------------------
  function iconTubes(name, cx, cy, s) {
    const h = s / 2, out = [];
    switch (name) {
      case "eye":
        out.push(mk([...bezPts([cx - h, cy], [cx - h * 0.4, cy - h * 0.75], [cx + h * 0.4, cy - h * 0.75], [cx + h, cy]), ...bezPts([cx + h, cy], [cx + h * 0.4, cy + h * 0.75], [cx - h * 0.4, cy + h * 0.75], [cx - h, cy]).slice(1)], true));
        out.push(mk(arcPts(cx, cy, h * 0.3, h * 0.3, 0, TAU), true));
        break;
      case "pencil": {
        const a = -0.78, c = Math.cos(a), sn = Math.sin(a), L = h * 1.5, W = h * 0.26;
        const P = (x, y) => [cx + x * c - y * sn, cy + x * sn + y * c];
        out.push(mk([P(-L / 2, -W), P(L / 2 - W * 1.6, -W), P(L / 2, 0), P(L / 2 - W * 1.6, W), P(-L / 2, W)], true));
        out.push(mk([P(-L / 2 + W * 1.2, -W), P(-L / 2 + W * 1.2, W)]));
        break;
      }
      case "check":
        out.push(mk([[cx - h * 0.62, cy + h * 0.02], [cx - h * 0.16, cy + h * 0.48], [cx + h * 0.7, cy - h * 0.5]]));
        break;
      case "loop":
        out.push(mk(arcPts(cx, cy, h * 0.62, h * 0.62, -0.4, TAU * 0.8)));
        out.push(mk([[cx + h * 0.62 * Math.cos(-0.4) - h * 0.28, cy + h * 0.62 * Math.sin(-0.4) - h * 0.12], [cx + h * 0.62 * Math.cos(-0.4), cy + h * 0.62 * Math.sin(-0.4)], [cx + h * 0.62 * Math.cos(-0.4) + h * 0.06, cy + h * 0.62 * Math.sin(-0.4) - h * 0.32]]));
        break;
      case "heart":
        out.push(mk([...bezPts([cx, cy + h * 0.7], [cx - h * 1.1, cy - h * 0.1], [cx - h * 0.55, cy - h * 0.95], [cx, cy - h * 0.35]), ...bezPts([cx, cy - h * 0.35], [cx + h * 0.55, cy - h * 0.95], [cx + h * 1.1, cy - h * 0.1], [cx, cy + h * 0.7]).slice(1)]));
        break;
      case "play":
        out.push(mk([[cx - h * 0.4, cy - h * 0.6], [cx + h * 0.6, cy], [cx - h * 0.4, cy + h * 0.6]], true));
        break;
      case "trend":
        out.push(mk([[cx - h * 0.7, cy + h * 0.45], [cx - h * 0.2, cy - h * 0.05], [cx + h * 0.1, cy + h * 0.2], [cx + h * 0.65, cy - h * 0.45]]));
        out.push(mk([[cx + h * 0.25, cy - h * 0.5], [cx + h * 0.68, cy - h * 0.48], [cx + h * 0.66, cy - h * 0.05]]));
        break;
      case "bolt":
        out.push(mk([[cx + h * 0.15, cy - h * 0.8], [cx - h * 0.4, cy + h * 0.1], [cx + h * 0.02, cy + h * 0.1], [cx - h * 0.15, cy + h * 0.8], [cx + h * 0.42, cy - h * 0.12], [cx, cy - h * 0.12]], true));
        break;
      default:
        out.push(mk(arcPts(cx, cy, h * 0.5, h * 0.5, 0, TAU), true));
    }
    return out;
  }
  function icon(ctx, S, th, name, cx, cy, s, col, lit, w = 7) {
    for (const T of iconTubes(name, cx, cy, s)) tube(ctx, S, th, T, col, lit, { w });
  }

  // ---- the world ----------------------------------------------------------------------------------
  const floorY = (S) => S.H * (S.tall ? 0.925 : 0.89);
  const conduitY = (S) => (S.tall ? 92 : 46) * S.u;
  const WALLS = {};
  function wallCanvas(S, th) {
    const L = S.look, u = S.u, W = S.W, fy = Math.ceil(floorY(S));
    const key = `${W}x${fy}|${L.brick}|${L.mortar}`;
    if (WALLS[key]) return WALLS[key];
    const c = document.createElement("canvas");
    c.width = W; c.height = fy;
    const g = c.getContext("2d");
    const brick = rgb(L.brick || "#3a2a35"), mortar = rgb(L.mortar || "#151017");
    g.fillStyle = rgba(mortar); g.fillRect(0, 0, W, fy);
    const n = Math.max(6, Math.round(W / (150 * u))), bw = W / n, bh = 46 * u, m = 5 * u;
    const r = rng(7);
    for (let row = 0, y = 0; y < fy; row++, y += bh) {
      const off = row % 2 ? bw / 2 : 0;
      for (let i = -1; i <= n; i++) {
        const col = ((i % n) + n) % n;
        const rr = rng(row * 131 + col * 7 + 3);
        const v = (rr() - 0.5) * 0.34, warm = (rr() - 0.5) * 0.1;
        let base = mix(brick, v > 0 ? WHITE : [0, 0, 0], Math.abs(v) * 0.7);
        base = [base[0] * (1 + warm), base[1], base[2] * (1 - warm)];
        const x = i * bw + off;
        const gr = g.createLinearGradient(0, y, 0, y + bh);
        gr.addColorStop(0, rgba(mix(base, WHITE, th.day ? 0.12 : 0.08))); gr.addColorStop(1, rgba(mix(base, [0, 0, 0], 0.18)));
        g.fillStyle = gr;
        g.beginPath(); g.roundRect ? g.roundRect(x + m / 2, y + m / 2, bw - m, bh - m, 3 * u) : g.rect(x + m / 2, y + m / 2, bw - m, bh - m); g.fill();
        // Pits and chips.
        for (let k = 0; k < 5; k++) {
          g.fillStyle = rgba(rr() > 0.5 ? mix(base, [0, 0, 0], 0.35) : mix(base, WHITE, 0.12), 0.5);
          g.beginPath(); g.arc(x + m + rr() * (bw - 2 * m), y + m + rr() * (bh - 2 * m), (1 + rr() * 3) * u, 0, TAU); g.fill();
        }
        // Wet top lip catches light.
        g.fillStyle = th.day ? "rgba(255,255,255,0.25)" : "rgba(200,210,255,0.05)"; g.fillRect(x + m / 2 + 3 * u, y + m / 2, bw - m - 6 * u, 2 * u);
      }
    }
    // Rain run-off stains: long vertical streaks, wrapped so the wall tiles.
    for (let k = 0; k < 26; k++) {
      const x = r() * W, w = (20 + r() * 90) * u, y0 = r() * fy * 0.4, dark = r() > 0.35;
      for (const xx of [x, x - W, x + W]) {
        const gr = g.createLinearGradient(0, y0, 0, fy);
        gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(0.3, dark ? `rgba(0,0,0,${th.day ? 0.08 : 0.22})` : `rgba(180,190,230,${th.day ? 0.12 : 0.05})`); gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr; g.fillRect(xx - w / 2, y0, w, fy - y0);
      }
    }
    // Soot toward the ground and the top.
    const sh = g.createLinearGradient(0, 0, 0, fy);
    sh.addColorStop(0, `rgba(0,0,0,${th.day ? 0.1 : 0.45})`); sh.addColorStop(0.25, "rgba(0,0,0,0)"); sh.addColorStop(0.8, "rgba(0,0,0,0)"); sh.addColorStop(1, `rgba(0,0,0,${th.day ? 0.15 : 0.5})`);
    g.fillStyle = sh; g.fillRect(0, 0, W, fy);
    return (WALLS[key] = c);
  }
  // Wall, conduit, drips and a car's headlights passing; `wx` is the camera's position along the wall.
  function world(ctx, S, th, t, wx) {
    const { W, H, u } = S, fy = floorY(S);
    const wall = wallCanvas(S, th);
    const ox = -(((wx % W) + W) % W);
    ctx.save();
    ctx.drawImage(wall, ox, 0); ctx.drawImage(wall, ox + W, 0);
    // Dim night ambient over the brick.
    if (!th.day) { const v = ctx.createLinearGradient(0, 0, 0, fy); v.addColorStop(0, "rgba(6,4,14,0.45)"); v.addColorStop(1, "rgba(6,4,14,0.2)"); ctx.fillStyle = v; ctx.fillRect(0, 0, W, fy); }
    // Headlights from the street sweep the wall now and then.
    const cyc = 7.5, ph = ((t + 2.2) % cyc) / cyc;
    if (ph < 0.42) {
      const q = ph / 0.42, x = -W * 0.4 + q * W * 1.8;
      const g = ctx.createLinearGradient(x - W * 0.25, 0, x + W * 0.25, 0);
      const a = (th.day ? 0.12 : 0.1) * Math.sin(q * Math.PI);
      g.addColorStop(0, "rgba(255,236,200,0)"); g.addColorStop(0.5, `rgba(255,236,200,${a})`); g.addColorStop(1, "rgba(255,236,200,0)");
      ctx.globalCompositeOperation = th.day ? "source-over" : "lighter"; ctx.fillStyle = g; ctx.fillRect(0, 0, W, fy);
      ctx.globalCompositeOperation = "source-over";
    }
    // Conduit along the top with couplings and a junction box per stretch of wall.
    const cy = conduitY(S);
    const pg = ctx.createLinearGradient(0, cy - 9 * u, 0, cy + 9 * u);
    pg.addColorStop(0, th.day ? "#9c96a2" : "#3a3942"); pg.addColorStop(0.35, th.day ? "#e8e4ea" : "#6a6a76"); pg.addColorStop(1, th.day ? "#6d6773" : "#141318");
    ctx.fillStyle = pg; ctx.fillRect(0, cy - 9 * u, W, 18 * u);
    const step = 360 * u;
    for (let x = ox % step - step; x < W + step; x += step) {
      ctx.fillStyle = th.day ? "#857f8c" : "#25242b"; ctx.fillRect(x, cy - 12 * u, 22 * u, 24 * u);
      ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(x, cy - 12 * u, 22 * u, 3 * u);
    }
    for (const bx of [ox + W * 0.86, ox + W * 1.86]) {
      ctx.fillStyle = th.day ? "#8f8996" : "#1d1c22"; ctx.fillRect(bx - 34 * u, cy - 26 * u, 68 * u, 52 * u);
      ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.lineWidth = 2 * u; ctx.strokeRect(bx - 34 * u, cy - 26 * u, 68 * u, 52 * u);
      const on = Math.floor(t * 1.3) % 2 === 0;
      spark(ctx, S, th, bx + 20 * u, cy + 12 * u, 3 * u, [255, 60, 50], on ? 0.9 : 0.15);
    }
    // Water trickling down the brick.
    for (let k = 0; k < 7; k++) {
      const bx = (((hash(k * 17 + 5) * W + ox) % W) + W) % W;
      const len = fy * (0.25 + 0.4 * hash(k * 3 + 1)), y0 = fy - len;
      ctx.fillStyle = th.day ? "rgba(255,255,255,0.18)" : "rgba(170,185,230,0.06)"; ctx.fillRect(bx, y0, 2.2 * u, len);
      const per = 2.4 + hash(k) * 2.2, q = ((t / per + hash(k * 9)) % 1);
      const dy = y0 + q * len;
      const dg = ctx.createLinearGradient(0, dy - 40 * u, 0, dy);
      dg.addColorStop(0, "rgba(220,230,255,0)"); dg.addColorStop(1, th.day ? "rgba(255,255,255,0.7)" : "rgba(220,230,255,0.35)");
      ctx.fillStyle = dg; ctx.fillRect(bx - 0.5 * u, dy - 40 * u, 3.2 * u, 40 * u);
    }
    // Wet pavement.
    const fg = ctx.createLinearGradient(0, fy, 0, H);
    fg.addColorStop(0, th.day ? "#8e8a92" : "#0d0b12"); fg.addColorStop(1, th.day ? "#6c6870" : "#050408");
    ctx.fillStyle = fg; ctx.fillRect(0, fy, W, H - fy);
    ctx.restore();
  }

  // The frame's light, reflection and weather: laid once, after the last thing drawn.
  function post(ctx, S, th, t) {
    if (FR.posted) return;
    FR.posted = true;
    const { W, H, u } = S;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.filter = "none"; ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    headlineGlow(S, th);
    const g = FR.g.canvas;
    const levels = [[1.4, th.day ? 0.4 : 1.0, "lighter"], [5.5, th.day ? 0.3 : 0.75, "lighter"], [20, th.day ? 0.22 : 0.85, th.day ? "source-over" : "lighter"]];
    levels.forEach(([r, a, op], i) => {
      const b = buf("gl" + i, g.width, g.height), bc = b.getContext("2d");
      bc.setTransform(1, 0, 0, 1, 0, 0); bc.clearRect(0, 0, b.width, b.height);
      bc.filter = `blur(${(r * u).toFixed(2)}px)`; bc.drawImage(g, 0, 0); bc.filter = "none";
      ctx.globalCompositeOperation = th.day ? "source-over" : op; ctx.globalAlpha = clamp(a * (S.look.glowGain ?? 1));
      ctx.drawImage(b, 0, 0, W, H);
      // The widest light also lifts the brick it lands on.
      if (i === 2 && !th.day) { ctx.globalCompositeOperation = "overlay"; ctx.globalAlpha = 0.8 * (S.look.glowGain ?? 1); ctx.drawImage(b, 0, 0, W, H); }
    });
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    if (S.paint) { reflection(ctx, S, th, t); weather(ctx, S, th, t); }
    if (th.tex > 0) {
      ctx.save();
      const r = rng(Math.floor(t * 24) * 7919 + 3);
      ctx.translate(-r() * 192, -r() * 192);
      ctx.globalCompositeOperation = "overlay"; ctx.globalAlpha = 0.07 * th.tex;
      ctx.fillStyle = ctx.createPattern(noise(), "repeat"); ctx.fillRect(0, 0, W + 192, H + 192);
      ctx.restore();
    }
    if (S.paint && !th.day) {
      const v = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.45, Math.max(W, H) * 0.78);
      v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, `rgba(0,0,0,${0.55 * (0.4 + 0.6 * th.tex)})`);
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }
  function reflection(ctx, S, th, t) {
    const { W, H, u } = S, fy = Math.floor(floorY(S)), R = H - fy, src = Math.min(fy, R * 2.6);
    const rb = buf("refl", W, R), rc = rb.getContext("2d");
    rc.setTransform(1, 0, 0, 1, 0, 0); rc.clearRect(0, 0, W, R);
    rc.save(); rc.translate(0, R); rc.scale(1, -R / src); rc.drawImage(ctx.canvas, 0, fy - src, W, src, 0, 0, W, src); rc.restore();
    ctx.save();
    ctx.globalCompositeOperation = th.day ? "source-over" : "lighter";
    const step = Math.max(2, Math.round(3 * u));
    for (let y = 0; y < R; y += step) {
      const k = y / R;
      const dx = Math.sin(y * 0.16 / u + t * 2.4) * (1.5 + k * 9) * u + Math.sin(y * 0.05 / u - t * 1.3) * 3 * u * k;
      ctx.globalAlpha = (th.day ? 0.28 : 0.5) * (1 - k * 0.65) * (0.45 + 0.55 * (S.look.texture ?? 1));
      ctx.drawImage(rb, 0, y, W, step, dx, fy + y, W, step);
    }
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    // Curb lip and rain rings in the puddle.
    const lg = ctx.createLinearGradient(0, fy - 2 * u, 0, fy + 4 * u);
    lg.addColorStop(0, "rgba(0,0,0,0.6)"); lg.addColorStop(1, th.day ? "rgba(255,255,255,0.4)" : "rgba(200,210,255,0.12)");
    ctx.fillStyle = lg; ctx.fillRect(0, fy - 2 * u, W, 6 * u);
    ctx.lineWidth = 1.6 * u;
    for (let i = 0; i < 14; i++) {
      const per = 0.9 + hash(i * 5) * 0.9, cyc = Math.floor(t / per + hash(i * 11)), q = (t / per + hash(i * 11)) % 1;
      const x = hash(i * 31 + cyc * 7) * W, y = fy + R * (0.15 + 0.8 * hash(i * 13 + cyc * 3));
      const r = (4 + q * 46) * u * (0.6 + (y - fy) / R);
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.22, 0, 0, TAU);
      ctx.strokeStyle = th.day ? `rgba(255,255,255,${0.5 * (1 - q)})` : `rgba(200,215,255,${0.28 * (1 - q)})`; ctx.stroke();
    }
    ctx.restore();
  }
  function weather(ctx, S, th, t) {
    const { W, H, u } = S, a = 0.4 + 0.6 * th.tex;
    ctx.save();
    ctx.lineCap = "round";
    for (const [n, sp, len, wid, al, seed] of [[70, 1500, 46, 1.3, 0.14, 1], [26, 2300, 90, 2.2, 0.16, 2]]) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x0 = hash(i * 7 + seed * 1000) * (W + 200 * u) - 100 * u;
        const y = (((hash(i * 13 + seed * 333) * (H + 300 * u) + t * sp * u) % (H + 300 * u)) + H + 300 * u) % (H + 300 * u) - 150 * u;
        const x = x0 + (y / H) * 60 * u;
        ctx.moveTo(x, y); ctx.lineTo(x + len * 0.12 * u, y + len * u);
      }
      ctx.lineWidth = wid * u; ctx.strokeStyle = th.day ? `rgba(80,90,120,${al * a})` : `rgba(200,212,255,${al * a})`; ctx.stroke();
    }
    // Low mist rolling over the pavement.
    const fy = floorY(S);
    for (let k = 0; k < 4; k++) {
      const x = ((((t * 18 * u + k * W * 0.33) % (W * 1.4)) + W * 1.4) % (W * 1.4)) - W * 0.2, r = W * 0.22;
      const g = ctx.createRadialGradient(x, fy, 0, x, fy, r);
      g.addColorStop(0, th.day ? "rgba(255,255,255,0.12)" : `rgba(150,140,200,${0.06 * a})`); g.addColorStop(1, "rgba(150,140,200,0)");
      ctx.fillStyle = g; ctx.fillRect(x - r, fy - r * 0.4, r * 2, r * 0.8);
    }
    ctx.restore();
  }

  // ---- headlines --------------------------------------------------------------------------------
  // The DOM words are neon too: their light reaches the wall through the glow buffer, and they hum.
  const MEAS = {};
  function measure(S, id) {
    const el = document.getElementById(id);
    if (!el || !el.textContent) return null;
    const scene = el.parentElement;
    const size = parseFloat(el.style.fontSize) || 72 * S.u;
    const side = parseFloat(scene && scene.style.paddingLeft) || 140 * S.u;
    const maxW = parseFloat(el.style.width) || S.W - side * 2;
    const key = id + "|" + el.textContent + "|" + size + "|" + S.W + "|" + S.H;
    if (MEAS[key]) return MEAS[key];
    const c = buf("meas", 4, 4).getContext("2d");
    c.font = `${S.look.displayWeight} ${size}px ${S.look.display}`;
    // Break like the browser: at spaces, and after hyphens.
    const toks = [];
    String(el.textContent).split(/\s+/).filter(Boolean).forEach((w) => w.split(/(?<=-)/).forEach((p, i) => toks.push({ p, sp: i === 0 })));
    const wrap = (mw) => {
      const out = [];
      let line = "";
      for (const k of toks) {
        const n = line ? line + (k.sp ? " " : "") + k.p : k.p;
        if (line && c.measureText(n).width > mw) { out.push(line); line = k.p; } else line = n;
      }
      if (line) out.push(line);
      return out;
    };
    // The headings use text-wrap: balance, so find the narrowest width that keeps the same line count.
    let lines = wrap(maxW);
    if (lines.length > 1) {
      let lo = 0, hi = maxW;
      for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (wrap(mid).length > lines.length) lo = mid; else hi = mid; }
      lines = wrap(hi);
    }
    const widths = lines.map((l) => c.measureText(l).width);
    const h = lines.length * size * 1.04;
    let kick = 0, ks = 0, kw = 0;
    if (id === "title") {
      const k = document.getElementById("kicker");
      if (k && k.textContent) {
        ks = parseFloat(k.style.fontSize) || 30 * S.u;
        c.font = `600 ${ks}px ${S.look.body}`;
        kw = c.measureText(k.textContent.toUpperCase()).width + k.textContent.length * ks * 0.14 + ks * 2.2;
        kick = ks * 2.3 + (parseFloat(k.style.marginBottom) || 24 * S.u);
      }
    }
    const statement = scene && scene.classList.contains("statement");
    const top = statement ? (S.H - h - kick) / 2 : parseFloat(scene.style.top) || 96 * S.u;
    return (MEAS[key] = { x: side, top, textTop: top + kick, bottom: top + kick + h, w: Math.max(kw, ...widths), widths, lines, size, ks, kw, kick });
  }
  // The words' brightness from the template's own timing (the glow strike in, the fade out), so the
  // wall light never lags the DOM when a frame is rendered out of order.
  function headAlpha(s, i, t, stag) {
    const c = (window.__dreamcut && window.__dreamcut.controls) || {};
    const e = Number(c.entrance ?? 0.7), change = Number(c.change ?? 0.45);
    const tl = t - s.start - stag;
    if (tl < 0) return 0;
    let a = 1;
    if (tl < 0.12 * e) a = 0.55 * (tl / (0.12 * e));
    else if (tl < 0.14 * e) a = 0.55;
    else if (tl < 0.24 * e) a = 0.55 - 0.47 * ((tl - 0.14 * e) / (0.1 * e));
    else if (tl < 0.3 * e) a = 0.08;
    else if (tl < 0.8 * e) a = 0.08 + 0.92 * (1 - Math.pow(1 - (tl - 0.3 * e) / (0.5 * e), 2));
    const last = i === FR.shown.length - 1;
    if (!last) {
      const x = t - (s.start + s.hold - change);
      if (x > 0) a *= 1 - Math.pow(clamp(x / change), 2);
      if (t >= s.start + s.hold) a = 0;
    }
    return clamp(a);
  }
  function headlineGlow(S, th) {
    if (!FR.g || th.day) return;
    const g = FR.g;
    g.setTransform(1 / GK, 0, 0, 1 / GK, 0, 0);
    FR.shown.forEach((s, si) => {
      const id = s.id === "title" ? "title" : s.id === "closing" ? "closing" : s.id + "-title";
      const a = headAlpha(s, si, FR.t, s.id === "title" ? 0.12 : 0);
      if (a < 0.03) return;
      const M = measure(S, id);
      if (!M) return;
      g.globalAlpha = a * 0.75; g.textBaseline = "middle"; g.textAlign = "left"; g.lineJoin = "round";
      g.font = `${S.look.displayWeight} ${M.size}px ${S.look.display}`;
      g.strokeStyle = g.fillStyle = rgba(th.acc); g.lineWidth = M.size * 0.12;
      M.lines.forEach((l, i) => { const y = M.textTop + M.size * (1.04 * i + 0.6); g.strokeText(l, M.x, y); });
      if (M.kick) {
        g.globalAlpha = headAlpha(s, si, FR.t, 0) * 0.9; g.strokeStyle = rgba(th.c1); g.lineWidth = 4 * S.u;
        g.strokeRect(M.x, M.top + 2 * S.u, M.kw, M.ks * 2);
      }
    });
  }
  function neonShadow(accent, b, day) {
    const c = rgb(accent);
    if (day) return `0 0 0.06em ${rgba(WHITE, 0.8)}, 0 0 0.3em ${rgba(c, 0.45 * b)}`;
    return `0 0 0.025em ${rgba(WHITE, 0.95 * b)}, 0 0 0.09em ${rgba(c, b)}, 0 0 0.22em ${rgba(c, 0.9 * b)}, 0 0 0.55em ${rgba(c, 0.65 * b)}, 0 0 1.1em ${rgba(c, 0.35 * b)}`;
  }

  // ---- statements: the title and closing signs --------------------------------------------------
  // The emblem goes in the roomiest free space: right of the words, under or over them, or beside a
  // short last line (then the words get no frame, since the emblem sits inside its bounds).
  function emblemRegion(S, M) {
    const { W, u, tall } = S, fy = floorY(S), top = conduitY(S) + 70 * u, edge = 80 * u;
    const fr = frameRect(S, M);
    const lastW = M.widths[M.widths.length - 1] || M.w, lastTop = M.textTop + M.size * 1.04 * (M.lines.length - 1);
    const c = [
      { x: fr.x + fr.w + 50 * u, y: top, w: W - edge - (fr.x + fr.w + 50 * u), h: fy - 40 * u - top, frame: true, at: "side" },
      { x: edge, y: fr.y + fr.h + 40 * u, w: W - edge * 2, h: fy - 40 * u - (fr.y + fr.h + 40 * u), frame: true, at: "below" },
      { x: M.x + lastW + 110 * u, y: lastTop - 20 * u, w: W - edge - (M.x + lastW + 110 * u), h: fy - 40 * u - (lastTop - 20 * u), frame: false, at: "beside" },
    ];
    if (!tall) c.push({ x: edge, y: top, w: W - edge * 2, h: fr.y - 30 * u - top, frame: true, at: "above" });
    let best = null;
    for (const r of c) { r.s = Math.min(r.w, r.h); if (r.s > 200 * u && (!best || r.s > best.s * 1.15)) best = r; }
    return best;
  }
  function frameRect(S, M) {
    const u = S.u, x = Math.max(70 * u, M.x - 50 * u), y = M.top - 44 * u;
    return { x, y, w: Math.min(M.w + 100 * u, S.W - x * 2), h: M.bottom + 64 * u - y };
  }
  function underline(ctx, S, th, M, col, lit, t) {
    const u = S.u, y = M.bottom + 26 * u, x0 = M.x + 6 * u, x1 = M.x + Math.min(M.widths[M.widths.length - 1] || M.w, S.W - M.x * 2);
    const T = mk([...arcPts(x0 + 18 * u, y - 18 * u, 18 * u, 18 * u, Math.PI * 0.5, Math.PI * 2.1, 18), ...bezPts([x0 + 36 * u, y - 14 * u], [x0 + (x1 - x0) * 0.3, y + 10 * u], [x0 + (x1 - x0) * 0.7, y - 6 * u], [x1, y + 4 * u], 30)]);
    tube(ctx, S, th, T, col, lit, { w: 7, ends: true, to: eo(clamp(lit * 1.2)), block: [[0.04, 0.09]] });
    if (lit > 0.95) pulse(ctx, S, th, T, ((t * 0.45) % 1.3), 0.12, col, 0.9);
  }
  function clapper(ctx, S, th, cx, cy, s, local, t, L) {
    const u = S.u;
    const bw = s * 0.9, bh = s * 0.5, bx = cx - bw / 2, by = cy - bh / 2 + s * 0.14;
    backer(ctx, S, th, cx - s * 0.56, cy - s * 0.52, s * 1.12, s * 1.06, { cablesAt: [0.8] });
    const lit = (q0, q1, seed) => L * strike(seg(local, q0, q1), seed, t) * hum(t, seed);
    // Board.
    const B = mk(rrPts(bx, by, bw, bh, s * 0.05), true);
    tube(ctx, S, th, B, th.c1, lit(0.15, 0.55, 11), { w: 9 });
    clips(ctx, S, th, B, 6);
    const fz = Math.max(42 * u, s * 0.085);
    tube(ctx, S, th, mk([[bx + bw * 0.06, by + bh * 0.36], [bx + bw * 0.6, by + bh * 0.36]]), th.c2, lit(0.35, 0.7, 12), { w: 6, ends: true });
    if (textW(S, "TAKE 01", fz, 600) < bw * 0.54) ntext(ctx, S, th, "TAKE 01", bx + bw * 0.08, by + bh * 0.62, fz, th.c2, lit(0.45, 0.85, 13), { weight: 600 });
    else tube(ctx, S, th, mk([[bx + bw * 0.06, by + bh * 0.6], [bx + bw * 0.42, by + bh * 0.6]]), th.c3, lit(0.45, 0.85, 13), { w: 6, ends: true });
    // A waveform beside the play mark.
    const wv = [];
    for (let i = 0; i <= 40; i++) { const x = bx + bw * 0.08 + (bw * 0.5 * i) / 40; wv.push([x, by + bh * 0.85 + Math.sin(i * 1.3 + t * 5) * bh * 0.05 * (0.4 + 0.6 * Math.abs(Math.sin(i * 0.37)))]); }
    tube(ctx, S, th, mk(wv), th.c4, lit(0.55, 0.9, 14), { w: 5 });
    const px = bx + bw * 0.8, py = by + bh * 0.55, pr = bh * 0.24;
    tube(ctx, S, th, mk([[px - pr * 0.6, py - pr], [px + pr, py], [px - pr * 0.6, py + pr]], true), th.acc, lit(0.5, 0.9, 15) * (0.8 + 0.2 * Math.sin(t * 4)), { w: 8 });
    // The clapper arm snaps shut every couple of seconds.
    const cyc = 2.3, ph = local < 1.1 ? 0.7 : ((local - 1.1) % cyc) / cyc;
    let ang = -0.42;
    if (ph < 0.07) ang = -0.42 * (1 - ph / 0.07); else if (ph < 0.17) ang = 0; else ang = -0.42 * eo((ph - 0.17) / 0.4);
    const flash = ph < 0.07 ? 0 : ph < 0.3 ? 1 - (ph - 0.07) / 0.23 : 0;
    const hx = bx, hy = by - 6 * u, aw = bw, ah = bh * 0.24;
    ctx.save();
    ctx.translate(hx, hy); ctx.rotate(ang); ctx.translate(-hx, -hy);
    const Arm = mk([[hx, hy], [hx + aw, hy], [hx + aw, hy - ah], [hx, hy - ah]], true);
    tube(ctx, S, th, Arm, th.c1, lit(0.25, 0.6, 16), { w: 8 });
    for (let i = 0; i < 5; i++) {
      const x0 = hx + aw * (0.08 + i * 0.19);
      tube(ctx, S, th, mk([[x0, hy - ah * 0.15], [x0 + aw * 0.1, hy - ah * 0.85]]), i % 2 ? WHITE : th.acc, lit(0.4 + i * 0.05, 0.75 + i * 0.05, 20 + i) * (1 + flash * 0.6), { w: 7, glow: 1 + flash });
    }
    ctx.restore();
    spark(ctx, S, th, hx, hy, 9 * u, th.c1, L * 0.8);
    if (flash > 0) {
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI * 0.15 - i * 0.22, r0 = aw * 1.06, r1 = r0 + 40 * u * flash;
        const T = mk([[hx + Math.cos(a) * r0, hy + Math.sin(a) * r0 * 0.5 - ah], [hx + Math.cos(a) * r1, hy + Math.sin(a) * r1 * 0.5 - ah]]);
        tube(ctx, S, th, T, th.c2, L * flash, { w: 5, glass: false });
      }
    }
    // Twinkling stars round the sign.
    const st = [[-0.55, -0.42, 0.07], [0.58, -0.3, 0.05], [0.6, 0.5, 0.06], [-0.6, 0.45, 0.045]];
    st.forEach(([fx, fy, fr], i) => {
      const tw = 0.55 + 0.45 * Math.sin(t * (2.2 + i * 0.7) + i * 2);
      tube(ctx, S, th, mk(starPts(cx + fx * s, cy + fy * s, fr * s), true), i % 2 ? th.c2 : th.c3, lit(0.7 + i * 0.08, 1.0 + i * 0.08, 30 + i) * tw, { w: 5 });
    });
  }
  function seal(ctx, S, th, cx, cy, s, local, t, L) {
    const u = S.u, r = s * 0.34;
    backer(ctx, S, th, cx - s * 0.5, cy - s * 0.5, s, s, { cablesAt: [0.7] });
    const lit = (q0, q1, seed) => L * strike(seg(local, q0, q1), seed, t) * hum(t, seed);
    const C = mk(arcPts(cx, cy, r, r, -Math.PI / 2, Math.PI * 1.5, 60), false);
    tube(ctx, S, th, C, th.acc, lit(0.1, 0.4, 41), { w: 10, to: eo(seg(local, 0.1, 0.7)), block: [[0.97, 1]] });
    clips(ctx, S, th, C, 4);
    const K = mk([[cx - r * 0.5, cy + r * 0.02], [cx - r * 0.12, cy + r * 0.42], [cx + r * 0.55, cy - r * 0.42]]);
    tube(ctx, S, th, K, th.c4, lit(0.55, 0.85, 42), { w: 12, to: eo(seg(local, 0.55, 1.0)), ends: true });
    // A ring of short tubes chasing round it.
    const n = 18, head = (t * 6) % n;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = a0 + TAU / n * 0.55, rr = r * 1.32;
      const d = (head - i + n) % n, k = d < 4 ? 1 - d / 4 : 0.18;
      tube(ctx, S, th, mk(arcPts(cx, cy, rr, rr, a0, a1, 6)), i % 2 ? th.c2 : th.c1, lit(0.8, 1.1, 50 + i) * k, { w: 6 });
    }
    const pr = ((t * 0.7) % 1);
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r * (1.5 + pr * 0.35), 0, TAU); ctx.lineWidth = 3 * u; ctx.strokeStyle = rgba(th.acc, 0.35 * (1 - pr) * L * seg(local, 1, 1.4)); ctx.stroke(); ctx.restore();
  }
  function moon(ctx, S, th, cx, cy, s, local, t, L) {
    const lit = (q0, q1, seed) => L * strike(seg(local, q0, q1), seed, t) * hum(t, seed);
    backer(ctx, S, th, cx - s * 0.5, cy - s * 0.42, s, s * 0.84, { cablesAt: [0.25] });
    const r = s * 0.24;
    const M = mk([...arcPts(cx - s * 0.08, cy, r, r, -Math.PI * 0.62, Math.PI * 0.62, 30), ...arcPts(cx - s * 0.08 + r * 0.45, cy, r * 0.82, r * 0.82, Math.PI * 0.55, -Math.PI * 0.55, 30).slice(1)], true);
    tube(ctx, S, th, M, th.c2, lit(0.2, 0.6, 61), { w: 8 });
    [[0.22, -0.18, 0.07], [0.3, 0.14, 0.045], [0.08, 0.26, 0.04]].forEach(([fx, fy, fr], i) => {
      tube(ctx, S, th, mk(starPts(cx + fx * s, cy + fy * s, fr * s), true), i ? th.c1 : th.acc, lit(0.4 + i * 0.1, 0.8 + i * 0.1, 62 + i) * (0.5 + 0.5 * Math.sin(t * (1.8 + i) + i)), { w: 5 });
    });
  }
  // A strip of film bent from tube: sprocket holes chase along it, frames strike on one by one.
  function filmStrip(ctx, S, th, x, y, w, h, local, t, L, closing) {
    const u = S.u;
    backer(ctx, S, th, x - 16 * u, y - 16 * u, w + 32 * u, h + 32 * u, { cables: false });
    const lit = (q0, q1, seed) => L * strike(seg(local, q0, q1), seed, t) * hum(t, seed);
    const O = mk(rrPts(x, y, w, h, 16 * u), true);
    tube(ctx, S, th, O, th.c3, lit(0.2, 0.55, 90), { w: 6 });
    clips(ctx, S, th, O, 6);
    const hs = Math.max(14 * u, h * 0.09), step = hs * 2.2, n = Math.floor((w - 30 * u) / step), x0 = x + (w - n * step) / 2 + step / 2 - hs / 2;
    const head = Math.floor(t * 9);
    for (let i = 0; i < n; i++) for (const yy of [y + h * 0.1, y + h * 0.9 - hs]) {
      const k = ((((i - head) % 7) + 7) % 7) < 2 ? 1 : 0.22;
      tube(ctx, S, th, mk(rrPts(x0 + i * step, yy, hs, hs, hs * 0.3), true), th.c2, lit(0.3, 0.6, 91) * k, { w: 3.5 });
    }
    const fh = h * 0.56, fw = fh * 1.3, gap = 24 * u, nf = Math.max(1, Math.floor((w - 40 * u + gap) / (fw + gap)));
    const fx0 = x + (w - (nf * fw + (nf - 1) * gap)) / 2, fy0 = y + (h - fh) / 2;
    const sel = Math.floor(t / 0.9) % nf;
    const icons = closing ? ["check", "heart", "check", "play"] : ["play", "heart", "trend", "bolt"];
    for (let i = 0; i < nf; i++) {
      const fx = fx0 + i * (fw + gap), on = i === sel;
      const fl = lit(0.35 + i * 0.12, 0.6 + i * 0.12, 92 + i);
      tube(ctx, S, th, mk(rrPts(fx, fy0, fw, fh, 10 * u), true), on ? th.acc : th.c1, fl * (on ? 1 : 0.7), { w: 5, glow: on ? 1.5 : 1 });
      icon(ctx, S, th, icons[i % icons.length], fx + fw / 2, fy0 + fh / 2, fh * 0.6, on ? WHITE : th.c4, fl * (on ? 1 : 0.6), 5);
    }
  }
  function statementArt(ctx, S, th, id, local, hold, off, L, t) {
    const M = measure(S, id);
    if (!M) return;
    const u = S.u;
    ctx.save();
    ctx.translate(off, 0);
    const reg = emblemRegion(S, M);
    if (reg) {
      const sz = Math.min(reg.s, (S.tall ? 640 : 560) * u);
      const cx = reg.at === "side" || S.tall ? reg.x + reg.w / 2 : reg.x + reg.w - sz * 0.6, cy = reg.y + reg.h / 2;
      if (id === "title") clapper(ctx, S, th, cx, cy, sz * 0.9, local, t, L);
      else seal(ctx, S, th, cx, cy, sz * 0.86, local, t, L);
      // Wide free space left of the emblem takes a film strip.
      const sx = reg.x + 10 * u, sw = cx - sz * 0.5 - 50 * u - sx, sh = Math.min(sz * 0.5, 230 * u);
      if (!S.tall && sw > sh * 2.1) filmStrip(ctx, S, th, sx, cy - sh / 2, sw, sh, local, t, L, id === "closing");
    }
    // The words' own sign: a tube frame with corner stars round the block.
    if (!reg || reg.frame) {
      const fr = frameRect(S, M);
      const F = mk(rrPts(fr.x, fr.y, fr.w, fr.h, 30 * u), true);
      const fl = L * strike(seg(local, 0.1, 0.5), id === "title" ? 81 : 82, t) * hum(t, 83);
      tube(ctx, S, th, F, id === "title" ? th.c3 : th.c1, fl * 0.75, { w: 6, to: eo(seg(local, 0.05, 0.8)), block: [[0.995, 1]] });
      clips(ctx, S, th, F, 8);
      if (fl > 0.9) pulse(ctx, S, th, F, (t * 0.12) % 1, 0.05, id === "title" ? th.c3 : th.c1, 0.9, 6);
      [[fr.x, fr.y], [fr.x + fr.w, fr.y + fr.h]].forEach(([x, y], i) => tube(ctx, S, th, mk(starPts(x, y, 26 * u), true), th.c2, fl * (0.6 + 0.4 * Math.sin(t * 3 + i * 2)), { w: 5 }));
    }
    if (S.tall) {
      const top = conduitY(S) + 90 * u, bh = M.top - 80 * u - top;
      if (bh > 260 * u && (!reg || reg.at !== "above")) { const s = Math.min(bh, 420 * u); moon(ctx, S, th, S.W - S.W * 0.1 - s / 2, top + bh / 2, s, local, t, L); }
    }
    underline(ctx, S, th, M, id === "title" ? th.c1 : th.c2, L * strike(seg(local, 0.25, 0.7), id === "title" ? 71 : 72, t) * hum(t, 73), t);
    ctx.restore();
  }

  // ---- scenes -------------------------------------------------------------------------------------
  function area(S, box) {
    const u = S.u, y = box.y - (S.tall ? 40 : 30) * u;
    return { x: box.x - (S.tall ? 10 : 20) * u, y, w: box.w + (S.tall ? 20 : 40) * u, h: floorY(S) - 34 * u - y };
  }

  function chartScene(ctx, S, th, A, b, d, t, local, o) {
    const u = S.u, tall = S.tall, L = o.L;
    const vals = d.values.map((v) => Math.max(0, Number(v) || 0)), n = vals.length, max = Math.max(...vals, 1);
    const hi = clamp(Number(d.highlight) || 0, 0, n - 1);
    backer(ctx, S, th, A.x, A.y, A.w, A.h, { cablesAt: [0.12, 0.9] });
    const numS = (tall ? 96 : 104) * u, labS = (tall ? 42 : 46) * u, padX = (tall ? 70 : 110) * u;
    const top = A.y + 34 * u + numS * 1.1 + 24 * u, base = A.y + A.h - labS - 76 * u;
    const slot = (A.w - padX - 50 * u) / n, cw = Math.min(slot * 0.36, (tall ? 72 : 96) * u);
    const x0 = A.x + padX;
    // The scale on the left and the rail underneath.
    const sx = A.x + padX * 0.5;
    const Sc = mk([[sx, base + 16 * u], [sx, top]]);
    tube(ctx, S, th, Sc, th.c3, L * o.shell * 0.8 * hum(t, 2), { w: 6, ends: true });
    for (let k = 1; k <= 4; k++) tube(ctx, S, th, mk([[sx, base - ((base - top) * k) / 4], [sx + 22 * u, base - ((base - top) * k) / 4]]), th.c3, L * o.shell * 0.7, { w: 5, block: [[0, 0.35]] });
    const BL = mk([[sx, base + 16 * u], [A.x + A.w - 36 * u, base + 16 * u]]);
    tube(ctx, S, th, BL, th.c2, L * o.shell * hum(t, 3), { w: 7, ends: true });
    clips(ctx, S, th, BL, 5);
    pulse(ctx, S, th, BL, (t * 0.32) % 1.2, 0.07, th.c2, L * o.shell, 7);
    vals.forEach((v, i) => {
      const cx = x0 + slot * (i + 0.5), hot = i === hi;
      const q = eo(seg(b, 0.02 + i * 0.12, 0.4 + i * 0.12));
      const lq = strike(seg(b, 0.02 + i * 0.12, 0.08 + i * 0.12), 80 + i, t);
      const capCol = hot ? th.acc : th.c3;
      const Cap = mk(rrPts(cx - cw / 2, top, cw, base - top, cw / 2), true);
      tube(ctx, S, th, Cap, capCol, L * o.shell * (hot ? 0.9 : 0.55) * hum(t, 90 + i, i === (hi + 2) % n), { w: 5 });
      tube(ctx, S, th, mk([[cx, base], [cx, base + 16 * u]]), capCol, 0, { w: 5, block: [[0, 1]] });
      const F = mk([[cx, base - 18 * u], [cx, top + 18 * u]]);
      const frac = (v / max) * q, fw = Math.max(9, (cw / u) * 0.28);
      tube(ctx, S, th, F, hot ? th.acc : th.c1, L * lq * hum(t, 100 + i), { w: fw, to: frac, ends: true });
      // Light bubbling up the gas column.
      if (frac > 0.02) for (let k = 0; k < 3; k++) {
        const f = ((t * 0.42 + k / 3 + i * 0.23) % 1) * frac;
        const p = ptAt(F, f);
        spark(ctx, S, th, p[0], p[1], fw * u * 0.4, hot ? th.acc : th.c1, L * lq * 0.8 * (1 - f / frac * 0.6));
      }
      const ny = A.y + 34 * u + numS * 0.55;
      ntext(ctx, S, th, fmt(v * q, v, d.suffix), cx, ny, hot ? numS * 1.1 : numS, hot ? th.acc : th.c1, L * strike(seg(b, 0.04 + i * 0.12, 0.12 + i * 0.12), 110 + i, t) * hum(t, 120 + i), { align: "center", max: slot * 0.92, fam: "fig", weight: 500, min: 60 * u });
      ntext(ctx, S, th, d.labels[i] || "", cx, base + 16 * u + 34 * u + labS * 0.55, labS, hot ? th.acc : th.c2, L * o.shell * hum(t, 130 + i), { align: "center", max: slot * 0.94 });
      // Chevrons pointing at the leading bar, chasing toward it.
      if (hot && q > 0.2) {
        const yy = base - 18 * u - (base - top - 36 * u) * frac;
        const left = i === n - 1;
        for (let k = 0; k < 3; k++) {
          const xx = left ? cx - cw / 2 - 30 * u - k * 30 * u : cx + cw / 2 + 30 * u + k * 30 * u, dir = left ? -1 : 1;
          const on = (Math.floor(t * 5) % 3) === 2 - k ? 1 : 0.28;
          tube(ctx, S, th, mk([[xx + dir * 18 * u, yy - 20 * u], [xx, yy], [xx + dir * 18 * u, yy + 20 * u]]), th.c2, L * on * seg(q, 0.2, 0.5), { w: 6 });
        }
        spark(ctx, S, th, cx + cw * 0.9, ny - numS * 0.55, 10 * u, th.acc, L * (0.5 + 0.5 * Math.sin(t * 5)) * seg(q, 0.6, 1));
      }
    });
  }

  function objectScene(ctx, S, th, A, b, d, t, local, o) {
    const u = S.u, tall = S.tall, L = o.L, phone = d.kind === "phone";
    backer(ctx, S, th, A.x, A.y, A.w, A.h, { cablesAt: [0.1, 0.88] });
    const Dv = tall ? { x: A.x + 40 * u, y: A.y + 40 * u, w: A.w - 80 * u, h: A.h * 0.58 } : { x: A.x + 50 * u, y: A.y + 40 * u, w: A.w * 0.56, h: A.h - 80 * u };
    let sw, sh;
    if (phone) { sh = Dv.h * 0.96; sw = Math.min(sh * 0.5, Dv.w * 0.62); } else { sw = Math.min(Dv.w * 0.95, (Dv.h * 0.9) / 0.66); sh = sw * 0.6; }
    const dx = Dv.x + (Dv.w - sw) / 2, dy = Dv.y + (Dv.h - sh - (phone ? 0 : sw * 0.06)) / 2;
    const shell = L * o.shell;
    const Body = mk(rrPts(dx, dy, sw, sh, (phone ? 46 : 20) * u), true);
    tube(ctx, S, th, Body, th.c1, shell * hum(t, 201), { w: 9 });
    clips(ctx, S, th, Body, 6);
    if (!phone) {
      const Bs = mk([[dx - sw * 0.05, dy + sh + sw * 0.055], [dx + sw * 1.05, dy + sh + sw * 0.055], [dx + sw * 0.985, dy + sh + sw * 0.014], [dx + sw * 0.015, dy + sh + sw * 0.014]], true);
      tube(ctx, S, th, Bs, th.c1, shell * hum(t, 202), { w: 7 });
      tube(ctx, S, th, mk([[dx + sw * 0.43, dy + sh + sw * 0.034], [dx + sw * 0.57, dy + sh + sw * 0.034]]), th.c3, shell, { w: 5, ends: true });
    } else {
      tube(ctx, S, th, mk([[dx + sw * 0.4, dy + 26 * u], [dx + sw * 0.6, dy + 26 * u]]), th.c3, shell, { w: 5, ends: true });
      tube(ctx, S, th, mk([[dx + sw * 0.36, dy + sh - 24 * u], [dx + sw * 0.64, dy + sh - 24 * u]]), th.c3, shell, { w: 5, ends: true });
    }
    const pad = (phone ? 30 : 30) * u, ix = dx + pad, iy = dy + pad * (phone ? 1.9 : 1), iw = sw - pad * 2, ih = sh - pad * (phone ? 3.6 : 2);
    const pv = { x: ix, y: iy, w: iw, h: ih * 0.48 };
    const lit = (a0, a1, seed) => L * strike(seg(b, a0, a1), seed, t) * hum(t, seed);
    tube(ctx, S, th, mk(rrPts(pv.x, pv.y, pv.w, pv.h, 12 * u), true), th.c2, lit(0, 0.08, 210), { w: 6 });
    // A tiny scene in the preview: hills and a sun, the play mark pulsing over it.
    const hills = [];
    for (let i = 0; i <= 24; i++) { const f = i / 24; hills.push([pv.x + 14 * u + (pv.w - 28 * u) * f, pv.y + pv.h * (0.84 - 0.18 * Math.abs(Math.sin(f * 5.2 + 0.6)) - 0.06 * Math.sin(f * 13))]); }
    tube(ctx, S, th, mk(hills), th.c4, lit(0.05, 0.13, 211), { w: 5 });
    tube(ctx, S, th, mk(arcPts(pv.x + pv.w * 0.8, pv.y + pv.h * 0.3, pv.h * 0.1, pv.h * 0.1, 0, TAU, 24), true), th.c2, lit(0.06, 0.14, 212), { w: 5 });
    const pr = Math.min(pv.h, pv.w) * 0.2, pcx = pv.x + pv.w * 0.45, pcy = pv.y + pv.h * 0.45;
    tube(ctx, S, th, mk([[pcx - pr * 0.6, pcy - pr], [pcx + pr, pcy], [pcx - pr * 0.6, pcy + pr]], true), th.acc, lit(0.08, 0.16, 213) * (0.75 + 0.25 * Math.sin(t * 3.6)), { w: 8 });
    // Tracks: clips, the proposed clip in the accent, the original track as a waveform; a playhead runs.
    const ty0 = pv.y + pv.h + ih * 0.07, rowH = (iy + ih - ty0) / 3, chH = Math.min(rowH * 0.56, 40 * u);
    const phx = ix + ((t * 0.2) % 1) * iw;
    const rows = [[[0, 0.28, th.c1], [0.32, 0.62, th.acc], [0.66, 1, th.c1]], [[0, 0.44, th.c3], [0.5, 0.84, th.c3]]];
    let proposed = null;
    rows.forEach((clipsRow, r) => clipsRow.forEach(([f0, f1, col], k) => {
      const x = ix + iw * f0, w = iw * (f1 - f0) - 10 * u, y = ty0 + rowH * r + (rowH - chH) / 2;
      const under = phx >= x && phx <= x + w;
      tube(ctx, S, th, mk(rrPts(x, y, w, chH, chH / 2), true), col, lit(0.14 + (r * 3 + k) * 0.04, 0.2 + (r * 3 + k) * 0.04, 220 + r * 3 + k) * (under ? 1 : 0.78), { w: 5, glow: under ? 1.5 : 1 });
      if (col === th.acc && r === 0) proposed = [x + w / 2, y + chH / 2];
    }));
    const wy = ty0 + rowH * 2.5, wave = [];
    for (let i = 0; i <= 90; i++) { const f = i / 90; wave.push([ix + iw * f, wy + Math.sin(i * 1.7 + t * 4) * chH * 0.45 * (0.25 + 0.75 * Math.abs(Math.sin(i * 0.21)))]); }
    tube(ctx, S, th, mk(wave), th.c4, lit(0.3, 0.38, 230), { w: 4 });
    const PH = mk([[phx, ty0 - 12 * u], [phx, iy + ih]]);
    tube(ctx, S, th, PH, WHITE, L * seg(b, 0.2, 0.3) * hum(t, 231), { w: 4, glass: false });
    tube(ctx, S, th, mk([[phx - 10 * u, ty0 - 24 * u], [phx + 10 * u, ty0 - 24 * u], [phx, ty0 - 10 * u]], true), th.acc, L * seg(b, 0.2, 0.3), { w: 4, glass: false });
    // Callouts.
    const anchors = [[pv.x + pv.w * 0.8, pv.y + pv.h * 0.3], proposed || [ix + iw * 0.47, ty0 + rowH / 2], [ix + iw * 0.25, wy]];
    const cols = [th.c2, th.acc, th.c4];
    const labS = (tall ? 44 : 46) * u;
    d.callouts.forEach((label, i) => {
      if (!label) return;
      const [ax, ay] = anchors[i];
      const qa = eo(seg(b, 0.36 + i * 0.12, 0.52 + i * 0.12));
      const ll = lit(0.46 + i * 0.12, 0.56 + i * 0.12, 240 + i);
      let T, lx, ly;
      if (!tall) {
        lx = A.x + A.w * 0.66; ly = A.y + A.h * (0.2 + i * 0.3);
        const ex = lx - 60 * u;
        T = mk([[ax, ay], [ax + (ex - ax) * 0.55, ay], [ex, ly], [lx - 22 * u, ly]]);
        ntext(ctx, S, th, label, lx, ly, labS, cols[i], ll, { max: A.x + A.w - 40 * u - lx });
      } else {
        lx = A.x + 150 * u; ly = Dv.y + Dv.h + 90 * u + i * ((A.y + A.h - (Dv.y + Dv.h + 90 * u) - 40 * u) / 3);
        const nx = A.x + 80 * u;
        T = mk([[ax, ay], [ax, Dv.y + Dv.h + 30 * u + i * 14 * u], [nx - 30 * u - i * 16 * u, Dv.y + Dv.h + 30 * u + i * 14 * u], [nx - 30 * u - i * 16 * u, ly], [nx - 30 * u, ly]]);
        tube(ctx, S, th, mk(arcPts(nx, ly, 26 * u, 26 * u, 0, TAU, 28), true), cols[i], ll, { w: 5 });
        ntext(ctx, S, th, String(i + 1), nx, ly + 2 * u, 42 * u, cols[i], ll, { align: "center", weight: 600 });
        ntext(ctx, S, th, label, lx, ly, labS, cols[i], ll, { max: A.x + A.w - 40 * u - lx });
      }
      spark(ctx, S, th, ax, ay, 8 * u, cols[i], L * seg(qa, 0, 0.2));
      tube(ctx, S, th, T, cols[i], L * seg(qa, 0, 0.1) * hum(t, 250 + i), { w: 5, to: qa });
      if (qa >= 1) pulse(ctx, S, th, T, ((t * 0.55 + i * 0.3) % 1.25), 0.1, cols[i], L, 5);
    });
  }

  // Original neon characters: a monoline bust with its own hair or kit.
  function person(ctx, S, th, cx, cy, s, k, col, lit, t, wave) {
    const u = S.u, r = s * 0.17, hx = cx, hy = cy - s * 0.22;
    const W = 6;
    tube(ctx, S, th, mk(arcPts(hx, hy, r, r, 0, TAU, 40), true), col, lit, { w: W });
    tube(ctx, S, th, mk(arcPts(cx, cy + s * 0.46, s * 0.4, s * 0.34, Math.PI, TAU, 40)), col, lit, { w: W, ends: true });
    // Neck jumper, painted out.
    tube(ctx, S, th, mk([[hx, hy + r], [hx, cy + s * 0.12]]), col, 0, { w: W, block: [[0, 1]] });
    const blink = ((t + k * 0.9) % 3.4) < 0.14;
    const ey = hy - r * 0.08;
    for (const ex of [hx - r * 0.38, hx + r * 0.38]) tube(ctx, S, th, blink ? mk([[ex - r * 0.12, ey], [ex + r * 0.12, ey]]) : mk([[ex, ey - r * 0.1], [ex, ey + r * 0.1]]), WHITE, lit, { w: 4, glass: false });
    tube(ctx, S, th, mk(arcPts(hx, hy + r * 0.2, r * 0.4, r * 0.32, 0.25 * Math.PI, 0.75 * Math.PI, 12)), col, lit, { w: 4 });
    const f = k % 6, c2 = mix(col, WHITE, 0.25);
    if (f === 0) { tube(ctx, S, th, mk(arcPts(hx, hy, r * 1.28, r * 1.28, Math.PI * 1.02, Math.PI * 1.98, 30)), c2, lit, { w: 5 }); for (const sx of [-1, 1]) tube(ctx, S, th, mk(rrPts(hx + sx * r * 1.28 - r * 0.18, hy - r * 0.25, r * 0.36, r * 0.6, r * 0.16), true), c2, lit, { w: 5 }); }
    else if (f === 1) { tube(ctx, S, th, mk(arcPts(hx, hy - r * 0.15, r * 1.08, r * 1.0, Math.PI, TAU, 24)), c2, lit, { w: 5 }); tube(ctx, S, th, mk([[hx - r * 1.12, hy - r * 0.12], [hx + r * 1.12, hy - r * 0.12]]), c2, lit, { w: 5, ends: true }); tube(ctx, S, th, mk(arcPts(hx, hy - r * 1.32, r * 0.2, r * 0.2, 0, TAU, 16), true), c2, lit, { w: 5 }); }
    else if (f === 2) tube(ctx, S, th, mk([...arcPts(hx, hy, r * 1.12, r * 1.12, Math.PI * 1.1, Math.PI * 1.95, 20), ...bezPts([hx + r * 1.08, hy - r * 0.35], [hx + r * 1.9, hy - r * 0.2], [hx + r * 1.7, hy + r * 1.1], [hx + r * 1.25, hy + r * 1.3], 16).slice(1)]), c2, lit, { w: 5 });
    else if (f === 3) { for (const sx of [-1, 1]) tube(ctx, S, th, mk(arcPts(hx + sx * r * 0.4, ey, r * 0.27, r * 0.27, 0, TAU, 18), true), c2, lit, { w: 4 }); tube(ctx, S, th, mk(arcPts(hx, hy - r * 0.2, r * 1.06, r * 0.9, Math.PI * 1.08, Math.PI * 1.92, 20)), c2, lit, { w: 5 }); tube(ctx, S, th, mk([[hx - r * 0.2, hy - r * 0.95], [hx + r * 1.5, hy - r * 0.8]]), c2, lit, { w: 5, ends: true }); }
    else if (f === 4) { const p = []; for (let i = 0; i <= 60; i++) { const a = Math.PI * 1.05 + (i / 60) * Math.PI * 0.9; const rr = r * (1.12 + 0.12 * Math.abs(Math.sin(i * 0.52))); p.push([hx + Math.cos(a) * rr, hy + Math.sin(a) * rr]); } tube(ctx, S, th, mk(p), c2, lit, { w: 5 }); }
    else { tube(ctx, S, th, mk(arcPts(hx, hy - r * 1.32, r * 0.34, r * 0.3, 0, TAU, 20), true), c2, lit, { w: 5 }); tube(ctx, S, th, mk(arcPts(hx, hy, r * 1.1, r * 1.1, Math.PI * 1.12, Math.PI * 1.88, 18)), c2, lit, { w: 5 }); }
    if (wave) {
      const sh = [cx + s * 0.3, cy + s * 0.22], ang = -1.9 + Math.sin(t * 6) * 0.35;
      const el = [sh[0] + Math.cos(-1.1) * s * 0.22, sh[1] + Math.sin(-1.1) * s * 0.22];
      const hd = [el[0] + Math.cos(ang + 0.6) * s * 0.2, el[1] + Math.sin(ang + 0.6) * s * 0.2];
      tube(ctx, S, th, mk([sh, el, hd]), col, lit, { w: W, ends: true });
      tube(ctx, S, th, mk(arcPts(hd[0], hd[1], s * 0.045, s * 0.045, 0, TAU, 14), true), col, lit, { w: 5 });
    }
  }
  function peopleScene(ctx, S, th, A, b, d, t, local, o) {
    const u = S.u, tall = S.tall, L = o.L;
    const n = Math.max(2, Math.min(6, Math.round(Number(d.count) || 4)));
    const hi = Math.min(n - 1, d.highlight ?? 1);
    backer(ctx, S, th, A.x, A.y, A.w, A.h, { cablesAt: [0.08, 0.92] });
    const cols = tall ? Math.min(n, n === 4 ? 2 : 3) : n, rowsN = Math.ceil(n / cols);
    const slotW = (A.w - 60 * u) / cols, rowH = A.h / rowsN;
    const s = Math.min(slotW * 0.76, rowH * 0.7);
    const palette = [th.c1, th.c2, th.c3, th.c4, th.warn];
    const labS = 42 * u;
    for (let r = 0; r < rowsN; r++) {
      const inRow = Math.min(cols, n - r * cols);
      const by = A.y + rowH * (r + 1) - 40 * u;
      const Rail = mk([[A.x + 50 * u, by], [A.x + A.w - 50 * u, by]]);
      tube(ctx, S, th, Rail, th.c3, L * o.shell * 0.8 * hum(t, 300 + r), { w: 6, ends: true });
      pulse(ctx, S, th, Rail, ((t * 0.3 + r * 0.5) % 1.2), 0.06, th.c3, L * o.shell, 6);
      for (let j = 0; j < inRow; j++) {
        const i = r * cols + j;
        const cx = A.x + 30 * u + (A.w - 60 * u) * ((j + 0.5 + (cols - inRow) / 2) / cols);
        const cy = by - s * 0.82 - 10 * u;
        const hot = i === hi, col = hot ? th.acc : palette[i % palette.length];
        const q0 = 0.02 + i * (0.36 / n);
        const lit = L * strike(seg(b, q0, q0 + 0.1), 310 + i, t) * hum(t, 320 + i, i === (hi + 2) % n);
        const bob = Math.sin(t * 2 + i * 1.3) * 4 * u;
        person(ctx, S, th, cx, cy + bob, s, i, col, lit, t, hot);
        // Badge above the head: neon words in a tube capsule.
        // Extra people past the named badges get a small lit icon disc instead of a repeated name.
        const label = i < d.badges.length ? d.badges[i] : "";
        if (!label) {
          const bq = strike(seg(b, q0 + 0.12, q0 + 0.22), 330 + i, t);
          const r = labS * 0.95, byy = cy + bob - s * 0.22 - s * 0.17 - 30 * u - r;
          tube(ctx, S, th, mk(arcPts(cx, byy, r, r, 0, TAU, 40), true), col, L * bq * hum(t, 340 + i) * 0.8, { w: 5 });
          icon(ctx, S, th, ["eye", "bolt", "play", "heart"][i % 4], cx, byy, r * 1.2, col, L * bq * hum(t, 350 + i), 5);
        }
        if (label) {
          const bq = strike(seg(b, q0 + 0.12, q0 + 0.22), 330 + i, t);
          const bw = Math.min(slotW * 0.96, textW(S, label, labS, 500) + 56 * u), bh = labS * 1.6;
          const byy = cy + bob - s * 0.22 - s * 0.17 - (hot ? 40 : 30) * u - bh / 2 - (hot ? 26 * u : 0);
          const Cap = mk(hot ? [...rrPts(cx - bw / 2, byy - bh / 2, bw, bh, bh / 2).slice(0, 18), [cx + 18 * u, byy + bh / 2], [cx, byy + bh / 2 + 22 * u], [cx - 10 * u, byy + bh / 2], ...rrPts(cx - bw / 2, byy - bh / 2, bw, bh, bh / 2).slice(18)] : rrPts(cx - bw / 2, byy - bh / 2, bw, bh, bh / 2), true);
          tube(ctx, S, th, Cap, hot ? th.acc : col, L * bq * hum(t, 340 + i) * 0.8, { w: 5 });
          ntext(ctx, S, th, label, cx, byy + 2 * u, labS, hot ? th.acc : col, L * bq * hum(t, 350 + i), { align: "center", max: bw - 40 * u, lw: 0.045, glow: 0.6 });
        }
        // Hearts drift up from the lead and checks from the others now and then.
        const per = 2.6, ph = ((t + i * 0.83) % per) / per;
        if (b > 0.5 && ph < 0.6 && (hot || i % 2 === 0)) {
          const q = ph / 0.6, ix = cx + (hot ? -s * 0.42 : s * 0.38), iy = cy - s * 0.3 - q * 70 * u;
          icon(ctx, S, th, hot ? "heart" : "check", ix, iy, 46 * u, hot ? th.acc : th.c4, L * Math.sin(q * Math.PI), 5);
        }
      }
    }
  }

  function processScene(ctx, S, th, A, b, d, t, local, o) {
    const u = S.u, tall = S.tall, L = o.L, n = d.steps.length;
    backer(ctx, S, th, A.x, A.y, A.w, A.h, { cablesAt: [0.15, 0.85] });
    const icons = ["eye", "pencil", "check"], cols = [th.c1, th.c2, th.c4];
    const done = b > 0.86;
    const active = done ? Math.floor(t / 1.15) % n : -1;
    const fs = tall ? Math.min((A.h / n) * 0.62, A.w * 0.34) : Math.min((A.w / n) * 0.5, A.h * 0.5);
    const labS = 46 * u;
    const pos = (i) => tall ? { x: A.x + 60 * u + fs / 2, y: A.y + (A.h / n) * (i + 0.5) } : { x: A.x + (A.w / n) * (i + 0.5), y: A.y + A.h * 0.4 };
    for (let i = 0; i < n; i++) {
      const p = pos(i), q0 = 0.02 + i * 0.26;
      const lit = L * strike(seg(b, q0, q0 + 0.1), 400 + i, t) * hum(t, 410 + i);
      const on = i === active ? 1 : 0;
      const col = cols[i % 3];
      const Fr = mk(rrPts(p.x - fs / 2, p.y - fs / 2, fs, fs, fs * 0.2), true);
      tube(ctx, S, th, Fr, col, L * o.shell * (0.55 + 0.45 * seg(b, q0, q0 + 0.1)) * hum(t, 420 + i), { w: 8, glow: 1 + on * 0.8 });
      clips(ctx, S, th, Fr, 4);
      // The icon acts: the eye blinks, the pencil writes a line, the check redraws.
      const ic = p.y - (i === 1 ? fs * 0.06 : 0);
      if (i === 0) {
        const bl = ((t * 0.8) % 2.5) < 0.12;
        if (bl) tube(ctx, S, th, mk([[p.x - fs * 0.3, p.y], [p.x + fs * 0.3, p.y]]), col, lit, { w: 7 }); else icon(ctx, S, th, "eye", p.x, p.y, fs * 0.6, col, lit, 7);
      } else if (i === 1) {
        const wq = (t * 0.6) % 1, wx0 = p.x - fs * 0.3, wl = [];
        for (let k = 0; k <= 30; k++) { const f = k / 30; wl.push([wx0 + fs * 0.6 * f, p.y + fs * 0.28 + Math.sin(f * 14) * fs * 0.035]); }
        const WL = mk(wl);
        tube(ctx, S, th, WL, th.c3, lit, { w: 5, to: wq, glass: false });
        const tip = ptAt(WL, wq);
        icon(ctx, S, th, "pencil", tip[0] + fs * 0.17, tip[1] - fs * 0.2, fs * 0.5, col, lit, 7);
      } else {
        const K = iconTubes("check", p.x, p.y, fs * 0.62)[0];
        tube(ctx, S, th, K, col, lit, { w: 10, to: on ? eo(((t / 1.15) % 1) * 2.2) : 1, ends: true });
      }
      // Step number in its own ring at the frame's corner.
      const nx = p.x - fs / 2, ny = p.y - fs / 2, nr = 34 * u;
      tube(ctx, S, th, mk(arcPts(nx, ny, nr, nr, 0, TAU, 30), true), th.acc, lit, { w: 5 });
      ntext(ctx, S, th, String(i + 1), nx, ny + 2 * u, 42 * u, th.acc, lit, { align: "center", weight: 600, fam: "fig" });
      if (tall) ntext(ctx, S, th, d.steps[i], p.x + fs / 2 + 44 * u, p.y, labS, col, lit * (on ? 1 : 0.85), { max: A.x + A.w - 40 * u - (p.x + fs / 2 + 44 * u) });
      else ntext(ctx, S, th, d.steps[i], p.x, p.y + fs / 2 + 34 * u + labS * 0.6, labS, col, lit * (on ? 1 : 0.85), { align: "center", max: A.w / n - 30 * u });
      if (i < n - 1) {
        const p2 = pos(i + 1), qa = eo(seg(b, q0 + 0.12, q0 + 0.26));
        const T = tall ? mk([[p.x, p.y + fs / 2 + 18 * u], [p2.x, p2.y - fs / 2 - 24 * u]]) : mk([[p.x + fs / 2 + 22 * u, p.y], [p2.x - fs / 2 - 28 * u, p2.y]]);
        tube(ctx, S, th, T, th.acc, L * seg(qa, 0, 0.1) * hum(t, 430 + i), { w: 7, to: qa, ends: true });
        const e = T.pts[1], dir = tall ? [0, 1] : [1, 0], nrm = [-dir[1], dir[0]], hs = 22 * u;
        tube(ctx, S, th, mk([[e[0] - dir[0] * hs + nrm[0] * hs, e[1] - dir[1] * hs + nrm[1] * hs], [e[0] + dir[0] * 6 * u, e[1] + dir[1] * 6 * u], [e[0] - dir[0] * hs - nrm[0] * hs, e[1] - dir[1] * hs - nrm[1] * hs]]), th.acc, L * seg(qa, 0.9, 1), { w: 7 });
        if (qa >= 1) for (let k = 0; k < 2; k++) pulse(ctx, S, th, T, ((t * 0.9 + k * 0.5) % 1.3), 0.18, th.acc, L, 7);
      }
    }
  }

  function compareScene(ctx, S, th, A, b, d, t, local, o) {
    const u = S.u, tall = S.tall, L = o.L;
    const mid = tall ? 150 * u : 190 * u;
    const P1 = tall ? { x: A.x, y: A.y, w: A.w, h: (A.h - mid) / 2 } : { x: A.x, y: A.y, w: (A.w - mid) / 2, h: A.h };
    const P2 = tall ? { x: A.x, y: A.y + P1.h + mid, w: A.w, h: P1.h } : { x: A.x + P1.w + mid, y: A.y, w: P1.w, h: A.h };
    const lv = Math.max(0, Number(d.leftValue) || 0), rv = Math.max(0, Number(d.rightValue) || 0), mx = Math.max(lv, rv, 1);
    const sides = [{ P: P1, label: d.left, v: lv, col: th.warn, ic: "loop", bad: true, q0: 0.02 }, { P: P2, label: d.right, v: rv, col: th.acc, ic: "dial", bad: false, q0: 0.22 }];
    sides.forEach((sd, si) => {
      const { P } = sd, pd = 44 * u;
      backer(ctx, S, th, P.x, P.y, P.w, P.h, { cablesAt: [si ? 0.85 : 0.15] });
      const lit = L * strike(seg(b, sd.q0, sd.q0 + 0.1), 500 + si, t) * hum(t, 510 + si, sd.bad);
      const labS = 46 * u;
      const Fr = mk(rrPts(P.x + 18 * u, P.y + 18 * u, P.w - 36 * u, P.h - 36 * u, 22 * u), true);
      tube(ctx, S, th, Fr, sd.col, L * o.shell * 0.6 * hum(t, 520 + si, sd.bad), { w: 5, block: [[0.47, 0.5]] });
      ntext(ctx, S, th, sd.label, P.x + pd, P.y + pd + labS * 0.6, labS, sd.bad ? th.c2 : th.c1, lit, { max: P.w - pd * 2 - (si ? 200 * u : 0) });
      const q = eo(seg(b, sd.q0 + 0.06, sd.q0 + 0.45));
      const big = Math.min(tall ? 140 * u : 150 * u, P.h * 0.3);
      const ny = P.y + pd + labS * 1.3 + big * 0.62;
      ntext(ctx, S, th, fmt(sd.v * q, sd.v, d.suffix), P.x + pd - 4 * u, ny, big, sd.col, lit, { fam: "fig", weight: 500, max: P.w * 0.6, min: 96 * u });
      // A meter: gas filling to this side's share.
      const my = P.y + P.h - pd - 10 * u, M = mk([[P.x + pd, my], [P.x + P.w - pd, my]]);
      tube(ctx, S, th, M, sd.col, lit, { w: 9, to: (sd.v / mx) * q, ends: true });
      // One icon per unit: loops on the left (some dead), dials with turning needles on the right.
      const count = clamp(Math.round(sd.v), 0, 12);
      const gx = P.x + pd, gy = ny + big * 0.5 + 24 * u, gw = P.w - pd * 2, gh = my - 30 * u - gy;
      let ts = 74 * u, perRow = 1;
      for (; ts > 40 * u; ts *= 0.92) { perRow = Math.max(1, Math.floor((gw + 16 * u) / (ts + 16 * u))); if (Math.ceil(count / perRow) * (ts + 16 * u) <= gh + 16 * u) break; }
      for (let i = 0; i < count; i++) {
        const qi = seg(b, sd.q0 + 0.12 + i * 0.03, sd.q0 + 0.2 + i * 0.03);
        const x = gx + (i % perRow) * (ts + 16 * u) + ts / 2, y = gy + Math.floor(i / perRow) * (ts + 16 * u) + ts / 2;
        if (y + ts / 2 > my - 16 * u) break;
        const il = L * strike(qi, 530 + i + si * 20, t) * hum(t, 540 + i + si * 20, sd.bad && i % 3 === 1);
        if (sd.ic === "loop") {
          ctx.save(); ctx.translate(x, y); ctx.rotate(i % 4 === 0 ? -t * 2.2 : 0); ctx.translate(-x, -y);
          icon(ctx, S, th, "loop", x, y, ts * 0.9, sd.col, il, 5);
          ctx.restore();
        } else {
          tube(ctx, S, th, mk(arcPts(x, y, ts * 0.38, ts * 0.38, 0, TAU, 26), true), sd.col, il, { w: 5 });
          const a = -Math.PI / 2 + Math.sin(t * 1.3 + i * 1.7) * 1.1;
          tube(ctx, S, th, mk([[x, y], [x + Math.cos(a) * ts * 0.3, y + Math.sin(a) * ts * 0.3]]), WHITE, il, { w: 4, glass: false });
        }
      }
    });
    // The arrow across the gap, with the change on a tube capsule.
    const c1 = tall ? [A.x + A.w / 2, P1.y + P1.h + 18 * u] : [P1.x + P1.w + 22 * u, A.y + A.h / 2];
    const c2 = tall ? [A.x + A.w / 2, P2.y - 26 * u] : [P2.x - 30 * u, A.y + A.h / 2];
    const qa = eo(seg(b, 0.3, 0.5));
    const T = mk([c1, c2]);
    tube(ctx, S, th, T, th.c2, L * seg(qa, 0, 0.1) * hum(t, 560), { w: 8, to: qa, ends: true });
    const dir = tall ? [0, 1] : [1, 0], nrm = [-dir[1], dir[0]], hs = 24 * u;
    tube(ctx, S, th, mk([[c2[0] - dir[0] * hs + nrm[0] * hs, c2[1] - dir[1] * hs + nrm[1] * hs], [c2[0] + dir[0] * 6 * u, c2[1] + dir[1] * 6 * u], [c2[0] - dir[0] * hs - nrm[0] * hs, c2[1] - dir[1] * hs - nrm[1] * hs]]), th.c2, L * seg(qa, 0.9, 1), { w: 8 });
    if (qa >= 1) for (let k = 0; k < 3; k++) pulse(ctx, S, th, T, ((t * 1.1 + k / 3) % 1.2), 0.22, th.c2, L, 8);
    if (lv) {
      const pct = Math.round(((rv - lv) / lv) * 100), s = `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%`;
      const z = 48 * u, bw = textW(S, s, z, 600, "fig") + 56 * u, bh = z * 1.6;
      const bx = tall ? P2.x + P2.w - 44 * u - bw / 2 : P2.x + P2.w - 44 * u - bw / 2, by = P2.y + 44 * u + bh / 2 - 8 * u;
      const bq = strike(seg(b, 0.6, 0.7), 570, t);
      const sc = 1 + 0.04 * Math.sin(t * 4);
      ctx.save(); ctx.translate(bx, by); ctx.scale(sc, sc); ctx.translate(-bx, -by);
      tube(ctx, S, th, mk(rrPts(bx - bw / 2, by - bh / 2, bw, bh, bh / 2), true), th.c4, L * bq, { w: 6 });
      ntext(ctx, S, th, s, bx, by + 2 * u, z, th.c4, L * bq, { align: "center", weight: 600, fam: "fig" });
      ctx.restore();
    }
  }

  // A small round sign balancing a headline that leaves the top right of the wall bare.
  const CORNER = { chart: "trend", object: "play", people: "heart", process: "loop", compare: "bolt" };
  function cornerSign(ctx, S, th, id, t, L, shell) {
    const M = measure(S, id + "-title");
    if (!M) return;
    const u = S.u, r = 62 * u, cx = S.W - (S.tall ? 90 : 140) * u - r, cy = M.top + Math.min(M.lines.length, 2) * M.size * 0.52;
    if (M.x + M.w + 80 * u > cx - r * 1.4) return;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.5, 0, TAU);
    ctx.fillStyle = th.day ? "rgba(255,255,255,0.25)" : "rgba(220,230,255,0.035)"; ctx.fill();
    ctx.lineWidth = 2 * u; ctx.strokeStyle = th.day ? "rgba(255,255,255,0.8)" : "rgba(220,230,255,0.2)"; ctx.stroke();
    ctx.restore();
    const lit = L * shell * hum(t, 600);
    tube(ctx, S, th, mk(arcPts(cx, cy, r, r, 0, TAU, 44), true), th.c3, lit * 0.8, { w: 6 });
    icon(ctx, S, th, CORNER[id] || "spark", cx, cy, r * 1.1, th.acc, lit * (0.8 + 0.2 * Math.sin(t * 4)), 7);
    const n = 12, head = (t * 5) % n;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, d = (head - i + n) % n, k = d < 3 ? 1 - d / 3 : 0.15;
      tube(ctx, S, th, mk(arcPts(cx, cy, r * 1.3, r * 1.3, a0, a0 + (TAU / n) * 0.5, 5)), th.c2, lit * k, { w: 5 });
    }
  }

  // ---- scene wrapper, pan and power -------------------------------------------------------------
  const SCENES = { chart: chartScene, object: objectScene, people: peopleScene, process: processScene, compare: compareScene };
  function wrap(fn, id) {
    return (ctx, S, box, p, d, info) => {
      const th = theme(S);
      const leaving = info.exit !== undefined;
      const t = info.t;
      let off = 0, L = 1, speed = 0, shell = 1;
      const change = Math.max(0.1, info.change || 0.45);
      const pre = preOf(info.hold);
      if (leaving) {
        const g = panG(info.exit * change, pre, change);
        off = -g * S.W; speed = Math.sin(Math.PI * g);
        L = powerDown(g, t, 7);
      } else {
        const hasNext = FR.shown[FR.index + 1];
        const prevHold = FR.index > 0 ? FR.shown[FR.index - 1].hold : 0;
        if (FR.index > 0 && info.local < change) {
          const g = panG(info.local, preOf(prevHold), change);
          off = (1 - g) * S.W; speed = Math.sin(Math.PI * g);
          shell = strike(0.3 + (info.local / change) * 1.4, 3 + FR.index, t);
        } else if (FR.index <= 0) shell = strike(0.6 + info.local / 0.5, 3, t);
        if (hasNext && info.local > info.hold - pre) {
          const g = panG(info.local - info.hold, pre, change);
          off = -g * S.W; speed = Math.sin(Math.PI * g); L *= powerDown(g, t, 7);
        }
      }
      const build = leaving ? 1 : clamp((info.local - 0.08) / Math.max(0.9, (info.hold - 0.5) * 0.72));
      ctx.save();
      ctx.translate(off, 0);
      if (speed > 0.15) ctx.filter = `blur(${(speed * 5 * S.u).toFixed(1)}px)`;
      fn(ctx, S, th, area(S, box), build, d, t, info.local, { L, shell: leaving ? 1 : shell, leaving });
      cornerSign(ctx, S, th, id, t, L, leaving ? 1 : shell);
      ctx.restore();
      if (!leaving || FR.postInExit) post(ctx, S, th, t);
    };
  }

  function shownList() {
    const c = (window.__dreamcut && window.__dreamcut.controls) || {};
    const def = { title: 2.4, chart: 3.4, object: 3.6, people: 3.2, process: 3.6, compare: 3.2, closing: 2.4 };
    const out = [];
    let at = 0;
    for (const id of Object.keys(def)) { const hold = Number(c[id + "_hold"] ?? def[id]); if (hold > 0) out.push({ id, start: at, hold }); at += hold; }
    return out;
  }
  // The template's own data, rebuilt for the one frame past the end where it draws nothing.
  function tplData(S) {
    const c = (window.__dreamcut && window.__dreamcut.controls) || {};
    const { u, tall, W, H } = S, side = (tall ? 90 : 140) * u;
    const box = tall ? { x: side, y: H * 0.3, w: W - side * 2, h: H * 0.6 } : { x: side, y: H * 0.34, w: W - side * 2, h: H * 0.58 };
    return { box, data: {
      chart: { labels: [c.bar_1_label, c.bar_2_label, c.bar_3_label, c.bar_4_label], values: [c.bar_1, c.bar_2, c.bar_3, c.bar_4], suffix: c.chart_suffix, prefix: "", highlight: Number(c.highlight) - 1 },
      object: { kind: c.device, callouts: [c.callout_1, c.callout_2, c.callout_3] },
      people: { count: c.people_count, badges: [c.badge_1, c.badge_2, c.badge_3], highlight: 1 },
      process: { steps: [c.step_1, c.step_2, c.step_3] },
      compare: { left: c.before_label, leftValue: c.before_value, right: c.after_label, rightValue: c.after_value, suffix: c.compare_suffix, prefix: "" },
    } };
  }

  const wrapped = {};
  for (const [id, fn] of Object.entries(SCENES)) wrapped[id] = wrap(fn, id);

  return {
    bg: "#120d14", panel: "rgba(255,255,255,0.04)", ink: "#fff2f8", muted: "rgba(255,236,246,0.74)", accent: "#ff3d9a", onAccent: "#120d14",
    rule: "rgba(255,255,255,0.3)", track: "rgba(255,255,255,0.1)",
    display: "'Avenir Next', 'Century Gothic', Futura, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif", displayWeight: 500, displayCase: "none", displayTracking: "0.005em",
    body: "'Avenir Next', 'Century Gothic', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif", bodyWeight: 500,
    figures: "'Avenir Next', 'Century Gothic', 'Segoe UI', Arial, sans-serif", radius: 26, motion: "glow", change: "fade",
    kit: { line: 3.5, glow: 18, fill: "none", panel: "outline" },
    tubes: ["#38f0ff", "#ffb340", "#a66bff", "#7dff6b", "#ff5537"], brick: "#3a2a35", mortar: "#140f16",
    palettes: {
      // Light: a whitewashed wall by day, the tubes as coloured glass. Dark: slate brick at midnight. Mono: white neon.
      light: { bg: "#d9d3cd", panel: "rgba(255,255,255,0.3)", ink: "#2a1430", muted: "rgba(42,20,48,0.7)", accent: "#e0177a", onAccent: "#ffffff", rule: "rgba(42,20,48,0.3)", track: "rgba(42,20,48,0.1)",
        tubes: ["#0a9fbd", "#d98200", "#7a3ddc", "#2a9e38", "#d93a1c"], brick: "#aaa098", mortar: "#d6cfc8", base: "linear-gradient(180deg, #ddd6cf 0%, #cfc8c1 100%)" },
      dark: { bg: "#07080c", ink: "#eefcff", muted: "rgba(230,250,255,0.72)", accent: "#2ee6ff", onAccent: "#07080c", tubes: ["#ff3dd0", "#ffd04a", "#7a6bff", "#5dffb0", "#ff4a3a"], brick: "#1d222c", mortar: "#08090c", base: "linear-gradient(180deg, #0c0e14 0%, #050608 100%)" },
      mono: { bg: "#111216", ink: "#f6f7ff", muted: "rgba(246,247,255,0.7)", accent: "#eef1ff", onAccent: "#111216", glowGain: 0.45, tubes: ["#9fb4e6", "#8d9cc4", "#b8c3e0", "#7f90b8", "#c9d3ee"], brick: "#2a2b31", mortar: "#111216", base: "linear-gradient(180deg, #17181d 0%, #0b0c0f 100%)" },
    },
    base: "linear-gradient(180deg, #1a1219 0%, #0b080d 100%)",
    textShadow: (accent) => neonShadow(accent, 1, false),
    backdrop: (accent, texture = 1, look) => `${grain(0.05 * texture)}, ${look ? look.base : "#120d14"}`,
    css: (accent, look) => {
      const day = lum(rgb(look.bg)) > 150;
      const k = rgb((look.tubes || ["#38f0ff"])[0]);
      const kc = day ? rgba(mix(k, [20, 10, 30], 0.3)) : rgba(mix(k, WHITE, 0.75));
      return `#root .display { color: ${day ? rgba(mix(rgb(accent), rgb(look.ink), 0.3)) : rgba(mix(rgb(accent), WHITE, 0.86))}; }
      #root .display, #title-scene .kicker { will-change: auto; }
      #root .display { text-wrap: balance; }
      #title-scene .kicker { align-self: flex-start; padding: 0.42em 1.1em 0.38em; border-radius: 999px; letter-spacing: 0.18em; color: ${kc};
        text-shadow: ${day ? "none" : `0 0 0.06em #fff, 0 0 0.3em ${rgba(k)}, 0 0 0.8em ${rgba(k, 0.7)}`};
        border: 0.12em solid ${kc}; box-shadow: ${day ? `0 0 0.4em ${rgba(k, 0.35)}` : `0 0 0.35em ${rgba(k)}, 0 0 1em ${rgba(k, 0.55)}, inset 0 0 0.35em ${rgba(k, 0.8)}`}; }`;
    },
    // Other templates get the wet wall on the texture canvas; the explainer's stage paints its own.
    paint: (ctx, W, H, t, accent, look) => {
      ctx.clearRect(0, 0, W, H);
      if (document.getElementById("art")) return;
      const S = { W, H, u: Math.min(W, H) / 1080, tall: H > W * 1.15, look: { ...look, texture: 1 }, accent, paint: true };
      const th = theme(S);
      world(ctx, S, th, t, t * 4 * S.u);
    },
    keepArt: true,
    overlap: true,
    stage(ctx, S, info) {
      const th = theme(S);
      const t = info.t;
      FR.t = t; FR.posted = false; FR.postInExit = false;
      const gc = buf("glow", S.W / GK, S.H / GK), g = gc.getContext("2d");
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.clearRect(0, 0, gc.width, gc.height);
      FR.g = g;
      FR.shown = shownList();
      let index = info.index, scene = info.scene, local = info.local, hold = info.hold;
      const tail = index < 0 && FR.shown.length > 0 && t > 0;
      if (tail) { index = FR.shown.length - 1; scene = FR.shown[index].id; hold = FR.shown[index].hold; local = hold; }
      FR.index = index; FR.scene = scene;
      const change = Math.max(0.1, info.change || 0.45);
      const arriving = index > 0 && local < change;
      const prevHold = index > 0 ? FR.shown[index - 1].hold : 0;
      const gIn = arriving ? panG(local, preOf(prevHold), change) : 1;
      const leavingSoon = !tail && FR.shown[index + 1] && local > hold - preOf(hold);
      const gOut = leavingSoon ? panG(local - hold, preOf(hold), change) : 0;
      const wx = (Math.max(0, index) - (1 - gIn) + gOut) * S.W;
      // The DOM words hum with the tubes.
      const root = document.getElementById("root");
      if (S.paint && root) {
        const f = Math.floor(t * 18), h = hash(f * 3 + 17);
        const bz = h > 0.975 ? 0.4 : h > 0.94 ? 0.75 : 0.93 + 0.07 * Math.sin(t * 7.3);
        root.style.setProperty("--separation", neonShadow(S.accent, bz * (S.look.glowGain ?? 1), th.day));
      }
      if (S.paint) world(ctx, S, th, t, wx);
      // Title and closing signs (no drawers of their own); the title also pans out as the first scene arrives.
      const prev = FR.shown[index - 1];
      if (scene === "title") statementArt(ctx, S, th, "title", local, hold, -gOut * S.W, leavingSoon ? powerDown(gOut, t, 9) : 1, t);
      if (prev && prev.id === "title" && arriving) statementArt(ctx, S, th, "title", prev.hold + local, prev.hold, -gIn * S.W, powerDown(gIn, t, 9), t);
      if (scene === "closing") statementArt(ctx, S, th, "closing", local + (index > 0 ? 0.3 : 0), hold, arriving ? (1 - gIn) * S.W : 0, 1, t);
      const curDrawn = scene && SCENES[scene];
      const prevDrawn = prev && SCENES[prev.id] && arriving;
      if (tail && curDrawn) {
        const { box, data } = tplData(S);
        wrapped[scene](ctx, S, box, 1, data[scene], { t, local, hold, change });
      } else if (!curDrawn && !prevDrawn) post(ctx, S, th, t);
      else if (!curDrawn && prevDrawn) FR.postInExit = true;
    },
    scenes: wrapped,
  };
});
