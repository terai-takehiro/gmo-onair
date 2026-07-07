import { formatCount } from '@/lib/utils';

interface Props {
  label: string;
  count: number;
  color: string;
  sublabel?: string;
}

export default function ViewerCard({ label, count, color, sublabel }: Props) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-2">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="text-5xl font-bold tabular-nums" style={{ color }}>
        {formatCount(count)}
      </div>
      {sublabel && (
        <p className="text-xs text-muted-foreground">{sublabel}</p>
      )}
    </div>
  );
}
