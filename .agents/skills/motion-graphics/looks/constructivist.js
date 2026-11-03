// Constructivist: a two-ink agitprop poster printed by stone lithograph on cream stock. Red and black
// overprint (multiply), shapes are blunt geometry on hard diagonals, type is slanted condensed capitals
// on black plates, and every figure is built from wedges, bars, discs and halftone dots. The world under
// the scenes never stops: a fan of rays turns, a red disc breathes inside a ticking dial, chevron belts
// march along the bars and a ticker strip runs the bottom edge. Scenes land as cut sheets on that world,
// and scenes change behind a red cover slab that sweeps across the frame (its leading edge closes the old
// scene, its trailing edge opens the new one). Texture is a litho finish: ink dropout, dust, folds, burn.
// All drawings are original. Frames are pure functions of time.
window.DreamcutMotion.register("constructivist", ({ grain, smudge, rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const inout = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const FONT = "Impact, 'Haettenschweiler', 'Arial Narrow Bold', 'Avenir Next Condensed', 'Arial Narrow', sans-serif";
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];

  // The scenes that are on, in order. Read from the render's controls so a scene can know its neighbours.
  function shownList() {
    const c = (window.__dreamcut && window.__dreamcut.controls) || {};
    return ORDER.filter((id) => { const h = c[id + "_hold"]; return h === undefined || h > 0; });
  }
  function view(g, S, t) {
    const L = S.look;
    return { g, S, W: S.W, H: S.H, u: S.u, U: Math.min(S.W, S.H), t, ink: L.ink, paper: L.bg, acc: S.accent, mute: L.muted, onAcc: L.onAccent, over: Boolean(L.overprint), tall: S.tall };
  }

  // ---- small shapes ----------------------------------------------------------------------------------
  const poly = (g, pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
  function star(g, cx, cy, R, r, n, rot) {
    g.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = rot + (i * Math.PI) / n - Math.PI / 2, rr = i % 2 ? r : R;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath();
  }
  // A gear outline; fill it with "evenodd" to keep the hole.
  function gear(g, cx, cy, R, teeth, rot, hole) {
    g.beginPath();
    const k = [0.76, 1, 1, 0.76];
    for (let i = 0; i < teeth * 4; i++) {
      const a = rot + (i / (teeth * 4)) * TAU, rr = R * k[i % 4];
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath();
    if (hole) { g.moveTo(cx + hole, cy); g.arc(cx, cy, hole, 0, TAU); }
  }
  // Chevrons marching through a rectangle (dir 1 points right, -1 left).
  function chev(g, x, y, w, h, t, color, speed, gap, lw, dir = 1) {
    if (w <= 0 || h <= 0) return;
    g.save();
    g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.strokeStyle = color; g.lineWidth = lw; g.lineJoin = "miter"; g.lineCap = "butt"; g.setLineDash([]);
    const off = (((t * speed * dir) % gap) + gap) % gap;
    g.beginPath();
    for (let cx = x - gap * 2 + off; cx < x + w + gap; cx += gap) {
      g.moveTo(cx, y - lw); g.lineTo(cx + dir * h * 0.5, y + h / 2); g.lineTo(cx, y + h + lw);
    }
    g.stroke();
    g.restore();
  }
  function chevUp(g, x, y, w, h, t, color, speed, gap, lw) {
    g.save(); g.translate(x + w / 2, y + h / 2); g.rotate(-Math.PI / 2);
    chev(g, -h / 2, -w / 2, h, w, t, color, speed, gap, lw, 1);
    g.restore();
  }
  // A halftone screen: dot size follows fn(x, y) in 0..1.
  function dots(g, x, y, w, h, step, color, fn) {
    g.fillStyle = color; g.beginPath();
    for (let r = 0; r * step * 0.866 < h; r++) for (let c = 0; c * step < w; c++) {
      const px = x + (c + (r & 1 ? 0.5 : 0)) * step, py = y + r * step * 0.866;
      const rad = step * 0.54 * clamp(fn(px, py));
      if (rad > 0.8) { g.moveTo(px + rad, py); g.arc(px, py, rad, 0, TAU); }
    }
    g.fill();
  }

  // ---- lettering --------------------------------------------------------------------------------------
  function setFont(g, size, track = 0.03) { g.font = `${size}px ${FONT}`; g.letterSpacing = track * size + "px"; }
  function tx(g, s, x, y, size, color, o = {}) {
    setFont(g, size, o.track ?? 0.03);
    g.fillStyle = color; g.textAlign = o.align || "left"; g.textBaseline = o.base || "middle";
    g.fillText(String(s ?? "").toUpperCase(), x, y);
    g.letterSpacing = "0px";
  }
  // A black plate with slanted capitals; wraps to two lines before it shrinks; reveals left to right.
  function plate(g, V, s, x, y, size, o = {}) {
    const q = o.q ?? 1;
    s = String(s ?? "").toUpperCase();
    if (q <= 0.001 || !s) return null;
    let lines = [s], sz = size;
    const maxW = o.maxW || 1e9;
    setFont(g, sz);
    let tw = g.measureText(s).width;
    if (tw > maxW) {
      const sp = s.split(" ");
      if (sp.length > 1) {
        let best = null;
        for (let i = 1; i < sp.length; i++) {
          const a = sp.slice(0, i).join(" "), b = sp.slice(i).join(" ");
          const m = Math.max(g.measureText(a).width, g.measureText(b).width);
          if (!best || m < best.m) best = { a, b, m };
        }
        lines = [best.a, best.b]; tw = best.m;
      }
      if (tw > maxW) {
        sz = Math.max(o.min || size * 0.9, (size * maxW) / tw); setFont(g, sz);
        tw = Math.max(...lines.map((l) => g.measureText(l).width));
      }
    }
    const padX = sz * 0.34, lh = sz * 1.02, h = lh * lines.length + sz * 0.2, w = tw + padX * 2;
    const ax = o.align === "center" ? -w / 2 : o.align === "right" ? -w : 0;
    const bg = o.bg ?? V.ink, fg = o.fg ?? V.paper;
    g.save();
    g.translate(x, y); g.rotate(o.angle ?? -0.045);
    g.beginPath(); g.rect(ax - sz * 0.3, -h, (w + sz * 0.6) * q, h * 2); g.clip();
    if (!o.noShadow) { g.fillStyle = o.shadow ?? (bg === V.acc ? V.ink : V.acc); g.fillRect(ax + sz * 0.09, -h / 2 + sz * 0.09, w, h); }
    g.fillStyle = bg; g.fillRect(ax, -h / 2, w, h);
    g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle"; setFont(g, sz);
    lines.forEach((l, i) => g.fillText(l, ax + w / 2, -h / 2 + sz * 0.1 + lh * (i + 0.5) + sz * 0.04));
    g.letterSpacing = "0px";
    g.restore();
    return { w, h, sz };
  }

  // A cut sheet laid on the poster: a skewed card with a hard offset shadow, tape and ruled lines.
  function card(g, V, box, p, kind) {
    const q = ease(p * 2.6);
    if (q <= 0.001) return;
    const { u } = V, s = (kind === "L" ? -1 : 1) * Math.min(box.h * 0.05, 46 * u);
    const { x, y, w, h } = box;
    const pts = s > 0 ? [[x + s, y], [x + w, y], [x + w - s, y + h], [x, y + h]] : [[x, y], [x + w + s, y], [x + w, y + h], [x - s, y + h]];
    g.save();
    g.beginPath(); g.rect(x - 60 * u, y - 60 * u, (w + 120 * u) * q, h + 120 * u); g.clip();
    g.translate(16 * u, 16 * u); poly(g, pts); g.fillStyle = V.ink; g.fill(); g.translate(-16 * u, -16 * u);
    poly(g, pts); g.fillStyle = V.paper; g.fill();
    // Ruled guides and a fine frame.
    g.save(); poly(g, pts); g.clip();
    g.strokeStyle = V.mute; g.globalAlpha = 0.3; g.lineWidth = 2 * u;
    g.beginPath();
    for (let k = 1; k < 6; k++) { const gy = y + (h * k) / 6; g.moveTo(x - 10, gy); g.lineTo(x + w + 10, gy); }
    g.stroke();
    g.restore();
    poly(g, pts); g.strokeStyle = V.ink; g.lineWidth = 4 * u; g.stroke();
    // Tape.
    g.save(); g.translate(pts[0][0] + 20 * u, pts[0][1] - 4 * u); g.rotate(-0.5);
    g.fillStyle = V.acc; g.fillRect(-60 * u, -17 * u, 120 * u, 34 * u); g.restore();
    g.restore();
  }

  // Faint rays and a pale disc inside a card, turning slowly, so an unfilled corner is never blank.
  function cardArt(g, V, box, t, corner) {
    const { u } = V, kx = corner.includes("r") ? 1 : 0, ky = corner.includes("b") ? 1 : 0;
    const ox = box.x + box.w * kx, oy = box.y + box.h * ky, R = Math.hypot(box.w, box.h);
    g.save(); g.beginPath(); g.rect(box.x, box.y, box.w, box.h); g.clip();
    g.globalAlpha = 0.2; g.fillStyle = V.acc; g.beginPath(); g.arc(ox, oy, box.h * 0.42 * (1 + 0.03 * Math.sin(t * 1.4)), 0, TAU); g.fill();
    g.globalAlpha = 0.5; g.strokeStyle = V.mute; g.lineWidth = 3 * u; g.beginPath();
    const base = kx ? (ky ? Math.PI : Math.PI * 0.5) : ky ? -Math.PI * 0.5 : 0;
    for (let i = 0; i < 20; i++) { const a = base + (i / 19) * (Math.PI / 2) + Math.sin(t * 0.5) * 0.05; g.moveTo(ox, oy); g.lineTo(ox + Math.cos(a) * R, oy + Math.sin(a) * R); }
    g.stroke();
    g.restore();
  }

  // ---- the poster underneath every scene -------------------------------------------------------------
  // Per scene: where the disc, the fan of rays, the bars and the stars sit (fractions of the frame).
  const COMP = {
    title: { disc: [0.8, 0.4, 0.34], fan: [0.8, 0.4, 0.58, 1.46, 15], bars: [[-0.38, 0.36, 0.08, "ink", 1], [-0.38, 0.47, 0.022, "acc"], [-0.38, -0.42, 0.055, "acc", 1]], stars: [[0.1, 0.84, 0.13, "acc"], [0.93, 0.1, 0.06, "ink"]], ht: [0, 0, 0.36, 0.42] },
    chart: { disc: [0.9, 0.1, 0.22], fan: [0.9, 0.1, 0.52, 0.98, 10], bars: [[0.52, 0.34, 0.06, "ink", 1], [0.52, 0.43, 0.018, "acc"]], stars: [[0.05, 0.92, 0.08, "acc"]], ht: [0.5, 0.0, 0.32, 0.2] },
    object: { disc: [0.1, 0.94, 0.28], fan: [0.1, 0.94, 1.52, 1.97, 11], bars: [[-0.5, -0.36, 0.05, "acc", 1], [-0.5, -0.28, 0.02, "ink"]], stars: [[0.92, 0.12, 0.08, "ink"]], ht: [0.62, 0.0, 0.36, 0.26] },
    people: { disc: [0.92, 0.9, 0.26], fan: [0.92, 0.9, 1.05, 1.5, 10], bars: [[0.36, -0.4, 0.06, "ink", 1], [0.36, -0.31, 0.02, "acc"]], stars: [[0.07, 0.1, 0.07, "acc"]], ht: [0.0, 0.6, 0.3, 0.4] },
    process: { disc: [0.62, 0.02, 0.2], fan: [0.62, 0.02, 0.28, 0.78, 10], bars: [[0.1, 0.42, 0.055, "ink", 1], [0.1, 0.34, 0.02, "acc"]], stars: [[0.95, 0.9, 0.09, "acc"], [0.05, 0.1, 0.05, "ink"]], ht: [0.68, 0.5, 0.3, 0.4] },
    compare: { disc: [0.5, 0.38, 0.3], fan: [0.5, 0.38, 0, 6.2832, 26], bars: [[-0.3, 0.44, 0.05, "ink", 1], [-0.3, -0.45, 0.04, "acc", 1]], stars: [[0.06, 0.1, 0.07, "acc"], [0.94, 0.1, 0.07, "acc"]], ht: [0.0, 0.0, 0.3, 0.3] },
    closing: { disc: [0.5, 1.02, 0.56], fan: [0.5, 1.02, 3.1416, 6.2832, 19], bars: [[0.0, -0.42, 0.05, "ink", 1], [0.0, -0.33, 0.016, "acc"]], stars: [[0.1, 0.16, 0.12, "acc"], [0.9, 0.16, 0.12, "acc"], [0.5, 0.1, 0.06, "ink"]], ht: [0.0, 0.5, 0.26, 0.5] },
  };

  function world(V, id, t) {
    const { g, W, H, u, U } = V;
    const C = COMP[id] || COMP.chart;
    const col = (c) => (c === "acc" ? V.acc : V.ink);
    g.save();
    if (V.over) g.globalCompositeOperation = "multiply";
    // Halftone patch: a photomontage screen whose dots swell and shrink in travelling waves.
    {
      const [fx, fy, fw, fh] = C.ht, x = fx * W, y = fy * H, w = fw * W, h = fh * H;
      g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.globalAlpha = 0.9;
      dots(g, x, y, w, h, 22 * u, V.ink, (px, py) => {
        const gx = (px - x) / w, gy = (py - y) / h;
        return (0.12 + 0.88 * Math.abs(gx - 0.5 + (gy - 0.5) * 0.4) * 1.6) * (0.55 + 0.45 * Math.sin(px * 0.012 + py * 0.009 - t * 1.6));
      });
      g.restore();
    }
    // Fan of rays: thin and fat wedges in two inks, turning slowly and breathing.
    {
      const [fx, fy, a0, a1, n] = C.fan, ox = fx * W, oy = fy * H, R = Math.hypot(W, H) * 1.3;
      const sweep = Math.sin(t * 0.42) * 0.09 * Math.min(1, a1 - a0);
      const full = a1 - a0 > 6;
      for (let i = 0; i < n; i++) {
        const base = a0 + ((a1 - a0) * (i + 0.5)) / n + sweep + (full ? t * 0.1 : 0);
        const wid = ((a1 - a0) / n) * (0.26 + 0.2 * (0.5 + 0.5 * Math.sin(t * 1.15 + i * 2.3))) * (i % 2 ? 0.7 : 1);
        g.fillStyle = i % 2 ? V.acc : V.ink;
        g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + Math.cos(base - wid) * R, oy + Math.sin(base - wid) * R); g.lineTo(ox + Math.cos(base + wid) * R, oy + Math.sin(base + wid) * R); g.closePath(); g.fill();
      }
    }
    // Diagonal bars with chevron belts.
    C.bars.forEach(([ang, off, th, c, belt], i) => {
      const nx = -Math.sin(ang), ny = Math.cos(ang), o = (off + Math.sin(t * 0.6 + i * 2) * 0.012) * H;
      const T = th * H * (1 + 0.1 * Math.sin(t * 1.3 + i)), L = Math.hypot(W, H);
      g.save(); g.translate(W / 2 + nx * o, H / 2 + ny * o); g.rotate(ang);
      g.fillStyle = col(c); g.fillRect(-L, -T / 2, L * 2, T);
      if (belt) chev(g, -L, -T / 2, L * 2, T, t, c === "acc" ? V.ink : V.paper, 150 * u * (i % 2 ? -1 : 1), T * 0.95, Math.max(3 * u, T * 0.13), 1);
      g.restore();
    });
    // Disc with a radar wedge, inner rings and a ticking dial.
    {
      const [dx, dy, dr] = C.disc;
      const cx = dx * W + Math.cos(t * 0.5) * 0.012 * U, cy = dy * H + Math.sin(t * 0.43) * 0.012 * U;
      const r = dr * U * (1 + 0.025 * Math.sin(t * 1.6));
      g.fillStyle = V.acc; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
      g.save(); g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.clip();
      const wa = t * 0.9;
      g.fillStyle = V.ink; g.globalAlpha = 0.92;
      g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r, wa, wa + 0.24); g.closePath(); g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = V.paper; g.lineWidth = 4 * u; g.globalAlpha = 0.75;
      g.beginPath(); g.arc(cx, cy, r * 0.62, 0, TAU); g.moveTo(cx + r * 0.3, cy); g.arc(cx, cy, r * 0.3, 0, TAU); g.stroke();
      g.restore();
      g.strokeStyle = V.ink; g.lineWidth = 3 * u; g.beginPath();
      const ticks = 72, rot = t * 0.35;
      for (let i = 0; i < ticks; i++) {
        const a = rot + (i / ticks) * TAU, r0 = r * 1.07, r1 = r * (i % 6 ? 1.13 : 1.22);
        g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      }
      g.stroke();
      g.save(); g.strokeStyle = V.ink; g.globalAlpha = 0.6; g.lineWidth = 2.5 * u; g.setLineDash([16 * u, 11 * u]); g.lineDashOffset = -t * 34 * u;
      g.beginPath(); g.arc(cx, cy, r * 1.5, 0, TAU); g.stroke(); g.restore();
    }
    // Stars.
    C.stars.forEach(([sx, sy, sr, c], i) => {
      const R = sr * U * (1 + 0.08 * Math.sin(t * 2 + i));
      star(g, sx * W, sy * H, R, R * 0.42, 5, t * 0.5 * (i % 2 ? -1 : 1)); g.fillStyle = col(c); g.fill();
      star(g, sx * W, sy * H, R * 0.55, R * 0.23, 5, t * 0.5 * (i % 2 ? -1 : 1)); g.strokeStyle = V.paper; g.lineWidth = 3 * u; g.stroke();
    });
    // Flying wedges.
    {
      const r = rng(58);
      for (let i = 0; i < 10; i++) {
        const x0 = r() * W, y0 = r() * H, sp = (30 + r() * 70) * u, sz = (14 + r() * 24) * u, rot0 = r() * TAU;
        const x = (((x0 + t * sp) % (W + 80 * u)) + W + 80 * u) % (W + 80 * u) - 40 * u, y = y0 + Math.sin(t * 0.7 + i) * 14 * u;
        g.save(); g.translate(x, y); g.rotate(rot0 + t * 0.9 * (i % 2 ? 1 : -1));
        g.beginPath(); g.moveTo(-sz, sz * 0.7); g.lineTo(sz, sz * 0.7); g.lineTo(0, -sz); g.closePath();
        g.fillStyle = i % 3 ? V.ink : V.acc; g.fill(); g.restore();
      }
    }
    // Ticker strips: red squares along the top, a chevron belt along the bottom.
    g.fillStyle = V.ink; g.fillRect(0, 0, W, 22 * u);
    g.fillStyle = V.acc;
    for (let x = ((t * 90 * u) % (40 * u)) - 40 * u; x < W; x += 40 * u) g.fillRect(x, 5 * u, 12 * u, 12 * u);
    g.fillStyle = V.ink; g.fillRect(0, H - 58 * u, W, 58 * u);
    chev(g, 0, H - 52 * u, W, 46 * u, t, V.acc, 130 * u, 46 * u, 7 * u, 1);
    g.fillStyle = V.paper; g.fillRect(0, H - 58 * u, W, 4 * u);
    g.restore();
  }

  // ---- scene change: a cover slab that sweeps across ------------------------------------------------
  // e runs 0..1 as the slab's edge crosses the frame. Odd changes sweep the other way.
  const flipOf = (k) => k % 2 === 1;
  function edgeCx(V, e) { const slope = V.H * 0.35; return lerp(-slope / 2 - 100, V.W + slope / 2 + 100, e); }
  function sidePoly(V, e, k, side) {
    const { W, H } = V, slope = H * 0.35, cx = edgeCx(V, e), y0 = -60, y1 = H + 60;
    const xa = cx + (y0 / H - 0.5) * slope, xb = cx + (y1 / H - 0.5) * slope, far = side === "L" ? -W : W * 2;
    const pts = [[far, y0], [xa, y0], [xb, y1], [far, y1]];
    return flipOf(k) ? pts.map(([x, y]) => [W - x, y]) : pts;
  }
  function stripPoly(V, e, k, coverIsLeft, o1, o2) {
    const { W, H } = V, slope = H * 0.35, cx = edgeCx(V, e), y0 = -60, y1 = H + 60, s = coverIsLeft ? -1 : 1;
    const xa = cx + (y0 / H - 0.5) * slope, xb = cx + (y1 / H - 0.5) * slope;
    const pts = [[xa + s * o1, y0], [xa + s * o2, y0], [xb + s * o2, y1], [xb + s * o1, y1]];
    return flipOf(k) ? pts.map(([x, y]) => [W - x, y]) : pts;
  }
  function drawCover(V, cv) {
    const { g, W, H, u, U, t } = V, { e, k, mode } = cv;
    const coverIsLeft = mode === "pre";
    g.save();
    g.globalCompositeOperation = "source-over";
    poly(g, sidePoly(V, e, k, coverIsLeft ? "L" : "R")); g.clip();
    g.fillStyle = V.acc; g.fillRect(0, 0, W, H);
    const v = k % 3, cx = W * 0.5, cy = H * 0.5;
    if (v === 0) { // burst
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * TAU + t * 0.8, w = 0.07 + 0.03 * Math.sin(t * 3 + i);
        g.fillStyle = V.ink; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a - w) * W, cy + Math.sin(a - w) * W); g.lineTo(cx + Math.cos(a + w) * W, cy + Math.sin(a + w) * W); g.closePath(); g.fill();
      }
      g.fillStyle = V.paper; g.beginPath(); g.arc(cx, cy, 0.24 * U, 0, TAU); g.fill();
      star(g, cx, cy, 0.2 * U, 0.08 * U, 5, -t * 1.4); g.fillStyle = V.ink; g.fill();
    } else if (v === 1) { // belts
      const n = 7, bh = H / n;
      for (let i = 0; i < n; i += 2) {
        g.fillStyle = V.ink; g.fillRect(0, i * bh + bh * 0.1, W, bh * 0.8);
        chev(g, 0, i * bh + bh * 0.2, W, bh * 0.6, t, V.paper, 320 * u, bh * 0.7, 9 * u, i % 4 ? -1 : 1);
      }
      star(g, cx, cy, 0.3 * U, 0.12 * U, 5, t * 1.2); g.fillStyle = V.paper; g.fill();
      star(g, cx, cy, 0.17 * U, 0.07 * U, 5, t * 1.2); g.fillStyle = V.ink; g.fill();
    } else { // slashes
      g.save(); g.translate(cx, cy); g.rotate(-0.55);
      const period = 0.34 * H, off = (t * 260 * u) % period;
      for (let x = -W * 1.2 - period + off; x < W * 1.2; x += period) { g.fillStyle = V.ink; g.fillRect(x, -H * 1.4, period * 0.45, H * 2.8); g.fillStyle = V.paper; g.fillRect(x + period * 0.45, -H * 1.4, period * 0.07, H * 2.8); }
      g.restore();
      g.fillStyle = V.acc; g.beginPath(); g.arc(cx, cy, 0.22 * U, 0, TAU); g.fill();
      g.strokeStyle = V.ink; g.lineWidth = 12 * u; g.stroke();
      tx(g, "★", cx, cy + 6 * u, 0.2 * U, V.ink, { align: "center" });
    }
    // Edge: black stripe, paper hairline, then red.
    poly(g, stripPoly(V, e, k, coverIsLeft, 0, 34 * u)); g.fillStyle = V.ink; g.fill();
    poly(g, stripPoly(V, e, k, coverIsLeft, 34 * u, 44 * u)); g.fillStyle = V.paper; g.fill();
    poly(g, stripPoly(V, e, k, coverIsLeft, 44 * u, 98 * u)); g.fillStyle = V.acc; g.fill();
    poly(g, stripPoly(V, e, k, coverIsLeft, 98 * u, 112 * u)); g.fillStyle = V.ink; g.fill();
    g.restore();
  }
  function coverState(info, list) {
    if (!info.scene || list[info.index] !== info.scene) return null;
    if (info.next && info.local > info.hold - info.change) return { mode: "pre", e: inout((info.local - (info.hold - info.change)) / info.change), k: info.index + 1 };
    if (info.index > 0 && info.local < info.change) return { mode: "post", e: inout(info.local / info.change), k: info.index };
    return null;
  }

  // ---- scenes ------------------------------------------------------------------------------------------
  const fmt = (v, d) => window.DreamcutMotion.formatNumber(v, 0, d.prefix, d.suffix);

  function drawChart(g, V, box, p, d, info) {
    const { u } = V, t = info.t, n = d.values.length;
    card(g, V, box, p, "R");
    if (p > 0.1) cardArt(g, V, box, t, "bl");
    const pad = 34 * u, labelH = 58 * u;
    const ax = box.x + pad + 10 * u, aw = box.w - pad * 2 - 20 * u;
    const base = box.y + box.h - pad - labelH - 6 * u, topY = box.y + pad + 122 * u, maxH = base - topY;
    const mx = Math.max(...d.values, 1), slot = aw / n, bw = slot * 0.6;
    g.save(); g.strokeStyle = V.mute; g.globalAlpha = 0.4; g.lineWidth = 2 * u; g.beginPath();
    for (let k = 1; k <= 4; k++) { const y = base - (maxH * k) / 4; g.moveTo(ax, y); g.lineTo(ax + aw * ease(p * 1.5), y); }
    g.stroke(); g.restore();
    // A dashed target line at the lead bar's height, its dashes flowing.
    const hotV = d.values[d.highlight] ?? mx;
    if (p > 0.5) {
      g.save(); g.strokeStyle = V.acc; g.lineWidth = 6 * u; g.setLineDash([22 * u, 14 * u]); g.lineDashOffset = -t * 70 * u;
      const ty = base - maxH * (hotV / mx); g.beginPath(); g.moveTo(ax, ty); g.lineTo(ax + aw * ease((p - 0.5) * 2), ty); g.stroke(); g.restore();
    }
    for (let i = 0; i < n; i++) {
      const q = ease(span(p, i * 0.1, i * 0.1 + 0.55)), hot = i === d.highlight;
      const h = maxH * (d.values[i] / mx) * q, x = ax + slot * i + (slot - bw) / 2, sl = bw * 0.2;
      if (h > 3 * u) {
        const pts = [[x, base], [x, base - h + sl], [x + bw, base - h], [x + bw, base]];
        g.save(); poly(g, pts); g.fillStyle = hot ? V.acc : V.ink; g.fill(); g.clip();
        chevUp(g, x, base - h - sl, bw, h + sl + 4, t, hot ? V.ink : V.paper, 90 * u, bw * 0.5, Math.max(4 * u, bw * 0.06));
        g.fillStyle = V.ink; g.globalAlpha = hot ? 0.9 : 0.0; g.fillRect(x + bw - 10 * u, base - h - sl, 10 * u, h + sl);
        g.restore();
        poly(g, pts); g.strokeStyle = V.ink; g.lineWidth = 4 * u; g.stroke();
      }
      if (hot && q > 0.8) { // a pennant on the lead bar, waving
        const px = x + bw, py = base - h, ph = 84 * u, w = (0.5 + 0.5 * Math.sin(t * 5)) * 10 * u;
        g.strokeStyle = V.ink; g.lineWidth = 5 * u; g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - ph); g.stroke();
        g.fillStyle = V.acc; g.beginPath(); g.moveTo(px, py - ph); g.lineTo(px + 72 * u, py - ph + 22 * u + w * 0.6); g.lineTo(px, py - ph + 46 * u); g.closePath(); g.fill();
        g.strokeStyle = V.ink; g.lineWidth = 4 * u; g.stroke();
      }
      if (q > 0.12) {
        const txt = fmt(d.values[i] * q, d), size = clamp((slot * 0.95) / (txt.length * 0.5), 96 * u, 128 * u);
        g.save(); g.translate(x + bw / 2, base - h - sl * 0.5 - size * 0.55); g.rotate(-0.04);
        tx(g, txt, 5 * u, 5 * u, size, hot ? V.ink : V.acc, { align: "center" }); tx(g, txt, 0, 0, size, hot ? V.acc : V.ink, { align: "center" });
        g.restore();
      }
      plate(g, V, d.labels[i] || "", x + bw / 2, base + 14 * u + 25 * u, 42 * u, { align: "center", q: ease(span(p, 0.2 + i * 0.08, 0.6 + i * 0.08)), maxW: slot * 0.95, angle: i % 2 ? 0.03 : -0.03, bg: hot ? V.acc : V.ink, fg: hot ? V.onAcc : V.paper });
    }
    g.fillStyle = V.ink; g.fillRect(ax - 14 * u, base, (aw + 28 * u) * ease(p * 1.6), 12 * u);
  }

  function drawObject(g, V, box, p, d, info) {
    const { u } = V, t = info.t, phone = d.kind === "phone", tall = box.h > box.w * 1.05;
    card(g, V, box, p, "L");
    const dev = tall ? { x: box.x, y: box.y, w: box.w, h: box.h * 0.6 } : { x: box.x, y: box.y, w: box.w * 0.6, h: box.h };
    const lab = tall ? { x: box.x, y: box.y + box.h * 0.62, w: box.w, h: box.h * 0.38 } : { x: box.x + box.w * 0.6, y: box.y, w: box.w * 0.4, h: box.h };
    let dw, dh;
    if (phone) { dh = Math.min(dev.h * 0.86, dev.w * (tall ? 1.7 : 1.1)); dw = dh / 1.9; } else { dw = Math.min(dev.w * 0.8, dev.h * 1.2); dh = dw * 0.66; }
    const standH = phone ? 0 : dh * 0.2, dx = dev.x + (dev.w - dw) / 2, dy = dev.y + (dev.h - dh - standH) / 2 + 20 * u;
    const q = ease(p * 1.8);
    g.save(); g.globalAlpha = clamp(p * 4);
    g.translate(0, (1 - q) * 60 * u);
    // Mast with pulses.
    const mx = dx + dw * (phone ? 0.5 : 0.84), my = dy - (phone ? 6 : 4) * u;
    g.strokeStyle = V.ink; g.lineWidth = 9 * u; g.beginPath(); g.moveTo(mx, dy + 6 * u); g.lineTo(mx + (phone ? 0 : 22 * u), my - 96 * u); g.stroke();
    const tipX = mx + (phone ? 0 : 22 * u), tipY = my - 100 * u;
    g.fillStyle = V.acc; g.beginPath(); g.arc(tipX, tipY, 15 * u, 0, TAU); g.fill();
    for (let j = 0; j < 3; j++) {
      const ph = (t * 0.7 + j / 3) % 1;
      g.save(); g.globalAlpha = (1 - ph) * 0.95; g.strokeStyle = V.ink; g.lineWidth = 7 * u;
      g.beginPath(); g.arc(tipX, tipY, 24 * u + ph * 110 * u, -2.35, -0.8); g.stroke(); g.restore();
    }
    // Body, with a hard shadow.
    g.fillStyle = V.acc; g.fillRect(dx + 18 * u, dy + 18 * u, dw, dh);
    g.fillStyle = V.ink; g.fillRect(dx, dy, dw, dh);
    const bz = dw * (phone ? 0.07 : 0.035), sx = dx + bz, sy = dy + bz * (phone ? 1.4 : 1), sw = dw - bz * 2, sh = dh - bz * (phone ? 2.8 : 2);
    g.fillStyle = V.paper; g.fillRect(sx, sy, sw, sh);
    // Screen: a preview window carrying a tiny turning fan, then three tracks of clips rolling past a playhead.
    const pv = { x: sx + sw * 0.06, y: sy + sh * 0.07, w: sw * 0.88, h: sh * 0.46 };
    g.save(); g.beginPath(); g.rect(pv.x, pv.y, pv.w, pv.h); g.clip();
    g.fillStyle = V.acc; g.fillRect(pv.x, pv.y, pv.w, pv.h);
    const fcx = pv.x + pv.w * 0.5, fcy = pv.y + pv.h * 0.62;
    for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU + t * 0.9; g.fillStyle = V.ink; g.beginPath(); g.moveTo(fcx, fcy); g.lineTo(fcx + Math.cos(a - 0.08) * pv.w, fcy + Math.sin(a - 0.08) * pv.w); g.lineTo(fcx + Math.cos(a + 0.08) * pv.w, fcy + Math.sin(a + 0.08) * pv.w); g.closePath(); g.fill(); }
    g.fillStyle = V.paper; g.beginPath(); g.arc(fcx, fcy, pv.h * 0.2, 0, TAU); g.fill();
    star(g, fcx, fcy, pv.h * 0.15, pv.h * 0.06, 5, -t * 1.2); g.fillStyle = V.ink; g.fill();
    g.restore();
    const th = sh * 0.085, tgap = sh * 0.04, ty0 = sy + sh * 0.6;
    g.save(); g.beginPath(); g.rect(sx, ty0 - 4 * u, sw, (th + tgap) * 3 + 4 * u); g.clip();
    const clipsDef = [[0.0, 0.34], [0.4, 0.2], [0.66, 0.3]];
    const tracks = [];
    for (let r = 0; r < 3; r++) {
      const P = sw * 1.3, off = (((t * sw * 0.1 * (r % 2 ? 1 : -1)) % P) + P) % P, y = ty0 + r * (th + tgap);
      tracks.push(y + th / 2);
      for (let rep = -1; rep < 2; rep++) clipsDef.forEach(([cx, cw], ci) => {
        const x = sx + sw * 0.05 + off + rep * P + cx * P * 0.95 - (r * 0.07) * P;
        g.fillStyle = (r + ci) % 3 === 1 ? V.acc : V.ink; g.fillRect(x, y, cw * P * 0.92, th);
      });
    }
    g.restore();
    const phx = sx + sw * 0.4;
    g.fillStyle = V.acc; g.fillRect(phx - 3 * u, ty0 - 12 * u, 6 * u, (th + tgap) * 3 + 8 * u);
    g.strokeStyle = V.ink; g.lineWidth = 2 * u; g.strokeRect(phx - 3 * u, ty0 - 12 * u, 6 * u, (th + tgap) * 3 + 8 * u);
    g.beginPath(); g.moveTo(phx - 14 * u, ty0 - 12 * u); g.lineTo(phx + 14 * u, ty0 - 12 * u); g.lineTo(phx, ty0 + 6 * u); g.closePath(); g.fillStyle = V.acc; g.fill(); g.stroke();
    if (!phone) { // stand
      g.fillStyle = V.ink; poly(g, [[dx + dw * 0.43, dy + dh], [dx + dw * 0.57, dy + dh], [dx + dw * 0.62, dy + dh + standH * 0.8], [dx + dw * 0.38, dy + dh + standH * 0.8]]); g.fill();
      g.fillRect(dx + dw * 0.25, dy + dh + standH * 0.8, dw * 0.5, standH * 0.2 + 6 * u);
      chev(g, dx + dw * 0.25, dy + dh + standH * 0.8, dw * 0.5, standH * 0.2 + 6 * u, t, V.acc, 70 * u, 22 * u, 4 * u, 1);
    }
    g.restore();
    // An equalizer strip under the callouts, always moving.
    {
      const nb = 16, ex = lab.x + 40 * u, ew = lab.w - 100 * u, ey = lab.y + lab.h * (tall ? 0.9 : 0.93), bwd = ew / nb, eh = lab.h * (tall ? 0.16 : 0.2), k = ease(span(p, 0.4, 0.9));
      for (let j = 0; j < nb; j++) {
        const hgt = eh * k * (0.2 + 0.8 * Math.abs(Math.sin(t * 3.1 + j * 0.9) * Math.cos(t * 1.7 - j * 0.35)));
        g.fillStyle = j % 5 === 2 ? V.acc : V.ink; g.fillRect(ex + j * bwd, ey - hgt, bwd * 0.72, hgt);
      }
    }
    // Callouts: plates with flowing leader lines and turning stars on the parts they name.
    const anchors = [[pv.x + pv.w * 0.72, pv.y + pv.h * 0.3], [sx + sw * 0.55, tracks[1]], [sx + sw * 0.22, tracks[2]]];
    d.callouts.forEach((label, i) => {
      const c = ease(span(p, 0.3 + i * 0.12, 0.75 + i * 0.12));
      if (c <= 0 || !label) return;
      const [ax, ay] = anchors[i];
      const px = lab.x + (tall ? 30 * u : 50 * u), py = lab.y + lab.h * (tall ? 0.16 + 0.22 * i : 0.13 + 0.24 * i);
      const pl = plate(g, V, label, px, py, 42 * u, { q: c, maxW: lab.w - 70 * u, angle: i % 2 ? 0.03 : -0.03, bg: i === 1 ? V.acc : V.ink, fg: i === 1 ? V.onAcc : V.paper });
      if (!pl) return;
      g.save(); g.strokeStyle = V.acc; g.lineWidth = 7 * u; g.setLineDash([20 * u, 11 * u]); g.lineDashOffset = t * 55 * u;
      const lx = px - 8 * u, k = ease(span(c, 0.2, 1));
      g.beginPath(); g.moveTo(lx, py); g.lineTo(lerp(lx, ax, k), lerp(py, ay, k)); g.stroke(); g.restore();
      g.save(); g.lineWidth = 5 * u; g.strokeStyle = V.ink;
      g.beginPath(); g.moveTo(lx, py); g.lineTo(lerp(lx, ax, k), lerp(py, ay, k)); g.globalAlpha = 0.0; g.stroke(); g.restore();
      if (k > 0.9) { star(g, ax, ay, 24 * u, 10 * u, 5, t * 1.5 + i); g.fillStyle = V.acc; g.fill(); g.strokeStyle = V.ink; g.lineWidth = 3.5 * u; g.stroke(); }
    });
  }

  function drawPeople(g, V, box, p, d, info) {
    const { u } = V, t = info.t, n = Math.max(2, Math.min(6, Math.round(d.count)));
    card(g, V, box, p, "R");
    if (p > 0.1) cardArt(g, V, box, t, "br");
    const pad = 34 * u, ax = box.x + pad, aw = box.w - pad * 2, ground = box.y + box.h - pad - 10 * u, slot = aw / n;
    const hotIdx = Math.min(n - 1, d.highlight);
    const F = Math.min(box.h * 0.47, slot * (box.h > box.w ? 1.75 : 1.2));
    for (let i = 0; i < n; i++) {
      const q = ease(span(p, i * 0.09, i * 0.09 + 0.5)), hot = i === hotIdx;
      const cx = ax + slot * (i + 0.5), podH = box.h * (0.09 + 0.04 * ((i * 2 + 1) % 3)) + (hot ? box.h * 0.06 : 0), podW = slot * 0.8;
      const top = ground - podH, hq = ease(span(q, 0.3, 1));
      g.fillStyle = V.ink; g.fillRect(cx - podW / 2, ground - podH * q, podW, podH * q);
      if (hot && q > 0.5) chevUp(g, cx - podW / 2 + 8 * u, top + 8 * u, podW - 16 * u, podH - 16 * u, t, V.acc, 80 * u, 34 * u, 6 * u);
      if (hq <= 0) continue;
      g.save(); g.globalAlpha = clamp(hq * 2); g.translate(0, (1 - hq) * 40 * u);
      const th = F * 0.46, bw = F * 0.5, hr = F * 0.15, neck = F * 0.05;
      const sway = Math.sin(t * 2.2 + i * 1.1) * 3 * u;
      // arms first, so the torso overlaps their roots
      const arm = (sgn, ang, len) => {
        const shx = cx + sgn * bw * 0.58, shy = top - th + th * 0.1;
        g.strokeStyle = V.ink; g.lineCap = "butt"; g.lineWidth = bw * 0.17;
        g.beginPath(); g.moveTo(shx, shy); g.lineTo(shx + Math.cos(ang) * len, shy + Math.sin(ang) * len); g.stroke();
        g.fillStyle = V.paper; g.strokeStyle = V.ink; g.lineWidth = 4 * u;
        g.beginPath(); g.arc(shx + Math.cos(ang) * len, shy + Math.sin(ang) * len, bw * 0.11, 0, TAU); g.fill(); g.stroke();
      };
      const wob = Math.sin(t * 3.2 + i * 1.3);
      if (hot) { arm(1, -1.1 + 0.4 * wob, F * 0.4); arm(-1, -Math.PI + 1.1 - 0.4 * Math.sin(t * 3.2 + i * 1.3 + 1.6), F * 0.4); }
      else { if (i % 2 === 0) arm(1, -1.15 + 0.35 * wob, F * 0.38); else arm(1, 1.35, F * 0.34); arm(-1, Math.PI - 1.35, F * 0.34); }
      // torso
      const tp = [[cx - bw / 2, top], [cx - bw * 0.62, top - th + sway * 0.2], [cx + bw * 0.62, top - th + sway * 0.2], [cx + bw / 2, top]];
      g.save(); poly(g, tp); g.fillStyle = hot ? V.acc : V.paper; g.fill(); g.clip();
      dots(g, cx - bw, top - th, bw * 2, th, 13 * u, V.ink, (px, py) => (px > cx - bw * 0.05 ? 0.35 + 0.6 * ((py - (top - th)) / th) : 0));
      g.fillStyle = V.ink; g.fillRect(cx - bw * 0.04, top - th, bw * 0.08, th);
      g.restore();
      poly(g, tp); g.strokeStyle = V.ink; g.lineWidth = 5 * u; g.stroke();
      g.fillStyle = V.ink; g.fillRect(cx - bw * 0.08, top - th - neck + sway * 0.2, bw * 0.16, neck + 3 * u);
      // head: a split face with a cap, band or nothing
      const hy = top - th - neck - hr + sway * 0.4;
      g.beginPath(); g.arc(cx, hy, hr, 0, TAU); g.fillStyle = hot ? V.acc : V.paper; g.fill();
      g.beginPath(); g.arc(cx, hy, hr, Math.PI / 2, -Math.PI / 2); g.closePath(); g.fillStyle = V.ink; g.fill();
      g.beginPath(); g.arc(cx, hy, hr, 0, TAU); g.strokeStyle = V.ink; g.lineWidth = 5 * u; g.stroke();
      g.fillStyle = hot ? V.paper : V.acc;
      g.beginPath(); g.arc(cx + hr * 0.38, hy - hr * 0.1, hr * 0.12, 0, TAU); g.fill();
      if (i % 3 === 0) { poly(g, [[cx - hr * 1.05, hy - hr * 0.35], [cx + hr * 1.05, hy - hr * 0.35], [cx + hr * 0.7, hy - hr * 1.15], [cx - hr * 0.7, hy - hr * 1.15]]); g.fillStyle = V.acc; g.fill(); g.strokeStyle = V.ink; g.lineWidth = 4 * u; g.stroke(); }
      else if (i % 3 === 1) { g.fillStyle = V.acc; g.fillRect(cx - hr, hy - hr * 0.62, hr * 2, hr * 0.28); }
      if (hot) { star(g, cx + bw * 1.05, hy - hr * 1.3, 30 * u, 12 * u, 5, t * 1.6); g.fillStyle = V.acc; g.fill(); g.strokeStyle = V.ink; g.lineWidth = 4 * u; g.stroke(); }
      g.restore();
      const label = d.badges[i % d.badges.length];
      plate(g, V, label, cx, top - th - neck - hr * 2 - 52 * u, 42 * u, { align: "center", q: ease(span(q, 0.6, 1)), maxW: slot * 0.96, angle: i % 2 ? 0.04 : -0.04, bg: hot ? V.acc : V.ink, fg: hot ? V.onAcc : V.paper });
    }
    g.fillStyle = V.ink; g.fillRect(ax - 20 * u, ground, (aw + 40 * u) * ease(p * 1.6), 12 * u);
  }

  function drawIcon(g, V, kind, cx, cy, s, color, t) {
    g.save(); g.fillStyle = color; g.strokeStyle = color; g.lineWidth = 9 * V.u; g.lineJoin = "miter";
    if (kind === 0) { // sheet with lines scrolling
      poly(g, [[cx - s * 0.32, cy - s * 0.42], [cx + s * 0.1, cy - s * 0.42], [cx + s * 0.32, cy - s * 0.2], [cx + s * 0.32, cy + s * 0.42], [cx - s * 0.32, cy + s * 0.42]]); g.stroke();
      g.save(); g.beginPath(); g.rect(cx - s * 0.2, cy - s * 0.12, s * 0.4, s * 0.46); g.clip();
      const off = (t * 40 * V.u) % (s * 0.18);
      for (let k = -1; k < 4; k++) g.fillRect(cx - s * 0.2, cy - s * 0.1 + k * s * 0.18 + off, s * (k % 2 ? 0.28 : 0.4), s * 0.07);
      g.restore();
    } else if (kind === 1) { // gear
      gear(g, cx, cy, s * 0.44, 8, t * 0.9, s * 0.13); g.fill("evenodd");
    } else { // flag planted: pole and a waving pennant
      g.beginPath(); g.moveTo(cx - s * 0.25, cy + s * 0.45); g.lineTo(cx - s * 0.25, cy - s * 0.45); g.stroke();
      const w = Math.sin(t * 5) * s * 0.05;
      g.beginPath(); g.moveTo(cx - s * 0.25, cy - s * 0.45); g.lineTo(cx + s * 0.38, cy - s * 0.28 + w); g.lineTo(cx - s * 0.25, cy - s * 0.08); g.closePath(); g.fill();
    }
    g.restore();
  }
  function drawProcess(g, V, box, p, d, info) {
    const { u } = V, t = info.t, n = d.steps.length, tall = box.h > box.w * 1.05;
    card(g, V, box, p, "R");
    if (p > 0.1) cardArt(g, V, box, t, "tl");
    const pad = 34 * u, ix = box.x + pad, iy = box.y + pad, iw = box.w - pad * 2, ih = box.h - pad * 2;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const q = ease(span(p, i * 0.16, i * 0.16 + 0.5)), hot = i === n - 1;
      let sx, sy, sw, sh;
      if (!tall) {
        const slot = iw / n; sw = slot - 26 * u; sx = ix + slot * i + 13 * u;
        const top = iy + ih * (0.38 - 0.3 * (i / Math.max(1, n - 1))); sy = top; sh = iy + ih - top;
      } else {
        const slot = ih / n; sh = slot - 24 * u; sy = iy + slot * i + 12 * u; sw = iw - 96 * u; sx = ix;
      }
      const fg = hot ? V.ink : V.paper;
      g.save();
      if (!tall) { g.beginPath(); g.rect(sx - 4, sy + sh * (1 - q) - 4, sw + 24 * u, sh * q + 8); g.clip(); } else { g.beginPath(); g.rect(sx - 4, sy - 4, (sw + 24 * u) * q, sh + 8); g.clip(); }
      g.fillStyle = hot ? V.acc : V.ink; g.fillRect(sx, sy, sw, sh);
      g.strokeStyle = V.ink; g.lineWidth = 4 * u; g.strokeRect(sx, sy, sw, sh);
      const numSize = Math.min(130 * u, sh * 0.34);
      if (!tall) {
        tx(g, "0" + (i + 1), sx + sw * 0.5, sy + numSize * 0.7, numSize, fg, { align: "center" });
        drawIcon(g, V, hot ? 2 : i % 2, sx + sw / 2, sy + sh * 0.5 + numSize * 0.1, Math.min(sw * 0.5, sh * 0.34), fg, t);
        plate(g, V, d.steps[i], sx + sw / 2, sy + sh - 46 * u, 42 * u, { align: "center", maxW: sw - 30 * u, angle: i % 2 ? 0.03 : -0.03, bg: hot ? V.ink : V.paper, fg: hot ? V.paper : V.ink, shadow: hot ? V.paper : V.acc });
        pts.push([sx + sw / 2, sy - 30 * u]);
      } else {
        tx(g, "0" + (i + 1), sx + 24 * u, sy + sh * 0.5, Math.min(130 * u, sh * 0.62), fg, { align: "left" });
        drawIcon(g, V, hot ? 2 : i % 2, sx + 220 * u, sy + sh * 0.5, Math.min(130 * u, sh * 0.7), fg, t);
        plate(g, V, d.steps[i], sx + 330 * u, sy + sh * 0.5, 42 * u, { align: "left", maxW: sw - 350 * u, angle: i % 2 ? 0.02 : -0.02, bg: hot ? V.ink : V.paper, fg: hot ? V.paper : V.ink, shadow: hot ? V.paper : V.acc });
        pts.push([ix + iw - 44 * u, sy + sh * 0.5]);
      }
      g.restore();
    }
    // The route: a dashed red line with a token riding it, looping.
    if (p > 0.6 && n > 1) {
      const k = ease(span(p, 0.6, 1));
      g.save(); g.lineWidth = 8 * u; g.strokeStyle = V.acc; g.setLineDash([24 * u, 14 * u]); g.lineDashOffset = -t * 90 * u; g.lineJoin = "miter";
      g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.globalAlpha = k; g.stroke(); g.restore();
      const total = (n - 1), s = ((t * 0.32) % 1) * total, i0 = Math.min(n - 2, Math.floor(s)), f = s - i0;
      const tx0 = lerp(pts[i0][0], pts[i0 + 1][0], f), ty0 = lerp(pts[i0][1], pts[i0 + 1][1], f);
      g.save(); g.globalAlpha = k; g.fillStyle = V.acc; g.strokeStyle = V.ink; g.lineWidth = 5 * u;
      g.beginPath(); g.arc(tx0, ty0, 24 * u, 0, TAU); g.fill(); g.stroke();
      star(g, tx0, ty0, 16 * u, 7 * u, 5, t * 2); g.fillStyle = V.ink; g.fill();
      g.restore();
    }
  }

  function drawCompare(g, V, box, p, d, info) {
    const { u } = V, t = info.t, tall = box.h > box.w * 1.1, gap = 64 * u;
    const vals = [d.leftValue, d.rightValue], labels = [d.left, d.right], mxv = Math.max(...vals, 1);
    const sw = tall ? box.w : (box.w - gap) / 2, sh = tall ? (box.h - gap) / 2 : box.h * 0.94;
    for (let i = 0; i < 2; i++) {
      const q = ease(span(p, i * 0.22, i * 0.22 + 0.5)), hot = i === 1;
      if (q <= 0) continue;
      const x = tall ? box.x : box.x + i * (sw + gap), y = tall ? box.y + i * (sh + gap) : box.y + (box.h - sh) / 2 + (hot ? 0 : sh * 0.02);
      const hh = sh * (hot || tall ? 1 : 0.94);
      g.save(); g.globalAlpha = clamp(q * 3);
      g.translate(x + sw / 2 + (1 - q) * (tall ? 0 : (hot ? 1 : -1) * box.w * 0.25), y + hh / 2 + (tall ? (1 - q) * (hot ? 1 : -1) * 120 * u : 0)); g.rotate(hot ? 0.018 : -0.018);
      g.translate(-sw / 2, -hh / 2);
      g.fillStyle = hot ? V.ink : V.acc; g.fillRect(18 * u, 18 * u, sw, hh);
      g.fillStyle = hot ? V.acc : V.ink; g.fillRect(0, 0, sw, hh);
      g.strokeStyle = V.ink; g.lineWidth = 4 * u; g.strokeRect(0, 0, sw, hh);
      const fg = hot ? V.ink : V.paper;
      // a belt along the top edge and a halftone corner
      chev(g, 0, 0, sw, 26 * u, t, hot ? V.ink : V.acc, 100 * u * (hot ? -1 : 1), 34 * u, 6 * u, 1);
      g.save(); g.beginPath(); g.rect(0, 0, sw, hh); g.clip();
      dots(g, sw * 0.55, hh * 0.3, sw * 0.45, hh * 0.4, 16 * u, hot ? V.ink : V.acc, (px, py) => 0.7 * (0.5 + 0.5 * Math.sin(px * 0.02 - py * 0.015 - t * 2)) * clamp(1.2 - (px - sw * 0.55) / (sw * 0.45)));
      g.restore();
      plate(g, V, labels[i], 34 * u, 74 * u, 46 * u, { align: "left", q: ease(span(q, 0.3, 1)), maxW: sw - 120 * u, angle: -0.03, bg: V.paper, fg: V.ink, shadow: hot ? V.ink : V.acc });
      const size = Math.min(210 * u, hh * 0.36);
      const txt = fmt(vals[i] * q, d);
      const nx = hot && !tall ? 150 * u : 28 * u;
      tx(g, txt, nx + 6 * u, hh * 0.54 + 6 * u, size, hot ? V.paper : V.acc, { align: "left" });
      tx(g, txt, nx, hh * 0.54, size, fg, { align: "left" });
      // meter: twelve blocks, filled to the value, a pulse running along them
      const nb = 12, bgp = 8 * u, bwid = (sw - 68 * u - bgp * (nb - 1)) / nb, by = hh - 64 * u - 44 * u, bh = 54 * u;
      const filled = Math.round((nb * vals[i]) / mxv * q);
      for (let j = 0; j < nb; j++) {
        const bx = 34 * u + j * (bwid + bgp);
        if (j < filled) { g.globalAlpha = clamp(q * 3) * (0.72 + 0.28 * Math.sin(t * 5 - j * 0.7)); g.fillStyle = fg; g.fillRect(bx, by, bwid, bh); g.globalAlpha = clamp(q * 3); }
        else { g.strokeStyle = fg; g.globalAlpha = clamp(q * 3) * 0.5; g.lineWidth = 4 * u; g.strokeRect(bx, by, bwid, bh); g.globalAlpha = clamp(q * 3); }
      }
      star(g, sw - 70 * u, 74 * u, 36 * u, 15 * u, 5, t * (hot ? 1 : -1) * 0.9); g.fillStyle = hot ? V.paper : V.acc; g.fill();
      g.restore();
    }
    // VS disc between the slabs, ticking.
    const q = ease(span(p, 0.45, 0.9));
    if (q > 0) {
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2, r = 104 * u * q;
      g.save(); g.fillStyle = V.ink; g.beginPath(); g.arc(cx + 10 * u, cy + 10 * u, r, 0, TAU); g.fill();
      g.fillStyle = V.paper; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
      g.strokeStyle = V.ink; g.lineWidth = 9 * u; g.stroke();
      g.strokeStyle = V.acc; g.lineWidth = 6 * u; g.beginPath();
      for (let i = 0; i < 36; i++) { const a = -t * 1.1 + (i / 36) * TAU; g.moveTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78); g.lineTo(cx + Math.cos(a) * r * (i % 3 ? 0.9 : 0.96), cy + Math.sin(a) * r * (i % 3 ? 0.9 : 0.96)); }
      g.stroke();
      g.translate(cx, cy); g.rotate(-0.08 + Math.sin(t * 2) * 0.04);
      tx(g, "VS", 0, 4 * u, 96 * u * Math.max(0.4, q), V.ink, { align: "center" });
      g.restore();
    }
  }

  const DRAW = { chart: drawChart, object: drawObject, people: drawPeople, process: drawProcess, compare: drawCompare };

  function sceneFn(id) {
    return (ctx, S, box, p, d, info) => {
      if (info.exit != null) return; // the cover slab hides the outgoing scene; nothing to cross
      const list = shownList(), idx = list.indexOf(id), V = view(ctx, S, info.t);
      ctx.save();
      const post = idx > 0 && info.local < info.change;
      const pre = idx >= 0 && idx < list.length - 1 && info.local > info.hold - info.change;
      if (post) { poly(ctx, sidePoly(V, inout(info.local / info.change), idx, "L")); ctx.clip(); }
      else if (pre) { poly(ctx, sidePoly(V, inout((info.local - (info.hold - info.change)) / info.change), idx + 1, "R")); ctx.clip(); }
      // A slow push-in and a small tilt keep the sheet alive through its whole hold.
      const k = clamp(info.local / Math.max(0.1, info.hold)), cx = box.x + box.w / 2, cy = box.y + box.h / 2;
      ctx.translate(cx, cy); ctx.rotate(-0.01 - 0.004 * Math.sin(info.t * 0.8)); ctx.scale(1 + 0.035 * k, 1 + 0.035 * k); ctx.translate(-cx, -cy);
      DRAW[id](ctx, V, box, clamp(0.16 + p * 1.4), d, info);
      ctx.restore();
    };
  }

  // ---- paper, wear -------------------------------------------------------------------------------------
  let dust = null, dustKey = "";
  function paint(ctx, W, H, t, accent, look) {
    ctx.clearRect(0, 0, W, H);
    const u = Math.min(W, H) / 1080, key = `${W}x${H}${look.bg}${look.ink}`;
    if (!dust || dustKey !== key) {
      dust = document.createElement("canvas"); dust.width = W; dust.height = H; dustKey = key;
      const g = dust.getContext("2d"), r = rng(58);
      // Ink dropout: clustered paper-coloured specks, as where the stone printed thin.
      const centres = []; for (let i = 0; i < 120; i++) centres.push([r() * W, r() * H, (20 + r() * 120) * u]);
      const count = Math.round((W * H) / 420);
      for (let i = 0; i < count; i++) {
        let x, y;
        if (r() < 0.7) { const c = centres[Math.floor(r() * centres.length)]; x = c[0] + (r() - 0.5) * c[2] * 2; y = c[1] + (r() - 0.5) * c[2] * 2; } else { x = r() * W; y = r() * H; }
        const rad = (0.5 + r() * r() * 2.8) * u;
        g.fillStyle = hexA(look.bg, 0.12 + r() * 0.55); g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
      }
      // Long thin dry streaks where the roller skipped.
      for (let i = 0; i < 90; i++) { g.fillStyle = hexA(look.bg, 0.05 + r() * 0.12); g.fillRect(r() * W, r() * H, (60 + r() * 260) * u, (1 + r() * 2) * u); }
      // Folds and burnt edges.
      g.strokeStyle = hexA(look.bg, 0.3); g.lineWidth = 2.5 * u; g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
      g.strokeStyle = look.overprint ? "rgba(70,40,10,0.16)" : "rgba(0,0,0,0.3)"; g.lineWidth = 2 * u; g.beginPath(); g.moveTo(W / 2 + 3 * u, 0); g.lineTo(W / 2 + 3 * u, H); g.moveTo(0, H / 2 + 3 * u); g.lineTo(W, H / 2 + 3 * u); g.stroke();
      const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.hypot(W, H) * 0.58);
      v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, look.overprint ? "rgba(70,40,10,0.34)" : "rgba(0,0,0,0.4)");
      g.fillStyle = v; g.fillRect(0, 0, W, H);
    }
    ctx.drawImage(dust, 0, 0);
    // Dust and hairs that flicker from frame to frame.
    const r = rng(Math.floor(t * 10) * 977 + 13);
    ctx.fillStyle = hexA(look.bg, 0.8);
    for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.arc(r() * W, r() * H, (0.8 + r() * 2.2) * u, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = hexA(look.ink, 0.22); ctx.lineWidth = 1.2 * u; ctx.beginPath();
    for (let i = 0; i < 2; i++) { const x = r() * W, y = r() * H; ctx.moveTo(x, y); ctx.quadraticCurveTo(x + (r() - 0.5) * 60 * u, y + (r() - 0.5) * 60 * u, x + (r() - 0.5) * 90 * u, y + (r() - 0.5) * 90 * u); }
    ctx.stroke();
  }

  const PAPER = { bg: "#eadfc4", ink: "#18120f", muted: "#9b8a68", accent: "#c8281e", onAccent: "#f1e6c8" };
  const backdropOf = (look) => (accent, texture) =>
    `radial-gradient(ellipse at 50% 42%, rgba(255,250,232,${0.32 * texture}) 0%, rgba(255,250,232,0) 62%), ${grain(0.34 * texture)}, ${smudge}, ${look}`;

  return {
    bg: PAPER.bg, panel: PAPER.ink, ink: PAPER.ink, muted: PAPER.muted, accent: PAPER.accent, onAccent: PAPER.onAccent,
    rule: "rgba(24,18,15,0.8)", track: "rgba(24,18,15,0.12)",
    display: FONT, displayWeight: 400, displayCase: "uppercase", displayTracking: "0.015em",
    body: FONT, bodyWeight: 400, figures: FONT, radius: 0, motion: "wipe", change: "fade",
    kit: { line: 4, fill: "solid", panel: "fill" },
    panelEdge: PAPER.ink, overprint: true,
    // Headlines set straight on this look's backdrop, where its ink and accent (meant for panels) do not read.
    displayAccent: { dark: "#e47f76" },
    palettes: {
      light: { bg: "#f2eee5", ink: "#1b1613", muted: "#a59a85", accent: "#d02c22", onAccent: "#f6f1e4", panelEdge: "#1b1613", rule: "rgba(27,22,19,0.8)", backdrop: backdropOf("#f2eee5") },
      dark: { bg: "#14100d", ink: "#ecdfc0", muted: "#6f6350", accent: "#d63a2c", onAccent: "#14100d", panelEdge: "#ecdfc0", panel: "#ecdfc0", rule: "rgba(236,223,192,0.8)", track: "rgba(236,223,192,0.12)", overprint: false, backdrop: backdropOf("#14100d") },
      mono: { bg: "#e9e2d0", ink: "#18120f", muted: "#9a9078", accent: "#5e544a", onAccent: "#ece4d0", panelEdge: "#18120f", backdrop: backdropOf("#e9e2d0") },
    },
    textShadow: () => "none",
    backdrop: backdropOf(PAPER.bg),
    css: () => `
      .display { background: var(--ink); color: var(--bg); padding: 0.08em 0.3em 0.05em; align-self: flex-start; max-width: 100%; rotate: -2.4deg; transform-origin: 0 100%; text-shadow: none; box-shadow: 0.07em 0.07em 0 var(--accent); line-height: 1.02; letter-spacing: 0.015em; text-wrap: balance; }
      .statement .display { width: auto !important; rotate: -3.4deg; }
      .kicker { background: var(--accent); color: var(--on-accent); padding: 0.1em 0.5em 0.06em; align-self: flex-start; rotate: -3.4deg; transform-origin: 0 100%; text-shadow: none; font-family: var(--display); font-weight: 400; font-size: 46px !important; letter-spacing: 0.14em; box-shadow: 0.1em 0.1em 0 var(--ink); }`,
    paintOver: true,
    paint,
    keepArt: true,
    overlap: false,
    stage(ctx, S, info) {
      if (!S.paint) return;
      const V = view(ctx, S, info.t), list = shownList();
      const id = info.scene || list[list.length - 1] || "closing";
      world(V, id, info.t);
      const cv = coverState(info, list);
      if (cv) drawCover(V, cv);
    },
    scenes: { chart: sceneFn("chart"), object: sceneFn("object"), people: sceneFn("people"), process: sceneFn("process"), compare: sceneFn("compare") },
  };
});
