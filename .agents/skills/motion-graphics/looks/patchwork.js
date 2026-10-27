// Patchwork: a whole quilt as the world. Every scene is felt appliqued onto cotton patches: blanket
// stitch round every edge, buttons with thread crosses, woven tags, prize rosettes, measuring tape,
// spools, scissors and button-eyed felt dolls. The quilt drifts, patches flip over in a wave to
// change scene, and a needle keeps sewing through every hold. All drawings are original.
// Frames are pure functions of time; texture comes from seeded generators only.
window.DreamcutMotion.register("patchwork", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const back = (v) => { v = clamp(v); const c1 = 1.8, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const mod = (n, m) => ((n % m) + m) % m;
  const ping = (x) => 1 - Math.abs((mod(x, 2)) - 1);
  const smooth = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };
  const hash = (n) => { let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
  const FONT = "'Arial Rounded MT Bold', 'Arial Rounded Bold', 'Avenir Next Rounded', 'Trebuchet MS', sans-serif";

  // ---- colour ---------------------------------------------------------------------------------------
  const rgb = (h) => {
    let s = String(h).replace("#", "");
    if (s.length === 3) s = s.split("").map((c) => c + c).join("");
    const n = parseInt(s, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const toHex = (c) => "#" + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, k) => { const A = rgb(a), B = rgb(b); return toHex(A.map((v, i) => lerp(v, B[i], k))); };
  const shade = (c, k) => (k >= 0 ? mix(c, "#ffffff", k) : mix(c, "#000000", -k));
  const lum = (c) => { const [r, g, b] = rgb(c); return 0.3 * r + 0.59 * g + 0.11 * b; };
  const contrast = (c, T) => (lum(c) > 170 ? shade(c, -0.5) : T.thread);

  // ---- geometry: shapes are lists of points, stitched and filled the same way -----------------------
  const rr = (x, y, w, h, r, seg = 6) => {
    r = Math.min(r, w / 2, h / 2);
    const pts = [];
    const corner = (cx, cy, a0) => { for (let i = 0; i <= seg; i++) { const a = a0 + (i / seg) * Math.PI / 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
    corner(x + w - r, y + r, -Math.PI / 2); corner(x + w - r, y + h - r, 0); corner(x + r, y + h - r, Math.PI / 2); corner(x + r, y + r, Math.PI);
    return pts;
  };
  const ell = (cx, cy, rx, ry, n = 36, rot = 0) => {
    const pts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU, x = Math.cos(a) * rx, y = Math.sin(a) * ry; pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]); }
    return pts;
  };
  const scallop = (cx, cy, r, lobes, amp, rot = 0) => {
    const pts = [], n = lobes * 8;
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU, k = 1 - amp + amp * Math.abs(Math.cos((lobes * a) / 2)); pts.push([cx + Math.cos(a + rot) * r * k, cy + Math.sin(a + rot) * r * k]); }
    return pts;
  };
  const petals = (cx, cy, r, n, rot = 0) => {
    const pts = [], m = n * 9;
    for (let i = 0; i < m; i++) { const a = (i / m) * TAU, k = 0.72 + 0.28 * Math.cos(n * a); pts.push([cx + Math.cos(a + rot) * r * k, cy + Math.sin(a + rot) * r * k]); }
    return pts;
  };
  const star = (cx, cy, ro, ri, n, rot = -Math.PI / 2) => {
    const pts = [];
    for (let i = 0; i < n * 2; i++) { const a = rot + (i * Math.PI) / n, r = i % 2 ? ri : ro; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    return pts;
  };
  const heart = (cx, cy, s) => {
    const pts = [];
    for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU; pts.push([cx + (16 * Math.pow(Math.sin(a), 3)) * s / 17, cy - (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) * s / 17 + s * 0.08]); }
    return pts;
  };
  const closed = (pts) => pts.concat([pts[0]]);
  const tracePoly = (g, pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
  const bounds = (pts) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  // Equal-spaced points round a closed outline, each with its outward normal.
  function resample(pts, step) {
    const n = pts.length, seg = [];
    let per = 0, area = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      seg.push(l); per += l; area += a[0] * b[1] - b[0] * a[1];
    }
    const sign = area >= 0 ? 1 : -1, count = Math.max(8, Math.round(per / step)), ds = per / count, out = [];
    let si = 0, start = 0;
    for (let k = 0; k < count; k++) {
      const target = k * ds;
      while (si < n - 1 && start + seg[si] < target) { start += seg[si]; si++; }
      const a = pts[si], b = pts[(si + 1) % n], l = seg[si] || 1, f = (target - start) / l;
      const tx = (b[0] - a[0]) / l, ty = (b[1] - a[1]) / l;
      out.push({ x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, nx: sign * ty, ny: -sign * tx });
    }
    return out;
  }
  const curve = (ax, ay, bx, by, sag, n = 28) => {
    const pts = [], mx = (ax + bx) / 2, my = (ay + by) / 2 + sag;
    for (let i = 0; i <= n; i++) { const s = i / n, k = 1 - s; pts.push([k * k * ax + 2 * k * s * mx + s * s * bx, k * k * ay + 2 * k * s * my + s * s * by]); }
    return pts;
  };
  // Stroke the first q of a polyline.
  function strokePart(g, pts, q) {
    if (q <= 0 || pts.length < 2) return;
    const last = (pts.length - 1) * clamp(q), whole = Math.floor(last), frac = last - whole;
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i <= whole; i++) g.lineTo(pts[i][0], pts[i][1]);
    if (frac > 0 && whole + 1 < pts.length) g.lineTo(lerp(pts[whole][0], pts[whole + 1][0], frac), lerp(pts[whole][1], pts[whole + 1][1], frac));
    g.stroke();
  }
  const pointAt = (pts, q) => {
    const last = (pts.length - 1) * clamp(q), i = Math.min(pts.length - 2, Math.floor(last)), f = last - i;
    const a = pts[i], b = pts[i + 1];
    return { x: lerp(a[0], b[0], f), y: lerp(a[1], b[1], f), a: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  };

  // ---- fabric ---------------------------------------------------------------------------------------
  const PRINTS = ["gingham", "dots", "stripes", "flowers", "argyle", "scallops", "cord", "twill", "hearts", "plaid", "zig"];
  function print(g, kind, x, y, w, h, c2, s) {
    g.save();
    g.lineCap = "round";
    switch (kind) {
      case "gingham":
        g.fillStyle = hexA(c2, 0.32);
        for (let xx = x; xx < x + w; xx += s * 2) g.fillRect(xx, y, s, h);
        for (let yy = y; yy < y + h; yy += s * 2) g.fillRect(x, yy, w, s);
        break;
      case "plaid":
        g.fillStyle = hexA(c2, 0.26);
        for (let xx = x; xx < x + w; xx += s * 3) g.fillRect(xx, y, s * 1.1, h);
        for (let yy = y; yy < y + h; yy += s * 3) g.fillRect(x, yy, w, s * 1.1);
        g.fillStyle = hexA(c2, 0.5);
        for (let xx = x + s * 1.9; xx < x + w; xx += s * 3) g.fillRect(xx, y, s * 0.12, h);
        for (let yy = y + s * 1.9; yy < y + h; yy += s * 3) g.fillRect(x, yy, w, s * 0.12);
        break;
      case "dots": {
        g.fillStyle = hexA(c2, 0.62);
        let r = 0;
        for (let yy = y + s * 0.5; yy < y + h + s; yy += s * 1.05, r++) for (let xx = x + (r % 2 ? s * 0.9 : 0) + s * 0.3; xx < x + w + s; xx += s * 1.8) { g.beginPath(); g.arc(xx, yy, s * 0.2, 0, TAU); g.fill(); }
        break;
      }
      case "stripes":
        g.fillStyle = hexA(c2, 0.45);
        for (let xx = x; xx < x + w; xx += s * 1.2) g.fillRect(xx, y, s * 0.55, h);
        break;
      case "cord":
        for (let yy = y, i = 0; yy < y + h; yy += s * 0.28, i++) { g.fillStyle = i % 2 ? "rgba(255,255,255,0.13)" : "rgba(0,0,0,0.12)"; g.fillRect(x, yy, w, s * 0.14); }
        break;
      case "twill":
        g.strokeStyle = hexA(c2, 0.3); g.lineWidth = Math.max(1, s * 0.07);
        g.beginPath();
        for (let xx = x - h; xx < x + w; xx += s * 0.34) { g.moveTo(xx, y + h); g.lineTo(xx + h, y); }
        g.stroke();
        break;
      case "argyle":
        g.strokeStyle = hexA(c2, 0.5); g.lineWidth = Math.max(1, s * 0.09);
        g.beginPath();
        for (let xx = x - h; xx < x + w + h; xx += s * 1.5) { g.moveTo(xx, y); g.lineTo(xx + h, y + h); g.moveTo(xx + h, y); g.lineTo(xx, y + h); }
        g.stroke();
        break;
      case "scallops":
        g.strokeStyle = hexA(c2, 0.5); g.lineWidth = Math.max(1, s * 0.09);
        g.beginPath();
        for (let yy = y, r = 0; yy < y + h + s; yy += s * 0.55, r++) for (let xx = x + (r % 2 ? s * 0.6 : 0) - s; xx < x + w + s; xx += s * 1.2) { g.moveTo(xx + s * 0.6, yy); g.arc(xx, yy, s * 0.6, 0, Math.PI, true); }
        g.stroke();
        break;
      case "zig":
        g.strokeStyle = hexA(c2, 0.55); g.lineWidth = Math.max(1, s * 0.12);
        g.beginPath();
        for (let yy = y; yy < y + h + s; yy += s * 0.9) { g.moveTo(x - s, yy); for (let xx = x - s, k = 0; xx < x + w + s; xx += s * 0.5, k++) g.lineTo(xx + s * 0.5, yy + (k % 2 ? 0 : s * 0.4)); }
        g.stroke();
        break;
      case "flowers": {
        let r = 0;
        for (let yy = y + s * 0.6; yy < y + h + s; yy += s * 1.5, r++) for (let xx = x + (r % 2 ? s * 0.8 : 0) + s * 0.4; xx < x + w + s; xx += s * 1.6) {
          g.fillStyle = hexA(c2, 0.62);
          for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; g.beginPath(); g.arc(xx + Math.cos(a) * s * 0.2, yy + Math.sin(a) * s * 0.2, s * 0.14, 0, TAU); g.fill(); }
          g.fillStyle = "rgba(255,244,214,0.8)"; g.beginPath(); g.arc(xx, yy, s * 0.09, 0, TAU); g.fill();
        }
        break;
      }
      case "hearts": {
        let r = 0;
        g.fillStyle = hexA(c2, 0.6);
        for (let yy = y + s * 0.5; yy < y + h + s; yy += s * 1.3, r++) for (let xx = x + (r % 2 ? s * 0.8 : 0) + s * 0.3; xx < x + w + s; xx += s * 1.6) { tracePoly(g, heart(xx, yy, s * 0.5)); g.fill(); }
        break;
      }
      default:
    }
    g.restore();
  }

  // Cached textures: felt fibre and woven cloth, drawn from seeded random only.
  let feltPat = null, weavePat = null, patKey = "";
  function pats(g, F) {
    const key = String(F.u.toFixed(3));
    if (feltPat && patKey === key) return;
    patKey = key;
    const r = rng(11), c = document.createElement("canvas");
    c.width = c.height = 200;
    const x = c.getContext("2d");
    for (let i = 0; i < 1500; i++) { x.fillStyle = r() > 0.5 ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.2)"; x.fillRect(r() * 200, r() * 200, 1 + r() * 1.6, 1 + r() * 1.6); }
    x.lineCap = "round";
    for (let i = 0; i < 110; i++) {
      x.strokeStyle = r() > 0.5 ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.16)"; x.lineWidth = 0.8;
      const px = r() * 200, py = r() * 200, a = r() * TAU, l = 5 + r() * 9;
      x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + Math.cos(a + 0.8) * l * 0.6, py + Math.sin(a + 0.8) * l * 0.6, px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
    }
    feltPat = g.createPattern(c, "repeat");
    const w = document.createElement("canvas");
    w.width = w.height = 6;
    const y = w.getContext("2d");
    y.fillStyle = "rgba(0,0,0,0.12)"; y.fillRect(0, 2, 6, 1); y.fillRect(2, 0, 1, 6);
    y.fillStyle = "rgba(255,255,255,0.1)"; y.fillRect(0, 5, 6, 1); y.fillRect(5, 0, 1, 6);
    weavePat = g.createPattern(w, "repeat");
    if (feltPat.setTransform && typeof DOMMatrix !== "undefined") { feltPat.setTransform(new DOMMatrix().scale(F.u)); weavePat.setTransform(new DOMMatrix().scale(F.u * 1.1)); }
  }

  // ---- the appliqué: felt with a stitched edge ------------------------------------------------------
  // Fill, print, fibre and pillow shading, then the stitching. sq is how much of the edge has been sewn.
  function felt(g, F, pts, color, o = {}) {
    const u = F.u, T = F.T;
    pats(g, F);
    const bb = bounds(pts);
    g.save();
    if (o.shadow !== false) { g.shadowColor = "rgba(30,14,16,0.34)"; g.shadowBlur = (o.sh || 15) * u; g.shadowOffsetY = (o.so || 7) * u; g.shadowOffsetX = (o.sx || 0) * u; }
    tracePoly(g, pts); g.fillStyle = color; g.fill();
    g.restore();
    g.save();
    tracePoly(g, pts); g.clip();
    if (o.print) print(g, o.print, bb.x, bb.y, bb.w, bb.h, o.c2 || (lum(color) > 150 ? shade(color, -0.38) : shade(color, 0.45)), (o.ps || 24) * u);
    const gr = g.createLinearGradient(bb.x, bb.y, bb.x + bb.w * 0.7, bb.y + bb.h);
    gr.addColorStop(0, "rgba(255,255,255,0.2)"); gr.addColorStop(0.5, "rgba(255,255,255,0)"); gr.addColorStop(1, "rgba(0,0,0,0.16)");
    g.fillStyle = gr; g.fillRect(bb.x, bb.y, bb.w, bb.h);
    g.globalAlpha = 0.5 * F.tx; g.fillStyle = feltPat; g.fillRect(bb.x, bb.y, bb.w, bb.h);
    g.globalAlpha = 1;
    g.lineJoin = "round"; g.lineWidth = Math.min(16 * u, Math.min(bb.w, bb.h) * 0.2); g.strokeStyle = "rgba(0,0,0,0.14)"; tracePoly(g, pts); g.stroke();
    g.restore();
    g.save();
    tracePoly(g, pts); g.strokeStyle = hexA(shade(color, 0.3), 0.55); g.lineWidth = 1.6 * u; g.lineJoin = "round"; g.stroke();
    g.restore();
    const thread = o.stitch === undefined ? contrast(color, T) : o.stitch;
    if (thread) stitch(g, F, pts, thread, o);
  }
  function stitch(g, F, pts, color, o = {}) {
    const u = F.u, sq = o.sq === undefined ? 1 : o.sq;
    if (sq <= 0) return;
    const step = (o.step || 17) * u, rs = resample(pts, step);
    const upto = Math.min(rs.length, Math.ceil(rs.length * clamp(sq)));
    g.save();
    g.lineCap = "round"; g.lineJoin = "round";
    if (o.run) {
      const inset = (o.inset || 11) * u;
      const line = rs.slice(0, upto + 1).map((p) => [p.x - p.nx * inset, p.y - p.ny * inset]);
      if (line.length > 1) {
        g.setLineDash([(o.dash || 10) * u, (o.gap || 8) * u]);
        g.lineDashOffset = -(o.phase || 0) * u;
        g.strokeStyle = "rgba(0,0,0,0.22)"; g.lineWidth = 3.2 * u; g.save(); g.translate(1 * u, 1.6 * u); g.beginPath(); line.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); g.restore();
        g.strokeStyle = color; g.lineWidth = 3 * u; g.beginPath(); line.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
      }
    } else {
      const inner = 9 * u, outer = 6 * u;
      for (const pass of [0, 1]) {
        g.beginPath();
        for (let i = 0; i < upto; i++) { const p = rs[i]; g.moveTo(p.x - p.nx * inner, p.y - p.ny * inner); g.lineTo(p.x + p.nx * outer, p.y + p.ny * outer); }
        for (let i = 0; i < upto; i++) { const p = rs[i], q = rs[(i + 1) % rs.length]; if (i + 1 < upto || sq >= 1) { g.moveTo(p.x + p.nx * outer, p.y + p.ny * outer); g.lineTo(q.x + q.nx * outer, q.y + q.ny * outer); } }
        if (pass === 0) { g.save(); g.translate(1.2 * u, 1.8 * u); g.strokeStyle = "rgba(0,0,0,0.25)"; g.lineWidth = 3.4 * u; g.stroke(); g.restore(); }
        else { g.strokeStyle = color; g.lineWidth = 3 * u; g.stroke(); }
      }
    }
    // The needle at the front of an unfinished seam.
    if (sq < 1 && upto > 1) {
      const p = rs[upto - 1];
      g.setLineDash([]);
      g.strokeStyle = "#e8edf3"; g.lineWidth = 3 * u; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + p.nx * 34 * u + p.ny * 18 * u, p.y + p.ny * 34 * u - p.nx * 18 * u); g.stroke();
      g.fillStyle = "#fff"; g.beginPath(); g.arc(p.x, p.y, 3.4 * u, 0, TAU); g.fill();
    }
    g.restore();
  }
  // Pop an item in from its centre; q runs 0..1.
  function pop(g, cx, cy, q, fn, o = {}) {
    if (q <= 0) return;
    g.save();
    g.globalAlpha *= clamp(q * 3.2);
    g.translate(cx, cy);
    if (o.rot) g.rotate(o.rot);
    const s = back(q) * (o.scale || 1);
    g.scale(s, s);
    fn(q);
    g.restore();
  }
  const sewn = (q) => clamp((q - 0.2) / 0.7);

  // A smooth thread with a soft shadow beneath.
  function thread(g, F, pts, q, color, w) {
    if (q <= 0) return;
    g.save();
    g.lineCap = "round"; g.lineJoin = "round";
    g.translate(2 * F.u, 3 * F.u); g.strokeStyle = "rgba(0,0,0,0.22)"; g.lineWidth = w; strokeThreadLine(g, pts, q);
    g.translate(-2 * F.u, -3 * F.u); g.strokeStyle = color; g.lineWidth = w; strokeThreadLine(g, pts, q);
    g.strokeStyle = hexA("#ffffff", 0.35); g.lineWidth = Math.max(1, w * 0.28); g.translate(-w * 0.18, -w * 0.2); strokeThreadLine(g, pts, q);
    g.restore();
  }
  const strokeThreadLine = (g, pts, q) => strokePart(g, pts, q);
  function runStitch(g, F, pts, q, color, w, dash, gap, phase) {
    if (q <= 0) return;
    g.save();
    g.lineCap = "round"; g.setLineDash([dash, gap]); g.lineDashOffset = -phase;
    g.strokeStyle = color; g.lineWidth = w; strokePart(g, pts, q);
    g.restore();
  }

  // ---- small pieces ---------------------------------------------------------------------------------
  function button(g, F, cx, cy, r, color, o = {}) {
    const u = F.u;
    g.save();
    g.translate(cx, cy); g.rotate(o.rot || 0);
    g.shadowColor = "rgba(20,10,10,0.38)"; g.shadowBlur = r * 0.5; g.shadowOffsetY = r * 0.22;
    g.fillStyle = color; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    g.shadowColor = "transparent";
    const gr = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    gr.addColorStop(0, shade(color, 0.4)); gr.addColorStop(0.65, color); gr.addColorStop(1, shade(color, -0.28));
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    g.strokeStyle = shade(color, -0.32); g.globalAlpha = 0.55; g.lineWidth = r * 0.09; g.beginPath(); g.arc(0, 0, r * 0.68, 0, TAU); g.stroke();
    g.globalAlpha = 1;
    g.fillStyle = "rgba(0,0,0,0.1)"; g.beginPath(); g.arc(0, 0, r * 0.66, 0, TAU); g.fill();
    const holes = o.holes || 4, d = r * 0.24, hr = r * 0.1;
    const spots = holes === 2 ? [[-d, 0], [d, 0]] : [[-d, -d], [d, -d], [-d, d], [d, d]];
    g.fillStyle = "rgba(20,10,14,0.75)";
    for (const [x, y] of spots) { g.beginPath(); g.arc(x, y, hr, 0, TAU); g.fill(); }
    g.strokeStyle = o.thread || F.T.thread; g.lineWidth = r * 0.1; g.lineCap = "round";
    g.beginPath();
    if (holes === 2) { g.moveTo(-d, 0); g.lineTo(d, 0); } else { g.moveTo(-d, -d); g.lineTo(d, d); g.moveTo(d, -d); g.lineTo(-d, d); }
    g.stroke();
    // A glint that slides across now and then.
    const sh = ((o.shine ?? 0) % 1 + 1) % 1;
    if (sh < 0.35) {
      g.globalAlpha = Math.sin((sh / 0.35) * Math.PI) * 0.6; g.strokeStyle = "#ffffff"; g.lineWidth = r * 0.12;
      g.beginPath(); g.arc(0, 0, r * 0.84, -2.5 + sh * 4, -2.0 + sh * 4); g.stroke();
    }
    g.restore();
  }
  function flower(g, F, r, color, o = {}) {
    felt(g, F, petals(0, 0, r, o.petals || 6), color, { sq: o.sq, step: 14, sh: 10, so: 5, run: false });
    button(g, F, 0, 0, r * 0.34, o.center || F.T.gold, { holes: 4, shine: o.shine });
  }
  function rosette(g, F, r, color, t, o = {}) {
    const u = F.u;
    // Two tails first so the disc sits on top.
    for (const s of [-1, 1]) {
      g.save(); g.translate(0, r * 0.3); g.rotate(s * (0.28 + Math.sin(t * 3 + s) * 0.06));
      felt(g, F, [[-r * 0.22, 0], [r * 0.22, 0], [r * 0.3, r * 1.25], [0, r * 1.02], [-r * 0.3, r * 1.25]], shade(color, -0.12), { sq: 1, step: 14, sh: 8, so: 4, run: true, inset: 7 });
      g.restore();
    }
    felt(g, F, scallop(0, 0, r, 14, 0.09), color, { sq: o.sq, step: 14, sh: 10, so: 5 });
    g.save(); tracePoly(g, ell(0, 0, r * 0.7, r * 0.7, 32)); g.strokeStyle = hexA("#ffffff", 0.7); g.lineWidth = 2.5 * u; g.setLineDash([8 * u, 7 * u]); g.stroke(); g.restore();
    button(g, F, 0, 0, r * 0.4, F.T.gold, { holes: 4, shine: o.shine });
  }
  function spool(g, F, s, color, t, o = {}) {
    const u = F.u, w = s * 0.9, h = s * 1.3, fl = s * 0.22;
    // Thread tail curling off the bottom.
    const tail = [];
    for (let i = 0; i <= 14; i++) { const k = i / 14; tail.push([w * 0.5 - k * w * 1.3, h * 0.5 + Math.sin(k * 5 + t * 2.4) * s * 0.18 * k + k * s * 0.25]); }
    thread(g, F, tail, 1, color, 4.5 * u);
    felt(g, F, rr(-w * 0.42, -h * 0.5 + fl, w * 0.84, h - fl * 2, s * 0.05), color, { sq: o.sq, step: 12, sh: 8, so: 4, stitch: null });
    g.save(); tracePoly(g, rr(-w * 0.42, -h * 0.5 + fl, w * 0.84, h - fl * 2, s * 0.05)); g.clip();
    g.strokeStyle = "rgba(0,0,0,0.22)"; g.lineWidth = Math.max(1, 1.8 * u); g.beginPath();
    for (let y = -h * 0.5; y < h * 0.5; y += s * 0.1) { g.moveTo(-w * 0.45, y); g.lineTo(w * 0.45, y + s * 0.08); }
    g.stroke(); g.restore();
    for (const sy of [-1, 1]) felt(g, F, rr(-w * 0.5, sy < 0 ? -h * 0.5 : h * 0.5 - fl, w, fl, fl * 0.4), F.T.wood, { sq: o.sq, step: 12, sh: 8, so: 4, run: true, inset: 5, stitch: "#a9814f" });
  }
  function scissors(g, F, s, color, t) {
    const u = F.u, open = 0.2 + 0.16 * Math.sin(t * 2.1);
    for (const sg of [-1, 1]) {
      g.save(); g.rotate(sg * open);
      felt(g, F, [[-s * 0.05, -s * 0.05], [s * 0.05, -s * 0.05], [s * 0.035, -s * 1.15], [-s * 0.01, -s * 1.28]].map(([x, y]) => [x * 1.0, y]), F.T.metal, { sq: 1, step: 11, sh: 6, so: 3, stitch: null });
      g.strokeStyle = "rgba(255,255,255,0.7)"; g.lineWidth = 1.6 * u; g.beginPath(); g.moveTo(-s * 0.01, -s * 0.12); g.lineTo(s * 0.0, -s * 1.12); g.stroke();
      g.strokeStyle = color; g.lineWidth = s * 0.11; g.shadowColor = "rgba(0,0,0,0.3)"; g.shadowBlur = 8 * u; g.shadowOffsetY = 4 * u;
      g.beginPath(); g.ellipse(-sg * s * 0.2, s * 0.52, s * 0.22, s * 0.32, sg * 0.18, 0, TAU); g.stroke();
      g.shadowColor = "transparent";
      g.strokeStyle = "rgba(0,0,0,0.2)"; g.lineWidth = s * 0.035; g.beginPath(); g.ellipse(-sg * s * 0.2, s * 0.52, s * 0.22, s * 0.32, sg * 0.18, 0, TAU); g.stroke();
      g.restore();
    }
    button(g, F, 0, 0, s * 0.09, F.T.wood, { holes: 2 });
  }
  function thimble(g, F, s, color) {
    felt(g, F, rr(-s * 0.46, -s * 0.5, s * 0.92, s * 1.0, s * 0.42), color, { print: "dots", ps: s * 0.2 / F.u, sq: 1, step: 13, stitch: null, sh: 9, so: 5 });
    felt(g, F, rr(-s * 0.54, s * 0.2, s * 1.08, s * 0.3, s * 0.1), shade(color, -0.2), { sq: 1, step: 13, run: true, inset: 8, sh: 6, so: 3 });
  }
  function needle(g, F, len, t, color) {
    const u = F.u;
    g.save();
    g.shadowColor = "rgba(0,0,0,0.3)"; g.shadowBlur = 6 * u; g.shadowOffsetY = 3 * u;
    const gr = g.createLinearGradient(0, -4 * u, 0, 4 * u);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.5, "#aeb6c2"); gr.addColorStop(1, "#6d7684");
    g.fillStyle = gr; g.beginPath(); g.moveTo(len * 0.5, 0); g.lineTo(-len * 0.45, -3.4 * u); g.lineTo(-len * 0.5, 0); g.lineTo(-len * 0.45, 3.4 * u); g.closePath(); g.fill();
    g.shadowColor = "transparent";
    g.fillStyle = "rgba(20,14,20,0.8)"; g.beginPath(); g.ellipse(-len * 0.4, 0, 6 * u, 1.8 * u, 0, 0, TAU); g.fill();
    g.restore();
  }

  // Lettering: a woven tag. x,y is the centre, or the eyelet when anchor is "hole".
  function tagAt(g, F, txt, x, y, size, o = {}) {
    txt = String(txt ?? "");
    if (!txt) return 0;
    g.save();
    let fs = size;
    g.font = `bold ${fs}px ${FONT}`;
    let tw = g.measureText(txt).width;
    if (o.maxW && tw > o.maxW) { fs = Math.max(o.min || size * 0.78, (fs * o.maxW) / tw); g.font = `bold ${fs}px ${FONT}`; tw = g.measureText(txt).width; }
    const hole = o.anchor === "hole", padX = 0.5 * fs, h = fs * 1.55, w = tw + padX * 2 + (hole ? fs * 0.9 : 0), left = hole ? -fs * 0.55 : -w / 2;
    const q = o.q ?? 1;
    g.translate(x, y); g.rotate(o.angle || 0);
    const k = back(q); g.scale(k, k); g.globalAlpha *= clamp(q * 3.2);
    felt(g, F, rr(left, -h / 2, w, h, fs * 0.3), o.color || F.T.cream, { sq: o.sq === undefined ? 1 : o.sq, run: true, inset: fs * 0.2 / F.u, step: 14, dash: fs * 0.2 / F.u, gap: fs * 0.16 / F.u, stitch: o.stitch || F.acc, sh: 10, so: 5, phase: o.phase });
    g.fillStyle = F.T.tagInk; g.textBaseline = "middle"; g.textAlign = hole ? "left" : "center";
    g.fillText(txt, hole ? left + padX + fs * 0.9 : 0, fs * 0.04);
    if (hole) { g.fillStyle = "rgba(30,20,26,0.7)"; g.beginPath(); g.arc(0, 0, fs * 0.15, 0, TAU); g.fill(); g.strokeStyle = F.T.metal; g.lineWidth = fs * 0.07; g.stroke(); }
    g.restore();
    return w;
  }
  // Felt numerals with a stitched edge.
  function numeral(g, F, txt, cx, cy, size, color, o = {}) {
    const u = F.u;
    g.save();
    g.font = `bold ${size}px ${FONT}`; g.textAlign = o.align || "center"; g.textBaseline = "middle"; g.lineJoin = "round";
    g.shadowColor = "rgba(30,14,16,0.35)"; g.shadowBlur = 12 * u; g.shadowOffsetY = 6 * u;
    g.strokeStyle = o.edge || shade(color, -0.55); g.lineWidth = size * 0.17; g.strokeText(txt, cx, cy);
    g.shadowColor = "transparent";
    g.fillStyle = color; g.fillText(txt, cx, cy);
    g.save(); g.globalAlpha = 0.4 * F.tx; g.fillStyle = feltPat; g.fillText(txt, cx, cy); g.restore();
    g.setLineDash([size * 0.07, size * 0.065]); g.strokeStyle = o.stitch || F.T.thread; g.lineWidth = size * 0.028; g.lineCap = "round"; g.strokeText(txt, cx, cy);
    g.restore();
  }
  // A garden of small things that decorate corners.
  function item(g, F, kind, cx, cy, s, q, seed, o = {}) {
    const t = F.t, T = F.T, fab = T.fabrics;
    const col = (k) => fab[(seed * 3 + k) % fab.length];
    const sway = Math.sin(t * 1.5 + seed * 1.7) * 0.07 + (o.rot || 0);
    const bob = Math.sin(t * 1.9 + seed * 2.3) * s * 0.05;
    pop(g, cx, cy + bob, q, () => {
      g.rotate(sway);
      const sq = sewn(q);
      switch (kind) {
        case "flower": flower(g, F, s, col(0), { sq, shine: t * 0.25 + seed * 0.3, center: col(2) }); break;
        case "button": button(g, F, 0, 0, s * 0.7, col(1), { shine: t * 0.3 + seed * 0.37, holes: seed % 2 ? 2 : 4 }); break;
        case "heart": felt(g, F, heart(0, 0, s * 1.8), F.acc, { sq, step: 14 }); break;
        case "star": felt(g, F, star(0, 0, s * 1.05, s * 0.5, 5), T.gold, { sq, step: 13 }); break;
        case "spool": spool(g, F, s, col(0), t, { sq }); break;
        case "scissors": scissors(g, F, s, F.acc, t + seed); break;
        case "thimble": thimble(g, F, s, col(1)); break;
        case "rosette": rosette(g, F, s, F.acc, t + seed, { sq, shine: t * 0.2 }); break;
        default: button(g, F, 0, 0, s * 0.6, col(0), {});
      }
    });
  }

  // ---- the frame helper ----------------------------------------------------------------------------
  function frameOf(g, S, info) {
    const T = S.look.tone;
    return { g, S, u: S.u, W: S.W, H: S.H, t: info ? info.t : 0, acc: S.accent, L: S.look, T, tx: S.look.texture, tall: S.tall, TS: Math.round(228 * S.u), info };
  }
  const first = (arr, i) => arr[mod(i, arr.length)];

  // ---- the quilt: cotton blocks that drift and flip ------------------------------------------------
  const NC = 12, NR = 8, FACES = 4;
  let tiles = new Map(), tileKey = "";
  function tileOf(g, F, id, face) {
    const key = `${F.TS}:${F.T.paper}:${F.tx.toFixed(2)}`;
    if (key !== tileKey) { tiles = new Map(); tileKey = key; }
    const k = id * 8 + face;
    let c = tiles.get(k);
    if (c) return c;
    const TS = F.TS, u = F.u;
    c = document.createElement("canvas"); c.width = c.height = TS;
    const x = c.getContext("2d");
    pats(x, F);
    const r = rng(id * 977 + face * 131 + 7), fab = F.T.fabrics;
    const pick = () => fab[Math.floor(r() * fab.length)];
    const pieceFill = (clip, color) => {
      x.save(); clip(); x.clip();
      x.fillStyle = color; x.fillRect(0, 0, TS, TS);
      if (r() > 0.18) print(x, PRINTS[Math.floor(r() * PRINTS.length)], 0, 0, TS, TS, lum(color) > 150 ? shade(color, -0.36) : shade(color, 0.42), (17 + r() * 8) * u);
      x.restore();
    };
    const tri = (a, b, c2) => () => { x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.lineTo(c2[0], c2[1]); x.closePath(); };
    const rect = (px, py, w, h) => () => { x.beginPath(); x.rect(px, py, w, h); };
    const kind = r(), seams = [];
    if (kind < 0.46) pieceFill(rect(0, 0, TS, TS), pick());
    else if (kind < 0.7) {
      const flip = r() > 0.5;
      const A = flip ? [[0, 0], [TS, 0], [0, TS]] : [[0, 0], [TS, 0], [TS, TS]], B = flip ? [[TS, 0], [TS, TS], [0, TS]] : [[0, 0], [0, TS], [TS, TS]];
      pieceFill(tri(...A), pick()); pieceFill(tri(...B), pick());
      seams.push(flip ? [[TS, 0], [0, TS]] : [[0, 0], [TS, TS]]);
    } else if (kind < 0.84) {
      const a = pick(), b = pick(), h = TS / 2;
      pieceFill(rect(0, 0, h, h), a); pieceFill(rect(h, 0, h, h), b); pieceFill(rect(0, h, h, h), b); pieceFill(rect(h, h, h, h), a);
      seams.push([[h, 0], [h, TS]], [[0, h], [TS, h]]);
    } else {
      const a = pick(), b = pick(), m = TS / 2;
      pieceFill(tri([0, 0], [TS, 0], [m, m]), a); pieceFill(tri([TS, 0], [TS, TS], [m, m]), b); pieceFill(tri([TS, TS], [0, TS], [m, m]), a); pieceFill(tri([0, TS], [0, 0], [m, m]), b);
      seams.push([[0, 0], [TS, TS]], [[TS, 0], [0, TS]]);
    }
    x.lineCap = "round";
    for (const [a, b] of seams) { x.strokeStyle = "rgba(0,0,0,0.22)"; x.lineWidth = 2.4 * u; x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); x.strokeStyle = "rgba(255,255,255,0.22)"; x.lineWidth = 1.4 * u; x.beginPath(); x.moveTo(a[0] - 1.5, a[1] - 1.5); x.lineTo(b[0] - 1.5, b[1] - 1.5); x.stroke(); }
    // Pillowy puff between the seams, and fine weave over everything.
    const gr = x.createRadialGradient(TS * 0.45, TS * 0.42, TS * 0.1, TS / 2, TS / 2, TS * 0.78);
    gr.addColorStop(0, "rgba(255,255,255,0.13)"); gr.addColorStop(0.6, "rgba(255,255,255,0)"); gr.addColorStop(1, "rgba(0,0,0,0.2)");
    x.fillStyle = gr; x.fillRect(0, 0, TS, TS);
    x.globalAlpha = 0.9 * F.tx; x.fillStyle = weavePat; x.fillRect(0, 0, TS, TS); x.globalAlpha = 1;
    x.strokeStyle = "rgba(0,0,0,0.2)"; x.lineWidth = 4 * u; x.strokeRect(0, 0, TS, TS);
    // The quilt is the ground, not the figure: wash it toward the backing cloth so the appliqué reads first.
    x.globalAlpha = 0.36; x.fillStyle = F.T.paper; x.fillRect(0, 0, TS, TS); x.globalAlpha = 1;
    tiles.set(k, c);
    return c;
  }
  // How far through a scene change we are: 0..1 across the last `change` seconds of a scene and the
  // first `change` seconds of the next, or -1 when no change is under way.
  function changeAt(info) {
    const change = Math.max(0.1, info.change || 0.45), local = info.local || 0, hold = info.hold || 0;
    if (info.next && local > hold - change) return 0.5 * clamp((local - (hold - change)) / change);
    if ((info.index || 0) > 0 && local < change) return 0.5 + 0.5 * clamp(local / change);
    return -1;
  }
  // One quilt for the whole film. It drifts and breathes; at a change a wave of patches puffs up
  // off the batting one by one, left to right, while a needle sews a seam across.
  function quilt(g, F, info) {
    const { W, H, TS, u, t } = F;
    const ox = t * 24 * u, oy = t * 10 * u;
    const push = 1.025 + 0.015 * Math.sin(t * 0.35);
    g.save();
    g.translate(W / 2, H / 2); g.scale(push, push); g.translate(-W / 2, -H / 2);
    const c0 = Math.floor(ox / TS) - 1, r0 = Math.floor(oy / TS) - 1, cols = Math.ceil(W / TS) + 3, rows = Math.ceil(H / TS) + 3;
    const tr = changeAt(info);
    const peeks = [];
    const slot = Math.floor(t / 0.55);
    for (let j = 0; j < 4; j++) { const sl = slot - j, gg = (t - sl * 0.55) / 1.7; if (gg >= 0 && gg <= 1) peeks.push({ id: Math.floor(hash(sl * 13 + 5) * NC * NR), g: gg }); }
    const raised = [];
    for (let rr_ = r0; rr_ < r0 + rows; rr_++) for (let cc = c0; cc < c0 + cols; cc++) {
      const x = Math.round(cc * TS - ox), y = Math.round(rr_ * TS - oy), cx = x + TS / 2, cy = y + TS / 2;
      if (x > W + TS || y > H + TS || x < -2 * TS || y < -2 * TS) continue;
      const id = mod(rr_, NR) * NC + mod(cc, NC);
      let sx = 1, lift = 1, rot = 0, face = 0;
      if (tr >= 0) {
        const dly = clamp(cx / W) * 0.55 + hash(id + 3) * 0.12, f = clamp((tr - dly) / 0.33);
        if (f > 0 && f < 1) { lift = 1 + 0.085 * Math.sin(Math.PI * f); rot = (hash(id + 9) - 0.5) * 0.08 * Math.sin(Math.PI * f); }
      }
      for (const pk of peeks) if (pk.id === id) { const k = Math.sin(Math.PI * pk.g); lift *= 1 + 0.06 * k; rot += (hash(id + 21) - 0.5) * 0.1 * k; }
      g.drawImage(tileOf(g, F, id, 0), x, y, TS + 1, TS + 1);
      if (sx !== 1 || lift !== 1) raised.push({ x, y, cx, cy, id, sx, lift, rot, face });
    }
    // Raised patches go on top of the flat ones so their shadows fall across the neighbours.
    for (const r of raised) {
      const k = r.lift - 1;
      g.fillStyle = `rgba(24,10,20,${0.12 + k * 2.2})`; g.fillRect(r.x, r.y, TS + 1, TS + 1);
      g.save(); g.translate(r.cx, r.cy); g.rotate(r.rot); g.scale(r.sx * r.lift, r.lift);
      g.shadowColor = "rgba(0,0,0,0.42)"; g.shadowBlur = (10 + k * 200) * u; g.shadowOffsetY = (4 + k * 80) * u;
      g.drawImage(tileOf(g, F, r.id, r.face), -TS / 2, -TS / 2, TS + 1, TS + 1);
      g.shadowColor = "transparent";
      g.strokeStyle = hexA(F.T.thread, 0.75); g.lineWidth = 2.6 * u; g.setLineDash([11 * u, 9 * u]); g.strokeRect(-TS / 2 + 7 * u, -TS / 2 + 7 * u, TS - 14 * u, TS - 14 * u); g.setLineDash([]);
      g.restore();
    }
    // Running stitch along every seam, crawling as if being sewn.
    g.lineCap = "round"; g.setLineDash([11 * u, 9 * u]); g.lineDashOffset = -t * 14 * u;
    for (const pass of [0, 1]) {
      g.strokeStyle = pass ? hexA(F.T.thread, 0.7) : "rgba(0,0,0,0.24)"; g.lineWidth = (pass ? 2.6 : 3.2) * u;
      g.beginPath();
      for (let cc = c0; cc <= c0 + cols; cc++) { const x = Math.round(cc * TS - ox) + (pass ? 0 : 1.5 * u); g.moveTo(x, -TS); g.lineTo(x, H + TS); }
      for (let rr_ = r0; rr_ <= r0 + rows; rr_++) { const y = Math.round(rr_ * TS - oy) + (pass ? 0 : 1.5 * u); g.moveTo(-TS, y); g.lineTo(W + TS, y); }
      g.stroke();
    }
    g.setLineDash([]);
    // The change seam: a needle runs across along one row line, laying a bold thread behind it.
    if (tr >= 0) {
      const row = Math.round((H * 0.24 + oy) / TS), sy = Math.round(row * TS - oy);
      const nxp = lerp(-W * 0.08, W * 1.08, smooth(tr)), fade = 1 - span(tr, 0.82, 1);
      g.save(); g.globalAlpha = fade;
      const pts = [];
      for (let i = 0; i <= 30; i++) { const x = lerp(-W * 0.1, nxp, i / 30); pts.push([x, sy + Math.sin(i * 1.7 + t * 6) * 2 * u]); }
      g.lineCap = "round"; g.setLineDash([18 * u, 12 * u]); g.lineDashOffset = 0;
      g.strokeStyle = "rgba(0,0,0,0.28)"; g.lineWidth = 7 * u; g.save(); g.translate(2 * u, 3 * u); strokePart(g, pts, 1); g.restore();
      g.strokeStyle = F.acc; g.lineWidth = 6 * u; strokePart(g, pts, 1);
      g.setLineDash([]);
      g.translate(nxp, sy + Math.sin(t * 22) * 8 * u); g.rotate(-0.35 + Math.sin(t * 22) * 0.12); needle(g, F, 260 * u, t, F.acc);
      g.restore();
    }
    g.restore();
  }
  // Loose buttons and felt scraps drifting slowly across the cloth behind everything.
  function driftBits(g, F) {
    const { W, H, u, t, T } = F, n = F.tall ? 7 : 9;
    for (let i = 0; i < n; i++) {
      const h1 = hash(i * 17 + 3), h2 = hash(i * 17 + 4), h3 = hash(i * 17 + 5);
      const sp = (26 + h2 * 30) * u, span_ = W + 240 * u, x = mod(h1 * span_ + t * sp, span_) - 120 * u;
      const y = H * (0.12 + 0.8 * h3) + Math.sin(t * 0.9 + i * 2.1) * 40 * u;
      const r = (20 + h2 * 16) * u;
      g.save(); g.globalAlpha = 0.9;
      if (i % 3 === 2) { g.translate(x, y); g.rotate(t * 0.6 + i); felt(g, F, i % 2 ? heart(0, 0, r * 1.7) : star(0, 0, r * 1.1, r * 0.5, 5), i % 2 ? F.acc : T.gold, { sq: 1, step: 12, sh: 8, so: 4 }); }
      else button(g, F, x, y, r, first(T.fabrics, i * 3 + 1), { rot: t * (0.7 + h1) + i, holes: i % 2 ? 2 : 4, shine: t * 0.3 + i * 0.2 });
      g.restore();
    }
  }
  function atmosphere(g, F, info) {
    const { W, H, u, t } = F;
    // Soft light drifting over the cloth, and a vignette.
    const bx = lerp(-W * 0.4, W * 1.2, mod(t / 9, 1));
    const sh = g.createLinearGradient(bx - W * 0.3, 0, bx + W * 0.3, H);
    sh.addColorStop(0, "rgba(255,248,230,0)"); sh.addColorStop(0.5, `rgba(255,248,230,${F.T.sheen})`); sh.addColorStop(1, "rgba(255,248,230,0)");
    g.fillStyle = sh; g.fillRect(0, 0, W, H);
    const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, `rgba(20,8,16,${F.T.vign})`);
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    // Loose threads and lint drifting up through the light.
    const n = Math.round(34 * F.tx);
    g.lineCap = "round";
    for (let i = 0; i < n; i++) {
      const h1 = hash(i * 7 + 1), h2 = hash(i * 7 + 2), h3 = hash(i * 7 + 3), h4 = hash(i * 7 + 4);
      const sp = (14 + h3 * 26) * u, y = H + 60 * u - mod(h2 * (H + 120 * u) + t * sp, H + 120 * u), x = h1 * W + Math.sin(t * 0.7 + i) * 34 * u;
      const a = t * (0.6 + h4) + i, len = (9 + h4 * 16) * u;
      g.strokeStyle = hexA(i % 3 ? F.T.thread : first(F.T.fabrics, i), 0.25 + h3 * 0.3); g.lineWidth = (1.4 + h3 * 1.4) * u;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * len * 0.8, y + Math.sin(a) * len * 0.8, x + Math.cos(a + 1.4) * len, y + Math.sin(a + 1.4) * len); g.stroke();
    }
  }
  // Rick-rack trim along the bottom edge, sliding slowly.
  function trim(g, F, y, color, speed) {
    const { W, u, t } = F, per = 38 * u, amp = 14 * u, off = mod(t * speed * u, per * 2);
    g.save();
    g.lineJoin = "round"; g.lineCap = "round";
    const path = () => { g.beginPath(); for (let x = -per * 2 - off, k = 0; x < W + per * 2; x += per, k++) { const yy = y + (k % 2 ? amp : -amp); if (k) g.lineTo(x, yy); else g.moveTo(x, yy); } };
    g.translate(0, 5 * u); g.strokeStyle = "rgba(0,0,0,0.3)"; g.lineWidth = 12 * u; path(); g.stroke(); g.translate(0, -5 * u);
    g.strokeStyle = color; g.lineWidth = 11 * u; path(); g.stroke();
    g.strokeStyle = hexA("#ffffff", 0.4); g.lineWidth = 3 * u; g.translate(-1 * u, -2 * u); path(); g.stroke();
    g.restore();
  }

  // ---- decor: ambient corner, bunting, falling buttons -----------------------------------------------
  const KINDS = ["flower", "button", "spool", "thimble", "heart", "button", "scissors", "star"];
  function corner(g, F, scene, enter, leave) {
    const { W, H, u, tall } = F;
    const seed = scene * 5 + 2;
    const slots = tall
      ? [[0.14, 0.945, 34], [0.5, 0.955, 42], [0.86, 0.945, 34]]
      : [[0.76, 0.1, 52], [0.9, 0.2, 40], [0.83, 0.31, 44], [0.96, 0.08, 34]];
    slots.forEach(([fx, fy, s], i) => {
      const kind = KINDS[mod(seed + i * 3, KINDS.length)];
      const q = enter === undefined ? 1 : back(span(enter, i * 0.12, i * 0.12 + 0.5));
      let x = fx * W, y = fy * H;
      if (leave > 0) { const e = leave * leave; x += e * W * 0.12; y -= e * H * 0.12; }
      item(g, F, kind, x, y, s * u * 1.45, leave > 0 ? 1 - leave : q, seed + i, { rot: kind === "scissors" ? -0.6 : 0 });
    });
  }
  function bunting(g, F, q, seed) {
    const { W, H, u, t, T } = F;
    const n = F.tall ? 6 : 10, y0 = H * 0.035, sag = H * (F.tall ? 0.03 : 0.05);
    const line = curve(-W * 0.03, y0, W * 1.03, y0, sag * 2, 40);
    thread(g, F, line, ease(q * 1.6), T.thread, 4.5 * u);
    for (let i = 0; i < n; i++) {
      const s = (i + 0.5) / n, x = lerp(-W * 0.03, W * 1.03, s), y = y0 + sag * 2 * 2 * s * (1 - s) * 0.5 * 1;
      const qi = back(span(q, 0.15 + i * 0.045, 0.15 + i * 0.045 + 0.35));
      const ps = Math.min((W / n) * 0.82, 170 * u), sw = Math.sin(t * 1.4 + i * 0.9 + seed) * 0.08;
      pop(g, x, y, qi, () => {
        g.rotate(sw);
        const col = i % 4 === 3 ? F.acc : first(T.fabrics, i * 3 + seed);
        felt(g, F, [[-ps * 0.5, 0], [ps * 0.5, 0], [ps * 0.06, ps * 1.05], [-ps * 0.06, ps * 1.05]].map(([a, b]) => [a, b]), col, { print: first(PRINTS, i * 2 + seed), ps: 18, sq: sewn(qi), step: 15, sh: 9, so: 5 });
      }, {});
    }
  }
  function waveThread(g, F, x0, y0, x1, y1, amp, color, q) {
    const { u, t } = F, pts = [];
    for (let i = 0; i <= 36; i++) { const k = i / 36; pts.push([lerp(x0, x1, k), lerp(y0, y1, k) + Math.sin(k * 9 - t * 2.6) * amp * Math.sin(k * Math.PI)]); }
    thread(g, F, pts, q, color, 5 * u);
    return pts;
  }
  function rainButtons(g, F, n, enter) {
    const { W, H, u, t, T } = F;
    for (let i = 0; i < n; i++) {
      const h1 = hash(i * 11 + 1), h2 = hash(i * 11 + 2), h3 = hash(i * 11 + 3);
      const r = (22 + h3 * 20) * u, sp = (60 + h2 * 70) * u, tt = t * sp + h1 * 3000;
      const y = mod(tt, H + 200 * u) - 100 * u, x = h1 * W + Math.sin(t * 0.9 + i) * 26 * u;
      const q = span(enter - h2 * 0.5, 0, 0.4);
      if (q <= 0) continue;
      button(g, F, x, y, r * back(q), i % 5 === 0 ? F.acc : first(T.fabrics, i * 2 + 1), { rot: t * 0.8 + i, holes: i % 2 ? 2 : 4, shine: t * 0.3 + i * 0.17 });
    }
  }
  // leave runs 0..1 as the title clears: the bunting unclips and lifts away, the thread pulls off,
  // the notions slide out to the nearest edge.
  function titleDecor(g, F, info, leave = 0) {
    const { W, H, u, t, tall } = F, local = info.local;
    const lv = smooth(leave);
    g.save(); g.translate(W * 0.5, -lv * H * 0.2); g.rotate(-lv * 0.05); g.translate(-W * 0.5, 0);
    bunting(g, F, span(local, 0, 1.3), 0);
    g.restore();
    const L = tall
      ? [["scissors", 0.2, 0.86, 96, 0.5], ["spool", 0.8, 0.86, 90], ["flower", 0.12, 0.2, 64], ["button", 0.9, 0.2, 48], ["heart", 0.88, 0.7, 44]]
      : [["scissors", 0.1, 0.86, 112, 0.5], ["spool", 0.9, 0.8, 100], ["flower", 0.06, 0.4, 78], ["button", 0.95, 0.42, 52], ["thimble", 0.17, 0.2, 52], ["heart", 0.84, 0.24, 48]];
    const sp = tall ? [0.8 * W, 0.85 * H] : [0.9 * W, 0.76 * H];
    waveThread(g, F, sp[0] - 40 * u, sp[1] + 50 * u, -W * 0.02, sp[1] + 90 * u, 40 * u, F.acc, ease(span(local, 0.2, 1.4)) * (1 - lv));
    L.forEach(([k, fx, fy, s, rot], i) => {
      const li = smooth(span(leave, i * 0.06, 0.55 + i * 0.06)), dir = fx < 0.5 ? -1 : 1;
      const q = span(local, 0.25 + i * 0.1, 0.9 + i * 0.1) * (1 - li * 0.6);
      g.save(); g.globalAlpha *= 1 - span(li, 0.6, 1);
      item(g, F, k, fx * W + dir * li * W * 0.32, fy * H - li * H * 0.06, s * u, q, i + 4, { rot: (rot || 0) + dir * li * 0.8 });
      g.restore();
    });
  }
  function closingDecor(g, F, info) {
    const { W, H, u, tall } = F, local = info.local;
    bunting(g, F, span(local, 0, 1.0), 3);
    rainButtons(g, F, tall ? 12 : 16, local + 0.1);
    const L = tall
      ? [["rosette", 0.2, 0.84, 96], ["thimble", 0.8, 0.86, 70], ["flower", 0.1, 0.22, 60]]
      : [["rosette", 0.1, 0.78, 118], ["thimble", 0.9, 0.8, 72], ["flower", 0.06, 0.34, 72], ["heart", 0.94, 0.36, 52], ["scissors", 0.18, 0.2, 64, 0.5]];
    L.forEach(([k, fx, fy, s, rot], i) => item(g, F, k, fx * W, fy * H, s * u, span(local, 0.2 + i * 0.1, 0.9 + i * 0.1), i + 9, { rot }));
  }

  // ---- scenes ------------------------------------------------------------------------------------------
  const DRAW = {};
  const nameOf = (v) => String(v ?? "");

  // Bars are stacks of quilted cloth standing on a measuring tape.
  DRAW.chart = (g, F, box, p, d, info) => {
    const { u, t, T, acc } = F;
    const n = d.values.length, max = Math.max(...d.values, 1), slot = box.w / n, bw = Math.min(slot * 0.44, 210 * u * (F.tall ? 1.2 : 1));
    const tapeH = 48 * u, baseY = box.y + box.h - 132 * u, maxH = box.h - 92 * u;
    // The tape unrolls, ticks sliding along it.
    const tq = ease(p * 2.2), tx0 = box.x - 70 * u, tw = (box.w + 140 * u) * tq;
    if (tw > 4) {
      g.save();
      felt(g, F, rr(tx0, baseY, tw, tapeH, 6 * u), T.tape, { sq: 1, run: true, inset: 7, stitch: "rgba(120,70,20,0.5)", step: 16, dash: 7, gap: 7, sh: 10, so: 6 });
      g.beginPath(); g.rect(tx0, baseY, tw, tapeH); g.clip();
      g.strokeStyle = "rgba(70,40,12,0.7)"; g.lineWidth = 2.4 * u; g.beginPath();
      const tick = 26 * u, off = mod(t * 22 * u, tick * 5);
      for (let x = tx0 - off, k = 0; x < tx0 + tw; x += tick, k++) { const major = mod(k, 5) === 0; g.moveTo(x, baseY); g.lineTo(x, baseY + (major ? 20 : 11) * u); }
      g.stroke(); g.restore();
    }
    const sorted = d.values.map((v, i) => ({ v, i }));
    sorted.forEach(({ v, i }) => {
      const cx = box.x + slot * (i + 0.5), qh = ease(span(p, i * 0.12, i * 0.12 + 0.55)), hot = i === d.highlight;
      const h = maxH * (v / max) * qh * (1 + Math.sin(t * 1.6 + i * 1.3) * 0.012), top = baseY - h;
      if (h > 6 * u) {
        const col = hot ? acc : first([T.fabrics[3], T.fabrics[2], T.fabrics[5], T.fabrics[0], T.fabrics[7]], i);
        g.save();
        felt(g, F, rr(cx - bw / 2, top, bw, h, 18 * u), col, { print: hot ? "dots" : first(["stripes", "flowers", "gingham", "argyle", "hearts"], i), ps: 24, sq: sewn(qh), step: 16 });
        g.beginPath(); tracePoly(g, rr(cx - bw / 2, top, bw, h, 18 * u)); g.clip();
        g.strokeStyle = hexA("#ffffff", 0.45); g.lineWidth = 2.6 * u; g.setLineDash([10 * u, 9 * u]); g.lineDashOffset = -t * 12 * u;
        g.beginPath(); for (let y = baseY - 54 * u; y > top + 6 * u; y -= 54 * u) { g.moveTo(cx - bw / 2, y); g.lineTo(cx + bw / 2, y); } g.stroke();
        g.restore();
        // A button sewn on top of every bar.
        if (qh > 0.3) button(g, F, cx, top + Math.min(40 * u, h * 0.4), 19 * u, shade(col, 0.5), { holes: hot ? 4 : 2, shine: t * 0.25 + i * 0.3, thread: shade(col, -0.5) });
      }
      const nq = back(span(p, i * 0.12 + 0.1, i * 0.12 + 0.55));
      if (nq > 0.01) {
        const val = window.DreamcutMotion.formatNumber(v * qh, 0, d.prefix, d.suffix);
        pop(g, cx, top - 62 * u + Math.sin(t * 2 + i) * 3 * u, nq, () => { numeral(g, F, val, 0, 0, 108 * u * (String(val).length > 5 ? 0.78 : 1), hot ? acc : T.cream, { edge: hot ? shade(acc, -0.5) : "#5b4a63" }); });
      }
      if (hot && qh > 0.8) {
        const q = back(span(p, 0.62, 0.9));
        pop(g, cx + bw * 0.52, top + 4 * u + Math.sin(t * 2.2) * 6 * u, q, () => { g.rotate(0.3 + Math.sin(t * 2.4) * 0.1); rosette(g, F, 46 * u, T.fabrics[4], t, { sq: 1 }); });
      }
      const lq = span(p, i * 0.12 + 0.25, i * 0.12 + 0.7);
      if (lq > 0) {
        const ang = Math.sin(t * 1.5 + i * 1.1) * 0.08;
        g.save(); g.translate(cx, baseY + tapeH); g.rotate(ang);
        thread(g, F, [[0, 0], [0, 26 * u]], ease(lq * 1.4), T.thread, 3.5 * u);
        tagAt(g, F, nameOf(d.labels[i]), 0, 80 * u, 50 * u, { q: back(lq), maxW: slot * 0.9, min: 42 * u, phase: t * 5 });
        g.restore();
      }
    });
    // A needle sewing along the tape the whole time, trailing its thread.
    const nx = (k) => lerp(box.x, box.x + box.w, ping(k * 0.2 + 0.3)), ny = (k) => baseY + tapeH + 20 * u + Math.sin(k * 6) * 12 * u;
    if (p > 0.5) {
      const trail = [];
      for (let k = 12; k >= 0; k--) { const tt = t - k * 0.05; trail.push([nx(tt), ny(tt)]); }
      thread(g, F, trail, 1, acc, 6 * u);
      g.save(); g.translate(nx(t), ny(t)); g.rotate(mod(t * 0.2 + 0.3, 2) < 1 ? 0.25 : Math.PI - 0.25); needle(g, F, 150 * u, t, acc); g.restore();
    }
  };

  function miniScreen(g, F, x, y, w, h, t, p) {
    const u = F.u, T = F.T;
    felt(g, F, rr(x, y, w, h, 14 * u), T.screen, { sq: sewn(p), run: true, inset: 9, stitch: shade(T.screen, -0.3), step: 15, sh: 4, so: 2, phase: t * 8 });
    const pv = { x: x + w * 0.06, y: y + h * 0.08, w: w * 0.88, h: h * 0.44 };
    felt(g, F, rr(pv.x, pv.y, pv.w, pv.h, 10 * u), T.fabrics[5], { sq: sewn(p), step: 14, sh: 5, so: 3 });
    // A sunny picture on the preview patch: sun drifting, hills of felt.
    g.save(); tracePoly(g, rr(pv.x, pv.y, pv.w, pv.h, 10 * u)); g.clip();
    const sx = pv.x + pv.w * lerp(0.2, 0.8, ping(t * 0.12));
    felt(g, F, ell(sx, pv.y + pv.h * 0.34, pv.h * 0.15, pv.h * 0.15, 20), T.gold, { sq: 1, stitch: null, sh: 5, so: 3 });
    felt(g, F, [[pv.x - 10, pv.y + pv.h], [pv.x + pv.w * 0.28, pv.y + pv.h * 0.5], [pv.x + pv.w * 0.6, pv.y + pv.h]], T.fabrics[2], { sq: 1, stitch: null, sh: 4, so: 2 });
    felt(g, F, [[pv.x + pv.w * 0.35, pv.y + pv.h], [pv.x + pv.w * 0.7, pv.y + pv.h * 0.42], [pv.x + pv.w + 10, pv.y + pv.h]], shade(T.fabrics[2], -0.2), { sq: 1, stitch: null, sh: 4, so: 2 });
    g.restore();
    const th = h * 0.1, rows = [[0.06, 0.4], [0.5, 0.26], [0.2, 0.3]];
    const tracks = [];
    for (let k = 0; k < 3; k++) {
      const ty = y + h * 0.6 + k * (th + h * 0.045);
      tracks.push(ty);
      const cs = k === 0 ? [[0.06, 0.34], [0.44, 0.24], [0.72, 0.22]] : k === 1 ? [[0.14, 0.3], [0.5, 0.36]] : [[0.06, 0.2], [0.32, 0.4], [0.76, 0.18]];
      cs.forEach(([cx, cw], j) => {
        const q = ease(span(p, 0.35 + k * 0.1 + j * 0.06, 0.7 + k * 0.1 + j * 0.06));
        if (q <= 0) return;
        const slide = Math.sin(t * 1.1 + k * 2 + j) * w * 0.006;
        felt(g, F, rr(x + w * cx + slide, ty, w * cw * q, th, 6 * u), k === 1 && j === 1 ? F.acc : first(T.fabrics, k * 3 + j * 2 + 1), { sq: 1, run: true, inset: 5, step: 12, dash: 7, gap: 6, sh: 4, so: 2, phase: t * 6 });
      });
    }
    // The playhead: a thread with a button, sliding to and fro.
    const hx = x + w * lerp(0.1, 0.9, ping(t * 0.14 + 0.2));
    g.save(); g.strokeStyle = F.acc; g.lineWidth = 3.4 * u; g.lineCap = "round"; g.beginPath(); g.moveTo(hx, pv.y + pv.h + 6 * u); g.lineTo(hx, y + h - 10 * u); g.stroke(); g.restore();
    button(g, F, hx, pv.y + pv.h + 6 * u, 13 * u, F.acc, { holes: 2, shine: t * 0.3 });
    return { pv, tracks, clip: [x + w * 0.55, tracks[1] + th / 2], low: [x + w * 0.22, tracks[2] + th / 2] };
  }
  DRAW.object = (g, F, box, p, d, info) => {
    const { u, t, T, acc } = F;
    const phone = d.kind === "phone";
    const dw = phone ? Math.min(box.w * 0.34, box.h * 0.5) : Math.min(box.w * 0.6, box.h * 1.25), dh = phone ? dw * 1.95 : dw * 0.62;
    const dx = box.x + (phone ? box.w * 0.34 - dw / 2 : box.w * 0.02), dy = box.y + (box.h - dh - (phone ? 0 : dh * 0.14)) / 2;
    const bq = back(span(p, 0, 0.4));
    let anchors;
    pop(g, dx + dw / 2, dy + dh / 2, bq, () => {
      g.translate(-(dx + dw / 2), -(dy + dh / 2));
      g.translate(dx + dw / 2, dy + dh / 2); g.rotate(Math.sin(t * 0.9) * 0.012); g.translate(-(dx + dw / 2), -(dy + dh / 2));
      g.translate(0, Math.sin(t * 1.2) * 9 * u);
      const sq = sewn(bq);
      if (!phone) {
        felt(g, F, rr(dx - dw * 0.055, dy + dh - 8 * u, dw * 1.11, dh * 0.1, 16 * u), T.fabrics[6], { sq, step: 16, run: true, inset: 7, print: "cord", sh: 14, so: 8 });
        felt(g, F, rr(dx + dw * 0.42, dy + dh + 6 * u, dw * 0.16, dh * 0.035, 8 * u), shade(T.fabrics[6], 0.35), { sq: 1, stitch: null, sh: 2, so: 1 });
      }
      felt(g, F, rr(dx, dy, dw, dh, (phone ? 44 : 24) * u), T.fabrics[3], { print: "twill", ps: 22, sq, step: 17, sh: 20, so: 12 });
      const pad = (phone ? 22 : 28) * u;
      anchors = miniScreen(g, F, dx + pad, dy + pad, dw - pad * 2, dh - pad * 2 - (phone ? 10 * u : 0), t, bq);
      if (phone) button(g, F, dx + dw / 2, dy + dh - 20 * u, 11 * u, T.cream, { holes: 2 });
      // A needle working its way round the casing all through the hold, its fresh stitches trailing.
      if (bq > 0.9) {
        const edge = closed(rr(dx + 12 * u, dy + 12 * u, dw - 24 * u, dh - 24 * u, (phone ? 34 : 16) * u, 8));
        const k0 = mod(t * 0.09, 1), trail = [];
        for (let k = 0; k <= 24; k++) { const pt = pointAt(edge, mod(k0 - (24 - k) * 0.006, 1)); trail.push([pt.x, pt.y]); }
        g.save(); g.lineCap = "round"; g.setLineDash([12 * u, 9 * u]); g.lineDashOffset = t * 60 * u; g.strokeStyle = acc; g.lineWidth = 4.5 * u;
        g.beginPath(); trail.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); g.restore();
        const np = pointAt(edge, k0), dip = Math.sin(t * 9) * 10 * u;
        g.save(); g.translate(np.x, np.y - 18 * u + dip); g.rotate(np.a - 0.5); needle(g, F, 120 * u, t, acc); g.restore();
      }
    });
    // Hang-tags tied to the device with thread.
    const lx = box.x + box.w * (phone ? 0.62 : 0.62), ys = [0.2, 0.5, 0.8];
    const pts = anchors ? [anchors.pv ? [anchors.pv.x + anchors.pv.w * 0.72, anchors.pv.y + anchors.pv.h * 0.32] : [0, 0], anchors.clip, anchors.low] : [];
    d.callouts.forEach((label, i) => {
      const c = ease(span(p, 0.38 + i * 0.14, 0.8 + i * 0.14));
      if (c <= 0 || !label || !pts[i]) return;
      const [ax, ay] = pts[i], ly = box.y + box.h * ys[i], bobY = Math.sin(t * 1.2) * 5 * u;
      const line = curve(ax, ay + bobY, lx, ly, (i === 1 ? 26 : -34) * u, 30);
      thread(g, F, line, c, acc, 4.5 * u);
      button(g, F, ax, ay + bobY, 12 * u, T.cream, { holes: 2, shine: t * 0.3 + i * 0.3, thread: acc });
      if (c > 0.82) {
        const q = back(span(c, 0.82, 1)), swing = Math.sin(t * 1.7 + i * 1.4) * 0.08;
        tagAt(g, F, label, lx, ly, 54 * u, { anchor: "hole", q, angle: swing, maxW: box.w * (phone ? 0.36 : 0.38), min: 44 * u, phase: t * 5 });
      }
    });
  };

  // Felt dolls with button eyes.
  function doll(g, F, cx, base, s, i, color, hot, q, t) {
    const u = F.u, T = F.T, skin = first(["#f3cfae", "#c98f62", "#8d5a3b", "#f7dbc8", "#b07a52", "#e5b78e"], i * 2 + 1);
    const hair = first([T.fabrics[9], "#5b3a2e", T.fabrics[6], "#2f2630", "#d9a441", T.fabrics[3]], i), sway = Math.sin(t * 1.7 + i * 1.3) * 0.03;
    const hop = hot ? -Math.abs(Math.sin(t * 3)) * s * 0.05 : 0;
    // The shadow on the ground.
    g.save(); g.fillStyle = "rgba(20,8,16,0.25)"; g.beginPath(); g.ellipse(cx, base + 4 * u, s * 0.36 * (1 + hop / s), s * 0.06, 0, 0, TAU); g.fill(); g.restore();
    pop(g, cx, base, q, () => {
      g.translate(0, hop); g.rotate(sway);
      const sq = sewn(q);
      const body = i % 3, bw = s * 0.6;
      for (const sg of [-1, 1]) felt(g, F, rr(sg * s * 0.12 - s * 0.055, -s * 0.18, s * 0.11, s * 0.18, s * 0.05), shade(color, -0.35), { sq: 1, stitch: null, sh: 6, so: 3 });
      if (body === 0) felt(g, F, [[-bw * 0.28, -s * 0.62], [bw * 0.28, -s * 0.62], [bw * 0.5, -s * 0.08], [-bw * 0.5, -s * 0.08]].flatMap((pt, k, arr) => { const nx = arr[(k + 1) % 4]; return [pt, [(pt[0] * 2 + nx[0]) / 3, (pt[1] * 2 + nx[1]) / 3], [(pt[0] + nx[0] * 2) / 3, (pt[1] + nx[1] * 2) / 3]]; }), color, { print: hot ? "dots" : "gingham", ps: 20, sq, step: 15 });
      else if (body === 1) felt(g, F, rr(-bw * 0.4, -s * 0.66, bw * 0.8, s * 0.6, s * 0.26), color, { print: hot ? "dots" : "stripes", ps: 20, sq, step: 15 });
      else { felt(g, F, rr(-bw * 0.42, -s * 0.64, bw * 0.84, s * 0.58, s * 0.12), color, { print: hot ? "dots" : "flowers", ps: 20, sq, step: 15 }); felt(g, F, rr(-bw * 0.24, -s * 0.5, bw * 0.48, s * 0.34, s * 0.06), shade(color, 0.28), { sq, run: true, inset: 6, step: 13, sh: 4, so: 2 }); }
      // Arms: two felt pieces each, sewn at the shoulder and the elbow with buttons. The shoulder sits
      // inside the torso edge so the arm grows out of the body; the highlighted figure waves.
      const armCol = shade(color, -0.28), joint = shade(color, 0.5);
      for (const sg of [-1, 1]) {
        const wave = hot && sg > 0, shx = sg * bw * (body === 0 ? 0.3 : 0.36), shy = -s * 0.55;
        const a1 = wave ? -sg * 2.45 + Math.sin(t * 2.2) * 0.12 : -sg * (0.62 + Math.sin(t * 1.9 + i + sg) * 0.12);
        const a2 = wave ? -sg * (0.5 + Math.sin(t * 7) * 0.45) : -sg * (0.12 + Math.sin(t * 2.3 + i) * 0.1);
        g.save(); g.translate(shx, shy); g.rotate(a1);
        felt(g, F, rr(-s * 0.06, -s * 0.05, s * 0.12, s * 0.24, s * 0.06), armCol, { sq: 1, step: 10, run: true, inset: 4, dash: 4, gap: 4, stitch: shade(armCol, 0.5), sh: 6, so: 3 });
        g.translate(0, s * 0.17); g.rotate(a2);
        felt(g, F, rr(-s * 0.055, -s * 0.03, s * 0.11, s * 0.2, s * 0.055), armCol, { sq: 1, step: 10, run: true, inset: 4, dash: 4, gap: 4, stitch: shade(armCol, 0.5), sh: 6, so: 3 });
        felt(g, F, ell(0, s * 0.2, s * 0.055, s * 0.055, 18), skin, { sq: 1, stitch: null, sh: 4, so: 2 });
        button(g, F, 0, 0, s * 0.032, joint, { holes: 2, thread: shade(color, -0.5) });
        g.restore();
        button(g, F, shx, shy, s * 0.045, joint, { holes: 4, thread: shade(color, -0.5), shine: t * 0.3 + i * 0.2 + sg });
      }
      // Head.
      if (i % 6 === 1) for (const sg of [-1, 1]) felt(g, F, ell(sg * s * 0.25, -s * 0.8, s * 0.1, s * 0.1, 18), hair, { sq: 1, stitch: null, sh: 5, so: 3 });
      if (i % 6 === 0) felt(g, F, ell(0, -s * 1.05, s * 0.11, s * 0.11, 18), hair, { sq: 1, stitch: null, sh: 5, so: 3 });
      felt(g, F, ell(0, -s * 0.8, s * 0.22, s * 0.21, 36), skin, { sq, step: 14, sh: 8, so: 4, stitch: shade(skin, -0.4) });
      if (i % 6 === 2) { felt(g, F, rr(-s * 0.24, -s * 1.0, s * 0.48, s * 0.2, s * 0.1), T.fabrics[0], { sq: 1, step: 12, print: "stripes", ps: 14, sh: 6, so: 3 }); button(g, F, 0, -s * 1.04, s * 0.07, T.cream, { holes: 2 }); }
      if (i % 6 === 3) for (let k = -2; k <= 2; k++) felt(g, F, [[k * s * 0.07 - s * 0.05, -s * 0.97], [k * s * 0.07, -s * (1.12 - Math.abs(k) * 0.03)], [k * s * 0.07 + s * 0.05, -s * 0.97]], hair, { sq: 1, stitch: null, sh: 4, so: 2 });
      if (i % 6 === 4) { for (const sg of [-1, 1]) felt(g, F, [[sg * s * 0.18, -s * 0.97], [sg * s * 0.38, -s * 1.06], [sg * s * 0.36, -s * 0.9]], F.acc, { sq: 1, step: 10, stitch: null, sh: 4, so: 2 }); button(g, F, sg0(i) * s * 0.18, -s * 0.97, s * 0.05, T.gold, {}); }
      if (i % 6 === 5) for (let k = 0; k < 6; k++) felt(g, F, ell(Math.cos(k * 1.05 - 1.6) * s * 0.2, -s * 0.8 + Math.sin(k * 1.05 - 1.6) * s * 0.2, s * 0.07, s * 0.07, 14), hair, { sq: 1, stitch: null, sh: 4, so: 2 });
      // Face: button eyes that blink now and then, cheeks, a stitched smile.
      const blink = mod(t + i * 0.9, 3.4) < 0.14 ? 0.12 : 1;
      g.save();
      for (const sg of [-1, 1]) {
        g.fillStyle = "rgba(255,120,120,0.45)"; g.beginPath(); g.arc(sg * s * 0.125, -s * 0.74, s * 0.04, 0, TAU); g.fill();
        g.save(); g.translate(sg * s * 0.078, -s * 0.8); g.scale(1, blink); g.fillStyle = "#2a2028"; g.beginPath(); g.arc(0, 0, s * 0.032, 0, TAU); g.fill(); g.fillStyle = "#fff"; g.beginPath(); g.arc(-s * 0.01, -s * 0.011, s * 0.01, 0, TAU); g.fill(); g.restore();
      }
      g.strokeStyle = "#4a2c2a"; g.lineWidth = Math.max(2, s * 0.014); g.lineCap = "round"; g.beginPath(); g.arc(0, -s * 0.775, s * 0.06, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
      g.restore();
      if (hot) { g.save(); g.translate(-bw * 0.2, -s * 0.34); rosette(g, F, s * 0.1, T.fabrics[4], t + i, { sq: 1 }); g.restore(); }
    });
  }
  const sg0 = (i) => (i % 2 ? 1 : -1);
  DRAW.people = (g, F, box, p, d, info) => {
    const { u, t, T, acc } = F;
    const n = Math.max(2, Math.min(6, Math.round(d.count))), slot = box.w / n, s = Math.min(box.h * 0.6, slot * 1.15), base = box.y + box.h * 0.88;
    // A table-runner for them to stand on.
    const rq = ease(p * 2);
    if (rq > 0.02) {
      felt(g, F, rr(box.x - 40 * u, base + 2 * u, (box.w + 80 * u) * rq, 44 * u, 10 * u), T.fabrics[7], { print: "zig", ps: 20, sq: 1, run: true, inset: 8, step: 16, sh: 12, so: 6, phase: t * 8 });
    }
    for (let i = 0; i < n; i++) {
      const q = span(p, i * 0.12, i * 0.12 + 0.55), cx = box.x + slot * (i + 0.5), hot = i === Math.min(n - 1, d.highlight);
      if (q > 0) {
        const body = hot ? acc : first([T.fabrics[3], T.fabrics[1], T.fabrics[6], T.fabrics[2], T.fabrics[5], T.fabrics[0]], i);
        doll(g, F, cx, base, s, i, body, hot, q, t);
      }
      const label = i < d.badges.length ? d.badges[i] : "";
      const tq = back(span(p, i * 0.12 + 0.35, i * 0.12 + 0.8));
      if (tq > 0.01 && label) {
        const ty = base - s * 1.18 - 54 * u + Math.sin(t * 2 + i) * 4 * u;
        const ang = Math.sin(t * 1.6 + i * 1.5) * 0.08;
        g.save(); g.translate(cx, ty - 40 * u); g.rotate(ang);
        thread(g, F, [[0, 0], [0, 26 * u]], 1, T.thread, 3.5 * u);
        tagAt(g, F, label, 0, 56 * u, 48 * u, { q: tq, maxW: slot * 0.94, min: 34 * u, color: hot ? shade(acc, 0.82) : T.cream, phase: t * 5 });
        g.restore();
        g.save(); g.fillStyle = hot ? acc : T.metal; g.beginPath(); g.arc(cx, ty - 40 * u, 7 * u, 0, TAU); g.fill(); g.restore();
      }
    }
  };

  // A winding thread links felt blocks; a needle keeps travelling it.
  function icon(g, F, kind, s, t, col) {
    const T = F.T;
    if (kind === "spool") { spool(g, F, s * 0.72, col, t, { sq: 1 }); }
    else if (kind === "scissors") { g.translate(0, s * 0.12); scissors(g, F, s * 0.55, F.acc, t); }
    else if (kind === "needle") { g.save(); g.rotate(-0.7); needle(g, F, s * 1.1, t, F.acc); g.restore(); const loop = []; for (let i = 0; i <= 20; i++) { const k = i / 20; loop.push([-s * 0.35 - k * s * 0.3, -s * 0.2 + Math.sin(k * 7 + t * 3) * s * 0.07 + k * s * 0.4]); } thread(g, F, loop, 1, F.acc, 4.5 * F.u); }
    else { rosette(g, F, s * 0.4, T.fabrics[4], t, { sq: 1 }); g.save(); g.strokeStyle = "#fff"; g.lineWidth = 7 * F.u; g.lineCap = "round"; g.lineJoin = "round"; g.beginPath(); g.moveTo(-s * 0.14, 0); g.lineTo(-s * 0.03, s * 0.1); g.lineTo(s * 0.16, -s * 0.12); g.stroke(); g.restore(); }
  }
  DRAW.process = (g, F, box, p, d, info) => {
    const { u, t, T, acc } = F;
    const n = d.steps.length, vertical = box.h > box.w;
    const slot = vertical ? box.h / n : box.w / n;
    const r = vertical ? Math.min(slot * 0.36, box.w * 0.26) : Math.min(slot * 0.34, box.h * 0.31);
    const nodes = d.steps.map((label, i) => {
      const cx = vertical ? box.x + box.w * (i % 2 ? 0.66 : 0.34) : box.x + slot * (i + 0.5);
      const cy = vertical ? box.y + slot * (i + 0.5) - 18 * u : box.y + box.h * 0.42 + Math.sin(i * 1.6) * box.h * 0.06;
      return { cx, cy, label };
    });
    // The thread path first, so blocks sit on top of it.
    let path = [];
    for (let i = 0; i < n - 1; i++) {
      const a = nodes[i], b = nodes[i + 1];
      const seg = vertical ? curve(a.cx, a.cy + r, b.cx, b.cy - r, 0, 24).map(([x, y], k, arr) => [x + Math.sin((k / (arr.length - 1)) * Math.PI) * (b.cx > a.cx ? -1 : 1) * 0 + Math.sin((k / 24) * TAU) * 40 * u * (b.cx > a.cx ? 1 : -1), y]) : curve(a.cx + r, a.cy, b.cx - r, b.cy, (i % 2 ? 1 : -1) * 70 * u, 24);
      const lq = ease(span(p, 0.18 + i * 0.22, 0.55 + i * 0.22));
      runStitch(g, F, seg, lq, "rgba(0,0,0,0.25)", 6 * u, 16 * u, 12 * u, -t * 30 * u + 2 * u);
      runStitch(g, F, seg, lq, acc, 5 * u, 16 * u, 12 * u, -t * 30 * u);
      if (lq >= 1) { const e = seg[seg.length - 1], a2 = pointAt(seg, 0.97); g.save(); g.translate(e[0], e[1]); g.rotate(a2.a); felt(g, F, [[0, 0], [-26 * u, -16 * u], [-26 * u, 16 * u]], acc, { sq: 1, stitch: null, sh: 4, so: 3 }); g.restore(); }
      path = path.concat(seg);
    }
    nodes.forEach((nd, i) => {
      const q = back(span(p, i * 0.22, i * 0.22 + 0.5)), last = i === n - 1;
      const col = last ? acc : first([T.fabrics[3], T.fabrics[1], T.fabrics[6]], i);
      pop(g, nd.cx, nd.cy, q, () => {
        g.rotate(Math.sin(t * 1.3 + i) * 0.03);
        felt(g, F, scallop(0, 0, r, 14, 0.07, i * 0.3), col, { print: first(["gingham", "dots", "flowers"], i), ps: 22, sq: sewn(q), step: 15, sh: 18, so: 10 });
        felt(g, F, ell(0, 0, r * 0.74, r * 0.74, 40), T.cream, { sq: sewn(q), run: true, inset: 8, step: 15, stitch: shade(col, -0.2), sh: 6, so: 3, phase: t * 8 });
        g.save(); g.translate(0, -r * 0.02 + Math.sin(t * 2 + i) * 4 * u); icon(g, F, ["spool", "scissors", "needle", "check"][last ? 3 : i % 3], r * 1.05, t, first(T.fabrics, i * 2)); g.restore();
        // Step number on a little felt badge.
        g.save(); g.translate(-r * 0.74, -r * 0.74);
        felt(g, F, ell(0, 0, 36 * u, 36 * u, 28), T.fabrics[4], { sq: 1, step: 13, sh: 7, so: 4 });
        g.font = `bold ${44 * u}px ${FONT}`; g.fillStyle = T.tagInk; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(i + 1), 0, 2 * u);
        g.restore();
      });
      const lq = back(span(p, i * 0.22 + 0.25, i * 0.22 + 0.7));
      if (lq > 0.01 && nd.label) {
        const swing = Math.sin(t * 1.5 + i * 1.2) * 0.07, ty = nd.cy + r + 60 * u;
        g.save(); g.translate(nd.cx, nd.cy + r * 0.86); g.rotate(swing);
        tagAt(g, F, nd.label, 0, ty - (nd.cy + r * 0.86), 52 * u, { q: lq, maxW: vertical ? box.w * 0.62 : slot * 0.96, min: 42 * u, color: last ? shade(acc, 0.82) : T.cream, phase: t * 5 });
        g.restore();
      }
    });
    if (p > 0.6 && path.length > 3) {
      const k = ping(t * 0.22), pt = pointAt(path, k), dir = mod(t * 0.22, 2) < 1 ? 0 : Math.PI;
      g.save(); g.translate(pt.x, pt.y - 14 * u); g.rotate(pt.a + dir); needle(g, F, 96 * u, t, acc); g.restore();
    }
  };

  function tangle(g, F, cx, cy, s) {
    const { t, u } = F;
    for (const k of [0, 1]) {
      const pts = [];
      for (let i = 0; i <= 80; i++) { const a = i * 0.34 + k * 1.2, rad = s * (0.25 + 0.75 * (i / 80)), wob = 1 + 0.18 * Math.sin(a * 2.1 + t * 2.2 + k); pts.push([cx + Math.cos(a) * rad * wob * 1.1, cy + Math.sin(a * 1.31 + k) * rad * wob * 0.9]); }
      thread(g, F, pts, 1, k ? F.T.fabrics[0] : F.T.thread, 4.2 * u);
    }
  }
  function bow(g, F, cx, cy, s, color) {
    const { t, u } = F;
    g.save(); g.translate(cx, cy);
    for (const sg of [-1, 1]) {
      g.save(); g.rotate(sg * (0.55 + Math.sin(t * 3 + sg) * 0.05)); felt(g, F, [[-s * 0.1, 0], [s * 0.1, 0], [s * 0.18, s * 1.1], [0, s * 0.88], [-s * 0.18, s * 1.1]], shade(color, -0.1), { sq: 1, run: true, inset: 6, step: 13, sh: 6, so: 3 }); g.restore();
    }
    for (const sg of [-1, 1]) { g.save(); g.translate(sg * s * 0.42, -s * 0.05); g.rotate(sg * 0.2 + Math.sin(t * 2.3 + sg) * 0.06); felt(g, F, ell(0, 0, s * 0.42, s * 0.26, 24), color, { sq: 1, run: true, inset: 7, step: 13, sh: 6, so: 3 }); g.restore(); }
    felt(g, F, rr(-s * 0.14, -s * 0.2, s * 0.28, s * 0.32, s * 0.08), shade(color, 0.15), { sq: 1, step: 11, sh: 5, so: 3 });
    g.restore();
  }
  DRAW.compare = (g, F, box, p, d, info) => {
    const { u, t, T, acc } = F;
    const vertical = box.h > box.w * 1.1, gap = 46 * u;
    const cw = vertical ? box.w : (box.w - gap) / 2, ch = vertical ? (box.h - gap) / 2 : box.h * 0.84;
    const mx = Math.max(d.leftValue, d.rightValue, 1);
    [[d.left, d.leftValue, T.fabrics[3], "gingham"], [d.right, d.rightValue, acc, "dots"]].forEach(([label, value, color, pr], i) => {
      const q = span(p, i * 0.22, i * 0.22 + 0.55), bq = back(q);
      if (q <= 0) return;
      const x = vertical ? box.x : box.x + i * (cw + gap), y = vertical ? box.y + i * (ch + gap) : box.y + (box.h - ch) / 2;
      pop(g, x + cw / 2, y + ch / 2, bq, () => {
        g.rotate(Math.sin(t * 1.1 + i * 2) * 0.012);
        g.translate(-(x + cw / 2), -(y + ch / 2) + Math.sin(t * 1.2 + i * 2) * 9 * u);
        felt(g, F, rr(x, y, cw, ch, 36 * u), color, { print: pr, ps: 26, sq: sewn(q), step: 17, sh: 22, so: 12 });
        runStitch(g, F, closed(rr(x + 22 * u, y + 22 * u, cw - 44 * u, ch - 44 * u, 24 * u)), sewn(q), shade(color, 0.6), 4 * u, 14 * u, 11 * u, t * 8);
        felt(g, F, ell(x + cw / 2, y + ch * 0.5, Math.min(cw * 0.36, 300 * u), Math.min(ch * 0.27, 150 * u), 48), T.cream, { sq: sewn(q), run: true, inset: 9, stitch: shade(color, -0.1), step: 15, sh: 10, so: 5, phase: t * 8 });
        if (i === 0) tangle(g, F, x + cw - 120 * u, y + 135 * u, 84 * u); else bow(g, F, x + cw - 120 * u, y + 125 * u, 96 * u, T.cream);
        g.save(); g.translate(x + cw * 0.1, y + ch * 0.3 + Math.sin(t * 1.8 + i) * 4 * u); g.rotate(Math.sin(t * 1.3 + i) * 0.1); flower(g, F, 46 * u, i ? T.fabrics[4] : T.fabrics[7], { center: T.gold, shine: t * 0.3 + i }); g.restore();
        g.save(); g.translate(x + cw * 0.9, y + ch * 0.66 + Math.sin(t * 1.6 + i) * 4 * u); g.rotate(Math.sin(t * 1.1 + i) * 0.12); felt(g, F, i ? heart(0, 0, 80 * u) : star(0, 0, 44 * u, 21 * u, 5), i ? T.fabrics[8] : T.gold, { sq: 1, step: 13, sh: 8, so: 4 }); g.restore();
        const vq = ease(span(p, 0.3 + i * 0.22, 0.85 + i * 0.22)), val = window.DreamcutMotion.formatNumber(value * vq, 0, d.prefix, d.suffix);
        numeral(g, F, val, x + cw / 2, y + ch * 0.5, Math.min(168 * u, ch * 0.36), i ? acc : "#34506f", { edge: i ? shade(acc, -0.5) : "#1a2a3e", stitch: T.cream });
        const my = y + ch - 76 * u, mw = cw - 96 * u, mh = 32 * u, mxl = x + 48 * u;
        felt(g, F, rr(mxl, my, mw, mh, mh / 2), shade(T.cream, -0.1), { sq: 1, stitch: null, sh: 4, so: 2 });
        const fw = Math.max(mh, mw * clamp(value / mx) * vq);
        g.save(); tracePoly(g, rr(mxl, my, fw, mh, mh / 2));
        felt(g, F, rr(mxl, my, fw, mh, mh / 2), i ? acc : T.fabrics[3], { sq: 1, run: true, inset: 7, step: 12, dash: 8, gap: 6, sh: 5, so: 3, phase: t * 10, print: "stripes", ps: 12 });
        g.restore();
        g.save(); tracePoly(g, rr(mxl, my, fw, mh, mh / 2)); g.clip(); const sx = mxl + fw * mod(t * 0.35 + i * 0.4, 1.6) - fw * 0.3; const sh = g.createLinearGradient(sx - 40 * u, 0, sx + 40 * u, 0); sh.addColorStop(0, "rgba(255,255,255,0)"); sh.addColorStop(0.5, "rgba(255,255,255,0.5)"); sh.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = sh; g.fillRect(mxl, my, fw, mh); g.restore();
        if (i === 1 && q > 0.95) {
          const edge = closed(rr(x + 22 * u, y + 22 * u, cw - 44 * u, ch - 44 * u, 24 * u, 8));
          const k0 = mod(t * 0.11, 1), trail = [];
          for (let k = 0; k <= 30; k++) { const pt = pointAt(edge, mod(k0 - (30 - k) * 0.007, 1)); trail.push([pt.x, pt.y]); }
          thread(g, F, trail, 1, T.cream, 6 * u);
          const np = pointAt(edge, k0), dip = Math.sin(t * 9) * 10 * u;
          g.save(); g.translate(np.x, np.y - 16 * u + dip); g.rotate(np.a - 0.5); needle(g, F, 130 * u, t, T.cream); g.restore();
        }
        tagAt(g, F, nameOf(label), x + cw / 2, y + 2 * u, 54 * u, { q: back(span(q, 0.3, 0.9)), maxW: cw * 0.7, min: 44 * u, angle: Math.sin(t * 1.4 + i) * 0.05, phase: t * 5 });
      });
    });
  };

  // ---- wiring ---------------------------------------------------------------------------------------
  // The stage runs first every frame and records which scene follows, so a drawing knows whether
  // to clear itself before the change (the last scene of a film keeps its art to the end).
  let curNext = null;
  const prevTitle = (info) => {
    if ((info.index || 0) !== 1) return false;
    const c = (window.__dreamcut && window.__dreamcut.controls) || {}, th = c.title_hold === undefined ? 2.4 : Number(c.title_hold);
    return th > 0 && Math.abs((info.t - info.local) - th) < 0.02;
  };
  const scene = (id) => (ctx, S, box, p, d, info) => {
    const F = frameOf(ctx, S, info), g = ctx;
    const change = Math.max(0.1, info.change || 0.45);
    // ex runs 0..1 from the last `change` seconds of this scene to the first `change` of the next.
    let ex = 0;
    if (info.exit !== undefined) ex = 0.5 + 0.5 * info.exit;
    else if (curNext && info.local > info.hold - change) ex = 0.5 * clamp((info.local - (info.hold - change)) / change);
    g.save();
    if (ex > 0) {
      // Cleared off to the left like a finished block lifted from the frame; gone soon after the change.
      const e = smooth(clamp(ex / 0.62)), cx = box.x + box.w / 2, cy = box.y + box.h / 2;
      if (e >= 1) { g.restore(); return; }
      g.globalAlpha *= 1 - e;
      g.translate(cx - e * F.W * 0.6, cy + e * F.H * 0.06); g.rotate(-0.1 * e); g.scale(1 - 0.25 * e, 1 - 0.25 * e); g.translate(-cx, -cy);
    }
    DRAW[id](g, F, box, p, d, info);
    g.restore();
  };

  const TONE = {
    fabrics: ["#e07a5f", "#f2cc8f", "#81b29a", "#3d5a80", "#f4acb7", "#9fb8d0", "#6d597a", "#b5c99a", "#f6ede0", "#c8553d"],
    cream: "#fbf1dc", tagInk: "#3a2e4d", thread: "#fff6e3", screen: "#f4ead3", wood: "#d9b88a", metal: "#c9ced6", gold: "#f2c94c", tape: "#f4c542",
    paper: "#efe3cf", vign: 0.32, sheen: 0.09,
  };
  const dim = (list, k) => list.map((c) => shade(c, k));
  return {
    bg: "#efe3cf", panel: "#fbf1dc", ink: "#3a2e4d", muted: "#7a6a86", accent: "#e8505b", onAccent: "#ffffff",
    rule: "rgba(58,46,77,0.5)", track: "rgba(58,46,77,0.12)",
    display: FONT, displayWeight: 700, displayTracking: "0.01em", body: FONT, bodyWeight: 700, figures: FONT, radius: 24,
    motion: "wipe", change: "fade",
    kit: { line: 3, fill: "solid", panel: "fill" },
    tone: TONE,
    keepArt: true, overlap: true,
    palettes: {
      light: { bg: "#f6efe3", accent: "#d9485a", tone: { ...TONE, fabrics: dim(TONE.fabrics, 0.22), paper: "#f6efe3", vign: 0.16, sheen: 0.12 } },
      dark: { bg: "#241a2e", panel: "#d8cbb2", ink: "#2b2236", accent: "#ff7a8a", tone: { ...TONE, fabrics: dim(TONE.fabrics, -0.5), cream: "#e6d9bd", tagInk: "#2a2236", thread: "#f1e3c4", screen: "#dfd2b6", paper: "#241a2e", vign: 0.5, sheen: 0.05 } },
      mono: { bg: "#e5e2da", panel: "#f4f1ea", ink: "#2d2b2b", muted: "#6e6a66", accent: "#35333a", onAccent: "#f4f1ea", tone: { ...TONE, fabrics: ["#d9d6d0", "#a8a59f", "#7a7873", "#c4c1ba", "#8e8b86", "#ebe8e1", "#5f5d59", "#b5b2aa", "#f0ede6", "#6c6a66"], cream: "#f4f1ea", tagInk: "#2d2b2b", thread: "#faf8f2", screen: "#eeebe3", wood: "#cfc9bd", metal: "#c8c8c8", gold: "#c4c0b6", tape: "#d6d2c8", paper: "#e5e2da", vign: 0.3, sheen: 0.08 } },
    },
    backdrop: (accent, texture, look) => look.tone.paper,
    paint: (ctx, W, H) => { ctx.clearRect(0, 0, W, H); },
    css(accent, look) {
      const root = document.getElementById("root"), W = Number(root.dataset.width) || 1920, H = Number(root.dataset.height) || 1080, u = Math.min(W, H) / 1080;
      const T = look.tone, tag = `${T.cream}`;
      const label = `align-self:flex-start; width:fit-content !important; max-width:100%; padding:0.2em 0.55em 0.26em; color:${T.tagInk}; background:${tag}; border-radius:0.28em; rotate:-1deg; box-shadow:0 ${10 * u}px ${26 * u}px rgba(30,12,20,0.34), inset 0 ${2 * u}px 0 rgba(255,255,255,0.5); outline:${Math.max(2, 3.5 * u)}px dashed ${accent}; outline-offset:-0.2em; text-shadow:0 ${1.5 * u}px 0 rgba(255,255,255,0.55); font-weight:700; letter-spacing:0.01em;`;
      return `
        #chart-title, #object-title, #people-title, #process-title, #compare-title { ${label} }
        #title, #closing { ${label} align-self:center; text-align:center; padding:0.28em 0.7em 0.34em; border-radius:0.4em; rotate:-1.2deg; max-width:78%; text-wrap:balance; }
        #chart-title, #object-title, #people-title, #process-title, #compare-title { text-wrap:balance; }
        #closing { rotate:1deg; }
        .kicker { align-self:center; width:fit-content; padding:0.2em 0.9em; background:${accent}; color:${look.onAccent}; border-radius:999px; font-size:${44 * u}px !important; text-shadow:none; outline:${Math.max(2, 3 * u)}px dashed ${T.cream}; outline-offset:-0.22em; box-shadow:0 ${8 * u}px ${18 * u}px rgba(30,12,20,0.3); letter-spacing:0.08em; rotate:1.2deg; }
      `;
    },
    stage(ctx, S, info) {
      const F = frameOf(ctx, S, info), g = ctx;
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.setLineDash([]); g.shadowColor = "transparent";
      curNext = info.next || null;
      if (S.paint) { quilt(g, F, info); driftBits(g, F); atmosphere(g, F, info); trim(g, F, F.H - 26 * F.u, F.acc, 16); }
      const idx = info.index || 0, local = info.local || 0, change = Math.max(0.1, info.change || 0.45);
      const tr = changeAt(info);
      if (info.scene === "title") titleDecor(g, F, info, info.next && tr >= 0 ? tr : 0);
      else if (idx > 0 && local < change && prevTitle(info)) titleDecor(g, F, { ...info, local: 9 }, tr);
      if (info.scene === "closing") closingDecor(g, F, info);
      else if (info.scene) {
        if (idx > 0 && local < change) corner(g, F, idx - 1, undefined, clamp(local / change));
        corner(g, F, idx, idx > 0 ? span(local, 0.1, 0.8) : span(local, 0, 0.8), 0);
      }
      g.restore();
    },
    scenes: { chart: scene("chart"), object: scene("object"), people: scene("people"), process: scene("process"), compare: scene("compare") },
  };
});
