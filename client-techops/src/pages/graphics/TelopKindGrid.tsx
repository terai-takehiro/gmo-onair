// テロップCG — 「種類を選ぶ」カードグリッド（旧・部品ライブラリの役目）。
//
// docs/design/v4/graphics-redesign.md §5「③ テロップを作る・直す」の1段目。
// 旧 `PartLibraryPage.tsx`（独立画面・カタログ表示のみ）を、新規作成フローに埋め込む
// 選択ステップとして作り直した。カード自体（アイコン・位置のピクトグラム・一言説明）は
// 引き継ぎ、実データと無関係だった固定文字列（「24番組」等）は載せない（partLibraryData.ts 参照）。
import type { GraphicsPartKey, GraphicsSlot } from '@/lib/graphicsApi';
import { PART_DEFAULT_SLOT, SLOT_LABELS } from '@/lib/graphicsApi';
import { PART_LIBRARY_CARDS } from './partLibraryData';

/** 位置のピクトグラム（枠のどこに出るか）。四角の中の強調矩形の位置・大きさだけの簡易表現 */
const SLOT_PICTO_RECT: Record<GraphicsSlot, string> = {
  fullscreen: 'inset-[10%_8%]',
  lower: 'inset-[64%_6%_10%_6%]',
  side: 'inset-[8%_6%_auto_58%] h-[34%]',
  ticker: 'inset-[auto_0_10%_0] h-[14%]',
  clock: 'inset-[10%_auto_auto_6%] h-[26%] w-[36%]',
  flash: 'inset-[10%_0_auto_0] h-[16%]',
};

export default function TelopKindGrid({ value, onPick, className }: {
  /** 選んでいる種類（未選択は null） */
  value: GraphicsPartKey | null;
  onPick: (key: GraphicsPartKey) => void;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-1 gap-2 sm:grid-cols-2 ${className ?? ''}`}>
      {PART_LIBRARY_CARDS.map((c) => {
        const selected = value === c.partKey;
        const Icon = c.icon;
        const slot = PART_DEFAULT_SLOT[c.partKey];
        return (
          <button
            key={c.partKey}
            type="button"
            onClick={() => onPick(c.partKey)}
            aria-pressed={selected}
            className={`flex min-h-tap flex-col gap-1.5 rounded-control-lg border p-2.5 text-left transition-colors ${
              selected ? 'border-primary bg-primary-surface' : 'border-border bg-card hover:bg-surface-subtle'
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="relative h-7 w-12 shrink-0 overflow-hidden rounded bg-[#0f1115]">
                <span className={`absolute rounded-[1px] bg-white/70 ${SLOT_PICTO_RECT[slot]}`} aria-hidden="true" />{/* ui-tokens-ok: 28px四方に満たないピクトグラム内の装飾矩形。9段の役割名は実寸のUIパーツ向けでこの縮尺には合わない */}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                  <span className="truncate text-list font-bold">{c.name}</span>
                </span>
                <span className="block text-note text-muted-foreground">{SLOT_LABELS[slot]}</span>
              </span>
            </span>
            <span className="text-note leading-relaxed text-muted-foreground">{c.desc}</span>
          </button>
        );
      })}
    </div>
  );
}
