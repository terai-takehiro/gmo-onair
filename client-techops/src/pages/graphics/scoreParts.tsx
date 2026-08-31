// テロップCG — スコアボード（`score` パーツ・既定スロット=サイド）のテーマ別構造。
//
// 実物の構造は「面（座布団）・エッジ（袋文字）・罫」の3語彙のうえで、
// **名前セルと得点セルを面の色替えで分ける**（罫を使わない）— 実運用オーバーレイの
// CSS 実装4本を実測した共通所見（docs/design/v4/graphics-design-specs.md §9.8）。
// 得点の数字は色を継がず白か黒で固定し、桁は tabular-nums の `ch` 単位で
// 固定幅予約する（他のエントリーの桁が変わっても隣のセル幅は動かさない）。
import type { CSSProperties } from 'react';
import type { GraphicsPageRow } from '@/lib/graphicsApi';
import { pickLangValue, type GraphicsLang } from './langField';
import { normalizeScoreEntries, SCORE_ENTRIES_KEY, type ScoreEntry } from './scoreEntries';
import {
  EDGE_DARK, GOLD, GOTHIC, NAVY_PLATE, NEWS_NAVY, SAFE_X, SAFE_Y, SERIF,
  CORPORATE_ACCENT, WHITE, type TelopThemeKey,
} from './telopTheme';

/** 得点セルの固定幅（ch単位・tabular-nums前提）。符号付き3桁まで揺れずに収まる */
function digitWidthCh(entries: ScoreEntry[]): number {
  const maxLen = entries.reduce((m, e) => Math.max(m, String(e.points).length), 1);
  return Math.max(2, maxLen);
}

const numeric: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: "'tnum' 1",
};

/** 段階公開で全件公開し終えたときの最終エントリー（1位相当）向けの、点数の強調サイズ差分 */
const EMPHASIS_SIZE_DELTA = 10;

/** 式典: 暗紺グラデ面に全エントリーを収める。罫は下端の金細罫1本だけ（面の縁には回さない） */
function CeremonyScore({ entries, flashLive, emphasizeIndex }: { entries: ScoreEntry[]; flashLive?: boolean; emphasizeIndex?: number }) {
  const chw = digitWidthCh(entries);
  return (
    <div
      style={{
        position: 'absolute', top: flashLive ? 88 + 34 : SAFE_Y, right: SAFE_X,
        background: NAVY_PLATE, boxShadow: '0 6px 18px rgba(0, 0, 0, 0.35)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'stretch', padding: '16px 10px' }}>
        {entries.map((e, i) => (
          // 罫は下端の金細罫1本だけ（specs §9.5「第2の分離は明度差で行う」）。
          // エントリー間は罫でなく奇数番目だけの弱い背景差で分ける
          <div
            key={i}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: '4px 16px', background: i % 2 === 1 ? 'rgba(255, 255, 255, 0.04)' : undefined,
            }}
          >
            <div style={{ fontFamily: SERIF, fontSynthesis: 'none', fontSize: 24, fontWeight: 700, color: GOLD, letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
              {e.name || '　'}
            </div>
            <div style={{ ...numeric, fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: i === emphasizeIndex ? 48 + EMPHASIS_SIZE_DELTA : 48, fontWeight: 800, color: WHITE, minWidth: `${chw}ch`, textAlign: 'center', marginTop: 4 }}>
              {e.points}
            </div>
          </div>
        ))}
      </div>
      <div style={{ height: 2, marginLeft: 26, marginRight: 26, background: `linear-gradient(90deg, rgba(212,175,55,0) 0%, ${GOLD} 20%, ${GOLD} 80%, rgba(212,175,55,0) 100%)` }} />
    </div>
  );
}

/**
 * 報道: 実測した実運用オーバーレイと同じ「名前セル(紺ベタ)→得点セル(白ベタ)」の
 * 色替え分割（specs §9.8）。罫は使わない。エントリーは横に隙間なく連結する
 */
function NewsScore({ entries, flashLive, emphasizeIndex }: { entries: ScoreEntry[]; flashLive?: boolean; emphasizeIndex?: number }) {
  const chw = digitWidthCh(entries);
  return (
    <div style={{ position: 'absolute', top: flashLive ? 88 + 34 : SAFE_Y, right: SAFE_X, display: 'flex', boxShadow: '0 3px 10px rgba(0, 0, 0, 0.35)' }}>
      {entries.map((e, i) => (
        <div key={i} style={{ display: 'flex', marginLeft: i > 0 ? 3 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', background: NEWS_NAVY, color: WHITE, fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 26, fontWeight: 800, letterSpacing: '0.03em', padding: '10px 16px', whiteSpace: 'nowrap' }}>
            {e.name || '　'}
          </div>
          <div style={{ ...numeric, display: 'flex', alignItems: 'center', justifyContent: 'center', background: WHITE, color: '#101014', fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: i === emphasizeIndex ? 30 + EMPHASIS_SIZE_DELTA : 30, fontWeight: 900, minWidth: `${chw + 1}ch`, padding: '10px 12px' }}>
            {e.points}
          </div>
        </div>
      ))}
    </div>
  );
}

/** コーポレート: 面なしの袋文字。1本の罫（アクセント色の下線）だけで全体をまとめる */
function CorporateScore({ entries, flashLive, emphasizeIndex }: { entries: ScoreEntry[]; flashLive?: boolean; emphasizeIndex?: number }) {
  const chw = digitWidthCh(entries);
  return (
    <div style={{ position: 'absolute', top: flashLive ? 88 + 34 : SAFE_Y, right: SAFE_X, display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      <div style={{ display: 'flex', gap: 34 }}>
        {entries.map((e, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span style={{ fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 26, fontWeight: 700, color: WHITE, letterSpacing: '0.04em', whiteSpace: 'nowrap', ...EDGE_DARK }}>
              {e.name || '　'}
            </span>
            <span style={{ ...numeric, fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: i === emphasizeIndex ? 38 + EMPHASIS_SIZE_DELTA : 38, fontWeight: 900, color: WHITE, minWidth: `${chw}ch`, textAlign: 'right', ...EDGE_DARK }}>
              {e.points}
            </span>
          </div>
        ))}
      </div>
      <div style={{ height: 3, alignSelf: 'stretch', background: CORPORATE_ACCENT, marginTop: 10 }} />
    </div>
  );
}

/**
 * バラエティ: 名前セル(黄座布団・黒文字)→得点セル(黒座布団・白文字)の色替え分割
 * （報道と同じ「面の色替え」骨格を、バラエティの語彙＝黄/黒で描き直したもの）
 */
function VarietyScore({ entries, flashLive, emphasizeIndex }: { entries: ScoreEntry[]; flashLive?: boolean; emphasizeIndex?: number }) {
  const chw = digitWidthCh(entries);
  return (
    <div style={{ position: 'absolute', top: flashLive ? 88 + 34 : SAFE_Y, right: SAFE_X, display: 'flex', gap: 10 }}>
      {entries.map((e, i) => (
        <div key={i} style={{ display: 'flex', boxShadow: '4px 4px 0 rgba(10, 10, 10, 0.6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: '#ffd400', color: '#151515', fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 24, fontWeight: 900, letterSpacing: '0.02em', padding: '9px 14px', whiteSpace: 'nowrap' }}>
            {e.name || '　'}
          </div>
          <div style={{ ...numeric, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#151515', color: WHITE, fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: i === emphasizeIndex ? 28 + EMPHASIS_SIZE_DELTA : 28, fontWeight: 900, minWidth: `${chw + 1}ch`, padding: '9px 12px' }}>
            {e.points}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ScoreBoard({ page, theme, flashLive, lang, revealPhase }: {
  page: GraphicsPageRow; theme: TelopThemeKey; flashLive?: boolean; lang?: GraphicsLang;
  /**
   * 段階カウンタ（段6-1・汎用機構。`FullscreenList` に続いて `ScoreBoard` にも展開・
   * 2026-08-31）。**0以上**で渡されたときだけ
   * `fields.entries` 配列の先頭から `revealPhase + 1` 件目までに絞る。**配列の並び順＝
   * 発表順**という取り決め（下位から並べておけば「下位から発表」になる）。未指定・
   * **-1（段階公開未使用・migration 251）＝従来どおり全件表示**（cueはTAKEのたびに-1へ
   * リセットされるので、「続き」を1度も送っていないページには一切効かない — 既存ページ・
   * プレビューの無回帰を守る）。
   */
  revealPhase?: number;
}) {
  const rawEntries = normalizeScoreEntries(page.fields[SCORE_ENTRIES_KEY]);
  // データが無い（未入力）ときは無表示にする — 空の面を放送に出すより安全側
  // （outputParts.tsx の「まだレンダラーの無い部品は何も描かない」と同じ規律）
  if (rawEntries.length === 0) return null;
  // 英語名を1度だけ解決しておく（`langField.ts` の pickLangValue に統一）。
  // 下の Ceremony/News/Corporate/VarietyScore は今までどおり `e.name` を読むだけでよい
  const entries = rawEntries.map((e) => ({ ...e, name: pickLangValue(e.name, e.nameEn ?? '', lang) }));
  const usingReveal = typeof revealPhase === 'number' && Number.isFinite(revealPhase) && revealPhase >= 0;
  const revealLimit = usingReveal
    ? Math.max(0, Math.floor(revealPhase as number) + 1)
    : entries.length;
  const shown = usingReveal ? entries.slice(0, Math.min(entries.length, revealLimit)) : entries;
  // 全件公開し終えた（＝最終発表・1位相当）ときだけ、最後に公開したエントリーへ
  // 控えめな強調（数字サイズだけ）を加える。revealPhase 未使用の従来表示には付けない
  const emphasizeIndex = usingReveal && shown.length > 0 && shown.length === entries.length
    ? shown.length - 1
    : undefined;
  if (theme === 'news-navy') return <NewsScore entries={shown} flashLive={flashLive} emphasizeIndex={emphasizeIndex} />;
  if (theme === 'corporate-light') return <CorporateScore entries={shown} flashLive={flashLive} emphasizeIndex={emphasizeIndex} />;
  if (theme === 'variety-pop') return <VarietyScore entries={shown} flashLive={flashLive} emphasizeIndex={emphasizeIndex} />;
  return <CeremonyScore entries={shown} flashLive={flashLive} emphasizeIndex={emphasizeIndex} />;
}
