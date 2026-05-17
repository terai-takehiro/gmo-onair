import { useEffect, useState, useMemo } from 'react';
import type { CgCategory, CgMappedEntry } from '../types';
import { POLL_DURATION_MS } from '../types';

interface Props {
  category: CgCategory | null;
  entries: CgMappedEntry[];
  startedAt: number | null;
  lang: 'ja' | 'en';
  transparent?: boolean;
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

// 選択肢ベース: 高さは元 (140) を維持、下端をカウントダウン丸の下端 (1080-36=1044) に合わせる
const CHOICES_H = 140;
const CHOICES_Y = 1080 - 36 - CHOICES_H; // = 904

const GOLD_BRIGHT = '#FFE8A8';
const GOLD = '#E8C56C';
const GOLD_DEEP = '#9E7B2E';
export default function StepPoll({ category, entries, startedAt, lang, transparent = false }: Props) {
  const choices = useMemo(() => entries.filter((e) => e.rank >= 1 && e.rank <= 3), [entries]);
  const title = lang === 'en'
    ? (category?.poll_title_en || category?.poll_title || category?.name_en || category?.name || '')
    : (category?.poll_title || category?.name || '');
  const rawQuestion = lang === 'en'
    ? (category?.poll_question_en || category?.poll_question || 'Who deserves the award?')
    : (category?.poll_question || 'ふさわしいのは？');
  // 縦書き時は半角 ?/! を全角に正規化して中央配置になるように
  const question = lang === 'ja' ? rawQuestion.replace(/\?/g, '？').replace(/!/g, '！') : rawQuestion;

  const [remaining, setRemaining] = useState(POLL_DURATION_MS);
  useEffect(() => {
    if (startedAt == null) { setRemaining(POLL_DURATION_MS); return; }
    const tick = () => setRemaining(Math.max(0, POLL_DURATION_MS - (Date.now() - startedAt)));
    tick();
    const id = window.setInterval(tick, 80);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const secs = Math.ceil(remaining / 1000);
  const isLast5 = secs <= 5; // 0 秒も同じ拡大サイズを維持
  const isLast10 = secs <= 10;

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'transparent', fontFamily: "'Noto Sans JP', sans-serif" }}>
      <Atmosphere transparent={transparent} />
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
// Atmosphere: モバイル Safari でクラッシュしないよう軽量化版。
// CSS mask + mix-blend-mode + 多数 SVG drop-shadow の組合せが
// WebKit content process を OOM クラッシュさせるため:
//   - mask-composite を廃止 → カメラ枠の周り 4 領域に分割描画
//   - mix-blend-mode: screen を撤去 (composite layer の爆発を防ぐ)
//   - SVG 粒子 36 → 14 + drop-shadow 撤去 (CSS box-shadow ベース)
// ═══════════════════════════════════════════════════════════════════
function Atmosphere({ transparent = false }: { transparent?: boolean }) {
  const particles = useMemo(() => {
    const rnd = mulberry32(20260615);
    return Array.from({ length: 14 }).map(() => {
      let x = rnd() * 1920;
      let y = rnd() * 1080;
      // カメラ枠領域に重ならないよう適度に避ける
      if (x > CAM_X && x < CAM_X + CAM_W && y > CAM_Y && y < CAM_Y + CAM_H) {
        if (rnd() > 0.5) y = CAM_Y + CAM_H + rnd() * (1080 - CAM_Y - CAM_H - 30);
        else x = CAM_X + CAM_W + rnd() * (1920 - CAM_X - CAM_W - 30);
      }
      return {
        x, y,
        r: 2 + rnd() * 3,
        o: 0.45 + rnd() * 0.4,
        delay: -rnd() * 5,
        dur: 4 + rnd() * 4,
      };
    });
  }, []);

  // ベースグラデを 4 領域に分割: カメラ枠を「物理的に」避ける
  const base = transparent ? 'transparent' : `
    radial-gradient(ellipse 70% 50% at 50% 5%,  rgba(220,170,90,0.18), transparent 60%),
    radial-gradient(ellipse 75% 80% at 50% 60%, rgba(60,40,20,0.55), rgba(8,6,12,1) 70%),
    linear-gradient(180deg, #0c0a14 0%, #060409 100%)
  `;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <style>{`
        @keyframes pollBokeh {
          0%, 100% { opacity: 0.35; transform: scale(0.85); }
          50%      { opacity: 1;   transform: scale(1.2); }
        }
      `}</style>

      {/* ベース 4 領域 (カメラ枠を囲む 上 / 下 / 左 / 右) */}
      {!transparent && (
        <>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: CAM_Y, background: base, backgroundAttachment: 'fixed' }}/>
          <div style={{ position: 'absolute', top: CAM_Y + CAM_H, left: 0, right: 0, bottom: 0, background: base, backgroundAttachment: 'fixed' }}/>
          <div style={{ position: 'absolute', top: CAM_Y, left: 0, width: CAM_X, height: CAM_H, background: base, backgroundAttachment: 'fixed' }}/>
          <div style={{ position: 'absolute', top: CAM_Y, left: CAM_X + CAM_W, right: 0, height: CAM_H, background: base, backgroundAttachment: 'fixed' }}/>
        </>
      )}

      {/* ボケ粒子 (軽量: box-shadow ベース、SVG filter なし) */}
      {particles.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: p.x - p.r,
            top: p.y - p.r,
            width: p.r * 2, height: p.r * 2,
            borderRadius: '50%',
            background: '#fff3c4',
            opacity: p.o,
            boxShadow: `0 0 ${p.r * 3}px rgba(245,215,110,0.7)`,
            animation: `pollBokeh ${p.dur}s ease-in-out infinite`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}

      {/* 床のリフレクション (CAM_Y+CAM_H 以下のみ、軽い) */}
      {!transparent && (
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, height: 200,
          background: 'linear-gradient(180deg, transparent 0%, rgba(245,215,110,0.07) 60%, transparent 100%)',
        }}/>
      )}
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
// RightColumn: 右に [Q + タイトル縦書き] スタック、左に質問縦書き
// アワード金基調 (オレンジ廃止)
// ═══════════════════════════════════════════════════════════════════
function RightColumn({ title, question, isJa }: { title: string; question: string; isJa: boolean }) {
  if (!isJa) {
    return (
      <div style={{
        position: 'absolute',
        left: RIGHT_X, top: RIGHT_Y,
        width: RIGHT_W, height: RIGHT_H,
        display: 'flex', flexDirection: 'column',
        alignItems: 'flex-end',
        paddingTop: 40, paddingRight: 24,
      }}>
        <div style={{
          fontFamily: "'Titillium Web', sans-serif",
          fontWeight: 700, fontStyle: 'italic',
          fontSize: 130, lineHeight: 1,
          background: `linear-gradient(180deg, ${GOLD_BRIGHT} 0%, ${GOLD} 60%, ${GOLD_DEEP} 100%)`,
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          filter: 'drop-shadow(0 4px 22px rgba(0,0,0,0.85))',
          marginBottom: 18, padding: '4px 8px',
        }}>Q</div>
        <TitleBand text={title} horizontal />
        <div style={{
          marginTop: 22,
          fontFamily: "'Noto Sans JP', sans-serif",
          fontWeight: 900, fontSize: 44, color: '#fff',
          letterSpacing: '0.02em',
          textShadow: '0 2px 16px rgba(0,0,0,0.85)',
          lineHeight: 1.15, textAlign: 'right',
        }}>{question}</div>
      </div>
    );
  }
  // JA: 上に Q、その下に [質問 縦書き] [タイトル 縦書き] の 2 列。
  // Q は 2 列の上で水平センタリング。
  const innerColMaxH = RIGHT_H - 200;  // Q の高さ分を引いた縦書き列の最大高さ
  // 質問 縦書きはカウントダウン (top: 820 = 1080-50-210) に被らないように
  // 行 top (~297) からの maxHeight = 820 - 297 - 30 margin = 493
  const questionMaxH = 490;
  return (
    <div style={{
      position: 'absolute',
      left: RIGHT_X, top: RIGHT_Y,
      width: RIGHT_W, height: RIGHT_H,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingTop: 6,
      paddingRight: 16,
    }}>
      {/* Q (上、両列の中央) */}
      <div style={{
        fontFamily: "'Titillium Web', sans-serif",
        fontWeight: 700, fontStyle: 'italic',
        fontSize: 150, lineHeight: 1,
        background: `linear-gradient(180deg, ${GOLD_BRIGHT} 0%, ${GOLD} 50%, ${GOLD_DEEP} 100%)`,
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        filter: 'drop-shadow(0 4px 22px rgba(0,0,0,0.85)) drop-shadow(0 0 18px rgba(245,215,110,0.45))',
        padding: '8px 16px 18px',
        flexShrink: 0,
      }}>Q</div>

      {/* 区切り ヘアライン */}
      <div style={{
        width: 140, height: 1, marginBottom: 14,
        background: `linear-gradient(90deg, transparent, ${GOLD_BRIGHT}, transparent)`,
        opacity: 0.85,
      }}/>

      {/* 質問 + タイトル の 2 列 (横並び縦書き) */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'center',
        gap: 22,
      }}>
        <VerticalText
          text={question}
          fontSize={62}
          color="#fff"
          weight={900}
          maxHeight={questionMaxH}
        />
        <TitleBand text={title} maxH={innerColMaxH} />
      </div>
    </div>
  );
}

/** 縦書きテキスト: 長文時は letter-spacing + font-feature-settings: "palt" で長体化、
 *  さらに maxHeight を超える場合は scaleY で圧縮してレイアウトを崩さない。 */
function VerticalText({ text, fontSize, color, weight, maxHeight }: {
  text: string; fontSize: number; color: string; weight: number; maxHeight: number;
}) {
  // 1 行に収まるよう 長体 scale を計算 (改行不可)。最低 0.40 まで圧縮可能。
  const charsApprox = text.length;
  const naturalH = charsApprox * fontSize * 1.0;
  const scale = naturalH > maxHeight ? Math.max(0.40, maxHeight / naturalH) : 1;
  const isLong = scale < 1;
  return (
    <div style={{
      maxHeight,
      display: 'flex', alignItems: 'flex-start',   // 上合わせ
      flexShrink: 0,
    }}>
      <div style={{
        writingMode: 'vertical-rl',
        whiteSpace: 'nowrap',                     // 改行禁止 (常に 1 列)
        fontFamily: "'Noto Sans JP', sans-serif",
        fontWeight: weight,
        fontSize,
        color,
        letterSpacing: isLong ? '-0.06em' : '0.04em',
        lineHeight: 1,
        textShadow: '0 4px 22px rgba(0,0,0,0.95), 0 0 14px rgba(245,215,110,0.15)',
        transform: scale < 1 ? `scaleY(${scale})` : 'none',
        transformOrigin: 'top center',            // 上端基準で圧縮
        fontFeatureSettings: '"vert" 1, "palt" 1',
        textOrientation: 'mixed',
      }}>
        {text}
      </div>
    </div>
  );
}

function TitleBand({ text, horizontal = false, maxH }: { text: string; horizontal?: boolean; maxH?: number }) {
  const innerMaxH = maxH ?? (horizontal ? undefined : RIGHT_H - 30);
  const charsApprox = text.length;
  const fontSize = horizontal ? 40 : 60;
  const naturalH = horizontal ? 0 : charsApprox * fontSize * 1.1;
  const scale = (!horizontal && innerMaxH && naturalH > (innerMaxH - 80))
    ? Math.max(0.65, (innerMaxH - 80) / naturalH) : 1;
  const isLong = scale < 1;
  return (
    <div style={{
      position: 'relative',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      writingMode: horizontal ? 'horizontal-tb' : 'vertical-rl',
      padding: horizontal ? '14px 28px' : '30px 22px',
      background: 'linear-gradient(180deg, rgba(38,30,16,0.97) 0%, rgba(18,12,5,0.98) 100%)',
      border: `2px solid ${GOLD}`,
      boxShadow: `
        0 16px 44px rgba(0,0,0,0.7),
        inset 0 2px 0 rgba(255,235,180,0.18),
        inset 0 -2px 0 rgba(0,0,0,0.6),
        0 0 36px rgba(245,215,110,0.22)
      `,
      fontFamily: "'Noto Sans JP', sans-serif",
      fontWeight: 900,
      fontSize,
      letterSpacing: horizontal ? '0.04em' : (isLong ? '0' : '0.14em'),
      lineHeight: 1.0,
      maxHeight: innerMaxH,
      flexShrink: 0,
      fontFeatureSettings: '"palt" 1',
    }}>
      <div style={{ position: 'absolute', inset: -8, border: `1px solid ${GOLD_BRIGHT}`, opacity: 0.5, pointerEvents: 'none' }}/>
      <div style={{ position: 'absolute', inset: -16, border: `1px solid ${GOLD_DEEP}`, opacity: 0.3, pointerEvents: 'none' }}/>
      <div style={{ position: 'absolute', top: -5, left: -5, right: -5, height: 5,
        background: `linear-gradient(90deg, ${GOLD_DEEP}, ${GOLD_BRIGHT}, ${GOLD_DEEP})` }}/>
      <div style={{ position: 'absolute', bottom: -5, left: -5, right: -5, height: 5,
        background: `linear-gradient(90deg, ${GOLD_DEEP}, ${GOLD_BRIGHT}, ${GOLD_DEEP})` }}/>
      <div style={{ position: 'absolute', inset: 6, border: '1px solid rgba(245,215,110,0.28)', pointerEvents: 'none' }}/>
      <span style={{
        background: `linear-gradient(180deg, ${GOLD_BRIGHT} 0%, ${GOLD} 50%, ${GOLD_DEEP} 100%)`,
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.85))',
        transform: scale < 1 ? `scaleY(${scale})` : 'none',
        transformOrigin: 'center center',
        display: 'inline-block',
      }}>{text}</span>
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
        left: 124, right: 22,
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
        fontFamily: "'Noto Sans JP', sans-serif",
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
      right: 100, bottom: 50,
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
  const str = String(Math.max(0, value));
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
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
  const w = fontSize * 0.56;
  const h = fontSize * 1.0;
  return (
    <div style={{ position: 'relative', width: w, height: h, overflow: 'hidden', display: 'inline-block', fontVariantNumeric: 'tabular-nums' }}>
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
            fontFamily: "'Roboto Condensed', sans-serif",
            fontSize, fontWeight: 700, color, lineHeight: 1,
            letterSpacing: '-0.01em',
            fontVariantNumeric: 'tabular-nums',
            animation: anim, willChange: 'transform, opacity',
            textShadow: '0 2px 10px rgba(0,0,0,0.75)',
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
