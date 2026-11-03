import { isDeepStrictEqual } from 'node:util';
import type { TimelineFile } from '../local-store/store';

export type PreservedFields = { element_id: string; fields: string[] }[];

/** Protect accepted choices against the fully derived result, including linked
 * changes. Never print the private field values in diagnostics. */
export function assertPreservedFields(before: TimelineFile, after: TimelineFile, preserve: PreservedFields = []) {
  for (const rule of preserve) {
    const original = before.elements.find(el => el.id === rule.element_id && !el.removed_at);
    const result = after.elements.find(el => el.id === rule.element_id && !el.removed_at);
    if (!original || !result) throw new Error(`Protected element ${rule.element_id} must remain active`);
    for (const field of rule.fields) {
      const read = (row: typeof original) => field.startsWith('props.') ? row.props?.[field.slice(6)] : row[field as keyof typeof row];
      if (!isDeepStrictEqual(read(original), read(result))) throw new Error(`Proposal changes protected field ${rule.element_id}.${field}`);
    }
  }
}
