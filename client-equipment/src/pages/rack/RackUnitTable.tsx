/**
 * ラック図の下の実装一覧（v4 大④・モックの右下の表）
 *
 * ── 図だけでは読めないものを出す ────────────────────────────
 *
 * ラックの絵は 1U のセルが小さく、**型名と管理番号が入りません**（実際
 * `DefaultCellContent` は高さで文字を落としています）。図で位置を見て、
 * 表で中身を読む、の2枚組にします。
 *
 * ── 空きも出す ──────────────────────────────────────────────
 *
 * モックは表の下に「空き 3U（12-14）」を出します。**どこが空いているか**は
 * 機材を足すときにいちばん知りたい値なのに、図からは数えないと分かりません。
 */
import { cn } from '@gmo-onair/shared/src/client/utils';

export interface RackUnitRow {
  id: string;
  /** 下端U */
  position: number;
  height: number;
  slot: string;
  code: string | null;
  name: string;
  model: string | null;
  category: string | null;
  /** ブランクパネル・通線口など（機材台帳にぶら下がらない） */
  isPanel: boolean;
}

const SLOT_LABEL: Record<string, string> = {
  full: '全幅', left: '左1/2', right: '右1/2',
  l3: '左1/3', c3: '中1/3', r3: '右1/3',
};

/** U位置の書き方。1U なら「12」、複数Uなら「12-14」（下端から上端） */
export function uText(position: number, height: number): string {
  return height > 1 ? `${position}-${position + height - 1}` : String(position);
}

/**
 * 空いている U を連続した区間にまとめる。
 * **1つずつ並べない** —「3,4,5,6」より「3-6」のほうが足せるかを判断できる。
 */
export function freeRanges(units: number, rows: RackUnitRow[]): { from: number; to: number }[] {
  // **全幅で埋まっている U だけを「使用中」とする。** 左1/2 だけ埋まっている U を
  // 空きから外すと、右半分が空いているのに「空き無し」に見える
  const usedFull = new Set<number>();
  for (const r of rows) {
    if (r.slot !== 'full') continue;
    for (let u = r.position; u < r.position + r.height; u++) usedFull.add(u);
  }
  const out: { from: number; to: number }[] = [];
  let start: number | null = null;
  for (let u = 1; u <= units + 1; u++) {
    const free = u <= units && !usedFull.has(u);
    if (free && start === null) start = u;
    if (!free && start !== null) { out.push({ from: start, to: u - 1 }); start = null; }
  }
  return out;
}

export function RackUnitTable({
  units, rows, onOpen, onAddPanel, canEdit,
}: {
  units: number;
  rows: RackUnitRow[];
  onOpen: (id: string) => void;
  onAddPanel: () => void;
  canEdit: boolean;
}) {
  const sorted = [...rows].sort((a, b) => b.position - a.position);
  const gaps = freeRanges(units, rows);
  const freeU = gaps.reduce((n, g) => n + (g.to - g.from + 1), 0);

  return (
    <div className="rounded-card overflow-hidden border border-border">
      <div className="text-note flex items-center gap-2.5 border-b border-border-faint bg-surface-subtle px-3.5 py-2 font-bold text-muted-foreground">
        <span className="w-[58px] shrink-0 text-right">U位置</span>
        <span className="w-16 shrink-0">ID</span>
        <span className="min-w-0 flex-1">機材</span>
        <span className="w-14 shrink-0 text-center">種別</span>
        <span className="w-11 shrink-0 text-center">割付</span>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sub px-3.5 py-6 text-center text-muted-foreground">この面には何も実装されていません</p>
      ) : sorted.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onOpen(r.id)}
          className="flex w-full items-center gap-2.5 border-b border-border-faint px-3.5 py-2 text-left last:border-b-0"
        >
          <span className="font-number text-note w-[58px] shrink-0 text-right font-bold text-secondary-foreground">
            {uText(r.position, r.height)}
          </span>
          <span className={cn('font-number text-note w-16 shrink-0 truncate font-bold', r.isPanel ? 'text-muted-foreground' : 'text-primary')}>
            {r.code ?? '—'}
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-sub block truncate font-bold">{r.name}</span>
            <span className="text-note block truncate text-muted-foreground">{r.model ?? '—'}</span>
          </span>
          <span className="w-14 shrink-0 text-center">
            <span className="rounded-note text-badge inline-flex h-5 w-[52px] items-center justify-center bg-surface-subtle font-bold text-secondary-foreground">
              {r.isPanel ? 'パネル' : (r.category ?? '機材')}
            </span>
          </span>
          <span className="text-note w-11 shrink-0 text-center text-muted-foreground">
            {SLOT_LABEL[r.slot] ?? r.slot}
          </span>
        </button>
      ))}

      <div className="text-note flex flex-wrap items-center gap-2 bg-surface-subtle px-3.5 py-2 text-muted-foreground">
        <span className="min-w-0 flex-1">
          {/* 「空き 0U」も出す。出さないと**満杯なのか読み込めていないのか**が分からない */}
          空き <span className="font-number font-bold">{freeU}U</span>
          {gaps.length > 0 && <>（{gaps.map((g) => (g.from === g.to ? `${g.from}` : `${g.from}-${g.to}`)).join(' ・ ')}）</>}
          <span className="ml-1">— 左右に割り付けた U は空きに数えています（半分だけ埋まっているため）</span>
        </span>
        {canEdit && (
          <button
            type="button"
            onClick={onAddPanel}
            className="rounded-control min-h-tap inline-flex items-center gap-1.5 border border-border bg-card px-2.5 font-bold text-secondary-foreground lg:min-h-[32px]"
          >
            ＋ パネルを追加
          </button>
        )}
      </div>
    </div>
  );
}
