'use client';
import { InspectorVisualChoice } from './InspectorVisualChoice';
import { InspectorPropertyControl } from './InspectorPropertyControl';
const blends = [
  { value: 'normal', label: 'Normal' },
  { value: 'difference', label: 'Difference' },
  { value: 'exclusion', label: 'Exclusion' },
] as const;
export function LayerBlendControl({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <InspectorPropertyControl label="Layer blend" fields="media_blend_mode" disabled={false} onReset={() => onChange('normal')}>
    <div className="min-w-0 flex-1 space-y-2">
    <InspectorVisualChoice label="Layer blend" value={value} onChange={onChange} options={blends.map(blend => ({ ...blend,
      preview: <span className="relative block h-12 overflow-hidden rounded" style={{ isolation: 'isolate', background: 'linear-gradient(100deg,#377ba4,#d98b5e)' }}>
        <span className="absolute inset-y-1 left-1/3 w-1/2 rounded-full" style={{ background: '#ddd', mixBlendMode: blend.value }} />
      </span>,
    }))} />
    </div>
  </InspectorPropertyControl>;
}
