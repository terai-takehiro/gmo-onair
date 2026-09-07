/**
 * ウィークリー活動報告 — 対象週の切替 (2026-09 の再設計)
 *
 * ── 左のレールをやめた理由 ──────────────────────────────────
 *
 * 週の一覧を常時 240px の列で持つと、**読む本文がその分だけ狭くなる**うえ、
 * 全週が同じ重みで並ぶので「いま見ているのが何週目か」が分からなかった
 * （検証環境で 7/6 起点の週が並び続けたとき、それがどこから来た週なのか
 * 画面から辿れなかった）。
 *
 * 画面見出しを**対象週そのもの**にし、前後移動（◀ ▶）と 今週／先週 の表示を添える。
 * 一覧はシートに移し、**開いたときだけ**全週を月ごとに出す。
 * デイリーニュース報告の日付ナビ（◀ 日付 ▶）と同じ操作になる。
 *
 * PC もスマホも `<Sheet>` 1本（決めごと「終わらせるのはシートで」）。
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleDashed, Trash2 } from 'lucide-react';
import { Sheet } from '@gmo-onair/shared/src/client-v4/sheet';
import { Button } from '@/components/ui/button';
import { formatWeekJa, formatWeekRangeJa, toDateStr, type OpsReport } from '@/lib/types';
import { WeekAddCalendar } from './WeekAddCalendar';

/** 今週・先週だけ印を出す（それ以外は日付で足りる） */
function relativeLabel(periodKey: string): string | null {
  const now = new Date();
  const dow = now.getDay();
  now.setDate(now.getDate() + (dow === 0 ? -6 : 1 - dow));
  const thisWeek = toDateStr(now);
  if (periodKey === thisWeek) return '今週';
  now.setDate(now.getDate() - 7);
  return periodKey === toDateStr(now) ? '先週' : null;
}

/** 一覧を月ごとにまとめる（サーバーは period_key の新しい順で返す） */
function groupByMonth(reports: OpsReport[]): Array<{ key: string; label: string; rows: OpsReport[] }> {
  const thisYear = new Date().getFullYear();
  const out: Array<{ key: string; label: string; rows: OpsReport[] }> = [];
  for (const r of reports) {
    const key = r.period_key.slice(0, 7);
    const last = out[out.length - 1];
    if (last?.key === key) { last.rows.push(r); continue; }
    const [y, m] = key.split('-');
    out.push({
      key,
      label: Number(y) === thisYear ? `${Number(m)}月` : `${y}年${Number(m)}月`,
      rows: [r],
    });
  }
  return out;
}

export function WeekSwitcher({
  reports, activeId, canEdit, onAddWeek, addingWeek, onDeleteReport, deletingId,
}: {
  reports: OpsReport[];
  activeId?: string;
  canEdit: boolean;
  onAddWeek: (weekStart: string) => void;
  addingWeek: boolean;
  onDeleteReport: (report: OpsReport) => void;
  deletingId?: string;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const index = reports.findIndex((r) => r.id === activeId);
  const active = index >= 0 ? reports[index] : undefined;
  // 新しい順に並んでいるので、前の週は 1つ後ろ・次の週は 1つ手前
  const prev = index >= 0 ? reports[index + 1] : undefined;
  const next = index > 0 ? reports[index - 1] : undefined;
  const rel = active ? relativeLabel(active.period_key) : null;

  const go = (r: OpsReport) => { setOpen(false); navigate(`/weekly/${r.id}`); };

  return (
    <>
      <span className="flex shrink-0 items-center gap-1.5">
        <Button
          variant="outline" size="icon" className="h-9 w-9"
          disabled={!prev} onClick={() => prev && go(prev)} aria-label="前の週"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          variant="outline" size="icon" className="h-9 w-9"
          disabled={!next} onClick={() => next && go(next)} aria-label="次の週"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </span>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-tap flex min-w-0 items-center gap-2 rounded-control px-1 text-left hover:bg-muted lg:min-h-0"
      >
        <span className="font-number truncate">
          {active ? formatWeekRangeJa(active.period_key) : 'ウィークリー活動報告'}
        </span>
        {rel && (
          <span className="text-badge shrink-0 rounded-badge-xs bg-muted px-2 py-0.5 text-muted-foreground">{rel}</span>
        )}
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      <Sheet open={open} onOpenChange={setOpen} title="対象週の選択" sub={`全${reports.length}週`}>
        <div className="-mx-4 flex flex-col">
          {groupByMonth(reports).map((g) => (
            <div key={g.key} className="flex flex-col">
              <p className="text-th px-4 pb-1 pt-3 text-muted-foreground">{g.label}</p>
              {g.rows.map((r) => {
                const published = r.status === 'published';
                return (
                  <div key={r.id} className="flex items-center gap-1 px-4">
                    <button
                      type="button"
                      onClick={() => go(r)}
                      className={`min-h-tap flex min-w-0 flex-1 items-center justify-between gap-2 py-2.5 text-left ${
                        r.id === activeId ? 'text-primary' : ''
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="text-list font-number block truncate">{formatWeekJa(r.period_key)}</span>
                        <span className="text-sub-sm inline-flex items-center gap-1 text-muted-foreground">
                          {published
                            ? <><CheckCircle2 className="h-3 w-3 text-success" aria-hidden="true" />確定済み</>
                            : <><CircleDashed className="h-3 w-3 text-warning" aria-hidden="true" />下書き</>}
                          {typeof r.item_count !== 'undefined' && (
                            <span className="font-number">・トピックス {r.item_count}件</span>
                          )}
                        </span>
                      </span>
                      {r.id === activeId && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                    </button>
                    {/* **削除は下書きの週だけ**に出す。確定済みはサーバーが断るので
                        押せるボタンを置かない（理由は一覧の下に1行で出す） */}
                    {canEdit && !published && (
                      <Button
                        variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-destructive"
                        onClick={() => onDeleteReport(r)}
                        disabled={deletingId === r.id}
                        aria-label={`${formatWeekJa(r.period_key)}を削除`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {canEdit && (
          <div className="mt-3 flex flex-col gap-2 border-t border-border-subtle pt-3">
            <p className="text-th text-muted-foreground">週を追加</p>
            <WeekAddCalendar
              existing={new Set(reports.map((r) => r.period_key))}
              onCreate={(weekStart) => { setOpen(false); onAddWeek(weekStart); }}
              creating={addingWeek}
            />
            <p className="text-sub-sm text-muted-foreground">
              確定済みの週は、確定を取り消すと削除できます。
            </p>
          </div>
        )}
      </Sheet>
    </>
  );
}
