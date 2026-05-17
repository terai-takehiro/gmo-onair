import { useEffect, useMemo, useState } from 'react';
import type { CgMappedEntry, VoteDisplay } from '../types';

interface Props {
  entries: CgMappedEntry[];
  winner: CgMappedEntry | null;
  phase: 0 | 1 | 2;            // 0:shake / 1:grow→2 auto / 2:winner full
  display: VoteDisplay;
  categoryParent: string;
  categoryChild: string;
  lang: 'ja' | 'en';
}

/**
 * アカデミー賞風 フォーマル投票結果リビール。
 * 派手な原色・パーティクル・スキャンラインを廃し、
 * 黒地 + 細いゴールド + 控えめなビネットでクラシカルな厳粛感を演出。
 */
export default function StepVoteReveal({
  entries, winner, phase, display, categoryParent, categoryChild, lang,
}: Props) {
  const top3 = useMemo(() => entries.filter((e) => e.rank >= 1 && e.rank <= 3), [entries]);
  const totalVotes = useMemo(
    () => top3.reduce((s, e) => s + (e.voteCount ?? 0), 0),
    [top3]
  );

  // Phase 0: ランダム揺れ (控えめに、ジワジワ)
  const [shakeVals, setShakeVals] = useState<number[]>(() => top3.map(() => 50));
  useEffect(() => {
    if (phase !== 0) return;
    const tick = () => setShakeVals(top3.map(() => 30 + Math.random() * 55));
    tick();
    const id = window.setInterval(tick, 380);
    return () => window.clearInterval(id);
  }, [phase, top3.length]);

  const actualValues = top3.map((e) => e.voteCount ?? 0);
  const maxActual = Math.max(1, ...actualValues);

  function pctOf(v: number) {
    if (display === 'percent') {
      return totalVotes > 0 ? (v / totalVotes) * 100 : 0;
    }
    return (v / maxActual) * 100;
  }

  if (phase === 2 && winner) {
    return <GrandWinner winner={winner} categoryParent={categoryParent} categoryChild={categoryChild} lang={lang} />;
  }

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <FormalBackdrop />

      {/* ヘッダー: ホエアライン + 賞名 */}
      <div
        style={{
          position: 'absolute',
          top: 80,
          left: 0, right: 0,
          textAlign: 'center',
          zIndex: 3,
        }}
      >
        <div
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 16,
            letterSpacing: '0.7em',
            color: '#bfa15a',
            marginBottom: 14,
            opacity: 0.95,
          }}
        >
          &mdash; &nbsp; VOTE RESULTS &nbsp; &mdash;
        </div>
        <div
          style={{
            fontFamily: "'Noto Serif JP', 'Noto Sans JP', serif",
            fontWeight: 700,
            fontSize: 52,
            letterSpacing: '0.16em',
            color: '#f0e3bc',
            textShadow: '0 2px 14px rgba(0,0,0,0.7)',
            lineHeight: 1.1,
          }}
        >
          {categoryChild || categoryParent}
        </div>
        {categoryParent && categoryChild && (
          <div style={{
            marginTop: 6,
            fontFamily: "'Noto Serif JP', 'Noto Sans JP', serif",
            fontSize: 20,
            color: 'rgba(191,161,90,0.85)',
            letterSpacing: '0.32em',
          }}>
            {categoryParent}
          </div>
        )}
        <div style={{
          marginTop: 22,
          height: 1,
          width: 220,
          background: 'linear-gradient(90deg, transparent, #bfa15a, transparent)',
          marginLeft: 'auto', marginRight: 'auto',
        }}/>
      </div>

      {/* 棒グラフエリア */}
      <div
        style={{
          position: 'absolute',
          left: 200,
          right: 200,
          bottom: 130,
          top: 320,
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.max(1, top3.length)}, 1fr)`,
          gap: 90,
          alignItems: 'end',
          zIndex: 2,
        }}
      >
        {top3.map((e, i) => {
          const target = pctOf(actualValues[i]);
          const shake = pctOf((shakeVals[i] / 100) * maxActual);
          const live = phase === 0 ? shake : target;
          return (
            <FormalBar
              key={e.id}
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
      </div>
    </div>
  );
}

function FormalBackdrop() {
  return (
    <>
      {/* 黒地ベース + 中央スポット (控えめ) */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `
          radial-gradient(ellipse 60% 65% at 50% 55%, rgba(40,30,18,0.85), rgba(8,6,5,1) 75%),
          #050402
        `,
      }}/>
      {/* 上下 ゴールド ヘアライン */}
      <div style={{
        position: 'absolute', top: 30, left: 80, right: 80,
        height: 1, background: 'linear-gradient(90deg, transparent, rgba(191,161,90,0.8), transparent)',
      }}/>
      <div style={{
        position: 'absolute', bottom: 30, left: 80, right: 80,
        height: 1, background: 'linear-gradient(90deg, transparent, rgba(191,161,90,0.8), transparent)',
      }}/>
      {/* 4 隅装飾 (薄く) */}
      {(['tl','tr','bl','br'] as const).map((c) => {
        const sz = 60;
        return (
          <div key={c} style={{
            position: 'absolute', width: sz, height: sz,
            opacity: 0.6,
            ...(c === 'tl' && { top: 50, left: 100, borderTop: '1px solid #bfa15a', borderLeft: '1px solid #bfa15a' }),
            ...(c === 'tr' && { top: 50, right: 100, borderTop: '1px solid #bfa15a', borderRight: '1px solid #bfa15a' }),
            ...(c === 'bl' && { bottom: 50, left: 100, borderBottom: '1px solid #bfa15a', borderLeft: '1px solid #bfa15a' }),
            ...(c === 'br' && { bottom: 50, right: 100, borderBottom: '1px solid #bfa15a', borderRight: '1px solid #bfa15a' }),
          }}/>
        );
      })}
    </>
  );
}

function FormalBar({
  entry, valuePct, rawValue, totalVotes, display, phase, lang,
}: {
  entry: CgMappedEntry;
  valuePct: number;
  rawValue: number;
  totalVotes: number;
  display: VoteDisplay;
  phase: 0 | 1 | 2;
  lang: 'ja' | 'en';
}) {
  const heightPct = Math.max(2, Math.min(100, valuePct));
  const name = lang === 'en' ? (entry.nameEn || entry.name) : entry.name;
  const company = lang === 'en' ? (entry.orgEn || entry.company) : entry.company;
  const displayValue = display === 'percent'
    ? `${totalVotes > 0 ? Math.round((rawValue / totalVotes) * 100) : 0}%`
    : `${rawValue.toLocaleString()}`;
  const displayUnit = display === 'percent' ? '' : '票';

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
      {/* 数値ラベル (バー上) */}
      <div
        style={{
          position: 'absolute',
          left: 0, right: 0,
          bottom: `calc(${heightPct}% + 18px)`,
          textAlign: 'center',
          transition: phase === 0 ? 'bottom 380ms ease-out' : 'bottom 2400ms cubic-bezier(.4,.0,.2,1)',
          zIndex: 3,
          pointerEvents: 'none',
        }}
      >
        <div style={{
          display: 'inline-block',
          fontFamily: "'Bebas Neue', sans-serif",
          fontWeight: 400,
          fontSize: phase === 1 ? 56 : 42,
          color: '#f0e3bc',
          letterSpacing: '0.05em',
          textShadow: '0 1px 8px rgba(0,0,0,0.75)',
          lineHeight: 1,
          transition: 'font-size 600ms ease',
        }}>
          {phase === 0 ? '——' : displayValue}
          {phase !== 0 && displayUnit && (
            <span style={{ fontSize: '0.42em', color: '#bfa15a', letterSpacing: '0.3em', marginLeft: 6 }}>
              {displayUnit}
            </span>
          )}
        </div>
      </div>

      {/* バー本体: 細身、控えめなゴールドグラデ */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: `${heightPct}%`,
          transition: phase === 0
            ? 'height 380ms ease-out'
            : 'height 2400ms cubic-bezier(.4,.0,.2,1)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `
              linear-gradient(180deg,
                rgba(245,215,110,0.95) 0%,
                rgba(191,161,90,0.92) 35%,
                rgba(120,95,42,0.88) 100%
              )
            `,
            border: '1px solid rgba(191,161,90,0.8)',
            borderBottom: 'none',
            boxShadow: 'inset 0 2px 0 rgba(255,245,210,0.35), 0 -2px 24px rgba(191,161,90,0.18)',
          }}
        />
        {/* 縦の薄いハイライト 1 本だけ */}
        <div style={{
          position: 'absolute',
          left: '38%', top: 0, bottom: 0, width: 2,
          background: 'rgba(255,245,210,0.18)',
        }}/>
      </div>

      {/* 名前パネル: ミニマル */}
      <div
        style={{
          marginTop: 22,
          paddingTop: 14,
          borderTop: '1px solid rgba(191,161,90,0.55)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontFamily: "'Noto Serif JP', 'Noto Sans JP', serif",
            fontWeight: 700,
            fontSize: 30,
            color: '#f0e3bc',
            lineHeight: 1.2,
            letterSpacing: '0.06em',
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
          <div style={{
            marginTop: 4,
            fontFamily: "'Noto Serif JP', 'Noto Sans JP', serif",
            fontSize: 16,
            color: 'rgba(191,161,90,0.85)',
            letterSpacing: '0.16em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {company}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 大賞フルスクリーン (アカデミー賞風: 厳粛・ミニマル)
// ─────────────────────────────────────────────────────────────

function GrandWinner({ winner, categoryParent, categoryChild, lang }: {
  winner: CgMappedEntry;
  categoryParent: string;
  categoryChild: string;
  lang: 'ja' | 'en';
}) {
  const name = lang === 'en' ? (winner.nameEn || winner.name) : winner.name;
  const company = lang === 'en' ? (winner.orgEn || winner.company) : winner.company;
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setStage(1), 220);  // 賞名
    const t2 = setTimeout(() => setStage(2), 1200); // "and the winner is..."
    const t3 = setTimeout(() => setStage(3), 2400); // 写真
    const t4 = setTimeout(() => setStage(4), 3300); // 名前
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, []);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 10, overflow: 'hidden' }}>
      <style>{`
        @keyframes gwFadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes gwLineDraw { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes gwSpotPulse { 0%,100% { opacity: 0.85; } 50% { opacity: 1; } }
        @keyframes gwPhotoIn { from { opacity: 0; transform: scale(0.94); } to { opacity: 1; transform: scale(1); } }
      `}</style>

      {/* 黒地 + 中央スポット (静的) */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `
          radial-gradient(ellipse 55% 60% at 50% 50%, rgba(50,38,22,0.95), rgba(6,5,4,1) 75%),
          #030202
        `,
      }}/>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(circle at 50% 50%, rgba(245,215,110,0.08), transparent 50%)',
        animation: 'gwSpotPulse 6s ease-in-out infinite',
      }}/>

      {/* 4 隅 薄い装飾 */}
      {(['tl','tr','bl','br'] as const).map((c) => {
        const sz = 80;
        return (
          <div key={c} style={{
            position: 'absolute', width: sz, height: sz, opacity: 0.7,
            ...(c === 'tl' && { top: 60, left: 100, borderTop: '1px solid #bfa15a', borderLeft: '1px solid #bfa15a' }),
            ...(c === 'tr' && { top: 60, right: 100, borderTop: '1px solid #bfa15a', borderRight: '1px solid #bfa15a' }),
            ...(c === 'bl' && { bottom: 60, left: 100, borderBottom: '1px solid #bfa15a', borderLeft: '1px solid #bfa15a' }),
            ...(c === 'br' && { bottom: 60, right: 100, borderBottom: '1px solid #bfa15a', borderRight: '1px solid #bfa15a' }),
          }}/>
        );
      })}

      {/* 賞名 ヘッダー (stage 1) */}
      <div
        style={{
          position: 'absolute',
          top: 140, left: 0, right: 0,
          textAlign: 'center',
          opacity: stage >= 1 ? 1 : 0,
          transform: stage >= 1 ? 'translateY(0)' : 'translateY(20px)',
          transition: 'opacity 900ms ease, transform 900ms ease',
        }}
      >
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 16,
          letterSpacing: '0.7em',
          color: '#bfa15a',
          marginBottom: 14,
        }}>
          &mdash; &nbsp; THE WINNER &nbsp; &mdash;
        </div>
        <div style={{
          fontFamily: "'Noto Serif JP', 'Noto Sans JP', serif",
          fontWeight: 700,
          fontSize: 44,
          letterSpacing: '0.18em',
          color: '#f0e3bc',
          textShadow: '0 2px 14px rgba(0,0,0,0.7)',
        }}>
          {categoryChild || categoryParent}
        </div>
      </div>

      {/* "and the winner is..." 中間テキスト (stage 2, 3 で fade out) */}
      <div
        style={{
          position: 'absolute',
          top: '50%', left: 0, right: 0,
          textAlign: 'center',
          opacity: stage === 2 ? 1 : 0,
          transform: 'translateY(-50%)',
          transition: 'opacity 800ms ease',
          fontFamily: "'Noto Serif JP', 'Noto Sans JP', serif",
          fontStyle: 'italic',
          fontSize: 36,
          color: 'rgba(240,227,188,0.85)',
          letterSpacing: '0.14em',
        }}
      >
        {lang === 'en' ? 'And the winner is…' : '受 賞 者 は …'}
      </div>

      {/* 写真 (stage 3) — 中央 */}
      <div
        style={{
          position: 'absolute',
          left: '50%', top: 320,
          transform: 'translateX(-50%)',
          width: 440, height: 440,
          opacity: stage >= 3 ? 1 : 0,
          animation: stage >= 3 ? 'gwPhotoIn 1100ms cubic-bezier(.2,.85,.3,1) forwards' : 'none',
        }}
      >
        {/* 細い金枠 */}
        <div style={{
          position: 'absolute', inset: -4,
          border: '1px solid rgba(191,161,90,0.85)',
          boxShadow: '0 0 60px rgba(245,215,110,0.25)',
        }}/>
        <div style={{
          position: 'absolute', inset: 0,
          background: '#111',
          overflow: 'hidden',
        }}>
          {winner.photo ? (
            <img src={winner.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
          ) : (
            <div style={{
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 160, color: 'rgba(191,161,90,0.35)',
            }}>
              &mdash;
            </div>
          )}
        </div>
      </div>

      {/* ヘアライン区切り (stage 4) */}
      <div
        style={{
          position: 'absolute',
          left: '50%', top: 800,
          transform: 'translateX(-50%)',
          width: 220, height: 1,
          background: 'linear-gradient(90deg, transparent, #bfa15a, transparent)',
          transformOrigin: 'center',
          opacity: stage >= 4 ? 1 : 0,
          animation: stage >= 4 ? 'gwLineDraw 700ms ease-out forwards' : 'none',
        }}
      />

      {/* 名前 (stage 4) */}
      <div
        style={{
          position: 'absolute',
          left: 0, right: 0, top: 830,
          textAlign: 'center',
          opacity: stage >= 4 ? 1 : 0,
          transform: stage >= 4 ? 'translateY(0)' : 'translateY(20px)',
          transition: 'opacity 1100ms ease 200ms, transform 1100ms ease 200ms',
        }}
      >
        <div style={{
          fontFamily: "'Noto Serif JP', 'Noto Sans JP', serif",
          fontWeight: 900,
          fontSize: 96,
          letterSpacing: '0.1em',
          lineHeight: 1.05,
          color: '#f5e9c5',
          textShadow: '0 2px 24px rgba(0,0,0,0.85), 0 0 36px rgba(245,215,110,0.25)',
        }}>
          {name}
        </div>
        {company && (
          <div style={{
            marginTop: 14,
            fontFamily: "'Noto Serif JP', 'Noto Sans JP', serif",
            fontSize: 26,
            color: 'rgba(191,161,90,0.95)',
            letterSpacing: '0.32em',
          }}>
            {company}
          </div>
        )}
      </div>
    </div>
  );
}
