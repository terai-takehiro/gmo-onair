// テロップCG — 出力画面のレンダラー（部品 → 実際に放送に出る絵）。
//
// ⚠️ **CG の見た目は v4 トークンの対象外**（放送に出る映像。`/live/display/` と同じ
// 例外扱い — docs/design/v4/graphics.md §5）。Tailwind のクラスは使わず、
// 1920×1080 の固定キャンバス前提の素の inline style で描く。
//
// 数値と造形の正は docs/design/v4/graphics-design-specs.md（実測仕様）＋
// 2026-08-30 の造形文法リサーチ。要点:
//   ・実物のテロップの語彙は「面・エッジ（袋文字）・罫」の3つだけ。
//     **全周を枠線で囲む造形は実物に存在しない**（Webのカード文法）— 使わない
//   ・**要素ごとに構造を変える**: 時計=座布団なしの袋文字 ／ ネーム=暗紺グラデ面＋
//     金は文字と細罫のみ ／ サイド=袋文字＋金下罫（面なし）／ 速報=ラベル面分割
//   ・金は「文字（グラデ）」か「1〜2pxの細罫」だけ。面にベタ塗りしない
//   ・書体: 題字・氏名=横太明朝の代替 Noto Serif JP 900 ／ 補助=Noto Sans JP。
//     LINE Seed（カドマル・UI書体）は放送の絵には使わない。疑似ボールド禁止
//   ・白は #F5F5F5（純白=スーパーホワイト回避）・数字は tabular-nums
// TODO(段4): 長体フィット（80%まで）・テーマ/文字スタイルプリセットのテンプレート駆動化。
import type { CSSProperties } from 'react';
import type { GraphicsPageRow } from '@/lib/graphicsApi';
import { FullscreenList, FullscreenTitle, TickerBand } from './outputPartsExtra';

const SAFE_X = 96;
const SAFE_Y = 54;
const WHITE = '#f5f5f5';
const GOLD = '#d4af37';
const SERIF = "'Noto Serif JP', 'Noto Sans JP', serif";
const GOTHIC = "'Noto Sans JP', sans-serif";

// 暗紺の面（式典の座布団: 真っ黒ベタにしない・紺寄りの縦グラデ。枠線なし）
const NAVY_PLATE =
  'linear-gradient(180deg, rgba(20, 28, 46, 0.94) 0%, rgba(10, 15, 28, 0.92) 55%, rgba(7, 10, 18, 0.94) 100%)';

// 金の細罫（水平・わずかな金属ムラ）。太さは 2px まで — 金は罫と文字にしか使わない
const GOLD_RULE_H: CSSProperties = {
  height: 2,
  background: 'linear-gradient(90deg, #8a6414 0%, #d4af37 22%, #f2d67c 50%, #d4af37 78%, #8a6414 100%)',
};

// 袋文字（座布団を敷かない要素の可読性はエッジで取る。ぼかさない）
const EDGE_DARK: CSSProperties = {
  WebkitTextStroke: '6px rgba(6, 9, 15, 0.92)',
  paintOrder: 'stroke fill',
  textShadow: '0 2px 6px rgba(0, 0, 0, 0.5)',
};

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

/**
 * 下部テロップ × ネーム（式典ネーム）:
 * 暗紺グラデ面の上下に金細罫（左右には回さない=枠にしない）。
 * 構成は「賞名・役割（金の明朝・広い字間＋短い金下罫）→ 氏名（明朝900・主役）→
 * 所属・肩書（小さな灰ゴシック）」の3層。金バーのベタ塗りはしない。
 */
export function LowerThirdName({ page, tickerLive }: { page: GraphicsPageRow; tickerLive?: boolean }) {
  const label = str(page.fields.label);
  const name = str(page.fields.mainText) || str(page.fields.name) || page.name;
  const sub = str(page.fields.subText) || str(page.fields.title);
  return (
    <div
      style={{
        position: 'absolute',
        left: SAFE_X,
        // ティッカーが出ている間は帯（y=1008〜）の上に退避する
        bottom: tickerLive ? 100 : SAFE_Y,
        minWidth: 620,
        maxWidth: 1180,
        display: 'flex',
        flexDirection: 'column',
        background: NAVY_PLATE,
        boxShadow: '0 6px 18px rgba(0, 0, 0, 0.35)',
      }}
    >
      <div style={GOLD_RULE_H} />
      <div style={{ padding: '24px 64px 26px 52px', minWidth: 0 }}>
        {label && (
          <div style={{ display: 'inline-flex', flexDirection: 'column', marginBottom: 18 }}>
            <div
              style={{
                fontFamily: SERIF,
                fontSynthesis: 'none',
                fontSize: 33,
                fontWeight: 700,
                color: GOLD,
                letterSpacing: '0.34em',
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </div>
            <div style={{ height: 1, background: GOLD, opacity: 0.85, marginTop: 10, marginRight: '0.34em' }} />
          </div>
        )}
        <div
          style={{
            fontFamily: SERIF,
            fontSynthesis: 'none',
            fontSize: 80,
            fontWeight: 900,
            color: WHITE,
            letterSpacing: '0.1em',
            lineHeight: 1.12,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            textShadow: '0 3px 8px rgba(0, 0, 0, 0.45)',
          }}
        >
          {name}
        </div>
        {sub && (
          <div
            style={{
              fontFamily: GOTHIC,
              fontSynthesis: 'none',
              fontSize: 28,
              fontWeight: 500,
              color: '#c9c9c9',
              letterSpacing: '0.08em',
              lineHeight: 1.3,
              marginTop: 14,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {sub}
          </div>
        )}
      </div>
      <div style={GOLD_RULE_H} />
    </div>
  );
}

/**
 * サイドスーパー（常駐見出し・右上）:
 * 面を敷かない「袋文字＋金の下罫」構造（実物のサイドの基本形）。
 * カード化しない — 文字のエッジが可読性を、細罫が格を担う。
 */
export function SideLabel({ page }: { page: GraphicsPageRow }) {
  const text = str(page.fields.text) || page.name;
  return (
    <div
      style={{
        position: 'absolute',
        top: SAFE_Y,
        right: SAFE_X,
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        maxWidth: 760,
      }}
    >
      <div
        style={{
          fontFamily: SERIF,
          fontSynthesis: 'none',
          fontSize: 38,
          fontWeight: 900,
          color: WHITE,
          letterSpacing: '0.18em',
          lineHeight: 1.25,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '100%',
          ...EDGE_DARK,
        }}
      >
        {text}
      </div>
      <div style={{ ...GOLD_RULE_H, width: '100%', marginTop: 10, marginRight: '0.18em' }} />
    </div>
  );
}

function two(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * 時計・カウントダウン（左上=時刻の持ち場）:
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
    <div
      style={{
        position: 'absolute',
        top: SAFE_Y,
        left: SAFE_X,
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 18,
      }}
    >
      {prefix && (
        <span
          style={{
            fontFamily: GOTHIC,
            fontSynthesis: 'none',
            fontSize: 32,
            fontWeight: 700,
            color: WHITE,
            letterSpacing: '0.06em',
            ...EDGE_DARK,
          }}
        >
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
 * 速報帯（上辺）: 実物の「ラベル面｜本文面」の分割構造。
 * 左端に黄ベタの「速報」ラベル、本文は半透明黒の帯に袋文字。罫線では分けない。
 */
export function FlashBand({ page }: { page: GraphicsPageRow }) {
  const text = str(page.fields.text) || page.name;
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 92,
        display: 'flex',
        alignItems: 'center',
        gap: 26,
        paddingLeft: SAFE_X,
        paddingRight: SAFE_X,
        background: 'rgba(0, 0, 0, 0.68)',
      }}
    >
      <span
        style={{
          fontFamily: GOTHIC,
          fontSynthesis: 'none',
          flexShrink: 0,
          padding: '5px 20px 7px',
          background: '#ffd400',
          color: '#101010',
          fontSize: 40,
          fontWeight: 900,
          letterSpacing: '0.12em',
        }}
      >
        速報
      </span>
      <span
        style={{
          fontFamily: GOTHIC,
          fontSynthesis: 'none',
          minWidth: 0,
          color: WHITE,
          fontSize: 52,
          fontWeight: 800,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          WebkitTextStroke: '6px #101010',
          paintOrder: 'stroke fill',
        }}
      >
        {text}
      </span>
    </div>
  );
}

/** 出力の合成に必要な周辺状態（同時に出ている他スロットとの位置関係の解決に使う） */
export interface RenderContext {
  /** ティッカー帯（y=1008〜1080）がオンエア中 → 下部テロップを帯の上に退避 */
  tickerLive?: boolean;
}

/**
 * ページ1枚をスロット・部品に応じて描く。まだレンダラーの無い部品は**何も描かない**
 * （中途半端な絵を放送に出すより無表示の方が安全側）。
 */
export function renderGraphicsPage(page: GraphicsPageRow, serverNowMs: number, ctx?: RenderContext) {
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
    return null;
  }
  if (page.slot === 'side') {
    return <SideLabel key={page.id} page={page} />;
  }
  if (page.slot === 'lower' && page.partKey === 'name') {
    return <LowerThirdName key={page.id} page={page} tickerLive={ctx?.tickerLive} />;
  }
  return null;
}
