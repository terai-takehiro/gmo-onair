/**
 * 見積タブの「売上・請求」ペイン（v4・モックの3カード設計に置き換え）
 *
 * ── なぜ作り直したか ──────────────────────────────────────
 *
 * 従来はレガシー `BusinessProjectView`（KPIカード＋月次ユニット＋
 * PDF/Excel出力＋明細のインライン編集を持つフル機能コンソール）をそのまま
 * 呼んでいた。最新モック（`v4-live-sales.dc.html` の `det.isRevPane`）は
 * **売上／請求／仕入（原価）の3枚のカードだけ**の、ずっと単純な読み取り中心の
 * 設計だったので、そちらに合わせて作り直した（`docs/v4-mock-deviations.md` 参照）。
 * 請求・仕入（原価）の合計・帳票発行は今も**読むだけ**（月次ユニット作成・仕入の
 * 金額編集は既存の財務台帳 `/budget/purchases` と ⑤ 見積・請求（全案件）にある）。
 *
 * ── 売上だけは編集できる（仕様変更 #13・ご要望で変更）────────────
 *
 * 元は「読むだけ」（同じ `revenues` を2か所で編集できると片方だけ直された行が
 * できるため）だったが、**案件詳細から計上月・請求予定日・入金予定日・前金・
 * 請求書発行済を直せないと不便**という指摘を受け、財務台帳の
 * `RevenueDialog.tsx`（③ 売上の登録・編集ダイアログ）をそのまま流用して
 * 編集できるようにした。**二重実装はしていない** — `RevenueListPage.tsx` が
 * 開くのと同じ部品・同じ `PUT /revenues/:id` をこの画面から開くだけ
 * （仕入編集を `PurchaseDialog` で流用しているのと同じやり方）。権限もサーバー
 * `PUT /revenues/:id` の要件（`sales:editor`）に合わせる。
 *
 * ── 見積との差異は気づけるようにするだけ（仕様変更 #15）───────────
 *
 * 見積から変換された売上には、見積のような「送付後は編集不可」の縛りが
 * 及ばない（`estimates` と違う表なので）。**編集そのものはロックしない**
 * というご判断のため、代わりに元の見積の合計金額といまの売上金額が
 * 食い違っていたら行に警告バッジを出す（`revenueBillingParts.tsx` の
 * `estimateMismatch`/`EstimateMismatchNote`）。見積自体は送付後に直せないので、
 * 差が出るのは売上側をあとから直接書き換えたときだけ。差異検知に使う
 * `estimate_id`/`estimate_total_amount` は `project_id` で絞ったときだけ
 * `GET /revenues` が返す（`revenues.routes.ts`）。
 *
 * ── 帳票の発行だけは残す（ご指摘で戻したもの）──────────────
 *
 * **請求書・検収書の PDF はここから出せます。** 数字を書き換えず、いま
 * 見えている売上をそのまま紙にするだけ。**見積書はここに置きません** —
 * 版のある `estimates` から出す（売上からも出すと2種類の見積書ができて
 * どちらを相手に出したのか分からなくなる）。
 *
 * ── スマホはカード積み（v4ネイティブUI監査・この回） ───────────
 *
 * 3枚とも `Row`（`stackOnMobile`）の表縮小のままだったので、`mobile` を
 * 受け取ってカード積みに切り替えた。呼び手（`EstimateTab.tsx`）は
 * PC専用ゲートの内側にあるが、「それでもこのまま開く」を選んだ人のために
 * 中身は作り込んである。
 *
 * ── 仕入の「追加」・「行を押すと詳細」だけは例外（ご要望で追加） ─────
 *
 * 仕入は今も「読むだけ」——**財務②仕入台帳が使うダイアログ
 * （`ledger/PurchaseDialog.tsx`）・API（`POST /purchases`）をそのまま
 * 呼んでいるだけ**（新規登録の入口のみ・権限は台帳と同じ `sales:editor`）。
 * 行を押すと同じ `PurchaseDialog` を `readOnly` で開く（保存・削除は出ない・
 * 常に閲覧専用）。編集・削除は台帳側にしか出さない。
 *
 * ── 「案件管理の売上」と「財務管理の売上」は同じデータの2つの見え方 ──
 *
 * `revenues`/`purchases` は財務管理の台帳と**同じテーブル・同じ API**
 * （このペインはそれを案件で絞って読むだけ）。二重管理だと誤解されないよう、
 * 各カードに財務管理側（この案件で絞った状態）へのリンクを出す
 * （`ProjectQuickLinks.tsx` と同じクエリの付け方 `?project_id=…&project_name=…`）。
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import api from '@/lib/api';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { Row, RowHeader, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { EmptyState, Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/platform/AuthContext';
import { PurchaseDialog, type PurchaseProjectOption } from '@/contexts/finance/pages/ledger/PurchaseDialog';
import { fetchAllUsers, PURCHASE_ASSIGNEE_USERS_QUERY_KEY } from '@/contexts/finance/pages/ledger/usePurchaseDialogData';
import { RevenueDialog } from '@/contexts/finance/pages/ledger/RevenueDialog';
import type { PurchaseRow } from '@/contexts/finance/pages/ledger/types';
import type { Vendor } from '@gmo-onair/shared/src/types';
import {
  financeLedgerHref, FinanceLedgerLink, SameDataNote, DocButtons,
  REV_STATUS_LABEL, REV_STATUS_TONE, invoiceState, estimateMismatch, EstimateMismatchNote, GroupRevenueNote,
  type ListResponse, type PaneRevenue,
} from './revenueBillingParts';

/**
 * **切ったことを書く。** 行は 100 件までしか出しません（全部出すと画面が固まる）。
 * 黙って切ると「これで全部」と読まれます。**合計には入っています**（サーバーが出す）。
 */
function MoreNote({ n }: { n: number }) {
  return (
    <p className="text-note border-t border-border-subtle px-4 py-2.5 text-muted-foreground">
      ほか {n} 件（多いのでここには出していません。合計には入っています。財務管理の台帳で全部見られます）
    </p>
  );
}

export function RevenueBillingPane({ projectId, projectName, mobile }: { projectId: string; projectName?: string; mobile?: boolean }) {
  const qc = useQueryClient();
  const { hasPermission, currentUser } = useAuth();
  // サーバー側 `POST /purchases` の要件（`requirePermission('sales', 'editor')`）に合わせる
  const canAddPurchase = hasPermission('sales', 'editor');
  // サーバー側 `PUT /revenues/:id` の要件（`requirePermission('sales', 'editor')`）に合わせる
  const canEditRevenue = hasPermission('sales', 'editor');
  const [addPurchaseOpen, setAddPurchaseOpen] = useState(false);
  /** 仕入行を押して開いた閲覧専用の詳細。`null` なら閉じている */
  const [viewingPurchase, setViewingPurchase] = useState<PurchaseRow | null>(null);
  /** 編集ボタンで開いた売上の編集ダイアログ（`RevenueDialog` を流用）。`null` なら閉じている */
  const [editingRevenue, setEditingRevenue] = useState<PaneRevenue | null>(null);

  const revenues = useQuery<ListResponse<PaneRevenue>>({
    queryKey: ['revenues', 'project', projectId],
    queryFn: async () => (await api.get('/revenues', { params: { project_id: projectId, limit: 100 } })).data,
  });
  // `PurchaseRow` で受ける — 財務②仕入台帳（`PurchaseListPage.tsx`）と同じ `/purchases` の
  // 応答なので同じ形。仕入行の詳細（`readOnly` の `PurchaseDialog`）に project_name・
  // gls_number・vendor_name をそのまま渡すため（一覧を引き直さずに名前を出す）
  const purchases = useQuery<ListResponse<PurchaseRow>>({
    queryKey: ['purchases', 'project', projectId],
    queryFn: async () => (await api.get('/purchases', { params: { project_id: projectId, limit: 100 } })).data,
  });

  // ダイアログを開いたときだけ取りに行く（`PurchaseListPage.tsx` と同じ鍵——
  // 台帳側で既に引いていれば使い回せる）。失注(e_lost)以外の案件から選べる（2026-09 依頼）
  const { data: wonProjectsData } = useQuery({
    queryKey: ['registerable-projects-for-purchase'],
    queryFn: async () => (await api.get('/projects/registerable-projects')).data,
    enabled: addPurchaseOpen,
  });
  const glsProjects: PurchaseProjectOption[] = wonProjectsData?.data ?? [];
  const { data: vendorsData } = useQuery({
    queryKey: ['vendors-list'],
    queryFn: async () => (await api.get('/vendors?limit=200')).data,
    enabled: addPurchaseOpen,
  });
  const vendors: Vendor[] = vendorsData?.data ?? [];
  const { data: users = [] } = useQuery({ queryKey: PURCHASE_ASSIGNEE_USERS_QUERY_KEY, queryFn: fetchAllUsers, enabled: addPurchaseOpen });
  const savePurchase = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => (await api.post('/purchases', payload)).data,
    onSuccess: () => {
      // このペイン自身の一覧に加えて、財務②仕入台帳（`purchases-all`）も落とす（鍵の対・`client/CLAUDE.md`）
      qc.invalidateQueries({ queryKey: ['purchases', 'project', projectId] });
      qc.invalidateQueries({ queryKey: ['purchases-all'] });
      notifySuccess('仕入を登録しました');
      setAddPurchaseOpen(false);
    },
    onError: (err) => notifyApiError('仕入の登録に失敗しました', err),
  });

  if (revenues.isLoading || purchases.isLoading) {
    return <Delayed><SkeletonRows rows={4} /></Delayed>;
  }

  const revenueRows = revenues.data?.data ?? [];
  const invoiceRows = revenueRows.filter((r) => r.invoice_issued);
  const purchaseRows = purchases.data?.data ?? [];

  // **合計はサーバーが出したものを使う**（上の注意書き）。古い応答が返ってきた
  // ときだけ、今までどおり行を足す（数字が消えるより、多少ずれても出すほうがまし）
  const confirmedRevenue = revenues.data?.confirmed_allocated_amount
    ?? revenueRows.filter((r) => r.status === 'confirmed').reduce((n, r) => n + (r.amount || 0), 0);
  const totalCost = purchases.data?.total_allocated_amount
    ?? purchaseRows.reduce((n, p) => n + (p.amount || 0), 0);
  const grossProfit = confirmedRevenue - totalCost;

  /** 行は 100 件までしか出せないので、**残りがあることを書く**（黙って切らない） */
  const moreRevenue = Math.max(0, (revenues.data?.pagination?.total ?? 0) - revenueRows.length);
  const morePurchase = Math.max(0, (purchases.data?.pagination?.total ?? 0) - purchaseRows.length);

  const revenuesLedgerHref = financeLedgerHref('/budget/revenues', projectId, projectName);
  const purchasesLedgerHref = financeLedgerHref('/budget/purchases', projectId, projectName);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="overflow-hidden rounded-card border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border px-4 py-3">
          <p className="text-cardtitle">売上</p>
          <FinanceLedgerLink to={revenuesLedgerHref} label="財務管理の売上台帳で見る" />
        </div>
        <SameDataNote what="売上" />
        {revenueRows.length === 0 ? (
          <EmptyState title="売上はまだありません" description="財務管理の売上台帳から登録できます。" />
        ) : mobile ? (
          <>
            <div className="flex flex-col">
              {revenueRows.map((r) => {
                const mismatch = estimateMismatch(r);
                return (
                  <div key={r.id} className="flex flex-col gap-2 border-b border-border-faint p-3.5 last:border-b-0">
                    <div className="flex items-start gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="text-list block truncate font-bold">{r.subtitle || r.notes || '（内容未設定）'}</span>
                        <span className="text-sub-sm font-number block text-muted-foreground">
                          {r.recognition_date?.slice(0, 7).replace('-', '/') ?? '—'}
                        </span>
                        {mismatch !== null && <EstimateMismatchNote estimateTotal={mismatch} />}
                        {r.group_id && <GroupRevenueNote />}
                      </span>
                      <TableBadge w={null} label={REV_STATUS_LABEL[r.status] ?? r.status}
                        className={cn('shrink-0', REV_STATUS_TONE[r.status] ?? REV_STATUS_TONE.estimate)} />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <Money value={r.amount} className="text-list font-bold" />
                      <DocButtons revenueId={r.id} onEdit={canEditRevenue && !r.group_id ? () => setEditingRevenue(r) : undefined} />
                    </div>
                  </div>
                );
              })}
            </div>
            {moreRevenue > 0 && <MoreNote n={moreRevenue} />}
          </>
        ) : (
          <>
            <RowHeader className="hidden sm:flex">
              <RowMain>内容</RowMain>
              <RowSlot w={96}>計上月</RowSlot>
              <RowSlot w={128} align="right">金額</RowSlot>
              <RowSlot w={96}>状態</RowSlot>
              <RowSlot w={canEditRevenue ? 200 : 160} align="right">帳票</RowSlot>
            </RowHeader>
            {revenueRows.map((r) => {
              const mismatch = estimateMismatch(r);
              return (
                <Row key={r.id} divider stackOnMobile align="start">
                  <RowMain>
                    <span className="text-list block truncate">{r.subtitle || r.notes || '（内容未設定）'}</span>
                    {mismatch !== null && <EstimateMismatchNote estimateTotal={mismatch} />}
                    {r.group_id && <GroupRevenueNote />}
                  </RowMain>
                  <RowSlot w={96}><span className="text-sub font-number">{r.recognition_date?.slice(0, 7).replace('-', '/') ?? '—'}</span></RowSlot>
                  <Money value={r.amount} className="text-sub w-32 shrink-0" />
                  <TableBadge w={96} label={REV_STATUS_LABEL[r.status] ?? r.status} className={REV_STATUS_TONE[r.status] ?? REV_STATUS_TONE.estimate} />
                  <DocButtons revenueId={r.id} onEdit={canEditRevenue && !r.group_id ? () => setEditingRevenue(r) : undefined} />
                </Row>
              );
            })}
            {moreRevenue > 0 && <MoreNote n={moreRevenue} />}
          </>
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-2">
        <div className="overflow-hidden rounded-card border border-border bg-card">
          <p className="text-cardtitle border-b border-border px-4 py-3">請求</p>
          {invoiceRows.length === 0 ? (
            <EmptyState title="請求はまだありません" description="売上・請求（全案件）から請求書を出せます。" />
          ) : mobile ? (
            <div className="flex flex-col">
              {invoiceRows.map((r) => {
                const st = invoiceState(r);
                return (
                  <div key={r.id} className="flex items-start gap-2 border-b border-border-faint p-3.5 last:border-b-0">
                    <span className="min-w-0 flex-1">
                      <span className="text-list block truncate font-bold">{r.invoice_no || r.billing_key || '（番号未採番）'}</span>
                      <span className="text-sub-sm font-number block text-muted-foreground">{r.billing_date?.replace(/-/g, '/') ?? '—'}</span>
                      <Money value={r.amount} className="text-list mt-1 font-bold" />
                    </span>
                    <TableBadge w={null} label={st.label} className={cn('shrink-0', st.tone)} />
                  </div>
                );
              })}
            </div>
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
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="text-cardtitle">仕入（原価）</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <FinanceLedgerLink to={purchasesLedgerHref} label="財務管理の仕入台帳で見る" />
              {canAddPurchase && (
                <Button size="sm" variant="outline" onClick={() => setAddPurchaseOpen(true)}>
                  <Plus className="mr-1 h-4 w-4" aria-hidden="true" />仕入を追加
                </Button>
              )}
            </div>
          </div>
          <SameDataNote what="仕入" />
          {purchaseRows.length === 0 ? (
            <EmptyState
              title="仕入はまだありません"
              description="財務管理の仕入台帳、またはここからも登録できます。"
              action={canAddPurchase ? (
                <Button size="sm" onClick={() => setAddPurchaseOpen(true)}>
                  <Plus className="mr-1 h-4 w-4" aria-hidden="true" />仕入を追加
                </Button>
              ) : undefined}
            />
          ) : mobile ? (
            <>
              <div className="flex flex-col">
                {purchaseRows.map((p) => (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setViewingPurchase(p)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewingPurchase(p); }
                    }}
                    className="min-h-tap flex cursor-pointer items-center justify-between gap-2 border-b border-border-faint p-3.5 last:border-b-0 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="text-list min-w-0 flex-1 truncate">{p.vendor_name || p.description || '（内容未設定）'}</span>
                    <Money value={p.amount} className="text-list shrink-0 font-bold" />
                  </div>
                ))}
              </div>
              {morePurchase > 0 && <MoreNote n={morePurchase} />}
            </>
          ) : (
            <>
              {purchaseRows.map((p) => (
                <Row
                  key={p.id}
                  divider
                  interactive
                  align="center"
                  role="button"
                  tabIndex={0}
                  onClick={() => setViewingPurchase(p)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewingPurchase(p); }
                  }}
                  className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <RowMain><span className="text-list block truncate">{p.vendor_name || p.description || '（内容未設定）'}</span></RowMain>
                  <Money value={p.amount} className="text-sub w-28 shrink-0" />
                </Row>
              ))}
              {morePurchase > 0 && <MoreNote n={morePurchase} />}
            </>
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

      {addPurchaseOpen && (
        <PurchaseDialog
          editing={null}
          defaultProjectId={projectId}
          projects={glsProjects}
          vendors={vendors}
          users={users} currentUserId={currentUser?.id}
          saving={savePurchase.isPending}
          onSave={(payload) => savePurchase.mutate(payload)}
          onClose={() => setAddPurchaseOpen(false)}
        />
      )}

      {/* 仕入行を押したときの閲覧専用の詳細。編集・削除は出さない（このペインの方針） */}
      {viewingPurchase && (
        <PurchaseDialog
          readOnly
          editing={viewingPurchase}
          defaultProjectId={projectId}
          onClose={() => setViewingPurchase(null)}
        />
      )}

      {/* 編集ボタンで開く売上の編集ダイアログ。財務台帳と同じ `RevenueDialog`（ファイル冒頭コメント参照） */}
      {editingRevenue && (
        <RevenueDialog
          key={editingRevenue.id}
          editing={editingRevenue}
          onClose={() => setEditingRevenue(null)}
        />
      )}
    </div>
  );
}
