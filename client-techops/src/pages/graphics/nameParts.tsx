// テロップCG — ネームスーパー（下部テロップ×name）のテーマ別構造。
//
// 実物のネームは**ジャンルごとに構造が違う**（specs §9.5）。同じ箱の色替えではなく、
// テーマ＝別の造形として実装する:
//   ・式典     = 暗紺グラデ面＋金は「見出し文字と1本の短い下線」だけ
//   ・報道     = 「肩書タブ（紺ベタ・白抜き）＋名前面（白面・黒文字）」の2枚重ね。
//                2つの面は明度反転で分ける — 罫は使わない
//   ・コーポレート = 面なしの袋文字＋アクセント色の下罫1本（下罫1本型）
//   ・バラエティ  = 座布団なしの多重エッジ（塗り→内フチ色→外フチ黒→ベタ落ち影）・下中央
import type { CSSProperties, ReactNode } from 'react';
import type { GraphicsPageRow } from '@/lib/graphicsApi';
import {
  EDGE_DARK, GOLD, GOTHIC, NAVY_PLATE, NEWS_NAVY, NEWS_PLATE, SAFE_X, SAFE_Y, SERIF,
  SOFT_SHADOW, VARIETY_ACCENT, CORPORATE_ACCENT, WHITE, type TelopThemeKey,
} from './telopTheme';

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

interface NameFields {
  label: string;
  name: string;
  sub: string;
}

function readFields(page: GraphicsPageRow): NameFields {
  return {
    label: str(page.fields.label),
    name: str(page.fields.mainText) || str(page.fields.name) || page.name,
    sub: str(page.fields.subText) || str(page.fields.title),
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
    <div style={{ ...anchor(tickerLive), minWidth: 620, maxWidth: 1180, background: NAVY_PLATE, boxShadow: '0 6px 18px rgba(0, 0, 0, 0.35)' }}>
      <div style={{ padding: '26px 64px 28px 52px', minWidth: 0 }}>
        {f.label && (
          <div style={{ display: 'inline-flex', flexDirection: 'column', marginBottom: 18 }}>
            <div style={{ fontFamily: SERIF, fontSynthesis: 'none', fontSize: 33, fontWeight: 700, color: GOLD, letterSpacing: '0.34em', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
              {f.label}
            </div>
            <div style={{ height: 1, background: GOLD, opacity: 0.85, marginTop: 10, marginRight: '0.34em' }} />
          </div>
        )}
        <div style={{ fontFamily: SERIF, fontSynthesis: 'none', fontSize: 80, fontWeight: 900, color: WHITE, letterSpacing: '0.1em', lineHeight: 1.12, textShadow: SOFT_SHADOW, ...ellipsis }}>
          {f.name}
        </div>
        {f.sub && (
          <div style={{ fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 28, fontWeight: 500, color: '#c9c9c9', letterSpacing: '0.08em', lineHeight: 1.3, marginTop: 14, ...ellipsis }}>
            {f.sub}
          </div>
        )}
      </div>
    </div>
  );
}

/** 報道: 肩書タブ＋白い名前面の2枚重ね。線は0本 — 分離はすべて面の明度差 */
function NewsName({ f, tickerLive }: { f: NameFields; tickerLive?: boolean }) {
  const tab = f.label || f.sub;
  const subInPlate = f.label ? f.sub : '';
  return (
    <div style={{ ...anchor(tickerLive), display: 'flex', flexDirection: 'column', alignItems: 'flex-start', maxWidth: 1180 }}>
      {tab && (
        <div style={{ fontFamily: GOTHIC, fontSynthesis: 'none', background: NEWS_NAVY, color: WHITE, fontSize: 27, fontWeight: 700, letterSpacing: '0.06em', padding: '8px 22px 9px', maxWidth: '100%', ...ellipsis }}>
          {tab}
        </div>
      )}
      <div style={{ background: NEWS_PLATE, boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4)', padding: '16px 44px 18px 34px', minWidth: 520, maxWidth: '100%' }}>
        <div style={{ fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 66, fontWeight: 900, color: '#16181d', letterSpacing: '0.02em', lineHeight: 1.15, fontFeatureSettings: "'palt' 1", ...ellipsis }}>
          {f.name}
        </div>
        {subInPlate && (
          <div style={{ fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 25, fontWeight: 700, color: '#3d434e', letterSpacing: '0.04em', marginTop: 8, ...ellipsis }}>
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
        <div style={{ fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 28, fontWeight: 700, color: WHITE, letterSpacing: '0.12em', marginBottom: 10, ...EDGE_DARK, ...ellipsis, maxWidth: '100%' }}>
          {f.label}
        </div>
      )}
      <div style={{ fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 70, fontWeight: 900, color: WHITE, letterSpacing: '0.03em', lineHeight: 1.15, fontFeatureSettings: "'palt' 1", ...EDGE_DARK, ...ellipsis, maxWidth: '100%' }}>
        {f.name}
      </div>
      {f.sub && (
        <div style={{ fontFamily: GOTHIC, fontSynthesis: 'none', fontSize: 27, fontWeight: 700, color: '#e6e8eb', letterSpacing: '0.05em', marginTop: 10, ...EDGE_DARK, ...ellipsis, maxWidth: '100%' }}>
          {f.sub}
        </div>
      )}
      <div style={{ height: 3, alignSelf: 'stretch', background: CORPORATE_ACCENT, marginTop: 16 }} />
    </div>
  );
}

/**
 * 多重エッジの袋文字（バラエティ）: 塗り → 内フチ色 → 外フチ黒 → ベタ落ち影。
 * text-stroke は1重しか持てないため同一テキストを3枚重ねる（specs §3 の正攻法）。
 */
function TripleStroke({ text, size, inner, innerW, outerW }: {
  text: ReactNode; size: number; inner: string; innerW: number; outerW: number;
}) {
  const base: CSSProperties = {
    gridArea: '1 / 1',
    fontFamily: GOTHIC,
    fontSynthesis: 'none',
    fontSize: size,
    fontWeight: 900,
    lineHeight: 1.2,
    letterSpacing: '0.02em',
    whiteSpace: 'nowrap',
  };
  const drop = Math.max(4, Math.round(size * 0.09));
  return (
    <div style={{ display: 'grid' }}>
      <span aria-hidden style={{ ...base, color: 'transparent', WebkitTextStroke: `${(innerW + outerW) * 2}px #1a1a1a`, textShadow: `${drop}px ${drop}px 0 rgba(10, 10, 10, 0.85)` }}>{text}</span>
      <span aria-hidden style={{ ...base, color: 'transparent', WebkitTextStroke: `${innerW * 2}px ${inner}` }}>{text}</span>
      <span style={{ ...base, color: WHITE }}>{text}</span>
    </div>
  );
}

/** バラエティ: 下中央のコメントフォロー型。座布団なし・多重エッジで浮かせる */
function VarietyName({ f, tickerLive }: { f: NameFields; tickerLive?: boolean }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: tickerLive ? 104 : SAFE_Y + 8,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 20,
        maxWidth: 1920 - SAFE_X * 2,
      }}
    >
      {/* フチはフォントのウェイトと釣り合わせる — 小さい文字に太フチは潰れる（specs §9 NG3） */}
      {(f.label || f.sub) && <TripleStroke text={f.label || f.sub} size={34} inner={VARIETY_ACCENT} innerW={2.5} outerW={5.5} />}
      <TripleStroke text={f.name} size={68} inner={VARIETY_ACCENT} innerW={5} outerW={11} />
    </div>
  );
}

export function LowerThirdName({ page, theme, tickerLive }: {
  page: GraphicsPageRow; theme: TelopThemeKey; tickerLive?: boolean;
}) {
  const f = readFields(page);
  if (theme === 'news-navy') return <NewsName f={f} tickerLive={tickerLive} />;
  if (theme === 'corporate-light') return <CorporateName f={f} tickerLive={tickerLive} />;
  if (theme === 'variety-pop') return <VarietyName f={f} tickerLive={tickerLive} />;
  return <CeremonyName f={f} tickerLive={tickerLive} />;
}
