// Bauhaus: an exhibition poster that moves. Cream stock, primary red, yellow and blue with black,
// every figure built from circles, triangles and squares, numerals constructed from arcs and bars.
// The stage is a full-frame poster composition per scene (overprinted colour slabs, split discs,
// ringed quarter circles, equaliser bars, dot grids) that never stops turning; a cream headline
// plate and an art panel sit on it with hard offset shadows. Scenes change through striped colour
// shutters that wipe the next composition in while the old drawing is cut away on the same edge.
// All drawings are original. Frames are pure functions of time.
window.DreamcutMotion.register("bauhaus", ({ rng, hexA }) => {
  const PI = Math.PI, TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const inout = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const lerp = (a, b, k) => a + (b - a) * k;
  const stagger = (p, i, n, spread = 0.55) => ease((p - (i / Math.max(1, n)) * spread) / (1 - spread));
  const FONT = "'Futura', 'Century Gothic', 'Avenir Next', 'Trebuchet MS', 'Helvetica Neue', Arial, sans-serif";

  let cur = { index: 0 };
  let cache = null;

  // ---- colour --------------------------------------------------------------------------------------
  const paletteOf = (S) => {
    const l = S.look;
    return { paper: l.bg, ink: l.ink, red: S.accent, yel: l.c2, blu: l.c3, blk: l.k || l.ink, mix: l.mix !== false, muted: l.muted };
  };
  const makeF = (g, S, t) => {
    const C = paletteOf(S);
    return { g, S, C, u: S.u, W: S.W, H: S.H, m: Math.min(S.W, S.H), t, a: (c, k) => hexA(c, k) };
  };
  const col = (F, key) => ({ r: F.C.red, y: F.C.yel, b: F.C.blu, k: F.C.blk, p: F.C.paper, R: F.C.red, Y: F.C.yel, B: F.C.blu }[key] || key);

  // ---- constructed numerals ------------------------------------------------------------------------
  // Digits drawn from arcs and straight bars, butt-ended. h is the glyph height; each is 0.6h wide.
  function glyph(g, ch, x, y, h) {
    const X = (a) => x + a * h, Y = (b) => y + b * h;
    g.beginPath();
    const mv = (a, b) => g.moveTo(X(a), Y(b)), ln = (a, b) => g.lineTo(X(a), Y(b));
    const ar = (a, b, r, s, e) => g.arc(X(a), Y(b), r * h, s, e);
    const el = (a, b, rx, ry) => { g.moveTo(X(a + rx), Y(b)); g.ellipse(X(a), Y(b), rx * h, ry * h, 0, 0, TAU); };
    switch (ch) {
      case "0": el(0.3, 0.5, 0.22, 0.42); break;
      case "1": mv(0.1, 0.26); ln(0.36, 0.08); ln(0.36, 0.92); break;
      case "2": ar(0.3, 0.3, 0.22, PI, 2.2 * PI); ln(0.08, 0.92); ln(0.54, 0.92); break;
      case "3": ar(0.3, 0.28, 0.2, 1.15 * PI, 2.5 * PI); ar(0.3, 0.7, 0.22, 1.5 * PI, 2.85 * PI); break;
      case "4": mv(0.42, 0.92); ln(0.42, 0.08); ln(0.06, 0.64); ln(0.54, 0.64); break;
      case "5": mv(0.52, 0.08); ln(0.12, 0.08); ln(0.1, 0.46); ar(0.3, 0.68, 0.24, 1.33 * PI, 2.8 * PI); break;
      case "6": el(0.3, 0.66, 0.22, 0.26); mv(0.48, 0.08); ln(0.1, 0.62); break;
      case "7": mv(0.06, 0.08); ln(0.54, 0.08); ln(0.2, 0.92); break;
      case "8": el(0.3, 0.28, 0.2, 0.2); el(0.3, 0.7, 0.22, 0.24); break;
      case "9": el(0.3, 0.34, 0.22, 0.26); mv(0.52, 0.34); ln(0.12, 0.92); break;
      case "-": mv(0.06, 0.5); ln(0.54, 0.5); break;
      case "+": mv(0.06, 0.5); ln(0.54, 0.5); mv(0.3, 0.26); ln(0.3, 0.74); break;
      default: return false;
    }
    g.stroke();
    return true;
  }
  const isDigit = (ch) => "0123456789-+".includes(ch);
  // Draw a figure string. align: "left" | "center" | "right"; y is the top of the glyphs.
  function numerals(g, str, x, y, h, color, align = "left") {
    str = String(str);
    const adv = (ch) => (isDigit(ch) ? 0.6 * h : ch === "." || ch === "," ? 0.2 * h : h * 0.7);
    const gap = 0.2 * h;
    let w = -gap;
    for (const ch of str) w += adv(ch) + gap;
    let cx = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    g.save();
    g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 0.17 * h; g.lineCap = "butt"; g.lineJoin = "miter"; g.setLineDash([]);
    for (const ch of str) {
      if (isDigit(ch)) glyph(g, ch, cx, y, h);
      else if (ch === "." || ch === ",") g.fillRect(cx, y + h * 0.78, 0.17 * h, 0.17 * h);
      else {
        g.font = `800 ${h * 0.92}px ${FONT}`; g.textAlign = "left"; g.textBaseline = "alphabetic";
        g.fillText(ch, cx, y + h * 0.92);
      }
      cx += adv(ch) + gap;
    }
    g.restore();
    return w;
  }

  // ---- lettering ----------------------------------------------------------------------------------
  function setFont(g, size, weight = 800) { g.font = `${weight} ${size}px ${FONT}`; g.letterSpacing = 0.03 * size + "px"; }
  function say(g, str, x, y, size, o = {}) {
    str = String(str ?? "").toUpperCase();
    if (!str) return 0;
    setFont(g, size, o.weight || 800);
    let w = g.measureText(str).width;
    if (o.maxW && w > o.maxW) { size = Math.max(o.min || size * 0.8, (size * o.maxW) / w); setFont(g, size, o.weight || 800); w = g.measureText(str).width; }
    const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    g.textAlign = "left"; g.textBaseline = o.base || "alphabetic"; g.fillStyle = o.color;
    g.fillText(str, x0, y);
    g.letterSpacing = "0px";
    return w;
  }
  function wrap(g, str, maxW, size) {
    setFont(g, size);
    const words = String(str ?? "").toUpperCase().split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (line && g.measureText(test).width > maxW) { lines.push(line); line = word; } else line = test;
    }
    if (line) lines.push(line);
    g.letterSpacing = "0px";
    return lines;
  }
  // A label on a solid plate; plate and words wipe on together so one never shows without the other.
  function tag(F, str, x, y, size, q, o = {}) {
    if (q <= 0 || !str) return 0;
    const g = F.g, u = F.u, padX = (o.padX ?? 20) * u, h = size * 1.5;
    setFont(g, size);
    const w = g.measureText(String(str).toUpperCase()).width + padX * 2;
    g.letterSpacing = "0px";
    const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    g.save();
    g.beginPath(); g.rect(x0 - 2, y - 2, w * clamp(q) + 4, h + 4); g.clip();
    g.fillStyle = o.bg || F.C.blk; g.fillRect(x0, y, w, h);
    say(g, str, x0 + padX, y + h / 2, size, { color: o.fg || F.C.paper, base: "middle" });
    g.restore();
    return w;
  }

  // ---- poster motifs -------------------------------------------------------------------------------
  function disc(F, x, y, r, rot, a, b, key) {
    const g = F.g;
    g.save(); g.translate(x, y); g.rotate(rot);
    g.fillStyle = a; g.beginPath(); g.arc(0, 0, r, 0, PI); g.fill();
    g.fillStyle = b; g.beginPath(); g.arc(0, 0, r, PI, TAU); g.fill();
    g.restore();
    if (key) { g.save(); g.strokeStyle = F.C.ink; g.lineWidth = 3 * F.u; g.beginPath(); g.arc(x + 7 * F.u, y + 5 * F.u, r, 0, TAU); g.stroke(); g.restore(); }
  }
  function sector(F, x, y, r, q, c, t, n = 7) {
    const g = F.g;
    g.save(); g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, (q * PI) / 2, (q * PI) / 2 + PI / 2); g.closePath(); g.clip();
    const ph = (t * 0.5) % 1;
    g.strokeStyle = c; g.lineWidth = (r / n) * 0.52;
    for (let j = -1; j < n; j++) { g.beginPath(); g.arc(x, y, ((j + ph + 1) * r) / n, 0, TAU); g.stroke(); }
    g.restore();
  }
  function tri(F, x, y, s, rot, c) {
    const g = F.g;
    g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = c;
    g.beginPath(); g.moveTo(0, -s * 0.58); g.lineTo(s * 0.5, s * 0.4); g.lineTo(-s * 0.5, s * 0.4); g.closePath(); g.fill();
    g.restore();
  }
  function sq(F, x, y, s, rot, c) {
    const g = F.g;
    g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = c; g.fillRect(-s / 2, -s / 2, s, s); g.restore();
  }
  function stripes(F, x, y, w, h, n, c, t, vert, speed = 0.5) {
    const g = F.g, pitch = (vert ? w : h) / n, off = (t * speed * pitch) % pitch;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.fillStyle = c;
    for (let i = -1; i <= n; i++) {
      const o = i * pitch + off;
      if (vert) g.fillRect(x + o, y, pitch * 0.5, h); else g.fillRect(x, y + o, w, pitch * 0.5);
    }
    g.restore();
  }
  function dots(F, x, y, cols, rows, sp, r, c, t) {
    const g = F.g; g.fillStyle = c;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = 0.5 + 0.5 * Math.sin(t * 2.2 - (i + j) * 0.7);
      g.beginPath(); g.arc(x + i * sp, y + j * sp, Math.max(0.5, r * (0.35 + 0.65 * k)), 0, TAU); g.fill();
    }
  }
  function bar(F, x1, y1, x2, y2, w, c) {
    const g = F.g;
    g.save(); g.strokeStyle = c; g.lineWidth = w; g.lineCap = "butt"; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.restore();
  }
  function plus(F, x, y, s, c, rot) {
    const g = F.g;
    g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = c; g.fillRect(-s / 2, -s / 7, s, (2 * s) / 7); g.fillRect(-s / 7, -s / 2, (2 * s) / 7, s); g.restore();
  }
  function eq(F, x, y, w, h, n, c, t) {
    const g = F.g, bw = w / n; g.fillStyle = c;
    for (let i = 0; i < n; i++) {
      const k = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 2.4 + i * 0.9) * Math.cos(t * 1.1 + i * 0.4));
      g.fillRect(x + i * bw, y + h * (1 - k), bw * 0.72, h * k);
    }
  }
  function fan(F, x, y, r, c, t) {
    const g = F.g, u = F.u;
    g.save(); g.strokeStyle = c; g.lineWidth = 3 * u;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
    g.beginPath();
    for (let k = 0; k < 48; k++) { const a = (k / 48) * TAU, l = k % 4 === 0 ? 0.16 : 0.07; g.moveTo(x + Math.cos(a) * r * (1 - l), y + Math.sin(a) * r * (1 - l)); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    g.stroke();
    g.lineWidth = 9 * u; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(t * 0.8) * r * 0.82, y + Math.sin(t * 0.8) * r * 0.82); g.stroke();
    g.fillStyle = c; g.beginPath(); g.arc(x, y, 14 * u, 0, TAU); g.fill();
    g.restore();
  }
  function steps(F, x, y, s, n, c, flip, t) {
    const g = F.g; g.fillStyle = c;
    for (let i = 0; i < n; i++) { const hh = (s / n) * (i + 1); g.fillRect(flip ? x + s - (s / n) * (i + 1) : x + (s / n) * i, y + s - hh, s / n - 4 * F.u, hh); }
  }
  function semi(F, x, y, r, rot, c) {
    const g = F.g; g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = c; g.beginPath(); g.arc(0, 0, r, 0, PI); g.closePath(); g.fill(); g.restore();
  }
  function ring(F, x, y, r, w, c, t) {
    const g = F.g; g.save(); g.strokeStyle = c; g.lineWidth = w;
    if (t !== undefined) { const seg = (TAU * r) / 7; g.setLineDash([seg * 0.62, seg * 0.38]); g.lineDashOffset = -t * r * 0.45; }
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); g.restore();
  }

  // Poster layouts, as fractions of the frame. Seven compositions: five for the drawn scenes, one each for title and closing.
  // [type, x, y, ...args]; colours r y b k p (paper).
  const WORLDS = [
    // 0: yellow sun, blue column
    [["slab", 0.8, 0, 0.2, 1, "b"], ["disc", 0.9, 0.2, 0.2, "y", "r", 0.5], ["sec", 1, 1, 0.38, 2, "k"], ["tri", 0.855, 0.66, 0.2, "r", 0, 0.35],
      ["strp", 0, 0, 0.05, 1, "k", 6, 1], ["dots", 0.83, 0.45, 5, 6, 0.04, 0.014, "p"], ["bar", 0.66, 0, 0.99, 0.42, 0.02, "k"], ["plus", 0.96, 0.58, 0.08, "p", 0.4],
      ["eq", 0.82, 0.86, 0.16, 0.1, 8, "y"], ["ring", 0.9, 0.2, 0.26, 0.012, "k"]],
    // 1: red field, black stairs
    [["slab", 0.78, 0, 0.22, 0.52, "y"], ["slab", 0.78, 0.52, 0.22, 0.48, "r"], ["disc", 0.9, 0.16, 0.15, "b", "k", -0.6], ["sec", 0.78, 1, 0.3, 3, "k"],
      ["steps", 0.8, 0.5, 0.2, 5, "k", 0, 0], ["strp", 0, 0.9, 1, 0.1, "b", 8, 0], ["sq", 0.95, 0.46, 0.09, "p", 0.2, 0.5], ["fan", 0.89, 0.78, 0.09, "p", 0],
      ["tri", 0.7, 0.1, 0.12, "y", 1, -0.4], ["dots", 0.02, 0.3, 3, 10, 0.05, 0.016, "b"]],
    // 2: blue half-disc, red bars
    [["slab", 0.79, 0, 0.21, 0.35, "r"], ["slab", 0.79, 0.35, 0.21, 0.65, "k"], ["semi", 0.9, 0.35, 0.16, 0, "y", 0.2], ["disc", 0.9, 0.7, 0.12, "p", "b", 0.7],
      ["strp", 0.01, 0.0, 0.04, 1, "r", 5, 1], ["bar", 0.62, 0.0, 0.8, 0.42, 0.03, "b"], ["tri", 0.95, 0.12, 0.14, "y", 0.2, 0.3], ["eq", 0.81, 0.9, 0.17, 0.08, 7, "r"],
      ["plus", 0.86, 0.5, 0.07, "y", -0.5], ["sec", 1, 0.0, 0.3, 1, "p"]],
    // 3: yellow slab, black circle
    [["slab", 0.8, 0, 0.2, 1, "y"], ["disc", 0.9, 0.5, 0.18, "k", "r", -0.45], ["sec", 1, 0, 0.34, 1, "b"], ["tri", 0.85, 0.9, 0.18, "b", 0.5, 0.3],
      ["strp", 0, 0, 0.045, 1, "b", 6, 1], ["dots", 0.82, 0.12, 5, 5, 0.04, 0.014, "k"], ["fan", 0.88, 0.2, 0.08, "k", 1], ["bar", 0.7, 0.0, 0.55, 0.42, 0.018, "r"],
      ["sq", 0.96, 0.82, 0.07, "r", 0.1, 0.6]],
    // 4: red disc, blue stripes
    [["slab", 0.8, 0, 0.2, 1, "r"], ["disc", 0.9, 0.82, 0.16, "y", "b", 0.55], ["strp", 0.8, 0.0, 0.2, 0.34, "b", 10, 0], ["sec", 1, 1, 0.3, 2, "y"],
      ["tri", 0.88, 0.5, 0.18, "k", 0, -0.35], ["strp", 0, 0.0, 0.05, 1, "y", 6, 1], ["plus", 0.95, 0.4, 0.07, "p", 0.5], ["ring", 0.9, 0.82, 0.22, 0.012, "p"],
      ["bar", 0.66, 0.42, 0.78, 0.0, 0.02, "k"]],
    // 5: title hero, built around a centred plate
    [["slab", 0, 0, 1, 0.24, "b"], ["slab", 0, 0.76, 1, 0.24, "y"], ["disc", 0.16, 0.2, 0.2, "r", "k", 0.5], ["sec", 1, 0, 0.42, 1, "y"], ["tri", 0.82, 0.14, 0.24, "r", 0, 0.3],
      ["strp", 0.34, 0.0, 0.28, 0.2, "k", 10, 0], ["eq", 0.06, 0.82, 0.3, 0.14, 12, "k"], ["disc", 0.84, 0.84, 0.16, "b", "r", -0.6], ["sec", 0, 1, 0.4, 3, "r"],
      ["dots", 0.42, 0.8, 9, 4, 0.045, 0.016, "b"], ["fan", 0.66, 0.1, 0.08, "p", 0.5], ["plus", 0.5, 0.9, 0.08, "p", 0.7], ["bar", 0.0, 0.3, 0.14, 0.0, 0.025, "k"]],
    // 6: closing hero
    [["slab", 0, 0, 1, 0.24, "r"], ["slab", 0, 0.76, 1, 0.24, "b"], ["disc", 0.86, 0.18, 0.2, "y", "b", -0.5], ["sec", 0, 0, 0.42, 0, "y"], ["tri", 0.2, 0.88, 0.22, "Y", 0.2, -0.3],
      ["strp", 0.4, 0.78, 0.3, 0.2, "R", 10, 0], ["eq", 0.58, 0.04, 0.3, 0.14, 12, "k"], ["disc", 0.12, 0.2, 0.14, "b", "y", 0.8], ["sec", 1, 1, 0.4, 2, "y"],
      ["dots", 0.08, 0.78, 7, 4, 0.045, 0.016, "Y"], ["fan", 0.34, 0.1, 0.08, "p", 0.5], ["plus", 0.78, 0.88, 0.08, "Y", 0.7], ["sq", 0.93, 0.5, 0.07, "p", 0.2, 0.5]],
  ];

  // Stripes carry their colour in slot 5 and count in slot 6; handled here so the table stays compact.
  function drawItem(F, it, t, idx) {
    const { W, H, m } = F;
    const k = it[0], still = k === "slab" || k === "strp" || k === "bar" || k === "sec";
    const X = it[1] * W + (still ? 0 : Math.sin(t * 0.8 + idx * 1.9) * 22 * F.u), Y = it[2] * H + (still ? 0 : Math.cos(t * 0.65 + idx * 1.3) * 16 * F.u);
    const gA = F.g;
    // Light colours must print over the dark slabs, so paper is drawn without the overprint blend.
    const lightOnDark = (c) => c === "p";
    const prev = gA.globalCompositeOperation;
    const ck = { slab: 5, disc: 4, sec: 5, tri: 4, strp: 5, dots: 7, bar: 6, plus: 4, eq: 6, fan: 4, steps: 5, sq: 4, semi: 5, ring: 5 }[k];
    if (/^[pRYB]$/.test(it[ck])) gA.globalCompositeOperation = "source-over";
    switch (k) {
      case "slab": gA.fillStyle = col(F, it[5]); gA.fillRect(X, Y, it[3] * W, it[4] * H); break;
      case "disc": disc(F, X, Y, it[3] * m, t * it[6] * 1.5 + idx, col(F, it[4]), col(F, it[5]), true); break;
      case "sec": sector(F, X, Y, it[3] * m, it[4], col(F, it[5]), t + idx * 0.37); break;
      case "tri": tri(F, X, Y, it[3] * m, it[5] + t * it[6] + idx * 0.2, col(F, it[4])); break;
      case "strp": stripes(F, X, Y, it[3] * W, it[4] * H, it[6], col(F, it[5]), t + idx, !!it[7]); break;
      case "dots": if (lightOnDark(it[7])) gA.globalCompositeOperation = "source-over"; dots(F, X, Y, it[3], it[4], it[5] * m, it[6] * m, col(F, it[7]), t); break;
      case "bar": bar(F, X, Y, it[3] * W, it[4] * H, it[5] * m, col(F, it[6])); break;
      case "plus": if (lightOnDark(it[4])) gA.globalCompositeOperation = "source-over"; plus(F, X, Y, it[3] * m, col(F, it[4]), it[5] + t * 0.5); break;
      case "eq": eq(F, X, Y, it[3] * W, it[4] * H, it[5], col(F, it[6]), t); break;
      case "fan": if (lightOnDark(it[4])) gA.globalCompositeOperation = "source-over"; fan(F, X, Y, it[3] * m, col(F, it[4]), t + idx); break;
      case "steps": steps(F, X, Y, it[3] * m, it[4], col(F, it[5]), it[6], t); break;
      case "sq": if (lightOnDark(it[4])) gA.globalCompositeOperation = "source-over"; sq(F, X, Y, it[3] * m, it[5] + t * it[6], col(F, it[4])); break;
      case "semi": semi(F, X, Y, it[3] * m, it[4] + t * it[6], col(F, it[5])); break;
      case "ring": if (lightOnDark(it[5])) gA.globalCompositeOperation = "source-over"; ring(F, X, Y, it[3] * m, it[4] * m * 1.6, col(F, it[5]), t + idx); break;
      default: break;
    }
    gA.globalCompositeOperation = prev;
  }

  // ---- print finish --------------------------------------------------------------------------------
  function speckleTile(F) {
    if (cache && cache.tile) return cache.tile;
    const c = document.createElement("canvas");
    c.width = c.height = 420;
    const g = c.getContext("2d"), r = rng(74);
    for (let i = 0; i < 1500; i++) { g.fillStyle = F.a(F.C.paper, 0.35 + r() * 0.4); g.beginPath(); g.arc(r() * 420, r() * 420, 0.5 + r() * r() * 2.6, 0, TAU); g.fill(); }
    for (let i = 0; i < 520; i++) { g.fillStyle = F.a(F.C.ink, 0.05 + r() * 0.14); g.beginPath(); g.arc(r() * 420, r() * 420, 0.4 + r() * 1.1, 0, TAU); g.fill(); }
    g.lineWidth = 1;
    for (let i = 0; i < 70; i++) { const x = r() * 420, y = r() * 420, a = r() * TAU, l = 6 + r() * 20; g.strokeStyle = F.a(F.C.paper, 0.35); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    cache = cache || {};
    cache.tile = c;
    return c;
  }
  function speckle(F, x, y, w, h, alpha) {
    const g = F.g, tex = F.S.look.texture;
    if (tex <= 0.01) return;
    g.save();
    g.globalAlpha = alpha * tex;
    const pat = g.createPattern(speckleTile(F), "repeat"), step = Math.floor(F.t * 12);
    if (pat && pat.setTransform && typeof DOMMatrix !== "undefined") pat.setTransform(new DOMMatrix().translate((step * 137) % 420, (step * 251) % 420));
    g.fillStyle = pat;
    g.fillRect(x, y, w, h);
    g.restore();
  }

  // ---- plates, panels, rails -----------------------------------------------------------------------
  const geom = (F) => {
    const { S, u, W, H } = F;
    const side = (S.tall ? 90 : 140) * u;
    const textW = W - side * 2;
    const box = S.tall ? { x: side, y: H * 0.3, w: textW, h: H * 0.6 } : { x: side, y: H * 0.34, w: textW, h: H * 0.58 };
    const area = S.tall ? box : { x: box.x, y: box.y, w: box.w * 0.88, h: box.h };
    const headTop = (S.tall ? 170 : 96) * u;
    const plate = { x: side - 40 * u, w: textW * 0.82 + 80 * u, y: headTop - 36 * u, h: (S.tall ? 290 : 182) * u + 36 * u };
    return { side, textW, box, area, headTop, plate };
  };
  function measureStatements(F) {
    if (cache && cache.rects) return cache.rects;
    const q = (id) => document.getElementById(id);
    const rect = (scene, a, b) => {
      const s = q(scene), e1 = q(a), e2 = q(b);
      if (!s || !e1 || !e2) return null;
      return { top: s.offsetTop + e1.offsetTop, bot: s.offsetTop + e2.offsetTop + e2.offsetHeight };
    };
    cache = cache || {};
    cache.rects = { title: rect("title-scene", "kicker", "title"), closing: rect("closing-scene", "closing", "closing") };
    return cache.rects;
  }
  function headBottom(F, G, id) {
    cache = cache || {};
    cache.heads = cache.heads || {};
    if (cache.heads[id] === undefined) {
      const sc = document.getElementById(id + "-scene"), h = document.getElementById(id + "-title");
      cache.heads[id] = sc && h ? sc.offsetTop + h.offsetTop + h.offsetHeight : null;
    }
    return cache.heads[id];
  }
  function plateRect(F, G, kind, id) {
    if (kind === "head") {
      const b = id ? headBottom(F, G, id) : null, bottom = b ? b + 34 * F.u : G.plate.y + G.plate.h;
      return { ...G.plate, h: Math.max(110 * F.u, Math.min(G.plate.h, bottom - G.plate.y)), shadow: 14 * F.u };
    }
    const r = (measureStatements(F) || {})[kind];
    const u = F.u, top = r ? r.top : F.H * 0.36, bot = r ? r.bot : F.H * 0.64;
    return { x: G.side - 44 * u, w: G.textW + 88 * u, y: top - 44 * u, h: bot - top + 88 * u, shadow: 20 * u };
  }
  function drawPlate(F, pr, t, idx, statement, cut = 0) {
    const g = F.g, u = F.u, C = F.C;
    if (cut >= 1) return;
    g.save();
    // The plate leaves with its words (cut away left to right, the same way the headline goes).
    if (cut > 0) { const x0 = pr.x - 30 * u + (pr.w + pr.shadow + 60 * u) * cut; g.beginPath(); g.rect(x0, pr.y - 30 * u, F.W, pr.h + pr.shadow + 60 * u); g.clip(); }
    g.fillStyle = C.blk; g.fillRect(pr.x + pr.shadow, pr.y + pr.shadow, pr.w, pr.h);
    g.fillStyle = C.paper; g.fillRect(pr.x, pr.y, pr.w, pr.h);
    speckle(F, pr.x, pr.y, pr.w, pr.h, 0.35);
    // A moving three-colour strip along the top edge.
    g.save(); g.beginPath(); g.rect(pr.x, pr.y, pr.w, 18 * u); g.clip();
    const cols = [C.red, C.yel, C.blu, C.blk], seg = 90 * u, off = (t * 40 * u) % (seg * 4);
    for (let i = -4; i < pr.w / seg + 5; i++) { g.fillStyle = cols[((i % 4) + 4) % 4]; g.fillRect(pr.x + i * seg + off, pr.y, seg, 18 * u); }
    g.restore();
    // A pale colour bar sweeps across the stock under the words, again and again.
    const cyc = statement ? 2.4 : 3.2, sk = ((t + idx * 0.7) % cyc) / cyc, bw = pr.w * 0.22, bx = pr.x - bw - pr.h * 0.4 + sk * (pr.w + bw * 2 + pr.h * 0.8);
    g.save(); g.beginPath(); g.rect(pr.x, pr.y + 18 * u, pr.w, pr.h - 18 * u); g.clip();
    g.globalAlpha = statement ? 0.26 : 0.16; g.fillStyle = [C.yel, C.red, C.blu][Math.floor((t + idx * 0.7) / cyc) % 3];
    g.beginPath(); g.moveTo(bx, pr.y + pr.h); g.lineTo(bx + bw, pr.y + pr.h); g.lineTo(bx + bw + pr.h * 0.4, pr.y); g.lineTo(bx + pr.h * 0.4, pr.y); g.closePath(); g.fill();
    g.restore();
    g.strokeStyle = C.blk; g.lineWidth = 6 * u; g.strokeRect(pr.x, pr.y, pr.w, pr.h);
    if (statement) {
      // Three marks ride the bottom edge and hop one after another.
      const s = 34 * u, beat = t * 1.6;
      for (let i = 0; i < 3; i++) {
        const ph = (((beat - i * 0.33) % 1.5) + 1.5) % 1.5, hop = ph < 1 ? Math.sin(PI * ph) * 22 * u : 0;
        const cx = pr.x + pr.w - 70 * u - i * 64 * u, cy = pr.y + pr.h - hop;
        const c = [C.red, C.yel, C.blu][i];
        if (i === 0) { g.fillStyle = c; g.beginPath(); g.arc(cx, cy, s * 0.5, 0, TAU); g.fill(); }
        else if (i === 1) sq(F, cx, cy, s, t * 1.2, c);
        else tri(F, cx, cy, s * 1.1, Math.sin(t * 2) * 0.4, c);
      }
      // A rule along the left edge fills and drains.
      const fk = 0.5 - 0.5 * Math.cos(t * 1.3);
      g.fillStyle = C.red; g.fillRect(pr.x - 22 * u, pr.y + pr.h * (1 - fk), 12 * u, pr.h * fk);
    }
    g.restore();
  }
  function drawRail(F, y, t, idx) {
    const g = F.g, u = F.u, C = F.C, W = F.W;
    g.save();
    g.fillStyle = C.blk; g.fillRect(0, y - 3 * u, W, 6 * u);
    const pitch = 130 * u, off = (t * 70 * u) % (pitch * 3);
    for (let i = -3; i < W / pitch + 4; i++) {
      const x = i * pitch + off, k = ((i % 3) + 3) % 3, s = 28 * u;
      g.fillStyle = [C.red, C.yel, C.blu][(k + idx) % 3];
      if (k === 0) { g.beginPath(); g.arc(x, y, s * 0.5, 0, TAU); g.fill(); }
      else if (k === 1) g.fillRect(x - s * 0.5, y - s * 0.5, s, s);
      else { g.beginPath(); g.moveTo(x, y - s * 0.6); g.lineTo(x + s * 0.55, y + s * 0.45); g.lineTo(x - s * 0.55, y + s * 0.45); g.closePath(); g.fill(); }
    }
    g.restore();
  }
  function drawPanel(F, G, t, idx) {
    const g = F.g, u = F.u, C = F.C, a = G.area;
    const px = a.x - 40 * u, py = a.y - 24 * u, pw = a.w + 80 * u, ph = a.h + 48 * u;
    const shadow = [C.red, C.yel, C.blu, C.blk][idx % 4];
    g.save();
    g.fillStyle = shadow; g.fillRect(px + 18 * u, py + 18 * u, pw, ph);
    g.fillStyle = C.paper; g.fillRect(px, py, pw, ph);
    g.beginPath(); g.rect(px, py, pw, ph); g.clip();
    speckle(F, px, py, pw, ph, 0.3);
    // Module grid.
    g.strokeStyle = F.a(C.ink, 0.1); g.lineWidth = 1.5 * u; g.beginPath();
    const cols = 12;
    for (let i = 1; i < cols; i++) { g.moveTo(px + (pw * i) / cols, py); g.lineTo(px + (pw * i) / cols, py + ph); }
    const rows = Math.max(4, Math.round(ph / (pw / cols)));
    for (let i = 1; i < rows; i++) { g.moveTo(px, py + (ph * i) / rows); g.lineTo(px + pw, py + (ph * i) / rows); }
    g.stroke();
    // A band of colour sweeping slowly across the panel.
    const k = ((t * 0.17) % 1), bx = px - pw * 0.3 + k * pw * 1.6;
    g.save(); g.globalAlpha = 0.1; g.fillStyle = C.yel; g.beginPath(); g.moveTo(bx, py); g.lineTo(bx + pw * 0.16, py); g.lineTo(bx + pw * 0.16 - ph * 0.3, py + ph); g.lineTo(bx - ph * 0.3, py + ph); g.closePath(); g.fill(); g.restore();
    // Registration marks.
    g.fillStyle = C.blk;
    for (const [cx, cy] of [[px + 22 * u, py + 22 * u], [px + pw - 22 * u, py + 22 * u], [px + 22 * u, py + ph - 22 * u], [px + pw - 22 * u, py + ph - 22 * u]]) { g.fillRect(cx - 12 * u, cy - 1.5 * u, 24 * u, 3 * u); g.fillRect(cx - 1.5 * u, cy - 12 * u, 3 * u, 24 * u); }
    g.restore();
    g.save(); g.strokeStyle = C.blk; g.lineWidth = 6 * u; g.strokeRect(px, py, pw, ph); g.restore();
  }

  // ---- world ---------------------------------------------------------------------------------------
  function drawWorld(F, variant, idx, kind, id, cut = 0) {
    const g = F.g, { t, u, W, H, C } = F, G = geom(F);
    const ws = WORLDS[variant];
    g.save();
    // Opaque stock first, so a composition wiped in never multiplies over the one it replaces.
    g.fillStyle = C.paper; g.fillRect(0, 0, W, H);
    g.strokeStyle = F.a(C.ink, 0.09); g.lineWidth = 1.5 * u; g.beginPath();
    for (let i = 1; i < 12; i++) { g.moveTo((W * i) / 12, 0); g.lineTo((W * i) / 12, H); }
    for (let i = 1; i < 8; i++) { g.moveTo(0, (H * i) / 8); g.lineTo(W, (H * i) / 8); }
    g.stroke();
    g.globalCompositeOperation = C.mix ? "multiply" : "source-over";
    ws.forEach((it, i) => drawItem(F, it, t, i));
    g.restore();
    // Behind a content card the collage steps back, so the card stays the focal point.
    if (kind === "head") { g.save(); g.fillStyle = F.a(C.paper, 0.3); g.fillRect(0, 0, W, H); g.restore(); }
    speckle(F, 0, 0, W, H, 0.85);
    if (kind === "head") {
      const pr = plateRect(F, G, "head", id);
      drawPlate(F, pr, t, idx, false, cut);
      drawRail(F, (pr.y + pr.h + G.area.y - 24 * u) / 2 + 6 * u, t, idx);
      drawPanel(F, G, t, idx);
    } else drawPlate(F, plateRect(F, G, kind), t, idx, true, cut);
  }

  // ---- shutter wipe --------------------------------------------------------------------------------
  const BANDS = 7;
  // Ease-out shutters: they lead the headline's own wipe, so new words never land on the old drawing.
  const lead = (F, k, i) => {
    const off = Math.sin(i * 2.3 + 0.7) * 36 * F.u;
    return -130 * F.u + off + (1 - Math.pow(1 - clamp(k), 4)) * (F.W + 310 * F.u);
  };
  const barW = (F) => 90 * F.u;
  // Region the next composition occupies (x left of each band's bar) or the old one keeps (x right of it).
  function clipBands(F, k, newSide) {
    const g = F.g, bh = F.H / BANDS;
    g.beginPath();
    for (let i = 0; i < BANDS; i++) {
      const L = lead(F, k, i);
      if (newSide) g.rect(0, i * bh - 0.5, Math.max(0, L - barW(F)), bh + 1);
      else g.rect(L, i * bh - 0.5, Math.max(0, F.W - L), bh + 1);
    }
    g.clip();
  }
  function drawBars(F, k) {
    const g = F.g, bh = F.H / BANDS, C = F.C, seq = [C.red, C.yel, C.blu, C.blk];
    g.save();
    for (let i = 0; i < BANDS; i++) {
      const L = lead(F, k, i), w = barW(F);
      if (L <= 0 || L - w >= F.W) continue;
      g.fillStyle = seq[(i + cur.index) % 4];
      if (i % 2) { g.beginPath(); g.moveTo(L - w, i * bh); g.lineTo(L - w * 0.0, i * bh); g.arc(L - w * 0.0, i * bh + bh / 2, bh / 2, -PI / 2, PI / 2); g.lineTo(L - w, (i + 1) * bh); g.closePath(); g.fill(); }
      else { g.fillRect(L - w, i * bh, w, bh); }
    }
    g.restore();
  }

  // ---- scene support -------------------------------------------------------------------------------
  const wrapScene = (draw) => (ctx, S, box, p, d, info) => {
    const F = makeF(ctx, S, info.t);
    const G = geom(F);
    ctx.save();
    if (info.exit !== undefined) clipBands(F, info.exit, false);
    else if (cur.index > 0 && info.local < info.change) clipBands(F, clamp(info.local / Math.max(0.01, info.change)), true);
    const area = G.area;
    draw(ctx, F, area, info.exit !== undefined ? 1 : 0.34 + 0.66 * p, d, info);
    ctx.restore();
  };

  // ---- the scenes ----------------------------------------------------------------------------------
  function chart(g, F, box, p, d, info) {
    const { u, C, t } = F;
    const n = d.values.length, max = Math.max(...d.values, 1);
    const gap0 = 0.28;
    const bw = Math.min((box.w * 0.96) / (n + (n - 1) * gap0), 250 * u), gap = bw * gap0;
    const gw = n * bw + (n - 1) * gap, gx = box.x + (box.w - gw) / 2;
    const y0 = box.y + box.h - 92 * u, numH = 104 * u, capH = bw * 0.3;
    const hmax = box.h - 92 * u - numH - 26 * u - capH - 18 * u;
    g.save(); g.setLineDash([14 * u, 12 * u]); g.lineDashOffset = -t * 40 * u; g.strokeStyle = F.a(C.ink, 0.3); g.lineWidth = 2.5 * u;
    for (let k = 1; k <= 3; k++) { const y = y0 - (hmax * k) / 3; g.beginPath(); g.moveTo(box.x + 10 * u, y); g.lineTo(box.x + box.w - 10 * u, y); g.stroke(); }
    g.restore();
    const palette = [C.blu, C.blk, C.yel];
    const tops = [];
    d.values.forEach((v, i) => {
      const q = stagger(p, i, n, 0.5), x = gx + i * (bw + gap), hot = i === d.highlight;
      const h = hmax * (v / max) * q, c = hot ? C.red : palette[i % 3];
      tops.push([x + bw / 2, y0 - h]);
      if (q <= 0) return;
      g.save();
      g.fillStyle = c; g.fillRect(x, y0 - h, bw, h);
      g.beginPath(); g.rect(x, y0 - h, bw, h); g.clip();
      const pitch = 30 * u, off = (t * 30 * u) % pitch;
      g.strokeStyle = F.a(c === C.yel ? C.ink : C.paper, 0.32); g.lineWidth = 5 * u; g.beginPath();
      for (let s = -h; s < bw + pitch; s += pitch) { g.moveTo(x + s + off, y0); g.lineTo(x + s + off + h, y0 - h); }
      g.stroke();
      g.restore();
      // A cap that turns above each bar.
      const cq = ease((q - 0.45) / 0.55), r = bw * 0.2, cy = y0 - h - r - 10 * u - Math.sin(t * 2.4 + i) * 5 * u;
      if (cq > 0) {
        const s = cq, cx = x + bw / 2;
        if (i % 3 === 0) disc(F, cx, cy, r * s, t * 1.4 + i, hot ? C.yel : C.red, C.blk, false);
        else if (i % 3 === 1) tri(F, cx, cy, r * 2 * s, Math.sin(t * 1.6 + i) * 0.5, C.red);
        else sq(F, cx, cy, r * 1.6 * s, t * 0.9 + i, C.blk);
      }
      const label = (d.prefix || "") + Math.round(v * q) + (d.suffix || "");
      numerals(g, label, x + bw / 2, cy - r - 16 * u - numH, numH, hot ? C.red : C.ink, "center");
      g.fillStyle = c; g.fillRect(x, y0 + 16 * u, bw, 8 * u);
      say(g, d.labels[i] || "", x + bw / 2, y0 + 70 * u, 42 * u, { align: "center", color: C.ink, maxW: bw + gap * 0.8 });
    });
    g.fillStyle = C.blk; g.fillRect(gx - 34 * u, y0, (gw + 68 * u) * ease(p * 2.2), 12 * u);
    // Trend line with a marker that keeps travelling.
    if (p > 0.8 && n > 1) {
      const a = ease((p - 0.8) / 0.2);
      g.save(); g.globalAlpha = a; g.strokeStyle = C.ink; g.lineWidth = 5 * u; g.setLineDash([18 * u, 14 * u]); g.lineDashOffset = -t * 30 * u;
      g.beginPath(); tops.forEach(([x, y], i) => { const yy = y - bw * 0.06; if (i) g.lineTo(x, yy); else g.moveTo(x, yy); }); g.stroke(); g.restore();
      const s = ((t * 0.22) % 1) * (n - 1), i0 = Math.min(n - 2, Math.floor(s)), k = s - i0;
      const mx = lerp(tops[i0][0], tops[i0 + 1][0], k), my = lerp(tops[i0][1], tops[i0 + 1][1], k) - bw * 0.06;
      g.globalAlpha = a; disc(F, mx, my, 15 * u, t * 4, C.red, C.paper, false); g.globalAlpha = 1;
    }
    // Through the hold: a red rule scans the bars and the leading bar sends out rings.
    const hk = ease((p - 0.85) / 0.15);
    if (hk > 0 && n > 0) {
      g.save(); g.globalAlpha = hk;
      const sc = ((t * 0.42) % 1), sx = gx - 34 * u + sc * (gw + 68 * u);
      g.fillStyle = C.red; g.fillRect(sx - 3 * u, y0 - hmax - 20 * u, 6 * u, hmax + 20 * u);
      g.beginPath(); g.moveTo(sx - 18 * u, y0 + 34 * u); g.lineTo(sx + 18 * u, y0 + 34 * u); g.lineTo(sx, y0 + 12 * u); g.closePath(); g.fill();
      const hi = d.highlight >= 0 && d.highlight < n ? d.highlight : n - 1, [hx, hy] = tops[hi];
      for (let r = 0; r < 2; r++) {
        const k = ((t * 0.75 + r * 0.5) % 1);
        g.strokeStyle = F.a(C.red, (1 - k) * 0.85); g.lineWidth = 7 * u * (1 - k) + 1 * u;
        const ex = 8 * u + k * 34 * u; g.strokeRect(hx - bw / 2 - ex, hy + bw * 0.06, bw + ex * 2, y0 - hy - bw * 0.06);
      }
      g.restore();
    }
  }

  function device(g, F, r, p, d, info) {
    const { u, C, t } = F;
    const q = ease(p * 1.5);
    g.save();
    g.beginPath(); g.rect(r.x - 6 * u, r.y + r.h * (1 - q) - 8 * u, r.w + 12 * u + 40 * u, r.h * q + 40 * u); g.clip();
    // Body.
    g.fillStyle = C.blk; g.fillRect(r.x + 14 * u, r.y + 14 * u, r.w, r.h);
    g.fillStyle = C.yel; g.fillRect(r.x, r.y, r.w, r.h);
    g.strokeStyle = C.blk; g.lineWidth = 7 * u; g.strokeRect(r.x, r.y, r.w, r.h);
    const pad = (d.kind === "phone" ? 22 : 26) * u;
    const sx = r.x + pad, sy = r.y + pad, sw = r.w - pad * 2, sh = r.h - pad * 2;
    g.fillStyle = C.paper; g.fillRect(sx, sy, sw, sh);
    g.strokeStyle = C.blk; g.lineWidth = 4 * u; g.strokeRect(sx, sy, sw, sh);
    // Preview window.
    const pv = { x: sx + sw * 0.06, y: sy + sh * 0.07, w: sw * 0.88, h: sh * 0.46 };
    g.save(); g.beginPath(); g.rect(pv.x, pv.y, pv.w, pv.h); g.clip();
    g.fillStyle = C.blu; g.fillRect(pv.x, pv.y, pv.w, pv.h);
    stripes(F, pv.x, pv.y, pv.w, pv.h, 12, F.a(C.paper, 0.18), t, true, 0.5);
    disc(F, pv.x + pv.w * 0.3, pv.y + pv.h * 0.5, pv.h * 0.32, t * 0.9, C.red, C.yel, false);
    const tx = pv.x + pv.w * (0.62 + 0.14 * Math.sin(t * 1.3));
    tri(F, tx, pv.y + pv.h * 0.55, pv.h * 0.5, Math.sin(t * 0.9) * 0.4, C.paper);
    sq(F, pv.x + pv.w * 0.86, pv.y + pv.h * 0.2, pv.h * 0.18, t * 1.2, C.blk);
    g.restore();
    g.strokeStyle = C.blk; g.lineWidth = 4 * u; g.strokeRect(pv.x, pv.y, pv.w, pv.h);
    // Three tracks and a playhead.
    const tl = { x: sx + sw * 0.06, y: sy + sh * 0.6, w: sw * 0.88, h: sh * 0.34 }, th = tl.h / 3 - 6 * u;
    const clips = [[0.0, 0.34, C.blk], [0.38, 0.28, C.red], [0.7, 0.3, C.blu]];
    for (let row = 0; row < 3; row++) {
      const y = tl.y + row * (th + 9 * u);
      clips.forEach(([cx, cw, c], i) => {
        const x = tl.x + tl.w * (cx + (row === 1 ? 0.05 : row === 2 ? 0.1 : 0) * (i === 0 ? 1 : 0)), shown = clamp((q - 0.25 - i * 0.12 - row * 0.05) * 3);
        if (shown <= 0) return;
        const w = tl.w * cw * shown * (row === 1 && i === 0 ? 0.8 : 1);
        g.fillStyle = row === 1 && i === 1 ? C.red : row === 0 && i === 1 ? C.yel : c;
        g.fillRect(x, y, w, th);
      });
    }
    // The proposed clip carries marching dashes.
    g.save(); g.setLineDash([12 * u, 8 * u]); g.lineDashOffset = -t * 36 * u; g.strokeStyle = C.ink; g.lineWidth = 4 * u;
    g.strokeRect(tl.x + tl.w * 0.38 - 4 * u, tl.y + (th + 9 * u) - 5 * u, tl.w * 0.28 + 8 * u, th + 10 * u); g.restore();
    const px = tl.x + ((t * 0.2) % 1) * tl.w;
    g.fillStyle = C.ink; g.fillRect(px - 2.5 * u, tl.y - 10 * u, 5 * u, tl.h + 20 * u);
    g.beginPath(); g.moveTo(px - 12 * u, tl.y - 24 * u); g.lineTo(px + 12 * u, tl.y - 24 * u); g.lineTo(px, tl.y - 6 * u); g.closePath(); g.fillStyle = C.red; g.fill();
    g.restore();
    return { pv, tl, th, sx, sy, sw, sh };
  }
  function object(g, F, box, p, d, info) {
    const { u, C, t } = F;
    const phone = d.kind === "phone", vertical = box.h > box.w;
    let r;
    if (phone) { const h = Math.min(box.h * (vertical ? 0.5 : 0.9), box.w * 0.7), w = h * 0.52; r = { x: vertical ? box.x + (box.w - w) / 2 : box.x + box.w * 0.12, y: box.y + (vertical ? 20 * u : (box.h - h) / 2), w, h }; }
    else { const w = vertical ? box.w * 0.92 : Math.min(box.w * 0.54, box.h * 1.24), h = w * 0.62; r = { x: vertical ? box.x + (box.w - w) / 2 : box.x + 10 * u, y: box.y + (vertical ? 16 * u : (box.h - h) / 2 - 22 * u), w, h }; }
    const m = device(g, F, r, p, d, info);
    // Laptop base: a flat black wedge.
    if (!phone) {
      g.save(); g.fillStyle = C.blk; g.beginPath(); g.moveTo(r.x - r.w * 0.05, r.y + r.h + 4 * u); g.lineTo(r.x + r.w * 1.05, r.y + r.h + 4 * u); g.lineTo(r.x + r.w * 1.0, r.y + r.h + 28 * u); g.lineTo(r.x - r.w * 0.0, r.y + r.h + 28 * u); g.closePath();
      g.globalAlpha = ease(p * 3); g.fill(); g.restore();
    }
    const anchors = [[m.pv.x + m.pv.w * 0.78, m.pv.y + m.pv.h * 0.3], [m.tl.x + m.tl.w * 0.52, m.tl.y + m.th * 1.6], [m.tl.x + m.tl.w * 0.16, m.tl.y + m.th * 2.7]];
    const size = 54 * u;
    const labelX = vertical ? box.x + 30 * u : r.x + r.w + 96 * u, labelEnd = box.x + box.w + 20 * u;
    const labelY = (i) => (vertical ? r.y + r.h + 120 * u + i * Math.min(150 * u, (box.y + box.h - (r.y + r.h) - 140 * u) / 3) : box.y + box.h * (0.14 + i * 0.3));
    const cs = [C.red, C.blu, C.yel];
    // Leaders first, then discs and labels on top, so no line ever strikes through a word.
    for (const pass of [0, 1]) d.callouts.forEach((label, i) => {
      const c = stagger(p, i, d.callouts.length, 0.5);
      if (c <= 0 || !label) return;
      if (pass === 0) {
      const [ax, ay] = anchors[i], ly = labelY(i) + size * 0.75, lx = labelX + 64 * u;
      const mx = vertical ? ax : r.x + r.w + 46 * u;
      g.save(); g.strokeStyle = C.ink; g.lineWidth = 5 * u; g.lineCap = "butt"; g.lineJoin = "miter";
      const L1 = Math.hypot(mx - ax, vertical ? ly - ay : 0) + Math.hypot(lx - 14 * u - mx, ly - (vertical ? ly : ay));
      g.beginPath(); g.moveTo(ax, ay);
      const reach = c * 1; // fraction of the leader drawn
      if (vertical) { const dxv = box.x + 40 * u, yb = ly - 50 * u; g.lineTo(ax, ay + (yb - ay) * clamp(reach * 1.6)); if (reach > 0.62) g.lineTo(ax + (dxv - ax) * clamp((reach - 0.62) * 3), yb); if (reach > 0.95) g.lineTo(dxv, ly - 30 * u); }
      else { g.lineTo(ax + (mx - ax) * clamp(reach * 1.4), ay + (ly - ay) * clamp(reach * 1.4) * 0); g.lineTo(ax + (mx - ax) * clamp(reach * 1.4), ay + (ly - ay) * clamp((reach - 0.35) * 2)); if (reach > 0.7) g.lineTo(mx + (lx - 14 * u - mx) * clamp((reach - 0.7) * 3.3), ay + (ly - ay) * clamp((reach - 0.35) * 2)); }
      g.stroke(); g.restore();
      return;
      }
      const [ax, ay] = anchors[i], ly = labelY(i) + size * 0.75;
      disc(F, ax, ay, 15 * u, t * 3 + i, cs[i], C.blk, false);
      // Numbered disc, then the label.
      const right = false;
      const dx = vertical ? box.x + 40 * u : labelX + 26 * u, dy = ly;
      if (c > 0.6) {
        const k = ease((c - 0.6) / 0.4);
        g.fillStyle = cs[i]; g.beginPath(); g.arc(dx, dy, 34 * u * k, 0, TAU); g.fill();
        g.strokeStyle = C.blk; g.lineWidth = 5 * u; g.stroke();
        if (k > 0.6) numerals(g, String(i + 1), dx, dy - 20 * u, 40 * u, i === 2 ? C.ink : C.paper, "center");
        if (vertical) { setFont(g, size); const tw2 = Math.min(g.measureText(String(label).toUpperCase()).width, box.x + box.w - dx - 70 * u); g.letterSpacing = "0px"; g.fillStyle = C.paper; g.fillRect(dx + 40 * u, dy - size * 0.62, tw2 + 24 * u, size * 1.24); }
        if (vertical) say(g, label, right ? dx - 52 * u : dx + 52 * u, dy, size, { color: C.ink, base: "middle", align: "left", maxW: box.x + box.w - dx - 70 * u });
        else say(g, label, labelX + 82 * u, dy, size, { color: C.ink, base: "middle", maxW: labelEnd - (labelX + 82 * u), min: 44 * u });
      }
    });
    // Through the hold the callouts take turns: the active marker rings out and its label is underlined.
    const hk = ease((p - 0.85) / 0.15), nC = d.callouts.length;
    if (hk > 0 && nC) {
      const beat = t * 0.8, act = Math.floor(beat) % nC, ph = beat % 1;
      const [ax, ay] = anchors[act];
      g.save(); g.globalAlpha = hk;
      for (let r2 = 0; r2 < 2; r2++) { const k = (ph + r2 * 0.5) % 1; g.strokeStyle = F.a(cs[act], 1 - k); g.lineWidth = 6 * u * (1 - k) + u; g.beginPath(); g.arc(ax, ay, 18 * u + k * 46 * u, 0, TAU); g.stroke(); }
      if (!vertical && d.callouts[act]) {
        setFont(g, size); const lw = Math.min(g.measureText(String(d.callouts[act]).toUpperCase()).width, labelEnd - (labelX + 82 * u)); g.letterSpacing = "0px";
        const ly = labelY(act) + size * 0.75 + size * 0.62, grow = ease(ph / 0.4) * (1 - ease((ph - 0.8) / 0.2));
        g.fillStyle = cs[act]; g.fillRect(labelX + 82 * u, ly, lw * grow, 10 * u);
      }
      g.restore();
    }
  }

  function figure(g, F, kind, cx, base, size, c, q, t, i, tile, lift = 0) {
    const { u, C } = F;
    const s = size, bob = Math.sin(t * 2.1 + i * 1.3) * 7 * u * clamp(q) - lift, sw = Math.sin(t * 2.6 + i) * 0.45;
    g.save();
    // Limbs stay inside the figure's own tile.
    const cl = tile ? tile.x : cx - s, cw = tile ? tile.w : s * 2;
    g.beginPath(); g.rect(cl, base - s * 1.3 * ease(q) - lift, cw, s * 1.3 * ease(q) + 2 + lift); g.clip();
    g.translate(0, bob);
    const a = c.a, b = c.b, k = c.k;
    // arms: two bars pivoting at the shoulders
    const arm = (sx, sy, ang, len, w, colr) => { g.save(); g.translate(sx, sy); g.rotate(ang); g.fillStyle = colr; g.fillRect(-w / 2, 0, w, len); g.restore(); };
    if (kind === 0) { // dome body, circle head
      arm(cx - s * 0.3, base - s * 0.62, 0.5 + sw, s * 0.42, s * 0.07, k); arm(cx + s * 0.3, base - s * 0.62, -0.5 - sw, s * 0.42, s * 0.07, k);
      g.fillStyle = a; g.beginPath(); g.arc(cx, base, s * 0.34, PI, TAU); g.closePath(); g.fill();
      disc(F, cx, base - s * 0.62 - s * 0.2, s * 0.17, t * 1.3 + i, b, k, false);
    } else if (kind === 1) { // triangle body, diamond head
      arm(cx - s * 0.2, base - s * 0.5, 0.9 + sw, s * 0.4, s * 0.07, k); arm(cx + s * 0.2, base - s * 0.5, -0.9 - sw, s * 0.4, s * 0.07, k);
      tri(F, cx, base - s * 0.2, s * 0.62, 0, a); // base of triangle sits on floor
      sq(F, cx, base - s * 0.82, s * 0.26, PI / 4 + Math.sin(t * 1.7 + i) * 0.3, b);
    } else if (kind === 2) { // block body with band, half-disc head
      arm(cx - s * 0.27, base - s * 0.6, 0.35 - sw * 0.6, s * 0.44, s * 0.07, k); arm(cx + s * 0.27, base - s * 0.6, -0.35 + sw * 0.6, s * 0.44, s * 0.07, k);
      g.fillStyle = a; g.fillRect(cx - s * 0.24, base - s * 0.62, s * 0.48, s * 0.62);
      g.fillStyle = b; g.fillRect(cx - s * 0.24, base - s * 0.38, s * 0.48, s * 0.1);
      semi(F, cx, base - s * 0.62 - s * 0.01, s * 0.17, PI + Math.sin(t * 1.9 + i) * 0.35, k);
    } else { // trapezoid body, ring head
      arm(cx - s * 0.28, base - s * 0.55, 0.6 + sw, s * 0.4, s * 0.07, k); arm(cx + s * 0.28, base - s * 0.55, -0.6 - sw, s * 0.4, s * 0.07, k);
      g.fillStyle = a; g.beginPath(); g.moveTo(cx - s * 0.18, base - s * 0.62); g.lineTo(cx + s * 0.18, base - s * 0.62); g.lineTo(cx + s * 0.32, base); g.lineTo(cx - s * 0.32, base); g.closePath(); g.fill();
      ring(F, cx, base - s * 0.62 - s * 0.18, s * 0.13, s * 0.06, b);
      g.fillStyle = k; g.beginPath(); g.arc(cx + Math.cos(t * 2 + i) * s * 0.05, base - s * 0.62 - s * 0.18, s * 0.04, 0, TAU); g.fill();
    }
    g.restore();
  }
  function people(g, F, box, p, d, info) {
    const { u, C, t } = F;
    const n = Math.max(2, Math.min(6, Math.round(d.count)));
    const vert = box.h > box.w * 1.1 && n > 2, cols = vert ? 2 : n, rows = vert ? Math.ceil(n / 2) : 1;
    const slot = box.w / cols, rh = box.h / rows, size = vert ? Math.min(rh * 0.58, slot * 0.6) : Math.min(box.h * 0.6, slot * 0.6);
    const tiles = [C.blu, C.yel, C.red, C.blk];
    const designs = [{ a: C.red, b: C.yel, k: C.ink }, { a: C.ink, b: C.red, k: C.paper }, { a: C.paper, b: C.blk, k: C.yel }, { a: C.yel, b: C.red, k: C.ink }];
    const widths = [];
    const labels = [];
    const nb = Math.max(1, d.badges.length);
    for (let i = 0; i < n; i++) { const base0 = d.badges[i % nb] || ""; const l = i < nb ? base0 : base0 + " " + (Math.floor(i / nb) + 1); labels.push(l); setFont(g, 42 * u); widths.push(g.measureText(String(l || "").toUpperCase()).width + 40 * u); g.letterSpacing = "0px"; }
    const crowded = !vert && widths.some((w, i) => i < n - 1 && w + widths[i + 1] > slot * 1.9);
    for (let i = 0; i < n; i++) {
      const row = vert ? Math.floor(i / 2) : 0, base = box.y + row * rh + rh * (vert ? 0.76 : 0.8), q = stagger(p, i, n, 0.6), cx = box.x + slot * ((vert ? i % 2 : i) + 0.5), hot = i === Math.min(n - 1, d.highlight);
      const tc = hot ? C.red : tiles[(i + 0) % 4 === 2 ? 0 : i % 4];
      const tw = slot * 0.86, th = Math.max(size * 1.18, (vert ? rh : box.h) * 0.68), ty = base - th + 26 * u;
      if (q > 0) {
        g.save(); g.beginPath(); g.rect(cx - tw / 2, ty + th * (1 - ease(q)), tw, th * ease(q)); g.clip();
        g.fillStyle = tc; g.fillRect(cx - tw / 2, ty, tw, th);
        // A drifting pattern keeps each tile alive.
        const dsg = i % 3;
        if (dsg === 0) stripes(F, cx - tw / 2, ty, tw, th, 8, F.a(tc === C.yel ? C.ink : C.paper, 0.2), t + i, true, 0.4);
        else if (dsg === 1) dots(F, cx - tw / 2 + tw * 0.12, ty + th * 0.1, 5, 5, tw * 0.19, tw * 0.035, F.a(tc === C.yel ? C.ink : C.paper, 0.35), t + i);
        else { g.fillStyle = F.a(C.paper, 0.2); g.beginPath(); g.arc(cx + Math.cos(t * 0.8 + i) * tw * 0.2, ty + th * 0.3, tw * 0.32, 0, TAU); g.fill(); }
        g.restore();
        const dd = designs[i % 4];
        const pal = tc === C.blk ? { a: C.red, b: C.yel, k: C.paper } : tc === C.red ? { a: C.ink, b: C.yel, k: C.paper } : tc === C.blu ? { a: C.yel, b: C.paper, k: C.ink } : dd;
        // Through the hold the figures take turns to hop.
        const hb = (t * 1.1) % n, lift = p > 0.9 && Math.floor(hb) === i ? Math.sin(PI * (hb % 1)) * 26 * u : 0;
        figure(g, F, i % 4, cx, base + 6 * u, size * (hot ? 1.06 : 1), pal, q, t, i, { x: cx - tw / 2, w: tw }, lift);
      }
      const ly = base + 24 * u + (crowded && i % 2 ? 76 * u : 0);
      tag(F, labels[i], cx, ly, 42 * u, q > 0.5 ? ease((q - 0.5) / 0.5) : 0, { align: "center", bg: hot ? C.red : C.blk, fg: C.paper });
    }
    for (let r = 0; r < rows; r++) { const by = box.y + r * rh + rh * (vert ? 0.76 : 0.8); g.fillStyle = C.blk; g.fillRect(box.x, by + 6 * u, box.w * ease(p * 2), 14 * u); }
  }

  function shapeIcon(F, kind, cx, cy, s, t, i, c1, c2) {
    if (kind === 0) disc(F, cx, cy, s * 0.5, t * 1.1 + i, c1, c2, false);
    else if (kind === 1) { tri(F, cx, cy + s * 0.04, s, Math.sin(t * 1.4 + i) * 0.35, c1); sq(F, cx, cy + s * 0.2, s * 0.22, t * 1.6, c2); }
    else { sq(F, cx, cy, s * 0.84, t * 0.7 + i, c1); disc(F, cx, cy, s * 0.24, -t * 1.6, c2, c1, false); }
  }
  function process(g, F, box, p, d, info) {
    const { u, C, t } = F;
    const n = d.steps.length, vertical = box.h > box.w, gapA = (vertical ? 96 : 120) * u;
    const cyc = [C.yel, C.blu, C.red, C.blk];
    const active = Math.floor((t * 0.8) % n);
    for (let i = 0; i < n; i++) {
      const tw = vertical ? box.w : (box.w - (n - 1) * gapA) / n, th = vertical ? (box.h - (n - 1) * gapA) / n : Math.min(box.h * 0.92, tw * 1.08);
      const x = vertical ? box.x : box.x + i * (tw + gapA), y = vertical ? box.y + i * (th + gapA) : box.y + (box.h - th) / 2;
      const c = cyc[Math.min(i, n - 1) === n - 1 && n > 1 ? 2 : i % 3];
      const text = c === C.yel ? C.ink : C.paper, q = stagger(p, i, n, 0.55);
      if (q > 0) {
        g.save();
        g.beginPath(); g.rect(x - 2, y + th * (1 - ease(q)) - 2, tw + 4, th * ease(q) + 4); g.clip();
        g.fillStyle = c; g.fillRect(x, y, tw, th);
        stripes(F, x, y, tw, th, 10, F.a(text, 0.13), t + i * 2, false, 0.35);
        if (!vertical) {
          // The active step's number hops and its icon swells, with a light band crossing the tile.
          const on = i === active && p > 0.9, ph = (t * 0.8) % 1, bump = on ? Math.sin(PI * ph) : 0;
          if (on) { g.save(); g.globalAlpha = 0.22; g.fillStyle = C.paper; const bx = x - tw * 0.4 + ph * tw * 1.8; g.beginPath(); g.moveTo(bx, y); g.lineTo(bx + tw * 0.2, y); g.lineTo(bx + tw * 0.2 - th * 0.3, y + th); g.lineTo(bx - th * 0.3, y + th); g.closePath(); g.fill(); g.restore(); }
          numerals(g, String(i + 1), x + 30 * u, y + 28 * u - bump * 18 * u, 140 * u, text, "left");
          shapeIcon(F, i % 3, x + tw * 0.62, y + th * 0.32, Math.min(tw, th) * 0.32 * (1 + 0.14 * bump), t, i, i === n - 1 ? C.yel : C.red, C.paper);
          const lines = wrap(g, d.steps[i], tw - 52 * u, 54 * u), hh = lines.length * 62 * u + 34 * u;
          g.fillStyle = C.blk; g.fillRect(x, y + th - hh, tw, hh);
          lines.forEach((l, k) => say(g, l, x + 26 * u, y + th - hh + 17 * u + 31 * u + k * 62 * u, 54 * u, { color: C.paper, base: "middle", maxW: tw - 52 * u, min: 44 * u }));
        } else {
          numerals(g, String(i + 1), x + 28 * u, y + th / 2 - 70 * u, 140 * u, text, "left");
          shapeIcon(F, i % 3, x + tw * 0.4, y + th * 0.5, Math.min(th * 0.62, tw * 0.22), t, i, i === n - 1 ? C.yel : C.red, C.paper);
          const lines = wrap(g, d.steps[i], tw * 0.42, 54 * u);
          lines.forEach((l, k) => say(g, l, x + tw * 0.58, y + th / 2 + (k - (lines.length - 1) / 2) * 62 * u, 54 * u, { color: text, base: "middle", maxW: tw * 0.42, min: 44 * u }));
        }
        g.restore();
        g.save(); g.strokeStyle = C.blk; g.lineWidth = 6 * u; g.strokeRect(x, y, tw, th);
        if (i === active) {
          g.setLineDash([22 * u, 12 * u]); g.lineDashOffset = -t * 50 * u; g.lineWidth = 6 * u; g.strokeRect(x - 14 * u, y - 14 * u, tw + 28 * u, th + 28 * u);
        }
        g.restore();
      }
      if (i < n - 1) {
        const a = stagger(p, i + 0.6, n, 0.55);
        if (a <= 0) continue;
        const ph = (t * 1.3) % 1;
        g.save(); g.fillStyle = C.blk;
        if (!vertical) {
          const cx0 = x + tw + 14 * u, len = gapA - 28 * u, cy = y + th / 2;
          g.beginPath(); g.rect(cx0, cy - 40 * u, len * a, 80 * u); g.clip();
          for (let k = 0; k < 2; k++) { const px = cx0 + ((k + ph) / 2) * len - 10 * u; g.beginPath(); g.moveTo(px - 24 * u, cy - 38 * u); g.lineTo(px + 16 * u, cy); g.lineTo(px - 24 * u, cy + 38 * u); g.lineTo(px - 4 * u, cy + 38 * u); g.lineTo(px + 36 * u, cy); g.lineTo(px - 4 * u, cy - 38 * u); g.closePath(); g.fill(); }
        } else {
          const cy0 = y + th + 12 * u, len = gapA - 24 * u, cx = x + tw / 2;
          g.beginPath(); g.rect(cx - 70 * u, cy0, 140 * u, len * a); g.clip();
          for (let k = 0; k < 2; k++) { const py = cy0 + ((k + ph) / 2) * len - 4 * u; g.beginPath(); g.moveTo(cx - 52 * u, py - 20 * u); g.lineTo(cx, py + 20 * u); g.lineTo(cx + 52 * u, py - 20 * u); g.lineTo(cx + 52 * u, py - 2 * u); g.lineTo(cx, py + 38 * u); g.lineTo(cx - 52 * u, py - 2 * u); g.closePath(); g.fill(); }
        }
        g.restore();
      }
    }
  }

  function compare(g, F, box, p, d, info) {
    const { u, C, t } = F;
    const vertical = box.h > box.w * 1.1, gap = 64 * u;
    const cw = vertical ? box.w : (box.w - gap) / 2, ch = vertical ? (box.h - gap) / 2 : box.h * 0.92;
    const cells = 24, maxv = Math.max(d.leftValue, d.rightValue, 1), unit = maxv <= cells && Number.isInteger(d.leftValue) && Number.isInteger(d.rightValue);
    const toCells = (v) => (unit ? v : (v / maxv) * cells);
    const local = info.local ?? 0, hold = info.hold || 3.6;
    // The payoff runs on the scene clock: struck-out redos, a chase through the tweaks, then a stamp.
    const strikeAt = Math.min(1.4, hold * 0.4), stampAt = Math.max(strikeAt + 0.6, hold - 1.4);
    let stampSpot = null;
    [[d.left, d.leftValue, C.blk, C.paper], [d.right, d.rightValue, C.red, C.paper]].forEach(([label, value, c, fg], i) => {
      const q = stagger(p, i, 2, 0.4);
      if (q <= 0) return;
      const x = vertical ? box.x : box.x + i * (cw + gap), y = vertical ? box.y + i * (ch + gap) : box.y + (box.h - ch) / 2;
      g.save();
      g.beginPath(); g.rect(x - 2, y - 2, cw * ease(q) + 4, ch + 4); g.clip();
      g.fillStyle = C.paper; g.fillRect(x, y, cw, ch);
      g.fillStyle = c; g.fillRect(x, y, cw, ch * 0.2);
      say(g, label, x + 28 * u, y + ch * 0.1, 46 * u, { color: fg, base: "middle", maxW: cw - 150 * u, min: 42 * u });
      // Moving marks on the header strip.
      const off = (t * 50 * u) % (60 * u);
      g.save(); g.beginPath(); g.rect(x + cw - 130 * u, y, 130 * u, ch * 0.2); g.clip(); g.fillStyle = i ? C.yel : C.red;
      for (let k = -1; k < 4; k++) g.fillRect(x + cw - 130 * u + k * 60 * u + off, y + ch * 0.1 - 14 * u, 30 * u, 28 * u);
      g.restore();
      const nh = Math.min(150 * u, ch * 0.3);
      numerals(g, (d.prefix || "") + Math.round(value * q) + (d.suffix || ""), x + 32 * u, y + ch * 0.26, nh, c === C.blk ? C.ink : C.red, "left");
      const ix = x + cw * (vertical ? 0.78 : 0.72), iy = y + ch * 0.26 + nh / 2;
      const sk = i === 1 ? ease((local - stampAt) / 0.35) : 0;
      if (sk < 1) shapeIcon(F, i ? 1 : 0, ix, iy, nh * 0.9 * (1 - sk), t, i, c === C.blk ? C.red : C.yel, c === C.blk ? C.yel : C.blu);
      if (i === 1) stampSpot = vertical ? { x: x + cw * 0.24, y: y + ch * 0.72, r: Math.min(nh * 0.7, cw * 0.18) } : { x: ix, y: iy, r: nh * 0.7 };
      // Unit squares: one per unit when the numbers are small, otherwise scaled to the grid.
      const cols = 8, rows = cells / cols, cx0 = vertical ? x + cw * 0.5 : x + 32 * u, cwid = vertical ? cw * 0.5 - 32 * u : cw - 64 * u;
      const gx = cwid / cols, area = { x: cx0, y: vertical ? y + ch * 0.3 : y + ch * 0.26 + nh + 24 * u, w: cwid, h: vertical ? ch * 0.55 : ch - (ch * 0.26 + nh + 24 * u) - 28 * u };
      const gy = area.h / rows, fillN = toCells(value) * ease(q);
      const keepN = Math.round(toCells(Math.min(d.leftValue, d.rightValue))), fullN = Math.round(toCells(value));
      const chase = Math.floor(t * 5) % Math.max(1, fullN);
      for (let k = 0; k < cells; k++) {
        const col_ = k % cols, row = Math.floor(k / cols), on = k < fillN;
        const xx = area.x + col_ * gx, yy = area.y + (rows - 1 - row) * gy;
        g.fillStyle = on ? c : F.a(C.ink, 0.1);
        g.fillRect(xx + 3 * u, yy + 3 * u, gx - 6 * u, gy - 6 * u);
        if (!on) continue;
        const bigger = d.leftValue >= d.rightValue ? 0 : 1;
        if (i === bigger && k >= keepN) {
          // Redos that are no longer needed are struck out one by one.
          const s2 = clamp((local - strikeAt) / 0.14 - (k - keepN));
          if (s2 > 0) {
            g.fillStyle = F.a(C.paper, 0.55 * s2); g.fillRect(xx + 3 * u, yy + 3 * u, gx - 6 * u, gy - 6 * u);
            g.save(); g.strokeStyle = C.red; g.lineWidth = 7 * u; g.lineCap = "butt";
            g.beginPath(); g.moveTo(xx + 8 * u, yy + gy - 8 * u); g.lineTo(xx + 8 * u + (gx - 16 * u) * s2, yy + gy - 8 * u - (gy - 16 * u) * s2); g.stroke(); g.restore();
            continue;
          }
        }
        // A light runs through the kept squares in turn.
        const lit = local > strikeAt && k === chase && k < fullN;
        const wave = 0.5 + 0.5 * Math.sin(t * 3 - k * 0.5);
        g.fillStyle = lit ? C.yel : F.a(C.yel, 0.2 + 0.4 * wave * wave);
        const inset = lit ? 0.16 : 0.3;
        g.fillRect(xx + gx * inset, yy + gy * inset, gx * (1 - inset * 2), gy * (1 - inset * 2));
      }
      g.restore();
      g.save(); g.strokeStyle = C.blk; g.lineWidth = 6 * u; g.beginPath(); g.rect(x, y, cw * ease(q), ch); g.stroke(); g.restore();
    });
    // A turning disc between the two cards.
    const mx = vertical ? box.x + box.w / 2 : box.x + cw + gap / 2, my = vertical ? box.y + ch + gap / 2 : box.y + box.h / 2;
    const k = ease((p - 0.35) * 2.5);
    if (k > 0) {
      disc(F, mx, my, 56 * u * k, t * 1.5, C.yel, C.blu, false);
      g.save(); g.strokeStyle = C.blk; g.lineWidth = 6 * u; g.beginPath(); g.arc(mx, my, 56 * u * k, 0, TAU); g.stroke(); g.restore();
      if (k > 0.8) say(g, "vs", mx, my, 34 * u, { align: "center", base: "middle", color: C.ink, weight: 900 });
    }
    // Closing accent: the difference, stamped onto the after card, keeps turning and ringing out.
    const st = local - stampAt;
    if (stampSpot && st > 0) {
      const pop = st < 0.35 ? 1 + 0.25 * Math.sin(PI * clamp(st / 0.35)) : 1, a = ease(st / 0.2);
      const r = stampSpot.r * clamp(st / 0.2) * pop, diff = d.rightValue - d.leftValue;
      const txt = (diff > 0 ? "+" : diff < 0 ? "-" : "") + Math.abs(Math.round(diff));
      g.save(); g.globalAlpha = a; g.translate(stampSpot.x, stampSpot.y); g.rotate(-0.18 + Math.sin(t * 1.4) * 0.08);
      for (let rr = 0; rr < 2; rr++) { const kk = ((t * 0.7 + rr * 0.5) % 1); g.strokeStyle = F.a(C.red, 0.7 * (1 - kk)); g.lineWidth = 5 * u * (1 - kk) + u; g.beginPath(); g.arc(0, 0, r * (1.08 + 0.5 * kk), 0, TAU); g.stroke(); }
      g.fillStyle = C.blk; g.beginPath(); g.arc(8 * u, 8 * u, r, 0, TAU); g.fill();
      g.fillStyle = C.yel; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
      g.strokeStyle = C.blk; g.lineWidth = 6 * u; g.stroke();
      g.save(); g.setLineDash([14 * u, 10 * u]); g.lineDashOffset = -t * 30 * u; g.lineWidth = 4 * u; g.beginPath(); g.arc(0, 0, r * 0.82, 0, TAU); g.stroke(); g.restore();
      const nh2 = r * 0.95;
      numerals(g, txt, 0, -nh2 / 2, nh2, C.red, "center");
      g.restore();
    }
  }

  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  function shownIds() {
    if (cache && cache.shown !== undefined) return cache.shown;
    const c = (window.__dreamcut && window.__dreamcut.controls) || (typeof dc !== "undefined" && dc && dc.controls) || null;
    const ids = c ? ORDER.filter((id) => (Number(c[id + "_hold"]) || 0) > 0) : null;
    cache = cache || {};
    cache.shown = ids;
    return ids;
  }

  // ---- registered look -----------------------------------------------------------------------------
  const BASE = {
    bg: "#efe5cf", panel: "#f6efdf", ink: "#171512", muted: "#6e6454", accent: "#d8321e", onAccent: "#f6efdf",
    rule: "rgba(23,21,18,0.85)", track: "rgba(23,21,18,0.12)", c2: "#f2b50f", c3: "#1f4ba5", k: "#171512", mix: true,
  };
  return {
    ...BASE,
    display: FONT, displayWeight: 900, displayCase: "uppercase", displayTracking: "-0.005em",
    body: FONT, bodyWeight: 700, figures: FONT,
    radius: 0, motion: "wipe", change: "grid",
    kit: { line: 5, fill: "solid", panel: "fill" },
    keepArt: true,
    overlap: true,
    palettes: {
      light: { bg: "#f8f6f0", panel: "#ffffff", ink: "#111111", muted: "#6a6a6a", accent: "#e23a1e", c2: "#ffc40f", c3: "#2457b8", k: "#111111", rule: "rgba(17,17,17,0.85)", track: "rgba(17,17,17,0.1)" },
      dark: { bg: "#18181c", panel: "#222228", ink: "#f2e9d7", muted: "#aaa192", accent: "#ff5a3c", c2: "#ffc632", c3: "#4f86ff", k: "#f2e9d7", mix: false, onAccent: "#18181c", rule: "rgba(242,233,215,0.85)", track: "rgba(242,233,215,0.12)" },
      mono: { bg: "#ecebe6", panel: "#f5f4ef", ink: "#1b1b1b", muted: "#6c6c68", accent: "#1b1b1b", c2: "#a3a39e", c3: "#5a5a58", k: "#1b1b1b", onAccent: "#ecebe6", rule: "rgba(27,27,27,0.85)", track: "rgba(27,27,27,0.1)" },
    },
    textShadow: () => "none",
    backdrop: (accent, texture, look) => look.bg,
    paint: (ctx, W, H) => { ctx.clearRect(0, 0, W, H); },
    css: () => {
      // The kicker is a label, so it is set at label size (42 px at 1080) on its black tab.
      const r = typeof document !== "undefined" && document.getElementById("root");
      const ku = r ? Math.min(Number(r.dataset.width) || 1920, Number(r.dataset.height) || 1080) / 1080 : 1;
      return `
      #root .kicker { font-size: ${Math.round(42 * ku)}px !important; }
      #root .display { color: var(--ink); text-shadow: none; line-height: 1.0; letter-spacing: -0.005em; }
      #root h2.display { max-width: 82%; }
      #root .kicker { display: inline-block; align-self: flex-start; background: var(--ink); color: var(--bg); padding: 0.2em 0.7em; letter-spacing: 0.12em; text-shadow: none; font-weight: 800; }
    `;
    },
    stage(ctx, S, info) {
      const g = ctx;
      cache = cache && cache.S === S ? cache : { S };
      const F = makeF(g, S, info.t);
      const index = Math.max(0, info.index);
      cur = { index };
      cache.seen = cache.seen || {};
      if (info.scene) cache.seen[index] = info.scene;
      const scene = info.scene;
      const variantOf = (id, i) => (id === "title" ? 5 : id === "closing" ? 6 : i % 5);
      const kindOf = (id) => (id === "title" || id === "closing" ? id : "head");
      const k = index > 0 && info.local < info.change ? clamp(info.local / Math.max(0.01, info.change)) : 1;
      const v = variantOf(scene, index), kind = kindOf(scene);
      g.save();
      if (k < 1) {
        // The outgoing composition is the one the previous scene really showed (read from the controls,
        // so a frame rendered out of order still knows it).
        const shown = shownIds();
        const pid = (shown && shown[index - 1]) || cache.seen[index - 1] || (index === 1 ? "title" : "chart");
        drawWorld(F, variantOf(pid, index - 1), index - 1, kindOf(pid), pid, 1);
        g.save(); clipBands(F, k, true); drawWorld(F, v, index, kind, scene, 0); g.restore();
        drawBars(F, k);
      } else {
        const ch = info.change || 0.45, ok = info.next && info.local > info.hold - ch;
        drawWorld(F, v, index, kind, scene, ok ? Math.pow(clamp((info.local - (info.hold - ch)) / ch), 3) : 0);
      }
      g.restore();
    },
    scenes: { chart: wrapScene(chart), object: wrapScene(object), people: wrapScene(people), process: wrapScene(process), compare: wrapScene(compare) },
  };
});
