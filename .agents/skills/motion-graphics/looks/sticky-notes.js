// Sticky Notes: a pinned cork board. Every idea is a paper note stuck to the wall: pads of notes stack into
// bars, name tags hang off a plank, steps are big notes joined by marker arrows and red yarn. The camera
// pans across one huge board, so each scene sits on a fresh patch of cork crowded with other notes, index
// cards, photos, tape and pins that flutter in a slow breeze while a desk lamp sweeps the wall.
// All art is original; frames are pure functions of time (seeded noise only).
window.DreamcutMotion.register("sticky-notes", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const ei = (v) => Math.pow(clamp(v), 2);
  const eio = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const fract = (v) => v - Math.floor(v);
  const hs = (a, b = 0) => fract(Math.sin(a * 127.1 + b * 311.7 + 7.31) * 43758.5453);
  const HAND = "'Marker Felt', 'Chalkboard SE', 'Noteworthy', 'Segoe Print', 'Comic Sans MS', cursive";
  const PAN = 0.92;
  const HEADS = { title: ["kicker", "title"], chart: ["chart-title"], object: ["object-title"], people: ["people-title"], process: ["process-title"], compare: ["compare-title"], closing: ["closing"] };
  const HEAD_COLOR = { title: 0, chart: 2, object: 1, people: 3, process: 4, compare: 5, closing: 0 };

  // ---- colour -------------------------------------------------------------------------------------
  function rgb(c) {
    const s = String(c || "#000");
    if (s[0] === "#") { let h = s.slice(1); if (h.length === 3) h = h.split("").map((x) => x + x).join(""); const n = parseInt(h.slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    const m = s.match(/[\d.]+/g) || [0, 0, 0];
    return [+m[0], +m[1], +m[2]];
  }
  const toHex = (c) => "#" + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
  const mixc = (a, b, t) => { const A = rgb(a), B = rgb(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
  const rgba = (c, a) => { const [r, g, b] = rgb(c); return `rgba(${r},${g},${b},${a})`; };
  const lite = (c, t) => mixc(c, "#ffffff", t);
  const dark = (c, t) => mixc(c, "#000000", t);

  let FR = { index: 0 };

  // ---- textures -----------------------------------------------------------------------------------
  let GRAIN = null;
  function grainTile() {
    if (GRAIN) return GRAIN;
    const c = document.createElement("canvas"); c.width = c.height = 160;
    const g = c.getContext("2d"); const img = g.createImageData(160, 160); const R = rng(21);
    for (let i = 0; i < img.data.length; i += 4) { const v = R() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    return (GRAIN = c);
  }
  let CORK = null, CORKKEY = "";
  function corkTile(S) {
    const B = S.look.board, tex = S.look.texture, u = S.u;
    const key = [B.base, B.dark, B.light, B.pit, tex.toFixed(2), u].join("|");
    if (CORK && CORKKEY === key) return CORK;
    const T = Math.round(512 * Math.max(0.75, u));
    const c = document.createElement("canvas"); c.width = c.height = T;
    const g = c.getContext("2d"); const R = rng(33);
    g.fillStyle = B.base; g.fillRect(0, 0, T, T);
    const wrap = (x, y, r, draw) => { for (const dx of [-T, 0, T]) for (const dy of [-T, 0, T]) { const X = x + dx, Y = y + dy; if (X < -r || X > T + r || Y < -r || Y > T + r) continue; draw(X, Y); } };
    for (let i = 0; i < 70; i++) {
      const x = R() * T, y = R() * T, r = (30 + R() * 90) * u, col = R() < 0.5 ? B.dark : B.light;
      wrap(x, y, r, (X, Y) => { const gr = g.createRadialGradient(X, Y, 0, X, Y, r); gr.addColorStop(0, rgba(col, 0.1 + 0.1 * tex)); gr.addColorStop(1, rgba(col, 0)); g.fillStyle = gr; g.fillRect(X - r, Y - r, r * 2, r * 2); });
    }
    const n = Math.round(1200 + 9000 * tex);
    for (let i = 0; i < n; i++) {
      const x = R() * T, y = R() * T, r = (0.7 + R() * R() * 3.4) * u, k = R();
      const col = k < 0.4 ? B.dark : k < 0.8 ? B.light : B.pit, a = (0.22 + R() * 0.5) * (0.3 + 0.7 * tex), sy = 0.6 + R() * 0.5, rot = R() * TAU;
      wrap(x, y, r, (X, Y) => { g.fillStyle = rgba(col, a); g.beginPath(); g.ellipse(X, Y, r, r * sy, rot, 0, TAU); g.fill(); });
    }
    for (let i = 0; i < Math.round(900 * tex); i++) {
      const x = R() * T, y = R() * T, r = (0.6 + R() * 1.1) * u;
      wrap(x, y, r, (X, Y) => { g.fillStyle = rgba(B.pit, 0.6); g.beginPath(); g.arc(X, Y, r, 0, TAU); g.fill(); });
    }
    CORKKEY = key;
    return (CORK = c);
  }

  // ---- paths drawn part-way, with a marker ----------------------------------------------------------
  function trace(ctx, arr, q) {
    ctx.beginPath();
    ctx.moveTo(arr[0][0], arr[0][1]);
    let ang = 0, tip = arr[0];
    if (q >= 1) {
      for (let i = 1; i < arr.length; i++) ctx.lineTo(arr[i][0], arr[i][1]);
      const a = arr[arr.length - 2], b = arr[arr.length - 1];
      return { x: b[0], y: b[1], a: Math.atan2(b[1] - a[1], b[0] - a[0]) };
    }
    let tot = 0;
    for (let i = 1; i < arr.length; i++) tot += Math.hypot(arr[i][0] - arr[i - 1][0], arr[i][1] - arr[i - 1][1]);
    let left = tot * q;
    for (let i = 1; i < arr.length; i++) {
      const dx = arr[i][0] - arr[i - 1][0], dy = arr[i][1] - arr[i - 1][1], d = Math.hypot(dx, dy);
      ang = Math.atan2(dy, dx);
      if (d >= left) { const k = d ? left / d : 0; tip = [arr[i - 1][0] + dx * k, arr[i - 1][1] + dy * k]; ctx.lineTo(tip[0], tip[1]); return { x: tip[0], y: tip[1], a: ang }; }
      left -= d; tip = arr[i]; ctx.lineTo(arr[i][0], arr[i][1]);
    }
    return { x: tip[0], y: tip[1], a: ang };
  }
  // A felt marker stroke: a faint wide bleed under a solid core.
  function pen(ctx, S, arr, q, color, w, o = {}) {
    if (q <= 0 || !arr || arr.length < 2) return null;
    const u = S.u;
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = color;
    if (o.dash) { ctx.setLineDash(o.dash.map((v) => v * u)); ctx.lineDashOffset = (o.off || 0) * u; }
    if (!o.thin && S.look.texture > 0) {
      ctx.save(); ctx.globalAlpha *= 0.2; ctx.lineWidth = w * u * 1.6; trace(ctx, arr, q); ctx.stroke(); ctx.restore();
    }
    ctx.lineWidth = w * u;
    const tip = trace(ctx, arr, q); ctx.stroke();
    ctx.restore();
    return tip;
  }
  function spline(pts, n = 10) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        out.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  function bez(p0, p1, p2, p3, n = 28) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, m = 1 - t;
      out.push([m * m * m * p0[0] + 3 * m * m * t * p1[0] + 3 * m * t * t * p2[0] + t * t * t * p3[0], m * m * m * p0[1] + 3 * m * m * t * p1[1] + 3 * m * t * t * p2[1] + t * t * t * p3[1]]);
    }
    return out;
  }
  const arrowHead = (x, y, ang, s) => [[x - Math.cos(ang - 0.5) * s, y - Math.sin(ang - 0.5) * s], [x, y], [x - Math.cos(ang + 0.5) * s, y - Math.sin(ang + 0.5) * s]];
  const ovalPts = (cx, cy, rx, ry, turns = 1.12, rot = -0.3, n = 40) => {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const a = rot + (i / n) * TAU * turns, k = 1 + 0.07 * (i / n) + 0.03 * Math.sin(a * 2);
      out.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    return out;
  };
  const checkPts = (cx, cy, s) => [[cx - s * 0.42, cy + s * 0.02], [cx - s * 0.12, cy + s * 0.34], [cx + s * 0.46, cy - s * 0.36]];
  const starPts = (cx, cy, r, rot = -Math.PI / 2) => { const out = []; for (let i = 0; i <= 5; i++) { const a = rot + ((i * 2) % 5) * (TAU / 5); out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return out; };
  const heartPts = (cx, cy, s) => { const out = []; for (let i = 0; i <= 36; i++) { const t = (i / 36) * TAU; out.push([cx + (16 * Math.pow(Math.sin(t), 3)) * s / 17, cy - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * s / 17]); } return out; };
  const squig = (x0, y0, x1, y1, amp, waves, n = 40) => { const out = []; for (let i = 0; i <= n; i++) { const t = i / n; out.push([lerp(x0, x1, t), lerp(y0, y1, t) + Math.sin(t * waves * TAU) * amp]); } return out; };

  // ---- text ---------------------------------------------------------------------------------------
  function setFont(ctx, size, weight = 700) { ctx.font = `${weight} ${size}px ${HAND}`; }
  // Marker lettering, revealed left to right as q runs 0 to 1.
  function write(ctx, S, str, x, y, size, o = {}) {
    str = String(str ?? "");
    const q = o.q ?? 1;
    if (!str || q <= 0) return 0;
    ctx.save();
    let z = size;
    setFont(ctx, z, o.weight);
    let w = ctx.measureText(str).width;
    if (o.maxW && w > o.maxW) { z = z * (o.maxW / w); setFont(ctx, z, o.weight); w = ctx.measureText(str).width; }
    const align = o.align || "left";
    const x0 = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    if (o.rot) { ctx.translate(x, y); ctx.rotate(o.rot); ctx.translate(-x, -y); }
    if (q < 1) { ctx.beginPath(); ctx.rect(x0 - 10 * S.u, y - z * 1.15, (w + 20 * S.u) * q, z * 1.6); ctx.clip(); }
    ctx.fillStyle = o.color || S.look.ink; ctx.textAlign = "left"; ctx.textBaseline = o.base || "alphabetic";
    ctx.fillText(str, x0, y);
    ctx.restore();
    return w;
  }
  function wrapLines(ctx, str, maxW, size, weight = 700) {
    setFont(ctx, size, weight);
    const words = String(str ?? "").split(/\s+/).filter(Boolean), lines = [];
    let cur = "";
    for (const w of words) { const t = cur ? cur + " " + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
    return lines;
  }

  // ---- paper things ---------------------------------------------------------------------------------
  function pin(ctx, S, x, y, color, r = 1, glint = 0) {
    const u = S.u, R = 15 * u * r;
    ctx.save();
    ctx.fillStyle = "rgba(20,10,0,0.3)"; ctx.shadowColor = "rgba(20,10,0,0.35)"; ctx.shadowBlur = 8 * u; ctx.shadowOffsetX = 5 * u; ctx.shadowOffsetY = 8 * u;
    ctx.beginPath(); ctx.arc(x, y, R * 0.9, 0, TAU); ctx.fill();
    ctx.shadowColor = "transparent";
    const g = ctx.createRadialGradient(x - R * 0.35, y - R * 0.4, R * 0.1, x, y, R);
    g.addColorStop(0, lite(color, 0.65)); g.addColorStop(0.45, color); g.addColorStop(1, dark(color, 0.45));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.beginPath(); ctx.ellipse(x - R * 0.38, y - R * 0.42, R * 0.2, R * 0.13, -0.6, 0, TAU); ctx.fill();
    if (glint > 0) {
      const gx = x - R * 0.38, gy = y - R * 0.42, L = R * (0.6 + 1.0 * glint);
      ctx.globalAlpha = glint; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2 * u; ctx.beginPath();
      ctx.moveTo(gx - L, gy); ctx.lineTo(gx + L, gy); ctx.moveTo(gx, gy - L); ctx.lineTo(gx, gy + L); ctx.stroke();
    }
    ctx.restore();
  }
  const glintOf = (t, ph) => { const k = fract(t / 3.4 + ph); return k < 0.12 ? Math.sin((k / 0.12) * Math.PI) : 0; };
  function tape(ctx, S, x, y, rot, w, h, color, stripes) {
    const u = S.u;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    const hw = w / 2, hh = h / 2, z = 5 * u;
    ctx.beginPath(); ctx.moveTo(-hw, -hh);
    for (let i = 0; i <= 4; i++) ctx.lineTo(-hw + (i % 2 ? -z : 0), -hh + (h * i) / 4);
    ctx.lineTo(hw, hh);
    for (let i = 4; i >= 0; i--) ctx.lineTo(hw + (i % 2 ? z : 0), -hh + (h * i) / 4);
    ctx.closePath();
    ctx.shadowColor = "rgba(30,15,0,0.25)"; ctx.shadowBlur = 5 * u; ctx.shadowOffsetY = 2 * u;
    ctx.fillStyle = rgba(color, 0.86); ctx.fill();
    ctx.shadowColor = "transparent";
    if (stripes) {
      ctx.clip(); ctx.strokeStyle = rgba("#ffffff", 0.35); ctx.lineWidth = 6 * u; ctx.beginPath();
      for (let sx = -hw - h; sx < hw + h; sx += 18 * u) { ctx.moveTo(sx, hh); ctx.lineTo(sx + h, -hh); }
      ctx.stroke();
    }
    ctx.restore();
  }
  function note(ctx, S, x, y, w, h, o = {}) {
    const u = S.u, tex = S.look.texture, a = o.alpha ?? 1, sc = o.scale ?? 1;
    if (a <= 0.005 || sc <= 0.005 || w < 2 || h < 2) return;
    const c = o.color || "#ffe36e", lift = o.lift ?? 0.5, curl = o.curl ?? 0.35;
    const hw = w / 2, hh = h / 2, cs = curl * Math.min(w, h) * 0.24, bow = curl * h * 0.025;
    ctx.save(); ctx.translate(x, y); ctx.rotate(o.rot || 0); ctx.scale(sc, sc * (o.sy ?? 1)); ctx.globalAlpha *= a;
    const body = () => {
      ctx.beginPath(); ctx.moveTo(-hw, -hh); ctx.lineTo(hw, -hh); ctx.lineTo(hw, hh - cs); ctx.lineTo(hw - cs, hh);
      ctx.quadraticCurveTo(0, hh + bow, -hw, hh); ctx.closePath();
    };
    ctx.save(); body();
    ctx.shadowColor = "rgba(25,12,0,0.4)"; ctx.shadowBlur = (8 + 24 * lift) * u; ctx.shadowOffsetX = (2 + 6 * lift) * u; ctx.shadowOffsetY = (5 + 15 * lift) * u;
    ctx.fillStyle = c; ctx.fill(); ctx.restore();
    body();
    const g = ctx.createLinearGradient(0, -hh, 0, hh);
    g.addColorStop(0, lite(c, 0.16)); g.addColorStop(0.5, c); g.addColorStop(1, dark(c, 0.07));
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); body(); ctx.clip();
    if (!o.plain) { ctx.fillStyle = "rgba(255,255,255,0.16)"; ctx.fillRect(-hw, -hh, w, h * 0.17); ctx.fillStyle = "rgba(0,0,0,0.06)"; ctx.fillRect(-hw, -hh + h * 0.17, w, 1.5 * u); }
    const cg = ctx.createLinearGradient(0, hh * 0.1, 0, hh); cg.addColorStop(0, "rgba(0,0,0,0)"); cg.addColorStop(1, `rgba(40,20,0,${0.06 + 0.12 * curl})`);
    ctx.fillStyle = cg; ctx.fillRect(-hw, -hh, w, h);
    if (o.grid) {
      ctx.strokeStyle = rgba(S.look.gridInk, 0.3); ctx.lineWidth = 1.3 * u; ctx.beginPath();
      const st = 46 * u;
      for (let gx = 0; gx <= hw; gx += st) { ctx.moveTo(gx, -hh); ctx.lineTo(gx, hh); ctx.moveTo(-gx, -hh); ctx.lineTo(-gx, hh); }
      for (let gy = 0; gy <= hh; gy += st) { ctx.moveTo(-hw, gy); ctx.lineTo(hw, gy); ctx.moveTo(-hw, -gy); ctx.lineTo(hw, -gy); }
      ctx.stroke();
    }
    if (o.lines) {
      ctx.strokeStyle = rgba(S.look.gridInk, 0.45); ctx.lineWidth = 1.5 * u; ctx.beginPath();
      const st = h / (o.lines + 0.6);
      for (let i = 0; i < o.lines; i++) { const ly = -hh + st * (i + 1.1); ctx.moveTo(-hw, ly); ctx.lineTo(hw, ly); }
      ctx.stroke();
      ctx.strokeStyle = rgba("#e0524a", 0.5); ctx.beginPath(); ctx.moveTo(-hw + w * 0.12, -hh); ctx.lineTo(-hw + w * 0.12, hh); ctx.stroke();
    }
    if (tex > 0) { ctx.globalCompositeOperation = "overlay"; ctx.globalAlpha *= 0.1 * tex; ctx.fillStyle = ctx.createPattern(grainTile(), "repeat"); ctx.fillRect(-hw, -hh, w, h); }
    ctx.restore();
    if (cs > 2) {
      ctx.save(); ctx.beginPath(); ctx.moveTo(hw, hh - cs); ctx.lineTo(hw - cs, hh); ctx.lineTo(hw - cs, hh - cs); ctx.closePath();
      ctx.shadowColor = "rgba(25,12,0,0.3)"; ctx.shadowBlur = 5 * u; ctx.shadowOffsetX = -2 * u; ctx.shadowOffsetY = -1 * u;
      const fg = ctx.createLinearGradient(hw, hh - cs, hw - cs, hh - cs * 0.2); fg.addColorStop(0, lite(c, 0.4)); fg.addColorStop(1, dark(c, 0.12));
      ctx.fillStyle = fg; ctx.fill(); ctx.restore();
    }
    if (o.edge) { body(); ctx.strokeStyle = o.edge; ctx.lineWidth = (o.edgeW || 4) * u; ctx.lineJoin = "round"; ctx.stroke(); }
    if (o.draw) o.draw(ctx, hw, hh);
    if (o.tape) for (const t of o.tape) tape(ctx, S, t[0], t[1], t[2] || 0, t[3] || 120 * u, t[4] || 42 * u, t[5] || S.look.tapeColor, true);
    if (o.pin) pin(ctx, S, o.pin[0], o.pin[1], o.pin[2] || S.accent, 1, o.glint || 0);
    if (o.pins) o.pins.forEach((p, i) => pin(ctx, S, p[0], p[1], p[2] || S.accent, 1, glintOf(o.t || 0, i * 0.23)));
    ctx.restore();
  }
  // Red yarn strung between two points; it sways, and q draws it on.
  function yarn(ctx, S, x0, y0, x1, y1, o = {}) {
    const u = S.u, q = o.q ?? 1;
    if (q <= 0) return;
    const sag = (o.sag ?? 110) * u + Math.sin((o.t || 0) * 1.3 + (o.ph || 0)) * 9 * u;
    const cx = (x0 + x1) / 2 + Math.sin((o.t || 0) * 0.9 + (o.ph || 0)) * 8 * u, cy = (y0 + y1) / 2 + sag * 2;
    const arr = [];
    for (let i = 0; i <= 30; i++) { const t = i / 30, m = 1 - t; arr.push([m * m * x0 + 2 * m * t * cx + t * t * x1, m * m * y0 + 2 * m * t * cy + t * t * y1]); }
    const col = o.color || S.look.yarn;
    ctx.save(); ctx.translate(5 * u, 8 * u); pen(ctx, S, arr, q, "rgba(25,12,0,0.22)", 6, { thin: true }); ctx.restore();
    pen(ctx, S, arr, q, col, 5, { thin: true });
    pen(ctx, S, arr, q, "rgba(60,0,0,0.28)", 5, { thin: true, dash: [3, 6] });
    ctx.save(); ctx.translate(-1 * u, -1.2 * u); pen(ctx, S, arr, q, lite(col, 0.45), 1.6, { thin: true }); ctx.restore();
  }
  function clip(ctx, S, x, y, rot) {
    const u = S.u;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(u, u);
    const p = spline([[-9, -22], [-9, 22], [9, 24], [10, -24], [1, -34], [-4, -26], [-4, 14], [3, 14], [4, -18]], 6);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(25,12,0,0.25)"; ctx.lineWidth = 4; ctx.beginPath(); p.forEach((q, i) => (i ? ctx.lineTo(q[0] + 3, q[1] + 4) : ctx.moveTo(q[0] + 3, q[1] + 4))); ctx.stroke();
    ctx.strokeStyle = "#b4bac4"; ctx.lineWidth = 3.4; ctx.beginPath(); p.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke();
    ctx.strokeStyle = "#f2f4f8"; ctx.lineWidth = 1.1; ctx.beginPath(); p.forEach((q, i) => (i ? ctx.lineTo(q[0] - 0.8, q[1] - 0.8) : ctx.moveTo(q[0] - 0.8, q[1] - 0.8))); ctx.stroke();
    ctx.restore();
  }
  function markerPen(ctx, S, x, y, ang, color, a = 1) {
    const u = S.u;
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y); ctx.rotate(ang + Math.PI);
    ctx.shadowColor = "rgba(25,12,0,0.3)"; ctx.shadowBlur = 8 * u; ctx.shadowOffsetX = 4 * u; ctx.shadowOffsetY = 6 * u;
    ctx.fillStyle = "#f4f1ea"; ctx.beginPath(); ctx.roundRect(14 * u, -17 * u, 160 * u, 34 * u, 10 * u); ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(124 * u, -18 * u, 56 * u, 36 * u, 9 * u); ctx.fill();
    ctx.fillStyle = "#2a2a2f"; ctx.beginPath(); ctx.moveTo(14 * u, -12 * u); ctx.lineTo(-4 * u, -4 * u); ctx.lineTo(-4 * u, 4 * u); ctx.lineTo(14 * u, 12 * u); ctx.closePath(); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-4 * u, -4 * u); ctx.lineTo(-10 * u, 0); ctx.lineTo(-4 * u, 4 * u); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fillRect(30 * u, -12 * u, 80 * u, 4 * u);
    ctx.restore();
  }

  // ---- doodles drawn in marker, in a local box of size s centred on (cx, cy) --------------------------
  function doodle(ctx, S, kind, cx, cy, s, q, T, color) {
    const ink = S.look.ink, acc = S.accent, blue = S.look.pens.blue, green = S.look.pens.green, w = 5.5;
    if (q <= 0) return;
    switch (kind) {
      case "bulb": {
        const arr = [];
        for (let i = 0; i <= 30; i++) { const a = -2.35 + (i / 30) * 5.5; arr.push([cx + Math.cos(a) * s * 0.3, cy - s * 0.1 + Math.sin(a) * s * 0.3]); }
        pen(ctx, S, arr, q, ink, w);
        pen(ctx, S, [[cx - s * 0.14, cy + s * 0.27], [cx + s * 0.14, cy + s * 0.27]], span(q, 0.6, 1), ink, w);
        pen(ctx, S, [[cx - s * 0.1, cy + s * 0.36], [cx + s * 0.1, cy + s * 0.36]], span(q, 0.7, 1), ink, w);
        pen(ctx, S, squig(cx - s * 0.1, cy + s * 0.05, cx + s * 0.1, cy + s * 0.05, s * 0.035, 1.5, 16), span(q, 0.5, 1), acc, 4.5);
        const pulse = 0.5 + 0.5 * Math.sin(T * 4);
        for (let k = 0; k < 7; k++) {
          const a = -Math.PI + (k / 6) * Math.PI, r0 = s * 0.42, r1 = s * (0.5 + 0.07 * pulse);
          pen(ctx, S, [[cx + Math.cos(a) * r0, cy - s * 0.1 + Math.sin(a) * r0], [cx + Math.cos(a) * r1, cy - s * 0.1 + Math.sin(a) * r1]], span(q, 0.7, 1), "#e89a12", 5);
        }
        break;
      }
      case "star": {
        const k = 1 + 0.07 * Math.sin(T * 3.2);
        pen(ctx, S, starPts(cx, cy, s * 0.36 * k, -Math.PI / 2 + Math.sin(T * 1.4) * 0.12), q, acc, 6.5);
        for (let i = 0; i < 3; i++) { const a = T * 0.9 + i * 2.1, r = s * (0.42 + 0.03 * i); const sx = cx + Math.cos(a) * r, sy = cy + Math.sin(a) * r * 0.9; const l = s * 0.045 * (1 + Math.sin(T * 5 + i)); pen(ctx, S, [[sx - l, sy], [sx + l, sy]], span(q, 0.7, 1), ink, 3.5); pen(ctx, S, [[sx, sy - l], [sx, sy + l]], span(q, 0.7, 1), ink, 3.5); }
        break;
      }
      case "bubble": {
        const L = cx - s * 0.36, R = cx + s * 0.36, Tp = cy - s * 0.26, B = cy + s * 0.16;
        pen(ctx, S, [[L + 20, Tp], [R - 20, Tp], [R, Tp + 20], [R, B - 20], [R - 20, B], [cx - s * 0.02, B], [cx - s * 0.16, cy + s * 0.34], [cx - s * 0.14, B], [L + 20, B], [L, B - 20], [L, Tp + 20], [L + 20, Tp]], q, blue, w);
        for (let i = 0; i < 3; i++) { const on = Math.sin(T * 4 - i * 1.1) > 0 ? 1 : 0.35; ctx.save(); ctx.globalAlpha *= on * span(q, 0.7, 1); ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(cx + (i - 1) * s * 0.18, cy - s * 0.05, s * 0.05, 0, TAU); ctx.fill(); ctx.restore(); }
        break;
      }
      case "clock": {
        pen(ctx, S, ovalPts(cx, cy, s * 0.32, s * 0.32, 1.02, -1.57), q, ink, w);
        for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2; pen(ctx, S, [[cx + Math.cos(a) * s * 0.25, cy + Math.sin(a) * s * 0.25], [cx + Math.cos(a) * s * 0.3, cy + Math.sin(a) * s * 0.3]], span(q, 0.6, 1), ink, 4); }
        const a1 = T * 0.7 - 1.2, a2 = T * 0.7 * 12 / 12 - 1.57 + T * 0.08;
        pen(ctx, S, [[cx, cy], [cx + Math.cos(a1) * s * 0.17, cy + Math.sin(a1) * s * 0.17]], span(q, 0.6, 1), ink, 5.5);
        pen(ctx, S, [[cx, cy], [cx + Math.cos(T * 2.6) * s * 0.25, cy + Math.sin(T * 2.6) * s * 0.25]], span(q, 0.6, 1), acc, 3.5);
        break;
      }
      case "heart": {
        const k = 1 + 0.09 * Math.pow(Math.max(0, Math.sin(T * 5)), 2);
        pen(ctx, S, heartPts(cx, cy - s * 0.02, s * 0.74 * k), q, acc, 6.5);
        break;
      }
      case "check": {
        pen(ctx, S, ovalPts(cx, cy, s * 0.33, s * 0.33, 1.1, -1.9), q, green, 6);
        const k = 1 + 0.08 * Math.pow(Math.max(0, Math.sin(T * 3)), 2);
        pen(ctx, S, checkPts(cx, cy, s * 0.6 * k), span(q, 0.45, 1), green, 9);
        break;
      }
      case "spark": {
        for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + T * 0.4, r0 = s * 0.12, r1 = s * (k % 2 ? 0.28 : 0.38) * (1 + 0.1 * Math.sin(T * 4 + k)); pen(ctx, S, [[cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1]], q, k % 2 ? ink : acc, 6); }
        break;
      }
      case "arrow": {
        const p = bez([cx - s * 0.36, cy + s * 0.2], [cx - s * 0.2, cy - s * 0.4], [cx + s * 0.1, cy - s * 0.4], [cx + s * 0.34, cy - s * 0.02]);
        const tip = pen(ctx, S, p, q, ink, w); if (q > 0.95) pen(ctx, S, arrowHead(p[p.length - 1][0], p[p.length - 1][1], 0.9, s * 0.16), 1, ink, w);
        break;
      }
      default: break;
    }
  }

  // ---- the board and what hangs on it -----------------------------------------------------------------
  const WORDS = ["trim", "b-roll", "music", "title", "cut 2", "idea", "draft", "ship it", "fix?", "love it", "v3", "later", "hook", "fade"];
  const stationCache = new Map();
  function station(k, S) {
    const key = `${k}:${S.W}x${S.H}:${S.look.notes.join("")}:${S.look.id || ""}`;
    if (stationCache.has(key)) return stationCache.get(key);
    const R = rng(900 + k * 131), W = S.W, H = S.H, u = S.u;
    const items = [], count = Math.round(20 * (W * H) / (1920 * 1080)), cols = S.look.notes;
    for (let tries = 0; items.length < count && tries < 500; tries++) {
      const kr = R(), kind = kr < 0.5 ? "note" : kr < 0.66 ? "card" : kr < 0.84 ? "photo" : kr < 0.9 ? "poster" : "ring";
      const s = (kind === "poster" ? 340 : kind === "card" ? 270 : kind === "photo" ? 210 : 190 + R() * 70) * u;
      const x = R() * W * (PAN - 0.02) + s * 0.2, y = s * 0.3 + R() * (H - s * 0.5);
      if (items.some((o) => Math.hypot(o.x - x, o.y - y) < (o.s + s) * 0.34)) continue;
      const it = { kind, x, y, s, rot: (R() - 0.5) * 0.2, ci: Math.floor(R() * cols.length), curl: 0.15 + R() * 0.55, ph: R() * TAU, sp: 0.5 + R() * 0.7, word: R() < 0.4 ? WORDS[Math.floor(R() * WORDS.length)] : "", pinned: R() < 0.8, pinCol: R() < 0.5 ? 0 : 1 + Math.floor(R() * 3), tape: R() < 0.35, clip: R() < 0.2, lines: [], doodle: R() < 0.2 ? ["bulb", "star", "heart", "check", "spark", "bubble"][Math.floor(R() * 6)] : "" };
      const nl = 2 + Math.floor(R() * 3);
      for (let i = 0; i < nl; i++) it.lines.push({ len: 0.4 + R() * 0.45, ph: R() * TAU, blue: R() < 0.3 });
      items.push(it);
    }
    const links = [];
    const pinned = items.filter((o) => o.pinned && o.kind !== "ring");
    for (let i = 0; i < pinned.length && links.length < 4; i++) {
      const a = pinned[i];
      let best = null;
      for (let j = i + 1; j < pinned.length; j++) { const b = pinned[j], d = Math.hypot(a.x - b.x, a.y - b.y); if (d > 260 * u && d < 560 * u && (!best || d < best.d)) best = { b, d }; }
      if (best && R() < 0.75) links.push([a, best.b, R() * TAU]);
    }
    const out = { items, links };
    stationCache.set(key, out);
    return out;
  }
  function itemPin(it, u) { return [it.x, it.y - it.s * (it.kind === "card" ? 0.26 : 0.36)]; }
  function drawItem(ctx, S, it, wx, T, st) {
    const u = S.u, th = S.look, s = it.s;
    const breeze = Math.sin(wx * 0.0035 - T * 1.5) * 0.02 + Math.sin(T * it.sp + it.ph) * 0.01;
    const rot = it.rot + breeze, curl = clamp(it.curl + 0.12 * Math.sin(T * it.sp * 1.3 + it.ph), 0, 0.9);
    if (it.kind === "ring") {
      ctx.save(); ctx.translate(it.x, it.y); ctx.strokeStyle = rgba(th.board.pit, 0.2); ctx.lineWidth = 9 * u; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.26, s * 0.24, it.rot, 0.2, TAU - 0.5); ctx.stroke();
      ctx.lineWidth = 3 * u; ctx.strokeStyle = rgba(th.board.pit, 0.16); ctx.beginPath(); ctx.ellipse(1, 1, s * 0.22, s * 0.2, it.rot, 0.5, TAU - 0.2); ctx.stroke(); ctx.restore();
      return;
    }
    const col = th.notes[it.ci % th.notes.length];
    const scribbles = (c, hw, hh, top) => {
      it.lines.forEach((ln, i) => {
        const y0 = top + i * s * 0.1, len = hw * 2 * 0.76 * ln.len;
        pen(c, S, squig(-hw * 0.76, y0, -hw * 0.76 + len, y0, s * 0.012, len / (22 * u), 18), 1, ln.blue ? th.pens.blue : th.ink, 3.4, { thin: true });
      });
    };
    if (it.kind === "note") {
      note(ctx, S, it.x, it.y, s, s, { color: col, rot, curl, lift: 0.35, t: T, draw: (c, hw, hh) => {
        if (it.doodle) doodle(c, S, it.doodle, 0, s * 0.02, s * 0.78, 1, T + it.ph);
        else if (it.word) { write(c, S, it.word, 0, s * 0.1, 46 * u, { align: "center", maxW: s * 0.8, color: it.ci % 2 ? th.ink : th.pens.blue }); scribbles(c, hw, hh, s * 0.24); }
        else scribbles(c, hw, hh, -s * 0.2);
      }, tape: it.tape ? [[-s * 0.3, -s * 0.5, -0.5, 110 * u, 40 * u]] : null });
    } else if (it.kind === "card") {
      note(ctx, S, it.x, it.y, s * 1.35, s * 0.8, { color: th.paper, rot, curl: curl * 0.5, lift: 0.3, lines: 5, plain: true, t: T, draw: (c, hw, hh) => {
        if (it.word) write(c, S, it.word, -hw * 0.7, -hh * 0.4, 46 * u, { color: th.pens.blue, maxW: hw * 1.3 });
        else pen(c, S, squig(-hw * 0.7, -hh * 0.45, hw * 0.1, -hh * 0.45, s * 0.015, 5, 24), 1, th.pens.blue, 4, { thin: true });
        scribbles(c, hw, hh, -hh * 0.1);
        if (it.doodle) doodle(c, S, it.doodle, hw * 0.55, hh * 0.1, s * 0.5, 1, T + it.ph);
      } });
      if (it.clip) clip(ctx, S, it.x + s * 0.4, it.y - s * 0.4 + 6 * u, rot + 0.1);
    } else if (it.kind === "photo") {
      note(ctx, S, it.x, it.y, s * 0.95, s * 1.12, { color: "#fbfaf4", rot, curl: curl * 0.4, lift: 0.4, plain: true, t: T, draw: (c, hw, hh) => {
        const ix = -hw * 0.84, iy = -hh * 0.86, iw = hw * 1.68, ih = hh * 1.28;
        const sky = c.createLinearGradient(0, iy, 0, iy + ih); sky.addColorStop(0, lite(th.notes[2], 0.2)); sky.addColorStop(1, lite(th.notes[0], 0.5));
        c.fillStyle = sky; c.fillRect(ix, iy, iw, ih);
        c.save(); c.beginPath(); c.rect(ix, iy, iw, ih); c.clip();
        c.fillStyle = "#fff6c8"; c.beginPath(); c.arc(ix + iw * (0.3 + 0.06 * Math.sin(T * 0.4 + it.ph)), iy + ih * 0.3, ih * 0.13, 0, TAU); c.fill();
        c.fillStyle = mixc(th.notes[3], "#4b7a3a", 0.35); c.beginPath(); c.moveTo(ix, iy + ih); c.lineTo(ix, iy + ih * 0.66); c.quadraticCurveTo(ix + iw * 0.3, iy + ih * 0.42, ix + iw * 0.55, iy + ih * 0.68); c.quadraticCurveTo(ix + iw * 0.8, iy + ih * 0.5, ix + iw, iy + ih * 0.62); c.lineTo(ix + iw, iy + ih); c.fill();
        const kx = ix + iw * 0.68, ky = iy + ih * (0.28 + 0.03 * Math.sin(T * 1.6 + it.ph));
        c.fillStyle = th.accent; c.beginPath(); c.moveTo(kx, ky - 18 * u); c.lineTo(kx + 13 * u, ky); c.lineTo(kx, ky + 18 * u); c.lineTo(kx - 13 * u, ky); c.fill();
        c.strokeStyle = th.ink; c.lineWidth = 2 * u; c.beginPath(); c.moveTo(kx, ky + 18 * u); c.quadraticCurveTo(kx - 20 * u, ky + 40 * u, kx + 6 * u, ky + 64 * u); c.stroke();
        c.restore();
        if (it.word) write(c, S, it.word, 0, hh * 0.8, 46 * u, { align: "center", maxW: hw * 1.7, color: th.ink });
      }, tape: [[0, -s * 0.56, 0.05, 130 * u, 42 * u]] });
    } else {
      note(ctx, S, it.x, it.y, s * 1.5, s * 1.1, { color: th.paper, rot, curl: curl * 0.5, lift: 0.3, grid: true, plain: true, t: T, draw: (c, hw, hh) => {
        const pts = []; for (let i = 0; i <= 6; i++) pts.push([-hw * 0.7 + (i / 6) * hw * 1.4, hh * 0.45 - (i / 6) * hh * 0.7 - Math.sin(i * 1.9 + it.ph) * hh * 0.1]);
        pen(c, S, spline(pts, 6), 1, th.accent, 5.5, { thin: true });
        pts.forEach((p, i) => { c.fillStyle = th.ink; c.beginPath(); c.arc(p[0], p[1], 5 * u * (1 + 0.25 * Math.sin(T * 3 + i)), 0, TAU); c.fill(); });
        pen(c, S, [[-hw * 0.75, hh * 0.6], [hw * 0.75, hh * 0.6]], 1, th.ink, 4, { thin: true });
      }, tape: [[-s * 0.55, -s * 0.5, -0.4, 120 * u, 40 * u], [s * 0.55, -s * 0.5, 0.4, 120 * u, 40 * u]] });
    }
    st.pinsQueue.push(it);
  }
  function board(ctx, S, cam, T) {
    const u = S.u, W = S.W, H = S.H, Wp = W * PAN;
    const tile = corkTile(S), pat = ctx.createPattern(tile, "repeat");
    if (pat.setTransform) pat.setTransform(new DOMMatrix([1, 0, 0, 1, -cam, 0]));
    ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H);
    const k0 = Math.floor(cam / Wp) - 1, k1 = Math.floor((cam + W) / Wp) + 1;
    ctx.save(); ctx.translate(-cam, 0);
    for (let k = Math.max(0, k0); k <= k1; k++) {
      const st = station(k, S); st.pinsQueue = [];
      ctx.save(); ctx.translate(k * Wp, 0);
      for (const it of st.items) { const sx = k * Wp + it.x - cam; if (sx < -it.s * 1.3 || sx > W + it.s * 1.3) continue; drawItem(ctx, S, it, k * Wp + it.x, T, st); }
      for (const [a, b, ph] of st.links) {
        const pa = itemPin(a, u), pb = itemPin(b, u);
        if (k * Wp + Math.min(pa[0], pb[0]) - cam > W + 100 || k * Wp + Math.max(pa[0], pb[0]) - cam < -100) continue;
        yarn(ctx, S, pa[0], pa[1], pb[0], pb[1], { sag: 60, t: T, ph });
      }
      for (const it of st.pinsQueue) {
        if (!it.pinned) continue;
        const p = itemPin(it, u), colr = it.pinCol === 0 ? S.accent : S.look.notes[it.pinCol % S.look.notes.length];
        pin(ctx, S, p[0], p[1], it.pinCol === 0 ? S.accent : dark(colr, 0.15), 1, glintOf(T, it.ph / TAU));
      }
      ctx.restore();
    }
    ctx.restore();
    // A little shade over the clutter so the foreground reads.
    ctx.fillStyle = S.look.dim; ctx.fillRect(0, 0, W, H);
  }

  // ---- headlines sit on notes -----------------------------------------------------------------------
  const lineCache = {};
  function headLines(id) {
    if (lineCache[id] && lineCache[id].length) return lineCache[id];
    const el = document.getElementById(id), root = document.getElementById("root");
    if (!el || !root || !el.firstChild) return [];
    let ox = 0, oy = 0;
    for (let n = el; n && n !== root; n = n.offsetParent) { ox += n.offsetLeft; oy += n.offsetTop; }
    const scale = root.getBoundingClientRect().width / (Number(root.dataset.width) || 1920) || 1;
    const er = el.getBoundingClientRect(), range = document.createRange();
    // Undo any scale the entrance has on the headline at the moment of measuring.
    const ratio = (er.width / (el.offsetWidth || er.width)) || 1;
    range.selectNodeContents(el);
    const out = [];
    for (const r of range.getClientRects()) {
      const line = { x: ox + (r.left - er.left) / ratio / scale, y: oy + (r.top - er.top) / ratio / scale, w: r.width / ratio / scale, h: r.height / ratio / scale };
      if (line.w > 1 && !out.some((o) => Math.abs(o.y - line.y) < 2)) out.push(line);
    }
    return (lineCache[id] = out);
  }
  function headRect(scene) {
    const ids = HEADS[scene];
    if (!ids) return null;
    let r = null;
    for (const id of ids) for (const L of headLines(id)) {
      if (!r) r = { x: L.x, y: L.y, x2: L.x + L.w, y2: L.y + L.h };
      else { r.x = Math.min(r.x, L.x); r.y = Math.min(r.y, L.y); r.x2 = Math.max(r.x2, L.x + L.w); r.y2 = Math.max(r.y2, L.y + L.h); }
    }
    return r && { x: r.x, y: r.y, w: r.x2 - r.x, h: r.y2 - r.y };
  }
  function area(S, id) {
    const r = headRect(id), u = S.u;
    const bottom = r ? r.y + r.h : S.H * 0.2;
    const top = bottom + (S.tall ? 100 : 90) * u, mx = S.W * 0.05;
    return { x: mx, y: top, w: S.W - mx * 2, h: S.H - top - (S.tall ? 70 : 40) * u };
  }
  function banner(ctx, S, info) {
    const r = headRect(info.scene);
    if (!r) return;
    const u = S.u, st = info.scene === "title" || info.scene === "closing";
    const padX = (st ? 90 : 52) * u, padT = (st ? 56 : 30) * u, padB = (st ? 84 : 52) * u;
    const T = info.local;
    const ex = 1 - Math.pow(2, -10 * span(T, 0, 0.7)), k = info.next ? span(T, info.hold - info.change, info.hold) : 0;
    if (k >= 1) return;
    const bx = r.x - padX, by = r.y - padT, bw = r.w * 1.05 + padX * 2, bh = r.h + padT + padB, cx = bx + bw / 2, cy = by + bh / 2;
    const col = S.look.notes[HEAD_COLOR[info.scene] % S.look.notes.length];
    ctx.save();
    ctx.globalAlpha *= 1 - k * k;
    ctx.globalAlpha *= ex;
    const sway = Math.sin(T * 1.1) * 0.0035;
    note(ctx, S, cx, cy, bw, bh, { color: col, rot: sway, lift: 0.9, curl: 0.45, scale: (0.94 + 0.06 * ex) * (1 - 0.03 * k * k), t: T, plain: false,
      tape: [[-bw / 2 + 60 * u, -bh / 2 + 6 * u, -0.5, 140 * u, 46 * u], [bw / 2 - 60 * u, -bh / 2 + 6 * u, 0.5, 140 * u, 46 * u]] });
    ctx.restore();
    // The marker underlines the last line, then lifts away.
    const uq = span(T, 0.55, 1.35);
    if (uq > 0) {
      const uy = r.y + r.h + 22 * u, x0 = st ? cx - r.w * 0.38 : r.x, x1 = st ? cx + r.w * 0.38 : r.x + Math.min(r.w, bw * 0.8);
      ctx.save(); ctx.globalAlpha *= 1 - k * k;
      const tip = pen(ctx, S, squig(x0, uy, x1, uy + 4 * u, 4 * u, Math.max(3, (x1 - x0) / (90 * u)), 36), eo(uq), S.accent, 8);
      const lift = span(T, 1.35, 1.8);
      if (tip && lift < 1) markerPen(ctx, S, tip.x + lift * 160 * u, tip.y - lift * 90 * u, -0.55 - lift * 0.5, S.accent, 1 - lift);
      ctx.restore();
    }
    // Pin, dropped after the note lands.
    const pq = span(T, 0.4, 0.7);
    if (pq > 0) { ctx.save(); ctx.globalAlpha *= 1 - k * k; pin(ctx, S, cx, by + 14 * u - (1 - back(pq)) * 50 * u, S.accent, 1.15, glintOf(T, 0.1)); ctx.restore(); }
  }

  // ---- title and closing worlds: notes slap onto the wall, yarn strings them, things keep moving ----------
  const HERO = {
    title: [[0.09, 0.2, "bulb", 0, -0.07], [0.91, 0.17, "star", 1, 0.06], [0.07, 0.76, "bubble", 2, 0.05], [0.93, 0.74, "clock", 3, -0.05], [0.27, 0.91, "heart", 4, 0.08], [0.73, 0.92, "check", 5, -0.06], [0.5, 0.07, "spark", 2, 0.03], [0.17, 0.5, "arrow", 4, -0.04], [0.83, 0.47, "bulb", 0, 0.05]],
    closing: [[0.09, 0.2, "check", 3, 0.06], [0.91, 0.17, "heart", 1, -0.06], [0.07, 0.74, "star", 0, -0.04], [0.93, 0.76, "spark", 5, 0.06], [0.27, 0.91, "bubble", 2, -0.06], [0.73, 0.92, "bulb", 4, 0.05], [0.5, 0.07, "star", 1, -0.03], [0.17, 0.48, "clock", 5, 0.05], [0.83, 0.48, "check", 3, -0.05]],
  };
  function hero(ctx, S, info) {
    const list = HERO[info.scene];
    if (!list) return;
    const u = S.u, T = info.local, W = S.W, H = S.H, th = S.look, size = (S.tall ? 250 : 270) * u;
    const nodes = list.map(([fx, fy, kind, ci, rot], i) => {
      const t0 = i * 0.2, pp = pop(T, t0, 0.3);
      return { x: fx * W, y: fy * H, kind, ci, rot, i, t0, pp };
    });
    const links = [[0, 6], [6, 1], [0, 7], [7, 2], [2, 4], [4, 5], [5, 3], [3, 8], [8, 1], [7, 4], [8, 5]];
    links.forEach(([a, b], i) => { const A = nodes[a], B = nodes[b], q = span(T, Math.max(A.t0, B.t0) + 0.2, Math.max(A.t0, B.t0) + 0.9); if (q > 0) yarn(ctx, S, A.x, A.y - size * 0.36, B.x, B.y - size * 0.36, { q: eo(q), sag: 70, t: T, ph: i }); });
    nodes.forEach((n) => {
      const flap = Math.sin(T * 1.2 + n.i) * 0.012;
      const dropY = (1 - n.pp.e) * -140 * u;
      note(ctx, S, n.x, n.y + dropY, size, size, { color: th.notes[n.ci % th.notes.length], rot: n.rot + flap + (1 - n.pp.e) * 0.35, scale: 0.7 + 0.3 * n.pp.e, alpha: n.pp.a, lift: lerp(1, 0.45, n.pp.e), curl: 0.3 + 0.1 * Math.sin(T * 1.4 + n.i), t: T,
        pin: [0, -size * 0.36, n.i % 2 ? S.accent : dark(th.notes[(n.ci + 2) % 6], 0.15)], glint: glintOf(T, n.i * 0.17),
        draw: (c) => doodle(c, S, n.kind, 0, size * 0.04, size * 0.82, span(T, n.t0 + 0.1, n.t0 + 0.8), T + n.i) });
    });
    if (info.scene === "closing") {
      for (let i = 0; i < 46; i++) {
        const sp = 70 + hs(i, 3) * 130, x = hs(i, 1) * W + Math.sin(T * 0.9 + i) * 34 * u, y = ((hs(i, 2) * (H + 160 * u) + T * sp * u) % (H + 160 * u)) - 80 * u;
        const z = (16 + hs(i, 5) * 22) * u;
        ctx.save(); ctx.translate(x, y); ctx.rotate(T * (hs(i, 6) - 0.5) * 5 + i); ctx.scale(Math.cos(T * (1 + hs(i, 7) * 2) + i) * 0.5 + 0.55, 1);
        ctx.fillStyle = th.notes[i % th.notes.length]; ctx.shadowColor = "rgba(25,12,0,0.3)"; ctx.shadowBlur = 5 * u; ctx.shadowOffsetY = 3 * u;
        ctx.globalAlpha *= span(T, 0.2, 0.6); ctx.fillRect(-z / 2, -z / 2, z, z * 1.1); ctx.restore();
      }
    }
  }
  function sticker(ctx, S, info) {
    if (info.scene !== "closing") return;
    const r = headRect("closing");
    if (!r) return;
    const u = S.u, T = info.local, q = back(span(T, 0.7, 1.1));
    if (q <= 0) return;
    const cx = r.x + r.w + 40 * u, cy = r.y - 20 * u, R = 112 * u;
    const bx = clamp(cx, R + 10 * u, S.W - R - 10 * u);
    ctx.save(); ctx.translate(bx, cy); ctx.rotate(0.22 + Math.sin(T * 2) * 0.05); ctx.scale(q * (1 + 0.04 * Math.sin(T * 3)), q * (1 + 0.04 * Math.sin(T * 3)));
    ctx.shadowColor = "rgba(25,12,0,0.4)"; ctx.shadowBlur = 16 * u; ctx.shadowOffsetY = 9 * u;
    ctx.fillStyle = S.look.pens.green; ctx.beginPath(); for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU, rr = R * (i % 2 ? 0.9 : 1); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.fill();
    ctx.shadowColor = "transparent"; ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 5 * u; ctx.beginPath(); ctx.arc(0, 0, R * 0.78, 0, TAU); ctx.stroke();
    pen(ctx, S, checkPts(0, 0, R * 1.2), span(T, 0.9, 1.3), "#ffffff", 16);
    ctx.restore();
  }

  // ---- shared scene helpers ----------------------------------------------------------------------------
  function pop(T, t0, dur = 0.28) { const e = back(span(T, t0, t0 + dur)); return { e, a: clamp((T - t0) / (dur * 0.5)), k: span(T, t0, t0 + dur) }; }
  function slideX(info, S) {
    const Wp = S.W * PAN;
    if (info.exit != null) return -eio(info.exit) * Wp;
    if (FR.index > 0 && info.local < info.change) return (1 - eio(info.local / Math.max(0.01, info.change))) * Wp;
    return 0;
  }
  const band = (S, i) => S.look.notes[i % S.look.notes.length];

  // ---- chart: bars are stacks of notes ----------------------------------------------------------------------
  function chartScene(ctx, S, box, p, d, info) {
    const u = S.u, th = S.look, T = info.local, A = area(S, "chart");
    ctx.save(); ctx.translate(slideX(info, S), 0);
    const sw = A.w, sh = S.tall ? Math.min(A.h, 1320 * u) : A.h, cx = A.x + A.w / 2, cy = A.y + sh / 2;
    const sp = pop(T, 0, 0.35);
    const n = d.values.length, max = Math.max(...d.values, 1), R = 10;
    const hot = d.highlight;
    note(ctx, S, cx, cy, sw, sh, { color: th.paper, rot: Math.sin(T * 0.8) * 0.005 - 0.004, lift: 0.85, curl: 0.2, alpha: sp.a, scale: 0.92 + 0.08 * sp.e, grid: true, plain: true, t: T,
      pins: [[-sw / 2 + 36 * u, -sh / 2 + 34 * u, th.accent], [sw / 2 - 36 * u, -sh / 2 + 34 * u, "#3b78c9"]],
      tape: [[-sw * 0.08, -sh / 2 + 4 * u, -0.04, 150 * u, 46 * u]],
      draw: (c) => {
        const padX = 70 * u, colw = (sw - padX * 2) / n;
        const baseY = sh / 2 - 135 * u, barsH = Math.min(sh - 400 * u, S.tall ? 720 * u : 9999), rowH = barsH / R, bw = Math.min(colw * 0.7, 210 * u);
        pen(c, S, [[-sw / 2 + padX * 0.5, baseY + 4 * u], [sw / 2 - padX * 0.5, baseY]], eo(span(T, 0.1, 0.6)), th.ink, 6);
        pen(c, S, [[-sw / 2 + padX * 0.5, baseY + 4 * u], [-sw / 2 + padX * 0.5 - 2 * u, baseY - barsH - 30 * u]], eo(span(T, 0.15, 0.65)), th.ink, 5);
        for (let g = 1; g <= 4; g++) pen(c, S, [[-sw / 2 + padX * 0.5, baseY - (barsH * g) / 4], [sw / 2 - padX * 0.5, baseY - (barsH * g) / 4]], span(T, 0.2, 0.7), rgba(th.pens.blue, 0.5), 3, { dash: [14, 14], off: -T * 10, thin: true });
        const tops = [];
        for (let i = 0; i < n; i++) {
          // A pencilled ghost of each stack is on the sheet before the notes land.
          const gx = -sw / 2 + padX + (i + 0.5) * colw, gh = (d.values[i] / max) * barsH;
          c.save(); c.strokeStyle = rgba(th.ink, 0.22); c.lineWidth = 3 * u; c.setLineDash([10 * u, 9 * u]); c.beginPath(); c.roundRect(gx - bw / 2, baseY - gh, bw, gh, 6 * u); c.stroke(); c.restore();
        }
        for (let i = 0; i < n; i++) {
          const v = d.values[i], r = v / max, rowsF = r * R, rows = Math.ceil(rowsF - 1e-6), t0 = 0.2 + i * 0.26, dt = 0.06;
          const x = -sw / 2 + padX + (i + 0.5) * colw, isHot = i === hot;
          const col = isHot ? "#ffd23f" : [th.notes[2], th.notes[3], th.notes[5], th.notes[1]][i % 4];
          let landed = 0;
          for (let k = 0; k < rows; k++) {
            const frac = k === rows - 1 ? rowsF - k : 1, hh = Math.max(rowH * frac, 8 * u), q = span(T, t0 + k * dt, t0 + k * dt + 0.2);
            if (q <= 0) continue;
            landed = Math.max(landed, k + frac * Math.min(1, q * 1.2));
            const e = back(q), jx = (hs(i, k) - 0.5) * 9 * u + Math.sin(T * 1.6 + k * 0.5 + i) * (isHot && k > rows - 4 ? 4 : 1.6) * u;
            const cyk = baseY - k * rowH - hh / 2 - (1 - e) * 90 * u;
            note(c, S, x + jx, cyk, bw, hh + 2 * u, { color: col, rot: (hs(k, i + 4) - 0.5) * 0.05 + (1 - e) * 0.15, alpha: clamp(q * 3), scale: 0.85 + 0.15 * e, lift: 0.28, curl: isHot && k === rows - 1 ? 0.5 + 0.25 * Math.sin(T * 2.2) : 0.12, plain: true,
              draw: (cc, hw) => { if (hh > 24 * u) pen(cc, S, [[-hw * 0.6, 0], [hw * 0.3, 0]], 1, rgba(th.ink, 0.28), 3.4, { thin: true }); } });
          }
          const topNow = baseY - landed * rowH;
          tops.push(baseY - rowsF * rowH);
          const q = rows ? clamp(landed / rowsF) : 0;
          if (q > 0.02) {
            const size = 112 * u;
            write(c, S, M_.formatNumber(v * q, 0, d.prefix, d.suffix), x, topNow - 24 * u, size, { align: "center", maxW: colw * 0.96, color: isHot ? th.accent : th.ink });
            if (isHot && q > 0.98) {
              const tt = span(T, t0 + rows * dt + 0.2, t0 + rows * dt + 0.8);
              pen(c, S, ovalPts(x, topNow - 24 * u - 40 * u, Math.min(colw * 0.52, 190 * u), 88 * u, 1.12, -2.4), eo(tt), th.accent, 7);
              for (let k = 0; k < 10; k++) { const a = -Math.PI + (k / 9) * Math.PI, r0 = 128 * u + 6 * u, r1 = r0 + (14 + 14 * (0.5 + 0.5 * Math.sin(T * 5 + k * 1.3))) * u; pen(c, S, [[x + Math.cos(a) * r0 * 1.25, topNow - 64 * u + Math.sin(a) * r0 * 0.78], [x + Math.cos(a) * r1 * 1.25, topNow - 64 * u + Math.sin(a) * r1 * 0.78]], tt, "#e89a12", 5); }
            }
          }
          const lq = span(T, t0 - 0.1, t0 + 0.3);
          if (lq > 0) {
            const lw = colw * 0.88, ly = baseY + 66 * u;
            tape(c, S, x, ly, Math.sin(i * 2.3) * 0.03, lw, 70 * u, band(S, i + 2), true);
            write(c, S, d.labels[i] || "", x, ly + 15 * u, 46 * u, { align: "center", maxW: lw - 24 * u, q: eo(lq), color: th.ink });
          }
        }
        // A dashed trend arrow rides over the tops.
        const tq = span(T, 1.3, 2.7);
        if (tq > 0 && n > 1) {
          const pts = tops.map((ty, i) => [-sw / 2 + padX + (i + 0.5) * colw, Math.max(-sh / 2 + 60 * u, ty - 200 * u)]);
          const path = spline([[pts[0][0] - colw * 0.4, pts[0][1] + 40 * u], ...pts, [pts[n - 1][0] + colw * 0.35, pts[n - 1][1] - 30 * u]], 10);
          const tip = pen(c, S, path, eo(tq), th.pens.blue, 7, { dash: [26, 16], off: -T * 40 });
          if (tq > 0.97) { const a = path[path.length - 1], b = path[path.length - 4]; const ang = Math.atan2(a[1] - b[1], a[0] - b[0]); pen(c, S, arrowHead(a[0], a[1], ang, 40 * u / u), 1, th.pens.blue, 7); }
        }
      } });
    ctx.restore();
  }

  // ---- object: a laptop (or phone) pinned to the wall, three notes strung to its parts ----------------------------
  function drawDevice(c, S, x, y, w, h, phone, T, A) {
    const u = S.u, th = S.look, ink = th.ink;
    const rr = (px, py, pw, ph, r) => { c.beginPath(); c.roundRect(px, py, pw, ph, r); };
    c.save();
    const shell = phone ? "#e9edf3" : "#dde2ea";
    rr(x, y, w, h, (phone ? 44 : 22) * u);
    c.save(); c.shadowColor = "rgba(25,12,0,0.4)"; c.shadowBlur = 36 * u; c.shadowOffsetX = 8 * u; c.shadowOffsetY = 22 * u; c.fillStyle = shell; c.fill(); c.restore();
    c.fillStyle = shell; c.fill(); c.strokeStyle = ink; c.lineWidth = 6 * u; c.stroke();
    const pad = (phone ? 22 : 26) * u, sx = x + pad, sy = y + pad, sw = w - pad * 2, sh = h - pad * 2;
    rr(sx, sy, sw, sh, 10 * u); c.fillStyle = th.paper; c.fill(); c.lineWidth = 4 * u; c.stroke();
    c.save(); rr(sx, sy, sw, sh, 10 * u); c.clip();
    // Preview photo.
    const pw = phone ? sw * 0.84 : sw * 0.56, ph = phone ? sh * 0.34 : sh * 0.52, px = phone ? sx + sw * 0.08 : sx + sw * 0.04, py = sy + sh * 0.06;
    const sky = c.createLinearGradient(0, py, 0, py + ph); sky.addColorStop(0, lite(th.notes[2], 0.1)); sky.addColorStop(1, lite(th.notes[0], 0.55));
    c.fillStyle = sky; c.fillRect(px, py, pw, ph);
    c.save(); c.beginPath(); c.rect(px, py, pw, ph); c.clip();
    const sunT = fract(T / 7), sxn = px + pw * (0.15 + 0.7 * sunT), syn = py + ph * (0.55 - 0.3 * Math.sin(sunT * Math.PI));
    c.fillStyle = "#fff2b0"; c.beginPath(); c.arc(sxn, syn, ph * 0.12, 0, TAU); c.fill();
    for (let i = 0; i < 3; i++) { const cxn = px + ((T * (14 + i * 6) * u + i * pw * 0.4) % (pw + 160 * u)) - 80 * u, cyn = py + ph * (0.18 + i * 0.12); c.fillStyle = "rgba(255,255,255,0.92)"; c.beginPath(); c.ellipse(cxn, cyn, 48 * u, 16 * u, 0, 0, TAU); c.ellipse(cxn + 24 * u, cyn - 10 * u, 30 * u, 16 * u, 0, 0, TAU); c.fill(); }
    c.fillStyle = mixc(th.notes[3], "#4b7a3a", 0.35); c.beginPath(); c.moveTo(px, py + ph); c.lineTo(px, py + ph * 0.7); c.quadraticCurveTo(px + pw * 0.3, py + ph * 0.42, px + pw * 0.55, py + ph * 0.72); c.quadraticCurveTo(px + pw * 0.8, py + ph * 0.5, px + pw, py + ph * 0.66); c.lineTo(px + pw, py + ph); c.fill();
    c.restore();
    c.strokeStyle = ink; c.lineWidth = 3 * u; c.strokeRect(px, py, pw, ph);
    // Side bin of little notes.
    if (!phone) {
      const bx = px + pw + sw * 0.04, bw = sx + sw - bx - sw * 0.04;
      for (let i = 0; i < 6; i++) {
        const cx0 = bx + (i % 2) * (bw / 2), cy0 = py + Math.floor(i / 2) * (ph / 3), pulse = i === 2 ? 1 + 0.08 * Math.sin(T * 4) : 1;
        note(c, S, cx0 + bw / 4, cy0 + ph / 6, bw / 2 * 0.82 * pulse, ph / 3 * 0.8 * pulse, { color: band(S, i), rot: (hs(i, 9) - 0.5) * 0.1, lift: 0.15, curl: 0.3, plain: true, edge: ink, edgeW: 2.2 });
      }
    }
    // Timeline: three tracks of little clips, a playhead, a cursor.
    const ty0 = py + ph + sh * 0.08, th0 = phone ? sh * 0.06 : sh * 0.085, gap = sh * 0.03, cols = [[0.04, 0.3], [0.38, 0.22], [0.64, 0.3]];
    for (let t = 0; t < 3; t++) {
      c.fillStyle = rgba(ink, 0.07); c.fillRect(sx + sw * 0.03, ty0 + t * (th0 + gap) - 2 * u, sw * 0.94, th0 + 4 * u);
      cols[t % 3] && cols.forEach(([a0, wd], i) => {
        const q = span(T, 0.6 + t * 0.35 + i * 0.22, 0.95 + t * 0.35 + i * 0.22);
        if (q <= 0) return;
        const off = (t === 1 ? 0.05 : 0) * (i % 2), cw = sw * wd * eo(q) * (1 - (t === 2 ? 0.1 * (i % 2) : 0));
        note(c, S, sx + sw * (a0 + off) + cw / 2, ty0 + t * (th0 + gap) + th0 / 2, cw, th0, { color: band(S, t * 3 + i + 1), rot: 0, lift: 0.1, curl: 0, plain: true, edge: ink, edgeW: 2.2 });
      });
    }
    const phx = sx + sw * (0.04 + 0.9 * fract(T / 5.5));
    c.strokeStyle = th.accent; c.lineWidth = 4 * u; c.beginPath(); c.moveTo(phx, ty0 - 12 * u); c.lineTo(phx, ty0 + 3 * (th0 + gap)); c.stroke();
    c.fillStyle = th.accent; c.beginPath(); c.moveTo(phx - 10 * u, ty0 - 14 * u); c.lineTo(phx + 10 * u, ty0 - 14 * u); c.lineTo(phx, ty0 - 2 * u); c.fill();
    const cxn = sx + sw * (0.3 + 0.28 * Math.sin(T * 0.8)), cyn = ty0 + (th0 + gap) * (1 + 0.8 * Math.sin(T * 0.8 + 1));
    c.save(); c.translate(cxn, cyn); c.scale(u, u); c.fillStyle = "#fff"; c.strokeStyle = ink; c.lineWidth = 3; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 34); c.lineTo(9, 26); c.lineTo(16, 40); c.lineTo(22, 37); c.lineTo(15, 24); c.lineTo(26, 23); c.closePath(); c.fill(); c.stroke(); c.restore();
    c.restore();
    if (!phone) {
      c.beginPath(); c.moveTo(x - w * 0.07, y + h + 34 * u); c.lineTo(x + w * 1.07, y + h + 34 * u); c.lineTo(x + w * 1.04, y + h + 6 * u); c.lineTo(x - w * 0.04, y + h + 6 * u); c.closePath();
      c.save(); c.shadowColor = "rgba(25,12,0,0.4)"; c.shadowBlur = 22 * u; c.shadowOffsetY = 12 * u; c.fillStyle = "#cfd5de"; c.fill(); c.restore();
      c.fillStyle = "#cfd5de"; c.fill(); c.strokeStyle = ink; c.lineWidth = 5 * u; c.stroke();
      c.fillStyle = "rgba(0,0,0,0.12)"; c.beginPath(); c.roundRect(x + w * 0.4, y + h + 6 * u, w * 0.2, 12 * u, 6 * u); c.fill();
    } else {
      c.fillStyle = ink; c.beginPath(); c.roundRect(x + w / 2 - 40 * u, y + 8 * u, 80 * u, 14 * u, 7 * u); c.fill();
    }
    c.restore();
    return { px, py, pw, ph, ty0, th0, sx, sy, sw, sh };
  }
  function objectScene(ctx, S, box, p, d, info) {
    const u = S.u, th = S.look, T = info.local, A = area(S, "object");
    ctx.save(); ctx.translate(slideX(info, S), 0);
    const phone = d.kind === "phone", tall = S.tall;
    let dw, dh, dx, dy;
    if (phone) { dw = Math.min(A.w * (tall ? 0.46 : 0.28), A.h * (tall ? 0.3 : 0.46)); dh = dw * 1.95; dx = tall ? A.x + A.w / 2 - dw / 2 : A.x + A.w * 0.3 - dw / 2; dy = tall ? A.y + 10 * u : A.y + (A.h - dh) / 2; }
    else { dw = Math.min(A.w * (tall ? 0.94 : 0.52), A.h * (tall ? 0.52 : 1.12)); dh = dw * 0.62; dx = tall ? A.x + A.w / 2 - dw / 2 : A.x + A.w * 0.29 - dw / 2; dy = tall ? A.y + 20 * u : A.y + (A.h - dh - 40 * u) / 2; }
    const dp = pop(T, 0.05, 0.4);
    ctx.save(); ctx.globalAlpha *= dp.a; ctx.translate(dx + dw / 2, dy + dh / 2); ctx.scale(0.9 + 0.1 * dp.e, 0.9 + 0.1 * dp.e); ctx.translate(-(dx + dw / 2), -(dy + dh / 2));
    const g = drawDevice(ctx, S, dx, dy, dw, dh, phone, T, A);
    ctx.restore();
    // Anchors on the device for each callout.
    const anchors = [[g.px + g.pw * 0.74, g.py + g.ph * 0.28], [g.sx + g.sw * (phone ? 0.5 : 0.52), g.ty0 + g.th0 * 1.2], [g.sx + g.sw * 0.2, g.ty0 + g.th0 * 2.9]];
    const n = d.callouts.length;
    const nw = tall ? A.w * 0.82 : A.w * 0.34;
    for (let i = 0; i < n; i++) {
      const label = d.callouts[i];
      const lines = wrapLines(ctx, label, nw - 90 * u, 46 * u), nh = Math.max(150 * u, lines.length * 58 * u + 80 * u);
      const t0 = 0.3 + i * 0.35, pp = pop(T, t0, 0.32);
      let nx, ny;
      if (tall) { nx = A.x + A.w / 2 + (i % 2 ? 1 : -1) * A.w * 0.05; ny = dy + dh + 120 * u + nh / 2 + i * (190 * u); }
      else { nx = A.x + A.w * (phone ? 0.64 : 0.79) + (i % 2 ? 24 : -8) * u; ny = A.y + A.h * (0.17 + i * 0.3); }
      const sway = Math.sin(T * 1.1 + i * 1.7) * 0.012;
      const anc = anchors[i], pinX = nx - nw / 2 + 36 * u, pinY = ny;
      const yq = span(T, t0 + 0.15, t0 + 0.8);
      if (yq > 0) yarn(ctx, S, anc[0], anc[1], pinX, pinY, { q: eo(yq), sag: tall ? 40 : 70, t: T, ph: i * 2 });
      ctx.save(); ctx.translate(nx, ny); ctx.rotate(0.02 * (i % 2 ? -1 : 1) + sway); ctx.translate(-nx, -ny);
      note(ctx, S, nx, ny + (1 - pp.e) * -40 * u, nw, nh, { color: band(S, [0, 4, 3][i % 3]), rot: 0, alpha: pp.a, scale: 0.8 + 0.2 * pp.e, lift: 0.7, curl: 0.4 + 0.1 * Math.sin(T * 1.8 + i), t: T,
        draw: (c, hw, hh) => {
          lines.forEach((ln, k) => write(c, S, ln, -hw + 78 * u, -((lines.length - 1) * 58 * u) / 2 + k * 58 * u + 16 * u, 46 * u, { q: eo(span(T, t0, t0 + 0.3)), color: th.ink }));
          pen(c, S, ovalPts(-hw + 38 * u, 0, 16 * u, 16 * u, 1.05, -1), span(T, t0 + 0.1, t0 + 0.5), th.accent, 6);
          c.fillStyle = th.accent; c.beginPath(); c.arc(-hw + 38 * u, 0, 6 * u, 0, TAU); c.fill();
        } });
      ctx.restore();
      // A red pin where the yarn ends on the device.
      if (yq > 0.2) pin(ctx, S, anc[0], anc[1], th.accent, 0.8, glintOf(T, i * 0.3));
    }
    ctx.restore();
  }

  // ---- people: little note-bodied characters on a plank ----------------------------------------------------
  const SKIN = ["#f1c7a0", "#d6a075", "#a36b43", "#78492a", "#f6d8bd", "#c48a60"], HAIR = ["#3a2a22", "#1c1c24", "#8a4b2a", "#c4822a", "#5b3a6b", "#2d3b5a"];
  function noteling(ctx, S, cx, base, size, o) {
    const u = S.u, th = S.look, T = o.T, ink = th.ink, lw = Math.max(5 * u, size * 0.016);
    const q = o.q, e = back(q), ph = o.ph;
    if (q <= 0) return;
    const headR = size * 0.2, bodyW = size * 0.5, bodyH = size * 0.34, legH = size * 0.2;
    const bob = Math.sin(T * 2.4 + ph) * size * 0.01 + (o.hot ? Math.abs(Math.sin(T * 3 + ph)) * -size * 0.012 : 0);
    ctx.save();
    ctx.globalAlpha *= clamp(q * 3);
    ctx.translate(cx, base); ctx.scale(o.scale || 1, (o.scale || 1) * (0.85 + 0.15 * e)); ctx.translate(-cx, -base);
    const hipY = base - legH + bob * 0.3, shY = hipY - bodyH + bob, headY = shY - headR * 0.92 + bob * 1.4;
    const skin = SKIN[o.kind % SKIN.length], shirt = band(S, o.kind + 1), hair = HAIR[(o.kind + 2) % HAIR.length];
    // Soft floor shadow.
    ctx.fillStyle = "rgba(25,12,0,0.22)"; ctx.beginPath(); ctx.ellipse(cx + size * 0.03, base + 6 * u, bodyW * 0.7, size * 0.035, 0, 0, TAU); ctx.fill();
    // Legs.
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = ink; ctx.lineWidth = lw * 1.2;
    const step = o.hot ? Math.sin(T * 3 + ph) * size * 0.012 : 0;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * bodyW * 0.2, hipY); ctx.lineTo(cx + s * bodyW * 0.24, base - 6 * u + (s > 0 ? step : -step)); ctx.lineTo(cx + s * bodyW * 0.24 + s * size * 0.06, base - 6 * u + (s > 0 ? step : -step)); ctx.stroke(); }
    // Arms: the left rests and sways, the right waves.
    const shx = bodyW / 2, shyA = shY + bodyH * 0.14;
    const sw1 = Math.sin(T * 1.7 + ph) * 0.12;
    const hand1 = [cx - shx - size * 0.09 + sw1 * size * 0.1, shyA + size * 0.2];
    ctx.beginPath(); ctx.moveTo(cx - shx, shyA); ctx.quadraticCurveTo(cx - shx - size * 0.08, shyA + size * 0.08, hand1[0], hand1[1]); ctx.stroke();
    const wv = o.wave ? Math.sin(T * 6 + ph) * 0.35 : Math.sin(T * 1.9 + ph) * 0.1;
    const ang = o.wave ? -1.15 + wv : 0.5 + wv, len = size * 0.24;
    const elbow = [cx + shx + Math.cos(o.wave ? -0.25 : 0.9) * size * 0.1, shyA + Math.sin(o.wave ? -0.25 : 0.9) * size * 0.1 + size * 0.06];
    const hand2 = [elbow[0] + Math.cos(ang) * len * 0.55, elbow[1] + Math.sin(ang) * len * 0.55 + (o.wave ? 0 : size * 0.1)];
    ctx.beginPath(); ctx.moveTo(cx + shx, shyA); ctx.lineTo(elbow[0], elbow[1]); ctx.lineTo(hand2[0], hand2[1]); ctx.stroke();
    ctx.fillStyle = skin; for (const h of [hand1, hand2]) { ctx.beginPath(); ctx.arc(h[0], h[1], size * 0.036, 0, TAU); ctx.fill(); ctx.stroke(); }
    // Body: a sticky note shirt.
    note(ctx, S, cx, shY + bodyH / 2 + bob * 0.2, bodyW, bodyH, { color: shirt, rot: Math.sin(T * 1.3 + ph) * 0.015, lift: 0.18, curl: 0.5, edge: ink, edgeW: lw / u, plain: true,
      draw: (c, hw, hh) => {
        c.strokeStyle = rgba(ink, 0.55); c.lineWidth = lw * 0.7; c.lineCap = "round";
        if (o.kind % 3 === 0) { c.beginPath(); c.moveTo(-hw * 0.7, -hh * 0.1); c.lineTo(hw * 0.7, -hh * 0.1); c.moveTo(-hw * 0.7, hh * 0.25); c.lineTo(hw * 0.7, hh * 0.25); c.stroke(); }
        else if (o.kind % 3 === 1) { c.beginPath(); c.arc(0, hh * 0.1, hw * 0.28, 0, TAU); c.stroke(); }
        else { c.beginPath(); c.moveTo(-hw * 0.4, -hh * 0.5); c.lineTo(0, -hh * 0.1); c.lineTo(hw * 0.4, -hh * 0.5); c.stroke(); }
      } });
    // Head.
    ctx.lineWidth = lw; ctx.strokeStyle = ink;
    const hx = cx + Math.sin(T * 1.5 + ph) * size * 0.012;
    const kind = o.kind % 6;
    if (kind === 1) { const px = hx - headR * 1.05 + Math.sin(T * 3 + ph) * size * 0.03; ctx.fillStyle = hair; ctx.beginPath(); ctx.ellipse(px, headY + headR * 0.3, headR * 0.28, headR * 0.5, 0.4, 0, TAU); ctx.fill(); ctx.stroke(); }
    if (kind === 3) { ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(hx, headY - headR * 1.1, headR * 0.34, 0, TAU); ctx.fill(); ctx.stroke(); }
    if (kind === 2) { ctx.fillStyle = hair; for (let i = 0; i < 6; i++) { const a = -Math.PI + (i / 5) * Math.PI; ctx.beginPath(); ctx.arc(hx + Math.cos(a) * headR * 0.85, headY + Math.sin(a) * headR * 0.85, headR * 0.34, 0, TAU); ctx.fill(); ctx.stroke(); } }
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(hx, headY, headR, 0, TAU); ctx.fill(); ctx.stroke();
    if (kind === 0 || kind === 5) {
      const capCol = kind === 0 ? th.notes[4] : th.notes[2];
      ctx.fillStyle = capCol; ctx.beginPath(); ctx.arc(hx, headY, headR * 1.02, Math.PI * 1.05, Math.PI * 1.95); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (kind === 0) { ctx.beginPath(); ctx.arc(hx, headY - headR * 1.12, headR * 0.2, 0, TAU); ctx.fillStyle = lite(capCol, 0.5); ctx.fill(); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(hx + headR * 0.1, headY - headR * 0.3); ctx.quadraticCurveTo(hx + headR * 1.2, headY - headR * 0.2, hx + headR * 1.5, headY - headR * 0.05); ctx.lineTo(hx + headR * 0.9, headY - headR * 0.02); ctx.closePath(); ctx.fillStyle = dark(capCol, 0.1); ctx.fill(); ctx.stroke(); }
    }
    if (kind === 1 || kind === 3 || kind === 2 || kind === 4) {
      ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(hx, headY, headR * 1.02, Math.PI * 1.08, Math.PI * 1.92); ctx.quadraticCurveTo(hx, headY - headR * 0.35, hx - headR * 0.98, headY - headR * 0.3); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    if (kind === 4) {
      ctx.strokeStyle = ink; ctx.lineWidth = lw * 1.3; ctx.beginPath(); ctx.arc(hx, headY, headR * 1.12, Math.PI * 1.02, Math.PI * 1.98); ctx.stroke();
      ctx.fillStyle = th.accent; ctx.lineWidth = lw; for (const s of [-1, 1]) { ctx.beginPath(); ctx.roundRect(hx + s * headR * 1.12 - headR * 0.16, headY - headR * 0.2, headR * 0.32, headR * 0.6, headR * 0.12); ctx.fill(); ctx.stroke(); }
    }
    // Face.
    const blink = fract(T / 3.1 + ph / TAU) > 0.95;
    ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.lineWidth = lw * 0.8;
    for (const s of [-1, 1]) {
      const ex = hx + s * headR * 0.38, ey = headY + headR * 0.05;
      if (blink) { ctx.beginPath(); ctx.moveTo(ex - headR * 0.12, ey); ctx.lineTo(ex + headR * 0.12, ey); ctx.stroke(); } else { ctx.beginPath(); ctx.arc(ex, ey, headR * 0.1, 0, TAU); ctx.fill(); }
    }
    if (kind === 3) { ctx.lineWidth = lw * 0.7; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(hx + s * headR * 0.38, headY + headR * 0.05, headR * 0.26, 0, TAU); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(hx - headR * 0.12, headY + headR * 0.05); ctx.lineTo(hx + headR * 0.12, headY + headR * 0.05); ctx.stroke(); }
    ctx.lineWidth = lw * 0.8; ctx.beginPath();
    if (o.hot) { ctx.arc(hx, headY + headR * 0.28, headR * 0.3, 0.1, Math.PI - 0.1); ctx.fillStyle = "#b53a3a"; ctx.fill(); ctx.stroke(); }
    else { ctx.arc(hx, headY + headR * 0.22, headR * 0.28, 0.2, Math.PI - 0.2); ctx.stroke(); }
    ctx.fillStyle = "rgba(235,90,90,0.35)"; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(hx + s * headR * 0.62, headY + headR * 0.3, headR * 0.14, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  function peopleScene(ctx, S, box, p, d, info) {
    const u = S.u, th = S.look, T = info.local, A = area(S, "people");
    ctx.save(); ctx.translate(slideX(info, S), 0);
    const n = Math.max(2, Math.min(6, Math.round(d.count))), rows = S.tall && n > 3 ? 2 : 1, per = Math.ceil(n / rows), rowH = A.h / rows;
    const hot = Math.min(n - 1, d.highlight);
    // A lamp pool behind the highlighted person.
    for (let r = 0; r < rows; r++) {
      const base = A.y + rowH * (r + 1) - (rows > 1 ? 100 : 130) * u;
      const cnt = r === rows - 1 ? n - per * r : per, colw = A.w / per, size = Math.min(rowH * 0.62, colw * 1.35, 520 * u);
      const pq = eo(span(T, 0.0, 0.5));
      // The plank.
      const pxl = A.x + (A.w - colw * cnt) / 2 - 20 * u, pw = colw * cnt + 40 * u;
      ctx.save(); ctx.globalAlpha *= clamp(pq * 2); ctx.translate(0, (1 - pq) * 40 * u);
      ctx.beginPath(); ctx.roundRect(pxl, base, pw * pq, 46 * u, 8 * u);
      ctx.save(); ctx.shadowColor = "rgba(25,12,0,0.45)"; ctx.shadowBlur = 26 * u; ctx.shadowOffsetY = 16 * u; ctx.fillStyle = "#b98550"; ctx.fill(); ctx.restore();
      const wg = ctx.createLinearGradient(0, base, 0, base + 46 * u); wg.addColorStop(0, "#d9a96e"); wg.addColorStop(1, "#a06f3d"); ctx.fillStyle = wg; ctx.fill();
      ctx.strokeStyle = rgba(th.ink, 0.6); ctx.lineWidth = 4 * u; ctx.stroke();
      ctx.save(); ctx.clip(); ctx.strokeStyle = "rgba(90,50,20,0.25)"; ctx.lineWidth = 2 * u; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(pxl, base + 8 * u + i * 8 * u); ctx.lineTo(pxl + pw, base + 11 * u + i * 8 * u + Math.sin(i) * 3 * u); ctx.stroke(); } ctx.restore();
      ctx.restore();
      pin(ctx, S, pxl + 20 * u, base + 23 * u, th.accent, 0.9, glintOf(T, 0.1)); pin(ctx, S, pxl + pw - 20 * u, base + 23 * u, "#3b78c9", 0.9, glintOf(T, 0.5));
      for (let j = 0; j < cnt; j++) {
        const i = r * per + j, cx = A.x + (A.w - colw * cnt) / 2 + colw * (j + 0.5), isHot = i === hot, t0 = 0.1 + i * 0.2;
        if (isHot && T > t0) {
          const gl = ctx.createRadialGradient(cx, base - size * 0.5, 0, cx, base - size * 0.5, size * 0.9); gl.addColorStop(0, "rgba(255,240,170,0.5)"); gl.addColorStop(1, "rgba(255,240,170,0)");
          ctx.fillStyle = gl; ctx.globalAlpha *= 1; ctx.fillRect(cx - size, base - size * 1.5, size * 2, size * 1.8);
        }
        noteling(ctx, S, cx, base, size, { T, q: span(T, t0, t0 + 0.4), kind: i, ph: i * 1.7, hot: isHot, wave: isHot || i % 3 === 0, scale: isHot ? 1.07 : 1 });
        // Name tag hanging off the plank.
        const label = d.badges[i % d.badges.length], tp = pop(T, t0 + 0.2, 0.3);
        if (label) {
          const lw2 = Math.min(colw * 0.92, Math.max(190 * u, label.length * 27 * u + 60 * u)), ty = base + 100 * u;
          const sway = Math.sin(T * 1.4 + i) * 0.03;
          ctx.save(); ctx.translate(cx, base + 46 * u); ctx.rotate(sway); ctx.translate(-cx, -(base + 46 * u));
          pen(ctx, S, [[cx, base + 46 * u], [cx, ty - 40 * u]], tp.k, rgba(th.ink, 0.6), 3, { thin: true });
          note(ctx, S, cx, ty + (1 - tp.e) * -30 * u, lw2, 80 * u, { color: isHot ? "#ffd23f" : band(S, i + 2), alpha: tp.a, scale: 0.8 + 0.2 * tp.e, lift: 0.5, curl: 0.35, t: T,
            draw: () => write(ctx, S, label, 0, 15 * u, 46 * u, { align: "center", maxW: lw2 - 24 * u, q: eo(span(T, t0 + 0.2, t0 + 0.5)), color: isHot ? th.accent : th.ink }) });
          ctx.restore();
        }
        // A thought bubble: a tiny note with a doodle that cycles.
        const bt = t0 + 0.6;
        if (T > bt) {
          const bp = pop(T, bt, 0.35), kinds = ["heart", "check", "bulb", "star", "bubble", "spark"], kd = kinds[(i + Math.floor(T / 2.4)) % kinds.length];
          const bx = cx + size * 0.34, by = base - size * 1.04 + Math.sin(T * 2 + i) * 6 * u, bs = size * 0.34;
          note(ctx, S, bx, by, bs, bs, { color: band(S, i + 4), rot: 0.08 + Math.sin(T * 1.6 + i) * 0.04, alpha: bp.a, scale: 0.6 + 0.4 * bp.e, lift: 0.6, curl: 0.3, t: T,
            draw: (c) => doodle(c, S, kd, 0, 0, bs * 0.9, 1, T + i, null) });
        }
      }
    }
    ctx.restore();
  }

  // ---- process: three big notes joined by marker arrows, a paper plane running the route ------------------------
  function stepIcon(ctx, S, i, cx, cy, s, q, T) {
    const th = S.look, ink = th.ink, acc = th.accent;
    if (i === 0) {
      const off = Math.sin(T * 1.4) * s * 0.06;
      for (let k = 0; k < 4; k++) pen(ctx, S, squig(cx - s * 0.34, cy - s * 0.24 + k * s * 0.15, cx + s * (0.34 - (k % 2) * 0.12), cy - s * 0.24 + k * s * 0.15, s * 0.02, 3, 14), span(q, k * 0.1, 0.5 + k * 0.1), rgba(ink, 0.7), 4.4);
      const lx = cx + s * 0.1 + off, ly = cy + s * 0.04;
      ctx.save(); ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.beginPath(); ctx.arc(lx, ly, s * 0.24, 0, TAU); ctx.fill(); ctx.restore();
      pen(ctx, S, ovalPts(lx, ly, s * 0.24, s * 0.24, 1.02, -2.4), span(q, 0.3, 0.9), th.pens.blue, 7);
      pen(ctx, S, [[lx + s * 0.17, ly + s * 0.17], [lx + s * 0.38, ly + s * 0.38]], span(q, 0.7, 1), th.pens.blue, 11);
      pen(ctx, S, [[lx - s * 0.12, ly - s * 0.1], [lx - s * 0.04, ly - s * 0.17]], span(q, 0.8, 1), "#ffffff", 5);
    } else if (i === 1) {
      const wq = fract(T * 0.45), path = squig(cx - s * 0.36, cy + s * 0.3, cx + s * 0.3, cy + s * 0.3, s * 0.05, 3, 32);
      pen(ctx, S, path, span(q, 0.1, 0.8), acc, 6);
      const k = Math.floor(clamp(wq) * 31), tp = path[k] || path[0];
      ctx.save(); ctx.translate(tp[0], tp[1]); ctx.rotate(-0.8);
      const L = s * 0.6, W2 = s * 0.12; ctx.globalAlpha *= clamp(q * 2);
      ctx.fillStyle = "#ffd23f"; ctx.strokeStyle = ink; ctx.lineWidth = 5 * S.u; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W2 * 0.5, -W2); ctx.lineTo(L, -W2); ctx.lineTo(L, W2); ctx.lineTo(W2 * 0.5, W2); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#f2a0a0"; ctx.beginPath(); ctx.roundRect(L, -W2, W2 * 0.8, W2 * 2, W2 * 0.2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#f6dcb4"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W2 * 0.5, -W2); ctx.lineTo(W2 * 0.5, W2); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      for (let k2 = 0; k2 < 3; k2++) { const a = T * 2 + k2 * 2.1, sx = cx + s * (0.2 + 0.1 * k2), sy = cy - s * (0.3 - 0.1 * k2) + Math.sin(a) * 6 * S.u; pen(ctx, S, [[sx - 8 * S.u, sy], [sx + 8 * S.u, sy]], span(q, 0.7, 1), ink, 3.5); pen(ctx, S, [[sx, sy - 8 * S.u], [sx, sy + 8 * S.u]], span(q, 0.7, 1), ink, 3.5); }
    } else {
      const k = 1 + 0.08 * Math.pow(Math.max(0, Math.sin(T * 3)), 2);
      pen(ctx, S, ovalPts(cx, cy, s * 0.36, s * 0.36, 1.08, -2), q, th.pens.green, 8);
      pen(ctx, S, checkPts(cx, cy, s * 0.66 * k), span(q, 0.45, 1), th.pens.green, 12);
      for (let k2 = 0; k2 < 6; k2++) { const a = (k2 / 6) * TAU + T * 0.8, r0 = s * 0.46, r1 = s * (0.54 + 0.05 * Math.sin(T * 5 + k2)); pen(ctx, S, [[cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1]], span(q, 0.8, 1), "#e89a12", 5); }
    }
  }
  function processScene(ctx, S, box, p, d, info) {
    const u = S.u, th = S.look, T = info.local, A = area(S, "process"), tall = S.tall;
    ctx.save(); ctx.translate(slideX(info, S), 0);
    const n = d.steps.length;
    const cell = tall ? A.h / n : A.w / n;
    const nw = tall ? Math.min(A.w * 0.9, 820 * u) : Math.min(cell * 0.78, 520 * u), nh = tall ? Math.min(cell * 0.84, 380 * u) : Math.min(A.h * 0.78, nw * 1.05);
    const centers = [];
    for (let i = 0; i < n; i++) {
      const cx = tall ? A.x + A.w / 2 + (i % 2 ? 1 : -1) * A.w * 0.04 : A.x + cell * (i + 0.5);
      const cy = tall ? A.y + cell * (i + 0.5) : A.y + A.h * 0.5 + (i % 2 ? 1 : -1) * A.h * 0.06;
      centers.push([cx, cy]);
    }
    // Arrows first, so the notes sit on their ends.
    const routes = [];
    for (let i = 0; i < n - 1; i++) {
      const [ax, ay] = centers[i], [bx, by] = centers[i + 1];
      const p0 = tall ? [ax + nw * 0.1, ay + nh / 2 + 6 * u] : [ax + nw / 2 + 10 * u, ay - nh * 0.1], p3 = tall ? [bx - nw * 0.1, by - nh / 2 - 22 * u] : [bx - nw / 2 - 26 * u, by - nh * 0.1];
      const c1 = tall ? [p0[0] + 160 * u, p0[1] + 40 * u] : [p0[0] + 70 * u, p0[1] - 120 * u], c2 = tall ? [p3[0] - 160 * u, p3[1] - 40 * u] : [p3[0] - 70 * u, p3[1] - 120 * u];
      routes.push(bez(p0, c1, c2, p3, 30));
    }
    routes.forEach((r, i) => {
      const q = span(T, 0.4 + i * 0.4, 0.85 + i * 0.4);
      pen(ctx, S, r, eo(q), th.accent, 9);
      if (q > 0.98) { const a = r[r.length - 1], b = r[r.length - 4]; pen(ctx, S, arrowHead(a[0], a[1], Math.atan2(a[1] - b[1], a[0] - b[0]), 44 * u), 1, th.accent, 9); }
      if (q > 0.98) pen(ctx, S, r, 1, "#ffffff", 3, { dash: [2, 40], off: -T * 80, thin: true });
    });
    for (let i = 0; i < n; i++) {
      const [cx, cy] = centers[i], t0 = 0.1 + i * 0.4, pp = pop(T, t0, 0.32);
      const sway = Math.sin(T * 1.2 + i * 1.9) * 0.012, tilt = (i % 2 ? 0.025 : -0.025);
      const lines = wrapLines(ctx, d.steps[i], (tall ? nw * 0.5 : nw) - 70 * u, 46 * u), isLast = i === n - 1;
      note(ctx, S, cx, cy + (1 - pp.e) * -60 * u, nw, nh, { color: band(S, [0, 1, 2, 3][i % 4] === 0 ? 0 : [0, 1, 2, 3][i % 4]), rot: tilt + sway + (1 - pp.e) * 0.2, alpha: pp.a, scale: 1.25 - 0.25 * pp.e, lift: lerp(1, 0.6, pp.e), curl: 0.35 + 0.12 * Math.sin(T * 1.6 + i), t: T,
        pin: [0, -nh / 2 + 28 * u, isLast ? "#2e9d57" : th.accent], glint: glintOf(T, i * 0.3),
        draw: (c, hw, hh) => {
          const q = eo(span(T, t0 + 0.1, t0 + 0.9));
          if (tall) {
            stepIcon(c, S, i, -hw + nw * 0.24, 0, nh * 0.62, q, T);
            lines.forEach((ln, k) => write(c, S, ln, -hw + nw * 0.46, -((lines.length - 1) * 56 * u) / 2 + k * 56 * u + 14 * u, 46 * u, { q: eo(span(T, t0, t0 + 0.3)), color: th.ink }));
          } else {
            stepIcon(c, S, i, 0, -hh * 0.14, Math.min(nw, nh) * 0.72, q, T);
            lines.forEach((ln, k) => write(c, S, ln, 0, hh * 0.64 + (k - (lines.length - 1) / 2) * 54 * u, 46 * u, { align: "center", maxW: nw - 50 * u, q: eo(span(T, t0, t0 + 0.3)), color: th.ink }));
          }
          const nq = span(T, t0 + 0.05, t0 + 0.45);
          c.save(); c.translate(-hw + 54 * u, -hh + 66 * u); c.rotate(-0.1);
          pen(c, S, ovalPts(0, 0, 32 * u / u, 32 * u / u, 1.08, -2), nq, th.accent, 5.5);
          write(c, S, String(i + 1), 0, 14 * u, 46 * u, { align: "center", color: th.accent, q: nq });
          c.restore();
        } });
    }
    // The paper plane runs the route, endlessly.
    if (n > 1 && T > 1.4) {
      const total = routes.length, ph = fract((T - 1.4) / 2.6) * total, ri = Math.min(total - 1, Math.floor(ph)), k = ph - ri;
      const r = routes[ri], idx = Math.min(r.length - 2, Math.floor(k * (r.length - 1))), a = r[idx], b = r[idx + 1], ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      ctx.save(); ctx.translate(a[0], a[1] - 4 * u); ctx.rotate(ang); ctx.scale(u, u);
      ctx.shadowColor = "rgba(25,12,0,0.35)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 8;
      ctx.fillStyle = "#fff"; ctx.strokeStyle = th.ink; ctx.lineWidth = 4; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(34, 0); ctx.lineTo(-30, -22); ctx.lineTo(-16, 0); ctx.lineTo(-30, 22); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(34, 0); ctx.lineTo(-16, 0); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  // ---- compare: before is a droopy grey note under a raincloud; after is bright, circled and counting ----------------
  function compareScene(ctx, S, box, p, d, info) {
    const u = S.u, th = S.look, T = info.local, A = area(S, "compare"), tall = S.tall;
    ctx.save(); ctx.translate(slideX(info, S), 0);
    const max = Math.max(d.leftValue, d.rightValue, 1);
    const gap = (tall ? 150 : 170) * u;
    const nw = tall ? A.w * 0.8 : (A.w - gap) / 2 * 0.98, nh = tall ? (A.h - gap) / 2 * 0.98 : Math.min(A.h * 0.96, 760 * u);
    const items = [[d.left, d.leftValue, false], [d.right, d.rightValue, true]];
    const pos = items.map((_, i) => tall ? [A.x + A.w / 2 + (i ? 1 : -1) * A.w * 0.04, A.y + nh / 2 + i * (nh + gap)] : [A.x + nw / 2 + i * (nw + gap), A.y + A.h / 2]);
    items.forEach(([label, value, good], i) => {
      const [cx, cy] = pos[i], t0 = 0.05 + i * 0.35, pp = pop(T, t0, 0.35), q = eo(span(T, t0 + 0.1, t0 + 1.0));
      const rain = !good ? T : 0;
      note(ctx, S, cx, cy + (1 - pp.e) * -70 * u, nw, nh, { color: good ? th.notes[3] : mixc(th.notes[0], "#9a9484", 0.5), rot: good ? 0.02 + Math.sin(T * 1.3) * 0.006 : -0.025 + Math.sin(T * 0.9) * 0.005, alpha: pp.a, scale: 1.2 - 0.2 * pp.e, lift: good ? 0.9 : 0.4, curl: good ? 0.3 : 0.95, t: T,
        pin: good ? [0, -nh / 2 + 30 * u, th.accent] : null, glint: glintOf(T, 0.2),
        tape: good ? null : [[0, -nh / 2 + 8 * u, 0.02, 140 * u, 46 * u]],
        draw: (c, hw, hh) => {
          write(c, S, label, -hw + 44 * u, -hh + 96 * u, 54 * u, { maxW: nw - 90 * u, q: eo(span(T, t0, t0 + 0.3)), color: good ? th.pens.green : rgba(th.ink, 0.85) });
          const vs = Math.min(190 * u, nh * 0.26), val = M_.formatNumber(value * q, 0, d.prefix, d.suffix);
          write(c, S, val, 0, -hh * 0.02 + vs * 0.1, vs, { align: "center", maxW: nw - 80 * u, color: good ? th.accent : rgba(th.ink, 0.7), q: span(T, t0 + 0.2, t0 + 0.5) });
          if (good) {
            pen(c, S, ovalPts(0, -hh * 0.02 - vs * 0.3, Math.min(nw * 0.42, 300 * u), vs * 0.74, 1.1, -2.4), eo(span(T, t0 + 1.2, t0 + 1.8)), th.accent, 8);
            for (let k = 0; k < 3; k++) { const a = T * 1.3 + k * 2.1, r = nw * 0.46, sx = Math.cos(a) * r, sy = -hh * 0.2 + Math.sin(a) * hh * 0.34; pen(c, S, starPts(sx, sy, 20 * u * (1 + 0.3 * Math.sin(T * 4 + k)), a), span(T, t0 + 1.3, t0 + 1.8), "#e89a12", 4.5); }
          } else {
            // Crumple creases.
            pen(c, S, [[hw * 0.1, -hh * 0.5], [hw * 0.3, -hh * 0.3], [hw * 0.2, -hh * 0.1]], 1, rgba(th.ink, 0.18), 3, { thin: true });
            pen(c, S, [[-hw * 0.6, hh * 0.4], [-hw * 0.3, hh * 0.28]], 1, rgba(th.ink, 0.18), 3, { thin: true });
          }
          // Tally of little notes.
          const cnt = value > 0 ? Math.max(1, Math.round((value / max) * 10)) : 0, sz = Math.min(58 * u, (nw - 120 * u) / 5 - 6 * u), rowsN = 2;
          for (let k = 0; k < cnt; k++) {
            const col = k % 5, row = Math.floor(k / 5), tq = pop(T, t0 + 0.7 + k * 0.07, 0.25);
            const tx = -(5 * (sz + 8 * u)) / 2 + (sz + 8 * u) * (col + 0.5), ty = hh * 0.58 + row * (sz + 8 * u) + (good ? Math.sin(T * 3 + k) * 2 * u : Math.sin(T * 1.2 + k) * 1 * u);
            note(c, S, tx, ty - (1 - tq.e) * 50 * u, sz, sz, { color: good ? band(S, k + (good ? 1 : 0)) : mixc(band(S, k), "#8a8576", 0.55), rot: (hs(k, i) - 0.5) * 0.12, alpha: tq.a, scale: 0.7 + 0.3 * tq.e, lift: 0.2, curl: 0.2, plain: true, edge: rgba(th.ink, 0.5), edgeW: 2 });
          }
          if (!good) {
            // Rain streaks under a scribbled cloud.
            const cxn = hw * 0.5, cyn = -hh * 0.62;
            pen(c, S, spline([[cxn - 90 * u, cyn + 20 * u], [cxn - 70 * u, cyn - 20 * u], [cxn - 20 * u, cyn - 40 * u], [cxn + 30 * u, cyn - 14 * u], [cxn + 80 * u, cyn - 24 * u], [cxn + 100 * u, cyn + 14 * u], [cxn - 90 * u, cyn + 20 * u]], 6), span(T, t0 + 0.4, t0 + 1.0), rgba(th.ink, 0.75), 5.5);
            for (let k = 0; k < 5; k++) { const ry = cyn + 36 * u + fract(T * 0.9 + k * 0.23) * 90 * u; pen(c, S, [[cxn - 70 * u + k * 34 * u, ry], [cxn - 76 * u + k * 34 * u, ry + 18 * u]], span(T, t0 + 0.8, t0 + 1.2), th.pens.blue, 5); }
          }
        } });
    });
    // Arrow and change stamp between the two notes.
    const mid = tall ? [A.x + A.w / 2, A.y + nh + gap / 2] : [A.x + nw + gap / 2, A.y + A.h / 2];
    const aq = eo(span(T, 1.2, 1.7));
    const route = tall ? bez([mid[0] - 70 * u, mid[1] - 70 * u], [mid[0] - 100 * u, mid[1]], [mid[0] + 100 * u, mid[1]], [mid[0] + 70 * u, mid[1] + 70 * u], 24) : bez([mid[0] - 110 * u, mid[1] - 40 * u], [mid[0] - 40 * u, mid[1] - 110 * u], [mid[0] + 40 * u, mid[1] - 110 * u], [mid[0] + 110 * u, mid[1] - 30 * u], 24);
    pen(ctx, S, route, aq, th.accent, 10);
    if (aq > 0.97) { const a = route[route.length - 1], b = route[route.length - 4]; pen(ctx, S, arrowHead(a[0], a[1], Math.atan2(a[1] - b[1], a[0] - b[0]), 46 * u), 1, th.accent, 10); }
    if (d.leftValue > 0 && Math.round(((d.rightValue - d.leftValue) / d.leftValue) * 100) !== 0) {
      const pct = Math.round(((d.rightValue - d.leftValue) / d.leftValue) * 100), sq = pop(T, 1.9, 0.35);
      const txt = (pct > 0 ? "+" : "−") + Math.abs(pct) + "%";
      ctx.save(); ctx.translate(mid[0], mid[1] + (tall ? 0 : 62 * u)); ctx.rotate(-0.12 + Math.sin(T * 1.6) * 0.02); const k = (1.7 - 0.7 * sq.e) * (1 + 0.03 * Math.sin(T * 3)); ctx.scale(k, k); ctx.globalAlpha *= sq.a;
      setFont(ctx, 100 * u); const w = ctx.measureText(txt).width + 60 * u;
      ctx.fillStyle = "rgba(251,246,230,0.92)"; ctx.beginPath(); ctx.roundRect(-w / 2, -92 * u, w, 126 * u, 14 * u); ctx.fill();
      ctx.strokeStyle = th.accent; ctx.lineWidth = 8 * u; ctx.stroke(); ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.roundRect(-w / 2 + 12 * u, -80 * u, w - 24 * u, 102 * u, 8 * u); ctx.stroke();
      write(ctx, S, txt, 0, 0, 100 * u, { align: "center", color: th.accent });
      ctx.restore();
    }
    ctx.restore();
  }

  // ---- palettes --------------------------------------------------------------------------------------
  const NOTES = ["#ffe36e", "#ff9fc2", "#8fd3f4", "#a9e08a", "#ffb35c", "#c9b3f2"];
  const M_ = window.DreamcutMotion;
  const TOKENS = {
    board: { base: "#c79a63", dark: "#8a5f33", light: "#e6c28b", pit: "#5c3d1e" },
    notes: NOTES, paper: "#fbf6e6", gridInk: "#6f9ac2", pens: { blue: "#2c5fb3", green: "#2b8a57" }, yarn: "#d63a2f", tapeColor: "#f2e2a8", dim: "rgba(40,20,0,0.1)",
  };
  const paintOverlay = (ctx, W, H, t) => {
    ctx.clearRect(0, 0, W, H);
    const u = Math.min(W, H) / 1080, hyp = Math.hypot(W, H);
    const lx = W * (0.5 + 0.4 * Math.sin(t * 0.42)), ly = H * (0.28 + 0.12 * Math.sin(t * 0.31 + 1));
    const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, hyp * 0.42);
    lg.addColorStop(0, "rgba(255,238,190,0.2)"); lg.addColorStop(0.5, "rgba(255,238,190,0.07)"); lg.addColorStop(1, "rgba(255,238,190,0)");
    ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
    const vg = ctx.createRadialGradient(W / 2, H / 2, hyp * 0.26, W / 2, H / 2, hyp * 0.62);
    vg.addColorStop(0, "rgba(30,14,0,0)"); vg.addColorStop(1, "rgba(30,14,0,0.45)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 38; i++) {
      const vx = 6 + hs(i, 1) * 14, vy = 10 + hs(i, 2) * 18, x = (hs(i, 3) * W + t * vx * u + Math.sin(t * 0.6 + i) * 20 * u) % W, y = (((hs(i, 4) * H - t * vy * u) % H) + H) % H;
      const a = 0.18 + 0.2 * Math.sin(t * 1.6 + i * 2.1), r = (1.4 + hs(i, 5) * 2.4) * u;
      ctx.fillStyle = `rgba(255,244,214,${Math.max(0, a)})`; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
  };

  return {
    id: "sticky-notes",
    ...TOKENS,
    bg: "#c79a63", panel: "#fbf6e6", ink: "#262a35", muted: "#5a5f6e", accent: "#d9362b", onAccent: "#ffffff",
    rule: "rgba(38,42,53,0.5)", track: "rgba(38,42,53,0.1)",
    display: HAND, displayWeight: 700, displayCase: "none", displayTracking: "0.005em",
    body: HAND, bodyWeight: 700, figures: HAND, radius: 6, motion: "focus", change: "fade",
    kit: { line: 4, fill: "solid", panel: "fill" },
    keepArt: true, overlap: true, paintOver: true,
    palettes: {
      // Light: pale birch-cork board. Dark: slate felt board under a cooler lamp. Mono: grey felt, paper-white notes.
      light: { bg: "#ead9b5", board: { base: "#e3cfa6", dark: "#b99a68", light: "#f3e6c7", pit: "#9a7a48" }, dim: "rgba(60,40,10,0.05)", accent: "#cf3a2e" },
      dark: { bg: "#2b3040", board: { base: "#2c3141", dark: "#1a1e29", light: "#444c61", pit: "#12151d" }, dim: "rgba(5,8,20,0.16)", ink: "#23262f", accent: "#e0402f", yarn: "#e0504a", gridInk: "#6f93b8" },
      mono: { bg: "#bdbcb6", board: { base: "#b7b6b0", dark: "#8d8c86", light: "#d4d3cd", pit: "#6b6a65" }, notes: ["#f6f6f2", "#e0e0da", "#cdcdc7", "#ebebe5", "#d6d6d0", "#c2c2bc"], paper: "#f8f8f4", accent: "#2f2f2f", onAccent: "#f8f8f4", pens: { blue: "#4a4a4a", green: "#3a3a3a" }, yarn: "#4a4a4a", tapeColor: "#e6e6e0", gridInk: "#8a8a86", dim: "rgba(20,20,20,0.08)" },
    },
    css: (accent) => `
      #root .display, #root .kicker { text-shadow: none; }
      #root .kicker { font-family: ${HAND}; font-weight: 700; letter-spacing: 0.03em; text-transform: none; font-size: 4.3vmin !important; color: ${accent}; }
      #root .display { line-height: 1.08; }
      #root .statement { align-items: center; text-align: center; }
    `,
    textShadow: () => "none",
    backdrop: (accent, texture, look) => look.board.base,
    paint: paintOverlay,
    stage(ctx, S, info) {
      FR = { index: Math.max(0, info.index), info };
      const W = S.W, Wp = W * PAN, T = info.t, idx = FR.index;
      let cam = idx * Wp;
      if (idx > 0 && info.local < info.change) cam = (idx - 1) * Wp + eio(info.local / Math.max(0.01, info.change)) * Wp;
      if (S.paint) {
        board(ctx, S, cam, T);
        // Whoosh streaks while the camera pans.
        if (idx > 0 && info.local < info.change) {
          const k = Math.sin(clamp(info.local / Math.max(0.01, info.change)) * Math.PI);
          ctx.save(); ctx.globalAlpha = 0.25 * k; ctx.strokeStyle = "#fff"; ctx.lineCap = "round";
          for (let i = 0; i < 14; i++) { const y = hs(i, 8) * S.H, x = hs(i, 9) * W - eio(info.local / info.change) * W * 0.3; ctx.lineWidth = (2 + hs(i, 3) * 5) * S.u; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (200 + hs(i, 5) * 300) * S.u, y); ctx.stroke(); }
          ctx.restore();
        }
      }
      if (info.scene) { hero(ctx, S, info); banner(ctx, S, info); sticker(ctx, S, info); }
    },
    scenes: {
      chart: chartScene, object: objectScene, people: peopleScene, process: processScene, compare: compareScene,
    },
  };
});
