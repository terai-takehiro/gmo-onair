/**
 * カテゴリごとの小計（仕様変更 #11 ＋ 9/2 要望「値引きはカテゴリ毎に小計して出す」）
 *
 * `EstimateItems.tsx` から切り出した（同ファイルが 400 行の上限に張り付いており、
 * 小計を1行から3行に増やすとそのまま超えるため）。
 *
 * ── なぜ集計を関数として分けて export するのか ────────────────────
 *
 * 見積書 PDF（`server/src/contexts/sales/services/estimate-pdf.service.ts`）は
 * **定価で行を印字し、差額を同じカテゴリの値引き行として足す**形で同じ3段
 * （定価小計 / 値引き / 小計）を出します。片方だけ直すと**同じ見積の小計が
 * 画面と紙で違う**のに、型検査にも lint にも出ません。ここを純粋な関数にして
 * `shared/tests/estimateItemListPrice.test.ts` から固定できるようにしています。
 */
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import type { EstimateItemRow } from './EstimateItems';

/**
 * 1カテゴリぶんの「定価の合計 / 実額の合計 / その差＝値引き」。
 *
 * ⚠️ **足し算だけで作る**（按分・割り算・率は一切使わない）。紙と同じ整数を
 * 同じ順に足すので、カテゴリごとに分けても合計は元の値引き総額と 1 円も違わない。
 */
export function categoryTotals(rows: EstimateItemRow[]): { list: number; net: number; discount: number } {
  let list = 0;
  let net = 0;
  for (const it of rows) {
    const qty = Math.max(0, it.quantity);
    // 定価が無い行・定価が実額以下の行は「値引きしていない」＝実額をそのまま定価とみなす。
    // 手で足した値引き行（単価がマイナス）は `Math.max(0, ...)` で定価側に積まない —
    // 積むと定価の合計がその行のぶん小さくなり、値引きが二重に効いて見える
    const listUnit = it.list_unit_price != null && it.list_unit_price > it.unit_price
      ? it.list_unit_price
      : it.unit_price;
    list += Math.max(0, qty * Math.round(listUnit));
    net += it.amount;
  }
  return { list, net, discount: list - net };
}

/** 小計の1行（札と金額）。3段のときも1段のときも同じ形で並べる */
function Line({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="text-sub-sm text-muted-foreground">{label}</span>
      <Money value={value} negativeIsDanger={danger} className="text-sub-sm w-28 shrink-0" />
    </div>
  );
}

/**
 * カテゴリ小計。値引きがある帯だけ「定価小計 / 値引き / 小計」の3段にする。
 *
 * 値引きが無い帯は**今までどおり「小計（◯◯）」の1行だけ** — 値引きの無い見積で
 * 帯が3倍に伸びると、明細そのものより小計のほうが目立つため。
 *
 * 見積全体の値引き（`estimates.discount`）はここでは引かない（どのカテゴリの
 * 値引きでもない・見積全体に掛かる別の数。混ぜると帯の小計が明細の額と合わなくなる）。
 */
export function EstimateCategorySubtotal({ label, rows }: { label: string; rows: EstimateItemRow[] }) {
  const t = categoryTotals(rows);
  return (
    <div className="flex flex-col gap-0.5 border-t border-border-faint bg-surface-subtle px-4 py-1.5">
      {t.discount > 0 && (
        <>
          <Line label={`定価小計（${label}）`} value={t.list} />
          <Line label={`値引き（${label}）`} value={-t.discount} danger />
        </>
      )}
      <Line label={`小計（${label}）`} value={t.net} danger />
    </div>
  );
}
