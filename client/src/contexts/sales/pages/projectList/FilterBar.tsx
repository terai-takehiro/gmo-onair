/**
 * 案件一覧の絞り込み帯 (v4)
 *
 * モックは「絞り込み」「実施日が近い順」の2つのボタンだけですが、
 * **いま実際に使われている絞り込みを減らしていません** — 検索・開催期間・
 * 並び順・AI 起票は既存の機能で、消すと今の運用が止まります。
 * v4 で変えたのは**置き場所と見た目**だけです
 * (ステージの絞り込みは上のチップに出したので、ここからは外しました)。
 */
import { Search, SlidersHorizontal, Sparkles, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

export type EventPeriodMode = 'half' | 'month' | 'quarter' | 'year' | 'all';

/**
 * 並び順。**ラベルは 224px の枠に1行で収まる長さにする。**
 *
 * 旧実装の「おすすめ (ネタ → 提案中 → 受注済)」は枠の中で2行に折り返し、
 * **2行目が切れて読めませんでした** (実ブラウザで計測: 中身 40px / 枠 20px)。
 * `<SelectValue>` は選んだ項目の文字をそのまま出すので、
 * 説明を足すなら枠の外 (「用語」) に書きます。
 */
export const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'default:asc', label: 'おすすめ順' },
  { value: 'event_start:asc', label: '実施日が近い順' },
  { value: 'event_start:desc', label: '実施日が遠い順' },
  { value: 'created_at:desc', label: '作成が新しい順' },
  { value: 'created_at:asc', label: '作成が古い順' },
  { value: 'expected_amount:desc', label: '金額が高い順' },
  { value: 'expected_amount:asc', label: '金額が安い順' },
  { value: 'name:asc', label: '案件名 (50音)' },
  { value: 'customer:asc', label: 'お客様名 (50音)' },
];

const PERIOD_MODES: [EventPeriodMode, string][] = [
  ['half', '半年'], ['month', '月'], ['quarter', '四半期'], ['year', '年'], ['all', '全件'],
];

export interface FilterBarProps {
  search: string;
  onSearch: (v: string) => void;
  sort: string;
  onSort: (v: string) => void;
  eventMode: EventPeriodMode;
  onEventMode: (v: EventPeriodMode) => void;
  eventMonth: string;
  onEventMonth: (v: string) => void;
  eventYear: number;
  onEventYear: (v: number) => void;
  eventQuarter: number;
  onEventQuarter: (v: number) => void;
  aiOnly: boolean;
  onAiOnly: (v: boolean) => void;
  aiUnreviewedOnly: boolean;
  onAiUnreviewedOnly: (v: boolean) => void;
  /** 「用語」の説明を開いているか */
  termOpen: boolean;
  onTermOpen: (v: boolean) => void;
}

/** 帯の中の小さな押しボタン。**高さは 44px 以上** (スマホでも指で押す) */
function ChipButton({
  active, onClick, title, children,
}: { active?: boolean; onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`min-h-tap text-sub inline-flex shrink-0 items-center gap-1.5 rounded-control border px-3 lg:min-h-[36px] ${
        active
          ? 'border-primary-border-strong bg-primary-surface font-bold text-primary'
          : 'border-border bg-card text-muted-foreground hover:bg-muted'
      }`}
    >
      {children}
    </button>
  );
}

export function FilterBar(p: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-card px-3 py-2.5">
      <div className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          placeholder="案件名・GLS番号・お客様名で探す"
          value={p.search}
          onChange={(e) => p.onSearch(e.target.value)}
          className="pl-9"
          aria-label="案件を探す"
        />
      </div>

      {/* 開催期間。**検索中は効きません**とその場に出す (探したのに出ない、を防ぐ) */}
      <div className="inline-flex shrink-0 items-center gap-1.5">
        <SlidersHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <div className="inline-flex overflow-hidden rounded-control border border-border">
          {PERIOD_MODES.map(([m, label], i) => (
            <button
              key={m}
              type="button"
              onClick={() => p.onEventMode(m)}
              aria-pressed={p.eventMode === m}
              className={`min-h-tap text-sub px-3 lg:min-h-[36px] ${i > 0 ? 'border-l border-border' : ''} ${
                p.eventMode === m ? 'bg-primary-surface font-bold text-primary' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {p.eventMode === 'month' && (
        <Input type="month" value={p.eventMonth} onChange={(e) => p.onEventMonth(e.target.value)} className="w-36 shrink-0" aria-label="実施月で絞り込む" />
      )}
      {p.eventMode === 'quarter' && (
        <>
          <Input type="number" value={p.eventYear} onChange={(e) => p.onEventYear(Number(e.target.value) || p.eventYear)} className="w-24 shrink-0" aria-label="年" />
          <Select value={String(p.eventQuarter)} onValueChange={(v) => p.onEventQuarter(Number(v))}>
            <SelectTrigger className="w-36 shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1Q（1〜3月）</SelectItem>
              <SelectItem value="2">2Q（4〜6月）</SelectItem>
              <SelectItem value="3">3Q（7〜9月）</SelectItem>
              <SelectItem value="4">4Q（10〜12月）</SelectItem>
            </SelectContent>
          </Select>
        </>
      )}
      {p.eventMode === 'year' && (
        <Input type="number" value={p.eventYear} onChange={(e) => p.onEventYear(Number(e.target.value) || p.eventYear)} className="w-24 shrink-0" aria-label="年" />
      )}

      <Select value={p.sort} onValueChange={p.onSort}>
        <SelectTrigger className="w-full shrink-0 sm:w-56" aria-label="並び順"><SelectValue /></SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
        </SelectContent>
      </Select>

      <ChipButton active={p.aiOnly} onClick={() => p.onAiOnly(!p.aiOnly)} title="AI が作った案件だけを出す">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />AI作成のみ
      </ChipButton>
      {p.aiOnly && (
        <ChipButton active={p.aiUnreviewedOnly} onClick={() => p.onAiUnreviewedOnly(!p.aiUnreviewedOnly)}>
          {p.aiUnreviewedOnly ? '未確認のみ' : '確認済みも出す'}
        </ChipButton>
      )}
      <ChipButton active={p.termOpen} onClick={() => p.onTermOpen(!p.termOpen)} title="ネタ・ヨミ・GLS などの用語">
        <Info className="h-3.5 w-3.5" aria-hidden="true" />用語
      </ChipButton>

      {p.search && (
        <p className="text-sub-sm w-full text-muted-foreground">
          探しているあいだは実施日の絞り込みを外して、全期間から当てます
        </p>
      )}
    </div>
  );
}

/** 「用語」を押したときに出る説明 */
export function TermHint({ onClose }: { onClose: () => void }) {
  return (
    <div className="rounded-note border border-primary-border bg-primary-surface-weak px-3.5 py-3 text-note text-muted-foreground">
      <p><span className="font-bold text-foreground">ネタ</span> … 最初の見込み。まだ提案していない「案件のタネ」。</p>
      <p><span className="font-bold text-foreground">ヨミ</span> … GLS 発番前の見込み案件ぜんぶ (ネタ → 提案 → 口頭決定)。受注の確度を読む段階。</p>
      <p><span className="font-bold text-foreground">GLS 番号</span> … 受注が固まった案件に振る正式な番号 (GLS-A… / GLS-B…)。</p>
      <p><span className="font-bold text-foreground">おすすめ順</span> … ネタ → 提案中 (口頭決定 → 見積提案 → 仮押さえ) → 受注済 → 失注 の順。同じまとまりの中は実施日が近い順。</p>
      <p><span className="font-bold text-foreground">止まっている</span> … 案件・タスク・活動記録のどれも1週間動いていない。終わった案件には出しません。</p>
      <Button variant="outline" size="sm" className="mt-2" onClick={onClose}>閉じる</Button>
    </div>
  );
}
