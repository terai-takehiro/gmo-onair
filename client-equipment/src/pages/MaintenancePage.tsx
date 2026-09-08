/**
 * ④ メンテナンス (v4)
 *
 * 故障・点検・修理の記録です。状態は 報告済 → 対応中 → 完了 で進みます。
 *
 * 変えたのは枠だけで、**送る値と状態の遷移は旧実装のまま**です
 * (状態を「完了」にしたときに `completed_at` を入れるところも同じ)。
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Plus } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { Row, RowHeader, RowMain, RowSlot, RowSub, RowTitle } from '@gmo-onair/shared/src/client/ui/row';
import { MoneyCell } from '@gmo-onair/shared/src/client/ui/money';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { Delayed, EmptyState, ErrorPanel, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { MAINTENANCE_STATUS, MAINTENANCE_TYPE, statusOf } from '@gmo-onair/shared/src/constants/statuses';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { MaintenanceDialog, type MaintenanceForm } from './maintenance/MaintenanceDialog';
import { MaintenanceCards, STATUS_TONE } from './maintenance/MaintenanceCards';
import type { MaintenanceRecord } from './maintenance/types';

const CHIPS = [
  { key: '', label: 'すべて' },
  { key: 'reported', label: '報告済' },
  { key: 'in_progress', label: '対応中' },
  { key: 'completed', label: '完了' },
];

export default function MaintenancePage() {
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const [status, setStatus] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // 修理引取／発送日・修理受取／返送日を編集するダイアログ。PC・スマホ共通
  // （`FormDialog` がスマホでは自動で下シートになる）。列で出し分けると
  // Codexレビュー指摘のとおり 1024〜1535px（lg 未満 2xl）で編集手段が消えるため、
  // 列ではなく行の中の小さいボタンから開く形にした
  //
  // ⚠️ **id だけを持つ（記録そのものは持たない）**（Codexレビュー指摘・P1）。
  // 開いた瞬間の記録を丸ごと持つと、ダイアログを開いたまま裏で別の更新
  // （例: 状態を変える）が成功して `records` が新しくなっても、この状態は
  // 古いまま取り残される。保存すると、その**古い状態がまた書き戻ってしまう**
  // （`update` の PUT は行全体を書き直すため）。id から `records` を引き直せば、
  // 他の更新が invalidate → 再取得したぶんが自動でここにも届く
  const [dateEditId, setDateEditId] = useState<string | null>(null);
  const [dateDraft, setDateDraft] = useState({ repair_sent_at: '', repair_returned_at: '' });

  // 件数をチップに出すので**絞り込み無しで1回引き**、絞り込みは画面で掛ける
  const list = useQuery({
    queryKey: ['maintenance-records'],
    queryFn: async () => (await api.get('/equipment/maintenance')).data.data as MaintenanceRecord[],
  });
  const all = useMemo(() => list.data ?? [], [list.data]);
  const records = useMemo(() => (status ? all.filter((r) => r.status === status) : all), [all, status]);
  // ダイアログの中身は常にここから引く（`all` から — 状態の絞り込みで
  // 対象が絞り込み外に出ても編集を続けられるように `records` ではなく `all` を見る）
  const dateEditTarget = dateEditId ? all.find((r) => r.id === dateEditId) ?? null : null;

  /**
   * 記録を付ける機材の候補。
   *
   * ⚠️ **`include_children=1` を渡す。** 台帳は木で見せるので既定では親だけを
   * 返しますが、**メンテナンスは付属品 (子機材) にも起きます** —
   * カメラセットの中のレンズだけ AF 不良で修理に出す、マイクの中の1本だけ
   * 断線している、は現場で普通に起きることです。渡さないと候補に1本も
   * 出てこないため、**「台帳に入っていない」ように見えて記録が残せません**
   * (親のセットに付けて書くしかなく、どの1本かが分からなくなる)。
   *
   * ⚠️ **鍵は台帳の `['equipment-items-all']` と分ける。** 同じ鍵にすると
   * 機材詳細 (`EquipmentDetailPage`) の「親だけ」の問い合わせと中身を
   * 共有してしまい、**どちらが先に走ったかで候補が変わります**
   * (気づけない壊れ方)。前に置く形にしてあるので、詳細側の
   * `invalidateQueries(['equipment-items-all'])` はこちらにも届きます。
   */
  const { data: allItems } = useQuery({
    queryKey: ['equipment-items-all', 'include-children'],
    queryFn: async () => (await api.get('/equipment/items', {
      params: { include_children: '1' },
    })).data.data as {
      id: string; eq_code: string; name: string; model_number: string | null; unit_number: number | null;
      parent_name?: string | null;
    }[],
    enabled: dialogOpen,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['maintenance-records'] });
    qc.invalidateQueries({ queryKey: ['equipment-stats'] });
    // 故障報告→修理中／完了→稼働中で equipment_items.status も書き換わる
    // (maintenance.service.ts の create/update)。台帳・詳細・貸出候補も古いまま残さない
    qc.invalidateQueries({ queryKey: ['equipment-items'] });
    qc.invalidateQueries({ queryKey: ['equipment-item'] });
    qc.invalidateQueries({ queryKey: ['equipment-lendable'] });
  };

  const create = useMutation({
    mutationFn: (form: MaintenanceForm) => api.post('/equipment/maintenance', {
      ...form,
      repair_cost: form.repair_cost ? Number(form.repair_cost) : null,
      repair_sent_at: form.repair_sent_at || null,
      repair_returned_at: form.repair_returned_at || null,
    }),
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      setSaveError(null);
      notifySuccess('メンテナンスの記録を追加しました');
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      setSaveError(e?.response?.data?.error?.message || e?.message || '保存できませんでした');
    },
  });

  const update = useMutation({
    mutationFn: (r: MaintenanceRecord) => api.put(`/equipment/maintenance/${r.id}`, {
      title: r.title, description: r.description, assigned_to: r.assigned_to,
      vendor_name: r.vendor_name, repair_cost: r.repair_cost, status: r.status, result: r.result,
      started_at: r.started_at,
      // ⚠️ **ここで作り直さない**（Codexレビュー指摘）。以前は `r.status === 'completed'`
      // なら常に `new Date()` を送っていたため、完了済みの記録の日付だけを直しても
      // 完了日時が「いま」に書き換わっていた。「完了に変える」瞬間だけ呼び出し側
      // （`changeStatus`）が明示的に詰める。それ以外はいまの値をそのまま送るだけ
      completed_at: r.completed_at,
      // ⚠️ UPDATE は全列を書き直すので、渡さないと消える（PUT は部分更新ではない）
      repair_sent_at: r.repair_sent_at,
      repair_returned_at: r.repair_returned_at,
    }),
    onSuccess: () => { invalidate(); notifySuccess('状態を変えました'); },
    onError: (e) => notifyApiError('状態を変えられませんでした', e),
  });
  // **押した札だけ回す。** `update.isPending` は1つしか持てないので、
  // どの記録に対する更新かは送った値（`variables`）から拾う
  const savingId = update.isPending ? (update.variables?.id ?? null) : null;

  /** 状態を変える。「完了」への遷移のときだけ完了日時をいまに詰める */
  const changeStatus = (r: MaintenanceRecord, v: string) => update.mutate({
    ...r,
    status: v,
    completed_at: v === 'completed' ? new Date().toISOString() : r.completed_at,
  });

  const openDateEdit = (r: MaintenanceRecord) => {
    setDateEditId(r.id);
    setDateDraft({ repair_sent_at: r.repair_sent_at ?? '', repair_returned_at: r.repair_returned_at ?? '' });
  };
  const saveDateEdit = () => {
    if (!dateEditTarget) return;
    // ⚠️ **成功するまでダイアログを閉じない**（Codexレビュー指摘）。
    // 保存前に閉じると背面の行（状態の `<Select>` を含む）が触れる状態に戻り、
    // PUT が終わる前に状態を変えられると、あとから完了した方が
    // 相手の変更（日付／状態）を古い値で上書きして消してしまう
    // （どちらも「いまの行全体」を書き直す1本の `update` mutation を共有するため）。
    // ダイアログを開いたままにして背面を触れなくすれば、この競合は起きない
    update.mutate(
      {
        ...dateEditTarget,
        repair_sent_at: dateDraft.repair_sent_at || null,
        repair_returned_at: dateDraft.repair_returned_at || null,
      },
      { onSuccess: () => setDateEditId(null) },
    );
  };

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="メンテナンス"
        sub="故障・点検・修理の記録です。報告済 → 対応中 → 完了 で進みます"
        primaryAction={
          <Button onClick={() => { setSaveError(null); setDialogOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />記録を追加
          </Button>
        }
      />

      <FilterChips
        label="状態で絞り込む"
        items={CHIPS.map((c) => ({
          key: c.key,
          label: c.label,
          count: c.key ? all.filter((r) => r.status === c.key).length : all.length,
        }))}
        value={status}
        onChange={setStatus}
      />

      {list.isError ? (
        <ErrorPanel title="メンテナンスの記録を読み込めませんでした" error={list.error} onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <Delayed><SkeletonRows rows={5} /></Delayed>
      ) : records.length === 0 ? (
        <EmptyState
          title={status ? 'この状態の記録はありません' : 'メンテナンスの記録がまだ1件もありません'}
          description="故障・点検・修理が出たら「記録を追加」から入れます。稼働停止中の台数はダッシュボードに出ます。"
        />
      ) : isMobile ? (
        // **PC の行を縮めたものではない。** 業者名・報告日を畳まず出し、
        // 状態変更は Select ではなく下から出るシート（`MaintenanceCards.tsx`）
        <MaintenanceCards
          records={records}
          savingId={savingId}
          onChangeStatus={changeStatus}
          onEditDates={openDateEdit}
        />
      ) : (
        <div className="flex flex-col rounded-card border border-border bg-card">
          <RowHeader className="hidden sm:flex">
            <RowSlot w={72}>種類</RowSlot>
            <RowMain>内容 ／ 機材</RowMain>
            <RowSlot w={96}>業者</RowSlot>
            <RowSlot w={128} align="right">費用</RowSlot>
            <RowSlot w={72}>報告日</RowSlot>
            <RowSlot w={160}>状態</RowSlot>
          </RowHeader>
          {records.map((r) => (
            <Row key={r.id} divider stackOnMobile align="start">
              <RowSlot w={72}>
                <span className="text-sub-sm text-secondary-foreground">
                  {statusOf(MAINTENANCE_TYPE, r.record_type).label}
                </span>
              </RowSlot>
              <RowMain>
                <div className="flex items-center gap-1.5">
                  <RowTitle className="min-w-0 flex-1">{r.title}</RowTitle>
                  {/* ⚠️ **列ではなくボタンにする**（Codexレビュー指摘・2巡目）。
                      固定幅の列を足すと、lg で左メニュー248pxが現れる 1024〜1535px
                      帯で商品名が潰れる（1巡目は `HIDE_UNTIL_EXTRA_WIDE` で
                      2xl まで隠して逃げたが、それだと今度はその帯で
                      入力そのものができなくなる）。`RowMain` の中の小さいボタンなら
                      幅を専有せず、どの画面幅でも押せる。押すとダイアログ
                      （スマホでは自動でシートになる）で編集する */}
                  <button
                    type="button"
                    onClick={() => openDateEdit(r)}
                    aria-label={`${r.title} の修理引取／発送日・修理受取／返送日を編集`}
                    className="v4-tap shrink-0 text-muted-foreground hover:text-primary"
                  >
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
                <RowSub>
                  <span className="font-number text-primary">{r.eq_code}</span> ・ {r.equipment_name}
                  {/* **付属品なら親を添える。** 同じ名前のレンズが何本もあると
                      「どのセットの1本か」が機材名だけでは分からない */}
                  {r.parent_name ? `（${r.parent_name} の付属品）` : ''}
                  {r.description ? ` ／ ${r.description}` : ''}
                  {r.repair_sent_at ? ` ／ 発送${r.repair_sent_at.slice(5, 10).replace('-', '/')}` : ''}
                  {r.repair_returned_at ? ` ／ 返送${r.repair_returned_at.slice(5, 10).replace('-', '/')}` : ''}
                </RowSub>
              </RowMain>
              <RowSlot w={96} hideOnMobile>
                {r.vendor_name && <span className="truncate text-sub-sm text-secondary-foreground">{r.vendor_name}</span>}
              </RowSlot>
              <MoneyCell value={r.repair_cost} width={128} />
              <RowSlot w={72} hideOnMobile>
                <span className="font-number text-sub-sm text-muted-foreground">
                  {r.reported_at?.slice(5, 10).replace('-', '/') ?? ''}
                </span>
              </RowSlot>
              <RowSlot w={160} placeholder="">
                {r.status === 'completed' || r.status === 'cancelled' ? (
                  <TableBadge
                    label={statusOf(MAINTENANCE_STATUS, r.status).label}
                    w={null}
                    className={STATUS_TONE[r.status]}
                  />
                ) : (
                  <Select value={r.status} onValueChange={(v) => changeStatus(r, v)}>
                    <SelectTrigger className="w-full" aria-label={`${r.title} の状態を変える`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reported">報告済</SelectItem>
                      <SelectItem value="in_progress">対応中</SelectItem>
                      <SelectItem value="completed">完了</SelectItem>
                      <SelectItem value="cancelled">中止</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </RowSlot>
            </Row>
          ))}
        </div>
      )}

      <MaintenanceDialog
        open={dialogOpen}
        items={allItems ?? []}
        saving={create.isPending}
        error={saveError}
        onClose={() => setDialogOpen(false)}
        onSubmit={(form) => create.mutate(form)}
      />

      {/* 修理引取／発送日・修理受取／返送日の編集。PC・スマホ共通の1つのダイアログ
          （`FormDialog` がスマホでは自動で下シートになる）。列を専有しないので
          どの画面幅でも常に開ける */}
      {dateEditTarget && (() => {
        // ⚠️ **保存中は閉じられなくする**（Codexレビュー指摘）。Esc・外側クリック・
        // 「キャンセル」で保存前に閉じてしまうと、背面の行の状態 `<Select>` が
        // また触れるようになり、`saveDateEdit` と同じ理由の競合が起きる
        const savingThis = update.isPending && update.variables?.id === dateEditTarget.id;
        return (
          <FormDialog
            open
            onOpenChange={(o) => { if (!o && !savingThis) setDateEditId(null); }}
            title="修理日を編集"
            sub={dateEditTarget.title}
            footer={
              <FormDialogFooter>
                <Button variant="outline" onClick={() => setDateEditId(null)} disabled={savingThis}>キャンセル</Button>
                <Button onClick={saveDateEdit} disabled={savingThis}>保存</Button>
              </FormDialogFooter>
            }
          >
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>修理引取／発送日</Label>
                <Input
                  type="date"
                  value={dateDraft.repair_sent_at}
                  disabled={savingThis}
                  onChange={(e) => setDateDraft((d) => ({ ...d, repair_sent_at: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>修理受取／返送日</Label>
                <Input
                  type="date"
                  value={dateDraft.repair_returned_at}
                  disabled={savingThis}
                  onChange={(e) => setDateDraft((d) => ({ ...d, repair_returned_at: e.target.value }))}
                />
              </div>
            </div>
          </FormDialog>
        );
      })()}
    </div>
  );
}
