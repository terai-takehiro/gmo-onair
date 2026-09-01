/**
 * 見積タブの「請求まとめ」区画（レギュラー案件専用・v4・積み残し3/4）
 *
 * ── なぜ要るか ─────────────────────────────────────────────
 *
 * `invoice-groups.routes.ts` に請求グループの CRUD・自動生成API
 * （auto-by-recording-date・auto-monthly-close・lump-sum）が既にあるが、
 * **これを呼ぶ画面が1つも無かった**（regular-series.md §10「作る順番」の7番目・
 * 積み残し3/4）。案件の `billing_cycle`（migration 262・§3の4つの取り決めの1つ）が
 * 決まっている以上、その取り決めどおりに請求グループを作る道が画面に要る。
 *
 * ── 出すのは `recurrence === 'regular'` の案件だけ ────────────
 *
 * 単発案件は「案件 = 1回」で、既存の `revenues` を直接見れば足りる
 * （§1「レギュラーではないもの」）。`billing_cycle` は単発案件では
 * 使わない値（migration 262 のコメント）なので、**その2つが揃わない限り
 * この区画自体を出さない**。
 *
 * ── 3つの請求サイクルはボタンを出し分けるだけ ─────────────────
 *
 * 原子は回（`revenues.episode_id`）で、まとめ方だけが3通り（§6）。
 * ここは「まとめる」を押すだけの薄い口で、金額そのものの登録・修正は
 * 財務の台帳（`/budget/revenues`）に任せる（`RevenueBillingPane.tsx` と同じ
 * 「読むだけ＋実行ボタンだけ足す」という立て付け）。
 *
 * ── 契約一括だけ「金額を持つ」例外（migration 265） ───────────
 *
 * 契約一括は「案件に1枚。回には金額を持たせない」（§6）ので、この請求グループ
 * だけ `lump_sum_amount` を自分で持つ。冪等性（同じ案件で二度押しても2枚に
 * ならない）はサーバー側（`lump_sum_amount IS NOT NULL` を目印にする）で
 * 担保している——ここは「既にあれば入力欄に今の金額を出す」だけでよい。
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input as TextInput } from '@/components/ui/input';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { CurrencyInput } from '@gmo-onair/shared/src/client/ui/currency-input';
import { Row, RowHeader, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { EmptyState, Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifySuccess, notifyInfo, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { FormDialog, FormDialogFooter, formGrid2 } from '@gmo-onair/shared/src/client-v4/formDialog';
import { cn } from '@gmo-onair/shared/src/client/utils';
import type { ProjectDetail } from './types';

type BillingCycle = NonNullable<ProjectDetail['billing_cycle']>;

interface InvoiceGroup {
  id: string;
  title: string;
  status: 'draft' | 'sent' | 'paid';
  invoice_date: string | null;
  episode_count: number;
  total_amount: number;
  /** migration 265。契約一括のグループだけ入っている（サーバー側の目印でもある） */
  lump_sum_amount: number | null;
}

const STATUS_LABEL: Record<InvoiceGroup['status'], string> = {
  draft: '下書き', sent: '送付済み', paid: '入金済み',
};
const STATUS_TONE: Record<InvoiceGroup['status'], string> = {
  draft: 'border-transparent bg-muted text-muted-foreground',
  sent: 'border-transparent bg-primary-surface text-primary',
  paid: 'border-transparent bg-success-surface text-success',
};
const CYCLE_LABEL: Record<BillingCycle, string> = {
  monthly_close: '月末締め',
  per_recording_date: '収録日ごと',
  contract_lump_sum: '契約一括',
};

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 月末締め（`monthly_close`）: 対象月を選ぶだけのダイアログ */
function MonthlyCloseDialog({
  open, onOpenChange, onSubmit, saving,
}: { open: boolean; onOpenChange: (v: boolean) => void; onSubmit: (month: string) => void; saving: boolean }) {
  const [month, setMonth] = useState(currentMonth());
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="月末締めで請求グループを作る"
      sub="対象月に「完了」（その回のタスクが全部終わった状態）に達した回を1枚にまとめます。すでに他の請求グループに入っている回は対象になりません。"
      onSubmit={(e) => { e.preventDefault(); onSubmit(month); }}
      footer={(
        <FormDialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
          <Button type="submit" disabled={saving}>{saving ? '作成中…' : 'この月でまとめる'}</Button>
        </FormDialogFooter>
      )}
    >
      <label className="text-sub mb-1 block text-muted-foreground" htmlFor="invoice-monthly-close-month">対象月</label>
      <TextInput id="invoice-monthly-close-month" type="month" required value={month} onChange={(e) => setMonth(e.target.value)} />
    </FormDialog>
  );
}

/** 契約一括（`contract_lump_sum`）: 金額を入力するダイアログ。既にあれば今の値を出す */
function LumpSumDialog({
  open, onOpenChange, onSubmit, saving, initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (payload: { title?: string; invoice_date?: string; amount: number }) => void;
  saving: boolean;
  initial: InvoiceGroup | null;
}) {
  const [title, setTitle] = useState(initial?.title ?? '契約一括');
  const [invoiceDate, setInvoiceDate] = useState(initial?.invoice_date ?? '');
  const [amount, setAmount] = useState<number>(initial?.lump_sum_amount ?? 0);
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? '契約一括の金額を直す' : '契約一括の請求グループを作る'}
      sub="案件に1枚だけ作ります。回には金額を持たせません（回ごとの請求書は出しません）。"
      onSubmit={(e) => { e.preventDefault(); onSubmit({ title: title || undefined, invoice_date: invoiceDate || undefined, amount }); }}
      footer={(
        <FormDialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
          <Button type="submit" disabled={saving}>{saving ? '保存中…' : '保存する'}</Button>
        </FormDialogFooter>
      )}
    >
      <div className="flex flex-col gap-3">
        <div>
          <label className="text-sub mb-1 block text-muted-foreground" htmlFor="invoice-lump-sum-title">タイトル</label>
          <TextInput id="invoice-lump-sum-title" value={title} placeholder="契約一括" onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className={formGrid2}>
          <div>
            <label className="text-sub mb-1 block text-muted-foreground" htmlFor="invoice-lump-sum-date">請求日（任意）</label>
            <TextInput id="invoice-lump-sum-date" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </div>
          <div>
            <label className="text-sub mb-1 block text-muted-foreground" htmlFor="invoice-lump-sum-amount">金額</label>
            <CurrencyInput id="invoice-lump-sum-amount" value={amount} onChange={setAmount} />
          </div>
        </div>
      </div>
    </FormDialog>
  );
}

/**
 * 案件詳細・見積タブに出す「請求まとめ」区画。
 * `project.recurrence === 'regular'` かつ `billing_cycle` が決まっているときだけ描く
 * （呼び出す側で判定してもよいが、判定を1か所にするためここで持つ）。
 */
export function InvoiceGroupsSection({ project, mobile }: { project: ProjectDetail; mobile?: boolean }) {
  const cycle = project.billing_cycle;
  const enabled = project.recurrence === 'regular' && !!cycle;
  const qc = useQueryClient();
  const [monthlyOpen, setMonthlyOpen] = useState(false);
  const [lumpOpen, setLumpOpen] = useState(false);
  const base = `/projects/${project.id}/invoice-groups`;
  const queryKey = ['invoice-groups', project.id];

  const list = useQuery<{ data: InvoiceGroup[] }>({
    queryKey,
    queryFn: async () => (await api.get(base, { params: { limit: 50 } })).data,
    enabled,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey });

  const monthlyClose = useMutation({
    mutationFn: (month: string) => api.post(`${base}/auto-monthly-close`, { month }),
    onSuccess: (r) => {
      invalidate();
      setMonthlyOpen(false);
      const message = r.data?.message ?? '実行しました';
      if (r.data?.data) notifySuccess(message); else notifyInfo(message);
    },
    onError: (e) => notifyApiError('月末締めの請求グループを作れませんでした', e),
  });

  const byRecordingDate = useMutation({
    mutationFn: () => api.post(`${base}/auto-by-recording-date`),
    onSuccess: (r) => {
      invalidate();
      const created = Array.isArray(r.data?.data) ? r.data.data.length : 0;
      const message = r.data?.message ?? `${created}件の請求グループを作成しました`;
      if (created > 0) notifySuccess(message); else notifyInfo(message);
    },
    onError: (e) => notifyApiError('収録日ごとの請求グループを作れませんでした', e),
  });

  const lumpSum = useMutation({
    mutationFn: (payload: { title?: string; invoice_date?: string; amount: number }) => api.post(`${base}/lump-sum`, payload),
    onSuccess: (r) => {
      invalidate();
      setLumpOpen(false);
      notifySuccess(r.data?.message ?? '契約一括の請求グループを保存しました');
    },
    onError: (e) => notifyApiError('契約一括の請求グループを保存できませんでした', e),
  });

  // ⚠️ **単発案件・請求サイクル未設定では出さない**（上の注意書き）。
  // フックはここまで必ず呼び終えている（`useIsMobile()` と同じ「早期returnしない」原則）
  if (!enabled || !cycle) return null;

  const rows = list.data?.data ?? [];
  // 契約一括の請求グループは `lump_sum_amount IS NOT NULL` が目印（サーバー側の冪等判定と同じ）
  const existingLump = rows.find((r) => r.lump_sum_amount != null) ?? null;

  return (
    <div className="overflow-hidden rounded-card border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3">
        <div>
          <p className="text-cardtitle">請求まとめ</p>
          <p className="text-sub text-muted-foreground">請求サイクル: {CYCLE_LABEL[cycle]}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {cycle === 'monthly_close' && (
            <Button size="sm" onClick={() => setMonthlyOpen(true)}>対象月で締める</Button>
          )}
          {cycle === 'per_recording_date' && (
            <Button size="sm" onClick={() => byRecordingDate.mutate()} disabled={byRecordingDate.isPending}>
              {byRecordingDate.isPending ? '作成中…' : '収録日ごとにまとめる'}
            </Button>
          )}
          {cycle === 'contract_lump_sum' && (
            /* 一覧が返るまで押させない。読み込み中は `existingLump` が必ず null なので、
               既存の契約一括があっても「作る」の顔で開き、保存済みの金額を 0 で上書きしうる */
            <Button size="sm" onClick={() => setLumpOpen(true)} disabled={list.isLoading}>
              {existingLump ? '金額を直す' : '金額を入力して作る'}
            </Button>
          )}
        </div>
      </div>

      {list.isLoading ? (
        <Delayed><SkeletonRows rows={2} /></Delayed>
      ) : rows.length === 0 ? (
        <EmptyState title="請求グループはまだありません" description="右上のボタンから作成できます。" />
      ) : mobile ? (
        <div className="flex flex-col">
          {rows.map((g) => (
            <div key={g.id} className="flex flex-col gap-2 border-b border-border-faint p-3.5 last:border-b-0">
              <div className="flex items-start gap-2">
                <span className="min-w-0 flex-1">
                  <span className="text-list block truncate font-bold">{g.title}</span>
                  <span className="text-sub-sm text-muted-foreground">{g.episode_count}回</span>
                </span>
                <TableBadge w={null} label={STATUS_LABEL[g.status]} className={cn('shrink-0', STATUS_TONE[g.status])} />
              </div>
              <Money value={g.total_amount} className="text-list font-bold" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <RowHeader className="hidden sm:flex">
            <RowMain>タイトル</RowMain>
            <RowSlot w={72}>回数</RowSlot>
            <RowSlot w={128} align="right">合計金額</RowSlot>
            <RowSlot w={96}>状態</RowSlot>
          </RowHeader>
          {rows.map((g) => (
            <Row key={g.id} divider stackOnMobile align="center">
              <RowMain><span className="text-list block truncate">{g.title}</span></RowMain>
              <RowSlot w={72}><span className="text-sub font-number">{g.episode_count}</span></RowSlot>
              <Money value={g.total_amount} className="text-sub w-32 shrink-0" />
              <TableBadge w={96} label={STATUS_LABEL[g.status]} className={STATUS_TONE[g.status]} />
            </Row>
          ))}
        </>
      )}

      {monthlyOpen && (
        <MonthlyCloseDialog
          open={monthlyOpen}
          onOpenChange={setMonthlyOpen}
          onSubmit={(month) => monthlyClose.mutate(month)}
          saving={monthlyClose.isPending}
        />
      )}
      {lumpOpen && (
        <LumpSumDialog
          // 開いたまま対象が変わっても useState の初期値に固定されないよう作り直す
          key={existingLump?.id ?? 'new'}
          open={lumpOpen}
          onOpenChange={setLumpOpen}
          onSubmit={(payload) => lumpSum.mutate(payload)}
          saving={lumpSum.isPending}
          initial={existingLump}
        />
      )}
    </div>
  );
}
