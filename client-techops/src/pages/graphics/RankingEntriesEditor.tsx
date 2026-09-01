// テロップCG — ランキング発表部品（`ranking`）専用の入力UI（PageFormDialog から切り出し・
// 400行規律 — `node scripts/check-file-size.mjs`）。
//
// `ScoreEntriesEditor.tsx` と同じ操作感（ドラッグではなく上下ボタンでの並べ替え・44px
// タップ領域・追加/削除ボタン）。加えて冒頭に発表方式（direct/vote）の切替を持つ
// （`rankingFields.ts` の `AwardPattern` を直接読み書きする）。
//
// **順位（`rank`）は自由入力させない。** 配列の並び順から自動的に採番する
// （末尾ほど上位＝1位・先頭が最下位。`defaultRankingEntries()` の [5,4,3,2,1] と同じ並びで、
// 旧 `awards` の RANKS 5→2 → winner-bar の発表順と一致する）。並べ替えボタンで動かすと
// 順位も入れ替わる — `renumberByOrder` を並べ替え・追加・削除のたびに必ず通す。
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ImageFieldEditor } from './ImageFieldEditor';
import type { AwardPattern, RankingEntry } from './rankingFields';

/** エントリー数の目安上限（旧 `awards` の RANKS5→2 + winner-bar が試せる5件＋余裕1件） */
export const RANKING_MAX_ENTRIES = 6;

/** 配列の並び順から `rank` を採番し直す（末尾ほど上位＝1位）。並べ替え直後は必ずこれを通す */
function renumberByOrder(entries: RankingEntry[]): RankingEntry[] {
  return entries.map((e, i) => ({ ...e, rank: entries.length - i }));
}

/** 小数第1位までに丸める（`rankingFields.ts` の `toPoints` と同じ丸め方。不正値は0） */
function toPointsInput(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0;
}

export function RankingEntriesEditor({
  label, entries, awardPattern, onEntriesChange, onAwardPatternChange, pageId = null,
}: {
  label: string;
  entries: RankingEntry[];
  awardPattern: AwardPattern;
  onEntriesChange: (next: RankingEntry[]) => void;
  onAwardPatternChange: (next: AwardPattern) => void;
  /** 写真アップロード（`ImageFieldEditor`）に要る保存済みページID。未保存の新規作成中は null */
  pageId?: string | null;
}) {
  const max = RANKING_MAX_ENTRIES;

  const update = (i: number, patch: Partial<RankingEntry>) => {
    onEntriesChange(entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  };
  const add = () => {
    if (entries.length >= max) return;
    onEntriesChange(renumberByOrder([...entries, { rank: null, name: '', points: 0 }]));
  };
  const remove = (i: number) => {
    if (entries.length <= 1) return;
    onEntriesChange(renumberByOrder(entries.filter((_, idx) => idx !== i)));
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= entries.length) return;
    const next = [...entries];
    [next[i], next[j]] = [next[j], next[i]];
    onEntriesChange(renumberByOrder(next));
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>発表方式</Label>
        <div className="mt-1 flex gap-1.5 rounded-control-md bg-surface-subtle p-1">
          <button
            type="button"
            className={`min-h-tap flex-1 rounded-control px-3 text-sub font-bold transition-colors ${
              awardPattern === 'direct' ? 'bg-card shadow-sm' : 'text-muted-foreground'
            }`}
            onClick={() => onAwardPatternChange('direct')}
          >
            直接発表
          </button>
          <button
            type="button"
            className={`min-h-tap flex-1 rounded-control px-3 text-sub font-bold transition-colors ${
              awardPattern === 'vote' ? 'bg-card shadow-sm' : 'text-muted-foreground'
            }`}
            onClick={() => onAwardPatternChange('vote')}
          >
            投票で決定
          </button>
        </div>
        <p className="mt-1 text-note text-muted-foreground">
          直接発表＝No.1をそのまま発表します。投票で決定＝TOP3提示のあと、送出コンソールでNo.1を選びます。
        </p>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <Label>{label}</Label>
          <span className="font-number text-note text-muted-foreground">{entries.length} / {max}</span>
        </div>
        <div className="mt-1.5 space-y-2">
          {entries.map((entry, i) => {
            const rank = entries.length - i;
            return (
              <div key={i} className="rounded-control-md border border-border bg-surface-subtle p-2">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="flex shrink-0 flex-col items-center gap-1">
                    <span className="font-number rounded-control-md bg-card px-2 py-0.5 text-note font-bold text-muted-foreground">
                      {rank}位
                    </span>
                    <div className="flex gap-0.5">
                      <Button
                        type="button" variant="outline" size="icon" className="h-11 w-11"
                        disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${rank}位を上へ`}
                      >
                        <ChevronUp className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button" variant="outline" size="icon" className="h-11 w-11"
                        disabled={i === entries.length - 1} onClick={() => move(i, 1)} aria-label={`${rank}位を下へ`}
                      >
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>

                  <div className="min-w-[200px] flex-1 space-y-1.5">
                    <Input
                      className="min-h-[44px]" value={entry.name} placeholder="氏名"
                      onChange={(e) => update(i, { name: e.target.value })} aria-label={`${rank}位の氏名`}
                    />
                    <Input
                      className="min-h-[44px]" value={entry.nameEn ?? ''} placeholder="氏名（英語・任意）"
                      onChange={(e) => update(i, { nameEn: e.target.value })} aria-label={`${rank}位の英語氏名`}
                    />
                    <Input
                      className="min-h-[44px]" value={entry.company ?? ''} placeholder="所属・会社（任意）"
                      onChange={(e) => update(i, { company: e.target.value })} aria-label={`${rank}位の所属`}
                    />
                    <Input
                      className="min-h-[44px]" value={entry.companyEn ?? ''} placeholder="所属（英語・任意）"
                      onChange={(e) => update(i, { companyEn: e.target.value })} aria-label={`${rank}位の英語所属`}
                    />
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Label htmlFor={`ranking-points-${i}`} className="text-note text-muted-foreground">得点</Label>
                        <Input
                          id={`ranking-points-${i}`} type="number" step="0.1" inputMode="decimal"
                          className="mt-0.5 min-h-[44px]" value={entry.points}
                          onChange={(e) => update(i, { points: toPointsInput(e.target.value) })}
                        />
                      </div>
                      <div className="flex-1">
                        <Label htmlFor={`ranking-ownpoints-${i}`} className="text-note text-muted-foreground">自社票（任意）</Label>
                        <Input
                          id={`ranking-ownpoints-${i}`} type="number" step="0.1" inputMode="decimal"
                          className="mt-0.5 min-h-[44px]" value={entry.ownPoints ?? ''} placeholder="—"
                          onChange={(e) => update(i, {
                            ownPoints: e.target.value === '' ? undefined : toPointsInput(e.target.value),
                          })}
                        />
                      </div>
                    </div>
                    <ImageFieldEditor
                      label="写真（任意）" pageId={pageId} value={entry.photoUrl ?? ''}
                      onChange={(next) => update(i, { photoUrl: next || undefined })}
                    />
                  </div>

                  <Button
                    type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-muted-foreground"
                    onClick={() => remove(i)} aria-label={`${rank}位を削除`} disabled={entries.length <= 1}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <Button
          type="button" variant="outline" size="sm" className="mt-2 min-h-[44px]"
          disabled={entries.length >= max} onClick={add}
        >
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />エントリーを追加
        </Button>
      </div>
    </div>
  );
}
