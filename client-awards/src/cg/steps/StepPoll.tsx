import { useEffect, useState, useMemo } from 'react';
import type { CgCategory, CgMappedEntry } from '../types';
import { POLL_DURATION_MS } from '../types';

interface Props {
  category: CgCategory | null;
  entries: CgMappedEntry[];   // sorted by rank
  startedAt: number | null;
  lang: 'ja' | 'en';
}

const CAM_W = 1300;
const CAM_H = 720;
const CAM_CENTER_X = 960;
const CAM_TOP = 220;

/**
 * アンケート投票画面 (投票No.1決定パターン専用) / オールスター感謝祭風
 * - 上部: REAL-TIME VOTE タグ + 賞タイトル + 質問文
 * - 中央: 1300×720 の大型カメラ合成枠 (アルファ透過)
 * - 下部: TOP3 の3択カラーパネル
 * - 右上: スライド型カウントダウン (00秒〜) / ラスト5秒は中央巨大表示
 */
export default function StepPoll({ category, entries, startedAt, lang }: Props) {
  const top3 = useMemo(() => entries.filter((e) => e.rank >= 1 && e.rank <= 3), [entries]);

  const title = lang === 'en'
    ? (category?.poll_title_en || category?.poll_title || category?.name_en || category?.name || '')
    : (category?.poll_title || category?.name || '');
  const question = lang === 'en'
    ? (category?.poll_question_en || category?.poll_question || 'Who deserves the award?')
    : (category?.poll_question || 'Q. もっともふさわしいのは？');

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

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'transparent' }}>
      <FestiveBackground />

      {/* 上部: タイトル + 質問文 */}
      <div
        style={{
          position: 'absolute',
          top: 60,
          left: 80,
          right: 80,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            display: 'inline-block',
            padding: '6px 28px',
            border: '1px solid rgba(245,215,110,0.5)',
            borderRadius: 999,
            background: 'rgba(8,12,20,0.55)',
            backdropFilter: 'blur(4px)',
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 20,
            letterSpacing: '0.55em',
            color: '#F5D76E',
            marginBottom: 12,
            boxShadow: '0 4px 18px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.1)',
          }}
        >
          REAL-TIME VOTE
        </div>
        <div
          style={{
            fontFamily: "'Noto Sans JP', sans-serif",
            fontWeight: 900,
            fontSize: 64,
            color: '#fff',
            textShadow: '0 4px 18px rgba(0,0,0,0.8), 0 0 30px rgba(245,215,110,0.35)',
            letterSpacing: '0.04em',
            lineHeight: 1.05,
            background: 'linear-gradient(180deg, #ffffff 0%, #ffeec0 60%, #f5d76e 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: 12,
            fontFamily: "'Noto Sans JP', sans-serif",
            fontSize: 30,
            fontWeight: 700,
            color: '#F5D76E',
            letterSpacing: '0.06em',
            textShadow: '0 2px 8px rgba(0,0,0,0.7)',
          }}
        >
          {question}
        </div>
      </div>

      {/* 中央: 大型カメラ合成枠 (1300×720) */}
      <CameraHole isLast5={isLast5} />

      {/* カウントダウン: 通常時は右上、ラスト5秒は中央巨大表示 */}
      <CountdownDisplay secs={secs} ratio={remaining / POLL_DURATION_MS} isLast10={isLast10} isLast5={isLast5} />

      {/* 下部: 3択カード */}
      <div
        style={{
          position: 'absolute',
          bottom: 60,
          left: 80,
          right: 80,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 22,
        }}
      >
        {top3.map((e, i) => (
          <ChoiceCard key={e.id} index={i + 1} entry={e} lang={lang} />
        ))}
        {top3.length === 0 && (
          <div style={{ gridColumn: '1 / -1', color: '#aaa', textAlign: 'center', fontSize: 28 }}>
            TOP3 が設定されていません
          </div>
        )}
      </div>
    </div>
  );
}

/** 賑やかな award 背景 (カメラ枠部分はアルファ透過で抜く) */
function FestiveBackground() {
  // 固定 seed の confetti
  const sparkles = useMemo(() => {
    const rnd = mulberry32(20260517);
    return Array.from({ length: 80 }).map(() => ({
      x: rnd() * 1920,
      y: rnd() * 1080,
      r: 1 + rnd() * 2.5,
      o: 0.25 + rnd() * 0.55,
      d: 1.4 + rnd() * 2.6,
      delay: -rnd() * 4,
    }));
  }, []);
  // カメラ枠部分を CSS mask でくり抜く (mask-composite: exclude)
  const hx = CAM_CENTER_X - CAM_W / 2;
  const hy = CAM_TOP;
  const maskStyle: React.CSSProperties = {
    WebkitMaskImage: 'linear-gradient(#000 0 0), linear-gradient(#000 0 0)',
    maskImage: 'linear-gradient(#000 0 0), linear-gradient(#000 0 0)',
    WebkitMaskPosition: `0 0, ${hx}px ${hy}px`,
    maskPosition: `0 0, ${hx}px ${hy}px`,
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
      {/* メインベース: 中央スポットライト + 暗いビネット */}
      <div
        style={{
          position: 'absolute', inset: 0,
          background: `
            radial-gradient(ellipse 65% 55% at 50% 48%, rgba(120,80,30,0.55), rgba(40,20,8,0.95) 60%, rgba(6,8,14,1) 100%),
            linear-gradient(180deg, #0b0d18 0%, #0a0712 100%)
          `,
        }}
      />
      {/* 中央スポット (カメラ枠周辺をぼんやり明るく) */}
      <div
        style={{
          position: 'absolute',
          left: CAM_CENTER_X - CAM_W / 2 - 80,
          top: CAM_TOP - 80,
          width: CAM_W + 160,
          height: CAM_H + 160,
          background: 'radial-gradient(ellipse at center, rgba(245,215,110,0.18), transparent 70%)',
          filter: 'blur(20px)',
          pointerEvents: 'none',
        }}
      />
      {/* 斜めの光線 (左右) */}
      <div
        style={{
          position: 'absolute', top: 0, left: 0, width: 1200, height: 1200,
          background: 'linear-gradient(110deg, rgba(245,215,110,0.16) 0%, transparent 35%)',
          mixBlendMode: 'screen',
          animation: 'pollRayDrift 7s ease-in-out infinite',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute', top: 0, right: 0, width: 1200, height: 1200,
          background: 'linear-gradient(-110deg, rgba(180,140,60,0.14) 0%, transparent 35%)',
          mixBlendMode: 'screen',
          animation: 'pollRayDrift 9s ease-in-out infinite reverse',
          pointerEvents: 'none',
        }}
      />
      {/* キラキラ confetti */}
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
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
      {/* 上下のフレーム装飾 */}
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

/** カメラ合成 PinP 枠 (1300×720, ラスト5秒で発光強調) */
function CameraHole({ isLast5 }: { isLast5: boolean }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: CAM_CENTER_X - CAM_W / 2,
        top: CAM_TOP,
        width: CAM_W,
        height: CAM_H,
        pointerEvents: 'none',
        transition: 'box-shadow 300ms ease, filter 300ms ease',
      }}
    >
      {/* 内側: 完全透過 (アルファチャンネル ON で抜ける) */}
      <div style={{ position: 'absolute', inset: 6, background: 'transparent' }} />
      {/* 外枠: メイン */}
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
      {/* 外側 サブ ダブルライン */}
      <div
        style={{
          position: 'absolute', inset: -10,
          border: '1px solid rgba(245,215,110,0.45)',
        }}
      />
      <div
        style={{
          position: 'absolute', inset: -18,
          border: '1px solid rgba(245,215,110,0.18)',
        }}
      />
      {/* コーナー装飾 (太め) */}
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
      {/* LIVE CAM ラベル */}
      <div
        style={{
          position: 'absolute', top: -34, left: 0,
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 16,
          letterSpacing: '0.45em',
          color: 'rgba(245,215,110,0.95)',
          textShadow: '0 1px 4px rgba(0,0,0,0.8)',
        }}
      >
        ◆ LIVE CAM
      </div>
    </div>
  );
}

/** カウントダウン表示: 通常 = 右上の円, ラスト5秒 = 中央巨大表示 */
function CountdownDisplay({ secs, ratio, isLast10, isLast5 }: {
  secs: number; ratio: number; isLast10: boolean; isLast5: boolean;
}) {
  if (isLast5) return <CountdownLast5 secs={secs} />;

  return (
    <div
      style={{
        position: 'absolute',
        top: 70,
        right: 70,
        width: 220,
        height: 220,
        borderRadius: '50%',
        background: isLast10
          ? 'radial-gradient(circle, rgba(160,40,40,0.95), rgba(60,10,10,0.95))'
          : 'radial-gradient(circle, rgba(20,28,40,0.95), rgba(8,12,20,0.95))',
        border: `3px solid ${isLast10 ? '#ff6b4a' : '#F5D76E'}`,
        boxShadow: `0 0 50px ${isLast10 ? 'rgba(255,80,40,0.7)' : 'rgba(245,215,110,0.55)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 13,
          letterSpacing: '0.4em',
          color: isLast10 ? '#ffd0c0' : '#F5D76E',
          marginBottom: 0,
          marginTop: -6,
        }}
      >
        TIME LEFT
      </div>
      <SlideDigits value={secs} fontSize={120} color="#fff" minDigits={2} />
      <svg width={220} height={220} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
        <circle
          cx={110} cy={110} r={101}
          fill="none"
          stroke={isLast10 ? '#ff6b4a' : '#F5D76E'}
          strokeWidth={4}
          strokeDasharray={`${2 * Math.PI * 101}`}
          strokeDashoffset={`${2 * Math.PI * 101 * (1 - ratio)}`}
          opacity={0.9}
          style={{ transition: 'stroke-dashoffset 0.1s linear' }}
        />
      </svg>
    </div>
  );
}

/** ラスト5秒: 中央に巨大数字を爆裂表示 */
function CountdownLast5({ secs }: { secs: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 70,
        right: 70,
        width: 320,
        height: 320,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        pointerEvents: 'none',
      }}
    >
      <style>{`
        @keyframes pollLast5Pulse {
          0%, 100% { transform: scale(1);    filter: drop-shadow(0 0 20px rgba(255,90,60,0.7)); }
          50%      { transform: scale(1.08); filter: drop-shadow(0 0 50px rgba(255,160,60,1)); }
        }
        @keyframes pollLast5Halo {
          0%   { transform: scale(0.6); opacity: 0.85; }
          100% { transform: scale(1.4); opacity: 0; }
        }
      `}</style>
      {/* 拡散ハロ */}
      <div
        key={`halo-${secs}`}
        style={{
          position: 'absolute', inset: 0,
          borderRadius: '50%',
          border: '6px solid #ff6b4a',
          animation: 'pollLast5Halo 1s ease-out forwards',
        }}
      />
      {/* 背景円 */}
      <div
        style={{
          position: 'absolute', inset: 20,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(200,40,40,0.95), rgba(80,10,10,0.95))',
          border: '4px solid #ff6b4a',
          boxShadow: '0 0 80px rgba(255,80,40,0.85), inset 0 0 40px rgba(255,160,60,0.45)',
        }}
      />
      <div
        style={{
          position: 'relative',
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 220,
          fontWeight: 900,
          lineHeight: 1,
          color: '#fff',
          textShadow: '0 6px 30px rgba(0,0,0,0.85), 0 0 30px rgba(255,200,80,0.9)',
          animation: 'pollLast5Pulse 1s ease-in-out infinite',
        }}
      >
        <SlideDigits value={secs} fontSize={220} color="#fff" minDigits={1} />
      </div>
    </div>
  );
}

/**
 * 感謝祭風のスライド数字。値が変化すると
 * 旧桁が下にワイプアウト + 新桁が上から滑り込む。
 */
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

function ChoiceCard({ index, entry, lang }: { index: number; entry: CgMappedEntry; lang: 'ja' | 'en' }) {
  const colors = [
    { from: '#1a4a8a', to: '#0c2a55', accent: '#5d9cff' },
    { from: '#8b1f1f', to: '#4a0a0a', accent: '#ff7d6b' },
    { from: '#1a6638', to: '#0a3520', accent: '#7eea9c' },
  ][index - 1];
  const name = lang === 'en' ? (entry.nameEn || entry.name) : entry.name;
  const company = lang === 'en' ? (entry.orgEn || entry.company) : entry.company;
  return (
    <div
      style={{
        position: 'relative',
        background: `linear-gradient(150deg, ${colors.from}, ${colors.to})`,
        border: '2px solid rgba(245,215,110,0.55)',
        borderRadius: 10,
        padding: '22px 20px 20px 90px',
        minHeight: 116,
        boxShadow: '0 10px 36px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.14), 0 0 30px rgba(245,215,110,0.12)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: -10,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 80,
          height: 80,
          background: `radial-gradient(circle at 35% 30%, #fff, ${colors.accent} 70%, #1a1a1a)`,
          clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 54,
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
          fontSize: 30,
          color: '#fff',
          textShadow: '0 2px 6px rgba(0,0,0,0.7)',
          lineHeight: 1.15,
          letterSpacing: '0.02em',
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
        <div
          style={{
            marginTop: 4,
            fontFamily: "'Noto Sans JP', sans-serif",
            fontSize: 18,
            color: 'rgba(255,255,255,0.88)',
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
