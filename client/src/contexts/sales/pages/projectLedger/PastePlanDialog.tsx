/**
 * 貼り付けの下見（案件台帳）— 押す前に「何がどう変わるか」を出す
 *
 * ── なぜ即座に書かないか ────────────────────────────────────
 *
 * ⚠️ **貼り付けは取り消せません。** しかも Excel からの貼り付けは
 * **貼る場所を1列ずらしただけで、まったく別の項目が書き換わります**。
 * 書いてから気づいても、どの案件が元は何だったかを持っていないので戻せません。
 *
 * → **変わるものを1行ずつ出してから**押してもらいます。
 *
 * ── 読めなかったものを必ず出す ──────────────────────────────
 *
 * 「12 か所を直しました」とだけ出して、読めなかった 3 か所を黙って捨てると、
 * **貼ったはずの値が入っていないことに誰も気づけません**。
 * 断った升目は**理由付きで**並べます（同姓同名・知らない取引先・日付の形）。
 */
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormDialog } from '@gmo-onair/shared/src/client-v4/formDialog';
import { colDef, type LedgerColKey } from './types';
import { PASTE_MAX_CELLS } from './editable';
import type { PastePlan } from './useLedgerGrid';

const label = (k: LedgerColKey) => colDef(k)?.label ?? k;

export function PastePlanDialog({
  plan, saving, onClose, onApply,
}: {
  plan: PastePlan | null;
  saving: boolean;
  onClose: () => void;
  onApply: () => void;
}) {
  if (!plan) return null;
  const rows = new Set(plan.changes.map((c) => c.id)).size;

  return (
    <FormDialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="貼り付ける前に確かめてください"
      wide
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:space-x-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>キャンセル</Button>
          {plan.tooMany === null && plan.changes.length > 0 && (
            <Button disabled={saving} onClick={onApply}>
              {saving ? '書き換えています…' : `${plan.changes.length} か所を書き換える`}
            </Button>
          )}
        </div>
      }
    >
        {plan.tooMany !== null ? (
          /* **多すぎる貼り付けは通さない。** たいてい貼る場所を間違えている */
          <p className="text-sub">
            <strong className="font-bold">{plan.tooMany} 升</strong>は多すぎます
            （一度に貼れるのは {PASTE_MAX_CELLS} 升まで）。
            この大きさの貼り付けは、たいてい**貼る場所が違っています**。
            範囲を狭めてやり直してください。
          </p>
        ) : (
          <>
            {plan.changes.length === 0 ? (
              /*
                ⚠️ **理由を取り違えないこと**（実ブラウザで見つけた）。
                「同じ値だったので変わらない」と「1つも読めなかった」は別の話で、
                いつも前者だと書くと、**読めなかったのに「同じでした」と言われます**
                （貼った人は入ったと思ってしまう）。
              */
              <p className="text-sub">
                {plan.rejected.length > 0
                  ? '書き換えられるものがありませんでした（下の理由をご覧ください）。'
                  : '変わるものがありません（貼った値が、いまの値と同じです）。'}
              </p>
            ) : (
              <>
                <p className="text-sub">
                  <strong className="font-bold">{rows} 件</strong>の案件の
                  <strong className="font-bold">{plan.changes.length} か所</strong>を書き換えます。
                  <strong className="font-bold text-warning">元に戻せません。</strong>
                </p>
                <div className="rounded-note max-h-[280px] overflow-y-auto border border-border">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-muted">
                      <tr className="text-th text-left text-muted-foreground">
                        <th className="px-3 py-1.5">案件</th>
                        <th className="px-3 py-1.5">項目</th>
                        <th className="px-3 py-1.5">いま</th>
                        <th className="px-3 py-1.5">こうする</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.changes.map((c, i) => (
                        <tr key={`${c.id}-${c.col}-${i}`} className="border-t border-border-faint">
                          <td className="text-sub max-w-[200px] truncate px-3 py-1.5" title={c.name}>{c.name}</td>
                          <td className="text-sub px-3 py-1.5">{label(c.col)}</td>
                          <td className="text-sub px-3 py-1.5 text-muted-foreground">{c.from || '（空）'}</td>
                          <td className="text-sub px-3 py-1.5 font-bold">{c.to}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/*
              ⚠️ **表からはみ出したぶんを必ず出す**（レビューでの指摘 #135）。
              前の版は黙って捨てていたので、95 行目に 20 行貼っても
              **入るぶんだけが並び**、貼った人は全部入ったと思っていました。
              **入らなかった行は画面のどこにも出ません。**
            */}
            {plan.outOfBounds && (
              <div className="rounded-note border border-warning-border bg-warning-surface px-3.5 py-2.5">
                <p className="text-sub flex items-start gap-1.5 text-warning">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    <strong className="font-bold">貼り付けた中身が表からはみ出しています。</strong>
                    {plan.outOfBounds.rows > 0 && (
                      <>
                        {' '}下の <strong className="font-number font-bold">{plan.outOfBounds.rows}</strong> 行は、
                        貼る先の行がありません。
                      </>
                    )}
                    {plan.outOfBounds.cols > 0 && (
                      <>
                        {' '}右の <strong className="font-number font-bold">{plan.outOfBounds.cols}</strong> 列は、
                        貼る先の列がありません。
                      </>
                    )}
                    {' '}
                    <strong className="font-bold">はみ出したぶんは書き込みません。</strong>
                    貼り始める升目を上（左）に寄せるか、
                    {plan.outOfBounds.rows > 0 && '次のページで残りを貼るか、'}
                    出す列を増やしてからやり直してください。
                  </span>
                </p>
              </div>
            )}

            {/* **読めなかったものを必ず出す。** 黙って捨てると気づけない */}
            {plan.rejected.length > 0 && (
              <div className="rounded-note border border-warning-border bg-warning-surface px-3.5 py-2.5">
                <p className="text-sub flex items-center gap-1.5 text-warning">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <strong className="font-bold">{plan.rejected.length} か所は書き換えません</strong>
                  （読めなかったものです）
                </p>
                <ul className="text-note mt-1.5 space-y-0.5 text-warning">
                  {plan.rejected.slice(0, 8).map((r, i) => (
                    <li key={i}>・{r.name} の「{label(r.col)}」… {r.why}</li>
                  ))}
                  {plan.rejected.length > 8 && <li>・ほか {plan.rejected.length - 8} か所</li>}
                </ul>
              </div>
            )}
          </>
        )}
    </FormDialog>
  );
}
