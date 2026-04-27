import { useState, useEffect } from 'react';

interface Props {
  on: boolean;
}

export default function OneShotSpotlight({ on }: Props) {
  const [lit, setLit] = useState(false);
  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => setLit(true), 20);
    return () => clearTimeout(t);
  }, [on]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 40,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {/* Cone */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          width: 900,
          height: '100%',
          transform: lit ? 'translate(-50%, 0)' : 'translate(-50%, -40%)',
          opacity: lit ? 1 : 0,
          transition: 'transform 700ms cubic-bezier(.22,1,.36,1), opacity 480ms ease-out',
          background:
            'linear-gradient(180deg, rgba(255,245,200,0.38) 0%, rgba(245,215,110,0.18) 40%, rgba(245,215,110,0.04) 75%, rgba(0,0,0,0) 100%)',
          clipPath: 'polygon(42% 0, 58% 0, 90% 100%, 10% 100%)',
          WebkitClipPath: 'polygon(42% 0, 58% 0, 90% 100%, 10% 100%)',
          mixBlendMode: 'screen',
          filter: 'blur(12px)',
        }}
      />
      {/* Floor glow */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 40,
          width: 900,
          height: 40,
          transform: 'translateX(-50%)',
          background:
            'radial-gradient(ellipse, rgba(245,215,110,0.6) 0%, rgba(245,215,110,0) 70%)',
          opacity: lit ? 0.75 : 0,
          transition: 'opacity 700ms ease-out 300ms',
          mixBlendMode: 'screen',
          filter: 'blur(6px)',
        }}
      />
    </div>
  );
}
