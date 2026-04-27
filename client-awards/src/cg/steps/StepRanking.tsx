import { useEffect, useState } from 'react';
import type { CgCategory } from '../types';
import { BAR_INTERVAL, PHOTO_OFFSET } from '../types';
import PhotoStage from '../components/PhotoStage';

interface StepRankingProps {
  category: CgCategory | null;
  eventName: string;
}

const RANK_COLORS: Record<number, { bar: string; accent: string; rank: string }> = {
  5: { bar: 'rgba(148,163,184,0.15)', accent: '#94a3b8', rank: '#94a3b8' },
  4: { bar: 'rgba(100,116,139,0.18)', accent: '#64748b', rank: '#94a3b8' },
  3: { bar: 'rgba(205,127,50,0.20)',  accent: '#cd7f32', rank: '#cd7f32' },
  2: { bar: 'rgba(192,192,192,0.22)', accent: '#c0c0c0', rank: '#c0c0c0' },
};

const RANK_LABEL: Record<number, string> = { 2: '2nd', 3: '3rd', 4: '4th', 5: '5th' };

export default function StepRanking({ category, eventName }: StepRankingProps) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [photoVisible, setPhotoVisible] = useState<Set<number>>(new Set());

  // Ranked entries 5→2 (exclude rank 1)
  const entries = category
    ? [...category.entries]
        .filter((e) => e.rank !== null && e.rank >= 2 && e.rank <= 5)
        .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0)) // 5,4,3,2 order
    : [];

  useEffect(() => {
    if (!entries.length) return;
    const timers: ReturnType<typeof setTimeout>[] = [];

    entries.forEach((_, i) => {
      const t1 = setTimeout(() => {
        setVisibleCount(i + 1);
      }, i * BAR_INTERVAL);

      const t2 = setTimeout(() => {
        setPhotoVisible((prev) => new Set([...prev, i]));
      }, i * BAR_INTERVAL + PHOTO_OFFSET);

      timers.push(t1, t2);
    });

    return () => timers.forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="absolute inset-0"
      style={{ background: 'linear-gradient(160deg, #070714 0%, #0d1428 100%)' }}
    >
      {/* Header */}
      <div style={{ position: 'absolute', top: 60, left: 96 }}>
        <p
          className="cg-fade-in text-amber-400/80 uppercase tracking-widest"
          style={{ fontSize: 22, fontFamily: "'Bebas Neue', sans-serif" }}
        >
          {category?.name ?? ''}
        </p>
        <h2
          className="cg-fade-in text-white mt-1"
          style={{ fontSize: 44, fontFamily: "'Noto Serif JP', serif", fontWeight: 700 }}
        >
          {eventName}
        </h2>
      </div>

      {/* Bars */}
      <div
        style={{
          position: 'absolute',
          top: 220,
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          padding: '0 96px',
        }}
      >
        {entries.map((entry, i) => {
          const rank = entry.rank ?? (5 - i);
          const colors = RANK_COLORS[rank] ?? RANK_COLORS[5];
          const shown = i < visibleCount;
          const photoShown = photoVisible.has(i);

          return (
            <div
              key={entry.id}
              className="cg-rank-bar"
              style={{
                display: 'flex',
                alignItems: 'center',
                height: 128,
                borderRadius: 8,
                background: shown ? colors.bar : 'transparent',
                border: shown ? `1px solid ${colors.accent}30` : 'none',
                overflow: 'hidden',
                animationDelay: `${i * BAR_INTERVAL}ms`,
                opacity: shown ? 1 : 0,
                transition: 'opacity 0.1s',
                backdropFilter: 'blur(4px)',
              }}
            >
              {shown && (
                <>
                  {/* Rank number */}
                  <div
                    style={{
                      width: 160,
                      textAlign: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'Bebas Neue', sans-serif",
                        fontSize: 72,
                        color: colors.rank,
                        lineHeight: 1,
                      }}
                    >
                      {RANK_LABEL[rank] ?? `${rank}th`}
                    </span>
                  </div>

                  {/* Photo */}
                  <div
                    className={photoShown ? 'cg-rank-photo' : ''}
                    style={{
                      width: 96,
                      height: 96,
                      borderRadius: '50%',
                      overflow: 'hidden',
                      flexShrink: 0,
                      outline: `2px solid ${colors.accent}60`,
                      opacity: photoShown ? 1 : 0,
                      transition: 'opacity 0.2s',
                      animationDelay: `${PHOTO_OFFSET}ms`,
                    }}
                  >
                    <PhotoStage src={entry.photo_url} alt={entry.name} className="w-full h-full" />
                  </div>

                  {/* Name / Org */}
                  <div style={{ marginLeft: 32, flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontFamily: "'Noto Sans JP', sans-serif",
                        fontSize: 44,
                        fontWeight: 700,
                        color: '#fff',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {entry.name}
                    </p>
                    {entry.org && (
                      <p
                        style={{
                          fontFamily: "'Noto Sans JP', sans-serif",
                          fontSize: 26,
                          color: 'rgba(255,255,255,0.55)',
                          marginTop: 4,
                        }}
                      >
                        {entry.org}
                      </p>
                    )}
                  </div>

                  {/* Points */}
                  {entry.points != null && (
                    <div
                      style={{
                        marginRight: 48,
                        textAlign: 'right',
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "'Bebas Neue', sans-serif",
                          fontSize: 52,
                          color: colors.accent,
                          letterSpacing: '0.05em',
                        }}
                      >
                        {entry.points.toLocaleString()}
                      </span>
                      <span
                        style={{
                          fontFamily: "'Noto Sans JP', sans-serif",
                          fontSize: 20,
                          color: 'rgba(255,255,255,0.4)',
                          marginLeft: 8,
                        }}
                      >
                        pt
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
