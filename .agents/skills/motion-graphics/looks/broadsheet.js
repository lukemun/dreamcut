// Broadsheet: a newspaper data page. Warm salmon newsprint with fibre, a faint halftone screen,
// show-through from the reverse side and a horizontal fold; a serif nameplate and double rule on top,
// a scrolling wire of figures and a source line at the foot. Each scene is a figure further down the
// page: hairline grids, warm-grey context and one claret series, direct labels, italic annotations
// with drawn arrows and a side column of key numbers. Between figures the page scrolls up beneath the
// fixed nameplate. Every drawing is original. Frames are pure functions of time (seeded noise only).
window.DreamcutMotion.register("broadsheet", ({ hexA, rng }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const inout = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const span = (v, a, b) => clamp((v - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const SERIF = "Charter, 'Bitstream Charter', 'Iowan Old Style', 'Source Serif 4', Georgia, serif";
  const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  const DRAWN = ["chart", "object", "people", "process", "compare"];
  const HEADS = { title: "title", chart: "chart-title", object: "object-title", people: "people-title", process: "process-title", compare: "compare-title", closing: "closing" };

  // ---- deterministic noise ---------------------------------------------------------------------------
  const hash = (i, s) => {
    let x = Math.imul((i | 0) ^ Math.imul((s | 0) + 1, 0x27d4eb2d), 0x9e3779b1);
    x ^= x >>> 15; x = Math.imul(x, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  };
  const noise = (x, s) => { const i = Math.floor(x), f = x - i, k = f * f * (3 - 2 * f); return lerp(hash(i, s), hash(i + 1, s), k); };

  // ---- drawing helpers ------------------------------------------------------------------------------
  const pen = (g, color, w, dash) => { g.strokeStyle = color; g.lineWidth = w; g.setLineDash(dash || []); g.lineCap = "round"; g.lineJoin = "round"; };
  // Stroke the first q of a polyline's length; returns the pen's tip.
  function line(g, pts, q = 1) {
    if (q <= 0 || pts.length < 2) return null;
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let left = total * clamp(q), tip = pts[0];
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], d = Math.hypot(x1 - x0, y1 - y0);
      if (d >= left) { const k = d ? left / d : 0; tip = [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k]; g.lineTo(tip[0], tip[1]); break; }
      left -= d; g.lineTo(x1, y1); tip = pts[i];
    }
    g.stroke();
    g.setLineDash([]);
    return tip;
  }
  const rectPts = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
  function bez(x1, y1, cx, cy, x2, y2, n = 30) {
    const out = [];
    for (let i = 0; i <= n; i++) { const k = i / n, a = 1 - k; out.push([a * a * x1 + 2 * a * k * cx + k * k * x2, a * a * y1 + 2 * a * k * cy + k * k * y2]); }
    return out;
  }
  function arcPts(cx, cy, r, a0, a1, n = 48) { const out = []; for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return out; }
  function head(g, x, y, ang, s, color) {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-s, -s * 0.42); g.lineTo(-s * 0.72, 0); g.lineTo(-s, s * 0.42); g.closePath();
    g.fillStyle = color; g.fill(); g.restore();
  }
  function rr(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  const fontOf = (size, o) => `${o.italic ? "italic " : ""}${o.weight || 400} ${size}px ${o.font === "sans" ? SANS : SERIF}`;
  // Set type; q wipes it on left to right like ink taking to the sheet. Long words shrink to maxW.
  function txt(g, s, x, y, size, o = {}) {
    s = String(s ?? "");
    if (o.upper) s = s.toUpperCase();
    if (!s) return 0;
    g.font = fontOf(size, o);
    g.letterSpacing = (o.track || 0) * size + "px";
    let w = g.measureText(s).width;
    if (o.maxW && w > o.maxW) {
      size = Math.max(o.min || size * 0.6, (size * o.maxW) / w);
      g.font = fontOf(size, o); g.letterSpacing = (o.track || 0) * size + "px";
      w = g.measureText(s).width;
    }
    const q = o.q ?? 1;
    const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    if (q > 0) {
      g.save();
      if (q < 1) { g.beginPath(); g.rect(x0 - 6, y - size * 1.5, (w + 12) * q, size * 3); g.clip(); }
      g.textAlign = "left"; g.textBaseline = o.base || "alphabetic"; g.fillStyle = o.color || "#000";
      g.fillText(s, x0, y);
      g.restore();
    }
    g.letterSpacing = "0px";
    return w;
  }
  const decs = (v) => (Math.abs((Number(v) || 0) % 1) > 0.001 ? 1 : 0);
  const fmt = (v, d, dec) => window.DreamcutMotion.formatNumber(v, dec ?? decs(v), (d && d.prefix) || "", (d && d.suffix) || "");
  const tally = (target, k, d) => fmt(target * k, d, decs(target));
  const niceStep = (x) => { const p = Math.pow(10, Math.floor(Math.log10(Math.max(x, 1e-6)))), m = x / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };

  // ---- the plan: which scenes run, read from the controls ----------------------------------------------
  function controls() {
    if (window.__dreamcut && window.__dreamcut.controls) return window.__dreamcut.controls;
    try { if (typeof dc !== "undefined" && dc && dc.controls) return dc.controls; } catch (e) { /* not on this page */ }
    return null;
  }
  let planCache = null;
  function planOf() {
    if (planCache) return planCache.c ? planCache : null;
    const c = controls();
    if (!c) { planCache = { c: null }; return null; }
    let t = 0;
    const shown = [];
    for (const id of ORDER) { const hold = Number(c[`${id}_hold`]) || 0; if (hold > 0) shown.push({ id, start: t, hold }); t += hold; }
    const data = {
      chart: { labels: [c.bar_1_label, c.bar_2_label, c.bar_3_label, c.bar_4_label], values: [c.bar_1, c.bar_2, c.bar_3, c.bar_4], suffix: c.chart_suffix, prefix: "", highlight: Number(c.highlight) - 1 },
      object: { kind: c.device, callouts: [c.callout_1, c.callout_2, c.callout_3] },
      people: { count: c.people_count, badges: [c.badge_1, c.badge_2, c.badge_3], highlight: 1 },
      process: { steps: [c.step_1, c.step_2, c.step_3] },
      compare: { left: c.before_label, leftValue: c.before_value, right: c.after_label, rightValue: c.after_value, suffix: c.compare_suffix, prefix: "" },
    };
    const figs = shown.filter((s) => DRAWN.includes(s.id)).map((s) => s.id);
    planCache = { c, shown, data, figs, length: t, change: Number(c.change) || 0.45 };
    return planCache;
  }

  // Positions of each headline line on the page, read once from the layout.
  const lineCache = {};
  function headLines(id) {
    if (lineCache[id]) return lineCache[id];
    const el = document.getElementById(id), root = document.getElementById("root");
    if (!el || !root || !el.firstChild) return (lineCache[id] = []);
    let ox = 0, oy = 0;
    for (let n = el; n && n !== root; n = n.offsetParent) { ox += n.offsetLeft; oy += n.offsetTop; }
    const scale = root.getBoundingClientRect().width / (Number(root.dataset.width) || 1920) || 1;
    const er = el.getBoundingClientRect(), range = document.createRange();
    range.selectNodeContents(el);
    const out = [];
    for (const r of range.getClientRects()) {
      const L = { x: ox + (r.left - er.left) / scale, y: oy + (r.top - er.top) / scale, w: r.width / scale, h: r.height / scale };
      if (L.w > 1 && !out.some((o) => Math.abs(o.y - L.y) < 2)) out.push(L);
    }
    return (lineCache[id] = out);
  }

  // ---- newsprint ------------------------------------------------------------------------------------
  let texCache = null, texKey = "";
  function texOf(W, H, u, T) {
    const key = `${W}x${H}:${T.paper}`;
    if (texCache && texKey === key) return texCache;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    const r = rng(2611);
    // Show-through: columns of type printed on the reverse side, soft and faint.
    g.save();
    g.filter = `blur(${1.4 * u}px)`;
    g.fillStyle = `rgba(${T.ink},${T.through})`;
    const cols = W > H ? 6 : 3, cw = (W - 120 * u) / cols;
    for (let k = 0; k < cols; k++) {
      let y = 150 * u + r() * 40 * u;
      while (y < H - 60 * u) {
        const para = 4 + Math.floor(r() * 9);
        for (let l = 0; l < para && y < H - 60 * u; l++, y += 17 * u) {
          const lw = (cw - 34 * u) * (l === para - 1 ? 0.3 + r() * 0.5 : 0.94 + r() * 0.06);
          g.fillRect(W - (60 * u + k * cw + 17 * u) - lw, y, lw, 5.5 * u);
        }
        y += 17 * u;
      }
    }
    g.restore();
    // Mottling: uneven ink take-up across the sheet.
    for (let i = 0; i < 46; i++) {
      const x = r() * W, y = r() * H, rad = (140 + r() * 420) * u, dark = r() < 0.55;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, dark ? `rgba(${T.fibre},${(0.03 + r() * 0.03) * (T.mottle ?? 1)})` : `rgba(${T.lite},${(0.05 + r() * 0.05) * Math.min(1, (T.mottle ?? 1) * 2)})`);
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // A coarse halftone screen that comes and goes in patches.
    const pitch = 7 * u, p1 = r() * 9, p2 = r() * 9;
    g.fillStyle = `rgba(${T.ink},${T.screen})`;
    for (let y = pitch / 2; y < H; y += pitch) {
      for (let x = ((y / pitch) % 2) * pitch * 0.5; x < W; x += pitch) {
        const k = Math.sin(x * 0.0031 / u + p1) * Math.sin(y * 0.0047 / u + p2) + 0.25 * Math.sin((x + y) * 0.011 / u);
        const rad = 1.25 * u * clamp(k);
        if (rad < 0.3 * u) continue;
        g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
      }
    }
    // Paper fibres.
    for (let i = 0; i < (W * H) / 650; i++) {
      const x = r() * W, y = r() * H, len = (3 + r() * 13) * u, a = r() * TAU;
      g.strokeStyle = r() < 0.7 ? `rgba(${T.fibre},${0.05 + r() * 0.07})` : `rgba(${T.lite},${0.12 + r() * 0.1})`;
      g.lineWidth = (0.5 + r() * 0.8) * u;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.6) * len * 0.5, y + Math.sin(a + 0.6) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
    }
    // The fold: a soft ridge across the middle of the sheet.
    const fy = H * 0.5;
    let gr = g.createLinearGradient(0, fy - 34 * u, 0, fy + 40 * u);
    gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(0.45, `rgba(${T.lite},0.22)`); gr.addColorStop(0.5, `rgba(${T.fibre},0.12)`); gr.addColorStop(0.62, `rgba(${T.fibre},0.04)`); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, fy - 34 * u, W, 74 * u);
    // Edges a shade darker where the sheet has been handled.
    gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, `rgba(${T.fibre},${T.edge})`);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    texKey = key;
    return (texCache = c);
  }
  function paperPass(g, F) {
    g.save();
    g.fillStyle = F.T.paper; g.fillRect(0, 0, F.W, F.H);
    const tex = F.S.look.texture;
    if (tex > 0) { g.globalAlpha = tex; g.drawImage(texOf(F.W, F.H, F.u, F.T), 0, 0); }
    g.restore();
  }

  // ---- page furniture -------------------------------------------------------------------------------
  const ruleY = (F) => (F.tall ? 120 : 60) * F.u;
  const tickerTop = (F) => F.H - (F.tall ? 196 : 132) * F.u;
  function header(g, F) {
    const { W, u, tall, side, t } = F;
    const yb = (tall ? 96 : 42) * u, ry = ruleY(F);
    txt(g, "The Cut Ledger", side, yb, (tall ? 34 : 30) * u, { weight: 700, track: 0.01, color: F.ink(0.95) });
    if (!tall) txt(g, "EDIT DESK  ·  FIGURES", W / 2, yb - 3 * u, 24 * u, { font: "sans", weight: 700, track: 0.22, align: "center", color: F.ink(0.55) });
    const P = F.plan, fig = P && F.info.scene && P.figs.includes(F.info.scene) ? `FIG. ${P.figs.indexOf(F.info.scene) + 1} OF ${P.figs.length}` : "EXPLAINER";
    txt(g, `No. 214  ·  ${fig}`, W - side, yb - 3 * u, 24 * u, { font: "sans", weight: 600, track: 0.14, align: "right", color: F.ink(0.6) });
    if (tall) txt(g, "EDIT DESK  ·  FIGURES", side, yb - 52 * u, 24 * u, { font: "sans", weight: 700, track: 0.22, color: F.ink(0.55) });
    g.fillStyle = F.ink(0.92); g.fillRect(side, ry, W - side * 2, 3 * u);
    g.fillStyle = F.ink(0.6); g.fillRect(side, ry + 7 * u, W - side * 2, 1.2 * u);
    // Reading progress runs along the heavy rule; ticks mark where each figure starts.
    const length = (P && P.length) || F.info.length || 1;
    g.fillStyle = F.acc(1); g.fillRect(side, ry - 1 * u, (W - side * 2) * clamp(t / length), 5 * u);
    if (P) for (const s of P.shown) { const x = side + (W - side * 2) * (s.start / length); g.fillStyle = F.ink(0.7); g.fillRect(x - 0.75 * u, ry + 7 * u, 1.5 * u, 9 * u); }
  }
  // The wire: a band of figures that runs continuously along the foot of the page.
  let wireCache = null;
  function wireItems(F) {
    if (wireCache) return wireCache;
    const P = F.plan, out = [];
    if (P) {
      const ch = P.data.chart;
      ch.values.forEach((v, i) => { if (ch.labels[i]) out.push([ch.labels[i], fmt(Number(v) || 0, ch), i ? Math.sign((Number(v) || 0) - (Number(ch.values[i - 1]) || 0)) : 1]); });
      const cp = P.data.compare;
      if (cp.left) out.push([cp.left, fmt(Number(cp.leftValue) || 0, cp), 0]);
      if (cp.right) out.push([cp.right, fmt(Number(cp.rightValue) || 0, cp), Math.sign((Number(cp.rightValue) || 0) - (Number(cp.leftValue) || 0))]);
      out.push(["People", String(Math.round(Number(P.data.people.count) || 0)), 1]);
    }
    if (out.length < 4) out.push(["Edits", "41", 1], ["Cards", "12", 1], ["Undo", "3", -1], ["Renders", "7", 1]);
    return (wireCache = out);
  }
  function footer(g, F) {
    const { W, H, u, tall, side, t } = F;
    const y0 = tickerTop(F), bh = 54 * u;
    g.fillStyle = F.ink(0.85); g.fillRect(side, y0, W - side * 2, 2 * u);
    g.fillStyle = F.ink(0.35); g.fillRect(side, y0 + bh, W - side * 2, 1 * u);
    const lw = 172 * u;
    g.fillStyle = F.ink(0.9); g.fillRect(side, y0 + 8 * u, lw, bh - 14 * u);
    txt(g, "THE WIRE", side + lw / 2, y0 + bh / 2 + 1 * u, 22 * u, { font: "sans", weight: 700, track: 0.2, align: "center", base: "middle", color: F.T.paper });
    const items = wireItems(F), fs = 28 * u;
    const widths = items.map(([n, v]) => {
      g.font = fontOf(fs, { font: "sans", weight: 700 }); g.letterSpacing = 0.08 * fs + "px";
      const a = g.measureText(String(n).toUpperCase()).width; g.letterSpacing = "0px";
      g.font = fontOf(fs, { font: "sans", weight: 400 }); const b = g.measureText(v).width;
      return a + b + 150 * u;
    });
    const total = widths.reduce((s, w) => s + w, 0) || 1;
    const x0 = side + lw + 18 * u, x1 = W - side;
    g.save(); g.beginPath(); g.rect(x0, y0 + 3 * u, x1 - x0, bh - 4 * u); g.clip();
    let x = x0 - ((t * 66 * u) % total);
    const cy = y0 + bh / 2 + 1 * u;
    for (let rep = 0; x < x1; rep++) {
      items.forEach(([n, v, dir], i) => {
        if (x > x1 || x + widths[i] < x0) { x += widths[i]; return; }
        const a = txt(g, n, x, cy, fs, { font: "sans", weight: 700, track: 0.08, upper: true, base: "middle", color: F.ink(0.62) });
        const b = txt(g, v, x + a + 12 * u, cy, fs, { font: "sans", base: "middle", color: F.ink(0.95) });
        let ax = x + a + b + 26 * u;
        g.beginPath();
        if (dir >= 0) { g.moveTo(ax, cy + 6 * u); g.lineTo(ax + 7 * u, cy - 6 * u); g.lineTo(ax + 14 * u, cy + 6 * u); g.fillStyle = F.acc(1); }
        else { g.moveTo(ax, cy - 6 * u); g.lineTo(ax + 7 * u, cy + 6 * u); g.lineTo(ax + 14 * u, cy - 6 * u); g.fillStyle = F.grey(1); }
        g.closePath(); g.fill();
        ax += 26 * u;
        const pts = [];
        for (let k = 0; k <= 12; k++) pts.push([ax + k * 4.5 * u, cy + 8 * u - 16 * u * noise(k * 0.55 + i * 7.3, 31 + i) * (0.5 + (dir >= 0 ? k / 24 : (12 - k) / 24))]);
        pen(g, F.ink(0.55), 1.4 * u); line(g, pts);
        g.beginPath(); g.arc(pts[12][0], pts[12][1], 2.6 * u, 0, TAU); g.fillStyle = F.acc(1); g.fill();
        g.beginPath(); g.arc(x + widths[i] - 18 * u, cy, 2.4 * u, 0, TAU); g.fillStyle = F.ink(0.45); g.fill();
        x += widths[i];
      });
      if (rep > 8) break;
    }
    g.restore();
    const sy = H - (tall ? 62 : 36) * u;
    g.fillStyle = F.ink(0.3); g.fillRect(side, sy - 30 * u, W - side * 2, 1 * u);
    txt(g, "Source: DreamCut project data. Figures are illustrative.", side, sy, 24 * u, { font: "sans", color: F.ink(0.62) });
    txt(g, tall ? "EDIT DESK" : "GRAPHIC: EDIT DESK  ·  PAGE 4", W - side, sy, 22 * u, { font: "sans", weight: 700, track: 0.16, align: "right", color: F.ink(0.55) });
  }
  const dekText = (id, d) => {
    if (!d) return { chart: "Readings by period", object: "Numbered parts, with a key", people: "Who is on the cut", process: "Step by step", compare: "Before and after" }[id] || "";
    if (id === "chart") { const L = (d.labels || []).filter(Boolean); return L.length > 1 ? `${L.length} readings, ${L[0]} to ${L[L.length - 1]}` : "Readings by period"; }
    if (id === "object") return "Numbered parts, with a key";
    if (id === "people") { const n = clamp(Math.round(Number(d.count) || 4), 2, 6); const b = (d.badges || [])[Math.min(n - 1, d.highlight ?? 1) % Math.max(1, (d.badges || []).length)]; return b ? `${n} people, ${b} highlighted` : `${n} people on one cut`; }
    if (id === "process") return `${(d.steps || []).filter(Boolean).length || 3} steps, in order`;
    if (id === "compare") return d.left && d.right ? `${d.left} against ${d.right}` : "Before and after";
    return "";
  };
  // The dek: figure number and a line of italic under the scene headline.
  function dek(g, F) {
    const { info, u, side, W } = F, id = info.scene;
    if (!id || !DRAWN.includes(id)) return;
    const A = areaOf(F, id);
    const qa = span(info.local, 0.25, 0.9), out = F.info.next ? 1 - span(info.local, info.hold - F.change, info.hold) : 1;
    if (qa <= 0 || out <= 0) return;
    g.save(); g.globalAlpha *= out;
    const P = F.plan, n = P ? P.figs.indexOf(id) + 1 : Math.max(1, info.index);
    const w = txt(g, `FIG. ${n}`, side, A.dekY, 26 * u, { font: "sans", weight: 700, track: 0.14, color: F.acc(1), q: qa });
    g.fillStyle = F.ink(0.5); g.fillRect(side + w + 16 * u, A.dekY - 18 * u, 1.4 * u, 22 * u * qa);
    txt(g, dekText(id, P && P.data[id]), side + w + 34 * u, A.dekY, 42 * u, { italic: true, color: F.ink(0.68), q: span(info.local, 0.4, 1.1), maxW: W - side * 2 - w - 40 * u, min: 30 * u });
    g.restore();
  }
  function areaOf(F, id) {
    const { u, tall, H, W, side } = F;
    const lines = headLines(HEADS[id]);
    const hb = lines.length ? Math.max(...lines.map((l) => l.y + l.h)) : (tall ? 330 : 172) * u;
    const top = hb + (tall ? 132 : 108) * u;
    const bottom = tickerTop(F) - (tall ? 40 : 26) * u;
    return { x: side, y: top, w: W - side * 2, h: Math.max(240 * u, bottom - top), dekY: hb + (tall ? 64 : 54) * u };
  }
  // The page scrolls: a figure rises in from below, and leaves upward under the nameplate.
  // One continuous scroll spans each change: it starts as the old headline fades and lands as the new
  // one is set, the next figure sitting a fixed distance below the last, so the two never overlap.
  const gapOf = (F) => F.H * 0.8;
  function motion(F, local, hold, first, last) {
    let dy = 0;
    if (!first) dy += gapOf(F) * (1 - inout(span(local, -F.change, F.change * 0.3)));
    if (!last) dy -= gapOf(F) * inout(span(local, hold - F.change, hold + F.change * 0.3));
    return { dy, a: 1 };
  }
  const leaving = (F, exit) => ({ dy: -gapOf(F) * inout((1 + clamp(exit)) / 1.3), a: 1 });
  // Figures scroll inside a window under the fixed headline: art leaving upward slips beneath the dek.
  function viewport(g, F, top) { const y = top ?? ruleY(F) + 10 * F.u; g.beginPath(); g.rect(0, y, F.W, tickerTop(F) - y - 2 * F.u); g.clip(); }

  // ---- FIG: columns, one claret against warm greys -----------------------------------------------------
  function chart(g, F, A, q, d, ti) {
    const { u, tall } = F;
    const vals = (d.values || []).map((v) => Math.max(0, Number(v) || 0)), n = Math.max(1, vals.length);
    const max = Math.max(...vals, 1e-6), hi = d.highlight >= 0 && d.highlight < n ? d.highlight : -1;
    const stepV = niceStep((max * 1.14) / 4), topV = Math.max(stepV, Math.ceil((max * 1.14) / stepV) * stepV);
    const sideW = tall ? 0 : Math.min(500 * u, A.w * 0.3);
    const P = tall ? { x: A.x, y: A.y + 40 * u, w: A.w, h: A.h * 0.55 } : { x: A.x, y: A.y + 34 * u, w: A.w - sideW - 90 * u, h: A.h - 34 * u - 84 * u };
    const base = P.y + P.h, slot = P.w / n, bw = Math.min(slot * 0.58, 200 * u);
    if (hi >= 0) { const bq = span(q, 0.3, 0.55); g.fillStyle = F.ink(0.05 * bq); g.fillRect(P.x + slot * hi + slot * 0.06, P.y - 20 * u, slot * 0.88, P.h + 20 * u); }
    const ticks = Math.round(topV / stepV);
    for (let i = 1; i <= ticks; i++) {
      const v = i * stepV, y = base - (v / topV) * P.h, gq = 1;
      pen(g, F.ink(0.17), 1.2 * u); line(g, [[P.x, y], [P.x + P.w, y]], gq);
      txt(g, fmt(v, i === ticks ? d : null), P.x, y - 10 * u, 30 * u, { font: "sans", color: F.ink(0.55), q: gq });
    }
    let hot = null;
    vals.forEach((v, j) => {
      const cx = P.x + slot * (j + 0.5), s0 = 0.04 + j * 0.08, k = ease(span(q, s0, s0 + 0.42)), h = (v / topV) * P.h * k, x = cx - bw / 2, isHot = j === hi;
      g.fillStyle = isHot ? F.acc(1) : F.grey(0.85); g.fillRect(x, base - h, bw, h);
      if (k > 0.02) txt(g, tally(v, k, d), cx, base - h - 16 * u, 46 * u, { font: "sans", weight: 700, align: "center", color: isHot ? F.acc(1) : F.ink(0.82), maxW: slot * 0.96 });
      txt(g, d.labels[j] || "", cx, base + 56 * u, 42 * u, { font: "sans", align: "center", weight: isHot ? 700 : 400, color: isHot ? F.acc(1) : F.ink(0.85), q: span(q, 0, 0.12 + j * 0.05), maxW: slot * 0.94, min: 30 * u });
      if (isHot) hot = { cx, x, top: base - (v / topV) * P.h, v, label: d.labels[j] || "" };
    });
    pen(g, F.ink(0.9), 2.6 * u); line(g, [[P.x, base], [P.x + P.w, base]]);
    // A reader's cursor sweeps the columns through the hold.
    const be = Math.min(2, ti.hold * 0.52) + 0.15, hk = span(ti.local, be, be + 0.5);
    if (hk > 0) {
      const ph = (ti.local - be) * 0.8, cx = P.x + slot * 0.5 + (P.w - slot) * (0.5 - 0.5 * Math.cos(ph));
      const j = clamp(Math.round((cx - P.x) / slot - 0.5), 0, n - 1), y = base - (vals[j] / topV) * P.h;
      pen(g, F.ink(0.55 * hk), 1.4 * u, [5 * u, 6 * u]); line(g, [[cx, P.y - 20 * u], [cx, base]]);
      g.beginPath(); g.arc(cx, Math.min(y, base - 4 * u), 9 * u, 0, TAU); g.fillStyle = F.T.paper; g.fill(); pen(g, F.ink(0.9 * hk), 2.6 * u); g.stroke();
    }
    // An italic note with a drawn arrow to the claret column.
    if (hot) {
      const aq = span(q, 0.6, 0.95);
      if (aq > 0) {
        let note;
        if (hot.v >= max) note = hot.label ? `${hot.label} is the high point` : "The high point";
        else if (hi > 0 && vals[hi - 1] > 0) { const pc = Math.round((hot.v / vals[hi - 1] - 1) * 100); note = `${pc >= 0 ? "Up" : "Down"} ${Math.abs(pc)}% on ${d.labels[hi - 1] || "before"}`; }
        else note = hot.label ? `${hot.label}, highlighted` : "Highlighted";
        const leftSide = hi >= n / 2;
        const tx = leftSide ? P.x + 80 * u : P.x + P.w - 10 * u, ty = P.y + 18 * u;
        const room = leftSide ? hot.x - 70 * u - tx : tx - (hot.x + bw) - 70 * u;
        const w = txt(g, note, tx, ty, 40 * u, { italic: true, align: leftSide ? "left" : "right", color: F.ink(0.9), q: span(aq, 0, 0.5), maxW: Math.max(160 * u, room), min: 28 * u });
        const sx = leftSide ? tx + Math.min(w, Math.max(160 * u, room)) + 14 * u : tx - Math.min(w, Math.max(160 * u, room)) - 14 * u, sy = ty - 12 * u;
        const ex = leftSide ? hot.x - 12 * u : hot.x + bw + 12 * u, ey = Math.max(hot.top + 26 * u, sy + 30 * u);
        pen(g, F.ink(0.85), 2 * u);
        const pts = bez(sx, sy, ex, sy, ex, ey);
        const tip = line(g, pts, span(aq, 0.35, 1));
        if (tip && aq >= 1) head(g, ex, ey, Math.PI / 2, 15 * u, F.ink(0.85));
      }
    }
    // The side column: key numbers.
    const sum = vals.reduce((a, b) => a + b, 0), avg = sum / n, sq = 1, vq = ease(span(q, 0, 0.7));
    const keyV = hot ? hot.v : max, keyL = hot ? hot.label : "Highest";
    if (tall) {
      const R = { x: A.x, y: base + 110 * u, w: A.w }, cw = R.w / 3;
      pen(g, F.ink(0.9), 3 * u); line(g, [[R.x, R.y], [R.x + R.w, R.y]], sq);
      [["HIGHLIGHT", tally(keyV, vq, d), 116, F.acc(1), keyL], ["TOTAL", tally(sum, vq, d), 80, F.ink(0.92), ""], ["AVERAGE", fmt(avg * vq, d, decs(avg)), 80, F.ink(0.92), ""]].forEach(([k, v, s, col, sub], i) => {
        const x = R.x + i * cw;
        if (i) { g.fillStyle = F.ink(0.25 * sq); g.fillRect(x - 18 * u, R.y + 24 * u, 1.2 * u, 200 * u); }
        txt(g, k, x, R.y + 44 * u, 24 * u, { font: "sans", weight: 700, track: 0.16, color: i ? F.ink(0.6) : F.acc(1), q: sq });
        txt(g, v, x, R.y + 168 * u, s * u, { weight: 700, color: col, maxW: cw - 30 * u, min: 60 * u });
        if (sub) txt(g, sub, x, R.y + 230 * u, 42 * u, { font: "sans", color: F.ink(0.85), q: span(q, 0.6, 0.9), maxW: cw - 30 * u, min: 30 * u });
      });
    } else {
      const R = { x: A.x + A.w - sideW, y: A.y + 6 * u, w: sideW };
      pen(g, F.ink(0.9), 3 * u); line(g, [[R.x, R.y], [R.x + R.w, R.y]], sq);
      txt(g, "THE HIGHLIGHT", R.x, R.y + 42 * u, 24 * u, { font: "sans", weight: 700, track: 0.16, color: F.acc(1), q: sq });
      txt(g, tally(keyV, vq, d), R.x - 4 * u, R.y + 168 * u, 132 * u, { weight: 700, color: F.acc(1), maxW: R.w, min: 96 * u });
      txt(g, keyL, R.x, R.y + 228 * u, 42 * u, { font: "sans", color: F.ink(0.88), q: span(q, 0.3, 0.6), maxW: R.w, min: 30 * u });
      [["TOTAL", tally(sum, vq, d)], ["AVERAGE", fmt(avg * vq, d, decs(avg))]].forEach(([k, v], i) => {
        const y = R.y + 272 * u + i * 176 * u, kq = 1;
        pen(g, F.ink(0.3), 1.2 * u); line(g, [[R.x, y], [R.x + R.w, y]], kq);
        txt(g, k, R.x, y + 44 * u, 24 * u, { font: "sans", weight: 700, track: 0.16, color: F.ink(0.6), q: kq });
        txt(g, v, R.x - 2 * u, y + 134 * u, 84 * u, { weight: 700, color: F.ink(0.92), maxW: R.w, min: 56 * u });
      });
    }
  }

  // ---- FIG: an annotated editor, numbered parts and a key ---------------------------------------------
  function object(g, F, A, q, d, ti) {
    const { u, tall, t } = F, phone = d.kind === "phone";
    const D = tall ? { x: A.x, y: A.y, w: A.w, h: A.h * 0.6 } : { x: A.x, y: A.y, w: A.w * 0.6, h: A.h };
    const K = tall ? { x: A.x, y: A.y + A.h * 0.66, w: A.w, h: A.h * 0.34 } : { x: A.x + A.w * 0.66, y: A.y, w: A.w * 0.34, h: A.h };
    let w, h;
    if (phone) { h = D.h * 0.97; w = h * 0.52; if (w > D.w) { w = D.w; h = w / 0.52; } }
    else { w = D.w * 0.97; h = w * 0.6; if (h * 1.06 > D.h * 0.97) { h = (D.h * 0.97) / 1.06; w = h / 0.6; } }
    const x = phone || tall ? D.x + (D.w - w) / 2 : D.x, y = D.y + (D.h - h * (phone ? 1 : 1.06)) / 2;
    const fq = 1, iq = clamp(0.35 + span(q, 0, 0.3));
    g.fillStyle = F.ink(0.035 * iq); g.fillRect(x, y, w, h);
    pen(g, F.ink(0.92), 2.6 * u); line(g, rectPts(x, y, w, h), fq);
    const bar = (phone ? 40 : 34) * u;
    pen(g, F.ink(0.6), 1.2 * u); line(g, [[x, y + bar], [x + w, y + bar]], fq);
    for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x + 22 * u + k * 22 * u, y + bar / 2, 6 * u, 0, TAU); pen(g, F.ink(0.6 * iq), 1.4 * u); g.stroke(); }
    if (!phone) {
      pen(g, F.ink(0.92), 2.6 * u);
      line(g, [[x, y + h], [x - w * 0.04, y + h * 1.05], [x + w * 1.04, y + h * 1.05], [x + w, y + h]]);
      pen(g, F.ink(0.5), 1.2 * u); line(g, [[x + w * 0.42, y + h * 1.025], [x + w * 0.58, y + h * 1.025]]);
    }
    const pad = 18 * u;
    const Pv = { x: x + pad, y: y + bar + pad, w: w - pad * 2, h: (h - bar) * (phone ? 0.46 : 0.5) };
    // The preview: a drawn landscape that keeps moving (sun, drifting clouds, parallax hills).
    g.save(); g.globalAlpha *= iq;
    g.beginPath(); g.rect(Pv.x, Pv.y, Pv.w, Pv.h); g.clip();
    g.fillStyle = F.ink(0.04); g.fillRect(Pv.x, Pv.y, Pv.w, Pv.h);
    pen(g, F.ink(0.1), 1 * u);
    for (let yy = Pv.y + 10 * u; yy < Pv.y + Pv.h * 0.6; yy += 11 * u) line(g, [[Pv.x, yy], [Pv.x + Pv.w, yy]]);
    const sun = [Pv.x + Pv.w * (0.62 + 0.06 * Math.sin(t * 0.35)), Pv.y + Pv.h * (0.36 + 0.04 * Math.cos(t * 0.5))];
    g.beginPath(); g.arc(sun[0], sun[1], Pv.h * 0.13, 0, TAU); g.fillStyle = F.acc(0.9); g.fill();
    for (let k = 0; k < 3; k++) {
      const cw = Pv.w * 0.16, cx = Pv.x - cw + ((t * 22 * u + k * Pv.w * 0.45 + 40 * u) % (Pv.w + cw * 2)), cy = Pv.y + Pv.h * (0.16 + k * 0.09);
      g.beginPath(); g.ellipse(cx, cy, cw * 0.5, Pv.h * 0.045, 0, 0, TAU); g.fillStyle = F.T.paper; g.fill(); g.fillStyle = `rgba(${F.T.lite},0.18)`; g.fill(); pen(g, F.ink(0.5), 1.3 * u); g.stroke();
    }
    [[0.62, 0.16, 7, F.grey(0.6), 10], [0.78, 0.12, 9, F.grey(0.95), 22]].forEach(([lvl, amp, seed, col, speed]) => {
      const pts = [[Pv.x, Pv.y + Pv.h]];
      for (let k = 0; k <= 40; k++) { const xx = Pv.x + (Pv.w * k) / 40; pts.push([xx, Pv.y + Pv.h * (lvl - amp * noise((xx - Pv.x + t * speed * u) / (90 * u), seed))]); }
      pts.push([Pv.x + Pv.w, Pv.y + Pv.h]);
      g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.closePath(); g.fillStyle = col; g.fill();
      pen(g, F.ink(0.75), 1.4 * u); line(g, pts.slice(1, -1));
    });
    g.restore();
    pen(g, F.ink(0.75), 1.4 * u); line(g, rectPts(Pv.x, Pv.y, Pv.w, Pv.h));
    // The timeline: ruler, three tracks, a playhead that keeps running.
    const TL = { x: Pv.x, y: Pv.y + Pv.h + 22 * u, w: Pv.w, h: y + h - pad - (Pv.y + Pv.h + 22 * u) };
    const rq = 1;
    pen(g, F.ink(0.5), 1.1 * u);
    for (let k = 0; k <= 24; k++) { const xx = TL.x + (TL.w * k) / 24; line(g, [[xx, TL.y], [xx, TL.y + (k % 6 ? 6 : 12) * u]], rq); }
    const tracks = [[[0.0, 0.27], [0.3, 0.33], [0.66, 0.32]], [[0.05, 0.4], [0.5, 0.22], [0.75, 0.23]], [[0.0, 0.52], [0.56, 0.42]]];
    const th = (TL.h - 22 * u) / 3 - 8 * u;
    let hotClip = null, audio = null;
    tracks.forEach((clips, ti2) => {
      const ty = TL.y + 22 * u + ti2 * (th + 8 * u);
      clips.forEach(([c0, cw], ci) => {
        const k = ease(span(q, 0.04 + ti2 * 0.06 + ci * 0.05, 0.34 + ti2 * 0.06 + ci * 0.05));
        if (k <= 0) return;
        const cx = TL.x + TL.w * c0 + 2 * u, cwid = (TL.w * cw - 4 * u) * k, isHot = ti2 === 0 && ci === 1;
        g.fillStyle = isHot ? F.acc(0.92) : F.grey(ti2 === 2 ? 0.45 : 0.7); g.fillRect(cx, ty, cwid, th);
        pen(g, isHot ? F.acc(1) : F.ink(0.55), 1.2 * u); g.strokeRect(cx, ty, cwid, th);
        if (ti2 === 2) {
          pen(g, F.ink(0.55), 1.4 * u); g.beginPath();
          for (let xx = cx + 4 * u; xx < cx + cwid - 3 * u; xx += 5 * u) { const a = th * 0.42 * (0.2 + 0.8 * noise(xx / (9 * u), 5 + ci)); g.moveTo(xx, ty + th / 2 - a); g.lineTo(xx, ty + th / 2 + a); }
          g.stroke();
        }
        if (isHot) hotClip = { x: cx, y: ty, w: TL.w * cw - 4 * u, h: th };
        if (ti2 === 2 && ci === 0) audio = { x: cx, y: ty, w: TL.w * cw - 4 * u, h: th };
      });
    });
    if (hotClip && q > 0.5) {
      pen(g, F.ink(0.85), 1.6 * u, [8 * u, 6 * u]); g.lineDashOffset = -t * 26 * u;
      g.strokeRect(hotClip.x - 6 * u, hotClip.y - 6 * u, hotClip.w + 12 * u, hotClip.h + 12 * u);
      g.lineDashOffset = 0; g.setLineDash([]);
    }
    if (q > 0.2) {
      const phx = TL.x + TL.w * ((t * 0.085) % 1), pa = span(q, 0.2, 0.35);
      pen(g, F.acc(pa), 2.4 * u); line(g, [[phx, TL.y - 4 * u], [phx, TL.y + TL.h]]);
      head(g, phx, TL.y + 4 * u, Math.PI / 2, 14 * u, F.acc(pa));
    }
    // Numbered markers on the drawing, leaders and the key.
    const anchors = [[sun[0] - Pv.h * 0.2, sun[1] + Pv.h * 0.2], hotClip ? [hotClip.x + hotClip.w * 0.5, hotClip.y + hotClip.h * 0.5] : [TL.x + TL.w * 0.45, TL.y + 30 * u], audio ? [audio.x + audio.w * 0.7, audio.y + audio.h * 0.5] : [TL.x + TL.w * 0.3, TL.y + TL.h - 20 * u]];
    const kq = 1;
    pen(g, F.ink(0.9), 3 * u); line(g, [[K.x, K.y], [K.x + K.w, K.y]], kq);
    txt(g, "KEY", K.x, K.y + 42 * u, 24 * u, { font: "sans", weight: 700, track: 0.18, color: F.acc(1), q: kq });
    const rowH = (K.h - 70 * u) / 3;
    d.callouts.forEach((label, i) => {
      const c = span(q, 0.3 + i * 0.12, 0.55 + i * 0.12);
      if (c <= 0) return;
      const iy = K.y + 70 * u + rowH * (i + 0.5);
      if (i) { pen(g, F.ink(0.25), 1.1 * u); line(g, [[K.x, iy - rowH / 2], [K.x + K.w, iy - rowH / 2]], c); }
      const [ax, ay] = anchors[i];
      if (!tall) { pen(g, F.ink(0.45), 1.3 * u); line(g, [[ax, ay], [K.x - 70 * u, ay], [K.x - 14 * u, iy]], ease(c)); }
      const pop = 0.6 + 0.4 * ease(span(c, 0, 0.6));
      for (const [mx, my] of [[ax, ay], [K.x + 26 * u, iy]]) {
        g.beginPath(); g.arc(mx, my, 24 * u * pop, 0, TAU); g.fillStyle = F.acc(1); g.fill();
        pen(g, F.T.paper, 2.4 * u); g.stroke();
        txt(g, String(i + 1), mx, my + 1.5 * u, 28 * u * pop, { weight: 700, align: "center", base: "middle", color: F.T.paper });
      }
      txt(g, label || "", K.x + 70 * u, iy, 42 * u, { font: "sans", weight: 500, base: "middle", color: F.ink(0.92), q: span(c, 0.3, 1), maxW: K.w - 76 * u, min: 30 * u });
    });
  }

  // ---- FIG: people as pictograms, comments travelling to the highlighted one ---------------------------
  function figure(g, cx, base, s, color) {
    const r = s * 0.15, hy = base - s + r;
    g.beginPath(); g.arc(cx, hy, r, 0, TAU); g.fillStyle = color; g.fill();
    const bw = s * 0.58, top = hy + r + s * 0.05;
    rr(g, cx - bw / 2, top, bw, base - top, bw * 0.34); g.fill();
    g.fillRect(cx - bw / 2, top + bw * 0.34, bw, base - top - bw * 0.34);
    return { hx: cx, hy, r };
  }
  function people(g, F, A, q, d, ti) {
    const { u, tall, t } = F;
    const n = clamp(Math.round(Number(d.count) || 4), 2, 6), hot = Math.min(n - 1, d.highlight ?? 1);
    const FA = tall ? { x: A.x, y: A.y, w: A.w, h: A.h * 0.62 } : { x: A.x, y: A.y, w: A.w * 0.72, h: A.h };
    const slot = FA.w / n, s = Math.min(slot * 0.9, FA.h * 0.64), base = FA.y + FA.h - 92 * u;
    pen(g, F.ink(0.85), 2.4 * u); line(g, [[FA.x, base], [FA.x + FA.w, base]]);
    const heads = [];
    for (let i = 0; i < n; i++) {
      const k = ease(span(q, i * 0.06, 0.3 + i * 0.06)), cx = FA.x + slot * (i + 0.5), isHot = i === hot;
      g.save(); g.globalAlpha *= clamp(k * 1.5);
      g.beginPath(); g.ellipse(cx, base, s * 0.36, 7 * u, 0, 0, TAU); g.fillStyle = F.ink(0.08); g.fill();
      g.beginPath(); g.rect(cx - s, base - s * 1.2, s * 2, s * 1.2); g.clip();
      heads.push(figure(g, cx, base + (1 - k) * s * 0.5, s * (isHot ? 1.04 : 1), isHot ? F.acc(1) : F.grey(0.9)));
      g.restore();
      const label = d.badges[i % d.badges.length];
      txt(g, label || "", cx, base + 58 * u, 42 * u, { font: "sans", align: "center", weight: isHot ? 700 : 400, color: isHot ? F.acc(1) : F.ink(0.85), q: span(q, 0.1 + i * 0.06, 0.35 + i * 0.06), maxW: slot * 0.96, min: 28 * u });
    }
    // Dotted links between neighbours: the review loop.
    for (let i = 0; i < n - 1; i++) {
      const a = heads[i], b = heads[i + 1];
      pen(g, F.ink(0.3), 1.6 * u, [2 * u, 7 * u]);
      line(g, bez(a.hx + a.r * 1.3, a.hy - a.r, (a.hx + b.hx) / 2, a.hy - s * 0.42, b.hx - b.r * 1.3, b.hy - b.r), span(q, 0.45 + i * 0.05, 0.75 + i * 0.05));
    }
    // Comments travel from each person to the highlighted one, all through the hold.
    const be = Math.min(2, ti.hold * 0.52) * 0.6, period = 0.62, fly = 1.35;
    const H = heads[hot];
    if (ti.local > be && H) {
      const senders = []; for (let i = 0; i < n; i++) if (i !== hot) senders.push(i);
      const kMax = Math.floor((ti.local - be) / period), kMin = Math.max(0, Math.floor((ti.local - be - fly) / period));
      for (let k = kMin; k <= kMax; k++) {
        const age = (ti.local - be - k * period) / fly;
        if (age < 0 || age > 1) continue;
        const sI = senders[k % senders.length], S0 = heads[sI];
        const lift = s * (0.55 + 0.18 * (k % 3));
        const pts = bez(S0.hx, S0.hy - S0.r * 1.6, (S0.hx + H.hx) / 2, Math.min(S0.hy, H.hy) - lift, H.hx, H.hy - H.r * 1.7, 24);
        const pos = inout(age), idx = pos * 24, i0 = Math.floor(idx), f = idx - i0;
        const p0 = pts[Math.min(24, i0)], p1 = pts[Math.min(24, i0 + 1)];
        const bx = lerp(p0[0], p1[0], f), by = lerp(p0[1], p1[1], f), a = clamp(age * 6) * clamp((1 - age) * 6);
        g.save(); g.globalAlpha *= a;
        const bwid = 66 * u, bh = 42 * u;
        rr(g, bx - bwid / 2, by - bh / 2, bwid, bh, 8 * u); g.fillStyle = F.T.paper; g.fill(); pen(g, k % 4 === 0 ? F.acc(1) : F.ink(0.8), 2 * u); g.stroke();
        g.beginPath(); g.moveTo(bx - 8 * u, by + bh / 2 - 1 * u); g.lineTo(bx - 14 * u, by + bh / 2 + 10 * u); g.lineTo(bx + 2 * u, by + bh / 2 - 1 * u); g.fillStyle = F.T.paper; g.fill(); g.stroke();
        for (let m = -1; m <= 1; m++) { g.beginPath(); g.arc(bx + m * 15 * u, by, 4.2 * u, 0, TAU); g.fillStyle = k % 4 === 0 ? F.acc(1) : F.ink(0.75); g.fill(); }
        g.restore();
      }
      // Each arrival rings the highlighted head.
      const lastArr = Math.floor((ti.local - be - fly) / period);
      if (lastArr >= 0) {
        const since = ti.local - (be + lastArr * period + fly), rk = clamp(since / 0.6);
        g.beginPath(); g.arc(H.hx, H.hy, H.r * (1.1 + rk * 0.9), 0, TAU); pen(g, F.acc(0.8 * (1 - rk)), 3 * u); g.stroke();
      }
    }
    // Above the row: a running tally of notes reaching the highlighted person, one segment per note.
    if (H) {
      const top = FA.y + 4 * u, bq = span(q, 0.2, 0.7), hbn = d.badges[hot % d.badges.length] || "";
      const arrived = ti.local > be + fly ? Math.floor((ti.local - be - fly) / period) + 1 : 0;
      const senders = []; for (let i = 0; i < n; i++) if (i !== hot) senders.push(i);
      g.fillStyle = F.ink(0.88); g.fillRect(FA.x, top, FA.w * ease(bq), 2.4 * u);
      txt(g, hbn ? `NOTES TO THE ${hbn}` : "NOTES IN", FA.x, top + 40 * u, 24 * u, { font: "sans", weight: 700, track: 0.16, upper: true, color: F.acc(1), q: bq, maxW: FA.w * 0.6 });
      const since = arrived ? ti.local - (be + (arrived - 1) * period + fly) : 1, pop = arrived ? 1 + 0.12 * Math.max(0, 1 - since / 0.3) : 1;
      txt(g, String(arrived), FA.x + FA.w, top + 100 * u, 104 * u * pop, { weight: 700, align: "right", color: arrived ? F.acc(1) : F.ink(0.4) });
      const bx = FA.x, by = top + 64 * u, bw2 = FA.w - 150 * u, cap = 8, segW = bw2 / cap;
      g.fillStyle = F.ink(0.06 * bq); g.fillRect(bx, by, bw2 * ease(bq), 30 * u);
      for (let k = 0; k < Math.min(arrived, cap); k++) {
        const grow = k === arrived - 1 ? ease(clamp(since / 0.35)) : 1, sI = senders[k % senders.length];
        g.fillStyle = k === arrived - 1 ? F.acc(0.9) : sI % 2 ? F.grey(0.95) : F.grey(0.7);
        g.fillRect(bx + k * segW + 1.5 * u, by, (segW - 3 * u) * grow, 30 * u);
      }
      txt(g, arrived ? `latest from the ${d.badges[senders[(arrived - 1) % senders.length] % d.badges.length] || "team"}` : "first note on its way", bx, by + 72 * u, 30 * u, { italic: true, color: F.ink(0.62), q: span(q, 0.4, 0.8), maxW: bw2 });
    }
    // The side column: the head-count.
    const sq = 1, vq = ease(span(q, 0, 0.55));
    const R = tall ? { x: A.x, y: FA.y + FA.h + 40 * u, w: A.w } : { x: A.x + A.w * 0.79, y: A.y + 6 * u, w: A.w * 0.21 };
    pen(g, F.ink(0.9), 3 * u); line(g, [[R.x, R.y], [R.x + R.w, R.y]], sq);
    txt(g, "IN THE LOOP", R.x, R.y + 42 * u, 24 * u, { font: "sans", weight: 700, track: 0.16, color: F.acc(1), q: sq });
    txt(g, String(Math.round(n * vq)), R.x - 6 * u, R.y + (tall ? 200 : 210) * u, 170 * u, { weight: 700, color: F.ink(0.94) });
    const hb = d.badges[hot % d.badges.length] || "";
    if (tall) {
      txt(g, "people", R.x + 150 * u, R.y + 140 * u, 42 * u, { font: "sans", color: F.ink(0.8), q: span(q, 0.5, 0.8) });
      if (hb) txt(g, `${hb}, highlighted`, R.x + 150 * u, R.y + 196 * u, 42 * u, { font: "sans", weight: 700, color: F.acc(1), q: span(q, 0.6, 0.9), maxW: R.w - 160 * u, min: 28 * u });
    } else {
      txt(g, "people", R.x, R.y + 270 * u, 42 * u, { font: "sans", color: F.ink(0.8), q: span(q, 0.5, 0.8) });
      pen(g, F.ink(0.3), 1.2 * u); line(g, [[R.x, R.y + 318 * u], [R.x + R.w, R.y + 318 * u]], span(q, 0.55, 0.8));
      txt(g, "HIGHLIGHTED", R.x, R.y + 362 * u, 24 * u, { font: "sans", weight: 700, track: 0.16, color: F.ink(0.6), q: span(q, 0.6, 0.85) });
      txt(g, hb, R.x, R.y + 422 * u, 42 * u, { font: "sans", weight: 700, color: F.acc(1), q: span(q, 0.65, 0.95), maxW: R.w, min: 28 * u });
    }
  }

  // ---- FIG: three numbered steps, a token that keeps making the rounds ---------------------------------
  function stepIcon(g, F, kind, cx, cy, s, color, q) {
    const u = F.u;
    pen(g, color, 3.2 * u);
    if (kind === 0) {
      line(g, [[cx - s * 0.3, cy - s * 0.42], [cx + s * 0.14, cy - s * 0.42], [cx + s * 0.32, cy - s * 0.24], [cx + s * 0.32, cy + s * 0.42], [cx - s * 0.3, cy + s * 0.42], [cx - s * 0.3, cy - s * 0.42]], q);
      for (let k = 0; k < 3; k++) line(g, [[cx - s * 0.16, cy - s * 0.08 + k * s * 0.16], [cx + s * (k === 2 ? 0.04 : 0.18), cy - s * 0.08 + k * s * 0.16]], span(q, 0.5 + k * 0.15, 0.8 + k * 0.1));
    } else if (kind === 1) {
      const a = -Math.PI / 4, c = Math.cos(a), sn = Math.sin(a), L = s * 0.7, W2 = s * 0.12;
      const P = (x, y) => [cx + x * c - y * sn, cy + x * sn + y * c];
      line(g, [P(-L / 2, -W2), P(L / 2 - L * 0.2, -W2), P(L / 2, 0), P(L / 2 - L * 0.2, W2), P(-L / 2, W2), P(-L / 2, -W2)], q);
      line(g, [P(-L / 2 + L * 0.16, -W2), P(-L / 2 + L * 0.16, W2)], span(q, 0.6, 0.8));
      line(g, bez(cx - s * 0.42, cy + s * 0.44, cx - s * 0.1, cy + s * 0.3, cx + s * 0.3, cy + s * 0.46, 16), span(q, 0.7, 1));
    } else {
      line(g, [[cx - s * 0.34, cy + s * 0.02], [cx - s * 0.08, cy + s * 0.28], [cx + s * 0.38, cy - s * 0.3]], q);
    }
  }
  function process(g, F, A, q, d, ti) {
    const { u, tall } = F, steps = d.steps, n = steps.length;
    const R = (tall ? 84 : 78) * u;
    const C = (i) => tall ? { cx: A.x + R + 6 * u, cy: A.y + R + 20 * u + (i * (A.h - R * 2 - 60 * u)) / Math.max(1, n - 1) } : { cx: A.x + (A.w * (i + 0.5)) / n, cy: A.y + R + 20 * u };
    // Token schedule: dwell at each step, travel between them, then begin again.
    const be = Math.min(2, ti.hold * 0.52) + 0.1, period = 3.6;
    let f = -1, ta = 0;
    if (ti.local > be) {
      const ph = ((ti.local - be) / period) % 1;
      const seq = [[0, 0.16, 0, 0], [0.16, 0.36, 0, 1], [0.36, 0.52, 1, 1], [0.52, 0.72, 1, 2], [0.72, 1, 2, 2]];
      for (const [a, b, s0, s1] of seq) if (ph >= a && ph < b) { f = lerp(s0, s1, inout((ph - a) / (b - a))); break; }
      ta = clamp(ph / 0.05) * clamp((1 - ph) / 0.08);
      if ((ti.local - be) < period) ta = clamp(ph / 0.05) * (ph > 0.92 ? clamp((1 - ph) / 0.08) : 1);
    }
    const active = f >= 0 && Math.abs(f - Math.round(f)) < 0.02 ? Math.round(f) : -1;
    // Connectors.
    for (let i = 0; i < n - 1; i++) {
      const a = C(i), b = C(i + 1), cq = 1;
      const p0 = tall ? [a.cx, a.cy + R + 14 * u] : [a.cx + R + 14 * u, a.cy], p1 = tall ? [b.cx, b.cy - R - 14 * u] : [b.cx - R - 14 * u, b.cy];
      pen(g, F.ink(0.45), 2 * u, [3 * u, 9 * u]); line(g, [p0, p1], cq);
      if (cq >= 1) head(g, p1[0], p1[1], tall ? Math.PI / 2 : 0, 18 * u, F.ink(0.7));
      if (f > i) { const k = clamp(f - i); pen(g, F.acc(0.9 * ta), 4 * u); line(g, [p0, [lerp(p0[0], p1[0], k), lerp(p0[1], p1[1], k)]]); }
    }
    steps.forEach((label, i) => {
      const { cx, cy } = C(i), k = span(q, i * 0.12, 0.35 + i * 0.12), isAct = active === i, last = i === n - 1;
      g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fillStyle = F.ink(0.04); g.fill();
      pen(g, isAct ? F.acc(1) : F.ink(0.88), (isAct ? 3.4 : 2.4) * u); line(g, arcPts(cx, cy, R, -Math.PI / 2, Math.PI * 1.5));
      if (isAct) {
        const ph = ((ti.local - be) / period) % 1, rk = (ph * 6) % 1;
        g.beginPath(); g.arc(cx, cy, R * (1.05 + 0.3 * rk), 0, TAU); pen(g, F.acc(0.6 * (1 - rk)), 2.4 * u); g.stroke();
      }
      stepIcon(g, F, i % 3 === 2 || (last && n < 3) ? 2 : i % 3, cx, cy, R * 1.05, isAct || (last && active < 0) ? F.acc(1) : F.ink(0.9), span(k, 0.3, 1));
      const nq = span(q, 0.05 + i * 0.1, 0.3 + i * 0.1);
      if (tall) {
        const tx = cx + R + 48 * u;
        txt(g, String(i + 1), tx, cy - 6 * u, 110 * u, { weight: 700, color: isAct ? F.acc(1) : F.grey(1), q: nq });
        const w = txt(g, label || "", tx, cy + 62 * u, 50 * u, { weight: 700, color: F.ink(0.94), q: span(nq, 0.3, 1), maxW: A.x + A.w - tx, min: 32 * u });
        if (isAct) { g.fillStyle = F.acc(1); g.fillRect(tx, cy + 78 * u, Math.min(w, A.x + A.w - tx), 5 * u); }
      } else {
        const ny = cy + R + 118 * u, cw = A.w / n;
        txt(g, String(i + 1), cx, ny, 112 * u, { weight: 700, align: "center", color: isAct ? F.acc(1) : F.grey(1), q: nq });
        const w = txt(g, label || "", cx, ny + 70 * u, 52 * u, { weight: 700, align: "center", color: F.ink(0.94), q: span(nq, 0.3, 1), maxW: cw * 0.88, min: 32 * u });
        const uw = Math.min(w, cw * 0.88);
        if (isAct) { g.fillStyle = F.acc(1); g.fillRect(cx - uw / 2, ny + 88 * u, uw, 5 * u); }
        else { g.fillStyle = F.ink(0.2 * nq); g.fillRect(cx - uw / 2, ny + 88 * u, uw, 1.4 * u); }
      }
    });
    // A strip chart under the steps: the card's path traced over the last few seconds, scrolling left.
    if (!tall) {
      const ny = C(0).cy + R + 262 * u, S0 = { x: A.x, y: ny + 52 * u, w: A.w, h: A.y + A.h - ny - 56 * u };
      if (S0.h > 110 * u) {
        const sq = span(q, 0.35, 0.8), win = 4.6;
        const fAt = (L) => {
          if (L <= be) return 0;
          const ph = ((L - be) / period) % 1;
          const seq = [[0, 0.16, 0, 0], [0.16, 0.36, 0, 1], [0.36, 0.52, 1, 1], [0.52, 0.72, 1, 2], [0.72, 0.9, 2, 2], [0.9, 1, 2, 0]];
          for (const [a, b, s0, s1] of seq) if (ph >= a && ph < b) return lerp(s0, s1, inout((ph - a) / (b - a)));
          return 0;
        };
        const round = ti.local > be ? Math.floor((ti.local - be) / period) + 1 : 0;
        g.fillStyle = F.ink(0.88); g.fillRect(S0.x, ny - 6 * u, S0.w * ease(sq), 2.4 * u);
        const kw = txt(g, "THE CARD'S PATH", S0.x, ny + 26 * u, 24 * u, { font: "sans", weight: 700, track: 0.16, color: F.acc(1), q: sq });
        txt(g, round ? `round ${round}, live` : "waiting for a draft", S0.x + kw + 22 * u, ny + 26 * u, 30 * u, { italic: true, color: F.ink(0.62), q: span(q, 0.5, 0.9) });
        const lx = S0.x + 290 * u, lw2 = S0.w - 290 * u, top = S0.y + 16 * u, bot = S0.y + S0.h - 12 * u;
        const yOf = (v) => lerp(bot, top, v / Math.max(1, n - 1));
        for (let i = 0; i < n; i++) {
          const y = yOf(i);
          pen(g, F.ink(i ? 0.14 : 0.5), (i ? 1.2 : 2) * u); line(g, [[lx, y], [lx + lw2, y]], sq);
          txt(g, steps[i] || "", lx - 22 * u, y + 11 * u, 32 * u, { font: "sans", align: "right", color: F.ink(0.75), q: sq, maxW: 260 * u, min: 22 * u });
        }
        // Second ticks drift left with time, like the scale on a recorder.
        for (let s = Math.ceil(ti.local - win); s <= ti.local; s++) {
          const x = lx + lw2 * (1 - (ti.local - s) / win);
          g.fillStyle = F.ink(0.3 * sq); g.fillRect(x - 0.6 * u, bot + 4 * u, 1.2 * u, 10 * u);
        }
        if (sq > 0) {
          const pts = [];
          for (let k = 0; k <= 130; k++) { const L = ti.local - win + (win * k) / 130; if (L < 0) continue; pts.push([lx + (lw2 * k) / 130, yOf(fAt(L))]); }
          g.save(); g.beginPath(); g.rect(lx, top - 20 * u, lw2 * sq, bot - top + 40 * u); g.clip();
          if (pts.length > 1) {
            g.beginPath(); g.moveTo(pts[0][0], bot); pts.forEach((p) => g.lineTo(p[0], p[1])); g.lineTo(pts[pts.length - 1][0], bot); g.closePath();
            g.fillStyle = F.acc(0.1); g.fill();
            pen(g, F.acc(1), 3.2 * u); line(g, pts);
            const e = pts[pts.length - 1];
            g.beginPath(); g.arc(e[0], e[1], 8 * u, 0, TAU); g.fillStyle = F.acc(1); g.fill();
            g.beginPath(); g.arc(e[0], e[1], 8 * u + 10 * u * ((ti.local * 1.6) % 1), 0, TAU); pen(g, F.acc(0.5 * (1 - ((ti.local * 1.6) % 1))), 2 * u); g.stroke();
          }
          g.restore();
        }
      }
    }
    // The token itself.
    if (f >= 0 && ta > 0) {
      const a = C(Math.floor(f)), b = C(Math.min(n - 1, Math.floor(f) + 1)), k = f - Math.floor(f);
      const x = lerp(a.cx, b.cx, k), y = lerp(a.cy, b.cy, k) - (active >= 0 ? 0 : 0);
      const tx = tall ? x : x, ty = tall ? y : y - R - 30 * u;
      g.save(); g.globalAlpha *= ta;
      g.beginPath(); g.arc(tx, ty, 15 * u, 0, TAU); g.fillStyle = F.acc(1); g.fill(); pen(g, F.T.paper, 3 * u); g.stroke();
      if (!tall) { pen(g, F.acc(0.6), 1.6 * u); line(g, [[tx, ty + 15 * u], [tx, ty + 26 * u]]); }
      g.restore();
    }
  }

  // ---- FIG: a slope from before to after, and the change in big type -----------------------------------
  function compare(g, F, A, q, d, ti) {
    const { u, tall, t } = F;
    const a = Math.max(0, Number(d.leftValue) || 0), b = Math.max(0, Number(d.rightValue) || 0), mx = Math.max(a, b, 1e-6);
    const stepV = niceStep((mx * 1.15) / 4), topV = Math.max(stepV, Math.ceil((mx * 1.15) / stepV) * stepV);
    const S = tall ? { x: A.x, y: A.y, w: A.w, h: A.h * 0.5 } : { x: A.x, y: A.y, w: A.w * 0.5, h: A.h };
    const top = S.y + 34 * u, bot = S.y + S.h - 86 * u, xl = S.x + S.w * 0.3, xr = S.x + S.w * 0.8;
    const ticks = Math.round(topV / stepV);
    for (let i = 0; i <= ticks; i++) {
      const v = i * stepV, y = bot - (v / topV) * (bot - top), gq = 1;
      pen(g, i ? F.ink(0.17) : F.ink(0.85), i ? 1.2 * u : 2.4 * u); line(g, [[S.x, y], [S.x + S.w, y]], gq);
      if (i) txt(g, fmt(v, i === ticks ? d : null), S.x, y - 10 * u, 30 * u, { font: "sans", color: F.ink(0.55), q: gq });
    }
    const aq = 1;
    pen(g, F.ink(0.55), 1.4 * u); line(g, [[xl, bot], [xl, top]], aq); line(g, [[xr, bot], [xr, top]], aq);
    txt(g, d.left || "", xl, bot + 58 * u, 42 * u, { font: "sans", weight: 700, align: "center", color: F.ink(0.7), q: span(q, 0, 0.2), maxW: S.w * 0.46, min: 28 * u });
    txt(g, d.right || "", xr, bot + 58 * u, 42 * u, { font: "sans", weight: 700, align: "center", color: F.acc(1), q: span(q, 0.05, 0.25), maxW: S.w * 0.46, min: 28 * u });
    const ya = bot - (a / topV) * (bot - top), yb = bot - (b / topV) * (bot - top), lq = span(q, 0.1, 0.5);
    pen(g, F.acc(1), 5 * u); const tip = line(g, [[xl, ya], [xr, yb]], lq);
    if (lq >= 1) { pen(g, F.T.paper, 2.4 * u, [3 * u, 22 * u]); g.lineDashOffset = -t * 40 * u; line(g, [[xl, ya], [xr, yb]]); g.lineDashOffset = 0; g.setLineDash([]); }
    if (aq > 0.5) { g.beginPath(); g.arc(xl, ya, 13 * u, 0, TAU); g.fillStyle = F.grey(1); g.fill(); pen(g, F.T.paper, 3 * u); g.stroke(); }
    if (tip) { g.beginPath(); g.arc(tip[0], tip[1], 14 * u, 0, TAU); g.fillStyle = F.acc(1); g.fill(); pen(g, F.T.paper, 3 * u); g.stroke(); }
    if (lq >= 1) { const rk = ((t * 0.7) % 1); g.beginPath(); g.arc(xr, yb, 14 * u + rk * 34 * u, 0, TAU); pen(g, F.acc(0.6 * (1 - rk)), 2.4 * u); g.stroke(); }
    const vq = ease(span(q, 0.1, 0.6));
    if (vq > 0) {
      txt(g, tally(a, vq, d), xl - 30 * u, ya + 22 * u, 64 * u, { font: "sans", weight: 700, align: "right", color: F.ink(0.62), maxW: xl - S.x - 40 * u, min: 36 * u });
      txt(g, tally(b, vq, d), xr + 30 * u, yb + 22 * u, 64 * u, { font: "sans", weight: 700, color: F.acc(1), maxW: S.x + S.w - xr + 60 * u, min: 36 * u });
    }
    // The change, set big, with a dumbbell of the two values beneath.
    const R = tall ? { x: A.x, y: S.y + S.h + 40 * u, w: A.w } : { x: A.x + A.w * 0.58, y: A.y + 6 * u, w: A.w * 0.42 };
    const sq = 1, cq = ease(span(q, 0, 0.7));
    pen(g, F.ink(0.9), 3 * u); line(g, [[R.x, R.y], [R.x + R.w, R.y]], sq);
    txt(g, "THE CHANGE", R.x, R.y + 42 * u, 24 * u, { font: "sans", weight: 700, track: 0.16, color: F.acc(1), q: sq });
    let big;
    if (a > 0) { const pc = ((b - a) / a) * 100 * cq; big = `${pc > 0.5 ? "+" : pc < -0.5 ? "−" : ""}${Math.abs(Math.round(pc))}%`; }
    else big = `${b - a >= 0 ? "+" : "−"}${fmt(Math.abs(b - a) * cq, d, decs(b - a))}`;
    txt(g, big, R.x - 6 * u, R.y + 200 * u, 172 * u, { weight: 700, color: F.acc(1), maxW: R.w, min: 96 * u });
    txt(g, `${d.left || "Before"} to ${d.right || "after"}`, R.x, R.y + 262 * u, 42 * u, { font: "sans", color: F.ink(0.85), q: span(q, 0.3, 0.6), maxW: R.w, min: 28 * u });
    const rows = [[d.left, a, F.grey(1), F.ink(0.7)], [d.right, b, F.acc(1), F.acc(1)]];
    pen(g, F.ink(0.3), 1.2 * u); line(g, [[R.x, R.y + 300 * u], [R.x + R.w, R.y + 300 * u]]);
    rows.forEach(([label, v, col, tcol], i) => {
      const y = R.y + 356 * u + i * 118 * u, k = ease(span(q, 0.35 + i * 0.1, 0.75 + i * 0.1)), bw = (R.w - 170 * u) * (v / mx) * k;
      txt(g, label || "", R.x, y, 34 * u, { font: "sans", color: F.ink(0.7), q: span(q, 0.05 + i * 0.1, 0.3 + i * 0.1), maxW: R.w, min: 26 * u });
      g.fillStyle = F.ink(0.08); g.fillRect(R.x, y + 18 * u, R.w - 170 * u, 26 * u);
      g.fillStyle = col; g.fillRect(R.x, y + 18 * u, bw, 26 * u);
      if (k > 0.02) txt(g, tally(v, k, d), R.x + bw + 16 * u, y + 46 * u, 46 * u, { font: "sans", weight: 700, color: tcol });
    });
  }

  // ---- the front page and the last column -------------------------------------------------------------
  function contents(g, F, q) {
    const { u, W, tall, side } = F, P = F.plan;
    const items = P ? P.figs.map((id) => [id, P.c[`${id}_title`] || ""]) : [];
    if (!items.length) return;
    if (tall) {
      txt(g, "IN THIS EXPLAINER", side, 182 * u, 22 * u, { font: "sans", weight: 700, track: 0.18, color: F.acc(1), q });
      items.forEach(([, words], i) => {
        const y = 230 * u + i * 46 * u, k = span(q, 0.1 + i * 0.1, 0.5 + i * 0.1);
        txt(g, `${i + 1}`, side, y, 26 * u, { font: "sans", weight: 700, color: F.acc(1), q: k });
        txt(g, words, side + 40 * u, y, 28 * u, { color: F.ink(0.82), q: k, maxW: W - side * 2 - 40 * u, min: 20 * u });
      });
      return;
    }
    const y = 118 * u, cw = (W - side * 2) / items.length;
    items.forEach(([, words], i) => {
      const x = side + i * cw, k = span(q, 0.08 + i * 0.1, 0.45 + i * 0.1);
      if (i) { g.fillStyle = F.ink(0.25 * k); g.fillRect(x - 1, y - 26 * u, 1.2 * u, 66 * u); }
      txt(g, `FIG. ${i + 1}`, x + (i ? 18 : 0) * u, y, 20 * u, { font: "sans", weight: 700, track: 0.16, color: F.acc(1), q: k });
      txt(g, words, x + (i ? 18 : 0) * u, y + 32 * u, 26 * u, { color: F.ink(0.8), q: k, maxW: cw - 30 * u, min: 18 * u });
    });
    g.fillStyle = F.ink(0.3); g.fillRect(side, y + 56 * u, (W - side * 2) * ease(q), 1.2 * u);
  }
  const titleBottom = (F) => { const L = headLines("title"); return L.length ? Math.max(...L.map((l) => l.y + l.h)) : F.H * 0.6; };
  // The front page's contents row and standfirst stay with the headline; the index below scrolls.
  function titleFurniture(g, F, local) {
    const { u, side } = F;
    contents(g, F, 1);
    const first = headLines("title")[0], tb = titleBottom(F);
    const P = F.plan, k = P ? P.figs.length : 0;
    const mq = span(local, 0.5, 1.2), mx = first ? first.x : side;
    g.fillStyle = F.acc(1); g.fillRect(mx, tb + 30 * u, 56 * u * ease(mq), 4 * u);
    txt(g, k ? `ILLUSTRATED EXPLAINER  ·  ${k} FIGURE${k === 1 ? "" : "S"}` : "ILLUSTRATED EXPLAINER", mx, tb + 72 * u, 24 * u, { font: "sans", weight: 700, track: 0.16, color: F.ink(0.66), q: mq });
  }
  function titleArt(g, F, local, hold) {
    const { u, W, H, tall, side, t } = F;
    const tb = titleBottom(F);
    // A live index scrolls along the foot of the front page.
    const y0 = tb + (tall ? 170 : 120) * u, y1 = tickerTop(F) - (tall ? 60 : 34) * u;
    if (y1 - y0 < 80 * u) return;
    const Pn = { x: side, y: y0, w: W - side * 2, h: y1 - y0 };
    for (let i = 0; i <= 3; i++) { const y = Pn.y + (Pn.h * i) / 3; pen(g, i === 3 ? F.ink(0.7) : F.ink(0.14), i === 3 ? 2 * u : 1.1 * u); line(g, [[Pn.x, y], [Pn.x + Pn.w, y]], span(local, i * 0.08, 0.6 + i * 0.08)); }
    txt(g, "Illustrative index", Pn.x, Pn.y - 12 * u, 24 * u, { italic: true, color: F.ink(0.6) });
    const N = 96, step = Pn.w / (N - 1), o = t * 4.5, base = Math.floor(o), fr = o - base;
    const series = (seed, lvl, trend, amp) => {
      const pts = [];
      for (let i = 0; i <= N; i++) {
        const idx = base + i, x = Pn.x + (i - fr) * step;
        if (x < Pn.x - step || x > Pn.x + Pn.w + step) continue;
        const v = lvl + trend * Math.sin(idx * 0.021 + seed) + amp * (noise(idx * 0.16, seed) - 0.5) + amp * 0.45 * (noise(idx * 0.6, seed + 3) - 0.5);
        pts.push([clamp(x, Pn.x, Pn.x + Pn.w), Pn.y + Pn.h * (1 - clamp(v, 0.04, 0.96))]);
      }
      return pts;
    };
    g.save(); g.beginPath(); g.rect(Pn.x, Pn.y - 30 * u, Pn.w, Pn.h + 32 * u); g.clip();
    [[3, 0.3, 0.06, 0.2], [11, 0.46, 0.05, 0.18], [19, 0.2, 0.04, 0.14]].forEach(([s, l, tr, am]) => { pen(g, F.grey(0.95), 1.8 * u); line(g, series(s, l, tr, am)); });
    const main = series(27, 0.62, 0.14, 0.32), mqk = span(local, 0.2, 2.0);
    const shown = main.slice(0, Math.max(2, Math.ceil(main.length * ease(mqk))));
    g.beginPath(); shown.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.lineTo(shown[shown.length - 1][0], Pn.y + Pn.h); g.lineTo(shown[0][0], Pn.y + Pn.h); g.closePath(); g.fillStyle = F.acc(0.1); g.fill();
    pen(g, F.acc(1), 4 * u); line(g, shown);
    g.restore();
    const e = shown[shown.length - 1];
    if (mqk > 0.05) {
      const rk = (t * 0.8) % 1;
      g.beginPath(); g.arc(e[0], e[1], 9 * u + rk * 26 * u, 0, TAU); pen(g, F.acc(0.6 * (1 - rk)), 2.2 * u); g.stroke();
      g.beginPath(); g.arc(e[0], e[1], 9 * u, 0, TAU); g.fillStyle = F.acc(1); g.fill(); pen(g, F.T.paper, 2.6 * u); g.stroke();
    }
  }
  function mini(g, F, id, d, x, y, w, h, q) {
    const u = F.u;
    if (id === "chart") {
      const vals = (d.values || []).map((v) => Math.max(0, Number(v) || 0)), mx = Math.max(...vals, 1e-6), bw = w / vals.length;
      vals.forEach((v, i) => { const hh = h * 0.9 * (v / mx) * ease(span(q, i * 0.15, 0.5 + i * 0.15)); g.fillStyle = i === d.highlight ? F.acc(1) : F.grey(0.9); g.fillRect(x + i * bw + bw * 0.2, y + h - hh, bw * 0.6, hh); });
      g.fillStyle = F.ink(0.8); g.fillRect(x, y + h, w, 2 * u);
    } else if (id === "object") {
      const ww = Math.min(w, h * 1.5), xx = x + (w - ww) / 2;
      pen(g, F.ink(0.85), 2 * u); line(g, rectPts(xx, y, ww, h), q);
      g.fillStyle = F.grey(0.7); g.fillRect(xx + 8 * u, y + 8 * u, (ww - 16 * u) * q, h * 0.5);
      g.beginPath(); g.arc(xx + ww * 0.64, y + h * 0.26, h * 0.1 * q, 0, TAU); g.fillStyle = F.acc(1); g.fill();
      for (let k = 0; k < 3; k++) { g.fillStyle = k === 0 ? F.acc(0.9) : F.grey(0.9); g.fillRect(xx + 8 * u + k * ww * 0.08, y + h * 0.66 + k * h * 0.1, (ww * 0.5) * q, h * 0.06); }
    } else if (id === "people") {
      const n = clamp(Math.round(Number(d.count) || 4), 2, 6), sl = w / n;
      for (let i = 0; i < n; i++) { const k = ease(span(q, i * 0.1, 0.5 + i * 0.1)); if (k > 0) { g.save(); g.globalAlpha *= k; figure(g, x + sl * (i + 0.5), y + h, Math.min(h, sl * 1.3) * 0.95, i === Math.min(n - 1, 1) ? F.acc(1) : F.grey(0.9)); g.restore(); } }
    } else if (id === "process") {
      const r = Math.min(h * 0.3, w / 8);
      for (let i = 0; i < 3; i++) {
        const cx = x + w * (i + 0.5) / 3, cy = y + h / 2;
        pen(g, i === 2 ? F.acc(1) : F.ink(0.85), 2.2 * u); line(g, arcPts(cx, cy, r, -Math.PI / 2, Math.PI * 1.5, 24), span(q, i * 0.2, 0.5 + i * 0.2));
        if (i < 2) { pen(g, F.ink(0.5), 1.6 * u, [2 * u, 5 * u]); line(g, [[cx + r + 6 * u, cy], [cx + w / 3 - r - 6 * u, cy]], span(q, 0.3 + i * 0.2, 0.6 + i * 0.2)); }
      }
    } else if (id === "compare") {
      const a = Number(d.leftValue) || 0, b = Number(d.rightValue) || 0, mx = Math.max(a, b, 1e-6);
      const p0 = [x + w * 0.2, y + h - h * 0.9 * (a / mx)], p1 = [x + w * 0.8, y + h - h * 0.9 * (b / mx)];
      pen(g, F.ink(0.4), 1.2 * u); line(g, [[p0[0], y + h], [p0[0], y]]); line(g, [[p1[0], y + h], [p1[0], y]]);
      pen(g, F.acc(1), 3.4 * u); const tip = line(g, [p0, p1], q);
      g.beginPath(); g.arc(p0[0], p0[1], 6 * u, 0, TAU); g.fillStyle = F.grey(1); g.fill();
      if (tip) { g.beginPath(); g.arc(tip[0], tip[1], 6.5 * u, 0, TAU); g.fillStyle = F.acc(1); g.fill(); }
    }
  }
  // The end mark: a claret square set after the last word.
  function endMark(g, F, local) {
    const lines = headLines("closing"), L = lines[lines.length - 1];
    if (!L) return;
    const k = ease(span(local, 0.7, 1.0)), s = L.h * 0.3 * k * (1 + 0.04 * Math.sin(local * 3));
    g.fillStyle = F.acc(1); g.fillRect(L.x + L.w + L.h * 0.22, L.y + L.h * 0.72 - s, s, s);
    // Set as a pull quote: a kicker over a short rule above the first line.
    const L0 = lines[0], u = F.u, kq = span(local, 0, 0.6);
    g.fillStyle = F.ink(0.9); g.fillRect(L0.x, L0.y - 54 * u, 120 * u * ease(kq), 3 * u);
    g.fillStyle = F.acc(1); g.fillRect(L0.x, L0.y - 54 * u, 34 * u * ease(kq), 3 * u);
    txt(g, "THE TAKEAWAY", L0.x, L0.y - 18 * u, 26 * u, { font: "sans", weight: 700, track: 0.18, color: F.acc(1), q: kq });
  }
  function closingArt(g, F, local, hold) {
    const { u, W, H, tall, side } = F, P = F.plan;
    const lines = headLines("closing");
    const figs = P ? P.figs : [];
    if (!figs.length) return;
    const cb = lines.length ? Math.max(...lines.map((l) => l.y + l.h)) : H * 0.6;
    const y0 = cb + (tall ? 130 : 90) * u, y1 = tickerTop(F) - (tall ? 60 : 34) * u;
    const ch = Math.min((tall ? 220 : 190) * u, y1 - y0);
    if (ch < 110 * u) return;
    const gap = 30 * u, cw = (W - side * 2 - gap * (figs.length - 1)) / figs.length;
    const read = local > 1.3 ? (local - 1.3) / 1.0 : -1;
    figs.forEach((id, i) => {
      const x = side + i * (cw + gap), q = span(local + 0.5, i * 0.1, 0.6 + i * 0.1);
      pen(g, F.ink(0.85), 2 * u); line(g, [[x, y0], [x + cw, y0]]);
      txt(g, `FIG. ${i + 1}`, x, y0 + 32 * u, 20 * u, { font: "sans", weight: 700, track: 0.16, color: F.acc(1) });
      if (q <= 0) return;
      mini(g, F, id, P.data[id], x + 4 * u, y0 + 52 * u, cw - 8 * u, ch - 62 * u, q);
    });
    if (read >= 0) {
      const n = figs.length, pos = read % n, i0 = Math.floor(pos), k = inout(clamp((pos - i0 - 0.6) / 0.4));
      const xa = side + i0 * (cw + gap), xb = side + ((i0 + 1) % n) * (cw + gap);
      const xx = i0 + 1 === n ? lerp(xa, xa, k) : lerp(xa, xb, k);
      const fade = i0 + 1 === n ? 1 - k : 1;
      g.fillStyle = F.acc(fade * clamp(read * 3)); g.fillRect(xx, y0 - 3 * u, cw, 6 * u);
      if (i0 + 1 === n && k > 0) { g.fillStyle = F.acc(k); g.fillRect(side, y0 - 3 * u, cw, 6 * u); }
    }
  }

  // ---- registration ---------------------------------------------------------------------------------
  const DRAW = { chart, object, people, process, compare };
  let frame = null;
  function makeF(ctx, S, info) {
    const T = S.look.tone || TONE;
    const F = {
      g: ctx, S, W: S.W, H: S.H, u: S.u, tall: S.tall, T, info, t: info.t,
      ink: (a) => `rgba(${T.ink},${a})`, grey: (a) => `rgba(${T.grey},${a})`, acc: (a) => hexA(S.accent, a),
    };
    F.side = (F.tall ? 90 : 140) * F.u;
    F.plan = planOf();
    F.change = info.change || (F.plan && F.plan.change) || 0.45;
    return F;
  }
  const scene = (id) => (ctx, S, box, p, d, info) => {
    const F = frame;
    if (!F || !info) return;
    const out = info.exit !== undefined;
    const m = out ? leaving(F, info.exit) : motion(F, info.local, info.hold, F.info.index === 0, !F.info.next);
    if (m.a <= 0.002) return;
    const A = areaOf(F, id), q = out ? 1 : span(info.local + (F.info.index === 0 ? 0.55 : 0.3), 0, Math.min(2.2, info.hold * 0.55));
    const z = 1 + 0.022 * span(info.local, 0, info.hold), cx = A.x + A.w / 2, cy = A.y + A.h / 2;
    ctx.save();
    viewport(ctx, F, A.y - 34 * F.u);
    ctx.globalAlpha *= m.a;
    ctx.translate(0, m.dy);
    ctx.translate(cx, cy); ctx.scale(z, z); ctx.translate(-cx, -cy);
    DRAW[id](ctx, F, A, q, d, { local: info.local, hold: info.hold, t: F.t });
    ctx.restore();
  };
  function statement(ctx, F, id, local, hold, m, last) {
    if (id === "title") {
      const fade = last ? 1 : 1 - span(local, hold - F.change, hold);
      if (fade > 0) { ctx.save(); ctx.globalAlpha *= fade; titleFurniture(ctx, F, local); ctx.restore(); }
    } else endMark(ctx, F, local);
    ctx.save();
    viewport(ctx, F, id === "title" ? titleBottom(F) + 96 * F.u : undefined);
    ctx.translate(0, m.dy);
    if (id === "title") titleArt(ctx, F, local, hold); else closingArt(ctx, F, local, hold);
    ctx.restore();
  }

  const TONE = { paper: "#fbeadc", ink: "40,28,25", grey: "184,166,155", fibre: "122,78,58", lite: "255,250,244", through: 0.014, screen: 0.04, edge: 0.05, mottle: 0.22 };
  return {
    bg: "#fbeadc", panel: "rgba(40,28,25,0.04)", ink: "#281c19", muted: "#6e5a52", accent: "#9b1c3e", onAccent: "#fbefe6",
    rule: "rgba(40,28,25,0.75)", track: "rgba(40,28,25,0.1)",
    display: SERIF, displayWeight: 700, displayCase: "none", displayTracking: "-0.012em",
    body: SANS, bodyWeight: 400,
    figures: SERIF, radius: 2, motion: "wipe", change: "fade", kit: { line: 2.2, fill: "solid", panel: "outline" },
    panelEdge: "rgba(40,28,25,0.45)",
    tone: TONE,
    keepArt: true,
    overlap: true,
    palettes: {
      // White newsprint with a navy series; a night edition; a black-and-grey proof.
      light: { bg: "#f6f3ec", panel: "rgba(26,28,34,0.04)", ink: "#1a1c22", muted: "#5d6068", accent: "#1f4f8f", onAccent: "#ffffff", rule: "rgba(26,28,34,0.75)", track: "rgba(26,28,34,0.08)", panelEdge: "rgba(26,28,34,0.45)",
        backdrop: () => "#f6f3ec", tone: { ...TONE, paper: "#f6f3ec", ink: "26,28,34", grey: "168,166,160", fibre: "90,86,78", lite: "255,255,252", through: 0.03, screen: 0.04, edge: 0.08 } },
      dark: { bg: "#1d1a1a", panel: "rgba(245,228,214,0.05)", ink: "#f4e6da", muted: "#bba99c", accent: "#ef5f7d", onAccent: "#1d1a1a", rule: "rgba(244,230,218,0.7)", track: "rgba(244,230,218,0.1)", panelEdge: "rgba(244,230,218,0.4)",
        backdrop: () => "#1d1a1a", tone: { ...TONE, paper: "#1d1a1a", ink: "244,230,218", grey: "112,100,94", fibre: "0,0,0", lite: "255,235,220", through: 0.025, screen: 0.035, edge: 0.4 } },
      mono: { bg: "#eeede9", panel: "rgba(24,24,24,0.04)", ink: "#181818", muted: "#5f5f5c", accent: "#181818", onAccent: "#eeede9", rule: "rgba(24,24,24,0.75)", track: "rgba(24,24,24,0.08)", panelEdge: "rgba(24,24,24,0.45)",
        backdrop: () => "#eeede9", tone: { ...TONE, paper: "#eeede9", ink: "24,24,24", grey: "172,172,168", fibre: "70,70,66", lite: "255,255,255", through: 0.03, screen: 0.045, edge: 0.09 } },
    },
    textShadow: () => "none",
    backdrop: () => "#fbeadc",
    css: (accent, look) => `
      #root .display { font-variant-numeric: lining-nums; }
      #title-scene .kicker { font-family: ${SANS}; font-weight: 700; letter-spacing: 0.18em; display: flex; align-items: center; gap: 0.7em; text-shadow: none; }
      #title-scene .kicker::before { content: ""; width: 0.72em; height: 0.72em; background: ${accent}; flex: none; }
      #title-scene { top: 24% !important; bottom: auto !important; justify-content: flex-start !important; }
      #title, #closing { font-weight: 700; letter-spacing: -0.018em; line-height: 1.06; }`,
    // Other templates get the newsprint on the texture canvas; here the stage draws it under the art.
    paint: (ctx, W, H, t, accent, look) => {
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(texOf(W, H, Math.min(W, H) / 1080, look.tone || TONE), 0, 0);
    },
    stage(ctx, S, info) {
      const F = (frame = makeF(ctx, S, info));
      if (S.paint) paperPass(ctx, F);
      header(ctx, F);
      const P = F.plan;
      if (info.scene === "title" || info.scene === "closing") statement(ctx, F, info.scene, info.local, info.hold, motion(F, info.local, info.hold, info.index === 0, !info.next), !info.next);
      // The front page has no drawer, so it scrolls away here as the first figure arrives.
      if (P && info.index > 0 && info.local < F.change) {
        const prev = P.shown[info.index - 1];
        if (prev && prev.id === "title") statement(ctx, F, "title", prev.hold + info.local, prev.hold, leaving(F, clamp(info.local / Math.max(0.01, F.change))), false);
      }
      dek(ctx, F);
      footer(ctx, F);
    },
    scenes: { chart: scene("chart"), object: scene("object"), people: scene("people"), process: scene("process"), compare: scene("compare") },
  };
});
