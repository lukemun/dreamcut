// Newsprint: a paste-up desk on a yellowed broadsheet. The whole frame is one dense page of justified
// columns, ruled ads, coarse halftone photos and a running wire ticker, drifting under a slow camera.
// Each scene is a clipping pasted over it: deckled paper, tape, a ruled headline slip, and a drawing
// made only of ink, halftone dots and one spot colour. A printing roller sweeps across to change
// scenes. All characters and drawings are original. Frames are pure functions of time.
window.DreamcutMotion.register("newsprint", ({ rng, hexA }) => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  const e4 = (v) => 1 - Math.pow(1 - clamp(v), 4);
  const inout = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  const back = (v) => { v = clamp(v); const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2); };
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const mod = (a, b) => ((a % b) + b) % b;

  const HEAD = "'Didot','Bodoni 72','Bodoni MT','Playfair Display','Hoefler Text','Times New Roman',serif";
  const LABEL = "'Georgia','Hoefler Text','Times New Roman',serif";
  const TEXTF = "'Hoefler Text','Baskerville','Georgia','Times New Roman',serif";
  const ORDER = ["title", "chart", "object", "people", "process", "compare", "closing"];
  const PAGE = 1.3;
  const TAGS = { chart: "FIG. 1 · CIRCULATION BY THE DAY", object: "FIG. 2 · THE DEVICE, ENGRAVED", people: "FIG. 3 · PORTRAIT GALLERY", process: "FIG. 4 · FROM COPY TO PRESS", compare: "FIG. 5 · THE TALLY" };
  const HEADS = { title: ["kicker", "title"], chart: ["chart-title"], object: ["object-title"], people: ["people-title"], process: ["process-title"], compare: ["compare-title"], closing: ["closing"] };
  const WORDS = ("the of and to in a that council harbour market morning report said new city county board vote bridge school fund season first after over under during week night committee plans public works street train station weather clear cloud rain wind farmers fair price grain mill library museum choir band parade garden river lamp tram clock editor press wire courier notice meeting hall mayor clerk budget repair road tower ferry orchard festival trade union guild lecture concert harvest bakery tailor quarry canal depot signal postal summer winter ledger bulletin evening dispatch quarter reader printer column lantern")
    .split(" ");
  const ADWORDS = ["SALE", "NEW!", "FRESH", "TONIC", "HATS", "COAL", "PIES", "SOAP", "TEA", "SHOES", "FLOUR", "CLOCKS"];
  const HEADWORDS = ["COUNCIL VOTES ON BRIDGE", "HARBOUR TRADE UP", "FAIR OPENS TO CROWDS", "NEW LIBRARY WING", "RAIN EASES BY NIGHT", "GRAIN PRICES HOLD", "CHOIR TAKES THE PRIZE", "TRAM LINE EXTENDED", "MARKET HALL REOPENS", "MILL WORKERS MEET", "LAMPS LIT ON ELM ST."];

  // ---- small drawing helpers -------------------------------------------------------------------------
  function rr(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function line(g, x1, y1, x2, y2, w, color, dash, q = 1) {
    if (q <= 0) return;
    g.save();
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(lerp(x1, x2, q), lerp(y1, y2, q));
    g.strokeStyle = color; g.lineWidth = w; g.lineCap = "round"; g.setLineDash(dash || []); g.stroke();
    g.restore();
  }
  function say(g, s, x, y, size, o = {}) {
    s = String(s ?? "");
    if (o.upper) s = s.toUpperCase();
    const q = o.q ?? 1;
    if (!s || q <= 0) return 0;
    const fam = o.font || LABEL, wt = o.weight || 700, it = o.italic ? "italic " : "";
    g.save();
    g.font = `${it}${wt} ${size}px ${fam}`;
    g.letterSpacing = (o.track || 0) * size + "px";
    let w = g.measureText(s).width;
    if (o.maxW && w > o.maxW) {
      size = Math.max(o.min || size * 0.7, (size * o.maxW) / w);
      g.font = `${it}${wt} ${size}px ${fam}`;
      g.letterSpacing = (o.track || 0) * size + "px";
      w = g.measureText(s).width;
    }
    const x0 = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    g.textAlign = "left";
    g.textBaseline = o.base || "alphabetic";
    g.fillStyle = o.color;
    g.fillText(q >= 1 ? s : s.slice(0, Math.ceil(s.length * q)), x0, y);
    g.restore();
    return w;
  }
  function wrap(g, s, size, maxW, font = LABEL, weight = 700) {
    g.save(); g.font = `${weight} ${size}px ${font}`;
    const words = String(s ?? "").split(/\s+/).filter(Boolean), lines = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? cur + " " + w : w;
      if (cur && g.measureText(next).width > maxW) { lines.push(cur); cur = w; } else cur = next;
    }
    if (cur) lines.push(cur);
    g.restore();
    return lines;
  }
  const fmt = (v, d) => window.DreamcutMotion.formatNumber(v, Math.abs((Number(v) || 0) % 1) > 0.001 ? 1 : 0, (d && d.prefix) || "", (d && d.suffix) || "");
  const tally = (target, k, d) => { const dec = Math.abs((Number(target) || 0) % 1) > 0.001 ? 1 : 0; return window.DreamcutMotion.formatNumber(target * k, dec, (d && d.prefix) || "", (d && d.suffix) || ""); };
  const niceStep = (x) => { const p = Math.pow(10, Math.floor(Math.log10(Math.max(x, 1e-6)))), m = x / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };

  // A coarse halftone: dots on a rotated lattice whose size follows tone(nx, ny) (0 light .. 1 dark).
  function halftone(g, x, y, w, h, pitch, ang, tone, color, maxR = 0.64) {
    if (w <= 0 || h <= 0) return;
    const ca = Math.cos(ang), sa = Math.sin(ang), cx = x + w / 2, cy = y + h / 2, n = Math.ceil(Math.hypot(w, h) / 2 / pitch);
    g.beginPath();
    for (let i = -n; i <= n; i++) {
      for (let j = -n; j <= n; j++) {
        const lx = i * pitch, ly = j * pitch, px = cx + lx * ca - ly * sa, py = cy + lx * sa + ly * ca;
        if (px < x || px > x + w || py < y || py > y + h) continue;
        const d = tone((px - x) / w, (py - y) / h);
        if (d <= 0.04) continue;
        const r = pitch * maxR * Math.sqrt(d > 1 ? 1 : d);
        g.moveTo(px + r, py); g.arc(px, py, r, 0, TAU);
      }
    }
    g.fillStyle = color; g.fill();
  }
  // A blotchy photo made of a few soft shapes; with t it drifts, so the dots move.
  function blobTone(seed) {
    const r = rng(seed), bl = [];
    for (let i = 0; i < 7; i++) bl.push({ x: r(), y: 0.1 + r() * 0.8, s: 0.1 + r() * 0.2, a: (r() - 0.35) * 1.1, sp: 0.4 + r() * 0.8, ph: r() * TAU });
    const base = 0.18 + r() * 0.2, slope = 0.2 + r() * 0.3;
    return (nx, ny, t = 0) => {
      let v = base + slope * ny;
      for (const b of bl) {
        const bx = b.x + Math.sin(t * b.sp + b.ph) * 0.07, by = b.y + Math.cos(t * b.sp * 0.8 + b.ph) * 0.04;
        v += b.a * Math.exp(-((nx - bx) * (nx - bx) + (ny - by) * (ny - by)) / (b.s * b.s));
      }
      return v < 0 ? 0 : v > 1 ? 1 : v;
    };
  }

  // ---- paper, pages, textures (built once per size and palette) --------------------------------------------
  const CACHE = {};
  function tiles(F) {
    const key = `${F.W}x${F.H}|${F.T.paper}`;
    if (CACHE.tileKey === key) return CACHE;
    const { T, u } = F, r = rng(77);
    const mk = (n) => { const c = document.createElement("canvas"); c.width = c.height = n; return c; };
    // Grain and fibre.
    const grain = mk(320), gg = grain.getContext("2d");
    for (let i = 0; i < 2600; i++) { gg.fillStyle = `rgba(${T.ink},${0.03 + r() * 0.1})`; const s = (0.6 + r() * 1.6) * Math.max(0.8, u); gg.fillRect(r() * 320, r() * 320, s, s); }
    for (let i = 0; i < 160; i++) {
      const x = r() * 320, y = r() * 320, a = r() * TAU, l = (6 + r() * 20) * u;
      gg.strokeStyle = `rgba(${T.stain},${0.08 + r() * 0.1})`; gg.lineWidth = Math.max(0.7, 0.9 * u);
      gg.beginPath(); gg.moveTo(x, y); gg.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + r() * 4, y + Math.sin(a) * l * 0.5 + r() * 4, x + Math.cos(a) * l, y + Math.sin(a) * l); gg.stroke();
    }
    // Ink wear: paper-coloured specks that thin the print.
    const wear = mk(384), wg = wear.getContext("2d");
    for (let i = 0; i < 1500; i++) { wg.fillStyle = `rgba(${T.wear},${0.25 + r() * 0.6})`; const s = (0.7 + r() * 2.2) * Math.max(0.8, u); wg.fillRect(r() * 384, r() * 384, s, s * (0.6 + r())); }
    for (let i = 0; i < 40; i++) {
      wg.fillStyle = `rgba(${T.wear},${0.3 + r() * 0.4})`; wg.beginPath(); wg.ellipse(r() * 384, r() * 384, (3 + r() * 9) * u, (2 + r() * 5) * u, r() * TAU, 0, TAU); wg.fill();
    }
    CACHE.tileKey = key; CACHE.grain = grain; CACHE.wear = wear; CACHE.pageKey = ""; CACHE.stainKey = "";
    return CACHE;
  }
  function paragraph(g, F, r, x, y, w, n, size, opts = {}) {
    const lh = size * 1.18;
    g.font = `${size}px ${TEXTF}`; g.textBaseline = "alphabetic";
    for (let l = 0; l < n; l++) {
      const ind = opts.dropLines && l < opts.dropLines ? opts.dropW : 0;
      const last = l === n - 1, lw = (w - ind) * (last ? 0.3 + r() * 0.5 : 1);
      const ws = []; let tw = 0;
      for (let k = 0; k < 16; k++) {
        const wd = WORDS[(r() * WORDS.length) | 0], m = g.measureText(wd).width;
        if (ws.length >= 2 && tw + m + ws.length * size * 0.26 > lw) break;
        ws.push([wd, m]); tw += m;
      }
      const gap = last || ws.length < 2 ? size * 0.28 : (lw - tw) / (ws.length - 1);
      g.fillStyle = F.ink(0.58 + r() * 0.26);
      let px = x + ind;
      for (const [wd, m] of ws) { g.fillText(wd, px, y + l * lh + size); px += m + gap; }
    }
    return n * lh;
  }
  function storyBlock(g, F, r, x, y, w, maxH, wide) {
    const { u, T } = F;
    const hs = (26 + r() * 14) * u * (wide ? 1.5 : 1);
    const title = HEADWORDS[(r() * HEADWORDS.length) | 0];
    g.font = `900 ${hs}px ${HEAD}`;
    const lines = wrap(g, title, hs, w, HEAD, 900);
    const headH = lines.length * hs * 1.02 + 20 * u;
    const size = 14.5 * u, lh = size * 1.18;
    const nBody = Math.min(Math.floor((maxH - headH - 24 * u) / lh), 6 + ((r() * 16) | 0));
    if (nBody < 4) return 0;
    let cy = y;
    g.fillStyle = F.ink(0.9); g.fillRect(x, cy, w, 3.2 * u); cy += 9 * u;
    g.font = `900 ${hs}px ${HEAD}`; g.fillStyle = F.ink(0.92);
    for (const l of lines) { g.fillText(l.toUpperCase(), x, cy + hs * 0.82); cy += hs * 1.02; }
    g.fillStyle = F.ink(0.5); g.fillRect(x, cy + 3 * u, w, 1.2 * u); cy += 11 * u;
    const drop = r() < 0.5;
    if (drop) {
      const dw = size * 2.1;
      g.font = `900 ${size * 3.6}px ${HEAD}`; g.fillStyle = F.ink(0.9); g.fillText(String.fromCharCode(65 + ((r() * 26) | 0)), x, cy + size * 2.9);
      paragraph(g, F, r, x, cy, w, nBody, size, { dropLines: 3, dropW: dw });
    } else paragraph(g, F, r, x, cy, w, nBody, size);
    return cy + nBody * lh - y + 14 * u;
  }
  function photoBlock(g, F, r, x, y, w, h) {
    const { u, T } = F;
    g.fillStyle = T.lite; g.fillRect(x, y, w, h);
    const tone = blobTone(((r() * 1e6) | 0) + 3);
    halftone(g, x + 3 * u, y + 3 * u, w - 6 * u, h - 6 * u, Math.max(5 * u, w / 44), 0.52, (nx, ny) => tone(nx, ny), F.ink(0.86));
    g.strokeStyle = F.ink(0.9); g.lineWidth = 2 * u; g.strokeRect(x, y, w, h);
    const cap = 12 * u;
    g.font = `italic ${cap}px ${TEXTF}`; g.fillStyle = F.ink(0.6);
    g.fillText("Crowds gather near the old harbour steps.", x, y + h + cap * 1.3);
    return h + cap * 2.1 + 12 * u;
  }
  function adBlock(g, F, r, x, y, w) {
    const { u, T } = F, h = w * (0.7 + r() * 0.5), spot = r() < 0.4;
    const word = ADWORDS[(r() * ADWORDS.length) | 0];
    g.fillStyle = spot ? hexA(F.S.accent, 0.88) : T.lite; g.fillRect(x, y, w, h);
    g.strokeStyle = F.ink(0.9); g.lineWidth = 4 * u; g.strokeRect(x + 2 * u, y + 2 * u, w - 4 * u, h - 4 * u);
    g.lineWidth = 1.2 * u; g.strokeRect(x + 9 * u, y + 9 * u, w - 18 * u, h - 18 * u);
    if (!spot && r() < 0.6) {
      g.save(); g.beginPath(); g.rect(x + 12 * u, y + 12 * u, w - 24 * u, h - 24 * u); g.clip();
      g.strokeStyle = F.ink(0.18); g.lineWidth = 3 * u;
      const cx = x + w / 2, cy = y + h * 0.5;
      for (let a = 0; a < 28; a++) { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos((a / 28) * TAU) * w, cy + Math.sin((a / 28) * TAU) * w); g.stroke(); }
      g.restore();
    }
    const col = spot ? T.lite : F.ink(0.95);
    say(g, word, x + w / 2, y + h * 0.55, Math.min(w * 0.34, h * 0.4), { align: "center", color: col, font: HEAD, weight: 900 });
    for (let k = 0; k < 3; k++) { g.fillStyle = spot ? "rgba(255,255,255,0.7)" : F.ink(0.45); g.fillRect(x + w * 0.2, y + h * 0.68 + k * 10 * u, w * (0.6 - k * 0.12), 3 * u); }
    return h + 12 * u;
  }
  function tableBlock(g, F, r, x, y, w, h) {
    const { u } = F, names = ["WHEAT", "COAL", "TIN", "WOOL", "SALT", "TEA", "IRON", "JUTE", "RYE", "OATS", "COPPER", "FLAX"];
    const size = 12.5 * u, rowH = size * 1.55, n = Math.min(names.length, Math.floor(h / rowH));
    g.fillStyle = F.ink(0.9); g.fillRect(x, y, w, 3 * u);
    g.font = `800 ${size * 1.15}px ${LABEL}`; g.fillStyle = F.ink(0.9); g.fillText("THE MARKETS", x, y + size * 1.9);
    for (let i = 0; i < n; i++) {
      const yy = y + size * 2.7 + (i + 1) * rowH;
      g.font = `700 ${size}px ${LABEL}`; g.fillStyle = F.ink(0.75); g.fillText(names[i], x, yy);
      g.textAlign = "right"; g.fillText(`${(10 + r() * 90).toFixed(1)} ${r() < 0.5 ? "▲" : "▼"}`, x + w, yy); g.textAlign = "left";
      g.strokeStyle = F.ink(0.3); g.lineWidth = 1 * u; g.setLineDash([2 * u, 3 * u]); g.beginPath(); g.moveTo(x + w * 0.4, yy - 3 * u); g.lineTo(x + w * 0.66, yy - 3 * u); g.stroke(); g.setLineDash([]);
    }
    return size * 2.7 + (n + 1) * rowH + 8 * u;
  }
  function crossBlock(g, F, r, x, y, w) {
    const { u } = F, n = 11, c = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (r() < 0.2) { g.fillStyle = F.ink(0.9); g.fillRect(x + i * c, y + j * c, c, c); }
    }
    g.strokeStyle = F.ink(0.75); g.lineWidth = 1.1 * u;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(x + i * c, y); g.lineTo(x + i * c, y + n * c); g.moveTo(x, y + i * c); g.lineTo(x + n * c, y + i * c); g.stroke(); }
    return w + 10 * u;
  }
  function buildPage(F) {
    const { W, H, u, T } = F, PW = Math.round(W * PAGE), PH = Math.round(H * PAGE);
    const cv = document.createElement("canvas"); cv.width = PW; cv.height = PH;
    const g = cv.getContext("2d"), r = rng(65);
    g.fillStyle = T.paper; g.fillRect(0, 0, PW, PH);
    const margin = 36 * u, gut = 22 * u, cols = Math.max(3, Math.round((PW - margin * 2) / (F.tall ? 232 * u : 262 * u)));
    const colW = (PW - margin * 2 - gut * (cols - 1)) / cols;
    const colY = new Array(cols).fill(margin);
    for (let n = 0; n < 500; n++) {
      let c = 0;
      for (let i = 1; i < cols; i++) if (colY[i] < colY[c]) c = i;
      const y = colY[c];
      if (y > PH - 60 * u) break;
      const wide = c + 1 < cols && r() < 0.2 && Math.abs(colY[c + 1] - y) < 120 * u;
      const yy = wide ? Math.max(y, colY[c + 1]) : y, w = wide ? colW * 2 + gut : colW, x = margin + c * (colW + gut), maxH = PH - 30 * u - yy;
      const k = r(); let h = 0;
      if (k < 0.42) h = storyBlock(g, F, r, x, yy, w, maxH, wide);
      else if (k < 0.56) { const ph = w * (0.62 + r() * 0.2); if (ph + 30 * u < maxH) h = photoBlock(g, F, r, x, yy, w, ph); }
      else if (k < 0.68) { const ah = w * 0.9; if (ah < maxH) h = adBlock(g, F, r, x, yy, w); }
      else if (k < 0.76) h = tableBlock(g, F, r, x, yy, w, Math.min(maxH, 260 * u));
      else if (k < 0.81) { if (w + 10 * u < maxH) h = crossBlock(g, F, r, x, yy, w); }
      else h = storyBlock(g, F, r, x, yy, w, Math.min(maxH, 200 * u), false);
      if (h <= 0) { colY[c] = PH; if (wide) colY[c + 1] = PH; continue; }
      const ny = yy + h + 6 * u;
      g.fillStyle = F.ink(0.35); g.fillRect(x, ny - 3 * u, w, 1 * u);
      colY[c] = ny + 8 * u; if (wide) colY[c + 1] = ny + 8 * u;
    }
    for (let c = 1; c < cols; c++) { const x = margin + c * (colW + gut) - gut / 2; g.fillStyle = F.ink(0.42); g.fillRect(x, margin * 0.5, 1.2 * u, PH - margin); }
    return cv;
  }
  function stains(F) {
    const { W, H, u, T } = F, PW = Math.round(W * PAGE), PH = Math.round(H * PAGE), r = rng(19);
    const cv = document.createElement("canvas"); cv.width = PW; cv.height = PH;
    const g = cv.getContext("2d");
    for (let i = 0; i < 30; i++) {
      const x = r() * PW, y = r() * PH, rad = (160 + r() * 460) * u, gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(${T.stain},${0.06 + r() * 0.1})`); gr.addColorStop(1, `rgba(${T.stain},0)`);
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // Fold creases: a bright lip and a dark shadow along each.
    for (const [hv, pos] of [[true, 0.5], [false, 0.5], [false, 0.17]]) {
      const band = 36 * u, a = hv ? PH * pos : PW * pos;
      const gr = hv ? g.createLinearGradient(0, a - band, 0, a + band) : g.createLinearGradient(a - band, 0, a + band, 0);
      gr.addColorStop(0, "rgba(255,250,230,0)"); gr.addColorStop(0.42, `rgba(255,250,230,${T.fold})`); gr.addColorStop(0.5, `rgba(${T.stain},${T.fold * 1.2})`); gr.addColorStop(0.58, "rgba(255,250,230,0)"); gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr; if (hv) g.fillRect(0, a - band, PW, band * 2); else g.fillRect(a - band, 0, band * 2, PH);
    }
    return cv;
  }
  function camera(F) {
    const { t, W, H } = F, z = 1.03 + 0.02 * Math.sin(t * 0.17);
    const PW = W * PAGE, PH = H * PAGE;
    return { z, x: (W - PW * z) / 2 + Math.sin(t * 0.23) * W * 0.045 - t * 3 * F.u, y: (H - PH * z) / 2 + Math.cos(t * 0.19) * H * 0.04 };
  }
  function drawPage(g, F) {
    const C = tiles(F);
    const key = `${F.W}x${F.H}|${F.T.paper}|${F.S.accent}`;
    if (C.pageKey !== key) { C.page = buildPage(F); C.stain = stains(F); C.pageKey = key; }
    const cam = camera(F), { W, H } = F;
    g.save();
    g.fillStyle = F.T.paper; g.fillRect(0, 0, W, H);
    g.translate(cam.x, cam.y); g.scale(cam.z, cam.z);
    g.drawImage(C.page, 0, 0);
    if (F.tex > 0) { g.globalAlpha = F.tex; g.drawImage(C.stain, 0, 0); g.globalAlpha = 1; }
    g.restore();
  }

  // ---- chrome: dateline, ticker, headline slip ----------------------------------------------------------------
  function headLines(id) {
    const cache = (headLines.c = headLines.c || {});
    if (cache[id]) return cache[id];
    const el = document.getElementById(id), root = document.getElementById("root");
    if (!el || !root || !el.firstChild) return (cache[id] = []);
    let ox = 0, oy = 0;
    for (let n = el; n && n !== root; n = n.offsetParent) { ox += n.offsetLeft; oy += n.offsetTop; }
    const scale = root.getBoundingClientRect().width / (Number(root.dataset.width) || 1920) || 1;
    const er = el.getBoundingClientRect(), range = document.createRange();
    range.selectNodeContents(el);
    const out = [];
    for (const r of range.getClientRects()) {
      const l = { x: ox + (r.left - er.left) / scale, y: oy + (r.top - er.top) / scale, w: r.width / scale, h: r.height / scale };
      if (l.w > 1 && !out.some((o) => Math.abs(o.y - l.y) < 2)) out.push(l);
    }
    return (cache[id] = out);
  }
  function unionOf(ids) {
    const ls = ids.flatMap((id) => headLines(id));
    if (!ls.length) return null;
    return { x1: Math.min(...ls.map((l) => l.x)), y1: Math.min(...ls.map((l) => l.y)), x2: Math.max(...ls.map((l) => l.x + l.w)), y2: Math.max(...ls.map((l) => l.y + l.h)) };
  }
  function dateline(g, F) {
    const { u, W, tall, t } = F, y = 22 * u;
    const q = span(t, 0, 0.8);
    g.save(); g.globalAlpha = q;
    g.fillStyle = F.T.strip; g.fillRect(40 * u, y - 4 * u, W - 80 * u, 44 * u);
    line(g, 40 * u, y - 4 * u, W - 40 * u, y - 4 * u, 4 * u, F.ink(0.9));
    line(g, 40 * u, y + 40 * u, W - 40 * u, y + 40 * u, 2 * u, F.ink(0.9));
    line(g, 40 * u, y + 46 * u, W - 40 * u, y + 46 * u, 1 * u, F.ink(0.7));
    const s = 25 * u;
    if (!tall) say(g, "VOL. CXII · NO. 8", 56 * u, y + 29 * u, s, { color: F.ink(0.8), weight: 700, track: 0.12 });
    say(g, tall ? "THE DREAMCUT DISPATCH · LATE EDITION" : "THE DREAMCUT DISPATCH · LATE CITY EDITION", W / 2, y + 29 * u, s, { align: "center", color: F.ink(0.9), weight: 800, track: 0.14, maxW: W - 140 * u });
    if (!tall) say(g, "ONE PENNY", W - 56 * u, y + 29 * u, s, { align: "right", color: F.acc(1), weight: 800, track: 0.12 });
    g.restore();
  }
  function ticker(g, F) {
    const { u, W, H, t } = F, h = 54 * u, y = H - 70 * u;
    g.save();
    g.fillStyle = F.ink(0.94); g.fillRect(0, y, W, h);
    g.beginPath(); g.rect(0, y, W, h); g.clip();
    const msg = "WIRE ▸ PRESSES RUN AT DAWN  ·  GRAIN STEADY  ·  CHOIR WINS THE CUP  ·  RAIN EASES BY NIGHT  ·  NEW TRAM STOP AT ELM  ·  EXTRA EXTRA  ·  ";
    const size = 31 * u;
    g.font = `800 ${size}px ${LABEL}`; g.letterSpacing = 0.06 * size + "px";
    const loop = g.measureText(msg).width;
    g.fillStyle = F.T.lite;
    for (let k = -1; k < Math.ceil(W / loop) + 1; k++) g.fillText(msg, k * loop - mod(t * 170 * u, loop), y + h * 0.7);
    g.letterSpacing = "0px";
    g.fillStyle = F.acc(1); g.fillRect(0, y, 170 * u, h);
    say(g, "LIVE", 85 * u, y + h * 0.7, 32 * u, { align: "center", color: F.T.onAccent, weight: 800, track: 0.2 });
    g.fillStyle = F.T.lite; g.beginPath(); g.arc(30 * u, y + h / 2, 6 * u * (0.7 + 0.3 * Math.sin(t * 6)), 0, TAU); g.fill();
    g.restore();
  }
  function slip(g, F, ids, local, hold, change, o = {}) {
    const b = unionOf(ids);
    if (!b) return;
    const { u, W, T } = F, q = e4(span(local, 0.04, 0.74)), fade = o.last ? 1 : 1 - span(local, hold - change, hold);
    if (q <= 0 || fade <= 0) return;
    const pad = 34 * u, x = b.x1 - pad, y = b.y1 - 12 * u, w = b.x2 - b.x1 + pad * 2, h = b.y2 - b.y1 + 24 * u;
    g.save(); g.globalAlpha = fade;
    g.beginPath(); g.rect(x - 60 * u, y - 60 * u, (w + 120 * u) * q + 60 * u, h + 120 * u); g.clip();
    // The banner rule runs on from the slip to the margin.
    if (o.center) {
      line(g, 60 * u, y + h / 2, x - 10 * u, y + h / 2, 3 * u, F.ink(0.85));
      line(g, x + w + 10 * u, y + h / 2, W - 60 * u, y + h / 2, 3 * u, F.ink(0.85));
      for (const px of [60 * u, W - 60 * u]) { g.fillStyle = F.ink(0.9); g.beginPath(); g.moveTo(px, y + h / 2 - 9 * u); g.lineTo(px + 9 * u, y + h / 2); g.lineTo(px, y + h / 2 + 9 * u); g.lineTo(px - 9 * u, y + h / 2); g.fill(); }
    } else {
      line(g, x + w, y + h - 2 * u, W - 50 * u, y + h - 2 * u, 6 * u, F.ink(0.9));
      line(g, x + w, y + h + 8 * u, W - 50 * u, y + h + 8 * u, 1.6 * u, F.ink(0.8));
      if (o.tag) say(g, o.tag, W - 56 * u, y + h - 16 * u, 26 * u, { align: "right", color: F.ink(0.75), weight: 800, track: 0.14 });
    }
    g.shadowColor = "rgba(0,0,0,0.3)"; g.shadowBlur = 16 * u; g.shadowOffsetY = 7 * u;
    g.fillStyle = T.strip; g.fillRect(x, y, w, h);
    g.shadowColor = "transparent";
    g.fillStyle = F.ink(0.94); g.fillRect(x, y, w, 6 * u); g.fillRect(x, y + 11 * u, w, 1.8 * u);
    g.fillRect(x, y + h - 6 * u, w, 6 * u); g.fillRect(x, y + h - 17 * u, w, 1.8 * u);
    // Registration ticks and a spot-colour corner mark.
    g.fillStyle = F.acc(1); g.fillRect(x, y + 14 * u, 10 * u, h - 28 * u);
    g.restore();
  }

  // ---- the pasted clipping --------------------------------------------------------------------------------------
  function deckle(g, R, seed, u) {
    const step = 20 * u, pts = [];
    const edge = (x1, y1, x2, y2, s) => {
      const n = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / step));
      for (let i = 0; i < n; i++) { const k = i / n; pts.push([lerp(x1, x2, k) + (hash(seed + s + i * 3.1) - 0.5) * 3.4 * u, lerp(y1, y2, k) + (hash(seed + s + i * 5.3 + 9) - 0.5) * 3.4 * u]); }
    };
    edge(R.x, R.y, R.x + R.w, R.y, 1); edge(R.x + R.w, R.y, R.x + R.w, R.y + R.h, 2);
    edge(R.x + R.w, R.y + R.h, R.x, R.y + R.h, 3); edge(R.x, R.y + R.h, R.x, R.y, 4);
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
  }
  function tape(g, F, x, y, rot) {
    const { u } = F;
    g.save(); g.translate(x, y); g.rotate(rot);
    g.fillStyle = F.T.tape; g.fillRect(-62 * u, -17 * u, 124 * u, 34 * u);
    g.strokeStyle = "rgba(120,100,50,0.35)"; g.lineWidth = 1.2 * u; g.strokeRect(-62 * u, -17 * u, 124 * u, 34 * u);
    g.fillStyle = "rgba(255,255,255,0.28)"; g.fillRect(-62 * u, -17 * u, 124 * u, 9 * u);
    g.restore();
  }
  // Panel rectangle for a scene: from under its headline slip to just above the ticker.
  function panelOf(F, id) {
    const { u, W, H, tall } = F, ids = HEADS[id], b = ids ? unionOf(ids) : null;
    const top = b ? Math.max(b.y2 + (tall ? 64 : 46) * u, H * 0.2) : H * 0.3, side = (tall ? 54 : 100) * u;
    return { x: side, y: top, w: W - side * 2, h: H - 94 * u - top };
  }
  // Draws `fn(C, build)` on a clipping; C is the inner content area.
  function clipping(g, F, R, seed, local, tag, fn) {
    const { u, T, t } = F, k = span(local, 0, 0.45);
    const s = 1 + 0.03 * (1 - ease(k)), rot = (hash(seed) - 0.5) * 0.01 + Math.sin(t * 0.7 + seed) * 0.0018;
    const cx = R.x + R.w / 2, cy = R.y + R.h / 2;
    g.save();
    g.translate(cx, cy + Math.sin(t * 0.9 + seed) * 2.5 * u); g.rotate(rot); g.scale(s, s); g.translate(-cx, -cy);
    g.save();
    g.shadowColor = "rgba(20,12,0,0.42)"; g.shadowBlur = (24 + 16 * (1 - ease(k))) * u; g.shadowOffsetX = 6 * u; g.shadowOffsetY = (10 + 10 * (1 - ease(k))) * u;
    deckle(g, R, seed, u); g.fillStyle = T.panel; g.fill();
    g.restore();
    deckle(g, R, seed, u); g.save(); g.clip();
    const C0 = tiles(F);
    if (F.tex > 0) { g.globalAlpha = 0.55 * F.tex; g.fillStyle = g.createPattern(C0.grain, "repeat"); g.fillRect(R.x, R.y, R.w, R.h); g.globalAlpha = 1; }
    // Rules and the figure tag.
    const ix = R.x + 16 * u, iy = R.y + 16 * u, iw = R.w - 32 * u, ih = R.h - 32 * u;
    g.strokeStyle = F.ink(0.9); g.lineWidth = 4 * u; g.strokeRect(ix, iy, iw, ih);
    g.strokeStyle = F.ink(0.65); g.lineWidth = 1.2 * u; g.strokeRect(ix + 8 * u, iy + 8 * u, iw - 16 * u, ih - 16 * u);
    g.fillStyle = F.ink(0.92); g.fillRect(ix + 8 * u, iy + 8 * u, iw - 16 * u, 38 * u);
    say(g, tag, ix + 26 * u, iy + 36 * u, 24 * u, { color: T.lite, weight: 800, track: 0.16 });
    if (!F.tall) say(g, "THE DREAMCUT DISPATCH", ix + iw - 26 * u, iy + 36 * u, 22 * u, { align: "right", color: T.lite, weight: 700, track: 0.14 });
    const C = { x: ix + 36 * u, y: iy + 66 * u, w: iw - 72 * u, h: ih - 66 * u - 30 * u };
    fn(C);
    g.restore();
    tape(g, F, R.x + 70 * u, R.y + 6 * u, -0.5); tape(g, F, R.x + R.w - 70 * u, R.y + 6 * u, 0.45);
    g.restore();
  }

  // ---- halftone with the look's blend --------------------------------------------------------------------------
  function dotsIn(g, F, rect, pitch, tone, color, ang = 0.52) {
    g.save();
    g.globalCompositeOperation = F.T.blend;
    halftone(g, rect.x, rect.y, rect.w, rect.h, pitch, ang, tone, color);
    g.restore();
  }

  // ---- chart ---------------------------------------------------------------------------------------------------
  function cyclist(g, F, Z, t) {
    const sc = Z.h / 200, gy = Z.y + Z.h - 8 * sc, ink = F.ink(0.92), acc = F.acc(1);
    g.save();
    g.beginPath(); g.rect(Z.x, Z.y, Z.w, Z.h); g.clip();
    // Houses slide past.
    const pitch = 230 * sc, off = mod(t * 70 * sc, pitch);
    for (let k = -1; k < Z.w / pitch + 2; k++) {
      const hx = Z.x + k * pitch - off + 20 * sc * hash(Math.floor(k + t * 70 * sc / pitch) + 4), hw = 118 * sc, hh = 70 * sc + hash(Math.floor(k + t * 70 * sc / pitch)) * 24 * sc;
      g.fillStyle = F.ink(0.22); g.fillRect(hx, gy - hh, hw, hh);
      g.beginPath(); g.moveTo(hx - 8 * sc, gy - hh); g.lineTo(hx + hw / 2, gy - hh - 40 * sc); g.lineTo(hx + hw + 8 * sc, gy - hh); g.fill();
      g.fillStyle = F.T.lite; g.fillRect(hx + 18 * sc, gy - hh + 18 * sc, 24 * sc, 24 * sc); g.fillRect(hx + hw - 42 * sc, gy - hh + 18 * sc, 24 * sc, 24 * sc);
    }
    line(g, Z.x, gy, Z.x + Z.w, gy, 4 * sc, ink);
    for (let k = -1; k < Z.w / (40 * sc) + 1; k++) line(g, Z.x + k * 40 * sc - mod(t * 150 * sc, 40 * sc), gy + 9 * sc, Z.x + k * 40 * sc - mod(t * 150 * sc, 40 * sc) + 18 * sc, gy + 9 * sc, 3 * sc, F.ink(0.5));
    const bx = Z.x + Z.w * 0.42, wr = 34 * sc, rear = [bx - 48 * sc, gy - wr - 3 * sc], front = [bx + 48 * sc, gy - wr - 3 * sc];
    const ang = t * 6;
    for (const [wx, wy] of [rear, front]) {
      g.beginPath(); g.arc(wx, wy, wr, 0, TAU); g.strokeStyle = ink; g.lineWidth = 4.5 * sc; g.stroke();
      for (let s = 0; s < 8; s++) { const a = ang + (s / 8) * TAU; line(g, wx, wy, wx + Math.cos(a) * wr, wy + Math.sin(a) * wr, 1.4 * sc, F.ink(0.7)); }
    }
    const S0 = [bx - 16 * sc, gy - 92 * sc], BB = [bx, gy - 36 * sc], H0 = [bx + 40 * sc, gy - 86 * sc];
    const fr = (a, b, w = 4.5) => line(g, a[0], a[1], b[0], b[1], w * sc, ink);
    fr(rear, BB); fr(rear, S0); fr(S0, BB); fr(BB, H0); fr(S0, H0); fr(H0, front); fr(H0, [H0[0] + 14 * sc, H0[1] - 10 * sc], 4);
    line(g, S0[0] - 14 * sc, S0[1] - 4 * sc, S0[0] + 10 * sc, S0[1] - 4 * sc, 7 * sc, ink);
    const a = t * 6, ped = [[BB[0] + Math.cos(a) * 20 * sc, BB[1] + Math.sin(a) * 20 * sc], [BB[0] - Math.cos(a) * 20 * sc, BB[1] - Math.sin(a) * 20 * sc]];
    const hip = [S0[0] - 2 * sc, S0[1] - 10 * sc], sh = [hip[0] + 24 * sc, hip[1] - 46 * sc];
    // Bag, torso, head, cap.
    g.fillStyle = acc; rr(g, hip[0] - 40 * sc, hip[1] - 14 * sc, 34 * sc, 30 * sc, 6 * sc); g.fill();
    g.beginPath(); g.moveTo(hip[0] - 8 * sc, hip[1]); g.lineTo(sh[0] - 12 * sc, sh[1]); g.lineTo(sh[0] + 12 * sc, sh[1] + 4 * sc); g.lineTo(hip[0] + 10 * sc, hip[1] + 6 * sc); g.closePath();
    g.fillStyle = F.ink(0.88); g.fill();
    line(g, sh[0] + 4 * sc, sh[1] + 4 * sc, H0[0] + 14 * sc, H0[1] - 10 * sc, 5 * sc, ink);
    for (const p of ped) {
      const d = Math.hypot(p[0] - hip[0], p[1] - hip[1]), L = 50 * sc, hgt = Math.sqrt(Math.max(0, L * L - Math.min(d, 2 * L - 1) * Math.min(d, 2 * L - 1) / 4));
      const mx = (hip[0] + p[0]) / 2, my = (hip[1] + p[1]) / 2, nx = (p[1] - hip[1]) / (d || 1), ny = -(p[0] - hip[0]) / (d || 1);
      const kn = [mx + nx * hgt, my + ny * hgt], kn2 = kn[0] < mx ? [mx - nx * hgt, my - ny * hgt] : kn;
      line(g, hip[0], hip[1], kn2[0], kn2[1], 6 * sc, ink); line(g, kn2[0], kn2[1], p[0], p[1], 5 * sc, ink);
    }
    const hd = [sh[0] + 12 * sc, sh[1] - 20 * sc];
    g.beginPath(); g.arc(hd[0], hd[1], 14 * sc, 0, TAU); g.fillStyle = F.T.lite; g.fill(); g.strokeStyle = ink; g.lineWidth = 4 * sc; g.stroke();
    g.beginPath(); g.arc(hd[0], hd[1], 15 * sc, Math.PI * 1.05, Math.PI * 1.95); g.fillStyle = ink; g.fill();
    g.fillRect(hd[0] + 4 * sc, hd[1] - 9 * sc, 18 * sc, 5 * sc);
    // Thrown paper.
    const k = mod(t + 0.3, 1.7) / 1.7;
    const sx = sh[0] + 16 * sc, sy = sh[1] - 6 * sc, ex = Z.x + Z.w + 20 * sc, ey = gy - 16 * sc;
    const px = lerp(sx, ex, k), py = lerp(sy, ey, k) - Math.sin(k * Math.PI) * 80 * sc;
    g.save(); g.translate(px, py); g.rotate(k * 14);
    g.fillStyle = F.T.lite; g.fillRect(-14 * sc, -7 * sc, 28 * sc, 14 * sc); g.strokeStyle = ink; g.lineWidth = 2.2 * sc; g.strokeRect(-14 * sc, -7 * sc, 28 * sc, 14 * sc);
    g.fillStyle = acc; g.fillRect(-4 * sc, -7 * sc, 6 * sc, 14 * sc);
    g.restore();
    g.restore();
  }
  function drawChart(g, F, local, hold, d) {
    const { u, tall, T, t } = F, R = panelOf(F, "chart");
    clipping(g, F, R, 3, local, TAGS.chart, (C) => {
      const p = clamp(local / Math.min(2.4, hold * 0.6));
      const vals = (d.values || []).map((v) => Math.max(0, Number(v) || 0)), n = Math.max(1, vals.length), max = Math.max(...vals, 1);
      const hi = d.highlight >= 0 && d.highlight < n ? d.highlight : -1;
      const stepV = niceStep(max / 5), topV = Math.max(stepV, Math.ceil(max / stepV) * stepV);
      const RO = tall ? { x: C.x, y: C.y, w: C.w, h: 290 * u } : { x: C.x + C.w * 0.67, y: C.y, w: C.w * 0.33, h: C.h };
      const P = tall ? { x: C.x + 110 * u, y: C.y + 400 * u, w: C.w - 110 * u, h: C.h - 400 * u - 80 * u } : { x: C.x + 110 * u, y: C.y + 70 * u, w: C.w * 0.67 - 150 * u, h: C.h - 70 * u - 90 * u };
      const base = P.y + P.h, slot = P.w / n, bw = Math.min(slot * 0.6, 190 * u);
      // Scale and gridlines.
      for (let v = 0; v <= topV + 1e-9; v += stepV) {
        const y = base - (v / topV) * P.h;
        line(g, P.x - 14 * u, y, P.x + P.w, y, v === 0 ? 4.5 * u : 1.3 * u, F.ink(v === 0 ? 0.92 : 0.32), v === 0 ? null : [3 * u, 9 * u]);
        say(g, fmt(v), P.x - 24 * u, y + 10 * u, 30 * u, { align: "right", color: F.ink(0.7), weight: 700 });
      }
      line(g, P.x, base, P.x, P.y - 20 * u, 3 * u, F.ink(0.85));
      let hot = null;
      vals.forEach((v, i) => {
        const cx = P.x + slot * (i + 0.5), x = cx - bw / 2, fullH = Math.max(34 * u, (v / topV) * P.h);
        const grow = ease(span(p, 0.04 + i * 0.1, 0.5 + i * 0.1)), h = fullH * Math.max(0.06, grow), top = base - h;
        const isHot = i === hi, col = isHot ? F.acc(0.95) : F.ink(0.88);
        const shim = (nx, ny) => 0.9 - 0.62 * ny + 0.09 * Math.sin(t * 2.6 + nx * 7 + i * 1.7 + ny * 4);
        g.save();
        g.beginPath(); g.rect(x, top, bw, h); g.clip();
        dotsIn(g, F, { x, y: base - fullH, w: bw, h: fullH }, (isHot ? 7 : 9) * u, shim, col, 0.52 + i * 0.1);
        g.restore();
        g.strokeStyle = isHot ? F.acc(1) : F.ink(0.95); g.lineWidth = 4.5 * u; g.strokeRect(x, top, bw, h);
        g.fillStyle = isHot ? F.acc(1) : F.ink(0.95); g.fillRect(x - 6 * u, top - 6 * u, bw + 12 * u, 10 * u);
        if (grow > 0.04) say(g, tally(v, grow, d), cx, top - 24 * u, (isHot ? 66 : 54) * u, { align: "center", color: isHot ? F.acc(1) : F.ink(0.95), weight: 900, font: HEAD });
        say(g, d.labels[i] || "", cx, base + 58 * u, 42 * u, { align: "center", color: F.ink(0.92), maxW: slot * 0.96, min: 32 * u, weight: 800 });
        if (isHot) hot = { cx, top, v, label: d.labels[i] || "", grow };
      });
      // A pennant on the tallest post, waving.
      if (hot && hot.grow > 0.6) {
        const px = hot.cx, py = hot.top - 118 * u, wav = (a) => Math.sin(t * 5 + a * 3.2) * 7 * u;
        line(g, px, py, px, hot.top - 62 * u, 4 * u, F.ink(0.92));
        g.beginPath(); g.moveTo(px, py); g.bezierCurveTo(px + 30 * u, py - 6 * u + wav(1), px + 56 * u, py + 8 * u + wav(2), px + 84 * u, py + 20 * u + wav(3)); g.bezierCurveTo(px + 56 * u, py + 36 * u + wav(2), px + 30 * u, py + 36 * u + wav(1), px, py + 40 * u); g.closePath();
        g.fillStyle = F.acc(1); g.fill(); g.strokeStyle = F.ink(0.9); g.lineWidth = 2.5 * u; g.stroke();
      }
      // A hand-inked note with an arrow curving to the marked post.
      if (hot && span(p, 0.55, 0.9) > 0) {
        const nq = span(p, 0.55, 0.9), tx = P.x + 46 * u, ty = P.y + 64 * u;
        const tw = say(g, "Mark this one", tx, ty, 46 * u, { color: F.ink(0.9), font: HEAD, italic: true, weight: 800, q: nq });
        const x1 = tx + tw + 14 * u, y1 = ty - 14 * u, x2 = hot.cx - 70 * u, y2 = hot.top - 150 * u;
        const ax = Math.max(x1 + 40 * u, x2 - 40 * u), ay = y1 - 30 * u;
        g.save(); g.strokeStyle = F.acc(0.95); g.lineWidth = 5 * u; g.lineCap = "round"; g.setLineDash([14 * u, 9 * u]); g.lineDashOffset = -t * 30 * u;
        g.beginPath(); g.moveTo(x1, y1); const kq = ease(nq);
        const mx = lerp(x1, x2, kq), my = lerp(y1, y2, kq);
        g.bezierCurveTo(lerp(x1, ax, kq), lerp(y1, ay, kq), lerp(ax, mx, 0.6), lerp(ay, my, 0.6), mx, my); g.stroke(); g.setLineDash([]);
        if (kq > 0.95) { const a = Math.atan2(y2 - ay, x2 - ax); g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - Math.cos(a - 0.5) * 30 * u, y2 - Math.sin(a - 0.5) * 30 * u); g.moveTo(x2, y2); g.lineTo(x2 - Math.cos(a + 0.5) * 30 * u, y2 - Math.sin(a + 0.5) * 30 * u); g.stroke(); }
        g.restore();
      }
      // The readout: a boxed extra with the figure and the delivery round.
      g.save();
      g.fillStyle = T.lite; g.fillRect(RO.x, RO.y, RO.w, RO.h);
      g.strokeStyle = F.ink(0.92); g.lineWidth = 4 * u; g.strokeRect(RO.x, RO.y, RO.w, RO.h);
      g.lineWidth = 1.2 * u; g.strokeRect(RO.x + 8 * u, RO.y + 8 * u, RO.w - 16 * u, RO.h - 16 * u);
      g.fillStyle = F.ink(0.92); g.fillRect(RO.x + 8 * u, RO.y + 8 * u, RO.w - 16 * u, 46 * u);
      say(g, "EXTRA · THE TOP DAY", RO.x + RO.w / 2, RO.y + 41 * u, 28 * u, { align: "center", color: T.lite, weight: 800, track: 0.12, maxW: RO.w - 40 * u });
      const vq = ease(span(p, 0.35, 0.85));
      if (hot) {
        const lx = tall ? RO.x + 30 * u : RO.x + RO.w / 2, al = tall ? "left" : "center";
        say(g, hot.label, lx, RO.y + 112 * u, 46 * u, { align: al, color: F.ink(0.95), maxW: tall ? RO.w * 0.5 : RO.w - 50 * u, min: 34 * u, weight: 800 });
        const wv = say(g, tally(hot.v, vq, d), lx, RO.y + (tall ? 232 : 250) * u, 150 * u, { align: al, color: F.acc(1), font: HEAD, weight: 900, maxW: tall ? RO.w * 0.5 : RO.w - 40 * u, min: 98 * u });
        const ux = tall ? lx : lx - wv / 2;
        g.save(); g.strokeStyle = F.acc(0.9); g.lineWidth = 4 * u; g.beginPath();
        g.ellipse(ux + wv / 2, RO.y + (tall ? 190 : 208) * u, wv / 2 + 24 * u, 70 * u, -0.04, 0, TAU * span(p, 0.7, 1)); g.stroke(); g.restore();
      }
      const Z = tall ? { x: RO.x + RO.w * 0.52, y: RO.y + 66 * u, w: RO.w * 0.48 - 24 * u, h: 200 * u } : { x: RO.x + 14 * u, y: RO.y + RO.h - 250 * u, w: RO.w - 28 * u, h: 230 * u };
      line(g, Z.x, Z.y - 8 * u, Z.x + Z.w, Z.y - 8 * u, 1.4 * u, F.ink(0.5), [4 * u, 5 * u]);
      cyclist(g, F, Z, t);
      g.restore();
    });
  }

  // ---- object: an engraved device with a moving loupe -------------------------------------------------------
  function screenArt(g, F, S0, t, seed) {
    const { u, T } = F;
    g.save();
    g.beginPath(); g.rect(S0.x, S0.y, S0.w, S0.h); g.clip();
    g.fillStyle = T.lite; g.fillRect(S0.x, S0.y, S0.w, S0.h);
    const mh = S0.h * 0.13;
    g.fillStyle = F.ink(0.92); g.fillRect(S0.x, S0.y, S0.w, mh);
    say(g, "THE DISPATCH", S0.x + S0.w / 2, S0.y + mh * 0.74, mh * 0.62, { align: "center", color: T.lite, font: HEAD, weight: 900, track: 0.06 });
    // A photo that keeps moving, and three scrolling columns.
    const ph = { x: S0.x + S0.w * 0.04, y: S0.y + mh + S0.h * 0.04, w: S0.w * 0.4, h: S0.h * 0.34 };
    const tone = blobTone(seed + 11);
    halftone(g, ph.x, ph.y, ph.w, ph.h, Math.max(3 * u, S0.w / 60), 0.5, (nx, ny) => tone(nx, ny, t), F.ink(0.9));
    g.strokeStyle = F.ink(0.9); g.lineWidth = 2 * u; g.strokeRect(ph.x, ph.y, ph.w, ph.h);
    const colTop = S0.y + mh + S0.h * 0.04, cw = S0.w * 0.14, lh = Math.max(6 * u, S0.h * 0.036);
    g.save(); g.beginPath(); g.rect(S0.x, colTop, S0.w, S0.h - mh - S0.h * 0.04); g.clip();
    const sc = t * 26 * u;
    for (let c = 0; c < 3; c++) {
      const cx = S0.x + S0.w * 0.48 + c * (cw + S0.w * 0.026);
      for (let i = -1; i < (S0.h * 0.9) / lh + 2; i++) {
        const idx = i + Math.floor(sc / lh) + c * 50, yy = colTop + i * lh - mod(sc, lh);
        g.fillStyle = F.ink(0.5); g.fillRect(cx, yy, cw * (0.55 + hash(idx) * 0.45), lh * 0.42);
      }
    }
    const below = ph.y + ph.h + S0.h * 0.04;
    for (let i = 0; i < 5; i++) { g.fillStyle = F.ink(0.5); g.fillRect(S0.x + S0.w * 0.04, below + i * lh, S0.w * 0.4 * (0.6 + hash(i + seed) * 0.4), lh * 0.42); }
    g.restore();
    // The proposed change: a spot-colour band that pulses.
    const band = { x: S0.x + S0.w * 0.5, y: S0.y + S0.h * 0.58, w: S0.w * 0.46, h: S0.h * 0.13 };
    g.fillStyle = hexA(F.S.accent, 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(t * 4)));
    g.globalCompositeOperation = T.blend; g.fillRect(band.x, band.y, band.w, band.h); g.globalCompositeOperation = "source-over";
    g.strokeStyle = F.acc(1); g.lineWidth = 3 * u; g.strokeRect(band.x, band.y, band.w, band.h);
    g.restore();
    return { photo: ph, band, clip: { x: S0.x + S0.w * 0.1, y: S0.y + S0.h * 0.88 } };
  }
  function drawObject(g, F, local, hold, d) {
    const { u, tall, T, t } = F, R = panelOf(F, "object");
    clipping(g, F, R, 5, local, TAGS.object, (C) => {
      const p = clamp(local / Math.min(2.4, hold * 0.6));
      const phone = d.kind === "phone";
      const D = tall ? { x: C.x, y: C.y, w: C.w, h: C.h * 0.6 } : { x: C.x, y: C.y, w: C.w * 0.6, h: C.h };
      let dev;
      if (phone) { const ph = Math.min(D.h * 0.96, D.w * 1.9); dev = { w: ph / 1.9, h: ph }; }
      else { const wl = Math.min(D.w * 0.96, D.h * 1.45); dev = { w: wl, h: wl * 0.6 }; }
      const dx = D.x + (D.w - dev.w) / 2, dy = D.y + (D.h - dev.h - (phone ? 0 : dev.w * 0.08)) / 2;
      const q = ease(span(p, 0, 0.45));
      g.save(); g.globalAlpha = clamp(0.35 + q * 1.2);
      // Body.
      rr(g, dx, dy, dev.w, dev.h, (phone ? 34 : 18) * u); g.fillStyle = T.panel; g.fill();
      g.strokeStyle = F.ink(0.95); g.lineWidth = 6 * u; g.stroke();
      const pad = (phone ? 22 : 24) * u, S0 = { x: dx + pad, y: dy + pad, w: dev.w - pad * 2, h: dev.h - pad * 2 };
      const art = screenArt(g, F, S0, t, 5);
      g.strokeStyle = F.ink(0.95); g.lineWidth = 3 * u; g.strokeRect(S0.x, S0.y, S0.w, S0.h);
      if (!phone) {
        const by = dy + dev.h, bh = dev.w * 0.07;
        g.beginPath(); g.moveTo(dx - dev.w * 0.06, by + bh); g.lineTo(dx + dev.w * 1.06, by + bh); g.lineTo(dx + dev.w, by); g.lineTo(dx, by); g.closePath();
        g.fillStyle = T.panel; g.fill(); g.strokeStyle = F.ink(0.95); g.lineWidth = 6 * u; g.stroke();
        g.save(); g.clip();
        dotsIn(g, F, { x: dx - dev.w * 0.06, y: by, w: dev.w * 1.12, h: bh }, 6 * u, (nx, ny) => 0.15 + 0.7 * Math.abs(nx - 0.5) * 2 + 0.2 * ny, F.ink(0.9), 0.3);
        g.restore();
        line(g, dx + dev.w * 0.4, by + bh * 0.3, dx + dev.w * 0.6, by + bh * 0.3, 5 * u, F.ink(0.9));
      }
      // The loupe: a lens that wanders over the screen showing the dots at twice the size.
      const lq = ease(span(p, 0.3, 0.7));
      if (lq > 0) {
        const lr = Math.min(S0.w, S0.h) * 0.24, lx = S0.x + S0.w * (0.5 + 0.3 * Math.sin(t * 0.85)), ly = S0.y + S0.h * (0.5 + 0.26 * Math.sin(t * 0.6 + 1));
        g.save(); g.globalAlpha *= lq;
        g.beginPath(); g.arc(lx, ly, lr, 0, TAU); g.save(); g.clip();
        g.translate(lx, ly); g.scale(2.1, 2.1); g.translate(-lx, -ly);
        screenArt(g, F, S0, t, 5);
        g.restore();
        g.beginPath(); g.arc(lx, ly, lr, 0, TAU); g.strokeStyle = F.ink(0.95); g.lineWidth = 8 * u; g.stroke();
        g.beginPath(); g.arc(lx, ly, lr - 12 * u, Math.PI * 1.1, Math.PI * 1.45); g.strokeStyle = "rgba(255,255,255,0.8)"; g.lineWidth = 6 * u; g.stroke();
        line(g, lx + lr * 0.71, ly + lr * 0.71, lx + lr * 0.71 + 62 * u, ly + lr * 0.71 + 62 * u, 14 * u, F.ink(0.95));
        g.restore();
      }
      g.restore();
      // Callouts: classified-ad tags joined to parts of the device.
      const anchors = [[art.photo.x + art.photo.w * 0.72, art.photo.y + art.photo.h * 0.3], [art.band.x + art.band.w * 0.5, art.band.y + art.band.h * 0.5], [art.clip.x, art.clip.y]];
      const nTag = d.callouts.length;
      const slots = [];
      if (!tall) { const bw = C.w * 0.36, bx = C.x + C.w - bw, bh = Math.min(150 * u, (C.h - 20 * u) / nTag - 16 * u); for (let i = 0; i < nTag; i++) slots.push({ x: bx, y: C.y + 10 * u + i * (C.h / nTag), w: bw, h: bh, tx: bx, ty: C.y + 10 * u + i * (C.h / nTag) + bh / 2, ai: i }); }
      else {
        const order = anchors.map((a, i) => i).slice(0, nTag).sort((a, b) => anchors[a][0] - anchors[b][0]);
        const bw = (C.w - 20 * u * (nTag - 1)) / nTag, by = C.y + C.h * 0.66;
        order.forEach((ai, i) => slots.push({ x: C.x + i * (bw + 20 * u), y: by, w: bw, h: C.h * 0.32, tx: C.x + i * (bw + 20 * u) + bw / 2, ty: by, ai }));
      }
      slots.forEach((s, i) => {
        const label = d.callouts[s.ai];
        const c = ease(span(p, 0.2 + i * 0.1, 0.5 + i * 0.1));
        if (c < 0.8) {
          g.save(); g.setLineDash([14 * u, 10 * u]); g.lineDashOffset = -t * 20 * u; g.strokeStyle = F.ink(0.45); g.lineWidth = 3 * u; g.strokeRect(s.x, s.y, s.w, s.h); g.setLineDash([]);
          g.fillStyle = F.acc(0.35); g.beginPath(); g.arc(s.x + 44 * u, s.y + s.h / 2, 26 * u, 0, TAU); g.fill();
          say(g, String(s.ai + 1), s.x + 44 * u, s.y + s.h / 2 + 15 * u, 42 * u, { align: "center", color: F.ink(0.5), font: HEAD, weight: 900 });
          g.restore();
        }
        if (c <= 0 || !label) return;
        const [ax, ay] = anchors[s.ai];
        const dash = [10 * u, 8 * u];
        g.save();
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(lerp(ax, s.tx, c), lerp(ay, s.ty, c));
        g.strokeStyle = F.acc(0.95); g.lineWidth = 4 * u; g.setLineDash(dash); g.lineDashOffset = -t * 34 * u; g.stroke(); g.setLineDash([]);
        g.fillStyle = F.acc(1); g.beginPath(); g.arc(ax, ay, 9 * u, 0, TAU); g.fill();
        g.strokeStyle = F.acc(0.6 * (1 - mod(t * 0.9 + i * 0.3, 1))); g.lineWidth = 3 * u; g.beginPath(); g.arc(ax, ay, (9 + 28 * mod(t * 0.9 + i * 0.3, 1)) * u, 0, TAU); g.stroke();
        g.restore();
        if (c < 0.8) return;
        g.save(); g.globalAlpha = clamp((c - 0.8) * 5);
        g.fillStyle = T.lite; g.fillRect(s.x, s.y, s.w, s.h);
        g.strokeStyle = F.ink(0.95); g.lineWidth = 4 * u; g.strokeRect(s.x, s.y, s.w, s.h);
        g.lineWidth = 1.2 * u; g.strokeRect(s.x + 7 * u, s.y + 7 * u, s.w - 14 * u, s.h - 14 * u);
        g.fillStyle = F.acc(1); g.beginPath(); g.arc(s.x + 44 * u, s.y + s.h / 2, 26 * u, 0, TAU); g.fill();
        say(g, String(s.ai + 1), s.x + 44 * u, s.y + s.h / 2 + 15 * u, 42 * u, { align: "center", color: T.onAccent, font: HEAD, weight: 900 });
        const lines = wrap(g, label, 44 * u, s.w - 110 * u);
        const size = lines.length > 2 ? 36 * u : 44 * u;
        lines.slice(0, 3).forEach((l, k2) => say(g, l, s.x + 86 * u, s.y + s.h / 2 + (k2 - (Math.min(lines.length, 3) - 1) / 2) * size * 1.12 + size * 0.34, size, { color: F.ink(0.95), weight: 800, maxW: s.w - 100 * u, min: 30 * u }));
        g.restore();
      });
    });
  }

  // ---- people: coarse halftone portraits --------------------------------------------------------------------
  function bustTone(i, t) {
    const sty = i % 6;
    return (nx, ny) => {
      const cx = 0.5 + 0.012 * Math.sin(t * 1.7 + i), hy = 0.4 + 0.008 * Math.sin(t * 2.1 + i * 1.3);
      let v = 0.1 + 0.16 * ny + 0.06 * Math.sin(nx * 18 + t * 0.6);
      const dx = nx - cx;
      // Coat.
      if (ny > 0.62 + 2.4 * Math.max(0, Math.abs(dx) - 0.16) * Math.max(0, Math.abs(dx) - 0.16) * 3 - 0.0) { v = 0.8 - 0.1 * (dx > 0 ? 1 : 0); if (ny < 0.8 && Math.abs(dx) < (ny - 0.6) * 0.9) v = 0.22; if (sty % 2 === 0 && Math.abs(dx) < 0.022 && ny > 0.7) v = 0.97; }
      if (Math.abs(dx) < 0.06 && ny > hy + 0.15 && ny < 0.66) v = 0.5;
      // Head.
      const hd = (dx / 0.17) * (dx / 0.17) + ((ny - hy) / 0.2) * ((ny - hy) / 0.2);
      if (hd < 1) {
        v = 0.2 + 0.36 * clamp(dx / 0.17 + 0.25);
        const blink = mod(t * 0.45 + i * 0.37, 1) < 0.06 ? 0.2 : 1;
        for (const s of [-1, 1]) { const ex = (dx - s * 0.07) / 0.026, ey = (ny - hy + 0.03) / (0.02 * blink); if (ex * ex + ey * ey < 1) v = 0.96; }
        const mx = dx / 0.06, my = (ny - hy - 0.09 - 0.02 * mx * mx) / 0.012; if (mx * mx + my * my < 1) v = 0.8;
        if (sty === 2) for (const s of [-1, 1]) { const rx = Math.hypot(dx - s * 0.07, ny - hy + 0.03); if (rx > 0.04 && rx < 0.052) v = 0.95; }
        if (sty === 4 && ny > hy + 0.06) v = 0.72;
      }
      const hairE = (dx / 0.215) * (dx / 0.215) + ((ny - hy + 0.01) / 0.245) * ((ny - hy + 0.01) / 0.245);
      if (sty === 1 && hairE < 1 && hd >= 1 && ny < hy + 0.15) v = 0.86;
      if (sty === 1 && hd < 1 && ny < hy - 0.1) v = 0.86;
      if (sty === 3) { const bx = dx, by = ny - (hy - 0.27); if (bx * bx + by * by < 0.07 * 0.07) v = 0.88; if (hd < 1.25 && ny < hy - 0.08 && hd >= 0.7) v = 0.86; }
      if (sty === 4 && hd < 1.25 && ny < hy - 0.13) v = 0.86;
      if (sty === 0) { const bm = (dx / 0.28) * (dx / 0.28) + ((ny - (hy - 0.15)) / 0.045) * ((ny - (hy - 0.15)) / 0.045), cr = (dx / 0.15) * (dx / 0.15) + ((ny - (hy - 0.21)) / 0.12) * ((ny - (hy - 0.21)) / 0.12); if (bm < 1 || cr < 1) v = Math.abs(ny - (hy - 0.17)) < 0.014 && cr < 1 ? 0.4 : 0.9; }
      if (sty === 2) { const cp = (dx / 0.2) * (dx / 0.2) + ((ny - (hy - 0.15)) / 0.075) * ((ny - (hy - 0.15)) / 0.075); if (cp < 1) v = 0.84; if (dx > -0.04 && dx < 0.22 && ny > hy - 0.105 && ny < hy - 0.075) v = 0.9; }
      if (sty === 5) {
        const dd = Math.hypot(dx, ny - hy); if (dd > 0.215 && dd < 0.238 && ny < hy + 0.02) v = 0.92;
        for (const s of [-1, 1]) if (Math.hypot(dx - s * 0.205, ny - hy - 0.01) < 0.055) v = 0.92;
        if (hd < 1.2 && ny < hy - 0.12) v = 0.86;
      }
      return v;
    };
  }
  function drawPeople(g, F, local, hold, d) {
    const { u, tall, T, t } = F, R = panelOf(F, "people");
    clipping(g, F, R, 7, local, TAGS.people, (C) => {
      const p = clamp(local / Math.min(2.4, hold * 0.6));
      const n = Math.max(2, Math.min(6, Math.round(d.count))), cols = tall ? (n <= 2 ? 1 : 2) : n, rows = Math.ceil(n / cols), gap = 26 * u;
      const slotW = (C.w - gap * (cols - 1)) / cols, slotH = (C.h - gap * (rows - 1)) / rows;
      const capH = 86 * u, ph = Math.min(slotH - capH - 10 * u, slotW * 1.2), pw = Math.min(slotW, ph / 1.1);
      for (let i = 0; i < n; i++) {
        const col = i % cols, row = Math.floor(i / cols);
        const x = C.x + col * (slotW + gap) + (slotW - pw) / 2, y = C.y + row * (slotH + gap) + (slotH - ph - capH) / 2;
        const q = ease(span(p, 0.02 + i * 0.1, 0.3 + i * 0.1)), hot = i === Math.min(n - 1, d.highlight);
        g.save();
        g.translate(x + pw / 2, y + ph / 2); g.scale(0.9 + 0.1 * q, 0.9 + 0.1 * q); g.translate(-(x + pw / 2), -(y + ph / 2));
        g.globalAlpha = clamp(0.4 + q * 1.5);
        g.fillStyle = T.lite; g.fillRect(x, y, pw, ph);
        dotsIn(g, F, { x: x + 4 * u, y: y + 4 * u, w: pw - 8 * u, h: ph - 8 * u }, Math.max(7 * u, pw / 30), bustTone(i, t), hot ? F.acc(0.95) : F.ink(0.9), 0.52 + i * 0.07);
        g.strokeStyle = hot ? F.acc(1) : F.ink(0.95); g.lineWidth = (hot ? 8 : 5.5) * u; g.strokeRect(x, y, pw, ph);
        // The photographer's flash.
        const fp = mod(t * 0.37 + i * 0.29 + 0.1, 1);
        if (fp < 0.08 && p > 0.4) {
          const k = 1 - fp / 0.08;
          g.fillStyle = `rgba(255,255,255,${0.85 * k})`; g.fillRect(x, y, pw, ph);
          g.save(); g.translate(x + pw * (0.2 + 0.6 * hash(i + Math.floor(t * 0.37 + i * 0.29 + 0.1))), y + ph * 0.18); g.strokeStyle = `rgba(255,255,255,${k})`; g.lineWidth = 5 * u;
          for (let a = 0; a < 8; a++) { g.beginPath(); g.moveTo(Math.cos((a / 8) * TAU) * 10 * u, Math.sin((a / 8) * TAU) * 10 * u); g.lineTo(Math.cos((a / 8) * TAU) * 44 * u, Math.sin((a / 8) * TAU) * 44 * u); g.stroke(); }
          g.restore();
        }
        // Caption slip.
        const cy = y + ph + 8 * u;
        g.fillStyle = hot ? F.acc(1) : F.ink(0.94); g.fillRect(x - 6 * u, cy, pw + 12 * u, capH - 14 * u);
        const label = d.badges[i % d.badges.length] || "";
        say(g, label, x + pw / 2, cy + (capH - 14 * u) / 2 + 15 * u, 46 * u, { align: "center", color: hot ? T.onAccent : T.lite, weight: 800, maxW: pw - 10 * u, min: 34 * u, upper: true, track: 0.04 });
        g.restore();
        // A speech bubble pops over the highlighted portrait.
        if (hot) {
          const bq = back(span(p, 0.5, 0.78));
          if (bq > 0) {
            const bx = x + pw * 0.84, by = y + 6 * u + Math.sin(t * 3) * 4 * u, rot = Math.sin(t * 2.6) * 0.07;
            g.save(); g.translate(bx, by); g.rotate(rot - 0.08); g.scale(bq, bq);
            g.beginPath(); g.moveTo(-60 * u, -34 * u); g.lineTo(60 * u, -34 * u); g.quadraticCurveTo(76 * u, -34 * u, 76 * u, -14 * u); g.lineTo(76 * u, 18 * u); g.quadraticCurveTo(76 * u, 38 * u, 56 * u, 38 * u);
            g.lineTo(-18 * u, 38 * u); g.lineTo(-40 * u, 66 * u); g.lineTo(-38 * u, 38 * u); g.lineTo(-60 * u, 38 * u); g.quadraticCurveTo(-76 * u, 38 * u, -76 * u, 18 * u); g.lineTo(-76 * u, -14 * u); g.quadraticCurveTo(-76 * u, -34 * u, -60 * u, -34 * u); g.closePath();
            g.fillStyle = T.lite; g.fill(); g.strokeStyle = F.ink(0.95); g.lineWidth = 5 * u; g.stroke();
            say(g, "OK!", 0, 18 * u, 56 * u, { align: "center", color: F.acc(1), font: HEAD, weight: 900 });
            g.restore();
          }
        }
      }
    });
  }

  // ---- process: a web of paper through the press -------------------------------------------------------------
  function stepIcon(g, F, kind, cx, cy, s, t, hot) {
    const { u, T } = F, ink = F.ink(0.95), acc = F.acc(1);
    g.save(); g.translate(cx, cy);
    g.lineWidth = 5 * u; g.lineJoin = "round"; g.strokeStyle = ink;
    if (kind === 0) {
      for (let k = 2; k >= 0; k--) {
        const lift = k === 0 ? Math.max(0, Math.sin(t * 2.4)) * s * 0.12 : 0, ox = k * s * 0.07, oy = -k * s * 0.07 - lift;
        g.beginPath(); g.moveTo(-s * 0.3 + ox, -s * 0.38 + oy); g.lineTo(s * 0.12 + ox, -s * 0.38 + oy); g.lineTo(s * 0.32 + ox, -s * 0.18 + oy); g.lineTo(s * 0.32 + ox, s * 0.4 + oy); g.lineTo(-s * 0.3 + ox, s * 0.4 + oy); g.closePath();
        g.fillStyle = T.lite; g.fill(); g.stroke();
        if (k === 0) { for (let l = 0; l < 4; l++) line(g, -s * 0.18, s * (-0.06 + l * 0.11) + oy, s * (0.18 - (l % 2) * 0.08), s * (-0.06 + l * 0.11) + oy, 4 * u, F.ink(0.7)); }
      }
    } else if (kind === 1) {
      g.rotate(t * 0.7);
      const pulse = 1 + 0.08 * Math.sin(t * 5);
      g.beginPath();
      for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU, r = (k % 2 ? 0.2 : 0.44) * s * pulse; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.closePath(); g.fillStyle = hexA(F.S.accent, 0.95); g.fill(); g.stroke();
      g.beginPath(); g.arc(0, 0, s * 0.09, 0, TAU); g.fillStyle = T.lite; g.fill();
    } else {
      const bounce = 1 + 0.08 * Math.max(0, Math.sin(t * 3.2)), sq = 1 - 0.05 * Math.max(0, Math.sin(t * 3.2));
      g.scale(bounce, sq);
      g.beginPath(); g.arc(0, 0, s * 0.4, 0, TAU); g.fillStyle = T.lite; g.fill(); g.strokeStyle = acc; g.lineWidth = 8 * u; g.stroke();
      g.beginPath(); g.arc(0, 0, s * 0.31, 0, TAU); g.lineWidth = 2.5 * u; g.stroke();
      g.beginPath(); g.moveTo(-s * 0.18, s * 0.02); g.lineTo(-s * 0.04, s * 0.17); g.lineTo(s * 0.22, -s * 0.14); g.lineWidth = 12 * u; g.lineCap = "round"; g.strokeStyle = acc; g.stroke();
    }
    g.restore();
  }
  function drawProcess(g, F, local, hold, d) {
    const { u, tall, T, t } = F, R = panelOf(F, "process");
    clipping(g, F, R, 11, local, TAGS.process, (C) => {
      const p = clamp(local / Math.min(2.4, hold * 0.6));
      const n = d.steps.length, gap = (tall ? 110 : 120) * u;
      const cw = tall ? Math.min(C.w * 0.82, 780 * u) : (C.w - gap * (n - 1)) / n;
      const ch = tall ? (C.h - gap * (n - 1)) / n : Math.min(C.h * 0.92, cw * 1.2);
      const cards = d.steps.map((s, i) => ({ x: tall ? C.x + (C.w - cw) / 2 : C.x + i * (cw + gap), y: tall ? C.y + i * (ch + gap) : C.y + (C.h - ch) / 2, label: s, i }));
      // The web of paper runs behind the cards, carrying lines of tiny type.
      const wt = 58 * u;
      g.save();
      if (!tall) {
        const wy = C.y + C.h / 2 - wt / 2;
        g.fillStyle = T.lite; g.fillRect(C.x - 20 * u, wy, C.w + 40 * u, wt);
        g.save(); g.beginPath(); g.rect(C.x - 20 * u, wy, C.w + 40 * u, wt); g.clip();
        for (let r2 = 0; r2 < 3; r2++) for (let k = -1; k < C.w / (30 * u) + 3; k++) { const idx = k + Math.floor((t * 190 * u) / (30 * u)); g.fillStyle = F.ink(0.55); g.fillRect(C.x - 20 * u + k * 30 * u - mod(t * 190 * u, 30 * u), wy + (10 + r2 * 15) * u, (8 + hash(idx * 3 + r2) * 18) * u, 5 * u); }
        g.restore();
        line(g, C.x - 20 * u, wy, C.x + C.w + 20 * u, wy, 4 * u, F.ink(0.92)); line(g, C.x - 20 * u, wy + wt, C.x + C.w + 20 * u, wy + wt, 4 * u, F.ink(0.92));
        // Chevrons and rollers in each gap.
        for (let i = 0; i < n - 1; i++) {
          const gx = C.x + (i + 1) * cw + (i + 0.5) * gap;
          for (const s of [-1, 1]) {
            const ry = C.y + C.h / 2 + s * (wt / 2 + 30 * u);
            g.beginPath(); g.arc(gx, ry, 30 * u, 0, TAU); g.fillStyle = T.lite; g.fill(); g.strokeStyle = F.ink(0.95); g.lineWidth = 5 * u; g.stroke();
            for (let k = 0; k < 4; k++) { const a = t * 5 * s + (k / 4) * TAU; line(g, gx, ry, gx + Math.cos(a) * 24 * u, ry + Math.sin(a) * 24 * u, 3 * u, F.ink(0.7)); }
            g.beginPath(); g.arc(gx, ry, 6 * u, 0, TAU); g.fillStyle = F.ink(0.95); g.fill();
          }
        }
      } else {
        const wx = C.x + C.w / 2 - wt / 2;
        g.fillStyle = T.lite; g.fillRect(wx, C.y - 20 * u, wt, C.h + 40 * u);
        g.save(); g.beginPath(); g.rect(wx, C.y - 20 * u, wt, C.h + 40 * u); g.clip();
        for (let r2 = 0; r2 < 3; r2++) for (let k = -1; k < C.h / (30 * u) + 3; k++) { const idx = k + Math.floor((t * 190 * u) / (30 * u)); g.fillStyle = F.ink(0.55); g.fillRect(wx + (10 + r2 * 15) * u, C.y - 20 * u + k * 30 * u + mod(t * 190 * u, 30 * u), 5 * u, (8 + hash(idx * 3 + r2) * 18) * u); }
        g.restore();
        line(g, wx, C.y - 20 * u, wx, C.y + C.h + 20 * u, 4 * u, F.ink(0.92)); line(g, wx + wt, C.y - 20 * u, wx + wt, C.y + C.h + 20 * u, 4 * u, F.ink(0.92));
        for (let i = 0; i < n - 1; i++) {
          const gy2 = C.y + (i + 1) * ch + (i + 0.5) * gap;
          for (const s of [-1, 1]) {
            const rx = C.x + C.w / 2 + s * (wt / 2 + 30 * u);
            g.beginPath(); g.arc(rx, gy2, 30 * u, 0, TAU); g.fillStyle = T.lite; g.fill(); g.strokeStyle = F.ink(0.95); g.lineWidth = 5 * u; g.stroke();
            for (let k = 0; k < 4; k++) { const a = t * 5 * s + (k / 4) * TAU; line(g, rx, gy2, rx + Math.cos(a) * 24 * u, gy2 + Math.sin(a) * 24 * u, 3 * u, F.ink(0.7)); }
          }
        }
      }
      g.restore();
      // Chevrons travel the web between cards.
      cards.forEach((c, i) => {
        const q = ease(span(p, i * 0.17 - 0.1, i * 0.17 + 0.3)), hot = i === n - 1;
        const cx = c.x + cw / 2, cy2 = c.y + ch / 2;
        if (q < 1) {
          g.save(); g.setLineDash([14 * u, 10 * u]); g.strokeStyle = F.ink(0.45); g.lineWidth = 3 * u; g.strokeRect(c.x, c.y, cw, ch); g.setLineDash([]);
          say(g, String(i + 1).padStart(2, "0"), cx, cy2 + 36 * u, 110 * u, { align: "center", color: F.ink(0.2), font: HEAD, weight: 900 });
          g.restore();
        }
        if (q <= 0) return;
        g.save();
        g.translate(cx, cy2); g.scale(1 + 0.1 * (1 - q), 1 + 0.1 * (1 - q)); g.translate(-cx, -cy2); g.globalAlpha = clamp(q * 2);
        g.shadowColor = "rgba(20,12,0,0.38)"; g.shadowBlur = 16 * u; g.shadowOffsetX = 5 * u; g.shadowOffsetY = 8 * u;
        g.fillStyle = T.panel; g.fillRect(c.x, c.y, cw, ch); g.shadowColor = "transparent";
        dotsIn(g, F, { x: c.x + 4 * u, y: c.y + ch * 0.55, w: cw - 8 * u, h: ch * 0.45 - 4 * u }, 8 * u, (nx, ny) => 0.05 + 0.16 * ny + 0.05 * Math.sin(nx * 9 + t * 1.6), hot ? F.acc(0.9) : F.ink(0.7), 0.4);
        g.strokeStyle = hot ? F.acc(1) : F.ink(0.95); g.lineWidth = 6 * u; g.strokeRect(c.x, c.y, cw, ch);
        g.lineWidth = 1.4 * u; g.strokeStyle = F.ink(0.7); g.strokeRect(c.x + 10 * u, c.y + 10 * u, cw - 20 * u, ch - 20 * u);
        say(g, String(i + 1).padStart(2, "0"), c.x + 28 * u, c.y + 108 * u, 100 * u, { color: hot ? F.acc(1) : F.ink(0.95), font: HEAD, weight: 900 });
        for (let k = 0; k < 4; k++) {
          const lw = (cw * 0.34) * (0.55 + hash(i * 7 + k) * 0.45), ly = c.y + 140 * u + k * 17 * u;
          g.fillStyle = F.ink(0.5); g.fillRect(c.x + 30 * u, ly, lw, 6 * u);
        }
        { const cur = mod(t * 1.1 + i * 0.3, 1), ly = c.y + 140 * u + Math.floor(cur * 4) * 17 * u; g.fillStyle = hot ? F.acc(0.95) : F.ink(0.95); g.fillRect(c.x + 30 * u, ly - 3 * u, cw * 0.34 * (0.35 + 0.65 * mod(cur * 4, 1)), 12 * u); }
        stepIcon(g, F, Math.min(i, 2), c.x + cw * (tall ? 0.78 : 0.66), c.y + ch * (tall ? 0.42 : 0.32), Math.min(cw * 0.7, ch * 0.55), t, hot);
        const lines = wrap(g, c.label, 46 * u, cw - 50 * u);
        const size = lines.length > 1 ? 40 * u : 46 * u;
        g.fillStyle = hot ? F.acc(1) : F.ink(0.95); g.fillRect(c.x + 10 * u, c.y + ch - 112 * u, cw - 20 * u, 102 * u);
        lines.slice(0, 2).forEach((l, k) => say(g, l, cx, c.y + ch - 61 * u + (k - (Math.min(lines.length, 2) - 1) / 2) * size * 1.1 + size * 0.34, size, { align: "center", color: hot ? T.onAccent : T.lite, weight: 800, maxW: cw - 50 * u, min: 32 * u }));
        g.restore();
      });
      // Chevrons ride the ribbon in each gap, over the web.
      g.save();
      for (let i = 0; i < n - 1; i++) {
        const k = mod(t * 1.3 + i * 0.4, 1);
        if (span(p, i * 0.17 + 0.2, i * 0.17 + 0.45) <= 0) continue;
        const cx = tall ? C.x + C.w / 2 : C.x + (i + 1) * cw + i * gap + gap * k, cy3 = tall ? C.y + (i + 1) * ch + i * gap + gap * k : C.y + C.h / 2;
        g.save(); g.translate(cx, cy3); if (tall) g.rotate(Math.PI / 2); g.globalAlpha = Math.sin(k * Math.PI);
        g.beginPath(); g.moveTo(-14 * u, -22 * u); g.lineTo(14 * u, 0); g.lineTo(-14 * u, 22 * u); g.lineWidth = 9 * u; g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = F.acc(1); g.stroke();
        g.restore();
      }
      g.restore();
    });
  }

  // ---- compare: a crumpled clipping against a clean one -----------------------------------------------------------
  function manicule(g, F, x, y, s, ang, color) {
    const { u } = F;
    g.save(); g.translate(x, y); g.rotate(ang); g.scale(s, s);
    g.lineJoin = "round"; g.strokeStyle = F.ink(0.95); g.lineWidth = 3.4 / 1;
    g.fillStyle = F.T.lite;
    const rp = (a, b, c2, d2, r) => { rr(g, a, b, c2, d2, r); g.fill(); g.stroke(); };
    rp(0, 12, 16, 34, 3);
    for (let k = 0; k < 3; k++) line(g, 4 + k * 4, 16, 4 + k * 4, 42, 1.4, F.ink(0.6));
    rp(16, 14, 46, 30, 12);
    rp(58, 20, 52, 11, 5.5);
    rp(52, 32, 34, 10, 5); rp(48, 42, 30, 9, 4.5);
    rp(24, 4, 30, 12, 6);
    g.fillStyle = color; g.globalAlpha = 0.9; g.beginPath(); g.arc(118, 25.5, 3.5, 0, TAU); g.fill();
    g.restore();
  }
  function drawCompare(g, F, local, hold, d) {
    const { u, tall, T, t } = F, R = panelOf(F, "compare");
    clipping(g, F, R, 13, local, TAGS.compare, (C) => {
      const p = clamp(local / Math.min(2.4, hold * 0.6));
      const gap = (tall ? 86 : 150) * u, cw = tall ? C.w : (C.w - gap) / 2, ch = tall ? (C.h - gap) / 2 : C.h;
      const mx = Math.max(Number(d.leftValue) || 0, Number(d.rightValue) || 0, 1), tallies = mx <= 14;
      [[d.left, d.leftValue, 0], [d.right, d.rightValue, 1]].forEach(([label, value, side]) => {
        const q = ease(span(p, side * 0.14, 0.55 + side * 0.14));
        const x = tall ? C.x : C.x + side * (cw + gap), y = tall ? C.y + side * (ch + gap) : C.y;
        const crumple = side === 0;
        const jx = crumple ? (hash(Math.floor(t * 9)) - 0.5) * 3.2 * u : 0, jy = crumple ? (hash(Math.floor(t * 9) + 7) - 0.5) * 3 * u : 0;
        g.save();
        g.translate(x + cw / 2 + jx, y + ch / 2 + jy); g.rotate(crumple ? -0.012 + Math.sin(t * 3.1) * 0.005 : 0.008 + Math.sin(t * 1.2) * 0.003); g.scale(0.94 + 0.06 * q, 0.94 + 0.06 * q); g.translate(-(x + cw / 2), -(y + ch / 2));
        g.globalAlpha = clamp(0.4 + q * 1.4);
        g.shadowColor = "rgba(20,12,0,0.4)"; g.shadowBlur = 18 * u; g.shadowOffsetX = 5 * u; g.shadowOffsetY = 9 * u;
        g.beginPath();
        if (crumple) {
          const pts = []; const m = 18;
          for (let i = 0; i < m; i++) { const k = i / m, per = k * 4; const e = Math.floor(per), f = per - e;
            const bx = e === 0 ? lerp(0, cw, f) : e === 1 ? cw : e === 2 ? lerp(cw, 0, f) : 0, by = e === 0 ? 0 : e === 1 ? lerp(0, ch, f) : e === 2 ? ch : lerp(ch, 0, f);
            const inx = (bx < cw / 2 ? 1 : -1) * (hash(i * 3.3) * 12 * u), iny = (by < ch / 2 ? 1 : -1) * (hash(i * 7.1) * 12 * u);
            pts.push([x + bx + (e % 2 === 0 ? 0 : inx), y + by + (e % 2 === 1 ? 0 : iny)]); }
          pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.closePath();
        } else g.rect(x, y, cw, ch);
        g.fillStyle = crumple ? T.panelDim : T.lite; g.fill(); g.shadowColor = "transparent";
        g.save(); g.clip();
        if (crumple) {
          // Creases with a bright lip and a shadow, plus an ink smear.
          for (let k = 0; k < 9; k++) {
            const x1 = x + hash(k * 2.1) * cw, y1 = y + hash(k * 4.7) * ch, a = hash(k * 9.3) * Math.PI, l = (80 + hash(k) * 220) * u;
            line(g, x1, y1, x1 + Math.cos(a) * l, y1 + Math.sin(a) * l, 2.4 * u, "rgba(70,50,20,0.28)");
            line(g, x1 + 3 * u, y1 + 3 * u, x1 + 3 * u + Math.cos(a) * l, y1 + 3 * u + Math.sin(a) * l, 1.6 * u, "rgba(255,255,240,0.5)");
          }
          const sm = g.createRadialGradient(x + cw * 0.7, y + ch * 0.4, 0, x + cw * 0.7, y + ch * 0.4, 220 * u); sm.addColorStop(0, F.ink(0.22)); sm.addColorStop(1, F.ink(0));
          g.fillStyle = sm; g.fillRect(x, y, cw, ch);
        }
        g.restore();
        const col = crumple ? F.ink(0.62) : F.acc(1);
        g.strokeStyle = crumple ? F.ink(0.7) : F.acc(1); g.lineWidth = (crumple ? 4 : 8) * u;
        if (!crumple) g.strokeRect(x, y, cw, ch);
        if (!crumple) { g.strokeStyle = F.ink(0.9); g.lineWidth = 1.6 * u; g.strokeRect(x + 12 * u, y + 12 * u, cw - 24 * u, ch - 24 * u); }
        {
          const dcx = x + cw * 0.74, dcy = y + ch * 0.4, dr = Math.min(cw * 0.22, ch * 0.2) * (0.97 + 0.03 * Math.sin(t * 3 + side));
          g.save(); g.beginPath(); g.rect(x, y, cw, ch); g.clip();
          dotsIn(g, F, { x: dcx - dr, y: dcy - dr, w: dr * 2, h: dr * 2 }, 8 * u, (nx, ny) => {
            const dd = Math.hypot(nx - 0.5, ny - 0.5) * 2; if (dd > 1) return 0;
            const band = crumple ? 0.65 + 0.35 * Math.sin(ny * 34 + Math.floor(t * 10) * 1.7) : 1;
            return (0.15 + 0.8 * (1 - dd)) * band + (crumple ? 0 : 0.1 * Math.sin(t * 3 + dd * 6));
          }, crumple ? F.ink(0.5) : F.acc(0.9), 0.5);
          if (!crumple) { g.translate(dcx, dcy); g.rotate(t * 0.9); for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; line(g, Math.cos(a) * (dr + 14 * u), Math.sin(a) * (dr + 14 * u), Math.cos(a) * (dr + (34 + (k % 2) * 16) * u), Math.sin(a) * (dr + (34 + (k % 2) * 16) * u), 5 * u, F.acc(0.95)); } }
          else { g.strokeStyle = F.ink(0.6); g.lineWidth = 4 * u; g.beginPath(); g.arc(dcx, dcy, dr + 14 * u, 0, TAU); g.stroke(); }
          g.restore();
        }
        say(g, label, x + 36 * u, y + 82 * u, 50 * u, { color: crumple ? F.ink(0.8) : F.ink(0.97), weight: 900, maxW: cw - 72 * u, min: 34 * u, upper: true, track: 0.04 });
        line(g, x + 36 * u, y + 100 * u, x + cw - 36 * u, y + 100 * u, 2.5 * u, F.ink(0.7));
        const nh = Math.min(300 * u, ch * 0.42);
        say(g, tally(value, q, d), x + 36 * u, y + 118 * u + nh * 0.92, nh, { color: col, font: HEAD, weight: 900, maxW: cw - 72 * u, min: 98 * u });
        // Tally strokes, then a halftone meter.
        const by = y + ch - 170 * u;
        if (tallies) {
          const cnt = Math.floor(value * span(p, 0.3 + side * 0.12, 0.8 + side * 0.12) + 0.001);
          for (let k = 0; k < cnt; k++) {
            const grp = Math.floor(k / 5), within = k % 5, gx = x + 40 * u + grp * 150 * u;
            if (within < 4) line(g, gx + within * 26 * u, by, gx + within * 26 * u, by + 92 * u, 7 * u, F.ink(0.9));
            else line(g, gx - 12 * u, by + 80 * u, gx + 112 * u, by + 8 * u, 7 * u, crumple ? F.ink(0.9) : F.acc(1));
          }
        }
        const mw = cw - 72 * u, my = y + ch - 70 * u, mh = 38 * u, fr = clamp(value / mx) * q;
        g.fillStyle = F.ink(0.1); g.fillRect(x + 36 * u, my, mw, mh);
        dotsIn(g, F, { x: x + 36 * u, y: my, w: mw * fr, h: mh }, 6.5 * u, (nx, ny) => 0.85 - 0.25 * ny + 0.1 * Math.sin(t * 3 + nx * 12), col, 0.3);
        g.strokeStyle = F.ink(0.95); g.lineWidth = 3.5 * u; g.strokeRect(x + 36 * u, my, mw, mh);
        if (!crumple) {
          g.save(); g.beginPath(); g.rect(x, y, cw, ch); g.clip();
          const sk = mod(t * 0.42, 1) * (cw + ch * 0.8) - ch * 0.4;
          g.fillStyle = "rgba(255,255,255,0.4)"; g.beginPath(); g.moveTo(x + sk, y); g.lineTo(x + sk + 60 * u, y); g.lineTo(x + sk + 60 * u - ch * 0.4, y + ch); g.lineTo(x + sk - ch * 0.4, y + ch); g.fill();
          g.restore();
        }
        g.restore();
      });
      // The printer's fist points at the clean one and bobs.
      const hq = back(span(p, 0.5, 0.85));
      if (hq > 0) {
        const bob = Math.sin(t * 4.2) * 12 * u, s = (tall ? 2.0 : 2.0) * u;
        g.save(); g.globalAlpha = clamp(hq);
        if (tall) manicule(g, F, C.x + C.w / 2 - 30 * u, C.y + ch + gap / 2 - 70 * u + bob, s * 0.8, Math.PI / 2, F.acc(1));
        else manicule(g, F, C.x + cw + gap / 2 - 100 * u + bob, C.y + ch * 0.5 - 25 * u * 1.6, s, 0, F.acc(1));
        g.restore();
      }
    });
  }

  // ---- title: the front page --------------------------------------------------------------------------------------
  function masthead(g, F, local, top, h, small) {
    const { u, W, tall, T, t } = F, mx = 60 * u, mw = W - 120 * u;
    g.save();
    g.fillStyle = T.strip; g.fillRect(mx, top, mw, h);
    g.strokeStyle = F.ink(0.95); g.lineWidth = 5 * u; g.strokeRect(mx, top, mw, h);
    g.lineWidth = 1.5 * u; g.strokeRect(mx + 9 * u, top + 9 * u, mw - 18 * u, h - 18 * u);
    const ears = !tall && !small, earW = 230 * u;
    const text = "The Dreamcut Dispatch";
    const avail = mw - (ears ? earW * 2 + 90 * u : 70 * u);
    g.font = `900 100px ${HEAD}`;
    const m100 = g.measureText(text).width, size = Math.min(h * 0.62, (avail / m100) * 100);
    g.font = `900 ${size}px ${HEAD}`;
    let tw = 0; const adv = [];
    for (const ch of text) { const w = g.measureText(ch).width; adv.push(w); tw += w; }
    let px = W / 2 - tw / 2;
    const base = top + h * (small ? 0.72 : 0.66);
    for (let i = 0; i < text.length; i++) {
      const k = e4(span(local, 0.05 + i * 0.03, 0.3 + i * 0.03)), sq = 1 + 0.16 * (1 - k);
      g.save(); g.globalAlpha = clamp(k * 2); g.translate(px + adv[i] / 2, base); g.scale(1 / sq, sq); g.translate(0, -(1 - k) * h * 0.5);
      g.fillStyle = F.ink(0.95); g.textAlign = "center"; g.fillText(text[i], 0, 0);
      g.restore();
      px += adv[i];
    }
    line(g, W / 2 - tw / 2, base + h * 0.1, W / 2 + tw / 2, base + h * 0.1, 3 * u, F.ink(0.9), null, e4(span(local, 0.5, 1.1)));
    if (ears) {
      const ey = top + 26 * u, eh = h - 52 * u;
      for (const side of [0, 1]) {
        const ex = side ? mx + mw - earW - 26 * u : mx + 26 * u;
        g.strokeStyle = F.ink(0.9); g.lineWidth = 2.5 * u; g.strokeRect(ex, ey, earW, eh);
        if (!side) {
          // A sun that turns, over the weather line.
          const sx = ex + earW / 2, sy = ey + eh * 0.42;
          g.save(); g.translate(sx, sy); g.rotate(t * 0.8);
          for (let k = 0; k < 14; k++) { const a = (k / 14) * TAU; line(g, Math.cos(a) * 30 * u, Math.sin(a) * 30 * u, Math.cos(a) * (46 + (k % 2) * 12) * u, Math.sin(a) * (46 + (k % 2) * 12) * u, 4 * u, F.acc(1)); }
          g.restore();
          g.beginPath(); g.arc(sx, sy, 24 * u, 0, TAU); g.fillStyle = F.acc(1); g.fill(); g.strokeStyle = F.ink(0.9); g.lineWidth = 3 * u; g.stroke();
          say(g, "FAIR AND MILD", sx, ey + eh - 16 * u, 24 * u, { align: "center", color: F.ink(0.9), weight: 800, track: 0.08, maxW: earW - 20 * u });
        } else {
          say(g, "ONE", ex + earW / 2, ey + eh * 0.36, 40 * u, { align: "center", color: F.ink(0.9), font: HEAD, weight: 900, track: 0.2 });
          say(g, "PENNY", ex + earW / 2, ey + eh * 0.72, 56 * u, { align: "center", color: F.acc(1), font: HEAD, weight: 900, track: 0.06, maxW: earW - 20 * u });
        }
      }
    }
    g.restore();
  }
  function photoCard(g, F, x, y, w, h, seed, label, tcol, q) {
    const { u, T, t } = F;
    if (q <= 0) return;
    g.save(); g.globalAlpha = clamp(q * 2);
    g.translate(x + w / 2, y + h / 2); g.scale(0.92 + 0.08 * q, 0.92 + 0.08 * q); g.translate(-(x + w / 2), -(y + h / 2));
    g.shadowColor = "rgba(20,12,0,0.35)"; g.shadowBlur = 14 * u; g.shadowOffsetY = 6 * u;
    g.fillStyle = T.lite; g.fillRect(x, y, w, h); g.shadowColor = "transparent";
    const ph = h - 58 * u, tone = blobTone(seed);
    dotsIn(g, F, { x: x + 6 * u, y: y + 6 * u, w: w - 12 * u, h: ph - 6 * u }, Math.max(6 * u, w / 36), (nx, ny) => tone(nx, ny, t), tcol, 0.52 + seed * 0.01);
    g.strokeStyle = F.ink(0.95); g.lineWidth = 4 * u; g.strokeRect(x, y, w, h);
    line(g, x, y + ph, x + w, y + ph, 3 * u, F.ink(0.9));
    say(g, label, x + w / 2, y + ph + 38 * u, 30 * u, { align: "center", color: F.ink(0.92), weight: 800, upper: true, track: 0.08, maxW: w - 20 * u, min: 22 * u });
    g.restore();
  }
  function stamp(g, F, x, y, text, local, start) {
    const { u, t } = F, k = span(local, start, start + 0.28);
    if (k <= 0) return;
    const sc = 1 + (1 - back(k)) * 0.9 + 0.012 * Math.sin(t * 3);
    g.save(); g.translate(x, y); g.rotate(-0.16 + Math.sin(t * 1.6) * 0.02); g.scale(sc, sc); g.globalAlpha = clamp(k * 2) * 0.95;
    g.font = `900 66px ${HEAD}`; g.letterSpacing = "4px"; const w = g.measureText(text).width + 56 * u; g.letterSpacing = "0px";
    g.strokeStyle = F.acc(1); g.lineWidth = 7 * u; g.strokeRect(-w / 2, -50 * u, w, 100 * u); g.lineWidth = 2 * u; g.strokeRect(-w / 2 + 11 * u, -39 * u, w - 22 * u, 78 * u);
    say(g, text, 0, 22 * u, 66 * u, { align: "center", color: F.acc(1), font: HEAD, weight: 900, track: 0.06 });
    g.restore();
  }
  function drawTitle(g, F, local, hold, change, sl, last) {
    const { u, W, H, tall, T, t } = F;
    const mh = tall ? 270 * u : 232 * u, top = 30 * u;
    masthead(g, F, local, top, mh, false);
    // The date line under the masthead, typed.
    const dy = top + mh + 10 * u;
    g.fillStyle = T.strip; g.fillRect(60 * u, dy, W - 120 * u, 46 * u);
    line(g, 60 * u, dy, W - 60 * u, dy, 4 * u, F.ink(0.92)); line(g, 60 * u, dy + 46 * u, W - 60 * u, dy + 46 * u, 2 * u, F.ink(0.92));
    say(g, "VOL. CXII · NO. 8 · THURSDAY'S EDITION · ALL THE NEWS THAT FITS", W / 2, dy + 32 * u, 26 * u, { align: "center", color: F.ink(0.88), weight: 800, track: 0.12, q: span(local, 0.3, 1.3), maxW: W - 170 * u });
    slip(g, F, HEADS.title, sl, hold, change, { center: true, last });
    const b = unionOf(HEADS.title);
    const y0 = dy + 46 * u + 20 * u;
    // Teasers above the headline when there is room.
    if (b && b.y1 - 40 * u - y0 > 130 * u) {
      const names = ["MARKETS", "WEATHER", "SPORT", "ARTS"], n = tall ? 2 : 4, gap = 20 * u, bw = (W - 120 * u - gap * (n - 1)) / n, bh = Math.min(b.y1 - 40 * u - y0, 150 * u);
      for (let i = 0; i < n; i++) {
        const q = ease(span(local, 0.5 + i * 0.1, 0.9 + i * 0.1)), x = 60 * u + i * (bw + gap), y = y0 + (b.y1 - 40 * u - y0 - bh) / 2;
        if (q <= 0) continue;
        g.save(); g.globalAlpha = q;
        g.fillStyle = T.lite; g.fillRect(x, y, bw, bh); g.strokeStyle = F.ink(0.92); g.lineWidth = 3 * u; g.strokeRect(x, y, bw, bh);
        dotsIn(g, F, { x: x + 6 * u, y: y + 6 * u, w: bw * 0.38, h: bh - 12 * u }, 6 * u, (nx, ny) => blobTone(40 + i)(nx, ny, t), F.ink(0.9));
        say(g, names[i], x + bw * 0.44, y + bh * 0.46, 36 * u, { color: F.ink(0.95), font: HEAD, weight: 900, maxW: bw * 0.52, min: 24 * u });
        for (let k = 0; k < 3; k++) { g.fillStyle = F.ink(0.5); g.fillRect(x + bw * 0.44, y + bh * 0.58 + k * 14 * u, bw * (0.5 - k * 0.1) * (0.8 + 0.2 * Math.sin(t * 3 + k + i)), 5 * u); }
        g.restore();
      }
    }
    // Moving halftone photographs below.
    if (b) {
      const ay = b.y2 + 44 * u, ah = H - 96 * u - ay;
      if (ah > 150 * u) {
        const cols = tall ? 2 : 4, rows = tall && ah > 640 * u ? 2 : 1, gap = 22 * u;
        const pw = (W - 120 * u - gap * (cols - 1)) / cols, ph = Math.min((ah - gap * (rows - 1)) / rows, pw * 0.95);
        const caps = ["Crowds at the quay", "The new tram line", "Choir wins the cup", "Press room at dawn", "Harbour lights", "Market morning"];
        for (let r2 = 0; r2 < rows; r2++) for (let c = 0; c < cols; c++) {
          const i = r2 * cols + c, x = 60 * u + c * (pw + gap), y = ay + r2 * (ph + gap) + (ah - rows * ph - (rows - 1) * gap) / 2;
          photoCard(g, F, x, y, pw, ph, 20 + i * 3, caps[i % caps.length], i % 4 === 1 ? F.acc(0.92) : F.ink(0.9), ease(span(local, 0.7 + i * 0.1, 1.2 + i * 0.1)));
        }
      }
      stamp(g, F, Math.min(W - 190 * u, b.x2 + 40 * u), b.y1 - 6 * u, "EXTRA!", local, 0.9);
    }
  }

  // ---- closing: the last edition rolls off the press ------------------------------------------------------------
  function paperPiece(g, F, x, y, w, h, seed, hot) {
    const { u, T, t } = F;
    g.save(); g.translate(x, y);
    g.shadowColor = "rgba(20,12,0,0.35)"; g.shadowBlur = 10 * u; g.shadowOffsetY = 6 * u;
    g.fillStyle = T.lite; g.fillRect(-w / 2, -h / 2, w, h); g.shadowColor = "transparent";
    g.strokeStyle = F.ink(0.95); g.lineWidth = 3.5 * u; g.strokeRect(-w / 2, -h / 2, w, h);
    g.fillStyle = F.ink(0.92); g.fillRect(-w / 2 + 10 * u, -h / 2 + 10 * u, w - 20 * u, h * 0.15);
    const ph = { x: -w / 2 + 10 * u, y: -h / 2 + h * 0.3, w: w * 0.44, h: h * 0.38 };
    halftone(g, ph.x, ph.y, ph.w, ph.h, Math.max(4 * u, w / 36), 0.5, (nx, ny) => blobTone(seed)(nx, ny, t * 0.6), hot ? F.acc(0.95) : F.ink(0.9));
    g.strokeRect(ph.x, ph.y, ph.w, ph.h);
    for (let k = 0; k < 5; k++) { g.fillStyle = F.ink(0.55); g.fillRect(-w / 2 + w * 0.5 + 10 * u, -h / 2 + h * 0.3 + k * h * 0.075, w * 0.4 * (0.6 + hash(seed + k) * 0.4), h * 0.03); }
    for (let k = 0; k < 3; k++) { g.fillStyle = F.ink(0.55); g.fillRect(-w / 2 + 10 * u, -h / 2 + h * 0.74 + k * h * 0.075, w * (0.9 - hash(seed + k * 3) * 0.3), h * 0.03); }
    g.restore();
  }
  function drawClosing(g, F, local, hold, change, sl, last) {
    const { u, W, H, tall, T, t } = F;
    masthead(g, F, local, 30 * u, tall ? 190 * u : 150 * u, true);
    slip(g, F, HEADS.closing, sl, hold, change, { center: true, last });
    const b = unionOf(HEADS.closing), by = b ? b.y2 + 36 * u : H * 0.55;
    // The journalist's end mark, between the masthead and the headline.
    const ek = e4(span(local, 0.4, 1.1)), mTop = 30 * u + (tall ? 190 : 150) * u;
    if (ek > 0 && b && b.y1 - mTop > 120 * u) {
      const my = (mTop + b.y1) / 2 + 28 * u, ph = Math.min(120 * u, (b.y1 - mTop) * 0.7), pw = Math.min(W - 160 * u, 700 * u);
      g.save(); g.globalAlpha = ek;
      g.shadowColor = "rgba(0,0,0,0.28)"; g.shadowBlur = 12 * u; g.shadowOffsetY = 5 * u;
      g.fillStyle = T.strip; g.fillRect(W / 2 - pw / 2, my - ph * 0.72, pw, ph); g.shadowColor = "transparent";
      g.strokeStyle = F.ink(0.9); g.lineWidth = 4 * u; g.strokeRect(W / 2 - pw / 2, my - ph * 0.72, pw, ph); g.lineWidth = 1.3 * u; g.strokeRect(W / 2 - pw / 2 + 8 * u, my - ph * 0.72 + 8 * u, pw - 16 * u, ph - 16 * u);
      g.restore();
      say(g, "— 30 —", W / 2, my, Math.min(86 * u, ph * 0.72), { align: "center", color: F.ink(0.92), font: HEAD, weight: 900, q: ek, track: 0.1 });
    }
    // Large cylinders turn behind the belt, with paper wrapped around them.
    const beltY = H - 112 * u, belt = 40 * u;
    for (const [cxf, rad] of [[0.08, 260], [0.93, 220]]) {
      const cx = W * cxf, cy = beltY + 70 * u, r = rad * u;
      g.save(); g.translate(cx, cy);
      g.fillStyle = T.lite; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); g.strokeStyle = F.ink(0.95); g.lineWidth = 6 * u; g.stroke();
      g.rotate(t * (cxf < 0.5 ? 0.6 : -0.7));
      for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; line(g, Math.cos(a) * r * 0.22, Math.sin(a) * r * 0.22, Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92, 5 * u, F.ink(0.4)); }
      g.beginPath(); g.arc(0, 0, r * 0.66, 0, TAU); g.lineWidth = 3 * u; g.stroke();
      g.beginPath(); g.arc(0, 0, r * 0.18, 0, TAU); g.fillStyle = F.acc(1); g.fill(); g.stroke();
      g.restore();
    }
    // The belt carries finished papers across, bouncing.
    const lim = H - 70 * u;
    g.save(); g.beginPath(); g.rect(0, 0, W, lim); g.clip();
    const availH = beltY - belt / 2 - 18 * u - (b ? b.y2 + 26 * u : H * 0.6), phh = clamp(availH * 0.88, 90 * u, (tall ? 190 : 230) * u), pw = phh / 0.7, pitch = pw * 1.42, off = mod(t * 230 * u, pitch);
    for (let k = -1; k < W / pitch + 2; k++) {
      const idx = k + Math.floor((t * 230 * u) / pitch), x = k * pitch - off + pw * 0.5, bob = Math.abs(Math.sin(t * 7 + idx * 1.3)) * 10 * u;
      const rise = ease(span(local, 0.2 + Math.max(0, x / W) * 0.6, 0.8 + Math.max(0, x / W) * 0.6));
      g.save(); g.globalAlpha = clamp(rise * 2); paperPiece(g, F, x, beltY - belt / 2 - phh / 2 - bob - 4 * u, pw, phh, 30 + (((idx % 6) + 6) % 6) * 7, ((idx % 4) + 4) % 4 === 0); g.restore();
    }
    g.fillStyle = F.ink(0.94); g.fillRect(0, beltY - belt / 2, W, belt);
    for (let k = -1; k < W / (36 * u) + 2; k++) { g.fillStyle = F.T.lite; g.fillRect(k * 36 * u - mod(t * 230 * u, 36 * u), beltY - 4 * u, 18 * u, 8 * u); }
    g.restore();
    // Paper scraps fall through the whole frame.
    for (let i = 0; i < (tall ? 12 : 16); i++) {
      const sp = 0.1 + hash(i * 3.1) * 0.12, ph = hash(i * 7.7), x = hash(i * 1.9) * W + Math.sin(t * 0.8 + i) * 34 * u, y = mod((t * sp + ph) * H * 1.2, H * 1.2) - H * 0.1;
      if (y > by + 100 * u && y < beltY - 160 * u - phh || y < 40 * u) {
        g.save(); g.translate(x, y); g.rotate(t * (0.6 + hash(i) * 1.2) + i); g.globalAlpha = 0.85;
        g.fillStyle = F.T.lite; g.fillRect(-18 * u, -12 * u, 36 * u, 24 * u); g.strokeStyle = F.ink(0.8); g.lineWidth = 2.2 * u; g.strokeRect(-18 * u, -12 * u, 36 * u, 24 * u);
        g.fillStyle = F.ink(0.5); g.fillRect(-12 * u, -5 * u, 24 * u, 3 * u); g.fillRect(-12 * u, 2 * u, 16 * u, 3 * u);
        g.restore();
      }
    }
    stamp(g, F, W - 230 * u, by + 30 * u, "FINAL", local, 0.8);
  }

  // ---- roller wipe and frame composition ---------------------------------------------------------------------------
  function roller(g, F, x) {
    const { u, W, H, t } = F, w = 86 * u;
    g.save();
    g.translate(x, 0); g.scale(-1, 1); g.translate(-x, 0);
    const sh = g.createLinearGradient(x + w / 2, 0, x + w / 2 + 70 * u, 0); sh.addColorStop(0, "rgba(30,20,5,0.4)"); sh.addColorStop(1, "rgba(30,20,5,0)");
    g.fillStyle = sh; g.fillRect(x + w / 2, 0, 70 * u, H);
    const gr = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    gr.addColorStop(0, "#14110c"); gr.addColorStop(0.22, "#5f5a4d"); gr.addColorStop(0.44, "#d9d2bd"); gr.addColorStop(0.58, "#8c8573"); gr.addColorStop(1, "#14110c");
    g.fillStyle = gr; g.fillRect(x - w / 2, 0, w, H);
    g.fillStyle = hexA(F.S.accent, 0.5); g.globalCompositeOperation = "multiply"; g.fillRect(x - w / 2, 0, w * 0.2, H); g.globalCompositeOperation = "source-over";
    for (let y = -20 * u; y < H + 20 * u; y += 22 * u) line(g, x - w / 2, y + mod(x * 0.9, 22 * u), x + w / 2, y + mod(x * 0.9, 22 * u) + 6 * u, 1.6 * u, "rgba(20,15,5,0.35)");
    line(g, x - w / 2 - 4 * u, 0, x - w / 2 - 4 * u, H, 8 * u, F.ink(0.9));
    g.fillStyle = F.ink(0.9);
    for (let i = 0; i < 26; i++) { const yy = hash(i * 5.1 + Math.floor(x / (60 * u))) * H, r = (2 + hash(i) * 5) * u; g.beginPath(); g.arc(x - w / 2 - 14 * u - hash(i * 2.2) * 24 * u, yy, r, 0, TAU); g.fill(); }
    g.restore();
  }
  const SCENE = { chart: drawChart, object: drawObject, people: drawPeople, process: drawProcess, compare: drawCompare };
  const TAGLINE = { chart: "PAGE 3 · SECTION B", object: "PAGE 4 · SECTION B", people: "PAGE 5 · SECTION C", process: "PAGE 6 · SECTION C", compare: "PAGE 7 · SECTION D" };
  // `art` runs the drawing's clock (it starts early, under the roller); `sl` is the headline's own clock.
  function drawScene(g, F, st, art, sl, change, last) {
    const P = F.plan, id = st.id;
    if (id !== "title") { g.save(); g.fillStyle = hexA(F.T.paper, 0.2); g.fillRect(0, 0, F.W, F.H); g.restore(); }
    if (id !== "title" && id !== "closing") dateline(g, F);
    if (id === "title") return drawTitle(g, F, art, st.hold, change, sl, last);
    if (id === "closing") return drawClosing(g, F, art, st.hold, change, sl, last);
    slip(g, F, HEADS[id], sl, st.hold, change, { tag: TAGLINE[id], last });
    SCENE[id](g, F, art, st.hold, P.data[id]);
  }
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
    const data = {
      chart: { labels: [c.bar_1_label, c.bar_2_label, c.bar_3_label, c.bar_4_label], values: [c.bar_1, c.bar_2, c.bar_3, c.bar_4], suffix: c.chart_suffix, prefix: "", highlight: Number(c.highlight) - 1 },
      object: { kind: c.device, callouts: [c.callout_1, c.callout_2, c.callout_3] },
      people: { count: c.people_count, badges: [c.badge_1, c.badge_2, c.badge_3], highlight: 1 },
      process: { steps: [c.step_1, c.step_2, c.step_3] },
      compare: { left: c.before_label, leftValue: c.before_value, right: c.after_label, rightValue: c.after_value, suffix: c.compare_suffix, prefix: "" },
    };
    planKey = key;
    return (planCache = { shown, data, change: Number(c.change) || 0.45 });
  }

  let frame = null;
  function makeFrame(ctx, S, info) {
    const { W, H, u } = S, look = S.look, T = look.tone;
    const F = {
      S, W, H, u, tall: S.tall, T, info, t: info.t, tex: look.texture ?? 1,
      ink: (a) => `rgba(${T.ink},${a})`, acc: (a) => hexA(S.accent, a),
    };
    F.plan = planOf(F);
    return F;
  }
  function finish(g, F) {
    const { W, H, u, T } = F, C = tiles(F);
    g.save();
    if (F.tex > 0) {
      // Thin the ink with paper-coloured specks, then darken the edges as old pulp does.
      g.globalAlpha = 0.7 * F.tex; g.fillStyle = g.createPattern(C.wear, "repeat"); g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
      const gr = g.createRadialGradient(W * 0.46, H * 0.42, 0, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.62);
      gr.addColorStop(0, "rgba(255,248,220,0.06)"); gr.addColorStop(0.55, "rgba(0,0,0,0)"); gr.addColorStop(1, `rgba(${T.stain},${T.vig * F.tex})`);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    g.restore();
  }

  const halo = (paper, ink) => () => `0 0 1px rgba(${ink},0.35), 0 0 14px ${paper}`;
  const TONE = {
    paper: "#e6d6a6", lite: "#f1e6c3", panel: "#efe3bd", panelDim: "#d9cb9f", strip: "#f3e9c8", tape: "rgba(236,218,150,0.72)",
    ink: "28,22,14", stain: "150,106,36", wear: "232,218,170", blend: "multiply", onAccent: "#f6ecce", fold: 0.14, vig: 0.42,
  };

  return {
    bg: "#e6d6a6", panel: "rgba(255,250,230,0.5)", ink: "#1c160e", muted: "#5a4e38", accent: "#c8341f", onAccent: "#f6ecce",
    rule: "rgba(28,22,14,0.85)", track: "rgba(28,22,14,0.1)",
    display: HEAD, displayWeight: 900, displayCase: "uppercase", displayTracking: "-0.005em",
    body: LABEL, bodyWeight: 600,
    figures: HEAD, radius: 0, motion: "wipe", change: "fade", kit: { line: 3, fill: "solid", panel: "outline" },
    panelEdge: "rgba(28,22,14,0.7)",
    tone: TONE,
    keepArt: true,
    overlap: true,
    palettes: {
      light: { bg: "#f2efe6", ink: "#161b24", muted: "#4c5666", accent: "#d6301c", onAccent: "#ffffff", rule: "rgba(22,27,36,0.8)", textShadow: halo("#faf8f1", "22,27,36"), backdrop: () => "#f2efe6",
        tone: { ...TONE, paper: "#f1eee4", lite: "#fbfaf4", panel: "#f8f6ee", panelDim: "#dedbd0", strip: "#fcfbf6", tape: "rgba(205,215,225,0.7)", ink: "22,27,36", stain: "120,128,140", wear: "244,242,234", onAccent: "#ffffff", fold: 0.1, vig: 0.2 } },
      dark: { bg: "#1f1c17", panel: "rgba(255,246,220,0.05)", ink: "#efe5c8", muted: "#b2a684", accent: "#ff7a55", onAccent: "#1f1c17", rule: "rgba(239,229,200,0.8)", textShadow: halo("#2a261f", "239,229,200"), backdrop: () => "#1f1c17",
        tone: { ...TONE, paper: "#1f1c17", lite: "#2f2a22", panel: "#2a261f", panelDim: "#221f19", strip: "#2d2921", tape: "rgba(150,130,80,0.55)", ink: "239,229,200", stain: "8,6,2", wear: "31,28,23", blend: "source-over", onAccent: "#1f1c17", fold: 0.06, vig: 0.5 } },
      mono: { bg: "#e3e2dd", ink: "#1b1b1b", muted: "#5d5d58", accent: "#2a2a2a", onAccent: "#e3e2dd", rule: "rgba(27,27,27,0.8)", textShadow: halo("#efeeea", "27,27,27"), backdrop: () => "#e3e2dd",
        tone: { ...TONE, paper: "#e3e2dd", lite: "#f1f0ec", panel: "#eceae5", panelDim: "#d2d0ca", strip: "#f0efea", tape: "rgba(200,198,190,0.7)", ink: "27,27,27", stain: "110,108,100", wear: "227,226,221", onAccent: "#e3e2dd", fold: 0.1, vig: 0.28 } },
    },
    css: (accent, look) => `
      .display { text-shadow: none; }
      .kicker { font-family: ${LABEL}; font-weight: 800; letter-spacing: 0.24em; color: ${accent}; }
    `,
    textShadow: halo("#e6d6a6", "28,22,14"),
    backdrop: () => "#e6d6a6",
    // The paper is drawn by the stage; this pass only marks the backdrop as on.
    paint: (ctx, W, H) => { ctx.clearRect(0, 0, W, H); },
    stage(ctx, S, info) {
      const F = (frame = makeFrame(ctx, S, info)), g = ctx;
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.setLineDash([]); g.lineCap = "butt";
      if (S.paint) drawPage(g, F);
      const P = F.plan;
      if (P) {
        const idx = info.index >= 0 ? info.index : P.shown.length - 1, st = P.shown[idx], local = info.index >= 0 ? info.local : st.hold;
        const next = P.shown[idx + 1], change = P.change, u = F.u;
        const shift = idx > 0 ? change : 0.3;
        const leaving = next && local > st.hold - change;
        if (leaving) {
          // The roller crosses in the last moments of a scene; the next one is already built beneath it.
          const k = clamp((local - (st.hold - change)) / change), wx = lerp(F.W + 100 * u, -60 * u, Math.pow(k, 3.2));
          g.save(); g.beginPath(); g.rect(0, 0, wx - 40 * u, F.H); g.clip();
          drawScene(g, F, st, local + shift, local, change, false);
          g.restore();
          g.save(); g.beginPath(); g.rect(wx + 40 * u, 0, F.W, F.H); g.clip();
          drawScene(g, F, next, local - st.hold + change, local - st.hold, change, !P.shown[idx + 2]);
          g.restore();
          roller(g, F, wx);
        } else drawScene(g, F, st, local + shift, local, change, !next);
      } else if (info.scene === "title") drawTitle(g, F, info.local, info.hold, info.change, info.local, true);
      else if (info.scene === "closing") drawClosing(g, F, info.local, info.hold, info.change, info.local, true);
      else if (info.scene) dateline(g, F);
      ticker(g, F);
      finish(g, F);
      g.restore();
    },
    // With the controls known the stage draws every scene; these only run when it cannot see them.
    scenes: Object.fromEntries(["chart", "object", "people", "process", "compare"].map((id) => [id, (ctx, S, box, p, d, info) => {
      const F = frame;
      if (!F || F.plan || F.info.scene !== id) return;
      const hold = info.hold || 3, local = info.local ?? hold;
      slip(ctx, F, HEADS[id], local, hold, info.change || 0.45, { tag: TAGLINE[id] });
      SCENE[id](ctx, F, local, hold, d);
    }])),
  };
});
