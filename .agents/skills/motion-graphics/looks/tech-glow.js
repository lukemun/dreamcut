// Tech Glow: a navy signal world. A perspective floor grid rolls toward the viewer under drifting
// light nebulae, a faint circuit constellation fills the sky, and every element is drawn as light:
// gradient-stroked icon nodes, neon-bordered cards, chamfered circuit traces that carry travelling
// pulses, all finished with a bloom pass. Scenes glide sideways through the world: the outgoing layout
// slides off and defocuses while a light curtain sweeps the frame and the next layout arrives.
// Every frame is a pure function of time: seeded noise only, no clocks.
window.DreamcutMotion.register("tech-glow", ({ grain, rng }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const ei = (v) => Math.pow(clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const frac = (v) => ((v % 1) + 1) % 1;
  const stg = (p, i, n, spread = 0.5) => eo((p - (i / Math.max(1, n)) * spread) / (1 - spread));

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
    return [120, 200, 255];
  }
  const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  const WHITE = [255, 255, 255];
  const MONO = "'SF Mono', Menlo, Consolas, 'Roboto Mono', monospace";

  function theme(S) {
    const L = S.look;
    const light = lum(rgb(L.bg)) > 150;
    return {
      light, acc: rgb(S.accent), g2: rgb(L.glow2 || "#8b5cff"), g3: rgb(L.glow3 || "#ff4fd2"),
      ink: rgb(L.ink), inkS: L.ink, muted: L.muted, grid: rgb(L.gridColor || "#4f6bff"),
      deep: (L.deep || ["#0b1240", "#070b26", "#0a0a2e"]).map(rgb), tex: L.texture ?? 1, u: S.u,
      add: light ? "source-over" : "lighter",
    };
  }

  // ---- buffers, noise -----------------------------------------------------------------------------
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
    c.width = c.height = 256;
    const g = c.getContext("2d");
    const img = g.createImageData(256, 256);
    const r = rng(606);
    for (let i = 0; i < img.data.length; i += 4) { const v = r() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    return (NOISE = c);
  }

  // ---- primitives ---------------------------------------------------------------------------------
  function rrSub(ctx, x, y, w, h, r) {
    const q = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.moveTo(x + q, y); ctx.arcTo(x + w, y, x + w, y + h, q); ctx.arcTo(x + w, y + h, x, y + h, q);
    ctx.arcTo(x, y + h, x, y, q); ctx.arcTo(x, y, x + w, y, q); ctx.closePath();
  }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); rrSub(ctx, x, y, w, h, r); }
  function lin(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    return g;
  }
  // Stroke the current path as light: a wide soft halo, the coloured tube, and a white-hot core.
  function neon(ctx, th, style, w, sc, u, k = 1) {
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = style;
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * (th.light ? 0.16 : 0.3); ctx.lineWidth = w * 3.4;
    ctx.shadowColor = rgba(sc, th.light ? 0.45 : 0.95); ctx.shadowBlur = 20 * u * k; ctx.stroke();
    ctx.globalAlpha = a; ctx.lineWidth = w; ctx.shadowBlur = 7 * u * k; ctx.stroke();
    if (!th.light) { ctx.shadowBlur = 0; ctx.lineWidth = Math.max(1, w * 0.34); ctx.strokeStyle = "rgba(255,255,255,0.72)"; ctx.globalAlpha = a * 0.85; ctx.stroke(); }
    ctx.restore();
  }
  function glowBlob(ctx, th, x, y, r, c, a) {
    if (r <= 0 || a <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = th.add;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(c, a * (th.light ? 0.45 : 1))); g.addColorStop(0.45, rgba(c, a * (th.light ? 0.18 : 0.38))); g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }
  function glowDot(ctx, th, x, y, r, c, a = 1) {
    ctx.save();
    ctx.globalCompositeOperation = th.add;
    ctx.globalAlpha *= a;
    const R = r * 3.4;
    const g = ctx.createRadialGradient(x, y, 0, x, y, R);
    if (th.light) { g.addColorStop(0, rgba(c, 1)); g.addColorStop(0.3, rgba(c, 0.6)); g.addColorStop(1, rgba(c, 0)); }
    else { g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.2, rgba(mix(c, WHITE, 0.45), 0.95)); g.addColorStop(0.5, rgba(c, 0.32)); g.addColorStop(1, rgba(c, 0)); }
    ctx.fillStyle = g; ctx.fillRect(x - R, y - R, R * 2, R * 2);
    ctx.restore();
  }

  // ---- polylines (circuit traces) -----------------------------------------------------------------
  // A chamfered trace from a to b: straight, a 45-degree-ish jog, straight again.
  function trace(a, b, axis = "x") {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    if (axis === "x") {
      const c = Math.min(Math.abs(dy), Math.abs(dx) * 0.6), mx = a[0] + dx / 2, s = Math.sign(dx) || 1;
      return [a, [mx - (s * c) / 2, a[1]], [mx + (s * c) / 2, b[1]], b];
    }
    const c = Math.min(Math.abs(dx), Math.abs(dy) * 0.6), my = a[1] + dy / 2, s = Math.sign(dy) || 1;
    return [a, [a[0], my - (s * c) / 2], [b[0], my + (s * c) / 2], b];
  }
  // Cut each interior corner of an orthogonal path by c, for a printed-circuit look.
  function chamfer(P, c) {
    const out = [P[0]];
    for (let i = 1; i < P.length - 1; i++) {
      const a = P[i - 1], b = P[i], n = P[i + 1];
      const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, l2 = Math.hypot(n[0] - b[0], n[1] - b[1]) || 1;
      const k1 = Math.min(c, l1 / 2) / l1, k2 = Math.min(c, l2 / 2) / l2;
      out.push([b[0] - (b[0] - a[0]) * k1, b[1] - (b[1] - a[1]) * k1], [b[0] + (n[0] - b[0]) * k2, b[1] + (n[1] - b[1]) * k2]);
    }
    out.push(P[P.length - 1]);
    return out;
  }
  function plen(P) { const L = [0]; for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])); return L; }
  function pat(P, L, d) {
    d = clamp(d, 0, L[L.length - 1]);
    for (let i = 1; i < P.length; i++) {
      if (d <= L[i] || i === P.length - 1) { const s = L[i] - L[i - 1] || 1, f = (d - L[i - 1]) / s; return [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * f, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * f]; }
    }
    return P[P.length - 1];
  }
  function pathTo(ctx, P, L, d0, d1) {
    const a = pat(P, L, d0);
    ctx.moveTo(a[0], a[1]);
    for (let i = 1; i < P.length; i++) { if (L[i] > d0 && L[i] < d1) ctx.lineTo(P[i][0], P[i][1]); }
    const b = pat(P, L, d1);
    ctx.lineTo(b[0], b[1]);
  }
  // A connector that draws on to q, then carries travelling pulses (comet heads with tails).
  function link(ctx, S, th, P, q, t, o = {}) {
    if (q <= 0.001) return;
    const u = S.u, L = plen(P), tot = L[L.length - 1] || 1, d = tot * clamp(q);
    const c1 = o.c1 || th.acc, c2 = o.c2 || th.g2;
    ctx.save();
    ctx.beginPath(); pathTo(ctx, P, L, 0, d);
    const A = P[0], B = P[P.length - 1];
    neon(ctx, th, lin(ctx, A[0], A[1], B[0] + 0.01, B[1], [[0, rgba(c1)], [1, rgba(c2)]]), (o.w ?? 2.4) * u, c1, u, o.glow ?? 0.9);
    // Sockets at the ends.
    ctx.beginPath(); ctx.arc(A[0], A[1], 6 * u, 0, TAU); ctx.fillStyle = rgba(th.light ? c1 : mix(c1, WHITE, 0.5)); ctx.fill();
    ctx.beginPath(); ctx.arc(A[0], A[1], 12 * u, 0, TAU); ctx.lineWidth = 1.6 * u; ctx.strokeStyle = rgba(c1, 0.55); ctx.stroke();
    const tip = pat(P, L, d);
    glowDot(ctx, th, tip[0], tip[1], 6 * u, q < 1 ? c1 : c2, q < 1 ? 1 : 0.7);
    if (q > 0.97) {
      const n = o.n ?? 2, v = (o.v ?? 300) * u;
      for (let k = 0; k < n; k++) {
        let f = frac((t * v) / tot + k / n + (o.phase || 0));
        if (o.reverse) f = 1 - f;
        const hd = f * tot, tail = 110 * u * (o.reverse ? -1 : 1);
        ctx.beginPath(); pathTo(ctx, P, L, Math.min(hd, hd - tail), Math.max(hd, hd - tail));
        const h0 = pat(P, L, hd), h1 = pat(P, L, hd - tail);
        ctx.lineCap = "round"; ctx.lineWidth = 4 * u;
        ctx.strokeStyle = lin(ctx, h1[0], h1[1], h0[0] + 0.01, h0[1], [[0, rgba(c2, 0)], [1, rgba(th.light ? c1 : mix(c1, WHITE, 0.6), 0.95)]]);
        ctx.globalCompositeOperation = th.add; ctx.stroke(); ctx.globalCompositeOperation = "source-over";
        glowDot(ctx, th, h0[0], h0[1], 7 * u, c1);
      }
    }
    ctx.restore();
  }

  // ---- type ---------------------------------------------------------------------------------------
  function font(S, size, weight, fam = "body") {
    const L = S.look;
    const f = fam === "display" ? L.display : fam === "figures" ? L.figures : fam === "mono" ? MONO : L.body;
    return `${weight} ${size}px ${f}`;
  }
  function fitText(ctx, S, s, size, wt, fam, max, min) {
    let z = size;
    ctx.font = font(S, z, wt, fam);
    if (max) {
      while (z > min && ctx.measureText(s).width > max) { z = Math.max(min, z * 0.95); ctx.font = font(S, z, wt, fam); }
      if (ctx.measureText(s).width > max) { while (s.length > 1 && ctx.measureText(s + "…").width > max) s = s.slice(0, -1); s += "…"; }
    }
    return { s, z, w: ctx.measureText(s).width };
  }
  function txt(ctx, S, th, s, x, y, size, o = {}) {
    s = String(s ?? "");
    if (!s) return 0;
    ctx.save();
    const fam = o.fam || "body", wt = o.weight ?? (fam === "body" ? 600 : 700);
    const f = fitText(ctx, S, s, size, wt, fam, o.max, o.min ?? 42 * S.u);
    const align = o.align || "left";
    ctx.textAlign = align; ctx.textBaseline = o.base || "middle";
    const x0 = align === "center" ? x - f.w / 2 : align === "right" ? x - f.w : x;
    if (o.grad) {
      ctx.fillStyle = lin(ctx, x0, 0, x0 + f.w + 0.01, 0, th.light
        ? [[0, rgba(th.ink)], [0.55, rgba(th.acc)], [1, rgba(th.g2)]]
        : [[0, rgba(mix(th.ink, th.acc, 0.25))], [0.5, rgba(mix(th.acc, WHITE, 0.15))], [1, rgba(mix(th.g2, WHITE, 0.15))]]);
    } else ctx.fillStyle = o.color || th.inkS;
    if (o.glow && !th.light) { ctx.shadowColor = rgba(o.glowC || th.acc, 0.75); ctx.shadowBlur = o.glow * S.u; }
    ctx.fillText(f.s, x, y);
    ctx.restore();
    return f.w;
  }
  const fmtN = (v, ref, prefix, suffix) => window.DreamcutMotion.formatNumber(v, Number.isInteger(Number(ref)) ? 0 : 1, prefix, suffix);

  // ---- glyphs (original line icons, drawn at the origin) ------------------------------------------
  function glyph(ctx, name, s) {
    const h = s / 2;
    ctx.beginPath();
    switch (name) {
      case "film": {
        rrSub(ctx, -h * 0.9, -h * 0.66, h * 1.8, h * 1.32, h * 0.18);
        ctx.moveTo(-h * 0.56, -h * 0.66); ctx.lineTo(-h * 0.56, h * 0.66); ctx.moveTo(h * 0.56, -h * 0.66); ctx.lineTo(h * 0.56, h * 0.66);
        for (const k of [-0.36, 0, 0.36]) { ctx.moveTo(-h * 0.78, h * k); ctx.lineTo(-h * 0.7, h * k); ctx.moveTo(h * 0.7, h * k); ctx.lineTo(h * 0.78, h * k); }
        ctx.stroke(); ctx.beginPath();
        ctx.moveTo(-h * 0.16, -h * 0.26); ctx.lineTo(h * 0.28, 0); ctx.lineTo(-h * 0.16, h * 0.26); ctx.closePath(); ctx.fill();
        return;
      }
      case "clip":
        ctx.moveTo(-h * 0.85, -h * 0.5); ctx.lineTo(h * 0.15, -h * 0.5); ctx.moveTo(-h * 0.45, 0); ctx.lineTo(h * 0.85, 0);
        ctx.moveTo(-h * 0.85, h * 0.5); ctx.lineTo(-h * 0.1, h * 0.5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(h * 0.4, -h * 0.9); ctx.lineTo(h * 0.4, h * 0.9); ctx.save(); ctx.lineWidth *= 0.6; ctx.stroke(); ctx.restore();
        return;
      case "wave":
        [0.3, 0.62, 0.95, 0.5, 0.78, 0.4, 0.22].forEach((v, i) => { const x = (i - 3) * h * 0.28; ctx.moveTo(x, -v * h); ctx.lineTo(x, v * h); });
        break;
      case "sliders":
        [[-0.55, 0.35], [0, -0.4], [0.55, 0.1]].forEach(([y]) => { ctx.moveTo(-h * 0.85, y * h); ctx.lineTo(h * 0.85, y * h); });
        ctx.stroke(); ctx.beginPath();
        [[-0.55, 0.35], [0, -0.4], [0.55, 0.1]].forEach(([y, x]) => { ctx.moveTo(x * h + h * 0.17, y * h); ctx.arc(x * h, y * h, h * 0.17, 0, TAU); });
        ctx.fill();
        return;
      case "check": ctx.moveTo(-h * 0.62, h * 0.02); ctx.lineTo(-h * 0.16, h * 0.46); ctx.lineTo(h * 0.68, -h * 0.5); break;
      case "spark":
        ctx.moveTo(-h * 0.1, -h * 0.85); ctx.quadraticCurveTo(-h * 0.02, -h * 0.12, h * 0.62, -h * 0.02); ctx.quadraticCurveTo(-h * 0.02, h * 0.08, -h * 0.1, h * 0.8);
        ctx.quadraticCurveTo(-h * 0.2, h * 0.08, -h * 0.82, -h * 0.02); ctx.quadraticCurveTo(-h * 0.2, -h * 0.12, -h * 0.1, -h * 0.85); ctx.closePath();
        ctx.moveTo(h * 0.6, -h * 0.78); ctx.lineTo(h * 0.6, -h * 0.46); ctx.moveTo(h * 0.44, -h * 0.62); ctx.lineTo(h * 0.76, -h * 0.62);
        break;
      case "scan":
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(sx * h * 0.82, sy * h * 0.4); ctx.lineTo(sx * h * 0.82, sy * h * 0.82); ctx.lineTo(sx * h * 0.4, sy * h * 0.82); }
        ctx.moveTo(-h * 0.55, 0); ctx.lineTo(h * 0.55, 0);
        ctx.moveTo(-h * 0.3, -h * 0.3); ctx.lineTo(h * 0.3, -h * 0.3); ctx.moveTo(-h * 0.3, h * 0.3); ctx.lineTo(h * 0.15, h * 0.3);
        break;
      case "user":
        ctx.arc(0, -h * 0.28, h * 0.36, 0, TAU); ctx.moveTo(-h * 0.72, h * 0.86); ctx.quadraticCurveTo(-h * 0.7, h * 0.2, 0, h * 0.2); ctx.quadraticCurveTo(h * 0.7, h * 0.2, h * 0.72, h * 0.86);
        break;
      case "layers":
        ctx.moveTo(0, -h * 0.82); ctx.lineTo(h * 0.86, -h * 0.36); ctx.lineTo(0, h * 0.1); ctx.lineTo(-h * 0.86, -h * 0.36); ctx.closePath();
        ctx.moveTo(-h * 0.86, h * 0.06); ctx.lineTo(0, h * 0.52); ctx.lineTo(h * 0.86, h * 0.06);
        ctx.moveTo(-h * 0.86, h * 0.42); ctx.lineTo(0, h * 0.88); ctx.lineTo(h * 0.86, h * 0.42);
        break;
      case "cursor":
        ctx.moveTo(-h * 0.5, -h * 0.8); ctx.lineTo(h * 0.55, h * 0.1); ctx.lineTo(h * 0.02, h * 0.18); ctx.lineTo(h * 0.3, h * 0.78); ctx.lineTo(h * 0.08, h * 0.88);
        ctx.lineTo(-h * 0.2, h * 0.3); ctx.lineTo(-h * 0.5, h * 0.62); ctx.closePath();
        break;
      case "eye":
        ctx.moveTo(-h * 0.92, 0); ctx.quadraticCurveTo(0, -h * 0.95, h * 0.92, 0); ctx.quadraticCurveTo(0, h * 0.95, -h * 0.92, 0);
        ctx.moveTo(h * 0.3, 0); ctx.arc(0, 0, h * 0.3, 0, TAU);
        break;
      case "chip":
        rrSub(ctx, -h * 0.52, -h * 0.52, h * 1.04, h * 1.04, h * 0.12);
        for (const k of [-0.28, 0, 0.28]) {
          ctx.moveTo(-h * 0.52, k * h); ctx.lineTo(-h * 0.86, k * h); ctx.moveTo(h * 0.52, k * h); ctx.lineTo(h * 0.86, k * h);
          ctx.moveTo(k * h, -h * 0.52); ctx.lineTo(k * h, -h * 0.86); ctx.moveTo(k * h, h * 0.52); ctx.lineTo(k * h, h * 0.86);
        }
        rrSub(ctx, -h * 0.2, -h * 0.2, h * 0.4, h * 0.4, h * 0.06);
        break;
      case "bolt": ctx.moveTo(h * 0.18, -h * 0.9); ctx.lineTo(-h * 0.5, h * 0.1); ctx.lineTo(-h * 0.02, h * 0.1); ctx.lineTo(-h * 0.18, h * 0.9); ctx.lineTo(h * 0.5, -h * 0.1); ctx.lineTo(h * 0.02, -h * 0.1); ctx.closePath(); break;
      case "dial":
        ctx.arc(0, h * 0.1, h * 0.8, Math.PI * 0.8, Math.PI * 2.2); ctx.moveTo(0, h * 0.1); ctx.lineTo(h * 0.42, -h * 0.32);
        break;
      case "wand":
        ctx.moveTo(-h * 0.8, h * 0.8); ctx.lineTo(h * 0.25, -h * 0.25);
        ctx.moveTo(h * 0.55, -h * 0.9); ctx.lineTo(h * 0.55, -h * 0.3); ctx.moveTo(h * 0.25, -h * 0.6); ctx.lineTo(h * 0.85, -h * 0.6);
        ctx.moveTo(-h * 0.3, -h * 0.7); ctx.lineTo(-h * 0.3, -h * 0.5); ctx.moveTo(-h * 0.4, -h * 0.6); ctx.lineTo(-h * 0.2, -h * 0.6);
        break;
      case "arrow": ctx.moveTo(-h * 0.8, 0); ctx.lineTo(h * 0.8, 0); ctx.moveTo(h * 0.3, -h * 0.5); ctx.lineTo(h * 0.8, 0); ctx.lineTo(h * 0.3, h * 0.5); break;
      case "down": ctx.moveTo(0, -h * 0.8); ctx.lineTo(0, h * 0.8); ctx.moveTo(-h * 0.5, h * 0.3); ctx.lineTo(0, h * 0.8); ctx.lineTo(h * 0.5, h * 0.3); break;
      case "up": ctx.moveTo(0, h * 0.8); ctx.lineTo(0, -h * 0.8); ctx.moveTo(-h * 0.5, -h * 0.3); ctx.lineTo(0, -h * 0.8); ctx.lineTo(h * 0.5, -h * 0.3); break;
      default: ctx.arc(0, 0, h * 0.5, 0, TAU);
    }
    ctx.stroke();
  }

  // ---- components ---------------------------------------------------------------------------------
  // An icon node: a dark rounded tile with a gradient neon rim, a breathing halo and a pulse ring.
  function node(ctx, S, th, x, y, s, name, o = {}) {
    const u = S.u, q = o.q ?? 1;
    if (q <= 0.001) return;
    const t = o.t || 0, ph = o.ph || 0, lit = o.lit ?? (o.hot ? 1 : 0.55);
    const c1 = o.c1 || th.acc, c2 = o.c2 || th.g2;
    ctx.save();
    const sc = 0.55 + 0.45 * back(q);
    ctx.translate(x, y); ctx.scale(sc, sc);
    ctx.globalAlpha *= clamp(q * 2);
    const br = 0.82 + 0.18 * Math.sin(t * 2.1 + ph);
    glowBlob(ctx, th, 0, 0, s * (0.9 + 0.35 * lit), c1, (0.16 + 0.26 * lit) * br);
    const r = s * 0.27;
    // Pulse ring leaving the rim.
    const pr = frac(t * 0.42 + ph * 0.3);
    ctx.save(); rr(ctx, -s / 2 - pr * s * 0.3, -s / 2 - pr * s * 0.3, s + pr * s * 0.6, s + pr * s * 0.6, r + pr * s * 0.3);
    ctx.lineWidth = 2 * u; ctx.strokeStyle = rgba(c1, (1 - pr) * 0.5 * (0.4 + lit * 0.6)); ctx.stroke(); ctx.restore();
    // Body.
    rr(ctx, -s / 2, -s / 2, s, s, r);
    ctx.fillStyle = th.light
      ? lin(ctx, 0, -s / 2, 0, s / 2, [[0, "rgba(255,255,255,0.98)"], [1, rgba(mix(WHITE, c1, 0.08), 0.96)]])
      : lin(ctx, 0, -s / 2, 0, s / 2, [[0, rgba(mix(th.deep[0], c1, 0.16), 0.97)], [1, rgba(mix(th.deep[1], c2, 0.1), 0.97)]]);
    ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = lin(ctx, 0, -s / 2, 0, 0, [[0, `rgba(255,255,255,${th.light ? 0.5 : 0.1})`], [1, "rgba(255,255,255,0)"]]);
    ctx.fillRect(-s / 2, -s / 2, s, s / 2);
    ctx.restore();
    rr(ctx, -s / 2, -s / 2, s, s, r);
    neon(ctx, th, lin(ctx, -s / 2, -s / 2, s / 2, s / 2, [[0, rgba(c1)], [1, rgba(c2)]]), (o.lw ?? 2.6) * u, c1, u, 0.7 + 0.6 * lit);
    // Glyph.
    ctx.save();
    const gg = lin(ctx, -s * 0.3, -s * 0.3, s * 0.3, s * 0.3, th.light ? [[0, rgba(c1)], [1, rgba(c2)]] : [[0, rgba(mix(c1, WHITE, 0.35))], [1, rgba(mix(c2, WHITE, 0.25))]]);
    ctx.strokeStyle = gg; ctx.fillStyle = gg; ctx.lineWidth = Math.max(2 * u, s * 0.052); ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (!th.light) { ctx.shadowColor = rgba(c1, 0.95); ctx.shadowBlur = 10 * u * (0.6 + lit * 0.7); }
    glyph(ctx, name, s * 0.5);
    ctx.restore();
    ctx.restore();
  }

  // A neon-bordered card: tinted glass fill, a fine inner grid, a gradient rim that traces on, corner
  // brackets and a comet that keeps running round the rim through the hold.
  function card(ctx, S, th, x, y, w, h, o = {}) {
    const u = S.u, r = o.r ?? 26 * u, q = o.q ?? 1, t = o.t || 0;
    if (q <= 0.001) return;
    ctx.save();
    ctx.save();
    ctx.globalAlpha *= clamp(q * 2);
    rr(ctx, x, y, w, h, r);
    ctx.fillStyle = th.light
      ? lin(ctx, x, y, x, y + h, [[0, "rgba(255,255,255,0.9)"], [1, "rgba(246,247,255,0.86)"]])
      : lin(ctx, x, y, x, y + h, [[0, rgba(mix(th.deep[0], th.acc, 0.07), 0.86)], [1, rgba(mix(th.deep[1], th.g2, 0.07), 0.9)]]);
    ctx.shadowColor = th.light ? "rgba(60,70,180,0.16)" : rgba(o.hot ? th.acc : th.g2, 0.22); ctx.shadowBlur = 50 * u;
    ctx.fill(); ctx.shadowBlur = 0;
    ctx.save(); ctx.clip();
    const step = 34 * u;
    ctx.beginPath();
    for (let xx = x + step; xx < x + w; xx += step) { ctx.moveTo(xx, y); ctx.lineTo(xx, y + h); }
    for (let yy = y + step; yy < y + h; yy += step) { ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); }
    ctx.lineWidth = 1 * u; ctx.strokeStyle = rgba(th.light ? th.g2 : th.acc, th.light ? 0.06 : 0.05); ctx.stroke();
    ctx.fillStyle = lin(ctx, x, y, x, y + h * 0.35, [[0, rgba(o.hot ? th.acc : th.g2, th.light ? 0.08 : 0.12)], [1, rgba(th.g2, 0)]]);
    ctx.fillRect(x, y, w, h * 0.35);
    ctx.restore();
    ctx.restore();
    // Rim.
    const per = 2 * (w + h);
    rr(ctx, x, y, w, h, r);
    if (q < 1) ctx.setLineDash([per * q, per * 2]);
    const c1 = o.hot ? th.acc : mix(th.acc, th.g2, 0.35);
    neon(ctx, th, lin(ctx, x, y, x + w, y + h, [[0, rgba(c1)], [0.55, rgba(mix(th.acc, th.g2, 0.7))], [1, rgba(o.hot ? th.g3 : th.g2)]]), 2 * u, c1, u, o.hot ? 1.1 : 0.75);
    ctx.setLineDash([]);
    if (q >= 0.98) {
      // Comet round the rim.
      const f = frac(t * 0.085 + (o.phase || 0));
      rr(ctx, x, y, w, h, r);
      ctx.setLineDash([per * 0.06, per * 2]); ctx.lineDashOffset = -per * f;
      ctx.lineWidth = 3.2 * u; ctx.lineCap = "round"; ctx.strokeStyle = th.light ? rgba(th.acc) : "rgba(255,255,255,0.95)";
      ctx.shadowColor = rgba(th.acc); ctx.shadowBlur = 16 * u; ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur = 0;
      // Corner brackets just outside the rim.
      const k = 30 * u, g = 12 * u;
      ctx.beginPath();
      for (const [cx, cy, sx, sy] of [[x - g, y - g, 1, 1], [x + w + g, y - g, -1, 1], [x + w + g, y + h + g, -1, -1], [x - g, y + h + g, 1, -1]]) {
        ctx.moveTo(cx, cy + sy * k); ctx.lineTo(cx, cy); ctx.lineTo(cx + sx * k, cy);
      }
      ctx.lineWidth = 2.2 * u; ctx.strokeStyle = rgba(th.acc, 0.55 + 0.25 * Math.sin(t * 2 + (o.phase || 0) * 9)); ctx.stroke();
    }
    ctx.restore();
  }

  // A capsule label with a glowing lead dot. The words always arrive together with the capsule.
  function pillRect(ctx, S, s, x, y, size, o = {}) {
    const padX = size * 0.62, h = size * 1.66, lead = o.dot === false ? 0 : size * 0.85;
    const f = fitText(ctx, S, String(s), size, o.weight ?? 650, o.fam || "body", o.max ? o.max - padX * 2 - lead : 0, o.min ?? 42 * S.u);
    const w = f.w + padX * 2 + lead;
    const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    return { x: x0, y: y - h / 2, w, h, padX, lead, f };
  }
  function pill(ctx, S, th, s, x, y, size, o = {}) {
    if (!s) return null;
    const u = S.u, q = o.q ?? 1;
    ctx.save();
    const R = pillRect(ctx, S, s, x, y, size, o);
    if (q <= 0.001) { ctx.restore(); return R; }
    ctx.globalAlpha *= clamp(q * 1.6);
    const cx = R.x + R.w / 2;
    ctx.translate(cx, y); ctx.scale(0.85 + 0.15 * eo(q), 0.85 + 0.15 * eo(q)); ctx.translate(-cx, -y);
    rr(ctx, R.x, R.y, R.w, R.h, R.h / 2);
    if (o.solid) {
      ctx.fillStyle = lin(ctx, R.x, 0, R.x + R.w, 0, [[0, rgba(mix(th.acc, WHITE, th.light ? 0 : 0.15))], [1, rgba(mix(th.acc, th.g2, 0.45))]]);
      if (!th.light) { ctx.shadowColor = rgba(th.acc, 0.9); ctx.shadowBlur = 30 * u; }
      ctx.fill(); ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = th.light ? "rgba(255,255,255,0.94)" : rgba(mix(th.deep[0], o.hot ? th.acc : th.g2, 0.12), 0.92);
      ctx.fill();
    }
    rr(ctx, R.x, R.y, R.w, R.h, R.h / 2);
    const c1 = o.hot ? th.acc : mix(th.acc, th.g2, 0.5);
    neon(ctx, th, o.solid ? rgba(mix(th.acc, WHITE, 0.5)) : lin(ctx, R.x, R.y, R.x + R.w, R.y + R.h, [[0, rgba(c1, o.hot ? 1 : 0.8)], [1, rgba(th.g2, o.hot ? 1 : 0.7)]]), 1.8 * u, c1, u, o.hot ? 0.9 : 0.5);
    if (R.lead) {
      const dx = R.x + R.padX * 0.7 + size * 0.2;
      glowDot(ctx, th, dx, y, size * 0.13, o.dotC || (o.hot ? th.acc : th.g2), 0.75 + 0.25 * Math.sin((o.t || 0) * (o.blink || 3) + x * 0.01));
    }
    ctx.font = font(S, R.f.z, o.weight ?? 650, o.fam || "body"); ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.fillStyle = o.solid ? S.look.onAccent || "#04102a" : o.hot && !th.light ? rgba(mix(th.ink, th.acc, 0.25)) : th.inkS;
    ctx.fillText(R.f.s, R.x + R.padX + R.lead, y + size * 0.03);
    ctx.restore();
    return R;
  }

  // A rotating HUD ring of ticks and arc segments.
  function hudRing(ctx, S, th, x, y, r, t, o = {}) {
    const u = S.u, a = o.a ?? 1;
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha *= a;
    const n = o.ticks ?? 72, rot = t * (o.speed ?? 0.12);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const ang = rot + (i / n) * TAU, long = i % 6 === 0;
      ctx.moveTo(x + Math.cos(ang) * r, y + Math.sin(ang) * r);
      ctx.lineTo(x + Math.cos(ang) * (r + (long ? 16 : 7) * u), y + Math.sin(ang) * (r + (long ? 16 : 7) * u));
    }
    ctx.lineWidth = 1.6 * u; ctx.strokeStyle = rgba(th.acc, th.light ? 0.4 : 0.42); ctx.stroke();
    for (let k = 0; k < 3; k++) {
      const a0 = -rot * 1.6 + (k * TAU) / 3;
      ctx.beginPath(); ctx.arc(x, y, r + 30 * u, a0, a0 + 0.75);
      neon(ctx, th, rgba(k === 0 ? th.acc : th.g2, 0.9), 2.4 * u, th.acc, u, 0.6);
    }
    ctx.restore();
  }

  // ---- the world ----------------------------------------------------------------------------------
  const horizon = (S) => S.H * (S.tall ? 0.7 : 0.66);
  const BLOBS = [
    { x: 0.14, y: 0.18, r: 0.5, c: 1, a: 0.3, s: 0.11 },
    { x: 0.88, y: 0.12, r: 0.42, c: 0, a: 0.17, s: 0.08 },
    { x: 0.42, y: 0.4, r: 0.34, c: 0, a: 0.07, s: 0.05 },
    { x: 0.62, y: 0.78, r: 0.5, c: 1, a: 0.16, s: 0.06 },
    { x: 0.04, y: 0.9, r: 0.36, c: 2, a: 0.11, s: 0.09 },
    { x: 0.98, y: 0.58, r: 0.4, c: 2, a: 0.09, s: 0.07 },
  ];
  const WORLD = {};
  function worldData(S) {
    const key = S.W + "x" + S.H;
    if (WORLD[key]) return WORLD[key];
    const u = S.u, r = rng(616), W = S.W, H = S.H, hy = horizon(S);
    const stars = [];
    for (let i = 0; i < 170; i++) stars.push({ x: r() * W * 1.6, y: r() * hy * 0.98, s: (0.6 + r() * 1.6) * u, p: r() * TAU, k: 0.5 + r() * 1.6 });
    // A sparse circuit constellation in the sky, wrapped over a wide period for parallax.
    const PW = W * 2.4, cell = 210 * u, nodes = [];
    for (let gx = 0; gx < PW; gx += cell) for (let gy = 70 * u; gy < hy - 90 * u; gy += cell) if (r() < 0.55) nodes.push([gx + r() * cell * 0.7, gy + r() * cell * 0.7]);
    const traces = [];
    nodes.forEach((a) => {
      let best = null, bd = 1e9;
      nodes.forEach((b) => { if (b[0] <= a[0] + 20 * u) return; const d = Math.hypot(b[0] - a[0], (b[1] - a[1]) * 1.6); if (d < bd && d < cell * 1.9) { bd = d; best = b; } });
      if (best) traces.push({ P: trace(a, best, "x"), pulse: r() < 0.35, ph: r() });
    });
    traces.forEach((tr) => { tr.L = plen(tr.P); });
    const motes = [];
    for (let i = 0; i < 46; i++) motes.push({ x: r(), sp: 0.03 + r() * 0.05, s: (1.2 + r() * 2.2) * u, p: r(), c: r() < 0.6 ? 0 : 1 });
    const streaks = [];
    for (let i = 0; i < 26; i++) streaks.push({ y: r(), l: 80 + r() * 320, o: r() * 260, a: 0.3 + r() * 0.7 });
    return (WORLD[key] = { stars, PW, nodes, traces, motes, streaks });
  }

  function world(ctx, S, th, t, cam, surge) {
    const W = S.W, H = S.H, u = S.u, D = worldData(S), hy = horizon(S), cols = [th.acc, th.g2, th.g3];
    ctx.save();
    ctx.fillStyle = lin(ctx, 0, 0, 0, H, [[0, rgba(th.deep[0])], [0.62, rgba(th.deep[1])], [1, rgba(th.deep[2])]]);
    ctx.fillRect(0, 0, W, H);
    // Nebulae of light, drifting.
    const M = Math.max(W, H);
    BLOBS.forEach((b, i) => {
      const cx = (b.x + 0.05 * Math.sin(t * b.s + i * 2.1)) * W - cam * 0.04 * (1 + i * 0.2);
      const cy = (b.y + 0.04 * Math.cos(t * b.s * 1.3 + i)) * H;
      glowBlob(ctx, th, cx, cy, b.r * M, cols[b.c], b.a * (th.light ? 0.7 : 1));
    });
    // Stars.
    ctx.globalCompositeOperation = th.add;
    D.stars.forEach((s) => {
      const x = frac((s.x - cam * 0.1) / (W * 1.6)) * W * 1.6 - W * 0.3;
      if (x < -4 || x > W + 4) return;
      const a = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * s.k + s.p));
      ctx.fillStyle = th.light ? rgba(th.g2, 0.35 * a) : `rgba(220,230,255,${0.75 * a})`;
      ctx.fillRect(x, s.y, s.s, s.s);
    });
    ctx.globalCompositeOperation = "source-over";
    // Circuit constellation.
    const ox = -frac((cam * 0.28) / D.PW) * D.PW;
    for (const off of [ox, ox + D.PW]) {
      if (off > W || off + D.PW < 0) continue;
      ctx.save(); ctx.translate(off, 0);
      ctx.beginPath();
      D.traces.forEach((tr) => { ctx.moveTo(tr.P[0][0], tr.P[0][1]); for (let i = 1; i < tr.P.length; i++) ctx.lineTo(tr.P[i][0], tr.P[i][1]); });
      ctx.lineWidth = 1.3 * u; ctx.strokeStyle = rgba(th.grid, th.light ? 0.16 : 0.2); ctx.stroke();
      ctx.fillStyle = rgba(th.light ? th.g2 : mix(th.grid, WHITE, 0.3), th.light ? 0.3 : 0.45);
      D.nodes.forEach((n) => { ctx.fillRect(n[0] - 2.5 * u, n[1] - 2.5 * u, 5 * u, 5 * u); });
      D.traces.forEach((tr) => {
        if (!tr.pulse) return;
        const tot = tr.L[tr.L.length - 1], f = frac(t * 0.22 + tr.ph);
        const p = pat(tr.P, tr.L, f * tot);
        if (p[0] + off < -20 || p[0] + off > W + 20) return;
        glowDot(ctx, th, p[0], p[1], 3.2 * u, cols[Math.floor(tr.ph * 3) % 2], 0.8 * Math.sin(Math.PI * f));
      });
      ctx.restore();
    }
    // Floor: horizon glow, perspective grid rolling toward the viewer.
    const vx = W / 2;
    glowBlob(ctx, th, vx, hy, W * 0.4, th.acc, th.light ? 0.12 : 0.12);
    ctx.save();
    ctx.globalCompositeOperation = th.add;
    ctx.fillStyle = lin(ctx, 0, hy - 160 * u, 0, hy + 200 * u, [[0, rgba(th.g2, 0)], [0.44, rgba(th.acc, th.light ? 0.06 : 0.09)], [1, rgba(th.g2, 0)]]);
    ctx.fillRect(0, hy - 160 * u, W, 360 * u);
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.rect(0, hy, W, H - hy); ctx.clip();
    ctx.fillStyle = lin(ctx, 0, hy, 0, H, [[0, rgba(th.g2, th.light ? 0.06 : 0.1)], [1, rgba(th.deep[2], 0)]]);
    ctx.fillRect(0, hy, W, H - hy);
    const sp = 175 * u, shift = cam % sp;
    ctx.beginPath();
    const span = Math.ceil((W * 1.6) / sp);
    for (let i = -span; i <= span; i++) {
      const X = i * sp - shift;
      ctx.moveTo(vx + X * 0.06, hy); ctx.lineTo(vx + X * 1.05, H + 20 * u);
    }
    ctx.lineWidth = 1.5 * u;
    ctx.strokeStyle = lin(ctx, 0, hy, 0, H, [[0, rgba(th.grid, 0)], [0.35, rgba(th.grid, th.light ? 0.18 : 0.22)], [1, rgba(th.grid, th.light ? 0.32 : 0.42)]]);
    ctx.stroke();
    const N = 13, roll = frac(t * 0.42);
    const hlin = (s, a, w, c) => {
      const y = hy + (H - hy) * Math.pow(s, 2.3);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y);
      ctx.lineWidth = w; ctx.strokeStyle = lin(ctx, 0, 0, W, 0, [[0, rgba(th.g2, a * 0.35)], [0.5, rgba(c, a)], [1, rgba(th.g2, a * 0.35)]]);
      ctx.stroke();
    };
    for (let k = 0; k < N; k++) { const s = (k + roll) / N; hlin(s, Math.pow(s, 1.1) * (th.light ? 0.3 : 0.42), 1.5 * u, th.grid); }
    // A scan wave rolls down the floor every few seconds; the scene change sends a brighter one.
    ctx.globalCompositeOperation = th.add;
    const wv = frac(t / 3.4);
    hlin(wv, (1 - wv) * 0.7, 3 * u, th.acc);
    if (surge > 0 && surge < 1) hlin(eo(surge), (1 - surge) * 1.0, 5 * u, mix(th.acc, WHITE, 0.4));
    ctx.restore();
    // Horizon line.
    ctx.beginPath(); ctx.moveTo(0, hy); ctx.lineTo(W, hy);
    neon(ctx, th, lin(ctx, 0, 0, W, 0, [[0, rgba(th.g2, 0)], [0.5, rgba(th.acc, 0.85)], [1, rgba(th.g2, 0)]]), 2 * u, th.acc, u, 1);
    // Rising motes.
    D.motes.forEach((m, i) => {
      const life = frac(t * m.sp + m.p);
      const x = frac(m.x - cam / (W * 2.2)) * W * 1.2 - W * 0.1 + Math.sin(t * 0.7 + i) * 14 * u;
      const y = H * 1.02 - life * H * 0.95;
      glowDot(ctx, th, x, y, m.s, cols[m.c], Math.sin(Math.PI * life) * 0.55);
    });
    ctx.restore();
  }

  // The scene change: a true wipe. A vertical light bar scans left to right in reading order; the
  // incoming layout is revealed behind it (left), the outgoing one stays ahead of it (right), with data
  // streaks trailing. It starts fast, so the headline corner is cleared of the old drawing first.
  const wipeEase = (k) => { k = clamp(k); const a = 1 - Math.pow(1 - k, 2.4); return a * 0.85 + eio(k) * 0.15; };
  const wipeX = (S, k) => -S.W * 0.03 + S.W * 1.06 * wipeEase(k);
  function clipSide(ctx, S, x, side) {
    ctx.beginPath();
    if (side === "in") ctx.rect(-S.W, -S.H, x + S.W, S.H * 3); else ctx.rect(x, -S.H, S.W * 2, S.H * 3);
    ctx.clip();
  }
  function sweep(ctx, S, th, k, x) {
    if (k <= 0 || k >= 1) return;
    const H = S.H, u = S.u, D = worldData(S), a = 0.65 + 0.35 * Math.sin(Math.PI * k);
    ctx.save();
    ctx.globalCompositeOperation = th.add;
    const bl = 70 * u, br = 380 * u;
    ctx.fillStyle = lin(ctx, x + bl, 0, x - br, 0, [[0, rgba(th.acc, 0)], [bl / (bl + br), rgba(th.acc, 0.42 * a)], [bl / (bl + br) + 0.06, rgba(th.g2, 0.2 * a)], [1, rgba(th.g2, 0)]]);
    ctx.fillRect(x - br, 0, bl + br, H);
    ctx.fillStyle = `rgba(255,255,255,${(th.light ? 0.55 : 0.9) * a})`;
    ctx.fillRect(x - 2 * u, 0, 4 * u, H);
    D.streaks.forEach((s) => {
      const y = s.y * H, x0 = x - s.o * u * 0.25, len = s.l * u * 1.2;
      ctx.fillStyle = lin(ctx, x0, 0, x0 - len, 0, [[0, rgba(mix(th.acc, WHITE, 0.4), 0.8 * a * s.a)], [1, rgba(th.g2, 0)]]);
      ctx.fillRect(x0 - len, y, len, 2.4 * u);
    });
    ctx.restore();
  }

  // Finishing: bloom (thresholded, two radii), the sweep, vignette and fine grain.
  function finish(ctx, S, th, t) {
    const W = S.W, H = S.H, u = S.u;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.filter = "none"; ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    if (CUR.wipe && S.paint) sweep(ctx, S, th, CUR.wipe.k, CUR.wipe.x);
    if (!th.light) {
      const k = 4, bw = Math.ceil(W / k), bh = Math.ceil(H / k);
      const B = buf("bloom", bw, bh), g = B.getContext("2d");
      g.clearRect(0, 0, bw, bh);
      g.filter = `saturate(0.35) brightness(0.8) contrast(3) blur(${(5 * u).toFixed(1)}px)`;
      g.drawImage(ctx.canvas, 0, 0, W, H, 0, 0, bw, bh);
      g.filter = "none";
      const B2 = buf("bloom2", Math.ceil(bw / 3), Math.ceil(bh / 3)), g2 = B2.getContext("2d");
      g2.clearRect(0, 0, B2.width, B2.height);
      g2.filter = `blur(${(4 * u).toFixed(1)}px)`;
      g2.drawImage(B, 0, 0, bw, bh, 0, 0, B2.width, B2.height);
      g2.filter = "none";
      const strength = 0.3 + 0.3 * th.tex;
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.55 * strength; ctx.drawImage(B, 0, 0, bw, bh, 0, 0, W, H);
      ctx.globalAlpha = 0.7 * strength; ctx.drawImage(B2, 0, 0, B2.width, B2.height, 0, 0, W, H);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    }
    if (S.paint && th.tex > 0) {
      const v = ctx.createRadialGradient(W / 2, H * 0.48, Math.min(W, H) * 0.35, W / 2, H * 0.5, Math.hypot(W, H) * 0.62);
      v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, th.light ? `rgba(70,80,170,${0.16 * th.tex})` : `rgba(2,3,16,${0.6 * th.tex})`);
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
      const np = ctx.createPattern(noise(), "repeat");
      const f = Math.floor(t * 24), r = rng(1000 + f);
      if (np.setTransform) np.setTransform(new DOMMatrix().translate(r() * 256, r() * 256).scale(Math.max(1, u * 1.2)));
      ctx.globalCompositeOperation = "overlay"; ctx.globalAlpha = (th.light ? 0.05 : 0.08) * th.tex;
      ctx.fillStyle = np; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  // ---- frame state shared by the stage and the drawers --------------------------------------------
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  const DEF = { title: 2.4, chart: 3.4, object: 3.6, people: 3.2, process: 3.6, compare: 3.2, closing: 2.4 };
  const CUR = { index: 0, scene: null, prev: null, wipe: null, finisher: "stage", change: 0.45 };
  const STAGED = { on: false };
  function controls() { return (window.__dreamcut && window.__dreamcut.controls) || {}; }
  function shownList() { const c = controls(); return ORDER.filter((id) => Number(c[id + "_hold"] ?? DEF[id]) > 0); }
  const XF = 1.6; // how many `change` lengths the glide lasts
  function camX(S, info) {
    const i = info.index;
    let pos = 0;
    if (i < 0) pos = Math.max(0, shownList().length - 1);
    else if (i > 0) pos = i - 1 + eio(clamp(info.local / Math.max(0.05, info.change * XF)));
    return pos * S.W * 0.5 + info.t * 16 * S.u;
  }
  // The very first scene focuses in (later scenes arrive through the wipe).
  function arriveFx(ctx, S, local) {
    const k = eo(clamp(local / 0.6)), blur = (1 - k) * 10;
    ctx.globalAlpha *= 0.45 + 0.55 * k;
    const s = 0.96 + 0.04 * k; ctx.translate(S.W / 2, S.H / 2); ctx.scale(s, s); ctx.translate(-S.W / 2, -S.H / 2);
    if (blur * S.u > 0.5) ctx.filter = `blur(${(blur * S.u).toFixed(1)}px)`;
  }
  // Inside a wipe: clip to this layout's side of the bar, with a little parallax.
  function wipeFx(ctx, S, w, side) {
    clipSide(ctx, S, w.x, side);
    const e = wipeEase(w.k);
    ctx.translate(side === "in" ? -(1 - e) * 60 * S.u : e * 40 * S.u, 0);
  }

  // ---- statements (title and closing) -------------------------------------------------------------
  const STMT = { title: 1, closing: 1 };
  // In a wide frame the statement sits in the upper part at a balanced width, leaving the right for
  // the emblem and the foot for the timeline. Applied every frame (idempotent) before measuring.
  function placeStatements(S) {
    const wide = !S.tall && S.W > S.H * 1.15;
    for (const id of ["title", "closing"]) {
      const el = document.getElementById(id), sc = document.getElementById(id + "-scene");
      if (!el || !sc) continue;
      const mw = wide ? Math.round(S.W * 0.56) + "px" : "";
      if (el.style.maxWidth !== mw) el.style.maxWidth = mw;
      const bt = wide ? Math.round(S.H * 0.31) + "px" : "";
      if (sc.style.bottom !== bt) sc.style.bottom = bt;
    }
  }
  const MEAS = {};
  function measure(S, id) {
    const el = document.getElementById(id);
    if (!el || !el.textContent) return null;
    const key = [id, el.textContent, el.style.fontSize, el.style.maxWidth, S.W, S.H].join("|");
    if (MEAS[key]) return MEAS[key];
    let w = el.offsetWidth || S.W * 0.6;
    let top = el.offsetTop, bottom = el.offsetTop + el.offsetHeight;
    if (id === "title") { const k = document.getElementById("kicker"); if (k && k.textContent) { top = Math.min(top, k.offsetTop); w = Math.max(w, k.offsetWidth); } }
    return (MEAS[key] = { x: el.offsetLeft, y: top, w, h: bottom - top });
  }
  function stLayout(S, R) {
    const u = S.u, W = S.W, H = S.H;
    if (!S.tall && W > H * 1.15) {
      const ex = R.x + R.w + 50 * u, right = W - ex - 50 * u;
      const r = clamp(Math.min(right * 0.4, H * 0.235), 110 * u, 260 * u);
      const T = { x: R.x, y: H - 330 * u, w: W - R.x * 2, h: 276 * u };
      return { wide: true, hero: { x: ex + right / 2, y: Math.max(r * 1.3 + 30 * u, Math.min(R.y + R.h / 2, T.y - r * 1.45)), r }, chipX: R.x, chipY: R.y + R.h + 56 * u, T };
    }
    const above = Math.max(200 * u, R.y - 30 * u);
    const r = clamp(Math.min(W * 0.3, above * 0.34), 80 * u, 290 * u);
    const chipY = R.y + R.h + 60 * u, below = H - (chipY + 50 * u);
    const th = Math.min(276 * u, below * 0.72);
    return { wide: false, hero: { x: W / 2, y: Math.max(above * 0.46 + 20 * u, r * 1.3), r }, chipX: R.x, chipY, T: { x: R.x, y: H - th - Math.max(70 * u, (below - th) * 0.42), w: W - R.x * 2, h: th } };
  }
  // The clips on the statement timeline name what the explainer covers: the next drawn scene's labels
  // on the title, the last drawn scene's labels on the closing.
  function stLabels(scene) {
    const c = controls(), shown = shownList(), i = shown.indexOf(scene);
    const other = scene === "title" ? shown.slice(i + 1).find((s) => !STMT[s]) : shown.slice(0, Math.max(0, i)).reverse().find((s) => !STMT[s]);
    const pick = { object: [c.callout_1, c.callout_2, c.callout_3], people: [c.badge_1, c.badge_2, c.badge_3], process: [c.step_1, c.step_2, c.step_3],
      chart: [c.bar_1_label, c.bar_2_label, c.bar_3_label], compare: [c.before_label, c.after_label] }[other] || [c.step_1, c.step_2, c.step_3];
    return pick.filter(Boolean).map(String).slice(0, 3);
  }
  const timecode = (t) => { const f = Math.floor(t * 24), p = (v) => String(v).padStart(2, "0"); return `00:${p(Math.floor(f / 1440) % 60)}:${p(Math.floor(f / 24) % 60)}:${p(f % 24)}`; };

  const SATS = ["clip", "wave", "sliders", "spark", "layers", "cursor"];
  // The emblem: a hologram on a floor pedestal. A large core node inside HUD rings, two tilted orbits
  // carrying satellite nodes wired to it, and a light cone rising from the pedestal.
  function hero(ctx, S, th, spot, t, local, closing, pop) {
    const u = S.u, { x, y, r } = spot;
    const ap = (i) => eo(seg(local, 0.05 + i * 0.1, 0.65 + i * 0.1));
    ctx.save();
    glowBlob(ctx, th, x, y, r * 2.1, th.g2, 0.34 * ap(0));
    // Pedestal and light cone.
    const py = y + r * 1.12, pq = ap(0.5);
    if (pq > 0) {
      ctx.save(); ctx.globalAlpha *= pq;
      ctx.save(); ctx.globalCompositeOperation = th.add;
      ctx.beginPath(); ctx.moveTo(x - r * 0.78, py); ctx.lineTo(x - r * 0.3, y); ctx.lineTo(x + r * 0.3, y); ctx.lineTo(x + r * 0.78, py); ctx.closePath();
      ctx.fillStyle = lin(ctx, 0, y, 0, py, [[0, rgba(th.acc, 0)], [1, rgba(th.acc, th.light ? 0.1 : 0.16)]]); ctx.fill();
      for (let k = 0; k < 4; k++) {
        const f = frac(t * 0.5 + k / 4), yy = py - f * (py - y), hw = r * (0.78 - 0.48 * f);
        ctx.beginPath(); ctx.moveTo(x - hw, yy); ctx.lineTo(x + hw, yy); ctx.lineWidth = 2 * u; ctx.strokeStyle = rgba(th.acc, 0.5 * (1 - f)); ctx.stroke();
      }
      ctx.restore();
      for (const [k, a] of [[1, 0.9], [1.25, 0.4]]) {
        ctx.beginPath(); ctx.ellipse(x, py, r * 0.8 * k, r * 0.15 * k, 0, 0, TAU);
        neon(ctx, th, rgba(k === 1 ? th.acc : th.g2, a), 2.2 * u, th.acc, u, 0.7);
      }
      const sa = t * 1.4;
      ctx.beginPath(); ctx.ellipse(x, py, r * 0.8, r * 0.15, 0, sa, sa + 0.9); ctx.lineWidth = 4 * u; ctx.lineCap = "round";
      ctx.strokeStyle = th.light ? rgba(th.acc) : "rgba(255,255,255,0.9)"; ctx.stroke();
      ctx.restore();
    }
    hudRing(ctx, S, th, x, y, r * 0.6, t, { a: ap(0) });
    const orbits = [{ rx: r * 1.12, ry: r * 0.38, rot: -0.3 }, { rx: r * 1.02, ry: r * 0.44, rot: 0.42 }];
    const opt = (o, a) => { const cx = Math.cos(a) * o.rx, cy = Math.sin(a) * o.ry; return [x + cx * Math.cos(o.rot) - cy * Math.sin(o.rot), y + cx * Math.sin(o.rot) + cy * Math.cos(o.rot)]; };
    orbits.forEach((o, k) => {
      const q = ap(1 + k);
      if (q <= 0) return;
      ctx.save(); ctx.translate(x, y); ctx.rotate(o.rot);
      ctx.beginPath(); ctx.ellipse(0, 0, o.rx, o.ry, 0, -Math.PI / 2, -Math.PI / 2 + TAU * q);
      ctx.setLineDash(k ? [3 * u, 11 * u] : []);
      neon(ctx, th, rgba(k ? th.g2 : th.acc, 0.75), 2 * u, k ? th.g2 : th.acc, u, 0.7);
      ctx.restore();
      if (q >= 1) for (let j = 0; j < 2; j++) { const a = t * (k ? -0.7 : 0.55) + k * 2 + j * Math.PI; const p = opt(o, a); glowDot(ctx, th, p[0], p[1], 6 * u, k ? th.g3 : th.acc); }
    });
    const sats = SATS.map((nm, i) => {
      const o = orbits[i % 2], a = (i / SATS.length) * TAU + t * (i % 2 ? -0.16 : 0.14);
      return { nm, i, p: opt(o, a), depth: Math.sin(a + (i % 2 ? 0.4 : -0.3)) };
    });
    const drawSat = (s) => {
      const q = ap(2 + s.i * 0.3);
      if (q <= 0) return;
      ctx.save(); ctx.globalAlpha *= 0.55 + 0.45 * (0.5 + 0.5 * s.depth);
      link(ctx, S, th, [s.p, [x, y]], seg(q, 0.3, 1) * 0.6, t, { n: 1, v: 140, w: 1.6, glow: 0.5, phase: s.i * 0.17, c1: s.i % 2 ? th.g2 : th.acc, c2: th.acc });
      node(ctx, S, th, s.p[0], s.p[1], r * (0.25 + 0.05 * s.depth), s.nm, { q, t, ph: s.i, c1: s.i % 3 === 2 ? th.g3 : s.i % 2 ? th.g2 : th.acc, c2: s.i % 2 ? th.acc : th.g2, lit: 0.45 });
      ctx.restore();
    };
    sats.filter((s) => s.depth < 0).forEach(drawSat);
    for (let k = 0; k < 3; k++) {
      const pr = frac(t * (closing ? 0.55 : 0.35) + k / 3);
      ctx.beginPath(); ctx.arc(x, y, r * (0.45 + pr * 0.85), 0, TAU);
      ctx.lineWidth = 2.2 * u; ctx.strokeStyle = rgba(th.acc, (1 - pr) * (closing ? 0.5 : 0.3) * ap(1)); ctx.stroke();
    }
    if (pop > 0) glowBlob(ctx, th, x, y, r * 1.4, mix(th.acc, WHITE, 0.3), 0.6 * pop);
    node(ctx, S, th, x, y, r * 0.68 * (1 + 0.08 * pop), closing ? "check" : "film", { q: ap(0), t, hot: true, lit: 1, lw: 3.6 });
    sats.filter((s) => s.depth >= 0).forEach(drawSat);
    ctx.restore();
  }

  // A full-width edit timeline: a ruler, three tracks of clips (one named clip each), and a playhead.
  // On the title the playhead keeps sweeping; on the closing it parks on the middle clip, the emblem's
  // check drops into that clip and a glow runs out along the timeline, approving every clip it reaches.
  function timeline(ctx, S, th, T, t, L, labels, closing) {
    const u = S.u, q = eo(seg(L, 0.0, 0.55));
    if (q <= 0) return null;
    const rh = 34 * u, gap = 12 * u, n = 3, trH = (T.h - rh - gap * n) / n;
    ctx.save();
    ctx.globalAlpha *= clamp(q * 1.6);
    // Panel.
    rr(ctx, T.x - 20 * u, T.y - 22 * u, T.w + 40 * u, T.h + 40 * u, 22 * u);
    ctx.fillStyle = th.light ? "rgba(255,255,255,0.82)" : rgba(mix(th.deep[0], th.g2, 0.06), 0.82); ctx.fill();
    rr(ctx, T.x - 20 * u, T.y - 22 * u, T.w + 40 * u, T.h + 40 * u, 22 * u);
    const per = 2 * (T.w + T.h + 80 * u);
    if (q < 1) ctx.setLineDash([per * q, per * 2]);
    neon(ctx, th, lin(ctx, T.x, 0, T.x + T.w, 0, [[0, rgba(th.g2, 0.8)], [0.5, rgba(th.acc, 0.9)], [1, rgba(th.g2, 0.8)]]), 1.8 * u, th.acc, u, 0.6);
    ctx.setLineDash([]);
    if (q >= 1) {
      const f = frac(t * 0.12);
      rr(ctx, T.x - 20 * u, T.y - 22 * u, T.w + 40 * u, T.h + 40 * u, 22 * u);
      ctx.setLineDash([per * 0.05, per * 2]); ctx.lineDashOffset = -per * f; ctx.lineWidth = 3 * u; ctx.lineCap = "round";
      ctx.strokeStyle = th.light ? rgba(th.acc) : "rgba(255,255,255,0.9)"; ctx.shadowColor = rgba(th.acc); ctx.shadowBlur = 14 * u; ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur = 0;
    }
    // Ruler.
    ctx.beginPath();
    for (let x = 0, i = 0; x <= T.w * q; x += 30 * u, i++) { const big = i % 5 === 0; ctx.moveTo(T.x + x, T.y + rh - 6 * u); ctx.lineTo(T.x + x, T.y + rh - 6 * u - (big ? 20 : 9) * u); }
    ctx.lineWidth = 1.6 * u; ctx.strokeStyle = rgba(th.grid, th.light ? 0.5 : 0.65); ctx.stroke();
    // Clips.
    const clips = [];
    const starts = [0.05, 0.29, 0.52];
    for (let i = 0; i < n; i++) {
      const ty = T.y + rh + gap + i * (trH + gap), label = labels[i] || "";
      ctx.font = font(S, 42 * u, 650);
      const cw = label ? Math.min(T.w * 0.66, Math.max(240 * u, ctx.measureText(label).width + 96 * u)) : T.w * 0.24;
      let x0 = T.x + T.w * starts[i];
      if (x0 + cw > T.x + T.w - 10 * u) x0 = Math.max(T.x + 10 * u, T.x + T.w - 10 * u - cw);
      const row = [];
      if (x0 - T.x - 22 * u > 30 * u) row.push({ x: T.x + 8 * u, w: x0 - T.x - 22 * u });
      row.push({ x: x0, w: cw, label, named: true });
      const after = x0 + cw + 14 * u, rest = T.x + T.w - 8 * u - after;
      if (rest > 380 * u) { row.push({ x: after, w: rest * 0.42 }); row.push({ x: after + rest * 0.42 + 14 * u, w: rest * 0.58 - 14 * u }); }
      else if (rest > 50 * u) row.push({ x: after, w: rest });
      ctx.beginPath(); rrSub(ctx, T.x, ty, T.w, trH, 10 * u); ctx.fillStyle = rgba(th.grid, th.light ? 0.06 : 0.08); ctx.fill();
      row.forEach((c, j) => { c.i = i; c.j = j; c.y = ty; c.h = trH; clips.push(c); });
    }
    // Playhead.
    const hotClip = clips.find((c) => c.i === 1 && c.named) || clips[0];
    const hotX = hotClip.x + hotClip.w * 0.5;
    let ph, snap = 0, wave = 0, landed = 0;
    if (!closing) ph = T.x + T.w * (0.04 + 0.92 * frac(L / 3.6));
    else {
      ph = T.x + T.w * 0.05 + (hotX - T.x - T.w * 0.05) * eio(seg(L, 0.45, 1.25));
      snap = seg(L, 1.25, 1.65); landed = L >= 1.65 ? 1 - seg(L, 1.65, 2.15) : 0; wave = eo(seg(L, 1.65, 2.45));
    }
    const reach = wave * T.w * 1.05;
    clips.forEach((c) => {
      const cq = eo(seg(L, 0.12 + c.i * 0.1 + c.j * 0.06, 0.62 + c.i * 0.1 + c.j * 0.06));
      if (cq <= 0) return;
      const w = c.w * cq, cx = c.x + c.w / 2;
      const ok = closing && wave > 0 ? clamp((reach - Math.abs(cx - hotX) + c.w * 0.5) / (90 * u)) : 0;
      const under = ph >= c.x && ph <= c.x + c.w;
      const hot = c === hotClip ? (closing ? 1 : under ? 1 : 0.35) : under ? 0.6 : 0;
      const base = c.i === 0 ? th.g2 : c.i === 1 ? mix(th.acc, th.g2, 0.35) : th.g3;
      const col = mix(base, th.acc, Math.max(ok, c === hotClip ? hot * 0.7 : 0));
      ctx.save();
      rr(ctx, c.x, c.y, w, c.h, 9 * u);
      ctx.fillStyle = rgba(col, (th.light ? 0.14 : 0.2) + 0.16 * hot + 0.06 * ok); ctx.fill();
      ctx.save(); ctx.clip();
      if (ok > 0.9 && wave >= 1) {
        // Approved clips keep a slow sheen passing through them.
        const sx = T.x - 200 * u + frac(t * 0.45) * (T.w + 400 * u);
        ctx.save(); ctx.globalCompositeOperation = th.add;
        ctx.fillStyle = lin(ctx, sx - 120 * u, 0, sx + 120 * u, 0, [[0, rgba(th.acc, 0)], [0.5, rgba(th.acc, th.light ? 0.12 : 0.2)], [1, rgba(th.acc, 0)]]);
        ctx.fillRect(c.x, c.y, w, c.h); ctx.restore();
      }
      if (c.i === 2 && !c.named) {
        ctx.beginPath();
        for (let xx = c.x + 10 * u, k = 0; xx < c.x + w - 6 * u; xx += 9 * u, k++) { const a = 0.2 + 0.8 * Math.abs(Math.sin(k * 0.8 + c.j) * Math.cos(k * 0.31 + t * 2.2)); ctx.moveTo(xx, c.y + c.h / 2 - a * c.h * 0.32); ctx.lineTo(xx, c.y + c.h / 2 + a * c.h * 0.32); }
        ctx.lineWidth = 3.2 * u; ctx.lineCap = "round"; ctx.strokeStyle = rgba(col, 0.75); ctx.stroke();
      } else if (!c.named) {
        ctx.beginPath(); for (let xx = c.x + 56 * u; xx < c.x + w; xx += 56 * u) { ctx.moveTo(xx, c.y + 8 * u); ctx.lineTo(xx, c.y + c.h - 8 * u); }
        ctx.lineWidth = 1.4 * u; ctx.strokeStyle = rgba(col, 0.45); ctx.stroke();
      }
      if (c.named && c.label) {
        ctx.save(); ctx.translate(c.x + 34 * u, c.y + c.h / 2);
        ctx.strokeStyle = rgba(mix(col, WHITE, th.light ? 0 : 0.35)); ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 2.6 * u; ctx.lineCap = "round"; ctx.lineJoin = "round";
        glyph(ctx, ok > 0.5 ? "check" : ["film", "spark", "wave"][c.i], 34 * u); ctx.restore();
        txt(ctx, S, th, c.label, c.x + 62 * u, c.y + c.h / 2 + 2 * u, 42 * u, { weight: 650, max: c.w - 80 * u, color: hot > 0.5 || ok > 0.5 ? undefined : th.inkS, grad: hot > 0.5 || ok > 0.5 });
      } else if (ok > 0.5 && w > 70 * u) {
        ctx.save(); ctx.translate(c.x + w - 30 * u, c.y + c.h / 2); ctx.strokeStyle = rgba(mix(th.acc, WHITE, 0.3)); ctx.lineWidth = 3 * u; ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.globalAlpha *= seg(ok, 0.5, 1); glyph(ctx, "check", 30 * u); ctx.restore();
      }
      ctx.restore();
      rr(ctx, c.x, c.y, w, c.h, 9 * u);
      neon(ctx, th, rgba(mix(col, WHITE, 0.1), 0.6 + 0.4 * Math.max(hot, ok)), (1.4 + 1.2 * Math.max(hot, ok)) * u, col, u, 0.4 + 0.8 * Math.max(hot, ok));
      ctx.restore();
    });
    // The approval glow running out along the ruler.
    if (wave > 0 && wave < 1) {
      ctx.save(); ctx.globalCompositeOperation = th.add;
      for (const s of [-1, 1]) {
        const fx = clamp(hotX + s * reach, T.x - 10 * u, T.x + T.w + 10 * u), a = 1 - wave, bw = 140 * u;
        ctx.fillStyle = lin(ctx, fx - s * bw, 0, fx + 0.01 * s, 0, [[0, rgba(th.acc, 0)], [1, rgba(th.acc, 0.22 * a)]]);
        ctx.fillRect(Math.min(fx, fx - s * bw), T.y - 6 * u, bw, T.h + 12 * u);
        ctx.fillStyle = `rgba(255,255,255,${(th.light ? 0.5 : 0.8) * a})`; ctx.fillRect(fx - 1.5 * u, T.y - 6 * u, 3 * u, T.h + 12 * u);
        glowDot(ctx, th, clamp(fx, T.x, T.x + T.w), T.y + rh / 2, 9 * u, th.acc, a);
      }
      ctx.restore();
    }
    if (landed > 0) { glowBlob(ctx, th, hotX, hotClip.y + hotClip.h / 2, 260 * u, mix(th.acc, WHITE, 0.3), 0.7 * landed); }
    // Playhead.
    ctx.beginPath(); ctx.moveTo(ph, T.y - 14 * u); ctx.lineTo(ph, T.y + T.h + 10 * u);
    neon(ctx, th, rgba(mix(th.acc, WHITE, 0.35)), 2.6 * u, th.acc, u, 1.2);
    ctx.beginPath(); ctx.moveTo(ph - 15 * u, T.y - 40 * u); ctx.lineTo(ph + 15 * u, T.y - 40 * u); ctx.lineTo(ph + 15 * u, T.y - 22 * u); ctx.lineTo(ph, T.y - 8 * u); ctx.lineTo(ph - 15 * u, T.y - 22 * u); ctx.closePath();
    ctx.fillStyle = rgba(th.acc); if (!th.light) { ctx.shadowColor = rgba(th.acc); ctx.shadowBlur = 16 * u; } ctx.fill(); ctx.shadowBlur = 0;
    ctx.restore();
    return { hot: [hotX, hotClip.y + hotClip.h / 2], ph, snap };
  }

  function hudCorners(ctx, S, th, t, a) {
    const u = S.u, W = S.W, H = S.H, k = 56 * u, g = 34 * u;
    ctx.save(); ctx.globalAlpha *= a;
    ctx.beginPath();
    for (const [cx, cy, sx, sy] of [[g, g, 1, 1], [W - g, g, -1, 1], [W - g, H - g, -1, -1], [g, H - g, 1, -1]]) { ctx.moveTo(cx, cy + sy * k); ctx.lineTo(cx, cy); ctx.lineTo(cx + sx * k, cy); }
    ctx.lineWidth = 2.2 * u; ctx.strokeStyle = rgba(th.acc, 0.45 + 0.2 * Math.sin(t * 2.4)); ctx.stroke();
    ctx.restore();
  }

  function statementArt(ctx, S, th, scene, t, local) {
    const R = measure(S, scene);
    if (!R) return;
    const u = S.u, closing = scene === "closing", L = local + 0.5;
    const Y = stLayout(S, R);
    hudCorners(ctx, S, th, t, eo(seg(L, 0.1, 0.6)));
    const labels = stLabels(scene);
    // Snap: the emblem's check drops into the parked clip (closing only); the core flares as it leaves.
    const snapP = closing ? seg(L, 1.25, 1.65) : 0;
    hero(ctx, S, th, Y.hero, t, L, closing, closing ? Math.sin(Math.PI * clamp(snapP * 2)) * (snapP > 0 ? 1 : 0) : 0);
    // Sub-line: status chips under the headline.
    const cq = eo(seg(L, 0.3, 0.85));
    if (cq > 0) {
      const r1 = pill(ctx, S, th, closing ? "FINAL" : "LIVE", Y.chipX, Y.chipY, 42 * u, { q: cq, hot: true, t, dotC: closing ? th.acc : th.g3, blink: 6 });
      if (r1) pill(ctx, S, th, timecode(t), r1.x + r1.w + 22 * u, Y.chipY, 42 * u, { q: cq, t, fam: "mono", weight: 600, dot: false });
    }
    const tl = timeline(ctx, S, th, Y.T, t, L, labels, closing);
    if (closing && tl && snapP > 0 && snapP < 1) {
      const a = [Y.hero.x, Y.hero.y], b = tl.hot, k = eio(snapP);
      const c = [(a[0] + b[0]) / 2, Math.min(a[1], b[1]) - 60 * u];
      const at = (f) => [(1 - f) * (1 - f) * a[0] + 2 * (1 - f) * f * c[0] + f * f * b[0], (1 - f) * (1 - f) * a[1] + 2 * (1 - f) * f * c[1] + f * f * b[1]];
      for (let j = 1; j <= 8; j++) { const p = at(Math.max(0, k - j * 0.035)); glowDot(ctx, th, p[0], p[1], (7 - j * 0.6) * u, th.acc, 0.8 - j * 0.08); }
      const p = at(k);
      node(ctx, S, th, p[0], p[1], (110 - 44 * k) * u, "check", { q: 1, t, hot: true, lit: 1 });
    }
  }

  // ---- scene layouts ------------------------------------------------------------------------------
  function area(S, box) {
    const u = S.u;
    return S.tall ? { x: box.x, y: box.y - 50 * u, w: box.w, h: box.h + 90 * u } : { x: box.x - 20 * u, y: box.y - 40 * u, w: box.w + 40 * u, h: box.h + 50 * u };
  }

  // Chart: a readout card. LED-cell columns rise; the highlighted one is wired to a large readout.
  function chartScene(ctx, S, th, A, b, d, t) {
    const u = S.u, tall = S.tall;
    const vals = d.values.map((v) => Number(v) || 0), n = vals.length;
    const max = Math.max(1, ...vals.map(Math.abs));
    const hi = clamp(Number.isFinite(d.highlight) ? d.highlight : n - 1, 0, n - 1);
    card(ctx, S, th, A.x, A.y, A.w, A.h, { q: eo(b * 2.6 + 0.25), t, phase: 0.05 });
    const R = tall ? { x: A.x + 56 * u, y: A.y + 50 * u, w: A.w - 112 * u, h: A.h * 0.3 } : { x: A.x + 64 * u, y: A.y + 56 * u, w: A.w * 0.29, h: A.h - 112 * u };
    const Z = tall ? { x: A.x + 40 * u, y: A.y + A.h * 0.36, w: A.w - 80 * u, h: A.h * 0.6 } : { x: A.x + A.w * 0.37, y: A.y + 36 * u, w: A.w * 0.6, h: A.h - 72 * u };
    const base = Z.y + Z.h - 84 * u, topY = Z.y + 104 * u, maxH = base - topY;
    const slot = Z.w / n, bw = Math.min(slot * 0.5, 160 * u);
    const pitch = 30 * u, cell = 22 * u, cellsMax = Math.max(1, Math.floor(maxH / pitch));
    const cq = vals.map((_, i) => stg(seg(b, 0.12, 1), i, n, 0.45));
    // Divider between readout and columns.
    const dq = eo(seg(b, 0.05, 0.5));
    ctx.save(); ctx.globalAlpha *= dq;
    ctx.beginPath();
    if (tall) { const yy = A.y + A.h * 0.335; ctx.moveTo(A.x + 40 * u, yy); ctx.lineTo(A.x + 40 * u + (A.w - 80 * u) * dq, yy); }
    else { const xx = A.x + A.w * 0.345; ctx.moveTo(xx, A.y + 40 * u); ctx.lineTo(xx, A.y + 40 * u + (A.h - 80 * u) * dq); }
    ctx.setLineDash([2 * u, 10 * u]); ctx.lineWidth = 2.4 * u; ctx.lineCap = "round"; ctx.strokeStyle = rgba(th.acc, 0.45); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    // Guide lines.
    ctx.save(); ctx.globalAlpha *= eo(seg(b, 0.05, 0.4));
    ctx.beginPath();
    for (let g = 1; g <= 4; g++) { const y = base - (maxH * g) / 4; ctx.moveTo(Z.x, y); ctx.lineTo(Z.x + Z.w, y); }
    ctx.setLineDash([6 * u, 10 * u]); ctx.lineWidth = 1.2 * u; ctx.strokeStyle = rgba(th.grid, 0.3); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(Z.x, base + 8 * u); ctx.lineTo(Z.x + Z.w, base + 8 * u);
    neon(ctx, th, rgba(th.grid, 0.8), 1.6 * u, th.grid, u, 0.4);
    ctx.restore();
    // Wire from the readout to the highlighted column's foot (behind the columns).
    const hx = Z.x + slot * (hi + 0.5);
    const numY = tall ? R.y + R.h * 0.58 : R.y + R.h * 0.44;
    const wq = seg(b, 0.55, 0.9);
    if (wq > 0) {
      const fy = base + 26 * u;
      const P = tall
        ? chamfer([[R.x + R.w, numY], [A.x + A.w - 22 * u, numY], [A.x + A.w - 22 * u, fy], [hx, fy], [hx, base + 10 * u]], 22 * u)
        : chamfer([[R.x + R.w + 12 * u, numY], [A.x + A.w * 0.345, numY], [A.x + A.w * 0.345, fy], [hx, fy], [hx, base + 10 * u]], 22 * u);
      link(ctx, S, th, P, wq, t, { n: 2, v: 340 });
    }
    // Columns of LED cells. A playhead beam keeps sweeping the columns and energy packets keep
    // climbing them, so the hold never freezes.
    const scanX = Z.x - 30 * u + frac(t * 0.36) * (Z.w + 60 * u);
    const settled = seg(b, 0.6, 1);
    const colText = [];
    vals.forEach((v, i) => {
      const q = cq[i];
      const cx = Z.x + slot * (i + 0.5), x0 = cx - bw / 2, hot = i === hi;
      ctx.save();
      ctx.globalAlpha *= 0.35 + 0.65 * eo(seg(b, 0, 0.3));
      for (let k = 0; k < cellsMax; k++) { rr(ctx, x0, base - k * pitch - cell, bw, cell, 5 * u); ctx.fillStyle = rgba(th.grid, th.light ? 0.07 : 0.08); ctx.fill(); }
      ctx.restore();
      if (q <= 0) return;
      const lit = (Math.abs(v) / max) * cellsMax * q;
      const near = Math.max(0, 1 - Math.abs(cx - scanX) / (slot * 0.7));
      for (let k = 0; k < Math.ceil(lit); k++) {
        const part = clamp(lit - k), f = k / cellsMax;
        const c = hot ? mix(th.acc, th.g2, f * 0.9) : mix(th.g2, th.grid, 0.3 + f * 0.3);
        const y = base - k * pitch - cell;
        ctx.save();
        ctx.globalAlpha *= part * (hot ? 1 : 0.62);
        rr(ctx, x0, y, bw, cell, 5 * u);
        ctx.fillStyle = rgba(c, hot ? 0.95 : 0.85);
        if (!th.light && hot) { ctx.shadowColor = rgba(c, 0.9); ctx.shadowBlur = 16 * u; }
        ctx.fill(); ctx.shadowBlur = 0;
        const per = hot ? 1.15 : 2.3, pk = frac(t / per + i * 0.29) * (Math.ceil(lit) + 3);
        const pkt = Math.max(0, 1 - Math.abs(pk - k) / 1.4) * (hot ? 0.75 : 0.4);
        const fl = near * (0.5 + 0.3 * Math.sin(t * 11 + k * 1.7)) + pkt;
        if (fl > 0.02) { ctx.globalCompositeOperation = th.add; ctx.fillStyle = `rgba(255,255,255,${fl * (th.light ? 0.35 : 0.5)})`; ctx.fill(); }
        ctx.restore();
      }
      const top = base - lit * pitch;
      if (hot && q > 0.5) {
        // Sparks rising off the hot column.
        for (let k = 0; k < 9; k++) {
          const f = frac(t * 0.45 + k / 9), sy = top - 90 * u - f * Math.max(40 * u, top - 90 * u - Z.y + 30 * u);
          glowDot(ctx, th, cx + Math.sin(k * 2.3 + t * 1.3) * bw * 0.32, sy, (2.5 + (k % 3)) * u, k % 2 ? th.acc : th.g2, Math.sin(Math.PI * f) * 0.9);
        }
      }
      const capFl = hot ? Math.pow(1 - frac(t / 1.15 + i * 0.29 + 0.1), 3) : 0;
      if (capFl > 0.02 && q > 0.9) glowBlob(ctx, th, cx, top, bw * 1.3, mix(th.acc, WHITE, 0.3), 0.5 * capFl);
      ctx.beginPath(); ctx.moveTo(x0 - 6 * u - capFl * 10 * u, top - 4 * u); ctx.lineTo(x0 + bw + 6 * u + capFl * 10 * u, top - 4 * u);
      neon(ctx, th, rgba(hot ? th.acc : th.g2, hot ? 1 : 0.7), (2.4 + capFl * 2) * u, hot ? th.acc : th.g2, u, hot ? 1.2 + capFl : 0.5);
      colText.push(() => {
        txt(ctx, S, th, fmtN(v * q, v, d.prefix, d.suffix), cx, top - (hot ? 50 : 44) * u, (hot ? 60 : 50) * u, { align: "center", fam: "figures", weight: hot ? 800 : 700, color: th.inkS, glow: hot ? 16 : 0, glowC: th.acc, max: slot - 8 * u });
        txt(ctx, S, th, d.labels[i] || "", cx, base + 56 * u, 42 * u, { align: "center", color: hot ? th.inkS : th.muted, weight: hot ? 700 : 600, max: slot - 12 * u });
      });
    });
    // The playhead beam over the columns.
    {
      const a = 0.35 + 0.65 * eo(seg(b, 0.3, 0.7));
      ctx.save(); ctx.globalAlpha *= a;
      ctx.save(); ctx.globalCompositeOperation = th.add;
      ctx.fillStyle = lin(ctx, scanX - 70 * u, 0, scanX + 70 * u, 0, [[0, rgba(th.acc, 0)], [0.5, rgba(th.acc, th.light ? 0.1 : 0.16)], [1, rgba(th.acc, 0)]]);
      ctx.fillRect(scanX - 70 * u, topY - 70 * u, 140 * u, base - topY + 84 * u);
      ctx.restore();
      if (scanX > Z.x - 10 * u && scanX < Z.x + Z.w + 10 * u) {
        ctx.beginPath(); ctx.moveTo(scanX, topY - 56 * u); ctx.lineTo(scanX, base + 14 * u);
        neon(ctx, th, rgba(mix(th.acc, WHITE, 0.35)), 2.4 * u, th.acc, u, 1.1);
        ctx.beginPath(); ctx.moveTo(scanX - 13 * u, topY - 80 * u); ctx.lineTo(scanX + 13 * u, topY - 80 * u); ctx.lineTo(scanX + 13 * u, topY - 64 * u); ctx.lineTo(scanX, topY - 52 * u); ctx.lineTo(scanX - 13 * u, topY - 64 * u); ctx.closePath();
        ctx.fillStyle = rgba(th.acc); ctx.fill();
      }
      ctx.restore();
    }
    colText.forEach((f) => f());
    // Readout: label capsule, big number counting with the hot column, and a trend trace.
    const hv = vals[hi], hq = cq[hi];
    const rq = eo(seg(b, 0.08, 0.45));
    pill(ctx, S, th, d.labels[hi] || "", R.x, tall ? R.y + 40 * u : R.y + 46 * u, 44 * u, { q: rq, hot: true, t, max: R.w });
    const big = tall ? 150 * u : 170 * u;
    ctx.save(); ctx.globalAlpha *= rq;
    const beat = Math.pow(1 - frac(t / 1.15 + hi * 0.29 + 0.1), 3) * settled;
    const nw = txt(ctx, S, th, fmtN(hv * Math.max(hq, 0.0001), hv, d.prefix, d.suffix), R.x - 4 * u, numY, big, { fam: "figures", weight: 800, grad: true, glow: 14 + 26 * beat, max: R.w * (tall ? 0.62 : 1), min: 96 * u });
    if (beat > 0.05) { ctx.save(); ctx.globalAlpha *= 0.5 * beat; ctx.beginPath(); ctx.moveTo(R.x, numY + big * 0.5); ctx.lineTo(R.x + nw * (0.4 + 0.6 * (1 - beat)), numY + big * 0.5); neon(ctx, th, rgba(th.acc), 3 * u, th.acc, u, 1); ctx.restore(); }
    ctx.restore();
    // Change from the previous bar, beside the number when it fits.
    const pv = vals[hi - 1];
    if (hi > 0 && pv) {
      const pct = Math.round(((hv - pv) / Math.abs(pv)) * 100), label = (pct > 0 ? "+" : pct < 0 ? "−" : "") + Math.abs(pct) + "%";
      const PR = pillRect(ctx, S, label, R.x + nw + 26 * u, numY, 42 * u, {});
      if (PR.x + PR.w < (tall ? R.x + R.w * 0.64 : R.x + R.w)) pill(ctx, S, th, label, PR.x, numY - big * 0.02, 42 * u, { q: seg(b, 0.6, 0.85), hot: true, t });
    }
    const T = tall ? { x: R.x + R.w * 0.66, y: R.y + R.h * 0.2, w: R.w * 0.34, h: R.h * 0.6 } : { x: R.x + 8 * u, y: R.y + R.h * 0.72, w: R.w * 0.9, h: R.h * 0.24 };
    const tq = eo(seg(b, 0.25, 0.85));
    if (tq > 0) {
      const pts = vals.map((v, i) => [T.x + (T.w * i) / Math.max(1, n - 1), T.y + T.h - (T.h * (Math.abs(v) / max)) * 0.9]);
      ctx.save(); ctx.globalAlpha *= tq;
      ctx.beginPath(); ctx.moveTo(pts[0][0], T.y + T.h); pts.forEach((p) => ctx.lineTo(p[0], p[1])); ctx.lineTo(pts[n - 1][0], T.y + T.h); ctx.closePath();
      ctx.fillStyle = lin(ctx, 0, T.y, 0, T.y + T.h, [[0, rgba(th.acc, 0.28)], [1, rgba(th.g2, 0)]]); ctx.fill();
      ctx.restore();
      link(ctx, S, th, pts, tq, t, { n: 1, v: 200, w: 2.6 });
      const hp = pts[hi];
      if (tq > 0.95) { glowDot(ctx, th, hp[0], hp[1], 8 * u, th.acc); ctx.beginPath(); ctx.arc(hp[0], hp[1], 16 * u + 6 * u * Math.sin(t * 4), 0, TAU); ctx.lineWidth = 2 * u; ctx.strokeStyle = rgba(th.acc, 0.6); ctx.stroke(); }
    }
  }

  // Object: a wireframe laptop or phone running a tiny editor, with three wired callouts.
  function screenUI(ctx, S, th, I, phone, b, t, beat) {
    const { land = 0, swap = 0, flash = 0 } = beat || {};
    const u = S.u, gap = (phone ? 12 : 14) * u;
    const P = phone ? { x: I.x, y: I.y, w: I.w, h: I.h * 0.4 } : { x: I.x, y: I.y, w: I.w * 0.66, h: I.h * 0.56 };
    const Q = phone ? { x: I.x, y: P.y + P.h + gap, w: I.w, h: I.h * 0.18 } : { x: P.x + P.w + gap, y: I.y, w: I.w - P.w - gap, h: P.h };
    const T = phone ? { x: I.x, y: Q.y + Q.h + gap, w: I.w, h: I.y + I.h - (Q.y + Q.h + gap) } : { x: I.x, y: P.y + P.h + gap, w: I.w, h: I.h - P.h - gap };
    const pq = eo(seg(b, 0.05, 0.4));
    // Preview: a glowing sun over wire ridges, sliding slowly. When the proposed clip lands, a scan
    // line wipes the preview over to the new version (cooler sky, a risen sun, a star field).
    const sx = P.x + P.w * 0.62, sy = P.y + P.h * 0.5;
    const preview = (v) => {
      rr(ctx, P.x, P.y, P.w, P.h, 10 * u);
      const top = v ? mix(th.deep[0], th.acc, 0.32) : mix(th.deep[0], th.g2, 0.3);
      ctx.fillStyle = th.light ? lin(ctx, 0, P.y, 0, P.y + P.h, [[0, rgba(mix(WHITE, v ? th.acc : th.g2, 0.12))], [1, rgba(mix(WHITE, th.acc, 0.1))]]) : lin(ctx, 0, P.y, 0, P.y + P.h, [[0, rgba(top)], [1, rgba(th.deep[1])]]);
      ctx.fill();
      const cy = sy - (v ? P.h * 0.12 : 0), sr = P.h * (0.22 + 0.015 * Math.sin(t * 2)), sc = v ? th.acc : th.g3;
      if (v) for (let k = 0; k < 14; k++) { const xx = P.x + ((k * 0.37) % 1) * P.w, yy = P.y + ((k * 0.61) % 0.55) * P.h; glowDot(ctx, th, xx, yy, (1.6 + (k % 3)) * u, WHITE, 0.4 + 0.4 * Math.sin(t * 3 + k)); }
      glowBlob(ctx, th, sx, cy, sr * 3, sc, 0.35);
      ctx.beginPath(); ctx.arc(sx, cy, sr, 0, TAU);
      ctx.fillStyle = lin(ctx, 0, cy - sr, 0, cy + sr, [[0, rgba(mix(v ? th.g3 : th.acc, WHITE, 0.3))], [1, rgba(sc)]]); ctx.fill();
      for (let k = 0; k < 4; k++) { ctx.fillStyle = th.light ? "rgba(255,255,255,0.8)" : rgba(th.deep[1], 0.9); ctx.fillRect(sx - sr, cy + sr * (0.15 + k * 0.22), sr * 2, sr * 0.08 + k * 1.5 * u); }
      for (let layer = 0; layer < 2; layer++) {
        const off = frac(t * (0.02 + layer * 0.015)) * P.w;
        ctx.beginPath();
        for (let k = -1; k <= 6; k++) {
          const bx = P.x - off + k * P.w * 0.36;
          const hgt = P.h * (layer ? 0.3 : 0.42) * (0.7 + 0.3 * ((k * 7 + layer * 3) % 5) / 4);
          ctx.moveTo(bx, P.y + P.h); ctx.lineTo(bx + P.w * 0.18, P.y + P.h - hgt); ctx.lineTo(bx + P.w * 0.36, P.y + P.h);
        }
        if (layer) { ctx.fillStyle = th.light ? "rgba(255,255,255,0.7)" : rgba(th.deep[1], 0.85); ctx.fill(); }
        const lc = v ? (layer ? th.g3 : th.acc) : layer ? th.acc : th.g2;
        neon(ctx, th, rgba(lc, 0.9), 1.6 * u, lc, u, 0.6);
      }
    };
    ctx.save(); ctx.globalAlpha *= pq;
    rr(ctx, P.x, P.y, P.w, P.h, 10 * u);
    ctx.save(); ctx.clip();
    preview(0);
    if (swap > 0) {
      const wx = P.x + P.w * swap;
      ctx.save(); ctx.beginPath(); ctx.rect(P.x, P.y, wx - P.x, P.h); ctx.clip(); preview(1); ctx.restore();
      if (swap < 1) { ctx.beginPath(); ctx.moveTo(wx, P.y); ctx.lineTo(wx, P.y + P.h); neon(ctx, th, rgba(mix(th.acc, WHITE, 0.4)), 3 * u, th.acc, u, 1.2); }
    }
    ctx.restore();
    rr(ctx, P.x, P.y, P.w, P.h, 10 * u); ctx.lineWidth = (1.5 + 2 * flash) * u; ctx.strokeStyle = rgba(th.acc, 0.5 + 0.5 * flash); ctx.stroke();
    ctx.restore();
    // Inspector sliders, drifting.
    ctx.save(); ctx.globalAlpha *= eo(seg(b, 0.15, 0.5));
    rr(ctx, Q.x, Q.y, Q.w, Q.h, 10 * u); ctx.fillStyle = rgba(th.light ? th.g2 : th.deep[0], th.light ? 0.06 : 0.6); ctx.fill();
    ctx.lineWidth = 1.2 * u; ctx.strokeStyle = rgba(th.g2, 0.4); ctx.stroke();
    const rows = 3;
    for (let k = 0; k < rows; k++) {
      const yy = Q.y + (Q.h * (k + 0.5)) / rows, x0 = Q.x + Q.w * 0.12, x1 = Q.x + Q.w * 0.88;
      const f = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * (0.8 + k * 0.3) + k * 1.9));
      ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.lineWidth = 3 * u; ctx.lineCap = "round"; ctx.strokeStyle = rgba(th.grid, 0.35); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + (x1 - x0) * f, yy);
      neon(ctx, th, rgba(k === 1 ? th.acc : th.g2), 3 * u, k === 1 ? th.acc : th.g2, u, 0.6);
      glowDot(ctx, th, x0 + (x1 - x0) * f, yy, 4.5 * u, k === 1 ? th.acc : th.g2);
    }
    ctx.restore();
    // Timeline: three tracks; the proposed clip pulses; a playhead keeps crossing.
    ctx.save(); ctx.globalAlpha *= eo(seg(b, 0.1, 0.45));
    rr(ctx, T.x, T.y, T.w, T.h, 10 * u); ctx.fillStyle = rgba(th.light ? th.g2 : th.deep[0], th.light ? 0.05 : 0.55); ctx.fill();
    const th3 = T.h / 3, pad = th3 * 0.18;
    const lanes = [[[0.03, 0.26], [0.32, 0.3], [0.66, 0.3]], [[0.08, 0.2], [0.34, 0.28], [0.68, 0.24]], null];
    let anchors = [];
    lanes.forEach((clips, k) => {
      const ly = T.y + k * th3 + pad, lh = th3 - pad * 2;
      if (!clips) {
        // Audio lane: a waveform.
        const n = 46, wq = seg(b, 0.3, 0.7);
        ctx.beginPath();
        for (let i = 0; i < n * wq; i++) {
          const xx = T.x + T.w * (0.03 + (0.94 * i) / n), a = 0.25 + 0.75 * Math.abs(Math.sin(i * 0.9) * Math.cos(i * 0.37 + 1));
          ctx.moveTo(xx, ly + lh / 2 - (lh / 2) * a); ctx.lineTo(xx, ly + lh / 2 + (lh / 2) * a);
        }
        ctx.lineWidth = Math.max(2 * u, T.w / n * 0.4); ctx.lineCap = "round"; ctx.strokeStyle = rgba(th.g2, 0.85); ctx.stroke();
        anchors[2] = [T.x + T.w * 0.24, ly + lh / 2];
        return;
      }
      clips.forEach(([a, l], i) => {
        const q = seg(b, 0.18 + k * 0.08 + i * 0.07, 0.4 + k * 0.08 + i * 0.07);
        if (q <= 0) return;
        const hot = k === 1 && i === 1;
        const x = T.x + T.w * a, w = T.w * l * eo(q);
        if (hot) {
          // The open slot, dashed, waiting; the proposed clip hovers above it as a glowing card, then
          // drops into the lane and flashes as it lands.
          rr(ctx, x, ly, w, lh, 6 * u); ctx.fillStyle = rgba(th.acc, 0.06 + 0.06 * Math.sin(t * 5)); ctx.fill();
          rr(ctx, x, ly, w, lh, 6 * u); ctx.setLineDash([10 * u, 6 * u]); ctx.lineDashOffset = -t * 30 * u;
          ctx.lineWidth = 1.6 * u; ctx.strokeStyle = rgba(th.acc, 0.7 * (1 - land)); ctx.stroke(); ctx.setLineDash([]);
          const lift = (1 - land) * (lh * 1.9 + 8 * u * Math.sin(t * 3.1)), cy = ly - lift, sc = 1 + 0.12 * (1 - land);
          ctx.save(); ctx.translate(x + w / 2, cy + lh / 2); ctx.scale(sc, sc); ctx.translate(-(x + w / 2), -(cy + lh / 2));
          if (land < 1) { ctx.save(); ctx.globalAlpha *= 0.5 * (1 - land); ctx.beginPath(); ctx.moveTo(x + w / 2, cy + lh); ctx.lineTo(x + w / 2, ly); ctx.setLineDash([3 * u, 6 * u]); ctx.lineWidth = 2 * u; ctx.strokeStyle = rgba(th.acc); ctx.stroke(); ctx.restore(); }
          rr(ctx, x, cy, w, lh, 6 * u);
          ctx.fillStyle = rgba(mix(th.acc, WHITE, 0.4 * flash), 0.4 + 0.2 * land + 0.4 * flash); ctx.fill();
          rr(ctx, x, cy, w, lh, 6 * u);
          neon(ctx, th, rgba(mix(th.acc, WHITE, 0.3 * flash)), (2.2 + 1.5 * flash) * u, th.acc, u, 1.1 + flash);
          ctx.save(); ctx.translate(x + Math.min(w * 0.5, 26 * u), cy + lh / 2); ctx.strokeStyle = th.light ? rgba(th.acc) : "rgba(255,255,255,0.9)"; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 2.2 * u;
          glyph(ctx, land >= 1 ? "check" : "spark", Math.min(lh * 0.8, 30 * u)); ctx.restore();
          ctx.restore();
          if (flash > 0) glowBlob(ctx, th, x + w / 2, ly + lh / 2, w * 1.1, th.acc, 0.6 * flash);
          anchors[1] = [x + T.w * l * 0.5, cy + lh / 2];
          return;
        }
        rr(ctx, x, ly, w, lh, 6 * u);
        ctx.fillStyle = rgba(k ? th.g2 : mix(th.g2, th.acc, 0.4), th.light ? 0.16 : 0.22); ctx.fill();
        rr(ctx, x, ly, w, lh, 6 * u);
        neon(ctx, th, rgba(mix(th.g2, th.acc, 0.3), 0.75), 1.4 * u, th.g2, u, 0.4);
      });
    });
    const phx = T.x + T.w * frac(t * 0.12 + 0.1);
    ctx.beginPath(); ctx.moveTo(phx, T.y - 6 * u); ctx.lineTo(phx, T.y + T.h + 6 * u);
    neon(ctx, th, rgba(mix(th.acc, WHITE, 0.3)), 2 * u, th.acc, u, 1);
    ctx.beginPath(); ctx.moveTo(phx - 9 * u, T.y - 16 * u); ctx.lineTo(phx + 9 * u, T.y - 16 * u); ctx.lineTo(phx, T.y - 4 * u); ctx.closePath(); ctx.fillStyle = rgba(th.acc); ctx.fill();
    ctx.restore();
    anchors[0] = [sx, sy - (swap > 0.5 ? P.h * 0.12 : 0)];
    if (!anchors[1]) anchors[1] = [T.x + T.w * 0.48, T.y + th3 * 1.5];
    return anchors;
  }
  function objectScene(ctx, S, th, A, b, d, t, local, hold) {
    // Second beat: once the callouts are drawn, the proposed clip drops into its lane and the preview
    // updates to the new version.
    const b0 = Math.max(1.4, hold * 0.5);
    const beat = { land: eio(seg(local, b0, b0 + 0.5)), flash: local >= b0 + 0.5 ? 1 - seg(local, b0 + 0.5, b0 + 1.0) : 0, swap: eio(seg(local, b0 + 0.45, b0 + 1.05)) };
    const u = S.u, tall = S.tall, phone = d.kind === "phone";
    const D = tall ? { x: A.x, y: A.y, w: A.w, h: A.h * 0.54 } : { x: A.x + 10 * u, y: A.y, w: A.w * 0.58, h: A.h };
    const oq = eo(seg(b, 0, 0.45) + 0.2);
    let sx, sy, sw, sh, frame;
    if (phone) {
      const ph = D.h * 0.96, pw = Math.min(D.w * 0.8, ph * 0.5);
      frame = { x: D.x + (D.w - pw) / 2, y: D.y + (D.h - ph) / 2, w: pw, h: ph };
      sx = frame.x + 18 * u; sy = frame.y + 56 * u; sw = pw - 36 * u; sh = ph - 100 * u;
    } else {
      sw = Math.min(D.w * 0.96, D.h * 0.84 * 1.6); sh = sw / 1.6;
      frame = { x: D.x + (D.w - sw) / 2, y: D.y + (D.h - sh * 1.1) / 2, w: sw, h: sh };
      sx = frame.x + 22 * u; sy = frame.y + 22 * u; sw = frame.w - 44 * u; sh = frame.h - 44 * u;
    }
    glowBlob(ctx, th, frame.x + frame.w / 2, frame.y + frame.h / 2, Math.max(frame.w, frame.h) * 0.75, th.g2, 0.22 * oq);
    // Body.
    ctx.save();
    ctx.globalAlpha *= clamp(oq * 2);
    rr(ctx, frame.x, frame.y, frame.w, frame.h, (phone ? 46 : 20) * u);
    ctx.fillStyle = th.light ? "rgba(255,255,255,0.92)" : rgba(mix(th.deep[0], th.g2, 0.08), 0.95); ctx.fill();
    const per = 2 * (frame.w + frame.h);
    rr(ctx, frame.x, frame.y, frame.w, frame.h, (phone ? 46 : 20) * u);
    if (oq < 1) ctx.setLineDash([per * oq, per * 2]);
    neon(ctx, th, lin(ctx, frame.x, frame.y, frame.x + frame.w, frame.y + frame.h, [[0, rgba(th.acc)], [1, rgba(th.g2)]]), 2.6 * u, th.acc, u, 1);
    ctx.setLineDash([]);
    if (phone) {
      rr(ctx, frame.x + frame.w / 2 - 50 * u, frame.y + 20 * u, 100 * u, 20 * u, 10 * u); ctx.fillStyle = rgba(th.acc, 0.35); ctx.fill();
      ctx.beginPath(); ctx.moveTo(frame.x + frame.w / 2 - 60 * u, frame.y + frame.h - 22 * u); ctx.lineTo(frame.x + frame.w / 2 + 60 * u, frame.y + frame.h - 22 * u);
      ctx.lineWidth = 4 * u; ctx.lineCap = "round"; ctx.strokeStyle = rgba(th.acc, 0.5); ctx.stroke();
    } else {
      const by = frame.y + frame.h;
      ctx.beginPath(); ctx.moveTo(frame.x - frame.w * 0.08, by + frame.h * 0.075); ctx.lineTo(frame.x + frame.w * 1.08, by + frame.h * 0.075);
      ctx.lineTo(frame.x + frame.w, by); ctx.lineTo(frame.x, by); ctx.closePath();
      ctx.fillStyle = th.light ? "rgba(255,255,255,0.9)" : rgba(mix(th.deep[0], th.g2, 0.1), 0.95); ctx.fill();
      neon(ctx, th, lin(ctx, frame.x, by, frame.x + frame.w, by, [[0, rgba(th.g2)], [0.5, rgba(th.acc)], [1, rgba(th.g2)]]), 2.2 * u, th.acc, u, 0.8);
      ctx.beginPath(); ctx.moveTo(frame.x + frame.w * 0.42, by + 8 * u); ctx.lineTo(frame.x + frame.w * 0.58, by + 8 * u);
      ctx.lineWidth = 3 * u; ctx.strokeStyle = rgba(th.acc, 0.6); ctx.stroke();
      // Reflection glow on the floor under the laptop.
      glowBlob(ctx, th, frame.x + frame.w / 2, by + frame.h * 0.12, frame.w * 0.5, th.acc, 0.15);
    }
    ctx.restore();
    rr(ctx, sx, sy, sw, sh, 10 * u); ctx.fillStyle = th.light ? rgba(mix(WHITE, th.g2, 0.05)) : rgba(th.deep[1], 0.96); ctx.fill();
    const pad = (phone ? 10 : 16) * u;
    const anchors = screenUI(ctx, S, th, { x: sx + pad, y: sy + pad, w: sw - pad * 2, h: sh - pad * 2 }, phone, b, t, beat);
    // Callouts.
    const labels = d.callouts;
    labels.forEach((label, i) => {
      if (!label) return;
      const c = stg(seg(b, 0.3, 1), i, labels.length, 0.5);
      if (c <= 0) return;
      const a = anchors[i];
      let R, P;
      if (tall) {
        const py = D.y + D.h + 110 * u + i * 150 * u;
        R = pillRect(ctx, S, label, A.x + 10 * u, py, 46 * u, { max: A.w - 150 * u });
        const xr = A.x + A.w - 24 * u - i * 30 * u;
        P = [a, [xr - 30 * u, a[1]], [xr, a[1] + 30 * u], [xr, py - 30 * u], [xr - 30 * u, py], [R.x + R.w + 12 * u, py]];
      } else {
        const lx = A.x + A.w * 0.64, py = A.y + A.h * (0.17 + i * 0.33);
        R = pillRect(ctx, S, label, lx, py, 46 * u, { max: A.x + A.w - lx });
        P = trace(a, [lx - 14 * u, py], "x");
      }
      const lq = seg(c, 0, 0.7);
      // Target ring at the anchor.
      ctx.save(); ctx.globalAlpha *= clamp(c * 3);
      const pr = frac(t * 0.8 + i * 0.3);
      ctx.beginPath(); ctx.arc(a[0], a[1], (12 + pr * 22) * u, 0, TAU); ctx.lineWidth = 2 * u; ctx.strokeStyle = rgba(th.acc, (1 - pr) * 0.8); ctx.stroke();
      ctx.beginPath(); ctx.arc(a[0], a[1], 11 * u, 0, TAU); ctx.lineWidth = 2.4 * u; ctx.strokeStyle = rgba(th.acc); ctx.stroke();
      ctx.restore();
      link(ctx, S, th, P, lq, t, { n: 1, v: 260, phase: i * 0.3, w: 2.2 });
      const fl = i === 1 ? beat.flash : i === 0 ? Math.sin(Math.PI * beat.swap) : 0;
      if (fl > 0.02) glowBlob(ctx, th, R.x + R.w / 2, R.y + R.h / 2, R.w * 0.8, th.acc, 0.45 * fl);
      pill(ctx, S, th, label, R.x, R.y + R.h / 2, 46 * u, { q: seg(c, 0.55, 1), hot: i === 1 || fl > 0.3, t, max: tall ? A.w - 150 * u : A.x + A.w - R.x });
    });
  }

  // People: a project hub wired to original avatar nodes, each with a role capsule.
  function avatar(ctx, S, th, x, y, r, q, t, i, hot) {
    if (q <= 0.001) return;
    const u = S.u;
    ctx.save();
    y += Math.sin(t * 1.5 + i * 1.3) * 5 * u;
    const s = 0.5 + 0.5 * back(q);
    ctx.translate(x, y); ctx.scale(s, s);
    ctx.globalAlpha *= clamp(q * 2);
    const c1 = hot ? th.acc : [th.g2, th.g3, mix(th.acc, th.g2, 0.5)][i % 3], c2 = hot ? th.g2 : th.acc;
    glowBlob(ctx, th, 0, 0, r * (hot ? 2.1 : 1.6), c1, hot ? 0.38 : 0.2);
    if (hot) {
      for (let k = 0; k < 2; k++) { const pr = frac(t * 0.5 + k * 0.5); ctx.beginPath(); ctx.arc(0, 0, r * (1.05 + pr * 0.6), 0, TAU); ctx.lineWidth = 2 * u; ctx.strokeStyle = rgba(th.acc, (1 - pr) * 0.6); ctx.stroke(); }
      ctx.save(); ctx.rotate(t * 0.6); ctx.beginPath(); ctx.arc(0, 0, r * 1.28, 0, TAU); ctx.setLineDash([4 * u, 12 * u]); ctx.lineWidth = 2.4 * u; ctx.strokeStyle = rgba(th.acc, 0.8); ctx.stroke(); ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = th.light ? lin(ctx, 0, -r, 0, r, [[0, "#ffffff"], [1, rgba(mix(WHITE, c1, 0.1))]]) : lin(ctx, 0, -r, 0, r, [[0, rgba(mix(th.deep[0], c1, 0.2), 0.98)], [1, rgba(th.deep[1], 0.98)]]);
    ctx.fill();
    // The figure: head with a light visor, shoulders; a small varying detail per person.
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r - 2 * u, 0, TAU); ctx.clip();
    const gc = lin(ctx, -r, -r, r, r, th.light ? [[0, rgba(c1)], [1, rgba(c2)]] : [[0, rgba(mix(c1, WHITE, 0.3))], [1, rgba(mix(c2, WHITE, 0.2))]]);
    ctx.strokeStyle = gc; ctx.fillStyle = rgba(c1, th.light ? 0.12 : 0.18); ctx.lineWidth = Math.max(2 * u, r * 0.06); ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (!th.light) { ctx.shadowColor = rgba(c1); ctx.shadowBlur = 10 * u; }
    const hy = -r * 0.2, hr = r * 0.3;
    ctx.beginPath(); ctx.moveTo(-r * 0.62, r * 1.02); ctx.quadraticCurveTo(-r * 0.6, r * 0.28, 0, r * 0.26); ctx.quadraticCurveTo(r * 0.6, r * 0.28, r * 0.62, r * 1.02); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, hy, hr, 0, TAU); ctx.fill(); ctx.stroke();
    rr(ctx, -hr * 0.78, hy - hr * 0.22, hr * 1.56, hr * 0.36, hr * 0.18); ctx.fillStyle = rgba(hot ? th.acc : c1, 0.95); ctx.fill();
    const look = Math.sin(t * 0.9 + i * 2) * hr * 0.4;
    ctx.beginPath(); ctx.arc(look, hy - hr * 0.04, hr * 0.09, 0, TAU); ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.fill();
    ctx.beginPath();
    if (i % 3 === 0) { ctx.moveTo(hr * 0.5, hy - hr * 0.8); ctx.lineTo(hr * 0.8, hy - hr * 1.35); ctx.stroke(); ctx.beginPath(); ctx.arc(hr * 0.84, hy - hr * 1.45, hr * 0.13, 0, TAU); ctx.fillStyle = rgba(c1); ctx.fill(); }
    else if (i % 3 === 1) { ctx.arc(0, hy, hr * 1.22, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
    else { ctx.moveTo(-hr * 0.5, r * 0.5); ctx.lineTo(hr * 0.5, r * 0.5); ctx.moveTo(-hr * 0.3, r * 0.64); ctx.lineTo(hr * 0.3, r * 0.64); ctx.stroke(); }
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
    neon(ctx, th, lin(ctx, -r, -r, r, r, [[0, rgba(c1)], [1, rgba(c2)]]), (hot ? 3 : 2.2) * u, c1, u, hot ? 1.2 : 0.7);
    const a0 = t * 1.1 + i * 1.7;
    ctx.beginPath(); ctx.arc(0, 0, r, a0, a0 + 0.8); ctx.lineWidth = 3.4 * u; ctx.lineCap = "round"; ctx.strokeStyle = th.light ? rgba(th.acc) : "rgba(255,255,255,0.9)"; ctx.stroke();
    const blink = 0.5 + 0.5 * Math.sin(t * 3 + i * 2.2);
    glowDot(ctx, th, r * 0.72, r * 0.72, 5 * u, hot ? th.acc : th.g2, 0.5 + 0.5 * blink);
    ctx.restore();
  }
  function peopleScene(ctx, S, th, A, b, d, t) {
    const u = S.u, tall = S.tall;
    const n = clamp(Math.round(Number(d.count) || 4), 2, 6), hi = Math.min(n - 1, d.highlight ?? 1);
    const hub = tall ? [A.x + A.w / 2, A.y + A.h * 0.1] : [A.x + A.w / 2, A.y + A.h * 0.12];
    const hs = (tall ? 170 : 150) * u;
    const pos = [];
    let ar, slotW;
    if (!tall) {
      slotW = A.w / n; ar = Math.min(92 * u, slotW * 0.3);
      for (let i = 0; i < n; i++) { const k = n > 1 ? (i - (n - 1) / 2) / ((n - 1) / 2) : 0; pos.push([A.x + slotW * (i + 0.5), A.y + A.h * 0.53 - 46 * u * (1 - k * k)]); }
    } else {
      const cols = Math.min(3, n), rows = Math.ceil(n / cols);
      slotW = A.w / cols; ar = Math.min(rows === 1 ? 120 * u : 100 * u, slotW * 0.32);
      for (let i = 0; i < n; i++) { const r = Math.floor(i / cols), cnt = Math.min(cols, n - r * cols); pos.push([A.x + A.w / 2 + ((i % cols) - (cnt - 1) / 2) * slotW, A.y + A.h * (rows === 1 ? 0.48 : 0.38 + r * 0.3)]); }
    }
    const hq = eo(seg(b, 0, 0.3) + 0.3);
    // Hub rings.
    hudRing(ctx, S, th, hub[0], hub[1], hs * 0.78, t, { a: hq, ticks: 60, speed: 0.2 });
    const qs = pos.map((_, i) => stg(seg(b, 0.15, 1), i, n, 0.5));
    pos.forEach((p, i) => {
      const P = trace([hub[0], hub[1] + hs * 0.5 + 8 * u], [p[0], p[1] - ar - 18 * u], "y");
      link(ctx, S, th, P, seg(qs[i], 0, 0.6), t, { n: 1, v: 240, reverse: i % 2 === 1, phase: i * 0.21, c1: i === hi ? th.acc : th.g2, c2: th.acc, w: 2 });
    });
    node(ctx, S, th, hub[0], hub[1], hs, "film", { q: hq, t, hot: true, lit: 1, lw: 3 });
    // The shared cut everyone is reviewing: a track along the foot, one clip per person, with drop wires.
    const oneRow = tall && n <= 3;
    const sy = oneRow ? A.y + A.h * 0.74 : A.y + A.h - (tall ? 110 : 66) * u, sx = A.x + 30 * u, sw = A.w - 60 * u, shh = 56 * u;
    const tq = eo(seg(b, 0.35, 0.8));
    if (tq > 0) {
      ctx.save(); ctx.globalAlpha *= tq;
      rr(ctx, sx, sy - shh / 2, sw, shh, 14 * u); ctx.fillStyle = th.light ? "rgba(255,255,255,0.8)" : rgba(th.deep[0], 0.8); ctx.fill();
      rr(ctx, sx, sy - shh / 2, sw, shh, 14 * u); neon(ctx, th, rgba(th.grid, 0.8), 1.6 * u, th.grid, u, 0.4);
      pos.forEach((p, i) => {
        const hot = i === hi, cw = sw / n;
        const c = hot ? th.acc : [th.g2, th.g3, mix(th.acc, th.g2, 0.5)][i % 3];
        rr(ctx, sx + cw * i + 8 * u, sy - shh / 2 + 10 * u, (cw - 16 * u) * seg(tq, i * 0.1, 0.6 + i * 0.1), shh - 20 * u, 8 * u);
        ctx.fillStyle = rgba(c, hot ? 0.5 : 0.3); ctx.fill();
        ctx.lineWidth = 1.6 * u; ctx.strokeStyle = rgba(c, 0.9); ctx.stroke();
      });
      const phx = sx + sw * frac(t * 0.1 + 0.2);
      ctx.beginPath(); ctx.moveTo(phx, sy - shh / 2 - 12 * u); ctx.lineTo(phx, sy + shh / 2 + 12 * u);
      neon(ctx, th, rgba(mix(th.acc, WHITE, 0.3)), 2.4 * u, th.acc, u, 1);
      ctx.restore();
    }
    pos.forEach((p, i) => {
      const hot = i === hi;
      avatar(ctx, S, th, p[0], p[1], ar * (hot ? 1.14 : 1), seg(qs[i], 0.2, 1), t, i, hot);
      const named = d.badges.filter(Boolean);
      const ly = p[1] + ar * (hot ? 1.14 : 1) + 64 * u;
      if (i < named.length) pill(ctx, S, th, named[i], p[0], ly, 42 * u, { q: seg(qs[i], 0.4, 1), align: "center", hot, t, max: slotW - 16 * u });
      else eyeChip(ctx, S, th, p[0], ly, 34 * u, seg(qs[i], 0.4, 1), t, i);
    });
  }
  // An unnamed reviewer wears a round "watching" chip: a neon eye that scans and blinks.
  function eyeChip(ctx, S, th, x, y, r, q, t, i) {
    if (q <= 0.001) return;
    const u = S.u;
    ctx.save();
    ctx.globalAlpha *= clamp(q * 1.6);
    ctx.translate(x, y); ctx.scale(0.85 + 0.15 * eo(q), 0.85 + 0.15 * eo(q));
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = th.light ? "rgba(255,255,255,0.94)" : rgba(mix(th.deep[0], th.g2, 0.12), 0.92); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
    neon(ctx, th, lin(ctx, -r, -r, r, r, [[0, rgba(th.acc, 0.85)], [1, rgba(th.g2, 0.8)]]), 1.8 * u, th.acc, u, 0.6);
    const cyc = frac(t / 3.1 + i * 0.37), blink = 1 - 0.9 * Math.max(0, 1 - Math.abs(cyc - 0.92) * 22);
    const ew = r * 0.62, eh = r * 0.36 * blink;
    ctx.beginPath(); ctx.moveTo(-ew, 0); ctx.quadraticCurveTo(0, -eh * 1.6, ew, 0); ctx.quadraticCurveTo(0, eh * 1.6, -ew, 0);
    ctx.lineWidth = 2.6 * u; ctx.strokeStyle = rgba(mix(th.acc, WHITE, th.light ? 0 : 0.35)); ctx.lineJoin = "round";
    if (!th.light) { ctx.shadowColor = rgba(th.acc); ctx.shadowBlur = 10 * u; }
    ctx.stroke(); ctx.shadowBlur = 0;
    const look = Math.sin(t * 1.3 + i * 1.9) * ew * 0.4;
    if (blink > 0.4) glowDot(ctx, th, look, 0, r * 0.14, th.acc, blink);
    ctx.restore();
  }

  // Process: three icon nodes wired in a chain; a token of light travels it and lights each node.
  // Under each step a small live panel shows the step at work (reading, drafting, approving).
  function stepPanel(ctx, S, th, k, R, q, t, fl) {
    const u = S.u;
    card(ctx, S, th, R.x, R.y, R.w, R.h, { q, t, phase: 0.2 + k * 0.31, r: 18 * u, hot: k === 2, glow: 0.6 });
    if (q < 0.5) return;
    ctx.save();
    ctx.globalAlpha *= seg(q, 0.5, 1);
    rr(ctx, R.x, R.y, R.w, R.h, 18 * u); ctx.clip();
    const px = R.x + 28 * u, pw = R.w - 56 * u, py = R.y + 26 * u, ph = R.h - 52 * u;
    if (k === 0) {
      // Reading: rows of the cut with a scan beam passing down.
      const rows = 4, sy = py + frac(t * 0.42) * ph;
      for (let i = 0; i < rows; i++) {
        const y = py + (ph * (i + 0.5)) / rows, near = Math.max(0, 1 - Math.abs(y - sy) / (ph * 0.3));
        const segs = [[0, 0.22], [0.26, 0.4], [0.7, 0.3]].map(([a, l]) => [a + ((i * 0.07) % 0.1), l - ((i * 0.05) % 0.12)]);
        segs.forEach(([a, l]) => { rr(ctx, px + pw * a, y - 9 * u, pw * l, 18 * u, 6 * u); ctx.fillStyle = rgba(near > 0.2 ? th.acc : th.g2, 0.25 + 0.6 * near); ctx.fill(); });
      }
      ctx.beginPath(); ctx.moveTo(R.x, sy); ctx.lineTo(R.x + R.w, sy);
      neon(ctx, th, rgba(th.acc), 2 * u, th.acc, u, 1);
      ctx.save(); ctx.globalCompositeOperation = th.add;
      ctx.fillStyle = lin(ctx, 0, sy - 50 * u, 0, sy, [[0, rgba(th.acc, 0)], [1, rgba(th.acc, 0.22)]]); ctx.fillRect(R.x, sy - 50 * u, R.w, 50 * u);
      ctx.restore();
    } else if (k === 1) {
      // Drafting: a track of clips; a new clip slides into the open slot, again and again.
      const y = py + ph * 0.32, h = ph * 0.36;
      const clips = [[0, 0.2], [0.23, 0.17], [0.64, 0.15], [0.82, 0.18]];
      clips.forEach(([a, l]) => { rr(ctx, px + pw * a, y, pw * l, h, 7 * u); ctx.fillStyle = rgba(th.g2, 0.3); ctx.fill(); ctx.lineWidth = 1.5 * u; ctx.strokeStyle = rgba(th.g2, 0.7); ctx.stroke(); });
      const cyc = frac(t / 2.2), land = eio(seg(cyc, 0.05, 0.45)), fade = 1 - seg(cyc, 0.85, 1);
      const sx = px + pw * 0.43, sw = pw * 0.18;
      rr(ctx, sx, y, sw, h, 7 * u); ctx.setLineDash([6 * u, 6 * u]); ctx.lineWidth = 1.5 * u; ctx.strokeStyle = rgba(th.acc, 0.6); ctx.stroke(); ctx.setLineDash([]);
      ctx.save(); ctx.globalAlpha *= fade;
      const cy = y - (1 - land) * ph * 0.5;
      rr(ctx, sx, cy, sw, h, 7 * u); ctx.fillStyle = rgba(th.acc, 0.35 + 0.25 * land); ctx.fill();
      rr(ctx, sx, cy, sw, h, 7 * u); neon(ctx, th, rgba(th.acc), 2 * u, th.acc, u, 1);
      ctx.restore();
      ctx.save(); ctx.translate(sx + sw * 0.9, cy - 6 * u); ctx.strokeStyle = rgba(mix(th.acc, WHITE, 0.4)); ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 2.4 * u; ctx.globalAlpha *= fade * (1 - land * 0.6);
      if (!th.light) { ctx.shadowColor = rgba(th.acc); ctx.shadowBlur = 10 * u; }
      glyph(ctx, "spark", 34 * u); ctx.restore();
      const ty = py + ph * 0.88;
      ctx.beginPath(); ctx.moveTo(px, ty); ctx.lineTo(px + pw, ty); ctx.lineWidth = 3 * u; ctx.lineCap = "round"; ctx.strokeStyle = rgba(th.grid, 0.35); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px, ty); ctx.lineTo(px + pw * (0.2 + 0.8 * land), ty); neon(ctx, th, rgba(th.acc), 3 * u, th.acc, u, 0.7);
    } else {
      // Approving: a review bar fills, then the seal flares; it repeats.
      const cyc = frac(t / 2.6), f = eo(seg(cyc, 0.05, 0.55)), seal = back(seg(cyc, 0.5, 0.7)) * (1 - seg(cyc, 0.92, 1));
      const cx = px + ph * 0.45, cy = py + ph / 2, r = ph * 0.38;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.lineWidth = 6 * u; ctx.strokeStyle = rgba(th.grid, 0.3); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * f); neon(ctx, th, rgba(th.acc), 6 * u, th.acc, u, 1);
      if (seal > 0) {
        glowBlob(ctx, th, cx, cy, r * 2, th.acc, 0.45 * seal);
        ctx.save(); ctx.translate(cx, cy); ctx.scale(seal, seal); ctx.strokeStyle = rgba(mix(th.acc, WHITE, 0.3)); ctx.lineWidth = 5 * u; ctx.lineCap = "round"; ctx.lineJoin = "round";
        if (!th.light) { ctx.shadowColor = rgba(th.acc); ctx.shadowBlur = 14 * u; }
        glyph(ctx, "check", r * 1.3); ctx.restore();
      }
      const bx = cx + r + 34 * u, bw = px + pw - bx;
      for (let i = 0; i < 3; i++) {
        const y = py + ph * (0.22 + i * 0.28), on = seg(f, i * 0.3, i * 0.3 + 0.3);
        rr(ctx, bx, y - 8 * u, bw * (0.55 + 0.15 * i), 16 * u, 8 * u); ctx.fillStyle = rgba(th.grid, 0.25); ctx.fill();
        rr(ctx, bx, y - 8 * u, bw * (0.55 + 0.15 * i) * on, 16 * u, 8 * u); ctx.fillStyle = rgba(mix(th.acc, th.g2, i * 0.3), 0.85); ctx.fill();
      }
    }
    ctx.restore();
    if (fl > 0) { rr(ctx, R.x, R.y, R.w, R.h, 18 * u); neon(ctx, th, rgba(th.acc, fl), 2.4 * u, th.acc, u, 1.2); }
  }
  function processScene(ctx, S, th, A, b, d, t, local, hold) {
    const u = S.u, tall = S.tall, steps = d.steps, n = steps.length;
    const icons = ["scan", "spark", "check"];
    const s = tall ? Math.min(190 * u, (A.h / n) * 0.42) : Math.min(220 * u, (A.w / n) * 0.4);
    const P = (i) => (tall ? [A.x + s / 2 + 30 * u, A.y + (A.h * (i + 0.5)) / n - 20 * u] : [A.x + (A.w * (i + 0.5)) / n, A.y + A.h * 0.22]);
    const qs = steps.map((_, i) => stg(seg(b, 0, 0.85), i, n, 0.55));
    // Token: after the build it loops along the chain; each node flares as it passes.
    const settle = Math.max(1.2, hold * 0.5);
    const loop = 2.6, tk = local > settle ? frac((local - settle) / loop) : -1;
    const tokenAt = tk < 0 ? -1 : tk * (n - 1 + 0.6);
    const flare = (i) => (tokenAt < 0 ? 0 : Math.max(0, 1 - Math.abs(tokenAt - i) * 1.6));
    // Links with marching chevrons.
    for (let i = 0; i < n - 1; i++) {
      const a = P(i), c = P(i + 1);
      const A0 = tall ? [a[0], a[1] + s / 2 + 16 * u] : [a[0] + s / 2 + 18 * u, a[1]];
      const B0 = tall ? [c[0], c[1] - s / 2 - 16 * u] : [c[0] - s / 2 - 18 * u, c[1]];
      const lq = seg(qs[i + 1], 0, 0.6);
      link(ctx, S, th, [A0, B0], lq, t, { n: 2, v: 300, phase: i * 0.4, w: 2.6 });
      if (lq > 0.95) {
        ctx.save();
        const L = Math.hypot(B0[0] - A0[0], B0[1] - A0[1]), dir = [(B0[0] - A0[0]) / L, (B0[1] - A0[1]) / L];
        for (let k = 0; k < 3; k++) {
          const f = frac(t * 0.5 + k / 3), px = A0[0] + dir[0] * L * f, py = A0[1] + dir[1] * L * f, sz = 12 * u;
          const nx = -dir[1], ny = dir[0];
          ctx.beginPath(); ctx.moveTo(px - dir[0] * sz + nx * sz, py - dir[1] * sz + ny * sz); ctx.lineTo(px, py); ctx.lineTo(px - dir[0] * sz - nx * sz, py - dir[1] * sz - ny * sz);
          ctx.globalAlpha = Math.sin(Math.PI * f);
          neon(ctx, th, rgba(th.acc), 2.4 * u, th.acc, u, 0.8);
        }
        ctx.restore();
      }
    }
    if (tokenAt >= 0 && tokenAt <= n - 1) {
      const i = Math.min(n - 2, Math.floor(tokenAt)), f = clamp(tokenAt - i);
      const a = P(i), c = P(i + 1);
      glowDot(ctx, th, a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f, 11 * u, mix(th.acc, WHITE, 0.3));
    }
    steps.forEach((label, i) => {
      const q = qs[i];
      if (q <= 0) return;
      const [x, y] = P(i), last = i === n - 1, fl = flare(i);
      // The step's live panel, wired up from its node.
      const R = tall
        ? { x: x + s / 2 + 50 * u, y: y - s / 2 + 74 * u, w: A.x + A.w - (x + s / 2 + 50 * u), h: Math.min(s + 10 * u, A.h / n - 120 * u) }
        : { x: x - (A.w / n) / 2 + 44 * u, y: y + s / 2 + 128 * u, w: A.w / n - 88 * u, h: Math.min(210 * u, A.y + A.h - (y + s / 2 + 128 * u) - 16 * u) };
      if (!tall) link(ctx, S, th, [[x, y + s / 2 + 12 * u], [x, y + s / 2 + 34 * u]], seg(q, 0.4, 0.7), t, { n: 0, w: 2 });
      stepPanel(ctx, S, th, last ? 2 : i % 2, R, seg(q, 0.3, 1), t + i * 0.4, fl);
      if (fl > 0) glowBlob(ctx, th, x, y, s * 0.95, th.acc, 0.3 * fl);
      node(ctx, S, th, x, y, s * (1 + 0.05 * fl), icons[last ? 2 : i % 2], { q, t, ph: i * 1.3, hot: last, lit: last ? 1 : 0.5 + 0.5 * fl, c1: last ? th.acc : i ? mix(th.acc, th.g2, 0.5) : th.g2, c2: last ? th.g2 : th.acc });
      // Step number in a ring at the node's corner.
      const nx = x - s / 2 + 6 * u, ny = y - s / 2 + 6 * u, nr = 34 * u;
      ctx.save(); ctx.globalAlpha *= clamp(q * 2);
      ctx.beginPath(); ctx.arc(nx, ny, nr, 0, TAU); ctx.fillStyle = th.light ? "#ffffff" : rgba(th.deep[0], 0.96); ctx.fill();
      ctx.beginPath(); ctx.arc(nx, ny, nr, 0, TAU); neon(ctx, th, rgba(last ? th.acc : th.g2), 2 * u, last ? th.acc : th.g2, u, 0.7);
      txt(ctx, S, th, String(i + 1), nx, ny + 2 * u, 42 * u, { align: "center", fam: "figures", weight: 800, color: last ? undefined : th.inkS, grad: last });
      ctx.restore();
      ctx.save(); ctx.globalAlpha *= clamp(q * 1.6);
      if (tall) txt(ctx, S, th, label, R.x, y - s / 2 + 26 * u, 52 * u, { weight: 700, max: R.w, grad: last, glow: last ? 12 : 0 });
      else txt(ctx, S, th, label, x, y + s / 2 + 82 * u, 50 * u, { align: "center", weight: 700, max: A.w / n - 30 * u, grad: last, glow: last ? 12 : 0 });
      ctx.restore();
    });
  }

  // Comparison: two neon cards with ring gauges and large counters, wired through a change capsule.
  function gauge(ctx, S, th, x, y, r, f, t, hot) {
    const u = S.u, c1 = hot ? th.acc : th.g2, c2 = hot ? th.g2 : th.g3;
    ctx.save();
    glowBlob(ctx, th, x, y, r * 1.7, c1, hot ? 0.3 : 0.16);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.lineWidth = 16 * u; ctx.strokeStyle = rgba(th.grid, th.light ? 0.14 : 0.2); ctx.stroke();
    const n = 48;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / n) * TAU;
      ctx.moveTo(x + Math.cos(a) * (r + 22 * u), y + Math.sin(a) * (r + 22 * u)); ctx.lineTo(x + Math.cos(a) * (r + (i % 4 ? 30 : 38) * u), y + Math.sin(a) * (r + (i % 4 ? 30 : 38) * u));
    }
    ctx.lineWidth = 2 * u; ctx.strokeStyle = rgba(c1, 0.35); ctx.stroke();
    if (f > 0.002) {
      ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * f);
      let st;
      if (ctx.createConicGradient) { st = ctx.createConicGradient(-Math.PI / 2, x, y); st.addColorStop(0, rgba(c2)); st.addColorStop(Math.max(0.01, f), rgba(c1)); st.addColorStop(1, rgba(c1)); }
      else st = rgba(c1);
      neon(ctx, th, st, 16 * u, c1, u, hot ? 1.1 : 0.6);
      const ta = -Math.PI / 2 + TAU * f;
      glowDot(ctx, th, x + Math.cos(ta) * r, y + Math.sin(ta) * r, 10 * u, c1);
    }
    const a0 = t * 0.9;
    ctx.beginPath(); ctx.arc(x, y, r + 54 * u, a0, a0 + 0.7); neon(ctx, th, rgba(c1, 0.8), 2.2 * u, c1, u, 0.5);
    ctx.beginPath(); ctx.arc(x, y, r + 54 * u, a0 + Math.PI, a0 + Math.PI + 0.35); neon(ctx, th, rgba(c2, 0.7), 2.2 * u, c2, u, 0.5);
    ctx.save(); ctx.translate(x, y); ctx.rotate(-t * 0.5);
    ctx.beginPath(); ctx.arc(0, 0, r - 30 * u, 0, TAU); ctx.setLineDash([3 * u, 9 * u]); ctx.lineWidth = 2 * u; ctx.strokeStyle = rgba(c1, 0.45); ctx.stroke(); ctx.restore();
    // A needle that keeps easing around the reading, like a live meter.
    if (f > 0.002) {
      const na = -Math.PI / 2 + TAU * f + 0.09 * Math.sin(t * 1.9) + 0.04 * Math.sin(t * 4.3);
      ctx.beginPath(); ctx.moveTo(x - Math.cos(na) * r * 0.16, y - Math.sin(na) * r * 0.16); ctx.lineTo(x + Math.cos(na) * (r - 34 * u), y + Math.sin(na) * (r - 34 * u));
      neon(ctx, th, rgba(mix(c1, WHITE, 0.25)), 4 * u, c1, u, 0.9);
    }
    const pr = 0.8 + 0.2 * Math.sin(t * 3);
    glowDot(ctx, th, x, y, r * 0.12 * pr, c1, 0.9);
    ctx.restore();
  }
  function compareScene(ctx, S, th, A, b, d, t) {
    const u = S.u, tall = S.tall;
    const vals = [Number(d.leftValue) || 0, Number(d.rightValue) || 0], labels = [d.left, d.right];
    const max = Math.max(1, ...vals.map(Math.abs));
    const gap = (tall ? 200 : 300) * u;
    const cw = tall ? A.w : (A.w - gap) / 2, ch = tall ? (A.h - gap) / 2 : A.h * 0.9;
    const rects = [0, 1].map((i) => (tall ? { x: A.x, y: A.y + i * (ch + gap), w: cw, h: ch } : { x: A.x + i * (cw + gap), y: A.y + (A.h - ch) / 2, w: cw, h: ch }));
    const qs = [0, 1].map((i) => stg(seg(b, 0, 0.9), i, 2, 0.35));
    // The bridge between the cards.
    const a = tall ? [A.x + A.w / 2, rects[0].y + ch + 14 * u] : [rects[0].x + cw + 14 * u, rects[0].y + ch * 0.55];
    const c = tall ? [A.x + A.w / 2, rects[1].y - 14 * u] : [rects[1].x - 14 * u, rects[1].y + ch * 0.55];
    link(ctx, S, th, [a, c], seg(b, 0.4, 0.7), t, { n: 3, v: 220, c1: th.g2, c2: th.acc, w: 3 });
    [0, 1].forEach((i) => {
      const q = qs[i], R = rects[i], hot = i === 1;
      if (q <= 0) return;
      card(ctx, S, th, R.x, R.y, R.w, R.h, { q: eo(q * 1.6), t, phase: i * 0.5, hot });
      const vq = eo(seg(q, 0.25, 1));
      ctx.save(); ctx.globalAlpha *= clamp(q * 2);
      pill(ctx, S, th, labels[i], R.x + 40 * u, R.y + 64 * u, 44 * u, { q: seg(q, 0.1, 0.6), hot, t, max: R.w - 80 * u });
      const gr = Math.min(R.h * (tall ? 0.24 : 0.25), R.w * 0.2);
      const gx = R.x + 70 * u + gr, gy = tall ? R.y + R.h * 0.58 : R.y + R.h * 0.53;
      gauge(ctx, S, th, gx, gy, gr, (Math.abs(vals[i]) / max) * vq, t + i, hot);
      const nx = gx + gr + 90 * u;
      txt(ctx, S, th, fmtN(vals[i] * Math.max(vq, 0.0001), vals[i], d.prefix, d.suffix), nx, gy, (tall ? 150 : 170) * u, { fam: "figures", weight: 800, grad: hot, color: hot ? undefined : th.inkS, glow: hot ? 26 : 8, glowC: hot ? th.acc : th.g2, max: R.x + R.w - 40 * u - nx, min: 96 * u });
      // Cell meter along the foot of the card.
      const cells = 18, mx = R.x + 40 * u, my = R.y + R.h - 58 * u, mw = R.w - 80 * u, cwid = mw / cells;
      const lit = (Math.abs(vals[i]) / max) * cells * vq;
      // A charge keeps running along the lit cells; the next empty cell blinks as if about to fill.
      const run = frac(t * 0.55 + i * 0.4) * (Math.ceil(lit) + 4) - 2;
      for (let k = 0; k < cells; k++) {
        rr(ctx, mx + k * cwid + 3 * u, my, cwid - 6 * u, 22 * u, 4 * u);
        const on = clamp(lit - k), boost = on > 0 ? Math.max(0, 1 - Math.abs(run - k) / 1.6) : 0;
        const nextBlink = k === Math.ceil(lit) && vq > 0.95 ? 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(t * 7 + i)) : 0;
        ctx.fillStyle = on > 0 ? rgba(mix(hot ? mix(th.acc, th.g2, k / cells) : mix(th.g2, th.g3, k / cells), WHITE, boost * 0.55), 0.35 + 0.6 * on) : rgba(hot ? th.acc : th.grid, 0.12 + nextBlink);
        ctx.fill();
        if (boost > 0.3 && !th.light) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.shadowColor = rgba(hot ? th.acc : th.g2); ctx.shadowBlur = 14 * u * boost; ctx.fill(); ctx.restore(); }
      }
      ctx.restore();
    });
    // Change capsule on the bridge.
    const before = vals[0], after = vals[1];
    if (before !== 0) {
      const pct = Math.round(((after - before) / Math.abs(before)) * 100);
      const label = (pct > 0 ? "+" : pct < 0 ? "−" : "") + Math.abs(pct) + "%";
      const mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2;
      // The point of the scene: pops in once the second counter lands, then keeps breathing.
      const pq = seg(b, 0.84, 0.97);
      if (pq > 0) {
        const sz = (tall ? 64 : 66) * u, pop = back(pq), breath = 1 + 0.03 * Math.sin(t * 3.2) * pq;
        const ring = seg(b, 0.86, 1), echo = frac(t * 0.6);
        ctx.save();
        if (ring < 1) { ctx.beginPath(); ctx.arc(mx, my, (60 + ring * 170) * u, 0, TAU); ctx.lineWidth = 3 * u; ctx.strokeStyle = rgba(th.acc, 0.8 * (1 - ring)); ctx.stroke(); }
        ctx.beginPath(); ctx.arc(mx, my, (70 + echo * 90) * u, 0, TAU); ctx.lineWidth = 2 * u; ctx.strokeStyle = rgba(th.acc, 0.35 * (1 - echo) * pq); ctx.stroke();
        glowBlob(ctx, th, mx, my, 190 * u, th.acc, 0.35 * pq);
        ctx.translate(mx, my); ctx.scale(pop * breath, pop * breath); ctx.translate(-mx, -my);
        pill(ctx, S, th, label, mx, my, sz, { q: 1, align: "center", hot: true, t, solid: true, dot: false, fam: "figures", weight: 800, min: 54 * u });
        ctx.restore();
      }
    }
  }

  // ---- wiring the drawers to the stage ------------------------------------------------------------
  function wrap(fn, id) {
    return (ctx, S, box, p, d, info) => {
      const th = theme(S);
      const leaving = info.exit !== undefined;
      const A = area(S, box);
      const w = CUR.wipe;
      let side = null, draw = true;
      if (leaving) { if (w && !w.pre && w.out === id) side = "out"; else draw = false; }
      else if (w && w.in === id) side = "in";
      else if (w && w.out === id) side = "out";
      // Arriving layouts are already partly built, so no scene starts on an empty plate.
      const b = leaving ? 1 : 0.28 + 0.72 * clamp((info.local - 0.05) / Math.max(0.9, info.hold * 0.6));
      if (draw) {
        ctx.save();
        if (side) wipeFx(ctx, S, w, side);
        else if (!leaving && CUR.index === 0) arriveFx(ctx, S, info.local);
        fn(ctx, S, th, A, b, d, info.t, info.local, info.hold);
        ctx.restore();
      }
      if (!leaving || CUR.finisher === "leaving") finish(ctx, S, th, info.t);
    };
  }
  const SCENES = { chart: wrap(chartScene, "chart"), object: wrap(objectScene, "object"), people: wrap(peopleScene, "people"), process: wrap(processScene, "process"), compare: wrap(compareScene, "compare") };

  const tok = {
    bg: "#070b24", panel: "rgba(12,18,52,0.82)", ink: "#eef3ff", muted: "rgba(200,212,255,0.74)", accent: "#3ddcff", onAccent: "#04102a",
    rule: "rgba(120,150,255,0.42)", track: "rgba(120,150,255,0.16)",
    glow2: "#8d5bff", glow3: "#ff4fd2", gridColor: "#4d68ff", deep: ["#0a1040", "#050824", "#07072a"],
  };
  return {
    ...tok,
    display: "'Avenir Next', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif", displayWeight: 700, displayCase: "none", displayTracking: "-0.015em",
    body: "'Avenir Next', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif", bodyWeight: 500,
    figures: "'Avenir Next', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif", radius: 24, motion: "focus", change: "fade",
    kit: { line: 2.5, glow: 16, fill: "solid", panel: "fill" },
    panelEdge: "rgba(61,220,255,0.55)",
    palettes: {
      // Lab light: white glass and indigo light lines. Night: near-black with mint and cobalt. Mono: white light on graphite.
      light: { bg: "#eef1ff", panel: "rgba(255,255,255,0.86)", ink: "#10153a", muted: "rgba(16,21,58,0.68)", accent: "#2f56ff", onAccent: "#ffffff", rule: "rgba(16,21,58,0.28)", track: "rgba(16,21,58,0.08)",
        glow2: "#8a3dff", glow3: "#e23aa6", gridColor: "#6f84ff", deep: ["#f7f8ff", "#ebefff", "#e2e7ff"], panelEdge: "rgba(47,86,255,0.5)", textShadow: () => "none" },
      dark: { bg: "#02040c", accent: "#2ff3c6", glow2: "#2a78ff", glow3: "#9a5cff", gridColor: "#1f5fd8", deep: ["#061024", "#02040c", "#030913"], panelEdge: "rgba(47,243,198,0.5)" },
      mono: { accent: "#e9edf5", onAccent: "#15171c", glow2: "#9ba3b4", glow3: "#c9cfdb", gridColor: "#6b7283", deep: ["#1a1c22", "#0c0d11", "#131418"], ink: "#f5f7fb", muted: "rgba(235,238,245,0.7)", panelEdge: "rgba(233,237,245,0.45)" },
    },
    textShadow: (accent) => `0 0 28px ${accent}55`,
    backdrop: (accent, texture = 1, look) => {
      const d = (look && look.deep) || tok.deep;
      return `${grain(0.04 * texture)}, linear-gradient(180deg, ${d[0]} 0%, ${d[1]} 62%, ${d[2]} 100%)`;
    },
    // Headlines carry a light gradient and a soft glow; the kicker becomes a neon capsule.
    css: (accent, look) => {
      const light = lum(rgb(look.bg)) > 150;
      const a = rgb(accent), g2 = look.glow2 || tok.glow2;
      return `#root .display { background-image: linear-gradient(100deg, ${look.ink} 0%, ${look.ink} 34%, ${rgba(mix(rgb(look.ink), a, 0.55))} 60%, ${accent} 80%, ${g2} 100%);
          -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; text-shadow: none; padding-bottom: 0.06em; }
        #root h2.display { align-self: flex-start; }
        #root .statement .display { width: fit-content !important; max-width: 100%; text-wrap: balance; }
        #root h2.display { text-wrap: balance; }
        #root .scene { filter: drop-shadow(0 0 ${light ? "10px" : "22px"} ${rgba(a, light ? 0.18 : 0.38)}); }
        #title-scene .kicker { align-self: flex-start; padding: 0.5em 1.15em; border-radius: 999px; letter-spacing: 0.16em; color: ${look.ink}; text-shadow: none;
          background: ${light ? "rgba(255,255,255,0.85)" : rgba(rgb((look.deep || tok.deep)[0]), 0.75)}; border: 2px solid ${rgba(a, 0.85)};
          box-shadow: 0 0 18px ${rgba(a, 0.45)}, inset 0 0 14px ${rgba(a, 0.22)}; }
        #title-scene .kicker::before { content: ""; display: inline-block; width: 0.5em; height: 0.5em; margin: 0 0.7em 0.1em 0; border-radius: 50%; vertical-align: middle;
          background: ${accent}; box-shadow: 0 0 0.7em ${accent}, 0 0 0.2em #fff; }`;
    },
    // Other templates get the same world on the texture canvas.
    paint: (ctx, W, H, t, accent, look) => {
      ctx.clearRect(0, 0, W, H);
      if (STAGED.on) return;
      const S = { W, H, u: Math.min(W, H) / 1080, tall: H > W * 1.15, look, accent, paint: true };
      world(ctx, S, theme(S), t, t * 16 * S.u, 0);
    },
    keepArt: true,
    overlap: true,
    stage(ctx, S, info) {
      STAGED.on = true;
      placeStatements(S);
      const th = theme(S);
      const shown = shownList();
      const prev = info.index > 0 ? shown[info.index - 1] : null;
      CUR.index = info.index; CUR.scene = info.scene; CUR.prev = prev; CUR.change = info.change;
      const drawnCur = Boolean(info.scene && SCENES[info.scene]);
      const drawnPrev = Boolean(prev && SCENES[prev] && info.local < info.change);
      CUR.finisher = drawnCur ? "current" : drawnPrev ? "leaving" : "stage";
      // The wipe: into a closing statement it runs over the last `change` of the scene (while that
      // scene's headline fades), so the closing words never land over the old layout; every other
      // change runs over the first `change` of the new scene.
      const ch = Math.max(0.2, info.change);
      CUR.wipe = null;
      if (info.index >= 0 && info.next === "closing" && info.local > info.hold - ch) {
        const k = clamp((info.local - (info.hold - ch)) / ch);
        CUR.wipe = { k, x: wipeX(S, k), out: info.scene, in: "closing", pre: true };
      } else if (prev && info.scene !== "closing" && info.local < ch) {
        const k = clamp(info.local / ch);
        CUR.wipe = { k, x: wipeX(S, k), out: prev, in: info.scene, pre: false };
      }
      const w = CUR.wipe;
      const cam = camX(S, info);
      if (S.paint) world(ctx, S, th, info.t, cam, w ? w.k : 0);
      if (w && !w.pre && prev === "title") {
        const titleHold = Number(controls().title_hold ?? DEF.title);
        ctx.save(); wipeFx(ctx, S, w, "out");
        statementArt(ctx, S, th, "title", info.t, titleHold + info.local);
        ctx.restore();
      }
      if (info.scene === "title" || info.scene === "closing") {
        ctx.save();
        if (w && w.out === info.scene) wipeFx(ctx, S, w, "out");
        else if (info.index === 0) arriveFx(ctx, S, info.local);
        statementArt(ctx, S, th, info.scene, info.t, info.local);
        ctx.restore();
      }
      if (w && w.pre) {
        ctx.save(); wipeFx(ctx, S, w, "in");
        statementArt(ctx, S, th, "closing", info.t, info.local - info.hold);
        ctx.restore();
      }
      if (CUR.finisher === "stage") finish(ctx, S, th, info.t);
    },
    scenes: SCENES,
  };
});
