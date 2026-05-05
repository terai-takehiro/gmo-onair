import { useState, useEffect } from 'react';
import type { CgMappedEntry } from '../types';
import CountUp from '../components/CountUp';
import PortraitPlaceholder from '../components/PortraitPlaceholder';
import { fitText, fitStyle } from '../fitText';
import { TOP3_POS, TOP3_LABEL_GAP } from '../layout';

interface Props {
  entries: CgMappedEntry[];
  lang?: 'ja' | 'en';
}

const REVEAL_DELAY: Record<number, number> = { 3: 200, 2: 700, 1: 1300 };

/** BEST3 ステージ。
 *
 *  写真本体もここで描画する（PhotoStage の写真は top3 中は fade out のみ
 *  でその場に残るので、グリッド → TOP3 への移動が画面上に見えない＝ネタ
 *  バレしない）。表示は 3→2→1 の順に stagger reveal される。
 */
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
    <div style={{ position: 'absolute', inset: 0, zIndex: 6 }}>
      {top3.map((e) => (
        <Top3Card
          key={e.id}
          entry={e}
          revealed={revealed[e.rank] === true}
          lang={lang}
        />
      ))}
    </div>
  );
}

interface CardProps {
  entry: CgMappedEntry;
  revealed: boolean;
  lang?: 'ja' | 'en';
}

/** NOMINEES と同じ "写真 4:3 portrait + 下ラベル + コーナーブラケット"
 *  構造で、サイズを大きくした版。1 位はブラケットを太く + 内側金線 +
 *  ソフトグローで区別する（サイズ階層なし）。 */
function Top3Card({ entry, revealed, lang = 'ja' }: CardProps) {
  const pos = TOP3_POS[entry.rank as 1 | 2 | 3];
  if (!pos) return null;
  const displayName    = lang === 'en' ? (entry.nameEn || entry.name)    : entry.name;
  const displayCompany = lang === 'en' ? (entry.orgEn  || entry.company) : entry.company;
  const isFirst = pos.emphasize;

  const nameFit = fitText(
    displayName,
    pos.w - 16,
    `900 ${pos.nameSize}px 'Noto Sans JP', sans-serif`,
  );
  const compFit = fitText(
    displayCompany,
    pos.w - 16,
    `600 ${pos.companySize}px 'Noto Sans JP', sans-serif`,
  );

  const bracketStroke = isFirst ? 3 : 2;
  const bracketSize   = isFirst ? 32 : 26;
  const bracketColor  = '#F5D76E';

  return (
    <div
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        width: pos.w,
        height: pos.h + TOP3_LABEL_GAP + pos.companySize * 1.4
              + 8 + pos.nameSize * 1.15 + 24 + pos.ptSize + 24,
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
          top: -90,
          textAlign: 'center',
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 76,
          lineHeight: 1,
          background: isFirst
            ? 'linear-gradient(180deg, #FFFBE6 0%, #FFEFB0 18%, #F5D76E 45%, #C9A24B 75%, #8C6314 100%)'
            : 'linear-gradient(180deg, #e8dcb6 0%, #bfa15a 55%, #6e5321 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          letterSpacing: '0.04em',
          textShadow: isFirst ? '0 0 40px rgba(245,215,110,0.55)' : 'none',
        }}
      >
        {entry.rank}
      </div>

      {/* Photo frame: actual image rendered here (not in PhotoStage) so
          it appears fresh at TOP3 position with no morph from grid. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: pos.w,
          height: pos.h,
          overflow: 'hidden',
          background: '#111',
          border: '1px solid rgba(201,162,75,0.5)',
          boxShadow: isFirst
            ? '0 0 60px rgba(245,215,110,0.45), 0 0 0 1px rgba(245,215,110,0.85) inset'
            : '0 4px 12px rgba(0,0,0,0.5)',
        }}
      >
        {entry.photo ? (
          <img
            src={entry.photo}
            alt={displayName}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <PortraitPlaceholder entry={entry} seed={entry.rank} />
        )}
      </div>

      {/* Corner brackets — 1 位は太め (3px×32) で強調、2-3 位は細め (2px×26) */}
      <Bracket pos="tl" size={bracketSize} stroke={bracketStroke} color={bracketColor} cardW={pos.w} cardH={pos.h} />
      <Bracket pos="tr" size={bracketSize} stroke={bracketStroke} color={bracketColor} cardW={pos.w} cardH={pos.h} />
      <Bracket pos="bl" size={bracketSize} stroke={bracketStroke} color={bracketColor} cardW={pos.w} cardH={pos.h} />
      <Bracket pos="br" size={bracketSize} stroke={bracketStroke} color={bracketColor} cardW={pos.w} cardH={pos.h} />

      {/* Label area: company → name → points */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: pos.h + TOP3_LABEL_GAP,
          textAlign: 'center',
          pointerEvents: 'none',
        }}
      >
        {displayCompany && (
          <div
            style={{
              fontFamily: "'Noto Sans JP', sans-serif",
              fontWeight: 600,
              fontSize: pos.companySize,
              letterSpacing: '0.2em',
              paddingLeft: '0.2em',
              color: '#bfa15a',
              lineHeight: 1.2,
              marginBottom: 8,
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
            lineHeight: 1.15,
            color: '#fff',
            textShadow: '0 2px 6px rgba(0,0,0,0.9)',
            ...fitStyle(nameFit),
          }}
        >
          {displayName}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'center',
            gap: 8,
            marginTop: 24,
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

interface BracketProps {
  pos: 'tl' | 'tr' | 'bl' | 'br';
  size: number;
  stroke: number;
  color: string;
  cardW: number;
  cardH: number;
}

function Bracket({ pos, size, stroke, color, cardW, cardH }: BracketProps) {
  const isTop  = pos === 'tl' || pos === 'tr';
  const isLeft = pos === 'tl' || pos === 'bl';
  return (
    <div
      style={{
        position: 'absolute',
        width: size,
        height: size,
        top:    isTop  ? 0 : cardH - size,
        left:   isLeft ? 0 : cardW - size,
        borderTop:    isTop  ? `${stroke}px solid ${color}` : 'none',
        borderBottom: isTop  ? 'none' : `${stroke}px solid ${color}`,
        borderLeft:   isLeft ? `${stroke}px solid ${color}` : 'none',
        borderRight:  isLeft ? 'none' : `${stroke}px solid ${color}`,
        pointerEvents: 'none',
      }}
    />
  );
}
