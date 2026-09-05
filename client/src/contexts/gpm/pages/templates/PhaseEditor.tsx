/**
 * ひな形の工程とタスクを直す欄（⑦ 標準工程テンプレート）
 *
 * ── 並び順の数字を入力させない ──────────────────────────────
 *
 * 「10 と 20 の間だから 15」は内部の都合の押し付けで、同じ数字を2つ入れると
 * 並びが不定になります（料金表で同じ判断をしました）。**↑↓ で入れ替えます。**
 *
 * ── 日数は「その工程にかかる日数」──────────────────────────
 *
 * 開始日を入れて展開したとき、**前の工程が終わった翌日から次が始まります**。
 * タスクの日数も同じ数え方で、工程の中で順に積まれます。
 * **土日祝も1日として数えます**（営業日で数えるかはまだ決めていません）。
 */
import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { move, type DraftPhase, type DraftTask } from './draft';

export function PhaseEditor({
  phases, onChange,
}: {
  phases: DraftPhase[];
  onChange: (next: DraftPhase[]) => void;
}) {
  const patch = (i: number, p: Partial<DraftPhase>) =>
    onChange(phases.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const patchTask = (i: number, j: number, t: Partial<DraftTask>) =>
    patch(i, { tasks: phases[i].tasks.map((x, k) => (k === j ? { ...x, ...t } : x)) });

  return (
    <div className="space-y-2.5">
      {phases.map((p, i) => (
        <div key={i} className="rounded-control-lg border border-border p-3">
          <div className="flex flex-wrap items-end gap-2">
            {/*
              **375pxで実測して見つけた崩れ（このタスクで修正）**: 日数(80)＋担当ロール(112)＋
              上下/削除ボタン3つ(44×3=132)＋隙間(40) だけで364pxあり、ダイアログの実効幅
              (約320px)を超える。`min-w-0 flex-1` のままだと、和文は1文字ごとに改行できる
              ため（欧文と違い「最小幅＝1文字ぶん」になる）このブロックだけが数pxまで
              潰れ、見出し「工程の名前」も入力欄も縦に潰れて読めなくなっていた。
              スマホでは常にこの列を単独の行にする（`money/MoneyRulesPage.tsx` の
              `Line` と同じ直し方）
            */}
            <div className="w-full sm:min-w-0 sm:flex-1">
              <label className="text-th block text-muted-foreground" htmlFor={`tp-${i}`}>工程の名前</label>
              <Input
                id={`tp-${i}`}
                value={p.label}
                onChange={(e) => patch(i, { label: e.target.value })}
                placeholder="現地調査・要件整理"
              />
            </div>
            <div className="w-20">
              <label className="text-th block text-muted-foreground" htmlFor={`tpd-${i}`}>日数</label>
              <Input
                id={`tpd-${i}`}
                type="number"
                min={1}
                value={p.days}
                onChange={(e) => patch(i, { days: Number(e.target.value) })}
              />
            </div>
            <div className="w-28">
              <label className="text-th block text-muted-foreground" htmlFor={`tpr-${i}`}>担当ロール</label>
              <Input id={`tpr-${i}`} value={p.role} onChange={(e) => patch(i, { role: e.target.value })} placeholder="PM" />
            </div>
            <MiniButton label="上へ" onClick={() => onChange(move(phases, i, i - 1))} disabled={i === 0}>
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            </MiniButton>
            <MiniButton label="下へ" onClick={() => onChange(move(phases, i, i + 1))} disabled={i === phases.length - 1}>
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </MiniButton>
            <MiniButton label="この工程を削除" danger onClick={() => onChange(phases.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </MiniButton>
          </div>

          <div className="mt-2.5 space-y-1.5 border-l-2 border-border-faint pl-3">
            {p.tasks.map((t, j) => (
              <div key={j} className="flex flex-wrap items-center gap-2">
                {/* 工程の名前と同じ崩れ・同じ直し方（このタスクで修正） */}
                <Input
                  aria-label={`${p.label || '工程'} のタスク ${j + 1}`}
                  className="h-9 w-full sm:min-w-0 sm:flex-1"
                  value={t.label}
                  onChange={(e) => patchTask(i, j, { label: e.target.value })}
                  placeholder="既存設備の棚卸し"
                />
                <Input
                  aria-label="日数"
                  type="number"
                  min={1}
                  className="h-9 w-16"
                  value={t.days}
                  onChange={(e) => patchTask(i, j, { days: Number(e.target.value) })}
                />
                <Input
                  aria-label="担当ロール"
                  className="h-9 w-24"
                  value={t.role}
                  onChange={(e) => patchTask(i, j, { role: e.target.value })}
                  placeholder="技術"
                />
                <label className="text-sub flex min-h-tap items-center gap-1.5 text-muted-foreground lg:min-h-[36px]">
                  <Checkbox
                    checked={t.is_required}
                    onCheckedChange={(v) => patchTask(i, j, { is_required: v === true })}
                  />
                  必須
                </label>
                <MiniButton
                  label="このタスクを削除"
                  danger
                  onClick={() => patch(i, { tasks: p.tasks.filter((_, k) => k !== j) })}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </MiniButton>
              </div>
            ))}
            <button
              type="button"
              onClick={() => patch(i, { tasks: [...p.tasks, { label: '', days: 1, role: '', is_required: false }] })}
              className="text-sub min-h-tap flex items-center gap-1 text-primary hover:underline lg:min-h-[36px]"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />タスクを追加
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...phases, { label: '', days: 5, role: '', tasks: [] }])}
        className="text-list min-h-tap rounded-control-lg flex w-full items-center justify-center gap-1.5 border border-dashed border-border text-primary hover:bg-muted lg:min-h-[44px]"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />工程を追加
      </button>
    </div>
  );
}

function MiniButton({
  label, onClick, disabled, danger, children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`rounded-control-md min-h-tap flex w-11 items-center justify-center lg:min-h-[36px] lg:w-9 ${
        disabled
          ? 'text-fg-disabled'
          : danger
            ? 'text-destructive hover:bg-destructive-surface'
            : 'text-muted-foreground hover:bg-muted'
      }`}
    >
      {children}
    </button>
  );
}
