// Isometric: a chain of floating pastel islands drawn in true 30° isometric projection. Every solid
// has three tones (lit top, soft left face, deeper right face), casts a long soft shadow across its
// island, and sits on a thick floating tile that bobs in the air. Each scene builds its own island
// (a studio, a skyline chart, a desk, a review table, an assembly line, two stacks), a camera glides
// across the bridges between them, and the closing pulls back over the whole finished archipelago.
// All drawings are original. Frames are pure functions of time.
window.DreamcutMotion.register("isometric", ({ rng }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const inout = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const back = (v) => { v = clamp(v); const c = 1.6; return 1 + (c + 1) * Math.pow(v - 1, 3) + c * Math.pow(v - 1, 2); };
  const stg = (p, i, n, spread = 0.55) => clamp((p - (i / Math.max(1, n)) * spread) / (1 - spread));
  const fract = (v) => v - Math.floor(v);
  const hash = (a, b = 0, c = 0) => fract(Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453);
  const C30 = Math.sqrt(3) / 2;
  const SPH = 1.2247;
  const FONT = "'Avenir Next', 'Nunito', 'Poppins', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  const IW = 12, ID = 10, GAP = 4.5, PITCH = ID + GAP;
  const SL = [1.3, -0.42]; // ground travel of a shadow per unit of height: long and to the right

  // ---- colour ----------------------------------------------------------------------------------------
  const rgbMemo = new Map();
  function rgb(c) {
    if (Array.isArray(c)) return c;
    let v = rgbMemo.get(c);
    if (!v) {
      let s = String(c).trim().replace("#", "");
      if (s.length === 3) s = s.replace(/./g, "$&$&");
      const n = parseInt(s.slice(0, 6), 16) || 0;
      v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      rgbMemo.set(c, v);
    }
    return v;
  }
  const mixA = (a, b, k) => { a = rgb(a); b = rgb(b); return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]; };
  const css = (c, al = 1) => { c = rgb(c); return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${al})`; };
  const toneMemo = new Map();
  // Three tones from one base colour: the lit top, the softer left face and the deeper right face.
  function tone(F, base) {
    const key = (Array.isArray(base) ? base.map(Math.round).join(",") : base) + "|" + F.T.id;
    let tn = toneMemo.get(key);
    if (tn) return tn;
    const b = rgb(base), T = F.T;
    const L = mixA(b, T.lite, T.leftLift), R = mixA(b, T.deep, T.rightDrop);
    tn = { b, L, R, top: css(mixA(b, T.lite, T.topLift)), left: css(L), right: css(R), rim: css(mixA(b, T.lite, 0.78)), dark: css(mixA(b, T.deep, 0.5)) };
    toneMemo.set(key, tn);
    return tn;
  }
  const fog = (F, c, k) => mixA(c, F.T.bg2, k);

  // ---- projection and solids ---------------------------------------------------------------------------
  function P(F, x, y, z) {
    const c = F.cam, k = F.k, dx = x - c.fx, dy = y - c.fy;
    return [c.ax + (dx - dy) * C30 * k, c.ay + (dx + dy) * 0.5 * k - (z - c.fz) * k];
  }
  const lp = (F, I, x, y, z) => P(F, I.ox + x, I.oy + y, I.z + z);
  function poly(g, pts) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); }
  const rect = (x, y, w, d) => [[x, y], [x + w, y], [x + w, y + d], [x, y + d]];
  const circ = (cx, cy, r, n = 10) => Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * TAU) * r, cy + Math.sin((i / n) * TAU) * r]);
  const rot = (pts, cx, cy, a) => pts.map(([x, y]) => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)]);

  // An upright prism over any convex footprint: visible side faces shade between the left and right
  // tones by the way they face, with a little ambient darkening toward the floor and a lit top rim.
  function prism(F, I, foot, z, h, tn, o = {}) {
    const g = F.g, n = foot.length;
    h = Math.max(0.001, h);
    let area = 0;
    for (let i = 0; i < n; i++) { const a = foot[i], b = foot[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
    const sg = area >= 0 ? 1 : -1;
    const rims = [];
    for (let i = 0; i < n; i++) {
      const a = foot[i], b = foot[(i + 1) % n];
      const nx = sg * (b[1] - a[1]), ny = -sg * (b[0] - a[0]);
      if (nx + ny <= 1e-6) continue;
      const w = clamp(((nx - ny) / (Math.abs(nx) + Math.abs(ny) || 1)) * 0.5 + 0.5);
      const A0 = lp(F, I, a[0], a[1], z), B0 = lp(F, I, b[0], b[1], z), B1 = lp(F, I, b[0], b[1], z + h), A1 = lp(F, I, a[0], a[1], z + h);
      poly(g, [A0, B0, B1, A1]);
      const col = mixA(tn.L, tn.R, w);
      if (o.ao !== false && h * F.k > 16) {
        const gr = g.createLinearGradient(0, Math.min(A1[1], B1[1]), 0, Math.max(A0[1], B0[1]));
        gr.addColorStop(0, css(col)); gr.addColorStop(1, css(mixA(col, F.T.deep, F.T.ao)));
        g.fillStyle = gr;
      } else g.fillStyle = css(col);
      g.fill();
      rims.push([A1, B1]);
    }
    if (!o.noTop) {
      poly(g, foot.map((p) => lp(F, I, p[0], p[1], z + h)));
      g.fillStyle = o.top || tn.top; g.fill();
    }
    if (o.rim !== false && rims.length) {
      g.strokeStyle = tn.rim; g.lineWidth = Math.max(1, 0.03 * F.k); g.lineCap = "round";
      g.beginPath(); for (const [A, B] of rims) { g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); } g.stroke();
    }
  }
  const box = (F, I, x, y, z, w, d, h, tn, o) => prism(F, I, rect(x, y, w, d), z, h, tn, o);

  // Upright cylinder: a shaded side band and a lit elliptical top.
  function cyl(F, I, cx, cy, z, r, h, tn, o = {}) {
    const g = F.g, rx = r * SPH * F.k, ry = r * 0.7071 * F.k;
    const [X0, Y0] = lp(F, I, cx, cy, z), [X1, Y1] = lp(F, I, cx, cy, z + h);
    if (h > 0.001) {
      g.beginPath(); g.moveTo(X0 + rx, Y0); g.ellipse(X0, Y0, rx, ry, 0, 0, Math.PI, false);
      g.lineTo(X1 - rx, Y1); g.ellipse(X1, Y1, rx, ry, 0, Math.PI, 0, true); g.closePath();
      const gr = g.createLinearGradient(X0 - rx, 0, X0 + rx, 0);
      gr.addColorStop(0, tn.left); gr.addColorStop(0.45, css(mixA(tn.L, tn.R, 0.35))); gr.addColorStop(1, tn.right);
      g.fillStyle = gr; g.fill();
    }
    if (!o.noTop) {
      g.beginPath(); g.ellipse(X1, Y1, rx, ry, 0, 0, TAU); g.fillStyle = o.top || tn.top; g.fill();
      g.beginPath(); g.ellipse(X1, Y1, rx, ry, 0, 0.15, Math.PI - 0.15); g.strokeStyle = tn.rim; g.lineWidth = Math.max(1, 0.03 * F.k); g.stroke();
    }
    return [X1, Y1, rx, ry];
  }
  // A ball in flat tones: base, a deeper crescent and a lit cap.
  function ball(F, I, cx, cy, z, r, tn) {
    const g = F.g, R = r * SPH * F.k, [X, Y] = lp(F, I, cx, cy, z);
    g.save();
    g.beginPath(); g.arc(X, Y, R, 0, TAU); g.fillStyle = tn.left; g.fill(); g.clip();
    g.beginPath(); g.arc(X + R * 0.95, Y + R * 0.75, R * 1.05, 0, TAU); g.fillStyle = tn.right; g.fill();
    g.beginPath(); g.ellipse(X - R * 0.3, Y - R * 0.38, R * 0.46, R * 0.32, -0.5, 0, TAU); g.fillStyle = tn.top; g.fill();
    g.restore();
    return [X, Y, R];
  }
  // A square pyramid; its apex may lean (sway).
  function pyr(F, I, cx, cy, z, r, h, tn, lean = 0) {
    const g = F.g, A = lp(F, I, cx + lean, cy - lean, z + h);
    const p = (x, y) => lp(F, I, x, y, z);
    poly(g, [p(cx - r, cy + r), p(cx + r, cy + r), A]); g.fillStyle = tn.left; g.fill();
    poly(g, [p(cx + r, cy + r), p(cx + r, cy - r), A]); g.fillStyle = tn.right; g.fill();
  }
  // Flat shape lying in the ground plane (local units).
  function flat(F, I, foot, z, color) { poly(F.g, foot.map((p) => lp(F, I, p[0], p[1], z))); F.g.fillStyle = color; F.g.fill(); }
  function ring(F, I, cx, cy, z, r, color, lw) {
    const g = F.g, [X, Y] = lp(F, I, cx, cy, z);
    g.beginPath(); g.ellipse(X, Y, r * SPH * F.k, r * 0.7071 * F.k, 0, 0, TAU); g.strokeStyle = color; g.lineWidth = lw; g.stroke();
  }
  // Drawing on a face: units are world units. Y face (left-front): a runs along +x, b runs down.
  function onFaceY(F, I, x0, y, z0, fn) { const [X, Y] = lp(F, I, x0, y, z0), k = F.k; F.g.save(); F.g.transform(C30 * k, 0.5 * k, 0, k, X, Y); fn(F.g); F.g.restore(); }
  // Top plane: a runs along +x, b along +y.
  function onTop(F, I, x0, y0, z, fn) { const [X, Y] = lp(F, I, x0, y0, z), k = F.k; F.g.save(); F.g.transform(C30 * k, 0.5 * k, -C30 * k, 0.5 * k, X, Y); fn(F.g); F.g.restore(); }

  function rr(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  // ---- shadows and the draw list -------------------------------------------------------------------------
  function hull(pts) {
    pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    up.pop(); lo.pop();
    return lo.concat(up);
  }
  // A solid's long shadow on its island: its footprint swept along the light.
  function cast(F, I, foot, z, h, gz = 0) {
    if (h <= 0.02) return;
    const pts = [];
    for (const [x, y] of foot) for (const zz of [z, z + h]) { const e = Math.max(0, zz - gz); pts.push([x + e * SL[0], y + e * SL[1]]); }
    F.shadows.push({ I, z: gz, pts: hull(pts) });
  }
  // Items draw far to near; island by island, air last.
  function put(F, I, x, y, z, fn) { F.items.push({ grp: I.air ? -1e3 : I.j, k: I.ox + x + I.oy + y + z * 0.02, n: F.items.length, fn }); }
  const later = (F, st, fn) => F.tags.push({ st, fn });

  // ---- type --------------------------------------------------------------------------------------------
  function setFont(g, size, weight = 700) { g.font = `${weight} ${Math.round(size)}px ${FONT}`; }
  function fitSize(g, s, size, maxW, min, weight = 700) {
    setFont(g, size, weight);
    let w = g.measureText(s).width;
    if (maxW && w > maxW) { size = Math.max(min, (size * maxW) / w); setFont(g, size, weight); w = g.measureText(s).width; }
    return [size, w];
  }
  const fmt = (v, d, which) => window.DreamcutMotion.formatNumber(v, 0, d.prefix || "", d[which] || d.suffix || "");
  // A small three-tone cube, the look's bullet.
  function cubeIcon(F, cx, cy, r, base) {
    const g = F.g, tn = tone(F, base), h = r * 0.5;
    poly(g, [[cx, cy - r], [cx + r * C30, cy - h], [cx, cy], [cx - r * C30, cy - h]]); g.fillStyle = tn.top; g.fill();
    poly(g, [[cx - r * C30, cy - h], [cx, cy], [cx, cy + r], [cx - r * C30, cy + h]]); g.fillStyle = tn.left; g.fill();
    poly(g, [[cx + r * C30, cy - h], [cx, cy], [cx, cy + r], [cx + r * C30, cy + h]]); g.fillStyle = tn.right; g.fill();
  }
  // A floating label card. Card and words arrive together, popping up from the stem.
  function tag(F, s, ax, ay, o = {}) {
    const q = o.q ?? 1;
    s = String(s ?? "");
    if (q <= 0 || !s) return null;
    const g = F.g, u = F.u, T = F.T;
    const weight = o.weight || 700;
    const [size, tw] = fitSize(g, s, o.size || 46 * u, o.maxW || 0, o.min || 42 * u, weight);
    const padX = size * 0.46;
    const icon = o.badge ? size * 0.92 : o.icon === false ? 0 : size * 0.5;
    const w = tw + padX * 2 + (icon ? icon + size * 0.32 : 0), h = size * 1.5;
    const lift = o.lift ?? 34 * u;
    let cx = ax + (o.dx || 0);
    cx = clamp(cx, w / 2 + 20 * u, F.W - w / 2 - 20 * u);
    const below = Boolean(o.below);
    const by = below ? ay + lift : ay - lift;
    const k = back(q);
    g.save();
    g.globalAlpha *= clamp(q * 3);
    if (lift > 2) {
      g.strokeStyle = o.stem || css(T.deep, T.night ? 0.6 : 0.4); g.lineWidth = 2.4 * u; g.lineCap = "round";
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(lerp(ax, cx, 0.5), by); g.stroke();
      g.save(); g.translate(ax, ay); g.rotate(Math.PI / 4); g.fillStyle = o.dot || F.acc; g.fillRect(-5 * u, -5 * u, 10 * u, 10 * u); g.restore();
    }
    g.translate(cx, by);
    g.scale(lerp(0.55, 1, k), lerp(0.55, 1, k));
    const y0 = below ? 0 : -h;
    g.shadowColor = css(T.deep, T.night ? 0.5 : 0.2); g.shadowBlur = 28 * u; g.shadowOffsetY = 12 * u;
    rr(g, -w / 2, y0, w, h, h * 0.3); g.fillStyle = o.fill || T.card; g.fill();
    g.shadowColor = "transparent";
    let x = -w / 2 + padX;
    if (o.badge) {
      g.beginPath(); g.arc(x + icon / 2, y0 + h / 2, icon / 2, 0, TAU); g.fillStyle = F.acc; g.fill();
      setFont(g, size * 0.62, 800); g.fillStyle = F.onAcc; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(String(o.badge), x + icon / 2, y0 + h / 2 + size * 0.03);
      x += icon + size * 0.32;
    } else if (icon) {
      cubeIcon(F, x + icon / 2, y0 + h / 2, icon * 0.5, o.cube || F.acc);
      x += icon + size * 0.32;
    }
    setFont(g, size, weight); g.fillStyle = o.ink || T.cardInk; g.textAlign = "left"; g.textBaseline = "middle";
    g.fillText(s, x, y0 + h / 2 + size * 0.04);
    g.restore();
    return { cx, w, h };
  }
  // A leader from a part to a card at a fixed place; the line draws, then the card pops.
  function callout(F, s, ax, ay, tx, ty, q, o = {}) {
    if (q <= 0 || !s) return;
    const g = F.g, u = F.u;
    const ex = o.right ? tx + 16 * u : tx - 16 * u, mx = o.gx ?? (o.right ? tx + 56 * u : tx - 56 * u);
    const pts = [[ax, ay], [mx, ty], [ex, ty]];
    const L1 = Math.hypot(mx - ax, ty - ay), L2 = Math.abs(ex - mx), tot = L1 + L2;
    let left = tot * ease(span(q, 0, 0.55));
    g.save();
    g.strokeStyle = F.acc; g.lineWidth = 3 * u; g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath(); g.moveTo(ax, ay);
    const k1 = Math.min(1, left / (L1 || 1));
    g.lineTo(lerp(ax, mx, k1), lerp(ay, ty, k1));
    if (left > L1) g.lineTo(lerp(mx, ex, (left - L1) / (L2 || 1)), ty);
    g.stroke();
    g.beginPath(); g.arc(ax, ay, 9 * u, 0, TAU); g.fillStyle = F.acc; g.fill();
    g.beginPath(); g.arc(ax, ay, (14 + 10 * fract(F.t * 0.8)) * u, 0, TAU); g.strokeStyle = css(F.acc, 0.5 * (1 - fract(F.t * 0.8))); g.lineWidth = 2.5 * u; g.stroke();
    g.restore();
    const cq = span(q, 0.45, 1);
    if (cq <= 0) return;
    const [size, tw] = fitSize(g, s, 46 * u, o.maxW || 0, 42 * u);
    const w = tw + size * 0.46 * 2 + size * 0.82;
    tag(F, s, o.right ? tx - w / 2 : tx + w / 2, ty + size * 0.75, { q: cq, lift: 0, size, maxW: o.maxW });
    void pts;
  }

  // ---- plan and camera ------------------------------------------------------------------------------------
  function controls() {
    if (window.__dreamcut && window.__dreamcut.controls) return window.__dreamcut.controls;
    try { if (typeof dc !== "undefined" && dc && dc.controls) return dc.controls; } catch (e) { /* not on this page */ }
    return null;
  }
  const seen = {};
  const DEFAULTS = {
    chart: { labels: ["Mon", "Tue", "Wed", "Thu"], values: [12, 19, 27, 41], suffix: "", prefix: "", highlight: 3 },
    object: { kind: "laptop", callouts: ["Live preview", "The proposed clip", "Your original track"] },
    people: { count: 4, badges: ["Editor", "Producer", "Client"], highlight: 1 },
    process: { steps: ["Read the cut", "Draft the change", "You approve"] },
    compare: { left: "Before", leftValue: 9, right: "After", rightValue: 2, suffix: "", prefix: "" },
  };
  let planCache = null, planKey = "";
  function planOf(S, info) {
    const c = controls();
    if (c) {
      const key = `${S.W}x${S.H}`;
      if (planCache && planKey === key) return planCache;
      let t = 0;
      const shown = [];
      for (const id of ORDER) { const hold = Number(c[`${id}_hold`]) || 0; if (hold > 0) shown.push({ id, start: t, hold }); t += hold; }
      if (shown.length) {
        const data = {
          chart: { labels: [c.bar_1_label, c.bar_2_label, c.bar_3_label, c.bar_4_label], values: [c.bar_1, c.bar_2, c.bar_3, c.bar_4].map((v) => Number(v) || 0), suffix: c.chart_suffix || "", prefix: "", highlight: Number(c.highlight) - 1 },
          object: { kind: c.device, callouts: [c.callout_1, c.callout_2, c.callout_3] },
          people: { count: Number(c.people_count) || 4, badges: [c.badge_1, c.badge_2, c.badge_3] },
          process: { steps: [c.step_1, c.step_2, c.step_3] },
          compare: { left: c.before_label, leftValue: Number(c.before_value) || 0, right: c.after_label, rightValue: Number(c.after_value) || 0, suffix: c.compare_suffix || "", prefix: "" },
        };
        planKey = key;
        return (planCache = finishPlan({ shown, data, change: Number(c.change) || 0.45, length: t }));
      }
    }
    // Without the controls only the current scene is known.
    const id = info.scene || "title";
    const data = {};
    for (const k of Object.keys(DEFAULTS)) data[k] = seen[k] || DEFAULTS[k];
    return finishPlan({ shown: [{ id, start: info.t - (info.local || 0), hold: info.hold || 3 }], data, change: info.change || 0.45, length: info.length || 3 });
  }
  function finishPlan(P0) {
    let j = 0;
    P0.shown.forEach((st, i) => { st.i = i; st.island = st.id === "closing" ? -1 : j++; });
    P0.islands = j;
    return P0;
  }
  function scaleOf(S) { return (S.tall ? 40 : S.square ? 40 : 50) * S.u; }
  // Where the camera rests for each scene: which world point sits where on screen, and how close.
  function stationCam(F, st) {
    const { W, H, tall, square } = F;
    const oy = -st.island * PITCH;
    const c = (fx, fy, fz, ax, ay, z) => ({ fx, fy, fz, ax, ay, z });
    switch (st.id) {
      case "title":
        if (tall) return c(6, oy + 5, 1.6, W * 0.5, H * 0.85, 1.15);
        if (square) return c(6, oy + 5, 1.6, W * 0.6, H * 0.74, 0.86);
        return c(6, oy + 5, 1.6, W * 0.69, H * 0.6, 1);
      case "chart": return c(6, oy + 5, 2.6, W * 0.5, tall ? H * 0.58 : H * 0.66, tall ? 1.35 : 1.08);
      case "object": return tall ? c(6, oy + 5, 1.8, W * 0.5, H * 0.47, 1.35) : c(6, oy + 5, 1.8, W * (square ? 0.5 : 0.39), H * (square ? 0.55 : 0.64), square ? 0.95 : 1.02);
      case "people": return c(6, oy + 4.8, 1.7, W * 0.5, tall ? H * 0.58 : H * 0.68, tall ? 1.55 : 1.38);
      case "process": return c(6.2, oy + 4.8, 1.4, W * 0.5, tall ? H * 0.58 : H * 0.7, tall ? 1.5 : 1.42);
      case "compare": return c(6, oy + 5, 2.4, W * 0.5, tall ? H * 0.6 : H * 0.66, tall ? 1.35 : 1.04);
      default: { // closing: pull back over the last islands built
        const n = Math.max(1, F.plan.islands), m = Math.min(2, n), last = n - 1, first = n - m;
        const fy = 5 - ((first + last) / 2) * PITCH, wu = 22 + (m - 1) * PITCH;
        const z = Math.min(0.9, (W * (tall ? 1.05 : 0.7)) / (wu * C30 * F.s), (H * 0.7) / ((wu * 0.5 + 5) * F.s));
        if (tall) return c(6, fy, 1.5, W * 0.5, H * 0.8, z * 1.18);
        if (square) return c(6, fy, 1.5, W * 0.6, H * 0.68, z);
        return c(6, fy, 1.5, W * 0.72, H * 0.64, z * 1.12);
      }
    }
  }
  function holdCam(F, st, t) {
    const c = { ...stationCam(F, st) }, k = clamp((t - st.start) / Math.max(0.01, st.hold));
    c.fy -= 0.45 * k; c.fx += 0.15 * k;
    c.z *= 1 + 0.035 * k;
    return c;
  }
  function panWindow(P0, i) {
    const A = P0.shown[i - 1], B = P0.shown[i], T = B.start;
    const tail = B.id === "closing" ? Math.min(1.7, B.hold * 0.6) : Math.min(0.55, B.hold * 0.35);
    return [Math.max(A.start + A.hold * 0.5, T - 0.5), T + tail];
  }
  function camera(F) {
    const P0 = F.plan, t = F.t, sh = P0.shown;
    let i = sh.findIndex((st) => t >= st.start && t < st.start + st.hold);
    if (i < 0) i = t <= 0 ? 0 : sh.length - 1;
    const pan = (A, B, a, b) => {
      const m = inout((t - a) / (b - a)), ca = holdCam(F, A, a), cb = holdCam(F, B, b), dip = 0.1 * Math.sin(Math.PI * m) * (B.id === "closing" ? 0.3 : 1);
      const o = {};
      for (const key of ["fx", "fy", "fz", "ax", "ay"]) o[key] = lerp(ca[key], cb[key], m);
      o.z = Math.exp(lerp(Math.log(ca.z), Math.log(cb.z), m)) * (1 - dip);
      return o;
    };
    const inW = i > 0 ? panWindow(P0, i) : null, outW = i < sh.length - 1 ? panWindow(P0, i + 1) : null;
    if (inW && t < inW[1]) return pan(sh[i - 1], sh[i], inW[0], inW[1]);
    if (outW && t >= outW[0]) return pan(sh[i], sh[i + 1], outW[0], outW[1]);
    return holdCam(F, sh[i], t);
  }
  // A scene's build: starts as the camera sets off toward its island.
  const buildQ = (F, st) => clamp((F.t - (st.start - 0.42)) / Math.max(1, Math.min(2.3, st.hold * 0.58)));

  // ---- scenery -----------------------------------------------------------------------------------------------
  function pine(F, I, x, y, s = 1, seed = 0) {
    const T = F.T, leaf = tone(F, seed % 2 ? T.mint : T.mintDeep), trunk = tone(F, T.bark);
    const lean = 0.05 * s * Math.sin(F.t * 1.1 + seed * 1.9);
    cast(F, I, circ(x, y, 0.5 * s, 6), 0, 2.3 * s);
    put(F, I, x, y, 0, () => {
      box(F, I, x - 0.1 * s, y - 0.1 * s, 0, 0.2 * s, 0.2 * s, 0.45 * s, trunk, { rim: false, ao: false });
      pyr(F, I, x, y, 0.4 * s, 0.6 * s, 0.95 * s, leaf, lean * 0.4);
      pyr(F, I, x, y, 0.9 * s, 0.48 * s, 0.85 * s, leaf, lean * 0.7);
      pyr(F, I, x, y, 1.35 * s, 0.34 * s, 0.85 * s, leaf, lean);
    });
  }
  function bush(F, I, x, y, s = 1, base) {
    const tn = tone(F, base || F.T.mint);
    cast(F, I, rect(x - 0.35 * s, y - 0.35 * s, 0.7 * s, 0.7 * s), 0, 0.55 * s);
    put(F, I, x, y, 0, () => {
      box(F, I, x - 0.35 * s, y - 0.35 * s, 0, 0.7 * s, 0.7 * s, 0.38 * s, tn, { ao: false });
      box(F, I, x - 0.2 * s, y - 0.22 * s, 0.38 * s, 0.42 * s, 0.42 * s, 0.22 * s, tn, { ao: false });
    });
  }
  function lamp(F, I, x, y) {
    const T = F.T, post = tone(F, T.white), glow = T.night ? 1 : 0;
    cast(F, I, rect(x - 0.06, y - 0.06, 0.12, 0.12), 0, 1.9);
    put(F, I, x, y, 0, () => {
      box(F, I, x - 0.06, y - 0.06, 0, 0.12, 0.12, 1.75, post, { rim: false, ao: false });
      box(F, I, x - 0.16, y - 0.16, 1.75, 0.32, 0.32, 0.22, tone(F, T.butter), { ao: false });
      if (glow) {
        const g = F.g, [X, Y] = lp(F, I, x, y, 1.86), R = 1.3 * F.k;
        const gr = g.createRadialGradient(X, Y, 0, X, Y, R);
        gr.addColorStop(0, css(T.butter, 0.45)); gr.addColorStop(1, css(T.butter, 0));
        g.fillStyle = gr; g.fillRect(X - R, Y - R, R * 2, R * 2);
      }
    });
  }
  function crate(F, I, x, y, z, s, base) {
    const tn = tone(F, base);
    cast(F, I, rect(x, y, s, s), z, s * 0.85);
    put(F, I, x + s / 2, y + s / 2, z, () => {
      box(F, I, x, y, z, s, s, s * 0.85, tn);
      onTop(F, I, x, y, z + s * 0.85, (g) => { g.strokeStyle = tn.left; g.lineWidth = 0.05; g.strokeRect(s * 0.15, s * 0.15, s * 0.7, s * 0.7); });
    });
  }
  // Ground dressing: lawn tiles, stepping stones and flower dots. Drawn flat, under the shadows.
  function lawn(F, I, x, y, w, d) {
    const tn = tone(F, F.T.lawn);
    I.decor.push(() => box(F, I, x, y, 0, w, d, 0.06, tn, { ao: false, rim: false }));
  }
  function stones(F, I, pts) {
    const tn = tone(F, F.T.stone);
    I.decor.push(() => { for (const [x, y] of pts) box(F, I, x - 0.28, y - 0.28, 0, 0.56, 0.56, 0.04, tn, { ao: false, rim: false }); });
  }
  function flowers(F, I, x, y, seed) {
    const T = F.T, cols = [T.peach, T.butter, F.acc, T.white];
    I.decor.push(() => {
      for (let i = 0; i < 6; i++) {
        const fx = x + hash(seed, i) * 1.4, fy = y + hash(i, seed) * 1.0, c = cols[i % 4];
        const [X, Y] = lp(F, I, fx, fy, 0.08 + 0.04 * Math.sin(F.t * 2 + i));
        F.g.beginPath(); F.g.ellipse(X, Y, 0.11 * F.k, 0.07 * F.k, 0, 0, TAU); F.g.fillStyle = css(c); F.g.fill();
      }
    });
  }
  // Flags rise on every finished island during the closing.
  function flag(F, I, x, y, q) {
    if (q <= 0) return;
    const T = F.T, h = 2.6 * ease(q);
    cast(F, I, rect(x - 0.05, y - 0.05, 0.1, 0.1), 0, h);
    put(F, I, x, y, 0, () => {
      box(F, I, x - 0.05, y - 0.05, 0, 0.1, 0.1, h, tone(F, T.white), { rim: false, ao: false });
      const g = F.g, k = F.k;
      g.beginPath();
      const steps = 10;
      for (let s = 0; s <= steps; s++) { const a = s / steps, [X, Y] = lp(F, I, x + a * 1.2, y - a * 0.3, h - 0.05 + 0.12 * Math.sin(F.t * 5 - a * 4) * a); s ? g.lineTo(X, Y) : g.moveTo(X, Y); }
      for (let s = steps; s >= 0; s--) { const a = s / steps, [X, Y] = lp(F, I, x + a * 1.2, y - a * 0.3, h - 0.62 + 0.12 * Math.sin(F.t * 5 - a * 4) * a + 0.2 * a); g.lineTo(X, Y); }
      g.closePath(); g.fillStyle = F.acc; g.fill();
      void k;
    });
  }

  // ---- islands and bridges -------------------------------------------------------------------------------------
  function islandOf(F, j) {
    return { j, ox: 0, oy: -j * PITCH, z: 0.07 * Math.sin(F.t * 1.25 + j * 1.9), decor: [] };
  }
  function drawIsland(F, I) {
    const g = F.g, T = F.T, u = F.u;
    // The soft shadow far below the floating tile.
    const c = lp(F, I, IW / 2 + 2.2, ID / 2 - 0.6, -5.5 - I.z);
    g.save();
    g.filter = `blur(${Math.round(22 * u * F.cam.z)}px)`;
    g.globalAlpha = T.dropA;
    g.beginPath(); g.ellipse(c[0], c[1], 11 * F.k, 4.6 * F.k, 0, 0, TAU); g.fillStyle = T.shadow; g.fill();
    g.restore();
    const body = tone(F, T.island), deep = tone(F, T.islandDeep);
    box(F, I, 0.5, 0.5, -1.75, IW - 1, ID - 1, 1.25, deep, { noTop: true, rim: false });
    box(F, I, 0, 0, -0.62, IW, ID, 0.62, body, { top: T.islandTop });
    // A lit band where the turf meets the side.
    prism(F, I, rect(0, 0, IW, ID), -0.12, 0.12, tone(F, T.islandBand), { noTop: true, ao: false, rim: false });
    // The tile grid on top.
    const top = rect(0, 0, IW, ID).map((p) => lp(F, I, p[0], p[1], 0));
    F.tops.push(top);
    g.save();
    poly(g, top); g.clip();
    g.strokeStyle = css(T.deep, 0.06 * (0.4 + 0.6 * F.S.look.texture)); g.lineWidth = Math.max(1, 0.02 * F.k);
    g.beginPath();
    for (let x = 1; x < IW; x++) { const a = lp(F, I, x, 0, 0), b = lp(F, I, x, ID, 0); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
    for (let y = 1; y < ID; y++) { const a = lp(F, I, 0, y, 0), b = lp(F, I, IW, y, 0); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
    g.stroke();
    g.restore();
    const tr = rng(500 + I.j * 31);
    for (let k = 0; k < 14; k++) {
      const tx = Math.floor(tr() * IW), ty = Math.floor(tr() * ID), c = [T.lavender, T.sky, T.mint, T.peach][Math.floor(tr() * 4)];
      flat(F, I, rect(tx + 0.06, ty + 0.06, 0.88, 0.88), 0.002, css(c, 0.16));
    }
    for (const fn of I.decor) fn();
    // Little cubes hovering beside the tile.
    const cub = [[IW + 0.9, 2.2, -1.1, 0.5], [IW + 0.6, 7.4, -0.5, 0.32], [3.1, ID + 0.9, -1.25, 0.42], [8.6, ID + 0.7, -0.4, 0.28]];
    cub.forEach(([x, y, z, s], i) => {
      const bz = z + 0.18 * Math.sin(F.t * 1.6 + i * 2.1 + I.j);
      box(F, I, x, y, bz, s, s, s, tone(F, [T.lavender, T.mint, T.peach, T.sky][(i + I.j) % 4]));
    });
  }
  function drawBridge(F, A, B) {
    // A walkway from island A's back edge to island B's front edge, with a rail.
    const T = F.T, I = { j: A.j, ox: 0, oy: A.oy, z: (A.z + B.z) / 2, decor: [] };
    const tn = tone(F, T.white), side = tone(F, T.island);
    box(F, I, 5.1, -GAP - 0.05, -0.42, 1.8, GAP + 0.1, 0.3, side, { top: tn.top });
    const g = F.g;
    g.strokeStyle = css(T.deep, 0.18); g.lineWidth = Math.max(1, 0.05 * F.k);
    for (const x of [5.55, 6.45]) { const a = lp(F, I, x, -GAP, -0.11), b = lp(F, I, x, 0, -0.11); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
    return I;
  }
  // A small tram that shuttles across each bridge.
  function tram(F, I) {
    const T = F.T, ph = (Math.sin(F.t * 0.8 + I.j * 1.3) + 1) / 2, y = lerp(-GAP + 0.3, -1.5, inout(ph));
    put(F, I, 6, y + 0.6, -0.1, () => {
      const body = tone(F, I.j % 2 ? T.sky : T.peach);
      box(F, I, 5.35, y, -0.11, 1.3, 1.2, 0.75, body);
      box(F, I, 5.45, y + 0.15, 0.64, 1.1, 0.9, 0.1, tone(F, T.white), { ao: false });
      onFaceY(F, I, 5.35, y + 1.2, 0.54, (g) => { g.fillStyle = css(T.window, 0.95); for (let w = 0; w < 3; w++) g.fillRect(0.12 + w * 0.4, 0.06, 0.28, 0.24); });
    });
  }

  // ---- the title island: a little studio -----------------------------------------------------------------------------
  function buildTitle(F, I, st) {
    const q = buildQ(F, st), t = F.t, T = F.T;
    const lav = tone(F, T.lavender), white = tone(F, T.white), acc = tone(F, F.acc);
    // A big monitor playing a tiny landscape, with a timeline below it.
    const qm = back(span(q, 0, 0.5));
    const sx = 1.6, sw = 6.2, sy = 1.35, sz = 1.55;
    const sh = 3.9 * qm;
    if (qm > 0) {
      cast(F, I, rect(3.9, 0.95, 1.4, 1.05), 0, 0.22);
      cast(F, I, rect(sx, sy, sw, 0.32), sz, sh);
      put(F, I, sx + sw / 2, sy + 0.2, 0, () => {
        box(F, I, 3.9, 0.95, 0, 1.4, 1.05, 0.22, white);
        box(F, I, 4.4, 1.3, 0.22, 0.4, 0.35, sz - 0.22 + sh * 0.2, lav);
        box(F, I, sx, sy, sz, sw, 0.32, sh, lav);
        if (qm > 0.4) onFaceY(F, I, sx, sy + 0.32, sz + sh, (g) => screenScene(F, g, sw, sh, t, clamp((qm - 0.4) * 2)));
      });
    }
    // A reel on a plinth, spinning.
    const qr = back(span(q, 0.2, 0.6));
    if (qr > 0) {
      cast(F, I, rect(8.9, 1.5, 2.2, 2.2), 0, 0.8 * qr);
      cast(F, I, circ(10, 2.6, 1.0, 10), 0.8 * qr, 0.3);
      put(F, I, 10, 2.6, 0, () => {
        box(F, I, 8.9, 1.5, 0, 2.2, 2.2, 0.8 * qr, white);
        const [X, Y] = cyl(F, I, 10, 2.6, 0.8 * qr, 1.0, 0.3, acc);
        const g = F.g;
        for (let s = 0; s < 3; s++) {
          const a = t * 1.3 + (s * TAU) / 3, [hx, hy] = lp(F, I, 10 + Math.cos(a) * 0.55, 2.6 + Math.sin(a) * 0.55, 0.8 * qr + 0.3);
          g.beginPath(); g.ellipse(hx, hy, 0.24 * SPH * F.k, 0.24 * 0.7071 * F.k, 0, 0, TAU); g.fillStyle = acc.dark; g.fill();
        }
        g.beginPath(); g.ellipse(X, Y, 0.16 * SPH * F.k, 0.16 * 0.7071 * F.k, 0, 0, TAU); g.fillStyle = acc.rim; g.fill();
      });
    }
    // A runway of clips sliding along three lanes.
    const qw = ease(span(q, 0.1, 0.65));
    if (qw > 0) {
      const x0 = 1.0, len = 10 * qw;
      cast(F, I, rect(x0, 6.1, len, 2.4), 0, 0.3);
      put(F, I, x0 + len / 2, 7.3, 0, () => {
        box(F, I, x0, 6.1, 0, len, 2.4, 0.3, white);
        const cols = [[T.lavender, F.acc, T.sky, T.lavender, T.mint], [T.mint, T.peach, T.sky, T.butter], [T.sky, T.lavender, T.peach, T.mint, T.butter]];
        for (let l = 0; l < 3; l++) {
          const y = 6.3 + l * 0.72, sp = 0.55 + l * 0.12, lens = [1.7, 2.3, 1.2, 2.0, 1.5];
          const period = lens.reduce((a, b) => a + b + 0.35, 0);
          let pos = -fract((t * sp) / period) * period;
          for (let r = 0; r < 3; r++) {
            for (let k = 0; k < lens.length; k++) {
              const a = x0 + 0.15 + pos, b = a + lens[k];
              pos += lens[k] + 0.35;
              const ca = Math.max(a, x0 + 0.15), cb = Math.min(b, x0 + len - 0.15);
              if (cb - ca < 0.05) continue;
              box(F, I, ca, y, 0.3, cb - ca, 0.56, 0.2, tone(F, cols[l][k % cols[l].length]), { ao: false });
            }
          }
        }
      });
    }
    // A stack of crates, trees, a lamp and a bench of flowers.
    if (span(q, 0.35, 0.7) > 0) {
      const qc = back(span(q, 0.35, 0.75));
      crate(F, I, 8.7, 4.3, 0, 1.0 * qc, T.peach);
      crate(F, I, 9.85, 4.55, 0, 0.8 * qc, T.sky);
      if (qc > 0.6) crate(F, I, 8.85, 4.45, 0.85 * qc, 0.75, T.butter);
    }
    pine(F, I, 0.7, 4.0, 1.05, 1); pine(F, I, 0.8, 5.3, 0.8, 2); pine(F, I, 11.3, 0.7, 0.95, 3); pine(F, I, 11.4, 4.6, 0.7, 4);
    lamp(F, I, 11.2, 5.8);
    bush(F, I, 0.8, 9.2, 0.9); bush(F, I, 11.3, 9.3, 0.8, T.lawn);
    lawn(F, I, 8.4, 0.3, 3.4, 4.0); lawn(F, I, 0.2, 3.2, 1.5, 2.7);
    stones(F, I, [[7.2, 5.1], [7.9, 5.5], [8.6, 5.9]]);
    flowers(F, I, 9.4, 8.9, 7);
    // A drone ferrying a clip above the studio.
    const dI = { ...I, air: true };
    const a = t * 0.55, dx = 7.2 + Math.cos(a) * 2.6, dy = 5.2 + Math.sin(a * 2) * 1.2, dz = 6.2 + 0.2 * Math.sin(t * 2.3);
    if (q > 0.3) drone(F, dI, I, dx, dy, dz, clamp((q - 0.3) * 3));
  }
  function drone(F, dI, I, x, y, z, al) {
    const T = F.T;
    cast(F, I, rect(x - 0.4, y - 0.4, 0.8, 0.8), z - 1.1, 0.4);
    put(F, dI, x, y, z, () => {
      const g = F.g;
      g.save(); g.globalAlpha *= al;
      const [ax, ay] = lp(F, I, x, y, z), [bx, by] = lp(F, I, x, y, z - 0.8);
      g.strokeStyle = css(T.deep, 0.5); g.lineWidth = 1.6 * F.u; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      box(F, I, x - 0.35, y - 0.35, z - 1.15, 0.7, 0.7, 0.4, tone(F, F.acc));
      box(F, I, x - 0.45, y - 0.45, z, 0.9, 0.9, 0.26, tone(F, T.lavender));
      for (const [ox, oy] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
        const [X, Y] = lp(F, I, x + ox, y + oy, z + 0.3);
        const sp = 0.42 * F.k * (0.55 + 0.45 * Math.abs(Math.sin(F.t * 22 + ox * 3 + oy)));
        g.beginPath(); g.ellipse(X, Y, sp * SPH, sp * 0.4, 0, 0, TAU); g.fillStyle = css(T.deep, 0.22); g.fill();
      }
      g.restore();
    });
  }
  // The tiny landscape on the studio monitor (face units).
  function screenScene(F, g, w, h, t, al) {
    const T = F.T;
    g.save(); g.globalAlpha *= al;
    rr(g, 0.16, 0.16, w - 0.32, h - 0.32, 0.12); g.fillStyle = css(T.screen); g.fill();
    const px = 0.32, py = 0.3, pw = w - 0.64, ph = (h - 0.6) * 0.66;
    g.save(); rr(g, px, py, pw, ph, 0.1); g.clip();
    const sky = g.createLinearGradient(0, py, 0, py + ph); sky.addColorStop(0, css(T.sky)); sky.addColorStop(1, css(T.peach)); g.fillStyle = sky; g.fillRect(px, py, pw, ph);
    g.beginPath(); g.arc(px + pw * 0.72, py + ph * (0.42 - 0.06 * Math.sin(t * 0.7)), ph * 0.16, 0, TAU); g.fillStyle = css(T.butter); g.fill();
    for (let layer = 0; layer < 2; layer++) {
      g.beginPath(); g.moveTo(px, py + ph);
      for (let s = 0; s <= 24; s++) { const xx = px + (pw * s) / 24, yy = py + ph * (0.62 + layer * 0.14) - Math.sin(s * 0.7 + t * (0.6 + layer * 0.5) + layer) * ph * 0.08; g.lineTo(xx, yy); }
      g.lineTo(px + pw, py + ph); g.closePath(); g.fillStyle = css(layer ? T.mint : T.lavender); g.fill();
    }
    g.restore();
    const ty = py + ph + 0.18, th = h - 0.32 - ty;
    const lanes = 3, lh = th / lanes;
    for (let l = 0; l < lanes; l++) {
      for (let k = 0; k < 4; k++) {
        const x = px + ((k * 1.7 + l * 0.6) % (pw - 0.6)), cw = 0.9 + ((k + l) % 3) * 0.35;
        g.fillStyle = css(l === 0 && k === 2 ? F.acc : [T.lavender, T.mint, T.sky][l], 0.95);
        rr(g, x, ty + l * lh + lh * 0.18, Math.min(cw, px + pw - x), lh * 0.64, 0.05); g.fill();
      }
    }
    const ph2 = px + pw * fract(t * 0.18);
    g.fillStyle = css(F.acc); g.fillRect(ph2 - 0.025, ty - 0.08, 0.05, th + 0.1);
    g.restore();
  }

  // ---- chart: a skyline of towers ---------------------------------------------------------------------------------------
  function buildChart(F, I, st, d) {
    const q = buildQ(F, st), t = F.t, T = F.T, u = F.u;
    const vals = d.values.map((v) => Math.max(0, Number(v) || 0)), n = vals.length, max = Math.max(...vals, 1e-9);
    const step = 2.35, f = 1.75;
    const cols = [T.lavender, T.sky, T.lavender, T.mint];
    const tops = [];
    for (let i = 0; i < n; i++) {
      const o = i - (n - 1) / 2, cx = 6 + o * step, cy = 5 - o * step;
      const qi = stg(q, i, n, 0.5), hot = i === d.highlight;
      const H = 0.6 + 5.2 * (vals[i] / max), h = H * back(qi);
      const tn = tone(F, hot ? F.acc : cols[i % cols.length]);
      if (qi <= 0) continue;
      cast(F, I, rect(cx - f / 2, cy - f / 2, f, f), 0, h + 0.4);
      put(F, I, cx, cy, 0, () => tower(F, I, cx, cy, f, h, tn, i, hot));
      tops.push([i, cx, cy, h, qi, hot]);
      // The plinth under each tower.
      I.decor.push(() => box(F, I, cx - f / 2 - 0.25, cy - f / 2 - 0.25, 0, f + 0.5, f + 0.5, 0.1, tone(F, T.white), { ao: false }));
      if (hot) I.decor.push(() => {
        for (let r = 0; r < 2; r++) { const k = fract(t * 0.6 + r * 0.5); ring(F, I, cx, cy, 0.11, f * 0.75 + k * 1.6, css(F.acc, 0.55 * (1 - k)), 3 * u); }
      });
    }
    // The baseline rail in front of the row.
    const qb = ease(span(q, 0, 0.4));
    if (qb > 0) {
      const a = (n - 1) / 2 * step + 1.4, cxm = 6 + 1.75, cym = 5 + 1.75;
      const foot = [[cxm - a * qb, cym + a * qb], [cxm + a * qb, cym - a * qb], [cxm + a * qb + 0.22, cym - a * qb + 0.22], [cxm - a * qb + 0.22, cym + a * qb + 0.22]];
      put(F, I, cxm, cym, 0, () => prism(F, I, foot, 0, 0.16, tone(F, T.deepSoft), { ao: false }));
    }
    later(F, st, () => {
      for (const [i, cx, cy, h, qi, hot] of tops) {
        const [X, Y] = lp(F, I, cx - 0.2, cy - 0.2, h + 1.35);
        tag(F, fmt(vals[i] * ease(span(qi, 0.1, 0.9)), d), X, Y, { q: span(qi, 0.25, 0.75), size: (hot ? 100 : 54) * u, min: (hot ? 96 : 42) * u, maxW: (hot ? 360 : 190) * u, lift: 22 * u, icon: false, fill: hot ? F.acc : F.T.card, ink: hot ? F.onAcc : F.T.cardInk, dot: hot ? F.T.card : F.acc });
        const [LX, LY] = lp(F, I, cx + f / 2 + 0.25, cy + f / 2 + 0.25, 0);
        const lab = d.labels[i] || "";
        if (lab) tag(F, lab, LX, LY + 18 * u, { q: span(qi, 0.3, 0.8), lift: 0, size: 44 * u, maxW: 196 * u, icon: false, below: true, fill: css(F.T.card, 0.92) });
      }
    });
    // A blimp drifting over the skyline.
    if (q > 0.2) {
      const a = t * 0.32 + 0.6, bx = 6 + Math.cos(a) * 4.2, by = 5 + Math.sin(a) * 3.2, bz = 7.6 + 0.25 * Math.sin(t * 1.4);
      cast(F, I, circ(bx, by, 0.8, 8), bz - 6.2, 0.3);
      put(F, { ...I, air: true }, bx, by, bz, () => blimp(F, I, bx, by, bz, Math.cos(a + Math.PI / 2), clamp((q - 0.2) * 3)));
    }
    pine(F, I, 0.8, 0.8, 1.1, 1); pine(F, I, 1.9, 0.6, 0.8, 2); pine(F, I, 0.6, 2.0, 0.75, 3);
    bush(F, I, 11.2, 9.2, 0.9); bush(F, I, 10.3, 9.5, 0.6, T.lawn); lamp(F, I, 11.4, 7.8);
    lawn(F, I, 0.2, 0.2, 3.0, 2.6); lawn(F, I, 9.0, 8.2, 2.8, 1.6);
    flowers(F, I, 10.2, 6.6, 3); flowers(F, I, 1.0, 4.2, 5);
  }
  function tower(F, I, cx, cy, f, h, tn, i, hot) {
    const T = F.T, t = F.t, x = cx - f / 2, y = cy - f / 2;
    box(F, I, x, y, 0, f, f, h, tn);
    const g = F.g, lit = css(T.window), off = css(mixA(tn.L, T.lite, 0.3)), offR = css(mixA(tn.R, T.lite, 0.18));
    for (let k = 0; ; k++) {
      const z0 = 0.4 + k * 0.62;
      if (z0 + 0.36 > h - 0.2) break;
      for (let w = 0; w < 2; w++) {
        const a0 = 0.28 + w * 0.68, a1 = a0 + 0.42;
        const on = fract(hash(i, k, w) * 7 + t * 0.22) < 0.32;
        poly(g, [lp(F, I, x + a0, y + f, z0), lp(F, I, x + a1, y + f, z0), lp(F, I, x + a1, y + f, z0 + 0.36), lp(F, I, x + a0, y + f, z0 + 0.36)]);
        g.fillStyle = on ? lit : off; g.fill();
        const on2 = fract(hash(i + 9, k, w) * 7 + t * 0.19) < 0.3;
        poly(g, [lp(F, I, x + f, y + f - a0, z0), lp(F, I, x + f, y + f - a1, z0), lp(F, I, x + f, y + f - a1, z0 + 0.36), lp(F, I, x + f, y + f - a0, z0 + 0.36)]);
        g.fillStyle = on2 ? lit : offR; g.fill();
      }
    }
    // A lift running up the right face.
    if (!hot && i % 2 === 0 && h > 1.6) {
      const ez = 0.2 + (h - 0.8) * (0.5 + 0.5 * Math.sin(t * 0.9 + i));
      poly(g, [lp(F, I, x + f + 0.01, y + 0.25, ez), lp(F, I, x + f + 0.01, y + 0.05, ez), lp(F, I, x + f + 0.01, y + 0.05, ez + 0.42), lp(F, I, x + f + 0.01, y + 0.25, ez + 0.42)]);
      g.fillStyle = css(F.acc, 0.9); g.fill();
    }
    box(F, I, x + 0.28, y + 0.28, h, 0.8, 0.7, 0.3, tone(F, T.white), { ao: false });
    box(F, I, cx + 0.32, cy - 0.5, h, 0.08, 0.08, 0.95, tone(F, T.white), { ao: false, rim: false });
    const [X, Y] = lp(F, I, cx + 0.36, cy - 0.46, h + 1.0), on = 0.5 + 0.5 * Math.sin(t * 4 + i * 1.7);
    g.beginPath(); g.arc(X, Y, (0.1 + 0.05 * on) * F.k, 0, TAU); g.fillStyle = css(hot ? T.white : F.acc, 0.5 + 0.5 * on); g.fill();
  }
  function blimp(F, I, x, y, z, dir, al) {
    const T = F.T, g = F.g, [X, Y] = lp(F, I, x, y, z), k = F.k;
    g.save(); g.globalAlpha *= al;
    const rx = 1.35 * k, ry = 0.55 * k, s = dir >= 0 ? 1 : -1;
    // fins
    g.beginPath(); g.moveTo(X - s * rx * 0.75, Y); g.lineTo(X - s * rx * 1.15, Y - ry * 0.95); g.lineTo(X - s * rx * 1.02, Y); g.lineTo(X - s * rx * 1.15, Y + ry * 0.8); g.closePath(); g.fillStyle = css(F.acc); g.fill();
    const gr = g.createLinearGradient(0, Y - ry, 0, Y + ry);
    gr.addColorStop(0, css(mixA(T.white, T.lite, 0.5))); gr.addColorStop(1, css(mixA(T.lavender, T.deep, 0.15)));
    g.beginPath(); g.ellipse(X, Y, rx, ry, 0, 0, TAU); g.fillStyle = gr; g.fill();
    g.save(); g.beginPath(); g.ellipse(X, Y, rx, ry, 0, 0, TAU); g.clip(); g.fillStyle = css(F.acc); g.fillRect(X - rx * 0.12 - s * rx * 0.2, Y - ry, rx * 0.22, ry * 2); g.restore();
    rr(g, X - rx * 0.3, Y + ry * 0.85, rx * 0.6, ry * 0.45, ry * 0.15); g.fillStyle = css(T.lavender); g.fill();
    g.restore();
  }

  // ---- object: a laptop or a phone at work ------------------------------------------------------------------------------------
  function buildObject(F, I, st, d) {
    const q = buildQ(F, st), t = F.t, T = F.T, u = F.u;
    const phone = d.kind === "phone";
    const shell = tone(F, T.lavender), white = tone(F, T.white);
    const qb = back(span(q, 0, 0.45)), qs = back(span(q, 0.15, 0.6)), qc = span(q, 0.45, 0.8);
    let anchors;
    if (!phone) {
      const bx = 1.4, by = 3.8, bw = 9, bd = 4.9, bh = 0.32 * qb, sh = 5.0 * qs;
      if (qb > 0) {
        cast(F, I, rect(bx, by, bw, bd), 0, bh);
        put(F, I, bx + bw / 2, by + bd / 2, 0, () => {
          box(F, I, bx, by, 0, bw, bd, bh, shell);
          onTop(F, I, bx, by, bh, (g) => {
            for (let r = 0; r < 4; r++) for (let c = 0; c < 13; c++) {
              const press = hash(r, c, Math.floor(t * 6)) > 0.93 ? 0.4 : 0;
              rr(g, 0.6 + c * 0.6, 0.45 + r * 0.55, 0.48, 0.42, 0.08); g.fillStyle = css(mixA(shell.b, T.lite, 0.62 - press * 0.3)); g.fill();
            }
            rr(g, 3.3, 2.85, 2.4, 1.6, 0.14); g.fillStyle = css(mixA(shell.b, T.lite, 0.55)); g.fill();
          });
        });
      }
      if (qs > 0) {
        cast(F, I, rect(bx, by - 0.3, bw, 0.3), bh, sh);
        put(F, I, bx + bw / 2, by - 0.15, 0, () => {
          box(F, I, bx, by - 0.3, bh, bw, 0.3, sh, shell);
          if (qs > 0.25) onFaceY(F, I, bx, by, bh + sh, (g) => deskScreen(F, g, bw, sh, t, clamp((qs - 0.25) * 2.5)));
        });
      }
      const fz = bh + sh;
      anchors = [lp(F, I, bx + 5.6, by, fz - 1.3), lp(F, I, bx + 4.95, by, fz - sh * 0.665), lp(F, I, bx + 7.3, by, fz - sh * 0.86)];
      // A proposal card floating over the keys.
      const cq = back(span(q, 0.55, 0.9));
      if (cq > 0) {
        const cz = 1.3 + 0.18 * Math.sin(t * 1.6), cx0 = 6.9, cy0 = 5.6;
        cast(F, I, rect(cx0, cy0, 2.8, 1.7), cz, 0.08, bh);
        put(F, { ...I, air: true }, cx0 + 1.4, cy0 + 0.85, cz, () => proposalCard(F, I, cx0, cy0, cz, 2.8 * cq, 1.7 * cq));
      }
    } else {
      const px = 3.6, py = 0.9, pw = 4.8, pd = 8.2, ph = 0.42 * qb;
      if (qb > 0) {
        cast(F, I, rect(px, py, pw, pd), 0, ph);
        put(F, I, px + pw / 2, py + pd / 2, 0, () => {
          box(F, I, px, py, 0, pw, pd, ph, shell);
          if (qs > 0.3) onTop(F, I, px, py, ph, (g) => phoneScreen(F, g, pw, pd, t, clamp((qs - 0.3) * 2)));
        });
      }
      anchors = [lp(F, I, px + 2.4, py + 2.5, ph), lp(F, I, px + 2.9, py + 4.9, ph), lp(F, I, px + 1.6, py + 6.3, ph)];
      const cq = back(span(q, 0.55, 0.9));
      if (cq > 0) {
        const cz = 1.1 + 0.18 * Math.sin(t * 1.6), cx0 = 8.9, cy0 = 2.4;
        cast(F, I, rect(cx0, cy0, 2.6, 1.6), cz, 0.08);
        put(F, { ...I, air: true }, cx0 + 1.3, cy0 + 0.8, cz, () => proposalCard(F, I, cx0, cy0, cz, 2.6 * cq, 1.6 * cq));
      }
    }
    // A mug with rising steam.
    if (q > 0.35) {
      const mq = back(span(q, 0.35, 0.7)), mx = phone ? 1.8 : 11.0, my = phone ? 7.4 : 8.6;
      cast(F, I, circ(mx, my, 0.42, 8), 0, 0.8 * mq);
      put(F, I, mx, my, 0, () => {
        const [X, Y, rx, ry] = cyl(F, I, mx, my, 0, 0.42, 0.8 * mq, tone(F, F.acc), { top: css(T.bark) });
        const g = F.g;
        g.save(); g.strokeStyle = css(T.white, 0.75); g.lineWidth = 0.09 * F.k; g.lineCap = "round";
        for (let s = 0; s < 3; s++) {
          const ph0 = fract(t * 0.45 + s / 3);
          g.globalAlpha = Math.sin(ph0 * Math.PI) * 0.8;
          g.beginPath();
          for (let k = 0; k <= 8; k++) { const yy = Y - ry - (ph0 * 1.4 + k * 0.12) * F.k, xx = X + (s - 1) * rx * 0.45 + Math.sin(k * 0.9 + t * 3 + s) * 0.12 * F.k; k ? g.lineTo(xx, yy) : g.moveTo(xx, yy); }
          g.stroke();
        }
        g.restore();
      });
    }
    pine(F, I, 0.7, 0.8, 1.0, 1); pine(F, I, 11.3, 0.8, 1.05, 2); pine(F, I, 10.6, 0.5, 0.7, 3);
    bush(F, I, phone ? 10.8 : 0.7, 9.2, 0.85); lamp(F, I, phone ? 11.2 : 0.6, phone ? 8.0 : 2.6);
    lawn(F, I, 9.6, 0.2, 2.2, 2.0); flowers(F, I, phone ? 9.6 : 11.0, phone ? 7.8 : 2.2, 11);
    stones(F, I, phone ? [[10.2, 6.0], [10.7, 6.7], [11.2, 7.4]] : [[11.4, 3.6], [11.4, 4.4], [11.4, 5.2]]);
    // Callouts: leaders to the parts, cards in a column.
    later(F, st, () => {
      const { W, H, tall, square } = F;
      let cards;
      if (tall) cards = { x: 90 * u, ys: [H * 0.72, H * 0.79, H * 0.86], right: true };
      else if (square) cards = { x: 70 * u, ys: [H * 0.74, H * 0.82, H * 0.9], right: true };
      else cards = { x: W * 0.665, ys: [H * 0.43, H * 0.6, H * 0.77], right: false };
      const g = F.g;
      let gx = 0;
      if (cards.right) {
        for (const s of d.callouts) { if (!s) continue; const [size, tw] = fitSize(g, s, 46 * u, W - 2 * cards.x - 120 * u, 42 * u); gx = Math.max(gx, cards.x + tw + size * 1.8 + 50 * u); }
      }
      d.callouts.forEach((s, i) => {
        const cq2 = stg(qc, i, 3, 0.5);
        if (cards.right) callout(F, s, anchors[i][0], anchors[i][1], cards.x + (gx - 50 * u - cards.x), cards.ys[i], cq2, { right: true, gx, maxW: W - 2 * cards.x - 120 * u });
        else callout(F, s, anchors[i][0], anchors[i][1], cards.x, cards.ys[i], cq2, { maxW: W - cards.x - 60 * u });
      });
      // A pointer gliding between the parts.
      if (qc > 0.6) pointer(F, anchors, t);
    });
  }
  function pointer(F, anchors, t) {
    const n = anchors.length, ph = (t * 0.32) % n, i = Math.floor(ph), k = inout(clamp((ph - i) * 1.6));
    const a = anchors[i], b = anchors[(i + 1) % n];
    const X = lerp(a[0], b[0], k) + 26 * F.u, Y = lerp(a[1], b[1], k) + 20 * F.u - Math.sin(k * Math.PI) * 40 * F.u;
    const g = F.g, s = 1.25 * F.u;
    g.save(); g.translate(X, Y); g.scale(s, s);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 34); g.lineTo(9, 26); g.lineTo(16, 40); g.lineTo(22, 37); g.lineTo(15, 23); g.lineTo(27, 23); g.closePath();
    g.shadowColor = css(F.T.deep, 0.3); g.shadowBlur = 10; g.shadowOffsetY = 5;
    g.fillStyle = css(F.T.white); g.fill(); g.shadowColor = "transparent";
    g.strokeStyle = css(F.T.ink); g.lineWidth = 2.4; g.lineJoin = "round"; g.stroke();
    g.restore();
  }
  function proposalCard(F, I, x, y, z, w, d) {
    const T = F.T;
    box(F, I, x, y, z, w, d, 0.08, tone(F, T.white), { ao: false });
    onTop(F, I, x, y, z + 0.08, (g) => {
      g.fillStyle = css(F.acc); g.fillRect(0, 0, 0.16, d);
      g.fillStyle = css(T.lavender); rr(g, 0.4, d * 0.22, w * 0.55, d * 0.16, 0.05); g.fill();
      g.fillStyle = css(mixA(T.lavender, T.lite, 0.4)); rr(g, 0.4, d * 0.5, w * 0.4, d * 0.13, 0.05); g.fill();
      g.beginPath(); g.arc(w - 0.48, d * 0.5, 0.28, 0, TAU); g.fillStyle = css(F.acc); g.fill();
      g.strokeStyle = css(F.onAcc); g.lineWidth = 0.07; g.lineCap = "round";
      g.beginPath(); g.moveTo(w - 0.62, d * 0.5); g.lineTo(w - 0.52, d * 0.5 + 0.11); g.lineTo(w - 0.34, d * 0.5 - 0.12); g.stroke();
    });
  }
  function deskScreen(F, g, w, h, t, al) {
    const T = F.T;
    g.save(); g.globalAlpha *= al;
    rr(g, 0.18, 0.18, w - 0.36, h - 0.36, 0.14); g.fillStyle = css(T.screen); g.fill();
    // Preview.
    const px = 0.45, py = 0.42, pw = w - 0.9, ph = h * 0.5;
    g.save(); rr(g, px, py, pw, ph, 0.1); g.clip();
    const sky = g.createLinearGradient(0, py, 0, py + ph); sky.addColorStop(0, css(T.peach)); sky.addColorStop(1, css(T.butter)); g.fillStyle = sky; g.fillRect(px, py, pw, ph);
    g.beginPath(); g.arc(px + pw * 0.3, py + ph * (0.48 + 0.05 * Math.sin(t * 0.8)), ph * 0.2, 0, TAU); g.fillStyle = css(F.acc, 0.85); g.fill();
    for (let m = 0; m < 3; m++) {
      const bx = px + pw * (0.1 + m * 0.33) - fract(t * 0.05) * pw * 0.33, hh = ph * (0.45 + 0.12 * (m % 2));
      g.beginPath(); g.moveTo(bx, py + ph); g.lineTo(bx + pw * 0.22, py + ph - hh); g.lineTo(bx + pw * 0.44, py + ph); g.closePath(); g.fillStyle = css(m % 2 ? T.lavender : T.mintDeep); g.fill();
    }
    const cx = px + pw * fract(t * 0.07 + 0.3);
    g.fillStyle = css(T.white, 0.9); rr(g, cx, py + ph * 0.18, pw * 0.14, ph * 0.08, ph * 0.04); g.fill();
    g.restore();
    // Tracks.
    const ty = py + ph + 0.3, lh = (h - 0.36 - ty - 0.15) / 3;
    const clips = [[[0.2, 1.6], [2.0, 1.3], [3.55, 2.0, 1], [5.8, 1.9]], [[0.5, 2.2], [2.9, 1.5], [4.6, 2.6]], [[0.2, 3.0], [3.4, 1.8], [5.4, 2.2]]];
    clips.forEach((row, l) => row.forEach(([a, len, hot]) => {
      const x = px + a, ww = Math.min(len, px + pw - x);
      const pulse = hot ? 0.75 + 0.25 * Math.sin(t * 4) : 1;
      g.fillStyle = css(hot ? F.acc : [T.lavender, T.mint, T.sky][l], pulse);
      rr(g, x, ty + l * lh + lh * 0.14, ww, lh * 0.72, 0.06); g.fill();
    }));
    const phx = px + 0.2 + (pw - 0.4) * fract(t * 0.16);
    g.fillStyle = css(T.white); g.fillRect(phx - 0.03, ty - 0.15, 0.06, lh * 3 + 0.2);
    g.beginPath(); g.moveTo(phx - 0.14, ty - 0.22); g.lineTo(phx + 0.14, ty - 0.22); g.lineTo(phx, ty - 0.05); g.closePath(); g.fill();
    g.restore();
  }
  function phoneScreen(F, g, w, d, t, al) {
    const T = F.T;
    g.save(); g.globalAlpha *= al;
    rr(g, 0.22, 0.22, w - 0.44, d - 0.44, 0.45); g.fillStyle = css(T.screen); g.fill();
    rr(g, w / 2 - 0.6, 0.4, 1.2, 0.22, 0.11); g.fillStyle = css(T.deep); g.fill();
    const px = 0.5, py = 0.95, pw = w - 1.0, ph = 3.0;
    g.save(); rr(g, px, py, pw, ph, 0.2); g.clip();
    const sky = g.createLinearGradient(0, py, 0, py + ph); sky.addColorStop(0, css(T.sky)); sky.addColorStop(1, css(T.peach)); g.fillStyle = sky; g.fillRect(px, py, pw, ph);
    g.beginPath(); g.arc(px + pw * 0.65, py + ph * (0.4 + 0.05 * Math.sin(t)), 0.45, 0, TAU); g.fillStyle = css(T.butter); g.fill();
    g.beginPath(); g.moveTo(px, py + ph); for (let s = 0; s <= 12; s++) g.lineTo(px + (pw * s) / 12, py + ph * 0.72 - Math.sin(s * 0.9 + t * 0.8) * 0.25); g.lineTo(px + pw, py + ph); g.closePath(); g.fillStyle = css(T.mint); g.fill();
    g.restore();
    const rows = [[F.acc, 0.6, 2.2], [T.lavender, 0.3, 3.1], [T.sky, 0.5, 2.6]];
    rows.forEach(([c, a, len], l) => {
      const y = 4.3 + l * 0.72;
      g.fillStyle = css(T.white, 0.12); rr(g, px, y, pw, 0.5, 0.12); g.fill();
      g.fillStyle = css(c, l === 0 ? 0.75 + 0.25 * Math.sin(t * 4) : 1); rr(g, px + a, y + 0.06, Math.min(len, pw - a), 0.38, 0.1); g.fill();
    });
    const phx = px + 0.1 + (pw - 0.2) * fract(t * 0.2);
    g.fillStyle = css(T.white); g.fillRect(phx - 0.03, 4.2, 0.06, 2.3);
    for (let b = 0; b < 3; b++) { g.beginPath(); g.arc(px + pw * (0.2 + b * 0.3), 7.1, 0.3, 0, TAU); g.fillStyle = css(b === 1 ? F.acc : T.lavender, b === 1 ? 1 : 0.6); g.fill(); }
    g.restore();
  }

  // ---- people: a review table ---------------------------------------------------------------------------------------------
  function buildPeople(F, I, st, d) {
    const q = buildQ(F, st), t = F.t, T = F.T, u = F.u;
    const n = Math.max(2, Math.min(6, Math.round(d.count || 4)));
    const tcx = 6, tcy = 4.8;
    const qt = back(span(q, 0, 0.4));
    if (qt > 0) {
      cast(F, I, circ(tcx, tcy, 1.65, 12), 0, 0.92 * qt);
      put(F, I, tcx, tcy, 0, () => {
        cyl(F, I, tcx, tcy, 0, 0.42, 0.8 * qt, tone(F, T.white));
        cyl(F, I, tcx, tcy, 0.78 * qt, 1.65, 0.16, tone(F, T.lavender), { top: css(mixA(T.white, T.lavender, 0.25)) });
      });
      // The shared screen hovering over the table.
      const sq = back(span(q, 0.25, 0.6));
      if (sq > 0) {
        const z0 = 1.35 + 0.08 * Math.sin(t * 1.5), hh = 1.55 * sq;
        put(F, I, tcx + 0.1, tcy + 0.1, 1.2, () => {
          box(F, I, tcx - 1.25, tcy - 0.06, z0, 2.5, 0.12, hh, tone(F, T.deepSoft), { ao: false });
          if (sq > 0.5) onFaceY(F, I, tcx - 1.25, tcy + 0.06, z0 + hh, (g) => holoScreen(F, g, 2.5, hh, t));
          // Little tiles float up from the table.
          for (let k = 0; k < 5; k++) {
            const ph = fract(t * 0.35 + k / 5), zz = 1.0 + ph * 2.6, al = Math.sin(ph * Math.PI);
            const ax = tcx + Math.cos(k * 2.4) * 1.1, ay = tcy + Math.sin(k * 2.4) * 0.9;
            F.g.save(); F.g.globalAlpha *= al * 0.9;
            const s2 = 0.18;
            flat(F, I, rot(rect(ax - s2, ay - s2, s2 * 2, s2 * 2), ax, ay, t * 1.5 + k), zz, css([T.mint, T.peach, F.acc, T.sky, T.butter][k]));
            F.g.restore();
          }
        });
      }
    }
    // People around the table, in screen order left to right.
    const ppl = [];
    for (let i = 0; i < n; i++) {
      const ang = (225 - 150 + (300 * (i + 0.5)) / n) * (Math.PI / 180);
      const px = tcx + Math.cos(ang) * 3.5, py = tcy + Math.sin(ang) * 3.2;
      ppl.push({ i, px, py, sx: px - py });
    }
    ppl.sort((a, b) => a.sx - b.sx);
    const mid = n <= 3 ? 1 : Math.floor((n - 1) / 2);
    const badgeRanks = n <= 3 ? Array.from({ length: n }, (_, r) => r) : [0, mid, n - 1];
    const shirts = [T.sky, T.mintDeep, T.lavender, T.butter, T.peach, T.sky];
    ppl.forEach((p, r) => {
      const qi = stg(q, r, n, 0.55), hot = r === Math.min(mid, n - 1);
      if (qi <= 0) return;
      const face = Math.atan2(tcy - p.py, tcx - p.px) + 0.3 * Math.sin(t * 0.7 + r * 1.7);
      const bob = 0.03 * Math.sin(t * 2.1 + r);
      const drop = (1 - back(qi)) * 1.8;
      cast(F, I, circ(p.px, p.py, 0.55, 8), 0, 2.8 * clamp(qi * 2));
      put(F, I, p.px, p.py, 0, () => person(F, I, p.px, p.py, bob + drop, face, tone(F, hot ? F.acc : shirts[r % shirts.length]), r, hot, clamp(qi * 3)));
      if (hot) I.decor.push(() => { const k = fract(t * 0.7); ring(F, I, p.px, p.py, 0.04, 0.7 + k * 0.9, css(F.acc, 0.6 * (1 - k)), 3 * u); ring(F, I, p.px, p.py, 0.04, 0.62, css(F.acc, 0.7), 2.5 * u); });
      p.qi = qi; p.hot = hot; p.r = r;
    });
    later(F, st, () => {
      let topY = Infinity;
      for (const r of badgeRanks) { const p = ppl[r]; if (p) topY = Math.min(topY, lp(F, I, p.px, p.py, 3.0)[1]); }
      badgeRanks.forEach((r, b) => {
        const p = ppl[r];
        if (!p || !p.qi || !d.badges[b]) return;
        const [X, Y] = lp(F, I, p.px, p.py, 2.95);
        const lift = Y - topY + (b % 2 ? 110 : 40) * u;
        tag(F, d.badges[b], X, Y, { q: span(p.qi, 0.35, 0.85), lift, size: 44 * u, maxW: 300 * u, cube: p.hot ? F.acc : T.lavender, fill: p.hot ? F.acc : T.card, ink: p.hot ? F.onAcc : T.cardInk, dot: p.hot ? T.white : F.acc });
      });
    });
    pine(F, I, 0.7, 0.7, 1.1, 1); pine(F, I, 1.8, 0.5, 0.75, 2); pine(F, I, 11.3, 0.8, 0.9, 3);
    bush(F, I, 11.3, 9.3, 0.85); bush(F, I, 0.7, 9.3, 0.7, T.lawn); lamp(F, I, 11.4, 6.2); lamp(F, I, 0.6, 5.4);
    lawn(F, I, 0.2, 0.2, 2.6, 2.2); lawn(F, I, 9.4, 8.4, 2.4, 1.4);
    flowers(F, I, 10.4, 8.6, 21); flowers(F, I, 0.6, 7.2, 22);
  }
  function person(F, I, x, y, z, face, shirt, r, hot, al, sc = 1.45) {
    const T = F.T, g = F.g, t = F.t, k = F.k;
    g.save(); g.globalAlpha *= al;
    const pants = tone(F, T.pants), skin = tone(F, T.skin);
    const fx = Math.cos(face), fy = Math.sin(face), sx = -fy, sy = fx;
    const lw = 0.2 * sc, lh = 0.55 * sc;
    box(F, I, x + sx * 0.14 * sc - lw / 2, y + sy * 0.14 * sc - lw / 2, z, lw, lw, lh, pants, { ao: false, rim: false });
    box(F, I, x - sx * 0.14 * sc - lw / 2, y - sy * 0.14 * sc - lw / 2, z, lw, lw, lh, pants, { ao: false, rim: false });
    const sh = (s) => [x + sx * 0.4 * sc * s, y + sy * 0.4 * sc * s, z + 1.18 * sc];
    const arm = (s, wave) => {
      const [ax, ay, az] = sh(s);
      const hand = wave ? [ax + sx * 0.25 * sc * s + 0.14 * sc * Math.sin(t * 6), ay + sy * 0.25 * sc * s, az + 0.55 * sc] : [ax + fx * 0.15 * sc, ay + fy * 0.15 * sc, az - 0.55 * sc];
      const A = lp(F, I, ax, ay, az), B = lp(F, I, hand[0], hand[1], hand[2]);
      g.strokeStyle = shirt.left; g.lineWidth = 0.2 * sc * k; g.lineCap = "round";
      g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke();
      g.beginPath(); g.arc(B[0], B[1], 0.1 * sc * k, 0, TAU); g.fillStyle = skin.left; g.fill();
    };
    const waving = hot && Math.sin(t * 0.9) > 0.2;
    const backSide = sx + sy < 0 ? 1 : -1;
    arm(-backSide, false);
    cyl(F, I, x, y, z + 0.5 * sc, 0.38 * sc, 0.75 * sc, shirt);
    // A collar and a small badge dot on the chest.
    arm(backSide, waving);
    const [HX, HY, R] = ball(F, I, x, y, z + 1.62 * sc, 0.32 * sc, skin);
    const tip = lp(F, I, x + fx, y + fy, z + 1.62 * sc), vx = tip[0] - HX, vy = tip[1] - HY, vl = Math.hypot(vx, vy) || 1, ux = vx / vl, uy = vy / vl;
    g.save(); g.beginPath(); g.arc(HX, HY, R, 0, TAU); g.clip();
    g.beginPath(); g.arc(HX - ux * R * 0.6, HY - uy * R * 0.35 - R * 0.42, R * 0.95, 0, TAU); g.fillStyle = css(r % 3 === 1 ? T.bark : T.hair); g.fill();
    g.restore();
    if (uy > -0.35) {
      const ex = HX + ux * R * 0.42, ey = HY + uy * R * 0.25 + R * 0.12, px = -uy, py = ux;
      const blink = fract(t * 0.31 + r * 0.37) < 0.04 ? 0.25 : 1;
      g.fillStyle = css(T.ink);
      for (const s of [-1, 1]) { g.beginPath(); g.ellipse(ex + px * s * R * 0.3, ey + py * s * R * 0.12, R * 0.09, R * 0.09 * blink, 0, 0, TAU); g.fill(); }
    }
    g.restore();
  }
  function holoScreen(F, g, w, h, t) {
    const T = F.T;
    rr(g, 0.08, 0.08, w - 0.16, h - 0.16, 0.08); g.fillStyle = css(T.screen); g.fill();
    const ph = h - 0.55;
    g.save(); rr(g, 0.16, 0.16, w - 0.32, ph, 0.06); g.clip();
    const sky = g.createLinearGradient(0, 0.16, 0, 0.16 + ph); sky.addColorStop(0, css(T.lavender)); sky.addColorStop(1, css(T.peach)); g.fillStyle = sky; g.fillRect(0.16, 0.16, w - 0.32, ph);
    for (let b = 0; b < 9; b++) { const hh = (0.2 + 0.5 * Math.abs(Math.sin(t * 3 + b * 0.9))) * ph * 0.5; g.fillStyle = css(T.white, 0.55); g.fillRect(0.3 + b * 0.22, 0.16 + ph - hh - 0.05, 0.12, hh); }
    g.restore();
    const pulse = 1 + 0.12 * Math.sin(t * 3);
    g.beginPath(); const cx = w / 2, cy = 0.16 + ph / 2, s = 0.22 * pulse; g.moveTo(cx - s * 0.7, cy - s); g.lineTo(cx + s, cy); g.lineTo(cx - s * 0.7, cy + s); g.closePath(); g.fillStyle = css(F.acc); g.fill();
    g.fillStyle = css(T.white, 0.25); g.fillRect(0.2, h - 0.3, w - 0.4, 0.07);
    g.fillStyle = css(F.acc); g.fillRect(0.2, h - 0.3, (w - 0.4) * fract(t * 0.2), 0.07);
  }

  // ---- process: an assembly line ----------------------------------------------------------------------------------------
  function buildProcess(F, I, st, d) {
    const q = buildQ(F, st), t = F.t, T = F.T, u = F.u;
    const r2 = Math.SQRT1_2, ex = r2, ey = -r2, fx = r2, fy = r2; // e: along the line, f: toward us
    const C = (s, o = 0) => [6 + ex * s + fx * o, 5 + ey * s + fy * o];
    const half = 5.4, qb = ease(span(q, 0, 0.35)), L = half * qb;
    const SPEED = 0.85, GAPI = 2.6, stations = [-3.6, 0, 3.6];
    // The belt.
    if (qb > 0) {
      const foot = [C(-L, -0.68), C(L, -0.68), C(L, 0.68), C(-L, 0.68)];
      put(F, I, 6, 5, 0, () => {
        prism(F, I, foot, 0.12, 0.38, tone(F, T.deepSoft));
        const g = F.g;
        g.save(); poly(g, foot.map((p) => lp(F, I, p[0], p[1], 0.5))); g.clip();
        g.strokeStyle = css(T.lite, 0.35); g.lineWidth = Math.max(1, 0.06 * F.k);
        g.beginPath();
        for (let k = 0; k < 20; k++) { const s = -half + fract(((t * SPEED) + k * 0.55) / 11) * 11; if (Math.abs(s) > L) continue; const a = lp(F, I, ...C(s, -0.62), 0.5), b = lp(F, I, ...C(s, 0.62), 0.5); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
        g.stroke(); g.restore();
        // Legs.
        for (let s = -half + 0.6; s <= half - 0.5; s += 2.4) if (Math.abs(s) < L) { const [lx, ly] = C(s, 0.45); box(F, I, lx - 0.1, ly - 0.1, 0, 0.2, 0.2, 0.12, tone(F, T.deepSoft), { rim: false, ao: false }); }
      });
      cast(F, I, foot, 0.12, 0.38);
    }
    // Items riding the belt, changing at each station.
    const itemQ = span(q, 0.45, 0.75);
    const items = [];
    if (itemQ > 0) for (let k = 0; k < 5; k++) {
      const s = -half + fract((t * SPEED + k * GAPI) / (half * 2)) * half * 2;
      const edge = Math.min(1, (half - Math.abs(s)) / 0.6);
      if (edge <= 0) continue;
      items.push(s);
      const sz = 0.74 * edge * itemQ, [cx, cy] = C(s, 0);
      const stage = s < stations[0] ? 0 : s < stations[1] ? 1 : s < stations[2] ? 2 : 3;
      const base = [T.white, T.lavender, T.mintDeep, F.acc][stage];
      put(F, I, cx, cy, 0.5, () => {
        const tn = tone(F, base);
        box(F, I, cx - sz / 2, cy - sz / 2, 0.5, sz, sz, sz, tn);
        if (stage >= 1 && sz > 0.3) onTop(F, I, cx - sz / 2, cy - sz / 2, 0.5 + sz, (g) => {
          if (stage === 3) { g.strokeStyle = css(F.onAcc); g.lineWidth = 0.09; g.lineCap = "round"; g.beginPath(); g.moveTo(sz * 0.25, sz * 0.5); g.lineTo(sz * 0.42, sz * 0.68); g.lineTo(sz * 0.75, sz * 0.3); g.stroke(); }
          else { g.fillStyle = css(T.lite, 0.8); g.fillRect(sz * 0.2, sz * 0.3, sz * 0.6, 0.07); if (stage === 2) g.fillRect(sz * 0.2, sz * 0.55, sz * 0.4, 0.07); }
        });
      });
    }
    // Station timing: each acts when an item passes under it.
    const near = (s0) => { let best = 9; for (const s of items) best = Math.min(best, Math.abs(s - s0)); return best; };
    const tops = [];
    stations.forEach((s0, i) => {
      const qi = back(stg(span(q, 0.15, 1), i, 3, 0.5));
      if (qi <= 0) return;
      const [bx, by] = C(s0, -1.95);
      const body = tone(F, [T.lavender, T.mint, T.peach][i]);
      const bh = [1.7, 1.3, 2.7][i] * qi, hb = 0.95;
      cast(F, I, rect(bx - hb, by - hb, hb * 2, hb * 2), 0, bh);
      put(F, I, bx, by, 0, () => {
        box(F, I, bx - hb, by - hb, 0, hb * 2, hb * 2, bh, body);
        if (i === 0 && qi > 0.6) onFaceY(F, I, bx - hb, by + hb, bh - 0.25, (g) => {
          rr(g, 0.15, 0, 1.3, 0.85, 0.08); g.fillStyle = css(T.screen); g.fill();
          for (let l = 0; l < 4; l++) { const w = 0.3 + 0.7 * hash(l, Math.floor(t * 3 + l)); g.fillStyle = css(l === 1 ? F.acc : T.mint, 0.9); g.fillRect(0.3, 0.12 + l * 0.17, w, 0.08); }
        });
      });
      tops.push([i, bx, by, bh, qi]);
      const act = clamp(1 - near(s0) / 0.9);
      if (i === 0 && qi > 0.5) {
        // A scanning gate over the belt.
        const p1 = C(s0, -0.98), p2 = C(s0, 0.98);
        for (const [px, py] of [p1, p2]) { cast(F, I, rect(px - 0.1, py - 0.1, 0.2, 0.2), 0, 2.0); put(F, I, px, py, 0, () => box(F, I, px - 0.1, py - 0.1, 0, 0.2, 0.2, 2.0, tone(F, T.white))); }
        const bar = [C(s0 - 0.18, -1.13), C(s0 + 0.18, -1.13), C(s0 + 0.18, 1.13), C(s0 - 0.18, 1.13)];
        put(F, I, 6 + ex * s0 + 0.2, 5 + ey * s0 + 0.2, 2.0, () => {
          const off = 0.12 * Math.sin(t * 5);
          const g = F.g, a = lp(F, I, ...C(s0 + off, -0.65), 1.95), b = lp(F, I, ...C(s0 + off, 0.65), 1.95), c2 = lp(F, I, ...C(s0 + off, 0.65), 0.5), d2 = lp(F, I, ...C(s0 + off, -0.65), 0.5);
          poly(g, [a, b, c2, d2]); g.fillStyle = css(F.acc, 0.12 + 0.18 * act); g.fill();
          g.strokeStyle = css(F.acc, 0.9); g.lineWidth = 3 * F.u; g.beginPath(); g.moveTo(c2[0], c2[1]); g.lineTo(d2[0], d2[1]); g.stroke();
          prism(F, I, bar, 2.0, 0.28, tone(F, T.white));
        });
      }
      if (i === 1 && qi > 0.5) {
        // A jointed arm reaching over the belt.
        put(F, I, bx + 0.9, by + 0.9, bh, () => {
          const g = F.g, k = F.k, sw = Math.sin(t * 2.2) * 0.25 + act * 0.2;
          const S0 = [bx, by, bh + 0.2], E = [...C(s0 - 0.3, -0.9 + sw), bh + 1.3], Wr = [...C(s0, 0), 1.25 + 0.25 * (1 - act)];
          cyl(F, I, bx, by, bh, 0.36, 0.22, tone(F, T.white));
          const seg = (A, B, wdt) => { const a = lp(F, I, ...A), b = lp(F, I, ...B); g.lineCap = "round"; g.strokeStyle = css(T.deepSoftR); g.lineWidth = wdt * k; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.strokeStyle = css(T.white); g.lineWidth = wdt * k * 0.55; g.beginPath(); g.moveTo(a[0], a[1] - wdt * k * 0.12); g.lineTo(b[0], b[1] - wdt * k * 0.12); g.stroke(); return b; };
          seg(S0, E, 0.32); const tip = seg(E, Wr, 0.26);
          g.beginPath(); g.arc(tip[0], tip[1], 0.16 * k, 0, TAU); g.fillStyle = css(F.acc); g.fill();
          if (act > 0.3) for (let sp = 0; sp < 5; sp++) { const a = sp * 1.3 + t * 9, rr2 = (0.2 + 0.25 * fract(t * 3 + sp * 0.37)) * k; g.fillStyle = css(T.butter, act); g.fillRect(tip[0] + Math.cos(a) * rr2, tip[1] + 0.2 * k + Math.sin(a) * rr2 * 0.5, 0.07 * k, 0.07 * k); }
        });
      }
      if (i === 2 && qi > 0.5) {
        // A press that stamps each item as it passes.
        const arm = [C(s0 - 0.35, -1.2), C(s0 + 0.35, -1.2), C(s0 + 0.35, 0.4), C(s0 - 0.35, 0.4)];
        const pz = 1.35 + 0.75 * (1 - Math.pow(act, 0.6));
        put(F, I, 6 + ex * s0 + 0.3, 5 + ey * s0 + 0.3, 2.3, () => {
          const [cx, cy] = C(s0, 0);
          box(F, I, cx - 0.1, cy - 0.1, pz + 0.3, 0.2, 0.2, Math.max(0.01, 2.3 - pz - 0.3), tone(F, T.white), { rim: false });
          box(F, I, cx - 0.32, cy - 0.32, pz, 0.64, 0.64, 0.3, tone(F, F.acc));
          prism(F, I, arm, 2.3, 0.3, tone(F, T.peach));
          if (act > 0.7) { const k2 = (act - 0.7) / 0.3; ring(F, I, cx, cy, 0.52, 0.5 + (1 - k2) * 0.6, css(F.acc, 0.6 * k2), 3 * F.u); }
        });
      }
    });
    later(F, st, () => {
      for (const [i, bx, by, bh, qi] of tops) {
        const s = d.steps[i];
        if (!s) continue;
        const tq = span(qi, 0.55, 1.0);
        if (i === 1) { const [X, Y] = lp(F, I, ...C(stations[1], 0.7), 0.1); tag(F, s, X, Y, { q: tq, below: true, lift: 44 * u, badge: i + 1, size: 44 * u, maxW: (F.tall ? 520 : 460) * u }); }
        else { const [X, Y] = lp(F, I, bx, by, bh + (i === 0 ? 0.65 : 0.3)); tag(F, s, X, Y, { q: tq, lift: (i === 0 ? 70 : 40) * u, badge: i + 1, size: 44 * u, dx: (i === 0 ? -40 : 40) * u, maxW: (F.tall ? 420 : 460) * u }); }
      }
    });
    pine(F, I, 0.7, 0.7, 1.0, 1); pine(F, I, 1.6, 0.5, 0.7, 2); pine(F, I, 0.5, 1.7, 0.7, 3);
    crate(F, I, 9.9, 7.6, 0, 0.8, T.butter); crate(F, I, 10.9, 7.9, 0, 0.7, T.sky); bush(F, I, 11.3, 9.3, 0.8); lamp(F, I, 8.6, 9.4);
    lawn(F, I, 0.2, 0.2, 2.6, 2.4); lawn(F, I, 9.5, 8.8, 2.3, 1.0); flowers(F, I, 2.0, 2.4, 31);
  }

  // ---- compare: two stacks ----------------------------------------------------------------------------------------------------
  function buildCompare(F, I, st, d) {
    const q = buildQ(F, st), t = F.t, T = F.T, u = F.u;
    const r2 = Math.SQRT1_2, sep = 2.9;
    const centres = [[6 - r2 * sep, 5 + r2 * sep], [6 + r2 * sep, 5 - r2 * sep]];
    const vals = [Math.max(0, d.leftValue), Math.max(0, d.rightValue)], max = Math.max(vals[0], vals[1], 1e-9);
    const tops = [];
    centres.forEach(([cx, cy], s) => {
      const qs = span(q, s * 0.3, s * 0.3 + 0.7);
      if (qs <= 0) return;
      const pf = 2.6, tf = 2.0, step = 0.42, tile = 0.34;
      const N = vals[s] > 0 ? Math.max(1, Math.round(13 * (vals[s] / max))) : 0;
      const pq = back(span(qs, 0, 0.25));
      cast(F, I, rect(cx - pf / 2, cy - pf / 2, pf, pf), 0, 0.45 * pq);
      put(F, I, cx, cy, 0, () => box(F, I, cx - pf / 2, cy - pf / 2, 0, pf, pf, 0.45 * pq, tone(F, T.white)));
      const tn = tone(F, s ? F.acc : T.grey);
      let topZ = 0.45;
      for (let k = 0; k < N; k++) {
        const kq = span(qs, 0.15 + (k / Math.max(1, N)) * 0.6, 0.3 + (k / Math.max(1, N)) * 0.6);
        if (kq <= 0) break;
        const z = 0.45 + k * step + (1 - ease(kq)) * 3.2;
        const wob = s === 0 ? 0.06 * Math.sin(t * 2.3 + k * 0.6) * (k / Math.max(1, N)) : 0;
        const x = cx - tf / 2 + wob, y = cy - tf / 2 - wob * 0.5;
        cast(F, I, rect(x, y, tf, tf), z, tile);
        put(F, I, cx, cy, z, () => {
          F.g.save(); F.g.globalAlpha *= clamp(kq * 4);
          box(F, I, x, y, z, tf, tf, tile, tn, { ao: false });
          F.g.restore();
        });
        topZ = z + tile;
      }
      tops.push([s, cx, cy, topZ, qs]);
      if (s === 1 && N > 0) I.decor.push(() => { for (let r = 0; r < 2; r++) { const k = fract(t * 0.5 + r * 0.5); ring(F, I, cx, cy, 0.47, 1.5 + k * 1.3, css(F.acc, 0.55 * (1 - k)), 3 * u); } });
    });
    // Sparkles around the second stack.
    const sp = tops.find((v) => v[0] === 1);
    if (sp) put(F, { ...I, air: true }, sp[1], sp[2], sp[3], () => {
      const g = F.g;
      for (let k = 0; k < 6; k++) {
        const ph = fract(t * 0.5 + k / 6), a = k * 1.05 + t * 0.4, R = 1.4 + 0.3 * Math.sin(k);
        const [X, Y] = lp(F, I, sp[1] + Math.cos(a) * R, sp[2] + Math.sin(a) * R, sp[3] * (0.3 + 0.7 * hash(k, 3)) + ph * 0.8);
        const s2 = (0.12 + 0.1 * Math.sin(ph * Math.PI)) * F.k;
        g.save(); g.globalAlpha *= Math.sin(ph * Math.PI); g.fillStyle = css(k % 2 ? T.butter : F.acc);
        g.beginPath(); g.moveTo(X, Y - s2); g.lineTo(X + s2 * 0.3, Y - s2 * 0.3); g.lineTo(X + s2, Y); g.lineTo(X + s2 * 0.3, Y + s2 * 0.3); g.lineTo(X, Y + s2); g.lineTo(X - s2 * 0.3, Y + s2 * 0.3); g.lineTo(X - s2, Y); g.lineTo(X - s2 * 0.3, Y - s2 * 0.3); g.closePath(); g.fill();
        g.restore();
      }
    });
    later(F, st, () => {
      for (const [s, cx, cy, topZ, qs] of tops) {
        const [X, Y] = lp(F, I, cx, cy, topZ + 0.2);
        const v = vals[s] * ease(span(qs, 0.15, 0.85));
        tag(F, fmt(v, d), X, Y, { q: span(qs, 0.2, 0.6), size: 104 * u, min: 96 * u, maxW: 420 * u, lift: 40 * u, icon: false, dx: (s ? 60 : -60) * u, fill: s ? F.acc : F.T.card, ink: s ? F.onAcc : F.T.cardInk, dot: s ? F.T.card : F.acc });
        const [LX, LY] = lp(F, I, cx + 1.3, cy + 1.3, 0);
        const lab = s ? d.right : d.left;
        if (lab) tag(F, lab, LX + (s ? 70 : -70) * u, LY + 16 * u, { q: span(qs, 0.2, 0.6), lift: 0, size: 46 * u, maxW: 360 * u, below: true, cube: s ? F.acc : T.grey, fill: css(F.T.card, 0.94) });
      }
    });
    pine(F, I, 0.7, 0.7, 1.1, 1); pine(F, I, 1.8, 0.6, 0.8, 2); pine(F, I, 11.3, 0.7, 0.9, 3); pine(F, I, 0.6, 1.9, 0.7, 4);
    bush(F, I, 11.3, 9.3, 0.85); bush(F, I, 10.4, 9.5, 0.6, T.lawn); lamp(F, I, 0.6, 9.0);
    lawn(F, I, 0.2, 0.2, 2.8, 2.6); lawn(F, I, 9.6, 0.2, 2.2, 2.2); flowers(F, I, 9.8, 8.4, 41);
  }

  const BUILD = { title: buildTitle, chart: buildChart, object: buildObject, people: buildPeople, process: buildProcess, compare: buildCompare };

  // ---- sky, far islands and finish ------------------------------------------------------------------------------------------------
  let grainTile = null, grainKey = "", shadowLayer = null;
  function sky(ctx, F) {
    const { W, H, T, t, u } = F;
    const gr = ctx.createLinearGradient(0, 0, W * 0.6, H * 1.1);
    gr.addColorStop(0, css(T.bg1)); gr.addColorStop(1, css(T.bg2));
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    // Soft colour fields drifting with the camera.
    const scroll = scrollOf(F);
    const blobs = [[0.18, 0.2, 0.55, T.blob1], [0.85, 0.3, 0.5, T.blob2], [0.6, 0.95, 0.6, T.blob3]];
    blobs.forEach(([bx, by, br, c], i) => {
      const X = W * bx - scroll[0] * 0.04 + Math.sin(t * 0.2 + i) * 40 * u, Y = H * by - scroll[1] * 0.04 + Math.cos(t * 0.17 + i) * 30 * u, R = Math.max(W, H) * br;
      const rg = ctx.createRadialGradient(X, Y, 0, X, Y, R);
      rg.addColorStop(0, css(c, 0.75)); rg.addColorStop(1, css(c, 0));
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    });
    if (T.night) {
      const r = rng(77);
      for (let i = 0; i < 90; i++) {
        const x = fract(r() - scroll[0] * 0.00002) * W, y = fract(r() - scroll[1] * 0.00002) * H, s = (0.6 + r() * 1.6) * u;
        ctx.fillStyle = css(T.lite, (0.25 + 0.5 * r()) * (0.6 + 0.4 * Math.sin(t * (1 + r() * 2) + i)));
        ctx.fillRect(x, y, s, s);
      }
    }
  }
  function scrollOf(F) { const c = F.cam; return [(c.fx - c.fy) * C30 * F.s, (c.fx + c.fy) * 0.5 * F.s]; }
  // Distant islands at a slower parallax, faded into the sky.
  function farIslands(ctx, F) {
    const { W, H, T, t } = F, scroll = scrollOf(F);
    const r = rng(311);
    const list = [];
    const n = F.tall ? 15 : F.square ? 12 : 10;
    for (let i = 0; i < n; i++) list.push({ x: r(), y: r(), s: 0.32 + r() * 0.22, kind: Math.floor(r() * 3), ph: r() * TAU });
    list.sort((a, b) => a.s - b.s);
    for (const f of list) {
      const par = f.s * 0.45;
      const X = ((f.x * W * 1.6 - scroll[0] * par) % (W * 1.6) + W * 1.6) % (W * 1.6) - W * 0.3;
      const Y = ((f.y * H * 1.5 - scroll[1] * par) % (H * 1.5) + H * 1.5) % (H * 1.5) - H * 0.25 + Math.sin(t * 0.8 + f.ph) * 8 * F.u;
      const Ff = { ...F, g: ctx, k: F.s * f.s * F.cam.z, cam: { fx: 0, fy: 0, fz: 0, ax: X, ay: Y } };
      const fk = 0.62 - f.s * 0.5;
      const I = { j: 0, ox: 0, oy: 0, z: 0 };
      box(Ff, I, -2, -1.6, -0.9, 4, 3.2, 0.9, tone(Ff, fog(F, T.island, fk)), { top: css(fog(F, T.islandTop, fk)), rim: false, ao: false });
      if (f.kind === 0) { const lt = tone(Ff, fog(F, T.mint, fk)); pyr(Ff, I, -0.8, -0.4, 0, 0.6, 1.0, lt); pyr(Ff, I, -0.8, -0.4, 0.55, 0.45, 0.9, lt); pyr(Ff, I, 0.6, 0.5, 0, 0.45, 0.8, lt); }
      else if (f.kind === 1) { box(Ff, I, -0.9, -0.8, 0, 1.4, 1.4, 1.6 + f.s, tone(Ff, fog(F, T.lavender, fk)), { rim: false, ao: false }); box(Ff, I, 0.7, 0.2, 0, 0.8, 0.8, 0.8, tone(Ff, fog(F, T.peach, fk)), { rim: false, ao: false }); }
      else { cyl(Ff, I, 0, 0, 0, 0.8, 0.5, tone(Ff, fog(F, T.sky, fk))); pyr(Ff, I, 1.2, -0.6, 0, 0.4, 0.8, tone(Ff, fog(F, T.mint, fk))); }
    }
  }
  // Flat-bottomed puff clouds drifting across the sky at their own parallax, so open sky is never still.
  function clouds(ctx, F) {
    const { W, H, T, t, u } = F, scroll = scrollOf(F), r = rng(907);
    const n = F.tall ? 9 : 7, spanX = W + 900 * u, spanY = H * 1.3;
    const top = T.night ? mixA(T.islandTop, T.bg1, 0.25) : rgb(T.lite);
    const low = T.night ? mixA(T.island, T.bg2, 0.3) : mixA(T.island, T.lite, 0.25);
    for (let i = 0; i < n; i++) {
      const s = (0.6 + r() * 0.8) * u * (F.tall ? 1.15 : 1), par = 0.05 + r() * 0.12, sp = (14 + r() * 22) * u;
      const x0 = r() * spanX, y0 = r() * spanY, puffs = 3 + Math.floor(r() * 3), seed = r() * 100;
      const X = ((x0 + t * sp - scroll[0] * par) % spanX + spanX) % spanX - 450 * u;
      const Y = ((y0 - scroll[1] * par) % spanY + spanY) % spanY - H * 0.15 + Math.sin(t * 0.5 + seed) * 6 * u;
      const w = 230 * s, al = (T.night ? 0.5 : 0.92) * (0.75 + 0.25 * Math.sin(seed));
      ctx.save(); ctx.globalAlpha = al;
      // The cloud's shaded underside: a thick lavender slab under the flat base.
      ctx.fillStyle = css(low); rr(ctx, X - w * 0.74, Y - 6 * s, w * 1.48, 22 * s, 11 * s); ctx.fill();
      ctx.beginPath(); ctx.rect(X - w, Y - w, w * 2, w);
      ctx.clip();
      const gr = ctx.createLinearGradient(0, Y - w * 0.55, 0, Y);
      gr.addColorStop(0, css(top)); gr.addColorStop(1, css(mixA(top, low, 0.35)));
      ctx.fillStyle = gr; ctx.beginPath();
      for (let k = 0; k < puffs; k++) {
        const fx = (k / (puffs - 1) - 0.5) * w * 1.25, R = w * (0.24 + 0.2 * Math.sin(Math.PI * (k + 0.5) / puffs)) * (0.85 + 0.3 * hash(seed, k));
        ctx.moveTo(X + fx + R, Y); ctx.arc(X + fx, Y, R, 0, TAU);
      }
      ctx.fill();
      ctx.restore();
    }
  }
  function grainOf(F) {
    const key = F.T.id;
    if (grainTile && grainKey === key) return grainTile;
    const N = 256, c = document.createElement("canvas"); c.width = c.height = N;
    const g = c.getContext("2d"), img = g.createImageData(N, N), r = rng(19);
    for (let i = 0; i < N * N; i++) { const v = r(); const on = v > 0.5 ? 255 : 0; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = on; img.data[i * 4 + 3] = Math.abs(v - 0.5) * 2 * 34; }
    g.putImageData(img, 0, 0);
    grainKey = key;
    return (grainTile = c);
  }
  function finish(ctx, F) {
    const { W, H, T, u } = F, tex = F.S.look.texture;
    // Sunlight from the upper left, and a gentle falloff at the edges.
    const lg = ctx.createRadialGradient(W * 0.12, -H * 0.1, 0, W * 0.12, -H * 0.1, Math.hypot(W, H));
    lg.addColorStop(0, css(T.lite, T.sun)); lg.addColorStop(0.5, css(T.lite, 0)); lg.addColorStop(1, css(T.deep, T.vignette));
    ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
    if (tex > 0 && F.S.paint) {
      const tile = grainOf(F), off = (Math.floor(F.t * 12) * 53) % 256;
      ctx.save(); ctx.globalAlpha = 0.38 * tex;
      const pat = ctx.createPattern(tile, "repeat");
      ctx.translate(-off, -((off * 3) % 256)); ctx.fillStyle = pat; ctx.fillRect(off, (off * 3) % 256, W, H);
      ctx.restore();
    }
    void u;
  }
  // A veil behind the statement scenes keeps the words clear of the world.
  function veil(ctx, F, k) {
    if (k <= 0) return;
    const { W, H, T, tall, square } = F;
    ctx.save(); ctx.globalAlpha = k;
    if (tall || square) {
      const gr = ctx.createLinearGradient(0, H * 0.28, 0, H * 0.72);
      gr.addColorStop(0, css(T.bg1, 0)); gr.addColorStop(0.3, css(T.bg1, 0.78)); gr.addColorStop(0.7, css(T.bg1, 0.78)); gr.addColorStop(1, css(T.bg1, 0));
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    } else {
      const gr = ctx.createLinearGradient(0, 0, W * 0.56, 0);
      gr.addColorStop(0, css(T.bg1, 0.88)); gr.addColorStop(0.5, css(T.bg1, 0.62)); gr.addColorStop(1, css(T.bg1, 0));
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  // ---- the frame ------------------------------------------------------------------------------------------------------------------
  function render(ctx, S, info) {
    const { W, H, u } = S, look = S.look;
    const plan = planOf(S, info);
    const t = clamp(info.t, 0, Math.max(plan.length, 0.001) - 1e-4);
    const F = {
      S, W, H, u, tall: S.tall, square: S.square, T: look.world, t, plan, g: ctx, s: scaleOf(S),
      acc: S.accent, onAcc: look.onAccent, items: [], shadows: [], tags: [], tops: [],
    };
    F.cam = camera(F);
    F.k = F.s * F.cam.z;
    const T = F.T;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (S.paint) { sky(ctx, F); farIslands(ctx, F); clouds(ctx, F); }
    // Build every island's contents for this instant, then draw far to near.
    const islands = [];
    for (let j = 0; j < plan.islands; j++) islands.push(islandOf(F, j));
    const sceneOf = (j) => plan.shown.find((st) => st.island === j);
    const closing = plan.shown.find((st) => st.id === "closing");
    const fin = closing ? clamp((t - closing.start - 0.3) / 1.4) : 0;
    // Only islands near the view are built.
    const vis = islands.filter((I) => { const c = lp(F, I, IW / 2, ID / 2, 0); return c[0] > -W * 0.8 && c[0] < W * 1.8 && c[1] > -H * 0.9 && c[1] < H * 1.9; });
    for (const I of vis) {
      const st = sceneOf(I.j);
      if (st && BUILD[st.id]) BUILD[st.id](F, I, st, plan.data[st.id]);
      if (fin > 0) flag(F, I, 1.5, 3.2, stg(fin, I.j, Math.max(1, plan.islands), 0.5));
    }
    const order = vis.slice().sort((a, b) => b.j - a.j);
    for (const I of order) {
      drawIsland(F, I);
      const nearer = islands[I.j - 1];
      if (nearer) { const BI = drawBridge(F, nearer, I); tram(F, BI); }
    }
    // Long soft shadows on the island tops.
    if (!shadowLayer || shadowLayer.width !== W || shadowLayer.height !== H) { shadowLayer = document.createElement("canvas"); shadowLayer.width = W; shadowLayer.height = H; }
    const sg = shadowLayer.getContext("2d");
    sg.setTransform(1, 0, 0, 1, 0, 0); sg.globalCompositeOperation = "source-over"; sg.clearRect(0, 0, W, H);
    sg.fillStyle = "#000";
    for (const sh of F.shadows) { poly(sg, sh.pts.map((p) => lp(F, sh.I, p[0], p[1], sh.z))); sg.fill(); }
    sg.globalCompositeOperation = "destination-in";
    sg.beginPath(); for (const top of F.tops) { sg.moveTo(top[0][0], top[0][1]); for (let i = 1; i < top.length; i++) sg.lineTo(top[i][0], top[i][1]); sg.closePath(); }
    sg.fillStyle = "#000"; sg.fill();
    sg.globalCompositeOperation = "source-in"; sg.fillStyle = css(T.shadow); sg.fillRect(0, 0, W, H);
    sg.globalCompositeOperation = "source-over";
    ctx.save(); ctx.globalAlpha = T.shadowA; ctx.filter = `blur(${Math.max(1, Math.round(5 * u * F.cam.z))}px)`; ctx.drawImage(shadowLayer, 0, 0); ctx.restore();
    // Solids, far to near.
    F.items.sort((a, b) => (b.grp - a.grp) || (a.k - b.k) || (a.n - b.n));
    for (const it of F.items) { ctx.save(); it.fn(); ctx.restore(); }
    // Statement scenes: a veil behind the words; then the closing confetti.
    const title = plan.shown.find((st) => st.id === "title");
    let vk = 0;
    if (title) vk = Math.max(vk, 0.55 * (1 - span(t, title.start + title.hold - 0.45, title.start + title.hold)));
    if (closing) vk = Math.max(vk, span(t, closing.start - 0.1, closing.start + 0.6));
    if (S.paint) veil(ctx, F, vk);
    if (fin > 0) confetti(ctx, F, vis, fin);
    // Labels belong to the scene on screen: they arrive with it and leave with its headline.
    const last = plan.shown[plan.shown.length - 1];
    for (const { st, fn } of F.tags) {
      const a = span(t, st.start - 0.25, st.start + 0.25) * (st === last ? 1 : 1 - span(t, st.start + st.hold - plan.change, st.start + st.hold - 0.05));
      if (a <= 0) continue;
      ctx.save(); ctx.globalAlpha = a; fn(); ctx.restore();
    }
    if (S.paint) finish(ctx, F);
    ctx.restore();
  }
  // Pastel tiles drifting up from every island at the finish.
  function confetti(ctx, F, vis, fin) {
    const T = F.T, t = F.t, cols = [T.mint, T.peach, F.acc, T.sky, T.butter, T.lavender];
    for (const I of vis) for (let k = 0; k < 9; k++) {
      const ph = fract(t * 0.28 + hash(I.j, k) ), x = 1 + hash(k, I.j, 1) * 10, y = 1 + hash(I.j, k, 2) * 8, z = 0.5 + ph * 7;
      const [X, Y] = lp(F, I, x, y, z), s = (0.45 + 0.25 * hash(k, 5)) * F.k, flip = Math.cos(t * 2.5 + k);
      ctx.save(); ctx.globalAlpha = Math.sin(ph * Math.PI) * fin * 0.9; ctx.translate(X, Y); ctx.scale(flip, 1);
      ctx.beginPath(); ctx.moveTo(0, -s * 0.5); ctx.lineTo(s * C30, 0); ctx.lineTo(0, s * 0.5); ctx.lineTo(-s * C30, 0); ctx.closePath();
      ctx.fillStyle = css(cols[(k + I.j) % cols.length]); ctx.fill(); ctx.restore();
    }
  }

  // ---- palettes ------------------------------------------------------------------------------------------------------------------------
  const WORLD = {
    id: "orig", bg1: "#fdf0e7", bg2: "#e6e2f7", blob1: "#ffe1d0", blob2: "#dcd6fb", blob3: "#d9f2e8",
    lite: "#ffffff", deep: "#3b3470", topLift: 0.42, leftLift: 0.06, rightDrop: 0.2, ao: 0.1,
    island: "#cdc6f2", islandDeep: "#aba2e4", islandTop: "#f8f5fd", islandBand: "#ebe6fb",
    lawn: "#c4ecd9", stone: "#e7e1f6", lavender: "#b9b0f3", mint: "#a7e3cb", mintDeep: "#86d2b5", peach: "#ffcdb0", butter: "#fde3a0", sky: "#b9d6f8",
    white: "#f4f1fb", grey: "#cfcae6", bark: "#a38bb5", skin: "#f8cfb6", hair: "#4a4280", pants: "#6f67b0", deepSoft: "#8f86cf", deepSoftR: "#6f66b4",
    screen: "#36306a", window: "#fff3c4", shadow: "#4b3f9a", shadowA: 0.3, dropA: 0.16,
    ink: "#2b2650", card: "#ffffff", cardInk: "#2b2650", sun: 0.18, vignette: 0.08, night: false,
  };
  const halo = (c) => () => `0 0 2px ${c}, 0 0 18px ${c}, 0 0 36px ${c}`;
  const PAL = {
    light: { ...WORLD, id: "light", bg1: "#f6fbff", bg2: "#e3f1f4", blob1: "#e3f6ef", blob2: "#e6ecff", blob3: "#fff1e4",
      island: "#c6e4ea", islandDeep: "#a3cfd9", islandTop: "#fbfdfe", islandBand: "#e6f4f6", lavender: "#c3cbf6", mint: "#a9e6cf", sky: "#b4dcf6", peach: "#ffd6bd",
      shadow: "#3e6f86", deep: "#2f4f6b", deepSoft: "#86aecb", deepSoftR: "#6b94b4", screen: "#2f4a66", pants: "#5f86a8", hair: "#3c4f78", ink: "#1f3550", cardInk: "#1f3550" },
    dark: { ...WORLD, id: "dark", bg1: "#221f45", bg2: "#14122c", blob1: "#3a2d63", blob2: "#1d3354", blob3: "#3a2447",
      lite: "#e9e5ff", deep: "#0b0a1c", topLift: 0.28, leftLift: 0.0, rightDrop: 0.32, ao: 0.18,
      island: "#5b55a0", islandDeep: "#433d82", islandTop: "#7a74bc", islandBand: "#8c86cc", lawn: "#4f8f88", stone: "#8b85c8",
      lavender: "#8e85dc", mint: "#5fb59b", mintDeep: "#4c9c85", peach: "#e59f86", butter: "#e8c574", sky: "#6f9ad6", white: "#cdc8ef", grey: "#77729f",
      bark: "#6c5a86", skin: "#e9b89f", hair: "#1d1938", pants: "#3a3474", deepSoft: "#4a438c", deepSoftR: "#3a3474", screen: "#151230", window: "#ffd98a",
      shadow: "#05040f", shadowA: 0.42, dropA: 0.35, ink: "#f3f1ff", card: "#2f2a5c", cardInk: "#f3f1ff", sun: 0.06, vignette: 0.25, night: true },
    mono: { ...WORLD, id: "mono", bg1: "#f4f4f2", bg2: "#e2e2df", blob1: "#ececea", blob2: "#dcdcd9", blob3: "#ebebe8", deep: "#2a2a2a",
      island: "#cfcfcc", islandDeep: "#b4b4b0", islandTop: "#fafaf8", islandBand: "#e8e8e5", lawn: "#d7d7d3", stone: "#e4e4e1",
      lavender: "#c9c9c5", mint: "#d8d8d4", mintDeep: "#bdbdb9", peach: "#b9b9b5", butter: "#e6e6e2", sky: "#d0d0cc", white: "#f2f2f0", grey: "#d6d6d2",
      bark: "#8a8a86", skin: "#e2e2de", hair: "#4a4a48", pants: "#6f6f6c", deepSoft: "#8f8f8b", deepSoftR: "#737370", screen: "#3a3a39", window: "#ffffff",
      shadow: "#2a2a2a", ink: "#222222", cardInk: "#222222" },
  };
  const tokens = (W0) => ({
    bg: W0.bg1, panel: W0.card, ink: W0.ink, muted: W0.night ? "#bdb8e8" : "#6e6898", rule: css(W0.deep, 0.3), track: css(W0.deep, 0.1),
    textShadow: halo(W0.night ? "rgba(20,18,44,0.9)" : css(W0.bg1, 0.95)), backdrop: () => W0.bg1, world: W0,
  });

  const scene = (id) => (ctx, S, box0, p, d) => { if (d) seen[id] = d; };
  return {
    ...tokens(WORLD),
    accent: "#ff6b5b", onAccent: "#ffffff",
    display: FONT, displayWeight: 800, displayTracking: "-0.015em",
    body: FONT, bodyWeight: 600, figures: FONT,
    radius: 22, motion: "rise", change: "fade",
    kit: { line: 3, fill: "solid", panel: "fill" },
    panelEdge: "transparent",
    keepArt: true,
    overlap: false,
    palettes: {
      // Light: an airy morning in mint and sky. Dark: the islands at night, windows lit. Mono: grey clay with one dark accent.
      light: { ...tokens(PAL.light), accent: "#ff6f61" },
      dark: { ...tokens(PAL.dark), accent: "#ff7a6b" },
      mono: { ...tokens(PAL.mono), accent: "#2b2b2b", onAccent: "#ffffff" },
    },
    css: (accent, look) => `
      #root .kicker { align-self: flex-start; font-size: 42px !important; letter-spacing: 0.06em; color: ${look.onAccent}; background: ${accent};
        padding: 0.28em 0.75em; border-radius: 999px; text-shadow: none; box-shadow: 0 14px 30px ${css(look.world.deep, 0.18)}; }
      #root[data-width="1920"] #title, #root[data-width="1920"] #closing { max-width: 1040px; }
      #root .display { color: ${look.ink}; }
    `,
    // The sky is painted by the stage so it can move with the camera; this pass only marks the backdrop as on.
    paint: (ctx, W, H) => { ctx.clearRect(0, 0, W, H); },
    stage(ctx, S, info) { render(ctx, S, info); },
    scenes: { title: scene("title"), chart: scene("chart"), object: scene("object"), people: scene("people"), process: scene("process"), compare: scene("compare"), closing: scene("closing") },
  };
});
