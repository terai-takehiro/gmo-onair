import { useMemo } from 'react';

interface Entry {
  name: string;
  company?: string;
  photo?: string;
}

interface Props {
  entry: Entry;
  seed?: number;
}

const HUE_BASES = [220, 200, 240, 210, 230, 215];

export default function PortraitPlaceholder({ entry, seed = 0 }: Props) {
  const { bg, shape1, shape2, shape3 } = useMemo(() => {
    const h = HUE_BASES[seed % HUE_BASES.length];
    return {
      bg: `hsl(${h}, 25%, 12%)`,
      shape1: `hsla(${h + 15}, 50%, 35%, 0.65)`,
      shape2: `hsla(${h - 10}, 60%, 50%, 0.45)`,
      shape3: `hsla(${h + 5}, 40%, 22%, 0.55)`,
    };
  }, [seed]);

  const initial = [...(entry.name || '?')][0] ?? '?';

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: bg,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: '150%',
          height: '150%',
          top: '-25%',
          left: '-25%',
          background: [
            `radial-gradient(ellipse at 30% 70%, ${shape1} 0%, transparent 60%)`,
            `radial-gradient(ellipse at 70% 25%, ${shape2} 0%, transparent 55%)`,
            `radial-gradient(ellipse at 55% 55%, ${shape3} 0%, transparent 65%)`,
          ].join(', '),
        }}
      />
      <div
        style={{
          position: 'relative',
          fontFamily: "'Noto Serif JP', serif",
          fontWeight: 700,
          fontSize: '28%',
          color: 'rgba(245,215,110,0.8)',
          textShadow: '0 2px 16px rgba(0,0,0,0.6)',
          userSelect: 'none',
        }}
      >
        {initial}
      </div>
    </div>
  );
}
