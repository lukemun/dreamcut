// Original light-show variation. Shares DreamCut's poster figures and lettering,
// with a separate deterministic vector backdrop; no reference artwork is embedded.
window.DreamcutMotion.register("psychedelic-bloom", ({ hexA }) => {
  const base = window.DreamcutMotion.LOOKS.psychedelic;
  // The light show fills the frame with the poster's dark ink, so type set in the page reads in
  // the cream with an ink edge (Psychedelic's own dark type sits on its bright bands).
  const onShow = (tokens) => ({
    ink: tokens.psy.cream, muted: hexA(tokens.psy.cream, 0.78),
    rule: hexA(tokens.psy.cream, 0.9), track: hexA(tokens.psy.cream, 0.14),
    textShadow: () => `0 0.05em 0 ${tokens.psy.ink}, 0 0 0.18em ${hexA(tokens.psy.ink, 0.6)}`,
  });
  const TAU = Math.PI * 2;
  function flower(ctx, x, y, r, t, colors, ink) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * .12);
    for (let layer = 6; layer >= 0; layer--) {
      const radius = r * (.22 + layer * .13);
      ctx.beginPath();
      for (let j = 0; j <= 240; j++) {
        const a = j / 240 * TAU;
        const v = radius * (1 + .14 * Math.cos(8 * a + layer * .45 + t * .4));
        const px = Math.cos(a) * v, py = Math.sin(a) * v;
        if (!j) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fillStyle = colors[layer % colors.length]; ctx.fill();
      ctx.strokeStyle = ink; ctx.lineWidth = r * .009; ctx.stroke();
    }
    ctx.restore();
  }
  function lightShow(ctx, W, H, t, look, scene = 'title') {
    const k = look.psy.inks, ink = look.psy.ink;
    const colors = [k.purple, k.blue, k.teal, k.lime, k.yellow, k.orange, k.pink];
    ctx.fillStyle = ink; ctx.fillRect(0, 0, W, H);
    const m = Math.min(W, H), tall = H > W;
    const phase = ['title','chart','object','people','process','compare','closing'].indexOf(scene) * .47;
    // Silken bands travel along both edges. Their middle remains clear for text and art.
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(W / 2, H / 2); if (tall) ctx.rotate(Math.PI / 2);
      const span = tall ? H : W, depth = tall ? W : H;
      for (let b = 0; b < 9; b++) {
        ctx.beginPath();
        for (let j = 0; j <= 100; j++) {
          const x = (j / 100 - .5) * span * 1.1;
          const wave = Math.sin(x / span * 7 + t * .38 + phase + b * .13) * depth * .055
            + Math.sin(x / span * 13 - t * .22 + b * .22) * depth * .023;
          const y = side * (depth * (.18 + b * .043) + wave);
          if (!j) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.lineTo(span, side * depth); ctx.lineTo(-span, side * depth); ctx.closePath();
        ctx.fillStyle = colors[(b + (side > 0 ? 2 : 0)) % colors.length]; ctx.fill();
        ctx.lineWidth = m * .003; ctx.strokeStyle = ink; ctx.stroke();
      }
      ctx.restore();
    }
    // Flowers are anchored at the perimeter, keeping the central title legible.
    const r = m * (.23 + .012 * Math.sin(t * .7));
    flower(ctx, W * .02, H * .12, r, t + phase, colors, ink);
    flower(ctx, W * .98, H * .88, r, -t + phase + 2, colors, ink);
    // Slowly orbiting pin-stars use the same clock at every seek.
    ctx.fillStyle = look.psy.cream;
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * TAU + t * .025;
      const x = W / 2 + Math.cos(a) * W * .46, y = H / 2 + Math.sin(a) * H * .43;
      const s = m * (.0025 + .002 * (1 + Math.sin(t * 1.3 + i)));
      ctx.beginPath(); ctx.moveTo(x-s*2,y);ctx.quadraticCurveTo(x,y,x,y-s*2);
      ctx.quadraticCurveTo(x,y,x+s*2,y);ctx.quadraticCurveTo(x,y,x,y+s*2);
      ctx.quadraticCurveTo(x,y,x-s*2,y);ctx.fill();
    }
  }
  return {
    ...base,
    ...onShow(base),
    palettes: Object.fromEntries(Object.entries(base.palettes).map(([id, palette]) => [id, { ...palette, ...onShow(palette) }])),
    backdrop: () => '#2a0f3d',
    paintOver: false,
    paint: (ctx,W,H,t,accent,look) => lightShow(ctx,W,H,t,look),
    stage: (ctx,S,info) => {
      // Preserve the shared scene clock/exit choreography without its scalar-field backdrop.
      base.stage(ctx,{...S,paint:null},info);
      if (S.paint) lightShow(ctx,S.W,S.H,info.t,S.look,info.scene);
    },
  };
});
