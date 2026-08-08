/**
 * 案件一覧の絞り込み — **スマホ版**（M6）
 *
 * ── なぜ作り直したか ────────────────────────────────────────
 *
 * PC の絞り込み帯をそのまま縦に畳むと、375px では
 * 検索 ＋ 期間5個 ＋ 並び順 ＋ トグル2個 が積み上がって **約 450px**。
 * ステージのチップと見出しを足すと、**最初の案件に着くまで約 470px**
 * ＝ 1画面の 7割が「まだ何も見えていない」状態でした（実測）。
 *
 * スマホは**結果が先**です。絞り込みは1行に畳み、押したら下からシートで開きます。
 *
 * ── 「いくつ絞っているか」を必ず出す ────────────────────────
 *
 * 畳むと**絞り込んでいること自体を忘れます**（「12件しかないのはなぜ？」）。
 * ボタンに**効いている数**を出し、シートの中に「ぜんぶ外す」を置きます。
 * 数が 0 のときは何も出しません（0 を出すと押す理由があるように見える）。
 *
 * ── 検索は畳まない ──────────────────────────────────────────
 *
 * 探すのは絞り込みではなく**目的そのもの**なので、外に出したままにします。
 * 畳むと「探す」だけのために2タップかかります。
 */
import { useState } from 'react';
import { Search, SlidersHorizontal, Sparkles, Info, X } from 'lucide-react';
import { Sheet } from '@gmo-onair/shared/src/client-v4/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { SORT_OPTIONS, type FilterBarProps, type EventPeriodMode } from './FilterBar';

const PERIOD_MODES: [EventPeriodMode, string][] = [
  ['half', '半年'], ['month', '月'], ['quarter', '四半期'], ['year', '年'], ['all', '全件'],
];

/** 既定から動いている絞り込みの数。**既定と同じものは数えない**（数が常に付くと意味が消える） */
export function activeFilterCount(p: FilterBarProps): number {
  let n = 0;
  if (p.eventMode !== 'half') n += 1;
  if (p.sort !== 'default:asc') n += 1;
  if (p.aiOnly) n += 1;
  return n;
}

/** シートの中の1行。**見出しを左、操作を下**に置く（横に並べると操作が潰れる） */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-border-faint py-3.5 last:border-b-0">
      <span className="text-th text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-note text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function MobileFilterBar(p: FilterBarProps) {
  const [open, setOpen] = useState(false);
  const n = activeFilterCount(p);

  const clearAll = () => {
    p.onEventMode('half');
    p.onSort('default:asc');
    p.onAiOnly(false);
    p.onAiUnreviewedOnly(false);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="案件名・お客様名で探す"
            value={p.search}
            onChange={(e) => p.onSearch(e.target.value)}
            className="pl-9 pr-9"
            aria-label="案件を探す"
          />
          {/* **消すボタンを出す。** スマホのキーボードで1文字ずつ消すのは苦痛 */}
          {p.search && (
            <button
              type="button"
              onClick={() => p.onSearch('')}
              aria-label="検索をやめる"
              className="v4-tap absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`rounded-control min-h-tap flex shrink-0 items-center gap-1.5 border px-3 text-sub ${
            n > 0
              ? 'border-primary-border-strong bg-primary-surface font-bold text-primary'
              : 'border-border bg-card text-muted-foreground'
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          絞り込み
          {n > 0 && (
            <span className="rounded-chip font-number bg-primary px-1.5 text-badge text-primary-foreground">{n}</span>
          )}
        </button>
      </div>

      {/* **検索中は期間が効かないことを、その場に書く**（探したのに出ない、を防ぐ） */}
      {p.search && (
        <p className="text-note text-muted-foreground">
          探しているあいだは実施日の絞り込みを外して、全期間から当てます
        </p>
      )}

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="絞り込み"
        sub="結果はその場で変わります"
        footer={
          <div className="flex gap-2">
            {n > 0 && (
              <Button variant="outline" className="flex-1" onClick={clearAll}>ぜんぶ外す</Button>
            )}
            <Button className="flex-1" onClick={() => setOpen(false)}>結果を見る</Button>
          </div>
        }
      >
        <Field
          label="実施日"
          hint={p.eventMode === 'all' ? '全部の案件を出します。件数が多いと読み込みに少しかかります' : undefined}
        >
          <div className="grid grid-cols-5 overflow-hidden rounded-control border border-border">
            {PERIOD_MODES.map(([m, label], i) => (
              <button
                key={m}
                type="button"
                onClick={() => p.onEventMode(m)}
                aria-pressed={p.eventMode === m}
                className={`min-h-tap text-sub ${i > 0 ? 'border-l border-border' : ''} ${
                  p.eventMode === m ? 'bg-primary-surface font-bold text-primary' : 'text-muted-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {p.eventMode === 'month' && (
            <Input type="month" value={p.eventMonth} onChange={(e) => p.onEventMonth(e.target.value)} aria-label="実施月で絞り込む" />
          )}
          {p.eventMode === 'quarter' && (
            <div className="flex gap-2">
              <Input type="number" value={p.eventYear} onChange={(e) => p.onEventYear(Number(e.target.value) || p.eventYear)} className="w-24" aria-label="年" />
              <Select value={String(p.eventQuarter)} onValueChange={(v) => p.onEventQuarter(Number(v))}>
                <SelectTrigger className="flex-1" aria-label="四半期"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1Q（1〜3月）</SelectItem>
                  <SelectItem value="2">2Q（4〜6月）</SelectItem>
                  <SelectItem value="3">3Q（7〜9月）</SelectItem>
                  <SelectItem value="4">4Q（10〜12月）</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {p.eventMode === 'year' && (
            <Input type="number" value={p.eventYear} onChange={(e) => p.onEventYear(Number(e.target.value) || p.eventYear)} className="w-28" aria-label="年" />
          )}
        </Field>

        <Field label="並び順">
          <Select value={p.sort} onValueChange={p.onSort}>
            <SelectTrigger aria-label="並び順"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>

        <Field label="AI が作ったもの">
          <label className="flex min-h-tap items-center gap-2.5">
            <input
              type="checkbox"
              checked={p.aiOnly}
              onChange={(e) => p.onAiOnly(e.target.checked)}
              className="v4-tap h-5 w-5 shrink-0 accent-primary"
            />
            <Sparkles className="h-4 w-4 shrink-0 text-ai" aria-hidden="true" />
            <span className="text-list">AI が起票した案件だけ出す</span>
          </label>
          {p.aiOnly && (
            <label className="flex min-h-tap items-center gap-2.5 pl-7">
              <input
                type="checkbox"
                checked={p.aiUnreviewedOnly}
                onChange={(e) => p.onAiUnreviewedOnly(e.target.checked)}
                className="v4-tap h-5 w-5 shrink-0 accent-primary"
              />
              <span className="text-list">まだ人が確認していないものだけ</span>
            </label>
          )}
        </Field>

        <button
          type="button"
          onClick={() => { setOpen(false); p.onTermOpen(!p.termOpen); }}
          className="min-h-tap flex w-full items-center gap-1.5 text-sub text-primary"
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
          ネタ・ヨミ・GLS などの言葉の意味
        </button>
      </Sheet>
    </>
  );
}
