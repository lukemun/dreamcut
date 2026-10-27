// Drawing kit for illustrated scenes: a chart, an object with callouts, a group of people, a
// three-step process and a before/after comparison. Every drawer paints a 2D canvas from the scene's
// reveal progress `p` (0 to 1) and the look's own `kit` settings, so one scene reads as a different
// medium in each look. Figures and objects are simple original shapes. Pure functions of their inputs.
(function () {
  const M = window.DreamcutMotion;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
  // Progress of one item in a staggered reveal: item i of n starts at i/n * spread.
  const stagger = (p, i, n, spread = 0.55) => ease((p - (i / Math.max(1, n)) * spread) / (1 - spread));

  function style(S) {
    const k = S.look.kit || {};
    return {
      line: (k.line ?? 3) * S.u, glow: (k.glow ?? 0) * S.u, fill: k.fill ?? "solid", panel: k.panel ?? "fill",
      dims: Boolean(k.dims), italic: Boolean(k.italic), hatch: Boolean(k.hatch),
      ink: S.look.ink, muted: S.look.muted, accent: S.accent, panelColor: S.look.panel, edge: S.look.panelEdge && S.look.panelEdge !== "transparent" ? S.look.panelEdge : S.look.rule,
    };
  }

  // Stroke the current path in the look's medium: thin lines, neon glow or a drafted line with bleed.
  function stroke(ctx, st, color, width) {
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    ctx.lineWidth = width ?? st.line;
    if (st.glow) { ctx.shadowColor = color; ctx.shadowBlur = st.glow; ctx.stroke(); ctx.shadowBlur = st.glow * 0.4; }
    ctx.stroke();
    ctx.restore();
  }

  // Fill the current path: solid, translucent (glass), hatched (drafting) or outline only.
  function fill(ctx, st, color, box) {
    ctx.save();
    if (st.fill === "none") { ctx.restore(); return; }
    if (st.fill === "hatch" && box) {
      ctx.clip();
      ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, st.line * 0.45); ctx.globalAlpha = 0.7;
      const step = 10 * (st.line / 3 + 0.6);
      ctx.beginPath();
      for (let x = box.x - box.h; x < box.x + box.w; x += step) { ctx.moveTo(x, box.y + box.h); ctx.lineTo(x + box.h, box.y); }
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      if (st.fill === "glass") ctx.globalAlpha = 0.55;
      if (st.glow) { ctx.shadowColor = color; ctx.shadowBlur = st.glow * 1.4; }
      ctx.fill();
    }
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr); ctx.closePath();
  }

  // A card in the look's medium: frosted glass, a drafted outline, or a plain panel.
  function panel(ctx, S, st, x, y, w, h) {
    const r = Math.min(S.look.radius * S.u, h / 3);
    roundRect(ctx, x, y, w, h, r);
    ctx.save();
    if (st.panel === "glass") {
      ctx.fillStyle = "rgba(255,255,255,0.13)"; ctx.shadowColor = "rgba(10,6,30,0.25)"; ctx.shadowBlur = 40 * S.u; ctx.shadowOffsetY = 16 * S.u; ctx.fill();
      ctx.shadowColor = "transparent";
      const sheen = ctx.createLinearGradient(x, y, x + w, y + h);
      sheen.addColorStop(0, "rgba(255,255,255,0.22)"); sheen.addColorStop(0.45, "rgba(255,255,255,0.02)"); sheen.addColorStop(1, "rgba(255,255,255,0.08)");
      ctx.fillStyle = sheen; ctx.fill();
      ctx.lineWidth = 1.5 * S.u; ctx.strokeStyle = st.edge; ctx.stroke();
    } else if (st.panel === "outline") {
      ctx.restore(); stroke(ctx, st, st.edge, st.line * 0.8); return;
    } else {
      ctx.fillStyle = st.panelColor; ctx.fill();
      if (st.glow) { ctx.lineWidth = 2 * S.u; ctx.strokeStyle = st.accent; ctx.shadowColor = st.accent; ctx.shadowBlur = st.glow; ctx.stroke(); }
    }
    ctx.restore();
  }

  function text(ctx, S, st, words, x, y, size, { color, align = "left", weight, font = "body", baseline = "alphabetic" } = {}) {
    ctx.save();
    const fam = font === "display" ? S.look.display : font === "figures" ? S.look.figures : S.look.body;
    const italic = st.italic || (font === "display" && S.look.displayStyle === "italic");
    ctx.font = `${italic ? "italic " : ""}${weight ?? (font === "body" ? S.look.bodyWeight : S.look.displayWeight)} ${size}px ${fam}`;
    ctx.fillStyle = color ?? st.ink; ctx.textAlign = align; ctx.textBaseline = baseline;
    const shown = S.look.displayCase === "uppercase" && font !== "body" ? String(words).toUpperCase() : String(words);
    if (st.glow) { ctx.shadowColor = color ?? st.accent; ctx.shadowBlur = st.glow * 0.8; }
    ctx.fillText(shown, x, y);
    ctx.restore();
  }

  // A drafted dimension line between two points with end ticks and a label.
  function dimension(ctx, S, st, x1, y1, x2, y2, label) {
    if (!st.dims) return;
    ctx.save();
    ctx.setLineDash([]);
    const u = S.u;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    const tick = 9 * u, horizontal = Math.abs(y2 - y1) < Math.abs(x2 - x1);
    for (const [x, y] of [[x1, y1], [x2, y2]]) { if (horizontal) { ctx.moveTo(x, y - tick); ctx.lineTo(x, y + tick); } else { ctx.moveTo(x - tick, y); ctx.lineTo(x + tick, y); } }
    stroke(ctx, st, st.muted, Math.max(1, 1.2 * u));
    if (label) text(ctx, S, st, label, (x1 + x2) / 2 + (horizontal ? 0 : 14 * u), (y1 + y2) / 2 - (horizontal ? 14 * u : 0), 28 * u, { color: st.muted, align: horizontal ? "center" : "left", baseline: horizontal ? "bottom" : "middle" });
    ctx.restore();
  }

  // ---- scene drawers -------------------------------------------------------------------------------

  // Bars rise one by one; values count with them; one bar carries the accent.
  function chart(ctx, S, box, p, d) {
    const st = style(S);
    const n = d.values.length;
    const max = Math.max(...d.values, 1);
    const gap = box.w * 0.06;
    const bw = (box.w - gap * (n + 1)) / n;
    const base = box.y + box.h - 60 * S.u;
    ctx.beginPath(); ctx.moveTo(box.x, base); ctx.lineTo(box.x + box.w * ease(p * 2), base);
    stroke(ctx, st, st.edge, Math.max(1.5, st.line * 0.7));
    d.values.forEach((value, i) => {
      const q = stagger(p, i, n);
      const h = (box.h - 150 * S.u) * (value / max) * q;
      const x = box.x + gap + i * (bw + gap);
      const hot = i === d.highlight;
      const color = hot ? st.accent : st.fill === "none" || st.panel === "outline" ? st.ink : S.look.muted;
      roundRect(ctx, x, base - h, bw, h, Math.min(S.look.radius * S.u * 0.4, bw / 4));
      fill(ctx, { ...st, fill: hot && st.hatch ? "hatch" : st.fill }, color, { x, y: base - h, w: bw, h });
      roundRect(ctx, x, base - h, bw, h, Math.min(S.look.radius * S.u * 0.4, bw / 4));
      if (st.fill === "none" || st.panel === "outline" || st.glow) stroke(ctx, st, color);
      if (q > 0.05) {
        text(ctx, S, st, M.formatNumber(value * q, 0, d.prefix, d.suffix), x + bw / 2, base - h - 16 * S.u, 50 * S.u, { align: "center", font: "figures", color: hot ? st.accent : st.ink });
        text(ctx, S, st, d.labels[i] || "", x + bw / 2, base + 46 * S.u, 36 * S.u, { align: "center", color: st.muted });
      }
    });
    if (n > 1) dimension(ctx, S, st, box.x + gap, box.y + 18 * S.u, box.x + box.w - gap, box.y + 18 * S.u, d.span || "");
  }

  // A laptop (or phone) showing a small edit timeline, with three labelled callouts drawn out to its parts.
  function object(ctx, S, box, p, d) {
    const st = style(S);
    const phone = d.kind === "phone";
    const w = phone ? Math.min(box.w * 0.32, box.h * 0.48) : Math.min(box.w * 0.62, box.h * 1.25);
    const h = phone ? w * 1.9 : w * 0.62;
    const x = box.x + (phone ? box.w * 0.36 : box.w * 0.08) - (phone ? w / 2 : 0);
    const y = box.y + (box.h - h - (phone ? 0 : h * 0.12)) / 2;
    const q = ease(p * 1.4);
    ctx.save();
    ctx.globalAlpha = clamp(p * 3);
    // Body and screen.
    roundRect(ctx, x, y, w, h, (phone ? 36 : 16) * S.u);
    fill(ctx, st, st.panelColor);
    roundRect(ctx, x, y, w, h, (phone ? 36 : 16) * S.u);
    stroke(ctx, st, st.edge);
    const pad = (phone ? 18 : 22) * S.u;
    const sx = x + pad, sy = y + pad, sw = w - pad * 2, sh = h - pad * 2;
    roundRect(ctx, sx, sy, sw, sh, 8 * S.u);
    fill(ctx, { ...st, fill: st.fill === "none" ? "none" : "solid" }, S.look.bg);
    roundRect(ctx, sx, sy, sw, sh, 8 * S.u);
    stroke(ctx, st, st.muted, Math.max(1, st.line * 0.5));
    // A small timeline on the screen: a preview frame and three tracks of clips.
    const tracks = 3, th = sh * 0.11;
    const preview = { x: sx + sw * 0.08, y: sy + sh * 0.08, w: sw * 0.84, h: sh * 0.42 };
    roundRect(ctx, preview.x, preview.y, preview.w, preview.h, 6 * S.u); fill(ctx, st, st.accent);
    roundRect(ctx, preview.x, preview.y, preview.w, preview.h, 6 * S.u); stroke(ctx, st, st.accent, Math.max(1, st.line * 0.6));
    for (let t = 0; t < tracks; t++) {
      const ty = sy + sh * 0.58 + t * (th + sh * 0.04);
      const clips = [[0.08, 0.3], [0.4, 0.22], [0.65, 0.27]];
      clips.forEach(([cx, cw], i) => {
        const shown = clamp((q - 0.2 - i * 0.12) * 3);
        if (shown <= 0) return;
        roundRect(ctx, sx + sw * (cx + t * 0.03), ty, sw * cw * shown, th, 4 * S.u);
        fill(ctx, st, t === 0 && i === 1 ? st.accent : st.muted);
      });
    }
    if (!phone) { // The base of the laptop.
      ctx.beginPath(); ctx.moveTo(x - w * 0.06, y + h + h * 0.06); ctx.lineTo(x + w * 1.06, y + h + h * 0.06); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath();
      fill(ctx, st, st.panelColor); stroke(ctx, st, st.edge);
    }
    ctx.restore();
    dimension(ctx, S, st, x, y + h + (phone ? 30 : h * 0.06 + 40) * S.u, x + w, y + h + (phone ? 30 : h * 0.06 + 40) * S.u, d.span || "");
    // Callouts: a leader from a part of the device to its label on the right.
    const anchors = [[preview.x + preview.w * 0.7, preview.y + preview.h * 0.3], [sx + sw * 0.52, sy + sh * 0.64], [sx + sw * 0.2, sy + sh * 0.86]];
    const labelX = box.x + box.w * (phone ? 0.62 : 0.78);
    d.callouts.forEach((label, i) => {
      const c = stagger(p, i, d.callouts.length, 0.5);
      if (c <= 0 || !label) return;
      const [ax, ay] = anchors[i];
      const ly = box.y + box.h * (0.22 + i * 0.28);
      ctx.beginPath(); ctx.arc(ax, ay, 7 * S.u, 0, Math.PI * 2); fill(ctx, { ...st, fill: "solid" }, st.accent);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + (labelX - 16 * S.u - ax) * c, ay + (ly - ay) * c);
      stroke(ctx, st, st.accent, Math.max(1.5, st.line * 0.6));
      if (c > 0.85) text(ctx, S, st, label, labelX, ly, 42 * S.u, { baseline: "middle", weight: 600 });
    });
  }

  // A row of simple people; one in the accent, each with a small badge above.
  function figure(ctx, S, st, cx, base, size, color, q) {
    const head = size * 0.2;
    ctx.save();
    ctx.globalAlpha = clamp(q * 2);
    ctx.translate(0, (1 - q) * size * 0.25);
    ctx.beginPath(); ctx.arc(cx, base - size + head, head, 0, Math.PI * 2);
    fill(ctx, st, color); ctx.beginPath(); ctx.arc(cx, base - size + head, head, 0, Math.PI * 2); stroke(ctx, st, color);
    const bw = size * 0.56, top = base - size + head * 2 + size * 0.06;
    ctx.beginPath();
    ctx.moveTo(cx - bw / 2, base); ctx.lineTo(cx - bw / 2, top + bw * 0.35);
    ctx.quadraticCurveTo(cx - bw / 2, top, cx, top); ctx.quadraticCurveTo(cx + bw / 2, top, cx + bw / 2, top + bw * 0.35);
    ctx.lineTo(cx + bw / 2, base); ctx.closePath();
    fill(ctx, st, color); ctx.beginPath();
    ctx.moveTo(cx - bw / 2, base); ctx.lineTo(cx - bw / 2, top + bw * 0.35);
    ctx.quadraticCurveTo(cx - bw / 2, top, cx, top); ctx.quadraticCurveTo(cx + bw / 2, top, cx + bw / 2, top + bw * 0.35);
    ctx.lineTo(cx + bw / 2, base); stroke(ctx, st, color);
    ctx.restore();
  }
  function people(ctx, S, box, p, d) {
    const st = style(S);
    const n = Math.max(2, Math.min(6, Math.round(d.count)));
    const size = Math.min(box.h * 0.62, (box.w / n) * 1.25);
    const base = box.y + box.h * 0.9;
    ctx.beginPath(); ctx.moveTo(box.x, base); ctx.lineTo(box.x + box.w * ease(p * 2), base); stroke(ctx, st, st.edge, Math.max(1.5, st.line * 0.6));
    for (let i = 0; i < n; i++) {
      const q = stagger(p, i, n);
      const cx = box.x + (box.w / n) * (i + 0.5);
      const hot = i === Math.min(n - 1, d.highlight);
      figure(ctx, S, st, cx, base, size * (hot ? 1.06 : 1), hot ? st.accent : st.muted, q);
      const label = d.badges[i % d.badges.length];
      if (q > 0.9 && label) {
        const bw = Math.max(130 * S.u, label.length * 21 * S.u), by = base - size * 1.18 - 60 * S.u;
        panel(ctx, S, st, cx - bw / 2, by, bw, 62 * S.u);
        text(ctx, S, st, label, cx, by + 31 * S.u, 32 * S.u, { align: "center", baseline: "middle", weight: 600, color: hot ? st.accent : st.ink });
      }
    }
  }

  // Three steps as cards with simple icons, joined by arrows that draw on.
  function icon(ctx, S, st, kind, cx, cy, s, color) {
    ctx.save();
    ctx.beginPath();
    if (kind === "file") {
      ctx.moveTo(cx - s * 0.32, cy - s * 0.42); ctx.lineTo(cx + s * 0.12, cy - s * 0.42); ctx.lineTo(cx + s * 0.32, cy - s * 0.22);
      ctx.lineTo(cx + s * 0.32, cy + s * 0.42); ctx.lineTo(cx - s * 0.32, cy + s * 0.42); ctx.closePath();
      ctx.moveTo(cx - s * 0.18, cy); ctx.lineTo(cx + s * 0.18, cy); ctx.moveTo(cx - s * 0.18, cy + s * 0.16); ctx.lineTo(cx + s * 0.1, cy + s * 0.16);
    } else if (kind === "spark") {
      for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2; ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * s * 0.42, cy + Math.sin(a) * s * 0.42); }
      for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + (k * Math.PI) / 2; ctx.moveTo(cx + Math.cos(a) * s * 0.12, cy + Math.sin(a) * s * 0.12); ctx.lineTo(cx + Math.cos(a) * s * 0.26, cy + Math.sin(a) * s * 0.26); }
    } else if (kind === "eye") {
      ctx.moveTo(cx - s * 0.42, cy); ctx.quadraticCurveTo(cx, cy - s * 0.4, cx + s * 0.42, cy); ctx.quadraticCurveTo(cx, cy + s * 0.4, cx - s * 0.42, cy);
      ctx.moveTo(cx + s * 0.12, cy); ctx.arc(cx, cy, s * 0.12, 0, Math.PI * 2);
    } else {
      ctx.moveTo(cx - s * 0.3, cy + s * 0.02); ctx.lineTo(cx - s * 0.08, cy + s * 0.24); ctx.lineTo(cx + s * 0.34, cy - s * 0.22);
    }
    stroke(ctx, st, color, Math.max(2, st.line * 1.1));
    ctx.restore();
  }
  function process(ctx, S, box, p, d) {
    const st = style(S);
    const n = d.steps.length;
    const vertical = box.h > box.w;
    const cw = vertical ? box.w * 0.62 : (box.w - 2 * box.w * 0.08) / n * 0.8;
    const ch = vertical ? box.h / n * 0.68 : Math.min(box.h * 0.72, cw * 1.05);
    const kinds = ["file", "spark", "eye", "check"];
    for (let i = 0; i < n; i++) {
      const q = stagger(p, i, n, 0.6);
      const x = vertical ? box.x + (box.w - cw) / 2 : box.x + box.w * 0.08 / 2 + i * (box.w / n);
      const y = vertical ? box.y + i * (box.h / n) : box.y + (box.h - ch) / 2;
      if (q <= 0) continue;
      ctx.save();
      ctx.globalAlpha = clamp(q * 2.5);
      panel(ctx, S, st, x, y, cw, ch);
      icon(ctx, S, st, kinds[Math.min(i, n - 1) === n - 1 ? 3 : i % 3], x + cw / 2, y + ch * 0.38, Math.min(cw, ch) * 0.42, i === n - 1 ? st.accent : st.ink);
      text(ctx, S, st, d.steps[i], x + cw / 2, y + ch * 0.82, Math.min(40 * S.u, cw / Math.max(6, d.steps[i].length) * 1.8), { align: "center", weight: 600, baseline: "middle" });
      text(ctx, S, st, String(i + 1).padStart(2, "0"), x + 22 * S.u, y + 44 * S.u, 30 * S.u, { font: "figures", color: st.accent });
      ctx.restore();
      if (i < n - 1) {
        const a = stagger(p, i + 0.6, n, 0.6);
        if (a <= 0) continue;
        ctx.beginPath();
        if (vertical) { const ax = x + cw / 2, ay = y + ch + 6 * S.u, by = y + box.h / n - 6 * S.u; ctx.moveTo(ax, ay); ctx.lineTo(ax, ay + (by - ay) * a); }
        else { const ay = y + ch / 2, ax = x + cw + 8 * S.u, bx = x + box.w / n - 8 * S.u; ctx.moveTo(ax, ay); ctx.lineTo(ax + (bx - ax) * a, ay);
          if (a > 0.95) { ctx.moveTo(bx - 14 * S.u, ay - 10 * S.u); ctx.lineTo(bx, ay); ctx.lineTo(bx - 14 * S.u, ay + 10 * S.u); } }
        stroke(ctx, st, st.accent, Math.max(2, st.line * 0.9));
      }
    }
  }

  // Two cards side by side; each meter fills to its value, the second in the accent.
  function compare(ctx, S, box, p, d) {
    const st = style(S);
    const vertical = box.h > box.w * 1.1;
    const gap = 40 * S.u;
    const cw = vertical ? box.w : (box.w - gap) / 2, ch = vertical ? (box.h - gap) / 2 : box.h * 0.82;
    [[d.left, d.leftValue, st.muted], [d.right, d.rightValue, st.accent]].forEach(([label, value, color], i) => {
      const q = stagger(p, i, 2, 0.4);
      if (q <= 0) return;
      const x = vertical ? box.x : box.x + i * (cw + gap), y = vertical ? box.y + i * (ch + gap) : box.y + (box.h - ch) / 2;
      ctx.save(); ctx.globalAlpha = clamp(q * 2.5);
      panel(ctx, S, st, x, y, cw, ch);
      text(ctx, S, st, label, x + 36 * S.u, y + 70 * S.u, 42 * S.u, { weight: 600, color: i ? st.accent : st.ink });
      text(ctx, S, st, M.formatNumber(value * q, 0, d.prefix, d.suffix), x + 32 * S.u, y + ch * 0.58, Math.min(150 * S.u, ch * 0.36), { font: "figures", color });
      const mx = x + 32 * S.u, my = y + ch - 64 * S.u, mw = cw - 64 * S.u, mh = 18 * S.u;
      roundRect(ctx, mx, my, mw, mh, mh / 2); fill(ctx, { ...st, fill: "solid" }, S.look.track);
      roundRect(ctx, mx, my, mw * clamp(value / Math.max(d.leftValue, d.rightValue, 1)) * q, mh, mh / 2); fill(ctx, { ...st, fill: st.fill === "none" ? "solid" : st.fill }, color);
      ctx.restore();
    });
  }

  M.kit = { chart, object, people, process, compare, panel, stroke, fill, text, roundRect, dimension, ease, clamp };
})();
