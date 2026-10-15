export type BalanceRect = { left: number; top: number; right: number; bottom: number };

export function unionRects(rects: BalanceRect[]): BalanceRect {
  if (rects.length === 0) throw new Error("Cannot measure an empty layout group.");
  return {
    left: Math.min(...rects.map((rect) => rect.left)),
    top: Math.min(...rects.map((rect) => rect.top)),
    right: Math.max(...rects.map((rect) => rect.right)),
    bottom: Math.max(...rects.map((rect) => rect.bottom)),
  };
}

export function measureHorizontalGroupBalance(group: BalanceRect, canvasWidth: number) {
  const centerX = (group.left + group.right) / 2;
  const leftMargin = group.left;
  const rightMargin = canvasWidth - group.right;
  return {
    centerX,
    centerDeltaPx: centerX - canvasWidth / 2,
    leftMargin,
    rightMargin,
    marginDeltaPx: leftMargin - rightMargin,
  };
}
