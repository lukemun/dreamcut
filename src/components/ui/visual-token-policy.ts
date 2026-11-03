/**
 * Visual-system gate: components consume semantic tokens, not raw colours.
 * See docs/standards/editor-visual-system.md. Pure source scan; no rendering.
 */
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const PALETTE = /\b(?:bg|text|border|ring|outline|fill|stroke|from|via|to|accent|caret|decoration|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g;

/** Raw colour literals in a component source: hex values and Tailwind palette classes. */
export function rawColorLiterals(source: string) {
  // Entity references (&#123;) and URL fragments are not colours.
  const code = source.replace(/&#x?[0-9a-fA-F]+;/g, "").replace(/href=["'][^"']*["']/g, "");
  return [...code.matchAll(HEX), ...code.matchAll(PALETTE)].map(match => match[0]);
}
