// テロップCG — 出力画面のレンダラー（部品 → 実際に放送に出る絵）。
//
// ⚠️ **CG の見た目は v4 トークンの対象外**（放送に出る映像。`/live/display/` と同じ
// 例外扱い — docs/design/v4/graphics.md §5）。Tailwind のクラスは使わず、
// 1920×1080 の固定キャンバス前提の素の inline style で描く。
//
// 数値と造形の正は docs/design/v4/graphics-design-specs.md（§9.5 造形文法を含む）。
// テーマ（式典・報道・コーポレート・バラエティ）は色替えではなく**別の造形**として
// 実装する — ネームの構造分岐は nameParts.tsx、共通の色・書体は telopTheme.ts。
// 罫は1要素1本まで。時計と速報は全テーマ共通（報道の文法が汎用の正）。
import type { GraphicsPageRow } from '@/lib/graphicsApi';
import { pickLang, type GraphicsLang } from './langField';
import { FullscreenList, FullscreenTitle, TickerBand } from './outputPartsExtra';
import { LowerThirdName } from './nameParts';
import { ScoreBoard } from './scoreParts';
import { VoteResult } from './voteParts';
import {
  EDGE_DARK, GOTHIC, NEWS_NAVY, SAFE_X, SAFE_Y, SERIF, WHITE,
  resolveTelopTheme, type TelopThemeKey,
} from './telopTheme';

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

/**
 * サイドスーパー（常駐見出し・右上）。テーマごとの構造:
 * 式典・コーポレート = 面なしの袋文字だけ（罫も置かない）／
 * 報道 = 紺帯の白抜き（面ベタ）／ バラエティ = 黄の座布団に黒文字。
 */
export function SideLabel({ page, theme, flashLive, lang }: {
  page: GraphicsPageRow; theme: TelopThemeKey; flashLive?: boolean; lang?: GraphicsLang;
}) {
  const text = pickLang(page.fields, 'text', lang) || page.name;
  // 速報帯（上辺 h=88）が出ている間は持ち場を譲って下がる
  const base = { position: 'absolute' as const, top: flashLive ? 88 + 34 : SAFE_Y, right: SAFE_X, maxWidth: 760 };
  const clip = { whiteSpace: 'nowrap' as const, overflow: 'hidden' as const, textOverflow: 'ellipsis' as const };
  if (theme === 'news-navy') {
    return (
      <div style={{ ...base, ...clip, fontFamily: GOTHIC, fontSynthesis: 'none', background: NEWS_NAVY, color: WHITE, fontSize: 32, fontWeight: 800, letterSpacing: '0.06em', padding: '10px 26px 12px', boxShadow: '0 3px 10px rgba(0, 0, 0, 0.35)' }}>
        {text}
      </div>
    );
  }
  if (theme === 'variety-pop') {
    return (
      <div style={{ ...base, ...clip, fontFamily: GOTHIC, fontSynthesis: 'none', background: '#ffd400', color: '#151515', fontSize: 30, fontWeight: 900, letterSpacing: '0.04em', padding: '9px 22px 11px', boxShadow: '5px 5px 0 rgba(10, 10, 10, 0.75)' }}>
        {text}
      </div>
    );
  }
  const serif = theme === 'ceremony-gold';
  return (
    <div style={{ ...base, ...clip, fontFamily: serif ? SERIF : GOTHIC, fontSynthesis: 'none', fontSize: serif ? 38 : 34, fontWeight: serif ? 900 : 800, color: WHITE, letterSpacing: serif ? '0.18em' : '0.08em', lineHeight: 1.25, ...EDGE_DARK }}>
      {text}
    </div>
  );
}

function two(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * 時計・カウントダウン（左上=時刻の持ち場・全テーマ共通）:
 * 実物の時刻表示と同じ**座布団なしの袋文字**。数字は等幅・桁を揺らさない。
 * 時刻は**サーバー基準**（skew 補正済み epoch ms を受け取る — クライアントの時計で
 * フリーランさせない。CLAUDE.md「数字を信用できる状態で出す」）。
 */
export function ClockCountdown({ page, serverNowMs }: { page: GraphicsPageRow; serverNowMs: number }) {
  const targetRaw = str(page.fields.targetAt);
  const prefix = str(page.fields.prefix);
  let targetMs = targetRaw ? Date.parse(targetRaw) : NaN;
  // `targetTime: "13:00"`（当日の時刻だけ指定する形・シードの形式）も受ける。
  // 「今日」の解釈は skew 補正済みのサーバー時刻基準（過ぎていれば 0 で止まるだけ）
  const targetTime = str(page.fields.targetTime);
  const hm = /^(\d{1,2}):(\d{2})$/.exec(targetTime);
  if (!Number.isFinite(targetMs) && hm) {
    const d = new Date(serverNowMs);
    d.setHours(Number(hm[1]), Number(hm[2]), 0, 0);
    targetMs = d.getTime();
  }

  let text: string;
  if (Number.isFinite(targetMs)) {
    // カウントダウン: 残りは繰り上げ（尺の切り捨てと混ぜない）・0 で止める
    const remain = Math.max(0, Math.ceil((targetMs - serverNowMs) / 1000));
    const h = Math.floor(remain / 3600);
    const m = Math.floor((remain % 3600) / 60);
    const s = remain % 60;
    text = h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
  } else {
    const d = new Date(serverNowMs);
    text = `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
  }

  return (
    <div style={{ position: 'absolute', top: SAFE_Y, left: SAFE_X, display: 'inline-flex', alignItems: 'baseline', gap: 18 }}>
      {prefix && (
        <span style={{ fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 32, fontWeight: 700, color: WHITE, letterSpacing: '0.06em', ...EDGE_DARK }}>
          {prefix}
        </span>
      )}
      <span
        style={{
          fontFamily: GOTHIC,
          fontSynthesis: 'none',
          fontSize: 62,
          fontWeight: 800,
          color: WHITE,
          // 等幅数字（桁が揺れてはいけない — プロジェクト共通原則）
          fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: "'tnum' 1",
          letterSpacing: '0.03em',
          ...EDGE_DARK,
        }}
      >
        {text}
      </span>
    </div>
  );
}

/**
 * 速報帯（上辺・全テーマ共通）: 実放送フレームの実測構造（specs §9.7）—
 * ラベル＝ベタ #EA0358 に白抜き、本文＝**白ベタ帯に同系色の文字**（黒半透明帯ではない）。
 * 面はどちらも不透明・エッジ不要・罫線では分けない。
 */
export function FlashBand({ page, lang }: { page: GraphicsPageRow; lang?: GraphicsLang }) {
  const text = pickLang(page.fields, 'text', lang) || page.name;
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 88, display: 'flex', alignItems: 'stretch', background: '#fefbfe' }}>
      <span
        style={{
          fontFamily: GOTHIC,
          fontSynthesis: 'none',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: SAFE_X,
          paddingRight: 30,
          background: '#ea0358',
          color: WHITE,
          fontSize: 44,
          fontWeight: 900,
          letterSpacing: '0.14em',
        }}
      >
        速報
      </span>
      <span
        style={{
          fontFamily: GOTHIC,
          fontSynthesis: 'none',
          minWidth: 0,
          // ellipsis はブロック整形文脈でしか効かない（flex コンテナだと右端で切れっぱなしになる）
          display: 'block',
          lineHeight: '88px',
          paddingLeft: 34,
          paddingRight: SAFE_X,
          color: '#e70555',
          fontSize: 58,
          fontWeight: 900,
          fontFeatureSettings: "'palt' 1",
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {text}
      </span>
    </div>
  );
}

/** 出力の合成に必要な周辺状態（テーマと、同時に出ている他スロットとの位置関係） */
export interface RenderContext {
  /** プロジェクトのテーマ（未指定は式典）。?theme= で試写の上書きも可 */
  theme?: TelopThemeKey;
  /** ティッカー帯（y=1008〜1080）がオンエア中 → 下部テロップを帯の上に退避 */
  tickerLive?: boolean;
  /** 速報帯（上辺 y=0〜88）がオンエア中 → サイドスーパーが下に退避 */
  flashLive?: boolean;
  /**
   * 段階カウンタ（段6-1・汎用機構）。対応する部品（`FullscreenList`・`ScoreBoard`。
   * `pageSupportsReveal` 参照）が渡された値に応じて表示範囲を絞る。未指定＝従来どおり
   * 全件表示（送出コンソールが「続き」を1度も送っていないページ・この機構を使わない
   * 部品には効かない）。
   */
  revealPhase?: number;
  /**
   * 出力言語（多言語対応・graphics.md §6・§7）。未指定は `'ja'` 扱い。`'en'` のときは
   * 各部品が `${field}En` の値を優先し、無ければ日本語版へフォールバックする
   * （`langField.ts` の `pickLang` に統一）。GraphicsOutputPage.tsx が `?lang=` から渡す
   */
  lang?: GraphicsLang;
}

/**
 * この部品（ページ）が「続き」ボタンでの段階進行に対応しているか。
 * 送出コンソールの「続き」ボタンの有効・無効判定に使う——ただし対応部品は**進行の
 * 仕組みが2種類**あり、ボタンの見た目・disabled 判定だけを共用する:
 *   - `list`（一覧表）・`score`（スコアボード）: 段6-1の汎用機構。cue の
 *     `reveal_phase`（TAKE のたびに **-1**＝未使用へリセット。migration 251）を+1する。
 *     `revealPhase` 未指定・-1＝従来どおり全件表示という後方互換
 *   - `vote`（投票・クイズ）: `fields.voteState`（`voteState.ts`）を直接進める。
 *     `reveal_phase` は使わない——TAKE毎にリセットされる cue 側の値に乗せると、
 *     **既に開票済みで運用中の既存ページ**まで TAKE 1回で「出題中」へ巻き戻ってしまい
 *     後方互換が壊れるため（詳細は voteParts.tsx の `VoteResult` コメント）。
 */
export function pageSupportsReveal(page: GraphicsPageRow): boolean {
  if (page.slot === 'fullscreen' && (page.partKey === 'list' || page.partKey === 'vote')) return true;
  if (page.slot === 'side' && page.partKey === 'score') return true;
  return false;
}

/**
 * 部品1つをスロット・partKey・fields に応じて描くディスパッチャ（段6-2 本格拡張で
 * `renderGraphicsPage` から切り出した。中身のロジックは移しただけで変更していない）。
 * `page` 引数は `GraphicsPageRow` そのものではなく「表示に要る最小限」（slot/partKey/fields/
 * id/name）だけを渡せるようにしてある——複数レイヤーページの各レイヤーは `GraphicsPageRow`
 * を持たない（`fields` しか持たない）ため。
 * まだレンダラーの無い部品は**何も描かない**（中途半端な絵を放送に出すより無表示の方が安全側）。
 */
export function renderPart(
  partKey: string,
  slot: string,
  fields: Record<string, unknown>,
  serverNowMs: number,
  ctx?: RenderContext,
  key?: string | number,
) {
  const theme = resolveTelopTheme(ctx?.theme);
  // 既存の各部品コンポーネントは `page: GraphicsPageRow` を丸ごと受け取る形なので、
  // 表示に使うフィールドだけを持つ最小限のダミー行を組み立てて渡す（レンダラー本体は
  // 変更しない——移設のみ）。callNo/proofState/sortOrder/templateId/projectId は
  // どの部品の描画にも使われていない値なのでダミーで埋めてよい
  const page: GraphicsPageRow = {
    id: String(key ?? `${slot}-${partKey}`),
    projectId: '', callNo: 0, slot: slot as GraphicsPageRow['slot'],
    partKey: partKey as GraphicsPageRow['partKey'], name: '', fields,
    proofState: 'proofed', sortOrder: 0, templateId: null,
  };
  if (slot === 'clock' || partKey === 'countdown') {
    return <ClockCountdown key={page.id} page={page} serverNowMs={serverNowMs} />;
  }
  if (slot === 'flash') {
    return <FlashBand key={page.id} page={page} lang={ctx?.lang} />;
  }
  if (slot === 'ticker') {
    return <TickerBand key={page.id} page={page} lang={ctx?.lang} />;
  }
  if (slot === 'fullscreen') {
    if (partKey === 'list') return <FullscreenList key={page.id} page={page} revealPhase={ctx?.revealPhase} />;
    if (partKey === 'title') return <FullscreenTitle key={page.id} page={page} />;
    if (partKey === 'vote') return <VoteResult key={page.id} page={page} theme={theme} lang={ctx?.lang} />;
    return null;
  }
  if (slot === 'side' && partKey === 'score') {
    return <ScoreBoard key={page.id} page={page} theme={theme} flashLive={ctx?.flashLive} lang={ctx?.lang} revealPhase={ctx?.revealPhase} />;
  }
  if (slot === 'side') {
    return <SideLabel key={page.id} page={page} theme={theme} flashLive={ctx?.flashLive} lang={ctx?.lang} />;
  }
  if (slot === 'lower' && partKey === 'name') {
    return <LowerThirdName key={page.id} page={page} theme={theme} tickerLive={ctx?.tickerLive} lang={ctx?.lang} />;
  }
  return null;
}

/**
 * ページ1枚を描く。段6-2 本格拡張（複数部品の組み合わせ・graphics-awards-migration-plan.md
 * §2-2 の6番）: `page.layers` が非空配列なら各レイヤーを `renderPart` で描いて同じキャンバス上に
 * 重ねる（既存の各部品は自分で `position: absolute` を持つため特別なラッパーは不要）。
 * `layers` が無い/空のときは**従来どおり**単一部品として描く（完全に後方互換。既存の
 * 全ページの見た目・挙動を一切変えない）。
 */
export function renderGraphicsPage(page: GraphicsPageRow, serverNowMs: number, ctx?: RenderContext) {
  if (page.layers && page.layers.length > 0) {
    return (
      <div key={page.id} style={{ position: 'absolute', inset: 0 }}>
        {page.layers.map((layer, i) => renderPart(layer.partKey, page.slot, layer.fields, serverNowMs, ctx, `${page.id}-${i}`))}
      </div>
    );
  }
  return renderPart(page.partKey, page.slot, page.fields, serverNowMs, ctx, page.id);
}
