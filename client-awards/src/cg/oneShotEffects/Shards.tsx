import { useState, useEffect } from 'react';

interface Props {
  on: boolean;
}

const COUNT = 10;
const shards = Array.from({ length: COUNT }, (_, i) => {
  const angle = (i / COUNT) * Math.PI * 2 + (i % 2 === 0 ? 0.1 : -0.1);
  const dist = 820;
  return {
    startX: Math.cos(angle) * dist,
    startY: Math.sin(angle) * dist,
    length: 140 + (i % 3) * 40,
    thickness: 2 + (i % 2),
    rotateDeg: (angle * 180) / Math.PI + 90,
    delay: 20 + (i % 4) * 30,
  };
});

export default function OneShotShards({ on }: Props) {
  const [lit, setLit] = useState(false);
  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => setLit(true), 20);
    return () => clearTimeout(t);
  }, [on]);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40, pointerEvents: 'none' }}>
      {shards.map(({ startX, startY, length, thickness, rotateDeg, delay }, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: length,
            height: thickness,
            background:
              'linear-gradient(90deg, rgba(245,215,110,0) 0%, rgba(245,215,110,0.9) 40%, #fff7d0 70%, rgba(245,215,110,0) 100%)',
            transformOrigin: '50% 50%',
            transform: lit
              ? `translate(-50%, -50%) rotate(${rotateDeg}deg)`
              : `translate(calc(-50% + ${startX}px), calc(-50% + ${startY}px)) rotate(${rotateDeg}deg)`,
            opacity: lit ? 0 : 1,
            transition: `transform 560ms cubic-bezier(.6,0,.3,1) ${delay}ms, opacity 280ms ease-out 380ms`,
            filter: 'drop-shadow(0 0 12px rgba(245,215,110,0.9))',
            mixBlendMode: 'screen',
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 120,
          height: 120,
          transform: 'translate(-50%, -50%)',
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(255,247,208,0.95) 0%, rgba(245,215,110,0.6) 40%, rgba(245,215,110,0) 70%)',
          opacity: 0,
          animation: lit ? 'cgShardFlare 700ms ease-out 400ms both' : 'none',
          mixBlendMode: 'screen',
        }}
      />
      <style>{`
        @keyframes cgShardFlare {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.4); }
          40%  { opacity: 0.9; transform: translate(-50%, -50%) scale(1.4); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(2.2); }
        }
      `}</style>
    </div>
  );
}
