/**
 * ウィークリー活動報告 — 左の「週のリスト」(PC専用) (v4)
 *
 * ── なぜ1画面 (master-detail) にしたか ──────────────────────
 *
 * 以前は 一覧 (`/weekly`) と 中身 (`/weekly/:id`) の2画面で、
 * **先週と今週を見比べるのに毎回一覧へ戻る**必要があった。週報は
 * 「先週なんて書いたか」を見ながら書くものなので、行き来が本題を邪魔していた。
 *
 * 週のリストは左に置いたまま中身だけ差し替える。**URL は `/weekly/:id` のまま**
 * なので、ブックマークもリンクもそのまま生きる。
 *
 * ── スマホは別部品 ──────────────────────────────────────────
 *
 * 以前はここを横スクロールにして流用していたが、それだけでは専用の週ピッカー
 * になっていなかった（`docs/v4-native-ui-audit-2026-08-20.md` 指摘）。
 * スマホは `./WeekPickerSheet.tsx`（ボタン + シート）に差し替え済み
 * （出し分けは `WeeklyDetailPage.tsx` の `useIsMobile()`）。この部品は
 * 1024px 以上でだけ描かれるので、横スクロールの畳みは不要。
 *
 * ── 「週を追加」= 任意の開始日 ────────────────────────────────
 *
 * 以前は「次の週を作る」（最新週の翌週固定）しか無かったが、それだと
 * **最初の1週がいつ・誰の手でどう作られたかに全部が引きずられる**
 * （実際、検証環境は最初に手動で作った週が偶然 7/6 スタートで、以後ずっと
 * その7日刻みのままだった — 見た人には「なぜ7/6」が意味不明だった）。
 * 日付入力（既定値=次の週の月曜）を編集すれば任意の週を作れるようにした。
 * サーバー側 (`normalizeWeekStart`) が週内のどの日でも月曜に丸めてくれる。
 * 閲覧権限しかない人には `onAddWeek`/`onDeleteReport` を渡さないため、
 * 出すかどうかは呼び出し側（`WeeklyDetailPage.tsx`）の責務にしてある。
 */
import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  CheckCircle2, CircleDashed, Loader2, Plus, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatWeekJa, type OpsReport } from '@/lib/types';

export function WeekRail({
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
  return (
    <nav
      aria-label="週を選ぶ"
      className="flex w-[260px] shrink-0 flex-col gap-2 overflow-y-auto rounded-card border border-border bg-card p-2"
    >
      {onAddWeek && (
        <AddWeekRow defaultStart={defaultAddStart} onAdd={onAddWeek} adding={addingWeek} />
      )}
      {reports.map((r) => {
        const published = r.status === 'published';
        const active = r.id === activeId;
        return (
          <div key={r.id} className="group flex items-center gap-1">
            <NavLink
              to={`/weekly/${r.id}`}
              className={`flex min-h-[46px] min-w-0 flex-1 flex-col justify-center rounded-control px-3 py-2 ${
                active ? 'bg-primary-surface text-primary' : 'text-foreground hover:bg-muted'
              }`}
            >
              <span className="text-list whitespace-nowrap">{formatWeekJa(r.period_key)}</span>
              <span className="text-sub-sm inline-flex items-center gap-1 whitespace-nowrap text-muted-foreground">
                {published
                  ? <><CheckCircle2 className="h-3 w-3 text-success" aria-hidden="true" />確定済み</>
                  : <><CircleDashed className="h-3 w-3 text-warning" aria-hidden="true" />下書き</>}
                {typeof r.item_count !== 'undefined' && <span className="font-number">・トピック {r.item_count}</span>}
              </span>
            </NavLink>
            {onDeleteReport && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-destructive"
                onClick={() => onDeleteReport(r)}
                disabled={deletingId === r.id}
                aria-label={`${formatWeekJa(r.period_key)}を削除`}
              >
                {deletingId === r.id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
              </Button>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/** 日付入力 + 「追加」。開始日は既定値から変えられる（=任意の週を作れる） */
function AddWeekRow({ defaultStart, onAdd, adding }: {
  defaultStart?: string; onAdd: (startDate: string) => void; adding?: boolean;
}) {
  const [date, setDate] = useState(defaultStart ?? '');
  // 一覧が更新される（=最新週が変わる）たびに既定値も追従させる
  useEffect(() => { if (defaultStart) setDate(defaultStart); }, [defaultStart]);

  return (
    <div className="flex flex-col gap-1 rounded-control border border-dashed border-border p-2">
      <label htmlFor="week-rail-add-date" className="text-sub-sm text-muted-foreground">週を追加（開始日）</label>
      <div className="flex gap-1.5">
        <input
          id="week-rail-add-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="min-w-0 flex-1 rounded-control border border-border bg-background px-2 py-1 text-sub"
        />
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => date && onAdd(date)}
          disabled={adding || !date}
        >
          {adding
            ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            : <Plus className="h-4 w-4" aria-hidden="true" />}
        </Button>
      </div>
    </div>
  );
}
