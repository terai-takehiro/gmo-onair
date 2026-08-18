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
 */
import { useState } from 'react';
import { Plus, Trash2, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { Row, RowHeader, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import PricingItemPicker, { type PickedPricingItem } from '@/contexts/finance/components/PricingItemPicker';

export interface EstimateItemRow {
  id?: string; description: string; quantity: number; unit: string | null;
  unit_price: number; amount: number; cost: number; category: string | null;
  /** 行の備考（migration 138 の既存列。サーバーはすでに読み書きしている） */
  item_notes?: string | null;
  /** 行の日付（スタジオ利用日・機材の使用日など。任意・migration 194） */
  item_date?: string | null;
  /** 料金表から選んだ品目（migration 172）。手入力の行は null */
  pricing_item_id?: string | null;
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

/** v4 の3グループ (docs/design/v4 — 明細はこの3つで見せる) */
const CATEGORIES: { key: string; label: string }[] = [
  { key: 'studio', label: 'スタジオ' },
  { key: 'tech', label: '技術・人員' },
  { key: 'other', label: '制作・その他' },
];

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
  estimate, onSave, saving,
}: { estimate: EstimateForItems; onSave: (items: EstimateItemRow[]) => void; saving: boolean }) {
  const [items, setItems] = useState<EstimateItemRow[]>(estimate.items ?? []);
  const [pickerCategory, setPickerCategory] = useState<string | null>(null);
  const m = margin(items, estimate.discount);
  const locked = estimate.status === 'sent' || estimate.status === 'accepted' || estimate.status === 'superseded';
  const customerType = estimate.customer_type === 'internal' ? 'internal' : 'external';

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
    }]);
  };

  return (
    <div className="rounded-card border border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-4 py-3">
        <h2 className="text-cardtitle">v{estimate.version} の明細</h2>
        {locked && (
          <span className="text-sub text-warning">
            出したあと（または旧版）なので直せません。直すなら次の版をつくってください。
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

      {!locked && (
        <RowHeader className="hidden sm:flex">
          <RowMain>品目 / 備考</RowMain>
          <RowSlot w={72}>数量</RowSlot>
          <RowSlot w={128}>単価</RowSlot>
          <RowSlot w={128}>仕入（見込み）</RowSlot>
          <RowSlot w={128}>日付</RowSlot>
          <RowSlot w={128} align="right">金額</RowSlot>
          <RowSlot w={56} />
        </RowHeader>
      )}

      {CATEGORIES.map((c) => {
        const rows = items.map((it, i) => ({ it, i })).filter(({ it }) => (it.category ?? 'other') === c.key);
        if (rows.length === 0 && locked) return null;
        return (
          <div key={c.key} className="border-b border-border-faint last:border-b-0">
            <p className="text-th bg-surface-subtle px-4 py-2 text-muted-foreground">{c.label}</p>
            {rows.map(({ it, i }) => (
              <Row key={i} divider stackOnMobile align="center">
                <RowMain>
                  <Input value={it.description} disabled={locked} placeholder="品目"
                    onChange={(e) => upd(i, { description: e.target.value })} />
                  {(!locked || it.item_notes) && (
                    <Input value={it.item_notes ?? ''} disabled={locked} placeholder="この行の備考"
                      aria-label="この行の備考"
                      className="mt-1 text-sub-sm"
                      onChange={(e) => upd(i, { item_notes: e.target.value })} />
                  )}
                </RowMain>
                <RowSlot w={72}>
                  <Input type="number" value={it.quantity} disabled={locked} aria-label="数量"
                    onChange={(e) => upd(i, { quantity: Number(e.target.value) || 0 })} />
                </RowSlot>
                <RowSlot w={128}>
                  <Input type="number" value={it.unit_price} disabled={locked} aria-label="単価"
                    onChange={(e) => upd(i, { unit_price: Number(e.target.value) || 0 })} />
                </RowSlot>
                <RowSlot w={128}>
                  <Input type="number" value={it.cost} disabled={locked} aria-label="仕入 (見込み)"
                    onChange={(e) => upd(i, { cost: Number(e.target.value) || 0 })} />
                </RowSlot>
                <RowSlot w={128}>
                  <Input type="date" value={it.item_date ?? ''} disabled={locked} aria-label="この行の日付"
                    onChange={(e) => upd(i, { item_date: e.target.value || null })} />
                </RowSlot>
                <Money value={it.amount} className="text-sub w-32 shrink-0" />
                {!locked && (
                  <RowSlot w={56} align="right">
                    <Button variant="ghost" size="sm" aria-label="この行を消す"
                      onClick={() => setItems((prev) => prev.filter((_, n) => n !== i))}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
                    </Button>
                  </RowSlot>
                )}
              </Row>
            ))}
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
              </div>
            )}
          </div>
        );
      })}

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
