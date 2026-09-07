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
 * ── 「次の週を作る」ボタン ──────────────────────────────────
 *
 * 週の箱は自動生成のはずが、その定期実行トリガーが未実装なので検証環境が
 * 止まっていた。閲覧権限しかない人には出さないため、`onAddNextWeek` を
 * 渡すかどうかは呼び出し側（`WeeklyDetailPage.tsx`）の責務にしてある。
 */
import { useState } from 'react';
import {
  CheckCircle2, ChevronDown, CircleDashed, Loader2, Plus,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Sheet } from '@gmo-onair/shared/src/client-v4/sheet';
import { Button } from '@/components/ui/button';
import { formatWeekJa, type OpsReport } from '@/lib/types';

export function WeekPickerSheet({
  reports, activeId, onAddNextWeek, addingNextWeek,
}: {
  reports: OpsReport[];
  activeId?: string;
  /** 未指定なら「次の週を作る」ボタンは出さない（閲覧権限のみのユーザー向け） */
  onAddNextWeek?: () => void;
  /** true の間はボタンを disabled にし、スピナーを出す（ensure API 実行中） */
  addingNextWeek?: boolean;
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
        {onAddNextWeek && (
          <Button variant="outline" className="w-full" onClick={onAddNextWeek} disabled={addingNextWeek}>
            {addingNextWeek
              ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
              : <Plus className="mr-1 h-4 w-4" aria-hidden="true" />}
            次の週を作る
          </Button>
        )}
        <div className="-mx-4 flex flex-col divide-y divide-border-faint">
          {reports.map((r) => {
            const published = r.status === 'published';
            const isActive = r.id === activeId;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => { setOpen(false); navigate(`/weekly/${r.id}`); }}
                className={`min-h-tap flex items-center justify-between gap-2 px-4 py-3 text-left ${
                  isActive ? 'bg-primary-surface text-primary' : ''
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
            );
          })}
        </div>
      </Sheet>
    </>
  );
}
