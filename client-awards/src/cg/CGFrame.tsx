import { CG_W, CG_H } from './types';
import type { CgCategory, CgCueState, CgSurvey } from './types';
import CGSequence from './CGSequence';

export type CgLang = 'ja' | 'en' | 'both';

interface Props {
  lang: CgLang;
  cue: CgCueState;
  category: CgCategory | null;
  allCategories?: CgCategory[];
  surveys?: CgSurvey[];
  eventName: string;
  eventSubtitle?: string | null;
  transparent?: boolean;
}

/**
 * CG フレーム（1920x1080）の中身を `lang` に応じて描画する。
 * - 'ja' / 'en': 単一言語をそのままフルサイズ表示
 * - 'both': 左右に半サイズ（960x540）の JA / EN を並べて中央寄せ
 */
export default function CGFrame({ lang, cue, category, allCategories, surveys, eventName, eventSubtitle, transparent }: Props) {
  if (lang !== 'both') {
    return (
      <CGSequence
        cue={cue}
        category={category}
        allCategories={allCategories}
        surveys={surveys}
        eventName={eventName}
        eventSubtitle={eventSubtitle}
        lang={lang}
        transparent={transparent}
      />
    );
  }

  // both モード: 左右に半サイズで JA / EN を並べる
  // 各ミニ枠は 960x540（中央寄せ: y=270）。CGSequence は 1920x1080 で描かれるので 0.5 倍にスケール。
  const half = (langMode: 'ja' | 'en', leftPx: number) => (
    <div
      style={{
        position: 'absolute',
        left: leftPx,
        top: 270,
        width: CG_W / 2,
        height: CG_H / 2,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: CG_W,
          height: CG_H,
          transform: 'scale(0.5)',
          transformOrigin: 'top left',
          position: 'absolute',
        }}
      >
        <CGSequence
          cue={cue}
          category={category}
          allCategories={allCategories}
          surveys={surveys}
          eventName={eventName}
          eventSubtitle={eventSubtitle}
          lang={langMode}
          transparent={transparent}
        />
      </div>
      {/* 言語ラベル */}
      <div
        style={{
          position: 'absolute',
          left: 12,
          top: 8,
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 18,
          letterSpacing: '0.18em',
          color: 'rgba(255,239,176,0.9)',
          textShadow: '0 1px 4px rgba(0,0,0,0.8)',
          pointerEvents: 'none',
        }}
      >
        {langMode === 'ja' ? 'JA' : 'EN'}
      </div>
    </div>
  );

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {half('ja', 0)}
      {half('en', CG_W / 2)}
    </div>
  );
}
