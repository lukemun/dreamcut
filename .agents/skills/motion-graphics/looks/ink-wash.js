// Ink Wash: a sumi-e handscroll. Warm rice paper with fibres and mottling, a lake of distant
// islands painted in graded grey washes that bleed into drifting mist, a pale moon held in negative
// space, a foreground drawn from each scene's own subject and plum petals falling through every hold.
// Every drawing is brushed: tapered strokes with dry-brush streaks in their tails, washes that
// bleed at the edges and vermilion seals where a step lands. Scenes sit
// along the scroll; at each change the scroll travels left through a bank of mist, so the outgoing
// drawing dissolves while the next one is brushed in. All motifs are original. Frames are pure
// functions of time.
window.DreamcutMotion.register("ink-wash", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const inout = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const fract = (v) => v - Math.floor(v);
  const hash = (a, b = 0) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
  const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif";
  const DRAWN = ["chart", "object", "people", "process", "compare"];
  const ORDER = ["title", ...DRAWN, "closing"];

  // ---- noise and paths ------------------------------------------------------------------------------
  // Smooth value noise that repeats every n units, so painted strips tile without a seam.
  function loopNoise(seed, n) {
    const r = rng(seed), v = Array.from({ length: n }, () => r() * 2 - 1);
    return (x) => { x = ((x % n) + n) % n; const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f); return v[i] + (v[(i + 1) % n] - v[i]) * s; };
  }
  // Catmull-Rom through control points.
  function spline(P, seg = 10) {
    if (P.length < 3) {
      const out = [];
      for (let k = 0; k <= seg; k++) out.push([lerp(P[0][0], P[1][0], k / seg), lerp(P[0][1], P[1][1], k / seg)]);
      return out;
    }
    const out = [];
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || P[i + 1];
      for (let k = 0; k < seg; k++) {
        const t = k / seg, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    out.push(P[P.length - 1].slice());
    return out;
  }
  function resample(pts, ds) {
    const out = [[pts[0][0], pts[0][1]]];
    let need = ds;
    for (let i = 1; i < pts.length; i++) {
      let ax = pts[i - 1][0], ay = pts[i - 1][1];
      const bx = pts[i][0], by = pts[i][1];
      let d = Math.hypot(bx - ax, by - ay);
      while (d >= need) { const k = need / d; ax += (bx - ax) * k; ay += (by - ay) * k; out.push([ax, ay]); d -= need; need = ds; }
      need -= d;
    }
    const L = pts[pts.length - 1], o = out[out.length - 1];
    if (Math.hypot(L[0] - o[0], L[1] - o[1]) > ds * 0.3) out.push([L[0], L[1]]);
    return out;
  }
  // A point and direction a fraction k along a resampled path.
  function along(pts, k) {
    const i = clamp(k) * (pts.length - 1), a = Math.floor(i), b = Math.min(pts.length - 1, a + 1), f = i - a;
    const p = [lerp(pts[a][0], pts[b][0], f), lerp(pts[a][1], pts[b][1], f)];
    const c = pts[Math.max(0, a - 2)], e = pts[Math.min(pts.length - 1, a + 3)];
    return { x: p[0], y: p[1], ang: Math.atan2(e[1] - c[1], e[0] - c[0]) };
  }

  // ---- the brush ------------------------------------------------------------------------------------
  // One brush stroke along control points: the tip lands thin, swells, then lifts to a taper; the tail
  // breaks into dry-brush streaks. q draws the first q of the stroke with a wet round head.
  function brush(g, F, ctrl, o = {}) {
    const q = o.q ?? 1;
    if (q <= 0 || ctrl.length < 2) return null;
    const u = F.u;
    const pts = resample(o.raw ? ctrl : spline(ctrl, o.seg || 10), o.ds || 2.2 * u);
    const n = pts.length;
    if (n < 2) return null;
    const m = Math.max(2, Math.min(n, Math.ceil(n * q)));
    const w = o.w ?? 10 * u, ti = o.ti ?? 0.12, to = o.to ?? 0.35, mn = o.min ?? 0.05, ph = (o.seed || 1) * 1.7, wob = o.wob ?? 0.12;
    const Lp = [], Rp = [], hw = [];
    for (let i = 0; i < m; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const s = i / (n - 1);
      let pr = Math.min(1, Math.pow(s / ti, 0.55)) * Math.min(1, Math.pow(Math.max(0, 1 - s) / to, 0.7));
      pr = Math.max(mn, pr) * (1 + wob * Math.sin(s * 9.1 + ph) * Math.sin(s * 3.3 + ph * 2));
      const h = (w * pr) / 2;
      hw.push(h);
      Lp.push([pts[i][0] - dy * h, pts[i][1] + dx * h]);
      Rp.push([pts[i][0] + dy * h, pts[i][1] - dx * h]);
    }
    g.save();
    g.fillStyle = o.color;
    g.beginPath();
    g.moveTo(Lp[0][0], Lp[0][1]);
    for (let i = 1; i < m; i++) g.lineTo(Lp[i][0], Lp[i][1]);
    for (let i = m - 1; i >= 0; i--) g.lineTo(Rp[i][0], Rp[i][1]);
    g.closePath();
    g.fill();
    if (o.wet && m > 3) {
      // A wet stroke: pigment pools darker toward its edges and in blotches, fibres show through.
      const tex = F.S.look.texture, sd = (o.seed || 3) * 7.1;
      g.save();
      g.clip();
      g.filter = `blur(${1.2 * u}px)`; g.strokeStyle = o.color; g.lineWidth = Math.max(2 * u, w * 0.14); g.globalAlpha = 0.75; g.stroke();
      g.filter = "none";
      for (let i = 0; i < m; i += Math.max(2, Math.floor(m / 6))) {
        const r = w * (0.5 + hash(sd, i) * 0.7), [px, py] = pts[i], gr = g.createRadialGradient(px, py, 0, px, py, r);
        g.globalAlpha = hash(sd, i + 5) > 0.55 ? 0.55 : 0.3 * tex;
        const lite = hash(sd, i + 5) <= 0.55;
        gr.addColorStop(0, lite ? F.paper(0.8) : o.color); gr.addColorStop(1, lite ? F.paper(0) : "rgba(0,0,0,0)");
        g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2);
      }
      g.globalAlpha = 1; g.lineCap = "round";
      for (let i = 0; i < Math.min(40, m); i++) {
        const j = Math.floor(hash(sd, i + 40) * (m - 1)), off = (hash(sd, i + 60) - 0.5) * 1.6, P0 = pts[j], P1 = pts[Math.min(m - 1, j + 3)];
        const nx = (Lp[j][0] - Rp[j][0]) * 0.5 * off, ny = (Lp[j][1] - Rp[j][1]) * 0.5 * off;
        g.strokeStyle = F.paper((0.25 + hash(sd, i + 80) * 0.4) * tex); g.lineWidth = (0.6 + hash(sd, i + 90) * 1.4) * u;
        g.beginPath(); g.moveTo(P0[0] + nx, P0[1] + ny); g.lineTo(P1[0] + nx, P1[1] + ny); g.stroke();
      }
      g.restore();
    }
    if (q < 1) { g.beginPath(); g.arc(pts[m - 1][0], pts[m - 1][1], hw[m - 1] * 1.08 + 0.6 * u, 0, TAU); g.fill(); }
    const dry = o.dry ?? 0.35;
    if (dry > 0 && w > 3 * u) {
      g.globalCompositeOperation = "destination-out";
      g.lineCap = "round";
      const seed = (o.seed || 7) * 13.37;
      const K = Math.max(3, Math.round(w / (2.8 * u)));
      for (let k = 0; k < K; k++) {
        const off = (hash(seed, k) - 0.5) * 1.7;
        const start = 1 - dry * (0.3 + hash(seed, k + 50) * 0.8);
        g.lineWidth = (0.5 + hash(seed, k + 90) * 1.3) * u * Math.max(1, w / (16 * u));
        const i0 = Math.max(0, Math.floor(start * (n - 1)));
        for (let i = i0; i < m - 1; i += 4) {
          const j = Math.min(m - 1, i + 4), s = i / (n - 1);
          const a = clamp((s - start) / (1 - start + 1e-3)) * (0.5 + hash(seed + k, i) * 0.5);
          if (a < 0.04 || hash(seed + k * 3, i + 7) < 0.18) continue;
          g.strokeStyle = `rgba(0,0,0,${a})`;
          g.beginPath();
          for (let h = i; h <= j; h++) {
            const x = lerp(Rp[h][0], Lp[h][0], 0.5 + off * 0.5), y = lerp(Rp[h][1], Lp[h][1], 0.5 + off * 0.5);
            if (h === i) g.moveTo(x, y); else g.lineTo(x, y);
          }
          g.stroke();
        }
      }
    }
    g.restore();
    return { pts, m, n, end: pts[m - 1] };
  }
  // A wash: a soft fill whose edge bleeds, optionally with a pooled darker rim.
  function wash(g, trace, color, blur, rim) {
    g.save();
    if (blur > 0.3) g.filter = `blur(${blur}px)`;
    g.fillStyle = color;
    g.beginPath(); trace(g); g.fill();
    if (rim) { g.filter = `blur(${Math.max(0.4, blur * 0.3)}px)`; g.lineWidth = rim.w; g.strokeStyle = rim.color; g.stroke(); }
    g.restore();
  }
  function blot(g, x, y, r, color, blur = 0) { wash(g, (c) => c.arc(x, y, Math.max(0.1, r), 0, TAU), color, blur); }
  // Pigment pooled inside a shape: a feathered bleed past the edge, uneven density, a darker wet rim
  // where the wash dried, and paper fibres showing through dry spots. col(a) gives the ink colour.
  function pigment(g, F, trace, col, a, seed, bb, o = {}) {
    if (a <= 0.003) return;
    const u = F.u, tex = F.S.look.texture, M = Math.max(bb.w, bb.h);
    g.save();
    g.filter = `blur(${(o.bleed ?? 3) * u}px)`;
    g.fillStyle = col(a * 0.4); g.beginPath(); trace(g); g.fill();
    g.filter = "none";
    g.beginPath(); trace(g); g.clip();
    g.fillStyle = col(a * 0.6); g.fillRect(bb.x - 4 * u, bb.y - 4 * u, bb.w + 8 * u, bb.h + 8 * u);
    const n = o.blots ?? 8;
    for (let i = 0; i < n; i++) {
      const x = bb.x + hash(seed, i) * bb.w, y = bb.y + hash(seed, i + 20) * bb.h, r = M * (0.14 + hash(seed, i + 40) * 0.3), lite = hash(seed, i + 60) > 0.62;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      if (lite) { gr.addColorStop(0, F.paper(0.34 * tex)); gr.addColorStop(1, F.paper(0)); } else { gr.addColorStop(0, col(a * (0.3 + hash(seed, i + 70) * 0.35))); gr.addColorStop(1, col(0)); }
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.filter = `blur(${1.3 * u}px)`; g.strokeStyle = col(Math.min(1, a * 1.3)); g.lineWidth = (o.rim ?? 5) * u; g.beginPath(); trace(g); g.stroke();
    g.filter = "none"; g.lineCap = "round";
    const dn = o.dry ?? Math.round(clamp(M / (14 * u), 6, 40));
    for (let i = 0; i < dn; i++) {
      const x = bb.x + hash(seed, i + 80) * bb.w, y = bb.y + hash(seed, i + 100) * bb.h, L = (8 + hash(seed, i + 120) * 34) * u, ang = (o.grain ?? -0.25) + (hash(seed, i + 140) - 0.5) * 0.5;
      g.strokeStyle = F.paper((0.2 + 0.4 * hash(seed, i + 160)) * tex); g.lineWidth = (0.7 + hash(seed, i + 180) * 1.8) * u;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * L, y + Math.sin(ang) * L); g.stroke();
    }
    g.restore();
  }
  // Lettering is inked, not typeset: each line is laid with slightly spread, uneven edges and paper
  // fibres breaking through, and it arrives under a sweeping brush stroke whose front bleeds.
  const TXT = { a: null, m: null };
  function textLayer(k, w, h) {
    let c = TXT[k];
    if (!c) c = TXT[k] = document.createElement("canvas");
    if (c.width < w || c.height < h) { c.width = Math.max(c.width, w); c.height = Math.max(c.height, h); }
    const x = c.getContext("2d"); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = "source-over"; x.filter = "none"; x.clearRect(0, 0, Math.min(c.width, w + 4), Math.min(c.height, h + 4));
    return [c, x];
  }
  function inkText(g, F, s, x0, yBase, size, font, color, q, w, solid = false) {
    const u = F.u, tex = F.S.look.texture, pad = Math.ceil(size * 0.5), cw = Math.ceil(w + pad * 2), ch = Math.ceil(size * 1.9), by = Math.round(size * 1.3);
    let seed = 0; for (let i = 0; i < s.length; i++) seed = (seed * 31 + s.charCodeAt(i)) % 9973;
    const [A, a] = textLayer("a", cw, ch), dens = solid ? 0.3 : 1;
    a.font = font; a.textAlign = "left"; a.textBaseline = "alphabetic"; a.fillStyle = color;
    // Spread: faint offset impressions around the main one so the edges swell unevenly.
    // Hand-set: each letter sits a touch off the line and off the vertical, as a brush would leave it.
    const chars = [...s], cwid = chars.map((ch) => a.measureText(ch).width), sum = cwid.reduce((p, v) => p + v, 0) || 1, k = w / sum;
    const lay = (dx, dy) => {
      let xx = pad;
      chars.forEach((ch, i) => {
        if (ch !== " ") {
          const j = hash(seed, i * 3 + 400) - 0.5, r = (hash(seed, i * 3 + 401) - 0.5) * 0.045;
          a.save(); a.translate(xx + dx + cwid[i] * k * 0.5, by + dy + j * size * 0.035); a.rotate(r); a.fillText(ch, -cwid[i] * 0.5, 0); a.restore();
        }
        xx += cwid[i] * k;
      });
    };
    // Spread: faint offset impressions around the main one so the edges swell unevenly and pool.
    a.globalAlpha = 0.34;
    for (let m = 0; m < 5; m++) lay((hash(seed, m) - 0.5) * Math.max(1.2 * u, size * 0.016), (hash(seed, m + 9) - 0.5) * Math.max(1 * u, size * 0.012));
    a.globalAlpha = 1; lay(0, 0);
    // Uneven pigment and dry fibres inside the letters.
    a.globalCompositeOperation = "destination-out"; a.lineCap = "round";
    const fib = Math.round(w / (4 * u));
    for (let i = 0; i < fib; i++) {
      const x = pad + hash(seed, i + 30) * w, y = by - size * hash(seed, i + 60) * 0.8, L = (6 + hash(seed, i + 90) * 22) * u;
      a.strokeStyle = `rgba(0,0,0,${(0.3 + hash(seed, i + 120) * 0.4) * tex * dens})`; a.lineWidth = (0.6 + hash(seed, i + 150) * 1.1) * u;
      a.beginPath(); a.moveTo(x, y); a.lineTo(x + L, y - L * 0.12); a.stroke();
    }
    for (let i = 0; i < 4; i++) {
      const x = pad + hash(seed, i + 200) * w, y = by - size * 0.4, r = size * (0.5 + hash(seed, i + 210) * 0.6);
      const gr = a.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(0,0,0,${0.3 * tex * dens})`); gr.addColorStop(1, "rgba(0,0,0,0)");
      a.fillStyle = gr; a.fillRect(x - r, y - r, r * 2, r * 2);
    }
    if (q < 1) {
      // The reveal: one loaded stroke sweeps across, with a few bristles running just ahead of it.
      const [Mk, m] = textLayer("m", cw, ch), my = by - size * 0.34;
      brush(m, F, [[pad - size * 0.35, my + size * 0.06], [pad + w * 0.5, my - size * 0.04], [pad + w + size * 0.35, my + size * 0.03]], { w: size * 1.7, q: inout(q), color: "#000", ti: 0.01, to: 0.01, min: 0.95, dry: 0, wob: 0.06, seed: seed + 1 });
      for (let k = 0; k < 5; k++) {
        const oy = (k / 4 - 0.5) * size * 1.2;
        brush(m, F, [[pad - size * 0.35, my + oy], [pad + w + size * 0.35, my + oy + (hash(seed, k + 300) - 0.5) * size * 0.2]], { w: size * 0.22, q: clamp(inout(q) + 0.015 + hash(seed, k + 310) * 0.05), color: "#000", ti: 0.02, to: 0.02, min: 0.9, dry: 0, seed: seed + 10 + k });
      }
      a.globalCompositeOperation = "destination-in"; a.drawImage(Mk, 0, 0);
    }
    a.globalCompositeOperation = "source-over";
    const dx = x0 - pad, dy = yBase - by;
    g.drawImage(A, 0, 0, cw, ch, dx, dy, cw, ch);
  }
  function write(g, F, s, x, y, size, o = {}) {
    s = String(s ?? "");
    const q = o.q ?? 1;
    if (!s || q <= 0) return 0;
    const font = (sz) => `${o.italic ? "italic " : ""}${o.weight || 500} ${sz}px ${SERIF}`;
    g.save();
    g.font = font(size);
    let w = g.measureText(s).width;
    if (o.maxW && w > o.maxW) { size = Math.max(o.min || size * 0.72, (size * o.maxW) / w); g.font = font(size); w = g.measureText(s).width; }
    g.restore();
    const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    inkText(g, F, s, x0, y, size, font(size), o.color, q, w, !!o.solid);
    return w;
  }
  const fmt = (v, d) => window.DreamcutMotion.formatNumber(v, Math.abs((Number(v) || 0) % 1) > 0.001 ? 1 : 0, (d && d.prefix) || "", (d && d.suffix) || "");
  // A figure counting toward its target keeps the target's own decimals on every frame.
  const tally = (target, k, d) => fmt(target * k, d).replace(/\.\d+$/, (m) => (Math.abs((Number(target) || 0) % 1) > 0.001 ? m : ""));

  // A vermilion seal: it lands slightly large and settles, with carved lines and worn speckles.
  function seal(g, F, x, y, s, q, seed, glyph) {
    if (q <= 0) return;
    const u = F.u, k = ease(span(q, 0, 0.45));
    g.save();
    g.translate(x, y);
    g.rotate((hash(seed, 3) - 0.5) * 0.08);
    g.scale(lerp(1.3, 1, k), lerp(1.3, 1, k));
    g.globalAlpha *= span(q, 0, 0.2);
    const h = s / 2;
    g.beginPath();
    for (let i = 0; i < 24; i++) {
      const side = Math.floor(i / 6), f = (i % 6) / 6, j = (hash(seed, i) - 0.5) * s * 0.035;
      const px = side === 0 ? -h + f * s : side === 1 ? h + j : side === 2 ? h - f * s : -h + j;
      const py = side === 0 ? -h + j : side === 1 ? -h + f * s : side === 2 ? h + j : h - f * s;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    g.fillStyle = F.acc(0.92);
    g.fill();
    g.globalCompositeOperation = "destination-out";
    g.strokeStyle = "rgba(0,0,0,0.92)";
    g.fillStyle = "rgba(0,0,0,0.92)";
    g.lineCap = "square";
    if (glyph) {
      g.font = `600 ${s * 0.62}px ${SERIF}`;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(glyph, 0, s * 0.04);
    } else {
      // Carved lines: a thin inner frame and an abstract cut in each quarter.
      g.lineWidth = s * 0.045;
      g.strokeRect(-h * 0.78, -h * 0.78, h * 1.56, h * 1.56);
      g.lineWidth = s * 0.075;
      for (let c = 0; c < 4; c++) {
        const cx = (c % 2 ? 0.36 : -0.36) * s, cy = (c < 2 ? -0.36 : 0.36) * s, r = s * 0.2;
        const kind = Math.floor(hash(seed, c + 10) * 4);
        g.beginPath();
        if (kind === 0) { g.moveTo(cx - r * 0.7, cy - r * 0.4); g.lineTo(cx + r * 0.7, cy - r * 0.4); g.moveTo(cx - r * 0.7, cy + r * 0.4); g.lineTo(cx + r * 0.7, cy + r * 0.4); }
        else if (kind === 1) { g.moveTo(cx - r * 0.6, cy - r * 0.7); g.lineTo(cx - r * 0.6, cy + r * 0.6); g.lineTo(cx + r * 0.7, cy + r * 0.6); }
        else if (kind === 2) { g.moveTo(cx, cy - r * 0.75); g.lineTo(cx, cy + r * 0.75); g.moveTo(cx - r * 0.7, cy); g.lineTo(cx + r * 0.7, cy); }
        else { g.moveTo(cx - r * 0.7, cy - r * 0.6); g.lineTo(cx + r * 0.6, cy - r * 0.6); g.lineTo(cx + r * 0.6, cy + r * 0.7); g.moveTo(cx - r * 0.5, cy + r * 0.1); g.lineTo(cx + r * 0.1, cy + r * 0.1); }
        g.stroke();
      }
    }
    for (let i = 0; i < 26; i++) { g.beginPath(); g.arc((hash(seed, i + 40) - 0.5) * s, (hash(seed, i + 80) - 0.5) * s, (0.4 + hash(seed, i + 120) * 1.6) * u, 0, TAU); g.fill(); }
    g.restore();
  }
  // A clump of grass at a point, swaying.
  function tuft(g, F, x, y, h, q, t, seed) {
    if (q <= 0) return;
    for (let k = 0; k < 4; k++) {
      const lean = (k - 1.5) * 0.35 + Math.sin(t * 1.3 + seed + k) * 0.08, hh = h * (0.6 + hash(seed, k) * 0.6);
      brush(g, F, [[x + (k - 1.5) * 3 * F.u, y], [x + Math.sin(lean) * hh * 0.5, y - hh * 0.55], [x + Math.sin(lean) * hh, y - hh]], { w: 3.6 * F.u, q, color: F.ink(0.6), ti: 0.05, to: 0.9, dry: 0, seed: seed * 7 + k });
    }
  }
  // A small arrowhead of two brush flicks.
  function flicks(g, F, x, y, ang, s, color, q, seed) {
    if (q <= 0) return;
    for (const side of [-1, 1]) {
      const a = ang + Math.PI - side * 0.55;
      brush(g, F, [[x, y], [x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.55], [x + Math.cos(a) * s, y + Math.sin(a) * s]], { w: 7 * F.u, q, color, ti: 0.1, to: 0.6, dry: 0.3, seed: seed + side });
    }
  }

  // A sampan moored in the shallows: a wet crescent hull, a crouched fisher under a hat, a pole and
  // its broken reflection, bobbing on the swell.
  function moored(g, F, x, y, q, t, s = 1) {
    if (q <= 0) return;
    const u = F.u * s, by = y + Math.sin(t * 1.6) * 3 * u, tilt = Math.sin(t * 1.2) * 0.03;
    g.save();
    g.globalAlpha *= clamp(q * 1.5);
    // Reflection first: dark broken bands under the hull that shiver.
    for (let k = 0; k < 6; k++) {
      const yy = y + (16 + k * 9) * u, ww = (110 - k * 12) * u * (0.8 + 0.2 * Math.sin(t * 2.1 + k));
      brush(g, F, [[x - ww / 2 + Math.sin(t * 1.7 + k) * 6 * u, yy], [x + ww / 2 + Math.sin(t * 1.7 + k) * 6 * u, yy + 1 * u]], { w: (6 - k * 0.6) * u, color: F.ink(0.32 - k * 0.04), ti: 0.2, to: 0.4, dry: 0.6, seed: 8800 + k, q: span(q, 0.3, 1) });
    }
    g.translate(x, by); g.rotate(tilt);
    brush(g, F, [[-110 * u, -16 * u], [-50 * u, 6 * u], [50 * u, 6 * u], [115 * u, -18 * u]], { w: 22 * u, q: span(q, 0, 0.5), color: F.ink(0.88), ti: 0.12, to: 0.18, min: 0.25, dry: 0.5, seed: 8810, wet: true });
    brush(g, F, [[-80 * u, -6 * u], [80 * u, -7 * u]], { w: 4 * u, q: span(q, 0.2, 0.6), color: F.ink(0.5), dry: 0.4, seed: 8811 });
    // Canopy: a soft arched wash with a dark rim.
    const cq = span(q, 0.3, 0.8);
    if (cq > 0) {
      pigment(g, F, (c) => { c.moveTo(-10 * u, -8 * u); c.quadraticCurveTo(30 * u, -62 * u * cq, 72 * u, -10 * u); c.closePath(); }, F.ink, 0.55 * cq, 8812, { x: -10 * u, y: -50 * u, w: 82 * u, h: 44 * u }, { rim: 3, bleed: 2 });
      brush(g, F, [[-14 * u, -8 * u], [30 * u, -58 * u * cq], [76 * u, -9 * u]], { w: 6 * u, q: cq, color: F.ink(0.85), ti: 0.1, to: 0.4, dry: 0.6, seed: 8813 });
    }
    // The fisher: a hat, a hunched back and a long pole that sways with the boat.
    const fq = span(q, 0.5, 1);
    if (fq > 0) {
      blot(g, -50 * u, -30 * u, 12 * u * fq, F.ink(0.88), 1 * u);
      brush(g, F, [[-74 * u, -40 * u], [-50 * u, -54 * u], [-26 * u, -40 * u]], { w: 8 * u, q: fq, color: F.ink(0.92), ti: 0.2, to: 0.2, dry: 0.3, seed: 8814 });
      const pa = -1.1 + Math.sin(t * 0.9) * 0.06;
      brush(g, F, [[-40 * u, -26 * u], [-40 * u + Math.cos(pa) * 160 * u, -26 * u + Math.sin(pa) * 160 * u]], { w: 3.4 * u, q: fq, color: F.ink(0.8), ti: 0.05, to: 0.5, dry: 0, seed: 8815 });
      const tipx = -40 * u + Math.cos(pa) * 160 * u, tipy = -26 * u + Math.sin(pa) * 160 * u;
      g.strokeStyle = F.ink(0.45); g.lineWidth = 1.2 * u; g.beginPath(); g.moveTo(tipx, tipy); g.quadraticCurveTo(tipx + 20 * u, tipy + 60 * u, tipx + 6 * u + Math.sin(t * 1.3) * 4 * u, 20 * u); g.stroke();
    }
    g.restore();
  }

  // ---- chart: a bamboo grove, one culm per value ---------------------------------------------------
  function chart(g, F, b, q, d, t) {
    const { u, narrow } = F;
    const vals = (d.values || []).map((v) => Math.max(0, Number(v) || 0));
    const n = Math.max(1, vals.length), max = Math.max(...vals, 1);
    const hi = d.highlight >= 0 && d.highlight < n ? d.highlight : -1;
    const G = narrow ? { x: b.x, y: b.y + 250 * u, w: b.w, h: b.h - 250 * u } : { x: b.x, y: b.y, w: b.w * 0.64, h: b.h };
    const R = narrow ? { x: b.x, y: b.y, w: b.w, h: 230 * u } : { x: b.x + b.w * 0.7, y: b.y + 10 * u, w: b.w * 0.3, h: b.h - 20 * u };
    const base = G.y + G.h - 80 * u, top = G.y + 120 * u, maxH = base - top;
    // Ground: one long dry stroke and grass.
    brush(g, F, [[G.x - 50 * u, base + 4 * u], [G.x + G.w * 0.3, base - 3 * u], [G.x + G.w * 0.7, base + 5 * u], [G.x + G.w + 40 * u, base]], { w: 12 * u, q: span(q, 0, 0.3), color: F.ink(0.7), dry: 0.75, seed: 11, ti: 0.04, to: 0.45 });
    wash(g, (c) => c.ellipse(G.x + G.w / 2, base + 26 * u, G.w * 0.55, 30 * u, 0, 0, TAU), F.ink(0.07 * span(q, 0.05, 0.35)), 14 * u);
    for (let k = 0; k < 9; k++) tuft(g, F, G.x + (G.w * (k + 0.5)) / 9 + (hash(k, 3) - 0.5) * 50 * u, base + 2 * u, 26 * u, span(q, 0.15 + k * 0.02, 0.35 + k * 0.02), t, k + 3);
    const slot = G.w / n, sw = Math.min(slot * 0.2, 34 * u);
    let hot = null;
    vals.forEach((v, i) => {
      const cx = G.x + slot * (i + 0.5), h = Math.max(90 * u, (v / max) * maxH), s0 = 0.08 + i * 0.07;
      const grow = ease(span(q, s0, s0 + 0.42)), hs = h * grow;
      const isHot = i === hi, a = isHot ? 0.94 : 0.5;
      const sway = (y) => Math.sin(t * 1.05 + i * 1.9) * 7 * u * Math.pow(clamp((base - y) / maxH), 2);
      const nseg = Math.max(2, Math.round(h / (92 * u))), sl = h / nseg;
      for (let k = 0; k < nseg; k++) {
        const y0 = base - k * sl, y1 = y0 - sl, sq = clamp((hs - k * sl) / sl);
        if (sq <= 0) break;
        const ym = (y0 + y1) / 2;
        brush(g, F, [[cx + sway(y0), y0 - 2 * u], [cx + sway(ym) + 1.5 * u, ym], [cx + sway(y1), y1 + 5 * u]], { w: sw * (1 - k * 0.035), q: sq, color: F.ink(a), ti: 0.07, to: 0.09, min: 0.7, dry: 0.5, seed: 100 + i * 10 + k, wob: 0.05, wet: true });
        if (sq >= 1) {
          const nx = cx + sway(y1);
          brush(g, F, [[nx - sw * 0.78, y1 + 6 * u], [nx, y1 + 1 * u], [nx + sw * 0.78, y1 + 6 * u]], { w: 6.5 * u, color: F.ink(Math.min(1, a + 0.2)), ti: 0.2, to: 0.3, dry: 0.2, seed: 300 + i * 10 + k });
        }
      }
      // Leaves sprout from the top two nodes once the culm has grown, and keep stirring.
      const lq = span(q, s0 + 0.42, s0 + 0.68), ty = base - h;
      if (lq > 0) {
        [[1, 0.25, 1], [-1, 0.1, 0.9], [1, 0.75, 0.7], [-1, 0.6, 0.85], [1, -0.2, 0.6]].forEach(([side, droop, len], k) => {
          const y = ty + (k < 2 ? 4 * u : k < 4 ? sl : -2 * u), x = cx + sway(y);
          const A = (side > 0 ? 0 : Math.PI) + side * (droop + Math.sin(t * 1.5 + i * 2 + k) * 0.07);
          const L = 92 * u * len * (narrow ? 0.85 : 1), nx = -Math.sin(A) * side;
          brush(g, F, [[x, y], [x + Math.cos(A) * L * 0.5 + nx * 6 * u, y + Math.sin(A) * L * 0.5 - 6 * u], [x + Math.cos(A) * L, y + Math.sin(A) * L]],
            { w: 15 * u * (narrow ? 0.85 : 1), q: span(lq, k * 0.12, 0.5 + k * 0.12), color: F.ink(a * 0.92), ti: 0.22, to: 0.7, dry: 0.25, seed: 500 + i * 10 + k });
        });
      }
      // The figure is inked once, when its culm has finished growing.
      write(g, F, fmt(v, d), cx, base - h - 34 * u, (isHot ? 62 : 50) * u, { align: "center", color: isHot ? F.acc(1) : F.ink(0.78), weight: 600, maxW: slot * 0.9, q: isHot ? span(q, s0 + 0.4, s0 + 0.48) : span(q, s0 + 0.4, s0 + 0.55) });
      write(g, F, d.labels[i] || "", cx, base + 60 * u, 42 * u, { align: "center", color: F.ink(isHot ? 0.95 : 0.78), q: span(q, 0.02 + i * 0.03, 0.14 + i * 0.03), maxW: slot * 0.95, min: 42 * u });
      if (isHot) hot = { cx, top: base - h, v, label: d.labels[i] || "", sway: sway(base - h), land: Math.min(0.78, s0 + 0.48) };
    });
    // A bamboo leaf letting go and drifting down through the hold.
    for (let k = 0; k < 2; k++) {
      const per = 4.2, f = fract(t / per + k * 0.5), i = (k * 3 + Math.floor(t / per + k * 0.5)) % n;
      const vis = q > 0.8 ? Math.sin(Math.PI * f) : 0;
      if (vis <= 0.02) continue;
      const cx = G.x + slot * (i + 0.5) + f * 140 * u + Math.sin(f * 7 + k) * 30 * u, cy = base - Math.max(90 * u, (vals[i] / max) * maxH) + f * maxH * 0.9;
      const A = 0.4 + Math.sin(f * 9 + k) * 0.6;
      brush(g, F, [[cx, cy], [cx + Math.cos(A) * 30 * u, cy + Math.sin(A) * 30 * u], [cx + Math.cos(A) * 60 * u, cy + Math.sin(A) * 60 * u]], { w: 12 * u, color: F.ink(0.5 * vis), ti: 0.25, to: 0.7, dry: 0.2, seed: 700 + k });
    }
    if (!hot) return;
    // The readout: a dry-brush rule, the highlighted figure large in vermilion, and its seal.
    // The side readout is inked only once the highlighted culm's own figure has landed, so the two never disagree.
    const h0 = hot.land, rq = span(q, h0, h0 + 0.12);
    if (!narrow) {
      moored(g, F, R.x + R.w * 0.45, R.y + R.h * 0.84, span(q, 0.1, 0.4), t);
      brush(g, F, [[R.x - 40 * u, R.y + 10 * u], [R.x - 44 * u, R.y + R.h * 0.45], [R.x - 38 * u, R.y + R.h * 0.86]], { w: 7 * u, q: span(q, 0.18, 0.4), color: F.ink(0.55), ti: 0.05, to: 0.6, dry: 0.8, seed: 801 });
      write(g, F, hot.label, R.x, R.y + 90 * u, 46 * u, { color: F.ink(0.92), q: rq, maxW: R.w - 90 * u });
      const nw = write(g, F, fmt(hot.v, d), R.x, R.y + 250 * u, 140 * u, { color: F.acc(1), weight: 600, q: rq, maxW: R.w, min: 96 * u });
      seal(g, F, R.x + Math.min(R.w - 40 * u, Math.max(nw, 100 * u) + 60 * u), R.y + 170 * u, 58 * u, span(q, h0 + 0.08, h0 + 0.16), 31);
      const others = vals.filter((_, i) => i !== hi);
      if (others.length) {
        const mean = others.reduce((s, v) => s + v, 0) / others.length, pct = mean > 0 ? Math.round(((hot.v - mean) / mean) * 100) : 0;
        write(g, F, `${pct >= 0 ? "+" : "−"}${Math.abs(pct)}% on the rest`, R.x, R.y + 330 * u, 42 * u, { color: F.ink(0.72), q: span(q, h0 + 0.1, h0 + 0.22), italic: true, maxW: R.w, min: 42 * u });
      }
    } else {
      write(g, F, hot.label, R.x, R.y + 50 * u, 46 * u, { color: F.ink(0.92), q: rq, maxW: R.w * 0.6 });
      const nw = write(g, F, fmt(hot.v, d), R.x, R.y + 190 * u, 130 * u, { color: F.acc(1), weight: 600, q: rq, maxW: R.w * 0.62, min: 96 * u });
      seal(g, F, R.x + nw + 60 * u, R.y + 140 * u, 56 * u, span(q, h0 + 0.08, h0 + 0.16), 31);
      const others = vals.filter((_, i) => i !== hi);
      if (others.length) {
        const mean = others.reduce((s, v) => s + v, 0) / others.length, pct = mean > 0 ? Math.round(((hot.v - mean) / mean) * 100) : 0;
        write(g, F, `${pct >= 0 ? "+" : "−"}${Math.abs(pct)}%`, R.x + R.w, R.y + 190 * u, 64 * u, { align: "right", color: F.ink(0.78), q: span(q, h0 + 0.1, h0 + 0.22), italic: true });
      }
    }
  }

  // ---- object: a laptop or phone brushed in a few strokes, a live ink preview on its screen -------
  function screenContent(g, F, S, phone, q, t) {
    const { u } = F;
    const pv = { x: S.x, y: S.y, w: S.w, h: S.h * (phone ? 0.46 : 0.56) };
    const a = span(q, 0, 0.35);
    if (a <= 0) return null;
    g.save();
    g.globalAlpha *= a;
    // The preview panel is a laid wash with ragged, bled edges, then dry-brush strokes drag along its sides.
    const rough = (c) => {
      const pts = [];
      const E = [[pv.x, pv.y, pv.x + pv.w, pv.y], [pv.x + pv.w, pv.y, pv.x + pv.w, pv.y + pv.h], [pv.x + pv.w, pv.y + pv.h, pv.x, pv.y + pv.h], [pv.x, pv.y + pv.h, pv.x, pv.y]];
      E.forEach(([x0, y0, x1, y1], e) => { for (let k = 0; k < 14; k++) { const f = k / 14, j = (hash(e * 17 + k, 71) - 0.5) * 7 * u; pts.push([lerp(x0, x1, f) + (y0 === y1 ? 0 : j), lerp(y0, y1, f) + (y0 === y1 ? j : 0)]); } });
      c.moveTo(pts[0][0], pts[0][1]); pts.forEach((p) => c.lineTo(p[0], p[1])); c.closePath();
    };
    pigment(g, F, rough, F.ink, 0.13, 4411, { x: pv.x, y: pv.y, w: pv.w, h: pv.h }, { rim: 4, bleed: 2.5, blots: 7 });
    [[[pv.x - 6 * u, pv.y + 2 * u], [pv.x + pv.w * 0.5, pv.y - 2 * u], [pv.x + pv.w + 8 * u, pv.y + 1 * u]], [[pv.x + pv.w + 6 * u, pv.y + pv.h + 1 * u], [pv.x + pv.w * 0.5, pv.y + pv.h + 3 * u], [pv.x - 8 * u, pv.y + pv.h - 1 * u]],
      [[pv.x + 1 * u, pv.y - 4 * u], [pv.x - 2 * u, pv.y + pv.h * 0.5], [pv.x + 1 * u, pv.y + pv.h + 4 * u]], [[pv.x + pv.w - 1 * u, pv.y + pv.h + 4 * u], [pv.x + pv.w + 2 * u, pv.y + pv.h * 0.5], [pv.x + pv.w, pv.y - 4 * u]]]
      .forEach((c, i) => brush(g, F, c, { w: 7 * u, q: span(q, 0.02 + i * 0.05, 0.2 + i * 0.05), color: F.ink(0.55), ti: 0.05, to: 0.5, dry: 0.9, seed: 4420 + i, wob: 0.25 }));
    g.beginPath(); rough(g); g.clip();
    // The preview: a tiny painted lake that keeps moving.
    blot(g, pv.x + pv.w * 0.78, pv.y + pv.h * 0.3, pv.h * 0.12, F.acc(0.7), 1 * u);
    const drift = (t * 10 * u) % pv.w;
    for (const [k, al, amp, base] of [[1, 0.18, 0.35, 0.64], [2, 0.36, 0.22, 0.74]]) {
      wash(g, (c) => {
        c.moveTo(pv.x - 10 * u, pv.y + pv.h);
        for (let x = -pv.w; x <= pv.w * 2; x += 6 * u) {
          const xx = x + ((drift * k * 0.6) % pv.w), hh = Math.max(0, Math.sin((x / pv.w) * Math.PI * (2 + k) + k) * 0.6 + Math.sin((x / pv.w) * 9.7 + k * 2) * 0.25);
          c.lineTo(pv.x + xx, pv.y + pv.h * base - hh * pv.h * amp);
        }
        c.lineTo(pv.x + pv.w + 10 * u, pv.y + pv.h); c.closePath();
      }, F.ink(al), 1.6 * u);
    }
    brush(g, F, [[pv.x - 10 * u, pv.y + pv.h * 0.9], [pv.x + pv.w * 0.5, pv.y + pv.h * 0.88], [pv.x + pv.w + 10 * u, pv.y + pv.h * 0.91]], { w: pv.h * 0.2, color: F.ink(0.12), ti: 0.02, to: 0.3, min: 0.6, dry: 0.8, seed: 4430, wob: 0.3 });
    const bx = pv.x + pv.w * fract(t * 0.05 + 0.15), by = pv.y + pv.h * 0.88 + Math.sin(t * 2.2) * 1.5 * u;
    brush(g, F, [[bx - 16 * u, by - 3 * u], [bx, by + 3 * u], [bx + 16 * u, by - 4 * u]], { w: 4.5 * u, color: F.ink(0.9), ti: 0.2, to: 0.2, dry: 0, seed: 41 });
    blot(g, bx - 2 * u, by - 9 * u, 2.6 * u, F.ink(0.9));
    g.restore();
    // The edit below: three rows of clips, a waveform and a running playhead.
    const T0 = pv.y + pv.h + S.h * 0.06, rows = 3, th = (S.y + S.h - T0) / (rows + 0.6), out = [];
    const clips = [[[0.02, 0.3], [0.36, 0.3, 1], [0.7, 0.27]], [[0.06, 0.42], [0.52, 0.4]]];
    clips.forEach((row, r) => row.forEach(([x0, w0, isHot], i) => {
      const cq = span(q, 0.3 + (r * 3 + i) * 0.06, 0.5 + (r * 3 + i) * 0.06), y = T0 + r * th * 1.18 + th * 0.4;
      const x1 = S.x + S.w * x0, x2 = x1 + S.w * w0;
      brush(g, F, [[x1, y], [lerp(x1, x2, 0.5), y + (hash(r, i) - 0.5) * 3 * u], [x2, y]], { w: th * 0.82, q: cq, color: isHot ? F.acc(0.9) : F.ink(0.5), ti: 0.04, to: 0.12, min: 0.62, dry: 0.7, seed: 60 + r * 5 + i, wob: 0.14, wet: true });
      if (isHot) out[1] = [(x1 + x2) / 2, y];
    }));
    const wy = T0 + 2 * th * 1.18 + th * 0.4, wq = span(q, 0.55, 0.85);
    // The waveform: a run of short vertical brush flicks, each tapering at both ends.
    const bars = phone ? 22 : 44;
    for (let i = 0; i < bars * wq; i++) {
      const x = S.x + S.w * (0.02 + (0.96 * i) / bars), amp = th * 0.42 * (0.25 + 0.75 * Math.abs(Math.sin(i * 0.7) * Math.sin(i * 0.23 + 1)));
      brush(g, F, [[x + (hash(i, 51) - 0.5) * 2 * u, wy - amp], [x + 1 * u, wy + amp]], { w: 4.2 * u, color: F.ink(0.55 + hash(i, 52) * 0.2), ti: 0.3, to: 0.4, dry: 0, seed: 4440 + i, ds: 3 * u });
    }
    out[0] = [pv.x + pv.w * 0.5, pv.y + pv.h * 0.55];
    out[2] = [S.x + S.w * 0.24, wy];
    if (q > 0.6) {
      const px = S.x + S.w * (0.04 + 0.92 * fract(t * 0.08 + 0.3));
      brush(g, F, [[px, T0 - 4 * u], [px, S.y + S.h - 4 * u]], { w: 3.4 * u, color: F.acc(0.95), ti: 0.02, to: 0.3, dry: 0, seed: 77 });
      blot(g, px, T0 - 6 * u, 5 * u, F.acc(0.95));
    }
    return out;
  }
  function object(g, F, b, q, d, t, after = 0) {
    const { u, narrow } = F, phone = d.kind === "phone";
    let D, labels;
    if (!phone) {
      if (!narrow) {
        const w = Math.min(b.w * 0.55, (b.h - 80 * u) / 0.7), h = w * 0.62;
        D = { x: b.x + 30 * u, y: b.y + Math.max(0, (b.h - h * 1.1) / 2) - 10 * u, w, h };
        const lx = D.x + D.w + 170 * u;
        labels = [0.12, 0.48, 0.86].map((f) => [lx, D.y + D.h * f + 20 * u]);
      } else {
        const w = b.w - 60 * u, h = w * 0.62;
        D = { x: b.x + 30 * u, y: b.y + 10 * u, w, h };
        labels = [0, 1, 2].map((i) => [b.x + 70 * u, D.y + h * 1.1 + 120 * u + i * 110 * u]);
      }
    } else {
      const h = narrow ? Math.min(b.h * 0.62, (b.w * 0.42) / 0.5) : b.h - 40 * u, w = h * 0.5;
      D = { x: narrow ? b.x + 30 * u : b.x + b.w * 0.2 - w / 2, y: b.y + (narrow ? 20 * u : 20 * u), w, h };
      const lx = D.x + w + (narrow ? 90 * u : 220 * u);
      labels = [0.18, 0.55, 0.86].map((f) => [lx, D.y + h * f + 14 * u]);
    }
    const { x, y, w, h } = D, ink = F.ink(0.9);
    // Shadow wash under the device.
    wash(g, (c) => c.ellipse(x + w / 2, y + h * (phone ? 1.02 : 1.12), w * 0.6, 26 * u, 0, 0, TAU), F.ink(0.12 * span(q, 0.1, 0.4)), 12 * u);
    if (!phone) {
      const sides = [[[x - 10 * u, y + 2 * u], [x + w / 2, y - 3 * u], [x + w + 8 * u, y + 1 * u]], [[x + w, y - 8 * u], [x + w + 3 * u, y + h / 2], [x + w - 1 * u, y + h + 6 * u]],
        [[x + w + 6 * u, y + h], [x + w / 2, y + h + 3 * u], [x - 6 * u, y + h - 1 * u]], [[x, y + h + 8 * u], [x - 3 * u, y + h / 2], [x + 1 * u, y - 6 * u]]];
      sides.forEach((c, i) => brush(g, F, c, { w: 10 * u, q: span(q, 0.02 + i * 0.07, 0.12 + i * 0.07), color: ink, ti: 0.06, to: 0.3, dry: 0.55, seed: 20 + i }));
      // The base: one long tapered stroke with its two return strokes.
      const by = y + h + h * 0.07;
      brush(g, F, [[x - w * 0.08, by], [x + w / 2, by + 4 * u], [x + w * 1.08, by - 2 * u]], { w: 16 * u, q: span(q, 0.3, 0.45), color: ink, ti: 0.05, to: 0.3, dry: 0.7, seed: 27 });
      brush(g, F, [[x - w * 0.07, by - 2 * u], [x - 2 * u, y + h + 4 * u]], { w: 6 * u, q: span(q, 0.4, 0.48), color: ink, dry: 0, seed: 28 });
      brush(g, F, [[x + w * 1.07, by - 3 * u], [x + w + 2 * u, y + h + 4 * u]], { w: 6 * u, q: span(q, 0.42, 0.5), color: ink, dry: 0, seed: 29 });
      brush(g, F, [[x + w * 0.42, by + 7 * u], [x + w * 0.58, by + 7 * u]], { w: 5 * u, q: span(q, 0.45, 0.52), color: F.ink(0.6), dry: 0, seed: 30 });
    } else {
      const r = w * 0.16, P = (side) => [[x + w / 2, y], [x + w / 2 + side * (w / 2 - r), y + 1 * u], [x + w / 2 + side * w / 2, y + r], [x + w / 2 + side * (w / 2 + 2 * u), y + h / 2], [x + w / 2 + side * w / 2, y + h - r], [x + w / 2 + side * (w / 2 - r), y + h], [x + w / 2, y + h + 1 * u]];
      brush(g, F, P(-1), { w: 10 * u, q: span(q, 0.02, 0.22), color: ink, ti: 0.04, to: 0.25, min: 0.3, dry: 0.5, seed: 21 });
      brush(g, F, P(1), { w: 10 * u, q: span(q, 0.1, 0.3), color: ink, ti: 0.04, to: 0.25, min: 0.3, dry: 0.5, seed: 22 });
      brush(g, F, [[x + w * 0.4, y + 22 * u], [x + w * 0.6, y + 22 * u]], { w: 6 * u, q: span(q, 0.3, 0.38), color: ink, dry: 0, seed: 23 });
    }
    const pad = phone ? 20 * u : 24 * u;
    const S = { x: x + pad, y: y + pad + (phone ? 26 * u : 0), w: w - pad * 2, h: h - pad * 2 - (phone ? 40 * u : 0) };
    const anchors = screenContent(g, F, S, phone, span(q, 0.12, 0.62), t);
    if (!anchors) return;
    // Callouts: a fine brushed leader from each part to its label.
    (d.callouts || []).forEach((label, i) => {
      if (!label || !anchors[i]) return;
      const [ax, ay] = anchors[i], [lx, ly] = labels[i], c0 = 0.4 + i * 0.1, isHot = i === 1;
      const cq = span(q, c0, c0 + 0.2);
      if (cq <= 0) return;
      blot(g, ax, ay, 8 * u * ease(cq * 3), isHot ? F.acc(0.95) : F.ink(0.9), 0.8 * u);
      const ex = narrow && !phone ? lx - 26 * u : lx - 26 * u, ey = ly - 14 * u;
      // The leader is one loaded stroke: it lands heavy at the part, bows, and lifts to a hair at the label.
      const len = Math.hypot(ex - ax, ey - ay) || 1, nx = -(ey - ay) / len, ny = (ex - ax) / len, bow = (i % 2 ? 1 : -1) * Math.min(60 * u, len * 0.14);
      const m1 = [lerp(ax, ex, 0.33) + nx * bow, lerp(ay, ey, 0.33) + ny * bow], m2 = [lerp(ax, ex, 0.7) + nx * bow * 0.6, lerp(ay, ey, 0.7) + ny * bow * 0.6];
      brush(g, F, [[ax, ay], m1, m2, [ex, ey]], { w: 9 * u, q: span(cq, 0, 0.7), color: isHot ? F.acc(0.88) : F.ink(0.78), ti: 0.04, to: 0.85, min: 0.08, dry: 0.55, seed: 90 + i, wob: 0.22 });
      write(g, F, label, lx, ly, 44 * u, { color: isHot ? F.acc(1) : F.ink(0.92), q: span(cq, 0.45, 1), maxW: F.W - lx - (narrow ? 50 : 90) * u, min: 42 * u, weight: isHot ? 600 : 500 });
    });
    // After the build: a vermilion ring is brushed round the proposed clip, then ink drops fall onto it and spread.
    if (after > 0 && anchors[1]) {
      const [hx, hy] = anchors[1], rr = w * 0.15 + 22 * u, ry = 44 * u * (phone ? 0.8 : 1), eq = span(after, 0, 1.1), ring = [];
      for (let k = 0; k <= 26; k++) { const a = -2.2 + (k / 26) * TAU * 0.93, wob = 1 + (hash(k, 61) - 0.5) * 0.06; ring.push([hx + Math.cos(a) * rr * wob, hy + Math.sin(a) * ry * wob]); }
      brush(g, F, ring, { w: 11 * u, q: inout(eq), color: F.acc(0.8), ti: 0.03, to: 0.5, min: 0.1, dry: 0.75, seed: 4470, wob: 0.2 });
      for (let k = 0; k < 2; k++) {
        const f = fract(after * 0.45 + k * 0.5), dx = hx + (k ? 0.45 : -0.4) * rr;
        if (after > 0.6) {
          g.save(); g.strokeStyle = F.acc(0.5 * (1 - f)); g.lineWidth = 2 * u;
          g.beginPath(); g.ellipse(dx, hy, 6 * u + f * rr * 0.35, 3 * u + f * ry * 0.5, 0, 0, TAU); g.stroke(); g.restore();
          blot(g, dx, hy, 4 * u * (1 - f), F.acc(0.9));
        }
      }
    }
  }

  // ---- people: a gathering on stepping stones across a stream --------------------------------------
  function figure(g, F, cx, gy, h, i, q, t, isHot, after = 0) {
    if (q <= 0) return;
    const { u } = F, br = 1 + 0.018 * Math.sin(t * 1.8 + i * 1.3), bob = Math.sin(t * 1.2 + i) * 2 * u;
    const top = gy - h * br, hr = h * 0.085, hy = top + hr, neck = hy + hr * 1.15;
    const sh = h * (0.2 + (i % 3) * 0.02), hem = h * (0.36 + ((i + 1) % 2) * 0.05), hemY = gy - h * 0.03;
    const Lc = [[cx - sh * 0.3, neck], [cx - sh * 0.62, neck + h * 0.12], [cx - hem * 0.42, gy - h * 0.36], [cx - hem * 0.52, hemY]];
    const Rc = Lc.map(([px, py]) => [2 * cx - px, py]);
    // Robe: paper underneath, then a pooled wash, contour strokes of changing weight, folds and the hem.
    const fillA = span(q, 0.15, 0.6);
    const robe = (c) => { const L = spline(Lc, 6), R = spline(Rc, 6); c.moveTo(L[0][0], L[0][1]); L.forEach((p) => c.lineTo(p[0], p[1])); R.reverse().forEach((p) => c.lineTo(p[0], p[1])); c.closePath(); };
    wash(g, robe, F.paper(0.92 * fillA), 1.2 * u);
    const rbb = { x: cx - hem * 0.55, y: neck, w: hem * 1.1, h: hemY - neck };
    pigment(g, F, robe, isHot ? F.acc : F.ink, isHot ? 0.8 * fillA : (0.2 + (i % 2) * 0.14) * fillA, 950 + i * 7, rbb, { rim: 5, bleed: 2.5, grain: 1.35 });
    brush(g, F, Lc, { w: 12 * u, q: span(q, 0.1, 0.5), color: F.ink(0.88), ti: 0.04, to: 0.8, min: 0.15, dry: 0.6, seed: 900 + i * 4 });
    brush(g, F, Rc, { w: 7 * u, q: span(q, 0.18, 0.58), color: F.ink(0.82), ti: 0.15, to: 0.5, min: 0.2, dry: 0.5, seed: 901 + i * 4 });
    const fq = span(q, 0.35, 0.75);
    brush(g, F, [[cx - sh * 0.12, neck + h * 0.08], [cx - hem * 0.1, gy - h * 0.34], [cx - hem * 0.2, hemY - 6 * u]], { w: 4.5 * u, q: fq, color: F.ink(isHot ? 0.55 : 0.45), ti: 0.1, to: 0.7, dry: 0.75, seed: 910 + i * 4 });
    brush(g, F, [[cx + sh * 0.2, neck + h * 0.12], [cx + hem * 0.16, gy - h * 0.28], [cx + hem * 0.26, hemY - 8 * u]], { w: 3.4 * u, q: span(fq, 0.2, 1), color: F.ink(isHot ? 0.5 : 0.4), ti: 0.1, to: 0.7, dry: 0.75, seed: 911 + i * 4 });
    brush(g, F, [[Lc[3][0] + 4 * u, hemY], [cx, hemY + 5 * u], [Rc[3][0] - 4 * u, hemY]], { w: 6 * u, q: span(q, 0.45, 0.7), color: F.ink(0.7), ti: 0.1, to: 0.4, dry: 0.6, seed: 902 + i * 4 });
    // A wide sleeve hanging from each shoulder, pooled and rimmed.
    for (const sd of [-1, 1]) {
      const sx = cx + sd * sh * 0.55, sy = neck + h * 0.09, sleeve = (c) => { c.moveTo(sx, sy); c.quadraticCurveTo(sx + sd * sh * 0.5, sy + h * 0.12, sx + sd * sh * 0.32, sy + h * 0.3); c.quadraticCurveTo(sx - sd * sh * 0.1, sy + h * 0.33, sx - sd * sh * 0.28, sy + h * 0.24); c.closePath(); };
      pigment(g, F, sleeve, isHot ? F.acc : F.ink, (isHot ? 0.55 : 0.22) * fillA, 970 + i * 5 + sd, { x: sx - sh * 0.4, y: sy, w: sh * 0.9, h: h * 0.33 }, { rim: 3, bleed: 2, blots: 4 });
      brush(g, F, [[sx + sd * sh * 0.38, sy + h * 0.2], [sx + sd * sh * 0.3, sy + h * 0.3], [sx - sd * sh * 0.1, sy + h * 0.32], [sx - sd * sh * 0.28, sy + h * 0.24]], { w: 7 * u, q: span(q, 0.4, 0.7), color: F.ink(0.78), ti: 0.2, to: 0.6, dry: 0.5, seed: 975 + i * 5 + sd });
    }
    // Arms: folded, raised in greeting, or holding a scroll.
    const kind = isHot ? 1 : i % 3 === 1 ? 2 : i % 3;
    const aq = span(q, 0.5, 0.8), shy = neck + h * 0.09;
    if (kind === 0) brush(g, F, [[cx - sh * 0.55, shy + h * 0.08], [cx, shy + h * 0.15], [cx + sh * 0.55, shy + h * 0.1]], { w: 9 * u, q: aq, color: F.ink(0.85), ti: 0.1, to: 0.4, dry: 0.4, seed: 903 + i * 4 });
    else if (kind === 1) {
      const wave = Math.sin(t * 3.2 + i) * (0.18 + 0.22 * ease(span(after, 0, 0.6))), ex = cx + sh * 0.9, ey = shy + h * 0.02;
      const hx = ex + Math.cos(-1.2 + wave) * h * 0.2, hy2 = ey + Math.sin(-1.2 + wave) * h * 0.2;
      brush(g, F, [[cx + sh * 0.45, shy], [ex, ey], [hx, hy2]], { w: 8 * u, q: aq, color: F.ink(0.88), ti: 0.1, to: 0.3, dry: 0.3, seed: 904 + i * 4 });
      if (aq >= 1) blot(g, hx, hy2, 5 * u, F.ink(0.88));
    } else {
      brush(g, F, [[cx - sh * 0.5, shy + h * 0.06], [cx + sh * 0.1, shy + h * 0.17], [cx + sh * 0.5, shy + h * 0.14]], { w: 8 * u, q: aq, color: F.ink(0.85), ti: 0.1, to: 0.4, dry: 0.3, seed: 905 + i * 4 });
      brush(g, F, [[cx + sh * 0.35, shy + h * 0.03], [cx + sh * 0.62, shy + h * 0.26]], { w: 13 * u, q: span(aq, 0.4, 1), color: F.ink(0.35), ti: 0.02, to: 0.02, min: 0.9, dry: 0.2, seed: 906 + i * 4 });
    }
    // Head: a soaked dot of ink, then a knot of hair or a soft hood.
    const hq = span(q, 0, 0.3);
    blot(g, cx + bob, hy, hr * ease(hq), F.ink(0.9), 1.2 * u);
    if (hq >= 1) {
      if (i % 2 === 0) blot(g, cx + bob + hr * 0.2, hy - hr * 1.15, hr * 0.42, F.ink(0.9), 0.8 * u);
      else brush(g, F, [[cx + bob - hr * 1.15, hy + hr * 0.3], [cx + bob - hr * 0.9, hy - hr * 1.1], [cx + bob + hr * 0.9, hy - hr * 1.15], [cx + bob + hr * 1.2, hy + hr * 0.2]], { w: 6 * u, color: F.ink(0.75), ti: 0.1, to: 0.3, dry: 0.4, seed: 907 + i * 4 });
    }
  }
  function people(g, F, b, q, d, t, after = 0) {
    const { u, narrow } = F;
    const n = Math.round(clamp(Number(d.count) || 4, 2, 6)), hi = d.highlight ?? 1;
    const wy = b.y + b.h - 110 * u, slot = b.w / n;
    // The stream: a soft band with brushed current lines that keep sliding downstream.
    const sq = span(q, 0, 0.35);
    wash(g, (c) => c.rect(b.x - 80 * u, wy - 30 * u, b.w + 160 * u, 110 * u), F.ink(0.08 * sq), 16 * u);
    for (let k = 0; k < 7; k++) {
      const f = fract(hash(k, 9) + t * 0.05 * (0.6 + hash(k, 2) * 0.6)), x = b.x - 60 * u + f * (b.w + 120 * u), y = wy + (k % 3) * 22 * u + 4 * u;
      brush(g, F, [[x, y], [x + 50 * u, y - 2 * u], [x + 100 * u, y + 1 * u]], { w: 4 * u, color: F.ink(0.4 * sq * Math.sin(Math.PI * f)), ti: 0.2, to: 0.6, dry: 0.5, seed: 950 + k });
    }
    const hF = Math.min(b.h - 260 * u, slot * (narrow ? 1.7 : 1.9), 420 * u);
    for (let i = 0; i < n; i++) {
      const cx = b.x + slot * (i + 0.5), gy = wy - 4 * u + (i % 2) * 12 * u, isHot = i === hi;
      const q0 = 0.02 + i * (0.16 / n), fq = span(q, q0, q0 + 0.45);
      // Stone: a dark wash with a dry top edge, and ripples that ring out from it.
      const rx = Math.min(slot * 0.36, 95 * u), ry = rx * 0.32, stq = span(q, q0 - 0.04, q0 + 0.12);
      wash(g, (c) => c.ellipse(cx, gy + ry * 0.6, rx * ease(stq), ry, 0, 0, TAU), F.ink(0.42 * stq), 2.5 * u);
      brush(g, F, [[cx - rx, gy + ry * 0.4], [cx - rx * 0.3, gy - ry * 0.25], [cx + rx * 0.5, gy - ry * 0.15], [cx + rx, gy + ry * 0.5]], { w: 7 * u, q: stq, color: F.ink(0.8), ti: 0.1, to: 0.5, dry: 0.7, seed: 960 + i });
      if (q > 0.5) for (let r = 0; r < 2; r++) {
        const f = fract(t * 0.35 + i * 0.27 + r * 0.5);
        g.save(); g.strokeStyle = F.ink(0.3 * (1 - f)); g.lineWidth = 1.8 * u;
        g.beginPath(); g.ellipse(cx, gy + ry * 0.9, rx * (1 + f * 0.6), ry * (1.2 + f * 0.8), 0, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); g.restore();
      }
      if (isHot && after > 0) {
        // After the build the director lifts a sleeve and its ripple spreads out across the whole stream.
        for (let r = 0; r < 3; r++) {
          const f = fract(after * 0.32 + r / 3), grow = ease(span(after, 0, 0.8));
          const rxx = rx * (1.1 + f * 4.2), ryy = ry * (1.3 + f * 2.6);
          brush(g, F, Array.from({ length: 13 }, (_, k) => { const a = Math.PI * (0.06 + 0.88 * k / 12); return [cx + Math.cos(a) * rxx, gy + ry * 0.9 + Math.sin(a) * ryy]; }),
            { w: 4.5 * u, color: F.acc(0.55 * (1 - f) * grow), ti: 0.15, to: 0.3, dry: 0.6, seed: 990 + r, wob: 0.3 });
        }
      }
      figure(g, F, cx, gy, hF, i, fq, t, isHot, after);
      const label = i < 3 ? (d.badges || [])[i] : "";
      if (label) {
        const ly = gy - hF - 62 * u, lq = span(q, q0 + 0.3, q0 + 0.55);
        brush(g, F, [[cx, ly + 18 * u], [cx + 2 * u, gy - hF * 1.03]], { w: 3.6 * u, q: lq, color: isHot ? F.acc(0.8) : F.ink(0.5), ti: 0.1, to: 0.6, dry: 0, seed: 980 + i });
        write(g, F, label, cx, ly, 44 * u, { align: "center", color: isHot ? F.acc(1) : F.ink(0.9), q: lq, maxW: slot * 0.96, min: 42 * u, weight: isHot ? 600 : 500 });
      }
    }
  }

  // ---- process: a boat travels a winding river past three landings ---------------------------------
  function process(g, F, b, q, d, t, after = 0) {
    const { u, narrow } = F;
    const steps = (d.steps || []).slice(0, 3);
    const Lnd = narrow
      ? [0, 1, 2].map((k) => [b.x + b.w * (k % 2 ? 0.66 : 0.34), b.y + b.h * (0.2 + 0.31 * k)])
      : [0, 1, 2].map((k) => [b.x + b.w * (0.17 + 0.33 * k), b.y + b.h * (k % 2 ? 0.66 : 0.6)]);
    const ctrl = narrow
      ? [[b.x + b.w * 0.5, b.y - 40 * u], Lnd[0], [b.x + b.w * 0.5, b.y + b.h * 0.36], Lnd[1], [b.x + b.w * 0.5, b.y + b.h * 0.67], Lnd[2], [b.x + b.w * 0.45, b.y + b.h + 40 * u]]
      : [[b.x - 90 * u, b.y + b.h * 0.72], Lnd[0], [b.x + b.w * 0.33, b.y + b.h * 0.86], Lnd[1], [b.x + b.w * 0.66, b.y + b.h * 0.86], Lnd[2], [b.x + b.w + 90 * u, b.y + b.h * 0.72]];
    const path = resample(spline(ctrl, 14), 3 * u);
    const at = Lnd.map(([lx, ly]) => { let bi = 0, bd = 1e9; path.forEach(([px, py], i) => { const dd = (px - lx) ** 2 + (py - ly) ** 2; if (dd < bd) { bd = dd; bi = i; } }); return bi / (path.length - 1); });
    const rq = span(q, 0, 0.4);
    // The river: a broad pale wash between two broken dry-brush banks.
    brush(g, F, path, { raw: true, w: 74 * u, q: rq, color: F.ink(0.09), ti: 0.02, to: 0.02, min: 0.85, dry: 0.15, seed: 1001, wob: 0.18 });
    for (const side of [-1, 1]) {
      const bank = path.map((p, i) => { const a = along(path, i / (path.length - 1)).ang; return [p[0] - Math.sin(a) * 40 * u * side, p[1] + Math.cos(a) * 40 * u * side]; });
      for (let s = 0; s < 6; s++) {
        const a0 = s / 6 + 0.01, a1 = (s + 0.8) / 6;
        const seg = bank.slice(Math.floor(a0 * bank.length), Math.floor(a1 * bank.length));
        if (seg.length > 2) brush(g, F, seg, { raw: true, w: 5 * u, q: span(rq, a0, a1), color: F.ink(0.55), ti: 0.1, to: 0.4, dry: 0.6, seed: 1010 + s + (side > 0 ? 20 : 0) });
      }
    }
    // Current lines that keep sliding downstream.
    if (rq > 0.2) for (let k = 0; k < 9; k++) {
      const f = fract(k / 9 + t * 0.045), seg = path.slice(Math.floor(f * path.length), Math.floor(Math.min(1, f + 0.035) * path.length));
      if (seg.length > 2 && f < rq) brush(g, F, seg.map((p, i) => [p[0], p[1] + ((k % 3) - 1) * 14 * u]), { raw: true, w: 3.4 * u, color: F.ink(0.35 * Math.sin(Math.PI * f)), ti: 0.3, to: 0.6, dry: 0.2, seed: 1040 + k });
    }
    // Where the boat is: it rows to each landing in turn, then rests and bobs at the last.
    const legs = [[0.1, 0.02, at[0]], [0.3, at[0], at[0]], [0.4, at[0], at[1]], [0.58, at[1], at[1]], [0.66, at[1], at[2]], [0.86, at[2], at[2]]];
    let bf = 0.02;
    for (let k = 0; k < legs.length; k++) {
      const [t0, f0, f1] = legs[k], t1 = legs[k + 1] ? legs[k + 1][0] : 2;
      if (q >= t0) bf = lerp(f0, f1, inout(span(q, t0, Math.min(t1, t0 + 0.2))));
    }
    // After the build the boat casts off again and drifts on downstream past the last landing.
    bf = Math.min(0.985, bf + ease(after / 3.5) * 0.11);
    const reached = at.map((f) => bf >= f - 0.004);
    Lnd.forEach(([lx, ly], k) => {
      const k0 = 0.12 + k * 0.14, lq = span(q, k0, k0 + 0.2);
      // Landing: a pool and a short jetty of posts.
      wash(g, (c) => c.ellipse(lx, ly, 74 * u * ease(lq), 32 * u, 0, 0, TAU), F.ink(0.14 * lq), 6 * u);
      const jx = lx + (narrow ? (k % 2 ? 60 : -60) : 0) * u, jy = ly + (narrow ? 0 : 46) * u;
      for (let p = 0; p < 3; p++) brush(g, F, [[jx + (p - 1) * 20 * u, jy - 12 * u], [jx + (p - 1) * 20 * u + 1 * u, jy + 12 * u]], { w: 6 * u, q: span(lq, 0.3 + p * 0.1, 0.6 + p * 0.1), color: F.ink(0.8), ti: 0.1, to: 0.3, dry: 0.2, seed: 1060 + k * 3 + p });
      // The river only runs below each landing, so the numeral and its label sit above it, on a pale mist.
      const nx = narrow ? lx + (k % 2 ? 150 : -150) * u : lx, ny = narrow ? ly + 34 * u : ly - 200 * u;
      const tx = narrow ? lx + (k % 2 ? -40 : 40) * u : lx, ty = narrow ? ly + 110 * u : ly - 104 * u;
      const mq = ease(span(q, k0 - 0.06, k0 + 0.14));
      if (mq > 0) {
        const mist = (cx, cy, rx, ry, a) => { g.save(); g.translate(cx, cy); g.scale(rx / ry, 1); const m = g.createRadialGradient(0, 0, 0, 0, 0, ry); m.addColorStop(0, F.paper(a)); m.addColorStop(0.6, F.paper(a * 0.75)); m.addColorStop(1, F.paper(0)); g.fillStyle = m; g.beginPath(); g.arc(0, 0, ry, 0, TAU); g.fill(); g.restore(); };
        mist(nx, ny - 36 * u, 90 * u, 80 * u, 0.85 * mq);
        if (!narrow) mist(tx, ty - 14 * u, Math.min(b.w * 0.2, 260 * u), 46 * u, 0.8 * mq);
      }
      write(g, F, String(k + 1), nx, ny, 108 * u, { align: "center", color: F.ink(1), q: lq, weight: 600, solid: true });
      seal(g, F, nx + 70 * u, ny - 64 * u, 44 * u, reached[k] ? span(q, (k === 0 ? 0.3 : k === 1 ? 0.58 : 0.86) - 0.02, (k === 0 ? 0.3 : k === 1 ? 0.58 : 0.86) + 0.08) : 0, 1100 + k);
      write(g, F, steps[k] || "", tx, ty, 44 * u, { align: narrow ? (k % 2 ? "right" : "left") : "center", color: F.ink(0.92), q: span(q, k0 + 0.08, k0 + 0.28), maxW: narrow ? b.w * 0.55 : b.w * 0.31, min: 42 * u, weight: reached[k] ? 600 : 500 });
    });
    // The boat: a crescent hull, a seated rower and a pole, with ripples while it rests.
    const bq = span(q, 0.06, 0.18);
    if (bq > 0) {
      const p = along(path, bf);
      let ang = p.ang;
      const flip = Math.cos(ang) < 0;
      if (flip) ang += Math.PI;
      const bx = p.x, by = p.y + Math.sin(t * 2.3) * 3 * u;
      g.save();
      g.globalAlpha *= bq;
      g.translate(bx, by); g.rotate(ang * 0.6 + Math.sin(t * 1.7) * 0.035); if (flip) g.scale(-1, 1);
      const s = narrow ? 0.95 : 1.1;
      for (let r = 0; r < 2; r++) {
        const f = fract(t * 0.5 + r * 0.5);
        g.save(); g.strokeStyle = F.ink(0.32 * (1 - f)); g.lineWidth = 1.8 * u; g.beginPath(); g.ellipse(0, 10 * u, (60 + f * 50) * u * s, (8 + f * 10) * u, 0, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke(); g.restore();
      }
      brush(g, F, [[-58 * u * s, -8 * u], [-20 * u * s, 8 * u], [24 * u * s, 8 * u], [60 * u * s, -10 * u]], { w: 12 * u, color: F.ink(0.92), ti: 0.12, to: 0.2, min: 0.2, dry: 0.4, seed: 1201 });
      brush(g, F, [[-40 * u * s, -4 * u], [40 * u * s, -5 * u]], { w: 4 * u, color: F.ink(0.6), ti: 0.1, to: 0.2, dry: 0, seed: 1202 });
      blot(g, -12 * u * s, -40 * u, 8 * u, F.ink(0.92), 0.8 * u);
      brush(g, F, [[-12 * u * s, -31 * u], [-17 * u * s, -18 * u], [-6 * u * s, -6 * u]], { w: 12 * u, color: F.ink(0.85), ti: 0.15, to: 0.3, dry: 0.3, seed: 1203 });
      const pa = 0.5 + Math.sin(t * 1.4) * 0.12;
      brush(g, F, [[20 * u * s - Math.cos(pa) * 60 * u, -Math.sin(pa) * 70 * u - 10 * u], [20 * u * s + Math.cos(pa) * 40 * u, Math.sin(pa) * 50 * u]], { w: 3.6 * u, color: F.ink(0.85), ti: 0.05, to: 0.3, dry: 0, seed: 1204 });
      brush(g, F, [[-14 * u * s, -26 * u], [8 * u * s, -22 * u]], { w: 6 * u, color: F.ink(0.85), ti: 0.1, to: 0.3, dry: 0, seed: 1205 });
      g.restore();
    }
  }

  // ---- compare: two hanging scrolls unroll, each with its figure and a tally of strokes ------------
  function compare(g, F, b, q, d, t, after = 0) {
    const { u, narrow } = F;
    const vals = [Math.max(0, Number(d.leftValue) || 0), Math.max(0, Number(d.rightValue) || 0)], max = Math.max(...vals, 1);
    const names = [d.left, d.right];
    const sw = Math.min(b.w * 0.3, 440 * u), sh = Math.min(b.h - 30 * u, 780 * u), top = b.y + 30 * u;
    const cxs = [b.x + b.w * 0.24, b.x + b.w * 0.76];
    cxs.forEach((cx, side) => {
      const s0 = 0.04 + side * 0.18, unroll = inout(span(q, s0, s0 + 0.36));
      const nail = [cx, top - 60 * u];
      g.save();
      const swing = Math.sin(t * 0.85 + side * 2.1) * (0.012 + 0.016 * ease(span(after, 0, 1)));
      g.translate(nail[0], nail[1]); g.rotate(swing); g.translate(-nail[0], -nail[1]);
      const sq = span(q, s0 - 0.04, s0 + 0.06);
      brush(g, F, [nail, [cx - sw * 0.38, top]], { w: 2.6 * u, q: sq, color: F.ink(0.6), dry: 0, ti: 0.05, to: 0.1, seed: 1300 + side });
      brush(g, F, [nail, [cx + sw * 0.38, top]], { w: 2.6 * u, q: sq, color: F.ink(0.6), dry: 0, ti: 0.05, to: 0.1, seed: 1302 + side });
      blot(g, nail[0], nail[1], 5 * u * ease(sq), F.ink(0.9));
      const ph = (sh - 40 * u) * unroll, py = top + 10 * u;
      if (unroll > 0) {
        // Mounting silk, then the paper panel inside it.
        g.fillStyle = F.ink(0.14); g.fillRect(cx - sw / 2, py, sw, ph);
        g.fillStyle = F.paper(1); g.fillRect(cx - sw / 2 + 18 * u, py + 26 * u, sw - 36 * u, Math.max(0, ph - 52 * u));
        wash(g, (c) => c.rect(cx - sw / 2 + 18 * u, py + 26 * u, sw - 36 * u, Math.max(0, ph - 52 * u)), F.ink(0.03), 0, { w: 2 * u, color: F.ink(0.18) });
      }
      brush(g, F, [[cx - sw / 2 - 26 * u, top + 4 * u], [cx + sw / 2 + 26 * u, top + 4 * u]], { w: 15 * u, q: sq, color: F.ink(0.9), ti: 0.02, to: 0.02, min: 0.85, dry: 0.3, seed: 1310 + side, wob: 0.03 });
      if (unroll > 0) {
        g.save();
        g.beginPath(); g.rect(cx - sw / 2, py, sw, ph); g.clip();
        const iw = sw - 70 * u;
        write(g, F, names[side] || "", cx, py + 92 * u, 46 * u, { align: "center", color: F.ink(0.9), q: span(unroll, 0.25, 0.6), maxW: iw, min: 42 * u });
        const nq = span(q, s0 + 0.2, s0 + 0.5);
        write(g, F, tally(vals[side], ease(nq), d), cx, py + 250 * u, 140 * u, { align: "center", color: side ? F.acc(1) : F.ink(0.72), weight: 600, q: nq > 0 ? 1 : 0, maxW: iw, min: 96 * u });
        // Tally strokes, four upright and one across: one stroke per unit when the value is small enough to
        // count, otherwise its share of twenty. Each stroke lands as the figure above counts past it.
        const exact = vals[side] <= 20 && Math.abs(vals[side] % 1) < 1e-6;
        const marks = vals[side] > 0 ? (exact ? Math.round(vals[side]) : Math.max(1, Math.round((vals[side] / max) * 20))) : 0, groups = Math.ceil(marks / 5);
        const counted = ease(nq) * marks;
        const gw = 104 * u, perRow = Math.max(1, Math.floor(iw / gw)), mh = 64 * u;
        for (let gi = 0; gi < groups; gi++) {
          const row = Math.floor(gi / perRow), col = gi % perRow, inRow = Math.min(perRow, groups - row * perRow);
          const gx = cx - (inRow * gw) / 2 + col * gw + 14 * u, gy = py + 320 * u + row * (mh + 34 * u);
          const inG = Math.min(5, marks - gi * 5);
          for (let k = 0; k < inG; k++) {
            const mq = clamp(counted - (gi * 5 + k));
            if (k < 4) brush(g, F, [[gx + k * 19 * u, gy], [gx + k * 19 * u + 2 * u, gy + mh]], { w: 8 * u, q: mq, color: side ? F.acc(0.9) : F.ink(0.7), ti: 0.15, to: 0.4, dry: 0.4, seed: 1320 + side * 50 + gi * 5 + k });
            else brush(g, F, [[gx - 12 * u, gy + mh * 0.75], [gx + 70 * u, gy + mh * 0.2]], { w: 7 * u, q: mq, color: side ? F.acc(0.9) : F.ink(0.7), ti: 0.15, to: 0.5, dry: 0.5, seed: 1320 + side * 50 + gi * 5 + k });
          }
        }
        g.restore();
      }
      brush(g, F, [[cx - sw / 2 - 30 * u, py + ph + 6 * u], [cx + sw / 2 + 30 * u, py + ph + 6 * u]], { w: 19 * u, q: sq, color: F.ink(0.92), ti: 0.02, to: 0.02, min: 0.85, dry: 0.3, seed: 1312 + side, wob: 0.03 });
      if (sq > 0) for (const e of [-1, 1]) {
        const kx = cx + e * (sw / 2 + 32 * u), ky = py + ph + 6 * u;
        blot(g, kx, ky, 11 * u, F.ink(0.9), 0.6 * u);
        // A silk tassel hangs from each roller knob and swings against the scroll's sway.
        const tq = span(unroll, 0.7, 1), ta = -swing * 9 + Math.sin(t * 1.6 + e + side) * 0.12, L = 70 * u * tq;
        if (tq > 0) {
          const tx = kx + Math.sin(ta) * L, ty = ky + Math.cos(ta) * L;
          brush(g, F, [[kx, ky + 8 * u], [lerp(kx, tx, 0.5), lerp(ky, ty, 0.5)], [tx, ty]], { w: 3 * u, color: F.ink(0.7), ti: 0.05, to: 0.1, dry: 0, seed: 1330 + side * 2 + e });
          brush(g, F, [[tx, ty - 4 * u], [tx + Math.sin(ta) * 30 * u, ty + 32 * u]], { w: 13 * u, color: side ? F.acc(0.85) : F.ink(0.8), ti: 0.15, to: 0.5, min: 0.3, dry: 0.85, seed: 1336 + side * 2 + e });
        }
      }
      g.restore();
    });
    // Between them: a brushed arrow and the change in vermilion.
    const aq = span(q, 0.55, 0.78), ay = top + sh * 0.36, x1 = cxs[0] + sw / 2 + 40 * u, x2 = cxs[1] - sw / 2 - 40 * u;
    if (x2 - x1 > 60 * u) {
      const r = brush(g, F, [[x1, ay + 10 * u], [lerp(x1, x2, 0.5), ay - 14 * u], [x2, ay + 4 * u]], { w: 13 * u, q: aq, color: F.ink(0.82), ti: 0.08, to: 0.25, dry: 0.6, seed: 1400 });
      if (r && aq >= 1) flicks(g, F, x2, ay + 4 * u, 0.15, 34 * u, F.ink(0.82), span(q, 0.76, 0.84), 1401);
      const pct = vals[0] > 0 ? Math.round(((vals[1] - vals[0]) / vals[0]) * 100) : 0;
      write(g, F, `${pct >= 0 ? "+" : "−"}${Math.abs(pct)}%`, (x1 + x2) / 2, ay - 54 * u, 64 * u, { align: "center", color: F.acc(1), weight: 600, q: span(q, 0.7, 0.92), maxW: x2 - x1 + 40 * u, min: 42 * u });
    }
  }

  const DRAW = { chart, object, people, process, compare };

  // ---- the world: paper, distant islands, moon, mist, reeds, rock and petals ------------------------
  let paperKey = "", paperCv = null;
  function paper(ctx, F) {
    const { W, H, u, T } = F, tex = F.S.look.texture;
    const key = `${W}x${H}:${T.paper}:${tex}`;
    if (paperKey !== key) {
      paperKey = key;
      paperCv = document.createElement("canvas"); paperCv.width = W; paperCv.height = H;
      const g = paperCv.getContext("2d"), r = rng(41);
      g.fillStyle = T.paper; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 80; i++) {
        const x = r() * W, y = r() * H, rad = (60 + r() * 260) * u, dark = r() < 0.55;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, dark ? `rgba(${T.ink},${0.03 * tex})` : `rgba(${T.mistRGB},${0.09 * tex})`); gr.addColorStop(1, `rgba(${T.ink},0)`);
        g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      g.lineCap = "round";
      for (let i = 0; i < 520; i++) {
        const x = r() * W, y = r() * H, L = (14 + r() * 70) * u, a = r() * TAU, bend = (r() - 0.5) * 0.8;
        g.strokeStyle = r() < 0.5 ? `rgba(${T.fibre},${(0.05 + r() * 0.07) * tex})` : `rgba(${T.mistRGB},${(0.12 + r() * 0.14) * tex})`;
        g.lineWidth = (0.5 + r() * 0.9) * u;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + bend) * L * 0.5, y + Math.sin(a + bend) * L * 0.5, x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke();
      }
      const vg = g.createRadialGradient(W * 0.5, H * 0.46, Math.min(W, H) * 0.3, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.62);
      vg.addColorStop(0, `rgba(${T.ink},0)`); vg.addColorStop(1, `rgba(${T.ink},${T.vignette * tex})`);
      g.fillStyle = vg; g.fillRect(0, 0, W, H);
    }
    ctx.drawImage(paperCv, 0, 0);
  }
  let landKey = "", land = null;
  // Three landscapes, one per explainer: a moonlit lake of peaks, karst pillars over a dawn river,
  // and low pine ridges under snow. Each range is a graded wash, pooled and textured with brushwork.
  const LANDS = {
    1: { wide: [{ seed: 41, base: 0.6, amp: 0.5, a: 0.22, blur: 5, fac: 0.12, N: 6, sharp: 2.2, refl: 0, thin: 0.55 }, { seed: 43, base: 0.64, amp: 0.3, a: 0.32, blur: 2.6, fac: 0.24, N: 7, sharp: 2.4, refl: 0.3, thin: 0.5 }, { seed: 47, base: 0.69, amp: 0.1, a: 0.46, blur: 1.6, fac: 0.42, N: 9, sharp: 1.6, refl: 0.42 }],
      tall: [{ seed: 41, base: 0.45, amp: 0.25, a: 0.22, blur: 5, fac: 0.12, N: 5, sharp: 2.2, refl: 0, thin: 0.55 }, { seed: 43, base: 0.5, amp: 0.15, a: 0.32, blur: 2.4, fac: 0.24, N: 6, sharp: 2.4, refl: 0.3, thin: 0.5 }, { seed: 47, base: 0.545, amp: 0.06, a: 0.46, blur: 1.6, fac: 0.42, N: 8, sharp: 1.6, refl: 0.42 }] },
    2: { wide: [{ seed: 61, base: 0.6, amp: 0.2, a: 0.2, blur: 6, fac: 0.1, N: 6, sharp: 0.85, refl: 0, wide: 1.8 }, { seed: 63, base: 0.65, amp: 0.15, a: 0.34, blur: 2.6, fac: 0.22, N: 7, sharp: 0.9, refl: 0.25, wide: 1.6, pines: 1 }, { seed: 67, base: 0.7, amp: 0.09, a: 0.5, blur: 1.6, fac: 0.4, N: 9, sharp: 1, refl: 0.4, pines: 1 }],
      tall: [{ seed: 61, base: 0.45, amp: 0.1, a: 0.2, blur: 6, fac: 0.1, N: 5, sharp: 0.85, refl: 0, wide: 1.8 }, { seed: 63, base: 0.5, amp: 0.08, a: 0.34, blur: 2.4, fac: 0.22, N: 6, sharp: 0.9, refl: 0.25, wide: 1.6, pines: 1 }, { seed: 67, base: 0.545, amp: 0.05, a: 0.5, blur: 1.6, fac: 0.4, N: 8, sharp: 1, refl: 0.4, pines: 1 }] },
  };
  function buildLand(F) {
    const { W, H, u, T, tall } = F;
    // Far peaks (steep, pale, ridge-dark), middle islands and a near shore: each a graded wash.
    const specs = LANDS[F.v] ? LANDS[F.v][tall ? "tall" : "wide"] : tall
      ? [{ seed: 21, base: 0.44, amp: 0.22, a: 0.24, blur: 5, fac: 0.12, N: 5, sharp: 1.25, refl: 0 }, { seed: 3, base: 0.5, amp: 0.12, a: 0.3, blur: 2.4, fac: 0.22, N: 6, sharp: 1.5, refl: 0.3 }, { seed: 9, base: 0.545, amp: 0.07, a: 0.46, blur: 1.6, fac: 0.4, N: 8, sharp: 1.8, refl: 0.42 }]
      : [{ seed: 21, base: 0.58, amp: 0.46, a: 0.24, blur: 5, fac: 0.12, N: 5, sharp: 1.25, refl: 0 }, { seed: 3, base: 0.62, amp: 0.2, a: 0.32, blur: 2.6, fac: 0.22, N: 7, sharp: 1.5, refl: 0.3 }, { seed: 9, base: 0.675, amp: 0.11, a: 0.48, blur: 1.6, fac: 0.4, N: 9, sharp: 1.8, refl: 0.42 }];
    return specs.map((sp, li) => {
      const pw = Math.round(W * 2.6), baseY = sp.base * H, top = Math.max(0, Math.floor(baseY - sp.amp * H * 1.05 - 30 * u)), bottom = Math.ceil(baseY + sp.amp * H * 0.9);
      const c = document.createElement("canvas"); c.width = pw; c.height = bottom - top;
      const g = c.getContext("2d");
      const n1 = loopNoise(sp.seed, sp.N), n2 = loopNoise(sp.seed + 1, sp.N * 2), n3 = loopNoise(sp.seed + 2, sp.N * 5), env = loopNoise(sp.seed + 3, Math.max(3, sp.N >> 1) + 1);
      const envN = Math.max(3, sp.N >> 1) + 1;
      // Massifs: a seeded run of peaks, each a steep cone roughened by noise; the silhouette is their union.
      const pr = rng(sp.seed * 31), peaks = [];
      for (let x = pr() * pw * 0.1; x < pw; x += pw * (0.07 + pr() * 0.09) * (li === 0 ? 1.3 : 1)) { const ph = 0.22 + Math.pow(pr(), 1.7) * 0.8; peaks.push([x, ph, pw * (0.03 + ph * 0.06 + pr() * 0.02) * (li === 0 ? 1.2 : 1.5) * (sp.thin || 1) * (sp.wide || 1), pr()]); }
      const hAt = (x) => {
        const f = x / pw;
        let h = 0;
        for (const [px, ph, pwid, j] of peaks) {
          for (const sx of [px - pw, px, px + pw]) {
            const d = Math.abs(x - sx) / pwid;
            if (d >= 1) continue;
            const lean = x < sx ? 1 + (j - 0.5) * 0.5 : 1 - (j - 0.5) * 0.5;
            h = Math.max(h, ph * Math.pow(1 - Math.min(1, d * lean), sp.sharp));
          }
        }
        const rough = 0.86 + 0.1 * n2(f * sp.N * 2) + 0.06 * n3(f * sp.N * 5) + 0.03 * Math.sin(x * 0.09 / u);
        return clamp(h * rough + 0.06 * (n1(f * sp.N) + 1) / 2, 0, 1.05);
      };
      const by = baseY - top, prof = [];
      for (let x = -8; x <= pw + 8; x += 4 * u) prof.push([x, by - sp.amp * H * hAt(((x % pw) + pw) % pw)]);
      const trace = (k) => { k.moveTo(prof[0][0], by); prof.forEach((p) => k.lineTo(p[0], p[1])); k.lineTo(prof[prof.length - 1][0], by); k.closePath(); };
      const ridge = (k) => { k.moveTo(prof[0][0], prof[0][1]); prof.forEach((p) => k.lineTo(p[0], p[1])); };
      // Body: a light overall wash, then the ridge soaked dark and bleeding downward inside the shape.
      const gr = g.createLinearGradient(0, by - sp.amp * H, 0, by);
      gr.addColorStop(0, `rgba(${T.ink},${sp.a * 0.32})`); gr.addColorStop(0.6, `rgba(${T.ink},${sp.a * 0.12})`); gr.addColorStop(1, `rgba(${T.ink},0)`);
      g.save(); g.filter = `blur(${sp.blur * u}px)`; g.fillStyle = gr; g.beginPath(); trace(g); g.fill(); g.restore();
      g.save(); g.beginPath(); trace(g); g.clip(); g.lineJoin = "round"; g.lineCap = "round";
      for (const [wd, al, bl] of [[sp.amp * H * 0.4, 0.6, 30], [sp.amp * H * 0.14, 0.8, 12], [12 * u, 0.75, 3]]) {
        g.filter = `blur(${bl * u}px)`; g.strokeStyle = `rgba(${T.ink},${sp.a * al})`; g.lineWidth = wd; g.beginPath(); ridge(g); g.stroke();
      }
      g.restore();
      // Crest line, broken where the ridge dips into mist, and cun texture strokes down the slopes.
      const r = rng(sp.seed * 17);
      // The contour: separate tapered brush strokes along the ridge, with gaps where mist crosses it.
      {
        let i = 0;
        while (i < prof.length - 4) {
          const len = Math.floor(12 + r() * 50), gap = Math.floor(3 + r() * 16);
          const seg = prof.slice(i, Math.min(prof.length, i + len)).filter(([, y]) => by - y > 8 * u);
          if (seg.length > 4) brush(g, F, seg, { raw: true, w: (li === 2 ? 5 : li === 1 ? 3.6 : 2.6) * u * (0.7 + r() * 0.7), color: `rgba(${T.ink},${Math.min(1, sp.a * (1.3 + r() * 0.8))})`, ti: 0.15, to: 0.4, dry: 0.5, seed: sp.seed * 100 + i, wob: 0.3 });
          i += len + gap;
        }
      }
      // Uneven pigment: soaked patches and pale blooms inside the silhouette, then axe-cut brush
      // strokes down the slopes and paper fibres breaking the wash.
      g.save(); g.beginPath(); trace(g); g.clip(); g.lineCap = "round";
      for (let i = 0; i < (li === 0 ? 70 : 90); i++) {
        const x = r() * pw, hh = sp.amp * H * hAt(x);
        if (hh < 16 * u) continue;
        const y = by - hh * (0.35 + r() * 0.6), rad = (30 + r() * 110) * u, lite = r() < 0.35;
        const bl = g.createRadialGradient(x, y, 0, x, y, rad);
        if (lite) { bl.addColorStop(0, `rgba(${T.mistRGB},${0.4})`); bl.addColorStop(1, `rgba(${T.mistRGB},0)`); }
        else { bl.addColorStop(0, `rgba(${T.ink},${sp.a * (0.45 + r() * 0.6)})`); bl.addColorStop(1, `rgba(${T.ink},0)`); }
        g.fillStyle = bl; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      g.restore();
      for (let i = 0; i < (li === 0 ? 120 : li === 1 ? 110 : 90); i++) {
        const x = r() * pw, hh = sp.amp * H * hAt(x);
        if (hh < 24 * u) continue;
        const slope = hAt(x + 6 * u) - hAt(x - 6 * u), dir = slope > 0 ? -1 : 1;
        const y0 = by - hh + 4 * u + r() * hh * 0.4, L = (18 + r() * 46) * u * (li === 0 ? 1.3 : 1);
        brush(g, F, [[x, y0], [x + dir * L * 0.25, y0 + L * 0.5], [x + dir * L * 0.5, y0 + L]], { w: (7 + r() * 12) * u * (li === 2 ? 1.2 : 1), color: `rgba(${T.ink},${sp.a * (0.35 + r() * 0.5) * (1 - (y0 - (by - hh)) / hh)})`, ti: 0.15, to: 0.6, dry: 0.95, seed: sp.seed * 1000 + i, wob: 0.25 });
      }
      g.save(); g.beginPath(); trace(g); g.clip(); g.lineCap = "round";
      for (let i = 0; i < 220; i++) {
        const x = r() * pw, y = by - r() * sp.amp * H, L = (10 + r() * 40) * u, ang = -0.3 + r() * 0.6;
        g.strokeStyle = `rgba(${T.mistRGB},${0.18 + r() * 0.3})`; g.lineWidth = (0.6 + r() * 1.6) * u;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * L, y + Math.sin(ang) * L); g.stroke();
      }
      g.restore();
      g.save(); g.lineCap = "round";
      if (sp.pines) for (let i = 0; i < 70; i++) {
        // Pines on the snowy ridges: a dark trunk and three tiers of dry-brush needles.
        const x = r() * pw, hh = sp.amp * H * hAt(x);
        if (hh < 20 * u) continue;
        const yb = by - hh + 6 * u, th = (20 + r() * 34) * u * (li === 2 ? 1.4 : 1);
        g.strokeStyle = `rgba(${T.ink},${sp.a * 1.4})`; g.lineWidth = 1.6 * u; g.beginPath(); g.moveTo(x, yb); g.lineTo(x, yb - th); g.stroke();
        for (let k = 0; k < 3; k++) { const yy = yb - th * (0.3 + k * 0.3), ww = th * (0.42 - k * 0.11); brush(g, F, [[x - ww, yy + 2 * u], [x, yy - 3 * u], [x + ww, yy + 2 * u]], { w: 5 * u, color: `rgba(${T.ink},${sp.a * 1.5})`, ti: 0.2, to: 0.3, dry: 0.7, seed: sp.seed * 77 + i * 3 + k }); }
      }
      // Dry-brush dots of distant trees on the crests.
      for (let i = 0; i < (li === 0 ? 0 : 160); i++) {
        const x = r() * pw, hh = sp.amp * H * hAt(x);
        if (hh < 30 * u) continue;
        g.fillStyle = `rgba(${T.ink},${sp.a * (0.8 + r() * 0.8)})`;
        g.beginPath(); g.ellipse(x, by - hh + (1 + r() * 4) * u, (1.5 + r() * 2.5) * u, (1 + r() * 1.8) * u, 0, 0, TAU); g.fill();
      }
      g.restore();
      // Mist eats the foot of every range, so each floats.
      g.save(); g.globalCompositeOperation = "destination-out";
      const foot = g.createLinearGradient(0, by - sp.amp * H * 0.55, 0, by);
      foot.addColorStop(0, "rgba(0,0,0,0)"); foot.addColorStop(1, `rgba(0,0,0,${sp.refl ? 0.55 : 0.92})`);
      g.fillStyle = foot; g.fillRect(0, by - sp.amp * H * 0.55, pw, sp.amp * H * 0.55 + 1);
      g.restore();
      if (sp.refl) {
        // Reflection in the lake, broken into ripple bands.
        g.save(); g.translate(0, by * 2); g.scale(1, -1); g.filter = `blur(${sp.blur * 1.8 * u}px)`; g.globalAlpha = sp.refl; g.fillStyle = gr; g.beginPath(); trace(g); g.fill(); g.restore();
        g.save(); g.globalCompositeOperation = "destination-out";
        for (let y = by + 2 * u; y < c.height; y += (4 + r() * 6) * u) { g.fillStyle = `rgba(0,0,0,${0.4 + r() * 0.5})`; g.fillRect(0, y, pw, (1 + r() * 2) * u); }
        const fade = g.createLinearGradient(0, by, 0, c.height); fade.addColorStop(0, "rgba(0,0,0,0)"); fade.addColorStop(1, "rgba(0,0,0,1)");
        g.fillStyle = fade; g.fillRect(0, by, pw, c.height - by);
        g.restore();
      }
      return { c, pw, top, fac: sp.fac, baseY };
    });
  }
  function landscape(ctx, F) {
    const { W, H, u, T, t, tall } = F;
    const key = `${W}x${H}:${T.ink}:${T.paper}:${F.v}`;
    if (landKey !== key) { land = buildLand(F); landKey = key; }
    const X = F.X, quiet = F.quiet, v = F.v;
    if (v === 1) {
      // Dawn: a vermilion sun low over the river, soaked into the paper, half veiled by mist.
      const mx = W * (tall ? 0.3 : 0.8) - X * 0.015, my = H * (tall ? 0.24 : 0.19) - Math.min(1, t / 30) * 20 * u, mr = H * (tall ? 0.05 : 0.075);
      ctx.save(); ctx.filter = `blur(${10 * u}px)`; ctx.fillStyle = F.acc(0.18 * quiet); ctx.beginPath(); ctx.arc(mx, my, mr * 1.7, 0, TAU); ctx.fill();
      ctx.filter = `blur(${2.4 * u}px)`; ctx.fillStyle = F.acc(0.62 * quiet); ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill(); ctx.restore();
      F.sun = [mx, mr];
    } else if (v === 2) {
      // Snow sky: a heavy, uneven grey wash pooled across the top, lighter toward the ridges.
      const sk = ctx.createLinearGradient(0, 0, 0, H * 0.55);
      sk.addColorStop(0, `rgba(${T.ink},${0.16 * quiet})`); sk.addColorStop(1, `rgba(${T.ink},0)`);
      ctx.fillStyle = sk; ctx.fillRect(0, 0, W, H * 0.55);
      for (let i = 0; i < 7; i++) {
        const x = fract(hash(i, 31) + t * 0.004 - X / (W * 6)) * W * 1.4 - W * 0.2, y = H * (0.04 + hash(i, 32) * 0.22), rx = W * (0.2 + hash(i, 33) * 0.2), ry = H * 0.07;
        ctx.save(); ctx.translate(x, y); ctx.scale(rx / ry, 1);
        const m = ctx.createRadialGradient(0, 0, 0, 0, 0, ry); m.addColorStop(0, `rgba(${T.ink},${0.08 * quiet})`); m.addColorStop(1, `rgba(${T.ink},0)`);
        ctx.fillStyle = m; ctx.beginPath(); ctx.arc(0, 0, ry, 0, TAU); ctx.fill(); ctx.restore();
      }
    } else {
      // The moon: negative space held inside a ring of soft grey wash.
      const mx = W * (tall ? 0.7 : 0.76) - X * 0.02, my = H * (tall ? 0.16 : 0.25), mr = H * (tall ? 0.065 : 0.1);
      const glow = F.scene === "closing" ? 1.25 : 1;
      const gr = ctx.createRadialGradient(mx, my, mr * 0.95, mx, my, mr * 2.8);
      gr.addColorStop(0, `rgba(${T.ink},${0.1 * quiet * glow})`); gr.addColorStop(1, `rgba(${T.ink},0)`);
      ctx.fillStyle = gr; ctx.fillRect(mx - mr * 3, my - mr * 3, mr * 6, mr * 6);
      ctx.save(); ctx.filter = `blur(${2 * u}px)`; ctx.fillStyle = F.S.look.dark ? `rgba(${T.ink},0.72)` : `rgba(${T.mistRGB},${0.85})`; ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill(); ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = quiet;
    for (const L of land) {
      const off = (((X * L.fac) % L.pw) + L.pw) % L.pw;
      ctx.drawImage(L.c, -off, L.top); ctx.drawImage(L.c, L.pw - off, L.top);
    }
    // Light on the water: short strokes that shimmer and drift.
    const wy = land[land.length - 1].baseY;
    if (F.sun) {
      // The sun's path on the river: broken vermilion strokes that shiver.
      const [sx, sr] = F.sun;
      for (let k = 0; k < 14; k++) {
        const y = wy + 10 * u + k * 16 * u, ww = sr * (1.6 - k * 0.07) * (0.7 + 0.3 * Math.sin(t * 2.3 + k * 1.7)), ox = Math.sin(t * 1.1 + k) * 8 * u;
        ctx.fillStyle = F.acc(0.3 * quiet * (1 - k / 14)); ctx.fillRect(sx - ww / 2 + ox, y, ww, (3 + (k % 3)) * u);
      }
    }
    ctx.lineCap = "round";
    for (let i = 0; i < 36; i++) {
      const x = fract(hash(i, 1) - (X * 0.3) / (W * 1.4) + t * 0.004) * W * 1.4 - W * 0.2, y = wy + 8 * u + Math.pow(hash(i, 2), 1.4) * (H - wy) * 0.85;
      const a = 0.12 * (0.5 + 0.5 * Math.sin(t * 1.3 + i * 2.1)), L = (30 + hash(i, 3) * 80) * u;
      ctx.strokeStyle = `rgba(${T.ink},${a})`; ctx.lineWidth = (1 + hash(i, 4) * 1.6) * u;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + L, y + (hash(i, 5) - 0.5) * 3 * u); ctx.stroke();
    }
    ctx.restore();
    // Mist banks drifting across the islands.
    const bands = v === 1 ? [[0.42, 0.55, 7], [0.52, 0.7, -5], [0.62, 0.7, 10], [0.72, 0.55, -8], [0.86, 0.45, 6], [0.3, 0.35, -3]]
      : v === 2 ? [[0.55, 0.6, 5], [0.66, 0.7, -4], [0.76, 0.5, 6], [0.9, 0.45, -5]]
      : [[0.47, 0.5, 9], [0.6, 0.62, -6], [0.7, 0.45, 12], [0.86, 0.4, 7], [0.3, 0.3, -4]];
    bands.forEach(([fy, a, sp], i) => {
      const x = (fract(hash(i, 7) + (t * sp * u) / (W * 1.8) - (X * 0.25) / (W * 1.8)) * 1.8 - 0.4) * W, y = (tall ? fy * 0.92 : fy) * H, rx = W * (0.4 + hash(i, 8) * 0.25), ry = H * 0.05;
      ctx.save(); ctx.translate(x, y); ctx.scale(rx / ry, 1);
      const m = ctx.createRadialGradient(0, 0, 0, 0, 0, ry);
      m.addColorStop(0, `rgba(${T.mistRGB},${a})`); m.addColorStop(1, `rgba(${T.mistRGB},0)`);
      ctx.fillStyle = m; ctx.beginPath(); ctx.arc(0, 0, ry, 0, TAU); ctx.fill(); ctx.restore();
    });
    // Negative space kept open where the headline is written: a slow, breathing bank of mist.
    {
      const cx = W * (tall ? 0.5 : 0.3) + Math.sin(t * 0.21) * 30 * u, cy = H * (tall ? 0.12 : 0.13), ry = H * (tall ? 0.12 : 0.17), rx = W * (tall ? 0.6 : 0.42);
      ctx.save(); ctx.translate(cx, cy); ctx.scale(rx / ry, 1);
      const m = ctx.createRadialGradient(0, 0, 0, 0, 0, ry);
      m.addColorStop(0, `rgba(${T.mistRGB},0.62)`); m.addColorStop(0.55, `rgba(${T.mistRGB},0.4)`); m.addColorStop(1, `rgba(${T.mistRGB},0)`);
      ctx.fillStyle = m; ctx.beginPath(); ctx.arc(0, 0, ry, 0, TAU); ctx.fill(); ctx.restore();
    }
  }
  // A skein of herons rowing slowly across the sky: each a dark body flick and two beating wing strokes.
  function birds(g, F) {
    const { W, H, u, t, tall } = F;
    for (let flock = 0; flock < 2; flock++) {
      const per = flock ? 23 : 17, f = fract(t / per + (flock ? 0.62 : 0.18));
      const lead = [W * 1.12 - f * W * 1.35, H * (tall ? 0.22 : flock ? 0.33 : 0.2) - f * H * 0.06 + Math.sin(t * 0.4 + flock) * 8 * u];
      const n = flock ? 3 : 5, s = (flock ? 0.7 : 1) * (tall ? 0.8 : 1) * u;
      for (let i = 0; i < n; i++) {
        const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
        const x = lead[0] + row * 46 * s, y = lead[1] + side * row * 20 * s + Math.sin(t * 1.1 + i) * 3 * u;
        const flap = Math.sin(t * 4.2 + i * 0.9 + flock * 2);
        const a = F.ink(0.62 * clamp((x - W * (tall ? 0.05 : 0.42)) / (W * 0.18)) * clamp((W * 1.05 - x) / (W * 0.1)));
        brush(g, F, [[x - 14 * s, y + 1 * s], [x, y], [x + 16 * s, y + 3 * s]], { w: 5 * s, color: a, ti: 0.15, to: 0.6, dry: 0, seed: 5000 + i });
        for (const wsd of [-1, 1]) {
          const tipY = y - (10 + flap * 12) * s * (wsd < 0 ? 1 : 0.8);
          brush(g, F, [[x + 2 * s, y], [x + (6 + wsd * 4) * s, y - (4 + flap * 6) * s], [x + (14 + wsd * 10) * s, tipY]], { w: 4.5 * s, color: a, ti: 0.05, to: 0.7, dry: 0, seed: 5010 + i * 2 + wsd });
        }
      }
    }
  }
  // The foreground comes from each scene's own subject: reeds and a rock by the lake for statements,
  // reeds alone beside the device, tall pines framing the gathering, grass under the bamboo, and nothing
  // over the river or the scrolls, whose own art fills the lower frame. It cross-fades with the scroll.
  const FORE = { title: ["reeds", "rock"], closing: ["reeds"], object: ["reeds"], people: ["pines"], chart: ["grass"], process: [], compare: [] };
  function reeds(g, F) {
    const { H, u, t, tall } = F;
    for (let k = 0; k < 7; k++) {
      const x0 = (12 + k * (tall ? 10 : 16)) * u, h = H * (tall ? 0.14 + 0.1 * hash(k, 1) : 0.26 + 0.2 * hash(k, 1)), lean = (hash(k, 2) - 0.3) * 70 * u;
      const sway = Math.sin(t * 0.9 + k * 0.7) * (8 + 8 * hash(k, 3)) * u;
      const tip = [x0 + lean + sway, H - h];
      brush(g, F, [[x0, H + 10 * u], [x0 + lean * 0.3 + sway * 0.15, H - h * 0.4], [x0 + lean * 0.7 + sway * 0.55, H - h * 0.75], tip], { w: (5 + hash(k, 4) * 3) * u, color: F.ink(0.45 + hash(k, 5) * 0.35), ti: 0.02, to: 0.85, dry: 0.5, seed: 2000 + k });
      if (k % 3 === 1) brush(g, F, [tip, [tip[0] + 10 * u + sway * 0.3, tip[1] + 24 * u], [tip[0] + 16 * u + sway * 0.4, tip[1] + 58 * u]], { w: 9 * u, color: F.ink(0.55), ti: 0.2, to: 0.7, dry: 0.6, seed: 2010 + k });
    }
  }
  // A near pine leaning in from the frame edge: a crooked trunk, a few limbs and fans of dry-brush needles.
  function pine(g, F, side) {
    const { W, H, u, t, tall } = F, s = (tall ? 0.7 : 1) * u, x0 = side < 0 ? 34 * u : W - 34 * u, sw = Math.sin(t * 0.6 + side) * 6 * u;
    const P = (dx, dy) => [x0 - side * dx * s, H + dy * s];
    const trunk = [P(0, 30), P(-6, -150), P(14, -320), P(4, -470), P(26, -640), P(40, -760)].map(([x, y], i) => [x + sw * (i / 5) ** 2, y]);
    brush(g, F, trunk, { w: 30 * s, color: F.ink(0.85), ti: 0.02, to: 0.7, min: 0.25, dry: 0.85, seed: 2100 + side, wob: 0.25 });
    for (let k = 0; k < 6; k++) { const p = along(resample(spline(trunk, 8), 4 * u), 0.15 + k * 0.13); blot(g, p.x + (hash(k, side + 9) - 0.5) * 12 * s, p.y, (3 + hash(k, side + 3) * 3) * s, F.ink(0.9)); }
    [[0.38, 150, -0.15], [0.58, 190, 0.1], [0.76, 140, -0.25], [0.92, 110, 0.05]].forEach(([f, L, droop], k) => {
      const tp = resample(spline(trunk, 8), 4 * u), o = along(tp, f), lean = Math.sin(t * 0.8 + k + side) * 0.04;
      const dir = side < 0 ? 0 : Math.PI, a = dir + side * (droop + lean) * -1;
      const ex = o.x + Math.cos(a) * L * s, ey = o.y + Math.sin(a) * L * s * 0.4 - 10 * s;
      brush(g, F, [[o.x, o.y], [lerp(o.x, ex, 0.5), lerp(o.y, ey, 0.5) - 12 * s], [ex, ey]], { w: 11 * s, color: F.ink(0.82), ti: 0.05, to: 0.6, dry: 0.6, seed: 2110 + k * 2 + side });
      // Needle clusters: a pooled grey cloud, then needles radiating up and out from each cluster's heart.
      for (let c = 0; c < 3; c++) {
        const f = 0.45 + c * 0.27, hx = lerp(o.x, ex, f) + (hash(k * 3 + c, side + 21) - 0.5) * 20 * s, hy = lerp(o.y, ey, f) - 8 * s, R = (30 + hash(k * 3 + c, side + 22) * 14) * s;
        wash(g, (cc) => cc.ellipse(hx, hy - R * 0.25, R * 1.25, R * 0.6, 0, 0, TAU), F.ink(0.22), 5 * s);
        for (let n = 0; n < 13; n++) {
          const fa = -Math.PI * (0.02 + 0.96 * (n / 12)) + (hash(n + c * 13, k + side * 5) - 0.5) * 0.18 + lean * 2, L = R * (0.8 + hash(n, c + k * 7) * 0.45);
          brush(g, F, [[hx, hy], [hx + Math.cos(fa) * L, hy + Math.sin(fa) * L * 0.75]], { w: 3.4 * s, color: F.ink(0.82), ti: 0.05, to: 0.75, dry: 0, seed: 2130 + k * 40 + c * 13 + n + side, ds: 3 * u });
        }
      }
    });
  }
  function grass(g, F) {
    const { W, H, u, t } = F;
    for (let k = 0; k < 6; k++) tuft(g, F, (k < 3 ? 30 + k * 34 : W / u - 30 - (k - 3) * 34) * u, H - 10 * u, (40 + hash(k, 7) * 30) * u, 1, t, 40 + k);
  }
  function foreFor(g, F, id, alpha) {
    if (alpha <= 0.002 || !FORE[id]) return;
    g.save(); g.globalAlpha *= alpha;
    for (const part of FORE[id]) {
      if (part === "reeds") reeds(g, F);
      else if (part === "rock") margRock(g, F);
      else if (part === "pines") { pine(g, F, -1); pine(g, F, 1); }
      else if (part === "grass") grass(g, F);
    }
    g.restore();
  }
  function margins(g, F) {
    const k = F.prevId && F.local < F.c ? inout(F.local / F.c) : 1;
    if (F.scene) foreFor(g, F, F.scene, k);
    if (k < 1 && F.prevId) foreFor(g, F, F.prevId, 1 - k);
  }
  function margRock(g, F) {
    const { W, H, u, t, tall } = F;
    const s = tall ? 0.8 : 1, rx = W - (tall ? 230 : 240) * u, ry = H - (tall ? 70 : 46) * u;
    const rock = [[rx - 20 * u * s, ry], [rx - 10 * u * s, ry - 60 * u * s], [rx + 40 * u * s, ry - 110 * u * s], [rx + 100 * u * s, ry - 120 * u * s], [rx + 170 * u * s, ry - 70 * u * s], [rx + 195 * u * s, ry]];
    wash(g, (c) => c.ellipse(rx + 88 * u * s, ry + 4 * u, 170 * u * s, 18 * u, 0, 0, TAU), F.ink(0.14), 8 * u);
    const rockT = (c) => { c.moveTo(rock[0][0], rock[0][1]); spline(rock, 6).forEach((p) => c.lineTo(p[0], p[1])); c.closePath(); };
    pigment(g, F, rockT, F.ink, 0.42, 2040, { x: rx - 20 * u * s, y: ry - 120 * u * s, w: 215 * u * s, h: 120 * u * s }, { rim: 6, bleed: 3, grain: 1.2 });
    brush(g, F, rock.slice(0, 5), { w: 11 * u, color: F.ink(0.85), ti: 0.05, to: 0.4, dry: 0.75, seed: 2030 });
    brush(g, F, [[rx + 30 * u * s, ry - 70 * u * s], [rx + 60 * u * s, ry - 30 * u * s], [rx + 55 * u * s, ry - 4 * u]], { w: 7 * u, color: F.ink(0.6), ti: 0.1, to: 0.5, dry: 0.8, seed: 2031 });
    brush(g, F, [[rx + 120 * u * s, ry - 100 * u * s], [rx + 140 * u * s, ry - 50 * u * s], [rx + 128 * u * s, ry - 10 * u]], { w: 5 * u, color: F.ink(0.5), ti: 0.1, to: 0.5, dry: 0.8, seed: 2032 });
    brush(g, F, [[rx - 40 * u * s, ry + 2 * u], [rx + 90 * u * s, ry + 6 * u], [rx + 230 * u * s, ry + 1 * u]], { w: 6 * u, color: F.ink(0.6), ti: 0.1, to: 0.5, dry: 0.8, seed: 2033 });
    tuft(g, F, rx + 8 * u, ry - 50 * u * s, 30 * u, 1, t, 11);
    tuft(g, F, rx + 150 * u * s, ry - 80 * u * s, 26 * u, 1, t, 12);
    tuft(g, F, rx + 205 * u * s, ry, 24 * u, 1, t, 13);
  }
  // Plum petals let go and drift down through every scene.
  function petals(g, F) {
    const { W, H, u, t } = F;
    if (F.v === 2) {
      // Snow: soft ink-grey flakes drifting down at three depths.
      for (let i = 0; i < 60; i++) {
        const per = 8 + hash(i, 1) * 10, f = fract(t / per + hash(i, 2)), d = 0.5 + hash(i, 7);
        const x = (hash(i, 3) * 1.1 - 0.05) * W + Math.sin(f * TAU + i) * 30 * u - f * 80 * u, y = -20 * u + f * (H + 40 * u);
        blot(g, x, y, (1.5 + d * 2.6) * u, F.ink(0.16 + 0.18 * hash(i, 4)), d > 1.2 ? 1.4 * u : 0);
      }
      return;
    }
    for (let i = 0; i < 14; i++) {
      const per = 9 + hash(i, 1) * 6, f = fract(t / per + hash(i, 2));
      const x = (hash(i, 3) * 1.1 - 0.05) * W + f * 220 * u + Math.sin(f * TAU * 1.5 + i) * 40 * u, y = -30 * u + f * (H + 60 * u);
      const r = (6 + hash(i, 4) * 5) * u, rot = t * (0.8 + hash(i, 5)) + i, flat = 0.45 + 0.4 * Math.abs(Math.sin(t * 1.7 + i));
      g.save(); g.translate(x, y); g.rotate(rot); g.scale(1, flat);
      g.fillStyle = F.acc(0.55 + 0.25 * hash(i, 6));
      g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
      g.restore();
    }
  }

  // ---- title and closing: a plum branch in bloom, an underline stroke, the closing seal -------------
  const BRANCHES = {
    title: { trunk: [[30, -30], [-80, 40], [-170, 110], [-250, 128], [-330, 200], [-430, 214], [-520, 290], [-600, 300]], kids: [[0.32, [[0, 0], [-30, -70], [-100, -96], [-150, -160]]], [0.58, [[0, 0], [-10, 60], [-60, 104], [-74, 170]]], [0.82, [[0, 0], [-40, -40], [-104, -52]]], [0.2, [[0, 0], [10, 70], [-20, 130]]]] },
    closing: { trunk: [[30, 30], [-60, -40], [-120, -140], [-220, -186], [-290, -280], [-390, -310], [-460, -400], [-530, -420]], kids: [[0.3, [[0, 0], [-90, 0], [-160, 30], [-230, 20]]], [0.55, [[0, 0], [30, -80], [20, -150], [50, -210]]], [0.78, [[0, 0], [-60, 10], [-120, -10]]], [0.9, [[0, 0], [10, -60], [-10, -110]]]] },
  };
  function branch(g, F, kind, q, bloom, t) {
    const { W, H, u, tall, narrow } = F, B = BRANCHES[kind];
    const s = (tall ? 0.85 : narrow ? 0.72 : 1.05) * u;
    const ax = W + 20 * u, ay = kind === "title" ? H * (tall ? 0.07 : 0.15) : H * 0.97;
    const sway = (x, y) => { const d = Math.hypot(x, y) / 500; return [x + Math.sin(t * 0.7) * 4 * d * d, y + Math.sin(t * 0.9 + 1) * 5 * d * d]; };
    const P = (pt) => { const [x, y] = sway(pt[0], pt[1]); return [ax + x * s, ay + y * s]; };
    const trunk = B.trunk.map(P);
    const tr = brush(g, F, trunk, { w: 34 * s, q: span(q, 0, 0.5), color: F.ink(0.92), ti: 0.02, to: 0.75, min: 0.12, dry: 0.85, seed: kind === "title" ? 3001 : 3101 });
    if (!tr) return;
    const blossoms = [];
    B.kids.forEach(([f, pts], k) => {
      const o = along(tr.pts, f), base = B.trunk[Math.round(f * (B.trunk.length - 1))];
      const kp = pts.map(([x, y]) => P([base[0] + x, base[1] + y]));
      kp[0] = [o.x, o.y];
      const kq = span(q, 0.25 + f * 0.3, 0.55 + f * 0.3);
      const r = brush(g, F, kp, { w: 15 * s, q: kq, color: F.ink(0.88), ti: 0.03, to: 0.8, min: 0.1, dry: 0.7, seed: 3010 + k });
      if (!r) return;
      // A couple of twigs.
      [0.45, 0.8].forEach((tf, j) => {
        const p = along(r.pts, tf), a = p.ang + (j ? -0.9 : 0.8), L = (40 + 20 * j) * s;
        brush(g, F, [[p.x, p.y], [p.x + Math.cos(a) * L * 0.5, p.y + Math.sin(a) * L * 0.5 - 4 * s], [p.x + Math.cos(a) * L, p.y + Math.sin(a) * L]], { w: 5 * s, q: span(kq, 0.6, 1), color: F.ink(0.85), ti: 0.05, to: 0.7, dry: 0.2, seed: 3030 + k * 2 + j });
        blossoms.push([p.x + Math.cos(a) * L, p.y + Math.sin(a) * L, 0.75]);
      });
      [0.3, 0.65, 1].forEach((bf, j) => { const p = along(r.pts, bf); blossoms.push([p.x + (j % 2 ? 12 : -12) * s, p.y + (j % 2 ? -10 : 12) * s, j === 2 ? 0.9 : 1.1]); });
    });
    [0.35, 0.6, 0.85, 0.97].forEach((f, j) => { const p = along(tr.pts, f); blossoms.push([p.x + (j % 2 ? 18 : -14) * s, p.y + (j % 2 ? -16 : 14) * s, 1.2]); });
    // Blossoms open one after another: five soft vermilion petals, dark stamens and a calyx dot.
    blossoms.forEach(([x, y, sz], i) => {
      const bq = span(bloom, (i / blossoms.length) * 0.7, (i / blossoms.length) * 0.7 + 0.3);
      if (bq <= 0) return;
      const r = 13 * s * sz * ease(bq), rot = hash(i, 9) * TAU + Math.sin(t * 0.8 + i) * 0.05, bud = i % 5 === 3;
      if (bud) { blot(g, x, y, r * 0.55, F.acc(0.85), 0.8 * u); blot(g, x, y + r * 0.45, r * 0.25, F.ink(0.9)); return; }
      for (let k = 0; k < 5; k++) { const a = rot + (k * TAU) / 5; blot(g, x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.52, F.acc(0.62), 1.2 * u); }
      blot(g, x, y, r * 0.3, F.acc(0.85), 0.6 * u);
      if (bq > 0.6) {
        g.save(); g.strokeStyle = F.ink(0.8); g.lineWidth = 1.4 * u; g.lineCap = "round";
        for (let k = 0; k < 6; k++) { const a = rot + k * 1.05; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7); g.stroke(); blot(g, x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75, 1.8 * u, F.ink(0.9)); }
        g.restore();
      }
    });
  }
  // The lake's near water under a statement: a long sandbar brushed wet with grass, a mist bank over
  // it and a sampan drifting across, so the lower frame is painted, not bare.
  function lakeFront(g, F, alpha, local) {
    if (alpha <= 0) return;
    const { W, H, u, t, tall } = F, y = H * (tall ? 0.8 : 0.86);
    g.save(); g.globalAlpha *= alpha;
    const bq = span(local, 0, 0.9);
    const bar = [[W * 0.16, y + 10 * u], [W * 0.34, y - 8 * u], [W * 0.55, y - 2 * u], [W * 0.72, y + 6 * u]];
    const barT = (c) => { const top = spline(bar, 8); c.moveTo(top[0][0], top[0][1]); top.forEach((p) => c.lineTo(p[0], p[1])); c.lineTo(W * 0.72, y + 26 * u); c.quadraticCurveTo(W * 0.44, y + 40 * u, W * 0.16, y + 22 * u); c.closePath(); };
    if (bq > 0) {
      pigment(g, F, barT, F.ink, 0.3 * bq, 6100, { x: W * 0.16, y: y - 10 * u, w: W * 0.56, h: 50 * u }, { rim: 5, bleed: 4, grain: 0.05 });
      brush(g, F, bar, { w: 12 * u, q: bq, color: F.ink(0.78), ti: 0.03, to: 0.5, dry: 0.85, seed: 6101 });
      for (let k = 0; k < 7; k++) tuft(g, F, W * (0.2 + k * 0.075), y - (k % 3) * 4 * u, 30 * u, span(local, 0.3 + k * 0.05, 0.6 + k * 0.05), t, 60 + k);
      // Its reflection: soft broken bands.
      for (let k = 0; k < 5; k++) { const yy = y + (34 + k * 12) * u; g.fillStyle = F.ink(0.08 * bq * (1 - k / 5)); g.fillRect(W * (0.2 + hash(k, 41) * 0.05) + Math.sin(t * 1.3 + k) * 8 * u, yy, W * (0.45 - k * 0.05), 3 * u); }
    }
    // Mist across the sandbar, breathing.
    const m = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    m.addColorStop(0, `rgba(${F.T.mistRGB},0.55)`); m.addColorStop(1, `rgba(${F.T.mistRGB},0)`);
    g.save(); g.translate(W * 0.5 + Math.sin(t * 0.3) * 40 * u, y - 4 * u); g.scale(W * 0.4, 34 * u); g.fillStyle = m; g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill(); g.restore();
    moored(g, F, W * (tall ? 0.6 : 0.64) - t * 9 * u, H * (tall ? 0.7 : 0.74), span(local, 0.2, 1.2), t, tall ? 1 : 1.25);
    g.restore();
  }
  function hero(g, F, kind, local, j, alpha) {
    if (alpha <= 0) return;
    const { u, W } = F, dx = -(F.Pos - j) * W * 0.3;
    g.save();
    g.translate(dx, 0);
    g.globalAlpha = alpha;
    branch(g, F, kind, span(local, 0.05, 1.9), span(local, 0.7, 2.6), F.t);
    const HL = headLayout(kind === "title" ? "title" : "closing", F), lines = HL ? HL.lines : [];
    if (lines.length) {
      const x0 = Math.min(...lines.map((l) => l.x)), x1 = Math.max(...lines.map((l) => l.x + l.w)), last = lines[lines.length - 1];
      const y = last.base + HL.size * 0.32;
      brush(g, F, [[x0 - 14 * u, y + 6 * u], [lerp(x0, x1, 0.4), y - 4 * u], [x1 + 30 * u, y + 2 * u]], { w: 15 * u, q: span(local, 0.5, 1.3), color: F.ink(0.82), ti: 0.03, to: 0.55, dry: 0.85, seed: kind === "title" ? 3201 : 3202 });
      if (kind === "closing") {
        let sx = last.x + last.w + 100 * u, sy = last.base - HL.size * 0.34;
        if (sx > F.W - 120 * u) { sx = x0 + 50 * u; sy = y + 90 * u; }
        seal(g, F, sx, sy, 92 * u, span(local, 0.95, 1.35), 3300);
      }
    }
    g.restore();
  }
  // Headlines are inked on the canvas at the template's own layout (the DOM copy stays invisible).
  const headCache = {};
  let measureCtx = null;
  function headLayout(id, F) {
    const key = `${id}:${F.W}x${F.H}`;
    if (headCache[key] !== undefined) return headCache[key];
    const el = document.getElementById(id), root = document.getElementById("root");
    if (!el || !root || !(el.textContent || "").trim()) return (headCache[key] = null);
    let ox = 0, oy = 0;
    for (let n = el; n && n !== root; n = n.offsetParent) { ox += n.offsetLeft; oy += n.offsetTop; }
    const size = parseFloat(el.style.fontSize) || parseFloat(getComputedStyle(el).fontSize) || 72;
    const font = `${getComputedStyle(el).fontWeight || 500} ${size}px ${SERIF}`, maxW = el.clientWidth || F.W * 0.8;
    if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
    measureCtx.font = font;
    const words = el.textContent.trim().split(/\s+/), rows = [];
    let cur = "";
    for (const wd of words) { const tr = cur ? cur + " " + wd : wd; if (cur && measureCtx.measureText(tr).width > maxW) { rows.push(cur); cur = wd; } else cur = tr; }
    if (cur) rows.push(cur);
    const lh = size * 1.04;
    const lines = rows.map((r, i) => ({ s: r, x: ox, w: measureCtx.measureText(r).width, base: oy + lh * (i + 0.5) + size * 0.34 }));
    return (headCache[key] = { lines, size, font });
  }
  function headline(g, F, id, local, hold, hasNext) {
    const L = headLayout(id, F);
    if (!L) return null;
    let alpha = 1;
    if (hasNext && local > hold - F.c) alpha = 1 - inout((local - (hold - F.c)) / F.c);
    if (alpha <= 0) return L;
    const qq = span(local, 0.06, 0.06 + Math.min(1.1, Math.max(0.6, hold * 0.3))), n = L.lines.length;
    g.save();
    g.globalAlpha *= alpha;
    if (!F.S.paint) { g.shadowColor = F.paper(0.9); g.shadowBlur = 18 * F.u; }
    L.lines.forEach((ln, i) => { const lq = span(qq, i / n, (i + 1) / n); if (lq > 0) inkText(g, F, ln.s, ln.x, ln.base, L.size, L.font, F.ink(0.95), lq, ln.w); });
    g.restore();
    return L;
  }

  // ---- the scroll's travel, layers and compositing --------------------------------------------------
  let planCache = null, planKey = "";
  function controls() {
    if (window.__dreamcut && window.__dreamcut.controls) return window.__dreamcut.controls;
    try { if (typeof dc !== "undefined" && dc && dc.controls) return dc.controls; } catch (e) { /* not on this page */ }
    return null;
  }
  function planOf(W, H) {
    const c = controls();
    if (!c) return null;
    const key = `${W}x${H}`;
    if (planCache && planKey === key) return planCache;
    let t = 0;
    const shown = [];
    for (const id of ORDER) { const hold = Number(c[`${id}_hold`]) || 0; if (hold > 0) shown.push({ id, start: t, hold }); t += hold; }
    if (!shown.length) return null;
    const data = {
      chart: { labels: [c.bar_1_label, c.bar_2_label, c.bar_3_label, c.bar_4_label], values: [c.bar_1, c.bar_2, c.bar_3, c.bar_4], suffix: c.chart_suffix, prefix: "", highlight: Number(c.highlight) - 1 },
      object: { kind: c.device, callouts: [c.callout_1, c.callout_2, c.callout_3] },
      people: { count: c.people_count, badges: [c.badge_1, c.badge_2, c.badge_3], highlight: 1 },
      process: { steps: [c.step_1, c.step_2, c.step_3] },
      compare: { left: c.before_label, leftValue: c.before_value, right: c.after_label, rightValue: c.after_value, suffix: c.compare_suffix, prefix: "" },
    };
    planKey = key;
    return (planCache = { shown, data, length: t });
  }
  let INK = null, TMP = null;
  function layer(W, H, old) { if (old && old.width === W && old.height === H) return old; const c = document.createElement("canvas"); c.width = W; c.height = H; return c; }
  function makeFrame(S, info) {
    const { W, H, u } = S, look = S.look, T = look.tone;
    INK = layer(W, H, INK); TMP = layer(W, H, TMP);
    const plan = planOf(W, H);
    let scene = info.scene, index = info.index, local = info.local, hold = info.hold, next = info.next, ended = false;
    if (!scene && plan && info.t >= plan.length - 1e-6) { // Past the last frame: hold the finished last scene.
      const last = plan.shown[plan.shown.length - 1];
      scene = last.id; index = plan.shown.length - 1; local = info.t - last.start; hold = last.hold; next = null; ended = true;
    }
    const c = Math.max(0.05, info.change || 0.45);
    // The scroll travels one station per scene: it starts as the old headline leaves and lands as the new one arrives.
    let pan = 0, veil = -1;
    if (index > 0 && local < c) { const ph = 0.5 + (0.5 * local) / c; pan = -1 + inout(ph); veil = ph; }
    else if (next && local > hold - c) { const ph = (0.5 * (local - (hold - c))) / c; pan = inout(ph); veil = ph; }
    const Pos = Math.max(0, index) + pan;
    const drawnNow = DRAW[scene] ? 1 : 0;
    const prevId = plan && index > 0 ? plan.shown[index - 1].id : null;
    let quiet = drawnNow ? 0.8 : 1;
    if (local < c && prevId) quiet = lerp(DRAW[prevId] ? 0.8 : 1, quiet, inout(local / c));
    const box = S.tall ? { x: 90 * u, y: H * 0.3, w: W - 180 * u, h: H * 0.6 } : { x: 140 * u, y: H * 0.34, w: W - 280 * u, h: H * 0.58 };
    // Which landscape: set by the explainer's opening scene, so each explainer has its own world.
    const first = plan ? plan.shown[0].id : "title", v = [0, 1, 2, 2, 1, 0, 0][Math.max(0, ORDER.indexOf(first))];
    const dir = v === 1 ? -1 : 1, drift = v === 2 ? 6 : 10;
    const g = INK.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.filter = "none";
    g.clearRect(0, 0, W, H);
    return {
      S, W, H, u, T, tall: S.tall, narrow: W / H < 1.3, info, t: info.t, scene, index, local, hold, next, c, plan, prevId, ended, Pos, veil, quiet, box, g,
      v, X: dir * (Pos * W * 0.5 + info.t * drift * u),
      ink: (a) => `rgba(${T.ink},${a})`, acc: (a) => hexA(S.accent, a), paper: (a) => `rgba(${T.paperRGB},${a})`,
    };
  }
  function flush(ctx, F) {
    const { W, H, u } = F;
    ctx.save();
    ctx.globalAlpha = 0.22 * F.T.bleed;
    ctx.filter = `blur(${0.9 * u}px)`;
    ctx.drawImage(INK, 0, 0);
    ctx.filter = "none";
    ctx.globalAlpha = 1;
    ctx.drawImage(INK, 0, 0);
    ctx.restore();
    F.g.setTransform(1, 0, 0, 1, 0, 0);
    F.g.clearRect(0, 0, W, H);
  }
  // A bank of mist carried across the frame while the scroll travels.
  function veil(ctx, F) {
    if (F.veil < 0 || !F.S.paint) return;
    const { W, H, T } = F, ph = F.veil, k = Math.sin(Math.PI * ph), cx = lerp(W * 1.3, -W * 0.3, ph);
    for (let i = 0; i < 6; i++) {
      const x = cx + (hash(i, 21) - 0.5) * W * 0.35, y = H * (0.08 + i * 0.17), rx = W * (0.26 + hash(i, 22) * 0.14), ry = H * 0.2;
      ctx.save(); ctx.translate(x, y); ctx.scale(rx / ry, 1);
      const m = ctx.createRadialGradient(0, 0, 0, 0, 0, ry);
      m.addColorStop(0, `rgba(${T.mistRGB},${0.8 * k})`); m.addColorStop(0.6, `rgba(${T.mistRGB},${0.45 * k})`); m.addColorStop(1, `rgba(${T.mistRGB},0)`);
      ctx.fillStyle = m; ctx.beginPath(); ctx.arc(0, 0, ry, 0, TAU); ctx.fill(); ctx.restore();
    }
  }
  function runScene(g, F, id, d, local, hold, j) {
    const build = Math.min(2.1, hold * 0.56), q = clamp(local / build);
    g.save();
    g.translate(-(F.Pos - j) * F.W * 0.3, 0);
    DRAW[id](g, F, F.box, q, d, F.t, Math.max(0, local - build));
    g.restore();
  }
  let frame = null;
  const drawer = (id) => (ctx, S, box, p, d, info) => {
    const F = frame;
    if (!F) return;
    if (info && info.exit !== undefined) {
      // The outgoing scene: it keeps sliding with the scroll and dissolves into the mist.
      flush(ctx, F);
      const tg = TMP.getContext("2d");
      tg.setTransform(1, 0, 0, 1, 0, 0); tg.clearRect(0, 0, F.W, F.H);
      runScene(tg, F, id, d, info.local, info.hold, F.index - 1);
      const k = clamp(info.exit);
      ctx.save();
      ctx.globalAlpha = Math.pow(1 - k, 1.3);
      if (k > 0.02) ctx.filter = `blur(${k * 9 * F.u}px)`;
      ctx.drawImage(TMP, 0, 0);
      ctx.restore();
      if (!DRAW[F.scene]) veil(ctx, F);
      return;
    }
    if (F.scene !== id) return;
    runScene(F.g, F, id, d, info ? info.local : F.local, info ? info.hold : F.hold, F.index);
    veil(ctx, F);
    flush(ctx, F);
  };

  const halo = (paperHex, ink) => () => `0 0 1px rgba(${ink},0.55), 0 0 5px rgba(${ink},0.18), 0 0 18px ${paperHex}, 0 0 34px ${paperHex}`;
  const TONE = { paper: "#ece3cf", paperRGB: "236,227,207", ink: "28,25,23", mistRGB: "244,239,226", fibre: "120,98,66", vignette: 0.16, bleed: 1 };
  const tones = {
    light: { ...TONE, paper: "#f6f3ec", paperRGB: "246,243,236", ink: "36,42,50", mistRGB: "252,251,247", fibre: "120,120,110", vignette: 0.1 },
    dark: { ...TONE, paper: "#19181b", paperRGB: "25,24,27", ink: "232,226,212", mistRGB: "44,42,46", fibre: "200,190,170", vignette: 0.35, bleed: 0.8 },
    mono: { ...TONE, paper: "#e9e7e2", paperRGB: "233,231,226", ink: "32,32,32", mistRGB: "247,246,243", fibre: "110,110,110", vignette: 0.14 },
  };

  return {
    bg: TONE.paper, panel: "rgba(28,25,23,0.05)", ink: "#1c1917", muted: "#6d655c", accent: "#c0392b", onAccent: "#f6f1e4",
    rule: "rgba(28,25,23,0.5)", track: "rgba(28,25,23,0.1)",
    display: SERIF, displayWeight: 500, displayTracking: "0.005em", displayCase: "none",
    body: SERIF, bodyWeight: 500, figures: SERIF, radius: 2,
    motion: "focus", change: "frost",
    kit: { line: 3, fill: "solid", panel: "outline" },
    panelEdge: "rgba(28,25,23,0.35)",
    tone: TONE,
    keepArt: true,
    overlap: true,
    palettes: {
      // Morning: whiter paper and a cool blue-grey ink. Night: pale ink on a black scroll. Mono: ink alone, no vermilion.
      light: { bg: tones.light.paper, ink: "#242a32", muted: "#66707c", accent: "#b83a2e", tone: tones.light, textShadow: halo(tones.light.paper, tones.light.ink), backdrop: () => tones.light.paper },
      dark: { bg: tones.dark.paper, ink: "#e8e2d4", muted: "#a59e92", accent: "#e2553f", onAccent: "#19181b", rule: "rgba(232,226,212,0.5)", track: "rgba(232,226,212,0.12)", panel: "rgba(232,226,212,0.06)", panelEdge: "rgba(232,226,212,0.35)",
        tone: tones.dark, dark: true, textShadow: halo(tones.dark.paper, tones.dark.ink), backdrop: () => tones.dark.paper },
      mono: { bg: tones.mono.paper, ink: "#202020", muted: "#6a6a6a", accent: "#3b3b3b", onAccent: "#e9e7e2", tone: tones.mono, textShadow: halo(tones.mono.paper, tones.mono.ink), backdrop: () => tones.mono.paper },
    },
    textShadow: halo(TONE.paper, TONE.ink),
    backdrop: () => TONE.paper,
    css: (accent, look) => `#root > canvas:not(#art) { mix-blend-mode: ${look.dark ? "screen" : "multiply"}; }
      #art ~ .scene .display { color: transparent !important; text-shadow: none !important; }
      #title-scene .kicker { align-self: flex-start; background: ${accent}; color: ${look.bg}; padding: 0.24em 0.6em 0.2em; border-radius: 0.1em; letter-spacing: 0.16em; text-shadow: none; font-weight: 600; }`,
    paintOver: true,
    // The paper's tooth over everything, type included: drawn once per canvas size and palette.
    paint(ctx, W, H, t, accent, look) {
      const key = `${W}x${H}:${look.bg}`;
      if (ctx.canvas.__iw === key) return;
      ctx.canvas.__iw = key;
      const tile = document.createElement("canvas"); tile.width = tile.height = 256;
      const tg = tile.getContext("2d"), img = tg.createImageData(256, 256), r = rng(77);
      for (let i = 0; i < 256 * 256; i++) {
        const v = r(), shade = look.dark ? Math.round(v * v * 34) : Math.round(255 - v * v * 30);
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = shade; img.data[i * 4 + 3] = 255;
      }
      tg.putImageData(img, 0, 0);
      ctx.fillStyle = look.dark ? "#000" : "#fff"; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.6; ctx.fillStyle = ctx.createPattern(tile, "repeat"); ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    },
    stage(ctx, S, info) {
      const F = (frame = makeFrame(S, info));
      const kk = document.getElementById("kicker");
      if (kk && !kk.__iw) { kk.__iw = 1; kk.style.setProperty("font-size", Math.round(44 * S.u) + "px", "important"); }
      if (S.paint) { paper(ctx, F); landscape(ctx, F); }
      const g = F.g;
      if (S.paint) { margins(g, F); birds(g, F); }
      // The near water under a statement scene, fading as the scroll moves on.
      if (S.paint) {
        if (F.scene === "title" || F.scene === "closing") lakeFront(g, F, 1, F.local);
        if ((F.prevId === "title" || F.prevId === "closing") && F.local < F.c) lakeFront(g, F, 1 - inout(F.local / F.c), 9);
      }
      // The scene's headline, inked in place.
      if (F.scene) headline(g, F, F.scene === "title" || F.scene === "closing" ? F.scene : `${F.scene}-title`, F.local, F.hold, !!F.next && !F.ended);
      // Title and closing art, and the title's art leaving with the scroll.
      if (F.scene === "title" || F.scene === "closing") hero(g, F, F.scene, F.local, F.index, 1);
      if ((F.prevId === "title" || F.prevId === "closing") && F.local < F.c) hero(g, F, F.prevId, F.plan.shown[F.index - 1].hold + F.local, F.index - 1, 1 - inout(F.local / F.c));
      if (S.paint) petals(g, F);
      if (F.ended && DRAW[F.scene]) runScene(g, F, F.scene, F.plan.data[F.scene], F.local, F.hold, F.index);
      if (!DRAW[F.scene] || F.ended) { flush(ctx, F); veil(ctx, F); }
    },
    scenes: { chart: drawer("chart"), object: drawer("object"), people: drawer("people"), process: drawer("process"), compare: drawer("compare") },
  };
});
