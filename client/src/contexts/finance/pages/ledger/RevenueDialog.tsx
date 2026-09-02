/**
 * 売上の登録・編集ダイアログ（③ 売上）
 *
 * **旧 `RevenueListPage` から切り出したものです。** 金額を扱うフォームなので、
 * 一覧の作り直しと同じ回で中身まで作り替えません（どちらが原因で壊れたか
 * 切り分けられなくなります）。検収のトグル（仕様変更 #5）だけは新規に足しました。
 *
 * ── 状態の初期化を「マウント」に任せた ────────────────────────
 *
 * 旧実装は閉じるときに 14 個の `setState` を並べて手で消していました。
 * **消し忘れが1つあると次に開いたとき前の案件の値が残ります**（実際に
 * 金額だけ前の案件のまま登録できてしまう形）。ここでは親が
 * `{open && <RevenueDialog key={…} />}` で描くので、閉じれば状態ごと消えます。
 */
import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2, Download, Link2, Percent } from 'lucide-react';
import { useDebounced } from '@gmo-onair/shared/src/client/hooks/useDebounced';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import api from '@/lib/api';
import { TaxHelperButton } from '@gmo-onair/shared/src/client/ui/tax-aware-amount-input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getProjectCategory, taxBillingSuffix } from '@/types';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import PricingItemPicker from '../../components/PricingItemPicker';
import DiscountDialog from '../../components/DiscountDialog';
import { RevenueItemsTable } from './RevenueItemsTable';
import { RevenueProjectFields } from './RevenueProjectFields';
import { RevenueDateFields } from './RevenueDateFields';
import { useRevenueItems } from './useRevenueItems';
import { defaultsFromProject, formFromRevenue, mapRevenueItems } from './revenuePrefill';
import { useRevenueEditTarget } from './useRevenueEditTarget';
import type { EpisodeOption, ProjectOption, RevenueItem, RevenueRow } from './types';

export function RevenueDialog({
  editing, onClose,
}: {
  /** 直す行。`null` なら新規 */
  editing: RevenueRow | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const [projectSearch, setProjectSearch] = useState(editing?.project_name || '');
  const [selectedProjectObj, setSelectedProjectObj] = useState<ProjectOption | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState(editing?.project_id || '');
  // ⚠️ **直す行の回（episode）を必ず引き継ぐ。** ここを空で始めると、保存のたびに
  // `episode_id: null` を送って**回との紐づきが黙って外れます**（migration 269/270）
  const [selectedEpisodeId, setSelectedEpisodeId] = useState(editing?.episode_id || '');
  const [taxCategory, setTaxCategory] = useState(editing?.tax_category || 'tax10');
  const [amount, setAmount] = useState<number>(Number(editing?.amount) || 0);
  const [recognitionMonth, setRecognitionMonth] = useState(editing?.recognition_date?.slice(0, 7) || '');
  const [billingDate, setBillingDate] = useState(editing?.billing_date?.slice(0, 10) || '');
  const [paymentDueDate, setPaymentDueDate] = useState(editing?.payment_due_date?.slice(0, 10) || '');
  const [notes, setNotes] = useState(editing?.notes || '');
  const [isAdvancePayment, setIsAdvancePayment] = useState(!!editing?.is_advance_payment);
  const [inspectionDate, setInspectionDate] = useState<string | null>(editing?.inspection_date ?? null); // 検収 (#5)。保存は RevenueDateFields.tsx 側
  const [invoiceIssued, setInvoiceIssued] = useState(!!editing?.invoice_issued);
  const [existingRevenueId, setExistingRevenueId] = useState(editing?.id || '');
  const [pricingPickerOpen, setPricingPickerOpen] = useState(false);
  const isMobile = useIsMobile();

  // 明細行の足し引きは `useRevenueItems` が持つ（400行の上限で分けた）
  const {
    items, setItems, itemsTotal, flashRowIdx,
    addItem, removeItem, updateItem, importSimulation, pickPricingItem,
    discountDialog, setDiscountDialog, openItemDiscount, openGlobalDiscount, applyDiscount,
  } = useRevenueItems();

  // **直す行の明細を読む。** 旧実装は編集で開くと `items` を空にしていたので、
  // 明細を持つ売上に1行足して保存すると**残りの明細が全部消えていました**
  // (`items` が1件以上あるとサーバーは全置換する)。一覧は明細を返さないので、
  // ここで1件だけ取り直します。
  const { data: detailData } = useQuery({
    queryKey: ['revenue-detail', editing?.id],
    queryFn: async () => (await api.get(`/revenues/${editing!.id}`)).data,
    enabled: !!editing?.id,
  });
  useEffect(() => {
    const loaded: RevenueItem[] | undefined = detailData?.data?.items;
    if (!loaded || loaded.length === 0) return;
    setItems(mapRevenueItems(loaded));
  }, [detailData]);

  // Search projects
  // **受注確定済み（`a_won`/`s_completed`）だけを候補にする**（v4.1.8・矛盾修正）。
  // 以前はステージを問わず全案件から検索できたので、仕入・精算PDF取込レビュー等
  // 他の実務入力画面と違い、ヨミ段階の案件にも売上を記録できてしまっていた
  //
  // **1文字ごとに問い合わせない**（`RevenueListPage` と同じ）。/projects は重い口なので、
  // 入力欄は `projectSearch`（即時）のまま、問い合わせに渡す値だけ遅らせる
  const appliedProjectSearch = useDebounced(projectSearch.trim(), 300);
  const { data: projectsData } = useQuery({
    queryKey: ['projects-search', appliedProjectSearch],
    queryFn: async () => (await api.get('/projects', {
      params: { search: appliedProjectSearch, stage: 'a_won,s_completed', limit: 20 },
    })).data,
    enabled: appliedProjectSearch.length > 0,
  });
  const projects: ProjectOption[] = projectsData?.data ?? [];

  const { data: episodesData } = useQuery({
    queryKey: ['project-episodes', selectedProjectId],
    queryFn: async () => (await api.get(`/projects/${selectedProjectId}/episodes?limit=100`)).data,
    enabled: !!selectedProjectId,
  });
  const episodes: EpisodeOption[] = episodesData?.data ?? [];

  // 同じ案件に既に売上があれば「更新」に切り替える（旧実装のまま）
  const { data: existingRevenuesData } = useQuery({
    queryKey: ['revenues-for-project', selectedProjectId],
    queryFn: async () =>
      (await api.get('/revenues', { params: { project_id: selectedProjectId, status: 'confirmed' } })).data,
    enabled: !!selectedProjectId,
  });
  const existingProjectRevenues: RevenueRow[] = existingRevenuesData?.data ?? [];
  const primaryRevenue = existingProjectRevenues.find((r) => !r.group_id);

  // 保存先の案件・請求先・「保存できない理由」。**直しに来たときは案件名で検索し直さない**
  // — 受注前・見込みの行だと候補が0件になり、更新ボタンが永久に灰色のままだった
  //（`useRevenueEditTarget.ts` 冒頭。ユーザー報告「入力は出来るが保存ができない」の実体）
  const { selectedProject, customerId, blockReason } = useRevenueEditTarget({
    editing, selectedProjectId, selectedProjectObj, projects,
  });
  const isProjectCategoryB = selectedProject?.project_type
    ? getProjectCategory(selectedProject.project_type) === 'B'
    : false;

  const { data: simData } = useQuery({
    queryKey: ['simulation-for-revenue', selectedProjectId],
    queryFn: async () => (await api.get(`/projects/${selectedProjectId}/simulation`)).data,
    enabled: !!selectedProjectId && !isProjectCategoryB,
  });
  const simulationItems = simData?.data ?? [];

  // 案件選択時: 案件のデフォルト値を入れる（計上月=終了月／請求=月末／入金=翌月末）。
  // **直しに来たときは動かさない** — 開いた瞬間に日付が書き換わると気づけない
  useEffect(() => {
    if (editing || !selectedProject) return;
    setExistingRevenueId('');
    const d = defaultsFromProject(selectedProject);
    if (d.amount !== undefined) setAmount(d.amount);
    if (d.recognitionMonth) setRecognitionMonth(d.recognitionMonth);
    if (d.billingDate) setBillingDate(d.billingDate);
    if (d.paymentDueDate) setPaymentDueDate(d.paymentDueDate);
  }, [selectedProjectId, selectedProject?.event_end]); // eslint-disable-line react-hooks/exhaustive-deps

  // 既存売上が見つかったら上書き（更新モード）。空の項目は案件ベースの自動入力を残す
  useEffect(() => {
    if (editing || !primaryRevenue) return;
    const v = formFromRevenue(primaryRevenue);
    setExistingRevenueId(primaryRevenue.id);
    setAmount(v.amount);
    setTaxCategory(v.taxCategory);
    if (v.recognitionMonth) setRecognitionMonth(v.recognitionMonth);
    if (v.billingDate) setBillingDate(v.billingDate);
    if (v.paymentDueDate) setPaymentDueDate(v.paymentDueDate);
    setNotes(v.notes);
    setIsAdvancePayment(v.isAdvancePayment); setInspectionDate(v.inspectionDate); setInvoiceIssued(v.invoiceIssued);
    // **明細が空なら触らない** — 空配列で上書きすると元の明細が全部消える
    if (v.items) setItems(v.items);
  }, [primaryRevenue?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const billingKeyPreview = useMemo(() => {
    if (selectedEpisodeId) {
      const ep = episodes.find((e) => e.id === selectedEpisodeId);
      if (!ep) return '';
      return `${ep.episode_code}-${taxBillingSuffix(taxCategory)}`;
    }
    if (selectedProject?.gls_number) return `${selectedProject.gls_number}-${taxBillingSuffix(taxCategory)}`;
    return '';
  }, [selectedEpisodeId, taxCategory, episodes, selectedProject]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['revenues-all'] });
    qc.invalidateQueries({ queryKey: ['revenues-for-project', selectedProjectId] });
    // 入金・請求は ⑤ 見積・請求と財務ダッシュボードにも出る。**同じ数字なので一緒に落とす**
    qc.invalidateQueries({ queryKey: ['billing'] });
    // `['revenues']` は案件詳細（`RevenueBillingPane.tsx` の `['revenues','project',id]`）に
    // 前方一致で当たる。GPM の請求タブ（`BusinessProjectView.tsx` の
    // `['revenues-project', id]`）はハイフン区切りで前方一致しないので名指しで落とす
    // （`MobileCollect.tsx` と同じ対）
    qc.invalidateQueries({ queryKey: ['revenues'] });
    qc.invalidateQueries({ queryKey: ['revenues-project', selectedProjectId] });
    // 保存すると案件の想定金額（`projects.expected_amount`）も書き換わる
    // （`revenues.routes.ts` の PUT 末尾）。落とさないと案件詳細の事実の帯・
    // 案件台帳だけリロードするまで古い金額のまま残る
    qc.invalidateQueries({ queryKey: ['project', selectedProjectId] });
    qc.invalidateQueries({ queryKey: ['projects'] });
  };

  const createMutation = useMutation({
    mutationFn: ({ payload, revenueId }: { payload: Record<string, unknown>; revenueId: string }) =>
      revenueId ? api.put(`/revenues/${revenueId}`, payload) : api.post('/revenues', payload),
    onSuccess: () => { invalidate(); onClose(); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/revenues/${id}`),
    onSuccess: () => { invalidate(); onClose(); },
  });

  const handleDeleteRevenue = async () => {
    if (!existingRevenueId) return;
    const ok = await confirmAction({
      title: 'この売上を消しますか',
      description: '元に戻せません。請求・入金の記録も一緒に消えます。',
      confirmLabel: '消す',
      tone: 'danger',
    });
    if (ok) deleteMutation.mutate(existingRevenueId);
  };

  type SubmitError = { response?: { data?: { error?: { message?: string } } }; message?: string } | null;
  const submitError = createMutation.error as SubmitError;
  const submitErrorMessage = submitError
    ? submitError.response?.data?.error?.message || submitError.message || '登録に失敗しました'
    : '';

  const handleCreateSubmit = () => {
    if (!selectedProjectId) return;
    createMutation.mutate({
      revenueId: existingRevenueId,
      payload: {
        project_id: selectedProjectId,
        episode_id: selectedEpisodeId || null,
        customer_id: customerId,
        tax_category: taxCategory,
        amount: items.length > 0 ? itemsTotal : amount,
        recognition_date: recognitionMonth ? `${recognitionMonth}-01` : null,
        billing_date: billingDate || null,
        payment_due_date: paymentDueDate || null,
        notes: notes || null,
        items: items.length > 0 ? items : undefined,
        is_advance_payment: isAdvancePayment,
        invoice_issued: invoiceIssued,
      },
    });
  };

  const canSubmit = !blockReason && !createMutation.isPending;
  // 値引きは「対象の金額が 0 以下」だと押せない。**押しても何も起きないのをやめる**
  const discountable = items.some((it) => (it.amount || 0) > 0);

  return (
    <>
      <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent size="full" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{existingRevenueId ? '売上を更新' : '新規売上登録'}</DialogTitle>
          </DialogHeader>
          {existingRevenueId && !editing && (
            <div className="rounded-note border border-warning-border bg-warning-surface px-3 py-2 text-sub text-warning">
              この案件にはすでに売上が登録されています。内容を編集すると上書き保存されます。
            </div>
          )}

          <div className="space-y-4">
            {/* 案件・話数・税区分 — 400行の上限で別ファイル */}
            <RevenueProjectFields
              projectSearch={projectSearch}
              setProjectSearch={setProjectSearch}
              projects={projects}
              selectedProjectId={selectedProjectId}
              setSelectedProjectId={setSelectedProjectId}
              setSelectedProjectObj={setSelectedProjectObj}
              selectedProject={selectedProject}
              isProjectCategoryB={isProjectCategoryB}
              episodes={episodes}
              selectedEpisodeId={selectedEpisodeId}
              setSelectedEpisodeId={setSelectedEpisodeId}
              taxCategory={taxCategory}
              setTaxCategory={setTaxCategory}
              billingKeyPreview={billingKeyPreview}
            />

            {/* 明細行 */}
            <div className="space-y-2">
              <datalist id="revenue-item-categories">
                <option value="制作費" /><option value="機材費" /><option value="人件費" />
                <option value="スタジオ費" /><option value="配信費" /><option value="諸経費" />
              </datalist>
              <div className="flex items-center justify-between gap-2">
                <Label>明細行</Label>
                <div className="flex flex-wrap gap-2">
                  {selectedProjectId && !isProjectCategoryB && simulationItems.length > 0 && (
                    <Button type="button" variant="outline" size="sm" onClick={() => importSimulation(simulationItems)}>
                      <Download className="mr-1 h-3 w-3" />見積の積算を引用
                    </Button>
                  )}
                  <Button
                    type="button" variant="outline" size="sm"
                    onClick={() => setPricingPickerOpen(true)}
                    disabled={!selectedProjectId}
                    title={!selectedProjectId ? '案件を選んでください' : undefined}
                  >
                    <Link2 className="mr-1 h-3 w-3" />料金表から追加
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={addItem}>
                    <Plus className="mr-1 h-3 w-3" />行追加
                  </Button>
                  <Button
                    type="button" variant="outline" size="sm"
                    onClick={openGlobalDiscount}
                    disabled={!discountable}
                    title={discountable ? undefined : '値引きの対象になる明細がありません'}
                  >
                    <Percent className="mr-1 h-3 w-3" />全体値引き
                  </Button>
                </div>
              </div>

              <RevenueItemsTable
                items={items}
                itemsTotal={itemsTotal}
                flashRowIdx={flashRowIdx}
                updateItem={updateItem}
                removeItem={removeItem}
                openItemDiscount={openItemDiscount}
              />
            </div>

            {/* 明細行がないときだけ総額を直に入れる */}
            {items.length === 0 && (
              <div className="space-y-1">
                <Label>金額</Label>
                <div className="flex items-center gap-1">
                  <div className="flex-1"><CurrencyInput value={amount} onChange={(v) => setAmount(v)} /></div>
                  <TaxHelperButton fieldLabel="売上金額" defaultIncludedAmount={amount} onResult={setAmount} />
                </div>
              </div>
            )}

            {/* 日付・前金・検収・請求書発行済・備考 — 400行の上限で別ファイル */}
            <RevenueDateFields
              recognitionMonth={recognitionMonth}
              setRecognitionMonth={setRecognitionMonth}
              billingDate={billingDate}
              setBillingDate={setBillingDate}
              paymentDueDate={paymentDueDate}
              setPaymentDueDate={setPaymentDueDate}
              isAdvancePayment={isAdvancePayment}
              setIsAdvancePayment={setIsAdvancePayment}
              revenueId={existingRevenueId} inspectionDate={inspectionDate} status={editing?.status ?? primaryRevenue?.status}
              onInspectionSaved={(v) => { setInspectionDate(v); invalidate(); }} invoiceIssued={invoiceIssued}
              setInvoiceIssued={setInvoiceIssued} notes={notes} setNotes={setNotes}
            />

            {submitErrorMessage && (
              <div className="rounded-note border border-destructive-border bg-destructive-surface p-2 text-sub text-destructive">
                {submitErrorMessage}
              </div>
            )}

            {/* ⚠️ **押せない理由は必ず出す。** 灰色のボタンだけだと「壊れている」としか見えない */}
            {blockReason && <p className="text-note text-warning">{blockReason}</p>}
            <div className="flex flex-wrap gap-2 pt-2 sm:justify-between">
              <div>{/* **「消す」はスマホに出さない**（元に戻せない操作は、確認を挟んでも指では続けて押しやすい） */}
                {existingRevenueId && !isMobile && (
                  <Button variant="destructive" onClick={handleDeleteRevenue} disabled={deleteMutation.isPending}>
                    {deleteMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
                    消す
                  </Button>
                )}
              </div>
              <div className="ml-auto flex gap-2">
                <Button variant="outline" onClick={onClose}>やめる</Button>
                <Button disabled={!canSubmit} title={blockReason || undefined} onClick={handleCreateSubmit}>
                  {createMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  {existingRevenueId ? '更新' : '登録'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PricingItemPicker
        open={pricingPickerOpen}
        onOpenChange={setPricingPickerOpen}
        customerType={selectedProject?.customer_type === 'internal' ? 'internal' : 'external'}
        onSelect={pickPricingItem}
        projectId={selectedProject?.id ?? null}
      />

      <DiscountDialog
        open={discountDialog.open}
        onOpenChange={(open) => setDiscountDialog((prev) => ({ ...prev, open }))}
        mode={discountDialog.mode}
        targetDescription={discountDialog.targetDescription}
        baseAmount={discountDialog.baseAmount}
        onApply={applyDiscount}
      />
    </>
  );
}
