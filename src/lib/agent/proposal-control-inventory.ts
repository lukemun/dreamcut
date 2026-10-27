import { EFFECT_CONTROLS } from '../timeline/effect-controls';
import type { TimelineFile } from '../local-store/store';
import type { EditorAgentOption } from './timeline-editor-agent-apply';
import { reviewOption } from './proposal-review';
import { DERIVED_FIELD_IDENTITY, PROPOSAL_COLOR_CONTROL_FIELDS, PROPOSAL_LIST_CONTROL_FIELDS, derivedFieldValue, proposalControlTier, proposalTunableField } from './proposal-controls';

/** Read-only control planning: selection never adds a mutation or exposes private source values. */
export function proposalControlInventory(timeline: TimelineFile, option: EditorAgentOption) {
  return reviewOption(timeline, option).adjustment_rows.map(row => {
    const operation = row.element_id.startsWith("timing:") ? undefined : option.operations[row.changes[0]?.operation_index];
    const existing = timeline.elements.find(element => element.id === row.element_id);
    const created = !!(operation?.create_text || operation?.create_visual || operation?.create_audio);
    return {
      element_id: row.element_id, element_label: row.element_label, element_type: row.element_type,
      new_element: created,
      controls: row.changes.map(change => {
        const authoredBefore = change.target === 'patch' ? existing?.[change.field as keyof typeof existing] : existing?.props?.[change.field] ?? derivedFieldValue(existing?.props as Record<string, unknown> | undefined, change.field);
        const before = authoredBefore ?? (change.target === 'props' ? EFFECT_CONTROLS.find(control => control.prop === change.field)?.identity ?? DERIVED_FIELD_IDENTITY[change.field] : undefined);
        const spec = proposalTunableField(change.target, change.field, change.control_range, change.control_unit, change.control_display);
        return {
          operation_index: change.operation_index, target: change.target, field: change.field,
          label: change.target === 'timing_control' || change.target === 'block' ? change.label : spec?.label ?? change.label,
          configured: !change.implicit_default,
          changed: created || JSON.stringify(before) !== JSON.stringify(change.after_value),
          before_explicit: authoredBefore !== undefined,
          before_value: before ?? null, after_value: change.after_value,
          selected: proposalControlTier(change, option.review_controls) === 'main',
          tier: proposalControlTier(change, option.review_controls),
          ...(spec ? { kind: 'number', display: { min: spec.min, max: spec.max, step: spec.step, suffix: spec.suffix }, display_value: spec.toDisplay ? spec.toDisplay(change.after_value as number) : change.after_value } : {kind: PROPOSAL_LIST_CONTROL_FIELDS.includes(change.field) ? 'graph' : PROPOSAL_COLOR_CONTROL_FIELDS.includes(change.field) ? 'color' : 'select'}),
          selection_hint: created && ['absX','absY','media_offset_x','media_offset_y','media_scale','fontSizePx'].includes(change.field)
            ? 'New placement: normally expose size and both position axes together.'
            : 'Expose when this parameter helps the user judge or adjust the requested change.',
        };
      }),
    };
  });
}
