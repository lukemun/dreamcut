// Soft Clay: a puffy toy-box world. Everything is inflated matte clay lit from the upper left, with a warm
// bounce light under each form, a soft contact shadow on the table, and a fine thumb-pressed grain. Bean-shaped
// "doughlings" hop and blink, bars are marshmallow pillars, wires are clay noodles, and each change is a giant
// ball rolling through the frame, pushing the old scene out and leaving the new one behind it.
// All shapes are original. Frames are pure functions of time: seeded noise only, no clocks.
window.DreamcutMotion.register("soft-clay", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const seg = (v, a, b) => clamp((v - a) / (b - a));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const lerp = (a, b, k) => a + (b - a) * k;
  const spring = (v, z = 6, w = 10) => (v <= 0 ? 0 : 1 - Math.exp(-z * Math.min(v, 3)) * Math.cos(w * Math.min(v, 3)));
  const bounce = (x) => {
    x = clamp(x);
    const n1 = 7.5625, d1 = 2.75;
    if (x < 1 / d1) return n1 * x * x;
    if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
    if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
    return n1 * (x -= 2.625 / d1) * x + 0.984375;
  };
  const CONTACTS = [[1 / 2.75, 0.24], [2 / 2.75, 0.12], [2.5 / 2.75, 0.06], [1, 0.03]];
  // A drop from above: y is the share of the drop distance still to fall; sy/sx squash the landing.
  function landing(v) {
    v = clamp(v);
    let sq = 0;
    for (const [c, a] of CONTACTS) sq += a * Math.exp(-Math.pow((v - c) / 0.045, 2));
    return { y: 1 - bounce(v), sy: 1 - sq, sx: 1 + sq * 0.7, a: clamp(v * 9) };
  }
  const FONT = "'Arial Rounded MT Bold', 'Nunito', 'Varela Round', 'Quicksand', 'Trebuchet MS', Verdana, sans-serif";

  // ---- colour ---------------------------------------------------------------------------------------
  const hex = (s) => {
    s = String(s || "");
    if (s[0] === "#") {
      let h = s.slice(1);
      if (h.length === 3) h = h.split("").map((c) => c + c).join("");
      const n = parseInt(h.slice(0, 6), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const m = s.match(/rgba?\(([^)]+)\)/);
    return m ? m[1].split(",").slice(0, 3).map(Number) : [200, 190, 190];
  };
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const rgba = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
  const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  const SH = {};
  // The five tones a clay form needs: lit, body, shade, bounce light and edge.
  function shade(F, col) {
    const key = col + (F.dark ? "d" : "l");
    if (SH[key]) return SH[key];
    const c = hex(col), d = F.dark;
    const hi = mixc(c, [255, 250, 240], d ? 0.3 : 0.5);
    const lo = mixc(c, d ? [20, 8, 44] : [130, 60, 90], d ? 0.5 : 0.36);
    return (SH[key] = {
      c, base: rgba(c), hi: rgba(hi), lo: rgba(lo), rim: rgba(mixc(c, [255, 205, 160], 0.5), d ? 0.5 : 0.62),
      edge: rgba(mixc(c, d ? [10, 0, 30] : [120, 40, 80], 0.5), d ? 0.3 : 0.2), lit: lum(c),
    });
  }

  // ---- clay grain -----------------------------------------------------------------------------------
  const NOISE = {};
  function noiseTile() {
    if (NOISE.tile) return NOISE.tile;
    const c = document.createElement("canvas");
    c.width = c.height = 192;
    const g = c.getContext("2d"), r = rng(7);
    for (let i = 0; i < 1100; i++) {
      const x = r() * 192, y = r() * 192, rad = 0.6 + r() * 1.5, dark = r() < 0.55;
      g.fillStyle = dark ? `rgba(110,60,70,${0.04 + r() * 0.07})` : `rgba(255,255,255,${0.06 + r() * 0.12})`;
      for (const dx of [-192, 0, 192]) for (const dy of [-192, 0, 192]) {
        if (x + dx < -4 || x + dx > 196 || y + dy < -4 || y + dy > 196) continue;
        g.beginPath(); g.arc(x + dx, y + dy, rad, 0, TAU); g.fill();
      }
    }
    return (NOISE.tile = c);
  }
  const grain = (g) => NOISE.pat || (NOISE.pat = g.createPattern(noiseTile(), "repeat"));

  // ---- shapes: Path2D forms centred on the origin ----------------------------------------------------
  function se(w, h, n = 3, n2) {
    const p = new Path2D(), N = 64;
    n2 = n2 || n;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU, c = Math.cos(a), s = Math.sin(a), nn = s < 0 ? n : n2;
      const x = Math.sign(c) * Math.pow(Math.abs(c), 2 / nn) * w / 2, y = Math.sign(s) * Math.pow(Math.abs(s), 2 / nn) * h / 2;
      i ? p.lineTo(x, y) : p.moveTo(x, y);
    }
    p.closePath();
    return { p, w, h };
  }
  function rrect(w, h, r) {
    r = Math.max(0.01, Math.min(r, w / 2, h / 2));
    const p = new Path2D(), x = -w / 2, y = -h / 2;
    p.moveTo(x + r, y); p.arcTo(x + w, y, x + w, y + h, r); p.arcTo(x + w, y + h, x, y + h, r);
    p.arcTo(x, y + h, x, y, r); p.arcTo(x, y, x + w, y, r); p.closePath();
    return { p, w, h };
  }
  function blob(r, seed, amp = 0.12) {
    const R = rng(seed), p = new Path2D(), N = 72, ph = [R() * TAU, R() * TAU, R() * TAU];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU, k = 1 + amp * (Math.sin(2 * a + ph[0]) * 0.6 + Math.sin(3 * a + ph[1]) * 0.8 + Math.sin(5 * a + ph[2]) * 0.35);
      const x = Math.cos(a) * r * k, y = Math.sin(a) * r * k;
      i ? p.lineTo(x, y) : p.moveTo(x, y);
    }
    p.closePath();
    return { p, w: r * 2.3, h: r * 2.3 };
  }
  function flower(r, petals = 5, d = 0.3) {
    const p = new Path2D(), N = 120;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU, k = 1 - d * (0.5 - 0.5 * Math.cos(petals * a)), x = Math.sin(a) * r * k, y = -Math.cos(a) * r * k;
      i ? p.lineTo(x, y) : p.moveTo(x, y);
    }
    p.closePath();
    return { p, w: r * 2, h: r * 2 };
  }
  function ring(R, r) {
    const p = new Path2D();
    p.moveTo(R, 0); p.arc(0, 0, R, 0, TAU);
    p.moveTo(r, 0); p.arc(0, 0, r, 0, TAU);
    return { p, w: R * 2, h: R * 2, rule: "evenodd" };
  }
  function cloud(w, h) {
    const p = new Path2D();
    const add = (cx, cy, r) => { p.moveTo(cx + r, cy); p.arc(cx, cy, r, 0, TAU); };
    add(-0.3 * w, 0.1 * h, 0.3 * h); add(-0.08 * w, -0.14 * h, 0.38 * h); add(0.17 * w, -0.02 * h, 0.34 * h); add(0.34 * w, 0.14 * h, 0.26 * h);
    const b = rrect(0.9 * w, 0.62 * h, 0.31 * h);
    p.addPath(b.p, new DOMMatrix([1, 0, 0, 1, 0, 0.19 * h]));
    return { p, w, h };
  }

  // ---- the clay look: light, bounce, edge, grain and gloss --------------------------------------------
  function puff(g, F, sh, col, o = {}) {
    const k = shade(F, col), w = sh.w, h = sh.h, m = Math.min(w, h), rule = sh.rule || "nonzero", gloss = o.gloss ?? 0.6;
    g.save();
    if (o.shadow !== false) {
      g.shadowColor = F.shadowC(o.sa ?? 0.2); g.shadowBlur = 8 + m * 0.07; g.shadowOffsetY = 3 + m * 0.045;
      g.fillStyle = k.base; g.fill(sh.p, rule);
      g.shadowColor = "transparent"; g.shadowBlur = 0; g.shadowOffsetY = 0;
    }
    g.save();
    g.clip(sh.p, rule);
    let gr = g.createRadialGradient(-w * 0.2, -h * 0.28, m * 0.02, -w * 0.04, -h * 0.04, Math.max(w, h) * 0.8);
    gr.addColorStop(0, k.hi); gr.addColorStop(0.42, k.base); gr.addColorStop(1, k.lo);
    g.fillStyle = gr; g.fillRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8);
    gr = g.createLinearGradient(0, h / 2, 0, h * 0.1);
    gr.addColorStop(0, k.rim); gr.addColorStop(1, "rgba(255,200,160,0)");
    g.fillStyle = gr; g.fillRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8);
    g.lineWidth = Math.min(m * 0.2, 22); g.strokeStyle = k.edge; g.shadowColor = k.edge; g.shadowBlur = Math.min(m * 0.14, 16);
    g.stroke(sh.p);
    g.shadowColor = "transparent"; g.shadowBlur = 0;
    if (F.tex > 0.02) { g.globalAlpha = 0.3 * F.tex; g.fillStyle = grain(g); g.fillRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8); g.globalAlpha = 1; }
    if (gloss > 0) {
      g.save(); g.translate(-w * 0.22, -h * 0.28); g.rotate(-0.5); g.scale(1, 0.5);
      const rr = Math.min(m * 0.26, 90);
      gr = g.createRadialGradient(0, 0, 0, 0, 0, rr);
      gr.addColorStop(0, `rgba(255,255,255,${0.85 * gloss})`); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rr, 0, TAU); g.fill();
      g.restore();
      g.fillStyle = `rgba(255,255,255,${0.75 * gloss})`;
      g.beginPath(); g.ellipse(-w * 0.31, -h * 0.17, Math.min(m * 0.028, 7), Math.min(m * 0.05, 12), -0.55, 0, TAU); g.fill();
    }
    g.restore();
    g.restore();
  }
  // A cheap glossy bead for chains and sparkle: no clipping.
  function bead(g, F, x, y, r, col, a = 1) {
    if (r <= 0.3 || a <= 0) return;
    const k = shade(F, col);
    g.save(); g.globalAlpha *= a; g.translate(x, y);
    const gr = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r * 1.05);
    gr.addColorStop(0, k.hi); gr.addColorStop(0.5, k.base); gr.addColorStop(1, k.lo);
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,255,255,0.8)"; g.beginPath(); g.ellipse(-r * 0.36, -r * 0.42, r * 0.22, r * 0.14, -0.6, 0, TAU); g.fill();
    g.restore();
  }
  // A clay noodle: shade, body and a highlight line, all following the same polyline.
  function polyline(pts, q = 1) {
    const p = new Path2D(), n = pts.length - 1, f = clamp(q) * n, whole = Math.floor(f);
    p.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i <= Math.min(whole, n); i++) p.lineTo(pts[i][0], pts[i][1]);
    if (whole < n) { const a = pts[whole], b = pts[whole + 1], k = f - whole; p.lineTo(lerp(a[0], b[0], k), lerp(a[1], b[1], k)); }
    return p;
  }
  function tube(g, F, pts, w, col, q = 1) {
    if (q <= 0 || pts.length < 2) return;
    const k = shade(F, col), P = polyline(pts, q);
    g.save(); g.lineCap = "round"; g.lineJoin = "round";
    g.translate(0, w * 0.3); g.strokeStyle = F.shadowC(0.16); g.lineWidth = w * 1.05; g.stroke(P);
    g.translate(0, -w * 0.3); g.strokeStyle = k.lo; g.lineWidth = w; g.stroke(P);
    g.strokeStyle = k.base; g.lineWidth = w * 0.8; g.translate(0, -w * 0.05); g.stroke(P);
    g.strokeStyle = k.hi; g.lineWidth = w * 0.3; g.translate(-w * 0.06, -w * 0.15); g.globalAlpha *= 0.85; g.stroke(P);
    g.restore();
  }
  const bez = (a, b, c, d, n = 24) => {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, s = 1 - t;
      out.push([s * s * s * a[0] + 3 * s * s * t * b[0] + 3 * s * t * t * c[0] + t * t * t * d[0], s * s * s * a[1] + 3 * s * s * t * b[1] + 3 * s * t * t * c[1] + t * t * t * d[1]]);
    }
    return out;
  };
  const at = (pts, q) => {
    const f = clamp(q) * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), k = f - i;
    return [lerp(pts[i][0], pts[i + 1][0], k), lerp(pts[i][1], pts[i + 1][1], k)];
  };
  // A soft contact shadow on the table.
  function fshadow(g, F, x, y, w, lift = 0, a = 0.24) {
    g.save(); g.translate(x, y); g.scale(1, 0.2);
    const r = (w / 2) * (1 - 0.25 * clamp(lift));
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
    gr.addColorStop(0, F.shadowC(a * (1 - 0.55 * clamp(lift)))); gr.addColorStop(1, F.shadowC(0));
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    g.restore();
  }
  // Text: pressed into the clay with a light lip underneath.
  const MEAS = {};
  function measure(g, txt, size, weight) {
    const key = `${weight}|${size.toFixed(1)}|${txt}`;
    if (MEAS[key] !== undefined) return MEAS[key];
    g.save(); g.font = `${weight} ${size}px ${FONT}`;
    const w = g.measureText(txt).width;
    g.restore();
    return (MEAS[key] = w);
  }
  function inkOn(F, col) { return shade(F, col).lit > 138 ? F.th.inkOn : "#fff8f4"; }
  function pressed(g, F, txt, x, y, size, color, weight = 800, align = "center") {
    g.save(); g.font = `${weight} ${size}px ${FONT}`; g.textAlign = align; g.textBaseline = "middle";
    if (color !== "#fff8f4") { g.fillStyle = F.dark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.7)"; g.fillText(txt, x, y + size * 0.085); }
    g.fillStyle = color; g.fillText(txt, x, y + size * 0.04);
    g.restore();
  }
  // A text pill that pops as one piece: the words are on it from its first frame.
  function label(g, F, txt, x, y, size, col, o = {}) {
    txt = String(txt ?? "");
    const q = o.q ?? 1;
    if (!txt || q <= 0) return 0;
    const weight = o.weight || 800;
    let tw = measure(g, o.fit ?? txt, size, weight), padX = size * (o.pad ?? 0.62);
    if (o.maxW && tw + padX * 2 > o.maxW) { size *= Math.max(0.55, (o.maxW - padX * 2) / tw); tw = measure(g, o.fit ?? txt, size, weight); padX = size * (o.pad ?? 0.62); }
    const h = size * (o.tall || 1.62), w = tw + padX * 2;
    g.save(); g.translate(x, y); g.rotate(o.rot || 0); g.scale(q * (o.sx || 1), q * (o.sy || 1)); g.globalAlpha *= clamp(q * 4);
    puff(g, F, rrect(w, h, h / 2), col, { gloss: o.gloss ?? 0.5, sa: 0.2, shadow: o.shadow });
    pressed(g, F, txt, 0, 0, size, o.ink || inkOn(F, col), weight);
    g.restore();
    return w;
  }
  const tally = (target, k, d) => {
    const dec = Math.abs((Number(target) || 0) % 1) > 0.001 ? 1 : 0;
    return window.DreamcutMotion.formatNumber((Number(target) || 0) * k, dec, (d && d.prefix) || "", (d && d.suffix) || "");
  };

  // ---- small puffy props ------------------------------------------------------------------------------
  function prop(g, F, kind, x, y, s, col, rot = 0, o = {}) {
    g.save(); g.translate(x, y); g.rotate(rot);
    let sh;
    switch (kind) {
      case "star": sh = flower(s * 0.5, 5, 0.42); break;
      case "flower": sh = flower(s * 0.5, 6, 0.26); break;
      case "ring": sh = ring(s * 0.5, s * 0.2); break;
      case "cloud": sh = cloud(s, s * 0.56); break;
      case "cube": sh = se(s, s, 4.4); break;
      case "pill": sh = rrect(s * 1.7, s * 0.7, s * 0.35); break;
      case "blob": sh = blob(s * 0.45, o.seed || 3, 0.14); break;
      default: sh = se(s, s, 2);
    }
    puff(g, F, sh, col, { shadow: o.shadow, gloss: o.gloss ?? (kind === "bead" ? 0.9 : 0.6), sa: o.sa });
    g.restore();
  }
  // A four-point twinkle in soft white.
  function twinkle(g, x, y, r, a, rot = 0) {
    if (a <= 0.01 || r <= 0.5) return;
    g.save(); g.translate(x, y); g.rotate(rot); g.globalAlpha *= a;
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
    gr.addColorStop(0, "rgba(255,255,255,0.95)"); gr.addColorStop(0.35, "rgba(255,255,255,0.45)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r * 0.5, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,255,255,0.9)";
    g.beginPath(); g.moveTo(0, -r); g.quadraticCurveTo(r * 0.09, -r * 0.09, r, 0); g.quadraticCurveTo(r * 0.09, r * 0.09, 0, r); g.quadraticCurveTo(-r * 0.09, r * 0.09, -r, 0); g.quadraticCurveTo(-r * 0.09, -r * 0.09, 0, -r); g.fill();
    g.restore();
  }

  // ---- doughlings: original bean-shaped clay creatures -------------------------------------------------
  const BODY = [
    (s) => se(s * 0.78, s, 2.8),
    (s) => se(s * 0.92, s * 0.95, 2, 4.6),
    (s) => se(s * 0.96, s * 0.94, 2.2),
    (s) => se(s * 0.84, s * 0.9, 4.2),
    (s) => se(s * 0.58, s, 3),
  ];
  function hopOf(t, ph, period, size) {
    const c = (((t + ph) % period) + period) % period / period;
    let dy = 0, sy = 1;
    if (c < 0.1) sy = 1 - 0.13 * Math.sin((c / 0.1) * Math.PI);
    else if (c < 0.34) { const k = (c - 0.1) / 0.24; dy = -size * 0.3 * Math.sin(k * Math.PI); sy = 1 + 0.07 * Math.sin(k * Math.PI); }
    else if (c < 0.46) { const k = (c - 0.34) / 0.12; sy = 1 - 0.11 * Math.sin(k * Math.PI) * (1 - k * 0.3); }
    sy *= 1 + 0.016 * Math.sin(t * 2.4 + ph * 3);
    return { dy, sy, sx: 1 + (1 - sy) * 0.6, air: -dy / size };
  }
  function face(g, F, size, cy, o) {
    const plum = F.th.face, t = o.t, blinkT = (((t + o.ph * 1.7) % 3.6) + 3.6) % 3.6, blink = blinkT < 0.13 ? 0.12 : 1;
    const [lx, ly] = o.look || [0, 0], ex = size * 0.145, rx = size * 0.052, ry = size * 0.072 * blink;
    for (const s of [-1, 1]) {
      g.fillStyle = plum; g.beginPath(); g.ellipse(s * ex + lx * size * 0.03, cy + ly * size * 0.025, rx, ry, 0, 0, TAU); g.fill();
      if (blink > 0.5) { g.fillStyle = "rgba(255,255,255,0.92)"; g.beginPath(); g.arc(s * ex + lx * size * 0.03 + rx * 0.3, cy + ly * size * 0.025 - ry * 0.34, rx * 0.36, 0, TAU); g.fill(); }
      g.fillStyle = "rgba(255,110,140,0.4)"; g.beginPath(); g.ellipse(s * size * 0.235, cy + size * 0.085, size * 0.058, size * 0.036, 0, 0, TAU); g.fill();
    }
    const my = cy + size * 0.085;
    g.strokeStyle = plum; g.lineWidth = Math.max(2, size * 0.022); g.lineCap = "round";
    const mood = o.mood || 0;
    if (mood === 1) {
      g.beginPath(); g.moveTo(-size * 0.07, my - size * 0.012); g.quadraticCurveTo(0, my + size * 0.1, size * 0.07, my - size * 0.012); g.closePath();
      g.fillStyle = plum; g.fill();
      g.fillStyle = "rgba(255,120,150,0.9)"; g.beginPath(); g.ellipse(0, my + size * 0.045, size * 0.028, size * 0.018, 0, 0, TAU); g.fill();
    } else if (mood === 2) {
      g.beginPath(); g.moveTo(-size * 0.06, my + size * 0.03);
      g.quadraticCurveTo(-size * 0.03, my - size * 0.012, 0, my + size * 0.02); g.quadraticCurveTo(size * 0.03, my + size * 0.05, size * 0.06, my + size * 0.005); g.stroke();
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * ex - s * size * 0.06, cy - size * 0.1 - s * size * 0.005); g.lineTo(s * ex + s * size * 0.06, cy - size * 0.135 + s * size * 0.012); g.stroke(); }
    } else {
      g.beginPath(); g.arc(0, my - size * 0.03, size * 0.05, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    }
  }
  // (x, y) is where the feet meet the table.
  function doughling(g, F, x, y, size, col, o = {}) {
    const t = o.t ?? F.t, ph = o.ph || 0, ty = o.type || 0;
    const hop = o.still ? { dy: 0, sy: 1 + 0.016 * Math.sin(t * 2.4 + ph * 3), sx: 1, air: 0 } : hopOf(t, ph, o.period || 2.9, size);
    const sy = hop.sy * (o.sy || 1), sx = hop.sx * (o.sx || 1);
    const body = BODY[ty % BODY.length](size), k = shade(F, col);
    fshadow(g, F, x, y + size * 0.02, size * 0.85, hop.air * 1.4, 0.26);
    g.save(); g.translate(x, y + hop.dy + (o.dy || 0)); g.rotate(o.tilt || 0); g.scale(sx, sy);
    const cy = -body.h / 2 - size * 0.02;
    // Feet.
    for (const s of [-1, 1]) { g.save(); g.translate(s * size * 0.17, -size * 0.045); puff(g, F, rrect(size * 0.27, size * 0.13, size * 0.065), rgba(mixc(k.c, [90, 40, 60], 0.18)), { gloss: 0.2, sa: 0.12 }); g.restore(); }
    // Arms behind the body: the resting one.
    const armLen = size * 0.2, ar = size * 0.13, shY = cy + body.h * 0.12;
    const wave = o.wave ?? 0, wv = Math.sin(t * 7 + ph * 2) * 0.35;
    const arm = (s, up) => {
      const ang = up ? -0.95 + wv * wave + (o.cheer ? Math.sin(t * 6 + ph) * 0.3 : 0) : 0.55 + Math.sin(t * 1.9 + ph + s) * 0.05;
      const a = s < 0 ? Math.PI - ang : ang;
      const bx = s * body.w * 0.47, hx = bx + Math.cos(a) * armLen * 1.15, hy = shY + Math.sin(a) * armLen * 1.15;
      tube(g, F, [[bx, shY], [hx, hy]], ar, rgba(mixc(k.c, [255, 255, 255], 0.04)), 1);
      bead(g, F, hx, hy, ar * 0.78, rgba(mixc(k.c, [255, 235, 220], 0.12)));
    };
    const upL = o.cheer || (o.wave && o.waveSide === -1), upR = o.cheer || (o.wave && o.waveSide !== -1);
    if (!upL) arm(-1, false);
    if (!upR) arm(1, false);
    g.save(); g.translate(0, cy); puff(g, F, body, col, { gloss: 0.7, sa: 0.22 }); g.restore();
    face(g, F, size, cy - body.h * 0.1, { t, ph, look: o.look, mood: o.mood });
    if (upL) arm(-1, true);
    if (upR) arm(1, true);
    // Accessories on top of the head.
    const top = cy - body.h / 2, sway = Math.sin(t * 2.2 + ph * 2);
    if (ty % 5 === 0) {
      for (const s of [-1, 1]) { g.save(); g.translate(s * size * 0.07, top + size * 0.015); g.rotate(s * (0.7 + sway * 0.08)); puff(g, F, se(size * 0.21, size * 0.1, 2), F.cand(1), { gloss: 0.5, sa: 0.1 }); g.restore(); }
    } else if (ty % 5 === 1) {
      tube(g, F, [[0, top + 2], [sway * size * 0.03, top - size * 0.1], [sway * size * 0.06, top - size * 0.17]], size * 0.03, F.cand(4), 1);
      bead(g, F, sway * size * 0.06, top - size * 0.19, size * 0.06, o.glow || F.cand(0));
    } else if (ty % 5 === 2) {
      g.save(); g.translate(0, top + size * 0.03);
      puff(g, F, se(size * 0.5, size * 0.27, 2, 3), F.cand(5), { gloss: 0.5, sa: 0.12 });
      bead(g, F, sway * size * 0.02, -size * 0.15, size * 0.065, "#fff6ea");
      g.restore();
    } else if (ty % 5 === 3) {
      g.save(); g.translate(body.w * 0.22, top + size * 0.05); g.rotate(0.3);
      for (const s of [-1, 1]) { g.save(); g.translate(s * size * 0.075, 0); g.rotate(s * 0.5); puff(g, F, se(size * 0.15, size * 0.1, 2), F.cand(5), { gloss: 0.5, sa: 0.1 }); g.restore(); }
      bead(g, F, 0, 0, size * 0.04, "#fff0f2"); g.restore();
    } else {
      for (const s of [-1, 1]) { g.save(); g.translate(s * body.w * 0.34, top + size * 0.05); puff(g, F, se(size * 0.15, size * 0.15, 2), rgba(mixc(k.c, [255, 235, 220], 0.1)), { gloss: 0.4, sa: 0.1 }); g.restore(); }
    }
    g.restore();
  }

  // ---- the frame ----------------------------------------------------------------------------------------
  let CUR = null;
  function frameOf(ctx, S, info) {
    const { W, H, u, tall } = S, L = S.look;
    const ctl = (window.__dreamcut && window.__dreamcut.controls) || {};
    const idx = Math.max(0, info.index || 0);
    const camK = idx > 0 ? eio(info.local / Math.max(0.01, info.change)) : 1;
    const dark = Boolean(L.dark), sh = dark ? [0, 0, 0] : L.shadowRGB;
    const F = {
      ctx, g: ctx, S, W, H, u, tall, t: info.t, info, index: info.index || 0, scene: info.scene, th: L, dark, tex: L.texture ?? 1,
      floorTop: H * (tall ? 0.72 : 0.7), titleHold: Number(ctl.title_hold ?? 2.4),
      cam: (idx > 0 ? idx - 1 + camK : 0) * W * 0.42 + info.t * 30 * u, accent: S.accent,
    };
    F.cand = (i) => L.cand[((Math.round(i) % L.cand.length) + L.cand.length) % L.cand.length];
    F.shadowC = (a) => `rgba(${sh[0]},${sh[1]},${sh[2]},${dark ? Math.min(0.9, a * 1.7) : a})`;
    return F;
  }
  const dim = (F, col, amt) => rgba(mixc(hex(col), F.dark ? [30, 18, 56] : [255, 250, 244], amt));

  // ---- the toy room: wall, table, hills, clouds, floating clay ----------------------------------------
  const FLOATERS = (() => {
    const r = rng(23), out = [];
    const kinds = ["bead", "star", "ring", "cube", "flower", "bead", "pill", "blob"];
    for (let i = 0; i < 26; i++) out.push({ kind: kinds[i % kinds.length], col: i % 6, x: r(), y: 0.04 + r() * 0.6, s: 22 + r() * 46, depth: 0.25 + r() * 0.6, ph: r() * TAU, spin: (r() - 0.5) * 0.8, seed: 40 + i });
    return out;
  })();
  const FAR = [[0.1, 0.62, 520, 190, 1], [0.38, 0.66, 600, 230, 3], [0.66, 0.63, 560, 200, 2], [0.92, 0.65, 640, 220, 4]];
  // Little clay things resting on the table, sliding past with the camera.
  const FLOORS = (() => {
    const r = rng(61), out = [], kinds = ["cube", "mushroom", "bead", "sprout", "ring", "pill", "cube", "mushroom", "bead", "sprout", "flower", "pill"];
    for (let i = 0; i < kinds.length; i++) out.push({ kind: kinds[i], x: (i + r() * 0.7) / kinds.length, d: r(), s: 46 + r() * 52, col: (i * 5 + 2) % 6, rot: (r() - 0.5) * 0.7 });
    return out;
  })();
  function floorProps(F) {
    const { g, W, H, u, t } = F, Pw = W * 1.5, FT = F.floorTop;
    for (const f of FLOORS.slice().sort((a, b) => a.d - b.d)) {
      const x = ((((f.x * Pw - F.cam * 1.0) % Pw) + Pw) % Pw) - Pw * 0.1, y = FT + (H - FT) * (0.14 + 0.78 * f.d), s = f.s * u * (0.7 + 0.6 * f.d), col = dim(F, F.cand(f.col), 0.08);
      fshadow(g, F, x, y + 2 * u, s * 1.5, 0, 0.26);
      g.save(); g.translate(x, y);
      const wob = Math.sin(t * 1.3 + f.x * 20) * 0.03;
      if (f.kind === "mushroom") {
        g.save(); g.translate(0, -s * 0.28); puff(g, F, rrect(s * 0.42, s * 0.62, s * 0.2), "#fff3e6", { gloss: 0.4, sa: 0.12 }); g.restore();
        g.save(); g.translate(0, -s * 0.72); g.rotate(wob); puff(g, F, se(s * 1.3, s * 0.78, 2, 5), col, { gloss: 0.8, sa: 0.16 });
        for (const [dx, dy, rr] of [[-0.3, -0.04, 0.09], [0.12, -0.15, 0.07], [0.32, 0.02, 0.06]]) bead(g, F, dx * s, dy * s, rr * s, "#fff6ea"); g.restore();
      } else if (f.kind === "sprout") {
        g.save(); g.translate(0, -s * 0.22); puff(g, F, se(s * 0.74, s * 0.5, 3, 3.6), dim(F, F.cand(4), 0.1), { gloss: 0.5, sa: 0.14 }); g.restore();
        for (const sg of [-1, 1]) { g.save(); g.translate(sg * s * 0.18, -s * 0.62); g.rotate(sg * (0.8 + wob * 4)); puff(g, F, se(s * 0.52, s * 0.26, 2), F.cand(1), { gloss: 0.6, sa: 0.1 }); g.restore(); }
      } else if (f.kind === "ring") { g.translate(0, -s * 0.45); g.rotate(f.rot); puff(g, F, ring(s * 0.5, s * 0.19), col, { gloss: 0.7, sa: 0.16 }); }
      else if (f.kind === "pill") { g.translate(0, -s * 0.2); g.rotate(f.rot * 0.5); puff(g, F, rrect(s * 1.3, s * 0.5, s * 0.25), col, { gloss: 0.7, sa: 0.14 }); }
      else if (f.kind === "cube") { g.translate(0, -s * 0.4); g.rotate(f.rot); puff(g, F, se(s * 0.8, s * 0.8, 4.4), col, { gloss: 0.6, sa: 0.16 }); }
      else if (f.kind === "flower") { g.translate(0, -s * 0.45); g.rotate(t * 0.15); puff(g, F, flower(s * 0.5, 6, 0.26), col, { gloss: 0.7, sa: 0.16 }); }
      else { g.translate(0, -s * 0.4); puff(g, F, se(s * 0.8, s * 0.8, 2), col, { gloss: 0.9, sa: 0.16 }); }
      g.restore();
    }
  }
  function world(F) {
    const { g, W, H, u, t, th } = F, FT = F.floorTop;
    let gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, th.wall0); gr.addColorStop(FT / H - 0.001, th.wall1); gr.addColorStop(FT / H, th.floor0); gr.addColorStop(1, th.floor1);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // Warm window light that breathes.
    gr = g.createRadialGradient(W * 0.8, H * 0.08, 0, W * 0.8, H * 0.08, H * 0.95);
    gr.addColorStop(0, rgba(th.glow, 0.5 + 0.06 * Math.sin(t * 0.8))); gr.addColorStop(1, rgba(th.glow, 0));
    g.fillStyle = gr; g.fillRect(0, 0, W, FT);
    // Far hills of pale clay, parallax 0.12.
    const Pw = W * 1.5;
    g.save(); g.beginPath(); g.rect(0, 0, W, FT + 4 * u); g.clip();
    for (const [fx, fy, sw, sh, ci] of FAR) {
      const x = ((((fx * Pw - F.cam * 0.12) % Pw) + Pw) % Pw) - Pw * 0.18;
      g.save(); g.translate(x, FT + 20 * u); g.globalAlpha = 0.8;
      puff(g, F, se(sw * u * 1.2, sh * u * 1.6, 2.2), dim(F, F.cand(ci), 0.62), { gloss: 0.1, shadow: false });
      g.restore();
    }
    g.restore();
    // Table edge: a rolled lip of clay along the horizon.
    g.save(); g.globalAlpha = 1;
    tube(g, F, [[-20, FT + 2 * u], [W + 20, FT + 2 * u]], 26 * u, th.skirt, 1);
    g.restore();
    // Seams in the table, running to a vanishing point.
    g.save(); g.lineCap = "round";
    const sp = 230 * u, off = ((F.cam * 1.0) % sp + sp) % sp;
    for (let i = -10; i <= 14; i++) {
      const bx = i * sp - off + W * 0.1, tx = W / 2 + (bx - W / 2) * 0.22;
      g.strokeStyle = F.dark ? "rgba(0,0,0,0.25)" : "rgba(160,90,110,0.12)"; g.lineWidth = 4 * u; g.beginPath(); g.moveTo(tx, FT + 24 * u); g.lineTo(bx, H + 10); g.stroke();
      g.strokeStyle = F.dark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.55)"; g.lineWidth = 3 * u; g.beginPath(); g.moveTo(tx + 4 * u, FT + 24 * u); g.lineTo(bx + 5 * u, H + 10); g.stroke();
    }
    g.restore();
    floorProps(F);
    // Clouds: pillows drifting at parallax 0.2.
    for (let i = 0; i < 4; i++) {
      const x = ((((i * 0.32 * Pw - F.cam * 0.2 - t * 6 * u) % Pw) + Pw) % Pw) - Pw * 0.15, y = H * (0.08 + 0.1 * ((i * 5) % 3) * 0.5) + Math.sin(t * 0.5 + i) * 6 * u;
      g.save(); g.translate(x, y); g.globalAlpha = 0.95;
      puff(g, F, cloud((300 + 60 * (i % 2)) * u, 130 * u), dim(F, "#ffffff", F.dark ? 0.55 : 0.0), { gloss: 0.35, shadow: false });
      g.restore();
    }
    // Floating clay between the room and the action, three depths.
    const order = FLOATERS.slice().sort((a, b) => a.depth - b.depth);
    for (const f of order) {
      const x = ((((f.x * Pw - F.cam * f.depth) % Pw) + Pw) % Pw) - Pw * 0.12;
      const y = f.y * FT + Math.sin(t * 0.9 + f.ph) * 9 * u * f.depth, s = f.s * u * (0.7 + f.depth * 0.7);
      g.save(); g.globalAlpha = 0.55 + 0.4 * f.depth;
      prop(g, F, f.kind, x, y, s, dim(F, F.cand(f.col), 0.12), t * f.spin + f.ph, { shadow: false, seed: f.seed, gloss: 0.5 });
      g.restore();
    }
    // Two soft out-of-focus forms close to the lens.
    g.save(); g.filter = `blur(${10 * u}px)`; g.globalAlpha = 0.6;
    for (const [fx, fy, s, ci, d] of [[0.04, 0.97, 320, 4, 1.5], [0.97, 0.9, 260, 2, 1.7]]) {
      const x = ((((fx * Pw - F.cam * d) % Pw) + Pw) % Pw) - Pw * 0.1;
      g.save(); g.translate(x, fy * H + Math.sin(t * 0.6 + ci) * 12 * u);
      puff(g, F, se(s * u, s * u, 2), dim(F, F.cand(ci), 0.1), { gloss: 0.4, shadow: false });
      g.restore();
    }
    g.restore();
  }

  // ---- headline plates ----------------------------------------------------------------------------------
  const HEADS = { title: ["kicker", "title"], chart: ["chart-title"], object: ["object-title"], people: ["people-title"], process: ["process-title"], compare: ["compare-title"], closing: ["closing"] };
  const PLATE_COL = { title: 5, chart: 0, object: 2, people: 1, process: 3, compare: 4, closing: 0 };
  const rectCache = {};
  function headRect(id) {
    if (rectCache[id]) return rectCache[id];
    const root = document.getElementById("root");
    if (!root) return null;
    const scale = root.getBoundingClientRect().width / (Number(root.dataset.width) || 1920) || 1;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, any = false;
    for (const eid of HEADS[id] || []) {
      const el = document.getElementById(eid);
      if (!el || !el.firstChild) continue;
      let ox = 0, oy = 0;
      for (let n = el; n && n !== root; n = n.offsetParent) { ox += n.offsetLeft; oy += n.offsetTop; }
      const er = el.getBoundingClientRect(), range = document.createRange();
      range.selectNodeContents(el);
      for (const r of range.getClientRects()) {
        if (r.width < 2) continue;
        any = true;
        x0 = Math.min(x0, ox + (r.left - er.left) / scale); x1 = Math.max(x1, ox + (r.right - er.left) / scale);
        y0 = Math.min(y0, oy + (r.top - er.top) / scale); y1 = Math.max(y1, oy + (r.bottom - er.top) / scale);
      }
    }
    return (rectCache[id] = any ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null);
  }
  // The clay slab each headline sits on: pops in just ahead of the words, leaves just ahead of them.
  function plateBox(F, id) {
    const r = headRect(id);
    if (!r) return null;
    const { u, tall } = F, big = id === "title" || id === "closing";
    const padX = (big ? (tall ? 56 : 84) : tall ? 40 : 52) * u, padY = (big ? 54 : 30) * u;
    const w = r.w + padX * 2, h = r.h + padY * 2, cx = r.x + r.w / 2, cy = r.y + r.h / 2 + 2 * u;
    return { x: cx - w / 2, y: cy - h / 2, w, h, cx, cy, big };
  }
  function plate(F, id, local, hold, last) {
    const b = plateBox(F, id);
    if (!b) return null;
    const { g, u } = F;
    const a = clamp((local - 0.02) / 0.1), out = last ? 1 : 1 - seg(local, hold - F.info.change, hold);
    const col = dim(F, F.cand(PLATE_COL[id]), F.dark ? 0.62 : 0.74);
    const v = spring(seg(local, 0, 0.9)), sc = lerp(0.86, 1, clamp(v, 0, 1.12));
    g.save(); g.globalAlpha *= a * out; g.translate(b.cx, b.cy); g.scale(sc, sc * (1 + (v - 1) * 0.25));
    puff(g, F, rrect(b.w, b.h, Math.min(b.h / 2, (b.big ? 92 : 64) * u)), col, { gloss: 0.5, sa: 0.24 });
    g.restore();
    return b;
  }

  // ---- the rolling ball between scenes ----------------------------------------------------------------
  function roll(F, k) {
    const R = F.tall ? F.H * 0.5 : F.H * 0.6, e = eio(k);
    return { bx: lerp(-R * 1.02, F.W + R * 1.02, e), R, cy: F.H - R, k };
  }
  const halfAt = (rl, y) => Math.sqrt(Math.max(0, rl.R * rl.R - (y - rl.cy) * (y - rl.cy))) * 0.96;
  // The HTML headline of the arriving scene is only revealed behind the ball, the same edge the art uses,
  // so a new heading never shows over the outgoing drawing.
  const SCENE_IDS = ["title", "chart", "object", "people", "process", "compare", "closing"];
  function revealHeads(F, info) {
    const entering = info.index > 0 && info.local < info.change;
    const rl = entering ? roll(F, info.local / Math.max(0.01, info.change)) : null;
    for (const id of SCENE_IDS) {
      const el = document.getElementById(id + "-scene");
      if (!el) continue;
      let v = "none";
      if (rl && id === info.scene) {
        const top = el.offsetTop || 0, pts = [`-40px ${(-top - 40).toFixed(1)}px`];
        for (let y = -40; y <= F.H + 40; y += 30) pts.push(`${(rl.bx - halfAt(rl, y)).toFixed(1)}px ${(y - top).toFixed(1)}px`);
        pts.push(`-40px ${(F.H + 40 - top).toFixed(1)}px`);
        v = `polygon(${pts.join(",")})`;
      }
      el.style.clipPath = v;
    }
  }
  function sideClip(F, rl, side) {
    const { g, W, H } = F, p = new Path2D();
    const wAt = (y) => halfAt(rl, y);
    if (side === "new") {
      p.moveTo(-10, -20);
      for (let y = -20; y <= H + 20; y += 20) p.lineTo(rl.bx - wAt(y), y);
      p.lineTo(-10, H + 20);
    } else {
      p.moveTo(W + 10, -20);
      for (let y = -20; y <= H + 20; y += 20) p.lineTo(rl.bx + wAt(y), y);
      p.lineTo(W + 10, H + 20);
    }
    p.closePath();
    g.clip(p);
  }
  function ball(F, rl) {
    const { g, u } = F, col = F.cand(F.index + 4), k = shade(F, col);
    fshadow(g, F, rl.bx + rl.R * 0.1, F.H - 4 * u, rl.R * 2.1, 0, 0.32);
    g.save(); g.translate(rl.bx, rl.cy);
    puff(g, F, se(rl.R * 2, rl.R * 2, 2), col, { gloss: 0.45, sa: 0.3, shadow: false });
    g.save(); g.beginPath(); g.arc(0, 0, rl.R, 0, TAU); g.clip();
    g.rotate(rl.bx / rl.R);
    const dotCol = dim(F, col, F.dark ? -0.1 : 0.62);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU, d = i === 0 ? 0 : rl.R * 0.62, rr = (i === 0 ? 0.2 : 0.14) * rl.R;
      g.save(); g.translate(Math.cos(a) * d, Math.sin(a) * d);
      puff(g, F, se(rr * 2, rr * 2, 2), dotCol, { gloss: 0.2, shadow: false });
      g.restore();
    }
    g.rotate(-rl.bx / rl.R);
    // Real form shading: a broad key highlight, a terminator falling into the lower right, and warm bounce.
    const lo = mixc(k.c, F.dark ? [10, 0, 30] : [110, 40, 80], 0.55);
    let gr = g.createRadialGradient(-rl.R * 0.38, -rl.R * 0.42, 0, -rl.R * 0.1, -rl.R * 0.12, rl.R * 1.3);
    gr.addColorStop(0, "rgba(255,255,255,0.5)"); gr.addColorStop(0.3, "rgba(255,255,255,0.06)"); gr.addColorStop(0.62, rgba(lo, 0.12)); gr.addColorStop(0.86, rgba(lo, 0.48)); gr.addColorStop(1, rgba(lo, 0.7));
    g.fillStyle = gr; g.fillRect(-rl.R, -rl.R, rl.R * 2, rl.R * 2);
    gr = g.createLinearGradient(0, rl.R, 0, rl.R * 0.45);
    gr.addColorStop(0, k.rim); gr.addColorStop(1, "rgba(255,200,160,0)");
    g.fillStyle = gr; g.fillRect(-rl.R, -rl.R, rl.R * 2, rl.R * 2);
    if (F.tex > 0.02) { g.globalAlpha = 0.45 * F.tex; g.fillStyle = grain(g); g.fillRect(-rl.R, -rl.R, rl.R * 2, rl.R * 2); g.globalAlpha = 1; }
    g.restore();
    g.restore();
  }
  // Wrap a scene's drawing so it crosses with its neighbours behind the ball.
  function scene(id, raw) {
    // A slow handheld drift and push-in through every hold, so a built scene never sits still.
    const draw = (F, box, d, X) => {
      const { g, u, t } = F, cx = box.x + box.w / 2, cy = box.y + box.h * 0.7;
      const z = 1 + 0.03 * eio(seg(X.L, 0.9, Math.max(1.0, X.hold))) + 0.006 * Math.sin(t * 0.9);
      g.save(); g.translate(cx + Math.sin(t * 0.7) * 9 * u, cy + Math.sin(t * 0.95 + 1) * 6 * u); g.rotate(Math.sin(t * 0.55) * 0.004); g.scale(z, z); g.translate(-cx, -cy);
      raw(F, box, d, X);
      g.restore();
    };
    return (ctx, S, box, p, d, info) => {
      const F = CUR && CUR.ctx === ctx ? CUR : null;
      if (!F) return;
      F.box = box;
      const X = { L: info.local, hold: info.hold, id };
      if (info.exit !== undefined) {
        const rl = roll(F, info.exit);
        ctx.save(); sideClip(F, rl, "old"); draw(F, box, d, X); ctx.restore();
        if (F.scene === "closing") ball(F, rl);
        return;
      }
      if (F.index > 0 && info.local < info.change) {
        const rl = roll(F, info.local / Math.max(0.01, info.change));
        ctx.save(); sideClip(F, rl, "new"); draw(F, box, d, X); ctx.restore();
        ball(F, rl);
        return;
      }
      draw(F, box, d, X);
    };
  }

  // ---- title and closing: staged by the stage itself ------------------------------------------------------
  const CONFETTI = (() => {
    const r = rng(77), out = [];
    for (let i = 0; i < 44; i++) out.push({ x: r(), sp: 70 + r() * 90, ph: r(), sw: 10 + r() * 24, rot: r() * TAU, spin: (r() - 0.5) * 5, kind: i % 3, col: i % 6, s: 9 + r() * 8 });
    return out;
  })();
  function confetti(F, local) {
    const { g, W, H, u, t } = F, a = seg(local, 0.3, 0.9);
    if (a <= 0) return;
    for (const c of CONFETTI) {
      const span = H + 160 * u, y = ((((t * c.sp * u + c.ph * span) % span) + span) % span) - 80 * u, x = c.x * W + Math.sin(t * 1.3 + c.ph * 9) * c.sw * u;
      g.save(); g.globalAlpha = a;
      if (c.kind === 0) bead(g, F, x, y, c.s * u * 0.8, F.cand(c.col));
      else { g.translate(x, y); g.rotate(c.rot + t * c.spin); g.scale(1, Math.abs(Math.cos(t * 2 + c.ph * 7)) * 0.8 + 0.2); const k = shade(F, F.cand(c.col)); g.fillStyle = k.base; g.beginPath(); g.ellipse(0, 0, c.s * u * (c.kind === 1 ? 1.6 : 1), c.s * u * (c.kind === 1 ? 0.7 : 1), 0, 0, TAU); g.fill(); g.fillStyle = "rgba(255,255,255,0.45)"; g.beginPath(); g.ellipse(-c.s * u * 0.2, -c.s * u * 0.25, c.s * u * 0.4, c.s * u * 0.2, 0, 0, TAU); g.fill(); }
      g.restore();
    }
  }
  function balloon(F, x, y, s, col, ph, anchorX, anchorY) {
    const { g, u, t } = F, sway = Math.sin(t * 1.4 + ph);
    const bx = x + sway * 10 * u, by = y + Math.sin(t * 1.9 + ph * 2) * 8 * u;
    tube(g, F, bez([anchorX, anchorY], [anchorX + sway * 12 * u, anchorY - (anchorY - by) * 0.3], [bx - sway * 14 * u, by + s * 0.9], [bx, by + s * 0.62], 14), 3.5 * u, "#fff3e6", 1);
    g.save(); g.translate(bx, by); g.rotate(sway * 0.08);
    puff(g, F, se(s * 0.86, s, 2, 2.4), col, { gloss: 0.95, sa: 0.12 });
    puff(g, F, rrect(s * 0.14, s * 0.1, s * 0.04), col, { gloss: 0, shadow: false });
    g.restore();
  }
  function statement(F, id, local, hold) {
    const { g, W, H, u, t, tall } = F, last = id === "closing";
    const base = H * (tall ? 0.93 : 0.925), pb = plateBox(F, id);
    if (!pb) return;
    const chars = last
      ? [[0.12, 0.9, 250, 2, 2], [0.31, 1.0, 310, 0, 0], [0.5, 1.12, 380, 3, -1], [0.7, 1.0, 320, 1, 5], [0.89, 0.92, 260, 4, 1]]
      : [[0.2, 0.9, 270, 2, 2], [0.52, 1.1, 340, 0, -1], [0.82, 0.96, 290, 3, 5]];
    const tallK = tall ? 0.78 : 1, xs = tall && !last ? [0.2, 0.52, 0.82] : null;
    // Behind the slab: one doughling peeking over its top edge.
    const pk = spring(seg(local, 0.55, 1.25)), peekSize = (last ? 250 : 270) * u * tallK;
    g.save(); g.globalAlpha *= clamp(pk * 3);
    doughling(g, F, pb.x + pb.w * (last ? 0.16 : 0.84), pb.y + peekSize * 0.4 - Math.sin(t * 1.3) * 12 * u + (1 - clamp(pk)) * peekSize, peekSize, F.cand(last ? 5 : 1), { type: last ? 4 : 1, t, ph: 1.3, still: true, mood: 1, look: [-0.5, 0.5], wave: 1, waveSide: last ? 1 : -1 });
    g.restore();
    // The table crew.
    // The crew stands in its own band under the slab: sized so no head reaches the slab's lower edge.
    const plateBot = pb.y + pb.h + 24 * u;
    const crew = chars.map(([fx, sc, size, ty, ci], i) => {
      const v = landing(seg(local, 0.12 + i * 0.13, 0.9 + i * 0.13)), by = base + (i % 2) * 18 * u;
      const fitK = clamp((by - plateBot - 10 * u) / (size * u * tallK * sc * 1.12), 0.4, 1), s = size * u * tallK * sc * fitK;
      return { v, by, s, ty, ci, i, x: W * (xs ? xs[i] : fx) };
    });
    // Balloons first, all behind the crew, each floating beside its owner and never up into the slab.
    if (last) crew.forEach(({ v, by, s, x, i }) => {
      const side = i % 2 ? -1 : 1, bs = s * 0.5, cy = Math.max(by - s * 1.6 - (i % 3) * 20 * u, plateBot + bs * 0.62 + 16 * u);
      g.save(); g.globalAlpha *= v.a;
      balloon(F, x + side * s * 0.6, cy, bs, F.cand(i + 3), i * 1.9, x + side * s * 0.3, by - s * 0.55);
      g.restore();
    });
    crew.forEach(({ v, by, s, ty, ci, i, x }) => {
      g.save(); g.globalAlpha *= v.a;
      const col = ci === -1 ? F.accent : F.cand(ci), bx = x;
      doughling(g, F, bx, by - v.y * H * 0.6, s, col, { type: ty, t, ph: i * 0.9, period: 2.6 + i * 0.25, sy: v.sy, sx: v.sx, mood: last || i === 1 ? 1 : 0, cheer: last, wave: i === 1 ? 1 : 0, waveSide: 1, look: [Math.sin(t * 0.7 + i) * 0.6, 0.2] });
      g.restore();
    });
    // The slab goes on after the crew, so a hopping or landing character passes behind it, never over the words.
    plate(F, id, local, hold, last);
    // Orbiting clay around the slab.
    const orb = [["ring", 58, 0, 0.33, 4], ["star", 64, 2.1, -0.27, 0], ["bead", 40, 4.0, 0.41, 2], ["flower", 54, 5.2, -0.36, 5]];
    orb.forEach(([kind, s, ph, sp, ci], i) => {
      const a = t * sp + ph, v = spring(seg(local, 0.3 + i * 0.12, 1.1 + i * 0.12));
      const x = pb.cx + Math.cos(a) * (pb.w / 2 + 40 * u), y = pb.cy + Math.sin(a) * (pb.h / 2 + 34 * u);
      prop(g, F, kind, x, y, s * u * clamp(v, 0, 1.15), F.cand(ci), t * (0.5 + i * 0.2), { gloss: 0.7 });
    });
    for (const [fx, fy, ph] of [[0, 0, 0], [1, 0, 1.7], [1, 1, 3.1], [0, 1, 4.4]]) twinkle(g, pb.x + pb.w * fx, pb.y + pb.h * fy, 34 * u, 0.5 + 0.5 * Math.sin(t * 3 + ph), t * 0.4 + ph);
    // A bead rolling along the front of the table, round and round.
    const rx = ((t * 150 * u) % (W + 160 * u)) - 80 * u, rr = 34 * u;
    fshadow(g, F, rx, base + 56 * u, rr * 2.2, 0, 0.2);
    g.save(); g.translate(rx, base + 56 * u - rr); g.rotate(rx / rr);
    puff(g, F, se(rr * 2, rr * 2, 2), F.cand(3), { gloss: 0.3, shadow: false });
    g.fillStyle = "rgba(255,255,255,0.7)"; g.beginPath(); g.arc(rr * 0.5, 0, rr * 0.2, 0, TAU); g.fill(); g.beginPath(); g.arc(-rr * 0.3, rr * 0.4, rr * 0.14, 0, TAU); g.fill();
    g.restore();
    if (last) confetti(F, local);
  }

  // ---- chart: marshmallow pillars -------------------------------------------------------------------------
  function chartScene(F, box, d, X) {
    const { g, u, t, tall } = F, L = X.L, n = d.values.length;
    const vals = d.values.map((v) => Math.max(0, Number(v) || 0)), max = Math.max(...vals, 1);
    const baseY = box.y + box.h * 0.86, left = box.x + box.w * (tall ? 0.01 : 0.2), right = box.x + box.w, spacing = (right - left) / n;
    const bw = Math.min(spacing * 0.58, (tall ? 170 : 230) * u), Hmax = box.h * 0.64, hot = d.highlight;
    // Grooves pressed into the wall at a third, two thirds and the full height.
    const gq = eo(seg(L, 0, 0.9));
    for (let j = 1; j <= 3; j++) {
      const y = baseY - (Hmax * j) / 3 - 20 * u, x1 = left - 50 * u + (right - left + 70 * u) * gq;
      g.lineCap = "round"; g.lineWidth = 4 * u;
      g.strokeStyle = F.dark ? "rgba(0,0,0,0.3)" : "rgba(170,95,115,0.16)"; g.beginPath(); g.moveTo(left - 50 * u, y); g.lineTo(x1, y); g.stroke();
      g.strokeStyle = F.dark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.7)"; g.beginPath(); g.moveTo(left - 50 * u, y + 4 * u); g.lineTo(x1, y + 4 * u); g.stroke();
    }
    const tops = [], bars = [];
    for (let i = 0; i < n; i++) {
      const delay = 0.1 + 0.14 * i, grow = spring(seg(L, delay, delay + 0.95), 5, 9);
      const hFull = Hmax * Math.max(0.14, vals[i] / max), cx = left + spacing * (i + 0.5);
      const sy = 1 + 0.028 * Math.sin(t * 2.2 + i * 1.3) * (i === hot ? 1.5 : 1), h = hFull * Math.max(0, grow) * sy;
      bars.push({ i, cx, h, grow, delay, hFull });
      tops.push([cx, baseY - h - 8 * u]);
    }
    for (const b of bars) {
      const { i, cx, h, grow } = b, col = i === hot ? F.accent : F.cand(i);
      fshadow(g, F, cx, baseY + 8 * u, bw * 1.5, 0, 0.26);
      if (h < 6 * u) continue;
      g.save(); g.translate(cx, baseY); g.scale(1 - (grow - 1) * 0.35, 1);
      g.save(); g.translate(0, -h / 2);
      puff(g, F, rrect(bw, h, bw * 0.42), col, { gloss: 0.7, sa: 0.22 });
      g.restore();
      if (h > bw * 0.95) face(g, F, bw * 0.86, -h + bw * 0.6, { t, ph: i * 1.3, mood: i === hot ? 1 : 0, look: [Math.sign((hot < 0 ? n - 1 : hot) - i) * 0.7, -0.2] });
      g.restore();
    }
    // A chain of beads strung over the pillar tops, with a pulse running along it.
    const cq = eo(seg(L, 1.0, 2.0));
    if (n > 1 && cq > 0) {
      const cr = [];
      for (let i = 0; i < n - 1; i++) {
        const p0 = tops[Math.max(0, i - 1)], p1 = tops[i], p2 = tops[i + 1], p3 = tops[Math.min(n - 1, i + 2)];
        for (let k = 0; k < 12; k++) {
          const s = k / 12, s2 = s * s, s3 = s2 * s;
          cr.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * s + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * s2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * s3),
            0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * s + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * s2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * s3)]);
        }
      }
      cr.push(tops[n - 1]);
      let len = 0; for (let i = 1; i < cr.length; i++) len += Math.hypot(cr[i][0] - cr[i - 1][0], cr[i][1] - cr[i - 1][1]);
      const count = Math.max(6, Math.round(len / (34 * u)));
      for (let k = 0; k <= count * cq; k++) {
        const q = k / count, [x, y] = at(cr, q), pulse = Math.pow(Math.max(0, Math.sin(q * TAU * 1.5 - t * 3.2)), 4);
        bead(g, F, x, y - pulse * 5 * u, 8 * u * (1 + 0.8 * pulse), F.cand(k), 1);
      }
    }
    // Numbers on soft pills above each pillar, counting as the pillar rises.
    const size = (tall ? 96 : 104) * u, buddyTall = tall && hot >= 0;
    for (const b of bars) {
      const { i, cx, h, grow, delay } = b, col = i === hot ? F.accent : dim(F, F.cand(i), 0.4);
      const q = spring(seg(L, delay + 0.25, delay + 0.85), 6, 10);
      const lift = i === hot && buddyTall ? bw * 1.0 : 0, bob = Math.sin(t * 2 + i * 1.1) * 6 * u;
      const k = clamp(grow), fit = tally(vals[i], 1, d);
      if (q > 0) label(g, F, tally(vals[i], k, d), cx, baseY - h - 14 * u - size * 0.9 - lift + bob, size, col, { q: clamp(q, 0, 1.2), fit, font: "figures", pad: 0.42, maxW: tall ? spacing * 1.35 : spacing * 1.2 });
      const lq = spring(seg(L, delay - 0.05, delay + 0.5), 6, 10);
      label(g, F, d.labels[i] || "", cx, baseY + 70 * u, 44 * u, dim(F, F.cand(i), 0.62), { q: clamp(lq, 0, 1.15), maxW: spacing * 0.94 });
    }
    // The favourite pillar gets a spinning star, and a doughling cheering it on.
    if (hot >= 0 && hot < n) {
      const b = bars[hot], tq = spring(seg(L, 0.9 + hot * 0.1, 1.5 + hot * 0.1));
      const sx = b.cx + bw * 0.62, sy2 = baseY - b.h - 30 * u + Math.sin(t * 2.4) * 8 * u;
      prop(g, F, "star", sx, sy2, 62 * u * clamp(tq, 0, 1.2), F.cand(0), t * 0.9, { gloss: 0.8 });
      for (let k = 0; k < 3; k++) twinkle(g, sx + Math.cos(t * 1.8 + k * 2.1) * 48 * u, sy2 + Math.sin(t * 1.8 + k * 2.1) * 40 * u, 22 * u, 0.5 + 0.5 * Math.sin(t * 4 + k * 2), t + k);
      const bs = tall ? bw * 1.0 : Math.min(box.h * 0.48, 300 * u), v = landing(seg(L, 0.1, 0.9));
      const bx = tall ? b.cx : box.x + box.w * 0.075, by = tall ? baseY - b.h - 4 * u : baseY + 8 * u;
      g.save(); g.globalAlpha *= v.a;
      doughling(g, F, bx, by - v.y * box.h * 0.7, bs, F.cand(5), { type: 2, t, ph: 0.4, sy: v.sy, sx: v.sx, wave: 1, waveSide: 1, cheer: tall, mood: 1, still: tall, look: [0.8, -0.3] });
      g.restore();
    }
  }

  // ---- object: a plump screen with callouts on clay wires ---------------------------------------------------
  function objectScene(F, box, d, X) {
    const { g, u, t, tall } = F, L = X.L, phone = d.kind === "phone";
    let dw, dh;
    if (phone) { dw = Math.min(box.w * (tall ? 0.46 : 0.19), box.h * (tall ? 0.3 : 0.46)); dh = dw * 1.95; }
    else { dw = Math.min(box.w * (tall ? 0.94 : 0.5), box.h * (tall ? 0.52 : 1.15)); dh = dw * 0.66; }
    const dcx = box.x + box.w * (tall ? 0.5 : phone ? 0.3 : 0.27), dcy = box.y + box.h * (tall ? 0.3 : 0.4);
    const drop = landing(seg(L, 0.04, 0.85)), float = Math.sin(t * 1.5) * 7 * u, tilt = Math.sin(t * 0.9) * 0.012;
    const gy = dcy + dh / 2 + (phone ? 18 : dh * 0.36);
    fshadow(g, F, dcx, gy + 24 * u, dw * 0.9, 0.25 + 0.2 * Math.sin(t * 1.5), 0.26);
    g.save(); g.globalAlpha *= drop.a; g.translate(dcx, dcy + float - drop.y * box.h * 0.8 + 0); g.rotate(tilt); g.scale(drop.sx, drop.sy);
    // Stand: a plump neck on a pillow foot.
    if (!phone) {
      g.save(); g.translate(0, dh * 0.62); puff(g, F, rrect(dw * 0.16, dh * 0.36, dw * 0.06), dim(F, F.cand(2), 0.2), { gloss: 0.3, sa: 0.12 }); g.restore();
      g.save(); g.translate(0, dh * 0.8); puff(g, F, se(dw * 0.5, dh * 0.16, 2.6), dim(F, F.cand(2), 0.15), { gloss: 0.5, sa: 0.2 }); g.restore();
    }
    puff(g, F, se(dw, dh, 3.6), dim(F, F.cand(2), 0.28), { gloss: 0.65, sa: 0.26 });
    // The screen is pressed into the body: dark, with an inner shadow.
    const pad = dw * (phone ? 0.09 : 0.055), sw = dw - pad * 2, sh = dh - pad * (phone ? 2.4 : 2.1), scr = rrect(sw, sh, dw * (phone ? 0.09 : 0.06));
    g.save(); g.translate(0, phone ? 0 : -dh * 0.01);
    g.fillStyle = F.th.screen; g.fill(scr.p);
    g.save(); g.clip(scr.p);
    // Inside the screen: a preview of a tiny clay landscape and a three-lane timeline.
    const pvH = sh * (phone ? 0.46 : 0.5), pvW = sw * 0.9, pvY = -sh / 2 + sh * 0.06 + pvH / 2;
    g.save(); g.translate(0, pvY); g.save();
    const pvp = rrect(pvW, pvH, pvH * 0.12); g.clip(pvp.p);
    let gr = g.createLinearGradient(0, -pvH / 2, 0, pvH / 2); gr.addColorStop(0, dim(F, F.cand(2), 0.2)); gr.addColorStop(1, dim(F, F.cand(2), 0.6));
    g.fillStyle = gr; g.fillRect(-pvW / 2, -pvH / 2, pvW, pvH);
    const sunY = -pvH * 0.12 + Math.sin(t * 0.9) * pvH * 0.05;
    bead(g, F, pvW * 0.24, sunY, pvH * 0.15, F.cand(0));
    const cx0 = ((t * 22 * u) % (pvW + 160 * u)) - pvW / 2 - 60 * u;
    g.save(); g.translate(cx0, -pvH * 0.22); puff(g, F, cloud(pvH * 0.5, pvH * 0.26), "#ffffff", { gloss: 0.3, shadow: false }); g.restore();
    g.save(); g.translate(-pvW * 0.2, pvH * 0.36); puff(g, F, se(pvW * 0.8, pvH * 0.6, 2), F.cand(1), { gloss: 0.3, shadow: false }); g.restore();
    g.save(); g.translate(pvW * 0.3, pvH * 0.4); puff(g, F, se(pvW * 0.6, pvH * 0.5, 2), dim(F, F.cand(1), 0.2), { gloss: 0.3, shadow: false }); g.restore();
    g.restore();
    const pulse = 1 + 0.06 * Math.sin(t * 3);
    g.save(); g.scale(pulse, pulse); puff(g, F, se(pvH * 0.3, pvH * 0.3, 2), "#fff6ee", { gloss: 0.6, sa: 0.2 });
    g.fillStyle = F.accent; g.beginPath(); g.moveTo(-pvH * 0.04, -pvH * 0.07); g.lineTo(pvH * 0.085, 0); g.lineTo(-pvH * 0.04, pvH * 0.07); g.closePath(); g.fill(); g.restore();
    g.restore();
    const lanes = [[[0, 0.32, 2], [0.36, 0.34, 1], [0.74, 0.26, 3]], [[0.06, 0.34, 0], [0.44, 0.2, -1], [0.68, 0.26, 4]], [[0, 0.5, 5], [0.54, 0.4, 2]]];
    const tlY0 = pvY + pvH / 2 + sh * 0.07, laneH = sh * (phone ? 0.075 : 0.088), tlW = pvW, anchors = [[pvW * 0.3, pvY - pvH * 0.15], null, null];
    lanes.forEach((lane, r) => lane.forEach(([x0, w, ci], k) => {
      const q = spring(seg(L, 0.55 + r * 0.12 + k * 0.1, 1.15 + r * 0.12 + k * 0.1));
      const hotClip = ci === -1, lift = hotClip ? -laneH * 0.28 + Math.sin(t * 2.6) * laneH * 0.08 : 0;
      const cw = tlW * w * clamp(q, 0, 1.08), cx = -tlW / 2 + tlW * x0 + cw / 2, cy = tlY0 + r * (laneH + sh * 0.035) + laneH / 2;
      if (cw < 2) return;
      g.save(); g.translate(cx, cy + lift); puff(g, F, rrect(cw, laneH * (hotClip ? 1.25 : 1), laneH * 0.5), hotClip ? F.accent : dim(F, F.cand(ci), 0.12), { gloss: 0.6, sa: hotClip ? 0.3 : 0.14 }); g.restore();
      if (hotClip) anchors[1] = [cx, cy + lift];
      if (r === 2 && k === 1) anchors[2] = [cx + cw * 0.25, cy];
    }));
    const ph = ((t * 0.3) % 1), phx = -tlW / 2 + tlW * ph, phTop = tlY0 - sh * 0.025, phBot = tlY0 + 3 * (laneH + sh * 0.035);
    g.save(); g.translate(phx, (phTop + phBot) / 2); puff(g, F, rrect(7 * u, phBot - phTop, 3.5 * u), "#fff7ee", { gloss: 0.3, sa: 0.3 }); g.restore();
    bead(g, F, phx, phTop - 4 * u, 11 * u, F.accent);
    g.restore();
    // Inner shadow on the screen.
    g.save(); g.clip(scr.p); g.shadowColor = "rgba(20,8,40,0.6)"; g.shadowBlur = 20 * u; g.shadowOffsetX = 7 * u; g.shadowOffsetY = 10 * u;
    const outer = new Path2D(); outer.rect(-dw, -dh, dw * 2, dh * 2); outer.addPath(scr.p); g.fillStyle = "#000"; g.fill(outer, "evenodd"); g.restore();
    g.restore(); g.restore();
    // Sheen drifting across the glass.
    // Callouts: pills on the side with clay wires drawn out to the parts they name.
    const to = (ax, ay) => [dcx + ax, dcy + float + (phone ? 0 : -dh * 0.01) + ay];
    const pills = [0, 1, 2].map((i) => tall ? [box.x + box.w * 0.5, box.y + box.h * (0.64 + i * 0.14)] : [box.x + box.w * 0.8, box.y + box.h * (0.2 + i * 0.3)]);
    const maxW = tall ? box.w * 0.94 : box.w * 0.4;
    d.callouts.forEach((txt, i) => {
      if (!txt) return;
      const delay = 0.85 + i * 0.28, q = spring(seg(L, delay, delay + 0.55)), a = anchors[i] || [0, 0];
      const [ax, ay] = to(a[0], a[1]), bob = Math.sin(t * 1.8 + i * 1.7) * 6 * u, [px, py0] = pills[i], py = py0 + bob;
      const pw = Math.min(maxW, measure(g, txt, 44 * u, 800) + 44 * u * 1.24);
      const ex = tall ? px : px - pw / 2 - 8 * u, ey = tall ? py - 44 * u * 0.81 - 6 * u : py;
      const path = bez([ax, ay], [ax + (ex - ax) * 0.5, ay], [ex - (ex - ax) * (tall ? 0 : 0.4), ey - (tall ? (ey - ay) * 0.5 : 0)], [ex, ey], 26);
      tube(g, F, path, 16 * u, dim(F, F.cand(3 + i), 0.1), seg(L, delay + 0.2, delay + 0.8));
      bead(g, F, ax, ay, 12 * u * (1 + 0.18 * Math.sin(t * 3 + i)), F.accent, clamp((L - delay) * 3));
      const lp = Math.pow(Math.max(0, Math.sin(t * 1.4 - i * 0.9 + seg(L, delay + 0.2, delay + 0.8) * 2)), 6);
      if (L > delay + 0.5) { const [bx, by] = at(path, (t * 0.35 + i * 0.3) % 1); bead(g, F, bx, by, 6 * u * (1 + lp), "#fff6ee", 0.9); }
      label(g, F, txt, px, py, 44 * u, i === 1 ? F.accent : dim(F, F.cand(i === 0 ? 0 : 1 + i), 0.35), { q: clamp(q, 0, 1.15), maxW });
    });
    // A doughling beside the device watches the playhead.
    const v = landing(seg(L, 0.25, 1.05)), bs = (tall ? 250 : 240) * u;
    g.save(); g.globalAlpha *= v.a;
    doughling(g, F, tall ? box.x + bs * 0.45 : dcx - dw * 0.5 - bs * 0.05, gy + 14 * u - v.y * box.h * 0.6, bs, F.cand(4), { type: 3, t, ph: 2.1, sy: v.sy, sx: v.sx, look: [0.9, -0.2], mood: 1 });
    g.restore();
    for (let k = 0; k < 3; k++) twinkle(g, dcx + dw * (0.34 - k * 0.3), dcy - dh * 0.55 - Math.sin(t * 2 + k) * 8 * u, 26 * u, 0.5 + 0.5 * Math.sin(t * 3.4 + k * 2), t * 0.5 + k);
  }

  // ---- people: a crew of doughlings ---------------------------------------------------------------------------
  function tri(s) {
    const p = new Path2D(), r = s * 0.14, a = [-s * 0.5, -s * 0.4], b = [s * 0.5, -s * 0.4], c = [0, s * 0.6];
    p.moveTo(0, -s * 0.4); p.arcTo(b[0], b[1], c[0], c[1], r); p.arcTo(c[0], c[1], a[0], a[1], r); p.arcTo(a[0], a[1], b[0], b[1], r); p.arcTo(b[0], b[1], c[0], c[1], r); p.closePath();
    return { p, w: s, h: s };
  }
  function peopleScene(F, box, d, X) {
    const { g, u, t, tall } = F, L = X.L, n = clamp(Math.round(d.count) || 4, 2, 6), hot = Math.min(n - 1, d.highlight);
    const spots = [];
    if (tall && n > 3) {
      const nb = Math.ceil(n / 2), nf = n - nb;
      const sB = Math.min(box.w / nb * 1.05, box.h * 0.26), sF = Math.min(box.w / nf * 1.05, box.h * 0.3);
      for (let i = 0; i < nb; i++) spots.push({ x: box.x + (box.w * (i + 0.5)) / nb, y: box.y + box.h * 0.6, s: sB, w: box.w / nb });
      for (let j = 0; j < nf; j++) spots.push({ x: box.x + (box.w * (j + 0.5)) / nf, y: box.y + box.h * 0.92, s: sF, w: box.w / nf });
    } else {
      const sz = Math.min(box.h * (tall ? 0.34 : 0.6), (box.w / n) * 1.12, 400 * u);
      for (let i = 0; i < n; i++) spots.push({ x: box.x + (box.w * (i + 0.5)) / n, y: box.y + box.h * (tall ? 0.8 : 0.88), s: sz, w: box.w / n });
    }
    const baseY = Math.max(...spots.map((s) => s.y));
    // Rug and bunting.
    const rv = spring(seg(L, 0, 0.7));
    g.save(); g.translate(box.x + box.w / 2, baseY + 6 * u); g.scale(clamp(rv, 0, 1.05), clamp(rv, 0, 1.05));
    puff(g, F, se(box.w * 1.04, (tall && n > 3 ? 360 : 190) * u, 2.2), dim(F, F.cand(3), 0.55), { gloss: 0.15, sa: 0.18 });
    g.restore();
    if (tall && n > 3) { g.save(); g.translate(box.x + box.w / 2, spots[0].y + 6 * u); puff(g, F, se(box.w * 0.94, 190 * u, 2.2), dim(F, F.cand(5), 0.6), { gloss: 0.15, sa: 0.12 }); g.restore(); }
    const bx0 = box.x + box.w * (tall ? 0.02 : 0.28), bx1 = box.x + box.w * (tall ? 0.98 : 1.0), by0 = box.y - (tall ? 10 : 100) * u, sag = 70 * u;
    const bq = seg(L, 0.1, 0.8), string = bez([bx0, by0], [bx0 + (bx1 - bx0) * 0.3, by0 + sag * 1.3], [bx0 + (bx1 - bx0) * 0.7, by0 + sag * 1.3], [bx1, by0], 30);
    tube(g, F, string, 6 * u, "#fff3e8", bq);
    const nf = tall ? 8 : 10;
    for (let i = 0; i < nf; i++) {
      const q = (i + 0.5) / nf; if (q > bq) continue;
      const [fx, fy] = at(string, q), sw = Math.sin(t * 2 + i * 0.8) * 0.14, fl = spring(seg(L, 0.15 + i * 0.05, 0.7 + i * 0.05));
      g.save(); g.translate(fx, fy + 3 * u); g.rotate(sw); g.scale(clamp(fl, 0, 1.1), clamp(fl, 0, 1.1)); g.translate(0, 34 * u);
      puff(g, F, tri(68 * u), i % 3 === 0 ? F.accent : F.cand(i), { gloss: 0.5, sa: 0.14 });
      g.restore();
    }
    // The crew.
    spots.forEach((sp, i) => {
      const ishot = i === hot, v = landing(seg(L, 0.05 + i * 0.12, 0.85 + i * 0.12)), s = sp.s * (ishot ? 1.1 : 1) * 0.98;
      const hx = spots[hot].x, look = [clamp((hx - sp.x) / (box.w * 0.3), -1, 1), -0.1];
      const col = ishot ? F.accent : F.cand(i * 2 + 1), ty = (i * 2 + 1) % 5;
      g.save(); g.globalAlpha *= v.a;
      doughling(g, F, sp.x, sp.y - v.y * box.h * 0.8, s, col, { type: ty, t, ph: i * 1.1, period: 2.7 + (i % 3) * 0.3, sy: v.sy, sx: v.sx, wave: ishot ? 1 : 0, waveSide: 1, mood: ishot ? 1 : 0, look: ishot ? [0.2, 0] : look });
      g.restore();
      const txt = i < d.badges.length ? d.badges[i] : "", q = spring(seg(L, 0.5 + i * 0.12, 1.05 + i * 0.12)), bob = Math.sin(t * 2.1 + i * 1.3) * 6 * u;
      if (txt) label(g, F, txt, sp.x, sp.y - s * 1.22 - 52 * u + bob, 44 * u, ishot ? F.accent : dim(F, F.cand(i * 2 + 1), 0.45), { q: clamp(q, 0, 1.15), maxW: sp.w * 0.98 });
      if (ishot) for (let k = 0; k < 4; k++) twinkle(g, sp.x + Math.cos(t * 1.4 + k * 1.6) * s * 0.75, sp.y - s * 0.55 + Math.sin(t * 1.4 + k * 1.6) * s * 0.5, 26 * u, 0.5 + 0.5 * Math.sin(t * 3.6 + k * 2), t + k);
    });
  }

  // ---- process: a marble run between plump stations --------------------------------------------------------
  function stepIcon(g, F, kind, s, t, col) {
    if (kind === "file") {
      puff(g, F, rrect(s * 0.62, s * 0.78, s * 0.1), "#fff6ec", { gloss: 0.5, sa: 0.16 });
      for (let k = 0; k < 3; k++) { g.fillStyle = "rgba(150,90,120,0.28)"; g.beginPath(); g.roundRect ? g.roundRect(-s * 0.2, -s * 0.18 + k * s * 0.15, s * (k === 2 ? 0.24 : 0.4), s * 0.06, s * 0.03) : g.rect(-s * 0.2, -s * 0.18 + k * s * 0.15, s * 0.4, s * 0.06); g.fill(); }
      g.save(); g.translate(s * 0.22, -s * 0.3); g.rotate(0.3 + Math.sin(t * 2) * 0.04); puff(g, F, tri(s * 0.26), col, { gloss: 0.4, sa: 0.12 }); g.restore();
    } else if (kind === "spark") {
      g.save(); g.rotate(t * 0.7); puff(g, F, flower(s * 0.4, 4, 0.4), "#fff0b8", { gloss: 0.8, sa: 0.18 }); g.restore();
      for (let k = 0; k < 3; k++) { const a = t * 1.6 + k * 2.1; bead(g, F, Math.cos(a) * s * 0.48, Math.sin(a) * s * 0.34, s * 0.06, F.cand(k + 2)); }
    } else if (kind === "eye") {
      puff(g, F, se(s * 0.8, s * 0.5, 2), "#fff6ec", { gloss: 0.5, sa: 0.16 });
      bead(g, F, Math.sin(t * 1.3) * s * 0.12, 0, s * 0.17, F.cand(2));
      bead(g, F, Math.sin(t * 1.3) * s * 0.12, 0, s * 0.08, F.th.face);
    } else {
      puff(g, F, ring(s * 0.4, s * 0.24), "#fff6ec", { gloss: 0.6, sa: 0.16 });
      tube(g, F, [[-s * 0.17, s * 0.0], [-s * 0.04, s * 0.14], [s * 0.2, -s * 0.14]], s * 0.1, col, 1);
    }
  }
  function processScene(F, box, d, X) {
    const { g, u, t, tall } = F, L = X.L, n = d.steps.length;
    const cs = tall ? Math.min(box.w * 0.5, (box.h / n) * 0.68) : Math.min((box.w / n) * 0.62, box.h * 0.62);
    const pos = (i) => tall ? { x: box.x + box.w * (i % 2 ? 0.66 : 0.34), y: box.y + box.h * ((i + 0.5) / n) } : { x: box.x + (box.w * (i + 0.5)) / n, y: box.y + box.h * 0.46 };
    const kinds = ["file", "spark", "eye", "check"];
    const hoses = [];
    for (let i = 0; i < n - 1; i++) {
      const a = pos(i), b = pos(i + 1);
      const A = tall ? [a.x, a.y + cs / 2] : [a.x, a.y - cs / 2], B = [b.x, b.y - cs / 2], arc = (tall ? 90 : 120) * u;
      hoses.push(tall ? bez(A, [A[0], A[1] + arc], [B[0], B[1] - arc], B, 28) : bez(A, [A[0] + (B[0] - A[0]) * 0.18, A[1] - arc], [B[0] - (B[0] - A[0]) * 0.18, B[1] - arc], B, 28));
    }
    hoses.forEach((h, i) => tube(g, F, h, 22 * u, dim(F, F.cand(3), 0.3), seg(L, 0.7 + i * 0.3, 1.2 + i * 0.3)));
    const speed = 0.5, m = (t * speed) % (n - 1 + 0.55);
    for (let i = 0; i < n; i++) {
      const p = pos(i), last = i === n - 1, v = landing(seg(L, 0.04 + i * 0.13, 0.85 + i * 0.13));
      const dm = m - i, hit = Math.exp(-Math.pow(dm / 0.09, 2)) * 0.09 + (dm > 0 ? Math.exp(-dm * 5) * Math.sin(dm * 30) * 0.02 : 0);
      const col = last ? F.accent : dim(F, F.cand(i === 0 ? 2 : i === 1 ? 0 : 1), 0.1);
      fshadow(g, F, p.x, p.y + cs / 2 + 16 * u, cs * 1.1, 0, 0.26);
      const fb = Math.sin(t * 1.7 + i * 1.9) * 7 * u;
      g.save(); g.globalAlpha *= v.a; g.translate(p.x, p.y + cs / 2 - v.y * box.h * 0.8 + fb); g.rotate(Math.sin(t * 1.3 + i * 2.3) * 0.025); g.scale(v.sx * (1 + hit * 0.8), v.sy * (1 - hit)); g.translate(0, -cs / 2);
      puff(g, F, se(cs, cs, 3.6), col, { gloss: 0.7, sa: 0.24 });
      g.save(); g.translate(0, -cs * 0.04); stepIcon(g, F, kinds[last ? 3 : i % 3], cs * 0.62, t + i, last ? "#fff6ec" : F.accent); g.restore();
      g.save(); g.translate(-cs * 0.36, -cs * 0.36); puff(g, F, se(cs * 0.26, cs * 0.26, 2), "#fff6ec", { gloss: 0.5, sa: 0.16 });
      pressed(g, F, String(i + 1), 0, 0, Math.max(46 * u, cs * 0.17), F.th.inkOn, 800); g.restore();
      g.restore();
      const q = spring(seg(L, 0.45 + i * 0.13, 1.0 + i * 0.13)), maxW = tall ? box.w - Math.abs(p.x - (box.x + box.w / 2)) - cs * 0.5 - 20 * u + box.w * 0.2 : (box.w / n) * 0.94;
      const lx = tall ? p.x + (i % 2 ? -1 : 1) * (cs / 2 + 30 * u + 0) : p.x, ly = tall ? p.y : p.y + cs / 2 + 74 * u;
      if (d.steps[i]) {
        const tw = measure(g, d.steps[i], 44 * u, 800) + 44 * u * 1.24, wLab = Math.min(tw, tall ? box.w * 0.5 : maxW);
        label(g, F, d.steps[i], tall ? lx + (i % 2 ? -1 : 1) * wLab / 2 : lx, ly + Math.sin(t * 2 + i) * 4 * u, 44 * u, dim(F, col, 0.0), { q: clamp(q, 0, 1.15), maxW: tall ? box.w * 0.5 : maxW });
      }
    }
    // The marble: drops in at the first station, rolls the hoses, pops at the last.
    if (L > 1.0 && n > 1) {
      if (m < n - 1) {
        const i = Math.min(n - 2, Math.floor(m)), f = m - i, [mx, my] = at(hoses[i], tall ? f : f), r = 25 * u;
        fshadow(g, F, mx, my + 40 * u, r * 2.2, 0.6, 0.12);
        bead(g, F, mx, my - r * 0.9, r, F.accent);
        for (let k = 1; k <= 3; k++) { const f2 = f - k * 0.035; if (f2 > 0) { const [tx, ty] = at(hoses[i], f2); bead(g, F, tx, ty - r * 0.9, r * (1 - k * 0.2), F.accent, 0.28 / k); } }
      } else {
        const p = pos(n - 1), k = (m - (n - 1)) / 0.55;
        for (let j = 0; j < 4; j++) twinkle(g, p.x + Math.cos(j * 1.57 + 0.5) * cs * (0.3 + k * 0.4), p.y - cs / 2 + Math.sin(j * 1.57 + 0.5) * cs * (0.2 + k * 0.3), 30 * u * (1 - k * 0.4), 1 - k, j);
      }
    }
    // A doughling sits on the last station and cheers each arrival.
    const lp = pos(n - 1), bs = cs * 0.5, bv = landing(seg(L, 0.6, 1.3)), cheer = m > n - 1.5;
    g.save(); g.globalAlpha *= bv.a;
    doughling(g, F, lp.x + (tall ? 0 : cs * 0.56), (tall ? lp.y + cs * 0.5 - 8 * u : lp.y + cs * 0.5) - bv.y * box.h * 0.6, bs, F.cand(5), { type: 1, t, ph: 0.8, still: true, sy: bv.sy, sx: bv.sx, wave: cheer ? 1 : 0, waveSide: -1, mood: 1, look: [-0.6, -0.2] });
    g.restore();
  }

  // ---- compare: a seesaw of two weights ----------------------------------------------------------------------
  function compareScene(F, box, d, X) {
    const { g, u, t, tall } = F, L = X.L;
    const lv = Number(d.leftValue) || 0, rv = Number(d.rightValue) || 0, mx = Math.max(lv, rv, 1);
    const px = box.x + box.w / 2, py = box.y + box.h * (tall ? 0.6 : 0.68), plankW = box.w * (tall ? 0.96 : 0.72), plankH = 46 * u;
    const rMax = Math.min(box.h * (tall ? 0.15 : 0.27), plankW * 0.17), r = [rMax * (0.52 + 0.48 * lv / mx), rMax * (0.52 + 0.48 * rv / mx)];
    const settle = spring(seg(L, 0.75, 1.9), 4.2, 7), theta = clamp((rv - lv) / mx, -1, 1) * 0.15 * settle + Math.sin(t * 1.7) * 0.012;
    const gy = py + 150 * u, hb = plateBox(F, "compare"), headBot = (hb ? hb.y + hb.h : box.y) + 14 * u;
    fshadow(g, F, px, gy + 6 * u, 260 * u, 0, 0.28);
    const fv = landing(seg(L, 0.0, 0.7));
    g.save(); g.translate(px, gy - fv.y * box.h * 0.5); g.globalAlpha *= fv.a; g.scale(fv.sx, fv.sy); g.translate(0, -75 * u);
    puff(g, F, se(150 * u, 160 * u, 2, 4.6), dim(F, F.cand(4), 0.15), { gloss: 0.6, sa: 0.24 });
    g.restore();
    const pv = spring(seg(L, 0.15, 0.8));
    g.save(); g.translate(px, py); g.rotate(theta); g.scale(clamp(pv, 0, 1.05), clamp(pv, 0, 1.05));
    puff(g, F, rrect(plankW, plankH, plankH / 2), dim(F, F.cand(0), 0.1), { gloss: 0.7, sa: 0.24 });
    for (let k = -4; k <= 4; k++) { g.fillStyle = "rgba(255,255,255,0.4)"; g.beginPath(); g.arc(k * plankW * 0.1, -plankH * 0.05, 4 * u, 0, TAU); g.fill(); }
    // A clay saucer pressed onto the plank under each weight, so each one visibly sits on the board.
    for (const [sg, k] of [[-1, 0], [1, 1]]) {
      const sq = spring(seg(L, 0.3 + k * 0.17, 0.8 + k * 0.17)), sw = r[k] * 1.25 * clamp(sq, 0, 1.08);
      if (sw < 2) continue;
      g.save(); g.translate(sg * plankW * 0.3, -plankH * 0.62);
      puff(g, F, se(sw, plankH * 0.62, 2.4, 5), dim(F, F.cand(k ? 5 : 1), 0.12), { gloss: 0.4, sa: 0.2 });
      g.restore();
    }
    g.restore();
    bead(g, F, px, py, 20 * u * clamp(pv, 0, 1), F.cand(5));
    const sides = [[-1, d.left, lv, 0], [1, d.right, rv, 1]];
    sides.forEach(([sg, name, val, k]) => {
      const off = sg * plankW * 0.3, rr = r[k], bv = landing(seg(L, 0.15 + k * 0.17, 0.85 + k * 0.17));
      const lx = off, ly = -plankH * 0.78 - rr, c = Math.cos(theta), s = Math.sin(theta);
      // The drop starts below the headline slab, so a falling weight never crosses the heading.
      const byRest = py + lx * s + ly * c, drop = Math.min(box.h * 0.85, Math.max(0, byRest - rr - headBot));
      const bx = px + lx * c - ly * s, by = byRest - bv.y * drop;
      const col = k ? F.accent : dim(F, F.cand(3), 0.05), squash = 1 + Math.sin(t * 2.4 + k * 2) * 0.02;
      // Contact shade where the weight presses into its saucer.
      if (bv.y < 0.05) { g.save(); g.translate(bx, by + rr * 0.97); g.rotate(theta); g.scale(1, 0.22); const cg = g.createRadialGradient(0, 0, 0, 0, 0, rr * 0.7); cg.addColorStop(0, F.shadowC(0.35)); cg.addColorStop(1, F.shadowC(0)); g.fillStyle = cg; g.beginPath(); g.arc(0, 0, rr * 0.7, 0, TAU); g.fill(); g.restore(); }
      g.save(); g.globalAlpha *= bv.a; g.translate(bx, by + rr); g.rotate(theta); g.scale(bv.sx / squash, bv.sy * squash); g.translate(0, -rr);
      puff(g, F, se(rr * 2, rr * 2, 2), col, { gloss: 0.8, sa: 0.26 });
      face(g, F, rr * 1.9, -rr * 0.05, { t, ph: k * 2, mood: k ? 1 : 2, look: [-sg * 0.3, 0.1] });
      g.restore();
      if (!k) {
        const dp = (t * 0.7) % 1;
        if (L > 1.0) bead(g, F, bx + rr * 0.55, by - rr * 0.4 + dp * rr * 0.7, rr * 0.09 * (1 - dp * 0.4), "#9fd8ff", 0.9 * (1 - dp));
      } else if (L > 1.0) for (let j = 0; j < 3; j++) twinkle(g, bx + Math.cos(t * 1.6 + j * 2.1) * rr * 1.15, by + Math.sin(t * 1.6 + j * 2.1) * rr * 1.05, 24 * u, 0.5 + 0.5 * Math.sin(t * 4 + j * 2), t + j);
      const size = (tall ? 100 : 108) * u, nq = spring(seg(L, 0.65 + k * 0.17, 1.2 + k * 0.17)), nb = Math.sin(t * 2 + k * 1.4) * 6 * u;
      label(g, F, tally(val, clamp(seg(L, 0.7 + k * 0.17, 1.9)), d), bx, byRest - rr - size * 0.95 - 10 * u + nb, size, col === F.accent ? F.accent : dim(F, F.cand(3), 0.4), { q: clamp(nq, 0, 1.15), fit: tally(val, 1, d), pad: 0.45, maxW: box.w * 0.46 });
      const tx = px + off * c - (plankH / 2 + 78 * u) * s * 0 + 0, ty = py + off * s + plankH / 2 + 78 * u;
      label(g, F, name, tx, ty, 44 * u, dim(F, col === F.accent ? F.accent : F.cand(3), col === F.accent ? 0.15 : 0.5), { q: clamp(spring(seg(L, 0.5 + k * 0.17, 1.0 + k * 0.17)), 0, 1.15), maxW: plankW * 0.46 });
    });
    if (!tall) {
      for (const [sgn, ty, ci, mood] of [[-1, 3, 1, 2], [1, 0, 5, 1]]) {
        const v = landing(seg(L, 0.2, 1.0)), sx0 = box.x + box.w * (sgn < 0 ? 0.045 : 0.955), bs = 230 * u;
        g.save(); g.globalAlpha *= v.a;
        doughling(g, F, sx0, box.y + box.h * 0.9 - v.y * box.h * 0.6, bs, F.cand(ci), { type: ty, t, ph: sgn + 2, sy: v.sy, sx: v.sx, mood, cheer: mood === 1, look: [-sgn * 0.7, -0.2] });
        g.restore();
      }
    }
  }

  // ---- the look ---------------------------------------------------------------------------------------------
  const BASE = {
    bg: "#fff3e8", panel: "#fff8f0", ink: "#4a2d4d", muted: "#8d6a88", accent: "#ff6f61", onAccent: "#ffffff",
    rule: "rgba(74,45,77,0.35)", track: "rgba(74,45,77,0.1)",
    wall0: "#fff7ec", wall1: "#ffe8da", floor0: "#ffe1d0", floor1: "#ffcdbd", skirt: "#fff4ea", glow: [255, 226, 170],
    cand: ["#ffd36e", "#86d6bd", "#8fc6ff", "#b9a2ff", "#ffb08a", "#ff9ec4"],
    face: "#3d2342", inkOn: "#3d2342", screen: "#5b4a88", shadowRGB: [150, 80, 110], dark: false,
  };
  const look = (o) => ({ ...BASE, ...o });
  const dropShadow = (c) => `0 0.03em 0 rgba(255,255,255,0.85), 0 0.07em 0.1em rgba(${c},0.3)`;
  return {
    ...BASE,
    display: FONT, displayWeight: 800, displayCase: "none", displayTracking: "0em",
    body: FONT, bodyWeight: 800, figures: FONT, radius: 40, motion: "pop", change: "lift",
    kit: { line: 3, fill: "solid", panel: "fill" },
    panelEdge: "rgba(255,255,255,0.7)",
    // Headlines set straight on this look's backdrop, where its ink and accent (meant for panels) do not read.
    displayAccent: { original: "#a6483f", light: "#b34b4b" },
    palettes: {
      // Mint daylight, twilight playroom, and sand clay.
      light: look({ bg: "#f1faf6", wall0: "#f4fbf8", wall1: "#e3f3ec", floor0: "#d8efe4", floor1: "#c4e6d6", skirt: "#f4fbf6", glow: [200, 255, 232], accent: "#ff6b6b", ink: "#2f3f4a", muted: "#5d7480", inkOn: "#2f3f4a", face: "#2c3a44", screen: "#3f5f6e",
        cand: ["#ffd98a", "#8ee3c6", "#9bd0ff", "#c5b3ff", "#ffbf9c", "#ffa9cc"], shadowRGB: [70, 120, 110] }),
      dark: look({ bg: "#2a1f3e", panel: "#3a2c52", ink: "#fff1f4", muted: "#cdb9d8", accent: "#ff7a6b", wall0: "#33264a", wall1: "#2a1f3e", floor0: "#231936", floor1: "#190f28", skirt: "#4a3a66", glow: [150, 110, 255],
        cand: ["#ffc95c", "#5fe0b8", "#6fb4ff", "#a98bff", "#ff9a73", "#ff8fc0"], face: "#2a1a38", inkOn: "#2d1a3a", screen: "#120a22", shadowRGB: [0, 0, 0], dark: true, rule: "rgba(255,241,244,0.35)", track: "rgba(255,241,244,0.12)" }),
      mono: look({ bg: "#efe9e1", panel: "#f7f2ea", ink: "#3b322c", muted: "#7a6e64", accent: "#6a5c50", onAccent: "#fff8f0", wall0: "#f5f0e9", wall1: "#ebe4da", floor0: "#e3dace", floor1: "#d5cbbd", skirt: "#f7f2ea", glow: [255, 250, 238],
        cand: ["#d9d0c3", "#bcb1a2", "#a69a8b", "#e7dfd3", "#8e8374", "#cbc0b1"], face: "#3b322c", inkOn: "#3b322c", screen: "#6e655b", shadowRGB: [120, 100, 80], rule: "rgba(59,50,44,0.3)" }),
    },
    textShadow: () => dropShadow("150,80,110"),
    backdrop: (accent, texture, lk) => { const l = lk || BASE; return `linear-gradient(180deg, ${l.wall0} 0%, ${l.wall1} 70%, ${l.floor0} 70%, ${l.floor1} 100%)`; },
    // The headline is clay too: pressed letters on a slab, and the kicker a little puffed pill.
    css: (accent, lk) => {
      const sh = lk.dark ? "0,0,0" : lk.shadowRGB.join(",");
      const text = lk.dark ? `0 0.05em 0.12em rgba(${sh},0.55)` : dropShadow(sh);
      // Statements sit in the upper band, leaving the table below to the crew; long lines break evenly.
      return `#root .display { text-shadow: ${text}; text-wrap: balance; }
      #root .statement { bottom: 40% !important; }
      #root .kicker { font-size: 44px !important; letter-spacing: 0.1em; align-self: flex-start; padding: 0.38em 1.05em 0.42em; border-radius: 999px; background: ${accent}; color: ${lk.onAccent}; text-shadow: none;
        box-shadow: inset 0 0.14em 0.1em rgba(255,255,255,0.55), inset 0 -0.2em 0.3em rgba(0,0,0,0.14), 0 0.25em 0.5em rgba(${sh},0.28); margin-bottom: 0.5em !important; }`;
    },
    paint: (ctx, W, H, t, accent, lk) => {
      ctx.clearRect(0, 0, W, H);
      const sh = lk.dark ? "0,0,0" : lk.shadowRGB.join(",");
      let gr = ctx.createRadialGradient(W / 2, H * 0.48, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
      gr.addColorStop(0, `rgba(${sh},0)`); gr.addColorStop(1, `rgba(${sh},${lk.dark ? 0.32 : 0.12})`);
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      const sx = (((t * 0.07) % 1.6) - 0.3) * W;
      gr = ctx.createLinearGradient(sx - W * 0.2, 0, sx + W * 0.2, H * 0.4);
      gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.5, `rgba(255,255,255,${lk.dark ? 0.03 : 0.07})`); gr.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.3; ctx.fillStyle = grain(ctx); ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    },
    paintOver: true,
    keepArt: true,
    overlap: true,
    stage(ctx, S, info) {
      const F = (CUR = frameOf(ctx, S, info)), sc = info.scene;
      ctx.save();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; ctx.setLineDash([]);
      if (S.paint) world(F);
      if (sc === "title" || sc === "closing") {
        ctx.save();
        const entering = info.index > 0 && info.local < info.change;
        if (sc === "closing" && entering) sideClip(F, roll(F, info.local / Math.max(0.01, info.change)), "new");
        statement(F, sc, info.local, info.hold);
        ctx.restore();
        if (sc === "closing" && entering && F.titleHold > 0 && info.index === 1) ball(F, roll(F, info.local / Math.max(0.01, info.change)));
      } else if (sc) {
        // The title has no drawer, so it rolls out here when the next scene begins.
        if (info.index === 1 && F.titleHold > 0 && info.local < info.change) {
          ctx.save(); sideClip(F, roll(F, info.local / Math.max(0.01, info.change)), "old");
          statement(F, "title", F.titleHold + info.local, F.titleHold);
          ctx.restore();
        }
        const entering = info.index > 0 && info.local < info.change;
        ctx.save();
        if (entering) sideClip(F, roll(F, info.local / Math.max(0.01, info.change)), "new");
        plate(F, sc, info.local, info.hold, !info.next);
        ctx.restore();
      }
      revealHeads(F, info);
      ctx.restore();
    },
    scenes: { chart: scene("chart", chartScene), object: scene("object", objectScene), people: scene("people", peopleScene), process: scene("process", processScene), compare: scene("compare", compareScene) },
  };
});
