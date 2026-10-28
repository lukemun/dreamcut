// Type Strobe: the whole frame is built from condensed lettering. Words run edge to edge, filled and
// outlined by turns, trailed by stepped strobe echoes and cut into glitching slices; charts, devices,
// people and steps are slabs, numerals and marching chevrons. Between scenes a stack of colour bars
// sweeps the frame. Every frame is a pure function of time: seeded noise only, no clocks.
window.DreamcutMotion.register("type-strobe", ({ hexA, rng }) => {
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const ei = (v) => Math.pow(clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const TAU = Math.PI * 2;
  const FONT = '"DIN Condensed","Impact","Haettenschweiler","Arial Narrow",sans-serif';
  const MONO = '"DIN Alternate","Menlo","Courier New",monospace';
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  const hash = (n) => {
    n = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 16;
    return (n >>> 0) / 4294967296;
  };
  const stp = (t, fps) => Math.floor(t * fps + 1e-6);
  const pad2 = (n) => String(n).padStart(2, "0");

  // ---- measuring ----------------------------------------------------------------------------------
  const mc = document.createElement("canvas").getContext("2d");
  const WP = new Map();
  function wpp(str, mono) { // width of a string per pixel of font size
    const k = (mono ? "m" : "d") + str;
    let v = WP.get(k);
    if (v === undefined) { mc.font = `${mono ? "600" : "bold"} 100px ${mono ? MONO : FONT}`; v = mc.measureText(str).width / 100; if (WP.size > 600) WP.clear(); WP.set(k, v); }
    return v;
  }
  let CAP = 0;
  function capR() {
    if (CAP) return CAP;
    mc.font = `bold 100px ${FONT}`;
    const a = mc.measureText("H").actualBoundingBoxAscent;
    return (CAP = a > 40 && a < 100 ? a / 100 : 0.72);
  }
  const fontStr = (size, mono) => `${mono ? "600" : "bold"} ${size}px ${mono ? MONO : FONT}`;

  // ---- theme --------------------------------------------------------------------------------------
  function theme(S, invert) {
    const L = S.look;
    const bg = invert ? L.ink : L.bg, ink = invert ? L.bg : L.ink;
    const same = String(S.accent).toLowerCase() === String(L.ink).toLowerCase();
    const acc = invert && same ? L.bg : S.accent;
    return {
      bg, ink, acc, onAcc: invert && same ? L.ink : L.onAccent, u: S.u, tex: L.texture ?? 1, W: S.W, H: S.H,
      I: (a) => hexA(ink, a), A: (a) => hexA(acc, a), B: (a) => hexA(bg, a),
    };
  }

  // ---- lettering ----------------------------------------------------------------------------------
  // Draw a string on its baseline. fill / stroke / back are colours; glitch (0..1) cuts it into
  // horizontal slices that slide sideways; stepping keeps the cuts on a 14 fps beat.
  function type(g, str, x, y, size, o = {}) {
    const xs = o.xs || 1, cap = size * capR();
    g.save();
    g.font = fontStr(size, o.mono); g.textAlign = o.align || "left"; g.textBaseline = "alphabetic";
    g.lineJoin = "round"; g.miterLimit = 2;
    g.translate(x, y); g.scale(xs, 1);
    const paint = (dx) => {
      if (o.back) { g.fillStyle = o.back; g.fillText(str, dx, 0); }
      if (o.fill) { g.fillStyle = o.fill; g.fillText(str, dx, 0); }
      if (o.stroke) { g.lineWidth = o.lw || 2; g.strokeStyle = o.stroke; g.strokeText(str, dx, 0); }
    };
    const gl = o.glitch || 0;
    if (gl < 0.02) paint(0);
    else {
      const bands = o.bands || 7, bh = (cap * 1.16) / bands, top = -cap * 1.06, st = stp(o.t || 0, 14);
      for (let b = 0; b < bands; b++) {
        const r = hash((o.seed || 0) * 131 + b * 17 + st * 7);
        const dx = r < 0.4 + gl * 0.4 ? (hash(b * 29 + st * 3 + (o.seed || 0)) - 0.5) * 2 * gl * cap * 0.55 : 0;
        g.save(); g.beginPath(); g.rect(-1e5, top + b * bh, 2e5, bh + 0.6); g.clip(); paint(dx); g.restore();
      }
    }
    g.restore();
  }
  // Text with stepped strobe echoes trailing it.
  function strobe(g, T, str, x, y, size, o = {}) {
    const n = o.echo ?? 2, st = stp(o.t || 0, 10), dir = o.dir || 1;
    for (let e = n; e >= 1; e--) {
      if ((st + e + (o.seed || 0)) % 4 === 0) continue;
      const k = e * size * 0.05 * (1 + 0.5 * Math.sin(st * 0.9 + e));
      g.save(); g.globalAlpha *= 0.55 / e;
      type(g, str, x + k * dir, y - e * size * 0.012, size, { ...o, fill: null, back: null, stroke: o.echoColor || T.acc, lw: Math.max(2, size * 0.011), glitch: 0 });
      g.restore();
    }
    type(g, str, x, y, size, o);
  }
  // Filled letters with a scan band of slits moving down through them.
  let SB = null;
  function slitFill(g, str, x, y, size, xs, color, t, seed) {
    const cr = capR(), w = Math.ceil(wpp(str) * size * xs) + 12, h = Math.ceil(size * (cr + 0.3));
    if (!SB) SB = document.createElement("canvas");
    if (w > 4096 || h > 2048) { type(g, str, x, y, size, { xs, fill: color }); return; }
    if (SB.width !== w || SB.height !== h) { SB.width = w; SB.height = h; }
    const b = SB.getContext("2d");
    b.globalCompositeOperation = "source-over"; b.clearRect(0, 0, w, h);
    const base = size * cr * 1.04;
    b.font = fontStr(size); b.textBaseline = "alphabetic"; b.fillStyle = color;
    b.save(); b.translate(6, base); b.scale(xs, 1); b.fillText(str, 0, 0); b.restore();
    const cap = size * cr, period = ((t * 0.34 + seed * 0.27) % 1), win = cap * 0.34;
    const wy = base - cap * 1.04 + period * (cap * 1.04 + win) - win;
    b.globalCompositeOperation = "destination-out";
    const p = Math.max(3, cap * 0.055);
    for (let yy = wy; yy < wy + win; yy += p) b.fillRect(0, yy, w, p * 0.42);
    g.drawImage(SB, x - 6, y - base);
  }

  // Break a string across lines so each line runs the full width, choosing the split that sets the
  // lettering largest without stretching it too far.
  function parts(words, n) {
    const out = [];
    (function rec(i, k, cur) {
      if (k === 1) { out.push([...cur, words.slice(i).join(" ")]); return; }
      for (let j = i + 1; j <= words.length - (k - 1); j++) rec(j, k - 1, [...cur, words.slice(i, j).join(" ")]);
    })(0, n, []);
    return out;
  }
  const LAY = new Map();
  function layout(text, rect, o) {
    const key = `${text}|${rect.w | 0}x${rect.h | 0}|${o.maxSize | 0}|${o.maxXs}|${o.maxLines}`;
    let best = LAY.get(key);
    if (best) return best;
    const words = text.split(/\s+/).filter(Boolean), cr = capR(), GAP = 0.11;
    for (let n = 1; n <= Math.min(o.maxLines || 4, words.length); n++) {
      for (const lines of parts(words, n)) {
        const sizeCap = Math.min(o.maxSize, rect.h / (n * cr + (n - 1) * GAP));
        const L = lines.map((s) => {
          const wp = wpp(s), nat = rect.w / wp, size = Math.min(nat, sizeCap), xs = Math.min(o.maxXs, rect.w / (wp * size));
          const w = wp * size * xs;
          return { s, size, xs, w, fill: Math.min(1, w / rect.w) };
        });
        const score = L.reduce((a, l) => a + l.size * l.fill * l.fill, 0) / n;
        if (!best || score > best.score) {
          const total = L.reduce((a, l, i) => a + l.size * cr + (i < L.length - 1 ? l.size * GAP : 0), 0);
          best = { L, score, total };
        }
      }
    }
    if (!best) best = { L: [], score: 0, total: 0 };
    if (LAY.size > 80) LAY.clear();
    LAY.set(key, best);
    return best;
  }
  // Paint a laid-out block. mode: "head" | "title" | "closing".
  function poster(g, T, S, lay, rect, o) {
    const cr = capR(), t = o.t;
    let y = rect.y + (o.valign === "center" ? Math.max(0, (rect.h - lay.total) / 2) : 0);
    lay.L.forEach((l, j) => {
      const base = y + l.size * cr; y = base + l.size * 0.11;
      const d0 = j * 0.085, e = eo(seg(o.local, d0, d0 + 0.38)), ex = o.exit || 0;
      const sgn = j % 2 ? 1 : -1;
      let x = rect.x + (1 - e) * sgn * S.W * 0.55 + ex * sgn * -S.W * 0.18;
      const burst = o.local > 1.0 && (o.local + j * 0.37) % 2.6 < 0.14 ? 0.8 : 0;
      const gl = Math.max(1 - e, burst, ex > 0 ? 1 : 0);
      const xs = l.xs * (1 + 0.012 * Math.sin(t * 2.2 + j * 1.3));
      const k = (j + (o.shift || 0)) % 3;
      g.save();
      g.globalAlpha *= clamp(e * 3) * (1 - clamp(ex * 1.8));
      const base0 = { t, xs, glitch: gl, seed: j + (o.seed || 0), bands: 8, dir: sgn };
      const bk = Math.floor((o.local - 1.1) / 1.7), bf = o.local - 1.1 - bk * 1.7;
      const flash = !ex && o.local > 1.1 && j === bk % lay.L.length && bf < 0.26 && stp(bf, 16) % 2 === 0;
      if (flash) {
        const pw = l.size * 0.14, wdt = wpp(l.s) * l.size * xs;
        g.fillStyle = T.acc; g.fillRect(x - pw, base - l.size * cr - pw, wdt + pw * 2, l.size * cr + pw * 2);
        type(g, l.s, x, base, l.size, { xs, fill: T.onAcc, t, glitch: 0.35, seed: j + 11, bands: 6 });
      } else if (k === 1) {
        strobe(g, T, l.s, x, base, l.size, { ...base0, back: T.bg, stroke: T.ink, lw: Math.max(3, l.size * 0.016), echoColor: T.acc, echo: 2 });
      } else {
        const color = k === 0 ? T.ink : T.acc;
        if (gl < 0.02) { strobe(g, T, l.s, x, base, l.size, { ...base0, fill: null, echo: 2, echoColor: k === 0 ? T.acc : T.ink }); slitFill(g, l.s, x, base, l.size, xs, color, t, j + (o.seed || 0)); }
        else strobe(g, T, l.s, x, base, l.size, { ...base0, fill: color, echo: 2, echoColor: k === 0 ? T.acc : T.ink });
      }
      g.restore();
    });
  }

  // ---- slabs, lines, wipes -----------------------------------------------------------------------
  // A label on a solid slab (top-left x,y). Returns its size.
  function slab(g, T, str, x, y, size, o = {}) {
    const cr = capR(), padX = (o.pad ?? 0.32) * size, padY = 0.3 * size;
    let sz = size, xs = 1;
    const maxW = o.maxW ? o.maxW - padX * 2 : 0;
    if (maxW) {
      const nat = wpp(str) * size;
      if (nat > maxW) { xs = Math.max(0.64, maxW / nat); if (nat * xs > maxW + 1) sz = size * (maxW / (nat * xs)); }
    }
    const tw = wpp(str) * sz * xs, w = o.fullW || tw + padX * 2, h = sz * cr + padY * 2;
    g.save();
    if (o.clipW !== undefined) { g.beginPath(); g.rect(x - 4, y - 4, (w + 30) * o.clipW, h + 30); g.clip(); }
    if (o.shadow) { g.fillStyle = o.shadow; g.fillRect(x + o.off, y + o.off, w, h); }
    g.fillStyle = o.bg; g.fillRect(x, y, w, h);
    type(g, str, x + w / 2, y + padY + sz * cr, sz, { xs, fill: o.fg, align: "center", t: o.t, glitch: o.glitch || 0, seed: o.seed || 0, bands: 4 });
    g.restore();
    return { w, h };
  }
  function wipe(g, T, u01, W, H) {
    if (u01 <= 0 || u01 >= 1) return;
    const n = 8, h = H / n, sk = H * 0.07;
    for (let i = 0; i < n; i++) {
      const s = clamp((u01 - i * 0.045) / 0.62);
      if (s <= 0) continue;
      const lead = eio(s) * (W + sk * 2), trail = ei(clamp((s - 0.4) / 0.6)) * (W + sk * 2);
      if (trail >= W + sk * 2 - 1 || lead - trail < 1) continue;
      const y = i * h - 1;
      g.fillStyle = i % 3 === 0 ? T.acc : T.ink;
      g.beginPath(); g.moveTo(trail, y); g.lineTo(lead, y); g.lineTo(lead - sk, y + h + 2); g.lineTo(trail - sk, y + h + 2); g.closePath(); g.fill();
    }
  }
  // The region the bars' leading edges have passed (covered) or not yet reached; used to swap worlds
  // behind the bars so no colour change ever shows outside them.
  function wipeLead(u01, i, W, H) {
    const sk = H * 0.07, s = clamp((u01 - i * 0.045) / 0.62);
    if (s <= 0) return -sk - 20;
    if (s >= 1) return W + sk * 2 + 20;
    return eio(s) * (W + sk * 2);
  }
  function coverClip(g, u01, W, H, covered) {
    const n = 8, h = H / n, sk = H * 0.07, far = W + sk * 2 + 40;
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const lead = wipeLead(u01, i, W, H), y0 = i * h, y1 = (i + 1) * h;
      if (covered) { g.moveTo(-sk - 40, y0); g.lineTo(lead, y0); g.lineTo(lead - sk, y1); g.lineTo(-sk - 40, y1); }
      else { g.moveTo(lead, y0); g.lineTo(far, y0); g.lineTo(far, y1); g.lineTo(lead - sk, y1); }
      g.closePath();
    }
    g.clip();
  }
  function polyline(g, pts, frac) {
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let left = total * clamp(frac);
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length && left > 0; i++) {
      const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1], len = Math.hypot(dx, dy), f = Math.min(1, left / Math.max(1e-6, len));
      g.lineTo(pts[i - 1][0] + dx * f, pts[i - 1][1] + dy * f); left -= len;
    }
    g.stroke();
  }
  function chevron(g, x, y, s, color, w, vertical) {
    g.save(); g.strokeStyle = color; g.lineWidth = w; g.lineJoin = "miter"; g.lineCap = "butt";
    g.beginPath();
    if (vertical) { g.moveTo(x - s, y - s * 0.6); g.lineTo(x, y + s * 0.5); g.lineTo(x + s, y - s * 0.6); }
    else { g.moveTo(x - s * 0.6, y - s); g.lineTo(x + s * 0.5, y); g.lineTo(x - s * 0.6, y + s); }
    g.stroke(); g.restore();
  }

  // ---- the world under every scene -----------------------------------------------------------------
  function words(id) {
    const el = document.getElementById(id === "title" || id === "closing" ? id : `${id}-title`);
    const s = el ? String(el.textContent || "").trim().toUpperCase() : "";
    return s || "TYPE STROBE";
  }
  function wall(g, T, S, info, text, sceneId) {
    const { W, H, u } = S, t = info.t, tall = S.tall;
    const poster = !sceneId || sceneId === "title" || sceneId === "closing", hr = headRect(S);
    const rows = tall ? 9 : 6, rh = H / rows, size = rh * 1.02, cr = capR();
    const pool = text.split(/\s+/).filter((w) => w.length > 1);
    const line = (pool.length ? pool : ["TYPE", "STROBE"]).join(" / ") + " / ";
    const tile = wpp(line) * size;
    const hot = stp(t, 2.2) % rows;
    g.save();
    g.lineJoin = "round"; g.font = fontStr(size); g.textBaseline = "alphabetic";
    for (let i = 0; i < rows; i++) {
      const speed = (60 + 70 * hash(i + 3)) * u * (i % 2 ? 1 : -1);
      const off = ((((t * speed + i * 377 * u) % tile) + tile) % tile);
      const y = i * rh + rh * 0.5 + (size * cr) / 2;
      const inHead = poster || (y > hr.y - size * 0.2 && y - size * cr < hr.y + hr.h + size * 0.2);
      const isHot = i === hot && !inHead;
      const quiet = poster ? 0.38 : inHead ? 0.3 : 0.55;
      g.globalAlpha = isHot ? 0.2 * Math.max(0.35, T.tex) : (0.15 + 0.04 * (i % 2)) * quiet * Math.max(0.5, T.tex);
      g.lineWidth = 2.4 * u; g.strokeStyle = isHot ? T.acc : T.ink; g.fillStyle = T.acc;
      for (let x = -off; x < W; x += tile) { if (isHot) g.fillText(line, x, y); else g.strokeText(line, x, y); }
    }
    g.restore();
  }
  function halftone(g, T, S, info) {
    const { W, u } = S, t = info.t, sp = 27 * u, x0 = W - 560 * u, y0 = 84 * u, ww = 560 * u, hh = 520 * u;
    g.save(); g.fillStyle = T.I(0.5 * Math.max(0.4, T.tex));
    for (let yy = y0; yy < y0 + hh; yy += sp) for (let xx = x0; xx < x0 + ww; xx += sp) {
      const d = Math.hypot(xx - (W + 40 * u), yy - y0) / (ww * 1.15);
      const r = sp * 0.5 * clamp(1 - d) * (0.65 + 0.35 * Math.sin(t * 2.4 + xx * 0.013 + yy * 0.017));
      if (r < 0.8) continue;
      g.beginPath(); g.arc(xx, yy, r, 0, TAU); g.fill();
    }
    g.restore();
  }
  function chrome(g, T, S, info, text, counter) {
    const { W, H, u } = S, t = info.t;
    // Ticker along the bottom with a progress bar riding its top edge.
    const th = 70 * u, ty = H - th;
    g.fillStyle = T.ink; g.fillRect(0, ty, W, th);
    g.fillStyle = T.acc; g.fillRect(0, ty - 8 * u, W * clamp(t / Math.max(0.01, info.length)), 8 * u);
    const line = text.split(/\s+/).join("  +  ") + "  +  ", size = 46 * u, tile = wpp(line) * size, cr = capR();
    const BEAT = 1.7, kb = Math.floor(t / BEAT), fb = t - kb * BEAT;
    const off = ((t * 150 * u + 420 * u * (kb + eo(fb / 0.4))) % tile);
    const hit = fb < 0.14;
    if (hit) { g.fillStyle = T.acc; g.fillRect(0, ty, W, th); }
    g.save(); g.beginPath(); g.rect(0, ty, W, th); g.clip();
    g.font = fontStr(size); g.fillStyle = hit ? T.onAcc : T.bg; g.textBaseline = "alphabetic";
    for (let x = -off; x < W; x += tile) g.fillText(line, x, ty + th / 2 + (size * cr) / 2);
    g.restore();
    if (counter) {
      const s = slab(g, T, counter, 36 * u, 22 * u, 42 * u, { bg: T.ink, fg: T.bg });
      const blink = stp(t, 2) % 2 === 0;
      g.fillStyle = blink ? T.acc : T.I(0.25); g.fillRect(36 * u + s.w + 18 * u, 22 * u + s.h / 2 - 11 * u, 22 * u, 22 * u);
      type(g, "T+" + t.toFixed(2), W - 36 * u, 22 * u + s.h * 0.72, 42 * u, { fill: T.ink, align: "right", mono: true });
    }
  }

  // ---- scene drawers -------------------------------------------------------------------------------
  const DRAW = {};
  const ink = (T, hot) => (hot ? T.acc : T.ink);
  const onInk = (T, hot) => (hot ? T.onAcc : T.bg);

  DRAW.chart = (A, d) => {
    const { g, T, u, box, t, local, hold, leaving } = A;
    const n = d.values.length, max = Math.max(...d.values, 1);
    const span = clamp((hold - 1.5) / n, 0.3, 0.7), rise = 0.7;
    const startOf = (i) => 0.1 + i * span;
    const by = box.y + box.h - 82 * u, top = box.y + 10 * u, hMax = by - top;
    const gap = box.w * 0.045, bw = (box.w - gap * (n + 1)) / n;
    // Ruled lines, marching.
    g.save(); g.lineWidth = 2.5 * u; g.strokeStyle = T.I(0.35); g.setLineDash([16 * u, 12 * u]); g.lineDashOffset = -t * 46 * u;
    for (let k = 1; k <= 4; k++) { const y = by - (hMax * k) / 4; g.beginPath(); g.moveTo(box.x, y); g.lineTo(box.x + box.w, y); g.stroke(); }
    g.restore();
    g.fillStyle = T.ink; g.fillRect(box.x - 10 * u, by, box.w + 20 * u, 8 * u);
    for (let i = 0; i < n; i++) {
      const q = leaving ? 1 : eo(seg(local, startOf(i), startOf(i) + rise)), hot = i === d.highlight;
      const since = leaving ? 9 : local - (startOf(i) + rise);
      const land = hot && since > 0 && since < 0.6;
      const beatHot = hot && since > 0.6 && (since - 0.6) % 1.7 < 0.18;
      const col = (land || beatHot) && stp(since, 12) % 2 ? T.ink : ink(T, hot), face = onInk(T, hot);
      const x = box.x + gap + i * (bw + gap), fh = hMax * (d.values[i] / max), h = fh * q;
      g.save();
      // Where the bar will stand, as a dashed outline.
      g.setLineDash([12 * u, 9 * u]); g.lineDashOffset = -t * 30 * u; g.lineWidth = 3 * u; g.strokeStyle = col; g.globalAlpha = 0.5 * (1 - q * 0.6);
      g.strokeRect(x, by - fh, bw, fh);
      g.restore();
      if (h > 2) {
        // Strobe echoes, stepped.
        const st = stp(t, 10);
        for (let e = 3; e >= 1; e--) {
          if ((st + e + i) % 4 === 0) continue;
          const k = e * bw * 0.055 * (1 + 0.5 * Math.sin(st * 0.9 + e + i));
          g.save(); g.globalAlpha = 0.55 / e; g.lineWidth = 3 * u; g.strokeStyle = hot ? T.ink : T.acc;
          g.strokeRect(x + k, by - h - k * 0.5, bw, h); g.restore();
        }
        // The bar, cut into sliding slices while it rises.
        const bands = 6, gl = (1 - q) * 1.0;
        for (let b = 0; b < bands; b++) {
          const y0 = by - h + (h * b) / bands, y1 = by - h + (h * (b + 1)) / bands;
          const dx = gl > 0.02 && hash(i * 31 + b * 7 + stp(t, 14) * 5) < 0.6 ? (hash(b * 13 + stp(t, 14) + i) - 0.5) * bw * 0.5 * gl : 0;
          g.fillStyle = col; g.fillRect(x + dx, y0, bw, y1 - y0 + 0.6);
        }
        g.save(); g.beginPath(); g.rect(x, by - h, bw, h); g.clip();
        // Label words running through the bar, row by row.
        const rowH = 62 * u, lab = (d.labels[i] || "").toUpperCase() || "·";
        const line = lab + "  /  ", ts = rowH * 1.02, tile = wpp(line) * ts;
        g.font = fontStr(ts); g.fillStyle = face; g.globalAlpha = 0.2; g.textBaseline = "alphabetic";
        for (let r = 0; r * rowH < fh + rowH; r++) {
          const yy = by - r * rowH - rowH * 0.18, sp = (50 + 40 * hash(r + i * 5)) * u * (r % 2 ? 1 : -1);
          const off = ((((t * sp) % tile) + tile) % tile);
          for (let xx = x - off; xx < x + bw; xx += tile) g.fillText(line, xx, yy);
        }
        // A bright band climbing the bar.
        const ph = (t * 0.55 + i * 0.31) % 1, by0 = by - h * ph;
        g.globalAlpha = 0.2; g.fillStyle = face; g.fillRect(x, by0 - 20 * u, bw, 40 * u);
        g.globalAlpha = 1;
        // The figure.
        const txt = window.DreamcutMotion.formatNumber(d.values[i] * q, 0, d.prefix, d.suffix);
        const full = window.DreamcutMotion.formatNumber(d.values[i], 0, d.prefix, d.suffix);
        const sz = Math.min(180 * u, (bw * 0.9) / (wpp(full) + 0.04)) * (land ? 1 + 0.12 * (1 - since / 0.6) : 1);
        const inside = fh > sz * capR() * 1.5 + 50 * u;
        if (inside) type(g, txt, x + bw / 2, by - fh + 28 * u + sz * capR(), sz, { fill: face, align: "center", t, glitch: gl, seed: i });
        g.restore();
        if (!inside) type(g, txt, x + bw / 2, by - h - 22 * u, sz, { fill: col, back: T.bg, stroke: col, lw: 2 * u, align: "center", t, glitch: gl, seed: i });
        if (land) {
          const k = eo(since / 0.6);
          g.save(); g.globalAlpha = 1 - k; g.lineWidth = 6 * u; g.strokeStyle = T.acc;
          g.strokeRect(x - k * 40 * u, by - h - k * 40 * u, bw + k * 80 * u, h + k * 40 * u); g.restore();
        }
        // A cap that flashes on the beat.
        if (q > 0.95) { g.fillStyle = hot ? T.ink : T.acc; g.globalAlpha = stp(t * 1.0 + i * 0.5, 4) % 2 ? 1 : 0.25; g.fillRect(x, by - h - 12 * u, bw, 12 * u); g.globalAlpha = 1; }
      }
      slab(g, T, (d.labels[i] || "").toUpperCase(), x, by + 16 * u, 46 * u, { bg: col, fg: face, fullW: bw, maxW: bw, t, shadow: hot ? T.ink : undefined, off: 6 * u });
    }
  };

  DRAW.object = (A, d) => {
    const { g, T, S, u, tall, box, pr, t } = A;
    const phone = d.kind === "phone";
    let w, h, x, y;
    if (!tall) {
      w = phone ? Math.min(box.w * 0.26, box.h * 0.5) : Math.min(box.w * 0.58, box.h * 1.18); h = phone ? w * 1.9 : w * 0.62;
      x = box.x + (phone ? box.w * 0.18 : box.w * 0.02); y = box.y + (box.h - h - (phone ? 0 : h * 0.1)) / 2;
    } else if (phone) { w = box.w * 0.44; h = w * 1.9; x = box.x; y = box.y + 20 * u; }
    else { w = box.w * 0.92; h = w * 0.6; x = box.x + (box.w - w) / 2; y = box.y + 6 * u; }
    const side = !tall || phone;
    const q = eo(seg(pr, 0, 0.5)), st = stp(t, 10);
    const pad = (phone ? 20 : 24) * u, sx = x + pad, sy = y + pad, sw = w - pad * 2, sh = h - pad * 2;
    g.save();
    g.beginPath(); g.rect(x - 60 * u, y - 60 * u, (w + 130 * u) * q, h + 200 * u); g.clip();
    // Echoes and a hard shadow.
    for (let e = 3; e >= 1; e--) {
      if ((st + e) % 4 === 0) continue;
      const k = e * 15 * u * (1 + 0.4 * Math.sin(st * 0.8 + e));
      g.save(); g.globalAlpha = 0.6 / e; g.lineWidth = 3 * u; g.strokeStyle = T.acc; g.strokeRect(x - k, y - k * 0.4, w, h); g.restore();
    }
    g.fillStyle = T.acc; g.fillRect(x + 16 * u, y + 16 * u, w, h);
    g.fillStyle = T.ink; g.fillRect(x, y, w, h);
    if (!phone) { // base
      g.beginPath(); g.moveTo(x - w * 0.07, y + h + 22 * u); g.lineTo(x + w * 1.07, y + h + 22 * u); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath();
      g.fillStyle = T.ink; g.fill();
      g.fillStyle = T.bg; g.fillRect(x + w * 0.42, y + h + 3 * u, w * 0.16, 8 * u);
      g.fillStyle = T.acc; g.fillRect(x + 16 * u, y + h + 22 * u, w * 1.07 - 16 * u, 8 * u);
    }
    g.fillStyle = T.bg; g.fillRect(sx, sy, sw, sh);
    // Screen.
    g.save(); g.beginPath(); g.rect(sx, sy, sw, sh); g.clip();
    const pv = { x: sx + sw * 0.05, y: sy + sh * 0.07, w: sw * 0.9, h: sh * 0.46 };
    g.fillStyle = T.acc; g.fillRect(pv.x, pv.y, pv.w, pv.h);
    g.save(); g.beginPath(); g.rect(pv.x, pv.y, pv.w, pv.h); g.clip();
    g.strokeStyle = T.onAcc; g.globalAlpha = 0.16; g.lineWidth = 14 * u;
    const dsp = 56 * u, doff = (t * 40 * u) % dsp;
    g.beginPath(); for (let k = -pv.h; k < pv.w + pv.h; k += dsp) { g.moveTo(pv.x + k + doff, pv.y + pv.h); g.lineTo(pv.x + k + doff + pv.h, pv.y); } g.stroke();
    g.globalAlpha = 1;
    const word = ["CUT", "MIX", "FX", "OK"][stp(t, 2.2) % 4], wsz = (pv.h / capR()) * 0.78;
    const wxs = Math.min(1.4, (pv.w * 0.8) / (wpp(word) * wsz));
    const burst = (t * 2.2) % 1 < 0.16 ? 0.8 : 0;
    strobe(g, { acc: T.onAcc, ink: T.onAcc }, word, pv.x + pv.w / 2, pv.y + pv.h * 0.5 + (wsz * capR()) / 2, wsz, { t, xs: wxs, fill: T.onAcc, align: "center", echoColor: T.bg, echo: 2, glitch: burst, seed: 3 });
    g.restore();
    const th = sh * 0.1;
    for (let r = 0; r < 3; r++) {
      const ty = sy + sh * 0.6 + r * (th + sh * 0.045);
      const sp = (46 + r * 22) * u, total = 20;
      let acc = 0; const lens = []; for (let k = 0; k < total; k++) { const l = sw * (0.12 + hash(r * 41 + k) * 0.2); lens.push(l); acc += l + 10 * u; }
      const off = (t * sp) % acc;
      let xx = sx - off;
      for (let k = 0; k < total * 2 && xx < sx + sw; k++) {
        const l = lens[k % total];
        if (xx + l > sx) {
          const hotClip = (k % total) % 5 === 2 && r === 1;
          if ((k + r) % 2) { g.fillStyle = hotClip ? T.acc : T.ink; g.fillRect(xx, ty, l, th); }
          else { g.lineWidth = 3 * u; g.strokeStyle = T.ink; g.strokeRect(xx + 1.5 * u, ty + 1.5 * u, l - 3 * u, th - 3 * u); }
        }
        xx += l + 10 * u;
      }
    }
    const px = sx + sw * (0.08 + 0.84 * ((t * 0.38) % 1));
    for (let e = 2; e >= 1; e--) { g.globalAlpha = 0.35 / e; g.fillStyle = T.acc; g.fillRect(px - e * 26 * u - 2 * u, sy + sh * 0.56, 4 * u, sh * 0.44); }
    g.globalAlpha = 1; g.fillStyle = T.acc; g.fillRect(px - 3 * u, sy + sh * 0.54, 6 * u, sh * 0.46);
    g.fillRect(px - 14 * u, sy + sh * 0.54, 28 * u, 16 * u);
    g.restore();
    g.restore();
    // Callouts.
    const anchors = [[pv.x + pv.w * 0.78, pv.y + pv.h * 0.32], [sx + sw * 0.5, sy + sh * 0.7], [sx + sw * 0.22, sy + sh * 0.9]];
    const lsz = 48 * u, labelX = side ? box.x + box.w * (tall ? 0.46 : phone ? 0.52 : 0.68) : box.x;
    const colors = [T.acc, T.ink, T.ink], faces = [T.onAcc, T.bg, T.bg];
    d.callouts.forEach((label, i) => {
      const c = eo(seg(pr, 0.35 + i * 0.12, 0.7 + i * 0.1));
      if (c <= 0 || !label) return;
      const lab = label.toUpperCase();
      let lx, ly, pts;
      const sh2 = lsz * capR() + 0.6 * lsz;
      if (side) {
        ly = box.y + box.h * (0.18 + i * 0.3); lx = labelX;
        const mx = x + w + (30 + i * 36) * u + 16 * u;
        pts = [[anchors[i][0], anchors[i][1]], [mx, anchors[i][1]], [mx, ly], [lx - 4 * u, ly]];
      } else {
        ly = y + h + 130 * u + i * (sh2 + 34 * u); lx = x; const ax = anchors[i][0];
        pts = [[ax, y + h + 22 * u], [ax, ly], [lx + Math.min(box.w * 0.42, 460 * u), ly]];
      }
      g.save(); g.lineWidth = 5 * u; g.strokeStyle = T.acc; g.setLineDash([22 * u, 10 * u]); g.lineDashOffset = -t * 70 * u;
      polyline(g, pts, c * 1.15); g.restore();
      const ring = (t * 0.9 + i * 0.3) % 1;
      g.fillStyle = T.acc; g.beginPath(); g.arc(anchors[i][0], anchors[i][1], 11 * u, 0, TAU); g.fill();
      g.save(); g.globalAlpha = 1 - ring; g.lineWidth = 4 * u; g.strokeStyle = T.acc; g.beginPath(); g.arc(anchors[i][0], anchors[i][1], 11 * u + ring * 34 * u, 0, TAU); g.stroke(); g.restore();
      const availW = side ? box.x + box.w - lx : Math.min(box.w * 0.7, 640 * u);
      slab(g, T, lab, side ? lx : lx + Math.min(box.w * 0.42, 460 * u), ly - sh2 / 2, lsz, { bg: colors[i], fg: faces[i], maxW: side ? availW : box.w - Math.min(box.w * 0.42, 460 * u), clipW: seg(c, 0.55, 1), shadow: i ? undefined : T.ink, off: 6 * u, t, glitch: c < 1 ? 0.6 : 0, seed: i });
    });
  };

  DRAW.people = (A, d) => {
    const { g, T, u, tall, box, pr, t, local, leaving } = A;
    const n = Math.max(2, Math.min(6, Math.round(d.count))), hotI = Math.min(n - 1, d.highlight);
    // Once everyone has landed, the floor passes from person to person.
    const TURN = 0.85, t0 = 1.35, spk = !leaving && local > t0 ? Math.floor((local - t0) / TURN) % n : -1;
    const turnF = spk >= 0 ? (local - t0) % TURN : 9;
    const rows = tall && n > 3 ? 2 : 1, cols = Math.ceil(n / rows), cell = box.w / cols, rowH = box.h / rows;
    const size = Math.min(rowH * 0.62, cell * 1.25);
    const gq = eo(seg(pr, 0, 0.4)), st = stp(t, 10);
    for (let r0 = 0; r0 < rows; r0++) {
      const base = box.y + rowH * (r0 + 0.9);
      g.fillStyle = T.ink; g.fillRect(box.x, base, box.w * gq, 20 * u);
      g.save(); g.beginPath(); g.rect(box.x, base, box.w * gq, 20 * u); g.clip(); g.strokeStyle = T.acc; g.lineWidth = 7 * u;
      const sp = 36 * u, so = (t * 50 * u) % sp;
      g.beginPath(); for (let k = -30 * u; k < box.w + 30 * u; k += sp) { g.moveTo(box.x + k + so, base + 22 * u); g.lineTo(box.x + k + so + 22 * u, base - 2 * u); } g.stroke(); g.restore();
    }
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / cols), cc = i % cols, base = box.y + rowH * (row + 0.9);
      const q = eo(seg(pr, 0.08 + i * 0.09, 0.08 + i * 0.09 + 0.5)), hot = i === hotI;
      const talk = spk >= 0 ? i === spk : hot, fresh = spk === i && turnF < 0.22;
      const cx = box.x + cell * (cc + 0.5), sz = size * (hot ? 1.06 : 1);
      const col = ink(T, hot), face = onInk(T, hot);
      const bw = sz * 0.66, top = base - sz * 0.74, r = sz * 0.17;
      const bob = Math.sin(t * 3.1 + i * 1.3) * 7 * u - (spk === i ? Math.sin(Math.PI * clamp(turnF / 0.3)) * 22 * u : 0);
      const lift = (1 - q) * sz * 0.35;
      const body = (ox, oy) => {
        g.beginPath(); g.moveTo(cx - bw / 2 + ox, base + oy); g.lineTo(cx - bw / 2 + ox, top + bw * 0.3 + oy); g.lineTo(cx - bw * 0.22 + ox, top + oy);
        g.lineTo(cx + bw * 0.22 + ox, top + oy); g.lineTo(cx + bw / 2 + ox, top + bw * 0.3 + oy); g.lineTo(cx + bw / 2 + ox, base + oy); g.closePath();
      };
      // Ghost of the figure before it lands.
      if (q < 1) { g.save(); g.setLineDash([12 * u, 9 * u]); g.lineWidth = 3 * u; g.strokeStyle = col; g.globalAlpha = 0.5; body(0, 0); g.stroke(); g.beginPath(); g.arc(cx, top - r * 1.3, r, 0, TAU); g.stroke(); g.restore(); }
      if (q <= 0) continue;
      g.save(); g.globalAlpha = clamp(q * 2.5); g.translate(0, lift);
      for (let e = 2; e >= 1; e--) {
        if ((st + e + i) % 4 === 0) continue;
        const k = e * 15 * u * (1 + 0.4 * Math.sin(st * 0.9 + e)) * (i % 2 ? 1 : -1);
        g.save(); g.globalAlpha *= 0.55 / e; g.lineWidth = 3 * u; g.strokeStyle = hot ? T.ink : T.acc; body(k, 0); g.stroke(); g.restore();
      }
      g.fillStyle = col; body(0, 0); g.fill();
      g.save(); body(0, 0); g.clip();
      const badge = (d.badges[i % d.badges.length] || "?").trim();
      const ch = pad2(i + 1), lsz = Math.min(bw * 1.3, (bw * 0.84) / wpp(ch));
      g.globalAlpha *= 0.95;
      type(g, ch, cx, base - 14 * u, lsz, { fill: face, align: "center", t, glitch: fresh ? 0.8 : (t * 1.3 + i * 0.4) % 2.4 < 0.12 ? 0.6 : 0, seed: i });
      // scan band down the torso
      const ph = (t * 0.5 + i * 0.27) % 1; g.fillStyle = face; g.globalAlpha = 0.16; g.fillRect(cx - bw / 2, top + (base - top) * ph - 16 * u, bw, 32 * u);
      g.restore();
      // Head.
      const hy = top - r * 1.25 + bob;
      if (talk) for (let k = 0; k < 2; k++) { const ph = (t * 0.8 + k * 0.5 + i * 0.1) % 1; g.save(); g.globalAlpha = (1 - ph) * 0.7; g.lineWidth = 4 * u; g.strokeStyle = T.acc; g.beginPath(); g.arc(cx, hy, r + ph * sz * 0.34, 0, TAU); g.stroke(); g.restore(); }
      g.fillStyle = col; g.beginPath(); g.arc(cx, hy, r, 0, TAU); g.fill();
      const blink = (t * 0.7 + i * 0.37) % 1.6 < 0.1 ? 0.25 : 1, es = r * 0.3;
      g.fillStyle = face; g.fillRect(cx - r * 0.5 - es / 2, hy - r * 0.2, es, es * blink); g.fillRect(cx + r * 0.5 - es / 2, hy - r * 0.2, es, es * blink);
      const mw = r * (talk ? 0.5 + 0.4 * Math.abs(Math.sin(t * 9)) : 0.5); g.fillRect(cx - mw / 2, hy + r * 0.38, mw, r * 0.14);
      if (talk) for (let k = 0; k < 4; k++) { const hh = (0.3 + 0.7 * hash(k * 7 + stp(t, 12) * 3)) * r * 1.4; g.fillStyle = T.acc; g.fillRect(cx + r * 1.5 + k * 13 * u, hy + r * 0.7 - hh, 8 * u, hh); }
      g.restore();
      if (q > 0.55 && badge) {
        const bsz = 44 * u, sh2 = bsz * capR() + 0.6 * bsz, by = top - r * 2.9 - sh2 - 20 * u + bob * 0.5;
        const wdt = Math.min(cell * 0.96, wpp(badge.toUpperCase()) * bsz + 0.64 * bsz);
        const lit = spk === i, bg2 = lit ? (hot ? T.ink : T.acc) : col, fg2 = lit ? (hot ? T.bg : T.onAcc) : face;
        if (lit) { // speech ticks fanning out from the badge
          g.save(); g.strokeStyle = T.acc; g.lineWidth = 6 * u; g.lineCap = "butt";
          for (let k = 0; k < 3; k++) {
            const a = (-0.5 + k * 0.5) * 0.9 - Math.PI / 2, ph = (turnF * 2.4 + k * 0.33) % 1, r0 = wdt * 0.5 + 14 * u + ph * 40 * u;
            g.globalAlpha = 1 - ph; const ox = cx, oy = by + sh2 / 2;
            g.beginPath(); g.moveTo(ox + Math.cos(a) * r0, oy + Math.sin(a) * r0 * 0.6 - sh2 * 0.4); g.lineTo(ox + Math.cos(a) * (r0 + 26 * u), oy + Math.sin(a) * (r0 + 26 * u) * 0.6 - sh2 * 0.4); g.stroke();
          }
          g.restore();
        }
        slab(g, T, badge.toUpperCase(), cx - wdt / 2, by, bsz, { bg: bg2, fg: fg2, fullW: wdt, maxW: wdt, clipW: seg(q, 0.55, 0.9), shadow: hot || lit ? T.ink : undefined, off: (lit ? 10 : 6) * u, t, glitch: fresh ? 0.7 : 0, seed: i + 20 });
      }
    }
  };

  DRAW.process = (A, d) => {
    const { g, T, u, tall, box, pr, t } = A;
    const n = d.steps.length;
    const gap = (tall ? box.h : box.w) * 0.07;
    const cw = tall ? box.w : (box.w - gap * (n - 1)) / n;
    const ch = tall ? (box.h - gap * (n - 1)) / n : Math.min(box.h * 0.9, cw * 1.25);
    const cy0 = tall ? box.y : box.y + (box.h - ch) / 2;
    const act = pr < 0.95 ? clamp(Math.floor(pr * n), 0, n - 1) : stp(t, 1.15) % n;
    const st = stp(t, 10);
    for (let i = 0; i < n; i++) {
      const q = eo(seg(pr, i * 0.14, i * 0.14 + 0.5)), on = i === act;
      const x = tall ? box.x : box.x + i * (cw + gap), y = tall ? cy0 + i * (ch + gap) : cy0;
      // The slot, dashed, before the card lands.
      g.save(); g.setLineDash([14 * u, 10 * u]); g.lineDashOffset = -t * 30 * u; g.lineWidth = 3 * u; g.strokeStyle = T.I(0.5); g.strokeRect(x, y, cw, ch); g.restore();
      if (q > 0) {
        g.save(); g.beginPath(); g.rect(x - 40 * u, y - 40 * u, (cw + 80 * u) * q, ch + 100 * u); g.clip();
        if (on) for (let e = 3; e >= 1; e--) {
          if ((st + e + i) % 4 === 0) continue;
          const k = e * 14 * u * (1 + 0.4 * Math.sin(st * 0.8 + e));
          g.save(); g.globalAlpha = 0.6 / e; g.lineWidth = 3 * u; g.strokeStyle = T.ink; g.strokeRect(x + k, y - k * 0.5, cw, ch); g.restore();
        }
        g.fillStyle = on ? T.ink : T.I(0.28); g.fillRect(x + 14 * u, y + 14 * u, cw, ch);
        g.fillStyle = on ? T.acc : T.bg; g.fillRect(x, y, cw, ch);
        g.lineWidth = 5 * u; g.strokeStyle = T.ink; g.strokeRect(x + 2.5 * u, y + 2.5 * u, cw - 5 * u, ch - 5 * u);
        g.save(); g.beginPath(); g.rect(x, y, cw, ch); g.clip();
        { const rh = 76 * u, mt = ((d.steps[i] || "").toUpperCase() || "STEP") + "  /  ", tl = wpp(mt) * rh;
          g.font = fontStr(rh); g.fillStyle = on ? T.onAcc : T.ink; g.globalAlpha = on ? 0.16 : 0.11; g.textBaseline = "alphabetic";
          for (let r = 0; r * rh < ch + rh; r++) { const sp2 = (56 + 40 * hash(r + i * 9)) * u * (r % 2 ? 1 : -1), off2 = ((((t * sp2) % tl) + tl) % tl);
            for (let xx = x - off2; xx < x + cw; xx += tl) g.fillText(mt, xx, y + (r + 1) * rh); } }
        g.restore();
        const num = pad2(i + 1);
        const nsz = tall ? Math.min(ch * 0.78, 250 * u) : Math.min(ch * 0.52, (cw * 0.66) / wpp("00"));
        const nx = x + 26 * u, nb = y + 26 * u + nsz * capR();
        const gl = on && (t * 1.15) % 1 < 0.14 ? 0.8 : 0;
        if (on) type(g, num, nx, nb, nsz, { fill: T.onAcc, t, glitch: gl, seed: i });
        else type(g, num, nx, nb, nsz, { back: T.bg, stroke: T.ink, lw: Math.max(3, nsz * 0.016), t, glitch: gl, seed: i });
        // Bars ticking under the numeral.
        const bx = nx, byy = tall ? y + ch - 40 * u : nb + 28 * u, bn = tall ? 0 : 14, bwid = (cw * 0.9) / 14;
        for (let k = 0; k < bn; k++) {
          const hh = (0.25 + 0.75 * hash(k * 9 + i * 77 + (on ? stp(t, 9) : 0))) * 62 * u * (on ? 1 : 0.6);
          g.fillStyle = on ? T.onAcc : T.ink; g.globalAlpha = on ? 0.9 : 0.5; g.fillRect(bx + k * bwid, byy + 62 * u - hh, bwid * 0.6, hh);
        }
        g.globalAlpha = 1;
        const lab = (d.steps[i] || "").toUpperCase(), lsz = 50 * u;
        if (tall) slab(g, T, lab, x + cw * 0.38, y + ch / 2 - (lsz * capR() + 0.6 * lsz) / 2, lsz, { bg: T.ink, fg: T.bg, maxW: cw * 0.58, t });
        else slab(g, T, lab, x, y + ch - (lsz * capR() + 0.6 * lsz), lsz, { bg: T.ink, fg: T.bg, fullW: cw, maxW: cw, t });
        g.restore();
      }
      if (i < n - 1) {
        const cq = eo(seg(pr, i * 0.14 + 0.3, i * 0.14 + 0.7));
        if (cq > 0.3) for (let k = 0; k < 3; k++) {
          const ph = (t * 1.2 + k / 3 + i * 0.2) % 1, a = Math.sin(ph * Math.PI);
          g.save(); g.globalAlpha = a;
          if (tall) chevron(g, x + cw / 2, y + ch + gap * (0.12 + 0.76 * ph), gap * 0.3, T.acc, 8 * u, true);
          else chevron(g, x + cw + gap * (0.12 + 0.76 * ph), y + ch / 2, gap * 0.3, T.acc, 8 * u, false);
          g.restore();
        }
      }
    }
  };

  DRAW.compare = (A, d) => {
    const { g, T, u, tall, box, pr, t, local, hold, leaving } = A;
    const gap = 44 * u, cw = tall ? box.w : (box.w - gap) / 2, ch = tall ? (box.h - gap) / 2 : box.h * 0.96;
    // The scene keeps building: left counts up cell by cell, then right, then the old number is struck
    // and the saving lands, then the strike keeps strobing on the beat.
    const L = leaving ? 99 : local;
    const cnt = [seg(L, 0.3, 0.3 + hold * 0.3), seg(L, 0.3 + hold * 0.33, 0.3 + hold * 0.47)];
    const strikeAt = 0.3 + hold * 0.52, deltaAt = 0.3 + hold * 0.62;
    const max = Math.max(d.leftValue, d.rightValue, 1), st = stp(t, 10);
    const sides = [[d.left, d.leftValue, false], [d.right, d.rightValue, true]];
    sides.forEach(([label, value, hot], i) => {
      const q = eo(seg(pr, i * 0.14, i * 0.14 + 0.55));
      const x = tall ? box.x : box.x + i * (cw + gap), y = tall ? box.y + i * (ch + gap) : box.y + (box.h - ch) / 2;
      g.save(); g.setLineDash([14 * u, 10 * u]); g.lineDashOffset = -t * 30 * u; g.lineWidth = 3 * u; g.strokeStyle = T.I(0.5); g.strokeRect(x, y, cw, ch); g.restore();
      if (q <= 0) return;
      g.save(); g.beginPath(); g.rect(x - 50 * u, y - 50 * u, (cw + 100 * u) * q, ch + 100 * u); g.clip();
      if (hot) for (let e = 3; e >= 1; e--) {
        if ((st + e) % 4 === 0) continue;
        const k = e * 15 * u * (1 + 0.4 * Math.sin(st * 0.8 + e));
        g.save(); g.globalAlpha = 0.6 / e; g.lineWidth = 3 * u; g.strokeStyle = T.ink; g.strokeRect(x + k, y - k * 0.5, cw, ch); g.restore();
      }
      g.fillStyle = hot ? T.ink : T.I(0.28); g.fillRect(x + 14 * u, y + 14 * u, cw, ch);
      g.fillStyle = hot ? T.acc : T.bg; g.fillRect(x, y, cw, ch);
      g.lineWidth = 5 * u; g.strokeStyle = T.ink; g.strokeRect(x + 2.5 * u, y + 2.5 * u, cw - 5 * u, ch - 5 * u);
      const face = hot ? T.onAcc : T.ink;
      // The label running through the panel.
      g.save(); g.beginPath(); g.rect(x, y, cw, ch); g.clip();
      const rowH = 84 * u, lab = (label || "").toUpperCase() + "  /  ", tile = wpp(lab) * rowH;
      g.font = fontStr(rowH); g.fillStyle = face; g.globalAlpha = 0.1; g.textBaseline = "alphabetic";
      for (let r = 0; r * rowH < ch + rowH; r++) {
        const sp = (60 + 40 * hash(r + i * 5)) * u * (r % 2 ? 1 : -1), off = ((((t * sp) % tile) + tile) % tile);
        for (let xx = x - off; xx < x + cw; xx += tile) g.fillText(lab, xx, y + (r + 1) * rowH);
      }
      g.restore();
      const lsz = 50 * u;
      slab(g, T, (label || "").toUpperCase(), x + 26 * u, y + 26 * u, lsz, { bg: T.ink, fg: T.bg, maxW: cw * 0.7, t });
      const segs = 14, target = Math.max(1, Math.round((value / max) * segs));
      const filled = Math.floor(target * cnt[i] + 1e-6), shownV = Math.round((filled / target) * value);
      const tickF = cnt[i] > 0 && cnt[i] < 1 ? (target * cnt[i]) % 1 : 1;
      const txt = window.DreamcutMotion.formatNumber(shownV, 0, d.prefix, d.suffix), full = window.DreamcutMotion.formatNumber(value, 0, d.prefix, d.suffix);
      const nsz = Math.min(ch * 0.46, 300 * u, (cw * 0.86) / (wpp(full) + 0.04)), nb = y + ch * 0.2 + 60 * u + nsz * capR();
      const sinceStrike = L - strikeAt, struck = !hot && sinceStrike > 0;
      const burst = (t * 0.9 + i * 0.4) % 1.8 < 0.15 ? 0.8 : 0, tickGl = tickF < 0.25 ? 0.5 : 0;
      const gl = Math.max(burst, 1 - q, tickGl, struck && sinceStrike < 0.3 ? 0.9 : 0);
      const nx0 = x + (hot && !tall ? 130 : 34) * u;
      if (hot || (struck && sinceStrike < 0.45)) strobe(g, T, txt, nx0, nb, nsz, hot ? { t, fill: face, echo: 2, echoColor: T.ink, glitch: gl, seed: i + 5 } : { t, back: T.bg, stroke: T.ink, lw: Math.max(3, nsz * 0.016), echo: 3, echoColor: T.acc, glitch: gl, seed: i + 5 });
      else type(g, txt, nx0, nb, nsz, { back: T.bg, stroke: T.ink, lw: Math.max(3, nsz * 0.016), t, glitch: gl, seed: i + 5 });
      if (struck) { // the strike, drawn on, then strobing on the beat
        const k = eo(sinceStrike / 0.25), nw = wpp(txt) * nsz, cap = nsz * capR();
        const on = sinceStrike < 0.6 || (sinceStrike - 0.6) % 1.7 > 0.2 || stp(sinceStrike, 14) % 2;
        if (on) {
          g.save(); g.strokeStyle = T.acc; g.lineWidth = 22 * u; g.lineCap = "butt";
          const x0 = nx0 - 20 * u, y0 = nb - cap * 0.15, x1 = nx0 + nw + 20 * u, y1 = nb - cap * 0.9;
          g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k); g.stroke(); g.restore();
        }
      }
      if (hot && L > deltaAt && value < max) { // the saving
        const dq = seg(L - deltaAt, 0, 0.3), lab = `-${Math.round((1 - value / max) * 100)}%`;
        const flick = (L - deltaAt) > 0.6 && (L - deltaAt - 0.6) % 1.7 < 0.16 && stp(L, 14) % 2;
        const dsz = 64 * u, dw = wpp(lab) * dsz + 0.64 * dsz;
        slab(g, T, lab, x + cw - dw - 26 * u, y + 26 * u, dsz, { bg: flick ? T.bg : T.ink, fg: flick ? T.ink : T.bg, clipW: dq, t, glitch: dq < 1 ? 0.7 : 0, seed: 31, shadow: T.bg, off: 8 * u });
      }
      // Segmented meter.
      const mx = x + 32 * u, mw = cw - 64 * u, my = y + ch - 40 * u - 46 * u, sw = mw / segs;
      const scan = stp(t, 12) % (segs + 6);
      for (let k = 0; k < segs; k++) {
        if (k < filled) { g.fillStyle = face; g.fillRect(mx + k * sw, my, sw - 6 * u, 46 * u); }
        else {
          g.lineWidth = 3 * u; g.strokeStyle = face; g.globalAlpha = 0.45; g.strokeRect(mx + k * sw + 1.5 * u, my + 1.5 * u, sw - 9 * u, 43 * u);
          g.globalAlpha = 1;
          if (k === scan) { g.fillStyle = face; g.globalAlpha = 0.4; g.fillRect(mx + k * sw, my, sw - 6 * u, 46 * u); g.globalAlpha = 1; }
        }
      }
      if (filled > 0 && cnt[i] < 1 && tickF < 0.4) { g.fillStyle = hot ? T.ink : T.acc; g.fillRect(mx + (filled - 1) * sw, my - 10 * u, sw - 6 * u, 56 * u); }
      else if (cnt[i] >= 1 && filled < segs && stp(t, 4) % 2) { g.fillStyle = hot ? T.ink : T.acc; g.globalAlpha = 0.5; g.fillRect(mx + filled * sw, my, sw - 6 * u, 46 * u); g.globalAlpha = 1; }
      g.restore();
    });
    // VS, cut into slices.
    const q = eo(seg(pr, 0.3, 0.7));
    if (q > 0) {
      const cx = tall ? box.x + box.w / 2 : box.x + cw + gap / 2, cy = tall ? box.y + ch + gap / 2 : box.y + box.h / 2;
      const s = 140 * u, a = stp(t, 8) * 0.19;
      g.save(); g.translate(cx, cy); g.globalAlpha = q;
      g.strokeStyle = T.ink; g.lineWidth = 6 * u;
      g.beginPath(); for (let k = 0; k < 10; k++) { const an = a + (k * TAU) / 10; g.moveTo(Math.cos(an) * s * 0.74, Math.sin(an) * s * 0.74); g.lineTo(Math.cos(an) * s * (k % 2 ? 0.92 : 1.06), Math.sin(an) * s * (k % 2 ? 0.92 : 1.06)); } g.stroke();
      g.fillStyle = T.ink; g.beginPath(); g.arc(0, 0, s * 0.68, 0, TAU); g.fill();
      type(g, "VS", 0, (s * 0.86 * capR()) / 2, s * 0.86, { fill: T.bg, align: "center", t, glitch: (t * 1.1) % 1.6 < 0.2 ? 0.9 : 0, seed: 9, bands: 5 });
      g.restore();
    }
  };

  // ---- stage ---------------------------------------------------------------------------------------
  function shownList() {
    const C = window.__dreamcut && window.__dreamcut.controls;
    return C ? ORDER.filter((id) => (C[id + "_hold"] ?? 0) > 0) : null;
  }
  function headRect(S) {
    const { W, H, u, tall } = S, side = (tall ? 90 : 140) * u;
    const boxY = tall ? H * 0.3 : H * 0.34, top = (tall ? 170 : 96) * u;
    return { x: side, y: top, w: W - side * 2, h: boxY - 24 * u - top };
  }
  function drawHead(g, T, S, id, info, local, exit) {
    const { W, H, u } = S;
    if (id === "title" || id === "closing") {
      const rect = { x: W * 0.045, y: 150 * u, w: W * 0.91, h: H - 150 * u - 120 * u };
      const lay = layout(words(id), rect, { maxSize: 640 * u, maxXs: 1.35, maxLines: 4 });
      poster(g, T, S, lay, rect, { t: info.t, local, exit, valign: "center", shift: id === "closing" ? 2 : 0, seed: id === "closing" ? 5 : 0 });
      if (id === "title") {
        const kk = document.getElementById("kicker");
        const kt = kk ? String(kk.textContent || "").toUpperCase() : "";
        if (kt) { const e = eo(seg(local, 0.15, 0.55)); slab(g, T, kt, W * 0.045, 100 * u, 44 * u, { bg: T.acc, fg: T.onAcc, maxW: W * 0.6, clipW: e, t: info.t }); }
      }
    } else {
      const rect = headRect(S);
      const lay = layout(words(id), rect, { maxSize: 250 * u, maxXs: 1.22, maxLines: 3 });
      poster(g, T, S, lay, rect, { t: info.t, local, exit, valign: "center" });
    }
  }
  function stage(ctx, S, info) {
    const { W, H } = S;
    const full = !!S.paint, g = ctx;
    const counter = (id, idx) => (id && id !== "title" ? `SCENE ${pad2(idx + 1)}` : "");
    const world = (T, id, idx, heads) => {
      const text = id ? words(id) : "TYPE STROBE";
      if (full) { g.fillStyle = T.bg; g.fillRect(0, 0, W, H); wall(g, T, S, info, text, id); halftone(g, T, S, info); }
      heads();
      if (full) chrome(g, T, S, info, text, counter(id, idx));
    };
    const T = theme(S, full && info.scene === "closing");
    const list = info.scene ? shownList() : null, prev = list && info.index > 0 ? list[info.index - 1] : null;
    const wait = prev ? info.change * 0.5 : 0;
    const newHead = () => { if (info.scene && info.local >= wait) drawHead(g, T, S, info.scene, info, info.local - wait, 0); };
    g.save();
    if (prev && info.local < info.change) {
      // The outgoing world stays ahead of the bars' leading edges; the new one is revealed behind them.
      const u01 = clamp(info.local / Math.max(0.01, info.change)), Tp = theme(S, full && prev === "closing");
      g.save(); coverClip(g, u01, W, H, false);
      world(Tp, prev, info.index - 1, () => drawHead(g, Tp, S, prev, info, info.hold + 1, u01));
      g.restore();
      g.save(); coverClip(g, u01, W, H, true); world(T, info.scene, info.index, newHead); g.restore();
    } else world(T, info.scene, info.index, newHead);
    g.restore();
  }

  // ---- grain and scan lines over everything -------------------------------------------------------
  let GR = null;
  function paint(ctx, W, H, t, accent, look) {
    ctx.clearRect(0, 0, W, H);
    if (!GR) {
      GR = document.createElement("canvas"); GR.width = GR.height = 256;
      const g = GR.getContext("2d"), img = g.createImageData(256, 256), r = rng(61);
      for (let i = 0; i < img.data.length; i += 4) { const v = r(); const dark = v < 0.5; img.data[i] = img.data[i + 1] = img.data[i + 2] = dark ? 0 : 255; img.data[i + 3] = Math.floor(Math.pow(r(), 3) * 150); }
      g.putImageData(img, 0, 0);
    }
    const step = stp(t, 12), ox = hash(step * 2) * 256, oy = hash(step * 2 + 1) * 256;
    const pat = ctx.createPattern(GR, "repeat");
    ctx.save(); ctx.translate(-ox, -oy); ctx.fillStyle = pat; ctx.globalAlpha = 0.5; ctx.fillRect(0, 0, W + 256, H + 256); ctx.restore();
    const u = Math.min(W, H) / 1080;
    ctx.save(); ctx.fillStyle = "rgba(0,0,0,0.07)";
    for (let y = ((step % 3) * u) | 0; y < H; y += 4 * u) ctx.fillRect(0, y, W, 1.2 * u);
    ctx.restore();
    const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,0.32)");
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  }

  // The template hands every drawer its scene data as the fifth argument; keep it for the shared wrapper.
  const wrap = (id) => (ctx, S, box, p, d, info) => {
    const T = theme(S, false), leaving = info && info.exit !== undefined;
    const meta = info || {};
    const t = meta.t ?? 0, local = meta.local ?? 0;
    const pr = leaving ? 1 : eo(seg(local, 0.05, Math.max(0.6, Math.min(1.15, (meta.hold || 3) * 0.4))));
    const first = !leaving && t - local < 0.001, ch = Math.max(0.01, meta.change || 0.45);
    ctx.save();
    if (leaving) { ctx.globalAlpha *= 1 - clamp(meta.exit * 1.4); coverClip(ctx, meta.exit, S.W, S.H, false); }
    else if (!first && local < ch) coverClip(ctx, local / ch, S.W, S.H, true);
    DRAW[id]({ g: ctx, T, S, u: S.u, tall: S.tall, box, pr, t, local, hold: meta.hold || 3, leaving }, d);
    ctx.restore();
    if (!first) wipe(ctx, T, leaving ? meta.exit : local / Math.max(0.01, meta.change || 0.45), S.W, S.H);
  };

  const MONOPAL = { bg: "#e9e9e6", panel: "#e9e9e6", ink: "#161616", muted: "#7a7a76", accent: "#161616", onAccent: "#e9e9e6", rule: "#161616", track: "rgba(22,22,22,0.12)", backdrop: () => "#e9e9e6" };
  return {
    bg: "#1a1bd8", panel: "#1a1bd8", ink: "#f4f0e6", muted: "#b9b7f2", accent: "#ff5a24", onAccent: "#12104a",
    rule: "#f4f0e6", track: "rgba(244,240,230,0.14)",
    display: FONT, displayWeight: 700, displayCase: "uppercase", displayTracking: "0em",
    body: FONT, bodyWeight: 700, figures: FONT, radius: 0,
    motion: "wipe", change: "grid", kit: { line: 4, fill: "solid", panel: "fill" },
    keepArt: true, overlap: true,
    // Headlines set straight on this look's backdrop, where its ink and accent (meant for panels) do not read.
    displayAccent: { light: "#b32916" },
    palettes: {
      light: { bg: "#f1ede2", panel: "#f1ede2", ink: "#121212", muted: "#6d6a62", accent: "#ff3b1f", onAccent: "#fff6e8", rule: "#121212", track: "rgba(18,18,18,0.1)", backdrop: () => "#f1ede2" },
      dark: { bg: "#0c0b10", panel: "#0c0b10", ink: "#f4f0e6", muted: "#9a96a6", accent: "#ff2fa0", onAccent: "#0c0b10", rule: "#f4f0e6", track: "rgba(244,240,230,0.14)", backdrop: () => "#0c0b10" },
      mono: MONOPAL,
    },
    css: () => ".display,.kicker{color:transparent !important;text-shadow:none !important;-webkit-text-stroke:0 !important}",
    backdrop: () => "#1a1bd8",
    paint, paintOver: true, stage,
    scenes: { chart: wrap("chart"), object: wrap("object"), people: wrap("people"), process: wrap("process"), compare: wrap("compare") },
  };
});
