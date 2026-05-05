import type { CgStep } from '../types';

interface Tweaks {
  eventTitle: string;
  categoryParent: string;
  categoryChild: string;
}

interface Props {
  tweaks: Tweaks;
  stepKey: CgStep | 'strip';
}

const LAYOUTS: Record<string, { x: number; y: number; scale: number; opacity: number }> = {
  title:        { x: 960, y: 540, scale: 1.00, opacity: 1 },
  nominees:     { x: 960, y: 196, scale: 0.58, opacity: 1 },
  strip:        { x: 960, y: 196, scale: 0.58, opacity: 1 },
  ranks52:      { x: 960, y: 130, scale: 0.44, opacity: 1 },
  ranks54:      { x: 960, y: 130, scale: 0.44, opacity: 1 },
  top3:         { x: 960, y: 130, scale: 0.44, opacity: 1 },
  'winner-bar': { x: 960, y: 130, scale: 0.44, opacity: 1 },
  oneshot:      { x: 960, y: 130, scale: 0.32, opacity: 0 },
  idle:         { x: 960, y: 540, scale: 1.00, opacity: 0 },
};

const BASE_FONT = 184;
const LETTER_GAP = 0.08;
const PARENT_BUDGET = 1700;
const CHILD_BASE = 52;
const CHILD_LETTER = 0.4;
const CHILD_BUDGET = 1700;

// タイトル演出の総尺を日本語短文タイトル相当 (~3 秒) に揃えるための per-char stagger 計算。
// child anim 終了時刻 = 700 + N * charDelay + 1100 を TITLE_TARGET_MS に近づける。
// 9 文字 (新卒パートナー部門) は charDelay=140 で ~3000ms、29 文字 (New Graduate Partner Division)
// は charDelay≈40 で同じく ~3000ms に終わる。
const TITLE_PARENT_START = 700;       // 親テキストの最初の文字が出始める時刻
const TITLE_CHILD_TAIL   = 1100;      // child 追加遅延 (200) + child anim (900)
const TITLE_CHAR_DEFAULT = 140;       // 短い文字数のときの既定 stagger（日本語短文用）
const TITLE_CHAR_MIN     = 20;        // 文字数が多い時の下限（連続感を保つため）
const TITLE_TARGET_MS    = 3000;      // タイトル全体（child まで）が終わる目標 (~日本語と同じ)

function titlePerCharDelay(n: number): number {
  const budget = Math.max(0, TITLE_TARGET_MS - TITLE_PARENT_START - TITLE_CHILD_TAIL);
  const idealForBudget = Math.floor(budget / Math.max(n, 1));
  return Math.max(TITLE_CHAR_MIN, Math.min(TITLE_CHAR_DEFAULT, idealForBudget));
}

export default function PersistentHeader({ tweaks, stepKey }: Props) {
  const isTitle = stepKey === 'title';
  const L = LAYOUTS[stepKey] ?? LAYOUTS.title;

  const parent = tweaks.categoryParent ?? '';
  const chars = [...parent];
  const N = chars.length || 1;
  const charDelay = titlePerCharDelay(N);

  // Auto-fit parent font size
  const desiredW = N * BASE_FONT * (1 + LETTER_GAP);
  let parentFontSize = BASE_FONT;
  let parentScaleX = 1;
  if (desiredW > PARENT_BUDGET) {
    parentFontSize = Math.max(120, Math.floor(PARENT_BUDGET / (N * (1 + LETTER_GAP))));
    const wAtNew = N * parentFontSize * (1 + LETTER_GAP);
    if (wAtNew > PARENT_BUDGET) {
      parentScaleX = Math.max(0.7, PARENT_BUDGET / wAtNew);
    }
  }

  // Auto-fit child font size
  const childText = tweaks.categoryChild ?? '';
  const childN = [...childText].length || 1;
  const childDesired = childN * CHILD_BASE * (1 + CHILD_LETTER);
  let childFontSize = CHILD_BASE;
  if (childDesired > CHILD_BUDGET) {
    childFontSize = Math.max(34, Math.floor(CHILD_BUDGET / (childN * (1 + CHILD_LETTER))));
  }

  const goldGrad = {
    background:
      'linear-gradient(180deg, #FFFBE6 0%, #FFEFB0 18%, #F5D76E 45%, #C9A24B 75%, #8C6314 100%)',
    WebkitBackgroundClip: 'text' as const,
    WebkitTextFillColor: 'transparent' as const,
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: `translate(${L.x}px, ${L.y}px) translate(-50%, -50%) scale(${L.scale})`,
        transformOrigin: 'center center',
        opacity: L.opacity,
        pointerEvents: 'none',
        transition: 'transform 880ms cubic-bezier(.7,0,.2,1), opacity 600ms ease',
        willChange: 'transform, opacity',
        zIndex: 10,
        textAlign: 'center',
      }}
    >
      {/* Event title */}
      <div
        className={isTitle ? 'cg-title-event' : undefined}
        style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 28,
          letterSpacing: '0.7em',
          color: '#bfa15a',
          marginBottom: 22,
          paddingLeft: '0.7em',
          whiteSpace: 'nowrap',
        }}
      >
        {tweaks.eventTitle}
      </div>

      {/* Gold hairline */}
      <div
        className={isTitle ? 'cg-title-line' : undefined}
        style={{
          width: 220,
          height: 2,
          background: 'linear-gradient(90deg, transparent, #F5D76E, transparent)',
          margin: '0 auto 22px',
          transformOrigin: 'center',
        }}
      />

      {/* Parent + child category */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 18,
          justifyContent: 'center',
        }}
      >
        {isTitle ? (
          // Per-character animation during title step
          <div
            style={{
              display: 'inline-flex',
              overflow: 'visible',
              transform: parentScaleX !== 1 ? `scaleX(${parentScaleX})` : undefined,
              transformOrigin: 'center center',
            }}
          >
            {chars.map((c, i) => (
              <span
                key={i}
                className="cg-title-char"
                style={{
                  fontFamily: "'Noto Sans JP', sans-serif",
                  fontWeight: 900,
                  fontSize: parentFontSize,
                  lineHeight: 1,
                  letterSpacing: `${LETTER_GAP}em`,
                  ...goldGrad,
                  textShadow: '0 0 80px rgba(245,215,110,0.35)',
                  display: 'inline-block',
                  animationDelay: `${TITLE_PARENT_START + i * charDelay}ms`,
                }}
              >
                {c}
              </span>
            ))}
          </div>
        ) : (
          <div
            style={{
              fontFamily: "'Noto Sans JP', sans-serif",
              fontWeight: 900,
              fontSize: parentFontSize,
              lineHeight: 1,
              letterSpacing: `${LETTER_GAP}em`,
              paddingLeft: `${LETTER_GAP}em`,
              ...goldGrad,
              textShadow: '0 0 60px rgba(245,215,110,0.3)',
              whiteSpace: 'nowrap',
              transform:
                parentScaleX !== 1 ? `scaleX(${parentScaleX})` : undefined,
              transformOrigin: 'center center',
            }}
          >
            {parent}
          </div>
        )}

        <div
          className={isTitle ? 'cg-title-child' : undefined}
          style={{
            fontFamily: "'Noto Sans JP', sans-serif",
            fontWeight: 700,
            fontSize: childFontSize,
            letterSpacing: '0.4em',
            paddingLeft: '0.4em',
            color: '#fff',
            whiteSpace: 'nowrap',
            animationDelay: isTitle
              ? `${TITLE_PARENT_START + chars.length * charDelay + 200}ms`
              : undefined,
          }}
        >
          {childText}
        </div>
      </div>
    </div>
  );
}
