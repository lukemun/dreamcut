// Op Art: a black-and-ivory optical world. A checkerboard is warped over rolling spheres, ripple interference,
// twin lenses, flags and whirlpools; the warp morphs from one scene's shape to the next. Data lives on hard-edged
// ivory plates with accent shadows (wavy-stripe bars, ring-headed characters, a laptop whose screen is a lens,
// stations with marching chevrons, discs of drifting rings). Scenes change by an iris of concentric bands that
// sweeps out from the centre. Every frame is a pure function of time; seeded noise only.
window.DreamcutMotion.register("op-art", ({ rng }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const frac = (v) => v - Math.floor(v);
  // Item i of n in a staggered reveal. Never starts from nothing: an element is on screen from the first frame.
  const grow = (p, i, n) => 0.32 + 0.68 * eo((p - (i / Math.max(1, n)) * 0.5) / 0.5);
  // A counter that only ever climbs to its final value: whole numbers step up, never overshoot or reverse.
  const countTo = (v, q) => { q = clamp(q); if (q >= 0.999) return v; const x = v * q; return Number.isInteger(v) ? Math.min(v, Math.floor(x)) : Math.min(v, x); };
  const lumOf = (c) => { const h = String(c).replace("#", ""); const n = parseInt(h.length === 3 ? h.split("").map((x) => x + x).join("") : h.slice(0, 6), 16); return (((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) / 255; };
  const onCol = (c) => (lumOf(c) > 0.55 ? "#0a0a0c" : "#ffffff");
  const FR = { done: false };

  function theme(S) {
    const L = S.look;
    return { A: L.cellA, B: L.cellB, acc: S.accent, accOn: onCol(S.accent), tex: L.texture ?? 1, u: S.u };
  }

  // ---- the warped checkerboard --------------------------------------------------------------------
  const OUT = [0, 0];
  function bulge(x, y, bx, by, R, sgn) {
    const vx = x - bx, vy = y - by, d = Math.hypot(vx, vy);
    if (d >= R || d < 1e-6) { OUT[0] = x; OUT[1] = y; return; }
    const u = d / R;
    const r = sgn > 0 ? R * Math.sin(u * Math.PI / 2) : R * (1 - Math.cos(u * Math.PI / 2));
    OUT[0] = bx + vx * (r / d); OUT[1] = by + vy * (r / d);
  }
  const MODES = [
    // 0 rolling sphere
    (X, Y, t, Rm) => bulge(X, Y, 0.12 * Rm * Math.sin(t * 0.45), 0.08 * Rm * Math.cos(t * 0.37), Rm * (0.58 + 0.05 * Math.sin(t * 0.8)), 1),
    // 1 ripple interference from two drifting sources
    (X, Y, t, Rm, cell) => {
      let ox = 0, oy = 0;
      const k = TAU / (cell * 7.5), A = cell * 1.0;
      const src = [[-0.55 * Rm * Math.cos(t * 0.2), 0.1 * Rm], [0.55 * Rm, -0.18 * Rm * Math.sin(t * 0.3)]];
      for (let s = 0; s < 2; s++) {
        const vx = X - src[s][0], vy = Y - src[s][1], d = Math.hypot(vx, vy) || 1;
        const w = A * Math.sin(k * d - t * 2.6) * Math.exp(-d / (Rm * 1.5));
        ox += (w * vx) / d; oy += (w * vy) / d;
      }
      bulge(X + ox, Y + oy, 0, 0, Rm * 0.3, 1);
    },
    // 2 twin lenses
    (X, Y, t, Rm) => {
      bulge(X, Y, -0.5 * Rm + 0.1 * Rm * Math.sin(t * 0.5), 0.08 * Rm * Math.cos(t * 0.6), Rm * 0.46, 1);
      bulge(OUT[0], OUT[1], 0.5 * Rm + 0.08 * Rm * Math.cos(t * 0.4), -0.1 * Rm * Math.sin(t * 0.55), Rm * 0.36, 1);
    },
    // 3 flag waves
    (X, Y, t, Rm, cell) => {
      const a = 1 + 0.35 * Math.sin(t * 0.7 + X / (Rm * 0.8));
      OUT[1] = Y + cell * 1.5 * a * Math.sin(X / (cell * 5.5) + t * 1.7);
      OUT[0] = X + cell * 0.8 * Math.sin(Y / (cell * 4) - t * 1.2);
    },
    // 4 whirlpool
    (X, Y, t, Rm) => {
      const d = Math.hypot(X, Y), ang = 2.3 * Math.exp(-d / (Rm * 0.55)) * (1 + 0.3 * Math.sin(t * 0.7)) * (1 + 0.15 * Math.sin(t * 1.9));
      const c = Math.cos(ang), s = Math.sin(ang);
      OUT[0] = X * c - Y * s; OUT[1] = X * s + Y * c;
    },
    // 5 pinch (a sphere the other way round)
    (X, Y, t, Rm, cell) => {
      bulge(X, Y + cell * 0.6 * Math.sin(X / (cell * 6) + t), -0.1 * Rm * Math.cos(t * 0.4), 0.1 * Rm * Math.sin(t * 0.5), Rm * (0.62 + 0.05 * Math.sin(t * 0.9)), -1);
    },
  ];
  const MODE_OF = { title: 0, chart: 1, object: 2, people: 3, process: 4, compare: 5, closing: 0 };

  let vbuf = null;
  function field(ctx, S, th, R, cfg) {
    const u = S.u, t = cfg.t, cell = cfg.cell;
    const cx = R.x + R.w / 2, cy = R.y + R.h / 2, Rm = Math.min(R.w, R.h);
    const half = Math.ceil(Math.hypot(R.w, R.h) / 2 / cell * 1.08) + 3;
    const side = half * 2 + 2;
    if (!vbuf || vbuf.length < side * side * 2) vbuf = new Float32Array(side * side * 2);
    const sc = t * cfg.sx, si = Math.floor(sc), fx = sc - si, sd = t * cfg.sy, sj = Math.floor(sd), fy = sd - sj;
    const tilt = cfg.tilt ?? (0.12 + 0.2 * Math.sin(t * 0.25)), ct = Math.cos(tilt), st = Math.sin(tilt);
    const fa = MODES[cfg.a], fb = MODES[cfg.b], k = cfg.k || 0;
    for (let j = 0; j < side; j++) {
      for (let i = 0; i < side; i++) {
        const X0 = (i - half - fx) * cell, Y0 = (j - half - fy) * cell;
        const X = X0 * ct - Y0 * st, Y = X0 * st + Y0 * ct;
        fa(X, Y, t, Rm, cell);
        let ax = OUT[0], ay = OUT[1];
        if (k > 0) { fb(X, Y, t, Rm, cell); ax += (OUT[0] - ax) * k; ay += (OUT[1] - ay) * k; }
        const q = (j * side + i) * 2;
        vbuf[q] = cx + ax; vbuf[q + 1] = cy + ay;
      }
    }
    const dark = new Path2D(), hot = new Path2D();
    const x1 = R.x + R.w, y1 = R.y + R.h, ringW = cfg.rings ? 0.12 : 0, ringU = Rm * 0.16;
    for (let j = 0; j < side - 1; j++) {
      for (let i = 0; i < side - 1; i++) {
        if (((i - half + j - half + si + sj) & 1) !== 0) continue;
        const a = (j * side + i) * 2, b = a + 2, c = a + side * 2 + 2, d = a + side * 2;
        const ax = vbuf[a], ay = vbuf[a + 1], bx = vbuf[b], by = vbuf[b + 1], cx2 = vbuf[c], cy2 = vbuf[c + 1], dx = vbuf[d], dy = vbuf[d + 1];
        const mnx = Math.min(ax, bx, cx2, dx), mxx = Math.max(ax, bx, cx2, dx), mny = Math.min(ay, by, cy2, dy), mxy = Math.max(ay, by, cy2, dy);
        if (mxx < R.x || mnx > x1 || mxy < R.y || mny > y1) continue;
        let p = dark;
        if (ringW) {
          const q = Math.hypot((ax + cx2) / 2 - cx, (ay + cy2) / 2 - cy) / ringU - t * 0.9;
          if (frac(q) < ringW) p = hot;
        }
        p.moveTo(ax, ay); p.lineTo(bx, by); p.lineTo(cx2, cy2); p.lineTo(dx, dy); p.closePath();
      }
    }
    ctx.save();
    ctx.fillStyle = th.B; ctx.fillRect(R.x, R.y, R.w, R.h);
    if (th.tex > 0.05) {
      // Print misregistration: a faint ink ghost of the dark cells, a hair off register (no colour, so red stays for the active item).
      ctx.save(); ctx.translate(3.2 * u * th.tex, 1.6 * u * th.tex); ctx.globalAlpha *= 0.2; ctx.fillStyle = th.A; ctx.fill(dark); ctx.restore();
    }
    ctx.fillStyle = th.A; ctx.fill(dark);
    ctx.fillStyle = th.acc; ctx.fill(hot);
    ctx.restore();
  }

  // ---- drawing primitives -------------------------------------------------------------------------
  function T(ctx, S, s, x, y, size, o = {}) {
    s = String(s ?? ""); if (o.up !== false) s = s.toUpperCase();
    ctx.save();
    const fam = o.f || S.look.display, w = o.w || S.look.displayWeight;
    ctx.font = `${w} ${size}px ${fam}`;
    let z = size;
    if (o.max) { const m = ctx.measureText(s).width; if (m > o.max) { z = size * o.max / m; ctx.font = `${w} ${z}px ${fam}`; } }
    ctx.textAlign = o.a || "center"; ctx.textBaseline = "middle"; ctx.fillStyle = o.c;
    ctx.fillText(s, x, y + z * 0.04);
    ctx.restore();
    return z;
  }
  function tw(ctx, S, s, size) { ctx.save(); ctx.font = `${S.look.displayWeight} ${size}px ${S.look.display}`; const w = ctx.measureText(String(s).toUpperCase()).width; ctx.restore(); return w; }
  function plate(ctx, S, th, x, y, w, h, o = {}) {
    const u = S.u, sh = (o.sh ?? 9) * u;
    ctx.save();
    if (sh > 0) { ctx.fillStyle = o.shadow || th.acc; ctx.fillRect(x + sh, y + sh, w, h); }
    ctx.fillStyle = o.fill || th.B; ctx.fillRect(x, y, w, h);
    ctx.lineWidth = (o.bw ?? 5) * u; ctx.strokeStyle = th.A; ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }
  function ring(ctx, x, y, r) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
  // Wavy parallel stripes inside a rectangle: neighbours sway out of step, so the pattern shimmers.
  function wavy(ctx, x, y, w, h, pitch, thick, amp, wl, phase, vertical, color, shift = 0) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.strokeStyle = color; ctx.lineWidth = thick; ctx.lineJoin = "round"; ctx.beginPath();
    const len = vertical ? h : w, n = Math.ceil((vertical ? w : h) / pitch) + 3, steps = Math.max(8, Math.ceil(len / (wl / 8)));
    const off = ((shift % pitch) + pitch) % pitch;
    for (let i = -1; i < n; i++) {
      const b = i * pitch + off;
      for (let s = 0; s <= steps; s++) {
        const a = (len * s) / steps, o = amp * Math.sin((a / wl) * TAU + phase + i * 0.55);
        const px = vertical ? x + b + o : x + a, py = vertical ? y + a : y + b + o;
        if (s) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
    }
    ctx.stroke(); ctx.restore();
  }
  // Concentric rings drifting outward from (cx, cy), clipped by the caller.
  function rings(ctx, cx, cy, reach, pitch, thick, phase, color) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = thick; ctx.beginPath();
    for (let j = 0; j * pitch < reach + pitch; j++) { const r = (j + frac(phase)) * pitch; if (r > 0.5) ring(ctx, cx, cy, r); }
    ctx.stroke(); ctx.restore();
  }
  // A band of marching diagonal stripes.
  function strip(ctx, S, th, x, y, w, h, t, dir = 1, edge = true) {
    const u = S.u, pitch = 34 * u;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = th.B; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = th.A; ctx.beginPath();
    const off = frac((t * 0.9 * dir) / 1) * pitch * 2;
    for (let px = x - h - pitch * 2; px < x + w + pitch; px += pitch * 2) {
      const bx = px + off; ctx.moveTo(bx, y + h); ctx.lineTo(bx + pitch, y + h); ctx.lineTo(bx + pitch + h, y); ctx.lineTo(bx + h, y); ctx.closePath();
    }
    ctx.fill(); ctx.restore();
    if (edge) { ctx.save(); ctx.lineWidth = 4 * u; ctx.strokeStyle = th.A; ctx.strokeRect(x, y, w, h); ctx.restore(); }
  }
  // A disc of two offset ring sets: a small moire engine.
  function disc(ctx, S, th, cx, cy, r, t, k, hot) {
    const u = S.u;
    ctx.save();
    ctx.fillStyle = hot ? th.acc : th.A; ctx.beginPath(); ctx.arc(cx + 8 * u, cy + 8 * u, r, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fillStyle = th.B; ctx.fill(); ctx.clip();
    const pitch = r / 7.5;
    for (let s = 0; s < 2; s++) {
      const dir = s ? -1 : 1, ox = cx + r * 0.3 * Math.cos(t * 0.8 * dir + k), oy = cy + r * 0.3 * Math.sin(t * 0.7 * dir + k * 1.7);
      rings(ctx, ox, oy, r * 2.2, pitch, pitch * (s ? 0.28 : 0.46), t * 0.55 * dir + s * 0.5, s && hot ? th.acc : th.A);
    }
    ctx.restore();
    ctx.lineWidth = 6 * u; ctx.strokeStyle = th.A; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
  }
  // Concentric bands sweeping outward: the scene change.
  function bands(ctx, S, th, cx, cy, front, bw) {
    const n = 7;
    ctx.save();
    for (let i = 0; i < n; i++) {
      const ro = front - (bw * i) / n, ri = front - (bw * (i + 1)) / n;
      if (ro <= 0) continue;
      ctx.beginPath(); ctx.arc(cx, cy, ro, 0, TAU); if (ri > 0) ctx.arc(cx, cy, ri, 0, TAU, true);
      ctx.fillStyle = i === 2 ? th.acc : i % 2 ? th.B : th.A; ctx.fill();
    }
    ctx.restore();
  }
  function finish(ctx, S, th, t) {
    if (FR.done) return; FR.done = true;
    const tex = th.tex; if (tex <= 0) return;
    const { W, H } = S;
    ctx.save();
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, `rgba(0,0,0,${0.26 * tex})`);
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.1 * tex;
    const ox = (Math.floor(t * 12) * 53) % 192, oy = (Math.floor(t * 12) * 91) % 192;
    ctx.translate(ox, oy); ctx.fillStyle = ctx.createPattern(grainTile(), "repeat"); ctx.fillRect(-ox, -oy, W, H);
    ctx.restore();
  }
  let GRAIN = null;
  function grainTile() {
    if (GRAIN) return GRAIN;
    const c = document.createElement("canvas"); c.width = c.height = 192;
    const g = c.getContext("2d"), img = g.createImageData(192, 192), r = rng(69);
    for (let i = 0; i < img.data.length; i += 4) { const v = r() > 0.5 ? 255 : 0; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = r() * 255; }
    g.putImageData(img, 0, 0);
    return (GRAIN = c);
  }

  // ---- the stage ----------------------------------------------------------------------------------
  function stage(ctx, S, info) {
    FR.done = false;
    const th = theme(S), { W, H, u } = S, t = info.t;
    const a = MODE_OF[info.scene] ?? 0, b = info.next ? MODE_OF[info.next] ?? a : a;
    const M = Math.min(1.1, (info.hold || 2) * 0.4);
    const k = info.next && a !== b && info.hold ? eio(span(info.local, info.hold - M, info.hold)) : 0;
    ctx.save();
    field(ctx, S, th, { x: 0, y: 0, w: W, h: H }, { t, cell: Math.max(W, H) / 42, sx: 0.8, sy: 0.3, a, b, k });
    // Moire discs drifting at the edges.
    // Moire discs sit in the two free corners (top-right, bottom-left), clear of headlines, art and labels.
    const rr = (S.tall ? 78 : 104) * u;
    [[W - 14 * u, 30 * u + 14 * u], [14 * u, H - 30 * u - 14 * u]].forEach(([x, y], i) => {
      disc(ctx, S, th, x + 6 * u * Math.sin(t * 0.7 + i * 2), y + 6 * u * Math.cos(t * 0.6 + i), rr * (1 + 0.05 * Math.sin(t * 1.1 + i)), t, i * 1.9, false);
    });
    const bare = info.scene === "title" || info.scene === "closing" || !info.scene;
    if (bare) {
      // Rings of accent light swell out from the centre when no art sits on top.
      ctx.save(); ctx.lineWidth = 12 * u; ctx.lineCap = "round";
      for (let i = 0; i < 3; i++) {
        const ph = frac(t * 0.42 + i / 3);
        ctx.globalAlpha = (1 - ph) * 0.9; ctx.strokeStyle = th.acc; ctx.beginPath(); ctx.arc(W / 2, H / 2, ph * Math.hypot(W, H) * 0.5, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }
    strip(ctx, S, th, 0, 0, W, 30 * u, t, 1);
    strip(ctx, S, th, 0, H - 30 * u, W, 30 * u, t, -1);
    ctx.restore();
    if (bare && !(info.index > 0 && info.local < info.change)) finish(ctx, S, th, t);
  }

  // ---- scenes -------------------------------------------------------------------------------------
  function chart(ctx, S, th, box, p, d, t) {
    const u = S.u, n = d.values.length, mx = Math.max(...d.values, 1);
    const gap = box.w * 0.05, bw = (box.w - gap * (n + 1)) / n;
    const base = box.y + box.h - 94 * u, maxH = Math.max(60 * u, base - box.y - 190 * u);
    strip(ctx, S, th, box.x - 30 * u, base, box.w + 60 * u, 18 * u, t, 1);
    for (let i = 0; i < n; i++) {
      const q = grow(p, i, n), x = box.x + gap + i * (bw + gap), h = maxH * (d.values[i] / mx) * q, y = base - h;
      const hot = i === d.highlight;
      ctx.fillStyle = th.acc; ctx.fillRect(x + 10 * u, y + 10 * u, bw, h);
      ctx.fillStyle = hot ? th.acc : th.B; ctx.fillRect(x, y, bw, h);
      const pitch = bw / 8;
      wavy(ctx, x, y, bw, h, pitch, pitch * (hot ? 0.36 : 0.54), bw * 0.05 * (1 + i * 0.25), bw * 1.3, t * 1.5 * (i % 2 ? -1 : 1), true, th.A, t * pitch * 0.5 * (hot ? -1 : 1));
      ctx.lineWidth = 5 * u; ctx.strokeStyle = th.A; ctx.strokeRect(x, y, bw, h);
      if (hot) {
        ctx.save(); ctx.lineWidth = 7 * u; ctx.strokeStyle = th.acc;
        for (let r = 0; r < 3; r++) { const ph = frac(t * 0.8 + r / 3); ctx.globalAlpha = 1 - ph; ctx.beginPath(); ctx.arc(x + bw / 2, y, ph * bw * 0.95, Math.PI, TAU); ctx.stroke(); }
        ctx.restore();
      }
      const bob = 7 * u * Math.sin(t * 2.2 + i * 1.4);
      const ph = 112 * u, py = y - ph - 24 * u + bob;
      plate(ctx, S, th, x + bw * 0.02, py, bw * 0.96, ph, { fill: hot ? th.acc : th.B });
      T(ctx, S, M.formatNumber(countTo(d.values[i], q), 0, d.prefix, d.suffix), x + bw / 2, py + ph / 2, 100 * u, { f: S.look.figures, c: hot ? th.accOn : th.A, max: bw * 0.86, up: false });
      plate(ctx, S, th, x + bw * 0.08, base + 28 * u, bw * 0.84, 58 * u, { sh: 6, fill: th.B });
      T(ctx, S, d.labels[i] || "", x + bw / 2, base + 57 * u, 44 * u, { c: th.A, max: bw * 0.76 });
    }
  }
  const M = window.DreamcutMotion;

  function object(ctx, S, th, box, p, d, t) {
    const u = S.u, tall = S.tall, phone = d.kind === "phone";
    const o = eo(clamp(p * 3)), ls = 0.4 + 0.6 * o;
    let sw, sh, cx = box.x + box.w / 2, cy, bz = 18 * u;
    if (phone) { sh = Math.min(box.h * (tall ? 0.58 : 0.8), box.w * (tall ? 0.95 : 0.4)); sw = sh / 2.05; cy = tall ? box.y + sh / 2 + bz + 14 * u : box.y + box.h * 0.46; }
    else { sw = Math.min(box.w * (tall ? 0.78 : 0.44), box.h * (tall ? 0.5 : 1.0)); sh = sw * 0.62; cy = tall ? box.y + sh / 2 + bz + 24 * u : box.y + box.h * 0.44; }
    // device
    const screen = { x: cx - sw / 2, y: cy - sh / 2, w: sw, h: sh };
    const drawScreen = () => {
      // The screen is a cream plate with its own optics: a preview strip with a playhead on top, then the
      // current cut (concentric rings) on the left and the proposed change (a tight rippling grid) on the right,
      // split by a striped divider that slides a little to compare them.
      const X0 = screen.x, Y0 = screen.y;
      ctx.save(); ctx.beginPath(); ctx.rect(X0, Y0, sw, sh); ctx.clip();
      ctx.fillStyle = th.B; ctx.fillRect(X0, Y0, sw, sh);
      const topH = sh * 0.22, bodyY = Y0 + topH, bodyH = sh - topH;
      // preview strip: black band of marching frame ticks with a red playhead sweeping across
      ctx.fillStyle = th.A; ctx.fillRect(X0, Y0, sw, topH);
      const fw = sw / 9, off = frac(t * 0.6) * fw;
      ctx.fillStyle = th.B;
      for (let fx = X0 - fw + off; fx < X0 + sw; fx += fw) ctx.fillRect(fx + fw * 0.14, Y0 + topH * 0.22, fw * 0.72, topH * 0.56);
      ctx.fillStyle = th.A;
      for (let fx = X0 - fw + off; fx < X0 + sw; fx += fw) { const k = fw * 0.12; for (let j = 0; j < 3; j++) ctx.fillRect(fx + fw * 0.2 + j * fw * 0.22, Y0 + topH * 0.34, k, topH * 0.32); }
      const phx = X0 + sw * (0.5 + 0.38 * Math.sin(t * 0.9));
      ctx.fillStyle = th.acc; ctx.fillRect(phx - 5 * u, Y0, 10 * u, topH + 10 * u);
      ctx.beginPath(); ctx.moveTo(phx - 16 * u, Y0); ctx.lineTo(phx + 16 * u, Y0); ctx.lineTo(phx, Y0 + 18 * u); ctx.closePath(); ctx.fill();
      // divider position
      const dv = X0 + sw * (0.5 + 0.05 * Math.sin(t * 1.3));
      // left: current cut, concentric rings breathing outward
      ctx.save(); ctx.beginPath(); ctx.rect(X0, bodyY, dv - X0, bodyH); ctx.clip();
      const lcx = X0 + (dv - X0) * 0.5, lcy = bodyY + bodyH * 0.5;
      rings(ctx, lcx, lcy, sw * 0.6, sw / 34, sw / 34 * 0.5, t * 0.6, th.A);
      ctx.restore();
      // right: proposed change, a fine grid whose rows ripple like a moire swell
      ctx.save(); ctx.beginPath(); ctx.rect(dv, bodyY, X0 + sw - dv, bodyH); ctx.clip();
      const gp = sw / 30;
      wavy(ctx, dv, bodyY, X0 + sw - dv, bodyH, gp, gp * 0.42, gp * 0.9, sw * 0.28, t * 2.2, false, th.A, t * gp * 0.8);
      wavy(ctx, dv, bodyY, X0 + sw - dv, bodyH, gp * 1.6, gp * 0.34, gp * 0.6, sw * 0.4, -t * 1.6, true, th.A, -t * gp);
      ctx.restore();
      // divider: a black/cream striped bar with a round handle
      const dw = 14 * u;
      ctx.fillStyle = th.B; ctx.fillRect(dv - dw, bodyY, dw * 2, bodyH);
      ctx.fillStyle = th.A; ctx.fillRect(dv - dw * 0.35, bodyY, dw * 0.7, bodyH);
      ctx.lineWidth = 4 * u; ctx.strokeStyle = th.A; ctx.strokeRect(dv - dw, bodyY, dw * 2, bodyH);
      ctx.beginPath(); ctx.arc(dv, lcy, 26 * u, 0, TAU); ctx.fillStyle = th.B; ctx.fill(); ctx.lineWidth = 6 * u; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(dv - 8 * u, lcy - 11 * u); ctx.lineTo(dv - 18 * u, lcy); ctx.lineTo(dv - 8 * u, lcy + 11 * u);
      ctx.moveTo(dv + 8 * u, lcy - 11 * u); ctx.lineTo(dv + 18 * u, lcy); ctx.lineTo(dv + 8 * u, lcy + 11 * u); ctx.lineWidth = 5 * u; ctx.stroke();
      ctx.fillStyle = th.A; ctx.fillRect(X0, bodyY - 3 * u, sw, 6 * u);
      ctx.restore();
    };
    if (phone) {
      ctx.save(); ctx.translate(cx, cy + sh / 2 + bz); ctx.scale(1, ls); ctx.translate(-cx, -(cy + sh / 2 + bz));
      ctx.fillStyle = th.acc; ctx.fillRect(screen.x - bz + 10 * u, screen.y - bz + 10 * u, sw + bz * 2, sh + bz * 2);
      ctx.fillStyle = th.A; ctx.fillRect(screen.x - bz, screen.y - bz, sw + bz * 2, sh + bz * 2);
      drawScreen();
      ctx.fillStyle = th.A; ctx.fillRect(cx - sw * 0.18, screen.y, sw * 0.36, 16 * u);
      ctx.restore();
    } else {
      const hinge = cy + sh / 2 + bz;
      ctx.save(); ctx.translate(cx, hinge); ctx.scale(1, ls); ctx.translate(-cx, -hinge);
      ctx.fillStyle = th.acc; ctx.fillRect(screen.x - bz + 10 * u, screen.y - bz + 10 * u, sw + bz * 2, sh + bz * 2);
      ctx.fillStyle = th.A; ctx.fillRect(screen.x - bz, screen.y - bz, sw + bz * 2, sh + bz * 2);
      drawScreen();
      ctx.restore();
      const bx = cx - sw / 2 - bz - 60 * u, bwid = sw + bz * 2 + 120 * u;
      plate(ctx, S, th, bx, hinge, bwid, 40 * u, { sh: 10 });
      ctx.fillStyle = th.A; ctx.fillRect(cx - sw * 0.1, hinge, sw * 0.2, 14 * u);
      for (let i = 0; i < 9; i++) ctx.fillRect(bx + bwid * (0.08 + i * 0.1), hinge + 24 * u, bwid * 0.05, 5 * u);
    }
    // callouts
    // Live preview -> the playhead strip; proposed change -> the right (after) half; current cut -> the left (before) half.
    const fr = [[0.5, 0.11], [0.78, 0.6], [0.24, 0.66]];
    const list = d.callouts.map((s, i) => ({ s, i })).filter((c) => c.s);
    const size = 46 * u, ph = 74 * u;
    const devBottom = (phone ? cy + sh / 2 + bz : cy + sh / 2 + bz + 40 * u);
    list.forEach(({ s, i }, n) => {
      const c = grow(p, n, list.length);
      const pw = Math.min(tw(ctx, S, s, size) + 44 * u, box.w * (tall ? 0.9 : 0.34));
      let px, py, sx, sy;
      if (tall) { px = n % 2 ? box.x + box.w - pw : box.x; py = devBottom + 70 * u + n * (ph + 30 * u); sx = px + pw / 2; sy = py; }
      else {
        const right = n % 2 === 1;
        px = right ? box.x + box.w - pw : box.x; py = box.y + [0.1, 0.4, 0.72][n % 3] * box.h; sx = right ? px : px + pw; sy = py + ph / 2;
      }
      const ax = screen.x + (i === 0 ? 0.5 + 0.38 * Math.sin(t * 0.9) : fr[i][0]) * sw, ay = screen.y + fr[i][1] * sh;
      const ex = sx + (ax - sx) * c, ey = sy + (ay - sy) * c;
      ctx.save(); ctx.lineCap = "round"; ctx.lineWidth = 12 * u; ctx.strokeStyle = th.B; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.lineWidth = 5 * u; ctx.strokeStyle = th.A; ctx.stroke();
      ctx.lineWidth = 6 * u; ctx.strokeStyle = th.acc;
      for (let r = 0; r < 2; r++) { const f = frac(t * 0.9 + r / 2 + n * 0.3); ctx.globalAlpha = 1 - f; ctx.beginPath(); ctx.arc(ax, ay, 14 * u + f * 46 * u, 0, TAU); ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(ax, ay, 14 * u, 0, TAU); ctx.fillStyle = th.acc; ctx.fill(); ctx.lineWidth = 5 * u; ctx.strokeStyle = th.A; ctx.stroke();
      ctx.restore();
      plate(ctx, S, th, px, py, pw, ph, { fill: n === 0 ? th.acc : th.B });
      T(ctx, S, s, px + pw / 2, py + ph / 2, size, { c: n === 0 ? th.accOn : th.A, max: pw - 32 * u });
    });
  }

  function person(ctx, S, th, cx, base, r, i, hot, t, q, label) {
    const u = S.u, sc = 0.35 + 0.65 * back(q);
    const dw = r * 1.75, dh = r * 2.3, hop = hot ? Math.abs(Math.sin(t * 3.2)) * r * 0.2 : 0;
    ctx.save();
    ctx.translate(cx, base); ctx.scale(sc, sc); ctx.translate(-cx, -base - hop);
    // body
    ctx.fillStyle = th.acc; ctx.beginPath(); ctx.ellipse(cx + 9 * u, base + 9 * u, dw, dh, 0, Math.PI, TAU); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, base, dw, dh, 0, Math.PI, TAU); ctx.closePath(); ctx.fillStyle = hot ? th.acc : th.B; ctx.fill();
    ctx.save(); ctx.clip();
    const pitch = r * 0.3;
    wavy(ctx, cx - dw, base - dh, dw * 2, dh, pitch, pitch * 0.5, r * 0.16, r * 1.3, t * 1.6 + i, i % 2 === 0, th.A, t * pitch * 0.6 * (i % 2 ? 1 : -1));
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(cx, base, dw, dh, 0, Math.PI, TAU); ctx.closePath();
    ctx.lineWidth = 6 * u; ctx.strokeStyle = th.A; ctx.stroke();
    // head
    const hy = base - dh - r * 0.5;
    ctx.translate(cx, hy + r); ctx.rotate(0.07 * Math.sin(t * 1.5 + i * 1.3)); ctx.translate(-cx, -(hy + r));
    ctx.fillStyle = th.acc; ctx.beginPath(); ctx.arc(cx + 8 * u, hy + 8 * u, r, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, hy, r, 0, TAU); ctx.fillStyle = th.B; ctx.fill();
    ctx.save(); ctx.clip();
    const hp = r / 5.5;
    rings(ctx, cx + 0.24 * r * Math.cos(t * 1.1 + i), hy + 0.24 * r * Math.sin(t * 1.3 + i), r * 2.4, hp, hp * 0.52, t * 0.5 + i * 0.3, hot ? th.acc : th.A);
    rings(ctx, cx - 0.24 * r * Math.cos(t * 0.9 + i), hy - 0.2 * r * Math.sin(t * 1.1), r * 2.4, hp, hp * 0.26, -t * 0.5, th.A);
    ctx.restore();
    ctx.lineWidth = 6 * u; ctx.strokeStyle = th.A; ctx.beginPath(); ctx.arc(cx, hy, r, 0, TAU); ctx.stroke();
    // face
    const blink = frac((t + i * 1.7) / 3.1) < 0.045 ? 0.12 : 1, look = t * 0.8 + i * 2;
    for (const s of [-1, 1]) {
      const ex = cx + s * r * 0.4, ey = hy - r * 0.08, er = r * 0.25;
      ctx.beginPath(); ctx.ellipse(ex, ey, er, er * blink, 0, 0, TAU); ctx.fillStyle = th.B; ctx.fill(); ctx.lineWidth = 4 * u; ctx.strokeStyle = th.A; ctx.stroke();
      if (blink > 0.5) { ctx.beginPath(); ctx.arc(ex + Math.cos(look) * er * 0.4, ey + Math.sin(look * 1.3) * er * 0.3, er * 0.45, 0, TAU); ctx.fillStyle = th.A; ctx.fill(); }
    }
    ctx.lineCap = "round"; ctx.beginPath(); ctx.arc(cx, hy + r * 0.12, r * 0.38, Math.PI * 0.18, Math.PI * 0.82); ctx.lineWidth = 14 * u; ctx.strokeStyle = th.B; ctx.stroke();
    ctx.lineWidth = 6 * u; ctx.strokeStyle = th.A; ctx.stroke();
    ctx.restore();
  }

  function people(ctx, S, th, box, p, d, t) {
    const u = S.u, n = Math.max(2, Math.min(6, Math.round(d.count)));
    const two = S.tall && n > 3, cols = two ? Math.ceil(n / 2) : n, rows = two ? 2 : 1;
    const cw = box.w / cols, chh = box.h / rows;
    const r = Math.min(cw * 0.3, (chh - 150 * u) / 3.9);
    for (let k = 0; k < n; k++) {
      const row = two ? (k < cols ? 0 : 1) : 0, col = two ? (row ? k - cols : k) : k;
      const rowCount = two ? (row ? n - cols : cols) : n;
      const x = box.x + (box.w - rowCount * cw) / 2 + cw * (col + 0.5), base = box.y + chh * (row + 1) - 104 * u;
      if (col === 0) strip(ctx, S, th, box.x - 20 * u, base, box.w + 40 * u, 16 * u, t, row ? -1 : 1);
    }
    for (let k = 0; k < n; k++) {
      const row = two ? (k < cols ? 0 : 1) : 0, col = two ? (row ? k - cols : k) : k;
      const rowCount = two ? (row ? n - cols : cols) : n;
      const x = box.x + (box.w - rowCount * cw) / 2 + cw * (col + 0.5), base = box.y + chh * (row + 1) - 104 * u;
      const hot = k === Math.min(n - 1, d.highlight);
      person(ctx, S, th, x, base, r, k, hot, t, grow(p, k, n) > 0 ? (grow(p, k, n) - 0.32) / 0.68 : 0, "");
      const named = d.badges.filter(Boolean), label = named[k] || "";
      if (!label) continue;
      const pw = Math.min(cw * 0.94, Math.max(r * 2.6, tw(ctx, S, label, 44 * u) + 40 * u));
      plate(ctx, S, th, x - pw / 2, base + 26 * u, pw, 68 * u, { sh: 7, fill: hot ? th.acc : th.B });
      T(ctx, S, label, x, base + 60 * u, 44 * u, { c: hot ? th.accOn : th.A, max: pw - 28 * u });
    }
  }

  function chevrons(ctx, S, th, x, y, w, h, t, vertical) {
    const u = S.u, sp = 44 * u, bh = 84 * u;
    // A solid arrow: a cream bar with a hard black edge and a black head, chevrons marching inside.
    if (vertical) { x = x + w / 2 - bh / 2; w = bh; } else { y = y + h / 2 - bh / 2; h = bh; }
    const head = 34 * u;
    ctx.save();
    ctx.fillStyle = th.A; ctx.fillRect(x + 7 * u, y + 7 * u, w, h);
    ctx.fillStyle = th.B; ctx.fillRect(x, y, w, h);
    ctx.lineWidth = 6 * u; ctx.strokeStyle = th.A; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = th.A; ctx.beginPath();
    if (vertical) { ctx.moveTo(x - 18 * u, y + h); ctx.lineTo(x + w + 18 * u, y + h); ctx.lineTo(x + w / 2, y + h + head); }
    else { ctx.moveTo(x + w, y - 18 * u); ctx.lineTo(x + w, y + h + 18 * u); ctx.lineTo(x + w + head, y + h / 2); }
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.lineWidth = 13 * u; ctx.lineCap = "butt"; ctx.lineJoin = "miter"; ctx.strokeStyle = th.A; ctx.beginPath();
    const off = frac(t * 0.9) * sp;
    if (vertical) for (let py = y - sp + off; py < y + h; py += sp) { ctx.moveTo(x + w / 2 - 28 * u, py); ctx.lineTo(x + w / 2, py + 22 * u); ctx.lineTo(x + w / 2 + 28 * u, py); }
    else for (let px = x - sp + off; px < x + w; px += sp) { ctx.moveTo(px, y + h / 2 - 28 * u); ctx.lineTo(px + 22 * u, y + h / 2); ctx.lineTo(px, y + h / 2 + 28 * u); }
    ctx.stroke(); ctx.restore();
  }
  function iconRead(ctx, S, th, x, y, s, t) {
    const u = S.u, cx = x + s / 2, cy = y + s / 2, w = s * 0.42;
    const blink = frac(t / 3.2) < 0.05 ? 0.1 : 1;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, s, s); ctx.clip();
    wavy(ctx, x, y, s, s, s / 16, s / 16 * 0.2, s * 0.012, s * 0.5, t, false, th.A, t * 6 * u);
    ctx.beginPath(); ctx.moveTo(cx - w, cy); ctx.quadraticCurveTo(cx, cy - s * 0.42 * blink, cx + w, cy); ctx.quadraticCurveTo(cx, cy + s * 0.42 * blink, cx - w, cy); ctx.closePath();
    ctx.fillStyle = th.B; ctx.fill(); ctx.lineWidth = 7 * u; ctx.strokeStyle = th.A; ctx.stroke(); ctx.save(); ctx.clip();
    const ix = cx + s * 0.1 * Math.sin(t * 1.1), iy = cy + s * 0.03 * Math.sin(t * 1.7);
    ctx.beginPath(); ctx.arc(ix, iy, s * 0.22, 0, TAU); ctx.fillStyle = th.acc; ctx.fill(); ctx.clip();
    rings(ctx, ix, iy, s * 0.3, s * 0.035, s * 0.016, -t * 0.7, th.A);
    ctx.restore();
    ctx.restore();
    const sx = x + frac(t * 0.4) * s; ctx.save(); ctx.fillStyle = th.acc; ctx.globalAlpha = 0.85; ctx.fillRect(sx - 6 * u, y, 12 * u, s); ctx.restore();
  }
  // Draft: a card of fine moire lines being written on by a pencil whose barrel is drawn in rippling stripes.
  function iconDraft(ctx, S, th, x, y, s, t) {
    const u = S.u;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, s, s); ctx.clip();
    ctx.fillStyle = th.B; ctx.fillRect(x, y, s, s);
    // the card: two line sets a few degrees apart make a slow moire
    const cx0 = x + s * 0.14, cy0 = y + s * 0.2, cw = s * 0.62, ch = s * 0.62;
    ctx.fillStyle = th.A; ctx.fillRect(cx0 + 9 * u, cy0 + 9 * u, cw, ch);
    ctx.fillStyle = th.B; ctx.fillRect(cx0, cy0, cw, ch);
    ctx.save(); ctx.beginPath(); ctx.rect(cx0, cy0, cw, ch); ctx.clip();
    ctx.strokeStyle = th.A; ctx.lineWidth = s * 0.008;
    for (const [ang, ph] of [[0, 0], [0.06 * Math.sin(t * 0.8) + 0.05, t * 0.3]]) {
      ctx.save(); ctx.translate(cx0 + cw / 2, cy0 + ch / 2); ctx.rotate(ang); ctx.beginPath();
      const pt = s * 0.022, o = frac(ph) * pt;
      for (let ly = -ch; ly < ch; ly += pt) { ctx.moveTo(-cw, ly + o); ctx.lineTo(cw, ly + o); }
      ctx.stroke(); ctx.restore();
    }
    ctx.restore();
    ctx.lineWidth = 6 * u; ctx.strokeStyle = th.A; ctx.strokeRect(cx0, cy0, cw, ch);
    // the written line: a bold zigzag that draws on, then restarts
    const pr = frac(t / 2.4), rows = 3, lineY = (r) => cy0 + ch * (0.28 + r * 0.24);
    const total = pr * rows; let tipX = cx0 + cw * 0.12, tipY = lineY(0);
    ctx.lineWidth = s * 0.03; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = th.A;
    for (let r = 0; r < rows; r++) {
      const f = clamp(total - r); if (f <= 0) break;
      ctx.beginPath(); const x0 = cx0 + cw * 0.12, x1 = x0 + cw * 0.76 * f * (r === rows - 1 ? 0.6 : 1);
      for (let px = x0; px <= x1; px += s * 0.01) { const py = lineY(r) + Math.sin((px - x0) / (s * 0.025)) * s * 0.022; if (px === x0) ctx.moveTo(px, py); else ctx.lineTo(px, py); tipX = px; tipY = py; }
      ctx.stroke();
    }
    // the pencil, tip at the end of the line
    ctx.save(); ctx.translate(tipX, tipY); ctx.rotate(-0.75 + 0.05 * Math.sin(t * 5));
    const L = s * 0.62, Wd = s * 0.13, tip = s * 0.12;
    ctx.fillStyle = th.A; ctx.fillRect(tip + 8 * u, -Wd / 2 + 8 * u, L, Wd);
    ctx.beginPath(); ctx.rect(tip, -Wd / 2, L, Wd); ctx.fillStyle = th.B; ctx.fill(); ctx.save(); ctx.clip();
    wavy(ctx, tip, -Wd / 2, L, Wd, Wd / 5, Wd / 5 * 0.5, Wd * 0.06, L * 0.4, t * 3, false, th.A, t * Wd * 0.4);
    ctx.restore();
    ctx.lineWidth = 5 * u; ctx.strokeStyle = th.A; ctx.strokeRect(tip, -Wd / 2, L, Wd);
    ctx.fillStyle = th.acc; ctx.fillRect(tip + L - Wd * 0.7, -Wd / 2, Wd * 0.7, Wd); ctx.strokeRect(tip + L - Wd * 0.7, -Wd / 2, Wd * 0.7, Wd);
    ctx.beginPath(); ctx.moveTo(tip, -Wd / 2); ctx.lineTo(0, 0); ctx.lineTo(tip, Wd / 2); ctx.closePath(); ctx.fillStyle = th.B; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tip * 0.4, -Wd * 0.2); ctx.lineTo(0, 0); ctx.lineTo(tip * 0.4, Wd * 0.2); ctx.closePath(); ctx.fillStyle = th.A; ctx.fill();
    ctx.restore();
    ctx.restore();
  }
  function iconApprove(ctx, S, th, x, y, s, t) {
    const u = S.u, cx = x + s / 2, cy = y + s / 2;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, s, s); ctx.clip();
    ctx.fillStyle = th.B; ctx.fillRect(x, y, s, s);
    ctx.lineWidth = s * 0.03; ctx.strokeStyle = th.A;
    for (let r = 0; r < 4; r++) { const f = frac(t * 0.55 + r / 4); ctx.globalAlpha = 1 - f * 0.7; ctx.beginPath(); ctx.arc(cx, cy, s * 0.2 + f * s * 0.5, 0, TAU); ctx.stroke(); }
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(cx, cy, s * 0.3, 0, TAU); ctx.fillStyle = th.acc; ctx.fill(); ctx.lineWidth = 7 * u; ctx.strokeStyle = th.A; ctx.stroke();
    const pr = clamp(frac(t / 2.2) / 0.3);
    const pts = [[cx - s * 0.14, cy + s * 0.01], [cx - s * 0.04, cy + s * 0.11], [cx + s * 0.16, cy - s * 0.1]];
    ctx.lineWidth = s * 0.07; ctx.lineCap = "square"; ctx.lineJoin = "miter"; ctx.strokeStyle = th.A; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    const l1 = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]), l2 = Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]), tot = (l1 + l2) * Math.max(pr, 0.0001);
    const a1 = Math.min(1, tot / l1); ctx.lineTo(pts[0][0] + (pts[1][0] - pts[0][0]) * a1, pts[0][1] + (pts[1][1] - pts[0][1]) * a1);
    if (tot > l1) { const a2 = Math.min(1, (tot - l1) / l2); ctx.lineTo(pts[1][0] + (pts[2][0] - pts[1][0]) * a2, pts[1][1] + (pts[2][1] - pts[1][1]) * a2); }
    ctx.stroke();
    ctx.restore();
  }
  function process(ctx, S, th, box, p, d, t) {
    const u = S.u, n = d.steps.length, tall = S.tall;
    const act = Math.floor(t / 1.2) % n;
    const icons = [iconRead, iconDraft, iconApprove];
    let ts, gx, positions = [];
    if (tall) {
      const rowH = box.h / n; ts = Math.min(box.w * 0.46, rowH - 70 * u);
      for (let i = 0; i < n; i++) positions.push({ x: box.x, y: box.y + rowH * i + (rowH - ts) / 2 });
    } else {
      gx = 150 * u; ts = Math.min((box.w - gx * (n - 1)) / n, box.h - 150 * u);
      const total = ts * n + gx * (n - 1), x0 = box.x + (box.w - total) / 2, y0 = box.y + (box.h - ts - 86 * u) / 2;
      for (let i = 0; i < n; i++) positions.push({ x: x0 + i * (ts + gx), y: y0 });
    }
    positions.forEach((pos, i) => {
      if (i < n - 1) {
        const nx = positions[i + 1], c = grow(p, i, n);
        if (tall) chevrons(ctx, S, th, pos.x, pos.y + ts + 6 * u, ts, Math.max(10 * u, nx.y - pos.y - ts - 50 * u), t, true);
        else chevrons(ctx, S, th, pos.x + ts + 14 * u, pos.y, gx - 60 * u, ts, t, false);
      }
    });
    positions.forEach((pos, i) => {
      const c = grow(p, i, n), on = i === act, pulse = on ? 1 + 0.025 * Math.sin(t * 6) : 1;
      ctx.save();
      ctx.translate(pos.x + ts / 2, pos.y + ts / 2); ctx.scale(pulse * (0.8 + 0.2 * c), pulse * (0.8 + 0.2 * c)); ctx.translate(-(pos.x + ts / 2), -(pos.y + ts / 2));
      plate(ctx, S, th, pos.x, pos.y, ts, ts, { sh: on ? 16 : 9, bw: 6 });
      icons[i % 3](ctx, S, th, pos.x, pos.y, ts, t + i * 0.7);
      ctx.lineWidth = 6 * u; ctx.strokeStyle = th.A; ctx.strokeRect(pos.x, pos.y, ts, ts);
      ctx.beginPath(); ctx.arc(pos.x + 6 * u, pos.y + 6 * u, 66 * u, 0, TAU); ctx.fillStyle = on ? th.acc : th.A; ctx.fill(); ctx.lineWidth = 5 * u; ctx.strokeStyle = th.B; ctx.stroke();
      T(ctx, S, String(i + 1), pos.x + 6 * u, pos.y + 6 * u, 96 * u, { f: S.look.figures, c: on ? th.accOn : th.B, up: false });
      ctx.restore();
      // label
      const label = d.steps[i] || "";
      if (tall) {
        const lx = pos.x + ts + 36 * u, lw = box.w - ts - 36 * u;
        plate(ctx, S, th, lx, pos.y + ts / 2 - 50 * u, lw, 100 * u, { fill: on ? th.acc : th.B });
        T(ctx, S, label, lx + lw / 2, pos.y + ts / 2, 50 * u, { c: on ? th.accOn : th.A, max: lw - 30 * u });
      } else {
        plate(ctx, S, th, pos.x - 20 * u, pos.y + ts + 26 * u, ts + 40 * u, 74 * u, { fill: on ? th.acc : th.B });
        T(ctx, S, label, pos.x + ts / 2, pos.y + ts + 63 * u, 46 * u, { c: on ? th.accOn : th.A, max: ts + 8 * u });
      }
    });
  }

  function compare(ctx, S, th, box, p, d, t) {
    const u = S.u, tall = S.tall, gap = 44 * u;
    const mx = Math.max(d.leftValue, d.rightValue, 1);
    const pw = tall ? box.w : (box.w - gap) / 2, ph = tall ? (box.h - gap) / 2 : box.h * 0.97;
    const items = [[d.left, d.leftValue, false], [d.right, d.rightValue, true]];
    items.forEach(([label, value, hot], i) => {
      const x = tall ? box.x : box.x + i * (pw + gap), y = tall ? box.y + i * (ph + gap) : box.y;
      const q = grow(p, i, 2);
      plate(ctx, S, th, x, y, pw, ph, { sh: 12, bw: 6 });
      const cxx = x + pw / 2, cyy = y + ph * 0.46, Rmax = Math.min(pw * 0.36, (ph - 230 * u) / 2);
      const R = Rmax * (0.38 + 0.62 * Math.sqrt(value / mx)) * (0.55 + 0.45 * q);
      ctx.save(); ctx.fillStyle = th.acc; ctx.beginPath(); ctx.arc(cxx + 8 * u, cyy + 8 * u, R, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(cxx, cyy, R, 0, TAU); ctx.fillStyle = hot ? th.acc : th.B; ctx.fill(); ctx.clip();
      const pitch = Math.max(14 * u, R / 8);
      rings(ctx, cxx, cyy, R * 1.2, pitch, pitch * 0.5, t * (hot ? -0.6 : 0.5), th.A);
      rings(ctx, cxx + R * 0.22 * Math.cos(t * 0.9), cyy + R * 0.22 * Math.sin(t * 0.8), R * 1.4, pitch, pitch * 0.2, t * (hot ? 0.5 : -0.4), th.A);
      ctx.restore();
      ctx.lineWidth = 7 * u; ctx.strokeStyle = th.A; ctx.beginPath(); ctx.arc(cxx, cyy, R, 0, TAU); ctx.stroke();
      // Closing beat once the counters land: on the larger side, a red target ring keeps shrinking from this size
      // down to the other side's size, so the reduction plays out through the hold.
      const land = span(p, 0.8, 1), other = i ? d.leftValue : d.rightValue;
      if (land > 0 && value > other) {
        const Rt = Rmax * (0.38 + 0.62 * Math.sqrt(other / mx));
        for (let r = 0; r < 2; r++) {
          const ph = frac(t / 1.8 + r / 2), rr = R + (Rt - R) * eio(ph);
          ctx.save(); ctx.globalAlpha = land * (ph < 0.85 ? 1 : (1 - ph) / 0.15); ctx.setLineDash([22 * u, 14 * u]); ctx.lineDashOffset = -t * 60 * u;
          ctx.lineWidth = 16 * u; ctx.strokeStyle = th.B; ctx.beginPath(); ctx.arc(cxx, cyy, rr, 0, TAU); ctx.stroke();
          ctx.lineWidth = 9 * u; ctx.strokeStyle = th.acc; ctx.stroke(); ctx.restore();
        }
        ctx.save(); ctx.globalAlpha = land; ctx.lineWidth = 5 * u; ctx.strokeStyle = th.A; ctx.setLineDash([10 * u, 10 * u]); ctx.beginPath(); ctx.arc(cxx, cyy, Rt, 0, TAU); ctx.stroke(); ctx.restore();
      }
      // label tab and number
      const lw = Math.min(pw - 40 * u, tw(ctx, S, label, 46 * u) + 50 * u);
      plate(ctx, S, th, x + 20 * u, y + 20 * u, lw, 72 * u, { sh: 6, fill: hot ? th.acc : th.B });
      T(ctx, S, label, x + 20 * u + lw / 2, y + 56 * u, 46 * u, { c: hot ? th.accOn : th.A, max: lw - 24 * u });
      const nh = 150 * u, nw = Math.min(pw * 0.7, 440 * u), ny = y + ph - nh - 18 * u;
      plate(ctx, S, th, cxx - nw / 2, ny, nw, nh, { sh: 9, fill: hot ? th.A : th.B });
      T(ctx, S, M.formatNumber(countTo(value, q), 0, d.prefix, d.suffix), cxx, ny + nh / 2, 128 * u, { f: S.look.figures, c: hot ? th.B : th.A, max: nw - 30 * u, up: false });
    });
    // change badge
    const br = (tall ? 78 : 94) * u, bx = tall ? box.x + box.w - br - 24 * u : box.x + box.w / 2, by = tall ? box.y + ph + gap / 2 : box.y + box.h * 0.44;
    if (d.leftValue > 0) {
      // Ripples ring out from the badge after the counters land, with a stamp-like pop each cycle.
      const land = span(p, 0.8, 1), cyc = frac(t / 1.4);
      if (land > 0) {
        ctx.save(); ctx.lineWidth = 8 * u;
        for (let r = 0; r < 3; r++) { const ph = frac(t / 1.4 + r / 3); ctx.globalAlpha = land * (1 - ph); ctx.strokeStyle = r === 0 ? th.acc : th.A; ctx.beginPath(); ctx.arc(bx, by, br * (1.05 + ph * 1.4), 0, TAU); ctx.stroke(); }
        ctx.restore();
      }
      const pop = 1 + land * 0.12 * Math.max(0, 1 - cyc / 0.25) * Math.sin(Math.min(1, cyc / 0.25) * Math.PI);
      const pct = Math.round(((d.rightValue - d.leftValue) / d.leftValue) * 100);
      ctx.save(); ctx.translate(bx, by); ctx.rotate(Math.sin(t * 1.3) * 0.08); ctx.scale(pop * (1 + 0.04 * Math.sin(t * 3)), pop * (1 + 0.04 * Math.sin(t * 3)));
      ctx.fillStyle = th.A; ctx.beginPath(); ctx.arc(10 * u, 10 * u, br, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, br, 0, TAU); ctx.fillStyle = th.acc; ctx.fill(); ctx.lineWidth = 7 * u; ctx.strokeStyle = th.A; ctx.stroke();
      ctx.save(); ctx.clip(); rings(ctx, 0, 0, br, br / 6, br / 6 * 0.2, -t * 0.7, th.A); ctx.restore();
      ctx.fillStyle = th.acc; ctx.beginPath(); ctx.arc(0, 0, br * 0.72, 0, TAU); ctx.fill();
      T(ctx, S, (pct > 0 ? "+" : pct < 0 ? "−" : "") + Math.abs(pct) + "%", 0, 0, 66 * u, { f: S.look.figures, c: th.accOn, max: br * 1.3, up: false });
      ctx.restore();
    }
  }

  const DRAW = { chart, object, people, process, compare };
  const wrap = (id) => (ctx, S, box, p, d, info) => {
    const th = theme(S), { W, H } = S, cx = W / 2, cy = H / 2, maxR = Math.hypot(W, H) / 2, bw = maxR * 0.3;
    const exiting = info.exit !== undefined, start = info.t - info.local;
    const draw = () => DRAW[id](ctx, S, th, box, p, d, info.t);
    ctx.save();
    if (exiting) {
      const front = eo(info.exit) * (maxR + bw), rin = front - bw;
      if (rin > 0) { ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(cx, cy, rin, 0, TAU); ctx.clip("evenodd"); }
      draw(); ctx.restore();
      if (info.exit < 1) { ctx.save(); bands(ctx, S, th, cx, cy, front, bw); ctx.restore(); }
      return;
    }
    if (start > 0.01 && info.local < info.change) {
      const front = eo(info.local / Math.max(0.01, info.change)) * (maxR + bw), rin = front - bw;
      if (rin > 0) { ctx.beginPath(); ctx.arc(cx, cy, rin, 0, TAU); ctx.clip(); draw(); }
      ctx.restore(); ctx.save(); bands(ctx, S, th, cx, cy, front, bw); ctx.restore();
      FR.done = false; finish(ctx, S, th, info.t);
      return;
    }
    draw(); ctx.restore();
    finish(ctx, S, th, info.t);
  };

  const FONT_D = "'Futura-CondensedExtraBold','Futura','Avenir Next Condensed','Arial Black','Helvetica Neue',sans-serif";
  const FONT_B = "'Futura','Avenir Next','Helvetica Neue',Arial,sans-serif";
  const base = { cellA: "#0a0a0c", cellB: "#f3eee1", slab: "#f3eee1", slabInk: "#0a0a0c" };
  return {
    ...base,
    bg: "#f3eee1", panel: "#f3eee1", ink: "#0a0a0c", muted: "#4a4740", accent: "#f2362b", onAccent: "#ffffff",
    rule: "#0a0a0c", track: "rgba(10,10,12,0.12)",
    display: FONT_D, displayWeight: 800, displayCase: "uppercase", displayTracking: "0.02em",
    body: FONT_B, bodyWeight: 600, figures: FONT_D, radius: 0, motion: "wipe", change: "grid",
    kit: { line: 5, fill: "solid", panel: "fill" },
    keepArt: true, overlap: true,
    palettes: {
      // Ultramarine on warm white with an orange hit; inverted bone-on-black with cyan; plain greys.
      light: { cellA: "#10186b", cellB: "#fbfaf2", slab: "#fbfaf2", slabInk: "#10186b", bg: "#fbfaf2", panel: "#fbfaf2", ink: "#10186b", muted: "#4a4f86", accent: "#ff5a1f", onAccent: "#10186b", rule: "#10186b" },
      dark: { cellA: "#efe9d8", cellB: "#08080b", slab: "#08080b", slabInk: "#efe9d8", bg: "#08080b", panel: "#08080b", ink: "#efe9d8", muted: "#a8a496", accent: "#2ee6d6", onAccent: "#08080b", rule: "#efe9d8", track: "rgba(239,233,216,0.14)" },
      mono: { cellA: "#242424", cellB: "#e8e8e6", slab: "#e8e8e6", slabInk: "#242424", bg: "#e8e8e6", panel: "#e8e8e6", ink: "#242424", muted: "#6b6b69", accent: "#7a7a78", onAccent: "#ffffff", rule: "#242424" },
    },
    backdrop: (accent, tex, look) => look.cellB,
    // Headlines are hard-edged slabs with an accent shadow, like type on a poster.
    css: (accent, look) => `
      .display { background: ${look.slab}; color: ${look.slabInk}; text-shadow: none !important; width: fit-content !important; max-width: 100%; padding: 0.06em 0.24em 0.1em; border: 0.055em solid ${look.cellA}; box-shadow: 0.1em 0.1em 0 ${accent}; }
      .kicker { background: ${accent}; color: ${onCol(accent)}; text-shadow: none !important; width: fit-content; padding: 0.22em 0.7em; border: 4px solid ${look.cellA}; box-shadow: 6px 6px 0 ${look.cellA}; }
      .statement { align-items: flex-start; }
    `,
    stage,
    scenes: { chart: wrap("chart"), object: wrap("object"), people: wrap("people"), process: wrap("process"), compare: wrap("compare") },
  };
});
