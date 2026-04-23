import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { type TimerState } from '@/hooks/useTimer';

const PRESETS = [1, 3, 5, 10, 15, 20, 30];

interface Props {
  state: TimerState | null;
  onSet: (seconds: number) => void;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  onAdjust: (delta: number) => void;
  readOnly?: boolean;
}

export default function TimerControls({ state, onSet, onStart, onStop, onReset, onAdjust, readOnly = false }: Props) {
  const [customMin, setCustomMin] = useState('');
  const [customSec, setCustomSec] = useState('');

  const handleCustomSet = () => {
    const m = parseInt(customMin || '0', 10);
    const s = parseInt(customSec || '0', 10);
    onSet(m * 60 + s);
  };

  const running = state?.running ?? false;
  const phase = state?.phase ?? 'idle';

  if (readOnly) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        タイマー操作は管理者権限が必要です
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Presets */}
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">プリセット</Label>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map(m => (
            <Button key={m} variant="outline" size="sm" onClick={() => onSet(m * 60)}>
              {m}分
            </Button>
          ))}
        </div>
      </div>

      {/* Custom */}
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">カスタム</Label>
        <div className="flex items-center gap-2">
          <Input
            type="number" min={0} max={99} placeholder="00"
            value={customMin} onChange={e => setCustomMin(e.target.value)}
            className="w-16 text-center"
          />
          <span className="text-muted-foreground font-bold">:</span>
          <Input
            type="number" min={0} max={59} placeholder="00"
            value={customSec} onChange={e => setCustomSec(e.target.value)}
            className="w-16 text-center"
          />
          <Button variant="secondary" size="sm" onClick={handleCustomSet}>セット</Button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <Button
          className="flex-1 bg-green-600 hover:bg-green-700 text-white"
          disabled={running || phase === 'idle'}
          onClick={onStart}
        >
          開始
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          disabled={!running}
          onClick={onStop}
        >
          停止
        </Button>
        <Button variant="destructive" size="sm" onClick={onReset}>
          リセット
        </Button>
      </div>

      {/* Adjust */}
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">時間調整</Label>
        <div className="grid grid-cols-3 gap-1.5">
          {[[-60, '-1分'], [-30, '-30秒'], [-10, '-10秒'], [10, '+10秒'], [30, '+30秒'], [60, '+1分']].map(([d, label]) => (
            <Button key={d} variant="outline" size="sm" onClick={() => onAdjust(d as number)}>
              {label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
