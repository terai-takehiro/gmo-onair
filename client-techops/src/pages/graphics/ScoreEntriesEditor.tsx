// テロップCG — スコアボード部品専用の入力UI（PageFormDialog から切り出し・400行規律）。
//
// `score` パーツだけが持つ「対戦者/エントリーの可変長配列」を編集する。他の部品の
// 1行テキスト欄（pageFields.ts の通常の PartFieldDef）とは別経路 — PageFormDialog 側は
// `def.kind === 'entries'` のときだけこのコンポーネントに差し替える（他部品は無改修）。
import { ChevronDown, ChevronUp, Minus, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DEFAULT_MAX_ENTRIES, DEFAULT_NAME_LIMIT, type ScoreEntry } from './scoreEntries';

export function ScoreEntriesEditor({
  label, entries, maxEntries, nameLimit, onChange,
}: {
  label: string;
  entries: ScoreEntry[];
  maxEntries?: number;
  nameLimit?: number;
  onChange: (next: ScoreEntry[]) => void;
}) {
  const max = maxEntries ?? DEFAULT_MAX_ENTRIES;
  const limit = nameLimit ?? DEFAULT_NAME_LIMIT;

  const update = (i: number, patch: Partial<ScoreEntry>) => {
    onChange(entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  };
  const add = () => {
    if (entries.length >= max) return;
    onChange([...entries, { name: '', points: 0 }]);
  };
  const remove = (i: number) => {
    onChange(entries.filter((_, idx) => idx !== i));
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= entries.length) return;
    const next = [...entries];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <Label>{label}</Label>
        <span className="font-number text-note text-muted-foreground">{entries.length} / {max}</span>
      </div>
      <div className="mt-1.5 space-y-2">
        {entries.map((entry, i) => {
          const nameLen = Array.from(entry.name).length;
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
                  disabled={i === entries.length - 1} onClick={() => move(i, 1)} aria-label={`${i + 1}番目を下へ`}
                >
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>

              <div className="min-w-[160px] flex-1 space-y-1">
                <Input
                  className="min-h-[44px]"
                  value={entry.name}
                  placeholder={`対戦者・チーム名（${limit}字まで）`}
                  onChange={(e) => update(i, { name: e.target.value })}
                  aria-label={`${i + 1}番目の名前`}
                />
                {nameLen > limit && (
                  <p className="mt-0.5 text-note text-warning">{nameLen} / {limit}字</p>
                )}
                {/* 英語版（任意）。出力の ?lang=en で優先表示・未入力なら日本語のままフォールバック */}
                <Input
                  className="min-h-[44px]"
                  value={entry.nameEn ?? ''}
                  placeholder="英語名（任意・?lang=en で優先表示）"
                  onChange={(e) => update(i, { nameEn: e.target.value })}
                  aria-label={`${i + 1}番目の英語名`}
                />
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button" variant="outline" size="icon" className="h-11 w-11"
                  onClick={() => update(i, { points: entry.points - 1 })} aria-label={`${i + 1}番目を1点減らす`}
                >
                  <Minus className="h-4 w-4" aria-hidden="true" />
                </Button>
                <span className="font-number w-12 shrink-0 text-center text-list font-bold tabular-nums">
                  {entry.points}
                </span>
                <Button
                  type="button" variant="outline" size="icon" className="h-11 w-11"
                  onClick={() => update(i, { points: entry.points + 1 })} aria-label={`${i + 1}番目を1点増やす`}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>

              <Button
                type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-muted-foreground"
                onClick={() => remove(i)} aria-label={`${i + 1}番目を削除`} disabled={entries.length <= 1}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          );
        })}
      </div>
      <Button type="button" variant="outline" size="sm" className="mt-2 min-h-[44px]" disabled={entries.length >= max} onClick={add}>
        <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />対戦者・エントリーを追加
      </Button>
      <p className="mt-1 text-note text-muted-foreground">
        送出中は送出コンソールの±で得点を直接動かせます（保存操作は不要・即時反映）。
      </p>
    </div>
  );
}
