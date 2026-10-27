// Ridgeline: everything is a stack of noisy traces. Rows of thin lines are drawn back to front and each
// row is filled with the page colour below its line, so the rows in front hide the rows behind and any
// height field (a mountain range, a pair of cliffs, a person, a plateau with a symbol cut into it) reads
// as raised contour lines. A full-frame range drifts under every scene; each scene builds its own block
// of ridges on top, and a crest of light sweeps across the frame at every change while the old block
// sinks flat and the new one rises. Every frame is a pure function of time: seeded noise only.
window.DreamcutMotion.register("ridgeline", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
  const gauss = (d) => Math.exp(-d * d);
  const fract = (v) => v - Math.floor(v);
  const SANS = "'Helvetica Neue', 'Avenir Next', Helvetica, Arial, sans-serif";
  const MONO = "'SF Mono', Menlo, Consolas, 'Courier New', monospace";
  const fmtNum = (v, d) => window.DreamcutMotion.formatNumber(v, 0, (d && d.prefix) || "", (d && d.suffix) || "");

  // ---- noise ---------------------------------------------------------------------------------------
  const NT = (() => {
    const r = rng(7717), T = new Float32Array(256), P = new Uint8Array(512), idx = [];
    for (let i = 0; i < 256; i++) { T[i] = r() * 2 - 1; idx.push(i); }
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    for (let i = 0; i < 512; i++) P[i] = idx[i & 255];
    return { T, P };
  })();
  function n2(x, y) {
    const { T, P } = NT, xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), X = xi & 255, Y = yi & 255;
    const a = T[P[P[X] + Y]], b = T[P[P[X + 1] + Y]], c = T[P[P[X] + Y + 1]], d = T[P[P[X + 1] + Y + 1]];
    const top = a + (b - a) * sx, bot = c + (d - c) * sx;
    return top + (bot - top) * sy;
  }
  const fbm = (x, y) => 0.58 * n2(x, y) + 0.28 * n2(x * 2.03 + 7.1, y * 2.03 + 3.3) + 0.14 * n2(x * 4.1 + 1.7, y * 4.1 + 9.2);

  // ---- theme ---------------------------------------------------------------------------------------
  function theme(S) {
    const L = S.look;
    return {
      S, u: S.u, W: S.W, H: S.H, tall: S.tall, solid: Boolean(S.paint), tex: L.texture ?? 1, light: Boolean(L.light),
      ink: (a) => hexA(L.ink, a), muted: (a) => hexA(L.muted, a), acc: (a) => hexA(S.accent, a), bg: (a) => hexA(L.bg, a),
      inkHex: L.ink, accHex: S.accent, bgHex: L.bg,
    };
  }

  // ---- the ridge renderer ----------------------------------------------------------------------------
  // Rows run back (top) to front (bottom). `lift(u, v, i, px, py)` is the height in pixels of row i at
  // fraction u along it. Each row is filled with the page colour below its line, so front rows hide back rows.
  function edgeGrad(ctx, x, w, color, feather) {
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    if (feather <= 0) { g.addColorStop(0, color(1)); g.addColorStop(1, color(1)); return g; }
    g.addColorStop(0, color(0)); g.addColorStop(feather, color(1)); g.addColorStop(1 - feather, color(1)); g.addColorStop(1, color(0));
    return g;
  }
  let FA = 1; // fill strength for the scene being drawn; the stage resets it
  function ridge(ctx, th, o) {
    const { x, y, w, h, rows, n, lift } = o, u = th.u;
    const lw = (o.lw || 2) * u, bottom = y + h + (o.pad ?? 3 * u), feather = o.feather ?? 0.07;
    const alpha = o.alpha ?? 1, fillAlpha = (o.fillAlpha ?? FA) * (th.solid ? 1 : 0.86);
    const inkG = edgeGrad(ctx, x, w, th.ink, feather), accG = edgeGrad(ctx, x, w, th.acc, feather);
    const fillG = edgeGrad(ctx, x, w, (a) => th.bg(a * fillAlpha), feather);
    const ys = new Float32Array(n);
    ctx.save();
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    for (let i = 0; i < rows; i++) {
      const v = rows > 1 ? i / (rows - 1) : 1, by = y + h * v;
      const path = new Path2D();
      for (let j = 0; j < n; j++) {
        const uu = j / (n - 1), px = x + w * uu;
        ys[j] = by - lift(uu, v, i, px, by);
        if (j) path.lineTo(px, ys[j]); else path.moveTo(px, ys[j]);
      }
      if (fillAlpha > 0.01) {
        const f = new Path2D(path);
        f.lineTo(x + w, bottom); f.lineTo(x, bottom); f.closePath();
        ctx.globalAlpha = 1; ctx.fillStyle = fillG; ctx.fill(f);
      }
      const pulse = o.pulse ? o.pulse(v, i) : 0;
      const acc = o.rowAcc ? o.rowAcc(i, v, pulse) : pulse > 0.5;
      const ra = clamp((o.rowAlpha ? o.rowAlpha(v, i) : 0.3 + 0.7 * Math.pow(v, 0.8)) + 0.45 * pulse);
      ctx.lineWidth = lw * (1 + 0.7 * pulse);
      ctx.globalAlpha = alpha * ra;
      if (acc && th.tex > 0.25 && ra > 0.5) { ctx.shadowColor = th.acc(0.8); ctx.shadowBlur = 10 * u * th.tex; }
      ctx.strokeStyle = acc ? accG : inkG;
      ctx.stroke(path);
      ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
      if (o.hot) {
        ctx.save();
        ctx.globalAlpha = alpha * Math.min(1, ra + 0.2); ctx.lineWidth = lw * 1.15;
        for (const [a0, a1] of o.hot) {
          const g = ctx.createLinearGradient(x + w * a0, 0, x + w * a1, 0), c0 = th.acc(0), c1 = th.acc(1);
          g.addColorStop(0, c0); g.addColorStop(0.3, c1); g.addColorStop(0.7, c1); g.addColorStop(1, c0);
          ctx.strokeStyle = g; ctx.stroke(path);
        }
        ctx.restore();
      }
    }
    ctx.restore();
  }
  // Travelling pulse band over the rows: moves front to back, then loops.
  const bandPulse = (t, speed, phase, width = 0.07) => (v) => gauss((v - (1 - fract(t * speed + phase))) / width);
  // Light crest that crosses the frame at a scene change.
  function crestAt(th, px, lc, change) {
    const s = span(lc, 0, Math.max(0.2, change * 1.4));
    if (s <= 0 || s >= 1) return 0;
    const sx = -th.W * 0.08 + s * th.W * 1.16, d = (px - sx) / (th.W * 0.055);
    return gauss(d) * Math.sin(s * Math.PI) ** 0.5;
  }
  const rough = (th, u, v, t, k = 1) => (0.55 + 0.45 * th.tex) * th.u * 2.1 * k * fbm(u * 38, v * 17 + t * 0.35);

  // ---- type ----------------------------------------------------------------------------------------
  function say(ctx, s, x, y, size, o = {}) {
    s = String(s ?? "");
    if (o.upper) s = s.toUpperCase();
    const q = o.q ?? 1;
    if (!s || q <= 0) return { w: 0, size };
    ctx.save();
    const fam = o.font || SANS, weight = o.weight || 500;
    const set = (px) => { ctx.font = `${weight} ${px}px ${fam}`; if ("letterSpacing" in ctx) ctx.letterSpacing = (o.track || 0) * px + "px"; };
    set(size);
    let w = ctx.measureText(s).width;
    if (o.maxW && w > o.maxW) { size = Math.max(o.min || size * 0.7, (size * o.maxW) / w); set(size); w = ctx.measureText(s).width; }
    const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    if (q < 1) { ctx.beginPath(); ctx.rect(x0 - 4, y - size * 1.3, w * q + 8, size * 2); ctx.clip(); }
    ctx.textAlign = "left"; ctx.textBaseline = o.base || "alphabetic";
    ctx.fillStyle = o.color;
    if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = 16 * (o.u || 1); }
    ctx.fillText(s, x0, y);
    ctx.restore();
    return { w, size, x0 };
  }
  // A label on a plate that hides the lines under it, with the text revealed as the plate opens.
  function tag(ctx, th, s, x, y, size, o = {}) {
    const q = o.q ?? 1;
    if (q <= 0 || !s) return 0;
    const u = th.u;
    ctx.save();
    ctx.font = `${o.weight || 500} ${size}px ${SANS}`;
    if ("letterSpacing" in ctx) ctx.letterSpacing = (o.track ?? 0.03) * size + "px";
    const padX = size * 0.55, padY = size * 0.4, pre = o.prefix ? (() => { ctx.font = `600 ${size * 0.82}px ${MONO}`; const m = ctx.measureText(o.prefix).width + size * 0.5; ctx.font = `${o.weight || 500} ${size}px ${SANS}`; return m; })() : 0;
    let tw = ctx.measureText(s).width, fs = size;
    if (o.maxW && tw + pre + padX * 2 > o.maxW) { fs = Math.max(o.min || size * 0.75, (size * (o.maxW - pre - padX * 2)) / tw); ctx.font = `${o.weight || 500} ${fs}px ${SANS}`; tw = ctx.measureText(s).width; }
    const w = tw + pre + padX * 2, hh = size + padY * 2;
    const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    const hot = o.hot;
    ctx.beginPath(); ctx.rect(x0 - 3, y - hh, w * q + 6, hh * 2); ctx.clip();
    ctx.shadowColor = th.bg(1); ctx.shadowBlur = 18 * u;
    ctx.fillStyle = th.bg(0.96); ctx.fillRect(x0, y - hh / 2, w, hh);
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.6 * u; ctx.strokeStyle = hot ? th.acc(0.95) : th.ink(0.55); ctx.strokeRect(x0, y - hh / 2, w, hh);
    ctx.fillStyle = th.acc(1); ctx.fillRect(x0, y - hh / 2, 6 * u, hh);
    ctx.textBaseline = "middle"; ctx.textAlign = "left";
    if (o.prefix) { ctx.font = `600 ${size * 0.82}px ${MONO}`; ctx.fillStyle = th.acc(1); ctx.fillText(o.prefix, x0 + padX + 4 * u, y + size * 0.03); }
    ctx.font = `${o.weight || 500} ${fs}px ${SANS}`;
    ctx.fillStyle = hot ? th.acc(1) : th.ink(1);
    ctx.fillText(s, x0 + padX + pre + 4 * u, y + size * 0.03);
    ctx.restore();
    return w;
  }
  const bigNumber = (ctx, th, s, x, y, size, o) => say(ctx, s, x, y, size, { font: MONO, weight: 600, track: -0.02, glow: o.hot ? th.acc(0.7) : null, u: th.u, ...o });
  function dashTrace(ctx, th, pts, q, color, lw, t, dash = [12, 10]) {
    if (q <= 0 || pts.length < 2) return;
    let total = 0; const seg = [];
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); total += l; }
    let left = total * q;
    ctx.save(); ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length && left > 0; i++) {
      const l = seg[i - 1], k = Math.min(1, left / l);
      ctx.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k);
      left -= l;
    }
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = "round"; ctx.setLineDash(dash.map((d) => d * th.u)); ctx.lineDashOffset = -t * 36 * th.u;
    ctx.stroke(); ctx.restore();
  }
  function ping(ctx, th, x, y, t, phase, r0 = 9, r1 = 34, color) {
    const u = th.u, k = fract(t * 0.75 + phase);
    ctx.save();
    ctx.fillStyle = color || th.acc(1); ctx.beginPath(); ctx.arc(x, y, r0 * 0.5 * u, 0, TAU); ctx.fill();
    ctx.strokeStyle = color || th.acc(1); ctx.globalAlpha *= 1 - k; ctx.lineWidth = 2 * u;
    ctx.beginPath(); ctx.arc(x, y, (r0 * 0.5 + (r1 - r0) * k) * u, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  function rrect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  // A bare traced line: a flat run with travelling bumps.
  function pulseLine(ctx, th, x0, x1, y, amp, t, seed, color, lw, q = 1, speed = 0.22) {
    if (q <= 0) return;
    const n = Math.max(24, Math.round((x1 - x0) / 5)), end = x0 + (x1 - x0) * q;
    ctx.save(); ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = "round"; ctx.lineCap = "round";
    for (let j = 0; j <= n; j++) {
      const px = x0 + ((x1 - x0) * j) / n; if (px > end) break;
      const uu = (px - x0) / (x1 - x0);
      let hgt = 0;
      for (let k = 0; k < 3; k++) hgt += gauss((uu - fract(t * speed + seed * 0.37 + k / 3)) / 0.03) * amp * (0.7 + 0.3 * k);
      hgt += amp * 0.12 * fbm(uu * 40 + seed, t * 0.5);
      if (j) ctx.lineTo(px, y - hgt); else ctx.moveTo(px, y - hgt);
    }
    ctx.stroke(); ctx.restore();
  }

  // ---- the full-frame world ----------------------------------------------------------------------------
  const MOODS = {
    title: { amp: 1.9, speed: 1, freq: 1, ce: 0.52, alpha: 1, disc: 1, dx: 0.8, dy: 0.4 },
    chart: { amp: 1, speed: 0.9, freq: 1.15, ce: 0.5, alpha: 0.85, disc: 0, dx: 0.5, dy: 0.5 },
    object: { amp: 1.1, speed: 1.1, freq: 0.9, ce: 0.3, alpha: 0.85, disc: 0, dx: 0.2, dy: 0.5 },
    people: { amp: 1, speed: 0.8, freq: 1.3, ce: 0.7, alpha: 0.85, disc: 0, dx: 0.8, dy: 0.5 },
    process: { amp: 1.1, speed: 1.2, freq: 1, ce: 0.5, alpha: 0.85, disc: 0, dx: 0.5, dy: 0.5 },
    compare: { amp: 1.05, speed: 1, freq: 1.1, ce: 0.4, alpha: 0.85, disc: 0, dx: 0.5, dy: 0.5 },
    closing: { amp: 2, speed: 0.8, freq: 0.8, ce: 0.5, alpha: 1, disc: 1, dx: 0.5, dy: 0.36 },
  };
  const HEADS = { title: ["kicker", "title"], chart: ["chart-title"], object: ["object-title"], people: ["people-title"], process: ["process-title"], compare: ["compare-title"], closing: ["closing"] };
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"], DEFAULT_HOLD = [2.4, 3.4, 3.6, 3.2, 3.6, 3.2, 2.4];
  function shownIds() {
    const c = (window.__dreamcut && window.__dreamcut.controls) || {};
    return ORDER.filter((id, i) => Number(c[id + "_hold"] ?? DEFAULT_HOLD[i]) > 0);
  }
  function moodAt(info) {
    const ids = shownIds(), cur = MOODS[info.scene] || MOODS.chart, prev = MOODS[ids[info.index - 1]];
    if (!prev) return cur;
    const k = eo(span(info.local, 0, 0.9)), out = {};
    for (const key of Object.keys(cur)) out[key] = lerp(prev[key], cur[key], k);
    return out;
  }
  let MOTES = null;
  function motes(ctx, th, t, sp) {
    if (!MOTES) { const r = rng(31); MOTES = Array.from({ length: 90 }, () => ({ x: r(), y: r(), s: 0.4 + r(), ph: r() * TAU, z: 0.6 + r() })); }
    const { W, H, u } = th;
    ctx.save();
    for (const m of MOTES) {
      const y = ((m.y - t * 0.012 * m.s * sp) % 1 + 1) % 1, x = (m.x + Math.sin(t * 0.3 * m.s + m.ph) * 0.01) % 1;
      ctx.globalAlpha = (0.12 + 0.28 * (0.5 + 0.5 * Math.sin(t * 1.3 + m.ph))) * (th.light ? 0.7 : 1);
      ctx.fillStyle = th.ink(1);
      ctx.fillRect(x * W, y * H, 2 * u * m.z, 2 * u * m.z);
    }
    ctx.restore();
  }
  function field(ctx, th, info, mood) {
    const { W, H, u, t = info.t } = th, T = info.t;
    const sp = mood.speed, A0 = H * 0.115, amp = mood.amp, rows = th.tall ? 84 : 72, n = th.tall ? 110 : 180;
    const lc = info.index > 0 ? info.local : 99, change = info.change;
    const dcx = W * mood.dx, dcy = H * (mood.dy + 0.02 * Math.sin(T * 0.6)), dr = H * (th.tall ? 0.12 : 0.17);
    const y0 = H * 0.07 + Math.sin(T * 0.21) * 8 * u, hgt = H * 0.94;
    ridge(ctx, th, {
      x: -12 * u, y: y0, w: W + 24 * u, h: hgt, rows, n, feather: 0, lw: 1.7, alpha: mood.alpha,
      lift: (uu, v, i, px, py) => {
        const env = 0.2 + 0.8 * gauss((uu - mood.ce) / 0.32);
        const w = fbm(uu * 3.4 * mood.freq + i * 0.29 + T * sp * 0.32, v * 2.2 + T * 0.05 * sp);
        const pk = Math.max(0, w * 0.5 + 0.5 - 0.28) / 0.72;
        let h = amp * A0 * Math.pow(pk, 1.7) * env * (0.25 + 0.75 * v);
        for (let k = 0; k < 2; k++) if ((i + k) % 5 === 0) h += gauss((uu - fract(T * 0.05 * sp * (1 + k * 0.6) + k * 0.5 + i * 0.013)) / 0.03) * A0 * 0.32 * amp;
        if (mood.disc > 0.01) {
          const dd = Math.hypot((px - dcx) / dr, (py - dcy) / dr);
          h += mood.disc * A0 * 0.85 * (1 - smooth(0.9, 1.04, dd)) * (0.8 + 0.2 * fbm(uu * 20, i * 0.4 + T * 0.4));
        }
        h += crestAt(th, px, lc, change) * A0 * 0.9 * (0.3 + 0.7 * v);
        return h + rough(th, uu, v, T, 0.6);
      },
      pulse: bandPulse(T, 0.12 * sp, 0.3, 0.04), rowAcc: (i, v, pl) => pl > 0.8, rowAlpha: (v) => 0.22 + 0.78 * Math.pow(v, 0.9),
    });
  }

  // Positions of a headline's lines on the page, read once from the layout.
  const lineCache = {};
  function headBox(scene) {
    if (lineCache[scene]) return lineCache[scene];
    const root = document.getElementById("root");
    if (!root) return null;
    const scale = root.getBoundingClientRect().width / (Number(root.dataset.width) || 1920) || 1;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const id of HEADS[scene] || []) {
      const el = document.getElementById(id);
      if (!el || !el.firstChild) continue;
      let ox = 0, oy = 0;
      for (let nd = el; nd && nd !== root; nd = nd.offsetParent) { ox += nd.offsetLeft; oy += nd.offsetTop; }
      const er = el.getBoundingClientRect(), range = document.createRange();
      range.selectNodeContents(el);
      for (const r of range.getClientRects()) {
        if (r.width < 2) continue;
        const lx = ox + (r.left - er.left) / scale, ly = oy + (r.top - er.top) / scale;
        x0 = Math.min(x0, lx); y0 = Math.min(y0, ly); x1 = Math.max(x1, lx + r.width / scale); y1 = Math.max(y1, ly + r.height / scale);
      }
    }
    if (!isFinite(x0)) return null;
    return (lineCache[scene] = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  // The plate that holds a headline: it hides the range behind the words, with a ruled top and a travelling trace under it.
  function headPlate(ctx, th, info, big) {
    const hb = headBox(info.scene);
    if (!hb) return;
    const { u, W } = th, T = info.t;
    const fade = info.next ? 1 - span(info.local, info.hold - info.change, info.hold) : 1;
    const a = eo(span(info.local, 0, 0.3)) * fade;
    if (a <= 0.01) return;
    const padX = (big ? 52 : 40) * u, padY = (big ? 46 : 28) * u;
    const x = Math.max(24 * u, hb.x - padX), y = hb.y - padY, w = Math.min(W - 48 * u - x, hb.w + padX * 2 + 24 * u), h = hb.h + padY * 2;
    ctx.save();
    ctx.shadowColor = th.bg(a); ctx.shadowBlur = 44 * u;
    ctx.fillStyle = th.bg(0.95 * a); ctx.fillRect(x, y, w, h);
    ctx.shadowBlur = 0; ctx.globalAlpha = a;
    const q = eo(span(info.local, 0.05, 0.7));
    ctx.fillStyle = th.acc(1); ctx.fillRect(x - 14 * u, y, 7 * u, h * q);
    ctx.strokeStyle = th.ink(0.5); ctx.lineWidth = 1.5 * u;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w * q, y); ctx.stroke();
    pulseLine(ctx, th, x, x + w, y + h, (big ? 24 : 16) * u, T, 3 + info.index, th.acc(0.95), 2.2 * u, q);
    ctx.restore();
    // A small block of live traces beside a short headline.
    const ow = (big ? 420 : 340) * u, oh = (big ? 110 : 84) * u, ox = W - 140 * u * (th.tall ? 0.64 : 1) - ow;
    if (!big && !th.tall && x + w < ox - 30 * u) {
      ctx.save(); ctx.globalAlpha = a;
      ridge(ctx, th, { x: ox, y: hb.y + (hb.h - oh) * 0.5, w: ow, h: oh, rows: 9, n: 70, feather: 0.12, lw: 1.8, alpha: 1,
        lift: (uu, v, i) => oh * 0.55 * Math.pow(Math.max(0, fbm(uu * 5 + i * 0.5 + T * 0.7, v * 3 + info.index) * 0.5 + 0.5 - 0.15), 1.6) * gauss((uu - 0.5) / 0.4),
        pulse: bandPulse(T, 0.4, 0.2, 0.18) });
      ctx.restore();
    } else if (!big && th.tall) {
      ctx.save(); ctx.globalAlpha = a;
      ridge(ctx, th, { x: x, y: Math.max(40 * u, y - 100 * u), w: 360 * u, h: 62 * u, rows: 7, n: 60, feather: 0.12, lw: 1.8,
        lift: (uu, v, i) => 52 * u * Math.pow(Math.max(0, fbm(uu * 5 + i * 0.5 + T * 0.7, v * 3 + info.index) * 0.5 + 0.5 - 0.15), 1.6) * gauss((uu - 0.5) / 0.4),
        pulse: bandPulse(T, 0.4, 0.2, 0.18) });
      ctx.restore();
    }
  }

  // ---- shared scene wrapper ------------------------------------------------------------------------------
  // The outgoing scene keeps drawing through the change with `exit` 0 -> 1: it sinks flat and fades while the crest passes.
  const wrap = (fn) => (ctx, S, box, p, d, info = {}) => {
    const th = theme(S), exiting = info.exit != null, change = info.change || 0.45;
    const lc = exiting ? info.exit * change : info.local || 0;
    const V = {
      t: info.t || 0, lc, change, local: info.local || 0, exiting,
      a: exiting ? 1 - eo(span(info.exit, 0.35, 1)) : eo(span(info.local || 0, 0, Math.max(0.2, change * 0.55))),
      fl: exiting ? 1 - 0.85 * eio(span(info.exit, 0, 0.85)) : 1,
      q: (k0, k1) => eo(span(p, k0, k1)),
    };
    const pp = exiting ? 1 : clamp(p * 1.75);
    FA = exiting ? 1 - span(info.exit, 0, 0.35) : 0.1 + 0.9 * eo(span(pp, 0, 0.3));
    ctx.save();
    ctx.globalAlpha = V.a;
    fn(ctx, th, box, pp, d || {}, V);
    ctx.restore();
    FA = 1;
  };

  // ---- chart: four ranges --------------------------------------------------------------------------------
  function chartScene(ctx, th, box, p, d, V) {
    const { u } = th, t = V.t;
    const vals = (d.values || []).map((v) => Math.max(0, Number(v) || 0)), n = vals.length || 1, max = Math.max(...vals, 1);
    const hi = d.highlight >= 0 && d.highlight < n ? d.highlight : -1;
    const y1 = box.y + box.h - 72 * u, spanH = box.h * (th.tall ? 0.3 : 0.34), hmax = box.h * (th.tall ? 0.36 : 0.4);
    const qk = (k) => eo((p - k * 0.12) / 0.55);
    const sig = 0.2 / n, ucs = vals.map((_, k) => (k + 0.5) / n);
    const amps = vals.map((v, k) => hmax * (v / max) * qk(k) * V.fl * (1 + 0.03 * Math.sin(t * 1.7 + k * 1.3)));
    const rect = { x: box.x, y: y1 - spanH, w: box.w, h: spanH };
    ridge(ctx, th, {
      ...rect, rows: th.tall ? 44 : 40, n: Math.round(box.w / 6), feather: 0.05, lw: 2, alpha: V.a,
      lift: (uu, v, i, px) => {
        let h = 0;
        for (let k = 0; k < n; k++) {
          const g = gauss((uu - ucs[k]) / sig), jag = 0.78 + 0.34 * (fbm(uu * 16 + k * 3.1 + t * 0.5, i * 0.43 + t * 0.2) * 0.5 + 0.5);
          h += amps[k] * Math.pow(g, 0.85) * jag * (0.9 + 0.1 * Math.sin(i * 0.7 + k));
        }
        h += crestAt(th, px, V.lc, V.change) * spanH * 0.45 * V.fl;
        return h + rough(th, uu, v, t) * (0.4 + 0.6 * V.fl);
      },
      hot: hi >= 0 ? [[ucs[hi] - 0.5 / n * 0.62, ucs[hi] + 0.5 / n * 0.62]] : null,
      pulse: bandPulse(t, 0.17, 0.1), rowAcc: (i, v, pl) => pl > 0.62,
    });
    // trend through the tips, marching
    const tips = vals.map((v, k) => [rect.x + rect.w * ucs[k], rect.y - amps[k] * 1.02]);
    dashTrace(ctx, th, tips, eo(span(p, 0.35, 0.95)), th.acc(0.6), 2 * u, t);
    // baseline, ticks, labels, figures
    ctx.save();
    ctx.strokeStyle = th.ink(0.6); ctx.lineWidth = 1.8 * u;
    ctx.beginPath(); ctx.moveTo(box.x, y1 + 2 * u); ctx.lineTo(box.x + box.w * eo(span(p, 0, 0.3)), y1 + 2 * u); ctx.stroke();
    ctx.restore();
    vals.forEach((v, k) => {
      const cx = rect.x + rect.w * ucs[k], q = qk(k), isHot = k === hi;
      ctx.save(); ctx.strokeStyle = isHot ? th.acc(1) : th.ink(0.6); ctx.lineWidth = 1.8 * u;
      ctx.beginPath(); ctx.moveTo(cx, y1 + 2 * u); ctx.lineTo(cx, y1 + 16 * u * q); ctx.stroke(); ctx.restore();
      if (q > 0.04) {
        say(ctx, d.labels[k] || "", cx, y1 + 62 * u, 42 * u, { align: "center", color: isHot ? th.acc(1) : th.ink(0.92), q: span(q, 0.2, 0.9), maxW: (box.w / n) * 0.92, min: 36 * u, track: 0.04, weight: 500 });
        const tipY = rect.y - amps[k];
        bigNumber(ctx, th, fmtNum(v * q, d), cx, tipY - 30 * u, 100 * u, { align: "center", color: isHot ? th.acc(1) : th.ink(1), maxW: (box.w / n) * 0.9, min: 76 * u, hot: isHot, q: clamp(q * 2) });
        if (q > 0.5) ping(ctx, th, cx, tipY, t, k * 0.23, isHot ? 12 : 8, isHot ? 44 : 22, isHot ? th.acc(1) : th.ink(0.9));
      }
    });
  }

  // ---- object: a device with live traces on its screen -----------------------------------------------------
  function objectScene(ctx, th, box, p, d, V) {
    const { u, tall } = th, t = V.t, phone = d.kind === "phone";
    // A range behind everything.
    ridge(ctx, th, {
      x: box.x, y: box.y + box.h * 0.12, w: box.w, h: box.h * 0.8, rows: tall ? 52 : 44, n: Math.round(box.w / 7), feather: 0.04, lw: 1.8, alpha: V.a * 0.9,
      lift: (uu, v, i, px) => {
        const base = fbm(uu * 4.4 + i * 0.27 + t * 0.3, v * 2.4 + 1.3) * 0.5 + 0.5;
        const sides = 0.25 + 0.75 * Math.max(gauss((uu - 0.08) / 0.16), gauss((uu - 0.95) / 0.2));
        return box.h * 0.6 * eo(p * 1.6) * V.fl * Math.pow(base, 2.1) * sides * (0.25 + 0.75 * v) + crestAt(th, px, V.lc, V.change) * box.h * 0.08 * V.fl + rough(th, uu, v, t);
      },
      pulse: bandPulse(t, 0.14, 0.45, 0.05), rowAcc: (i, v, pl) => pl > 0.75, rowAlpha: (v) => 0.3 + 0.6 * v,
    });
    // The device.
    let dx, dy, dw, dh;
    if (phone) { dw = tall ? box.w * 0.38 : Math.min(box.w * 0.26, box.h * 0.46); dh = dw * 1.95; }
    else { dw = tall ? box.w * 0.92 : Math.min(box.w * 0.6, box.h * 1.12); dh = dw * 0.6; }
    if (tall) { dx = box.x + (box.w - dw) / 2; dy = box.y + 20 * u; } else { dx = box.x + box.w * (phone ? 0.2 : 0.02); dy = box.y + (box.h - dh - (phone ? 0 : dh * 0.1)) / 2; }
    const q = eo(span(p, 0, 0.35)), body = { x: dx, y: dy + (1 - q) * 30 * u, w: dw, h: dh };
    ctx.save();
    ctx.globalAlpha = V.a * clamp(q * 2);
    ctx.shadowColor = th.bg(1); ctx.shadowBlur = 30 * u;
    rrect(ctx, body.x, body.y, body.w, body.h, (phone ? 40 : 18) * u); ctx.fillStyle = th.bg(1); ctx.fill();
    ctx.shadowBlur = 0; ctx.lineWidth = 2.6 * u; ctx.strokeStyle = th.ink(0.95); ctx.stroke();
    const pad = (phone ? 20 : 22) * u, sx = body.x + pad, sy = body.y + pad, sw = body.w - pad * 2, sh = body.h - pad * 2;
    ctx.lineWidth = 1.4 * u; ctx.strokeStyle = th.ink(0.4); rrect(ctx, sx, sy, sw, sh, 8 * u); ctx.stroke();
    if (!phone) {
      ctx.beginPath(); ctx.moveTo(body.x - dw * 0.06, body.y + dh + dh * 0.055); ctx.lineTo(body.x + dw * 1.06, body.y + dh + dh * 0.055); ctx.lineTo(body.x + dw, body.y + dh); ctx.lineTo(body.x, body.y + dh); ctx.closePath();
      ctx.fillStyle = th.bg(1); ctx.fill(); ctx.lineWidth = 2.4 * u; ctx.strokeStyle = th.ink(0.9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(body.x + dw * 0.42, body.y + dh + dh * 0.025); ctx.lineTo(body.x + dw * 0.58, body.y + dh + dh * 0.025); ctx.lineWidth = 2 * u; ctx.strokeStyle = th.ink(0.55); ctx.stroke();
    }
    ctx.restore();
    // Screen: a live ridge preview over three tracks and a playhead.
    const sq = eo(span(p, 0.15, 0.55));
    const pv = { x: sx + sw * 0.07, y: sy + sh * 0.07, w: sw * 0.86, h: sh * 0.4 };
    ridge(ctx, th, {
      x: pv.x, y: pv.y + pv.h * 0.4, w: pv.w, h: pv.h * 0.6, rows: 13, n: 80, feather: 0.03, lw: 1.6, alpha: V.a * sq,
      lift: (uu, v, i) => pv.h * 0.5 * sq * V.fl * Math.pow(Math.max(0, fbm(uu * 6 + i * 0.35 - t * 0.9, v * 3) * 0.5 + 0.5 - 0.1), 1.5) * gauss((uu - 0.5) / 0.5),
      pulse: bandPulse(t, 0.5, 0.3, 0.14), rowAcc: (i, v, pl) => i >= 11,
    });
    const th0 = sh * 0.1, gap = sh * 0.045, ty0 = sy + sh * 0.56;
    const clipsRows = [[[0.07, 0.28], [0.38, 0.22], [0.64, 0.29]], [[0.12, 0.2], [0.4, 0.3], [0.74, 0.19]], [[0.07, 0.4], [0.52, 0.3]]];
    ctx.save();
    ctx.globalAlpha = V.a;
    clipsRows.forEach((row, r) => row.forEach(([cx, cw], c) => {
      const k = eo((sq - c * 0.08 - r * 0.1) * 2.4);
      if (k <= 0) return;
      const hotClip = r === 1 && c === 1;
      rrect(ctx, sx + sw * cx, ty0 + r * (th0 + gap), sw * cw * k, th0, 4 * u);
      ctx.fillStyle = hotClip ? th.acc(0.28) : th.ink(0.1); ctx.fill();
      ctx.lineWidth = 1.5 * u; ctx.strokeStyle = hotClip ? th.acc(1) : th.ink(0.7); ctx.stroke();
    }));
    const ph = sx + sw * (0.07 + 0.86 * fract(t * 0.16));
    ctx.strokeStyle = th.acc(1); ctx.lineWidth = 2.2 * u;
    ctx.beginPath(); ctx.moveTo(ph, pv.y + pv.h * 0.9); ctx.lineTo(ph, ty0 + 3 * (th0 + gap)); ctx.stroke();
    ctx.restore();
    // Callouts.
    const anchors = [[pv.x + pv.w * (0.55 + 0.04 * Math.sin(t)), pv.y + pv.h * 0.38], [sx + sw * 0.55, ty0 + (th0 + gap) + th0 / 2], [sx + sw * 0.2, ty0 + 2 * (th0 + gap) + th0 / 2]];
    const labels = d.callouts || [];
    const lx = tall ? box.x + 60 * u : box.x + box.w * 0.67, lw0 = tall ? box.w - 80 * u : box.x + box.w - lx;
    labels.forEach((label, i) => {
      const c = eo((p - 0.35 - i * 0.1) / 0.3);
      if (c <= 0 || !label) return;
      const ly = tall ? body.y + dh + 120 * u + i * 150 * u : box.y + box.h * (0.2 + i * 0.3);
      const [ax, ay] = anchors[i];
      const ex = tall ? lx - 24 * u : lx - 26 * u, ey = ly;
      const mx = tall ? ax : lerp(ax, ex, 0.45), my = tall ? ey : ay + (ey - ay) * 0.1;
      dashTrace(ctx, th, [[ax, ay], [mx, my], [ex, ey]], c, th.acc(0.95), 2.2 * u, t, [14, 8]);
      ping(ctx, th, ax, ay, t, i * 0.31, 10, 38);
      tag(ctx, th, label, lx, ly, 44 * u, { q: span(c, 0.55, 1), maxW: lw0, min: 40 * u, hot: i === 1, prefix: String(i + 1).padStart(2, "0") });
    });
  }

  // ---- people: silhouettes raised out of the range -----------------------------------------------------------
  const cap = (x, y, ax, ay, bx, by, r) => { const px = x - ax, py = y - ay, qx = bx - ax, qy = by - ay, h = clamp((px * qx + py * qy) / (qx * qx + qy * qy)); return Math.hypot(px - qx * h, py - qy * h) - r; };
  const circ = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;
  const rbox = (x, y, cx, cy, hw, hh, r) => { const qx = Math.abs(x - cx) - hw + r, qy = Math.abs(y - cy) - hh + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; };
  // Signed distance (unit height) to a person; variant picks hair, hat or headphones.
  function personSD(x, y, variant, t, wave) {
    const bob = Math.sin(t * 1.6 + variant) * 0.008, hc = 0.2 + bob;
    let sd = circ(x, y, 0, hc, 0.15);
    sd = Math.min(sd, cap(x, y, 0, hc + 0.1, 0, 0.5, 0.055));
    sd = Math.min(sd, rbox(x, y, 0, 0.84, 0.27, 0.3, 0.15));
    if (variant === 1) sd = Math.min(sd, circ(x, y, 0.05, hc - 0.14, 0.07));
    if (variant === 2) { sd = Math.min(sd, circ(x, y, -0.16, hc + 0.01, 0.055), circ(x, y, 0.16, hc + 0.01, 0.055)); if (y < hc) sd = Math.min(sd, Math.abs(circ(x, y, 0, hc, 0.175)) - 0.014); }
    if (variant === 3) sd = Math.min(sd, rbox(x, y, 0, hc - 0.13, 0.21, 0.022, 0.02), rbox(x, y, 0, hc - 0.17, 0.12, 0.055, 0.03));
    if (variant === 4) sd = Math.min(sd, rbox(x, y, 0, hc + 0.12, 0.2, 0.22, 0.1));
    if (variant === 5) sd = Math.min(sd, circ(x, y, 0, hc - 0.07, 0.15), circ(x, y, -0.2, hc + 0.1, 0.045));
    if (wave) {
      const hx = 0.4 + 0.03 * Math.sin(t * 5), hy = 0.34 + 0.02 * Math.cos(t * 5);
      sd = Math.min(sd, cap(x, y, 0.26, 0.6, hx, hy, 0.045), circ(x, y, hx, hy - 0.04, 0.06));
    }
    // Eyes cut into the head; they close for a moment on a slow loop.
    const blink = fract(t * 0.33 + variant * 0.27) > 0.93 ? 0.2 : 1;
    const eyes = Math.min(Math.hypot((x + 0.058) / 0.022, (y - hc) / (0.022 * blink)), Math.hypot((x - 0.058) / 0.022, (y - hc) / (0.022 * blink)));
    return { sd, eyes };
  }
  function peopleScene(ctx, th, box, p, d, V) {
    const { u, tall } = th, t = V.t;
    const n = Math.max(2, Math.min(6, Math.round(Number(d.count) || 3))), hot = Math.min(n - 1, d.highlight ?? 1);
    const badges = d.badges || [];
    // A wide low range behind the row.
    ridge(ctx, th, {
      x: box.x, y: box.y + box.h * 0.5, w: box.w, h: box.h * 0.42, rows: 26, n: Math.round(box.w / 8), feather: 0.04, lw: 1.6, alpha: V.a * 0.8,
      lift: (uu, v, i, px) => box.h * 0.2 * V.fl * eo(p * 1.5) * Math.pow(Math.max(0, fbm(uu * 5 + i * 0.3 + t * 0.25, v * 2) * 0.5 + 0.5 - 0.2), 1.8) + crestAt(th, px, V.lc, V.change) * box.h * 0.06 * V.fl + rough(th, uu, v, t),
      rowAlpha: (v) => 0.2 + 0.4 * v, pulse: bandPulse(t, 0.13, 0.6, 0.1),
    });
    const cols = tall && n > 3 ? 2 : n, rowsN = Math.ceil(n / cols);
    const slotW = box.w / cols, slotH = box.h / rowsN;
    for (let i = 0; i < n; i++) {
      const qi = eo((p - i * 0.07) / 0.45), col = i % cols, row = Math.floor(i / cols);
      const isHot = i === hot;
      const labelH = 100 * u;
      const figH = Math.min(slotH - labelH - 20 * u, slotW * 1.05) * (isHot ? 1.03 : 1);
      const cx = box.x + slotW * (col + 0.5), top = box.y + slotH * row + (slotH - labelH - figH) * 0.5 + 12 * u;
      const rect = { x: cx - slotW * 0.46, y: top, w: slotW * 0.92, h: figH };
      const A = figH * 0.07 * qi * V.fl;
      ridge(ctx, th, {
        ...rect, rows: Math.max(40, Math.min(64, Math.round(figH / 6.5))), n: Math.max(70, Math.round(rect.w / 3)), feather: 0.02, lw: 1.9, alpha: V.a * (0.45 + 0.55 * eo(qi * 2.5)), fillAlpha: (0.1 + 0.9 * eo(qi * 3)) * FA,
        lift: (uu, v, k, px, py) => {
          const fx = (px - cx) / figH, fy = (py - top) / figH;
          const { sd, eyes } = personSD(fx, fy, i % 6, t, isHot);
          const m = smooth(0.02, -0.02, sd) * (1 - 0.9 * (1 - smooth(0.85, 1.15, eyes)));
          const gleam = 1 + 0.5 * gauss((v - (1 - fract(t * 0.2 + i * 0.17))) / 0.06);
          return A * m * gleam + crestAt(th, px, V.lc, V.change) * figH * 0.04 * V.fl + rough(th, uu, v, t, 0.8) * (0.4 + 0.6 * m);
        },
        rowAcc: () => isHot, pulse: bandPulse(t, 0.2, i * 0.17, 0.05), rowAlpha: (v) => 0.4 + 0.6 * v,
      });
      const label = badges[i % Math.max(1, badges.length)] || "";
      if (qi > 0.55 && label) {
        const ly = top + figH + 52 * u;
        tag(ctx, th, label, cx, ly, 42 * u, { align: "center", q: span(qi, 0.55, 1), maxW: slotW * 0.96, min: 40 * u, hot: isHot });
      }
      if (isHot && qi > 0.5) ping(ctx, th, cx + figH * 0.42, top + figH * 0.3, t, 0.2, 10, 40);
    }
  }

  // ---- process: three mesas with a symbol cut in each ---------------------------------------------------------
  // A bold line symbol set on a disc over the mesa: a page being read, a spark, an eye, a check.
  function drawIcon(ctx, th, kind, cx, cy, s, color, t, q) {
    const u = th.u;
    ctx.save();
    ctx.globalAlpha *= clamp(q * 2);
    ctx.translate(cx, cy); ctx.scale(0.6 + 0.4 * q, 0.6 + 0.4 * q);
    ctx.beginPath(); ctx.arc(0, 0, s * 0.74, 0, TAU);
    ctx.shadowColor = th.bg(1); ctx.shadowBlur = 20 * u; ctx.fillStyle = th.bg(0.93); ctx.fill(); ctx.shadowBlur = 0;
    ctx.lineWidth = 2 * u; ctx.strokeStyle = th.ink(0.5); ctx.stroke();
    ctx.lineWidth = Math.max(4 * u, s * 0.075); ctx.strokeStyle = color; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath();
    if (kind === 0) {
      rrect(ctx, -s * 0.3, -s * 0.4, s * 0.6, s * 0.8, s * 0.06);
      for (let k = 0; k < 3; k++) { ctx.moveTo(-s * 0.16, -s * 0.16 + k * s * 0.2); ctx.lineTo(s * (k === 2 ? 0.02 : 0.16), -s * 0.16 + k * s * 0.2); }
      ctx.stroke();
      const sy = -s * 0.36 + fract(t * 0.6) * s * 0.72;
      ctx.beginPath(); ctx.moveTo(-s * 0.3, sy); ctx.lineTo(s * 0.3, sy); ctx.strokeStyle = th.acc(1); ctx.lineWidth = 3 * u; ctx.stroke();
    } else if (kind === 1) {
      ctx.rotate(Math.sin(t * 0.9) * 0.25);
      const r1 = s * (0.42 + 0.04 * Math.sin(t * 3)), r2 = s * 0.2;
      for (let k = 0; k < 8; k++) { const a = (k * TAU) / 8 + 0.0, r = k % 2 ? r2 : r1; ctx.moveTo(Math.cos(a) * s * 0.08, Math.sin(a) * s * 0.08); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.stroke();
    } else if (kind === 2) {
      ctx.moveTo(-s * 0.46, 0); ctx.quadraticCurveTo(0, -s * 0.5, s * 0.46, 0); ctx.quadraticCurveTo(0, s * 0.5, -s * 0.46, 0); ctx.stroke();
      ctx.beginPath(); ctx.arc(Math.sin(t * 1.3) * s * 0.1, 0, s * 0.16, 0, TAU); ctx.fillStyle = color; ctx.fill();
    } else {
      ctx.moveTo(-s * 0.3, s * 0.02); ctx.lineTo(-s * 0.08, s * 0.24); ctx.lineTo(s * 0.32, -s * 0.22); ctx.stroke();
    }
    ctx.restore();
  }
  function processScene(ctx, th, box, p, d, V) {
    const { u, tall } = th, t = V.t, steps = d.steps || [], n = Math.max(1, steps.length);
    const slot = tall ? box.h / n : box.w / n;
    const active = Math.floor(t * 0.8) % n;
    steps.forEach((label, i) => {
      const q = eo((p - i * 0.1) / 0.45), last = i === n - 1;
      const A = (tall ? box.h / n * 0.2 : box.h * 0.13) * q * V.fl;
      const rect = tall
        ? { x: box.x + 10 * u, y: box.y + slot * i + A + 20 * u, w: box.w * 0.44, h: slot * 0.78 - A - 20 * u }
        : { x: box.x + slot * i + slot * 0.1, y: box.y + A + 22 * u, w: slot * 0.8, h: box.h - 190 * u - A };
      const iconK = i === n - 1 && n > 1 ? 3 : i % 3, isActive = i === active && p > 0.7;
      ridge(ctx, th, {
        ...rect, rows: tall ? 40 : 54, n: Math.round(rect.w / 4.5), feather: 0.02, lw: 1.9, alpha: V.a * (0.45 + 0.55 * eo(q * 2.4)), fillAlpha: (0.1 + 0.9 * eo(q * 3)) * FA,
        lift: (uu, v, k, px, py) => {
          const edge = Math.min(uu, 1 - uu, v * (rect.h / rect.w), (1 - v) * (rect.h / rect.w)), plateau = smooth(0.1, 0.17, edge);
          const cut = 1;
          return A * (0.92 + 0.08 * fbm(uu * 9, k * 0.3 + t * 0.3)) * plateau * cut * (isActive ? 1.12 : 1) + crestAt(th, px, V.lc, V.change) * rect.h * 0.08 * V.fl + rough(th, uu, v, t, 0.9) * plateau;
        },
        rowAcc: () => last || isActive, pulse: bandPulse(t, 0.22, i * 0.2, 0.06), rowAlpha: (v) => 0.35 + 0.65 * v,
      });
      drawIcon(ctx, th, iconK, rect.x + rect.w / 2, rect.y + rect.h * 0.46 - A * 0.5, Math.min(rect.w, rect.h) * 0.46, last || isActive ? th.acc(1) : th.ink(0.95), t, span(q, 0.35, 0.9));
      const lx = tall ? rect.x + rect.w + 40 * u : rect.x + rect.w / 2, ly = tall ? rect.y + rect.h / 2 : rect.y + rect.h + 62 * u;
      if (q > 0.5) tag(ctx, th, label, lx, ly, 46 * u, { align: tall ? "left" : "center", q: span(q, 0.5, 1), maxW: tall ? box.x + box.w - lx : slot * 0.92, min: 40 * u, hot: last, prefix: String(i + 1).padStart(2, "0") });
      // The stream between steps: chevrons that keep moving.
      if (i < n - 1) {
        const a = eo((p - 0.25 - i * 0.16) / 0.3);
        if (a <= 0) return;
        const x0 = tall ? rect.x + rect.w / 2 : rect.x + rect.w + 8 * u, x1 = tall ? x0 : rect.x + rect.w + slot * 0.2 - 8 * u;
        const y0 = tall ? rect.y + rect.h + 4 * u : rect.y + rect.h * 0.5, y1 = tall ? rect.y + rect.h + slot * 0.22 : y0;
        ctx.save(); ctx.globalAlpha = V.a * a; ctx.strokeStyle = th.acc(1); ctx.lineWidth = 3 * u; ctx.lineCap = "round"; ctx.lineJoin = "round";
        for (let k = 0; k < 3; k++) {
          const f = fract(t * 0.9 + k / 3 - i * 0.1), cxp = lerp(x0, x1, f), cyp = lerp(y0, y1, f), s = 9 * u;
          ctx.globalAlpha = V.a * a * Math.sin(f * Math.PI);
          ctx.beginPath();
          if (tall) { ctx.moveTo(cxp - s, cyp - s * 0.7); ctx.lineTo(cxp, cyp + s * 0.3); ctx.lineTo(cxp + s, cyp - s * 0.7); }
          else { ctx.moveTo(cxp - s * 0.7, cyp - s); ctx.lineTo(cxp + s * 0.3, cyp); ctx.lineTo(cxp - s * 0.7, cyp + s); }
          ctx.stroke();
        }
        ctx.restore();
      }
    });
  }

  // ---- compare: two massifs ----------------------------------------------------------------------------------
  function compareScene(ctx, th, box, p, d, V) {
    const { u, tall } = th, t = V.t;
    const a = Math.max(0, Number(d.leftValue) || 0), b = Math.max(0, Number(d.rightValue) || 0), max = Math.max(a, b, 1);
    const items = [{ label: d.left, v: a, hot: false }, { label: d.right, v: b, hot: true }];
    const hmax = box.h * (tall ? 0.15 : 0.27);
    items.forEach((it, i) => {
      const q = eo((p - i * 0.12) / 0.5);
      const rect = tall ? { x: box.x, y: box.y + box.h * (0.2 + i * 0.44), w: box.w, h: box.h * 0.22 } : { x: box.x + i * box.w * 0.54, y: box.y + box.h * 0.37, w: box.w * 0.46, h: box.h * 0.48 };
      const H = hmax * (it.v / max) * q * V.fl * (1 + 0.025 * Math.sin(t * 1.5 + i));
      ridge(ctx, th, {
        ...rect, rows: tall ? 34 : 42, n: Math.round(rect.w / 5), feather: 0.04, lw: 2, alpha: V.a * (0.45 + 0.55 * eo(q * 2.5)), fillAlpha: (0.1 + 0.9 * eo(q * 3)) * FA,
        lift: (uu, v, k, px) => {
          const shape = smooth(0.06, 0.26, uu) * (1 - smooth(0.74, 0.94, uu));
          const top = 0.82 + 0.3 * (fbm(uu * 11 + i * 4 + t * 0.35, k * 0.37 + t * 0.15) * 0.5 + 0.5);
          return H * shape * top + crestAt(th, px, V.lc, V.change) * rect.h * 0.1 * V.fl + rough(th, uu, v, t);
        },
        rowAcc: (i, v, pl) => (it.hot && i % 3 === 0) || pl > 0.7, pulse: bandPulse(t, 0.2, i * 0.4, 0.06), rowAlpha: (v) => 0.3 + 0.7 * v,
      });
      const cx = rect.x + rect.w / 2, tipY = rect.y - H;
      if (q > 0.05) {
        say(ctx, it.label || "", cx, rect.y + rect.h + 62 * u, 46 * u, { align: "center", color: it.hot ? th.acc(1) : th.ink(0.95), maxW: rect.w * 0.95, min: 40 * u, q: span(q, 0.2, 0.9), weight: 500, track: 0.04 });
        bigNumber(ctx, th, fmtNum(it.v * q, d), cx, tipY - 30 * u, 120 * u, { align: "center", color: it.hot ? th.acc(1) : th.ink(1), maxW: rect.w * 0.92, min: 80 * u, hot: it.hot, q: clamp(q * 2) });
        if (q > 0.5) ping(ctx, th, cx, tipY, t, i * 0.3, it.hot ? 12 : 8, it.hot ? 46 : 24, it.hot ? th.acc(1) : th.ink(0.9));
      }
    });
    const pct = a ? Math.round(((b - a) / a) * 100) : 0, qd = eo(span(p, 0.55, 0.85));
    if (qd > 0 && a) {
      const px = tall ? box.x + box.w / 2 : box.x + box.w * 0.5, py = tall ? box.y + box.h * 0.5 : box.y + box.h * 0.2;
      ctx.save(); ctx.globalAlpha = V.a * qd;
      const s = `${pct > 0 ? "+" : pct < 0 ? "-" : ""}${Math.abs(pct)}%`;
      const w = tag(ctx, th, s, px + 22 * u, py, 62 * u, { align: "center", hot: true, weight: 700, track: 0 });
      ctx.fillStyle = th.acc(1); ctx.beginPath();
      const ax = px - w / 2 - 10 * u + 22 * u, bob = Math.sin(t * 3) * 3 * u;
      if (pct < 0) { ctx.moveTo(ax - 18 * u, py - 10 * u + bob); ctx.lineTo(ax + 18 * u, py - 10 * u + bob); ctx.lineTo(ax, py + 18 * u + bob); } else { ctx.moveTo(ax - 18 * u, py + 10 * u + bob); ctx.lineTo(ax + 18 * u, py + 10 * u + bob); ctx.lineTo(ax, py - 18 * u + bob); }
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  // ---- stage -----------------------------------------------------------------------------------------------
  function drawStage(ctx, S, info) {
    const th = theme(S), T = info.t;
    FA = 1;
    if (th.solid) { ctx.fillStyle = th.bg(1); ctx.fillRect(0, 0, th.W, th.H); }
    else return;
    const mood = moodAt(info);
    motes(ctx, th, T, mood.speed);
    field(ctx, th, info, mood);
    if (info.scene === "title" || info.scene === "closing") headPlate(ctx, th, info, true);
    else if (info.scene) headPlate(ctx, th, info, false);
  }

  // The texture pass over the whole frame: film grain, a faint scan and a soft vignette.
  const TILE = (() => { const c = document.createElement("canvas"); c.width = c.height = 220; const g = c.getContext("2d"), r = rng(55), id = g.createImageData(220, 220); for (let i = 0; i < id.data.length; i += 4) { const v = r() > 0.5 ? 255 : 0; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = r() * 38; } g.putImageData(id, 0, 0); return c; })();
  function paint(ctx, W, H, t, accent, look) {
    ctx.clearRect(0, 0, W, H);
    const k = Math.floor(t * 18), ox = (k * 73) % 220, oy = (k * 131) % 220;
    ctx.save(); ctx.globalAlpha = look.light ? 0.5 : 0.7; ctx.translate(-ox, -oy);
    ctx.fillStyle = ctx.createPattern(TILE, "repeat"); ctx.fillRect(ox, oy, W + 220, H + 220);
    ctx.restore();
    const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, look.light ? "rgba(90,70,40,0.22)" : "rgba(0,0,0,0.5)");
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = look.light ? "rgba(0,0,0,0.035)" : "rgba(255,255,255,0.025)";
    const bandY = ((t * 0.07) % 1.2 - 0.1) * H;
    ctx.fillRect(0, bandY, W, 70);
  }

  const halo = (bg) => () => `0 0 3px ${bg}, 0 0 18px ${bg}, 0 0 38px ${bg}`;
  return {
    light: false,
    bg: "#070a16", panel: "rgba(233,241,255,0.04)", ink: "#e9f1ff", muted: "#8f9cbb", accent: "#ff7a45", onAccent: "#070a16",
    rule: "rgba(233,241,255,0.6)", track: "rgba(233,241,255,0.1)",
    display: SANS, displayWeight: 500, displayCase: "uppercase", displayTracking: "0.06em",
    body: SANS, bodyWeight: 500, figures: MONO, radius: 6, motion: "wipe", change: "scan",
    kit: { line: 2, fill: "none", panel: "outline" },
    panelEdge: "rgba(233,241,255,0.5)",
    palettes: {
      // Paper: ink traces on cream stock. Black: pure white on black. Mono: graphite and silver.
      light: { light: true, bg: "#efe9dc", panel: "rgba(20,23,42,0.04)", ink: "#14172a", muted: "#5d6070", accent: "#d6402b", onAccent: "#ffffff", rule: "rgba(20,23,42,0.6)", track: "rgba(20,23,42,0.08)", panelEdge: "rgba(20,23,42,0.5)", textShadow: halo("#efe9dc"), backdrop: () => "#efe9dc" },
      dark: { bg: "#000000", ink: "#ffffff", textShadow: halo("#000000"), backdrop: () => "#000000", onAccent: "#000000" },
      mono: { bg: "#17181b", ink: "#d9dce3", muted: "#80848f", accent: "#ffffff", onAccent: "#17181b", textShadow: halo("#17181b"), backdrop: () => "#17181b" },
    },
    textShadow: halo("#070a16"),
    backdrop: () => "#070a16",
    css: (accent, look) => `#title-scene .kicker { font-family: ${MONO}; font-weight: 600; letter-spacing: 0.22em; color: ${accent}; }
      #title-scene .kicker::before { content: ""; display: inline-block; width: 2.2em; height: 3px; margin: 0 0.9em 0.18em 0; background: ${accent}; vertical-align: middle; }`,
    paint,
    paintOver: true,
    keepArt: true,
    overlap: true,
    stage: drawStage,
    scenes: { chart: wrap(chartScene), object: wrap(objectScene), people: wrap(peopleScene), process: wrap(processScene), compare: wrap(compareScene) },
  };
});
