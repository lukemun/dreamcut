// Deco: black lacquer and gold foil. Every scene is a set built from stepped forms, fans and
// sunbursts: setback towers for bars, an arched radio console for the object, figures in sunburst
// niches, sunburst medallions joined by chevron rails, and dial gauges ringed with marquee bulbs.
// Scenes change through a fan shutter: radial wedges open alternately from the hub and from the rim.
// All drawings are original. Frames are pure functions of time; texture uses seeded generators only.
window.DreamcutMotion.register("deco", ({ rng }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const inout = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const fract = (v) => v - Math.floor(v);
  const hash = (n) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);
  const FACE = "'Futura', 'Jost', 'Avenir Next', 'Century Gothic', 'Trebuchet MS', sans-serif";
  const ROMAN = ["I", "II", "III", "IV", "V", "VI"];
  const HEADS = { title: ["kicker", "title"], chart: ["chart-title"], object: ["object-title"], people: ["people-title"], process: ["process-title"], compare: ["compare-title"], closing: ["closing"] };

  const TONE = {
    lac: "#0a0c0d", lac2: "#121b1a", jade: "#1b6657", jadeD: "#0d2a26", plate: "10,13,13", text: "#f6ebc6", sub: "#cfb878",
    gold: ["#6f4f17", "#c99a3c", "#fff0b8"], rays: "232,188,92", glow: "255,226,150", vign: 0.6, ink: "246,235,198",
  };
  const num = (v, dec, pre, suf) => window.DreamcutMotion.formatNumber(v, dec, pre, suf);

  // ---- drawing helpers -----------------------------------------------------------------------------
  function mk(g, S, info) {
    const { W, H, u, tall } = S;
    const side = (tall ? 90 : 140) * u;
    const box = tall ? { x: side, y: H * 0.3, w: W - side * 2, h: H * 0.6 } : { x: side, y: H * 0.34, w: W - side * 2, h: H * 0.58 };
    return { g, S, W, H, u, tall, T: S.look.tone, t: info.t, info, box, tex: S.look.texture ?? 1, acc: S.accent };
  }
  // Foil: gold with a bright glint travelling across the shape, offset per element.
  function foil(F, x, y, w, h, ph = 0) {
    const T = F.T, s = fract(F.t * 0.24 + ph) * 1.9 - 0.45;
    w = Math.max(1, w); h = Math.max(1, h);
    const gr = F.g.createLinearGradient(x, y, x + w, y + h * 0.7 + w * 0.3);
    const st = (o, c) => gr.addColorStop(clamp(o), c);
    st(0, T.gold[0]); st(s - 0.32, T.gold[1]); st(s, T.gold[2]); st(s + 0.32, T.gold[1]); st(1, T.gold[0]);
    return gr;
  }
  const pen = (g, style, w) => { g.strokeStyle = style; g.lineWidth = w; g.lineCap = "round"; g.lineJoin = "round"; g.setLineDash([]); };
  function poly(g, pts, close = true) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); if (close) g.closePath(); }
  // A rectangle with each corner cut in two steps.
  function stepPts(x, y, w, h, c) {
    const rel = [[-2 * c, 0], [-2 * c, c / 2], [-c, c / 2], [-c, c], [0, c]];
    const corner = (ox, oy, sx, sy, rev) => { const p = rel.map(([a, b]) => [ox + sx * a, oy + sy * b]); return rev ? p.reverse() : p; };
    return [...corner(x, y, -1, 1, true), ...corner(x + w, y, 1, 1, false), ...corner(x + w, y + h, 1, -1, true), ...corner(x, y + h, -1, -1, false)];
  }
  const stepPath = (g, x, y, w, h, c) => poly(g, stepPts(x, y, w, h, c));
  function star4(g, x, y, r) {
    g.beginPath();
    g.moveTo(x, y - r); g.quadraticCurveTo(x, y, x + r, y); g.quadraticCurveTo(x, y, x, y + r);
    g.quadraticCurveTo(x, y, x - r, y); g.quadraticCurveTo(x, y, x, y - r); g.closePath();
  }
  function diamond(g, x, y, r, ry = r) { poly(g, [[x, y - ry], [x + r, y], [x, y + ry], [x - r, y]]); }
  function say(g, F, s, x, y, size, o = {}) {
    s = String(s ?? "");
    if (o.upper !== false) s = s.toUpperCase();
    if (!s) return 0;
    const track = (o.track ?? 0.08) * size;
    const weight = o.weight || 500;
    g.font = `${weight} ${size}px ${FACE}`;
    g.letterSpacing = track + "px";
    let w = g.measureText(s).width;
    if (o.maxW && w > o.maxW) {
      size = Math.max(o.min || size * 0.8, (size * o.maxW) / w);
      g.font = `${weight} ${size}px ${FACE}`; g.letterSpacing = (o.track ?? 0.08) * size + "px";
      w = g.measureText(s).width;
    }
    const x0 = o.align === "center" ? x - w / 2 + track / 2 : o.align === "right" ? x - w : x;
    g.textAlign = "left"; g.textBaseline = o.base || "alphabetic";
    g.fillStyle = o.color || F.T.text;
    if (o.glow) { g.save(); g.shadowColor = o.glow; g.shadowBlur = 22 * F.u; g.fillText(s, x0, y); g.restore(); }
    g.fillText(s, x0, y);
    g.letterSpacing = "0px";
    return w;
  }
  function textW(g, s, size, weight = 500, track = 0.08) {
    g.font = `${weight} ${size}px ${FACE}`; g.letterSpacing = track * size + "px";
    const w = g.measureText(String(s).toUpperCase()).width; g.letterSpacing = "0px"; return w;
  }
  // A dark stepped plate with double gold rule.
  function plate(g, F, x, y, w, h, o = {}) {
    const c = o.c ?? Math.min(h * 0.22, 16 * F.u);
    g.save();
    stepPath(g, x, y, w, h, c);
    g.fillStyle = `rgba(${F.T.plate},${o.alpha ?? 0.88})`; g.fill();
    pen(g, o.stroke || foil(F, x, y, w, h, o.ph || 0), o.lw ?? 2.4 * F.u); g.stroke();
    if (!o.thin) { stepPath(g, x + 8 * F.u, y + 8 * F.u, w - 16 * F.u, h - 16 * F.u, c * 0.7); pen(g, o.stroke || foil(F, x, y, w, h, (o.ph || 0) + 0.3), 1.1 * F.u); g.globalAlpha = 0.75; g.stroke(); }
    g.restore();
  }
  function rays(g, cx, cy, r0, r1, a0, a1, n, duty = 0.5) {
    const step = (a1 - a0) / n;
    for (let i = 0; i < n; i++) {
      const s = a0 + i * step, e = s + step * duty;
      g.beginPath(); g.moveTo(cx + Math.cos(s) * r0, cy + Math.sin(s) * r0); g.lineTo(cx + Math.cos(s) * r1, cy + Math.sin(s) * r1);
      g.lineTo(cx + Math.cos(e) * r1, cy + Math.sin(e) * r1); g.lineTo(cx + Math.cos(e) * r0, cy + Math.sin(e) * r0); g.closePath(); g.fill();
    }
  }
  // A rosette: a ring of spikes, a ring of petals and a hub that turn at their own rates.
  function rosette(g, F, cx, cy, R, rot, o = {}) {
    const n = o.n || 16, hot = o.hot;
    g.save();
    g.fillStyle = foil(F, cx - R, cy - R, R * 2, R * 2, o.ph || 0);
    rays(g, cx, cy, R * 0.72, R, rot, rot + TAU, n * 2, 0.5);
    g.beginPath(); g.arc(cx, cy, R * 0.66, 0, TAU); g.fillStyle = `rgba(${F.T.plate},0.92)`; g.fill();
    pen(g, foil(F, cx - R, cy - R, R * 2, R * 2, (o.ph || 0) + 0.2), Math.max(1.4, R * 0.04)); g.stroke();
    g.beginPath(); g.arc(cx, cy, R * 0.6, 0, TAU); pen(g, foil(F, cx - R, cy - R, R * 2, R * 2, (o.ph || 0) + 0.4), Math.max(1, R * 0.018)); g.stroke();
    g.fillStyle = hot ? F.acc : foil(F, cx - R, cy - R, R * 2, R * 2, (o.ph || 0) + 0.1);
    g.globalAlpha = 0.95;
    rays(g, cx, cy, R * 0.12, R * 0.56, -rot * 1.4, -rot * 1.4 + TAU, n, 0.55);
    g.beginPath(); g.arc(cx, cy, R * 0.13, 0, TAU); g.fillStyle = `rgba(${F.T.plate},1)`; g.fill();
    g.beginPath(); g.arc(cx, cy, R * 0.07, 0, TAU); g.fillStyle = foil(F, cx - R, cy - R, R * 2, R * 2, 0.5); g.fill();
    g.restore();
  }

  // ---- the world under every scene -----------------------------------------------------------------
  function pivotOf(F, id) {
    const { W, H, box } = F;
    switch (id) {
      case "chart": return [W / 2, box.y + box.h - 96 * F.u];
      case "object": return [box.x + box.w * (F.tall ? 0.5 : 0.3), box.y + box.h * 0.45];
      case "people": return [W / 2, box.y + box.h * 0.9];
      case "process": return [W / 2, box.y + box.h * 0.5];
      case "compare": return [W / 2, box.y + box.h * 0.55];
      case "closing": return [W / 2, H * 0.5];
      default: return [W / 2, H * 1.02];
    }
  }
  function backdrop(g, F, id) {
    const { W, H, T, t, u } = F, solid = Boolean(F.S.paint);
    const [px, py] = pivotOf(F, id);
    if (solid) {
      g.fillStyle = T.lac; g.fillRect(0, 0, W, H);
      const gl = g.createRadialGradient(px, py, 0, px, py, Math.hypot(W, H) * 0.7);
      gl.addColorStop(0, `rgba(${T.rays},0.20)`); gl.addColorStop(0.5, `rgba(${T.rays},0.05)`); gl.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gl; g.fillRect(0, 0, W, H);
    }
    const R = Math.hypot(Math.max(px, W - px), Math.max(py, H - py)) * 1.05;
    const n = F.tall ? 28 : 40;
    const rot = t * 0.035 + (id === "closing" ? t * 0.02 : 0);
    g.save();
    const gr = g.createRadialGradient(px, py, R * 0.03, px, py, R);
    const a = solid ? 1 : 0.5;
    gr.addColorStop(0, `rgba(${T.rays},${0.34 * a})`); gr.addColorStop(1, `rgba(${T.rays},${0.04 * a})`);
    g.fillStyle = gr;
    for (let i = 0; i < n; i++) {
      const a0 = rot + (i * TAU) / n, pulse = Math.max(0, Math.sin(t * 1.5 - i * 0.55));
      g.globalAlpha = 0.5 + 0.5 * Math.pow(pulse, 3);
      rays(g, px, py, 0, R, a0, a0 + TAU / n, 1, 0.52);
    }
    g.globalAlpha = 1;
    // Concentric rings with a running dash.
    for (let k = 1; k <= 5; k++) {
      const r = Math.min(W, H) * 0.19 * k;
      g.beginPath(); g.arc(px, py, r, Math.PI, TAU); g.beginPath(); g.arc(px, py, r, 0, TAU);
      pen(g, `rgba(${T.rays},${0.16 - k * 0.018})`, 1.6 * u); g.setLineDash([22 * u, 18 * u]); g.lineDashOffset = -t * (14 + k * 6) * (k % 2 ? 1 : -1); g.stroke();
    }
    g.setLineDash([]);
    g.restore();
    // Lacquer sheen: a broad soft diagonal glint drifting slowly.
    if (solid && F.tex > 0) {
      const s = fract(t * 0.045) * 2.6 - 0.8;
      const sh = g.createLinearGradient(W * (s - 0.3), 0, W * (s + 0.1), H);
      sh.addColorStop(0, "rgba(255,255,255,0)"); sh.addColorStop(0.5, `rgba(${T.glow},${0.07 * F.tex})`); sh.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = sh; g.fillRect(0, 0, W, H);
    }
  }
  function scallops(g, F, x, y, w, h, speed, dir) {
    const u = F.u, r = 20 * u, row = r * 0.5;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    const off = (F.t * speed * dir) % r;
    pen(g, foil(F, x, y, w, h, 0.1), 1.3 * u); g.globalAlpha = 0.55;
    for (let j = -3; j * row < h + r * 3; j++) {
      const cy = y + j * row + off + (off < 0 ? r : 0);
      for (let i = -1; i * r * 2 < w + r * 2; i++) {
        const cx = x + i * r * 2 + (((j % 2) + 2) % 2 ? r : 0);
        g.beginPath(); g.arc(cx, cy, r, 0, Math.PI); g.stroke();
        g.beginPath(); g.arc(cx, cy, r * 0.55, 0, Math.PI); g.stroke();
      }
    }
    g.restore();
  }
  function chrome(g, F) {
    const { W, H, u, t, T } = F, m = 30 * u;
    // Scale pattern in the margins.
    const sw = (F.tall ? 50 : 84) * u;
    scallops(g, F, m + 14 * u, m + 70 * u, sw - 14 * u, H - 2 * m - 140 * u, 16 * u, 1);
    scallops(g, F, W - m - sw, m + 70 * u, sw - 14 * u, H - 2 * m - 140 * u, 16 * u, -1);
    // Stepped border.
    g.save();
    pen(g, foil(F, 0, 0, W, H, 0.0), 2.6 * u);
    stepPath(g, m, m, W - 2 * m, H - 2 * m, 20 * u); g.stroke();
    pen(g, foil(F, 0, 0, W, H, 0.5), 1.3 * u); g.globalAlpha = 0.8;
    stepPath(g, m + 14 * u, m + 14 * u, W - 2 * m - 28 * u, H - 2 * m - 28 * u, 14 * u); g.stroke();
    g.globalAlpha = 1;
    // Corner fans.
    const corners = [[m, m, 1, 1], [W - m, m, -1, 1], [W - m, H - m, -1, -1], [m, H - m, 1, -1]];
    corners.forEach(([cx, cy, sx, sy], ci) => {
      g.save(); g.beginPath(); g.rect(Math.min(cx, cx + sx * 80 * u), Math.min(cy, cy + sy * 80 * u), 80 * u, 80 * u); g.clip();
      for (let k = 1; k <= 4; k++) { g.beginPath(); g.arc(cx, cy, k * 15 * u, 0, TAU); pen(g, foil(F, cx - 70 * u, cy - 70 * u, 140 * u, 140 * u, ci * 0.2), 1.2 * u); g.stroke(); }
      g.fillStyle = foil(F, cx - 70 * u, cy - 70 * u, 140 * u, 140 * u, ci * 0.2 + 0.1);
      for (let k = 0; k < 7; k++) {
        const a = (k + 0.5) * (Math.PI / 2) / 7 + (sx < 0 ? (sy > 0 ? Math.PI / 2 : Math.PI) : sy > 0 ? 0 : -Math.PI / 2);
        const glint = 0.5 + 0.5 * Math.sin(t * 2.4 - k * 0.9 + ci * 1.3);
        g.globalAlpha = 0.45 + 0.55 * glint;
        rays(g, cx, cy, 16 * u, 66 * u, a - 0.07, a + 0.07, 1, 1);
      }
      g.restore();
    });
    // Marquee bulbs chase along the inner rule.
    const ix = m + 14 * u, iy = m + 14 * u, iw = W - 2 * ix, ih = H - 2 * iy, perim = 2 * (iw + ih), gap = 46 * u;
    const nb = Math.floor(perim / gap);
    for (let i = 0; i < nb; i++) {
      let d = (i / nb) * perim, x, y;
      if (d < iw) { x = ix + d; y = iy; } else if ((d -= iw) < ih) { x = ix + iw; y = iy + d; } else if ((d -= ih) < iw) { x = ix + iw - d; y = iy + ih; } else { d -= iw; x = ix; y = iy + ih - d; }
      if ((x < ix + 90 * u || x > ix + iw - 90 * u) && (y < iy + 90 * u || y > iy + ih - 90 * u)) continue;
      const on = Math.pow(0.5 + 0.5 * Math.sin(i * 0.45 - t * 4.2), 2);
      g.beginPath(); g.arc(x, y, (2.2 + on * 1.8) * u, 0, TAU); g.fillStyle = `rgba(${T.glow},${0.25 + 0.75 * on})`; g.fill();
    }
    // Mid-edge diamonds.
    for (const [x, y] of [[W / 2, m], [W / 2, H - m], [m, H / 2], [W - m, H / 2]]) {
      diamond(g, x, y, 13 * u, 17 * u); g.fillStyle = `rgba(${T.plate},1)`; g.fill(); pen(g, foil(F, x - 13 * u, y - 17 * u, 26 * u, 34 * u), 2 * u); g.stroke();
      diamond(g, x, y, 5 * u, 7 * u); g.fillStyle = `rgba(${T.glow},${0.6 + 0.4 * Math.sin(t * 3)})`; g.fill();
    }
    g.restore();
    // Rising gold motes.
    for (let i = 0; i < 34; i++) {
      const sp = 14 + hash(i + 40) * 26;
      const x = hash(i + 1) * (W - 2 * m - 100 * u) + m + 50 * u + Math.sin(t * 0.6 + i) * 14 * u;
      const y = H - ((hash(i + 9) * H + t * sp * u) % (H + 40 * u)) + 20 * u;
      const tw = 0.5 + 0.5 * Math.sin(t * 3.1 + i * 2.3);
      g.globalAlpha = 0.15 + 0.6 * tw;
      star4(g, x, y, (4 + hash(i + 22) * 8) * u * (0.6 + tw * 0.6)); g.fillStyle = `rgb(${T.glow})`; g.fill();
    }
    g.globalAlpha = 1;
  }

  // ---- the stepped tower, used in the title, the chart and the closing -------------------------------
  function tower(g, F, o) {
    const { u, T, t } = F;
    const { cx, base, w, h, tiers = 4, k = 1, hot = false, seed = 1, beam = true } = o;
    const fr = [0.4, 0.27, 0.19, 0.14].slice(0, tiers); const sum = fr.reduce((a, b) => a + b, 0);
    const wid = [1, 0.76, 0.54, 0.34];
    let y = base;
    const H_ = h * k;
    for (let j = 0; j < tiers; j++) {
      const th = (fr[j] / sum) * H_, tw = w * wid[j], x = cx - tw / 2, c = Math.min(8 * u, tw * 0.1);
      const top = y - th;
      poly(g, [[x, y], [x, top + c], [x + c, top], [x + tw - c, top], [x + tw, top + c], [x + tw, y]]);
      if (hot) { g.fillStyle = foil(F, x, top, tw, th, seed * 0.13 + j * 0.07); g.fill(); }
      else { const gr = g.createLinearGradient(0, top, 0, y); gr.addColorStop(0, T.jade); gr.addColorStop(1, T.jadeD); g.fillStyle = gr; g.fill(); }
      // Flutes.
      g.save(); g.clip();
      const nf = Math.max(3, Math.round(tw / (16 * u)));
      pen(g, hot ? "rgba(10,12,12,0.55)" : foil(F, x, top, tw, th, 0.2 + j * 0.1), 1.2 * u); g.globalAlpha = hot ? 0.8 : 0.5;
      g.beginPath(); for (let f = 1; f < nf; f++) { const fx = x + (tw * f) / nf; g.moveTo(fx, top); g.lineTo(fx, y); } g.stroke();
      g.globalAlpha = 1;
      // Windows, lit and dimmed as the evening goes on.
      if (th > 28 * u && !hot) {
        const cols = Math.max(2, Math.floor(tw / (30 * u))), rows = Math.max(1, Math.floor((th - 18 * u) / (34 * u)));
        const ww = Math.min(14 * u, (tw / cols) * 0.42), wh = 18 * u;
        for (let r = 0; r < rows; r++) for (let c2 = 0; c2 < cols; c2++) {
          const hh = hash(seed * 31 + j * 7 + r * 3 + c2 * 11), lit = Math.sin(t * (0.7 + hh) + hh * 40) + 0.5 > hh * 1.7 ? 1 : 0.12;
          g.fillStyle = `rgba(${T.glow},${0.82 * lit})`;
          g.fillRect(x + (tw / cols) * (c2 + 0.5) - ww / 2, top + 12 * u + r * ((th - 18 * u) / rows), ww, wh);
        }
      }
      g.restore();
      poly(g, [[x, y], [x, top + c], [x + c, top], [x + tw - c, top], [x + tw, top + c], [x + tw, y]], false);
      pen(g, foil(F, x, top, tw, th, seed * 0.11 + j * 0.2), 2.2 * u); g.stroke();
      // Cornice.
      g.fillStyle = foil(F, x - 5 * u, top - 3 * u, tw + 10 * u, 7 * u, j * 0.15); g.fillRect(x - 5 * u, top - 3 * u, tw + 10 * u, 6 * u);
      y = top;
    }
    // Spire, rings and a beacon whose beam sweeps.
    const sh = Math.min(w * 0.9, h * 0.38) * (hot ? 1.25 : 0.8) * clamp(k * 1.3 - 0.3);
    if (sh > 4) {
      const sw = w * wid[tiers - 1] * 0.09;
      poly(g, [[cx - sw * 2.4, y], [cx - sw * 0.5, y - sh], [cx + sw * 0.5, y - sh], [cx + sw * 2.4, y]]);
      g.fillStyle = foil(F, cx - 10 * u, y - sh, 20 * u, sh, seed * 0.2); g.fill();
      for (let r = 1; r <= 3; r++) { const ry = y - (sh * r) / 4.2, rw = sw * (3.2 - r * 0.6); g.fillRect(cx - rw, ry, rw * 2, 3 * u); }
      const bx = cx, by = y - sh - 6 * u, pulse = 0.55 + 0.45 * Math.sin(t * 4 + seed);
      if (beam) {
        const swing = Math.sin(t * 0.9 + seed * 1.7) * 0.75, L = Math.min(F.W, F.H) * (hot ? 0.9 : 0.6);
        const a = -Math.PI / 2 + swing, bg = g.createRadialGradient(bx, by, 0, bx, by, L);
        bg.addColorStop(0, `rgba(${T.glow},${hot ? 0.5 : 0.32})`); bg.addColorStop(1, `rgba(${T.glow},0)`);
        g.fillStyle = bg; g.beginPath(); g.moveTo(bx, by); g.arc(bx, by, L, a - 0.07, a + 0.07); g.closePath(); g.fill();
      }
      g.beginPath(); g.arc(bx, by, 6 * u + pulse * 2 * u, 0, TAU); g.fillStyle = `rgba(${T.glow},${0.7 + 0.3 * pulse})`; g.shadowColor = `rgb(${T.glow})`; g.shadowBlur = 20 * u; g.fill(); g.shadowBlur = 0;
    }
  }

  // ---- title and closing sets ----------------------------------------------------------------------
  function titleSet(g, F, k, local, out = 0) {
    const { W, H, u, t, tall } = F;
    const e = ease(k);
    // Leaving, the towers sink below the floor and the crest folds away.
    const sink = inout(out) * H * 0.75;
    g.save(); if (out > 0) { g.beginPath(); g.rect(0, 0, W, H - 62 * u); g.clip(); } g.translate(0, sink);
    const bx = tall ? [W * 0.2, W * 0.8] : [W * 0.1, W * 0.9];
    bx.forEach((cx, i) => tower(g, F, { cx, base: H - 66 * u, w: (tall ? 210 : 250) * u, h: (tall ? 760 : 700) * u, tiers: 4, k: e, seed: 3 + i * 5 }));
    // Inner pair, shorter, and always topped out (spire and beacon) below the title plate.
    const lines = HEADS.title.flatMap((id) => headLines(id));
    const plateBot = lines.length ? Math.max(...lines.map((l) => l.y + l.h)) + 20 * u : H * 0.62;
    const iw = (tall ? 160 : 200) * u, room = H - 66 * u - plateBot - 30 * u;
    const ih = clamp((room - 16 * u) / 1.31, 120 * u, (tall ? 480 : 520) * u);
    const bi = tall ? [W * 0.36, W * 0.64] : [W * 0.225, W * 0.775];
    bi.forEach((cx, i) => tower(g, F, { cx, base: H - 66 * u, w: iw, h: ih, tiers: 3, k: ease(k * 1.2 - 0.1), seed: 11 + i * 4, beam: false }));
    g.restore();
    // Rosette crest above the title.
    const ry = tall ? H * 0.2 : H * 0.17, R = (tall ? 120 : 110) * u, fold = 1 - ease(out * 2.2);
    if (fold > 0.01) rosette(g, F, W / 2, ry, R * (0.6 + 0.4 * e) * fold, t * 0.25 + out * 3, { n: 16 });
    g.save(); if (out > 0) { g.beginPath(); g.rect(0, 0, W, H - 62 * u); g.clip(); } g.translate(0, sink);
    // Rising fan of arches at the base.
    g.save();
    for (let k2 = 0; k2 < 6; k2++) {
      const r = (70 + k2 * 46) * u * e;
      g.beginPath(); g.arc(W / 2, H - 66 * u, r, Math.PI, TAU); pen(g, foil(F, W / 2 - r, H - 66 * u - r, r * 2, r, k2 * 0.12), (3 - k2 * 0.3) * u);
      g.globalAlpha = 0.75; g.stroke();
    }
    g.restore();
    g.restore();
  }
  function closingSet(g, F, k, local) {
    const { W, H, u, t, tall } = F;
    const e = ease(k);
    // Ripples spread from the seal for as long as the scene lasts.
    for (let i = 0; i < 5; i++) {
      const ph = fract(t * 0.32 + i / 5), r = (Math.min(W, H) * 0.16 + ph * Math.hypot(W, H) * 0.55);
      g.beginPath(); g.arc(W / 2, H / 2, r, 0, TAU); pen(g, `rgba(${F.T.rays},${0.4 * (1 - ph)})`, (2 + (1 - ph) * 3) * u); g.stroke();
    }
    const ys = tall ? [H * 0.16, H * 0.84] : [H * 0.2, H * 0.8];
    ys.forEach((y, i) => rosette(g, F, W / 2, y, (tall ? 120 : 96) * u * (0.55 + 0.45 * e), t * (i ? -0.3 : 0.3), { n: 14, ph: i * 0.4 }));
    const bx = tall ? [W * 0.2, W * 0.8] : [W * 0.13, W * 0.87];
    bx.forEach((cx, i) => tower(g, F, { cx, base: H - 66 * u, w: (tall ? 200 : 250) * u, h: (tall ? 560 : 560) * u, tiers: 4, k: e, seed: 5 + i * 3, hot: i === 1 }));
  }

  // ---- headline plates -------------------------------------------------------------------------------
  const lineCache = {};
  function headLines(id) {
    if (lineCache[id]) return lineCache[id];
    const el = document.getElementById(id), root = document.getElementById("root");
    if (!el || !root || !el.firstChild) return (lineCache[id] = []);
    let ox = 0, oy = 0;
    for (let n = el; n && n !== root; n = n.offsetParent) { ox += n.offsetLeft; oy += n.offsetTop; }
    const scale = root.getBoundingClientRect().width / (Number(root.dataset.width) || 1920) || 1;
    const er = el.getBoundingClientRect(), range = document.createRange();
    range.selectNodeContents(el);
    const out = [];
    for (const r of range.getClientRects()) {
      const line = { x: ox + (r.left - er.left) / scale, y: oy + (r.top - er.top) / scale, w: r.width / scale, h: r.height / scale };
      if (line.w > 1 && !out.some((o) => Math.abs(o.y - line.y) < 2)) out.push(line);
    }
    return (lineCache[id] = out);
  }
  function headPlate(g, F) {
    const { info, u } = F;
    if (!info.scene || !HEADS[info.scene]) return;
    const lines = HEADS[info.scene].flatMap((id) => headLines(id));
    if (!lines.length) return;
    const last = info.scene === "closing";
    const q = ease(span(info.local, 0, 0.5)), fade = (last ? 1 : 1 - span(info.local, info.hold - info.change, info.hold)) * ease(span(info.local, 0, 0.12));
    if (q <= 0 || fade <= 0) return;
    const x0 = Math.min(...lines.map((l) => l.x)), x1 = Math.max(...lines.map((l) => l.x + l.w));
    const y0 = Math.min(...lines.map((l) => l.y)), y1 = Math.max(...lines.map((l) => l.y + l.h));
    const padX = 76 * u, padY = 20 * u, w = x1 - x0 + padX * 2, h = y1 - y0 + padY * 2, cx = (x0 + x1) / 2;
    g.save(); g.globalAlpha = fade;
    plate(g, F, cx - w / 2, y0 - padY, w, h, { alpha: 0.9, c: 14 * u });
    if (q > 0.7) {
      const wing = 70 * u * ease((q - 0.7) / 0.3), yy = y0 - padY + h / 2;
      for (const s of [-1, 1]) {
        const x = cx + s * (w / 2 + 12 * u);
        pen(g, foil(F, x, yy - 4 * u, wing * s, 8 * u), 2.2 * u); g.beginPath(); g.moveTo(x, yy); g.lineTo(x + s * wing, yy); g.stroke();
        diamond(g, x + s * (wing + 8 * u), yy, 8 * u, 11 * u); g.fillStyle = foil(F, x, yy - 10 * u, 20 * u, 20 * u); g.fill();
      }
    }
    g.restore();
  }

  // ---- fan shutter transition ------------------------------------------------------------------------
  const NW = 13;
  function shutter(F, k) {
    const { W, H } = F, cx = W / 2, cy = H * 1.15, R = Math.hypot(W / 2, cy) * 1.08;
    const d = (Math.PI + 0.24) / NW, a00 = Math.PI - 0.12, mid = (NW - 1) / 2;
    const parts = [];
    for (let i = 0; i < NW; i++) {
      const s = Math.abs(i - mid) / mid, e = inout(clamp(k * 1.7 - s * 0.7));
      parts.push({ i, a0: a00 + i * d, a1: a00 + (i + 1) * d, e, inward: i % 2 === 1 });
    }
    return { cx, cy, R, parts };
  }
  function sectorPath(g, sw) {
    for (const p of sw.parts) {
      if (p.e <= 0.001) continue;
      if (!p.inward) { g.moveTo(sw.cx, sw.cy); g.arc(sw.cx, sw.cy, sw.R * p.e, p.a0, p.a1); g.closePath(); }
      else { g.moveTo(sw.cx + Math.cos(p.a0) * sw.R, sw.cy + Math.sin(p.a0) * sw.R); g.arc(sw.cx, sw.cy, sw.R, p.a0, p.a1); g.arc(sw.cx, sw.cy, sw.R * (1 - p.e), p.a1, p.a0, true); g.closePath(); }
    }
  }
  function ribs(g, F, sw, k) {
    if (k <= 0.01 || k >= 0.99) return;
    const u = F.u;
    g.save();
    const fade = Math.min(1, k * 8, (1 - k) * 8);
    g.globalAlpha = fade;
    const w = F.W;
    for (const p of sw.parts) {
      if (p.e <= 0.003) continue;
      const r0 = p.inward ? sw.R * (1 - p.e) : 0, r1 = p.inward ? sw.R : sw.R * p.e;
      g.beginPath();
      for (const a of [p.a0, p.a1]) { g.moveTo(sw.cx + Math.cos(a) * r0, sw.cy + Math.sin(a) * r0); g.lineTo(sw.cx + Math.cos(a) * r1, sw.cy + Math.sin(a) * r1); }
      pen(g, foil(F, 0, 0, w, F.H, p.i * 0.07), 4 * u); g.stroke();
      const rr = p.inward ? r0 : r1;
      g.beginPath(); g.arc(sw.cx, sw.cy, rr, p.a0, p.a1); pen(g, `rgba(${F.T.glow},0.95)`, 5 * u); g.stroke();
    }
    g.restore();
  }
  // Each scene drawer: build the set from its own world, and cross through the shutter at the changes.
  function scene(id, fn) {
    return (g, S, box, p, d, info) => {
      const F = mk(g, S, info);
      const out = info.exit !== undefined;
      // The opening scene of a piece has nothing to cross from, so it starts whole.
      const first = info.t - info.local < 0.001;
      const k = out ? info.exit : info.local < info.change && !first ? info.local / Math.max(0.01, info.change) : 1;
      if (!out && k >= 1) { fn(F, F.box, p, d, info); return; }
      const sw = shutter(F, k);
      g.save();
      if (out) {
        g.beginPath(); g.rect(0, 0, F.W, F.H); sectorPath(g, sw); g.clip("evenodd");
        backdrop(g, F, id); chrome(g, F);
        fn(F, F.box, 1, d, info);
      } else {
        g.beginPath(); sectorPath(g, sw); g.clip();
        fn(F, F.box, p, d, info);
      }
      g.restore();
      ribs(g, F, sw, k);
    };
  }

  // The title set has no scene drawer of its own (the stage draws it); this one only carries it out
  // through the fan shutter during the first change of the next scene, so the two cross.
  function titleExit(g, S, box, p, d, info) {
    if (info.exit === undefined) return;
    const F = mk(g, S, info), k = info.exit, sw = shutter(F, k);
    g.save();
    g.beginPath(); g.rect(0, 0, F.W, F.H); sectorPath(g, sw); g.clip("evenodd");
    backdrop(g, F, "title"); chrome(g, F); titleSet(g, F, 1, info.local, k);
    g.restore();
    ribs(g, F, sw, k);
  }

  // ---- scenes -------------------------------------------------------------------------------------
  function drawChart(F, box, p, d, info) {
    const { g, u, T, t } = F;
    const n = d.values.length, max = Math.max(...d.values, 1);
    const base = box.y + box.h - 96 * u, gap = box.w / n;
    const bw = Math.min(gap * 0.66, 330 * u);
    // Plinth: three steps.
    const pq = ease(p * 2.2);
    [[0, 0, 12], [14, 12, 9], [34, 21, 8]].forEach(([inset, dy, hh], i) => {
      const w = (box.w - inset * 2 * u) * pq, x = box.x + box.w / 2 - w / 2;
      g.fillStyle = foil(F, x, base + dy * u, Math.max(1, w), hh * u, i * 0.2); g.fillRect(x, base + dy * u, w, hh * u);
    });
    const maxH = (base - box.y - 70 * u) * 0.8;
    // Level line at the highlight, with running dashes.
    const hi = d.highlight;
    d.values.forEach((value, i) => {
      const q = ease(clamp((p - (i / n) * 0.5) / 0.5));
      const cx = box.x + gap * (i + 0.5), hot = i === hi;
      const h = maxH * clamp(value / max, 0.2, 1) * (hot ? 1 : 0.94);
      const live = 1 + 0.012 * Math.sin(t * 1.7 + i) * (q >= 1 ? 1 : 0);
      tower(g, F, { cx, base, w: bw, h: h * live, tiers: 4, k: q, hot, seed: i * 2 + 1, beam: hot });
      if (q > 0.04) {
        // Nameplate at the foot of each tower.
        const size = 96 * u, label = num(value * q, 0, d.prefix, d.suffix);
        const tw = textW(g, label, size, 600, 0.04), pw = Math.max(bw * 0.86, tw + 56 * u), ph = 124 * u, px = cx - pw / 2, py = base - ph - 14 * u;
        plate(g, F, px, py, pw, ph, { alpha: 0.94, c: 12 * u, ph: i * 0.17 });
        say(g, F, label, cx, py + ph / 2 + 2 * u, size, { align: "center", base: "middle", weight: 600, track: 0.04, color: hot ? F.acc : T.text, maxW: pw - 36 * u, min: 60 * u, upper: false, glow: hot ? F.acc : null });
        say(g, F, d.labels[i] || "", cx, base + 76 * u, 42 * u, { align: "center", color: hot ? F.acc : T.sub, maxW: gap * 0.92, min: 42 * u, weight: 500 });
      }
    });
    if (p > 0.55 && hi >= 0 && hi < n) {
      const y = base - maxH * clamp(d.values[hi] / max, 0.2, 1);
      g.beginPath(); g.moveTo(box.x, y); g.lineTo(box.x + box.w, y); pen(g, `rgba(${T.glow},0.5)`, 2 * u); g.setLineDash([16 * u, 14 * u]); g.lineDashOffset = -t * 60 * u; g.globalAlpha = ease((p - 0.55) / 0.2); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    }
  }

  function knob(g, F, cx, cy, r, ang, hot) {
    const { u, T } = F;
    g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fillStyle = `rgba(${T.plate},1)`; g.fill(); pen(g, foil(F, cx - r, cy - r, r * 2, r * 2, cx * 0.001), 2.4 * u); g.stroke();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; g.beginPath(); g.moveTo(cx + Math.cos(a) * r * 1.16, cy + Math.sin(a) * r * 1.16); g.lineTo(cx + Math.cos(a) * r * 1.34, cy + Math.sin(a) * r * 1.34); pen(g, foil(F, cx - r, cy - r, r * 2, r * 2, i * 0.05), 1.6 * u); g.stroke(); }
    g.beginPath(); g.arc(cx, cy, r * 0.62, 0, TAU); g.fillStyle = hot ? F.acc : foil(F, cx - r, cy - r, r * 2, r * 2, 0.3); g.fill();
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ang) * r * 0.62, cy + Math.sin(ang) * r * 0.62); pen(g, `rgba(${T.plate},1)`, 3 * u); g.stroke();
  }
  function drawObject(F, box, p, d, info) {
    const { g, u, T, t, tall } = F;
    const phone = d.kind === "phone";
    let cw, ch, x0, y0;
    if (phone) { cw = Math.min(box.w * (tall ? 0.46 : 0.3), box.h * 0.5); ch = cw * 1.95; x0 = box.x + box.w * (tall ? 0.5 : 0.34) - cw / 2; y0 = box.y + (box.h - ch - (tall ? 300 * u : 0)) / 2; }
    else { cw = Math.min(box.w * (tall ? 0.94 : 0.58), box.h * 1.25); ch = cw * (tall ? 0.7 : 0.66); x0 = box.x + (tall ? (box.w - cw) / 2 : box.w * 0.04); y0 = box.y + (box.h - ch - (tall ? 330 * u : 0)) / 2; }
    const q = ease(p * 1.3), bob = Math.sin(t * 1.3) * 3 * u;
    g.save(); g.translate(0, bob);
    // Cabinet.
    stepPath(g, x0, y0, cw, ch, 22 * u);
    const cg = g.createLinearGradient(0, y0, 0, y0 + ch); cg.addColorStop(0, T.lac2); cg.addColorStop(1, T.jadeD);
    g.fillStyle = cg; g.fill(); pen(g, foil(F, x0, y0, cw, ch), 4 * u); g.stroke();
    stepPath(g, x0 + 16 * u, y0 + 16 * u, cw - 32 * u, ch - 32 * u, 14 * u); pen(g, foil(F, x0, y0, cw, ch, 0.4), 1.6 * u); g.stroke();
    // Feet and a crest.
    for (const fx of [x0 + cw * 0.12, x0 + cw * 0.88 - 36 * u]) { g.fillStyle = foil(F, fx, y0 + ch, 36 * u, 14 * u, 0.3); g.fillRect(fx, y0 + ch, 36 * u, 14 * u); }
    const crestY = y0 - 6 * u;
    for (let i = 0; i < 3; i++) { const w = cw * (0.2 - i * 0.05), y = crestY - 10 * u * (i + 1); g.fillStyle = foil(F, x0, y, w, 10 * u, i * 0.2); g.fillRect(x0 + cw / 2 - w / 2, y, w, 8 * u); }
    // Screen.
    const sx = x0 + cw * (phone ? 0.08 : 0.055), sy = y0 + ch * (phone ? 0.065 : 0.1), sw = cw * (phone ? 0.84 : 0.6), sh = ch * (phone ? 0.7 : 0.76);
    g.save();
    poly(g, [[sx, sy + sh], [sx, sy + sh * 0.12], [sx + sw * 0.12, sy], [sx + sw * 0.88, sy], [sx + sw, sy + sh * 0.12], [sx + sw, sy + sh]]);
    g.clip();
    g.fillStyle = T.lac; g.fillRect(sx, sy, sw, sh);
    // Preview: a sun over a skyline, rays turning.
    const pv = { x: sx + sw * 0.07, y: sy + sh * 0.12, w: sw * 0.86, h: sh * 0.42 };
    const pg = g.createLinearGradient(0, pv.y, 0, pv.y + pv.h); pg.addColorStop(0, T.jadeD); pg.addColorStop(1, "#1d4a3f");
    g.fillStyle = pg; g.fillRect(pv.x, pv.y, pv.w, pv.h);
    g.save(); g.beginPath(); g.rect(pv.x, pv.y, pv.w, pv.h); g.clip();
    g.fillStyle = `rgba(${T.rays},0.38)`; rays(g, pv.x + pv.w / 2, pv.y + pv.h * 0.92, 0, pv.w, t * 0.3, t * 0.3 + TAU, 22, 0.5);
    g.beginPath(); g.arc(pv.x + pv.w / 2, pv.y + pv.h * 0.92, pv.h * 0.36, Math.PI, TAU); g.fillStyle = F.acc; g.fill();
    const sk = [0.05, 0.14, 0.09, 0.22, 0.12, 0.3, 0.12, 0.2, 0.08, 0.16, 0.06];
    sk.forEach((hh, i) => { const w = pv.w / sk.length; g.fillStyle = T.lac; g.fillRect(pv.x + i * w, pv.y + pv.h * (1 - hh * 1.3), w - 3 * u, pv.h * hh * 1.3 + 2); });
    g.restore();
    pen(g, foil(F, pv.x, pv.y, pv.w, pv.h, 0.2), 2 * u); g.strokeRect(pv.x, pv.y, pv.w, pv.h);
    // Tracks and clips.
    const th = sh * 0.1, clips = [[0.08, 0.3], [0.4, 0.22], [0.65, 0.27]];
    for (let r = 0; r < 3; r++) {
      const ty = sy + sh * 0.6 + r * (th + sh * 0.04);
      clips.forEach(([cx, cwid], i) => {
        const shown = clamp((q - 0.15 - i * 0.12 - r * 0.05) * 3.2);
        if (shown <= 0) return;
        const x = sx + sw * (cx + r * 0.03), w = sw * cwid * shown;
        g.fillStyle = r === 0 && i === 1 ? F.acc : foil(F, x, ty, w, th, r * 0.2 + i * 0.1);
        g.globalAlpha = r === 0 && i === 1 ? 1 : 0.8; g.fillRect(x, ty, w, th);
        g.fillStyle = "rgba(10,12,12,0.4)"; g.fillRect(x + w * 0.04, ty + th * 0.4, w * 0.5, th * 0.14);
        g.globalAlpha = 1;
      });
    }
    // Playhead sweeps the timeline and loops.
    const ph = sx + sw * (0.06 + 0.88 * fract(t * 0.2));
    g.beginPath(); g.moveTo(ph, sy + sh * 0.56); g.lineTo(ph, sy + sh * 0.98); pen(g, `rgb(${T.glow})`, 2.6 * u); g.shadowColor = `rgb(${T.glow})`; g.shadowBlur = 12 * u; g.stroke(); g.shadowBlur = 0;
    diamond(g, ph, sy + sh * 0.56, 7 * u, 9 * u); g.fillStyle = `rgb(${T.glow})`; g.fill();
    // Scanline shimmer across the glass.
    const sl = fract(t * 0.35) * (sh + 60 * u) - 30 * u;
    const gl = g.createLinearGradient(0, sy + sl - 24 * u, 0, sy + sl + 24 * u); gl.addColorStop(0, "rgba(255,255,255,0)"); gl.addColorStop(0.5, "rgba(255,240,190,0.1)"); gl.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gl; g.fillRect(sx, sy + sl - 24 * u, sw, 48 * u);
    g.restore();
    poly(g, [[sx, sy + sh], [sx, sy + sh * 0.12], [sx + sw * 0.12, sy], [sx + sw * 0.88, sy], [sx + sw, sy + sh * 0.12], [sx + sw, sy + sh]]);
    pen(g, foil(F, sx, sy, sw, sh, 0.1), 3.4 * u); g.stroke();
    // Right column (or bottom strip): sunburst grille and knobs.
    if (!phone) {
      const gx = x0 + cw * 0.81, gy = y0 + ch * 0.34, gr = cw * 0.125;
      g.save(); g.beginPath(); g.arc(gx, gy, gr, Math.PI, TAU); g.lineTo(gx + gr, gy + 4 * u); g.lineTo(gx - gr, gy + 4 * u); g.closePath(); g.clip();
      g.fillStyle = `rgba(${T.plate},1)`; g.fillRect(gx - gr, gy - gr, gr * 2, gr + 6 * u);
      g.fillStyle = foil(F, gx - gr, gy - gr, gr * 2, gr, 0.1); rays(g, gx, gy + 4 * u, gr * 0.15, gr * 1.1, Math.PI, TAU, 16, 0.55);
      g.restore();
      g.beginPath(); g.arc(gx, gy, gr, Math.PI, TAU); g.lineTo(gx + gr, gy + 4 * u); g.lineTo(gx - gr, gy + 4 * u); g.closePath(); pen(g, foil(F, gx - gr, gy - gr, gr * 2, gr), 2.6 * u); g.stroke();
      for (let i = 0; i < 3; i++) knob(g, F, x0 + cw * (0.7 + i * 0.105), y0 + ch * 0.62 + (i === 1 ? 14 * u : 0), cw * 0.034, t * (0.8 + i * 0.3) + i * 2, i === 1);
      // VU needle meter.
      const mx = x0 + cw * 0.81, my = y0 + ch * 0.86, mr = cw * 0.09;
      g.beginPath(); g.arc(mx, my, mr, Math.PI * 1.15, Math.PI * 1.85); pen(g, foil(F, mx - mr, my - mr, mr * 2, mr, 0.3), 3 * u); g.stroke();
      const na = Math.PI * 1.5 + Math.sin(t * 2.1) * 0.35 + Math.sin(t * 5.3) * 0.1;
      g.beginPath(); g.moveTo(mx, my); g.lineTo(mx + Math.cos(na) * mr * 0.95, my + Math.sin(na) * mr * 0.95); pen(g, F.acc, 2.6 * u); g.stroke();
    } else {
      for (let i = 0; i < 3; i++) knob(g, F, x0 + cw * (0.3 + i * 0.2), y0 + ch * 0.91, cw * 0.05, t * (0.8 + i * 0.3) + i * 2, i === 1);
    }
    g.restore();
    // Callouts: leaders to labels at the right, or a numbered key beneath on a tall frame.
    const anchors = [[pv.x + pv.w * 0.7, pv.y + pv.h * 0.3], [sx + sw * 0.52, sy + sh * 0.64], [sx + sw * 0.2, sy + sh * 0.86]];
    const labels = d.callouts;
    if (!tall) {
      const lx = box.x + box.w * 0.58, maxW = box.x + box.w - lx;
      labels.forEach((label, i) => {
        const c = ease(clamp((p - 0.2 - i * 0.14) / 0.35));
        if (c <= 0 || !label) return;
        const [ax, ay] = anchors[i], ly = box.y + box.h * (0.2 + i * 0.3);
        const lw = Math.min(maxW, textW(g, label, 42 * u, 600) + 60 * u);
        const ex = lx - 14 * u;
        g.beginPath(); g.moveTo(ax, ay + bob); g.lineTo(ax + (ex - ax) * c * 0.55, ay + bob + (ly - ay - bob) * c); g.lineTo(ax + (ex - ax) * c, ly);
        pen(g, foil(F, ax, ay, ex - ax, ly - ay, i * 0.2), 2.6 * u); g.stroke();
        g.beginPath(); g.arc(ax, ay + bob, (7 + 3 * Math.sin(t * 4 + i)) * u, 0, TAU); g.fillStyle = F.acc; g.fill();
        if (c > 0.8) {
          const k2 = ease((c - 0.8) / 0.2);
          plate(g, F, lx, ly - 40 * u, lw, 80 * u, { alpha: 0.92 * k2, c: 10 * u, thin: true, lw: 2 * u, ph: i * 0.2 });
          g.globalAlpha = k2; say(g, F, label, lx + 30 * u, ly + 1 * u, 42 * u, { base: "middle", weight: 600, maxW: lw - 50 * u, min: 42 * u }); g.globalAlpha = 1;
        }
      });
    } else {
      anchors.forEach(([ax, ay], i) => {
        const c = ease(clamp((p - 0.2 - i * 0.14) / 0.35)); if (c <= 0) return;
        g.beginPath(); g.arc(ax, ay + bob, 22 * u * c, 0, TAU); g.fillStyle = F.acc; g.fill();
        say(g, F, String(i + 1), ax, ay + bob + 2 * u, 28 * u * c, { align: "center", base: "middle", color: T.lac, weight: 700, upper: false });
      });
      const ry0 = y0 + ch + 70 * u, rh = (box.y + box.h - ry0) / 3;
      labels.forEach((label, i) => {
        const c = ease(clamp((p - 0.3 - i * 0.14) / 0.3)); if (c <= 0 || !label) return;
        const y = ry0 + i * rh, pw = box.w * 0.9 * c, px = box.x + (box.w - pw) / 2;
        plate(g, F, px, y, pw, rh - 18 * u, { alpha: 0.92, c: 10 * u, thin: true, lw: 2 * u, ph: i * 0.2 });
        if (c > 0.7) {
          g.beginPath(); g.arc(px + 54 * u, y + (rh - 18 * u) / 2, 24 * u, 0, TAU); g.fillStyle = F.acc; g.fill();
          say(g, F, String(i + 1), px + 54 * u, y + (rh - 18 * u) / 2 + 2 * u, 30 * u, { align: "center", base: "middle", color: T.lac, weight: 700, upper: false });
          say(g, F, label, px + 100 * u, y + (rh - 18 * u) / 2 + 1 * u, 44 * u, { base: "middle", weight: 600, maxW: pw - 130 * u, min: 42 * u });
        }
      });
    }
  }

  // A figure in the manner of a lobby relief: faceted head, stepped hair, a jacket with an inline gold
  // contour, fine hatching, stacked collar chevrons, and headwear that tells the roles apart.
  const HAIR = [
    // 0: a stepped hat over side tufts.
    [[[-1.28, -0.86], [1.28, -0.86], [1.28, -0.66], [-1.28, -0.66]], [[-0.8, -0.82], [-0.7, -1.46], [-0.46, -1.46], [-0.46, -1.6], [0.46, -1.6], [0.46, -1.46], [0.7, -1.46], [0.8, -0.82]],
      [[-0.84, -0.66], [-0.84, 0.05], [-0.7, 0.05], [-0.7, -0.28], [-0.56, -0.28], [-0.56, -0.66]], [[0.84, -0.66], [0.84, 0.05], [0.7, 0.05], [0.7, -0.28], [0.56, -0.28], [0.56, -0.66]]],
    // 1: a stepped bob to the jaw.
    [[[-0.98, 0.78], [-0.98, -0.55], [-0.72, -0.98], [-0.3, -1.16], [0.3, -1.16], [0.72, -0.98], [0.98, -0.55], [0.98, 0.78], [0.74, 0.78], [0.74, 0.22], [0.64, 0.22], [0.64, -0.46], [0.22, -0.64], [-0.06, -0.46], [-0.64, -0.62], [-0.64, 0.22], [-0.74, 0.22], [-0.74, 0.78]]],
    // 2: a terraced crest with a star comb.
    [[[-0.84, -0.18], [-0.84, -0.76], [-0.66, -0.76], [-0.66, -1.02], [-0.4, -1.02], [-0.4, -1.26], [0.56, -1.26], [0.56, -1.06], [0.82, -1.06], [0.84, -0.18], [0.7, -0.18], [0.66, -0.62], [-0.68, -0.62], [-0.7, -0.18]]],
    // 3: a widow's peak, cut square.
    [[[-0.9, 0.1], [-0.9, -0.8], [-0.56, -1.12], [0.56, -1.12], [0.9, -0.8], [0.9, 0.1], [0.73, 0.1], [0.7, -0.56], [0.26, -0.56], [0, -0.78], [-0.26, -0.56], [-0.7, -0.56], [-0.73, 0.1]]],
  ];
  function person(g, F, cx, base, size, hot, variant, breathe) {
    const { u, T, t } = F;
    const h = size * 0.15, bw = size * 0.52, neck = base - size * 0.5, hy = neck - h * 1.7, fine = Math.max(1, size * 0.006);
    g.save(); g.translate(cx, base); g.scale(1, 1 + breathe); g.translate(-cx, -base);
    const gold = (ph) => foil(F, cx - bw, base - size, bw * 2, size, variant * 0.2 + ph);
    const shell = (k) => [[cx - bw + k, base], [cx - bw + k, neck + size * 0.12 + k * 0.4], [cx - bw * 0.82 + k * 0.6, neck + size * 0.02 + k], [cx - bw * 0.4, neck - size * 0.02 + k], [cx + bw * 0.4, neck - size * 0.02 + k], [cx + bw * 0.82 - k * 0.6, neck + size * 0.02 + k], [cx + bw - k, neck + size * 0.12 + k * 0.4], [cx + bw - k, base]];
    // Jacket, hatched, with an outer and inline contour.
    poly(g, shell(0));
    if (hot) g.fillStyle = gold(0); else { const gr = g.createLinearGradient(0, neck, 0, base); gr.addColorStop(0, "#2c8f7b"); gr.addColorStop(1, T.jadeD); g.fillStyle = gr; }
    g.fill();
    g.save(); poly(g, shell(0)); g.clip();
    pen(g, hot ? "rgba(10,12,12,0.32)" : `rgba(${T.rays},0.3)`, fine);
    g.beginPath(); for (let x = cx - bw - size * 0.5; x < cx + bw; x += size * 0.028) { g.moveTo(x, base); g.lineTo(x + size * 0.5, neck - size * 0.05); } g.stroke();
    // Stepped shoulder panels.
    for (const s of [-1, 1]) { poly(g, [[cx + s * bw, neck + size * 0.12], [cx + s * bw * 0.84, neck + size * 0.03], [cx + s * bw * 0.6, neck + size * 0.03], [cx + s * bw * 0.6, neck + size * 0.1], [cx + s * bw * 0.74, neck + size * 0.1], [cx + s * bw * 0.74, neck + size * 0.18], [cx + s * bw, neck + size * 0.18]]); g.fillStyle = hot ? "rgba(10,12,12,0.4)" : gold(0.3); g.fill(); }
    g.restore();
    poly(g, shell(0)); pen(g, hot ? "rgba(10,12,12,0.8)" : gold(0.5), Math.max(2, size * 0.012)); g.stroke();
    poly(g, shell(size * 0.035)); pen(g, hot ? "rgba(10,12,12,0.55)" : gold(0.7), fine * 1.2); g.stroke();
    // Shirt front: a dark wedge holding stacked collar chevrons and a jewel.
    poly(g, [[cx - bw * 0.4, neck - size * 0.02], [cx, neck + size * 0.34], [cx + bw * 0.4, neck - size * 0.02]]);
    g.fillStyle = `rgba(${T.plate},1)`; g.fill(); pen(g, hot ? "rgba(10,12,12,0.9)" : gold(0.1), fine * 1.6); g.stroke();
    for (let k = 0; k < 4; k++) {
      const w = bw * (0.34 - k * 0.07), y = neck + size * (0.02 + k * 0.06);
      g.beginPath(); g.moveTo(cx - w, y); g.lineTo(cx, y + w * 0.75); g.lineTo(cx + w, y); pen(g, gold(0.2 + k * 0.1), fine * (2.2 - k * 0.3)); g.stroke();
    }
    diamond(g, cx, neck + size * 0.38, size * 0.035, size * 0.05); g.fillStyle = hot ? `rgba(${T.plate},1)` : F.acc; g.fill();
    for (let k = 0; k < 2; k++) { diamond(g, cx, neck + size * (0.46 + k * 0.08), size * 0.016, size * 0.022); g.fillStyle = hot ? `rgba(${T.plate},0.9)` : gold(0.4); g.fill(); }
    // Lapel edges.
    pen(g, hot ? "rgba(10,12,12,0.85)" : gold(0.6), fine * 1.6);
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * bw * 0.4, neck - size * 0.02); g.lineTo(cx + s * bw * 0.56, neck + size * 0.14); g.lineTo(cx + s * bw * 0.36, neck + size * 0.16); g.lineTo(cx, neck + size * 0.36); g.stroke(); }
    // Neck.
    g.fillStyle = `rgb(${T.ink})`; g.fillRect(cx - h * 0.3, neck - h * 0.9, h * 0.6, h * 0.92);
    g.fillStyle = `rgba(${T.rays},0.35)`; g.fillRect(cx - h * 0.3, neck - h * 0.9, h * 0.6, h * 0.22);
    // Faceted head with hatched shade on one side and a gold contour.
    const R = (x, y) => [cx + x * h, hy + y * h];
    const headPts = [R(-0.8, -0.6), R(-0.5, -1.0), R(0.5, -1.0), R(0.8, -0.6), R(0.76, 0.4), R(0.3, 1.0), R(-0.3, 1.0), R(-0.76, 0.4)];
    poly(g, headPts); g.fillStyle = T.text; g.fill();
    g.save(); poly(g, headPts); g.clip();
    pen(g, `rgba(${T.rays},0.55)`, fine);
    g.beginPath(); for (let k = 0; k < 7; k++) { const x = cx + h * (0.28 + k * 0.09); g.moveTo(x, hy - h); g.lineTo(x - h * 0.3, hy + h); } g.stroke();
    g.restore();
    poly(g, headPts); pen(g, gold(0.35), Math.max(1.6, size * 0.009)); g.stroke();
    // Face: almond eyes that blink, angled brows, a ruled nose and a jewel of a mouth.
    const blink = fract(t * 0.3 + variant * 0.37) > 0.94 ? 0.15 : 1, look = Math.sin(t * 0.7 + variant) * h * 0.04;
    for (const s of [-1, 1]) {
      const ex = cx + s * h * 0.34, ey = hy - h * 0.02;
      g.beginPath(); g.moveTo(ex - h * 0.2, ey); g.quadraticCurveTo(ex, ey - h * 0.16 * blink, ex + h * 0.2, ey); g.quadraticCurveTo(ex, ey + h * 0.11 * blink, ex - h * 0.2, ey);
      pen(g, `rgba(${T.plate},1)`, fine * 1.4); g.stroke();
      if (blink > 0.5) { g.beginPath(); g.arc(ex + look, ey, h * 0.065, 0, TAU); g.fillStyle = `rgba(${T.plate},1)`; g.fill(); }
      g.beginPath(); g.moveTo(ex - s * h * 0.24, ey - h * 0.2); g.lineTo(ex + s * h * 0.06, ey - h * 0.3); g.lineTo(ex + s * h * 0.24, ey - h * 0.24); pen(g, `rgba(${T.plate},1)`, fine * 1.8); g.stroke();
    }
    g.beginPath(); g.moveTo(cx + h * 0.02, hy + h * 0.02); g.lineTo(cx - h * 0.08, hy + h * 0.4); g.lineTo(cx + h * 0.06, hy + h * 0.44); pen(g, `rgba(${T.plate},0.8)`, fine * 1.2); g.stroke();
    diamond(g, cx, hy + h * 0.68, h * 0.16, h * 0.055); g.fillStyle = hot ? F.acc : "#9c3b2a"; g.fill();
    // Hair or headwear: dark lacquer with gold inline strokes along the steps.
    const v = variant % 6, set = HAIR[v % 4];
    set.forEach((pts, j) => {
      const P = pts.map(([x, y]) => R(x, y));
      poly(g, P); g.fillStyle = `rgba(${T.plate},1)`; g.fill(); pen(g, gold(0.15 + j * 0.1), fine * 1.6); g.stroke();
    });
    pen(g, gold(0.45), fine);
    g.beginPath();
    if (v % 4 === 0) { const [bx0, by0] = R(-0.78, -0.94), [bx1] = R(0.78, 0); g.stroke(); g.fillStyle = hot ? F.acc : gold(0.25); g.fillRect(bx0, by0, bx1 - bx0, h * 0.1); g.beginPath(); for (let k = 1; k < 4; k++) { const [x0, y0] = R(-0.4 + k * 0.2, -1.42), [, y1] = R(0, -1.0); g.moveTo(x0, y0); g.lineTo(x0, y1); } }
    else if (v % 4 === 1) { for (let k = 0; k < 3; k++) { const y = -0.98 + k * 0.16; [[-0.7, y + 0.1], [-0.35, y - 0.04], [0, y + 0.1], [0.35, y - 0.04], [0.7, y + 0.1]].forEach(([x, yy], i) => { const [X, Y] = R(x, yy); i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); } for (const s of [-1, 1]) { const [X0, Y0] = R(s * 0.86, -0.4), [, Y1] = R(0, 0.66); g.moveTo(X0, Y0); g.lineTo(X0, Y1); } }
    else if (v % 4 === 2) { for (let k = 0; k < 3; k++) { const [X0, Y0] = R(-0.72 + k * 0.2, -0.7 - k * 0.22), [X1] = R(0.7 - k * 0.04, 0); g.moveTo(X0, Y0); g.lineTo(X1, Y0); } }
    else { for (let k = 1; k < 4; k++) { const [X0, Y0] = R(-0.8 + k * 0.1, -0.6 - k * 0.12), [X1] = R(0, 0), [X2] = R(0.8 - k * 0.1, 0); g.moveTo(X0, Y0 + h * 0.3); g.lineTo(X0, Y0); g.lineTo(X1, Y0 - h * 0.12); g.lineTo(X2, Y0); g.lineTo(X2, Y0 + h * 0.3); } }
    g.stroke();
    if (v % 4 === 2) { const [sx, sy] = R(0.42, -1.04); const tw = 0.8 + 0.2 * Math.sin(t * 3 + variant); star4(g, sx, sy, h * 0.28 * tw); g.fillStyle = hot ? F.acc : `rgb(${T.glow})`; g.fill(); }
    if (v >= 4) { const [bx, by] = R(0, -1.3); g.beginPath(); g.arc(bx, by, h * 0.34, 0, TAU); g.fillStyle = `rgba(${T.plate},1)`; g.fill(); pen(g, gold(0.6), fine * 1.6); g.stroke(); g.beginPath(); g.arc(bx, by, h * 0.2, 0, TAU); g.stroke(); }
    g.restore();
  }
  function drawPeople(F, box, p, d, info) {
    const { g, u, T, t } = F;
    const n = Math.max(2, Math.min(6, Math.round(d.count)));
    const slot = box.w / n, nw = Math.min(slot * 0.86, 420 * u), nh = Math.min(box.h * 0.97 - 100 * u, nw * 2.2);
    const hotIdx = Math.min(n - 1, d.highlight);
    for (let i = 0; i < n; i++) {
      // Figures rise out of their plinths close together, so no niche stands empty for long.
      const q = ease(clamp((info.local - i * 0.08) / 0.5)), cx = box.x + slot * (i + 0.5), hot = i === hotIdx;
      const top = box.y + (box.h - 100 * u - nh) / 2 + 4 * u, bot = top + nh, arcR = nw / 2;
      // Niche: an arch with a sunburst behind the figure.
      const niche = () => { g.beginPath(); g.moveTo(cx - nw / 2, bot); g.lineTo(cx - nw / 2, top + arcR); g.arc(cx, top + arcR, arcR, Math.PI, TAU); g.lineTo(cx + nw / 2, bot); g.closePath(); };
      niche();
      const ng = g.createLinearGradient(0, top, 0, bot); ng.addColorStop(0, T.lac2); ng.addColorStop(1, T.jadeD); g.fillStyle = ng; g.fill();
      g.save(); niche(); g.clip();
      g.fillStyle = hot ? `rgba(${T.rays},0.5)` : `rgba(${T.rays},0.25)`;
      rays(g, cx, bot - nh * 0.3, 0, nh * 1.2, t * (hot ? 0.28 : -0.2), t * (hot ? 0.28 : -0.2) + TAU, 18, 0.5);
      // Figure.
      const size = Math.min(nh * 0.74, nw * 1.35) * (hot ? 1.04 : 1);
      if (hot) { g.beginPath(); g.arc(cx, bot - size * 0.9, size * (0.34 + 0.02 * Math.sin(t * 2.2)), 0, TAU); g.strokeStyle = F.acc; g.lineWidth = 3 * u; g.setLineDash([10 * u, 10 * u]); g.lineDashOffset = -t * 30 * u; g.stroke(); g.setLineDash([]); }
      g.globalAlpha = clamp(q * 3);
      g.translate(0, (1 - q) * size * 0.62);
      person(g, F, cx, bot - 4 * u, size * (0.9 + 0.1 * q), hot, i, 0.012 * Math.sin(t * 1.8 + i * 1.1));
      g.restore();
      niche(); pen(g, foil(F, cx - nw / 2, top, nw, nh, i * 0.17), 3.4 * u); g.stroke();
      g.save(); g.translate(0, 0); g.beginPath(); g.moveTo(cx - nw / 2 + 12 * u, bot); g.lineTo(cx - nw / 2 + 12 * u, top + arcR); g.arc(cx, top + arcR, arcR - 12 * u, Math.PI, TAU); g.lineTo(cx + nw / 2 - 12 * u, bot);
      pen(g, foil(F, cx - nw / 2, top, nw, nh, i * 0.17 + 0.3), 1.4 * u); g.globalAlpha = 0.75; g.stroke(); g.restore();
      // Sconce on the crown of the arch, flickering.
      const fl = 0.6 + 0.4 * Math.sin(t * 5 + i * 2.1);
      diamond(g, cx, top - 8 * u, 9 * u, 14 * u); g.fillStyle = `rgba(${T.glow},${fl})`; g.shadowColor = `rgb(${T.glow})`; g.shadowBlur = 16 * u * fl; g.fill(); g.shadowBlur = 0;
      // Plinth with the role plate.
      const label = i < d.badges.length ? d.badges[i] : "";
      [[0, 14], [10, 12]].forEach(([ins, hh], s) => { g.fillStyle = foil(F, cx - nw / 2, bot + s * 14 * u, nw, hh * u, i * 0.2 + s * 0.1); g.fillRect(cx - nw / 2 - 8 * u + ins * u, bot + s * 14 * u, nw + 16 * u - ins * 2 * u, hh * u); });
      if (q > 0.45 && label) {
        const k2 = ease((q - 0.45) / 0.35), pw = Math.min(slot * 0.98, Math.max(nw * 0.9, textW(g, label, 42 * u, 600) + 40 * u)), ph = 72 * u, py = bot + 34 * u;
        g.globalAlpha = k2;
        plate(g, F, cx - pw / 2, py, pw, ph, { alpha: 0.95, c: 9 * u, thin: true, lw: 2 * u, ph: i * 0.2 });
        say(g, F, label, cx, py + ph / 2 + 1 * u, 42 * u, { align: "center", base: "middle", weight: 600, color: hot ? F.acc : T.text, maxW: pw - 20 * u, min: 28 * u });
        g.globalAlpha = 1;
      }
    }
  }

  function icon(g, F, kind, cx, cy, s, t) {
    const { u, T } = F;
    pen(g, T.text, 4.2 * u);
    g.beginPath();
    if (kind === 0) { // scroll with writing
      g.moveTo(cx - s * 0.3, cy - s * 0.42); g.lineTo(cx + s * 0.1, cy - s * 0.42); g.lineTo(cx + s * 0.3, cy - s * 0.2); g.lineTo(cx + s * 0.3, cy + s * 0.42); g.lineTo(cx - s * 0.3, cy + s * 0.42); g.closePath();
      g.moveTo(cx + s * 0.1, cy - s * 0.42); g.lineTo(cx + s * 0.1, cy - s * 0.2); g.lineTo(cx + s * 0.3, cy - s * 0.2);
      for (let i = 0; i < 3; i++) { const w = i === 2 ? 0.2 : 0.38; g.moveTo(cx - s * 0.17, cy - s * 0.02 + i * s * 0.15); g.lineTo(cx - s * 0.17 + s * w * (0.6 + 0.4 * Math.sin(t * 2 + i)), cy - s * 0.02 + i * s * 0.15); }
    } else if (kind === 1) { // eight-point spark
      for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4 + t * 0.4, r1 = k % 2 ? s * 0.26 : s * 0.46; g.moveTo(cx + Math.cos(a) * s * 0.08, cy + Math.sin(a) * s * 0.08); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); }
      g.moveTo(cx, cy - s * 0.1); g.lineTo(cx + s * 0.1, cy); g.lineTo(cx, cy + s * 0.1); g.lineTo(cx - s * 0.1, cy); g.closePath();
    } else if (kind === 2) { // eye with rays
      g.moveTo(cx - s * 0.46, cy + s * 0.06); g.quadraticCurveTo(cx, cy - s * 0.42, cx + s * 0.46, cy + s * 0.06); g.quadraticCurveTo(cx, cy + s * 0.42, cx - s * 0.46, cy + s * 0.06);
      g.moveTo(cx + s * 0.13, cy + s * 0.06); g.arc(cx + Math.sin(t * 1.3) * s * 0.05, cy + s * 0.06, s * 0.13, 0, TAU);
      for (let k = -2; k <= 2; k++) { const a = -Math.PI / 2 + k * 0.4; g.moveTo(cx + Math.cos(a) * s * 0.5, cy + s * 0.06 + Math.sin(a) * s * 0.5); g.lineTo(cx + Math.cos(a) * s * 0.62, cy + s * 0.06 + Math.sin(a) * s * 0.62); }
    } else { // laurel seal with a check
      g.moveTo(cx - s * 0.22, cy + s * 0.02); g.lineTo(cx - s * 0.05, cy + s * 0.2); g.lineTo(cx + s * 0.26, cy - s * 0.16);
      for (const sg of [-1, 1]) for (let k = 0; k < 5; k++) { const a = Math.PI * (0.62 + k * 0.1), lx = cx + sg * Math.cos(a - Math.PI / 2 + 0.9) * 0 + sg * s * (0.46 - k * 0.025), ly = cy + s * 0.3 - k * s * 0.15; g.moveTo(lx, ly); g.lineTo(lx + sg * s * 0.1, ly - s * 0.08); }
    }
    g.stroke();
  }
  function medallion(g, F, cx, cy, R, rot, hot, active, label) {
    const { u, T, t } = F;
    g.save();
    // Spiked rim.
    g.fillStyle = hot ? foil(F, cx - R, cy - R, R * 2, R * 2, 0.1) : foil(F, cx - R, cy - R, R * 2, R * 2, cx * 0.002);
    rays(g, cx, cy, R * 0.86, R * 1.08, rot, rot + TAU, 36, 0.5);
    g.beginPath(); g.arc(cx, cy, R * 0.9, 0, TAU); g.fillStyle = `rgba(${T.plate},0.96)`; g.fill(); pen(g, foil(F, cx - R, cy - R, R * 2, R * 2, 0.2), 4 * u); g.stroke();
    // Inner rays and ring.
    g.save(); g.beginPath(); g.arc(cx, cy, R * 0.82, 0, TAU); g.clip();
    g.fillStyle = `rgba(${T.rays},${hot ? 0.34 : 0.2})`; rays(g, cx, cy, 0, R * 0.9, -rot * 1.5, -rot * 1.5 + TAU, 20, 0.5); g.restore();
    g.beginPath(); g.arc(cx, cy, R * 0.8, 0, TAU); pen(g, foil(F, cx - R, cy - R, R * 2, R * 2, 0.4), 1.6 * u); g.stroke();
    if (active > 0) { g.beginPath(); g.arc(cx, cy, R * (1.14 + 0.05 * Math.sin(t * 6)), 0, TAU); pen(g, `rgba(${T.glow},${0.6 * active})`, 3 * u); g.stroke(); }
    g.restore();
  }
  function drawProcess(F, box, p, d, info) {
    const { g, u, T, t, tall } = F;
    const n = d.steps.length;
    const vertical = tall || box.h > box.w;
    const R = vertical ? Math.min(box.h / n * 0.34, box.w * 0.2) : Math.min(box.h * 0.34, box.w / n * 0.3);
    const pos = (i) => vertical ? [box.x + R * 1.3, box.y + (box.h / n) * (i + 0.5)] : [box.x + (box.w / n) * (i + 0.5), box.y + box.h * 0.4];
    const act = Math.floor(t * 0.75) % n;
    for (let i = 0; i < n - 1; i++) { // rails first so medallions sit on them
      const q = ease(clamp((p - ((i + 0.55) / n) * 0.6) / 0.25)); if (q <= 0) continue;
      const [ax, ay] = pos(i), [bx, by] = pos(i + 1), dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
      const sx = ax + ux * R * 1.25, sy = ay + uy * R * 1.25, ex = bx - ux * R * 1.25, ey = by - uy * R * 1.25;
      for (const off of [-9 * u, 0, 9 * u]) {
        g.beginPath(); g.moveTo(sx + nx * off, sy + ny * off); g.lineTo(sx + (ex - sx) * q + nx * off, sy + (ey - sy) * q + ny * off);
        pen(g, foil(F, Math.min(sx, ex), Math.min(sy, ey), Math.abs(ex - sx) + 1, Math.abs(ey - sy) + 1, i * 0.2), (off ? 1.6 : 3.4) * u); g.stroke();
      }
      if (q > 0.95) for (let c = 0; c < 3; c++) { // stepped chevrons
        const cx = ex - ux * c * 16 * u, cy = ey - uy * c * 16 * u, s = 15 * u;
        g.beginPath(); g.moveTo(cx - ux * s + nx * s, cy - uy * s + ny * s); g.lineTo(cx, cy); g.lineTo(cx - ux * s - nx * s, cy - uy * s - ny * s); pen(g, foil(F, cx - s, cy - s, s * 2, s * 2, c * 0.1), 3.2 * u); g.stroke();
      }
      // Beads travel the rail without stopping.
      for (let b = 0; b < 3; b++) {
        const f = fract(t * 0.5 + b / 3 + i * 0.17), bxp = sx + (ex - sx) * f, byp = sy + (ey - sy) * f;
        g.globalAlpha = Math.sin(f * Math.PI) * q; diamond(g, bxp, byp, 7 * u, 10 * u); g.fillStyle = `rgb(${T.glow})`; g.fill(); g.globalAlpha = 1;
      }
    }
    for (let i = 0; i < n; i++) {
      const q = ease(clamp((p - (i / n) * 0.55) / 0.4));
      const [cx, cy] = pos(i), hot = i === n - 1, act2 = act === i ? 1 : 0;
      const rr = R * (0.6 + 0.4 * q);
      g.save(); g.globalAlpha = clamp(q * 2.5);
      medallion(g, F, cx, cy, rr, t * 0.22 * (i % 2 ? -1 : 1), hot, act2, "");
      icon(g, F, hot ? 3 : i % 3, cx, cy + 4 * u, rr * 1.1, t + i);
      // Numeral on a small plaque on the rim.
      const nx = cx - rr * 0.78, ny = cy - rr * 0.78;
      g.beginPath(); g.arc(nx, ny, 26 * u, 0, TAU); g.fillStyle = hot ? F.acc : foil(F, nx - 26 * u, ny - 26 * u, 52 * u, 52 * u, i * 0.2); g.fill(); pen(g, `rgba(${T.plate},0.9)`, 2.4 * u); g.stroke();
      say(g, F, ROMAN[i], nx, ny + 1 * u, 26 * u, { align: "center", base: "middle", color: T.lac, weight: 700, upper: false, track: 0.02 });
      g.restore();
      if (q > 0.5) {
        g.globalAlpha = ease((q - 0.5) / 0.5);
        const label = d.steps[i];
        if (vertical) say(g, F, label, cx + R * 1.45, cy + 2 * u, 54 * u, { base: "middle", weight: 600, color: hot ? F.acc : T.text, maxW: box.x + box.w - (cx + R * 1.45), min: 42 * u });
        else {
          const lw = Math.min(box.w / n * 0.94, textW(g, label, 46 * u, 600) + 50 * u);
          plate(g, F, cx - lw / 2, cy + R * 1.3, lw, 84 * u, { alpha: 0.94, c: 10 * u, thin: true, lw: 2 * u, ph: i * 0.2 });
          say(g, F, label, cx, cy + R * 1.3 + 43 * u, 46 * u, { align: "center", base: "middle", weight: 600, color: hot ? F.acc : T.text, maxW: lw - 24 * u, min: 42 * u });
        }
        g.globalAlpha = 1;
      }
    }
  }

  function bulbsAround(g, F, x, y, w, h, count, phase) {
    const per = 2 * (w + h);
    for (let i = 0; i < count; i++) {
      let d2 = (i / count) * per, bx, by;
      if (d2 < w) { bx = x + d2; by = y; } else if ((d2 -= w) < h) { bx = x + w; by = y + d2; } else if ((d2 -= h) < w) { bx = x + w - d2; by = y + h; } else { d2 -= w; bx = x; by = y + h - d2; }
      const on = Math.pow(0.5 + 0.5 * Math.sin(i * 0.7 - F.t * 5 + phase), 2);
      g.beginPath(); g.arc(bx, by, (3 + on * 2.5) * F.u, 0, TAU); g.fillStyle = `rgba(${F.T.glow},${0.25 + 0.75 * on})`; g.fill();
    }
  }
  function drawCompare(F, box, p, d, info) {
    const { g, u, T, t, tall } = F;
    const gap = 40 * u, cw = tall ? box.w : (box.w - gap) / 2, ch = tall ? (box.h - gap) / 2 : box.h * 0.96;
    const max = Math.max(d.leftValue, d.rightValue, 1);
    // Two searchlights sweep behind the cards through the whole hold.
    for (const [bx, ph] of [[F.W * 0.18, 0], [F.W * 0.82, 2.1]]) {
      const by = F.H + 20 * u, a = -Math.PI / 2 + Math.sin(t * 0.8 + ph) * 0.55, L = F.H * 1.25;
      const bg = g.createRadialGradient(bx, by, 0, bx, by, L); bg.addColorStop(0, `rgba(${T.glow},0.3)`); bg.addColorStop(1, `rgba(${T.glow},0)`);
      g.fillStyle = bg; g.beginPath(); g.moveTo(bx, by); g.arc(bx, by, L, a - 0.12, a + 0.12); g.closePath(); g.fill();
    }
    [[d.left, d.leftValue, false], [d.right, d.rightValue, true]].forEach(([label, value, hot], i) => {
      // Both frames stand complete from the first frame; the gauges fill in once they are up.
      const q = ease(clamp((info.local - 0.22 - i * 0.08) / 1.4)), gq = ease(span(info.local, 0.1, 0.38));
      const x = tall ? box.x : box.x + i * (cw + gap), y = tall ? box.y + i * (ch + gap) : box.y + (box.h - ch) / 2;
      g.save();
      plate(g, F, x, y, cw, ch, { alpha: 0.92, c: 18 * u, ph: i * 0.3 });
      // A slow sheen crosses each card for as long as it is held.
      g.save(); stepPath(g, x, y, cw, ch, 18 * u); g.clip();
      const sx = x - cw * 0.6 + fract(t * 0.28 + i * 0.5) * cw * 2.2, sg = g.createLinearGradient(sx - cw * 0.25, y, sx + cw * 0.25, y + ch * 0.3);
      sg.addColorStop(0, "rgba(255,255,255,0)"); sg.addColorStop(0.5, `rgba(${T.glow},0.13)`); sg.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = sg; g.fillRect(x, y, cw, ch); g.restore();
      g.globalAlpha = gq;
      bulbsAround(g, F, x + 20 * u, y + 20 * u, cw - 40 * u, ch - 40 * u, Math.floor((cw + ch) / (30 * u)), i * 1.7);
      // Label across the head of the card.
      say(g, F, label, x + cw / 2, y + 74 * u, 56 * u, { align: "center", weight: 600, color: hot ? F.acc : T.text, maxW: cw - 120 * u, min: 42 * u, base: "middle" });
      // Dial.
      const R = tall ? Math.min(ch * 0.4, cw * 0.28) : Math.min(cw * 0.34, ch * 0.4);
      const dx = tall ? x + R + 70 * u : x + cw / 2, dy = tall ? y + ch * 0.68 : y + 120 * u + R + 24 * u;
      const f = clamp(value / max) * q, a1 = Math.PI + Math.PI * f;
      g.save(); g.beginPath(); g.rect(x + 10 * u, y + 110 * u, cw - 20 * u, ch - 120 * u); g.clip();
      g.fillStyle = `rgba(${T.rays},${hot ? 0.32 : 0.2})`; g.beginPath(); g.rect(x, y + 100 * u, cw, dy - y - 100 * u); g.clip(); rays(g, dx, dy, 0, R * 1.0, t * (hot ? 0.45 : -0.32), t * (hot ? 0.45 : -0.32) + TAU, 24, 0.5);
      g.restore();
      g.beginPath(); g.arc(dx, dy, R, Math.PI, TAU); pen(g, T.jadeD, 34 * u); g.stroke();
      g.beginPath(); g.arc(dx, dy, R, Math.PI, TAU); pen(g, `rgba(${T.ink},0.22)`, 2 * u); g.lineWidth = 36 * u; g.stroke();
      if (f > 0.002) {
        g.beginPath(); g.arc(dx, dy, R, Math.PI, a1); pen(g, hot ? foil(F, dx - R, dy - R, R * 2, R, i * 0.3) : "#2c8f7b", 30 * u); g.stroke();
        // A spark runs up the filled arc again and again.
        const ca = Math.PI + (a1 - Math.PI) * fract(t * 0.45 + i * 0.5), cxp = dx + Math.cos(ca) * R, cyp = dy + Math.sin(ca) * R;
        g.save(); g.shadowColor = `rgb(${T.glow})`; g.shadowBlur = 22 * u; star4(g, cxp, cyp, 24 * u); g.fillStyle = `rgba(${T.glow},0.95)`; g.fill(); g.restore();
      }
      // Ticks, with a glint chasing along them.
      for (let k = 0; k <= 30; k++) {
        const a = Math.PI + (Math.PI * k) / 30, major = k % 5 === 0, glint = Math.pow(Math.max(0, Math.sin(t * 3 - k * 0.45)), 6);
        const r0 = R + 24 * u, r1 = R + (major ? 50 : 38) * u;
        g.beginPath(); g.moveTo(dx + Math.cos(a) * r0, dy + Math.sin(a) * r0); g.lineTo(dx + Math.cos(a) * r1, dy + Math.sin(a) * r1);
        pen(g, glint > 0.3 ? `rgb(${T.glow})` : foil(F, dx - R, dy - R, R * 2, R, 0.2), (major ? 3.4 : 2) * u); g.stroke();
      }
      // Needle trembles around its reading.
      const na = a1 + (Math.sin(t * 1.6 + i) * 0.035 + Math.sin(t * 5.1 + i) * 0.008) * q;
      g.beginPath(); g.moveTo(dx - Math.cos(na) * 24 * u, dy - Math.sin(na) * 24 * u); g.lineTo(dx + Math.cos(na) * (R - 10 * u), dy + Math.sin(na) * (R - 10 * u));
      pen(g, hot ? F.acc : T.text, 6 * u); g.stroke();
      g.beginPath(); g.arc(dx, dy, 22 * u, 0, TAU); g.fillStyle = foil(F, dx - 22 * u, dy - 22 * u, 44 * u, 44 * u, i * 0.2); g.fill(); pen(g, `rgba(${T.plate},1)`, 3 * u); g.stroke();
      const rp = fract(t * 0.7 + i * 0.5);
      g.beginPath(); g.arc(dx, dy, 26 * u + rp * 70 * u, Math.PI, TAU); pen(g, `rgba(${T.glow},${0.6 * (1 - rp)})`, 3 * u); g.stroke();
      // The figure itself.
      const size = Math.min(170 * u, tall ? ch * 0.3 : (ch - 120 * u - R - 24 * u) * 0.75);
      const fx = tall ? x + cw * 0.74 : dx, fy = tall ? dy - 20 * u : dy + 40 * u + size * 0.55;
      const s = num(value * q, 0, d.prefix, d.suffix);
      const beat = hot ? 1 + 0.04 * Math.sin(t * 3.2) : 1;
      g.globalAlpha = gq * clamp(q * 4);
      say(g, F, s, fx, fy, Math.max(96 * u, size) * beat, { align: "center", base: "middle", weight: 600, track: 0.03, color: hot ? F.acc : T.text, upper: false, glow: hot ? F.acc : null, maxW: tall ? cw * 0.36 : cw - 80 * u, min: 96 * u });
      g.restore();
    });
  }

  // ---- the look --------------------------------------------------------------------------------------
  let grainTile = null;
  const halo = () => "none";
  return {
    bg: "#0a0c0d", panel: "rgba(10,13,13,0.9)", ink: "#f6ebc6", muted: "#cfb878", accent: "#e8b94e", onAccent: "#0a0c0d",
    rule: "rgba(232,188,92,0.8)", track: "rgba(232,188,92,0.12)",
    display: FACE, displayWeight: 500, displayCase: "uppercase", displayTracking: "0.09em",
    body: FACE, bodyWeight: 500, figures: FACE, radius: 0, motion: "wipe", change: "fade", kit: { line: 3, fill: "solid" },
    panelEdge: "rgba(232,188,92,0.7)",
    tone: TONE,
    keepArt: true, overlap: true,
    css: () => `.scene .display, .scene .kicker { text-align: center; } .scene .display { text-shadow: 0 0 22px rgba(232,188,92,0.35) !important; } .kicker { text-shadow: none !important; letter-spacing: 0.3em; } .scene h2 { width: 100%; }`,
    palettes: {
      // Ivory deco: black lacquer objects and deeper gold on cream stock.
      light: { bg: "#efe4c9", panel: "rgba(10,13,13,0.9)", ink: "#f6ebc6", muted: "#6b4f17", accent: "#c78a12", onAccent: "#0a0c0d", rule: "rgba(111,79,23,0.8)", track: "rgba(111,79,23,0.15)",
        backdrop: () => "#efe4c9",
        tone: { ...TONE, lac: "#efe4c9", lac2: "#e3d3ab", gold: ["#5e4010", "#b58122", "#f7dc8c"], rays: "170,120,30", glow: "255,214,120", plate: "12,14,14", vign: 0.2 } },
      dark: { bg: "#050607", backdrop: () => "#050607", tone: { ...TONE, lac: "#050607", lac2: "#0b1211", vign: 0.8 } },
      mono: { bg: "#0b0b0c", ink: "#f2f2f0", muted: "#b8b8b4", accent: "#e8e8e4", rule: "rgba(220,220,214,0.8)", panelEdge: "rgba(220,220,214,0.7)", backdrop: () => "#0b0b0c",
        tone: { ...TONE, lac: "#0b0b0c", lac2: "#161617", jade: "#3a3a3d", jadeD: "#1a1a1c", text: "#f2f2f0", sub: "#bdbdb8", gold: ["#5d5d60", "#b4b4b6", "#fcfcfa"], rays: "210,210,206", glow: "240,240,236", ink: "242,242,240" } },
    },
    textShadow: halo,
    backdrop: (accent, texture, look) => (look && look.bg) || "#0a0c0d",
    // The world is drawn by the stage; this pass only marks the backdrop as on.
    paint: (ctx, W, H) => { ctx.clearRect(0, 0, W, H); },
    stage(ctx, S, info) {
      const F = mk(ctx, S, info);
      const g = ctx, id = info.scene || "title";
      g.save();
      backdrop(g, F, id);
      chrome(g, F);
      if (id === "title") titleSet(g, F, 0.18 + 0.82 * span(info.local, 0, 1.8), info.local);
      else if (id === "closing") closingSet(g, F, span(info.local, 0, 1.5), info.local);
      headPlate(g, F);
      // Lacquer vignette and fine grain, scaled by texture.
      if (S.paint) {
        const { W, H } = F, v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
        v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, `rgba(0,0,0,${F.T.vign * F.tex * 0.6})`);
        g.fillStyle = v; g.fillRect(0, 0, W, H);
      }
      if (S.paint && F.tex > 0) {
        const { W, H } = F;
        if (!grainTile) {
          grainTile = document.createElement("canvas"); grainTile.width = grainTile.height = 256;
          const gc = grainTile.getContext("2d"), im = gc.createImageData(256, 256), r = rng(51);
          for (let i = 0; i < 256 * 256; i++) { const v = r() < 0.5 ? 255 : 0, a = r() < 0.35 ? r() * 40 : 0; im.data.set([v, v, v, a], i * 4); }
          gc.putImageData(im, 0, 0);
        }
        g.globalAlpha = F.tex; g.fillStyle = g.createPattern(grainTile, "repeat"); g.fillRect(0, 0, W, H); g.globalAlpha = 1;
      }
      g.restore();
    },
    scenes: { title: titleExit, chart: scene("chart", drawChart), object: scene("object", drawObject), people: scene("people", drawPeople), process: scene("process", drawProcess), compare: scene("compare", drawCompare) },
  };
});
