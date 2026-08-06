/**
 * 「取り込む → 確認する → 登録する」の3ステップ (⑦ 取り込み・v4)
 *
 * ── なぜ現在地を作り話にしないか ────────────────────────────
 *
 * 3つの取込元はどれも「読む → 見る → 書く」の順ですが、**いま何段目か**は
 * 画面の状態から導けます（下の `current` を渡す側が導く）。
 * 常に1段目を光らせると飾りになり、2回目からは誰も見なくなります。
 *
 * 「登録する」は**本番のデータを書き換える段**なので、そこだけ色を変えて
 * 手前の2段と区別します。
 */
import { CloudUpload, ScanSearch, PenLine } from 'lucide-react';

export interface ImportStep {
  title: string;
  desc: string;
}

const ICONS = [CloudUpload, ScanSearch, PenLine];

export function ImportSteps({ steps, current }: { steps: ImportStep[]; current: 1 | 2 | 3 }) {
  return (
    <ol className="rounded-card grid grid-cols-1 gap-3 border border-border bg-card p-3 sm:grid-cols-3 sm:p-4">
      {steps.map((s, i) => {
        const Icon = ICONS[i];
        const n = (i + 1) as 1 | 2 | 3;
        const on = n === current;
        const done = n < current;
        return (
          <li key={s.title} className="flex items-start gap-2.5">
            <div
              className={`rounded-control-lg shrink-0 p-2 ${
                on ? 'bg-primary text-primary-foreground'
                  : done ? 'bg-success-surface text-success'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className={`text-sub ${on ? 'font-bold text-foreground' : 'text-secondary-foreground'}`}>
                {n}. {s.title}
              </p>
              <p className="text-note mt-0.5 text-muted-foreground">{s.desc}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
