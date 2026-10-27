/** UI units only; the renderer's existing normalized coordinates remain unchanged. */
export const mediaOffsetToPercent = (value: number) => (value + 1) * 50;
export const percentToMediaOffset = (value: number) => value / 50 - 1;
export const fractionToPercent = (value: number) => value * 100;
export const percentToFraction = (value: number) => value / 100;
