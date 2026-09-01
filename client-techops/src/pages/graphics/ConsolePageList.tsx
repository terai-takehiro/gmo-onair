// テロップCG — 送出コンソールのページ一覧（送出リスト・モック②の下段）。
//
// 並びは送出リスト順（sortOrder）のまま。いま PGM に出ている行は赤の面、
// PVW に立っている行は橙の面で追える（モック②の rowBg と同じ対応）。
// ここから出来るのは「PVWへ」だけ — 一覧から直接オンエアするボタンは作らない
// （TAKE できるのは PVW に見えているものだけ・graphics.md §4）。
import { Button } from '@/components/ui/button';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import type { GraphicsCueRow, GraphicsPageRow, GraphicsSlot } from '@/lib/graphicsApi';
import { SlotBadge, ProofBadge } from './badges';

export function ConsolePageList({ pages, cues, pvwPageId, onSelectPvw }: {
  /** 表示順（送出リスト順）に並べ替え済みのページ */
  pages: GraphicsPageRow[];
  cues: Partial<Record<GraphicsSlot, GraphicsCueRow>>;
  pvwPageId: string | null;
  /** 「PVWへ」/「選択中」の切り替え（null = 選択解除） */
  onSelectPvw: (pageId: string | null) => void;
}) {
  return (
    <section className="mt-4 overflow-hidden rounded-card border border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border-faint bg-surface-subtle px-4 py-2 text-th text-muted-foreground">
        <span className="font-number w-11 shrink-0 text-right">番号</span>
        <span className="w-24 shrink-0 text-center">スロット</span>
        <span className="min-w-0 flex-1">ページ</span>
        <span className="hidden w-[72px] shrink-0 text-center sm:block">校正</span>
        <span className="w-[96px] shrink-0 text-center">操作</span>
      </div>
      {pages.length === 0 ? (
        <EmptyState
          title="ページがまだありません"
          description="ハブ画面（ページと送出リスト）で本番前にページを作っておきます。"
        />
      ) : pages.map((p) => {
        const onAir = cues[p.slot]?.pageId === p.id;
        const inPvw = p.id === pvwPageId;
        return (
          <div
            key={p.id}
            className={`flex items-center gap-3 border-b border-border-faint px-4 py-2 last:border-b-0 ${
              onAir ? 'bg-destructive-surface' : inPvw ? 'bg-warning-surface' : 'hover:bg-surface-subtle'
            }`}
          >
            <span className="font-number w-11 shrink-0 text-right text-list font-bold">{p.callNo}</span>
            <span className="flex w-24 shrink-0 justify-center"><SlotBadge slot={p.slot} w={null} /></span>
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="min-w-0 truncate text-list">{p.name}</span>
              {onAir && (
                <span className="shrink-0 rounded-badge-xs bg-destructive px-1.5 py-0.5 text-badge font-bold text-destructive-foreground">ON AIR</span>
              )}
              {inPvw && (
                <span className="shrink-0 rounded-badge-xs bg-warning px-1.5 py-0.5 text-badge font-bold text-warning-foreground">PVW</span>
              )}
            </span>
            <span className="hidden w-[72px] shrink-0 justify-center sm:flex"><ProofBadge state={p.proofState} w={null} /></span>
            <span className="flex w-[96px] shrink-0 justify-end">
              <Button
                type="button"
                variant={inPvw ? 'default' : 'outline'}
                size="sm"
                onClick={() => onSelectPvw(inPvw ? null : p.id)}
              >
                {inPvw ? '選択中' : 'PVWへ'}
              </Button>
            </span>
          </div>
        );
      })}
    </section>
  );
}
