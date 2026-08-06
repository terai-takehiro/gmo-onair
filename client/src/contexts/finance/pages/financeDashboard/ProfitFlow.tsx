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
 * 引き算の結果（限界利益・売上総利益・営業利益）だけ枠を変え、
 * **赤字は赤**にします。並べただけだとマイナスに気づきません。
 */
import { useNavigate } from 'react-router-dom';
import { Money } from '@gmo-onair/shared/src/client/ui/money';

export interface FlowStep {
  label: string;
  value: number;
  /** 下に出す一行（「確定売上 12件」など） */
  sub?: string;
  /** 引き算の結果か。枠と色が変わる */
  result?: boolean;
  /** 売上に対する率。結果のときだけ出す */
  pct?: number | null;
  /** 押したときの行き先。無ければ押せない */
  to?: string;
}

/** カードのあいだに出す記号。`−` か `=` */
function Op({ sign }: { sign: string }) {
  return (
    <span
      aria-hidden="true"
      className="font-number flex w-6 shrink-0 items-center justify-center text-h2 text-muted-foreground"
    >
      {sign}
    </span>
  );
}

function Card({ step }: { step: FlowStep }) {
  const navigate = useNavigate();
  const negative = step.result && step.value < 0;
  const cls = step.result
    ? negative
      ? 'border-destructive-border bg-destructive-surface'
      : 'border-primary-border bg-primary-surface-weak'
    : 'border-border bg-card';
  const inner = (
    <>
      <span className="text-th block text-muted-foreground">{step.label}</span>
      <Money
        value={step.value}
        className={`mt-0.5 text-h2 font-bold ${
          step.result ? (negative ? 'text-destructive' : 'text-success') : ''
        }`}
      />
      <span className="text-note mt-0.5 block truncate text-muted-foreground">
        {step.result && step.pct != null
          ? `売上比 ${step.pct.toFixed(1)}%`
          : step.sub ?? ''}
      </span>
    </>
  );

  if (!step.to) {
    return <div className={`rounded-card min-w-0 flex-1 border px-3.5 py-3 ${cls}`}>{inner}</div>;
  }
  return (
    <button
      type="button"
      onClick={() => navigate(step.to!)}
      className={`rounded-card min-w-0 flex-1 border px-3.5 py-3 text-left hover:border-primary-border-strong ${cls}`}
      title={`${step.label}の明細をひらく`}
    >
      {inner}
    </button>
  );
}

/**
 * 3段に分けて出します。1行に7枚並べるとスマホで潰れ、
 * PC でも「どこで区切れるか」が分からなくなります。
 */
export function ProfitFlow({ steps }: { steps: FlowStep[] }) {
  const [rev, varc, marg, fix, gross, sga, op] = steps;
  const rows: { items: FlowStep[]; ops: string[] }[] = [
    { items: [rev, varc, marg], ops: ['−', '='] },
    { items: [marg, fix, gross], ops: ['−', '='] },
    { items: [gross, sga, op], ops: ['−', '='] },
  ];
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r, i) => (
        <div key={i} className="flex items-stretch gap-2">
          <Card step={r.items[0]} />
          <Op sign={r.ops[0]} />
          <Card step={r.items[1]} />
          <Op sign={r.ops[1]} />
          <Card step={r.items[2]} />
        </div>
      ))}
    </div>
  );
}
