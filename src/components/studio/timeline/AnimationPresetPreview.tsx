import type { AnimationPreset } from '@/lib/timeline/animation-presets';

/** Schematic choice illustrations, not a second animation renderer. */
export function AnimationPresetPreview({ preset, side }: { preset: AnimationPreset; side: 'start' | 'end' }) {
  const exiting = side === 'end';
  const arrow = (x1: number, y1: number, x2: number, y2: number) => {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    return <path d={`M ${x1} ${y1} L ${x2} ${y2} M ${x2 - 5 * Math.cos(angle - .55)} ${y2 - 5 * Math.sin(angle - .55)} L ${x2} ${y2} L ${x2 - 5 * Math.cos(angle + .55)} ${y2 - 5 * Math.sin(angle + .55)}`} stroke="currentColor" strokeWidth="1.5" fill="none" />;
  };
  const horizontal = preset === 'slide_left' || preset === 'slide_right';
  const vertical = preset === 'slide_up' || preset === 'slide_down' || preset === 'drop_in';
  const forward = (preset === 'slide_right' || preset === 'slide_down' || preset === 'drop_in') !== exiting;
  const words = preset.startsWith('word_');
  return <svg viewBox="0 0 100 42" className="h-10 w-full text-[var(--ink-secondary)]" aria-hidden="true">
    <rect x="1" y="1" width="98" height="40" rx="4" fill="var(--chrome-deep)" />
    {horizontal || vertical ? <>
      <rect x="42" y="13" width="16" height="16" rx="2" fill="currentColor" opacity=".9" />
      {horizontal ? arrow(forward ? 10 : 90, 21, forward ? 35 : 65, 21) : arrow(70, forward ? 7 : 35, 70, forward ? 35 : 7)}
    </> : preset === 'none' ? <rect x="41" y="12" width="18" height="18" rx="2" stroke="currentColor" fill="none" />
    : preset === 'handwriting' ? <><path d="M24 29 Q34 0 40 15 Q44 34 32 28 L57 14 Q43 43 71 22" stroke="currentColor" strokeWidth="2" fill="none" /><path d="M73 19 l8 -8 3 3 -8 8 -4 1z" fill="currentColor" /></>
    : preset === 'write_on' || preset === 'scan_reveal_down' ? <><rect x="29" y="10" width="42" height="24" rx="2" fill="currentColor" opacity=".2" /><rect x="29" y="10" width={preset === 'write_on' ? 22 : 42} height={preset === 'write_on' ? 24 : 12} rx="2" fill="currentColor" /><path d={preset === 'write_on' ? 'M51 6V38' : 'M24 22H76'} stroke="var(--chrome-focus-ring)" strokeWidth="2" /></>
    : preset === 'type_on' ? <><text x="22" y="28" fontSize="18" fill="currentColor">{exiting ? 'Ty' : 'Typ'}</text><path d={exiting ? 'M46 11V33' : 'M57 11V33'} stroke="var(--chrome-focus-ring)" strokeWidth="2" /></>
    : preset === 'rotate_in' ? <><rect x="24" y="15" width="15" height="15" transform="rotate(-18 31 22)" fill="currentColor" opacity=".3" /><rect x="64" y="12" width="18" height="18" fill="currentColor" />{arrow(exiting ? 60 : 42, 22, exiting ? 42 : 60, 22)}</>
    : words ? [0,1,2].map(i => <text key={i} x={13+i*28} y={preset === 'word_rise' ? 30-i*4 : 27} fontSize={preset === 'word_pop' ? 10+i*4 : 18} opacity={exiting ? 1-i*.3 : .3+i*.35} fill="currentColor">Aa</text>)
    : [0,1,2].map(i => {
      const phase = exiting ? 2-i : i;
      const size = preset === 'pop' || preset === 'spring_pop' ? 8+phase*5 : 18;
      return <rect key={i} x={22+i*28-size/2} y={21-size/2} width={size} height={size} rx="2" fill="currentColor" opacity={.25+phase*.375} style={preset === 'focus_settle' ? {filter:`blur(${2-phase}px)`} : undefined} />;
    })}
  </svg>;
}
