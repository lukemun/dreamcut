/** Owned illustration shared by all inspector samples. Coordinates: 144 × 88. */
export const sampleSubject = 'M75 15a7 7 0 1 1 0 14a7 7 0 1 1 0-14M69 30Q75 27 82 31L88 44L100 49L97 54L83 49L79 42L79 56L88 76L81 79L71 60L65 76L57 76L66 53L66 41L57 50L45 48L46 42L56 43Z';
export function EffectSampleScene({ variant = 'a', subject = '#67a1b8' }: { variant?: 'a' | 'b'; subject?: string }) {
  return <g>
    <path fill={variant === 'a' ? '#172736' : '#523b49'} d="M0 0H144V88H0Z" />
    <path fill={variant === 'a' ? '#38576a' : '#ab7461'} d="M0 62L32 26L60 58L107 15L144 57V88H0Z" />
    <circle cx={variant === 'a' ? 24 : 120} cy="17" r="8" fill={variant === 'a' ? '#b4d4de' : '#f5c484'} />
    <path fill={variant === 'a' ? '#101d2b' : '#362e3d'} d="M0 65Q50 51 144 68V88H0Z" />
    <ellipse cx="75" cy="79" rx="28" ry="4" fill="#070f18" opacity=".7" />
    <path d={sampleSubject} fill={subject} />
  </g>;
}
