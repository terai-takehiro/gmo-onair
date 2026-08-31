// テロップCG — 出力画面のレンダラー（続き）: フルスクリーン2種＋ティッカー。
//
// ⚠️ outputParts.tsx と同じ決まりで描く（CG の見た目は v4 トークンの対象外・
// docs/design/v4/graphics.md §5）。Tailwind は使わず、1920×1080 固定キャンバス
// 前提の素の inline style。数値の正は docs/design/v4/graphics-design-specs.md:
//   ・フルスクリーンは「枠付きの箱」ではなく**全面の暗幕（ビネット）**に直置き
//     （セルや箱に線を引くと Web の UI に見える — §9-7 の座布団NGと同根）
//   ・題字は金属金グラデ（§5 の5分岐レシピ）＋上下の金細罫・字間 0.12em（§10）
//   ・一覧の氏名は 44–50px 白 #F5F5F5・palt（§2・§7）
//   ・ティッカーは高さ72・110px/s（slow=90/fast=130）。速度を固定し尺を逆算（§6）
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { GraphicsPageRow } from '@/lib/graphicsApi';
import { pickLang, type GraphicsLang } from './langField';
import {
  estimateTickerTextWidth,
  tickerPxPerSec,
} from '@gmo-onair/shared/src/qsheet/graphicsTicker';

/** 尺の概算（純粋関数・shared に実体）。送出コンソール側からも使えるよう再輸出 */
export { estimateDurationSec } from '@gmo-onair/shared/src/qsheet/graphicsTicker';

const SAFE_X = 96;
const SAFE_Y = 54;
const WHITE = '#f5f5f5';
const GOLD = '#d4af37';
const FONT_STACK = "'Noto Sans JP', sans-serif";
// 題字・見出しは横太明朝の代替（Noto Serif JP 900）。UI書体（LINE Seed）は放送の絵に使わない
const SERIF_STACK = "'Noto Serif JP', 'Noto Sans JP', serif";

// 金属感の強い金グラデ（specs §5・Premiere 公開レシピの CSS 換算）
const GOLD_METAL =
  'linear-gradient(180deg, #E8C34A 0%, #FFFDF0 44%, #8A5A0E 52%, #D98E1F 60%, #E8C34A 100%)';

// 金の細罫（両端が溶ける 1–2px。specs §10「上下に1–2px金細罫」）
const GOLD_RULE: CSSProperties = {
  height: 2,
  background:
    'linear-gradient(90deg, rgba(212, 175, 55, 0) 0%, #d4af37 18%, #d4af37 82%, rgba(212, 175, 55, 0) 100%)',
};

const TEXT_COMMON: CSSProperties = {
  fontFamily: FONT_STACK,
  fontSynthesis: 'none',
  color: WHITE,
  // 式典系の影は「短距離ソフト」（specs §3）
  textShadow: '0 3px 8px rgba(0, 0, 0, 0.45)',
};

// 全面の暗幕（フルスクリーン共通）。枠線・角丸は付けない — 暗幕に文字を直置きする
const FULL_SCRIM: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background:
    'radial-gradient(ellipse 130% 105% at 50% 42%, rgba(20, 24, 33, 0.86) 0%, rgba(8, 10, 15, 0.94) 62%, rgba(3, 4, 7, 0.97) 100%)',
};

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

/**
 * フルスクリーン × 題字（式典題字・specs §10）:
 * 暗幕の中央に題字 90–110px を金属金グラデで置き、上下に金細罫（文字幅の約7割）。
 * 講師（speaker）は名前を主役に、肩書は小さく #C9C9C9。箱・枠線は一切描かない。
 *
 * `photoUrl`（specs §9.10）があるときだけ「題字→写真→氏名」の縦積みで矩形の写真を挟む
 * （実物調査の並び）。角丸最小限・金の罫1本（2px）＋短距離影で浮かせるだけ——面は敷かない。
 * 読み込み失敗（`img onError`）／未指定のときは写真無しの従来レイアウトのまま。
 */
export function FullscreenTitle({ page }: { page: GraphicsPageRow }) {
  const title = str(page.fields.title) || page.name;
  const speaker = str(page.fields.speaker);
  const speakerTitle = str(page.fields.speakerTitle);
  const photoUrl = str(page.fields.photoUrl);
  // 読み込みに失敗した URL を覚えておき、その URL の間だけ写真枠を隠す（同じ page.id の
  // まま photoUrl が新しい値に変わったら自動的に再表示される — useEffect でのリセット不要）
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string | null>(null);
  const showPhoto = photoUrl !== '' && photoUrl !== failedPhotoUrl;
  // 題字 90–110px（specs §2）。短い題は大きく、長い題は下限側で1〜2行に収める
  const titleSize = Array.from(title).length <= 12 ? 110 : 92;
  return (
    <div style={FULL_SCRIM}>
      <div
        style={{
          position: 'absolute',
          inset: `${SAFE_Y}px ${SAFE_X}px`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* inline-flex の幅＝題字の幅。罫は1要素1本 — 題字の下だけに置く（§9.5） */}
        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
          <div
            style={{
              fontFamily: SERIF_STACK,
              fontSynthesis: 'none',
              fontSize: titleSize,
              fontWeight: 900,
              letterSpacing: '0.14em',
              lineHeight: 1.28,
              textAlign: 'center',
              maxWidth: 1920 - SAFE_X * 2,
              backgroundImage: GOLD_METAL,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              WebkitTextFillColor: 'transparent',
              // グラデ文字に textShadow を重ねると透明な塗りから影が透ける →
              // drop-shadow でグリフ形状ごと落とす（短距離ソフト・specs §3）
              filter: 'drop-shadow(0 3px 8px rgba(0, 0, 0, 0.45))',
            }}
          >
            {title}
          </div>
          <div style={{ ...GOLD_RULE, width: '70%', marginTop: 30 }} />
        </div>
        {showPhoto && (
          <img
            src={photoUrl}
            alt=""
            onError={() => setFailedPhotoUrl(photoUrl)}
            style={{
              display: 'block',
              marginTop: 40,
              width: 240,
              height: 300,
              objectFit: 'cover',
              // 角丸は最小限（specs §9.10）。正円のアバターは Web UI の文法なので使わない
              borderRadius: 6,
              // 縁は金の罫1本（座布団は敷かない）＋式典系の短距離ソフト影で暗幕から浮かせる
              border: `2px solid ${GOLD}`,
              boxShadow: '0 3px 8px rgba(0, 0, 0, 0.45)',
            }}
          />
        )}
        {(speaker || speakerTitle) && (
          <div style={{ marginTop: showPhoto ? 40 : 72, textAlign: 'center' }}>
            {speakerTitle && (
              <div
                style={{
                  ...TEXT_COMMON,
                  fontSize: 30,
                  fontWeight: 700,
                  color: '#c9c9c9',
                  letterSpacing: '0.12em',
                  lineHeight: 1.3,
                }}
              >
                {speakerTitle}
              </div>
            )}
            {speaker && (
              <div
                style={{
                  ...TEXT_COMMON,
                  fontFamily: SERIF_STACK,
                  fontSize: 52,
                  fontWeight: 900,
                  letterSpacing: '0.06em',
                  lineHeight: 1.2,
                  marginTop: speakerTitle ? 10 : 0,
                  fontFeatureSettings: "'palt' 1",
                }}
              >
                {speaker}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** 一覧の最大表示数。超えたぶんは「ほか N名」に畳む（読めない密度にしない） */
const MAX_LIST_ITEMS = 20;

/**
 * フルスクリーン × 一覧表（受賞者一覧など・既定 4列×5行）:
 * 暗幕に見出し（題字より小さく・金の細罫下線）＋氏名のグリッド。
 * **セルに箱・枠線は描かない** — 氏名は暗幕に直置き（枠付きセルは Web の UI に見える）。
 *
 * `revealPhase`（段6-1・汎用機構の実証）が渡されたときだけ「`revealPhase + 1` 件目まで」
 * に絞る。未指定＝従来どおり全件表示（既存のページ・プレビューの見た目を壊さないため、
 * 「続き」を1度も送っていないページには一切効かない）。「ほか N名」の残数はこの表示上限
 * を基準に数え直す — 段階公開の途中で「あと何人隠れているか」が分かるように。
 */
export function FullscreenList({ page, revealPhase }: { page: GraphicsPageRow; revealPhase?: number }) {
  const title = str(page.fields.title) || page.name;
  const rawItems = Array.isArray(page.fields.items) ? page.fields.items : [];
  const items = rawItems.map(str).filter((s) => s !== '');
  const revealLimit = typeof revealPhase === 'number' && Number.isFinite(revealPhase)
    ? Math.max(0, Math.floor(revealPhase) + 1)
    : MAX_LIST_ITEMS;
  const shown = items.slice(0, Math.min(MAX_LIST_ITEMS, revealLimit));
  const restCount = items.length - shown.length;
  const colRaw = Number(page.fields.columns);
  const columns = Number.isFinite(colRaw) && colRaw >= 1 ? Math.min(6, Math.floor(colRaw)) : 4;
  return (
    <div style={FULL_SCRIM}>
      <div
        style={{
          position: 'absolute',
          inset: `${SAFE_Y}px ${SAFE_X}px`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginTop: 26,
          }}
        >
          <div
            style={{
              fontFamily: SERIF_STACK,
              fontSynthesis: 'none',
              fontSize: 58,
              fontWeight: 700,
              letterSpacing: '0.3em',
              lineHeight: 1.25,
              textAlign: 'center',
              backgroundImage: GOLD_METAL,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.45))',
            }}
          >
            {title}
          </div>
          <div style={{ ...GOLD_RULE, width: '84%', marginTop: 18 }} />
        </div>
        <div
          style={{
            flex: 1,
            width: '100%',
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            columnGap: 40,
            rowGap: 44,
            alignContent: 'center',
            marginTop: 40,
          }}
        >
          {shown.map((name, i) => (
            <div
              key={i}
              style={{
                ...TEXT_COMMON,
                fontSize: 46,
                fontWeight: 700,
                letterSpacing: '0.04em',
                lineHeight: 1.2,
                textAlign: 'center',
                fontFeatureSettings: "'palt' 1",
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {name}
            </div>
          ))}
        </div>
        {restCount > 0 && (
          <div
            style={{
              ...TEXT_COMMON,
              fontSize: 32,
              fontWeight: 700,
              color: '#c9c9c9',
              letterSpacing: '0.08em',
              marginBottom: 8,
            }}
          >
            ほか {restCount}名
          </div>
        )}
      </div>
    </div>
  );
}

// つなぎ目の区切り（specs §7: 句読点は使わない → 全角スペース＋／）
const TICKER_SEPARATOR = '　　／　　';

/**
 * ティッカー（下端ブリード帯・specs §6）: y=1008–1080 の高さ72px、右→左に 110px/s。
 * 速度は px/s で固定し、尺（duration）は文の長さから逆算する — 「読み切れること」が
 * カットの都合より優先（§8）。幅はマウント時に1回だけ実測し（初回描画前の
 * useLayoutEffect）、継続的な計測ループは持たない。つなぎ目は本文を2回並べて
 * translateX(-50%) で戻す（シームレスループ）。
 */
export function TickerBand({ page, lang }: { page: GraphicsPageRow; lang?: GraphicsLang }) {
  const text = pickLang(page.fields, 'text', lang) || page.name;
  const label = str(page.fields.label) || 'お知らせ';
  const pxPerSec = tickerPxPerSec(page.fields.speed);
  // 半分（=1グループ）が画面幅 1920px を下回るとループの合間に空白が出るので、
  // 短い文は概算幅から必要回数だけ繰り返して 1920px 以上にしておく
  const unit = text + TICKER_SEPARATOR;
  const repeat = Math.max(1, Math.ceil(1920 / Math.max(1, estimateTickerTextWidth(unit))));
  const group = unit.repeat(repeat);

  const groupRef = useRef<HTMLSpanElement>(null);
  const [groupWidth, setGroupWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    // 初回描画前に1回だけ実測（フォント読込前でも fallback 書体で近い値が出る。
    // 概算とのズレは速度の数%で、読速の判断を変えない）
    if (groupRef.current) setGroupWidth(groupRef.current.scrollWidth);
  }, [group]);

  const widthPx = groupWidth ?? estimateTickerTextWidth(group);
  const durationSec = Math.max(1, widthPx / pxPerSec);

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 72,
        display: 'flex',
        alignItems: 'center',
        background: 'rgba(0, 0, 0, 0.72)',
      }}
    >
      <style>{'@keyframes gfx-ticker-scroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}'}</style>
      {/* 左端の静的ラベル。黄色地は速報の文法（specs §5）なので使わない。
          ラベルと本文の分離は罫でなく**面の明度差**（帯より一段深い黒・§9.5） */}
      <div
        style={{
          flexShrink: 0,
          alignSelf: 'stretch',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: SAFE_X,
          paddingRight: 30,
          marginRight: 26,
          background: 'rgba(0, 0, 0, 0.55)',
        }}
      >
        <span
          style={{
            fontFamily: FONT_STACK,
            fontSynthesis: 'none',
            color: GOLD,
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: '0.14em',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0, height: '100%', overflow: 'hidden' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            height: '100%',
            whiteSpace: 'nowrap',
            willChange: 'transform',
            animation: `gfx-ticker-scroll ${durationSec}s linear infinite`,
          }}
        >
          <span ref={groupRef} style={tickerTextStyle}>
            {group}
          </span>
          <span aria-hidden="true" style={tickerTextStyle}>
            {group}
          </span>
        </div>
      </div>
    </div>
  );
}

const tickerTextStyle: CSSProperties = {
  fontFamily: FONT_STACK,
  fontSynthesis: 'none',
  color: WHITE,
  fontSize: 44,
  fontWeight: 700,
  letterSpacing: '0.02em',
  // 数字は等幅（specs §7。「17:30」等の時刻が流れても桁が揺れない）
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: "'tnum' 1",
};
