import { useEffect, useState, useMemo } from 'react';
import type { CgCategory, CgMappedEntry } from '../types';
import { POLL_DURATION_MS } from '../types';

interface Props {
  category: CgCategory | null;
  entries: CgMappedEntry[];   // sorted by rank
  startedAt: number | null;
  lang: 'ja' | 'en';
}

// レイアウト定数 (1920×1080)
const CAM_X = 80;
const CAM_Y = 100;
const CAM_W = 1380;
const CAM_H = 800;

const RIGHT_COL_X = CAM_X + CAM_W + 40;
const RIGHT_COL_W = 1920 - RIGHT_COL_X - 60;
const RIGHT_COL_Y = CAM_Y;
const RIGHT_COL_H = CAM_H;

const CHOICES_Y = CAM_Y + CAM_H + 24;
const CHOICES_H = 1080 - CHOICES_Y - 24;

/**
 * アンケート投票画面 (オールスター感謝祭風 / 縦書きレイアウト)
 * - 左: 大型カメラ合成枠 1380×800 (アルファ透過)
 * - 右: Q バッジ + 賞タイトル (縦書きオレンジ帯) + 質問文 (縦書き)
 * - 下: 3 択カラー帯 (横並び 1 行)
 * - カウントダウン: 右下小バッジ / ラスト5秒は中央巨大表示
 */
export default function StepPoll({ category, entries, startedAt, lang }: Props) {
  const top3 = useMemo(() => entries.filter((e) => e.rank >= 1 && e.rank <= 3), [entries]);

  const title = lang === 'en'
    ? (category?.poll_title_en || category?.poll_title || category?.name_en || category?.name || '')
    : (category?.poll_title || category?.name || '');
  const question = lang === 'en'
    ? (category?.poll_question_en || category?.poll_question || 'Who deserves the award?')
    : (category?.poll_question || 'ふさわしいのは？');

  const [remaining, setRemaining] = useState(POLL_DURATION_MS);
  useEffect(() => {
    if (startedAt == null) { setRemaining(POLL_DURATION_MS); return; }
    const tick = () => setRemaining(Math.max(0, POLL_DURATION_MS - (Date.now() - startedAt)));
    tick();
    const id = window.setInterval(tick, 80);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const secs = Math.ceil(remaining / 1000);
  const isLast5 = secs <= 5 && secs > 0;
  const isLast10 = secs <= 10;

  // 縦書きが効くのは日本語時のみ。EN 時は横書きで右パネル内収め。
  const isVertical = lang === 'ja';

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'transparent' }}>
      <FestiveBackground />

      {/* 左: 大型カメラ枠 */}
      <CameraHole isLast5={isLast5} />

      {/* 右パネル: Q バッジ + タイトル + 質問 */}
      <RightInfoPanel title={title} question={question} isVertical={isVertical} />

      {/* カウントダウン (通常: 右下、ラスト5秒: 中央巨大) */}
      <CountdownDisplay secs={secs} ratio={remaining / POLL_DURATION_MS} isLast10={isLast10} isLast5={isLast5} />

      {/* 下: 3 択帯 */}
      <ChoicesRow choices={top3} lang={lang} />
    </div>
  );
}

/** 賑やかな award 背景 (カメラ枠部分はアルファ透過で抜く) */
function FestiveBackground() {
  const sparkles = useMemo(() => {
    const rnd = mulberry32(20260517);
    return Array.from({ length: 70 }).map(() => ({
      x: rnd() * 1920,
      y: rnd() * 1080,
      r: 1 + rnd() * 2.5,
      o: 0.25 + rnd() * 0.55,
      d: 1.4 + rnd() * 2.6,
      delay: -rnd() * 4,
    }));
  }, []);
  // カメラ枠部分を CSS mask でくり抜く
  const maskStyle: React.CSSProperties = {
    WebkitMaskImage: 'linear-gradient(#000 0 0), linear-gradient(#000 0 0)',
    maskImage: 'linear-gradient(#000 0 0), linear-gradient(#000 0 0)',
    WebkitMaskPosition: `0 0, ${CAM_X}px ${CAM_Y}px`,
    maskPosition: `0 0, ${CAM_X}px ${CAM_Y}px`,
    WebkitMaskSize: `100% 100%, ${CAM_W}px ${CAM_H}px`,
    maskSize: `100% 100%, ${CAM_W}px ${CAM_H}px`,
    WebkitMaskRepeat: 'no-repeat, no-repeat',
    maskRepeat: 'no-repeat, no-repeat',
    WebkitMaskComposite: 'xor',
    maskComposite: 'exclude',
  };
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', ...maskStyle }}>
      <style>{`
        @keyframes pollSparkle {
          0%, 100% { opacity: 0.1; transform: scale(0.9); }
          50%      { opacity: 1;   transform: scale(1.3); }
        }
        @keyframes pollRayDrift {
          0%   { transform: translate(-10%, -10%) rotate(-12deg); opacity: 0.55; }
          50%  { transform: translate(0%,    0%) rotate(-9deg);  opacity: 0.9; }
          100% { transform: translate(-10%, -10%) rotate(-12deg); opacity: 0.55; }
        }
      `}</style>
      <div
        style={{
          position: 'absolute', inset: 0,
          background: `
            radial-gradient(ellipse 65% 55% at 50% 48%, rgba(120,80,30,0.55), rgba(40,20,8,0.95) 60%, rgba(6,8,14,1) 100%),
            linear-gradient(180deg, #0b0d18 0%, #0a0712 100%)
          `,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: CAM_X - 80, top: CAM_Y - 80,
          width: CAM_W + 160, height: CAM_H + 160,
          background: 'radial-gradient(ellipse at center, rgba(245,215,110,0.18), transparent 70%)',
          filter: 'blur(20px)',
        }}
      />
      <div
        style={{
          position: 'absolute', top: 0, left: 0, width: 1200, height: 1200,
          background: 'linear-gradient(110deg, rgba(245,215,110,0.16) 0%, transparent 35%)',
          mixBlendMode: 'screen',
          animation: 'pollRayDrift 7s ease-in-out infinite',
        }}
      />
      <div
        style={{
          position: 'absolute', top: 0, right: 0, width: 1200, height: 1200,
          background: 'linear-gradient(-110deg, rgba(180,140,60,0.14) 0%, transparent 35%)',
          mixBlendMode: 'screen',
          animation: 'pollRayDrift 9s ease-in-out infinite reverse',
        }}
      />
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        {sparkles.map((s, i) => (
          <circle
            key={i}
            cx={s.x} cy={s.y} r={s.r}
            fill="#fff3c4"
            opacity={s.o}
            style={{
              filter: 'drop-shadow(0 0 4px rgba(245,215,110,0.9))',
              animation: `pollSparkle ${s.d}s ease-in-out infinite`,
              animationDelay: `${s.delay}s`,
              transformOrigin: `${s.x}px ${s.y}px`,
            }}
          />
        ))}
      </svg>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, transparent, #F5D76E, transparent)', opacity: 0.7 }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, transparent, #F5D76E, transparent)', opacity: 0.7 }} />
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

function CameraHole({ isLast5 }: { isLast5: boolean }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: CAM_X, top: CAM_Y,
        width: CAM_W, height: CAM_H,
        pointerEvents: 'none',
      }}
    >
      <div style={{ position: 'absolute', inset: 6, background: 'transparent' }} />
      <div
        style={{
          position: 'absolute', inset: 0,
          border: '4px solid #F5D76E',
          boxShadow: isLast5
            ? '0 0 70px rgba(255,90,60,0.7), inset 0 0 36px rgba(255,90,60,0.35)'
            : '0 0 50px rgba(245,215,110,0.55), inset 0 0 28px rgba(245,215,110,0.28)',
          transition: 'box-shadow 250ms ease',
        }}
      />
      <div style={{ position: 'absolute', inset: -10, border: '1px solid rgba(245,215,110,0.45)' }} />
      <div style={{ position: 'absolute', inset: -18, border: '1px solid rgba(245,215,110,0.18)' }} />
      {(['tl', 'tr', 'bl', 'br'] as const).map((c) => {
        const sz = 44;
        return (
          <div
            key={c}
            style={{
              position: 'absolute',
              width: sz, height: sz,
              ...(c === 'tl' && { top: -4, left: -4, borderTop: '6px solid #F5D76E', borderLeft: '6px solid #F5D76E' }),
              ...(c === 'tr' && { top: -4, right: -4, borderTop: '6px solid #F5D76E', borderRight: '6px solid #F5D76E' }),
              ...(c === 'bl' && { bottom: -4, left: -4, borderBottom: '6px solid #F5D76E', borderLeft: '6px solid #F5D76E' }),
              ...(c === 'br' && { bottom: -4, right: -4, borderBottom: '6px solid #F5D76E', borderRight: '6px solid #F5D76E' }),
              filter: 'drop-shadow(0 0 10px rgba(245,215,110,0.6))',
            }}
          />
        );
      })}
    </div>
  );
}

/** 右パネル: Q バッジ + 賞タイトル (縦書きオレンジ帯) + 質問文 (縦書き) */
function RightInfoPanel({ title, question, isVertical }: {
  title: string; question: string; isVertical: boolean;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: RIGHT_COL_X, top: RIGHT_COL_Y,
        width: RIGHT_COL_W, height: RIGHT_COL_H,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'flex-end',
        gap: 18,
      }}
    >
      {isVertical ? (
        <>
          {/* 質問文 (縦書き, 右側に長く) */}
          <div
            style={{
              writingMode: 'vertical-rl',
              fontFamily: "'Noto Sans JP', sans-serif",
              fontWeight: 900,
              fontSize: 86,
              color: '#fff',
              textShadow: '0 4px 18px rgba(0,0,0,0.85), 0 0 22px rgba(245,215,110,0.35)',
              letterSpacing: '0.06em',
              lineHeight: 1.1,
              maxHeight: RIGHT_COL_H,
              overflow: 'hidden',
            }}
          >
            {question}
          </div>
          {/* 賞タイトル (縦書きオレンジ帯) */}
          <div
            style={{
              writingMode: 'vertical-rl',
              padding: '24px 18px',
              background: 'linear-gradient(180deg, #ff8e3c 0%, #e35a1f 100%)',
              border: '2px solid rgba(255,220,160,0.85)',
              boxShadow: '0 8px 32px rgba(220,70,20,0.6), inset 0 2px 0 rgba(255,255,255,0.25)',
              fontFamily: "'Noto Sans JP', sans-serif",
              fontWeight: 900,
              fontSize: 70,
              color: '#fff',
              letterSpacing: '0.12em',
              lineHeight: 1.05,
              maxHeight: RIGHT_COL_H - 120,
              textShadow: '0 2px 6px rgba(0,0,0,0.45)',
            }}
          >
            {title}
          </div>
          {/* Q バッジ */}
          <div
            style={{
              flexShrink: 0,
              fontFamily: "'Bebas Neue', 'Noto Sans JP', serif",
              fontWeight: 900,
              fontSize: 140,
              lineHeight: 1,
              color: '#fff',
              textShadow: '0 4px 20px rgba(0,0,0,0.85), 0 0 30px rgba(245,215,110,0.6)',
              marginTop: -10,
            }}
          >
            Q
          </div>
        </>
      ) : (
        // EN モード: 横書き版
        <div style={{ width: '100%', textAlign: 'right' }}>
          <div
            style={{
              display: 'inline-block',
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 80, color: '#fff',
              textShadow: '0 4px 20px rgba(0,0,0,0.85)',
              marginBottom: 8,
            }}
          >
            Q
          </div>
          <div
            style={{
              display: 'inline-block',
              padding: '12px 22px',
              background: 'linear-gradient(180deg, #ff8e3c 0%, #e35a1f 100%)',
              border: '2px solid rgba(255,220,160,0.85)',
              boxShadow: '0 8px 32px rgba(220,70,20,0.6), inset 0 2px 0 rgba(255,255,255,0.25)',
              fontWeight: 900,
              fontSize: 48,
              color: '#fff',
              letterSpacing: '0.04em',
              marginBottom: 16,
              textShadow: '0 2px 6px rgba(0,0,0,0.45)',
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontFamily: "'Noto Sans JP', sans-serif",
              fontWeight: 900,
              fontSize: 44,
              color: '#fff',
              textShadow: '0 2px 12px rgba(0,0,0,0.8)',
              lineHeight: 1.15,
            }}
          >
            {question}
          </div>
        </div>
      )}
    </div>
  );
}

/** 下部 3 択ストリップ (カメラ幅と揃える) */
function ChoicesRow({ choices, lang }: { choices: CgMappedEntry[]; lang: 'ja' | 'en' }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: CAM_X,
        top: CHOICES_Y,
        width: CAM_W,
        height: CHOICES_H,
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.max(1, choices.length)}, 1fr)`,
        gap: 14,
      }}
    >
      {choices.map((e, i) => (
        <ChoiceTile key={e.id} index={i + 1} entry={e} lang={lang} />
      ))}
      {choices.length === 0 && (
        <div style={{ gridColumn: '1 / -1', alignSelf: 'center', textAlign: 'center', color: '#aaa', fontSize: 24 }}>
          選択肢が未設定
        </div>
      )}
    </div>
  );
}

function ChoiceTile({ index, entry, lang }: { index: number; entry: CgMappedEntry; lang: 'ja' | 'en' }) {
  const colors = [
    { from: '#1a4a8a', to: '#0c2a55', accent: '#5d9cff' },
    { from: '#8b1f1f', to: '#4a0a0a', accent: '#ff7d6b' },
    { from: '#1a6638', to: '#0a3520', accent: '#7eea9c' },
  ][index - 1] ?? { from: '#444', to: '#222', accent: '#999' };
  const name = lang === 'en' ? (entry.nameEn || entry.name) : entry.name;
  const company = lang === 'en' ? (entry.orgEn || entry.company) : entry.company;
  return (
    <div
      style={{
        position: 'relative',
        background: `linear-gradient(150deg, ${colors.from}, ${colors.to})`,
        border: '2px solid rgba(245,215,110,0.55)',
        borderRadius: 8,
        padding: '0 18px 0 78px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        boxShadow: '0 8px 30px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.14)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: -10,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 72,
          height: 72,
          background: `radial-gradient(circle at 35% 30%, #fff, ${colors.accent} 70%, #1a1a1a)`,
          clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 46,
          fontWeight: 900,
          color: '#fff',
          textShadow: '0 2px 6px rgba(0,0,0,0.8)',
          filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.45))',
        }}
      >
        {index}
      </div>
      <div
        style={{
          fontFamily: "'Noto Sans JP', sans-serif",
          fontWeight: 900,
          fontSize: 28,
          color: '#fff',
          textShadow: '0 2px 6px rgba(0,0,0,0.7)',
          lineHeight: 1.1,
          letterSpacing: '0.02em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </div>
      {company && (
        <div
          style={{
            marginTop: 2,
            fontFamily: "'Noto Sans JP', sans-serif",
            fontSize: 16,
            color: 'rgba(255,255,255,0.85)',
            letterSpacing: '0.04em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {company}
        </div>
      )}
    </div>
  );
}

/** カウントダウン表示: 位置は右下固定、ラスト5秒はその場で強調 */
function CountdownDisplay({ secs, ratio, isLast10, isLast5 }: {
  secs: number; ratio: number; isLast10: boolean; isLast5: boolean;
}) {
  const size = isLast5 ? 200 : 140;
  const r = (size / 2) - 8;
  const stroke = isLast5 ? 5 : 3;
  const borderW = isLast5 ? 5 : 3;
  const fontPx = isLast5 ? 140 : 84;
  const halo = isLast5
    ? '0 0 80px rgba(255,80,40,0.85), 0 0 40px rgba(255,160,60,0.55)'
    : isLast10
      ? '0 0 30px rgba(255,80,40,0.7)'
      : '0 0 30px rgba(245,215,110,0.5)';
  const bg = isLast10
    ? 'radial-gradient(circle, rgba(180,40,40,0.95), rgba(60,10,10,0.95))'
    : 'radial-gradient(circle, rgba(20,28,40,0.95), rgba(8,12,20,0.95))';
  const accent = isLast10 ? '#ff6b4a' : '#F5D76E';

  return (
    <div
      style={{
        position: 'absolute',
        right: 60,
        bottom: 30,
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        border: `${borderW}px solid ${accent}`,
        boxShadow: halo,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'width 220ms ease, height 220ms ease, border-color 220ms ease, box-shadow 220ms ease',
        animation: isLast5 ? 'pollLast5Pulse 1s ease-in-out infinite' : 'none',
      }}
    >
      <style>{`
        @keyframes pollLast5Pulse {
          0%, 100% { transform: scale(1);     filter: drop-shadow(0 0 14px rgba(255,90,60,0.55)); }
          50%      { transform: scale(1.04);  filter: drop-shadow(0 0 26px rgba(255,160,60,0.85)); }
        }
      `}</style>
      <SlideDigits value={secs} fontSize={fontPx} color="#fff" minDigits={1} />
      <svg width={size} height={size} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={accent}
          strokeWidth={stroke}
          strokeDasharray={`${2 * Math.PI * r}`}
          strokeDashoffset={`${2 * Math.PI * r * (1 - ratio)}`}
          opacity={0.92}
          style={{ transition: 'stroke-dashoffset 0.1s linear' }}
        />
      </svg>
    </div>
  );
}

function SlideDigits({ value, fontSize, color, minDigits = 1 }: {
  value: number; fontSize: number; color: string; minDigits?: number;
}) {
  const str = String(Math.max(0, value)).padStart(minDigits, '0');
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: fontSize * 0.02 }}>
      {str.split('').map((ch, i) => (
        <SlideDigit key={`${i}-${str.length}`} char={ch} fontSize={fontSize} color={color} />
      ))}
    </div>
  );
}

interface Slide { key: number; ch: string; entering: boolean; }
let __slideKeyCounter = 0;

function SlideDigit({ char, fontSize, color }: { char: string; fontSize: number; color: string }) {
  const [slides, setSlides] = useState<Slide[]>(() => [
    { key: __slideKeyCounter++, ch: char, entering: false },
  ]);

  useEffect(() => {
    setSlides((prev) => {
      const top = prev[prev.length - 1];
      if (top && top.ch === char) return prev;
      return [...prev, { key: __slideKeyCounter++, ch: char, entering: true }];
    });
  }, [char]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const id = window.setTimeout(() => {
      setSlides((curr) => (curr.length > 1 ? curr.slice(1) : curr));
    }, 560);
    return () => window.clearTimeout(id);
  }, [slides]);

  const w = fontSize * 0.62;
  const h = fontSize * 1.05;

  return (
    <div
      style={{
        position: 'relative',
        width: w,
        height: h,
        overflow: 'hidden',
        display: 'inline-block',
      }}
    >
      <style>{`
        @keyframes pollDigitIn {
          from { transform: translateY(-100%); opacity: 0; }
          to   { transform: translateY(0);     opacity: 1; }
        }
        @keyframes pollDigitOut {
          from { transform: translateY(0);    opacity: 1; }
          to   { transform: translateY(100%); opacity: 0; }
        }
      `}</style>
      {slides.map((s, idx) => {
        const isCurrent = idx === slides.length - 1;
        const anim = isCurrent
          ? (s.entering ? 'pollDigitIn 520ms cubic-bezier(.22,.85,.32,1) forwards' : 'none')
          : 'pollDigitOut 520ms cubic-bezier(.4,0,.66,.4) forwards';
        return (
          <div
            key={s.key}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize,
              fontWeight: 900,
              color,
              lineHeight: 1,
              animation: anim,
              willChange: 'transform, opacity',
            }}
          >
            {s.ch}
          </div>
        );
      })}
    </div>
  );
}
