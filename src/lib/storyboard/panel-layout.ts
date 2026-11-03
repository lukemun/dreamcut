/**
 * Storyboard panel layout: rows of panels. Each panel in a row has a width fraction (a row's fractions
 * sum to 1) and its own height (the row's height until the panel is resized). Every edge between
 * panels and every panel's bottom is resizable;
 * a panel is shown exactly when it sits in a row. Pure: callers persist the result as a view preference.
 */
export type PanelRow = { height: number; panels: { id: string; width: number; height?: number }[] };
export type PanelLayout = { rows: PanelRow[] };
export type DropSide = "left" | "right" | "top" | "bottom";

export const MIN_ROW_HEIGHT = 200, MAX_ROW_HEIGHT = 1600;
const clampHeight = (height: number) => Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, Math.round(height)));
const even = (ids: string[]) => ids.map(id => ({ id, width: 1 / ids.length }));
const normalizeRow = (row: PanelRow): PanelRow => {
  const total = row.panels.reduce((sum, panel) => sum + (panel.width > 0 ? panel.width : 0), 0);
  const height = (panel: { height?: number }) => Number.isFinite(panel.height) ? { height: clampHeight(panel.height!) } : {};
  return { height: clampHeight(row.height), panels: total > 0 ? row.panels.map(panel => ({ id: panel.id, width: (panel.width > 0 ? panel.width : 0) / total, ...height(panel) })) : even(row.panels.map(p => p.id)).map((p, i) => ({ ...p, ...height(row.panels[i]) })) };
};

/** Drop unknown and repeated panels, empty rows and invalid sizes from a saved layout. */
export function normalizeLayout(value: unknown, known: readonly string[]): PanelLayout | null {
  const rows = (value as PanelLayout | null)?.rows;
  if (!Array.isArray(rows)) return null;
  const seen = new Set<string>();
  const next = rows.flatMap(row => {
    if (!row || !Array.isArray(row.panels) || !Number.isFinite(row.height)) return [];
    const panels = row.panels.filter(panel => typeof panel?.id === "string" && known.includes(panel.id) && !seen.has(panel.id) && Number.isFinite(panel.width) && seen.add(panel.id));
    return panels.length ? [normalizeRow({ height: row.height, panels })] : [];
  });
  return { rows: next };
}

export const layoutIds = (layout: PanelLayout) => layout.rows.flatMap(row => row.panels.map(panel => panel.id));
export const isShown = (layout: PanelLayout, id: string) => layout.rows.some(row => row.panels.some(panel => panel.id === id));
const locate = (layout: PanelLayout, id: string) => {
  const row = layout.rows.findIndex(r => r.panels.some(p => p.id === id));
  return row < 0 ? null : { row, column: layout.rows[row].panels.findIndex(p => p.id === id) };
};

export function hidePanel(layout: PanelLayout, id: string): PanelLayout {
  if (!isShown(layout, id)) return layout;
  return { rows: layout.rows.map(row => ({ ...row, panels: row.panels.filter(p => p.id !== id) })).filter(row => row.panels.length).map(normalizeRow) };
}

/** A shown panel gets its own row at the bottom. */
export function showPanel(layout: PanelLayout, id: string, height: number): PanelLayout {
  return isShown(layout, id) ? layout : { rows: [...layout.rows, normalizeRow({ height, panels: [{ id, width: 1 }] })] };
}

/** Drop `id` beside `target` (left/right: same row, sharing the target's width) or in a new row above/below it. */
export function dropPanel(layout: PanelLayout, id: string, target: string, side: DropSide): PanelLayout {
  if (id === target || !isShown(layout, id) || !isShown(layout, target)) return layout;
  const from = locate(layout, id)!, moved = layout.rows[from.row].panels[from.column], height = moved.height ?? layout.rows[from.row].height;
  const rest = hidePanel(layout, id), at = locate(rest, target)!;
  const rows = rest.rows.map(row => ({ ...row, panels: [...row.panels] }));
  if (side === "top" || side === "bottom") rows.splice(at.row + (side === "bottom" ? 1 : 0), 0, { height, panels: [{ id, width: 1, ...(moved.height ? { height: moved.height } : {}) }] });
  else {
    const panels = rows[at.row].panels, half = panels[at.column].width / 2;
    panels[at.column] = { ...panels[at.column], width: half };
    panels.splice(at.column + (side === "right" ? 1 : 0), 0, { id, width: half, ...(moved.height ? { height: moved.height } : {}) });
  }
  return { rows: rows.map(normalizeRow) };
}

/** Keyboard move: Left/Right swap within the row; Up/Down lift a panel into its own row, or swap whole rows. */
export function nudgePanel(layout: PanelLayout, id: string, direction: "left" | "right" | "up" | "down"): PanelLayout {
  const at = locate(layout, id);
  if (!at) return layout;
  const rows = layout.rows.map(row => ({ ...row, panels: [...row.panels] }));
  if (direction === "left" || direction === "right") {
    const to = at.column + (direction === "left" ? -1 : 1), panels = rows[at.row].panels;
    if (to < 0 || to >= panels.length) return layout;
    [panels[at.column], panels[to]] = [panels[to], panels[at.column]];
    return { rows };
  }
  const up = direction === "up";
  if (rows[at.row].panels.length > 1) {
    const [panel] = rows[at.row].panels.splice(at.column, 1);
    rows.splice(at.row + (up ? 0 : 1), 0, { height: rows[at.row].height, panels: [{ ...panel, width: 1 }] });
    return { rows: rows.map(normalizeRow) };
  }
  const to = at.row + (up ? -1 : 1);
  if (to < 0 || to >= rows.length) return layout;
  [rows[at.row], rows[to]] = [rows[to], rows[at.row]];
  return { rows };
}

/** Move the edge after column `edge` in `row`: the two neighbours trade width; others keep theirs. */
export function resizeColumns(layout: PanelLayout, row: number, edge: number, leftWidth: number, minWidth: number): PanelLayout {
  const panels = layout.rows[row]?.panels;
  if (!panels?.[edge + 1]) return layout;
  const pair = panels[edge].width + panels[edge + 1].width, floor = Math.min(minWidth, pair / 2);
  const left = Math.min(pair - floor, Math.max(floor, leftWidth));
  return { rows: layout.rows.map((r, i) => i !== row ? r : { ...r, panels: r.panels.map((p, j) => j === edge ? { ...p, width: left } : j === edge + 1 ? { ...p, width: pair - left } : p) }) };
}

export function resizeRow(layout: PanelLayout, row: number, height: number): PanelLayout {
  return { rows: layout.rows.map((r, i) => i === row ? { ...r, height: clampHeight(height) } : r) };
}

/** One panel's own height (its bottom edge); `null` returns it to its row's height. */
export function resizePanel(layout: PanelLayout, id: string, height: number | null): PanelLayout {
  return { rows: layout.rows.map(row => !row.panels.some(p => p.id === id) ? row : { ...row, panels: row.panels.map(p => {
    if (p.id !== id) return p;
    const { height: _old, ...rest } = p;
    return height === null ? rest : { ...rest, height: clampHeight(height) };
  }) }) };
}
export const panelHeight = (row: PanelRow, panel: PanelRow["panels"][number]) => panel.height ?? row.height;
