// Holo Foil: a pearlescent collector's sheet. Every drawing is a die-cut sticker, ticket or stamp in
// cracked-ice holographic foil: each shard catches a slowly tilting light at its own angle, so the
// rainbow slides across the foil; glints flare, glitter twinkles, raised rims are embossed and a prism
// streak rakes the sheet at every change. Scenes turn in and out like cards flipped in the light.
// Every frame is a pure function of time: seeded noise only, no clocks.
window.DreamcutMotion.register("holo-foil", ({ grain, rng }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const fract = (v) => v - Math.floor(v);

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

  const FOIL = ["#ff6fbf", "#ffad6b", "#ffe86e", "#72f7c2", "#62d6ff", "#9d7dff"];
  function theme(S) {
    const L = S.look;
    const bg = rgb(L.bg);
    const dark = lum(bg) < 110;
    return {
      dark, u: S.u, tex: L.texture ?? 1, ink: L.ink, inkC: rgb(L.ink), muted: L.muted, acc: rgb(S.accent), accS: S.accent,
      foil: (L.foil || FOIL).map(rgb), sat: L.foilSat ?? 1, paper: L.paperColor || "#ffffff", plateInk: "#1d1a33", plateMuted: "rgba(29,26,51,0.62)",
      shadow: dark ? "rgba(0,0,0,0.55)" : "rgba(64,48,120,0.24)", ground: (L.ground || ["#f3f1f8", "#ebe8f2", "#f4eef3"]).map(rgb),
      line: dark ? "rgba(255,255,255,0.07)" : "rgba(40,30,90,0.07)",
    };
  }

  // ---- buffers ------------------------------------------------------------------------------------
  const POOL = {};
  function cv(key, w, h) {
    let c = POOL[key];
    if (!c) c = POOL[key] = document.createElement("canvas");
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return c;
  }
  function mk(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }

  // Cracked ice: a wrapping Voronoi tile. Shards fall into six facing groups (one mask each), each shard
  // carries a brightness ramp along its own direction (facets), and the borders between shards are cracks.
  let SH = null;
  function shards() {
    if (SH) return SH;
    const T = 220, N = 54, r = rng(30);
    const seeds = [];
    for (let i = 0; i < N; i++) seeds.push({ x: r() * T, y: r() * T, k: Math.floor(r() * 6), a: r() * TAU });
    const masks = [], mdat = [];
    for (let k = 0; k < 6; k++) { const c = mk(T, T); masks.push(c); mdat.push(c.getContext("2d").createImageData(T, T)); }
    const facet = mk(T, T), fd = facet.getContext("2d").createImageData(T, T);
    const crack = mk(T, T), cd = crack.getContext("2d").createImageData(T, T);
    const offs = [-T, 0, T];
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      let d1 = 1e9, d2 = 1e9, best = null, bx = 0, by = 0;
      for (const s of seeds) for (const ox of offs) for (const oy of offs) {
        const dx = x - (s.x + ox), dy = y - (s.y + oy), d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; d1 = d; best = s; bx = dx; by = dy; } else if (d < d2) d2 = d;
      }
      const i = (y * T + x) * 4;
      const m = mdat[best.k].data; m[i] = m[i + 1] = m[i + 2] = 255; m[i + 3] = 255;
      const v = clamp(0.5 + (bx * Math.cos(best.a) + by * Math.sin(best.a)) / 34) * 255;
      fd.data[i] = fd.data[i + 1] = fd.data[i + 2] = v; fd.data[i + 3] = 255;
      const edge = Math.sqrt(d2) - Math.sqrt(d1);
      cd.data[i] = 30; cd.data[i + 1] = 20; cd.data[i + 2] = 60; cd.data[i + 3] = edge < 1.7 ? 255 * (1 - edge / 1.7) : 0;
    }
    masks.forEach((c, k) => c.getContext("2d").putImageData(mdat[k], 0, 0));
    facet.getContext("2d").putImageData(fd, 0, 0);
    crack.getContext("2d").putImageData(cd, 0, 0);
    return (SH = { T, masks, facet, crack });
  }

  // Per-frame state: time, and an extra tilt while a piece is turning (the rainbow races across it).
  const F = { t: 0, boost: 0, scene: null, view: 0, back: false, W: 1920, next: null, index: 0, local: 0, hold: 0, ch: 0.45 };
  let PATS = null;

  // A repeating rainbow along angle `ang`, slid by `off` periods.
  function rainbow(c, w, h, ang, off, stops, ox = 0, oy = 0) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const L = (Math.abs(dx) * w + Math.abs(dy) * h) / 2 + 2;
    const per = Math.max(40, L * 0.95);
    const shift = fract(off) * per;
    const span = 2 * L + 2 * per;
    const x0 = ox + w / 2 - dx * (L + per) + dx * shift, y0 = oy + h / 2 - dy * (L + per) + dy * shift;
    const g = c.createLinearGradient(x0, y0, x0 + dx * span, y0 + dy * span);
    const n = stops.length;
    for (let cyc = 0; cyc * per <= span + per; cyc++) {
      for (let j = 0; j < n; j++) {
        const at = (cyc * per + (j / n) * per) / span;
        if (at >= 0 && at <= 1) g.addColorStop(at, rgba(stops[j]));
      }
    }
    return g;
  }

  // Render a patch of foil (w by h, in drawing units) into a scratch canvas and return it.
  function foilBuf(S, th, w, h, o = {}) {
    const k = o.res ?? 0.5;
    const bw = Math.max(2, Math.ceil(w * k)), bh = Math.max(2, Math.ceil(h * k));
    const A = cv("fa", bw, bh), B = cv("fb", bw, bh);
    const a = A.getContext("2d"), b = B.getContext("2d");
    const sh = shards();
    if (!PATS) PATS = { m: sh.masks.map((m) => b.createPattern(m, "repeat")), f: b.createPattern(sh.facet, "repeat"), c: b.createPattern(sh.crack, "repeat") };
    const seed = o.seed || 0, t = F.t;
    // View-dependent: where the piece sits on screen (and how it is turning) shifts its rainbow.
    const tilt = (o.tilt ?? 0) + F.boost + F.view * 0.9 + Math.sin(t * 0.9 + seed * 1.7) * 0.42 + t * 0.75;
    const sc = k * S.u * (o.shard ?? 1);
    const mtx = new DOMMatrix().translateSelf(((seed * 53) % 220) * sc, ((seed * 91) % 220) * sc).scaleSelf(sc, sc);
    a.globalCompositeOperation = "source-over"; a.globalAlpha = 1;
    a.fillStyle = rgba(mix(th.foil[2], th.foil[4], 0.5)); a.fillRect(0, 0, bw, bh);
    const ang = (o.angle ?? -0.75) + Math.sin(t * 0.5 + seed * 0.7) * 0.28;
    for (let i = 0; i < 6; i++) {
      b.globalCompositeOperation = "source-over"; b.clearRect(0, 0, bw, bh);
      const pat = PATS.m[i]; pat.setTransform(mtx);
      b.fillStyle = pat; b.fillRect(0, 0, bw, bh);
      b.globalCompositeOperation = "source-in";
      b.fillStyle = rainbow(b, bw, bh, ang + (i - 2.5) * 0.24, tilt * (0.75 + i * 0.1) + i * 0.137 + (o.hue || 0), th.foil);
      b.fillRect(0, 0, bw, bh);
      a.drawImage(B, 0, 0);
    }
    b.globalCompositeOperation = "source-over";
    // A smooth iridescent wash over the shards, sliding faster than they do: the colour flows rather
    // than sitting in tiles.
    a.globalCompositeOperation = "source-over"; a.globalAlpha = 0.42;
    a.fillStyle = rainbow(a, bw, bh, ang + 1.1, tilt * 1.35 + 0.3, th.foil); a.fillRect(0, 0, bw, bh);
    PATS.f.setTransform(mtx); a.globalCompositeOperation = "overlay"; a.globalAlpha = 0.32; a.fillStyle = PATS.f; a.fillRect(0, 0, bw, bh);
    PATS.c.setTransform(mtx); a.globalCompositeOperation = "multiply"; a.globalAlpha = 0.28; a.fillStyle = PATS.c; a.fillRect(0, 0, bw, bh);
    const sat = (o.sat ?? 1) * th.sat;
    // Silver pieces: a cool polished base swamps the shard mottle, so the banded reflections read as metal.
    if (sat < 0.9) {
      const sg = a.createLinearGradient(0, 0, bw * 0.4, bh);
      sg.addColorStop(0, "#f4f6fb"); sg.addColorStop(0.45, "#aeb3c2"); sg.addColorStop(0.55, "#d9dce6"); sg.addColorStop(1, "#8d92a3");
      a.globalCompositeOperation = "source-over"; a.globalAlpha = 0.62 * (1 - sat); a.fillStyle = sg; a.fillRect(0, 0, bw, bh);
    }
    if (sat < 1) { a.globalCompositeOperation = "saturation"; a.globalAlpha = 1 - sat; a.fillStyle = "#808080"; a.fillRect(0, 0, bw, bh); }
    // Metal: the foil mirrors a banded room, dark and bright bands that slide as the light moves.
    {
      const ea = ang - 0.5, dx = Math.cos(ea), dy = Math.sin(ea), L = Math.abs(dx) * bw + Math.abs(dy) * bh;
      const off = fract(tilt * (0.45 + 0.35 * (1 - sat)) + seed * 0.13);
      const x0 = bw / 2 - dx * L, y0 = bh / 2 - dy * L;
      const eg = a.createLinearGradient(x0, y0, x0 + dx * L * 2, y0 + dy * L * 2);
      const env = [0.15, 0.85, 0.35, 1, 0.1, 0.7, 0.3, 0.95];
      for (let j = 0; j <= 16; j++) { const v = env[(j + Math.floor(off * 8)) % 8] * (1 - fract(off * 8)) + env[(j + 1 + Math.floor(off * 8)) % 8] * fract(off * 8); const g = v * 255 | 0; eg.addColorStop(j / 16, `rgb(${g},${g},${g})`); }
      a.globalCompositeOperation = "overlay"; a.globalAlpha = (th.dark ? 0.5 : 0.42) + 0.4 * (1 - sat); a.fillStyle = eg; a.fillRect(0, 0, bw, bh);
    }
    // Diffraction grating: hair-fine embossed lines at the piece's own angle.
    if (!PATS.g) {
      const gc = mk(2, 6), gx2 = gc.getContext("2d");
      gx2.fillStyle = "rgba(255,255,255,0.9)"; gx2.fillRect(0, 0, 2, 1);
      gx2.fillStyle = "rgba(20,10,60,0.55)"; gx2.fillRect(0, 2, 2, 1);
      gx2.fillStyle = "rgba(255,255,255,0.4)"; gx2.fillRect(0, 4, 2, 1);
      PATS.g = b.createPattern(gc, "repeat");
    }
    PATS.g.setTransform(new DOMMatrix().rotateSelf(((seed * 37) % 60) - 30 + 45).scaleSelf(Math.max(1, k * S.u * 1.6)));
    a.globalCompositeOperation = "overlay"; a.globalAlpha = (0.18 + 0.22 * th.tex) * (o.grain ?? 1); a.fillStyle = PATS.g; a.fillRect(0, 0, bw, bh);
    a.globalCompositeOperation = "screen"; a.globalAlpha = (th.dark ? 0.03 : 0.08) * (o.lift ?? 1); a.fillStyle = "#ffffff"; a.fillRect(0, 0, bw, bh);
    // Glare band: travels with the tilt, so a turning piece flashes.
    const gp = fract(tilt * 0.33 + seed * 0.21);
    const gx = -bh + gp * (bw + bh * 2);
    const gg = a.createLinearGradient(gx - bh * 0.35, 0, gx + bh * 0.35, bh);
    gg.addColorStop(0, "rgba(255,255,255,0)"); gg.addColorStop(0.5, "rgba(255,255,255,0.75)"); gg.addColorStop(1, "rgba(255,255,255,0)");
    a.globalCompositeOperation = "soft-light"; a.globalAlpha = 0.7 * (o.glare ?? 1); a.fillStyle = gg; a.fillRect(0, 0, bw, bh);
    // Specular sweep: a bright band with prism fringes crosses every piece on its own beat.
    {
      const per = 1.7 + (seed % 5) * 0.13, f = fract(t / per + seed * 0.377) / 0.5;
      if (f < 1) {
        const D = bw + bh, sx = -bh * 0.6 + eio(f) * (D + bh * 0.6), wB = Math.max(10, Math.min(bw, bh) * 0.32 + 14);
        const sg = a.createLinearGradient(sx - wB, 0, sx + wB, bh * 0.55);
        sg.addColorStop(0, "rgba(255,255,255,0)"); sg.addColorStop(0.3, rgba(th.foil[0], 0.55)); sg.addColorStop(0.47, "rgba(255,255,255,0.95)");
        sg.addColorStop(0.53, "rgba(255,255,255,0.95)"); sg.addColorStop(0.7, rgba(th.foil[4], 0.55)); sg.addColorStop(1, "rgba(255,255,255,0)");
        a.globalCompositeOperation = "screen"; a.globalAlpha = 0.85 * (o.glare ?? 1) * Math.sin(Math.min(1, f) * Math.PI) ** 0.5; a.fillStyle = sg; a.fillRect(0, 0, bw, bh);
      }
    }
    // Glitter: seeded points that twinkle.
    a.globalCompositeOperation = "lighter";
    const rr = rng(1000 + ((seed * 7) | 0));
    const n = Math.min(320, ((bw * bh) / 650) * (0.35 + 0.65 * th.tex)) | 0;
    a.fillStyle = "#ffffff";
    for (let i = 0; i < n; i++) {
      const x = rr() * bw, y = rr() * bh, ph = rr() * TAU, sp = 1.2 + rr() * 3.2, sz = (0.7 + rr() * 1.4) * Math.max(1, 2.2 * k * S.u);
      const tw = Math.pow(Math.max(0, Math.sin(t * sp + ph)), 10);
      if (tw < 0.05) continue;
      a.globalAlpha = tw * (o.glitter ?? 1);
      a.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    }
    a.globalCompositeOperation = "source-over"; a.globalAlpha = 1;
    return { c: A, bw, bh };
  }
  function drawFoil(ctx, S, th, path, x, y, w, h, o = {}) {
    if (w <= 1 || h <= 1) return;
    let vx = x + w / 2;
    try { const m = ctx.getTransform(); vx = m.a * vx + m.c * (y + h / 2) + m.e; } catch (e) { /* keep local */ }
    F.view = vx / S.W;
    const fb = foilBuf(S, th, w, h, o);
    ctx.save(); path(ctx); ctx.clip(o.rule || "nonzero");
    ctx.drawImage(fb.c, 0, 0, fb.bw, fb.bh, x, y, w, h);
    if (o.micro !== false && w > 8 * S.u && h > 8 * S.u) microFx(ctx, S, th, x, y, w, h, o);
    ctx.restore();
  }

  // Full-resolution finish over every foil patch: crisp embossed cracks, hammered relief, hair-fine
  // diffraction rulings and a narrow specular line, all locked to the piece so nothing swims.
  let MICRO = null;
  function micro() {
    if (MICRO) return MICRO;
    const sh = shards(), T = sh.T;
    // A white copy of the crack map: drawn a hair up-left of the dark one, the cracks stand in relief.
    const hi = mk(T, T), hg = hi.getContext("2d");
    hg.drawImage(sh.crack, 0, 0); hg.globalCompositeOperation = "source-in"; hg.fillStyle = "#ffffff"; hg.fillRect(0, 0, T, T);
    // Hammered relief: overlapping shallow dimples, each lit from the top left.
    const D = 150, ham = mk(D, D), hd = ham.getContext("2d").createImageData(D, D), r = rng(303), pits = [];
    for (let i = 0; i < 70; i++) pits.push({ x: r() * D, y: r() * D, R: 7 + r() * 13 });
    for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
      let v = 0;
      for (const p of pits) for (const ox of [-D, 0, D]) for (const oy of [-D, 0, D]) {
        const dx = x - p.x - ox, dy = y - p.y - oy, d = Math.sqrt(dx * dx + dy * dy);
        if (d < p.R) { const k = 1 - d / p.R; v += ((dx + dy) / p.R) * k * 0.9; }
      }
      const i = (y * D + x) * 4, g = clamp(0.5 + v * 0.5) * 255;
      hd.data[i] = hd.data[i + 1] = hd.data[i + 2] = g; hd.data[i + 3] = 255;
    }
    ham.getContext("2d").putImageData(hd, 0, 0);
    // Diffraction rulings: a 1 by 3 tile of light, dark and clear rows.
    const rule = mk(1, 3), rg = rule.getContext("2d");
    rg.fillStyle = "rgba(255,255,255,0.85)"; rg.fillRect(0, 0, 1, 1); rg.fillStyle = "rgba(25,15,60,0.5)"; rg.fillRect(0, 1, 1, 1);
    return (MICRO = { hi, ham, rule, pat: null });
  }
  function microFx(ctx, S, th, x, y, w, h, o) {
    const m = micro(), sh = shards(), u = S.u, seed = o.seed || 0, sc = u * (o.shard ?? 1), t = F.t;
    if (!m.pat) m.pat = { c: ctx.createPattern(sh.crack, "repeat"), hi: ctx.createPattern(m.hi, "repeat"), ham: ctx.createPattern(m.ham, "repeat"), rule: ctx.createPattern(m.rule, "repeat") };
    const tex = th.tex, sat = (o.sat ?? 1) * th.sat, silver = 1 - sat;
    const ox = x + ((seed * 53) % 220) * sc, oy = y + ((seed * 91) % 220) * sc;
    const set = (pat, mtx) => { pat.setTransform(mtx); return pat; };
    ctx.save();
    // Hammered relief.
    ctx.globalCompositeOperation = "overlay"; ctx.globalAlpha = (0.22 + 0.2 * silver) * (0.4 + 0.6 * tex);
    ctx.fillStyle = set(m.pat.ham, new DOMMatrix().translateSelf(x + seed * 17 % 150 * u, y).scaleSelf(u * 0.9)); ctx.fillRect(x, y, w, h);
    // Embossed cracks: a lit edge then the dark seam.
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = (0.5 + 0.2 * silver) * (0.5 + 0.5 * tex);
    ctx.fillStyle = set(m.pat.hi, new DOMMatrix().translateSelf(ox - 1.3 * u, oy - 1.3 * u).scaleSelf(sc)); ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = (0.45 + 0.25 * silver) * (0.5 + 0.5 * tex);
    ctx.fillStyle = set(m.pat.c, new DOMMatrix().translateSelf(ox, oy).scaleSelf(sc)); ctx.fillRect(x, y, w, h);
    // Rulings at the piece's own angle, a touch stronger on silver.
    ctx.globalCompositeOperation = "overlay"; ctx.globalAlpha = (0.16 + 0.22 * silver) * (0.4 + 0.6 * tex) * (o.grain ?? 1);
    ctx.fillStyle = set(m.pat.rule, new DOMMatrix().translateSelf(x, y).rotateSelf(((seed * 37) % 50) - 25 + 35).scaleSelf(Math.max(1, 1.2 * u))); ctx.fillRect(x, y, w, h);
    // A narrow, hard specular line that rakes across the piece as the light tilts.
    const D = w + h, per = 1.9 + (seed % 7) * 0.11, f = fract(t / per + seed * 0.29 + F.boost * 0.3);
    const sx = x - h * 0.5 + f * (D + h * 0.5), lw = Math.max(3 * u, Math.min(w, h) * 0.035);
    const lg = ctx.createLinearGradient(sx - lw * 3, y, sx + lw * 3, y + h * 0.5);
    lg.addColorStop(0, "rgba(255,255,255,0)"); lg.addColorStop(0.38, rgba(th.foil[0], 0.5)); lg.addColorStop(0.5, "rgba(255,255,255,1)"); lg.addColorStop(0.62, rgba(th.foil[4], 0.5)); lg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = (0.55 + 0.3 * silver) * (o.glare ?? 1) * Math.sin(f * Math.PI);
    ctx.fillStyle = lg; ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
  // A narrow rainbow glint along a piece's rim; its colours slide with the light angle.
  function edgeGlint(ctx, S, th, path, x, y, w, h, o = {}) {
    const u = S.u, t = F.t, seed = o.seed || 0;
    ctx.save(); path(ctx); ctx.clip();
    ctx.globalAlpha *= o.a ?? 0.85;
    path(ctx); ctx.lineWidth = (o.width ?? 6) * u;
    ctx.strokeStyle = rainbow(ctx, w, h, 0.6 + Math.sin(t * 0.7 + seed) * 0.4, t * 0.6 + F.boost + seed * 0.21, th.foil, x, y); ctx.stroke();
    ctx.restore();
  }

  // ---- shapes -------------------------------------------------------------------------------------
  function rr(ctx, x, y, w, h, r) {
    const q = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.moveTo(x + q, y); ctx.arcTo(x + w, y, x + w, y + h, q); ctx.arcTo(x + w, y + h, x, y + h, q);
    ctx.arcTo(x, y + h, x, y, q); ctx.arcTo(x, y, x + w, y, q); ctx.closePath();
  }
  const rrP = (x, y, w, h, r) => (c) => { c.beginPath(); rr(c, x, y, w, h, r); };
  const circP = (x, y, r) => (c) => { c.beginPath(); c.arc(x, y, r, 0, TAU); };
  function starP(cx, cy, R, n = 5, inner = 0.48, rot = -Math.PI / 2) {
    return (c) => {
      c.beginPath();
      for (let i = 0; i < n * 2; i++) { const a = rot + (i * Math.PI) / n, r = i % 2 ? R * inner : R; c[i ? "lineTo" : "moveTo"](cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      c.closePath();
    };
  }
  function sparkP(cx, cy, R) {
    return (c) => {
      c.beginPath(); c.moveTo(cx, cy - R);
      c.quadraticCurveTo(cx + R * 0.14, cy - R * 0.14, cx + R, cy); c.quadraticCurveTo(cx + R * 0.14, cy + R * 0.14, cx, cy + R);
      c.quadraticCurveTo(cx - R * 0.14, cy + R * 0.14, cx - R, cy); c.quadraticCurveTo(cx - R * 0.14, cy - R * 0.14, cx, cy - R); c.closePath();
    };
  }
  function boltP(cx, cy, R) {
    return (c) => {
      c.beginPath(); const p = [[0.18, -1], [-0.55, 0.14], [-0.02, 0.14], [-0.2, 1], [0.58, -0.16], [0.04, -0.16]];
      p.forEach(([x, y], i) => c[i ? "lineTo" : "moveTo"](cx + x * R * 0.8, cy + y * R)); c.closePath();
    };
  }
  // Scalloped seal edge.
  function rosetteP(cx, cy, R, n = 28) {
    return (c) => {
      c.beginPath();
      for (let i = 0; i <= n * 6; i++) { const a = (i / (n * 6)) * TAU, r = R * (0.94 + 0.06 * Math.cos(a * n)); c[i ? "lineTo" : "moveTo"](cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      c.closePath();
    };
  }
  // A ticket: rounded corners with half-round notches cut into the two long sides.
  function ticketP(x, y, w, h, r, vertical) {
    return (c) => {
      const n = Math.min(w, h) * 0.09;
      c.beginPath();
      c.moveTo(x + r, y);
      if (vertical) { c.lineTo(x + w / 2 - n, y); c.arc(x + w / 2, y, n, Math.PI, 0, true); }
      c.lineTo(x + w - r, y); c.arcTo(x + w, y, x + w, y + r, r);
      if (!vertical) { c.lineTo(x + w, y + h / 2 - n); c.arc(x + w, y + h / 2, n, -Math.PI / 2, Math.PI / 2, true); }
      c.lineTo(x + w, y + h - r); c.arcTo(x + w, y + h, x + w - r, y + h, r);
      if (vertical) { c.lineTo(x + w / 2 + n, y + h); c.arc(x + w / 2, y + h, n, 0, Math.PI, true); }
      c.lineTo(x + r, y + h); c.arcTo(x, y + h, x, y + h - r, r);
      if (!vertical) { c.lineTo(x, y + h / 2 + n); c.arc(x, y + h / 2, n, Math.PI / 2, -Math.PI / 2, true); }
      c.lineTo(x, y + r); c.arcTo(x, y, x + r, y, r);
      c.closePath();
    };
  }

  // A die-cut sticker: soft lifted shadow, white kiss-cut border, foil face and an embossed rim.
  // Hero pieces get a travelling rainbow band and an embossed rim lit by a light that circles them.
  function heroFx(ctx, S, th, path, x, y, w, h, seed = 0, k = 1) {
    if (k <= 0.01) return;
    const u = S.u, t = F.t;
    ctx.save();
    path(ctx); ctx.clip();
    ctx.globalAlpha *= k;
    const bw = Math.max(w, h) * 0.24 + 30 * u, per = 2.4 + (seed % 3) * 0.35, f = fract(t / per + seed * 0.29);
    const px = x - bw * 1.5 + f * (w + bw * 3);
    const g = ctx.createLinearGradient(px - bw, y, px + bw, y + h * 0.7);
    g.addColorStop(0, rgba(th.foil[0], 0)); g.addColorStop(0.18, rgba(th.foil[0], 0.5)); g.addColorStop(0.34, rgba(th.foil[2], 0.55));
    g.addColorStop(0.5, rgba(th.foil[3], 0.55)); g.addColorStop(0.66, rgba(th.foil[4], 0.55)); g.addColorStop(0.82, rgba(th.foil[5], 0.5)); g.addColorStop(1, rgba(th.foil[5], 0));
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    const c = ctx.createLinearGradient(px - bw * 0.25, y, px + bw * 0.25, y + h * 0.7);
    c.addColorStop(0, "rgba(255,255,255,0)"); c.addColorStop(0.5, "rgba(255,255,255,0.55)"); c.addColorStop(1, "rgba(255,255,255,0)");
    ctx.globalCompositeOperation = "screen"; ctx.fillStyle = c; ctx.fillRect(x, y, w, h);
    ctx.globalCompositeOperation = "source-over";
    const a = t * 0.9 + seed, dx = Math.cos(a), dy = Math.sin(a), R = Math.max(w, h) / 2, cx = x + w / 2, cy = y + h / 2;
    const rim = ctx.createLinearGradient(cx - dx * R, cy - dy * R, cx + dx * R, cy + dy * R);
    rim.addColorStop(0, "rgba(255,255,255,1)"); rim.addColorStop(0.42, "rgba(255,255,255,0)"); rim.addColorStop(0.58, "rgba(20,10,50,0)"); rim.addColorStop(1, "rgba(20,10,50,0.5)");
    path(ctx); ctx.lineWidth = 18 * u; ctx.strokeStyle = rim; ctx.stroke();
    path(ctx); ctx.lineWidth = 4 * u; ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.stroke();
    ctx.restore();
  }

  function sticker(ctx, S, th, path, x, y, w, h, o = {}) {
    const u = S.u;
    if (!o.hero && (o.sat ?? 1) < 0.5) o = { glare: 0.5, glitter: 0.5, ...o };
    const border = (o.border ?? 11) * u;
    ctx.save();
    path(ctx);
    ctx.shadowColor = th.shadow; ctx.shadowBlur = (o.lifted ?? 1) * 30 * u; ctx.shadowOffsetY = (o.lifted ?? 1) * 14 * u;
    ctx.fillStyle = th.paper; ctx.fill();
    ctx.shadowColor = "transparent";
    if (border > 0) {
      ctx.lineJoin = "round";
      path(ctx); ctx.lineWidth = border + 2.4 * u; ctx.strokeStyle = th.dark ? "rgba(0,0,0,0.4)" : "rgba(40,30,90,0.14)"; ctx.stroke();
      path(ctx); ctx.lineWidth = border; ctx.strokeStyle = th.paper; ctx.stroke();
    }
    ctx.restore();
    drawFoil(ctx, S, th, path, x, y, w, h, o);
    // Embossed rim: lit along the top left, shaded along the bottom right.
    ctx.save();
    path(ctx); ctx.clip();
    const g = ctx.createLinearGradient(x, y, x + w * 0.4, y + h);
    g.addColorStop(0, "rgba(255,255,255,0.85)"); g.addColorStop(0.45, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(20,10,50,0.35)");
    path(ctx); ctx.lineWidth = 7 * u; ctx.strokeStyle = g; ctx.stroke();
    ctx.restore();
    if (o.edge !== false && w > 30 * u && h > 30 * u) edgeGlint(ctx, S, th, path, x, y, w, h, { seed: o.seed || 0, width: o.hero ? 7 : 4.5, a: (o.sat ?? 1) < 0.5 ? 0.7 : 0.55 });
    if (o.hero) heroFx(ctx, S, th, path, x, y, w, h, o.seed || 0, o.hero === true ? 1 : o.hero);
  }

  // A white card-stock plate for words.
  function plate(ctx, S, th, x, y, w, h, r, o = {}) {
    if (F.back) return;
    const u = S.u;
    ctx.save();
    ctx.beginPath(); rr(ctx, x, y, w, h, r);
    if (o.shadow !== false) { ctx.shadowColor = th.shadow; ctx.shadowBlur = 18 * u; ctx.shadowOffsetY = 7 * u; }
    ctx.fillStyle = th.paper; ctx.fill(); ctx.shadowColor = "transparent";
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(1, "rgba(40,30,90,0.16)");
    ctx.lineWidth = 2 * u; ctx.strokeStyle = g; ctx.stroke();
    ctx.restore();
    // Every label is edged in foil: a fine rim, or a broad one on the highlighted piece.
    if (o.foil || o.edge !== false) {
      const bw = (o.foil ? 8 : 4.5) * u;
      drawFoil(ctx, S, th, (c) => { c.beginPath(); rr(c, x - bw, y - bw, w + bw * 2, h + bw * 2, r + bw); rr(c, x, y, w, h, r); }, x - bw, y - bw, w + bw * 2, h + bw * 2, { seed: o.seed ?? 5, rule: "evenodd", res: o.foil ? 0.4 : 0.3, sat: o.foil ? 1 : 0.75, glitter: 0.4, grain: 0.5 });
    }
  }

  // A four-point flare with a soft core.
  function glint(ctx, th, x, y, r, a) {
    if (a <= 0.02 || r <= 0) return;
    ctx.save();
    ctx.globalAlpha *= a;
    if (!th.dark) {
      const h = ctx.createRadialGradient(x, y, 0, x, y, r * 0.9);
      h.addColorStop(0, rgba(th.foil[4], 0.35)); h.addColorStop(1, rgba(th.foil[4], 0));
      ctx.fillStyle = h; ctx.beginPath(); ctx.arc(x, y, r * 0.9, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 0.45);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath(); ctx.moveTo(x - r, y); ctx.quadraticCurveTo(x, y - r * 0.06, x + r, y); ctx.quadraticCurveTo(x, y + r * 0.06, x - r, y); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x, y - r * 0.7); ctx.quadraticCurveTo(x + r * 0.05, y, x, y + r * 0.7); ctx.quadraticCurveTo(x - r * 0.05, y, x, y - r * 0.7); ctx.fill();
    ctx.restore();
  }
  // A glint that blinks on its own seeded rhythm.
  const blink = (t, seed, rate = 0.55) => { const f = fract(t * rate + seed * 0.618); return f < 0.22 ? Math.sin((f / 0.22) * Math.PI) : 0; };

  // Turn a piece in like a card catching the light: q 0 is edge-on, 1 is face-on. The first half shows
  // the card's foil back flipping round (no words on it, so no type is ever squashed); the face then
  // prints over it at full width with its words.
  function turned(ctx, cx, cy, q, fn) {
    if (q <= 0.001) return;
    q = clamp(q);
    const prev = F.boost, prevBack = F.back;
    if (q < 0.5) {
      const s = Math.sin((q / 0.5) * Math.PI / 2);
      ctx.save();
      ctx.translate(cx, cy); ctx.scale(Math.max(0.002, s), 1 - (1 - s) * 0.06); ctx.translate(-cx, -cy);
      ctx.globalAlpha *= clamp(q * 8);
      F.back = true; F.boost = prev + (1 - s) * 2.2;
      fn();
      ctx.restore();
    } else {
      const a = eo((q - 0.5) / 0.3);
      if (a < 1) { ctx.save(); F.back = true; F.boost = prev + (1 - a) * 0.6; fn(); ctx.restore(); }
      ctx.save();
      const sc = 0.97 + 0.03 * a;
      ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
      ctx.globalAlpha *= a;
      F.back = false; F.boost = prev + (1 - a) * 0.6;
      fn();
      ctx.restore();
    }
    F.boost = prev; F.back = prevBack;
  }

  // ---- type ---------------------------------------------------------------------------------------
  function font(S, size, weight, fam = "body") {
    const L = S.look;
    const f = fam === "display" ? L.display : fam === "figures" ? L.figures : L.body;
    return `${weight ?? (fam === "body" ? 650 : L.displayWeight)} ${size}px ${f}`;
  }
  function textW(ctx, S, s, size, o = {}) { ctx.save(); ctx.font = font(S, size, o.weight, o.fam); const w = ctx.measureText(String(s)).width; ctx.restore(); return w; }
  function fitSize(ctx, S, s, size, maxW, minSize, o = {}) {
    let z = size;
    while (z > minSize && textW(ctx, S, s, z, o) > maxW) z = Math.max(minSize, z * 0.95);
    return z;
  }
  function txt(ctx, S, th, s, x, y, size, o = {}) {
    s = String(s ?? "");
    if (!s || F.back) return 0;
    ctx.save();
    const z = o.max ? fitSize(ctx, S, s, size, o.max, o.min ?? size * 0.7, o) : size;
    ctx.font = font(S, z, o.weight, o.fam);
    if (o.max && ctx.measureText(s).width > o.max) {
      while (s.length > 1 && ctx.measureText(s + "…").width > o.max) s = s.slice(0, -1);
      s += "…";
    }
    ctx.textAlign = o.align || "left"; ctx.textBaseline = o.base || "middle";
    if (o.emboss) { ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fillText(s, x, y + 2 * S.u); }
    ctx.fillStyle = o.color || th.plateInk;
    ctx.fillText(s, x, y);
    const w = ctx.measureText(s).width;
    ctx.restore();
    return w;
  }
  // Split words into at most `max` lines that fit `maxW`.
  function lines(ctx, S, s, size, maxW, o = {}, max = 2) {
    const words = String(s || "").split(/\s+/).filter(Boolean);
    const out = [];
    let line = "";
    for (const w of words) {
      const next = line ? line + " " + w : w;
      if (line && textW(ctx, S, next, size, o) > maxW && out.length < max - 1) { out.push(line); line = w; } else line = next;
    }
    if (line) out.push(line);
    return out;
  }
  // Foil-filled lettering with a dark keyline, for the big figures.
  function foilText(ctx, S, th, s, x, y, size, o = {}) {
    if (F.back) return 0;
    const u = S.u;
    s = String(s);
    ctx.save();
    ctx.font = font(S, size, o.weight ?? 800, o.fam ?? "figures");
    const w = ctx.measureText(s).width;
    const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    const pad = 12 * u, bx = x0 - pad, by = y - size * 0.92 - pad, bw = w + pad * 2, bh = size * 1.2 + pad * 2;
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.lineJoin = "round"; ctx.lineWidth = 10 * u; ctx.strokeStyle = th.plateInk;
    ctx.shadowColor = th.shadow; ctx.shadowBlur = 16 * u; ctx.shadowOffsetY = 6 * u;
    ctx.strokeText(s, x0, y);
    ctx.shadowColor = "transparent";
    const fb = foilBuf(S, th, bw, bh, { seed: o.seed ?? 9, sat: o.sat ?? 1, res: 0.6, shard: 0.7 });
    const C = cv("ftext", bw, bh), c = C.getContext("2d");
    c.globalCompositeOperation = "source-over"; c.clearRect(0, 0, C.width, C.height);
    c.drawImage(fb.c, 0, 0, fb.bw, fb.bh, 0, 0, C.width, C.height);
    c.globalCompositeOperation = "destination-in";
    c.font = ctx.font; c.textBaseline = "alphabetic"; c.fillStyle = "#000";
    c.fillText(s, pad, size * 0.92 + pad);
    c.globalCompositeOperation = "source-over";
    ctx.drawImage(C, 0, 0, C.width, C.height, bx, by, bw, bh);
    ctx.restore();
    return w;
  }

  // ---- icons --------------------------------------------------------------------------------------
  function icon(ctx, S, name, x, y, s, color) {
    if (F.back) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = Math.max(2, s * 0.11); ctx.lineCap = "round"; ctx.lineJoin = "round";
    const h = s / 2;
    ctx.beginPath();
    switch (name) {
      case "play": ctx.moveTo(-h * 0.45, -h * 0.65); ctx.lineTo(h * 0.7, 0); ctx.lineTo(-h * 0.45, h * 0.65); ctx.closePath(); ctx.fill(); break;
      case "check": ctx.moveTo(-h * 0.7, 0); ctx.lineTo(-h * 0.18, h * 0.5); ctx.lineTo(h * 0.75, -h * 0.55); ctx.stroke(); break;
      case "spark": sparkP(0, 0, h * 0.9)(ctx); ctx.fill(); break;
      case "star": starP(0, 0, h * 0.95)(ctx); ctx.fill(); break;
      case "eye":
        ctx.moveTo(-h, 0); ctx.quadraticCurveTo(0, -h * 1.1, h, 0); ctx.quadraticCurveTo(0, h * 1.1, -h, 0); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, h * 0.3, 0, TAU); ctx.fill(); break;
      case "film":
        rr(ctx, -h * 0.85, -h * 0.65, h * 1.7, h * 1.3, h * 0.2); ctx.stroke();
        ctx.beginPath(); for (const xx of [-0.5, 0, 0.5]) { ctx.moveTo(xx * h - h * 0.1, -h * 0.65); ctx.lineTo(xx * h + h * 0.1, -h * 0.65); } ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-h * 0.2, -h * 0.3); ctx.lineTo(h * 0.35, 0); ctx.lineTo(-h * 0.2, h * 0.3); ctx.closePath(); ctx.fill(); break;
      case "arrow": ctx.moveTo(-h * 0.8, 0); ctx.lineTo(h * 0.8, 0); ctx.moveTo(h * 0.25, -h * 0.55); ctx.lineTo(h * 0.8, 0); ctx.lineTo(h * 0.25, h * 0.55); ctx.stroke(); break;
      case "down": ctx.moveTo(0, -h * 0.8); ctx.lineTo(0, h * 0.8); ctx.moveTo(-h * 0.55, h * 0.25); ctx.lineTo(0, h * 0.8); ctx.lineTo(h * 0.55, h * 0.25); ctx.stroke(); break;
      default: ctx.arc(0, 0, h * 0.5, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  // A white disc with an embossed glyph (or numeral).
  function badge(ctx, S, th, x, y, r, name, o = {}) {
    if (F.back) return;
    const u = S.u;
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    ctx.shadowColor = th.shadow; ctx.shadowBlur = 14 * u; ctx.shadowOffsetY = 5 * u;
    ctx.fillStyle = th.paper; ctx.fill(); ctx.shadowColor = "transparent";
    const g = ctx.createLinearGradient(x, y - r, x, y + r);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(1, "rgba(40,30,90,0.2)");
    ctx.lineWidth = 2.5 * u; ctx.strokeStyle = g; ctx.stroke();
    ctx.restore();
    if (o.text) txt(ctx, S, th, o.text, x, y + r * 0.04, r * 0.95, { align: "center", weight: 800, fam: "figures", emboss: true });
    else { icon(ctx, S, name, x, y + 2 * u, r * 1.05, "rgba(255,255,255,0.9)"); icon(ctx, S, name, x, y, r * 1.05, o.color || th.plateInk); }
  }

  // A foil seal: scalloped rim, a white dotted ring and a foil centre with an embossed glyph.
  function seal(ctx, S, th, cx, cy, R, rot, glyph, o = {}) {
    const u = S.u;
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(rot); ctx.translate(-cx, -cy);
    sticker(ctx, S, th, rosetteP(cx, cy, R), cx - R, cy - R, R * 2, R * 2, { seed: o.seed ?? 21, border: 9, res: 0.45, lifted: o.lifted ?? 1.3, hero: true });
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.74, 0, TAU); ctx.arc(cx, cy, R * 0.64, 0, TAU, true);
    ctx.fillStyle = th.paper; ctx.fill("evenodd");
    for (let i = 0; i < 30; i++) { const a = (i / 30) * TAU; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R * 0.69, cy + Math.sin(a) * R * 0.69, R * 0.016 + u, 0, TAU); ctx.fillStyle = th.plateMuted; ctx.fill(); }
    ctx.restore();
    drawFoil(ctx, S, th, circP(cx, cy, R * 0.62), cx - R * 0.62, cy - R * 0.62, R * 1.24, R * 1.24, { seed: (o.seed ?? 21) + 4, angle: 0.9, res: 0.5 });
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.62, 0, TAU); ctx.lineWidth = 4 * u; ctx.strokeStyle = "rgba(20,10,50,0.25)"; ctx.stroke();
    ctx.restore();
    heroFx(ctx, S, th, circP(cx, cy, R * 0.62), cx - R * 0.62, cy - R * 0.62, R * 1.24, R * 1.24, (o.seed ?? 21) + 2, 0.8);
    ctx.save();
    ctx.shadowColor = "rgba(20,10,50,0.45)"; ctx.shadowBlur = 10 * u; ctx.shadowOffsetY = 4 * u;
    icon(ctx, S, glyph, cx, cy, R * 0.72, th.paper);
    ctx.restore();
  }

  // ---- the sheet (stage world) --------------------------------------------------------------------
  const GUI = {};
  function guilloche(S, th) {
    const { W, H, u } = S;
    const key = W + "x" + H + th.line;
    if (GUI[key]) return GUI[key];
    const c = mk(W, H), g = c.getContext("2d");
    g.strokeStyle = th.line; g.lineWidth = 1.3 * u;
    const ros = [[W * 0.24, H * 0.64], [W * 0.76, H * 0.34]];
    const R = Math.min(H * 0.34, W * 0.22);
    for (const [cx, cy] of ros) {
      for (let k = 0; k < 18; k++) {
        g.beginPath();
        for (let i = 0; i <= 360; i++) {
          const a = (i / 360) * TAU, r = R * (0.55 + 0.04 * k / 18) + R * 0.32 * Math.sin(a * 9 + k * 0.35) * Math.cos(a * 2);
          g[i ? "lineTo" : "moveTo"](cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        g.stroke();
      }
    }
    // Fine wave lines across the sheet, like a security print.
    for (let k = 0; k < 9; k++) {
      g.beginPath();
      const y0 = H * (0.06 + k * 0.11);
      for (let x = 0; x <= W; x += 6 * u) g[x ? "lineTo" : "moveTo"](x, y0 + Math.sin((x / W) * TAU * 3 + k) * 14 * u);
      g.stroke();
    }
    return (GUI[key] = c);
  }
  // Glitter flakes drifting over the whole sheet.
  let FLAKES = null;
  function flakes() {
    if (FLAKES) return FLAKES;
    const r = rng(77), out = [];
    for (let i = 0; i < 90; i++) out.push({ x: r(), y: r(), v: 0.012 + r() * 0.03, s: 3 + r() * 6, rot: r() * TAU, spin: (r() - 0.5) * 2.4, k: Math.floor(r() * 6), ph: r() * TAU, sp: 0.8 + r() * 2, depth: r() });
    return (FLAKES = out);
  }
  function ground(ctx, S, th, t, pan) {
    const { W, H, u } = S;
    const m = Math.max(W, H);
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, rgba(th.ground[0])); g.addColorStop(0.55, rgba(th.ground[1])); g.addColorStop(1, rgba(th.ground[2]));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // Pearlescent sheen: soft pools of the foil colours drift with the light.
    ctx.save();
    ctx.globalCompositeOperation = th.dark ? "screen" : "source-over";
    for (let i = 0; i < 4; i++) {
      const x = W * fract(0.2 + i * 0.29 + Math.sin(t * 0.32 + i * 2.1) * 0.1 - pan * 0.11);
      const y = H * (0.3 + 0.4 * Math.sin(t * 0.27 + i * 1.7 + 1));
      const r = m * (0.34 + 0.08 * Math.sin(t * 0.2 + i));
      const c = th.foil[(i * 2 + 1) % 6];
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, rgba(c, th.dark ? 0.16 : 0.2)); rg.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
    // Security linework, panned with the sheet.
    const gu = guilloche(S, th);
    const ox = -fract(pan * 0.32) * W;
    ctx.drawImage(gu, ox, 0); ctx.drawImage(gu, ox + W, 0);
    // Glitter flakes, each a tiny foil chip that flashes as it turns.
    ctx.save();
    const fl = flakes();
    const n = Math.round(fl.length * (0.3 + 0.7 * th.tex));
    for (let i = 0; i < n; i++) {
      const f = fl[i];
      const x = fract(f.x - pan * (0.15 + f.depth * 0.25) + Math.sin(t * 0.4 + f.ph) * 0.01) * (W + 40 * u) - 20 * u;
      const y = fract(f.y + t * f.v) * (H + 40 * u) - 20 * u;
      const turn = Math.cos(t * f.sp + f.ph);
      const s = f.s * u * (0.6 + f.depth * 0.7);
      ctx.save(); ctx.translate(x, y); ctx.rotate(f.rot + t * f.spin); ctx.scale(Math.max(0.15, Math.abs(turn)), 1);
      const c = th.foil[(f.k + Math.floor(t * 0.5 + f.ph)) % 6];
      ctx.fillStyle = rgba(mix(c, th.dark ? [255, 255, 255] : [120, 100, 170], th.dark ? 0.1 : 0.12), 0.75);
      ctx.fillRect(-s / 2, -s / 2, s, s * 0.7);
      ctx.restore();
      const fl2 = Math.pow(Math.max(0, turn), 24);
      if (fl2 > 0.2) glint(ctx, th, x, y, s * 2.4, fl2);
    }
    ctx.restore();
  }
  // A prism streak raking diagonally across the frame (at each change, and now and then on a hold).
  function streak(ctx, S, th, q, a = 1) {
    if (q <= 0 || q >= 1) return;
    const { W, H } = S;
    const x = -H + q * (W + H * 2);
    ctx.save();
    ctx.globalAlpha *= a * Math.sin(q * Math.PI);
    const w = Math.max(W, H) * 0.12;
    const g = ctx.createLinearGradient(x - w, 0, x + w, H * 0.35);
    g.addColorStop(0, rgba(th.foil[0], 0)); g.addColorStop(0.3, rgba(th.foil[0], 0.22)); g.addColorStop(0.45, rgba(th.foil[2], 0.28));
    g.addColorStop(0.55, rgba(th.foil[4], 0.26)); g.addColorStop(0.7, rgba(th.foil[5], 0.2)); g.addColorStop(1, rgba(th.foil[5], 0));
    ctx.globalCompositeOperation = th.dark ? "screen" : "source-over";
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  // The foil-edged frame around the sheet.
  function frame(ctx, S, th) {
    const { W, H, u } = S;
    const i = 24 * u, b = 9 * u;
    drawFoil(ctx, S, th, (c) => { c.beginPath(); rr(c, i, i, W - i * 2, H - i * 2, 22 * u); rr(c, i + b, i + b, W - (i + b) * 2, H - (i + b) * 2, 16 * u); }, 0, 0, W, H, { seed: 2, rule: "evenodd", res: 0.25, shard: 0.8, glitter: 0.6 });
    for (const [x, y] of [[i + b / 2, i + b / 2], [W - i - b / 2, i + b / 2], [i + b / 2, H - i - b / 2], [W - i - b / 2, H - i - b / 2]]) {
      ctx.save(); ctx.shadowColor = th.shadow; ctx.shadowBlur = 8 * u; starP(x, y, 22 * u, 4, 0.36, 0)(ctx); ctx.fillStyle = th.paper; ctx.fill(); ctx.restore();
    }
  }

  // ---- statements (title and closing) -------------------------------------------------------------
  const MEASURE = {};
  function measureStatement(S, id) {
    const el = document.getElementById(id);
    if (!el) return null;
    const key = id + "|" + el.textContent + "|" + el.style.fontSize + "|" + S.W;
    if (MEASURE[key]) return MEASURE[key];
    const c = cv("measure", 4, 4).getContext("2d");
    const size = parseFloat(el.style.fontSize) || 110 * S.u;
    const maxW = parseFloat(el.style.width) || S.W * 0.8;
    c.font = font(S, size, S.look.displayWeight, "display");
    const words = String(el.textContent).split(/\s+/).filter(Boolean);
    const ls = [];
    let line = "";
    for (const w of words) { const next = line ? line + " " + w : w; if (line && c.measureText(next).width > maxW) { ls.push(line); line = w; } else line = next; }
    if (line) ls.push(line);
    let wMax = Math.max(1, ...ls.map((l) => c.measureText(l).width));
    let hC = ls.length * size * 1.04;
    if (id === "title") {
      const k = document.getElementById("kicker");
      if (k && k.textContent) {
        const ks = parseFloat(k.style.fontSize) || 30 * S.u;
        c.font = font(S, ks, 600, "body");
        wMax = Math.max(wMax, c.measureText(k.textContent.toUpperCase()).width + k.textContent.length * ks * 0.14 + ks * 2.4);
        hC += ks * 2.2 + (parseFloat(k.style.marginBottom) || 24 * S.u);
      }
    }
    const side = parseFloat(el.parentElement && el.parentElement.style.paddingLeft) || 140 * S.u;
    return (MEASURE[key] = { x: side, y: (S.H - hC) / 2, w: wMax, h: hC, size });
  }

  const SMALL = [
    (x, y, r) => starP(x, y, r),
    (x, y, r) => sparkP(x, y, r),
    (x, y, r) => boltP(x, y, r),
    (x, y, r) => circP(x, y, r * 0.8),
    (x, y, r) => starP(x, y, r, 8, 0.62),
    (x, y, r) => (c) => { c.beginPath(); rr(c, x - r * 1.1, y - r * 0.5, r * 2.2, r, r * 0.5); },
  ];
  // A small die-cut sticker that floats and spins slowly in its slot.
  function floatSticker(ctx, S, th, kind, x, y, r, t, i, q) {
    turned(ctx, x, y, q, () => {
      const bob = Math.sin(t * 1.1 + i * 1.9) * 8 * S.u;
      const rot = Math.sin(t * 0.5 + i) * 0.22 + i * 0.4;
      ctx.save(); ctx.translate(x, y + bob); ctx.rotate(rot); ctx.translate(-x, -y);
      sticker(ctx, S, th, SMALL[kind % SMALL.length](x, y, r), x - r * 1.15, y - r * 1.05, r * 2.3, r * 2.1, { seed: 30 + i * 3, border: 8, res: 0.5, sat: i % 3 === 1 ? 0.25 : 1, shard: 0.7 });
      if (kind % SMALL.length === 3) icon(ctx, S, "play", x + r * 0.08, y, r * 0.8, th.paper);
      ctx.restore();
      glint(ctx, th, x + r * 0.5, y - r * 0.4 + bob, r * 0.9, blink(t, i + 3));
    });
  }

  // The closing's hero: an Apply switch in foil that sits matte until the line lands, then flips to holo.
  function applyRect(S) {
    const R = measureStatement(S, "closing");
    if (!R) return null;
    const u = S.u, h = 128 * u, w = Math.min(580 * u, S.W - R.x * 2);
    return { x: R.x, y: Math.min(R.y + R.h + 84 * u, S.H - h - 70 * u), w, h };
  }
  function drawApply(ctx, S, th, B, on, t, a = 1, labelA = 1) {
    if (a <= 0.01 || B.w < 4 || B.h < 4) return;
    const u = S.u, { x, y, w, h } = B;
    ctx.save(); ctx.globalAlpha *= a;
    const path = rrP(x, y, w, h, h / 2);
    sticker(ctx, S, th, path, x, y, w, h, { seed: 14, sat: 0.06 + 0.94 * on, border: 11, glare: 0.4 + 0.6 * on, glitter: 0.2 + 0.8 * on, res: 0.45, hero: on > 0.02 ? on : false });
    const pad = Math.min(h, w) * 0.16, tw = Math.min(h * 1.7, w * 0.42), tx = x + pad, ty = y + pad, tH = Math.max(4 * u, h - pad * 2);
    ctx.save(); ctx.globalAlpha *= labelA;
    ctx.beginPath(); rr(ctx, tx, ty, tw, tH, tH / 2);
    ctx.fillStyle = "rgba(29,26,51,0.24)"; ctx.fill(); ctx.lineWidth = 3 * u; ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.stroke();
    ctx.restore();
    if (labelA > 0.01) {
      ctx.save(); ctx.globalAlpha *= labelA;
      const kr = Math.max(2, tH / 2 - 6 * u), kx = tx + tH / 2 + (tw - tH) * eio(on), ky = ty + tH / 2;
      sticker(ctx, S, th, circP(kx, ky, kr), kx - kr, ky - kr, kr * 2, kr * 2, { seed: 151, sat: 0.08 + 0.92 * on, border: 6, res: 0.6, lifted: 0.6, hero: on > 0.5 });
      glint(ctx, th, kx - kr * 0.35, ky - kr * 0.4, kr * 1.1, on * blink(t, 4.2, 0.6));
      const lx = tx + tw + 30 * u;
      txt(ctx, S, th, "Apply", lx, y + h / 2 + 2 * u, 60 * u, { weight: 800, emboss: true, max: x + w - lx - 70 * u, min: 42 * u });
      if (on > 0.02) { ctx.save(); ctx.globalAlpha *= on; icon(ctx, S, "check", x + w - 58 * u, y + h / 2, 48 * u * (0.6 + 0.4 * back(on)), th.plateInk); ctx.restore(); }
      ctx.restore();
    }
    ctx.restore();
  }

  function statementArt(ctx, S, th, info) {
    const { W, H, u, tall } = S;
    const t = info.t, local = info.local;
    const closing = info.scene === "closing";
    const R = measureStatement(S, info.scene);
    if (!R) return;
    const leaving = info.exit !== undefined;
    const lag = closing ? 0.06 : 0;
    const qi = (i) => (leaving ? 1 : eo(seg(local, lag - 0.12 + i * 0.06, lag + 0.32 + i * 0.06))) * (leaving ? 1 - eio(seg(info.exit, i * 0.05, 0.75 + i * 0.05)) : 1);
    const textR = R.x + R.w;
    const room = W - textR - 60 * u;
    // The seal takes whichever free region gives it the largest radius: beside the words, or the band
    // above or below them (pushed to the right so the small stickers keep the left).
    const topH = R.y - 60 * u, botH = H - (R.y + R.h) - 90 * u;
    const opts = [
      { r: tall ? 0 : Math.min(room / 2 - 10 * u, H * 0.3), x: textR + room / 2 + 20 * u, y: H / 2, side: true },
      { r: Math.min(topH / 2 - 10 * u, W * 0.24), y: 50 * u + topH / 2 },
      { r: Math.min(botH / 2 - 10 * u, W * 0.24), y: R.y + R.h + 60 * u + botH / 2 },
    ];
    if (closing) opts.pop();
    opts.sort((a, b) => b.r - a.r);
    const best = opts[0];
    const sr = Math.max(0, best.r);
    const sx = best.side ? best.x : tall ? W / 2 : W - 90 * u - sr * 1.15, sy = best.y;
    // Rays behind the seal turn slowly.
    const qs = qi(0);
    if (sr > 50 * u && qs > 0) {
      ctx.save();
      ctx.globalAlpha *= qs * (closing ? 0.9 : 0.6);
      ctx.translate(sx, sy); ctx.rotate(t * 0.12);
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU, w = 0.06;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, sr * (1.9 + 0.25 * Math.sin(t * 0.8 + i)), a - w, a + w); ctx.closePath();
        ctx.fillStyle = rgba(th.foil[i % 6], th.dark ? 0.16 : 0.22); ctx.fill();
      }
      ctx.restore();
      // Closing: the seal stamps down with a flash and a ring.
      const stamp = closing ? back(seg(local, 0.08, 0.65)) : back(seg(local, 0, 0.5));
      const sc = closing ? 1.3 - 0.3 * stamp : 0.4 + 0.6 * stamp;
      turned(ctx, sx, sy, qs, () => {
        ctx.save(); ctx.translate(sx, sy); ctx.scale(sc, sc); ctx.translate(-sx, -sy);
        ctx.globalAlpha *= clamp(0.35 + stamp * 3);
        seal(ctx, S, th, sx, sy, sr, t * 0.15, closing ? "check" : "star", { seed: closing ? 25 : 21 });
        ctx.restore();
      });
      if (closing) {
        const ring = seg(local, 0.55, 1.4);
        if (ring > 0 && ring < 1) { ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, sr * (1 + ring * 0.9), 0, TAU); ctx.lineWidth = 10 * u * (1 - ring); ctx.strokeStyle = rgba(th.foil[(Math.floor(local * 6)) % 6], 0.8 * (1 - ring)); ctx.stroke(); ctx.restore(); }
        // Orbiting chips and a ring of glints that keep going to the last frame.
        for (let i = 0; i < 6; i++) {
          const a = t * 0.45 + (i / 6) * TAU;
          const ox = sx + Math.cos(a) * sr * 1.45, oy = sy + Math.sin(a) * sr * 1.45;
          floatSticker(ctx, S, th, i, ox, oy, 30 * u, t, i + 10, qi(1 + i * 0.3) * eo(seg(local, 0.5 + i * 0.06, 1 + i * 0.06)));
        }
      }
      glint(ctx, th, sx - sr * 0.45, sy - sr * 0.5, sr * 0.55, blink(t, 1, 0.42) * qs);
      glint(ctx, th, sx + sr * 0.55, sy + sr * 0.3, sr * 0.35, blink(t, 2.5, 0.37) * qs);
    }
    // Foil rule under the words, drawing out from the left.
    const qr = qi(1) * eo(seg(local, 0.25, 0.9));
    if (qr > 0) {
      const ry = R.y + R.h + 26 * u, rw = Math.min(R.w, W - R.x * 2) * qr;
      sticker(ctx, S, th, rrP(R.x, ry, rw, 16 * u, 8 * u), R.x, ry, Math.max(2, rw), 16 * u, { seed: 12, border: 5, res: 0.5, lifted: 0.5 });
    }
    // The Apply switch: grown out of the outgoing device when one led in, else it rises on its own.
    const AB = closing ? applyRect(S) : null;
    if (AB) {
      const on = eio(seg(local, 0.85, 1.25));
      const morphIn = info.fromDevice;
      const qa = morphIn ? (local >= info.change ? 1 : 0) : eo(seg(local, 0.1, 0.55));
      if (qa > 0) {
        ctx.save();
        const lift = (1 - qa) * 60 * u, bob = Math.sin(t * 1.3) * 3 * u;
        ctx.translate(0, lift + bob);
        drawApply(ctx, S, th, AB, on, t, clamp(qa * 2));
        ctx.restore();
        // The flip: a ring and a burst of glints off the knob, then a slow pulse that keeps going.
        const fl = seg(local, 1.0, 1.7);
        const kx = AB.x + AB.h * 0.16 + Math.min(AB.h * 1.7, AB.w * 0.42) - AB.h * 0.34, ky = AB.y + AB.h / 2 + bob;
        if (fl > 0 && fl < 1) {
          ctx.save(); ctx.beginPath(); ctx.arc(kx, ky, AB.h * (0.4 + fl * 1.4), 0, TAU); ctx.lineWidth = 9 * u * (1 - fl); ctx.strokeStyle = rgba(th.foil[(Math.floor(local * 8)) % 6], 0.85 * (1 - fl)); ctx.stroke(); ctx.restore();
          for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.4; glint(ctx, th, kx + Math.cos(a) * AB.h * (0.5 + fl * 1.1), ky + Math.sin(a) * AB.h * (0.5 + fl * 1.1), 34 * u, Math.sin(fl * Math.PI)); }
        }
        if (on >= 1) {
          const pu = fract((local - 1.25) / 1.4);
          ctx.save(); ctx.beginPath(); rr(ctx, AB.x - pu * 26 * u, AB.y + bob - pu * 26 * u, AB.w + pu * 52 * u, AB.h + pu * 52 * u, AB.h / 2 + pu * 26 * u);
          ctx.lineWidth = 5 * u; ctx.strokeStyle = rgba(th.foil[4], 0.5 * (1 - pu)); ctx.stroke(); ctx.restore();
        }
      }
    }
    // Small stickers fill the bands above and below the words, kept clear of the seal.
    const bands = [];
    const topB = R.y - 70 * u, botY = R.y + R.h + 70 * u, botB = H - botY - 50 * u;
    if (topB > 110 * u) bands.push({ y: 50 * u + topB / 2, h: topB });
    if (botB > 110 * u) bands.push({ y: botY + botB / 2, h: botB });
    let k = 0;
    for (const bd of bands) {
      const shared = !best.side && Math.abs(bd.y - sy) < sr * 1.2;
      if (shared && tall) continue;
      const right = shared ? sx - sr * 1.4 : best.side ? textR : W - 80 * u;
      const r = Math.min(64 * u, bd.h * 0.3);
      const left = AB && bd.y > R.y ? AB.x + AB.w + 50 * u : R.x;
      const span = right - left;
      if (span < r * 3) continue;
      const count = Math.max(2, Math.min(5, Math.floor(span / (r * 4.2))));
      for (let i = 0; i < count; i++) {
        const x = left + r + (span - r * 2) * ((i + 0.5) / count) + (k % 2 ? r * 0.8 : -r * 0.4);
        const y = bd.y + (i % 2 ? -1 : 1) * bd.h * 0.12;
        floatSticker(ctx, S, th, k, x, y, r * (0.8 + 0.25 * ((k * 7) % 3) / 2), t, k, qi(2 + i * 0.5));
        k++;
      }
    }
  }

  // Headings print after their drawing settles: a soft foil-edged wipe driven by the scene clock.
  function headReveal(S, info) {
    for (const id of ["chart", "object", "people", "process", "compare"]) {
      const el = document.getElementById(id + "-title");
      if (!el) continue;
      const r = info.scene === id ? clamp((info.local - (id === "object" ? 0.32 : 0.25)) / 0.5) : 1;
      const m = r >= 1 ? "" : `linear-gradient(90deg, #000 ${(eo(r) * 112 - 8).toFixed(2)}%, transparent ${(eo(r) * 112).toFixed(2)}%)`;
      if (el.style.webkitMaskImage !== m) { el.style.webkitMaskImage = m; el.style.maskImage = m; }
    }
  }

  // A held card never sits still: it drifts and tilts in the light, and its rainbow slides with the tilt.
  function sway(ctx, S, cx, cy, t, i, k = 1) {
    const a = Math.sin(t * 0.95 + i * 1.3), b = Math.sin(t * 0.7 + i * 2.1);
    ctx.translate(cx, cy + b * 6 * S.u * k);
    ctx.rotate(a * 0.014 * k);
    ctx.transform(1 - 0.02 * k * (1 + a) * 0.5, a * 0.018 * k, 0, 1, 0, 0);
    ctx.translate(-cx, -cy);
    F.boost += a * 0.45 * k;
  }

  // ---- scene drawers ------------------------------------------------------------------------------
  function area(S, box) {
    const u = S.u;
    return S.tall ? { x: box.x - 20 * u, y: box.y - 30 * u, w: box.w + 40 * u, h: box.h + 90 * u } : { x: box.x - 30 * u, y: box.y - 26 * u, w: box.w + 60 * u, h: box.h + 50 * u };
  }
  function wrap(fn) {
    return (ctx, S, box, p, d, info) => {
      const th = theme(S);
      const leaving = info.exit !== undefined;
      F.t = info.t; F.boost = 0;
      // Before a statement the words land mid-frame, so the outgoing drawing clears out of their way fast.
      const fast = leaving && (F.scene === "closing" || F.scene === "title");
      const ex = leaving ? clamp(info.exit * (fast ? 3 : 1)) : 0;
      const step = fast ? 0.03 : 0.07, span = fast ? 0.3 : 0.55;
      const X = {
        t: info.t, local: info.local, leaving, exit: leaving ? info.exit : 0, hold: info.hold, change: info.change,
        q: (i) => (leaving ? 1 - eio(seg(ex, i * step, span + i * step)) : eo(seg(info.local, -0.04 + i * 0.055, 0.34 + i * 0.055))),
      };
      const build = leaving ? 1 : clamp((info.local - 0.05) / Math.max(0.9, (info.hold - 0.4) * 0.6));
      ctx.save();
      fn(ctx, S, th, area(S, box), build, d, X);
      ctx.restore();
    };
  }

  function chartScene(ctx, S, th, A, p, d, X) {
    const u = S.u, t = X.t;
    const n = d.values.length;
    const max = Math.max(...d.values.map((v) => Math.abs(v)), 1);
    const labelH = 78 * u, tagH = 124 * u;
    const base = A.y + A.h - labelH;
    const gap = A.w * (S.tall ? 0.045 : 0.055);
    const bw = (A.w - gap * (n + 1)) / n;
    const maxH = base - (A.y + tagH + 26 * u);
    // Guide rules embossed into the sheet, and a foil shelf.
    const q0 = X.q(0);
    ctx.save(); ctx.globalAlpha *= q0;
    for (let k = 1; k <= 3; k++) {
      const y = base - maxH * (k / 3);
      ctx.setLineDash([3 * u, 12 * u]); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(A.x, y + 1.5 * u); ctx.lineTo(A.x + A.w, y + 1.5 * u); ctx.lineWidth = 3 * u; ctx.strokeStyle = th.dark ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.95)"; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(A.x, y); ctx.lineTo(A.x + A.w, y); ctx.strokeStyle = th.line.replace("0.07", "0.22"); ctx.stroke();
    }
    ctx.restore();
    turned(ctx, A.x + A.w / 2, base, q0, () => sticker(ctx, S, th, rrP(A.x, base, A.w, 14 * u, 7 * u), A.x, base, A.w, 14 * u, { seed: 4, border: 5, sat: 0.35, res: 0.4, lifted: 0.5 }));
    d.values.forEach((value, i) => {
      const q = X.q(i + 1);
      if (q <= 0) return;
      const hot = i === d.highlight;
      const grow = eo(seg(p, i * 0.1, 0.5 + i * 0.1));
      const h = Math.max(30 * u, maxH * (Math.abs(value) / max) * (0.3 + 0.7 * grow) * (1 + 0.025 * grow * Math.sin(t * 1.3 + i * 1.7)));
      const x = A.x + gap + i * (bw + gap), cx = x + bw / 2, top = base - h;
      turned(ctx, cx, base - h / 2, q, () => {
        const pb = F.boost;
        ctx.save(); sway(ctx, S, cx, base, t, i, 0.7);
        sticker(ctx, S, th, rrP(x, top, bw, h + 7 * u, Math.min(30 * u, bw * 0.2)), x, top, bw, h + 7 * u, { seed: i * 5 + 3, sat: hot ? 1 : 0.22, tilt: i * 0.5, border: 10, lift: hot ? 1 : 1.6, hero: hot });
        // Embossed stripes across the pillar.
        ctx.save(); ctx.beginPath(); rr(ctx, x, top, bw, h, Math.min(30 * u, bw * 0.2)); ctx.clip();
        for (let y = base - 40 * u; y > top + 20 * u; y -= 54 * u) { ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fillRect(x, y, bw, 2 * u); ctx.fillStyle = "rgba(20,10,50,0.14)"; ctx.fillRect(x, y + 2 * u, bw, 2 * u); }
        ctx.restore();
        // Value tag: card stock, bobbing gently.
        const label = window.DreamcutMotion.formatNumber(value * grow, 0, d.prefix, d.suffix);
        const final = window.DreamcutMotion.formatNumber(value, 0, d.prefix, d.suffix);
        const size = fitSize(ctx, S, final, 104 * u, Math.max(bw, 160 * u) - 30 * u, 72 * u, { weight: 800, fam: "figures" });
        const tw = Math.max(bw * 0.86, textW(ctx, S, final, size, { weight: 800, fam: "figures" }) + 44 * u);
        const bob = Math.sin(t * 1.4 + i * 1.3) * 5 * u;
        const ty = top - 18 * u - tagH + bob;
        plate(ctx, S, th, cx - tw / 2, ty, tw, tagH, 22 * u, { foil: hot, seed: 40 + i });
        txt(ctx, S, th, label, cx, ty + tagH * 0.54, size, { align: "center", weight: 800, fam: "figures" });
        if (hot) {
          glint(ctx, th, x + bw * 0.78, top + 24 * u, 70 * u, blink(t, i, 0.5));
          glint(ctx, th, x + bw * 0.2, top + h * 0.55, 46 * u, blink(t, i + 0.5, 0.43));
        }
        ctx.restore(); F.boost = pb;
      });
      ctx.save(); ctx.globalAlpha *= clamp(q * 3);
      txt(ctx, S, th, d.labels[i] || "", cx, base + labelH * 0.62, 44 * u, { align: "center", color: th.ink, max: bw + gap * 0.8, min: 40 * u });
      ctx.restore();
    });
  }

  function screenRect(S, D, phone) {
    const u = S.u, pad = (phone ? 22 : 26) * u;
    const sx = D.x + pad, sy = D.y + pad, sw = D.w - pad * 2, sh = D.h - pad * 2;
    return phone ? { x: sx + sw * 0.07, y: sy + sh * 0.06, w: sw * 0.86, h: sh * 0.44 } : { x: sx + sw * 0.06, y: sy + sh * 0.07, w: sw * 0.88, h: sh * 0.48 };
  }
  function device(ctx, S, th, D, t, p, phone) {
    const u = S.u;
    const { x, y, w, h } = D;
    const r = (phone ? 54 : 26) * u;
    sticker(ctx, S, th, rrP(x, y, w, h, r), x, y, w, h, { seed: 14, sat: 0.55, border: 12, lift: 1.3, hero: 0.85 });
    const pad = (phone ? 22 : 26) * u;
    const sx = x + pad, sy = y + pad, sw = w - pad * 2, sh = h - pad * 2;
    ctx.save(); ctx.beginPath(); rr(ctx, sx, sy, sw, sh, r * 0.6);
    ctx.fillStyle = "#1c1934"; ctx.fill();
    ctx.lineWidth = 3 * u; ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.stroke(); ctx.restore();
    // Preview window: full rainbow foil with a play glyph.
    const pv = screenRect(S, D, phone);
    drawFoil(ctx, S, th, rrP(pv.x, pv.y, pv.w, pv.h, 12 * u), pv.x, pv.y, pv.w, pv.h, { seed: 17, res: 0.5 });
    badge(ctx, S, th, pv.x + pv.w / 2, pv.y + pv.h / 2, Math.min(pv.w, pv.h) * 0.16, "play");
    // Tracks of foil clips, with a playhead that keeps moving.
    const tracks = 3, ty0 = pv.y + pv.h + sh * 0.07, th0 = (sy + sh - ty0 - sh * 0.06) / tracks;
    const clips = [[0.0, 0.34], [0.38, 0.24], [0.66, 0.34]];
    for (let k = 0; k < tracks; k++) {
      clips.forEach(([cx, cw], i) => {
        const shown = clamp((p - 0.1 - (k * 3 + i) * 0.05) * 4);
        if (shown <= 0) return;
        const xx = pv.x + pv.w * (cx + k * 0.02), ww = pv.w * (cw - 0.03 - k * 0.02) * shown;
        drawFoil(ctx, S, th, rrP(xx, ty0 + k * th0, ww, th0 * 0.7, th0 * 0.25), xx, ty0 + k * th0, Math.max(2, ww), th0 * 0.7, { seed: 50 + k * 3 + i, sat: k === 0 && i === 1 ? 1 : 0.35, res: 0.4, glitter: 0.5 });
      });
    }
    const ph = pv.x + pv.w * fract(t * 0.16);
    ctx.save(); ctx.beginPath(); ctx.moveTo(ph, ty0 - 10 * u); ctx.lineTo(ph, sy + sh - sh * 0.04);
    ctx.lineWidth = 3.5 * u; ctx.strokeStyle = th.paper; ctx.shadowColor = "rgba(255,255,255,0.9)"; ctx.shadowBlur = 12 * u; ctx.stroke(); ctx.restore();
    glint(ctx, th, ph, ty0 - 10 * u, 26 * u, 0.8);
    if (!phone) {
      const by = y + h, dw = w * 1.12, dx = x - w * 0.06, dh = h * 0.075;
      const path = (c) => { c.beginPath(); c.moveTo(x + w * 0.02, by); c.lineTo(x + w * 0.98, by); c.lineTo(dx + dw, by + dh * 0.7); c.quadraticCurveTo(dx + dw, by + dh, dx + dw - dh, by + dh); c.lineTo(dx + dh, by + dh); c.quadraticCurveTo(dx, by + dh, dx, by + dh * 0.7); c.closePath(); };
      sticker(ctx, S, th, path, dx, by, dw, dh, { seed: 15, sat: 0.3, border: 8, res: 0.4 });
    }
    return pv;
  }
  function objectScene(ctx, S, th, A, p, d, X) {
    const u = S.u, t = X.t, tall = S.tall;
    const phone = d.kind === "phone";
    let D, tags;
    if (tall) {
      const dh = A.h * 0.5;
      const w = phone ? Math.min(A.w * 0.5, dh * 0.52) : Math.min(A.w * 0.9, dh * 1.5);
      const h = phone ? w * 1.95 : w * 0.62;
      D = { x: A.x + (A.w - w) / 2, y: A.y + 10 * u + (dh - h) / 2, w, h };
      const top = A.y + dh + 70 * u, th2 = 118 * u, gp = (A.y + A.h - top - th2 * 3) / 2.5;
      tags = [0, 1, 2].map((i) => ({ x: A.x + 30 * u, y: top + i * (th2 + gp), w: A.w - 60 * u, h: th2 }));
    } else {
      const w = phone ? Math.min(A.w * 0.24, A.h * 0.48) : Math.min(A.w * 0.52, A.h * 1.36);
      const h = phone ? w * 1.95 : w * 0.62;
      D = { x: A.x + (phone ? A.w * 0.12 : 20 * u), y: A.y + (A.h - h - (phone ? 0 : h * 0.08)) / 2, w, h };
      const lx = D.x + D.w + (phone ? 200 : 150) * u, th2 = 120 * u, gp = (A.h - th2 * 3) / 2.6;
      tags = [0, 1, 2].map((i) => ({ x: lx, y: A.y + gp * 0.3 + i * (th2 + gp), w: A.x + A.w - lx, h: th2 }));
    }
    let pv = null;
    const dcx = D.x + D.w / 2, dcy = D.y + D.h / 2;
    const ch = Math.max(0.01, X.change || 0.45);
    const pre = !X.leaving && F.next === "closing" && X.local > X.hold - ch ? clamp((X.local - (X.hold - ch)) / (2 * ch), 0, 0.5) : null;
    const T = (X.leaving && F.scene === "closing") || pre !== null ? applyRect(S) : null;
    if (T) {
      // Into the closing: the device shrinks and slides down to where the Apply switch will sit, its
      // screen going dark while the switch grows out of its shell. It starts with the heading's exit.
      const e = pre !== null ? pre : 0.5 + 0.5 * X.exit;
      const s = 1 - 0.6 * eio(seg(e, 0, 0.65)), mv = eio(seg(e, 0, 0.75));
      const cx = dcx + (T.x + T.w / 2 - dcx) * mv, cy = dcy + (T.y + T.h / 2 - dcy) * mv;
      const da = 1 - seg(e, 0.25, 0.8);
      if (da > 0) { ctx.save(); ctx.globalAlpha *= da; ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-dcx, -dcy); device(ctx, S, th, D, t, p, phone); ctx.restore(); }
      const pa = seg(e, 0.22, 0.6);
      if (pa > 0) {
        const k = eio(seg(e, 0.22, 1)), sw = D.w * s, sh = D.h * s;
        const B = { x: cx - sw / 2 + (T.x - (cx - sw / 2)) * k, y: cy - sh / 2 + (T.y - (cy - sh / 2)) * k, w: sw + (T.w - sw) * k, h: sh + (T.h - sh) * k };
        drawApply(ctx, S, th, B, 0, t, pa, seg(e, 0.6, 1));
      }
      glint(ctx, th, cx + D.w * s * 0.3, cy - D.h * s * 0.3, 70 * u, Math.sin(seg(e, 0.1, 0.9) * Math.PI));
      pv = { x: cx, y: cy, w: 1, h: 1 };
    } else if (!X.leaving) {
      // The device rises into place with a glint raking across it as it lands.
      const rise = eo(seg(X.local, 0, 0.75));
      if (rise > 0) {
        ctx.save(); ctx.globalAlpha *= clamp(seg(X.local, 0, 0.3));
        const sc = 0.88 + 0.12 * rise;
        ctx.translate(dcx, dcy + (1 - rise) * 140 * u); ctx.scale(sc, sc); ctx.translate(-dcx, -dcy);
        pv = device(ctx, S, th, D, t, p, phone);
        ctx.restore();
        const gl = seg(X.local, 0.35, 0.95);
        if (gl > 0 && gl < 1) glint(ctx, th, D.x + D.w * gl, D.y + D.h * (0.15 + 0.5 * gl), 90 * u, Math.sin(gl * Math.PI));
      }
    } else turned(ctx, dcx, dcy, X.q(0), () => { pv = device(ctx, S, th, D, t, p, phone); });
    if (!pv) return;
    if (T) {
      // The tags hold on across the change and flip away one by one; their leaders retract first.
      const e = pre !== null ? pre : 0.5 + 0.5 * X.exit;
      const pv0 = screenRect(S, D, phone);
      const an = [[pv0.x + pv0.w * 0.72, pv0.y + pv0.h * 0.3], [pv0.x + pv0.w * 0.5, pv0.y + pv0.h * 1.24], phone ? [D.x + D.w * 0.5, D.y + D.h * 0.93] : [D.x + D.w * 0.5, D.y + D.h - 14 * u]];
      d.callouts.forEach((label, i) => {
        const Tg = tags[i];
        if (!label) return;
        const ex = tall ? Tg.x + Tg.h / 2 : Tg.x, ey = Tg.y + Tg.h / 2;
        const lr = 1 - eio(seg(e, 0, 0.35));
        if (lr > 0) {
          ctx.save(); ctx.globalAlpha *= lr;
          ctx.setLineDash([2 * u, 11 * u]); ctx.lineCap = "round"; ctx.lineWidth = 6 * u;
          ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + (an[i][0] - ex) * lr, ey + (an[i][1] - ey) * lr);
          ctx.strokeStyle = th.dark ? "rgba(255,255,255,0.75)" : "rgba(29,26,51,0.55)"; ctx.stroke(); ctx.restore();
        }
        const q = 1 - eio(seg(e, 0.12 + i * 0.08, 0.5 + i * 0.08));
        if (q <= 0) return;
        turned(ctx, Tg.x + Tg.w / 2, Tg.y + Tg.h / 2, q, () => {
          plate(ctx, S, th, Tg.x, Tg.y, Tg.w, Tg.h, Tg.h / 2, { foil: i === 1, seed: 70 + i });
          const r = Tg.h * 0.36;
          numDisc(ctx, S, th, Tg.x + Tg.h / 2, Tg.y + Tg.h / 2, r, i);
          txt(ctx, S, th, label, Tg.x + Tg.h + 12 * u, Tg.y + Tg.h / 2 + 2 * u, 46 * u, { max: Tg.w - Tg.h - 40 * u, min: 42 * u, weight: 700 });
        });
      });
      return;
    }
    const anchors = [[pv.x + pv.w * 0.72, pv.y + pv.h * 0.3], [pv.x + pv.w * 0.5, pv.y + pv.h * 1.24], [D.x + D.w * 0.5, D.y + D.h - 14 * u]];
    if (phone) anchors[2] = [D.x + D.w * 0.5, D.y + D.h * 0.93];
    // Leaders first, so every tag sits on top of the dotted runs that reach the tags below it.
    const parts = [];
    d.callouts.forEach((label, i) => {
      const c = eo(seg(p, 0.15 + i * 0.16, 0.45 + i * 0.16));
      const q = X.q(i + 1) * clamp(c * 2.5);
      if (q <= 0 || !label) return;
      const T = tags[i];
      const [ax, ay] = anchors[i];
      const ex = tall ? T.x + T.h / 2 : T.x, ey = T.y + T.h / 2;
      parts.push({ label, i, c, q, T });
      ctx.save(); ctx.globalAlpha *= clamp(q * 3);
      // Leader: a dotted embossed line with a glint that runs along it.
      const lx = ax + (ex - ax) * c, ly = ay + (ey - ay) * c;
      ctx.setLineDash([2 * u, 11 * u]); ctx.lineCap = "round"; ctx.lineWidth = 6 * u;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(lx, ly); ctx.strokeStyle = th.dark ? "rgba(255,255,255,0.75)" : "rgba(29,26,51,0.55)"; ctx.stroke();
      ctx.setLineDash([]);
      drawFoil(ctx, S, th, circP(ax, ay, 13 * u), ax - 13 * u, ay - 13 * u, 26 * u, 26 * u, { seed: 60 + i, res: 0.6 });
      ctx.beginPath(); ctx.arc(ax, ay, 13 * u, 0, TAU); ctx.lineWidth = 4 * u; ctx.strokeStyle = th.paper; ctx.stroke();
      if (c >= 1) { const f = fract(t * 0.45 + i * 0.33); glint(ctx, th, ax + (ex - ax) * f, ay + (ey - ay) * f, 28 * u, Math.sin(f * Math.PI)); }
      ctx.restore();
    });
    parts.forEach(({ label, i, q, T }) => {
      turned(ctx, T.x + T.w / 2, T.y + T.h / 2, q, () => {
        plate(ctx, S, th, T.x, T.y, T.w, T.h, T.h / 2, { foil: i === 1, seed: 70 + i });
        const r = T.h * 0.36;
        numDisc(ctx, S, th, T.x + T.h / 2, T.y + T.h / 2, r, i);
        txt(ctx, S, th, label, T.x + T.h + 12 * u, T.y + T.h / 2 + 2 * u, 46 * u, { max: T.w - T.h - 40 * u, min: 42 * u, weight: 700 });
      });
    });
  }

  // A numbered foil disc: a rainbow rim around a solid ink centre, so the white numeral always reads.
  function numDisc(ctx, S, th, cx, cy, r, i) {
    const u = S.u;
    sticker(ctx, S, th, circP(cx, cy, r), cx - r, cy - r, r * 2, r * 2, { seed: 64 + i * 2, border: 0, res: 0.6, lifted: 0.3, edge: false });
    if (F.back) return;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r * 0.74, 0, TAU); ctx.fillStyle = th.plateInk; ctx.fill();
    ctx.lineWidth = 2.5 * u; ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.stroke(); ctx.restore();
    txt(ctx, S, th, String(i + 1), cx, cy + 2 * u, r * 1.05, { align: "center", weight: 800, fam: "figures", color: "#ffffff" });
  }

  // An original sticker character: round head with a hair shape, shoulders in foil, a simple face.
  function character(ctx, S, th, cx, base, size, i, hot, t, q) {
    const u = S.u;
    const head = size * 0.22, hy = base - size + head;
    const bw = size * 0.68, top = hy + head * 0.95;
    const path = (c) => {
      c.beginPath(); c.arc(cx, hy, head, 0, TAU);
      c.moveTo(cx - bw / 2, base); c.lineTo(cx - bw / 2, top + bw * 0.32);
      c.quadraticCurveTo(cx - bw / 2, top, cx, top); c.quadraticCurveTo(cx + bw / 2, top, cx + bw / 2, top + bw * 0.32);
      c.lineTo(cx + bw / 2, base); c.closePath();
    };
    sticker(ctx, S, th, path, cx - bw / 2, hy - head, bw, base - hy + head, { seed: 80 + i * 4, sat: hot ? 1 : 0.18, tilt: i * 0.7, border: 10, lift: hot ? 1 : 1.5, hero: hot });
    // Face plate.
    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, hy + head * 0.12, head * 0.72, head * 0.66, 0, 0, TAU); ctx.fillStyle = th.paper; ctx.fill();
    ctx.lineWidth = 2 * u; ctx.strokeStyle = "rgba(40,30,90,0.15)"; ctx.stroke();
    const shut = fract(t * 0.27 + i * 0.41) < 0.045;
    ctx.fillStyle = ctx.strokeStyle = th.plateInk; ctx.lineCap = "round"; ctx.lineWidth = Math.max(2.5 * u, head * 0.08);
    for (const s of [-1, 1]) {
      const ex = cx + s * head * 0.28, ey = hy + head * 0.05;
      if (shut) { ctx.beginPath(); ctx.moveTo(ex - head * 0.09, ey); ctx.lineTo(ex + head * 0.09, ey); ctx.stroke(); }
      else { ctx.beginPath(); ctx.arc(ex, ey, head * 0.085, 0, TAU); ctx.fill(); }
    }
    ctx.beginPath(); ctx.arc(cx, hy + head * 0.22, head * 0.2, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    ctx.fillStyle = rgba(th.foil[0], 0.45);
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + s * head * 0.46, hy + head * 0.28, head * 0.12, head * 0.07, 0, 0, TAU); ctx.fill(); }
    // Hair: one of four shapes, in ink.
    ctx.fillStyle = th.plateInk;
    const k = i % 4;
    ctx.beginPath();
    if (k === 0) { ctx.arc(cx, hy - head * 0.95, head * 0.32, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(cx, hy, head * 1.02, Math.PI * 1.08, Math.PI * 1.92); ctx.quadraticCurveTo(cx, hy - head * 0.45, cx - head * 0.95, hy - head * 0.3); ctx.fill(); }
    else if (k === 1) { ctx.arc(cx, hy, head * 1.03, Math.PI * 1.02, Math.PI * 1.98); ctx.lineTo(cx + head * 0.7, hy - head * 0.35); ctx.lineTo(cx + head * 0.2, hy - head * 0.5); ctx.lineTo(cx - head * 0.2, hy - head * 0.38); ctx.lineTo(cx - head * 0.7, hy - head * 0.5); ctx.closePath(); ctx.fill(); }
    else if (k === 2) { for (let j = -2; j <= 2; j++) { ctx.moveTo(cx + j * head * 0.32 + head * 0.16, hy - head * 0.95); ctx.arc(cx + j * head * 0.32, hy - head * 0.86 + Math.abs(j) * head * 0.18, head * 0.24, 0, TAU); } ctx.fill(); }
    else { ctx.arc(cx, hy - head * 0.1, head * 1.02, Math.PI, TAU); ctx.lineTo(cx + head * 1.4, hy - head * 0.12); ctx.lineTo(cx + head * 1.4, hy - head * 0.02); ctx.lineTo(cx - head * 1.0, hy - head * 0.02); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    if (hot) glint(ctx, th, cx + bw * 0.3, top + bw * 0.25, size * 0.2, blink(t, i, 0.5));
    return { top: hy - head * 1.3 };
  }
  function peopleScene(ctx, S, th, A, p, d, X) {
    const u = S.u, t = X.t;
    const n = Math.max(2, Math.min(6, Math.round(d.count)));
    const rows = S.tall && n > 3 ? 2 : 1;
    const perRow = Math.ceil(n / rows);
    const badgeH = 84 * u;
    const rowH = A.h / rows;
    const hotIdx = Math.min(n - 1, d.highlight);
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / perRow), col = i % perRow;
      const inRow = Math.min(perRow, n - row * perRow);
      const cw = A.w / perRow;
      const cx = A.x + A.w / 2 + (col - (inRow - 1) / 2) * cw;
      const by = A.y + rowH * (row + 1) - badgeH - 16 * u;
      const base = by - 24 * u;
      const size = Math.min(rowH - badgeH - 60 * u, cw * 1.25);
      const hot = i === hotIdx;
      const q = X.q(i);
      const rise = eo(seg(p, i * 0.08, 0.4 + i * 0.08));
      turned(ctx, cx, base - size / 2, q, () => {
        // Floor shadow and a foil disc under the highlighted one.
        ctx.save(); ctx.beginPath(); ctx.ellipse(cx, base + 4 * u, size * 0.4, size * 0.06, 0, 0, TAU); ctx.fillStyle = th.shadow; ctx.fill(); ctx.restore();
        const bob = Math.sin(t * 1.7 + i * 1.1) * 6 * u - (1 - rise) * 30 * u;
        ctx.save(); ctx.translate(0, bob);
        character(ctx, S, th, cx, base, size * (hot ? 1.06 : 1), i, hot, t, q);
        ctx.restore();
        const label = d.badges[i] || "Viewer";
        if (label) {
          const z = fitSize(ctx, S, label, 44 * u, cw - 50 * u, 40 * u, { weight: 700 });
          const bw2 = Math.min(cw - 14 * u, textW(ctx, S, label, z, { weight: 700 }) + 52 * u);
          plate(ctx, S, th, cx - bw2 / 2, by, bw2, badgeH, badgeH / 2, { foil: hot, seed: 90 + i });
          txt(ctx, S, th, label, cx, by + badgeH / 2 + 2 * u, z, { align: "center", weight: 700, max: bw2 - 30 * u, min: 38 * u });
        }
      });
    }
  }

  function processScene(ctx, S, th, A, p, d, X) {
    const u = S.u, t = X.t;
    const n = d.steps.length;
    const vertical = S.tall;
    const gap = (vertical ? 70 : 96) * u;
    const tw = vertical ? A.w * 0.92 : (A.w - gap * (n - 1)) / n;
    const tH = vertical ? (A.h - gap * (n - 1)) / n : Math.min(A.h * 0.86, tw * 1.25);
    const kinds = ["film", "spark", "eye"];
    for (let i = 0; i < n; i++) {
      const x = vertical ? A.x + (A.w - tw) / 2 : A.x + i * (tw + gap);
      const y = vertical ? A.y + i * (tH + gap) : A.y + (A.h - tH) / 2;
      const q = X.q(i) * (X.leaving ? 1 : eo(seg(p, i * 0.16 - 0.12, 0.14 + i * 0.16)));
      const last = i === n - 1;
      // Connector to the next ticket: a perforated run with a glint and an arrowhead.
      if (i < n - 1) {
        const a = eo(seg(p, 0.15 + i * 0.16, 0.35 + i * 0.16)) * X.q(i + 0.5);
        if (a > 0) {
          ctx.save();
          let x1, y1, x2, y2;
          if (vertical) { x1 = x2 = x + tw / 2; y1 = y + tH + 8 * u; y2 = y + tH + gap - 8 * u; }
          else { y1 = y2 = y + tH / 2; x1 = x + tw + 10 * u; x2 = x + tw + gap - 10 * u; }
          const xe = x1 + (x2 - x1) * a, ye = y1 + (y2 - y1) * a;
          ctx.setLineDash([2 * u, 12 * u]); ctx.lineCap = "round"; ctx.lineWidth = 7 * u;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(xe, ye); ctx.strokeStyle = th.dark ? "rgba(255,255,255,0.7)" : "rgba(29,26,51,0.5)"; ctx.stroke();
          ctx.restore();
          if (a >= 1) {
            const f = fract(t * 0.6 + i * 0.4);
            glint(ctx, th, x1 + (x2 - x1) * f, y1 + (y2 - y1) * f, 30 * u, Math.sin(f * Math.PI));
          }
        }
      }
      if (q <= 0) continue;
      turned(ctx, x + tw / 2, y + tH / 2, q, () => {
        const pb = F.boost;
        ctx.save(); sway(ctx, S, x + tw / 2, y + tH / 2, t, i, 1);
        sticker(ctx, S, th, ticketP(x, y, tw, tH, 26 * u, vertical), x, y, tw, tH, { seed: 100 + i * 6, sat: last ? 1 : 0.22, tilt: i * 0.6, border: 10, hero: last });
        // A card-stock stub carries the words; a perforation separates it from the foil.
        let stub, ic;
        if (vertical) { stub = { x: x + tw * 0.36, y: y + 22 * u, w: tw * 0.64 - 22 * u, h: tH - 44 * u }; ic = { x: x + tw * 0.18, y: y + tH / 2, r: Math.min(tw * 0.12, tH * 0.3) }; }
        else { stub = { x: x + 22 * u, y: y + tH * 0.58, w: tw - 44 * u, h: tH * 0.42 - 22 * u }; ic = { x: x + tw / 2, y: y + tH * 0.3, r: Math.min(tw * 0.17, tH * 0.16) }; }
        plate(ctx, S, th, stub.x, stub.y, stub.w, stub.h, 16 * u, { shadow: false });
        ctx.save(); ctx.setLineDash([3 * u, 9 * u]); ctx.lineWidth = 3 * u; ctx.strokeStyle = th.paper; ctx.beginPath();
        if (vertical) { ctx.moveTo(stub.x - 11 * u, y + 14 * u); ctx.lineTo(stub.x - 11 * u, y + tH - 14 * u); } else { ctx.moveTo(x + 18 * u, stub.y - 11 * u); ctx.lineTo(x + tw - 18 * u, stub.y - 11 * u); }
        ctx.stroke(); ctx.restore();
        badge(ctx, S, th, ic.x, ic.y, ic.r, last ? "check" : kinds[i % 3]);
        plate(ctx, S, th, x + 24 * u, y + 22 * u, 92 * u, 60 * u, 30 * u, { shadow: true });
        txt(ctx, S, th, String(i + 1).padStart(2, "0"), x + 70 * u, y + 54 * u, 42 * u, { align: "center", weight: 800, fam: "figures" });
        const size = 46 * u;
        const ls = lines(ctx, S, d.steps[i], size, stub.w - 40 * u, { weight: 700 });
        ls.forEach((l, k) => txt(ctx, S, th, l, stub.x + stub.w / 2, stub.y + stub.h / 2 + (k - (ls.length - 1) / 2) * size * 1.12, size, { align: "center", weight: 700, max: stub.w - 30 * u, min: 40 * u }));
        if (last) {
          const sq = back(seg(p, 0.72, 0.95));
          if (sq > 0) {
            const sr = Math.min(tw, tH) * (vertical ? 0.3 : 0.2), scx = x + tw - sr * 0.55, scy = y + sr * 0.55;
            ctx.save(); ctx.translate(scx, scy); ctx.scale(1.6 - 0.6 * sq, 1.6 - 0.6 * sq); ctx.translate(-scx, -scy); ctx.globalAlpha *= clamp(sq * 3);
            seal(ctx, S, th, scx, scy, sr, t * 0.3, "star", { seed: 27, lifted: 0.8 });
            ctx.restore();
          }
        }
        glint(ctx, th, x + tw * 0.8, y + tH * 0.15, 40 * u, blink(t, i * 1.3, 0.45));
        ctx.restore(); F.boost = pb;
      });
    }
  }

  // A round foil medallion with an embossed white glyph that keeps moving: a turning repeat arrow, or a
  // dial whose needle settles on the value and keeps breathing.
  function foilIcon(ctx, S, th, kind, cx, cy, r, hot, t, grow) {
    const u = S.u;
    sticker(ctx, S, th, circP(cx, cy, r), cx - r, cy - r, r * 2, r * 2, { seed: hot ? 161 : 167, sat: hot ? 1 : 0.06, border: 9, res: 0.55, lifted: 0.8, hero: hot });
    if (F.back) return;
    ctx.save();
    ctx.shadowColor = "rgba(20,10,50,0.4)"; ctx.shadowBlur = 8 * u; ctx.shadowOffsetY = 3 * u;
    ctx.strokeStyle = ctx.fillStyle = th.paper; ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (kind === "repeat") {
      ctx.translate(cx, cy); ctx.rotate(t * 0.7);
      const rr2 = r * 0.5, lw = r * 0.15;
      ctx.lineWidth = lw;
      for (const o of [0, Math.PI]) {
        const a0 = o + 0.35, a1 = o + Math.PI - 0.35;
        ctx.beginPath(); ctx.arc(0, 0, rr2, a0, a1); ctx.stroke();
        const hx = Math.cos(a1) * rr2, hy = Math.sin(a1) * rr2, tx = -Math.sin(a1), ty = Math.cos(a1);
        ctx.beginPath(); ctx.moveTo(hx + tx * lw * 1.6, hy + ty * lw * 1.6);
        ctx.lineTo(hx + Math.cos(a1) * lw * 1.3, hy + Math.sin(a1) * lw * 1.3); ctx.lineTo(hx - Math.cos(a1) * lw * 1.3, hy - Math.sin(a1) * lw * 1.3); ctx.closePath(); ctx.fill();
      }
    } else {
      ctx.translate(cx, cy);
      ctx.lineWidth = r * 0.06;
      for (let i = 0; i <= 10; i++) { const a = -Math.PI * 1.2 + (i / 10) * Math.PI * 1.4; const r0 = r * (i % 5 ? 0.6 : 0.52); ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7); ctx.stroke(); }
      const na = -Math.PI * 1.2 + Math.PI * 1.4 * (0.15 + 0.6 * grow) + Math.sin(t * 1.6) * 0.09;
      ctx.lineWidth = r * 0.12;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(na) * r * 0.5, Math.sin(na) * r * 0.5); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.13, 0, TAU); ctx.fill();
    }
    ctx.restore();
    if (hot) glint(ctx, th, cx - r * 0.4, cy - r * 0.45, r * 0.7, blink(t, 3.3, 0.5));
  }

  function compareScene(ctx, S, th, A, p, d, X) {
    const u = S.u, t = X.t;
    const vertical = S.tall;
    const gap = (vertical ? 120 : 170) * u;
    const cw = vertical ? A.w : (A.w - gap) / 2, ch = vertical ? (A.h - gap) / 2 : A.h * 0.92;
    const maxV = Math.max(Math.abs(d.leftValue), Math.abs(d.rightValue), 1);
    const cards = [[d.left, d.leftValue, 0], [d.right, d.rightValue, 1]];
    // The meter fills slowly through the whole hold, so the end card never stops.
    const slow = X.leaving ? 1 : clamp((X.local - 0.6) / Math.max(0.8, (X.hold || 3) - 0.9));
    cards.forEach(([label, value, i]) => {
      const q = X.q(i * 1.5);
      if (q <= 0) return;
      const x = vertical ? A.x : A.x + i * (cw + gap), y = vertical ? A.y + i * (ch + gap) : A.y + (A.h - ch) / 2;
      const grow = eo(seg(p, 0.1 + i * 0.25, 0.6 + i * 0.25));
      const hot = i === 1;
      turned(ctx, x + cw / 2, y + ch / 2, q, () => {
        const pb = F.boost;
        ctx.save(); sway(ctx, S, x + cw / 2, y + ch / 2, t, i * 2 + 0.5, 0.8);
        const cardP = rrP(x, y, cw, ch, 34 * u);
        sticker(ctx, S, th, cardP, x, y, cw, ch, { seed: 120 + i * 9, sat: hot ? 1 : 0.06, lift: hot ? 1 : 1.8, glare: hot ? 1 : 0.4, glitter: hot ? 1 : 0.2, hero: hot ? 0.7 : false });
        const ins = 26 * u, ix = x + ins, iy = y + ins, iw = cw - ins * 2, ih = ch - ins * 2;
        plate(ctx, S, th, ix, iy, iw, ih, 22 * u, { shadow: false });
        const ir = Math.min(ih * 0.17, iw * 0.14), icx = ix + iw - 38 * u - ir, icy = iy + ih * 0.3;
        txt(ctx, S, th, label, ix + 38 * u, iy + 62 * u, 48 * u, { weight: 700, color: th.plateMuted, max: Math.max(200 * u, icx - ir - 30 * u - (ix + 38 * u)), min: 42 * u });
        const num = window.DreamcutMotion.formatNumber(value * grow, 0, d.prefix, d.suffix);
        const big = Math.min(260 * u, ih * 0.5);
        const final = window.DreamcutMotion.formatNumber(value, 0, d.prefix, d.suffix);
        const z = fitSize(ctx, S, final, big, iw - 76 * u, 96 * u, { weight: 800, fam: "figures" });
        const ny = iy + ih * 0.7;
        if (hot) foilText(ctx, S, th, num, ix + 38 * u, ny, z, { seed: 131 });
        else txt(ctx, S, th, num, ix + 38 * u, ny, z, { weight: 800, fam: "figures", base: "alphabetic", color: "#6e6a80" });
        // A foil medallion fills the right of the panel: re-prompting turns, tuning settles on a dial.
        if (!F.back) {
          const iq = back(seg(p, 0.2 + i * 0.25, 0.55 + i * 0.25));
          if (iq > 0) {
            ctx.save(); ctx.translate(icx, icy); ctx.scale(iq, iq); ctx.translate(-icx, -icy);
            foilIcon(ctx, S, th, hot ? "dial" : "repeat", icx, icy + Math.sin(t * 1.2 + i * 2) * 4 * u, ir, hot, t, hot ? slow : grow);
            ctx.restore();
          }
          // A row of pips that tick up with the count.
          const nP = Math.min(12, Math.round(Math.abs(value)));
          const numW = textW(ctx, S, final, z, { weight: 800, fam: "figures" });
          const px0 = Math.max(ix + iw * 0.44, ix + 38 * u + numW + 50 * u), px1 = ix + iw - 38 * u;
          const sp = nP ? Math.min(78 * u, (px1 - px0) / nP) : 0, pr = Math.min(24 * u, sp * 0.36);
          if (nP && pr > 8 * u) {
            const py = ny - z * 0.26;
            const ping = fract(t * 0.45 + i * 0.3) * (nP + 3) - 1.5;
            for (let k = 0; k < nP; k++) {
              const pcx = px0 + sp * (k + 0.5);
              ctx.save(); ctx.beginPath(); ctx.arc(pcx, py, pr, 0, TAU); ctx.fillStyle = "rgba(40,30,90,0.1)"; ctx.fill();
              ctx.lineWidth = 2 * u; ctx.strokeStyle = "rgba(40,30,90,0.2)"; ctx.stroke(); ctx.restore();
              const on = back(clamp(Math.abs(value) * grow - k));
              if (on > 0.01) {
                const rk = pr * on;
                drawFoil(ctx, S, th, circP(pcx, py, rk), pcx - rk, py - rk, rk * 2, rk * 2, { seed: 170 + k + i * 13, sat: hot ? 1 : 0.08, res: 0.6, glitter: 0.6 });
                ctx.save(); ctx.beginPath(); ctx.arc(pcx, py, rk, 0, TAU); ctx.lineWidth = 3 * u; ctx.strokeStyle = th.paper; ctx.stroke(); ctx.restore();
                const near = Math.max(0, 1 - Math.abs(ping - k));
                if (near > 0) glint(ctx, th, pcx + rk * 0.3, py - rk * 0.35, pr * 1.6, near * (hot ? 1 : 0.6));
              }
            }
          }
        }
        // Meter: an inset track that fills with foil, a bright bead running along the fill.
        const mx = ix + 38 * u, my = iy + ih - 64 * u, mw = iw - 76 * u, mh = 24 * u;
        ctx.save(); ctx.beginPath(); rr(ctx, mx, my, mw, mh, mh / 2); ctx.fillStyle = "rgba(40,30,90,0.1)"; ctx.fill();
        ctx.lineWidth = 2 * u; ctx.strokeStyle = "rgba(40,30,90,0.18)"; ctx.stroke(); ctx.restore();
        const fw = mw * clamp(Math.abs(value) / maxV) * (hot ? slow : grow);
        if (fw > 2) {
          drawFoil(ctx, S, th, rrP(mx, my, fw, mh, mh / 2), mx, my, fw, mh, { seed: 140 + i, sat: hot ? 1 : 0.1, res: 0.5 });
          if (hot) glint(ctx, th, mx + fw, my + mh / 2, 44 * u, 0.55 + 0.35 * Math.sin(t * 3));
          const bf = fract(t * 0.5 + i * 0.4);
          const bg2 = ctx.createRadialGradient(mx + fw * bf, my + mh / 2, 0, mx + fw * bf, my + mh / 2, mh * 1.6);
          bg2.addColorStop(0, "rgba(255,255,255,0.85)"); bg2.addColorStop(1, "rgba(255,255,255,0)");
          ctx.save(); ctx.beginPath(); rr(ctx, mx, my, fw, mh, mh / 2); ctx.clip(); ctx.fillStyle = bg2; ctx.fillRect(mx, my, fw, mh); ctx.restore();
        }
        // A slow sheen across the whole card, panel and all.
        {
          const per = 3.2, f = fract(t / per + i * 0.45), bw = Math.max(cw, ch) * 0.28;
          const sx = x - bw * 2 + f * (cw + bw * 4);
          ctx.save(); cardP(ctx); ctx.clip();
          const g = ctx.createLinearGradient(sx - bw, y, sx + bw, y + ch * 0.6);
          if (hot) { g.addColorStop(0, rgba(th.foil[0], 0)); g.addColorStop(0.3, rgba(th.foil[1], 0.2)); g.addColorStop(0.5, "rgba(255,255,255,0.28)"); g.addColorStop(0.7, rgba(th.foil[4], 0.2)); g.addColorStop(1, rgba(th.foil[5], 0)); }
          else { g.addColorStop(0, "rgba(180,184,200,0)"); g.addColorStop(0.5, "rgba(170,175,195,0.26)"); g.addColorStop(1, "rgba(180,184,200,0)"); }
          ctx.fillStyle = g; ctx.fillRect(x, y, cw, ch); ctx.restore();
        }
        if (hot) {
          glint(ctx, th, x + cw * 0.86, y + ch * 0.12, 80 * u, blink(t, 0.2, 0.5));
          glint(ctx, th, ix + 38 * u + z * 0.9, ny - z * 0.7, 56 * u, blink(t, 0.7, 0.41) * grow);
          glint(ctx, th, x + cw * 0.12, y + ch * 0.9, 50 * u, blink(t, 1.4, 0.47));
        }
        ctx.restore(); F.boost = pb;
      });
    });
    // The bridge medallion between the two cards, bobbing gently.
    const mq = X.q(1) * back(seg(p, 0.3, 0.55));
    if (mq > 0) {
      const mx = vertical ? A.x + A.w / 2 : A.x + cw + gap / 2, my = (vertical ? A.y + ch + gap / 2 : A.y + A.h / 2) + Math.sin(t * 1.7) * 9 * u;
      const r = (vertical ? 62 : 70) * u;
      ctx.save(); ctx.translate(mx, my); ctx.scale(clamp(mq, 0, 1.2), clamp(mq, 0, 1.2)); ctx.translate(-mx, -my);
      seal(ctx, S, th, mx, my, r, t * 0.25 + Math.sin(t * 1.1) * 0.15, vertical ? "down" : "arrow", { seed: 33, lifted: 0.8 + 0.2 * Math.sin(t * 1.7) });
      ctx.restore();
    }
  }

  const ORIGINAL = {
    bg: "#efedf5", panel: "#ffffff", ink: "#1d1a33", muted: "rgba(29,26,51,0.66)", accent: "#d63c96", onAccent: "#ffffff",
    rule: "rgba(29,26,51,0.25)", track: "rgba(29,26,51,0.1)",
    ground: ["#f6f3fb", "#ece9f3", "#f5eef2"], foil: FOIL, foilSat: 1, paperColor: "#ffffff",
  };
  const kickerCss = (look) => {
    const stops = (look.foil || FOIL).concat([(look.foil || FOIL)[0]]).join(", ");
    const ink = rgb(look.ink), paper = look.paperColor || "#ffffff";
    return `.scene h2.display { position: relative; }
    .scene h2.display::after { content: ""; position: absolute; left: 0.04em; bottom: -0.34em; width: 2.4em; height: 0.15em; border-radius: 999px;
      background: linear-gradient(100deg, ${stops}); border: 0.045em solid ${paper}; box-shadow: 0 0.08em 0.25em ${rgba(ink, 0.22)}; filter: saturate(${look.foilSat ?? 1}); }
    #title-scene .kicker { align-self: flex-start; padding: 0.5em 1.1em; border-radius: 999px; letter-spacing: 0.14em; color: #1d1a33; text-shadow: 0 1px 0 rgba(255,255,255,0.7);
      background: linear-gradient(105deg, ${stops}); border: 0.22em solid #ffffff; box-shadow: 0 0.35em 1em rgba(60,40,120,0.25), inset 0 1px 0 rgba(255,255,255,0.8);
      filter: saturate(${look.foilSat ?? 1}); }`;
  };

  return {
    ...ORIGINAL,
    display: "'Avenir Next', Avenir, 'Futura', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif", displayWeight: 800, displayCase: "none", displayTracking: "-0.02em",
    body: "'Avenir Next', Avenir, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif", bodyWeight: 600,
    figures: "'Avenir Next', Avenir, 'Futura', 'Segoe UI', Arial, sans-serif", radius: 26, motion: "wipe", change: "fade",
    kit: { line: 3, fill: "solid", panel: "fill" },
    panelEdge: "rgba(255,255,255,0.95)",
    palettes: {
      // Daylight: bright white stock with warmer, gold-leaning foil. Night: black stock, deep saturated foil.
      // Mono: silver foil on grey stock.
      light: { bg: "#fbfaf7", ink: "#24180f", muted: "rgba(36,24,15,0.66)", accent: "#c0571c", ground: ["#fffdf8", "#f7f3ec", "#fdf6f2"],
        foil: ["#ffcf5c", "#fff0a8", "#ffab7a", "#ff8cc6", "#b49cff", "#86e4ff"] },
      dark: { bg: "#100f1c", panel: "#1d1a33", ink: "#f6f4ff", muted: "rgba(246,244,255,0.72)", accent: "#7df9ff", onAccent: "#100f1c", rule: "rgba(255,255,255,0.3)", track: "rgba(255,255,255,0.12)",
        ground: ["#191730", "#100f1c", "#16112a"], foil: ["#ff4fb0", "#ff9a4a", "#ffe24a", "#3cf5a8", "#3cc8ff", "#8a5cff"], paperColor: "#f4f2fa",
        textShadow: () => "0 3px 18px rgba(0,0,0,0.6)" },
      mono: { bg: "#e8e9ee", ink: "#1b1d24", muted: "rgba(27,29,36,0.66)", accent: "#3b3f4c", ground: ["#f1f2f5", "#e4e6eb", "#eceef2"],
        foil: ["#c9ccd6", "#f2f3f7", "#9ea3b0", "#e2e5ec", "#b3b8c4", "#fafbfd"], foilSat: 0 },
    },
    textShadow: () => "0 2px 0 rgba(255,255,255,0.85), 0 8px 22px rgba(60,40,120,0.16)",
    backdrop: (accent, texture = 1, look) => `${grain(0.05 * texture)}, linear-gradient(135deg, ${(look && look.ground ? look.ground : ORIGINAL.ground).join(", ")})`,
    css: (accent, look) => kickerCss(look),
    // Other templates get the pearl sheet on their texture canvas.
    paint: (ctx, W, H, t, accent, look) => {
      const S = { W, H, u: Math.min(W, H) / 1080, look, accent };
      const th = theme(S);
      F.t = t; F.boost = 0;
      ctx.clearRect(0, 0, W, H);
      ground(ctx, S, th, t, t * 0.03);
    },
    keepArt: true,
    overlap: true,
    stage(ctx, S, info) {
      const th = theme(S);
      F.t = info.t; F.boost = 0; F.scene = info.scene; F.next = info.next;
      const ch = Math.max(0.01, info.change);
      const pan = info.index <= 0 ? 0 : info.index - 1 + eio(clamp(info.local / (ch * 1.8)));
      if (S.paint) {
        ground(ctx, S, th, info.t, pan + info.t * 0.012);
        // Prism streaks: one at every change, and a slower one through each hold.
        if (info.index > 0) streak(ctx, S, th, info.local / (ch * 2.4), 1);
        streak(ctx, S, th, fract(info.t / 3.6 + 0.4) * 1.6 - 0.3, 0.6);
        frame(ctx, S, th);
      }
      // The title has no drawer, so its art turns away here: it starts with the words' own exit and
      // finishes as the next drawing rises, so the change never empties the frame.
      const ctl = (window.__dreamcut && window.__dreamcut.controls) || {};
      const titleHold = Number(ctl.title_hold ?? 2.4);
      if (info.index === 1 && titleHold > 0 && info.local < ch) {
        statementArt(ctx, S, th, { scene: "title", t: info.t, local: titleHold + info.local, hold: titleHold, change: ch, exit: 0.5 + 0.5 * clamp(info.local / ch) });
      }
      if (info.scene === "title") {
        const ex = info.next && info.local > info.hold - ch ? clamp((info.local - (info.hold - ch)) / (2 * ch), 0, 0.5) : undefined;
        statementArt(ctx, S, th, ex === undefined ? info : { ...info, exit: ex });
      }
      if (info.scene === "closing") {
        const keys = ["title", "chart", "object", "people", "process", "compare"];
        let prev = null;
        for (const k of keys) if (Number(ctl[k + "_hold"] ?? 0) > 0) prev = k;
        statementArt(ctx, S, th, { ...info, fromDevice: prev === "object" && info.index > 0 });
      }
      headReveal(S, info);
    },
    scenes: { chart: wrap(chartScene), object: wrap(objectScene), people: wrap(peopleScene), process: wrap(processScene), compare: wrap(compareScene) },
  };
});
