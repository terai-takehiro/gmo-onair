/**
 * 整合性の確認 — 「v4 より前のデータが揃っているか」を数えて出す（案件台帳）
 *
 * ── なぜ画面のいちばん上にあるか ────────────────────────────
 *
 * v4 で列を足し、決めごとを増やしました（2段分類・リード経路・GLS の発番の段）。
 * **既にあった案件はその決めごとを知らないまま残っています。** しかも
 * **表を眺めても分かりません** — 空欄は空欄として普通に並ぶだけです。
 *
 * → **何が・全体で何件おかしいか**をここに出し、押すとその案件だけに絞ります。
 *
 * ── 決めごと ────────────────────────────────────────────────
 *
 *  ・**件数はサーバーが絞り込み全体で数えます**（`GET /projects/integrity`）。
 *    画面で並んだ行を数えると **100 件目までしか数えられず**、
 *    「これで全部だ」と読まれます
 *  ・**規則の文はサーバーが持ちます**（`why` / `how`）。画面に書き写すと、
 *    片方だけ直った日から**画面の説明と実際に数えているものが食い違います**
 *  ・**0 件のものも出します。** 消すと「そのチェックが無い」のか
 *    「0 件なのか」が分かりません。ただし**薄く**して、押す先を間違えないようにします
 *  ・**「直し方」を必ず出す。** おかしいとだけ言われても手が止まります。
 *    ⚠️ まとめて直せないもの（GLS の発番・リード経路）は**そう書きます** —
 *    押しても直せない場所へ送るのがいちばん困ります
 */
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface IntegrityCheck {
  key: string;
  label: string;
  why: string;
  how: string;
  count: number;
}

export function IntegrityPanel({
  checks, total, loading, active, onPick,
}: {
  checks: IntegrityCheck[];
  total: number;
  loading: boolean;
  /** いま絞っているチェック（もう一度押すと外れる） */
  active: string;
  onPick: (key: string) => void;
}) {
  const found = checks.filter((c) => c.count > 0);
  const current = checks.find((c) => c.key === active) ?? null;

  return (
    <div className="rounded-card border border-border bg-card px-4 py-3.5">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <p className="text-cardtitle">整合性の確認</p>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : found.length === 0 ? (
          <span className="text-sub flex items-center gap-1.5 text-success">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            <strong className="font-bold">揃っています</strong>（全 {total} 件）
          </span>
        ) : (
          <span className="text-sub flex items-center gap-1.5 text-warning">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            全 <strong className="font-number font-bold">{total}</strong> 件のうち、
            <strong className="font-bold">{found.length} 種類</strong>の食い違いがあります
          </span>
        )}
        <span className="flex-1" />
        {active && (
          <Button variant="outline" size="sm" onClick={() => onPick('')}>絞り込みを解除</Button>
        )}
      </div>

      {/*
        **0 件のものも並べる。** 消すと「そのチェックが無い」のか「0 件なのか」が
        分かりません。押せるのは1件以上あるものだけにします
      */}
      <div className="flex flex-wrap gap-2">
        {checks.map((c) => {
          const on = c.key === active;
          const empty = c.count === 0;
          return (
            <button
              key={c.key}
              type="button"
              disabled={empty}
              aria-pressed={on}
              onClick={() => onPick(on ? '' : c.key)}
              title={empty ? `${c.label}：0 件` : c.why}
              className={`min-h-tap text-sub flex items-center gap-2 rounded-control border px-3 py-1.5 lg:min-h-[36px] ${
                on
                  ? 'border-primary-border-strong bg-primary-surface font-bold text-primary'
                  : empty
                    ? 'border-border bg-card text-muted-foreground opacity-60'
                    : 'border-warning-border bg-warning-surface text-warning hover:bg-warning-surface'
              }`}
            >
              <span>{c.label}</span>
              <span className="text-badge font-number rounded-badge-xs bg-card/70 px-1.5 py-0.5">
                {c.count}
              </span>
            </button>
          );
        })}
      </div>

      {/*
        **押したものの「なぜ困るか」と「どう直すか」を出す。**
        件数だけ見せて放り出すと、直す手が止まります。
        文はサーバーが持っています（画面に書き写さない）。
      */}
      {current && (
        <div className="rounded-note mt-2.5 border border-primary-border bg-primary-surface-weak px-3.5 py-2.5">
          <p className="text-sub"><strong className="font-bold">なぜ困るか</strong>：{current.why}</p>
          <p className="text-sub mt-1"><strong className="font-bold">直し方</strong>：{current.how}</p>
          {/*
            ⚠️ **絞り込みを勝手に動かしたことを書く**（レビューでの指摘 #135）。
            件数は**全案件**を数えているので、GLS の絞り込みと AND にすると
            「GLS-B なのに…」は**必ず 0 行**になります。そこで押したときに
            GLS を「どちらも」へ戻していますが、**黙って戻すと
            「絞り込みが勝手に変わった」**と読まれます。
          */}
          <p className="text-note mt-1.5 text-muted-foreground">
            チェックの件数は<strong className="font-bold">全案件</strong>を数えているので、
            押したときに GLS の絞り込みは「どちらも」に戻します。
          </p>
        </div>
      )}
    </div>
  );
}
