import { useEffect, useState, useMemo } from 'react';
import type { CgCategory, CgMappedEntry } from '../types';
import { POLL_DURATION_MS } from '../types';

interface Props {
  category: CgCategory | null;
  entries: CgMappedEntry[];
  startedAt: number | null;
  lang: 'ja' | 'en';
}

// ─── レイアウト ───
const CAM_X = 80;
const CAM_Y = 100;
const CAM_W = 1380;
const CAM_H = 780;

const RIGHT_X = CAM_X + CAM_W + 40;
const RIGHT_W = 1920 - RIGHT_X - 60;
const RIGHT_Y = CAM_Y;
const RIGHT_H = CAM_H;

const CHOICES_Y = CAM_Y + CAM_H + 28;
const CHOICES_H = 1080 - CHOICES_Y - 32;

const GOLD_BRIGHT = '#FFE8A8';
const GOLD = '#E8C56C';
const GOLD_DEEP = '#9E7B2E';
const ORANGE_LIGHT = '#FF8A3D';
const ORANGE_DEEP = '#C8431A';

export default function StepPoll({ category, entries, startedAt, lang }: Props) {
  const choices = useMemo(() => entries.filter((e) => e.rank >= 1 && e.rank <= 3), [entries]);
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

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'transparent', fontFamily: "'Noto Sans JP', sans-serif" }}>
      <Atmosphere />
      <CameraFrame />
      <RightColumn title={title} question={question} isJa={lang === 'ja'} />
      <BottomChoices choices={choices} lang={lang} />
      <Countdown secs={secs} ratio={remaining / POLL_DURATION_MS} isLast5={isLast5} isLast10={isLast10} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Atmosphere: 多層背景 — ベース + ビネット + 上スポット + ボケ粒子 + 光線
// (カメラ枠部分はマスクで完全透過)
// ═══════════════════════════════════════════════════════════════════
function Atmosphere() {
  const particles = useMemo(() => {
    const rnd = mulberry32(20260615);
    return Array.from({ length: 36 }).map(() => ({
      x: rnd() * 1920,
      y: rnd() * 1080,
      r: 1 + rnd() * 2.4,
      o: 0.35 + rnd() * 0.45,
      blur: rnd() * 1.5,
      delay: -rnd() * 6,
      dur: 4 + rnd() * 5,
    }));
  }, []);
  // CSS mask でカメラ枠領域をくり抜く
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
        @keyframes pollBokeh {
          0%, 100% { opacity: 0.4; transform: scale(0.85); }
          50%      { opacity: 1;   transform: scale(1.15); }
        }
        @keyframes pollRayDrift {
          0%   { transform: translate(-2%, 0) rotate(-8deg); opacity: 0.5; }
          50%  { transform: translate(2%, 0)  rotate(-6deg); opacity: 0.85; }
          100% { transform: translate(-2%, 0) rotate(-8deg); opacity: 0.5; }
        }
      `}</style>

      {/* ベース: 深い濃紫 → 漆黒。中央上にウォームスポット */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `
          radial-gradient(ellipse 70% 50% at 50% 5%,  rgba(220,170,90,0.18), transparent 60%),
          radial-gradient(ellipse 75% 80% at 50% 60%, rgba(60,40,20,0.55), rgba(8,6,12,1) 70%),
          linear-gradient(180deg, #0c0a14 0%, #060409 100%)
        `,
      }}/>

      {/* 左上 / 右上 の斜光ビーム */}
      <div style={{
        position: 'absolute', top: -200, left: -200, width: 1400, height: 1400,
        background: 'linear-gradient(135deg, rgba(245,215,110,0.10) 0%, transparent 35%)',
        mixBlendMode: 'screen',
        animation: 'pollRayDrift 9s ease-in-out infinite',
      }}/>
      <div style={{
        position: 'absolute', top: -200, right: -200, width: 1400, height: 1400,
        background: 'linear-gradient(-135deg, rgba(220,140,60,0.08) 0%, transparent 35%)',
        mixBlendMode: 'screen',
        animation: 'pollRayDrift 11s ease-in-out infinite reverse',
      }}/>

      {/* ボケ粒子 */}
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <radialGradient id="bokeh">
            <stop offset="0%"  stopColor="#fff3c4" stopOpacity="1"/>
            <stop offset="60%" stopColor="#f5d76e" stopOpacity="0.4"/>
            <stop offset="100%" stopColor="#f5d76e" stopOpacity="0"/>
          </radialGradient>
        </defs>
        {particles.map((p, i) => (
          <circle
            key={i}
            cx={p.x} cy={p.y} r={p.r * 3}
            fill="url(#bokeh)"
            opacity={p.o}
            style={{
              filter: `blur(${p.blur}px)`,
              animation: `pollBokeh ${p.dur}s ease-in-out infinite`,
              animationDelay: `${p.delay}s`,
              transformOrigin: `${p.x}px ${p.y}px`,
            }}
          />
        ))}
      </svg>

      {/* 床のリフレクション */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: 240,
        background: 'linear-gradient(180deg, transparent 0%, rgba(245,215,110,0.06) 40%, rgba(245,215,110,0.12) 80%, transparent 100%)',
      }}/>

      {/* ビネット */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 100% 100% at 50% 50%, transparent 55%, rgba(0,0,0,0.65) 100%)',
      }}/>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CameraFrame: 多層フレーム + ぼかし内側エッジ + オーナメント
// ═══════════════════════════════════════════════════════════════════
function CameraFrame() {
  return (
    <div style={{
      position: 'absolute',
      left: CAM_X, top: CAM_Y,
      width: CAM_W, height: CAM_H,
      pointerEvents: 'none',
    }}>
      {/* インナーグロー (透明枠の内側に金色がにじむ) */}
      <div style={{
        position: 'absolute', inset: 0,
        boxShadow: `inset 0 0 60px rgba(245,215,110,0.18), inset 0 0 18px rgba(245,215,110,0.35)`,
        pointerEvents: 'none',
      }}/>

      {/* メインフレーム: グラデで金属感 */}
      <div style={{
        position: 'absolute', inset: 0,
        border: `5px solid ${GOLD}`,
        borderImage: `linear-gradient(180deg, ${GOLD_BRIGHT} 0%, ${GOLD} 35%, ${GOLD_DEEP} 100%) 1`,
        boxShadow: `
          0 0 60px rgba(245,215,110,0.55),
          0 20px 60px rgba(0,0,0,0.7),
          inset 0 0 0 1px rgba(0,0,0,0.4)
        `,
      }}/>

      {/* 外側 ホエアライン */}
      <div style={{ position: 'absolute', inset: -10, border: '1px solid rgba(245,215,110,0.55)' }}/>
      <div style={{ position: 'absolute', inset: -20, border: '1px solid rgba(245,215,110,0.18)' }}/>

      {/* 内側 ホエアライン */}
      <div style={{ position: 'absolute', inset: 10, border: '1px solid rgba(245,215,110,0.4)' }}/>

      {/* 4 隅 装飾 */}
      {(['tl','tr','bl','br'] as const).map((c) => <CornerOrnament key={c} pos={c}/>)}
    </div>
  );
}

function CornerOrnament({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const sz = 56;
  const armT = 4;
  const isT = pos[0] === 't';
  const isL = pos[1] === 'l';
  return (
    <div style={{
      position: 'absolute',
      width: sz, height: sz,
      ...(isT ? { top: -6 } : { bottom: -6 }),
      ...(isL ? { left: -6 } : { right: -6 }),
      filter: 'drop-shadow(0 0 8px rgba(245,215,110,0.6))',
    }}>
      {/* L 字アーム */}
      <div style={{
        position: 'absolute',
        ...(isT ? { top: 0 } : { bottom: 0 }),
        ...(isL ? { left: 0 } : { right: 0 }),
        width: sz, height: armT,
        background: `linear-gradient(${isL ? '90deg' : '270deg'}, ${GOLD_BRIGHT} 0%, ${GOLD} 100%)`,
      }}/>
      <div style={{
        position: 'absolute',
        ...(isT ? { top: 0 } : { bottom: 0 }),
        ...(isL ? { left: 0 } : { right: 0 }),
        width: armT, height: sz,
        background: `linear-gradient(${isT ? '180deg' : '0deg'}, ${GOLD_BRIGHT} 0%, ${GOLD} 100%)`,
      }}/>
      {/* コーナーのドット */}
      <div style={{
        position: 'absolute',
        ...(isT ? { top: -2 } : { bottom: -2 }),
        ...(isL ? { left: -2 } : { right: -2 }),
        width: 8, height: 8,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${GOLD_BRIGHT}, ${GOLD_DEEP})`,
        boxShadow: `0 0 8px ${GOLD_BRIGHT}`,
      }}/>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// RightColumn: Q バッジ + 縦帯タイトル + 縦書き質問文 (写真撮影風)
// ═══════════════════════════════════════════════════════════════════
function RightColumn({ title, question, isJa }: { title: string; question: string; isJa: boolean }) {
  return (
    <div style={{
      position: 'absolute',
      left: RIGHT_X, top: RIGHT_Y,
      width: RIGHT_W, height: RIGHT_H,
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'flex-end',
      gap: 26,
    }}>
      {isJa ? (
        <>
          {/* 質問文 縦書き */}
          <div style={{
            writingMode: 'vertical-rl',
            fontFamily: "'Noto Serif JP', 'Noto Sans JP', serif",
            fontWeight: 900,
            fontSize: 76,
            color: '#fff',
            letterSpacing: '0.04em',
            lineHeight: 1.15,
            textShadow: '0 4px 24px rgba(0,0,0,0.95), 0 0 16px rgba(245,215,110,0.18)',
            maxHeight: RIGHT_H - 10,
            paddingTop: 30,
          }}>
            {question}
          </div>

          {/* タイトル オレンジ縦帯 (深み + ハイライト + ゴールド エッジ) */}
          <TitleBand text={title} />

          {/* Q バッジ */}
          <QBadge />
        </>
      ) : (
        <div style={{ width: '100%', textAlign: 'right', paddingTop: 30 }}>
          <div style={{
            display: 'inline-block',
            fontFamily: "'Bebas Neue', serif",
            fontSize: 92, color: GOLD_BRIGHT,
            letterSpacing: '0.04em',
            textShadow: '0 4px 24px rgba(0,0,0,0.85), 0 0 18px rgba(245,215,110,0.5)',
            marginBottom: 12,
          }}>Q</div>
          <div style={{
            display: 'inline-block',
            padding: '14px 28px',
            background: `linear-gradient(180deg, ${ORANGE_LIGHT}, ${ORANGE_DEEP})`,
            border: `2px solid ${GOLD_BRIGHT}`,
            boxShadow: `0 10px 40px rgba(200,60,20,0.55), inset 0 2px 0 rgba(255,255,255,0.3), 0 0 24px rgba(245,215,110,0.25)`,
            fontFamily: "'Noto Serif JP', serif",
            fontWeight: 900,
            fontSize: 44,
            color: '#fff',
            letterSpacing: '0.04em',
            textShadow: '0 2px 8px rgba(0,0,0,0.5)',
            marginBottom: 18,
          }}>{title}</div>
          <div style={{
            fontFamily: "'Noto Serif JP', serif",
            fontWeight: 900,
            fontSize: 48,
            color: '#fff',
            letterSpacing: '0.02em',
            textShadow: '0 2px 16px rgba(0,0,0,0.85)',
            lineHeight: 1.15,
          }}>{question}</div>
        </div>
      )}
    </div>
  );
}

function TitleBand({ text }: { text: string }) {
  return (
    <div style={{
      position: 'relative',
      writingMode: 'vertical-rl',
      padding: '28px 22px',
      background: `linear-gradient(180deg, ${ORANGE_LIGHT} 0%, #e8631f 55%, ${ORANGE_DEEP} 100%)`,
      fontFamily: "'Noto Serif JP', 'Noto Sans JP', serif",
      fontWeight: 900,
      fontSize: 64,
      color: '#fff',
      letterSpacing: '0.14em',
      lineHeight: 1.0,
      textShadow: '0 2px 8px rgba(80,20,0,0.65), 0 1px 0 rgba(255,255,255,0.18)',
      maxHeight: RIGHT_H - 130,
      boxShadow: `
        0 14px 48px rgba(200,60,20,0.5),
        inset 0 2px 0 rgba(255,255,255,0.3),
        inset 0 -2px 0 rgba(80,20,0,0.4),
        inset 3px 0 0 rgba(255,255,255,0.18),
        inset -3px 0 0 rgba(80,20,0,0.3)
      `,
      marginTop: 30,
    }}>
      {/* 上下のゴールドのキャップ */}
      <div style={{
        position: 'absolute', top: -3, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${GOLD_DEEP}, ${GOLD_BRIGHT}, ${GOLD_DEEP})`,
      }}/>
      <div style={{
        position: 'absolute', bottom: -3, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${GOLD_DEEP}, ${GOLD_BRIGHT}, ${GOLD_DEEP})`,
      }}/>
      {/* 左右のゴールドエッジ */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: -1, width: 1, background: GOLD_BRIGHT, opacity: 0.7 }}/>
      <div style={{ position: 'absolute', top: 0, bottom: 0, right: -1, width: 1, background: GOLD_DEEP, opacity: 0.7 }}/>
      {text}
    </div>
  );
}

function QBadge() {
  return (
    <div style={{
      flexShrink: 0,
      paddingTop: 18,
      fontFamily: "'Noto Serif JP', serif",
      fontWeight: 900,
      fontSize: 130,
      lineHeight: 0.95,
      letterSpacing: '0.02em',
      background: `linear-gradient(180deg, ${GOLD_BRIGHT} 0%, ${GOLD} 50%, ${GOLD_DEEP} 100%)`,
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
      filter: 'drop-shadow(0 4px 22px rgba(0,0,0,0.85)) drop-shadow(0 0 18px rgba(245,215,110,0.45))',
      position: 'relative',
    }}>
      Q
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// BottomChoices: 3 つの選択肢カード (カメラ幅、グラスモーフィズム + ゴールド縁)
// ═══════════════════════════════════════════════════════════════════
function BottomChoices({ choices, lang }: { choices: CgMappedEntry[]; lang: 'ja' | 'en' }) {
  return (
    <div style={{
      position: 'absolute',
      left: CAM_X,
      top: CHOICES_Y,
      width: CAM_W,
      height: CHOICES_H,
      display: 'grid',
      gridTemplateColumns: `repeat(${Math.max(1, choices.length)}, 1fr)`,
      gap: 18,
    }}>
      {choices.map((e, i) => (
        <ChoiceCard key={e.id} index={i + 1} entry={e} lang={lang}/>
      ))}
      {choices.length === 0 && (
        <div style={{ gridColumn: '1/-1', alignSelf: 'center', textAlign: 'center', color: 'rgba(245,215,110,0.6)', fontSize: 22, letterSpacing: '0.2em' }}>
          選択肢が未設定
        </div>
      )}
    </div>
  );
}

function ChoiceCard({ index, entry, lang }: { index: number; entry: CgMappedEntry; lang: 'ja' | 'en' }) {
  const palette = [
    { core: '#3F72D9', deep: '#0E2956', glow: 'rgba(120,170,255,0.45)' },
    { core: '#D03F36', deep: '#5A0C0C', glow: 'rgba(255,130,110,0.45)' },
    { core: '#2EA866', deep: '#0B3B25', glow: 'rgba(120,230,160,0.45)' },
  ][index - 1] ?? { core: '#666', deep: '#222', glow: 'rgba(180,180,180,0.4)' };

  const name = lang === 'en' ? (entry.nameEn || entry.name) : entry.name;
  const company = lang === 'en' ? (entry.orgEn || entry.company) : entry.company;

  return (
    <div style={{
      position: 'relative',
      height: '100%',
      borderRadius: 12,
      overflow: 'visible',
      background: `linear-gradient(160deg, ${palette.core} 0%, ${palette.deep} 100%)`,
      boxShadow: `
        0 18px 40px rgba(0,0,0,0.65),
        0 0 40px ${palette.glow},
        inset 0 2px 0 rgba(255,255,255,0.28),
        inset 0 -2px 0 rgba(0,0,0,0.4),
        inset 0 0 0 1px rgba(245,215,110,0.7)
      `,
    }}>
      {/* 上端のハイライト */}
      <div style={{
        position: 'absolute',
        top: 1, left: 12, right: 12, height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)',
      }}/>
      {/* 内側の薄ホエアライン */}
      <div style={{
        position: 'absolute', inset: 4,
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 8,
        pointerEvents: 'none',
      }}/>
      {/* 内側のラジアル スポット */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 30% 0%, rgba(255,255,255,0.18), transparent 55%)',
        borderRadius: 12,
        pointerEvents: 'none',
      }}/>

      {/* 番号バッジ (六角形 + 内側エンボス) */}
      <NumberBadge index={index} accent={palette.core}/>

      {/* 名前 + 会社 */}
      <div style={{
        position: 'absolute',
        left: 96, right: 22,
        top: '50%',
        transform: 'translateY(-50%)',
      }}>
        <div style={{
          fontFamily: "'Noto Sans JP', sans-serif",
          fontWeight: 900,
          fontSize: 30,
          color: '#fff',
          letterSpacing: '0.02em',
          lineHeight: 1.1,
          textShadow: '0 2px 6px rgba(0,0,0,0.7)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>{name}</div>
        {company && (
          <div style={{
            marginTop: 6,
            fontFamily: "'Noto Sans JP', sans-serif",
            fontSize: 16,
            color: 'rgba(255,255,255,0.85)',
            letterSpacing: '0.06em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>{company}</div>
        )}
      </div>
    </div>
  );
}

function NumberBadge({ index, accent }: { index: number; accent: string }) {
  return (
    <div style={{
      position: 'absolute',
      left: -8, top: '50%',
      transform: 'translateY(-50%)',
      width: 96, height: 96,
      filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.55))',
    }}>
      {/* 六角形 (大) — 外周 */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(180deg, ${GOLD_BRIGHT}, ${GOLD} 45%, ${GOLD_DEEP} 100%)`,
        clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
      }}/>
      {/* 六角形 (内) */}
      <div style={{
        position: 'absolute', inset: 6,
        background: `radial-gradient(circle at 35% 30%, #fff 0%, ${accent} 55%, #111 100%)`,
        clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
      }}/>
      {/* 内側ハイライト */}
      <div style={{
        position: 'absolute', left: 18, top: 14, right: 36, height: 22,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.55), transparent)',
        clipPath: 'polygon(0 0, 100% 0, 80% 100%, 20% 100%)',
        filter: 'blur(2px)',
      }}/>
      {/* 数字 */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Noto Serif JP', 'Bebas Neue', serif",
        fontWeight: 900,
        fontSize: 54,
        color: '#fff',
        textShadow: '0 3px 6px rgba(0,0,0,0.7), 0 0 8px rgba(255,255,255,0.5)',
        letterSpacing: '0',
      }}>{index}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Countdown: 右下、丸は固定サイズ、ラスト 5 秒は数字を強調するだけ
// ═══════════════════════════════════════════════════════════════════
function Countdown({ secs, ratio, isLast5, isLast10 }: {
  secs: number; ratio: number; isLast5: boolean; isLast10: boolean;
}) {
  const size = 210;           // 固定サイズ
  const r = size / 2 - 10;
  const fontPx = isLast5 ? 175 : 140; // ラスト 5 秒は数字だけ少し大きく
  const accent = isLast10 ? '#ff7a5a' : GOLD_BRIGHT;
  const halo = isLast5
    ? '0 0 80px rgba(255,90,40,0.85), 0 0 40px rgba(255,160,60,0.55)'
    : isLast10
      ? '0 0 36px rgba(255,90,40,0.55)'
      : '0 0 36px rgba(245,215,110,0.4)';

  return (
    <div style={{
      position: 'absolute',
      right: 60, bottom: 36,
      width: size, height: size,
      animation: isLast5 ? 'pollLast5Pulse 1s ease-in-out infinite' : 'none',
    }}>
      <style>{`
        @keyframes pollLast5Pulse {
          0%, 100% { filter: drop-shadow(0 0 14px rgba(255,90,40,0.6)); }
          50%      { filter: drop-shadow(0 0 32px rgba(255,160,60,0.95)); }
        }
      `}</style>

      {/* 外側 ホエアライン */}
      <div style={{ position: 'absolute', inset: -10, borderRadius: '50%', border: '1px solid rgba(245,215,110,0.45)' }}/>
      <div style={{ position: 'absolute', inset: -20, borderRadius: '50%', border: '1px solid rgba(245,215,110,0.15)' }}/>

      {/* メイン本体 */}
      <div style={{
        position: 'absolute', inset: 0,
        borderRadius: '50%',
        background: isLast10
          ? 'radial-gradient(circle at 30% 25%, rgba(200,50,30,0.95), rgba(50,8,8,0.97))'
          : 'radial-gradient(circle at 30% 25%, rgba(32,36,58,0.95), rgba(10,12,22,0.97))',
        border: `4px solid ${accent}`,
        boxShadow: `${halo}, inset 0 3px 0 rgba(255,255,255,0.22), inset 0 -10px 30px rgba(0,0,0,0.55)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <SlideDigits value={secs} fontSize={fontPx} color="#fff"/>
      </div>

      {/* プログレス アーク */}
      <svg width={size} height={size} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)', pointerEvents: 'none' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={3}/>
        <circle
          cx={size/2} cy={size/2} r={r}
          fill="none"
          stroke={accent}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={`${2 * Math.PI * r}`}
          strokeDashoffset={`${2 * Math.PI * r * (1 - ratio)}`}
          opacity={0.95}
          style={{ transition: 'stroke-dashoffset 0.1s linear', filter: `drop-shadow(0 0 8px ${accent})` }}
        />
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SlideDigits: 旧桁が下にワイプアウト + 新桁が上から滑り込む
// ═══════════════════════════════════════════════════════════════════
function SlideDigits({ value, fontSize, color }: { value: number; fontSize: number; color: string }) {
  const str = String(Math.max(0, value)); // minDigits=1: 1 桁時はゼロパディングなし
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: fontSize * 0.02 }}>
      {str.split('').map((ch, i) => (
        <SlideDigit key={`${i}-${str.length}`} char={ch} fontSize={fontSize} color={color}/>
      ))}
    </div>
  );
}

interface Slide { key: number; ch: string; entering: boolean; }
let __slideKey = 0;
function SlideDigit({ char, fontSize, color }: { char: string; fontSize: number; color: string }) {
  const [slides, setSlides] = useState<Slide[]>(() => [{ key: __slideKey++, ch: char, entering: false }]);
  useEffect(() => {
    setSlides((prev) => {
      const top = prev[prev.length - 1];
      if (top && top.ch === char) return prev;
      return [...prev, { key: __slideKey++, ch: char, entering: true }];
    });
  }, [char]);
  useEffect(() => {
    if (slides.length <= 1) return;
    const id = window.setTimeout(() => setSlides((c) => (c.length > 1 ? c.slice(1) : c)), 560);
    return () => window.clearTimeout(id);
  }, [slides]);
  const w = fontSize * 0.62;
  const h = fontSize * 1.0;
  return (
    <div style={{ position: 'relative', width: w, height: h, overflow: 'hidden', display: 'inline-block' }}>
      <style>{`
        @keyframes pollDigitIn  { from { transform: translateY(-100%); opacity: 0; } to { transform: translateY(0);   opacity: 1; } }
        @keyframes pollDigitOut { from { transform: translateY(0);    opacity: 1; } to { transform: translateY(100%); opacity: 0; } }
      `}</style>
      {slides.map((s, idx) => {
        const isCurrent = idx === slides.length - 1;
        const anim = isCurrent
          ? (s.entering ? 'pollDigitIn 520ms cubic-bezier(.22,.85,.32,1) forwards' : 'none')
          : 'pollDigitOut 520ms cubic-bezier(.4,0,.66,.4) forwards';
        return (
          <div key={s.key} style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize, fontWeight: 900, color, lineHeight: 1,
            animation: anim, willChange: 'transform, opacity',
            textShadow: '0 2px 8px rgba(0,0,0,0.7)',
          }}>{s.ch}</div>
        );
      })}
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
