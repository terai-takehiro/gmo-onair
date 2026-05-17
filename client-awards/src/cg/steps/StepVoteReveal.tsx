import { useEffect, useMemo, useRef, useState } from 'react';
import type { CgMappedEntry, VoteDisplay, OneshotStyle } from '../types';
import StepOneShot from './StepOneShot';

interface Props {
  entries: CgMappedEntry[];
  winner: CgMappedEntry | null;
  phase: 0 | 1 | 2;
  display: VoteDisplay;
  categoryParent: string;
  categoryChild: string;
  lang: 'ja' | 'en';
  oneshotStyle?: OneshotStyle;
}

/**
 * 投票結果リビール (棒グラフなし、数字のみ)。
 * Phase 0: 3 枚のカードに名前/写真と"ランダムに変化する数字"。
 * Phase 1: TAKE で数字が実値にカウントアップ → 確定。
 * Phase 2: No.1 演出は既存 StepOneShot に委譲。
 */
export default function StepVoteReveal({
  entries, winner, phase, display, categoryParent, categoryChild, lang, oneshotStyle = 'classic',
}: Props) {
  const top3 = useMemo(
    () => entries.filter((e) => e.rank >= 1 && e.rank <= 3),
    [entries],
  );
  const totalVotes = useMemo(() => top3.reduce((s, e) => s + (e.voteCount ?? 0), 0), [top3]);
  const actualValues = top3.map((e) => e.voteCount ?? 0);

  // Phase 2: 既存 No.1 演出 (StepOneShot) を再利用
  if (phase === 2 && winner) {
    return (
      <StepOneShot
        entry={winner}
        style={oneshotStyle}
        categoryParent={categoryParent}
        categoryChild={categoryChild}
        lang={lang}
        hidePoints
      />
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <Backdrop />
      <Header categoryParent={categoryParent} categoryChild={categoryChild} />
      <NumberCards
        cards={top3}
        actualValues={actualValues}
        totalVotes={totalVotes}
        display={display}
        phase={phase as 0 | 1}
        lang={lang}
      />
    </div>
  );
}

// ─── ステージ背景 ─────────────────────────────────────────────
function Backdrop() {
  const particles = useMemo(() => {
    const rnd = mulberry32(20260710);
    return Array.from({ length: 26 }).map(() => ({
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
        @keyframes vrParticleFloat {
          0%   { transform: translate(0, 0)              scale(1);   opacity: 0; }
          15%  { opacity: 0.85; }
          85%  { opacity: 0.55; }
          100% { transform: translate(var(--drift,0), -680px) scale(0.3); opacity: 0; }
        }
        @keyframes vrSpotPulse { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }
      `}</style>
      <div style={{
        position: 'absolute', inset: 0,
        background: `
          radial-gradient(ellipse 75% 70% at 50% 60%, rgba(75,22,22,0.85), rgba(8,4,6,1) 75%),
          linear-gradient(180deg, #1a0508 0%, #050203 100%)
        `,
      }}/>
      <div style={{
        position: 'absolute',
        left: '50%', top: 0, width: 1400, height: 1080, marginLeft: -700,
        background: 'radial-gradient(ellipse 60% 100% at 50% 0%, rgba(255,225,170,0.18), transparent 70%)',
        animation: 'vrSpotPulse 4s ease-in-out infinite',
      }}/>
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: 220,
        background: 'linear-gradient(180deg, transparent, rgba(245,215,110,0.08) 50%, transparent)',
      }}/>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {particles.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={p.size} fill="#ffe9b8" opacity={0.5}
            style={{
              filter: 'drop-shadow(0 0 4px rgba(255,225,170,0.9))',
              animation: `vrParticleFloat ${p.dur}s linear infinite`,
              animationDelay: `${p.delay}s`,
              ['--drift' as never]: `${p.drift}px`,
            }}
          />
        ))}
      </svg>
    </>
  );
}

function Header({ categoryParent, categoryChild }: { categoryParent: string; categoryChild: string }) {
  return (
    <div style={{
      position: 'absolute', top: 80, left: 0, right: 0,
      textAlign: 'center', pointerEvents: 'none',
    }}>
      <div style={{
        fontFamily: "'Roboto Condensed', sans-serif",
        fontSize: 18,
        letterSpacing: '0.75em',
        color: 'rgba(245,215,110,0.95)',
        marginBottom: 12,
      }}>
        &mdash; &nbsp; VOTE REVEAL &nbsp; &mdash;
      </div>
      <div style={{
        fontFamily: "'Noto Sans JP', sans-serif",
        fontWeight: 700,
        fontSize: 54,
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

// ─── 3 枚の数字カード ─────────────────────────────────────────
function NumberCards({
  cards, actualValues, totalVotes, display, phase, lang,
}: {
  cards: CgMappedEntry[];
  actualValues: number[];
  totalVotes: number;
  display: VoteDisplay;
  phase: 0 | 1;  // phase 2 は StepOneShot に切り替わる
  lang: 'ja' | 'en';
}) {
  if (cards.length === 0) {
    return (
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(245,215,110,0.6)', fontSize: 26, letterSpacing: '0.2em',
      }}>TOP 3 が設定されていません</div>
    );
  }
  const slots = [
    { cx: 1920 * 0.5 - 540 },
    { cx: 1920 * 0.5 },
    { cx: 1920 * 0.5 + 540 },
  ];
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 280, height: 700 }}>
      {cards.map((c, i) => (
        <CandidateCard
          key={c.id}
          cx={slots[i]?.cx ?? 960}
          entry={c}
          actual={actualValues[i]}
          totalVotes={totalVotes}
          display={display}
          phase={phase}
          lang={lang}
        />
      ))}
    </div>
  );
}

const CARD_W = 460;
const CARD_H = 580;

function CandidateCard({
  cx, entry, actual, totalVotes, display, phase, lang,
}: {
  cx: number;
  entry: CgMappedEntry;
  actual: number;
  totalVotes: number;
  display: VoteDisplay;
  phase: 0 | 1;
  lang: 'ja' | 'en';
}) {
  const name = lang === 'en' ? (entry.nameEn || entry.name) : entry.name;
  const company = lang === 'en' ? (entry.orgEn || entry.company) : entry.company;
  const targetValue = display === 'percent'
    ? (totalVotes > 0 ? Math.round((actual / totalVotes) * 100) : 0)
    : actual;
  const unit = display === 'percent' ? '%' : '票';

  // 表示値: phase 0 はランダム、phase 1 は実値へカウントアップ
  const [shown, setShown] = useState<number>(0);
  const animRef = useRef<number | null>(null);
  const phaseRef = useRef(phase);

  useEffect(() => {
    phaseRef.current = phase;
    if (animRef.current != null) {
      window.clearInterval(animRef.current);
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }

    if (phase === 0) {
      // ランダム数字: 滑らかにロール (rAF で常時補間)
      const seed = display === 'percent' ? 100 : Math.max(targetValue * 2, 999);
      let current = Math.random() * seed;
      let target = Math.random() * seed;
      let lastSwap = performance.now();
      const tick = (now: number) => {
        if (now - lastSwap > 280) {
          target = Math.random() * seed;
          lastSwap = now;
        }
        current += (target - current) * 0.18;
        setShown(Math.max(0, Math.floor(current)));
        animRef.current = requestAnimationFrame(tick);
      };
      animRef.current = requestAnimationFrame(tick);
      return () => {
        if (animRef.current != null) cancelAnimationFrame(animRef.current);
      };
    }

    // phase 1: 実値へカウントアップ (2200ms)
    const start = performance.now();
    const dur = 2200;
    const startVal = shown; // 直前のランダム値から
    const tickRaf = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);  // easeOutCubic
      setShown(Math.round(startVal + (targetValue - startVal) * eased));
      if (t < 1) animRef.current = requestAnimationFrame(tickRaf);
      else setShown(targetValue);
    };
    animRef.current = requestAnimationFrame(tickRaf);
    return () => {
      if (animRef.current != null) cancelAnimationFrame(animRef.current);
    };
  }, [phase, targetValue, display]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      position: 'absolute',
      left: cx - CARD_W / 2,
      top: 0,
      width: CARD_W,
      height: CARD_H,
    }}>
      {/* 写真 */}
      <div style={{
        position: 'absolute',
        left: (CARD_W - 280) / 2,
        top: 0,
        width: 280, height: 360,
        background: 'linear-gradient(180deg, #181012, #0a0608)',
        border: '1px solid rgba(245,215,110,0.85)',
        boxShadow: '0 18px 36px rgba(0,0,0,0.75), 0 0 28px rgba(245,215,110,0.18)',
        overflow: 'hidden',
      }}>
        {entry.photo ? (
          <img src={entry.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
        ) : (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Roboto Condensed', sans-serif",
            fontSize: 140, color: 'rgba(245,215,110,0.3)',
          }}>—</div>
        )}
        <div style={{
          position: 'absolute', inset: 4,
          border: '1px solid rgba(245,215,110,0.28)',
          pointerEvents: 'none',
        }}/>
      </div>

      {/* 名前 + 会社 */}
      <div style={{
        position: 'absolute',
        left: 0, right: 0,
        top: 374,
        textAlign: 'center',
        padding: '0 12px',
      }}>
        <div style={{
          fontFamily: "'Noto Sans JP', sans-serif",
          fontWeight: 700,
          fontSize: 30,
          color: '#f8eccc',
          letterSpacing: '0.05em',
          textShadow: '0 2px 10px rgba(0,0,0,0.85)',
          lineHeight: 1.15,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>{name}</div>
        {company && (
          <div style={{
            marginTop: 4,
            fontFamily: "'Noto Sans JP', sans-serif",
            fontSize: 17,
            color: 'rgba(245,215,110,0.85)',
            letterSpacing: '0.18em',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{company}</div>
        )}
      </div>

      {/* 数字 (固定幅でレイアウトが揺れないように) */}
      <div style={{
        position: 'absolute',
        left: 0, right: 0,
        top: 458,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          padding: '8px 26px',
          width: 360,
          justifyContent: 'center',
          background: 'rgba(8,4,8,0.7)',
          border: '1px solid rgba(245,215,110,0.6)',
          boxShadow: '0 6px 24px rgba(0,0,0,0.55), 0 0 24px rgba(245,215,110,0.18)',
        }}>
          <span style={{
            fontFamily: "'Roboto Condensed', sans-serif",
            fontWeight: 700,
            fontSize: 92,
            color: '#fff',
            letterSpacing: '-0.01em',
            lineHeight: 1,
            textShadow: '0 2px 14px rgba(0,0,0,0.85), 0 0 18px rgba(245,215,110,0.3)',
            fontVariantNumeric: 'tabular-nums',
            display: 'inline-block',
            textAlign: 'right',
            minWidth: '3.6ch',
          }}>
            {shown.toLocaleString()}
          </span>
          <span style={{
            fontFamily: "'Roboto Condensed', sans-serif",
            fontWeight: 700,
            fontSize: 26,
            color: 'rgba(245,215,110,0.9)',
            letterSpacing: '0.18em',
            lineHeight: 1,
          }}>{unit}</span>
        </div>
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
