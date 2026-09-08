/**
 * タスク・依頼のフォームで使い回す欄
 *
 * 「依頼する」（`RequestDialog`）と「タスクを追加 / タスクを編集」（`TaskDialogs`）は
 * **同じ欄を同じ並びで出す**（期限 → 重要度・緊急度 → 判定）。
 * 写しを作ると、期限のクイック選択を短い順に並べ直したときに片方だけ古いままになる。
 */
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { CELL_ACTION, LEVEL_LABELS } from '@/lib/tasksApi';
import { CellScoreBadge } from './CellScoreBadge';

/**
 * 期限のクイック選択。**短い順に並べる**のが意図。
 * イズム (目標達成10カ条 1-1)「期限はできるだけ短く設定する」を選択肢の並びで示す。
 */
export function dueQuickPicks(): { label: string; value: string }[] {
  const pad = (n: number) => String(n).padStart(2, '0');
  const at = (d: Date, h: number, m: number) => {
    const x = new Date(d);
    x.setHours(h, m, 0, 0);
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(h)}:${pad(m)}`;
  };
  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const friday = new Date(now); friday.setDate(now.getDate() + ((5 - now.getDay() + 7) % 7 || 7));
  const nextMon = new Date(now); nextMon.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
  return [
    { label: '今日 18:00', value: at(now, 18, 0) },
    { label: '明日 10:00', value: at(tomorrow, 10, 0) },
    { label: '明日 18:00', value: at(tomorrow, 18, 0) },
    { label: '金曜 18:00', value: at(friday, 18, 0) },
    { label: '来週月曜 10:00', value: at(nextMon, 10, 0) },
  ];
}

export function LevelPicker({ label, value, onChange }: {
  label: string; value: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label className="text-th">{label}</Label>
      <div className="mt-1 flex gap-1">
        {[3, 2, 1].map((lv) => (
          <button
            key={lv}
            type="button"
            onClick={() => onChange(lv)}
            aria-pressed={value === lv}
            className={cn(
              'min-h-tap text-sub lg:min-h-[36px] flex-1 rounded-control border transition-colors',
              value === lv ? 'border-primary bg-primary-surface font-bold text-primary' : 'border-input hover:bg-accent',
            )}
          >
            {LEVEL_LABELS[lv]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DueField({ value, onChange, required }: {
  value: string; onChange: (v: string) => void; required?: boolean;
}) {
  return (
    <div>
      {/* 聞き方でイズムを伝える (「いつまで？」ではなく「何月何日何時何分まで？」) */}
      <Label className="text-th">
        何月何日何時何分まで {required && <span className="text-destructive">*</span>}
      </Label>
      <Input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} className="mt-1" />
      <div className="mt-1.5 flex flex-wrap gap-1">
        {dueQuickPicks().map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => onChange(q.value)}
            className={cn(
              'min-h-tap text-note lg:min-h-[36px] rounded-badge border px-2.5',
              value === q.value ? 'border-primary-border-strong bg-primary-surface font-bold text-primary' : 'border-input text-muted-foreground hover:bg-accent',
            )}
          >
            {q.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * 入れた重要度・緊急度がどう効くかを、その場で見せる帯。
 * **期限が無いと緊急度は低として扱う**（要件 D9。期限を入れないことのコストが本人に返る）。
 */
export function PriorityPreview({ importance, urgency, hasDue, dueRequired = false, note }: {
  importance: number; urgency: number; hasDue: boolean;
  /**
   * その欄で**期限が必須**か（依頼のとき）。必須なら、まだ入れていないだけの状態を
   * 「期限が無い」として扱わない — 依頼は期限なしでは送れないので、
   * 「緊急度は低として扱います」と出すと**送れば低になる**と読めてしまう。
   */
  dueRequired?: boolean;
  note?: string;
}) {
  const effectiveUrgency = hasDue || dueRequired ? urgency : 1;
  return (
    <div className="flex items-center gap-2 rounded-card border border-border bg-surface-subtle px-2.5 py-2">
      <CellScoreBadge score={importance * effectiveUrgency} />
      <span className="text-note text-muted-foreground">
        {CELL_ACTION[`${importance}x${effectiveUrgency}`]}
        {!hasDue && (dueRequired ? '（期限を入れると確定します）' : '（期限が無いので緊急度は低として扱います）')}
        {note && `。${note}`}
      </span>
    </div>
  );
}
