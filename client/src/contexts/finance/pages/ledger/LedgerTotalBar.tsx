/**
 * 台帳の合計帯（スマホ・上に貼り付く）(v4)
 *
 * 台帳は「いくらあるか」を見に来る画面なので、**スクロールしても消えない位置**
 * ＝いちばん上に貼り付けます。PC はいちばん下の `LedgerFooter` が同じ数字を
 * 持っているので、スマホでは `hideTotals` で注記だけにして**同じ数字を上下
 * 2か所に出しません**。
 *
 * ⚠️ **数字はサーバーが絞り込み全体で数えたもの**（`total_amount` /
 * `pagination.total`）。並んでいる20行を足すと、ページをめくるたびに
 * 数字が変わって読み違えます。
 *
 * ⚠️ `sticky` はスクロールする祖先（共通シェルの `<main>`）に対して効きます。
 * 途中に `transform` や `overflow-hidden` を持つ要素が挟まると**黙って
 * 効かなくなります**が、そのときも**ただの帯として残る**ので数字は読めます
 * （機能は失わない形にしてある）。
 */
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { manYen } from '@gmo-onair/shared/src/client/ui/numbers';

export function LedgerTotalBar({ count, total }: { count: number; total: number }) {
  return (
    <div className="rounded-card sticky top-0 z-10 flex items-baseline justify-between gap-2 border border-border bg-card px-4 py-2.5">
      <span className="text-sub text-muted-foreground">
        全 <span className="font-number font-bold text-foreground">{count.toLocaleString()}</span> 件
      </span>
      <span className="text-right">
        <span className="text-sub block text-muted-foreground">合計（税抜）</span>
        <Money value={total} inline className="text-h2" />
        {/* 桁の確かめ用。1桁ずれれば万の位が10倍違うので、見た瞬間に分かる */}
        <span className="text-note font-number block text-muted-foreground">{manYen(total)}</span>
      </span>
    </div>
  );
}
