// Marbling: Ebru paper marbling on a size bath. The frame is one tray of floated pigment laid on
// laid paper. It is built the way a marbler builds a sheet: drops of many sizes land one after
// another and each pushes every earlier ring outward (the exact drop transform); sprinkles make
// stone areas; a back-and-forth rake and a fine comb pull a feathered band with tapering tails; a
// stylus drags two long strokes through the stones. While the video plays, new drops keep landing
// and pushing the field, and every scene change is a real comb drawn across the tray: it rakes the
// bath and carries the next scene in behind it. Objects are filled with their own drop-ring
// marbling, pulled by a comb that keeps moving through each hold.
// Every frame is a pure function of time: seeded rng only, no clocks.
window.DreamcutMotion.register("marbling", ({ rng }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const eo = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const quint = (v) => 1 - Math.pow(1 - clamp(v), 5);
  const p2in = (v) => clamp(v) * clamp(v);
  const sstep = (v) => { const x = clamp(v); return x * x * (3 - 2 * x); };
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const mod = (a, n) => ((a % n) + n) % n;
  const M = () => window.DreamcutMotion;
  // The exact tine-line falloff λ/(d+λ), shifted so it reaches zero halfway to the next tine.
  const tine = (d, lam, half) => { const z = lam / (half + lam); return Math.max(0, (lam / (d + lam) - z) / (1 - z)); };

  // ---- colour ----------------------------------------------------------------------------------
  function rgb(value) {
    const s = String(value || "");
    if (s[0] === "#") {
      const h = s.length === 4 ? s.slice(1).split("").map((c) => c + c).join("") : s.slice(1, 7);
      const n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const m = s.match(/rgba?\(([^)]+)\)/);
    return m ? m[1].split(",").slice(0, 3).map(Number) : [30, 30, 60];
  }
  const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const hex = (c) => "#" + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");

  function theme(S) {
    const L = S.look;
    const P = L.pigments;
    const idx = [[0, 1, 4, 2], [2, 4, 5, 0], [1, 3, 4, 6], [5, 0, 4, 1], [3, 1, 4, 7], [7, 4, 2, 5]];
    const acc = S.accent;
    const accD = hex(mixc(rgb(acc), [20, 10, 30], 0.35));
    return {
      u: S.u, P, ink: L.ink, inkC: rgb(L.ink), paper: L.paper, cream: L.cream, acc, ground: L.ground, tex: L.texture ?? 1,
      sets: idx.map((a) => a.map((i) => P[i % P.length])),
      hot: [acc, L.cream, P[1], accD],
      brass: ["#7d5d22", "#e2c57c", "#a8833a"],
    };
  }

  // ---- buffers ---------------------------------------------------------------------------------
  const BUF = {};
  function buf(key, w, h) {
    let c = BUF[key];
    if (!c) c = BUF[key] = document.createElement("canvas");
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return c;
  }

  // ---- scene timing (read from the controls so the bath knows when the comb passes) -------------
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  const DEF = { title: 2.4, chart: 3.4, object: 3.6, people: 3.2, process: 3.6, compare: 3.2, closing: 2.4 };
  const ctl = () => (window.__dreamcut && window.__dreamcut.controls) || {};
  function sceneTimes() {
    const c = ctl();
    let t = 0;
    const starts = [];
    for (const id of ORDER) { const h = Number(c[id + "_hold"] ?? DEF[id]); if (h > 0) { starts.push({ id, t, h }); t += h; } }
    return { starts, length: t, change: Number(c.change ?? 0.45) };
  }
  function isLast(id) {
    const c = ctl();
    for (let j = ORDER.indexOf(id) + 1; j < ORDER.length; j++) if (Number(c[ORDER[j] + "_hold"] ?? DEF[ORDER[j]]) > 0) return false;
    return true;
  }
  // Where the comb is, 0→1 across the change.
  // It eases out like the headline's own wipe, so the comb always leads the incoming words.
  const combX = (S, p) => -0.03 * S.W + 1.12 * S.W * eo(p);
  const RSP = 104, RA = 118, RL = 13;
  const rakeOff = (u, idx) => (idx % 2) * RSP * u * 0.5 + 22 * u;

  // ---- the static sheet --------------------------------------------------------------------------
  const WORLD = { key: "" };
  function world(S) {
    const L = S.look;
    const key = [S.W, S.H, L.ground, L.pigments.join(",")].join("|");
    if (WORLD.key === key) return WORLD;
    const r = rng(5417), u = S.u, W = S.W, H = S.H, NP = L.pigments.length, tall = H > W;
    const WT = [3, 2.5, 2.1, 1.0, 1.5, 1.3, 0.9, 0.3];
    const WS = WT.slice(0, NP).reduce((a, b) => a + b, 0);
    const pick = (not, neutral = 0.2) => {
      for (let g = 0; g < 30; g++) {
        let i;
        if (r() < neutral) i = -1;
        else { let v = r() * WS; i = 0; while (i < NP - 1 && v > (WT[i] ?? 1)) { v -= WT[i] ?? 1; i++; } }
        if (i !== not) return i;
      }
      return 0;
    };
    const gauss = () => (r() + r() + r() - 1.5) / 1.5;
    const drops = [];
    const nPts = (R) => Math.max(12, Math.min(170, Math.round((TAU * R) / (7 * u))));
    // Large stones: a drop, then smaller drops in its middle, each pushing the last outward.
    const nA = Math.round((W * H) / (300 * 300 * u * u));
    for (let i = 0; i < nA; i++) {
      const cx = -0.08 * W + r() * 1.16 * W, cy = -0.08 * H + r() * 1.16 * H;
      let R = (85 + r() * 140) * u, c = -2;
      const nr = 2 + Math.floor(r() * 3);
      for (let k = 0; k < nr; k++) { c = pick(c, k === 0 ? 0.12 : 0.24); drops.push({ cx, cy, r: R, c }); R *= 0.5 + r() * 0.28; }
    }
    // Medium drops between them.
    for (let i = 0; i < nA * 3; i++) {
      const cx = -0.06 * W + r() * 1.12 * W, cy = -0.06 * H + r() * 1.12 * H;
      let R = (18 + Math.pow(r(), 2) * 75) * u, c = -2;
      const nr = 1 + Math.floor(r() * 2.5);
      for (let k = 0; k < nr; k++) { c = pick(c, 0.22); drops.push({ cx, cy, r: R, c }); R *= 0.5 + r() * 0.2; }
    }
    // Stone sprinkles: flicked from a brush in clusters, plus a scatter.
    const spr = [0, 6, 1, 4, 2, -1];
    for (let k = 0; k < 7; k++) {
      const kx = r() * W, ky = r() * H;
      for (let i = 0; i < 46; i++) drops.push({ cx: kx + gauss() * 150 * u, cy: ky + gauss() * 110 * u, r: (3 + r() * 9) * u, c: spr[Math.floor(r() * spr.length)] });
    }
    for (let i = 0; i < 170; i++) drops.push({ cx: r() * W, cy: r() * H, r: (2.5 + r() * 6) * u, c: spr[Math.floor(r() * spr.length)] });
    const polys = [];
    for (const dr of drops) {
      const r2 = dr.r * dr.r;
      for (const poly of polys) {
        const p = poly.pts;
        for (let i = 0; i < p.length; i += 2) {
          const dx = p[i] - dr.cx, dy = p[i + 1] - dr.cy;
          const f = Math.sqrt(1 + r2 / (dx * dx + dy * dy + 1e-6));
          p[i] = dr.cx + dx * f; p[i + 1] = dr.cy + dy * f;
        }
      }
      const n = nPts(dr.r), pts = [], ph = r() * TAU, wob = dr.r > 12 * u ? 0.03 : 0.08;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU, rr = dr.r * (1 + wob * Math.sin(3 * a + ph) + wob * 0.5 * Math.sin(7 * a + ph * 2));
        pts.push(dr.cx + Math.cos(a) * rr, dr.cy + Math.sin(a) * rr);
      }
      polys.push({ pts, c: dr.c, small: dr.r < 12 * u });
      // Long edges resampled as they stretch, so the later pulls stay smooth.
      if (polys.length % 60 === 0) for (const poly of polys) if (!poly.small) poly.pts = resample(poly.pts, 9 * u);
    }
    for (const poly of polys) if (!poly.small) poly.pts = resample(poly.pts, 8 * u);
    // The feathered band: a back-and-forth rake, then a fine comb, faded out toward the stones.
    const band = (x, y) => {
      const s = tall ? (y - H * 0.56) + (x - W * 0.5) * 0.35 : (y - H * 0.5) - (x - W * 0.5) * 0.3;
      return sstep(1 - Math.abs(s) / (H * (tall ? 0.15 : 0.25)));
    };
    const sp1 = 132 * u, sp2 = 36 * u;
    for (const poly of polys) {
      const p = poly.pts;
      for (let i = 0; i < p.length; i += 2) {
        let x = p[i], y = p[i + 1];
        let w = band(x, y);
        if (w > 0) {
          const k = Math.round(x / sp1 - 0.5), d = Math.abs(x - (k + 0.5) * sp1);
          y += (k & 1 ? 1 : -1) * 125 * u * w * tine(d, 24 * u, sp1 / 2);
        }
        w = band(x, y);
        if (w > 0) { const m = mod(y - 9 * u, sp2), d = Math.min(m, sp2 - m); x += 54 * u * w * tine(d, 4.5 * u, sp2 / 2); }
        p[i] = x; p[i + 1] = y;
      }
    }
    // Two stylus strokes dragged through the stones.
    const strokes = [
      Array.from({ length: 49 }, (_, i) => { const s = i / 48; return tall ? [W * (0.06 + 0.88 * s), H * (0.1 + 0.05 * Math.sin(s * TAU * 1.5))] : [W * (0.03 + 0.5 * s), H * (0.1 + 0.07 * Math.sin(s * TAU))]; }),
      Array.from({ length: 49 }, (_, i) => { const s = i / 48; return tall ? [W * (0.94 - 0.88 * s), H * (0.9 + 0.04 * Math.sin(s * TAU + 1))] : [W * (0.98 - 0.52 * s), H * (0.89 + 0.06 * Math.sin(s * TAU + 1))]; }),
    ];
    const reach = 150 * u;
    for (const st of strokes) {
      let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
      for (const [x, y] of st) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); }
      for (const poly of polys) {
        const p = poly.pts;
        for (let i = 0; i < p.length; i += 2) {
          const x = p[i], y = p[i + 1];
          if (x < bx0 - reach || x > bx1 + reach || y < by0 - reach || y > by1 + reach) continue;
          let best = 1e9, tx = 0, ty = 0;
          for (let s = 0; s < st.length - 1; s++) {
            const [ax, ay] = st[s], [bx, by] = st[s + 1], vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
            const q = clamp(((x - ax) * vx + (y - ay) * vy) / l2), qx = ax + vx * q - x, qy = ay + vy * q - y, dd = qx * qx + qy * qy;
            if (dd < best) { best = dd; const l = Math.sqrt(l2); tx = vx / l; ty = vy / l; }
          }
          const f = 120 * u * tine(Math.sqrt(best), 11 * u, reach);
          p[i] = x + tx * f; p[i + 1] = y + ty * f;
        }
      }
    }
    let maxLen = 8 * u, sub, total = 0;
    for (let tries = 0; tries < 5; tries++) {
      sub = polys.map((poly) => (poly.small ? poly.pts : resample(poly.pts, maxLen)));
      total = sub.reduce((s, a) => s + a.length / 2, 0);
      if (total < 95000) break;
      maxLen *= 1.35;
    }
    const coords = new Float32Array(total * 2), offs = [];
    let o = 0;
    sub.forEach((a) => { offs.push(o); coords.set(a, o * 2); o += a.length / 2; });
    offs.push(o);
    // Laid paper: laid lines, chain lines and tooth, tiled. Size mottling: a soft low-res cloud.
    const tw = Math.max(32, Math.round(88 * u)), tile = document.createElement("canvas");
    tile.width = tw; tile.height = tw;
    const tg = tile.getContext("2d"), tr = rng(61);
    tg.fillStyle = "#fff"; tg.fillRect(0, 0, tw, tw);
    const lsp = Math.max(2, 3.4 * u);
    for (let y = 0; y < tw; y += lsp) { tg.fillStyle = `rgba(92,70,40,${0.05 + tr() * 0.07})`; tg.fillRect(0, y, tw, Math.max(1, lsp * 0.42)); }
    tg.fillStyle = "rgba(92,70,40,0.16)"; tg.fillRect(tw * 0.5 - 1.2 * u, 0, 2.4 * u, tw);
    tg.fillStyle = "rgba(92,70,40,0.06)"; tg.fillRect(tw * 0.5 - 4 * u, 0, 8 * u, tw);
    const id = tg.getImageData(0, 0, tw, tw);
    for (let i = 0; i < id.data.length; i += 4) { const v = (tr() - 0.5) * 34; id.data[i] += v; id.data[i + 1] += v; id.data[i + 2] += v; }
    tg.putImageData(id, 0, 0);
    const mot = document.createElement("canvas");
    mot.width = 36; mot.height = 22;
    const mg = mot.getContext("2d"), mi = mg.createImageData(36, 22), mr = rng(77);
    for (let i = 0; i < mi.data.length; i += 4) { const v = 180 + mr() * 75; mi.data[i] = v; mi.data[i + 1] = v * 0.97; mi.data[i + 2] = v * 0.9; mi.data[i + 3] = 255; }
    mg.putImageData(mi, 0, 0);
    Object.assign(WORLD, { key, coords, offs, polys: polys.map((p) => ({ c: p.c })), tile, mot, out: new Float32Array(coords.length) });
    return WORLD;
  }
  function resample(p, len) {
    const out = [], n = p.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = p[2 * i], ay = p[2 * i + 1], bx = p[2 * j], by = p[2 * j + 1];
      out.push(ax, ay);
      const d = Math.hypot(bx - ax, by - ay);
      if (d > len) { const m = Math.min(40, Math.ceil(d / len)); for (let q = 1; q < m; q++) out.push(ax + ((bx - ax) * q) / m, ay + ((by - ay) * q) / m); }
    }
    return out;
  }

  // ---- what happens to the bath while the video plays ---------------------------------------------
  const EVT = { key: "" };
  function events(S) {
    const st = sceneTimes(), u = S.u, W = S.W, H = S.H, NP = S.look.pigments.length;
    const key = [W, H, st.length, st.change, st.starts.map((s) => s.id + s.t).join(","), NP].join("|");
    if (EVT.key === key) return EVT;
    const r = rng(911), list = [];
    const len = Math.max(st.length, 6);
    const WT = [3, 2.5, 2.1, 1.2, 1.5, 1.3, 0.9, 0.25];
    const pick = (not) => { for (let g = 0; g < 20; g++) { const i = r() < 0.18 ? -1 : Math.floor(r() * NP); if (i !== not && r() < (WT[i] ?? 1) / 3 + 0.2) return i; } return 0; };
    let t = 0.1, n = 0;
    while (t < len + 1) {
      const cx = W * (0.04 + r() * 0.92), cy = H * (0.06 + r() * 0.9);
      if (n % 3 !== 2) {
        let R = (46 + r() * 84) * u, c = -2;
        const nr = 1 + Math.floor(r() * 3);
        for (let k = 0; k < nr; k++) {
          c = pick(c);
          list.push({ type: "drop", t: t + k * 0.17, cx, cy, r: R, c, dur: 0.85, n: Math.max(16, Math.min(150, Math.round((TAU * R) / (7 * u)))) });
          R *= 0.52 + r() * 0.2;
        }
      } else {
        for (let k = 0; k < 8; k++) list.push({ type: "drop", t: t + k * 0.035, cx: cx + (r() - 0.5) * 200 * u, cy: cy + (r() - 0.5) * 140 * u, r: (4 + r() * 9) * u, c: [0, 6, 1, -1][Math.floor(r() * 4)], dur: 0.45, n: 14 });
      }
      n++;
      t += 0.3 + r() * 0.28;
    }
    st.starts.slice(1).forEach((s, i) => list.push({ type: "rake", t: s.t, dur: Math.max(0.05, st.change), idx: i + 1 }));
    list.sort((a, b) => a.t - b.t);
    let livePts = 0;
    for (const e of list) if (e.type === "drop") livePts += e.n;
    Object.assign(EVT, { key, list, live: new Float32Array(livePts * 2 + 2) });
    return EVT;
  }

  // The field at time t: the sheet, every drop that has landed and every comb that has passed.
  function field(S, t) {
    const Wd = world(S), E = events(S), u = S.u, W = S.W, H = S.H;
    const out = Wd.out, live = E.live;
    out.set(Wd.coords);
    const ns = out.length / 2;
    let nl = 0;
    const lpolys = [];
    for (const ev of E.list) {
      if (ev.t > t) break;
      const p = clamp((t - ev.t) / ev.dur);
      if (ev.type === "drop") {
        const R = ev.r * eo(p);
        if (R < 0.4) continue;
        const r2 = R * R, cx = ev.cx, cy = ev.cy, far = r2 * 900;
        const push = (arr, n) => {
          for (let i = 0; i < n; i++) {
            const dx = arr[2 * i] - cx, dy = arr[2 * i + 1] - cy, d2 = dx * dx + dy * dy;
            if (d2 > far) continue;
            const f = Math.sqrt(1 + r2 / (d2 + 1e-6));
            arr[2 * i] = cx + dx * f; arr[2 * i + 1] = cy + dy * f;
          }
        };
        push(out, ns); push(live, nl);
        const a0 = nl;
        for (let k = 0; k < ev.n; k++) { const a = (k / ev.n) * TAU; live[2 * nl] = cx + Math.cos(a) * R; live[2 * nl + 1] = cy + Math.sin(a) * R; nl++; }
        lpolys.push({ a: a0, b: nl, c: ev.c });
      } else {
        const cxp = combX(S, p), sp = RSP * u, off = rakeOff(u, ev.idx), A = RA * u, lam = RL * u, ramp = 90 * u;
        const rake = (arr, n) => {
          for (let i = 0; i < n; i++) {
            const x = arr[2 * i];
            const passed = (cxp - x) / ramp;
            if (passed <= 0) continue;
            const m = mod(arr[2 * i + 1] - off, sp), d = Math.min(m, sp - m);
            arr[2 * i] = x + A * tine(d, lam, sp / 2) * Math.min(1, passed);
          }
        };
        rake(out, ns); rake(live, nl);
      }
    }
    // The bath never rests: a slow eddy and a long swell.
    const sx = W * (0.5 + 0.3 * Math.sin(0.21 * t)), sy = H * (0.5 + 0.25 * Math.cos(0.17 * t + 1)), sig = 0.24 * Math.min(W, H), s2 = 2 * sig * sig;
    const kap = 0.75 * Math.sin(0.33 * t + 0.8), wa = 0.011 * H, wl = 0.4 * H, wp = t * 1.25;
    const amb = (arr, n) => {
      for (let i = 0; i < n; i++) {
        let x = arr[2 * i], y = arr[2 * i + 1];
        const dx = x - sx, dy = y - sy, r2 = dx * dx + dy * dy;
        if (r2 < 12 * sig * sig) { const a = kap * Math.exp(-r2 / s2), c = Math.cos(a), s = Math.sin(a); x = sx + dx * c - dy * s; y = sy + dx * s + dy * c; }
        y += wa * Math.sin((x * TAU) / wl + wp);
        x += wa * 0.6 * Math.sin((y * TAU) / (wl * 1.3) + wp * 1.2);
        arr[2 * i] = x; arr[2 * i + 1] = y;
      }
    };
    amb(out, ns); amb(live, nl);
    return { Wd, out, live, lpolys };
  }

  const SC = 0.62;
  function drawWorld(ctx, S, t) {
    const { W, H, u } = S, L = S.look, th = theme(S);
    const F = field(S, t), Wd = F.Wd;
    const wb = buf("world", W * SC, H * SC), g = wb.getContext("2d");
    g.setTransform(SC, 0, 0, SC, 0, 0);
    g.fillStyle = L.ground; g.fillRect(0, 0, W, H);
    g.lineJoin = "round";
    const hair = rgba(th.inkC, 0.42);
    g.lineWidth = 1.15 * u; g.strokeStyle = hair;
    const P = L.pigments;
    const path = (arr, a, b) => { g.beginPath(); g.moveTo(arr[2 * a], arr[2 * a + 1]); for (let i = a + 1; i < b; i++) g.lineTo(arr[2 * i], arr[2 * i + 1]); g.closePath(); };
    for (let pi = 0; pi < Wd.polys.length; pi++) {
      const c = Wd.polys[pi].c;
      path(F.out, Wd.offs[pi], Wd.offs[pi + 1]);
      g.fillStyle = c < 0 ? L.ground : P[c % P.length]; g.fill(); g.stroke();
    }
    for (const lp of F.lpolys) { path(F.live, lp.a, lp.b); g.fillStyle = lp.c < 0 ? L.ground : P[lp.c % P.length]; g.fill(); g.stroke(); }
    ctx.save();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(wb, 0, 0, W, H);
    const tex = th.tex;
    if (tex > 0) {
      // Size mottling and laid paper show through the pigment.
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = 0.5 * tex; ctx.drawImage(Wd.mot, 0, 0, W, H);
      ctx.globalAlpha = 0.85 * tex; ctx.fillStyle = ctx.createPattern(Wd.tile, "repeat"); ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.globalAlpha = 1;
    // A faint wet sheen drifts across the bath.
    const gx = ((t * 0.05) % 1.6 - 0.3) * W;
    const lg = ctx.createLinearGradient(gx - W * 0.35, 0, gx + W * 0.35, H * 0.5);
    lg.addColorStop(0, "rgba(255,248,230,0)"); lg.addColorStop(0.5, "rgba(255,248,230,0.1)"); lg.addColorStop(1, "rgba(255,248,230,0)");
    ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    vg.addColorStop(0, "rgba(40,28,10,0)"); vg.addColorStop(1, `rgba(40,28,10,${0.22 * (0.4 + 0.6 * tex)})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // ---- drop-ring marbling for objects -------------------------------------------------------------
  const MINI = new Map();
  function miniGeom(seed, gw, gh, u, nc, dens) {
    const key = [seed, gw, gh, nc, dens].join("|");
    let G = MINI.get(key);
    if (G) return G;
    const r = rng(seed * 7919 + 13);
    const cell = Math.max(24 * u, Math.min(gw, gh) * dens);
    const cols = Math.ceil(gw / cell) + 1, rows = Math.ceil(gh / cell) + 1;
    const centers = [];
    for (let iy = 0; iy < rows; iy++) for (let ix = 0; ix < cols; ix++) centers.push([(ix + (r() - 0.5) * 0.8) * cell, (iy + (r() - 0.5) * 0.8) * cell]);
    for (let i = centers.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [centers[i], centers[j]] = [centers[j], centers[i]]; }
    const drops = [];
    const pick = (not) => { for (let g = 0; g < 20; g++) { const i = r() < 0.16 ? -1 : Math.floor(r() * nc); if (i !== not) return i; } return 0; };
    for (const [cx, cy] of centers) {
      let R = cell * (0.42 + r() * 0.4), c = -2;
      const nr = 2 + Math.floor(r() * 2.4);
      for (let k = 0; k < nr; k++) { c = pick(c); drops.push({ cx, cy, r: R, c }); R *= 0.5 + r() * 0.22; }
    }
    const nd = Math.round(cols * rows * 1.4);
    for (let i = 0; i < nd; i++) drops.push({ cx: r() * gw, cy: r() * gh, r: (2.2 + r() * 4.5) * u, c: pick(-2) });
    const polys = [];
    for (const dr of drops) {
      const r2 = dr.r * dr.r;
      for (const p of polys) for (let i = 0; i < p.pts.length; i += 2) {
        const dx = p.pts[i] - dr.cx, dy = p.pts[i + 1] - dr.cy, f = Math.sqrt(1 + r2 / (dx * dx + dy * dy + 1e-6));
        p.pts[i] = dr.cx + dx * f; p.pts[i + 1] = dr.cy + dy * f;
      }
      const n = Math.max(12, Math.min(90, Math.round((TAU * dr.r) / (5 * u)))), pts = [], ph = r() * TAU;
      for (let k = 0; k < n; k++) { const a = (k / n) * TAU, rr = dr.r * (1 + 0.05 * Math.sin(3 * a + ph) + 0.03 * Math.sin(6 * a + ph * 1.7)); pts.push(dr.cx + Math.cos(a) * rr, dr.cy + Math.sin(a) * rr); }
      polys.push({ pts, c: dr.c });
    }
    const sub = polys.map((p) => resample(p.pts, 6 * u)), total = sub.reduce((s, a) => s + a.length / 2, 0);
    const coords = new Float32Array(total * 2), offs = [];
    let o = 0;
    sub.forEach((a) => { offs.push(o); coords.set(a, o * 2); o += a.length / 2; });
    offs.push(o);
    G = { coords, offs, cs: polys.map((p) => p.c), out: new Float32Array(total * 2) };
    if (MINI.size > 260) MINI.clear();
    MINI.set(key, G);
    return G;
  }
  // Fill (x,y,w,h) with marbling. o: colors, seed, style (bouquet | chevron | feather | stone),
  // pull 0..1, t, gw/gh (fixed pattern size while the shape grows), anchor "bottom", axis "x",
  // drops [{x, y, r, cols}] in pattern coordinates that land and push the pattern.
  function miniMarble(ctx, th, x, y, w, h, o) {
    if (w < 2 || h < 2) return;
    const u = th.u, q8 = 6 * u;
    const gw = Math.max(q8, Math.ceil((o.gw || w) / q8) * q8), gh = Math.max(q8, Math.ceil((o.gh || h) / q8) * q8);
    const cols = o.colors, nc = cols.length;
    const G = miniGeom(o.seed || 1, Math.round(gw), Math.round(gh), u, nc, o.dens || 0.5);
    const ox = x, oy = o.anchor === "bottom" ? y + h - gh : y;
    const src = G.coords, out = G.out, n = src.length / 2;
    const t = o.t || 0, pull = o.pull ?? 0.5, style = o.style || "bouquet", ax = o.axis === "x";
    const along = ax ? gw : gh, across = ax ? gh : gw;
    const sp = across / (o.tines || 3), ph = (o.phase || 0) * sp;
    const A = pull * along * 0.42;
    const sp1 = along / 2.6, sp2 = across / 7;
    for (let i = 0; i < n; i++) {
      let px = src[2 * i], py = src[2 * i + 1];
      px += 1.5 * u * Math.sin(py * 0.05 + t * 1.2); py += 1.5 * u * Math.sin(px * 0.045 - t * 0.9);
      let a = ax ? py : px, b = ax ? px : py;
      if (style === "bouquet") {
        let m = mod(a - ph, sp), d = Math.min(m, sp - m);
        b += (ax ? 1 : -1) * A * tine(d, sp * 0.1, sp / 2);
        m = mod(a - ph - sp / 2, sp); d = Math.min(m, sp - m);
        b -= (ax ? 1 : -1) * A * 0.32 * tine(d, sp * 0.07, sp / 2);
      } else if (style === "chevron" || style === "feather") {
        let m = mod(b - ph, sp1), d = Math.min(m, sp1 - m);
        const k = Math.round((b - ph) / sp1);
        a += (k & 1 ? 1 : -1) * pull * across * 0.09 * tine(d, sp1 * 0.18, sp1 / 2);
        const s2 = style === "feather" ? sp2 * 0.6 : sp2;
        m = mod(a - ph * 0.5, s2); d = Math.min(m, s2 - m);
        b += pull * along * (style === "feather" ? 0.12 : 0.2) * tine(d, s2 * 0.08, s2 / 2);
      }
      out[2 * i] = ax ? b : a; out[2 * i + 1] = ax ? a : b;
    }
    // Drops landing on the pattern push it aside.
    const dps = [];
    for (const dr of o.drops || []) {
      if (dr.r < 0.5) continue;
      const r2 = dr.r * dr.r;
      const push = (arr, m) => { for (let i = 0; i < m; i++) { const dx = arr[2 * i] - dr.x, dy = arr[2 * i + 1] - dr.y, f = Math.sqrt(1 + r2 / (dx * dx + dy * dy + 1e-6)); arr[2 * i] = dr.x + dx * f; arr[2 * i + 1] = dr.y + dy * f; } };
      push(out, n);
      for (const q of dps) push(q.pts, q.pts.length / 2);
      const m = 40, pts = new Float32Array(m * 2);
      for (let k = 0; k < m; k++) { const a = (k / m) * TAU; pts[2 * k] = dr.x + Math.cos(a) * dr.r; pts[2 * k + 1] = dr.y + Math.sin(a) * dr.r; }
      dps.push({ pts, c: dr.c });
    }
    ctx.save();
    ctx.translate(ox, oy);
    ctx.fillStyle = o.ground || th.ground; ctx.fillRect(-2, -2, gw + 4, gh + 4);
    ctx.lineJoin = "round"; ctx.lineWidth = Math.max(0.8, 1 * u); ctx.strokeStyle = rgba(th.inkC, 0.45);
    for (let pi = 0; pi < G.cs.length; pi++) {
      const a = G.offs[pi], b = G.offs[pi + 1], c = G.cs[pi];
      ctx.beginPath(); ctx.moveTo(out[2 * a], out[2 * a + 1]);
      for (let i = a + 1; i < b; i++) ctx.lineTo(out[2 * i], out[2 * i + 1]);
      ctx.closePath(); ctx.fillStyle = c < 0 ? o.ground || th.ground : cols[c % nc]; ctx.fill(); ctx.stroke();
    }
    for (const q of dps) {
      ctx.beginPath(); ctx.moveTo(q.pts[0], q.pts[1]);
      for (let i = 1; i < q.pts.length / 2; i++) ctx.lineTo(q.pts[2 * i], q.pts[2 * i + 1]);
      ctx.closePath(); ctx.fillStyle = q.c; ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
  // A drop that has been landing since `t0`: outer colour first, the next colour inside it, and so on.
  function landing(list, t, t0, x, y, R, colors, gap = 0.16, dur = 0.8) {
    colors.forEach((c, k) => { const z = (t - t0 - k * gap) / dur; if (z > 0) list.push({ x, y, r: R * Math.pow(0.6, k) * eo(z), c }); });
  }

  // ---- paper, tags, outlines ----------------------------------------------------------------------
  function deckle(ctx, x, y, w, h, seed, amp, step) {
    const hash = (i) => { const s = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453; return s - Math.floor(s) - 0.5; };
    let i = 0;
    const c = amp * 2.6;
    ctx.beginPath();
    ctx.moveTo(x + c, y + hash(i++) * amp);
    for (let px = x + c + step; px < x + w - c; px += step) ctx.lineTo(px, y + hash(i++) * amp);
    ctx.lineTo(x + w, y + c);
    for (let py = y + c + step; py < y + h - c; py += step) ctx.lineTo(x + w + hash(i++) * amp, py);
    ctx.lineTo(x + w - c, y + h);
    for (let px = x + w - c - step; px > x + c; px -= step) ctx.lineTo(px, y + h + hash(i++) * amp);
    ctx.lineTo(x, y + h - c);
    for (let py = y + h - c - step; py > y + c; py -= step) ctx.lineTo(x + hash(i++) * amp, py);
    ctx.closePath();
  }
  function rrPath(ctx, x, y, w, h, r) {
    const q = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + q, y); ctx.arcTo(x + w, y, x + w, y + h, q); ctx.arcTo(x + w, y + h, x, y + h, q);
    ctx.arcTo(x, y + h, x, y, q); ctx.arcTo(x, y, x + w, y, q); ctx.closePath();
  }
  function topRound(ctx, x, y, w, h, r) {
    const q = Math.min(r, w / 2, h);
    ctx.beginPath();
    ctx.moveTo(x, y + h); ctx.lineTo(x, y + q); ctx.arcTo(x, y, x + q, y, q); ctx.lineTo(x + w - q, y); ctx.arcTo(x + w, y, x + w, y + q, q); ctx.lineTo(x + w, y + h); ctx.closePath();
  }
  function shadowOn(ctx, th, k = 1) { ctx.shadowColor = "rgba(40,26,8,0.4)"; ctx.shadowBlur = 18 * th.u * k; ctx.shadowOffsetY = 7 * th.u * k; }
  function shadowOff(ctx) { ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }

  // Fill whatever path pathFn builds with marbling, then edge it in paper and a hairline.
  function marbled(ctx, th, pathFn, x, y, w, h, o, edge = 5) {
    if (w <= 1 || h <= 1) return;
    const u = th.u;
    ctx.save(); pathFn(); shadowOn(ctx, th, 0.8); ctx.fillStyle = th.cream; ctx.fill(); shadowOff(ctx); ctx.restore();
    ctx.save(); pathFn(); ctx.clip(); miniMarble(ctx, th, x, y, w, h, o); ctx.restore();
    ctx.save(); pathFn(); ctx.lineWidth = edge * u; ctx.strokeStyle = th.cream; ctx.lineJoin = "round"; ctx.stroke();
    pathFn(); ctx.lineWidth = 1.4 * u; ctx.strokeStyle = rgba(th.inkC, 0.55); ctx.stroke(); ctx.restore();
  }
  // A floating drop: nested rings with a breathing edge.
  function rings(ctx, th, cx, cy, r, cols, t, o = {}) {
    const n = cols.length, seed = o.seed || 0;
    for (let k = 0; k < n; k++) {
      const rk = r * (1 - (k / n) * 0.8), wob = 0.045 * (1 + k * 0.5);
      ctx.beginPath();
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * TAU;
        const rad = rk * (1 + wob * Math.sin(3 * a + t * 0.9 + k * 1.3 + seed) + wob * 0.6 * Math.sin(5 * a - t * 0.7 + k + seed * 2));
        const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      if (k === 0 && o.shadow !== false) { ctx.save(); shadowOn(ctx, th, 0.8); ctx.fillStyle = cols[0]; ctx.fill(); ctx.restore(); }
      ctx.fillStyle = cols[k]; ctx.fill();
      ctx.lineWidth = Math.max(1, (k === 0 ? 3 : 1.2) * th.u); ctx.strokeStyle = k === 0 ? th.cream : rgba(th.inkC, 0.4); ctx.stroke();
    }
  }
  // A filled drop-ring halo that breathes behind a highlighted thing.
  function halo(ctx, th, cx, cy, r, t, a = 1) {
    if (a <= 0.01) return;
    ctx.save(); ctx.globalAlpha *= a;
    rings(ctx, th, cx, cy, r * (1 + 0.04 * Math.sin(t * 2.1)), [th.acc, th.cream, th.P[1], th.cream], t * 0.8, { seed: 3.1 });
    ctx.restore();
  }

  // A deckled paper tag; y is its vertical centre. It drops in whole (never clipped) and stays in frame.
  function tag(ctx, S, th, str, x, y, size, o = {}) {
    const u = th.u, L = S.look;
    ctx.save();
    ctx.font = `${o.weight || 700} ${size}px ${o.fam === "figures" ? L.figures : o.fam === "display" ? L.display : L.body}`;
    const tw = ctx.measureText(String(str)).width, padX = (o.padX ?? 0.5) * size, h = size * 1.4, w = tw + padX * 2;
    let bx = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    bx = Math.max(16 * u, Math.min(S.W - 16 * u - w, bx));
    const by = y - h / 2;
    const q = o.q ?? 1;
    const R = { x: bx, y: by, w, h };
    if (q <= 0.01) { ctx.restore(); return R; }
    ctx.globalAlpha *= sstep(q * 1.5);
    const e = eo(q);
    ctx.translate(o.dx || 0, (o.dy || 0) + (1 - e) * 22 * u);
    const sc = 0.92 + 0.08 * e;
    ctx.translate(bx + w / 2, y); ctx.scale(sc, sc); ctx.translate(-(bx + w / 2), -y);
    const seed = (String(str).length * 7 + Math.round(bx / 40)) % 97;
    ctx.save();
    deckle(ctx, bx, by, w, h, seed, 1.7 * u, 11 * u); shadowOn(ctx, th, 0.9);
    ctx.fillStyle = o.fill || th.paper; ctx.fill(); shadowOff(ctx);
    ctx.restore();
    ctx.lineWidth = 1.6 * u; ctx.strokeStyle = o.line || rgba(th.inkC, 0.32);
    ctx.beginPath(); ctx.rect(bx + 5 * u, by + 5 * u, w - 10 * u, h - 10 * u); ctx.stroke();
    ctx.fillStyle = o.color || th.ink; ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.fillText(String(str), bx + padX, y + size * 0.04);
    ctx.restore();
    return R;
  }

  // ---- text plates under the DOM headlines ------------------------------------------------------
  const PLATES = {};
  function lineWidth(ctx, el, cs, size, text, maxW) {
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${size}px ${cs.fontFamily}`;
    const track = parseFloat(cs.letterSpacing) || 0;
    const words = String(text).split(/\s+/).filter(Boolean);
    let line = "", best = 0, lines = 1;
    for (const w of words) {
      const next = line ? line + " " + w : w;
      if (line && ctx.measureText(next).width + track * next.length > maxW) { best = Math.max(best, ctx.measureText(line).width + track * line.length); line = w; lines++; } else line = next;
    }
    best = Math.max(best, ctx.measureText(line).width + track * line.length);
    return { w: lines > 1 ? maxW : Math.min(maxW, best), lines };
  }
  function plateRect(ctx, S, id) {
    const key = id + "|" + S.W + "|" + S.H;
    if (PLATES[key]) return PLATES[key];
    const scene = document.getElementById(`${id}-scene`);
    if (!scene) return null;
    const statement = id === "title" || id === "closing";
    const head = document.getElementById(statement ? id : `${id}-title`);
    if (!head) return null;
    const cs = getComputedStyle(head), size = parseFloat(cs.fontSize);
    ctx.save();
    const hw = lineWidth(ctx, head, cs, size, head.textContent, head.clientWidth || S.W);
    let x = scene.offsetLeft + head.offsetLeft, y = scene.offsetTop + head.offsetTop, w = hw.w, h = head.offsetHeight;
    if (id === "title") {
      const k = document.getElementById("kicker"), kc = getComputedStyle(k), ks = parseFloat(kc.fontSize);
      const kw = lineWidth(ctx, k, kc, ks, String(k.textContent).toUpperCase(), k.clientWidth || S.W).w;
      y = scene.offsetTop + k.offsetTop; h = head.offsetTop + head.offsetHeight - k.offsetTop; w = Math.max(w, kw);
    }
    ctx.restore();
    return (PLATES[key] = { x, y, w: w * 1.03, h, ew: head.clientWidth || S.W - 2 * x });
  }
  function drawPlate(ctx, S, th, info) {
    if (!info.scene) return;
    const r = plateRect(ctx, S, info.scene);
    if (!r) return;
    const u = th.u, e = Number(ctl().entrance ?? 0.7);
    const statement = info.scene === "title" || info.scene === "closing";
    // The reveal edge rides just behind the headline's own wipe; the exit follows its left-to-right wipe out.
    const E = quint((info.local - (info.scene === "title" ? 0.12 : 0)) / Math.max(0.05, e));
    let Z = 0;
    if (info.next && info.local > info.hold - info.change) Z = p2in((info.local - (info.hold - info.change)) / info.change);
    if (E <= 0.001 || Z >= 0.999) return;
    const px = 60 * u, py = 30 * u, x = r.x - px, y = r.y - py, w = r.w + px * 2, h = r.h + py * 2;
    ctx.save();
    if (statement) {
      // Calm the bath behind a statement so the line carries.
      ctx.save(); ctx.globalAlpha = 0.72 * eo(info.local / 0.5) * (1 - Z);
      ctx.translate(x + w / 2, y + h / 2); ctx.scale(1, (h * 1.9) / (w * 1.3));
      const vg = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.68);
      const gc = rgb(th.ground);
      vg.addColorStop(0, rgba(gc, 1)); vg.addColorStop(0.62, rgba(gc, 0.85)); vg.addColorStop(1, rgba(gc, 0));
      ctx.fillStyle = vg; ctx.beginPath(); ctx.arc(0, 0, w * 0.68, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.translate(-36 * u * (1 - E) + 60 * u * Z, 0);
    const right = r.x + r.ew * E + 16 * u, left = x - 40 * u + (r.ew + px + 40 * u) * Z;
    ctx.beginPath(); ctx.rect(Math.max(x - 40 * u, left), y - 60 * u, Math.max(0, Math.min(x + w + 40 * u, right) - Math.max(x - 40 * u, left)), h + 120 * u); ctx.clip();
    deckle(ctx, x, y, w, h, 7, 2.2 * u, 13 * u);
    shadowOn(ctx, th, 1.4); ctx.fillStyle = th.paper; ctx.fill(); shadowOff(ctx);
    ctx.save(); deckle(ctx, x, y, w, h, 7, 2.2 * u, 13 * u); ctx.clip();
    miniMarble(ctx, th, x, y, 22 * u, h, { colors: th.hot.concat(th.sets[0]), seed: 41, style: "bouquet", tines: 1.4, pull: 0.25 + 0.12 * Math.sin(info.t * 0.9), t: info.t, dens: 0.9 });
    ctx.restore();
    ctx.lineWidth = 1.8 * u; ctx.strokeStyle = rgba(th.inkC, 0.4);
    ctx.beginPath(); ctx.rect(x + 30 * u, y + 9 * u, w - 39 * u, h - 18 * u); ctx.stroke();
    ctx.restore();
  }

  // ---- the marbler's comb: a brass rail of needles drawn across the tray at every scene change -------
  function comb(ctx, S, th, x, idx) {
    const { W, H, u } = S;
    if (x < -80 * u || x > W + 80 * u) return;
    const sp = RSP * u, off = rakeOff(u, idx);
    ctx.save();
    // Needle wakes: thin pale tails trailing behind each tine.
    for (let y = off - sp * 2; y < H + sp; y += sp) {
      const wg = ctx.createLinearGradient(x - 170 * u, 0, x, 0);
      wg.addColorStop(0, "rgba(255,248,230,0)"); wg.addColorStop(1, "rgba(255,248,230,0.8)");
      ctx.fillStyle = wg; ctx.beginPath(); ctx.moveTo(x - 170 * u, y); ctx.quadraticCurveTo(x - 60 * u, y - 4 * u, x, y - 5 * u); ctx.lineTo(x, y + 5 * u); ctx.quadraticCurveTo(x - 60 * u, y + 4 * u, x - 170 * u, y); ctx.fill();
    }
    const g = ctx.createLinearGradient(x - 14 * u, 0, x + 14 * u, 0);
    g.addColorStop(0, th.brass[0]); g.addColorStop(0.45, th.brass[1]); g.addColorStop(1, th.brass[2]);
    shadowOn(ctx, th, 1.3);
    rrPath(ctx, x - 13 * u, -30 * u, 26 * u, H + 60 * u, 10 * u); ctx.fillStyle = g; ctx.fill();
    shadowOff(ctx);
    ctx.fillStyle = "rgba(255,250,228,0.55)"; ctx.fillRect(x - 6 * u, -30 * u, 3 * u, H + 60 * u);
    for (let y = off - sp * 2; y < H + sp; y += sp) {
      ctx.beginPath(); ctx.arc(x, y, 6 * u, 0, TAU); ctx.fillStyle = "#2a2014"; ctx.fill();
      ctx.beginPath(); ctx.arc(x - 1.5 * u, y - 1.5 * u, 2 * u, 0, TAU); ctx.fillStyle = th.brass[1]; ctx.fill();
    }
    ctx.restore();
  }

  // ---- stage -------------------------------------------------------------------------------------
  let STAGE = { index: 0 };
  function stage(ctx, S, info) {
    STAGE = info;
    const th = theme(S);
    if (S.paint) drawWorld(ctx, S, info.t);
    drawPlate(ctx, S, th, info);
  }
  // Standalone texture canvas for templates that do not draw their own stage.
  function paintStandalone(ctx, W, H, t, accent, look) {
    ctx.clearRect(0, 0, W, H);
    if (document.getElementById("art")) return;
    drawWorld(ctx, { W, H, u: Math.min(W, H) / 1080, look, accent }, t);
  }

  // ---- scene compositor: each scene arrives behind the comb and the comb shoves the last one out ------
  function wrap(id, fn) {
    return (ctx, S, box, p, d, info) => {
      const th = theme(S), { W, H, u } = S;
      const sb = buf("scene", W, H), g = sb.getContext("2d");
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.clearRect(0, 0, W, H);
      const leaving = info.exit !== undefined;
      fn(g, S, th, box, d, { t: info.t, local: info.local, hold: info.hold, change: info.change, u, last: isLast(id) });
      const into = !leaving && STAGE.index > 0 && info.local < info.change;
      if (!leaving && !into) { ctx.drawImage(sb, 0, 0); return; }
      const pr = leaving ? info.exit : info.local / Math.max(0.01, info.change);
      const cx = combX(S, pr), idx = STAGE.index;
      ctx.save();
      if (leaving) {
        // Untouched ahead of the comb; just ahead of it the ink is shoved forward along each tine.
        const D = 130 * u, sp = RSP * u, off = rakeOff(u, idx);
        ctx.save(); ctx.beginPath(); ctx.rect(cx + D, 0, W, H); ctx.clip(); ctx.drawImage(sb, 0, 0); ctx.restore();
        ctx.save(); ctx.beginPath(); ctx.rect(cx + 12 * u, 0, W, H); ctx.clip();
        const rh = Math.max(3, Math.round(5 * u));
        for (let y = 0; y < H; y += rh) {
          const m = mod(y + rh / 2 - off, sp), dd = Math.min(m, sp - m);
          const sh = 70 * u * tine(dd, 6 * u, sp / 2) + 8 * u;
          const sx = Math.max(0, cx), sw = Math.min(D, W - sx);
          if (sw > 1) ctx.drawImage(sb, sx, y, sw, rh, sx + sh, y, sw, rh);
        }
        ctx.restore();
      } else {
        ctx.beginPath(); ctx.rect(0, 0, Math.max(0, cx), H); ctx.clip();
        ctx.drawImage(sb, 0, 0);
        ctx.restore(); ctx.save();
        comb(ctx, S, th, cx, idx);
      }
      ctx.restore();
    };
  }
  const rv = (F, delay, dur = 0.6) => eo((F.local - delay) / dur);

  // ---- chart --------------------------------------------------------------------------------------
  function chartScene(g, S, th, box, d, F) {
    const u = th.u, t = F.t, n = d.values.length, max = Math.max(...d.values, 1);
    const gap = box.w * 0.07, bw = Math.min((box.w - gap * (n + 1)) / n, 300 * u);
    const total = n * bw + (n + 1) * gap, ox = box.x + (box.w - total) / 2;
    const base = box.y + box.h - 78 * u, maxH = box.h - 78 * u - 168 * u;
    const rq = rv(F, 0, 0.5);
    g.save();
    g.setLineDash([16 * u, 14 * u]); g.lineDashOffset = -t * 26 * u; g.lineWidth = 2.2 * u; g.strokeStyle = rgba(th.inkC, 0.35);
    for (let k = 1; k <= 3; k++) { const yy = base - (maxH * k) / 3; g.beginPath(); g.moveTo(ox, yy); g.lineTo(ox + total * rq, yy); g.stroke(); }
    g.restore();
    g.save(); shadowOn(g, th, 0.8);
    const gr = g.createLinearGradient(0, base, 0, base + 14 * u); gr.addColorStop(0, th.brass[1]); gr.addColorStop(1, th.brass[0]);
    rrPath(g, ox, base, total * rq, 12 * u, 6 * u); g.fillStyle = gr; g.fill(); g.restore();
    for (let i = 0; i < n; i++) {
      const q = rv(F, 0.05 + i * 0.1, 0.7), hot = i === d.highlight;
      const fullH = maxH * (d.values[i] / max);
      const bx = ox + gap + i * (bw + gap), h = fullH * q, by = base - h;
      if (h > 5 * u) {
        const cols = hot ? th.hot : th.sets[i % th.sets.length];
        // The ink is pulled up through each bar for the whole hold.
        const pull = 0.12 + 0.5 * eo((F.local - 0.3) / Math.max(1, F.hold - 0.4)) + 0.04 * Math.sin(t * 1.4 + i);
        const drops = [];
        if (hot) for (let k = 0; k < 6; k++) {
          const t0 = 0.75 + k * 0.62, hx = bw * (0.3 + 0.4 * ((k * 0.37) % 1)), hy = maxH - fullH + fullH * (0.16 + 0.55 * ((k * 0.53) % 1));
          landing(drops, F.local, t0, hx, hy, bw * (0.2 + 0.05 * (k % 2)), [th.acc, th.cream, th.P[0]]);
        }
        marbled(g, th, () => topRound(g, bx, by, bw, h, 24 * u), bx, by, bw, h,
          { colors: cols, seed: 11 + i * 5, style: "bouquet", tines: 2.4, pull, t: t + i, gw: bw, gh: maxH, anchor: "bottom", phase: 0.15 * Math.sin(t * 0.5 + i), drops }, 6);
      }
      if (q > 0.04) {
        const val = M().formatNumber(d.values[i] * q, 0, d.prefix, d.suffix);
        tag(g, S, th, val, bx + bw / 2, by - 30 * u - 70 * u, 100 * u, { align: "center", fam: "figures", weight: 800, q: seg(q, 0.05, 0.6), padX: 0.28, color: hot ? "#fff6e4" : th.ink, fill: hot ? th.acc : th.paper });
        tag(g, S, th, d.labels[i] || "", bx + bw / 2, base + 52 * u, 44 * u, { align: "center", q: seg(q, 0.1, 0.7), padX: 0.4 });
      }
    }
  }

  // ---- object -----------------------------------------------------------------------------------
  function deviceRect(S, box, d) {
    const u = S.u, tall = S.H > S.W, phone = d.kind === "phone";
    let w, h;
    if (phone) { h = Math.min(box.h * (tall ? 0.56 : 0.96), box.w * 0.9 * 1.9); w = h / 1.9; }
    else { w = Math.min(tall ? box.w * 0.96 : box.w * 0.6, box.h * (tall ? 0.6 : 1.3)); h = w * 0.62; }
    const x = tall ? box.x + (box.w - w) / 2 : box.x + (phone ? box.w * 0.08 : 0.02 * box.w);
    const y = tall ? box.y + 10 * u : box.y + (box.h - h - (phone ? 0 : 30 * u)) / 2;
    return { x, y, w, h, phone };
  }
  function objectScene(g, S, th, box, d, F) {
    const u = th.u, t = F.t, { x, y, w, h, phone } = deviceRect(S, box, d), q = rv(F, 0, 0.6);
    const tall = S.H > S.W;
    g.save();
    g.globalAlpha = clamp(q * 2.2);
    g.translate(0, (1 - q) * 40 * u);
    g.save(); shadowOn(g, th, 1.6); rrPath(g, x, y, w, h, (phone ? 40 : 20) * u); g.fillStyle = "#1a1e3c"; g.fill(); g.restore();
    rrPath(g, x, y, w, h, (phone ? 40 : 20) * u); g.lineWidth = 6 * u; g.strokeStyle = th.cream; g.stroke();
    const pad = (phone ? 22 : 24) * u, sx = x + pad, sy = y + pad, sw = w - pad * 2, sh = h - pad * 2;
    g.save(); rrPath(g, sx, sy, sw, sh, 10 * u); g.clip();
    miniMarble(g, th, sx, sy, sw, sh, { colors: th.sets[3].concat(th.sets[1]), seed: 23, style: "stone", t, dens: 0.3 });
    g.fillStyle = "rgba(16,16,40,0.74)"; g.fillRect(sx, sy, sw, sh);
    const pv = { x: sx + sw * 0.07, y: sy + sh * 0.07, w: sw * 0.86, h: sh * (phone ? 0.34 : 0.44) };
    const pvPull = 0.25 + 0.45 * eo((F.local - 0.4) / Math.max(1, F.hold - 0.5)) + 0.05 * Math.sin(t * 1.1);
    marbled(g, th, () => rrPath(g, pv.x, pv.y, pv.w, pv.h, 8 * u), pv.x, pv.y, pv.w, pv.h, { colors: th.hot.concat([th.P[5]]), seed: 31, style: "chevron", pull: pvPull, t, dens: 0.42, phase: 0.2 * Math.sin(t * 0.4) }, 3);
    const tracks = phone ? 4 : 3, th0 = sh * (phone ? 0.075 : 0.1), ty0 = pv.y + pv.h + sh * 0.07;
    const clips = [[0.06, 0.3], [0.4, 0.22], [0.66, 0.28]];
    for (let r = 0; r < tracks; r++) {
      clips.forEach(([cx, cw], i) => {
        const s = rv(F, 0.2 + r * 0.08 + i * 0.08, 0.5);
        if (s <= 0) return;
        const bx = sx + sw * (cx + r * 0.025), by = ty0 + r * (th0 + sh * 0.035), full = sw * cw, bw = full * s;
        marbled(g, th, () => rrPath(g, bx, by, bw, th0, 5 * u), bx, by, bw, th0, { colors: th.sets[(r + i) % 6], seed: 50 + r * 3 + i, style: "feather", axis: "x", pull: 0.3 + 0.2 * Math.sin(t * 0.8 + r + i), t: t + r, gw: full, dens: 0.9 }, 2);
      });
    }
    const pxh = sx + sw * (0.08 + 0.84 * ((t * 0.16) % 1));
    g.fillStyle = th.cream; g.fillRect(pxh - 2 * u, pv.y + pv.h + 8 * u, 4 * u, tracks * (th0 + sh * 0.035) + sh * 0.06);
    g.beginPath(); g.moveTo(pxh - 8 * u, pv.y + pv.h + 8 * u); g.lineTo(pxh + 8 * u, pv.y + pv.h + 8 * u); g.lineTo(pxh, pv.y + pv.h + 20 * u); g.closePath(); g.fillStyle = th.acc; g.fill();
    g.restore();
    if (!phone) {
      g.beginPath(); g.moveTo(x - w * 0.07, y + h + h * 0.07); g.lineTo(x + w * 1.07, y + h + h * 0.07); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath();
      g.save(); shadowOn(g, th, 1.2); g.fillStyle = th.paper; g.fill(); g.restore();
      g.lineWidth = 3 * u; g.strokeStyle = rgba(th.inkC, 0.5); g.stroke();
      rrPath(g, x + w * 0.4, y + h + 2 * u, w * 0.2, h * 0.035, 6 * u); g.fillStyle = rgba(th.inkC, 0.25); g.fill();
    }
    g.restore();
    // Callouts: a wire from a part of the device to its tag. Through the hold a stylus traces each wire
    // from its tag back to the part, laying a line of ink, and a drop lands where it arrives.
    const anchors = [[pv.x + pv.w * 0.72, pv.y + pv.h * 0.3], [sx + sw * 0.52, ty0 + th0 * 0.5], [sx + sw * 0.22, ty0 + 2 * (th0 + sh * 0.035) + th0 * 0.5]];
    d.callouts.forEach((label, i) => {
      const c = rv(F, 0.4 + i * 0.18, 0.55);
      if (c <= 0 || !label) return;
      const [ax, ay] = anchors[i];
      let lx, ly;
      if (tall) { lx = box.x + 20 * u; ly = y + h + 120 * u + i * 118 * u; }
      else { lx = box.x + box.w * (phone ? 0.5 : 0.7); ly = box.y + box.h * (0.18 + i * 0.28); }
      const ex = tall ? lx - 14 * u : lx - 22 * u, ey = ly;
      const mx = (ax + ex) / 2, my = (ay + ey) / 2 + Math.sin(t * 1.3 + i) * 10 * u;
      const at = (s) => { const a1 = (1 - s) * (1 - s), b1 = 2 * (1 - s) * s, c1 = s * s; return [a1 * ax + b1 * (tall ? ax : mx) + c1 * ex, a1 * ay + b1 * (tall ? my : ay) + c1 * ey]; };
      const pts = 36, cnt = Math.max(2, Math.round(pts * c));
      g.save();
      g.beginPath(); g.moveTo(ax, ay);
      for (let k = 1; k <= cnt; k++) { const [px, py] = at(k / pts); g.lineTo(px, py); }
      g.lineWidth = 7 * u; g.strokeStyle = th.cream; g.lineCap = "round"; g.stroke();
      g.lineWidth = 3 * u; g.strokeStyle = th.ink; g.stroke();
      g.restore();
      // The stylus pass.
      const per = 2.1, t0 = 1.15 + i * 0.7, z = F.local - t0;
      let landed = 0;
      if (z > 0 && c >= 1) {
        const ph = (z % per) / per, s = 1 - sstep(ph / 0.55), fade = ph < 0.55 ? 1 : 1 - (ph - 0.55) / 0.45;
        g.save(); g.globalAlpha = fade;
        g.beginPath();
        for (let k = 0; k <= 30; k++) { const [px, py] = at(1 - (1 - s) * (k / 30)); k ? g.lineTo(px, py) : g.moveTo(px, py); }
        g.lineWidth = 8 * u; g.lineCap = "round"; g.strokeStyle = th.acc; g.stroke();
        g.restore();
        if (ph < 0.6) {
          const [px, py] = at(s);
          g.save(); g.translate(px, py); g.rotate(-0.7);
          const sg = g.createLinearGradient(-5 * u, 0, 5 * u, 0); sg.addColorStop(0, th.brass[0]); sg.addColorStop(0.5, th.brass[1]); sg.addColorStop(1, th.brass[2]);
          shadowOn(g, th, 0.6); g.fillStyle = sg; g.beginPath(); g.moveTo(-5 * u, -90 * u); g.lineTo(5 * u, -90 * u); g.lineTo(1.2 * u, -4 * u); g.lineTo(-1.2 * u, -4 * u); g.closePath(); g.fill(); shadowOff(g);
          g.restore();
        }
        landed = ph > 0.5 ? eo((ph - 0.5) / 0.3) * (1 - seg(ph, 0.75, 1)) : 0;
      }
      if (landed > 0.01) halo(g, th, ax, ay, (18 + 16 * landed) * u, t, landed);
      rings(g, th, ax, ay, 16 * u, [th.acc, th.cream, th.ink], t, { seed: i, shadow: false });
      tag(g, S, th, label, lx, ly, 46 * u, { q: seg(c, 0.45, 1) });
    });
  }

  // ---- people -----------------------------------------------------------------------------------
  function peopleScene(g, S, th, box, d, F) {
    const u = th.u, t = F.t, n = Math.max(2, Math.min(6, Math.round(d.count)));
    const size = Math.min(box.h * 0.6, (box.w / n) * 1.2), base = box.y + box.h * 0.9;
    const lq = rv(F, 0, 0.5);
    g.save(); g.beginPath();
    for (let x = 0; x <= box.w * lq; x += 8 * u) { const px = box.x + x, py = base + 4 * u + Math.sin(x * 0.02 - t * 2.2) * 5 * u; x ? g.lineTo(px, py) : g.moveTo(px, py); }
    g.lineWidth = 9 * u; g.lineCap = "round"; g.strokeStyle = th.cream; g.stroke(); g.lineWidth = 3.5 * u; g.strokeStyle = th.acc; g.stroke(); g.restore();
    for (let i = 0; i < n; i++) {
      const q = rv(F, 0.05 + i * 0.11, 0.6), hot = i === Math.min(n - 1, d.highlight);
      if (q <= 0) continue;
      const cx = box.x + (box.w / n) * (i + 0.5), sz = size * (hot ? 1.07 : 1), head = sz * 0.21, bw = sz * 0.62;
      const rise = (1 - q) * sz * 0.35, bob = Math.sin(t * 1.7 + i * 1.4) * 5 * u;
      g.save(); g.globalAlpha = clamp(q * 2);
      g.translate(0, rise);
      const top = base - sz + head * 2 + sz * 0.07, cols = hot ? th.hot : th.sets[(i + 1) % th.sets.length];
      const bodyPath = () => { g.beginPath(); g.moveTo(cx - bw / 2, base); g.lineTo(cx - bw / 2, top + bw * 0.38); g.quadraticCurveTo(cx - bw / 2, top, cx, top); g.quadraticCurveTo(cx + bw / 2, top, cx + bw / 2, top + bw * 0.38); g.lineTo(cx + bw / 2, base); g.closePath(); };
      const drops = [];
      landing(drops, F.local, 0.9 + i * 0.45, bw * 0.5, (base - top) * 0.42, bw * 0.24, hot ? [th.acc, th.cream] : [th.sets[i % 6][0], th.cream]);
      marbled(g, th, bodyPath, cx - bw / 2, top, bw, base - top, { colors: cols, seed: 70 + i * 7, style: "feather", pull: 0.25 + 0.35 * eo((F.local - 0.4) / Math.max(1, F.hold)) + 0.05 * Math.sin(t + i), t: t + i, dens: 0.4, drops }, 5);
      const hy = base - sz + head + bob;
      if (hot) halo(g, th, cx, hy, head * 1.55, t, eo((F.local - 0.5) / 0.6));
      rings(g, th, cx, hy, head, hot ? [th.acc, th.cream, th.P[1], th.ink] : [th.sets[i % 6][0], th.cream, th.sets[i % 6][1], th.sets[i % 6][3]], t, { seed: i * 1.7 });
      g.restore();
      const label = d.badges[i % d.badges.length];
      if (label) tag(g, S, th, label, cx, base - sz * 1.2 - 40 * u + rise, 46 * u, { align: "center", q: seg(q, 0.25, 1), fill: hot ? th.acc : th.paper, color: hot ? "#fff6e4" : th.ink });
    }
  }

  // ---- process ----------------------------------------------------------------------------------
  function icon(g, th, kind, cx, cy, s, color, t) {
    g.save(); g.translate(cx, cy); g.strokeStyle = color; g.fillStyle = color; g.lineWidth = Math.max(3, s * 0.1); g.lineCap = "round"; g.lineJoin = "round";
    if (kind === 0) { // dropper
      g.rotate(-0.6);
      rrPath(g, -s * 0.1, -s * 0.46, s * 0.2, s * 0.5, s * 0.08); g.stroke();
      g.beginPath(); g.moveTo(-s * 0.17, -s * 0.46); g.lineTo(s * 0.17, -s * 0.46); g.stroke();
      g.beginPath(); g.moveTo(-s * 0.06, s * 0.04); g.lineTo(0, s * 0.3); g.lineTo(s * 0.06, s * 0.04); g.stroke();
      g.rotate(0.6); g.beginPath(); g.arc(s * 0.2, s * 0.36 + Math.sin(t * 3) * s * 0.03, s * 0.055, 0, TAU); g.fill();
    } else if (kind === 1) { // comb
      g.beginPath(); g.moveTo(-s * 0.4, -s * 0.18); g.lineTo(s * 0.4, -s * 0.18); g.stroke();
      for (let k = 0; k < 5; k++) { const x = -s * 0.32 + k * s * 0.16; g.beginPath(); g.moveTo(x, -s * 0.18); g.lineTo(x + Math.sin(t * 2 + k) * s * 0.02, s * 0.34); g.stroke(); }
    } else { // sheet laid on the tray
      const w = s * 0.7, sh = Math.sin(t * 1.8) * s * 0.03;
      g.beginPath(); g.moveTo(-w / 2, s * 0.2); g.lineTo(-w / 2 + s * 0.1, -s * 0.28 + sh); g.lineTo(w / 2 + s * 0.1, -s * 0.28 + sh); g.lineTo(w / 2, s * 0.2); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(-w / 2 + s * 0.2, -s * 0.06); g.lineTo(w / 2 - s * 0.05, -s * 0.06); g.moveTo(-w / 2 + s * 0.17, s * 0.08); g.lineTo(w / 2 - s * 0.12, s * 0.08); g.stroke();
    }
    g.restore();
  }
  function processScene(g, S, th, box, d, F) {
    const u = th.u, t = F.t, n = d.steps.length, vertical = box.h > box.w;
    const R = vertical ? Math.min(box.w * 0.24, (box.h / n) * 0.3) : Math.min(box.h * 0.3, (box.w / n) * 0.3);
    const pos = (i) => vertical ? [box.x + box.w * 0.3, box.y + (box.h / n) * (i + 0.5)] : [box.x + (box.w / n) * (i + 0.5), box.y + box.h * 0.4];
    for (let i = 0; i < n - 1; i++) {
      const [ax, ay] = pos(i), [bx, by] = pos(i + 1), c = rv(F, 0.25 + i * 0.28, 0.7);
      if (c <= 0) continue;
      const x1 = vertical ? ax : ax + R * 1.05, y1 = vertical ? ay + R * 1.05 : ay, x2 = vertical ? bx : bx - R * 1.05, y2 = vertical ? by - R * 1.05 : by;
      const curve = (s) => {
        const e = s * s * (3 - 2 * s), amp = 34 * u * Math.sin(s * Math.PI * 2 + t * 1.5);
        return vertical ? [x1 + (x2 - x1) * e + amp, y1 + (y2 - y1) * s] : [x1 + (x2 - x1) * s, y1 + (y2 - y1) * e + amp];
      };
      g.save(); g.beginPath();
      const cnt = Math.max(2, Math.round(40 * c));
      for (let k = 0; k <= cnt; k++) { const [px, py] = curve(k / 40); k ? g.lineTo(px, py) : g.moveTo(px, py); }
      g.lineCap = "round"; g.lineWidth = 15 * u; g.strokeStyle = th.cream; g.stroke(); g.lineWidth = 8 * u; g.strokeStyle = th.ink; g.stroke(); g.restore();
      const [ex, ey] = curve(Math.min(1, c)), [px, py] = curve(Math.max(0, c - 0.03));
      if (c > 0.9) { const a = Math.atan2(ey - py, ex - px); g.save(); g.translate(ex, ey); g.rotate(a); g.beginPath(); g.moveTo(-26 * u, -20 * u); g.lineTo(6 * u, 0); g.lineTo(-26 * u, 20 * u); g.lineWidth = 9 * u; g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = th.acc; g.stroke(); g.restore(); }
      if (c > 0.95) for (let k = 0; k < 2; k++) {
        const z = (t * 0.45 + k * 0.5 + i * 0.2) % 1, [sx, sy] = curve(z);
        g.save(); g.globalAlpha = Math.sin(z * Math.PI); rings(g, th, sx, sy, 11 * u, [th.acc, th.cream], t, { shadow: false, seed: k }); g.restore();
      }
    }
    for (let i = 0; i < n; i++) {
      const q = rv(F, 0.05 + i * 0.25, 0.6);
      if (q <= 0) continue;
      const [cx, cy] = pos(i), last = i === n - 1;
      g.save(); g.globalAlpha = clamp(q * 2); g.translate(cx, cy); g.scale(0.55 + 0.45 * q, 0.55 + 0.45 * q); g.translate(-cx, -cy);
      if (last) halo(g, th, cx, cy, R * 1.22, t, eo((F.local - 1.2) / 0.7));
      rings(g, th, cx, cy, R, last ? [th.acc, th.cream, th.P[1], th.acc, th.ink] : [th.sets[i % 6][0], th.cream, th.sets[i % 6][1], th.sets[i % 6][2], th.sets[i % 6][3]], t, { seed: i * 2.3 });
      g.beginPath(); g.arc(cx, cy, R * 0.5, 0, TAU); g.fillStyle = th.paper; g.fill(); g.lineWidth = 3 * u; g.strokeStyle = th.cream; g.stroke();
      icon(g, th, last ? 2 : i % 2, cx, cy, R * 0.85, last ? th.acc : th.ink, t + i);
      g.restore();
      tag(g, S, th, String(i + 1).padStart(2, "0"), cx - R * 0.95, cy - R * 1.05, 44 * u, { fam: "figures", q: seg(q, 0.2, 0.9), padX: 0.35, fill: last ? th.acc : th.paper, color: last ? "#fff6e4" : th.ink });
      const lab = vertical ? [cx + R * 1.35, cy] : [cx, cy + R * 1.4 + 40 * u];
      tag(g, S, th, d.steps[i], lab[0], lab[1], 46 * u, { align: vertical ? "left" : "center", q: seg(q, 0.3, 1) });
    }
  }

  // ---- compare ----------------------------------------------------------------------------------
  function compareScene(g, S, th, box, d, F) {
    const u = th.u, t = F.t, vertical = box.h > box.w * 1.1, gap = 44 * u;
    const cw = vertical ? box.w : (box.w - gap) / 2, ch = vertical ? (box.h - gap) / 2 : box.h * 0.9;
    const mx = Math.max(d.leftValue, d.rightValue, 1);
    // After the count, the larger figure's ink disperses while the smaller settles into a landed drop.
    const after = sstep((F.local - 1.1) / Math.max(1, F.hold - 1.3));
    [[d.left, d.leftValue, false], [d.right, d.rightValue, true]].forEach(([label, value, hot], i) => {
      const q = rv(F, 0.05 + i * 0.22, 0.65);
      if (q <= 0) return;
      const x = vertical ? box.x : box.x + i * (cw + gap), y = (vertical ? box.y + i * (ch + gap) : box.y + (box.h - ch) / 2) + (1 - q) * 40 * u;
      g.save(); g.globalAlpha = clamp(q * 2.2);
      const cols = hot ? th.hot.concat([th.P[2]]) : th.sets[3].concat(th.sets[0]);
      const pull = hot ? 0.32 + 0.16 * Math.sin(t * 1.3) : 0.3 + 0.55 * after + 0.12 * Math.sin(t * 1.5);
      marbled(g, th, () => rrPath(g, x, y, cw, ch, 28 * u), x, y, cw, ch, { colors: cols, seed: 90 + i * 9, style: hot ? "stone" : "feather", pull, t: t + i * 2, dens: 0.22 }, 7);
      const ix = x + 36 * u, iy = y + 36 * u, iw = cw - 72 * u, ih = ch - 72 * u;
      g.save(); shadowOn(g, th, 0.7); deckle(g, ix, iy, iw, ih, 11 + i * 5, 1.8 * u, 12 * u); g.fillStyle = th.paper; g.fill(); g.restore();
      g.lineWidth = 1.8 * u; g.strokeStyle = rgba(th.inkC, 0.35); g.beginPath(); g.rect(ix + 8 * u, iy + 8 * u, iw - 16 * u, ih - 16 * u); g.stroke();
      g.restore();
      g.save(); g.globalAlpha = clamp(q * 2.2);
      g.font = `700 ${46 * u}px ${S.look.body}`; g.fillStyle = hot ? th.acc : th.ink; g.textBaseline = "middle"; g.textAlign = "left";
      g.fillText(label, ix + 34 * u, iy + 64 * u);
      const nums = M().formatNumber(value * q, 0, d.prefix, d.suffix), nsz = Math.min(170 * u, ih * 0.38);
      g.font = `800 ${nsz}px ${S.look.figures}`;
      const nw = g.measureText(nums).width, nx = ix + 30 * u, ny = iy + ih * 0.52;
      if (hot) {
        // A drop lands under the figure and settles.
        const z = eo((F.local - 0.9) / 0.9);
        if (z > 0) {
          g.save(); g.globalAlpha *= z;
          rings(g, th, nx + nw * 0.5, ny, nsz * (0.6 + 0.1 * z + 0.02 * Math.sin(t * 1.6)), [th.P[5], th.P[1], th.cream, th.P[5], th.cream], t * 0.6, { seed: 5, shadow: false });
          g.restore();
        }
        g.fillStyle = th.acc; g.fillText(nums, nx, ny);
      } else {
        g.save(); g.globalAlpha *= 1 - 0.5 * after; g.fillStyle = th.ink; g.fillText(nums, nx, ny); g.restore();
      }
      // One floated drop per unit, counted in as the figure climbs. Redos break up and drift off;
      // tweaks land and settle.
      const cnt = Math.max(0, Math.min(12, Math.round(value))), shown = Math.min(cnt, Math.ceil(value * q - 0.001));
      if (cnt > 0) {
        const ax0 = ix + Math.max(iw * 0.42, nw + 70 * u), ax1 = ix + iw - 34 * u, ay0 = iy + 96 * u, ay1 = iy + ih - 110 * u;
        const aw = ax1 - ax0, ah = ay1 - ay0;
        if (aw > 40 * u && ah > 40 * u) {
          let gc = Math.max(1, Math.round(Math.sqrt((cnt * aw) / ah)));
          const gr = Math.ceil(cnt / gc);
          gc = Math.ceil(cnt / gr);
          const cwl = aw / gc, chl = ah / gr, rr = Math.min(cwl, chl) * 0.36;
          for (let k = 0; k < shown; k++) {
            const col = k % gc, row = Math.floor(k / gc);
            let dx = ax0 + cwl * (col + 0.5), dy = ay0 + chl * (row + 0.5);
            const land = eo((F.local - 0.15 - k * 0.08) / 0.5);
            let rad = rr * land, a = 1;
            if (!hot && after > 0) {
              const kz = clamp(after * 1.6 - (k / cnt) * 0.6), ang = k * 2.39996;
              dx += Math.cos(ang) * kz * rr * 1.4; dy += Math.sin(ang) * kz * rr * 0.9;
              rad *= 1 + kz * 0.5; a = 1 - kz * 0.75;
            }
            rad *= 1 + 0.04 * Math.sin(t * 1.7 + k);
            if (rad < 1) continue;
            g.save(); g.globalAlpha *= a;
            const cs2 = hot ? [th.acc, th.P[1], th.hot[3], th.P[1]] : [th.sets[3][k % 4], th.cream, th.ink, th.sets[0][(k + 1) % 4]];
            rings(g, th, dx, dy, rad, cs2, t + k, { seed: k * 1.3, shadow: false });
            if (!hot && after > 0.05) for (let j = 0; j < 3; j++) {
              const zz = (t * 0.7 + j / 3 + k * 0.11) % 1, ang2 = k * 2.4 + j * 2.1;
              g.globalAlpha = a * after * Math.sin(zz * Math.PI) * 0.8;
              g.beginPath(); g.arc(dx + Math.cos(ang2) * rad * (1 + zz * 1.4), dy + Math.sin(ang2) * rad * (1 + zz * 1.4), rr * 0.12, 0, TAU); g.fillStyle = th.ink; g.fill();
            }
            g.restore();
          }
        }
      }
      const mxl = ix + 34 * u, myl = iy + ih - 78 * u, mw = iw - 68 * u, mh = 34 * u, fill = clamp(value / mx) * q;
      rrPath(g, mxl, myl, mw, mh, mh / 2); g.fillStyle = rgba(th.inkC, 0.14); g.fill();
      if (mw * fill > 8 * u) {
        marbled(g, th, () => rrPath(g, mxl, myl, mw * fill, mh, mh / 2), mxl, myl, mw * fill, mh, { colors: cols, seed: 120 + i, style: "bouquet", axis: "x", tines: 1.5, pull: 0.4 + 0.3 * Math.sin(t * 1.6 + i), t: t * 2, gw: mw, dens: 0.9 }, 3);
      }
      g.restore();
    });
    const pct = d.leftValue ? Math.round(((d.rightValue - d.leftValue) / d.leftValue) * 100) : 0;
    const bq = rv(F, 0.7, 0.5);
    if (bq > 0) {
      const bx = vertical ? box.x + box.w / 2 : box.x + cw + gap / 2, by = vertical ? box.y + ch + gap / 2 : box.y + (box.h - ch) / 2;
      g.save(); g.translate(bx, by); g.scale(0.6 + 0.4 * bq, 0.6 + 0.4 * bq); g.rotate(-0.07 + Math.sin(t * 1.4) * 0.03); g.translate(-bx, -by);
      tag(g, S, th, `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%`, bx, by, 66 * u, { align: "center", fam: "figures", weight: 800, fill: th.acc, color: "#fff6e4", q: seg(bq, 0.1, 1), padX: 0.4, line: "rgba(255,246,222,0.7)" });
      g.restore();
    }
  }

  // ---- closing: a finished sheet is lifted off the bath, an accept mark drawn on it ---------------
  function closingScene(g, S, th, box, d, F) {
    const u = th.u, t = F.t, { W, H } = S, tall = H > W, L = F.local;
    const pr = PLATES["closing|" + W + "|" + H];
    const below = pr ? pr.y + pr.h + 30 * u : H * 0.62;
    let sw, sh, sx, sy;
    if (tall) { sw = W * 0.66; sh = sw * 0.68; sx = (W - sw) / 2; sy = Math.max(below + 90 * u, H * 0.6); }
    else { sh = Math.max(160 * u, Math.min(H * 0.3, H - below - 110 * u)); sw = sh * 1.5; sx = W * 0.9 - sw; sy = below + 70 * u; }
    const q = rv(F, 0, 0.5);
    const lift = 0.15 + 0.85 * sstep((L - 0.2) / Math.max(1.4, F.hold * 0.95));
    // The bath line under the sheet: drips run back into it.
    const bathY = sy + sh;
    const lx = -34 * u * lift, ly = -46 * u * lift, rot = -0.07 * lift + 0.006 * Math.sin(t * 1.3), sc = 1 + 0.05 * lift;
    const corner = (fx, fy) => {
      const px = sx + sw * fx, py = sy + sh * fy, ox = sx, oy = sy + sh;
      const dx = (px - ox) * sc, dy = (py - oy) * sc, c = Math.cos(rot), s = Math.sin(rot);
      return [ox + dx * c - dy * s + lx, oy + dx * s + dy * c + ly];
    };
    g.save(); g.globalAlpha = clamp(q * 2);
    for (let k = 0; k < 6; k++) {
      const fx = 0.1 + k * 0.16, [tx, ty] = corner(fx, 1);
      const by = bathY + 6 * u, len = by - ty;
      if (len < 4 * u) continue;
      const col = th.sets[0][k % 4];
      g.beginPath(); g.moveTo(tx - 4 * u, ty); g.quadraticCurveTo(tx, ty + len * 0.6, tx + 0.5 * u, by); g.lineTo(tx + 1.5 * u, by); g.quadraticCurveTo(tx + 1 * u, ty + len * 0.6, tx + 4 * u, ty); g.closePath();
      g.fillStyle = col; g.fill();
      const z = (t * 0.9 + k * 0.37) % 1;
      g.beginPath(); g.arc(tx + u, ty + len * z, (3 + 2 * Math.sin(k)) * u, 0, TAU); g.fill();
      const rz = (t * 0.9 + k * 0.37 + 0.5) % 1;
      g.save(); g.globalAlpha *= 1 - rz; g.beginPath(); g.ellipse(tx + u, by, (6 + 22 * rz) * u, (2 + 6 * rz) * u, 0, 0, TAU); g.fillStyle = col; g.fill(); g.restore();
    }
    // Shadow on the bath.
    g.save(); g.globalAlpha *= 0.5; g.filter = `blur(${(6 + 20 * lift) * u}px)`;
    g.translate(18 * u * lift, 34 * u * lift);
    g.beginPath(); g.moveTo(...corner(0, 0)); g.lineTo(...corner(1, 0)); g.lineTo(...corner(1, 1)); g.lineTo(...corner(0, 1)); g.closePath();
    g.fillStyle = "rgba(40,26,8,0.8)"; g.fill(); g.restore();
    // The sheet.
    g.save();
    const [ox, oy] = [sx + lx, sy + sh + ly];
    g.translate(ox, oy); g.rotate(rot); g.scale(sc, sc); g.translate(-sx, -(sy + sh));
    deckle(g, sx, sy, sw, sh, 19, 2.4 * u, 12 * u); g.fillStyle = th.paper; g.fill();
    g.save(); deckle(g, sx, sy, sw, sh, 19, 2.4 * u, 12 * u); g.clip();
    miniMarble(g, th, sx, sy, sw, sh, { colors: th.sets[0].concat([th.P[5]]), seed: 140, style: "feather", pull: 0.55 + 0.1 * Math.sin(t * 0.7), t: t * 0.4, dens: 0.3 });
    const gl = g.createLinearGradient(sx, sy, sx + sw, sy + sh);
    gl.addColorStop(0, "rgba(255,250,235,0.32)"); gl.addColorStop(0.5, "rgba(255,250,235,0)"); gl.addColorStop(1, "rgba(40,26,8,0.12)");
    g.fillStyle = gl; g.fillRect(sx, sy, sw, sh);
    g.restore();
    deckle(g, sx, sy, sw, sh, 19, 2.4 * u, 12 * u); g.lineWidth = 2 * u; g.strokeStyle = rgba(th.inkC, 0.45); g.stroke();
    // The accept mark, drawn with the stylus.
    const ck = sstep((L - 0.35) / 0.85);
    const P3 = [[0.27, 0.52], [0.43, 0.74], [0.77, 0.25]].map(([a, b]) => [sx + sw * a, sy + sh * b]);
    const l1 = Math.hypot(P3[1][0] - P3[0][0], P3[1][1] - P3[0][1]), l2 = Math.hypot(P3[2][0] - P3[1][0], P3[2][1] - P3[1][1]);
    const at = (s) => { const dd = s * (l1 + l2); if (dd <= l1) { const f = dd / l1; return [P3[0][0] + (P3[1][0] - P3[0][0]) * f, P3[0][1] + (P3[1][1] - P3[0][1]) * f]; } const f = (dd - l1) / l2; return [P3[1][0] + (P3[2][0] - P3[1][0]) * f, P3[1][1] + (P3[2][1] - P3[1][1]) * f]; };
    if (ck > 0) {
      const tip = at(ck);
      g.beginPath(); g.moveTo(...P3[0]);
      if (ck * (l1 + l2) > l1) g.lineTo(...P3[1]);
      g.lineTo(...tip);
      g.lineCap = "round"; g.lineJoin = "round";
      g.lineWidth = 34 * u; g.strokeStyle = th.cream; g.stroke();
      g.lineWidth = 20 * u; g.strokeStyle = th.acc; g.stroke();
      if (ck >= 1) halo(g, th, P3[2][0], P3[2][1], (20 + 6 * Math.sin(t * 1.5)) * u, t, eo((L - 1.2) / 0.5));
      if (ck < 1) {
        g.save(); g.translate(tip[0], tip[1]); g.rotate(-0.6);
        const sg = g.createLinearGradient(-7 * u, 0, 7 * u, 0); sg.addColorStop(0, th.brass[0]); sg.addColorStop(0.5, th.brass[1]); sg.addColorStop(1, th.brass[2]);
        shadowOn(g, th, 0.7); g.fillStyle = sg; g.beginPath(); g.moveTo(-7 * u, -150 * u); g.lineTo(7 * u, -150 * u); g.lineTo(1.5 * u, -6 * u); g.lineTo(-1.5 * u, -6 * u); g.closePath(); g.fill(); shadowOff(g);
        g.restore();
      }
    }
    g.restore();
    g.restore();
  }

  // ---- tokens -----------------------------------------------------------------------------------
  const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif";
  const SANS = "'Gill Sans', 'Gill Sans MT', 'Trebuchet MS', 'Avenir Next', 'Helvetica Neue', Arial, sans-serif";
  return {
    bg: "#e4d6b6", panel: "#f3e8cf", ink: "#1b2246", muted: "rgba(27,34,70,0.72)", accent: "#a8372a", onAccent: "#fff6e4",
    rule: "rgba(27,34,70,0.4)", track: "rgba(27,34,70,0.14)",
    paper: "#f5ecd6", cream: "#fbf4e2", ground: "#e2d3b1",
    pigments: ["#26346b", "#c39437", "#7d97b6", "#3e7470", "#ebe0c4", "#9fb3c4", "#141a36", "#94402f"],
    display: SERIF, displayWeight: 700, displayCase: "none", displayTracking: "-0.015em",
    body: SANS, bodyWeight: 600, figures: SERIF, radius: 18,
    motion: "wipe", change: "grid", kit: { line: 3, fill: "solid", panel: "fill" },
    palettes: {
      light: { bg: "#eee4cc", ground: "#ece1c6", paper: "#fbf5e6", cream: "#fffaf0", accent: "#b2452f", pigments: ["#5b6fa3", "#d8b05e", "#a9bdd3", "#6f9a93", "#f4ecd8", "#c3cfd8", "#36406b", "#b9705c"] },
      dark: { bg: "#151a30", ground: "#161b31", paper: "#efe2c4", cream: "#f6ead0", ink: "#1b2246", accent: "#c9563a", pigments: ["#34478a", "#b88a32", "#58708f", "#2f5f5b", "#cdbf9f", "#7d93a8", "#0b0f22", "#7e3628"] },
      mono: { bg: "#e4e1d8", ground: "#dedad0", paper: "#f2efe6", cream: "#faf8f0", ink: "#1a1a1e", accent: "#3a3a42", onAccent: "#faf8f0", pigments: ["#2b2b30", "#8f8f95", "#b4b1aa", "#55555c", "#ece9e1", "#c8c5be", "#16161a", "#6d6d73"] },
    },
    textShadow: () => "none",
    backdrop: (accent, texture, look) => (look && look.ground) || "#e2d3b1",
    css: (accent, look) => `.kicker { letter-spacing: 0.2em; color: ${accent}; text-shadow: none; font-weight: 700; }
      .display { text-shadow: none; }
      /* Headlines land on the marbled sheet itself, which runs from light to dark: each sits on a paper label
         so it reads whatever swirl is behind it. */
      .scene > .display, .scene > .kicker { width: fit-content !important; background: ${look.paper}; color: ${look.ink}; padding: 0 0.18em; border-radius: 0.1em; box-shadow: 0 0.04em 0.1em rgba(0,0,0,0.25); }
      .scene > .kicker { color: ${accent}; }`,
    paint: paintStandalone,
    keepArt: true,
    overlap: true,
    stage,
    scenes: { chart: wrap("chart", chartScene), object: wrap("object", objectScene), people: wrap("people", peopleScene), process: wrap("process", processScene), compare: wrap("compare", compareScene), closing: wrap("closing", closingScene) },
  };
});
