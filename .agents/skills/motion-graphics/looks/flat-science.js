// Flat Science: a flat-vector science world in deep space. Every shape is outline-free: a gradient
// body, a dark crescent turned away from the light and a thin rim light on the shadow edge. Round
// characters with antenna bulbs, crater planets that turn, test tubes that fill and bubble, floating
// rock islands and ball-and-stick molecules. Scenes sit at different scales of one sky: each change
// dives the camera into the outgoing scene while the next grows out of the distance and an endless
// star field streams past. Frames are pure functions of time: seeded randomness only, no clocks.
window.DreamcutMotion.register("flat-science", ({ grain, rng }) => {
  const M = window.DreamcutMotion;
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const ei = (v) => Math.pow(clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const frac = (v) => v - Math.floor(v);
  const lerp = (a, b, k) => a + (b - a) * k;

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
  const WHITE = [255, 255, 255];

  function themeOf(L, accent, u) {
    const light = lum(rgb(L.bg)) > 150;
    const acc = rgb(accent);
    return {
      light, u, tex: L.texture ?? 1, acc, accS: accent,
      onAcc: lum(acc) > 165 ? (L.face || "#1d1440") : "#ffffff",
      sky: (L.sky || ["#0a0b30", "#1a1760", "#3d1f7c"]).map(rgb), neb: (L.neb || ["#2f8fd8", "#b24bd6", "#ff7aa8"]).map(rgb),
      cols: (L.cols || ["#ff7a6b", "#3fd2cf", "#ffd25e", "#a98bff", "#5fe3a1", "#ff8cc6"]).map(rgb),
      shade: rgb(L.shade || "#1b0f4a"), rim: rgb(L.rim || "#9ff3ff"), face: L.face || "#1d1440",
      pill: L.pill || "#ffffff", pillInk: L.pillInk || "#1d1650", ink: L.ink, inkC: rgb(L.ink), muted: L.muted,
      rock: (L.rock || ["#5a3fa8", "#8f78e6"]).map(rgb), device: (L.device || ["#ece9ff", "#b3a8f2"]).map(rgb),
      screen: rgb(L.screen || "#1c1645"), starA: L.starA ?? 1,
    };
  }
  const theme = (S) => themeOf(S.look, S.accent, S.u);

  // ---- noise for the finishing grain --------------------------------------------------------------
  let NOISE = null;
  function noise() {
    if (NOISE) return NOISE;
    const c = document.createElement("canvas");
    c.width = c.height = 200;
    const g = c.getContext("2d");
    const img = g.createImageData(200, 200);
    const r = rng(23);
    for (let i = 0; i < img.data.length; i += 4) { const v = r() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    return (NOISE = c);
  }

  // ---- timing: the same scene list the template builds, read from the controls -------------------
  const IDS = ["title", "chart", "object", "people", "process", "compare", "closing"];
  const DEF = [2.4, 3.4, 3.6, 3.2, 3.6, 3.2, 2.4];
  const CTL = () => (window.__dreamcut && window.__dreamcut.controls) || {};
  let PLAN = null;
  function plan(change) {
    const c = CTL();
    const holds = IDS.map((id, i) => Number(c[id + "_hold"] ?? DEF[i]));
    const key = holds.join(",") + "|" + change;
    if (PLAN && PLAN.key === key) return PLAN;
    let at = 0;
    const shown = [];
    holds.forEach((h, i) => { if (h > 0) shown.push({ id: IDS[i], start: at, hold: h }); at += h; });
    return (PLAN = { key, shown, change, length: at });
  }
  // The template's illustration box and scene data, rebuilt for the final frame.
  function boxOf(S) {
    const side = (S.tall ? 90 : 140) * S.u;
    return S.tall ? { x: side, y: S.H * 0.3, w: S.W - side * 2, h: S.H * 0.6 } : { x: side, y: S.H * 0.34, w: S.W - side * 2, h: S.H * 0.58 };
  }
  function dataOf() {
    const c = CTL();
    return {
      chart: { labels: [c.bar_1_label, c.bar_2_label, c.bar_3_label, c.bar_4_label], values: [c.bar_1, c.bar_2, c.bar_3, c.bar_4], suffix: c.chart_suffix, prefix: "", highlight: Number(c.highlight) - 1 },
      object: { kind: c.device, callouts: [c.callout_1, c.callout_2, c.callout_3] },
      people: { count: c.people_count, badges: [c.badge_1, c.badge_2, c.badge_3], highlight: 1 },
      process: { steps: [c.step_1, c.step_2, c.step_3] },
      compare: { left: c.before_label, leftValue: c.before_value, right: c.after_label, rightValue: c.after_value, suffix: c.compare_suffix, prefix: "" },
    };
  }
  // Total zoom travelled by time t: a slow drift plus one full dive per scene change.
  function zoomAt(P, t) {
    let z = 0.03 * t;
    for (let i = 1; i < P.shown.length; i++) z += eio((t - (P.shown[i].start - P.change)) / (2 * P.change));
    return z;
  }

  // ---- camera through scale -----------------------------------------------------------------------
  // A scene arrives growing out of the distance and leaves by diving into its focal point. The dive
  // starts as the headline leaves (one change before the cut) and finishes one change after it.
  function camAt(P, idx, local) {
    const sc = P.shown[idx] || { hold: 3 };
    const T = P.change;
    let sIn = 1 + 0.045 * clamp(local / Math.max(1, sc.hold)), sOut = 1, a = 1;
    if (idx > 0 && local < T) { const g = clamp(local / T); sIn *= 0.16 + 0.84 * eo(g); a *= seg(g, 0, 0.42); }
    else if (idx === 0 && local < 0.6) sIn *= 0.94 + 0.06 * eo(local / 0.6);
    if (idx < P.shown.length - 1 && local > sc.hold - T) {
      const o = clamp((local - (sc.hold - T)) / (2 * T));
      sOut = Math.pow(9, ei(o));
      a *= 1 - seg(o, 0.55, 0.93);
    }
    return { sIn, sOut, a };
  }
  function applyCam(ctx, cam, fi, fo, par = 1) {
    const so = Math.pow(cam.sOut, par), si = Math.pow(cam.sIn, par);
    ctx.translate(fo[0], fo[1]); ctx.scale(so, so); ctx.translate(-fo[0], -fo[1]);
    ctx.translate(fi[0], fi[1]); ctx.scale(si, si); ctx.translate(-fi[0], -fi[1]);
  }

  // ---- primitives ---------------------------------------------------------------------------------
  function rrPath(ctx, x, y, w, h, r) {
    const q = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.moveTo(x + q, y); ctx.arcTo(x + w, y, x + w, y + h, q); ctx.arcTo(x + w, y + h, x, y + h, q);
    ctx.arcTo(x, y + h, x, y, q); ctx.arcTo(x, y, x + w, y, q); ctx.closePath();
  }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); rrPath(ctx, x, y, w, h, r); }
  function glow(ctx, x, y, r, c, a = 0.5) {
    if (r <= 0 || a <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(c, a)); g.addColorStop(0.45, rgba(c, a * 0.35)); g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Flat volume: rim colour underneath, a dark body cut one rim-width up-left, then the lit body cut
  // further up-left — leaving a shadow crescent and a thin rim light on the far edge. No outlines.
  function volume(ctx, th, path, x, y, r, col, o = {}) {
    const dark = mix(col, th.shade, o.dark ?? 0.42), lite = mix(col, WHITE, o.lite ?? 0.22);
    const rimC = mix(col, th.rim, o.rimMix ?? 0.62);
    ctx.save();
    path(); ctx.clip();
    const big = r * 4 + 4;
    ctx.fillStyle = rgba(rimC); ctx.fillRect(x - big, y - big, big * 2, big * 2);
    const d = r * (o.rimW ?? 0.07);
    ctx.save(); ctx.translate(-d, -d * 0.7); path(); ctx.fillStyle = rgba(dark); ctx.fill(); ctx.restore();
    const cut = r * (o.cut ?? 0.2);
    ctx.save(); ctx.translate(-cut, -cut * 0.85); path();
    const g = ctx.createLinearGradient(x - r, y - r, x + r * 0.5, y + r);
    g.addColorStop(0, rgba(lite)); g.addColorStop(1, rgba(col));
    ctx.fillStyle = g; ctx.fill(); ctx.restore();
    if (o.inner) o.inner();
    ctx.restore();
    if (o.shine !== false) {
      ctx.save(); ctx.translate(x + r * (o.shineX ?? -0.42), y + r * (o.shineY ?? -0.5)); ctx.rotate(-0.65);
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.2, r * 0.085, 0, 0, TAU);
      ctx.fillStyle = `rgba(255,255,255,${o.shineA ?? 0.5})`; ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.3, r * 0.02, r * 0.045, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }
  function sphere(ctx, th, x, y, r, col, o = {}) {
    volume(ctx, th, () => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }, x, y, r, col, o);
  }
  function sparkle(ctx, x, y, s, c, a = 1) {
    if (a <= 0 || s <= 0) return;
    ctx.save(); ctx.translate(x, y); ctx.globalAlpha *= a;
    ctx.beginPath(); ctx.moveTo(0, -s); ctx.quadraticCurveTo(0, 0, s, 0); ctx.quadraticCurveTo(0, 0, 0, s);
    ctx.quadraticCurveTo(0, 0, -s, 0); ctx.quadraticCurveTo(0, 0, 0, -s);
    ctx.fillStyle = typeof c === "string" ? c : rgba(c); ctx.fill();
    ctx.restore();
  }
  // Pop in: scale with a little overshoot around a point.
  function pop(ctx, q, x, y) {
    const s = Math.max(0.001, back(q));
    ctx.globalAlpha *= clamp(q * 2.5);
    ctx.translate(x, y); ctx.scale(s, s); ctx.translate(-x, -y);
  }

  // ---- type ---------------------------------------------------------------------------------------
  function font(S, size, kind = "b") {
    const L = S.look;
    if (kind === "n") return `700 ${size}px ${L.figures}`;
    if (kind === "d") return `${L.displayWeight} ${size}px ${L.display}`;
    return `700 ${size}px ${L.body}`;
  }
  function textW(ctx, S, s, size, kind = "b") { ctx.save(); ctx.font = font(S, size, kind); const w = ctx.measureText(String(s)).width; ctx.restore(); return w; }
  // Big figures with a flat drop shadow, the medium's way of lifting type off the art.
  function figure(ctx, S, th, s, x, y, size, o = {}) {
    ctx.save();
    ctx.font = font(S, size, "n");
    ctx.textAlign = o.align || "center"; ctx.textBaseline = o.baseline || "alphabetic";
    ctx.fillStyle = rgba(th.shade, th.light ? 0.22 : 0.55);
    ctx.fillText(s, x, y + size * 0.07);
    if (o.glow) { ctx.shadowColor = o.color || th.accS; ctx.shadowBlur = size * 0.35; }
    ctx.fillStyle = o.color || th.ink;
    ctx.fillText(s, x, y);
    ctx.restore();
  }
  function pillSize(ctx, S, s, size, o = {}) {
    const tw = textW(ctx, S, s, size);
    const lead = o.num != null || o.icon ? size * 1.3 : 0;
    return { w: tw + size * 1.2 + lead, h: size * 1.62, lead };
  }
  function pill(ctx, S, th, s, x, y, size, o = {}) {
    const { w, h, lead } = pillSize(ctx, S, s, size, o);
    const x0 = o.align === "left" ? x : o.align === "right" ? x - w : x - w / 2, y0 = y - h / 2;
    ctx.save();
    rr(ctx, x0, y0 + size * 0.16, w, h, h / 2); ctx.fillStyle = rgba(th.shade, th.light ? 0.2 : 0.45); ctx.fill();
    const fill = o.fill || th.pill;
    if (o.tail) {
      ctx.beginPath(); ctx.moveTo(x - size * 0.34, y0 + h - 2); ctx.lineTo(x, y0 + h + size * 0.42); ctx.lineTo(x + size * 0.34, y0 + h - 2); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
    }
    rr(ctx, x0, y0, w, h, h / 2); ctx.fillStyle = fill; ctx.fill();
    ctx.save(); rr(ctx, x0, y0, w, h, h / 2); ctx.clip(); ctx.fillStyle = "rgba(255,255,255,0.22)"; ctx.fillRect(x0, y0, w, h * 0.42); ctx.restore();
    if (lead) {
      const cx = x0 + h / 2, cy = y, cr = h * 0.36;
      ctx.beginPath(); ctx.arc(cx, cy, cr, 0, TAU); ctx.fillStyle = o.leadFill || th.accS; ctx.fill();
      if (o.num != null) {
        ctx.font = font(S, size * 0.82, "n"); ctx.fillStyle = o.leadInk || th.onAcc; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(String(o.num), cx, cy + size * 0.04);
      } else icon(ctx, o.icon, cx, cy, cr * 1.3, o.leadInk || th.onAcc);
    }
    ctx.font = font(S, size); ctx.fillStyle = o.ink || th.pillInk; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(String(s), x0 + size * 0.6 + lead, y + size * 0.05);
    ctx.restore();
    return { x: x0, y: y0, w, h };
  }
  // Fit a label size between a preferred size and the legibility floor.
  function fitSize(ctx, S, s, size, maxW, floor) {
    let z = size;
    while (z > floor && textW(ctx, S, s, z) + z * 1.2 > maxW) z *= 0.95;
    return Math.max(floor, z);
  }

  // Filled flat icons.
  function icon(ctx, name, x, y, s, color) {
    ctx.save();
    ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (name === "doc") {
      ctx.beginPath(); ctx.moveTo(x - s * 0.32, y - s * 0.42); ctx.lineTo(x + s * 0.12, y - s * 0.42); ctx.lineTo(x + s * 0.32, y - s * 0.22);
      ctx.lineTo(x + s * 0.32, y + s * 0.42); ctx.lineTo(x - s * 0.32, y + s * 0.42); ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = "destination-out"; ctx.lineWidth = s * 0.08;
      ctx.beginPath(); for (let k = 0; k < 3; k++) { ctx.moveTo(x - s * 0.18, y - s * 0.08 + k * s * 0.16); ctx.lineTo(x + s * (k === 2 ? 0.04 : 0.18), y - s * 0.08 + k * s * 0.16); } ctx.stroke();
    } else if (name === "spark") {
      sparkle(ctx, x, y, s * 0.46, color); sparkle(ctx, x + s * 0.32, y - s * 0.3, s * 0.16, color);
    } else if (name === "check") {
      ctx.lineWidth = s * 0.16; ctx.beginPath(); ctx.moveTo(x - s * 0.3, y + s * 0.02); ctx.lineTo(x - s * 0.08, y + s * 0.24); ctx.lineTo(x + s * 0.32, y - s * 0.22); ctx.stroke();
    } else if (name === "heart") {
      ctx.beginPath(); ctx.moveTo(x, y + s * 0.34);
      ctx.bezierCurveTo(x - s * 0.5, y + s * 0.02, x - s * 0.36, y - s * 0.42, x, y - s * 0.16);
      ctx.bezierCurveTo(x + s * 0.36, y - s * 0.42, x + s * 0.5, y + s * 0.02, x, y + s * 0.34); ctx.fill();
    } else if (name === "play") {
      ctx.beginPath(); ctx.moveTo(x - s * 0.2, y - s * 0.3); ctx.lineTo(x + s * 0.32, y); ctx.lineTo(x - s * 0.2, y + s * 0.3); ctx.closePath(); ctx.fill();
    } else if (name === "dial") {
      ctx.beginPath(); ctx.arc(x, y, s * 0.34, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = "destination-out"; ctx.lineWidth = s * 0.1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s * 0.18, y - s * 0.18); ctx.stroke();
    }
    ctx.restore();
  }

  // ---- characters ---------------------------------------------------------------------------------
  function bodyPath(ctx, kind, x, y, r) {
    ctx.beginPath();
    if (kind === 1) rrPath(ctx, x - r, y - r * 0.9, r * 2, r * 1.8, r * 0.74);
    else if (kind === 2) {
      ctx.moveTo(x, y - r * 1.3);
      ctx.bezierCurveTo(x + r * 0.45, y - r * 0.95, x + r, y - r * 0.5, x + r, y + r * 0.06);
      ctx.arc(x, y + r * 0.06, r, 0, Math.PI);
      ctx.bezierCurveTo(x - r, y - r * 0.5, x - r * 0.45, y - r * 0.95, x, y - r * 1.3);
      ctx.closePath();
    } else ctx.arc(x, y, r, 0, TAU);
  }
  function face(ctx, th, x, y, r, mood, t, seed) {
    const ph = frac((t + seed * 0.77) / 3.6) * 3.6;
    const blink = ph < 0.16 ? 1 - Math.sin((ph / 0.16) * Math.PI) * 0.92 : 1;
    const gx = Math.sin(t * 0.7 + seed) * 0.03 * r;
    for (const s of [-1, 1]) {
      const ex = x + s * r * 0.33, ey = y - r * 0.06;
      if (mood === "dizzy") {
        ctx.save(); ctx.strokeStyle = th.face; ctx.lineWidth = r * 0.06; ctx.lineCap = "round"; ctx.beginPath();
        for (let k = 0; k <= 24; k++) { const a = k * 0.55 + t * 4 * s, rad = r * 0.012 * k * 0.55; const px = ex + Math.cos(a) * rad, py = ey + Math.sin(a) * rad; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
        ctx.stroke(); ctx.restore();
        continue;
      }
      if (mood === "joy") {
        ctx.save(); ctx.strokeStyle = th.face; ctx.lineWidth = r * 0.075; ctx.lineCap = "round";
        ctx.beginPath(); ctx.arc(ex, ey + r * 0.04, r * 0.12, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); ctx.restore();
        continue;
      }
      ctx.beginPath(); ctx.ellipse(ex, ey, r * 0.155, r * 0.2 * blink, 0, 0, TAU); ctx.fillStyle = "#ffffff"; ctx.fill();
      if (blink > 0.3) {
        ctx.beginPath(); ctx.ellipse(ex + gx + s * r * 0.01, ey + r * 0.025, r * 0.105, r * 0.125 * blink, 0, 0, TAU); ctx.fillStyle = th.face; ctx.fill();
        ctx.beginPath(); ctx.arc(ex + gx - r * 0.04, ey - r * 0.04 * blink, r * 0.04, 0, TAU); ctx.fillStyle = "#ffffff"; ctx.fill();
      }
    }
    ctx.fillStyle = "rgba(255,120,150,0.5)";
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + s * r * 0.56, y + r * 0.18, r * 0.12, r * 0.07, 0, 0, TAU); ctx.fill(); }
    ctx.save(); ctx.fillStyle = th.face; ctx.strokeStyle = th.face; ctx.lineCap = "round"; ctx.lineWidth = r * 0.06;
    if (mood === "wow") {
      ctx.beginPath(); ctx.ellipse(x, y + r * 0.27, r * 0.1, r * 0.13, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x, y + r * 0.33, r * 0.06, r * 0.04, 0, 0, TAU); ctx.fillStyle = "#ff7b93"; ctx.fill();
    } else if (mood === "grin" || mood === "joy") {
      ctx.beginPath(); ctx.moveTo(x - r * 0.17, y + r * 0.17); ctx.quadraticCurveTo(x, y + r * 0.46, x + r * 0.17, y + r * 0.17); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x, y + r * 0.3, r * 0.07, r * 0.035, 0, 0, TAU); ctx.fillStyle = "#ff7b93"; ctx.fill();
    } else if (mood === "dizzy") {
      ctx.beginPath(); ctx.moveTo(x - r * 0.14, y + r * 0.28);
      for (let k = 1; k <= 4; k++) ctx.lineTo(x - r * 0.14 + k * r * 0.07, y + r * 0.28 + (k % 2 ? -1 : 1) * r * 0.04);
      ctx.stroke();
    } else { ctx.beginPath(); ctx.arc(x, y + r * 0.14, r * 0.14, Math.PI * 0.18, Math.PI * 0.82); ctx.stroke(); }
    ctx.restore();
  }
  // A round character: body shape 0 round, 1 soft square, 2 drop; arms, feet, an antenna bulb.
  function critter(ctx, S, th, x, y, r, o = {}) {
    const t = o.t || 0, seed = o.seed || 0, kind = o.kind || 0;
    const col = o.col || th.cols[0];
    const bob = Math.sin(t * 2.3 + seed * 1.7) * r * 0.07 * (o.bob ?? 1);
    const by = y + bob;
    const mid = mix(col, th.shade, 0.18);
    if (o.shadow !== false) { ctx.beginPath(); ctx.ellipse(x, y + r * 1.12, r * (0.72 - bob / r), r * 0.13, 0, 0, TAU); ctx.fillStyle = rgba(th.shade, th.light ? 0.16 : 0.35); ctx.fill(); }
    // Antenna and bulb.
    const top = kind === 2 ? by - r * 1.28 : kind === 1 ? by - r * 0.88 : by - r * 0.97;
    const sway = Math.sin(t * 3 + seed) * r * 0.1;
    const bx = x + r * 0.28 + sway, byb = top - r * 0.5;
    ctx.save(); ctx.strokeStyle = rgba(mid); ctx.lineWidth = r * 0.07; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x + r * 0.06, top + r * 0.08); ctx.quadraticCurveTo(x + r * 0.1, byb + r * 0.15, bx, byb); ctx.stroke(); ctx.restore();
    const bulbC = o.bulb || th.acc;
    glow(ctx, bx, byb, r * 0.42, bulbC, 0.35 + 0.25 * Math.sin(t * 4 + seed));
    sphere(ctx, th, bx, byb, r * 0.13, bulbC, { cut: 0.25, shineA: 0.7 });
    // Feet.
    for (const s of [-1, 1]) {
      const fy = by + r * (kind === 1 ? 0.92 : 0.95);
      volume(ctx, th, () => { ctx.beginPath(); ctx.ellipse(x + s * r * 0.36, fy, r * 0.25, r * 0.15, 0, 0, TAU); }, x + s * r * 0.36, fy, r * 0.25, mid, { shine: false });
    }
    // Arms: rest angled down; o.wave (0..1) lifts and waves the right arm; o.point aims it.
    const arm = (s, ang) => {
      const ax = x + s * r * 0.86, ay = by + r * 0.16;
      const len = r * 0.5;
      const hx = ax + Math.cos(ang) * len * s, hy = ay + Math.sin(ang) * len;
      ctx.save(); ctx.strokeStyle = rgba(mid); ctx.lineWidth = r * 0.22; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(hx, hy); ctx.stroke(); ctx.restore();
      sphere(ctx, th, hx, hy, r * 0.14, col, { shine: false, cut: 0.25 });
    };
    const wave = o.wave || 0, waveL = o.waveL || 0;
    const rA = o.point != null ? o.point : lerp(0.75, -1.25 + Math.sin(t * 10 + seed) * 0.4, wave);
    arm(1, rA);
    arm(-1, lerp(0.75, -1.25 + Math.sin(t * 10 + seed + 1) * 0.4, waveL));
    volume(ctx, th, () => bodyPath(ctx, kind, x, by, r), x, by, r, col, { cut: 0.2 });
    // Belly patch.
    ctx.save(); bodyPath(ctx, kind, x, by, r); ctx.clip();
    ctx.beginPath(); ctx.ellipse(x - r * 0.05, by + r * 0.62, r * 0.52, r * 0.34, 0, 0, TAU); ctx.fillStyle = "rgba(255,255,255,0.16)"; ctx.fill();
    ctx.restore();
    if (o.prop) o.prop(by);
    face(ctx, th, x, by + (kind === 2 ? r * 0.08 : 0), r, o.mood || "smile", t, seed);
  }

  // ---- worlds -------------------------------------------------------------------------------------
  function ring(ctx, th, x, y, r, col, tilt, front) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
    ctx.lineCap = "butt";
    const a0 = front ? 0 : Math.PI, a1 = front ? Math.PI : TAU;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.72, r * 0.4, 0, a0, a1); ctx.strokeStyle = rgba(mix(col, th.shade, 0.25)); ctx.lineWidth = r * 0.2; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.72, r * 0.4, 0, a0, a1); ctx.strokeStyle = rgba(mix(col, WHITE, 0.25)); ctx.lineWidth = r * 0.07; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.98, r * 0.47, 0, a0, a1); ctx.strokeStyle = rgba(col, 0.55); ctx.lineWidth = r * 0.05; ctx.stroke();
    ctx.restore();
  }
  // A planet whose craters slide across as it turns; optional bands, ring and face.
  function planet(ctx, S, th, x, y, r, col, o = {}) {
    const t = o.t || 0, seed = o.seed || 1;
    if (o.halo) glow(ctx, x, y, r * 1.7, mix(col, th.rim, 0.3), o.halo);
    if (o.ring) ring(ctx, th, x, y, r, o.ringCol || th.cols[2], o.tilt ?? -0.32, false);
    const R = rng(seed * 31 + 7);
    const n = o.craters ?? 8;
    const craters = [];
    for (let i = 0; i < n; i++) craters.push([R(), (R() * 2 - 1) * 0.78, 0.07 + R() * 0.15]);
    const bands = o.bands ? [R() * 0.3 - 0.55, R() * 0.2 - 0.05, R() * 0.25 + 0.35] : [];
    volume(ctx, th, () => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }, x, y, r, col, {
      cut: 0.22, shineA: 0.35,
      inner: () => {
        bands.forEach((v, k) => {
          ctx.beginPath(); ctx.ellipse(x, y + v * r, r * 1.1, r * (0.07 + k * 0.03), -0.12, 0, TAU);
          ctx.fillStyle = k % 2 ? "rgba(255,255,255,0.13)" : rgba(th.shade, 0.14); ctx.fill();
        });
        for (const [u0, v, s] of craters) {
          const xr = frac(u0 + t * (o.spin ?? 0.025)) * 2.6 - 1.3;
          if (Math.abs(xr) > 1.15) continue;
          const fz = Math.sqrt(Math.max(0.06, 1 - xr * xr * 0.82));
          const cx = x + xr * r * 0.95, cy = y + v * r, rw = s * r * fz, rh = s * r * 0.82;
          ctx.beginPath(); ctx.ellipse(cx, cy, rw, rh, 0, 0, TAU); ctx.fillStyle = rgba(th.shade, 0.2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(cx + rw * 0.12, cy + rh * 0.16, rw * 0.78, rh * 0.7, 0, 0, TAU); ctx.fillStyle = rgba(th.shade, 0.12); ctx.fill();
          ctx.beginPath(); ctx.ellipse(cx + rw * 0.2, cy + rh * 0.5, rw * 0.6, rh * 0.2, 0, 0, Math.PI); ctx.fillStyle = "rgba(255,255,255,0.14)"; ctx.fill();
        }
      },
    });
    if (o.ring) ring(ctx, th, x, y, r, o.ringCol || th.cols[2], o.tilt ?? -0.32, true);
    if (o.face) face(ctx, th, x - r * 0.05, y + r * 0.02, r * 0.78, o.face, t, seed);
  }
  // A floating rock island: a lit top surface over a rounded underside, with a few gems.
  function island(ctx, S, th, cx, top, w, o = {}) {
    const u = S.u, seed = o.seed || 1;
    const ry = o.ry ?? w * 0.15, depth = o.depth ?? w * 0.5;
    const R = rng(seed * 13 + 5);
    const N = 7, pts = [];
    for (let k = 0; k <= N; k++) {
      const a = k / N, xx = cx - w / 2 + w * a;
      const yy = top + depth * Math.pow(Math.sin(Math.PI * a), 0.8) * (k === 0 || k === N ? 0 : 0.72 + 0.4 * R());
      pts.push([xx, yy]);
    }
    const path = () => {
      ctx.beginPath(); ctx.moveTo(pts[0][0], top);
      for (let k = 1; k < pts.length; k++) { const p0 = pts[k - 1], p1 = pts[k]; ctx.quadraticCurveTo(p0[0], p0[1], (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2); }
      ctx.lineTo(cx + w / 2, top);
      ctx.ellipse(cx, top, w / 2, ry, 0, 0, Math.PI, true);
      ctx.closePath();
    };
    const rc = o.col || th.rock[0];
    volume(ctx, th, path, cx, top + depth * 0.35, Math.min(w * 0.5, depth), rc, { cut: 0.1, rimW: 0.05, shine: false, dark: 0.5,
      inner: () => { for (let k = 0; k < 5; k++) { const xx = cx - w * 0.35 + w * 0.7 * R(), yy = top + ry + (depth - ry) * 0.5 * R(); ctx.beginPath(); ctx.ellipse(xx, yy, w * 0.03, w * 0.018, 0, 0, TAU); ctx.fillStyle = rgba(th.shade, 0.25); ctx.fill(); } } });
    const g = ctx.createLinearGradient(cx - w / 2, top - ry, cx + w / 2, top + ry);
    g.addColorStop(0, rgba(mix(o.topCol || th.rock[1], WHITE, 0.2))); g.addColorStop(1, rgba(o.topCol || th.rock[1]));
    ctx.beginPath(); ctx.ellipse(cx, top, w / 2, ry, 0, 0, TAU); ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.ellipse(cx, top, w / 2, ry, 0, 0.1, Math.PI - 0.1); ctx.strokeStyle = rgba(mix(th.rock[1], th.rim, 0.6), 0.85); ctx.lineWidth = Math.max(2, ry * 0.12); ctx.stroke(); ctx.restore();
    // Gems.
    const gems = o.gems ?? 2;
    for (let k = 0; k < gems; k++) {
      const gx = cx + (k % 2 ? 1 : -1) * w * (0.28 + 0.1 * R()), gy = top - ry * 0.1 + ry * 0.4 * R();
      const gh = Math.max(14 * u, w * 0.09) * (0.8 + 0.4 * R()), gw = gh * 0.42;
      const gc = th.cols[(seed + k * 2) % th.cols.length];
      ctx.beginPath(); ctx.moveTo(gx - gw, gy); ctx.lineTo(gx, gy - gh); ctx.lineTo(gx, gy + gh * 0.08); ctx.closePath(); ctx.fillStyle = rgba(mix(gc, WHITE, 0.3)); ctx.fill();
      ctx.beginPath(); ctx.moveTo(gx + gw, gy); ctx.lineTo(gx, gy - gh); ctx.lineTo(gx, gy + gh * 0.08); ctx.closePath(); ctx.fillStyle = rgba(mix(gc, th.shade, 0.3)); ctx.fill();
    }
  }
  // A ball-and-stick molecule tumbling slowly.
  function molecule(ctx, S, th, x, y, s, t, seed = 1) {
    const R = rng(seed * 17 + 3);
    const n = 3 + (seed % 2);
    const rot = t * (0.35 + R() * 0.2) * (seed % 2 ? 1 : -1);
    const atoms = [[0, 0, s * 0.3, th.cols[seed % th.cols.length]]];
    for (let k = 0; k < n; k++) {
      const a = rot + (k / n) * TAU + R() * 0.4;
      const d = s * (0.62 + R() * 0.2);
      atoms.push([Math.cos(a) * d, Math.sin(a) * d * 0.8, s * (0.16 + R() * 0.08), th.cols[(seed + k + 1) % th.cols.length]]);
    }
    ctx.save(); ctx.lineCap = "round";
    for (let k = 1; k < atoms.length; k++) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + atoms[k][0], y + atoms[k][1]);
      ctx.strokeStyle = th.light ? "rgba(70,50,150,0.35)" : "rgba(255,255,255,0.4)"; ctx.lineWidth = s * 0.09; ctx.stroke();
    }
    ctx.restore();
    atoms.slice().sort((a, b) => a[1] - b[1]).forEach(([ax, ay, ar, c]) => sphere(ctx, th, x + ax, y + ay, ar, c, { cut: 0.24 }));
  }
  // Small tumbling asteroids drifting through a scene's empty space.
  function rocks(ctx, S, th, spots, t, seed = 1) {
    const u = S.u;
    spots.forEach(([x, y, s], k) => {
      const R = rng(seed * 19 + k * 7);
      const N = 7, rad = [];
      for (let i = 0; i < N; i++) rad.push(0.78 + R() * 0.32);
      const rot = t * (0.3 + R() * 0.4) * (k % 2 ? 1 : -1);
      const yy = y + Math.sin(t * 0.9 + k * 1.7) * 12 * u, xx = x + Math.cos(t * 0.6 + k) * 8 * u;
      const path = () => {
        ctx.beginPath();
        for (let i = 0; i <= N; i++) {
          const a0 = rot + ((i % N) / N) * TAU, a1 = rot + (((i + 0.5) % N) / N) * TAU;
          const p0 = [xx + Math.cos(a0) * s * rad[i % N], yy + Math.sin(a0) * s * rad[i % N] * 0.82];
          const m = [xx + Math.cos(a1) * s * 0.98, yy + Math.sin(a1) * s * 0.8];
          if (i === 0) ctx.moveTo(p0[0], p0[1]); else ctx.quadraticCurveTo(p0[0], p0[1], m[0], m[1]);
        }
        ctx.closePath();
      };
      volume(ctx, th, path, xx, yy, s, mix(th.rock[1], th.cols[3], 0.2), { cut: 0.22, shineA: 0.3,
        inner: () => { ctx.beginPath(); ctx.ellipse(xx + Math.cos(rot) * s * 0.3, yy + Math.sin(rot) * s * 0.2, s * 0.22, s * 0.16, 0, 0, TAU); ctx.fillStyle = rgba(th.shade, 0.22); ctx.fill(); } });
    });
  }
  // A dotted trail along sampled points, drawn up to fraction q.
  function dots(ctx, S, th, ptsFn, q, color, gap, size) {
    if (q <= 0) return;
    let len = 0, prev = ptsFn(0);
    const N = 80, P = [prev];
    for (let i = 1; i <= N; i++) { const p = ptsFn(i / N); len += Math.hypot(p[0] - prev[0], p[1] - prev[1]); P.push(p); prev = p; }
    const steps = Math.max(1, Math.floor(len / gap));
    ctx.fillStyle = color;
    for (let k = 0; k <= steps * q; k++) {
      const f = (k / steps) * N, i = Math.floor(f), m = f - i;
      const a = P[Math.min(N, i)], b = P[Math.min(N, i + 1)];
      ctx.beginPath(); ctx.arc(lerp(a[0], b[0], m), lerp(a[1], b[1], m), size, 0, TAU); ctx.fill();
    }
  }
  const quad = (a, c, b) => (k) => [(1 - k) * (1 - k) * a[0] + 2 * (1 - k) * k * c[0] + k * k * b[0], (1 - k) * (1 - k) * a[1] + 2 * (1 - k) * k * c[1] + k * k * b[1]];

  // ---- sky ----------------------------------------------------------------------------------------
  function sky(ctx, W, H, th, t) {
    const g = ctx.createLinearGradient(0, 0, W * 0.25, H);
    g.addColorStop(0, rgba(th.sky[0])); g.addColorStop(0.55, rgba(th.sky[1])); g.addColorStop(1, rgba(th.sky[2]));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // Soft nebula clouds drifting.
    const m = Math.min(W, H);
    const blobs = [[0.82, 0.18, 0.62, 0], [0.12, 0.8, 0.7, 1], [0.55, 0.62, 0.5, 2], [0.3, 0.12, 0.42, 1]];
    blobs.forEach(([bx, by, br, ci], k) => {
      const x = W * bx + Math.sin(t * 0.07 + k * 2) * m * 0.05, y = H * by + Math.cos(t * 0.05 + k) * m * 0.04;
      glow(ctx, x, y, m * br, th.neb[ci], th.light ? 0.4 : 0.3);
    });
  }
  // An endless star field: four layers each grow through one zoom cycle, fading in at the centre.
  const STARS = [];
  for (let k = 0; k < 4; k++) {
    const R = rng(101 + k * 7);
    const list = [];
    for (let i = 0; i < 80; i++) list.push([R() * 2 - 1, R() * 2 - 1, 0.5 + R(), R() * TAU, 0.6 + R() * 2.2, R() < 0.07]);
    STARS.push(list);
  }
  function starfield(ctx, S, th, t, P) {
    const { W, H, u } = S;
    const z = zoomAt(P, t), dz = z - zoomAt(P, t - 0.05);
    const cx = W / 2, cy = H * 0.5, R = Math.hypot(W, H) * 0.5;
    const pos = (s, f) => { const k = 0.32 * Math.pow(7, f); return [cx + s[0] * R * k, cy + s[1] * R * k]; };
    const starC = th.light ? [255, 255, 255] : [235, 236, 255];
    ctx.save(); ctx.lineCap = "round";
    for (let L = 0; L < 4; L++) {
      const f = frac(z + L / 4);
      const a0 = seg(f, 0, 0.22) * th.starA;
      for (const s of STARS[L]) {
        const [x, y] = pos(s, f);
        if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
        const size = (0.7 + 2.4 * f) * s[2] * u;
        const tw = 0.6 + 0.4 * Math.sin(t * s[4] + s[3]);
        const a = a0 * tw;
        if (dz > 0.006 && f - dz * 1.6 > 0) {
          const [px, py] = pos(s, f - dz * 1.6);
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.strokeStyle = rgba(starC, a * 0.8); ctx.lineWidth = size * 1.2; ctx.stroke();
        }
        if (s[5]) { glow(ctx, x, y, size * 6, th.neb[0], a * 0.5); sparkle(ctx, x, y, size * 3.2, rgba(starC), a); }
        else { ctx.beginPath(); ctx.arc(x, y, size, 0, TAU); ctx.fillStyle = rgba(starC, a); ctx.fill(); }
      }
    }
    ctx.restore();
  }
  // A small spiral galaxy and a comet that crosses now and then.
  function farThings(ctx, S, th, t) {
    const { W, H, u } = S;
    const gx = W * (S.tall ? 0.78 : 0.66), gy = H * (S.tall ? 0.08 : 0.16), gr = 110 * u;
    ctx.save(); ctx.translate(gx, gy); ctx.rotate(-0.4); ctx.scale(1, 0.42);
    glow(ctx, 0, 0, gr * 0.8, th.neb[1], 0.35);
    const R = rng(77);
    for (let i = 0; i < 70; i++) {
      const arm = i % 2, k = R();
      const a = arm * Math.PI + k * 4.2 + t * 0.12, d = gr * (0.12 + k * 0.85);
      ctx.beginPath(); ctx.arc(Math.cos(a) * d + (R() - 0.5) * 10 * u, Math.sin(a) * d + (R() - 0.5) * 10 * u, (1 + R() * 2) * u, 0, TAU);
      ctx.fillStyle = rgba(mix(th.neb[(i % 3)], WHITE, 0.6), 0.55 * th.starA + 0.2); ctx.fill();
    }
    glow(ctx, 0, 0, gr * 0.22, WHITE, 0.7);
    ctx.restore();
    const per = 7, f = frac(t / per + 0.62);
    if (f < 0.3) {
      const k = f / 0.3;
      const x = lerp(W * 1.05, W * 0.38, k), y = lerp(H * 0.04, H * 0.36, k);
      const dx = W * 0.67, dy = -H * 0.32, len = Math.hypot(dx, dy);
      const tl = 260 * u;
      const g = ctx.createLinearGradient(x, y, x + (dx / len) * tl, y + (dy / len) * tl);
      g.addColorStop(0, `rgba(255,255,255,${0.85 * Math.sin(Math.PI * k)})`); g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.save(); ctx.lineCap = "round"; ctx.strokeStyle = g; ctx.lineWidth = 7 * u;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (dx / len) * tl, y + (dy / len) * tl); ctx.stroke(); ctx.restore();
      glow(ctx, x, y, 26 * u, th.rim, 0.8 * Math.sin(Math.PI * k));
    }
  }
  // Set dressing behind each scene: a large planet off one edge, a small ringed one and a moon.
  const PLATE = {
    title: { big: [0.1, 1.06, 0.36, 3, true], small: [0.9, 0.13, 0.07, 1], moon: [0.48, 0.1, 0.03] },
    chart: { big: [0.94, -0.04, 0.3, 0, false], small: [0.04, 0.9, 0.06, 2], moon: [0.62, 0.08, 0.025] },
    object: { big: [0.99, 1.02, 0.3, 1, true], small: [0.9, 0.12, 0.06, 3], moon: [0.05, 0.92, 0.03] },
    people: { big: [0.97, 0.02, 0.22, 5, false], small: [0.05, 0.94, 0.07, 0], moon: [0.7, 0.92, 0.025] },
    process: { big: [0.02, 1.04, 0.3, 4, true], small: [0.92, 0.1, 0.06, 5], moon: [0.6, 0.06, 0.03] },
    compare: { big: [0.95, -0.02, 0.26, 2, false], small: [0.06, 0.92, 0.06, 1], moon: [0.5, 0.94, 0.025] },
    closing: { big: null, small: [0.9, 0.12, 0.08, 4], moon: [0.4, 0.08, 0.03] },
  };
  function plate(ctx, S, th, id, t) {
    const p = PLATE[id];
    if (!p) return;
    const { W, H } = S, m = 1080 * S.u;
    // In a tall frame the headline sits lower and wider, so top-edge dressing moves up out of its way.
    const sy = S.tall && p.small && p.small[1] < 0.2 ? 0.045 : p.small && p.small[1];
    if (p.small) planet(ctx, S, th, W * p.small[0], H * sy, m * p.small[2], th.cols[p.small[3]], { t, seed: 5 + p.small[3], ring: true, ringCol: th.cols[(p.small[3] + 2) % 6], craters: 4, tilt: -0.25 });
    if (p.moon) sphere(ctx, th, W * p.moon[0], H * p.moon[1] + Math.sin(t * 0.6) * 6 * S.u, m * p.moon[2], mix(th.cols[3], WHITE, 0.4), { cut: 0.3 });
    const by = S.tall && p.big && p.big[1] < 0.2 ? p.big[1] - 0.05 : p.big && p.big[1];
    if (p.big) planet(ctx, S, th, W * p.big[0], H * by, m * p.big[2], mix(th.cols[p.big[3]], th.sky[1], 0.25), { t, seed: 11 + p.big[3], bands: p.big[4], craters: 10, halo: 0.25, spin: 0.012 });
  }
  function plateAt(ctx, S, th, P, idx, local, t) {
    const sc = P.shown[idx];
    if (!sc) return;
    const cam = camAt(P, idx, local);
    const b = boxOf(S);
    const f = [b.x + b.w / 2, b.y + b.h / 2];
    ctx.save();
    ctx.globalAlpha *= cam.a;
    applyCam(ctx, cam, [S.W / 2, S.H / 2], f, 0.5);
    plate(ctx, S, th, sc.id, t);
    ctx.restore();
  }
  // Foreground: drifting dust, a fine moving grain and a soft vignette.
  const DUST = (() => { const R = rng(55); return Array.from({ length: 26 }, () => [R(), R(), 0.5 + R(), R() * TAU, 0.2 + R() * 0.5]); })();
  function fore(ctx, S, th, t) {
    if (!S.paint) return;
    const { W, H, u } = S;
    ctx.save();
    for (const [x0, y0, s, ph, sp] of DUST) {
      const x = frac(x0 + t * sp * 0.02) * (W + 80 * u) - 40 * u, y = y0 * H + Math.sin(t * sp + ph) * 30 * u;
      ctx.beginPath(); ctx.arc(x, y, s * 3 * u, 0, TAU); ctx.fillStyle = `rgba(255,255,255,${0.12 + 0.1 * Math.sin(t * 2 + ph)})`; ctx.fill();
    }
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.hypot(W, H) * 0.56);
    v.addColorStop(0, rgba(th.shade, 0)); v.addColorStop(1, rgba(th.shade, th.light ? 0.16 : 0.42));
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    if (th.tex > 0) {
      const f = Math.floor(t * 24), r = rng(f * 7919 + 3);
      ctx.translate(-r() * 200, -r() * 200);
      ctx.globalCompositeOperation = "overlay"; ctx.globalAlpha = 0.07 * th.tex;
      ctx.fillStyle = ctx.createPattern(noise(), "repeat"); ctx.fillRect(0, 0, W + 200, H + 200);
    }
    ctx.restore();
  }

  // ---- scene: chart as test tubes -------------------------------------------------------------------
  function chartLayout(S, b, d) {
    const u = S.u;
    const n = Math.max(1, d.values.length);
    const A = { x: b.x, y: b.y - 34 * u, w: b.w, h: b.h + 64 * u };
    const critW = A.w * (S.tall ? 0.24 : 0.17);
    const rw = A.w - critW, slot = rw / n;
    const tubeW = Math.min(slot * 0.42, 140 * u);
    const groundY = A.y + A.h - 150 * u;
    const top = A.y + (S.tall ? 170 : 150) * u, bot = groundY - 26 * u;
    const hot = clamp(Math.round(d.highlight ?? n - 1), 0, n - 1);
    const xs = Array.from({ length: n }, (_, i) => A.x + slot * (i + 0.5));
    return { A, n, critW, rw, slot, tubeW, groundY, top, bot, hot, xs, focus: [xs[hot], top + (bot - top) * 0.35] };
  }
  function tube(ctx, S, th, cx, top, bot, w, level, col, t, i, hot) {
    const u = S.u, r = w / 2;
    const path = () => { ctx.beginPath(); ctx.moveTo(cx - r, top); ctx.lineTo(cx - r, bot - r); ctx.arc(cx, bot - r, r, Math.PI, 0, true); ctx.lineTo(cx + r, top); ctx.closePath(); };
    if (hot && level > 0) glow(ctx, cx, bot - level * 0.5, Math.max(level, w) * 0.9, col, 0.35);
    path(); ctx.fillStyle = th.light ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.12)"; ctx.fill();
    ctx.save(); path(); ctx.clip();
    if (level > 0) {
      const ly = bot - level;
      const g = ctx.createLinearGradient(cx - r, ly, cx + r, bot);
      g.addColorStop(0, rgba(mix(col, WHITE, 0.25))); g.addColorStop(1, rgba(mix(col, th.shade, 0.15)));
      ctx.fillStyle = g; ctx.fillRect(cx - r, ly, w, level + 2);
      ctx.fillStyle = rgba(mix(col, th.shade, 0.35), 0.5); ctx.fillRect(cx + r * 0.45, ly, r * 0.55, level + 2);
      const wob = Math.sin(t * 3.2 + i * 1.3) * 3 * u;
      ctx.beginPath(); ctx.ellipse(cx, ly + wob * 0.3, r, r * 0.22, Math.sin(t * 2 + i) * 0.04, 0, TAU); ctx.fillStyle = rgba(mix(col, WHITE, 0.45)); ctx.fill();
      const R = rng(i * 37 + 9);
      for (let k = 0; k < 7; k++) {
        const sp = 0.35 + R() * 0.4, ph = R(), bx = cx + (R() - 0.5) * r * 1.1, br = r * (0.06 + R() * 0.1);
        const f = frac(t * sp + ph);
        const yy = bot - r * 0.4 - f * Math.max(0, level - r * 0.6);
        if (yy < ly + br * 2) continue;
        ctx.beginPath(); ctx.arc(bx + Math.sin(t * 3 + k) * r * 0.08, yy, br, 0, TAU); ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fill();
      }
    }
    rr(ctx, cx - r * 0.66, top + r * 0.5, r * 0.2, Math.max(0, bot - top - r * 1.6), r * 0.1); ctx.fillStyle = "rgba(255,255,255,0.42)"; ctx.fill();
    ctx.beginPath(); ctx.arc(cx - r * 0.56, bot - r * 0.85, r * 0.08, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = Math.max(2, 3 * u); ctx.lineCap = "round"; ctx.beginPath();
    for (let k = 1; k <= 5; k++) { const yy = top + (bot - top) * (k / 6.4) + r * 0.3; ctx.moveTo(cx + r * 0.32, yy); ctx.lineTo(cx + r * (k % 2 ? 0.72 : 0.56), yy); }
    ctx.stroke(); ctx.restore();
    ctx.beginPath(); ctx.ellipse(cx, top, r * 1.2, r * 0.27, 0, 0, TAU); ctx.fillStyle = th.light ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.5)"; ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, top + 1, r * 0.92, r * 0.17, 0, 0, TAU); ctx.fillStyle = rgba(th.shade, 0.35); ctx.fill();
  }
  function chartScene(ctx, S, th, b, d, L) {
    const u = S.u, t = L.t;
    const Y = chartLayout(S, b, d);
    const { A, n, rw, slot, tubeW, groundY, top, bot, hot } = Y;
    const vals = d.values.map((v) => Math.max(0, Number(v) || 0));
    const max = Math.max(...vals, 1);
    // Background molecules.
    molecule(ctx, S, th, A.x + rw + Y.critW * 0.5, A.y + (S.tall ? 120 : 70) * u + Math.sin(t * 0.9) * 10 * u, 56 * u, t, 3);
    island(ctx, S, th, A.x + A.w / 2, groundY, A.w + 90 * u, { seed: 3, ry: 46 * u, depth: 190 * u, gems: 0 });
    // Rack base and legs.
    const rx0 = A.x + slot * 0.12, rx1 = A.x + rw - slot * 0.12;
    const barY = bot - (bot - top) * 0.28, rackC = th.cols[3];
    for (const lx of [rx0 + 8 * u, rx1 - 30 * u]) volume(ctx, th, () => rr(ctx, lx, barY, 22 * u, groundY - barY, 11 * u), lx + 11 * u, barY + 40 * u, 11 * u, mix(rackC, th.shade, 0.2), { shine: false });
    volume(ctx, th, () => rr(ctx, rx0 - 14 * u, groundY - 26 * u, rx1 - rx0 + 28 * u, 30 * u, 15 * u), A.x + rw / 2, groundY - 11 * u, 15 * u, mix(rackC, th.shade, 0.1), { shine: false });
    const qs = vals.map((_, i) => eo(seg(L.pb, (i / n) * 0.45, (i / n) * 0.45 + 0.55)));
    vals.forEach((v, i) => {
      const col = i === hot ? th.acc : th.cols[[1, 4, 3, 5, 0, 2][i % 6]];
      const inner = bot - top - tubeW * 0.35;
      tube(ctx, S, th, Y.xs[i], top, bot, tubeW, inner * (v / max) * qs[i], col, t, i, i === hot);
    });
    volume(ctx, th, () => rr(ctx, rx0, barY, rx1 - rx0, 44 * u, 22 * u), A.x + rw / 2, barY + 22 * u, 22 * u, rackC, { shine: false });
    // Holes in the bar where each tube passes.
    Y.xs.forEach((x) => { ctx.beginPath(); ctx.ellipse(x, barY + 6 * u, tubeW * 0.6, 7 * u, 0, 0, TAU); ctx.fillStyle = rgba(th.shade, 0.3); ctx.fill(); });
    // Figures and labels.
    vals.forEach((v, i) => {
      const x = Y.xs[i], isHot = i === hot, q = qs[i];
      const size = isHot ? 104 * u : 66 * u;
      figure(ctx, S, th, M.formatNumber(v * q, 0, d.prefix, d.suffix), x, top - (isHot ? 34 : 30) * u, size, { color: isHot ? th.accS : th.ink, glow: isHot && q > 0.95 });
      const lq = eo(seg(L.pb, (i / n) * 0.45, (i / n) * 0.45 + 0.18));
      const label = d.labels[i] || "";
      if (label && lq > 0) {
        ctx.save(); pop(ctx, lq, x, groundY + 96 * u);
        const ls = fitSize(ctx, S, label, 44 * u, slot * 0.96, 42 * u);
        pill(ctx, S, th, label, x, groundY + 96 * u, ls, isHot ? { fill: th.accS, ink: th.onAcc } : {});
        ctx.restore();
      }
      if (q > 0.5) for (let k = 0; k < 4; k++) {
        const R = rng(i * 11 + k * 3 + 1), f = frac(t * (0.25 + R() * 0.15) + R());
        const br = (6 + R() * 10) * u * (0.6 + f * 0.6);
        ctx.beginPath(); ctx.arc(x + (R() - 0.5) * tubeW * 0.8 + Math.sin(t * 2 + k) * 10 * u, top - 10 * u - f * (isHot ? 120 : 70) * u, br, 0, TAU);
        ctx.fillStyle = rgba(i === hot ? th.acc : WHITE, 0.35 * Math.sin(Math.PI * f) * (q - 0.5) * 2); ctx.fill();
      }
      if (isHot && q > 0.9) for (let k = 0; k < 4; k++) {
        const f = frac(t * 0.6 + k / 4);
        sparkle(ctx, x + Math.sin(k * 2.4 + t) * tubeW * 0.8, top - 150 * u - f * 90 * u, (10 + 8 * Math.sin(k)) * u * (1 - f), th.accS, Math.sin(Math.PI * f));
      }
    });
    // The scientist, pointing at the highlighted tube.
    const cr = Math.min(Y.critW * 0.34, 92 * u);
    const cx = A.x + rw + Y.critW * 0.5, cy = groundY - cr * 1.1;
    const done = qs[hot] > 0.95;
    critter(ctx, S, th, cx, cy, cr, { t, seed: 2, col: th.cols[0], mood: done ? "wow" : "smile", point: done ? Math.PI * 1.05 + Math.sin(t * 5) * 0.08 : undefined, wave: done ? 0 : 0.0, kind: 0 });
  }

  // ---- scene: the device ----------------------------------------------------------------------------
  function objectLayout(S, b, d) {
    const u = S.u, phone = d.kind === "phone", stack = !S.wide;
    const A = { x: b.x, y: b.y - 30 * u, w: b.w, h: b.h + 60 * u };
    const DR = stack ? { x: A.x, y: A.y, w: A.w, h: A.h * 0.56 } : { x: A.x, y: A.y, w: A.w * 0.6, h: A.h };
    let dev, scr;
    if (phone) {
      let ph = DR.h * 0.94, pw = ph * 0.5;
      if (pw > DR.w * 0.6) { pw = DR.w * 0.6; ph = pw * 2; }
      dev = { x: DR.x + (DR.w - pw) / 2, y: DR.y + (DR.h - ph) / 2, w: pw, h: ph };
      const i = pw * 0.06;
      scr = { x: dev.x + i, y: dev.y + i * 1.4, w: pw - i * 2, h: ph - i * 2.8 };
    } else {
      const lw = Math.min(DR.w * 0.9, DR.h / 0.74), lh = lw * 0.6;
      dev = { x: DR.x + (DR.w - lw) / 2, y: DR.y + (DR.h - lh * 1.14) / 2, w: lw, h: lh };
      const i = lw * 0.035;
      scr = { x: dev.x + i, y: dev.y + i, w: lw - i * 2, h: lh - i * 2 };
    }
    const pv = { x: scr.x + scr.w * 0.06, y: scr.y + scr.h * 0.07, w: scr.w * 0.88, h: scr.h * (phone ? 0.44 : 0.5) };
    const ty0 = pv.y + pv.h + scr.h * 0.07, th3 = (scr.y + scr.h - scr.h * 0.06 - ty0) / 3;
    const tracks = [0, 1, 2].map((k) => ({ y: ty0 + k * th3, h: th3 * 0.72 }));
    const clipX = (k, i) => [[0.0, 0.3], [0.34, 0.3], [0.68, 0.32]][i].map((v, j) => j ? v * pv.w : pv.x + v * pv.w + (k === 2 ? pv.w * 0.02 : 0));
    const anchors = [
      [pv.x + pv.w * 0.72, pv.y + pv.h * 0.32],
      [clipX(1, 1)[0] + clipX(1, 1)[1] / 2, tracks[1].y + tracks[1].h / 2],
      [clipX(2, 0)[0] + clipX(2, 0)[1] / 2, tracks[2].y + tracks[2].h / 2],
    ];
    const col = stack ? { x: A.x + A.w * 0.16, ys: [0.22, 0.5, 0.78].map((f) => DR.y + DR.h + (A.h - DR.h) * f) } : { x: A.x + A.w * 0.635, ys: [0.2, 0.5, 0.8].map((f) => A.y + A.h * f) };
    return { A, DR, dev, scr, pv, tracks, clipX, anchors, col, phone, focus: anchors[1] };
  }
  function objectScene(ctx, S, th, b, d, L) {
    const u = S.u, t = L.t;
    const Y = objectLayout(S, b, d);
    const { dev, scr, pv, tracks, phone } = Y;
    const dcx = dev.x + dev.w / 2, dcy = dev.y + dev.h / 2;
    const orx = dev.w * (phone ? 1.0 : 0.66), ory = dev.h * (phone ? 0.12 : 0.2), tilt = -0.12;
    const oa = t * 0.7;
    const moonAt = (a) => [dcx + Math.cos(a) * orx * Math.cos(tilt) - Math.sin(a) * ory * Math.sin(tilt), dcy + dev.h * 0.08 + Math.cos(a) * orx * Math.sin(tilt) + Math.sin(a) * ory * Math.cos(tilt)];
    // Orbit line and moon behind the device.
    ctx.save(); ctx.translate(dcx, dcy + dev.h * 0.08); ctx.rotate(tilt);
    ctx.setLineDash([2 * u, 16 * u]); ctx.lineCap = "round"; ctx.lineWidth = 4 * u; ctx.strokeStyle = th.light ? "rgba(70,50,150,0.35)" : "rgba(255,255,255,0.32)";
    ctx.beginPath(); ctx.ellipse(0, 0, orx, ory, 0, 0, TAU); ctx.stroke(); ctx.restore();
    const moon = () => { const [mx, my] = moonAt(oa); planet(ctx, S, th, mx, my, 34 * u, th.cols[2], { t, seed: 4, craters: 4 }); };
    if (Math.sin(oa) < 0) moon();
    glow(ctx, dcx, dcy, Math.max(dev.w, dev.h) * 0.75, th.neb[0], 0.3);
    molecule(ctx, S, th, Y.DR.x + Y.DR.w * (phone ? 0.16 : 0.08), Y.DR.y + Y.DR.h * 0.12, 48 * u, t, 5);
    const [lite, dark] = th.device;
    if (phone) {
      volume(ctx, th, () => rr(ctx, dev.x, dev.y, dev.w, dev.h, dev.w * 0.16), dcx, dcy, dev.w * 0.5, lite, { cut: 0.06, rimW: 0.025, shineX: -0.6, shineY: -1.6 });
    } else {
      const base = () => { ctx.beginPath(); ctx.moveTo(dev.x - dev.w * 0.08, dev.y + dev.h + dev.h * 0.075); ctx.lineTo(dev.x + dev.w * 1.08, dev.y + dev.h + dev.h * 0.075); ctx.lineTo(dev.x + dev.w * 1.02, dev.y + dev.h - 2); ctx.lineTo(dev.x - dev.w * 0.02, dev.y + dev.h - 2); ctx.closePath(); };
      volume(ctx, th, base, dcx, dev.y + dev.h + dev.h * 0.04, dev.h * 0.08, dark, { cut: 0.3, shine: false });
      rr(ctx, dcx - dev.w * 0.08, dev.y + dev.h + dev.h * 0.02, dev.w * 0.16, dev.h * 0.03, dev.h * 0.015); ctx.fillStyle = rgba(th.shade, 0.25); ctx.fill();
      volume(ctx, th, () => rr(ctx, dev.x, dev.y, dev.w, dev.h, 24 * u), dcx, dcy, dev.h * 0.5, lite, { cut: 0.05, rimW: 0.025, shineX: -1.2, shineY: -0.8 });
    }
    // Screen.
    rr(ctx, scr.x, scr.y, scr.w, scr.h, phone ? scr.w * 0.1 : 10 * u); ctx.fillStyle = rgba(th.screen); ctx.fill();
    ctx.save(); rr(ctx, scr.x, scr.y, scr.w, scr.h, phone ? scr.w * 0.1 : 10 * u); ctx.clip();
    // Preview: a tiny world with its own character.
    rr(ctx, pv.x, pv.y, pv.w, pv.h, 12 * u);
    const pg = ctx.createLinearGradient(pv.x, pv.y, pv.x, pv.y + pv.h); pg.addColorStop(0, rgba(th.sky[1])); pg.addColorStop(1, rgba(mix(th.sky[2], th.neb[2], 0.35)));
    ctx.fillStyle = pg; ctx.fill();
    ctx.save(); rr(ctx, pv.x, pv.y, pv.w, pv.h, 12 * u); ctx.clip();
    const R = rng(9);
    for (let k = 0; k < 18; k++) { const sx = pv.x + R() * pv.w, sy = pv.y + R() * pv.h * 0.7; ctx.beginPath(); ctx.arc(sx, sy, (1 + R() * 2) * u, 0, TAU); ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.4 * Math.sin(t * 2 + k)})`; ctx.fill(); }
    planet(ctx, S, th, pv.x + pv.w * 0.5, pv.y + pv.h * 1.55, pv.w * 0.62, th.cols[1], { t, seed: 8, craters: 8, spin: 0.05 });
    const mr = Math.min(pv.h * 0.2, pv.w * 0.1);
    critter(ctx, S, th, pv.x + pv.w * 0.3, pv.y + pv.h * 0.5, mr, { t, seed: 6, col: th.cols[5], kind: 2, wave: 1, shadow: false });
    planet(ctx, S, th, pv.x + pv.w * 0.8, pv.y + pv.h * 0.28, mr * 0.7, th.cols[2], { t, seed: 3, ring: true, ringCol: th.cols[0], craters: 3 });
    ctx.restore();
    // Timeline tracks with clips and a moving playhead.
    const trackCols = [th.cols[1], th.acc, [180, 180, 210]];
    tracks.forEach((tr, k) => {
      for (let i = 0; i < 3; i++) {
        const [x, w] = Y.clipX(k, i);
        const proposed = k === 1 && i === 1;
        const c = k === 1 && !proposed ? th.cols[3] : trackCols[k];
        if (proposed) { const pulse = 0.5 + 0.5 * Math.sin(t * 4); glow(ctx, x + w / 2, tr.y + tr.h / 2, w * 0.7, th.acc, 0.3 + 0.25 * pulse); }
        rr(ctx, x + 3 * u, tr.y, w - 6 * u, tr.h, 6 * u); ctx.fillStyle = rgba(c, k === 2 ? 0.55 : 1); ctx.fill();
        rr(ctx, x + 3 * u, tr.y, w - 6 * u, tr.h * 0.4, 6 * u); ctx.fillStyle = "rgba(255,255,255,0.2)"; ctx.fill();
      }
    });
    const phx = pv.x + pv.w * frac(t * 0.14 + 0.15);
    ctx.fillStyle = th.accS; ctx.fillRect(phx - 2 * u, tracks[0].y - 12 * u, 4 * u, tracks[2].y + tracks[2].h - tracks[0].y + 16 * u);
    ctx.beginPath(); ctx.arc(phx, tracks[0].y - 14 * u, 8 * u, 0, TAU); ctx.fill();
    ctx.restore();
    if (phone) { rr(ctx, dcx - dev.w * 0.13, dev.y + dev.w * 0.05, dev.w * 0.26, dev.w * 0.05, dev.w * 0.025); ctx.fillStyle = rgba(th.screen); ctx.fill(); }
    // Screen glare.
    ctx.save(); rr(ctx, scr.x, scr.y, scr.w, scr.h, 10 * u); ctx.clip();
    ctx.beginPath(); ctx.moveTo(scr.x + scr.w * 0.55, scr.y); ctx.lineTo(scr.x + scr.w * 0.72, scr.y); ctx.lineTo(scr.x + scr.w * 0.42, scr.y + scr.h); ctx.lineTo(scr.x + scr.w * 0.25, scr.y + scr.h); ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.fill(); ctx.restore();
    if (Math.sin(oa) >= 0) moon();
    // A character perched on the device, watching the callouts.
    const cr = 58 * u;
    const px = phone ? dev.x - cr * 0.4 : dev.x + dev.w * 0.86, py = phone ? dev.y + dev.h - cr * 1.05 : dev.y - cr * 0.98;
    critter(ctx, S, th, px, py, cr, { t, seed: 4, col: th.cols[4], kind: 1, mood: "grin", wave: Math.max(0, Math.sin(t * 1.3)), shadow: !phone });
    // Callouts.
    d.callouts.forEach((label, i) => {
      if (!label) return;
      const c = eo(seg(L.pb, 0.12 + i * 0.2, 0.36 + i * 0.2));
      if (c <= 0) return;
      const [ax, ay] = Y.anchors[i];
      const lx = Y.col.x, ly = Y.col.ys[i];
      const end = [lx - 18 * u, ly];
      const ctl = !S.wide ? [Y.A.x - 120 * u, ay] : [lerp(ax, end[0], 0.6), ay];
      const pr = (0.5 + 0.5 * Math.sin(t * 3 + i * 2));
      ctx.beginPath(); ctx.arc(ax, ay, (14 + 12 * pr) * u, 0, TAU); ctx.fillStyle = rgba(th.acc, 0.35 * (1 - pr)); ctx.fill();
      dots(ctx, S, th, quad([ax, ay], ctl, end), c, th.accS, 17 * u, 4.5 * u);
      ctx.beginPath(); ctx.arc(ax, ay, 10 * u, 0, TAU); ctx.fillStyle = th.accS; ctx.fill();
      ctx.beginPath(); ctx.arc(ax, ay, 4 * u, 0, TAU); ctx.fillStyle = "#fff"; ctx.fill();
      const q = seg(c, 0.8, 1);
      if (q > 0) {
        ctx.save(); pop(ctx, q, lx, ly);
        const maxW = S.W - lx - (S.wide ? 80 : 60) * u;
        const ls = fitSize(ctx, S, label, 44 * u, maxW - 44 * u * 1.3, 42 * u);
        pill(ctx, S, th, label, lx, ly, ls, { align: "left", num: i + 1 });
        ctx.restore();
      }
    });
  }

  // ---- scene: the crew ------------------------------------------------------------------------------
  function peopleLayout(S, b, d) {
    const u = S.u;
    const n = clamp(Math.round(Number(d.count) || 4), 2, 6);
    const A = { x: b.x - 20 * u, y: b.y - 20 * u, w: b.w + 40 * u, h: b.h + 50 * u };
    const rows = S.tall && n > 3 ? 2 : 1;
    const perRow = Math.ceil(n / rows);
    const rowH = A.h / rows;
    const hot = clamp(d.highlight ?? 1, 0, n - 1);
    const items = [];
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / perRow), col = i % perRow;
      const inRow = row === rows - 1 ? n - perRow * (rows - 1) : perRow;
      const slot = A.w / inRow;
      const cx = A.x + slot * (col + 0.5);
      const lift = Math.sin(Math.PI * (col + 0.5) / inRow) * rowH * 0.08;
      const top = A.y + rowH * (row + 1) - rowH * 0.2 - lift;
      const r = Math.min(slot * 0.24, rowH * 0.16, 96 * u) * (i === hot ? 1.12 : 1);
      items.push({ cx, top, r, slot, cy: top - r * 1.12 });
    }
    return { A, n, items, hot, focus: [items[hot].cx, items[hot].cy] };
  }
  function peopleScene(ctx, S, th, b, d, L) {
    const u = S.u, t = L.t;
    const Y = peopleLayout(S, b, d);
    const kinds = [0, 2, 1, 0, 1, 2], cols = [1, 0, 3, 4, 5, 2];
    // Islands first, then the constellation linking the crew, then the crew.
    Y.items.forEach((it, i) => island(ctx, S, th, it.cx, it.top + Math.sin(t * 1.1 + i) * 5 * u, Math.min(it.slot * 0.8, it.r * 3.4), { seed: i + 2, depth: it.r * 1.25, ry: it.r * 0.42, gems: 2, topCol: mix(th.rock[1], th.cols[cols[i]], 0.18) }));
    const heads = Y.items.map((it, i) => [it.cx, it.cy - it.r * 0.1 + Math.sin(t * 2.3 + i * 1.7) * it.r * 0.07]);
    const lq = eo(seg(L.pb, 0.25, 0.75));
    if (lq > 0 && heads.length > 1) {
      ctx.save();
      for (let i = 0; i < heads.length - 1; i++) {
        const a = heads[i], c = heads[i + 1];
        const mid = [(a[0] + c[0]) / 2, Math.min(a[1], c[1]) - 60 * u];
        dots(ctx, S, th, quad(a, mid, c), clamp(lq * (heads.length - 1) - i), th.light ? "rgba(70,50,150,0.4)" : "rgba(255,255,255,0.45)", 18 * u, 4 * u);
      }
      const f = frac(t * 0.22) * (heads.length - 1), i = Math.floor(f);
      if (lq >= 1) {
        const a = heads[i], c = heads[Math.min(heads.length - 1, i + 1)], mid = [(a[0] + c[0]) / 2, Math.min(a[1], c[1]) - 60 * u];
        const [x, y] = quad(a, mid, c)(f - i);
        glow(ctx, x, y, 34 * u, th.acc, 0.8); sparkle(ctx, x, y, 14 * u, "#fff");
      }
      ctx.restore();
    }
    Y.items.forEach((it, i) => {
      const q = seg(L.pb, i * 0.07, i * 0.07 + 0.32);
      const isHot = i === Y.hot;
      const fy = Math.sin(t * 1.1 + i) * 5 * u;
      ctx.save();
      ctx.globalAlpha *= clamp(q * 3);
      ctx.translate(0, -(1 - back(q)) * 140 * u + fy);
      if (isHot) {
        glow(ctx, it.cx, it.cy, it.r * 2.4, th.acc, 0.45);
        ctx.save(); ctx.translate(it.cx, it.cy); ctx.rotate(t * 0.6);
        ctx.setLineDash([3 * u, 14 * u]); ctx.lineCap = "round"; ctx.lineWidth = 5 * u; ctx.strokeStyle = th.accS;
        ctx.beginPath(); ctx.arc(0, 0, it.r * 1.75, 0, TAU); ctx.stroke(); ctx.restore();
      }
      const wave = Math.max(0, Math.sin(t * 1.5 - i * 0.9));
      critter(ctx, S, th, it.cx, it.cy, it.r, { t, seed: i * 3 + 1, col: th.cols[cols[i]], kind: kinds[i], mood: isHot ? "grin" : i % 3 === 2 ? "wow" : "smile", wave, bulb: isHot ? th.acc : th.cols[(cols[i] + 2) % 6] });
      ctx.restore();
      // Badge.
      const label = d.badges[i];
      const bq = seg(L.pb, 0.12 + i * 0.07, 0.3 + i * 0.07);
      if (bq <= 0) return;
      const by = it.cy - it.r * 2.05 - 46 * u + fy + Math.sin(t * 2.3 + (i * 3 + 1) * 1.7) * it.r * 0.07;
      ctx.save(); pop(ctx, bq, it.cx, by);
      if (label) {
        const ls = fitSize(ctx, S, label, 44 * u, it.slot * 0.98, 42 * u);
        pill(ctx, S, th, label, it.cx, by, ls, isHot ? { fill: th.accS, ink: th.onAcc, tail: true } : { tail: true });
      } else {
        const br = 34 * u;
        ctx.beginPath(); ctx.arc(it.cx, by + 10 * u, br, 0, TAU); ctx.fillStyle = th.pill; ctx.fill();
        ctx.beginPath(); ctx.moveTo(it.cx - 10 * u, by + br + 4 * u); ctx.lineTo(it.cx, by + br + 22 * u); ctx.lineTo(it.cx + 10 * u, by + br + 4 * u); ctx.fill();
        const beat = 1 + 0.12 * Math.max(0, Math.sin(t * 6 + i));
        icon(ctx, i % 2 ? "spark" : "heart", it.cx, by + 12 * u, br * 1.2 * beat, rgba(th.cols[cols[i]]));
      }
      ctx.restore();
    });
  }

  // ---- scene: three worlds on one orbit -------------------------------------------------------------
  function processLayout(S, b, d) {
    const u = S.u;
    const A = { x: b.x, y: b.y - 30 * u, w: b.w, h: b.h + 50 * u };
    const tall = S.tall;
    const fx = tall ? [0.3, 0.7, 0.3] : [0.16, 0.5, 0.84], fy = tall ? [0.12, 0.47, 0.82] : S.wide ? [0.5, 0.32, 0.5] : [0.26, 0.6, 0.26];
    const r = tall ? Math.min(A.w * 0.17, A.h * 0.1) : Math.min(A.w * 0.085, A.h * 0.19);
    const st = fx.map((f, i) => [A.x + A.w * f, A.y + A.h * fy[i]]);
    return { A, st, r, focus: st[2] };
  }
  function processScene(ctx, S, th, b, d, L) {
    const u = S.u, t = L.t;
    const Y = processLayout(S, b, d);
    const { st, r } = Y;
    const n = Math.min(3, d.steps.length);
    const cols = [th.cols[1], th.cols[3], th.acc];
    const icons = ["doc", "spark", "check"];
    // The path between worlds.
    const legs = [];
    for (let i = 0; i < n - 1; i++) {
      const a = st[i], c = st[i + 1];
      const ctl = S.tall ? [(a[0] + c[0]) / 2 + (i % 2 ? -1 : 1) * r * 0.2, (a[1] + c[1]) / 2] : [(a[0] + c[0]) / 2, Math.min(a[1], c[1]) - r * 1.2];
      legs.push(quad(a, ctl, c));
    }
    rocks(ctx, S, th, S.tall ? [[Y.A.x + Y.A.w * 0.82, Y.A.y + Y.A.h * 0.2, 30 * u], [Y.A.x + Y.A.w * 0.12, Y.A.y + Y.A.h * 0.62, 24 * u], [Y.A.x + Y.A.w * 0.85, Y.A.y + Y.A.h * 0.95, 36 * u]]
      : [[Y.A.x + Y.A.w * 0.5, Y.A.y + Y.A.h * 0.86, 40 * u], [Y.A.x + Y.A.w * 0.33, Y.A.y + Y.A.h * 0.12, 24 * u], [Y.A.x + Y.A.w * 0.68, Y.A.y + Y.A.h * 0.95, 26 * u], [Y.A.x + Y.A.w * 0.03, Y.A.y + Y.A.h * 0.14, 30 * u]], t, 4);
    const pq = eo(seg(L.pb, 0, 0.5));
    legs.forEach((leg, i) => dots(ctx, S, th, leg, clamp(pq * 2 - i), th.light ? "rgba(70,50,150,0.4)" : "rgba(255,255,255,0.45)", 20 * u, 5 * u));
    // Traveller timeline across the hold.
    const tp = clamp(L.local / Math.max(1.2, L.hold * 0.82));
    const arrive = [0.08, 0.42, 0.76];
    const reached = arrive.map((a) => tp >= a);
    const later = [];
    st.slice(0, n).forEach(([x, y], i) => {
      const lit = reached[i];
      const lq = lit ? eo(seg(tp, arrive[i], arrive[i] + 0.12)) : 0;
      if (lit) for (let k = 0; k < 2; k++) {
        const pr = frac(t * 0.7 + k * 0.5);
        ctx.beginPath(); ctx.arc(x, y, r * (1.1 + pr * 0.7), 0, TAU); ctx.strokeStyle = rgba(cols[i], 0.5 * (1 - pr)); ctx.lineWidth = 5 * u; ctx.stroke();
      }
      planet(ctx, S, th, x, y, r, cols[i], { t, seed: 20 + i, craters: 6, halo: 0.25 + 0.2 * lq, ring: i === 1, ringCol: th.cols[5], bands: i === 0, spin: 0.04 });
      // A small moon around each world.
      const ma = t * (0.9 + i * 0.2) + i * 2;
      const mx = x + Math.cos(ma) * r * 1.45, my = y + Math.sin(ma) * r * 0.45;
      if (Math.sin(ma) > 0 || i !== 1) sphere(ctx, th, mx, my, r * 0.14, mix(cols[i], WHITE, 0.5), { cut: 0.3 });
      // Icon badge.
      const bx = x + r * 0.62, by = y - r * 0.62, br = r * 0.36;
      const iq = back(seg(L.pb, i * 0.15, i * 0.15 + 0.3));
      if (iq > 0) {
        ctx.save(); ctx.translate(bx, by); ctx.scale(iq * (1 + 0.1 * lq * Math.sin(t * 5)), iq * (1 + 0.1 * lq * Math.sin(t * 5))); ctx.translate(-bx, -by);
        ctx.beginPath(); ctx.arc(bx, by + br * 0.12, br, 0, TAU); ctx.fillStyle = rgba(th.shade, 0.4); ctx.fill();
        ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU); ctx.fillStyle = lit ? rgba(mix(cols[i], th.shade, 0.35)) : th.pill; ctx.fill();
        icon(ctx, icons[i], bx, by, br * 1.25, lit ? "#ffffff" : rgba(cols[i]));
        ctx.restore();
      }
      // Label.
      const label = d.steps[i] || "";
      const lb = seg(L.pb, 0.05 + i * 0.15, 0.25 + i * 0.15);
      if (label && lb > 0) later.push(() => {
        const ly = y + r + (S.tall ? 64 : 76) * u;
        const maxW = S.tall ? S.W * 0.86 : S.wide ? (S.W - 160 * u) / 3 : S.W * 0.42;
        const ls = fitSize(ctx, S, label, 44 * u, maxW, 42 * u);
        ctx.save(); pop(ctx, lb, x, ly);
        pill(ctx, S, th, label, x, ly, ls, { num: i + 1, fill: lit && i === n - 1 ? th.accS : th.pill, ink: lit && i === n - 1 ? th.onAcc : th.pillInk, leadFill: i === n - 1 && lit ? th.pill : th.accS, leadInk: i === n - 1 && lit ? th.pillInk : th.onAcc });
        ctx.restore();
      });
    });
    // The traveller rides a little comet between worlds, then circles the last one.
    let pos, dir = 1;
    if (tp < arrive[1]) { const k = eio(seg(tp, arrive[0] + 0.04, arrive[1])); pos = legs[0] ? legs[0](k) : st[0]; }
    else if (tp < arrive[2] && legs[1]) { const k = eio(seg(tp, arrive[1] + 0.04, arrive[2])); pos = legs[1](k); }
    else { const a = (L.local - L.hold * 0.82 * arrive[2]) * 1.6 - Math.PI / 2; const c = st[n - 1]; pos = [c[0] + Math.cos(a) * r * 1.5, c[1] - r * 0.2 + Math.sin(a) * r * 0.55]; dir = Math.cos(a) < 0 ? 1 : -1; }
    const lift = r * 1.15;
    const [tx, ty] = [pos[0], pos[1] - lift];
    for (let k = 0; k < 8; k++) {
      const f = k / 8;
      sparkle(ctx, tx - dir * (34 + k * 24) * u, ty + r * 0.4 + Math.sin(t * 8 + k) * 6 * u, (20 - k * 2) * u, k % 2 ? th.accS : "#ffffff", 0.9 * (1 - f));
    }
    glow(ctx, tx, ty + r * 0.35, 60 * u, th.acc, 0.5);
    critter(ctx, S, th, tx, ty, Math.max(46 * u, r * 0.52), { t, seed: 7, col: th.cols[0], kind: 0, mood: tp > arrive[2] ? "joy" : "grin", wave: tp > arrive[2] ? 1 : 0, waveL: tp > arrive[2] ? 1 : 0, shadow: false });
    later.forEach((f) => f());
  }

  // ---- scene: before and after ------------------------------------------------------------------------
  function compareLayout(S, b, d) {
    const u = S.u, tall = S.tall;
    const A = { x: b.x, y: b.y - 30 * u, w: b.w, h: b.h + 60 * u };
    if (tall) {
      const r = Math.min(A.w * 0.2, A.h * 0.13);
      return { A, tall, r, P: [[A.x + A.w * 0.3, A.y + A.h * 0.24], [A.x + A.w * 0.3, A.y + A.h * 0.72]], focus: [A.x + A.w * 0.3, A.y + A.h * 0.72] };
    }
    const r = Math.min(A.w * 0.125, A.h * 0.255);
    return { A, tall, r, P: [[A.x + A.w * 0.25, A.y + A.h * 0.6], [A.x + A.w * 0.75, A.y + A.h * 0.6]], focus: [A.x + A.w * 0.75, A.y + A.h * 0.6] };
  }
  function compareScene(ctx, S, th, b, d, L) {
    const u = S.u, t = L.t;
    const Y = compareLayout(S, b, d);
    const { r, P } = Y;
    const sides = [
      { label: d.left, v: Math.max(0, Number(d.leftValue) || 0), col: mix(th.cols[3], [150, 150, 175], 0.55), face: "dizzy", hot: false },
      { label: d.right, v: Math.max(0, Number(d.rightValue) || 0), col: th.acc, face: "grin", hot: true },
    ];
    // An arc arrow carrying pulses from before to after.
    const a = [P[0][0] + (Y.tall ? r * 1.25 : r * 1.3), P[0][1] + (Y.tall ? r * 0.6 : -r * 0.5)];
    const c = [P[1][0] + (Y.tall ? r * 1.25 : -r * 1.3), P[1][1] + (Y.tall ? -r * 0.6 : -r * 0.5)];
    const ctl = Y.tall ? [P[0][0] + r * 2.4, (P[0][1] + P[1][1]) / 2] : [(a[0] + c[0]) / 2, P[0][1] - r * 1.5];
    const arc = quad(a, ctl, c);
    rocks(ctx, S, th, Y.tall ? [[Y.A.x + Y.A.w * 0.85, Y.A.y + Y.A.h * 0.46, 30 * u], [Y.A.x + Y.A.w * 0.08, Y.A.y + Y.A.h * 0.5, 22 * u]]
      : [[Y.A.x + Y.A.w * 0.5, Y.A.y + Y.A.h * 0.88, 34 * u], [Y.A.x + Y.A.w * 0.04, Y.A.y + Y.A.h * 0.2, 26 * u], [Y.A.x + Y.A.w * 0.97, Y.A.y + Y.A.h * 0.3, 22 * u]], t, 6);
    const aq = eo(seg(L.pb, 0.3, 0.7));
    dots(ctx, S, th, arc, aq, th.light ? "rgba(70,50,150,0.45)" : "rgba(255,255,255,0.5)", 22 * u, 6 * u);
    if (aq >= 1) {
      const [hx, hy] = arc(1), [px, py] = arc(0.96);
      const ang = Math.atan2(hy - py, hx - px);
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(ang); ctx.beginPath(); ctx.moveTo(10 * u, 0); ctx.lineTo(-18 * u, -16 * u); ctx.lineTo(-18 * u, 16 * u); ctx.closePath();
      ctx.fillStyle = th.light ? "rgba(70,50,150,0.6)" : "rgba(255,255,255,0.75)"; ctx.fill(); ctx.restore();
      for (let k = 0; k < 3; k++) { const f = frac(t * 0.45 + k / 3); const [x, y] = arc(f); glow(ctx, x, y, 30 * u, th.acc, 0.7 * Math.sin(Math.PI * f)); sparkle(ctx, x, y, 12 * u, "#fff", Math.sin(Math.PI * f)); }
    }
    // A courier rides the arc from before to after with a dial in hand, again and again.
    const cq = seg(L.pb, 0.55, 0.8);
    if (cq > 0) {
      const ph = frac(Math.max(0, L.local - 1.1) * 0.45), f = eio(clamp(ph * 1.15)), [x, y] = arc(f);
      const vis = cq * clamp(Math.sin(Math.PI * ph) * 3);
      const [px] = arc(clamp(f - 0.02));
      for (let k = 0; k < 6; k++) sparkle(ctx, x - (x >= px ? 1 : -1) * (26 + k * 20) * u, y + 30 * u + Math.sin(t * 8 + k) * 5 * u, (16 - k * 2) * u, k % 2 ? th.accS : "#ffffff", vis * (1 - k / 6));
      ctx.save(); ctx.globalAlpha *= vis;
      critter(ctx, S, th, x, y - 30 * u, r * 0.4, { t, seed: 9, col: th.cols[1], kind: 1, mood: "grin", wave: 1, shadow: false, bob: 0.5,
        prop: (by) => { const hx = x + r * 0.4 * 1.3, hy = by - r * 0.4 * 0.55; ctx.beginPath(); ctx.arc(hx, hy, r * 0.13, 0, TAU); ctx.fillStyle = th.pill; ctx.fill(); icon(ctx, "dial", hx, hy, r * 0.22, th.accS); } });
      ctx.restore();
    }
    sides.forEach((s, i) => {
      const [x, y] = P[i];
      const q = eo(seg(L.pb, i * 0.25, i * 0.25 + 0.5));
      const moons = Math.min(14, Math.round(s.v));
      const shownMoons = Math.round(moons * q);
      // Moons orbit behind and in front: the count of moons shows the value.
      const orb = (front) => {
        for (let k = 0; k < shownMoons; k++) {
          const R = rng(i * 50 + k + 3);
          const rad = r * (1.35 + (k % 3) * 0.22 + R() * 0.1), sp = (s.hot ? 0.7 : 1.4) * (0.7 + R() * 0.5) * (k % 2 ? 1 : -1);
          const ang = t * sp + R() * TAU;
          const dep = Math.sin(ang);
          if ((dep > 0) !== front) continue;
          const mx = x + Math.cos(ang) * rad, my = y + dep * rad * 0.32 - (k % 3 - 1) * r * 0.25;
          const mr = r * (s.hot ? 0.16 : 0.1 + R() * 0.05) * (0.85 + 0.15 * dep);
          sphere(ctx, th, mx, my, mr, s.hot ? th.cols[(k + 1) % 6] : mix(th.cols[(k * 2) % 6], [140, 140, 160], 0.55), { cut: 0.28, shine: mr > 10 * u });
        }
      };
      orb(false);
      ctx.save(); pop(ctx, Math.max(0.35, back(seg(L.pb, i * 0.2, i * 0.2 + 0.35))), x, y);
      planet(ctx, S, th, x, y, r, s.col, { t, seed: 40 + i, craters: s.hot ? 5 : 10, halo: s.hot ? 0.45 + 0.1 * Math.sin(t * 3) : 0.12, face: s.face, spin: s.hot ? 0.03 : 0.015 });
      ctx.restore();
      orb(true);
      if (s.hot && q > 0.9) for (let k = 0; k < 5; k++) { const f = frac(t * 0.5 + k / 5), ang = k * 1.3 + t * 0.2; sparkle(ctx, x + Math.cos(ang) * r * (1.1 + f * 0.6), y + Math.sin(ang) * r * (1.1 + f * 0.6), 13 * u * (1 - f), th.accS, Math.sin(Math.PI * f)); }
      // Figure and label.
      const num = M.formatNumber(s.v * q, 0, d.prefix, d.suffix);
      const size = 128 * u;
      if (Y.tall) {
        const nx = Y.A.x + Y.A.w * 0.6;
        figure(ctx, S, th, num, nx, y + size * 0.1, size, { align: "left", color: s.hot ? th.accS : th.ink, glow: s.hot && q > 0.95 });
        if (s.label) { const lq = seg(L.pb, 0.1 + i * 0.25, 0.3 + i * 0.25); ctx.save(); pop(ctx, lq, nx, y + size * 0.62); pill(ctx, S, th, s.label, nx, y + size * 0.62, fitSize(ctx, S, s.label, 44 * u, Y.A.x + Y.A.w - nx + 60 * u, 42 * u), s.hot ? { align: "left", fill: th.accS, ink: th.onAcc } : { align: "left" }); ctx.restore(); }
      } else {
        figure(ctx, S, th, num, x, y - r * 1.62, size, { color: s.hot ? th.accS : th.ink, glow: s.hot && q > 0.95 });
        if (s.label) { const ly = y + r + 62 * u, lq = seg(L.pb, 0.1 + i * 0.25, 0.3 + i * 0.25); ctx.save(); pop(ctx, lq, x, ly); pill(ctx, S, th, s.label, x, ly, fitSize(ctx, S, s.label, 44 * u, Y.A.w * 0.46, 42 * u), s.hot ? { fill: th.accS, ink: th.onAcc } : {}); ctx.restore(); }
      }
    });
  }

  // ---- title and closing ----------------------------------------------------------------------------
  const MEASURE = {};
  function measure(S, id) {
    const el = document.getElementById(id);
    if (!el || !el.textContent) return null;
    const key = id + "|" + el.textContent + "|" + el.style.fontSize + "|" + S.W + "|" + S.H;
    if (MEASURE[key]) return MEASURE[key];
    const c = document.createElement("canvas").getContext("2d");
    const size = parseFloat(el.style.fontSize) || 110 * S.u;
    const maxW = parseFloat(el.style.width) || S.W * 0.8;
    c.font = font(S, size, "d");
    const words = String(el.textContent).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (const w of words) { const next = line ? line + " " + w : w; if (line && c.measureText(next).width > maxW) { lines.push(line); line = w; } else line = next; }
    if (line) lines.push(line);
    let wMax = Math.max(1, ...lines.map((l) => c.measureText(l).width));
    let hC = lines.length * size * 1.04;
    if (id === "title") {
      const k = document.getElementById("kicker");
      if (k && k.textContent) {
        const ks = parseFloat(k.style.fontSize) || 30 * S.u;
        c.font = font(S, ks, "b");
        wMax = Math.max(wMax, c.measureText(k.textContent.toUpperCase()).width * 1.2 + ks * 2);
        hC += ks * 2 + (parseFloat(k.style.marginBottom) || 24 * S.u);
      }
    }
    const side = parseFloat(el.parentElement && el.parentElement.style.paddingLeft) || 140 * S.u;
    c.font = font(S, size, "d");
    const y0 = (S.H - hC) / 2, textTop = y0 + hC - lines.length * size * 1.04;
    const rows = lines.map((l, i) => ({ w: c.measureText(l).width, top: textTop + i * size * 1.04, bottom: textTop + (i + 1) * size * 1.04 }));
    return (MEASURE[key] = { x: side, y: y0, w: wMax, h: hC, rows, size });
  }
  // Where the hero stands beside (or below) a statement.
  function heroSpot(S, R, big) {
    const { W, H, u } = S;
    const avail = W - (R.x + R.w) - 30 * u;
    if (avail > 290 * u) { const r = Math.min(avail * 0.38, big * u); return { x: Math.min(R.x + R.w + avail * 0.5, W - r * 1.45), y: H * 0.54, r, side: true }; }
    // A wrapped statement leaves a nook right of its last line: the hero stands there, under the lines above.
    const rows = R.rows || [];
    if (rows.length > 1) {
      const last = rows[rows.length - 1];
      const x0 = R.x + last.w + 70 * u, x1 = W - 70 * u, y0 = rows[rows.length - 2].bottom + 20 * u, y1 = H - 30 * u;
      const r = Math.min((x1 - x0) * 0.24, (y1 - y0) / 3.5, big * 1.25 * u);
      if (r > 105 * u) return { x: x0 + (x1 - x0) * 0.55, y: y0 + r * 1.4, r, side: true, nook: true };
    }
    const below = H - (R.y + R.h);
    const r = Math.min(W * 0.17, below * 0.3, big * u);
    return { x: W * (S.tall ? 0.62 : 0.78), y: R.y + R.h + below * 0.57, r, side: false };
  }
  // A little observatory: a domed hut whose slit telescope sweeps the sky, a blinking beacon on top.
  function observatory(ctx, S, th, x, base, s, t) {
    const u = S.u;
    const wall = mix(th.device[0], th.cols[3], 0.25);
    volume(ctx, th, () => rr(ctx, x - s, base - s * 0.62, s * 2, s * 0.66, s * 0.12), x, base - s * 0.3, s, wall, { shine: false, cut: 0.12 });
    rr(ctx, x - s * 0.24, base - s * 0.5, s * 0.48, s * 0.5, s * 0.22); ctx.fillStyle = rgba(th.screen); ctx.fill();
    ctx.beginPath(); ctx.arc(x + s * 0.12, base - s * 0.25, s * 0.04, 0, TAU); ctx.fillStyle = th.accS; ctx.fill();
    for (const k of [-1, 1]) { ctx.beginPath(); ctx.arc(x + k * s * 0.62, base - s * 0.32, s * 0.12, 0, TAU); ctx.fillStyle = `rgba(255,236,170,${0.65 + 0.3 * Math.sin(t * 3 + k)})`; ctx.fill(); }
    // The telescope, behind the dome's slit, sweeping slowly.
    const ang = -1.05 + Math.sin(t * 0.55) * 0.42, cy = base - s * 0.72;
    ctx.save(); ctx.translate(x, cy); ctx.rotate(ang);
    volume(ctx, th, () => rr(ctx, s * 0.2, -s * 0.15, s * 1.0, s * 0.3, s * 0.1), s * 0.7, 0, s * 0.3, th.cols[0], { shine: false, cut: 0.2 });
    rr(ctx, s * 1.12, -s * 0.2, s * 0.16, s * 0.4, s * 0.06); ctx.fillStyle = rgba(mix(th.cols[0], th.shade, 0.35)); ctx.fill();
    ctx.restore();
    volume(ctx, th, () => { ctx.beginPath(); ctx.arc(x, base - s * 0.6, s * 0.9, Math.PI, 0); ctx.closePath(); }, x, base - s * 0.9, s * 0.9, mix(th.device[0], WHITE, 0.2), { cut: 0.16, shineX: -0.3, shineY: -0.2 });
    ctx.save(); ctx.translate(x, base - s * 0.6); ctx.rotate(ang + Math.PI / 2);
    rr(ctx, -s * 0.13, -s * 0.92, s * 0.26, s * 0.62, s * 0.08); ctx.fillStyle = rgba(th.screen); ctx.fill(); ctx.restore();
    const bl = 0.5 + 0.5 * Math.sin(t * 4);
    glow(ctx, x, base - s * 1.58, s * 0.5, th.acc, 0.5 * bl);
    ctx.beginPath(); ctx.arc(x, base - s * 1.58, s * 0.09, 0, TAU); ctx.fillStyle = th.accS; ctx.fill();
    ctx.fillStyle = rgba(mix(th.device[0], th.shade, 0.3)); ctx.fillRect(x - 1.5 * u, base - s * 1.55, 3 * u, s * 0.08);
  }
  // A small satellite with turning solar panels and a blinking dish.
  function satellite(ctx, S, th, x, y, s, t) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 0.4) * 0.35 - 0.2);
    const panel = th.light ? [90, 120, 220] : [70, 150, 235];
    for (const k of [-1, 1]) {
      const w = s * 1.15 * (0.75 + 0.25 * Math.cos(t * 0.9));
      ctx.fillStyle = rgba(mix(th.device[1], th.shade, 0.2)); ctx.fillRect(k > 0 ? s * 0.4 : -s * 0.6, -s * 0.05, s * 0.2, s * 0.1);
      const x0 = k > 0 ? s * 0.6 : -s * 0.6 - w;
      rr(ctx, x0, -s * 0.32, w, s * 0.64, s * 0.06);
      const g = ctx.createLinearGradient(x0, -s * 0.32, x0 + w, s * 0.32); g.addColorStop(0, rgba(mix(panel, WHITE, 0.3))); g.addColorStop(1, rgba(mix(panel, th.shade, 0.25)));
      ctx.fillStyle = g; ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.22)"; for (let i = 1; i < 3; i++) ctx.fillRect(x0 + (w * i) / 3 - 1, -s * 0.32, 2, s * 0.64);
    }
    sphere(ctx, th, 0, 0, s * 0.45, th.device[0], { cut: 0.2, shineA: 0.6 });
    ctx.beginPath(); ctx.ellipse(s * 0.05, -s * 0.62, s * 0.26, s * 0.1, 0, 0, TAU); ctx.fillStyle = rgba(th.cols[2]); ctx.fill();
    ctx.fillStyle = rgba(th.cols[2]); ctx.fillRect(s * 0.03, -s * 0.6, s * 0.05, s * 0.2);
    glow(ctx, s * 0.05, -s * 0.78, s * 0.4, th.acc, 0.5 + 0.5 * Math.sin(t * 5));
    ctx.restore();
  }
  function rocket(ctx, S, th, x, base, s, t) {
    const body = () => { ctx.beginPath(); ctx.moveTo(x, base - s * 1.9); ctx.bezierCurveTo(x + s * 0.55, base - s * 1.5, x + s * 0.48, base - s * 0.5, x + s * 0.34, base - s * 0.2); ctx.lineTo(x - s * 0.34, base - s * 0.2); ctx.bezierCurveTo(x - s * 0.48, base - s * 0.5, x - s * 0.55, base - s * 1.5, x, base - s * 1.9); ctx.closePath(); };
    for (const k of [-1, 1]) volume(ctx, th, () => { ctx.beginPath(); ctx.moveTo(x + k * s * 0.3, base - s * 0.85); ctx.quadraticCurveTo(x + k * s * 0.78, base - s * 0.5, x + k * s * 0.7, base); ctx.lineTo(x + k * s * 0.28, base - s * 0.25); ctx.closePath(); }, x + k * s * 0.5, base - s * 0.4, s * 0.35, th.cols[0], { shine: false, cut: 0.2 });
    volume(ctx, th, () => rr(ctx, x - s * 0.24, base - s * 0.3, s * 0.48, s * 0.3, s * 0.08), x, base - s * 0.15, s * 0.24, mix(th.device[1], th.shade, 0.2), { shine: false });
    volume(ctx, th, body, x, base - s, s * 0.55, th.device[0], { cut: 0.14, shineX: -0.5, shineY: -1.2 });
    ctx.save(); body(); ctx.clip(); ctx.fillStyle = rgba(th.cols[0]); ctx.fillRect(x - s, base - s * 1.95, s * 2, s * 0.42); ctx.restore();
    sphere(ctx, th, x, base - s * 1.05, s * 0.2, mix(th.device[1], th.shade, 0.3), { shine: false, cut: 0.05 });
    sphere(ctx, th, x, base - s * 1.05, s * 0.15, th.cols[1], { cut: 0.25, shineA: 0.7 });
    const bl = 0.5 + 0.5 * Math.sin(t * 3.4);
    glow(ctx, x, base - s * 1.95, s * 0.35, th.acc, 0.6 * bl);
  }
  function flag(ctx, S, th, x, base, h, t, q) {
    if (q <= 0) return;
    const u = S.u, ph = h * eo(q);
    ctx.fillStyle = rgba(mix(th.device[0], th.shade, 0.15)); rr(ctx, x - 4 * u, base - ph, 8 * u, ph, 4 * u); ctx.fill();
    sphere(ctx, th, x, base - ph, 9 * u, th.cols[2], { shine: false });
    const fw = h * 0.62, fh2 = h * 0.38, top = base - ph + 10 * u, k = seg(q, 0.5, 1);
    if (k <= 0) return;
    const wv = (a) => Math.sin(t * 5 - a * 4) * fh2 * 0.1 * a;
    ctx.beginPath(); ctx.moveTo(x, top);
    for (let i = 0; i <= 12; i++) { const a = i / 12; ctx.lineTo(x + fw * a * k, top + wv(a)); }
    for (let i = 12; i >= 0; i--) { const a = i / 12; ctx.lineTo(x + fw * a * k, top + fh2 + wv(a)); }
    ctx.closePath();
    const g = ctx.createLinearGradient(x, top, x + fw, top + fh2); g.addColorStop(0, rgba(mix(th.acc, WHITE, 0.2))); g.addColorStop(1, rgba(mix(th.acc, th.shade, 0.2)));
    ctx.fillStyle = g; ctx.fill();
    if (k > 0.8) icon(ctx, "check", x + fw * 0.5, top + fh2 * 0.5 + wv(0.5), fh2 * 0.8, th.onAcc);
  }
  function titleArt(ctx, S, th, P, idx, local, t) {
    const { W, H, u } = S;
    const R = measure(S, "title") || { x: 140 * u, y: H * 0.38, w: W * 0.5, h: 240 * u };
    const h = heroSpot(S, R, 150);
    const cam = camAt(P, idx, local);
    ctx.save();
    ctx.globalAlpha *= cam.a;
    applyCam(ctx, cam, [h.x, h.y], [h.x, h.y], 1);
    const q = Math.max(0.55, back(seg(local, 0, 0.8)));
    // Orbit with two moons around the hero.
    const orx = h.r * 2.3, ory = h.r * 0.62;
    const moonsAt = (front) => {
      for (let k = 0; k < 2; k++) {
        const a = t * (0.8 + k * 0.35) + k * Math.PI;
        if ((Math.sin(a) > 0) !== front) continue;
        planet(ctx, S, th, h.x + Math.cos(a) * orx * (k ? 0.8 : 1), h.y + h.r * 0.2 + Math.sin(a) * ory * (k ? 0.8 : 1), h.r * (k ? 0.16 : 0.22), th.cols[k ? 2 : 4], { t, seed: 60 + k, craters: 3 });
      }
    };
    glow(ctx, h.x, h.y, h.r * 3.2, th.neb[0], 0.4);
    if (S.tall) planet(ctx, S, th, W * 0.7, H * 0.28, 150 * u, th.cols[5], { t, seed: 64, ring: true, ringCol: th.cols[2], bands: true, craters: 6, halo: 0.3, tilt: -0.22, spin: 0.02 });
    const sk = frac(t / 26 + 0.3);
    satellite(ctx, S, th, W * (S.tall ? 0.2 + 0.5 * sk : 0.42 + 0.3 * sk), H * (S.tall ? 0.15 : 0.17) + Math.sin(t * 0.7) * 14 * u, 42 * u, t);
    ctx.save(); ctx.translate(h.x, h.y + h.r * 0.2);
    ctx.setLineDash([2 * u, 16 * u]); ctx.lineCap = "round"; ctx.lineWidth = 4 * u; ctx.strokeStyle = th.light ? "rgba(70,50,150,0.35)" : "rgba(255,255,255,0.35)";
    ctx.beginPath(); ctx.ellipse(0, 0, orx, ory, 0, 0, TAU); ctx.stroke(); ctx.restore();
    moonsAt(false);
    if (h.nook) {
      molecule(ctx, S, th, h.x + h.r * 1.75, h.y - h.r * 1.25 + Math.sin(t * 0.8) * 10 * u, h.r * 0.34, t, 1);
      molecule(ctx, S, th, h.x - h.r * 2.0, h.y + h.r * 2.05 + Math.sin(t * 0.9 + 2) * 8 * u, h.r * 0.26, t, 4);
    } else {
      molecule(ctx, S, th, h.x - h.r * 2.1, h.y - h.r * 1.8 + Math.sin(t * 0.8) * 10 * u, h.r * 0.42, t, 1);
      molecule(ctx, S, th, h.x + h.r * 1.9, h.y + h.r * 1.9 + Math.sin(t * 0.7 + 1) * 10 * u, h.r * 0.34, t, 2);
      molecule(ctx, S, th, h.x - h.r * 2.6, h.y + h.r * 1.3 + Math.sin(t * 0.9 + 2) * 8 * u, h.r * 0.28, t, 4);
    }
    ctx.save(); pop(ctx, q, h.x, h.y + h.r);
    const iy = h.y + h.r * 1.22 + Math.sin(t * 1.1) * 4 * u;
    island(ctx, S, th, h.x - h.r * 0.35, iy, h.r * 3.5, { seed: 9, depth: h.r * 1.2, ry: h.r * 0.4, gems: 2 });
    observatory(ctx, S, th, h.x - h.r * 1.6, iy + h.r * 0.14, h.r * 0.56, t);
    critter(ctx, S, th, h.x, h.y, h.r, { t, seed: 0, col: th.cols[1], kind: 0, mood: "grin", wave: 1, bob: 0.6 });
    ctx.restore();
    moonsAt(true);
    for (let k = 0; k < 5; k++) { const f = frac(t * 0.35 + k / 5), a = k * 1.9; sparkle(ctx, h.x + Math.cos(a) * h.r * (1.6 + f), h.y + Math.sin(a) * h.r * (1.4 + f), 14 * u * Math.sin(Math.PI * f), k % 2 ? th.accS : "#ffffff", 0.9); }
    ctx.restore();
  }
  // The landing: a curved horizon, the crew cheering, confetti stars falling.
  const CONF = (() => { const R = rng(91); return Array.from({ length: 46 }, () => [R(), R(), 0.08 + R() * 0.12, R() * TAU, Math.floor(R() * 6), Math.floor(R() * 3), 0.6 + R() * 0.8]); })();
  function closingArt(ctx, S, th, P, idx, local, t) {
    const { W, H, u } = S;
    const R = measure(S, "closing") || { x: 140 * u, y: H * 0.4, w: W * 0.55, h: 240 * u };
    const h = heroSpot(S, R, 150);
    const cam = camAt(P, idx, local);
    ctx.save();
    ctx.globalAlpha *= cam.a;
    applyCam(ctx, cam, [W / 2, H * 0.6], [W / 2, H * 0.6], 1);
    const PR = Math.max(W, H) * 1.3, pcy = H - (S.tall ? 170 : 120) * u + PR;
    planet(ctx, S, th, W * 0.5, pcy, PR, mix(th.cols[3], th.sky[1], 0.2), { t, seed: 70, craters: 14, spin: 0.004, halo: 0.25 });
    const surf = (x) => pcy - Math.sqrt(Math.max(0, PR * PR - (x - W / 2) * (x - W / 2)));
    // Friends on the horizon.
    // The horizon party: friends, a planted flag and a landed rocket share the horizon left free by the hero.
    const rs = (S.wide ? 110 : 92) * u, fh = (S.wide ? 200 : 170) * u;
    let items = [
      { kind: "friend", s: 0.5, ci: 2, body: 0, w: h.r * 1.3 }, { kind: "flag", w: fh * 0.75 }, { kind: "friend", s: 0.56, ci: 5, body: 1, w: h.r * 1.4 },
      { kind: "rocket", w: rs * 1.7 }, { kind: "friend", s: 0.6, ci: 4, body: 2, w: h.r * 1.5 },
    ];
    const lo = W * (S.wide ? 0.13 : 0.05), hi = W * (S.wide ? 0.87 : 0.95);
    // A hero floating well above the horizon leaves the ground under it free.
    const clear = surf(h.x) - (h.y + h.r * 1.2) > h.r * 1.35;
    const segs = (clear ? [[lo, hi]] : [[lo, Math.min(hi, h.x - h.r * 1.5)], [Math.max(lo, h.x + h.r * 1.5), hi]]).filter(([a, b]) => b - a > 60 * u);
    const free = segs.reduce((n, [a, b]) => n + b - a, 0);
    const fits = () => items.reduce((n, it) => n + it.w, 0) <= free * 0.92;
    if (!fits()) items = items.filter((it) => it.kind !== "rocket");
    while (items.length > 2 && !fits()) items = items.slice(0, -1);
    const total = items.reduce((n, it) => n + it.w, 0), pad = (free - total) / (items.length + segs.length);
    let si = 0, cur = segs.length ? segs[0][0] + pad : lo;
    const friends = [];
    for (const it of items) {
      while (si < segs.length - 1 && cur + it.w > segs[si][1]) { si++; cur = segs[si][0] + pad; }
      const x = cur + it.w / 2;
      cur += it.w + pad;
      if (it.kind === "friend") friends.push([x, it.s, it.ci, it.body]);
      else if (it.kind === "flag") flag(ctx, S, th, x - fh * 0.3, surf(x) + 6 * u, fh, t, seg(local, 0.2, 0.9));
      else {
        const rb = surf(x) + rs * 0.15;
        for (let k = 0; k < 4; k++) { const f = frac(t * 0.45 + k / 4); ctx.beginPath(); ctx.arc(x + (k % 2 ? 1 : -1) * rs * (0.4 + f * 0.9), rb - rs * 0.1 - f * rs * 0.4, rs * (0.16 + f * 0.22), 0, TAU); ctx.fillStyle = `rgba(255,255,255,${0.32 * (1 - f)})`; ctx.fill(); }
        rocket(ctx, S, th, x, rb, rs, t);
      }
    }
    friends.forEach(([fx, s, ci, kind], k) => {
      const fr = h.r * s;
      const jump = Math.max(0, Math.sin(t * 4 + k * 1.8)) * fr * 0.5;
      critter(ctx, S, th, fx, surf(fx) - fr * 1.1 - jump, fr, { t, seed: 10 + k, col: th.cols[ci], kind, mood: "joy", wave: 1, waveL: 1, bob: 0.3 });
    });
    glow(ctx, h.x, h.y, h.r * 3, th.acc, 0.3 + 0.1 * Math.sin(t * 2));
    for (let k = 0; k < 2; k++) { const pr = frac(t * 0.5 + k * 0.5); ctx.beginPath(); ctx.arc(h.x, h.y, h.r * (1.4 + pr * 1.2), 0, TAU); ctx.strokeStyle = rgba(th.acc, 0.45 * (1 - pr)); ctx.lineWidth = 5 * u; ctx.stroke(); }
    const q = Math.max(0.5, back(seg(local, 0.1, 0.8)));
    ctx.save(); pop(ctx, q, h.x, h.y + h.r);
    critter(ctx, S, th, h.x, h.y - Math.abs(Math.sin(t * 2.2)) * h.r * 0.12, h.r, { t, seed: 0, col: th.cols[1], kind: 0, mood: "joy", wave: 1, waveL: 1, shadow: false, bob: 0.5 });
    ctx.restore();
    ctx.restore();
    // Confetti in screen space.
    const cq = seg(local, 0.15, 0.7) * cam.a;
    if (cq > 0) for (const [x0, y0, sp, ph, ci, shape, sz] of CONF) {
      const y = frac(y0 + t * sp) * (H + 100 * u) - 50 * u, x = x0 * W + Math.sin(t * 1.3 + ph) * 30 * u;
      const s = 12 * u * sz;
      ctx.save(); ctx.globalAlpha *= cq * 0.9; ctx.translate(x, y); ctx.rotate(t * 2 + ph);
      ctx.fillStyle = rgba(ci === 0 ? th.acc : th.cols[ci]);
      if (shape === 0) sparkle(ctx, 0, 0, s, ctx.fillStyle);
      else if (shape === 1) { ctx.beginPath(); ctx.arc(0, 0, s * 0.45, 0, TAU); ctx.fill(); }
      else { rr(ctx, -s * 0.6, -s * 0.2, s * 1.2, s * 0.4, s * 0.2); ctx.fill(); }
      ctx.restore();
    }
  }

  // ---- scene wrapper: the camera, then the drawing, then the foreground -----------------------------
  const LAYOUT = { chart: chartLayout, object: objectLayout, people: peopleLayout, process: processLayout, compare: compareLayout };
  function wrap(id, fn) {
    return (ctx, S, box, p, d, info) => {
      const th = theme(S);
      const P = plan(info.change);
      let idx = P.shown.findIndex((s) => s.id === id);
      if (idx < 0) idx = 0;
      const sc = P.shown[idx] || { hold: info.hold };
      const local = info.local;
      const cam = camAt(P, idx, local);
      const L = { t: info.t, local, hold: sc.hold, pb: clamp((local - 0.1) / Math.max(0.8, sc.hold * 0.62)) };
      const fo = LAYOUT[id](S, box, d).focus;
      ctx.save();
      ctx.globalAlpha *= cam.a;
      applyCam(ctx, cam, [box.x + box.w / 2, box.y + box.h / 2], fo, 1);
      fn(ctx, S, th, box, d, L);
      ctx.restore();
      if (info.exit === undefined) fore(ctx, S, th, info.t);
    };
  }
  const SCENES = { chart: wrap("chart", chartScene), object: wrap("object", objectScene), people: wrap("people", peopleScene), process: wrap("process", processScene), compare: wrap("compare", compareScene) };

  function paintSky(ctx, W, H, t, accent, look) {
    const th = themeOf(look, accent, Math.min(W, H) / 1080);
    sky(ctx, W, H, th, t);
    const R = rng(5);
    for (let i = 0; i < 140; i++) {
      const x = R() * W, y = R() * H, s = (0.6 + R() * 1.8) * th.u, ph = R() * TAU;
      ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fillStyle = `rgba(255,255,255,${(0.45 + 0.4 * Math.sin(t * 2 + ph)) * th.starA})`; ctx.fill();
    }
  }

  return {
    bg: "#17124d", panel: "rgba(255,255,255,0.12)", ink: "#ffffff", muted: "rgba(236,232,255,0.8)", accent: "#ffb547", onAccent: "#24104a",
    rule: "rgba(255,255,255,0.4)", track: "rgba(255,255,255,0.14)",
    display: "'Avenir Next', 'Nunito', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif", displayWeight: 800, displayCase: "none", displayTracking: "-0.01em",
    body: "'Avenir Next', 'Nunito', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif", bodyWeight: 600,
    figures: "'Arial Rounded MT Bold', 'Avenir Next', 'Nunito', 'Segoe UI', Arial, sans-serif", radius: 30, motion: "focus", change: "zoom",
    kit: { line: 3, fill: "solid", panel: "fill" },
    sky: ["#0a0b30", "#1a1760", "#3d1f7c"], neb: ["#2f8fd8", "#b24bd6", "#ff7aa8"],
    cols: ["#ff7a6b", "#3fd2cf", "#ffd25e", "#a98bff", "#5fe3a1", "#ff8cc6"],
    shade: "#1b0f4a", rim: "#9ff3ff", face: "#1d1440", pill: "#ffffff", pillInk: "#1d1650",
    rock: ["#5a3fa8", "#8f78e6"], device: ["#ece9ff", "#b3a8f2"], screen: "#1c1645", starA: 1,
    palettes: {
      // Daytime pastel sky, deep night, and silver on graphite.
      light: { bg: "#ece6ff", ink: "#1d1650", muted: "rgba(29,22,80,0.72)", accent: "#ff6f3c", onAccent: "#ffffff", rule: "rgba(29,22,80,0.3)", track: "rgba(29,22,80,0.1)",
        sky: ["#a7d6ff", "#d8cbff", "#ffd3e2"], neb: ["#ffffff", "#bba9ff", "#ffbfd6"], shade: "#3a2a8a", rim: "#ffffff", rock: ["#8d7ae0", "#c9bdff"], starA: 0.6,
        textShadow: () => "0 4px 0 rgba(255,255,255,0.65), 0 0 28px rgba(255,255,255,0.6)" },
      dark: { bg: "#05061a", sky: ["#020311", "#070b26", "#161645"], neb: ["#1d4f9a", "#5a2a8f", "#1f6f80"], rock: ["#3a2f78", "#5f52b0"], shade: "#03020f" },
      mono: { bg: "#16171c", accent: "#ffffff", onAccent: "#16171c", sky: ["#0d0e12", "#1b1d24", "#2b2e37"], neb: ["#555a66", "#777c88", "#3d414b"],
        cols: ["#d9dce3", "#a9aeb9", "#f2f3f6", "#8a909c", "#c4c8d0", "#b5bac4"], shade: "#0b0c10", rim: "#ffffff", rock: ["#4a4e58", "#7a7f8a"], device: ["#e8e9ee", "#a9adb7"], face: "#16171c", pillInk: "#16171c", screen: "#202228" },
    },
    textShadow: () => "0 5px 0 rgba(14,8,46,0.45), 0 0 34px rgba(14,8,46,0.55)",
    backdrop: (accent, texture = 1, look) => {
      const s = (look && look.sky) || ["#0a0b30", "#1a1760", "#3d1f7c"];
      return `${grain(0.04 * texture)}, linear-gradient(165deg, ${s[0]} 0%, ${s[1]} 55%, ${s[2]} 100%)`;
    },
    // The kicker becomes a flat pill with a hard drop shadow.
    css: (accent, look) => {
      const sh = rgb(look.shade || "#1b0f4a");
      return `#title-scene .kicker { align-self: flex-start; padding: 0.45em 1.05em; border-radius: 999px; background: ${accent}; color: ${lum(rgb(accent)) > 165 ? (look.face || "#1d1440") : "#ffffff"};
        text-shadow: none; letter-spacing: 0.1em; box-shadow: 0 0.2em 0 ${rgba(sh, 0.45)}; }`;
    },
    // Other templates get the starry sky on the texture canvas; this one draws its own stage.
    paint: (ctx, W, H, t, accent, look) => {
      ctx.clearRect(0, 0, W, H);
      if (document.getElementById("art")) return;
      paintSky(ctx, W, H, t, accent, look);
    },
    keepArt: true,
    overlap: true,
    stage(ctx, S, info) {
      const th = theme(S);
      const P = plan(info.change);
      const t = info.t;
      let idx = info.index, local = info.local;
      // Past the last frame, keep showing the final scene at rest.
      const ended = idx < 0 && P.shown.length > 0;
      if (ended) { idx = P.shown.length - 1; local = P.shown[idx].hold - 0.001; }
      const sc = P.shown[idx];
      if (S.paint) {
        sky(ctx, S.W, S.H, th, t);
        farThings(ctx, S, th, t);
        starfield(ctx, S, th, t, P);
        if (idx > 0 && local < P.change) plateAt(ctx, S, th, P, idx - 1, P.shown[idx - 1].hold + local, t);
        if (sc) plateAt(ctx, S, th, P, idx, local, t);
      }
      // The title has no drawer, so it dives out here while the next scene arrives.
      if (idx > 0 && P.shown[idx - 1].id === "title" && local < P.change) titleArt(ctx, S, th, P, idx - 1, P.shown[idx - 1].hold + local, t);
      if (!sc) return;
      if (sc.id === "title") titleArt(ctx, S, th, P, idx, local, t);
      else if (sc.id === "closing") closingArt(ctx, S, th, P, idx, local, t);
      else if (ended) SCENES[sc.id](ctx, S, boxOf(S), 1, dataOf()[sc.id], { t, local, hold: sc.hold, change: P.change });
      if (sc.id === "title" || sc.id === "closing") fore(ctx, S, th, t);
    },
    scenes: SCENES,
  };
});
