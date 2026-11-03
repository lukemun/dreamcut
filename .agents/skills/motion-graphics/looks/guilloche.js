// Guilloché: a security-printed certificate world. Hairline rosettes, woven wave meshes and braided
// borders in iris-blended inks fill the whole sheet; a UV pass sweeps across to reveal hidden print;
// scenes are engraved plates, cameo portraits, perforated stamps and notes. A rainbow-ink ribbon wipes
// from one plate to the next. Every frame is a pure function of time: seeded noise only, no clocks.
window.DreamcutMotion.register("guilloche", ({ grain, rng }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const stg = (p, i, n, spread = 0.5) => eo(seg(p, (i / Math.max(1, n)) * spread, (i / Math.max(1, n)) * spread + (1 - spread)));
  const ping = (v) => 1 - Math.abs(1 - (((v % 2) + 2) % 2));
  const MONO = "'American Typewriter', 'Courier New', Courier, monospace";

  // ---- colour ------------------------------------------------------------------------------------
  function rgb(value) {
    const s = String(value || "");
    if (s[0] === "#") {
      const h = s.length === 4 ? s.slice(1).split("").map((c) => c + c).join("") : s.slice(1, 7);
      const n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const m = s.match(/rgba?\(([^)]+)\)/);
    return m ? m[1].split(",").slice(0, 3).map(Number) : [200, 200, 200];
  }
  const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a)})`;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;

  function theme(S) {
    const L = S.look;
    const paper = rgb(L.bg);
    return {
      L, u: S.u, W: S.W, H: S.H, tall: S.tall, tex: L.texture ?? 1, paper, light: lum(paper) > 140,
      ink: rgb(L.ink), inkS: L.ink, mutedS: L.muted, acc: rgb(S.accent), accS: S.accent,
      plaq: rgb(L.plaque || L.bg), iris: (L.iris || []).map(rgb), disp: L.display, body: L.body, fig: L.figures,
    };
  }
  function irisAt(th, f) {
    const n = th.iris.length;
    const x = (((f % 1) + 1) % 1) * n;
    const i = Math.floor(x);
    return mix(th.iris[i % n], th.iris[(i + 1) % n], x - i);
  }
  // A repeating rainbow gradient two cycles long, slid by `off` so the ink appears to flow.
  function irisGrad(ctx, th, x0, len, off, alpha, vertical) {
    const s = -((((off % len) + len) % len));
    const g = vertical ? ctx.createLinearGradient(0, x0 + s, 0, x0 + s + len * 2) : ctx.createLinearGradient(x0 + s, 0, x0 + s + len * 2, 0);
    const n = th.iris.length;
    for (let k = 0; k <= n * 2; k++) g.addColorStop(k / (n * 2), rgba(th.iris[k % n], alpha));
    return g;
  }

  // ---- text ---------------------------------------------------------------------------------------
  const MW = {};
  function fontOf(th, size, o = {}) {
    const fam = o.font === "disp" ? th.disp : o.font === "fig" ? th.fig : o.font === "mono" ? MONO : th.body;
    return `${o.italic ? "italic " : ""}${o.weight || (o.font === "fig" || o.font === "disp" ? 700 : 600)} ${size}px ${fam}`;
  }
  function tw(ctx, th, s, size, o = {}) {
    const f = fontOf(th, size, o), k = f + "|" + s;
    if (MW[k] == null) { ctx.save(); ctx.font = f; MW[k] = ctx.measureText(String(s)).width; ctx.restore(); }
    return MW[k];
  }
  function txt(ctx, th, s, x, y, size, o = {}) {
    ctx.save();
    ctx.font = fontOf(th, size, o);
    ctx.textAlign = o.align || "left";
    ctx.textBaseline = o.base || "alphabetic";
    const str = o.upper ? String(s).toUpperCase() : String(s);
    if (o.halo) { ctx.lineJoin = "round"; ctx.lineWidth = o.halo * th.u; ctx.strokeStyle = rgba(th.paper, 0.92); ctx.strokeText(str, x, y); }
    ctx.globalAlpha *= o.alpha ?? 1;
    ctx.fillStyle = o.color || th.inkS;
    ctx.fillText(str, x, y);
    ctx.restore();
  }
  function arcText(ctx, th, text, r, size, col) {
    const unit = text + "  •  ";
    const n = Math.max(1, Math.round((TAU * r) / (size * 0.7) / unit.length)) * unit.length;
    ctx.save();
    ctx.font = `700 ${size}px ${th.body}`; ctx.fillStyle = col; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let i = 0; i < n; i++) { ctx.save(); ctx.rotate((i / n) * TAU); ctx.translate(0, -r); ctx.fillText(unit[i % unit.length], 0, 0); ctx.restore(); }
    ctx.restore();
  }
  // Microtext along a straight line, scrolling slowly.
  function micro(ctx, th, s, x0, y0, x1, y1, size, off, col) {
    const L = Math.hypot(x1 - x0, y1 - y0);
    const unit = s + "   •   ";
    const uw = tw(ctx, th, unit, size, { weight: 700 });
    ctx.save();
    ctx.translate(x0, y0); ctx.rotate(Math.atan2(y1 - y0, x1 - x0));
    ctx.beginPath(); ctx.rect(0, -size * 1.2, L, size * 1.6); ctx.clip();
    ctx.font = `700 ${size}px ${th.body}`; ctx.fillStyle = col; ctx.textBaseline = "alphabetic";
    const start = -(((off % uw) + uw) % uw);
    for (let x = start; x < L; x += uw) ctx.fillText(unit, x, 0);
    ctx.restore();
  }

  // ---- engraving primitives ----------------------------------------------------------------------
  // Nested hypotrochoid loops: n lobes, K curves growing from `inner` to the full radius.
  function hypo(ctx, th, cx, cy, R, o = {}) {
    const n = o.n || 7, K = o.K || 16, inner = o.inner ?? 0.2, t = o.t || 0, a = o.alpha ?? 1;
    const sh = o.shift || 0, rot = o.rot || 0, amt = o.amt ?? 1, N = Math.max(150, n * 20);
    ctx.save();
    ctx.lineWidth = (o.w ?? 1.1) * th.u;
    for (let k = 0; k < K; k++) {
      const f = K > 1 ? k / (K - 1) : 1;
      const d = ((0.5 + 0.5 * Math.sin(t * 0.8 + k * 0.5)) * 0.5 * amt + 0.2) / n;
      const rk = (R * (inner + (1 - inner) * f)) / (1 - 1 / n + d);
      const ph = rot + k * 0.045 * (o.twist ?? 1), cp = Math.cos(ph), sp = Math.sin(ph);
      ctx.strokeStyle = o.mono ? rgba(th.ink, a * (0.45 + 0.5 * f)) : rgba(irisAt(th, sh + f * 0.9), a * (0.5 + 0.5 * f));
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const q = (i / N) * TAU;
        const x = (1 - 1 / n) * Math.cos(q) + d * Math.cos((n - 1) * q);
        const y = (1 - 1 / n) * Math.sin(q) - d * Math.sin((n - 1) * q);
        const X = cx + rk * (x * cp - y * sp), Y = cy + rk * (x * sp + y * cp);
        if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  // Braided lace rings: three strands per ring weave through each other.
  function lace(ctx, th, cx, cy, R, o = {}) {
    const rings = o.rings || 7, m = o.m || 22, t = o.t || 0, a = o.alpha ?? 1, sh = o.shift || 0;
    ctx.save();
    ctx.lineWidth = (o.w ?? 1) * th.u;
    for (let j = 0; j < rings; j++) {
      const f = rings > 1 ? j / (rings - 1) : 1;
      const Rj = R * (0.4 + 0.6 * f), mj = m + (j % 3) * 2, A = Rj * (o.amp ?? 0.045) * (0.75 + 0.25 * Math.sin(t * 0.7 + j));
      const N = mj * 12;
      for (let s = 0; s < 3; s++) {
        const ph = t * (o.speed ?? 0.5) * (j % 2 ? 1 : -1) + (s * TAU) / 3;
        ctx.strokeStyle = o.mono ? rgba(th.ink, a * 0.7) : rgba(irisAt(th, sh + f * 0.8 + s * 0.12), a * 0.85);
        ctx.beginPath();
        for (let i = 0; i <= N; i++) {
          const q = (i / N) * TAU, r = Rj + A * Math.sin(mj * q + ph);
          const X = cx + r * Math.cos(q), Y = cy + r * Math.sin(q);
          if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  function spokes(ctx, th, cx, cy, r0, r1, o = {}) {
    const n = o.n || 96, t = o.t || 0;
    ctx.save();
    ctx.lineWidth = (o.w ?? 0.9) * th.u; ctx.strokeStyle = o.color || rgba(th.ink, o.alpha ?? 0.4);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (o.rot || 0), rr = i % 2 ? r1 - (r1 - r0) * 0.16 * (1 + Math.sin(t * 1.3 + i)) : r1;
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.stroke();
    ctx.restore();
  }
  // Wave-line fill for the current clip: one or two families of sine lines (woven when crossed).
  function waveFill(ctx, x, y, w, h, o) {
    const sp = o.sp, amp = o.amp, wl = o.wl, ph = o.ph || 0, fams = o.cross ? 2 : 1;
    ctx.save();
    ctx.lineWidth = o.w; ctx.strokeStyle = o.color;
    ctx.beginPath();
    for (let f = 0; f < fams; f++) {
      const sg = f ? -1 : 1;
      for (let yy = y - amp, i = 0; yy <= y + h + amp; yy += sp, i++) {
        for (let xx = x, k = 0; xx <= x + w + 6; xx += 6, k++) {
          const yv = yy + sg * amp * Math.sin((xx / wl) * TAU + ph + i * 0.21);
          if (k) ctx.lineTo(xx, yv); else ctx.moveTo(xx, yv);
        }
      }
    }
    ctx.stroke();
    ctx.restore();
  }
  // Two strands twisting about a straight line, like the border cord on a banknote.
  function braid(ctx, th, x0, y0, x1, y1, o = {}) {
    const L = Math.hypot(x1 - x0, y1 - y0);
    if (L < 4) return;
    const amp = (o.amp ?? 5) * th.u, wl = (o.wl ?? 28) * th.u, ph = o.ph || 0, strands = o.strands || 2;
    ctx.save();
    ctx.translate(x0, y0); ctx.rotate(Math.atan2(y1 - y0, x1 - x0));
    ctx.lineWidth = (o.w ?? 1.1) * th.u;
    const N = Math.max(2, Math.ceil(L / (3 * th.u)));
    for (let s = 0; s < strands; s++) {
      ctx.strokeStyle = o.color ? o.color : rgba(irisAt(th, (o.shift || 0) + s / strands * 0.5), o.alpha ?? 0.85);
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const x = (i / N) * L;
        const y = amp * Math.sin((x / wl) * TAU + ph + (s * TAU) / strands);
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  function chamfer(ctx, x, y, w, h, c) {
    ctx.beginPath();
    ctx.moveTo(x + c, y); ctx.lineTo(x + w - c, y); ctx.lineTo(x + w, y + c); ctx.lineTo(x + w, y + h - c);
    ctx.lineTo(x + w - c, y + h); ctx.lineTo(x + c, y + h); ctx.lineTo(x, y + h - c); ctx.lineTo(x, y + c); ctx.closePath();
  }
  // An engraved plate: paper fill, triple rule, braided inner border.
  function plaque(ctx, th, x, y, w, h, o = {}) {
    const u = th.u, c = (o.c ?? 12) * u, a = o.alpha ?? 0.9, t = o.t || 0, col = o.col || th.ink;
    ctx.save();
    chamfer(ctx, x, y, w, h, c);
    ctx.shadowColor = rgba(th.ink, th.light ? 0.2 : 0.5); ctx.shadowBlur = (o.shadow ?? 18) * u; ctx.shadowOffsetY = 6 * u;
    ctx.fillStyle = rgba(o.fill || th.plaq, a); ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = rgba(col, 0.95); ctx.lineWidth = (o.lw ?? 2.4) * u; ctx.stroke();
    const i1 = 8 * u;
    chamfer(ctx, x + i1, y + i1, w - 2 * i1, h - 2 * i1, Math.max(2, c - i1 * 0.6));
    ctx.lineWidth = 1 * u; ctx.strokeStyle = rgba(col, 0.7); ctx.stroke();
    if (o.braid !== false && w > 240 * u && h > 110 * u) {
      const bi = 15 * u, e = c + 10 * u, bo = { amp: 3.4, wl: 20, ph: t * 1.4, w: 0.9, shift: o.shift || 0, alpha: 0.8 };
      braid(ctx, th, x + e, y + bi, x + w - e, y + bi, bo); braid(ctx, th, x + e, y + h - bi, x + w - e, y + h - bi, { ...bo, ph: -bo.ph });
      braid(ctx, th, x + bi, y + e, x + bi, y + h - e, { ...bo, ph: -bo.ph }); braid(ctx, th, x + w - bi, y + e, x + w - bi, y + h - e, bo);
      const i2 = 23 * u;
      chamfer(ctx, x + i2, y + i2, w - 2 * i2, h - 2 * i2, 3 * u);
      ctx.lineWidth = 0.8 * u; ctx.strokeStyle = rgba(col, 0.5); ctx.stroke();
    }
    ctx.restore();
  }
  function tag(ctx, th, cx, cy, s, size, o = {}) {
    const w = tw(ctx, th, s, size) + size * 1.2, h = size * 1.6;
    plaque(ctx, th, cx - w / 2, cy - h / 2, w, h, { c: 8, braid: false, alpha: 0.97, col: o.col, lw: 1.8, shadow: 10 });
    txt(ctx, th, s, cx, cy + size * 0.04, size, { align: "center", base: "middle", color: o.color });
    return w;
  }
  // A scalloped seal with turning ring text and a woven rosette inside.
  function seal(ctx, th, cx, cy, R, o = {}) {
    const t = o.t || 0, col = o.col || th.inkS, u = th.u, N = 40;
    ctx.save();
    ctx.translate(cx, cy); if (o.scale != null) ctx.scale(o.scale, o.scale); ctx.rotate(o.rot || 0);
    ctx.beginPath();
    for (let i = 0; i <= N * 6; i++) { const a = (i / (N * 6)) * TAU, r = R * (1 + 0.035 * Math.cos(a * N)); i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath();
    ctx.shadowColor = rgba(th.ink, 0.25); ctx.shadowBlur = 14 * u; ctx.shadowOffsetY = 5 * u;
    ctx.fillStyle = rgba(th.plaq, 0.97); ctx.fill(); ctx.shadowColor = "transparent";
    ctx.lineWidth = 2.4 * u; ctx.strokeStyle = col; ctx.stroke();
    ctx.lineWidth = 1 * u; ctx.beginPath(); ctx.arc(0, 0, R * 0.9, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, R * 0.62, 0, TAU); ctx.lineWidth = 1.6 * u; ctx.stroke();
    ctx.save(); ctx.rotate(t * 0.35 * (o.dir || 1)); arcText(ctx, th, o.label || "", R * 0.77, R * 0.14, col); ctx.restore();
    hypo(ctx, th, 0, 0, R * 0.58, { n: o.n || 6, K: 7, t, alpha: 0.85, w: 0.9, shift: o.shift || 0, mono: o.mono });
    if (o.glyph) {
      ctx.beginPath(); ctx.arc(0, 0, R * (o.disc ?? 0.3), 0, TAU); ctx.fillStyle = rgba(th.plaq, 0.98); ctx.fill(); ctx.lineWidth = 1.4 * u; ctx.stroke();
      txt(ctx, th, o.glyph, 0, R * 0.02, o.glyphSize || R * 0.34, { font: "fig", align: "center", base: "middle", color: o.glyphColor || col });
    }
    ctx.restore();
  }

  // ---- paper -------------------------------------------------------------------------------------
  const CACHE = {};
  function fibres(th) {
    const key = th.light ? "L" : "D";
    if (CACHE[key]) return CACHE[key];
    const c = document.createElement("canvas"); c.width = c.height = 320;
    const g = c.getContext("2d"), r = rng(31);
    for (let i = 0; i < 520; i++) {
      const x = r() * 320, y = r() * 320, a = r() * TAU, l = 3 + r() * 11;
      g.strokeStyle = th.light ? (r() < 0.5 ? `rgba(90,70,40,${0.05 + r() * 0.08})` : `rgba(255,255,255,${0.2 + r() * 0.3})`) : `rgba(255,255,255,${0.03 + r() * 0.05})`;
      g.lineWidth = 0.6 + r() * 0.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    for (let i = 0; i < 700; i++) { g.fillStyle = th.light ? `rgba(60,50,30,${r() * 0.1})` : `rgba(255,255,255,${r() * 0.05})`; g.fillRect(r() * 320, r() * 320, 1.3, 1.3); }
    return (CACHE[key] = c);
  }
  function paperFinish(ctx, th) {
    const { W, H, tex } = th;
    ctx.save();
    ctx.globalAlpha = 0.9 * tex;
    ctx.fillStyle = ctx.createPattern(fibres(th), "repeat"); ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.78);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, th.light ? `rgba(110,85,40,${0.2 * tex})` : `rgba(0,0,0,${0.45 * tex})`);
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // The woven mesh that runs under everything: two families of sine lines whose pinch and swell drift.
  function mesh(ctx, th, t, wp, area) {
    const { W, H, u, tex } = th;
    const sp = (17 + (1 - tex) * 12) * u, A = sp * 0.62;
    ctx.save();
    ctx.beginPath(); ctx.rect(area.x, area.y, area.w, area.h); ctx.clip();
    ctx.lineWidth = 1 * u;
    for (let f = 0; f < 2; f++) {
      ctx.strokeStyle = irisGrad(ctx, th, 0, W, t * 55 * u + wp * 320 * u + f * W * 0.5, th.light ? 0.3 : 0.22);
      ctx.beginPath();
      const sg = f ? -1 : 1;
      for (let i = 0, y = area.y - A; y < area.y + area.h + A; y += sp, i++) {
        for (let x = area.x, k = 0; x <= area.x + area.w + 9 * u; x += 9 * u, k++) {
          const env = 0.25 + 0.75 * Math.pow(Math.sin((Math.PI * x) / (0.9 * W) + t * 0.25 + wp * 0.7), 2);
          const yy = y + sg * A * env * Math.sin((x / (360 * u)) * TAU + i * 0.31 + t * 0.9);
          if (k) ctx.lineTo(x, yy); else ctx.moveTo(x, yy);
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  const ANCH = [[0.72, 0.55], [0.28, 0.58], [0.7, 0.6], [0.3, 0.55], [0.68, 0.5], [0.32, 0.6], [0.6, 0.55]];

  function serial(t, k = 0) {
    const n = 4710000 + Math.floor(t * 37) + k * 913;
    return "No. " + String.fromCharCode(65 + (k % 6)) + String(n).padStart(8, "0");
  }

  // Border: braided cord between hairline rules, microtext, and woven corner rosettes.
  function border(ctx, th, t) {
    const { W, H, u } = th, B = 52 * u;
    ctx.save();
    ctx.strokeStyle = rgba(th.ink, 0.85); ctx.lineWidth = 1.6 * u;
    ctx.strokeRect(10 * u, 10 * u, W - 20 * u, H - 20 * u);
    ctx.lineWidth = 1 * u; ctx.strokeStyle = rgba(th.ink, 0.6);
    ctx.strokeRect(B, B, W - 2 * B, H - 2 * B);
    ctx.fillStyle = rgba(th.plaq, th.light ? 0.5 : 0.25);
    const bo = { amp: 7.5, wl: 30, w: 1.1, alpha: 0.95 };
    braid(ctx, th, B, 31 * u, W - B, 31 * u, { ...bo, ph: t * 1.2 });
    braid(ctx, th, B, H - 31 * u, W - B, H - 31 * u, { ...bo, ph: -t * 1.2, shift: 0.3 });
    braid(ctx, th, 31 * u, B, 31 * u, H - B, { ...bo, ph: -t * 1.2, shift: 0.6 });
    braid(ctx, th, W - 31 * u, B, W - 31 * u, H - B, { ...bo, ph: t * 1.2, shift: 0.15 });
    const mc = rgba(th.ink, 0.72);
    micro(ctx, th, "DREAMCUT  APPROVED BY YOU  NOTHING LANDS WITHOUT YOUR OK", B + 6 * u, B + 11 * u, W - B - 6 * u, B + 11 * u, 9 * u, t * 18 * u, mc);
    micro(ctx, th, "SERIES 2026  PAYABLE ON APPROVAL  GUILLOCHE EDITION", W - B - 6 * u, H - B - 3 * u, B + 6 * u, H - B - 3 * u, 9 * u, -t * 18 * u, mc);
    ctx.restore();
    const cr = 100 * u;
    for (const [cx, cy, k] of [[0, 0, 0], [W, 0, 1], [0, H, 2], [W, H, 3]]) {
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, cr * 0.98, 0, TAU); ctx.fillStyle = rgba(th.plaq, th.light ? 0.82 : 0.7); ctx.fill();
      ctx.restore();
      hypo(ctx, th, cx, cy, cr, { n: 5 + k, K: 11, t: t + k, alpha: 0.95, w: 0.95, shift: k * 0.22, rot: t * 0.25 * (k % 2 ? 1 : -1), inner: 0.15 });
      lace(ctx, th, cx, cy, cr * 0.7, { rings: 3, m: 14 + k, t, alpha: 0.7, shift: k * 0.22 });
      ctx.save(); ctx.strokeStyle = rgba(th.ink, 0.85); ctx.lineWidth = 1.6 * u; ctx.beginPath(); ctx.arc(cx, cy, cr, 0, TAU); ctx.stroke(); ctx.restore();
    }
    txt(ctx, th, serial(t, 0), B + 14 * u, H - 15 * u, 21 * u, { font: "mono", color: th.accS, weight: 700 });
    txt(ctx, th, serial(t, 3).replace("No.", "Nº"), W - B - 14 * u, 15 * u + 12 * u, 21 * u, { font: "mono", color: th.accS, weight: 700, align: "right" });
  }

  // A slanted UV pass: hidden print and a brighter watermark show inside the moving band.
  function uvPass(ctx, th, t, anchor) {
    const { W, H, u } = th, per = 5.6, f = (((t + 1.2) % per) / per);
    const bw = W * 0.16, cx = lerp(-bw, W + bw, f), tilt = H * 0.28;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - bw + tilt, 0); ctx.lineTo(cx + bw + tilt, 0); ctx.lineTo(cx + bw - tilt, H); ctx.lineTo(cx - bw - tilt, H); ctx.closePath();
    ctx.clip();
    const g = ctx.createLinearGradient(cx - bw, 0, cx + bw, 0);
    const wcol = th.light ? [255, 255, 255] : [160, 220, 255];
    g.addColorStop(0, rgba(wcol, 0)); g.addColorStop(0.5, rgba(wcol, th.light ? 0.4 : 0.14)); g.addColorStop(1, rgba(wcol, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    hypo(ctx, th, anchor[0], anchor[1], anchor[2] * 1.04, { n: 9, K: 22, t: t * 1.5, alpha: 1, w: 1.8, shift: t * 0.1, rot: t * 0.06 });
    for (let y = 40 * u, i = 0; y < H; y += 62 * u, i++) micro(ctx, th, "HIDDEN PRINT  DREAMCUT  VERIFIED", 0, y, W, y, 24 * u, (i % 2 ? 1 : -1) * t * 90 * u, rgba(th.acc, 0.2));
    ctx.restore();
  }

  // Plate geometry for the statement scenes and the headline banner.
  function plateRect(th, kind) {
    const { W, H, u, tall } = th, side = (tall ? 90 : 140) * u, x = Math.max(62 * u, side - 50 * u);
    if (kind === "big") return tall ? { x, y: H * 0.25, w: W - 2 * x, h: H * 0.5 } : { x, y: H * 0.2, w: W - 2 * x, h: H * 0.6 };
    const top = (tall ? 170 : 96) * u - 30 * u;
    return { x, y: top, w: W - 2 * x, h: (tall ? 270 : 190) * u };
  }

  let SCENE_ANCHOR = [0, 0, 0];
  function stage(ctx, S, info) {
    const th = theme(S), { W, H, u } = th, t = info.t;
    const paper = Boolean(S.paint);
    const hold = Math.max(0.01, info.hold || 1), chg = Math.max(0.01, info.change || 0.45);
    const wp = (info.index || 0) + (info.next ? eio((info.local - (hold - chg)) / chg) : 0);
    const i0 = Math.floor(wp), fr = eio(wp - i0);
    const A0 = ANCH[i0 % ANCH.length], A1 = ANCH[(i0 + 1) % ANCH.length];
    const R0 = Math.min(W, H) * 0.5;
    const anchor = [lerp(A0[0], A1[0], fr) * W, lerp(A0[1], A1[1], fr) * H, R0];
    SCENE_ANCHOR = anchor;
    const B = 52 * u;
    if (paper) {
      paperFinish(ctx, th);
      mesh(ctx, th, t, wp, { x: B, y: B, w: W - 2 * B, h: H - 2 * B });
      // The watermark: a large counter-rotating pair that glides from one station to the next.
      ctx.save();
      ctx.beginPath(); ctx.rect(B, B, W - 2 * B, H - 2 * B); ctx.clip();
      hypo(ctx, th, anchor[0], anchor[1], R0 * 1.02, { n: 9, K: 22, t: t * 0.8, alpha: 0.4, w: 1.1, shift: t * 0.03, rot: t * 0.06 });
      lace(ctx, th, anchor[0], anchor[1], R0 * 0.9, { rings: 6, m: 26, t, alpha: 0.38, shift: 0.4 + t * 0.03, speed: 0.35 });
      hypo(ctx, th, W - anchor[0], H - anchor[1] * 0.55, R0 * 0.55, { n: 6, K: 14, t: -t * 0.7, alpha: 0.28, shift: 0.6, rot: -t * 0.08 });
      ctx.restore();
      uvPass(ctx, th, t, anchor);
      border(ctx, th, t);
    }
    // Plate: a large cartouche for the title and closing, a banner for every other headline.
    const scene = info.scene;
    const big = (s) => s === "title" || s === "closing" || !s;
    const kind = big(scene) ? "big" : "banner";
    let prevKind = kind;
    const ctl = (window.__dreamcut && window.__dreamcut.controls) || {};
    if (kind === "banner" && info.index === 1 && Number(ctl.title_hold ?? 2.4) > 0) prevKind = "big";
    if (scene === "closing" && info.index > 0) prevKind = "banner";
    const m = prevKind === kind ? 1 : eio(info.local / chg);
    const ra = plateRect(th, prevKind), rb = plateRect(th, kind);
    const r = { x: lerp(ra.x, rb.x, m), y: lerp(ra.y, rb.y, m), w: lerp(ra.w, rb.w, m), h: lerp(ra.h, rb.h, m) };
    const bigness = seg(r.h, 260 * u, 500 * u);
    plaque(ctx, th, r.x, r.y, r.w, r.h, { alpha: lerp(0.93, 0.9, bigness), t, shift: t * 0.03 });
    if (bigness > 0.02) {
      ctx.save(); ctx.globalAlpha = bigness;
      ctx.beginPath(); ctx.rect(r.x + 26 * u, r.y + 26 * u, r.w - 52 * u, r.h - 52 * u); ctx.clip();
      const rc = [r.x + r.w * 0.8, r.y + r.h / 2, r.h * 0.46];
      hypo(ctx, th, rc[0], rc[1], rc[2], { n: 7, K: 30, t: t * 0.9, alpha: 0.95, w: 1.1, shift: t * 0.04, rot: t * 0.1, inner: 0.12 });
      lace(ctx, th, rc[0], rc[1], rc[2] * 0.95, { rings: 6, m: 24, t, alpha: 0.8, shift: 0.5, speed: 0.5 });
      hypo(ctx, th, r.x + r.w * 0.14, r.y + r.h * 0.5, r.h * 0.34, { n: 5, K: 22, t: -t * 0.8, alpha: 0.5, w: 1, shift: 0.5 + t * 0.03, rot: -t * 0.12, inner: 0.12 });
      lace(ctx, th, r.x + r.w * 0.5, r.y + r.h * 0.5, r.h * 0.9, { rings: 5, m: 30, t, alpha: 0.28, shift: 0.2, speed: 0.3 });
      ctx.restore();
    }
    if (bigness < 0.98) {
      ctx.save(); ctx.globalAlpha = 1 - bigness;
      const mr = r.h * 0.34, mx = r.x + r.w - mr - 40 * u, my = r.y + r.h / 2;
      ctx.beginPath(); ctx.rect(r.x + 26 * u, r.y + 26 * u, r.w - 52 * u, r.h - 52 * u); ctx.clip();
      hypo(ctx, th, mx, my, mr, { n: 7, K: 14, t: t * 1.2, alpha: 0.55, w: 1, shift: t * 0.05, rot: t * 0.2 });
      lace(ctx, th, mx - mr * 1.9, my, mr * 0.7, { rings: 3, m: 16, t, alpha: 0.4, shift: 0.5 });
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    // Inside the cartouche: a serial number and a ticker of fine print along the lower rule.
    if (bigness > 0.3) {
      ctx.save(); ctx.globalAlpha = seg(bigness, 0.3, 0.9);
      txt(ctx, th, serial(t, 1), r.x + r.w - 40 * u, r.y + 62 * u, 26 * u, { font: "mono", color: th.accS, weight: 700, align: "right" });
      micro(ctx, th, "THIS NOTE IS VOID WITHOUT YOUR APPROVAL", r.x + 40 * u, r.y + r.h - 34 * u, r.x + r.w - 40 * u, r.y + r.h - 34 * u, 11 * u, t * 24 * u, rgba(th.ink, 0.7));
      ctx.restore();
    }
    // Closing stamp: thuds down onto the plate and keeps turning.
    if (scene === "closing") {
      const q = seg(info.local, 0.55, 0.95);
      if (q > 0) seal(ctx, th, r.x + r.w - 150 * u, r.y + 6 * u, 128 * u, { label: "APPROVED BY YOU", t, scale: lerp(1.7, 1, back(q)), rot: lerp(-0.6, -0.12, eo(q)), col: th.accS, glyph: "OK", glyphSize: 54 * u, disc: 0.34, n: 7, shift: 0.1 });
    }
    // The title's own seal sits at the corner of the cartouche.
    if (scene === "title") seal(ctx, th, r.x + 86 * u, r.y + r.h - 20 * u, 84 * u, { label: "FIRST EDITION", t, col: th.inkS, n: 5, dir: -1 });
  }

  // ---- scene wrapper: arrival, the ribbon wipe, exit ----------------------------------------------
  function band(ctx, th, X, bw, t) {
    const { H, u } = th;
    ctx.save();
    ctx.translate(X, 0);
    ctx.shadowColor = rgba(th.ink, 0.35); ctx.shadowBlur = 24 * u;
    ctx.fillStyle = rgba(th.plaq, 1); ctx.fillRect(-bw / 2, 0, bw, H);
    ctx.shadowColor = "transparent";
    ctx.save(); ctx.beginPath(); ctx.rect(-bw / 2, 0, bw, H); ctx.clip();
    ctx.fillStyle = irisGrad(ctx, th, 0, H, t * 300 * u, 0.92, true); ctx.fillRect(-bw / 2, 0, bw, H);
    for (let k = 0; k < 5; k++) braid(ctx, th, -bw / 2 + (k + 0.5) * (bw / 5), 0, -bw / 2 + (k + 0.5) * (bw / 5), H, { amp: 11, wl: 90, ph: t * 8 + k, strands: 2, color: rgba(th.plaq, 0.8), w: 1.3 });
    ctx.restore();
    ctx.strokeStyle = rgba(th.ink, 0.95); ctx.lineWidth = 2.4 * u;
    ctx.beginPath(); ctx.moveTo(-bw / 2, 0); ctx.lineTo(-bw / 2, H); ctx.moveTo(bw / 2, 0); ctx.lineTo(bw / 2, H); ctx.stroke();
    ctx.restore();
  }
  function wrap(fn) {
    return (ctx, S, box, p, d, info) => {
      const th = theme(S), { W, H, u } = th;
      const outgoing = info.exit != null;
      const chg = Math.max(0.01, info.change), bw = 120 * u;
      let X = null;
      if (outgoing) X = lerp(-bw, W + bw, eio(info.exit));
      else if (info.local < chg) X = lerp(-bw, W + bw, eio(info.local / chg));
      const q = outgoing ? 1 : seg(info.local, 0, Math.max(0.9, info.hold * 0.5));
      ctx.save();
      if (X != null) { ctx.beginPath(); if (outgoing) ctx.rect(X + bw * 0.5, 0, W, H); else ctx.rect(0, 0, X - bw * 0.5, H); ctx.clip(); }
      fn(ctx, S, th, box, q, d, info);
      ctx.restore();
      if (!outgoing && X != null) band(ctx, th, X, bw, info.t);
    };
  }

  // ---- scenes -------------------------------------------------------------------------------------
  function chartScene(ctx, S, th, box, q, d, info) {
    const { u } = th, t = info.t, loc = info.local, FMT = window.DreamcutMotion.formatNumber;
    const n = d.values.length, max = Math.max(...d.values, 1);
    plaque(ctx, th, box.x, box.y, box.w, box.h, { alpha: 0.88, t });
    const ix = box.x + 34 * u, iw = box.w - 68 * u, iy = box.y + 30 * u, ih = box.h - 60 * u;
    const y0 = box.y + box.h - 100 * u;
    ctx.save();
    ctx.beginPath(); ctx.rect(ix, iy, iw, ih); ctx.clip();
    hypo(ctx, th, ix + iw * 0.5, iy + ih * 0.5, ih * 0.66, { n: 9, K: 18, t: t * 0.5, alpha: 0.3, rot: t * 0.05, shift: t * 0.04 });
    const rules = 6;
    for (let i = 0; i < rules; i++) {
      const y = y0 - (i * (y0 - iy - 150 * u)) / (rules - 1), w = iw * eo(seg(q, i * 0.03, 0.35 + i * 0.03));
      ctx.strokeStyle = rgba(th.ink, i ? 0.22 : 0.0); ctx.lineWidth = 1 * u; ctx.beginPath(); ctx.moveTo(ix, y); ctx.lineTo(ix + w, y); ctx.stroke();
      ctx.beginPath(); for (let k = 0; k < 8 && i; k++) { ctx.moveTo(ix + (k * iw) / 8, y - 4 * u); ctx.lineTo(ix + (k * iw) / 8, y + 4 * u); } ctx.stroke();
    }
    ctx.restore();
    // Baseline cord with a bead that travels along it through the hold.
    braid(ctx, th, ix, y0, ix + iw * eo(seg(q, 0, 0.3)), y0, { amp: 5, wl: 26, ph: -t * 2.5, w: 1.3, shift: t * 0.05 });
    const bead = ((loc * 0.28) % 1) * iw;
    ctx.save(); ctx.fillStyle = th.accS; ctx.beginPath(); ctx.arc(ix + bead, y0, 6 * u, 0, TAU); ctx.fill(); ctx.restore();
    const gap = iw * 0.07, bw = (iw - gap * (n + 1)) / n, maxH = y0 - iy - 175 * u;
    for (let i = 0; i < n; i++) {
      const qi = stg(q, i, n, 0.55), x = ix + gap + i * (bw + gap), h = maxH * (d.values[i] / max) * qi, top = y0 - h;
      const hot = i === d.highlight;
      if (h > 2 * u) {
        ctx.save();
        chamfer(ctx, x, top, bw, h, 8 * u);
        ctx.fillStyle = rgba(th.plaq, 0.97); ctx.fill(); ctx.clip();
        const g = ctx.createLinearGradient(x, top, x + bw, y0);
        if (hot) { g.addColorStop(0, rgba(th.acc, 0.95)); g.addColorStop(1, rgba(mix(th.acc, th.ink, 0.45), 0.95)); }
        else { g.addColorStop(0, rgba(irisAt(th, i * 0.19 + t * 0.04), 0.95)); g.addColorStop(1, rgba(irisAt(th, i * 0.19 + 0.35 + t * 0.04), 0.95)); }
        waveFill(ctx, x, top, bw, h, { sp: 6.5 * u, amp: 5 * u, wl: 64 * u, ph: t * 2.2 + i, color: g, w: 1.25 * u, cross: true });
        const sh = (t * 0.42 + i * 0.09) % 1.6;
        const sg = ctx.createLinearGradient(x + (sh - 0.3) * bw * 1.6, top, x + (sh + 0.1) * bw * 1.6, top + h * 0.5);
        sg.addColorStop(0, "rgba(255,255,255,0)"); sg.addColorStop(0.5, `rgba(255,255,255,${th.light ? 0.5 : 0.25})`); sg.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = sg; ctx.fillRect(x, top, bw, h);
        if (h > bw * 0.85) {
          const mcx = x + bw / 2, mcy = top + bw * 0.5, mr = bw * 0.34;
          ctx.beginPath(); ctx.arc(mcx, mcy, mr * 1.05, 0, TAU); ctx.fillStyle = rgba(th.plaq, 0.97); ctx.fill();
          hypo(ctx, th, mcx, mcy, mr, { n: 5 + (i % 4), K: 10, t: t + i, alpha: 1, w: 1, shift: i * 0.2, rot: t * 0.3 * (i % 2 ? 1 : -1), mono: hot });
          ctx.beginPath(); ctx.arc(mcx, mcy, mr * 1.05, 0, TAU); ctx.strokeStyle = rgba(th.ink, 0.9); ctx.lineWidth = 1.6 * u; ctx.stroke();
        }
        ctx.restore();
        ctx.save();
        chamfer(ctx, x, top, bw, h, 8 * u); ctx.strokeStyle = rgba(th.ink, 0.95); ctx.lineWidth = 2.4 * u; ctx.stroke();
        chamfer(ctx, x + 6 * u, top + 6 * u, bw - 12 * u, Math.max(2, h - 12 * u), 4 * u); ctx.strokeStyle = rgba(th.plaq, 0.75); ctx.lineWidth = 1.2 * u; ctx.stroke();
        ctx.restore();
      }
      if (qi > 0.05) {
        const s = bw + gap * 0.7 > 300 * u ? 96 * u : Math.max(72 * u, (bw + gap * 0.7) / 3.2);
        txt(ctx, th, FMT(d.values[i] * qi, 0, d.prefix, d.suffix), x + bw / 2, top - 24 * u, s, { font: "fig", align: "center", color: hot ? th.accS : th.inkS, halo: 14, alpha: seg(qi, 0.05, 0.4) });
        txt(ctx, th, d.labels[i] || "", x + bw / 2, y0 + 62 * u, 44 * u, { align: "center", color: th.mutedS, alpha: seg(qi, 0.2, 0.6) });
      }
    }
  }

  function objectScene(ctx, S, th, box, q, d, info) {
    const { u, tall } = th, t = info.t, loc = info.local;
    const phone = d.kind === "phone";
    plaque(ctx, th, box.x, box.y, box.w, box.h, { alpha: 0.78, t });
    ctx.save(); ctx.beginPath(); ctx.rect(box.x + 24 * u, box.y + 24 * u, box.w - 48 * u, box.h - 48 * u); ctx.clip();
    hypo(ctx, th, box.x + box.w * (tall ? 0.5 : 0.3), box.y + box.h * (tall ? 0.3 : 0.5), box.h * (tall ? 0.34 : 0.56), { n: 11, K: 18, t: t * 0.6, alpha: 0.28, rot: t * 0.06, shift: 0.2 + t * 0.03 });
    ctx.restore();
    const zone = tall ? { x: box.x, y: box.y, w: box.w, h: box.h * 0.6 } : { x: box.x, y: box.y, w: box.w * 0.6, h: box.h };
    let dw = phone ? Math.min(zone.w * 0.42, zone.h * 0.5) : Math.min(zone.w * 0.86, zone.h * 1.25);
    let dh = phone ? dw * 1.9 : dw * 0.62;
    if (!phone && dh > zone.h * 0.78) { dh = zone.h * 0.78; dw = dh / 0.62; }
    if (phone && dh > zone.h * 0.9) { dh = zone.h * 0.9; dw = dh / 1.9; }
    const baseH = phone ? 0 : dh * 0.1;
    const dx = zone.x + (zone.w - dw) / 2, dy = zone.y + (zone.h - dh - baseH) / 2;
    const qd = eo(seg(q, 0, 0.45));
    ctx.save();
    ctx.globalAlpha = clamp(qd * 2.5);
    ctx.translate(0, (1 - qd) * 26 * u);
    plaque(ctx, th, dx, dy, dw, dh, { c: phone ? 30 * u : 14 * u, alpha: 0.99, braid: false, lw: 3, shadow: 26 });
    const pad = (phone ? 22 : 24) * u, sx = dx + pad, sy = dy + pad, sw = dw - pad * 2, sh = dh - pad * 2;
    ctx.save();
    chamfer(ctx, sx, sy, sw, sh, 8 * u); ctx.clip();
    ctx.fillStyle = rgba(th.plaq, 1); ctx.fillRect(sx, sy, sw, sh);
    waveFill(ctx, sx, sy, sw, sh, { sp: 9 * u, amp: 6 * u, wl: 120 * u, ph: t * 1.4, color: irisGrad(ctx, th, 0, th.W, t * 60 * u, 0.3), w: 1 * u, cross: true });
    // The preview window: a woven rosette turning in its frame.
    const pv = { x: sx + sw * 0.07, y: sy + sh * 0.07, w: sw * 0.86, h: sh * 0.46 };
    ctx.fillStyle = rgba(th.plaq, 0.95); ctx.fillRect(pv.x, pv.y, pv.w, pv.h);
    ctx.save(); ctx.beginPath(); ctx.rect(pv.x, pv.y, pv.w, pv.h); ctx.clip();
    const pr = Math.min(pv.w, pv.h) * 0.52;
    hypo(ctx, th, pv.x + pv.w / 2, pv.y + pv.h / 2, pr, { n: 7, K: 16, t: t * 1.3, alpha: 1, w: 1, shift: t * 0.08, rot: t * 0.3 });
    lace(ctx, th, pv.x + pv.w / 2, pv.y + pv.h / 2, pr * 0.66, { rings: 3, m: 18, t, alpha: 0.7, shift: 0.5 });
    ctx.restore();
    ctx.strokeStyle = rgba(th.ink, 0.9); ctx.lineWidth = 1.8 * u; ctx.strokeRect(pv.x, pv.y, pv.w, pv.h);
    // Three tracks of woven clips; the playhead sweeps back and forth.
    const tracks = [[[0.07, 0.32], [0.43, 0.22], [0.69, 0.24]], [[0.07, 0.2], [0.3, 0.36], [0.7, 0.23]], [[0.14, 0.4], [0.58, 0.35]]];
    const th0 = sy + sh * 0.6, trh = sh * 0.095, trg = sh * 0.04;
    tracks.forEach((row, ti) => row.forEach(([cx0, cw], ci) => {
      const shown = clamp((qd * 1.6 - 0.35 - ci * 0.12 - ti * 0.08) * 3);
      if (shown <= 0) return;
      const x = sx + sw * cx0, w = sw * cw * shown, y = th0 + ti * (trh + trg);
      ctx.save(); chamfer(ctx, x, y, w, trh, 3 * u); ctx.clip();
      ctx.fillStyle = rgba(th.plaq, 1); ctx.fillRect(x, y, w, trh);
      const hot = ti === 0 && ci === 1;
      waveFill(ctx, x, y, w, trh, { sp: 4 * u, amp: 2.6 * u, wl: 30 * u, ph: t * 3 + ci, color: hot ? rgba(th.acc, 0.95) : rgba(irisAt(th, ti * 0.3 + ci * 0.17), 0.95), w: 1 * u, cross: true });
      ctx.restore();
      chamfer(ctx, x, y, w, trh, 3 * u); ctx.strokeStyle = rgba(th.ink, 0.8); ctx.lineWidth = 1.4 * u; ctx.stroke();
    }));
    const px = sx + sw * (0.08 + 0.84 * ping(loc * 0.16));
    ctx.strokeStyle = th.accS; ctx.lineWidth = 2.6 * u; ctx.beginPath(); ctx.moveTo(px, pv.y + pv.h + 6 * u); ctx.lineTo(px, sy + sh - 8 * u); ctx.stroke();
    ctx.fillStyle = th.accS; ctx.beginPath(); ctx.moveTo(px - 9 * u, pv.y + pv.h + 4 * u); ctx.lineTo(px + 9 * u, pv.y + pv.h + 4 * u); ctx.lineTo(px, pv.y + pv.h + 20 * u); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = rgba(th.ink, 0.85); ctx.lineWidth = 1.4 * u; chamfer(ctx, sx, sy, sw, sh, 8 * u); ctx.stroke();
    if (!phone) {
      const by = dy + dh;
      ctx.beginPath(); ctx.moveTo(dx - dw * 0.07, by + baseH); ctx.lineTo(dx + dw * 1.07, by + baseH); ctx.lineTo(dx + dw, by); ctx.lineTo(dx, by); ctx.closePath();
      ctx.fillStyle = rgba(th.plaq, 1); ctx.fill();
      ctx.save(); ctx.clip();
      waveFill(ctx, dx - dw * 0.07, by, dw * 1.14, baseH, { sp: 5 * u, amp: 1.6 * u, wl: 60 * u, ph: -t * 2, color: rgba(th.ink, 0.32), w: 0.9 * u });
      ctx.restore();
      ctx.strokeStyle = rgba(th.ink, 0.95); ctx.lineWidth = 2.4 * u; ctx.stroke();
      micro(ctx, th, "DREAMCUT  PROPOSAL CARD  REVIEW BEFORE APPLY", dx + dw * 0.1, by + baseH * 0.62, dx + dw * 0.9, by + baseH * 0.62, 9 * u, t * 20 * u, rgba(th.ink, 0.75));
    }
    ctx.restore();
    // Callouts: braided leaders to numbered tags. A tag and its words arrive together.
    const anchors = tall
      ? [[pv.x + pv.w * 0.16, pv.y + pv.h * 0.55], [sx + sw * 0.52, th0 + trh * 0.5], [sx + sw * 0.8, th0 + (trh + trg) * 2 + trh * 0.5]]
      : [[pv.x + pv.w * 0.72, pv.y + pv.h * 0.3], [sx + sw * 0.52, th0 + trh * 0.5], [sx + sw * 0.28, th0 + (trh + trg) * 2 + trh * 0.5]];
    const labelX = tall ? box.x + 96 * u : box.x + box.w * 0.66, availW = tall ? box.w - 170 * u : box.w * 0.34 - 46 * u;
    d.callouts.forEach((label, i) => {
      const c = stg(q, i, 3, 0.5), ly = tall ? box.y + box.h * (0.7 + 0.13 * i) : box.y + box.h * (0.2 + 0.3 * i);
      if (c <= 0 || !label) return;
      const [ax, ay] = anchors[i];
      const ex = labelX - 26 * u;
      const lo = { amp: 2.8, wl: 15, ph: -t * 4, w: 1.3, color: rgba(th.acc, 0.95) };
      if (tall) {
        const l1 = Math.abs(ly - ay), l2 = Math.abs(ax - ex), f1 = clamp((c * (l1 + l2)) / l1), f2 = clamp((c * (l1 + l2) - l1) / l2);
        braid(ctx, th, ax, ay, ax, lerp(ay, ly, f1), lo);
        if (f2 > 0) braid(ctx, th, ax, ly, lerp(ax, ex, f2), ly, lo);
      } else braid(ctx, th, ax, ay, lerp(ax, ex, c), lerp(ay, ly, c), lo);
      const pulse = 1 + 0.28 * Math.sin(t * 4 + i * 2);
      ctx.save(); ctx.fillStyle = th.accS; ctx.beginPath(); ctx.arc(ax, ay, 9 * u * pulse, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgba(th.plaq, 1); ctx.lineWidth = 2 * u; ctx.stroke(); ctx.restore();
      const ta = seg(c, 0.7, 1);
      if (ta > 0) {
        let size = 44 * u; while (size > 36 * u && tw(ctx, th, label, size) + size * 1.2 + 70 * u > availW) size -= 2 * u;
        ctx.save(); ctx.globalAlpha = ta;
        const w = tw(ctx, th, label, size) + size * 1.2, cx = labelX + 56 * u + w / 2;
        seal(ctx, th, labelX + 2 * u, ly, 30 * u, { t: t + i, label: "", glyph: String(i + 1), glyphSize: 30 * u, disc: 0.82, col: th.accS, n: 5 + i });
        tag(ctx, th, cx, ly, label, size);
        ctx.restore();
      }
    });
  }

  function figureOval(ctx, th, cx, cy, rx, ry, i, hot, t, q) {
    const u = th.u;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.fillStyle = rgba(th.plaq, 0.98); ctx.fill();
    ctx.save(); ctx.clip();
    spokes(ctx, th, 0, 0, rx * 0.3, Math.max(rx, ry) * 1.1, { n: 80, t, alpha: hot ? 0.45 : 0.3, color: hot ? rgba(th.acc, 0.5) : undefined, rot: t * 0.05 });
    ctx.translate(0, Math.sin(t * 1.7 + i) * 3 * u + (1 - q) * ry * 0.4);
    const col = hot ? th.accS : th.inkS;
    const hr = rx * 0.3, hy = -ry * 0.14;
    const body = new Path2D();
    body.arc(0, hy, hr, 0, TAU);
    body.moveTo(rx * 0.8, ry * 1.2); body.lineTo(rx * 0.8, ry * 0.7); body.quadraticCurveTo(rx * 0.7, ry * 0.3, rx * 0.16, ry * 0.26);
    body.lineTo(-rx * 0.16, ry * 0.26); body.quadraticCurveTo(-rx * 0.7, ry * 0.3, -rx * 0.8, ry * 0.7); body.lineTo(-rx * 0.8, ry * 1.2); body.closePath();
    body.rect(-rx * 0.13, hy + hr * 0.7, rx * 0.26, ry * 0.3);
    ctx.save(); ctx.clip(body);
    waveFill(ctx, -rx, -ry, rx * 2, ry * 2.4, { sp: 3.4 * u, amp: 1.7 * u, wl: 26 * u, ph: t * 1.6 + i, color: col, w: 1 * u });
    ctx.restore();
    ctx.strokeStyle = col; ctx.lineWidth = 1.8 * u; ctx.stroke(body);
    // Four original characters: swept hair, round glasses, a beanie, a headset.
    const v = i % 4;
    ctx.fillStyle = col; ctx.strokeStyle = rgba(th.plaq, 1); ctx.lineWidth = 2.4 * u;
    if (v === 0) { ctx.beginPath(); ctx.arc(0, hy, hr * 1.06, Math.PI * 1.02, TAU * 1.0 - 0.1); ctx.quadraticCurveTo(hr * 0.3, hy - hr * 0.2, -hr * 0.9, hy + hr * 0.1); ctx.closePath(); ctx.fill(); }
    if (v === 1) { ctx.lineWidth = 3 * u; ctx.strokeStyle = rgba(th.plaq, 1); for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * hr * 0.42, hy + hr * 0.05, hr * 0.3, 0, TAU); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(-hr * 0.12, hy + hr * 0.05); ctx.lineTo(hr * 0.12, hy + hr * 0.05); ctx.stroke(); }
    if (v === 2) { ctx.beginPath(); ctx.arc(0, hy - hr * 0.1, hr * 1.1, Math.PI, TAU); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.arc(0, hy - hr * 1.2, hr * 0.2, 0, TAU); ctx.fill(); ctx.strokeStyle = rgba(th.plaq, 1); ctx.beginPath(); ctx.moveTo(-hr * 1.05, hy - hr * 0.05); ctx.lineTo(hr * 1.05, hy - hr * 0.05); ctx.stroke(); }
    if (v === 3) { ctx.lineWidth = 4 * u; ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(0, hy, hr * 1.14, Math.PI * 1.05, TAU * 0.99); ctx.stroke(); ctx.fillRect(hr * 1.0, hy - hr * 0.15, hr * 0.28, hr * 0.6); ctx.fillRect(-hr * 1.28, hy - hr * 0.15, hr * 0.28, hr * 0.6); }
    ctx.restore();
    // A sheen passes across the cameo.
    const s = (t * 0.33 + i * 0.17) % 1.5 - 0.25;
    const g = ctx.createLinearGradient(rx * (s * 2 - 1.3), -ry, rx * (s * 2 - 0.3), ry);
    g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, `rgba(255,255,255,${th.light ? 0.4 : 0.18})`); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(-rx, -ry, rx * 2, ry * 2);
    ctx.restore();
    ctx.restore();
  }

  function peopleScene(ctx, S, th, box, q, d, info) {
    const { u, tall } = th, t = info.t;
    plaque(ctx, th, box.x, box.y, box.w, box.h, { alpha: 0.7, t });
    box = { x: box.x + 36 * u, y: box.y + 36 * u, w: box.w - 72 * u, h: box.h - 72 * u };
    const n = clamp(Math.round(d.count), 2, 6), cols = tall ? (n <= 2 ? 1 : 2) : n, rows = Math.ceil(n / cols);
    const cw = box.w / cols, chh = box.h / rows;
    const ry = Math.min(cw * 0.46, (chh - 130 * u) / 2), rx = ry / 1.28;
    const hotI = Math.min(n - 1, d.highlight);
    // A long rule under the row, drawn on.
    ctx.save();
    ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
    for (let r = 0; r < rows; r++) {
      const yy = box.y + chh * r + chh - 14 * u;
      braid(ctx, th, box.x, yy, box.x + box.w * eo(seg(q, 0, 0.4)), yy, { amp: 4.5, wl: 24, ph: -t * 2, w: 1.2, shift: t * 0.05 + r * 0.2 });
    }
    ctx.restore();
    for (let i = 0; i < n; i++) {
      const qi = stg(q, i, n, 0.5), col = i % cols, row = Math.floor(i / cols), hot = i === hotI;
      const cx = box.x + cw * (col + 0.5), cy = box.y + chh * row + 20 * u + ry, rr = hot ? 1.06 : 1;
      if (qi <= 0) continue;
      ctx.save();
      ctx.globalAlpha = clamp(qi * 2);
      ctx.translate(cx, cy); ctx.scale(lerp(0.88, 1, qi) * rr, lerp(0.88, 1, qi) * rr); ctx.translate(-cx, -cy);
      // Halo: a woven rosette turning behind the cameo, and a ring of beads around the frame.
      hypo(ctx, th, cx, cy, ry * 1.2, { n: 7 + (i % 3) * 2, K: 20, t: t * 0.8 + i, alpha: hot ? 1 : 0.8, w: 1, shift: i * 0.18 + t * 0.03, rot: t * 0.14 * (i % 2 ? 1 : -1), mono: false });
      ctx.fillStyle = rgba(th.plaq, 0.99); ctx.beginPath(); ctx.ellipse(cx, cy, rx * 1.12, ry * 1.08, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = rgba(th.ink, 0.85);
      for (let b = 0; b < 44; b++) { const a = (b / 44) * TAU + t * 0.12 * (i % 2 ? -1 : 1); ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rx * 1.08, cy + Math.sin(a) * ry * 1.04, 2.6 * u, 0, TAU); ctx.fill(); }
      figureOval(ctx, th, cx, cy, rx, ry, i, hot, t, qi);
      ctx.strokeStyle = rgba(hot ? th.acc : th.ink, 0.95); ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.stroke();
      ctx.lineWidth = 1 * u; ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.93, ry * 0.93, 0, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx, cy, rx * 1.15, ry * 1.11, 0, 0, TAU); ctx.stroke();
      if (hot) seal(ctx, th, cx + rx * 0.82, cy + ry * 0.74, Math.max(48 * u, rx * 0.46), { label: "APPROVED", t, col: th.accS, n: 6, shift: 0.2, dir: -1, scale: lerp(1.6, 1, back(seg(qi, 0.5, 1))) });
      ctx.restore();
      const label = d.badges[i % d.badges.length];
      if (qi > 0.7 && label) {
        let size = 44 * u; while (size > 36 * u && tw(ctx, th, label, size) + size * 1.2 > cw * 0.96) size -= 2 * u;
        ctx.save(); ctx.globalAlpha = seg(qi, 0.7, 1);
        tag(ctx, th, cx, cy + ry + 56 * u, label, size, { col: hot ? th.accS : undefined, color: hot ? th.accS : undefined });
        ctx.restore();
      }
    }
  }

  function stampPath(ctx, x, y, w, h, s) {
    const nx = Math.max(3, Math.round(w / s)), ny = Math.max(3, Math.round(h / s)), sx = w / nx, sy = h / ny, r = Math.min(sx, sy) * 0.27;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let i = 0; i < nx; i++) { ctx.lineTo(x + i * sx + sx / 2 - r, y); ctx.arc(x + i * sx + sx / 2, y, r, Math.PI, 0, true); ctx.lineTo(x + (i + 1) * sx, y); }
    for (let j = 0; j < ny; j++) { ctx.lineTo(x + w, y + j * sy + sy / 2 - r); ctx.arc(x + w, y + j * sy + sy / 2, r, -Math.PI / 2, Math.PI / 2, true); ctx.lineTo(x + w, y + (j + 1) * sy); }
    for (let i = nx - 1; i >= 0; i--) { ctx.lineTo(x + i * sx + sx / 2 + r, y + h); ctx.arc(x + i * sx + sx / 2, y + h, r, 0, Math.PI, true); ctx.lineTo(x + i * sx, y + h); }
    for (let j = ny - 1; j >= 0; j--) { ctx.lineTo(x, y + j * sy + sy / 2 + r); ctx.arc(x, y + j * sy + sy / 2, r, Math.PI / 2, -Math.PI / 2, true); ctx.lineTo(x, y + j * sy); }
    ctx.closePath();
  }

  function processScene(ctx, S, th, box, q, d, info) {
    const { u, tall } = th, t = info.t, loc = info.local;
    const n = d.steps.length, gap = (tall ? 120 : 96) * u;
    const cw = tall ? box.w : (box.w - gap * (n - 1)) / n;
    const ch = tall ? (box.h - gap * (n - 1)) / n : Math.min(box.h, cw * 1.12);
    const cells = d.steps.map((_, i) => ({ x: tall ? box.x : box.x + i * (cw + gap), y: tall ? box.y + i * (ch + gap) : box.y + (box.h - ch) / 2 }));
    // Conveyors between the stamps, drawn on, with light packets running along them.
    for (let i = 0; i < n - 1; i++) {
      const a = cells[i], b = cells[i + 1], c = stg(q, i + 0.6, n, 0.6);
      const p0 = tall ? [a.x + cw / 2, a.y + ch + 4 * u] : [a.x + cw + 4 * u, a.y + ch / 2], p1 = tall ? [b.x + cw / 2, b.y - 4 * u] : [b.x - 4 * u, b.y + ch / 2];
      if (c <= 0) continue;
      const e = [lerp(p0[0], p1[0], c), lerp(p0[1], p1[1], c)];
      braid(ctx, th, p0[0], p0[1], e[0], e[1], { amp: 10, wl: 38, ph: -t * 3, w: 1.5, shift: i * 0.25 + t * 0.05 });
      if (c > 0.95) {
        const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
        ctx.save(); ctx.translate(p1[0], p1[1]); ctx.rotate(ang); ctx.strokeStyle = th.accS; ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.moveTo(-18 * u, -14 * u); ctx.lineTo(0, 0); ctx.lineTo(-18 * u, 14 * u); ctx.stroke(); ctx.restore();
        for (let k = 0; k < 2; k++) {
          const s = ((loc * 0.45 + k * 0.5 + i * 0.2) % 1);
          const px = lerp(p0[0], p1[0], s), py = lerp(p0[1], p1[1], s);
          const g = ctx.createRadialGradient(px, py, 0, px, py, 20 * u);
          g.addColorStop(0, rgba(th.plaq, 1)); g.addColorStop(0.3, rgba(th.acc, 0.95)); g.addColorStop(1, rgba(th.acc, 0));
          ctx.fillStyle = g; ctx.fillRect(px - 20 * u, py - 20 * u, 40 * u, 40 * u);
        }
      }
    }
    for (let i = 0; i < n; i++) {
      const qi = stg(q, i, n, 0.6), { x, y } = cells[i], last = i === n - 1;
      if (qi <= 0) continue;
      ctx.save();
      ctx.globalAlpha = clamp(qi * 2.5);
      ctx.translate(0, (1 - qi) * 40 * u);
      stampPath(ctx, x, y, cw, ch, 22 * u);
      ctx.shadowColor = rgba(th.ink, 0.25); ctx.shadowBlur = 20 * u; ctx.shadowOffsetY = 8 * u;
      ctx.fillStyle = rgba(th.plaq, 0.97); ctx.fill(); ctx.shadowColor = "transparent";
      ctx.strokeStyle = rgba(last ? th.acc : th.ink, 0.95); ctx.lineWidth = 2 * u; ctx.stroke();
      const ix = x + 26 * u, iy = y + 26 * u, iw = cw - 52 * u, ih = ch - 52 * u;
      ctx.lineWidth = 1 * u; ctx.strokeRect(ix, iy, iw, ih);
      const mr = tall ? Math.min(ih * 0.4, iw * 0.2) : Math.min(iw * 0.34, ih * 0.3);
      const mcx = tall ? ix + mr + 24 * u : x + cw / 2, mcy = tall ? y + ch / 2 : y + ch * 0.4;
      ctx.save(); ctx.beginPath(); ctx.rect(ix, iy, iw, ih); ctx.clip();
      hypo(ctx, th, mcx, mcy, mr * 1.5, { n: 5 + i * 2, K: 18, t: t * 1.1 + i, alpha: 0.42, w: 1, shift: i * 0.27, rot: t * 0.16 * (i % 2 ? 1 : -1) });
      ctx.restore();
      ctx.beginPath(); ctx.arc(mcx, mcy, mr * 1.02, 0, TAU); ctx.fillStyle = rgba(th.plaq, 0.99); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(mcx, mcy, mr * 1.0, 0, TAU); ctx.clip();
      hypo(ctx, th, mcx, mcy, mr, { n: 5 + i * 2, K: 26, inner: 0.1, t: t * 1.4 + i, alpha: 1, w: 1, shift: i * 0.27 + t * 0.05, rot: t * 0.3 * (i % 2 ? -1 : 1), mono: last });
      lace(ctx, th, mcx, mcy, mr * 0.55, { rings: 3, m: 12 + i * 2, t, alpha: 0.9, shift: i * 0.27 });
      ctx.restore();
      ctx.beginPath(); ctx.arc(mcx, mcy, mr * 1.02, 0, TAU); ctx.strokeStyle = rgba(last ? th.acc : th.ink, 0.95); ctx.lineWidth = 2.2 * u; ctx.stroke();
      {
        const rx0 = tall ? mcx + mr + 40 * u : ix + 14 * u, rw = tall ? ix + iw - 14 * u - rx0 : iw - 28 * u;
        const ry0 = tall ? y + ch / 2 + 52 * u : y + ch * 0.4 + mr * 1.02 + 22 * u, rh = 20 * u;
        ctx.save(); chamfer(ctx, rx0, ry0, rw, rh, 5 * u); ctx.clip();
        waveFill(ctx, rx0, ry0, rw, rh, { sp: 3.6 * u, amp: 3 * u, wl: 36 * u, ph: t * 3 + i, color: irisGrad(ctx, th, ix, 500 * u, t * 60 * u + i * 90 * u, 0.9), w: 1.1 * u, cross: true });
        ctx.restore();
        chamfer(ctx, rx0, ry0, rw, rh, 5 * u); ctx.strokeStyle = rgba(th.ink, 0.8); ctx.lineWidth = 1.4 * u; ctx.stroke();
      }
      txt(ctx, th, String(i + 1).padStart(2, "0"), ix + 12 * u, iy + 62 * u, 54 * u, { font: "fig", color: th.accS, halo: 10 });
      let size = 46 * u; const avail = tall ? iw - mr * 2 - 80 * u : iw - 16 * u;
      while (size > 36 * u && tw(ctx, th, d.steps[i], size, { weight: 700 }) > avail) size -= 2 * u;
      const lx = tall ? mcx + mr + 40 * u : x + cw / 2, ly = tall ? y + ch / 2 : y + ch - 64 * u;
      txt(ctx, th, d.steps[i], lx, ly, size, { align: tall ? "left" : "center", weight: 700, base: "middle", halo: 12 });
      ctx.restore();
      if (last && qi > 0.8) {
        const sq = seg(qi, 0.8, 1) * seg(q, 0.7, 1);
        if (sq > 0) seal(ctx, th, x + cw - 56 * u, y + 56 * u, 62 * u, { label: "PASSED", t, col: th.accS, n: 5, scale: lerp(1.7, 1, back(sq)), rot: lerp(-0.5, 0.14, eo(sq)), glyph: "✓", glyphSize: 46 * u, disc: 0.4 });
      }
    }
  }

  function compareScene(ctx, S, th, box, q, d, info) {
    const { u, tall } = th, t = info.t, FMT = window.DreamcutMotion.formatNumber;
    const gap = (tall ? 150 : 70) * u;
    const cw = tall ? box.w : (box.w - gap) / 2, ch = tall ? (box.h - gap) / 2 : box.h * 0.94;
    const mx = Math.max(d.leftValue, d.rightValue, 1);
    const cards = [[d.left, d.leftValue, false], [d.right, d.rightValue, true]];
    cards.forEach(([label, value, hot], i) => {
      const qi = stg(q, i, 2, 0.4);
      if (qi <= 0) return;
      const x = tall ? box.x : box.x + i * (cw + gap), y = tall ? box.y + i * (ch + gap) : box.y + (box.h - ch) / 2;
      ctx.save();
      ctx.globalAlpha = clamp(qi * 2.5); ctx.translate(0, (1 - qi) * 36 * u);
      plaque(ctx, th, x, y, cw, ch, { alpha: 0.94, col: hot ? th.acc : th.ink, t, shift: i * 0.4 });
      ctx.save(); ctx.beginPath(); ctx.rect(x + 28 * u, y + 28 * u, cw - 56 * u, ch - 56 * u); ctx.clip();
      const rx = x + cw / 2, ry = y + ch * 0.5;
      hypo(ctx, th, rx, ry, Math.min(cw, ch) * 0.52, { n: hot ? 8 : 6, K: 28, inner: 0.1, t: t * 0.9 + i, alpha: 0.6, w: 1, shift: i * 0.45 + t * 0.03, rot: t * 0.1 * (hot ? 1 : -1), mono: !hot });
      lace(ctx, th, rx, ry, Math.min(cw, ch) * 0.5, { rings: 5, m: 22, t, alpha: 0.45, shift: i * 0.45, mono: !hot });
      ctx.restore();
      txt(ctx, th, label, x + cw / 2, y + 86 * u, 46 * u, { align: "center", weight: 700, color: hot ? th.accS : th.inkS, halo: 12 });
      const vs = Math.min(tall ? 140 : 160, ch * 0.3 / u) * u;
      txt(ctx, th, FMT(value * qi, 0, d.prefix, d.suffix), x + cw / 2, y + ch * 0.58, vs, { font: "fig", align: "center", color: hot ? th.accS : th.inkS, halo: 16 });
      const mw0 = cw - 120 * u, mh = 28 * u, mx0 = x + 60 * u, my0 = y + ch - 78 * u;
      chamfer(ctx, mx0, my0, mw0, mh, 6 * u); ctx.fillStyle = rgba(th.plaq, 1); ctx.fill();
      const fw = mw0 * clamp(value / mx) * eo(seg(qi, 0.2, 1));
      if (fw > 2) {
        ctx.save(); chamfer(ctx, mx0, my0, fw, mh, 6 * u); ctx.clip();
        waveFill(ctx, mx0, my0, fw, mh, { sp: 4 * u, amp: 3.4 * u, wl: 34 * u, ph: t * 3 + i, color: hot ? rgba(th.acc, 0.95) : irisGrad(ctx, th, mx0, 500 * u, t * 50 * u, 0.95), w: 1.2 * u, cross: true });
        ctx.restore();
      }
      chamfer(ctx, mx0, my0, mw0, mh, 6 * u); ctx.strokeStyle = rgba(th.ink, 0.9); ctx.lineWidth = 2 * u; ctx.stroke();
      ctx.restore();
    });
    if (stg(q, 1, 2, 0.4) > 0.5 && d.leftValue > 0) {
      const pct = Math.round(((d.rightValue - d.leftValue) / d.leftValue) * 100);
      const sq = seg(q, 0.6, 0.85), R = (tall ? 90 : 138) * u;
      const sx = tall ? box.x + box.w / 2 : box.x + cw + gap / 2, sy = tall ? box.y + ch + gap / 2 : box.y + box.h * 0.2;
      if (sq > 0) seal(ctx, th, sx, sy, R, { label: pct < 0 ? "REWORK CUT" : "GAIN", t, col: th.accS, n: 7, shift: 0.1, scale: lerp(1.6, 1, back(sq)), rot: lerp(-0.5, 0.0, eo(sq)), glyph: `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%`, glyphSize: tall ? 56 * u : 76 * u, disc: 0.62, glyphColor: th.accS });
    }
  }

  return {
    bg: "#efe8d6", panel: "#f6f0e0", ink: "#173a49", muted: "rgba(23,58,73,0.74)", accent: "#c2362b", onAccent: "#fbf4e4",
    rule: "rgba(23,58,73,0.45)", track: "rgba(23,58,73,0.12)", plaque: "#f7f1e1",
    iris: ["#1f8f8a", "#3d62b8", "#8a3fa8", "#d1467c", "#e38a2b"],
    display: "'Bodoni 72', Didot, 'Bodoni MT', Georgia, 'Times New Roman', serif", displayWeight: 700, displayCase: "none", displayTracking: "-0.01em",
    body: "'Gill Sans', 'Avenir Next', 'Helvetica Neue', Arial, sans-serif", bodyWeight: 600,
    figures: "'Bodoni 72', Didot, 'Bodoni MT', Georgia, serif", radius: 10, motion: "stroke", change: "fade",
    kit: { line: 2, fill: "none", panel: "outline" },
    panelFilter: "none", panelEdge: "rgba(23,58,73,0.5)",
    palettes: {
      // Bond paper in cool blue-white; a night note in navy with gold; a one-ink grey proof.
      light: { bg: "#eef2f7", panel: "#f8fafc", ink: "#17284f", muted: "rgba(23,40,79,0.72)", accent: "#d6336c", onAccent: "#ffffff", rule: "rgba(23,40,79,0.45)", track: "rgba(23,40,79,0.1)", plaque: "#f9fbfe", iris: ["#2563eb", "#7c3aed", "#db2777", "#f59e0b", "#06b6d4"], panelEdge: "rgba(23,40,79,0.5)" },
      dark: { bg: "#0d1b26", panel: "#14293a", ink: "#efe6cf", muted: "rgba(239,230,207,0.74)", accent: "#f2b13b", onAccent: "#0d1b26", rule: "rgba(239,230,207,0.4)", track: "rgba(239,230,207,0.12)", plaque: "#13283a", iris: ["#34d1c4", "#6f8cff", "#c26bff", "#ff6fa0", "#ffc15a"], panelEdge: "rgba(239,230,207,0.5)" },
      mono: { bg: "#e9e9e5", panel: "#f3f3f0", ink: "#1f1f1f", muted: "rgba(31,31,31,0.72)", accent: "#1f1f1f", onAccent: "#f3f3f0", rule: "rgba(31,31,31,0.45)", track: "rgba(31,31,31,0.1)", plaque: "#f4f4f1", iris: ["#3a3a3a", "#7a7a7a", "#222222", "#9a9a9a", "#555555"], panelEdge: "rgba(31,31,31,0.5)" },
    },
    textShadow: () => "none",
    backdrop: (accent, texture = 1, look) => `${grain(0.07 * texture)}, ${look ? look.bg : "#efe8d6"}`,
    css: (accent, look) => `#title-scene .kicker { display: inline-block; align-self: flex-start; padding: 0.5em 0; border-top: 3px double ${look.ink}; border-bottom: 3px double ${look.ink}; letter-spacing: 0.22em; color: ${accent}; text-shadow: none; }`,
    paint: (ctx, W, H) => { ctx.clearRect(0, 0, W, H); },
    keepArt: true,
    overlap: true,
    stage,
    scenes: { chart: wrap(chartScene), object: wrap(objectScene), people: wrap(peopleScene), process: wrap(processScene), compare: wrap(compareScene) },
  };
});
