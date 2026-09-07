/**
 * ウィークリー活動報告 — 週を選ぶ (スマホ専用の週ピッカー) (v4ネイティブUI監査 2026-08-20)
 *
 * ── 行を縮めたものではありません ────────────────────────────
 *
 * 以前の `WeekRail` は PC と同じ縦メニューを `overflow-x-auto` の横スクロールに
 * 変えただけで、指で払って選ぶだけの一覧だった。いま選んでいる週がどれで、
 * 確定済みか下書きかも横に流れる短冊からは読み取りにくい
 * （`docs/v4-native-ui-audit-2026-08-20.md` 指摘）。
 *
 * **いま開いている週を表すボタン**（PageHeader の下・本文の直前）を置き、
 * 押すと`client-v4/sheet.tsx` の `<Sheet>` で全週の一覧を開く。週を1つ選ぶと
 * シートは閉じて中身が差し替わる。
 *
 * ── 「週を追加」= 任意の開始日 ────────────────────────────────
 *
 * 以前は「次の週を作る」（最新週の翌週固定）しか無かった。日付入力（既定値=
 * 次の週の月曜）を編集すれば任意の週を作れる（詳しい経緯は `WeekRail.tsx` 冒頭）。
 * 閲覧権限しかない人には `onAddWeek`/`onDeleteReport` を渡さないため、
 * 出すかどうかは呼び出し側（`WeeklyDetailPage.tsx`）の責務にしてある。
 */
import { useEffect, useState } from 'react';
import {
  CheckCircle2, ChevronDown, CircleDashed, Loader2, Plus, Trash2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Sheet } from '@gmo-onair/shared/src/client-v4/sheet';
import { Button } from '@/components/ui/button';
import { formatWeekJa, type OpsReport } from '@/lib/types';

export function WeekPickerSheet({
  reports, activeId, defaultAddStart, onAddWeek, addingWeek, onDeleteReport, deletingId,
}: {
  reports: OpsReport[];
  activeId?: string;
  /** 「週を追加」の日付入力の既定値 (次の週の月曜)。`onAddWeek` と対 */
  defaultAddStart?: string;
  /** 未指定なら「週を追加」欄は出さない（閲覧権限のみのユーザー向け） */
  onAddWeek?: (startDate: string) => void;
  /** true の間は追加欄を disabled にする（ensure API 実行中） */
  addingWeek?: boolean;
  /** 未指定なら削除ボタンは出さない（閲覧権限のみのユーザー向け） */
  onDeleteReport?: (report: OpsReport) => void;
  /** 削除中の週の id（そのボタンだけ disabled にしてスピナーを出す） */
  deletingId?: string;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const active = reports.find((r) => r.id === activeId);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-tap flex w-full items-center justify-between gap-2 rounded-card border border-border bg-card px-3.5 py-2.5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="text-list block truncate">
            {active ? formatWeekJa(active.period_key) : '週を選ぶ'}
          </span>
          {active && (
            <span className="text-sub-sm inline-flex items-center gap-1 text-muted-foreground">
              {active.status === 'published'
                ? <><CheckCircle2 className="h-3 w-3 text-success" aria-hidden="true" />確定済み</>
                : <><CircleDashed className="h-3 w-3 text-warning" aria-hidden="true" />下書き</>}
              {typeof active.item_count !== 'undefined' && <span className="font-number">・トピック {active.item_count}</span>}
            </span>
          )}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      <Sheet open={open} onOpenChange={setOpen} title="週を選ぶ" sub={`全 ${reports.length} 週`}>
        {onAddWeek && (
          <AddWeekRow defaultStart={defaultAddStart} adding={addingWeek} onAdd={(d) => { setOpen(false); onAddWeek(d); }} />
        )}
        <div className="-mx-4 flex flex-col divide-y divide-border-faint">
          {reports.map((r) => {
            const published = r.status === 'published';
            const isActive = r.id === activeId;
            return (
              <div key={r.id} className="flex items-center gap-1 px-4">
                <button
                  type="button"
                  onClick={() => { setOpen(false); navigate(`/weekly/${r.id}`); }}
                  className={`min-h-tap flex min-w-0 flex-1 items-center justify-between gap-2 py-3 text-left ${
                    isActive ? 'text-primary' : ''
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-list block truncate">{formatWeekJa(r.period_key)}</span>
                    <span className="text-sub-sm inline-flex items-center gap-1 text-muted-foreground">
                      {published
                        ? <><CheckCircle2 className="h-3 w-3 text-success" aria-hidden="true" />確定済み</>
                        : <><CircleDashed className="h-3 w-3 text-warning" aria-hidden="true" />下書き</>}
                      {typeof r.item_count !== 'undefined' && <span className="font-number">・トピック {r.item_count}</span>}
                    </span>
                  </span>
                  {isActive && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                </button>
                {onDeleteReport && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-destructive"
                    onClick={() => onDeleteReport(r)}
                    disabled={deletingId === r.id}
                    aria-label={`${formatWeekJa(r.period_key)}を削除`}
                  >
                    {deletingId === r.id
                      ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}

/** 日付入力 + 「追加」。開始日は既定値から変えられる（=任意の週を作れる） */
function AddWeekRow({ defaultStart, onAdd, adding }: {
  defaultStart?: string; onAdd: (startDate: string) => void; adding?: boolean;
}) {
  const [date, setDate] = useState(defaultStart ?? '');
  useEffect(() => { if (defaultStart) setDate(defaultStart); }, [defaultStart]);

  return (
    <div className="mb-1 flex flex-col gap-1 rounded-control border border-dashed border-border p-2.5">
      <label htmlFor="week-sheet-add-date" className="text-sub-sm text-muted-foreground">週を追加（開始日）</label>
      <div className="flex gap-1.5">
        <input
          id="week-sheet-add-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="min-h-tap min-w-0 flex-1 rounded-control border border-border bg-background px-2 py-1 text-sub"
        />
        <Button
          variant="outline"
          className="min-h-tap shrink-0"
          onClick={() => date && onAdd(date)}
          disabled={adding || !date}
        >
          {adding
            ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            : <Plus className="h-4 w-4" aria-hidden="true" />}
          追加
        </Button>
      </div>
    </div>
  );
}
