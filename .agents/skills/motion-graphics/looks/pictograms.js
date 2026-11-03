// Pictograms: a printed statistical sheet in the old picture-statistics tradition. One symbol stands for a
// fixed unit, rows of identical symbols are the data, and a part-filled symbol is the remainder. Three muted
// inks (charcoal, brick, slate blue) sit on warm paper with slightly misregistered plates. Behind every
// scene the sheet keeps working: symbol conveyors run along both margins, a ghost wallpaper of symbols
// drifts, a halftone sun turns, seed-symbols float up, and each scene adds its own machinery. Scenes change
// with a printing roller that sweeps across the sheet, leaving the next plate printed behind it.
// All symbols are drawn from plain geometry and are original. Frames are pure functions of time.
window.DreamcutMotion.register("pictograms", ({ grain, rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const lerp = (a, b, k) => a + (b - a) * k;
  const A = (hex, a) => hexA(hex, a);
  const FACE = "'Avenir Next Condensed', 'DIN Condensed', 'Roboto Condensed', 'Arial Narrow', sans-serif";
  const KINDS = ["person", "clip", "bolt", "house", "gear", "bulb", "leaf", "box", "drop", "star"];
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  // Where the template draws each illustration, so the world can sit behind it.
  const boxOf = (S) => { const side = (S.tall ? 90 : 140) * S.u; return S.tall ? { x: side, y: S.H * 0.3, w: S.W - side * 2, h: S.H * 0.6 } : { x: side, y: S.H * 0.34, w: S.W - side * 2, h: S.H * 0.58 }; };
  const FR = { index: 0, scene: null };

  function theme(S) {
    const L = S.look;
    return { u: S.u, W: S.W, H: S.H, tall: S.tall, ink: L.ink, acc: S.accent, blue: L.blue, paper: L.bg, panel: L.panel, dark: !!L.dark, tex: L.texture ?? 1 };
  }

  // ---- symbols ------------------------------------------------------------------------------------
  // Each symbol is drawn around the origin in a square of side s. Cut-outs use even-odd fills.
  const rrp = (g, x, y, w, h, r) => {
    r = Math.min(r, w / 2, h / 2);
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  };
  const GLY = {
    person(g, s) {
      g.beginPath(); g.arc(0, -0.34 * s, 0.15 * s, 0, TAU); g.fill();
      g.beginPath(); rrp(g, -0.25 * s, -0.16 * s, 0.5 * s, 0.4 * s, 0.14 * s); rrp(g, -0.19 * s, 0.2 * s, 0.15 * s, 0.3 * s, 0.04 * s); rrp(g, 0.04 * s, 0.2 * s, 0.15 * s, 0.3 * s, 0.04 * s); g.fill();
    },
    clip(g, s) {
      g.beginPath(); rrp(g, -0.44 * s, -0.3 * s, 0.88 * s, 0.6 * s, 0.08 * s);
      for (let i = 0; i < 4; i++) { const x = -0.34 * s + i * 0.2 * s; g.rect(x, -0.25 * s, 0.1 * s, 0.07 * s); g.rect(x, 0.18 * s, 0.1 * s, 0.07 * s); }
      g.moveTo(-0.1 * s, -0.1 * s); g.lineTo(0.14 * s, 0); g.lineTo(-0.1 * s, 0.1 * s); g.closePath(); g.fill("evenodd");
    },
    bolt(g, s) {
      g.beginPath(); [[0.14, -0.5], [-0.3, 0.07], [-0.03, 0.07], [-0.16, 0.5], [0.3, -0.1], [0.04, -0.1]].forEach(([x, y], i) => (i ? g.lineTo(x * s, y * s) : g.moveTo(x * s, y * s))); g.closePath(); g.fill();
    },
    house(g, s) {
      g.beginPath(); [[0, -0.46], [0.46, -0.04], [0.36, -0.04], [0.36, 0.44], [-0.36, 0.44], [-0.36, -0.04], [-0.46, -0.04]].forEach(([x, y], i) => (i ? g.lineTo(x * s, y * s) : g.moveTo(x * s, y * s))); g.closePath();
      g.rect(-0.09 * s, 0.14 * s, 0.18 * s, 0.3 * s); g.moveTo(0.08 * s, -0.12 * s); g.arc(0, -0.12 * s, 0.08 * s, 0, TAU); g.fill("evenodd");
    },
    gear(g, s) {
      g.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k * TAU) / 8;
        [[0.34, -0.2], [0.47, -0.11], [0.47, 0.11], [0.34, 0.2]].forEach(([r, da], i) => { const x = Math.cos(a + da) * r * s, y = Math.sin(a + da) * r * s; if (k === 0 && i === 0) g.moveTo(x, y); else g.lineTo(x, y); });
      }
      g.closePath(); g.moveTo(0.14 * s, 0); g.arc(0, 0, 0.14 * s, 0, TAU); g.fill("evenodd");
    },
    bulb(g, s) {
      g.beginPath(); g.arc(0, -0.12 * s, 0.3 * s, 0, TAU); g.fill();
      g.beginPath(); rrp(g, -0.13 * s, 0.1 * s, 0.26 * s, 0.14 * s, 0.03 * s); rrp(g, -0.11 * s, 0.27 * s, 0.22 * s, 0.07 * s, 0.03 * s); rrp(g, -0.07 * s, 0.37 * s, 0.14 * s, 0.07 * s, 0.03 * s); g.fill();
    },
    leaf(g, s) {
      g.beginPath(); g.moveTo(-0.38 * s, 0.4 * s); g.quadraticCurveTo(-0.52 * s, -0.32 * s, 0.4 * s, -0.42 * s); g.quadraticCurveTo(0.5 * s, 0.32 * s, -0.38 * s, 0.4 * s); g.closePath();
      g.moveTo(-0.3 * s, 0.31 * s); g.lineTo(0.22 * s, -0.22 * s); g.lineTo(0.25 * s, -0.19 * s); g.lineTo(-0.27 * s, 0.34 * s); g.closePath(); g.fill("evenodd");
    },
    box(g, s) {
      g.beginPath(); rrp(g, -0.4 * s, -0.17 * s, 0.8 * s, 0.6 * s, 0.05 * s); rrp(g, -0.17 * s, 0.06 * s, 0.34 * s, 0.16 * s, 0.03 * s); g.fill("evenodd");
      g.beginPath(); rrp(g, -0.47 * s, -0.42 * s, 0.94 * s, 0.19 * s, 0.05 * s); g.fill();
    },
    drop(g, s) {
      g.beginPath(); g.moveTo(0, -0.46 * s); g.bezierCurveTo(0.4 * s, -0.04 * s, 0.34 * s, 0.44 * s, 0, 0.44 * s); g.bezierCurveTo(-0.34 * s, 0.44 * s, -0.4 * s, -0.04 * s, 0, -0.46 * s); g.closePath(); g.fill();
    },
    star(g, s) {
      g.beginPath();
      for (let i = 0; i < 10; i++) { const r = (i % 2 ? 0.2 : 0.47) * s, a = -Math.PI / 2 + (i * TAU) / 10; if (i) g.lineTo(Math.cos(a) * r, Math.sin(a) * r); else g.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.closePath(); g.fill();
    },
  };

  // One symbol in the sheet's inks: an empty slot, a stamp that drops in with an ink ring, a part-filled remainder.
  function unit(g, T, kind, cx, cy, s, color, o = {}) {
    const q = o.q ?? 1;
    if (o.slot) { g.save(); g.translate(cx, cy); g.fillStyle = A(T.ink, o.slot); GLY[kind](g, s); g.restore(); }
    if (q <= 0) return;
    const e = back(q), sc = (o.sc || 1) * (1 + (1 - e) * 0.5), drop = -(1 - e) * s * 0.7, frac = o.frac ?? 1;
    g.save();
    g.translate(cx, cy + (o.dy || 0) + drop);
    if (o.rot) g.rotate(o.rot);
    g.scale(sc, sc);
    g.globalAlpha *= clamp(q * 3);
    g.fillStyle = A(T.ink, 0.15); g.translate(s * 0.035, s * 0.035); GLY[kind](g, s); g.translate(-s * 0.035, -s * 0.035);
    g.fillStyle = color;
    if (frac < 0.999) {
      g.save(); g.globalAlpha *= 0.2; GLY[kind](g, s); g.restore();
      g.save(); g.beginPath(); g.rect(-s * 0.5, -s * 0.6, s * (frac + 0.04) - (frac ? 0 : s), s * 1.2); g.clip(); GLY[kind](g, s); g.restore();
    } else GLY[kind](g, s);
    const r = clamp((q - 0.55) / 0.45);
    if (r > 0 && r < 1) { g.strokeStyle = color; g.globalAlpha *= (1 - r) * 0.6; g.lineWidth = T.u * 3; g.beginPath(); g.arc(0, 0, s * (0.38 + 0.45 * r), 0, TAU); g.stroke(); }
    g.restore();
  }

  // ---- lettering ----------------------------------------------------------------------------------
  function say(g, s, x, y, size, o = {}) {
    s = String(s ?? "");
    if (o.upper !== false) s = s.toUpperCase();
    const q = o.q ?? 1;
    if (!s || q <= 0) return 0;
    const weight = o.weight || 800;
    g.save();
    g.font = `${weight} ${size}px ${FACE}`;
    g.letterSpacing = (o.track ?? 0.05) * size + "px";
    let w = g.measureText(s).width;
    if (o.maxW && w > o.maxW) { size = Math.max(o.min || size * 0.72, (size * o.maxW) / w); g.font = `${weight} ${size}px ${FACE}`; g.letterSpacing = (o.track ?? 0.05) * size + "px"; w = g.measureText(s).width; }
    const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    g.textAlign = "left"; g.textBaseline = o.base || "alphabetic";
    // Words arrive whole: they ink in and settle rather than typing out letter by letter.
    g.globalAlpha *= (o.alpha ?? 1) * clamp(q * 1.6);
    const shown = s;
    if (q < 1) y += (1 - eo(q)) * size * 0.25;
    if (o.ghost) { g.fillStyle = o.ghost; g.fillText(shown, x0 + size * 0.04, y + size * 0.04); }
    g.fillStyle = o.color; g.fillText(shown, x0, y);
    g.restore();
    return w;
  }
  const textW = (g, s, size, weight = 800) => { g.save(); g.font = `${weight} ${size}px ${FACE}`; g.letterSpacing = 0.05 * size + "px"; const w = g.measureText(String(s ?? "").toUpperCase()).width; g.restore(); return w; };
  const num = (v, d, dec) => window.DreamcutMotion.formatNumber(v, dec ?? (Math.abs(v % 1) > 0.001 ? 1 : 0), (d && d.prefix) || "", (d && d.suffix) || "");
  const niceUnit = (max, icons) => { for (const m of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 5000, 10000]) if (Math.ceil(max / m - 1e-6) <= icons) return m; return 10000; };
  function plate(g, T, x, y, w, h, o = {}) {
    const u = T.u;
    g.save();
    g.beginPath(); rrp(g, x + 7 * u, y + 7 * u, w, h, (o.r ?? 14) * u); g.fillStyle = A(T.ink, 0.17); g.fill();
    g.beginPath(); rrp(g, x, y, w, h, (o.r ?? 14) * u); g.fillStyle = o.fill || T.panel; g.fill();
    g.lineWidth = (o.line ?? 5) * u; g.strokeStyle = o.stroke || T.ink; g.stroke();
    g.restore();
  }

  // ---- the world behind every scene ------------------------------------------------------------------
  const SEEDS = (() => { const r = rng(77); return Array.from({ length: 22 }, () => ({ x: r(), y: r(), sp: 26 + r() * 40, ph: r() * TAU, sz: 30 + r() * 38, k: Math.floor(r() * KINDS.length), c: Math.floor(r() * 3) })); })();
  const SPECKS = (() => { const r = rng(5); return Array.from({ length: 300 }, () => ({ x: r(), y: r(), z: 0.8 + r() * 2.6 })); })();
  const SUN = { title: [0.84, 0.26], chart: [0.86, 0.22], object: [0.3, 0.62], people: [0.14, 0.3], process: [0.52, 0.64], compare: [0.82, 0.55], closing: [0.15, 0.25] };
  const WALL = { title: 0, chart: 1, object: 2, people: 3, process: 4, compare: 5, closing: 6 };

  function halftone(g, T, cx, cy, t, col) {
    const u = T.u;
    for (let k = 1; k <= 9; k++) {
      if (k % 2 === 0) continue;
      const r = k * 36 * u, n = 6 * k, spin = t * 0.16 * (k % 2 ? 1 : -1), dot = (1 - k / 11) * 9.5 * u;
      g.fillStyle = A(col, 0.1);
      for (let i = 0; i < n; i++) { const a = spin + (i * TAU) / n; g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, dot * (0.75 + 0.25 * Math.sin(t * 2 + k + i)), 0, TAU); g.fill(); }
    }
  }

  // Closing plate: a key of the sheet's symbols, each tile a big symbol, its unit and a tally row that stamps in.
  const KEY = [["clip", 5, 3.4], ["gear", 2, 4.6], ["person", 1, 3], ["star", 10, 2.5], ["bulb", 3, 4.2], ["box", 4, 3.7]];
  function legend(g, T, lt, t) {
    const { u, W, H, tall } = T, cols = tall ? 3 : 5, rows = tall ? 2 : 1;
    const x0 = tall ? W * 0.07 : W * 0.075, x1 = W - x0, y0 = tall ? H * 0.6 : H * 0.575, y1 = tall ? H * 0.9 : H * 0.885, gap = 26 * u;
    const tw = (x1 - x0 - gap * (cols - 1)) / cols, th = (y1 - y0 - gap * (rows - 1)) / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c, [kind, per, tally] = KEY[i % KEY.length], q = clamp(0.35 + lt * 2.4 - i * 0.22);
      if (q <= 0) continue;
      const x = x0 + c * (tw + gap), y = y0 + r * (th + gap), k = back(q), hot = i === 2;
      g.save(); g.globalAlpha *= clamp(q * 3); g.translate(x + tw / 2, y + th / 2); g.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k); g.translate(-x - tw / 2, -y - th / 2);
      plate(g, T, x, y, tw, th, { fill: hot ? T.acc : T.panel, r: 14, line: 4 });
      const big = Math.min(th * 0.5, tw * 0.4), fg = hot ? T.paper : T.ink;
      g.save(); g.translate(x + big * 0.75, y + th * 0.36); g.fillStyle = hot ? T.paper : i % 2 ? T.blue : T.ink; GLY[kind](g, big); g.restore();
      say(g, "= " + per, x + big * 1.5, y + th * 0.36, 56 * u, { base: "middle", color: fg, track: 0, q: clamp((q - 0.3) / 0.4) });
      // Tally row: whole symbols plus a part-filled remainder, with a lit stamp walking along it.
      const n = Math.ceil(tally), ms = Math.min(th * 0.26, (tw - 36 * u) / 5.2), lit = Math.floor(t * 2.2 + i * 1.3) % (n + 2);
      for (let j = 0; j < n; j++) {
        const qj = clamp((q - 0.35 - j * 0.08) / 0.3), frac = j === n - 1 && tally % 1 ? tally % 1 : 1;
        unit(g, T, kind, x + 22 * u + ms * (j + 0.5) * 1.02, y + th * 0.78, ms, j === lit ? (hot ? T.ink : T.acc) : hot ? T.paper : T.blue, { q: qj, frac, slot: 0 });
      }
      g.restore();
    }
  }

  function world(g, T, sid, lt, t, fade = 1) {
    const { u, W, H } = T;
    const bx = boxOf({ tall: T.tall, W, H, u });
    // Ghost wallpaper of symbols, drifting diagonally in alternating rows.
    const cell = 215 * u, cols = Math.ceil(W / cell) + 2, rows = Math.ceil(H / cell) + 2;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const dir = j % 2 ? -1 : 1, ox = ((t * 15 * u * dir) % cell + cell) % cell;
      const x = i * cell - cell + ox + (j % 2) * cell * 0.5, y = j * cell - cell * 0.4 + ((t * 8 * u) % cell);
      g.save(); g.translate(x, y); g.rotate(Math.sin(t * 0.4 + i + j) * 0.09); g.fillStyle = A(T.ink, T.dark ? 0.03 : 0.025);
      GLY[KINDS[(i * 3 + j * 5 + WALL[sid]) % KINDS.length]](g, 150 * u); g.restore();
    }
    const [sx, sy] = SUN[sid] || SUN.title;
    const sunCx = sid === "object" ? (T.tall ? bx.x + bx.w * 0.5 : bx.x + bx.w * 0.29) : W * sx, sunCy = sid === "object" ? (T.tall ? bx.y + bx.h * 0.3 : bx.y + bx.h * 0.5) : H * sy;
    halftone(g, T, sunCx, sunCy, t, sid === "chart" || sid === "compare" ? T.acc : T.blue);
    // Scene machinery.
    g.save();
    if (sid === "chart") {
      // Equaliser bars breathing along the floor, dotted guides marching up the sheet.
      for (let i = 0; i < 34; i++) { const h = (0.25 + 0.75 * Math.abs(Math.sin(t * 1.3 + i * 0.7) * Math.cos(t * 0.6 + i * 0.31))) * 150 * u, x = (i / 34) * W; g.fillStyle = A(T.blue, 0.05); g.fillRect(x, H - 74 * u - h, W / 34 - 6 * u, h); }
    } else if (sid === "object") {
      const cx = sunCx, cy = sunCy;
      g.strokeStyle = A(T.ink, 0.09); g.lineWidth = 3 * u;
      for (let k = 0; k < 40; k++) { const a = (k * TAU) / 40 + t * 0.12; g.beginPath(); g.moveTo(cx + Math.cos(a) * 160 * u, cy + Math.sin(a) * 160 * u); g.lineTo(cx + Math.cos(a) * Math.max(W, H), cy + Math.sin(a) * Math.max(W, H)); g.stroke(); }
    } else if (sid === "people") {
      const base = bx.y + bx.h * 0.76;
      g.fillStyle = A(T.ink, 0.06); g.fillRect(0, base, W, H - base);
      for (let k = 0; k < 14; k++) { const x = ((k * 190 * u - t * 26 * u) % (W + 190 * u) + W + 190 * u) % (W + 190 * u) - 100 * u; g.fillStyle = A(T.blue, 0.13); g.save(); g.translate(x, base - 44 * u); GLY[k % 3 === 0 ? "house" : "box"](g, 96 * u); g.restore(); }
    } else if (sid === "process") {
      const cy = bx.y + bx.h * 0.5;
      g.fillStyle = A(T.ink, 0.07); g.fillRect(0, cy - 26 * u, W, 52 * u);
      g.strokeStyle = A(T.ink, 0.3); g.lineWidth = 3 * u; g.setLineDash([22 * u, 18 * u]); g.lineDashOffset = -t * 60 * u;
      g.beginPath(); g.moveTo(0, cy); g.lineTo(W, cy); g.stroke(); g.setLineDash([]);
      for (let k = 0; k < 18; k++) { const x = ((k * 140 * u + t * 40 * u) % (W + 140 * u)) - 70 * u; g.beginPath(); g.arc(x, cy + 44 * u, 16 * u, 0, TAU); g.strokeStyle = A(T.ink, 0.25); g.stroke(); const a = t * 3 + k; g.beginPath(); g.moveTo(x, cy + 44 * u); g.lineTo(x + Math.cos(a) * 14 * u, cy + 44 * u + Math.sin(a) * 14 * u); g.stroke(); }
    } else if (sid === "compare") {
      for (let i = 0; i < 26; i++) { const h = (0.3 + 0.7 * Math.abs(Math.sin(t * 1.1 + i * 0.9))) * 120 * u, x = (i / 26) * W; g.fillStyle = A(T.acc, 0.045); g.fillRect(x, H - 64 * u - h, W / 26 - 8 * u, h); }
    } else {
      // Title and closing: concentric guide rings and a long row of symbols that stamp in and keep travelling.
      const rowY = T.tall ? H * 0.9 : H * 0.855, size = (T.tall ? 112 : 108) * u, pitch = size * 1.22;
      const cols2 = Math.ceil(W / pitch) + 3, off = (t * 46 * u * (sid === "closing" ? -1 : 1) % pitch + pitch) % pitch;
      for (let i = -1; i < cols2 && sid !== "closing"; i++) {
        const x = i * pitch + off, ord = Math.floor(x / pitch), qi = clamp((lt * 1.6 - Math.max(0, x) / W * 1.2) / 0.5);
        const k = KINDS[(((i - Math.round((t * 46 * u * (sid === "closing" ? -1 : 1) - off) / pitch)) % KINDS.length) + KINDS.length * 4) % KINDS.length];
        const lit = sid === "closing" ? clamp((lt * 2.2 - x / W * 1.6)) > 0.5 : ((i + Math.floor(t * 2.4)) % 5 === 0);
        const pulse = Math.max(0, 1 - Math.abs(((x / pitch - t * 3.2 + 40) % 14) - 1) / 2);
        unit(g, T, k, x, rowY - pulse * 10 * u + Math.sin(t * 2.4 + ord) * 3 * u, size, lit ? T.acc : ord % 2 ? T.blue : T.ink, { q: qi, sc: 1 + pulse * 0.14, slot: 0.08 });
      }
      // Upper band: three conveyor rows of smaller symbols, each running its own way.
      g.save(); g.globalAlpha *= fade;
      for (let r = 0; r < 3; r++) {
        const sz = (T.tall ? 76 : 60) * u, pc = sz * 1.3, dir = r % 2 ? -1 : 1, y = (T.tall ? H * 0.075 : 78 * u) + r * sz * 1.28 + sz * 0.7;
        const o3 = ((t * (30 + r * 14) * u * dir) % pc + pc) % pc, cnt = Math.ceil(W / pc) + 2;
        for (let i = -1; i < cnt; i++) {
          const x = i * pc + o3, shift = Math.round((t * (30 + r * 14) * u * dir - o3) / pc), kk = KINDS[((((i - shift) * (r + 1) + r * 3) % 10) + 10) % 10];
          const pulse = Math.max(0, 1 - Math.abs((((x / pc) * dir - t * 4 + 60) % 16) - 2) / 2.2), lit = sid === "closing" ? clamp(lt * 2.4 - x / W * 1.8 - r * 0.2) > 0.5 : (i - shift + r * 2) % 7 === 0;
          unit(g, T, kk, x, y + Math.sin(t * 2.2 + i * 0.7 + r) * 3 * u - pulse * 8 * u, sz, lit ? T.acc : r === 1 ? T.blue : T.ink, { q: clamp((lt * 2.2 - Math.abs(x - W / 2) / W * 1.4 - r * 0.15) / 0.4), sc: 1 + pulse * 0.16, slot: 0.07 });
        }
      }
      g.restore();
      if (sid === "closing") legend(g, T, lt, t);
    }
    g.restore();
    // Seed symbols drifting up through the whole sheet.
    for (const s of SEEDS) {
      const y = (((s.y * (H + 160 * u) - t * s.sp * u) % (H + 160 * u)) + H + 160 * u) % (H + 160 * u) - 80 * u, x = s.x * W + Math.sin(t * 0.8 + s.ph) * 34 * u;
      g.save(); g.translate(x, y); g.rotate(Math.sin(t * 0.7 + s.ph) * 0.35); g.fillStyle = A([T.ink, T.blue, T.acc][s.c], 0.16); GLY[KINDS[s.k]](g, s.sz * u); g.restore();
    }
  }

  // The sheet's furniture: symbol conveyors in both margins, scrolling rulers, registration marks.
  function furniture(g, T, t) {
    const { u, W, H } = T, top = 56 * u, bot = 46 * u;
    g.save();
    g.fillStyle = T.ink; g.fillRect(0, 0, W, top);
    const pitch = 84 * u, off = (t * 74 * u) % pitch;
    for (let i = -1; i < W / pitch + 2; i++) {
      const idx = i - Math.floor((t * 74 * u) / pitch);
      g.fillStyle = idx % 6 === 0 ? T.acc : T.paper; g.save(); g.translate(i * pitch + off, top / 2); GLY[KINDS[((idx % 10) + 10) % 10]](g, 36 * u); g.restore();
    }
    const wx = (((t * 0.11) % 1) * (W + 300 * u)) - 150 * u;
    g.fillStyle = A(T.acc, 0.9); g.fillRect(wx - 60 * u, top - 7 * u, 120 * u, 7 * u);
    g.fillStyle = T.ink; g.fillRect(0, H - bot, W, bot);
    const p2 = 70 * u, off2 = (-t * 52 * u % p2 + p2) % p2;
    for (let i = -1; i < W / p2 + 2; i++) {
      const idx = i + Math.floor((t * 52 * u) / p2);
      g.fillStyle = idx % 5 === 0 ? T.acc : A(T.paper, 0.85); g.save(); g.translate(i * p2 + off2, H - bot / 2); GLY[KINDS[(((idx * 3) % 10) + 10) % 10]](g, 28 * u); g.restore();
    }
    // Rulers.
    const xs = T.tall ? [22 * u, W - 22 * u] : [48 * u, W - 48 * u];
    g.strokeStyle = A(T.ink, 0.5); g.lineWidth = 2 * u;
    for (const x of xs) {
      g.beginPath(); g.moveTo(x, top + 8 * u); g.lineTo(x, H - bot - 8 * u);
      const o2 = (t * 30 * u) % (24 * u);
      for (let y = top + 8 * u - 24 * u + o2; y < H - bot - 8 * u; y += 24 * u) { if (y < top + 8 * u) continue; const long = Math.round((y - o2) / (24 * u)) % 5 === 0; g.moveTo(x, y); g.lineTo(x + (x < W / 2 ? 1 : -1) * (long ? 22 : 11) * u, y); }
      g.stroke();
    }
    // Registration marks.
    for (const [x, y] of [[xs[0], top + 40 * u], [xs[1], top + 40 * u], [xs[0], H - bot - 40 * u], [xs[1], H - bot - 40 * u]]) {
      g.strokeStyle = A(T.acc, 0.75); g.lineWidth = 2 * u; const ring = (t * 0.8) % 1;
      g.beginPath(); g.arc(x, y, 14 * u, 0, TAU); g.moveTo(x - 24 * u, y); g.lineTo(x + 24 * u, y); g.moveTo(x, y - 24 * u); g.lineTo(x, y + 24 * u); g.stroke();
      g.save(); g.globalAlpha = 1 - ring; g.beginPath(); g.arc(x, y, 14 * u + ring * 22 * u, 0, TAU); g.stroke(); g.restore();
    }
    g.restore();
  }

  // The printing roller that carries one plate out and the next in.
  function roller(g, T, rx, bw, t) {
    const { u, H } = T;
    g.save();
    g.fillStyle = A(T.ink, 0.22); g.fillRect(rx - bw / 2 + 12 * u, 0, bw, H);
    g.fillStyle = T.acc; g.fillRect(rx - bw / 2, 0, bw, H);
    g.fillStyle = "rgba(255,255,255,0.22)"; g.fillRect(rx - bw / 2 + bw * 0.12, 0, bw * 0.12, H);
    g.fillStyle = "rgba(0,0,0,0.16)"; g.fillRect(rx + bw / 2 - bw * 0.2, 0, bw * 0.2, H);
    g.beginPath(); g.rect(rx - bw / 2, 0, bw, H); g.clip();
    const pitch = 130 * u;
    for (let y = -pitch + ((t * 400 * u) % pitch); y < H + pitch; y += pitch) { g.fillStyle = T.paper; g.save(); g.translate(rx, y); g.rotate((y / pitch) * 0.3); GLY[KINDS[Math.abs(Math.round(y / pitch + t * 3)) % 10]](g, 56 * u); g.restore(); }
    g.restore();
  }

  // ---- scenes -------------------------------------------------------------------------------------
  const roll = (S, k) => lerp(-S.u * 70, S.W + S.u * 70, 1 - Math.pow(1 - clamp(k), 3.2));
  const BW = 92;

  // Every drawer is clipped to its side of the roller while the scenes cross, then given a worn-print finish.
  function wrap(fn) {
    return (g, S, box, p, d, info) => {
      const T = theme(S);
      g.save();
      const exiting = info.exit !== undefined;
      if (exiting || (FR.index > 0 && info.local < info.change)) {
        const k = exiting ? info.exit : info.local / Math.max(0.01, info.change), rx = roll(S, k), bw = BW * S.u;
        g.beginPath();
        if (exiting) g.rect(rx + bw / 2, 0, S.W, S.H); else g.rect(0, 0, rx - bw / 2, S.H);
        g.clip();
      }
      // Build from the moment the roller starts crossing, so no frame after a wipe is title plus paper.
      const pp = exiting ? 1 : clamp(0.16 + info.local / Math.max(0.9, info.hold * 0.5));
      fn(g, S, T, box, pp, d, info);
      // Worn-print dropout: paper-coloured specks over the inks.
      const n = Math.floor(SPECKS.length * T.tex);
      g.fillStyle = A(T.paper, 0.7);
      for (let i = 0; i < n; i++) { const s = SPECKS[i]; g.fillRect(box.x + s.x * box.w, box.y + s.y * box.h, s.z * T.u, s.z * T.u); }
      g.restore();
    };
  }

  // Data plates start right under the headline instead of at the template's illustration box.
  const lift = (S, box) => { const top = S.H * (S.tall ? 0.22 : 0.185); return { x: box.x, y: top, w: box.w, h: box.y + box.h - top }; };
  function chartScene(g, S, T, box, p, d, info) {
    box = lift(S, box);
    const { u } = T, t = info.t, n = d.values.length, max = Math.max(...d.values, 1), tall = S.tall;
    const unitV = niceUnit(max, 9), cols = Math.ceil(max / unitV - 1e-6);
    const legendH = (tall ? 100 : 84) * u, rowH = (box.h - legendH) / n;
    const labelW = tall ? 0 : 240 * u, valueW = tall ? 0 : 290 * u;
    const zx = box.x + labelW, zw = box.w - labelW - valueW;
    const pitch = (tall ? box.w : zw) / cols, size = tall ? Math.min(rowH * 0.46, pitch * 0.9) : Math.min(rowH * 0.8, pitch * 0.92);
    for (let i = 0; i < n; i++) {
      const y = box.y + i * rowH, hot = i === d.highlight, v = d.values[i], q = clamp((p - i * 0.11) / 0.5);
      if (hot) { g.fillStyle = A(T.acc, 0.14 * eo(q)); g.fillRect(box.x - 24 * u, y + 6 * u, (box.w + 48 * u) * eo(q), rowH - 12 * u); }
      g.save(); g.strokeStyle = A(T.ink, 0.4); g.lineWidth = 2.5 * u; g.setLineDash([2 * u, 11 * u]); g.lineCap = "round"; g.lineDashOffset = -t * 22 * u;
      g.beginPath(); g.moveTo(box.x, y + rowH - 3 * u); g.lineTo(box.x + box.w * eo(clamp(p * 2.2 - i * 0.1)), y + rowH - 3 * u); g.stroke(); g.restore();
      const ly = tall ? y + rowH * 0.2 : y + rowH * 0.5;
      say(g, d.labels[i] || "", box.x, ly, 46 * u, { base: "middle", color: hot ? T.acc : T.ink, maxW: tall ? box.w * 0.5 : labelW - 16 * u, min: 34 * u, q: clamp(q * 3), ghost: A(T.ink, 0.12) });
      const full = Math.floor(v / unitV + 1e-6), rem = v / unitV - full, count = full + (rem > 0.04 ? 1 : 0);
      const cy = tall ? y + rowH * 0.68 : y + rowH * 0.5, x0 = tall ? box.x : zx, ph = (t * 4.2 + i * 1.7) % (cols + 7);
      for (let j = 0; j < cols; j++) {
        const x = x0 + pitch * (j + 0.5), on = j < count, pulse = Math.max(0, 1 - Math.abs(j - ph) / 1.7);
        const qj = clamp((p - i * 0.11 - 0.05 - (j / cols) * 0.3) / 0.2);
        const col = hot ? T.acc : T.blue, wave = hot ? Math.sin(t * 3.4 - j * 0.65) * size * 0.05 : 0;
        unit(g, T, "clip", x, cy - pulse * size * 0.07 + wave, size, col, { q: on ? qj : 0, frac: j === full && rem > 0.04 ? rem : 1, sc: 1 + pulse * 0.15, slot: on ? 0 : 0.08 });
        if (on && j === full && rem > 0.04 && qj >= 1) { g.save(); g.strokeStyle = A(col, 0.5 + 0.4 * Math.sin(t * 5)); g.lineWidth = 2.5 * u; g.setLineDash([6 * u, 6 * u]); g.beginPath(); g.rect(x - size * 0.46, cy - size * 0.33, size * 0.92, size * 0.66); g.stroke(); g.restore(); }
      }
      const val = v * eo(clamp((p - i * 0.11) / 0.55));
      const vx = tall ? box.x + box.w : box.x + box.w, vy = tall ? y + rowH * 0.24 : cy;
      say(g, num(val, d, Math.abs(v % 1) > 0.001 ? 1 : 0), vx, vy, hot ? 116 * u : 70 * u, { align: "right", base: "middle", color: hot ? T.acc : T.ink, alpha: clamp(q * 4), track: 0, ghost: A(T.ink, 0.12) });
    }
    const ly = box.y + box.h - legendH * 0.5, lq = clamp((p - 0.15) / 0.3);
    if (lq > 0) {
      unit(g, T, "clip", box.x + 34 * u, ly, 62 * u, T.blue, { q: lq, rot: Math.sin(t * 1.6) * 0.12 });
      say(g, `each symbol = ${num(unitV, { suffix: d.suffix })}`, box.x + 86 * u, ly, 46 * u, { base: "middle", color: T.ink, q: lq, weight: 700 });
    }
  }

  function device(g, T, x, y, w, h, phone, t, p) {
    const { u } = T;
    g.save();
    g.beginPath(); rrp(g, x + 12 * u, y + 12 * u, w, h, (phone ? 40 : 22) * u); g.fillStyle = A(T.ink, 0.17); g.fill();
    g.beginPath(); rrp(g, x, y, w, h, (phone ? 40 : 22) * u); g.fillStyle = T.ink; g.fill();
    const pad = (phone ? 16 : 20) * u, sx = x + pad, sy = y + pad * (phone ? 2.2 : 1), sw = w - pad * 2, sh = h - pad * (phone ? 4.4 : 2);
    g.beginPath(); rrp(g, sx, sy, sw, sh, 8 * u); g.fillStyle = T.paper; g.fill();
    g.save(); g.beginPath(); rrp(g, sx, sy, sw, sh, 8 * u); g.clip();
    const k = eo(clamp(p * 3));
    if (!phone) {
      g.fillStyle = A(T.ink, 0.12); g.fillRect(sx, sy, sw, sh * 0.1);
      [T.acc, T.blue, T.ink].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(sx + sw * (0.03 + i * 0.03), sy + sh * 0.05, sh * 0.018, 0, TAU); g.fill(); });
      const pv = { x: sx + sw * 0.05, y: sy + sh * 0.15, w: sw * 0.9, h: sh * 0.43 };
      g.fillStyle = A(T.blue, 0.2); g.fillRect(pv.x, pv.y, pv.w, pv.h);
      g.save(); g.beginPath(); g.rect(pv.x, pv.y, pv.w, pv.h); g.clip();
      g.fillStyle = T.acc; g.beginPath(); g.arc(pv.x + pv.w * (0.2 + 0.6 * ((t * 0.06) % 1)), pv.y + pv.h * 0.42, pv.h * 0.17, 0, TAU); g.fill();
      g.fillStyle = A(T.ink, 0.6); g.beginPath(); g.moveTo(pv.x, pv.y + pv.h); for (let i = 0; i <= 10; i++) g.lineTo(pv.x + (pv.w * i) / 10, pv.y + pv.h * (0.72 - 0.12 * Math.sin(i * 1.3 + t * 0.8))); g.lineTo(pv.x + pv.w, pv.y + pv.h); g.fill();
      g.restore();
      for (let l = 0; l < 3; l++) {
        const ly = sy + sh * (0.66 + l * 0.11), step = sw * 0.13, o = (t * (26 + l * 14) * u) % step;
        g.fillStyle = A(T.ink, 0.07); g.fillRect(sx + sw * 0.05, ly - sh * 0.04, sw * 0.9, sh * 0.08);
        for (let c = -1; c < (sw * 0.9) / step + 1; c++) { const cx = sx + sw * 0.05 + c * step + (l % 2 ? o : -o + step); if (cx < sx + sw * 0.03 || cx > sx + sw * 0.97) continue; const idx = c + Math.floor((t * (26 + l * 14) * u) / step) * (l % 2 ? -1 : 1); g.fillStyle = [T.blue, T.ink, T.acc][((idx % 3) + 3) % 3]; g.save(); g.translate(cx, ly); GLY.clip(g, sh * 0.12); g.restore(); }
      }
      const phx = sx + sw * (0.05 + 0.9 * ((t * 0.13) % 1)); g.fillStyle = T.acc; g.fillRect(phx - 2 * u, sy + sh * 0.6, 4 * u, sh * 0.37); g.beginPath(); g.moveTo(phx - 8 * u, sy + sh * 0.6); g.lineTo(phx + 8 * u, sy + sh * 0.6); g.lineTo(phx, sy + sh * 0.65); g.fill();
    } else {
      g.fillStyle = A(T.ink, 0.12); g.fillRect(sx, sy, sw, sh * 0.07);
      const ch = sh * 0.2, o = (t * 44 * u) % ch;
      for (let c = -1; c < sh / ch + 1; c++) {
        const cy = sy + sh * 0.1 + c * ch + o, idx = c - Math.floor((t * 44 * u) / ch);
        g.beginPath(); rrp(g, sx + sw * 0.06, cy, sw * 0.88, ch * 0.84, 10 * u); g.fillStyle = A(T.ink, 0.07); g.fill();
        g.fillStyle = [T.acc, T.blue, T.ink][((idx % 3) + 3) % 3]; g.save(); g.translate(sx + sw * 0.22, cy + ch * 0.42); GLY[KINDS[((idx % 10) + 10) % 10]](g, ch * 0.5); g.restore();
        g.fillStyle = A(T.ink, 0.35); g.fillRect(sx + sw * 0.4, cy + ch * 0.25, sw * 0.46, ch * 0.1); g.fillRect(sx + sw * 0.4, cy + ch * 0.5, sw * 0.32, ch * 0.1);
      }
    }
    g.fillStyle = T.paper; g.globalAlpha = 1 - k; g.fillRect(sx, sy, sw, sh);
    g.restore();
    if (!phone) { g.beginPath(); g.moveTo(x - w * 0.07, y + h + 22 * u); g.lineTo(x + w * 1.07, y + h + 22 * u); g.lineTo(x + w * 1.02, y + h - 4 * u); g.lineTo(x - w * 0.02, y + h - 4 * u); g.closePath(); g.fillStyle = T.acc; g.fill(); }
    g.restore();
    return phone
      ? [[sx + sw * 0.22, sy + sh * 0.2], [sx + sw * 0.62, sy + sh * 0.5], [sx + sw * 0.3, sy + sh * 0.8]]
      : [[sx + sw * 0.7, sy + sh * 0.3], [sx + sw * 0.5, sy + sh * 0.7], [sx + sw * 0.16, sy + sh * 0.88]];
  }

  function objectScene(g, S, T, box, p, d, info) {
    const { u } = T, t = info.t, phone = d.kind === "phone", tall = S.tall;
    const area = tall ? { x: box.x, y: box.y, w: box.w, h: box.h * 0.6 } : { x: box.x, y: box.y, w: box.w * 0.58, h: box.h * 0.92 };
    let dw, dh;
    if (phone) { dh = Math.min(area.h * 0.96, area.w * 1.9); dw = dh * 0.5; } else { dw = Math.min(area.w * 0.92, area.h * 1.5); dh = dw * 0.6; }
    const dx = area.x + (area.w - dw) / 2, dy = area.y + (area.h - dh) / 2 - (phone ? 0 : 10 * u), dq = eo(clamp(p * 3));
    const cx = dx + dw / 2, cy = dy + dh / 2;
    // Symbols rise out of the screen and drift away.
    for (let i = 0; i < 11; i++) {
      const life = (t * 0.3 + i / 11) % 1, ang = -Math.PI / 2 + (((i * 37) % 11) / 11 - 0.5) * 1.4;
      const rr = dh * 0.12 + life * dh * 0.62, px = cx + Math.cos(ang) * rr * (phone ? 0.6 : 1.5), py = dy + dh * 0.1 + Math.sin(ang) * rr;
      g.save(); g.globalAlpha = Math.sin(life * Math.PI) * 0.9 * dq; g.translate(px, py); g.rotate(Math.sin(t + i) * 0.5); g.fillStyle = [T.acc, T.blue, T.ink][i % 3]; GLY[KINDS[(i * 3) % 10]](g, (phone ? 54 : 62) * u * (0.7 + life * 0.5)); g.restore();
    }
    g.save(); g.translate(cx, cy); g.scale(0.9 + 0.1 * dq, 0.9 + 0.1 * dq); g.translate(-cx, -cy); g.globalAlpha *= clamp(p * 4);
    const anchors = device(g, T, dx, dy, dw, dh, phone, t, p);
    g.restore();
    const cs = d.callouts || [];
    cs.forEach((label, i) => {
      const c = eo(clamp((p - 0.3 - i * 0.14) / 0.28));
      if (c <= 0 || !label) return;
      const [ax, ay] = anchors[i];
      g.save();
      const ring = (t * 1.3 + i * 0.33) % 1;
      g.strokeStyle = T.acc; g.lineWidth = 3 * u; g.globalAlpha = (1 - ring) * c; g.beginPath(); g.arc(ax, ay, 14 * u + ring * 26 * u, 0, TAU); g.stroke(); g.globalAlpha = c;
      g.beginPath(); g.arc(ax, ay, 9 * u, 0, TAU); g.fillStyle = T.acc; g.fill(); g.lineWidth = 3 * u; g.beginPath(); g.arc(ax, ay, 9 * u, 0, TAU); g.strokeStyle = T.paper; g.stroke();
      let lx, ly, pts;
      if (!tall) {
        lx = box.x + box.w * 0.64; ly = box.y + box.h * (0.18 + i * 0.28);
        const xv = dx + dw + 44 * u + i * 30 * u; pts = [[ax, ay], [xv, ay], [xv, ly], [lx - 34 * u, ly]];
      } else {
        lx = ax; ly = area.y + area.h + 70 * u; pts = [[ax, ay], [ax, ly - 34 * u]];
      }
      g.strokeStyle = T.acc; g.lineWidth = 4 * u; g.lineJoin = "round"; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      let total = 0; for (let k = 1; k < pts.length; k++) total += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      let left = total * c;
      for (let k = 1; k < pts.length; k++) { const dd = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); if (dd >= left) { const f = dd ? left / dd : 0; g.lineTo(pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * f, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * f); break; } left -= dd; g.lineTo(pts[k][0], pts[k][1]); }
      g.stroke();
      if (c > 0.92) {
        const bounce = 1 + Math.sin(t * 3 + i) * 0.04;
        g.save(); g.translate(lx, ly); g.scale(bounce, bounce); g.beginPath(); g.arc(0, 0, 30 * u, 0, TAU); g.fillStyle = T.acc; g.fill(); g.restore();
        say(g, String(i + 1), lx, ly + 2 * u, 40 * u, { align: "center", base: "middle", color: T.paper, track: 0 });
        if (!tall) {
          const w = say(g, label, lx + 50 * u, ly, 48 * u, { base: "middle", color: T.ink, maxW: box.x + box.w - lx - 50 * u, min: 40 * u, ghost: A(T.ink, 0.12) });
          g.strokeStyle = A(T.ink, 0.55); g.lineWidth = 3 * u; g.setLineDash([2 * u, 9 * u]); g.lineCap = "round"; g.lineDashOffset = -t * 20 * u; g.beginPath(); g.moveTo(lx + 50 * u, ly + 38 * u); g.lineTo(lx + 50 * u + Math.max(w, 200 * u), ly + 38 * u); g.stroke();
        }
      }
      g.restore();
      if (tall && c > 0.92) {
        const ry = area.y + area.h + 70 * u + (i + 1) * 92 * u;
        g.save(); g.beginPath(); g.arc(box.x + 36 * u, ry, 28 * u, 0, TAU); g.fillStyle = T.acc; g.fill(); g.restore();
        say(g, String(i + 1), box.x + 36 * u, ry + 2 * u, 38 * u, { align: "center", base: "middle", color: T.paper, track: 0 });
        say(g, label, box.x + 90 * u, ry, 50 * u, { base: "middle", color: T.ink, maxW: box.w - 100 * u, min: 40 * u, ghost: A(T.ink, 0.12) });
      }
    });
  }

  function bigPerson(g, T, cx, base, s, color, idx, t, hot, q) {
    const { u } = T, k = back(q);
    g.save(); g.globalAlpha *= clamp(q * 3); g.translate(cx, base + (1 - k) * s * 0.4);
    g.rotate(Math.sin(t * 2.2 + idx * 1.3) * 0.015);
    const step = Math.sin(t * 3 + idx) * 0.03 * s;
    g.fillStyle = T.ink;
    g.beginPath(); rrp(g, -0.2 * s + step, -0.3 * s, 0.17 * s, 0.3 * s, 0.05 * s); rrp(g, 0.03 * s - step, -0.3 * s, 0.17 * s, 0.3 * s, 0.05 * s); g.fill();
    g.fillStyle = color; g.beginPath(); rrp(g, -0.28 * s, -0.66 * s, 0.56 * s, 0.44 * s, 0.17 * s); g.fill();
    // Arms: one hangs, one swings; the highlighted figure waves.
    g.strokeStyle = color; g.lineWidth = 0.1 * s; g.lineCap = "round";
    const arm = (sign, th) => { g.beginPath(); g.moveTo(sign * 0.28 * s, -0.58 * s); g.lineTo(sign * (0.28 * s + Math.sin(th) * 0.34 * s), -0.58 * s + Math.cos(th) * 0.34 * s); g.stroke(); };
    arm(-1, 0.22 + Math.sin(t * 2 + idx) * 0.08);
    arm(1, hot ? 2.5 + Math.sin(t * 5) * 0.45 : 0.22 + Math.sin(t * 2 + idx + 1) * 0.08);
    g.fillStyle = T.ink; g.beginPath(); g.arc(0, -0.84 * s, 0.17 * s, 0, TAU); g.fill();
    // One accessory each: cap, glasses, headset, tie.
    const m = idx % 4;
    if (m === 0) { g.fillStyle = color; g.beginPath(); g.arc(0, -0.87 * s, 0.18 * s, Math.PI, TAU); g.fill(); g.fillRect(-0.04 * s, -0.9 * s, 0.26 * s, 0.045 * s); }
    else if (m === 1) { g.strokeStyle = T.paper; g.lineWidth = 0.03 * s; g.beginPath(); g.arc(-0.07 * s, -0.84 * s, 0.05 * s, 0, TAU); g.moveTo(0.12 * s, -0.84 * s); g.arc(0.07 * s, -0.84 * s, 0.05 * s, 0, TAU); g.stroke(); }
    else if (m === 2) { g.strokeStyle = color; g.lineWidth = 0.035 * s; g.beginPath(); g.arc(0, -0.86 * s, 0.2 * s, Math.PI * 1.05, Math.PI * 1.95); g.stroke(); g.beginPath(); g.arc(-0.2 * s, -0.8 * s, 0.045 * s, 0, TAU); g.fillStyle = color; g.fill(); }
    else { g.fillStyle = T.paper; g.beginPath(); g.moveTo(-0.05 * s, -0.66 * s); g.lineTo(0.05 * s, -0.66 * s); g.lineTo(0.03 * s, -0.4 * s); g.lineTo(0, -0.34 * s); g.lineTo(-0.03 * s, -0.4 * s); g.closePath(); g.fill(); }
    g.restore();
  }

  function peopleScene(g, S, T, box, p, d, info) {
    const { u } = T, t = info.t, n = Math.max(2, Math.min(6, Math.round(d.count))), base = box.y + box.h * 0.74;
    const size = Math.min(box.h * 0.5, (box.w / n) * 0.95);
    g.strokeStyle = T.ink; g.lineWidth = 5 * u; g.lineCap = "round"; g.beginPath(); g.moveTo(box.x - 30 * u, base); g.lineTo(box.x - 30 * u + (box.w + 60 * u) * eo(p * 2.4), base); g.stroke();
    // Crowd rows: the same symbol again and again, a wave of colour running through them.
    const cs = 46 * u, cp = 62 * u, ccols = Math.floor((box.w + 60 * u) / cp);
    const rowsN = S.tall ? 6 : 2;
    for (let r = 0; r < rowsN; r++) for (let j = 0; j < ccols; j++) {
      const x = box.x - 30 * u + cp * (j + 0.5), y = r < 2 ? base + (r ? 0.72 : 0.3) * (box.y + box.h - base) + 24 * u : box.y + 30 * u + (r - 2) * 72 * u;
      const ph = ((t * 7 - j + (r ? 5 : 0)) % (ccols + 8) + ccols + 8) % (ccols + 8), pulse = Math.max(0, 1 - Math.abs(ph - 2) / 3);
      const q = clamp((p - 0.15 - (j / ccols) * 0.5 - r * 0.1) / 0.2);
      unit(g, T, "person", x, y - pulse * 12 * u, cs, pulse > 0.55 ? T.acc : T.blue, { q, slot: 0.07, sc: 1 + pulse * 0.2 });
    }
    for (let i = 0; i < n; i++) {
      const q = clamp((p - (i / n) * 0.5) / 0.4), cx = box.x + (box.w / n) * (i + 0.5), hot = i === Math.min(n - 1, d.highlight);
      g.fillStyle = A(T.ink, 0.13); g.beginPath(); g.ellipse(cx, base + 8 * u, size * 0.36, size * 0.07, 0, 0, TAU); g.fill();
      bigPerson(g, T, cx, base, size * (hot ? 1.08 : 1), hot ? T.acc : T.blue, i, t, hot, q);
      const label = d.badges[i], bq = clamp((q - 0.7) / 0.3);
      if (bq > 0 && label) {
        const bs = 44 * u, bw = Math.min(box.w / n - 20 * u, textW(g, label, bs) + 50 * u), by = base - size * 1.12 - 78 * u - Math.sin(t * 2 + i) * 4 * u;
        g.save(); g.translate(cx, by + 33 * u); g.scale(back(bq), back(bq)); g.translate(-cx, -(by + 33 * u));
        plate(g, T, cx - bw / 2, by, bw, 66 * u, { fill: hot ? T.acc : T.panel, stroke: T.ink, r: 10 });
        say(g, label, cx, by + 35 * u, bs, { align: "center", base: "middle", color: hot ? T.paper : T.ink, maxW: bw - 30 * u, min: 38 * u });
        g.restore();
      }
    }
  }

  function processScene(g, S, T, box, p, d, info) {
    const { u } = T, t = info.t, n = d.steps.length, tall = S.tall, kinds = ["clip", "gear", "star", "box"];
    const cell = tall ? box.h / n : box.w / n;
    const pw = tall ? Math.min(box.w * 0.9, cell * 0.62 * 1.7) : cell * 0.74, ph = tall ? cell * 0.7 : Math.min(box.h * 0.8, pw * 1.12);
    const ctr = (i) => tall ? [box.x + box.w / 2, box.y + cell * (i + 0.5)] : [box.x + cell * (i + 0.5), box.y + box.h / 2];
    // The token that rides the line: where it is decides which plate bumps.
    const f = (t * 0.22) % 1, segF = f * (n - 1), si = Math.min(n - 2, Math.floor(segF)), sk = segF - si;
    const a = ctr(si), b = ctr(si + 1), tp = [lerp(a[0], b[0], eio(sk)), lerp(a[1], b[1], eio(sk))];
    for (let i = 0; i < n - 1; i++) {
      const q = clamp((p - 0.1 - i * 0.13) / 0.3);
      const c1 = ctr(i), c2 = ctr(i + 1), x1 = c1[0] + (tall ? 0 : pw / 2 + 10 * u), y1 = c1[1] + (tall ? ph / 2 + 10 * u : 0), x2 = c2[0] - (tall ? 0 : pw / 2 + 10 * u), y2 = c2[1] - (tall ? ph / 2 + 10 * u : 0);
      g.save(); g.strokeStyle = T.ink; g.lineWidth = 6 * u; g.lineCap = "round"; g.beginPath(); g.moveTo(x1, y1); g.lineTo(lerp(x1, x2, eo(q)), lerp(y1, y2, eo(q))); g.stroke();
      if (q > 0.9) {
        g.fillStyle = T.acc; const L = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / L, uy = (y2 - y1) / L, step = 38 * u;
        for (let k = ((t * 70 * u) % step); k < L - 22 * u; k += step) { const px = x1 + ux * k, py = y1 + uy * k; g.beginPath(); g.moveTo(px + ux * 14 * u - uy * 11 * u, py + uy * 14 * u + ux * 11 * u); g.lineTo(px + ux * 14 * u + uy * 11 * u, py + uy * 14 * u - ux * 11 * u); g.lineTo(px + ux * 28 * u, py + uy * 28 * u); g.closePath(); g.fill(); }
        g.beginPath(); g.moveTo(x2 - ux * 4 * u - uy * 16 * u, y2 - uy * 4 * u + ux * 16 * u); g.lineTo(x2 + ux * 12 * u, y2 + uy * 12 * u); g.lineTo(x2 - ux * 4 * u + uy * 16 * u, y2 - uy * 4 * u - ux * 16 * u); g.closePath(); g.fillStyle = T.ink; g.fill();
      }
      g.restore();
    }
    for (let i = 0; i < n; i++) {
      const [gx0, gy0] = ctr(i); g.save(); g.strokeStyle = A(T.ink, 0.28); g.lineWidth = 3 * u; g.setLineDash([12 * u, 10 * u]); g.lineDashOffset = -t * 24 * u; g.beginPath(); rrp(g, gx0 - pw / 2, gy0 - ph / 2, pw, ph, 18 * u); g.stroke(); g.restore();
      g.save(); g.fillStyle = A(T.ink, 0.07); g.translate(gx0, gy0); g.rotate(t * 0.5 * (i % 2 ? -1 : 1)); GLY[i === 0 ? "clip" : i === n - 1 ? "star" : "gear"](g, Math.min(pw, ph) * 0.42); g.restore();
    }
    for (let i = 0; i < n; i++) {
      const q = clamp((p - i * 0.13) / 0.3), [cx, cy] = ctr(i), near = Math.max(0, 1 - Math.hypot(tp[0] - cx, tp[1] - cy) / (pw * 0.9)), hot = i === n - 1;
      if (q <= 0) continue;
      const k = back(q), sc = k * (1 + near * 0.05);
      g.save(); g.globalAlpha = clamp(q * 3); g.translate(cx, cy); g.scale(sc, sc); g.translate(-cx, -cy);
      plate(g, T, cx - pw / 2, cy - ph / 2, pw, ph, { fill: hot ? A(T.acc, 0.14) : T.panel, stroke: hot ? T.acc : T.ink, r: 18 });
      const gs = Math.min(pw, ph) * 0.42, gx = cx, gy = cy - ph * 0.08;
      g.save(); g.translate(gx, gy);
      const kind = kinds[hot ? 2 : i % 2];
      if (kind === "gear") g.rotate(t * 0.9); else if (kind === "star") { const z = 1 + Math.sin(t * 3) * 0.08; g.scale(z, z); g.rotate(Math.sin(t * 1.5) * 0.15); } else g.translate(Math.sin(t * 2.2) * 5 * u, 0);
      g.fillStyle = A(T.ink, 0.16); g.translate(gs * 0.04, gs * 0.04); GLY[kind](g, gs); g.translate(-gs * 0.04, -gs * 0.04);
      g.fillStyle = hot ? T.acc : i % 2 ? T.blue : T.ink; GLY[kind](g, gs); g.restore();
      say(g, d.steps[i], cx, cy + ph * 0.34, 46 * u, { align: "center", base: "middle", color: hot ? T.acc : T.ink, maxW: pw - 40 * u, min: 38 * u, q: clamp((q - 0.4) / 0.5) });
      g.beginPath(); g.arc(cx - pw / 2 + 4 * u, cy - ph / 2 + 4 * u, 31 * u, 0, TAU); g.fillStyle = T.acc; g.fill();
      say(g, String(i + 1), cx - pw / 2 + 4 * u, cy - ph / 2 + 6 * u, 42 * u, { align: "center", base: "middle", color: T.paper, track: 0 });
      if (near > 0.7) { g.strokeStyle = A(T.acc, (near - 0.7) * 2); g.lineWidth = 5 * u; g.beginPath(); rrp(g, cx - pw / 2 - 10 * u, cy - ph / 2 - 10 * u, pw + 20 * u, ph + 20 * u, 24 * u); g.stroke(); }
      g.restore();
    }
    if (p > 0.55) { g.save(); g.globalAlpha = clamp((p - 0.55) * 4) * (1 - 0.8 * Math.max(0, 1 - Math.hypot(tp[0] - ctr(Math.round(segF))[0], tp[1] - ctr(Math.round(segF))[1]) / (pw * 0.5))); g.translate(tp[0], tp[1] - 8 * u); g.rotate(Math.sin(t * 6) * 0.12); g.fillStyle = A(T.ink, 0.2); GLY.box(g, 74 * u); g.translate(-3 * u, -3 * u); g.fillStyle = T.acc; GLY.box(g, 74 * u); g.restore(); }
  }

  function compareScene(g, S, T, box, p, d, info) {
    box = lift(S, box);
    const { u } = T, t = info.t, tall = S.tall, gap = (tall ? 190 : 130) * u, rowH = (box.h - gap) / 2;
    const numW = tall ? 0 : 340 * u, zx = box.x, zw = box.w - numW;
    const vals = [d.leftValue, d.rightValue], labels = [d.left, d.right], maxV = Math.max(...vals, 1);
    const unitV = niceUnit(maxV, tall ? 8 : 10), cols = Math.ceil(maxV / unitV - 1e-6);
    const pitch = zw / cols, size = Math.min(rowH * (tall ? 0.36 : 0.52), pitch * 0.92);
    [0, 1].forEach((i) => {
      const q = clamp((p - i * 0.3) / 0.5), y = box.y + i * (rowH + gap), hot = i === 1, v = vals[i], col = hot ? T.acc : T.blue;
      const full = Math.floor(v / unitV + 1e-6), rem = v / unitV - full, count = full + (rem > 0.04 ? 1 : 0);
      if (hot) { g.fillStyle = A(T.acc, 0.14 * eo(q)); g.fillRect(box.x - 24 * u, y, (box.w + 48 * u) * eo(q), rowH); }
      say(g, labels[i] || "", box.x + 4 * u, y + 52 * u, 54 * u, { base: "middle", color: hot ? T.acc : T.ink, maxW: box.w * 0.5, min: 40 * u, q: clamp(q * 3), ghost: A(T.ink, 0.12) });
      const cy = y + rowH * (tall ? 0.62 : 0.6);
      for (let j = 0; j < cols; j++) {
        const x = zx + pitch * (j + 0.5), on = j < count, qj = clamp((p - i * 0.3 - 0.06 - (j / cols) * 0.3) / 0.2);
        unit(g, T, "box", x, cy, size, col, { q: on ? qj : 0, frac: j === full && rem > 0.04 ? rem : 1, slot: on ? 0 : 0.08 });
      }
      const val = v * eo(clamp((p - i * 0.3) / 0.55)), ns = hot ? 160 * u : 130 * u;
      say(g, num(val, d, Math.abs(v % 1) > 0.001 ? 1 : 0), tall ? box.x + box.w : box.x + box.w, tall ? y + 56 * u : cy, tall ? 120 * u : ns, { align: "right", base: "middle", color: col === T.blue ? T.ink : T.acc, alpha: clamp(q * 4), track: 0, ghost: A(T.ink, 0.12) });
      g.save(); g.strokeStyle = A(T.ink, 0.4); g.lineWidth = 2.5 * u; g.setLineDash([2 * u, 11 * u]); g.lineCap = "round"; g.lineDashOffset = -t * 22 * u; g.beginPath(); g.moveTo(box.x, y + rowH - 4 * u); g.lineTo(box.x + box.w * eo(q), y + rowH - 4 * u); g.stroke(); g.restore();
    });
    // The change between the two rows, stamped on.
    const lo = Math.min(...vals), hi = Math.max(...vals), qs = back(clamp((p - 0.55) / 0.3));
    if (qs > 0 && lo > 0 && hi !== lo) {
      const down = vals[1] < vals[0], txt = down ? `−${Math.round((1 - vals[1] / vals[0]) * 100)}%` : `×${Math.round((vals[1] / vals[0]) * 10) / 10}`;
      const cx = box.x + box.w - (tall ? 190 : 230) * u, cy = box.y + rowH + gap / 2, bs = 100 * u, w = textW(g, txt, bs) + 60 * u;
      g.save(); g.translate(cx, cy); g.rotate(-0.07 - (1 - clamp((p - 0.55) / 0.3)) * 0.25); g.scale(qs, qs);
      g.beginPath(); rrp(g, -w / 2 + 6 * u, -gap * 0.44 + 6 * u, w, gap * 0.88, 14 * u); g.fillStyle = A(T.ink, 0.2); g.fill();
      g.beginPath(); rrp(g, -w / 2, -gap * 0.44, w, gap * 0.88, 14 * u); g.fillStyle = T.paper; g.fill(); g.lineWidth = 6 * u; g.strokeStyle = T.acc; g.stroke();
      say(g, txt, 0, 4 * u, bs, { align: "center", base: "middle", color: T.acc, track: 0 });
      g.restore();
      g.save(); g.fillStyle = T.ink; const ax = box.x + 30 * u, ay0 = box.y + rowH + 14 * u, ay1 = box.y + rowH + gap - 14 * u, off = (t * 40 * u) % (34 * u);
      for (let y = ay0 - 34 * u + off; y < ay1; y += 34 * u) { if (y < ay0) continue; g.beginPath(); g.moveTo(ax - 12 * u, y); g.lineTo(ax + 12 * u, y); g.lineTo(ax, y + 18 * u); g.closePath(); g.fill(); }
      g.restore();
    }
  }

  function stage(g, S, info) {
    FR.index = info.index; FR.scene = info.scene;
    if (!S.paint) return;
    const T = theme(S), t = info.t, sid = info.scene || "title";
    const ctl = (window.__dreamcut && window.__dreamcut.controls) || {};
    const shown = ORDER.filter((id) => Number(ctl[id + "_hold"] ?? 1) > 0);
    const prev = info.index > 0 ? shown[info.index - 1] : null;
    if (prev && info.local < info.change) {
      const k = clamp(info.local / Math.max(0.01, info.change)), rx = roll(S, k), bw = BW * S.u, ph = Number(ctl[prev + "_hold"] ?? 2);
      g.save(); g.beginPath(); g.rect(rx + bw / 2, 0, S.W, S.H); g.clip(); world(g, T, prev, ph + info.local, t, 1 - clamp(k * 4)); g.restore();
      g.save(); g.beginPath(); g.rect(0, 0, rx - bw / 2, S.H); g.clip(); world(g, T, sid, info.local, t); g.restore();
      furniture(g, T, t);
      roller(g, T, rx, bw, t);
    } else { world(g, T, sid, info.local, t); furniture(g, T, t); }
  }

  // Paper: fibres, foxing and a darkened edge, cached once and redrawn from time alone.
  let PAPER = null;
  function paintPaper(ctx, W, H, look) {
    if (!PAPER || PAPER.width !== W || PAPER.height !== H || PAPER.key !== look.bg) {
      const c = document.createElement("canvas"); c.width = W; c.height = H; c.key = look.bg;
      const g = c.getContext("2d"), r = rng(31), ink = look.ink;
      for (let i = 0; i < 520; i++) { const x = r() * W, y = r() * H, a = r() * TAU, l = (10 + r() * 38) * (H / 1080); g.strokeStyle = A(ink, 0.025 + r() * 0.035); g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + r() * 6, y + Math.sin(a) * l * 0.5 + r() * 6, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
      for (let i = 0; i < 70; i++) { const x = r() * W, y = r() * H, rad = (4 + r() * 22) * (H / 1080), gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, A(look.accent, 0.07 * r() + 0.02)); gr.addColorStop(1, A(look.accent, 0)); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
      const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.75); v.addColorStop(0, A(ink, 0)); v.addColorStop(1, A(ink, look.dark ? 0.35 : 0.16)); g.fillStyle = v; g.fillRect(0, 0, W, H);
      PAPER = c;
    }
    ctx.clearRect(0, 0, W, H); ctx.drawImage(PAPER, 0, 0);
  }

  return {
    bg: "#efe4cc", panel: "#f8f0dc", ink: "#2a2b36", muted: "rgba(42,43,54,0.64)", accent: "#c4472d", onAccent: "#f8f0dc", blue: "#2f6078",
    rule: "rgba(42,43,54,0.4)", track: "rgba(42,43,54,0.1)",
    display: FACE, displayWeight: 800, displayCase: "uppercase", displayTracking: "0.015em",
    body: FACE, bodyWeight: 700, figures: FACE, radius: 14, motion: "wipe", change: "grid", kit: { line: 4, fill: "solid", panel: "fill" },
    palettes: {
      light: { bg: "#f6efde", panel: "#fffaf0", paper: "#f6efde" },
      dark: { dark: true, bg: "#1d202c", panel: "#272b3a", ink: "#efe5cb", muted: "rgba(239,229,203,0.68)", accent: "#ff7b54", onAccent: "#1d202c", blue: "#79b0c6", rule: "rgba(239,229,203,0.4)", track: "rgba(239,229,203,0.12)" },
      mono: { bg: "#e5e5e1", panel: "#f4f4f0", ink: "#222428", muted: "rgba(34,36,40,0.64)", accent: "#4d5057", onAccent: "#f4f4f0", blue: "#8d9096", rule: "rgba(34,36,40,0.4)", track: "rgba(34,36,40,0.1)" },
    },
    textShadow: (accent) => `3px 3px 0 ${A(accent, 0.2)}`,
    backdrop: (accent, texture = 1, look) => `${grain(0.06 * texture)}, ${look.bg}`,
    css: (accent, look) => `
      #title-scene .kicker { align-self: flex-start; padding: 0.25em 0.8em 0.2em; border: 4px solid ${accent}; color: ${accent}; letter-spacing: 0.18em; transform: rotate(-1.6deg); text-shadow: none; font-family: ${FACE}; font-weight: 800; }
      #title { padding-bottom: 0.14em; border-bottom: 12px solid ${look.ink}; }
      #closing { padding-bottom: 0.14em; border-bottom: 12px solid ${accent}; }
      .scene:not(.statement) .display { padding-left: 0.42em; border-left: 0.2em solid ${accent}; }`,
    paint: (ctx, W, H, t, accent, look) => paintPaper(ctx, W, H, { ...look, accent }),
    keepArt: true,
    overlap: true,
    stage,
    scenes: { chart: wrap(chartScene), object: wrap(objectScene), people: wrap(peopleScene), process: wrap(processScene), compare: wrap(compareScene) },
  };
});
