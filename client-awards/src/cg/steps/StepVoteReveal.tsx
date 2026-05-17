import { useEffect, useMemo, useState } from 'react';
import type { CgMappedEntry, VoteDisplay } from '../types';

interface Props {
  entries: CgMappedEntry[];   // sorted by rank
  winner: CgMappedEntry | null;
  phase: 0 | 1 | 2;            // 0:shake / 1:grow→2 auto / 2:winner full
  display: VoteDisplay;
  categoryParent: string;
  categoryChild: string;
  lang: 'ja' | 'en';
}

const PALETTE = [
  { core: '#5db4ff', deep: '#0e3f7d', glow: 'rgba(120,180,255,0.85)', shade: '#cfe3ff' },
  { core: '#ff8c7a', deep: '#7d1414', glow: 'rgba(255,150,120,0.85)', shade: '#ffd6ce' },
  { core: '#7eea9c', deep: '#0e5a30', glow: 'rgba(140,235,170,0.85)', shade: '#d5ffe2' },
];

export default function StepVoteReveal({
  entries, winner, phase, display, categoryParent, categoryChild, lang,
}: Props) {
  const top3 = useMemo(() => entries.filter((e) => e.rank >= 1 && e.rank <= 3), [entries]);
  const totalVotes = useMemo(
    () => top3.reduce((s, e) => s + (e.voteCount ?? 0), 0),
    [top3]
  );

  // Phase 0: ランダム揺れ値 (0-100)
  const [shakeVals, setShakeVals] = useState<number[]>(() => top3.map(() => 50));
  useEffect(() => {
    if (phase !== 0) return;
    const tick = () => setShakeVals(top3.map(() => 18 + Math.random() * 78));
    tick();
    const id = window.setInterval(tick, 180);
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

  // phase=2: 大賞フルスクリーン
  if (phase === 2 && winner) {
    return <GrandPrixOverlay winner={winner} categoryParent={categoryParent} categoryChild={categoryChild} lang={lang} />;
  }

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <ExcitementBackground intense={phase === 1} />

      {/* タイトル帯 */}
      <div
        style={{
          position: 'absolute',
          top: 56,
          left: 80,
          right: 80,
          textAlign: 'center',
          zIndex: 3,
        }}
      >
        <div
          style={{
            display: 'inline-block',
            padding: '6px 30px',
            border: '1px solid rgba(245,215,110,0.5)',
            borderRadius: 999,
            background: 'rgba(8,12,20,0.6)',
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 22,
            letterSpacing: '0.55em',
            color: '#F5D76E',
            marginBottom: 10,
            boxShadow: '0 4px 18px rgba(0,0,0,0.4)',
          }}
        >
          VOTE RESULT
        </div>
        <div
          style={{
            fontFamily: "'Noto Sans JP', sans-serif",
            fontWeight: 900,
            fontSize: 56,
            letterSpacing: '0.04em',
            background: 'linear-gradient(180deg, #ffffff, #ffeec0 55%, #f5d76e 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            textShadow: '0 0 28px rgba(245,215,110,0.3)',
            lineHeight: 1.05,
          }}
        >
          {categoryChild || categoryParent}
        </div>
        {categoryParent && categoryChild && (
          <div style={{ marginTop: 4, fontSize: 22, color: '#F5D76E', letterSpacing: '0.08em' }}>
            {categoryParent}
          </div>
        )}
      </div>

      {/* 棒グラフ */}
      <div
        style={{
          position: 'absolute',
          left: 120,
          right: 120,
          bottom: 130,
          top: 260,
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.max(1, top3.length)}, 1fr)`,
          gap: 56,
          alignItems: 'end',
          zIndex: 2,
        }}
      >
        {top3.map((e, i) => {
          const target = pctOf(actualValues[i]);
          const shake = pctOf((shakeVals[i] / 100) * maxActual);
          const live = phase === 0 ? shake : target;
          return (
            <LuxuryBar
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

function ExcitementBackground({ intense }: { intense: boolean }) {
  const beams = useMemo(() => Array.from({ length: 12 }).map((_, i) => ({
    angle: (i / 12) * 360,
    delay: i * 0.18,
  })), []);
  return (
    <>
      <style>{`
        @keyframes voteBeamSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes voteSweep    { 0% { opacity: 0.15; } 50% { opacity: 0.55; } 100% { opacity: 0.15; } }
        @keyframes voteGlowPulse {
          0%, 100% { filter: brightness(1) saturate(1.1); }
          50%      { filter: brightness(1.2) saturate(1.35); }
        }
      `}</style>
      {/* ベース */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `
          radial-gradient(ellipse 80% 70% at 50% 55%, rgba(120,70,20,0.55), rgba(20,8,4,0.95) 70%),
          linear-gradient(180deg, #08060f 0%, #0b0816 100%)
        `,
      }}/>
      {/* 放射ビーム (回転) */}
      <div style={{
        position: 'absolute',
        left: '50%', top: '50%',
        width: 2600, height: 2600,
        marginLeft: -1300, marginTop: -1300,
        animation: 'voteBeamSpin 32s linear infinite',
        pointerEvents: 'none',
        opacity: intense ? 0.6 : 0.4,
      }}>
        {beams.map((b, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: '50%', top: 0,
            width: 220, height: 1300,
            marginLeft: -110,
            transformOrigin: '50% 100%',
            transform: `rotate(${b.angle}deg)`,
            background: 'linear-gradient(180deg, rgba(245,215,110,0.18) 0%, transparent 60%)',
            mixBlendMode: 'screen',
            animation: `voteSweep ${3 + (i % 3) * 0.6}s ease-in-out infinite`,
            animationDelay: `${b.delay}s`,
          }}/>
        ))}
      </div>
      {/* 中央スポット */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 50% 40% at 50% 60%, rgba(255,200,90,0.22), transparent 70%)',
        animation: 'voteGlowPulse 2.4s ease-in-out infinite',
        pointerEvents: 'none',
      }}/>
      {/* 上下フレーム */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, transparent, #F5D76E, transparent)', opacity: 0.7 }}/>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, transparent, #F5D76E, transparent)', opacity: 0.7 }}/>
    </>
  );
}

function LuxuryBar({
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
  const c = PALETTE[index - 1] ?? PALETTE[0];
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
      <style>{`
        @keyframes voteBarShine {
          0% { transform: translateY(-100%); opacity: 0.0; }
          30% { opacity: 0.7; }
          100% { transform: translateY(100%); opacity: 0.0; }
        }
        @keyframes voteSparkRise {
          0%   { transform: translateY(0) scale(0.6); opacity: 0; }
          15%  { opacity: 1; }
          100% { transform: translateY(-260px) scale(1.4); opacity: 0; }
        }
      `}</style>

      {/* 数値ラベル (棒の上、追従) */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: `calc(${heightPct}% + 14px)`,
          textAlign: 'center',
          transition: 'bottom 900ms cubic-bezier(.2,.85,.25,1)',
          zIndex: 3,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'baseline',
            gap: 6,
            padding: phase === 1 ? '6px 18px' : '4px 12px',
            borderRadius: 8,
            background: phase === 1 ? 'rgba(8,12,20,0.78)' : 'rgba(8,12,20,0.55)',
            border: `1px solid ${c.core}88`,
            boxShadow: phase === 1 ? `0 0 24px ${c.glow}` : 'none',
            transition: 'all 300ms ease',
          }}
        >
          <span
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: phase === 1 ? 64 : 44,
              fontWeight: 900,
              color: '#fff',
              textShadow: `0 2px 10px ${c.glow}`,
              letterSpacing: '0.02em',
              lineHeight: 1,
              transition: 'font-size 300ms ease',
            }}
          >
            {phase === 0 ? '???' : displayValue}
          </span>
          {phase !== 0 && displayUnit && (
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: phase === 1 ? 24 : 18, color: c.shade, letterSpacing: '0.2em' }}>
              {displayUnit}
            </span>
          )}
        </div>
      </div>

      {/* 棒本体 (高さアニメ) */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: `${heightPct}%`,
          transition: phase === 0
            ? 'height 180ms ease-out'
            : 'height 2400ms cubic-bezier(.2,.85,.25,1)',
        }}
      >
        {/* メタリックグラデーション本体 */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '10px 10px 0 0',
            background: `
              linear-gradient(180deg,
                rgba(255,255,255,0.55) 0%,
                ${c.core} 18%,
                ${c.core} 42%,
                ${c.deep} 100%
              )
            `,
            boxShadow: `
              inset 0 2px 0 rgba(255,255,255,0.45),
              inset 0 -10px 30px rgba(0,0,0,0.45),
              inset 6px 0 12px rgba(255,255,255,0.1),
              inset -6px 0 12px rgba(0,0,0,0.35),
              0 -8px 40px ${c.glow}
            `,
            border: `1px solid ${c.core}`,
            borderBottom: 'none',
            overflow: 'hidden',
          }}
        >
          {/* 縦のハイライト */}
          <div style={{
            position: 'absolute',
            left: '12%', top: 0, bottom: 0, width: '14%',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.55), transparent 50%)',
            filter: 'blur(2px)',
          }}/>
          {/* スキャンライン (shine sweep) — grow 中のみ */}
          {phase === 1 && (
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(180deg, transparent 40%, rgba(255,255,255,0.55) 50%, transparent 60%)',
              animation: 'voteBarShine 1.6s ease-in-out infinite',
            }}/>
          )}
        </div>

        {/* 火花パーティクル (grow 中のみ、上端) */}
        {phase === 1 && (
          <>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{
                position: 'absolute',
                left: `${15 + i * 14}%`, top: -4,
                width: 8, height: 8, borderRadius: '50%',
                background: '#fff7c2',
                boxShadow: `0 0 12px ${c.glow}, 0 0 24px ${c.glow}`,
                animation: `voteSparkRise ${1.4 + (i % 3) * 0.25}s ease-out infinite`,
                animationDelay: `${i * 0.18}s`,
              }}/>
            ))}
          </>
        )}
      </div>

      {/* 名前カード */}
      <div
        style={{
          marginTop: 14,
          background: 'linear-gradient(180deg, rgba(20,16,30,0.92), rgba(8,6,12,0.95))',
          border: `1px solid ${c.core}`,
          borderRadius: 8,
          padding: '12px 16px',
          textAlign: 'center',
          boxShadow: `0 6px 20px rgba(0,0,0,0.55), 0 0 24px ${c.glow}33`,
        }}
      >
        <div
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 26,
            color: c.core,
            letterSpacing: '0.32em',
            marginBottom: 4,
            textShadow: `0 0 12px ${c.glow}`,
          }}
        >
          NO.{index}
        </div>
        <div
          style={{
            fontFamily: "'Noto Sans JP', sans-serif",
            fontWeight: 900,
            fontSize: 26,
            color: '#fff',
            lineHeight: 1.15,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            textShadow: '0 2px 6px rgba(0,0,0,0.6)',
          }}
        >
          {name}
        </div>
        {company && (
          <div style={{ marginTop: 2, fontSize: 15, color: c.shade, letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {company}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 大賞 (GRAND PRIX) フルスクリーン: 紙吹雪 + 太いゴールドフレーム + 巨大タイポ
// ─────────────────────────────────────────────────────────────

function GrandPrixOverlay({ winner, categoryParent, categoryChild, lang }: {
  winner: CgMappedEntry;
  categoryParent: string;
  categoryChild: string;
  lang: 'ja' | 'en';
}) {
  const name = lang === 'en' ? (winner.nameEn || winner.name) : winner.name;
  const company = lang === 'en' ? (winner.orgEn || winner.company) : winner.company;
  const [stage, setStage] = useState(0); // 0:flash → 1:title → 2:photo → 3:name
  useEffect(() => {
    const t1 = setTimeout(() => setStage(1), 120);
    const t2 = setTimeout(() => setStage(2), 700);
    const t3 = setTimeout(() => setStage(3), 1400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const confetti = useMemo(() => {
    const rnd = mulberry32(20260518);
    return Array.from({ length: 60 }).map((_, i) => ({
      x: rnd() * 1920,
      delay: rnd() * 0.4,
      dur: 3 + rnd() * 2,
      rot: rnd() * 360,
      color: ['#F5D76E', '#ffb347', '#fff7c2', '#ff7d6b', '#5db4ff', '#7eea9c'][i % 6],
      w: 8 + rnd() * 8,
      h: 12 + rnd() * 14,
      drift: -40 + rnd() * 80,
    }));
  }, []);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
      <style>{`
        @keyframes gpFlashIn { 0% { opacity: 0; } 30% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes gpRingExpand {
          0%   { transform: translate(-50%,-50%) scale(0.5); opacity: 1; }
          100% { transform: translate(-50%,-50%) scale(2.4); opacity: 0; }
        }
        @keyframes gpConfettiFall {
          0%   { transform: translate(0,-60px) rotate(0deg); opacity: 0; }
          5%   { opacity: 1; }
          100% { transform: translate(var(--drift, 0px), 1240px) rotate(720deg); opacity: 0.85; }
        }
        @keyframes gpTitleSlideIn {
          from { transform: translateY(-30px); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
        @keyframes gpPhotoZoomIn {
          from { transform: scale(0.5); opacity: 0; filter: blur(20px); }
          to   { transform: scale(1);   opacity: 1; filter: blur(0); }
        }
        @keyframes gpNameRise {
          from { transform: translateY(40px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes gpFrameDraw {
          from { stroke-dashoffset: 5800; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes gpStarFloat {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50%      { transform: translateY(-12px) rotate(8deg); }
        }
        @keyframes gpNameGlow {
          0%, 100% { filter: drop-shadow(0 0 18px rgba(245,215,110,0.7)); }
          50%      { filter: drop-shadow(0 0 36px rgba(255,200,80,1)); }
        }
      `}</style>

      {/* 背景 */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `
          radial-gradient(ellipse 70% 60% at 50% 50%, rgba(180,120,40,0.6), rgba(60,20,8,0.96) 70%, rgba(0,0,0,1) 100%),
          linear-gradient(180deg, #1a0c04 0%, #06030a 100%)
        `,
      }}/>

      {/* 放射ビーム */}
      <RadialBeams />

      {/* 初期フラッシュ */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(circle, rgba(255,240,200,0.95), transparent 60%)',
        animation: 'gpFlashIn 700ms ease-out forwards',
        pointerEvents: 'none',
      }}/>
      {/* 拡散リング */}
      <div style={{
        position: 'absolute', left: '50%', top: '50%',
        width: 600, height: 600, marginLeft: 0, marginTop: 0,
        borderRadius: '50%',
        border: '4px solid #F5D76E',
        animation: 'gpRingExpand 900ms ease-out forwards',
      }}/>

      {/* 装飾フレーム (SVG で stroke-draw) */}
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <rect
          x={60} y={60} width={1800} height={960}
          fill="none" stroke="#F5D76E" strokeWidth={2}
          strokeDasharray={5800} strokeDashoffset={5800}
          style={{ animation: 'gpFrameDraw 1.4s ease-out 0.2s forwards' }}
        />
        <rect
          x={72} y={72} width={1776} height={936}
          fill="none" stroke="rgba(245,215,110,0.4)" strokeWidth={1}
        />
      </svg>

      {/* GRAND PRIX タイトル */}
      <div
        style={{
          position: 'absolute',
          top: 100,
          left: 0, right: 0,
          textAlign: 'center',
          opacity: stage >= 1 ? 1 : 0,
          animation: stage >= 1 ? 'gpTitleSlideIn 700ms cubic-bezier(.2,1,.3,1) forwards' : 'none',
        }}
      >
        <div
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 50,
            letterSpacing: '0.4em',
            color: '#F5D76E',
            textShadow: '0 0 30px rgba(245,215,110,0.8)',
            marginBottom: 4,
          }}
        >
          ◆ GRAND PRIX ◆
        </div>
        <div
          style={{
            fontFamily: "'Noto Sans JP', sans-serif",
            fontWeight: 700,
            fontSize: 30,
            color: '#fff',
            letterSpacing: '0.1em',
            opacity: 0.9,
          }}
        >
          {categoryChild || categoryParent}
        </div>
      </div>

      {/* 写真 (中央) */}
      <div
        style={{
          position: 'absolute',
          left: '50%', top: 240,
          transform: 'translateX(-50%)',
          width: 480, height: 480,
          opacity: stage >= 2 ? 1 : 0,
          animation: stage >= 2 ? 'gpPhotoZoomIn 900ms cubic-bezier(.2,1,.3,1) forwards' : 'none',
        }}
      >
        <div style={{
          position: 'absolute', inset: -14,
          borderRadius: 14,
          background: 'conic-gradient(from 0deg, #F5D76E, #ffb347, #fff7c2, #F5D76E, #c8a050, #F5D76E)',
          filter: 'blur(2px)',
          animation: 'voteBeamSpin 8s linear infinite',
        }}/>
        <div style={{
          position: 'absolute', inset: 0,
          borderRadius: 10,
          background: '#111',
          border: '4px solid #F5D76E',
          boxShadow: '0 0 80px rgba(245,215,110,0.65), inset 0 0 30px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}>
          {winner.photo ? (
            <img src={winner.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Bebas Neue', sans-serif", fontSize: 200, color: '#F5D76E', opacity: 0.4 }}>
              ★
            </div>
          )}
        </div>
        {/* 星装飾 (4 隅) */}
        {(['tl','tr','bl','br'] as const).map((p, i) => (
          <div key={p} style={{
            position: 'absolute',
            fontSize: 36,
            color: '#F5D76E',
            textShadow: '0 0 14px rgba(245,215,110,0.8)',
            animation: `gpStarFloat 2s ease-in-out infinite`,
            animationDelay: `${i * 0.2}s`,
            ...(p === 'tl' && { top: -24, left: -24 }),
            ...(p === 'tr' && { top: -24, right: -24 }),
            ...(p === 'bl' && { bottom: -24, left: -24 }),
            ...(p === 'br' && { bottom: -24, right: -24 }),
          }}>★</div>
        ))}
      </div>

      {/* 名前 */}
      <div
        style={{
          position: 'absolute',
          left: 0, right: 0,
          top: 780,
          textAlign: 'center',
          opacity: stage >= 3 ? 1 : 0,
          animation: stage >= 3 ? 'gpNameRise 900ms cubic-bezier(.2,1,.3,1) forwards' : 'none',
        }}
      >
        <div
          style={{
            fontFamily: "'Noto Sans JP', sans-serif",
            fontWeight: 900,
            fontSize: 110,
            letterSpacing: '0.06em',
            lineHeight: 1.05,
            background: 'linear-gradient(180deg, #ffffff 0%, #fff4c6 35%, #f5d76e 65%, #c9a24b 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            animation: 'gpNameGlow 2s ease-in-out infinite',
          }}
        >
          {name}
        </div>
        {company && (
          <div style={{
            marginTop: 14,
            fontFamily: "'Noto Sans JP', sans-serif",
            fontSize: 36,
            fontWeight: 700,
            color: '#F5D76E',
            letterSpacing: '0.1em',
            textShadow: '0 2px 10px rgba(0,0,0,0.7)',
          }}>
            {company}
          </div>
        )}
      </div>

      {/* 紙吹雪 */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {confetti.map((c, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: c.x, top: -20,
            width: c.w, height: c.h,
            background: c.color,
            opacity: 0.9,
            ['--drift' as never]: `${c.drift}px`,
            animation: `gpConfettiFall ${c.dur}s linear infinite`,
            animationDelay: `${c.delay}s`,
            transform: `rotate(${c.rot}deg)`,
            boxShadow: '0 0 6px rgba(255,255,255,0.3)',
          }}/>
        ))}
      </div>
    </div>
  );
}

function RadialBeams() {
  const beams = useMemo(() => Array.from({ length: 16 }).map((_, i) => ({
    angle: (i / 16) * 360,
  })), []);
  return (
    <div style={{
      position: 'absolute',
      left: '50%', top: '50%',
      width: 2600, height: 2600,
      marginLeft: -1300, marginTop: -1300,
      animation: 'voteBeamSpin 24s linear infinite',
      pointerEvents: 'none',
      opacity: 0.55,
    }}>
      {beams.map((b, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: '50%', top: 0,
          width: 180, height: 1300,
          marginLeft: -90,
          transformOrigin: '50% 100%',
          transform: `rotate(${b.angle}deg)`,
          background: 'linear-gradient(180deg, rgba(245,215,110,0.22) 0%, transparent 65%)',
          mixBlendMode: 'screen',
        }}/>
      ))}
    </div>
  );
}

function mulberry32(seed: number) {
  let a = seed;
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
