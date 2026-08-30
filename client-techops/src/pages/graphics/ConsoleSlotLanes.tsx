// テロップCG — 送出コンソールのスロットレーン（最終防衛線・モック②の上段）。
//
// 6スロットの「いま何が出ているか」を常設で並べる。ページ名に加えて
// **経過時間**（cue.takenAt からの mm:ss・等幅数字）を出す — 「出しっぱなし」に
// 気づくための数字なので、時刻はサーバー基準（親から渡る skew 補正済みの
// serverNowMs）で計算し、クライアントの時計ではフリーランさせない。
import { Button } from '@/components/ui/button';
import {
  GRAPHICS_SLOTS, SLOT_LABELS,
  type GraphicsCueRow, type GraphicsPageRow, type GraphicsSlot,
} from '@/lib/graphicsApi';

function two(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 経過時間 mm:ss（1時間を超えたら h:mm:ss）。負値は 0:00 に丸める */
export function formatElapsed(fromIso: string, serverNowMs: number): string {
  const from = Date.parse(fromIso);
  if (!Number.isFinite(from)) return '';
  const sec = Math.max(0, Math.floor((serverNowMs - from) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

export function ConsoleSlotLanes({ cues, pageById, serverNowMs, onOut }: {
  cues: Partial<Record<GraphicsSlot, GraphicsCueRow>>;
  pageById: Map<string, GraphicsPageRow>;
  serverNowMs: number;
  onOut: (slot: GraphicsSlot) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      {GRAPHICS_SLOTS.map((slot) => {
        const cue = cues[slot];
        const page = cue?.pageId ? pageById.get(cue.pageId) ?? null : null;
        const live = !!cue?.pageId;
        return (
          <div
            key={slot}
            className={`flex flex-col gap-1.5 rounded-card border p-2.5 ${
              live ? 'border-destructive-border bg-destructive-surface' : 'border-border bg-card'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${live ? 'bg-destructive' : 'bg-border-disabled'}`}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-th text-muted-foreground">{SLOT_LABELS[slot]}</span>
              {live && cue?.takenAt && (
                <span className="font-number shrink-0 text-sub-sm tabular-nums text-muted-foreground">
                  {formatElapsed(cue.takenAt, serverNowMs)}
                </span>
              )}
            </div>
            <div className="flex min-h-[28px] items-center gap-1.5">
              <span className={`min-w-0 flex-1 truncate text-sub ${live ? 'font-bold' : 'text-muted-foreground'}`}>
                {page ? `${page.callNo} ${page.name}` : live ? '（不明なページ）' : 'オンエアなし'}
              </span>
              {live && (
                <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => onOut(slot)}>
                  OUT
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
