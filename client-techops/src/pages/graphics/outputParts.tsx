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
export function SideLabel({ page, theme, flashLive }: { page: GraphicsPageRow; theme: TelopThemeKey; flashLive?: boolean }) {
  const text = str(page.fields.text) || page.name;
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
export function FlashBand({ page }: { page: GraphicsPageRow }) {
  const text = str(page.fields.text) || page.name;
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
}

/**
 * ページ1枚をスロット・部品に応じて描く。まだレンダラーの無い部品は**何も描かない**
 * （中途半端な絵を放送に出すより無表示の方が安全側）。
 */
export function renderGraphicsPage(page: GraphicsPageRow, serverNowMs: number, ctx?: RenderContext) {
  const theme = resolveTelopTheme(ctx?.theme);
  if (page.slot === 'clock' || page.partKey === 'countdown') {
    return <ClockCountdown key={page.id} page={page} serverNowMs={serverNowMs} />;
  }
  if (page.slot === 'flash') {
    return <FlashBand key={page.id} page={page} />;
  }
  if (page.slot === 'ticker') {
    return <TickerBand key={page.id} page={page} />;
  }
  if (page.slot === 'fullscreen') {
    if (page.partKey === 'list') return <FullscreenList key={page.id} page={page} />;
    if (page.partKey === 'title') return <FullscreenTitle key={page.id} page={page} />;
    if (page.partKey === 'vote') return <VoteResult key={page.id} page={page} theme={theme} />;
    return null;
  }
  if (page.slot === 'side' && page.partKey === 'score') {
    return <ScoreBoard key={page.id} page={page} theme={theme} flashLive={ctx?.flashLive} />;
  }
  if (page.slot === 'side') {
    return <SideLabel key={page.id} page={page} theme={theme} flashLive={ctx?.flashLive} />;
  }
  if (page.slot === 'lower' && page.partKey === 'name') {
    return <LowerThirdName key={page.id} page={page} theme={theme} tickerLive={ctx?.tickerLive} />;
  }
  return null;
}
