import { useMemo, useState } from 'react';
import { Timer, TimerOff, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  on: boolean;
  target: string | null;
  prefixJa: string;
  prefixEn: string;
  x: number;
  y: number;
  scale: number;
  onChange: (patch: Partial<{
    countdownOn: boolean;
    countdownTarget: string | null;
    countdownPrefixJa: string;
    countdownPrefixEn: string;
    countdownX: number;
    countdownY: number;
    countdownScale: number;
  }>) => void;
}

// ISO 8601 (UTC) ↔ <input type="datetime-local"> 用ローカル文字列の変換
function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export default function CountdownControlPanel({
  on, target, prefixJa, prefixEn, x, y, scale, onChange,
}: Props) {
  const localValue = useMemo(() => isoToLocalInput(target), [target]);

  // 開始モード: 'datetime' = 指定日時 / 'duration' = 分秒指定で今から
  const [mode, setMode] = useState<'datetime' | 'duration'>('datetime');
  const [durMin, setDurMin] = useState(5);
  const [durSec, setDurSec] = useState(0);

  const presetIn = (mins: number) => {
    const t = new Date(Date.now() + mins * 60 * 1000);
    onChange({ countdownTarget: t.toISOString(), countdownOn: true });
  };
  const startDuration = () => {
    const totalMs = (Math.max(0, durMin) * 60 + Math.max(0, durSec)) * 1000;
    if (totalMs <= 0) return;
    const t = new Date(Date.now() + totalMs);
    onChange({ countdownTarget: t.toISOString(), countdownOn: true });
  };

  return (
    <div className="rounded-lg border border-border bg-background/40 p-3 space-y-3">
      {/* ヘッダー + ON/OFF */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-black tracking-widest uppercase text-warning-strong">
          COUNTDOWN
        </span>
        <span className="text-[10px] text-muted-foreground hidden sm:inline">カウントダウンテロップ</span>
        <div className="flex-1" />
        <button
          onClick={() => onChange({ countdownOn: !on })}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-black tracking-widest uppercase transition-colors',
            on
              ? 'bg-warning text-foreground hover:bg-warning/90'
              : 'bg-card text-muted-foreground hover:bg-muted'
          )}
          title={on ? 'カウントダウン OFF' : 'カウントダウン ON'}
        >
          {on ? <Timer className="h-3.5 w-3.5" /> : <TimerOff className="h-3.5 w-3.5" />}
          {on ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* 開始モード切替 */}
      <div className="flex items-center gap-1 rounded-md bg-background/60 border border-border p-0.5 w-fit">
        {(['datetime', 'duration'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              'px-2.5 py-1 rounded text-[10px] font-black tracking-widest uppercase transition-colors',
              mode === m
                ? 'bg-warning text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {m === 'datetime' ? '指定日時' : '分秒指定'}
          </button>
        ))}
      </div>

      {mode === 'datetime' ? (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-center">
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="w-16 shrink-0 text-muted-foreground">目標日時</span>
            <input
              type="datetime-local"
              value={localValue}
              onChange={(e) => onChange({ countdownTarget: localInputToIso(e.target.value) })}
              className="flex-1 rounded bg-background border border-border px-2 py-1 text-foreground text-xs"
            />
          </label>
          <div className="flex gap-1">
            {[1, 5, 15, 30, 60].map((m) => (
              <button
                key={m}
                onClick={() => presetIn(m)}
                className="rounded bg-card hover:bg-muted text-muted-foreground text-[10px] px-2 py-1 font-semibold"
                title={`今から ${m} 分後に開始`}
              >
                +{m}m
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-muted-foreground w-16 shrink-0">今から</span>
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <input
              type="number"
              min={0}
              max={999}
              value={durMin}
              onChange={(e) => setDurMin(Math.max(0, Math.min(999, Number(e.target.value) || 0)))}
              className="w-16 rounded bg-background border border-border px-2 py-1 text-foreground text-xs tabular-nums"
            />
            <span className="text-muted-foreground">分</span>
          </label>
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <input
              type="number"
              min={0}
              max={59}
              value={durSec}
              onChange={(e) => setDurSec(Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
              className="w-16 rounded bg-background border border-border px-2 py-1 text-foreground text-xs tabular-nums"
            />
            <span className="text-muted-foreground">秒</span>
          </label>
          <button
            onClick={startDuration}
            className="h-ctl-1 flex items-center gap-1 rounded bg-warning hover:bg-warning/90 text-foreground text-[11px] font-black tracking-widest uppercase px-3 "
          >
            <Play className="h-3 w-3" />
            開始
          </button>
          <div className="flex gap-1">
            {[
              { label: '30s', s: 30 },
              { label: '1m', s: 60 },
              { label: '3m', s: 180 },
              { label: '10m', s: 600 },
            ].map((p) => (
              <button
                key={p.label}
                onClick={() => { setDurMin(Math.floor(p.s / 60)); setDurSec(p.s % 60); }}
                className="rounded bg-card hover:bg-muted text-muted-foreground text-[10px] px-2 py-1 font-semibold"
                title={`${p.label} をセット`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 枕詞 JA/EN */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="w-16 shrink-0 text-muted-foreground">枕詞 (JA)</span>
          <input
            type="text"
            value={prefixJa}
            onChange={(e) => onChange({ countdownPrefixJa: e.target.value })}
            placeholder="アワードまであと"
            className="flex-1 rounded bg-background border border-border px-2 py-1 text-foreground text-xs"
          />
        </label>
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="w-16 shrink-0 text-muted-foreground">枕詞 (EN)</span>
          <input
            type="text"
            value={prefixEn}
            onChange={(e) => onChange({ countdownPrefixEn: e.target.value })}
            placeholder="Awards starts in"
            className="flex-1 rounded bg-background border border-border px-2 py-1 text-foreground text-xs"
          />
        </label>
      </div>

      {/* 位置 / サイズ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <NumField
          label="X (%)"
          value={x}
          min={0} max={100} step={0.5}
          onChange={(v) => onChange({ countdownX: v })}
        />
        <NumField
          label="Y (%)"
          value={y}
          min={0} max={100} step={0.5}
          onChange={(v) => onChange({ countdownY: v })}
        />
        <NumField
          label="サイズ"
          value={scale}
          min={0.3} max={2.5} step={0.05}
          onChange={(v) => onChange({ countdownScale: v })}
        />
      </div>
    </div>
  );
}

function NumField({
  label, value, min, max, step, onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <span className="w-12 shrink-0 text-muted-foreground">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-warning"
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
        className="w-16 rounded bg-background border border-border px-1.5 py-0.5 text-foreground text-[11px] tabular-nums"
      />
    </label>
  );
}
