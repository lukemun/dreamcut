// Manuscript: a page of an illuminated book. Warm vellum with mottling, follicle grain and drypoint
// ruling; a gilded bar border with ivy sprays and pen-flourished bezants; a small dragon drollery in
// the corner, a heron fishing in the bas-de-page and a moth in the margin. Each headline opens on a
// painted, gilded initial. Scenes are miniatures in gouache and gold leaf (castle towers, a painted
// device with manicules, robed figures under banderoles, a triptych, a balance) and the page turns
// between them. All motifs are original. Frames are pure functions of time.
window.DreamcutMotion.register("manuscript", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const inout = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const c = 1.6; return 1 + (c + 1) * Math.pow(v - 1, 3) + c * Math.pow(v - 1, 2); };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const frac = (v) => v - Math.floor(v);
  const DISPLAY = "Luminari, 'Old English Text MT', Trattatello, 'Apple Chancery', 'Palatino Linotype', Palatino, serif";
  const BODY = "'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif";
  const HEAD = { title: "title", chart: "chart-title", object: "object-title", people: "people-title", process: "process-title", compare: "compare-title", closing: "closing" };

  // ---- colour ----------------------------------------------------------------------------------------
  const rgbOf = (hex) => { const n = parseInt(String(hex).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const hex = (r, g, b) => "#" + ((1 << 24) + (Math.round(clamp(r, 0, 255)) << 16) + (Math.round(clamp(g, 0, 255)) << 8) + Math.round(clamp(b, 0, 255))).toString(16).slice(1);
  const mix = (a, b, k) => { const A = rgbOf(a), B = rgbOf(b); return hex(lerp(A[0], B[0], k), lerp(A[1], B[1], k), lerp(A[2], B[2], k)); };
  const rgba = (h, a) => hexA(h, a);

  // ---- path helpers ----------------------------------------------------------------------------------
  function rr(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  // Gouache: a flat body of colour with a darker, slightly uneven edge where the paint pooled.
  function wash(g, F, color, k = 1) {
    if (k <= 0) return;
    g.save(); g.globalAlpha *= clamp(k); g.fillStyle = color; g.fill();
    g.clip(); g.strokeStyle = mix(color, F.T.ink, 0.3); g.lineWidth = 8 * F.u; g.globalAlpha *= 0.4; g.stroke(); g.restore();
  }
  // Iron-gall ink outline; with k < 1 it is drawn on along its length (L is the path's rough length).
  function inkLine(g, F, w = 2.4, k = 1, L = 0, color) {
    if (k <= 0) return;
    g.save(); g.strokeStyle = color || F.T.ink; g.lineWidth = w * F.u; g.lineCap = "round"; g.lineJoin = "round";
    if (k < 1 && L > 0) { g.setLineDash([L * k, L * 2]); }
    g.stroke(); g.restore();
  }
  // Burnished gold leaf: a warm gradient with a glint that travels across it, timed by position.
  function gild(g, F, x, y, w, h, k = 1) {
    if (k <= 0) return;
    const T = F.T, u = F.u;
    g.save(); g.globalAlpha *= clamp(k);
    const gr = g.createLinearGradient(x, y, x + w * 0.7, y + h);
    gr.addColorStop(0, T.goldLo); gr.addColorStop(0.28, T.gold); gr.addColorStop(0.5, T.goldHi); gr.addColorStop(0.72, T.gold); gr.addColorStop(1, T.goldLo);
    g.fillStyle = gr; g.fill();
    g.clip();
    const ph = frac(F.t * 0.21 + (x * 0.6 + y) / (F.W * 1.9));
    const span2 = Math.max(w, h) * 1.6 + 120 * u, gx = x - 60 * u + ph * span2 * 1.6 - span2 * 0.3;
    const band = g.createLinearGradient(gx - 46 * u, y, gx + 46 * u, y + 30 * u);
    band.addColorStop(0, "rgba(255,248,210,0)"); band.addColorStop(0.5, `rgba(255,250,222,${T.glint})`); band.addColorStop(1, "rgba(255,248,210,0)");
    g.fillStyle = band; g.fillRect(x - 10, y - 10, w + 20, h + 20);
    g.restore();
  }
  // A four-point sparkle that blooms now and then on gold.
  function twinkle(g, F, x, y, seed, size = 14) {
    const a = Math.pow(Math.max(0, Math.sin(F.t * 1.3 + seed * 7.1)), 14);
    if (a < 0.02) return;
    const s = size * F.u * (0.6 + a * 0.6);
    g.save(); g.globalAlpha *= a * F.S.look.texture; g.fillStyle = "#fffbe8";
    g.beginPath(); g.moveTo(x, y - s); g.quadraticCurveTo(x, y, x + s, y); g.quadraticCurveTo(x, y, x, y + s); g.quadraticCurveTo(x, y, x - s, y); g.quadraticCurveTo(x, y, x, y - s); g.fill();
    g.restore();
  }

  // ---- lettering -------------------------------------------------------------------------------------
  function fontOf(size, kind = "body", weight) { return kind === "display" ? `400 ${size}px ${DISPLAY}` : `${weight || 600} ${size}px ${BODY}`; }
  function measure(g, s, size, kind, weight) { g.font = fontOf(size, kind, weight); return g.measureText(String(s ?? "")).width; }
  // Text written on left to right as q runs (a scribe's hand), never an empty label.
  function say(g, F, s, x, y, size, o = {}) {
    s = String(s ?? "");
    if (!s) return 0;
    const kind = o.kind || "body";
    let w = measure(g, s, size, kind, o.weight);
    if (o.maxW && w > o.maxW) { size = Math.max(o.min || size * 0.7, (size * o.maxW) / w); w = measure(g, s, size, kind, o.weight); }
    const q = o.q ?? 1;
    if (q <= 0) return w;
    const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    g.save();
    // The first letter is down the moment the pen touches, so a label never shows as an empty slot.
    if (q < 1) { const lead = measure(g, s.slice(0, 2), size, kind, o.weight) + size * 0.3; g.beginPath(); g.rect(x0 - size * 0.3, y - size * 2, lead + Math.max(0, w + size * 0.3 - lead) * q, size * 4); g.clip(); }
    g.font = fontOf(size, kind, o.weight); g.textAlign = "left"; g.textBaseline = o.base || "alphabetic";
    if (o.halo) { g.lineWidth = o.halo * F.u; g.strokeStyle = F.T.haloC; g.lineJoin = "round"; g.strokeText(s, x0, y); }
    g.fillStyle = o.color || F.T.text; g.fillText(s, x0, y);
    g.restore();
    return w;
  }
  function wrap(g, s, size, maxW, kind = "body", weight) {
    const words = String(s ?? "").split(/\s+/).filter(Boolean), lines = [];
    let cur = "";
    for (const wd of words) { const next = cur ? cur + " " + wd : wd; if (cur && measure(g, next, size, kind, weight) > maxW) { lines.push(cur); cur = wd; } else cur = next; }
    if (cur) lines.push(cur);
    return lines;
  }
  const fmtTally = (target, k, d) => { const dec = Math.abs((Number(target) || 0) % 1) > 0.001 ? 1 : 0; return window.DreamcutMotion.formatNumber((Number(target) || 0) * k, dec, (d && d.prefix) || "", (d && d.suffix) || ""); };

  // ---- small motifs ----------------------------------------------------------------------------------
  // An ivy leaf: three pointed lobes, painted or gilded, with a lead-white vein.
  function ivy(g, F, x, y, ang, s, color, gilded, k = 1) {
    if (k <= 0) return;
    const u = F.u, L = s * u * ease(k);
    g.save(); g.translate(x, y); g.rotate(ang);
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(L * 0.1, -L * 0.42, L * 0.3, -L * 0.62, L * 0.42, -L * 0.62);
    g.bezierCurveTo(L * 0.5, -L * 0.36, L * 0.56, -L * 0.3, L * 0.62, -L * 0.24);
    g.bezierCurveTo(L * 0.8, -L * 0.3, L * 0.98, -L * 0.12, L * 1.08, 0);
    g.bezierCurveTo(L * 0.98, L * 0.12, L * 0.8, L * 0.3, L * 0.62, L * 0.24);
    g.bezierCurveTo(L * 0.56, L * 0.3, L * 0.5, L * 0.36, L * 0.42, L * 0.62);
    g.bezierCurveTo(L * 0.3, L * 0.62, L * 0.1, L * 0.42, 0, 0);
    g.closePath();
    if (gilded) gild(g, F, -L * 0.1, -L * 0.7, L * 1.2, L * 1.4); else wash(g, F, color);
    inkLine(g, F, 1.4);
    if (!gilded) { g.beginPath(); g.moveTo(L * 0.12, 0); g.lineTo(L * 0.8, 0); g.strokeStyle = rgba(F.T.lead, 0.75); g.lineWidth = 1.3 * u; g.stroke(); }
    g.restore();
  }
  // A gold bezant with hairline pen sprays.
  function bezant(g, F, x, y, r, seed, k = 1) {
    if (k <= 0) return;
    const u = F.u, R = r * u * ease(k);
    g.save();
    g.strokeStyle = rgba(F.T.ink, 0.75); g.lineWidth = 1 * u; g.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      const a = seed * 2.3 + i * 2.1, l = R * (2.6 + (i % 2));
      g.beginPath(); g.moveTo(x + Math.cos(a) * R, y + Math.sin(a) * R);
      g.quadraticCurveTo(x + Math.cos(a + 0.5) * l, y + Math.sin(a + 0.5) * l, x + Math.cos(a + 0.2) * l * 1.25, y + Math.sin(a + 0.2) * l * 1.25);
      g.stroke();
      g.beginPath(); g.arc(x + Math.cos(a + 0.2) * l * 1.25, y + Math.sin(a + 0.2) * l * 1.25, 1.4 * u, 0, TAU); g.fillStyle = rgba(F.T.ink, 0.7); g.fill();
    }
    g.beginPath(); g.arc(x, y, R, 0, TAU);
    gild(g, F, x - R, y - R, R * 2, R * 2);
    inkLine(g, F, 1.3);
    g.restore();
  }
  // A manicule: a pointing hand with a cuff, tip at the origin, pointing toward -x.
  function manicule(g, F, x, y, s, cuff, k = 1) {
    if (k <= 0) return;
    const T = F.T;
    g.save(); g.translate(x, y); g.scale(s * F.u, s * F.u); g.globalAlpha *= clamp(k * 2);
    const flesh = T.flesh;
    // Sleeve and cuff.
    g.beginPath(); g.moveTo(50, -9); g.lineTo(68, -12); g.lineTo(70, 20); g.lineTo(50, 17); g.closePath();
    g.fillStyle = cuff; g.fill(); g.strokeStyle = T.ink; g.lineWidth = 1.6; g.stroke();
    g.beginPath(); g.moveTo(46, -8); g.lineTo(53, -9); g.lineTo(53, 17); g.lineTo(46, 16); g.closePath();
    g.fillStyle = T.lead; g.fill(); g.stroke();
    // Fist with curled fingers.
    g.beginPath(); g.moveTo(46, -6); g.bezierCurveTo(38, -9, 30, -6, 26, -4); g.lineTo(26, 3);
    g.bezierCurveTo(24, 8, 26, 15, 34, 15); g.lineTo(46, 15); g.closePath();
    g.fillStyle = flesh; g.fill(); g.stroke();
    // Index finger.
    g.beginPath(); g.moveTo(28, -4); g.lineTo(3, -3.5); g.quadraticCurveTo(-1, 0, 3, 3); g.lineTo(27, 3); g.fillStyle = flesh; g.fill(); g.stroke();
    // Knuckle lines and thumb.
    g.beginPath(); g.moveTo(28, 8); g.lineTo(38, 8); g.moveTo(29, 12); g.lineTo(38, 12); g.moveTo(31, -6); g.quadraticCurveTo(26, -11, 20, -8); g.stroke();
    g.restore();
  }
  // A scroll ribbon (banderole) with curled ends, fluttering; text is written on with it.
  function banderole(g, F, cx, cy, w, h, label, size, color, k, t, seed) {
    if (k <= 0) return;
    const u = F.u, T = F.T, open = ease(k), half = (w / 2) * open;
    const wave = (x) => Math.sin(t * 2.2 + seed + x / (70 * u)) * 5 * u;
    const N = 18;
    g.save();
    g.beginPath();
    for (let i = 0; i <= N; i++) { const x = cx - half + (2 * half * i) / N; i ? g.lineTo(x, cy - h / 2 + wave(x)) : g.moveTo(x, cy - h / 2 + wave(x)); }
    for (let i = N; i >= 0; i--) { const x = cx - half + (2 * half * i) / N; g.lineTo(x, cy + h / 2 + wave(x)); }
    g.closePath();
    g.fillStyle = T.lead; g.fill();
    g.save(); g.clip(); g.strokeStyle = rgba(T.vellumLo, 0.9); g.lineWidth = 7 * u; g.stroke(); g.restore();
    inkLine(g, F, 1.8);
    // Rolled ends.
    for (const sd of [-1, 1]) {
      const ex = cx + sd * half, ey = cy + wave(ex);
      g.beginPath(); g.ellipse(ex + sd * 6 * u, ey + h * 0.18, 10 * u, h * 0.55, 0, 0, TAU);
      g.fillStyle = mix(T.lead, T.vellumLo, 0.6); g.fill(); inkLine(g, F, 1.6);
      g.beginPath(); g.ellipse(ex + sd * 6 * u, ey + h * 0.18, 4 * u, h * 0.3, 0, 0, TAU); inkLine(g, F, 1.2);
    }
    g.beginPath(); g.rect(cx - half, cy - h, half * 2, h * 2); g.clip();
    say(g, F, label, cx, cy + wave(cx) + size * 0.34, size, { align: "center", color, maxW: w - 50 * u, min: 42 * u, q: span(k, 0.02, 0.6), weight: 600 });
    g.restore();
  }

  // ---- the vellum ------------------------------------------------------------------------------------
  let skin = null, skinKey = "";
  function buildSkin(F) {
    const { W, H, u, T, tall } = F;
    const make = () => { const c = document.createElement("canvas"); c.width = W; c.height = H; return c; };
    const tex = make(), v = tex.getContext("2d"), r = rng(1013);
    for (let i = 0; i < 80; i++) {
      const x = r() * W, y = r() * H, rad = (80 + r() * 420) * u, dark = r() < 0.65;
      const gr = v.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, dark ? `rgba(${T.mott},${0.04 + r() * 0.08})` : `rgba(255,252,240,${0.05 + r() * 0.08})`); gr.addColorStop(1, "rgba(0,0,0,0)");
      v.fillStyle = gr; v.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < 3; i++) { // old tide-marks
      const x = r() * W, y = r() * H, rad = (60 + r() * 140) * u;
      v.beginPath(); v.ellipse(x, y, rad, rad * (0.7 + r() * 0.3), r() * 3, 0, TAU); v.strokeStyle = `rgba(${T.mott},0.09)`; v.lineWidth = 3 * u; v.stroke();
    }
    for (let i = 0; i < 2600; i++) { // follicle grain
      v.fillStyle = `rgba(${T.mott},${0.06 + r() * 0.2})`;
      const s = (0.5 + r() * 1.7) * u; v.fillRect(r() * W, r() * H, s, s);
    }
    v.lineWidth = 0.8 * u;
    for (let i = 0; i < 320; i++) { // fibres
      const x = r() * W, y = r() * H, a = r() * TAU, l = (10 + r() * 40) * u;
      v.beginPath(); v.moveTo(x, y); v.quadraticCurveTo(x + Math.cos(a + 0.4) * l * 0.5, y + Math.sin(a + 0.4) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
      v.strokeStyle = `rgba(${T.mott},${0.05 + r() * 0.08})`; v.stroke();
    }
    // Foxing: small rust freckles, a few with a darker core.
    for (let i = 0; i < 46; i++) {
      const x = r() * W, y = r() * H, rad = (2 + r() * 9) * u;
      const gr = v.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(150,82,30,${0.12 + r() * 0.16})`); gr.addColorStop(1, "rgba(150,82,30,0)");
      v.fillStyle = gr; v.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // Show-through: the verso's script ghosts back to front through the skin, mirrored and very faint.
    {
      const M0 = marginOf(F), lh = 54 * u, xh = 15 * u;
      v.save(); v.strokeStyle = `rgba(${T.mott},0.05)`; v.lineWidth = 2 * u; v.lineCap = "round";
      for (let y = M0.top + 40 * u + lh * 0.72; y < M0.bottom - 30 * u; y += lh) {
        let x = M0.inR - 20 * u - r() * 30 * u;
        const stop = M0.inL + 20 * u + (r() < 0.15 ? r() * W * 0.4 : 0);
        v.beginPath();
        while (x > stop) {
          const n = 2 + Math.floor(r() * 7);
          for (let k = 0; k < n && x > stop; k++) { // minims and bowls, written right to left (mirrored)
            const tall2 = r() < 0.18 ? xh * 1.9 : xh;
            v.moveTo(x, y); v.lineTo(x - 2 * u, y - tall2);
            if (r() < 0.5) { v.moveTo(x - 2 * u, y - xh); v.quadraticCurveTo(x - 9 * u, y - xh * 1.2, x - 10 * u, y); }
            x -= 10 * u + r() * 4 * u;
          }
          x -= 16 * u + r() * 10 * u;
        }
        v.stroke();
      }
      v.restore();
    }
    // Drypoint ruling across the text block, double bounding lines and prickings in the outer margin.
    const rules = make(), q = rules.getContext("2d"), M = marginOf(F);
    q.strokeStyle = `rgba(${T.rule},0.13)`; q.lineWidth = 1 * u;
    q.beginPath();
    for (let y = M.top + 40 * u; y < M.bottom - 20 * u; y += 54 * u) { q.moveTo(M.inL, y); q.lineTo(M.inR, y); }
    for (const x of [M.inL, M.inL + 10 * u, M.inR - 10 * u, M.inR]) { q.moveTo(x, M.top); q.lineTo(x, M.bottom); }
    q.stroke();
    q.fillStyle = `rgba(${T.rule},0.3)`;
    for (let y = M.top + 40 * u; y < M.bottom - 20 * u; y += 54 * u) { q.beginPath(); q.arc(W - (tall ? 14 : 18) * u, y, 1.6 * u, 0, TAU); q.fill(); }
    return { tex, rules };
  }
  function marginOf(F) {
    const { W, H, u, tall } = F, side = (tall ? 90 : 140) * u;
    return { barX: (tall ? 26 : 42) * u, barW: (tall ? 14 : 17) * u, top: (tall ? 40 : 34) * u, bottom: H - (tall ? 40 : 34) * u,
      right: W - (tall ? 36 : 52) * u, inL: side - 34 * u, inR: W - side + 34 * u, side };
  }
  function vellum(ctx, F) {
    const { W, H, u, T, S } = F, tex = S.look.texture;
    const key = `${W}x${H}:${T.vellum}`;
    if (!skin || skinKey !== key) { skin = buildSkin(F); skinKey = key; }
    const gr = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.6);
    gr.addColorStop(0, T.vellumHi); gr.addColorStop(0.6, T.vellum); gr.addColorStop(1, T.vellumLo);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalAlpha = tex; ctx.drawImage(skin.tex, 0, 0); ctx.restore();
    ctx.drawImage(skin.rules, 0, 0);
    // The spine side darkens into the gutter; the fore-edge shows the stack of leaves.
    const sp = ctx.createLinearGradient(0, 0, 90 * u, 0);
    sp.addColorStop(0, `rgba(${T.shade},${0.3 * (0.5 + tex * 0.5)})`); sp.addColorStop(1, `rgba(${T.shade},0)`);
    ctx.fillStyle = sp; ctx.fillRect(0, 0, 90 * u, H);
    ctx.strokeStyle = `rgba(${T.shade},0.18)`; ctx.lineWidth = 1 * u;
    ctx.beginPath(); for (let i = 1; i < 5; i++) { ctx.moveTo(W - i * 2.2 * u, 0); ctx.lineTo(W - i * 2.2 * u, H); } ctx.stroke();
  }

  // ---- the border ------------------------------------------------------------------------------------
  // A vine stem along a line with a gentle wave; returns sample points for leaves.
  function vineStem(g, F, x1, y1, x2, y2, amp, phase) {
    const { u } = F, L = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / L, uy = (y2 - y1) / L, nx = -uy, ny = ux;
    const pts = [], N = Math.max(8, Math.round(L / (8 * u)));
    for (let i = 0; i <= N; i++) {
      const s = (L * i) / N, w = Math.sin(s / (64 * u) + phase) * amp * u;
      pts.push([x1 + ux * s + nx * w, y1 + uy * s + ny * w, s, Math.cos(s / (64 * u) + phase)]);
    }
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    inkLine(g, F, 2.2, 1, 0, mix(F.T.ink, F.T.verd, 0.25));
    return { pts, nx, ny, L };
  }
  function vineLeaves(g, F, V, step, seed, base) {
    const { u, t, T } = F, cols = [T.azure, T.verd, T.rubric, null];
    let n = 0;
    for (let s = step * 0.6; s < V.L - step * 0.3; s += step, n++) {
      const pt = V.pts[Math.min(V.pts.length - 1, Math.round((s / V.L) * (V.pts.length - 1)))], sd = n % 2 ? 1 : -1;
      const sway = Math.sin(t * 1.4 + n * 1.7 + seed) * 0.16;
      const ang = Math.atan2(V.ny * sd, V.nx * sd) + sway + (n % 3 - 1) * 0.35;
      // A short tendril, then a leaf or a bezant at its end.
      const tx = pt[0] + Math.cos(ang) * 16 * u, ty = pt[1] + Math.sin(ang) * 16 * u;
      g.beginPath(); g.moveTo(pt[0], pt[1]); g.quadraticCurveTo(pt[0] + Math.cos(ang - 0.6) * 12 * u, pt[1] + Math.sin(ang - 0.6) * 12 * u, tx, ty);
      inkLine(g, F, 1.2, 1, 0, rgba(T.ink, 0.8));
      const kind = (n + base) % 5;
      if (kind === 2) bezant(g, F, tx + Math.cos(ang) * 6 * u, ty + Math.sin(ang) * 6 * u, 6.5, n + seed);
      else ivy(g, F, tx, ty, ang, 30, cols[(n + base) % 4], cols[(n + base) % 4] === null);
      if (kind === 2) twinkle(g, F, tx + Math.cos(ang) * 6 * u, ty + Math.sin(ang) * 6 * u, n + seed * 3, 12);
      // Tiny pen curls between leaves.
      if (n % 2 === 0) {
        const cx = pt[0] - V.nx * sd * 12 * u, cy = pt[1] - V.ny * sd * 12 * u;
        g.beginPath(); g.arc(cx, cy, 5 * u, 0, Math.PI * 1.5); inkLine(g, F, 1, 1, 0, rgba(T.ink, 0.6));
      }
    }
  }
  function bar(g, F, M) {
    const { u, T } = F, x = M.barX, w = M.barW, y0 = M.top + 26 * u, y1 = M.bottom - 26 * u;
    g.beginPath(); g.rect(x, y0, w, y1 - y0); gild(g, F, x, y0, w, y1 - y0); inkLine(g, F, 1.6);
    const seg = 128 * u, n = Math.max(2, Math.round((y1 - y0) / seg)), sl = (y1 - y0) / n;
    for (let i = 0; i < n; i++) {
      const sy = y0 + i * sl + 14 * u, sh = sl - 28 * u, col = i % 2 ? T.rose : T.azure;
      g.beginPath(); g.rect(x + 3 * u, sy, w - 6 * u, sh); wash(g, F, col); inkLine(g, F, 1.2);
      // Lead-white filigree down the panel.
      g.beginPath();
      for (let k = 0; k <= 24; k++) { const yy = sy + 6 * u + ((sh - 12 * u) * k) / 24, xx = x + w / 2 + Math.sin(k * 1.3) * (w * 0.22); k ? g.lineTo(xx, yy) : g.moveTo(xx, yy); }
      g.strokeStyle = rgba(T.lead, 0.85); g.lineWidth = 1.2 * u; g.stroke();
      // A knot between panels.
      const ky = y0 + i * sl;
      if (i > 0) { g.beginPath(); g.arc(x + w / 2, ky, w * 0.42, 0, TAU); g.fillStyle = T.rubric; g.fill(); inkLine(g, F, 1.2); twinkle(g, F, x + w / 2, ky, i * 3.3, 10); }
    }
    // Quatrefoil terminals.
    for (const [yy, s] of [[M.top + 10 * u, 0], [M.bottom - 10 * u, 1]]) {
      const cx = x + w / 2, r = w * 0.7;
      g.beginPath();
      for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2; g.moveTo(cx + Math.cos(a) * r * 1.4 + r, yy + Math.sin(a) * r * 1.4); g.arc(cx + Math.cos(a) * r * 1.0, yy + Math.sin(a) * r * 1.0, r, 0, TAU); }
      gild(g, F, cx - r * 2.5, yy - r * 2.5, r * 5, r * 5); inkLine(g, F, 1.4);
      g.beginPath(); g.arc(cx, yy, r * 0.75, 0, TAU); g.fillStyle = s ? T.rubric : T.azure; g.fill(); inkLine(g, F, 1.2);
    }
  }
  function border(g, F) {
    const M = marginOf(F), { W, H, u, t } = F;
    const sway = Math.sin(t * 0.6) * 0.4;
    const top = vineStem(g, F, M.barX + M.barW + 16 * u, M.top + 10 * u, W - 70 * u, M.top + 10 * u, 6, 0.3 + sway);
    const bot = vineStem(g, F, M.barX + M.barW + 16 * u, M.bottom - 10 * u, W - 70 * u, M.bottom - 10 * u, 6, 1.4 - sway);
    const rgt = vineStem(g, F, M.right, M.top + 60 * u, M.right, M.bottom - 200 * u, 7, 2.1 + sway);
    vineLeaves(g, F, top, 92 * u, 1, 0);
    vineLeaves(g, F, bot, 92 * u, 2, 2);
    vineLeaves(g, F, rgt, 110 * u, 3, 1);
    bar(g, F, M);
    // Corner bosses at the far ends of the vines.
    for (const [x, y] of [[W - 62 * u, M.top + 10 * u], [W - 62 * u, M.bottom - 10 * u]]) { bezant(g, F, x, y, 10, x + y); twinkle(g, F, x, y, y, 16); }
    void H;
  }

  // ---- marginalia ------------------------------------------------------------------------------------
  // A small green dragon curled on the corner boss, wing slowly beating, head bobbing.
  function dragon(g, F) {
    const { u, t, T, tall } = F, M = marginOf(F);
    const x = M.barX + M.barW * 0.5 + (tall ? 42 : 50) * u, y = M.top + (tall ? 62 : 44) * u, s = u * (tall ? 1.05 : 1.0);
    g.save(); g.translate(x, y); g.scale(s, s);
    const bob = Math.sin(t * 1.6) * 0.08, flap = Math.sin(t * 2.4);
    // Tail curling down along the bar.
    g.beginPath(); g.moveTo(-6, 18); g.bezierCurveTo(-30, 40, -58, 30, -54, 70); g.bezierCurveTo(-52, 92, -40, 96, -44, 112);
    g.strokeStyle = T.ink; g.lineWidth = 9; g.lineCap = "round"; g.stroke(); g.strokeStyle = T.verd; g.lineWidth = 6; g.stroke();
    g.beginPath(); g.moveTo(-44, 112); g.lineTo(-52, 124); g.lineTo(-38, 120); g.closePath(); g.fillStyle = T.rubric; g.fill(); g.lineWidth = 1.4; g.strokeStyle = T.ink; g.stroke();
    // Wing behind the body.
    g.save(); g.translate(4, -4); g.rotate(-0.5 + flap * 0.25);
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(10, -42, 34, -50); g.quadraticCurveTo(30, -34, 40, -28); g.quadraticCurveTo(26, -22, 32, -10); g.quadraticCurveTo(16, -10, 0, 0); g.closePath();
    g.fillStyle = T.rubric; g.fill(); g.lineWidth = 1.6; g.strokeStyle = T.ink; g.stroke();
    g.beginPath(); g.moveTo(2, -2); g.lineTo(32, -46); g.moveTo(3, -3); g.lineTo(38, -28); g.moveTo(3, -2); g.lineTo(30, -11); g.lineWidth = 1; g.stroke();
    g.restore();
    // Body.
    g.beginPath(); g.moveTo(-14, 20); g.bezierCurveTo(-22, 0, -8, -16, 10, -12); g.bezierCurveTo(26, -8, 26, 14, 14, 22); g.closePath();
    g.fillStyle = T.verd; g.fill(); g.lineWidth = 1.8; g.strokeStyle = T.ink; g.stroke();
    g.beginPath(); g.moveTo(-6, 18); g.bezierCurveTo(-8, 6, 0, -2, 10, 0); g.strokeStyle = rgba(T.lead, 0.8); g.lineWidth = 1.4; g.stroke();
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-8 + i * 5, 10 + i * 2); g.lineTo(-4 + i * 5, 6 + i * 2); g.strokeStyle = T.ink; g.lineWidth = 0.9; g.stroke(); }
    // Legs gripping the boss.
    g.strokeStyle = T.ink; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(-6, 20); g.lineTo(-10, 30); g.lineTo(-4, 31); g.moveTo(10, 20); g.lineTo(12, 30); g.lineTo(18, 30); g.stroke();
    // Neck and head.
    g.save(); g.translate(16, -6); g.rotate(-0.3 + bob);
    g.beginPath(); g.moveTo(-4, 6); g.bezierCurveTo(6, -6, 4, -18, 14, -24); g.lineTo(20, -18); g.bezierCurveTo(12, -12, 14, 0, 6, 10); g.closePath();
    g.fillStyle = T.verd; g.fill(); g.lineWidth = 1.6; g.strokeStyle = T.ink; g.stroke();
    g.beginPath(); g.moveTo(10, -26); g.quadraticCurveTo(24, -34, 36, -26); g.lineTo(38, -20); g.quadraticCurveTo(26, -16, 18, -16); g.closePath();
    g.fillStyle = T.verd; g.fill(); g.stroke();
    g.beginPath(); g.moveTo(14, -28); g.lineTo(8, -40); g.lineTo(20, -30); g.fillStyle = T.gold; g.fill(); g.stroke();
    const blink = frac(t / 3.7) > 0.95 ? 0.2 : 1;
    g.beginPath(); g.ellipse(24, -26, 2.4, 2.4 * blink, 0, 0, TAU); g.fillStyle = T.ink; g.fill();
    // A curl of breath every few seconds.
    const br = frac(t / 4.2);
    if (br < 0.45) {
      const k = br / 0.45;
      g.globalAlpha *= Math.sin(k * Math.PI);
      g.beginPath(); g.arc(46 + k * 18, -22 - k * 8, 3 + k * 5, Math.PI, Math.PI * 2.6); g.strokeStyle = T.rubric; g.lineWidth = 1.4; g.stroke();
      g.beginPath(); g.arc(52 + k * 26, -16 - k * 14, 2 + k * 3, Math.PI, Math.PI * 2.6); g.stroke();
    }
    g.restore();
    g.restore();
  }
  // A heron fishing in a small pool in the bas-de-page; every few seconds it strikes.
  function heron(g, F) {
    const { u, t, T, W, tall } = F, M = marginOf(F);
    const fx = W - (tall ? 64 : 90) * u, fy = M.bottom - 14 * u, s = u * (tall ? 0.78 : 0.92);
    g.save(); g.translate(fx, fy); g.scale(s, s);
    // Pool with ripples spreading.
    g.beginPath(); g.ellipse(0, 6, 62, 11, 0, 0, TAU); g.fillStyle = mix(T.azure, T.lead, 0.35); g.fill(); g.strokeStyle = T.ink; g.lineWidth = 1.4; g.stroke();
    const cyc = frac(t / 5.6), strike = span(cyc, 0.62, 0.72) * (1 - span(cyc, 0.78, 0.9));
    for (let i = 0; i < 3; i++) {
      const k = frac(t * 0.45 + i / 3);
      g.beginPath(); g.ellipse(-24, 6, 6 + k * 34, 1.5 + k * 5, 0, 0, TAU); g.strokeStyle = rgba(T.lead, 0.8 * (1 - k)); g.lineWidth = 1.2; g.stroke();
    }
    // Reeds.
    g.strokeStyle = T.verd; g.lineWidth = 2.2;
    for (let i = 0; i < 4; i++) { const rx = 30 + i * 7, sw = Math.sin(t * 1.2 + i) * 4; g.beginPath(); g.moveTo(rx, 4); g.quadraticCurveTo(rx + 2, -30, rx + sw, -54 - i * 6); g.stroke(); }
    g.fillStyle = T.ochre;
    for (let i = 0; i < 2; i++) { const rx = 37 + i * 14, sw = Math.sin(t * 1.2 + 1 + i * 2) * 4; g.beginPath(); g.ellipse(rx + sw, -60 - i * 12, 3, 9, 0, 0, TAU); g.fill(); g.lineWidth = 1; g.strokeStyle = T.ink; g.stroke(); }
    // Legs.
    g.strokeStyle = T.ink; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-6, 4); g.lineTo(-4, -26); g.lineTo(-2, -50); g.moveTo(8, 4); g.lineTo(6, -28); g.lineTo(2, -50); g.stroke();
    // Body.
    g.beginPath(); g.moveTo(-22, -64); g.bezierCurveTo(-10, -82, 22, -82, 30, -70); g.bezierCurveTo(36, -60, 24, -46, 4, -46); g.bezierCurveTo(-14, -46, -26, -52, -22, -64); g.closePath();
    g.fillStyle = T.lead; g.fill(); g.lineWidth = 1.8; g.stroke();
    g.beginPath(); g.moveTo(-2, -76); g.bezierCurveTo(14, -78, 28, -70, 34, -54); g.lineTo(26, -52); g.bezierCurveTo(18, -60, 6, -64, -2, -64); g.closePath();
    g.fillStyle = mix(T.azure, T.lead, 0.45); g.fill(); g.stroke();
    // Neck and head: idle bob, then a strike down to the water.
    const bob = Math.sin(t * 1.3) * 3, k = ease(strike);
    const hx = lerp(-26, -34, k), hy = lerp(-108 + bob, -30, k);
    g.beginPath(); g.moveTo(-16, -70); g.bezierCurveTo(-36, -80, lerp(-6, -40, k), lerp(-100, -50, k), hx, hy);
    g.lineWidth = 9; g.strokeStyle = T.ink; g.stroke(); g.lineWidth = 6; g.strokeStyle = T.lead; g.stroke();
    g.save(); g.translate(hx, hy); g.rotate(lerp(Math.PI, Math.PI * 0.62, k));
    g.beginPath(); g.ellipse(0, 0, 9, 7, 0, 0, TAU); g.fillStyle = T.lead; g.fill(); g.lineWidth = 1.6; g.strokeStyle = T.ink; g.stroke();
    g.beginPath(); g.moveTo(6, -3); g.lineTo(34, 0); g.lineTo(6, 3); g.closePath(); g.fillStyle = T.ochre; g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-6, -4); g.quadraticCurveTo(-18, -10, -24, -4); g.strokeStyle = T.ink; g.lineWidth = 1.4; g.stroke();
    g.beginPath(); g.arc(2, -2, 1.6, 0, TAU); g.fillStyle = T.ink; g.fill();
    g.restore();
    g.restore();
  }
  // A moth drifting up and down the outer margin.
  function moth(g, F) {
    const { u, t, T, W, H, tall } = F, M = marginOf(F);
    const x = M.right + Math.sin(t * 0.83) * (tall ? 14 : 22) * u - 8 * u, y = H * (0.36 + 0.16 * Math.sin(t * 0.33)) + Math.sin(t * 2.1) * 10 * u;
    const flap = 0.3 + 0.7 * Math.abs(Math.cos(t * 8.5)), tilt = Math.cos(t * 0.83) * 0.3;
    g.save(); g.translate(x, y); g.rotate(tilt); g.scale(u * (tall ? 0.85 : 1), u * (tall ? 0.85 : 1));
    for (const sd of [-1, 1]) {
      g.save(); g.scale(sd * flap, 1);
      g.beginPath(); g.moveTo(0, -2); g.bezierCurveTo(10, -24, 30, -22, 26, -6); g.bezierCurveTo(24, 2, 10, 2, 0, 0); g.closePath();
      g.fillStyle = T.azure; g.fill(); g.lineWidth = 1.3; g.strokeStyle = T.ink; g.stroke();
      g.beginPath(); g.moveTo(0, 2); g.bezierCurveTo(16, 4, 20, 20, 8, 20); g.bezierCurveTo(2, 18, 0, 10, 0, 2); g.closePath();
      g.fillStyle = T.gold; g.fill(); g.stroke();
      g.beginPath(); g.arc(16, -10, 3.4, 0, TAU); g.fillStyle = T.rubric; g.fill();
      g.restore();
    }
    g.beginPath(); g.ellipse(0, 4, 2.6, 11, 0, 0, TAU); g.fillStyle = T.ink; g.fill();
    g.beginPath(); g.moveTo(-1, -6); g.quadraticCurveTo(-6, -16, -9, -18); g.moveTo(1, -6); g.quadraticCurveTo(6, -16, 9, -18); g.strokeStyle = T.ink; g.lineWidth = 1; g.stroke();
    g.restore();
  }

  // ---- headline measurement and painted initials ------------------------------------------------------
  const rectCache = {};
  function rectsOf(id) {
    if (rectCache[id]) return rectCache[id];
    const el = document.getElementById(id), root = document.getElementById("root");
    if (!el || !root || !el.firstChild || !el.textContent) return (rectCache[id] = { lines: [], first: null });
    let ox = 0, oy = 0;
    for (let n = el; n && n !== root; n = n.offsetParent) { ox += n.offsetLeft; oy += n.offsetTop; }
    const scale = root.getBoundingClientRect().width / (Number(root.dataset.width) || 1920) || 1;
    const er = el.getBoundingClientRect(), range = document.createRange();
    const conv = (r) => ({ x: ox + (r.left - er.left) / scale, y: oy + (r.top - er.top) / scale, w: r.width / scale, h: r.height / scale });
    range.selectNodeContents(el);
    const lines = [];
    for (const r of range.getClientRects()) { const L = conv(r); if (L.w > 1 && !lines.some((o) => Math.abs(o.y - L.y) < 4)) lines.push(L); }
    let first = null;
    const node = el.firstChild;
    if (node.nodeType === 3 && node.textContent.length) { const r2 = document.createRange(); r2.setStart(node, 0); r2.setEnd(node, 1); const rc = r2.getClientRects()[0]; if (rc) first = conv(rc); }
    return (rectCache[id] = { lines, first, ch: el.textContent.trim().charAt(0) });
  }
  // The historiated initial: gold-leaf ground, a painted letter with lead-white filigree, foliage in the
  // counters, a sprig reaching back to the bar and pen cadels into the margin.
  function initial(g, F, id, k) {
    if (k <= 0) return;
    const R = rectsOf(id);
    if (!R.first) return;
    const { u, T, t } = F, M = marginOf(F);
    let side = Math.min(R.first.h * 1.0, R.first.w * 1.5 + 30 * u);
    // A drop cap (statement pages) stops short of the third line; an inline initial stops short of the second.
    const drop = (document.getElementById(id) || {}).tagName === "H1";
    if (drop) side *= 0.9;
    else { const nextLine = R.lines.filter((l) => l.y > R.first.y + R.first.h * 0.5).sort((p1, p2) => p1.y - p2.y)[0]; if (nextLine) side = Math.min(side, nextLine.y - R.first.y - 2 * u); }
    const cx = R.first.x + R.first.w / 2, cy = drop ? R.first.y + side * 0.52 : R.first.y + R.first.h - side / 2 + R.first.h * 0.04;
    const x0 = cx - side / 2, y0 = cy - side / 2, k1 = ease(span(k, 0, 0.4)), k2 = span(k, 0.25, 0.7), k3 = span(k, 0.5, 1);
    // A sprig back to the bar.
    if (k3 > 0) {
      g.save();
      const sx = M.barX + M.barW, len = x0 - sx;
      g.beginPath(); g.moveTo(x0, cy + side * 0.2);
      g.bezierCurveTo(x0 - len * 0.35, cy + side * 0.5, x0 - len * 0.7, cy - side * 0.1, sx + 2 * u, cy + side * 0.12);
      inkLine(g, F, 2, k3, len * 1.4, mix(T.ink, T.verd, 0.25));
      if (len > 50 * u) { ivy(g, F, x0 - len * 0.45, cy + side * 0.32, 1.9 + Math.sin(t * 1.3) * 0.15, 22, T.verd, false, span(k3, 0.4, 1)); bezant(g, F, x0 - len * 0.72, cy + side * 0.02, 6, 3, span(k3, 0.6, 1)); }
      g.restore();
    }
    // Cadels: pen flourishes from the box corners.
    if (k3 > 0) {
      g.save(); g.strokeStyle = rgba(T.rubric, 0.85); g.lineWidth = 1.3 * u; g.lineCap = "round";
      g.setLineDash([side * 2.2 * k3, side * 4]);
      g.beginPath(); g.moveTo(x0, y0 + side); g.bezierCurveTo(x0 - side * 0.2, y0 + side * 1.35, x0 + side * 0.3, y0 + side * 1.5, x0 + side * 0.1, y0 + side * 1.2);
      g.bezierCurveTo(x0 - side * 0.05, y0 + side * 1.05, x0 + side * 0.5, y0 + side * 1.1, x0 + side * 0.8, y0 + side * 1.28);
      g.moveTo(x0 + side, y0); g.bezierCurveTo(x0 + side * 1.1, y0 - side * 0.3, x0 + side * 0.7, y0 - side * 0.45, x0 + side * 0.75, y0 - side * 0.2);
      g.stroke(); g.restore();
    }
    g.save();
    g.translate(cx, cy); g.scale(lerp(0.6, 1, k1), lerp(0.6, 1, k1)); g.translate(-cx, -cy);
    g.globalAlpha *= clamp(k1 * 1.5);
    // Shadow, gold ground and a rubric frame.
    g.beginPath(); g.rect(x0 + 5 * u, y0 + 6 * u, side, side); g.fillStyle = rgba(T.ink, 0.18); g.fill();
    g.beginPath(); g.rect(x0, y0, side, side); gild(g, F, x0, y0, side, side); inkLine(g, F, 2.2);
    g.beginPath(); g.rect(x0 + side * 0.07, y0 + side * 0.07, side * 0.86, side * 0.86); wash(g, F, T.azure, 1);
    // Diaper of lead-white dots and gold crosses on the azure.
    g.save(); g.beginPath(); g.rect(x0 + side * 0.07, y0 + side * 0.07, side * 0.86, side * 0.86); g.clip();
    const st = side / 7;
    for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) {
      const px = x0 + i * st + ((j % 2) * st) / 2, py = y0 + j * st * 0.9;
      g.fillStyle = rgba(T.lead, 0.55); g.beginPath(); g.arc(px, py, 1.6 * u, 0, TAU); g.fill();
    }
    // Foliage curling inside.
    g.strokeStyle = mix(T.verd, T.lead, 0.2); g.lineWidth = 2.4 * u;
    g.beginPath(); g.arc(x0 + side * 0.28, y0 + side * 0.72, side * 0.16, 0.3, Math.PI * 1.7); g.stroke();
    g.beginPath(); g.arc(x0 + side * 0.74, y0 + side * 0.3, side * 0.13, Math.PI, Math.PI * 2.8); g.stroke();
    ivy(g, F, x0 + side * 0.2, y0 + side * 0.86, -0.9 + Math.sin(t * 1.5) * 0.1, side * 0.22 / u, T.rose, false);
    ivy(g, F, x0 + side * 0.84, y0 + side * 0.2, 2.3 + Math.sin(t * 1.5 + 1) * 0.1, side * 0.2 / u, T.verd, false);
    g.restore();
    g.beginPath(); g.rect(x0 + side * 0.07, y0 + side * 0.07, side * 0.86, side * 0.86); inkLine(g, F, 1.6);
    // The letter: rose body, ink outline, lead-white filigree.
    if (k2 > 0) {
      const ch = R.ch || "A", size = side * 0.8;
      g.save(); g.globalAlpha *= k2;
      g.font = `400 ${size}px ${DISPLAY}`; g.textAlign = "center"; g.textBaseline = "middle";
      g.lineJoin = "round"; g.lineWidth = 7 * u; g.strokeStyle = T.ink; g.strokeText(ch, cx, cy + side * 0.05);
      g.lineWidth = 3.5 * u; g.strokeStyle = T.goldHi; g.strokeText(ch, cx, cy + side * 0.05);
      g.fillStyle = T.rose; g.fillText(ch, cx, cy + side * 0.05);
      // Lead-white filigree catching the light along the letter.
      g.save(); g.beginPath(); g.rect(cx - side, cy - side, side * 2, side * 0.95); g.clip();
      g.setLineDash([2.5 * u, 4 * u]); g.lineWidth = 1.4 * u; g.strokeStyle = rgba(T.lead, 0.9); g.strokeText(ch, cx - 2 * u, cy + side * 0.05 - 2 * u);
      g.restore();
      g.restore();
    }
    g.restore();
    twinkle(g, F, x0 + side * 0.94, y0 + side * 0.06, id.length, 18);
  }

  // ---- the plan ----------------------------------------------------------------------------------------
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  const DRAWN = { chart: 1, object: 1, people: 1, process: 1, compare: 1 };
  let planCache = null;
  function controls() {
    if (window.__dreamcut && window.__dreamcut.controls) return window.__dreamcut.controls;
    try { if (typeof dc !== "undefined" && dc && dc.controls) return dc.controls; } catch (e) { /* not on this page */ }
    return null;
  }
  function planOf() {
    if (planCache) return planCache.shown ? planCache : null;
    const c = controls();
    if (!c) { planCache = {}; return null; }
    let t = 0;
    const shown = [];
    for (const id of ORDER) { const hold = Number(c[`${id}_hold`]) || 0; if (hold > 0) shown.push({ id, start: t, hold }); t += hold; }
    planCache = shown.length ? { shown, change: Number(c.change) || 0.45 } : {};
    return planCache.shown ? planCache : null;
  }
  function neighbours(F, id) {
    const P = F.plan;
    if (!P) return { prev: null, next: F.info.next || null };
    const i = P.shown.findIndex((s) => s.id === id);
    return { prev: i > 0 ? P.shown[i - 1].id : null, next: i >= 0 && i < P.shown.length - 1 ? P.shown[i + 1].id : null };
  }
  // The page turn: an edge sweeps left to right from just before the cut to `change` after it. The
  // outgoing page shows right of the edge, the incoming page (already part-drawn) left of it.
  function sweepOf(F, id, L, hold) {
    const ch = Math.max(0.2, F.change), nb = neighbours(F, id), lead = ch * 0.25;
    const out = nb.next && L > hold - lead ? clamp((L - (hold - lead)) / (ch + lead)) : null;
    const inn = nb.prev && L < ch ? clamp((L + lead) / (ch + lead)) : null;
    return { out, inn, nb };
  }
  const edgeX = (F, s) => lerp(-0.14 * F.W, 1.16 * F.W, inout(s));
  function clipFor(g, F, sw) {
    if (sw.out !== null) { const x = edgeX(F, sw.out); g.beginPath(); g.rect(x, -10, F.W - x + 20, F.H + 20); g.clip(); }
    if (sw.inn !== null) { const x = edgeX(F, sw.inn) - 6 * F.u; g.beginPath(); g.rect(-10, -10, x + 10, F.H + 20); g.clip(); }
  }
  // The turning leaf itself: its underside as a curled band, with shadows on both pages.
  function leaf(g, F, s) {
    if (s <= 0 || s >= 1) return;
    const { W, H, u, T } = F, x = edgeX(F, s), cw = (150 + 90 * Math.sin(Math.PI * s)) * u;
    g.save();
    let gr = g.createLinearGradient(x, 0, x + 70 * u, 0);
    gr.addColorStop(0, `rgba(${T.shade},0.32)`); gr.addColorStop(1, `rgba(${T.shade},0)`);
    g.fillStyle = gr; g.fillRect(x, 0, 70 * u, H);
    gr = g.createLinearGradient(x - cw - 90 * u, 0, x - cw, 0);
    gr.addColorStop(0, `rgba(${T.shade},0)`); gr.addColorStop(1, `rgba(${T.shade},0.28)`);
    g.fillStyle = gr; g.fillRect(x - cw - 90 * u, 0, 90 * u, H);
    g.beginPath(); g.moveTo(x, -4);
    g.bezierCurveTo(x - cw * 0.4, H * 0.1, x - cw * 1.1, H * 0.2, x - cw, H * 0.5);
    g.bezierCurveTo(x - cw * 0.9, H * 0.8, x - cw * 0.3, H * 0.95, x, H + 4);
    g.closePath();
    gr = g.createLinearGradient(x - cw, 0, x, 0);
    gr.addColorStop(0, T.vellumLo); gr.addColorStop(0.45, T.vellumHi); gr.addColorStop(0.85, T.vellum); gr.addColorStop(1, mix(T.vellumLo, T.ink, 0.15));
    g.fillStyle = gr; g.fill();
    g.save(); g.clip(); g.globalAlpha = 0.5 * F.S.look.texture; g.drawImage(skin.tex, 0, 0); g.restore();
    g.strokeStyle = rgba(T.ink, 0.35); g.lineWidth = 1.4 * u; g.stroke();
    g.restore();
  }

  // ---- scene drawings ----------------------------------------------------------------------------------
  function areaOf(F, id) {
    const { W, H, u, tall } = F, M = marginOf(F), R = rectsOf(HEAD[id]);
    const bottomHead = R.lines.length ? Math.max(...R.lines.map((l) => l.y + l.h)) : H * 0.25;
    const top = bottomHead + (tall ? 70 : 46) * u;
    return { x: M.side, y: top, w: W - M.side * 2, h: H - (tall ? 150 : 100) * u - top };
  }

  // Chart: castle towers rise to their values; pennants fly; the highlighted tower is painted in the accent.
  function chart(g, F, a, q, d) {
    const { u, T, t, A } = F, n = d.values.length, max = Math.max(...d.values.map((v) => Math.abs(Number(v) || 0)), 1);
    const lab = 44 * u, num = 112 * u, base = a.y + a.h - lab * 1.55, topY = a.y + num * 0.9 + 26 * u;
    const kg = span(q, 0, 0.3);
    // Ground: a strip of meadow with tufts and flowers.
    g.save(); g.beginPath(); g.rect(a.x - 40 * u, base - 60 * u, (a.w + 80 * u) * ease(kg * 1.3), 120 * u); g.clip();
    g.beginPath(); g.moveTo(a.x - 30 * u, base + 30 * u);
    for (let x = a.x - 30 * u; x <= a.x + a.w + 30 * u; x += 20 * u) g.lineTo(x, base - 6 * u + Math.sin(x / (90 * u)) * 7 * u);
    g.lineTo(a.x + a.w + 30 * u, base + 30 * u); g.closePath();
    wash(g, F, T.verd); inkLine(g, F, 2);
    const r = rng(77);
    for (let x = a.x - 10 * u; x < a.x + a.w + 20 * u; x += 34 * u) {
      const y = base + 6 * u + r() * 14 * u, sw = Math.sin(t * 1.6 + x * 0.01) * 2 * u;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - 4 * u + sw, y - 10 * u); g.moveTo(x, y); g.lineTo(x + 4 * u + sw, y - 11 * u);
      g.strokeStyle = mix(T.verd, T.ink, 0.45); g.lineWidth = 1.4 * u; g.stroke();
      if (r() < 0.4) { g.beginPath(); g.arc(x + 12 * u, y - 4 * u, 3.2 * u, 0, TAU); g.fillStyle = r() < 0.5 ? T.lead : T.rubric; g.fill(); }
    }
    g.restore();
    g.beginPath(); g.moveTo(a.x, base + 32 * u); g.lineTo(a.x + (a.w) * ease(kg), base + 32 * u); inkLine(g, F, 2, 1, 0, T.rubric);
    // Birds crossing the sky between towers.
    for (let i = 0; i < 3; i++) {
      const bx = a.x + frac(t * 0.05 + i * 0.37) * a.w, by = a.y + a.h * (0.12 + i * 0.1) + Math.sin(t * 1.2 + i) * 8 * u, f = Math.sin(t * 7 + i * 2) * 5 * u;
      g.beginPath(); g.moveTo(bx - 12 * u, by - f); g.quadraticCurveTo(bx - 5 * u, by - 4 * u, bx, by); g.quadraticCurveTo(bx + 5 * u, by - 4 * u, bx + 12 * u, by - f);
      inkLine(g, F, 1.6, 1, 0, rgba(T.ink, 0.7));
    }
    const slot = a.w / n, bw = clamp(slot * 0.5, 90 * u, 230 * u);
    // A gilded sun with a face, over the lowest tower where the sky is free, with clouds drifting by.
    let lo = 0; d.values.forEach((v, i) => { if (Math.abs(Number(v) || 0) < Math.abs(Number(d.values[lo]) || 0)) lo = i; });
    const loTop = base - Math.max(70 * u, (base - topY) * (Math.abs(Number(d.values[lo]) || 0) / max)) - num * 1.2;
    const sr = Math.min(56 * u, (loTop - a.y) * 0.32);
    if (sr > 26 * u) {
      const sx = a.x + slot * (lo + 0.5) + (lo === n - 1 ? -bw * 0.3 : bw * 0.3), sy = a.y + sr * 1.5, ks = ease(span(q, 0.25, 0.6));
      g.save(); g.globalAlpha *= ks; g.translate(sx, sy); g.rotate(t * 0.25);
      g.beginPath(); for (let k = 0; k < 24; k++) { const aa = (k * TAU) / 24, r2 = k % 2 ? sr * 1.18 : sr * 1.55 + Math.sin(t * 2 + k) * 3 * u; g.lineTo(Math.cos(aa) * r2, Math.sin(aa) * r2); } g.closePath();
      gild(g, F, -sr * 1.6, -sr * 1.6, sr * 3.2, sr * 3.2); inkLine(g, F, 1.4);
      g.rotate(-t * 0.25);
      g.beginPath(); g.arc(0, 0, sr, 0, TAU); gild(g, F, -sr, -sr, sr * 2, sr * 2); inkLine(g, F, 1.8);
      const bl = frac(t / 3.3) > 0.95 ? 0.2 : 1;
      for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(sd * sr * 0.34, -sr * 0.12, sr * 0.08, sr * 0.08 * bl, 0, 0, TAU); g.fillStyle = T.ink; g.fill(); g.beginPath(); g.arc(sd * sr * 0.5, sr * 0.22, sr * 0.12, 0, TAU); g.fillStyle = rgba(T.rubric, 0.35); g.fill(); }
      g.beginPath(); g.arc(0, sr * 0.12, sr * 0.36, 0.5, Math.PI - 0.5); inkLine(g, F, 1.6);
      g.restore();
      for (let i = 0; i < 2; i++) {
        const cxx = sx - sr * 3 + frac(t * 0.035 + i * 0.5) * sr * 6, cyy = sy + sr * (i ? 0.9 : -0.3), cs = sr * 0.32;
        g.save(); g.globalAlpha *= ks * Math.sin(Math.PI * frac(t * 0.035 + i * 0.5));
        g.beginPath(); g.arc(cxx, cyy, cs, Math.PI * 0.9, Math.PI * 2.1); g.arc(cxx + cs * 1.4, cyy - cs * 0.35, cs * 1.25, Math.PI, Math.PI * 2.1); g.arc(cxx + cs * 2.9, cyy, cs, Math.PI * 1.1, Math.PI * 2.2); g.closePath();
        g.fillStyle = T.lead; g.fill(); inkLine(g, F, 1.4, 1, 0, T.azure);
        g.restore();
      }
    }
    for (let i = 0; i < n; i++) {
      const v = Number(d.values[i]) || 0, hot = i === d.highlight, ki = span(q, 0.08 + i * 0.1, 0.55 + i * 0.1), grow = ease(ki);
      if (ki <= 0) continue;
      const fullH = Math.max(70 * u, (base - topY) * (Math.abs(v) / max)), h = fullH * grow;
      const x = a.x + slot * (i + 0.5) - bw / 2, y = base - h, mh = 26 * u;
      const body = hot ? mix(A, T.lead, 0.12) : i % 2 ? T.stone : mix(T.stone, T.rose, 0.35);
      // Body with merlons.
      const nm = 4, mw = bw / (nm * 2 - 1);
      const outline = () => {
        g.beginPath(); g.moveTo(x, base); g.lineTo(x, y);
        for (let m = 0; m < nm; m++) { const mx = x + m * 2 * mw; g.lineTo(mx, y - mh); g.lineTo(mx + mw, y - mh); g.lineTo(mx + mw, y); if (m < nm - 1) g.lineTo(mx + 2 * mw, y); }
        g.lineTo(x + bw, base); g.closePath();
      };
      g.save(); g.beginPath(); g.rect(x - 20 * u, y - mh - 4 * u, bw + 40 * u, h + mh + 8 * u); g.clip();
      outline(); wash(g, F, body);
      // Masonry courses and a shaded flank.
      g.save(); outline(); g.clip();
      g.fillStyle = rgba(T.ink, 0.13); g.fillRect(x + bw * 0.74, y - mh, bw * 0.26, h + mh);
      g.strokeStyle = rgba(T.ink, 0.42); g.lineWidth = 1.1 * u; g.beginPath();
      let row = 0;
      for (let yy = base - 24 * u; yy > y - mh; yy -= 24 * u, row++) {
        g.moveTo(x, yy); g.lineTo(x + bw, yy);
        for (let xx = x + (row % 2 ? 18 : 36) * u; xx < x + bw; xx += 36 * u) { g.moveTo(xx, yy); g.lineTo(xx, yy + 24 * u); }
      }
      g.stroke();
      g.restore();
      outline(); inkLine(g, F, 2.4);
      // A gilded string course under the merlons.
      g.beginPath(); g.rect(x - 4 * u, y + 4 * u, bw + 8 * u, 12 * u); gild(g, F, x - 4 * u, y + 4 * u, bw + 8 * u, 12 * u); inkLine(g, F, 1.4);
      // Window and door.
      if (h > 140 * u) {
        const wx = x + bw / 2, wy = y + 40 * u, ww = Math.min(26 * u, bw * 0.16), wh = 44 * u;
        g.beginPath(); g.moveTo(wx - ww / 2, wy + wh); g.lineTo(wx - ww / 2, wy + ww / 2); g.arc(wx, wy + ww / 2, ww / 2, Math.PI, 0); g.lineTo(wx + ww / 2, wy + wh); g.closePath();
        g.fillStyle = T.azureLo; g.fill(); inkLine(g, F, 1.6);
        const glow = 0.4 + 0.3 * Math.sin(t * 2.3 + i);
        g.beginPath(); g.arc(wx, wy + wh * 0.6, ww * 0.25, 0, TAU); g.fillStyle = rgba(T.goldHi, glow); g.fill();
      }
      if (h > 100 * u) {
        const dw = Math.min(46 * u, bw * 0.3), dh = Math.min(66 * u, h * 0.32), dx = x + bw / 2;
        g.beginPath(); g.moveTo(dx - dw / 2, base); g.lineTo(dx - dw / 2, base - dh + dw / 2); g.arc(dx, base - dh + dw / 2, dw / 2, Math.PI, 0); g.lineTo(dx + dw / 2, base); g.closePath();
        g.fillStyle = mix(T.ochre, T.ink, 0.35); g.fill(); inkLine(g, F, 1.6);
        g.beginPath(); g.moveTo(dx, base); g.lineTo(dx, base - dh + 8 * u); inkLine(g, F, 1);
      }
      g.restore();
      // Pennant on the last merlon.
      const px = x + bw - mw / 2, py = y - mh, pole = 70 * u * grow;
      g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - pole); inkLine(g, F, 2);
      if (grow > 0.3) {
        const fw = Math.min(70 * u, slot - bw - 10 * u) * span(grow, 0.3, 1), fh = 24 * u, N = 10;
        g.beginPath();
        for (let j = 0; j <= N; j++) { const s = j / N, fx = px + fw * s, fy = py - pole + Math.sin(t * 4.2 + i - s * 3.2) * 6 * u * s; j ? g.lineTo(fx, fy) : g.moveTo(fx, fy); }
        g.lineTo(px + fw * 0.82, py - pole + fh * 0.5 + Math.sin(t * 4.2 + i - 3) * 5 * u);
        for (let j = N; j >= 0; j--) { const s = j / N, fx = px + fw * s, fy = py - pole + fh * (1 - s * 0.15) + Math.sin(t * 4.2 + i - s * 3.2) * 6 * u * s; g.lineTo(fx, fy); }
        g.closePath();
        wash(g, F, hot ? A : i % 2 ? T.azure : T.verd); inkLine(g, F, 1.6);
        g.beginPath(); g.arc(px, py - pole - 4 * u, 5 * u, 0, TAU); gild(g, F, px - 5 * u, py - pole - 9 * u, 10 * u, 10 * u); inkLine(g, F, 1.2);
        twinkle(g, F, px, py - pole - 4 * u, i * 5.1, 14);
      }
      // The figure counts with the tower; the label sits on the meadow.
      say(g, F, fmtTally(v, grow, d), x + bw / 2 - mw * 0.6, y - mh - 16 * u, num, { kind: "display", align: "center", color: hot ? A : T.text, maxW: bw + slot * 0.25, min: 96 * u, halo: 6 });
      say(g, F, d.labels[i] || "", x + bw / 2, base + 32 * u + lab * 1.1, lab, { align: "center", color: T.text, q: span(ki, 0.02, 0.45), maxW: slot - 16 * u, min: 42 * u });
    }
  }

  // Object: a painted device. Its screen holds a tiny miniature (the preview) and three tracks of clips;
  // a moving playhead crosses them. Manicules point from each label back to its part.
  function object(g, F, a, q, d) {
    const { u, T, t, A, tall } = F, phone = d.kind === "phone";
    const ko = ease(span(q, 0, 0.45));
    let w, h, x, y;
    if (tall) { w = phone ? Math.min(a.w * 0.5, a.h * 0.28) : a.w * 0.86; h = phone ? w * 1.9 : w * 0.62; x = a.x + (a.w - w) / 2; y = a.y + 10 * u; }
    else { w = phone ? Math.min(a.w * 0.24, a.h * 0.5) : Math.min(a.w * 0.5, a.h * 1.35); h = phone ? w * 1.9 : w * 0.62; h = Math.min(h, a.h - (phone ? 10 : 70) * u); w = phone ? h / 1.9 : h / 0.62; x = a.x + a.w * (phone ? 0.12 : 0.02); y = a.y + (a.h - h - (phone ? 0 : 50 * u)) / 2; }
    g.save();
    g.translate(x + w / 2, y + h); g.scale(1, lerp(0.85, 1, ko)); g.translate(-(x + w / 2), -(y + h));
    g.globalAlpha *= clamp(ko * 1.6);
    // Body: azure lid with a gilded bezel.
    g.beginPath(); rr(g, x + 8 * u, y + 10 * u, w, h, (phone ? 40 : 18) * u); g.fillStyle = rgba(T.ink, 0.16); g.fill();
    g.beginPath(); rr(g, x, y, w, h, (phone ? 40 : 18) * u); wash(g, F, T.azure); inkLine(g, F, 2.6, ko, (w + h) * 2.2);
    const pad = (phone ? 16 : 18) * u;
    g.beginPath(); rr(g, x + pad * 0.45, y + pad * 0.45, w - pad * 0.9, h - pad * 0.9, (phone ? 30 : 12) * u); gild(g, F, x, y, w, h); inkLine(g, F, 1.4);
    const sx = x + pad, sy = y + pad * (phone ? 2.2 : 1), sw = w - pad * 2, sh = h - pad * (phone ? 4.4 : 2);
    g.beginPath(); rr(g, sx, sy, sw, sh, 6 * u); g.fillStyle = T.lead; g.fill(); inkLine(g, F, 1.6);
    // Preview miniature: a sky, hills, a river and a little church with a turning sun.
    const pv = phone ? { x: sx + sw * 0.06, y: sy + sh * 0.05, w: sw * 0.88, h: sh * 0.44 } : { x: sx + sw * 0.05, y: sy + sh * 0.07, w: sw * 0.9, h: sh * 0.5 };
    g.save(); g.beginPath(); g.rect(pv.x, pv.y, pv.w, pv.h); g.clip();
    const sky = g.createLinearGradient(0, pv.y, 0, pv.y + pv.h);
    sky.addColorStop(0, T.azureLo); sky.addColorStop(1, mix(T.azure, T.lead, 0.55));
    g.fillStyle = sky; g.fillRect(pv.x, pv.y, pv.w, pv.h);
    const sunx = pv.x + pv.w * 0.78, suny = pv.y + pv.h * 0.28, sr = pv.h * 0.11;
    g.save(); g.translate(sunx, suny); g.rotate(t * 0.4);
    g.beginPath(); for (let k = 0; k < 16; k++) { const aa = (k * TAU) / 16, rr2 = k % 2 ? sr * 1.25 : sr * 1.75; g.lineTo(Math.cos(aa) * rr2, Math.sin(aa) * rr2); } g.closePath();
    gild(g, F, -sr * 2, -sr * 2, sr * 4, sr * 4); g.restore();
    g.beginPath(); g.arc(sunx, suny, sr, 0, TAU); gild(g, F, sunx - sr, suny - sr, sr * 2, sr * 2); inkLine(g, F, 1);
    // Drifting curled clouds.
    for (let i = 0; i < 2; i++) {
      const cxx = pv.x + frac(t * 0.04 + i * 0.5) * (pv.w + 120 * u) - 60 * u, cyy = pv.y + pv.h * (0.2 + i * 0.16), cs = pv.h * 0.07;
      g.beginPath(); g.arc(cxx, cyy, cs, Math.PI * 0.9, Math.PI * 2.1); g.arc(cxx + cs * 1.4, cyy - cs * 0.3, cs * 1.2, Math.PI, Math.PI * 2.1); g.arc(cxx + cs * 2.8, cyy, cs, Math.PI * 1.1, Math.PI * 2.2); g.closePath();
      g.fillStyle = T.lead; g.fill(); inkLine(g, F, 1.2);
    }
    const hill = (yy, amp, col, ph) => { g.beginPath(); g.moveTo(pv.x, pv.y + pv.h); for (let k = 0; k <= 20; k++) { const xx = pv.x + (pv.w * k) / 20; g.lineTo(xx, pv.y + pv.h * yy - Math.sin(k * 0.6 + ph) * pv.h * amp); } g.lineTo(pv.x + pv.w, pv.y + pv.h); g.closePath(); wash(g, F, col); inkLine(g, F, 1.2); };
    hill(0.66, 0.07, mix(T.verd, T.lead, 0.25), 0.4);
    // A little church on the far hill.
    const chx = pv.x + pv.w * 0.3, chy = pv.y + pv.h * 0.6, cs2 = pv.h * 0.16;
    g.beginPath(); g.rect(chx, chy - cs2, cs2 * 1.3, cs2); wash(g, F, T.stone); inkLine(g, F, 1.2);
    g.beginPath(); g.moveTo(chx - cs2 * 0.1, chy - cs2); g.lineTo(chx + cs2 * 0.65, chy - cs2 * 1.6); g.lineTo(chx + cs2 * 1.4, chy - cs2); g.closePath(); wash(g, F, A); inkLine(g, F, 1.2);
    g.beginPath(); g.rect(chx + cs2 * 1.3, chy - cs2 * 1.9, cs2 * 0.45, cs2 * 1.9); wash(g, F, T.stone); inkLine(g, F, 1.2);
    hill(0.86, 0.05, T.verd, 2.2);
    // River.
    g.beginPath(); g.moveTo(pv.x + pv.w * 0.55, pv.y + pv.h); g.bezierCurveTo(pv.x + pv.w * 0.5, pv.y + pv.h * 0.9, pv.x + pv.w * 0.66, pv.y + pv.h * 0.86, pv.x + pv.w * 0.6, pv.y + pv.h * 0.78);
    g.strokeStyle = mix(T.azure, T.lead, 0.4); g.lineWidth = 9 * u; g.stroke();
    g.restore();
    g.beginPath(); g.rect(pv.x, pv.y, pv.w, pv.h); inkLine(g, F, 3, 1, 0, T.rubric);
    // Tracks of clips.
    const tr0 = pv.y + pv.h + sh * 0.07, th = (sy + sh - tr0) / 3.6;
    const clips = [[[0.02, 0.3, T.ochre], [0.36, 0.26, A], [0.66, 0.3, T.ochre]], [[0.04, 0.42, T.verd], [0.5, 0.44, T.verd]], [[0.02, 0.6, T.rose], [0.66, 0.3, T.rose]]];
    const anchorsTrack = [];
    clips.forEach((row, ti) => {
      const ty = tr0 + ti * th * 1.2;
      row.forEach(([cx, cwid, col], ci) => {
        const kc = span(q, 0.2 + ti * 0.08 + ci * 0.05, 0.45 + ti * 0.08 + ci * 0.05);
        if (kc <= 0) return;
        const xx = pv.x + pv.w * cx, ww = pv.w * cwid * ease(kc);
        g.beginPath(); rr(g, xx, ty, ww, th, 4 * u);
        if (col === A) { wash(g, F, A); g.save(); g.beginPath(); rr(g, xx, ty, ww, th, 4 * u); g.clip(); g.strokeStyle = rgba(T.goldHi, 0.7); g.lineWidth = 2 * u; g.beginPath(); for (let k = -th; k < ww; k += 12 * u) { g.moveTo(xx + k, ty + th); g.lineTo(xx + k + th, ty); } g.stroke(); g.restore(); g.beginPath(); rr(g, xx, ty, ww, th, 4 * u); inkLine(g, F, 2.2, 1, 0, T.goldLo); }
        else { wash(g, F, col); g.beginPath(); rr(g, xx, ty, ww, th, 4 * u); inkLine(g, F, 1.3); }
      });
      anchorsTrack.push(ty + th / 2);
    });
    // Playhead.
    const phx = pv.x + pv.w * frac(t * 0.16 + 0.1);
    g.beginPath(); g.moveTo(phx, tr0 - 8 * u); g.lineTo(phx, tr0 + th * 3.4); inkLine(g, F, 2.4, 1, 0, T.rubric);
    g.beginPath(); g.moveTo(phx - 8 * u, tr0 - 16 * u); g.lineTo(phx + 8 * u, tr0 - 16 * u); g.lineTo(phx, tr0 - 4 * u); g.closePath(); g.fillStyle = T.rubric; g.fill(); inkLine(g, F, 1);
    if (!phone) { // The keyboard base.
      const by = y + h, bh = h * 0.08;
      g.beginPath(); g.moveTo(x - w * 0.06, by + bh); g.lineTo(x + w * 1.06, by + bh); g.lineTo(x + w, by); g.lineTo(x, by); g.closePath();
      wash(g, F, T.stone); inkLine(g, F, 2.2);
      g.save(); g.clip(); g.strokeStyle = rgba(T.ink, 0.35); g.lineWidth = 1 * u; g.beginPath();
      for (let k = 1; k < 3; k++) { g.moveTo(x, by + (bh * k) / 3); g.lineTo(x + w, by + (bh * k) / 3); }
      for (let k = 1; k < 24; k++) { g.moveTo(x + (w * k) / 24, by); g.lineTo(x + (w * k) / 24 + (k - 12) * 0.6 * u, by + bh); }
      g.stroke(); g.restore();
    }
    g.restore();
    // Callouts.
    const anchors = [[pv.x + pv.w * 0.32, pv.y + pv.h * 0.45], [pv.x + pv.w * 0.49, anchorsTrack[0]], [pv.x + pv.w * 0.2, anchorsTrack[2]]];
    const lab = 44 * u, n = d.callouts.length;
    for (let i = 0; i < n; i++) {
      const label = d.callouts[i]; if (!label) continue;
      const kc = span(q, 0.35 + i * 0.13, 0.75 + i * 0.13);
      if (kc <= 0) continue;
      const [ax, ay] = anchors[i];
      let lx, ly, maxW;
      if (tall) { const l0 = y + h + (phone ? 90 : 170) * u, room = Math.max(lab * 2.2, (a.y + a.h - l0 - 40 * u) / 3); lx = a.x + 130 * u; ly = l0 + i * Math.min(room, lab * 4.2); maxW = a.w - 140 * u; }
      else { lx = x + w + (phone ? 200 : 170) * u; ly = a.y + a.h * (0.2 + i * 0.3); maxW = a.x + a.w - lx - 10 * u; }
      const bobx = Math.sin(t * 2.6 + i * 1.9) * 6 * u, tipx = lx - 118 * u + bobx, tipy = ly - lab * 0.3;
      // A pen line curling from the hand to the part, ending in a gilded bezant.
      g.beginPath(); g.moveTo(tipx - 6 * u, tipy);
      const mx = (tipx + ax) / 2, my = Math.min(tipy, ay) - 40 * u;
      g.bezierCurveTo(mx + 60 * u, tipy, mx, my + (tall ? 0 : 60 * u), ax, ay);
      inkLine(g, F, 1.8, ease(kc * 1.4), Math.hypot(tipx - ax, tipy - ay) * 1.4, T.rubric);
      if (kc > 0.5) { const pr = (7 + Math.sin(t * 3 + i) * 1.5); g.beginPath(); g.arc(ax, ay, pr * u + 5 * u, 0, TAU); g.strokeStyle = rgba(T.goldHi, 0.6); g.lineWidth = 2 * u; g.stroke(); bezant(g, F, ax, ay, pr, i * 2, span(kc, 0.5, 0.8)); }
      manicule(g, F, tipx, tipy, 1.5, i === 1 ? A : T.azure, span(kc, 0, 0.4));
      say(g, F, label, lx, ly, lab, { color: i === 1 ? A : T.text, q: span(kc, 0.05, 0.6), maxW, min: 42 * u, halo: 6 });
    }
  }

  // People: robed figures on a flowered meadow, each under a banderole with their role.
  function figure(g, F, cx, base, h, o) {
    const { u, T, t } = F, k = o.k;
    if (k <= 0) return;
    const sway = Math.sin(t * 0.9 + o.i * 1.3) * 0.02, head = h * 0.105;
    g.save(); g.translate(cx, base); g.rotate(sway); g.translate(0, (1 - ease(k)) * 30 * u); g.globalAlpha *= clamp(k * 1.8);
    const sh = -h + head * 2.15, hw = h * 0.25;
    // Robe: a gothic S-curve that pools at the feet.
    const robe = () => {
      g.beginPath(); g.moveTo(-hw * 0.5, sh); g.bezierCurveTo(-hw * 0.75, sh + h * 0.2, -hw * 0.9, -h * 0.3, -hw * 1.15, -6 * u);
      g.quadraticCurveTo(0, 6 * u, hw * 1.1, -6 * u); g.bezierCurveTo(hw * 0.95, -h * 0.35, hw * 0.75, sh + h * 0.2, hw * 0.5, sh); g.closePath();
    };
    // Shoes.
    for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(sd * hw * 0.42 + sd * 6 * u, -2 * u, hw * 0.32, 5 * u, sd * 0.2, 0, TAU); g.fillStyle = T.ink; g.fill(); }
    robe(); wash(g, F, o.robe); inkLine(g, F, 2.2);
    // Drapery folds.
    g.save(); robe(); g.clip();
    g.strokeStyle = rgba(T.ink, 0.5); g.lineWidth = 1.5 * u; g.beginPath();
    for (let f = -2; f <= 2; f++) { g.moveTo(f * hw * 0.18, sh + h * 0.25); g.bezierCurveTo(f * hw * 0.3, -h * 0.35, f * hw * 0.45 + 6 * u, -h * 0.2, f * hw * 0.52, -4 * u); }
    g.stroke();
    g.fillStyle = rgba(T.lead, 0.22); g.fillRect(-hw * 1.2, sh, hw * 0.55, h);
    g.restore();
    // Gold hem and belt.
    g.beginPath(); g.moveTo(-hw * 1.15, -8 * u); g.quadraticCurveTo(0, 4 * u, hw * 1.1, -8 * u); g.strokeStyle = T.gold; g.lineWidth = 4 * u; g.stroke();
    g.beginPath(); g.moveTo(-hw * 0.62, -h * 0.5); g.quadraticCurveTo(0, -h * 0.47, hw * 0.62, -h * 0.5); g.strokeStyle = o.hot ? T.goldHi : T.goldLo; g.lineWidth = 4 * u; g.stroke();
    // Mantle over one shoulder.
    g.beginPath(); g.moveTo(-hw * 0.5, sh); g.bezierCurveTo(-hw * 0.95, sh + h * 0.18, -hw * 0.9, -h * 0.4, -hw * 0.3, -h * 0.32); g.bezierCurveTo(-hw * 0.2, -h * 0.5, 0, sh + h * 0.12, hw * 0.1, sh); g.closePath();
    wash(g, F, o.mantle); inkLine(g, F, 1.8);
    // Arms: one raised in a gesture that comes and goes.
    const gest = 0.5 + 0.5 * Math.sin(t * 1.4 + o.i * 2.1);
    const ang = o.i % 2 ? lerp(0.25, -0.9, gest * 0.7) : lerp(0.35, 0.1, gest);
    g.save(); g.translate(hw * 0.45, sh + 8 * u); g.rotate(ang);
    g.beginPath(); g.moveTo(-8 * u, 0); g.quadraticCurveTo(hw * 0.4, h * 0.12, hw * 0.25, h * 0.3); g.lineTo(hw * 0.05, h * 0.3); g.quadraticCurveTo(0, h * 0.14, -10 * u, 10 * u); g.closePath();
    wash(g, F, mix(o.robe, T.ink, 0.12)); inkLine(g, F, 1.6);
    g.beginPath(); g.ellipse(hw * 0.15, h * 0.32, 7 * u, 9 * u, 0, 0, TAU); g.fillStyle = T.flesh; g.fill(); inkLine(g, F, 1.3);
    if (o.i % 2) { g.beginPath(); g.moveTo(hw * 0.15, h * 0.32); g.lineTo(hw * 0.15, h * 0.32 + 18 * u); inkLine(g, F, 1.6); }
    g.restore();
    // An attribute held at the waist.
    const ax = -hw * 0.35, ay = -h * 0.46;
    if (o.attr === 0) { g.beginPath(); g.rect(ax - 16 * u, ay - 10 * u, 32 * u, 24 * u); wash(g, F, T.azure); inkLine(g, F, 1.6); g.beginPath(); g.rect(ax - 12 * u, ay - 6 * u, 24 * u, 16 * u); g.strokeStyle = T.gold; g.lineWidth = 2 * u; g.stroke(); }
    else if (o.attr === 1) { g.beginPath(); g.rect(ax - 18 * u, ay - 6 * u, 36 * u, 14 * u); g.fillStyle = T.lead; g.fill(); inkLine(g, F, 1.4); g.beginPath(); g.arc(ax - 18 * u, ay + 1 * u, 7 * u, 0, TAU); g.arc(ax + 18 * u, ay + 1 * u, 7 * u, 0, TAU); g.fillStyle = mix(T.lead, T.vellumLo, 0.5); g.fill(); inkLine(g, F, 1.3); }
    else if (o.attr === 2) { g.beginPath(); g.moveTo(ax - 6 * u, ay - h * 0.3); g.lineTo(ax - 2 * u, 0); inkLine(g, F, 3, 1, 0, mix(T.ochre, T.ink, 0.3)); g.beginPath(); g.arc(ax - 6 * u, ay - h * 0.32, 8 * u, 0, TAU); gild(g, F, ax - 14 * u, ay - h * 0.32 - 8 * u, 16 * u, 16 * u); inkLine(g, F, 1.2); }
    else { g.beginPath(); g.moveTo(ax, ay + 8 * u); g.quadraticCurveTo(ax - 6 * u, ay - 14 * u, ax + 2 * u, ay - 30 * u); inkLine(g, F, 1.6, 1, 0, T.verd); for (let p = 0; p < 5; p++) { const aa = (p * TAU) / 5 + t * 0.5; g.beginPath(); g.ellipse(ax + 2 * u + Math.cos(aa) * 6 * u, ay - 30 * u + Math.sin(aa) * 6 * u, 5 * u, 3.4 * u, aa, 0, TAU); g.fillStyle = T.rubric; g.fill(); } g.beginPath(); g.arc(ax + 2 * u, ay - 30 * u, 3 * u, 0, TAU); g.fillStyle = T.gold; g.fill(); }
    // Head, face and headwear.
    const hy = -h + head * 1.1, tilt = Math.sin(t * 0.7 + o.i) * 0.06;
    g.save(); g.translate(0, hy); g.rotate(tilt);
    g.beginPath(); g.moveTo(-head * 0.3, head * 0.7); g.lineTo(-head * 0.3, head * 1.2); g.lineTo(head * 0.3, head * 1.2); g.lineTo(head * 0.3, head * 0.7); g.fillStyle = T.flesh; g.fill(); inkLine(g, F, 1.3);
    g.beginPath(); g.ellipse(0, 0, head * 0.78, head * 0.95, 0, 0, TAU); g.fillStyle = T.flesh; g.fill(); inkLine(g, F, 1.8);
    const blink = frac(t / 4.1 + o.i * 0.27) > 0.96 ? 0.15 : 1;
    for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(sd * head * 0.3 + head * 0.06, -head * 0.05, head * 0.09, head * 0.09 * blink, 0, 0, TAU); g.fillStyle = T.ink; g.fill(); g.beginPath(); g.arc(sd * head * 0.38, head * 0.32, head * 0.13, 0, TAU); g.fillStyle = rgba(T.rubric, 0.35); g.fill(); }
    g.beginPath(); g.moveTo(head * 0.08, -head * 0.05); g.lineTo(head * 0.16, head * 0.24); g.lineTo(head * 0.04, head * 0.26); g.moveTo(-head * 0.16, head * 0.5); g.quadraticCurveTo(0, head * 0.6, head * 0.2, head * 0.48); inkLine(g, F, 1.3);
    const hat = o.hat;
    if (hat === 0) { // hood
      g.beginPath(); g.moveTo(-head * 0.95, head * 0.9); g.bezierCurveTo(-head * 1.2, -head * 0.6, -head * 0.6, -head * 1.35, 0, -head * 1.3); g.bezierCurveTo(head * 0.8, -head * 1.35, head * 1.2, -head * 0.5, head * 0.95, head * 0.9);
      g.bezierCurveTo(head * 0.8, 0, head * 0.6, -head * 0.95, 0, -head * 0.95); g.bezierCurveTo(-head * 0.6, -head * 0.95, -head * 0.8, 0, -head * 0.95, head * 0.9); g.closePath(); wash(g, F, o.mantle); inkLine(g, F, 1.6);
    } else if (hat === 1) { // tall hat
      g.beginPath(); g.moveTo(-head * 0.8, -head * 0.55); g.lineTo(-head * 0.45, -head * 2.1); g.quadraticCurveTo(0, -head * 2.3, head * 0.45, -head * 2.1); g.lineTo(head * 0.8, -head * 0.55); g.closePath(); wash(g, F, o.mantle); inkLine(g, F, 1.6);
      g.beginPath(); g.rect(-head * 0.85, -head * 0.75, head * 1.7, head * 0.28); gild(g, F, -head, -head * 0.8, head * 2, head * 0.4); inkLine(g, F, 1.2);
    } else if (hat === 2) { // coif
      g.beginPath(); g.moveTo(-head * 0.85, head * 0.5); g.bezierCurveTo(-head * 1.0, -head * 1.2, head * 1.0, -head * 1.2, head * 0.85, head * 0.5); g.bezierCurveTo(head * 0.7, -head * 0.6, -head * 0.7, -head * 0.6, -head * 0.85, head * 0.5); g.closePath();
      g.fillStyle = T.lead; g.fill(); inkLine(g, F, 1.5);
    } else { // curls and a gold circlet
      g.beginPath(); for (let c = 0; c < 7; c++) { const aa = Math.PI * (1.05 + c * 0.15); g.moveTo(Math.cos(aa) * head * 0.8 + head * 0.2, Math.sin(aa) * head * 0.9); g.arc(Math.cos(aa) * head * 0.8, Math.sin(aa) * head * 0.9, head * 0.2, 0, TAU); }
      g.fillStyle = mix(T.ochre, T.ink, 0.25); g.fill(); inkLine(g, F, 1.2);
      g.beginPath(); g.ellipse(0, -head * 0.62, head * 0.82, head * 0.2, 0, Math.PI, TAU); g.strokeStyle = T.gold; g.lineWidth = 4 * u; g.stroke();
    }
    g.restore();
    g.restore();
  }
  function people(g, F, a, q, d) {
    const { u, T, t, A, tall } = F;
    const n = Math.max(2, Math.min(6, Math.round(Number(d.count) || 3)));
    const rows = tall && n >= 4 ? 2 : 1, per = Math.ceil(n / rows);
    const lab = 42 * u, rowH = a.h / rows;
    const robes = [T.azure, T.verd, T.rose, T.ochre, T.azure, T.verd], mantles = [T.rose, T.ochre, T.azure, T.verd, T.lead, T.rubric];
    const hi = Math.min(n - 1, Number(d.highlight) || 0);
    // Meadow with flowers under each row, and a stylised tree at each end.
    for (let r2 = 0; r2 < rows; r2++) {
      const base = a.y + rowH * (r2 + 1) - 26 * u, kg = ease(span(q, 0, 0.3));
      g.save(); g.beginPath(); g.rect(a.x - 30 * u, base - 50 * u, (a.w + 60 * u) * kg, 100 * u); g.clip();
      g.beginPath(); g.moveTo(a.x - 20 * u, base + 22 * u);
      for (let x = a.x - 20 * u; x <= a.x + a.w + 20 * u; x += 24 * u) g.lineTo(x, base - 8 * u + Math.sin(x / (70 * u) + r2) * 5 * u);
      g.lineTo(a.x + a.w + 20 * u, base + 22 * u); g.closePath(); wash(g, F, T.verd); inkLine(g, F, 1.8);
      const rf = rng(300 + r2);
      for (let x = a.x; x < a.x + a.w; x += 26 * u) {
        const fy = base + 2 * u + rf() * 14 * u, col = [T.lead, T.rubric, T.azure, T.goldHi][Math.floor(rf() * 4)], sw = Math.sin(t * 1.5 + x * 0.02) * 2 * u;
        g.beginPath(); g.moveTo(x, fy + 8 * u); g.lineTo(x + sw, fy); g.strokeStyle = mix(T.verd, T.ink, 0.5); g.lineWidth = 1.2 * u; g.stroke();
        for (let p = 0; p < 5; p++) { const aa = (p * TAU) / 5; g.beginPath(); g.arc(x + sw + Math.cos(aa) * 3.4 * u, fy + Math.sin(aa) * 3.4 * u, 2.4 * u, 0, TAU); g.fillStyle = col; g.fill(); }
      }
      g.restore();
      if (r2 === rows - 1 && !tall) for (const [tx, sd] of [[a.x + 20 * u, 0], [a.x + a.w - 20 * u, 1]]) {
        const kt = ease(span(q, 0.1, 0.5)), th = rowH * 0.62 * kt;
        if (kt <= 0) continue;
        g.beginPath(); g.moveTo(tx - 7 * u, base); g.lineTo(tx - 4 * u, base - th * 0.6); g.lineTo(tx + 4 * u, base - th * 0.6); g.lineTo(tx + 7 * u, base); g.closePath(); wash(g, F, mix(T.ochre, T.ink, 0.35)); inkLine(g, F, 1.6);
        const cr = th * 0.24, cy = base - th * 0.66, sw = Math.sin(t * 1.1 + sd * 2) * 3 * u;
        g.beginPath(); for (let k = 0; k < 9; k++) { const aa = (k * TAU) / 9; g.moveTo(tx + sw + Math.cos(aa) * cr * 0.7 + cr * 0.4, cy + Math.sin(aa) * cr * 0.9); g.arc(tx + sw + Math.cos(aa) * cr * 0.7, cy + Math.sin(aa) * cr * 0.9, cr * 0.4, 0, TAU); }
        g.beginPath(); g.ellipse(tx + sw, cy, cr * 1.05, cr * 1.2, 0, 0, TAU); wash(g, F, sd ? T.verd : mix(T.verd, T.azure, 0.3)); inkLine(g, F, 1.8);
        g.save(); g.clip(); for (let k = 0; k < 14; k++) { const lx = tx + sw + Math.sin(k * 2.4) * cr * 0.7, ly = cy + Math.cos(k * 1.7) * cr * 0.8; ivy(g, F, lx, ly, k + Math.sin(t + k) * 0.2, 14, k % 3 ? mix(T.verd, T.lead, 0.3) : T.goldHi, k % 3 === 0); } g.restore();
      }
    }
    for (let i = 0; i < n; i++) {
      const r2 = Math.floor(i / per), j = i % per, inRow = Math.min(per, n - r2 * per);
      const slot = a.w / inRow, cx = a.x + slot * (j + 0.5), base = a.y + rowH * (r2 + 1) - 26 * u;
      const fh = Math.min(rowH - lab * 2.4 - 20 * u, slot * 2.3) * (i === hi ? 1.05 : 1);
      const ki = span(q, 0.08 + i * 0.09, 0.5 + i * 0.09);
      figure(g, F, cx, base, fh, { k: ki, i, robe: i === hi ? A : robes[i % 6], mantle: i === hi ? T.goldHi : mantles[i % 6], hat: i % 4, attr: (i + 1) % 4, hot: i === hi });
      const named = (d.badges || []).filter((b) => b && String(b).trim()), label = i < named.length ? named[i] : "";
      if (label) {
        const bwid = Math.min(slot * 0.96, measure(g, label, lab, "body", 600) + 80 * u), by = base - fh - lab * 1.15 + Math.sin(t * 1.2 + i) * 3 * u;
        banderole(g, F, cx, by, bwid, lab * 1.45, label, lab, i === hi ? A : T.ink, span(ki, 0.3, 1), t, i * 1.7);
      }
    }
  }

  // Process: a triptych. Each gothic panel opens on its hinge in turn; its icon lives on a patterned ground.
  function archPath(g, x, y, w, h) {
    const ah = w * 0.55;
    g.moveTo(x, y + h); g.lineTo(x, y + ah);
    g.quadraticCurveTo(x, y + ah * 0.25, x + w / 2, y);
    g.quadraticCurveTo(x + w, y + ah * 0.25, x + w, y + ah);
    g.lineTo(x + w, y + h); g.closePath();
  }
  function iconBook(g, F, cx, cy, s, t) {
    const { u, T } = F;
    g.beginPath(); g.moveTo(cx, cy - s * 0.28); g.quadraticCurveTo(cx - s * 0.25, cy - s * 0.38, cx - s * 0.5, cy - s * 0.3); g.lineTo(cx - s * 0.5, cy + s * 0.3); g.quadraticCurveTo(cx - s * 0.25, cy + s * 0.22, cx, cy + s * 0.32);
    g.quadraticCurveTo(cx + s * 0.25, cy + s * 0.22, cx + s * 0.5, cy + s * 0.3); g.lineTo(cx + s * 0.5, cy - s * 0.3); g.quadraticCurveTo(cx + s * 0.25, cy - s * 0.38, cx, cy - s * 0.28); g.closePath();
    g.fillStyle = T.lead; g.fill(); inkLine(g, F, 2);
    g.beginPath(); g.moveTo(cx, cy - s * 0.28); g.lineTo(cx, cy + s * 0.32); inkLine(g, F, 1.6);
    g.strokeStyle = rgba(T.ink, 0.55); g.lineWidth = 2 * u; g.beginPath();
    for (let k = 0; k < 5; k++) { const yy = cy - s * 0.16 + k * s * 0.08; g.moveTo(cx - s * 0.42, yy); g.lineTo(cx - s * 0.08, yy); g.moveTo(cx + s * 0.08, yy); g.lineTo(cx + s * (k === 4 ? 0.26 : 0.42), yy); }
    g.stroke();
    g.beginPath(); g.rect(cx - s * 0.42, cy - s * 0.22, s * 0.1, s * 0.1); g.fillStyle = T.rubric; g.fill();
    // A leaf lifting and settling.
    const lift = Math.pow(Math.max(0, Math.sin(t * 1.3)), 3);
    g.beginPath(); g.moveTo(cx, cy - s * 0.28); g.quadraticCurveTo(cx + s * 0.25 * (1 - lift), cy - s * (0.38 + lift * 0.25), cx + s * 0.5 * (1 - lift * 0.6), cy - s * (0.3 + lift * 0.2));
    g.lineTo(cx + s * 0.5 * (1 - lift * 0.6), cy + s * (0.3 - lift * 0.05)); g.quadraticCurveTo(cx + s * 0.25 * (1 - lift), cy + s * 0.22, cx, cy + s * 0.32); g.closePath();
    g.fillStyle = mix(T.lead, T.vellumLo, 0.3); g.fill(); inkLine(g, F, 1.6);
    g.beginPath(); g.moveTo(cx + s * 0.1, cy + s * 0.3); g.lineTo(cx + s * 0.14, cy + s * 0.55); g.lineTo(cx + s * 0.18, cy + s * 0.48); g.lineTo(cx + s * 0.22, cy + s * 0.55); g.lineTo(cx + s * 0.2, cy + s * 0.3); g.fillStyle = F.A; g.fill(); inkLine(g, F, 1.2);
  }
  function iconQuill(g, F, cx, cy, s, t) {
    const { u, T } = F;
    // A small sheet with a line being written.
    g.beginPath(); g.rect(cx - s * 0.45, cy - s * 0.05, s * 0.8, s * 0.42); g.fillStyle = T.lead; g.fill(); inkLine(g, F, 1.8);
    const ph = frac(t / 2.6), wx0 = cx - s * 0.38, wl = s * 0.62 * ph;
    g.beginPath();
    for (let k = 0; k <= 40; k++) { const xx = wx0 + (wl * k) / 40; const yy = cy + s * 0.12 + Math.sin(k * 1.9) * s * 0.025 - Math.abs(Math.sin(k * 0.7)) * s * 0.02; k ? g.lineTo(xx, yy) : g.moveTo(xx, yy); }
    g.strokeStyle = T.ink; g.lineWidth = 2 * u; g.stroke();
    g.beginPath(); g.moveTo(wx0, cy + s * 0.25); g.lineTo(wx0 + s * 0.5, cy + s * 0.25); g.strokeStyle = rgba(T.ink, 0.4); g.stroke();
    // Inkhorn.
    g.beginPath(); g.moveTo(cx + s * 0.22, cy - s * 0.02); g.lineTo(cx + s * 0.2, cy - s * 0.24); g.quadraticCurveTo(cx + s * 0.32, cy - s * 0.3, cx + s * 0.44, cy - s * 0.24); g.lineTo(cx + s * 0.42, cy - s * 0.02); g.closePath();
    g.fillStyle = T.ink; g.fill(); g.beginPath(); g.ellipse(cx + s * 0.32, cy - s * 0.25, s * 0.12, s * 0.04, 0, 0, TAU); gild(g, F, cx + s * 0.2, cy - s * 0.3, s * 0.24, s * 0.1); inkLine(g, F, 1.2);
    // The quill follows the written line.
    const qx = wx0 + wl, qy = cy + s * 0.12 + Math.sin(t * 18) * s * 0.02;
    g.save(); g.translate(qx, qy); g.rotate(-0.85 + Math.sin(t * 9) * 0.05);
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(s * 0.15, -s * 0.12, s * 0.62, -s * 0.06); g.quadraticCurveTo(s * 0.3, s * 0.08, 0, 0); g.closePath();
    g.fillStyle = T.lead; g.fill(); inkLine(g, F, 1.4);
    g.strokeStyle = rgba(T.ink, 0.45); g.lineWidth = 1 * u; g.beginPath(); for (let k = 1; k < 8; k++) { const xx = s * 0.08 * k; g.moveTo(xx, -s * 0.01); g.lineTo(xx + s * 0.05, -s * 0.07); } g.stroke();
    g.beginPath(); g.moveTo(0, 0); g.lineTo(s * 0.62, -s * 0.06); g.strokeStyle = T.ink; g.lineWidth = 1.4 * u; g.stroke();
    g.restore();
  }
  function iconSeal(g, F, cx, cy, s, t) {
    const { u, T, A } = F;
    g.beginPath(); g.rect(cx - s * 0.42, cy - s * 0.4, s * 0.84, s * 0.6); g.fillStyle = T.lead; g.fill(); inkLine(g, F, 1.8);
    g.strokeStyle = rgba(T.ink, 0.5); g.lineWidth = 2 * u; g.beginPath(); for (let k = 0; k < 4; k++) { g.moveTo(cx - s * 0.32, cy - s * 0.28 + k * s * 0.09); g.lineTo(cx + s * 0.32 - (k === 3 ? s * 0.25 : 0), cy - s * 0.28 + k * s * 0.09); } g.stroke();
    // Ribbon tails swaying under the seal.
    for (const sd of [-1, 1]) {
      const sw = Math.sin(t * 1.8 + sd) * s * 0.04;
      g.beginPath(); g.moveTo(cx + sd * s * 0.04, cy + s * 0.2); g.quadraticCurveTo(cx + sd * s * 0.12 + sw, cy + s * 0.4, cx + sd * s * 0.1 + sw, cy + s * 0.56);
      g.lineTo(cx + sd * s * 0.18 + sw, cy + s * 0.5); g.quadraticCurveTo(cx + sd * s * 0.2 + sw, cy + s * 0.36, cx + sd * s * 0.12, cy + s * 0.2); g.closePath();
      wash(g, F, T.azure); inkLine(g, F, 1.2);
    }
    const pulse = 1 + Math.sin(t * 2) * 0.02, r = s * 0.2 * pulse;
    g.beginPath(); for (let k = 0; k < 14; k++) { const aa = (k * TAU) / 14, rr2 = r * (k % 2 ? 1 : 1.1); g.lineTo(cx + Math.cos(aa) * rr2, cy + s * 0.16 + Math.sin(aa) * rr2); } g.closePath();
    wash(g, F, A); inkLine(g, F, 1.6);
    g.beginPath(); g.arc(cx, cy + s * 0.16, r * 0.62, 0, TAU); g.strokeStyle = mix(A, T.ink, 0.35); g.lineWidth = 2 * u; g.stroke();
    // A six-petalled emblem pressed into the wax.
    g.beginPath(); for (let k = 0; k < 6; k++) { const aa = (k * TAU) / 6 + 0.3; g.moveTo(cx, cy + s * 0.16); g.lineTo(cx + Math.cos(aa) * r * 0.45, cy + s * 0.16 + Math.sin(aa) * r * 0.45); } g.strokeStyle = mix(A, T.lead, 0.4); g.lineWidth = 2.2 * u; g.stroke();
    twinkle(g, F, cx + r * 0.6, cy + s * 0.05, 4.4, 16);
  }
  function process(g, F, a, q, d) {
    const { u, T, t, A, tall } = F, n = 3;
    const lab = 44 * u, gap = (tall ? 22 : 34) * u;
    const tw = tall ? a.w : Math.min(a.w * 0.92, (a.h - lab * 3.2) * 2.4);
    const pw = (tw - gap * (n - 1)) / n, x0 = a.x + (a.w - tw) / 2;
    const ph = Math.min(a.h - lab * (tall ? 4.6 : 3.4) - 30 * u, pw * (tall ? 2.9 : 1.25)), py = a.y + (tall ? Math.max(6 * u, (a.h - ph - lab * 4.6) * 0.4) : 6 * u);
    const grounds = [T.azure, mix(T.rubric, T.ink, 0.15), null];
    const icons = [iconBook, iconQuill, iconSeal];
    // Predella under the panels.
    const pdY = py + ph + 8 * u, kp = ease(span(q, 0, 0.3));
    g.save(); g.beginPath(); g.rect(x0 - 20 * u, pdY - 4 * u, (tw + 40 * u) * kp, 34 * u);
    g.beginPath(); rr(g, x0 - 20 * u, pdY, (tw + 40 * u) * kp, 20 * u, 4 * u); gild(g, F, x0 - 20 * u, pdY, tw + 40 * u, 20 * u); inkLine(g, F, 1.8);
    g.restore();
    for (let i = 0; i < n; i++) {
      const ki = span(q, 0.06 + i * 0.16, 0.42 + i * 0.16), open = ease(ki);
      const x = x0 + i * (pw + gap);
      if (ki > 0) {
        g.save();
        // The wing swings open from its left hinge.
        g.translate(x, 0); g.scale(Math.max(0.02, open), 1); g.translate(-x, 0);
        g.beginPath(); archPath(g, x + 8 * u, py + 10 * u, pw, ph); g.fillStyle = rgba(T.ink, 0.18); g.fill();
        g.beginPath(); archPath(g, x, py, pw, ph); gild(g, F, x, py, pw, ph); inkLine(g, F, 2.4);
        const ins = 14 * u, ix = x + ins, iy = py + ins * 1.4, iw = pw - ins * 2, ih = ph - ins * 2.4;
        g.beginPath(); archPath(g, ix, iy, iw, ih);
        if (grounds[i]) {
          wash(g, F, grounds[i]);
          g.save(); g.beginPath(); archPath(g, ix, iy, iw, ih); g.clip();
          const st = 34 * u;
          for (let gx = ix; gx < ix + iw + st; gx += st) for (let gy = iy; gy < iy + ih + st; gy += st) {
            const ox = (Math.round((gy - iy) / st) % 2) * st / 2;
            if (i === 0) { g.beginPath(); g.arc(gx + ox, gy, 2.4 * u, 0, TAU); g.fillStyle = rgba(T.goldHi, 0.85); g.fill(); }
            else { g.beginPath(); g.moveTo(gx + ox - 5 * u, gy); g.lineTo(gx + ox + 5 * u, gy); g.moveTo(gx + ox, gy - 5 * u); g.lineTo(gx + ox, gy + 5 * u); g.strokeStyle = rgba(T.goldHi, 0.75); g.lineWidth = 1.6 * u; g.stroke(); }
          }
          g.restore();
        } else {
          gild(g, F, ix, iy, iw, ih);
          // Punched dots around the edge of the gold ground.
          g.save(); g.beginPath(); archPath(g, ix + 10 * u, iy + 10 * u, iw - 20 * u, ih - 20 * u); g.setLineDash([1, 9 * u]); g.lineCap = "round"; g.strokeStyle = rgba(T.goldLo, 0.9); g.lineWidth = 4 * u; g.stroke(); g.restore();
        }
        g.beginPath(); archPath(g, ix, iy, iw, ih); inkLine(g, F, 1.8, 1, 0, i === n - 1 ? A : T.ink);
        if (i === n - 1) { g.beginPath(); archPath(g, x - 6 * u, py - 8 * u, pw + 12 * u, ph + 12 * u); inkLine(g, F, 4, 1, 0, A); }
        // Numeral roundel at the apex.
        const rx = x + pw / 2, ry = iy + iw * 0.3, rr3 = Math.min(30 * u, iw * 0.16);
        g.beginPath(); g.arc(rx, ry, rr3, 0, TAU); g.fillStyle = T.lead; g.fill(); inkLine(g, F, 1.8);
        say(g, F, ["I", "II", "III"][i], rx, ry + rr3 * 0.42, rr3 * 1.15, { kind: "display", align: "center", color: T.rubric });
        // The icon.
        const s = Math.min(iw * 0.86, ih * 0.6), icy = iy + ih * 0.62;
        g.globalAlpha *= span(ki, 0.35, 0.8);
        icons[i](g, F, x + pw / 2, icy, s, t);
        g.restore();
        twinkle(g, F, x + pw * 0.15, py + ph * 0.4, i * 2.7, 16);
      }
      // Hinge roundel with a rubric arrow carrying the flow to the next panel.
      if (i < n - 1) {
        const ka = span(q, 0.3 + i * 0.16, 0.5 + i * 0.16);
        if (ka > 0) {
          const hx = x + pw + gap / 2, hy = py + ph * 0.58, hr = Math.max(gap * 0.75, 24 * u) * back(ka);
          g.beginPath(); g.arc(hx, hy, hr, 0, TAU); g.fillStyle = T.lead; g.fill(); inkLine(g, F, 2, 1, 0, T.goldLo);
          const nud = Math.sin(t * 3 + i) * 3 * u;
          g.beginPath(); g.moveTo(hx - hr * 0.45 + nud, hy - hr * 0.42); g.lineTo(hx + hr * 0.5 + nud, hy); g.lineTo(hx - hr * 0.45 + nud, hy + hr * 0.42); g.closePath(); g.fillStyle = T.rubric; g.fill();
        }
      }
      // Label under the panel, wrapped and written on as the wing opens.
      const lines = wrap(g, d.steps[i] || "", lab, pw + gap * 0.6, "body", 600);
      lines.slice(0, 3).forEach((line, li) => say(g, F, line, x + pw / 2, pdY + 20 * u + lab * (1.2 + li * 1.15), lab, { align: "center", color: i === n - 1 ? A : T.text, q: span(ki, 0.3 + li * 0.15, 0.9 + li * 0.1), maxW: pw + gap, min: 42 * u }));
    }
  }

  // Compare: a balance. Weights drop into each pan in turn, the beam tips and keeps swaying.
  function compare(g, F, a, q, d) {
    const { u, T, t, A, tall } = F;
    const L = Math.max(0, Number(d.leftValue) || 0), Rv = Math.max(0, Number(d.rightValue) || 0), mx = Math.max(L, Rv, 1);
    const num = (tall ? 150 : 140) * u, lab = 44 * u;
    const cx = a.x + a.w / 2, textH = num * 1.05 + lab * 1.9, by = a.y + a.h - textH - 26 * u;
    const half = tall ? a.w * 0.34 : Math.min(a.w * 0.27, 420 * u), py = a.y + 70 * u;
    const chainL = Math.max(90 * u, (by - py) * 0.55);
    const kL = span(q, 0.12, 0.55), kR = span(q, 0.4, 0.8);
    const nl = Math.min(14, Math.max(1, Math.round(L))), nr = Math.min(14, Math.max(L > 0 && Rv > 0 ? 1 : 0, Math.round(Rv)));
    const shownL = L * ease(kL), shownR = Rv * ease(kR);
    const target = 0.2 * (shownL - shownR) / mx;
    const theta = target + Math.sin(t * 1.7) * 0.022 + Math.sin(t * 0.63 + 1) * 0.012;
    const ko = ease(span(q, 0, 0.3));
    const baseY = by + 20 * u;
    // A tiled floor in perspective, the balance standing on it.
    {
      const fx0 = a.x + a.w * 0.04, fx1 = a.x + a.w * 0.96, fy0 = baseY - 30 * u, fy1 = baseY + 16 * u, kf = ease(span(q, 0, 0.35));
      g.save(); g.beginPath(); g.moveTo(fx0 + 40 * u, fy0); g.lineTo(fx1 - 40 * u, fy0); g.lineTo(fx1, fy1); g.lineTo(fx0, fy1); g.closePath(); g.clip();
      g.beginPath(); g.rect(cx - (a.w / 2) * kf, fy0, a.w * kf, fy1 - fy0); g.clip();
      const nT = 26;
      const xa = (y2, k2) => lerp(lerp(fx0 + 40 * u, fx0, (y2 - fy0) / (fy1 - fy0)), lerp(fx1 - 40 * u, fx1, (y2 - fy0) / (fy1 - fy0)), k2);
      for (let i = 0; i < nT; i++) for (let r2 = 0; r2 < 2; r2++) {
        const ya = lerp(fy0, fy1, r2 / 2), yb = lerp(fy0, fy1, (r2 + 1) / 2);
        g.beginPath(); g.moveTo(xa(ya, i / nT), ya); g.lineTo(xa(ya, (i + 1) / nT), ya); g.lineTo(xa(yb, (i + 1) / nT), yb); g.lineTo(xa(yb, i / nT), yb); g.closePath();
        g.fillStyle = (i + r2) % 2 ? T.rose : mix(T.azure, T.lead, 0.15); g.fill(); g.strokeStyle = rgba(T.ink, 0.6); g.lineWidth = 1 * u; g.stroke();
        if ((i + r2) % 2 === 0) { const mxx = (xa(ya, (i + 0.5) / nT) + xa(yb, (i + 0.5) / nT)) / 2, myy = (ya + yb) / 2; g.beginPath(); g.arc(mxx, myy, 2.6 * u, 0, TAU); g.fillStyle = T.goldHi; g.fill(); }
      }
      g.restore();
      g.beginPath(); g.moveTo(cx - (a.w * 0.46) * kf, fy1); g.lineTo(cx + (a.w * 0.46) * kf, fy1); inkLine(g, F, 2);
    }
    // Plinth and column.
    g.save(); g.globalAlpha *= clamp(ko * 1.5);
    for (let s = 0; s < 3; s++) { const sw = (120 - s * 30) * u, sy = baseY - s * 18 * u; g.beginPath(); g.rect(cx - sw / 2, sy - 18 * u, sw, 18 * u); wash(g, F, s % 2 ? T.stone : mix(T.stone, T.rose, 0.3)); inkLine(g, F, 1.8); }
    const colTop = py + 6 * u, colBot = baseY - 54 * u;
    g.beginPath(); g.rect(cx - 13 * u, colTop, 26 * u, colBot - colTop); gild(g, F, cx - 13 * u, colTop, 26 * u, colBot - colTop); inkLine(g, F, 2);
    g.save(); g.beginPath(); g.rect(cx - 13 * u, colTop, 26 * u, colBot - colTop); g.clip(); g.strokeStyle = rgba(T.goldLo, 0.8); g.lineWidth = 2 * u; g.beginPath(); for (let yy = colTop; yy < colBot; yy += 22 * u) { g.moveTo(cx - 13 * u, yy); g.lineTo(cx + 13 * u, yy + 14 * u); } g.stroke(); g.restore();
    // A small bird on the finial, bobbing.
    const fb = Math.abs(Math.sin(t * 2.4)) * 4 * u;
    g.beginPath(); g.ellipse(cx + 2 * u, py - 26 * u - fb, 14 * u, 10 * u, -0.2, 0, TAU); wash(g, F, T.ochre); inkLine(g, F, 1.4);
    g.beginPath(); g.arc(cx + 14 * u, py - 34 * u - fb, 7 * u, 0, TAU); wash(g, F, T.ochre); inkLine(g, F, 1.4);
    g.beginPath(); g.moveTo(cx + 20 * u, py - 35 * u - fb); g.lineTo(cx + 29 * u, py - 33 * u - fb); g.lineTo(cx + 20 * u, py - 31 * u - fb); g.fillStyle = T.ink; g.fill();
    g.beginPath(); g.moveTo(cx - 10 * u, py - 24 * u - fb); g.lineTo(cx - 24 * u, py - 18 * u - fb); g.lineTo(cx - 10 * u, py - 20 * u - fb); g.fillStyle = mix(T.ochre, T.ink, 0.4); g.fill();
    g.beginPath(); g.arc(cx + 15 * u, py - 35 * u - fb, 1.4 * u, 0, TAU); g.fillStyle = T.ink; g.fill();
    g.restore();
    // Beam.
    const ends = [[cx - Math.cos(theta) * half, py + Math.sin(theta) * half], [cx + Math.cos(theta) * half, py - Math.sin(theta) * half]];
    g.save(); g.globalAlpha *= clamp(ko * 1.5);
    g.save(); g.translate(cx, py); g.rotate(-theta);
    g.beginPath(); g.moveTo(-half - 10 * u, -5 * u); g.quadraticCurveTo(0, -16 * u, half + 10 * u, -5 * u); g.lineTo(half + 10 * u, 5 * u); g.quadraticCurveTo(0, 0, -half - 10 * u, 5 * u); g.closePath();
    gild(g, F, -half, -16 * u, half * 2, 22 * u); inkLine(g, F, 2);
    g.restore();
    g.beginPath(); g.arc(cx, py, 13 * u, 0, TAU); g.fillStyle = T.rubric; g.fill(); inkLine(g, F, 1.8);
    g.restore();
    // Pans, chains and weights.
    const sides = [[ends[0], nl, kL, T.stone, d.left, L, T.text, 0], [ends[1], nr, kR, A, d.right, Rv, A, 1]];
    for (const [[ex, ey], count, kk, wcol, label, value, tcol, si] of sides) {
      const swing = Math.sin(t * 1.7 + si) * 0.03, pr = Math.min(175 * u, half * 0.6);
      const panX = ex + Math.sin(swing) * chainL, panY = ey + chainL;
      g.save(); g.globalAlpha *= clamp(ko * 1.5);
      g.beginPath(); g.moveTo(ex, ey); g.lineTo(panX - pr * 0.9, panY); g.moveTo(ex, ey); g.lineTo(panX + pr * 0.9, panY); g.moveTo(ex, ey); g.lineTo(panX, panY - 4 * u);
      g.setLineDash([5 * u, 4 * u]); inkLine(g, F, 2.2); g.setLineDash([]);
      g.beginPath(); g.arc(ex, ey, 6 * u, 0, TAU); gild(g, F, ex - 6 * u, ey - 6 * u, 12 * u, 12 * u); inkLine(g, F, 1.2);
      // Weights stacked in a little pyramid, each dropping in.
      const shown = Math.ceil(count * kk - 1e-6), ws = Math.min(46 * u, pr * 0.36);
      let idx = 0;
      for (let rowI = 0; idx < count; rowI++) {
        const inRow = Math.max(1, 5 - rowI);
        for (let c = 0; c < inRow && idx < count; c++, idx++) {
          if (idx >= shown) continue;
          const drop = clamp(count * kk - idx), fall = (1 - ease(drop)) * 120 * u;
          const wx = panX + (c - (inRow - 1) / 2) * ws * 1.05, wy = panY - ws * 0.5 - rowI * ws * 0.82 - fall;
          g.beginPath(); g.moveTo(wx - ws * 0.45, wy + ws * 0.45); g.lineTo(wx - ws * 0.32, wy - ws * 0.4); g.lineTo(wx + ws * 0.32, wy - ws * 0.4); g.lineTo(wx + ws * 0.45, wy + ws * 0.45); g.closePath();
          wash(g, F, wcol); inkLine(g, F, 1.4);
          g.beginPath(); g.arc(wx, wy - ws * 0.5, ws * 0.13, 0, TAU); inkLine(g, F, 1.2);
        }
      }
      // The pan: a gilded bowl.
      g.beginPath(); g.moveTo(panX - pr, panY); g.quadraticCurveTo(panX, panY + pr * 0.55, panX + pr, panY); g.closePath();
      gild(g, F, panX - pr, panY, pr * 2, pr * 0.4); inkLine(g, F, 2.2);
      g.beginPath(); g.ellipse(panX, panY, pr, 7 * u, 0, 0, TAU); g.fillStyle = mix(T.goldLo, T.ink, 0.2); g.fill(); inkLine(g, F, 1.4);
      twinkle(g, F, panX + pr * 0.5, panY + pr * 0.12, si * 3 + 1, 16);
      g.restore();
      // Figure and label fixed under the pan's rest position.
      const tx = cx + (si ? 1 : -1) * half, ty = a.y + a.h - lab * 1.2;
      const kt = si ? kR : kL;
      say(g, F, fmtTally(value, ease(kt), d), tx, ty - lab * 0.9, num, { kind: "display", align: "center", color: tcol, halo: 8, maxW: half * 1.4, min: 96 * u });
      say(g, F, label || "", tx, ty + lab * 0.35, lab, { align: "center", color: tcol, q: span(kt, 0, 0.6), maxW: half * 1.5, min: 42 * u, halo: 6 });
      // Rubric underline flourish.
      g.beginPath(); g.moveTo(tx - 70 * u, ty + lab * 0.75); g.bezierCurveTo(tx - 20 * u, ty + lab * 1.0, tx + 20 * u, ty + lab * 0.5, tx + 70 * u, ty + lab * 0.75);
      inkLine(g, F, 2, span(kt, 0.3, 0.9), 150 * u, T.rubric);
    }
  }

  // ---- title and closing pages ---------------------------------------------------------------------
  // A rubricated line-filler: alternating azure and vermilion lengths with gold bezants between.
  function filler(g, F, x, y, w, k) {
    if (k <= 0) return;
    const { u, T, t } = F, n = Math.max(3, Math.round(w / (110 * u))), sl = w / n;
    for (let i = 0; i < n; i++) {
      const ki = span(k, i / n * 0.7, i / n * 0.7 + 0.3);
      if (ki <= 0) continue;
      const sx = x + i * sl + 14 * u, sw = (sl - 28 * u) * ease(ki);
      g.beginPath(); rr(g, sx, y - 7 * u, sw, 14 * u, 7 * u); wash(g, F, i % 2 ? T.rubric : T.azure); inkLine(g, F, 1.3);
      g.beginPath(); for (let k2 = 0; k2 <= 16; k2++) { const xx = sx + 6 * u + ((sw - 12 * u) * k2) / 16, yy = y + Math.sin(k2 * 1.2 + t * 2 + i) * 3 * u; k2 ? g.lineTo(xx, yy) : g.moveTo(xx, yy); }
      g.strokeStyle = rgba(T.lead, 0.85); g.lineWidth = 1.2 * u; g.stroke();
      if (i < n - 1) bezant(g, F, x + (i + 1) * sl, y, 6, i, span(ki, 0.6, 1));
    }
  }
  // A rota: a painted wheel of the seasons, turning slowly, gilded hub and eight spokes of foliage.
  function rota(g, F, cx, cy, R, k) {
    if (k <= 0) return;
    const { u, T, t } = F, kk = ease(k);
    g.save(); g.translate(cx, cy); g.globalAlpha *= clamp(k * 1.6); g.scale(lerp(0.7, 1, kk), lerp(0.7, 1, kk));
    g.beginPath(); g.arc(6 * u, 8 * u, R, 0, TAU); g.fillStyle = rgba(T.ink, 0.14); g.fill();
    g.beginPath(); g.arc(0, 0, R, 0, TAU); gild(g, F, -R, -R, R * 2, R * 2); inkLine(g, F, 2.4);
    g.beginPath(); g.arc(0, 0, R * 0.9, 0, TAU); wash(g, F, T.azure); inkLine(g, F, 1.8);
    g.save(); g.rotate(t * 0.12);
    const cols = [T.rose, T.verd, T.ochre, T.rubric];
    for (let i = 0; i < 8; i++) {
      g.save(); g.rotate((i * TAU) / 8);
      g.beginPath(); g.moveTo(0, -R * 0.24); g.arc(0, 0, R * 0.86, -Math.PI / 2 - 0.36, -Math.PI / 2 + 0.36); g.closePath();
      g.save(); g.clip();
      g.beginPath(); g.arc(0, 0, R * 0.86, 0, TAU); wash(g, F, cols[i % 4]);
      g.restore();
      g.beginPath(); g.moveTo(0, -R * 0.24); g.arc(0, 0, R * 0.86, -Math.PI / 2 - 0.36, -Math.PI / 2 + 0.36); g.closePath(); inkLine(g, F, 1.6);
      ivy(g, F, 0, -R * 0.3, -Math.PI / 2 + Math.sin(t * 1.2 + i) * 0.12, R * 0.4 / u, i % 2 ? T.goldHi : mix(T.verd, T.lead, 0.3), i % 2 === 0);
      g.beginPath(); g.arc(0, -R * 0.75, R * 0.05, 0, TAU); g.fillStyle = T.lead; g.fill();
      g.restore();
    }
    g.restore();
    g.save(); g.rotate(-t * 0.2);
    g.beginPath(); for (let i = 0; i < 16; i++) { const aa = (i * TAU) / 16, r2 = i % 2 ? R * 0.17 : R * 0.27; g.lineTo(Math.cos(aa) * r2, Math.sin(aa) * r2); } g.closePath();
    gild(g, F, -R * 0.3, -R * 0.3, R * 0.6, R * 0.6); inkLine(g, F, 1.6);
    g.restore();
    g.beginPath(); g.arc(0, 0, R * 0.12, 0, TAU); g.fillStyle = T.rubric; g.fill(); inkLine(g, F, 1.4);
    // Lead-white beading around the rim.
    for (let i = 0; i < 36; i++) { const aa = (i * TAU) / 36 + t * 0.05; g.beginPath(); g.arc(Math.cos(aa) * R * 0.95, Math.sin(aa) * R * 0.95, 2.2 * u, 0, TAU); g.fillStyle = T.lead; g.fill(); }
    g.restore();
    twinkle(g, F, cx + R * 0.7, cy - R * 0.7, 9.2, 22);
  }
  // A wax seal on a cord, pressed onto the page at the end.
  function seal(g, F, cx, cy, R, k) {
    if (k <= 0) return;
    const { u, T, t, A } = F, press = back(span(k, 0, 0.6));
    g.save(); g.translate(cx, cy);
    for (const sd of [-1, 1]) {
      const sw = Math.sin(t * 1.4 + sd) * 8 * u;
      g.beginPath(); g.moveTo(sd * R * 0.2, R * 0.5); g.bezierCurveTo(sd * R * 0.5 + sw, R * 1.2, sd * R * 0.2 + sw, R * 1.6, sd * R * 0.45 + sw * 1.4, R * 2.1);
      g.lineTo(sd * R * 0.7 + sw * 1.4, R * 1.95); g.bezierCurveTo(sd * R * 0.45 + sw, R * 1.5, sd * R * 0.8 + sw, R * 1.1, sd * R * 0.45, R * 0.45); g.closePath();
      wash(g, F, T.azure, span(k, 0.2, 0.5)); inkLine(g, F, 1.4, span(k, 0.2, 0.5) > 0 ? 1 : 0);
    }
    g.scale(lerp(1.6, 1, press), lerp(1.6, 1, press)); g.globalAlpha *= clamp(k * 3);
    g.beginPath(); for (let i = 0; i < 20; i++) { const aa = (i * TAU) / 20, r2 = R * (1 + Math.sin(i * 2.7) * 0.06); g.lineTo(Math.cos(aa) * r2, Math.sin(aa) * r2); } g.closePath();
    wash(g, F, A); inkLine(g, F, 2);
    g.beginPath(); g.arc(0, 0, R * 0.7, 0, TAU); g.strokeStyle = mix(A, T.ink, 0.35); g.lineWidth = 3 * u; g.stroke();
    g.beginPath(); for (let i = 0; i < 8; i++) { const aa = (i * TAU) / 8 + 0.2; g.moveTo(Math.cos(aa) * R * 0.15, Math.sin(aa) * R * 0.15); g.quadraticCurveTo(Math.cos(aa + 0.4) * R * 0.45, Math.sin(aa + 0.4) * R * 0.45, Math.cos(aa) * R * 0.55, Math.sin(aa) * R * 0.55); }
    g.strokeStyle = mix(A, T.lead, 0.45); g.lineWidth = 2.6 * u; g.stroke();
    g.beginPath(); g.arc(0, 0, R * 0.14, 0, TAU); g.fillStyle = mix(A, T.lead, 0.4); g.fill();
    // A glossy highlight that drifts on the wax.
    const hl = g.createRadialGradient(-R * 0.35 + Math.sin(t * 0.8) * R * 0.1, -R * 0.4, 0, -R * 0.3, -R * 0.35, R * 0.6);
    hl.addColorStop(0, "rgba(255,255,255,0.35)"); hl.addColorStop(1, "rgba(255,255,255,0)");
    g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fillStyle = hl; g.fill();
    g.restore();
  }
  function statement(g, F, id, local, hold) {
    const { u, W, H, tall } = F, M = marginOf(F), R = rectsOf(HEAD[id]);
    if (!R.lines.length) return;
    const left = Math.min(...R.lines.map((l) => l.x)), right = Math.max(...R.lines.map((l) => l.x + l.w));
    const top = Math.min(...R.lines.map((l) => l.y)), bottom = Math.max(...R.lines.map((l) => l.y + l.h));
    const gone = neighbours(F, id).next ? span(local, hold - F.change, hold) : 0;
    if (gone < 1) { g.save(); g.globalAlpha *= 1 - gone; initial(g, F, HEAD[id], span(local, -0.35, 1.1)); g.restore(); }
    // Line-filler under the words, a ruled rubric line above.
    const fw = Math.min(right - left, W - M.side * 2) * (tall ? 1 : 0.8);
    filler(g, F, left, bottom + 44 * u, Math.max(fw, 360 * u), span(local, -0.5, 1.5));
    if (id === "title") {
      const kr = R.lines.length ? span(local, 0.1, 0.9) : 0, ky = (rectsOf("kicker").lines[0] || { y: top }).y - 26 * u;
      g.beginPath(); g.moveTo(left, ky); g.lineTo(left + (360 * u) * ease(kr), ky); g.moveTo(left, ky + 6 * u); g.lineTo(left + 300 * u * ease(kr), ky + 6 * u); inkLine(g, F, 1.6, 1, 0, F.T.rubric);
    }
    // A rota (title) or a seal (closing) in the free space beside or below the words.
    const freeR = W - M.side - right, freeB = H - (bottom + 120 * u) - 100 * u;
    // The page opens with its ornament already arriving, so no statement frame starts bare.
    const k = span(local, id === "closing" ? -0.15 : -0.45, id === "closing" ? 0.9 : 1.2);
    if (!tall && freeR > 330 * u) {
      const Rr = Math.min(freeR * 0.4, H * 0.24), cx = W - M.side - freeR / 2 + 20 * u, cy = H * 0.5;
      if (id === "closing") seal(g, F, cx, cy - Rr * 0.4, Rr * 0.62, k); else rota(g, F, cx, cy, Rr, k);
    } else if (freeB > 260 * u) {
      const Rr = Math.min(freeB * 0.36, W * 0.24), cx = W / 2, cy = bottom + 110 * u + freeB * 0.42;
      if (id === "closing") seal(g, F, cx, cy - Rr * 0.5, Rr * 0.7, k); else rota(g, F, cx, cy, Rr, k);
    } else if (id === "closing") {
      seal(g, F, W - M.side - 70 * u, Math.min(H - 220 * u, bottom + 110 * u), 54 * u, k);
    }
  }

  // ---- frame plumbing --------------------------------------------------------------------------------
  let frame = null;
  function makeFrame(ctx, S, info) {
    const look = S.look, T = look.tone;
    return { S, W: S.W, H: S.H, u: S.u, tall: S.tall, T, A: S.accent, info, t: info.t, change: Number(info.change) || 0.45, plan: planOf(), g: ctx };
  }
  const DRAW = { chart, object, people, process, compare };
  const scene = (id) => (ctx, S, box, p, d, info) => {
    const F = frame;
    if (!F || !info) return;
    F.g = ctx; F.t = info.t;
    const leaving = info.exit !== undefined;
    const L = info.local, hold = info.hold;
    const sw = sweepOf(F, id, L, hold);
    ctx.save();
    clipFor(ctx, F, sw);
    // The initial leaves with its headline, which wipes away over the last `change` of the scene.
    const gone = sw.nb.next ? span(L, hold - F.change, hold) : 0;
    if (gone < 1) { ctx.save(); ctx.globalAlpha *= 1 - gone; initial(ctx, F, HEAD[id], span(L, 0, 0.9)); ctx.restore(); }
    // Each drawing opens part-built (the leaf turns onto a page already being worked), then builds on.
    const q = leaving ? 1 : 0.3 + 0.7 * clamp(L / Math.min(2.3, hold * 0.58));
    DRAW[id](ctx, F, areaOf(F, id), q, d);
    ctx.restore();
    // The turning leaf is drawn by whichever layer is on top this frame.
    const curScene = F.info.scene;
    if (!leaving && (sw.out !== null || sw.inn !== null)) leaf(ctx, F, sw.out !== null ? sw.out : sw.inn);
    else if (leaving && !DRAW[curScene]) leaf(ctx, F, sw.out);
  };

  const TONE = {
    vellum: "#efe0ba", vellumHi: "#f8eed3", vellumLo: "#d6bb86", ink: "#2b1a10", rubric: "#b3261c", azure: "#24479a", azureLo: "#142c66",
    verd: "#3e7a4a", rose: "#c66f7c", ochre: "#c98a2c", lead: "#f8f1de", flesh: "#f2d8bf", stone: "#e9d8b0",
    gold: "#c9982c", goldHi: "#f7de8a", goldLo: "#7d560f", glint: 0.6, text: "#2b1a10", haloC: "#f8eed3", mott: "120,78,28", rule: "150,60,40", shade: "70,40,12",
  };
  const halo = (paper) => () => `0 1px 0 ${paper}, 0 0 14px ${paper}`;
  return {
    bg: TONE.vellum, panel: "rgba(248,241,222,0.7)", ink: TONE.ink, muted: "#6b5137", accent: TONE.rubric, onAccent: "#fff6e0",
    rule: "rgba(43,26,16,0.6)", track: "rgba(43,26,16,0.1)",
    display: DISPLAY, displayWeight: 400, displayCase: "none", displayTracking: "0em",
    body: BODY, bodyWeight: 600, figures: DISPLAY, radius: 6, motion: "write", change: "grid",
    kit: { line: 2.4, fill: "solid", panel: "fill" },
    tone: TONE,
    keepArt: true,
    overlap: true,
    css: (accent, look) => `
      #root .display { color: ${look.ink}; }
      #root .display::first-letter { color: transparent; -webkit-text-fill-color: transparent; text-shadow: none; font-size: 1.55em; line-height: 1; padding: 0 0.17em 0 0.13em; margin-right: 0.14em; }
      #root h1.display::first-letter { float: left; font-size: 2.05em; line-height: 0.92; padding: 0.06em 0.2em 0 0.16em; margin: 0.04em 0.16em 0 0; }
      #root h1.display { line-height: 1.12; }
      #root .display:not(h1) { padding-left: 1.7em; text-indent: -1.7em; }
      @media (min-aspect-ratio: 4/3) { #root #title, #root #closing { max-width: 62%; } }
      #root .kicker { font-family: ${BODY}; font-variant: small-caps; text-transform: none; letter-spacing: 0.16em; font-size: 44px !important; color: ${accent}; }
    `,
    palettes: {
      // Bleached: pale, cool skin and brighter pigments. Purple codex: dyed vellum with gold and silver.
      // Grisaille: sepia ink and washes only.
      light: { bg: "#f5eedb", ink: "#2a1e16", muted: "#6c5a46", textShadow: halo("#f8f3e3"), backdrop: () => "#f5eedb",
        tone: { ...TONE, vellum: "#f4ecd7", vellumHi: "#fbf7ea", vellumLo: "#e2d3b0", mott: "130,100,60", glint: 0.5, shade: "90,70,40" } },
      dark: { bg: "#3a1d3c", panel: "rgba(60,30,62,0.7)", ink: "#f3e3b4", muted: "#d0b98a", accent: "#e6b94a", onAccent: "#2a1230", rule: "rgba(243,227,180,0.6)", track: "rgba(243,227,180,0.12)",
        textShadow: halo("#3a1d3c"), backdrop: () => "#3a1d3c",
        tone: { ...TONE, vellum: "#3d1f40", vellumHi: "#55305a", vellumLo: "#24102a", ink: "#140814", rubric: "#e0553e", azure: "#3d68c4", azureLo: "#1d3678", lead: "#f2e6c8", stone: "#d9c6a0",
          mott: "10,0,14", rule: "230,200,140", shade: "5,0,8", glint: 0.7, text: "#f3e3b4", haloC: "#2a1230" } },
      mono: { bg: "#ece4d2", ink: "#2e2418", muted: "#6e604c", accent: "#5a3e22", onAccent: "#f5efe2", textShadow: halo("#f3ecdc"), backdrop: () => "#ece4d2",
        tone: { ...TONE, vellum: "#ebe3d0", vellumHi: "#f6f0e2", vellumLo: "#d2c5a8", ink: "#2e2418", rubric: "#6a4a2a", azure: "#5a5048", azureLo: "#3a332d", verd: "#7a7060", rose: "#a8988a",
          ochre: "#9a8460", flesh: "#efe2d0", stone: "#ddd2bc", gold: "#a89470", goldHi: "#e2d6b8", goldLo: "#5e5038", mott: "90,75,55", rule: "90,70,50", shade: "60,45,30", glint: 0.35, text: "#2e2418", haloC: "#f6f0e2" } },
    },
    textShadow: halo("#f8eed3"),
    backdrop: () => TONE.vellum,
    paint: (ctx, W, H) => { ctx.clearRect(0, 0, W, H); },
    stage(ctx, S, info) {
      const F = (frame = makeFrame(ctx, S, info));
      ctx.save();
      if (S.paint) {
        vellum(ctx, F);
        border(ctx, F);
        dragon(ctx, F);
        moth(ctx, F);
        heron(ctx, F);
      }
      const id = info.scene;
      let topmost = false, s = null;
      if (id === "title" || id === "closing") {
        const sw = sweepOf(F, id, info.local, info.hold);
        ctx.save(); clipFor(ctx, F, sw); statement(ctx, F, id, info.local, info.hold); ctx.restore();
        s = sw.out !== null ? sw.out : sw.inn;
        // The incoming leaf over a statement page is drawn here unless an outgoing drawing is on top.
        topmost = sw.out !== null || (sw.inn !== null && !DRAW[sw.nb.prev]);
      }
      // A title page that is still turning away while a drawn scene starts.
      const nb = id ? neighbours(F, id) : { prev: null };
      if (DRAW[id] && (nb.prev === "title" || nb.prev === "closing") && info.local < F.change) {
        const P = F.plan, prevSt = P && P.shown.find((st) => st.id === nb.prev);
        if (prevSt) { const L2 = prevSt.hold + info.local, sw2 = sweepOf(F, nb.prev, L2, prevSt.hold); ctx.save(); clipFor(ctx, F, sw2); statement(ctx, F, nb.prev, L2, prevSt.hold); ctx.restore(); }
      }
      if (topmost && s !== null) leaf(ctx, F, s);
      // Warm, slowly breathing light across the page.
      if (S.paint) {
        const { W, H } = F, lx = W * (0.42 + 0.06 * Math.sin(info.t * 0.21)), ly = H * (0.36 + 0.05 * Math.cos(info.t * 0.17));
        const gr = ctx.createRadialGradient(lx, ly, 0, lx, ly, Math.hypot(W, H) * 0.55);
        gr.addColorStop(0, `rgba(255,236,190,${0.08 + 0.02 * Math.sin(info.t * 1.3)})`); gr.addColorStop(1, "rgba(255,236,190,0)");
        ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
    },
    scenes: { chart: scene("chart"), object: scene("object"), people: scene("people"), process: scene("process"), compare: scene("compare") },
  };
});
