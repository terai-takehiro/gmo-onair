// 計時・視聴者（liveops）— テンプレートカードの簡易サムネイル（v4.1・PR3）。
//
// 設計 §6-1「カードごとに簡易サムネイル…簡略化したミニプレビューでよい」のとおり、
// `DisplayCanvas`（表示画面と同じレンダラー）は使わず、要素の位置・サイズだけを
// 色付きの枠で示す軽量な代替を用意する（`DisplayCanvas` は `h-screen w-screen` 前提の
// 実寸描画で、カード内の小さな枠に縮小して正しく見せるには不向きなため）。
import { ELEMENT_LABELS } from './displayLayoutDefaults';
import type { DisplayLayout } from '@gmo-onair/shared/src/client/live/displayLayout';

export function DisplayLayoutMiniPreview({ layout }: { layout: DisplayLayout }) {
  const light = layout.background === 'light';
  return (
    <div className={`relative aspect-video w-full overflow-hidden rounded-md border border-border ${light ? 'bg-[#fafafa]' : 'bg-black'}`}>
      {layout.elements.filter((el) => el.visible).map((el) => (
        <div
          key={el.key}
          style={{ position: 'absolute', left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%` }}
          className={`flex items-center justify-center overflow-hidden rounded-badge-xs border text-[7px] font-semibold leading-none ${
            light ? 'border-black/20 bg-black/5 text-black/70' : 'border-white/25 bg-white/10 text-white/80'
          }`}
        >
          <span className="truncate px-0.5">{ELEMENT_LABELS[el.key]}</span>
        </div>
      ))}
    </div>
  );
}
