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
 *
 * ── 何を残し、何を畳んだか ─────────────────────────────────
 *
 * このペインは**読むだけ**（モックどおり、行を押しても編集は開かない）。
 * 金額を直す・月次ユニットを作るといった編集は、
 * 既存の財務台帳（`/budget/revenues` `/budget/purchases`）と
 * ⑤ 見積・請求（全案件）にすでにある。同じ `revenues`/`purchases` を
 * 2か所で編集できるようにすると、片方だけ直された行ができる
 * （財務の台帳3画面の決めごとと同じ理由）。
 *
 * ── 帳票の発行だけは残す（ご指摘で戻したもの）──────────────
 *
 * **請求書・検収書の PDF はここから出せます。** これは「読むだけ」に反しません —
 * 数字を1つも書き換えず、いま見えている売上をそのまま紙にするだけだからです。
 * v4 でこのペインに置き換えたとき、旧 `BusinessProjectView` が持っていた
 * 3つのボタン（見積書・請求書・検収書）ごと落ちてしまい、**案件から帳票を
 * 出す道がどこにも無くなっていました**。
 *
 * **見積書はここに置きません。** v4 の見積は `estimates`（版が残る表）が持ち、
 * 左の「見積」から版ごとに出せます。売上からも出せるようにすると、
 * 同じ案件の見積書が2種類（版のあるもの・売上に変換したあとのもの）できて、
 * どちらを相手に出したのかが分からなくなります。
 *
 * ── データの出どころ ───────────────────────────────────────
 *
 * `GET /revenues?project_id=` と `GET /purchases?project_id=`（`budget` 権限。
 * レガシー版も同じ口を呼んでいたので権限の要件は変えていない）。
 * 「請求」カードは `invoice_issued` が立っている行だけを見せる —
 * 売上に計上されただけの見込み行と、実際に請求書を出した行は別物のため。
 *
 * ── スマホはカード積み（v4ネイティブUI監査・この回） ───────────
 *
 * 3枚とも `Row`（`stackOnMobile`）の表縮小のままだったので、`mobile` を
 * 受け取ってカード積みに切り替えた。呼び手（`EstimateTab.tsx`）は
 * PC専用ゲートの内側にあるが、「それでもこのまま開く」を選んだ人のために
 * 中身は作り込んである。
 *
 * ── 仕入の「追加」だけは例外（ご要望で追加） ───────────────────
 *
 * 「読むだけ」の原則はそのまま——このペインに仕入の編集フォームを
 * 新しく作ることはしていない。**財務②仕入台帳（`PurchaseListPage.tsx`）が
 * 使っているダイアログ（`ledger/PurchaseDialog.tsx`）・API（`POST /purchases`）を
 * そのまま呼んでいるだけ**（コードの二重実装を避ける）。編集・削除は
 * 台帳側にしか出さない（このペインは新規登録の入口だけ）。
 * 権限も台帳と同じ `sales:editor`（サーバー `POST /purchases` の要件）。
 *
 * ── 仕入行を押すと詳細が見られる（ご要望で追加） ─────────────────
 *
 * 「読むだけ」を破らない範囲で、仕入行を押すと**同じ `PurchaseDialog` を
 * `readOnly` で開く**（保存・削除ボタンは出ず、全欄が disabled）。
 * 財務②仕入台帳の `LedgerRows`（`interactive onClick={() => onOpen(r)}`）と
 * 同じ「行を押すと詳細」という手触りに揃えたが、台帳側は編集者だと
 * 編集ダイアログが開く——ここは常に閲覧専用（このペインの方針）。
 *
 * ── 「案件管理の売上」と「財務管理の売上」は同じデータの2つの見え方 ──
 *
 * `revenues`/`purchases` は財務管理の台帳（`/budget/revenues` `/budget/purchases`）と
 * **同じテーブル・同じ API**（このペインはそれを案件で絞って読むだけ）。
 * 二重管理だと誤解されないよう、各カードに財務管理側（この案件で絞った状態）への
 * リンクを出す（`ProjectQuickLinks.tsx` と同じクエリの付け方
 * `?project_id=…&project_name=…`）。
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
import type { PurchaseRow } from '@/contexts/finance/pages/ledger/types';
import type { Revenue, Vendor } from '@gmo-onair/shared/src/types';
import {
  financeLedgerHref, FinanceLedgerLink, SameDataNote, DocButtons,
  REV_STATUS_LABEL, REV_STATUS_TONE, invoiceState, type ListResponse,
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
  const { hasPermission } = useAuth();
  // サーバー側 `POST /purchases` の要件（`requirePermission('sales', 'editor')`）に合わせる
  const canAddPurchase = hasPermission('sales', 'editor');
  const [addPurchaseOpen, setAddPurchaseOpen] = useState(false);
  /** 仕入行を押して開いた閲覧専用の詳細。`null` なら閉じている */
  const [viewingPurchase, setViewingPurchase] = useState<PurchaseRow | null>(null);

  const revenues = useQuery<ListResponse<Revenue>>({
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
  // 台帳側で既に引いていれば、そのキャッシュをそのまま使い回せる）
  const { data: wonProjectsData } = useQuery({
    queryKey: ['won-projects-for-purchase'],
    queryFn: async () => (await api.get('/projects/won-projects')).data,
    enabled: addPurchaseOpen,
  });
  const glsProjects: PurchaseProjectOption[] = wonProjectsData?.data ?? [];
  const { data: vendorsData } = useQuery({
    queryKey: ['vendors-list'],
    queryFn: async () => (await api.get('/vendors?limit=200')).data,
    enabled: addPurchaseOpen,
  });
  const vendors: Vendor[] = vendorsData?.data ?? [];

  const savePurchase = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => (await api.post('/purchases', payload)).data,
    onSuccess: () => {
      // このペイン自身の一覧に加えて、財務②仕入台帳（`purchases-all`）も落とす
      // （react-query の鍵の対——`client/CLAUDE.md`）。片方だけだと台帳を開いたときに
      // 古い一覧のままになる
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
              {revenueRows.map((r) => (
                <div key={r.id} className="flex flex-col gap-2 border-b border-border-faint p-3.5 last:border-b-0">
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="text-list block truncate font-bold">{r.subtitle || r.notes || '（内容未設定）'}</span>
                      <span className="text-sub-sm font-number block text-muted-foreground">
                        {r.recognition_date?.slice(0, 7).replace('-', '/') ?? '—'}
                      </span>
                    </span>
                    <TableBadge w={null} label={REV_STATUS_LABEL[r.status] ?? r.status}
                      className={cn('shrink-0', REV_STATUS_TONE[r.status] ?? REV_STATUS_TONE.estimate)} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Money value={r.amount} className="text-list font-bold" />
                    <DocButtons revenueId={r.id} />
                  </div>
                </div>
              ))}
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
              <RowSlot w={160} align="right">帳票</RowSlot>
            </RowHeader>
            {revenueRows.map((r) => (
              <Row key={r.id} divider stackOnMobile align="center">
                <RowMain><span className="text-list block truncate">{r.subtitle || r.notes || '（内容未設定）'}</span></RowMain>
                <RowSlot w={96}><span className="text-sub font-number">{r.recognition_date?.slice(0, 7).replace('-', '/') ?? '—'}</span></RowSlot>
                <Money value={r.amount} className="text-sub w-32 shrink-0" />
                <TableBadge w={96} label={REV_STATUS_LABEL[r.status] ?? r.status} className={REV_STATUS_TONE[r.status] ?? REV_STATUS_TONE.estimate} />
                <DocButtons revenueId={r.id} />
              </Row>
            ))}
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
    </div>
  );
}
