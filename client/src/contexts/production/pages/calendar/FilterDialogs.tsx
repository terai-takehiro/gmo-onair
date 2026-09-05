/**
 * ① 予定 / 「部屋で絞る」「人で絞る」
 *
 * ── 絞ると何が消えるかを先に書く（モックの指定）──────────────
 *
 * 部屋で絞ると、**部屋を持たない自分・パートナーの予定は出なくなります**。
 * 人で絞ると、**人を持たないスタジオ予約が出なくなります**。
 * どちらも「消えた＝壊れた」と読まれるので、押す前にダイアログへ書きます。
 */
import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { Delayed, SkeletonRows, EmptyState } from '@gmo-onair/shared/src/client/states';
import { cn } from '@gmo-onair/shared/src/client/utils';
import type { CalLayer } from './calendarLayout';
import { MY_SOURCE_LEGEND } from './useCalendarEvents';
import { TASK_DEADLINE_COLOR } from './taskLayer';

interface LocationRow {
  id: string;
  name: string;
  rooms?: Array<{ id: string; name: string; color?: string | null }>;
}
interface UserRow { id: string; name: string }

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-note text-note flex items-start gap-2 border border-info-border bg-info-surface px-3 py-2.5 text-secondary-foreground">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

function Chip({ on, label, dot, onClick }: { on: boolean; label: string; dot?: string | null; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        'min-h-tap text-note inline-flex items-center gap-1.5 rounded-note border px-2.5 font-bold lg:min-h-[32px]',
        on ? 'border-primary bg-primary-surface text-primary' : 'border-border bg-card text-muted-foreground',
      )}
    >
      {dot && <span className="h-2.5 w-2.5 shrink-0 rounded-chip" style={{ backgroundColor: dot }} />}
      {label}
    </button>
  );
}

export function RoomFilterDialog({
  open, onOpenChange, value, onChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const q = useQuery({
    queryKey: ['studio-locations'],
    queryFn: async () => (await api.get('/studios/locations')).data.data as LocationRow[],
    staleTime: 5 * 60_000,
    enabled: open,
  });

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="部屋で絞る"
      sub="選んだ部屋を押さえている予約だけを出します。"
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={() => onChange([])} disabled={value.length === 0}>すべて出す</Button>
          <Button onClick={() => onOpenChange(false)}>閉じる</Button>
        </FormDialogFooter>
      }
    >
        <Note>
          自分・パートナーの予定は<strong className="font-bold">部屋を持たない</strong>ので、
          絞ると出なくなります。部屋の埋まり方だけを見たいときにお使いください。
        </Note>

        {q.isLoading && <Delayed><SkeletonRows rows={4} /></Delayed>}
        {q.data?.length === 0 && <EmptyState title="部屋がありません" description="設定 → 拠点・部屋から入れてください。" />}

        {q.data?.map((loc) => (
          <div key={loc.id} className="flex flex-col gap-1.5">
            <p className="text-th text-muted-foreground">{loc.name}</p>
            <div className="flex flex-wrap gap-1">
              {(loc.rooms ?? []).map((r) => (
                <Chip key={r.id} on={value.includes(r.id)} label={r.name} dot={r.color} onClick={() => toggle(r.id)} />
              ))}
              {(loc.rooms ?? []).length === 0 && (
                <span className="text-note text-muted-foreground">この拠点にはまだ部屋がありません。</span>
              )}
            </div>
          </div>
        ))}
    </FormDialog>
  );
}

export function UserFilterDialog({
  open, onOpenChange, value, onChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  // ⚠️ `partner_schedule` は旧モジュール名（権限モデル単純化で `sales` に統合済み・
  // migration 210）。この文字列のままだと system_admin 以外が誰も返らず、
  // 「人で絞る」で普通のパートナーを選べない（Codex レビューで指摘・#564）。
  // 鍵も他画面と同じ `users-by-module-sales` に揃える（`PartnerScheduleDialog.tsx` と
  // 同じ理由 — 違う鍵のままだと `PersonalEventDialog.tsx` の旧鍵と別物になるだけで
  // 実害は無いが、そろえておけばキャッシュも共有できる）
  const q = useQuery({
    queryKey: ['users-by-module-sales'],
    queryFn: async () => (await api.get('/users/by-module/sales')).data.data as UserRow[],
    staleTime: 5 * 60_000,
    enabled: open,
  });

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="人で絞る"
      sub="パートナーの予定を人で絞ります。アサインの空きを見るときに使います。"
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={() => onChange([])} disabled={value.length === 0}>全員出す</Button>
          <Button onClick={() => onOpenChange(false)}>閉じる</Button>
        </FormDialogFooter>
      }
    >
        <Note>
          スタジオの予約は<strong className="font-bold">人を持たない</strong>ので、絞ると出なくなります。
          自分の予定も出しません（人ごとの空きが読めなくなるため）。
        </Note>

        {q.isLoading && <Delayed><SkeletonRows rows={4} /></Delayed>}
        {q.data?.length === 0 && <EmptyState title="対象の人がいません" description="設定 → 権限とメンバーで「予定」の権限を付けてください。" />}

        <div className="flex flex-wrap gap-1">
          {q.data?.map((u) => (
            <Chip key={u.id} on={value.includes(u.id)} label={u.name} onClick={() => toggle(u.id)} />
          ))}
        </div>
    </FormDialog>
  );
}

const LAYER_ITEMS: Array<{ key: CalLayer; label: string; dot: string }> = [
  { key: 'studio', label: 'スタジオの予約', dot: '#dc2626' },
  { key: 'partner', label: 'パートナーの予定', dot: '#8b5cf6' },
  { key: 'my', label: '自分の予定', dot: '#2563eb' },
  // 4層目（根源整理 §3-5）。dailyops 権限が無い人には `visible` が行ごと隠す
  { key: 'tasks', label: 'タスクの期限', dot: TASK_DEADLINE_COLOR },
];

/**
 * ① 予定・スマホ / 「出すもの」を選ぶ
 *
 * PC 版の `CalToolbar` は帯の中にチップを並べる余白があるが、スマホは
 * 幅が無いのでダイアログに畳む（月表アイコン行の「レイヤー」ボタンから開く）。
 * 出し分けの対象は `layerPrefs.ts` の4層のみで、部屋・人の絞り込みは持たない。
 */
export function LayerFilterDialog({
  open, onOpenChange, value, onChange, visible,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: Record<CalLayer, boolean>;
  onChange: (v: Record<CalLayer, boolean>) => void;
  /** その層を読む権限がある人にだけ行を出す（PC の `CalSidebarExtras` と同じ約束）。省略時は全部出す */
  visible?: Record<CalLayer, boolean>;
}) {
  const toggle = (k: CalLayer) => onChange({ ...value, [k]: !value[k] });
  const items = visible ? LAYER_ITEMS.filter((it) => visible[it.key]) : LAYER_ITEMS;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="出すものを選ぶ"
      sub="カレンダーに重ねるもの（予約・予定・タスクの期限）を、出す/隠すで選びます。"
      footer={
        <FormDialogFooter>
          <Button onClick={() => onOpenChange(false)}>閉じる</Button>
        </FormDialogFooter>
      }
    >
        <div className="flex flex-col gap-1">
          {items.map((it) => {
            const on = value[it.key];
            return (
              <div key={it.key} className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => toggle(it.key)}
                  aria-pressed={on}
                  className={cn(
                    'min-h-tap text-list flex items-center gap-2.5 rounded-note border px-3 font-bold',
                    on ? 'border-primary bg-primary-surface text-primary' : 'border-border bg-card text-secondary-foreground',
                  )}
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-chip"
                    style={{ backgroundColor: on ? it.dot : 'rgb(var(--border-disabled))' }}
                  />
                  {it.label}
                  <span className="flex-1" />
                  <span className={cn('text-note', on ? 'text-primary' : 'text-muted-foreground')}>{on ? '出す' : '隠す'}</span>
                </button>
                {/* **旧マイカレンダーの色分けをここへ吸収した。** 「自分の予定」を出しているときだけ添える */}
                {it.key === 'my' && on && (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 pb-1">
                    {MY_SOURCE_LEGEND.map((s) => (
                      <span key={s.key} className="flex items-center gap-1.5">
                        <span className="h-2 w-2 shrink-0 rounded-chip" style={{ backgroundColor: s.dot }} />
                        <span className="text-note text-muted-foreground">{s.label}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
    </FormDialog>
  );
}
