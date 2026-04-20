import { formatCount } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';

interface Props {
  label: string;
  count: number;
  color: string;
  sublabel?: string;
  onTake?: () => void;
  taking?: boolean;
}

export default function ViewerCard({ label, count, color, sublabel, onTake, taking }: Props) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
        </div>
        {onTake && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={onTake}
            disabled={taking}
          >
            <Send className="h-3 w-3 mr-1" />
            TAKE
          </Button>
        )}
      </div>
      <div className="text-4xl font-bold tabular-nums" style={{ color }}>
        {formatCount(count)}
      </div>
      {sublabel && (
        <p className="text-xs text-muted-foreground">{sublabel}</p>
      )}
    </div>
  );
}
