// テロップCG — ランキング発表: TOP3（旧 `StepTop3.tsx`）＋ファイナルピッチ（旧 `StepFinalPitch.tsx`）の移植。
//
// 段6-5・完全再現の対象（数値の正は旧実装インライン値）。ceremony-gold は値をそのまま持つ。
// 他3テーマは rankingTheme.ts の色語彙に差し替えるだけ（レイアウト・タイミング・イージングは
// 4テーマ共通で変えない）。400行規律のため rankingPartsExtra.tsx（RankingBars）とは別ファイル。
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { RankingCountUp } from './RankingCountUp';
import { pickLangValue, type GraphicsLang } from './langField';
import type { RankingEntry } from './rankingFields';
import { getFinalPitchTheme, getTop3Theme } from './rankingTheme';
import { GOTHIC, type TelopThemeKey } from './telopTheme';

// 全面の暗幕（rankingParts.tsx の FULL_SCRIM と同じ考え方・値。private 定数なので
// 各ファイルで自前に持つ規約——ここが抜けていると、金文字が白背景に沈んで消えて見える
// 統合検証で見つけた実バグの修正）
const FULL_SCRIM: CSSProperties = {
  position: 'absolute', inset: 0,
  background: 'radial-gradient(ellipse 130% 105% at 50% 42%, rgba(20, 24, 33, 0.86) 0%, rgba(8, 10, 15, 0.94) 62%, rgba(3, 4, 7, 0.97) 100%)',
};

interface RankedEntry extends RankingEntry {
  rank: number;
}

function toRankedEntries(entries: RankingEntry[], min: number, max: number): RankedEntry[] {
  return entries
    .filter((e): e is RankedEntry => e.rank != null && e.rank >= min && e.rank <= max)
    .sort((a, b) => a.rank - b.rank);
}

// ── 旧 layout.ts の TOP3_POS（そのまま移植。3枠は等サイズ・等間隔） ──────
const TOP3_CARD_W = 380;
const TOP3_CARD_H = 506; // 380 * 4/3 ≒ 506
const TOP3_GAP = 120;
const TOP3_STAGE_TOP = 300;
const TOP3_LABEL_GAP = 24;
const TOP3_NAME_SIZE = 36;
const TOP3_COMPANY_SIZE = 20;
const TOP3_PT_SIZE = 60;
const TOP3_TOTAL_W = TOP3_CARD_W * 3 + TOP3_GAP * 2;
const TOP3_START_X = (1920 - TOP3_TOTAL_W) / 2;
const top3X = (slotIndex: number) => TOP3_START_X + slotIndex * (TOP3_CARD_W + TOP3_GAP);

// 旧 StepTop3.tsx のタイマー定数そのまま（完全再現の対象）
const POINTS_DELAY: Record<number, number> = { 3: 600, 2: 2400, 1: 4200 };
const REVEAL_DELAY: Record<number, number> = { 3: 1500, 2: 3300, 1: 5100 };

export function RankingTop3({ entries, theme, lang, hidePoints, hideRankBadge }: {
  entries: RankingEntry[]; theme: TelopThemeKey; lang?: GraphicsLang; hidePoints: boolean; hideRankBadge: boolean;
}) {
  const top3 = toRankedEntries(entries, 1, 3);
  const [pointsShown, setPointsShown] = useState<Record<number, boolean>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    ([3, 2, 1] as const).forEach((r) => {
      timers.push(setTimeout(() => setPointsShown((p) => ({ ...p, [r]: true })), POINTS_DELAY[r]));
      timers.push(setTimeout(() => setRevealed((p) => ({ ...p, [r]: true })), REVEAL_DELAY[r]));
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div style={FULL_SCRIM}>
      {top3.map((e, i) => (
        <Top3Card key={e.rank} entry={e} slotIndex={i} pointsShown={pointsShown[e.rank] === true} revealed={revealed[e.rank] === true} theme={theme} lang={lang} hidePoints={hidePoints} hideRankBadge={hideRankBadge} />
      ))}
    </div>
  );
}

function Top3Card({ entry, slotIndex, pointsShown, revealed, theme, lang, hidePoints, hideRankBadge }: {
  entry: RankedEntry; slotIndex: number; pointsShown: boolean; revealed: boolean;
  theme: TelopThemeKey; lang?: GraphicsLang; hidePoints: boolean; hideRankBadge: boolean;
}) {
  const isFirst = entry.rank === 1;
  const t = getTop3Theme(theme, isFirst);
  const displayName = pickLangValue(entry.name, entry.nameEn ?? '', lang);
  const displayCompany = pickLangValue(entry.company ?? '', entry.companyEn ?? '', lang);
  const x = top3X(slotIndex);
  const bracketSize = isFirst ? 32 : 26;
  const bracketStroke = isFirst ? 3 : 2;
  const badgeStyle = t.badgeIsGradient
    ? { backgroundImage: t.badgeBg, WebkitBackgroundClip: 'text' as const, backgroundClip: 'text' as const, WebkitTextFillColor: 'transparent', color: 'transparent' }
    : { color: t.badgeBg };

  return (
    <div
      style={{
        position: 'absolute', left: x, top: TOP3_STAGE_TOP, width: TOP3_CARD_W,
        height: TOP3_CARD_H + TOP3_LABEL_GAP + TOP3_COMPANY_SIZE * 1.4 + 8 + TOP3_NAME_SIZE * 1.15 + 24 + TOP3_PT_SIZE + 24,
        opacity: pointsShown ? 1 : 0,
        transform: pointsShown ? 'translateY(0) scale(1)' : 'translateY(40px) scale(0.94)',
        transition: 'opacity 800ms ease, transform 1000ms cubic-bezier(.2,1,.3,1)',
      }}
    >
      {!hideRankBadge && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: -90, textAlign: 'center', fontFamily: "'Roboto Condensed', sans-serif", fontWeight: 700, fontSize: 76, lineHeight: 1, letterSpacing: '0.04em', filter: t.badgeGlow ? `drop-shadow(${t.badgeGlow})` : undefined, ...badgeStyle }}>
          {entry.rank}
        </div>
      )}
      <div style={{ position: 'absolute', left: 0, top: 0, width: TOP3_CARD_W, height: TOP3_CARD_H, overflow: 'hidden', background: t.photoBg, border: t.cardBorder, boxShadow: t.cardGlow }}>
        <div style={{ width: '100%', height: '100%', opacity: revealed ? 1 : 0, transition: 'opacity 900ms ease' }}>
          {entry.photoUrl ? (
            <img src={entry.photoUrl} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 130, color: 'rgba(255,255,255,0.25)' }}>—</div>
          )}
        </div>
      </div>
      <Bracket pos="tl" size={bracketSize} stroke={bracketStroke} color={t.bracketColor} cardW={TOP3_CARD_W} cardH={TOP3_CARD_H} />
      <Bracket pos="tr" size={bracketSize} stroke={bracketStroke} color={t.bracketColor} cardW={TOP3_CARD_W} cardH={TOP3_CARD_H} />
      <Bracket pos="bl" size={bracketSize} stroke={bracketStroke} color={t.bracketColor} cardW={TOP3_CARD_W} cardH={TOP3_CARD_H} />
      <Bracket pos="br" size={bracketSize} stroke={bracketStroke} color={t.bracketColor} cardW={TOP3_CARD_W} cardH={TOP3_CARD_H} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: TOP3_CARD_H + TOP3_LABEL_GAP, textAlign: 'center', pointerEvents: 'none' }}>
        <div style={{ opacity: revealed ? 1 : 0, transform: revealed ? 'translateY(0)' : 'translateY(8px)', transition: 'opacity 900ms ease, transform 900ms cubic-bezier(.2,1,.3,1)' }}>
          {displayCompany && (
            <div style={{ marginBottom: 8, fontFamily: GOTHIC, fontSynthesis: 'none', fontWeight: 600, fontSize: TOP3_COMPANY_SIZE, letterSpacing: '0.2em', color: t.companyColor, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {displayCompany}
            </div>
          )}
          <div style={{ fontFamily: GOTHIC, fontSynthesis: 'none', fontWeight: 900, fontSize: TOP3_NAME_SIZE, letterSpacing: '0.06em', lineHeight: 1.15, color: t.nameColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {displayName}
          </div>
        </div>
        <div style={{ display: hidePoints || !(entry.points > 0) ? 'none' : 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8, marginTop: 24 }}>
          <span style={{ fontFamily: "'Roboto Condensed', sans-serif", fontWeight: 700, fontSize: TOP3_PT_SIZE, lineHeight: 1, color: t.ptColor, letterSpacing: '0.02em' }}>
            <RankingCountUp value={pointsShown ? entry.points : 0} duration={1100} />
          </span>
          <span style={{ fontFamily: "'Roboto Condensed', sans-serif", fontWeight: 700, fontSize: Math.round(TOP3_PT_SIZE * 0.34), color: t.ptLabelColor, letterSpacing: '0.2em' }}>
            PT
          </span>
        </div>
      </div>
    </div>
  );
}

function Bracket({ pos, size, stroke, color, cardW, cardH }: { pos: 'tl' | 'tr' | 'bl' | 'br'; size: number; stroke: number; color: string; cardW: number; cardH: number }) {
  const isTop = pos === 'tl' || pos === 'tr';
  const isLeft = pos === 'tl' || pos === 'bl';
  return (
    <div
      style={{
        position: 'absolute', width: size, height: size,
        top: isTop ? 0 : cardH - size, left: isLeft ? 0 : cardW - size,
        borderTop: isTop ? `${stroke}px solid ${color}` : 'none',
        borderBottom: isTop ? 'none' : `${stroke}px solid ${color}`,
        borderLeft: isLeft ? `${stroke}px solid ${color}` : 'none',
        borderRight: isLeft ? 'none' : `${stroke}px solid ${color}`,
        pointerEvents: 'none',
      }}
    />
  );
}

// ── ファイナルピッチ（旧 StepFinalPitch.tsx の移植） ──────────────────
const FP_SLOT_X: Record<number, number> = { 1: 280, 2: 770, 3: 1260 };
const FP_CENTER_X = 770;
const FP_CARD_W = 380;
const FP_CARD_H = 510;
const FP_PHOTO_H = 380;
const FP_PHOTO_W = 280;

const PITCH_NOM_TITLE_KEYFRAMES = '@keyframes pitchNomTitleIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}';

/**
 * `subPhase`: 0=3人並び・1〜3=`entries`（ランク1〜3順にソート済み）の該当スロットをピック。
 * 対象カードは中央へ移動・拡大し、他2枚は退場する。CSS transition でアニメーションするため
 * （remount ではなく）props の変化だけで動く — 親（rankingParts.tsx）は subPhase が変わっても
 * このコンポーネント自体は再マウントしない設計にしてある。
 */
export function RankingFinalPitch({ entries, subPhase, theme, lang }: {
  entries: RankingEntry[]; subPhase: number; theme: TelopThemeKey; lang?: GraphicsLang;
}) {
  const top3 = toRankedEntries(entries, 1, 3);
  const t = getFinalPitchTheme(theme);
  return (
    <div style={FULL_SCRIM}>
      <div style={{ position: 'absolute', top: 90, left: 0, right: 0, textAlign: 'center' }}>
        <div style={{ fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 16, letterSpacing: '0.7em', color: t.labelColor, marginBottom: 12 }}>
          — FINAL PITCH —
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 250, bottom: 80 }}>
        {top3.map((entry, i) => {
          const slot = i + 1;
          const isPicked = subPhase === slot;
          const isOther = subPhase !== 0 && !isPicked;
          return <PitchCard key={entry.rank} entry={entry} slot={slot} isPicked={isPicked} isOther={isOther} lang={lang} t={t} />;
        })}
      </div>
    </div>
  );
}

function PitchCard({ entry, slot, isPicked, isOther, lang, t }: {
  entry: RankedEntry; slot: number; isPicked: boolean; isOther: boolean; lang?: GraphicsLang; t: ReturnType<typeof getFinalPitchTheme>;
}) {
  const name = pickLangValue(entry.name, entry.nameEn ?? '', lang);
  const company = pickLangValue(entry.company ?? '', entry.companyEn ?? '', lang);
  const x = isPicked ? FP_CENTER_X : (FP_SLOT_X[slot] ?? FP_CENTER_X);
  const scale = isPicked ? 1.25 : 1;
  const opacity = isOther ? 0 : 1;
  const translateY = isOther ? 60 : 0;

  return (
    <div style={{ position: 'absolute', left: x, top: 0, width: FP_CARD_W, height: FP_CARD_H, transform: `translate(0, ${translateY}px) scale(${scale})`, transformOrigin: 'center top', opacity, transition: 'left 900ms cubic-bezier(.2,.85,.3,1), transform 900ms cubic-bezier(.2,.85,.3,1), opacity 700ms ease', zIndex: isPicked ? 10 : 5 }}>
      <div style={{ position: 'absolute', left: (FP_CARD_W - FP_PHOTO_W) / 2, top: 0, width: FP_PHOTO_W, height: FP_PHOTO_H, background: t.photoBg, border: isPicked ? t.cardBorderPicked : t.cardBorder, boxShadow: isPicked ? t.cardGlowPicked : t.cardGlow, overflow: 'hidden', transition: 'border 600ms ease, box-shadow 600ms ease' }}>
        {entry.photoUrl ? (
          <img src={entry.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 130, color: 'rgba(255,255,255,0.25)' }}>—</div>
        )}
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: FP_PHOTO_H + 14, textAlign: 'center', padding: '0 8px' }}>
        <div style={{ fontFamily: GOTHIC, fontSynthesis: 'none', fontWeight: 900, fontSize: 28, color: t.nameColor, letterSpacing: '0.05em', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {name}
        </div>
        {company && (
          <div style={{ marginTop: 4, fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 16, color: t.companyColor, letterSpacing: '0.18em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {company}
          </div>
        )}
      </div>
      {/* ノミネートタイトル演出。RankingEntry に nominationTitle が無いので氏名で代替する（タスク仕様の許容） */}
      {isPicked && name && (
        <div style={{ position: 'absolute', left: -560, right: -560, top: FP_PHOTO_H + 100, display: 'flex', justifyContent: 'center', opacity: 0, animation: 'pitchNomTitleIn 800ms cubic-bezier(.2,1,.3,1) 400ms forwards' }}>
          <style>{PITCH_NOM_TITLE_KEYFRAMES}</style>
          <div style={{ padding: '14px 36px', background: t.nomPanelBg, border: `2px solid ${t.nomPanelBorder}`, boxShadow: t.nomPanelShadow, maxWidth: 1500, width: '100%', boxSizing: 'border-box' }}>
            <div style={{ fontFamily: GOTHIC, fontSynthesis: 'none', fontWeight: 900, fontSize: 44, color: t.nomTextColor, letterSpacing: '0.04em', lineHeight: 1.1, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {name}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
