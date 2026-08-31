// テロップCG — 投票・クイズ部品専用の入力UI（PageFormDialog から切り出し・400行規律）。
//
// `vote` パーツだけが持つ「選択肢の可変長配列」を編集する。他の部品の1行テキスト欄
// （pageFields.ts の通常の PartFieldDef）とは別経路 — PageFormDialog 側は
// `def.kind === 'choices'` のときだけこのコンポーネントに差し替える（他部品は無改修）。
// スコアボード（ScoreEntriesEditor.tsx）と同じ操作感（並べ替えは上下ボタン・
// 44px タップ領域）で揃えた — 票数はライブ加算ではなく確定値の入力なので、
// ±ステッパーではなく数値入力にした点だけがスコアと異なる。
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DEFAULT_CHOICE_LABEL_LIMIT, DEFAULT_MAX_CHOICES, type VoteChoice } from './voteChoices';

export function VoteChoicesEditor({
  label, choices, maxChoices, choiceLabelLimit, onChange,
}: {
  label: string;
  choices: VoteChoice[];
  maxChoices?: number;
  choiceLabelLimit?: number;
  onChange: (next: VoteChoice[]) => void;
}) {
  const max = maxChoices ?? DEFAULT_MAX_CHOICES;
  const limit = choiceLabelLimit ?? DEFAULT_CHOICE_LABEL_LIMIT;

  const update = (i: number, patch: Partial<VoteChoice>) => {
    onChange(choices.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  };
  const add = () => {
    if (choices.length >= max) return;
    onChange([...choices, { label: '', votes: 0 }]);
  };
  const remove = (i: number) => {
    onChange(choices.filter((_, idx) => idx !== i));
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= choices.length) return;
    const next = [...choices];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const setVotes = (i: number, raw: string) => {
    const n = Number(raw);
    update(i, { votes: raw.trim() === '' || !Number.isFinite(n) ? 0 : Math.max(0, Math.trunc(n)) });
  };

  const total = choices.reduce((sum, c) => sum + c.votes, 0);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <Label>{label}</Label>
        <span className="font-number text-note text-muted-foreground">{choices.length} / {max}</span>
      </div>
      <div className="mt-1.5 space-y-2">
        {choices.map((choice, i) => {
          const labelLen = Array.from(choice.label).length;
          const pct = total > 0 ? Math.round((choice.votes / total) * 100) : 0;
          return (
            <div
              key={i}
              className="flex flex-wrap items-center gap-2 rounded-control-md border border-border bg-surface-subtle p-2"
            >
              <div className="flex shrink-0 gap-0.5">
                <Button
                  type="button" variant="outline" size="icon" className="h-11 w-11"
                  disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${i + 1}番目を上へ`}
                >
                  <ChevronUp className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button" variant="outline" size="icon" className="h-11 w-11"
                  disabled={i === choices.length - 1} onClick={() => move(i, 1)} aria-label={`${i + 1}番目を下へ`}
                >
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>

              <div className="min-w-[160px] flex-1 space-y-1">
                <Input
                  className="min-h-[44px]"
                  value={choice.label}
                  placeholder={`選択肢（${limit}字まで）`}
                  onChange={(e) => update(i, { label: e.target.value })}
                  aria-label={`${i + 1}番目の選択肢`}
                />
                {labelLen > limit && (
                  <p className="mt-0.5 text-note text-warning">{labelLen} / {limit}字</p>
                )}
                {/* 英語版（任意）。出力の ?lang=en で優先表示・未入力なら日本語のままフォールバック */}
                <Input
                  className="min-h-[44px]"
                  value={choice.labelEn ?? ''}
                  placeholder="英語ラベル（任意・?lang=en で優先表示）"
                  onChange={(e) => update(i, { labelEn: e.target.value })}
                  aria-label={`${i + 1}番目の英語ラベル`}
                />
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  className="h-11 w-24 text-right font-number tabular-nums"
                  value={choice.votes}
                  onChange={(e) => setVotes(i, e.target.value)}
                  aria-label={`${i + 1}番目の票数`}
                />
                <span className="w-11 shrink-0 text-right font-number text-note text-muted-foreground tabular-nums">
                  {total > 0 ? `${pct}%` : '—'}
                </span>
              </div>

              <Button
                type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-muted-foreground"
                onClick={() => remove(i)} aria-label={`${i + 1}番目を削除`} disabled={choices.length <= 1}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          );
        })}
      </div>
      <Button type="button" variant="outline" size="sm" className="mt-2 min-h-[44px]" disabled={choices.length >= max} onClick={add}>
        <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />選択肢を追加
      </Button>
      <p className="mt-1 text-note text-muted-foreground">
        票数を直接入力してください（合計 {total.toLocaleString()} 票・割合は自動計算）。
      </p>
    </div>
  );
}
