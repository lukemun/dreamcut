import { resolveNumberKeyframe } from './keyframes';

export function resolveStickerOutline(props: Record<string, unknown> | null | undefined, seconds: number) {
  if (props?.sticker_outline !== true) return 0;
  const value = resolveNumberKeyframe(props, 'sticker_outline_width', seconds, Number(props.sticker_outline_width ?? 8));
  return Number.isFinite(value) ? Math.max(0, Math.min(32, value)) : 0;
}
