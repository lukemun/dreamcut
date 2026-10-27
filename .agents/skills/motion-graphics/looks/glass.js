// Glass: a frosted interface world. Vivid light drifts behind translucent panels that genuinely blur
// whatever passes under them (orbs, glossy spheres, other cards). A camera glides between panel
// layouts so scenes read as one continuous space; glowing wires carry travelling light between cards.
// Every frame is a pure function of time: seeded noise only, no clocks.
window.DreamcutMotion.register("glass", ({ grain, rng }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const ei = (v) => Math.pow(clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const seg = (p, a, b) => clamp((p - a) / (b - a));

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
    return [200, 200, 220];
  }
  const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  const WHITE = [255, 255, 255];

  function theme(S) {
    const L = S.look;
    const light = lum(rgb(L.bg)) > 150;
    const acc = rgb(S.accent);
    const cols = (L.orbColors || []).map((c) => rgb(c || S.accent));
    while (cols.length < 4) cols.push(acc);
    const ink = rgb(L.ink);
    return {
      light, acc, cols, ink, inkS: L.ink, muted: L.muted, u: S.u, tex: L.texture ?? 1,
      edge: light ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.55)",
      shadow: light ? "rgba(70,60,150,0.2)" : "rgba(6,2,26,0.42)",
      skel: rgba(ink, light ? 0.16 : 0.22), faint: rgba(ink, light ? 0.08 : 0.1), mutedHi: rgba(ink, light ? 0.82 : 0.92),
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
    c.width = c.height = 192;
    const g = c.getContext("2d");
    const img = g.createImageData(192, 192);
    const r = rng(11);
    for (let i = 0; i < img.data.length; i += 4) { const v = r() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    return (NOISE = c);
  }

  // ---- primitives ---------------------------------------------------------------------------------
  function rr(ctx, x, y, w, h, r) {
    const q = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + q, y); ctx.arcTo(x + w, y, x + w, y + h, q); ctx.arcTo(x + w, y + h, x, y + h, q);
    ctx.arcTo(x, y + h, x, y, q); ctx.arcTo(x, y, x + w, y, q); ctx.closePath();
  }
  function bar(ctx, x, y, w, h, color) { if (w <= 0) return; rr(ctx, x, y, w, h, h / 2); ctx.fillStyle = color; ctx.fill(); }
  function glowDot(ctx, th, x, y, r, c = th.acc) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.22, rgba(mix(c, WHITE, 0.4), 0.95));
    g.addColorStop(0.5, rgba(c, 0.35)); g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r * 3.2, y - r * 3.2, r * 6.4, r * 6.4);
  }

  // A frosted pane: copies what is already drawn under it, blurs and saturates that copy, then lays
  // tint, sheen, frost grain, a specular top edge and a 1px light border over it.
  // Per-frame state shared by the drawers: how many big panes have been laid (each gets its own hue)
  // and the current scene's local time (panes sweep a specular band once as they arrive).
  const FRAME = { k: 0, local: 0 };
  // A widget drawn through as(key, ...) names the piece its first pane begins; its later panes stay in it.
  let NEXT = null;
  const USED = {};
  function as(key, draw) { NEXT = key; try { draw(); } finally { NEXT = null; } }
  function glass(ctx, S, th, x, y, w, h, r, o = {}) {
    // Each lifted pane is its own piece when the graphic is split into timeline layers. Piece names
    // follow the piece-type registry (looks/pieces.json).
    let key = o.piece;
    if (key === undefined && NEXT !== null) { key = NEXT === USED ? false : NEXT; NEXT = USED; }
    if (S.piece && (key !== undefined || o.shadow !== false)) S.piece(key);
    if (w <= 2 || h <= 2) return;
    const u = S.u;
    const big = o.shadow !== false;
    const kk = big ? FRAME.k++ : 0;
    const hue = o.hue || (big ? th.cols[(kk + 1) % 4] : null);
    const m = ctx.getTransform();
    const sc = Math.hypot(m.a, m.b) || 1;
    const dx = m.a * x + m.c * y + m.e, dy = m.b * x + m.d * y + m.f, dw = w * sc, dh = h * sc;
    const blur = (o.blur ?? 30) * u * sc;
    const k = 4, pad = blur * 1.5;
    const sx = dx - pad, sy = dy - pad, sw = dw + pad * 2, sh = dh + pad * 2;
    const fb = buf("frost", sw / k, sh / k);
    const fc = fb.getContext("2d");
    fc.clearRect(0, 0, fb.width, fb.height);
    fc.filter = `blur(${(blur / k).toFixed(2)}px) saturate(${o.sat ?? 1.45})`;
    fc.drawImage(ctx.canvas, sx, sy, sw, sh, 0, 0, fb.width, fb.height);
    fc.filter = "none";
    // Lifted shadow, cast from a copy of the shape drawn off-canvas so only the shadow lands.
    if (o.shadow !== false) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const far = S.W * 3;
      rr(ctx, dx - far, dy, dw, dh, r * sc);
      ctx.shadowColor = hue ? rgba(mix(hue, [8, 4, 30], th.light ? 0.2 : 0.62), th.light ? 0.32 : 0.6) : th.shadow;
      ctx.shadowBlur = 56 * u * sc; ctx.shadowOffsetX = far; ctx.shadowOffsetY = 28 * u * sc;
      ctx.fillStyle = "#000"; ctx.fill();
      ctx.restore();
    }
    ctx.save();
    rr(ctx, x, y, w, h, r);
    ctx.clip();
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(fb, 0, 0, fb.width, fb.height, sx, sy, sw, sh); ctx.restore();
    const tint = ctx.createLinearGradient(x, y, x, y + h);
    const base = o.tint || WHITE;
    const ta = th.light ? 0.5 : 0.16, tb = th.light ? 0.3 : 0.05;
    tint.addColorStop(0, rgba(base, ta * (o.tintMul ?? 1))); tint.addColorStop(1, rgba(base, tb * (o.tintMul ?? 1)));
    ctx.fillStyle = tint; ctx.fillRect(x, y, w, h);
    if (hue) {
      const hg = ctx.createLinearGradient(x, y, x + w, y + h);
      hg.addColorStop(0, rgba(hue, th.light ? 0.1 : 0.14)); hg.addColorStop(1, rgba(hue, 0.02));
      ctx.fillStyle = hg; ctx.fillRect(x, y, w, h);
    }
    if (o.color) { ctx.fillStyle = rgba(o.color, o.colorA ?? 0.16); ctx.fillRect(x, y, w, h); }
    // A specular band sweeps across once as the pane arrives.
    if (big) {
      // First pass on arrival, then again every few seconds so long holds keep catching the light.
      const tl0 = FRAME.local - (o.delay ?? kk * 0.07);
      const sw = tl0 < 1.2 ? seg(tl0, 0.1, 1.2) : seg((tl0 - 1.2) % 3.6, 1.6, 2.7);
      if (sw > 0 && sw < 1) {
        const c0 = x - w * 0.6 + (w * 2.2) * eio(sw);
        const band = ctx.createLinearGradient(c0 - w * 0.25, y, c0 + w * 0.25, y + h * 0.5);
        band.addColorStop(0, "rgba(255,255,255,0)"); band.addColorStop(0.5, `rgba(255,255,255,${th.light ? 0.4 : 0.22})`); band.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = band; ctx.fillRect(x, y, w, h);
      }
    }
    const sheen = ctx.createLinearGradient(x, y, x + w * 0.7, y + h);
    sheen.addColorStop(0, `rgba(255,255,255,${th.light ? 0.4 : 0.2})`); sheen.addColorStop(0.42, "rgba(255,255,255,0)"); sheen.addColorStop(1, "rgba(255,255,255,0.06)");
    ctx.fillStyle = sheen; ctx.fillRect(x, y, w, h);
    // A fixed diagonal specular streak across large panes.
    if (big && w > 420 * u) {
      const sx0 = x + w * 0.12;
      const st = ctx.createLinearGradient(sx0, y, sx0 + h * 0.5, y + h * 0.5);
      st.addColorStop(0, "rgba(255,255,255,0)"); st.addColorStop(0.42, "rgba(255,255,255,0)"); st.addColorStop(0.5, `rgba(255,255,255,${th.light ? 0.3 : 0.12})`);
      st.addColorStop(0.56, "rgba(255,255,255,0)"); st.addColorStop(0.66, `rgba(255,255,255,${th.light ? 0.16 : 0.06})`); st.addColorStop(0.7, "rgba(255,255,255,0)"); st.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = st; ctx.fillRect(x, y, w, h);
    }
    if (th.tex > 0) {
      ctx.globalCompositeOperation = "overlay";
      ctx.globalAlpha *= 0.09 * th.tex;
      ctx.fillStyle = ctx.createPattern(noise(), "repeat");
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
    // Border: brighter where the light hits (top left), fading round the far corner.
    ctx.save();
    rr(ctx, x, y, w, h, r);
    const edge = ctx.createLinearGradient(x, y, x + w * 0.5, y + h);
    edge.addColorStop(0, th.edge); edge.addColorStop(0.55, `rgba(255,255,255,${th.light ? 0.5 : 0.14})`); edge.addColorStop(1, `rgba(255,255,255,${th.light ? 0.75 : 0.3})`);
    ctx.lineWidth = 1.6 * u; ctx.strokeStyle = edge; ctx.stroke();
    // Inner highlight hugging the lit top-left rim, fading inward.
    if (big) {
      rr(ctx, x + 2.5 * u, y + 2.5 * u, w - 5 * u, h - 5 * u, Math.max(0, r - 2.5 * u));
      const ih = ctx.createLinearGradient(x, y, x + Math.min(w, h) * 0.6, y + Math.min(w, h) * 0.6);
      ih.addColorStop(0, `rgba(255,255,255,${th.light ? 0.7 : 0.38})`); ih.addColorStop(1, "rgba(255,255,255,0)");
      ctx.lineWidth = 2.5 * u; ctx.strokeStyle = ih; ctx.stroke();
    }
    if (th.light) { rr(ctx, x - 1.2 * u, y - 1.2 * u, w + 2.4 * u, h + 2.4 * u, r + 1.2 * u); ctx.lineWidth = 1 * u; ctx.strokeStyle = "rgba(40,36,90,0.08)"; ctx.stroke(); }
    // Specular line along the top edge.
    const spec = ctx.createLinearGradient(x, 0, x + w, 0);
    spec.addColorStop(0, "rgba(255,255,255,0)"); spec.addColorStop(0.3, "rgba(255,255,255,0.9)"); spec.addColorStop(0.7, "rgba(255,255,255,0.25)"); spec.addColorStop(1, "rgba(255,255,255,0)");
    ctx.beginPath(); ctx.moveTo(x + r, y + 1.4 * u); ctx.lineTo(x + w - r, y + 1.4 * u);
    ctx.lineWidth = (big ? 2.4 : 1.6) * u; ctx.strokeStyle = spec;
    if (big) { ctx.shadowColor = "rgba(255,255,255,0.8)"; ctx.shadowBlur = 8 * u; }
    ctx.stroke(); ctx.shadowBlur = 0;
    if (o.glow) {
      rr(ctx, x, y, w, h, r);
      ctx.globalAlpha *= o.glow;
      ctx.lineWidth = 2.6 * u; ctx.strokeStyle = rgba(mix(th.acc, WHITE, 0.25), 1);
      ctx.shadowColor = rgba(th.acc, 0.9); ctx.shadowBlur = 34 * u; ctx.stroke(); ctx.stroke();
    }
    ctx.restore();
  }

  // ---- type ---------------------------------------------------------------------------------------
  function font(S, size, weight, fam = "body") {
    const L = S.look;
    const f = fam === "display" ? L.display : fam === "figures" ? L.figures : L.body;
    return `${weight ?? (fam === "body" ? 600 : L.displayWeight)} ${size}px ${f}`;
  }
  function fitSize(ctx, S, s, size, maxW, o = {}) {
    let z = size;
    ctx.font = font(S, z, o.weight, o.fam);
    while (z > size * 0.66 && ctx.measureText(s).width > maxW) { z *= 0.95; ctx.font = font(S, z, o.weight, o.fam); }
    return z;
  }
  function txt(ctx, S, th, s, x, y, size, o = {}) {
    s = String(s ?? "");
    ctx.save();
    let z = o.max ? fitSize(ctx, S, s, size, o.max, o) : size;
    ctx.font = font(S, z, o.weight, o.fam);
    if (o.max && ctx.measureText(s).width > o.max) {
      while (s.length > 1 && ctx.measureText(s + "…").width > o.max) s = s.slice(0, -1);
      s += "…";
    }
    ctx.textAlign = o.align || "left"; ctx.textBaseline = o.base || "middle";
    ctx.fillStyle = o.color || th.inkS;
    if (!th.light && o.shadow !== false) { ctx.shadowColor = "rgba(10,4,34,0.35)"; ctx.shadowBlur = 14 * S.u; ctx.shadowOffsetY = 2 * S.u; }
    ctx.fillText(s, x, y);
    const w = ctx.measureText(s).width;
    ctx.restore();
    return w;
  }
  // Split words over at most two lines that fit `maxW`.
  function wrapLines(ctx, S, s, size, maxW, weight) {
    ctx.save(); ctx.font = font(S, size, weight);
    const words = String(s || "").split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (const w of words) { const next = line ? line + " " + w : w; if (line && ctx.measureText(next).width > maxW && lines.length < 1) { lines.push(line); line = w; } else line = next; }
    if (line) lines.push(line);
    ctx.restore();
    return lines;
  }
  function textW(ctx, S, s, size, o = {}) { ctx.save(); ctx.font = font(S, size, o.weight, o.fam); const w = ctx.measureText(String(s)).width; ctx.restore(); return w; }
  const fmt = (v, ref, suffix = "") => (Number.isInteger(Number(ref)) ? Math.round(v) : v.toFixed(1)) + (suffix || "");

  // ---- icons --------------------------------------------------------------------------------------
  function icon(ctx, S, name, x, y, s, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1.5, s * 0.1); ctx.lineCap = "round"; ctx.lineJoin = "round";
    const h = s / 2;
    ctx.beginPath();
    switch (name) {
      case "play": ctx.moveTo(-h * 0.5, -h * 0.7); ctx.lineTo(h * 0.75, 0); ctx.lineTo(-h * 0.5, h * 0.7); ctx.closePath(); ctx.fill(); break;
      case "check": ctx.moveTo(-h * 0.7, 0); ctx.lineTo(-h * 0.2, h * 0.5); ctx.lineTo(h * 0.75, -h * 0.55); ctx.stroke(); break;
      case "sliders":
        for (const [yy, kx] of [[-0.6, 0.35], [0, -0.35], [0.6, 0.15]]) {
          ctx.moveTo(-h * 0.85, yy * h); ctx.lineTo(h * 0.85, yy * h);
        }
        ctx.stroke();
        for (const [yy, kx] of [[-0.6, 0.35], [0, -0.35], [0.6, 0.15]]) { ctx.beginPath(); ctx.arc(kx * h, yy * h, h * 0.2, 0, TAU); ctx.fill(); }
        break;
      case "spark":
        ctx.moveTo(0, -h); ctx.quadraticCurveTo(h * 0.12, -h * 0.12, h, 0); ctx.quadraticCurveTo(h * 0.12, h * 0.12, 0, h);
        ctx.quadraticCurveTo(-h * 0.12, h * 0.12, -h, 0); ctx.quadraticCurveTo(-h * 0.12, -h * 0.12, 0, -h); ctx.fill();
        break;
      case "chart":
        ctx.moveTo(-h * 0.8, h * 0.8); ctx.lineTo(h * 0.85, h * 0.8); ctx.stroke();
        for (const [xx, hh] of [[-0.5, 0.6], [0, 1.2], [0.5, 0.9]]) { ctx.beginPath(); ctx.moveTo(xx * h, h * 0.55); ctx.lineTo(xx * h, h * (0.55 - hh)); ctx.stroke(); }
        break;
      case "bolt": ctx.moveTo(h * 0.15, -h); ctx.lineTo(-h * 0.55, h * 0.12); ctx.lineTo(0, h * 0.12); ctx.lineTo(-h * 0.15, h); ctx.lineTo(h * 0.55, -h * 0.12); ctx.lineTo(0, -h * 0.12); ctx.closePath(); ctx.fill(); break;
      case "eye":
        ctx.moveTo(-h, 0); ctx.quadraticCurveTo(0, -h * 1.1, h, 0); ctx.quadraticCurveTo(0, h * 1.1, -h, 0); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, h * 0.3, 0, TAU); ctx.fill(); break;
      case "clock": ctx.arc(0, 0, h * 0.85, 0, TAU); ctx.moveTo(0, -h * 0.5); ctx.lineTo(0, 0); ctx.lineTo(h * 0.38, h * 0.22); ctx.stroke(); break;
      case "text":
        ctx.moveTo(-h * 0.8, -h * 0.7); ctx.lineTo(h * 0.8, -h * 0.7); ctx.moveTo(0, -h * 0.7); ctx.lineTo(0, h * 0.8);
        ctx.moveTo(-h * 0.35, h * 0.8); ctx.lineTo(h * 0.35, h * 0.8); ctx.stroke(); break;
      case "refresh":
        ctx.arc(0, 0, h * 0.75, -0.3, TAU * 0.78); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(h * 0.78, -h * 0.65); ctx.lineTo(h * 0.75, -h * 0.05); ctx.lineTo(h * 0.15, -h * 0.2); ctx.stroke(); break;
      case "layers":
        ctx.moveTo(0, -h * 0.8); ctx.lineTo(h * 0.9, -h * 0.3); ctx.lineTo(0, h * 0.2); ctx.lineTo(-h * 0.9, -h * 0.3); ctx.closePath(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-h * 0.9, h * 0.2); ctx.lineTo(0, h * 0.7); ctx.lineTo(h * 0.9, h * 0.2); ctx.stroke(); break;
      case "wave":
        for (let i = -3; i <= 3; i++) { const hh = [0.3, 0.6, 0.95, 0.5, 0.8, 0.45, 0.25][i + 3]; ctx.moveTo(i * h * 0.27, -hh * h); ctx.lineTo(i * h * 0.27, hh * h); }
        ctx.stroke(); break;
      case "dial":
        ctx.arc(0, 0, h * 0.8, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(h * 0.45, -h * 0.45); ctx.stroke(); break;
      case "user":
        ctx.arc(0, -h * 0.3, h * 0.38, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, h * 0.95, h * 0.8, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); break;
      case "arrow": ctx.moveTo(-h * 0.8, 0); ctx.lineTo(h * 0.8, 0); ctx.moveTo(h * 0.25, -h * 0.55); ctx.lineTo(h * 0.8, 0); ctx.lineTo(h * 0.25, h * 0.55); ctx.stroke(); break;
      case "down": ctx.moveTo(0, -h * 0.7); ctx.lineTo(0, h * 0.7); ctx.moveTo(-h * 0.5, h * 0.2); ctx.lineTo(0, h * 0.7); ctx.lineTo(h * 0.5, h * 0.2); ctx.stroke(); break;
      case "up": ctx.moveTo(0, h * 0.7); ctx.lineTo(0, -h * 0.7); ctx.moveTo(-h * 0.5, -h * 0.2); ctx.lineTo(0, -h * 0.7); ctx.lineTo(h * 0.5, -h * 0.2); ctx.stroke(); break;
      case "film":
        rr(ctx, -h * 0.85, -h * 0.65, h * 1.7, h * 1.3, h * 0.2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-h * 0.2, -h * 0.35); ctx.lineTo(h * 0.35, 0); ctx.lineTo(-h * 0.2, h * 0.35); ctx.closePath(); ctx.fill(); break;
      default: ctx.arc(0, 0, h * 0.5, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // An app-style icon tile: a vivid gradient square with a glossy top and a white glyph.
  function chip(ctx, S, th, x, y, s, name, k = 0, o = {}) {
    const c1 = o.c1 || (k === 0 ? th.acc : mix(th.cols[k % 4], th.acc, 0.15));
    const c2 = o.c2 || mix(th.cols[(k + 2) % 4], c1, 0.35);
    ctx.save();
    rr(ctx, x, y, s, s, s * 0.3);
    ctx.shadowColor = rgba(c1, 0.55); ctx.shadowBlur = s * 0.45; ctx.shadowOffsetY = s * 0.08;
    const g = ctx.createLinearGradient(x, y, x + s, y + s);
    g.addColorStop(0, rgba(mix(c1, WHITE, 0.12))); g.addColorStop(1, rgba(c2));
    ctx.fillStyle = g; ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.clip();
    const gl = ctx.createLinearGradient(0, y, 0, y + s * 0.6);
    gl.addColorStop(0, "rgba(255,255,255,0.45)"); gl.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gl; ctx.fillRect(x, y, s, s * 0.55);
    ctx.restore();
    ctx.save(); rr(ctx, x, y, s, s, s * 0.3); ctx.lineWidth = 1.4 * S.u; ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.stroke(); ctx.restore();
    const ic = lum(mix(c1, c2, 0.5)) > 175 ? "#15171c" : "#ffffff";
    icon(ctx, S, name, x + s / 2, y + s / 2, s * 0.5, ic);
  }

  // A capsule label: frosted or filled, with an optional glowing dot or icon.
  function pill(ctx, S, th, s, x, y, size, o = {}) {
    const u = S.u;
    const padX = size * 0.6, h = size * 1.75;
    const lead = o.icon || o.dot ? size * 1.05 : 0;
    const w = Math.min(o.max ?? 1e9, textW(ctx, S, s, size, { weight: o.weight ?? 650 }) + padX * 2 + lead);
    const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    const y0 = y - h / 2;
    if (o.fill) {
      ctx.save(); rr(ctx, x0, y0, w, h, h / 2);
      ctx.shadowColor = rgba(o.fill, 0.6); ctx.shadowBlur = 26 * u;
      const g = ctx.createLinearGradient(x0, y0, x0 + w, y0 + h);
      g.addColorStop(0, rgba(mix(o.fill, WHITE, 0.15))); g.addColorStop(1, rgba(mix(o.fill, th.cols[2], 0.3)));
      ctx.fillStyle = g; ctx.fill(); ctx.shadowColor = "transparent";
      ctx.lineWidth = 1.4 * u; ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.stroke(); ctx.restore();
    } else glass(ctx, S, th, x0, y0, w, h, h / 2, { blur: 16, shadow: o.shadow ?? false, tintMul: 1.3 });
    const fg = o.fill ? (lum(o.fill) > 170 ? "#15171c" : "#ffffff") : o.color || th.inkS;
    if (o.dot) { glowDot(ctx, th, x0 + padX * 0.75 + size * 0.25, y, size * 0.16, o.dotColor || th.acc); }
    if (o.icon) icon(ctx, S, o.icon, x0 + padX * 0.6 + size * 0.38, y, size * 0.72, fg);
    txt(ctx, S, th, s, x0 + padX + lead, y + size * 0.04, size, { color: fg, weight: o.weight ?? 650, max: w - padX * 2 - lead, shadow: false });
    return { x: x0, y: y0, w, h };
  }

  // ---- wires --------------------------------------------------------------------------------------
  function bez(P, t) {
    const a = 1 - t;
    return [a * a * a * P[0][0] + 3 * a * a * t * P[1][0] + 3 * a * t * t * P[2][0] + t * t * t * P[3][0],
      a * a * a * P[0][1] + 3 * a * a * t * P[1][1] + 3 * a * t * t * P[2][1] + t * t * t * P[3][1]];
  }
  // A curve from a to b that leaves and lands along the given axis ("x" or "y").
  function curve(a, b, axis = "x", bend = 0.5) {
    if (axis === "x") { const d = (b[0] - a[0]) * bend; return [a, [a[0] + d, a[1]], [b[0] - d, b[1]], b]; }
    const d = (b[1] - a[1]) * bend; return [a, [a[0], a[1] + d], [b[0], b[1] - d], b];
  }
  // A connector belongs to the piece drawn just before it: the pane it leaves from.
  function wire(ctx, S, th, P, q, t, o = {}) {
    if (q <= 0.001) return;
    const u = S.u, N = 60;
    const pts = [];
    for (let i = 0; i <= N; i++) pts.push(bez(P, (i / N) * q));
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const c = o.color || th.acc;
    ctx.beginPath(); pts.forEach((pt, i) => (i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1])));
    ctx.strokeStyle = rgba(c, th.light ? 0.3 : 0.38); ctx.lineWidth = 10 * u; ctx.shadowColor = rgba(c, 0.9); ctx.shadowBlur = 22 * u; ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = rgba(mix(c, WHITE, th.light ? 0.1 : 0.6), 0.95); ctx.lineWidth = 2.6 * u; ctx.stroke();
    ctx.restore();
    // Start socket and leading glow.
    ctx.save();
    ctx.beginPath(); ctx.arc(P[0][0], P[0][1], 7 * u, 0, TAU); ctx.fillStyle = rgba(mix(c, WHITE, 0.5), 1); ctx.fill();
    ctx.lineWidth = 2 * u; ctx.strokeStyle = rgba(c, 0.6); ctx.beginPath(); ctx.arc(P[0][0], P[0][1], 13 * u, 0, TAU); ctx.stroke();
    const tip = pts[pts.length - 1];
    glowDot(ctx, th, tip[0], tip[1], 7 * u, c);
    // Travelling light once the wire is drawn.
    if (q > 0.98) {
      const n = (o.dots ?? 2) + 1, speed = o.speed ?? 0.7;
      for (let k = 0; k < n; k++) {
        const f = (((t * speed + k / n + (o.phase || 0)) % 1) + 1) % 1;
        const pt = bez(P, o.reverse ? 1 - f : f);
        ctx.globalAlpha *= 1;
        glowDot(ctx, th, pt[0], pt[1], 8.5 * u, c);
      }
    }
    ctx.restore();
  }

  // ---- objects in the world -----------------------------------------------------------------------
  function sphere(ctx, x, y, r, c, c2) {
    ctx.save();
    const halo = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 1.9);
    halo.addColorStop(0, rgba(c, 0.35)); halo.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = halo; ctx.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
    const g = ctx.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.04, x - r * 0.1, y - r * 0.1, r * 1.12);
    g.addColorStop(0, rgba(mix(c, WHITE, 0.9))); g.addColorStop(0.22, rgba(mix(c, WHITE, 0.3)));
    g.addColorStop(0.68, rgba(c)); g.addColorStop(1, rgba(mix(c, [10, 4, 40], 0.55)));
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = g; ctx.fill();
    ctx.clip();
    const b = ctx.createRadialGradient(x + r * 0.35, y + r * 0.55, 0, x + r * 0.35, y + r * 0.55, r * 0.85);
    b.addColorStop(0, rgba(c2 || c, 0.75)); b.addColorStop(1, rgba(c2 || c, 0));
    ctx.globalCompositeOperation = "screen"; ctx.fillStyle = b; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.globalCompositeOperation = "source-over";
    const sp = ctx.createRadialGradient(x - r * 0.4, y - r * 0.48, 0, x - r * 0.4, y - r * 0.48, r * 0.32);
    sp.addColorStop(0, "rgba(255,255,255,0.95)"); sp.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sp; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }
  // A glossy dial knob seen from slightly above; its notch turns with time.
  function knob(ctx, th, x, y, r, angle, c) {
    const ry = r * 0.5, hgt = r * 0.42;
    ctx.save();
    const halo = ctx.createRadialGradient(x, y + hgt, r * 0.5, x, y + hgt, r * 1.8);
    halo.addColorStop(0, rgba(c, 0.35)); halo.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = halo; ctx.fillRect(x - r * 2, y - r * 2, r * 4, r * 4.5);
    const side = ctx.createLinearGradient(x - r, 0, x + r, 0);
    side.addColorStop(0, rgba(mix(c, [10, 4, 40], 0.5))); side.addColorStop(0.35, rgba(mix(c, WHITE, 0.35)));
    side.addColorStop(0.6, rgba(c)); side.addColorStop(1, rgba(mix(c, [10, 4, 40], 0.6)));
    ctx.beginPath(); ctx.ellipse(x, y + hgt, r, ry, 0, 0, Math.PI); ctx.lineTo(x - r, y); ctx.ellipse(x, y, r, ry, 0, Math.PI, 0, true); ctx.closePath();
    ctx.fillStyle = side; ctx.fill();
    const top = ctx.createRadialGradient(x - r * 0.3, y - ry * 0.5, 0, x, y, r * 1.1);
    top.addColorStop(0, rgba(mix(c, WHITE, 0.75))); top.addColorStop(0.6, rgba(mix(c, WHITE, 0.25))); top.addColorStop(1, rgba(c));
    ctx.beginPath(); ctx.ellipse(x, y, r, ry, 0, 0, TAU); ctx.fillStyle = top; ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.025); ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.stroke();
    // Ticks round the rim, then the notch.
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.82, y + Math.sin(a) * ry * 0.82); ctx.lineTo(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * ry * 0.92); ctx.stroke();
    }
    const nx = x + Math.cos(angle) * r * 0.6, ny = y + Math.sin(angle) * ry * 0.6;
    ctx.lineWidth = r * 0.09; ctx.lineCap = "round"; ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath(); ctx.moveTo(x + Math.cos(angle) * r * 0.2, y + Math.sin(angle) * ry * 0.2); ctx.lineTo(nx, ny); ctx.stroke();
    glowDot(ctx, th, nx, ny, r * 0.06, th.acc);
    ctx.restore();
  }

  // A simple original character inside a round frame: a head, a hair shape and shoulders.
  function person(ctx, th, cx, cy, d, k) {
    const c = th.cols[k % 4], c2 = th.cols[(k + 1) % 4];
    const r = d / 2;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
    const bg = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    bg.addColorStop(0, rgba(mix(c, WHITE, 0.25), 0.9)); bg.addColorStop(1, rgba(mix(c2, [20, 10, 60], 0.2), 0.9));
    ctx.fillStyle = bg; ctx.fillRect(cx - r, cy - r, d, d);
    const skin = [[255, 222, 196], [232, 180, 140], [196, 140, 104], [150, 100, 72], [246, 206, 172], [120, 82, 60]][k % 6];
    const hair = mix(c2, [24, 14, 40], 0.65);
    // Shoulders.
    ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.98, r * 0.72, r * 0.52, 0, Math.PI, 0); ctx.closePath();
    ctx.fillStyle = rgba(mix(c2, WHITE, 0.15)); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - r * 0.18, cy + r * 0.47); ctx.lineTo(cx, cy + r * 0.62); ctx.lineTo(cx + r * 0.18, cy + r * 0.47);
    ctx.fillStyle = rgba(skin); ctx.fill();
    // Neck and head.
    ctx.fillStyle = rgba(mix(skin, [0, 0, 0], 0.08)); ctx.fillRect(cx - r * 0.12, cy + r * 0.12, r * 0.24, r * 0.38);
    ctx.beginPath(); ctx.ellipse(cx, cy - r * 0.08, r * 0.3, r * 0.34, 0, 0, TAU); ctx.fillStyle = rgba(skin); ctx.fill();
    ctx.fillStyle = rgba(hair);
    const style = k % 4;
    ctx.beginPath();
    if (style === 0) { ctx.ellipse(cx, cy - r * 0.26, r * 0.33, r * 0.2, 0, Math.PI, 0); ctx.fill(); }
    else if (style === 1) { ctx.arc(cx, cy - r * 0.12, r * 0.36, Math.PI * 0.95, Math.PI * 2.05); ctx.lineTo(cx + r * 0.36, cy + r * 0.3); ctx.lineTo(cx + r * 0.26, cy + r * 0.3); ctx.lineTo(cx + r * 0.26, cy - r * 0.1); ctx.lineTo(cx - r * 0.26, cy - r * 0.1); ctx.lineTo(cx - r * 0.26, cy + r * 0.3); ctx.lineTo(cx - r * 0.36, cy + r * 0.3); ctx.closePath(); ctx.fill(); }
    else if (style === 2) { ctx.ellipse(cx, cy - r * 0.27, r * 0.32, r * 0.17, 0, Math.PI, 0); ctx.fill(); ctx.beginPath(); ctx.arc(cx + r * 0.22, cy - r * 0.45, r * 0.13, 0, TAU); ctx.fill(); }
    else { ctx.ellipse(cx, cy - r * 0.3, r * 0.34, r * 0.13, -0.15, Math.PI, 0); ctx.fill(); ctx.fillRect(cx - r * 0.34, cy - r * 0.32, r * 0.68, r * 0.06); }
    ctx.fillStyle = "rgba(30,20,50,0.75)";
    ctx.beginPath(); ctx.arc(cx - r * 0.11, cy - r * 0.06, r * 0.035, 0, TAU); ctx.arc(cx + r * 0.11, cy - r * 0.06, r * 0.035, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // ---- background world ---------------------------------------------------------------------------
  const ORBS = [
    { x: 0.1, y: 0.18, r: 0.62, c: 0, ax: 0.07, ay: 0.06, f: 0.045 },
    { x: 0.86, y: 0.14, r: 0.55, c: 1, ax: 0.06, ay: 0.07, f: 0.038 },
    { x: 0.62, y: 0.96, r: 0.72, c: 2, ax: 0.08, ay: 0.05, f: 0.03 },
    { x: 0.04, y: 0.98, r: 0.5, c: 3, ax: 0.05, ay: 0.05, f: 0.05 },
    { x: 0.45, y: 0.42, r: 0.3, c: 0, ax: 0.09, ay: 0.08, f: 0.034 },
    { x: 1.02, y: 0.72, r: 0.5, c: 3, ax: 0.05, ay: 0.06, f: 0.041 },
    { x: 0.32, y: 0.02, r: 0.4, c: 2, ax: 0.06, ay: 0.04, f: 0.052 },
  ];
  function field(ctx, W, H, t, accent, look, px = 0, py = 0, scaled = true) {
    const light = lum(rgb(look.bg)) > 150;
    const deep = look.deep || ["#1a1040", "#120c2b", "#0c1a33"];
    const m = Math.max(W, H);
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, deep[0]); g.addColorStop(0.55, deep[1]); g.addColorStop(1, deep[2]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const tex = scaled ? look.texture ?? 1 : 1;
    const cols = (look.orbColors || []).map((c) => rgb(c || accent));
    ctx.save();
    ORBS.forEach((o, i) => {
      const r = o.r * m;
      const span = W + r * 2;
      let x = (o.x + Math.sin(t * o.f * TAU + i) * o.ax) * W - px * (0.6 + i * 0.08);
      x = ((((x + r) % span) + span) % span) - r;
      let y = (o.y + Math.cos(t * o.f * TAU + i * 1.7) * o.ay) * H - py * (0.6 + i * 0.08);
      const spanY = H + r * 2;
      y = ((((y + r) % spanY) + spanY) % spanY) - r;
      const c = cols[o.c % cols.length] || rgb(accent);
      const a = (light ? 0.7 : 0.82) * (0.2 + 0.8 * tex);
      const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rgba(c, a)); gr.addColorStop(0.3, rgba(c, a * 0.62)); gr.addColorStop(0.62, rgba(c, a * 0.14)); gr.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    });
    ctx.restore();
    if (!light) {
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, m * 0.75);
      v.addColorStop(0, "rgba(4,2,20,0)"); v.addColorStop(1, "rgba(4,2,20,0.6)");
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    }
  }

  // Defocused glass cards far behind everything: drawn small, blurred, scaled up.
  function farLayer(ctx, S, th, t, cam) {
    const { W, H, u } = S, k = 4;
    const a = buf("farA", W / k, H / k), b = buf("farB", W / k, H / k);
    const ac = a.getContext("2d"), bc = b.getContext("2d");
    ac.setTransform(1, 0, 0, 1, 0, 0); ac.clearRect(0, 0, a.width, a.height); ac.scale(1 / k, 1 / k);
    const r = rng(42);
    const tileW = W * 1.4, tileH = H * 1.4;
    for (let i = 0; i < 9; i++) {
      const w = (180 + r() * 260) * u, h = (110 + r() * 200) * u;
      const bx = r() * tileW, by = r() * tileH;
      let x = bx - cam.x * 0.35 + Math.sin(t * 0.13 + i) * 20 * u;
      let y = by - cam.y * 0.35 + Math.cos(t * 0.11 + i * 2) * 16 * u;
      x = ((((x + 300 * u) % tileW) + tileW) % tileW) - 300 * u;
      y = ((((y + 260 * u) % tileH) + tileH) % tileH) - 260 * u;
      rr(ac, x, y, w, h, 26 * u);
      ac.fillStyle = th.light ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.1)"; ac.fill();
      ac.lineWidth = 3 * u; ac.strokeStyle = "rgba(255,255,255,0.35)"; ac.stroke();
      ac.fillStyle = rgba(th.cols[i % 4], 0.85);
      ac.beginPath(); ac.arc(x + 40 * u, y + 40 * u, 18 * u, 0, TAU); ac.fill();
      ac.fillStyle = "rgba(255,255,255,0.35)";
      rr(ac, x + 72 * u, y + 30 * u, w * 0.45, 14 * u, 7 * u); ac.fill();
      rr(ac, x + 30 * u, y + h - 50 * u, w * 0.6, 12 * u, 6 * u); ac.fill();
    }
    bc.clearRect(0, 0, b.width, b.height);
    bc.filter = `blur(${(2.4 * u).toFixed(2)}px)`; bc.drawImage(a, 0, 0); bc.filter = "none";
    ctx.save(); ctx.globalAlpha *= 0.7 * (0.4 + 0.6 * th.tex); ctx.drawImage(b, 0, 0, W, H); ctx.restore();
  }

  // Floating glossy objects. "mid" sit behind the panels (and get frosted by them); "fore" pass in front.
  const FLOAT = {
    mid: [
      { kind: "sphere", x: 0.83, y: 0.2, r: 0.085, c: 0, c2: 1, par: 0.55 },
      { kind: "sphere", x: 0.17, y: 0.8, r: 0.065, c: 1, c2: 2, par: 0.6 },
      { kind: "sphere", x: 0.4, y: 0.16, r: 0.036, c: 3, c2: 0, par: 0.7 },
      { kind: "sphere", x: 0.95, y: 0.62, r: 0.05, c: 3, c2: 0, par: 0.65 },
    ],
    fore: [
      { kind: "sphere", x: 0.012, y: 0.5, r: 0.05, c: 2, c2: 0, par: 0.5, blur: 4 },
      { kind: "sphere", x: 0.985, y: 0.95, r: 0.034, c: 3, c2: 1, par: 0.7, blur: 2 },
    ],
  };
  function floaters(ctx, S, th, t, cam, layer) {
    const { W, H, u } = S, m = Math.min(W, H);
    FLOAT[layer].forEach((f, i) => {
      const r = f.r * m * (S.tall ? 1.15 : 1);
      const fx = S.tall ? f.y * 0.9 + 0.05 : f.x, fy = S.tall ? f.x : f.y;
      const spanX = W + r * 5, spanY = H + r * 5;
      let x = fx * W + Math.sin(t * 0.21 + i * 1.9) * 26 * u;
      let y = fy * H + Math.cos(t * 0.17 + i * 1.3) * 30 * u;
      if (layer === "fore") { x += cam.ox * f.par; y += cam.oy * f.par; }
      else {
        x -= cam.x * f.par; y -= cam.y * f.par;
        x = ((((x + r * 2.5) % spanX) + spanX) % spanX) - r * 2.5;
        y = ((((y + r * 2.5) % spanY) + spanY) % spanY) - r * 2.5;
      }
      ctx.save();
      if (layer === "mid" && FRAME.drawn) ctx.globalAlpha *= clamp((y - r - H * (S.tall ? 0.2 : 0.22)) / (H * 0.08));
      if (ctx.globalAlpha <= 0.01) { ctx.restore(); return; }
      if (f.blur) ctx.filter = `blur(${f.blur * u}px)`;
      if (f.kind === "sphere") sphere(ctx, x, y, r, th.cols[f.c], th.cols[f.c2]);
      else knob(ctx, th, x, y, r, t * 0.9 + i, mix(th.cols[f.c], th.acc, 0.3));
      ctx.restore();
    });
  }

  // A slow diagonal light sweep and two vivid orbs that drift under the panel area, so every pane
  // has a moving shape to frost.
  function backLights(ctx, S, th, info) {
    const { W, H, u } = S, m = Math.min(W, H), t = info.t;
    ctx.save();
    const pos = ((t * 0.085) % 1.5) - 0.25;
    const bx = pos * (W + H);
    const g = ctx.createLinearGradient(bx - W * 0.22, 0, bx + W * 0.22, H * 0.35);
    g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, `rgba(255,255,255,${th.light ? 0.3 : 0.11})`); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.globalCompositeOperation = th.light ? "source-over" : "screen";
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.restore();
    const drifters = [
      { x0: 0.18, x1: 0.62, y: 0.6, r: 0.13, c: th.cols[1], c2: th.cols[2], ph: 0 },
      { x0: 0.88, x1: 0.42, y: 0.78, r: 0.1, c: th.cols[3], c2: th.cols[0], ph: 2 },
    ];
    drifters.forEach((dd) => {
      // Positions follow the world camera (continuous across scenes) and wrap far off-frame.
      const r = dd.r * m, span = W + r * 6, spanY = H + r * 6;
      let x = dd.x0 * W + (dd.x1 - dd.x0) * W * Math.sin(t * 0.07 + dd.ph) - CAM.x * 0.85 + Math.sin(t * 0.6 + dd.ph) * 30 * u;
      let y = (S.tall ? dd.y * 0.9 + 0.08 : dd.y) * H - CAM.y * 0.85 + Math.cos(t * 0.5 + dd.ph) * 40 * u;
      x = ((((x + r * 3) % span) + span) % span) - r * 3;
      y = ((((y + r * 3) % spanY) + spanY) % spanY) - r * 3;
      ctx.save(); ctx.globalAlpha *= 0.9 * (0.4 + 0.6 * th.tex);
      sphere(ctx, x, y, dd.r * m, dd.c, dd.c2);
      ctx.restore();
    });
  }

  // ---- camera -------------------------------------------------------------------------------------
  // Scenes sit at points in one world; the camera glides from each to the next across the change,
  // easing out of one and into the other at the same speed, with a slight pull back mid-glide.
  const DIRS = [[1, 0], [0.82, 0.57], [1, -0.18], [0.78, -0.62], [1, 0.32], [0.9, 0.44]];
  let CAM = { ox: 0, oy: 0, s: 1, a: 1, x: 0, y: 0 };
  // One glide per change, on a single clock that starts `PRE` seconds before the cut and ends when the
  // change finishes. The outgoing layout (drawn through the change via the template's overlap) and the
  // incoming one sit one step apart in the world and move together, like a camera panning across.
  const PRE = 0.55;
  function camFor(S, idx, local, hold, hasNext, change, exit) {
    const { W, H, tall } = S;
    const D = tall ? H * 0.5 : W * 0.78;
    const dir = (k) => { const d = DIRS[k % DIRS.length]; return tall ? [d[1] * 0.6, d[0]] : d; };
    let wx = 0, wy = 0;
    for (let k = 1; k <= idx; k++) { const d = dir(k); wx += d[0] * D; wy += d[1] * D; }
    const T = PRE + change;
    let ox = 0, oy = 0, s = 1, a = 1, blur = 0;
    // A slow push-in across the hold keeps every frame alive.
    const drift = clamp(local / Math.max(1, hold));
    s *= 1 + 0.07 * drift; ox -= 70 * S.u * drift * (tall ? 0.3 : 1); oy -= 30 * S.u * drift;
    if (hasNext && local > hold - PRE) {
      const g = eio((local - (hold - PRE)) / T), d = dir(idx + 1);
      ox -= g * D * d[0]; oy -= g * D * d[1];
      s *= 1 - 0.06 * Math.sin(Math.PI * g);
      if (exit !== undefined) { a *= 1 - eio(exit); blur = 10 * S.u * eo(exit); s *= 1 - 0.05 * exit; }
    }
    if (idx > 0 && local < change) {
      const g = eio((local + PRE) / T), d = dir(idx);
      ox += (1 - g) * D * d[0]; oy += (1 - g) * D * d[1];
      s *= 1 - 0.06 * Math.sin(Math.PI * g);
      a *= 0.55 + 0.45 * seg(local, 0, change * 0.7);
      blur = 7 * S.u * (1 - seg(local, 0, change));
    } else if (idx === 0 && local < 0.6) {
      s *= 1 + 0.05 * (1 - eo(local / 0.6));
      a *= seg(local, 0, 0.08);
    }
    return { ox, oy, s, a, blur, idx, x: wx - ox, y: wy - oy };
  }
  function camera(S, info) {
    return camFor(S, Math.max(0, info.index), info.local, info.hold, Boolean(info.next), info.change);
  }
  function applyCam(ctx, S) {
    ctx.translate(S.W / 2 + CAM.ox, S.H / 2 + CAM.oy);
    ctx.scale(CAM.s, CAM.s);
    ctx.translate(-S.W / 2, -S.H / 2);
  }
  // Rise into place: fade, lift and a slight scale settle.
  function pop(ctx, q, cx, cy, dy) {
    ctx.globalAlpha *= clamp(q * 1.8);
    const s = 0.93 + 0.07 * back(q);
    ctx.translate(cx, cy + dy * (1 - eo(q)));
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);
  }

  function fore(ctx, S, th, t) {
    // Foreground light and grain are the look's front layer, over every piece.
    if (S.pieceScope) S.pieceScope("front");
    if (S.paint) floaters(ctx, S, th, t, CAM, "fore");
    if (th.tex > 0) {
      ctx.save();
      const f = Math.floor(t * 24);
      const r = rng(f * 7919 + 3);
      ctx.translate(-r() * 192, -r() * 192);
      ctx.globalCompositeOperation = "overlay";
      ctx.globalAlpha = 0.05 * th.tex;
      ctx.fillStyle = ctx.createPattern(noise(), "repeat");
      ctx.fillRect(0, 0, S.W + 192, S.H + 192);
      ctx.restore();
    }
  }

  // ---- reusable widgets ---------------------------------------------------------------------------
  function timelineWidget(ctx, S, th, x, y, w, h, t, seed = 3) {
    const u = S.u;
    glass(ctx, S, th, x, y, w, h, 30 * u);
    const pad = 26 * u;
    const rows = 3, rh = (h - pad * 2 - 28 * u) / rows;
    const r = rng(seed);
    // Ruler.
    ctx.save();
    ctx.strokeStyle = th.faint; ctx.lineWidth = 1.4 * u;
    for (let i = 0; i <= 16; i++) { const xx = x + pad + ((w - pad * 2) * i) / 16; ctx.beginPath(); ctx.moveTo(xx, y + pad); ctx.lineTo(xx, y + pad + (i % 4 ? 8 : 16) * u); ctx.stroke(); }
    ctx.restore();
    for (let row = 0; row < rows; row++) {
      let cx = x + pad;
      const yy = y + pad + 28 * u + row * rh;
      while (cx < x + w - pad - 40 * u) {
        const cw = Math.min((80 + r() * 200) * u, x + w - pad - cx);
        const c = row === 0 ? th.cols[(cx | 0) % 3 === 0 ? 0 : 2] : row === 1 ? th.cols[1] : th.cols[3];
        rr(ctx, cx, yy + 4 * u, cw - 8 * u, rh - 10 * u, 10 * u);
        const g = ctx.createLinearGradient(cx, yy, cx, yy + rh);
        g.addColorStop(0, rgba(mix(c, WHITE, 0.2), 0.85)); g.addColorStop(1, rgba(c, 0.55));
        ctx.fillStyle = g; ctx.fill();
        ctx.lineWidth = 1.2 * u; ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.stroke();
        if (row === 2) { ctx.save(); ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 1.6 * u; ctx.beginPath(); for (let i = 0; i < cw - 24 * u; i += 6 * u) { const a = (0.2 + 0.8 * Math.abs(Math.sin(i * 0.09 + row))) * (rh - 26 * u) / 2; ctx.moveTo(cx + 8 * u + i, yy + rh / 2 - a); ctx.lineTo(cx + 8 * u + i, yy + rh / 2 + a); } ctx.stroke(); ctx.restore(); }
        cx += cw;
      }
    }
    // Playhead.
    const ph = x + pad + ((t * 0.12) % 1) * (w - pad * 2);
    ctx.save();
    ctx.strokeStyle = rgba(mix(th.acc, WHITE, 0.4)); ctx.lineWidth = 3 * u; ctx.shadowColor = rgba(th.acc); ctx.shadowBlur = 16 * u;
    ctx.beginPath(); ctx.moveTo(ph, y + pad); ctx.lineTo(ph, y + h - pad); ctx.stroke();
    ctx.restore();
    glowDot(ctx, th, ph, y + pad, 7 * u);
  }
  function waveWidget(ctx, S, th, x, y, w, h, t) {
    const u = S.u;
    glass(ctx, S, th, x, y, w, h, 30 * u);
    chip(ctx, S, th, x + 24 * u, y + 24 * u, 60 * u, "wave", 1);
    const n = Math.floor((w - 48 * u) / (14 * u));
    const base = y + h - 30 * u, top = y + 104 * u;
    for (let i = 0; i < n; i++) {
      const a = 0.25 + 0.75 * Math.abs(Math.sin(i * 0.55 + t * 2.6) * Math.cos(i * 0.21 - t * 1.3));
      const bh = Math.max(6 * u, (base - top) * a);
      const c = mix(th.acc, th.cols[0], i / n);
      bar(ctx, x + 24 * u + i * 14 * u, base - bh, 7 * u, bh, rgba(c, 0.9));
    }
    txt(ctx, S, th, "Audio", x + 104 * u, y + 54 * u, 42 * u, { weight: 700, max: w - 130 * u });
  }
  function knobWidget(ctx, S, th, x, y, w, h, t) {
    const u = S.u;
    glass(ctx, S, th, x, y, w, h, 30 * u);
    const r = Math.min(w, h) * 0.3;
    knob(ctx, th, x + w / 2, y + h * 0.45, r, -Math.PI * 0.8 + Math.sin(t * 0.8) * 1.2 + 1.2, mix(th.acc, th.cols[2], 0.4));
    const tw = w - 60 * u, ty = y + h - 34 * u;
    bar(ctx, x + 30 * u, ty, tw, 10 * u, th.faint);
    const f = 0.5 + Math.sin(t * 0.8) * 0.3;
    bar(ctx, x + 30 * u, ty, tw * f, 10 * u, rgba(th.acc, 0.9));
    glowDot(ctx, th, x + 30 * u + tw * f, ty + 5 * u, 6 * u);
  }
  function avatarRow(ctx, S, th, x, y, d, n, t) {
    const u = S.u;
    const w = d * (1 + (n - 1) * 0.68) + 36 * u;
    glass(ctx, S, th, x, y, w, d + 28 * u, (d + 28 * u) / 2, { blur: 20 });
    for (let i = 0; i < n; i++) {
      const cx = x + 14 * u + d / 2 + i * d * 0.68, cy = y + 14 * u + d / 2;
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, d / 2 + 3 * u, 0, TAU); ctx.fillStyle = th.light ? "#ffffff" : "rgba(255,255,255,0.85)"; ctx.fill(); ctx.restore();
      person(ctx, th, cx, cy, d, i + 1);
    }
    const lx = x + w - 2 * u, ly = y + 12 * u;
    ctx.save(); ctx.beginPath(); ctx.arc(lx, ly, 9 * u + Math.sin(t * 4) * 1.5 * u, 0, TAU); ctx.fillStyle = rgba(th.acc); ctx.shadowColor = rgba(th.acc); ctx.shadowBlur = 16 * u; ctx.fill(); ctx.restore();
    return w;
  }
  function notifyWidget(ctx, S, th, x, y, w, h, t) {
    const u = S.u;
    glass(ctx, S, th, x, y, w, h, Math.min(30 * u, h / 2), { blur: 22 });
    const cs = h - 36 * u;
    chip(ctx, S, th, x + 18 * u, y + 18 * u, cs, "check", 0);
    txt(ctx, S, th, "Card ready", x + cs + 40 * u, y + h / 2 + 2 * u, 42 * u, { weight: 700, max: w - cs - 110 * u });
    const pr = (t * 0.8) % 1;
    ctx.save(); ctx.strokeStyle = rgba(th.acc, 1 - pr); ctx.lineWidth = 2.5 * u;
    ctx.beginPath(); ctx.arc(x + w - 34 * u, y + h / 2, 8 * u + pr * 14 * u, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + w - 34 * u, y + h / 2, 8 * u, 0, TAU); ctx.fillStyle = rgba(th.acc); ctx.fill(); ctx.restore();
  }
  function slider(ctx, S, th, x, y, w, f, c = th.acc) {
    const u = S.u;
    bar(ctx, x, y - 5 * u, w, 10 * u, th.faint);
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, rgba(mix(c, th.cols[2], 0.4), 0.9)); g.addColorStop(1, rgba(c, 1));
    bar(ctx, x, y - 5 * u, Math.max(10 * u, w * f), 10 * u, g);
    const kx = x + w * f;
    ctx.save(); ctx.beginPath(); ctx.arc(kx, y, 15 * u, 0, TAU); ctx.fillStyle = "#ffffff"; ctx.shadowColor = rgba(c, 0.9); ctx.shadowBlur = 18 * u; ctx.fill(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.arc(kx, y, 6 * u, 0, TAU); ctx.fillStyle = rgba(c); ctx.fill(); ctx.restore();
  }
  // A miniature preview frame: a gradient landscape with a sphere sun and a play button.
  function preview(ctx, S, th, x, y, w, h, r, t, play = true) {
    const u = S.u;
    ctx.save();
    rr(ctx, x, y, w, h, r); ctx.clip();
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, rgba(mix(th.cols[2], [10, 6, 40], 0.2))); g.addColorStop(0.6, rgba(th.cols[0])); g.addColorStop(1, rgba(th.cols[3]));
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    sphere(ctx, x + w * (0.68 + Math.sin(t * 0.4) * 0.04), y + h * 0.4, h * 0.17, mix(th.cols[3], WHITE, 0.3), th.cols[0]);
    for (let k = 0; k < 2; k++) {
      ctx.beginPath(); ctx.moveTo(x, y + h);
      for (let i = 0; i <= 24; i++) { const xx = x + (w * i) / 24; ctx.lineTo(xx, y + h * (0.68 + k * 0.12) + Math.sin(i * 0.6 + k * 2 + t * 0.5) * h * 0.06); }
      ctx.lineTo(x + w, y + h); ctx.closePath();
      ctx.fillStyle = rgba(mix(th.cols[k ? 1 : 2], [10, 6, 40], 0.35 + k * 0.15), 0.85); ctx.fill();
    }
    ctx.restore();
    ctx.save(); rr(ctx, x, y, w, h, r); ctx.lineWidth = 1.4 * u; ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.stroke(); ctx.restore();
    if (play) {
      const pr = Math.min(w, h) * 0.13;
      glass(ctx, S, th, x + w / 2 - pr, y + h / 2 - pr, pr * 2, pr * 2, pr, { blur: 14, shadow: false, tintMul: 1.6 });
      icon(ctx, S, "play", x + w / 2 + pr * 0.08, y + h / 2, pr * 0.9, "#ffffff");
    }
  }

  // ---- statements (title and closing) -------------------------------------------------------------
  const MEASURE = {};
  function measureStatement(S, id) {
    const el = document.getElementById(id);
    if (!el) return null;
    const key = id + "|" + el.textContent + "|" + el.style.fontSize + "|" + S.W;
    if (MEASURE[key]) return MEASURE[key];
    const c = buf("measure", 4, 4).getContext("2d");
    const size = parseFloat(el.style.fontSize) || 110 * S.u;
    const maxW = parseFloat(el.style.width) || S.W * 0.8;
    c.font = font(S, size, S.look.displayWeight, "display");
    try { c.letterSpacing = `${-0.02 * size}px`; } catch (err) { /* older canvas */ }
    const words = String(el.textContent).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (const w of words) { const next = line ? line + " " + w : w; if (line && c.measureText(next).width > maxW) { lines.push(line); line = w; } else line = next; }
    if (line) lines.push(line);
    let wMax = Math.max(1, ...lines.map((l) => c.measureText(l).width));
    let hC = lines.length * size * 1.04;
    let kick = 0;
    if (id === "title") {
      const k = document.getElementById("kicker");
      if (k && k.textContent) {
        const ks = parseFloat(k.style.fontSize) || 30 * S.u;
        c.font = font(S, ks, 600, "body");
        const kw = c.measureText(k.textContent.toUpperCase()).width + k.textContent.length * ks * 0.12 + ks * 3.4;
        kick = ks * 2.2 + (parseFloat(k.style.marginBottom) || 24 * S.u);
        wMax = Math.max(wMax, kw);
        hC += kick;
      }
    }
    const side = parseFloat(el.parentElement && el.parentElement.style.paddingLeft) || 140 * S.u;
    return (MEASURE[key] = { x: side, y: (S.H - hC) / 2, w: wMax, h: hC, size });
  }

  function statement(ctx, S, th, info) {
    // The card and its widgets are pieces of the title or closing scene, though the stage draws them.
    if (S.pieceScope) S.pieceScope(info.scene);
    const { W, H, u, tall } = S;
    const t = info.t, local = info.local;
    const R = measureStatement(S, info.scene);
    if (!R) return;
    const padX = 64 * u, padY = 54 * u;
    const card = { x: R.x - padX, y: R.y - padY, w: Math.min(W - R.x * 2 + padX * 2, R.w + padX * 2), h: R.h + padY * 2 };
    const qIn = eo(local / 0.35);
    const closing = info.scene === "closing";
    // Widgets live in the bands above and below the words and drift with the camera.
    ctx.save();
    applyCam(ctx, S);
    ctx.globalAlpha *= CAM.a;
    const topBand = { y: 40 * u, h: card.y - 70 * u }, botBand = { y: card.y + card.h + 40 * u, h: H - (card.y + card.h) - 80 * u };
    const appear = (i) => eo(seg(local, i * 0.1, 0.6 + i * 0.1));
    if (!closing) {
      if (topBand.h > 120 * u) {
        const d = Math.min(96 * u, topBand.h - 40 * u);
        ctx.save(); pop(ctx, appear(1), W - R.x - 300 * u, topBand.y, -30 * u);
        const aw = d * (1 + 2 * 0.68) + 36 * u;
        as("avatars", () => avatarRow(ctx, S, th, W - R.x - aw, topBand.y + (topBand.h - d - 28 * u) / 2, d, 3, t));
        ctx.restore();
        if (!tall) {
          ctx.save(); pop(ctx, appear(2), R.x + 200 * u, topBand.y, -30 * u);
          const nh = Math.min(120 * u, topBand.h - 30 * u), y0 = topBand.y + (topBand.h - nh) / 2;
          as("notice", () => notifyWidget(ctx, S, th, R.x - padX, y0, 430 * u, nh, t));
          ctx.restore();
        }
      }
      if (botBand.h > 160 * u) {
        const h = Math.min(botBand.h, tall ? 300 * u : 250 * u);
        const y0 = botBand.y + (botBand.h - h) / 2;
        const x0 = card.x, full = tall ? W - card.x * 2 : W - card.x * 2;
        const tw = tall ? full : full * 0.58;
        ctx.save(); pop(ctx, appear(0), x0 + tw / 2, y0, 50 * u); as("timeline", () => timelineWidget(ctx, S, th, x0, y0, tw, h, t)); ctx.restore();
        if (!tall) {
          const gx = x0 + tw + 32 * u, rest = full - tw - 32 * u;
          ctx.save(); pop(ctx, appear(1), gx, y0, 50 * u); as("meter", () => waveWidget(ctx, S, th, gx, y0, rest * 0.55, h, t)); ctx.restore();
          ctx.save(); pop(ctx, appear(2), gx + rest * 0.6, y0, 50 * u); as("dial", () => knobWidget(ctx, S, th, gx + rest * 0.55 + 28 * u, y0, rest * 0.45 - 28 * u, h, t)); ctx.restore();
        }
      }
      if (tall && topBand.h > 420 * u) {
        const h = Math.min(260 * u, topBand.h - 200 * u);
        const y0 = topBand.y + topBand.h - h;
        ctx.save(); pop(ctx, appear(2), W / 2, y0, -40 * u);
        as("meter", () => waveWidget(ctx, S, th, card.x, y0, (W - card.x * 2) * 0.55, h, t));
        as("dial", () => knobWidget(ctx, S, th, card.x + (W - card.x * 2) * 0.55 + 28 * u, y0, (W - card.x * 2) * 0.45 - 28 * u, h, t));
        ctx.restore();
      }
    }
    ctx.restore();
    // Orbiting chips for the closing: those behind the card are frosted by it.
    const cx = card.x + card.w / 2, cy = card.y + card.h / 2;
    const rx = Math.min(W / 2 - 80 * u, card.w / 2 + 90 * u), ry = Math.min(cy - 100 * u, H - cy - 100 * u, card.h / 2 + (tall ? 300 : 170) * u);
    const names = ["check", "sliders", "play", "spark", "layers", "dial", "wave", "film"];
    const orbit = (front) => {
      if (!closing) return;
      ctx.save(); ctx.globalAlpha *= CAM.a;
      names.forEach((nm, i) => {
        const a = (i / names.length) * TAU + t * 0.32;
        const depth = Math.sin(a);
        if ((depth > 0) !== front) return;
        const q = eo(seg(local, 0.1 + i * 0.07, 0.8 + i * 0.07));
        const s = (124 + depth * 30) * u * (0.6 + 0.4 * q);
        const x = cx + Math.cos(a) * rx * (0.7 + 0.3 * q), y = cy + depth * ry * (0.7 + 0.3 * q);
        ctx.save(); ctx.globalAlpha *= clamp(q * 1.5) * (0.75 + 0.25 * depth);
        if (S.piece) S.piece("chip-" + nm);
        chip(ctx, S, th, x - s / 2, y - s / 2, s, nm, i);
        ctx.restore();
      });
      ctx.restore();
    };
    if (closing) {
      if (S.piece) S.piece("ring");
      ctx.save(); ctx.globalAlpha *= CAM.a * eo(seg(local, 0.1, 0.9));
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
      ctx.setLineDash([2 * u, 14 * u]); ctx.lineCap = "round"; ctx.lineWidth = 3 * u; ctx.strokeStyle = rgba(th.ink, 0.35); ctx.stroke(); ctx.setLineDash([]);
      for (let k = 0; k < 3; k++) { if (S.piece) S.piece("dot-" + (k + 1)); const a = t * 0.9 + (k * TAU) / 3; glowDot(ctx, th, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 7 * u); }
      ctx.restore();
    }
    orbit(false);
    // The card holding the words: screen-fixed, so it stays under the type through the glide.
    ctx.save();
    ctx.globalAlpha *= CAM.a;
    const sc = 0.96 + 0.04 * qIn;
    // Once its words have gone (after the cut) the card travels with the camera like every other pane.
    if (info.local > info.hold) applyCam(ctx, S);
    ctx.translate(cx, cy); ctx.scale(sc * (closing ? 1 : CAM.s), sc * (closing ? 1 : CAM.s)); ctx.translate(-cx, -cy);
    ctx.globalAlpha *= clamp(qIn * 1.4);
    glass(ctx, S, th, card.x, card.y, card.w, card.h, 40 * u, { blur: 40, glow: closing ? 0.55 * eo(seg(local, 0.3, 1)) : 0.25, piece: "card" });
    // Window controls on the card's corner.
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(card.x + card.w - 40 * u - i * 26 * u, card.y + 34 * u, 7 * u, 0, TAU); ctx.fillStyle = rgba(i === 2 ? th.acc : th.ink, i === 2 ? 0.9 : 0.35); ctx.fill(); }
    ctx.restore();
    orbit(true);
    // Closing seal: an approval mark beside (or under) the words, ringed by pulses.
    if (closing) {
      const room = W - (card.x + card.w);
      let sx = 0, sy = 0, sr = 0;
      if (room > 360 * u) { sr = Math.min(130 * u, room / 2 - 50 * u); sx = card.x + card.w + room / 2; sy = cy; }
      else if (H - (card.y + card.h) > 420 * u) { sr = 130 * u; sx = W / 2; sy = card.y + card.h + 230 * u; }
      const q = back(seg(local, 0.45, 0.95));
      if (S.piece) S.piece("seal");
      if (sr > 0 && q > 0) {
        ctx.save(); ctx.globalAlpha *= CAM.a;
        for (let k = 0; k < 2; k++) {
          const pr = ((t * 0.6 + k * 0.5) % 1);
          ctx.beginPath(); ctx.arc(sx, sy, sr * (1.05 + pr * 0.6), 0, TAU); ctx.lineWidth = 3 * u; ctx.strokeStyle = rgba(th.acc, 0.6 * (1 - pr) * clamp(q)); ctx.stroke();
        }
        ctx.translate(sx, sy); ctx.scale(q, q); ctx.translate(-sx, -sy);
        glass(ctx, S, th, sx - sr, sy - sr, sr * 2, sr * 2, sr, { blur: 30, glow: 0.8, piece: false });
        const ir = sr * 0.66;
        ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, ir, 0, TAU);
        const g = ctx.createLinearGradient(sx - ir, sy - ir, sx + ir, sy + ir); g.addColorStop(0, rgba(mix(th.acc, WHITE, 0.15))); g.addColorStop(1, rgba(mix(th.acc, th.cols[2], 0.6)));
        ctx.shadowColor = rgba(th.acc); ctx.shadowBlur = 40 * u; ctx.fillStyle = g; ctx.fill(); ctx.restore();
        icon(ctx, S, "check", sx, sy, ir * 1.0, lum(th.acc) > 175 ? "#15171c" : "#ffffff");
        ctx.restore();
      }
    }
  }

  // ---- scene drawers ------------------------------------------------------------------------------
  function area(S, box) {
    const u = S.u;
    return S.tall ? { x: box.x, y: box.y - 50 * u, w: box.w, h: box.h + 110 * u } : { x: box.x - 30 * u, y: box.y - 40 * u, w: box.w + 60 * u, h: box.h + 72 * u };
  }
  // A small frosted toolbar balancing a headline that leaves the top right empty.
  const CUR = { scene: null };
  function toolbar(ctx, S, th, t, local, scene) {
    const el = document.getElementById(scene + "-title");
    if (!el || !el.textContent) return;
    const u = S.u, size = parseFloat(el.style.fontSize) || 72 * u;
    const side = parseFloat(el.parentElement && el.parentElement.style.paddingLeft) || 140 * u;
    const c = buf("measure", 4, 4).getContext("2d");
    c.font = font(S, size, S.look.displayWeight, "display");
    const words = String(el.textContent).split(/\s+/).filter(Boolean);
    const maxW = S.W - side * 2;
    let line = "", lines = [];
    for (const w of words) { const n = line ? line + " " + w : w; if (line && c.measureText(n).width > maxW) { lines.push(line); line = w; } else line = n; }
    if (line) lines.push(line);
    const lw = Math.max(...lines.map((l) => c.measureText(l).width));
    const bw = 3 * 78 * u + 24 * u, bh = 86 * u;
    if (S.W - side - (side + lw) < bw + 60 * u) return;
    const top = parseFloat(el.parentElement.style.top) || 96 * u;
    const x = S.W - side - bw, y = top + size * 0.55 - bh / 2;
    const q = eo(seg(local, 0.2, 0.9));
    ctx.save(); pop(ctx, q, x + bw / 2, y + bh / 2, -24 * u);
    glass(ctx, S, th, x, y, bw, bh, bh / 2, { blur: 20, shadow: false, tintMul: 1.3 });
    const names = ["play", "sliders", "check"];
    const lit = (Math.floor(t / 1.1) % 3 + 3) % 3, f = clamp((t / 1.1) % 1 / 0.25);
    const slot = (bw - 24 * u) / 3;
    const from = (lit + 2) % 3;
    rr(ctx, x + 12 * u + slot * lit * eo(f) + slot * from * (1 - eo(f)), y + 10 * u, slot, bh - 20 * u, (bh - 20 * u) / 2);
    ctx.fillStyle = rgba(th.acc, 0.9); ctx.shadowColor = rgba(th.acc); ctx.shadowBlur = 18 * u; ctx.fill(); ctx.shadowColor = "transparent";
    names.forEach((nm, i) => icon(ctx, S, nm, x + 12 * u + slot * (i + 0.5), y + bh / 2, 32 * u, i === lit && f > 0.5 ? (lum(th.acc) > 175 ? "#15171c" : "#ffffff") : th.inkS));
    ctx.restore();
  }
  // What a split layer asks for (see the template's layers); a whole graphic draws everything.
  const WHOLE = { world: true, statement: true, front: true };
  const part = (S) => S.part || WHOLE;
  const says = (P, scene) => P.statement === true || P.statement === scene;
  function wrap(fn) {
    return (ctx, S, box, p, d, info) => {
      const th = theme(S);
      const leaving = info.exit !== undefined;
      const saved = CAM;
      if (leaving) CAM = camFor(S, Math.max(0, saved.idx - 1), info.local, info.hold, true, info.change, info.exit);
      FRAME.k = 0; FRAME.local = info.local;
      ctx.save();
      applyCam(ctx, S);
      ctx.globalAlpha *= CAM.a;
      if (CAM.blur > 0.4) ctx.filter = `blur(${CAM.blur.toFixed(1)}px)`;
      // Builds run across the whole hold; panels are already in place as the camera arrives,
      // so the glide carries a full layout, never an empty plate.
      const build = clamp((info.local - 0.1) / Math.max(0.9, (info.hold - 0.6) * 0.88));
      const shell = leaving ? 1 : CAM.idx > 0 ? 0.36 + 0.06 * eo(info.local / 0.5) : 0.34 * eo(info.local / 0.3);
      const pp = Math.max(build, shell);
      fn(ctx, S, th, area(S, box), pp, d, info.t, info.local);
      if (!leaving) { if (S.piece) S.piece("toolbar"); toolbar(ctx, S, th, info.t, info.local, CUR.scene); }
      ctx.restore();
      CAM = saved;
      if (!leaving && part(S).front === true) fore(ctx, S, th, info.t);
    };
  }

  function chartScene(ctx, S, th, A, p, d, t) {
    const u = S.u, tall = S.tall, gap = 36 * u;
    const vals = d.values.map((v) => Number(v) || 0);
    const n = vals.length, max = Math.max(...vals, 1), total = vals.reduce((s, v) => s + v, 0) || 1;
    const hot = clamp(d.highlight, 0, n - 1);
    const main = tall ? { x: A.x, y: A.y, w: A.w, h: A.h * 0.56 } : { x: A.x, y: A.y, w: A.w * 0.6, h: A.h };
    const k1 = tall ? { x: A.x, y: main.y + main.h + gap, w: (A.w - gap) * 0.56, h: A.h - main.h - gap } : { x: main.x + main.w + gap, y: A.y, w: A.w - main.w - gap, h: A.h * 0.57 };
    const k2 = tall ? { x: k1.x + k1.w + gap, y: k1.y, w: A.w - k1.w - gap, h: k1.h } : { x: k1.x, y: k1.y + k1.h + gap, w: k1.w, h: A.h - k1.h - gap };
    const q0 = eo(seg(p, 0, 0.3)), q1 = eo(seg(p, 0.22, 0.55)), q2 = eo(seg(p, 0.32, 0.65));
    const pad = 40 * u;
    // Main panel: header, grid, glass columns.
    let hotTop = null;
    ctx.save(); pop(ctx, q0, main.x + main.w / 2, main.y + main.h / 2, 50 * u);
    glass(ctx, S, th, main.x, main.y, main.w, main.h, 36 * u, { piece: "bars" });
    chip(ctx, S, th, main.x + pad, main.y + pad, 76 * u, "chart", 0);
    txt(ctx, S, th, "Breakdown", main.x + pad + 100 * u, main.y + pad + 38 * u, 40 * u, { weight: 700, color: th.mutedHi, max: main.w - pad * 2 - 100 * u - 230 * u });
    // Segmented range control, one segment lit.
    const segW = 64 * u, sx = main.x + main.w - pad - segW * 3 - 12 * u, sy = main.y + pad + 12 * u;
    glass(ctx, S, th, sx, sy, segW * 3 + 12 * u, 52 * u, 26 * u, { blur: 14, shadow: false });
    const lit = Math.floor(t * 0.5) % 3;
    rr(ctx, sx + 6 * u + segW * lit, sy + 6 * u, segW, 40 * u, 20 * u); ctx.fillStyle = rgba(th.acc, 0.9); ctx.fill();
    for (let i = 0; i < 3; i++) bar(ctx, sx + 6 * u + segW * i + 18 * u, sy + 22 * u, segW - 36 * u, 8 * u, i === lit ? "rgba(255,255,255,0.9)" : th.skel);
    const px = main.x + pad, py = main.y + pad + 130 * u, pw = main.w - pad * 2, ph = main.h - pad * 2 - 130 * u - 64 * u;
    ctx.save(); ctx.setLineDash([3 * u, 10 * u]); ctx.strokeStyle = th.faint; ctx.lineWidth = 1.5 * u;
    for (let i = 0; i <= 4; i++) { const yy = py + (ph * i) / 4; ctx.beginPath(); ctx.moveTo(px, yy); ctx.lineTo(px + pw, yy); ctx.stroke(); }
    ctx.restore();
    const slot = pw / n, bw = Math.min(slot * 0.5, 150 * u), labelRoom = 72 * u;
    vals.forEach((v, i) => {
      const qb = eo(seg(p, 0.12 + i * 0.08, 0.5 + i * 0.08));
      const bx = px + slot * i + (slot - bw) / 2;
      const full = (ph - labelRoom) * (v / max);
      const bh = Math.max(4 * u, full * qb);
      const by = py + ph - bh;
      const isHot = i === hot;
      bar(ctx, bx, py + labelRoom, bw, ph - labelRoom, th.faint);
      ctx.save();
      rr(ctx, bx, by, bw, bh, Math.min(bw * 0.28, bh / 2));
      const c = isHot ? th.acc : th.cols[i % 4];
      const g = ctx.createLinearGradient(0, by, 0, py + ph);
      g.addColorStop(0, rgba(mix(c, WHITE, isHot ? 0.2 : 0.1), isHot ? 1 : 0.95)); g.addColorStop(1, rgba(c, isHot ? 0.7 : 0.6));
      if (isHot) { ctx.shadowColor = rgba(c, 0.85); ctx.shadowBlur = 40 * u; }
      ctx.fillStyle = g; ctx.fill(); ctx.shadowColor = "transparent";
      ctx.clip();
      const sh = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      sh.addColorStop(0, "rgba(255,255,255,0.4)"); sh.addColorStop(0.35, "rgba(255,255,255,0.05)"); sh.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = sh; ctx.fillRect(bx, by, bw, bh);
      ctx.restore();
      ctx.save(); rr(ctx, bx, by, bw, bh, Math.min(bw * 0.28, bh / 2)); ctx.lineWidth = 1.3 * u; ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.stroke(); ctx.restore();
      ctx.save(); ctx.globalAlpha *= clamp(qb * 2);
      if (isHot) {
        pill(ctx, S, th, fmt(v * qb, v, d.suffix), bx + bw / 2, by - 60 * u, 42 * u, { fill: th.acc, align: "center", weight: 700 });
        glowDot(ctx, th, bx + bw / 2, by, 9 * u);
        hotTop = [bx + bw / 2, by, bw];
      } else txt(ctx, S, th, fmt(v * qb, v, d.suffix), bx + bw / 2, by - 36 * u, 42 * u, { align: "center", weight: 700, fam: "figures" });
      ctx.restore();
      txt(ctx, S, th, d.labels[i], px + slot * i + slot / 2, py + ph + 40 * u, 42 * u, { align: "center", color: isHot ? th.inkS : th.mutedHi, weight: isHot ? 700 : 600, max: slot - 12 * u });
    });
    ctx.restore();
    // KPI card: the highlighted value, large, its change against the average, and an area trend.
    const hv = vals[hot] || 0, avg = total / n;
    ctx.save(); pop(ctx, q1, k1.x + k1.w / 2, k1.y + k1.h / 2, 50 * u);
    glass(ctx, S, th, k1.x, k1.y, k1.w, k1.h, 36 * u, { glow: 0.35 * q1, piece: "stat" });
    const kp = 36 * u;
    chip(ctx, S, th, k1.x + kp, k1.y + kp, 68 * u, "bolt", 1);
    const pct = avg ? Math.round(((hv - avg) / avg) * 100) : 0;
    ctx.save(); ctx.globalAlpha *= eo(seg(p, 0.55, 0.8));
    const pb = pill(ctx, S, th, `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%`, k1.x + k1.w - kp, k1.y + kp + 34 * u, 36 * u, { align: "right", icon: pct < 0 ? "down" : "up", fill: mix(th.acc, th.cols[1], 0.3) });
    ctx.restore();
    txt(ctx, S, th, d.labels[hot], k1.x + kp + 88 * u, k1.y + kp + 34 * u, 42 * u, { color: th.mutedHi, max: Math.max(60 * u, pb.x - (k1.x + kp + 100 * u)) });
    const areaH = Math.max(70 * u, k1.h * 0.3);
    const big = clamp(k1.h - kp * 2 - 68 * u - areaH - 20 * u, 96 * u, 140 * u);
    txt(ctx, S, th, fmt(hv * eo(seg(p, 0.3, 0.75)), hv, d.suffix), k1.x + kp - 4 * u, k1.y + kp + 68 * u + 6 * u + big * 0.52, big, { weight: 600, fam: "figures", max: k1.w - kp * 2 });
    // Area trend of the same series, ending in a glowing point.
    {
      const ax = k1.x + kp, aw = k1.w - kp * 2, ay = k1.y + k1.h - kp - areaH, ah = areaH;
      const qs = eo(seg(p, 0.4, 0.85));
      const pts = vals.map((v, i) => [ax + (aw * i) / Math.max(1, n - 1), ay + ah - (0.15 + 0.85 * (v / max)) * ah]);
      const upto = qs * (n - 1), fi = Math.min(n - 1, Math.floor(upto)), fr = upto - fi;
      const shown = pts.slice(0, fi + 1);
      if (fi < n - 1) shown.push([pts[fi][0] + (pts[fi + 1][0] - pts[fi][0]) * fr, pts[fi][1] + (pts[fi + 1][1] - pts[fi][1]) * fr]);
      const end = shown[shown.length - 1];
      const path = () => { ctx.beginPath(); shown.forEach((pt, i) => { if (!i) ctx.moveTo(pt[0], pt[1]); else { const pr = shown[i - 1], mx2 = (pr[0] + pt[0]) / 2; ctx.bezierCurveTo(mx2, pr[1], mx2, pt[1], pt[0], pt[1]); } }); };
      ctx.save();
      path(); ctx.lineTo(end[0], ay + ah); ctx.lineTo(ax, ay + ah); ctx.closePath();
      const ag = ctx.createLinearGradient(0, ay, 0, ay + ah); ag.addColorStop(0, rgba(th.acc, 0.45)); ag.addColorStop(1, rgba(th.acc, 0));
      ctx.fillStyle = ag; ctx.fill();
      path(); ctx.lineWidth = 4 * u; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.strokeStyle = rgba(mix(th.acc, WHITE, th.light ? 0 : 0.35)); ctx.shadowColor = rgba(th.acc); ctx.shadowBlur = 14 * u; ctx.stroke();
      ctx.restore();
      shown.slice(0, -1).forEach((pt) => { ctx.beginPath(); ctx.arc(pt[0], pt[1], 5 * u, 0, TAU); ctx.fillStyle = "#ffffff"; ctx.fill(); });
      if (qs > 0) glowDot(ctx, th, end[0], end[1], 9 * u);
    }
    ctx.restore();
    // Share card: a segmented ring and a text-free ranking of the series.
    ctx.save(); pop(ctx, q2, k2.x + k2.w / 2, k2.y + k2.h / 2, 50 * u);
    glass(ctx, S, th, k2.x, k2.y, k2.w, k2.h, 36 * u, { piece: "share" });
    const rr0 = Math.min(k2.h * 0.34, k2.w * 0.2), rcx = k2.x + 36 * u + rr0 + 10 * u, rcy = k2.y + k2.h / 2;
    const qr = eo(seg(p, 0.4, 0.85));
    let a0 = -Math.PI / 2;
    vals.forEach((v, i) => {
      const sweep = (v / total) * TAU * qr;
      ctx.save(); ctx.beginPath(); ctx.arc(rcx, rcy, rr0, a0 + 0.04, a0 + Math.max(0.04, sweep - 0.04));
      ctx.lineWidth = (i === hot ? 22 : 15) * u; ctx.lineCap = "round"; ctx.strokeStyle = rgba(i === hot ? th.acc : th.cols[i % 4], i === hot ? 1 : 0.75);
      if (i === hot) { ctx.shadowColor = rgba(th.acc); ctx.shadowBlur = 20 * u; }
      ctx.stroke(); ctx.restore();
      a0 += sweep;
    });
    txt(ctx, S, th, `${Math.round((hv / total) * 100 * qr)}%`, rcx, rcy + 2 * u, Math.min(46 * u, rr0 * 0.62), { align: "center", weight: 600, fam: "figures" });
    const lx = rcx + rr0 + 50 * u, lw = k2.x + k2.w - 36 * u - lx;
    txt(ctx, S, th, "Share of total", lx, k2.y + 56 * u, 40 * u, { weight: 700, color: th.mutedHi, max: lw });
    const rowH = Math.min(34 * u, (k2.h - 150 * u) / n);
    vals.forEach((v, i) => {
      const yy = k2.y + 104 * u + rowH * 0.5 + i * rowH;
      const f = (v / max) * eo(seg(p, 0.45 + i * 0.05, 0.85 + i * 0.05));
      bar(ctx, lx, yy - 6 * u, lw, 12 * u, th.faint);
      bar(ctx, lx, yy - 6 * u, Math.max(12 * u, lw * f), 12 * u, rgba(i === hot ? th.acc : th.cols[i % 4], i === hot ? 1 : 0.7));
      if (i === hot) glowDot(ctx, th, lx + lw * f, yy, 6 * u);
    });
    ctx.restore();
    // Wire from the highlighted column to the KPI card: part of the KPI card's piece.
    if (S.piece) S.piece("stat");
    if (hotTop) {
      const qw = eo(seg(p, 0.5, 0.82));
      const from = [hotTop[0] + hotTop[2] / 2 + 4 * u, hotTop[1] + 30 * u];
      const P = tall ? curve(from, [k1.x + k1.w * 0.62, k1.y], "y", 0.6) : curve(from, [k1.x, k1.y + k1.h * 0.45], "x", 0.55);
      wire(ctx, S, th, P, qw, t);
    }
  }

  function phone(ctx, S, th, x, y, w, h, t, p) {
    const u = S.u, r = w * 0.16;
    glass(ctx, S, th, x, y, w, h, r, { blur: 36, glow: 0.3, piece: "device" });
    const ix = x + w * 0.07, iw = w * 0.86;
    // Status bar and notch.
    bar(ctx, x + w / 2 - w * 0.13, y + h * 0.025, w * 0.26, h * 0.022, th.light ? "rgba(20,24,51,0.55)" : "rgba(8,4,24,0.6)");
    const pvY = y + h * 0.075, pvH = h * 0.34;
    preview(ctx, S, th, ix, pvY, iw, pvH, w * 0.07, t);
    // Scrubber.
    const scY = pvY + pvH + h * 0.04, f = 0.15 + ((t * 0.09) % 0.8);
    bar(ctx, ix, scY - 4 * u, iw, 8 * u, th.faint);
    bar(ctx, ix, scY - 4 * u, iw * f, 8 * u, rgba(th.acc, 0.95));
    glowDot(ctx, th, ix + iw * f, scY, 7 * u);
    // Control rows.
    const rows = [["spark", 0.62], ["clock", 0.38], ["text", 0.74]];
    const rowY0 = scY + h * 0.06, rowH = h * 0.1;
    const anchors = [];
    rows.forEach(([nm, base], i) => {
      const yy = rowY0 + i * rowH;
      const cs = rowH * 0.62;
      chip(ctx, S, th, ix, yy - cs / 2, cs, nm, i + 1);
      const sxx = ix + cs + 22 * u, sw = iw - cs - 34 * u;
      const fv = base + Math.sin(t * 0.9 + i * 2.1) * 0.12 * eo(seg(p, 0.5, 1));
      slider(ctx, S, th, sxx, yy, sw, fv * eo(seg(p, 0.2 + i * 0.1, 0.6 + i * 0.1)) + 0.02, i === 1 ? th.acc : mix(th.acc, th.cols[i], 0.4));
      anchors.push([x + w, yy]);
    });
    // Clip strip between the controls and the button.
    const btY = y + h - h * 0.12, btH = h * 0.075;
    {
      const sy0 = rowY0 + rows.length * rowH - rowH * 0.25, sh0 = btY - sy0 - h * 0.035;
      if (sh0 > 30 * u) {
        const r = rng(13); let cx = ix;
        while (cx < ix + iw - 10 * u) {
          const cw = Math.min((40 + r() * 70) * u, ix + iw - cx);
          rr(ctx, cx, sy0, cw - 6 * u, sh0, 8 * u); ctx.fillStyle = rgba(th.cols[Math.floor(r() * 4)], 0.6); ctx.fill();
          cx += cw;
        }
        const ph = ix + ((t * 0.15) % 1) * iw;
        ctx.save(); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2.5 * u; ctx.shadowColor = rgba(th.acc); ctx.shadowBlur = 12 * u;
        ctx.beginPath(); ctx.moveTo(ph, sy0 - 6 * u); ctx.lineTo(ph, sy0 + sh0 + 6 * u); ctx.stroke(); ctx.restore();
      }
    }
    ctx.save(); rr(ctx, ix, btY, iw, btH, btH / 2);
    const g = ctx.createLinearGradient(ix, 0, ix + iw, 0); g.addColorStop(0, rgba(th.acc)); g.addColorStop(1, rgba(mix(th.acc, th.cols[2], 0.6)));
    ctx.shadowColor = rgba(th.acc, 0.5 + 0.3 * Math.sin(t * 3)); ctx.shadowBlur = 30 * u; ctx.fillStyle = g; ctx.fill(); ctx.restore();
    icon(ctx, S, "check", ix + iw / 2, btY + btH / 2, btH * 0.5, lum(th.acc) > 175 ? "#15171c" : "#ffffff");
    return { preview: [x, pvY + pvH * 0.5], rows: anchors, rowsL: anchors.map((a) => [x, a[1]]), button: [x, btY + btH / 2], buttonR: [x + w, btY + btH / 2] };
  }
  function laptop(ctx, S, th, x, y, w, h, t, p) {
    const u = S.u;
    const sh = h * 0.88, base = h - sh;
    glass(ctx, S, th, x, y, w, sh, 30 * u, { blur: 36, glow: 0.3, piece: "device" });
    // Base: a frosted wedge.
    ctx.save();
    ctx.beginPath(); ctx.moveTo(x - w * 0.06, y + sh + base * 0.2); ctx.lineTo(x + w * 1.06, y + sh + base * 0.2); ctx.lineTo(x + w * 1.02, y + h); ctx.lineTo(x - w * 0.02, y + h); ctx.closePath();
    const bg = ctx.createLinearGradient(0, y + sh, 0, y + h); bg.addColorStop(0, th.light ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.4)"); bg.addColorStop(1, th.light ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.1)");
    ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 1.4 * u; ctx.strokeStyle = th.edge; ctx.stroke();
    ctx.restore();
    const ix = x + 28 * u, iy = y + 28 * u, iw = w - 56 * u, ih = sh - 56 * u;
    // Sidebar.
    const sw = iw * 0.2;
    for (let i = 0; i < 5; i++) { const yy = iy + 10 * u + i * 52 * u; if (yy > iy + ih * 0.55) break; chip(ctx, S, th, ix, yy, 36 * u, ["layers", "film", "wave", "text", "spark"][i], i); bar(ctx, ix + 50 * u, yy + 12 * u, sw - 60 * u, 12 * u, i === 1 ? rgba(th.acc, 0.9) : th.skel); }
    const pvx = ix + sw + 20 * u, pvw = iw - sw - 20 * u, pvh = ih * 0.55;
    preview(ctx, S, th, pvx, iy, pvw, pvh, 18 * u, t);
    // Tracks.
    const ty = iy + pvh + 22 * u, thh = ih - pvh - 22 * u;
    const rows = 3, rh = thh / rows, r = rng(9);
    for (let row = 0; row < rows; row++) {
      let cx = ix;
      while (cx < ix + iw - 30 * u) {
        const cw = Math.min((90 + r() * 180) * u, ix + iw - cx);
        rr(ctx, cx, ty + row * rh + 3 * u, cw - 6 * u, rh - 8 * u, 8 * u);
        ctx.fillStyle = rgba(th.cols[(row + (cx > ix + iw * 0.5 ? 1 : 0)) % 4], 0.75); ctx.fill();
        cx += cw;
      }
    }
    const ph = ix + ((t * 0.1) % 1) * iw;
    ctx.save(); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3 * u; ctx.shadowColor = rgba(th.acc); ctx.shadowBlur = 14 * u;
    ctx.beginPath(); ctx.moveTo(ph, ty - 8 * u); ctx.lineTo(ph, ty + thh); ctx.stroke(); ctx.restore();
    // A proposal card floating over the screen with three dials.
    const cw = w * 0.34, chh = sh * 0.36, cx = x + w - cw * 0.7, cy = y + sh * 0.18;
    const qc = eo(seg(p, 0.3, 0.7));
    ctx.save(); pop(ctx, qc, cx + cw / 2, cy, 40 * u);
    glass(ctx, S, th, cx, cy, cw, chh, 24 * u, { glow: 0.5, piece: "device-card" });
    const rowsY = [];
    for (let i = 0; i < 3; i++) {
      const yy = cy + chh * (0.25 + i * 0.25);
      slider(ctx, S, th, cx + 28 * u, yy, cw - 56 * u, clamp(0.3 + i * 0.2 + Math.sin(t * 0.8 + i * 2) * 0.12), mix(th.acc, th.cols[i], 0.3));
      rowsY.push(yy);
    }
    ctx.restore();
    return { preview: [pvx, iy + pvh * 0.5], rows: rowsY.map((yy) => [cx + cw, yy]), rowsL: rowsY.map((yy) => [cx, yy]), button: [x, ty + thh / 2], buttonR: [x + w, ty + thh / 2], card: { x: cx, y: cy, w: cw, h: chh } };
  }

  function calloutCard(ctx, S, th, x, y, w, h, label, nm, k, t, p) {
    const u = S.u;
    glass(ctx, S, th, x, y, w, h, 30 * u);
    const cs = Math.min(76 * u, h - 52 * u);
    chip(ctx, S, th, x + 26 * u, y + (h - cs) / 2, cs, nm, k);
    const tx = x + 26 * u + cs + 24 * u, tw = w - (tx - x) - 26 * u;
    const lines = wrapLines(ctx, S, label, 42 * u, tw, 700);
    lines.forEach((ln, i) => txt(ctx, S, th, ln, tx, y + h * (lines.length > 1 ? 0.27 : 0.36) + i * 48 * u, 42 * u, { weight: 700, max: tw }));
    slider(ctx, S, th, tx + 8 * u, y + h * (lines.length > 1 ? 0.8 : 0.72), tw - 16 * u, clamp(0.35 + 0.3 * Math.sin(t * 0.7 + k * 1.7) * eo(p) + 0.15 * k), mix(th.acc, th.cols[k % 4], 0.35));
  }

  function objectScene(ctx, S, th, A, p, d, t) {
    const u = S.u, tall = S.tall;
    const isPhone = d.kind !== "laptop";
    let dev;
    if (tall) {
      const dh = isPhone ? A.h * 0.52 : A.w * 0.62;
      const dw = isPhone ? dh * 0.5 : A.w * 0.9;
      dev = { x: A.x + (A.w - dw) / 2, y: A.y, w: dw, h: dh };
    } else if (isPhone) {
      const dh = A.h; dev = { x: A.x + A.w / 2 - dh * 0.25, y: A.y, w: dh * 0.5, h: dh };
    } else {
      const dw = Math.min(A.w * 0.4, A.h * 1.45); const dh = dw * 0.66; dev = { x: A.x + (A.w - dw) / 2, y: A.y + (A.h - dh) / 2, w: dw, h: dh };
    }
    const qd = eo(seg(p, 0, 0.35));
    ctx.save(); pop(ctx, qd, dev.x + dev.w / 2, dev.y + dev.h / 2, 60 * u);
    const anc = isPhone ? phone(ctx, S, th, dev.x, dev.y, dev.w, dev.h, t, p) : laptop(ctx, S, th, dev.x, dev.y, dev.w, dev.h, t, p);
    ctx.restore();
    const icons = ["spark", "clock", "text"];
    if (tall) {
      const ch = 150 * u, gap = 26 * u, y0 = dev.y + dev.h + 70 * u;
      d.callouts.forEach((label, i) => {
        const q = eo(seg(p, 0.3 + i * 0.12, 0.65 + i * 0.12));
        const y = y0 + i * (ch + gap);
        ctx.save(); pop(ctx, q, A.x + A.w / 2, y, 40 * u);
        as("callout#", () => calloutCard(ctx, S, th, A.x, y, A.w, ch, label, icons[i], i + 1, t, p));
        ctx.restore();
        const from = i === 0 ? [dev.x + dev.w * 0.5, dev.y + dev.h] : [A.x + 26 * u + 38 * u, y0 + (i - 1) * (ch + gap) + ch];
        const to = i === 0 ? [A.x + A.w * 0.5, y] : [A.x + 26 * u + 38 * u, y];
        wire(ctx, S, th, curve(from, to, "y", 0.5), eo(seg(p, 0.4 + i * 0.12, 0.7 + i * 0.12)), t, { phase: i * 0.3, dots: 1 });
      });
      return;
    }
    const cw = Math.min(520 * u, (A.w - dev.w) / 2 - 80 * u), ch = 190 * u;
    const left = A.x, right = A.x + A.w - cw;
    const slots = [
      { x: left, y: A.y + A.h * 0.06 + Math.sin(t * 1.2) * 10 * u, side: "L", to: anc.preview },
      { x: right, y: A.y + A.h * 0.3 + Math.sin(t * 1.2 + 2.1) * 10 * u, side: "R", to: anc.rows[1] },
      { x: left, y: A.y + A.h * 0.58 + Math.sin(t * 1.2 + 4.2) * 10 * u, side: "L", to: isPhone ? anc.rowsL[2] : anc.button },
    ];
    // A fourth, text-free card keeps the frame full: a live level meter.
    const q4 = eo(seg(p, 0.55, 0.9));
    ctx.save(); pop(ctx, q4, right + cw / 2, A.y + A.h * 0.66, 40 * u);
    as("meter", () => waveWidget(ctx, S, th, right + 40 * u, A.y + A.h * 0.62, cw - 40 * u, A.h * 0.34, t));
    ctx.restore();
    slots.forEach((s, i) => {
      const q = eo(seg(p, 0.25 + i * 0.12, 0.6 + i * 0.12));
      ctx.save(); pop(ctx, q, s.x + cw / 2, s.y + ch / 2, 40 * u);
      as("callout#", () => calloutCard(ctx, S, th, s.x, s.y, cw, ch, d.callouts[i], icons[i], i + 1, t, p));
      ctx.restore();
      const from = s.side === "L" ? [s.x + cw, s.y + ch / 2] : [s.x, s.y + ch / 2];
      const target = s.side === "L" && anc.preview === s.to ? [dev.x + 10 * u, s.to[1]] : s.to;
      wire(ctx, S, th, curve(from, target, "x", 0.5), eo(seg(p, 0.42 + i * 0.12, 0.72 + i * 0.12)), t, { phase: i * 0.27 });
    });
  }

  function peopleScene(ctx, S, th, A, p, d, t) {
    const u = S.u, tall = S.tall;
    const n = clamp(Math.round(d.count) || 4, 2, 6);
    const hot = clamp(d.highlight ?? 1, 0, n - 1);
    const card = tall ? { w: A.w * 0.66, h: A.h * 0.46 } : { w: Math.min(600 * u, A.w * 0.36), h: A.h * 0.9 };
    card.x = A.x + (A.w - card.w) / 2; card.y = A.y + (A.h - card.h) / 2;
    // People: split either side (wide) or above and below (tall).
    const first = Math.ceil(n / 2);
    const spots = [];
    const D = tall ? Math.min(170 * u, (A.w / first) * 0.6) : Math.min(170 * u, (A.h / first) * 0.55);
    for (let i = 0; i < n; i++) {
      const sideA = i % 2 === 0, j = Math.floor(i / 2), m = sideA ? first : n - first;
      if (tall) {
        const cy = sideA ? A.y + (card.y - A.y) * 0.42 : card.y + card.h + (A.y + A.h - card.y - card.h) * 0.42;
        spots.push({ cx: A.x + (A.w * (j + 0.5)) / m, cy: cy + Math.sin(t * 1.3 + i * 1.7) * 10 * u, side: sideA ? "T" : "B" });
      } else {
        const gapX = (card.x - A.x);
        const cx = sideA ? A.x + gapX * 0.42 : card.x + card.w + gapX * 0.58;
        const offs = (j % 2 ? 1 : -1) * 30 * u;
        spots.push({ cx: cx + offs, cy: A.y + (A.h * (j + 0.5)) / m - 20 * u + Math.sin(t * 1.3 + i * 1.7) * 12 * u, side: sideA ? "L" : "R" });
      }
    }
    // Wires first so the cards sit over their ends.
    spots.forEach((s, i) => {
      const q = eo(seg(p, 0.4 + i * 0.06, 0.75 + i * 0.06));
      let P;
      if (s.side === "L") P = curve([s.cx + D / 2 + 6 * u, s.cy], [card.x, card.y + card.h * (0.3 + 0.13 * Math.floor(i / 2))], "x");
      else if (s.side === "R") P = curve([s.cx - D / 2 - 6 * u, s.cy], [card.x + card.w, card.y + card.h * (0.3 + 0.13 * Math.floor(i / 2))], "x");
      else if (s.side === "T") P = curve([s.cx, s.cy + D / 2 + 50 * u], [card.x + card.w * (0.25 + 0.25 * Math.floor(i / 2)), card.y], "y");
      else P = curve([s.cx, s.cy - D / 2 - 6 * u], [card.x + card.w * (0.25 + 0.25 * Math.floor(i / 2)), card.y + card.h], "y");
      // Each connector grows from its person, so it is part of that person's piece.
      const back = S.piece ? S.piece("person-" + (i + 1)) : null;
      wire(ctx, S, th, P, q, t, { dots: 1, phase: i * 0.21, color: i === hot ? th.acc : mix(th.cols[(i + 1) % 4], WHITE, 0.2) });
      if (back) S.piece(back);
    });
    // The shared card.
    const qc = eo(seg(p, 0, 0.35));
    ctx.save(); pop(ctx, qc, card.x + card.w / 2, card.y + card.h / 2, 50 * u);
    glass(ctx, S, th, card.x, card.y, card.w, card.h, 36 * u, { blur: 36, glow: 0.4, piece: "card" });
    const cp = 32 * u;
    chip(ctx, S, th, card.x + cp, card.y + cp, 64 * u, "layers", 0);
    txt(ctx, S, th, `${n} viewing`, card.x + cp + 84 * u, card.y + cp + 32 * u, 42 * u, { weight: 700, max: card.w - cp * 2 - 150 * u });
    for (let i = 0; i < 3; i++) { const lx = card.x + card.w - cp - 14 * u - i * 30 * u; ctx.beginPath(); ctx.arc(lx, card.y + cp + 32 * u, 10 * u, 0, TAU); ctx.fillStyle = rgba(th.cols[(3 - i) % 4]); ctx.fill(); ctx.lineWidth = 2.5 * u; ctx.strokeStyle = "#ffffff"; ctx.stroke(); }
    const pvY = card.y + cp + 96 * u, pvH = card.h * (tall ? 0.36 : 0.34);
    preview(ctx, S, th, card.x + cp, pvY, card.w - cp * 2, pvH, 20 * u, t);
    const rowsTop = pvY + pvH + 34 * u, rowsH = card.y + card.h - cp - 76 * u - rowsTop;
    const rowCount = clamp(Math.floor(rowsH / (54 * u)), 1, 3);
    for (let i = 0; i < rowCount; i++) {
      const yy = rowsTop + i * (rowsH / rowCount) + 14 * u;
      slider(ctx, S, th, card.x + cp + 10 * u, yy, card.w - cp * 2 - 20 * u, clamp(0.3 + i * 0.22 + Math.sin(t * 0.7 + i * 2) * 0.1), mix(th.acc, th.cols[(i + 1) % 4], 0.4));
    }
    const btH = 64 * u, btY = card.y + card.h - cp - btH;
    ctx.save(); rr(ctx, card.x + cp, btY, card.w - cp * 2, btH, btH / 2);
    const bgr = ctx.createLinearGradient(card.x, 0, card.x + card.w, 0); bgr.addColorStop(0, rgba(th.acc)); bgr.addColorStop(1, rgba(mix(th.acc, th.cols[2], 0.6)));
    ctx.shadowColor = rgba(th.acc, 0.6); ctx.shadowBlur = 26 * u; ctx.fillStyle = bgr; ctx.fill(); ctx.restore();
    icon(ctx, S, "check", card.x + card.w / 2, btY + btH / 2, btH * 0.5, lum(th.acc) > 175 ? "#15171c" : "#ffffff");
    // Presence cursors drifting over the card in each person's colour.
    for (let i = 0; i < Math.min(n, 4); i++) {
      const q = eo(seg(p, 0.55 + i * 0.06, 0.85 + i * 0.06));
      if (q <= 0) continue;
      const an = [[0.16, 0.22], [0.7, 0.2], [0.24, 0.68], [0.78, 0.64]][i];
      const cx = card.x + cp + (card.w - cp * 2) * (an[0] + 0.07 * Math.sin(t * 0.7 + i * 1.9)), cy = pvY + pvH * (an[1] + 0.08 * Math.cos(t * 0.6 + i * 2.6));
      const c = i === hot ? th.acc : th.cols[(i + 1) % 4];
      ctx.save(); ctx.globalAlpha *= q; ctx.translate(cx, cy);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 34 * u); ctx.lineTo(9 * u, 25 * u); ctx.lineTo(20 * u, 30 * u); ctx.closePath();
      ctx.fillStyle = rgba(c); ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 8 * u; ctx.fill();
      ctx.lineWidth = 2 * u; ctx.strokeStyle = "#ffffff"; ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    // People and their name pills.
    spots.forEach((s, i) => {
      const q = eo(seg(p, 0.15 + i * 0.07, 0.5 + i * 0.07));
      ctx.save(); pop(ctx, q, s.cx, s.cy, 40 * u);
      const isHot = i === hot;
      glass(ctx, S, th, s.cx - D / 2 - 8 * u, s.cy - D / 2 - 8 * u, D + 16 * u, D + 16 * u, D / 2 + 8 * u, { blur: 20, glow: isHot ? 0.9 : 0, piece: "person-" + (i + 1) });
      person(ctx, th, s.cx, s.cy, D, i);
      // Glass dome over the portrait: a lit top-left, a darker rim and a bright edge.
      ctx.save(); ctx.beginPath(); ctx.arc(s.cx, s.cy, D / 2, 0, TAU); ctx.clip();
      const hl = ctx.createRadialGradient(s.cx - D * 0.22, s.cy - D * 0.28, 0, s.cx - D * 0.22, s.cy - D * 0.28, D * 0.55);
      hl.addColorStop(0, "rgba(255,255,255,0.42)"); hl.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = hl; ctx.fillRect(s.cx - D / 2, s.cy - D / 2, D, D);
      const rim = ctx.createRadialGradient(s.cx, s.cy, D * 0.32, s.cx, s.cy, D * 0.52);
      rim.addColorStop(0, "rgba(10,4,40,0)"); rim.addColorStop(1, "rgba(10,4,40,0.35)");
      ctx.fillStyle = rim; ctx.fillRect(s.cx - D / 2, s.cy - D / 2, D, D);
      ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.arc(s.cx, s.cy, D / 2, 0, TAU);
      const eg = ctx.createLinearGradient(s.cx - D / 2, s.cy - D / 2, s.cx + D / 2, s.cy + D / 2);
      eg.addColorStop(0, "rgba(255,255,255,0.95)"); eg.addColorStop(0.5, "rgba(255,255,255,0.2)"); eg.addColorStop(1, "rgba(255,255,255,0.55)");
      ctx.lineWidth = 2.5 * u; ctx.strokeStyle = eg; ctx.stroke(); ctx.restore();
      if (isHot) {
        const bx = s.cx + D * 0.36, by = s.cy - D * 0.36, br = 22 * u;
        ctx.save(); ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU); ctx.fillStyle = rgba(th.acc); ctx.shadowColor = rgba(th.acc); ctx.shadowBlur = 20 * u; ctx.fill();
        ctx.lineWidth = 2.5 * u; ctx.strokeStyle = "#ffffff"; ctx.stroke(); ctx.restore();
        icon(ctx, S, "check", bx, by, br * 1.1, lum(th.acc) > 175 ? "#15171c" : "#ffffff");
      }
      const label = d.badges[i] || "Viewer";
      const maxW = tall ? A.w / first - 16 * u : Math.max(220 * u, card.x - A.x - 20 * u);
      if (label) as("badge#", () => pill(ctx, S, th, label, s.cx, s.cy + D / 2 + 50 * u, 40 * u, d.badges[i] ? { align: "center", dot: true, dotColor: isHot ? th.acc : th.cols[(i + 1) % 4], max: maxW, shadow: true } : { align: "center", icon: "eye", max: maxW, shadow: true, color: th.mutedHi }));
      else { ctx.save(); ctx.beginPath(); ctx.arc(s.cx + D * 0.36, s.cy + D * 0.36, 12 * u, 0, TAU); ctx.fillStyle = rgba(th.cols[(i + 1) % 4]); ctx.lineWidth = 3 * u; ctx.strokeStyle = "#ffffff"; ctx.fill(); ctx.stroke(); ctx.restore(); }
      ctx.restore();
    });
  }

  // A small picture inside each step card: a preview frame, live dials, then a clip landing on the timeline.
  function stepVisual(ctx, S, th, i, b, st, f, t) {
    const u = S.u;
    if (b.h < 60 * u) return;
    ctx.save();
    rr(ctx, b.x, b.y, b.w, b.h, 20 * u); ctx.fillStyle = th.light ? "rgba(255,255,255,0.35)" : "rgba(10,6,40,0.16)"; ctx.fill();
    ctx.lineWidth = 1.2 * u; ctx.strokeStyle = th.faint; ctx.stroke();
    ctx.restore();
    const ix = b.x + 18 * u, iy = b.y + 18 * u, iw = b.w - 36 * u, ih = b.h - 36 * u;
    if (i % 3 === 0) {
      preview(ctx, S, th, ix, iy, iw, ih, 14 * u, t, true);
    } else if (i % 3 === 1) {
      const rows = clamp(Math.floor(ih / (46 * u)), 1, 3);
      for (let r = 0; r < rows; r++) {
        const yy = iy + (ih * (r + 0.5)) / rows;
        const live = st >= 1 ? Math.sin(t * 1.3 + r * 2) * 0.16 : 0;
        slider(ctx, S, th, ix + 12 * u, yy, iw - 24 * u, clamp(0.3 + r * 0.2 + live), mix(th.acc, th.cols[r % 4], 0.35));
      }
    } else {
      const rows = 2, rh = ih / rows;
      const r = rng(5);
      for (let row = 0; row < rows; row++) {
        let cx = ix;
        while (cx < ix + iw - 20 * u) {
          const cw = Math.min((60 + r() * 110) * u, ix + iw - cx);
          rr(ctx, cx, iy + row * rh + 4 * u, cw - 6 * u, rh - 10 * u, 8 * u);
          ctx.fillStyle = rgba(th.cols[(row * 2 + 1) % 4], 0.5); ctx.fill();
          cx += cw;
        }
      }
      // The approved clip drops into the top track and glows.
      const q = st === 2 ? 1 : st === 1 ? eo(f) : 0;
      if (q > 0) {
        const cw = iw * 0.42, cx = ix + iw * 0.3, cy = iy + 4 * u - (1 - q) * 60 * u;
        ctx.save(); ctx.globalAlpha *= q;
        rr(ctx, cx, cy, cw, rh - 10 * u, 8 * u);
        const g = ctx.createLinearGradient(cx, 0, cx + cw, 0); g.addColorStop(0, rgba(th.acc)); g.addColorStop(1, rgba(mix(th.acc, th.cols[2], 0.6)));
        ctx.shadowColor = rgba(th.acc); ctx.shadowBlur = 24 * u; ctx.fillStyle = g; ctx.fill();
        ctx.restore();
        icon(ctx, S, "check", cx + cw / 2, cy + (rh - 10 * u) / 2, (rh - 10 * u) * 0.5, lum(th.acc) > 175 ? "#15171c" : "#ffffff");
      }
    }
  }

  function processScene(ctx, S, th, A, p, d, t) {
    const u = S.u, tall = S.tall;
    const icons = ["eye", "sliders", "check"];
    const n = 3;
    const trackH = 64 * u;
    const gap = tall ? 70 * u : 110 * u;
    const cards = [];
    if (tall) {
      const ch = (A.h - trackH - 50 * u - gap * 2) / 3;
      for (let i = 0; i < n; i++) cards.push({ x: A.x + (i === 1 ? 40 * u : 0), y: A.y + i * (ch + gap), w: A.w - 40 * u, h: ch });
    } else {
      const cw = (A.w - gap * 2) / 3, ch = A.h - trackH - 50 * u;
      for (let i = 0; i < n; i++) cards.push({ x: A.x + i * (cw + gap), y: A.y + (i === 1 ? 0 : 36 * u) + Math.sin(t * 1.1 + i * 2.1) * 8 * u, w: cw, h: ch - 36 * u });
    }
    const act = (i) => 0.28 + i * 0.2;
    const state = (i) => (p >= act(i) + 0.18 ? 2 : p >= act(i) ? 1 : 0);
    // Wires between steps.
    for (let i = 0; i < n - 1; i++) {
      const a = cards[i], b = cards[i + 1];
      const P = tall ? curve([a.x + 80 * u, a.y + a.h], [b.x + 80 * u, b.y], "y") : curve([a.x + a.w, a.y + a.h * 0.42], [b.x, b.y + b.h * 0.42], "x");
      // Each connector grows from the step before it, so it is part of that step's piece.
      const back = S.piece ? S.piece("step-" + (i + 1)) : null;
      wire(ctx, S, th, P, eo(seg(p, act(i) + 0.08, act(i) + 0.24)), t, { phase: i * 0.4 });
      if (back) S.piece(back);
    }
    cards.forEach((c, i) => {
      const q = eo(seg(p, i * 0.1, 0.35 + i * 0.1));
      const st = state(i);
      const lift = st === 1 ? 1 : 0;
      ctx.save(); pop(ctx, q, c.x + c.w / 2, c.y + c.h / 2, 50 * u);
      if (lift) { ctx.translate(c.x + c.w / 2, c.y + c.h / 2); ctx.scale(1.03, 1.03); ctx.translate(-(c.x + c.w / 2), -(c.y + c.h / 2)); }
      glass(ctx, S, th, c.x, c.y, c.w, c.h, 36 * u, { glow: st === 1 ? 0.9 : st === 2 ? (i === n - 1 ? 0.45 + 0.4 * Math.sin(t * 3.4) : 0.3) : 0, color: st >= 1 ? th.acc : null, colorA: st === 1 ? 0.12 : 0.05, piece: "step-" + (i + 1) });
      const pd = 34 * u;
      pill(ctx, S, th, String(i + 1).padStart(2, "0"), c.x + pd, c.y + pd + 26 * u, 32 * u, { fill: st >= 1 ? th.acc : null, weight: 750 });
      // Status mark: pulsing ring while active, a check once done.
      const sx = c.x + c.w - pd - 26 * u, sy = c.y + pd + 26 * u;
      if (st === 2) { ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, 26 * u, 0, TAU); ctx.fillStyle = rgba(th.acc); ctx.shadowColor = rgba(th.acc); ctx.shadowBlur = 20 * u; ctx.fill(); ctx.restore(); icon(ctx, S, "check", sx, sy, 28 * u, lum(th.acc) > 175 ? "#15171c" : "#ffffff"); }
      else if (st === 1) { const pr = (t * 1.4) % 1; ctx.save(); ctx.strokeStyle = rgba(th.acc, 1 - pr); ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.arc(sx, sy, 12 * u + pr * 18 * u, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(sx, sy, 10 * u, 0, TAU); ctx.fillStyle = rgba(th.acc); ctx.fill(); ctx.restore(); }
      else { ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, 12 * u, 0, TAU); ctx.lineWidth = 3 * u; ctx.strokeStyle = th.skel; ctx.stroke(); ctx.restore(); }
      if (tall) {
        const cs = Math.min(110 * u, c.h - pd * 2 - 60 * u);
        chip(ctx, S, th, c.x + pd, c.y + c.h - pd - cs, cs, icons[i], i);
        const tx = c.x + pd + cs + 30 * u;
        txt(ctx, S, th, d.steps[i], tx, c.y + c.h - pd - cs * 0.62, 52 * u, { weight: 750, fam: "display", max: c.x + c.w - pd - tx });
        const f = st === 2 ? 1 : st === 1 ? seg(p, act(i), act(i) + 0.18) : 0;
        bar(ctx, tx, c.y + c.h - pd - cs * 0.15, c.x + c.w - pd - tx, 10 * u, th.faint);
        bar(ctx, tx, c.y + c.h - pd - cs * 0.15, Math.max(10 * u, (c.x + c.w - pd - tx) * f), 10 * u, rgba(th.acc));
      } else {
        const cs = 96 * u, cy0 = c.y + pd + 82 * u;
        chip(ctx, S, th, c.x + pd, cy0, cs, icons[i], i);
        txt(ctx, S, th, d.steps[i], c.x + pd + cs + 24 * u, cy0 + cs / 2 + 2 * u, 52 * u, { weight: 750, fam: "display", max: c.w - pd * 2 - cs - 24 * u });
        const f = st === 2 ? 1 : st === 1 ? seg(p, act(i), act(i) + 0.18) : 0;
        const vis = { x: c.x + pd, y: cy0 + cs + 30 * u, w: c.w - pd * 2, h: c.y + c.h - pd - 40 * u - (cy0 + cs + 30 * u) };
        stepVisual(ctx, S, th, i, vis, st, f, t);
        const by = c.y + c.h - pd - 6 * u;
        bar(ctx, c.x + pd, by, c.w - pd * 2, 12 * u, th.faint);
        bar(ctx, c.x + pd, by, Math.max(12 * u, (c.w - pd * 2) * f), 12 * u, rgba(th.acc));
        if (f > 0 && f < 1) glowDot(ctx, th, c.x + pd + (c.w - pd * 2) * f, by + 6 * u, 7 * u);
      }
      ctx.restore();
    });
    // The run track under all three: progress glows across as steps complete.
    const ty = A.y + A.h - trackH, qtk = eo(seg(p, 0.15, 0.4));
    ctx.save(); ctx.globalAlpha *= qtk;
    glass(ctx, S, th, A.x, ty, A.w, trackH, trackH / 2, { blur: 18, piece: "track" });
    const tx0 = A.x + 40 * u, tw = A.w - 80 * u;
    for (let i = 0; i <= 40; i++) { const xx = tx0 + (tw * i) / 40; bar(ctx, xx - 1.5 * u, ty + trackH / 2 - (i % 5 ? 6 : 12) * u, 3 * u, (i % 5 ? 12 : 24) * u, th.faint); }
    const prog = clamp((p - act(0)) / (act(2) + 0.18 - act(0)));
    const g = ctx.createLinearGradient(tx0, 0, tx0 + tw, 0); g.addColorStop(0, rgba(th.cols[2])); g.addColorStop(1, rgba(th.acc));
    bar(ctx, tx0, ty + trackH / 2 - 5 * u, Math.max(10 * u, tw * prog), 10 * u, g);
    glowDot(ctx, th, tx0 + tw * prog, ty + trackH / 2, 9 * u);
    for (let i = 0; i < n; i++) {
      const xx = tx0 + tw * clamp((act(i) - act(0)) / (act(2) + 0.18 - act(0)));
      ctx.beginPath(); ctx.arc(xx, ty + trackH / 2, 11 * u, 0, TAU); ctx.fillStyle = state(i) ? "#ffffff" : th.skel; ctx.fill();
    }
    ctx.restore();
  }

  function compareScene(ctx, S, th, A, p, d, t) {
    const u = S.u, tall = S.tall;
    const mid = tall ? 150 * u : 190 * u;
    const L = tall ? { x: A.x, y: A.y, w: A.w, h: (A.h - mid) / 2 } : { x: A.x, y: A.y + 20 * u, w: (A.w - mid) / 2, h: A.h - 40 * u };
    const R = tall ? { x: A.x, y: A.y + L.h + mid, w: A.w, h: L.h } : { x: A.x + L.w + mid, y: A.y + 20 * u, w: L.w, h: L.h };
    const lv = Number(d.leftValue) || 0, rv = Number(d.rightValue) || 0, mx = Math.max(lv, rv, 1);
    const sides = [
      { b: L, label: d.left, v: lv, nm: "refresh", k: 3, hot: false, piece: "before", q: eo(seg(p, 0, 0.35)) },
      { b: R, label: d.right, v: rv, nm: "sliders", k: 0, hot: true, piece: "after", q: eo(seg(p, 0.18, 0.52)) },
    ];
    // Bridge: a wire through a frosted orb between the two.
    const c1 = tall ? [A.x + A.w / 2, L.y + L.h] : [L.x + L.w, L.y + L.h / 2];
    const c2 = tall ? [A.x + A.w / 2, R.y] : [R.x, R.y + R.h / 2];
    // The bridge wire grows from the first card, so it is part of that card's piece.
    if (S.piece) S.piece(sides[0].piece);
    wire(ctx, S, th, [c1, [c1[0] + (c2[0] - c1[0]) * 0.33, c1[1] + (c2[1] - c1[1]) * 0.33], [c1[0] + (c2[0] - c1[0]) * 0.66, c1[1] + (c2[1] - c1[1]) * 0.66], c2], eo(seg(p, 0.35, 0.6)), t, { dots: 3, speed: 0.7 });
    sides.forEach((s) => {
      const b = s.b;
      ctx.save(); pop(ctx, s.q, b.x + b.w / 2, b.y + b.h / 2, 50 * u);
      glass(ctx, S, th, b.x, b.y, b.w, b.h, 38 * u, { glow: s.hot ? 0.7 * eo(seg(p, 0.5, 0.8)) : 0, color: s.hot ? th.acc : null, colorA: 0.08, piece: s.piece });
      const pd = 40 * u;
      chip(ctx, S, th, b.x + pd, b.y + pd, 72 * u, s.nm, s.k);
      txt(ctx, S, th, s.label, b.x + pd + 94 * u, b.y + pd + 36 * u, 46 * u, { weight: 700, max: b.w - pd * 2 - 94 * u - (s.hot ? 190 * u : 0), color: s.hot ? th.inkS : th.mutedHi });
      const qn = eo(seg(p, s.hot ? 0.3 : 0.12, s.hot ? 0.75 : 0.6));
      const big = tall ? Math.min(150 * u, b.h * 0.3) : Math.min(170 * u, b.h * 0.28);
      const by = b.y + pd + 72 * u + 26 * u + big * 0.5;
      txt(ctx, S, th, fmt(s.v * qn, s.v, d.suffix), b.x + pd - 4 * u, by, big, { weight: 600, fam: "figures", color: s.hot ? rgba(mix(th.acc, WHITE, th.light ? 0 : 0.35)) : th.inkS, max: b.w * 0.5 });
      // Ring gauge beside the number: this side's share of the larger value.
      {
        const gr = tall ? Math.min(b.h * 0.2, b.w * 0.14) : Math.min(b.h * 0.19, b.w * 0.17);
        const gx0 = b.x + b.w - pd - gr - 10 * u, gy0 = tall ? by : by + big * 0.55 + 30 * u + gr + 8 * u;
        const qg = eo(seg(p, s.hot ? 0.35 : 0.2, s.hot ? 0.8 : 0.65));
        ctx.save(); ctx.lineCap = "round";
        ctx.beginPath(); ctx.arc(gx0, gy0, gr, 0, TAU); ctx.lineWidth = 16 * u; ctx.strokeStyle = th.faint; ctx.stroke();
        const a1 = -Math.PI / 2 + TAU * (s.v / mx) * qg;
        const cg = s.hot ? th.acc : mix(th.cols[0], th.cols[3], 0.4);
        ctx.beginPath(); ctx.arc(gx0, gy0, gr, -Math.PI / 2, Math.max(-Math.PI / 2 + 0.01, a1)); ctx.lineWidth = 16 * u; ctx.strokeStyle = rgba(cg, s.hot ? 1 : 0.75);
        if (s.hot) { ctx.shadowColor = rgba(th.acc); ctx.shadowBlur = 22 * u; }
        ctx.stroke(); ctx.restore();
        if (qg > 0) glowDot(ctx, th, gx0 + Math.cos(a1) * gr, gy0 + Math.sin(a1) * gr, (s.hot ? 9 : 6) * u, cg);
        icon(ctx, S, s.hot ? "dial" : "refresh", gx0, gy0, gr * 0.6, s.hot ? th.inkS : th.muted);
      }
      // Tiles, one per unit (up to 12): many repeats on the left, a few dials on the right.
      const count = clamp(Math.round(s.v), 0, 12);
      const gx = b.x + pd, gy = by + big * 0.55 + (tall ? 22 : 30) * u;
      const gw = tall ? b.w - pd * 2 : b.w - pd * 2 - Math.min(b.h * 0.19, b.w * 0.17) * 2 - 50 * u;
      const gh = b.y + b.h - 80 * u - gy;
      let tileS = (tall ? 66 : 72) * u, tg = 14 * u, perRow = 1;
      for (; tileS > 34 * u; tileS *= 0.92) { perRow = Math.max(1, Math.floor((gw + tg) / (tileS + tg))); if (Math.ceil(count / perRow) * (tileS + tg) - tg <= gh) break; }
      // A few moves read as the dials themselves: one live slider per move, each settling on its value.
      const asDials = s.hot && count > 0 && count <= 5;
      if (asDials) {
        const rh = Math.min(84 * u, gh / count);
        for (let i = 0; i < count; i++) {
          const qd = eo(seg(p, 0.42 + i * 0.08, 0.62 + i * 0.08));
          if (qd <= 0) continue;
          const yy = gy + rh * (i + 0.5);
          ctx.save(); ctx.globalAlpha *= qd;
          chip(ctx, S, th, gx, yy - 26 * u, 52 * u, "dial", i % 2 ? 2 : 0);
          const target = 0.35 + 0.4 * ((i * 0.37) % 1);
          slider(ctx, S, th, gx + 78 * u, yy, gw - 90 * u, clamp(target * qd + Math.sin(t * 1.2 + i * 2.2) * 0.05), mix(th.acc, th.cols[i % 4], 0.3));
          ctx.restore();
        }
      }
      const lit = count ? Math.floor(t * 2.4) % count : -1;
      for (let i = 0; i < (asDials ? 0 : count); i++) {
        const qt = back(seg(p, 0.3 + i * 0.035 + (s.hot ? 0.12 : 0), 0.45 + i * 0.035 + (s.hot ? 0.12 : 0)));
        if (qt <= 0) continue;
        const tx = gx + (i % perRow) * (tileS + tg), ty = gy + Math.floor(i / perRow) * (tileS + tg);
        if (ty + tileS > b.y + b.h - 80 * u) break;
        ctx.save(); ctx.translate(tx + tileS / 2, ty + tileS / 2); ctx.scale(qt, qt); ctx.translate(-(tx + tileS / 2), -(ty + tileS / 2));
        if (s.hot) chip(ctx, S, th, tx, ty, tileS, "dial", i % 3 === 0 ? 0 : 2);
        else {
          const on = i === lit && p > 0.6;
          glass(ctx, S, th, tx, ty, tileS, tileS, tileS * 0.3, { blur: 10, shadow: false, tintMul: 1.4, glow: on ? 0.8 : 0 });
          ctx.save(); ctx.translate(tx + tileS / 2, ty + tileS / 2); if (on) ctx.rotate(((t * 2.4) % 1) * TAU); icon(ctx, S, "refresh", 0, 0, tileS * 0.46, on ? th.inkS : th.mutedHi); ctx.restore();
        }
        ctx.restore();
      }
      // Magnitude bar along the bottom.
      const mby = b.y + b.h - pd - 8 * u, mbw = b.w - pd * 2;
      const f = (s.v / mx) * eo(seg(p, 0.4, 0.85));
      bar(ctx, b.x + pd, mby, mbw, 14 * u, th.faint);
      const g = ctx.createLinearGradient(b.x + pd, 0, b.x + pd + mbw, 0);
      g.addColorStop(0, rgba(s.hot ? th.cols[2] : th.cols[3], s.hot ? 1 : 0.7)); g.addColorStop(1, rgba(s.hot ? th.acc : th.cols[0], s.hot ? 1 : 0.7));
      bar(ctx, b.x + pd, mby, Math.max(14 * u, mbw * f), 14 * u, g);
      if (s.hot) glowDot(ctx, th, b.x + pd + mbw * f, mby + 7 * u, 9 * u);
      ctx.restore();
    });
    // Change badge on the winning card.
    if (lv) {
      const pct = Math.round(((rv - lv) / lv) * 100);
      const q = back(seg(p, 0.62, 0.82));
      if (q > 0) {
        ctx.save();
        const bx = R.x + R.w - 40 * u, by = R.y + 40 * u + 36 * u;
        ctx.translate(bx, by); ctx.scale(q, q); ctx.translate(-bx, -by);
        pill(ctx, S, th, `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%`, bx, by, 40 * u, { align: "right", icon: pct < 0 ? "down" : "up", fill: th.acc, weight: 800 });
        ctx.restore();
      }
    }
    // The bridge orb.
    const ox = (c1[0] + c2[0]) / 2, oy = (c1[1] + c2[1]) / 2, orr = (tall ? 58 : 66) * u;
    const qo = back(seg(p, 0.3, 0.55));
    if (qo > 0) {
      ctx.save(); ctx.translate(ox, oy); ctx.scale(qo, qo); ctx.translate(-ox, -oy);
      glass(ctx, S, th, ox - orr, oy - orr, orr * 2, orr * 2, orr, { blur: 20, glow: 0.6, piece: "bridge" });
      icon(ctx, S, tall ? "down" : "arrow", ox, oy, orr * 0.8, th.inkS);
      ctx.restore();
    }
  }

  return {
    bg: "#120c2b", panel: "rgba(255,255,255,0.12)", ink: "#ffffff", muted: "rgba(255,255,255,0.74)", accent: "#7fe7ff", onAccent: "#120c2b",
    rule: "rgba(255,255,255,0.45)", track: "rgba(255,255,255,0.12)",
    display: "'Avenir Next', Avenir, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif", displayWeight: 700, displayCase: "none", displayTracking: "-0.02em",
    body: "'Avenir Next', Avenir, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif", bodyWeight: 500,
    figures: "'Avenir Next', Avenir, 'Segoe UI', Arial, sans-serif", radius: 28, motion: "focus", change: "frost", kit: { line: 2.5, fill: "glass", panel: "glass" },
    panelFilter: "blur(28px) saturate(150%)", panelEdge: "rgba(255,255,255,0.32)",
    palettes: {
      // Daylight: pale frosted panes over soft colour. Night: deeper blues. Mono: silver on graphite.
      light: { bg: "#eef1fb", panel: "rgba(255,255,255,0.45)", ink: "#141833", muted: "rgba(20,24,51,0.68)", accent: "#5b4cff", onAccent: "#ffffff", rule: "rgba(20,24,51,0.3)", track: "rgba(20,24,51,0.08)", panelEdge: "rgba(255,255,255,0.8)",
        textShadow: () => "none", orbColors: ["#ff8fcf", "#7cc8ff", "#a996ff", "#ffc483"], base: "linear-gradient(140deg, #f6f3ff 0%, #eef1fb 55%, #e8f6ff 100%)", deep: ["#f7f2ff", "#eef1fb", "#e6f5ff"] },
      dark: { bg: "#070a1c", orbColors: ["#2b5cff", "#00c2ff", "#7a3cff", "#1b8f9f"], base: "linear-gradient(140deg, #0a0f2e 0%, #070a1c 55%, #04101f 100%)", deep: ["#0a0f2e", "#070a1c", "#04101f"] },
      mono: { accent: "#e6e9f0", onAccent: "#15171c", orbColors: ["#9aa1ad", "#d7dbe3", "#6d7380", "#b8bec9"], base: "linear-gradient(140deg, #22252c 0%, #15171c 55%, #1b1e24 100%)", deep: ["#22252c", "#15171c", "#1b1e24"] },
    },
    textShadow: () => "0 2px 24px rgba(10,6,30,0.35)",
    orbColors: ["#ff4fd8", null, "#6b5cff", "#ff9f5a"], base: "linear-gradient(140deg, #140c3d 0%, #0b0826 55%, #08142e 100%)", deep: ["#120a3e", "#090624", "#06122c"],
    backdrop: (accent, texture = 1, look) => `${grain(0.05 * texture)}, ${look ? look.base : "#120c2b"}`,
    // Headline kicker becomes a frosted capsule.
    css: (accent, look) => {
      const light = lum(rgb(look.bg)) > 150;
      return `#title-scene .kicker::before { content: ""; display: inline-block; width: 0.5em; height: 0.5em; margin: 0 0.7em 0.08em 0; border-radius: 50%; vertical-align: middle;
        background: ${accent}; box-shadow: 0 0 0.6em ${accent}; }
      #title-scene .kicker { align-self: flex-start; padding: 0.55em 1.1em; border-radius: 999px; letter-spacing: 0.12em; color: ${look.ink}; text-shadow: none;
        background: ${light ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.12)"}; border: 1px solid ${light ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.45)"};
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.5), 0 12px 32px ${light ? "rgba(70,60,150,0.16)" : "rgba(8,3,30,0.3)"}; }`;
    },
    // Other templates get the same light field on the texture canvas.
    paint: (ctx, W, H, t, accent, look) => { ctx.clearRect(0, 0, W, H); field(ctx, W, H, t, accent, look, 0, 0, false); },
    keepArt: true,
    overlap: true,
    stage(ctx, S, info) {
      const th = theme(S);
      CAM = camera(S, info);
      CUR.scene = info.scene;
      FRAME.k = 0; FRAME.local = info.local;
      FRAME.drawn = !(info.scene === "title" || info.scene === "closing" || !info.scene);
      const P = part(S);
      if (S.paint && P.world) {
        field(ctx, S.W, S.H, info.t, S.accent, S.look, CAM.x * 0.12, CAM.y * 0.12, true);
        farLayer(ctx, S, th, info.t, CAM);
        backLights(ctx, S, th, info);
        floaters(ctx, S, th, info.t, CAM, "mid");
      }
      // The title has no drawer, so its card crosses out here when the next scene begins.
      const ctl = (window.__dreamcut && window.__dreamcut.controls) || {};
      const titleHold = Number(ctl.title_hold ?? 2.4);
      if (P.front === "only") { fore(ctx, S, th, info.t); return; }
      if (info.index === 1 && titleHold > 0 && info.local < info.change && says(P, "title")) {
        const saved = CAM;
        CAM = camFor(S, 0, titleHold + info.local, titleHold, true, info.change, clamp(info.local / Math.max(0.01, info.change)));
        ctx.save(); if (CAM.blur > 0.4) ctx.filter = `blur(${CAM.blur.toFixed(1)}px)`;
        statement(ctx, S, th, { ...info, scene: "title", local: titleHold + info.local, hold: titleHold });
        ctx.restore();
        CAM = saved;
      }
      if (!FRAME.drawn) {
        ctx.save();
        if (CAM.blur > 0.4) ctx.filter = `blur(${CAM.blur.toFixed(1)}px)`;
        if (info.scene && says(P, info.scene)) statement(ctx, S, th, info);
        ctx.restore();
        if (P.front === true) fore(ctx, S, th, info.t);
      }
    },
    scenes: { chart: wrap(chartScene), object: wrap(objectScene), people: wrap(peopleScene), process: wrap(processScene), compare: wrap(compareScene) },
  };
});
