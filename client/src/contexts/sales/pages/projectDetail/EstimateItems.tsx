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
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { Row, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';

export interface EstimateItemRow {
  id?: string; description: string; quantity: number; unit: string | null;
  unit_price: number; amount: number; cost: number; category: string | null;
}

/** 明細を持つ見積のうち、この部品が見るところだけ */
export interface EstimateForItems {
  id: string;
  version: number;
  status: string;
  discount: number;
  items?: EstimateItemRow[];
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
  const m = margin(items, estimate.discount);
  const locked = estimate.status === 'sent' || estimate.status === 'accepted' || estimate.status === 'superseded';

  const upd = (i: number, patch: Partial<EstimateItemRow>) =>
    setItems((prev) => prev.map((it, n) => {
      if (n !== i) return it;
      const next = { ...it, ...patch };
      next.amount = Math.max(0, next.quantity) * Math.round(next.unit_price);
      return next;
    }));

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
              <div className="px-4 py-2">
                <Button variant="outline" size="sm" onClick={() => setItems((prev) => [...prev,
                  { description: '', quantity: 1, unit: null, unit_price: 0, amount: 0, cost: 0, category: c.key }])}>
                  <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />{c.label}に行を足す
                </Button>
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
    </div>
  );
}
