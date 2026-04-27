import type { CgEntry, CgCategory } from '../types';
import PhotoStage from '../components/PhotoStage';

interface Props {
  winner: CgEntry | null;
  category: CgCategory | null;
  eventName?: string;
}

// Shard panels that reveal the photo in sequence
const SHARDS = [
  { clipPath: 'polygon(0 0, 45% 0, 50% 100%, 0 100%)',  delay: 0 },
  { clipPath: 'polygon(43% 0, 75% 0, 72% 100%, 47% 100%)', delay: 0.08 },
  { clipPath: 'polygon(73% 0, 100% 0, 100% 100%, 70% 100%)', delay: 0.16 },
];

export default function Shards({ winner, category }: Props) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ background: '#070714' }}
    >
      {/* Photo with shard panels */}
      <div
        className="absolute inset-0"
        style={{ overflow: 'hidden' }}
      >
        {SHARDS.map((shard, i) => (
          <div
            key={i}
            className="cg-shards-reveal absolute inset-0"
            style={{
              clipPath: shard.clipPath,
              animationDelay: `${shard.delay}s`,
            }}
          >
            <PhotoStage
              src={winner?.photo_url ?? null}
              alt={winner?.name ?? ''}
              className="absolute inset-0 w-full h-full"
            />
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.6) 100%)',
              }}
            />
          </div>
        ))}

        {/* Dark seams between shards */}
        {[46, 73].map((x) => (
          <div
            key={x}
            className="absolute inset-y-0"
            style={{ left: `${x}%`, width: 3, background: '#070714' }}
          />
        ))}
      </div>

      {/* Text overlay */}
      <div
        className="cg-classic-text relative z-10 text-center"
        style={{ marginTop: 'auto', paddingBottom: 120, width: '100%' }}
      >
        <p
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 28,
            color: 'rgba(251,191,36,0.7)',
            letterSpacing: '0.4em',
            marginBottom: 12,
          }}
        >
          {category?.name ?? '大賞'}
        </p>
        <p
          style={{
            fontFamily: "'Noto Serif JP', serif",
            fontSize: 72,
            fontWeight: 700,
            color: '#fbbf24',
            textShadow: '0 2px 40px rgba(0,0,0,0.8)',
          }}
        >
          {winner?.name ?? ''}
        </p>
        {winner?.org && (
          <p
            style={{
              fontFamily: "'Noto Sans JP', sans-serif",
              fontSize: 30,
              color: 'rgba(255,255,255,0.7)',
              marginTop: 8,
              textShadow: '0 2px 20px rgba(0,0,0,0.8)',
            }}
          >
            {winner.org}
          </p>
        )}
      </div>
    </div>
  );
}
