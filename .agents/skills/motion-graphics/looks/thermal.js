// Thermal: a false-colour heat camera watching a boiler-room corridor. Everything the camera sees is
// painted as temperature on a small buffer (wall tiles, hot pipes carrying pulses, rising convection),
// mapped through an ironbow palette with sensor noise and banding, then scaled up soft. Each scene's
// subject starts cold and warms into view. A crisp camera HUD (brackets, range ramp, spot meters, ROI
// frames) and edge-enhancement lines sit on top. All subjects are original. Frames are pure functions
// of time; texture comes from seeded hashes only.
window.DreamcutMotion.register("thermal", ({ rng, hexA }) => {
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const lerp = (a, b, k) => a + (b - a) * k;
  const mod = (a, n) => ((a % n) + n) % n;
  const stagger = (p, i, n, spread = 0.55) => ease((p - (i / Math.max(1, n)) * spread) / (1 - spread));
  const hash = (a, b = 0, c = 0) => {
    let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const MONO = "'SF Mono','Menlo','Consolas','Courier New',monospace";
  const SANS = "'Avenir Next','Helvetica Neue','Segoe UI',Arial,sans-serif";

  // ---- palettes: temperature (0..255) to colour ---------------------------------------------------
  const IRON = [[0, "#02000a"], [0.12, "#14064a"], [0.28, "#4b0f86"], [0.42, "#9a1d8f"], [0.56, "#dd3f47"], [0.68, "#f47a1f"], [0.8, "#fbb21e"], [0.9, "#fde86a"], [1, "#ffffff"]];
  const TONE = { key: "iron", stops: IRON, gamma: 1, plate: "rgba(14,4,34,0.76)", speck: "255,236,214", vig: "rgba(0,0,0,0.55)", noise: 0.075 };
  const LUTS = {};
  function lutOf(tone) {
    if (LUTS[tone.key]) return LUTS[tone.key];
    const rgb = [];
    const parse = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const st = tone.stops.map(([k, c]) => [k, parse(c)]);
    const u32 = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      const v = Math.pow(i / 255, tone.gamma);
      let a = st[0], b = st[st.length - 1];
      for (let s = 0; s < st.length - 1; s++) if (v >= st[s][0] && v <= st[s + 1][0]) { a = st[s]; b = st[s + 1]; break; }
      const k = b[0] === a[0] ? 0 : clamp((v - a[0]) / (b[0] - a[0]));
      const c = [0, 1, 2].map((j) => Math.round(lerp(a[1][j], b[1][j], k)));
      rgb.push(c);
      u32[i] = (c[2] << 16) | (c[1] << 8) | c[0];
    }
    return (LUTS[tone.key] = { u32, rgb });
  }
  const heatCss = (S, v, a = 1) => { const c = lutOf(S.look.tone).rgb[clamp(Math.round(v), 0, 255)]; return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };

  // ---- the heat buffer: a small canvas holding temperature as grey, mapped on flush -----------------
  let B = null;
  function begin(S) {
    const cell = Math.max(3, 6 * S.u);
    const w = Math.ceil(S.W / cell) + 1, h = Math.ceil(S.H / cell) + 1;
    if (!B || B.w !== w || B.h !== h || B.cell !== cell) {
      const mk = (ro) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d", ro ? { willReadFrequently: true } : undefined)]; };
      const [c, g] = mk(true), [oc, og] = mk(false);
      B = { c, g, oc, og, w, h, cell };
    }
    const g = B.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.setLineDash([]);
    g.clearRect(0, 0, w, h);
    g.scale(1 / B.cell, 1 / B.cell);
    return g;
  }
  const tc = (v, a = 1) => { const n = clamp(Math.round(v), 0, 255); return `rgba(${n},${n},${n},${a})`; };
  function blob(g, x, y, r, v, a = 1) {
    if (r <= 0 || a <= 0) return;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, tc(v, a)); gr.addColorStop(0.5, tc(v, a * 0.55)); gr.addColorStop(1, tc(v, 0));
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function rr(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  // Map the buffer through the palette (with sensor noise and banding) and scale it up soft.
  function flush(ctx, S, { t, alpha = 1 }) {
    if (alpha <= 0) return;
    const { g, og, oc, w, h, cell } = B;
    const tone = S.look.tone, lut = lutOf(tone).u32, tex = S.look.texture;
    const im = g.getImageData(0, 0, w, h);
    const px = new Uint32Array(im.data.buffer), src = im.data;
    const fr = Math.floor(t * 15), nz = tone.noise * 255 * tex, bands = tex > 0.05 ? 56 : 255;
    for (let y = 0, i = 0; y < h; y++) {
      const rowOff = (hash(y, 7, fr >> 2) - 0.5) * 3 * tex;
      for (let x = 0; x < w; x++, i++) {
        const a = src[i * 4 + 3];
        if (a === 0) { px[i] = 0; continue; }
        let v = src[i * 4] + (hash(x, y, fr) - 0.5) * nz + (hash(x, 3, 11) - 0.5) * 5 * tex + rowOff;
        v = Math.round(clamp(v, 0, 255) / 255 * bands) * (255 / bands);
        px[i] = ((a << 24) | lut[clamp(Math.round(v), 0, 255)]) >>> 0;
      }
    }
    og.putImageData(im, 0, 0);
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    if (S.look.texture > 0.05) ctx.filter = `blur(${(cell * 0.3).toFixed(2)}px)`;
    ctx.drawImage(oc, 0, 0, w, h, 0, 0, w * cell, h * cell);
    ctx.filter = "none";
    ctx.restore();
  }

  // ---- crisp helpers ------------------------------------------------------------------------------
  function say(ctx, s, x, y, size, o = {}) {
    ctx.save();
    ctx.font = `${o.weight || 700} ${size}px ${o.font || SANS}`;
    ctx.textAlign = o.align || "left"; ctx.textBaseline = o.base || "alphabetic"; ctx.fillStyle = o.color;
    ctx.fillText(String(s), x, y);
    ctx.restore();
  }
  function measure(ctx, s, size, weight = 700, font = SANS) { ctx.save(); ctx.font = `${weight} ${size}px ${font}`; const w = ctx.measureText(String(s)).width; ctx.restore(); return w; }
  // A label plate: translucent camera-overlay box with the text centred in it.
  function chip(ctx, S, s, x, y, size, o = {}) {
    const look = S.look, pad = (o.pad ?? 0.42) * size, w = measure(ctx, s, size, o.weight || 700, o.font) + pad * 2, h = size * 1.42;
    const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    const y0 = o.base === "middle" ? y - h / 2 : o.base === "bottom" ? y - h : y;
    ctx.save();
    ctx.globalAlpha *= o.alpha ?? 1;
    rr(ctx, x0, y0, w, h, 4 * S.u); ctx.fillStyle = o.bg || look.tone.plate; ctx.fill();
    if (o.edge) { ctx.fillStyle = o.edge; ctx.fillRect(x0, y0, Math.max(3, 5 * S.u), h); }
    say(ctx, s, x0 + w / 2, y0 + h / 2 + size * 0.02, size, { align: "center", base: "middle", color: o.color || look.ink, weight: o.weight, font: o.font });
    ctx.restore();
    return { x: x0, y: y0, w, h };
  }
  function brackets(ctx, x, y, w, h, l, color, lw) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = "square"; ctx.beginPath();
    ctx.moveTo(x, y + l); ctx.lineTo(x, y); ctx.lineTo(x + l, y);
    ctx.moveTo(x + w - l, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + l);
    ctx.moveTo(x + w, y + h - l); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - l, y + h);
    ctx.moveTo(x + l, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - l);
    ctx.stroke(); ctx.restore();
  }
  function cross(ctx, S, x, y, size, color, lw = 2.5) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw * S.u; ctx.beginPath();
    ctx.moveTo(x - size, y); ctx.lineTo(x - size * 0.35, y); ctx.moveTo(x + size * 0.35, y); ctx.lineTo(x + size, y);
    ctx.moveTo(x, y - size); ctx.lineTo(x, y - size * 0.35); ctx.moveTo(x, y + size * 0.35); ctx.lineTo(x, y + size);
    ctx.stroke(); ctx.restore();
  }
  const reading = (base, t, k) => (base + 0.35 * Math.sin(t * 7 + k * 3) + 0.2 * Math.sin(t * 13 + k)).toFixed(1) + "°C";
  const rows = (S) => S.tall;

  // ---- the corridor: wall tiles, hot pipes with pulses, floor and rising convection ----------------
  function panOf(S, info) {
    const idx = Math.max(0, info.index ?? 0);
    const a = idx <= 0 ? 0 : ease(info.local / (info.change + 0.5));
    return (idx <= 0 ? 0 : idx - 1 + a) * 0.09 * S.W + info.t * 16 * S.u;
  }
  function world(g, S, info) {
    const { W, H, u } = S, t = info.t, pan = panOf(S, info), wallB = H * 0.78;
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, tc(36)); gr.addColorStop(0.55, tc(50)); gr.addColorStop(0.78, tc(64)); gr.addColorStop(1, tc(40));
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // Wall tiles, each its own temperature, with a slow warm wave crossing the wall.
    const tw = 230 * u, th = 160 * u;
    const i0 = Math.floor(pan / tw) - 1, i1 = Math.ceil((pan + W) / tw) + 1;
    for (let j = 0; j * th < wallB; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = i * tw - pan, y = j * th, hh = hash(i, j, 1);
        let v = 46 + hh * 16 + 10 * Math.sin(i * 0.8 - t * 0.7 + j * 0.6);
        if (hh > 0.88) v += 32 + 10 * Math.sin(t * 2 + i + j);
        g.fillStyle = tc(v, 0.95);
        g.fillRect(x + 5 * u, y + 5 * u, tw - 10 * u, Math.min(th, wallB - y) - 10 * u);
      }
    }
    // Pipes carrying warm pulses.
    const pipe = (yf, thk, v, dir, seed) => {
      const y = H * yf, T = thk * u;
      const gp = g.createLinearGradient(0, y - T / 2, 0, y + T / 2);
      gp.addColorStop(0, tc(v * 0.6)); gp.addColorStop(0.35, tc(v * 1.3)); gp.addColorStop(0.7, tc(v * 0.9)); gp.addColorStop(1, tc(v * 0.5));
      g.fillStyle = gp; g.fillRect(0, y - T / 2, W, T);
      const sp = 520 * u, k0 = Math.floor((pan * 1.15) / sp) - 1;
      for (let k = k0; k < k0 + W / sp + 3; k++) {
        const x = k * sp - pan * 1.15 + hash(k, seed) * 80 * u;
        g.fillStyle = tc(v * 1.15); g.fillRect(x, y - T * 0.72, 26 * u, T * 1.44);
        if (hash(k, seed, 5) > 0.55) { g.strokeStyle = tc(v * 1.7, 0.9); g.lineWidth = 6 * u; g.beginPath(); g.arc(x + 13 * u, y - T * 1.35, 30 * u, 0, 6.3); g.stroke(); }
      }
      const per = 760 * u;
      for (let k = 0; k < 4; k++) {
        const x = mod(t * dir * 220 * u + k * per - pan * 0.4, W + per) - per / 2;
        blob(g, x, y, T * 1.5, 205, 0.9);
        blob(g, x - dir * T * 1.2, y, T * 0.9, 150, 0.6);
      }
    };
    pipe(0.15, 44, 96, 1, 3);
    pipe(0.27, 26, 80, -1, 9);
    // Floor, a warm seam where it meets the wall and heat shimmer on the tiles.
    const fl = g.createLinearGradient(0, wallB, 0, H);
    fl.addColorStop(0, tc(70)); fl.addColorStop(1, tc(38)); g.fillStyle = fl; g.fillRect(0, wallB, W, H - wallB);
    g.fillStyle = tc(104, 0.9); g.fillRect(0, wallB - 3 * u, W, 8 * u);
    for (let k = 0; k < 9; k++) {
      const y = wallB + (k + 0.5) * ((H - wallB) / 9), x = mod(hash(k, 4) * W + t * (18 + 10 * hash(k, 5)) * u * (k % 2 ? 1 : -1), W + 400 * u) - 200 * u;
      g.fillStyle = tc(66 + 22 * Math.sin(t * 1.3 + k), 0.8); g.fillRect(x, y, (160 + hash(k, 6) * 220) * u, 5 * u);
    }
    // Large slow warm drifts and rising convection wisps.
    for (let k = 0; k < 5; k++) blob(g, mod(hash(k, 1) * W + Math.sin(t * 0.21 + k * 2) * 200 * u - pan * 0.3, W), H * (0.25 + 0.5 * hash(k, 2)) + Math.cos(t * 0.17 + k) * 90 * u, H * 0.34, 74 + 18 * hash(k, 3), 0.34);
    for (let k = 0; k < 18; k++) {
      const ph = mod(t * (0.06 + 0.05 * hash(k, 8)) + hash(k, 9), 1);
      blob(g, mod(hash(k, 10) * W - pan * 0.25 + Math.sin(t * 0.8 + k * 1.7) * 36 * u, W), H * 0.84 - ph * H * 0.8, (60 + 50 * hash(k, 11)) * u, 74 + 56 * (1 - ph), 0.5 * (1 - ph));
    }
  }

  // ---- HUD -----------------------------------------------------------------------------------------
  function band(ctx, S, local, change, t) {
    const dur = change * 1.7;
    if (local < 0 || local > dur) return;
    const k = ease(local / dur), x = lerp(-0.08, 1.08, k) * S.W, w = S.W * 0.16;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const gr = ctx.createLinearGradient(x - w, 0, x, 0);
    gr.addColorStop(0, "rgba(255,150,60,0)"); gr.addColorStop(0.8, "rgba(255,170,80,0.16)"); gr.addColorStop(1, "rgba(255,250,225,0.55)");
    ctx.fillStyle = gr; ctx.fillRect(x - w, 0, w, S.H);
    ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.fillRect(x - 2 * S.u, 0, 4 * S.u, S.H);
    ctx.restore();
  }
  function hud(ctx, S, info) {
    const { W, H, u, look } = S, t = info.t, ink = look.ink, idx = Math.max(0, info.index ?? 0);
    const m = 34 * u, l = 66 * u, tall = S.tall;
    ctx.save();
    brackets(ctx, m, m, W - m * 2, H - m * 2, l, hexA(ink, 0.8), 3 * u);
    // Status: blinking record dot and a running clock.
    const mm = String(Math.floor(t / 60)).padStart(2, "0"), ss = String(Math.floor(t % 60)).padStart(2, "0"), ds = Math.floor((t * 10) % 10);
    say(ctx, `REC ${mm}:${ss}.${ds}`, W - m - 16 * u, m + 46 * u, 30 * u, { align: "right", color: hexA(ink, 0.92), font: MONO });
    if (Math.floor(t * 1.4) % 2 === 0) { ctx.fillStyle = "#ff4a3d"; ctx.beginPath(); ctx.arc(W - m - 16 * u - measure(ctx, `REC ${mm}:${ss}.${ds}`, 30 * u, 700, MONO) - 20 * u, m + 36 * u, 8 * u, 0, 6.3); ctx.fill(); }
    say(ctx, "PAL IRON · RNG AUTO", W - m - 16 * u, m + 84 * u, 24 * u, { align: "right", color: hexA(ink, 0.7), font: MONO, weight: 600 });
    // Bottom row: battery and zone.
    const by = H - m - 18 * u;
    ctx.strokeStyle = hexA(ink, 0.85); ctx.lineWidth = 3 * u;
    ctx.strokeRect(m + 18 * u, by - 22 * u, 46 * u, 22 * u); ctx.fillStyle = hexA(ink, 0.85); ctx.fillRect(m + 64 * u, by - 15 * u, 5 * u, 8 * u);
    ctx.fillRect(m + 22 * u, by - 18 * u, (38 - 2 * (Math.floor(t * 0.5) % 3)) * u, 14 * u);
    say(ctx, `ZONE ${String(idx + 1).padStart(2, "0")} · ${String(info.scene || "scan").toUpperCase()}`, W - m - 16 * u, by, 26 * u, { align: "right", color: hexA(ink, 0.75), font: MONO, weight: 600 });
    // Range ramp with its readings and a drifting marker.
    const rx = W - (tall ? 46 : 64) * u, ry0 = H * (tall ? 0.34 : 0.3), ry1 = H * (tall ? 0.84 : 0.8), rw = 24 * u;
    const lut = lutOf(look.tone).rgb, rg = ctx.createLinearGradient(0, ry0, 0, ry1);
    for (let s = 0; s <= 8; s++) { const c = lut[Math.round(255 * (1 - s / 8))]; rg.addColorStop(s / 8, `rgb(${c[0]},${c[1]},${c[2]})`); }
    ctx.fillStyle = rg; ctx.fillRect(rx - rw / 2, ry0, rw, ry1 - ry0);
    ctx.strokeStyle = hexA(ink, 0.85); ctx.lineWidth = 2 * u; ctx.strokeRect(rx - rw / 2, ry0, rw, ry1 - ry0);
    for (let s = 1; s < 8; s++) { const y = lerp(ry0, ry1, s / 8); ctx.beginPath(); ctx.moveTo(rx - rw / 2 - 8 * u, y); ctx.lineTo(rx - rw / 2, y); ctx.stroke(); }
    const hi = 58 + Math.round(5 * Math.sin(t * 0.4 + idx)), lo = 19 + (idx % 3);
    say(ctx, `${hi}°`, rx, ry0 - 14 * u, 26 * u, { align: "center", color: hexA(ink, 0.92), font: MONO });
    say(ctx, `${lo}°`, rx, ry1 + 34 * u, 26 * u, { align: "center", color: hexA(ink, 0.92), font: MONO });
    const my = lerp(ry0, ry1, 0.5 + 0.34 * Math.sin(t * 0.5 + idx * 1.3));
    ctx.fillStyle = S.accent; ctx.beginPath(); ctx.moveTo(rx - rw / 2 - 4 * u, my); ctx.lineTo(rx - rw / 2 - 20 * u, my - 11 * u); ctx.lineTo(rx - rw / 2 - 20 * u, my + 11 * u); ctx.closePath(); ctx.fill();
    // A small reticle wandering the frame.
    cross(ctx, S, W / 2 + Math.sin(t * 0.31) * W * 0.05, H * 0.5 + Math.cos(t * 0.27) * H * 0.04, 22 * u, hexA(ink, 0.3), 1.6);
    ctx.restore();
  }

  // ---- title: two film strips scanned by a heat line ---------------------------------------------
  function stripFrames(S, info, k) {
    const { W, H, u } = S, t = info.t, fw = (S.tall ? 230 : 300) * u, fh = fw * 0.64, out = [];
    const count = Math.ceil(W / fw) + 3, period = count * fw;
    const slide = (1 - ease(k)) * W * 0.4;
    [{ y: S.tall ? 0.115 : 0.16, dir: 1, ph: 0 }, { y: S.tall ? 0.885 : 0.84, dir: -1, ph: 0.4 }].forEach((s, si) => {
      const xs = (mod(t * 0.22 + s.ph, 1.25) - 0.125) * W;
      for (let i = 0; i < count; i++) {
        const raw = i * fw + s.dir * t * 150 * u, cx = mod(raw, period) - fw, ord = i + count * Math.floor(raw / period);
        const arg = cx * 0.0045 + t * 0.7 + si * 2, cy = s.y * H + Math.sin(arg) * 26 * u, ang = Math.atan(Math.cos(arg) * 0.117);
        const d = xs - cx, heat = d > 0 ? Math.exp(-d / (W * 0.22)) : Math.exp(-(d * d) / Math.pow(fw * 0.7, 2));
        out.push({ cx: cx - s.dir * slide, cy, ang, fw, fh, tf: 62 + 178 * heat, kind: Math.floor(hash(ord, si, 3) * 3), ord, xs, si, y: s.y });
      }
    });
    return out;
  }
  function stripHeat(g, S, fr, k) {
    const u = S.u;
    for (const f of fr) {
      g.save(); g.translate(f.cx, f.cy); g.rotate(f.ang); g.globalAlpha = 0.45 + 0.55 * k;
      g.fillStyle = tc(64); rr(g, -f.fw / 2, -f.fh / 2, f.fw - 3 * u, f.fh, 8 * u); g.fill();
      g.fillStyle = tc(28);
      for (let h = 0; h < 6; h++) { g.fillRect(-f.fw / 2 + (h + 0.4) * f.fw / 6, -f.fh / 2 + 7 * u, 16 * u, 20 * u); g.fillRect(-f.fw / 2 + (h + 0.4) * f.fw / 6, f.fh / 2 - 27 * u, 16 * u, 20 * u); }
      const pw = f.fw * 0.74, ph = f.fh * 0.56;
      g.fillStyle = tc(f.tf * 0.8); g.fillRect(-pw / 2, -ph / 2, pw, ph);
      blob(g, 0, 0, pw * 0.6, f.tf, 0.55);
      g.fillStyle = tc(Math.min(255, f.tf + 55)); g.strokeStyle = tc(Math.min(255, f.tf + 55)); g.lineWidth = 9 * u;
      if (f.kind === 0) { g.beginPath(); g.arc(0, 0, ph * 0.26, 0, 6.3); g.fill(); }
      else if (f.kind === 1) { g.beginPath(); g.moveTo(-ph * 0.26, ph * 0.24); g.lineTo(0, -ph * 0.28); g.lineTo(ph * 0.26, ph * 0.24); g.closePath(); g.fill(); }
      else for (let b = -1; b <= 1; b++) g.fillRect(b * ph * 0.26 - 6 * u, -ph * 0.1 * (2 + b) , 12 * u, ph * 0.1 * (2 + b) * 2);
      g.restore();
    }
  }
  function stripCrisp(ctx, S, fr, k) {
    const u = S.u, ink = S.look.ink;
    ctx.save();
    for (const f of fr) {
      ctx.save(); ctx.translate(f.cx, f.cy); ctx.rotate(f.ang); ctx.globalAlpha = 0.45 + 0.4 * k;
      ctx.strokeStyle = hexA(ink, 0.5); ctx.lineWidth = 2.2 * u;
      ctx.strokeRect(-f.fw * 0.37, -f.fh * 0.28, f.fw * 0.74, f.fh * 0.56);
      ctx.restore();
    }
    ctx.restore();
  }

  // ---- closing: an approval mark etched in heat, ripples leaving it ----------------------------------
  function closingGeom(S) { const s = S.H * (S.tall ? 0.075 : 0.092); return { cx: S.W / 2, cy: S.H * (S.tall ? 0.715 : 0.775), s }; }
  function closingHeat(g, S, info) {
    const { W, H, u } = S, t = info.t, { cx, cy, s } = closingGeom(S), k = 0.3 + 0.7 * ease(info.local / 1.0);
    blob(g, cx, cy, s * 3.1, 190 * k, 0.7 + 0.1 * Math.sin(t * 3));
    for (let j = 0; j < 4; j++) {
      const ph = mod(t * 0.33 + j / 4, 1);
      g.strokeStyle = tc(205, (1 - ph) * k); g.lineWidth = (18 * (1 - ph * 0.6) + 4) * u; g.beginPath(); g.arc(cx, cy, s * 1.6 + ph * H * 0.62, 0, 6.3); g.stroke();
    }
    const pts = [[-1, -0.1], [-0.35, 0.65], [1.05, -0.75]].map(([x, y]) => [cx + x * s, cy + y * s]);
    const prog = ease(info.local / 0.9);
    const draw = (w, v, a) => {
      g.strokeStyle = tc(v, a); g.lineWidth = w; g.lineCap = "round"; g.lineJoin = "round"; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      const L1 = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]), L2 = Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]);
      let left = (L1 + L2) * prog;
      const seg = (a1, b1) => { const L = Math.hypot(b1[0] - a1[0], b1[1] - a1[1]), f = Math.min(1, left / L); g.lineTo(a1[0] + (b1[0] - a1[0]) * f, a1[1] + (b1[1] - a1[1]) * f); left -= L; };
      seg(pts[0], pts[1]); if (left > 0) seg(pts[1], pts[2]);
      g.stroke();
    };
    draw(70 * u, 170, 0.5); draw(34 * u, 252, 1);
    for (let i = 0; i < 20; i++) {
      const ph = mod(t * 0.22 + hash(i, 1) * 7, 1);
      blob(g, cx + (hash(i, 2) - 0.5) * s * 3.2 + Math.sin(t + i) * 20 * u, cy - ph * H * 0.55, 24 * u * (1 - ph * 0.5), 235 * (1 - ph * 0.55), 0.85 * (1 - ph));
    }
  }
  function closingCrisp(ctx, S, info) {
    const { u, look } = S, t = info.t, { cx, cy, s } = closingGeom(S), ink = look.ink;
    ctx.save();
    ctx.setLineDash([26 * u, 18 * u]); ctx.lineDashOffset = -t * 40 * u; ctx.strokeStyle = hexA(S.accent, 0.8); ctx.lineWidth = 3.5 * u;
    ctx.beginPath(); ctx.arc(cx, cy, s * 2.0, 0, 6.3); ctx.stroke();
    ctx.setLineDash([8 * u, 22 * u]); ctx.lineDashOffset = t * 30 * u; ctx.strokeStyle = hexA(ink, 0.5); ctx.beginPath(); ctx.arc(cx, cy, s * 2.35, 0, 6.3); ctx.stroke();
    ctx.setLineDash([]);
    const prog = ease(info.local / 0.9);
    ctx.strokeStyle = hexA(ink, 0.85); ctx.lineWidth = 4 * u; ctx.lineCap = "round"; ctx.lineJoin = "round";
    const P = [[cx - s, cy - 0.1 * s], [cx - 0.35 * s, cy + 0.65 * s], [cx + 1.05 * s, cy - 0.75 * s]];
    const L1 = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]), L2 = Math.hypot(P[2][0] - P[1][0], P[2][1] - P[1][1]);
    let left = (L1 + L2) * prog;
    ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]);
    for (let i = 0; i < 2 && left > 0; i++) { const a = P[i], b = P[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), f = Math.min(1, left / L); ctx.lineTo(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f); left -= L; }
    ctx.stroke();
    const ap = `APPROVED  ${(36.4 + 0.3 * Math.sin(t * 5)).toFixed(1)}°C`;
    if (S.W < S.H * 1.3) chip(ctx, S, ap, cx, Math.min(cy + s * 2.5, S.H - 120 * u), 34 * u, { align: "center", base: "middle", font: MONO, color: look.ink, edge: S.accent });
    else chip(ctx, S, ap, cx + s * 2.7, cy, 34 * u, { base: "middle", font: MONO, color: look.ink, edge: S.accent });
    ctx.restore();
  }

  // ---- scene plumbing --------------------------------------------------------------------------------
  function gate(info) {
    const out = info.exit || 0;
    const tail = clamp((info.local - (info.hold - info.change)) / Math.max(0.01, info.change));
    return { out, ex: out > 0 ? 0.25 + 0.75 * clamp(out * 1.7) : 0.25 * tail };
  }
  // Run a scene: heat pass, flush with exit slide and fade, then crisp pass.
  function run(ctx, S, info, p, heatFn, crispFn) {
    const { out, ex } = gate(info);
    if (ex >= 0.999) return;
    const g = begin(S), dx = -out * S.W * 0.06;
    heatFn(g);
    ctx.save();
    ctx.globalAlpha = (1 - ex) * clamp(0.25 + p * 4);
    ctx.translate(dx, 0);
    flush(ctx, S, { t: info.t });
    ctx.globalAlpha = 1 - ex;
    crispFn(ctx);
    ctx.restore();
    if (!out) band(ctx, S, info.local, info.change, info.t);
  }
  const inkA = (S, a) => hexA(S.look.ink, a);

  // ---- chart: heat columns -------------------------------------------------------------------------------
  function chart(ctx, S, box, p, d, info) {
    const { u } = S, t = info.t, n = d.values.length, max = Math.max(...d.values, 1);
    const gap = box.w * 0.06, bw = (box.w - gap * (n + 1)) / n, base = box.y + box.h - 70 * u, full = box.h - 210 * u;
    const xOf = (i) => box.x + gap + i * (bw + gap);
    run(ctx, S, info, p, (g) => {
      blob(g, box.x + box.w / 2, base - full * 0.4, box.w * 0.55, 92, 0.35);
      d.values.forEach((value, i) => {
        const q = stagger(p, i, n), x = xOf(i), h = full * (value / max), hh = h * q, hot = i === d.highlight;
        const topV = hot ? 255 : 150 + 70 * (value / max) + 7 * Math.sin(t * 2.4 + i);
        g.fillStyle = tc(46, 0.85); g.fillRect(x, base - full, bw, full);
        if (hh > 1) {
          const gr = g.createLinearGradient(0, base, 0, base - hh); gr.addColorStop(0, tc(96)); gr.addColorStop(1, tc(topV));
          g.fillStyle = gr; g.fillRect(x, base - hh, bw, hh);
          blob(g, x + bw / 2, base - hh, bw * 0.85, topV, 0.55 + 0.15 * Math.sin(t * 3 + i));
        }
        for (let k = 0; k < 3; k++) {
          const ph = mod(t * 0.35 + k / 3 + i * 0.17, 1);
          blob(g, x + bw / 2 + Math.sin(t * 1.7 + k * 2 + i) * bw * 0.22, base - hh - ph * 170 * u, bw * 0.3 * (1 - ph * 0.4), topV * 0.85, 0.5 * (1 - ph) * q);
        }
      });
    }, (c) => {
      c.strokeStyle = inkA(S, 0.14); c.lineWidth = 2 * u; c.setLineDash([6 * u, 12 * u]);
      for (const f of [0.25, 0.5, 0.75, 1]) { c.beginPath(); c.moveTo(box.x, base - full * f); c.lineTo(box.x + box.w, base - full * f); c.stroke(); }
      c.setLineDash([]); c.strokeStyle = inkA(S, 0.7); c.lineWidth = 3 * u;
      c.beginPath(); c.moveTo(box.x, base); c.lineTo(box.x + box.w * ease(p * 2.2), base); c.stroke();
      const hv = d.values[d.highlight] ?? max;
      d.values.forEach((value, i) => {
        const q = stagger(p, i, n), x = xOf(i), hh = full * (value / max) * q, hot = i === d.highlight;
        if (hh > 2) { c.strokeStyle = inkA(S, hot ? 0.8 : 0.45); c.lineWidth = 2.4 * u; c.strokeRect(x, base - hh, bw, hh); }
        if (q > 0.12) {
          cross(c, S, x + bw / 2, base - hh, 20 * u, inkA(S, 0.9));
          const txt = M().formatNumber(value * q, 0, d.prefix, d.suffix);
          const ch = chip(c, S, txt, x + bw / 2, base - hh - 34 * u, 96 * u, { align: "center", base: "bottom", font: MONO, color: hot ? S.accent : S.look.ink, pad: 0.22 });
          if (hot && q > 0.9) chip(c, S, "PEAK", ch.x, ch.y - 8 * u, 32 * u, { base: "bottom", bg: S.accent, color: S.look.onAccent, font: MONO, pad: 0.5 });
          chip(c, S, d.labels[i] || "", x + bw / 2, base + 34 * u, 42 * u, { align: "center", pad: 0.4, alpha: clamp(q * 3) });
        }
      });
      if (stagger(p, d.highlight, n) > 0.9) {
        const y = base - full * (hv / max);
        c.save(); c.strokeStyle = hexA(S.accent, 0.85); c.lineWidth = 3 * u; c.setLineDash([18 * u, 12 * u]); c.lineDashOffset = -t * 60 * u;
        c.beginPath(); c.moveTo(box.x, y); c.lineTo(box.x + box.w, y); c.stroke(); c.restore();
        const x = xOf(d.highlight); brackets(c, x - 16 * u, y - 16 * u, bw + 32 * u, base - y + 16 * u, 24 * u, hexA(S.accent, 0.95), 3.5 * u);
      }
    });
  }

  // ---- object: a laptop or phone that powers up from cold ----------------------------------------------------
  function objectGeom(S, box, d) {
    const u = S.u, vert = box.h > box.w * 0.9, phone = d.kind === "phone";
    let w, h, x, y;
    if (phone) { w = vert ? Math.min(box.w * 0.5, box.h * 0.32) : Math.min(box.w * 0.32, box.h * 0.48); h = w * 1.9; x = vert ? box.x + (box.w - w) / 2 : box.x + box.w * 0.3 - w / 2; y = vert ? box.y + 30 * u : box.y + (box.h - h) / 2; }
    else { w = vert ? box.w * 0.86 : Math.min(box.w * 0.62, box.h * 1.25); h = w * 0.62; x = vert ? box.x + (box.w - w) / 2 : box.x + box.w * 0.06; y = vert ? box.y + 40 * u : box.y + (box.h - h * 1.16) / 2; }
    const pad = (phone ? 18 : 22) * u, sx = x + pad, sy = y + pad, sw = w - pad * 2, sh = h - pad * 2;
    const preview = { x: sx + sw * 0.08, y: sy + sh * 0.08, w: sw * 0.84, h: sh * 0.42 };
    const anchors = [[preview.x + preview.w * 0.7, preview.y + preview.h * 0.3], [sx + sw * 0.52, sy + sh * 0.64], [sx + sw * 0.2, sy + sh * 0.86]];
    return { vert, phone, w, h, x, y, sx, sy, sw, sh, preview, anchors };
  }
  function object(ctx, S, box, p, d, info) {
    const { u } = S, t = info.t, G = objectGeom(S, box, d), warm = ease(p * 1.25);
    const { x, y, w, h, sx, sy, sw, sh, preview, phone } = G;
    const play = mod(t * 0.22, 1);
    const clipRects = [];
    for (let tr = 0; tr < 3; tr++) [[0.08, 0.3], [0.4, 0.22], [0.65, 0.27]].forEach(([cx, cw], i) => clipRects.push({ tr, i, x: sx + sw * (cx + tr * 0.03), y: sy + sh * 0.58 + tr * (sh * 0.11 + sh * 0.04), w: sw * cw, h: sh * 0.11, hot: tr === 0 && i === 1 }));
    run(ctx, S, info, p, (g) => {
      blob(g, x + w / 2, y + h * 0.6, w * 0.8, 70 + 50 * warm, 0.6);
      for (let k = 0; k < 4; k++) {
        const ph = mod(t * 0.3 + k * 0.27, 1);
        blob(g, x + w * (0.2 + 0.2 * k) + Math.sin(t * 1.4 + k * 2) * w * 0.03, y - ph * h * 0.5, w * (0.08 + ph * 0.06), 60 + 120 * (1 - ph), 0.6 * (1 - ph) * warm);
      }
      g.fillStyle = tc(64 + 12 * warm); rr(g, x, y, w, h, (phone ? 36 : 16) * u); g.fill();
      if (!phone) {
        g.beginPath(); g.moveTo(x - w * 0.06, y + h * 1.14); g.lineTo(x + w * 1.06, y + h * 1.14); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath();
        const gr = g.createLinearGradient(0, y + h, 0, y + h * 1.14); gr.addColorStop(0, tc(70 + 60 * warm)); gr.addColorStop(1, tc(56)); g.fillStyle = gr; g.fill();
        g.fillStyle = tc(50);
        for (let r = 0; r < 3; r++) for (let k = 0; k < 14; k++) g.fillRect(x + w * (0.02 + k * 0.0705), y + h * (1.02 + r * 0.038), w * 0.058, h * 0.026);
        blob(g, x + w / 2, y + h * 1.07, w * 0.22, 250 * warm, 0.9 + 0.1 * Math.sin(t * 4));
        for (let k = 0; k < 7; k++) { g.fillStyle = tc((150 + 80 * Math.sin(t * 5 + k * 1.7)) * warm, 0.9); g.fillRect(x + w * (0.1 + k * 0.115), y + h * 1.003, w * 0.09, h * 0.012); }
      } else {
        blob(g, x + w / 2, y + h * 0.96, w * 0.3, 190 * warm, 0.8);
        blob(g, x + w * 0.78, y + h * 0.05, w * 0.12, 230 * warm, 0.9 + 0.1 * Math.sin(t * 3));
      }
      const gs = g.createLinearGradient(0, sy, 0, sy + sh); gs.addColorStop(0, tc(86 + 62 * warm)); gs.addColorStop(1, tc(110 + 50 * warm));
      g.fillStyle = gs; rr(g, sx, sy, sw, sh, 8 * u); g.fill();
      g.fillStyle = tc(150 + 85 * warm + 10 * Math.sin(t * 2)); g.fillRect(preview.x, preview.y, preview.w, preview.h);
      blob(g, preview.x + preview.w / 2, preview.y + preview.h / 2, preview.w * 0.4, 255, 0.5 * warm);
      for (const c of clipRects) {
        const shown = clamp((warm * 1.6 - c.i * 0.2) * 1.4);
        g.fillStyle = tc(c.hot ? 215 + 30 * Math.sin(t * 3) : 118 + 22 * c.tr + 20 * c.i, 0.95); g.fillRect(c.x, c.y, c.w * shown, c.h);
      }
      g.fillStyle = tc(255); g.fillRect(sx + sw * (0.06 + 0.88 * play) - 3 * u, sy + sh * 0.55, 6 * u, sh * 0.42);
    }, (c) => {
      c.strokeStyle = inkA(S, 0.55); c.lineWidth = 3 * u; rr(c, x, y, w, h, (phone ? 36 : 16) * u); c.stroke();
      c.strokeStyle = inkA(S, 0.32); c.lineWidth = 2 * u; rr(c, sx, sy, sw, sh, 8 * u); c.stroke();
      c.strokeRect(preview.x, preview.y, preview.w, preview.h);
      if (!phone) { c.strokeStyle = inkA(S, 0.5); c.lineWidth = 3 * u; c.beginPath(); c.moveTo(x - w * 0.06, y + h * 1.14); c.lineTo(x + w * 1.06, y + h * 1.14); c.lineTo(x + w, y + h); c.stroke(); }
      c.strokeStyle = hexA(S.accent, 0.9); c.lineWidth = 3 * u;
      c.beginPath(); c.moveTo(sx + sw * (0.06 + 0.88 * play), sy + sh * 0.55); c.lineTo(sx + sw * (0.06 + 0.88 * play), sy + sh * 0.97); c.stroke();
      const temps = [51.2, 63.8, 44.6];
      d.callouts.forEach((label, i) => {
        const q = stagger(p, i, d.callouts.length, 0.5);
        if (q <= 0 || !label) return;
        const [ax, ay] = G.anchors[i];
        c.save(); c.globalAlpha = clamp(q * 1.6);
        cross(c, S, ax, ay, 22 * u, hexA(S.accent, 1), 3);
        c.strokeStyle = hexA(S.accent, 0.95); c.lineWidth = 3 * u; c.beginPath(); c.arc(ax, ay, 9 * u, 0, 6.3); c.stroke();
        if (!G.vert) {
          const lx = box.x + box.w * 0.64, ly = box.y + box.h * (0.2 + i * 0.28);
          c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax + (lx - 14 * u - ax) * q, ay + (ly - ay) * q); c.stroke();
          if (q > 0.85) {
            chip(c, S, label, lx, ly, 46 * u, { base: "middle", edge: S.accent });
            chip(c, S, `Sp${i + 1} ${reading(temps[i], t, i)}`, lx, ly + 62 * u, 30 * u, { base: "middle", font: MONO, color: S.accent, weight: 600 });
          }
        } else {
          const ly = G.y + G.h * 1.16 + 100 * u + i * 128 * u;
          c.fillStyle = S.accent; c.beginPath(); c.arc(ax + 26 * u, ay - 26 * u, 20 * u, 0, 6.3); c.fill();
          say(c, i + 1, ax + 26 * u, ay - 25 * u, 26 * u, { align: "center", base: "middle", color: S.look.onAccent, font: MONO });
          if (q > 0.5) {
            c.fillStyle = S.accent; c.beginPath(); c.arc(box.x + 30 * u, ly, 24 * u, 0, 6.3); c.fill();
            say(c, i + 1, box.x + 30 * u, ly + 1, 32 * u, { align: "center", base: "middle", color: S.look.onAccent, font: MONO });
            const pl = chip(c, S, label, box.x + 72 * u, ly, 46 * u, { base: "middle", edge: S.accent });
            say(c, reading(temps[i], t, i), box.x + box.w, ly + 8 * u, 32 * u, { align: "right", base: "middle", color: S.accent, font: MONO, weight: 600 });
            void pl;
          }
        }
        c.restore();
      });
    });
  }

  // ---- people: heat silhouettes with a few cold accessories ---------------------------------------------------
  function people(ctx, S, box, p, d, info) {
    const { u } = S, t = info.t, n = clamp(Math.round(d.count), 2, 6);
    const rowsN = S.tall && n > 2 ? 2 : 1, cols = Math.ceil(n / rowsN), hotI = Math.min(n - 1, d.highlight);
    const size = Math.min(box.h * 0.62 / (rowsN === 2 ? 1.9 : 1), (box.w / cols) * 1.25);
    const baseOf = (i) => (rowsN === 2 ? box.y + box.h * (0.46 + 0.5 * Math.floor(i / cols)) : box.y + box.h * 0.9);
    const geo = (i) => {
      const sz = size * (i === hotI ? 1.06 : 1), head = sz * 0.2, cx = box.x + (box.w / cols) * ((i % cols) + 0.5), base = baseOf(i), hy = base - sz + head, bw = sz * 0.56, top = base - sz + head * 2 + sz * 0.06;
      return { sz, head, cx, hy, bw, top, base };
    };
    const body = (g, G, v0, v1) => {
      const { cx, bw, top, sz, base } = G;
      g.beginPath(); g.moveTo(cx - bw / 2, base); g.lineTo(cx - bw / 2, top + bw * 0.35); g.quadraticCurveTo(cx - bw / 2, top, cx, top); g.quadraticCurveTo(cx + bw / 2, top, cx + bw / 2, top + bw * 0.35); g.lineTo(cx + bw / 2, base); g.closePath();
      const gr = g.createLinearGradient(0, top, 0, base); gr.addColorStop(0, tc(v0)); gr.addColorStop(1, tc(v1)); g.fillStyle = gr; g.fill();
      void sz;
    };
    run(ctx, S, info, p, (g) => {
      for (let i = 0; i < n; i++) {
        const q = stagger(p, i, n), G = geo(i), hot = i === hotI, { cx, hy, head, top, sz, base } = G, k = 0.45 + 0.55 * q;
        blob(g, cx, base - sz * 0.5, sz * 0.78, (hot ? 135 : 88) * k, 0.7);
        blob(g, cx, base, sz * 0.5, 100, 0.6);
        body(g, G, (hot ? 205 : 150) * k + 10 * Math.sin(t * 2 + i), 92 * k);
        g.fillStyle = tc(205 * k); g.fillRect(cx - head * 0.28, hy + head * 0.8, head * 0.56, head * 0.5);
        const hg = g.createRadialGradient(cx, hy, 0, cx, hy, head); hg.addColorStop(0, tc((hot ? 246 : 212) * k)); hg.addColorStop(1, tc((hot ? 214 : 172) * k));
        g.fillStyle = hg; g.beginPath(); g.arc(cx, hy, head, 0, 6.3); g.fill();
        const kind = i % 6, cool = (v, a = 0.95) => { g.fillStyle = tc(v, a); };
        if (kind === 0) { cool(38); g.fillRect(cx - head * 0.82, hy - head * 0.2, head * 0.7, head * 0.34); g.fillRect(cx + head * 0.12, hy - head * 0.2, head * 0.7, head * 0.34); g.fillRect(cx - head * 0.2, hy - head * 0.12, head * 0.4, head * 0.1); }
        else if (kind === 1) { cool(78); g.beginPath(); g.arc(cx, hy - head * 0.1, head * 1.04, Math.PI * 1.14, Math.PI * 1.86); g.closePath(); g.fill(); g.beginPath(); g.arc(cx, hy - head * 1.12, head * 0.2, 0, 6.3); g.fill(); }
        else if (kind === 2) { cool(112); g.beginPath(); g.arc(cx, hy, head * 1.04, Math.PI * 1.08, Math.PI * 1.92); g.closePath(); g.fill(); g.beginPath(); g.ellipse(cx + head * 1.1, hy + head * 0.5, head * 0.28, head * 0.8, -0.3, 0, 6.3); g.fill(); }
        else if (kind === 3) { cool(52); g.beginPath(); g.arc(cx - head * 1.02, hy, head * 0.26, 0, 6.3); g.arc(cx + head * 1.02, hy, head * 0.26, 0, 6.3); g.fill(); g.strokeStyle = tc(80); g.lineWidth = head * 0.14; g.beginPath(); g.arc(cx, hy, head * 1.05, Math.PI * 1.05, Math.PI * 1.95); g.stroke(); }
        else if (kind === 4) { cool(108); for (let c = 0; c < 9; c++) { const a = Math.PI * (1.05 + c * 0.113); g.beginPath(); g.arc(cx + Math.cos(a) * head * 0.98, hy + Math.sin(a) * head * 0.98, head * 0.3, 0, 6.3); g.fill(); } }
        else { cool(72); g.beginPath(); g.arc(cx, hy, head * 1.04, Math.PI * 1.12, Math.PI * 1.88); g.closePath(); g.fill(); g.fillRect(cx - head * 0.1, hy - head * 0.48, head * 1.4, head * 0.16); }
        for (let w = 0; w < 3; w++) {
          const ph = mod(t * 0.32 + w / 3 + i * 0.21, 1);
          blob(g, cx + Math.sin(t * 1.6 + w * 2 + i) * head * 0.45, hy - head * 1.3 - ph * head * 1.5, head * 0.42 * (1 - ph * 0.3), 170 * k, 0.5 * (1 - ph) * k);
        }
        void top;
      }
    }, (c) => {
      c.strokeStyle = inkA(S, 0.6); c.lineWidth = 3 * u;
      for (let r = 0; r < rowsN; r++) { const by = baseOf(r * cols); c.beginPath(); c.moveTo(box.x, by); c.lineTo(box.x + box.w * ease(p * 2), by); c.stroke(); }
      for (let i = 0; i < n; i++) {
        const q = stagger(p, i, n), G = geo(i), hot = i === hotI, { cx, hy, head, top, sz, bw, base } = G;
        c.save(); c.globalAlpha = clamp(q * 2.2);
        c.strokeStyle = inkA(S, hot ? 0.85 : 0.5); c.lineWidth = 2.6 * u;
        c.beginPath(); c.arc(cx, hy, head, 0, 6.3); c.stroke();
        c.beginPath(); c.moveTo(cx - bw / 2, base); c.lineTo(cx - bw / 2, top + bw * 0.35); c.quadraticCurveTo(cx - bw / 2, top, cx, top); c.quadraticCurveTo(cx + bw / 2, top, cx + bw / 2, top + bw * 0.35); c.lineTo(cx + bw / 2, base); c.stroke();
        if (i % 6 === 0) { c.beginPath(); c.arc(cx - head * 0.47, hy - head * 0.03, head * 0.35, 0, 6.3); c.arc(cx + head * 0.47, hy - head * 0.03, head * 0.35, 0, 6.3); c.stroke(); }
        const label = d.badges[i % d.badges.length];
        if (q > 0.7) {
          const raised = i % 2 && rowsN === 1 ? (S.tall ? 84 * u : 0) : 0;
          const py = base - sz - 34 * u - raised;
          if (label) chip(c, S, label, cx, py, 44 * u, { align: "center", base: "bottom", color: hot ? S.accent : S.look.ink, edge: hot ? S.accent : null });
          cross(c, S, cx, hy - head * 0.1, 18 * u, hexA(S.accent, hot ? 1 : 0.6));
          chip(c, S, reading(hot ? 37.8 : 36.2 + 0.2 * i, t, i), cx, base + 14 * u, 34 * u, { align: "center", font: MONO, color: hot ? S.accent : S.look.ink, weight: 600 });
        }
        if (hot && q > 0.9) brackets(c, cx - sz * 0.45, base - sz - 14 * u, sz * 0.9, sz + 14 * u, 26 * u, hexA(S.accent, 0.95), 3.5 * u);
        c.restore();
      }
    });
  }

  // ---- process: heat stations joined by pipes that carry pulses --------------------------------------------------
  function process(ctx, S, box, p, d, info) {
    const { u } = S, t = info.t, n = d.steps.length, vert = box.h > box.w;
    const slotW = box.w / n, slotH = box.h / n;
    const ch = vert ? slotH * 0.64 : Math.min(box.h * 0.62, slotW * 0.62), cw = vert ? Math.min(box.w * 0.46, ch * 1.15) : slotW * 0.62;
    const at = (i) => ({ x: vert ? box.x + 20 * u : box.x + slotW * (i + 0.5) - cw / 2, y: vert ? box.y + slotH * i + 6 * u : box.y + (box.h - ch) / 2 - 30 * u });
    const temp = (i) => 86 + (i / Math.max(1, n - 1)) * 120;
    const glyph = (g, kind, cx, cy, s, spin) => {
      g.beginPath();
      if (kind === 0) { g.moveTo(cx - s * 0.32, cy - s * 0.42); g.lineTo(cx + s * 0.12, cy - s * 0.42); g.lineTo(cx + s * 0.32, cy - s * 0.22); g.lineTo(cx + s * 0.32, cy + s * 0.42); g.lineTo(cx - s * 0.32, cy + s * 0.42); g.closePath(); g.moveTo(cx - s * 0.18, cy); g.lineTo(cx + s * 0.18, cy); g.moveTo(cx - s * 0.18, cy + s * 0.18); g.lineTo(cx + s * 0.1, cy + s * 0.18); }
      else if (kind === 1) { for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + spin; const r0 = k % 2 ? s * 0.12 : s * 0.1, r1 = k % 2 ? s * 0.28 : s * 0.46; g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); } }
      else if (kind === 2) { g.moveTo(cx - s * 0.44, cy); g.quadraticCurveTo(cx, cy - s * 0.42, cx + s * 0.44, cy); g.quadraticCurveTo(cx, cy + s * 0.42, cx - s * 0.44, cy); g.moveTo(cx + s * 0.13, cy); g.arc(cx, cy, s * 0.13, 0, 6.3); }
      else { g.moveTo(cx - s * 0.32, cy + s * 0.02); g.lineTo(cx - s * 0.08, cy + s * 0.26); g.lineTo(cx + s * 0.36, cy - s * 0.24); }
    };
    const kindOf = (i) => (i === n - 1 ? 3 : i % 3);
    run(ctx, S, info, p, (g) => {
      for (let i = 0; i < n; i++) {
        const { x, y } = at(i), q = stagger(p, i, n, 0.6), warm = 0.4 + 0.6 * q, v = temp(i) * warm;
        const cx = x + cw / 2, cy = y + ch / 2;
        if (i < n - 1) {
          const nx = at(i + 1), a = stagger(p, i + 0.6, n, 0.6);
          const x1 = vert ? cx : x + cw, y1 = vert ? y + ch : cy, x2 = vert ? nx.x + cw / 2 : nx.x, y2 = vert ? nx.y : nx.y + ch / 2;
          g.strokeStyle = tc(62 + 28 * a); g.lineWidth = 26 * u; g.lineCap = "butt"; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
          for (let k = 0; k < 3; k++) {
            const f = mod(t * 0.45 + k / 3 + i * 0.2, 1);
            blob(g, lerp(x1, x2, f), lerp(y1, y2, f), 40 * u, lerp(temp(i), temp(i + 1), f) + 30, 0.95 * a);
          }
        }
        blob(g, cx, cy, cw * 0.75, v * 0.8, 0.55);
        g.fillStyle = tc(v * 0.62); rr(g, x, y, cw, ch, 22 * u); g.fill();
        blob(g, cx, cy, cw * 0.46, v + 38 + 10 * Math.sin(t * 2.6 + i), 0.85);
        g.strokeStyle = tc(v + 45); g.lineWidth = 11 * u; rr(g, x + 5 * u, y + 5 * u, cw - 10 * u, ch - 10 * u, 20 * u); g.stroke();
        const s = Math.min(cw, ch) * 0.46;
        g.lineCap = "round"; g.lineJoin = "round";
        glyph(g, kindOf(i), cx, cy, s, t * 0.8); g.strokeStyle = tc(v + 70, 0.55); g.lineWidth = 34 * u; g.stroke();
        glyph(g, kindOf(i), cx, cy, s, t * 0.8); g.strokeStyle = tc(255); g.lineWidth = 14 * u; g.stroke();
      }
    }, (c) => {
      for (let i = 0; i < n; i++) {
        const { x, y } = at(i), q = stagger(p, i, n, 0.6), hot = i === n - 1, cx = x + cw / 2, cy = y + ch / 2;
        c.save(); c.globalAlpha = clamp(0.4 + q * 2);
        c.strokeStyle = inkA(S, 0.55); c.lineWidth = 3 * u; rr(c, x, y, cw, ch, 22 * u); c.stroke();
        c.strokeStyle = inkA(S, 0.8); c.lineWidth = 3 * u; c.lineCap = "round"; c.lineJoin = "round";
        c.beginPath(); glyph(c, kindOf(i), cx, cy, Math.min(cw, ch) * 0.46, t * 0.8); c.stroke();
        chip(c, S, String(i + 1).padStart(2, "0"), x + 14 * u, y - 10 * u, 34 * u, { base: "bottom", font: MONO, color: S.accent, pad: 0.35 });
        chip(c, S, reading(temp(i) * 0.4 + 12, t, i), x + cw - 14 * u, y - 10 * u, 28 * u, { align: "right", base: "bottom", font: MONO, color: hot ? S.accent : S.look.ink, pad: 0.35, weight: 600 });
        if (q > 0.6) { if (vert) chip(c, S, d.steps[i], x + cw + 36 * u, cy, 46 * u, { base: "middle", color: hot ? S.accent : S.look.ink, edge: hot ? S.accent : null }); else chip(c, S, d.steps[i], cx, y + ch + 20 * u, 44 * u, { align: "center", color: hot ? S.accent : S.look.ink, edge: hot ? S.accent : null }); }
        c.restore();
        if (i < n - 1) {
          const nx = at(i + 1), a = stagger(p, i + 0.6, n, 0.6);
          if (a <= 0.2) continue;
          const x1 = vert ? cx : x + cw, y1 = vert ? y + ch : cy, x2 = vert ? nx.x + cw / 2 : nx.x, y2 = vert ? nx.y : nx.y + ch / 2, ang = Math.atan2(y2 - y1, x2 - x1);
          c.save(); c.strokeStyle = hexA(S.accent, 0.9); c.lineWidth = 3.5 * u; c.lineCap = "round";
          const L = Math.hypot(x2 - x1, y2 - y1);
          for (let k = 0; k < 4; k++) {
            const f = mod(t * 0.35 + k / 4, 1) * 0.84 + 0.08, px = lerp(x1, x2, f), py = lerp(y1, y2, f);
            c.beginPath(); c.moveTo(px - Math.cos(ang - 0.6) * 14 * u, py - Math.sin(ang - 0.6) * 14 * u); c.lineTo(px, py); c.lineTo(px - Math.cos(ang + 0.6) * 14 * u, py - Math.sin(ang + 0.6) * 14 * u); c.stroke();
          }
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - (vert ? 0 : 0);
          c.strokeStyle = inkA(S, 0.8); c.lineWidth = 3 * u; c.beginPath(); c.arc(mx, my, 20 * u, 0, 6.3); c.stroke();
          for (let k = 0; k < 3; k++) { const a2 = t * 1.2 + k * 2.094; c.beginPath(); c.moveTo(mx, my); c.lineTo(mx + Math.cos(a2) * 20 * u, my + Math.sin(a2) * 20 * u); c.stroke(); }
          void L; c.restore();
        }
      }
    });
  }

  // ---- compare: a scattered heat field against one clean core --------------------------------------------------------
  function compare(ctx, S, box, p, d, info) {
    const { u } = S, t = info.t, vert = box.h > box.w * 1.1, gap = 40 * u;
    const cw = vert ? box.w : (box.w - gap) / 2, ch = vert ? (box.h - gap) / 2 : box.h * 0.82;
    const pos = (i) => ({ x: vert ? box.x : box.x + i * (cw + gap), y: vert ? box.y + i * (ch + gap) : box.y + (box.h - ch) / 2 });
    const vals = [d.leftValue, d.rightValue], maxV = Math.max(d.leftValue, d.rightValue, 1);
    run(ctx, S, info, p, (g) => {
      for (let i = 0; i < 2; i++) {
        const { x, y } = pos(i), q = stagger(p, i, 2, 0.4), warm = 0.35 + 0.65 * q;
        g.save(); rr(g, x, y, cw, ch, 8 * u); g.clip();
        g.fillStyle = tc(34, 0.95); g.fillRect(x, y, cw, ch);
        const fx = x + cw * 0.5, fy = y + ch * 0.44;
        if (i === 0) {
          for (let k = 0; k < 11; k++) {
            const bx = x + cw * (0.1 + 0.8 * hash(k, 1)) + Math.sin(t * (0.6 + hash(k, 2)) + k * 3) * cw * 0.06;
            const by = y + ch * (0.2 + 0.5 * hash(k, 3)) + Math.cos(t * (0.5 + hash(k, 4)) + k * 2) * ch * 0.05;
            blob(g, bx, by, (50 + 60 * hash(k, 5)) * u, (95 + 70 * hash(k, 6) + 25 * Math.sin(t * 3 + k)) * warm, 0.8);
          }
        } else {
          blob(g, fx, fy, ch * 0.5, 190 * warm, 0.8);
          blob(g, fx, fy, ch * 0.24, 255 * warm, 1);
          for (let j = 0; j < 3; j++) { const ph = mod(t * 0.3 + j / 3, 1); g.strokeStyle = tc(190, (1 - ph) * warm); g.lineWidth = 12 * u; g.beginPath(); g.arc(fx, fy, ch * 0.16 + ph * ch * 0.4, 0, 6.3); g.stroke(); }
        }
        g.restore();
      }
    }, (c) => {
      for (let i = 0; i < 2; i++) {
        const { x, y } = pos(i), q = stagger(p, i, 2, 0.4), color = i ? S.accent : S.look.ink;
        c.save(); c.globalAlpha = clamp(0.3 + q * 2.5);
        brackets(c, x, y, cw, ch, 34 * u, hexA(color, 0.9), 4 * u);
        chip(c, S, [d.left, d.right][i], x + 24 * u, y + 28 * u, 44 * u, { edge: i ? S.accent : null, color });
        const fx = x + cw * 0.5, fy = y + ch * 0.44;
        if (i) cross(c, S, fx, fy, 30 * u, hexA(S.accent, 0.95), 3); else for (let k = 0; k < 3; k++) cross(c, S, x + cw * (0.25 + 0.25 * k) + Math.sin(t + k) * 20 * u, y + ch * (0.3 + 0.12 * ((k + 1) % 3)), 16 * u, inkA(S, 0.55), 2);
        const numY = y + ch - 92 * u;
        chip(c, S, M().formatNumber(vals[i] * q, 0, d.prefix, d.suffix), x + 24 * u, numY, Math.min(150 * u, ch * 0.34), { base: "bottom", font: MONO, color, pad: 0.24 });
        const mx = x + 24 * u, my = y + ch - 62 * u, mw = cw - 48 * u, mh = 22 * u;
        c.fillStyle = inkA(S, 0.15); c.fillRect(mx, my, mw, mh);
        const fw = mw * clamp(vals[i] / maxV) * q, lut = lutOf(S.look.tone).rgb, gr = c.createLinearGradient(mx, 0, mx + mw, 0);
        for (let s = 0; s <= 6; s++) { const col = lut[Math.round(40 + 215 * s / 6)]; gr.addColorStop(s / 6, `rgb(${col[0]},${col[1]},${col[2]})`); }
        c.fillStyle = gr; c.fillRect(mx, my, fw, mh);
        c.strokeStyle = inkA(S, 0.8); c.lineWidth = 2 * u; c.strokeRect(mx, my, mw, mh);
        c.restore();
      }
    });
  }
  const M = () => window.DreamcutMotion;

  // ---- the look --------------------------------------------------------------------------------------------------------
  const halo = () => "0 0 16px rgba(0,0,0,0.65), 0 1px 2px rgba(0,0,0,0.6)";
  const ctl = () => (window.__dreamcut && window.__dreamcut.controls) || {};
  return {
    bg: "#0a0418", panel: "rgba(14,4,34,0.76)", ink: "#fff4e4", muted: "#e0c4d8", accent: "#ffc247", onAccent: "#1a0630",
    rule: "rgba(255,244,228,0.7)", track: "rgba(255,244,228,0.14)",
    display: SANS, displayWeight: 800, displayCase: "none", displayTracking: "-0.01em",
    body: SANS, bodyWeight: 600, figures: MONO, radius: 6, motion: "wipe", change: "scan",
    kit: { line: 3, fill: "solid", panel: "fill" },
    tone: TONE, keepArt: true, overlap: true, paintOver: true,
    palettes: {
      // Pale: heat printed dark on pale stock. Night: a deeper, higher-contrast ironbow. Whitehot: greyscale sensor.
      light: { bg: "#efe8f5", panel: "rgba(255,252,255,0.82)", ink: "#2a0f3a", muted: "#6a4a82", accent: "#c1121f", onAccent: "#fff4f4", rule: "rgba(42,15,58,0.7)", track: "rgba(42,15,58,0.12)",
        tone: { key: "pale", stops: [[0, "#f6f1fa"], [0.2, "#ddcdf0"], [0.4, "#b987d3"], [0.58, "#e0508a"], [0.74, "#f0793a"], [0.88, "#b3201c"], [1, "#4a0a14"]], gamma: 1, plate: "rgba(255,251,255,0.82)", speck: "60,20,80", vig: "rgba(70,30,100,0.22)", noise: 0.05 },
        textShadow: () => "0 0 14px rgba(255,255,255,0.8)", backdrop: () => "#efe8f5" },
      dark: { bg: "#02000a", panel: "rgba(6,1,18,0.82)", tone: { ...TONE, key: "iron-night", gamma: 1.4, plate: "rgba(6,1,18,0.84)", vig: "rgba(0,0,0,0.7)" }, backdrop: () => "#02000a" },
      mono: { bg: "#050505", panel: "rgba(0,0,0,0.78)", ink: "#f4f4f4", muted: "#b0b0b0", accent: "#ffffff", onAccent: "#000000", rule: "rgba(244,244,244,0.7)", track: "rgba(244,244,244,0.14)",
        tone: { key: "whitehot", stops: [[0, "#000000"], [1, "#ffffff"]], gamma: 1.1, plate: "rgba(0,0,0,0.78)", speck: "255,255,255", vig: "rgba(0,0,0,0.6)", noise: 0.08 }, backdrop: () => "#050505" },
    },
    // Headlines and statements sit on translucent camera-overlay plates with an accent edge.
    css: (accent, look) => `
      .display { display: inline-block; align-self: flex-start; padding: 0.1em 0.4em 0.14em 0.4em; background: ${look.tone.plate}; border-left: 0.11em solid ${accent}; border-radius: 4px; }
      .statement { align-items: center; text-align: center; }
      .statement .display { align-self: center; border-left: none; border-top: 0.07em solid ${accent}; border-bottom: 0.07em solid ${accent}; border-radius: 0; }
      .kicker { display: inline-block; padding: 0.3em 0.8em; background: ${look.tone.plate}; border-radius: 4px; font-family: ${MONO}; font-weight: 700; letter-spacing: 0.1em; align-self: center; }`,
    textShadow: halo,
    backdrop: () => "#0a0418",
    paint(ctx, W, H, t, accent, look) {
      ctx.clearRect(0, 0, W, H);
      const u = Math.min(W, H) / 1080, fr = Math.floor(t * 15), r = rng(fr * 7919 + 13), tone = look.tone || TONE;
      ctx.fillStyle = `rgba(0,0,0,${tone.key === "pale" ? 0.06 : 0.12})`;
      for (let y = 0; y < H; y += 4 * u) ctx.fillRect(0, y, W, 1.4 * u);
      for (let i = 0; i < 280; i++) { ctx.fillStyle = `rgba(${tone.speck},${0.05 + 0.12 * r()})`; const s = u * (1 + r() * 2); ctx.fillRect(r() * W, r() * H, s, s); }
      const ph = mod(t, 2.6);
      if (ph < 0.22) { const y = hash(Math.floor(t / 2.6), 5) * H; ctx.fillStyle = `rgba(${tone.speck},0.08)`; ctx.fillRect(0, y, W, 3 * u); ctx.fillRect(12 * u, y + 7 * u, W, 1.5 * u); }
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
      vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, tone.vig); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    },
    stage(ctx, S, info) {
      const t = info.t, g = begin(S), cc = ctl(), titleHold = cc.title_hold ?? 2.4;
      if (S.paint) world(g, S, info);
      let tk = 0;
      if (info.scene === "title") tk = ease(info.local / 0.9);
      else if (info.index === 1 && titleHold > 0 && info.local < info.change) tk = 1 - clamp(info.local / info.change);
      const fr = tk > 0 || info.scene === "title" ? stripFrames(S, info, info.scene === "title" ? tk : 1) : null;
      if (info.scene === "title" || tk > 0) {
        const k = info.scene === "title" ? tk : tk;
        stripHeat(g, S, fr, k);
        blob(g, S.W / 2, S.H / 2, S.H * 0.55, 70, 0.5 * (0.4 + 0.6 * k));
      }
      if (info.scene === "closing") closingHeat(g, S, info);
      ctx.save();
      flush(ctx, S, { t, alpha: info.scene === "title" || !tk ? 1 : 1 });
      if (fr && (info.scene === "title" || tk > 0)) {
        const k = info.scene === "title" ? tk : tk;
        ctx.globalAlpha = 0.4 + 0.6 * k;
        stripCrisp(ctx, S, fr, k);
        const u = S.u;
        ctx.setLineDash([22 * u, 18 * u]); ctx.lineDashOffset = -t * 30 * u; ctx.strokeStyle = hexA(S.look.ink, 0.28); ctx.lineWidth = 3 * u;
        ctx.beginPath(); ctx.arc(S.W / 2, S.H / 2, S.H * (S.tall ? 0.2 : 0.3), 0, 6.3); ctx.stroke();
        ctx.lineDashOffset = t * 24 * u; ctx.strokeStyle = hexA(S.accent, 0.3); ctx.beginPath(); ctx.arc(S.W / 2, S.H / 2, S.H * (S.tall ? 0.25 : 0.36), 0, 6.3); ctx.stroke();
        ctx.setLineDash([]);
        for (const f of fr) if (f.cx > 0 && f.cx < S.W && Math.abs(f.cx - f.xs) < S.u * 4 + 3) { ctx.strokeStyle = hexA(S.accent, 0.9); ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.moveTo(f.xs, f.cy - f.fh * 0.9); ctx.lineTo(f.xs, f.cy + f.fh * 0.9); ctx.stroke(); }
      }
      ctx.globalAlpha = 1;
      if (info.scene === "closing") { closingCrisp(ctx, S, info); band(ctx, S, info.local, info.change, t); }
      if (info.scene === "title") band(ctx, S, info.local, info.change * 0.6, t);
      hud(ctx, S, info);
      ctx.restore();
    },
    scenes: { chart, object, people, process, compare },
  };
});
