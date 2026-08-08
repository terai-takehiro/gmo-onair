/**
 * 案件一覧の絞り込み — **スマホ版**（M6 → M8 で共通部品に載せ替え）
 *
 * ── なぜ作り直したか ────────────────────────────────────────
 *
 * PC の絞り込み帯をそのまま縦に畳むと、375px では
 * 検索 ＋ 期間5個 ＋ 並び順 ＋ トグル2個 が積み上がって **約 450px**。
 * ステージのチップと見出しを足すと、**最初の案件に着くまで約 470px**
 * ＝ 1画面の 7割が「まだ何も見えていない」状態でした（実測）。畳んで **258px**。
 *
 * ── 畳み方そのものは `client-v4/mobileFilterBar` に移した ────
 *
 * 同じ形を 受付・機材台帳・内覧会 にも広げたので、**枠は共通部品**に置きました。
 * ここに残っているのは**この画面固有のもの2つ**だけです:
 *
 *   1. `activeFilterCount()` — 何を「既定」と見なすか
 *   2. シートの中身（実施日・並び順・AI・用語）
 *
 * **数え方を共通部品に持たせていない**のが要点です。既定は画面ごとに違う
 * （案件一覧は「半年・既定の並び」、機材台帳は「絞り込みなし」）ので、
 * 共通側に置くと必ずどちらかが嘘になります。
 */
import { Sparkles, Info } from 'lucide-react';
import {
  MobileFilterBar as Bar, MobileFilterField as Field, MobileFilterSegments as Segments,
} from '@gmo-onair/shared/src/client-v4/mobileFilterBar';
import { Input } from '@/components/ui/input';
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

export function MobileFilterBar(p: FilterBarProps) {
  const clearAll = () => {
    p.onEventMode('half');
    p.onSort('default:asc');
    p.onAiOnly(false);
    p.onAiUnreviewedOnly(false);
  };

  return (
    <Bar
      search={{
        value: p.search,
        onChange: p.onSearch,
        placeholder: '案件名・お客様名で探す',
        label: '案件を探す',
      }}
      activeCount={activeFilterCount(p)}
      onClearAll={clearAll}
      /* **検索中は期間が効かないことを、その場に書く**（探したのに出ない、を防ぐ） */
      note={p.search ? '探しているあいだは実施日の絞り込みを外して、全期間から当てます' : undefined}
    >
      <Field
        label="実施日"
        hint={p.eventMode === 'all' ? '全部の案件を出します。件数が多いと読み込みに少しかかります' : undefined}
      >
        <Segments label="実施日で絞り込む" items={PERIOD_MODES} value={p.eventMode} onChange={p.onEventMode} />
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
        onClick={() => p.onTermOpen(!p.termOpen)}
        className="min-h-tap flex w-full items-center gap-1.5 text-sub text-primary"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
        ネタ・ヨミ・GLS などの言葉の意味
      </button>
    </Bar>
  );
}
