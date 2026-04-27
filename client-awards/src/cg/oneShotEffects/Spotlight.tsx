import type { CgEntry, CgCategory } from '../types';
import PhotoStage from '../components/PhotoStage';

interface Props {
  winner: CgEntry | null;
  category: CgCategory | null;
  eventName?: string;
}

export default function Spotlight({ winner, category }: Props) {
  return (
    <div
      className="absolute inset-0"
      style={{ background: '#000' }}
    >
      {/* Full-screen photo with spotlight reveal */}
      <div className="cg-spotlight-reveal absolute inset-0">
        <PhotoStage
          src={winner?.photo_url ?? null}
          alt={winner?.name ?? ''}
          className="absolute inset-0 w-full h-full"
        />
        {/* Vignette */}
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 60% 80% at 50% 40%, transparent 0%, rgba(0,0,0,0.7) 100%)',
          }}
        />
        {/* Bottom gradient */}
        <div
          className="absolute inset-x-0 bottom-0"
          style={{
            height: 400,
            background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 100%)',
          }}
        />
      </div>

      {/* Text overlay */}
      <div
        className="cg-classic-text absolute inset-x-0 bottom-0 text-center"
        style={{ padding: '0 160px 100px' }}
      >
        {/* Spotlight circle decoration */}
        <div
          className="mx-auto mb-6"
          style={{
            width: 2,
            height: 60,
            background: 'linear-gradient(to bottom, transparent, rgba(251,191,36,0.6))',
          }}
        />
        <p
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 28,
            color: '#fbbf24',
            letterSpacing: '0.4em',
            marginBottom: 8,
          }}
        >
          {category?.name ?? '大賞'}
        </p>
        <p
          style={{
            fontFamily: "'Noto Sans JP', sans-serif",
            fontSize: 76,
            fontWeight: 800,
            color: '#ffffff',
            textShadow: '0 4px 30px rgba(0,0,0,1)',
            lineHeight: 1.2,
          }}
        >
          {winner?.name ?? ''}
        </p>
        {winner?.org && (
          <p
            style={{
              fontFamily: "'Noto Sans JP', sans-serif",
              fontSize: 32,
              color: 'rgba(255,255,255,0.65)',
              marginTop: 10,
            }}
          >
            {winner.org}
          </p>
        )}
      </div>
    </div>
  );
}
