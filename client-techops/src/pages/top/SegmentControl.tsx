// 制作技術支援トップ — 「すべて／案件管理／ここだけ」の絞り込み切替。
// 既存の共通部品に無い形（セグメントコントロール）なので新規に作る。
import { cn } from '@/lib/utils';
import type { Segment } from './topHelpers';

const OPTIONS: { key: Segment; label: string }[] = [
  { key: 'all', label: 'すべて' },
  { key: 'gls', label: '案件管理' },
  { key: 'own', label: 'ここだけ' },
];

export function SegmentControl({
  value, onChange,
}: {
  value: Segment;
  onChange: (segment: Segment) => void;
}) {
  return (
    <div className="inline-flex rounded-control-lg bg-muted p-0.5" role="tablist" aria-label="絞り込み">
      {OPTIONS.map((opt) => {
        const selected = opt.key === value;
        return (
          <button
            key={opt.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(opt.key)}
            className={cn(
              'min-h-tap rounded-control-lg px-3.5 text-sub font-bold transition-colors',
              selected ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
