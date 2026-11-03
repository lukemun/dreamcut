// Riso: a zine printed on a three-drum stencil duplicator. Every drawing is split into three spot-ink
// plates (fluorescent pink, yellow and a blue key) that overprint by multiplying on cream stock, land
// slightly out of register, and carry the medium's grain: ink dropout, dry clumps and roller streaks.
// Tints are real halftone screens at their own angles. Scenes print in plate by plate behind a moving
// roller band and leave by sliding their plates apart. The grain and register boil a little on every
// eighth of a second, as if each frame were its own print. Frames are pure functions of time.
window.DreamcutMotion.register("riso", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  // The roller is already moving when it meets the sheet: fast in, easing as it leaves.
  const roll = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const DISPLAY = "Futura, 'Avenir Next', 'Century Gothic', 'Trebuchet MS', Arial, sans-serif";
  const LABEL = "'Avenir Next Condensed', 'Arial Narrow', 'Roboto Condensed', Arial, sans-serif";
  const KEYS = ["y", "p", "k"];
  const ANG = { y: 0.12, p: 1.31, k: 0.79 };
  const fmt = (v, target, d) => {
    const dec = Math.abs((Number(target) || 0) % 1) > 0.001 ? 1 : 0;
    return window.DreamcutMotion.formatNumber(v, dec, (d && d.prefix) || "", (d && d.suffix) || "");
  };

  // ---- plates ------------------------------------------------------------------------------------
  // Each drawing is made as three separate masks, one per drum, then inked and overprinted.
  const PL = {};
  let HELP = null;
  const helper = () => HELP || (HELP = document.createElement("canvas").getContext("2d"));
  function plates(W, H) {
    for (const k of KEYS) {
      let c = PL[k];
      if (!c) c = PL[k] = document.createElement("canvas");
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    }
    return { y: PL.y.getContext("2d"), p: PL.p.getContext("2d"), k: PL.k.getContext("2d") };
  }
  function begin(F) {
    const P = plates(F.W, F.H);
    for (const k of KEYS) {
      const g = P[k];
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
      g.clearRect(0, 0, F.W, F.H); g.fillStyle = "#000"; g.strokeStyle = "#000"; g.setLineDash([]); g.lineDashOffset = 0;
      g.lineCap = "round"; g.lineJoin = "round"; g.filter = "none";
    }
    return P;
  }
  // The same transform and opacity on all three plates, so a moving object keeps its register.
  function push(P, x, y, s = 1, r = 0, a = 1) {
    for (const k of KEYS) {
      const g = P[k];
      g.save(); g.translate(x, y); if (r) g.rotate(r); if (s !== 1) g.scale(s, s); g.translate(-x, -y); g.globalAlpha *= a;
    }
  }
  function pop(P) { for (const k of KEYS) P[k].restore(); }
  function clipAll(P, path) { for (const k of KEYS) { P[k].save(); P[k].clip(path); } }

  // ---- texture tiles -----------------------------------------------------------------------------
  const TILE = 512;
  let GRAIN = null;
  function grainPat() {
    if (GRAIN) return GRAIN;
    const r = rng(1717), c = document.createElement("canvas");
    c.width = c.height = TILE;
    const g = c.getContext("2d"), img = g.createImageData(TILE, TILE);
    for (let i = 0; i < TILE * TILE; i++) { const v = r(); img.data[i * 4 + 3] = v > 0.8 ? Math.round(((v - 0.8) / 0.2) * 190) : 0; }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 1700; i++) { g.fillStyle = `rgba(0,0,0,${0.25 + r() * 0.6})`; g.beginPath(); g.arc(r() * TILE, r() * TILE, 0.5 + r() * 1.8, 0, TAU); g.fill(); }
    // Dry patches where the drum starved.
    for (let i = 0; i < 18; i++) {
      const x = r() * TILE, y = r() * TILE, rad = 16 + r() * 64, a = 0.1 + r() * 0.16;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const X = x + dx * TILE, Y = y + dy * TILE, gr = g.createRadialGradient(X, Y, 0, X, Y, rad);
        gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr; g.fillRect(X - rad, Y - rad, rad * 2, rad * 2);
      }
    }
    // Streaks along the paper feed.
    for (let i = 0; i < 46; i++) { g.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.12})`; g.fillRect(0, r() * TILE, TILE, 0.6 + r() * 3.4); }
    return (GRAIN = helper().createPattern(c, "repeat"));
  }
  const SPECK = {};
  function speckPat(color) {
    if (SPECK[color]) return SPECK[color];
    const r = rng(23), c = document.createElement("canvas");
    c.width = c.height = 384;
    const g = c.getContext("2d");
    g.fillStyle = color;
    for (let i = 0; i < 1500; i++) { g.globalAlpha = 0.45 + r() * 0.55; g.beginPath(); g.arc(r() * 384, r() * 384, 0.4 + r() * 1.5, 0, TAU); g.fill(); }
    g.globalAlpha = 0.18;
    for (let i = 0; i < 10; i++) g.fillRect(0, r() * 384, 384, 0.6 + r() * 1.4);
    return (SPECK[color] = helper().createPattern(c, "repeat"));
  }
  const ROLL = {};
  function rollGrad(H, i) {
    const key = `${H}:${i}`;
    if (ROLL[key]) return ROLL[key];
    const r = rng(300 + i * 17), gr = helper().createLinearGradient(0, 0, 0, H);
    for (let k = 0; k <= 10; k++) gr.addColorStop(k / 10, `rgba(0,0,0,${(r() * r() * 0.32).toFixed(3)})`);
    return (ROLL[key] = gr);
  }
  // A flat halftone tint: one dot per cell, area matching the level, at the plate's own screen angle.
  const TINTS = new Map();
  function tint(F, level, key = "k", pitch = 10) {
    const L = Math.round(clamp(level) * 16) / 16, step = Math.max(4, Math.round(pitch * F.u)), id = `${L}:${step}:${key}`;
    let pat = TINTS.get(id);
    if (!pat) {
      const c = document.createElement("canvas");
      c.width = c.height = step;
      const g = c.getContext("2d");
      g.fillStyle = "#000";
      g.beginPath(); g.arc(step / 2, step / 2, step * 0.5 * Math.sqrt(L) * 1.13, 0, TAU); g.fill();
      pat = helper().createPattern(c, "repeat");
      pat.setTransform(new DOMMatrix().rotate((ANG[key] * 180) / Math.PI));
      TINTS.set(id, pat);
    }
    return pat;
  }
  // A halftone gradient: dots on a rotated screen, each sized by fn(x, y) in 0..1.
  function dots(g, x, y, w, h, fn, pitch, ang) {
    const ca = Math.cos(ang), sa = Math.sin(ang), cx = x + w / 2, cy = y + h / 2, R = Math.hypot(w, h) / 2;
    g.beginPath();
    for (let i = -R; i <= R; i += pitch) for (let j = -R; j <= R; j += pitch) {
      const px = cx + i * ca - j * sa, py = cy + i * sa + j * ca;
      if (px < x - pitch || px > x + w + pitch || py < y - pitch || py > y + h + pitch) continue;
      const v = fn(px, py);
      if (v <= 0.02) continue;
      const r = pitch * 0.5 * Math.sqrt(Math.min(1, v)) * 1.13;
      g.moveTo(px + r, py); g.arc(px, py, r, 0, TAU);
    }
    g.fill();
  }

  // ---- shapes and lettering ----------------------------------------------------------------------
  const rrP = (x, y, w, h, r) => { const p = new Path2D(); w = Math.max(0.5, w); h = Math.max(0.5, h); p.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2))); return p; };
  const circP = (x, y, r) => { const p = new Path2D(); p.arc(x, y, Math.max(0.1, r), 0, TAU); return p; };
  const polyP = (pts, close = true) => { const p = new Path2D(); pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); if (close) p.closePath(); return p; };
  const line = (g, path, w, dash) => { g.lineWidth = w; if (dash) g.setLineDash(dash); g.stroke(path); if (dash) g.setLineDash([]); };
  const tfill = (F, g, path, level, key) => { g.fillStyle = tint(F, level, key); g.fill(path); g.fillStyle = "#000"; };
  // A wobbly scalloped seal: the stamp and sticker shape of the zine.
  function sealP(cx, cy, r, bumps, depth, rot = 0) {
    const p = new Path2D();
    for (let i = 0; i <= 160; i++) {
      const a = (i / 160) * TAU + rot, rr = r * (1 + depth * Math.cos(a * bumps - rot * bumps));
      i ? p.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : p.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    p.closePath();
    return p;
  }
  function blobP(cx, cy, r, seed, t, wob = 0.08) {
    const p = new Path2D();
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * TAU, rr = r * (1 + wob * (Math.sin(a * 3 + seed + t * 0.7) * 0.6 + Math.sin(a * 5 + seed * 2 - t * 0.5) * 0.4));
      i ? p.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : p.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    p.closePath();
    return p;
  }
  function fontOf(o, size) {
    const fam = o.font === "display" ? DISPLAY : LABEL, wt = o.weight || (o.font === "display" ? 700 : 700);
    return `${wt} ${size}px ${fam}`;
  }
  function measure(g, s, size, o = {}) {
    g.font = fontOf(o, size);
    g.letterSpacing = (o.track ?? 0.02) * size + "px";
    const w = g.measureText(o.upper ? String(s).toUpperCase() : String(s)).width;
    g.letterSpacing = "0px";
    return w;
  }
  // Lettering on one plate; long words shrink to fit, never below `min`.
  function txt(g, s, x, y, size, o = {}) {
    s = String(s ?? "");
    if (o.upper) s = s.toUpperCase();
    if (!s) return { w: 0, size };
    g.font = fontOf(o, size);
    g.letterSpacing = (o.track ?? 0.02) * size + "px";
    let w = g.measureText(s).width;
    if (o.maxW && w > o.maxW) {
      size = Math.max(o.min || size * 0.7, (size * o.maxW) / w);
      g.font = fontOf(o, size); g.letterSpacing = (o.track ?? 0.02) * size + "px";
      w = g.measureText(s).width;
    }
    const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    g.textAlign = "left"; g.textBaseline = o.base || "alphabetic";
    if (o.knock) { g.save(); g.globalCompositeOperation = "destination-out"; g.fillText(s, x0, y); g.restore(); } else g.fillText(s, x0, y);
    g.letterSpacing = "0px";
    return { w, size };
  }

  // ---- frame, paper and the print ----------------------------------------------------------------
  let CUR = { index: 0, next: null, scene: null };
  function frame(S, info) {
    const inks = S.look.inks || INKS;
    return { S, u: S.u, W: S.W, H: S.H, tall: S.tall, t: info.t, tex: S.look.texture ?? 1, info,
      ink: { y: inks.y, p: S.accent, k: inks.k }, paper: inks.paper, blend: inks.blend || "multiply", dark: inks.blend === "screen" };
  }
  const PAPER = { key: "", tex: null };
  function paper(ctx, F) {
    const key = `${F.W}x${F.H}:${F.paper}`;
    if (PAPER.key !== key) {
      const { W, H, u } = F, r = rng(808), c = document.createElement("canvas");
      c.width = W; c.height = H;
      const g = c.getContext("2d"), shade = F.dark ? "255,255,255" : "96,72,40", lite = F.dark ? "0,0,0" : "255,255,250";
      for (let i = 0; i < 90; i++) {
        const x = r() * W, y = r() * H, rad = (40 + r() * 260) * u, gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, `rgba(${r() < 0.5 ? shade : lite},${0.015 + r() * 0.03})`); gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      g.lineWidth = 0.7 * u;
      for (let i = 0; i < 2400; i++) {
        const x = r() * W, y = r() * H, a = r() * TAU, l = (4 + r() * 16) * u;
        g.strokeStyle = `rgba(${shade},${0.03 + r() * 0.06})`;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.7) * l * 0.5, y + Math.sin(a + 0.7) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
      for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${shade},${0.05 + r() * 0.16})`; g.beginPath(); g.arc(r() * W, r() * H, (0.4 + r() * 1.4) * u, 0, TAU); g.fill(); }
      const vg = g.createRadialGradient(W * 0.5, H * 0.46, Math.min(W, H) * 0.3, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.62);
      vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, `rgba(${shade},${F.dark ? 0.05 : 0.12})`);
      g.fillStyle = vg; g.fillRect(0, 0, W, H);
      PAPER.key = key; PAPER.tex = c;
    }
    ctx.save();
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    ctx.fillStyle = F.paper; ctx.fillRect(0, 0, F.W, F.H);
    ctx.globalAlpha = F.tex; ctx.drawImage(PAPER.tex, 0, 0);
    ctx.restore();
  }
  // Ink the three plates and overprint them. `split` pushes the plates apart (a scene leaving),
  // `reveal` lays each plate down behind a roller band (a scene printing in).
  const BASE = { y: [-5, 3.5], p: [4.5, -3], k: [0, 0] };
  const SPLIT = { y: [-1, 0.55], p: [0.95, -0.45], k: [0.15, -0.8] };
  function comp(ctx, F, P, o = {}) {
    const { u, W, H, tex } = F, reg = 0.45 + 0.55 * tex, step = Math.floor(F.t * 8);
    KEYS.forEach((key, i) => {
      const g = P[key], rv = o.reveal ? o.reveal[i] : 1;
      if (rv <= 0) return;
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
      if (o.wipe !== undefined && o.wipe > 0) {
        // Leaving: the fresh sheet's roller eats this print from the left, trailing a ragged edge.
        if (o.wipe >= 1) return;
        const e = lerp(-0.06 * W, 1.1 * W, o.wipe), band = 0.06 * W;
        g.globalCompositeOperation = "destination-out";
        const gr = g.createLinearGradient(e - band / 2, 0, e + band / 2, 0);
        gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr; g.fillRect(-band, 0, e + band, H);
        g.fillStyle = "#000";
        for (let s = 0; s < 26; s++) { const yy = hash(s * 13 + i * 7) * H, hh = (4 + hash(s * 31 + i) * 26) * u; g.fillRect(e - band, yy, band * (0.6 + hash(s * 5 + i * 3) * 1.4), hh); }
      }
      if (rv < 1) {
        const e = lerp(-0.06 * W, 1.1 * W, rv), band = 0.1 * W;
        g.globalCompositeOperation = "destination-out";
        const gr = g.createLinearGradient(e - band / 2, 0, e + band / 2, 0);
        gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,1)");
        g.fillStyle = gr; g.fillRect(e - band / 2, 0, W - e + band, H);
        if (key !== "k") {
          // The roller band itself: a streaky smear of fresh ink travelling across the sheet.
          g.globalCompositeOperation = "source-over";
          const rb = 90 * u;
          for (let s = 0; s < 34; s++) {
            g.globalAlpha = 0.12 + hash(s * 7 + i * 3) * 0.3;
            const yy = hash(s * 17 + i * 5) * H, hh = (2 + hash(s * 29 + i) * 18) * u;
            g.fillRect(e - rb * (0.3 + hash(s * 3 + i) * 0.9), yy, rb * (0.5 + hash(s * 11 + i)), hh);
          }
          g.globalAlpha = 0.16;
          const sm = g.createLinearGradient(e - rb, 0, e + rb * 0.2, 0);
          sm.addColorStop(0, "rgba(0,0,0,0)"); sm.addColorStop(0.8, "rgba(0,0,0,1)"); sm.addColorStop(1, "rgba(0,0,0,0)");
          g.fillStyle = sm; g.fillRect(e - rb, 0, rb * 1.2, H);
          g.globalAlpha = 1;
        }
      }
      // Light inks on dark stock add instead of darkening, so the key knocks out what sits under it.
      if (F.dark && key !== "k") { g.globalCompositeOperation = "destination-out"; g.globalAlpha = 1; g.drawImage(P.k.canvas, 0, 0); }
      g.globalCompositeOperation = "source-in"; g.fillStyle = F.ink[key]; g.fillRect(0, 0, W, H);
      if (tex > 0) {
        g.globalCompositeOperation = "destination-out";
        g.globalAlpha = 0.8 * tex;
        const pat = grainPat();
        pat.setTransform(new DOMMatrix([1, 0, 0, 1, Math.floor(hash(step * 3 + i * 11) * TILE), Math.floor(hash(step * 5 + i * 7) * TILE)]));
        g.fillStyle = pat; g.fillRect(0, 0, W, H);
        g.globalAlpha = 0.6 * tex; g.fillStyle = rollGrad(H, i); g.fillRect(0, 0, W, H);
      }
      g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.fillStyle = "#000";
      const j1 = hash(step * 7 + i * 131) - 0.5, j2 = hash(step * 13 + i * 71 + 5) - 0.5, sp = o.split || 0;
      const dx = (BASE[key][0] + j1 * 1.6) * u * reg + SPLIT[key][0] * sp * u;
      const dy = (BASE[key][1] + j2 * 1.6) * u * reg + SPLIT[key][1] * sp * u + (o.lift || 0) * -40 * u * (i + 1) / 3;
      ctx.save();
      ctx.globalCompositeOperation = F.blend; ctx.globalAlpha *= o.alpha ?? 1;
      ctx.drawImage(g.canvas, dx, dy);
      ctx.restore();
    });
  }
  // How a scene sits in the print: printing in, holding, or sliding apart as it leaves.
  function printState(info, idx, hasNext) {
    // One roller pass carries the change: it lays the new scene's plates down and wipes the old print
    // off at the same edge, so the sheet is never empty. The old print stays at full strength until it goes.
    const ch = Math.max(0.35, info.change || 0.45);
    if (info.exit !== undefined) { const e = info.exit; return { split: 18 + 70 * eio(e), alpha: 1, lift: 0.25 * eio(e), wipe: roll(seg(e * (info.change || 0.45), 0, ch)) }; }
    const L = info.local, o = { split: 0, alpha: 1, reveal: null };
    // Before the change the drums drift apart a little, as if the register were being reset.
    if (hasNext && L > info.hold - ch) o.split = 18 * eio(seg(L, info.hold - ch, info.hold));
    if (idx > 0) o.reveal = [seg(L, 0, ch), seg(L, ch * 0.08, ch * 1.1), seg(L, ch * 0.16, ch * 1.25)].map(roll);
    return o;
  }

  // ---- layout helpers ----------------------------------------------------------------------------
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
      const ln = { x: ox + (r.left - er.left) / scale, y: oy + (r.top - er.top) / scale, w: r.width / scale, h: r.height / scale };
      if (ln.w > 1 && !out.some((o) => Math.abs(o.y - ln.y) < 2)) out.push(ln);
    }
    return (lineCache[id] = out);
  }
  function area(F, id, box) {
    const lines = headLines(`${id}-title`);
    let top = box.y;
    if (lines.length) top = clamp(Math.max(...lines.map((l) => l.y + l.h)) + (F.tall ? 70 : 54) * F.u, F.H * 0.2, box.y + 40 * F.u);
    const bottom = F.H - (F.tall ? 130 : 74) * F.u;
    return { x: box.x, y: top, w: box.w, h: bottom - top };
  }
  // Free room beside or around a statement headline, for its illustration.
  function freeRegion(F, ids) {
    const { W, H, u, tall } = F, side = (tall ? 90 : 140) * u;
    const lines = ids.flatMap((id) => headLines(id));
    if (!lines.length) return { main: { x: W * 0.55, y: H * 0.15, w: W * 0.4, h: H * 0.7 }, mode: "side", other: null };
    const right = Math.max(...lines.map((l) => l.x + l.w)), top = Math.min(...lines.map((l) => l.y)), bottom = Math.max(...lines.map((l) => l.y + l.h));
    const rw = W - side * 0.5 - right - 50 * u;
    const above = { x: side * 0.6, y: 90 * u, w: W - side * 1.2, h: top - 40 * u - 90 * u };
    const below = { x: side * 0.6, y: bottom + 44 * u, w: W - side * 1.2, h: H - 90 * u - (bottom + 44 * u) };
    if (!tall && rw > W * 0.27) return { main: { x: right + 50 * u, y: H * 0.1, w: rw, h: H * 0.8 }, mode: "side", other: null, text: { top, bottom, right } };
    return below.h >= above.h ? { main: below, mode: "band", other: above, text: { top, bottom, right } } : { main: above, mode: "band", other: below, text: { top, bottom, right } };
  }
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  let planCache = null;
  function controls() {
    if (window.__dreamcut && window.__dreamcut.controls) return window.__dreamcut.controls;
    try { if (typeof dc !== "undefined" && dc && dc.controls) return dc.controls; } catch (e) { /* not on this page */ }
    return null;
  }
  function plan() {
    if (planCache) return planCache;
    const c = controls();
    if (!c) return null;
    let t = 0;
    const shown = [];
    for (const id of ORDER) { const hold = Number(c[`${id}_hold`]) || 0; if (hold > 0) shown.push({ id, start: t, hold }); t += hold; }
    return (planCache = { shown, change: Number(c.change) || 0.45 });
  }

  // ---- the world: stock, marks and drifting screens under everything --------------------------------
  function world(F, P) {
    const { W, H, u, t, tall } = F, m = Math.min(W, H);
    const fields = tall
      ? [{ key: "y", x: 0.92, y: 0.1, r: 0.62, a: 0.5, ph: 0 }, { key: "p", x: 0.04, y: 0.95, r: 0.6, a: 0.4, ph: 2 }, { key: "k", x: 1.0, y: 0.7, r: 0.4, a: 0.22, ph: 4 }, { key: "y", x: 0.0, y: 0.38, r: 0.34, a: 0.32, ph: 1 }]
      : [{ key: "y", x: 0.88, y: 0.12, r: 0.44, a: 0.5, ph: 0 }, { key: "p", x: 0.05, y: 0.94, r: 0.42, a: 0.4, ph: 2 }, { key: "k", x: 0.99, y: 1.0, r: 0.32, a: 0.24, ph: 4 }, { key: "y", x: 0.02, y: 0.06, r: 0.26, a: 0.34, ph: 1 }];
    for (const f of fields) {
      const cx = W * f.x + Math.sin(t * 0.21 + f.ph) * 80 * u, cy = H * f.y + Math.cos(t * 0.17 + f.ph * 1.3) * 60 * u, R = m * f.r * (1 + 0.04 * Math.sin(t * 0.5 + f.ph));
      dots(P[f.key], cx - R, cy - R, R * 2, R * 2, (x, y) => { const d = Math.hypot(x - cx, y - cy) / R; return d >= 1 ? 0 : f.a * Math.pow(1 - d, 1.15); }, 13 * u, ANG[f.key]);
    }
    // Registration targets and crop marks, printed on every drum so the register shows.
    const o = 46 * u, s = 18 * u;
    for (const [x, y] of [[o, o], [W - o, o], [o, H - o], [W - o, H - o]]) {
      const path = new Path2D();
      path.arc(x, y, s * 0.55, 0, TAU); path.moveTo(x - s, y); path.lineTo(x + s, y); path.moveTo(x, y - s); path.lineTo(x, y + s);
      for (const k of KEYS) line(P[k], path, 2 * u);
    }
    // A colour bar along the foot: each drum, each overprint.
    const combos = [["y"], ["p"], ["k"], ["y", "p"], ["p", "k"], ["k", "y"], ["y", "p", "k"]], sw = 22 * u;
    const bx = W - o - 34 * u - combos.length * (sw + 5 * u), by = H - o - sw / 2;
    combos.forEach((c, i) => { for (const k of c) P[k].fillRect(bx + i * (sw + 5 * u), by, sw, sw); });
    [0.75, 0.5, 0.25].forEach((lv, i) => tfill(F, P.k, rrP(o + 34 * u + i * (sw + 5 * u), by, sw, sw, 0), lv, "k"));
    doodles(F, P);
  }
  // Small printed odds in the margins, each with its own idle motion.
  function doodles(F, P) {
    const { W, H, u, t, tall } = F;
    const heads = [CUR.scene === "title" ? "title" : CUR.scene === "closing" ? "closing" : `${CUR.scene}-title`, "kicker"].flatMap((id) => (CUR.scene ? headLines(id) : []));
    const spots = tall
      ? [[0.05, 0.3, "squig", "p"], [0.95, 0.36, "punch", "k"], [0.05, 0.62, "punch", "y"], [0.95, 0.66, "zig", "p"], [0.3, 0.035, "squig", "y"], [0.7, 0.04, "drop", "p"], [0.28, 0.968, "zig", "k"], [0.5, 0.966, "punch", "p"], [0.95, 0.9, "drop", "y"], [0.05, 0.9, "cross", "k"]]
      : [[0.035, 0.33, "squig", "p"], [0.035, 0.56, "punch", "y"], [0.035, 0.78, "zig", "k"], [0.965, 0.3, "punch", "p"], [0.965, 0.52, "drop", "k"], [0.965, 0.72, "squig", "y"], [0.62, 0.05, "cross", "p"], [0.78, 0.05, "punch", "k"], [0.18, 0.958, "squig", "k"], [0.4, 0.962, "drop", "p"]];
    spots.forEach(([fx, fy, kind, key], i) => {
      const x = W * fx + Math.sin(t * 0.9 + i * 2.1) * 6 * u, y = H * fy + Math.cos(t * 1.1 + i * 1.3) * 7 * u, s = 26 * u;
      if (heads.some((l) => x > l.x - s * 2 && x < l.x + l.w + s * 2 && y > l.y - s * 2 && y < l.y + l.h + s * 2)) return;
      const g = P[key], rot = Math.sin(t * 0.8 + i) * 0.4;
      g.save(); g.translate(x, y); g.rotate(rot);
      if (kind === "squig") {
        const p = new Path2D();
        for (let k = 0; k <= 24; k++) { const xx = -s * 1.3 + (k / 24) * s * 2.6, yy = Math.sin(k * 0.8 + t * 4 + i) * s * 0.28; k ? p.lineTo(xx, yy) : p.moveTo(xx, yy); }
        line(g, p, 5 * u);
      } else if (kind === "punch") {
        line(g, circP(0, 0, s * 0.62), 6 * u);
        g.fill(circP(s * 0.9, -s * 0.5, s * 0.16));
      } else if (kind === "zig") {
        const p = new Path2D();
        for (let k = 0; k <= 6; k++) { const xx = -s + (k / 6) * s * 2, yy = (k % 2 ? -1 : 1) * s * 0.32 * (0.8 + 0.2 * Math.sin(t * 5 + i)); k ? p.lineTo(xx, yy) : p.moveTo(xx, yy); }
        line(g, p, 5 * u);
      } else if (kind === "drop") {
        const sc = 1 + 0.08 * Math.sin(t * 3 + i);
        g.scale(sc, sc);
        g.fill(polyP([[0, -s * 0.8], [s * 0.5, s * 0.1], [0, s * 0.55], [-s * 0.5, s * 0.1]]));
        g.fill(circP(0, s * 0.12, s * 0.5));
      } else {
        const p = new Path2D(); p.moveTo(-s * 0.6, 0); p.lineTo(s * 0.6, 0); p.moveTo(0, -s * 0.6); p.lineTo(0, s * 0.6);
        g.rotate(t * 0.6);
        line(g, p, 6 * u);
      }
      g.restore();
    });
  }

  // ---- a strip of film along a curve -----------------------------------------------------------------
  function sampler(fn, N = 140) {
    const pts = [];
    let L = 0;
    for (let i = 0; i <= N; i++) { const [x, y] = fn(i / N); if (i) L += Math.hypot(x - pts[i - 1].x, y - pts[i - 1].y); pts.push({ x, y, s: L }); }
    const at = (s) => {
      s = clamp(s, 0, L);
      let lo = 0, hi = N;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m].s < s) lo = m; else hi = m; }
      const a = pts[lo], b = pts[hi], k = (s - a.s) / Math.max(1e-6, b.s - a.s), dx = b.x - a.x, dy = b.y - a.y, dl = Math.hypot(dx, dy) || 1;
      return { x: a.x + dx * k, y: a.y + dy * k, nx: -dy / dl, ny: dx / dl };
    };
    return { L, at };
  }
  function band(C, a, b, off1, off2, step) {
    const A = [], B = [];
    for (let s = a; s <= b + step * 0.5; s += step) { const p = C.at(Math.min(s, b)); A.push([p.x + p.nx * off1, p.y + p.ny * off1]); B.push([p.x + p.nx * off2, p.y + p.ny * off2]); }
    return polyP([...A, ...B.reverse()]);
  }
  function filmStrip(F, P, fn, width, shown, scroll) {
    const u = F.u, C = sampler(fn), Ls = C.L * clamp(shown);
    if (Ls < 4 * u) return;
    const half = width / 2;
    const body = band(C, 0, Ls, half, -half, 7 * u);
    tfill(F, P.k, body, 0.88, "k");
    line(P.k, body, 3 * u);
    const fl = width * 0.92, gap = width * 0.2, inner = half * 0.6, per = fl + gap;
    const start = -(((scroll % per) + per) % per);
    for (let s0 = start; s0 < Ls; s0 += per) {
      const a = Math.max(0, s0), b = Math.min(Ls, s0 + fl);
      if (b - a < 3 * u) continue;
      const win = band(C, a, b, inner, -inner, 5 * u), j = Math.round((s0 - start) / per + Math.floor(scroll / per)), kind = ((j % 3) + 3) % 3;
      P.k.save(); P.k.globalCompositeOperation = "destination-out"; P.k.fill(win); P.k.restore();
      if (kind === 0) P.p.fill(win); else if (kind === 1) P.y.fill(win); else { tfill(F, P.p, win, 0.45, "p"); P.y.fill(win); }
    }
    const sp = width * 0.26;
    P.k.save(); P.k.globalCompositeOperation = "destination-out";
    for (let s0 = -(((scroll % sp) + sp) % sp); s0 < Ls; s0 += sp) {
      if (s0 < 0) continue;
      const pt = C.at(s0);
      for (const sg of [1, -1]) {
        const off = half * 0.8 * sg;
        P.k.save(); P.k.translate(pt.x + pt.nx * off, pt.y + pt.ny * off); P.k.rotate(Math.atan2(pt.ny, pt.nx));
        P.k.fillRect(-width * 0.05, -width * 0.065, width * 0.1, width * 0.13); P.k.restore();
      }
    }
    P.k.restore();
  }
  function dial(F, P, x, y, r, ang, key) {
    const u = F.u;
    tfill(F, P[key], circP(x, y, r), 0.55, key);
    P[key].fill(circP(x, y, r * 0.62));
    line(P.k, circP(x, y, r), 4 * u);
    line(P.k, circP(x, y, r * 0.62), 3 * u);
    line(P.k, polyP([[x, y], [x + Math.cos(ang) * r * 0.55, y + Math.sin(ang) * r * 0.55]], false), 6 * u);
    const ticks = new Path2D();
    for (let k = 0; k < 9; k++) { const a = Math.PI * 0.75 + (k / 8) * Math.PI * 1.5; ticks.moveTo(x + Math.cos(a) * r * 1.15, y + Math.sin(a) * r * 1.15); ticks.lineTo(x + Math.cos(a) * r * 1.32, y + Math.sin(a) * r * 1.32); }
    line(P.k, ticks, 3 * u);
  }

  // ---- title: a sun, a strip of film and the dials ---------------------------------------------------
  function titleArt(F, P, reg, k, t) {
    const { u } = F, R = reg.main, side = reg.mode === "side";
    const s = side ? Math.min(R.w / 760, R.h / 820) : Math.min(R.h / 380, R.w / 1500);
    const sk = back(seg(k, 0, 0.45));
    const scx = side ? R.x + R.w * 0.55 : R.x + R.w * 0.8, scy = side ? R.y + R.h * 0.44 : R.y + R.h * 0.5, sr = (side ? 300 : 170) * s;
    if (sk > 0) {
      push(P, scx, scy, sk);
      dots(P.y, scx - sr * 1.5, scy - sr * 1.5, sr * 3, sr * 3, (x, y) => { const d = Math.hypot(x - scx, y - scy) / sr; return d < 1 ? 0 : clamp(1.5 - d) * 1.6 * (0.8 + 0.2 * Math.sin(t * 2 - d * 4)); }, 12 * u, ANG.y);
      P.y.fill(circP(scx, scy, sr));
      P.p.save(); P.p.clip(circP(scx, scy, sr));
      dots(P.p, scx - sr, scy - sr, sr * 2, sr * 2, (x, y) => clamp((y - (scy - sr * 0.1)) / (sr * 1.1)) * 0.85, 11 * u, ANG.p);
      P.p.restore();
      line(P.k, circP(scx, scy, sr), 5 * u);
      pop(P);
    }
    const width = (side ? 150 : 104) * s;
    const fn = side
      ? (v) => [R.x + R.w * (-0.05 + v * 1.1), R.y + R.h * (0.78 - 0.5 * v) + Math.sin(v * Math.PI * 2 + 0.6) * R.h * 0.12]
      : (v) => [R.x - 40 * u + v * (R.w + 80 * u), R.y + R.h * 0.55 + Math.sin(v * Math.PI * 2.4 + 0.4) * R.h * 0.2];
    filmStrip(F, P, fn, width, seg(k, 0.15, 0.7), t * 90 * u);
    // A play stamp and two dials, each with its own motion.
    const pb = back(seg(k, 0.4, 0.7));
    if (pb > 0) {
      const px = side ? R.x + R.w * 0.2 : R.x + R.w * 0.14, py = (side ? R.y + R.h * 0.2 : R.y + R.h * 0.42) + Math.sin(t * 2.2) * 10 * u, pr = (side ? 92 : 70) * s;
      push(P, px, py, pb, Math.sin(t * 1.4) * 0.12);
      P.p.fill(sealP(px, py, pr, 12, 0.07, t * 0.4));
      line(P.k, sealP(px, py, pr, 12, 0.07, t * 0.4), 4 * u);
      const tri = polyP([[px - pr * 0.28, py - pr * 0.4], [px + pr * 0.45, py], [px - pr * 0.28, py + pr * 0.4]]);
      P.y.fill(tri); line(P.k, tri, 5 * u);
      pop(P);
    }
    const dq = back(seg(k, 0.5, 0.8));
    if (dq > 0) {
      const d1 = side ? [R.x + R.w * 0.86, R.y + R.h * 0.86] : [R.x + R.w * 0.43, R.y + R.h * 0.3], d2 = side ? [R.x + R.w * 0.16, R.y + R.h * 0.92] : [R.x + R.w * 0.6, R.y + R.h * 0.78];
      const dr = (side ? 64 : 50) * s;
      push(P, d1[0], d1[1], dq); dial(F, P, d1[0], d1[1], dr, -2.2 + Math.sin(t * 1.3) * 1.1, "p"); pop(P);
      push(P, d2[0], d2[1], dq); dial(F, P, d2[0], d2[1], dr * 0.8, -0.8 + Math.sin(t * 1.7 + 1) * 1.3, "y"); pop(P);
    }
    if (reg.other && reg.other.h > 110 * u) {
      const O = reg.other, w = Math.min(90 * u, O.h * 0.55);
      filmStrip(F, P, (v) => [O.x - 60 * u + v * (O.w + 120 * u), O.y + O.h * 0.5 + Math.sin(v * Math.PI * 3 + 1.2) * O.h * 0.12], w, seg(k, 0.2, 0.8), -t * 70 * u);
    }
  }

  // ---- closing: the approval stamp lands, then confetti from the hole punch keeps falling -----------
  function confetti(F, P, t, n, seed, avoid = []) {
    const { W, H, u } = F;
    for (let i = 0; i < n; i++) {
      const h1 = hash(i * 3.1 + seed), h2 = hash(i * 7.3 + seed), h3 = hash(i * 11.7 + seed), sp = (50 + h2 * 90) * u;
      const y = ((h3 * H * 1.2 + t * sp) % (H * 1.2)) - H * 0.1, x = h1 * W + Math.sin(t * (0.8 + h2) + i) * 34 * u, key = KEYS[i % 3], g = P[key];
      if (avoid.some((l) => x > l.x - 20 * u && x < l.x + l.w + 20 * u && y > l.y - 10 * u && y < l.y + l.h + 10 * u)) continue;
      g.save(); g.translate(x, y); g.rotate(t * (1 + h3 * 2) + i);
      if (i % 4 === 0) line(g, circP(0, 0, 9 * u), 4 * u);
      else if (i % 4 === 1) g.fill(circP(0, 0, 8 * u));
      else g.fillRect(-12 * u, -4 * u, 24 * u, 8 * u);
      g.restore();
    }
  }
  function closingArt(F, P, reg, k, t, local) {
    const { u } = F, R = reg.main, side = reg.mode === "side";
    confetti(F, P, t, 46, 3, headLines("closing"));
    const r = side ? Math.min(R.w, R.h) * 0.36 : Math.min(R.h * 0.56, R.w * 0.22);
    const cx = side ? R.x + R.w * 0.5 : R.x + R.w * 0.78, cy = R.y + R.h * 0.5;
    const land = seg(local, 0.05, 0.4), sc = land < 1 ? lerp(1.9, 1, eio(land)) : 1 + 0.015 * Math.sin(t * 2.4);
    if (local > 0.05 || k > 0.5) {
      const rot = -0.18 + t * 0.12;
      push(P, cx, cy, sc, 0, clamp(land * 3));
      if (land >= 1) {
        // Splash: spokes of ink thrown out when the stamp hit.
        const sp = new Path2D(), kk = eo(seg(local, 0.4, 0.9));
        for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU + 0.2, r0 = r * (1.12 + 0.04 * hash(i)), r1 = r0 + r * (0.12 + 0.12 * hash(i + 9)) * kk; sp.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); sp.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); }
        line(P.y, sp, 7 * u);
      }
      const outer = sealP(cx, cy, r, 22, 0.035, rot);
      P.p.fill(outer);
      P.p.save(); P.p.globalCompositeOperation = "destination-out"; P.p.fill(circP(cx, cy, r * 0.72)); P.p.restore();
      tfill(F, P.y, circP(cx, cy, r * 0.72), 0.5, "y");
      line(P.k, circP(cx, cy, r * 0.72), 4 * u);
      line(P.k, outer, 4 * u);
      // Lettering around the ring, knocked out of the pink.
      const word = "APPROVED · BY YOU · APPROVED · BY YOU · ", n = word.length, fs = r * 0.13;
      P.p.save(); P.p.globalCompositeOperation = "destination-out"; P.p.font = `800 ${fs}px ${LABEL}`; P.p.textAlign = "center"; P.p.textBaseline = "middle";
      for (let i = 0; i < n; i++) { const a = rot + (i / n) * TAU; P.p.save(); P.p.translate(cx + Math.cos(a) * r * 0.86, cy + Math.sin(a) * r * 0.86); P.p.rotate(a + Math.PI / 2); P.p.fillText(word[i], 0, 0); P.p.restore(); }
      P.p.restore();
      const ck = eo(seg(local, 0.35, 0.8));
      if (ck > 0) {
        const pts = [[cx - r * 0.34, cy + r * 0.02], [cx - r * 0.1, cy + r * 0.26], [cx + r * 0.38, cy - r * 0.26]];
        const L1 = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]), L2 = Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]), want = (L1 + L2) * ck;
        const path = new Path2D();
        path.moveTo(...pts[0]);
        if (want <= L1) path.lineTo(lerp(pts[0][0], pts[1][0], want / L1), lerp(pts[0][1], pts[1][1], want / L1));
        else { path.lineTo(...pts[1]); path.lineTo(lerp(pts[1][0], pts[2][0], (want - L1) / L2), lerp(pts[1][1], pts[2][1], (want - L1) / L2)); }
        line(P.k, path, r * 0.13);
        line(P.p, path, r * 0.13);
      }
      pop(P);
    }
    if (reg.other && reg.other.h > 110 * u) {
      const O = reg.other, w = Math.min(84 * u, O.h * 0.5);
      filmStrip(F, P, (v) => [O.x - 60 * u + v * (O.w + 120 * u), O.y + O.h * 0.5 + Math.sin(v * Math.PI * 2.6) * O.h * 0.14], w, seg(k, 0.1, 0.7), t * 80 * u);
    }
    if (side) {
      const sx = R.x + R.w * 0.14, sy = R.y + R.h * 0.86;
      dial(F, P, sx, sy + Math.sin(t * 1.9) * 6 * u, 46 * u, -0.6 + Math.sin(t * 1.5) * 1.2, "y");
    }
  }

  // ---- chart: reams of printed sheets stacked to each value ------------------------------------------
  function chartScene(F, P, A, q, d, t) {
    const { u, tall } = F;
    const vals = (d.values || []).map((v) => Math.max(0, Number(v) || 0));
    const n = Math.max(1, vals.length), max = Math.max(...vals, 1);
    const hi = Number.isInteger(d.highlight) && d.highlight >= 0 && d.highlight < n ? d.highlight : vals.indexOf(Math.max(...vals));
    const B = tall ? { x: A.x, y: A.y, w: A.w, h: A.h * 0.58 } : { x: A.x, y: A.y, w: A.w * 0.62, h: A.h };
    const C = tall ? { x: A.x + A.w * 0.03, y: A.y + A.h * 0.66, w: A.w * 0.94, h: A.h * 0.32 } : { x: A.x + A.w * 0.68, y: A.y + A.h * 0.08, w: A.w * 0.32, h: A.h * 0.8 };
    const base = B.y + B.h - 78 * u, slot = B.w / n, bw = Math.min(slot * 0.5, 200 * u), dep = bw * 0.3, rise = dep * 0.55;
    const maxH = base - B.y - 110 * u - rise;
    // The table: a ruled edge and a halftone shadow falling away from it.
    const fq = eo(seg(q, 0.05, 0.3));
    dots(P.p, B.x - 30 * u, base, (B.w + 60 * u) * fq, 46 * u, (x, y) => 0.42 * (1 - (y - base) / (46 * u)), 10 * u, ANG.p);
    line(P.k, polyP([[B.x - 30 * u, base], [B.x - 30 * u + (B.w + 60 * u) * fq, base]], false), 5 * u);
    let hot = null;
    vals.forEach((v, i) => {
      const g0 = 0.3 + i * 0.06, grow = lerp(0.22, 1, eo(seg(q, g0, g0 + 0.3)));
      const x = B.x + slot * (i + 0.5) - (bw + dep) / 2, isHot = i === hi;
      if (grow > 0) {
        const h = Math.max(18 * u, (v / max) * maxH) * grow, top = base - h;
        const front = rrP(x, top, bw, h, 3 * u);
        const topF = polyP([[x, top], [x + dep, top - rise], [x + bw + dep, top - rise], [x + bw, top]]);
        const side = polyP([[x + bw, top], [x + bw + dep, top - rise], [x + bw + dep, base - rise], [x + bw, base]]);
        if (isHot) { P.p.fill(front); tfill(F, P.p, topF, 0.4, "p"); P.p.fill(side); tfill(F, P.k, side, 0.4, "k"); }
        else { P.y.fill(front); tfill(F, P.y, topF, 0.45, "y"); P.y.fill(side); tfill(F, P.k, side, 0.45, "k"); }
        // The edges of the sheets in the ream.
        const sl = new Path2D();
        for (let yy = base - 13 * u; yy > top + 8 * u; yy -= 14 * u) { sl.moveTo(x + 7 * u, yy); sl.lineTo(x + bw - 7 * u, yy + Math.sin(yy * 0.07 + i) * 1.5 * u); sl.moveTo(x + bw + 3 * u, yy - 2 * u); sl.lineTo(x + bw + dep - 2 * u, yy - rise + 1 * u); }
        P.k.save(); P.k.globalAlpha *= 0.6; line(P.k, sl, 1.6 * u); P.k.restore();
        line(P.k, front, 4 * u); line(P.k, topF, 4 * u); line(P.k, side, 4 * u);
        // The top sheet lifts at its corner.
        const curl = (0.5 + 0.5 * Math.sin(t * 2.6 + i * 1.9)) * 18 * u * grow;
        const cp = polyP([[x + bw - 34 * u, top], [x + bw, top], [x + bw - curl * 0.4, top - curl]]);
        line(P.k, cp, 3 * u);
        const s = fmt(v * grow, v, d), vy = top - rise - 22 * u, fs = (isHot ? 70 : 56) * u;
        txt(P.k, s, x + (bw + dep) / 2, vy, fs, { font: "display", align: "center" });
        if (isHot) { txt(P.p, s, x + (bw + dep) / 2, vy, fs, { font: "display", align: "center" }); hot = { x, top, v, h, label: d.labels[i] || "" }; }
        txt(P.k, d.labels[i] || "", x + bw / 2 + dep / 2, base + 60 * u, 44 * u, { align: "center", maxW: slot * 0.96, min: 42 * u, weight: 800 });
      }
    });
    if (hot && q > 0.85) {
      // A loose sheet keeps floating down onto the highlighted ream.
      const land = hot.top - rise * 0.5, from = Math.min(land - 60 * u, Math.max(A.y + 30 * u, land - 300 * u));
      const ph = (t % 1.9) / 1.9, fall = eio(ph / 0.85), x0 = hot.x + Math.sin(ph * TAU * 1.3) * 40 * u * (1 - fall), y0 = lerp(from, land, fall);
      const a = clamp((1 - ph) * 6) * clamp(ph * 8);
      push(P, x0 + (bw + dep) / 2, y0, 1, Math.sin(ph * TAU * 1.1) * 0.35 * (1 - fall), a);
      const sh = polyP([[x0, y0], [x0 + dep, y0 - rise], [x0 + bw + dep, y0 - rise], [x0 + bw, y0]]);
      tfill(F, P.y, sh, 0.35, "y"); line(P.k, sh, 3 * u);
      pop(P);
      const sp = new Path2D(), cx = hot.x + bw / 2;
      for (let k = 0; k < 3; k++) { const ang = -Math.PI / 2 + (k - 1) * 0.6, l0 = 128 * u, l1 = l0 + (20 + 14 * Math.sin(t * 6 + k)) * u; sp.moveTo(cx + Math.cos(ang) * l0, hot.top - rise + 40 * u + Math.sin(ang) * l0); sp.lineTo(cx + Math.cos(ang) * l1, hot.top - rise + 40 * u + Math.sin(ang) * l1); }
      line(P.p, sp, 6 * u);
    }
    // The readout: a clipped card taped over a rotating seal.
    const cq = back(seg(q, 0.22, 0.5));
    if (hot && cq > 0) {
      const sx = C.x + C.w - 6 * u, sy = C.y + 4 * u, sr = Math.max(86 * u, Math.min(C.w, C.h) * 0.2), sk = back(seg(q, 0.62, 0.8));
      if (sk > 0) {
        push(P, sx, sy, sk, -0.25 + Math.sin(t * 1.1) * 0.08);
        P.p.fill(sealP(sx, sy, sr, 16, 0.06, t * 0.3));
        line(P.k, sealP(sx, sy, sr, 16, 0.06, t * 0.3), 3 * u);
        txt(P.p, "TOP", sx, sy + 3 * u, 46 * u, { font: "display", align: "center", base: "middle", knock: true });
        pop(P);
      }
      const cx = C.x + C.w / 2, cy = C.y + C.h / 2, rot = (-2.2 + Math.sin(t * 0.9) * 0.8) * Math.PI / 180;
      push(P, cx, cy, 0.86 + 0.14 * cq, rot, clamp(cq * 2));
      const card = rrP(C.x, C.y, C.w, C.h, 10 * u);
      tfill(F, P.y, card, 0.16, "y");
      line(P.k, card, 4.5 * u);
      const tape = polyP([[cx - 90 * u, C.y - 24 * u], [cx + 96 * u, C.y - 30 * u], [cx + 92 * u, C.y + 20 * u], [cx - 86 * u, C.y + 26 * u]]);
      P.y.fill(tape);
      const pad = 40 * u;
      txt(P.k, hot.label, C.x + pad, C.y + (tall ? 92 : 108) * u, 48 * u, { upper: true, track: 0.08, maxW: C.w - pad * 2, min: 42 * u, weight: 800 });
      const nk = lerp(0.22, 1, eo(seg(q, 0.3, 0.85))), num = fmt(hot.v * nk, hot.v, d), ns = Math.min((tall ? 190 : 176) * u, C.h * (tall ? 0.46 : 0.3));
      const ny = tall ? C.y + C.h * 0.74 : C.y + C.h * 0.6;
      const r1 = txt(P.p, num, C.x + pad - 4 * u, ny, ns, { font: "display", maxW: C.w - pad * 2, min: 96 * u });
      txt(P.k, num, C.x + pad - 4 * u, ny, ns, { font: "display", maxW: C.w - pad * 2, min: 96 * u });
      const wav = new Path2D(), wy = ny + 26 * u, ww = Math.max(140 * u, r1.w);
      for (let k = 0; k <= 30; k++) { const xx = C.x + pad + (k / 30) * ww * nk, yy = wy + Math.sin(k * 0.9 + t * 5) * 7 * u; k ? wav.lineTo(xx, yy) : wav.moveTo(xx, yy); }
      line(P.p, wav, 7 * u);
      const others = vals.filter((_, i) => i !== hi);
      if (others.length) {
        const mean = others.reduce((s, v) => s + v, 0) / others.length, pct = mean > 0 ? Math.round(((hot.v - mean) / mean) * 100) : 0;
        const note = `${pct >= 0 ? "+" : "−"}${Math.abs(pct)}% vs the rest`;
        if (tall) txt(P.k, note, C.x + C.w - pad, C.y + (tall ? 92 : 108) * u + 62 * u, 42 * u, { align: "right", maxW: C.w * 0.5, min: 42 * u, weight: 700 });
        else txt(P.k, note, C.x + pad, C.y + C.h - 54 * u, 42 * u, { maxW: C.w - pad * 2, min: 42 * u, weight: 700 });
      }
      pop(P);
    }
  }

  // ---- object: a laptop or phone on the desk, with taped-on labels -----------------------------------
  function screenArt(F, P, X, Y, Wd, Ht, t, kind) {
    const u = F.u, phone = kind === "phone";
    const pv = phone ? { x: X, y: Y, w: Wd, h: Ht * 0.5 } : { x: X, y: Y, w: Wd, h: Ht * 0.56 };
    const pr = rrP(pv.x, pv.y, pv.w, pv.h, 6 * u);
    clipAll(P, pr);
    dots(P.p, pv.x, pv.y, pv.w, pv.h, (x, y) => 0.75 * (1 - (y - pv.y) / pv.h), 10 * u, ANG.p);
    const sunX = pv.x + pv.w * 0.68, sunY = pv.y + pv.h * (0.42 + 0.04 * Math.sin(t * 0.8)), sR = pv.h * 0.2;
    P.y.fill(circP(sunX, sunY, sR));
    const mtn = polyP([[pv.x, pv.y + pv.h], [pv.x, pv.y + pv.h * 0.72], [pv.x + pv.w * 0.22, pv.y + pv.h * 0.44], [pv.x + pv.w * 0.4, pv.y + pv.h * 0.66], [pv.x + pv.w * 0.58, pv.y + pv.h * 0.5], [pv.x + pv.w * 0.84, pv.y + pv.h * 0.8], [pv.x + pv.w, pv.y + pv.h * 0.66], [pv.x + pv.w, pv.y + pv.h]]);
    tfill(F, P.k, mtn, 0.6, "k");
    line(P.k, mtn, 3 * u);
    const cx = pv.x + ((t * 0.07 + 0.2) % 1.3) * pv.w * 1.0 - pv.w * 0.1, cy = pv.y + pv.h * 0.24, cr = pv.h * 0.07;
    const cloud = new Path2D(); cloud.arc(cx, cy, cr, Math.PI * 0.9, Math.PI * 1.95); cloud.arc(cx + cr * 1.3, cy + cr * 0.2, cr * 0.8, Math.PI * 1.2, Math.PI * 2.1); cloud.lineTo(cx - cr, cy + cr * 0.75); cloud.closePath();
    line(P.k, cloud, 3 * u);
    pop(P);
    line(P.k, pr, 3 * u);
    // Tracks with clips; the proposed clip is pink with marching edges, and a playhead runs.
    const ty = pv.y + pv.h + Ht * 0.06, th = (Ht - pv.h - Ht * 0.1) / 3.4, gap = th * 0.2;
    const rows = [[[0, 0.26], [0.29, 0.3, 1], [0.62, 0.38]], [[0.05, 0.42], [0.5, 0.33]]];
    let hotC = null;
    rows.forEach((clips, r) => clips.forEach(([a, w, isHot]) => {
      const cx0 = X + Wd * a, cy0 = ty + r * (th + gap), cw = Wd * w - 5 * u, clip = rrP(cx0, cy0, cw, th, 4 * u);
      if (isHot) { P.p.fill(clip); line(P.k, clip, 3 * u, [10 * u, 7 * u]); hotC = [cx0 + cw / 2, cy0 + th / 2]; P.k.lineDashOffset = 0; }
      else { P.y.fill(clip); line(P.k, clip, 2.5 * u); }
    }));
    const wy = ty + 2 * (th + gap) + th / 2, wave = new Path2D();
    for (let i = 0; i <= 70; i++) { const x = X + (Wd * i) / 70, a = (0.35 + 0.65 * Math.abs(Math.sin(i * 0.37 + 1))) * th * 0.45 * (0.7 + 0.3 * Math.sin(i * 1.7 + t * 6)); wave.moveTo(x, wy - a); wave.lineTo(x, wy + a); }
    line(P.k, wave, 2.4 * u);
    const phx = X + Wd * ((t * 0.12 + 0.18) % 1);
    line(P.k, polyP([[phx, ty - 10 * u], [phx, wy + th * 0.6]], false), 3 * u);
    P.p.fill(polyP([[phx - 9 * u, ty - 18 * u], [phx + 9 * u, ty - 18 * u], [phx, ty - 6 * u]]));
    return [[sunX, sunY], hotC || [X + Wd * 0.4, ty + th / 2], [X + Wd * 0.3, wy]];
  }
  function objectScene(F, P, A, q, d, t) {
    const { u, tall } = F, phone = d.kind === "phone";
    const D = tall ? { x: A.x, y: A.y, w: A.w, h: A.h * 0.56 } : { x: A.x, y: A.y, w: A.w * 0.6, h: A.h };
    let anchors;
    const set = eo(seg(q, 0, 0.3)), sk = back(seg(q, 0.24, 0.42));
    // Desk: a halftone pool of shadow and a mug that keeps steaming.
    const deskY = D.y + D.h * (tall ? 0.94 : 0.9);
    dots(P.p, D.x - 20 * u, deskY - 60 * u, D.w + 40 * u, 120 * u, (x, y) => { const dx = (x - (D.x + D.w / 2)) / (D.w * 0.52), dy = (y - deskY) / (60 * u); const r = dx * dx + dy * dy; return r > 1 ? 0 : 0.5 * (1 - r) * set; }, 10 * u, ANG.p);
    if (phone) {
      const ph = Math.min(D.h * 0.92, D.w * 0.9 / 0.5), pw = ph * 0.5, px = D.x + D.w * 0.42 - pw / 2, py = deskY - ph;
      push(P, px + pw / 2, py + ph, sk);
      const body = rrP(px, py, pw, ph, 40 * u);
      P.y.fill(body); line(P.k, body, 5 * u);
      const scr = rrP(px + 16 * u, py + 50 * u, pw - 32 * u, ph - 100 * u, 14 * u);
      P.y.save(); P.y.globalCompositeOperation = "destination-out"; P.y.fill(scr); P.y.restore();
      line(P.k, scr, 3 * u);
      line(P.k, polyP([[px + pw / 2 - 30 * u, py + 26 * u], [px + pw / 2 + 30 * u, py + 26 * u]], false), 6 * u);
      anchors = screenArt(F, P, px + 30 * u, py + 66 * u, pw - 60 * u, ph - 132 * u, t, "phone");
      pop(P);
    } else {
      const sw = Math.min(D.w * (tall ? 0.74 : 0.8), (D.h * 0.86) / 0.7), sh = sw * 0.62, sx = tall ? D.x + 20 * u : D.x + D.w - sw - 10 * u, sy = deskY - sh - sw * 0.06;
      push(P, sx + sw / 2, deskY, sk);
      const lid = rrP(sx, sy, sw, sh, 22 * u);
      P.y.fill(lid); line(P.k, lid, 5 * u);
      const pad = 22 * u, scr = rrP(sx + pad, sy + pad, sw - pad * 2, sh - pad * 2, 8 * u);
      P.y.save(); P.y.globalCompositeOperation = "destination-out"; P.y.fill(scr); P.y.restore();
      line(P.k, scr, 3 * u);
      const base = polyP([[sx - sw * 0.06, deskY], [sx + sw * 1.06, deskY], [sx + sw, sy + sh], [sx, sy + sh]]);
      tfill(F, P.y, base, 0.6, "y"); tfill(F, P.k, base, 0.18, "k"); line(P.k, base, 5 * u);
      line(P.k, polyP([[sx + sw * 0.42, deskY - 6 * u], [sx + sw * 0.58, deskY - 6 * u]], false), 5 * u);
      anchors = screenArt(F, P, sx + pad + 18 * u, sy + pad + 18 * u, sw - pad * 2 - 36 * u, sh - pad * 2 - 36 * u, t, "laptop");
      // A sticky note on the lid that flutters.
      const nx = sx + sw - 30 * u, ny = sy - 20 * u, flap = Math.sin(t * 3.1) * 0.1;
      push(P, nx, ny, 1, 0.18 + flap);
      const note = rrP(nx - 46 * u, ny - 10 * u, 92 * u, 92 * u, 3 * u);
      P.p.fill(note); line(P.k, note, 3 * u);
      line(P.k, polyP([[nx - 28 * u, ny + 26 * u], [nx + 24 * u, ny + 26 * u]], false), 4 * u);
      line(P.k, polyP([[nx - 28 * u, ny + 48 * u], [nx + 10 * u, ny + 48 * u]], false), 4 * u);
      pop(P);
      pop(P);
    }
    // Mug with steam.
    const mx = tall ? D.x + D.w - 50 * u : D.x + 50 * u, my = deskY, mw = 86 * u, mh = 96 * u;
    if (set > 0.5) {
      const mug = rrP(mx - mw / 2, my - mh, mw, mh, 12 * u);
      tfill(F, P.k, mug, 0.35, "k"); P.y.fill(rrP(mx - mw / 2, my - mh * 0.55, mw, mh * 0.2, 0)); line(P.k, mug, 4.5 * u);
      const handle = new Path2D(); handle.arc(mx + mw / 2, my - mh * 0.55, mh * 0.22, -Math.PI / 2, Math.PI / 2);
      line(P.k, handle, 6 * u);
      for (let k = 0; k < 3; k++) {
        const st = new Path2D(), x0 = mx - mw * 0.25 + k * mw * 0.25;
        for (let j = 0; j <= 16; j++) { const yy = my - mh - 12 * u - j * 6 * u, xx = x0 + Math.sin(j * 0.6 - t * 4 + k * 2) * 8 * u; j ? st.lineTo(xx, yy) : st.moveTo(xx, yy); }
        P.p.save(); P.p.globalAlpha *= 0.8; line(P.p, st, 4 * u); P.p.restore();
      }
    }
    // Labels: each leader marches out to a strip of yellow tape with its words already on it.
    const lx = tall ? A.x + 100 * u : A.x + A.w * 0.66, lw = A.x + A.w - lx - 10 * u;
    (d.callouts || []).forEach((label, i) => {
      if (!label) return;
      const c = seg(q, 0.42 + i * 0.12, 0.6 + i * 0.12);
      if (c <= 0) return;
      const [ax, ay] = anchors[i];
      const ly = tall ? A.y + A.h * (0.66 + i * 0.12) : A.y + A.h * (0.16 + i * 0.32);
      const ex = lx - 56 * u, ey = ly, k1 = eo(seg(c, 0, 0.6));
      const lead = tall ? polyP([[ax, ay], [ax, lerp(ay, ey, 0.5)], [ex, ey]], false) : polyP([[ax, ay], [lerp(ax, ex, 0.75), ey], [ex, ey]], false);
      P.k.save(); P.k.lineDashOffset = -t * 40 * u;
      P.k.globalAlpha *= k1; line(P.k, lead, 3.5 * u, [12 * u, 9 * u]); P.k.restore();
      const pulse = 1 + 0.18 * Math.sin(t * 4 + i * 2);
      P.p.fill(circP(ax, ay, 10 * u * pulse)); line(P.k, circP(ax, ay, 16 * u * pulse), 3 * u);
      const pk = back(seg(c, 0.45, 0.9));
      if (pk <= 0) return;
      push(P, lx, ly, 0.7 + 0.3 * pk, (i % 2 ? 1.4 : -1.2) * Math.PI / 180 + Math.sin(t * 1.2 + i) * 0.01, clamp(pk * 2));
      const fs = 46 * u, tw = Math.min(lw - 120 * u, measure(P.k, label, fs, { weight: 800 }));
      const tape = polyP([[lx - 16 * u, ly - 40 * u], [lx + 76 * u + tw + 26 * u, ly - 44 * u], [lx + 76 * u + tw + 20 * u, ly + 38 * u], [lx - 10 * u, ly + 42 * u]]);
      P.y.fill(tape);
      P.p.fill(circP(lx + 30 * u, ly, 28 * u));
      txt(P.p, String(i + 1), lx + 30 * u, ly + 2 * u, 36 * u, { font: "display", align: "center", base: "middle", knock: true });
      txt(P.k, label, lx + 76 * u, ly + 2 * u, fs, { base: "middle", maxW: lw - 120 * u, min: 42 * u, weight: 800 });
      pop(P);
    });
  }

  // ---- people: the crew, each with their own hair, blink and idle -------------------------------------
  function person(F, P, cx, gy, h, i, t, hot, a) {
    const u = F.u, bob = Math.sin(t * 2.1 + i * 1.7) * 5 * u;
    const headR = h * 0.13, hipY = gy - h * 0.38, shY = gy - h * 0.72 + bob, headY = shY - headR * 1.3, bw = h * 0.36;
    // Legs and shoes.
    const legs = new Path2D();
    legs.moveTo(cx - h * 0.07, hipY); legs.lineTo(cx - h * 0.085, gy - 8 * u); legs.moveTo(cx + h * 0.07, hipY); legs.lineTo(cx + h * 0.085, gy - 8 * u);
    line(P.k, legs, h * 0.055);
    P.k.fill(rrP(cx - h * 0.15, gy - 14 * u, h * 0.11, 14 * u, 7 * u)); P.k.fill(rrP(cx + h * 0.04, gy - 14 * u, h * 0.11, 14 * u, 7 * u));
    // Torso.
    const torso = rrP(cx - bw / 2, shY, bw, hipY - shY + h * 0.05, h * 0.09);
    const look = hot ? 3 : i % 3;
    if (look === 3) P.p.fill(torso);
    else if (look === 0) P.y.fill(torso);
    else if (look === 1) { tfill(F, P.k, torso, 0.5, "k"); P.y.fill(torso); }
    else { tfill(F, P.p, torso, 0.5, "p"); tfill(F, P.y, torso, 0.7, "y"); }
    if (i % 2 === 1 && !hot) {
      const st = new Path2D();
      for (let yy = shY + h * 0.08; yy < hipY; yy += h * 0.06) { st.moveTo(cx - bw / 2 + 4 * u, yy); st.lineTo(cx + bw / 2 - 4 * u, yy); }
      P.k.save(); P.k.clip(torso); line(P.k, st, 3 * u); P.k.restore();
    }
    line(P.k, torso, 4 * u);
    // Arms: one waves for the highlighted person and every third.
    const arm = (sx, sg, wave) => {
      const p = new Path2D(), L1 = h * 0.2, L2 = h * 0.18;
      let a1, a2;
      if (wave) { a1 = -Math.PI / 2 - sg * 0.5; a2 = a1 + sg * (0.3 + 0.45 * Math.sin(t * 7 + i)); }
      else { a1 = Math.PI / 2 + sg * 0.32 + Math.sin(t * 1.6 + i) * 0.06; a2 = a1 - sg * 0.42; }
      const ex = sx + Math.cos(a1) * L1, ey = shY + h * 0.06 + Math.sin(a1) * L1, wx = ex + Math.cos(a2) * L2, wy = ey + Math.sin(a2) * L2;
      p.moveTo(sx, shY + h * 0.06); p.lineTo(ex, ey); p.lineTo(wx, wy);
      line(P.k, p, h * 0.05);
      line(P.k, circP(wx, wy, h * 0.035), 3 * u);
    };
    arm(cx - bw / 2 + 6 * u, 1, false);
    arm(cx + bw / 2 - 6 * u, -1, hot || i % 3 === 2);
    line(P.k, polyP([[cx, shY], [cx, headY + headR]], false), h * 0.05);
    // Head, hair and face.
    const head = circP(cx, headY, headR);
    line(P.k, head, 4 * u);
    const hair = i % 4;
    if (hair === 0) { const p = new Path2D(); p.arc(cx, headY, headR * 1.06, Math.PI * 1.02, Math.PI * 1.98); p.quadraticCurveTo(cx, headY - headR * 0.35, cx - headR * 1.04, headY - headR * 0.05); P.k.fill(p); }
    else if (hair === 1) { P.p.fill(circP(cx, headY - headR * 1.2, headR * 0.42)); const p = new Path2D(); p.arc(cx, headY, headR * 1.05, Math.PI, Math.PI * 2); p.closePath(); P.p.fill(p); line(P.k, circP(cx, headY - headR * 1.2, headR * 0.42), 3 * u); }
    else if (hair === 2) { for (let k = 0; k < 7; k++) { const an = Math.PI * (1.05 + k * 0.15); P.k.fill(circP(cx + Math.cos(an) * headR, headY + Math.sin(an) * headR, headR * 0.3)); } }
    else { P.y.fill(rrP(cx - headR * 1.05, headY - headR * 1.25, headR * 2.1, headR * 0.75, 6 * u)); line(P.k, rrP(cx - headR * 1.05, headY - headR * 1.25, headR * 2.1, headR * 0.75, 6 * u), 3 * u); }
    const blink = ((t + i * 0.77) % 3.3) < 0.13;
    for (const sg of [-1, 1]) {
      const ex = cx + sg * headR * 0.36, ey = headY + headR * 0.05;
      if (blink) line(P.k, polyP([[ex - headR * 0.1, ey], [ex + headR * 0.1, ey]], false), 3 * u); else P.k.fill(circP(ex, ey, headR * 0.09));
    }
    tfill(F, P.p, circP(cx - headR * 0.55, headY + headR * 0.35, headR * 0.17), 0.6, "p");
    tfill(F, P.p, circP(cx + headR * 0.55, headY + headR * 0.35, headR * 0.17), 0.6, "p");
    const mouth = new Path2D(); mouth.arc(cx, headY + headR * 0.22, headR * 0.32, 0.2 * Math.PI, 0.8 * Math.PI);
    line(P.k, mouth, 3 * u);
    if (i % 5 === 3) { line(P.k, circP(cx - headR * 0.36, headY + headR * 0.05, headR * 0.24), 3 * u); line(P.k, circP(cx + headR * 0.36, headY + headR * 0.05, headR * 0.24), 3 * u); }
    return { top: headY - headR * (hair === 1 ? 1.65 : 1.2), headY, headR };
  }
  function peopleScene(F, P, A, q, d, t) {
    const { u, tall } = F;
    const n = Math.max(2, Math.min(6, Math.round(Number(d.count) || 4)));
    const rows = tall && n > 3 ? 2 : 1, per = Math.ceil(n / rows), rowH = A.h / rows;
    const set = eo(seg(q, 0, 0.3));
    // Bunting strung across the top, swaying.
    const by = A.y + 16 * u, sag = 40 * u, nf = tall ? 9 : 14, fw = A.w / nf;
    const str = new Path2D();
    for (let k = 0; k <= 40; k++) { const x = A.x + (k / 40) * A.w, y = by + Math.sin((k / 40) * Math.PI) * sag; k ? str.lineTo(x, y) : str.moveTo(x, y); }
    line(P.k, str, 2.5 * u);
    for (let k = 0; k < nf; k++) {
      const fx = A.x + fw * (k + 0.5), fy = by + Math.sin(((k + 0.5) / nf) * Math.PI) * sag, sw = Math.sin(t * 2 + k * 0.9) * 0.12;
      const g = P[KEYS[k % 3]];
      g.save(); g.translate(fx, fy); g.rotate(sw);
      const flag = polyP([[-fw * 0.36, 0], [fw * 0.36, 0], [0, fw * 0.62 * set]]);
      if (k % 3 === 2) tfill(F, g, flag, 0.55, "k"); else g.fill(flag);
      g.restore();
    }
    for (let r = 0; r < rows; r++) {
      const cnt = r === rows - 1 ? n - per * (rows - 1) : per, gy = A.y + rowH * (r + 1) - (tall ? 30 : 20) * u, slot = A.w / cnt;
      const fh = Math.min(rowH * (tall ? 0.58 : 0.6), slot * 1.45);
      // A spotlight behind each row, and a rug under the feet.
      const cx0 = A.x + A.w / 2, sr = Math.min(A.w * 0.42, rowH * 0.85);
      dots(P.p, cx0 - sr, gy - sr, sr * 2, sr, (x, y) => { const dd = Math.hypot(x - cx0, y - gy) / sr; return dd > 1 ? 0 : 0.55 * (1 - dd) * set * (0.9 + 0.1 * Math.sin(t * 1.5 - dd * 5)); }, 12 * u, ANG.p);
      const rug = new Path2D(); rug.ellipse(cx0, gy, A.w * 0.46 * set, 26 * u, 0, 0, TAU);
      tfill(F, P.y, rug, 0.6, "y"); line(P.k, rug, 3 * u);
      for (let j = 0; j < cnt; j++) {
        const i = r * per + j, cx = A.x + slot * (j + 0.5), hot = i === Math.min(n - 1, d.highlight ?? 1);
        const k = back(seg(q, 0.16 + i * 0.05, 0.38 + i * 0.05));
        if (k <= 0) continue;
        push(P, cx, gy, 0.6 + 0.4 * k, 0, clamp(k * 2.5));
        const hp = person(F, P, cx, gy, fh * (hot ? 1.06 : 1), i, t, hot);
        const label = (d.badges || [])[i];
        if (label) {
          const fs = 44 * u, tw = Math.min(slot - 40 * u, measure(P.k, label, fs, { weight: 800 })), bwd = tw + 44 * u, bh = 70 * u, bx = cx - bwd / 2, byy = hp.top - bh - 34 * u + Math.sin(t * 1.8 + i) * 4 * u;
          const badge = rrP(bx, byy, bwd, bh, bh / 2);
          if (hot) P.p.fill(badge); else P.y.fill(badge);
          line(P.k, badge, 3.5 * u);
          line(P.k, polyP([[cx - 10 * u, byy + bh], [cx, byy + bh + 18 * u], [cx + 10 * u, byy + bh]], false), 3.5 * u);
          txt(P.k, label, cx, byy + bh / 2 + 2 * u, fs, { align: "center", base: "middle", maxW: slot - 40 * u, min: 42 * u, weight: 800 });
        } else {
          // No role given: a small heart bubble instead.
          const hx = cx + hp.headR * 1.6, hy = hp.top - 20 * u + Math.sin(t * 2.4 + i) * 8 * u, hs = 20 * u;
          const heart = new Path2D(); heart.moveTo(hx, hy + hs); heart.bezierCurveTo(hx - hs * 1.6, hy - hs * 0.2, hx - hs * 0.6, hy - hs * 1.3, hx, hy - hs * 0.4); heart.bezierCurveTo(hx + hs * 0.6, hy - hs * 1.3, hx + hs * 1.6, hy - hs * 0.2, hx, hy + hs);
          P.p.fill(heart); line(P.k, heart, 3 * u);
        }
        pop(P);
      }
    }
  }

  // ---- process: three stations on a paper ribbon, sheets travelling through ---------------------------
  function stationIcon(F, P, kind, cx, cy, R, t) {
    const u = F.u, lw = Math.max(5 * u, R * 0.07);
    if (kind === 0) {
      const ox = Math.cos(t * 1.8) * R * 0.1, oy = Math.sin(t * 1.8) * R * 0.08, lx = cx - R * 0.1 + ox, ly = cy - R * 0.1 + oy;
      tfill(F, P.p, circP(lx, ly, R * 0.3), 0.4, "p");
      line(P.k, circP(lx, ly, R * 0.3), lw);
      line(P.k, polyP([[lx + R * 0.22, ly + R * 0.22], [lx + R * 0.48, ly + R * 0.48]], false), lw * 1.6);
    } else if (kind === 1) {
      const ph = (t * 0.6) % 1, wx = cx - R * 0.42, wy = cy + R * 0.36, sq = new Path2D();
      for (let k = 0; k <= 30 * ph; k++) { const x = wx + (k / 30) * R * 0.84, y = wy + Math.sin(k * 0.7) * R * 0.05; k ? sq.lineTo(x, y) : sq.moveTo(x, y); }
      line(P.k, sq, lw * 0.6);
      const tipX = wx + ph * R * 0.84, tipY = wy + Math.sin(30 * ph * 0.7) * R * 0.05;
      const g = P.k;
      push(P, tipX, tipY, 1, -0.75);
      const body = polyP([[tipX, tipY], [tipX + R * 0.1, tipY - R * 0.12], [tipX + R * 0.1, tipY - R * 0.72], [tipX - R * 0.1, tipY - R * 0.72], [tipX - R * 0.1, tipY - R * 0.12]]);
      P.p.fill(body); line(g, body, lw * 0.7);
      line(g, polyP([[tipX - R * 0.1, tipY - R * 0.12], [tipX + R * 0.1, tipY - R * 0.12]], false), lw * 0.5);
      P.y.fill(rrP(tipX - R * 0.1, tipY - R * 0.86, R * 0.2, R * 0.14, 3 * u));
      pop(P);
    } else {
      const box = rrP(cx - R * 0.36, cy - R * 0.36, R * 0.72, R * 0.72, R * 0.12);
      P.y.fill(box); line(P.k, box, lw);
      const s = 1 + 0.06 * Math.sin(t * 3.4);
      push(P, cx, cy, s);
      line(P.k, polyP([[cx - R * 0.2, cy], [cx - R * 0.04, cy + R * 0.17], [cx + R * 0.26, cy - R * 0.2]], false), lw * 1.3);
      pop(P);
    }
  }
  function processScene(F, P, A, q, d, t) {
    const { u, tall, W, H } = F, steps = (d.steps || []).slice(0, 3), n = Math.max(1, steps.length);
    const R = tall ? Math.min((A.h / n) * 0.3, A.w * 0.2) : Math.min((A.w / n) * 0.3, A.h * 0.27);
    const st = steps.map((_, i) => (tall ? { x: A.x + A.w * 0.24, y: A.y + (A.h * (i + 0.5)) / n } : { x: A.x + (A.w * (i + 0.5)) / n, y: A.y + A.h * 0.4 }));
    // The ribbon: from off the sheet, through every station, and off again.
    const amp = R * 0.5;
    const pts = tall ? [[st[0].x, -40 * u], ...st.map((s) => [s.x, s.y]), [st[0].x, H + 40 * u]] : [[-40 * u, st[0].y], ...st.map((s) => [s.x, s.y]), [W + 40 * u, st[0].y]];
    const ribbon = (v) => {
      const f = v * (pts.length - 1), k = Math.min(pts.length - 2, Math.floor(f)), m = f - k, a = pts[k], b = pts[k + 1], w = Math.sin(m * Math.PI) * amp * (k % 2 ? -1 : 1);
      return tall ? [lerp(a[0], b[0], m) + w, lerp(a[1], b[1], m)] : [lerp(a[0], b[0], m), lerp(a[1], b[1], m) + w];
    };
    const C = sampler(ribbon, 220), rw = 40 * u, shown = eo(seg(q, 0.12, 0.7));
    const strip = band(C, 0, C.L * Math.max(0.02, shown), rw / 2, -rw / 2, 6 * u);
    tfill(F, P.p, strip, 0.55, "p");
    const edges = (off) => { const p = new Path2D(); for (let s = 0; s <= C.L * shown; s += 8 * u) { const a = C.at(s); s ? p.lineTo(a.x + a.nx * off, a.y + a.ny * off) : p.moveTo(a.x + a.nx * off, a.y + a.ny * off); } return p; };
    line(P.k, edges(rw / 2), 3 * u); line(P.k, edges(-rw / 2), 3 * u);
    // Sheets riding the ribbon: blank before the first station, marked pink after the second, ticked after the third.
    const stS = st.map((s) => { let best = 0, bd = 1e9; for (let k = 0; k <= 200; k++) { const a = C.at((C.L * k) / 200), dd = Math.hypot(a.x - s.x, a.y - s.y); if (dd < bd) { bd = dd; best = (C.L * k) / 200; } } return best; });
    if (shown > 0.95) {
      for (let k = 0; k < 7; k++) {
        const s = ((t * 120 * u + (k * C.L) / 7) % C.L), a = C.at(s);
        if (stS.some((ss) => Math.abs(ss - s) < R * 1.05)) continue;
        const passed = stS.filter((ss) => s > ss).length, sw = 52 * u, sh = 66 * u, rot = Math.atan2(a.ny, a.nx) + Math.PI / 2 + Math.sin(t * 3 + k) * 0.1;
        push(P, a.x, a.y, 1, rot);
        const sheet = rrP(a.x - sw / 2, a.y - sh / 2, sw, sh, 3 * u);
        P.p.save(); P.p.globalCompositeOperation = "destination-out"; P.p.fill(sheet); P.p.restore();
        line(P.k, sheet, 3 * u);
        const ln = new Path2D(); for (let j = 0; j < 3; j++) { ln.moveTo(a.x - sw * 0.3, a.y - sh * 0.22 + j * sh * 0.18); ln.lineTo(a.x + sw * (j === 2 ? 0.05 : 0.3), a.y - sh * 0.22 + j * sh * 0.18); }
        if (passed >= 1) line(P.k, ln, 2.5 * u);
        if (passed >= 2) P.p.fill(polyP([[a.x + sw / 2, a.y - sh / 2], [a.x + sw / 2, a.y - sh / 2 + 22 * u], [a.x + sw / 2 - 22 * u, a.y - sh / 2]]));
        if (passed >= 3) line(P.k, polyP([[a.x - sw * 0.18, a.y + sh * 0.25], [a.x - sw * 0.02, a.y + sh * 0.38], [a.x + sw * 0.26, a.y + sh * 0.12]], false), 4 * u);
        pop(P);
      }
    }
    steps.forEach((label, i) => {
      const k = back(seg(q, 0.18 + i * 0.1, 0.4 + i * 0.1));
      if (k <= 0) return;
      const { x, y } = st[i], last = i === n - 1;
      push(P, x, y, 0.5 + 0.5 * k, 0, clamp(k * 2.5));
      const disc = circP(x, y, R);
      for (const g of [P.p, P.k]) { g.save(); g.globalCompositeOperation = "destination-out"; g.fill(circP(x, y, R + 4 * u)); g.restore(); }
      if (last) P.p.fill(disc);
      else if (i === 1) { P.y.fill(disc); tfill(F, P.p, disc, 0.3, "p"); }
      else P.y.fill(disc);
      dots(P.y, x - R * 1.35, y - R * 1.35, R * 2.7, R * 2.7, (xx, yy) => { const dd = Math.hypot(xx - x, yy - y) / R; return dd < 1.04 || dd > 1.35 ? 0 : (1.35 - dd) * 2.4; }, 10 * u, ANG.y);
      line(P.k, disc, 5 * u);
      P.k.save(); P.k.lineDashOffset = t * 30 * u * (i % 2 ? -1 : 1); line(P.k, circP(x, y, R * 0.86), 2.5 * u, [10 * u, 10 * u]); P.k.restore();
      stationIcon(F, P, last ? 2 : i, x, y, R, t);
      const bx = x - R * 0.78, byy = y - R * 0.78, br = Math.max(34 * u, R * 0.28);
      P.k.fill(circP(bx, byy, br));
      txt(P.k, String(i + 1), bx, byy + 3 * u, br * 1.25, { font: "display", align: "center", base: "middle", knock: true });
      if (tall) txt(P.k, label, x + R + 44 * u, y + 2 * u, 48 * u, { base: "middle", maxW: A.x + A.w - (x + R + 44 * u), min: 42 * u, weight: 800 });
      else txt(P.k, label, x, y + R + 84 * u, 48 * u, { align: "center", maxW: (A.w / n) * 0.94, min: 42 * u, weight: 800 });
      pop(P);
    });
  }

  // ---- compare: two cards; units stamp in to each value ----------------------------------------------
  function compareScene(F, P, A, q, d, t) {
    const { u, tall } = F;
    const vals = [Number(d.leftValue) || 0, Number(d.rightValue) || 0], labels = [d.left || "", d.right || ""], mx = Math.max(...vals, 1);
    const gap = tall ? 110 * u : 150 * u, cw = tall ? A.w : (A.w - gap) / 2, ch = tall ? (A.h - gap) / 2 : A.h * 0.94;
    const scale = mx > 16 ? 16 / mx : 1;
    [0, 1].forEach((i) => {
      const k = back(seg(q, 0.16 + i * 0.08, 0.38 + i * 0.08));
      if (k <= 0) return;
      const x = tall ? A.x : A.x + i * (cw + gap), y = tall ? A.y + i * (ch + gap) : A.y + (A.h - ch) / 2, cx = x + cw / 2, cy = y + ch / 2;
      push(P, cx, cy, 0.8 + 0.2 * k, ((i ? 1.3 : -1.3) + Math.sin(t * 0.9 + i * 2) * 0.6) * Math.PI / 180, clamp(k * 2.5));
      const card = rrP(x, y, cw, ch, 12 * u), hh = 92 * u, head = rrP(x, y, cw, hh, 12 * u);
      if (i) P.y.fill(card); else tfill(F, P.k, card, 0.16, "k");
      const hg = i ? P.p : P.k;
      hg.fill(head);
      if (i) P.y.save(), P.y.globalCompositeOperation = "destination-out", P.y.fill(head), P.y.restore();
      txt(hg, labels[i], x + 34 * u, y + hh / 2 + 3 * u, 50 * u, { base: "middle", upper: true, track: 0.06, maxW: cw - 68 * u - (i ? 150 * u : 0), min: 42 * u, weight: 800, knock: true });
      line(P.k, card, 4.5 * u);
      const nk = lerp(0.2, 1, eo(seg(q, 0.3 + i * 0.08, 0.8 + i * 0.08))), num = fmt(vals[i] * nk, vals[i], d);
      const ns = Math.min(tall ? 220 * u : 250 * u, ch * (tall ? 0.42 : 0.38)), ny = y + hh + 30 * u + ns * 0.9;
      const nmax = cw - 68 * u - Math.min(cw * 0.26, ch * 0.27) * 2 - 70 * u;
      if (i) txt(P.p, num, x + 34 * u, ny, ns, { font: "display", maxW: nmax, min: 96 * u });
      txt(P.k, num, x + 34 * u, ny, ns, { font: "display", maxW: nmax, min: 96 * u });
      // A dial on the card reads the value against the larger of the two; its needle never quite settles.
      const gr = Math.min(cw * 0.26, ch * 0.27), gx = x + cw - gr - 60 * u, gy = y + hh + 50 * u + gr * 1.05, frac = (vals[i] / mx) * nk;
      const arcP = (r0, r1, f) => { const pth = new Path2D(); pth.arc(gx, gy, r1, Math.PI, Math.PI * (1 + f)); pth.arc(gx, gy, r0, Math.PI * (1 + f), Math.PI, true); pth.closePath(); return pth; };
      tfill(F, i ? P.p : P.k, arcP(gr * 0.62, gr, 1), 0.3, i ? "p" : "k");
      if (frac > 0.005) { if (i) P.p.fill(arcP(gr * 0.62, gr, frac)); else tfill(F, P.k, arcP(gr * 0.62, gr, frac), 0.8, "k"); }
      line(P.k, arcP(gr * 0.62, gr, 1), 3.5 * u);
      const tk = new Path2D();
      for (let j = 0; j <= 10; j++) { const an = Math.PI * (1 + j / 10); tk.moveTo(gx + Math.cos(an) * gr * 1.06, gy + Math.sin(an) * gr * 1.06); tk.lineTo(gx + Math.cos(an) * gr * (j % 5 ? 1.13 : 1.2), gy + Math.sin(an) * gr * (j % 5 ? 1.13 : 1.2)); }
      line(P.k, tk, 3 * u);
      const na = Math.PI * (1 + clamp(frac + Math.sin(t * 5 + i * 2) * 0.012 + Math.sin(t * 1.3 + i) * 0.02, 0, 1));
      line(P.k, polyP([[gx, gy], [gx + Math.cos(na) * gr * 0.9, gy + Math.sin(na) * gr * 0.9]], false), 8 * u);
      P.y.fill(circP(gx, gy, 20 * u)); line(P.k, circP(gx, gy, 20 * u), 4 * u);
      // Units: one stamp per count, in rows along the foot of the card.
      const units = Math.max(0, Math.round(vals[i] * scale)), us = Math.min(64 * u, (cw - 68 * u) / 9 - 12 * u), perRow = Math.max(1, Math.floor((cw - 68 * u) / (us + 12 * u)));
      const rowsU = Math.ceil(units / perRow), uy0 = y + ch - 40 * u - rowsU * (us + 12 * u);
      const lit = Math.floor(t * 3) % Math.max(1, units);
      for (let j = 0; j < units; j++) {
        const sk = back(seg(q, 0.5 + i * 0.12 + (j / Math.max(1, units)) * 0.3, 0.56 + i * 0.12 + (j / Math.max(1, units)) * 0.3));
        if (sk <= 0) continue;
        const ux = x + 34 * u + (j % perRow) * (us + 12 * u) + us / 2, uy = uy0 + Math.floor(j / perRow) * (us + 12 * u) + us / 2, pul = j === lit && q > 0.9 ? 1.15 : 1;
        push(P, ux, uy, sk * pul, (hash(j + i * 31) - 0.5) * 0.3);
        const sq = rrP(ux - us / 2, uy - us / 2, us, us, 6 * u);
        if (i) P.p.fill(sq); else tfill(F, P.k, sq, 0.55, "k");
        line(P.k, sq, 3 * u);
        P.y.fill(circP(ux, uy, us * 0.2));
        pop(P);
      }
      pop(P);
      // The change, as a sticker on the second card.
      if (i === 1 && vals[0] > 0) {
        const sk2 = back(seg(q, 0.78, 0.95));
        if (sk2 > 0) {
          const pct = Math.round(((vals[1] - vals[0]) / vals[0]) * 100), sx = x + cw - 70 * u, sy = y + 30 * u, sr = 84 * u;
          push(P, sx, sy, sk2, -0.2 + Math.sin(t * 1.3) * 0.08);
          P.k.fill(sealP(sx, sy, sr, 14, 0.06, t * 0.5));
          txt(P.k, `${pct >= 0 ? "+" : "−"}${Math.abs(pct)}%`, sx, sy + 3 * u, 46 * u, { font: "display", align: "center", base: "middle", knock: true, maxW: sr * 1.6 });
          pop(P);
        }
      }
    });
    // The arrow between them nudges forward.
    const ak = back(seg(q, 0.45, 0.62));
    if (ak > 0) {
      const ax = tall ? A.x + A.w / 2 : A.x + cw + gap / 2, ay = tall ? A.y + ch + gap / 2 : A.y + A.h / 2, nud = Math.sin(t * 3.2) * 8 * u, s = 46 * u;
      push(P, ax + (tall ? 0 : nud), ay + (tall ? nud : 0), ak, tall ? Math.PI / 2 : 0);
      const arr = polyP([[ax - s, ay - s * 0.36], [ax + s * 0.1, ay - s * 0.36], [ax + s * 0.1, ay - s * 0.8], [ax + s, ay], [ax + s * 0.1, ay + s * 0.8], [ax + s * 0.1, ay + s * 0.36], [ax - s, ay + s * 0.36]]);
      P.p.fill(arr); line(P.k, arr, 4.5 * u);
      pop(P);
    }
  }

  // ---- registration ---------------------------------------------------------------------------------
  const DRAW = { chart: chartScene, object: objectScene, people: peopleScene, process: processScene, compare: compareScene };
  function wrap(id) {
    return (ctx, S, box, p, d, info) => {
      const F = frame(S, info), leaving = info.exit !== undefined, P = begin(F), A = area(F, id, box);
      // The roller pass is the arrival, so the drawing is mostly built by the time the ink lands on it.
      const build = lerp(0.55, 1, clamp(info.local / Math.max(1, info.hold * 0.5)));
      DRAW[id](F, P, A, leaving ? 1 : build, d, info.t);
      comp(ctx, F, P, printState(info, CUR.index, Boolean(CUR.next)));
    };
  }
  function statement(ctx, F, id, local, hold, idx, hasNext, exit) {
    const P = begin(F), reg = freeRegion(F, id === "title" ? ["kicker", "title"] : ["closing"]);
    const k = exit !== undefined ? 1 : idx > 0 ? 0.5 + 0.5 * clamp(local / 1.2) : 0.3 + 0.7 * clamp(local / 1.3);
    if (id === "title") titleArt(F, P, reg, k, F.t); else closingArt(F, P, reg, k, F.t, exit !== undefined ? hold : local);
    comp(ctx, F, P, printState({ local, hold, change: F.info.change, exit }, idx, hasNext));
  }

  const INKS = { paper: "#f4ecda", y: "#ffd800", k: "#2d4ea3", blend: "multiply" };
  const shadow = (accent) => `0.045em 0.04em 0 ${hexA(accent, 0.92)}`;
  return {
    bg: "#f4ecda", panel: "rgba(255,216,0,0.32)", ink: "#2d4ea3", muted: "#5d6fae", accent: "#ff3d8e", onAccent: "#fff8ea",
    rule: "rgba(45,78,163,0.75)", track: "rgba(45,78,163,0.14)",
    display: DISPLAY, displayWeight: 700, displayCase: "none", displayTracking: "-0.01em",
    body: LABEL, bodyWeight: 700, figures: DISPLAY, radius: 12,
    motion: "wipe", change: "grid",
    kit: { line: 3.5, fill: "solid", panel: "outline" },
    panelEdge: "rgba(45,78,163,0.8)",
    inks: INKS,
    keepArt: true,
    overlap: true,
    // Headlines set straight on this look's backdrop, where its ink and accent (meant for panels) do not read.
    displayAccent: { original: "#bf2e6b", light: "#007a74" },
    palettes: {
      // Bright: teal and sunflower on white stock. Night: fluorescent inks on black stock. Mono: one black drum.
      light: { bg: "#fbfaf5", panel: "rgba(255,190,30,0.3)", ink: "#3a2a86", muted: "#6b5fa6", accent: "#00a39a", onAccent: "#ffffff", rule: "rgba(58,42,134,0.7)", track: "rgba(58,42,134,0.12)", panelEdge: "rgba(58,42,134,0.7)",
        inks: { paper: "#fbfaf5", y: "#ffbf1f", k: "#3a2a86", blend: "multiply" }, backdrop: () => "#fbfaf5" },
      dark: { bg: "#17182b", panel: "rgba(255,225,77,0.18)", ink: "#f4f1ff", muted: "#b9b6d8", accent: "#ff5fae", onAccent: "#17182b", rule: "rgba(244,241,255,0.7)", track: "rgba(244,241,255,0.14)", panelEdge: "rgba(244,241,255,0.6)",
        inks: { paper: "#17182b", y: "#e9c937", k: "#8fd3ff", blend: "screen" }, backdrop: () => "#17182b" },
      mono: { bg: "#f1eee6", panel: "rgba(30,30,30,0.08)", ink: "#1f1f1f", muted: "#5a5853", accent: "#6d6a64", onAccent: "#f1eee6", rule: "rgba(31,31,31,0.7)", track: "rgba(31,31,31,0.1)", panelEdge: "rgba(31,31,31,0.6)",
        inks: { paper: "#f1eee6", y: "#cfcac0", k: "#1f1f1f", blend: "multiply" }, backdrop: () => "#f1eee6" },
    },
    textShadow: shadow,
    backdrop: () => "#f4ecda",
    css: (accent, look) => {
      const blend = (look.inks && look.inks.blend) || "multiply";
      return `#root .display { mix-blend-mode: ${blend}; }
      #root .kicker { align-self: flex-start; display: inline-block; mix-blend-mode: ${blend}; color: ${accent}; text-shadow: none; letter-spacing: 0.16em; font-weight: 800;
        border: 0.14em solid ${accent}; border-radius: 0.25em; padding: 0.32em 0.8em 0.26em; rotate: -2.2deg; }`;
    },
    // The texture pass sits over everything: paper showing through the ink, boiling with the frame.
    paintOver: true,
    paint: (ctx, W, H, t, accent, look) => {
      ctx.clearRect(0, 0, W, H);
      const step = Math.floor(t * 8), pat = speckPat((look.inks || INKS).paper);
      pat.setTransform(new DOMMatrix([1, 0, 0, 1, Math.floor(hash(step * 3 + 91) * 384), Math.floor(hash(step * 5 + 37) * 384)]));
      ctx.globalAlpha = 0.85; ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    },
    stage(ctx, S, info) {
      CUR = { index: info.index, next: info.next, scene: info.scene };
      const F = frame(S, info);
      if (S.paint) {
        paper(ctx, F);
        const P = begin(F);
        world(F, P);
        comp(ctx, F, P, {});
      }
      const pl = plan();
      // A statement scene has no drawer, so its art crosses out here as the next scene prints in.
      if (pl && info.index > 0 && info.local < info.change) {
        const prev = pl.shown[info.index - 1];
        if (prev && (prev.id === "title" || prev.id === "closing")) statement(ctx, F, prev.id, prev.hold + info.local, prev.hold, info.index - 1, true, clamp(info.local / Math.max(0.01, info.change)));
      }
      if (info.scene === "title" || info.scene === "closing") statement(ctx, F, info.scene, info.local, info.hold, info.index, Boolean(info.next));
    },
    scenes: { chart: wrap("chart"), object: wrap("object"), people: wrap("people"), process: wrap("process"), compare: wrap("compare") },
  };
});
