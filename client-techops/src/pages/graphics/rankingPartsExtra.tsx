// テロップCG — ランキング発表: RANKS 5→2 段階発表＋winner-bar（旧 `StepRanking.tsx` の移植）。
//
// 段6-5・完全再現の対象（数値の正は旧実装インライン値）:
//   client-awards/src/cg/steps/StepRanking.tsx（タイマー定数・CSS transition/keyframe）
//   client-awards/src/cg/layout.ts（行・写真・バーの座標計算）
// ceremony-gold は上記の値をそのまま持つ。他3テーマは色だけ rankingTheme.ts の語彙に差し替える
// （レイアウト・タイミング・イージングは4テーマ共通で変えない）。
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { RankingCountUp } from './RankingCountUp';
import { pickLangValue, type GraphicsLang } from './langField';
import type { RankingEntry } from './rankingFields';
import { getRankRowTheme } from './rankingTheme';
import { GOTHIC, type TelopThemeKey } from './telopTheme';

// 全面の暗幕（rankingParts.tsx の FULL_SCRIM と同じ考え方・値。private 定数なので
// 各ファイルで自前に持つ規約——ここが抜けていると、金文字が白背景に沈んで消えて見える
// 統合検証で見つけた実バグの修正）
const FULL_SCRIM: CSSProperties = {
  position: 'absolute', inset: 0,
  background: 'radial-gradient(ellipse 130% 105% at 50% 42%, rgba(20, 24, 33, 0.86) 0%, rgba(8, 10, 15, 0.94) 62%, rgba(3, 4, 7, 0.97) 100%)',
};

// ── 旧 layout.ts のランキング盤の座標計算（そのまま移植） ──────────────
const CG_W = 1920;
const CG_H = 1080;
const RANK_PAD_TOP = 230;
const RANK_PAD_BOTTOM = 220;
const RANK_PAD_X = 120;
const RANK_ROW_GAP = 16;
const RANK_ROW_COUNT = 5;
const RANK_NUM_W = 90;
const PHOTO_W_BASE = 104;
const PHOTO_ASPECT = 3 / 4;
const RANK_GUTTER = 18;

const AVAIL_H = CG_H - RANK_PAD_TOP - RANK_PAD_BOTTOM; // 630
const ROW_H = (AVAIL_H - RANK_ROW_GAP * (RANK_ROW_COUNT - 1)) / RANK_ROW_COUNT; // 113.2
const RANK_PHOTO_H = Math.min(PHOTO_W_BASE / PHOTO_ASPECT, ROW_H);
const RANK_PHOTO_W = RANK_PHOTO_H * PHOTO_ASPECT;

const rowTopFor = (rank: number) => RANK_PAD_TOP + (rank - 1) * (ROW_H + RANK_ROW_GAP);
const RANK_PHOTO_X = RANK_PAD_X + RANK_NUM_W + RANK_GUTTER;
const RANK_BAR_LEFT = RANK_PHOTO_X + RANK_PHOTO_W + RANK_GUTTER;
const RANK_BAR_FULL_W = CG_W - RANK_PAD_X - RANK_BAR_LEFT;

// ── 旧 StepRanking.tsx のタイマー定数（正確な値・完全再現の対象） ────────
const STRIP_SETTLE = 800;
const BAR_INTERVAL = 1100;
const PHOTO_OFFSET = 280;

const RANK_POP_KEYFRAMES = '@keyframes cgRankPop{0%{transform:scale(0.4);opacity:0}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}';

interface RankedEntry extends RankingEntry {
  rank: number;
}

function toRankedEntries(entries: RankingEntry[], min: number, max: number): RankedEntry[] {
  return entries
    .filter((e): e is RankedEntry => e.rank != null && e.rank >= min && e.rank <= max)
    .sort((a, b) => a.rank - b.rank);
}

export function RankingBars({ entries, theme, lang, revealWinner }: {
  entries: RankingEntry[]; theme: TelopThemeKey; lang?: GraphicsLang;
  /** true のとき1位のバーも表示対象に含める（winner-bar ステップ用） */
  revealWinner?: boolean;
}) {
  const rows = toRankedEntries(entries, 1, 5);
  const maxPoints = Math.max(...rows.map((r) => r.points), 1);

  // 棒グラフ発表の対象順位（2〜5で実在するもの）を降順に投入する（旧実装と同じ）
  const revealRanks = rows.map((r) => r.rank).filter((r) => r >= 2 && r <= 5).sort((a, b) => b - a);

  const [barStarted, setBarStarted] = useState<Record<number, boolean>>({});
  const [inserted, setInserted] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (revealWinner) {
      // ranks52 で既に確定していた2〜5位はここでは動かさず（isRevealed/nameVisible が
      // 即時 true を返す）、1位だけを新規にタイマー投入する
      timers.push(setTimeout(() => setBarStarted((p) => ({ ...p, 1: true })), STRIP_SETTLE));
      timers.push(setTimeout(() => setInserted((p) => ({ ...p, 1: true })), STRIP_SETTLE + PHOTO_OFFSET));
    } else {
      revealRanks.forEach((rank, i) => {
        timers.push(setTimeout(() => setBarStarted((p) => ({ ...p, [rank]: true })), STRIP_SETTLE + i * BAR_INTERVAL));
        timers.push(setTimeout(() => setInserted((p) => ({ ...p, [rank]: true })), STRIP_SETTLE + i * BAR_INTERVAL + PHOTO_OFFSET));
      });
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealWinner]);

  const isRevealed = (rank: number): boolean => {
    if (revealWinner && rank !== 1) return true;
    return barStarted[rank] === true;
  };
  const nameVisible = (rank: number): boolean => {
    if (revealWinner && rank !== 1) return true;
    return inserted[rank] === true;
  };

  return (
    <div style={FULL_SCRIM}>
      <style>{RANK_POP_KEYFRAMES}</style>
      {rows.map((e) => (
        <RankingRow
          key={e.rank}
          entry={e}
          widthPct={(e.points / maxPoints) * 100}
          revealed={isRevealed(e.rank)}
          nameVisible={nameVisible(e.rank)}
          isFirst={e.rank === 1}
          instant={revealWinner === true && e.rank !== 1}
          theme={theme}
          lang={lang}
        />
      ))}
    </div>
  );
}

function RankingRow({ entry, widthPct, revealed, nameVisible, isFirst, instant, theme, lang }: {
  entry: RankedEntry; widthPct: number; revealed: boolean; nameVisible: boolean; isFirst: boolean;
  /** ranks52 で既に確定済み（winner-bar 再表示）の行 — 登場アニメを飛ばしていきなり伸長済みで出す */
  instant: boolean;
  theme: TelopThemeKey; lang?: GraphicsLang;
}) {
  const displayName = pickLangValue(entry.name, entry.nameEn ?? '', lang);
  const displayCompany = pickLangValue(entry.company ?? '', entry.companyEn ?? '', lang);
  const bt = getRankRowTheme(theme, isFirst);
  const rowTop = rowTopFor(entry.rank);

  const [grown, setGrown] = useState(instant);
  useEffect(() => {
    if (instant) return;
    if (revealed && !grown) {
      const t = setTimeout(() => setGrown(true), 80);
      return () => clearTimeout(t);
    }
  }, [revealed, grown, instant]);

  const ownRatio = entry.ownPoints && entry.points ? Math.min(1, entry.ownPoints / entry.points) : 0;
  const ownPct = entry.ownPoints && entry.points ? Math.round((entry.ownPoints / entry.points) * 100) : null;

  const numberStyle = bt.numberIsGradient
    ? { backgroundImage: bt.numberBg, WebkitBackgroundClip: 'text' as const, backgroundClip: 'text' as const, WebkitTextFillColor: 'transparent', color: 'transparent' }
    : { color: bt.numberBg };

  return (
    <div style={{ position: 'absolute', left: RANK_PAD_X, top: rowTop, width: CG_W - RANK_PAD_X * 2, height: ROW_H, opacity: revealed ? 1 : 0.14, transition: 'opacity 500ms ease' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: RANK_NUM_W, height: ROW_H, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontFamily: bt.numFontFamily, fontWeight: 700, fontSize: 72, lineHeight: 1, letterSpacing: '0.02em', animation: revealed ? 'cgRankPop 600ms cubic-bezier(.3,1.4,.5,1) both' : 'none', ...numberStyle }}>
        {entry.rank}
      </div>
      <div style={{ position: 'absolute', left: RANK_PHOTO_X - RANK_PAD_X, top: 0, width: RANK_PHOTO_W, height: RANK_PHOTO_H, border: `1px solid ${bt.photoBorder}`, background: bt.photoBg, opacity: revealed ? 1 : 0, transition: 'opacity 500ms ease', overflow: 'hidden' }}>
        {entry.photoUrl && <img src={entry.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
      </div>
      <div style={{ position: 'absolute', left: RANK_BAR_LEFT - RANK_PAD_X, top: 0, width: RANK_BAR_FULL_W, height: ROW_H }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: grown ? `${widthPct}%` : '0%', transition: 'width 800ms cubic-bezier(.22,1,.36,1)', overflow: 'hidden', border: bt.barBorder, background: bt.barFill }}>
          {ownRatio > 0 && (
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${ownRatio * 100}%`, background: bt.ownVoteFill }} />
          )}
          {ownRatio > 0 && ownRatio < 1 && (
            <div style={{ position: 'absolute', left: `${ownRatio * 100}%`, top: 0, bottom: 0, width: 2, background: '#0a0705', transform: 'translateX(-1px)' }} />
          )}
        </div>
        <div style={{ position: 'absolute', left: 24, top: 0, bottom: 0, right: 320, display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: nameVisible ? 1 : 0, transform: nameVisible ? 'translateX(0)' : 'translateX(-24px)', transition: 'opacity 420ms ease, transform 540ms cubic-bezier(.2,.8,.2,1)', pointerEvents: 'none' }}>
          {displayCompany && (
            <div style={{ fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 20, fontWeight: 700, letterSpacing: '0.18em', color: bt.companyColor, marginBottom: 3, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...bt.edgeStroke }}>
              {displayCompany}
            </div>
          )}
          <div style={{ fontFamily: bt.nameFontFamily, fontSynthesis: 'none', fontWeight: 900, fontSize: isFirst ? 38 : 34, color: bt.nameColor, letterSpacing: '0.06em', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...bt.edgeStroke }}>
            {displayName}
          </div>
        </div>
        <div style={{ position: 'absolute', right: 16, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', gap: 2, opacity: revealed ? (grown ? 1 : 0) : 0, transition: 'opacity 400ms ease 200ms', pointerEvents: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontFamily: bt.numFontFamily, fontWeight: 700, fontSize: isFirst ? 64 : 52, lineHeight: 1, color: bt.ptColor, letterSpacing: '0.02em' }}>
              <RankingCountUp value={grown ? entry.points : 0} duration={800} />
            </span>
            <span style={{ fontFamily: bt.numFontFamily, fontWeight: 700, fontSize: isFirst ? 18 : 15, color: bt.ptLabelColor, letterSpacing: '0.2em' }}>
              PT
            </span>
          </div>
          {ownPct != null && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
              <span style={{ fontFamily: GOTHIC, fontSize: 15, fontWeight: 700, color: bt.ptLabelColor, opacity: 0.9, letterSpacing: '0.12em' }}>
                {lang === 'en' ? 'Internal Vote' : '自社票'}
              </span>
              <span style={{ fontFamily: bt.numFontFamily, fontWeight: 700, fontSize: isFirst ? 38 : 32, lineHeight: 1, color: bt.ptLabelColor, letterSpacing: '0.04em' }}>
                <RankingCountUp value={grown ? ownPct : 0} duration={700} />%
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
