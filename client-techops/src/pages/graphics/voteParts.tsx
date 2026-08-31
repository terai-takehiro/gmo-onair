// テロップCG — 投票・クイズ結果（`vote` パーツ・既定スロット=フルスクリーン）のテーマ別構造。
//
// 実物（実選挙特番CG・実運用の結果ページ）から抽出した骨格は「選択肢ラベル＋数値」の
// 2要素だけ（graphics-design-specs.md §9.9）。細いバーを使う理由がもともとあるテーマ
// （式典=金の細罫・コーポレート=下罫1本と同じアクセント色）は**バー型**、
// 面の分割だけで区切ってきたテーマ（報道=紺ベタ×白ベタ・バラエティ=黄座布団×黒座布団）
// は**プレート型**にした——実物にあった2系統のどちらかへ倒すだけで、新しい第3の意匠は作らない。
// バーはトラック（未達部分の線）を描かず塗り部分だけ（実装と同じ・§9.9）。
import type { CSSProperties } from 'react';
import type { GraphicsPageRow } from '@/lib/graphicsApi';
import { pickLang, pickLangValue, type GraphicsLang } from './langField';
import { normalizeVoteChoices, sharePercent, totalVotes, VOTE_CHOICES_KEY, type VoteChoice } from './voteChoices';
import {
  EDGE_DARK, GOLD, GOTHIC, NEWS_NAVY, SAFE_X, SAFE_Y, SERIF,
  CORPORATE_ACCENT, WHITE, type TelopThemeKey,
} from './telopTheme';

const numeric: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: "'tnum' 1",
};

// 全面の暗幕（フルスクリーン共通・outputPartsExtra.tsx の FULL_SCRIM と同じ考え方 —
// 枠線・角丸は付けず、暗幕に文字を直置きする）
const FULL_SCRIM: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background:
    'radial-gradient(ellipse 130% 105% at 50% 42%, rgba(20, 24, 33, 0.86) 0%, rgba(8, 10, 15, 0.94) 62%, rgba(3, 4, 7, 0.97) 100%)',
};

const frame: CSSProperties = {
  position: 'absolute',
  inset: `${SAFE_Y}px ${SAFE_X}px`,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
};

// 選択肢が多いと1画面に収まらない・読めない密度になるため上限を切る（FullscreenList の
// MAX_LIST_ITEMS=20 と同じ考え方。投票・クイズは選択肢が少数の前提のため上限も小さい）
const MAX_CHOICES_SHOWN = 10;

interface VoteData {
  question: string;
  shown: VoteChoice[];
  restCount: number;
  total: number;
}

function readVote(page: GraphicsPageRow, lang?: GraphicsLang): VoteData {
  const question = pickLang(page.fields, 'question', lang) || page.name;
  const choices = normalizeVoteChoices(page.fields[VOTE_CHOICES_KEY]).filter((c) => c.label !== '');
  // 英語ラベルを1度だけ解決しておく（`langField.ts` の pickLangValue に統一）。
  // 下の Ceremony/News/Corporate/VarietyVote は今までどおり `c.label` を読むだけでよい
  const localized = choices.map((c) => ({ ...c, label: pickLangValue(c.label, c.labelEn ?? '', lang) }));
  const shown = localized.slice(0, MAX_CHOICES_SHOWN);
  return { question, shown, restCount: choices.length - shown.length, total: totalVotes(choices) };
}

/** 式典: 暗紺の暗幕に金の題字（specs §10）と同じ扱いの設問＋バー型の選択肢一覧 */
function CeremonyVote({ data }: { data: VoteData }) {
  const { question, shown, total } = data;
  return (
    <div style={FULL_SCRIM}>
      <div style={frame}>
        <div
          style={{
            fontFamily: SERIF, fontSynthesis: 'none', fontSize: 52, fontWeight: 900, color: WHITE,
            letterSpacing: '0.1em', lineHeight: 1.3, textAlign: 'center', textShadow: '0 3px 8px rgba(0, 0, 0, 0.45)',
            maxWidth: 1920 - SAFE_X * 2,
          }}
        >
          {question}
        </div>
        <div style={{ height: 2, width: 340, marginTop: 24, marginBottom: 48, background: `linear-gradient(90deg, rgba(212,175,55,0) 0%, ${GOLD} 20%, ${GOLD} 80%, rgba(212,175,55,0) 100%)` }} />
        <div style={{ width: '100%', maxWidth: 1180, display: 'flex', flexDirection: 'column', gap: 30 }}>
          {shown.map((c, i) => {
            const pct = sharePercent(c.votes, total);
            return (
              <div key={i}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 24 }}>
                  <span style={{ fontFamily: SERIF, fontSynthesis: 'none', fontSize: 38, fontWeight: 700, color: WHITE, letterSpacing: '0.04em' }}>
                    {c.label}
                  </span>
                  <span style={{ ...numeric, fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 40, fontWeight: 800, color: GOLD, whiteSpace: 'nowrap' }}>
                    {pct}<span style={{ fontSize: 24, marginLeft: 2 }}>%</span>
                  </span>
                </div>
                <div style={{ height: 4, marginTop: 10, width: `${Math.max(0, Math.min(100, pct))}%`, background: GOLD, opacity: 0.9 }} />
              </div>
            );
          })}
          <ListFooter data={data} color="#c9c9c9" />
        </div>
      </div>
    </div>
  );
}

/**
 * 報道: NaSTAuk/General-Election-Graphics の実開票CG（`.constpartyname`/`.constvotes`）と
 * 同じ「ラベルの紺プレート→数値の白プレート」の2枚重ね。バーは使わない（面の分割だけ）
 */
function NewsVote({ data }: { data: VoteData }) {
  const { question, shown, total } = data;
  return (
    <div style={FULL_SCRIM}>
      <div style={frame}>
        <div style={{ background: NEWS_NAVY, color: WHITE, fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 34, fontWeight: 800, letterSpacing: '0.04em', padding: '10px 28px 12px', marginBottom: 40, textAlign: 'center' }}>
          {question}
        </div>
        <div style={{ width: '100%', maxWidth: 1180, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {shown.map((c, i) => {
            const pct = sharePercent(c.votes, total);
            return (
              <div key={i} style={{ display: 'flex', boxShadow: '0 3px 10px rgba(0, 0, 0, 0.35)' }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: WHITE, color: '#101014', fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 30, fontWeight: 900, letterSpacing: '0.01em', padding: '12px 24px', fontFeatureSettings: "'palt' 1" }}>
                  {c.label}
                </div>
                <div style={{ ...numeric, flexShrink: 0, minWidth: 140, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', background: NEWS_NAVY, color: WHITE, fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 30, fontWeight: 900, padding: '12px 20px' }}>
                  {pct}%
                </div>
              </div>
            );
          })}
          <ListFooter data={data} color="#c9c9c9" />
        </div>
      </div>
    </div>
  );
}

/**
 * コーポレート: nprapps/elections22 の `resultsTableCandidates`（実運用の結果ページ）と
 * 同じ「ラベルの下に細いバーだけ」の骨格を、既存の下罫1本の語彙（アクセント色）で描く
 */
function CorporateVote({ data }: { data: VoteData }) {
  const { question, shown, total } = data;
  return (
    <div style={FULL_SCRIM}>
      <div style={frame}>
        <div style={{ fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 40, fontWeight: 800, color: WHITE, letterSpacing: '0.03em', marginBottom: 44, textAlign: 'center', ...EDGE_DARK }}>
          {question}
        </div>
        <div style={{ width: '100%', maxWidth: 1180, display: 'flex', flexDirection: 'column', gap: 26 }}>
          {shown.map((c, i) => {
            const pct = sharePercent(c.votes, total);
            return (
              <div key={i}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 24 }}>
                  <span style={{ fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 32, fontWeight: 700, color: WHITE, letterSpacing: '0.02em', ...EDGE_DARK }}>
                    {c.label}
                  </span>
                  <span style={{ ...numeric, fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 34, fontWeight: 900, color: WHITE, whiteSpace: 'nowrap', ...EDGE_DARK }}>
                    {pct}%
                  </span>
                </div>
                <div style={{ height: 3, marginTop: 10, width: `${Math.max(0, Math.min(100, pct))}%`, background: CORPORATE_ACCENT }} />
              </div>
            );
          })}
          <ListFooter data={data} color="#e6e8eb" />
        </div>
      </div>
    </div>
  );
}

/** バラエティ: SideLabel/scoreParts と同じ黄座布団×黒座布団の色替え。べた影つき */
function VarietyVote({ data }: { data: VoteData }) {
  const { question, shown, total } = data;
  return (
    <div style={FULL_SCRIM}>
      <div style={frame}>
        <div style={{ background: '#ffd400', color: '#151515', fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 32, fontWeight: 900, letterSpacing: '0.02em', padding: '10px 28px 12px', marginBottom: 40, textAlign: 'center', boxShadow: '5px 5px 0 rgba(10, 10, 10, 0.75)' }}>
          {question}
        </div>
        <div style={{ width: '100%', maxWidth: 1180, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {shown.map((c, i) => {
            const pct = sharePercent(c.votes, total);
            return (
              <div key={i} style={{ display: 'flex', boxShadow: '4px 4px 0 rgba(10, 10, 10, 0.6)' }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: '#151515', color: WHITE, fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 30, fontWeight: 900, letterSpacing: '0.02em', padding: '12px 24px', fontFeatureSettings: "'palt' 1" }}>
                  {c.label}
                </div>
                <div style={{ ...numeric, flexShrink: 0, minWidth: 140, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', background: '#ffd400', color: '#151515', fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 30, fontWeight: 900, padding: '12px 20px' }}>
                  {pct}%
                </div>
              </div>
            );
          })}
          <ListFooter data={data} color="#e6e8eb" />
        </div>
      </div>
    </div>
  );
}

function EmptyNote({ color }: { color: string }) {
  return (
    <div style={{ fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 26, fontWeight: 700, color, letterSpacing: '0.04em', textAlign: 'center', marginTop: 8 }}>
      まだ投票がありません
    </div>
  );
}

/** 表示上限（MAX_CHOICES_SHOWN）を超えたぶんの畳み表示（FullscreenList の「ほか N名」と同型） */
function RestNote({ color, count }: { color: string; count: number }) {
  return (
    <div style={{ fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 24, fontWeight: 700, color, letterSpacing: '0.04em', textAlign: 'center', marginTop: 4 }}>
      ほか {count}択
    </div>
  );
}

/** テーマ共通のリスト末尾（表示上限の畳み・合計0件の案内）。順番はこの並びで固定 */
function ListFooter({ data, color }: { data: VoteData; color: string }) {
  return (
    <>
      {data.restCount > 0 && <RestNote color={color} count={data.restCount} />}
      {data.total === 0 && <EmptyNote color={color} />}
    </>
  );
}

export function VoteResult({ page, theme, lang }: { page: GraphicsPageRow; theme: TelopThemeKey; lang?: GraphicsLang }) {
  const data = readVote(page, lang);
  // 選択肢が1件も無い（ラベル未入力のみ）ときは無表示にする — 出力が空の暗幕だけになる
  // より、レンダラー自体が「まだ用意できていない」ことを示す（outputParts.tsx の規律と同じ）
  if (data.shown.length === 0) return null;
  if (theme === 'news-navy') return <NewsVote data={data} />;
  if (theme === 'corporate-light') return <CorporateVote data={data} />;
  if (theme === 'variety-pop') return <VarietyVote data={data} />;
  return <CeremonyVote data={data} />;
}
