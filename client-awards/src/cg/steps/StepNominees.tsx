import type { CgCategory } from '../types';
import PhotoStage from '../components/PhotoStage';

interface StepNomineesProps {
  category: CgCategory | null;
  eventName: string;
}

export default function StepNominees({ category, eventName }: StepNomineesProps) {
  if (!category) return null;

  const entries = [...category.entries].sort((a, b) =>
    (a.rank ?? 999) - (b.rank ?? 999)
  );

  return (
    <div
      className="absolute inset-0"
      style={{ background: 'linear-gradient(160deg, #070714 0%, #0e1230 100%)' }}
    >
      {/* Header */}
      <div className="absolute top-0 inset-x-0 px-100 py-60">
        <p
          className="cg-fade-in text-amber-400 uppercase tracking-widest mb-3"
          style={{ fontSize: 24, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.4em' }}
        >
          ノミネート
        </p>
        <h2
          className="cg-fade-in text-white"
          style={{ fontSize: 56, fontFamily: "'Noto Serif JP', serif", fontWeight: 700 }}
        >
          {category.name}
        </h2>
        <div className="mt-4 h-0.5 w-120 bg-gradient-to-r from-amber-400/80 to-transparent" />
      </div>

      {/* Nominee grid */}
      <div
        className="absolute inset-x-0"
        style={{ top: 280, padding: '0 96px' }}
      >
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: `repeat(${Math.min(entries.length, 4)}, 1fr)`,
          }}
        >
          {entries.map((entry, i) => (
            <div
              key={entry.id}
              className="cg-nominee-item flex flex-col items-center gap-3"
              style={{ animationDelay: `${i * 0.12}s` }}
            >
              <div
                className="overflow-hidden rounded-full ring-2 ring-white/20"
                style={{ width: 140, height: 140 }}
              >
                <PhotoStage
                  src={entry.photo_url}
                  alt={entry.name}
                  className="w-full h-full"
                />
              </div>
              <div className="text-center">
                <p className="text-white font-bold" style={{ fontSize: 28 }}>{entry.name}</p>
                {entry.org && (
                  <p className="text-white/60" style={{ fontSize: 18 }}>{entry.org}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom event name */}
      <div className="absolute bottom-40 inset-x-0 text-center">
        <p className="text-white/30" style={{ fontSize: 20, fontFamily: "'Noto Serif JP', serif" }}>
          {eventName}
        </p>
      </div>
    </div>
  );
}
