/**
 * 見積の明細（**案件とプロジェクトで同じ部品**）
 *
 * ── 写しを作らない ──────────────────────────────────────────
 *
 * プロジェクト管理（GPM）の見積は `estimates` を案件と共用しています
 * （migration 173）。明細の入力までここに1つ置くのは、**合計と粗利の計算を
 * 2か所に持たない**ためです。写すと、片方だけ直した日から
 * 同じ見積が画面によって違う金額を出します。
 *
 * 呼ぶ側が渡すのは「読む口」と「保存する口」だけで、
 * 計算・並び・止め方（出したあとは直せない）はここが決めます。
 *
 * ── 並べ替え（要望⑤） ───────────────────────────────────────
 *
 * ドラッグで並べ替えた**配列順がそのまま `sort_order`**（サーバー側
 * `replaceItems` は渡された配列の順に振り直す。並べ替え自体は画面の
 * state をローカルに動かすだけで、保存は今までどおり「明細を保存する」を
 * 押したときの一括保存に乗る）。**カテゴリをまたぐ並べ替えは行わない** —
 * 行はカテゴリ別の帯に分けて描いており、越境させると
 * 「なぜこのカテゴリに移ったのか」を保存前に判断させることになるため。
 *
 * ── グループ内案件だけの2つの拡張（仕様変更 #9・#10） ────────────
 *
 * `allowListPriceEdit`・`allowCategoryDiscount` は**グループ内案件**
 * （`projects.customer_type === 'internal'`。取引先マスターの
 * `companies.is_gmo_group` から保存のたびに導く値）の見積で ON になります。
 *
 * ⚠️ **「グループ内案件」＝「プロジェクト管理(GPM)」ではありません。**
 * v4.5.19 でここを取り違え、GPM の見積タブからだけ `true` を渡したため、
 * ユーザーが実際に使う案件管理の見積タブには定価の編集欄も値引き行のボタンも
 * 出ていませんでした。**既定は下の `customer_type` から決め**、prop は
 * 「`customer_type` を持たない画面（GPM）からの明示的な上書き」に限ります。
 *
 * 増える見た目は「表示のことば」と「ボタンの有無」だけで、計算
 * （`margin`・保存の合計）には一切関わりません — 定価は最後まで表示・
 * PDF 印字専用のまま、値引き行は既存の「行を足す」と同じ経路を通るだけです。
 */
import { useState } from 'react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { Plus, Link2, Percent } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { RowHeader, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import PricingItemPicker, { type PickedPricingItem } from '@/contexts/finance/components/PricingItemPicker';
import { EstimateItemRowView } from './EstimateItemRow';
import { EstimateCategorySubtotal } from './EstimateCategorySubtotal';

export interface EstimateItemRow {
  id?: string; description: string; quantity: number; unit: string | null;
  unit_price: number; amount: number; cost: number; category: string | null;
  /** 行の備考（migration 138 の既存列。サーバーはすでに読み書きしている） */
  item_notes?: string | null;
  /** 行の日付（開始日。スタジオ利用日・機材の使用日など。任意・migration 194） */
  item_date?: string | null;
  /** 行の終了日（任意・`item_date` とセット。migration 235）。無ければ単日扱い */
  item_date_end?: string | null;
  /** 料金表から選んだ品目（migration 172）。手入力の行は null */
  pricing_item_id?: string | null;
  /**
   * 定価（カタログ選択時のみ入る。手入力の行は null。migration 261）。
   * **表示・PDF 印字専用** — 保存はするが、粗利・合計の計算には使わない
   * （実際に課金する額は `unit_price` のまま）。
   *
   * ⚠️ **グループ内案件（`customer_type === 'internal'`）の見積だけ、この列を
   * 人が直接編集できます**（仕様変更 #9・`allowListPriceEdit`）。グループ外の
   * 案件ではカタログ選択時に自動で入る値のまま表示専用（`EstimateItemRow.tsx`）。
   */
  list_unit_price?: number | null;
}

/** 明細を持つ見積のうち、この部品が見るところだけ */
export interface EstimateForItems {
  id: string;
  version: number;
  status: string;
  discount: number;
  items?: EstimateItemRow[];
  /** 料金表の場所ヒント・グループ内価格判定のために渡す（無ければ料金表ボタンは出さない） */
  project_id?: string;
  customer_type?: string | null;
}

/**
 * v4 の既定3グループ (docs/design/v4 — 明細はこの3つで見せる)。
 *
 * ⚠️ **この3つの鍵・札は増減・改名しないこと**（`shared/tests/estimateCategory.test.ts`
 * が PDF 側 `ESTIMATE_CATEGORY_LABEL` と1対1で突き合わせる）。任意の名前のカテゴリは
 * 下の `allCategories`（この配列 + 明細に実際に入っている未知の値）で足す —
 * `estimate_items.category` は元々自由な TEXT 列で、サーバー側の
 * `categoryLabel()`（PDF）も「知らない値はそのまま出す」設計なので、
 * この配列自体を自由入力にする必要は無い（増やすとテストの前提が壊れる）。
 */
const CATEGORIES: { key: string; label: string }[] = [
  { key: 'studio', label: 'スタジオ' },
  { key: 'tech', label: '技術・人員' },
  { key: 'other', label: '制作・その他' },
];

/** 数量の単位の候補（`<datalist>`）。**自由入力も許す** — この4つに縛らない */
const UNIT_OPTIONS = ['人', '時間', '日', '式'];

/** 粗利率。**30% を切ると赤くするが保存は止めない** (_rules.md「フォームの決めごと」) */
function margin(items: EstimateItemRow[], discount: number): { profit: number; rate: number | null } {
  const sales = items.reduce((s, i) => s + i.amount, 0) - discount;
  const cost = items.reduce((s, i) => s + i.cost, 0);
  const profit = sales - cost;
  return { profit, rate: sales > 0 ? Math.round((profit / sales) * 100) : null };
}

/**
 * 明細。**粗利率がその場で動きます** (行ごとに仕入の見込みを入れる)。
 * 30% を切ると赤くなりますが**保存は止めません** — 止めると、赤字でも
 * 出さざるを得ない案件のときに保存できなくなるためです。
 */
export function EstimateItems({
  estimate, onSave, saving, canEdit, allowListPriceEdit, allowCategoryDiscount,
}: {
  estimate: EstimateForItems; onSave: (items: EstimateItemRow[]) => void; saving: boolean;
  /**
   * `sales` の editor 権限（サーバー PUT '/:id/items' の必須条件と揃える）。
   * `false` のときは状態（`locked`）に関わらず直せない — reader に「押せるのに403」の
   * ボタンを出さないため（EstimateTab.tsx から渡す）
   */
  canEdit: boolean;
  /**
   * `list_unit_price`（定価）を明細内で編集できるようにするか（仕様変更 #9）。
   * **省略時はグループ内案件（`customer_type === 'internal'`）で自動的に ON**。
   * 渡すのは `customer_type` を持たない画面（GPM）からの上書きのときだけ。
   * `EstimateItemRowView` に渡すだけで、計算（`margin`・保存の合計）には関わらない。
   */
  allowListPriceEdit?: boolean;
  /**
   * カテゴリごとに「値引き行を追加」ボタンを出すか（仕様変更 #10）。
   * 既定は `allowListPriceEdit` と同じ（グループ内案件で ON）。
   *
   * ── 設計判断: 新しい列は足さない ──────────────────────────
   * `estimates.discount` は見積全体で1つの値引きしか表せないが、
   * `estimate_items.category` はもともと自由な TEXT 列・`unit_price` はもともと
   * 負の値も弾いていない（サーバー `replaceItems` も `Math.round` するだけで
   * 符号は見ない）。つまり**「値引き」の行をそのカテゴリの中に追加するだけで、
   * 表示専用の値引きが最小変更で実現できる**。`estimates` に `category_discounts`
   * のような JSONB 列を新設すると、PDF・画面・保存の3か所で「通常の行の小計」と
   * 「JSONB の値引き」を合成する経路が新たに要り、既存の「値引きは単価を下げず
   * 別建て」という設計とも二重に持つことになる。行として持たせれば、下の
   * カテゴリ小計（`EstimateCategorySubtotal`）にも `estimate-pdf.service.ts` の
   * 帯にも**何も直さず**そのまま反映される。
   */
  allowCategoryDiscount?: boolean;
}) {
  const [items, setItems] = useState<EstimateItemRow[]>(estimate.items ?? []);
  const [pickerCategory, setPickerCategory] = useState<string | null>(null);
  /** カテゴリの自由入力欄（②「④ カテゴリの自由入力」）。押すまでは何も作らない */
  const [newCategoryName, setNewCategoryName] = useState('');
  const m = margin(items, estimate.discount);
  const statusLocked = estimate.status === 'sent' || estimate.status === 'accepted' || estimate.status === 'superseded';
  const locked = statusLocked || !canEdit;
  const customerType = estimate.customer_type === 'internal' ? 'internal' : 'external';
  /**
   * 定価の編集欄・カテゴリ値引きの既定は**この見積の案件がグループ内かどうか**で決める
   * （`??` なので、呼び手が明示した `true`/`false` はそのまま勝つ）。
   * 呼び手任せにしていたために、案件管理の見積タブでは両方とも出ていなかった。
   */
  const listPriceEditable = allowListPriceEdit ?? customerType === 'internal';
  const categoryDiscountEnabled = allowCategoryDiscount ?? customerType === 'internal';

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /**
   * 既定3つ + 明細に実際に入っている未知のカテゴリ（自由入力で足したもの・
   * 古いデータで既に入っていたもの）。**`CATEGORIES` 自体は増やさない**
   * （上のコメント参照）— 表示する塊をここで合成する。
   */
  const allCategories = [
    ...CATEGORIES,
    ...Array.from(new Set(
      items
        .map((it) => it.category)
        .filter((c): c is string => !!c && !CATEGORIES.some((cat) => cat.key === c)),
    )).map((key) => ({ key, label: key })),
  ];

  const upd = (i: number, patch: Partial<EstimateItemRow>) =>
    setItems((prev) => prev.map((it, n) => {
      if (n !== i) return it;
      const next = { ...it, ...patch };
      next.amount = Math.max(0, next.quantity) * Math.round(next.unit_price);
      return next;
    }));

  const addFromPricing = (category: string, picked: PickedPricingItem) => {
    setItems((prev) => [...prev, {
      description: picked.sub_label ? `${picked.name}（${picked.sub_label}）` : picked.name,
      quantity: 1, unit: null, unit_price: picked.unit_price,
      amount: picked.unit_price, cost: 0, category,
      pricing_item_id: picked.pricing_item_id,
      // **グループ内価格でも定価を保存しておく**（要望③）。手入力の行と違い、
      // カタログに定価があれば必ず入る — 表示は EstimateItemRowView が判断する
      list_unit_price: picked.list_unit_price,
    }]);
  };

  /**
   * 任意の名前のカテゴリを足す（要望④）。DB の `category` は元々自由な TEXT 列
   * なので保存自体はこれまでも通っていた — ここは**画面から作る導線**を足すだけ。
   * 空の行を1つ作ってそのカテゴリで開始する（他のカテゴリの「行を足す」と同じ形）。
   */
  const addCustomCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;
    setItems((prev) => [...prev,
      { description: '', quantity: 1, unit: null, unit_price: 0, amount: 0, cost: 0, category: name }]);
    setNewCategoryName('');
  };

  /**
   * カテゴリの中に値引き行を1つ足す（仕様変更 #10・GPM限定）。
   * 「◯◯に行を足す」と全く同じ形で、説明欄に「値引き」を仕込むだけ —
   * 単価をマイナスで入れれば `amount` が自動でマイナスになり（`upd` と同じ経路）、
   * 下のカテゴリ小計（仕様変更 #11）にそのまま反映される。新しい保存先は増やさない。
   */
  const addCategoryDiscount = (category: string) => {
    setItems((prev) => [...prev,
      { description: '値引き', quantity: 1, unit: null, unit_price: 0, amount: 0, cost: 0, category }]);
  };

  /**
   * 1行の期間（開始・終了）を全行に一括反映する（要望①）。
   * **カテゴリを問わず明細全体に効く** — 期間はカテゴリと無関係な情報のため
   * （撮影期間をスタジオ・技術どちらの行にも同じ日付で入れたい、という要望）。
   */
  const copyPeriodToAll = (i: number) => {
    const { item_date, item_date_end } = items[i];
    setItems((prev) => prev.map((it) => ({ ...it, item_date: item_date ?? null, item_date_end: item_date_end ?? null })));
  };

  /**
   * ドラッグでの並べ替え（要望⑤）。`id` は明細の**全体配列の中の位置**
   * （`String(i)`）— ドラッグ中は state を動かさないので、同じ操作の中では
   * ずっと同じ行を指す（`KanbanView.tsx` の考え方と同じ）。
   * **別カテゴリの行の上に落としたときは何もしない** — カテゴリは帯で
   * 分けて描いているので、越境した並べ替えは「カテゴリが変わった」のか
   * 「順番だけ変えたい」のか画面から読み取れない。
   */
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = Number(active.id);
    const newIndex = Number(over.id);
    setItems((prev) => {
      if (Number.isNaN(oldIndex) || Number.isNaN(newIndex)) return prev;
      if ((prev[oldIndex]?.category ?? 'other') !== (prev[newIndex]?.category ?? 'other')) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  return (
    <div className="rounded-card border border-border bg-card">
      {/* 単位の入力候補（要望②）。画面に見えない — `<Input list>` から参照するだけ */}
      <datalist id="estimate-item-units">
        {UNIT_OPTIONS.map((u) => <option key={u} value={u} />)}
      </datalist>

      <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-4 py-3">
        <h2 className="text-cardtitle">v{estimate.version} の明細</h2>
        {statusLocked && (
          <span className="text-sub text-warning">
            出したあと（または旧版）なので直せません。直すなら次の版をつくってください。
          </span>
        )}
        {!statusLocked && !canEdit && (
          <span className="text-sub text-warning">
            閲覧のみの権限です。明細の保存には案件管理の編集権限が必要です。
          </span>
        )}
        <div className="ml-auto flex items-center gap-4">
          <span className="text-sub text-muted-foreground">粗利</span>
          <Money value={m.profit} className={`text-list w-32 ${m.rate !== null && m.rate < 30 ? 'text-destructive' : ''}`} />
          {m.rate !== null && (
            <span className={`text-list font-number ${m.rate < 30 ? 'text-destructive' : 'text-muted-foreground'}`}>
              {m.rate}%
            </span>
          )}
        </div>
      </div>

      {/*
        表頭は編集できるとき「だけ」ではなく**常に**出す（要望③）。以前は `!locked`
        の間しか出しておらず、送付済み・閲覧のみで入力欄が disabled のまま並ぶと
        「数量」「金額」「仕入」がどの数字か表せていなかった（ユーザー指摘）。
        削除ボタン・期間コピー列・ドラッグハンドル列は編集できるときにしか出ない列
        なので、表頭側もその3つだけ `!locked` で出し分けて body と揃える。
      */}
      <RowHeader className="hidden sm:flex">
        {!locked && <RowSlot w={56} />}
        <RowMain>品目 / 備考</RowMain>
        <RowSlot w={96}>数量 / 単位</RowSlot>
        <RowSlot w={128}>単価（税抜）</RowSlot>
        <RowSlot w={128}>仕入（見込み）</RowSlot>
        <RowSlot w={128}>開始日</RowSlot>
        <RowSlot w={128}>終了日</RowSlot>
        {!locked && <RowSlot w={56} />}
        <RowSlot w={128} align="right">金額（数量×単価）</RowSlot>
        {!locked && <RowSlot w={56} />}
      </RowHeader>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        {allCategories.map((c) => {
          const rows = items.map((it, i) => ({ it, i })).filter(({ it }) => (it.category ?? 'other') === c.key);
          if (rows.length === 0 && locked) return null;
          return (
            <div key={c.key} className="border-b border-border-faint last:border-b-0">
              <p className="text-th bg-surface-subtle px-4 py-2 text-muted-foreground">{c.label}</p>
              <SortableContext items={rows.map(({ i }) => String(i))} strategy={verticalListSortingStrategy}>
                {rows.map(({ it, i }) => (
                  <EstimateItemRowView
                    key={i} id={String(i)} it={it} i={i} locked={locked}
                    allowListPriceEdit={listPriceEditable}
                    onUpdate={upd}
                    onDelete={(n) => setItems((prev) => prev.filter((_, k) => k !== n))}
                    onCopyPeriod={copyPeriodToAll}
                  />
                ))}
              </SortableContext>
              {/* カテゴリ小計（値引きがある帯は「定価小計 / 値引き / 小計」の3段。
                  中身は `EstimateCategorySubtotal.tsx`・紙と同じ足し方） */}
              {rows.length > 0 && (
                <EstimateCategorySubtotal label={c.label} rows={rows.map(({ it }) => it)} />
              )}
              {!locked && (
                <div className="flex flex-wrap gap-2 px-4 py-2">
                  <Button variant="outline" size="sm" onClick={() => setItems((prev) => [...prev,
                    { description: '', quantity: 1, unit: null, unit_price: 0, amount: 0, cost: 0, category: c.key }])}>
                    <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />{c.label}に行を足す
                  </Button>
                  {estimate.project_id && (
                    <Button variant="outline" size="sm" onClick={() => setPickerCategory(c.key)}>
                      <Link2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />料金表から選ぶ
                    </Button>
                  )}
                  {categoryDiscountEnabled && (
                    <Button variant="outline" size="sm" onClick={() => addCategoryDiscount(c.key)}>
                      <Percent className="mr-1 h-3.5 w-3.5" aria-hidden="true" />{c.label}に値引き行を追加
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </DndContext>

      {!locked && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border-faint px-4 py-3">
          <span className="text-sub text-muted-foreground">カテゴリを追加</span>
          <Input value={newCategoryName} placeholder="例: 音響、車両"
            aria-label="新しいカテゴリの名前"
            className="w-40"
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomCategory(); } }} />
          <Button variant="outline" size="sm" disabled={!newCategoryName.trim()} onClick={addCustomCategory}>
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />追加
          </Button>
        </div>
      )}

      {!locked && (
        <div className="flex items-center gap-3 border-t border-border-subtle px-4 py-3">
          <span className="text-sub text-muted-foreground">合計（税抜）</span>
          <Money value={items.reduce((s, i) => s + i.amount, 0) - estimate.discount} className="text-list w-40" />
          <Button className="ml-auto" disabled={saving} onClick={() => onSave(items)}>明細を保存する</Button>
        </div>
      )}

      {pickerCategory && (
        <PricingItemPicker
          open={!!pickerCategory}
          onOpenChange={(open) => { if (!open) setPickerCategory(null); }}
          customerType={customerType}
          projectId={estimate.project_id}
          onSelect={(picked) => addFromPricing(pickerCategory, picked)}
        />
      )}
    </div>
  );
}
