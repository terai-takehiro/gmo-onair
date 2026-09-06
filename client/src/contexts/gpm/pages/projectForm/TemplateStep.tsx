/**
 * ④ 新規作成 ステップ2 — 標準工程を選ぶ
 *
 * ── 「選ばない」を最初に置く ────────────────────────────────
 *
 * ひな形は**選んだ瞬間に写して**工程とタスクが日付付きで入ります
 * （`gpm.service.ts` の `expandTemplate`）。近いものが無いのに無理に選ぶと、
 * あとで要らない工程を1つずつ消すことになります。だから
 * **「ひな形を使わない」を1番目**に置いて、あとから足せることを書きます。
 *
 * ── 写したあとにひな形を直しても影響しない ──────────────────
 *
 * 動いているプロジェクトが勝手に変わるほうが事故なので、そう決めてあります
 * （`docs/design/gpm-model.md` 決め③）。**その旨を画面に出します** —
 * 書いていないと「ひな形を直せば全部直る」と思われます。
 */
import { Layers, Check } from 'lucide-react';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { SkeletonRows, Delayed } from '@gmo-onair/shared/src/client/states';
import type { GpmTemplate } from '../../types';

export interface TemplateStepProps {
  templates: GpmTemplate[];
  loading: boolean;
  value: string;
  onChange: (templateId: string) => void;
}

function phaseDays(t: GpmTemplate): number {
  return t.phases.reduce((n, p) => n + (Number(p.days) || 0), 0);
}

function taskCount(t: GpmTemplate): number {
  return t.phases.reduce((n, p) => n + p.tasks.length, 0);
}

export function TemplateStep({ templates, loading, value, onChange }: TemplateStepProps) {
  if (loading) {
    return <Delayed><SkeletonRows rows={3} /></Delayed>;
  }

  return (
    <div className="rounded-card border border-border bg-card p-4 lg:p-5">
      <p className="text-note mb-3 text-muted-foreground">
        近い工程テンプレートを選ぶと、工程とタスクがそのまま入ります。入れたあとは自由に編集できます。
        <br />
        写したあとに工程テンプレートのほうを直しても、このプロジェクトは変わりません。
      </p>

      <div className="space-y-2.5">
        <Option
          on={value === ''}
          title="工程テンプレートを使わない"
          sub="工程はあとから足します。何を作るか決まっていないときはこちら"
          onClick={() => onChange('')}
        />
        {templates.map((t) => (
          <Option
            key={t.id}
            on={value === t.id}
            title={t.name}
            sub={t.description ?? ''}
            counts={[
              `工程 ${t.phases.length}`,
              `タスク ${taskCount(t)}`,
              `目安 ${phaseDays(t)}日`,
            ]}
            used={t.used_count}
            onClick={() => onChange(t.id)}
          />
        ))}
      </div>
    </div>
  );
}

function Option({
  on, title, sub, counts, used, onClick,
}: {
  on: boolean;
  title: string;
  sub: string;
  counts?: string[];
  used?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'min-h-tap rounded-control-lg flex w-full flex-wrap items-center gap-3 border p-3 text-left',
        on ? 'border-primary-border-strong bg-primary-surface-weak' : 'border-border hover:bg-muted',
      )}
    >
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-control',
          on ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
        )}
      >
        {on ? <Check className="h-4 w-4" aria-hidden="true" /> : <Layers className="h-4 w-4" aria-hidden="true" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('text-list block truncate', on && 'text-primary')}>{title}</span>
        {sub && <span className="text-sub-sm block text-muted-foreground">{sub}</span>}
      </span>
      {counts && (
        <span className="flex shrink-0 flex-wrap gap-1.5">
          {counts.map((c) => (
            <span key={c} className="text-badge font-number rounded-badge bg-muted px-2 py-1 text-muted-foreground">
              {c}
            </span>
          ))}
          {used !== undefined && used > 0 && (
            <span className="text-badge font-number rounded-badge bg-info-surface px-2 py-1 text-info">
              適用中 {used}
            </span>
          )}
        </span>
      )}
    </button>
  );
}
