/**
 * ⑤ 全プロジェクトのタスク — スマホ専用のタブ切替（v4ネイティブUI監査 2026-08-20 で追加）
 *
 * ── なぜ PC のピルをそのまま使わないか ────────────────────────
 *
 * PC は `PageHeader` の右肩に小さいピル型のセグメント（`GpmTaskListPage.tsx`）を
 * 乗せているだけで、スマホでは `children` が見出しの下に折り返るだけだった
 * （`docs/v4-native-ui-audit-2026-08-20.md` ⑤ 指摘「専用のモバイルナビゲーションが無い」）。
 *
 * タスクと未確認事項は**別の集合**（絞り込みではなく画面ごと切り替える）なので、
 * `finance/pages/ledger/LedgerTabs.tsx` と同じ考え方——ただし項目が2つしか無いので、
 * 横スクロールの下線タブではなく**幅いっぱいの2分割**にして、指の届く範囲に置く。
 *
 * 件数は `GpmTaskListPage.tsx` の `sub`（「未対応 N件 ・ 止まっている未確認事項 N件」）
 * と**同じ数**を渡す。ここで数え直すと、見出しの1行とタブの数字が食い違う。
 */
import { CircleHelp, ListTodo } from 'lucide-react';
import { cn } from '@gmo-onair/shared/src/client/utils';

const ITEMS: { key: 'tasks' | 'asks'; label: string; icon: typeof ListTodo }[] = [
  { key: 'tasks', label: 'タスク', icon: ListTodo },
  { key: 'asks', label: '未解決事項', icon: CircleHelp },
];

export function MobileTaskTabs({
  tab, onChange, taskCount, askCount,
}: {
  tab: 'tasks' | 'asks';
  onChange: (v: 'tasks' | 'asks') => void;
  /** 見出しに添える件数。読み込み前は null（0 と紛らわしいので出さない） */
  taskCount: number | null;
  askCount: number | null;
}) {
  const counts: Record<'tasks' | 'asks', number | null> = { tasks: taskCount, asks: askCount };

  return (
    // タブの ARIA は名乗らない (矢印キー・tabpanel 未実装)。aria-pressed の組にする
    <div role="group" aria-label="表示形式を切り替える" className="grid grid-cols-2 gap-1.5">
      {ITEMS.map(({ key, label, icon: Icon }) => {
        const on = tab === key;
        const count = counts[key];
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(key)}
            className={cn(
              'min-h-tap rounded-control flex items-center justify-center gap-1.5 border px-3 text-sub',
              on
                ? 'border-primary-border bg-primary-surface font-bold text-primary'
                : 'border-border text-muted-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{label}</span>
            {count !== null && (
              <span
                className={cn(
                  'rounded-badge shrink-0 px-1.5 font-number text-note',
                  on ? 'bg-card text-primary' : 'bg-muted text-muted-foreground',
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
