import type { CgCategory } from '../types';

interface StepWinnerBarProps {
  category: CgCategory | null;
  eventName: string;
}

export default function StepWinnerBar({ category, eventName }: StepWinnerBarProps) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #070714 0%, #15102a 100%)' }}
    >
      {/* Ambient glow */}
      <div
        className="absolute"
        style={{
          width: 800,
          height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(251,191,36,0.15) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />

      <div className="relative z-10 text-center" style={{ width: 1600 }}>
        {/* Category name */}
        {category && (
          <p
            className="cg-fade-in text-amber-400/80 uppercase tracking-[0.4em] mb-8"
            style={{ fontSize: 28, fontFamily: "'Bebas Neue', sans-serif" }}
          >
            {category.name}
          </p>
        )}

        {/* Winner bar */}
        <div
          className="cg-winner-bar mx-auto flex items-center justify-center"
          style={{
            height: 180,
            background: 'linear-gradient(90deg, rgba(251,191,36,0.12) 0%, rgba(251,191,36,0.22) 50%, rgba(251,191,36,0.12) 100%)',
            border: '2px solid rgba(251,191,36,0.5)',
            borderRadius: 8,
          }}
        >
          <span
            style={{
              fontFamily: "'Noto Serif JP', serif",
              fontSize: 96,
              fontWeight: 700,
              color: '#fbbf24',
              textShadow: '0 0 60px rgba(251,191,36,0.6)',
              letterSpacing: '0.05em',
            }}
          >
            大賞
          </span>
        </div>

        {/* Event name */}
        <p
          className="cg-fade-in mt-8 text-white/30"
          style={{ fontSize: 24, fontFamily: "'Noto Serif JP', serif" }}
        >
          {eventName}
        </p>
      </div>
    </div>
  );
}
