// テロップCG — ランキング発表: Celebration（受賞者祝賀・紙吹雪）の移植（段6-5 第2弾）。
//
// 完全再現の対象（数値の正は旧実装インライン値）:
//   client-awards/src/cg/steps/StepCelebration.tsx
//   （mulberry32紙吹雪・celebGlow・celebCardIn・celebTitleIn の各タイミング値）
//
// 旧実装は「同じ賞名を持つ複数カテゴリのNo.1を横並びで一緒に祝う」演出だったが、
// 新エンジンは1ページ＝1つの賞（docs/design/v4/graphics-awards-migration-plan.md §2-3）
// のため、**このページ自身の受賞者（呼び出し元＝rankingParts.tsx が isWinner /
// winnerEntryIndex から絞り込んで渡す）を祝う演出に簡略化する**（複数部門合同祝賀は
// 対象外・ユーザーの明示許可）。受賞者が0件のときは何も描画しない（呼び出し元と
// この場の二重防御）。
//
// ceremony-gold は旧実装の「Congratulations!」タイトル（金グラデ＋celebGlow）・紙吹雪・
// celebCardIn のタイミング値をそのまま持つ。他3テーマは面・エッジ・罫の確立済み語彙
// （rankingParts.tsx の RankingHeadline・rankingPartsExtra2.tsx の getTop3Theme と
// 同じ考え方）で書き直す（新規意匠は起こさない）。紙吹雪の7色は演出上どのテーマでも
// 共通の祝祭色でよい（旧実装のまま・意図的な簡略化）。
import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { pickLangValue, type GraphicsLang } from './langField';
import type { RankingEntry } from './rankingFields';
import {
  CORPORATE_ACCENT, EDGE_DARK, GOTHIC, NEWS_NAVY, SERIF, WHITE, type TelopThemeKey,
} from './telopTheme';

// 全面の暗幕（rankingParts.tsx の FULL_SCRIM と同じ考え方・値。private 定数なので
// 各ファイルで自前に持つ規約——ここが抜けていると、金文字が白背景に沈んで消えて見える
// 統合検証で見つけた実バグの修正）
const FULL_SCRIM: CSSProperties = {
  position: 'absolute', inset: 0,
  background: 'radial-gradient(ellipse 130% 105% at 50% 42%, rgba(20, 24, 33, 0.86) 0%, rgba(8, 10, 15, 0.94) 62%, rgba(3, 4, 7, 0.97) 100%)',
};

// 旧 StepCelebration.tsx の紙吹雪7色そのまま（テーマ共通・意図的な簡略化）
const CONFETTI_COLORS = ['#F5D76E', '#ffb347', '#fff7c2', '#ff7d6b', '#5db4ff', '#7eea9c', '#c46ee0'];

// 旧 StepCelebration.tsx の mulberry32（シード20260620固定）をそのまま移植
function mulberry32(seed: number) {
  let a = seed;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ConfettiPiece {
  x: number; delay: number; dur: number; rot: number; color: string; w: number; h: number; drift: number;
}

/** 旧実装のパラメータ算出式そのまま（60個・シード20260620で毎回同じ配置になる） */
function buildConfetti(): ConfettiPiece[] {
  const rnd = mulberry32(20260620);
  return Array.from({ length: 60 }).map((_, i) => ({
    x: rnd() * 1920,
    delay: rnd() * 0.6,
    dur: 3 + rnd() * 2.5,
    rot: rnd() * 360,
    color: CONFETTI_COLORS[i % 7],
    w: 8 + rnd() * 10,
    h: 14 + rnd() * 18,
    drift: -50 + rnd() * 100,
  }));
}

// 旧実装の4 keyframes をそのまま移植（celebConfettiFall / celebTitleIn / celebCardIn / celebGlow）
const CELEB_KEYFRAMES = `
@keyframes celebConfettiFall {
  0%   { transform: translate(0,-60px) rotate(0deg); opacity: 0; }
  5%   { opacity: 1; }
  100% { transform: translate(var(--drift, 0px), 1240px) rotate(720deg); opacity: 0.85; }
}
@keyframes celebTitleIn {
  from { opacity: 0; transform: translateY(-30px) scale(0.92); }
  to   { opacity: 1; transform: translateY(0)    scale(1); }
}
@keyframes celebCardIn {
  from { opacity: 0; transform: translateY(40px) scale(0.92); }
  to   { opacity: 1; transform: translateY(0)    scale(1); }
}
@keyframes celebGlow {
  0%, 100% {
    filter:
      drop-shadow(2px 2px 0 rgba(0,0,0,0.92)) drop-shadow(-2px 2px 0 rgba(0,0,0,0.92))
      drop-shadow(2px -2px 0 rgba(0,0,0,0.92)) drop-shadow(-2px -2px 0 rgba(0,0,0,0.92))
      drop-shadow(0 4px 14px rgba(0,0,0,0.9)) drop-shadow(0 0 18px rgba(245,215,110,0.55));
  }
  50% {
    filter:
      drop-shadow(2px 2px 0 rgba(0,0,0,0.92)) drop-shadow(-2px 2px 0 rgba(0,0,0,0.92))
      drop-shadow(2px -2px 0 rgba(0,0,0,0.92)) drop-shadow(-2px -2px 0 rgba(0,0,0,0.92))
      drop-shadow(0 4px 14px rgba(0,0,0,0.9)) drop-shadow(0 0 30px rgba(255,200,80,0.95));
  }
}`;

interface CardAccent { border: string; glow: string; inner: string; company: string; }

/** 受賞者カードの縁・グロー色。ceremony-gold は旧 CelebrationCard のインライン値そのまま */
function cardAccentOf(theme: TelopThemeKey): CardAccent {
  if (theme === 'news-navy') {
    return { border: 'rgba(255,255,255,0.85)', glow: 'rgba(255,255,255,0.25)', inner: 'rgba(255,255,255,0.25)', company: '#cfd8e6' };
  }
  if (theme === 'corporate-light') {
    return { border: CORPORATE_ACCENT, glow: 'rgba(47,111,237,0.3)', inner: 'rgba(47,111,237,0.25)', company: '#dbe6ff' };
  }
  if (theme === 'variety-pop') {
    return { border: 'rgba(255,212,0,0.9)', glow: 'rgba(255,212,0,0.3)', inner: 'rgba(255,212,0,0.25)', company: '#ffe98a' };
  }
  // ceremony-gold — 旧実装の完全再現
  return { border: 'rgba(245,215,110,0.9)', glow: 'rgba(245,215,110,0.3)', inner: 'rgba(245,215,110,0.25)', company: 'rgba(245,215,110,0.95)' };
}

/** タイトル: 「Congratulations!」相当。ceremony-gold は旧実装の金グラデ＋celebGlowをそのまま、
 * 他3テーマは面・エッジ・罫の確立済み語彙で書き直す（新規意匠は起こさない） */
function CelebrationTitle({ theme, subtitle }: { theme: TelopThemeKey; subtitle: string }) {
  const subtitleStyle: CSSProperties = {
    marginTop: 16, fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 28, fontWeight: 700,
    letterSpacing: '0.14em', textAlign: 'center', padding: '0 80px', maxWidth: 1728,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  };

  if (theme === 'ceremony-gold') {
    return (
      <div style={{ animation: 'celebTitleIn 900ms cubic-bezier(.2,1,.3,1) 100ms backwards' }}>
        <div style={{
          fontFamily: "'Titillium Web', 'Noto Sans JP', sans-serif", fontSynthesis: 'none',
          fontWeight: 700, fontStyle: 'italic', fontSize: 140, lineHeight: 1, letterSpacing: '0.02em',
          paddingBottom: '0.15em', textAlign: 'center',
          backgroundImage: 'linear-gradient(180deg, #FFFBE6 0%, #FFEFB0 18%, #F5D76E 45%, #C9A24B 75%, #8C6314 100%)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', WebkitTextFillColor: 'transparent',
          filter: 'drop-shadow(2px 2px 0 rgba(0,0,0,0.92)) drop-shadow(-2px 2px 0 rgba(0,0,0,0.92)) drop-shadow(2px -2px 0 rgba(0,0,0,0.92)) drop-shadow(-2px -2px 0 rgba(0,0,0,0.92)) drop-shadow(0 4px 14px rgba(0,0,0,0.9))',
          animation: 'celebGlow 2.4s ease-in-out infinite',
        }}
        >
          Congratulations!
        </div>
        {subtitle && (
          <div style={{
            ...subtitleStyle, color: '#F5D76E',
            textShadow: '-2px -2px 0 rgba(0,0,0,0.9), 2px -2px 0 rgba(0,0,0,0.9), -2px 2px 0 rgba(0,0,0,0.9), 2px 2px 0 rgba(0,0,0,0.9), 0 2px 12px rgba(0,0,0,0.95)',
          }}
          >
            {subtitle}
          </div>
        )}
      </div>
    );
  }

  if (theme === 'news-navy') {
    return (
      <div style={{ textAlign: 'center', animation: 'celebTitleIn 900ms cubic-bezier(.2,1,.3,1) 100ms backwards' }}>
        <div style={{ display: 'inline-block', background: NEWS_NAVY, color: WHITE, fontFamily: GOTHIC, fontSynthesis: 'none', fontWeight: 900, fontSize: 96, letterSpacing: '0.04em', lineHeight: 1.2, padding: '16px 46px 18px', boxShadow: '0 3px 10px rgba(0,0,0,0.35)' }}>
          Congratulations!
        </div>
        {subtitle && <div style={{ ...subtitleStyle, color: '#cfd8e6' }}>{subtitle}</div>}
      </div>
    );
  }

  if (theme === 'variety-pop') {
    return (
      <div style={{ textAlign: 'center', animation: 'celebTitleIn 900ms cubic-bezier(.2,1,.3,1) 100ms backwards' }}>
        <div style={{ display: 'inline-block', background: '#ffd400', color: '#151515', fontFamily: GOTHIC, fontSynthesis: 'none', fontWeight: 900, fontSize: 96, letterSpacing: '0.02em', lineHeight: 1.2, padding: '14px 40px 18px', boxShadow: '6px 6px 0 rgba(10,10,10,0.7)' }}>
          Congratulations!
        </div>
        {subtitle && <div style={{ ...subtitleStyle, color: '#ffd400' }}>{subtitle}</div>}
      </div>
    );
  }

  // corporate-light
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', animation: 'celebTitleIn 900ms cubic-bezier(.2,1,.3,1) 100ms backwards' }}>
      <div style={{ color: WHITE, fontFamily: GOTHIC, fontSynthesis: 'none', fontWeight: 900, fontSize: 96, letterSpacing: '0.04em', lineHeight: 1.2, textAlign: 'center', ...EDGE_DARK }}>
        Congratulations!
      </div>
      <div style={{ height: 3, width: '60%', background: CORPORATE_ACCENT, marginTop: 20 }} />
      {subtitle && <div style={{ ...subtitleStyle, color: CORPORATE_ACCENT }}>{subtitle}</div>}
    </div>
  );
}

function CelebrationCard({ entry, theme, lang, width, height, delay }: {
  entry: RankingEntry; theme: TelopThemeKey; lang?: GraphicsLang; width: number; height: number; delay: number;
}) {
  const name = pickLangValue(entry.name, entry.nameEn ?? '', lang);
  const company = pickLangValue(entry.company ?? '', entry.companyEn ?? '', lang);
  const a = cardAccentOf(theme);
  return (
    <div style={{ width, flexShrink: 0, opacity: 0, animation: `celebCardIn 900ms cubic-bezier(.2,1,.3,1) ${delay}ms forwards` }}>
      <div style={{
        width, height, background: 'linear-gradient(180deg, #181012, #0a0608)',
        border: `2px solid ${a.border}`, boxShadow: `0 18px 36px rgba(0,0,0,0.7), 0 0 28px ${a.glow}`,
        overflow: 'hidden', position: 'relative',
      }}
      >
        {entry.photoUrl ? (
          <img src={entry.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 80 }}>—</div>
        )}
        <div style={{ position: 'absolute', inset: 4, border: `1px solid ${a.inner}`, pointerEvents: 'none' }} />
      </div>
      <div style={{ marginTop: 12, textAlign: 'center', padding: '0 6px' }}>
        <div style={{
          fontFamily: theme === 'ceremony-gold' ? SERIF : GOTHIC, fontSynthesis: 'none', fontWeight: 900, fontSize: 24,
          color: WHITE, letterSpacing: '0.04em', lineHeight: 1.15, fontFeatureSettings: "'palt' 1",
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
        >
          {name}
        </div>
        {company && (
          <div style={{ marginTop: 2, fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 14, color: a.company, letterSpacing: '0.14em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {company}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * `celebration` ステップ: このページ自身の受賞者（`entries`。呼び出し元が isWinner /
 * winnerEntryIndex から絞り込んで渡す）を紙吹雪＋タイトルで祝う。0件なら呼ばれない前提
 * だが（rankingParts.tsx 側で早期return済み）、念のためここでも二重防御する。
 */
export function RankingCelebration({ entries, theme, lang, awardName }: {
  entries: RankingEntry[]; theme: TelopThemeKey; lang?: GraphicsLang; awardName?: string;
}) {
  const confetti = useMemo(buildConfetti, []);
  if (entries.length === 0) return null;

  const n = entries.length;
  const padX = 80;
  const availW = 1920 - padX * 2;
  const cardW = Math.max(180, Math.min(360, Math.floor((availW - 24 * (n - 1)) / Math.max(1, n))));
  const cardH = Math.round(cardW * (4 / 3));

  return (
    <div style={FULL_SCRIM}>
      <style>{CELEB_KEYFRAMES}</style>

      {/* 紙吹雪 */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {confetti.map((c, i) => (
          <div
            key={i}
            style={{
              position: 'absolute', left: c.x, top: -20, width: c.w, height: c.h,
              background: c.color, opacity: 0.9,
              '--drift': `${c.drift}px`,
              animation: `celebConfettiFall ${c.dur}s linear infinite`,
              animationDelay: `${c.delay}s`,
              transform: `rotate(${c.rot}deg)`,
              boxShadow: '0 0 6px rgba(255,255,255,0.3)',
            } as CSSProperties & Record<'--drift', string>}
          />
        ))}
      </div>

      {/* タイトル */}
      <div style={{ position: 'absolute', top: 90, left: 0, right: 0, textAlign: 'center' }}>
        <CelebrationTitle theme={theme} subtitle={awardName ?? ''} />
      </div>

      {/* 受賞者横並び */}
      <div style={{ position: 'absolute', left: padX, right: padX, top: 380, display: 'flex', gap: 24, justifyContent: 'center', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        {entries.map((e, i) => (
          <CelebrationCard key={i} entry={e} theme={theme} lang={lang} width={cardW} height={cardH} delay={300 + i * 180} />
        ))}
      </div>
    </div>
  );
}
