import { useEffect, useMemo, useRef, useState } from 'react';
import type { CgSurveyChoice, CgMappedEntry } from '../types';
import { CondenseText } from '../components/CondenseText';
import StepOneShot from './StepOneShot';
import type { OneshotStyle } from '../types';

/**
 * v2.9.63: 連動アンケートの No.1 発表演出 (旧 QuizCG の reveal/winner を移管)。
 * ランキングCG の survey-oneshot ステップで使用。賞の最後にフルスクリーンで出す。
 *
 * phase 0: ランダム数字ロール (rAF + lerp、280ms 周期で target 再サンプル)
 * phase 1: 実値スナップ + 数字ピル拡大 + vrNumberPunch でドン!確定
 * phase 2: 最多得票の選択肢を StepOneShot フルスクリーン大賞演出で発表
 */
interface Props {
  choices: CgSurveyChoice[];        // choice_count に絞った配列
  title: string;                     // 賞タイトル (= quiz.title / link カテゴリの賞名)
  display: 'count' | 'percent';
  phase: 0 | 1 | 2;
  oneshotStyle: OneshotStyle;
  lang?: 'ja' | 'en';
  transparent?: boolean;
}

const GOLD_BRIGHT = '#FFE8A8';

export default function StepSurveyReveal({
  choices, title, display, phase, oneshotStyle, lang = 'ja', transparent = false,
}: Props) {
  // phase 2 = 大賞フルスクリーン
  if (phase === 2) {
    const winner = choices.reduce(
      (max, c) => ((c.vote_count ?? 0) > (max?.vote_count ?? -1) ? c : max),
      choices[0] as CgSurveyChoice | undefined,
    );
    if (!winner) return null;
    const mapped: CgMappedEntry = {
      id: String(winner.position),
      rank: 1,
      name: (lang === 'en' ? winner.name_en : winner.name) || winner.name || '',
      nameEn: winner.name_en ?? undefined,
      company: (lang === 'en' ? winner.company_en : winner.company) || winner.company || '',
      orgEn: winner.company_en ?? undefined,
      points: 0,
      photo: winner.photo_data_url ?? undefined,
      nominationTitle: winner.nomination_title ?? undefined,
      nominationTitleEn: winner.nomination_title_en ?? undefined,
    };
    return (
      <div style={{ position: 'absolute', inset: 0, fontFamily: "'Noto Sans JP', sans-serif" }}>
        {!transparent && <Backdrop transparent={false} />}
        <StepOneShot entry={mapped} style={oneshotStyle} categoryChild={title} lang={lang} hidePoints />
      </div>
    );
  }

  const totalVotes = choices.reduce((s, c) => s + (c.vote_count ?? 0), 0);
  const actualValues = choices.map((c) => c.vote_count ?? 0);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: "'Noto Sans JP', sans-serif" }}>
      <Backdrop transparent={transparent} />
      <Header categoryChild={title} />
      <NumberCards
        cards={choices}
        actualValues={actualValues}
        totalVotes={totalVotes}
        display={display}
        phase={phase as 0 | 1}
        lang={lang}
      />
    </div>
  );
}

// ── 背景 (軽量パーティクル、モバイル Safari 対応で box-shadow ベース) ─────
function Backdrop({ transparent }: { transparent: boolean }) {
  const particles = useMemo(() => {
    const rnd = mulberry32(20260710);
    return Array.from({ length: 12 }).map(() => ({
      x: rnd() * 1920,
      y: 540 + rnd() * 540,
      size: 2 + rnd() * 2,
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
      {!transparent && (
        <div style={{
          position: 'absolute', inset: 0,
          background: `
            radial-gradient(ellipse 75% 70% at 50% 60%, rgba(75,22,22,0.85), rgba(8,4,6,1) 75%),
            linear-gradient(180deg, #1a0508 0%, #050203 100%)
          `,
        }}/>
      )}
      <div style={{
        position: 'absolute',
        left: '50%', top: 0, width: 1400, height: 1080, marginLeft: -700,
        background: 'radial-gradient(ellipse 60% 100% at 50% 0%, rgba(255,225,170,0.18), transparent 70%)',
        animation: 'vrSpotPulse 4s ease-in-out infinite',
        pointerEvents: 'none',
      }}/>
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: 220,
        background: 'linear-gradient(180deg, transparent, rgba(245,215,110,0.08) 50%, transparent)',
        pointerEvents: 'none',
      }}/>
      {particles.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: p.x - p.size,
            top: p.y - p.size,
            width: p.size * 2, height: p.size * 2,
            borderRadius: '50%',
            background: '#ffe9b8',
            boxShadow: `0 0 ${p.size * 3}px rgba(255,225,170,0.85)`,
            animation: `vrParticleFloat ${p.dur}s linear infinite`,
            animationDelay: `${p.delay}s`,
            ['--drift' as never]: `${p.drift}px`,
            pointerEvents: 'none',
          }}
        />
      ))}
    </>
  );
}

function Header({ categoryChild }: { categoryChild: string }) {
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
      <CondenseText style={{
        fontFamily: "'Noto Sans JP', sans-serif",
        fontWeight: 700,
        fontSize: 54,
        letterSpacing: '0.14em',
        color: '#f8eccc',
        textShadow: '0 4px 18px rgba(0,0,0,0.85)',
        lineHeight: 1.1,
        textAlign: 'center',
        padding: '0 100px',
      }} min={0.4}>
        {categoryChild}
      </CondenseText>
    </div>
  );
}

function NumberCards({ cards, actualValues, totalVotes, display, phase, lang }: {
  cards: CgSurveyChoice[];
  actualValues: number[];
  totalVotes: number;
  display: 'count' | 'percent';
  phase: 0 | 1;
  lang: 'ja' | 'en';
}) {
  if (cards.length === 0) {
    return (
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(245,215,110,0.6)', fontSize: 26, letterSpacing: '0.2em',
      }}>選択肢が設定されていません</div>
    );
  }
  const slotsByN: Record<number, number[]> = {
    1: [960],
    2: [1920 * 0.5 - 280, 1920 * 0.5 + 280],
    3: [1920 * 0.5 - 540, 1920 * 0.5, 1920 * 0.5 + 540],
    4: [1920 * 0.5 - 690, 1920 * 0.5 - 230, 1920 * 0.5 + 230, 1920 * 0.5 + 690],
  };
  const slots = slotsByN[cards.length] ?? cards.map((_, i) => 1920 * (i + 0.5) / cards.length);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 280, height: 700 }}>
      {cards.map((c, i) => (
        <CandidateCard
          key={c.position}
          cx={slots[i] ?? 960}
          choice={c}
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

function CandidateCard({ cx, choice, actual, totalVotes, display, phase, lang }: {
  cx: number;
  choice: CgSurveyChoice;
  actual: number;
  totalVotes: number;
  display: 'count' | 'percent';
  phase: 0 | 1;
  lang: 'ja' | 'en';
}) {
  const name = (lang === 'en' ? choice.name_en : choice.name) || choice.name || '';
  const company = (lang === 'en' ? choice.company_en : choice.company) || choice.company || '';
  const targetValue = display === 'percent'
    ? (totalVotes > 0 ? Math.round((actual / totalVotes) * 100) : 0)
    : actual;
  const unit = display === 'percent' ? '%' : '票';

  const fitNumFont = (p: 0 | 1, str: string) => {
    const base = p === 1 ? 132 : 92;
    const availW = p === 1 ? 480 - 38 * 2 - 60 : 360 - 26 * 2 - 44;
    return Math.min(base, Math.floor(availW / (Math.max(str.length, 1) * 0.52)));
  };

  const [shown, setShown] = useState<number>(0);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    if (animRef.current != null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
    if (phase === 0) {
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
      return () => { if (animRef.current != null) cancelAnimationFrame(animRef.current); };
    }
    setShown(targetValue);
    return;
  }, [phase, targetValue, display]);

  return (
    <div style={{
      position: 'absolute',
      left: cx - CARD_W / 2, top: 0,
      width: CARD_W, height: CARD_H,
    }}>
      {/* 写真 */}
      <div style={{
        position: 'absolute',
        left: (CARD_W - 280) / 2, top: 0,
        width: 280, height: 360,
        background: 'linear-gradient(180deg, #181012, #0a0608)',
        border: '1px solid rgba(245,215,110,0.85)',
        boxShadow: '0 18px 36px rgba(0,0,0,0.75), 0 0 28px rgba(245,215,110,0.18)',
        overflow: 'hidden',
      }}>
        {choice.photo_data_url ? (
          <img src={choice.photo_data_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
        ) : (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Roboto Condensed', sans-serif",
            fontSize: 140, color: 'rgba(245,215,110,0.3)',
          }}>—</div>
        )}
        <div style={{ position: 'absolute', inset: 4, border: '1px solid rgba(245,215,110,0.28)', pointerEvents: 'none' }}/>
      </div>

      {/* 名前 + 会社 */}
      <div style={{
        position: 'absolute',
        left: 0, right: 0, top: 374,
        textAlign: 'center', padding: '0 12px',
      }}>
        <CondenseText style={{
          fontFamily: "'Noto Sans JP', sans-serif",
          fontWeight: 700, fontSize: 30,
          color: '#f8eccc', letterSpacing: '0.05em',
          textShadow: '0 2px 10px rgba(0,0,0,0.85)',
          lineHeight: 1.15,
        }} min={0.45}>{name}</CondenseText>
        {company && (
          <CondenseText style={{
            marginTop: 4,
            fontFamily: "'Noto Sans JP', sans-serif",
            fontSize: 17,
            color: 'rgba(245,215,110,0.85)',
            letterSpacing: '0.18em',
          }} min={0.45}>{company}</CondenseText>
        )}
      </div>

      {/* 数字 (Phase 0=小、Phase 1=ドンと拡大 + パンチアニメ) */}
      <div style={{
        position: 'absolute',
        left: 0, right: 0,
        top: phase === 1 ? 470 : 458,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
        transition: 'top 420ms cubic-bezier(.2,1.2,.4,1)',
      }}>
        <style>{`
          @keyframes vrNumberPunch {
            0%   { transform: scale(0.86); filter: drop-shadow(0 0 0 rgba(245,215,110,0)); }
            45%  { transform: scale(1.18); filter: drop-shadow(0 0 36px rgba(245,215,110,0.95)); }
            70%  { transform: scale(0.98); }
            100% { transform: scale(1);    filter: drop-shadow(0 0 18px rgba(245,215,110,0.5)); }
          }
        `}</style>
        <div
          key={`pill-${phase}`}
          style={{
            display: 'flex', alignItems: 'baseline',
            gap: phase === 1 ? 14 : 10,
            padding: phase === 1 ? '14px 38px' : '8px 26px',
            width: phase === 1 ? 480 : 360,
            justifyContent: 'center',
            background: phase === 1
              ? 'linear-gradient(180deg, rgba(40,28,12,0.95), rgba(15,10,4,0.97))'
              : 'rgba(8,4,8,0.7)',
            border: phase === 1
              ? '2px solid rgba(245,215,110,0.95)'
              : '1px solid rgba(245,215,110,0.6)',
            boxShadow: phase === 1
              ? '0 14px 44px rgba(0,0,0,0.7), 0 0 44px rgba(245,215,110,0.5), inset 0 2px 0 rgba(255,235,180,0.18)'
              : '0 6px 24px rgba(0,0,0,0.55), 0 0 24px rgba(245,215,110,0.18)',
            transition: 'all 420ms cubic-bezier(.2,1.2,.4,1)',
            animation: phase === 1 ? 'vrNumberPunch 600ms cubic-bezier(.2,1.4,.4,1) forwards' : 'none',
          }}
        >
          <span style={{
            fontFamily: "'Roboto Condensed', sans-serif",
            fontWeight: 700,
            fontSize: fitNumFont(phase, shown.toLocaleString()),
            color: '#fff',
            letterSpacing: '-0.01em',
            lineHeight: 1,
            textShadow: phase === 1
              ? '0 4px 22px rgba(0,0,0,0.9), 0 0 32px rgba(255,225,170,0.6)'
              : '0 2px 14px rgba(0,0,0,0.85), 0 0 18px rgba(245,215,110,0.3)',
            fontVariantNumeric: 'tabular-nums',
            display: 'inline-block',
            textAlign: 'right',
            minWidth: '3.6ch',
            transition: 'font-size 420ms cubic-bezier(.2,1.2,.4,1)',
          }}>
            {shown.toLocaleString()}
          </span>
          <span style={{
            fontFamily: "'Roboto Condensed', sans-serif",
            fontWeight: 700,
            fontSize: phase === 1 ? 36 : 26,
            color: GOLD_BRIGHT,
            letterSpacing: '0.18em',
            lineHeight: 1,
            transition: 'font-size 420ms cubic-bezier(.2,1.2,.4,1)',
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
