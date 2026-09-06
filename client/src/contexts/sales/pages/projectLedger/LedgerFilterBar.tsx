/**
 * 案件台帳の絞り込みの帯（検索・ステージ・分類・事業主体・出す列・CSV）
 *
 * `ProjectLedgerPage` から切り出した（1ファイル 400 行の決めごと）。**状態は持たない** —
 * 絞り込みの値と決め方は `useLedgerState` / `filters.ts` にあり、ここは並べて押すだけ。
 *
 * 事業主体（`entity`）は案件の持ち物（`projects.entity`・お客様の区分から自動で決まり、
 * 人格だけ手で付ける）。**サーバーの `GET /projects?entity=` で絞る** — 画面で絞ると
 * そのページの 100 件の中だけになり、全体で何件かが分からない（整合性チェックと同じ理由）。
 */
import { Columns3, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BUSINESS_ENTITY_LABELS } from '@gmo-onair/shared/src/keepReport/types';
import { BUSINESS_ENTITIES } from '@/lib/keepApi';
import { ProjectStageLabels, type ProjectStage } from '@/types';
import type { LedgerState } from './useLedgerState';
import type { ColumnPrefs } from './useColumnPrefs';
import type { useLedgerCsv } from './useLedgerCsv';

const STAGE_OPTIONS: ProjectStage[] = [
  'neta', 'd_hold', 'c_proposal', 'b_verbal', 'a_won', 'r_delivered', 's_completed', 'e_lost',
];

export function LedgerFilterBar({ s, prefs, csv, isMobile, onOpenColumns }: {
  s: LedgerState;
  prefs: ColumnPrefs;
  csv: ReturnType<typeof useLedgerCsv>;
  isMobile: boolean;
  onOpenColumns: () => void;
}) {
  return (
    <div className="rounded-card flex flex-wrap items-center gap-2.5 border border-border bg-card px-3.5 py-3">
      <Input
        className="h-10 w-[260px]"
        value={s.filters.search}
        onChange={(e) => s.setFilter('search', e.target.value)}
        placeholder="案件名・GLS番号・お客様で検索"
        aria-label="案件を検索"
      />
      <Select value={s.filters.stage || 'all'} onValueChange={(v) => s.setFilter('stage', v === 'all' ? '' : v)}>
        <SelectTrigger className="h-10 w-[160px]" aria-label="ステージで絞り込む"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">ステージ：すべて</SelectItem>
          {STAGE_OPTIONS.map((st) => (
            <SelectItem key={st} value={st}>{ProjectStageLabels[st]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={s.filters.source === 'kessan' ? 'kessan' : (s.filters.glsCategory || 'all')} onValueChange={(v) => s.pickCategory(v as 'A' | 'B' | 'kessan' | 'all')}>
        <SelectTrigger className="h-10 w-[200px]" aria-label="分類で絞り込む"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="A">GLS-A</SelectItem>
          <SelectItem value="B">GLS-B</SelectItem>
          <SelectItem value="kessan">旧GLS（決算取込）</SelectItem>
          <SelectItem value="all">どちらも</SelectItem>
        </SelectContent>
      </Select>
      {/* 事業主体。表示名は `shared` の1表（案件詳細・隔週キープと同じ言い方） */}
      <Select value={s.filters.entity || 'all'} onValueChange={(v) => s.setFilter('entity', v === 'all' ? '' : v)}>
        <SelectTrigger className="h-10 w-[240px]" aria-label="事業主体で絞り込む"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">事業主体：すべて</SelectItem>
          {BUSINESS_ENTITIES.map((e) => (
            <SelectItem key={e} value={e}>{BUSINESS_ENTITY_LABELS[e]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="flex-1" />
      {/* **スマホでは出さない。** カードは既定表示9列の決め打ちで `prefs.shown` を見ないので、開いても効かない */}
      {!isMobile && (
        <Button variant="outline" onClick={onOpenColumns}>
          <Columns3 className="mr-2 h-4 w-4" aria-hidden="true" />出す列（{prefs.shown.length}）
        </Button>
      )}
      {/* **書き出すのは絞り込み全体**（並んでいる行だけだと101件目から黙って落ちる・`ledgerCsv.ts`）。
          3つ目に渡すのはファイル名に入れる絞り込みで、**日本語ではなく鍵**（`csv.ts`） */}
      <Button
        variant="outline"
        disabled={csv.busy || s.total === 0}
        onClick={() => csv.download(s.params, prefs.shown, s.filters.issue || null)}
      >
        {csv.busy
          ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          : <Download className="mr-2 h-4 w-4" aria-hidden="true" />}
        CSV で書き出す
      </Button>
    </div>
  );
}
