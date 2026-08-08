/**
 * ⑥ 休日・営業時間（v4 設定・モックの6枚目）
 *
 * ── 予約を止めない ──────────────────────────────────────────
 *
 * 着手前は**時間の検査が1行も無く**、何時でも予約が作れました。
 * ここで初めて制限をかけることになるので、**一番ゆるい段から始めます**
 * （ご判断）— 注意を出して通し、時間外の印を残してあとから拾えるようにする。
 *
 * ── 既存の予約には触らない ──────────────────────────────────
 *
 * モックの指定どおり。休業日を足しても予約は消えません。代わりに
 * **保存する前に「重なる予約が N 件あります」を出します**（`ClosedDayDialog`）。
 *
 * ── 割増（＋30％・＋50％）の列は持たない ────────────────────
 *
 * モックにはありますが、**何に掛けるかが決まっていない**ので作りません（ご判断）。
 * 決まっていない数字を列にすると、入っている値が正しいと読まれます。
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Pencil, Trash2, Info, Lock, AlertTriangle, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Row, RowHeader, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { EmptyState, Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { DateRange } from '@gmo-onair/shared/src/client/ui/dateRange';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { useAuth } from '@/contexts/platform/AuthContext';
import { ClosedDayDialog } from './ClosedDayDialog';
import {
  WEEKDAYS, WEEK_ORDER, OVER_POLICY, AVAILABILITY, KIND_LABEL, KIND_TONE, TIME_CHOICES, label,
  type DayHours, type ClosedDay, type LocationRow,
} from './hoursTypes';

export default function HoursPage() {
  const qc = useQueryClient();
  const { currentUser } = useAuth();
  const canEdit = currentUser?.role === 'system_admin';

  const [picked, setPicked] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ open: boolean; day: ClosedDay | null }>({ open: false, day: null });
  const [draft, setDraft] = useState<DayHours[] | null>(null);

  const lq = useQuery<LocationRow[]>({
    queryKey: ['business-hours', 'locations'],
    queryFn: async () => (await api.get('/business-hours/locations')).data.data,
  });
  const site = lq.data?.find((l) => l.id === picked) ?? lq.data?.[0] ?? null;

  const sq = useQuery<{ hours: DayHours[]; closed: ClosedDay[] }>({
    queryKey: ['business-hours', site?.id],
    enabled: !!site,
    queryFn: async () => (await api.get(`/business-hours/${site!.id}`)).data.data,
  });

  const hours = draft ?? sq.data?.hours ?? [];
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(sq.data?.hours ?? []);

  const setDay = (weekday: number, patch: Partial<DayHours>) => {
    const base = draft ?? sq.data?.hours ?? [];
    setDraft(base.map((h) => (h.weekday === weekday ? { ...h, ...patch } : h)));
  };

  const saveHours = useMutation({
    mutationFn: async () => api.put(`/business-hours/${site!.id}/hours`, { hours: draft }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['business-hours'] });
      setDraft(null);
      notifySuccess('営業時間を保存しました', {
        description: 'これから作る予約から注意が出ます。すでに入っている予約はそのままです。',
      });
    },
    onError: (e) => notifyApiError('保存できませんでした', e),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/business-hours/closed-days/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['business-hours'] });
      notifySuccess('休業日を消しました');
    },
    onError: (e) => notifyApiError('消せませんでした', e),
  });

  // 祝日は 89 件あるので**畳んでおく**。全部並べると休業日が埋もれる
  const [showHolidays, setShowHolidays] = useState(false);
  const all = sq.data?.closed ?? [];
  const holidays = all.filter((c) => c.kind === 'holiday');
  const others = all.filter((c) => c.kind !== 'holiday');
  const decided = holidays.filter((h) => h.availability !== 'open').length;

  return (
    <div className="flex flex-col gap-3.5 p-3 lg:gap-4 lg:p-6">
      <PageHeader
        title="休日・営業時間"
        sub="カレンダーで予約を入れられる時間のもとになります。ここで閉じた時間は注意が出ますが、予約は止まりません。"
        primaryAction={canEdit && site ? (
          <Button onClick={() => setDialog({ open: true, day: null })}>
            <CalendarPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />休業日を足す
          </Button>
        ) : undefined}
      />

      {!canEdit && (
        <p className="rounded-note text-note flex items-center gap-2 border border-border bg-surface-subtle px-3.5 py-2.5 text-muted-foreground">
          <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
          直せるのは<strong className="font-bold">システム管理者</strong>だけです（拠点・部屋と同じ扱い）。中身は見られます。
        </p>
      )}

      {lq.isError ? (
        <ErrorPanel title="拠点を読み込めませんでした" error={lq.error} onRetry={() => lq.refetch()} />
      ) : (
        <div className="flex flex-col gap-3.5 lg:flex-row lg:items-start">
          {/* 拠点のレール */}
          <div className="rounded-card w-full shrink-0 overflow-hidden border border-border bg-card lg:w-[240px]">
            <p className="text-th border-b border-border-faint px-3.5 py-2.5 text-muted-foreground">拠点</p>
            {lq.isLoading ? (
              <Delayed><SkeletonRows rows={4} /></Delayed>
            ) : (lq.data ?? []).map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => { setPicked(l.id); setDraft(null); }}
                className={cn(
                  'min-h-tap flex w-full items-center gap-2.5 border-b border-border-faint px-3.5 py-2.5 text-left last:border-b-0',
                  site?.id === l.id ? 'bg-primary-surface-weak' : 'bg-card',
                )}
              >
                <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', site?.id === l.id ? 'bg-primary' : 'bg-border')} />
                <span className="min-w-0 flex-1">
                  <span className={cn('text-list block truncate', site?.id === l.id && 'text-primary')}>{l.name}</span>
                  <span className="text-note block truncate text-muted-foreground">
                    部屋 {l.room_count} ・ 休業日 {l.closed_count}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3.5">
            {/* 曜日ごとの営業時間 */}
            <div className="rounded-card overflow-hidden border border-border bg-card">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-faint px-4 py-3">
                <span className="text-cardtitle shrink-0">{site?.name ?? ''} の受付時間</span>
                <span className="text-note min-w-0 flex-1 truncate text-muted-foreground">
                  両方を「休み」にするとその曜日は閉まります
                </span>
                {canEdit && dirty && (
                  <Button size="sm" disabled={saveHours.isPending} onClick={() => saveHours.mutate()}>
                    {saveHours.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                    保存する
                  </Button>
                )}
              </div>

              {sq.isLoading ? (
                <Delayed><SkeletonRows rows={7} /></Delayed>
              ) : hours.length === 0 ? (
                <EmptyState
                  title="受付時間を決めていません"
                  description="決めていない拠点では、いつ予約を入れても注意は出ません（外現場はこの状態が正しい形です）。"
                />
              ) : WEEK_ORDER.map((wd) => {
                const h = hours.find((x) => x.weekday === wd);
                if (!h) return null;
                const closedDay = !h.open_time || !h.close_time;
                const weekend = wd === 0 || wd === 6;
                return (
                  <div key={wd} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-faint px-4 py-2.5 last:border-b-0">
                    <span className={cn(
                      'rounded-note text-note inline-flex h-7 w-7 shrink-0 items-center justify-center font-bold',
                      closedDay ? 'bg-muted text-muted-foreground'
                        : weekend ? 'bg-warning-surface text-warning' : 'bg-primary-surface text-primary',
                    )}>
                      {WEEKDAYS[wd]}
                    </span>

                    {closedDay ? (
                      <span className="text-sub w-[160px] shrink-0 text-muted-foreground">休み</span>
                    ) : (
                      <span className="flex w-[160px] shrink-0 items-center gap-1">
                        <select
                          disabled={!canEdit}
                          className="rounded-control text-sub font-number h-9 border border-border bg-card px-1.5 disabled:opacity-60"
                          value={h.open_time ?? ''}
                          onChange={(e) => setDay(wd, { open_time: e.target.value })}
                        >
                          {TIME_CHOICES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <span className="text-note text-muted-foreground">〜</span>
                        <select
                          disabled={!canEdit}
                          className="rounded-control text-sub font-number h-9 border border-border bg-card px-1.5 disabled:opacity-60"
                          value={h.close_time ?? ''}
                          onChange={(e) => setDay(wd, { close_time: e.target.value })}
                        >
                          {TIME_CHOICES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </span>
                    )}

                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => setDay(wd, closedDay
                          ? { open_time: '10:00', close_time: '18:00' }
                          : { open_time: null, close_time: null })}
                        className="text-note min-h-tap rounded-note shrink-0 border border-border bg-card px-2.5 font-bold text-muted-foreground lg:min-h-[32px]"
                      >
                        {closedDay ? '開ける' : '休みにする'}
                      </button>
                    )}

                    <span className="flex shrink-0 gap-1">
                      {OVER_POLICY.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          disabled={!canEdit}
                          onClick={() => setDay(wd, { over_policy: o.value })}
                          className={cn(
                            'text-note min-h-tap rounded-note border px-2.5 font-bold lg:min-h-[32px]',
                            h.over_policy === o.value
                              ? `border-transparent ${o.tone}`
                              : 'border-border bg-card text-muted-foreground',
                            !canEdit && 'opacity-60',
                          )}
                        >
                          {o.label}
                        </button>
                      ))}
                    </span>

                    <span className="text-note min-w-0 flex-1 truncate text-muted-foreground">{h.note ?? ''}</span>
                  </div>
                );
              })}

              <p className="text-note border-t border-border-faint bg-surface-subtle px-4 py-3 text-muted-foreground">
                「受け付けない」を選んでも<strong className="font-bold">保存は止まりません</strong>。
                注意の強さが変わるだけで、当日いま入れたい予約は入ります
                （時間外の予約には印が残るので、あとから一覧で拾えます）。
              </p>
            </div>

            {/* 休業日 */}
            <div className="rounded-card overflow-hidden border border-border bg-card">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-faint px-4 py-3">
                <span className="text-cardtitle shrink-0">休業日</span>
                <span className="text-note min-w-0 flex-1 truncate text-muted-foreground">
                  全社の休みと、この拠点だけの休み
                </span>
              </div>

              {others.length === 0 ? (
                <EmptyState title="休業日はありません" description="年末年始や設備点検を入れておくと、その期間の予約に注意が出ます。" />
              ) : (
                <>
                  <RowHeader>
                    <RowMain>期間</RowMain>
                    <RowSlot w={200}>名前</RowSlot>
                    <RowSlot w={72}>種類</RowSlot>
                    <RowSlot w={128}>受付</RowSlot>
                    {canEdit && <RowSlot w={96} align="right"> </RowSlot>}
                  </RowHeader>
                  {others.map((c) => (
                    <Row key={c.id} density="table" divider stackOnMobile>
                      <RowMain>
                        <DateRange start={c.from_date} end={c.to_date} short className="text-list block" />
                        <span className="text-note block text-muted-foreground">
                          {c.location_id ? site?.name : '全拠点'}
                        </span>
                      </RowMain>
                      <RowSlot w={200}><span className="text-sub truncate">{c.name}</span></RowSlot>
                      <RowSlot w={72}>
                        <span className={cn('rounded-note text-note px-2 py-0.5 font-bold', KIND_TONE[c.kind])}>
                          {KIND_LABEL[c.kind]}
                        </span>
                      </RowSlot>
                      <RowSlot w={128}>
                        <span className={cn('rounded-note text-note px-2 py-0.5 font-bold', label(AVAILABILITY, c.availability).tone)}>
                          {label(AVAILABILITY, c.availability).label}
                        </span>
                      </RowSlot>
                      {canEdit && (
                        <RowSlot w={96} align="right">
                          <div className="flex gap-0.5">
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="直す"
                              onClick={() => setDialog({ open: true, day: c })}>
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="消す"
                              onClick={() => confirmAction({
                                title: `${c.name} を消しますか`,
                                description: 'この期間の予約は消えません（もともと消していません）。注意が出なくなるだけです。',
                                confirmLabel: '消す', tone: 'danger',
                              }).then((ok) => ok && del.mutate(c.id))}>
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </div>
                        </RowSlot>
                      )}
                    </Row>
                  ))}
                </>
              )}
            </div>

            {/* 祝日 */}
            <div className="rounded-card overflow-hidden border border-border bg-card">
              <button
                type="button"
                onClick={() => setShowHolidays((v) => !v)}
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-left"
              >
                <span className="text-cardtitle shrink-0">祝日</span>
                <span className="text-note min-w-0 flex-1 text-muted-foreground">
                  2026〜2030 の {holidays.length} 件。
                  {decided > 0
                    ? `うち ${decided} 件を「休む」にしています`
                    : '初期値はすべて「営業する」で、注意は出ません'}
                </span>
                <span className="text-note shrink-0 text-primary">{showHolidays ? '閉じる' : '開く'}</span>
              </button>

              {showHolidays && (
                <>
                  <p className="text-note flex items-start gap-2 border-t border-info-border bg-info-surface px-4 py-3 text-secondary-foreground">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
                    <span>
                      放送・制作は祝日こそ稼働することがあるので、<strong className="font-bold">初期値は「営業する」</strong>にしてあります。
                      休む祝日だけ「受け付けない」に変えてください。
                      <strong className="font-bold">春分の日・秋分の日は予測です</strong>（政府が前年2月に公示するまで確定しません）。
                    </span>
                  </p>
                  <div className="max-h-96 overflow-y-auto">
                    {holidays.map((c) => (
                      <Row key={c.id} density="table" divider stackOnMobile>
                        <RowMain>
                          <DateRange start={c.from_date} end={c.to_date} className="text-list block" />
                        </RowMain>
                        <RowSlot w={200}>
                          <span className="text-sub flex items-center gap-1.5 truncate">
                            {c.name}
                            {c.estimated && (
                              <span className="text-note inline-flex items-center gap-0.5 text-warning" title="政府の公示まで確定しません">
                                <AlertTriangle className="h-3 w-3" aria-hidden="true" />予測
                              </span>
                            )}
                          </span>
                        </RowSlot>
                        <RowSlot w={128}>
                          <span className={cn('rounded-note text-note px-2 py-0.5 font-bold', label(AVAILABILITY, c.availability).tone)}>
                            {label(AVAILABILITY, c.availability).label}
                          </span>
                        </RowSlot>
                        {canEdit && (
                          <RowSlot w={96} align="right">
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="直す"
                              onClick={() => setDialog({ open: true, day: c })}>
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </RowSlot>
                        )}
                      </Row>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {site && (
        <ClosedDayDialog
          day={dialog.day}
          locationId={site.id}
          locationName={site.name}
          open={dialog.open}
          onOpenChange={(v) => setDialog((s) => ({ ...s, open: v }))}
        />
      )}
    </div>
  );
}
