/**
 * 右の「部品」— 数字／グラフ／一覧／案件ページ／実施報告／そのほか。つまんでキャンバスへ、＋でいまのページへ
 *
 * - 部品は `@dnd-kit/core` の `useDraggable`。落とし先はキャンバスの点線の枠（いまのページの下）と、
 *   左の一覧の行と行のあいだ（新しいページ）
 * - ＋を押すと、いまのページの空きに入る。「差し替え」を押した部品があるときは、その部品を置き換える
 * - 「ページ」の部品（案件ページ・実施報告・内覧会）は、いまのページの下に新しいページとして入る
 * - 下の「このページ（N）」は、いま選んでいるページの要約（対象月・主体・注記・出力のされ方）
 */
import { useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { GripVertical, Plus, X } from 'lucide-react';
import { cn } from '@gmo-onair/shared/src/client/utils';
import type { KeepReportPack, SlidePage } from '@gmo-onair/shared/src/keepReport/types';
import { KIND_CLASS, entityShort, monthOf, pageHumanEdits, plOptions } from './deckLabels';
import { useDeckStore } from './deckState';
import { buildChips, type ChipGroup, type PartChip } from './partChips';
import { pageNumbers } from './SlideFrame';

function Chip({ chip, onAdd, replacing }: { chip: PartChip; onAdd: (c: PartChip) => void; replacing: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `chip:${chip.key}`, data: { type: 'chip', chip } });
  const addLabel = chip.kind === 'page' ? `${chip.label}をこのページの下に追加` : replacing ? `${chip.label}に差し替え` : `${chip.label}をこのページに追加`;
  return (
    <div
      ref={setNodeRef}
      className={cn('flex h-9 items-center gap-1 rounded-control-md border border-border bg-card pl-1 pr-0.5', isDragging && 'opacity-40')}
      data-chip={chip.key}
    >
      <span
        {...attributes}
        {...listeners}
        className="flex min-w-0 flex-1 cursor-grab touch-none items-center gap-2 py-1"
        aria-label={`${chip.label}（つまんで置く）`}
      >
        <GripVertical className="h-3 w-3 shrink-0 text-fg-disabled" aria-hidden="true" />
        <span className="text-sub-sm min-w-0 flex-1 truncate text-foreground">{chip.label}</span>
        <span className={cn('text-badge inline-flex h-4 shrink-0 items-center rounded-badge-xs px-1.5', KIND_CLASS[chip.badge])}>{chip.badge}</span>
      </span>
      <button
        type="button"
        onClick={() => onAdd(chip)}
        aria-label={addLabel}
        title={addLabel}
        className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-primary hover:bg-primary-surface', replacing && chip.kind === 'part' && 'bg-warning-surface text-warning')}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function PageSummary({ page, pack, no }: { page: SlidePage | null; pack: KeepReportPack | null; no: number | undefined }) {
  if (!page) return null;
  const table = page.parts.find((p) => p.type === 'table') ?? null;
  const { mode, entity } = plOptions(table);
  const month = page.template === 'pl_table'
    ? `${pack ? pack[mode].all.year_month : ''} ${mode === 'forecast' ? '着地見込' : '着地'}`
    : page.template === 'utilization_calendar'
      ? (pack?.calendars ?? []).map((c) => `${monthOf(c.year_month)}月`).join('・')
      : '—';
  const types = new Set(page.parts.map((p) => p.type));
  const out = [
    types.has('table') ? '表は PowerPoint の表' : null,
    types.has('chart') ? 'グラフは PowerPoint のグラフ' : null,
    types.has('photos') || types.has('image') ? '写真は画像' : null,
    types.has('text') || types.has('bullets') ? '文はテキストボックス' : null,
  ].filter(Boolean).join('・') || '—';
  const edits = pageHumanEdits(page);
  const rows: Array<[string, string, string?]> = [
    ['対象月', month],
    ['計上会社', page.template === 'pl_table' ? entityShort(entity) : '—'],
    ['直し', edits ? `人が直した ${edits}件` : '無し', edits ? 'text-warning' : undefined],
    ['出力', out],
  ];
  return (
    <div className="shrink-0 border-t border-border-faint bg-background px-3 py-2.5">
      <p className="text-th mb-1.5 text-muted-foreground">このページ（{no ?? '—'}）</p>
      <div className="text-sub-sm flex flex-col gap-1">
        {rows.map(([k, v, cls]) => (
          <span key={k} className="flex justify-between gap-3">
            <span className="shrink-0 text-muted-foreground">{k}</span>
            <span className={cn('min-w-0 truncate text-right font-bold', cls)}>{v}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function PartsPanel() {
  const pack = useDeckStore((s) => s.pack);
  const deck = useDeckStore((s) => s.deck);
  const selectedPageId = useDeckStore((s) => s.selectedPageId);
  const replaceTargetPartId = useDeckStore((s) => s.replaceTargetPartId);
  const addPart = useDeckStore((s) => s.addPart);
  const addPage = useDeckStore((s) => s.addPage);
  const replacePart = useDeckStore((s) => s.replacePart);
  const setReplaceTarget = useDeckStore((s) => s.setReplaceTarget);

  const groups: ChipGroup[] = useMemo(() => buildChips(pack), [pack]);
  const pages = useMemo(() => deck?.pages ?? [], [deck]);
  const page = pages.find((p) => p.id === selectedPageId) ?? null;
  const no = useMemo(() => (page ? pageNumbers(pages).get(page.id) : undefined), [pages, page]);
  const replacing = !!replaceTargetPartId && !!page?.parts.some((p) => p.id === replaceTargetPartId);

  const onAdd = (chip: PartChip) => {
    if (chip.kind === 'page' && chip.page) {
      addPage(chip.page, page?.id ?? null);
      return;
    }
    if (!chip.part) return;
    if (!page) {
      addPage({ template: 'free', parts: [chip.part] });
      return;
    }
    if (replacing && replaceTargetPartId) replacePart(page.id, replaceTargetPartId, chip.part);
    else addPart(page.id, chip.part);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {replacing && (
        <div className="text-sub-sm mx-2.5 mt-2 flex items-center gap-2 rounded-control-md border border-warning-border bg-warning-surface px-2.5 py-1.5 text-warning">
          <span className="min-w-0 flex-1">差し替える部品の ＋ を押してください</span>
          <button type="button" onClick={() => setReplaceTarget(null)} aria-label="差し替えをキャンセル" className="inline-flex h-8 w-8 items-center justify-center rounded-control hover:bg-card">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2.5">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="text-th mb-1 mt-2.5 text-muted-foreground">{g.title}</p>
            <div className="flex flex-col gap-1">
              {g.chips.map((c) => <Chip key={c.key} chip={c} onAdd={onAdd} replacing={replacing} />)}
            </div>
          </div>
        ))}
        {!pack && <p className="text-note mt-3 text-muted-foreground">数字を読み込むと、ここに置ける部品が出ます</p>}
      </div>
      <PageSummary page={page} pack={pack} no={no} />
    </div>
  );
}
