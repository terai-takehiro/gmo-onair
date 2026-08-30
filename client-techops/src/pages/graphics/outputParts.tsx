// テロップCG — 出力画面のレンダラー（部品 → 実際に放送に出る絵）。
//
// ⚠️ **CG の見た目は v4 トークンの対象外**（放送に出る映像。`/live/display/` と同じ
// 例外扱い — docs/design/v4/graphics.md §5）。Tailwind のクラスは使わず、
// 1920×1080 の固定キャンバス前提の素の inline style で描く。
//
// 数値の正は docs/design/v4/graphics-design-specs.md（日本のテレビ番組デザインの
// 実測仕様）。ここは「式典ゴールド」テーマの初期実装で、主に:
//   ・文字セーフ 90%（x=96 / y=54）に全要素を揃える
//   ・白は #F5F5F5（純白＝スーパーホワイトを避ける・§5）
//   ・座布団は「縦グラデ＋1px縁＋短距離影」の3点セット（単色ベタ矩形は素人サイン・§4）
//   ・持ち場: 左上=時計、右上=サイド、下部=ネーム、上辺=速報（§0）
//   ・数字は等幅（tabular-nums）・疑似ボールド禁止（font-synthesis: none・§1）
// TODO(段4): 長体フィット（80%まで・§7）・横太明朝（Noto Serif JP 同梱）・
// テーマ/文字スタイルプリセットのテンプレート駆動化。
import type { CSSProperties } from 'react';
import type { GraphicsPageRow } from '@/lib/graphicsApi';

const SAFE_X = 96;
const SAFE_Y = 54;
const WHITE = '#f5f5f5';
const GOLD = '#d4af37';
const FONT_STACK = "'LINE Seed JP', 'Noto Sans JP', sans-serif";

// 座布団（specs §4: 明度差のある縦グラデ＋1pxの縁＋ぼかしすぎない短距離影）
const BASE_PLATE: CSSProperties = {
  background: 'linear-gradient(180deg, rgba(17, 20, 27, 0.78) 0%, rgba(6, 8, 12, 0.72) 100%)',
  border: '1px solid rgba(212, 175, 55, 0.45)',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
};

const TEXT_COMMON: CSSProperties = {
  fontFamily: FONT_STACK,
  fontSynthesis: 'none',
  color: WHITE,
  // 式典系の影は「短距離ソフト」（specs §3。バラエティのベタ落ち影とは別物）
  textShadow: '0 3px 8px rgba(0, 0, 0, 0.45)',
};

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

/**
 * 下部テロップ × ネーム（式典ネーム・specs §10）:
 * 上段=肩書（氏名の40〜45%・金）＋下段=氏名76px。フチは使わず座布団で視認性を取り、
 * 左端に4pxの金バー。帯下端は文字セーフ（y=1026）。
 */
export function LowerThirdName({ page }: { page: GraphicsPageRow }) {
  // シードと編集ダイアログは mainText/subText（部品共通の主・副）。name/title は旧称の互換
  const title = str(page.fields.subText) || str(page.fields.title);
  const name = str(page.fields.mainText) || str(page.fields.name) || page.name;
  return (
    <div
      style={{
        position: 'absolute',
        left: SAFE_X,
        bottom: SAFE_Y,
        maxWidth: 1920 - SAFE_X * 2,
        display: 'inline-flex',
        alignItems: 'stretch',
        ...BASE_PLATE,
      }}
    >
      <div style={{ width: 4, flexShrink: 0, background: GOLD }} />
      <div style={{ padding: '20px 52px 24px 40px', minWidth: 420 }}>
        {title && (
          <div
            style={{
              ...TEXT_COMMON,
              fontSize: 32,
              fontWeight: 700,
              color: GOLD,
              letterSpacing: '0.08em',
              lineHeight: 1.3,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </div>
        )}
        <div
          style={{
            ...TEXT_COMMON,
            fontSize: 76,
            fontWeight: 800,
            letterSpacing: '0.02em',
            lineHeight: 1.15,
            marginTop: title ? 8 : 0,
            fontFeatureSettings: "'palt' 1",
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {name}
        </div>
      </div>
    </div>
  );
}

/** サイドスーパー: 右上が持ち場（specs §0・§6。左上は時計に譲る） */
export function SideLabel({ page }: { page: GraphicsPageRow }) {
  const text = str(page.fields.text) || page.name;
  return (
    <div
      style={{
        position: 'absolute',
        top: SAFE_Y,
        right: SAFE_X,
        maxWidth: 720,
        display: 'inline-flex',
        alignItems: 'stretch',
        ...BASE_PLATE,
      }}
    >
      <div style={{ width: 4, flexShrink: 0, background: GOLD }} />
      <div
        style={{
          ...TEXT_COMMON,
          padding: '14px 28px 15px 24px',
          fontSize: 34,
          fontWeight: 800,
          letterSpacing: '0.08em',
          fontFeatureSettings: "'palt' 1",
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {text}
      </div>
    </div>
  );
}

function two(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * 時計・カウントダウン。左上（時刻の持ち場・specs §0）。時刻は**サーバー基準**
 * （`cg:sync` の timestamp / output の serverNow から出した skew 補正済みの epoch ms を
 * 受け取る — クライアントの時計でフリーランさせない。CLAUDE.md「数字を信用できる状態で出す」）。
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
        gap: 16,
        padding: '12px 28px 13px',
        ...BASE_PLATE,
      }}
    >
      {prefix && (
        <span style={{ ...TEXT_COMMON, fontSize: 28, fontWeight: 700, color: '#c9c9c9', letterSpacing: '0.06em' }}>
          {prefix}
        </span>
      )}
      <span
        style={{
          ...TEXT_COMMON,
          fontSize: 48,
          fontWeight: 800,
          // 等幅数字（桁が揺れてはいけない — プロジェクト共通原則・specs §7）
          fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: "'tnum' 1",
          letterSpacing: '0.04em',
        }}
      >
        {text}
      </span>
    </div>
  );
}

/**
 * 速報帯（specs §10「速報」レシピ）: 上辺・帯高92px・黄ラベル×黒文字＋本文52px白。
 * 本文は帯が半透明のため1重の黒エッジ（袋文字・visible 3px = stroke 6px を
 * `paint-order: stroke fill` で文字の外側だけに出す — specs §3）。
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
        gap: 24,
        paddingLeft: SAFE_X,
        paddingRight: SAFE_X,
        background: 'rgba(0, 0, 0, 0.65)',
      }}
    >
      <span
        style={{
          fontFamily: FONT_STACK,
          fontSynthesis: 'none',
          flexShrink: 0,
          padding: '6px 18px',
          background: '#ffd400',
          color: '#101010',
          fontSize: 38,
          fontWeight: 800,
          letterSpacing: '0.14em',
        }}
      >
        速報
      </span>
      <span
        style={{
          fontFamily: FONT_STACK,
          fontSynthesis: 'none',
          minWidth: 0,
          color: WHITE,
          fontSize: 52,
          fontWeight: 700,
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

/**
 * ページ1枚をスロット・部品に応じて描く。まだレンダラーの無い部品は**何も描かない**
 * （中途半端な絵を放送に出すより無表示の方が安全側）。
 */
export function renderGraphicsPage(page: GraphicsPageRow, serverNowMs: number) {
  if (page.slot === 'clock' || page.partKey === 'countdown') {
    return <ClockCountdown key={page.id} page={page} serverNowMs={serverNowMs} />;
  }
  if (page.slot === 'flash') {
    return <FlashBand key={page.id} page={page} />;
  }
  if (page.slot === 'side') {
    return <SideLabel key={page.id} page={page} />;
  }
  if (page.slot === 'lower' && page.partKey === 'name') {
    return <LowerThirdName key={page.id} page={page} />;
  }
  return null;
}
