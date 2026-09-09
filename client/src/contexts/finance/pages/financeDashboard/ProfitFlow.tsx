/**
 * 損益の流れ（① 財務ダッシュボード） (v4)
 *
 * **KPI を8枚並べるのをやめて、引き算の順に並べました。**
 *
 *   売上 − 変動原価 = 限界利益 − 固定原価 = 売上総利益 − 販管費 = 営業利益
 *
 * 旧実装は8枚のカードが同じ大きさで並んでいて、**どれとどれを引くと
 * どれになるのかが読み取れませんでした**（「限界利益」と「売上総利益」が
 * 隣り合っているのに関係が書いていない）。演算子を出すと1回で読めます。
 *
 * ── 利益は色を変える ────────────────────────────────────────
 *
 * 見出しカード（下記）だけ枠を変え、**赤字は赤**にします。並べただけだと
 * マイナスに気づきません。
 *
 * ── サマリーの枚数を減らした回（ご指摘: 上部の数値が多すぎる） ────
 *
 * 3段×3枚＝実質7枚（売上・仕入・限界利益・固定原価・売上総利益・販管費・営業利益）を
 * 同じ大きさで並べていたので、**まず見たい「結果」の3つが「材料」の4つに埋もれていました**。
 * → **結果だけを見出しカードにし、材料はその下に小さい1行ずつで並べます。**
 *
 * ── 見出しを「売上／仕入（変動原価）／粗利／営業利益」に組み替えた（2026-09 ご要望）──
 *
 * 上の回では見出し＝限界利益・売上総利益・営業利益、材料＝売上・仕入・固定原価・
 * 販管費だった。**「見出しに売上・仕入も出し、粗利（＝旧・売上総利益）と営業利益に
 * 絞ってほしい」**というご要望で、見出し＝売上・仕入（変動原価）・粗利・営業利益、
 * 材料＝固定原価・販管費に組み替えた（`限界利益` は途中の値のため見出し・材料の
 * どちらにも出さない）。**どちらに入れるかは `flowSteps.ts` が付ける `result: true`
 * フラグで決まる**（`results`/`inputs` は配列の位置ではなくこのフラグで振り分ける
 * ので、材料の枚数が変わってもここは直さなくてよい）。
 *
 * **案件で絞り込み中は3枚だけ**（売上・仕入・限界利益）。固定原価・粗利・
 * 販管費・営業利益は案件に紐づかない/意味を持たないため、カードごと出しません
 * （旧実装は薄い注記だけで枠は出したままだった）。
 */
import { useNavigate } from 'react-router-dom';
import { Money } from '@gmo-onair/shared/src/client/ui/money';

export interface FlowStep {
  label: string;
  value: number;
  /** 下に出す一行（「確定売上 12件」など） */
  sub?: string;
  /** 見出しカード（大きい枠・色つき）にするか。false/未指定は下段の小さい行 */
  result?: boolean;
  /** 売上に対する率。見出しカードのうち率を出したいものだけ */
  pct?: number | null;
  /** 押したときの行き先。無ければ押せない */
  to?: string;
}

/**
 * カードのあいだに出す記号。`−` か `=`。
 *
 * スマホでは結果カードを縦に積む（下記）ので、記号も**横幅いっぱいの薄い帯**に
 * なる（`sm:` から元の縦の細い列に戻る）。
 */
function Op({ sign }: { sign: string }) {
  return (
    <span
      aria-hidden="true"
      className="font-number flex h-6 w-full shrink-0 items-center justify-center text-h2 text-muted-foreground sm:h-auto sm:w-6"
    >
      {sign}
    </span>
  );
}

function ResultCard({ step }: { step: FlowStep }) {
  const navigate = useNavigate();
  const negative = step.value < 0;
  const cls = negative
    ? 'border-destructive-border bg-destructive-surface'
    : 'border-primary-border bg-primary-surface-weak';
  const inner = (
    <>
      <span className="text-th block text-muted-foreground">{step.label}</span>
      <Money value={step.value} className={`mt-0.5 text-h2 font-bold ${negative ? 'text-destructive' : 'text-success'}`} />
      <span className="text-note mt-0.5 block truncate text-muted-foreground">
        {step.pct != null ? `売上比 ${step.pct.toFixed(1)}%` : step.sub ?? ''}
      </span>
    </>
  );
  if (!step.to) return <div className={`rounded-card min-w-0 flex-1 border px-3.5 py-3 ${cls}`}>{inner}</div>;
  return (
    <button
      type="button"
      onClick={() => navigate(step.to!)}
      className={`rounded-card min-w-0 flex-1 border px-3.5 py-3 text-left hover:border-primary-border-strong ${cls}`}
      title={`${step.label}の明細を開く`}
    >
      {inner}
    </button>
  );
}

/**
 * 材料（売上・仕入・固定原価・販管費）は1行ずつの小さい表示にする。
 *
 * ── ラベル・金額・件数を1行に詰め込んで、ラベルが切れていた ────────
 *
 * 旧実装はラベル（`flex-1 truncate`）・金額・件数（`w-32` 固定）を横1列に並べていて、
 * `lg:grid-cols-4` では1列 282px 程度しか無く、金額と件数（合わせて 220px 超）に
 * 押し出されて**ラベルがほぼ0幅まで潰れていた**（「売上」が「売」に、「仕入（変動原価）」が
 * 「仕‥」に見える。DOM上の文字列は全部残っているので既存の検査には引っかからなかった）。
 * **ラベル＋金額を1行目、件数（sub）を2行目**に分け、件数のために横幅を横取りしない形にした。
 */
function InputRow({ step }: { step: FlowStep }) {
  const navigate = useNavigate();
  const inner = (
    <>
      <div className="flex items-baseline gap-2">
        <span className="text-sub min-w-0 flex-1 truncate text-muted-foreground">{step.label}</span>
        <Money value={step.value} className="text-list shrink-0 font-bold" />
      </div>
      {step.sub && (
        <span className="text-note mt-0.5 block truncate text-right text-muted-foreground">{step.sub}</span>
      )}
    </>
  );
  if (!step.to) {
    return <div className="flex flex-col rounded-control border border-border-faint px-3 py-2">{inner}</div>;
  }
  return (
    <button
      type="button"
      onClick={() => navigate(step.to!)}
      className="flex flex-col rounded-control border border-border-faint px-3 py-2 text-left hover:border-border-strong hover:bg-muted"
      title={`${step.label}の明細を開く`}
    >
      {inner}
    </button>
  );
}

/**
 * `steps` が3件（案件で絞り込み中）なら 売上−仕入=限界利益 の1段だけ。
 * それ以外（全案件）は、`result: true` の段を見出しにして、残りを下の小さい行に並べる。
 *
 * ── 結果カードの横並びが、スマホで金額を隣のカードの下に隠していた ──────
 *
 * ⚠️ `flex items-stretch` で常に横一列に並べていたため、375px 幅では
 * カード1枚が 120px 程度しか無く、`¥11,680,000` のような金額（text-h2・太字）が
 * カードの右端からあふれていた。あふれた分は次のカードの背景に隠れて見えなくなり、
 * 「¥11,680,00」のように末尾の桁が消えて見えた（`overflow-x` は 0px のまま — 隣の
 * 要素の**下**に回り込むだけで、ページの横スクロールとしては現れないので、
 * 横はみ出しの自動検査にも引っかからなかった）。
 * **`sm:`（640px）未満は縦積みにし**、金額に必要な横幅を確保した。
 * **見出しが4枚に増えた分（2026-09 ご要望）は横並びの起点を `lg:`（1024px）に
 * 遅らせる**（3枚のときの `sm:` のままだと、1枚あたりの幅がさらに狭まり
 * 同じ症状がぶり返すため）。
 */
export function ProfitFlow({ steps }: { steps: FlowStep[] }) {
  if (steps.length === 3) {
    const [rev, varc, marg] = steps;
    return (
      <div className="flex flex-col items-stretch gap-2 sm:flex-row">
        <ResultCard step={rev} />
        <Op sign="−" />
        <ResultCard step={varc} />
        <Op sign="=" />
        <ResultCard step={marg} />
      </div>
    );
  }

  const results = steps.filter((step) => step.result);
  const inputs = steps.filter((step) => !step.result);
  const resultsRowClass = results.length > 3 ? 'lg:flex-row' : 'sm:flex-row';

  return (
    <div className="flex flex-col gap-3">
      <div className={`flex flex-col items-stretch gap-2 ${resultsRowClass}`}>
        {results.map((r, i) => (
          <ResultCard key={i} step={r} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {inputs.map((step, i) => <InputRow key={i} step={step} />)}
      </div>
    </div>
  );
}
