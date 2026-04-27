import type { CgEntry, CgCategory } from '../types';
import PhotoStage from '../components/PhotoStage';

interface Props {
  winner: CgEntry | null;
  category: CgCategory | null;
  eventName?: string;
}

export default function Slit({ winner, category }: Props) {
  return (
    <div
      className="absolute inset-0"
      style={{ background: '#030308' }}
    >
      {/* Slit-scan reveal */}
      <div className="cg-slit-reveal absolute inset-0">
        <PhotoStage
          src={winner?.photo_url ?? null}
          alt={winner?.name ?? ''}
          className="absolute inset-0 w-full h-full"
        />
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.6) 100%)',
          }}
        />
      </div>

      {/* Center bar overlay */}
      <div
        className="cg-classic-text absolute inset-x-0"
        style={{
          top: '50%',
          transform: 'translateY(-50%)',
          padding: '32px 80px',
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(2px)',
          borderTop: '2px solid rgba(251,191,36,0.5)',
          borderBottom: '2px solid rgba(251,191,36,0.5)',
        }}
      >
        <div className="flex items-center gap-12">
          <div style={{ flex: 1 }}>
            <p
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 26,
                color: '#fbbf24',
                letterSpacing: '0.4em',
                marginBottom: 4,
              }}
            >
              {category?.name ?? '大賞'}
            </p>
            <p
              style={{
                fontFamily: "'Noto Sans JP', sans-serif",
                fontSize: 72,
                fontWeight: 800,
                color: '#ffffff',
                lineHeight: 1.15,
              }}
            >
              {winner?.name ?? ''}
            </p>
            {winner?.org && (
              <p
                style={{
                  fontFamily: "'Noto Sans JP', sans-serif",
                  fontSize: 30,
                  color: 'rgba(255,255,255,0.6)',
                  marginTop: 8,
                }}
              >
                {winner.org}
              </p>
            )}
          </div>

          {/* 大賞 badge */}
          <div
            style={{
              flexShrink: 0,
              textAlign: 'center',
              padding: '20px 40px',
              border: '2px solid rgba(251,191,36,0.6)',
              borderRadius: 4,
            }}
          >
            <p
              style={{
                fontFamily: "'Noto Serif JP', serif",
                fontSize: 56,
                fontWeight: 700,
                color: '#fbbf24',
                lineHeight: 1,
              }}
            >
              大賞
            </p>
            {winner?.points != null && (
              <p
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 32,
                  color: 'rgba(251,191,36,0.7)',
                  marginTop: 8,
                }}
              >
                {winner.points.toLocaleString()} pt
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
