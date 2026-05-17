import { useEffect, useMemo, useState, useRef } from 'react';
import type { CgMappedEntry, VoteDisplay } from '../types';

interface Props {
  entries: CgMappedEntry[];
  winner: CgMappedEntry | null;
  phase: 0 | 1 | 2;
  display: VoteDisplay;
  categoryParent: string;
  categoryChild: string;
  lang: 'ja' | 'en';
}

/**
 * "Theatrical Reveal" 演出
 * Phase 0 : 3 枚の写真カードが暗いステージに並ぶ。光柱は短く揺らぐ。数値は "—"。
 * Phase 1 : 写真の背後から光の柱が伸び上がる。数値カウントアップ。背景に薄い回転光。
 * Phase 2 : 敗者カードが沈み、勝者カードがセンターへ滑り込み拡大。タイトル + 名前。
 */
export default function StepVoteReveal({
  entries, winner, phase, display, categoryParent, categoryChild, lang,
}: Props) {
  const top3 = useMemo(
    () => entries.filter((e) => e.rank >= 1 && e.rank <= 3),
    [entries],
  );
  const totalVotes = useMemo(
    () => top3.reduce((s, e) => s + (e.voteCount ?? 0), 0),
    [top3],
  );

  const actualValues = top3.map((e) => e.voteCount ?? 0);
  const maxActual = Math.max(1, ...actualValues);

  function pctOf(v: number) {
    if (display === 'percent') return totalVotes > 0 ? (v / totalVotes) * 100 : 0;
    return (v / maxActual) * 100;
  }

  // Phase 0 shake values
  const [shakeVals, setShakeVals] = useState<number[]>(() => top3.map(() => 25));
  useEffect(() => {
    if (phase !== 0) return;
    const id = window.setInterval(() => {
      setShakeVals(top3.map(() => 18 + Math.random() * 35));
    }, 320);
    return () => window.clearInterval(id);
  }, [phase, top3.length]);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <StageBackdrop />

      <Header
        categoryParent={categoryParent}
        categoryChild={categoryChild}
        phase={phase}
      />

      <CardsStage
        cards={top3}
        winnerId={winner?.id ?? null}
        phase={phase}
        getLivePct={(i) => phase === 0 ? shakeVals[i] : pctOf(actualValues[i])}
        getActual={(i) => actualValues[i]}
        totalVotes={totalVotes}
        display={display}
        lang={lang}
      />

      {phase === 2 && winner && (
        <WinnerOverlay winner={winner} lang={lang} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Stage Backdrop: 深い舞台幕 + 上からの薄いスポット + ゆっくり漂う粒子
// ─────────────────────────────────────────────────────────────
function StageBackdrop() {
  const particles = useMemo(() => {
    const rnd = mulberry32(20260601);
    return Array.from({ length: 28 }).map(() => ({
      x: rnd() * 1920,
      y: 540 + rnd() * 540,
      size: 1 + rnd() * 2,
      delay: -rnd() * 8,
      dur: 12 + rnd() * 10,
      drift: -40 + rnd() * 80,
    }));
  }, []);
  return (
    <>
      <style>{`
        @keyframes svParticleFloat {
          0%   { transform: translate(0, 0)              scale(1);   opacity: 0; }
          15%  { opacity: 0.9; }
          85%  { opacity: 0.6; }
          100% { transform: translate(var(--drift,0), -680px) scale(0.3); opacity: 0; }
        }
        @keyframes svSpotPulse {
          0%, 100% { opacity: 0.65; }
          50%      { opacity: 0.9; }
        }
      `}</style>

      {/* ベース: 深いバーガンディ → 黒 */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `
          radial-gradient(ellipse 75% 70% at 50% 60%, rgba(70,18,18,0.85), rgba(8,4,6,1) 75%),
          linear-gradient(180deg, #1a0508 0%, #050203 100%)
        `,
      }}/>

      {/* 上からの薄い円錐スポット */}
      <div style={{
        position: 'absolute',
        left: '50%', top: 0,
        width: 1400, height: 1080,
        marginLeft: -700,
        background: 'radial-gradient(ellipse 60% 100% at 50% 0%, rgba(255,225,170,0.18), transparent 70%)',
        animation: 'svSpotPulse 4s ease-in-out infinite',
        pointerEvents: 'none',
      }}/>

      {/* 床のリフレクション */}
      <div style={{
        position: 'absolute',
        left: 0, right: 0, bottom: 0,
        height: 220,
        background: 'linear-gradient(180deg, transparent, rgba(245,215,110,0.08) 50%, transparent)',
        pointerEvents: 'none',
      }}/>

      {/* ゴールド粒子 (粉雪) */}
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {particles.map((p, i) => (
          <circle
            key={i}
            cx={p.x} cy={p.y} r={p.size}
            fill="#ffe9b8" opacity={0.5}
            style={{
              filter: 'drop-shadow(0 0 4px rgba(255,225,170,0.9))',
              animation: `svParticleFloat ${p.dur}s linear infinite`,
              animationDelay: `${p.delay}s`,
              ['--drift' as never]: `${p.drift}px`,
            }}
          />
        ))}
      </svg>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Header: タイトル区画 (上部に配置)
// ─────────────────────────────────────────────────────────────
function Header({ categoryParent, categoryChild, phase }: {
  categoryParent: string; categoryChild: string; phase: 0 | 1 | 2;
}) {
  // phase=2 では消えて winner overlay に譲る
  const fade = phase === 2 ? 0 : 1;
  return (
    <div
      style={{
        position: 'absolute',
        top: 70,
        left: 0, right: 0,
        textAlign: 'center',
        opacity: fade,
        transition: 'opacity 600ms ease',
        pointerEvents: 'none',
      }}
    >
      <div style={{
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: 16,
        letterSpacing: '0.75em',
        color: 'rgba(245,215,110,0.95)',
        marginBottom: 12,
      }}>
        &mdash; &nbsp; VOTE REVEAL &nbsp; &mdash;
      </div>
      <div style={{
        fontFamily: "'Noto Serif JP', 'Noto Sans JP', serif",
        fontWeight: 700,
        fontSize: 50,
        letterSpacing: '0.14em',
        color: '#f8eccc',
        textShadow: '0 4px 18px rgba(0,0,0,0.85)',
        lineHeight: 1.1,
      }}>
        {categoryChild || categoryParent}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CardsStage: 3 つの写真カード + 背後の光の柱
// ─────────────────────────────────────────────────────────────
function CardsStage({
  cards, winnerId, phase, getLivePct, getActual, totalVotes, display, lang,
}: {
  cards: CgMappedEntry[];
  winnerId: string | null;
  phase: 0 | 1 | 2;
  getLivePct: (i: number) => number;
  getActual: (i: number) => number;
  totalVotes: number;
  display: VoteDisplay;
  lang: 'ja' | 'en';
}) {
  if (cards.length === 0) {
    return (
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(245,215,110,0.6)', fontSize: 26, letterSpacing: '0.2em',
      }}>
        TOP 3 が設定されていません
      </div>
    );
  }

  // 3 枚の中央 x 座標
  const slots = [
    { x: 1920 * 0.5 - 540 },
    { x: 1920 * 0.5 - 180 },
    { x: 1920 * 0.5 + 180 },
  ];

  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 240, bottom: 60 }}>
      {cards.map((c, i) => {
        const slot = slots[i];
        const isWinner = winnerId === c.id;
        const isLoser = phase === 2 && !isWinner;
        return (
          <CandidateColumn
            key={c.id}
            entry={c}
            cx={slot.x + 180}
            phase={phase}
            isWinner={isWinner}
            isLoser={isLoser}
            livePct={getLivePct(i)}
            actual={getActual(i)}
            totalVotes={totalVotes}
            display={display}
            lang={lang}
          />
        );
      })}
    </div>
  );
}

function CandidateColumn({
  entry, cx, phase, isWinner, isLoser, livePct, actual, totalVotes, display, lang,
}: {
  entry: CgMappedEntry;
  cx: number;
  phase: 0 | 1 | 2;
  isWinner: boolean;
  isLoser: boolean;
  livePct: number;
  actual: number;
  totalVotes: number;
  display: VoteDisplay;
  lang: 'ja' | 'en';
}) {
  const CARD_W = 320;
  const CARD_H = 410;
  const PILLAR_W = 220;
  const PILLAR_MAX_H = 540;
  const COLUMN_BOTTOM = 80; // bottom margin within container

  const name = lang === 'en' ? (entry.nameEn || entry.name) : entry.name;
  const company = lang === 'en' ? (entry.orgEn || entry.company) : entry.company;

  const pillarH = Math.max(8, (livePct / 100) * PILLAR_MAX_H);
  const transition = phase === 0
    ? 'height 320ms ease-out'
    : 'height 2200ms cubic-bezier(.18,.85,.32,1)';

  const displayValue = phase === 0
    ? '—'
    : display === 'percent'
      ? `${totalVotes > 0 ? Math.round((actual / totalVotes) * 100) : 0}%`
      : `${actual.toLocaleString()}`;
  const displayUnit = phase !== 0 && display === 'count' ? '票' : '';

  // phase=2: loser はフェード/沈み、winner は overlay が引き継ぐので隠す (滑らかな繋ぎ)
  const cardOpacity = isLoser ? 0 : (isWinner && phase === 2 ? 0 : 1);
  const cardTranslate = isLoser ? 'translateY(60px)' : 'translateY(0)';

  return (
    <div
      style={{
        position: 'absolute',
        left: cx - CARD_W / 2,
        bottom: COLUMN_BOTTOM,
        width: CARD_W,
        opacity: cardOpacity,
        transform: cardTranslate,
        transition: 'opacity 900ms ease, transform 900ms cubic-bezier(.4,0,.2,1)',
      }}
    >
      {/* 光の柱 (カードの後ろから伸び上がる) */}
      <div
        style={{
          position: 'absolute',
          left: (CARD_W - PILLAR_W) / 2,
          bottom: 0,
          width: PILLAR_W,
          height: pillarH,
          background: `
            linear-gradient(180deg,
              rgba(255,238,200,0.65) 0%,
              rgba(245,215,110,0.55) 30%,
              rgba(200,160,70,0.35) 70%,
              rgba(120,80,30,0.15) 100%
            )
          `,
          filter: 'blur(0.5px)',
          boxShadow: '0 0 80px rgba(245,215,110,0.45), 0 0 32px rgba(255,225,170,0.35)',
          transition,
          mixBlendMode: 'screen',
          maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.85) 50%, rgba(0,0,0,0) 100%)',
          WebkitMaskImage: 'linear-gradient(180deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.85) 50%, rgba(0,0,0,0) 100%)',
        }}
      />
      {/* 柱の芯 (細く明るく) */}
      <div
        style={{
          position: 'absolute',
          left: (CARD_W - 6) / 2,
          bottom: 0,
          width: 6,
          height: pillarH,
          background: 'linear-gradient(180deg, rgba(255,250,225,0.95) 0%, rgba(245,215,110,0.5) 100%)',
          boxShadow: '0 0 24px rgba(255,235,180,0.8)',
          transition,
          mixBlendMode: 'screen',
        }}
      />
      {/* 床のスポット (柱の根元) */}
      <div
        style={{
          position: 'absolute',
          left: '50%', bottom: -16,
          width: 300, height: 50,
          marginLeft: -150,
          background: 'radial-gradient(ellipse at center, rgba(245,215,110,0.5), transparent 65%)',
          filter: 'blur(4px)',
          mixBlendMode: 'screen',
          pointerEvents: 'none',
        }}
      />

      {/* 数値カード (バーの上端) */}
      <div
        style={{
          position: 'absolute',
          left: 0, right: 0,
          bottom: pillarH + 14,
          textAlign: 'center',
          transition,
          pointerEvents: 'none',
        }}
      >
        <div style={{
          display: 'inline-flex',
          alignItems: 'baseline',
          gap: 6,
          padding: '6px 18px',
          borderRadius: 4,
          background: 'rgba(8,4,8,0.78)',
          border: '1px solid rgba(245,215,110,0.65)',
          boxShadow: '0 4px 18px rgba(0,0,0,0.6)',
        }}>
          <span style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: phase === 1 ? 56 : 42,
            color: '#f8eccc',
            letterSpacing: '0.04em',
            lineHeight: 1,
            transition: 'font-size 400ms ease',
          }}>{displayValue}</span>
          {displayUnit && (
            <span style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 18,
              color: 'rgba(245,215,110,0.85)',
              letterSpacing: '0.28em',
            }}>{displayUnit}</span>
          )}
        </div>
      </div>

      {/* 写真カード */}
      <PhotoCard entry={entry} w={CARD_W} h={CARD_H} name={name} company={company} />
    </div>
  );
}

function PhotoCard({ entry, w, h, name, company }: {
  entry: CgMappedEntry; w: number; h: number; name: string; company: string;
}) {
  return (
    <div style={{ position: 'relative', width: w, height: h, marginTop: 0 }}>
      {/* 写真フレーム */}
      <div style={{
        position: 'absolute',
        left: (w - 240) / 2,
        top: 0,
        width: 240, height: 320,
        background: 'linear-gradient(180deg, #181012, #0a0608)',
        border: '1px solid rgba(245,215,110,0.85)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.75), 0 0 24px rgba(245,215,110,0.15)',
        overflow: 'hidden',
      }}>
        {entry.photo ? (
          <img src={entry.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 120, color: 'rgba(245,215,110,0.3)',
          }}>—</div>
        )}
        {/* 内側のホエアライン */}
        <div style={{
          position: 'absolute', inset: 4,
          border: '1px solid rgba(245,215,110,0.25)',
          pointerEvents: 'none',
        }}/>
      </div>

      {/* 名前 + 会社 */}
      <div style={{
        position: 'absolute',
        left: 0, right: 0,
        top: 336,
        textAlign: 'center',
        pointerEvents: 'none',
      }}>
        <div style={{
          fontFamily: "'Noto Serif JP', 'Noto Sans JP', serif",
          fontWeight: 700,
          fontSize: 28,
          color: '#f8eccc',
          letterSpacing: '0.05em',
          textShadow: '0 2px 10px rgba(0,0,0,0.85)',
          lineHeight: 1.15,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          padding: '0 8px',
        }}>{name}</div>
        {company && (
          <div style={{
            marginTop: 4,
            fontFamily: "'Noto Serif JP', 'Noto Sans JP', serif",
            fontSize: 15,
            color: 'rgba(245,215,110,0.85)',
            letterSpacing: '0.18em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            padding: '0 8px',
          }}>{company}</div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// WinnerOverlay: 勝者を中央に大写し
// ─────────────────────────────────────────────────────────────
function WinnerOverlay({ winner, lang }: { winner: CgMappedEntry; lang: 'ja' | 'en' }) {
  const name = lang === 'en' ? (winner.nameEn || winner.name) : winner.name;
  const company = lang === 'en' ? (winner.orgEn || winner.company) : winner.company;
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setStage(1), 60);    // 写真 fadeIn + curtain
    const t2 = setTimeout(() => setStage(2), 1100);  // タイトル
    const t3 = setTimeout(() => setStage(3), 1900);  // 名前
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }}>
      <style>{`
        @keyframes svWinFadeUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes svWinPhoto  { from { opacity: 0; transform: scale(.86); filter: blur(8px); } to { opacity: 1; transform: scale(1); filter: blur(0); } }
        @keyframes svWinRays   { from { opacity: 0; transform: scale(.6) rotate(0deg); } to { opacity: 1; transform: scale(1) rotate(180deg); } }
        @keyframes svWinHair   { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes svWinSpotPulse { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }
      `}</style>

      {/* オーバーレイ暗幕 */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 60% 70% at 50% 50%, rgba(80,35,25,0.92), rgba(4,2,3,1) 78%)',
        opacity: stage >= 1 ? 1 : 0,
        transition: 'opacity 700ms ease',
      }}/>

      {/* 後光 (ゆっくり回転) */}
      <div style={{
        position: 'absolute',
        left: '50%', top: '50%',
        width: 1400, height: 1400, marginLeft: -700, marginTop: -700,
        background: 'conic-gradient(from 0deg, rgba(245,215,110,0.18) 0deg, transparent 24deg, rgba(245,215,110,0.18) 48deg, transparent 72deg, rgba(245,215,110,0.18) 96deg, transparent 120deg, rgba(245,215,110,0.18) 144deg, transparent 168deg, rgba(245,215,110,0.18) 192deg, transparent 216deg, rgba(245,215,110,0.18) 240deg, transparent 264deg, rgba(245,215,110,0.18) 288deg, transparent 312deg, rgba(245,215,110,0.18) 336deg, transparent 360deg)',
        maskImage: 'radial-gradient(circle, #000 30%, transparent 65%)',
        WebkitMaskImage: 'radial-gradient(circle, #000 30%, transparent 65%)',
        animation: stage >= 1 ? 'svWinRays 30s linear infinite' : 'none',
        opacity: stage >= 1 ? 0.95 : 0,
        transition: 'opacity 900ms ease',
        mixBlendMode: 'screen',
      }}/>

      {/* 中央の柔らかいスポット */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(circle at 50% 48%, rgba(255,230,180,0.18), transparent 45%)',
        animation: 'svWinSpotPulse 4s ease-in-out infinite',
      }}/>

      {/* THE WINNER ラベル */}
      <div style={{
        position: 'absolute',
        top: 150, left: 0, right: 0,
        textAlign: 'center',
        opacity: stage >= 2 ? 1 : 0,
        transform: stage >= 2 ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity 900ms ease, transform 900ms ease',
      }}>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 18,
          letterSpacing: '0.75em',
          color: 'rgba(245,215,110,0.95)',
        }}>
          &mdash; &nbsp; THE WINNER &nbsp; &mdash;
        </div>
      </div>

      {/* 写真 (中央) */}
      <div style={{
        position: 'absolute',
        left: '50%', top: 250,
        marginLeft: -240, // 480 / 2
        width: 480, height: 480,
        opacity: stage >= 1 ? 1 : 0,
        animation: stage >= 1 ? 'svWinPhoto 1200ms cubic-bezier(.2,.85,.3,1) forwards' : 'none',
      }}>
        {/* 細い金枠 + 外側にもう一本 */}
        <div style={{
          position: 'absolute', inset: -10,
          border: '1px solid rgba(245,215,110,0.5)',
        }}/>
        <div style={{
          position: 'absolute', inset: 0,
          border: '2px solid rgba(245,215,110,0.9)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.85), 0 0 80px rgba(245,215,110,0.4)',
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
              fontSize: 220, color: 'rgba(245,215,110,0.32)',
            }}>—</div>
          )}
        </div>
      </div>

      {/* ヘアライン + 名前 */}
      <div style={{
        position: 'absolute',
        left: '50%', top: 780,
        transform: 'translateX(-50%)',
        width: 280, height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(245,215,110,0.85), transparent)',
        transformOrigin: 'center',
        opacity: stage >= 3 ? 1 : 0,
        animation: stage >= 3 ? 'svWinHair 700ms ease-out forwards' : 'none',
      }}/>

      <div style={{
        position: 'absolute',
        left: 0, right: 0, top: 810,
        textAlign: 'center',
        opacity: stage >= 3 ? 1 : 0,
        transform: stage >= 3 ? 'translateY(0)' : 'translateY(24px)',
        transition: 'opacity 1100ms ease 150ms, transform 1100ms cubic-bezier(.2,.85,.3,1) 150ms',
      }}>
        <div style={{
          fontFamily: "'Noto Serif JP', 'Noto Sans JP', serif",
          fontWeight: 900,
          fontSize: 96,
          letterSpacing: '0.08em',
          lineHeight: 1.05,
          background: 'linear-gradient(180deg, #fff7d8 0%, #f5e4a4 40%, #c8a04a 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          textShadow: '0 2px 30px rgba(0,0,0,0.7)',
          filter: 'drop-shadow(0 0 24px rgba(245,215,110,0.4))',
        }}>{name}</div>
        {company && (
          <div style={{
            marginTop: 14,
            fontFamily: "'Noto Serif JP', 'Noto Sans JP', serif",
            fontSize: 26,
            color: 'rgba(245,215,110,0.95)',
            letterSpacing: '0.3em',
          }}>{company}</div>
        )}
      </div>
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

// 未使用 import 警告除け
void useRef;
