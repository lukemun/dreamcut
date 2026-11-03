// Ballpoint: a notebook page drawn with a blue ballpoint pen. Ruled paper with a red margin and
// punched holes drifts under every scene; strokes are doubled and wobble ("boil") a few times a
// second, start with a little ink blob, and fill with hand hatching. A red pen annotates. A real pen
// follows the line being drawn, then keeps scribbling. Scenes change by scribbling the old drawing
// out with a band of correction tape while the page pans. All drawings are original; frames are
// pure functions of time with seeded noise only.
window.DreamcutMotion.register("ballpoint", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const fr = (v) => v - Math.floor(v);
  const hash = (n) => fr(Math.sin(n * 127.1 + 311.7) * 43758.5453);
  const HAND = "'Bradley Hand', 'Noteworthy', 'Segoe Print', 'Marker Felt', 'Comic Sans MS', cursive";
  const BUB = "'Arial Rounded MT Bold', 'Avenir Next', 'Trebuchet MS', sans-serif";

  // ---- the frame: colours and sizes every drawing needs --------------------------------------------
  function mk(ctx, S, t) {
    const L = S.look;
    return {
      g: ctx, S, L, u: S.u, W: S.W, H: S.H, t, bp: Math.floor(t * 8), tall: S.tall,
      ink: L.ink, red: S.accent, paper: L.bg, muted: L.muted, tex: L.texture, T: L.tone,
      ia: (a) => hexA(L.ink, a), ra: (a) => hexA(S.accent, a),
    };
  }

  // ---- paths: arrays of [x, y] points, sampled finely so a wobble can bend them ---------------------
  const dense = (pts, step = 12) => {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
      for (let k = 1; k <= n; k++) out.push([lerp(x0, x1, k / n), lerp(y0, y1, k / n)]);
    }
    return out;
  };
  const P = {
    line: (x1, y1, x2, y2, bow = 0) => {
      if (!bow) return dense([[x1, y1], [x2, y2]]);
      return P.quad(x1, y1, (x1 + x2) / 2 - (y2 - y1) * bow, (y1 + y2) / 2 + (x2 - x1) * bow, x2, y2);
    },
    quad: (x0, y0, cx, cy, x1, y1) => {
      const pts = [];
      for (let i = 0; i <= 18; i++) { const k = i / 18, m = 1 - k; pts.push([m * m * x0 + 2 * m * k * cx + k * k * x1, m * m * y0 + 2 * m * k * cy + k * k * y1]); }
      return dense(pts);
    },
    bez: (x0, y0, x1, y1, x2, y2, x3, y3) => {
      const pts = [];
      for (let i = 0; i <= 26; i++) { const k = i / 26, m = 1 - k; pts.push([m * m * m * x0 + 3 * m * m * k * x1 + 3 * m * k * k * x2 + k * k * k * x3, m * m * m * y0 + 3 * m * m * k * y1 + 3 * m * k * k * y2 + k * k * k * y3]); }
      return dense(pts);
    },
    ell: (cx, cy, rx, ry, a0 = -Math.PI / 2, a1 = a0 + TAU) => {
      const n = Math.max(10, Math.ceil((Math.abs(a1 - a0) * Math.max(rx, ry)) / 9)), pts = [];
      for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
      return pts;
    },
    rr: (x, y, w, h, r) => {
      r = Math.min(r, w / 2, h / 2);
      const pts = [];
      const arc = (cx, cy, a0) => { for (let i = 0; i <= 5; i++) { const a = a0 + (i * Math.PI) / 10; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
      arc(x + w - r, y + r, -Math.PI / 2); arc(x + w - r, y + h - r, 0); arc(x + r, y + h - r, Math.PI / 2); arc(x + r, y + r, Math.PI);
      pts.push(pts[0]);
      return dense(pts);
    },
    poly: (arr, closed) => dense(closed ? [...arr, arr[0]] : arr),
    head: (x, y, ang, s) => [[x + Math.cos(ang + Math.PI - 0.46) * s, y + Math.sin(ang + Math.PI - 0.46) * s], [x, y], [x + Math.cos(ang + Math.PI + 0.46) * s, y + Math.sin(ang + Math.PI + 0.46) * s]],
  };
  const rot = (pts, cx, cy, a) => pts.map(([x, y]) => { const dx = x - cx, dy = y - cy, c = Math.cos(a), s = Math.sin(a); return [cx + dx * c - dy * s, cy + dx * s + dy * c]; });
  const bbox = (pts) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  const plen = (pts) => { let n = 0; for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return n; };
  const at = (pts, k) => { // the point k (0..1) of the way along a path
    let left = plen(pts) * clamp(k);
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (d >= left) { const m = d ? left / d : 0; return { x: lerp(pts[i - 1][0], pts[i][0], m), y: lerp(pts[i - 1][1], pts[i][1], m), ang: Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]) }; }
      left -= d;
    }
    const n = pts.length - 1;
    return { x: pts[n][0], y: pts[n][1], ang: 0 };
  };

  // ---- the pen: wobbling doubled strokes with an ink blob where each one starts ---------------------
  // list: one path or several; q (0..1) draws that share of their combined length in order.
  function ink(F, list, q, o = {}) {
    if (q <= 0 || !list.length) return null;
    if (typeof list[0][0] === "number") list = [list];
    const g = F.g, u = F.u;
    const lens = list.map(plen), total = lens.reduce((a, b) => a + b, 0) || 1;
    let left = total * clamp(q), tip = null;
    const vis = [];
    for (let k = 0; k < list.length && left > 0; k++) {
      const pts = list[k], seg = [pts[0]];
      let rem = Math.min(left, lens[k]);
      left -= lens[k];
      for (let i = 1; i < pts.length; i++) {
        const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1], d = Math.hypot(dx, dy);
        if (d >= rem) { const m = d ? rem / d : 0; seg.push([pts[i - 1][0] + dx * m, pts[i - 1][1] + dy * m]); rem = 0; break; }
        rem -= d; seg.push(pts[i]);
      }
      vis.push(seg);
    }
    const w = (o.w || 3) * u, amp = (o.amp ?? 1.1) * u * (0.55 + 0.45 * F.tex), seed = o.seed || 0, base = g.globalAlpha, a = o.a ?? 1;
    g.save();
    g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = o.col || F.ink; g.fillStyle = o.col || F.ink;
    if (o.dash) { g.setLineDash(o.dash.map((v) => v * u)); g.lineDashOffset = (o.dashOff || 0) * u; }
    const passes = o.single ? [[1, 1, 0]] : [[1, 1, 0], [0.5, 0.55, 31]];
    for (const [wm, am, so] of passes) {
      g.globalAlpha = base * a * am;
      g.lineWidth = w * wm;
      for (const seg of vis) {
        g.beginPath();
        for (let i = 0; i < seg.length; i++) {
          const x = seg[i][0] + Math.sin(i * 0.83 + seed * 1.9 + so + F.bp * 2.1) * amp, y = seg[i][1] + Math.cos(i * 0.71 + seed * 2.3 + so * 0.7 + F.bp * 1.7) * amp;
          if (i) g.lineTo(x, y); else g.moveTo(x, y);
        }
        g.stroke();
      }
    }
    if (!o.dash && o.blob !== false) {
      g.globalAlpha = base * a * 0.9;
      for (const seg of vis) { g.beginPath(); g.arc(seg[0][0], seg[0][1], w * 0.78, 0, TAU); g.fill(); }
    }
    g.restore();
    const last = vis[vis.length - 1], n = last.length - 1;
    return gtip(g, last[n][0], last[n][1], n ? Math.atan2(last[n][1] - last[n - 1][1], last[n][0] - last[n - 1][0]) : 0);
  }
  // A pen position in page coordinates (x, y) that also keeps the local point (lx, ly) for drawings
  // made inside a rotated card.
  function gtip(g, lx, ly, ang = 0) {
    const m = g.getTransform();
    return { x: m.a * lx + m.c * ly + m.e, y: m.b * lx + m.d * ly + m.f, lx, ly, ang };
  }
  // Clip the segment (x0,y0)-(x1,y1) to a box; null when it misses.
  function clipSeg(x0, y0, x1, y1, b) {
    let t0 = 0, t1 = 1;
    const dx = x1 - x0, dy = y1 - y0;
    const tests = [[-dx, x0 - b.x], [dx, b.x + b.w - x0], [-dy, y0 - b.y], [dy, b.y + b.h - y0]];
    for (const [p, q] of tests) {
      if (p === 0) { if (q < 0) return null; continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    return [x0 + dx * t0, y0 + dy * t0, x0 + dx * t1, y0 + dy * t1];
  }
  // Hand hatching inside a closed path, laid down one stroke at a time, back and forth, as q runs:
  // every stroke appears behind the pen. Returns where the pen is while it hatches.
  function hatch(F, path, bb, q, o = {}) {
    if (q <= 0) return null;
    const g = F.g, u = F.u, seed = o.seed || 0;
    const layers = o.cross ? [o.ang ?? -0.9, (o.ang ?? -0.9) + 1.5] : [o.ang ?? -0.9];
    const gap = (o.gap || 9) * u, D = Math.hypot(bb.w, bb.h) / 2 + 12, cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
    const box = { x: bb.x - 2 * u, y: bb.y - 2 * u, w: bb.w + 4 * u, h: bb.h + 4 * u };
    const lines = [];
    layers.forEach((ang, li) => {
      const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx, row = [];
      let k = 0;
      for (let s = -D; s < D; s += gap, k++) {
        const j = (hash(k * 3.1 + seed + li * 9) - 0.5) * gap * 0.35 + (hash(k * 3.1 + F.bp * 7.7 + seed) - 0.5) * gap * 0.12;
        const sx = cx + nx * (s + j), sy = cy + ny * (s + j);
        const c = clipSeg(sx - dx * D, sy - dy * D, sx + dx * D + (hash(k + F.bp * 3) - 0.5) * 3 * u, sy + dy * D, box);
        if (!c) continue;
        const mx = (c[0] + c[2]) / 2, my = (c[1] + c[3]) / 2;
        row.push({ c, key: o.up ? -my : mx + my * 0.15 });
      }
      row.sort((a, b) => a.key - b.key);
      row.forEach((r, i) => { const c = r.c; lines.push(i % 2 ? [c[2], c[3], c[0], c[1]] : c); });
    });
    if (!lines.length) return null;
    g.save();
    g.beginPath(); path.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
    if (o.hole) { o.hole.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.clip("evenodd"); } else g.clip();
    g.strokeStyle = o.col || F.ink; g.lineWidth = (o.w || 1.4) * u; g.lineCap = "round";
    g.globalAlpha *= o.a ?? 0.75;
    const n = lines.length * clamp(q), full = Math.floor(n), frac = n - full;
    g.beginPath();
    let tx = lines[0][0], ty = lines[0][1];
    for (let i = 0; i < Math.min(full + 1, lines.length); i++) {
      const [x0, y0, x1, y1] = lines[i], k = i < full ? 1 : frac;
      if (k <= 0) break;
      g.moveTo(x0, y0); tx = lerp(x0, x1, k); ty = lerp(y0, y1, k); g.lineTo(tx, ty);
    }
    g.stroke();
    g.restore();
    return gtip(g, tx, ty, -0.9);
  }
  // Outline first, then the same pen hatches the inside, stroke by stroke.
  function shape(F, path, q, o = {}) {
    const tip = ink(F, [path], o.fill === false ? q : span(q, 0, 0.45), o);
    if (o.fill === false) return tip;
    const hq = span(q, 0.45, 1);
    const ht = hatch(F, path, bbox(path), hq, { col: o.hcol || o.col, gap: o.gap, ang: o.ang, cross: o.cross, a: o.ha, up: o.up, seed: o.seed });
    return hq > 0 && hq < 1 ? ht : tip;
  }
  const paperFill = (F, path, a = 1) => {
    const g = F.g;
    if (a <= 0 || path.length < 2) return;
    g.save(); g.globalAlpha *= clamp(a); g.fillStyle = F.paper; g.beginPath(); path.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); g.restore();
  };
  // Paper behind an outline settles in only as the outline closes, never ahead of the pen.
  const sheetFill = (F, path, q) => paperFill(F, path, span(q, 0.8, 1));
  const ghost = (F, list, a = 0.2) => { // pencil guide lines the pen will trace
    const g = F.g;
    g.save(); g.globalAlpha *= a; g.strokeStyle = F.ink; g.lineWidth = 1.6 * F.u; g.setLineDash([9 * F.u, 8 * F.u]);
    if (typeof list[0][0] === "number") list = [list];
    for (const pts of list) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); }
    g.restore();
  };

  // ---- lettering ------------------------------------------------------------------------------------
  function say(F, s, x, y, size, o = {}) {
    s = String(s ?? "");
    const g = F.g;
    if (!s) return 0;
    g.save();
    g.font = `${o.weight || "bold"} ${size}px ${HAND}`;
    let w = g.measureText(s).width;
    if (o.maxW && w > o.maxW) { size = Math.max(o.min || 42 * F.u, (size * o.maxW) / w); g.font = `${o.weight || "bold"} ${size}px ${HAND}`; w = g.measureText(s).width; }
    g.textAlign = "left"; g.textBaseline = o.base || "alphabetic"; g.fillStyle = o.col || F.ink;
    const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    g.translate(x0, y);
    if (o.rot) g.rotate(o.rot);
    const q = o.q ?? 1;
    if (q <= 0) { g.restore(); return w; }
    if (q < 1) { g.beginPath(); g.rect(-6, -size * 1.3, (w + 12) * q, size * 1.8); g.clip(); F.sayTip = gtip(g, (w + 12) * q - 6, -size * 0.25 + Math.sin(q * 40) * size * 0.2, -0.9); }
    g.fillText(s, 0, 0);
    g.restore();
    return w;
  }
  const patCache = {};
  function hatchPattern(g, col, u) {
    const key = col + u;
    if (patCache[key]) return patCache[key];
    const c = document.createElement("canvas");
    c.width = c.height = Math.max(6, Math.round(9 * u));
    const k = c.getContext("2d");
    k.strokeStyle = col; k.lineWidth = 1.4 * u; k.beginPath();
    k.moveTo(-2, c.height + 2); k.lineTo(c.width + 2, -2); k.moveTo(-2, 2); k.lineTo(2, -2); k.moveTo(c.width - 2, c.height + 2); k.lineTo(c.width + 2, c.height - 2);
    k.stroke();
    return (patCache[key] = g.createPattern(c, "repeat"));
  }
  // Bubble letters: thick pen outline, hatched inside, a red offset shadow.
  function bubble(F, s, x, y, size, o = {}) {
    const g = F.g;
    s = String(s);
    g.save();
    g.font = `${size}px ${BUB}`; g.textAlign = o.align || "center"; g.textBaseline = "middle"; g.lineJoin = "round";
    if (o.maxW) { const w = g.measureText(s).width; if (w > o.maxW) { size = Math.max(o.min || 40 * F.u, (size * o.maxW) / w); g.font = `${size}px ${BUB}`; } }
    if (o.pop !== undefined) { g.translate(x, y); const k = o.pop; g.scale(k, k); g.rotate((1 - k) * -0.25); x = 0; y = 0; }
    const sx = size * 0.045, sy = size * 0.055;
    g.strokeStyle = F.ra(0.55); g.lineWidth = size * 0.1; g.strokeText(s, x + sx, y + sy);
    g.strokeStyle = o.col || F.ink; g.lineWidth = size * 0.085; g.strokeText(s, x, y);
    g.fillStyle = F.paper; g.fillText(s, x, y);
    g.globalAlpha *= 0.6; g.fillStyle = hatchPattern(g, o.col || F.ink, F.u); g.fillText(s, x, y);
    g.restore();
  }
  const count = (F, v, d) => window.DreamcutMotion.formatNumber(v, 0, (d && d.prefix) || "", (d && d.suffix) || "");

  // ---- the pen itself ---------------------------------------------------------------------------------
  // Scenes only say where the pen is; the scene wrapper draws one pen per frame, above everything.
  function nib(F, x, y) { F.pen = { x, y }; }
  // A slim stick ballpoint: metal cone, ribbed grip, hexagonal barrel and a cap. It leans away from
  // the line it draws and turns to stay inside the frame near an edge.
  function drawPen(F, x, y) {
    const g = F.g, { u, W, H } = F, Ln = 230 * u, w = 15 * u, m = 26 * u;
    let ang = -1.02;
    const over = x + Math.cos(ang) * Ln - (W - m);
    if (over > 0) ang -= clamp(over / (Ln * 0.75)) * 1.15;
    const top = Ln * 0.86 - (y - m);
    if (top > 0) ang = lerp(ang, x > W * 0.6 ? 2.2 : 0.95, clamp(top / (Ln * 0.55)));
    const ex = x + Math.cos(ang) * Ln;
    if (ex < m) ang = lerp(ang, -1.02, clamp((m - ex) / (Ln * 0.5)));
    ang += Math.sin(F.t * 2.3) * 0.03;
    g.save();
    g.translate(x, y); g.rotate(ang);
    g.save();
    g.shadowColor = "rgba(20,20,40,0.22)"; g.shadowBlur = 8 * u; g.shadowOffsetX = 9 * u; g.shadowOffsetY = 12 * u;
    g.beginPath(); g.moveTo(Ln * 0.02, -w * 0.12); g.lineTo(Ln * 0.11, -w * 0.42); g.lineTo(Ln, -w * 0.5); g.lineTo(Ln, w * 0.5); g.lineTo(Ln * 0.11, w * 0.42); g.lineTo(Ln * 0.02, w * 0.12); g.closePath();
    g.fillStyle = F.T.pen; g.fill();
    g.restore();
    g.fillStyle = "#b9bfcc"; g.beginPath(); g.moveTo(Ln * 0.015, -w * 0.1); g.lineTo(Ln * 0.11, -w * 0.42); g.lineTo(Ln * 0.11, w * 0.42); g.lineTo(Ln * 0.015, w * 0.1); g.closePath(); g.fill();
    g.fillStyle = F.T.penDark; g.fillRect(Ln * 0.11, -w * 0.44, Ln * 0.2, w * 0.88);
    g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 1.2 * u; g.beginPath();
    for (let k = 0; k < 7; k++) { const rx = Ln * (0.13 + k * 0.025); g.moveTo(rx, -w * 0.4); g.lineTo(rx, w * 0.4); }
    g.stroke();
    g.fillStyle = "rgba(255,255,255,0.3)"; g.fillRect(Ln * 0.33, -w * 0.32, Ln * 0.6, w * 0.14);
    g.fillStyle = "rgba(0,0,30,0.2)"; g.fillRect(Ln * 0.33, w * 0.18, Ln * 0.6, w * 0.26);
    g.fillStyle = F.T.penDark; g.fillRect(Ln * 0.93, -w * 0.5, Ln * 0.07, w);
    g.strokeStyle = F.T.penDark; g.lineWidth = 3 * u; g.beginPath(); g.moveTo(Ln * 0.7, -w * 0.5); g.lineTo(Ln * 0.95, -w * 0.62); g.stroke();
    g.fillStyle = F.ink; g.beginPath(); g.arc(0, 0, 2.6 * u, 0, TAU); g.fill();
    g.restore();
  }
  // The pen rests on the end of its last line and scribbles small loops, leaving real ink.
  function scribble(F, tip, since, rx = 36, ry = 18) {
    if (!tip) return;
    const u = F.u, off = (tt) => { const k = eo(span(tt, 0, 0.5)); return [Math.sin(tt * 5.3) * rx * u * k + Math.sin(tt * 2.1) * rx * 0.6 * u * k, Math.cos(tt * 7.1) * ry * u * k]; };
    const trail = [];
    if (since > 0) for (let k = 14; k >= 0; k--) { const tt = since - k * 0.032; if (tt < 0) continue; const o = off(tt); trail.push([tip.x + o[0], tip.y + o[1]]); }
    if (trail.length > 1) ink(F, [trail], 1, { w: 2.4, single: true, blob: false, amp: 0.4 });
    const h = off(Math.max(0, since));
    nib(F, tip.x + h[0], tip.y + h[1]);
  }

  // ---- doodles -----------------------------------------------------------------------------------------
  const D = {
    star(x, y, s, t, k) {
      const pts = [], r0 = -Math.PI / 2 + Math.sin(t * 1.3 + k) * 0.18;
      for (let i = 0; i <= 10; i++) { const r = i % 2 ? s * 0.42 : s, a = r0 + (i * Math.PI) / 5; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
      return [dense(pts)];
    },
    sparkle(x, y, s, t, k) {
      s *= 0.72 + 0.28 * Math.sin(t * 4 + k * 2);
      return [dense([[x, y - s], [x + s * 0.2, y - s * 0.2], [x + s, y], [x + s * 0.2, y + s * 0.2], [x, y + s], [x - s * 0.2, y + s * 0.2], [x - s, y], [x - s * 0.2, y - s * 0.2], [x, y - s]], 10)];
    },
    spiral(x, y, s) {
      const pts = [];
      for (let i = 0; i <= 46; i++) { const a = i * 0.34, r = s * (i / 46); pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
      return [dense(pts, 9)];
    },
    plane(x, y, s, t, k) {
      const a = Math.sin(t * 1.1 + k) * 0.2 - 0.2, by = Math.sin(t * 1.7 + k) * s * 0.12;
      const body = rot([[-s, -0.5 * s], [s, 0], [-0.6 * s, 0.45 * s], [-0.3 * s, 0.05 * s], [-s, -0.5 * s]], 0, 0, a).map(([px, py]) => [px + x, py + y + by]);
      const fold = rot([[-0.3 * s, 0.05 * s], [s, 0]], 0, 0, a).map(([px, py]) => [px + x, py + y + by]);
      return [dense(body, 10), dense(fold, 10)];
    },
    cube(x, y, s, t, k) {
      const b = Math.sin(t * 1.5 + k) * s * 0.06, a = s * 0.7, o = s * 0.34;
      const f = [[x - a / 2, y - a / 2 + b], [x + a / 2, y - a / 2 + b], [x + a / 2, y + a / 2 + b], [x - a / 2, y + a / 2 + b], [x - a / 2, y - a / 2 + b]];
      const bk = f.map(([px, py]) => [px + o, py - o]);
      return [dense(f), dense([bk[0], bk[1], bk[2]]), dense([f[0], bk[0]]), dense([f[1], bk[1]]), dense([f[2], bk[2]])];
    },
    sun(x, y, s, t, k) {
      const out = [P.ell(x, y, s * 0.4, s * 0.4)], r0 = t * 0.5 + k;
      for (let i = 0; i < 9; i++) { const a = r0 + (i * TAU) / 9, l = s * (0.62 + 0.14 * Math.sin(t * 4 + i)); out.push(dense([[x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.55], [x + Math.cos(a) * l, y + Math.sin(a) * l]], 8)); }
      return out;
    },
    cloud(x, y, s, t, k) {
      x += Math.sin(t * 0.7 + k) * s * 0.12;
      return [dense([[x - 0.55 * s, y + 0.22 * s], [x + 0.5 * s, y + 0.22 * s]]).concat(P.ell(x + 0.5 * s, y, 0.22 * s, 0.22 * s, Math.PI / 2, -Math.PI / 2), P.ell(x + 0.12 * s, y - 0.1 * s, 0.3 * s, 0.3 * s, -0.25, -Math.PI + 0.2), P.ell(x - 0.35 * s, y + 0.02 * s, 0.22 * s, 0.22 * s, -Math.PI * 0.3, -Math.PI * 1.5))];
    },
    bolt(x, y, s) { return [dense([[x + 0.1 * s, y - s], [x - 0.35 * s, y + 0.1 * s], [x - 0.02 * s, y + 0.1 * s], [x - 0.15 * s, y + s], [x + 0.4 * s, y - 0.2 * s], [x + 0.05 * s, y - 0.2 * s], [x + 0.1 * s, y - s]], 10)]; },
    heart(x, y, s, t, k) {
      const pts = [], z = 1 + Math.sin(t * 5 + k) * 0.06;
      for (let i = 0; i <= 36; i++) { const a = (i / 36) * TAU; pts.push([x + (16 * Math.pow(Math.sin(a), 3) * s * z) / 17, y - ((13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) * s * z) / 17]); }
      return [dense(pts, 8)];
    },
    mug(x, y, s, t, k) {
      const body = P.rr(x - s * 0.4, y - s * 0.3, s * 0.7, s * 0.8, s * 0.1), out = [body, P.ell(x + s * 0.3, y + s * 0.1, s * 0.22, s * 0.18, -Math.PI / 2, Math.PI / 2)];
      for (let j = 0; j < 2; j++) { const pts = []; for (let i = 0; i <= 12; i++) pts.push([x - s * 0.15 + j * s * 0.3 + Math.sin(i * 0.7 + t * 3 + j) * s * 0.07, y - s * 0.38 - (i / 12) * s * 0.5]); out.push(dense(pts, 8)); }
      return out;
    },
    squig(x, y, s, t) {
      const pts = [];
      for (let i = 0; i <= 30; i++) pts.push([x - s + (i / 30) * s * 2, y + Math.sin(i * 0.8 + t * 2) * s * 0.18]);
      return [dense(pts, 8), P.head(x + s, y + Math.sin(30 * 0.8 + t * 2) * s * 0.18, 0, s * 0.3)];
    },
  };
  const KINDS = ["star", "sparkle", "spiral", "plane", "cube", "sun", "cloud", "bolt", "heart", "mug", "squig"];
  const DOODLES = (() => {
    const R = rng(68), list = [];
    const bands = [[0.05, 0.17], [0.255, 0.315], [0.945, 0.985], [0.05, 0.17], [0.255, 0.315]];
    for (let k = 0; k < 40; k++) {
      const b = bands[k % bands.length];
      list.push({ kind: KINDS[Math.floor(R() * KINDS.length)], x: k * 0.118 + R() * 0.08, y: lerp(b[0], b[1], R()), s: 36 + R() * 24, k: R() * 6, delay: k * 0.03, a: 0.42 + R() * 0.2, red: R() < 0.22 });
    }
    return list;
  })();

  // ---- the page ---------------------------------------------------------------------------------------
  let tile = null, tileKey = "";
  function makeTile(T, tex) {
    const c = document.createElement("canvas");
    c.width = c.height = 600;
    const k = c.getContext("2d"), R = rng(6868);
    for (let i = 0; i < 70; i++) {
      const bx = R() * 600, by = R() * 600, br = 30 + R() * 80, ba = 0.01 + R() * 0.014;
      for (const ox of [-600, 0, 600]) for (const oy of [-600, 0, 600]) {
        const gr = k.createRadialGradient(bx + ox, by + oy, 0, bx + ox, by + oy, br);
        gr.addColorStop(0, `rgba(${T.stain},${ba})`); gr.addColorStop(1, `rgba(${T.stain},0)`);
        k.fillStyle = gr; k.fillRect(bx + ox - br, by + oy - br, br * 2, br * 2);
      }
    }
    for (let i = 0; i < 1000; i++) { k.fillStyle = `rgba(${T.stain},${0.05 + R() * 0.09})`; k.fillRect(R() * 600, R() * 600, 1 + R() * 1.6, 1 + R() * 1.6); }
    k.lineWidth = 1;
    for (let i = 0; i < 160; i++) { const x = R() * 600, y = R() * 600, a = R() * TAU, l = 4 + R() * 12; k.strokeStyle = `rgba(${T.stain},${0.04 + R() * 0.06})`; k.beginPath(); k.moveTo(x, y); k.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); k.stroke(); }
    return c;
  }
  function page(F, info) {
    const g = F.g, { W, H, u, t, T } = F;
    const pos = info.index <= 0 ? 0 : info.index - 1 + eio(span(info.local, 0, info.change * 1.25));
    // Each scene turns to the next sheet, so the binder holes and margin always rest at the left edge.
    const panX = pos * W * 1.5 + Math.sin(t * 0.25) * 34 * u, panY = pos * H * 0.09 + t * 6 * u + Math.sin(t * 0.5) * 5 * u;
    F.panX = panX;
    g.save();
    g.fillStyle = T.paper; g.fillRect(0, 0, W, H);
    const key = T.paper + T.stain;
    if (!tile || tileKey !== key) { tile = makeTile(T); tileKey = key; }
    g.globalAlpha = 0.5 + 0.5 * F.tex;
    g.translate(-(panX % 600), -(panY % 600));
    g.fillStyle = g.createPattern(tile, "repeat"); g.fillRect(0, 0, W + 600, H + 600);
    g.restore();
    // Ruled lines.
    const LH = 58 * u, y0 = -(panY % LH) + LH * 0.5;
    g.save();
    g.strokeStyle = `rgba(${T.line},${T.lineA})`; g.lineWidth = 1.7 * u; g.beginPath();
    for (let y = y0; y < H + LH; y += LH) { g.moveTo(0, y); g.bezierCurveTo(W * 0.3, y + 1.2 * u, W * 0.7, y - 1.2 * u, W, y + 0.6 * u); }
    g.stroke();
    // Margin rules, punched holes and the fold between sheets.
    const pw = W * 1.5;
    for (let k = -1; k < 5; k++) {
      const edge = k * pw - panX;
      if (edge < -pw || edge > W + 100) continue;
      const mx = edge + 150 * u;
      g.strokeStyle = `rgba(${T.margin},0.55)`; g.lineWidth = 2 * u; g.beginPath(); g.moveTo(mx, 0); g.lineTo(mx + 1.5 * u, H); g.moveTo(mx + 9 * u, 0); g.lineTo(mx + 10.5 * u, H); g.stroke();
      for (const hy of [0.17, 0.5, 0.83]) {
        const hx = edge + 62 * u, y = H * hy + 0;
        const gr = g.createRadialGradient(hx - 4 * u, y - 4 * u, 2 * u, hx, y, 26 * u);
        gr.addColorStop(0, T.hole0); gr.addColorStop(1, T.hole1);
        g.fillStyle = gr; g.beginPath(); g.arc(hx, y, 24 * u, 0, TAU); g.fill();
        g.strokeStyle = "rgba(0,0,0,0.18)"; g.lineWidth = 2 * u; g.stroke();
      }
      if (k > 0) {
        const sh = g.createLinearGradient(edge - 70 * u, 0, edge + 40 * u, 0);
        sh.addColorStop(0, "rgba(0,0,0,0)"); sh.addColorStop(0.62, `rgba(${T.stain},0.13)`); sh.addColorStop(0.64, "rgba(255,255,255,0.18)"); sh.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = sh; g.fillRect(edge - 70 * u, 0, 110 * u, H);
      }
    }
    g.restore();
    // Margin doodles drift past, drawing themselves on, faint so they stay behind the art.
    const LW = W * 4.7;
    for (let i = 0; i < DOODLES.length; i++) {
      const d = DOODLES[i];
      const x = ((((d.x * W - panX * 1.18) % LW) + LW) % LW) - W * 0.35, y = d.y * H + Math.sin(t * 0.8 + d.k) * 5 * u;
      if (x < -90 * u || x > W + 90 * u) continue;
      const q = eo(span(t, d.delay - 0.3, d.delay + 0.9));
      g.save(); g.globalAlpha = d.a * (0.5 + 0.5 * F.tex);
      ink(F, D[d.kind](x, y, d.s * u, t, d.k), q, { w: 2.4, col: d.red ? F.red : F.ink, seed: i, single: true, amp: 1.4 });
      g.restore();
    }
    // A soft vignette.
    g.save();
    g.globalAlpha = 0.5 * F.tex;
    const v = g.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.3, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.62);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, `rgba(${T.stain},0.35)`);
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    g.restore();
  }

  // ---- changing scene: the page pans while a band of correction tape is scribbled across -----------
  const frontOf = (F, k) => lerp(-90 * F.u, F.W + 90 * F.u, eio(k));
  function band(F, x) {
    const g = F.g, { u, H, t } = F, R = rng(11);
    const left = [], right = [];
    for (let y = -20; y <= H + 20; y += 28 * u) { left.push([x - 70 * u + (R() - 0.5) * 22 * u, y]); right.push([x + 56 * u + (R() - 0.5) * 22 * u, y]); }
    g.save();
    g.beginPath(); left.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); right.reverse().forEach(([px, py]) => g.lineTo(px, py)); g.closePath();
    g.shadowColor = "rgba(0,0,0,0.25)"; g.shadowBlur = 18 * u; g.fillStyle = F.paper; g.globalAlpha = 0.97; g.fill();
    g.restore();
    const zig = [];
    const rows = 22;
    for (let i = 0; i <= rows; i++) zig.push([x + (i % 2 ? 46 : -54) * u + Math.sin(i * 1.7 + t * 9) * 8 * u, (H * i) / rows]);
    g.save(); g.globalAlpha *= 0.85;
    ink(F, [dense(zig, 20)], 1, { w: 4.4, amp: 2.4, seed: 5, blob: false });
    g.restore();
    // The one pen rides the tear, zigzagging down it; the wrapper hands it on to the new drawing.
    const ny = H * (0.5 + 0.36 * Math.sin(t * 9));
    const fi = clamp(ny / H) * rows, i0 = Math.min(rows - 1, Math.floor(fi));
    return { x: lerp(zig[i0][0], zig[i0 + 1][0], fi - i0), y: ny };
  }
  // Every scene: the new sheet lands under a strip of correction tape; the drawing has already begun
  // beneath it, and the single pen rides the tear before carrying on with the drawing. Late in each
  // hold the pen returns to underline the headline and ink a margin mark, so it never stops working.
  const scene = (fn, name) => (ctx, S, box, p, d, info) => {
    const F = mk(ctx, S, info.t), start = info.t - info.local;
    let front = null;
    const outgoing = info.exit !== undefined;
    const pp = outgoing ? 1 : clamp((info.local + 0.15) / Math.max(0.6, info.hold * 0.45));
    F.pen = null;
    ctx.save();
    if (outgoing) { front = frontOf(F, info.exit); ctx.beginPath(); ctx.rect(front, 0, F.W - front + 2, F.H); ctx.clip(); }
    else if (info.local < info.change && start > 0.01) { front = frontOf(F, info.local / info.change); ctx.beginPath(); ctx.rect(-2, 0, front + 2, F.H); ctx.clip(); }
    const done = fn(F, box, pp, d, info);
    if (name) lateBeat(F, box, info, name, done || info.hold * 0.6);
    ctx.restore();
    if (outgoing) return;
    let pen = F.pen;
    if (front !== null) {
      const bp = band(F, front), k = eio(span(info.local / info.change, 0.45, 1));
      pen = pen ? { x: lerp(bp.x, pen.x, k), y: lerp(bp.y, pen.y, k) } : bp;
    }
    if (pen) drawPen(F, pen.x, pen.y);
  };
  // The headline's place on the page, measured from the template's own heading.
  function headline(F, box, name) {
    const u = F.u, el = typeof document !== "undefined" && document.getElementById(`${name}-title`);
    let w = box.w * 0.45, h = 80 * u;
    if (el && el.textContent) {
      const fs = parseFloat(el.style.fontSize) || 72 * u, g = F.g;
      g.save(); g.font = `${fs}px ${BUB}`; w = Math.min(box.w, g.measureText(el.textContent).width * 1.02); g.restore();
      h = el.offsetHeight || fs * 1.1;
    }
    return { x: box.x, y: (F.tall ? 170 : 96) * u + h + 12 * u, w };
  }
  function lateBeat(F, box, info, name, done) {
    const { u, t } = F, local = info.local;
    const end = info.hold - info.change - 0.05;
    const bs = Math.min(Math.max(done, info.hold - 1.8), end - 0.55), be = Math.min(end, bs + 1.35), L = be - bs;
    if (local < bs) return;
    const hd = headline(F, box, name), x0 = hd.x - 6 * u, x1 = hd.x + hd.w + 8 * u, y = hd.y;
    // These marks belong to the headline, so they leave with it.
    const keep = 1 - span(local, info.hold - info.change, info.hold - info.change * 0.4);
    if (keep <= 0) return;
    F.g.save(); F.g.globalAlpha *= keep;
    // A fast underline that doubles back, then a margin mark beside the headline.
    const ul = [];
    for (let i = 0; i <= 40; i++) { const k = i / 40; ul.push([lerp(x0, x1, k), y + Math.sin(k * 9 + 1) * 3 * u + k * 4 * u]); }
    for (let i = 1; i <= 24; i++) { const k = i / 24; ul.push([lerp(x1 - 10 * u, x0 + (x1 - x0) * 0.35, k), y + 14 * u + Math.sin(k * 7) * 3 * u]); }
    const uq = eo(span(local, bs, bs + L * 0.45));
    let tip = ink(F, [dense(ul, 10)], uq, { w: 3.6, col: F.red, seed: 61, blob: true });
    const kind = { chart: 0, object: 1, people: 2, process: 1, compare: 0 }[name] || 0;
    const mx = Math.min(x1 + 70 * u, F.W - 70 * u), my = y - 42 * u, mq = span(local, bs + L * 0.5, be);
    let mark;
    if (kind === 0) mark = D.star(mx, my, 40 * u, t, 3)[0];
    else if (kind === 1) mark = P.ell(mx, my, 38 * u, 34 * u, -2.2, -2.2 + TAU * 1.12).concat(dense([[mx - 18 * u, my + 2 * u], [mx - 4 * u, my + 16 * u], [mx + 20 * u, my - 18 * u]], 6));
    else mark = D.heart(mx, my, 36 * u, t, 2)[0];
    const r = kind === 1 ? ink(F, [mark], mq, { w: 3.4, col: F.red, seed: 62 }) : shape(F, mark, mq, { w: 3.2, col: F.red, gap: 6, seed: 62, ha: 0.75 });
    F.g.restore();
    if (uq > 0 && uq < 1) nib(F, tip.x, tip.y);
    else if (mq > 0 && mq < 1 && r) nib(F, r.x, r.y);
    else if (local >= be) scribble(F, { x: mx + 54 * u, y: my + 30 * u }, local - be, 22, 10);
    else if (tip) nib(F, tip.x, tip.y);
  }

  // ---- title and closing ------------------------------------------------------------------------------
  function bunting(F, info) {
    const g = F.g, { W, H, u, t } = F, local = info.local;
    const sag = H * 0.05, y0 = H * 0.045;
    const curve = (k) => ({ x: lerp(-30 * u, W + 30 * u, k), y: y0 + Math.sin(k * Math.PI) * sag + Math.sin(k * 9 + t) * 2 * u });
    const string = []; for (let i = 0; i <= 40; i++) { const c = curve(i / 40); string.push([c.x, c.y]); }
    ghost(F, string, 0.25);
    let tip = ink(F, [string], span(local, 0, 0.55), { w: 3, col: F.ink });
    const n = F.tall ? 7 : 11;
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n, c = curve(k), q = eo(span(local, 0.05 + i * 0.05, 0.5 + i * 0.05));
      if (q <= 0) continue;
      const w = Math.min(W / n * 0.8, 150 * u), h = w * 1.05, sw = Math.sin(t * 1.6 + i * 0.9) * 0.14;
      const tri = rot([[c.x - w / 2, c.y], [c.x + w / 2, c.y], [c.x, c.y + h]], c.x, c.y, sw);
      const red = i % 3 === 1;
      paperFill(F, tri, q);
      const tp = shape(F, tri.concat([tri[0]]).length ? dense([...tri, tri[0]], 10) : tri, q, { w: 2.8, col: red ? F.red : F.ink, gap: red ? 7 : 9, cross: red, seed: i, ha: 0.7 });
      if (q > 0.7) ink(F, D.sparkle(c.x + Math.sin(sw) * h * 0.4, c.y + h * 0.42, w * 0.16, t, i), 1, { w: 2, col: F.paper, single: true, blob: false });
      tip = tp || tip;
    }
    return tip;
  }
  function swoosh(F, info, y0, hgt) {
    const { W, u, t } = F, local = info.local;
    const x0 = W * 0.1, x1 = W * 0.9, xl = W * 0.6, R = 52 * u, wave = (x) => y0 + Math.sin((x / W) * 15) * hgt * 0.1 - ((x - x0) / (x1 - x0)) * hgt * 0.1;
    const pts = [];
    for (let i = 0; i <= 50; i++) { const x = lerp(x0, xl, i / 50); pts.push([x, wave(x)]); }
    // A real loop: round once on the spot, then carry on.
    const cy = wave(xl) - R;
    for (let i = 1; i <= 34; i++) { const a = Math.PI / 2 + (i / 34) * TAU * 1.0; pts.push([xl + Math.cos(a) * R * 0.95 + (i / 34) * R * 0.0, cy + Math.sin(a) * R]); }
    for (let i = 1; i <= 46; i++) { const x = lerp(xl, x1, i / 46); pts.push([x, wave(x)]); }
    const path = dense(pts, 12), q = eo(span(local, 0.15, 1.7));
    ghost(F, path, 0.22);
    const tip = ink(F, [path], q, { w: 4.2, seed: 3 });
    const lower = []; for (let i = 0; i <= 30; i++) { const x = lerp(x0 + 40 * u, xl - 120 * u, i / 30); lower.push([x, wave(x) + 24 * u + Math.sin(i * 0.4) * 3 * u]); }
    const tip2 = ink(F, [dense(lower, 12)], span(q, 0.3, 0.9), { w: 3, col: F.red, seed: 9 });
    const e = path[path.length - 1], pe = path[path.length - 4];
    if (q >= 1) ink(F, [P.head(e[0], e[1], Math.atan2(e[1] - pe[1], e[0] - pe[0]), 34 * u)], 1, { w: 4, blob: false });
    const s1 = D.star(W * 0.13, y0 - hgt * 0.4, 46 * u, t, 1), s2 = D.sparkle(W * 0.86, y0 - hgt * 0.5, 40 * u, t, 2), s3 = D.star(W * 0.3, y0 + hgt * 0.5, 30 * u, t, 3);
    ink(F, s1, span(local, 0.9, 1.6), { w: 3, col: F.red }); ink(F, s2, span(local, 1.1, 1.8), { w: 3 }); ink(F, s3, span(local, 1.3, 2.0), { w: 2.6 });
    return { tip: q < 1 ? tip : tip2 || tip, done: q >= 1, end: e };
  }
  function planeFlight(F, local, y0, amp) {
    const { W, u, t } = F, cyc = 5.2, k = fr((local + 0.4) / cyc);
    const xs = lerp(-W * 0.1, W * 1.1, k), pos = (kk) => [lerp(-W * 0.1, W * 1.1, kk), y0 + Math.sin(kk * TAU * 1.5) * amp * u - kk * amp * 0.4 * u];
    const trail = [];
    for (let i = 0; i <= 14; i++) { const kk = k - i * 0.012; if (kk > 0) trail.push(pos(kk)); }
    if (trail.length > 1) ink(F, [trail.reverse()], 1, { w: 2, dash: [8, 12], dashOff: -t * 30, blob: false, a: 0.7, single: true });
    const [px, py] = pos(k);
    ink(F, D.plane(px, py, 40 * u, t, 0), 1, { w: 3 });
    return xs;
  }
  const titleArt = (F, box, p, d, info) => {
    const { W, H, u, t } = F, local = info.local;
    const tipB = bunting(F, info);
    const y0 = H * (F.tall ? 0.83 : 0.84), sw = swoosh(F, info, y0, H * 0.1);
    planeFlight(F, local, H * 0.9, 24);
    if (sw.done) scribble(F, { x: sw.end[0], y: sw.end[1] }, local - 1.7, 40, 20);
    else nib(F, (sw.tip || tipB || { x: W * 0.2, y: H * 0.85 }).x, (sw.tip || tipB || { x: W * 0.2, y: H * 0.85 }).y);
    // Corner ticks of a page being photographed, and a couple of tiny stars that keep turning.
    const corners = [[W * 0.04, H * 0.3], [W * 0.96, H * 0.3], [W * 0.04, H * 0.72], [W * 0.96, H * 0.72]];
    corners.forEach(([x, y], i) => { const q = span(local, 0.6 + i * 0.1, 1.2 + i * 0.1); ink(F, D.sparkle(x, y, 26 * u, t, i), q, { w: 2.4, col: i % 2 ? F.red : F.ink }); });
  };
  const closingArt = (F, box, p, d, info) => {
    const { W, H, u, t } = F, local = info.local;
    const ins = 46 * u, frame = P.rr(ins, ins, W - ins * 2, H - ins * 2, 40 * u), frame2 = P.rr(ins + 16 * u, ins + 16 * u, W - ins * 2 - 32 * u, H - ins * 2 - 32 * u, 30 * u);
    ghost(F, frame, 0.25);
    let tip = ink(F, [frame], eo(span(local, 0, 1.5)), { w: 3.6, seed: 2 });
    ink(F, [frame2], eo(span(local, 0.3, 1.8)), { w: 2.2, col: F.red, seed: 4, a: 0.8 });
    // Confetti falls the whole time.
    const R = rng(77);
    for (let i = 0; i < 26; i++) {
      const sx = R() * W, speed = 0.09 + R() * 0.08, off = R(), kind = Math.floor(R() * 4), sz = (18 + R() * 20) * u, red = R() < 0.45;
      const k = fr(t * speed + off), y = lerp(-60 * u, H + 60 * u, k), x = sx + Math.sin(t * 1.4 + i) * 30 * u;
      const a = clamp(local / 0.9) * 0.9;
      if (a <= 0) continue;
      const rr = t * (1.2 + (i % 3) * 0.5) + i, col = red ? F.red : F.ink, g = F.g;
      g.save(); g.globalAlpha *= a;
      if (kind === 0) ink(F, [rot(P.poly([[x - sz, y], [x - sz / 3, y - sz * 0.6], [x + sz / 3, y + sz * 0.6], [x + sz, y]]), x, y, rr)], 1, { w: 2.6, col, single: true });
      else if (kind === 1) ink(F, [P.ell(x, y, sz * 0.5, sz * 0.5 * Math.abs(Math.cos(rr)))], 1, { w: 2.6, col, single: true });
      else if (kind === 2) ink(F, [rot(P.poly([[x - sz * 0.5, y], [x + sz * 0.5, y]]), x, y, rr), rot(P.poly([[x, y - sz * 0.5], [x, y + sz * 0.5]]), x, y, rr)], 1, { w: 2.6, col, single: true });
      else ink(F, D.star(x, y, sz * 0.7, t, i), 1, { w: 2.2, col, single: true });
      g.restore();
    }
    const sw = swoosh(F, { ...info, local: local * 0.9 }, H * (F.tall ? 0.84 : 0.85), H * 0.1);
    planeFlight(F, local + 2, H * 0.17, 28);
    const ends = [[ins, ins], [W - ins, ins], [ins, H - ins], [W - ins, H - ins]];
    ends.forEach(([x, y], i) => ink(F, D.star(x, y, 40 * u, t + i, i), span(local, 1.2 + i * 0.15, 1.9 + i * 0.15), { w: 3, col: i % 2 ? F.ink : F.red }));
    if (sw.done) scribble(F, { x: sw.end[0], y: sw.end[1] }, local * 0.9 - 1.7, 44, 22);
    else if (sw.tip) nib(F, sw.tip.x, sw.tip.y);
    else if (tip) nib(F, tip.x, tip.y);
  };

  // ---- chart: pen-drawn bars with 3D sides, bubble figures, a red circle and a dashed trend ----------
  function chart(F, box, p, d, info) {
    const g = F.g, { u, t } = F, local = info.local, hold = info.hold;
    const n = d.values.length, max = Math.max(...d.values, 1);
    const left = box.x + 70 * u, right = box.x + box.w - 30 * u, base = box.y + box.h - 78 * u, top = box.y + 14 * u;
    const slot = (right - left) / n, bw = slot * 0.5, hmax = base - top - 150 * u;
    let tip = null;
    const aq = span(p, 0, 0.16);
    // Pencil grid and the two axes, with arrowheads.
    for (let k = 1; k <= 4; k++) { const y = base - (hmax * k) / 4 * 1.0; ghost(F, P.line(left, y, left + (right - left) * eo(aq), y), 0.22); }
    ink(F, [P.line(left - 18 * u, base, left + (right - left + 30 * u) * eo(aq), base, 0.004)], 1, { w: 3.4 });
    ink(F, [P.line(left - 18 * u, base + 8 * u, left - 18 * u, base - (hmax + 80 * u) * eo(aq), 0.004)], 1, { w: 3.4 });
    if (aq >= 1) { ink(F, [P.head(left - 18 * u, base - hmax - 80 * u, -Math.PI / 2, 26 * u)], 1, { w: 3.2, blob: false }); ink(F, [P.head(right + 12 * u, base, 0, 26 * u)], 1, { w: 3.2, blob: false }); }
    for (let k = 0; k <= 4; k++) ink(F, [P.line(left - 28 * u, base - (hmax * k) / 4, left - 8 * u, base - (hmax * k) / 4)], span(aq, 0.4, 1), { w: 2.2, blob: false });
    // Ghost bars first, so the frame never starts empty.
    d.values.forEach((v, i) => { const h = (hmax * v) / max, x = left + slot * i + (slot - bw) / 2; ghost(F, P.poly([[x, base], [x, base - h], [x + bw, base - h], [x + bw, base]]), 0.2); });
    const tops = [];
    d.values.forEach((v, i) => {
      const s0 = 0.12 + (0.7 * i) / n, qb = span(p, s0, s0 + 0.7 / n), hot = i === d.highlight;
      const h = (hmax * v) / max, x = left + slot * i + (slot - bw) / 2, cx = x + bw / 2, col = hot ? F.red : F.ink;
      tops.push([cx, base - h]);
      if (qb <= 0) return;
      const j1 = (hash(i * 5.3) - 0.5) * 6 * u, j2 = (hash(i * 9.1) - 0.5) * 6 * u;
      const body = P.poly([[x, base], [x + j1, base - h], [x + bw + j2, base - h], [x + bw, base]], true);
      const side = P.poly([[x + bw, base], [x + bw + j2, base - h], [x + bw + 16 * u, base - h - 11 * u], [x + bw + 16 * u, base - 11 * u]], true);
      const topf = P.poly([[x + j1, base - h], [x + 16 * u + j1, base - h - 11 * u], [x + bw + 16 * u, base - h - 11 * u], [x + bw + j2, base - h]], true);
      const oq = span(qb, 0, 0.4), hq = span(qb, 0.4, 0.8), eq = span(qb, 0.8, 1);
      sheetFill(F, body, oq);
      const r = ink(F, [body.slice(0, -1)], oq, { w: 3.2, col, seed: i });
      if (r && oq < 1) tip = r;
      const hr = hatch(F, body, bbox(body), hq, { col, gap: hot ? 7 : 10, cross: hot, up: true, seed: i, a: hot ? 0.8 : 0.7 });
      if (hr && hq < 1) tip = hr;
      if (eq > 0) {
        const r3 = ink(F, [side, topf], span(eq, 0, 0.6), { w: 2.4, col, seed: i + 3 });
        const hs = hatch(F, side, bbox(side), span(eq, 0.5, 1), { col, gap: 5, ang: -0.5, a: 0.9 });
        if (eq < 1) tip = (eq < 0.6 ? r3 : hs) || tip;
      }
      if (qb > 0.7) {
        const nq = span(qb, 0.7, 1), size = clamp((slot * 1.15) / (Math.max(2, count(F, v, d).length) * 0.62), 64 * u, 104 * u);
        bubble(F, count(F, v * eo(nq), d), cx, base - h - 64 * u, size, { col, pop: 0.6 + 0.4 * eo(span(qb, 0.7, 0.85)) });
        say(F, d.labels[i] || "", cx, base + 58 * u, 48 * u, { align: "center", q: span(qb, 0.2, 0.8), col: F.muted });
      }
    });
    // Annotation in red: a circle round the key figure, a burst, a dashed trend with an arrowhead.
    const hotI = Math.max(0, Math.min(n - 1, d.highlight)), [hx, hy] = tops[hotI];
    const a0 = Math.max(hold * 0.38, 1.3), cq = eo(span(local, a0, a0 + 0.75));
    const numW = Math.max(2, count(F, d.values[hotI], d).length) * 56 * u + 70 * u;
    const circ = P.ell(hx, hy - 64 * u, numW / 2, 80 * u, -2.3, -2.3 + TAU * 1.12);
    const r1 = ink(F, [circ], cq, { w: 3.6, col: F.red, seed: 21 }); if (r1) tip = r1;
    if (cq >= 1) for (let k = 0; k < 7; k++) { const a = -Math.PI * (0.15 + 0.7 * (k / 6)), l0 = numW * 0.52 + 30 * u, l1 = l0 + (24 + 12 * Math.sin(t * 7 + k)) * u; ink(F, [P.line(hx + Math.cos(a) * l0, hy - 64 * u + Math.sin(a) * l0 * 0.8, hx + Math.cos(a) * l1, hy - 64 * u + Math.sin(a) * l1 * 0.8)], 1, { w: 3, col: F.red, blob: false, single: true }); }
    const sx = tops[0][0] - bw * 0.2, sy = tops[0][1] - 150 * u, ex = hx - numW / 2 - 30 * u, ey = hy - 200 * u;
    const arr = P.bez(sx, sy, sx + (ex - sx) * 0.35, sy - 90 * u, sx + (ex - sx) * 0.7, ey - 60 * u, ex, ey);
    const tq = eo(span(local, a0 + 0.5, a0 + 1.35));
    if (hotI > 0) {
      const r2 = ink(F, [arr], tq, { w: 3.2, col: F.red, dash: [22, 13], dashOff: -t * 46, seed: 8, blob: false }); if (r2) tip = r2;
      if (tq >= 1) ink(F, [P.head(ex, ey, Math.atan2(ey - arr[arr.length - 4][1], ex - arr[arr.length - 4][0]), 30 * u)], 1, { w: 3.4, col: F.red, blob: false });
    }
    for (let k = 0; k < 3; k++) { const q = span(local, a0 + 0.9 + k * 0.15, a0 + 1.5 + k * 0.15); ink(F, D.sparkle(hx + (k - 1) * bw * 0.95, hy - 190 * u - (k % 2) * 40 * u, 26 * u, t, k), q, { w: 2.6, col: k % 2 ? F.ink : F.red }); }
    const done = a0 + 1.5;
    if (tip) { if (local > done) scribble(F, tip, local - done, 34, 16); else nib(F, tip.x, tip.y); }
    else nib(F, left, base);
    return done;
  }

  // ---- object: a hand-sketched laptop (or phone) running a looping timeline, with numbered leaders ---
  function object(F, box, p, d, info) {
    const g = F.g, { u, t } = F, local = info.local;
    const phone = d.kind === "phone", vertical = box.h > box.w * 1.05;
    let x0, y0, dw, dh;
    if (phone) { dh = vertical ? box.h * 0.5 : box.h * 0.92; dw = dh * 0.52; x0 = vertical ? box.x + (box.w - dw) / 2 : box.x + box.w * 0.1; y0 = vertical ? box.y + 10 * u : box.y + (box.h - dh) / 2; }
    else { dw = vertical ? box.w * 0.94 : Math.min(box.w * 0.6, box.h * 1.3); dh = dw * 0.62; x0 = vertical ? box.x + (box.w - dw) / 2 : box.x + box.w * 0.01; y0 = vertical ? box.y + 20 * u : box.y + (box.h - dh) / 2 - 18 * u; }
    const bez = (phone ? 36 : 26) * u, bezW = (phone ? 22 : 26) * u;
    const outer = P.rr(x0, y0, dw, dh, bez);
    const sx = x0 + bezW, sy = y0 + bezW, sw = dw - bezW * 2, sh = dh - bezW * 2;
    const screen = P.rr(sx, sy, sw, sh, 10 * u);
    // One pen, in order: body outline, bezel hatching, the base, the screen, the preview, the clips.
    const q1 = span(p, 0, 0.3);
    ghost(F, outer, 0.22);
    let tip = null;
    const oq = span(q1, 0, 0.4), hq = span(q1, 0.4, 1);
    if (oq >= 1) {
      g.save(); g.globalAlpha *= 0.25 * span(q1, 0.4, 0.7); g.fillStyle = F.ink; g.beginPath(); P.rr(x0 + 14 * u, y0 + 18 * u, dw, dh, bez).forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.fill(); g.restore();
    }
    sheetFill(F, outer, oq);
    const r0 = ink(F, [outer], oq, { w: 3.6, seed: 5 }); if (r0) tip = r0;
    const h0 = hatch(F, outer, bbox(outer), hq, { gap: 9, ang: -0.8, a: 0.55, hole: screen }); if (h0 && hq < 1) tip = h0;
    if (oq >= 1) ink(F, [screen], 1, { w: 2.2, seed: 8, single: true, a: 0.6 });
    if (!phone) {
      const bx0 = x0 - dw * 0.07, bx1 = x0 + dw * 1.07, by = y0 + dh + dh * 0.07;
      const basePath = P.poly([[x0 - 4 * u, y0 + dh], [bx0, by], [bx1, by], [x0 + dw + 4 * u, y0 + dh]], true);
      const bq = span(p, 0.3, 0.4);
      const rb = shape(F, basePath, bq, { w: 3.2, seed: 6, gap: 8, ang: -0.6, ha: 0.65 }); if (rb && bq > 0 && bq < 1) tip = rb;
      if (bq >= 1) ink(F, [P.line(x0 + dw * 0.4, by - 8 * u, x0 + dw * 0.6, by - 8 * u)], 1, { w: 3, blob: false });
    }
    const q2 = span(p, 0.38, 0.46);
    if (q2 > 0) {
      const r1 = ink(F, [screen], q2, { w: 2.6, seed: 7 }); if (r1 && q2 < 1) tip = r1;
      // The preview window: a sun with turning rays, hills, a cloud and a bird, all looping.
      const pv = { x: sx + sw * 0.07, y: sy + sh * 0.08, w: sw * 0.86, h: sh * 0.5 };
      const pvp = P.rr(pv.x, pv.y, pv.w, pv.h, 8 * u);
      const q3 = span(p, 0.44, 0.52), q4 = span(p, 0.5, 0.6);
      const r2 = ink(F, [pvp], q3, { w: 2.8, seed: 9 }); if (r2 && q3 < 1) tip = r2;
      if (q4 > 0) {
        g.save(); g.beginPath(); pvp.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.clip();
        const sunx = pv.x + pv.w * 0.72, suny = pv.y + pv.h * 0.36, sr = pv.h * 0.17;
        const hills = [], hills2 = [];
        for (let i = 0; i <= 40; i++) { const k = i / 40; hills.push([pv.x + pv.w * k, pv.y + pv.h * (0.74 - 0.16 * Math.sin(k * 5 + 1) - 0.06 * Math.sin(k * 13))]); hills2.push([pv.x + pv.w * k, pv.y + pv.h * (0.88 - 0.1 * Math.sin(k * 7 + 3))]); }
        const hp = [...hills, [pv.x + pv.w, pv.y + pv.h], [pv.x, pv.y + pv.h]];
        const s1 = span(q4, 0, 0.3), s2 = span(q4, 0.3, 0.75), s3 = span(q4, 0.75, 1);
        const rh = ink(F, [hills, hills2], s1, { w: 2.4, single: true }); if (rh && s1 < 1) tip = rh;
        const hh = hatch(F, hp, { x: pv.x, y: pv.y + pv.h * 0.5, w: pv.w, h: pv.h * 0.5 }, s2, { gap: 9, a: 0.6 }); if (hh && s2 < 1) tip = hh;
        const rs = ink(F, D.sun(sunx, suny, sr * 2, t, 0), s3, { w: 2.4, col: F.red, single: true }); if (rs && s3 < 1) tip = rs;
        if (s3 >= 1) hatch(F, P.ell(sunx, suny, sr * 0.8, sr * 0.8), { x: sunx - sr, y: suny - sr, w: sr * 2, h: sr * 2 }, 1, { col: F.red, gap: 5, a: 0.8 });
        if (q4 >= 1) {
          const cxk = fr(t / 7) * (pv.w + 160 * u) - 80 * u;
          ink(F, D.cloud(pv.x + cxk, pv.y + pv.h * 0.26, 100 * u, 0, 1), 1, { w: 2.2, single: true });
          const bx = pv.x + pv.w * 0.3, by = pv.y + pv.h * 0.3 + Math.sin(t * 1.6) * 8 * u, fl = Math.sin(t * 9) * 8 * u;
          ink(F, [dense([[bx - 22 * u, by - fl], [bx, by], [bx + 22 * u, by - fl]], 6)], 1, { w: 2.2, single: true, blob: false });
        }
        g.restore();
      }
      // Three tracks of clips, each outlined then hatched in turn, and a playhead across the tracks.
      const clips = [[0.06, 0.32], [0.42, 0.22], [0.68, 0.26]], th = sh * 0.085;
      const trackAnch = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        const j = r * 3 + c, qc = span(p, 0.58 + j * 0.026, 0.58 + (j + 1) * 0.026);
        const cl = clips[(c + r) % 3], cx = sx + sw * (cl[0] + (r % 2) * 0.03), cw = sw * cl[1], cy = sy + sh * (0.63 + r * 0.115);
        const hotc = r === 0 && c === 1;
        if (hotc) trackAnch[0] = [cx + cw / 2, cy + th / 2];
        if (r === 2 && c === 0) trackAnch[1] = [cx + cw * 0.4, cy + th];
        if (qc <= 0) continue;
        const rect = P.rr(cx, cy, cw, th, 5 * u);
        const rc = shape(F, rect, qc, { w: 2.2, col: hotc ? F.red : F.ink, seed: r * 3 + c, single: true, gap: 6 + c * 2, ang: c % 2 ? 0.8 : -0.8, ha: 0.7 });
        if (rc && qc < 1) tip = rc;
      }
      const pk = span(p, 0.8, 0.86);
      if (pk > 0) {
        // The playhead: a small marker gliding along the top of the tracks.
        const ph = sx + sw * (0.06 + 0.88 * fr(t / 3.4)), top = sy + sh * 0.6;
        ink(F, [P.poly([[ph - 9 * u, top - 10 * u], [ph + 9 * u, top - 10 * u], [ph, top + 4 * u]], true)], 1, { w: 2.4, col: F.red, single: true, blob: false, a: pk });
      }
      F.anchors = [[pv.x + pv.w * 0.72, pv.y + pv.h * 0.36], trackAnch[0] || [sx + sw * 0.5, sy + sh * 0.7], trackAnch[1] || [sx + sw * 0.2, sy + sh * 0.95]];
    }
    // Leaders: red curves from three parts of the device to numbered labels, each written in turn.
    const anchors = F.anchors || [[x0 + dw * 0.5, y0 + dh * 0.3], [x0 + dw * 0.5, y0 + dh * 0.6], [x0 + dw * 0.3, y0 + dh * 0.9]];
    const xL = vertical ? box.x + 70 * u : box.x + box.w * (phone ? 0.58 : 0.7);
    d.callouts.forEach((label, i) => {
      const c = span(p, 0.6 + i * 0.12, 0.72 + i * 0.12);
      if (c <= 0 || !label) return;
      const ly = vertical ? box.y + box.h * (0.66 + 0.12 * i) : box.y + box.h * (0.2 + 0.3 * i), [ax, ay] = anchors[i];
      const ex = xL - 6 * u, path = vertical ? P.bez(ax, ay, ax, ly, ex + 120 * u, ly, ex, ly) : P.bez(ax, ay, ax + (ex - ax) * 0.5, ay, ex - (ex - ax) * 0.5, ly, ex, ly);
      g.save(); g.fillStyle = F.red; g.beginPath(); g.arc(ax, ay, 8 * u, 0, TAU); g.fill(); g.restore();
      const r = ink(F, [path], span(c, 0, 0.5), { w: 3.2, col: F.red, seed: 30 + i, blob: false });
      if (r && c < 0.5) tip = r;
      if (c > 0.5) {
        const k = span(c, 0.5, 1);
        bubble(F, String(i + 1), xL + 24 * u, ly, 64 * u, { col: F.red, pop: 0.5 + 0.5 * eo(span(k, 0, 0.3)) });
        F.sayTip = null;
        say(F, label, xL + 78 * u, ly + 14 * u, 48 * u, { q: span(k, 0.15, 1), maxW: box.x + box.w - xL - 90 * u });
        if (k < 1 && F.sayTip) tip = F.sayTip;
      }
      if (c >= 1) { const dot = at(path, fr(t * 0.45 + i * 0.3)); g.save(); g.fillStyle = F.red; g.globalAlpha = 0.9; g.beginPath(); g.arc(dot.x, dot.y, 6 * u, 0, TAU); g.fill(); g.restore(); }
    });
    // A red loop-the-loop round the playhead's clip once everything has landed.
    const l0 = Math.max(info.hold * 0.42, 1.55), done = l0 + 0.9;
    const lq = eo(span(local, l0, l0 + 0.8));
    if (anchors[1] && lq > 0) { const [cx, cy] = anchors[1]; const r = ink(F, [P.ell(cx, cy, 70 * u, 34 * u, -2.5, -2.5 + TAU * 1.1)], lq, { w: 3.2, col: F.red, seed: 44 }); if (r) tip = r; }
    if (tip) { if (local > done) scribble(F, tip, local - done, 34, 16); else nib(F, tip.x, tip.y); }
    if (!vertical) {
      const mq = span(p, 0.55, 0.9), mxp = box.x + box.w * 0.92, myp = box.y + box.h * 0.88;
      ink(F, D.spiral(box.x + box.w * 0.66, box.y + box.h * 0.97, 40 * u), mq, { w: 2.2, col: F.red, single: true });
      ink(F, D.squig(box.x + box.w * 0.8, box.y + box.h * 0.96, 70 * u, t), mq, { w: 2.4, single: true, blob: false });
    }
    // Sparkles keep turning around the device.
    [[x0 - 20 * u, y0 + dh * 0.1], [x0 + dw + 24 * u, y0 - 10 * u], [x0 + dw * 0.5, y0 + dh * 1.22]].forEach(([x, y], i) => ink(F, D.sparkle(x, y, 26 * u, t, i), span(p, 0.7, 1), { w: 2.4, col: i === 1 ? F.red : F.ink, single: true }));
    return done;
  }

  // ---- people: scribble people who wave, blink and hop, each with a speech-bubble badge ----------------
  function person(F, cx, base, sz, i, hot, q, o) {
    const g = F.g, { u, t } = F, hop = hot ? -Math.abs(Math.sin(t * 3.4 + i)) * sz * 0.06 : 0, sway = Math.sin(t * 2.2 + i * 1.7) * sz * 0.012, by = base + hop;
    const hr = sz * 0.155, hy = by - sz * 0.84 + sway, sy0 = by - sz * 0.66 + sway, hipy = by - sz * 0.34 + sway;
    const col = hot ? F.red : F.ink, tw = sz * 0.17;
    const torso = dense([[cx - tw * 1.25, hipy], [cx - tw, sy0 + tw * 0.9]]).concat(P.ell(cx, sy0 + tw * 0.9, tw, tw * 0.9, Math.PI, TAU), dense([[cx + tw, sy0 + tw * 0.9], [cx + tw * 1.25, hipy]]), dense([[cx + tw * 1.25, hipy], [cx - tw * 1.25, hipy]]));
    const wave = Math.sin(t * (hot ? 7 : 4) + i * 1.3);
    const lh = [cx - sz * 0.3, hipy - sz * 0.02 + Math.sin(t * 2 + i) * sz * 0.015];
    const rh = hot || i % 2 === 0 ? [cx + sz * 0.3 + wave * sz * 0.03, sy0 - sz * 0.2 + wave * sz * 0.03] : [cx + sz * 0.3, hipy - sz * 0.03];
    const legs = [P.line(cx - tw * 0.75, hipy, cx - tw * 0.85, by - 6 * u), P.line(cx + tw * 0.75, hipy, cx + tw * 0.85, by - 6 * u)];
    const arms = [dense([[cx - tw, sy0 + tw * 0.9], [cx - tw - sz * 0.07, (sy0 + lh[1]) / 2 + sz * 0.01], lh], 8), dense([[cx + tw, sy0 + tw * 0.9], [cx + tw + sz * 0.08, (sy0 + rh[1]) / 2 - sz * 0.03], rh], 8)];
    const shoes = [P.ell(cx - tw * 0.95, by - 3 * u, sz * 0.08, sz * 0.03), P.ell(cx + tw * 0.95, by - 3 * u, sz * 0.08, sz * 0.03)];
    const head = P.ell(cx, hy, hr * 0.95, hr * 1.05);
    const styles = [
      () => dense([[cx - hr * 0.95, hy - hr * 0.2], [cx - hr * 0.8, hy - hr * 1.5], [cx - hr * 0.35, hy - hr * 0.95], [cx, hy - hr * 1.7], [cx + hr * 0.35, hy - hr * 0.95], [cx + hr * 0.8, hy - hr * 1.5], [cx + hr * 0.95, hy - hr * 0.2]], 8),
      () => P.ell(cx, hy - hr * 1.5, hr * 0.5, hr * 0.5).concat(P.ell(cx, hy, hr * 1.0, hr * 1.1, -Math.PI * 0.95, -Math.PI * 0.05)),
      () => { let a = []; for (let k = 0; k < 5; k++) a = a.concat(P.ell(cx - hr * 0.9 + k * hr * 0.45, hy - hr * 0.95, hr * 0.28, hr * 0.28, Math.PI, TAU)); return a; },
      () => dense([[cx - hr * 1.0, hy - hr * 0.3], [cx - hr * 0.9, hy - hr * 1.15], [cx + hr * 0.9, hy - hr * 1.15], [cx + hr * 1.0, hy - hr * 0.3]], 8),
      () => P.ell(cx, hy, hr * 1.12, hr * 1.2, Math.PI * 0.85, Math.PI * 2.15).concat(dense([[cx + hr * 1.1, hy], [cx + hr * 1.25, hy + hr * 1.8]], 8)),
      () => dense([[cx, hy - hr * 1.0], [cx, hy - hr * 1.9], [cx + hr * 0.35, hy - hr * 1.0]], 8),
    ];
    const hair = styles[i % styles.length]();
    const blink = fr(t / 3.1 + i * 0.37) < 0.05 ? 0.2 : 1;
    const eyes = [P.ell(cx - hr * 0.38, hy - hr * 0.1, 2.4 * u * 1.4, 3.2 * u * blink * 1.4), P.ell(cx + hr * 0.38, hy - hr * 0.1, 2.4 * u * 1.4, 3.2 * u * blink * 1.4)];
    const smile = P.ell(cx, hy + hr * 0.15, hr * 0.5, hr * 0.38 * (hot ? 1.3 : 1), 0.25, Math.PI - 0.25);
    g.save();
    g.globalAlpha *= clamp(q * 4);
    // Shadow on the ground.
    const sh = P.ell(cx, base + 4 * u, sz * 0.3 * (1 + hop / sz * 3), sz * 0.05);
    ink(F, [sh], span(q, 0, 0.3), { w: 2, col: F.muted, single: true, blob: false }); hatch(F, sh, bbox(sh), span(q, 0.1, 0.4), { col: F.muted, gap: 5, a: 0.6 });
    paperFill(F, torso, span(q, 0.15, 0.4));
    const list = [...legs, torso.concat([torso[0]]), ...arms, ...shoes, head, hair];
    const lq = span(q, 0.05, 0.6), tq = span(q, 0.6, 0.86), hq = span(q, 0.86, 1);
    let tip = ink(F, list, lq, { w: 3.2, col, seed: i * 4 });
    const t1 = hatch(F, torso, bbox(torso), tq, { col, gap: hot ? 7 : 9, cross: hot, a: 0.75, seed: i }); if (t1 && tq < 1) tip = t1;
    const t2 = hatch(F, hair.length > 6 ? dense([...hair, hair[0]], 8) : hair, bbox(hair), hq, { col, gap: 5, ang: 0.7, a: 0.9 }); if (t2 && hq < 1) tip = t2;
    for (const sp of shoes) hatch(F, sp, bbox(sp), hq, { col, gap: 4, a: 0.9 });
    if (q > 0.7) {
      ink(F, eyes, 1, { w: 2.2, col, single: true, blob: false }); ink(F, [smile], 1, { w: 2.4, col, single: true, blob: false });
      ink(F, [P.line(cx, hy + hr * 0.05, cx - hr * 0.08, hy + hr * 0.3)], 1, { w: 1.8, col, single: true, blob: false, a: 0.7 });
    }
    g.restore();
    return { tip, head: [cx, hy], headR: hr };
  }
  function people(F, box, p, d, info) {
    const g = F.g, { u, t } = F, local = info.local, hold = info.hold;
    const n = Math.max(2, Math.min(6, Math.round(d.count))), slot = box.w / n;
    const sz = Math.min(box.h * 0.6, slot * (F.tall ? 2.3 : 1.35)), base = box.y + box.h * (F.tall ? 0.8 : 0.9);
    const aq = span(p, 0, 0.2);
    // Ground: a wobbly line with grass tufts.
    const gp = []; for (let i = 0; i <= 60; i++) gp.push([lerp(box.x - 20 * u, box.x + box.w + 20 * u, i / 60), base + 8 * u + Math.sin(i * 0.5) * 3 * u]);
    ghost(F, gp, 0.2);
    ink(F, [gp], aq, { w: 3.4, seed: 3, a: 0.9 });
    for (let k = 0; k < 14; k++) { const gx = box.x + (box.w * (k + 0.5)) / 14, q = span(aq, 0.4, 1); ink(F, [dense([[gx - 10 * u, base + 8 * u], [gx - 4 * u, base - 14 * u], [gx, base + 8 * u], [gx + 6 * u, base - 20 * u + Math.sin(t * 2 + k) * 4 * u], [gx + 12 * u, base + 8 * u]], 8)], q, { w: 2.2, col: F.muted, single: true, blob: false }); }
    // A faint rough ghost of each figure's place.
    const hotI = Math.min(n - 1, d.highlight);
    let tip = null;
    const heads = [];
    for (let i = 0; i < n; i++) {
      const q = span(p, 0.1 + (0.66 * i) / n, 0.1 + (0.66 * (i + 1)) / n + 0.02), cx = box.x + slot * (i + 0.5), hot = i === hotI;
      ghost(F, P.ell(cx, base - sz * 0.5, sz * 0.2, sz * 0.5), 0.14);
      if (q <= 0) continue;
      const r = person(F, cx, base, sz * (hot ? 1.06 : 1), i, hot, q);
      if (r.tip && q < 1) tip = r.tip;
      heads.push({ cx, hot, hy: r.head[1], hr: r.headR, q, i });
    }
    // Badges: a speech bubble above each head, text and bubble arriving together.
    g.save(); g.font = `bold ${44 * u}px ${HAND}`;
    heads.forEach((h) => {
      const label = d.badges[h.i % d.badges.length];
      if (!label || h.q < 0.75) return;
      const k = span(h.q, 0.75, 1), tw = Math.min(g.measureText(label).width, slot * 1.1 - 40 * u), bw = tw + 44 * u, bh = 74 * u;
      const bx = h.cx - bw / 2 + Math.sin(t * 1.8 + h.i) * 4 * u, bY = h.hy - h.hr * 2.7 - bh - 12 * u - (n > 4 && h.i % 2 ? 62 * u : 0) + Math.sin(t * 2.4 + h.i) * 3 * u;
      const bub = P.rr(bx, bY, bw, bh, 26 * u), tail = [[h.cx - 16 * u, bY + bh - 2 * u], [h.cx - 4 * u, bY + bh + 26 * u], [h.cx + 12 * u, bY + bh - 2 * u]];
      g.save(); g.globalAlpha *= k;
      paperFill(F, bub); ink(F, [bub], 1, { w: 2.8, col: h.hot ? F.red : F.ink, seed: h.i, single: true, blob: false });
      paperFill(F, dense(tail, 6)); ink(F, [dense(tail, 6)], 1, { w: 2.8, col: h.hot ? F.red : F.ink, single: true, blob: false });
      g.restore();
      F.sayTip = null;
      say(F, label, h.cx, bY + bh / 2 + 15 * u, 44 * u, { align: "center", q: k, col: h.hot ? F.red : F.ink, maxW: tw });
      if (k < 1 && F.sayTip) tip = F.sayTip;
    });
    g.restore();
    // The red pen: a star over the key person, an underline, floating hearts that never stop.
    const hh = heads.find((h) => h.hot);
    const a0 = Math.max(hold * 0.42, 1.4);
    if (hh) {
      const sq = span(local, a0, a0 + 0.7);
      const rst = ink(F, D.star(hh.cx + sz * 0.42, hh.hy - hh.hr * 2.2, 48 * u, t, 1), sq, { w: 3.4, col: F.red }); if (rst && sq < 1) tip = rst;
      const ul = []; for (let i = 0; i <= 30; i++) ul.push([hh.cx - sz * 0.32 + (i / 30) * sz * 0.64, base + 34 * u + Math.sin(i * 0.9 + t * 2) * 5 * u]);
      const r = ink(F, [dense(ul, 10)], eo(span(local, a0 + 0.7, a0 + 1.2)), { w: 3.4, col: F.red, seed: 13 }); if (r && local > a0 + 0.7) tip = r;
      for (let k = 0; k < 4; k++) {
        const kk = fr(t * 0.35 + k / 4), hx = hh.cx + sz * 0.3 + Math.sin(kk * 7 + k) * 22 * u, hy = hh.hy + sz * 0.1 - kk * sz * 0.55;
        g.save(); g.globalAlpha *= Math.sin(kk * Math.PI) * clamp(local / (a0 + 0.5)); ink(F, D.heart(hx, hy, 20 * u, t, k), 1, { w: 2.4, col: F.red, single: true, blob: false }); g.restore();
      }
    }
    const done = a0 + 1.25;
    if (tip && local <= done) nib(F, tip.x, tip.y); else if (tip) scribble(F, tip, local - done, 34, 16);
    else nib(F, box.x + box.w * 0.1, base);
    return done;
  }

  // ---- process: taped index cards with moving doodle icons and dashed marching arrows -----------------
  function icon(F, kind, cx, cy, s, q, k) {
    const g = F.g, { u, t } = F, T = F.t;
    if (q <= 0) return null;
    let tip = null;
    if (kind === 0) { // a page being read under a magnifying glass
      const pg = P.rr(cx - s * 0.36, cy - s * 0.46, s * 0.72, s * 0.92, 8 * u);
      paperFill(F, pg, q); tip = ink(F, [pg], q, { w: 3, seed: k });
      for (let r = 0; r < 5; r++) ink(F, [P.line(cx - s * 0.24, cy - s * 0.3 + r * s * 0.16, cx + s * (r % 2 ? 0.1 : 0.24), cy - s * 0.3 + r * s * 0.16)], span(q, 0.3 + r * 0.1, 1), { w: 2.4, col: F.muted, single: true, blob: false });
      if (q >= 1) {
        const lx = cx + Math.sin(t * 1.3) * s * 0.2 + s * 0.1, ly = cy + Math.cos(t * 1.7) * s * 0.14, lr = s * 0.24;
        const ring = P.ell(lx, ly, lr, lr);
        g.save(); g.fillStyle = F.ra(0.14); g.beginPath(); ring.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.fill(); g.restore();
        ink(F, [ring], 1, { w: 4, col: F.red, single: true }); ink(F, [P.line(lx + lr * 0.72, ly + lr * 0.72, lx + lr * 1.5, ly + lr * 1.5)], 1, { w: 6, col: F.red, single: true, blob: false });
        hatch(F, ring, { x: lx - lr, y: ly - lr, w: lr * 2, h: lr * 2 }, 1, { col: F.red, gap: 6, a: 0.45 });
      }
    } else if (kind === 1) { // a pencil writing a wavy line again and again
      const wave = []; for (let i = 0; i <= 36; i++) wave.push([cx - s * 0.46 + (i / 36) * s * 0.92, cy + s * 0.3 + Math.sin(i * 0.5) * s * 0.07]);
      const wq = q < 1 ? q : eo(fr(T / 2.4) * 1.25);
      tip = ink(F, [dense(wave, 8)], wq, { w: 3.6, seed: k, single: q >= 1 }) || tip;
      const tp = tip ? { x: tip.lx, y: tip.ly } : { x: cx - s * 0.46, y: cy + s * 0.3 }, ang = -0.95, L = s * 0.78, w = s * 0.12;
      const body = rot([[0, 0], [L * 0.16, -w], [L, -w], [L, w], [L * 0.16, w]], 0, 0, ang).map(([a, b]) => [a + tp.x, b + tp.y]);
      paperFill(F, body); ink(F, [dense([...body, body[0]], 10)], 1, { w: 2.8, single: true, blob: false }); hatch(F, body, bbox(body), 1, { gap: 5, a: 0.7, col: F.red });
      ink(F, D.sparkle(cx + s * 0.38, cy - s * 0.3, s * 0.16, t, k), 1, { w: 2.6, col: F.red, single: true });
      ink(F, D.sparkle(cx - s * 0.36, cy - s * 0.1, s * 0.1, t, k + 2), 1, { w: 2.2, single: true });
    } else { // a stamp that thumps down and leaves a check
      const thump = Math.abs(Math.sin(T * 2.2)), dy = -thump * s * 0.16;
      const pad = P.rr(cx - s * 0.42, cy + s * 0.28, s * 0.84, s * 0.16, 6 * u);
      paperFill(F, pad, q); ink(F, [pad], q, { w: 3, seed: k }); hatch(F, pad, bbox(pad), q, { gap: 5, a: 0.7 });
      const base = P.rr(cx - s * 0.3, cy - s * 0.02 + dy, s * 0.6, s * 0.22, 6 * u), stem = P.rr(cx - s * 0.1, cy - s * 0.3 + dy, s * 0.2, s * 0.3, 5 * u), knob = P.ell(cx, cy - s * 0.4 + dy, s * 0.15, s * 0.12);
      for (const sp of [stem, base, knob]) { paperFill(F, sp, q); tip = ink(F, [sp], q, { w: 3, seed: k + 2 }) || tip; }
      hatch(F, base, bbox(base), q, { gap: 5, a: 0.7, col: F.red });
      const ck = [[cx - s * 0.22, cy + s * 0.34], [cx - s * 0.05, cy + s * 0.4], [cx + s * 0.28, cy + s * 0.24]];
      if (q >= 1) ink(F, [dense(ck, 8)], eo(span(thump, 0.6, 1)), { w: 5, col: F.red, single: true, blob: false });
    }
    return tip;
  }
  function process(F, box, p, d, info) {
    const g = F.g, { u, t } = F, local = info.local, hold = info.hold;
    const n = d.steps.length, vertical = box.h > box.w * 1.05;
    const gap = vertical ? 100 * u : 120 * u;
    const cw = vertical ? box.w * 0.78 : (box.w - gap * (n - 1)) / n;
    const ch = vertical ? (box.h - gap * (n - 1)) / n : Math.min(box.h * 0.88, cw * 1.02);
    const kinds = [0, 1, 2];
    let tip = null;
    const cards = [];
    for (let i = 0; i < n; i++) {
      const q = span(p, (0.8 * i) / n, (0.8 * (i + 1)) / n - 0.05), k = i / Math.max(1, n - 1);
      const cx = vertical ? box.x + box.w / 2 + (i % 2 ? 1 : -1) * box.w * 0.05 : box.x + cw / 2 + i * (cw + gap), cy = vertical ? box.y + ch / 2 + i * (ch + gap) : box.y + box.h / 2;
      const rotn = (i % 2 ? 1 : -1) * 0.03 + Math.sin(t * 0.9 + i * 2) * 0.006;
      cards.push({ cx, cy, rotn, q });
      const wide = cw > ch * 1.25, hw = cw / 2, hh = ch / 2;
      g.save(); g.translate(cx, cy); g.rotate(rotn);
      const rect = P.rr(-hw, -hh, cw, ch, 12 * u);
      ghost(F, rect, 0.2);
      if (q > 0) {
        // A shadow, the card, faint ruling, and tape across the top.
        g.save(); g.globalAlpha *= 0.22 * span(q, 0.38, 0.55); g.fillStyle = F.ink; g.beginPath(); P.rr(-hw + 10 * u, -hh + 14 * u, cw, ch, 12 * u).forEach(([a, b], j) => (j ? g.lineTo(a, b) : g.moveTo(a, b))); g.fill(); g.restore();
        const oq = span(q, 0, 0.38);
        sheetFill(F, rect, oq);
        const r0 = ink(F, [rect], oq, { w: 3.4, seed: i * 3 }); if (r0 && oq < 1) tip = r0;
        const rq = span(q, 0.38, 0.46);
        for (let r = 1; r <= 4; r++) { const ly = -hh + ch * (0.22 + r * 0.14); ink(F, [P.line(-hw + 20 * u, ly, hw - 20 * u, ly)], span(rq, (r - 1) / 5, r / 5), { w: 1.4, col: F.muted, a: 0.35, single: true, blob: false }); }
        const rr = ink(F, [P.line(-hw + 20 * u, -hh + ch * 0.2, hw - 20 * u, -hh + ch * 0.2)], span(rq, 0.8, 1), { w: 1.6, col: F.red, a: 0.55, single: true, blob: false });
        if (rq > 0 && rq < 1) { const rl = Math.min(3, Math.floor(rq * 5)); tip = rq >= 0.8 && rr ? rr : gtip(g, lerp(-hw + 20 * u, hw - 20 * u, fr(rq * 5)), -hh + ch * (0.22 + (rl + 1) * 0.14)); }
        // Tape is pressed on once the card is outlined (it is stuck on, not drawn).
        const tq = eo(span(q, 0.4, 0.6));
        if (tq > 0) {
          const tape = rot(P.poly([[-cw * 0.17, -hh - 20 * u], [cw * 0.17, -hh - 20 * u], [cw * 0.17, -hh + 18 * u], [-cw * 0.17, -hh + 18 * u]], true), 0, -hh - (1 - tq) * 30 * u, -0.07 + Math.sin(t * 1.2 + i) * 0.015 - (1 - tq) * 0.2);
          g.save(); g.globalAlpha *= tq; g.fillStyle = F.ra(0.28); g.beginPath(); tape.forEach(([a, b], j) => (j ? g.lineTo(a, b) : g.moveTo(a, b))); g.fill();
          ink(F, [tape], 1, { w: 2, col: F.red, single: true, blob: false, a: 0.8 });
          hatch(F, tape, bbox(tape), 1, { col: F.red, gap: 7, a: 0.5 });
          g.restore();
        }
        // The icon, then the label, written by the pen.
        const iq = span(q, 0.46, 0.78);
        const isz = wide ? ch * 0.7 : cw * 0.5, icx = wide ? -hw + ch * 0.55 : 0, icy = wide ? 8 * u : -hh + ch * 0.4;
        const kind = i === n - 1 ? 2 : kinds[i % 2];
        const ti = icon(F, kind, icx, icy, isz * 0.78, iq, i); if (ti && iq < 1) tip = { x: ti.x, y: ti.y };
        const lq = span(q, 0.78, 1);
        if (lq > 0) {
          F.sayTip = null;
          if (wide) say(F, d.steps[i], -hw + ch * 1.12, 18 * u, 52 * u, { q: lq, maxW: cw - ch * 1.12 - 30 * u, min: 44 * u });
          else say(F, d.steps[i], 0, hh - ch * 0.12, 52 * u, { align: "center", q: lq, maxW: cw - 50 * u, min: 44 * u });
          if (lq < 1 && F.sayTip) tip = F.sayTip;
          bubble(F, String(i + 1), wide ? -hw + 10 * u : -hw + 56 * u, wide ? -hh + 34 * u : -hh + 56 * u, 96 * u, { col: F.red, pop: 0.5 + 0.5 * eo(lq) });
        }
      }
      g.restore();
    }
    // Dashed arrows between the cards keep marching.
    for (let i = 0; i < n - 1; i++) {
      const a = cards[i], b = cards[i + 1], aq = span(p, (0.8 * (i + 1)) / n - 0.05, (0.8 * (i + 1)) / n);
      if (aq <= 0) continue;
      const sx = vertical ? a.cx : a.cx + cw / 2 + 12 * u, sy = vertical ? a.cy + ch / 2 + 14 * u : a.cy, ex = vertical ? b.cx : b.cx - cw / 2 - 16 * u, ey = vertical ? b.cy - ch / 2 - 24 * u : b.cy;
      const path = vertical ? P.bez(sx, sy, sx + 70 * u, sy + (ey - sy) * 0.3, ex - 70 * u, ey - (ey - sy) * 0.3, ex, ey) : P.bez(sx, sy, sx + (ex - sx) * 0.4, sy - 90 * u, sx + (ex - sx) * 0.6, ey - 90 * u, ex, ey);
      const r = ink(F, [path], eo(aq), { w: 4, col: F.red, dash: [24, 14], dashOff: -t * 54, seed: i + 70, blob: false });
      if (r && aq < 1) tip = r;
      if (aq >= 1) ink(F, [P.head(ex, ey, Math.atan2(ey - path[path.length - 4][1], ex - path[path.length - 4][0]), 34 * u)], 1, { w: 4.4, col: F.red, blob: false });
    }
    // The red pen finally rings the last step.
    const last = cards[n - 1], a0 = Math.max(hold * 0.42, 1.5), rq = eo(span(local, a0, a0 + 0.9));
    if (rq > 0) {
      const r = ink(F, [rot(P.ell(last.cx, last.cy, cw * 0.58, ch * 0.6, -2.4, -2.4 + TAU * 1.1), last.cx, last.cy, last.rotn)], rq, { w: 3.8, col: F.red, seed: 90 }); if (r) tip = r;
    }
    const done = a0 + 1.0;
    if (tip) { if (local > done) scribble(F, tip, local - done, 34, 16); else nib(F, tip.x, tip.y); }
    return done;
  }

  // ---- compare: a torn page of tangled scribble against a clean page with a star --------------------
  const smooth = (pts) => {
    const out = [], n = pts.length;
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n - 1)];
      for (let k = 0; k < 6; k++) {
        const tt = k / 6, t2 = tt * tt, t3 = t2 * tt, f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * tt + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    out.push(pts[n - 1]);
    return out;
  };
  const TANGLE = (() => { const R = rng(21), pts = []; for (let i = 0; i < 90; i++) { const a = i * 0.93, r = 0.25 + R() * 0.75; pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.85]); } return pts; })();
  function compare(F, box, p, d, info) {
    const g = F.g, { u, t } = F, local = info.local, hold = info.hold;
    const vertical = box.h > box.w * 1.1, gap = 130 * u;
    const pw = vertical ? box.w : (box.w - gap) / 2, ph = vertical ? (box.h - gap) / 2 : box.h * 0.94;
    const maxV = Math.max(d.leftValue, d.rightValue, 1);
    let tip = null;
    [[d.left, d.leftValue, false], [d.right, d.rightValue, true]].forEach(([label, value, good], i) => {
      const q = span(p, 0.5 * i, 0.5 * i + 0.48), x = vertical ? box.x : box.x + i * (pw + gap), y = vertical ? box.y + i * (ph + gap) : box.y + (box.h - ph) / 2;
      const col = good ? F.red : F.ink;
      const edge = [[x, y], [x + pw, y], [x + pw, y + ph]];
      if (good) edge.push([x, y + ph]); else for (let k = 0; k <= 14; k++) edge.push([x + pw - (k / 14) * pw, y + ph + (k % 2 ? 14 : -4) * u]);
      const sheet = dense([...edge, [x, y]], 12);
      ghost(F, sheet, 0.2);
      if (q <= 0) return;
      g.save(); g.globalAlpha *= 0.22 * span(q, 0.25, 0.4); g.fillStyle = F.ink; g.beginPath(); sheet.forEach(([a, b], j) => (j ? g.lineTo(a + 12 * u, b + 16 * u) : g.moveTo(a + 12 * u, b + 16 * u))); g.fill(); g.restore();
      const oq = span(q, 0, 0.25);
      sheetFill(F, sheet, oq);
      const r0 = ink(F, [sheet], oq, { w: 3.4, seed: i * 5 + 1, col: F.ink }); if (r0 && oq < 1) tip = r0;
      // Lined rules inside, then the label written in.
      for (let r = 1; r < 6; r++) ink(F, [P.line(x + 24 * u, y + r * ph / 6, x + pw - 24 * u, y + r * ph / 6)], span(q, 0.25 + (r - 1) * 0.015, 0.27 + r * 0.015), { w: 1.4, col: F.muted, a: 0.3, single: true, blob: false });
      const lq = span(q, 0.35, 0.5);
      F.sayTip = null;
      say(F, label, x + 36 * u, y + 66 * u, 52 * u, { q: lq, col, maxW: pw * 0.6 });
      if (lq > 0 && lq < 1 && F.sayTip) tip = F.sayTip;
      // Big bubble figure counting up.
      const nq = span(q, 0.5, 0.8), nx = x + pw * (vertical ? 0.25 : 0.27), ny = y + ph * 0.5;
      if (nq > 0) bubble(F, count(F, value * eo(nq), d), nx, ny, Math.min(150 * u, ph * 0.34), { col, maxW: pw * 0.4, min: 96 * u, pop: 0.6 + 0.4 * eo(span(nq, 0, 0.4)) });
      // The picture on the right half: tangle or tidy star.
      const ax = x + pw * 0.7, ay = y + ph * 0.5, as = Math.min(pw * 0.22, ph * 0.28), aq = span(q, 0.5, 0.85);
      if (!good) {
        const sc = TANGLE.map(([a, b]) => [ax + a * as + Math.sin(t * 6 + a * 9) * 2.5 * u, ay + b * as + Math.cos(t * 5 + b * 9) * 2.5 * u]);
        const r = ink(F, [smooth(sc)], aq, { w: 2.2, seed: 40, single: true, amp: 2.2, blob: false }); if (r && aq < 1) tip = r;
        const c0 = Math.max(hold * 0.42, 1.5), cr = span(local, c0, c0 + 0.5);
        if (aq >= 1) { const rc = ink(F, [P.line(ax - as * 1.0, ay - as * 0.9, ax + as * 1.0, ay + as * 0.9), P.line(ax + as * 1.0, ay - as * 0.9, ax - as * 1.0, ay + as * 0.9)], cr, { w: 5, col: F.red, seed: 55 }); if (rc && cr < 1) tip = rc; }
      } else {
        const star = D.star(ax, ay, as, t * 0.0, 0)[0];
        const rs = rot(star, ax, ay, t * 0.35);
        paperFill(F, rs, aq);
        const r = shape(F, rs, aq, { w: 3.4, col: F.red, gap: 6, cross: true, seed: 66, ha: 0.7 }); if (r && aq < 1) tip = r;
        const ring = P.ell(ax, ay, as * 1.35, as * 1.35);
        ink(F, [ring], span(aq, 0.4, 1), { w: 2.4, col: F.ink, dash: [14, 12], dashOff: t * 22, blob: false });
        if (aq >= 1) for (let k = 0; k < 3; k++) ink(F, D.sparkle(ax + Math.cos(t * 0.8 + k * 2.1) * as * 1.6, ay + Math.sin(t * 0.8 + k * 2.1) * as * 1.6, 24 * u, t, k), 1, { w: 2.4, col: k % 2 ? F.ink : F.red, single: true });
      }
      // A ruler-style meter filled by hatching, with tick marks.
      const mx = x + 36 * u, my = y + ph - 76 * u, mw = pw - 72 * u, mh = 34 * u, mq = span(q, 0.85, 1);
      const track = P.rr(mx, my, mw, mh, 8 * u);
      const rt = ink(F, [track], span(mq, 0, 0.4), { w: 2.8, seed: 77 + i }); if (rt && mq < 0.4) tip = rt;
      // The meter fills with hatching laid stroke by stroke behind the pen.
      const fw = mw * clamp(value / maxV), fq = span(mq, 0.4, 1);
      if (fw > 6 && fq > 0) {
        const fp = P.rr(mx, my, fw, mh, 8 * u);
        const ht = hatch(F, fp, bbox(fp), fq, { col, gap: 6, a: 0.85 }); if (ht && fq < 1) tip = ht;
        if (fq >= 1) ink(F, [P.line(mx + fw, my - 6 * u, mx + fw, my + mh + 6 * u)], 1, { w: 3, col, single: true, blob: false });
      }
      for (let k = 1; k < 10; k++) ink(F, [P.line(mx + (mw * k) / 10, my + mh + 5 * u, mx + (mw * k) / 10, my + mh + (k % 5 ? 11 : 19) * u)], mq, { w: 1.8, col: F.muted, single: true, blob: false });
    });
    // A pen-drawn arrow between the two pages, with sparkles that keep turning.
    const a0 = Math.max(hold * 0.42, 1.5) + 0.55, aq2 = eo(span(local, a0, a0 + 0.6));
    const ax0 = vertical ? box.x + box.w * 0.5 : box.x + pw + 12 * u, ay0 = vertical ? box.y + ph + 12 * u : box.y + box.h * 0.5, ax1 = vertical ? ax0 : ax0 + gap - 24 * u, ay1 = vertical ? ay0 + gap - 24 * u : ay0;
    const arrow = P.bez(ax0, ay0, lerp(ax0, ax1, 0.4) + (vertical ? 40 * u : 0), lerp(ay0, ay1, 0.4) - (vertical ? 0 : 50 * u), lerp(ax0, ax1, 0.6) - (vertical ? 40 * u : 0), lerp(ay0, ay1, 0.6) + (vertical ? 0 : 50 * u), ax1, ay1);
    const rA = ink(F, [arrow], aq2, { w: 4.2, col: F.red, dash: [22, 12], dashOff: -t * 50, blob: false }); if (rA && aq2 < 1) tip = rA;
    if (aq2 >= 1) ink(F, [P.head(ax1, ay1, Math.atan2(ay1 - arrow[arrow.length - 4][1], ax1 - arrow[arrow.length - 4][0]), 32 * u)], 1, { w: 4.4, col: F.red, blob: false });
    ink(F, D.sparkle(vertical ? ax0 + 70 * u : ax0 + gap * 0.5, vertical ? ay0 + gap * 0.5 : ay0 - 90 * u, 30 * u, t, 4), span(local, a0 + 0.5, a0 + 1.1), { w: 2.8, col: F.ink });
    const done = a0 + 0.65;
    if (tip) { if (local > done) scribble(F, tip, local - done, 34, 16); else nib(F, tip.x, tip.y); }
    return done;
  }

  const halo = () => "none";
  const TONE = { paper: "#f6f1e3", stain: "120,92,50", line: "98,140,214", lineA: 0.4, margin: "214,70,62", hole0: "#c9bfa8", hole1: "#6c6254", pen: "#2b44b8", penDark: "#16257a" };
  return {
    bg: "#f6f1e3", panel: "rgba(30,58,158,0.05)", ink: "#1e3a9e", muted: "#6a7cc0", accent: "#d2352f", onAccent: "#ffffff",
    rule: "rgba(30,58,158,0.5)", track: "rgba(30,58,158,0.1)", panelEdge: "rgba(30,58,158,0.5)",
    display: BUB, displayWeight: 400, displayTracking: "0.01em", body: HAND, bodyWeight: 700, figures: BUB,
    radius: 10, motion: "write", kit: { line: 3, fill: "none", panel: "outline" },
    tone: TONE, keepArt: true, overlap: true,
    palettes: {
      // Sheet: bright white copy paper and a darker navy pen. Midnight: a dark notebook with a white gel pen. Pencil: graphite on cream.
      light: { bg: "#fcfbf7", ink: "#17285e", muted: "#6d7aa0", accent: "#d92b34", backdrop: () => "#fcfbf7", textShadow: halo,
        tone: { ...TONE, paper: "#fcfbf7", stain: "130,120,100", line: "120,160,220", lineA: 0.34, pen: "#1b2b66", penDark: "#0c1538" } },
      dark: { bg: "#171c36", ink: "#e1e8ff", muted: "#8e9cd0", accent: "#ff9a78", panel: "rgba(225,232,255,0.06)", rule: "rgba(225,232,255,0.55)", track: "rgba(225,232,255,0.12)", panelEdge: "rgba(225,232,255,0.55)", onAccent: "#171c36",
        backdrop: () => "#171c36", textShadow: halo,
        tone: { ...TONE, paper: "#171c36", stain: "10,10,30", line: "130,150,230", lineA: 0.2, margin: "255,130,110", hole0: "#05060e", hole1: "#0c0f22", pen: "#e8ecff", penDark: "#9aa6dc" } },
      mono: { bg: "#f1f0ea", ink: "#2b2b2b", muted: "#77776f", accent: "#2b2b2b", panel: "rgba(40,40,40,0.05)", rule: "rgba(45,45,45,0.55)", track: "rgba(45,45,45,0.1)", panelEdge: "rgba(45,45,45,0.5)", onAccent: "#f1f0ea",
        backdrop: () => "#f1f0ea", textShadow: halo,
        tone: { ...TONE, paper: "#f1f0ea", stain: "90,90,80", line: "130,130,125", lineA: 0.3, margin: "120,120,115", pen: "#3a3a3a", penDark: "#161616" } },
    },
    textShadow: halo,
    backdrop: (accent, tex, look) => look.bg,
    css: (accent, look) => `
      .display { text-wrap: balance; font-family: ${BUB}; font-weight: 400; text-transform: none; letter-spacing: 0.01em; line-height: 1.1; text-shadow: none !important;
        color: transparent; -webkit-text-stroke: 0.038em ${look.ink}; paint-order: stroke fill;
        background: repeating-linear-gradient(135deg, ${look.ink} 0 1.5px, transparent 1.5px 8px), linear-gradient(${look.bg}, ${look.bg});
        -webkit-background-clip: text; background-clip: text; filter: drop-shadow(0.045em 0.05em 0 ${hexA(accent, 0.6)}); }
      .kicker { font-family: ${HAND}; font-weight: 700; text-transform: none; letter-spacing: 0.03em; color: ${accent}; font-size: 46px !important; text-shadow: none !important; }
    `,
    // The notebook page, its holes, margin and doodles are drawn by the stage so they travel together.
    paint: (ctx, W, H) => { ctx.clearRect(0, 0, W, H); },
    stage(ctx, S, info) {
      if (!S.paint) return;
      const F = mk(ctx, S, info.t);
      page(F, { ...info, index: Math.max(0, info.index) });
    },
    scenes: { title: scene(titleArt), chart: scene(chart, "chart"), object: scene(object, "object"), people: scene(people, "people"), process: scene(process, "process"), compare: scene(compare, "compare"), closing: scene(closingArt) },
  };
});
