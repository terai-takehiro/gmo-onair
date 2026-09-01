// テロップCG — ネームスーパー（下部テロップ×name）のテーマ別構造。
//
// 実物のネームは**ジャンルごとに構造が違う**（specs §9.5）。同じ箱の色替えではなく、
// テーマ＝別の造形として実装する。数値は実画像からの実測（specs §9.7）:
//   ・**文字はプレート高の 0.7〜0.8 を充填する**（実測 0.805。余白たっぷり=AI臭の筆頭）
//   ・報道・速報系の面は**ベタで不透明**（純白セル・紺ベタ。グラデも影も無い）
//   ・バラエティは「帯＋左肩ラベルの乗り上げ（少し回転）」が実物の文法
import type { CSSProperties } from 'react';
import type { GraphicsPageRow } from '@/lib/graphicsApi';
import { pickLang, type GraphicsLang } from './langField';
import {
  EDGE_DARK, GOLD, GOTHIC, NAVY_PLATE, NEWS_NAVY, SAFE_X, SAFE_Y, SERIF,
  SOFT_SHADOW, CORPORATE_ACCENT, WHITE, type TelopThemeKey,
} from './telopTheme';

interface NameFields {
  label: string;
  name: string;
  sub: string;
}

/**
 * `lang==='en'` のときは `labelEn`/`mainTextEn`/`subTextEn` を優先し、無ければ
 * 日本語版へフォールバックする（`langField.ts` の `pickLang` に統一・§多言語対応）。
 * ここで一度だけ解決しておけば、下の CeremonyName 等の各テーマ実装は今までどおり
 * `f.name`/`f.sub` を読むだけでよい。
 */
function readFields(page: GraphicsPageRow, lang?: GraphicsLang): NameFields {
  const mainText = pickLang(page.fields, 'mainText', lang);
  const legacyName = pickLang(page.fields, 'name', lang);
  return {
    label: pickLang(page.fields, 'label', lang),
    name: mainText || legacyName || page.name,
    sub: pickLang(page.fields, 'subText', lang) || pickLang(page.fields, 'title', lang),
  };
}

/** 下部の基準位置。ティッカー帯（y=1008〜）が出ている間はその上に退避する */
function anchor(tickerLive: boolean | undefined): CSSProperties {
  return { position: 'absolute', left: SAFE_X, bottom: tickerLive ? 100 : SAFE_Y };
}

const ellipsis: CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

/** 式典: 暗紺面。罫は「見出しの短い金下線」の1本だけ（面の縁に線を回さない） */
function CeremonyName({ f, tickerLive }: { f: NameFields; tickerLive?: boolean }) {
  return (
    <div style={{ ...anchor(tickerLive), minWidth: 560, maxWidth: 1180, background: NAVY_PLATE, boxShadow: '0 6px 18px rgba(0, 0, 0, 0.35)' }}>
      <div style={{ padding: '18px 56px 20px 46px', minWidth: 0 }}>
        {f.label && (
          <div style={{ display: 'inline-flex', flexDirection: 'column', marginBottom: 12 }}>
            <div style={{ fontFamily: SERIF, fontSynthesis: 'none', fontSize: 33, fontWeight: 700, color: GOLD, letterSpacing: '0.34em', lineHeight: 1.15, whiteSpace: 'nowrap' }}>
              {f.label}
            </div>
            <div style={{ height: 1, background: GOLD, opacity: 0.85, marginTop: 8, marginRight: '0.34em' }} />
          </div>
        )}
        <div style={{ fontFamily: SERIF, fontSynthesis: 'none', fontSize: 80, fontWeight: 900, color: WHITE, letterSpacing: '0.1em', lineHeight: 1.1, textShadow: SOFT_SHADOW, ...ellipsis }}>
          {f.name}
        </div>
        {f.sub && (
          <div style={{ fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 28, fontWeight: 500, color: '#c9c9c9', letterSpacing: '0.08em', lineHeight: 1.25, marginTop: 10, ...ellipsis }}>
            {f.sub}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 報道: 肩書タブ＋白い名前面の2枚重ね。線0本・面はベタ不透明（実測: 純白セル）。
 * 文字充填はタブ 0.7・名前面 0.78（実測 0.805 に合わせて余白を絞ってある —
 * ここを緩めると一気に Web の絵になる）。
 */
function NewsName({ f, tickerLive }: { f: NameFields; tickerLive?: boolean }) {
  const tab = f.label || f.sub;
  const subInPlate = f.label ? f.sub : '';
  return (
    <div style={{ ...anchor(tickerLive), display: 'flex', flexDirection: 'column', alignItems: 'flex-start', maxWidth: 1180 }}>
      {tab && (
        <div style={{ fontFamily: GOTHIC, fontSynthesis: 'none', background: NEWS_NAVY, color: WHITE, fontSize: 28, fontWeight: 800, letterSpacing: '0.04em', lineHeight: 1.2, padding: '5px 18px 6px', maxWidth: '100%', ...ellipsis }}>
          {tab}
        </div>
      )}
      <div style={{ background: '#ffffff', padding: '8px 40px 10px 30px', minWidth: 480, maxWidth: '100%' }}>
        <div style={{ fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 68, fontWeight: 900, color: '#101014', letterSpacing: '0.01em', lineHeight: 1.12, fontFeatureSettings: "'palt' 1", ...ellipsis }}>
          {f.name}
        </div>
        {subInPlate && (
          <div style={{ fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 24, fontWeight: 700, color: '#33363e', letterSpacing: '0.03em', lineHeight: 1.2, marginTop: 6, ...ellipsis }}>
            {subInPlate}
          </div>
        )}
      </div>
    </div>
  );
}

/** コーポレート: 面なしの袋文字＋アクセント色の下罫1本（この1本が造形の本体） */
function CorporateName({ f, tickerLive }: { f: NameFields; tickerLive?: boolean }) {
  return (
    <div style={{ ...anchor(tickerLive), display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', maxWidth: 1100 }}>
      {f.label && (
        <div style={{ fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 28, fontWeight: 700, color: WHITE, letterSpacing: '0.12em', marginBottom: 8, ...EDGE_DARK, ...ellipsis, maxWidth: '100%' }}>
          {f.label}
        </div>
      )}
      <div style={{ fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 70, fontWeight: 900, color: WHITE, letterSpacing: '0.03em', lineHeight: 1.12, fontFeatureSettings: "'palt' 1", ...EDGE_DARK, ...ellipsis, maxWidth: '100%' }}>
        {f.name}
      </div>
      {f.sub && (
        <div style={{ fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 27, fontWeight: 700, color: '#e6e8eb', letterSpacing: '0.05em', marginTop: 8, ...EDGE_DARK, ...ellipsis, maxWidth: '100%' }}>
          {f.sub}
        </div>
      )}
      <div style={{ height: 3, alignSelf: 'stretch', background: CORPORATE_ACCENT, marginTop: 12 }} />
    </div>
  );
}

/**
 * バラエティ: 実物の帯テロップの文法（実画像より）— 伸縮する帯＋**左肩ラベルの乗り上げ**
 * （帯の角に重ね・少し回転）。帯はバラエティに限りグラデ可。文字は帯を充填し、
 * 薄い暗エッジで映像から浮かせる。
 */
function VarietyName({ f, tickerLive }: { f: NameFields; tickerLive?: boolean }) {
  const label = f.label || f.sub;
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: tickerLive ? 104 : SAFE_Y,
        maxWidth: 1920 - SAFE_X * 2,
      }}
    >
      {label && (
        <div
          style={{
            position: 'absolute',
            top: -30,
            left: -18,
            transform: 'rotate(-3deg)',
            background: '#e8332a',
            color: WHITE,
            fontFamily: GOTHIC,
            fontSynthesis: 'none',
            fontSize: 30,
            fontWeight: 900,
            lineHeight: 1.2,
            padding: '4px 18px 6px',
            boxShadow: '3px 3px 0 rgba(10, 10, 10, 0.5)',
            whiteSpace: 'nowrap',
            zIndex: 1,
          }}
        >
          {label}
        </div>
      )}
      <div
        style={{
          background: 'linear-gradient(90deg, #571a8e 0%, #8a2bbf 55%, #a94fd6 100%)',
          borderRadius: 10,
          padding: '10px 52px 14px',
          boxShadow: '0 4px 0 rgba(10, 10, 10, 0.45)',
        }}
      >
        <div
          style={{
            fontFamily: GOTHIC,
            fontSynthesis: 'none',
            fontSize: 62,
            fontWeight: 900,
            color: WHITE,
            letterSpacing: '0.02em',
            lineHeight: 1.15,
            fontFeatureSettings: "'palt' 1",
            WebkitTextStroke: '4px rgba(28, 8, 44, 0.85)',
            paintOrder: 'stroke fill',
            ...ellipsis,
          }}
        >
          {f.name}
        </div>
      </div>
    </div>
  );
}

export function LowerThirdName({ page, theme, tickerLive, lang }: {
  page: GraphicsPageRow; theme: TelopThemeKey; tickerLive?: boolean; lang?: GraphicsLang;
}) {
  const f = readFields(page, lang);
  if (theme === 'news-navy') return <NewsName f={f} tickerLive={tickerLive} />;
  if (theme === 'corporate-light') return <CorporateName f={f} tickerLive={tickerLive} />;
  if (theme === 'variety-pop') return <VarietyName f={f} tickerLive={tickerLive} />;
  return <CeremonyName f={f} tickerLive={tickerLive} />;
}
