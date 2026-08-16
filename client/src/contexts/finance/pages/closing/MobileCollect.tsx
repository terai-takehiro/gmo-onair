/**
 * ⑫ 入金の確認（スマホ・モックの端末枠 12枚目）
 *
 * ── 「お金はスマホに置かない」のに、この画面はある ──────────
 *
 * モックの「スマホに置かないもの」には **お金（表が横に伸びる）** が挙がっています。
 * それでも ⑫ 入金の確認だけは端末枠が描かれています。
 * 置かないのは**台帳の表**で、**片づく1つの仕事**は置く、という切り分けです。
 *
 * だからここでやれるのは **「入金があったことを記録する」1つだけ**。
 * 請求書を出す・検収を記録するは PC の締め画面に置いたままにします
 * （そちらは月ぶんをまとめて処理する作業で、選ぶ対象が多い）。
 *
 * ── 期日を過ぎたものから ────────────────────────────────────
 *
 * 並びは**支払期日の近い順**で、過ぎたものが先頭に来ます。
 * 入金の確認は「遅れているものを拾う」ためにやるので、
 * 期日順でないと毎回スクロールして探すことになります。
 *
 * ── 取り消しはここに置かない ────────────────────────────────
 *
 * 押し間違いを戻すのは経理の訂正で、記録が残る場所（PC の見積・請求）で
 * やるべきです。**スマホで戻せると、誰がいつ戻したのか分からなくなります。**
 */
import { useMemo, useState } from 'react';
import { GroupTag, groupNote } from '@/contexts/shared/components/GroupTag';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wallet, Info, Check } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { EmptyState, Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { Sheet } from '@gmo-onair/shared/src/client-v4/sheet';
import { dueLabel } from '@gmo-onair/shared/src/client-v4/mobile';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { localDateStr } from '@/lib/format';
import type { BillingInvoice } from '@/contexts/sales/pages/billing/types';

/**
 * **行の形は ⑤ 見積・請求（PC）と同じ `BillingInvoice`。**
 * ここで書き写すと、サーバーが列を変えたときに片方だけ古くなります
 * （実際に最初 `payment_due` と書いていて、正しくは `payment_due_date` でした）。
 */
type Row = BillingInvoice;

const TONE: Record<string, string> = {
  over: 'text-destructive',
  today: 'text-warning',
  soon: 'text-secondary-foreground',
  far: 'text-muted-foreground',
  none: 'text-muted-foreground',
};

export function MobileCollect() {
  const qc = useQueryClient();
  const today = localDateStr(new Date());
  const [open, setOpen] = useState<Row | null>(null);

  /*
   * ⚠️ **月で切らない**（レビューでの指摘 #61）。
   *
   * 前の版は締め画面と同じ `GET /billing/closing?month=<今月>` を引いていたので、
   * **先月以前に計上した未入金がこの画面から丸ごと消えて**いました。
   * ところが**いちばん危ないのは、まさにその古い未入金**です
   * （期日を過ぎたものは前の月のぶんから出ます）。しかもスマホで入金を
   * 記録できるのはこの画面だけなので、**出てこない＝無いことにされます**。
   *
   * 入金待ちは `GET /billing/invoices?state=unpaid` が**月をまたいで**返します
   * （サーバーが期日の近い順に並べ、件数と合計も絞り込み全体で数えます）。
   * **申込書の有無（`blocked`）は要りません** — あれが要るのは請求書を出すときで、
   * 入金の記録は止めない、という決めごとです（`billing.routes.ts`）。
   */
  const q = useQuery<{ data: Row[]; total_count?: number; total_amount?: number; truncated?: boolean }>({
    // **PC の ⑤ 見積・請求と同じ鍵**にする（片方だけ古いままにならない）
    queryKey: ['billing', 'invoices', 'all', 'unpaid'],
    /*
     * **`unpaid` は「請求書を出したのに入金がまだ」**です
     * （`server/src/shared/services/billing-state.ts`・レビューでの指摘 #125）。
     *
     * 前はこの画面だけ `unpaid_issued` という別名を渡していました。素の `unpaid` が
     * 「入金日が空」だけを指しており、**請求書を出していない売上から入金を記録できて**
     * しまったためです。**言葉を1つにしたので別名は要りません** —
     * 名前が2つあること自体が、片方だけ直されて食い違う元でした。
     */
    queryFn: async () => (await api.get('/billing/invoices', { params: { state: 'unpaid' } })).data,
  });

  // サーバーが期日の近い順に返す（並べ直さない — 2か所で並びを決めると食い違う）
  const rows = useMemo(() => (q.data?.data ?? []) as Row[], [q.data]);

  // **合計はサーバーが絞り込み全体で数えたもの**（並んだ行を足さない）
  const total = q.data?.total_amount ?? rows.reduce((n, r) => n + (Number(r.amount) || 0), 0);
  const count = q.data?.total_count ?? rows.length;
  const overdue = rows.filter((r) => !!r.payment_due_date && r.payment_due_date.slice(0, 10) < today).length;
  /** 出していない行の数（サーバーは 300 件で切る）。**黙って切らない** */
  const hidden = Math.max(0, count - rows.length);

  const record = useMutation({
    mutationFn: (r: Row) => api.post('/billing/invoices/bulk', { ids: [r.id], paid_date: today }),
    onSuccess: () => {
      /*
       * ⚠️ **いま引いている鍵を落とす**（レビューでの指摘）。
       * 画面の鍵を `['billing','invoices',…]` に替えたのに、落とすほうは
       * 締めの鍵のままでした。**記録したのに行が消えず、合計も件数も変わらない**ので、
       * 「入金を記録しました」の帯が出たあとに**もう一度押されます**（二重に記録される）。
       * `['billing']` で両方（締め・請求の一覧）を落とします。
       */
      qc.invalidateQueries({ queryKey: ['billing'] });
      qc.invalidateQueries({ queryKey: ['revenues'] });
      setOpen(null);
      notifySuccess('入金を記録しました');
    },
    onError: (e) => notifyApiError('記録できませんでした', e),
  });

  return (
    <div className="flex flex-col gap-3.5 p-3">
      <PageHeader
        title="入金の確認"
        /* **月で切っていないことを書く。** 「今月ぶんだけ」と読まれると、
           出ていない古い未入金があると気づけない */
        sub={`入金待ち ${count}件（月をまたいで全部）${overdue > 0 ? ` ・ 期日を過ぎたもの ${overdue}件` : ''}`}
      />

      {rows.length > 0 && (
        <div className="rounded-card flex items-baseline justify-between border border-border bg-card px-4 py-3">
          <span className="text-sub text-muted-foreground">入金待ちの合計</span>
          <Money value={total} className="text-h2" />
        </div>
      )}

      {q.isError ? (
        <ErrorPanel title="入金待ちを読み込めませんでした" error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <Delayed><SkeletonRows rows={4} /></Delayed>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-6 w-6" aria-hidden="true" />}
          title="入金待ちはありません"
          description="確定した売上のうち、入金がまだのものが月をまたいで出ます。"
        />
      ) : (
        // 読み込みの枠から中身に入れ替わる瞬間（モックの `cardIn`）
        <ul className="v4-card-in flex flex-col gap-2">
          {rows.map((r) => {
            const d = dueLabel(r.payment_due_date, today);
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setOpen(r)}
                  className="rounded-card flex w-full items-start gap-3 border border-border bg-card p-3.5 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-list block [overflow-wrap:anywhere]">
                      {r.customer_name || r.project_name || r.gls_number || '（名前なし）'}
                      <GroupTag name={r.group_name} />
                    </span>
                    <span className="text-note mt-0.5 block truncate text-muted-foreground">
                      {[r.gls_number, r.project_name, r.invoice_no, groupNote(r.group_name)]
                        .filter(Boolean).join(' ・ ')}
                    </span>
                    <span className={cn('text-note mt-1 block font-bold', TONE[d.tone])}>
                      {/* `dueLabel` はタスクの「期限」用なので、期日が無いときの文言だけ差し替える
                          （「支払期日 期限なし」と2つの言い方が並ぶ） */}
                      支払期日 {r.payment_due_date ? d.text : 'なし'}
                    </span>
                  </span>
                  <Money value={Number(r.amount) || 0} className="shrink-0 text-list" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/*
        ⚠️ **切ったことを書く**（レビューでの指摘）。サーバーは 300 件で行を切りますが、
        件数と合計は絞り込み全体のものです。書かないと「これで全部」と読まれ、
        **301 件目からはスマホから入金を記録できない**ことに気づけません。
      */}
      {hidden > 0 && (
        <p className="rounded-note border border-warning-border bg-warning-surface px-3.5 py-3 text-note text-secondary-foreground">
          ほか <span className="font-number">{hidden}</span> 件は多いのでここに出していません
          （上の件数と合計には入っています）。<strong className="font-bold">PC の「請求・入金」から記録してください。</strong>
        </p>
      )}

      <p className="rounded-note flex items-start gap-2 border border-info-border bg-info-surface px-3.5 py-3 text-note text-secondary-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
        <span>
          この画面でできるのは<strong className="font-bold">入金があったことの記録だけ</strong>です。
          請求書を出す・検収を記録するのは PC の「請求・入金」で、
          <strong className="font-bold">取り消しも PC から</strong>行います
          （記録が残る場所で戻すため）。
        </span>
      </p>

      {open && (
        <Sheet
          open
          onOpenChange={(v) => !v && setOpen(null)}
          title="入金を記録しますか"
          sub={open.customer_name || open.project_name || open.gls_number || ''}
          footer={
            <Button className="w-full" disabled={record.isPending} onClick={() => record.mutate(open)}>
              <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />
              今日（{today.replace(/-/g, '/')}）に入金として記録する
            </Button>
          }
        >
          <dl className="text-sub flex flex-col gap-2.5">
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 text-muted-foreground">金額</dt>
              <dd className="min-w-0 flex-1"><Money value={Number(open.amount) || 0} /></dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-20 shrink-0 text-muted-foreground">支払期日</dt>
              <dd className={cn('min-w-0 flex-1', TONE[dueLabel(open.payment_due_date, today).tone])}>
                {open.payment_due_date ? `${open.payment_due_date.slice(0, 10).replace(/-/g, '/')}（${dueLabel(open.payment_due_date, today).text}）` : 'なし'}
              </dd>
            </div>
            {open.invoice_no && (
              <div className="flex gap-3">
                <dt className="w-20 shrink-0 text-muted-foreground">請求書番号</dt>
                <dd className="min-w-0 flex-1 [overflow-wrap:anywhere]">{open.invoice_no}</dd>
              </div>
            )}
          </dl>
          <p className="text-note mt-3.5 text-muted-foreground">
            入金日は<strong className="font-bold">今日の日付</strong>で入ります。
            別の日で記録したいときは PC の「請求・入金」から行ってください。
          </p>
        </Sheet>
      )}
    </div>
  );
}
