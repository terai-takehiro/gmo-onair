/**
 * ⑧ 設定 ／ 貸出の決めごと — 6つのスイッチ (v4・モックどおり・migration 168)
 *
 * ── 保存先は キー×値 の1つの表 ─────────────────────────────
 *
 * `equipment_settings`。**決めごとが増えるたびに列を足す形にしていません** —
 * 足すたびにマイグレーションが要り、増やすのが億劫になって
 * 「画面に嘘のスイッチが並ぶ」ことになります（実際そうなっていました）。
 *
 * ── 押した瞬間に保存します ──────────────────────────────────
 *
 * 「保存」ボタンは置きません。6つしかなく、どれも独立していて、
 * 押し間違えてもすぐ戻せるためです。**押したのに保存されていない**、が
 * この手の画面でいちばん困る壊れ方なので、押す = 保存にします。
 *
 * ── 権限が無い人には押せない形で出す ────────────────────────
 *
 * 書き込みは `owner`（貸出のルールは運用の根っこ）。列ごと隠すと
 * 「いまどう決まっているか」すら読めなくなるので、値は出して押せなくします。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Switch } from '@gmo-onair/shared/src/client/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';

type Settings = Record<string, string>;

/** 選ぶ形の決めごと。**値はサーバーの `RENTAL_RULES` と同じ集合**にすること */
const CHOICES: { key: string; label: string; hint: string; options: { v: string; label: string }[] }[] = [
  {
    key: 'default_due_days',
    label: '返却予定日の初期値',
    hint: '返却予定日を空のまま貸出を登録すると、この日数だけ先の日付が入ります',
    options: [{ v: '3', label: '3日後' }, { v: '7', label: '7日後' }, { v: '14', label: '14日後' }],
  },
  {
    key: 'overdue_notify',
    label: '遅延を知らせるタイミング',
    // ⚠️ まだ配線されていない（嘘のスイッチにしない — 効かないことを画面に書く）
    hint: '準備中 — いまはまだ効きません。返却予定日から数えて、いつ「返却期限超過」に出すか',
    options: [{ v: 'same', label: '当日' }, { v: 'next', label: '翌日' }, { v: 'after3', label: '3日後' }],
  },
];

/** 入切の決めごと。⚠️ 「準備中」の3つはまだ配線されていない — 効かないことを画面に書く */
const TOGGLES: { key: string; label: string; hint: string }[] = [
  { key: 'allow_external', label: '社外への貸出を許可する', hint: '準備中 — いまはまだ効きません。切にすると社外の会社を選べなくなる予定です' },
  { key: 'external_approval', label: '社外貸出に承認を必要とする', hint: '準備中 — いまはまだ効きません。入にすると承認されるまで持ち出せなくなる予定です' },
  { key: 'qr_lend_return', label: 'QRスキャンから貸出・返却を記録する', hint: '準備中 — いまはまだ効きません。切にすると QR は機材を探すだけになる予定です' },
  { key: 'block_broken_lending', label: '修理中・引退の機材を貸し出せないようにする', hint: '入にすると、その状態の機材は貸出を登録できなくなります' },
];

export function RentalRulesPanel() {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  // サーバーは `owner` を要求するが、段位表では owner と manager が同じ 3。
  // `owner` で判定すると manager に押せない印が出るのに押せば通り、食い違う
  const canEdit = hasPermission('equipment', 'manager');

  const q = useQuery({
    queryKey: ['equipment-settings'],
    queryFn: async () => (await api.get('/equipment/settings')).data.data as Settings,
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api.put(`/equipment/settings/${key}`, { value }),
    // **押した瞬間に画面を変える。** 往復を待つと「押しても動かない」に見える
    onMutate: async ({ key, value }) => {
      await qc.cancelQueries({ queryKey: ['equipment-settings'] });
      const prev = qc.getQueryData<Settings>(['equipment-settings']);
      qc.setQueryData<Settings>(['equipment-settings'], (old) => ({ ...(old ?? {}), [key]: value }));
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['equipment-settings'], ctx.prev);
      notifyApiError('決めごとを変えられませんでした', err, '機材管理の管理者権限が要ります');
    },
    onSuccess: () => notifySuccess('決めごとを変えました'),
    onSettled: () => qc.invalidateQueries({ queryKey: ['equipment-settings'] }),
  });

  if (q.isError) {
    return <ErrorPanel title="決めごとを読み込めませんでした" error={q.error} onRetry={() => q.refetch()} />;
  }
  if (q.isLoading) return <Delayed><SkeletonRows rows={6} /></Delayed>;

  const s = q.data ?? {};

  return (
    <section className="rounded-card border border-border bg-card">
      <div className="border-b border-border-subtle px-4 py-3">
        <h3 className="text-cardtitle">貸出の決めごと</h3>
        <p className="text-note text-muted-foreground">
          押すとその場で保存します（保存ボタンはありません）。
          {!canEdit && <strong className="font-bold"> 変えるには機材管理の管理者権限が要ります。</strong>}
        </p>
      </div>

      {CHOICES.map((c) => (
        <div key={c.key} className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="text-list block">{c.label}</span>
            <span className="text-sub-sm block text-muted-foreground">{c.hint}</span>
          </span>
          <Select
            value={s[c.key] ?? c.options[0].v}
            onValueChange={(v) => save.mutate({ key: c.key, value: v })}
            disabled={!canEdit || save.isPending}
          >
            <SelectTrigger className="w-32" aria-label={c.label}><SelectValue /></SelectTrigger>
            <SelectContent>
              {c.options.map((o) => <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ))}

      {TOGGLES.map((t) => (
        <div key={t.key} className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0">
          <span className="min-w-0 flex-1">
            <span className="text-list block">{t.label}</span>
            <span className="text-sub-sm block text-muted-foreground">{t.hint}</span>
          </span>
          <Switch
            checked={s[t.key] === 'true'}
            onCheckedChange={(v) => save.mutate({ key: t.key, value: v ? 'true' : 'false' })}
            disabled={!canEdit || save.isPending}
            aria-label={t.label}
          />
        </div>
      ))}
    </section>
  );
}
