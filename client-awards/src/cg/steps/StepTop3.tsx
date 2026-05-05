import { useState, useEffect } from 'react';
import type { CgMappedEntry } from '../types';
import CountUp from '../components/CountUp';
import { fitText, fitStyle } from '../fitText';
import { TOP3_POS, TOP3_STAGE_BOTTOM } from '../layout';

interface Props {
  entries: CgMappedEntry[];
  lang?: 'ja' | 'en';
}

const REVEAL_DELAY: Record<number, number> = { 3: 200, 2: 700, 1: 1300 };

export default function StepTop3({ entries, lang = 'ja' }: Props) {
  const top3 = [...entries]
    .sort((a, b) => a.rank - b.rank)
    .filter((e) => e.rank >= 1 && e.rank <= 3);

  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  useEffect(() => {
    setRevealed({});
    const timers: ReturnType<typeof setTimeout>[] = [];
    ([3, 2, 1] as const).forEach((r) => {
      timers.push(
        setTimeout(() => setRevealed((p) => ({ ...p, [r]: true })), REVEAL_DELAY[r]),
      );
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {top3.map((e) => (
        <Top3Card
          key={e.id}
          entry={e}
          revealed={revealed[e.rank] === true}
          lang={lang}
        />
      ))}

      {/* 投票案内テロップ */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: TOP3_STAGE_BOTTOM + 36,
          textAlign: 'center',
          fontFamily: "'Noto Sans JP', sans-serif",
          fontWeight: 700,
          fontSize: 26,
          letterSpacing: '0.42em',
          paddingLeft: '0.42em',
          color: '#F5D76E',
          textShadow: '0 2px 6px rgba(0,0,0,0.85)',
          opacity: revealed[1] ? 1 : 0,
          transition: 'opacity 700ms ease 400ms',
          pointerEvents: 'none',
        }}
      >
        {lang === 'en' ? 'LIVE VOTING — CHOOSE YOUR WINNER' : '会場投票で大賞を決定'}
      </div>
    </div>
  );
}

interface CardProps {
  entry: CgMappedEntry;
  revealed: boolean;
  lang?: 'ja' | 'en';
}

function Top3Card({ entry, revealed, lang = 'ja' }: CardProps) {
  const pos = TOP3_POS[entry.rank as 1 | 2 | 3];
  if (!pos) return null;
  const displayName = lang === 'en' ? (entry.nameEn || entry.name) : entry.name;
  const displayCompany = lang === 'en' ? (entry.orgEn || entry.company) : entry.company;
  const isFirst = pos.emphasize;

  const nameFit = fitText(
    displayName,
    pos.w - 24,
    `900 ${pos.nameSize}px 'Noto Sans JP', sans-serif`,
  );
  const compFit = fitText(
    displayCompany,
    pos.w - 24,
    `700 ${Math.round(pos.nameSize * 0.5)}px 'Noto Sans JP', sans-serif`,
  );

  return (
    <div
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        width: pos.w,
        height: pos.h + 200,
        opacity: revealed ? 1 : 0,
        transform: revealed ? 'translateY(0) scale(1)' : 'translateY(40px) scale(0.94)',
        transition:
          'opacity 700ms ease, transform 880ms cubic-bezier(.2,1,.3,1)',
        willChange: 'transform, opacity',
      }}
    >
      {/* Rank number badge */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: -64,
          textAlign: 'center',
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: isFirst ? 96 : 72,
          lineHeight: 1,
          background: isFirst
            ? 'linear-gradient(180deg, #FFFBE6 0%, #FFEFB0 18%, #F5D76E 45%, #C9A24B 75%, #8C6314 100%)'
            : 'linear-gradient(180deg, #e8dcb6 0%, #bfa15a 55%, #6e5321 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          letterSpacing: '0.04em',
          textShadow: isFirst ? '0 0 40px rgba(245,215,110,0.5)' : 'none',
        }}
      >
        {entry.rank}
      </div>

      {/* Photo frame (実フォトは PhotoStage が描く) */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: pos.w,
          height: pos.h,
          border: isFirst
            ? '3px solid #F5D76E'
            : '1px solid rgba(201,162,75,0.55)',
          background: 'rgba(0,0,0,0.35)',
          boxShadow: isFirst
            ? '0 0 80px rgba(245,215,110,0.35)'
            : '0 6px 18px rgba(0,0,0,0.5)',
        }}
      />

      {/* Name + company + points */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: pos.h + 14,
          textAlign: 'center',
          pointerEvents: 'none',
        }}
      >
        {displayCompany && (
          <div
            style={{
              fontFamily: "'Noto Sans JP', sans-serif",
              fontWeight: 700,
              fontSize: Math.round(pos.nameSize * 0.5),
              letterSpacing: '0.18em',
              paddingLeft: '0.18em',
              color: isFirst ? '#fff8d8' : '#fffdf2',
              marginBottom: 6,
              lineHeight: 1.2,
              textShadow: '0 1px 4px rgba(0,0,0,0.85)',
              ...fitStyle(compFit),
            }}
          >
            {displayCompany}
          </div>
        )}
        <div
          style={{
            fontFamily: "'Noto Sans JP', sans-serif",
            fontWeight: 900,
            fontSize: pos.nameSize,
            letterSpacing: '0.06em',
            paddingLeft: '0.06em',
            lineHeight: 1.1,
            color: '#fff',
            textShadow: '0 2px 6px rgba(0,0,0,0.9)',
            ...fitStyle(nameFit),
          }}
        >
          {displayName}
        </div>

        {/* Points */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'center',
            gap: 8,
            marginTop: 12,
          }}
        >
          <span
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: pos.ptSize,
              lineHeight: 1,
              color: '#fff',
              letterSpacing: '0.02em',
              textShadow: '0 2px 6px rgba(0,0,0,0.9)',
            }}
          >
            <CountUp value={revealed ? entry.points : 0} duration={900} />
          </span>
          <span
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: Math.round(pos.ptSize * 0.34),
              color: '#F5D76E',
              letterSpacing: '0.2em',
            }}
          >
            PT
          </span>
        </div>
      </div>
    </div>
  );
}
