// テロップCG — 本番モードの「いま出ているもの」（モック②の上段）。
//
// 全6か所を常設で並べていた旧実装をやめ、**いま実際に何か出ている位置だけ**を
// 横に並べる（docs/design/v4/graphics-redesign.md §8）。0件になれば帯ごと非表示にする
// （このコンポーネント内部で `return null` する — 呼び出し側は条件を見ずに毎回描いてよい）。
// 「同時に出せないもの」（段6-4）で直後に空になった位置は、`autoOutHighlight` の間だけ
// 「消えたこと」に気づけるよう一時的に表示を残す（消えた瞬間に帯からいきなり無くなると
// 何が起きたか分からないため——「衝突の解決をオペレーターの注意力に任せない」の実装）。
//
// テロップ名に加えて**経過時間**（cue.takenAt からの mm:ss・等幅数字）を出す — 「出しっぱなし」に
// 気づくための数字なので、時刻はサーバー基準（親から渡る skew 補正済みの
// serverNowMs）で計算し、クライアントの時計でフリーランさせない。
//
// 個別の「消す」ボタン（旧「OUT」・見た目と操作対象は変えずラベルだけ変更——画面に
// 「OUT」という語を出さない方針のため）は、その位置に出ているものを1枚だけ下ろす。
// 全部消す（旧オールクリア）は別ボタン（呼び出し側 GraphicsConsolePage.tsx の担当・
// このコンポーネントの外）。
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

export function ConsoleSlotLanes({ cues, pageById, serverNowMs, onOut, autoOutHighlight }: {
  cues: Partial<Record<GraphicsSlot, GraphicsCueRow>>;
  pageById: Map<string, GraphicsPageRow>;
  serverNowMs: number;
  /** そのスロットのオンエアを下ろす（表示ラベルは「消す」・操作対象は今までの OUT と同じ） */
  onOut: (slot: GraphicsSlot) => void;
  /**
   * 段6-4: 自動退出ルールでいま OUT になったばかりのスロット（一定時間だけ点灯・
   * 呼び出し側 `GraphicsConsolePage` がタイマーで消す）。省略時は誰もハイライトしない
   */
  autoOutHighlight?: Set<GraphicsSlot>;
}) {
  // 表示対象＝「いまライブなスロット」∪「自動退出の直後で一時ハイライト中のスロット」。
  // どちらでもないスロット（元から何も出ていない）はもう帯に出さない
  const visibleSlots = GRAPHICS_SLOTS.filter((slot) => !!cues[slot]?.pageId || !!autoOutHighlight?.has(slot));
  if (visibleSlots.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      {visibleSlots.map((slot) => {
        const cue = cues[slot];
        const page = cue?.pageId ? pageById.get(cue.pageId) ?? null : null;
        const live = !!cue?.pageId;
        const justAutoOut = !live && !!autoOutHighlight?.has(slot);
        return (
          <div
            key={slot}
            className={`flex flex-col gap-1.5 rounded-card border p-2.5 transition-colors ${
              live
                ? 'border-destructive-border bg-destructive-surface'
                : justAutoOut
                  ? 'border-warning-border bg-warning-surface'
                  : 'border-border bg-card'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${live ? 'bg-destructive' : 'bg-border-disabled'}`}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-th text-muted-foreground">{SLOT_LABELS[slot]}</span>
              {justAutoOut && (
                <span className="shrink-0 rounded-control bg-warning px-1.5 py-0.5 text-note font-bold text-warning-foreground">
                  自動で消しました
                </span>
              )}
              {live && cue?.takenAt && (
                <span className="font-number shrink-0 text-sub-sm tabular-nums text-muted-foreground">
                  {formatElapsed(cue.takenAt, serverNowMs)}
                </span>
              )}
            </div>
            <div className="flex min-h-[28px] items-center gap-1.5">
              <span className={`min-w-0 flex-1 truncate text-sub ${live ? 'font-bold' : 'text-muted-foreground'}`}>
                {page ? `${page.callNo} ${page.name}` : live ? '（不明なテロップ）' : '何も出ていません'}
              </span>
              {live && (
                <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => onOut(slot)}>
                  消す
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
