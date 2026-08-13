/**
 * 見積タブの「売上・請求」ペイン（v4・モックの3カード設計に置き換え）
 *
 * ── なぜ作り直したか ──────────────────────────────────────
 *
 * 従来はレガシー `BusinessProjectView`（2,042行・KPIカード＋月次ユニット＋
 * PDF/Excel出力＋明細のインライン編集を持つフル機能コンソール）をそのまま
 * 呼んでいた。最新モック（`v4-live-sales.dc.html` の `det.isRevPane`）は
 * **売上／請求／仕入（原価）の3枚のカードだけ**の、ずっと単純な読み取り中心の
 * 設計だったので、そちらに合わせて作り直した（`docs/v4-mock-deviations.md` 参照）。
 *
 * ── 何を残し、何を畳んだか ─────────────────────────────────
 *
 * このペインは**読むだけ**（モックどおり、行を押しても編集は開かない）。
 * 金額を直す・PDF/Excelを出す・月次ユニットを作るといった編集は、
 * 既存の財務台帳（`/budget/revenues` `/budget/purchases`）と
 * ⑤ 見積・請求（全案件）にすでにある。同じ `revenues`/`purchases` を
 * 2か所で編集できるようにすると、片方だけ直された行ができる
 * （財務の台帳3画面の決めごとと同じ理由）。
 *
 * ── データの出どころ ───────────────────────────────────────
 *
 * `GET /revenues?project_id=` と `GET /purchases?project_id=`（`budget` 権限。
 * レガシー版も同じ口を呼んでいたので権限の要件は変えていない）。
 * 「請求」カードは `invoice_issued` が立っている行だけを見せる —
 * 売上に計上されただけの見込み行と、実際に請求書を出した行は別物のため。
 */
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { Row, RowHeader, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { EmptyState, Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import type { Revenue, Purchase } from '@gmo-onair/shared/src/types';

const REV_STATUS_LABEL: Record<string, string> = { estimate: '見込み', confirmed: '確定' };
const REV_STATUS_TONE: Record<string, string> = {
  estimate: 'border-transparent bg-muted text-muted-foreground',
  confirmed: 'border-transparent bg-success-surface text-success',
};

function invoiceState(r: Revenue): { label: string; tone: string } {
  return r.paid_date
    ? { label: '入金済み', tone: 'border-transparent bg-success-surface text-success' }
    : { label: '未収', tone: 'border-transparent bg-warning-surface text-warning' };
}

export function RevenueBillingPane({ projectId }: { projectId: string }) {
  const revenues = useQuery<Revenue[]>({
    queryKey: ['revenues', 'project', projectId],
    queryFn: async () => (await api.get('/revenues', { params: { project_id: projectId, limit: 100 } })).data.data,
  });
  const purchases = useQuery<Purchase[]>({
    queryKey: ['purchases', 'project', projectId],
    queryFn: async () => (await api.get('/purchases', { params: { project_id: projectId, limit: 100 } })).data.data,
  });

  if (revenues.isLoading || purchases.isLoading) {
    return <Delayed><SkeletonRows rows={4} /></Delayed>;
  }

  const revenueRows = revenues.data ?? [];
  const invoiceRows = revenueRows.filter((r) => r.invoice_issued);
  const purchaseRows = purchases.data ?? [];

  const confirmedRevenue = revenueRows.filter((r) => r.status === 'confirmed').reduce((n, r) => n + (r.amount || 0), 0);
  const totalCost = purchaseRows.reduce((n, p) => n + (p.amount || 0), 0);
  const grossProfit = confirmedRevenue - totalCost;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="overflow-hidden rounded-card border border-border bg-card">
        <p className="text-cardtitle border-b border-border px-4 py-3">売上</p>
        {revenueRows.length === 0 ? (
          <EmptyState title="売上はまだありません" description="財務管理の売上台帳から登録できます。" />
        ) : (
          <>
            <RowHeader className="hidden sm:flex">
              <RowMain>内容</RowMain>
              <RowSlot w={96}>計上月</RowSlot>
              <RowSlot w={128} align="right">金額</RowSlot>
              <RowSlot w={96}>状態</RowSlot>
            </RowHeader>
            {revenueRows.map((r) => (
              <Row key={r.id} divider stackOnMobile align="center">
                <RowMain><span className="text-list block truncate">{r.subtitle || r.notes || '（内容未設定）'}</span></RowMain>
                <RowSlot w={96}><span className="text-sub font-number">{r.recognition_date?.slice(0, 7).replace('-', '/') ?? '—'}</span></RowSlot>
                <Money value={r.amount} className="text-sub w-32 shrink-0" />
                <TableBadge w={96} label={REV_STATUS_LABEL[r.status] ?? r.status} className={REV_STATUS_TONE[r.status] ?? REV_STATUS_TONE.estimate} />
              </Row>
            ))}
          </>
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-2">
        <div className="overflow-hidden rounded-card border border-border bg-card">
          <p className="text-cardtitle border-b border-border px-4 py-3">請求</p>
          {invoiceRows.length === 0 ? (
            <EmptyState title="請求はまだありません" description="売上・請求（全案件）から請求書を出せます。" />
          ) : (
            invoiceRows.map((r) => {
              const st = invoiceState(r);
              return (
                <Row key={r.id} divider align="center">
                  <RowMain>
                    <span className="text-list block truncate">{r.invoice_no || r.billing_key || '（番号未採番）'}</span>
                    <span className="text-sub-sm font-number block text-muted-foreground">{r.billing_date?.replace(/-/g, '/') ?? '—'}</span>
                  </RowMain>
                  <Money value={r.amount} className="text-sub w-28 shrink-0" />
                  <TableBadge w={72} label={st.label} className={st.tone} />
                </Row>
              );
            })
          )}
        </div>
        <div className="overflow-hidden rounded-card border border-border bg-card">
          <p className="text-cardtitle border-b border-border px-4 py-3">仕入（原価）</p>
          {purchaseRows.length === 0 ? (
            <EmptyState title="仕入はまだありません" description="財務管理の仕入台帳から登録できます。" />
          ) : (
            purchaseRows.map((p) => (
              <Row key={p.id} divider align="center">
                <RowMain><span className="text-list block truncate">{p.vendor_name || p.description || '（内容未設定）'}</span></RowMain>
                <Money value={p.amount} className="text-sub w-28 shrink-0" />
              </Row>
            ))
          )}
        </div>
      </div>

      <div className="rounded-card border border-border bg-surface-subtle p-4">
        <div className="flex flex-col gap-1.5">
          {[
            { label: '確定売上', value: confirmedRevenue, fg: '' },
            { label: '仕入（原価）', value: totalCost, fg: '' },
            { label: '粗利', value: grossProfit, fg: grossProfit < 0 ? 'text-destructive' : 'text-success' },
          ].map((s) => (
            <div key={s.label} className="flex items-baseline gap-3">
              <span className="text-sub flex-1 text-right text-muted-foreground">{s.label}</span>
              <Money value={s.value} className={`text-list w-40 shrink-0 font-bold ${s.fg}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
