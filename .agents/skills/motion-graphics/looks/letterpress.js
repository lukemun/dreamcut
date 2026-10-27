// Letterpress: a print shop where every scene is one pull of a hand press. Wood-type headlines, locked-up
// forms of rules, slugs and ornaments, and drawings cut like engravings land on cream stock in a black
// plate and a vermilion plate that sit slightly out of register. Each plate is speckled where the ink
// starved, debossed into the paper and given a wet sheen that sweeps over it, so holds never go still.
// Scenes change when a fresh sheet is fed in over the last one. All drawings are original.
// Frames are pure functions of time: seeded generators and hashes only.
window.DreamcutMotion.register("letterpress", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const mod = (a, n) => ((a % n) + n) % n;
  const hash = (n) => { n = Math.imul((n | 0) ^ ((n | 0) >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const wave = (t, s) => Math.sin(t * 1.3 + s * 5.1) * 0.6 + Math.sin(t * 2.3 + s * 2.7) * 0.4;

  const FONT = {
    head: "Impact, 'Haettenschweiler', 'Avenir Next Condensed', 'Arial Narrow', sans-serif",
    fat: "'Bodoni 72', 'Bodoni MT', Didot, 'Hoefler Text', Georgia, serif",
    slab: "'American Typewriter', Rockwell, 'Courier New', serif",
    cond: "'Avenir Next Condensed', 'DIN Condensed', 'Arial Narrow', sans-serif",
    copper: "Copperplate, 'Copperplate Gothic Bold', 'Avenir Next Condensed', serif",
  };
  const FACES = ["head", "fat", "slab", "cond", "copper"];

  // ---- per-frame state -----------------------------------------------------------------------------
  let frame = null, plates = null, assets = null, assetKey = "";
  const headCache = {};

  function controls() {
    if (window.__dreamcut && window.__dreamcut.controls) return window.__dreamcut.controls;
    try { if (typeof dc !== "undefined" && dc && dc.controls) return dc.controls; } catch (e) { /* not on this page */ }
    return null;
  }
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  function planOf() {
    const c = controls();
    if (!c) return null;
    let t = 0;
    const shown = [];
    for (const id of ORDER) { const hold = Number(c[`${id}_hold`]) || 0; if (hold > 0) shown.push({ id, start: t, hold }); t += hold; }
    return shown.length ? shown : null;
  }

  const mkCanvas = (W, H) => { const c = document.createElement("canvas"); c.width = W; c.height = H; return c; };
  function platesFor(W, H) {
    if (!plates || plates.W !== W || plates.H !== H) {
      plates = { W, H, K: mkCanvas(W, H), R: mkCanvas(W, H), T: mkCanvas(W, H) };
      plates.kg = plates.K.getContext("2d"); plates.rg = plates.R.getContext("2d"); plates.tg = plates.T.getContext("2d");
    }
    return plates;
  }

  // ---- stock and ink tiles (seeded, cached) --------------------------------------------------------
  function buildAssets(F) {
    const { W, H, u, T, S } = F, tex = S.look.texture;
    const paper = mkCanvas(W, H), g = paper.getContext("2d");
    g.fillStyle = T.paper; g.fillRect(0, 0, W, H);
    const r = rng(4242);
    if (tex > 0) {
      // Soft mottling: stock is never one flat colour.
      for (let i = 0; i < 90; i++) {
        const x = r() * W, y = r() * H, rad = (40 + r() * 160) * u, dark = r() < 0.55;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        const a = (0.012 + r() * 0.02) * tex;
        gr.addColorStop(0, dark ? `rgba(${T.fibre},${a})` : `rgba(255,252,240,${a * 1.3})`); gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      // Fibres and chaff.
      g.lineCap = "round";
      for (let i = 0; i < 3200 * (W * H) / (1920 * 1080); i++) {
        const x = r() * W, y = r() * H, len = (5 + r() * 20) * u, a = r() * TAU, light = r() < 0.4;
        g.strokeStyle = light ? `rgba(255,252,240,${0.18 * tex})` : `rgba(${T.fibre},${(0.05 + r() * 0.09) * tex})`;
        g.lineWidth = Math.max(0.6, (0.6 + r() * 0.8) * u);
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (r() - 0.5) * 4 * u, y + Math.sin(a) * len * 0.5 + (r() - 0.5) * 4 * u, x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
      }
      for (let i = 0; i < 160 * (W * H) / (1920 * 1080); i++) {
        g.fillStyle = `rgba(${T.fibre},${(0.15 + r() * 0.3) * tex})`;
        g.beginPath(); g.arc(r() * W, r() * H, (0.5 + r() * 1.3) * u, 0, TAU); g.fill();
      }
    }
    // Ink-starve tile: where it is opaque, the plate loses ink. Small voids, hairline scratches, soft thin patches.
    const speck = (seed, size) => {
      const c = mkCanvas(size, size), q = c.getContext("2d"), z = rng(seed);
      q.fillStyle = "#000";
      for (let i = 0; i < 1500; i++) { q.globalAlpha = (0.35 + z() * 0.65) * tex; q.beginPath(); q.arc(z() * size, z() * size, (0.5 + z() * z() * 2.2) * u, 0, TAU); q.fill(); }
      q.strokeStyle = "#000"; q.lineCap = "round";
      for (let i = 0; i < 46; i++) { q.globalAlpha = (0.2 + z() * 0.4) * tex; q.lineWidth = (0.6 + z()) * u; const x = z() * size, y = z() * size, l = (8 + z() * 40) * u, a = (z() - 0.5) * 0.5; q.beginPath(); q.moveTo(x, y); q.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); q.stroke(); }
      for (let i = 0; i < 38; i++) {
        const x = z() * size, y = z() * size, rad = (25 + z() * 90) * u, gr = q.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, `rgba(0,0,0,${0.22 * tex})`); gr.addColorStop(1, "rgba(0,0,0,0)"); q.globalAlpha = 1; q.fillStyle = gr; q.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      return c;
    };
    const size = Math.max(256, Math.round(640 * u));
    const tk = speck(11, size), tr = speck(29, size);
    // Lint: tiny curled hairs that drift across the sheet.
    return { paper, tileK: tk, tileR: tr, patK: g.createPattern(tk, "repeat"), patR: g.createPattern(tr, "repeat"), tileSize: size };
  }

  // ---- the frame -----------------------------------------------------------------------------------
  function headMetrics(F, id) {
    const key = `${F.W}x${F.H}:${id}`;
    if (headCache[key]) return headCache[key];
    const u = F.u;
    let bottom = (F.tall ? 170 : 96) * u + 90 * u, right = 600 * u;
    try {
      const el = document.getElementById(`${id}-title`), root = document.getElementById("root");
      if (el && root) {
        const rr = root.getBoundingClientRect(), k = rr.width ? rr.width / F.W : 1;
        const rng2 = document.createRange(); rng2.selectNodeContents(el);
        const b = rng2.getBoundingClientRect();
        if (b.height > 4) { bottom = (b.bottom - rr.top) / k; right = (b.right - rr.left) / k; }
      }
    } catch (e) { /* keep defaults */ }
    return (headCache[key] = { bottom, right });
  }
  // The drawing area of a scene: its box, lifted up toward the headline when the headline is short.
  function areaOf(F, id, box) {
    const m = headMetrics(F, id), u = F.u;
    const top = clamp(Math.max(m.bottom + 26 * u, box.y - 170 * u), box.y - 170 * u, box.y);
    return { x: box.x, y: top, w: box.w, h: box.y + box.h - top, headBottom: m.bottom };
  }

  function makeFrame(ctx, S, info) {
    const { W, H, u } = S, T = S.look.tone;
    const key = `${W}x${H}:${T.paper}:${S.look.texture}`;
    if (!assets || assetKey !== key) { assets = buildAssets({ W, H, u, T, S }); assetKey = key; }
    const P = platesFor(W, H);
    const shown = planOf();
    const F = {
      S, W, H, u, tall: S.tall, wide: S.wide, T, info, t: info.t, local: info.local, ink: S.look.ink, acc: S.accent, A: assets,
      K: P.kg, R: P.rg, P, shown, id: info.scene, tr: null, prev: null,
    };
    if (shown && info.index > 0 && shown[info.index - 1]) F.prev = shown[info.index - 1];
    if (F.prev && info.scene && info.local < info.change) {
      const ex = clamp(info.local / Math.max(0.01, info.change));
      F.tr = { ex, x: eio(ex) * (W + 220 * u) - 110 * u };
    }
    return F;
  }
  // Draw into both plates, clipped to one side of the incoming sheet's edge while a new sheet is being fed in.
  function sided(F, old, fn) {
    if (!F.tr) { if (!old) fn(); return; }
    for (const g of [F.K, F.R]) {
      g.save(); g.beginPath();
      if (old) g.rect(F.tr.x, 0, F.W - F.tr.x + 2, F.H); else g.rect(-2, 0, F.tr.x + 2, F.H);
      g.clip();
    }
    fn();
    F.K.restore(); F.R.restore();
  }

  // ---- primitives ----------------------------------------------------------------------------------
  function rrPath(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  const ellPath = (g, cx, cy, rx, ry, rot = 0) => { g.beginPath(); g.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU); };
  function polyPath(g, pts, close = true) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); if (close) g.closePath(); }
  // Cut a shape out of both plates (what lies beneath an opaque object is cleared first).
  function knock(F, build, plates = "KR") {
    for (const k of plates) {
      const g = k === "K" ? F.K : F.R;
      g.save(); g.globalCompositeOperation = "destination-out"; g.fillStyle = "#000"; g.beginPath(); build(g); g.fill(); g.restore();
    }
  }
  function knockLines(g, a, w, build) { g.save(); g.globalCompositeOperation = "destination-out"; g.strokeStyle = `rgba(0,0,0,${a})`; g.lineWidth = w; g.lineCap = "round"; build(g); g.stroke(); g.restore(); }
  const pen = (g, color, w, dash) => { g.strokeStyle = color; g.lineWidth = w; g.setLineDash(dash || []); g.lineCap = "round"; g.lineJoin = "round"; };
  const fillCol = (g, color) => { g.fillStyle = color; g.fill(); };

  // Lettering: any of the shop's faces, with letter-by-letter setting (q) and optional knock-out (cut).
  function say(g, s, x, y, size, face, color, o = {}) {
    s = String(s ?? "");
    if (o.upper) s = s.toUpperCase();
    const q = o.q ?? 1;
    if (!s || q <= 0) return 0;
    const weight = o.weight || (face === "head" ? 400 : face === "fat" ? 800 : 700);
    const fnt = (sz) => `${o.italic ? "italic " : ""}${weight} ${sz}px ${FONT[face]}`;
    g.save();
    g.font = fnt(size); g.letterSpacing = (o.track ?? 0) * size + "px";
    let w = g.measureText(s).width;
    if (o.maxW && w > o.maxW) { size = Math.max(o.min || size * 0.6, (size * o.maxW) / w); g.font = fnt(size); g.letterSpacing = (o.track ?? 0) * size + "px"; w = g.measureText(s).width; }
    g.translate(x, y); if (o.rot) g.rotate(o.rot);
    if (o.scale && o.scale !== 1) g.scale(o.scale, o.scale);
    if (o.cut) g.globalCompositeOperation = "destination-out";
    if (o.alpha != null) g.globalAlpha *= o.alpha;
    g.textAlign = "left"; g.textBaseline = o.base || "alphabetic"; g.fillStyle = color;
    const x0 = o.align === "center" ? -w / 2 : o.align === "right" ? -w : 0;
    g.fillText(q >= 1 ? s : s.slice(0, Math.ceil(s.length * q)), x0, 0);
    g.restore();
    return w;
  }
  function measure(g, s, size, face, o = {}) {
    const weight = o.weight || (face === "head" ? 400 : face === "fat" ? 800 : 700);
    g.save(); g.font = `${weight} ${size}px ${FONT[face]}`; g.letterSpacing = (o.track ?? 0) * size + "px";
    const w = g.measureText(String(s ?? "")).width; g.restore(); return w;
  }
  // Split a label onto two lines near its middle when it will not fit one.
  function lines(g, s, size, face, maxW, o = {}) {
    s = String(s ?? "");
    if (measure(g, s, size, face, o) <= maxW || !s.includes(" ")) return [s];
    const words = s.split(" ");
    let best = [s, ""], bestGap = 1e9;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
      const gap = Math.abs(measure(g, a, size, face, o) - measure(g, b, size, face, o));
      if (gap < bestGap) { bestGap = gap; best = [a, b]; }
    }
    return best;
  }

  // Printer's ornaments: eight small cast devices.
  function orn(g, kind, x, y, s, color, rot = 0) {
    g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = color; g.strokeStyle = color; g.lineWidth = Math.max(1.4, s * 0.09); g.lineCap = "round"; g.lineJoin = "round";
    const r = s / 2;
    switch (mod(kind, 8)) {
      case 0: polyPath(g, [[0, -r], [r * 0.78, 0], [0, r], [-r * 0.78, 0]]); g.fill(); break;
      case 1: g.beginPath(); g.arc(0, 0, r * 0.82, 0, TAU); g.stroke(); g.beginPath(); g.arc(0, 0, r * 0.3, 0, TAU); g.fill(); break;
      case 2: { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.42 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill(); break; }
      case 3: g.beginPath(); for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; g.moveTo(Math.cos(a) * r, Math.sin(a) * r); g.lineTo(-Math.cos(a) * r, -Math.sin(a) * r); } g.lineWidth = Math.max(2, s * 0.17); g.stroke(); break;
      case 4: for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.beginPath(); g.arc(dx * r * 0.46, dy * r * 0.46, r * 0.5, 0, TAU); g.fill(); } break;
      case 5: polyPath(g, [[-r, -r * 0.7], [0, 0], [-r, r * 0.7]]); g.fill(); polyPath(g, [[r, -r * 0.7], [0, 0], [r, r * 0.7]]); g.fill(); break;
      case 6: g.strokeRect(-r * 0.86, -r * 0.86, r * 1.72, r * 1.72); g.fillRect(-r * 0.36, -r * 0.36, r * 0.72, r * 0.72); break;
      default: g.beginPath(); g.moveTo(0, -r); g.quadraticCurveTo(r * 0.9, 0, 0, r); g.quadraticCurveTo(-r * 0.9, 0, 0, -r); g.fill(); break;
    }
    g.restore();
  }
  // Rays of a burst: n wedges, half of each pitch inked.
  function burst(g, cx, cy, r0, r1, n, rot, color, duty = 0.5) {
    g.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const a = rot + (i * TAU) / n, b = a + (TAU / n) * duty;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.lineTo(cx + Math.cos(b) * r1, cy + Math.sin(b) * r1); g.lineTo(cx + Math.cos(b) * r0, cy + Math.sin(b) * r0); g.closePath(); g.fill();
    }
  }
  // Type set round a circle.
  function ringText(g, s, cx, cy, r, size, rot, color, face = "copper", o = {}) {
    const chars = [...String(s)];
    g.save(); g.font = `${o.weight || 700} ${size}px ${FONT[face]}`; g.letterSpacing = "0px"; g.fillStyle = color; g.textBaseline = "middle"; g.textAlign = "center";
    const widths = chars.map((ch) => g.measureText(ch).width + (o.track || 0) * size), total = widths.reduce((a, b) => a + b, 0);
    // Letters are spaced so the string closes the ring exactly.
    const scale = TAU / (total / r);
    let acc = 0;
    chars.forEach((ch, i) => {
      const mid = acc + widths[i] / 2; acc += widths[i];
      const ang = rot + (mid / r) * scale;
      g.save(); g.translate(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r); g.rotate(ang + Math.PI / 2); g.fillText(ch, 0, 0); g.restore();
    });
    g.restore();
  }
  // Wood grain: wavering hairlines cut out of a block.
  function grain(g, F, x, y, w, h, seed, a = 0.3) {
    const r = rng(seed), n = Math.max(2, Math.floor(h / (10 * F.u)));
    knockLines(g, a, Math.max(1, 1.3 * F.u), (q) => {
      q.beginPath();
      for (let i = 0; i < n; i++) {
        const yy = y + ((i + 0.5) * h) / n + (r() - 0.5) * 3 * F.u, ph = r() * 6, amp = (1 + r() * 2.6) * F.u, x0 = x + r() * w * 0.2, x1 = x + w - r() * w * 0.2;
        q.moveTo(x0, yy);
        for (let k = 1; k <= 6; k++) { const xx = lerp(x0, x1, k / 6); q.lineTo(xx, yy + Math.sin(k * 1.4 + ph) * amp); }
      }
    });
  }
  // A solid inked slab with grain and a bevelled lower edge.
  function slab(g, F, x, y, w, h, color, seed, r = 4) {
    rrPath(g, x, y, w, h, r * F.u); fillCol(g, color);
    g.save(); rrPath(g, x, y, w, h, r * F.u); g.clip(); grain(g, F, x, y, w, h, seed, 0.28); g.restore();
  }
  // Stamp-in: a block lands with a little overshoot and a ring of ink spatter.
  const stampAt = (q) => ({ s: lerp(1.28, 1, ease(q * 1.25)), a: clamp(q * 5) });
  function spatter(g, F, x, y, rad, q, color, n = 9, seed = 5) {
    if (q <= 0 || q >= 1) return;
    const r = rng(seed);
    g.save(); g.fillStyle = color; g.globalAlpha = (1 - q) * 0.9;
    for (let i = 0; i < n; i++) { const a = r() * TAU, d = rad * (0.55 + q * (0.8 + r() * 0.7)), s = (1 + r() * 2.6) * F.u * (1 - q * 0.6); g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, s, 0, TAU); g.fill(); }
    g.restore();
  }
  // A reversed-out label: an inked block with the words knocked out of it.
  function ticket(g, F, cx, cy, text, size, face, color, o = {}) {
    const u = F.u, q = o.q ?? 1;
    if (q <= 0) return { w: 0, h: 0 };
    const st = stampAt(q), maxW = o.maxW || 1e9;
    const ls = lines(g, text, size, face, maxW - 60 * u, { track: o.track ?? 0.02 });
    const lh = size * 1.02, pad = size * 0.4;
    let tw = 0; for (const l of ls) tw = Math.max(tw, measure(g, l, size, face, { track: o.track ?? 0.02 }));
    const w = tw + pad * 2 + 14 * u, h = lh * ls.length + pad * 0.9;
    g.save(); g.globalAlpha *= st.a; g.translate(cx, cy); g.rotate(o.rot || 0); g.scale(st.s, st.s);
    if (o.swallow) { // ribbon with swallow-tail ends
      const nb = h * 0.42;
      polyPath(g, [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2 + nb, 0], [w / 2, h / 2], [-w / 2, h / 2], [-w / 2 - nb, 0]]);
    } else rrPath(g, -w / 2, -h / 2, w, h, 3 * u);
    fillCol(g, color);
    g.save(); g.clip(); grain(g, F, -w / 2 - 60, -h / 2, w + 120, h, o.seed || 3, 0.2); g.restore();
    // hairline rule inside
    pen(g, "#000", 1.6 * u); g.save(); g.globalCompositeOperation = "destination-out"; g.globalAlpha = 0.65; g.strokeRect(-w / 2 + 6 * u, -h / 2 + 6 * u, w - 12 * u, h - 12 * u); g.restore();
    ls.forEach((l, i) => say(g, l, 0, -h / 2 + pad * 0.45 + lh * (i + 0.84), size, face, "#000", { align: "center", cut: true, track: o.track ?? 0.02, upper: o.upper }));
    g.restore();
    return { w, h };
  }
  // A pointing hand, the old printer's manicule: cuff, fist, long index finger and thumb. dir = +1 right, -1 left.
  function manicule(g, F, x, y, s, dir, color, rot = 0) {
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(s * dir, s); g.fillStyle = color;
    rrPath(g, -1.08, -0.3, 0.26, 0.6, 0.04); g.fill();                  // cuff
    rrPath(g, -0.74, -0.26, 0.86, 0.52, 0.13); g.fill();                  // fist
    rrPath(g, 0.02, -0.105, 1.0, 0.17, 0.085); g.fill();                  // index finger
    ellPath(g, -0.24, -0.29, 0.36, 0.115, -0.2); g.fill();                // thumb
    g.globalCompositeOperation = "destination-out";
    g.strokeStyle = "#000"; g.lineWidth = 0.035; g.lineCap = "round";
    g.beginPath();
    g.moveTo(-0.76, -0.3); g.lineTo(-0.76, 0.3);                           // cuff seam
    g.moveTo(-0.6, 0.08); g.lineTo(0.08, 0.08); g.moveTo(-0.6, 0.17); g.lineTo(0.06, 0.17); // finger gaps
    g.moveTo(-0.5, -0.17); g.quadraticCurveTo(-0.1, -0.2, 0.12, -0.07);    // thumb crease
    g.stroke();
    g.restore();
  }

  // ---- composing the pull: starved ink, deboss, register, sheen ----------------------------------
  function tintFrom(F, parts, color) {
    const g = F.P.tg;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.clearRect(0, 0, F.W, F.H);
    for (const [cv, dx, dy] of parts) g.drawImage(cv, dx, dy);
    g.globalCompositeOperation = "source-in"; g.fillStyle = color; g.fillRect(0, 0, F.W, F.H);
    g.restore();
  }
  function finishFrame(ctx, F) {
    const { W, H, u, T, K, R, P, A, t } = F, tex = F.S.look.texture;
    // Ink starves in specks, scratches and thin patches.
    if (tex > 0) {
      for (const [g, pat, ox, oy] of [[R, A.patR, 17, 31], [K, A.patK, 0, 0]]) {
        g.save(); g.setTransform(1, 0, 0, 1, ox, oy); g.globalAlpha = 1; g.globalCompositeOperation = "destination-out"; g.fillStyle = pat; g.fillRect(-ox, -oy, W, H); g.restore();
      }
    }
    // The red plate drifts a hair out of register as the press works.
    const rx = (1.7 + 1.5 * wave(t, 1)) * u, ry = (-1.1 + 1.2 * wave(t, 2)) * u;
    const ph = mod(t, 2.6) / 2.6, sq = ph < 0.1 ? Math.sin((ph / 0.1) * Math.PI) : 0;
    const d = (1.5 + sq * 1.7) * u;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    // Stock.
    const solid = Boolean(F.S.paint);
    if (solid) {
      ctx.drawImage(A.paper, 0, 0);
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
      vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, `${T.vig}${T.vigA * Math.max(0.2, F.S.look.texture)})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    }
    // Deboss: a pale lip on the far edge of every inked shape and a shadow on the near one.
    const both = [[P.R, rx, ry], [P.K, 0, 0]];
    tintFrom(F, both, T.rim); ctx.drawImage(P.T, d, d);
    tintFrom(F, both, T.shade); ctx.drawImage(P.T, -d * 0.8, -d * 0.8);
    // Ink.
    ctx.globalCompositeOperation = T.mult && solid ? "multiply" : "source-over";
    ctx.drawImage(P.R, rx, ry); ctx.drawImage(P.K, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    // Wet sheen: a soft diagonal band of light that keeps crossing the inked areas.
    {
      const k = mod(t / 4.4, 1), bx = lerp(-0.25 * W, 1.25 * W, k), bw = 0.13 * W, th = 0.38, dx = Math.cos(th), dy = Math.sin(th);
      tintFrom(F, both, "#fff");
      const tg = P.tg; tg.save(); tg.globalCompositeOperation = "destination-in";
      const gr = tg.createLinearGradient(bx - dx * bw, H / 2 - dy * bw, bx + dx * bw, H / 2 + dy * bw);
      gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.5, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
      tg.fillStyle = gr; tg.fillRect(0, 0, W, H); tg.restore();
      ctx.globalAlpha = T.gloss; ctx.drawImage(P.T, 0, 0); ctx.globalAlpha = 1;
    }
    // A new sheet is being fed in: its edge, the gripper bar and the shadow it casts on the old sheet.
    if (F.tr) {
      const x = F.tr.x, sw = 120 * u;
      const sg = ctx.createLinearGradient(x, 0, x + sw, 0);
      sg.addColorStop(0, `${T.vig}0.34)`); sg.addColorStop(1, `${T.vig}0)`);
      ctx.fillStyle = sg; ctx.fillRect(x, 0, sw, H);
      const lg = ctx.createLinearGradient(x - 26 * u, 0, x, 0);
      lg.addColorStop(0, "rgba(255,255,255,0)"); lg.addColorStop(1, `rgba(255,255,255,${T.mult ? 0.18 : 0.06})`);
      ctx.fillStyle = lg; ctx.fillRect(x - 26 * u, 0, 26 * u, H);
      // gripper bar with its row of fingers
      const gw = 14 * u;
      ctx.fillStyle = F.ink; ctx.fillRect(x - gw, 0, gw, H);
      ctx.fillStyle = T.paper;
      for (let y = 12 * u; y < H; y += 46 * u) ctx.fillRect(x - gw * 0.72, y, gw * 0.44, 20 * u);
      ctx.fillStyle = "rgba(255,255,255,0.28)"; ctx.fillRect(x - 3 * u, 0, 2 * u, H);
    }
    ctx.restore();
  }

  // ---- the stage: frame furniture, ghost type, lint ------------------------------------------------
  function band(F, x0, y0, x1, y1, vertical, dir, tt) {
    const { u, K, R, ink, acc } = F, pitch = 50 * u, len = vertical ? y1 - y0 : x1 - x0, size = 29 * u;
    const s = tt * dir * 60 * u, k = Math.floor(s / pitch), frac = s - k * pitch;
    K.save(); K.beginPath(); K.rect(x0, y0, x1 - x0, y1 - y0); K.clip();
    R.save(); R.beginPath(); R.rect(x0, y0, x1 - x0, y1 - y0); R.clip();
    const n = Math.ceil(len / pitch) + 2;
    for (let i = 0; i < n; i++) {
      const pos = frac + (i - 1) * pitch + pitch / 2, idx = i - 1 - k;
      const x = vertical ? (x0 + x1) / 2 : x0 + pos, y = vertical ? y0 + pos : (y0 + y1) / 2;
      const red = mod(idx, 5) === 0;
      orn(red ? R : K, red ? 2 : idx * 3 + 1, x, y, size * (red ? 1.12 : 1), red ? acc : ink, red ? tt * 0.9 + idx : 0);
    }
    K.restore(); R.restore();
  }
  function furniture(F) {
    const { W, H, u, K, R, ink, acc } = F, tt = F.t;
    const o1 = 22 * u, o2 = 30 * u, b0 = 34 * u, b1 = 74 * u, i1 = 79 * u, i2 = 86 * u;
    pen(K, ink, 7.5 * u); K.strokeRect(o1, o1, W - 2 * o1, H - 2 * o1);
    pen(K, ink, 2 * u); K.strokeRect(o2, o2, W - 2 * o2, H - 2 * o2);
    pen(K, ink, 2.4 * u); K.strokeRect(i1, i1, W - 2 * i1, H - 2 * i1);
    pen(K, ink, 6 * u); K.strokeRect(i2, i2, W - 2 * i2, H - 2 * i2);
    band(F, b1 + 4 * u, b0, W - b1 - 4 * u, b1, false, 1, tt);
    band(F, b1 + 4 * u, H - b1, W - b1 - 4 * u, H - b0, false, -1, tt);
    band(F, b0, b1 + 4 * u, b1, H - b1 - 4 * u, true, -1, tt);
    band(F, W - b1, b1 + 4 * u, W - b0, H - b1 - 4 * u, true, 1, tt);
    // Registration targets in the corners, slowly turning.
    [[b0, b0], [W - b1, b0], [b0, H - b1], [W - b1, H - b1]].forEach(([x, y], i) => {
      const cx = x + 20 * u, cy = y + 20 * u;
      K.save(); K.translate(cx, cy); K.rotate(tt * 0.6 * (i % 2 ? -1 : 1) + i);
      pen(K, ink, 2.6 * u); K.beginPath(); K.arc(0, 0, 13 * u, 0, TAU); K.moveTo(-20 * u, 0); K.lineTo(20 * u, 0); K.moveTo(0, -20 * u); K.lineTo(0, 20 * u); K.stroke();
      K.restore();
      R.fillStyle = acc; R.beginPath(); R.arc(cx, cy, 4.2 * u, 0, TAU); R.fill();
    });
    // Lint and paper dust drifting over the form.
    for (let i = 0; i < 22; i++) {
      const sp = (7 + hash(i * 7 + 3) * 16) * u;
      const x = mod(hash(i * 3 + 1) * W + tt * sp, W + 120 * u) - 60 * u, y = hash(i * 5 + 2) * H + Math.sin(tt * (0.7 + hash(i)) + i) * 16 * u;
      const rot = tt * (0.4 + hash(i * 11)) * (i % 2 ? 1 : -1) + i, len = (9 + hash(i * 13) * 12) * u;
      K.save(); K.translate(x, y); K.rotate(rot); pen(K, ink, 1.3 * u); K.globalAlpha = 0.5;
      K.beginPath(); K.moveTo(-len / 2, 0); K.quadraticCurveTo(0, -len * 0.45, len / 2, len * 0.1); K.stroke(); K.restore();
    }
  }
  const GHOST = { title: "A", chart: "#", object: "&", people: "¶", process: "§", compare: "=", closing: "&" };
  function ghost(F, id, tt) {
    const { W, H, K, ink } = F;
    const size = F.tall ? W * 1.05 : H * 0.95, idx = ORDER.indexOf(id);
    K.save(); K.globalAlpha = F.T.ghost;
    K.translate(W * (0.64 + 0.035 * Math.sin(tt * 0.35 + idx)), H * 0.5 + 0.02 * H * Math.sin(tt * 0.27 + idx)); K.rotate(Math.sin(tt * 0.21 + idx) * 0.045 - 0.04);
    say(K, GHOST[id] || "A", 0, size * 0.33, size, "fat", ink, { align: "center", weight: 800 });
    K.restore();
  }
  function zones(F) {
    const { H, u, tall } = F;
    const half = tall ? Math.min(H * 0.26, 420 * u) : Math.min(H * 0.3, 215 * u);
    return { top: { y0: 102 * u, y1: H / 2 - half }, bot: { y0: H / 2 + half, y1: H - 102 * u } };
  }
  const LETTERS = "AEGMRSTOWKBNHDPLCFUY&";
  function titleArt(F, tt) {
    const { W, H, u, K, R, ink, acc } = F, Z = zones(F);
    const top = Z.top, hzT = top.y1 - top.y0;
    if (hzT > 100 * u) {
      const cy = (top.y0 + top.y1) / 2, cx = W / 2, q = ease(tt / 0.8);
      // flourish rules: a thick and a thin line either side of the masthead
      const rl = (W - 280 * u) / 2;
      for (const sgn of [-1, 1]) for (const [dy, w] of [[0.47, 5], [0.425, 2]]) {
        const y = cy + sgn * hzT * dy;
        pen(K, ink, w * u); K.beginPath(); K.moveTo(cx - rl * q, y); K.lineTo(cx + rl * q, y); K.stroke();
      }
      const rw = Math.min(W * 0.5, 900 * u), rh = Math.min(hzT * 0.4, 96 * u), flap = Math.sin(tt * 2.1) * 0.05;
      // tails
      for (const s of [-1, 1]) {
        K.save(); K.translate(cx + s * rw / 2, cy); K.transform(1, s * flap, 0, 1, 0, 0);
        knock(F, (g) => polyPath(g, [[s * -rh * 0.2, -rh * 0.1], [s * rh * 1.15, -rh * 0.1], [s * rh * 0.8, rh * 0.38], [s * rh * 1.15, rh * 0.86], [s * -rh * 0.2, rh * 0.86]]));
        R.save(); R.translate(cx + s * rw / 2, cy); R.transform(1, s * flap, 0, 1, 0, 0);
        polyPath(R, [[s * -rh * 0.2, -rh * 0.1], [s * rh * 1.15, -rh * 0.1], [s * rh * 0.8, rh * 0.38], [s * rh * 1.15, rh * 0.86], [s * -rh * 0.2, rh * 0.86]]); fillCol(R, acc);
        R.restore(); K.restore();
      }
      const main = Math.min(1, q * 1.4);
      if (main > 0) {
        knock(F, (g) => g.rect(cx - rw / 2 * main, cy - rh / 2, rw * main, rh));
        K.save(); K.beginPath(); K.rect(cx - rw / 2 * main, cy - rh / 2, rw * main, rh); K.clip();
        K.fillStyle = ink; K.fillRect(cx - rw / 2, cy - rh / 2, rw, rh); grain(K, F, cx - rw / 2, cy - rh / 2, rw, rh, 21, 0.22);
        say(K, "SET · INKED · PRINTED", cx, cy + rh * 0.17, rh * 0.5, "copper", "#000", { align: "center", cut: true, track: 0.12, maxW: rw * 0.9, min: 24 * u });
        K.restore();
      }
      // medallions
      const mr = Math.min(hzT * 0.36, 84 * u);
      for (const s of [-1, 1]) {
        const mx = cx + s * (rw / 2 + rh * 1.15 + mr + 40 * u);
        if (mx - mr < 120 * u || mx + mr > W - 120 * u) continue;
        const sc = back(span(tt, 0.1 + (s > 0 ? 0.12 : 0), 0.8));
        knock(F, (g) => { g.beginPath(); g.arc(mx, cy, mr * 1.05 * sc, 0, TAU); });
        K.save(); K.translate(mx, cy); K.scale(sc, sc);
        burst(K, 0, 0, mr * 0.58, mr, 16, tt * 0.5 * s, ink, 0.5);
        pen(K, ink, 4 * u); K.beginPath(); K.arc(0, 0, mr * 0.5, 0, TAU); K.stroke();
        K.restore();
        R.save(); R.translate(mx, cy); R.scale(sc, sc); orn(R, 2, 0, 0, mr * 0.78, acc, -tt * 0.8 * s); R.restore();
      }
    }
    const bot = Z.bot, hzB = bot.y1 - bot.y0;
    if (hzB > 110 * u) {
      const x0 = 132 * u, x1 = W - 132 * u, y1 = bot.y1, rows = clamp(Math.round(hzB / (112 * u)), 1, 4), rh = (hzB - 8 * u) / rows;
      for (let r = 0; r < rows; r++) {
        const cols = Math.max(4, Math.floor((x1 - x0) / ((F.tall ? 150 : 158) * u)));
        const wts = []; let sum = 0;
        for (let i = 0; i < cols; i++) { const w = 0.72 + hash(r * 17 + i * 5) * 0.7; wts.push(w); sum += w; }
        let x = x0;
        const y = y1 - (rows - r) * rh;
        for (let i = 0; i < cols; i++) {
          const w = ((x1 - x0) * wts[i]) / sum, cw = w - 8 * u, ch = rh - 8 * u;
          const letter = LETTERS[(r * 7 + i * 3) % LETTERS.length], face = FACES[(r + i) % 5];
          const bump = Math.pow(Math.max(0, Math.sin(tt * 2.1 - (i + r * 0.8) * 0.5)), 4);
          const hot = bump > 0.6;
          const st = stampAt(clamp(tt * 2.4 - i * 0.05 - r * 0.1));
          K.save(); pen(K, ink, 3.4 * u); K.globalAlpha = st.a; rrPath(K, x + 4 * u, y + 4 * u, cw, ch, 5 * u); K.stroke();
          // wooden floor of the compartment: a slim hatching down one side
          K.save(); rrPath(K, x + 4 * u, y + 4 * u, cw, ch, 5 * u); K.clip(); pen(K, ink, 1.4 * u); K.globalAlpha *= 0.3; K.beginPath();
          for (let k = -ch; k < cw; k += 11 * u) { K.moveTo(x + 4 * u + k, y + 4 * u + ch); K.lineTo(x + 4 * u + k + ch, y + 4 * u); } K.stroke(); K.restore();
          K.restore();
          const g = hot ? R : K, sz = Math.min(ch * 0.82, cw * 1.05) * (1 + 0.16 * bump);
          knock(F, (q) => rrPath(q, x + cw / 2 - sz * 0.28, y + 4 * u + ch / 2 - sz * 0.34, sz * 0.56, sz * 0.68, 4 * u));
          g.save(); g.globalAlpha = st.a;
          say(g, letter, x + 4 * u + cw / 2, y + 4 * u + ch / 2 + sz * 0.34 - bump * 6 * u, sz, face, hot ? acc : ink, { align: "center", scale: st.s });
          g.restore();
          x += w;
        }
      }
    }
  }
  function closingArt(F, tt) {
    const { W, H, u, K, R, ink, acc } = F, Z = zones(F);
    const top = Z.top, hzT = top.y1 - top.y0;
    if (hzT > 100 * u) {
      const cy = (top.y0 + top.y1) / 2, cx = W / 2, rad = Math.min(hzT * 0.46, F.tall ? W * 0.24 : 120 * u);
      const q = clamp(tt / 0.55), st = stampAt(q);
      // rays behind the seal turn all through the hold
      K.save(); K.beginPath(); K.rect(110 * u, 100 * u, W - 220 * u, H - 200 * u); K.clip(); K.globalAlpha = 0.22;
      burst(K, cx, cy, rad * 1.3, Math.hypot(W, H), 28, tt * 0.12, ink, 0.45); K.restore();
      knock(F, (g) => { g.beginPath(); g.arc(cx, cy, rad * 1.26 * st.s, 0, TAU); });
      R.save(); R.globalAlpha = st.a; R.translate(cx, cy); R.scale(st.s, st.s);
      pen(R, acc, 7 * u); R.beginPath(); R.arc(0, 0, rad, 0, TAU); R.stroke();
      pen(R, acc, 2.4 * u); R.beginPath(); R.arc(0, 0, rad * 0.62, 0, TAU); R.stroke(); R.beginPath(); R.arc(0, 0, rad * 0.88, 0, TAU); R.stroke();
      ringText(R, "· PRINTED · FINE IMPRESSION · PULLED BY HAND ", 0, 0, rad * 0.75, rad * 0.17, tt * 0.28 - 1.2, acc, "copper", { track: 0.04 });
      orn(R, 2, 0, 0, rad * 0.78, acc, -tt * 0.35);
      R.restore();
      spatter(R, F, cx, cy, rad, span(tt, 0.35, 0.85), acc, 14, 9);
      // pointing hands bob toward the seal
      for (const s of [-1, 1]) {
        const mx = cx + s * (rad * 1.55 + 40 * u + 60 * u * (1 - ease(tt / 0.7))), bob = Math.sin(tt * 3.6 + (s > 0 ? 1.4 : 0)) * 11 * u;
        if (mx < 150 * u || mx > W - 150 * u) continue;
        knock(F, (g) => rrPath(g, mx - 90 * u * 1, cy - 28 * u, 180 * u, 56 * u, 6 * u), "K");
        manicule(K, F, mx - s * bob, cy + 4 * u, Math.min(66 * u, hzT * 0.28), -s, ink);
      }
    }
    const bot = Z.bot, hzB = bot.y1 - bot.y0;
    if (hzB > 110 * u) {
      // an outfeed belt carrying freshly pulled sheets away, endlessly
      const by = bot.y1 - 30 * u, sw = Math.min(hzB * 0.5, 150 * u), sh = sw * 1.3, pitch = sw * 2.15, speed = 90 * u;
      pen(K, ink, 9 * u); K.beginPath(); K.moveTo(110 * u, by); K.lineTo(W - 110 * u, by); K.stroke();
      pen(K, ink, 3 * u); K.beginPath(); K.moveTo(110 * u, by + 16 * u); K.lineTo(W - 110 * u, by + 16 * u); K.stroke();
      K.save(); K.beginPath(); K.rect(110 * u, by + 22 * u, W - 220 * u, 30 * u); K.clip();
      for (let x = ((tt * speed) % (26 * u)) - 26 * u; x < W; x += 26 * u) { K.fillStyle = ink; K.beginPath(); K.moveTo(x, by + 28 * u); K.lineTo(x + 14 * u, by + 28 * u); K.lineTo(x + 24 * u, by + 36 * u); K.lineTo(x + 14 * u, by + 44 * u); K.lineTo(x, by + 44 * u); K.lineTo(x + 10 * u, by + 36 * u); K.closePath(); K.fill(); }
      K.restore();
      K.save(); K.beginPath(); K.rect(110 * u, bot.y0 - 20 * u, W - 220 * u, bot.y1 - bot.y0 + 60 * u); K.clip(); R.save(); R.beginPath(); R.rect(110 * u, bot.y0 - 20 * u, W - 220 * u, bot.y1 - bot.y0 + 60 * u); R.clip();
      const s0 = tt * speed, k = Math.floor(s0 / pitch);
      for (let i = -2; i < W / pitch + 3; i++) {
        const x = 110 * u + i * pitch + (s0 - k * pitch) - 0, idx = i - k, y = by - 6 * u;
        const tilt = Math.sin(tt * 1.7 + idx) * 0.03;
        K.save(); K.translate(x + sw / 2, y); K.rotate(tilt);
        knock(F, (g) => rrPath(g, -sw / 2, -sh, sw, sh, 3 * u));
        pen(K, ink, 3.2 * u); K.strokeRect(-sw / 2, -sh, sw, sh);
        const r = rng(300 + mod(idx, 7));
        K.fillStyle = ink; K.fillRect(-sw * 0.38, -sh * 0.88, sw * 0.76, sh * 0.12);
        for (let l = 0; l < 6; l++) K.fillRect(-sw * 0.38, -sh * (0.66 - l * 0.085), sw * (0.5 + r() * 0.26), sh * 0.03);
        K.restore();
        R.save(); R.translate(x + sw / 2, y); R.rotate(tilt); R.fillStyle = acc; R.fillRect(-sw * 0.38, -sh * 0.38, sw * 0.34, sh * 0.26); orn(R, 2, sw * 0.24, -sh * 0.25, sw * 0.28, acc, 0); R.restore();
      }
      K.restore(); R.restore();
    }
  }
  function backdrop(F, id, tt) {
    ghost(F, id, tt);
    if (id === "title") titleArt(F, tt);
    if (id === "closing") closingArt(F, tt);
  }

  // ---- scenes --------------------------------------------------------------------------------------
  const fmt = (v, dec, pre, suf) => window.DreamcutMotion.formatNumber(v, dec, pre, suf);
  const stag = (p, i, n, spread = 0.6) => ease((p - (i / Math.max(1, n)) * spread) / (1 - spread));
  // Ruled stock: faint lines behind a drawing, as on a ledger or a type specimen sheet.
  function ruled(F, A) {
    const { K, ink, u } = F;
    K.save(); K.globalAlpha = 0.1; pen(K, ink, 1.4 * u);
    K.beginPath(); for (let y = A.y + 20 * u; y < A.y + A.h; y += 38 * u) { K.moveTo(A.x, y); K.lineTo(A.x + A.w, y); } K.stroke(); K.restore();
  }

  function chart(F, A, p, d, tt) {
    const { u, K, R, ink, acc } = F;
    const n = d.values.length, max = Math.max(...d.values, 1);
    const slot = A.w / n, bw = Math.min(slot * 0.5, 280 * u), base = A.y + A.h - 74 * u, hmax = Math.max(120 * u, A.h - 236 * u);
    const hot = d.highlight >= 0 && d.highlight < n ? d.highlight : -1;
    ruled(F, A);
    // rays behind the tall bar
    if (hot >= 0) {
      const q = ease(p * 2.5), cx = A.x + slot * (hot + 0.5), cy = base - hmax * 0.5 * (d.values[hot] / max);
      K.save(); K.beginPath(); K.rect(A.x - 40 * u, A.y - 20 * u, A.w + 80 * u, A.h + 20 * u); K.clip();
      R.save(); R.beginPath(); R.rect(A.x - 40 * u, A.y - 20 * u, A.w + 80 * u, A.h + 20 * u); R.clip(); R.globalAlpha = 0.2 * q;
      burst(R, cx, cy, bw * 0.4, hmax * 1.05 * q, 24, tt * 0.22, acc, 0.46); R.restore(); K.restore();
    }
    // gridlines, marching
    K.save(); pen(K, ink, 2 * u, [9 * u, 11 * u]); K.globalAlpha = 0.38; K.lineDashOffset = -tt * 34 * u;
    K.beginPath(); for (let k = 1; k <= 4; k++) { const y = base - (hmax * k) / 4; K.moveTo(A.x, y); K.lineTo(A.x + A.w, y); } K.stroke(); K.restore();
    // skeleton of the form: where each bar will stand
    d.values.forEach((v, i) => {
      const x = A.x + slot * (i + 0.5) - bw / 2, h = hmax * (v / max);
      const g = i === hot ? R : K;
      g.save(); pen(g, i === hot ? acc : ink, 2.2 * u, [8 * u, 8 * u]); g.globalAlpha = 0.6; g.lineDashOffset = tt * 12 * u; g.strokeRect(x, base - h, bw, h); g.restore();
    });
    // bars, stacked from slugs
    d.values.forEach((v, i) => {
      const q = stag(p, i, n, 0.55), x = A.x + slot * (i + 0.5) - bw / 2, h = hmax * (v / max), isHot = i === hot, g = isHot ? R : K;
      const pitch = 29 * u, k = Math.max(1, Math.round(h / pitch)), sh = h / k, vis = q * k;
      for (let j = 0; j < Math.ceil(vis); j++) {
        const part = clamp(vis - j), y = base - (j + 1) * sh, hh = (sh - 6 * u) * part;
        const pulse = 0.5 + 0.5 * Math.sin(tt * 3.4 - j * 0.6 - i * 0.9);
        g.save(); g.globalAlpha = 0.74 + 0.26 * pulse;
        const w = bw * (j % 2 ? 1 : 0.95);
        slab(g, F, x + (bw - w) / 2, y + (sh - 6 * u) - hh + 3 * u, w, hh, isHot ? acc : ink, 10 + i * 31 + j, 3);
        g.restore();
      }
      if (q > 0.04) {
        const top = base - h * Math.min(1, q);
        const size = 110 * u * (isHot ? 1 + 0.035 * Math.sin(tt * 4) : 1);
        say(g, fmt(v * q, 0, d.prefix, d.suffix), x + bw / 2, top - 20 * u, size, "fat", isHot ? acc : ink, { align: "center", maxW: slot * 0.96, min: 70 * u });
      }
    });
    // plank under the bars
    const pq = ease(p * 2.4);
    if (pq > 0) slab(K, F, A.x, base, A.w * pq, 18 * u, ink, 77, 3);
    d.labels.forEach((label, i) => {
      const q = clamp((p - 0.12 - i * 0.07) * 4);
      ticket(i === hot ? R : K, F, A.x + slot * (i + 0.5), base + 56 * u, label || "", 46 * u, FACES[(i + 1) % 5 === 1 ? 0 : (i * 2) % 5], i === hot ? acc : ink, { q, maxW: slot * 0.94, upper: true, seed: 5 + i, swallow: i === hot });
    });
    // a pointing hand picks out the tall bar
    if (hot >= 0) {
      const q = clamp((p - 0.35) * 2.2), gap = slot - bw, s = Math.min(66 * u, gap * 0.34), dir = hot === 0 ? -1 : 1;
      const bx = A.x + slot * (hot + 0.5) + (hot === 0 ? bw / 2 + gap * 0.5 : -bw / 2 - gap * 0.5), by = base - hmax * (d.values[hot] / max) + 70 * u;
      const bob = Math.sin(tt * 4.2) * 12 * u;
      if (q > 0) {
        K.save(); K.globalAlpha = clamp(q * 3);
        knock(F, (g) => rrPath(g, bx - s * 1.2, by - s * 0.4, s * 2.4, s * 0.8, 4 * u), "R");
        manicule(K, F, bx - dir * (bob + (1 - ease(q)) * 80 * u), by, s, dir, ink); K.restore();
      }
    }
  }

  // ---- object: a device drawn like an engraving, with three numbered callouts ----------------------
  function screenUI(F, sx, sy, sw, sh, q, tt, phone) {
    const { u, K, R, ink, acc } = F;
    // title row
    for (let i = 0; i < 3; i++) { K.fillStyle = ink; K.beginPath(); K.arc(sx + sw * 0.07 + i * sw * 0.055, sy + sh * 0.055, Math.max(3, sh * 0.017), 0, TAU); K.fill(); }
    pen(K, ink, 2 * u); K.beginPath(); K.moveTo(sx + sw * 0.3, sy + sh * 0.055); K.lineTo(sx + sw * 0.93, sy + sh * 0.055); K.stroke();
    // preview: a sunrise cut in wood
    const pv = { x: sx + sw * 0.06, y: sy + sh * 0.12, w: sw * 0.88, h: sh * (phone ? 0.38 : 0.43) };
    pen(K, ink, 3.2 * u); K.strokeRect(pv.x, pv.y, pv.w, pv.h);
    K.save(); K.beginPath(); K.rect(pv.x, pv.y, pv.w, pv.h); K.clip();
    R.save(); R.beginPath(); R.rect(pv.x, pv.y, pv.w, pv.h); R.clip();
    const sxc = pv.x + pv.w * 0.66, syc = pv.y + pv.h * 0.62;
    burst(K, sxc, syc, pv.h * 0.22, pv.h * 1.4, 18, tt * 0.5, ink, 0.35);
    R.fillStyle = acc; R.beginPath(); R.arc(sxc, syc, pv.h * 0.2, 0, TAU); R.fill();
    knock(F, (g) => { g.beginPath(); g.arc(sxc, syc, pv.h * 0.2 + 5 * u, 0, TAU); }, "K");
    K.fillStyle = ink; K.beginPath(); K.moveTo(pv.x, pv.y + pv.h); K.lineTo(pv.x, pv.y + pv.h * 0.7); K.quadraticCurveTo(pv.x + pv.w * 0.25, pv.y + pv.h * 0.45, pv.x + pv.w * 0.5, pv.y + pv.h * 0.78); K.quadraticCurveTo(pv.x + pv.w * 0.75, pv.y + pv.h * 0.88, pv.x + pv.w, pv.y + pv.h * 0.74); K.lineTo(pv.x + pv.w, pv.y + pv.h); K.closePath(); K.fill();
    grain(K, F, pv.x, pv.y + pv.h * 0.45, pv.w, pv.h * 0.55, 61, 0.25);
    K.restore(); R.restore();
    // tracks
    const ty0 = sy + sh * 0.6, rowH = sh * 0.088, gap = sh * 0.04;
    const clips = [[0.06, 0.3], [0.4, 0.22], [0.66, 0.28]];
    for (let r = 0; r < 2; r++) clips.forEach(([cx, cw], i) => {
      const c = clamp((q - 0.15 - i * 0.12 - r * 0.06) * 3.2); if (c <= 0) return;
      const x = sx + sw * (cx + r * 0.04), y = ty0 + r * (rowH + gap), w = sw * cw * c, hot = r === 0 && i === 1;
      const g = hot ? R : K;
      rrPath(g, x, y, w, rowH, 4 * u);
      if (hot) { g.fillStyle = acc; g.fill(); } else { g.save(); g.clip(); pen(g, ink, 1.6 * u); g.globalAlpha = 0.6; g.beginPath(); for (let k = -rowH; k < w; k += 9 * u) { g.moveTo(x + k, y + rowH); g.lineTo(x + k + rowH, y); } g.stroke(); g.restore(); pen(g, ink, 2.6 * u); rrPath(g, x, y, w, rowH, 4 * u); g.stroke(); }
    });
    // audio track: bars that keep moving
    const ay = ty0 + 2 * (rowH + gap), nb = Math.floor(sw * 0.88 / (7 * u));
    K.fillStyle = ink;
    for (let i = 0; i < nb; i++) {
      const hh = rowH * (0.18 + 0.82 * Math.abs(Math.sin(i * 0.55 + tt * 3.1) * Math.cos(i * 0.21 - tt * 1.3))) * clamp(q * 2 - 0.6);
      K.fillRect(sx + sw * 0.06 + i * 7 * u, ay + rowH / 2 - hh / 2, 4 * u, hh);
    }
    // playhead
    if (q > 0.5) {
      const px = sx + sw * (0.05 + 0.9 * mod(tt / 3.6, 1));
      R.fillStyle = acc; R.fillRect(px - 1.8 * u, ty0 - sh * 0.04, 3.6 * u, ay + rowH - ty0 + sh * 0.08);
      R.beginPath(); R.moveTo(px - 8 * u, ty0 - sh * 0.04); R.lineTo(px + 8 * u, ty0 - sh * 0.04); R.lineTo(px, ty0 - sh * 0.04 + 12 * u); R.closePath(); R.fill();
    }
    // glare: white lines cut across a corner
    knockLines(K, 0.45, 2 * u, (g) => { g.beginPath(); for (let k = 0; k < 6; k++) { g.moveTo(sx + sw * (0.62 + k * 0.045), sy + 3 * u); g.lineTo(sx + sw * (0.86 + k * 0.045), sy + sh * 0.22); } });
  }

  function object(F, A, p, d, tt) {
    const { u, K, R, ink, acc } = F;
    const phone = d.kind === "phone", wideLayout = A.w > A.h * 1.05 || phone;
    let w, h, x, y;
    if (phone) { h = Math.min(A.h * 0.9, A.w * (F.tall ? 0.7 : 0.4) * 1.9); w = h / 1.9; x = A.x + (wideLayout ? A.w * (F.tall ? 0.27 : 0.27) : A.w / 2) - w / 2; y = A.y + (A.h - h) / 2; }
    else if (wideLayout) { w = Math.min(A.w * 0.56, A.h * 1.12); h = w * 0.62; x = A.x + A.w * 0.02; y = A.y + (A.h - h) / 2 - h * 0.04; }
    else { w = A.w * 0.94; h = w * 0.62; x = A.x + (A.w - w) / 2; y = A.y + A.h * 0.02; }
    const cx = x + w / 2, cy = y + h / 2, sc = ease(p * 3);
    ruled(F, A);
    // two rings of lettering turning behind the device
    K.save(); K.beginPath(); K.rect(A.x - 30 * u, A.y - 20 * u, A.w + 60 * u, A.h + 20 * u); K.clip(); K.globalAlpha = 0.34;
    const rr = Math.min(Math.max(w, h) * 0.66, A.h * 0.58 * (phone ? 1.2 : 1));
    ringText(K, "• SET BY HAND • PULLED BY HAND • INKED TWICE • READ BY A HUMAN ", cx, cy, rr, 36 * u, tt * 0.2, ink, "copper", { track: 0.06 });
    ringText(K, "• ONE SHEET AT A TIME • ONE SHEET AT A TIME • ONE SHEET AT A TIME ", cx, cy, rr * 1.2, 30 * u, -tt * 0.14, ink, "slab", { track: 0.05, weight: 700 });
    K.restore();
    // device body
    const bez = (phone ? 20 : 26) * u, rad = (phone ? 38 : 16) * u;
    K.save(); K.translate(cx, cy); K.scale(0.9 + 0.1 * sc, 0.9 + 0.1 * sc); K.translate(-cx, -cy); K.globalAlpha = clamp(p * 6);
    R.save(); R.translate(cx, cy); R.scale(0.9 + 0.1 * sc, 0.9 + 0.1 * sc); R.translate(-cx, -cy);
    knock(F, (g) => rrPath(g, x - 6 * u, y - 6 * u, w + 12 * u, h + 12 * u, rad));
    slab(K, F, x, y, w, h, ink, 99, rad / u);
    const sx = x + bez, sy = y + bez, sw = w - bez * 2, sh = h - bez * 2;
    knock(F, (g) => rrPath(g, sx, sy, sw, sh, 6 * u));
    pen(K, ink, 2 * u); rrPath(K, sx, sy, sw, sh, 6 * u); K.stroke();
    K.save(); rrPath(K, sx, sy, sw, sh, 6 * u); K.clip(); R.save(); rrPath(R, sx, sy, sw, sh, 6 * u); R.clip();
    screenUI(F, sx, sy, sw, sh, p, tt, phone);
    K.restore(); R.restore();
    if (!phone) {
      const dh = h * 0.07;
      polyPath(K, [[x - w * 0.06, y + h + dh], [x + w * 1.06, y + h + dh], [x + w, y + h + 2 * u], [x, y + h + 2 * u]]); fillCol(K, ink);
      knock(F, (g) => rrPath(g, cx - w * 0.07, y + h + 2 * u, w * 0.14, dh * 0.4, 4 * u), "K");
      // keys: a row that keeps being tapped
      for (let k = 0; k < 14; k++) {
        const press = Math.pow(Math.max(0, Math.sin(tt * 5.3 - k * 1.9)), 8);
        K.fillStyle = ink; K.fillRect(x + w * (0.02 + k * 0.07), y + h + dh + 8 * u + press * 3 * u, w * 0.055, 9 * u);
      }
    } else {
      knock(F, (g) => rrPath(g, cx - w * 0.13, y + 6 * u, w * 0.26, 11 * u, 6 * u), "K");
    }
    K.restore(); R.restore();
    // callouts
    const anchors = [[sx + sw * 0.7, sy + sh * 0.2], [sx + sw * 0.5, sy + sh * 0.64], [sx + sw * 0.22, sy + sh * 0.9]];
    d.callouts.forEach((label, i) => {
      const q = clamp((p - 0.22 - i * 0.13) * 4); if (q <= 0 || !label) return;
      let tx, ty;
      if (wideLayout) { tx = A.x + A.w * (phone ? 0.7 : 0.79); ty = A.y + A.h * (0.16 + i * 0.34); }
      else { tx = A.x + A.w / 2; ty = y + h * 1.16 + 80 * u + i * 128 * u; }
      const [ax, ay] = anchors[i], hotc = i === 1, g = hotc ? R : K, col = hotc ? acc : ink;
      const pulse = 0.5 + 0.5 * Math.sin(tt * 4 + i * 2);
      const maxW = wideLayout ? A.w * (phone ? 0.46 : 0.36) : A.w * 0.8;
      // leader: dotted, marching toward the ticket
      const tw = measure(K, label.toUpperCase(), 46 * u, "head", { track: 0.02 }), half = Math.min(maxW, tw + 90 * u) / 2 + 36 * u;
      const ex = wideLayout ? tx - half : tx, ey = wideLayout ? ty : ty - 44 * u;
      g.save(); pen(g, col, 3 * u, [3 * u, 9 * u]); g.lineDashOffset = -tt * 24 * u; g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax + (ex - ax) * q, ay + (ey - ay) * q); g.stroke(); g.restore();
      g.save(); g.fillStyle = col; g.beginPath(); g.arc(ax, ay, 8 * u, 0, TAU); g.fill(); pen(g, col, 2.4 * u); g.beginPath(); g.arc(ax, ay, (14 + pulse * 8) * u, 0, TAU); g.stroke(); g.restore();
      if (q > 0.7) {
        const tq = clamp((q - 0.7) * 3.3);
        const r = ticket(g, F, tx, ty, label, 46 * u, FACES[(i * 2) % 5 === 0 ? 0 : 3], col, { q: tq, maxW, upper: true, swallow: true, seed: 9 + i });
        // numeral disc at the ticket's end
        const st = stampAt(tq), dx = tx - r.w / 2 - r.h * 0.42 - 54 * u;
        if (tq > 0.05) {
          knock(F, (q2) => { q2.beginPath(); q2.arc(dx, ty, 40 * u * st.s, 0, TAU); });
          g.save(); g.globalAlpha = st.a; g.fillStyle = col; g.beginPath(); g.arc(dx, ty, 38 * u * st.s, 0, TAU); g.fill(); pen(g, col, 3 * u); g.beginPath(); g.arc(dx, ty, 44 * u * st.s, 0, TAU); g.stroke(); g.restore();
          say(g, String(i + 1), dx, ty + 18 * u, 54 * u, "fat", "#000", { align: "center", cut: true, alpha: st.a });
        }
      }
    });
  }

  // ---- people: cameo portraits on a line ------------------------------------------------------------
  function portrait(F, kind, pw, ph, hot, tt, seed, ink, acc) {
    const { u, K, R } = F, col = hot ? acc : ink, g = hot ? R : K, rx = pw / 2, ry = ph / 2;
    knock(F, (q) => ellPath(q, 0, 0, rx + 12 * u, ry + 12 * u));
    // bead frame
    g.fillStyle = col;
    const beads = 30;
    for (let k = 0; k < beads; k++) { const a = (k * TAU) / beads + tt * 0.12; g.beginPath(); g.arc(Math.cos(a) * (rx - 7 * u), Math.sin(a) * (ry - 7 * u), 4.8 * u, 0, TAU); g.fill(); }
    pen(g, col, 4 * u); ellPath(g, 0, 0, rx, ry); g.stroke();
    pen(g, col, 3 * u); ellPath(g, 0, 0, rx - 19 * u, ry - 19 * u); g.stroke();
    const irx = rx - 22 * u, iry = ry - 22 * u;
    g.save(); ellPath(g, 0, 0, irx, iry); g.clip();
    K.save(); ellPath(K, 0, 0, irx, iry); K.clip(); R.save(); ellPath(R, 0, 0, irx, iry); R.clip();
    // background hatching drifts slowly sideways, like a rolled tone
    pen(g, col, 1.5 * u); g.globalAlpha = 0.5; g.beginPath();
    const off = mod(tt * 9 * u, 8 * u);
    for (let y = -iry - 8 * u + off; y < iry + 8 * u; y += 8 * u) { g.moveTo(-irx, y); g.lineTo(irx, y); }
    g.stroke(); g.globalAlpha = 1;
    const hcy = -0.07 * ph, hrx = 0.175 * pw, hry = 0.2 * ph, ys = 0.17 * ph, nw = 0.075 * pw;
    // hair that sits behind the head
    if (kind === 1) { ellPath(g, 0, hcy + 0.05 * ph, hrx * 1.4, hry * 1.28); fillCol(g, col); }
    if (kind === 5) for (let k = 0; k < 9; k++) { const a = Math.PI + (k * Math.PI) / 8; g.beginPath(); g.arc(Math.cos(a) * hrx * 1.12, hcy + Math.sin(a) * hry * 0.95, 0.065 * pw, 0, TAU); g.fillStyle = col; g.fill(); }
    // shoulders
    g.beginPath(); g.moveTo(-0.62 * pw, ry); g.bezierCurveTo(-0.62 * pw, ys + 0.1 * ph, -0.34 * pw, ys, -nw, ys - 0.02 * ph); g.lineTo(nw, ys - 0.02 * ph);
    g.bezierCurveTo(0.34 * pw, ys, 0.62 * pw, ys + 0.1 * ph, 0.62 * pw, ry); g.closePath(); fillCol(g, col);
    knock(F, (q) => polyPath(q, [[-nw * 1.9, ys - 0.025 * ph], [0, ys + 0.15 * ph], [nw * 1.9, ys - 0.025 * ph]]));
    pen(g, col, 3 * u); g.beginPath(); g.moveTo(-nw * 1.9, ys - 0.025 * ph); g.lineTo(0, ys + 0.15 * ph); g.lineTo(nw * 1.9, ys - 0.025 * ph); g.stroke();
    if (kind % 2 === 0) { g.beginPath(); g.moveTo(0, ys + 0.1 * ph); g.lineTo(-nw * 0.5, ys + 0.2 * ph); g.lineTo(0, ys + 0.3 * ph); g.lineTo(nw * 0.5, ys + 0.2 * ph); g.closePath(); g.fillStyle = col; g.fill(); }
    // neck and head
    knock(F, (q) => q.rect(-nw, hcy, nw * 2, ys - hcy));
    pen(g, col, 3 * u); g.beginPath(); g.moveTo(-nw, hcy + hry * 0.8); g.lineTo(-nw, ys - 0.02 * ph); g.moveTo(nw, hcy + hry * 0.8); g.lineTo(nw, ys - 0.02 * ph); g.stroke();
    knock(F, (q) => ellPath(q, 0, hcy, hrx, hry));
    pen(g, col, 3.6 * u); ellPath(g, 0, hcy, hrx, hry); g.stroke();
    g.save(); ellPath(g, 0, hcy, hrx, hry); g.clip(); pen(g, col, 1.6 * u); g.globalAlpha = 0.55; g.beginPath();
    for (let k = -hry; k < hry * 1.2; k += 6.5 * u) { g.moveTo(hrx * 0.35, hcy + k); g.lineTo(hrx * 1.1, hcy + k - hrx * 0.5); } g.stroke(); g.restore();
    // face
    const blink = mod(tt * 0.31 + seed * 0.37, 1) < 0.03 ? 0.15 : 1;
    g.fillStyle = col;
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * hrx * 0.42, hcy - hry * 0.04, 0.019 * pw, Math.max(1.5 * u, 0.026 * pw * blink), 0, 0, TAU); g.fill(); }
    pen(g, col, 2.6 * u); g.beginPath(); g.moveTo(-hrx * 0.62, hcy - hry * 0.26); g.quadraticCurveTo(-hrx * 0.42, hcy - hry * 0.34, -hrx * 0.2, hcy - hry * 0.25); g.moveTo(hrx * 0.62, hcy - hry * 0.26); g.quadraticCurveTo(hrx * 0.42, hcy - hry * 0.34, hrx * 0.2, hcy - hry * 0.25); g.stroke();
    g.beginPath(); g.moveTo(0, hcy - hry * 0.05); g.lineTo(-hrx * 0.1, hcy + hry * 0.24); g.lineTo(hrx * 0.08, hcy + hry * 0.26); g.stroke();
    const smile = 0.5 + 0.5 * Math.sin(tt * 1.3 + seed);
    g.beginPath(); g.moveTo(-hrx * 0.34, hcy + hry * 0.5); g.quadraticCurveTo(0, hcy + hry * (0.7 + 0.12 * smile), hrx * 0.34, hcy + hry * 0.5); g.stroke();
    if (kind === 1 || kind === 3) { pen(g, col, 2.8 * u); for (const s of [-1, 1]) { g.beginPath(); g.arc(s * hrx * 0.42, hcy - hry * 0.04, 0.062 * pw, 0, TAU); g.stroke(); } g.beginPath(); g.moveTo(-hrx * 0.42 + 0.062 * pw, hcy - hry * 0.04); g.lineTo(hrx * 0.42 - 0.062 * pw, hcy - hry * 0.04); g.stroke(); }
    // hair or hat over the head
    g.fillStyle = col;
    if (kind === 0) { // bowler
      g.beginPath(); g.ellipse(0, hcy - hry * 0.78, hrx * 0.82, hry * 0.62, 0, Math.PI, TAU); g.closePath(); g.fill();
      rrPath(g, -hrx * 1.5, hcy - hry * 0.8, hrx * 3, hry * 0.17, 5 * u); g.fill();
      knockLines(g, 1, 2.4 * u, (q) => { q.beginPath(); q.moveTo(-hrx * 0.8, hcy - hry * 0.95); q.lineTo(hrx * 0.8, hcy - hry * 0.95); });
    } else if (kind === 1) { g.beginPath(); g.ellipse(0, hcy - hry * 0.2, hrx * 1.03, hry * 0.86, 0, Math.PI * 1.05, Math.PI * 1.95); g.quadraticCurveTo(hrx * 0.3, hcy - hry * 0.52, -hrx * 0.5, hcy - hry * 0.4); g.closePath(); g.fill(); }
    else if (kind === 2) { g.beginPath(); g.ellipse(0, hcy - hry * 0.05, hrx * 1.02, hry * 1.02, 0, Math.PI * 1.02, Math.PI * 1.98); g.quadraticCurveTo(0, hcy - hry * 0.55, -hrx, hcy - hry * 0.1); g.closePath(); g.fill(); g.beginPath(); g.arc(0, hcy - hry * 1.12, 0.07 * pw, 0, TAU); g.fill(); }
    else if (kind === 3) { g.beginPath(); g.ellipse(0, hcy - hry * 0.1, hrx * 1.04, hry * 1.04, 0, Math.PI * 1.0, Math.PI * 2.0); g.quadraticCurveTo(hrx * 0.2, hcy - hry * 0.72, -hrx * 0.7, hcy - hry * 0.3); g.closePath(); g.fill(); }
    else if (kind === 4) { g.beginPath(); g.ellipse(0, hcy - hry * 0.72, hrx * 0.98, hry * 0.5, 0, Math.PI, TAU); g.closePath(); g.fill(); polyPath(g, [[hrx * 0.1, hcy - hry * 0.78], [hrx * 1.35, hcy - hry * 0.7], [hrx * 1.3, hcy - hry * 0.58], [hrx * 0.05, hcy - hry * 0.6]]); g.fill(); }
    else { g.beginPath(); g.ellipse(0, hcy - hry * 0.3, hrx * 0.95, hry * 0.72, 0, Math.PI * 1.1, Math.PI * 1.9); g.closePath(); g.fill(); }
    K.restore(); R.restore(); g.restore();
  }
  function people(F, A, p, d, tt) {
    const { u, K, R, ink, acc } = F;
    const n = Math.max(2, Math.min(6, Math.round(d.count)));
    const cols = F.tall ? (n <= 2 ? 1 : 2) : n, rows = Math.ceil(n / cols), slot = A.w / cols, rowH = A.h / rows;
    const pw = Math.min(slot * 0.78, (rowH - 190 * u) / 1.22), ph = pw * 1.22, hot = Math.min(n - 1, d.highlight);
    ruled(F, A);
    // dingbats drifting up behind the line
    for (let i = 0; i < 11; i++) {
      const x = A.x + hash(i * 9 + 1) * A.w, y = A.y + A.h - mod(tt * (13 + hash(i * 3) * 18) * u + hash(i * 5) * A.h, A.h + 40 * u) + 20 * u, red = i % 4 === 0;
      (red ? R : K).save(); (red ? R : K).globalAlpha = 0.5; orn(red ? R : K, i * 3, x, y, (20 + hash(i) * 14) * u, red ? acc : ink, tt * 0.8 + i); (red ? R : K).restore();
    }
    for (let r = 0; r < rows; r++) {
      const cordY = A.y + r * rowH + 26 * u, sag = 28 * u, inRow = Math.min(cols, n - r * cols);
      const cordAt = (x) => cordY + sag * Math.sin(((x - A.x) / A.w) * Math.PI);
      const cq = ease(p * 3);
      pen(K, ink, 4.4 * u); K.beginPath();
      for (let k = 0; k <= 24; k++) { const x = A.x - 10 * u + (A.w + 20 * u) * (k / 24) * cq; k ? K.lineTo(x, cordAt(x)) : K.moveTo(x, cordAt(x)); } K.stroke();
      const rowSlot = A.w / inRow;
      for (let c = 0; c < inRow; c++) {
        const i = r * cols + c, px = A.x + rowSlot * (c + 0.5), py = cordAt(px);
        const q = stag(p, i, n, 0.5), isHot = i === hot, str = 74 * u;
        const settle = Math.max(0, tt - 0.12 * i - 0.35);
        const ang = (0.045 + 0.2 * Math.exp(-2.6 * settle)) * Math.sin(tt * (1.55 + 0.11 * i) + i * 1.3 + (settle > 0 ? 0 : 0));
        const drop = -(1 - back(q)) * (A.h * 0.8);
        const ax = (g) => { g.save(); g.translate(px, py + drop); g.rotate(ang); };
        if (isHot && q > 0.02) { // a burst turns behind the lead portrait
          R.save(); R.globalAlpha = 0.34 * q; burst(R, px, py + str + ph / 2, pw * 0.5, Math.min(rowSlot * 0.58, pw * 0.95), 20, tt * 0.3, acc, 0.5); R.restore();
        }
        if (q <= 0) continue;
        ax(K); ax(R);
        pen(K, ink, 3 * u); K.beginPath(); K.moveTo(0, 0); K.lineTo(-pw * 0.22, str); K.moveTo(0, 0); K.lineTo(pw * 0.22, str); K.stroke();
        K.fillStyle = ink; K.beginPath(); K.arc(0, 0, 7 * u, 0, TAU); K.fill();
        K.translate(0, str + ph / 2); R.translate(0, str + ph / 2);
        portrait(F, i % 6, pw, ph, isHot, tt, i + 1, ink, acc);
        const label = d.badges[i % d.badges.length];
        if (label) ticket(isHot ? R : K, F, 0, ph / 2 + 36 * u, label, 46 * u, FACES[(i * 2) % 5 === 0 ? 0 : (i % 2 ? 1 : 3)], isHot ? acc : ink, { q: clamp((q - 0.55) * 3), maxW: rowSlot * 0.92, upper: true, swallow: isHot, seed: 40 + i });
        K.restore(); R.restore();
      }
    }
  }

  // ---- process: a sheet travelling through three stations on a belt ---------------------------------
  function station(F, kind, cx, cy, s, act, tt, hot, qd) {
    const { u, K, R, ink, acc } = F, k = s / 260;
    const lw = (v) => Math.max(1.5, v * k);
    K.save(); K.globalAlpha = clamp(qd * 4); R.save(); R.globalAlpha = clamp(qd * 4);
    if (kind === 0) { // stack of sheets with the top one lifting
      knock(F, (g) => rrPath(g, cx - s * 0.5, cy - s * 0.52, s, s * 1.08, 6 * u));
      slab(K, F, cx - s * 0.46, cy + s * 0.3, s * 0.92, s * 0.14, ink, 5, 3);
      for (let i = 0; i < 6; i++) { const w = s * (0.74 + 0.06 * hash(i + 3)), y = cy + s * 0.28 - i * s * 0.05, o = (hash(i * 3) - 0.5) * s * 0.04; K.fillStyle = ink; K.fillRect(cx - w / 2 + o, y, w, s * 0.036); }
      const lift = act * s * 0.34, tilt = -act * 0.16;
      K.save(); K.translate(cx - s * 0.2, cy + s * 0.0 - lift); K.rotate(tilt);
      knock(F, (g) => g.rect(-s * 0.36, -s * 0.04, s * 0.78, s * 0.07));
      K.fillStyle = ink; K.fillRect(-s * 0.36, -s * 0.04, s * 0.78, s * 0.07); K.restore();
      manicule(K, F, cx + s * 0.1, cy - s * 0.4 + Math.sin(tt * 4.5) * s * 0.04, s * 0.2, 1, ink, Math.PI / 2);
    } else if (kind === 1) { // hand press
      const topY = cy - s * 0.5, bedY = cy + s * 0.34, px = s * 0.36;
      knock(F, (g) => rrPath(g, cx - s * 0.52, topY - s * 0.12, s * 1.04, s * 1.0, 8 * u));
      slab(K, F, cx - px - s * 0.06, topY, s * 0.12, bedY - topY + s * 0.1, ink, 11, 3); slab(K, F, cx + px - s * 0.06, topY, s * 0.12, bedY - topY + s * 0.1, ink, 12, 3);
      slab(K, F, cx - s * 0.5, topY - s * 0.1, s, s * 0.14, ink, 13, 4);
      slab(K, F, cx - s * 0.5, bedY + s * 0.04, s, s * 0.12, ink, 14, 4);
      const py = lerp(topY + s * 0.22, bedY - s * 0.14, act);
      K.fillStyle = ink; K.fillRect(cx - s * 0.04, topY, s * 0.08, py - topY);
      slab(K, F, cx - s * 0.3, py, s * 0.6, s * 0.1, ink, 15, 3);
      R.fillStyle = acc; R.fillRect(cx - s * 0.26, py + s * 0.1, s * 0.52, s * 0.026);
      // wheel on the beam, turning as the platen comes down
      K.save(); K.translate(cx, topY - s * 0.2); K.rotate(act * 5 + tt * 0.6);
      pen(K, ink, lw(10)); K.beginPath(); K.arc(0, 0, s * 0.15, 0, TAU); K.stroke();
      pen(K, ink, lw(7)); K.beginPath(); for (let i = 0; i < 6; i++) { const a = (i * TAU) / 6; K.moveTo(0, 0); K.lineTo(Math.cos(a) * s * 0.26, Math.sin(a) * s * 0.26); } K.stroke();
      K.fillStyle = ink; for (let i = 0; i < 6; i++) { const a = (i * TAU) / 6; K.beginPath(); K.arc(Math.cos(a) * s * 0.26, Math.sin(a) * s * 0.26, s * 0.035, 0, TAU); K.fill(); }
      K.restore();
      // sheet on the bed
      knock(F, (g) => g.rect(cx - s * 0.3, bedY - s * 0.025, s * 0.6, s * 0.065));
      pen(K, ink, lw(5)); K.strokeRect(cx - s * 0.3, bedY - s * 0.025, s * 0.6, s * 0.065);
    } else { // approval stamp
      const sheetY = cy + s * 0.34;
      knock(F, (g) => rrPath(g, cx - s * 0.5, cy - s * 0.54, s, s * 1.0, 6 * u));
      slab(K, F, cx - s * 0.42, sheetY - s * 0.04, s * 0.84, s * 0.12, ink, 21, 3);
      knock(F, (g) => g.rect(cx - s * 0.34, cy - s * 0.2, s * 0.68, s * 0.52), "K");
      pen(K, ink, lw(5)); K.strokeRect(cx - s * 0.34, cy - s * 0.2, s * 0.68, s * 0.52);
      K.fillStyle = ink; for (let l = 0; l < 4; l++) K.fillRect(cx - s * 0.26, cy - s * 0.1 + l * s * 0.1, s * (0.36 + 0.2 * hash(l + 8)), s * 0.03);
      const sy = lerp(cy - s * 0.54, cy - s * 0.22, act);
      slab(K, F, cx - s * 0.2, sy, s * 0.4, s * 0.1, ink, 22, 3);
      K.fillStyle = ink; K.fillRect(cx - s * 0.03, sy - s * 0.2, s * 0.06, s * 0.2); K.beginPath(); K.arc(cx, sy - s * 0.22, s * 0.07, 0, TAU); K.fill();
      const ck = ease(span(act, 0.25, 0.85));
      if (ck > 0) { R.save(); pen(R, acc, lw(26)); R.beginPath(); R.moveTo(cx - s * 0.2, cy + s * 0.08); const a1 = Math.min(1, ck * 2); R.lineTo(cx - s * 0.2 + s * 0.12 * a1, cy + s * 0.08 + s * 0.12 * a1); if (ck > 0.5) { const a2 = (ck - 0.5) * 2; R.lineTo(cx - s * 0.08 + s * 0.3 * a2, cy + s * 0.2 - s * 0.34 * a2); } R.stroke(); R.restore(); }
    }
    K.restore(); R.restore();
  }
  function process(F, A, p, d, tt) {
    const { u, K, R, ink, acc } = F;
    const n = d.steps.length, vertical = A.h > A.w * 1.05;
    ruled(F, A);
    const slotW = vertical ? A.h / n : A.w / n;
    const s = vertical ? Math.min(A.w * 0.42, slotW * 0.72) : Math.min(A.w / n * 0.72, A.h * 0.38);
    const beltY = A.y + A.h * 0.77;
    const P = [];
    for (let i = 0; i < n; i++) {
      if (vertical) P.push([A.x + A.w * 0.27, A.y + slotW * (i + 0.5)]);
      else P.push([A.x + slotW * (i + 0.5), beltY]);
    }
    // the conveyor
    const bq = ease(p * 2.4);
    if (!vertical) {
      slab(K, F, A.x, beltY + s * 0.02, A.w * bq, 20 * u, ink, 31, 4);
      K.save(); K.beginPath(); K.rect(A.x, beltY + 28 * u, A.w * bq, 30 * u); K.clip();
      for (let x = (tt * 80 * u) % (30 * u) - 30 * u; x < A.w; x += 30 * u) { K.fillStyle = ink; K.beginPath(); K.moveTo(A.x + x, beltY + 33 * u); K.lineTo(A.x + x + 15 * u, beltY + 33 * u); K.lineTo(A.x + x + 26 * u, beltY + 43 * u); K.lineTo(A.x + x + 15 * u, beltY + 53 * u); K.lineTo(A.x + x, beltY + 53 * u); K.lineTo(A.x + x + 11 * u, beltY + 43 * u); K.closePath(); K.fill(); }
      K.restore();
    } else {
      const x0 = P[0][0], yA = P[0][1], yB = P[n - 1][1];
      slab(K, F, x0 - 10 * u, yA, 20 * u, (yB - yA) * bq, ink, 31, 4);
      K.save(); K.beginPath(); K.rect(x0 - 38 * u, yA, 76 * u, (yB - yA) * bq); K.clip();
      for (let y = (tt * 80 * u) % (30 * u) - 30 * u; y < yB - yA; y += 30 * u) { K.fillStyle = ink; K.beginPath(); K.moveTo(x0 - 26 * u, yA + y); K.lineTo(x0, yA + y + 12 * u); K.lineTo(x0 + 26 * u, yA + y); K.lineTo(x0 + 26 * u, yA + y + 11 * u); K.lineTo(x0, yA + y + 23 * u); K.lineTo(x0 - 26 * u, yA + y + 11 * u); K.closePath(); K.fill(); }
      K.restore();
    }
    // the sheet's route and position
    const route = (v) => { // v in [0,1] over lead-in, stations, lead-out
      const total = (n + 0.0) * slotW, pos = lerp(-0.45 * slotW, total + 0.45 * slotW - slotW * 0.1, v) + (vertical ? A.y : A.x) ;
      return pos;
    };
    const period = 1.5 * n + 0.8, v = mod(tt / period, 1), pos = route(v);
    const along = (i) => (vertical ? P[i][1] : P[i][0]);
    const acts = P.map((_, i) => Math.pow(clamp(1 - Math.abs(pos - along(i)) / (slotW * 0.42)), 1.3));
    for (let i = 0; i < n; i++) {
      const [cx, cy] = P[i], qd = stag(p, i, n, 0.5);
      if (qd <= 0) continue;
      const kind = n === 1 ? 1 : i === 0 ? 0 : i === n - 1 ? 2 : 1;
      const idle = 0.12 + 0.1 * Math.sin(tt * 1.7 + i * 1.7);
      const act = clamp(Math.max(acts[i], idle));
      const icy = vertical ? cy : cy - s * 0.58;
      station(F, kind, cx, icy, s, act, tt, i === n - 1, qd);
      // numeral disc
      const dx = cx - s * 0.52, dy = icy - s * 0.52, st = stampAt(clamp((qd - 0.2) * 2));
      knock(F, (g) => { g.beginPath(); g.arc(dx, dy, 60 * u * st.s, 0, TAU); });
      const hotn = i === n - 1, g = hotn ? R : K;
      g.save(); g.globalAlpha = st.a; g.fillStyle = hotn ? acc : ink; g.beginPath(); g.arc(dx, dy, 56 * u * st.s, 0, TAU); g.fill();
      say(g, String(i + 1), dx, dy + 36 * u * st.s, 100 * u, "fat", "#000", { align: "center", cut: true, scale: st.s }); g.restore();
      // label
      const lx = vertical ? A.x + A.w * 0.7 : cx, ly = vertical ? cy : beltY + 104 * u;
      ticket(hotn ? R : K, F, lx, ly, d.steps[i], 48 * u, FACES[i % 2 ? 3 : 0], hotn ? acc : ink, { q: clamp((qd - 0.4) * 2.4), maxW: vertical ? A.w * 0.5 : slotW * 0.94, upper: true, swallow: hotn, seed: 70 + i });
    }
    // the sheet itself, riding the belt and taking ink as it passes the press
    const sw = 64 * u, sh = 84 * u, inkQ = clamp((pos - along(Math.min(1, n - 1))) / (slotW * 0.5) + 0.5), doneQ = n > 2 ? clamp((pos - along(n - 1)) / (slotW * 0.3) + 0.3) : 0;
    if (p > 0.5 && v > 0.01 && v < 0.99) {
      const sx = vertical ? P[0][0] : pos, sy = vertical ? pos : beltY - 6 * u, bob = Math.sin(tt * 9) * 2 * u;
      K.save(); K.translate(sx, sy - (vertical ? 0 : sh / 2 + 4 * u) + bob); K.rotate(Math.sin(tt * 3) * 0.04);
      knock(F, (g) => rrPath(g, -sw / 2 - 4 * u, -sh / 2 - 4 * u, sw + 8 * u, sh + 8 * u, 4 * u));
      pen(K, ink, 3.2 * u); K.strokeRect(-sw / 2, -sh / 2, sw, sh);
      K.fillStyle = ink; for (let l = 0; l < 5; l++) K.fillRect(-sw * 0.36, -sh * 0.34 + l * sh * 0.14, sw * 0.72 * (inkQ > l / 5 ? 1 : 0), sh * 0.045);
      K.restore();
      if (doneQ > 0.2) { R.save(); R.translate(sx, sy - (vertical ? 0 : sh / 2 + 4 * u) + bob); orn(R, 2, sw * 0.18, sh * 0.2, sw * 0.5, acc, tt); R.restore(); }
    }
    // motes drifting up from the work
    for (let i = 0; i < 9; i++) {
      const x = A.x + hash(i * 7) * A.w, y = A.y + A.h * 0.62 - mod(tt * (18 + hash(i) * 22) * u + hash(i * 3) * 300 * u, 330 * u);
      K.save(); K.globalAlpha = 0.5; orn(K, i + 2, x, y, 18 * u, ink, tt + i); K.restore();
    }
  }

  // ---- compare: a pair of scales ---------------------------------------------------------------------
  function compare(F, A, p, d, tt) {
    const { u, K, R, ink, acc } = F;
    const L = Math.max(0, d.leftValue), Rv = Math.max(0, d.rightValue), mx = Math.max(L, Rv, 1);
    const cx = A.x + A.w / 2, beamY = A.y + 0.17 * A.h, bh = Math.min(A.w * (F.tall ? 0.3 : 0.4), A.h * 0.62);
    const settle = Math.max(0, tt - 0.5), thT = -0.2 * ((L - Rv) / mx);
    const th = thT * (1 - Math.exp(-3 * settle) * Math.cos(7 * settle)) + (settle > 0 ? 0.012 * Math.sin(tt * 1.8) : 0);
    ruled(F, A);
    // stand
    const baseY = A.y + A.h * 0.97, pq = ease(p * 3);
    slab(K, F, cx - 14 * u, beamY, 28 * u, (baseY - beamY) * pq, ink, 41, 3);
    polyPath(K, [[cx - bh * 0.34, baseY], [cx + bh * 0.34, baseY], [cx + bh * 0.22, baseY - 34 * u], [cx - bh * 0.22, baseY - 34 * u]]); fillCol(K, ink);
    K.save(); polyPath(K, [[cx - bh * 0.34, baseY], [cx + bh * 0.34, baseY], [cx + bh * 0.22, baseY - 34 * u], [cx - bh * 0.22, baseY - 34 * u]]); K.clip(); grain(K, F, cx - bh * 0.34, baseY - 34 * u, bh * 0.68, 34 * u, 43, 0.3); K.restore();
    knock(F, (g) => { for (const s of [-1, 1]) { g.rect(cx + s * bh * 0.28 - 9 * u, baseY - 26 * u, 18 * u, 18 * u); } }, "K");
    for (const s of [-1, 1]) { K.save(); pen(K, ink, 2.6 * u); K.strokeRect(cx + s * bh * 0.28 - 9 * u, baseY - 26 * u, 18 * u, 18 * u); K.restore(); }
    // beam
    K.save(); K.translate(cx, beamY); K.rotate(th);
    knock(F, (g) => rrPath(g, -bh - 24 * u, -18 * u, bh * 2 + 48 * u, 36 * u, 12 * u));
    slab(K, F, -bh, -11 * u, bh * 2, 22 * u, ink, 45, 10);
    for (const s of [-1, 1]) { K.fillStyle = ink; K.beginPath(); K.arc(s * bh, 0, 17 * u, 0, TAU); K.fill(); knock(F, (g) => { g.beginPath(); g.arc(s * bh, 0, 7 * u, 0, TAU); }); }
    K.restore();
    knock(F, (g) => { g.beginPath(); g.arc(cx, beamY, 34 * u, 0, TAU); });
    K.fillStyle = ink; K.beginPath(); K.arc(cx, beamY, 30 * u, 0, TAU); K.fill();
    K.save(); K.translate(cx, beamY); K.rotate(tt * 0.8); R.save(); R.translate(cx, beamY); R.rotate(-tt * 0.8); orn(R, 2, 0, 0, 40 * u, acc, 0); R.restore(); K.restore();
    orn(R, 7, cx, beamY - 60 * u, 40 * u, acc, Math.sin(tt * 1.2) * 0.15);
    // pans
    const sides = [{ s: -1, v: L, label: d.left, g: K, col: ink }, { s: 1, v: Rv, label: d.right, g: R, col: acc }];
    sides.forEach((S, i) => {
      const ex = cx + S.s * bh * Math.cos(th), ey = beamY + S.s * bh * Math.sin(th);
      const q = stag(p, i, 2, 0.4), g = S.g, hang = 0.2 * A.h, panW = Math.min(bh * 0.78, 260 * u), py = ey + hang, bowlH = 0.065 * A.h;
      const sway = 0.02 * Math.sin(tt * 2.3 + i * 2.1);
      K.save(); K.translate(ex, ey); K.rotate(sway); K.translate(-ex, -ey); R.save(); R.translate(ex, ey); R.rotate(sway); R.translate(-ex, -ey);
      // chains
      pen(g, S.col, 3.2 * u, [7 * u, 5 * u]);
      g.beginPath(); for (const o of [-0.46, 0, 0.46]) { g.moveTo(ex, ey); g.lineTo(ex + o * panW, py); } g.stroke();
      // bowl
      knock(F, (kg) => { kg.beginPath(); kg.ellipse(ex, py, panW / 2 + 8 * u, bowlH + 8 * u, 0, 0, Math.PI); kg.closePath(); });
      g.beginPath(); g.ellipse(ex, py, panW / 2, bowlH, 0, 0, Math.PI); g.closePath(); g.fillStyle = S.col; g.fill();
      pen(g, S.col, 5 * u); g.beginPath(); g.moveTo(ex - panW / 2 - 6 * u, py); g.lineTo(ex + panW / 2 + 6 * u, py); g.stroke();
      // weights dropping onto the pan
      const cnt = clamp(Math.round((S.v / mx) * 7), 1, 8);
      for (let j = 0; j < cnt; j++) {
        const wq = clamp((p - 0.18 - j * 0.07) * 4); if (wq <= 0) continue;
        const bw = panW * (0.46 - j * 0.012), yy = py - (j + 1) * 25 * u - (1 - back(wq)) * 140 * u;
        g.save(); g.globalAlpha = clamp(wq * 5);
        slab(g, F, ex - bw / 2, yy, bw, 22 * u, S.col, 90 + i * 9 + j, 3);
        g.restore();
      }
      // plaque: figure and label
      const nq = clamp((p - 0.3) * 2), st = stampAt(nq);
      if (nq > 0) {
        say(g, fmt(S.v * ease(nq), 0, d.prefix, d.suffix), ex, py + bowlH + 140 * u, 150 * u, "fat", S.col, { align: "center", maxW: bh * 1.2, min: 90 * u, scale: st.s, alpha: st.a });
        ticket(g, F, ex, py + bowlH + 198 * u, S.label || "", 48 * u, i ? "cond" : "head", S.col, { q: clamp((nq - 0.4) * 2), maxW: bh * 1.3, upper: true, swallow: i === 1, seed: 120 + i });
      }
      K.restore(); R.restore();
    });
  }

  const DRAW = { chart, object, people, process, compare };
  const scene = (id) => (ctx, S, box, p, d, info) => {
    const F = frame;
    if (!F) return;
    const old = info.exit !== undefined;
    const A = areaOf(F, id, box);
    sided(F, old, () => DRAW[id](F, A, old ? 1 : clamp(p * 1.5), d, info.local, old));
    if (!old) finishFrame(ctx, F);
  };

  // Headline type: ink that took unevenly, with the red plate a little out of register.
  const holes = (tex) => {
    const thr = 0.68 + (1 - tex) * 0.3;
    return "url(\"data:image/svg+xml," + encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' width='420' height='420'><filter id='n' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.62' numOctaves='2' seed='7' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -12 0 0 0 " + (12 * (thr + 0.06)).toFixed(2) + "'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>",
    ) + "\")";
  };
  const shadowOn = (rim) => (accent) => `3px 2px 0 ${hexA(accent, 0.4)}, 0 1.5px 0 ${rim}`;

  const TONE = {
    paper: "#efe3c6", fibre: "112,86,48", mult: true, rim: "rgba(255,251,236,0.8)", shade: "rgba(70,48,22,0.45)",
    vig: "rgba(88,58,22,", vigA: 0.34, gloss: 0.24, ghost: 0.07,
  };

  return {
    bg: "#efe3c6", panel: "rgba(27,23,18,0.05)", ink: "#1b1712", muted: "#6a5c46", accent: "#c8301c", onAccent: "#efe3c6",
    rule: "rgba(27,23,18,0.8)", track: "rgba(27,23,18,0.1)",
    display: FONT.head, displayWeight: 400, displayCase: "uppercase", displayTracking: "0.02em",
    body: FONT.copper, bodyWeight: 700, figures: FONT.fat,
    radius: 3, motion: "type", change: "fade", kit: { line: 3.4, fill: "solid", panel: "outline" },
    panelEdge: "rgba(27,23,18,0.7)",
    tone: TONE,
    keepArt: true,
    overlap: true,
    palettes: {
      // Bright stock with navy-black ink and an orange-red second plate.
      light: { bg: "#f7f4ec", ink: "#141b2b", muted: "#55607a", accent: "#d4452a", onAccent: "#f7f4ec", rule: "rgba(20,27,43,0.8)", panel: "rgba(20,27,43,0.05)", panelEdge: "rgba(20,27,43,0.7)", track: "rgba(20,27,43,0.1)",
        textShadow: shadowOn("rgba(255,255,255,0.9)"), backdrop: () => "#f7f4ec",
        tone: { ...TONE, paper: "#f7f4ec", fibre: "110,112,120", rim: "rgba(255,255,255,0.95)", shade: "rgba(30,36,64,0.4)", vig: "rgba(60,64,80,", vigA: 0.2, gloss: 0.26 } },
      // Cream ink and a hot red pulled on black card.
      dark: { bg: "#1a1612", ink: "#ece0c4", muted: "#a89a7d", accent: "#e8573c", onAccent: "#1a1612", rule: "rgba(236,224,196,0.8)", panel: "rgba(236,224,196,0.06)", panelEdge: "rgba(236,224,196,0.6)", track: "rgba(236,224,196,0.1)",
        textShadow: (accent) => `3px 2px 0 ${hexA(accent, 0.5)}, 0 -1px 0 rgba(0,0,0,0.5)`, backdrop: () => "#1a1612",
        tone: { ...TONE, paper: "#1a1612", fibre: "255,236,200", mult: false, rim: "rgba(255,240,210,0.12)", shade: "rgba(0,0,0,0.7)", vig: "rgba(0,0,0,", vigA: 0.55, gloss: 0.14, ghost: 0.09 } },
      // Newsprint grey, one black ink.
      mono: { bg: "#dcdcd5", ink: "#1d1d1d", muted: "#5d5d58", accent: "#1d1d1d", onAccent: "#dcdcd5", rule: "rgba(29,29,29,0.8)", panel: "rgba(29,29,29,0.05)", panelEdge: "rgba(29,29,29,0.7)", track: "rgba(29,29,29,0.1)",
        textShadow: shadowOn("rgba(255,255,255,0.55)"), backdrop: () => "#dcdcd5",
        tone: { ...TONE, paper: "#dcdcd5", fibre: "80,80,76", rim: "rgba(255,255,255,0.7)", shade: "rgba(30,30,28,0.42)", vig: "rgba(50,50,46,", vigA: 0.3, gloss: 0.2 } },
    },
    textShadow: shadowOn("rgba(255,250,235,0.55)"),
    backdrop: () => "#efe3c6",
    // The stock is drawn by the stage; this pass only marks the backdrop as on.
    paint: (ctx, W, H) => { ctx.clearRect(0, 0, W, H); },
    css: (accent, look) => look.texture > 0
      ? `#root .display, #root .kicker { -webkit-mask-image: ${holes(look.texture)}; -webkit-mask-size: 420px 420px; mask-image: ${holes(look.texture)}; mask-size: 420px 420px; }` : "",
    stage(ctx, S, info) {
      const F = (frame = makeFrame(ctx, S, info));
      for (const g of [F.K, F.R]) { g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.setLineDash([]); g.clearRect(0, 0, F.W, F.H); }
      furniture(F);
      if (F.tr) sided(F, true, () => backdrop(F, F.prev.id, F.prev.hold + info.local));
      if (info.scene) sided(F, false, () => backdrop(F, info.scene, info.local));
      if (!info.scene || !DRAW[info.scene]) finishFrame(ctx, F);
    },
    scenes: { chart: scene("chart"), object: scene("object"), people: scene("people"), process: scene("process"), compare: scene("compare") },
  };
});
