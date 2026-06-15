import { useState, useEffect } from 'react';
import type { CgStep, CgMappedEntry } from '../types';
import CountUp from '../components/CountUp';
import { fitText, fitStyle } from '../fitText';
import {
  RANK_PAD_X,
  ROW_H,
  RANK_PHOTO_H,
  RANK_PHOTO_W,
  CG_W,
  rowTopFor,
  rankPhotoX,
  rankBarLeft,
  rankBarFullW,
} from '../layout';

interface Props {
  entries: CgMappedEntry[];
  revealLevel: number;
  showWinnerBar: boolean;
  stepKey: CgStep;
  lang?: 'ja' | 'en';
}

const STRIP_SETTLE = 800;
const BAR_INTERVAL = 1100;
const PHOTO_OFFSET = 280;

export default function StepRanking({ entries, revealLevel, showWinnerBar, stepKey, lang = 'ja' }: Props) {
  const rows = [...entries].sort((a, b) => a.rank - b.rank).filter((e) => e.rank <= 5);
  const maxPoints = Math.max(...rows.map((r) => r.points), 1);

  const [barStarted, setBarStarted] = useState<Record<number, boolean>>({});
  const [inserted, setInserted] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (stepKey !== 'ranks52') {
      setBarStarted({});
      setInserted({});
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    ([5, 4, 3, 2] as const).forEach((rank, i) => {
      timers.push(
        setTimeout(
          () => setBarStarted((p) => ({ ...p, [rank]: true })),
          STRIP_SETTLE + i * BAR_INTERVAL,
        ),
      );
      timers.push(
        setTimeout(
          () => setInserted((p) => ({ ...p, [rank]: true })),
          STRIP_SETTLE + i * BAR_INTERVAL + PHOTO_OFFSET,
        ),
      );
    });
    return () => timers.forEach(clearTimeout);
  }, [stepKey]);

  const isRevealed = (rank: number): boolean => {
    if (rank === 1) return showWinnerBar;
    if (stepKey === 'ranks52') return barStarted[rank] === true;
    return (6 - rank) <= revealLevel;
  };

  const nameVisible = (rank: number): boolean => {
    if (rank === 1) return false;
    if (stepKey === 'ranks52') return inserted[rank] === true;
    return isRevealed(rank);
  };

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {rows.map((e) => (
        <RankingRow
          key={e.id}
          entry={e}
          widthPct={(e.points / maxPoints) * 100}
          revealed={isRevealed(e.rank)}
          nameVisible={nameVisible(e.rank)}
          isFirst={e.rank === 1}
          lang={lang}
        />
      ))}
    </div>
  );
}

interface RowProps {
  entry: CgMappedEntry;
  widthPct: number;
  revealed: boolean;
  nameVisible: boolean;
  isFirst: boolean;
  lang?: 'ja' | 'en';
}

function RankingRow({ entry, widthPct, revealed, nameVisible, isFirst, lang = 'ja' }: RowProps) {
  const displayName    = lang === 'en' ? (entry.nameEn || entry.name) : entry.name;
  const displayCompany = lang === 'en' ? (entry.orgEn  || entry.company) : entry.company;
  const rowTop = rowTopFor(entry.rank);
  const pX = rankPhotoX();
  const bLeft = rankBarLeft();
  const bFullW = rankBarFullW();

  const [grown, setGrown] = useState(false);
  useEffect(() => {
    if (revealed && !grown) {
      const t = setTimeout(() => setGrown(true), 80);
      return () => clearTimeout(t);
    }
  }, [revealed, grown]);

  const textW = bFullW - 24 - 320;
  // 行高さが固定なので折り返さず scaleX (長体) のみで必ず収める
  const nameFit = fitText(displayName, textW, `900 ${isFirst ? 38 : 34}px 'Noto Sans JP', sans-serif`, { noWrap: true, letterSpacingEm: 0.06 });
  const compText = displayCompany + (entry.role ? ` / ${entry.role}` : '');
  const compFit = fitText(compText, textW, `700 20px 'Noto Sans JP', sans-serif`, { noWrap: true, letterSpacingEm: 0.18 });

  const ownRatio =
    entry.ownPoints && entry.points
      ? Math.min(1, entry.ownPoints / entry.points)
      : 0;
  const ownPct =
    entry.ownPoints && entry.points
      ? Math.round((entry.ownPoints / entry.points) * 100)
      : null;

  return (
    <div
      style={{
        position: 'absolute',
        left: RANK_PAD_X,
        top: rowTop,
        width: CG_W - RANK_PAD_X * 2,
        height: ROW_H,
        opacity: revealed ? 1 : 0.14,
        transition: 'opacity 500ms ease',
      }}
    >
      {/* Rank number */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 90,
          height: ROW_H,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          fontFamily: "'Roboto Condensed', sans-serif", fontWeight: 700,
          fontSize: 72,
          lineHeight: 1,
          background:
            'linear-gradient(180deg, #e8dcb6 0%, #bfa15a 55%, #6e5321 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          letterSpacing: '0.02em',
          animation: revealed ? 'cgRankPop 600ms cubic-bezier(.3,1.4,.5,1) both' : 'none',
        }}
      >
        {entry.rank}
      </div>

      {/* Photo slot frame (PhotoStage renders the actual photo here) */}
      <div
        style={{
          position: 'absolute',
          left: pX - RANK_PAD_X,
          top: (ROW_H - RANK_PHOTO_H) / 2,
          width: RANK_PHOTO_W,
          height: RANK_PHOTO_H,
          border: '1px solid rgba(201,162,75,0.35)',
          background: 'rgba(0,0,0,0.35)',
          opacity: revealed ? 1 : 0,
          transition: 'opacity 500ms ease',
        }}
      />

      {/* Bar area */}
      <div
        style={{
          position: 'absolute',
          left: bLeft - RANK_PAD_X,
          top: (ROW_H - RANK_PHOTO_H) / 2,
          width: bFullW,
          height: RANK_PHOTO_H,
        }}
      >
        {/* Proportional fill */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: grown ? `${widthPct}%` : '0%',
            transition: 'width 800ms cubic-bezier(.22,1,.36,1)',
            overflow: 'hidden',
            border: isFirst
              ? '1px solid rgba(245,215,110,0.9)'
              : '1px solid rgba(201,162,75,0.55)',
            background: isFirst
              ? 'linear-gradient(180deg, #C9A24B 0%, #8C6314 100%)'
              : 'linear-gradient(180deg, rgba(140,99,20,0.85) 0%, rgba(110,83,33,0.85) 100%)',
          }}
        >
          {ownRatio > 0 && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${ownRatio * 100}%`,
                background: isFirst
                  ? 'linear-gradient(180deg, #FFEFB0 0%, #F5D76E 100%)'
                  : 'linear-gradient(180deg, #F5D76E 0%, #C9A24B 100%)',
              }}
            />
          )}
          {ownRatio > 0 && ownRatio < 1 && (
            <div
              style={{
                position: 'absolute',
                left: `${ownRatio * 100}%`,
                top: 0,
                bottom: 0,
                width: 2,
                background: '#0a0705',
                transform: 'translateX(-1px)',
              }}
            />
          )}
        </div>

        {/* Name (slides in after bar grows) */}
        <div
          style={{
            position: 'absolute',
            left: 24,
            top: 0,
            bottom: 0,
            right: 320,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            opacity: nameVisible ? 1 : 0,
            transform: nameVisible ? 'translateX(0)' : 'translateX(-24px)',
            transition: 'opacity 420ms ease, transform 540ms cubic-bezier(.2,.8,.2,1)',
            pointerEvents: 'none',
          }}
        >
          {(displayCompany || entry.role) && (
            <div
              style={{
                fontFamily: "'Noto Sans JP', sans-serif",
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: '0.18em',
                color: isFirst ? '#fff8d8' : '#fffdf2',
                paddingLeft: '0.18em',
                marginBottom: 3,
                lineHeight: 1.2,
                textShadow: '0 1px 4px rgba(0,0,0,0.85)',
                ...fitStyle(compFit),
              }}
            >
              {displayCompany}
              {entry.role ? ` / ${entry.role}` : ''}
            </div>
          )}
          <div
            style={{
              fontFamily: "'Noto Sans JP', sans-serif",
              fontWeight: 900,
              fontSize: isFirst ? 38 : 34,
              color: '#fff',
              letterSpacing: '0.06em',
              paddingLeft: '0.06em',
              lineHeight: 1.1,
              textShadow: '0 2px 6px rgba(0,0,0,0.9)',
              ...fitStyle(nameFit),
            }}
          >
            {displayName}
          </div>
        </div>

        {/* Points readout (right side) */}
        <div
          style={{
            position: 'absolute',
            right: 16,
            top: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            justifyContent: 'center',
            gap: 2,
            opacity: revealed ? (grown ? 1 : 0) : 0,
            transition: 'opacity 400ms ease 200ms',
            pointerEvents: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span
              style={{
                fontFamily: "'Roboto Condensed', sans-serif", fontWeight: 700,
                fontSize: isFirst ? 64 : 52,
                lineHeight: 1,
                color: '#fff',
                letterSpacing: '0.02em',
                textShadow: '0 2px 6px rgba(0,0,0,0.9)',
              }}
            >
              <CountUp value={grown ? entry.points : 0} duration={800} />
            </span>
            <span
              style={{
                fontFamily: "'Roboto Condensed', sans-serif", fontWeight: 700,
                fontSize: isFirst ? 18 : 15,
                color: '#F5D76E',
                letterSpacing: '0.2em',
              }}
            >
              PT
            </span>
          </div>
          {ownPct != null && (
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 6,
                marginTop: 4,
              }}
            >
              <span
                style={{
                  fontFamily: lang === 'en' ? "'Roboto Condensed', sans-serif" : "'Noto Sans JP', sans-serif",
                  fontSize: lang === 'en' ? 16 : 15,
                  fontWeight: 700,
                  color: '#FFEFB0',
                  opacity: 0.9,
                  letterSpacing: '0.12em',
                }}
              >
                {lang === 'en' ? 'Internal Vote' : '自社票'}
              </span>
              <span
                style={{
                  fontFamily: "'Roboto Condensed', sans-serif", fontWeight: 700,
                  fontSize: isFirst ? 38 : 32,
                  lineHeight: 1,
                  color: '#FFEFB0',
                  letterSpacing: '0.04em',
                  textShadow: '0 2px 6px rgba(0,0,0,0.9)',
                }}
              >
                <CountUp value={grown ? ownPct : 0} duration={700} />%
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

