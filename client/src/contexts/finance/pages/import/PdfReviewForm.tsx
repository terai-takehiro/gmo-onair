/**
 * 精算 PDF を台帳に入れる前の編集フォーム (⑦ 取り込み・v4)
 *
 * **中のフィールドと送る値は変えていません。** 税抜換算 (`税込 ÷ (1+税率)`) と
 * `billing_key` の作り方はサーバー側と噛み合っており、整理のついでに触ると
 * **実際の仕入・販管費の金額がずれます**（v3.2.0 の不課税バグと同じ壊れ方）。
 * ここは値を持つだけで、登録は `PdfReviewDialog` が行います。
 *
 * あとから直したのは**並び順**（`docs/design/v4/_form-order.md`）と、それに伴う2点:
 * 役務提供完了日から**空いている計上月・支払予定日だけ**を埋めるようにしたこと、
 * **仮の間は精算番号を入力できない**ようにしたこと（財務④と同じ条件）。
 */
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { previousBusinessDay, toLocalDateStr } from '@gmo-onair/shared/src/utils/businessDays';
import { TaxCategoryLabels, taxRateOf, type Vendor } from '@/types';
import type { ProjectOption, RegistrationUnit, XpointParseResult } from './types';

/** 税込 → 税抜。**`tax-category.service` と同じ率**を使う（写すと片方だけ古くなる） */
export const taxDivisor = (cat: string): number => 1 + taxRateOf(cat);

export interface PdfFormState {
  kind: 'purchase' | 'sga';
  taxCategory: string;
  amount: number;
  description: string;
  notes: string;
  projectId: string;
  vendorId: string;
  createVendor: boolean;
  recognitionMonth: string;
  serviceCompletedDate: string;
  isProvisional: boolean;
  vendorName: string;
  recognitionDate: string;
  settlementNumber: string;
  invoiceQualified: string;
  paymentDueDate: string;
}

export function PdfReviewForm({
  f, set, result, unit,
}: {
  f: PdfFormState;
  set: <K extends keyof PdfFormState>(k: K, v: PdfFormState[K]) => void;
  result: XpointParseResult;
  unit: RegistrationUnit | undefined;
}) {
  const p = result.parsed;
  const isRakuraku = result.format === 'rakuraku';

  // **GLS発番済みではなく「受注確定済み」で絞る**（v4.1.8・矛盾修正。理由は PurchaseListPage と同じ）
  const { data: projectsData } = useQuery({
    queryKey: ['won-projects-for-purchase'],
    queryFn: async () => (await api.get('/projects/won-projects')).data,
  });
  const projectOptions = ((projectsData?.data ?? []) as ProjectOption[])
    .map((pr) => ({ value: pr.id, label: `${pr.gls_number || 'GLS未発番'} ${pr.name}` }));

  const { data: vendorsData } = useQuery({
    queryKey: ['vendors-list'],
    queryFn: async () => (await api.get('/vendors?limit=200')).data,
  });
  const vendorOptions = ((vendorsData?.data ?? []) as Vendor[]).map((vd) => ({ value: vd.id, label: vd.name }));

  /** 税区分を変えたら、この単位の税込から税抜を出し直す */
  const recalc = (cat: string) => {
    set('taxCategory', cat);
    if (unit) set('amount', Math.round(unit.amountInclusive / taxDivisor(cat)));
  };

  return (
    <>
      {/* 仕入 / 販管費 の切替 */}
      <div className="flex flex-wrap gap-2">
        <Button variant={f.kind === 'purchase' ? 'default' : 'outline'} onClick={() => set('kind', 'purchase')}>
          仕入として登録
        </Button>
        <Button variant={f.kind === 'sga' ? 'default' : 'outline'} onClick={() => set('kind', 'sga')}>
          販管費として登録
        </Button>
        {unit?.kind === 'unknown' && (
          <span className="text-note self-center text-warning">種別を判定できませんでした。選んでください。</span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {f.kind === 'purchase' ? (
          <>
            <div className="sm:col-span-2">
              <Label>案件 *</Label>
              <SearchableSelect
                options={projectOptions}
                value={f.projectId}
                onChange={(v) => set('projectId', v)}
                placeholder="管理番号・案件名で検索"
              />
              <p className="text-note mt-1 text-muted-foreground">受注（A 受注済）以降の案件だけが選べます</p>
              {!unit?.project && unit?.glsNumber && (
                <p className="text-note mt-1 text-warning">
                  管理番号 {unit.glsNumber} に一致する案件が見つかりませんでした。手で選んでください。
                </p>
              )}
            </div>
            <div className="sm:col-span-2">
              <Label>仕入先 *</Label>
              <SearchableSelect
                options={vendorOptions}
                value={f.vendorId}
                onChange={(v) => { set('vendorId', v); if (v) set('createVendor', false); }}
                placeholder="仕入先を検索"
              />
              {result.match.vendor && (
                <p className="text-note mt-1 text-success">
                  「{result.match.vendor.name}」に自動一致
                  （{result.match.vendor.matched_by === 'invoice_number' ? '適格事業者番号' : '名称'}）
                </p>
              )}
              {!result.match.vendor && result.match.vendorCandidates.length > 0 && (
                <p className="text-note mt-1 text-warning">
                  候補: {result.match.vendorCandidates.map((c) => c.name).join(' / ')} — 上の検索から選んでください
                </p>
              )}
              {isRakuraku && (
                <p className="text-note mt-1 text-muted-foreground">
                  楽楽精算は従業員立替なので、立替経費用の仕入先を選んでください。
                </p>
              )}
              {!f.vendorId && p?.vendorName && (
                <label className="text-note mt-1 flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={f.createVendor}
                    onChange={(e) => set('createVendor', e.target.checked)}
                  />
                  仕入先「{p.vendorName}」を新しく作って登録する
                </label>
              )}
            </div>
          </>
        ) : (
          <div className="sm:col-span-2">
            <Label>支払先 *</Label>
            <Input value={f.vendorName} onChange={(e) => set('vendorName', e.target.value)} />
          </div>
        )}

        <div>
          <Label>税区分</Label>
          <Select value={f.taxCategory} onValueChange={recalc}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(TaxCategoryLabels).map(([k, label]) => (
                <SelectItem key={k} value={k}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-note mt-1 text-muted-foreground">
            {isRakuraku ? '明細の税区分から自動で判定しました。' : 'X-Point の金額は税込表記なので 10% を仮定しています。'}
            変えると税込 {unit ? formatCurrency(unit.amountInclusive) : '—'} から税抜を計算し直します
          </p>
        </div>
        <div>
          <Label>金額（税抜）*</Label>
          <CurrencyInput value={f.amount} onChange={(v) => set('amount', v)} />
          {unit && (
            <p className="text-note mt-1 text-muted-foreground">
              税込 {formatCurrency(unit.amountInclusive)} ÷ {String(taxDivisor(f.taxCategory))}
              {' = '}{formatCurrency(Math.round(unit.amountInclusive / taxDivisor(f.taxCategory)))}
            </p>
          )}
        </div>

        {/* 日付はここに一列にまとめる。**モードで置き場所を変えない** —
            着手前は販管費だと発生日が支払先の隣（上部）、仕入だと計上月が下部にあり、
            切り替えるたびに日付の位置が飛んでいた。
            仕入は 役務提供完了日 → 計上月・支払予定日 の順（財務④・GPM と同じ）で、
            **役務日を入れたら空の欄だけ自動で埋める** */}
        {f.kind === 'purchase' ? (
          <>
            <div className="sm:col-span-2">
              <Label>役務提供完了日</Label>
              <Input
                type="date"
                value={f.serviceCompletedDate}
                onChange={(e) => {
                  const val = e.target.value;
                  set('serviceCompletedDate', val);
                  if (!val) return;
                  const [y, m] = val.split('-').map(Number);
                  if (!y || !m) return;
                  // **空のときだけ入れる。** 人が直した計上月・支払予定日を
                  // あとから役務日を入れ直しただけで書き戻さない
                  if (!f.recognitionMonth) set('recognitionMonth', `${y}-${String(m).padStart(2, '0')}`);
                  // 翌月末が土日祝のときは前営業日に調整（財務④・GPM と同じ規則）
                  if (!f.paymentDueDate) set('paymentDueDate', toLocalDateStr(previousBusinessDay(new Date(y, m + 1, 0))));
                }}
              />
              <p className="text-note mt-1 text-muted-foreground">
                入力すると、空いている計上月（当月）・支払予定日（翌月末、土日祝は前営業日）を埋めます
              </p>
            </div>
            <div>
              <Label>計上月</Label>
              <Input type="month" value={f.recognitionMonth} onChange={(e) => set('recognitionMonth', e.target.value)} />
            </div>
          </>
        ) : (
          <div>
            <Label>発生日（計上日）*</Label>
            <Input type="date" value={f.recognitionDate} onChange={(e) => set('recognitionDate', e.target.value)} />
          </div>
        )}
        <div>
          <Label>支払予定日</Label>
          <Input type="date" value={f.paymentDueDate} onChange={(e) => set('paymentDueDate', e.target.value)} />
        </div>

        <div>
          <Label>インボイス</Label>
          <Select value={f.invoiceQualified} onValueChange={(v) => set('invoiceQualified', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="qualified">適格事業者</SelectItem>
              <SelectItem value="unqualified">非適格</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 仮 → 精算番号 の順。**仮の間は精算番号を入力できない**ので効く相手の直上に置き、
            2つが必ず同じ行に並ぶよう1つの枠にまとめている
            （着手前は仮がインボイスの右隣にあり、精算番号とは連動もしていなかった。
            `docs/design/v4/_form-order.md` 2-1） */}
        <div className="sm:col-span-2 flex flex-col gap-3">
          {f.kind === 'purchase' && (
            <label className="text-sub flex cursor-pointer items-center gap-2">
              <Switch
                checked={f.isProvisional}
                onCheckedChange={(v) => {
                  set('isProvisional', v);
                  // **仮にしたら精算番号を消す。** 入力欄を `disabled` にするだけだと、
                  // PDF から読み取った番号が残ったまま送られ、「仮なのに精算番号が付いた仕入」に
                  // なる（しかも仮の間は消せない）。画面が「この2つは両立しない」と言っている
                  // 以上、値も合わせる（Codex のレビュー指摘 P2）
                  if (v) set('settlementNumber', '');
                }}
              />
              仮（見込みの仕入）
            </label>
          )}
          <div>
            <Label>精算番号（{isRakuraku ? '楽楽精算' : 'X-Point'}）</Label>
            <div className="flex items-center gap-1">
              <span className="text-sub text-muted-foreground">{isRakuraku ? '楽' : 'X'}-</span>
              <Input
                value={f.settlementNumber}
                onChange={(e) => set('settlementNumber', e.target.value)}
                placeholder={f.isProvisional ? '仮の間は入力できません' : undefined}
                disabled={f.isProvisional}
              />
            </div>
          </div>
        </div>

        <div className="sm:col-span-2">
          <Label>{f.kind === 'purchase' ? '説明' : '詳細'}</Label>
          <Input value={f.description} onChange={(e) => set('description', e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label>備考</Label>
          <Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} rows={4} />
        </div>
      </div>
    </>
  );
}
