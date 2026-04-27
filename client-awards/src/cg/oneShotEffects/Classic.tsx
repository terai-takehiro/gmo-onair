import type { CgEntry, CgCategory } from '../types';
import PhotoStage from '../components/PhotoStage';

interface Props {
  winner: CgEntry | null;
  category: CgCategory | null;
  eventName: string;
}

export default function Classic({ winner, category, eventName }: Props) {
  return (
    <div
      className="absolute inset-0 flex"
      style={{ background: 'linear-gradient(135deg, #070714 0%, #0d1128 100%)' }}
    >
      {/* Photo half */}
      <div
        className="cg-classic-photo relative"
        style={{ width: 740, flexShrink: 0, overflow: 'hidden' }}
      >
        <PhotoStage
          src={winner?.photo_url ?? null}
          alt={winner?.name ?? ''}
          className="w-full h-full"
        />
        {/* Gradient overlay */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to right, transparent 60%, #070714 100%)',
          }}
        />
      </div>

      {/* Text half */}
      <div
        className="cg-classic-text flex flex-col justify-center"
        style={{ flex: 1, padding: '0 80px 0 60px' }}
      >
        {/* Award label */}
        <p
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 32,
            color: 'rgba(251,191,36,0.7)',
            letterSpacing: '0.35em',
            textTransform: 'uppercase',
            marginBottom: 16,
          }}
        >
          {category?.name ?? '大賞'}
        </p>

        {/* 大賞 */}
        <p
          style={{
            fontFamily: "'Noto Serif JP', serif",
            fontSize: 80,
            fontWeight: 700,
            color: '#fbbf24',
            textShadow: '0 0 40px rgba(251,191,36,0.5)',
            lineHeight: 1.1,
            marginBottom: 24,
          }}
        >
          大賞
        </p>

        {/* Divider */}
        <div
          style={{
            width: 200,
            height: 2,
            background: 'linear-gradient(to right, rgba(251,191,36,0.8), transparent)',
            marginBottom: 32,
          }}
        />

        {/* Winner name */}
        <p
          style={{
            fontFamily: "'Noto Sans JP', sans-serif",
            fontSize: 64,
            fontWeight: 800,
            color: '#ffffff',
            lineHeight: 1.2,
          }}
        >
          {winner?.name ?? ''}
        </p>

        {/* Org */}
        {winner?.org && (
          <p
            style={{
              fontFamily: "'Noto Sans JP', sans-serif",
              fontSize: 32,
              color: 'rgba(255,255,255,0.55)',
              marginTop: 12,
            }}
          >
            {winner.org}
          </p>
        )}

        {/* Points */}
        {winner?.points != null && (
          <div style={{ marginTop: 32 }}>
            <span
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 48,
                color: '#fbbf24',
                letterSpacing: '0.05em',
              }}
            >
              {winner.points.toLocaleString()}
            </span>
            <span
              style={{
                fontFamily: "'Noto Sans JP', sans-serif",
                fontSize: 22,
                color: 'rgba(255,255,255,0.4)',
                marginLeft: 8,
              }}
            >
              pt
            </span>
          </div>
        )}

        {/* Event name */}
        <p
          style={{
            marginTop: 'auto',
            fontFamily: "'Noto Serif JP', serif",
            fontSize: 22,
            color: 'rgba(255,255,255,0.25)',
          }}
        >
          {eventName}
        </p>
      </div>
    </div>
  );
}
