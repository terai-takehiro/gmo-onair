// テロップCG — ランキング発表（`ranking`）のディスパッチャと単純な各ステップの出力レンダラー。
//
// 段6-5・旧リアルタイムCG client-awards のランキング演出のタイミング値まで含めた完全再現移植 第1弾。
// 「完全再現」の対象は数値仕様が明記された RANKS/TOP3/FINAL PITCH（rankingPartsExtra*.tsx へ委譲）。
// title/nominees/oneshot は旧実装に対応する単体コンポーネントが無い（PersistentHeader・PhotoStage・
// StepOneShot の派手な演出に分散している）ため、この場では既存の確立済み語彙
// （FullscreenTitle/FullscreenList/SideLabel と同じ「面・エッジ・罫」の3語彙）でシンプルに描く
// （新規の意匠は起こさない）。ceremony-gold は金属金グラデ、他3テーマは scoreParts.tsx/
// nameParts.tsx の同名テーマと同じ色・面の使い方を流用する。
//
// 各ステップは `readRankingStep(page.fields)` が変わるたびに別コンポーネントへ切り替わる
// （RankingSequence 自身は key={page.id} で呼ばれる — outputParts.tsx 側）。RankingBars は
// ranks52/winner-bar で key を変え、内部の useEffect タイマーをステップ切替のたびにリセットする
// （rankingPartsExtra.tsx 参照）。RankingFinalPitch は subPhase の変化を props で受けて CSS
// transition で動かすため、あえて remount しない（rankingPartsExtra2.tsx 参照）。
import type { CSSProperties } from 'react';
import type { GraphicsPageRow } from '@/lib/graphicsApi';
import { pickLang, pickLangValue, type GraphicsLang } from './langField';
import {
  RANKING_ENTRIES_KEY, normalizeRankingEntries, readAwardPattern, readRankingStep, readSubPhase,
  readWinnerEntryIndex, type RankingEntry,
} from './rankingFields';
import { RankingBars } from './rankingPartsExtra';
import { RankingFinalPitch, RankingTop3 } from './rankingPartsExtra2';
import { RankingCelebration } from './rankingPartsExtra3';
import { RankingCountUp } from './RankingCountUp';
import {
  CORPORATE_ACCENT, EDGE_DARK, GOLD, GOTHIC, NEWS_NAVY, SAFE_X, SAFE_Y, SERIF, WHITE, type TelopThemeKey,
} from './telopTheme';

// 全面の暗幕（outputPartsExtra.tsx の FULL_SCRIM と同じ考え方 — フルスクリーンは
// 「枠付きの箱」でなく暗幕に文字を直置きする。private 定数なのでここで自前に持つ）
const FULL_SCRIM: CSSProperties = {
  position: 'absolute', inset: 0,
  background: 'radial-gradient(ellipse 130% 105% at 50% 42%, rgba(20, 24, 33, 0.86) 0%, rgba(8, 10, 15, 0.94) 62%, rgba(3, 4, 7, 0.97) 100%)',
};

function accentColorOf(theme: TelopThemeKey): string {
  if (theme === 'news-navy') return NEWS_NAVY;
  if (theme === 'corporate-light') return CORPORATE_ACCENT;
  if (theme === 'variety-pop') return '#ffd400';
  return GOLD;
}

/** テーマ別の大見出し（賞名の題字）。ceremony=金属金グラデ・他3テーマは各テーマの確立済み語彙 */
function RankingHeadline({ theme, text, size = 'lg' }: { theme: TelopThemeKey; text: string; size?: 'lg' | 'sm' }) {
  const fontSize = size === 'lg' ? (Array.from(text).length <= 12 ? 110 : 92) : 52;
  if (theme === 'news-navy') {
    return (
      <div style={{ background: NEWS_NAVY, color: WHITE, fontFamily: GOTHIC, fontSynthesis: 'none', fontWeight: 900, fontSize, letterSpacing: '0.08em', lineHeight: 1.25, padding: '16px 46px 18px', textAlign: 'center', boxShadow: '0 3px 10px rgba(0,0,0,0.35)' }}>
        {text}
      </div>
    );
  }
  if (theme === 'corporate-light') {
    return (
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ color: WHITE, fontFamily: GOTHIC, fontSynthesis: 'none', fontWeight: 900, fontSize, letterSpacing: '0.04em', lineHeight: 1.2, textAlign: 'center', ...EDGE_DARK }}>{text}</div>
        <div style={{ height: 3, width: '60%', background: CORPORATE_ACCENT, marginTop: 20 }} />
      </div>
    );
  }
  if (theme === 'variety-pop') {
    return (
      <div style={{ background: '#ffd400', color: '#151515', fontFamily: GOTHIC, fontSynthesis: 'none', fontWeight: 900, fontSize, letterSpacing: '0.02em', lineHeight: 1.2, padding: '14px 40px 18px', textAlign: 'center', boxShadow: '6px 6px 0 rgba(10,10,10,0.7)' }}>
        {text}
      </div>
    );
  }
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
      <div
        style={{
          fontFamily: SERIF, fontSynthesis: 'none', fontWeight: 900, fontSize, letterSpacing: '0.14em', lineHeight: 1.28,
          textAlign: 'center', maxWidth: 1920 - SAFE_X * 2,
          backgroundImage: 'linear-gradient(180deg, #E8C34A 0%, #FFFDF0 44%, #8A5A0E 52%, #D98E1F 60%, #E8C34A 100%)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', WebkitTextFillColor: 'transparent',
          filter: 'drop-shadow(0 3px 8px rgba(0, 0, 0, 0.45))',
        }}
      >
        {text}
      </div>
      <div style={{ height: 2, width: '70%', marginTop: 30, background: 'linear-gradient(90deg, rgba(212,175,55,0) 0%, #d4af37 18%, #d4af37 82%, rgba(212,175,55,0) 100%)' }} />
    </div>
  );
}

/** `title` ステップ: 賞名を中央大見出しで表示するだけのシンプルな画面 */
function RankingTitleStep({ page, theme, lang }: { page: GraphicsPageRow; theme: TelopThemeKey; lang?: GraphicsLang }) {
  const title = pickLang(page.fields, 'categoryName', lang) || page.name;
  if (!title) return null;
  return (
    <div style={FULL_SCRIM}>
      <div style={{ position: 'absolute', inset: `${SAFE_Y}px ${SAFE_X}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <RankingHeadline theme={theme} text={title} />
      </div>
    </div>
  );
}

function NomineeCard({ entry, theme, lang }: { entry: RankingEntry; theme: TelopThemeKey; lang?: GraphicsLang }) {
  const name = pickLangValue(entry.name, entry.nameEn ?? '', lang);
  const company = pickLangValue(entry.company ?? '', entry.companyEn ?? '', lang);
  const accent = accentColorOf(theme);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 220 }}>
      <div style={{ width: 180, height: 240, border: `2px solid ${accent}`, background: 'rgba(0, 0, 0, 0.35)', overflow: 'hidden', borderRadius: 6 }}>
        {entry.photoUrl && <img src={entry.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
      </div>
      <div style={{ marginTop: 14, textAlign: 'center', color: WHITE, fontFamily: GOTHIC, fontSynthesis: 'none', fontWeight: 700, fontSize: 26, letterSpacing: '0.04em', lineHeight: 1.2, fontFeatureSettings: "'palt' 1", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>
        {name}
      </div>
      {company && (
        <div style={{ marginTop: 4, color: '#c9c9c9', fontFamily: GOTHIC, fontSynthesis: 'none', fontWeight: 500, fontSize: 18, letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>
          {company}
        </div>
      )}
    </div>
  );
}

/** `nominees` ステップ: 全エントリーの氏名＋写真をグリッド表示（点数・順位はまだ出さない） */
function RankingNomineesStep({ page, entries, theme, lang }: { page: GraphicsPageRow; entries: RankingEntry[]; theme: TelopThemeKey; lang?: GraphicsLang }) {
  const sorted = [...entries].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  const title = pickLang(page.fields, 'categoryName', lang) || page.name;
  const columns = sorted.length <= 4 ? Math.max(1, sorted.length) : sorted.length <= 8 ? 4 : 5;
  return (
    <div style={FULL_SCRIM}>
      <div style={{ position: 'absolute', inset: `${SAFE_Y}px ${SAFE_X}px`, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {title && <div style={{ marginBottom: 40 }}><RankingHeadline theme={theme} text={title} size="sm" /></div>}
        <div style={{ flex: 1, width: '100%', display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, columnGap: 36, rowGap: 40, alignContent: 'center', justifyItems: 'center' }}>
          {sorted.map((e, i) => <NomineeCard key={i} entry={e} theme={theme} lang={lang} />)}
        </div>
      </div>
    </div>
  );
}

/** `oneshot` ステップ: 1位エントリーのみをフルスクリーンで大きく表示。得点は RankingCountUp（duration=1500） */
function RankingOneShotStep({ page, entries, theme, lang }: { page: GraphicsPageRow; entries: RankingEntry[]; theme: TelopThemeKey; lang?: GraphicsLang }) {
  const winner = entries.find((e) => e.rank === 1) ?? null;
  if (!winner) return null;
  const name = pickLangValue(winner.name, winner.nameEn ?? '', lang);
  const company = pickLangValue(winner.company ?? '', winner.companyEn ?? '', lang);
  const title = pickLang(page.fields, 'categoryName', lang) || page.name;
  const accent = accentColorOf(theme);
  return (
    <div style={FULL_SCRIM}>
      <div style={{ position: 'absolute', inset: `${SAFE_Y}px ${SAFE_X}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {title && <div style={{ marginBottom: 30 }}><RankingHeadline theme={theme} text={title} size="sm" /></div>}
        {winner.photoUrl && (
          <img src={winner.photoUrl} alt="" style={{ width: 300, height: 380, objectFit: 'cover', borderRadius: 6, border: `3px solid ${accent}`, boxShadow: '0 3px 8px rgba(0, 0, 0, 0.45)' }} />
        )}
        <div style={{ marginTop: 36, textAlign: 'center' }}>
          {company && (
            <div style={{ color: '#c9c9c9', fontFamily: GOTHIC, fontSynthesis: 'none', fontWeight: 700, fontSize: 28, letterSpacing: '0.1em', marginBottom: 8 }}>
              {company}
            </div>
          )}
          <div style={{ color: WHITE, fontFamily: theme === 'ceremony-gold' ? SERIF : GOTHIC, fontSynthesis: 'none', fontWeight: 900, fontSize: 68, letterSpacing: '0.06em', fontFeatureSettings: "'palt' 1" }}>
            {name}
          </div>
          <div style={{ marginTop: 20, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 10 }}>
            <span style={{ fontFamily: "'Roboto Condensed', sans-serif", fontWeight: 700, fontSize: 96, color: accent, letterSpacing: '0.02em' }}>
              <RankingCountUp value={winner.points} duration={1500} />
            </span>
            <span style={{ fontFamily: "'Roboto Condensed', sans-serif", fontWeight: 700, fontSize: 28, color: accent, letterSpacing: '0.2em' }}>PT</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RankingSequence({ page, theme, lang }: { page: GraphicsPageRow; theme: TelopThemeKey; lang?: GraphicsLang }) {
  const step = readRankingStep(page.fields);
  // idle・survey-oneshot はこのラウンドではレンダラー未実装 — 何も描かない
  // （既存の「まだレンダラーの無い部品は何も描かない」規律どおり。クラッシュしないことが安全側）
  if (step === 'idle' || step === 'survey-oneshot') return null;

  const entries = normalizeRankingEntries(page.fields[RANKING_ENTRIES_KEY]);

  if (step === 'title') return <RankingTitleStep key="title" page={page} theme={theme} lang={lang} />;
  if (step === 'nominees') return <RankingNomineesStep key="nominees" page={page} entries={entries} theme={theme} lang={lang} />;
  if (step === 'ranks52') return <RankingBars key="ranks52" entries={entries} theme={theme} lang={lang} />;
  if (step === 'winner-bar') return <RankingBars key="winner-bar" entries={entries} theme={theme} lang={lang} revealWinner />;
  if (step === 'oneshot') return <RankingOneShotStep key="oneshot" page={page} entries={entries} theme={theme} lang={lang} />;
  if (step === 'top3') {
    const hide = readAwardPattern(page.fields) === 'vote';
    return <RankingTop3 key="top3" entries={entries} theme={theme} lang={lang} hidePoints={hide} hideRankBadge={hide} />;
  }
  if (step === 'final-pitch') {
    return <RankingFinalPitch key="final-pitch" entries={entries} subPhase={readSubPhase(page.fields)} theme={theme} lang={lang} />;
  }
  if (step === 'celebration') {
    // このページ自身の受賞者だけを祝う（複数部門合同祝賀は新エンジンの粒度では対象外・
    // rankingPartsExtra3.tsx 冒頭コメント参照）。winnerEntryIndex は RankingControlPanel.tsx
    // が `entries.map((e, i) => ...)` の i（=このページの `entries` 配列そのもののインデックス。
    // rank ではない）を書き込んでいるので、そのまま `entries[idx]` で引く
    const pattern = readAwardPattern(page.fields);
    const winners = pattern === 'vote'
      ? (() => {
          const idx = readWinnerEntryIndex(page.fields);
          const w = idx != null ? entries[idx] : undefined;
          return w ? [w] : [];
        })()
      : entries.filter((e) => e.isWinner === true);
    if (winners.length === 0) return null;
    const awardName = pickLang(page.fields, 'categoryName', lang) || page.name;
    return <RankingCelebration key="celebration" entries={winners} theme={theme} lang={lang} awardName={awardName} />;
  }
  return null;
}
