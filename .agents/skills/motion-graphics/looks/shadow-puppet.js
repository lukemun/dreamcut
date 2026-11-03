// Shadow Puppet: a backlit cloth screen in a small wooden theatre. An oil lamp behind the cloth throws
// an amber-to-red falloff that breathes and flickers; every drawing is a black cut-out pressed against
// the cloth, perforated with lace cuts and pinned at its joints, worked from below on thin rods.
// Coloured gel fills some cuts. Scenes press onto the screen out of a soft, oversized shadow and leave
// by pulling back toward the lamp, while a large out-of-focus paper bird sweeps past the light.
// Painted wave strips rock at the front of the stage the whole time. All figures are original.
// Frames are pure functions of time: seeded noise only.
window.DreamcutMotion.register("shadow-puppet", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const ei = (v) => Math.pow(clamp(v), 2.2);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const stagger = (p, i, n, spread = 0.55) => clamp((p - (i / Math.max(1, n)) * spread) / (1 - spread));
  const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif";
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];

  // Smooth seeded noise for sway and lamp flicker.
  const NZ = (() => { const r = rng(311); return Array.from({ length: 256 }, () => r()); })();
  const noise1 = (x) => { const i = Math.floor(x), f = x - i, a = NZ[i & 255], b = NZ[(i + 1) & 255], s = f * f * (3 - 2 * f); return a + (b - a) * s; };
  const wob = (t, k, seed = 0) => noise1(t * k + seed * 37.13) * 2 - 1;

  const fmt = (target, k, d) => {
    const dec = Math.abs((Number(target) || 0) % 1) > 0.001 ? 1 : 0;
    return window.DreamcutMotion.formatNumber((Number(target) || 0) * k, dec, (d && d.prefix) || "", (d && d.suffix) || "");
  };

  // ---- buffers --------------------------------------------------------------------------------------
  const BUF = {};
  function buf(key, w, h) {
    let c = BUF[key];
    if (!c) c = BUF[key] = document.createElement("canvas");
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return c;
  }
  function fresh(key, F) {
    const c = buf(key, F.W, F.H), g = c.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.filter = "none";
    g.clearRect(0, 0, F.W, F.H);
    return [c, g];
  }

  // Cloth weave (multiplied over the lamp light) and film grain, built once from seeds.
  let weaveTile = null, grainTile = null, tileKey = "";
  function tiles(F) {
    const key = `${F.T.screen}`;
    if (weaveTile && tileKey === key) return;
    tileKey = key;
    weaveTile = document.createElement("canvas"); weaveTile.width = weaveTile.height = 480;
    const w = weaveTile.getContext("2d"), r = rng(77);
    w.fillStyle = "#fff"; w.fillRect(0, 0, 480, 480);
    for (let y = 0; y < 480; y += 3) { w.fillStyle = `rgba(50,25,8,${0.03 + r() * 0.06})`; w.fillRect(0, y, 480, 1); }
    for (let x = 0; x < 480; x += 3) { w.fillStyle = `rgba(50,25,8,${0.02 + r() * 0.05})`; w.fillRect(x, 0, 1, 480); }
    for (let i = 0; i < 220; i++) { // slubs in the thread
      w.fillStyle = `rgba(40,20,6,${0.05 + r() * 0.1})`;
      const sx = r() * 480, sy = Math.floor(r() * 160) * 3, sl = 6 + r() * 30;
      w.fillRect(sx, sy, sl, 1.6); if (sx + sl > 480) w.fillRect(sx - 480, sy, sl, 1.6);
    }
    grainTile = document.createElement("canvas"); grainTile.width = grainTile.height = 256;
    const gg = grainTile.getContext("2d"), img = gg.createImageData(256, 256), r2 = rng(19);
    for (let i = 0; i < img.data.length; i += 4) { const v = r2() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 40 + r2() * 60; }
    gg.putImageData(img, 0, 0);
  }

  // Low-frequency mottling over the whole sheet, untiled, so the cloth reads as one continuous piece.
  let mottle = null, mottleKey = "";
  function mottleArt(F) {
    const key = `${F.W}x${F.H}`;
    if (mottle && mottleKey === key) return mottle;
    mottleKey = key;
    const mw = Math.ceil(F.W / 4), mh = Math.ceil(F.H / 4);
    mottle = document.createElement("canvas"); mottle.width = mw; mottle.height = mh;
    const g = mottle.getContext("2d"), r = rng(91);
    g.fillStyle = "#fff"; g.fillRect(0, 0, mw, mh);
    for (let i = 0; i < 60; i++) {
      const x = r() * mw, y = r() * mh, rad = (0.04 + r() * 0.14) * Math.max(mw, mh), gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(60,30,10,${0.04 + r() * 0.06})`); gr.addColorStop(1, "rgba(60,30,10,0)");
      g.fillStyle = gr; g.fillRect(0, 0, mw, mh);
    }
    return mottle;
  }

  // ---- controls, plan and layout ------------------------------------------------------------------
  function controls() {
    if (window.__dreamcut && window.__dreamcut.controls) return window.__dreamcut.controls;
    try { if (typeof dc !== "undefined" && dc && dc.controls) return dc.controls; } catch (e) { /* not on this page */ }
    return null;
  }
  let planCache = null, planKey = "";
  function planOf(F) {
    const c = controls();
    if (!c) return null;
    const key = `${F.W}x${F.H}`;
    if (planCache && planKey === key) return planCache;
    let t = 0;
    const shown = [];
    for (const id of ORDER) { const hold = Number(c[`${id}_hold`]) || 0; if (hold > 0) shown.push({ id, start: t, hold }); t += hold; }
    if (!shown.length) return null;
    shown.forEach((st, i) => { st.i = i; });
    const data = {
      chart: { labels: [c.bar_1_label, c.bar_2_label, c.bar_3_label, c.bar_4_label], values: [c.bar_1, c.bar_2, c.bar_3, c.bar_4].map((v) => Number(v) || 0), suffix: c.chart_suffix, prefix: "", highlight: Number(c.highlight) - 1 },
      object: { kind: c.device, callouts: [c.callout_1, c.callout_2, c.callout_3] },
      people: { count: c.people_count, badges: [c.badge_1, c.badge_2, c.badge_3], highlight: 1 },
      process: { steps: [c.step_1, c.step_2, c.step_3] },
      compare: { left: c.before_label, leftValue: Number(c.before_value) || 0, right: c.after_label, rightValue: Number(c.after_value) || 0, suffix: c.compare_suffix, prefix: "" },
      title: {}, closing: {},
    };
    planKey = key;
    return (planCache = { shown, data, change: Number(c.change) || 0.45, length: t });
  }
  // Where a scene's drawing lives: under its headline and above the stage floor.
  function areaOf(F) {
    const side = (F.tall ? 90 : 140) * F.u;
    const top = F.tall ? F.H * 0.29 : F.H * 0.3;
    return { x: side, y: top, w: F.W - side * 2, h: F.groundY - top };
  }
  // Headline lines as laid out on the page (transforms ignored), read once.
  const lineCache = {};
  function headLines(id) {
    if (lineCache[id]) return lineCache[id];
    const el = document.getElementById(id), root = document.getElementById("root");
    if (!el || !root || !el.firstChild) return [];
    let ox = 0, oy = 0;
    for (let n = el; n && n !== root; n = n.offsetParent) { ox += n.offsetLeft; oy += n.offsetTop; }
    const scale = root.getBoundingClientRect().width / (Number(root.dataset.width) || 1920) || 1;
    const er = el.getBoundingClientRect(), range = document.createRange();
    range.selectNodeContents(el);
    const out = [];
    for (const r of range.getClientRects()) {
      const line = { x: ox + (r.left - er.left) / scale, y: oy + (r.top - er.top) / scale, w: r.width / scale, h: r.height / scale };
      if (line.w > 1 && !out.some((o) => Math.abs(o.y - line.y) < 2)) out.push(line);
    }
    if (out.length) lineCache[id] = out;
    return out;
  }
  function textBand(ids, F) {
    let top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity;
    for (const id of ids) for (const L of headLines(id)) { top = Math.min(top, L.y); bottom = Math.max(bottom, L.y + L.h); left = Math.min(left, L.x); right = Math.max(right, L.x + L.w); }
    if (!isFinite(top)) return { top: F.H * 0.38, bottom: F.H * 0.58, left: F.W * 0.2, right: F.W * 0.8 };
    return { top, bottom, left, right };
  }

  // ---- drawing primitives -------------------------------------------------------------------------
  const ink = (F, a = 1) => `rgba(${F.T.ink},${a})`;
  const lit = (F, a = 1) => `rgba(${F.T.hot},${a})`;
  const parch = (F, a = 1) => `rgba(${F.T.parch},${a})`;
  const rgbStr = (s) => `rgb(${s})`;
  function mixRGB(a, b, k) {
    const A = a.split(",").map(Number), B = b.split(",").map(Number);
    return A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(",");
  }
  // Cut holes through a silhouette (inside its clip) and optionally lay coloured gel into them.
  function cut(g, F, clip, holes, gelAlpha) {
    g.save();
    if (clip) { g.beginPath(); clip(); g.clip(); }
    g.globalCompositeOperation = "destination-out";
    g.fillStyle = "#000"; g.beginPath(); holes(); g.fill();
    if (gelAlpha) { g.globalCompositeOperation = "source-over"; g.fillStyle = F.acc(gelAlpha); g.beginPath(); holes(); g.fill(); }
    g.restore();
  }
  const dot = (g, x, y, r) => { g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); };
  const ell = (g, x, y, rx, ry, rot = 0) => { g.moveTo(x + Math.cos(rot) * rx, y + Math.sin(rot) * rx); g.ellipse(x, y, rx, ry, rot, 0, TAU); };
  // A crescent cut: one circle minus an offset circle, traced as a closed shape.
  function crescent(g, x, y, r, ang = -Math.PI / 2) {
    const a0 = ang - 1.2, a1 = ang + 1.2;
    g.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r);
    g.arc(x, y, r, a0, a1);
    g.quadraticCurveTo(x + Math.cos(ang) * r * 0.25, y + Math.sin(ang) * r * 0.25, x + Math.cos(a0) * r, y + Math.sin(a0) * r);
  }
  function diamond(g, x, y, w, h) { g.moveTo(x, y - h); g.lineTo(x + w, y); g.lineTo(x, y + h); g.lineTo(x - w, y); g.closePath(); }
  function petal(g, x, y, r) { for (let k = 0; k < 4; k++) { const a = (k * TAU) / 4; ell(g, x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.5, r * 0.22, a); } }
  // A rod worked from below: a thin dark stick, softer than the pressed cut-outs.
  function rod(g, F, x1, y1, x2, y2, a = 1) {
    g.save(); g.lineCap = "round";
    g.strokeStyle = ink(F, 0.12 * a); g.lineWidth = 8 * F.u; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    g.strokeStyle = ink(F, 0.55 * a); g.lineWidth = 2.6 * F.u; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    g.restore();
  }
  function thread(g, F, x1, y1, x2, y2, sag, q = 1) {
    if (q <= 0) return;
    g.save(); g.strokeStyle = ink(F, 0.85); g.lineWidth = 2.2 * F.u; g.lineCap = "round";
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 + sag;
    g.beginPath(); g.moveTo(x1, y1);
    const steps = 24;
    for (let i = 1; i <= Math.ceil(steps * q); i++) {
      const k = Math.min(1, i / steps), a = (1 - k) * (1 - k), b = 2 * (1 - k) * k, c = k * k;
      g.lineTo(a * x1 + b * mx + c * x2, a * y1 + b * my + c * y2);
    }
    g.stroke(); g.restore();
  }
  function setFont(g, size, weight = 600, italic = false) { g.font = `${italic ? "italic " : ""}${weight} ${size}px ${SERIF}`; }
  function say(g, s, x, y, size, o = {}) {
    s = String(s ?? "");
    if (!s) return { w: 0, size };
    setFont(g, size, o.weight || 600, o.italic);
    let w = g.measureText(s).width;
    if (o.maxW && w > o.maxW) { size = Math.max(o.min || size * 0.8, (size * o.maxW) / w); setFont(g, size, o.weight || 600, o.italic); w = g.measureText(s).width; }
    g.textAlign = o.align || "left"; g.textBaseline = o.base || "alphabetic"; g.fillStyle = o.color;
    if (!o.measure) g.fillText(s, x, y);
    return { w, size };
  }
  // A translucent oiled-paper pennant: glows brighter than the cloth, lettered in ink, swallow-tailed.
  function pennant(g, F, s, x, y, size, o = {}) {
    const { u } = F;
    const m = say(g, s, 0, 0, size, { measure: true, maxW: o.maxW ? o.maxW - 70 * u : undefined, min: o.min || 42 * u, weight: 600 });
    const w = m.w + 74 * u, h = m.size * 1.5, sc = o.scale ?? 1;
    const x0 = o.align === "center" ? -w / 2 : o.align === "right" ? -w : 0;
    g.save(); g.translate(x, y); g.rotate(o.rot || 0); g.scale(sc, sc);
    const notch = h * 0.32;
    const shape = () => {
      g.moveTo(x0, -h / 2); g.lineTo(x0 + w, -h / 2); g.lineTo(x0 + w - notch, 0); g.lineTo(x0 + w, h / 2);
      g.lineTo(x0, h / 2); g.lineTo(x0 + notch, 0); g.closePath();
    };
    g.beginPath(); shape(); g.fillStyle = parch(F, 0.96); g.fill();
    g.lineWidth = 3 * u; g.strokeStyle = ink(F, 0.9); g.stroke();
    // A border of tiny pricked holes, then the lettering.
    g.fillStyle = ink(F, 0.55);
    g.beginPath();
    for (let xx = x0 + notch + 12 * u; xx < x0 + w - notch - 6 * u; xx += 14 * u) { dot(g, xx, -h / 2 + 8 * u, 1.8 * u); dot(g, xx, h / 2 - 8 * u, 1.8 * u); }
    g.fill();
    say(g, s, x0 + w / 2, 2 * u, m.size, { align: "center", base: "middle", color: ink(F, 1), weight: 600 });
    g.restore();
    return { w: w * sc, h: h * sc, x0 };
  }

  // ---- characters -----------------------------------------------------------------------------------
  // A jointed profile puppet, about 100 units tall to the crown of the head, facing right before `face`.
  function limb(g, x1, y1, x2, y2, r1, r2) {
    const a = Math.atan2(y2 - y1, x2 - x1), nx = -Math.sin(a), ny = Math.cos(a);
    g.moveTo(x1 + nx * r1, y1 + ny * r1); g.lineTo(x2 + nx * r2, y2 + ny * r2);
    g.arc(x2, y2, r2, a + Math.PI / 2, a - Math.PI / 2, true);
    g.lineTo(x1 - nx * r1, y1 - ny * r1);
    g.arc(x1, y1, r1, a - Math.PI / 2, a + Math.PI / 2, true);
    g.closePath();
  }
  function armPath(g, sx, sy, a, b) {
    const L1 = 19, L2 = 17;
    const ex = sx + Math.sin(a) * L1, ey = sy + Math.cos(a) * L1, a2 = a + b;
    const hx = ex + Math.sin(a2) * L2, hy = ey + Math.cos(a2) * L2;
    g.beginPath(); limb(g, sx, sy, ex, ey, 4.4, 3.4); g.fill();
    g.beginPath(); limb(g, ex, ey, hx, hy, 3.4, 2.5); g.fill();
    g.beginPath(); dot(g, hx, hy, 3); g.fill();
    return { ex, ey, hx, hy, a2 };
  }
  function hat(g, kind, t, seed) {
    g.beginPath();
    switch (kind % 6) {
      case 0: ell(g, 0, -14, 14.5, 2.4); g.roundRect(-6, -24, 13, 11, 3); break;
      case 1: {
        g.moveTo(-7.5, -13); g.lineTo(8.5, -13); g.lineTo(1, -36); g.closePath(); g.fill();
        const sw = Math.sin(t * 2.4 + seed) * 0.5;
        g.beginPath(); g.lineWidth = 1.2; g.strokeStyle = g.fillStyle; g.moveTo(1, -36); g.quadraticCurveTo(-3, -37, -5 - sw * 3, -31); g.stroke();
        g.beginPath(); dot(g, -5 - sw * 3, -30, 2.4); break;
      }
      case 2: {
        g.ellipse(0, -13, 8.6, 6.6, 0, Math.PI, TAU); g.closePath(); g.fill();
        const sw = Math.sin(t * 1.9 + seed) * 0.08;
        g.beginPath(); g.save(); g.translate(-4, -17); g.rotate(-0.7 + sw);
        g.moveTo(0, 0); g.quadraticCurveTo(5, -9, 0, -19); g.quadraticCurveTo(-5, -9, 0, 0); g.restore(); break;
      }
      case 3: dot(g, -6.5, -15, 4.8); g.ellipse(0, -10, 8, 6.4, 0, Math.PI * 1.05, TAU * 0.99); break;
      case 4: g.rect(-10.5, -15, 22, 2.6); g.rect(-6.5, -31, 13.5, 16.5); break;
      default: g.moveTo(7, -10); g.quadraticCurveTo(6, -19, -1, -19.5); g.quadraticCurveTo(-11, -19, -12, -8); g.quadraticCurveTo(-15, -2, -19, 3); g.lineTo(-7, 2); g.closePath();
    }
    g.fill();
  }
  function robePath(g) {
    g.moveTo(-11, -47); g.lineTo(11, -47); g.quadraticCurveTo(15, -25, 23, -3);
    for (let i = 0; i < 6; i++) { const x0 = 23 - (i * 46) / 6, x1 = 23 - ((i + 1) * 46) / 6; g.quadraticCurveTo((x0 + x1) / 2, 2.2, x1, -3); }
    g.quadraticCurveTo(-15, -25, -11, -47); g.closePath();
  }
  function torsoPath(g) {
    g.moveTo(-10, -47); g.lineTo(-11, -71); g.quadraticCurveTo(-10, -79, -3, -80.5); g.lineTo(5, -80.5);
    g.quadraticCurveTo(13.5, -78, 13.5, -68); g.quadraticCurveTo(13.5, -56, 10, -47); g.closePath();
  }
  // o: { face, hat, sway, nod, frontA, frontB, backA, backB, gel, t, seed, prop, rods, pattern }
  function puppet(g, F, x, base, h, o) {
    const k = h / 100, f = o.face || 1, t = o.t || 0;
    g.save();
    g.translate(x, base); g.rotate(o.sway || 0); g.scale(f * k, k);
    g.fillStyle = ink(F, 1);
    const backArm = armPath(g, -4, -74, -(o.backA ?? -0.2), o.backB ?? -0.3);
    const mBack = g.getTransform();
    g.beginPath(); robePath(g); g.fill();
    g.beginPath(); // pointed shoes
    g.moveTo(6, -3); g.lineTo(22, -3.5); g.quadraticCurveTo(30, -4, 31, -8); g.quadraticCurveTo(29, 0.5, 20, 1); g.lineTo(6, 1); g.closePath();
    g.moveTo(-14, -3); g.lineTo(-2, -3); g.lineTo(-2, 1); g.lineTo(-16, 1); g.closePath(); g.fill();
    g.beginPath(); torsoPath(g); g.fill();
    // Lace in the robe and torso; the highlighted puppet carries gel in its cuts.
    const pat = o.pattern ?? 0;
    cut(g, F, () => robePath(g), () => {
      for (let r = 0; r < 4; r++) {
        const y = -40 + r * 8, half = 9 + r * 3;
        for (let xx = -half; xx <= half + 0.1; xx += 6) {
          if (pat % 3 === 0) dot(g, xx + (r % 2) * 3, y, 1.6);
          else if (pat % 3 === 1) diamond(g, xx + (r % 2) * 3, y, 1.8, 2.6);
          else crescent(g, xx + (r % 2) * 3, y, 2.2, Math.PI / 2);
        }
      }
      for (let xx = -19; xx <= 19; xx += 5.5) crescent(g, xx, -9, 2.4, -Math.PI / 2);
    }, o.gel ? 0.72 : 0);
    cut(g, F, () => torsoPath(g), () => {
      for (let yy = -74; yy <= -52; yy += 7) for (let xx = -6; xx <= 8; xx += 7) petal(g, xx + ((yy / 7) % 2 ? 3 : 0), yy, 3.4);
      g.rect(-10, -50, 22, 1.6);
    }, o.gel ? 0.72 : 0);
    // Head on a pinned neck.
    g.save(); g.translate(1, -81); g.rotate(o.nod || 0);
    g.beginPath(); g.rect(-3, -4, 6, 5); ell(g, 0, -8.5, 7, 7.6);
    g.moveTo(5, -11); g.lineTo(11, -7.5); g.lineTo(5.5, -5.2); g.closePath();
    g.moveTo(3, -3.5); g.quadraticCurveTo(6, -1.5, 3, 0); g.fill();
    hat(g, o.hat ?? 0, t, o.seed || 0);
    cut(g, F, null, () => { ell(g, 3.4, -10, 1.8, 1); });
    g.restore();
    // Pins at the joints show as pricks of light.
    cut(g, F, null, () => { dot(g, 1, -80, 1.2); dot(g, 0, -47, 1.2); });
    const front = armPath(g, 4, -74, o.frontA ?? 0.3, o.frontB ?? 0.4);
    cut(g, F, null, () => { dot(g, 4, -74, 1.3); dot(g, front.ex, front.ey, 1.1); });
    if (o.prop) o.prop(g, front);
    const m = g.getTransform();
    g.restore();
    const hand = m.transformPoint(new DOMPoint(front.hx, front.hy));
    const hand2 = mBack.transformPoint(new DOMPoint(backArm.hx, backArm.hy));
    const body = m.transformPoint(new DOMPoint(0, -40));
    if (o.rods !== false) {
      rod(g, F, hand.x, hand.y, hand.x + f * 40 * F.u, F.H + 40 * F.u, 0.9);
      rod(g, F, body.x, body.y, body.x - f * 10 * F.u, F.H + 40 * F.u, 0.9);
    }
    return { hand, hand2, head: m.transformPoint(new DOMPoint(1, -95)) };
  }
  // A cut-paper bird: forked tail, pricked eye, wings that flap with `flap` (-1..1).
  function bird(g, F, x, y, s, flap, face = 1, o = {}) {
    g.save(); g.translate(x, y); g.scale(face * s / 100, s / 100); g.rotate(o.tilt || 0);
    g.fillStyle = o.color || ink(F, 1);
    g.beginPath();
    g.moveTo(42, -4); g.quadraticCurveTo(36, -18, 22, -14); g.quadraticCurveTo(0, -12, -22, -2);
    g.lineTo(-52, -14); g.lineTo(-40, 2); g.lineTo(-54, 12); g.lineTo(-20, 8);
    g.quadraticCurveTo(10, 14, 30, 4); g.lineTo(52, 2); g.closePath(); g.fill();
    const wing = (sgn, a) => {
      g.save(); g.translate(4, -8); g.rotate(a);
      g.beginPath(); g.moveTo(-14, 0); g.quadraticCurveTo(-4, -30 * sgn, -30, -62 * sgn); g.quadraticCurveTo(4, -40 * sgn, 18, 0); g.closePath(); g.fill();
      if (!o.plain) cut(g, F, null, () => { for (let i = 0; i < 4; i++) ell(g, -4 - i * 5, (-12 - i * 10) * sgn, 1.6, 4.5, 0.5); });
      g.restore();
    };
    wing(1, flap * 0.9);
    if (!o.single) wing(1, flap * 0.9 - 0.35);
    if (!o.plain) cut(g, F, null, () => { dot(g, 30, -6, 2.6); for (let i = 0; i < 3; i++) crescent(g, 4 - i * 8, 2, 2.6, Math.PI / 2); });
    g.restore();
  }

  // ---- the theatre ----------------------------------------------------------------------------------
  function lamp(F) {
    const { W, H, t } = F;
    return {
      x: W * (0.5 + 0.035 * wob(t, 0.13, 1)),
      y: H * ((F.tall ? 0.34 : 0.38) + 0.025 * wob(t, 0.09, 3)),
      k: 1 + 0.018 * wob(t, 7, 5) + 0.01 * Math.sin(t * 21.3) + 0.012 * wob(t, 1.1, 9),
    };
  }
  function cloth(ctx, F) {
    const { W, H, T, u, t, tex } = F;
    const L = F.lamp;
    ctx.save();
    ctx.fillStyle = rgbStr(T.edge); ctx.fillRect(0, 0, W, H);
    const R = Math.hypot(W, H) * 0.64 * L.k;
    const gr = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, R);
    gr.addColorStop(0, rgbStr(T.hot)); gr.addColorStop(0.3, rgbStr(mixRGB(T.hot, T.mid, 0.5))); gr.addColorStop(0.58, rgbStr(T.mid));
    gr.addColorStop(0.82, rgbStr(T.rim)); gr.addColorStop(1, rgbStr(T.edge));
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    if (F.S.paint && tex > 0) {
      // Weave, seams and a slow ripple running through the hanging cloth.
      ctx.globalCompositeOperation = "multiply"; ctx.globalAlpha = 0.85 * tex;
      ctx.fillStyle = ctx.createPattern(weaveTile, "repeat"); ctx.fillRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = true; ctx.drawImage(mottleArt(F), 0, 0, W, H);
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = tex;
      const rx = ((t * 0.035) % 1.6 - 0.3) * W;
      const band = ctx.createLinearGradient(rx - W * 0.25, 0, rx + W * 0.25, H * 0.4);
      band.addColorStop(0, lit(F, 0)); band.addColorStop(0.5, lit(F, 0.07)); band.addColorStop(1, lit(F, 0));
      ctx.fillStyle = band; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 3; i++) { // soft vertical folds where the cloth hangs unevenly
        const fx = W * (0.16 + i * 0.34) + wob(t, 0.25, i + 20) * 30 * u, fw = 90 * u;
        const fg = ctx.createLinearGradient(fx - fw, 0, fx + fw, 0);
        fg.addColorStop(0, ink(F, 0)); fg.addColorStop(0.5, ink(F, 0.06)); fg.addColorStop(1, ink(F, 0));
        ctx.fillStyle = fg; ctx.fillRect(fx - fw, 0, fw * 2, H);
      }
    }
    ctx.restore();
  }
  // Out-of-focus cut-outs held further back: a hanging willow sprig and a passing flock.
  let sprig = null, sprigKey = "";
  function sprigArt(F) {
    const key = `${F.u}:${F.T.ink}`;
    if (sprig && sprigKey === key) return sprig;
    sprigKey = key;
    const s = 520 * F.u;
    sprig = document.createElement("canvas"); sprig.width = Math.ceil(s); sprig.height = Math.ceil(s * 1.3);
    const g = sprig.getContext("2d"), r = rng(5);
    g.fillStyle = ink(F, 1); g.strokeStyle = ink(F, 1); g.lineCap = "round";
    for (let b = 0; b < 4; b++) {
      const x0 = s * (0.55 + b * 0.1), len = s * (0.75 + r() * 0.45);
      g.lineWidth = 6 * F.u;
      g.beginPath(); g.moveTo(x0, 0); g.quadraticCurveTo(x0 - s * 0.18, len * 0.5, x0 - s * (0.12 + b * 0.06), len); g.stroke();
      for (let i = 1; i < 14; i++) {
        const k = i / 14, px = lerp(x0, x0 - s * (0.12 + b * 0.06), k) - Math.sin(k * Math.PI) * s * 0.09, py = len * k;
        for (const sd of [-1, 1]) {
          g.save(); g.translate(px, py); g.rotate(sd * (0.5 + r() * 0.4) + 0.2);
          g.beginPath(); g.ellipse(sd * 22 * F.u, 0, 26 * F.u, 7 * F.u, 0, 0, TAU); g.fill(); g.restore();
        }
      }
    }
    return sprig;
  }
  // A far country held back from the cloth: rolling hills, cottages with gel windows, poplars and a
  // windmill, soft and faint because the card sits nearer the lamp. Built once, panned slowly.
  let hills = null, hillsKey = "";
  const HILL_H = 300;
  function hillsArt(F) {
    const key = `${F.W}x${F.H}:${F.T.ink}:${F.S.accent}`;
    if (hills && hillsKey === key) return hills;
    hillsKey = key;
    const u = F.u, w = Math.ceil(F.W + 420 * u), h = Math.ceil(HILL_H * u);
    hills = document.createElement("canvas"); hills.width = w; hills.height = h;
    const g = hills.getContext("2d"), r = rng(57);
    g.fillStyle = ink(F, 1);
    const ridge = (x) => h * 0.62 + Math.sin(x / (260 * u)) * 26 * u + Math.sin(x / (97 * u) + 2) * 9 * u;
    g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 8 * u) g.lineTo(x, ridge(x));
    g.lineTo(w, h); g.closePath(); g.fill();
    const mills = [];
    for (let x = 60 * u; x < w - 60 * u; x += (110 + r() * 150) * u) {
      const y = ridge(x) + 4 * u, kind = r();
      g.beginPath();
      if (kind < 0.4) { // a cottage with a pitched roof and lit window
        const cw = (46 + r() * 30) * u, ch = cw * 0.7;
        g.rect(x - cw / 2, y - ch, cw, ch); g.moveTo(x - cw * 0.62, y - ch); g.lineTo(x, y - ch - cw * 0.5); g.lineTo(x + cw * 0.62, y - ch); g.closePath();
        g.rect(x + cw * 0.18, y - ch - cw * 0.5, cw * 0.12, cw * 0.3); g.fill();
        cut(g, F, null, () => { g.rect(x - cw * 0.3, y - ch * 0.7, cw * 0.18, cw * 0.18); g.rect(x + cw * 0.1, y - ch * 0.7, cw * 0.18, cw * 0.18); }, 0.8);
      } else if (kind < 0.75) { // poplars
        for (let k = 0; k < 2 + Math.floor(r() * 2); k++) { const px = x + k * 26 * u, ph = (70 + r() * 50) * u; ell(g, px, y - ph * 0.55, 12 * u, ph * 0.5); g.rect(px - 2 * u, y - ph * 0.1, 4 * u, ph * 0.12); }
        g.fill();
      } else if (!mills.length || x - mills[mills.length - 1].x > 700 * u) { // a windmill tower; sails turn live
        const th = 120 * u;
        g.moveTo(x - 24 * u, y); g.lineTo(x - 13 * u, y - th); g.lineTo(x + 13 * u, y - th); g.lineTo(x + 24 * u, y); g.closePath(); g.fill();
        cut(g, F, null, () => { g.rect(x - 5 * u, y - th * 0.6, 10 * u, 14 * u); g.rect(x - 6 * u, y - 26 * u, 12 * u, 22 * u); }, 0.7);
        mills.push({ x, y: y - th - 4 * u });
      } else { g.moveTo(x - 30 * u, y); g.quadraticCurveTo(x, y - 40 * u, x + 30 * u, y); g.fill(); }
    }
    hills.mills = mills;
    return hills;
  }
  function farHills(ctx, F) {
    const { W, u, t, groundY } = F;
    const art = hillsArt(F), [c, g] = fresh("far", F);
    const off = -(art.width - W) * (0.5 - 0.5 * Math.cos(t * 0.045));
    const top = groundY - HILL_H * u + 26 * u;
    g.drawImage(art, off, top);
    g.fillStyle = ink(F, 1);
    for (const m of art.mills) {
      const mx = m.x + off, my = m.y + top;
      if (mx < -100 * u || mx > W + 100 * u) continue;
      g.save(); g.translate(mx, my); g.rotate(t * 0.9);
      g.beginPath();
      for (let k = 0; k < 4; k++) { g.rotate(TAU / 4); g.rect(-3 * u, 0, 6 * u, 70 * u); g.rect(3 * u, 16 * u, 14 * u, 52 * u); }
      g.fill(); g.beginPath(); dot(g, 0, 0, 7 * u); g.fill();
      g.restore();
    }
    ctx.save(); ctx.globalAlpha = 0.24; ctx.filter = `blur(${3.5 * u}px)`; ctx.drawImage(c, 0, 0); ctx.restore();
  }
  function farLayer(ctx, F) {
    const { W, H, u, t } = F;
    farHills(ctx, F);
    const sp = sprigArt(F);
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.filter = `blur(${7 * u}px)`;
    ctx.translate(W - sp.width * 0.62, -40 * u); ctx.rotate(0.05 * Math.sin(t * 0.55) + 0.03 * wob(t, 0.4, 2));
    ctx.drawImage(sp, -sp.width * 0.4, 0);
    ctx.restore();
    // A small flock crosses the sky on a slow cycle, routed clear of every headline on screen during
    // that flight (decided once per flight, so the path never jumps).
    const cyc = 13, k = ((t + 4) % cyc) / cyc;
    if (k < 0.7) {
      const q = k / 0.7;
      const fs = Math.floor((t + 4) / cyc) * cyc - 4, fe = fs + cyc * 0.7;
      const P = planOf(F), ids = [];
      const HEAD = { title: ["kicker", "title"], closing: ["closing"], chart: ["chart-title"], object: ["object-title"], people: ["people-title"], process: ["process-title"], compare: ["compare-title"] };
      if (P) for (const st of P.shown) if (st.start - 1 < fe && st.start + st.hold + 1 > fs) ids.push(...(HEAD[st.id] || []));
      const band = textBand(ids.length ? ids : ["title"], F);
      const above = band.top - 110 * u > 120 * u;
      if (above) { // Over a centred title: a slow arc across the sky above it.
        const baseY = band.top - 110 * u;
        for (let i = 0; i < 3; i++) {
          const bx = lerp(-80 * u, W + 80 * u, q) - i * 70 * u, by = baseY - Math.sin(q * Math.PI) * 40 * u - i * 22 * u + Math.sin(t * 3 + i) * 6 * u;
          ctx.save(); ctx.globalAlpha = 0.8; bird(ctx, F, bx, by, 46 * u, Math.sin(t * 11 + i * 1.7), 1, { plain: true }); ctx.restore();
        }
      } else if (W - band.right > 320 * u) { // Beside a top headline: in from the wing, a turn, and out again.
        const near = band.right + 140 * u, far = W + 120 * u, by0 = (band.top + band.bottom) / 2;
        const reach = Math.sin(q * Math.PI), face = q < 0.5 ? -1 : 1;
        for (let i = 0; i < 3; i++) {
          const bx = lerp(far, near, reach) + i * 64 * u, by = by0 + (i - 1) * 18 * u + Math.sin(t * 3 + i) * 5 * u;
          ctx.save(); ctx.globalAlpha = 0.8; bird(ctx, F, bx, by, 42 * u, Math.sin(t * 11 + i * 1.7), face, { plain: true }); ctx.restore();
        }
      }
    }
  }
  // The bank the puppets stand on, with a pricked border so it reads as cut card.
  function bank(ctx, F) {
    const { W, H, u, t, groundY } = F;
    const [c, g] = fresh("bank", F);
    g.fillStyle = ink(F, 1);
    const bottom = groundY + 46 * u;
    g.beginPath(); g.moveTo(0, bottom);
    for (let x = 0; x <= W + 20 * u; x += 20 * u) g.lineTo(x, groundY + Math.sin(x / (180 * u)) * 7 * u + Math.sin(x / (61 * u) + 1) * 3 * u);
    g.lineTo(W, bottom);
    for (let x = W; x >= -20 * u; x -= 40 * u) g.quadraticCurveTo(x - 20 * u, bottom + 9 * u, x - 40 * u, bottom);
    g.closePath(); g.fill();
    // Grass tufts and seed heads that sway.
    const r = rng(41);
    g.strokeStyle = ink(F, 1); g.lineCap = "round";
    for (let x = 30 * u; x < W; x += (36 + r() * 60) * u) {
      const y = groundY + Math.sin(x / (180 * u)) * 7 * u + 4 * u, hgt = (14 + r() * 26) * u, sw = Math.sin(t * 1.6 + x * 0.01) * 4 * u;
      g.lineWidth = 2.2 * u;
      g.beginPath();
      for (let b = -1; b <= 1; b++) { g.moveTo(x + b * 4 * u, y); g.quadraticCurveTo(x + b * 6 * u, y - hgt * 0.6, x + b * 9 * u + sw, y - hgt * (b ? 0.8 : 1)); }
      g.stroke();
      if (r() < 0.3) { g.beginPath(); dot(g, x + sw, y - hgt - 3 * u, 4 * u); g.fill(); }
    }
    cut(g, F, null, () => { for (let x = 24 * u; x < W; x += 30 * u) dot(g, x, groundY + 24 * u + Math.sin(x / (180 * u)) * 7 * u, 2.6 * u); });
    ctx.drawImage(c, 0, 0);
  }
  // Painted wave strips rocked back and forth by stagehands, a lantern boat between them, reeds at the
  // wings and the carved proscenium beam with tassels.
  function waveRow(g, F, y, P, amp, phase, shift, band) {
    const { W, H, u } = F;
    const x0 = -P * 2 + (shift % P);
    const yb = band ? y + band : H + 10;
    g.beginPath(); g.moveTo(x0, yb);
    for (let x = x0; x < W + P * 2; x += P) {
      g.lineTo(x, y);
      g.bezierCurveTo(x + P * 0.1, y - amp * 1.1, x + P * 0.55, y - amp * 1.25, x + P * 0.68, y - amp * 0.55);
      g.bezierCurveTo(x + P * 0.62, y - amp * 0.95, x + P * 0.48, y - amp * 0.65, x + P * 0.56, y - amp * 0.35);
      g.quadraticCurveTo(x + P * 0.8, y + amp * 0.1, x + P, y);
    }
    g.lineTo(W + P * 2, yb);
    if (band) for (let x = W + P * 2; x > x0; x -= P / 3) g.quadraticCurveTo(x - P / 6, yb + 6 * u, x - P / 3, yb);
    g.closePath(); g.fill();
    cut(g, F, null, () => {
      for (let x = x0; x < W + P * 2; x += P) {
        crescent(g, x + P * 0.36, y - amp * 0.5, amp * 0.32, -Math.PI * 0.75);
        for (let i = 0; i < 3; i++) dot(g, x + P * (0.15 + i * 0.22), y + Math.min(amp * 0.4, (band || amp) * 0.45), 2.2 * u);
      }
    });
  }
  function boat(g, F, x, y, s, t, tilt) {
    g.save(); g.translate(x, y); g.rotate(tilt); g.scale(s / 100, s / 100);
    g.fillStyle = ink(F, 1);
    g.beginPath(); g.moveTo(-60, -10); g.quadraticCurveTo(-30, 18, 0, 16); g.quadraticCurveTo(40, 16, 62, -14); g.lineTo(40, -6); g.lineTo(-44, -6); g.closePath(); g.fill();
    g.beginPath(); g.rect(-3, -96, 5, 92); g.fill();
    const flutter = Math.sin(t * 2.2) * 4;
    g.beginPath(); g.moveTo(4, -92); g.quadraticCurveTo(40 + flutter, -60, 46, -12); g.lineTo(4, -12); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(-6, -84); g.quadraticCurveTo(-30, -50, -40, -14); g.lineTo(-6, -14); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(2, -96); g.lineTo(22 + flutter, -104); g.lineTo(2, -110); g.closePath(); g.fill();
    cut(g, F, null, () => { dot(g, 22, -48, 8); for (let i = 0; i < 5; i++) dot(g, -40 + i * 20, 3, 2.6); crescent(g, -20, -42, 7, 0.4); });
    // A lantern hanging at the stern, glowing through gel.
    const sw = Math.sin(t * 1.7) * 0.2;
    g.save(); g.translate(-50, -40); g.rotate(sw);
    g.strokeStyle = ink(F, 1); g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 10); g.stroke();
    g.beginPath(); g.roundRect(-8, 10, 16, 20, 5); g.fill();
    cut(g, F, null, () => { g.roundRect(-5, 14, 10, 12, 3); }, 0.8);
    g.restore();
    g.restore();
  }
  function reeds(g, F, x, dir, t) {
    const { u, H } = F;
    g.fillStyle = ink(F, 1); g.strokeStyle = ink(F, 1); g.lineCap = "round";
    // In a tall frame the clump stays tight to the edge, clear of the bank's plates.
    const n = F.tall ? 3 : 5, gap = F.tall ? 12 : 22, reach = F.tall ? 0.45 : 1;
    for (let i = 0; i < n; i++) {
      const bx = x + dir * i * gap * u, hgt = (230 + ((i * 53) % 90)) * u * (F.tall ? 0.9 : 1), sw = (Math.sin(t * 0.9 + i * 1.3) * 14 + wob(t, 0.7, i) * 8) * u;
      const tx = bx + dir * (18 * u) + sw, ty = H - hgt;
      g.lineWidth = 4 * u;
      g.beginPath(); g.moveTo(bx, H + 10); g.quadraticCurveTo(bx, H - hgt * 0.5, tx, ty); g.stroke();
      if (i % 2 === 0) { g.beginPath(); ell(g, tx, ty + 26 * u, 9 * u, 30 * u, Math.atan2(sw, hgt) * 0.8); g.fill(); }
      else { g.beginPath(); g.moveTo(bx, H - hgt * 0.3); g.quadraticCurveTo(bx + dir * 60 * reach * u, H - hgt * 0.6, tx + dir * 50 * reach * u + sw * reach, H - hgt * 0.7); g.quadraticCurveTo(bx + dir * 40 * reach * u, H - hgt * 0.5, bx, H - hgt * 0.3); g.fill(); }
    }
  }
  function frame(g, F) {
    const { W, H, u, t } = F;
    const bh = 46 * u;
    g.fillStyle = ink(F, 1);
    g.beginPath(); g.rect(0, 0, W, bh);
    // Carved underside: small scallops along the beam.
    for (let x = 0; x < W; x += 34 * u) { g.moveTo(x, bh); g.quadraticCurveTo(x + 17 * u, bh + 12 * u, x + 34 * u, bh); }
    g.fill();
    // Corner brackets: scrolled cut card.
    for (const sd of [1, -1]) {
      g.save(); if (sd < 0) { g.translate(W, 0); g.scale(-1, 1); }
      const s = (F.tall ? 72 : 96) * u;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(s * 1.15, 0); g.quadraticCurveTo(s * 0.9, bh / u * 0 + s * 0.5, s * 0.55, s * 0.62);
      g.quadraticCurveTo(s * 0.25, s * 0.74, s * 0.3, s * 1.0); g.quadraticCurveTo(s * 0.12, s * 1.1, 0, s * 1.35); g.closePath(); g.fill();
      g.beginPath(); g.rect(0, 0, 22 * u, H); g.fill();
      cut(g, F, null, () => {
        dot(g, s * 0.48, s * 0.36, s * 0.1); crescent(g, s * 0.22, s * 0.7, s * 0.09, 0.3);
        for (let y = s * 1.6; y < H; y += 26 * u) diamond(g, 11 * u, y, 4 * u, 7 * u);
      });
      // A tassel on a cord, swinging.
      const sw = Math.sin(t * 1.3 + (sd > 0 ? 0 : 1.7)) * 0.12, cx = s * 0.95, cy = bh;
      g.save(); g.translate(cx, cy); g.rotate(sw);
      g.strokeStyle = ink(F, 1); g.lineWidth = 2.4 * u; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 46 * u); g.stroke();
      g.beginPath(); dot(g, 0, 52 * u, 7 * u); g.moveTo(-5 * u, 56 * u); g.lineTo(5 * u, 56 * u); g.lineTo(11 * u, 92 * u); g.lineTo(-11 * u, 92 * u); g.closePath(); g.fill();
      cut(g, F, null, () => { for (let i = -2; i <= 2; i++) g.rect(i * 4 * u - 1 * u, 70 * u, 1.6 * u, 22 * u); });
      g.restore();
      g.restore();
    }
    cut(g, F, null, () => {
      for (let x = 150 * u; x < W - 150 * u; x += 38 * u) { diamond(g, x, bh * 0.5, 9 * u, 9 * u); dot(g, x + 19 * u, bh * 0.5, 3 * u); }
    });
    g.fillStyle = ink(F, 1);
    g.beginPath(); g.rect(0, bh * 0.5 - 1 * u, W, 0); g.fill();
  }
  function front(ctx, F) {
    const { W, H, u, t, waveY } = F;
    const [c, g] = fresh("front", F);
    g.fillStyle = ink(F, 1);
    const P0 = (F.tall ? 150 : 190) * u;
    // Back strip, boat, middle strip, front strip; each rocks against the other.
    g.save(); g.globalAlpha = 1;
    const rock = (j) => Math.sin(t * 0.85 + j * 2.1) * 26 * u + t * 6 * u * (j % 2 ? -1 : 1);
    const H0 = F.H;
    waveRow(g, F, H0 - 104 * u, P0 * 0.8, 26 * u, 0, rock(0), 22 * u);
    const bk = ((t * 0.026 + 0.12) % 1.25) - 0.12;
    const bx = lerp(-160 * u, W + 160 * u, bk);
    boat(g, F, bx, H0 - 78 * u + Math.sin(t * 1.6) * 5 * u, (F.tall ? 100 : 110) * u, t, Math.sin(t * 1.6 + 0.8) * 0.06);
    waveRow(g, F, H0 - 62 * u, P0, 28 * u, 1, rock(1), 22 * u);
    waveRow(g, F, H0 - 22 * u, P0 * 1.2, 30 * u, 2, rock(2), 0);
    g.restore();
    for (let j = 0; j < 2; j++) for (const fx of [0.3, 0.7]) { const rx = W * fx + rock(j); rod(g, F, rx, H0 - (j ? 50 : 92) * u, rx + 20 * u, H0 + 30 * u, 0.7); }
    reeds(g, F, 40 * u, 1, t);
    reeds(g, F, W - 40 * u, -1, t + 2);
    frame(g, F);
    // The back strip sits further from the cloth: draw a softened copy under the crisp one.
    ctx.save(); ctx.globalAlpha = 0.35; ctx.filter = `blur(${2.5 * u}px)`; ctx.drawImage(c, 0, 0); ctx.restore();
    ctx.drawImage(c, 0, 0);
  }

  // ---- scene drawings (all pressed cut-outs) --------------------------------------------------------
  const DRAW = {};

  DRAW.title = (g, F, A, s) => {
    const { u, t, W, groundY } = F;
    const band = textBand(["kicker", "title"], F);
    const q = s.rev;
    // A cut-paper vine rule draws outward under the title.
    const ry = band.bottom + 30 * u, half = Math.min(W * 0.36, (band.right - band.left) / 2 + 60 * u), cx = (band.left + band.right) / 2;
    vine(g, F, cx, ry, half * eo(span(q, 0, 0.6)), t);
    // A storyteller with a lantern at one side; a cut-paper tree with gel lanterns at the other.
    const top = ry + 40 * u, room = groundY - top;
    const h = clamp(room / 1.25, 170 * u, 380 * u);
    const rise = (1 - back(span(q, 0.1, 0.6))) * 260 * u;
    const px = F.tall ? W * 0.72 : W * 0.8;
    puppet(g, F, px, groundY + 4 * u + rise, h, {
      face: -1, hat: 1, t, seed: 1, sway: Math.sin(t * 0.9) * 0.025, nod: Math.sin(t * 1.4) * 0.06,
      frontA: 1.7 + Math.sin(t * 1.1) * 0.12, frontB: -0.9 + Math.sin(t * 1.3) * 0.1, backA: -0.15, backB: -0.4, pattern: 2,
      prop: (gg, hand) => lanternProp(gg, F, hand, t),
    });
    // In the open side beside the title, a cut-card moon and two stars lowered on threads, turning.
    if (!F.tall && band.right < W * 0.66) {
      const mx = (band.right + W * 0.94) / 2, my = (band.top + band.bottom) / 2 - 10 * u;
      const drop = (1 - back(span(q, 0.15, 0.7))) * (my + 200 * u);
      const mr = Math.min(110 * u, (W * 0.94 - band.right) * 0.22);
      hangMoon(g, F, mx, my - drop, mr, t);
      [[-1.35, 0.95, 0.42], [1.25, -0.55, 0.34]].forEach(([ox, oy, k], j) => {
        const sx = mx + ox * mr * 1.6 + Math.sin(t * 0.8 + j * 2) * 8 * u, sy = my + oy * mr * 1.4 - drop * (1.1 + j * 0.2);
        g.save(); g.strokeStyle = ink(F, 0.8); g.lineWidth = 2 * u; g.beginPath(); g.moveTo(sx, 40 * u); g.lineTo(sx, sy - mr * k); g.stroke(); g.restore();
        g.save(); g.translate(sx, sy); g.rotate(Math.sin(t * 1.1 + j * 1.7) * 0.35); g.scale(Math.cos(t * 0.9 + j * 2.3) * 0.3 + 0.7, 1);
        g.fillStyle = ink(F, 1); g.beginPath();
        for (let a = 0; a < 10; a++) { const rr = a % 2 ? mr * k * 0.42 : mr * k, an = -Math.PI / 2 + a * Math.PI / 5; a ? g.lineTo(Math.cos(an) * rr, Math.sin(an) * rr) : g.moveTo(Math.cos(an) * rr, Math.sin(an) * rr); }
        g.closePath(); g.fill();
        cut(g, F, null, () => dot(g, 0, 0, mr * k * 0.2), 0.7);
        g.restore();
      });
    }
    tree(g, F, F.tall ? W * 0.24 : W * 0.17, groundY + 6 * u, Math.min(room * 1.2, 440 * u) * eo(span(q, 0, 0.7)), t);
    // Cut clouds lowered on strings from the beam, drifting.
    const cy = Math.max(150 * u, band.top - 150 * u);
    [[0.3, 1, 0], [0.66, 0.8, 1], [0.86, 0.6, 2]].forEach(([fx, sc, i]) => {
      if (F.tall && i === 2) return;
      const drop = (1 - back(span(q, 0.05 + i * 0.12, 0.55 + i * 0.12))) * (cy + 120 * u);
      const x = W * fx + Math.sin(t * 0.5 + i * 2) * 26 * u, y = cy - drop + (i % 2) * 40 * u;
      g.save(); g.strokeStyle = ink(F, 0.8); g.lineWidth = 2 * u;
      g.beginPath(); g.moveTo(x, 40 * u); g.lineTo(x, y - 40 * u * sc); g.stroke(); g.restore();
      cloud(g, F, x, y, 120 * u * sc * (F.tall ? 0.9 : 1), t + i);
    });
  };
  function hangMoon(g, F, x, y, r, t) {
    const { u } = F;
    g.save(); g.strokeStyle = ink(F, 0.8); g.lineWidth = 2 * u; g.beginPath(); g.moveTo(x, 40 * u); g.lineTo(x, y - r); g.stroke(); g.restore();
    g.save(); g.translate(x, y); g.rotate(Math.sin(t * 0.6) * 0.12);
    g.fillStyle = ink(F, 1); g.beginPath(); dot(g, 0, 0, r); g.fill();
    const disc = () => dot(g, 0, 0, r);
    // The lit crescent, a sleepy eye and a ring of pricked holes, cut through the disc.
    cut(g, F, disc, () => { g.moveTo(r * 0.98, 0); g.arc(0, 0, r * 0.98, 0, TAU); g.moveTo(r * 0.3 + r * 1.02, -r * 0.12); g.arc(r * 0.3, -r * 0.12, r * 1.02, 0, TAU, true); });
    cut(g, F, disc, () => {
      g.moveTo(-r * 0.62, -r * 0.18); g.quadraticCurveTo(-r * 0.48, -r * 0.08, -r * 0.34, -r * 0.2); g.quadraticCurveTo(-r * 0.48, -r * 0.13, -r * 0.62, -r * 0.18); g.closePath();
      for (let k = 0; k < 9; k++) { const a = Math.PI * 0.6 + k * 0.13; dot(g, Math.cos(a) * r * 0.82 + r * 0.12, Math.sin(a) * r * 0.82, r * 0.035); }
    }, 0.6 + 0.2 * noise1(t * 2));
    g.restore();
  }
  function cloud(g, F, x, y, s, t) {
    g.save(); g.translate(x, y); g.rotate(Math.sin(t * 0.7) * 0.03);
    g.fillStyle = ink(F, 1);
    g.beginPath();
    dot(g, -s * 0.55, s * 0.08, s * 0.32); dot(g, -s * 0.15, -s * 0.12, s * 0.42); dot(g, s * 0.3, -s * 0.02, s * 0.36); dot(g, s * 0.68, s * 0.12, s * 0.24);
    g.rect(-s * 0.85, s * 0.08, s * 1.7, s * 0.32);
    g.fill();
    cut(g, F, null, () => {
      for (const [cx, cy, r] of [[-s * 0.15, -s * 0.08, s * 0.2], [s * 0.32, s * 0.04, s * 0.15], [-s * 0.55, s * 0.14, s * 0.12]]) {
        g.moveTo(cx + r, cy); for (let k = 0; k <= 30; k++) { const a = k * 0.42, rr = r * (1 - k / 34); g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
        for (let k = 30; k >= 0; k--) { const a = k * 0.42, rr = r * (1 - k / 34) - s * 0.04; g.lineTo(cx + Math.cos(a) * Math.max(0, rr), cy + Math.sin(a) * Math.max(0, rr)); }
        g.closePath();
      }
      for (let xx = -s * 0.7; xx < s * 0.75; xx += s * 0.14) dot(g, xx, s * 0.3, s * 0.035);
    });
    g.restore();
  }
  // Curtain call: a lace valance drops from the beam, drapes gather at the wings, lanterns rise, paper
  // petals keep falling and two players bow, again and again, until the very last frame.
  function valance(g, F, drop, t) {
    const { W, u } = F;
    const n = Math.max(3, Math.round(W / (330 * u))), sw = W / n, y0 = 40 * u - drop, dep = (F.tall ? 80 : 96) * u;
    g.fillStyle = ink(F, 1);
    const swag = (i) => { const x = i * sw; g.moveTo(x, y0); g.lineTo(x + sw, y0); g.quadraticCurveTo(x + sw * 0.5, y0 + dep * 2, x, y0); g.closePath(); };
    g.beginPath(); for (let i = 0; i < n; i++) swag(i); g.rect(0, y0 - 60 * u, W, 62 * u); g.fill();
    cut(g, F, null, () => {
      for (let i = 0; i < n; i++) {
        const x = i * sw;
        for (let k = 1; k < 12; k++) { const f = k / 12, yy = y0 + dep * 2 * 2 * f * (1 - f) - 16 * u; dot(g, x + sw * f, yy, 3.2 * u); }
        crescent(g, x + sw * 0.5, y0 + dep * 0.42, 16 * u, Math.PI / 2);
        petal(g, x + sw * 0.3, y0 + dep * 0.28, 11 * u); petal(g, x + sw * 0.7, y0 + dep * 0.28, 11 * u);
      }
    }, 0.55);
    for (let i = 0; i <= n; i++) { // tassels at every join
      const x = i * sw, a = Math.sin(t * 1.4 + i * 1.1) * 0.14;
      g.save(); g.translate(x, y0 + 4 * u); g.rotate(a);
      g.strokeStyle = ink(F, 1); g.lineWidth = 2.4 * u; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 40 * u); g.stroke();
      g.beginPath(); dot(g, 0, 46 * u, 8 * u); g.moveTo(-5 * u, 50 * u); g.lineTo(5 * u, 50 * u); g.lineTo(12 * u, 88 * u); g.lineTo(-12 * u, 88 * u); g.closePath(); g.fill();
      cut(g, F, null, () => { for (let k = -2; k <= 2; k++) g.rect(k * 4.4 * u - 0.8 * u, 64 * u, 1.6 * u, 24 * u); });
      g.restore();
    }
  }
  function drape(g, F, xIn, xOut, top, bottom, tieY, t, phase) {
    // xIn: the drape's inner edge at the top; xOut: the wing edge. Gathered to a tie-back.
    const { u } = F, dir = Math.sign(xOut - xIn), wdt = Math.abs(xOut - xIn);
    const sway = Math.sin(t * 0.8 + phase) * 10 * u + wob(t, 0.5, phase) * 6 * u;
    const tieX = xOut - dir * wdt * 0.42 + sway * 0.4;
    const outline = () => {
      g.moveTo(xOut, top); g.lineTo(xIn + sway * 0.3, top);
      g.bezierCurveTo(xIn + sway, top + (tieY - top) * 0.4, tieX - dir * 10 * u, tieY - 80 * u, tieX, tieY);
      g.bezierCurveTo(tieX - dir * 16 * u, tieY + 80 * u, xIn - dir * wdt * 0.05 + sway * 0.6, bottom - 120 * u, xIn + dir * wdt * 0.08 + sway, bottom);
      g.lineTo(xOut, bottom); g.closePath();
    };
    g.fillStyle = ink(F, 1); g.beginPath(); outline(); g.fill();
    // Folds as long slits of light, and a lace hem; a gel tie-back cord.
    cut(g, F, outline, () => {
      for (let k = 1; k <= 3; k++) {
        const f = k / 4, xa = lerp(xIn, xOut, f), xb = lerp(tieX, xOut, f);
        g.moveTo(xa, top + 30 * u); g.quadraticCurveTo(lerp(xa, xb, 0.6), (top + tieY) / 2, xb, tieY - 20 * u); g.lineTo(xb + dir * 3 * u, tieY - 20 * u);
        g.quadraticCurveTo(lerp(xa, xb, 0.6) + dir * 3 * u, (top + tieY) / 2, xa + dir * 3 * u, top + 30 * u); g.closePath();
      }
      for (let y = tieY + 50 * u; y < bottom - 10 * u; y += 26 * u) { const xx = lerp(tieX, xIn + dir * wdt * 0.08, (y - tieY) / (bottom - tieY)) + dir * 22 * u; diamond(g, xx, y, 5 * u, 8 * u); }
    }, 0.3);
    g.save(); g.fillStyle = F.acc(0.95); g.beginPath(); ell(g, tieX + dir * wdt * 0.2, tieY, wdt * 0.34, 9 * u); g.fill(); g.restore();
    g.save(); g.translate(tieX + dir * wdt * 0.05, tieY + 4 * u); g.rotate(Math.sin(t * 1.3 + phase) * 0.12);
    g.fillStyle = ink(F, 1); g.beginPath(); dot(g, 0, 10 * u, 9 * u); g.moveTo(-6 * u, 16 * u); g.lineTo(6 * u, 16 * u); g.lineTo(14 * u, 62 * u); g.lineTo(-14 * u, 62 * u); g.closePath(); g.fill();
    g.restore();
  }
  function petals(g, F, band, q, t) {
    const { W, u, groundY } = F;
    const n = F.tall ? 26 : 36, top = 120 * u, fall = groundY - top, r = rng(808);
    const pad = 24 * u;
    for (let i = 0; i < n; i++) {
      const sp = 0.07 + r() * 0.06, ph = r(), x0 = r() * W, sz = (11 + r() * 9) * u, gel = r() < 0.35, spin = 1 + r() * 2;
      const k = (t * sp + ph) % 1, y = top + k * fall, x = x0 + Math.sin(t * 0.9 + i) * 40 * u + k * 60 * u;
      if (x > band.left - pad && x < band.right + pad && y > band.top - pad && y < band.bottom + pad) continue;
      const a = clamp(q * 2 - i / n) * Math.min(1, (1 - k) * 8);
      if (a <= 0.02) continue;
      g.save(); g.globalAlpha = a; g.translate(x, y); g.rotate(t * spin + i); g.scale(1, Math.cos(t * spin * 1.3 + i) * 0.8 + 0.2);
      g.fillStyle = gel ? F.acc(0.9) : ink(F, 1); g.beginPath(); ell(g, 0, 0, sz, sz * 0.45); g.fill();
      if (!gel) cut(g, F, null, () => ell(g, 0, 0, sz * 0.4, sz * 0.12));
      g.restore();
    }
  }
  DRAW.closing = (g, F, A, s) => {
    const { u, t, W, groundY } = F;
    const band = textBand(["closing"], F);
    const q = s.rev;
    // Drapes at the wings, clear of the line.
    const leftW = Math.min(band.left - (F.tall ? 12 : 40) * u, W * 0.12), rightX = Math.max(band.right + 90 * u, W * (F.tall ? 0.86 : 0.87));
    const slide = (1 - eo(span(q, 0, 0.55)));
    const tieY = F.H * 0.56;
    if (leftW > 40 * u) drape(g, F, leftW - slide * (leftW + 40 * u), -10 * u - slide * (leftW + 40 * u), 40 * u, groundY + 40 * u, tieY, t, 0.3);
    if (W - rightX > 50 * u) { const sl = slide * (W - rightX + 40 * u); drape(g, F, rightX + sl, W + 10 * u + sl, 40 * u, groundY + 40 * u, tieY, t, 2.1); }
    // A string of paper lanterns across the sky above the line, rising into place.
    const sy = Math.max(180 * u, band.top - (F.tall ? 170 : 150) * u) - (1 - eo(span(q, 0.05, 0.65))) * 260 * u;
    const x1 = Math.max(80 * u, leftW + 20 * u), x2 = Math.min(W - 80 * u, rightX - 20 * u), sag = 60 * u;
    thread(g, F, x1, sy, x2, sy, sag * 2);
    const n = F.tall ? 5 : 7;
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n, x = lerp(x1, x2, k), y = sy + 4 * sag * k * (1 - k) * 1.0;
      const sw = Math.sin(t * 1.5 + i * 0.9) * 0.12;
      g.save(); g.translate(x, y); g.rotate(sw);
      paperLantern(g, F, 0, 0, (F.tall ? 46 : 54) * u, i, t, stagger(q, i, n, 0.6));
      g.restore();
    }
    valance(g, F, (1 - eo(span(q, 0, 0.5))) * 200 * u, t);
    { const room = sy - 230 * u, mr = Math.min(130 * u, room * 0.3);
      if (mr > 70 * u) hangMoon(g, F, W / 2 + Math.sin(t * 0.4) * 30 * u, 230 * u + room * 0.5 - (1 - back(span(q, 0.1, 0.6))) * (room + 300 * u), mr, t); }
    vine(g, F, (band.left + band.right) / 2, band.bottom + 30 * u, Math.min(W * 0.36, (band.right - band.left) / 2 + 40 * u) * eo(span(q, 0.1, 0.7)), t);
    // Two players take a slow bow, again and again; a small one between them waves a lantern.
    const room = groundY - band.bottom - 70 * u, h = clamp(room / 1.15, 190 * u, 360 * u);
    for (const sd of [-1, 1]) {
      const bow = Math.max(0, Math.sin(t * 1.2 + (sd > 0 ? 0.6 : 0))) * 0.22;
      const rise = (1 - back(span(q, 0.15 + (sd > 0 ? 0.1 : 0), 0.65))) * 300 * u;
      puppet(g, F, W / 2 + sd * W * (F.tall ? 0.28 : 0.31), groundY + 4 * u + rise, h, {
        face: -sd, hat: sd > 0 ? 4 : 0, t, seed: sd, sway: -sd * bow * 0.6, nod: bow * 1.2,
        frontA: 0.6 + bow * 2, frontB: 0.8, backA: -0.3, backB: -0.2, gel: sd > 0, pattern: sd > 0 ? 0 : 1,
      });
    }
    if (!F.tall) {
      const rise = (1 - back(span(q, 0.3, 0.8))) * 300 * u, hop = Math.abs(Math.sin(t * 2.2)) * 10 * u;
      puppet(g, F, W / 2 + Math.sin(t * 0.5) * W * 0.06, groundY + 4 * u + rise - hop, h * 0.62, {
        face: Math.cos(t * 0.5) > 0 ? 1 : -1, hat: 2, t, seed: 4, sway: Math.sin(t * 2.2) * 0.04, nod: Math.sin(t * 2.2) * 0.1,
        frontA: 2.6 + Math.sin(t * 3) * 0.3, frontB: -0.4, backA: -0.2, backB: -0.3, pattern: 2,
        prop: (gg, hand) => lanternProp(gg, F, hand, t),
      });
    }
    petals(g, F, band, q, t);
  };
  function vine(g, F, cx, y, half, t) {
    if (half <= 2) return;
    const { u } = F;
    g.save(); g.fillStyle = ink(F, 1); g.strokeStyle = ink(F, 1); g.lineCap = "round";
    g.lineWidth = 4 * u;
    for (const sd of [-1, 1]) {
      g.beginPath(); g.moveTo(cx, y);
      const steps = 40;
      for (let i = 1; i <= steps; i++) { const k = i / steps; g.lineTo(cx + sd * half * k, y + Math.sin(k * 12 + t * 0.8) * 6 * u * k); }
      g.stroke();
      for (let k = 0.12; k < 0.98; k += 0.11) {
        const x = cx + sd * half * k, yy = y + Math.sin(k * 12 + t * 0.8) * 6 * u * k, up = Math.round(k * 9) % 2 ? -1 : 1;
        g.save(); g.translate(x, yy); g.rotate(sd * 0.5 * up + Math.sin(t * 1.2 + k * 9) * 0.1);
        g.beginPath(); g.ellipse(sd * 12 * u, up * -8 * u, 15 * u, 5.5 * u, sd * up * -0.5, 0, TAU); g.fill(); g.restore();
      }
      g.save(); g.translate(cx + sd * half, y + Math.sin(12 + t * 0.8) * 6 * u);
      g.beginPath(); for (let k = 0; k < 6; k++) { const a = (k * TAU) / 6 + t * 0.4; ell(g, Math.cos(a) * 9 * u, Math.sin(a) * 9 * u, 8 * u, 4 * u, a); } g.fill();
      cut(g, F, null, () => dot(g, 0, 0, 4 * u), 0.8);
      g.restore();
    }
    g.beginPath(); diamond(g, cx, y, 16 * u, 16 * u); g.fill();
    cut(g, F, null, () => diamond(g, cx, y, 7 * u, 7 * u), 0.85);
    g.restore();
  }
  function lanternProp(g, F, hand, t) {
    g.save(); g.translate(hand.hx, hand.hy);
    g.strokeStyle = ink(F, 1); g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -14); g.lineTo(18, -16); g.stroke();
    g.translate(18, -16); g.rotate(Math.sin(t * 1.7) * 0.15);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 4); g.stroke();
    g.beginPath(); g.moveTo(-6, 4); g.lineTo(6, 4); g.lineTo(8, 9); g.lineTo(6, 20); g.lineTo(-6, 20); g.lineTo(-8, 9); g.closePath(); g.fill();
    cut(g, F, null, () => { g.rect(-4.5, 8, 9, 9); }, 0.6 + 0.25 * noise1(t * 6));
    g.restore();
  }
  function paperLantern(g, F, x, y, s, i, t, q) {
    if (q <= 0) return;
    g.save(); g.translate(x, y); g.scale(eo(q), eo(q));
    g.fillStyle = ink(F, 1); g.strokeStyle = ink(F, 1); g.lineWidth = 2 * F.u;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, s * 0.3); g.stroke();
    g.beginPath(); g.rect(-s * 0.3, s * 0.3, s * 0.6, s * 0.12); g.rect(-s * 0.3, s * 1.42, s * 0.6, s * 0.12); ell(g, 0, s * 0.92, s * 0.55, s * 0.58); g.fill();
    const glow = 0.55 + 0.3 * noise1(t * 5 + i * 3);
    cut(g, F, () => ell(g, 0, s * 0.92, s * 0.55, s * 0.58), () => {
      for (let k = -2; k <= 2; k++) ell(g, k * s * 0.19, s * 0.92, s * 0.06, s * 0.44 * Math.cos(k * 0.35));
    }, i % 2 ? glow : 0);
    g.beginPath(); g.moveTo(-s * 0.08, s * 1.54); g.lineTo(s * 0.08, s * 1.54); g.lineTo(s * 0.04 + Math.sin(t * 2 + i) * s * 0.06, s * 2.1); g.lineTo(-s * 0.04 + Math.sin(t * 2 + i) * s * 0.06, s * 2.1); g.closePath(); g.fill();
    g.restore();
  }
  function tree(g, F, x, base, h, t) {
    if (h < 20) return;
    const { u } = F;
    g.save(); g.translate(x, base); g.fillStyle = ink(F, 1); g.strokeStyle = ink(F, 1); g.lineCap = "round";
    g.beginPath(); g.moveTo(-h * 0.06, 0); g.quadraticCurveTo(-h * 0.02, -h * 0.4, -h * 0.03, -h * 0.55); g.lineTo(h * 0.03, -h * 0.55); g.quadraticCurveTo(h * 0.03, -h * 0.4, h * 0.07, 0); g.closePath(); g.fill();
    const branches = [[-0.5, -0.55, -0.32, -0.8], [0.45, -0.5, 0.34, -0.78], [-0.05, -0.55, -0.05, -0.98], [0.2, -0.62, 0.42, -0.95], [-0.25, -0.65, -0.45, -0.98]];
    g.lineWidth = Math.max(3, h * 0.022);
    for (const [a, y0, bx, by] of branches) { g.beginPath(); g.moveTo(0, y0 * h); g.quadraticCurveTo(a * h * 0.5, (y0 - 0.12) * h, bx * h, by * h); g.stroke(); }
    // Leaf canopy: clustered cut leaves that shiver.
    const r = rng(23);
    for (let i = 0; i < 70; i++) {
      const a = r() * TAU, rr = Math.sqrt(r()), lx = Math.cos(a) * rr * h * 0.42, ly = -h * 0.82 + Math.sin(a) * rr * h * 0.25;
      g.save(); g.translate(lx + Math.sin(t * 1.3 + i) * 2 * u, ly); g.rotate(r() * TAU + Math.sin(t * 1.7 + i * 0.7) * 0.15);
      g.beginPath(); g.ellipse(0, 0, h * 0.04, h * 0.016, 0, 0, TAU); g.fill(); g.restore();
    }
    // Hanging gel lanterns.
    for (let i = 0; i < 3; i++) {
      const lx = (i - 1) * h * 0.24, ly = -h * (0.68 - (i % 2) * 0.06), sw = Math.sin(t * 1.6 + i * 2) * 0.18;
      g.save(); g.translate(lx, ly); g.rotate(sw);
      g.lineWidth = 2 * u; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, h * 0.06); g.stroke();
      g.beginPath(); ell(g, 0, h * 0.1, h * 0.035, h * 0.045); g.fill();
      cut(g, F, null, () => ell(g, 0, h * 0.1, h * 0.022, h * 0.032), 0.65 + 0.25 * noise1(t * 4 + i));
      g.restore();
    }
    g.restore();
  }

  // Chart: lattice towers rise from below on rods; a lamplighter walks along and lights each in turn.
  DRAW.chart = (g, F, A, s) => {
    const { u, t, groundY } = F, d = s.d;
    const n = d.values.length, max = Math.max(...d.values.map(Math.abs), 1);
    const slot = A.w / n, tw = Math.min(slot * 0.5, 230 * u);
    const top = A.y + 70 * u, maxH = groundY - top - 20 * u;
    const lighter = clamp((s.local - 0.5) / Math.max(1, Math.min(2.8, s.hold * 0.7)));
    const hot = d.highlight;
    const towers = [], draws = [];
    for (let i = 0; i < n; i++) {
      const q = stagger(s.rev, i, n, 0.5);
      const v = Math.abs(d.values[i]) / max;
      const h = Math.max(70 * u, maxH * v) * back(q);
      const cx = A.x + slot * (i + 0.5);
      const sway = Math.sin(t * 0.9 + i * 1.4) * 0.008 + wob(t, 0.5, i) * 0.004;
      const litK = clamp((lighter * n - i) * 2);
      towers.push({ cx, h, q, litK });
      draws.push(() => {
      g.save(); g.translate(cx, groundY + 10 * u); g.rotate(sway);
      tower(g, F, tw, h, i === hot, litK, t, i);
      g.restore();
      if (q > 0.02) {
        rod(g, F, cx - tw * 0.25, groundY - 10 * u, cx - tw * 0.3, F.H + 30 * u, 0.8);
        rod(g, F, cx + tw * 0.25, groundY - 10 * u, cx + tw * 0.32, F.H + 30 * u, 0.8);
      }
      // The value counts with the rise, lettered in ink above the finial.
      if (q > 0.04) {
        const ny = groundY + 10 * u - h - (i === hot ? 92 : 52) * u;
        say(g, fmt(d.values[i], eo(q), d), cx, ny, (i === hot ? 110 : 96) * u, { align: "center", color: ink(F, 1), weight: 600, maxW: slot * 0.95, min: 80 * u });
      }
      // The label is cut through a plinth plate on the bank.
      const label = d.labels[i] || "";
      if (label && q > 0.02) {
        const lw = say(g, label, 0, 0, 44 * u, { measure: true, maxW: slot * 0.86 - (i === hot ? 92 : 44) * u, min: 42 * u }).w;
        const pw = Math.max(Math.min(slot * 0.86, Math.max(tw * 1.2, (label.length * 26 + 70) * u)), lw + (i === hot ? 92 : 44) * u), ph = 64 * u, py = groundY + 6 * u;
        g.save(); g.globalAlpha = clamp(q * 3);
        g.fillStyle = ink(F, 1); g.beginPath(); g.roundRect(cx - pw / 2, py, pw, ph, 10 * u); g.fill();
        say(g, label, cx, py + ph * 0.56, 44 * u, { align: "center", base: "middle", color: lit(F, 1), weight: 600, maxW: pw - 44 * u, min: 42 * u });
        if (i === hot) cut(g, F, null, () => { diamond(g, cx - pw / 2 + 16 * u, py + ph / 2, 7 * u, 9 * u); diamond(g, cx + pw / 2 - 16 * u, py + ph / 2, 7 * u, 9 * u); }, 0.95);
        g.restore();
      }
      });
    }
    // The lamplighter walks the gaps behind the towers; at each he lifts his pole to the top.
    const pos = lighter * n, idx = Math.min(n - 1, Math.floor(pos)), within = pos - idx;
    const T0 = towers[idx] || towers[0], T1 = towers[Math.min(n - 1, idx + 1)] || T0;
    const walk = idx >= n - 1 ? 0 : eio(span(within, 0.55, 1));
    const lx = lerp(T0.cx, T1.cx, walk) + slot * 0.5;
    const reach = idx >= n - 1 && lighter >= 1 ? 0.5 + 0.5 * Math.sin(t * 1.2) : Math.sin(span(within, 0, 0.55) * Math.PI);
    const ph = Math.min(300 * u, maxH * 0.62);
    const step = Math.abs(Math.sin(walk * Math.PI * 3)) * 6 * u;
    const lp = puppet(g, F, lx, groundY + 4 * u - step + (1 - eo(span(s.local, 0, 0.6))) * 200 * u, ph, {
      face: -1, hat: 0, t, seed: 3, sway: Math.sin(t * 1.1) * 0.02, nod: -0.1 * reach,
      frontA: 2.4 + reach * 0.5, frontB: 0.2, backA: -0.3 + Math.sin(t * 2) * 0.1, backB: -0.5, pattern: 1,
      prop: (gg, hand) => {
        gg.save(); gg.translate(hand.hx, hand.hy); gg.rotate(-hand.a2 + Math.PI + 0.25);
        gg.fillStyle = ink(F, 1); gg.beginPath(); gg.rect(-1.3, -2, 2.6, 62); gg.fill();
        gg.beginPath(); ell(gg, 0, 64, 3.4, 4.6); gg.fill();
        cut(gg, F, null, () => dot(gg, 0, 64, 1.8), 0.9);
        gg.restore();
      },
    });
    void lp;
    for (const dr of draws) dr();
  };
  function tower(g, F, w, h, hot, litK, t, seed) {
    const { u } = F;
    const roof = Math.min(w * 0.7, h * 0.32), body = h - roof;
    g.fillStyle = ink(F, 1);
    g.beginPath();
    g.moveTo(-w / 2, 0); g.lineTo(-w / 2, -body); g.lineTo(-w * 0.62, -body);
    g.quadraticCurveTo(-w * 0.2, -body - roof * 0.25, -w * 0.06, -body - roof * 0.85);
    g.lineTo(0, -h - 26 * u); g.lineTo(w * 0.06, -body - roof * 0.85);
    g.quadraticCurveTo(w * 0.2, -body - roof * 0.25, w * 0.62, -body);
    g.lineTo(w / 2, -body); g.lineTo(w / 2, 0); g.closePath(); g.fill();
    g.beginPath(); dot(g, 0, -h - 32 * u, 8 * u); g.fill();
    // Floors with arched windows and a lattice frieze; lit windows glow, the highlight in gel.
    const floor = 74 * u, floors = Math.max(1, Math.floor((body - 20 * u) / floor));
    const glow = 0.55 + 0.35 * noise1(t * 5 + seed * 7);
    const win = () => {
      for (let f = 0; f < floors; f++) {
        const yb = -20 * u - f * floor, ww = w * 0.2, wh = floor * 0.52;
        for (const sx of [-0.22, 0.22]) { const x = sx * w; g.moveTo(x - ww / 2, yb); g.lineTo(x - ww / 2, yb - wh + ww / 2); g.arc(x, yb - wh + ww / 2, ww / 2, Math.PI, 0); g.lineTo(x + ww / 2, yb); g.closePath(); }
      }
    };
    const frieze = () => {
      for (let f = 0; f < floors; f++) {
        const y = -20 * u - f * floor - floor * 0.72;
        for (let x = -w * 0.36; x <= w * 0.37; x += w * 0.12) diamond(g, x, y, w * 0.04, 6 * u);
      }
      crescent(g, 0, -body - roof * 0.35, Math.min(roof * 0.2, 16 * u), -Math.PI / 2);
    };
    cut(g, F, null, frieze);
    if (litK > 0) cut(g, F, null, win, hot ? glow * litK : 0);
    if (litK > 0 && !hot) { g.save(); g.globalAlpha = 1 - litK; g.fillStyle = ink(F, 1); g.beginPath(); win(); g.fill(); g.restore(); }
    // A pennant flies from the highlighted finial.
    if (hot && litK > 0.5) {
      const fl = Math.sin(t * 3.2) * 6 * u;
      g.beginPath(); g.rect(-1.5 * u, -h - 74 * u, 3 * u, 46 * u);
      g.moveTo(1.5 * u, -h - 74 * u); g.quadraticCurveTo(30 * u, -h - 70 * u + fl, 52 * u, -h - 62 * u + fl); g.quadraticCurveTo(30 * u, -h - 56 * u + fl * 0.5, 1.5 * u, -h - 50 * u); g.fill();
      cut(g, F, null, () => dot(g, 20 * u, -h - 62 * u + fl * 0.6, 5 * u), 0.85);
    }
  }

  // Object: a device cut from card with a little shadow play running on its screen; pennants on
  // threads name three parts, and a puppet points at each in turn.
  DRAW.object = (g, F, A, s) => {
    const { u, t, groundY, tall } = F, d = s.d;
    const phone = d.kind === "phone";
    let dw, dh, dx, dy;
    if (tall) {
      dw = phone ? A.w * 0.38 : A.w * 0.84; dh = phone ? dw * 1.85 : dw * 0.62;
      dx = phone ? A.x : A.x + (A.w - dw) / 2; dy = A.y + 20 * u;
    } else {
      dw = phone ? Math.min(A.h * 0.5, A.w * 0.25) : Math.min(A.w * 0.46, (A.h - 70 * u) / 0.7); dh = phone ? dw * 1.85 : dw * 0.62;
      dx = A.x + A.w * (phone ? 0.24 : 0.14); dy = phone ? A.y - 10 * u : A.y + 6 * u;
    }
    const rise = (1 - back(span(s.rev, 0, 0.45))) * A.h * 0.9;
    const tilt = Math.sin(t * 0.7) * 0.006;
    g.save(); g.translate(dx + dw / 2, dy + dh + rise); g.rotate(tilt); g.translate(-dw / 2, -dh);
    const parts = device(g, F, dw, dh, phone, t, s.local);
    const M = g.getTransform();
    g.restore();
    rod(g, F, dx + dw * 0.3, dy + dh + rise + (phone ? 0 : dh * 0.1), dx + dw * 0.26, F.H + 30 * u, 0.85);
    rod(g, F, dx + dw * 0.7, dy + dh + rise + (phone ? 0 : dh * 0.1), dx + dw * 0.76, F.H + 30 * u, 0.85);
    const anchors = parts.map(([x, y]) => M.transformPoint(new DOMPoint(x, y)));
    // Pennants and their threads.
    const labels = [];
    for (let i = 0; i < 3; i++) {
      let lx, ly, align = "left";
      if (tall) { lx = A.x + (phone ? A.w * 0.46 : A.w * 0.3); ly = (phone ? A.y + 120 * u : dy + dh + 150 * u) + i * 150 * u; if (phone) ly = A.y + 140 * u + i * dh * 0.32; }
      else { lx = dx + dw + (phone ? 150 : 120) * u; ly = A.y + 40 * u + i * (A.h - 150 * u) / 2; }
      labels.push({ lx, ly, align });
    }
    const pointAt = Math.min(2, Math.floor(clamp((s.local - 0.9) / 1.0) * 2.999 + (s.local > 3.2 ? 0 : 0)));
    for (let i = 0; i < 3; i++) {
      const label = d.callouts[i];
      const c = stagger(s.rev, i, 3, 0.5);
      if (!label || c <= 0) continue;
      const a = anchors[i], L = labels[i];
      const sw = Math.sin(t * 1.3 + i * 1.9) * 0.025;
      thread(g, F, a.x, a.y, L.lx + 6 * u, L.ly, 40 * u, span(c, 0, 0.6));
      g.save(); g.fillStyle = ink(F, 1); g.beginPath(); dot(g, a.x, a.y, 9 * u); g.fill();
      cut(g, F, null, () => dot(g, a.x, a.y, 4.5 * u), i === pointAt ? 0.9 : 0.5); g.restore();
    }
    // Pennants after every thread, so a thread passes behind the paper instead of across its words.
    for (let i = 0; i < 3; i++) {
      const label = d.callouts[i];
      const c = stagger(s.rev, i, 3, 0.5);
      if (!label || c <= 0) continue;
      const L = labels[i];
      const sw = Math.sin(t * 1.3 + i * 1.9) * 0.025;
      if (c > 0.55) {
        const sc = 0.7 + 0.3 * back(span(c, 0.55, 0.9));
        const maxW = tall ? F.W - 40 * u - L.lx : A.x + A.w - L.lx + 60 * u;
        pennant(g, F, label, L.lx, L.ly, 46 * u, { rot: sw, scale: sc, maxW, min: 42 * u });
      }
    }
    // A small puppet stands by the device and gestures at whichever part is being named.
    if (!tall || !phone) {
      const ph = tall ? 330 * u : Math.min(320 * u, A.h * 0.62);
      const px = tall ? A.x + 70 * u : dx - 70 * u;
      const target = anchors[clamp(pointAt, 0, 2)] || anchors[0];
      const ang = Math.atan2(target.x - px, target.y - (groundY - ph * 0.74));
      puppet(g, F, px, groundY + 4 * u + (1 - eo(span(s.local, 0.2, 0.9))) * 240 * u, ph, {
        face: 1, hat: 2, t, seed: 4, sway: Math.sin(t * 0.8) * 0.02, nod: Math.sin(t * 1.5) * 0.05,
        frontA: clamp(ang, 0.4, 2.8) + Math.sin(t * 2.3) * 0.05, frontB: -0.05, backA: -0.2, backB: -0.6 + Math.sin(t * 1.4) * 0.15, pattern: 0,
      });
    }
  };
  function device(g, F, w, h, phone, t, local) {
    const { u } = F;
    g.fillStyle = ink(F, 1);
    const r = (phone ? 40 : 18) * u, pad = (phone ? 22 : 26) * u;
    g.beginPath(); g.roundRect(0, 0, w, h, r); g.fill();
    const sx = pad, sy = pad + (phone ? 26 * u : 0), sw = w - pad * 2, sh = h - pad * 2 - (phone ? 52 * u : 0);
    // The screen is a window in the card, faintly tinted, with the picture cut inside it.
    cut(g, F, null, () => g.roundRect(sx, sy, sw, sh, 8 * u), 0.14);
    cut(g, F, null, () => { for (let x = r; x < w - r; x += 20 * u) { dot(g, x, pad * 0.45, 2.4 * u); dot(g, x, h - pad * 0.45, 2.4 * u); } });
    const pv = { x: sx + sw * 0.06, y: sy + sh * 0.07, w: sw * 0.88, h: sh * 0.48 };
    g.save(); g.beginPath(); g.rect(pv.x, pv.y, pv.w, pv.h); g.clip();
    g.fillStyle = ink(F, 1);
    g.lineWidth = 3 * u; g.strokeStyle = ink(F, 1); g.strokeRect(pv.x, pv.y, pv.w, pv.h);
    // The preview: a tiny moon over hills, and a boat crossing.
    g.beginPath(); dot(g, pv.x + pv.w * 0.78, pv.y + pv.h * 0.3, pv.h * 0.13); g.fill();
    cut(g, F, null, () => dot(g, pv.x + pv.w * 0.76, pv.y + pv.h * 0.28, pv.h * 0.11));
    g.fillStyle = ink(F, 1);
    g.beginPath(); g.moveTo(pv.x, pv.y + pv.h);
    for (let x = 0; x <= pv.w; x += pv.w / 30) g.lineTo(pv.x + x, pv.y + pv.h * 0.78 + Math.sin(x / pv.w * 9 + t * 2) * pv.h * 0.04);
    g.lineTo(pv.x + pv.w, pv.y + pv.h); g.closePath(); g.fill();
    const bx = pv.x + ((t * 0.12) % 1.3 - 0.15) * pv.w;
    boat(g, F, bx, pv.y + pv.h * 0.8, pv.h * 0.42, t, Math.sin(t * 2) * 0.08);
    g.restore();
    // Three tracks of clips; one clip carries the gel, and a playhead keeps sweeping.
    const th = sh * 0.1;
    const clips = [[0.06, 0.28], [0.38, 0.24], [0.66, 0.28]];
    for (let k = 0; k < 3; k++) {
      const ty = sy + sh * 0.62 + k * (th + sh * 0.035);
      clips.forEach(([cx, cw], i) => {
        const x = sx + sw * (cx + k * 0.025), ww = sw * cw * clamp((local - 0.4 - i * 0.12 - k * 0.08) * 2.5);
        if (ww <= 1) return;
        g.fillStyle = ink(F, 1); g.beginPath(); g.roundRect(x, ty, ww, th, 4 * u); g.fill();
        cut(g, F, null, () => { for (let xx = x + 10 * u; xx < x + ww - 8 * u; xx += 16 * u) g.rect(xx, ty + th * 0.35, 7 * u, th * 0.3); }, k === 0 && i === 1 ? 0.8 : 0);
      });
    }
    const ph = sx + sw * (0.04 + 0.92 * ((t * 0.22) % 1));
    g.fillStyle = ink(F, 1); g.beginPath(); g.rect(ph - 1.5 * u, sy + sh * 0.58, 3 * u, sh * 0.4); g.moveTo(ph - 9 * u, sy + sh * 0.58); g.lineTo(ph + 9 * u, sy + sh * 0.58); g.lineTo(ph, sy + sh * 0.58 + 12 * u); g.closePath(); g.fill();
    if (!phone) { // The keyboard deck, its keys pricked through.
      g.beginPath(); g.moveTo(-w * 0.07, h + h * 0.1); g.lineTo(w * 1.07, h + h * 0.1); g.lineTo(w, h); g.lineTo(0, h); g.closePath(); g.fill();
      cut(g, F, null, () => { for (let i = 0; i < 16; i++) g.rect(w * 0.06 + i * w * 0.055, h + h * 0.03, w * 0.035, h * 0.025); g.rect(w * 0.4, h + h * 0.065, w * 0.2, h * 0.02); });
    } else {
      cut(g, F, null, () => { g.roundRect(w * 0.38, 14 * u, w * 0.24, 8 * u, 4 * u); dot(g, w / 2, h - 24 * u, 11 * u); });
    }
    return [[pv.x + pv.w * 0.7, pv.y + pv.h * 0.32], [sx + sw * (0.38 + 0.12), sy + sh * 0.62 + th / 2], [sx + sw * 0.2, sy + sh * 0.62 + 2 * (th + sh * 0.035) + th / 2]];
  }

  // Each figure gets its own role: the given badges first, then spare roles not already used.
  function roleOf(badges, i) {
    const given = badges.filter((b) => b && String(b).trim());
    if (i < given.length) return given[i];
    const used = new Set(given.map((b) => String(b).trim().toLowerCase()));
    const spare = ["Creator", "Reviewer", "Narrator", "Producer", "Composer", "Writer"].filter((r) => !used.has(r.toLowerCase()));
    return spare[(i - given.length) % spare.length];
  }
  // People: a troupe of jointed puppets pops up, each carrying a staff with its role on a pennant.
  DRAW.people = (g, F, A, s) => {
    const { u, t, groundY, tall } = F, d = s.d;
    const n = Math.max(2, Math.min(6, Math.round(Number(d.count) || 4)));
    const slot = A.w / n;
    const h = Math.min((A.h - 150 * u) / 1.2, slot * (tall ? 1.6 : 1.15), 420 * u);
    const hot = Math.min(n - 1, d.highlight);
    const staggerFlags = n >= 3;
    for (let i = 0; i < n; i++) {
      const q = stagger(s.rev, i, n, 0.55);
      if (q <= 0) continue;
      const cx = A.x + slot * (i + 0.5);
      const face = i < n / 2 ? 1 : -1;
      const hh = h * (i === hot ? 1.06 : 1) * (1 - (i % 2) * 0.04);
      const pop = (1 - back(q)) * (hh + 200 * u);
      const ph = i * 1.7;
      const wave = i === hot ? Math.max(0, Math.sin(t * 1.4)) : 0;
      const narrow = slot < 330 * u;
      const flagH = narrow ? (i % 2) * 0.36 : staggerFlags && i % 2 ? 0.24 : 0;
      const bob = -Math.abs(Math.sin(t * 1.5 + ph)) * 12 * u;
      const shuffle = Math.sin(t * 0.85 + ph) * 12 * u;
      const p = puppet(g, F, cx + shuffle, groundY + 4 * u + pop + bob, hh, {
        face, hat: (i * 2 + 1) % 6, t, seed: i, sway: Math.sin(t * 1.1 + ph) * 0.05, nod: Math.sin(t * 1.6 + ph) * 0.1,
        frontA: 2.75 - flagH * 0.6 + Math.sin(t * 1.3 + ph) * 0.05, frontB: 0.12, backA: -0.35 - wave * 1.6 + Math.sin(t * 0.9 + ph) * 0.12, backB: -0.4 - wave * 0.6,
        gel: i === hot, pattern: i,
      });
      // The staff rises from the front hand; the pennant hangs from its top on the outer side.
      const label = roleOf(d.badges, i);
      const topY = p.hand.y - hh * (0.62 + flagH);
      g.save(); g.strokeStyle = ink(F, 1); g.lineWidth = 5 * u; g.lineCap = "round";
      g.beginPath(); g.moveTo(p.hand.x, p.hand.y + 20 * u); g.lineTo(p.hand.x, topY); g.stroke();
      g.fillStyle = ink(F, 1); g.beginPath(); diamond(g, p.hand.x, topY - 12 * u, 9 * u, 14 * u); g.fill();
      g.restore();
      if (label && q > 0.75) {
        const sc = 0.72 + 0.28 * back(span(q, 0.75, 1));
        const sw = Math.sin(t * 1.8 + ph) * 0.07 + Math.sin(t * 4.3 + ph) * 0.02;
        // Pennants fly toward the nearer wing, kept on stage.
        const maxW = Math.max(slot * 1.5, 260 * u);
        const m = say(g, label, 0, 0, 44 * u, { measure: true, maxW: maxW - 70 * u, min: 42 * u });
        const pw = m.w + 74 * u;
        if (narrow) { pennant(g, F, label, p.hand.x, topY + 40 * u, 42 * u, { rot: sw, scale: sc, align: "center", maxW: Math.min(A.w * 0.62, slot * 2.9), min: 42 * u }); continue; }
        let out = face > 0 ? -1 : 1;
        if (out < 0 && p.hand.x - pw < A.x - 60 * u) out = 1;
        if (out > 0 && p.hand.x + pw > A.x + A.w + 60 * u) out = -1;
        pennant(g, F, label, p.hand.x + out * 4 * u, topY + 40 * u, 44 * u, { rot: sw * out, scale: sc, align: out > 0 ? "left" : "right", maxW, min: 42 * u });
      }
    }
  };

  // A string of cut flags hung from the beam, dropping in and fluttering; every third flag holds gel.
  function bunting(g, F, x1, x2, y, sag, q, t) {
    if (q <= 0) return;
    const { u } = F, drop = (1 - back(q)) * (y + 80 * u);
    y -= drop;
    thread(g, F, x1, y, x2, y, sag * 2);
    const n = Math.max(4, Math.round((x2 - x1) / (74 * u)));
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n, x = lerp(x1, x2, k), yy = y + 4 * sag * k * (1 - k);
      g.save(); g.translate(x, yy); g.rotate(Math.sin(t * 2.1 + i * 0.8) * 0.16);
      const fw = 22 * u, fh = 46 * u;
      const shape = () => { g.moveTo(-fw, 0); g.lineTo(fw, 0); g.lineTo(0, fh); g.closePath(); };
      g.fillStyle = ink(F, 1); g.beginPath(); shape(); g.fill();
      cut(g, F, shape, () => { if (i % 3 === 1) { g.moveTo(-fw * 0.6, 5 * u); g.lineTo(fw * 0.6, 5 * u); g.lineTo(0, fh * 0.72); g.closePath(); } else { dot(g, 0, fh * 0.3, 5 * u); dot(g, -fw * 0.45, 6 * u, 2.4 * u); dot(g, fw * 0.45, 6 * u, 2.4 * u); } }, i % 3 === 1 ? 0.85 : 0);
      g.restore();
    }
  }
  // Process: three carved archways; a bird carries a lantern from one to the next along a stitched path.
  DRAW.process = (g, F, A, s) => {
    const { u, t, groundY, tall } = F, d = s.d;
    const n = d.steps.length;
    const arches = [];
    for (let i = 0; i < n; i++) {
      let cx, aw, ah, base;
      if (tall) { ah = Math.min((A.h - 40 * u) / n * 0.86, 360 * u); aw = ah * 0.74; cx = A.x + aw / 2 + 30 * u; base = A.y + (i + 1) * (A.h - 20 * u) / n - 10 * u; }
      else { aw = Math.min(A.w / n * 0.5, 300 * u); ah = Math.min(A.h - 110 * u, aw * 1.45); cx = A.x + A.w / n * (i + 0.5); base = groundY - 6 * u; }
      arches.push({ cx, aw, ah, base });
    }
    { const hb = textBand(["process-title"], F), y = hb.bottom + (tall ? 50 : 34) * u;
      bunting(g, F, tall ? 40 * u : hb.right + 60 * u > F.W * 0.6 ? 60 * u : hb.right + 60 * u, F.W - 60 * u, tall ? y : 70 * u, tall ? 30 * u : 60 * u, eo(span(s.rev, 0, 0.45)), t); }
    const travel = clamp((s.local - 0.6) / Math.max(1.2, Math.min(3, s.hold * 0.62)));
    for (let i = 0; i < n; i++) {
      const { cx, aw, ah, base } = arches[i];
      const q = stagger(clamp(s.rev * 1.5), i, n, 0.45);
      if (q <= 0) continue;
      const lift = (1 - back(q)) * (tall ? 240 : 320) * u;
      const reached = clamp(travel * (n - 1) - i + 1) ;
      g.save(); g.translate(cx, base + lift);
      arch(g, F, aw, ah, i, n, t, reached, s.local);
      g.restore();
      if (!tall) { rod(g, F, cx - aw * 0.3, base + lift - 10 * u, cx - aw * 0.36, F.H + 30 * u, 0.7); }
      // The step's name on an oiled-paper ribbon.
      const label = d.steps[i];
      if (label && q > 0.6) {
        const sc = 0.75 + 0.25 * back(span(q, 0.6, 1));
        const sw = Math.sin(t * 1.2 + i * 2) * 0.02;
        if (tall) pennant(g, F, label, cx + aw / 2 + 50 * u, base + lift - ah * 0.5, 46 * u, { rot: sw, scale: sc, maxW: A.x + A.w - cx - aw / 2 - 30 * u, min: 42 * u });
        else pennant(g, F, label, cx, base + lift + 52 * u, 44 * u, { rot: sw, scale: sc, align: "center", maxW: A.w / n * 0.96, min: 42 * u });
      }
    }
    // The stitched path between arch tops, and the bird flying it.
    const pts = arches.map((a) => ({ x: a.cx, y: a.base - a.ah - 36 * u }));
    const path = (k) => {
      const seg = Math.min(n - 2, Math.floor(k * (n - 1))), f = k * (n - 1) - seg;
      const a = pts[seg], b = pts[seg + 1];
      const lift = tall ? 0 : 110 * u, side = tall ? 140 * u : 0;
      return { x: lerp(a.x, b.x, f) + Math.sin(f * Math.PI) * side, y: lerp(a.y, b.y, f) - Math.sin(f * Math.PI) * lift };
    };
    if (n > 1 && s.rev > 0.3) {
      g.save(); g.strokeStyle = ink(F, 0.75); g.lineWidth = 3 * u; g.setLineDash([12 * u, 10 * u]); g.lineDashOffset = -t * 30 * u;
      g.beginPath();
      const steps = 60, upto = Math.ceil(steps * eo(span(s.rev, 0.3, 0.9)));
      for (let i = 0; i <= upto; i++) { const p = path(i / steps); if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }
      g.stroke(); g.restore();
      const k = eio(travel);
      const p = path(Math.min(0.999, k)), p2 = path(Math.min(1, k + 0.01));
      const flying = travel < 1;
      const bs = (tall ? 90 : 100) * u;
      const by = p.y - (flying ? 0 : 20 * u + Math.sin(t * 2) * 4 * u);
      bird(g, F, p.x, by - 30 * u, bs, flying ? Math.sin(t * 12) : Math.sin(t * 2.5) * 0.3 - 0.4, p2.x >= p.x || tall ? 1 : -1, { tilt: flying ? 0.1 : 0 });
      // A lantern swings beneath the bird.
      g.save(); g.translate(p.x, by - 20 * u); g.rotate(Math.sin(t * 2.4) * 0.25);
      g.strokeStyle = ink(F, 1); g.lineWidth = 2 * u; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 36 * u); g.stroke();
      g.fillStyle = ink(F, 1); g.beginPath(); ell(g, 0, 50 * u, 12 * u, 15 * u); g.fill();
      cut(g, F, null, () => ell(g, 0, 50 * u, 7 * u, 10 * u), 0.85);
      g.restore();
    }
  };
  function arch(g, F, w, h, i, n, t, reached, local) {
    const { u } = F;
    const last = i === n - 1;
    g.fillStyle = ink(F, 1);
    const outline = () => { g.moveTo(-w / 2, 0); g.lineTo(-w / 2, -h + w / 2); g.arc(0, -h + w / 2, w / 2, Math.PI, 0); g.lineTo(w / 2, 0); g.closePath(); };
    g.beginPath(); outline(); g.rect(-w * 0.6, -16 * u, w * 1.2, 16 * u); g.fill();
    g.beginPath(); dot(g, 0, -h - 6 * u, 13 * u); g.fill();
    const iw = w * 0.66, ih = h * 0.66, top = -h * 0.14;
    const opening = () => { g.moveTo(-iw / 2, top); g.lineTo(-iw / 2, top - ih + iw / 2); g.arc(0, top - ih + iw / 2, iw / 2, Math.PI, 0); g.lineTo(iw / 2, top); g.closePath(); };
    const glow = reached > 0.5 ? (last ? 0.55 : 0.2) * clamp(reached * 2 - 1) : 0;
    cut(g, F, null, opening, glow);
    // A ring of pricked dots around the opening and the step number cut in the keystone.
    cut(g, F, null, () => {
      for (let k = 0; k <= 16; k++) { const a = Math.PI + (k / 16) * Math.PI; dot(g, Math.cos(a) * (iw / 2 + 14 * u), top - ih + iw / 2 + Math.sin(a) * (iw / 2 + 14 * u), 3 * u); }
      for (let y = top - ih + iw / 2 + 14 * u; y < top - 8 * u; y += 22 * u) { dot(g, -iw / 2 - 14 * u, y, 3 * u); dot(g, iw / 2 + 14 * u, y, 3 * u); }
    });
    say(g, String(i + 1), 0, -h + w * 0.12, Math.min(52 * u, w * 0.2), { align: "center", base: "middle", color: last ? F.acc(1) : lit(F, 1), weight: 700 });
    // The icon inside the opening.
    const icx = 0, icy = top - ih * 0.42, is = Math.min(iw, ih) * 0.62;
    g.save(); g.translate(icx, icy); g.fillStyle = ink(F, 1); g.strokeStyle = ink(F, 1); g.lineCap = "round"; g.lineJoin = "round";
    const kind = last ? 2 : i % 2;
    if (kind === 0) { // An open scroll; its lines scroll past.
      g.beginPath(); g.rect(-is * 0.42, -is * 0.36, is * 0.84, is * 0.72); g.fill();
      g.beginPath(); ell(g, -is * 0.42, 0, is * 0.08, is * 0.42); ell(g, is * 0.42, 0, is * 0.08, is * 0.42); g.fill();
      const off = (t * is * 0.12) % (is * 0.16);
      cut(g, F, () => g.rect(-is * 0.34, -is * 0.3, is * 0.68, is * 0.6), () => { for (let y = -is * 0.3 - off; y < is * 0.32; y += is * 0.16) g.rect(-is * 0.28, y, is * (0.36 + ((Math.round(y / is * 6) & 1) ? 0.2 : 0)), is * 0.05); });
    } else if (kind === 1) { // A quill writing a line that keeps growing.
      const wr = (t * 0.45) % 1;
      g.beginPath(); g.rect(-is * 0.42, is * 0.12, is * 0.84, is * 0.3); g.fill();
      cut(g, F, null, () => g.rect(-is * 0.36, is * 0.22, is * 0.72 * wr, is * 0.06));
      g.save(); g.translate(-is * 0.36 + is * 0.72 * wr, is * 0.22 + Math.sin(t * 14) * is * 0.02); g.rotate(-0.6);
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(is * 0.18, -is * 0.36, is * 0.06, -is * 0.72); g.quadraticCurveTo(-is * 0.1, -is * 0.36, 0, 0); g.fill();
      cut(g, F, null, () => { for (let k = 1; k < 6; k++) g.rect(is * 0.02, -is * 0.11 * k, is * 0.07, is * 0.012); });
      g.restore();
    } else { // A seal that stamps, again and again, leaving a mark in gel.
      const cyc = (t * 0.7) % 1, press = cyc < 0.15 ? cyc / 0.15 : cyc < 0.3 ? 1 : 1 - (cyc - 0.3) / 0.3;
      const y = -is * 0.42 + clamp(press) * is * 0.22;
      g.beginPath(); g.rect(-is * 0.42, is * 0.18, is * 0.84, is * 0.22); g.fill();
      cut(g, F, null, () => { g.moveTo(-is * 0.14, is * 0.29); g.lineTo(-is * 0.04, is * 0.36); g.lineTo(is * 0.16, is * 0.21); g.lineTo(is * 0.12, is * 0.19); g.lineTo(-is * 0.04, is * 0.3); g.lineTo(-is * 0.1, is * 0.26); g.closePath(); }, reached > 0.5 ? 0.9 : 0);
      g.beginPath(); g.roundRect(-is * 0.22, y, is * 0.44, is * 0.14, is * 0.03); g.rect(-is * 0.06, y - is * 0.3, is * 0.12, is * 0.3); ell(g, 0, y - is * 0.34, is * 0.13, is * 0.09); g.fill();
    }
    g.restore();
  }

  // Compare: a balance with ornate cut posts; tokens drop into each pan and the beam settles by weight.
  DRAW.compare = (g, F, A, s) => {
    const { u, t, groundY, tall } = F, d = s.d;
    const cx = A.x + A.w / 2;
    const L = tall ? A.w * 0.68 : Math.min(A.w * 0.62, 1040 * u);
    const pivotY = tall ? A.y + 260 * u : A.y + 150 * u;
    const lv = Math.abs(d.leftValue), rv = Math.abs(d.rightValue), mx = Math.max(lv, rv, 1);
    const q = s.rev;
    const lq = eo(span(q, 0.1, 0.75)), rq = eo(span(q, 0.25, 0.9));
    const target = clamp((lv * lq - rv * rq) / mx, -1, 1) * 0.16;
    const settle = Math.max(0, s.local - 0.5 - Math.min(2.4, s.hold * 0.6) * 0.9);
    const ang = target + Math.exp(-settle * 1.6) * Math.sin(settle * 5) * 0.05 * (settle > 0 ? 1 : 0) + Math.sin(t * 0.9) * 0.03 + Math.sin(t * 2.1) * 0.008;
    const rise = (1 - back(span(q, 0, 0.35))) * 320 * u;
    g.save(); g.translate(0, rise);
    // The post: a plinth, a pierced column and a flame finial.
    g.fillStyle = ink(F, 1);
    const pw = 54 * u;
    g.beginPath(); g.moveTo(cx - 150 * u, groundY + 14 * u); g.quadraticCurveTo(cx - 60 * u, groundY - 30 * u, cx - pw / 2, groundY - 50 * u);
    g.lineTo(cx - pw / 2, pivotY); g.lineTo(cx + pw / 2, pivotY); g.lineTo(cx + pw / 2, groundY - 50 * u); g.quadraticCurveTo(cx + 60 * u, groundY - 30 * u, cx + 150 * u, groundY + 14 * u); g.closePath(); g.fill();
    cut(g, F, () => g.rect(cx - pw / 2, pivotY + 60 * u, pw, groundY - pivotY - 120 * u), () => { for (let y = pivotY + 80 * u; y < groundY - 60 * u; y += 34 * u) diamond(g, cx, y, 12 * u, 14 * u); });
    const fl = wob(t, 2.2, 4) * 0.1;
    g.save(); g.translate(cx, pivotY - 20 * u); g.rotate(fl);
    g.beginPath(); g.moveTo(-18 * u, 0); g.quadraticCurveTo(-22 * u, -40 * u, 0, -78 * u); g.quadraticCurveTo(22 * u, -40 * u, 18 * u, 0); g.closePath(); g.fill();
    cut(g, F, null, () => { g.moveTo(-7 * u, -8 * u); g.quadraticCurveTo(-8 * u, -30 * u, 0, -50 * u); g.quadraticCurveTo(8 * u, -30 * u, 7 * u, -8 * u); g.closePath(); }, 0.75);
    g.restore();
    // The beam.
    g.save(); g.translate(cx, pivotY); g.rotate(-ang);
    g.beginPath(); g.moveTo(-L / 2, -6 * u); g.quadraticCurveTo(0, -26 * u, L / 2, -6 * u); g.lineTo(L / 2, 8 * u); g.quadraticCurveTo(0, -6 * u, -L / 2, 8 * u); g.closePath(); g.fill();
    g.beginPath(); dot(g, 0, 0, 20 * u); dot(g, -L / 2, 0, 12 * u); dot(g, L / 2, 0, 12 * u); g.fill();
    cut(g, F, null, () => { dot(g, 0, 0, 7 * u); for (let x = -L / 2 + 60 * u; x < L / 2 - 50 * u; x += 46 * u) if (Math.abs(x) > 40 * u) ell(g, x, -6 * u + Math.abs(x) / L * 4 * u, 9 * u, 3 * u); });
    g.restore();
    const ends = [-1, 1].map((sd) => ({ x: cx + Math.cos(ang) * sd * L / 2, y: pivotY - Math.sin(ang) * sd * L / 2 }));
    const strLen = tall ? 280 * u : 230 * u, panW = tall ? 230 * u : 270 * u;
    const sides = [[d.left, lv, lq, d.leftValue, false], [d.right, rv, rq, d.rightValue, true]];
    sides.forEach(([label, v, k, raw, isAfter], i) => {
      const e = ends[i];
      const swing = Math.sin(t * 1.3 + i * 2) * 0.06;
      const px = e.x + Math.sin(swing) * strLen, py = e.y + Math.cos(swing) * strLen;
      // Strings run to a carved yoke, then drop straight to the rim, so they never cross the tokens.
      const yk = 0.3, yx = lerp(e.x, px, yk), yy = lerp(e.y, py, yk), yw = panW * 0.5;
      g.strokeStyle = ink(F, 1); g.lineWidth = 2.4 * u;
      g.beginPath();
      g.moveTo(e.x, e.y); g.lineTo(yx - yw * 0.6, yy); g.moveTo(e.x, e.y); g.lineTo(yx + yw * 0.6, yy);
      g.moveTo(yx - yw, yy); g.lineTo(px - panW * 0.5, py); g.moveTo(yx + yw, yy); g.lineTo(px + panW * 0.5, py);
      g.stroke();
      g.fillStyle = ink(F, 1);
      g.beginPath(); g.roundRect(yx - yw - 6 * u, yy - 5 * u, yw * 2 + 12 * u, 10 * u, 5 * u); dot(g, yx - yw, yy, 8 * u); dot(g, yx + yw, yy, 8 * u); g.fill();
      cut(g, F, null, () => { for (let x = -yw + 26 * u; x < yw - 20 * u; x += 30 * u) diamond(g, yx + x, yy, 5 * u, 3 * u); });
      g.fillStyle = ink(F, 1);
      g.beginPath(); g.moveTo(px - panW / 2, py); g.quadraticCurveTo(px, py + 70 * u, px + panW / 2, py); g.closePath(); g.fill();
      cut(g, F, null, () => { for (let x = -panW * 0.36; x <= panW * 0.37; x += panW * 0.12) dot(g, px + x, py + 16 * u, 3.4 * u); });
      // Tokens: a stack of cut discs, one per unit up to fourteen; the after side glows in gel.
      const count = Math.max(1, Math.min(14, Math.round(v > 14 ? 14 * v / mx : v)));
      const shown = Math.floor(count * k + 0.0001);
      const cols = Math.max(2, Math.ceil(count / 2)), rows = Math.ceil(count / cols);
      const tk = Math.min(26 * u, (panW * 0.86) / (cols * 2.3));
      for (let j = 0; j < count; j++) {
        const row = Math.floor(j / cols), inRow = row === rows - 1 ? count - row * cols : cols, col = j - row * cols;
        const tx = px + (col - (inRow - 1) / 2) * tk * 2.3, ty = py - tk * 1.05 - row * tk * 2.3 + Math.sin(t * 2.2 + j * 0.9) * 1.5 * u;
        let dy = 0;
        if (j >= shown) { const f = count * k - j; if (f <= 0) continue; dy = -(1 - eo(f)) * 260 * u; }
        g.fillStyle = ink(F, 1); g.beginPath(); dot(g, tx, ty + dy, tk); g.fill();
        cut(g, F, null, () => { if (isAfter) dot(g, tx, ty + dy, tk * 0.55); else diamond(g, tx, ty + dy, tk * 0.32, tk * 0.5); }, isAfter ? 0.6 + 0.3 * noise1(t * 3 + j) : 0);
      }
      // The figure above the hanging point and the label cut through a plate below the pan.
      say(g, fmt(raw, k, d), e.x, e.y - 34 * u, (tall ? 112 : 128) * u, { align: "center", color: isAfter ? F.acc(1) : ink(F, 1), weight: 600, maxW: L * 0.5, min: 96 * u });
      if (label) {
        const m = say(g, label, 0, 0, 44 * u, { measure: true, maxW: panW * 1.4, min: 42 * u });
        const w = m.w + 70 * u, ph = 64 * u, ly = py + 74 * u;
        g.fillStyle = ink(F, 1); g.beginPath(); g.roundRect(px - w / 2, ly, w, ph, 10 * u); g.fill();
        g.strokeStyle = ink(F, 1); g.lineWidth = 2 * u; g.beginPath(); g.moveTo(px, py + 30 * u); g.lineTo(px, ly); g.stroke();
        say(g, label, px, ly + ph * 0.56, m.size, { align: "center", base: "middle", color: lit(F, 1), weight: 600 });
        if (isAfter) { g.fillStyle = F.acc(1); g.beginPath(); diamond(g, px - w / 2 + 14 * u, ly + ph / 2, 6 * u, 9 * u); diamond(g, px + w / 2 - 14 * u, ly + ph / 2, 6 * u, 9 * u); g.fill(); }
      }
    });
    g.restore();
    rod(g, F, cx + 30 * u, groundY - 20 * u + rise, cx + 60 * u, F.H + 30 * u, 0.7);
  };

  // ---- transitions ----------------------------------------------------------------------------------
  // At each change a large paper bird passes close to the lamp: an oversized, soft shadow crossing.
  let bigBird = null, bigKey = "";
  function sweep(ctx, F, P) {
    if (!P) return;
    const { W, H, u, t } = F;
    for (let k = 1; k < P.shown.length; k++) {
      const T = P.shown[k].start, c = Math.max(0.3, P.change);
      const a = T - c * 1.3, b = T + c * 1.1;
      if (t < a || t > b) continue;
      const q = (t - a) / (b - a), dir = k % 2 ? 1 : -1;
      const key = `${W}x${H}:${F.T.ink}`;
      if (!bigBird || bigKey !== key) { bigBird = document.createElement("canvas"); bigKey = key; }
      const s = Math.max(W, H) * 0.42;
      bigBird.width = Math.ceil(s * 1.3); bigBird.height = Math.ceil(s * 1.1);
      const g = bigBird.getContext("2d");
      g.clearRect(0, 0, bigBird.width, bigBird.height);
      bird(g, F, bigBird.width / 2, bigBird.height * 0.62, s, Math.sin(t * 7), 1, { plain: true });
      const x = lerp(-0.45, 1.45, eio(q)) * W, y = H * (0.42 - Math.sin(q * Math.PI) * 0.12);
      ctx.save();
      ctx.globalAlpha = 0.62 * Math.sin(q * Math.PI);
      ctx.filter = `blur(${26 * u}px)`;
      ctx.translate(dir > 0 ? x : W - x, y); ctx.scale(dir, 1); ctx.rotate(-0.12 + q * 0.2);
      ctx.drawImage(bigBird, -bigBird.width / 2, -bigBird.height / 2);
      ctx.restore();
    }
  }
  // Grain, flicker and the soft bloom of lamplight through the cloth, over everything drawn.
  function finish(ctx, F) {
    const { W, H, u, t, tex, T } = F;
    const L = F.lamp;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const bloom = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, Math.min(W, H) * 0.55);
    bloom.addColorStop(0, lit(F, 0.16 * (0.6 + 0.4 * tex))); bloom.addColorStop(1, lit(F, 0));
    ctx.fillStyle = bloom; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
    if (F.S.paint && tex > 0) {
      const fl = clamp(0.5 - wob(t, 6, 11) * 0.5) * 0.07 + (Math.sin(t * 31) > 0.97 ? 0.04 : 0);
      ctx.fillStyle = `rgba(${T.edge},${fl * tex})`; ctx.fillRect(0, 0, W, H);
      const step = Math.floor(t * 12), r = rng(1000 + step);
      ctx.globalAlpha = 0.28 * tex; ctx.globalCompositeOperation = "overlay";
      ctx.translate(-r() * 256, -r() * 256);
      ctx.fillStyle = ctx.createPattern(grainTile, "repeat"); ctx.fillRect(0, 0, W + 256, H + 256);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
      const vg = ctx.createLinearGradient(0, 0, 0, H);
      vg.addColorStop(0, `rgba(${T.edge},${0.35 * tex})`); vg.addColorStop(0.12, `rgba(${T.edge},0)`); vg.addColorStop(0.9, `rgba(${T.edge},0)`); vg.addColorStop(1, `rgba(${T.edge},${0.16 * tex})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
    void u;
  }

  // ---- per-frame assembly ---------------------------------------------------------------------------
  let frameF = null;
  function makeF(S, info) {
    const { W, H, u } = S;
    const T = S.look.tone;
    const F = {
      S, W, H, u, tall: S.tall, T, info, t: info.t, tex: S.look.texture ?? 1,
      groundY: H - (F_GROUND(S)) * u, waveY: H - (S.tall ? 150 : 128) * u,
      acc: (a) => hexA(S.accent, a),
    };
    F.lamp = lamp(F);
    tiles(F);
    return F;
  }
  const F_GROUND = (S) => (S.tall ? 250 : 222);
  // Draw one scene into its own layer, then press it onto the cloth (sharpening out of an oversized
  // soft shadow) or pull it back toward the lamp (growing and softening) as it leaves.
  function renderScene(ctx, F, id, slot, local, hold, data, enterK, exitK) {
    if (!DRAW[id]) return;
    const [c, g] = fresh("scene" + slot, F);
    const s = { local, hold, d: data, rev: clamp((local + 0.25) / Math.min(2.4, Math.max(0.8, hold * 0.6))), t: F.t };
    DRAW[id](g, F, areaOf(F), s);
    const ein = eo(enterK), out = ei(exitK);
    const blur = (16 * (1 - ein) + 24 * out) * F.u, scale = 1 + 0.1 * (1 - ein) + 0.2 * out, alpha = ein * (1 - out);
    if (alpha <= 0.004) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (blur > 0.4 && F.tex >= 0) ctx.filter = `blur(${blur.toFixed(1)}px)`;
    const ox = F.lamp.x, oy = F.lamp.y;
    ctx.translate(ox, oy); ctx.scale(scale, scale); ctx.translate(-ox, -oy);
    ctx.drawImage(c, 0, 0);
    ctx.restore();
  }

  function stage(ctx, S, info) {
    const F = (frameF = makeF(S, info));
    const P = planOf(F);
    if (S.paint) { cloth(ctx, F); farLayer(ctx, F); bank(ctx, F); }
    if (P) {
      const c = Math.max(0.2, P.change);
      for (const st of P.shown) {
        const local = F.t - st.start, last = st.i === P.shown.length - 1;
        const lo = st.i === 0 ? -1 : -c * 0.7, hi = last ? Infinity : st.hold + c * 0.75;
        if (local < lo || local > hi) continue;
        const enterK = st.i === 0 ? span(local, -0.7, 0.35) : span(local, -c * 0.7, c * 0.9);
        const exitK = last ? 0 : span(local, st.hold - c, st.hold + c * 0.7);
        renderScene(ctx, F, st.id, st.i % 2, local, st.hold, P.data[st.id], enterK, exitK);
      }
    }
    if (S.paint) { front(ctx, F); sweep(ctx, F, P); finish(ctx, F); }
  }
  // Without the controls (another host page) the template's own drawers place each scene.
  const scene = (id) => (ctx, S, box, p, d, info = {}) => {
    const F = frameF;
    if (!F || planOf(F)) return;
    const local = info.local ?? 0, hold = info.hold ?? 3;
    const [c, g] = fresh("solo", F);
    DRAW[id](g, F, areaOf(F), { local, hold, d, rev: p, t: F.t });
    ctx.save();
    if (info.exit !== undefined) ctx.globalAlpha *= 1 - info.exit;
    ctx.drawImage(c, 0, 0);
    ctx.restore();
  };

  const TONE = { screen: "amber", hot: "255,216,146", mid: "236,138,58", rim: "160,44,20", edge: "34,8,4", ink: "22,9,5", parch: "255,236,196" };
  const glow = (hot) => () => `0 0 3px rgba(${hot},0.7), 0 0 26px rgba(${hot},0.65)`;
  const CSS = (accent, look) => `
    #root .display { text-wrap: balance; }
    #root .display { letter-spacing: 0.005em; font-feature-settings: "liga" 1, "onum" 1; }
    ${look.tone.screen === "amber" ? "" : "#root .kicker { color: var(--ink); }"}
    #root { container-type: size; }
    #root .kicker { font-size: calc(100cqmin * 44 / 1080) !important; }
    #root .kicker { letter-spacing: 0.2em; font-weight: 700; text-shadow: 0 0 3px rgba(${look.tone.hot},0.8), 0 0 18px rgba(${look.tone.hot},0.7); }
  `;

  return {
    bg: "#ec8a3a", panel: "rgba(22,9,5,0.9)", ink: "#1a0b06", muted: "#4a2010", accent: "#c4281c", onAccent: "#ffe9c4",
    rule: "rgba(22,9,5,0.85)", track: "rgba(22,9,5,0.25)",
    display: SERIF, displayWeight: 600, displayTracking: "0.005em", displayCase: "none",
    body: SERIF, bodyWeight: 600, figures: SERIF, radius: 10,
    motion: "focus", change: "frost",
    kit: { line: 3, fill: "solid", panel: "fill" },
    panelEdge: "rgba(22,9,5,0.9)",
    tone: TONE,
    keepArt: true,
    overlap: true,
    // Headlines set straight on this look's backdrop, where its ink and accent (meant for panels) do not read.
    displayAccent: { original: "#6c160f", dark: "#2e240f" },
    palettes: {
      // Daylight: a pale paper screen in a bright room. Moonlit: a cool blue lamp. Mono: grey paper and black card.
      light: { bg: "#f1e6cc", ink: "#20160f", muted: "#5a4632", accent: "#2f7f70", onAccent: "#fff6e6", rule: "rgba(32,22,15,0.8)", track: "rgba(32,22,15,0.2)", panel: "rgba(32,22,15,0.9)",
        textShadow: glow("255,250,236"), backdrop: () => "#f1e6cc",
        tone: { screen: "day", hot: "255,251,238", mid: "240,226,194", rim: "202,176,136", edge: "112,86,58", ink: "32,22,15", parch: "255,253,244" } },
      dark: { bg: "#6e94c8", ink: "#060912", muted: "#1c2a44", accent: "#e8b54a", onAccent: "#0a1020", rule: "rgba(6,9,18,0.85)", track: "rgba(6,9,18,0.25)", panel: "rgba(6,9,18,0.9)",
        textShadow: glow("206,226,248"), backdrop: () => "#6e94c8",
        tone: { screen: "moon", hot: "208,228,250", mid: "104,146,202", rim: "30,52,104", edge: "5,9,22", ink: "6,9,18", parch: "236,244,255" } },
      mono: { bg: "#d4d2cc", ink: "#141414", muted: "#4a4a48", accent: "#3c3c3c", onAccent: "#f4f4f0", rule: "rgba(20,20,20,0.8)", track: "rgba(20,20,20,0.2)", panel: "rgba(20,20,20,0.9)",
        textShadow: glow("252,252,248"), backdrop: () => "#d4d2cc",
        tone: { screen: "mono", hot: "252,252,248", mid: "214,212,206", rim: "142,140,134", edge: "40,40,38", ink: "18,18,18", parch: "255,255,252" } },
    },
    textShadow: glow(TONE.hot),
    backdrop: () => "#ec8a3a",
    css: CSS,
    // The cloth is drawn by the stage so it can breathe with the lamp; this pass only marks the backdrop as on.
    paint: (ctx, W, H) => { ctx.clearRect(0, 0, W, H); },
    stage,
    scenes: { chart: scene("chart"), object: scene("object"), people: scene("people"), process: scene("process"), compare: scene("compare") },
  };
});
