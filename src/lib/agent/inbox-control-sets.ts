/**
 * The proposal inbox carries every pending card's motion items, and each split piece repeats its
 * template's controls (about 7 KB per piece, most of it the same Look choice). The server sends each
 * distinct control once in `control_sets` and gives items `controls_ref`, the ids in order; the
 * client expands them back on receipt, so everything downstream still reads `item.controls`.
 */
type MotionItemLike = { controls?: unknown; controls_ref?: string[] };
type InboxLike = { details?: Record<string, unknown>; control_sets?: Record<string, unknown> };

function motionItems(body: InboxLike): MotionItemLike[] {
  const out: MotionItemLike[] = [];
  for (const detail of Object.values(body.details ?? {})) {
    const review = (detail as { review?: unknown })?.review;
    if (!Array.isArray(review)) continue;
    for (const option of review) {
      const items = (option as { motion_items?: unknown })?.motion_items;
      if (Array.isArray(items)) for (const item of items) if (item && typeof item === "object") out.push(item as MotionItemLike);
    }
  }
  return out;
}

/** Server: replace each item's controls with references into one shared table. Mutates `body`. */
export function packInboxControlSets<T extends InboxLike>(body: T): T {
  const ids = new Map<string, string>();
  const sets: Record<string, unknown> = {};
  for (const item of motionItems(body)) {
    if (!Array.isArray(item.controls)) continue;
    item.controls_ref = item.controls.map((control: unknown) => {
      const text = JSON.stringify(control);
      let id = ids.get(text);
      if (!id) {
        id = `c${ids.size}`;
        ids.set(text, id);
        sets[id] = control;
      }
      return id;
    });
    delete item.controls;
  }
  if (ids.size) body.control_sets = sets;
  return body;
}

/** Client: put each referenced control list back on its item. Mutates `body`. */
export function unpackInboxControlSets<T extends InboxLike>(body: T): T {
  const sets = body.control_sets;
  if (!sets) return body;
  for (const item of motionItems(body)) {
    if (Array.isArray(item.controls_ref)) item.controls = item.controls_ref.map((id) => sets[id]).filter((control) => control !== undefined);
    delete item.controls_ref;
  }
  delete body.control_sets;
  return body;
}
