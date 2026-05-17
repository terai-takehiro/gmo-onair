import { useEffect, useMemo, useState } from 'react';
import type { CgMappedEntry, VoteDisplay } from '../types';

interface Props {
  entries: CgMappedEntry[];   // sorted by rank
  winner: CgMappedEntry | null;
  phase: 0 | 1 | 2;            // 0:shake / 1:grow / 2:winner full
  display: VoteDisplay;
  categoryParent: string;
  categoryChild: string;
  lang: 'ja' | 'en';
}

const COLORS = [
  { bar: 'linear-gradient(180deg, #5fa8ff, #1a4a8a)', accent: '#5d9cff', text: '#cfe2ff' },
  { bar: 'linear-gradient(180deg, #ff7d6b, #8b1f1f)', accent: '#ff7d6b', text: '#ffd0c0' },
  { bar: 'linear-gradient(180deg, #7eea9c, #1a6638)', accent: '#7eea9c', text: '#d0ffe2' },
];

export default function StepVoteReveal({
  entries, winner, phase, display, categoryParent, categoryChild, lang,
}: Props) {
  const top3 = useMemo(() => entries.filter((e) => e.rank >= 1 && e.rank <= 3), [entries]);
  const totalVotes = useMemo(
    () => top3.reduce((s, e) => s + (e.voteCount ?? 0), 0),
    [top3]
  );

  // Phase 0: ランダム揺れ用の値 (0-100)
  const [shakeVals, setShakeVals] = useState<number[]>(() => top3.map(() => 50));
  useEffect(() => {
    if (phase !== 0) return;
    const tick = () => setShakeVals(top3.map(() => 20 + Math.random() * 70));
    tick();
    const id = window.setInterval(tick, 220);
    return () => window.clearInterval(id);
  }, [phase, top3.length]);

  // 値計算
  const actualValues = top3.map((e) => e.voteCount ?? 0);
  const maxActual = Math.max(1, ...actualValues);

  function pctOf(v: number) {
    if (display === 'percent') {
      return totalVotes > 0 ? (v / totalVotes) * 100 : 0;
    }
    return (v / maxActual) * 100;
  }

  // Phase 2 = winner full
  if (phase === 2 && winner) {
    return <VoteWinnerFull winner={winner} categoryParent={categoryParent} categoryChild={categoryChild} lang={lang} />;
  }

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* タイトル帯 */}
      <div
        style={{
          position: 'absolute',
          top: 70,
          left: 80,
          right: 80,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 20,
            letterSpacing: '0.5em',
            color: '#F5D76E',
            marginBottom: 8,
          }}
        >
          VOTE RESULT
        </div>
        <div
          style={{
            fontFamily: "'Noto Sans JP', sans-serif",
            fontWeight: 900,
            fontSize: 52,
            color: '#fff',
            letterSpacing: '0.04em',
            textShadow: '0 2px 12px rgba(0,0,0,0.7)',
          }}
        >
          {categoryChild || categoryParent}
        </div>
        {categoryParent && categoryChild && (
          <div style={{ marginTop: 6, fontSize: 22, color: '#F5D76E', letterSpacing: '0.08em' }}>
            {categoryParent}
          </div>
        )}
      </div>

      {/* 棒グラフ */}
      <div
        style={{
          position: 'absolute',
          left: 140,
          right: 140,
          bottom: 140,
          top: 280,
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.max(1, top3.length)}, 1fr)`,
          gap: 48,
          alignItems: 'end',
        }}
      >
        {top3.map((e, i) => {
          const target = pctOf(actualValues[i]);
          const shake = pctOf((shakeVals[i] / 100) * maxActual);
          const live = phase === 0 ? shake : target;
          return (
            <Bar
              key={e.id}
              index={i + 1}
              entry={e}
              valuePct={live}
              rawValue={actualValues[i]}
              totalVotes={totalVotes}
              display={display}
              phase={phase}
              lang={lang}
            />
          );
        })}
        {top3.length === 0 && (
          <div style={{ gridColumn: '1 / -1', alignSelf: 'center', textAlign: 'center', color: '#aaa', fontSize: 26 }}>
            TOP3 が設定されていません
          </div>
        )}
      </div>
    </div>
  );
}

function Bar({
  index, entry, valuePct, rawValue, totalVotes, display, phase, lang,
}: {
  index: number;
  entry: CgMappedEntry;
  valuePct: number;
  rawValue: number;
  totalVotes: number;
  display: VoteDisplay;
  phase: 0 | 1 | 2;
  lang: 'ja' | 'en';
}) {
  const c = COLORS[index - 1] ?? COLORS[0];
  const heightPct = Math.max(2, Math.min(100, valuePct));
  const name = lang === 'en' ? (entry.nameEn || entry.name) : entry.name;
  const company = lang === 'en' ? (entry.orgEn || entry.company) : entry.company;
  const displayValue = display === 'percent'
    ? `${totalVotes > 0 ? Math.round((rawValue / totalVotes) * 100) : 0}%`
    : `${rawValue.toLocaleString()} 票`;

  return (
    <div
      style={{
        position: 'relative',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
    >
      {/* 数値ラベル (棒の上) */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: `calc(${heightPct}% + 8px)`,
          textAlign: 'center',
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: phase === 1 ? 56 : 40,
          fontWeight: 900,
          color: c.accent,
          textShadow: '0 2px 10px rgba(0,0,0,0.7)',
          letterSpacing: '0.04em',
          transition: 'bottom 800ms cubic-bezier(.2,.8,.2,1), font-size 400ms ease',
        }}
      >
        {phase === 0 ? '???' : displayValue}
      </div>

      {/* 棒本体 */}
      <div
        style={{
          width: '100%',
          height: `${heightPct}%`,
          background: c.bar,
          borderRadius: '6px 6px 0 0',
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.2), 0 -4px 20px ${c.accent}55`,
          border: `1px solid ${c.accent}`,
          borderBottom: 'none',
          transition: phase === 0
            ? 'height 200ms ease-out'
            : 'height 2200ms cubic-bezier(.2,.8,.2,1)',
          position: 'relative',
        }}
      >
        {/* グレア */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(255,255,255,0.18), transparent 40%)',
          borderRadius: '6px 6px 0 0',
        }} />
      </div>

      {/* 名前カード */}
      <div
        style={{
          marginTop: 12,
          background: 'rgba(8,12,20,0.85)',
          border: `1px solid ${c.accent}88`,
          borderRadius: 6,
          padding: '10px 14px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 22,
            color: c.accent,
            letterSpacing: '0.3em',
            marginBottom: 4,
          }}
        >
          NO.{index}
        </div>
        <div
          style={{
            fontFamily: "'Noto Sans JP', sans-serif",
            fontWeight: 900,
            fontSize: 24,
            color: '#fff',
            lineHeight: 1.15,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {name}
        </div>
        {company && (
          <div style={{ marginTop: 2, fontSize: 14, color: c.text, letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {company}
          </div>
        )}
      </div>
    </div>
  );
}

function VoteWinnerFull({ winner, categoryParent, categoryChild, lang }: {
  winner: CgMappedEntry;
  categoryParent: string;
  categoryChild: string;
  lang: 'ja' | 'en';
}) {
  const name = lang === 'en' ? (winner.nameEn || winner.name) : winner.name;
  const company = lang === 'en' ? (winner.orgEn || winner.company) : winner.company;
  const [show, setShow] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setShow(true), 50);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse at center, rgba(80,40,10,0.55), rgba(0,0,0,0.85))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        textAlign: 'center',
      }}
    >
      {/* 上 部門ラベル */}
      <div
        style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 22,
          letterSpacing: '0.5em',
          color: '#F5D76E',
          opacity: show ? 1 : 0,
          transform: show ? 'translateY(0)' : 'translateY(-20px)',
          transition: 'all 700ms ease',
        }}
      >
        VOTE WINNER
      </div>
      <div
        style={{
          fontFamily: "'Noto Sans JP', sans-serif",
          fontWeight: 700,
          fontSize: 36,
          color: '#F5D76E',
          letterSpacing: '0.06em',
          marginTop: 12,
          opacity: show ? 1 : 0,
          transition: 'opacity 800ms ease 200ms',
        }}
      >
        {categoryChild || categoryParent}
      </div>

      {/* 写真 */}
      {winner.photo && (
        <img
          src={winner.photo}
          alt=""
          style={{
            width: 480,
            height: 480,
            objectFit: 'cover',
            borderRadius: 12,
            border: '4px solid #F5D76E',
            marginTop: 40,
            boxShadow: '0 0 60px rgba(245,215,110,0.6)',
            transform: show ? 'scale(1)' : 'scale(0.6)',
            opacity: show ? 1 : 0,
            transition: 'all 900ms cubic-bezier(.2,.8,.2,1.05) 300ms',
          }}
        />
      )}

      {/* 名前 */}
      <div
        style={{
          marginTop: 36,
          fontFamily: "'Noto Sans JP', sans-serif",
          fontWeight: 900,
          fontSize: 96,
          color: '#fff',
          letterSpacing: '0.06em',
          textShadow: '0 4px 24px rgba(0,0,0,0.7), 0 0 24px rgba(245,215,110,0.4)',
          opacity: show ? 1 : 0,
          transform: show ? 'translateY(0)' : 'translateY(40px)',
          transition: 'all 900ms cubic-bezier(.2,.8,.2,1.05) 700ms',
        }}
      >
        {name}
      </div>
      {company && (
        <div
          style={{
            marginTop: 12,
            fontFamily: "'Noto Sans JP', sans-serif",
            fontSize: 36,
            color: '#F5D76E',
            letterSpacing: '0.08em',
            opacity: show ? 0.95 : 0,
            transition: 'opacity 800ms ease 1000ms',
          }}
        >
          {company}
        </div>
      )}
    </div>
  );
}
