/** Lightweight inspector catalog. Never imports contour or mask payloads. */
export const PREPARED_HANDWRITING_FONTS = {
  alex_brush: { slug: 'alex-brush', family: 'Alex Brush' },
  lobster: { slug: 'lobster', family: 'Lobster' },
  pacifico: { slug: 'pacifico', family: 'Pacifico' },
  yellowtail: { slug: 'yellowtail', family: 'Yellowtail' },
  comic_neue: { slug: 'comic-neue', family: 'Comic Neue' },
  indie_flower: { slug: 'indie-flower', family: 'Indie Flower' },
  caveat: { slug: 'caveat', family: 'Caveat' },
  romantic_script: { slug: 'petit-formal-script', family: 'Petit Formal Script' },
  handwritten_script: { slug: 'great-vibes', family: 'Great Vibes' },
  allura: { slug: 'allura', family: 'Allura' },
  parisienne: { slug: 'parisienne', family: 'Parisienne' },
  sacramento: { slug: 'sacramento', family: 'Sacramento' },
} as const;
export const PREPARED_HANDWRITING_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?-:;\'"()[]/\\+&@#%=_*';
export const MARKER_HANDWRITING_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?-:;\'"()';
export function handwritingPackStatus(fontId: string, text: string, revealMode: 'line_mask'|'saved_strokes' = 'line_mask') {
  const marker=fontId==='permanent_marker';
  const prepared=fontId in PREPARED_HANDWRITING_FONTS;
  const supported=marker?(revealMode==='line_mask'?PREPARED_HANDWRITING_CHARACTERS:MARKER_HANDWRITING_CHARACTERS):prepared?PREPARED_HANDWRITING_CHARACTERS:'';
  const unsupported=[...new Set([...text].filter(c=>!/\s/.test(c)&&!supported.includes(c)))];
  if(marker)return {kind:'reference' as const,label:`${revealMode==='line_mask'?'Turning line mask · motion needs review':'Previous saved strokes · shown result accepted'}${unsupported.length?' · some characters appear whole':''}`,unsupported};
  if(!prepared)return {kind:'fallback' as const,label:'Pen-script fallback · selected font shape is not preserved',unsupported};
  return {kind:'prepared' as const,label:`${revealMode==='line_mask'?'Turning line mask':'Previous saved reveal'} · motion needs review${unsupported.length?' · some characters appear whole':''}`,unsupported};
}
