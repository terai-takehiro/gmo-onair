import { useMemo } from 'react';
import { Timer, TimerOff } from 'lucide-react';
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

  const presetIn = (mins: number) => {
    const t = new Date(Date.now() + mins * 60 * 1000);
    onChange({ countdownTarget: t.toISOString() });
  };

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 space-y-3">
      {/* ヘッダー + ON/OFF */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-black tracking-widest uppercase text-amber-500">
          COUNTDOWN
        </span>
        <span className="text-[10px] text-slate-400 hidden sm:inline">カウントダウンテロップ</span>
        <div className="flex-1" />
        <button
          onClick={() => onChange({ countdownOn: !on })}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-black tracking-widest uppercase transition-colors',
            on
              ? 'bg-amber-500 text-slate-900 hover:bg-amber-400'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          )}
          title={on ? 'カウントダウン OFF' : 'カウントダウン ON'}
        >
          {on ? <Timer className="h-3.5 w-3.5" /> : <TimerOff className="h-3.5 w-3.5" />}
          {on ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* 目標日時 */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-center">
        <label className="flex items-center gap-2 text-[11px] text-slate-300">
          <span className="w-16 shrink-0 text-slate-400">目標日時</span>
          <input
            type="datetime-local"
            value={localValue}
            onChange={(e) => onChange({ countdownTarget: localInputToIso(e.target.value) })}
            className="flex-1 rounded bg-slate-950 border border-slate-700 px-2 py-1 text-slate-100 text-xs"
          />
        </label>
        <div className="flex gap-1">
          {[1, 5, 15, 30, 60].map((m) => (
            <button
              key={m}
              onClick={() => presetIn(m)}
              className="rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] px-2 py-1 font-semibold"
              title={`今から ${m} 分後`}
            >
              +{m}m
            </button>
          ))}
        </div>
      </div>

      {/* 枕詞 JA/EN */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="flex items-center gap-2 text-[11px] text-slate-300">
          <span className="w-16 shrink-0 text-slate-400">枕詞 (JA)</span>
          <input
            type="text"
            value={prefixJa}
            onChange={(e) => onChange({ countdownPrefixJa: e.target.value })}
            placeholder="アワードまであと"
            className="flex-1 rounded bg-slate-950 border border-slate-700 px-2 py-1 text-slate-100 text-xs"
          />
        </label>
        <label className="flex items-center gap-2 text-[11px] text-slate-300">
          <span className="w-16 shrink-0 text-slate-400">枕詞 (EN)</span>
          <input
            type="text"
            value={prefixEn}
            onChange={(e) => onChange({ countdownPrefixEn: e.target.value })}
            placeholder="Awards starts in"
            className="flex-1 rounded bg-slate-950 border border-slate-700 px-2 py-1 text-slate-100 text-xs"
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
    <label className="flex items-center gap-2 text-[11px] text-slate-300">
      <span className="w-12 shrink-0 text-slate-400">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-amber-500"
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
        className="w-16 rounded bg-slate-950 border border-slate-700 px-1.5 py-0.5 text-slate-100 text-[11px] tabular-nums"
      />
    </label>
  );
}
